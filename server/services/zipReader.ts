/**
 * Leitor de ZIP (sem dependências): lista o conteúdo e extrai um item por vez.
 * Também é a base para ler .xlsx e .docx, que são pacotes ZIP com XML dentro.
 *
 * Suporta: itens guardados (sem compressão) e "deflate" (o padrão do Windows, 7-Zip, WinRAR em modo ZIP),
 * ZIP64 (arquivos e pacotes acima de 4 GB) e nomes com acento (UTF-8 ou a página de código do Windows em português).
 * Proteções: limite de itens, limite de tamanho descompactado e conferência do tamanho real durante a extração
 * (contra "zip bomb").
 */
import fs from 'fs';
import zlib from 'zlib';

export type ZipEntry = {
  name: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  method: number;
  encrypted: boolean;
  modifiedAt: string | null;
  localHeaderOffset: number;
};

export class ZipError extends Error {
  constructor(message: string, public code = 'ZIP_ERROR') {
    super(message);
  }
}

// Página de código 850 (Windows em português, para ZIPs sem a marca de UTF-8)
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

function decodeName(buf: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return buf.toString('utf8');
  // Muitos programas gravam UTF-8 sem marcar; se for UTF-8 válido, usa
  const asUtf8 = buf.toString('utf8');
  if (!asUtf8.includes('�') && /[^\x00-\x7f]/.test(asUtf8)) return asUtf8;
  let out = '';
  for (const b of buf) out += b < 128 ? String.fromCharCode(b) : CP850[b - 128];
  return out;
}

function dosDate(time: number, date: number): string | null {
  if (!date) return null;
  const d = new Date(
    ((date >> 9) & 0x7f) + 1980,
    ((date >> 5) & 0x0f) - 1,
    date & 0x1f,
    (time >> 11) & 0x1f,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function readAt(fh: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return bytesRead === length ? buf : buf.subarray(0, bytesRead);
}

/** Lê a lista de itens do ZIP (diretório central). */
export async function listZip(filePath: string, maxEntries = 20000): Promise<{ entries: ZipEntry[]; truncated: boolean }> {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size < 22) throw new ZipError('O arquivo não é um ZIP válido.');
    // Fim do diretório central: nos últimos 64 KB (+22 bytes)
    const tailLen = Math.min(size, 65557);
    const tail = await readAt(fh, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError('O arquivo não é um ZIP válido (ou está incompleto).');
    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);

    // ZIP64
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const locPos = eocd - 20;
      if (locPos >= 0 && tail.readUInt32LE(locPos) === 0x07064b50) {
        const z64Offset = Number(tail.readBigUInt64LE(locPos + 8));
        const z64 = await readAt(fh, z64Offset, 56);
        if (z64.readUInt32LE(0) !== 0x06064b50) throw new ZipError('ZIP64 inválido.');
        count = Number(z64.readBigUInt64LE(32));
        cdSize = Number(z64.readBigUInt64LE(40));
        cdOffset = Number(z64.readBigUInt64LE(48));
      }
    }
    if (cdOffset + cdSize > size) throw new ZipError('O ZIP está incompleto ou corrompido.');
    if (cdSize > 256 * 1024 * 1024) throw new ZipError('Lista de itens grande demais para visualizar.');

    const cd = await readAt(fh, cdOffset, cdSize);
    const entries: ZipEntry[] = [];
    let p = 0;
    let truncated = false;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const time = cd.readUInt16LE(p + 12);
      const date = cd.readUInt16LE(p + 14);
      let compressedSize = cd.readUInt32LE(p + 20);
      let uncompressedSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const externalAttrs = cd.readUInt32LE(p + 38);
      let localHeaderOffset = cd.readUInt32LE(p + 42);
      const nameBuf = cd.subarray(p + 46, p + 46 + nameLen);
      const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);

      // Campo extra ZIP64 (tamanhos/posição acima de 4 GB)
      for (let e = 0; e + 4 <= extra.length; ) {
        const id = extra.readUInt16LE(e);
        const len = extra.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === 0xffffffff && q + 8 <= e + 4 + len) {
            uncompressedSize = Number(extra.readBigUInt64LE(q));
            q += 8;
          }
          if (compressedSize === 0xffffffff && q + 8 <= e + 4 + len) {
            compressedSize = Number(extra.readBigUInt64LE(q));
            q += 8;
          }
          if (localHeaderOffset === 0xffffffff && q + 8 <= e + 4 + len) {
            localHeaderOffset = Number(extra.readBigUInt64LE(q));
          }
        }
        e += 4 + len;
      }

      const name = decodeName(nameBuf, Boolean(flags & 0x800)).replace(/\\/g, '/');
      const isDir = name.endsWith('/') || Boolean(externalAttrs & 0x10);
      entries.push({
        name,
        isDir,
        size: uncompressedSize,
        compressedSize,
        method,
        encrypted: Boolean(flags & 0x1),
        modifiedAt: dosDate(time, date),
        localHeaderOffset,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, truncated };
  } finally {
    await fh.close();
  }
}

/** Nome de item seguro (sem "..", sem caminho absoluto) */
export function isSafeEntryName(name: string): boolean {
  return Boolean(name) && !name.startsWith('/') && !/^[a-zA-Z]:/.test(name) && !name.split('/').includes('..');
}

/**
 * Extrai um item. Devolve o conteúdo em memória (para itens pequenos, ex.: XML do Office)
 * ou grava num arquivo (destPath) para itens grandes.
 */
export async function extractZipEntry(
  filePath: string,
  entry: ZipEntry,
  opts: { maxBytes: number; destPath?: string }
): Promise<Buffer | null> {
  if (entry.isDir) throw new ZipError('É uma pasta.');
  if (entry.encrypted) throw new ZipError('Este item está protegido por senha.', 'ZIP_ENCRYPTED');
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipError('Este item usa um tipo de compressão que não pode ser aberto no navegador. Baixe o arquivo.', 'ZIP_METHOD');
  }
  if (entry.size > opts.maxBytes) throw new ZipError('Item grande demais para visualizar. Baixe o arquivo.', 'ZIP_TOO_LARGE');
  // Proporção absurda entre compactado e real = zip bomb
  if (entry.compressedSize > 0 && entry.size / entry.compressedSize > 2000 && entry.size > 50 * 1024 * 1024) {
    throw new ZipError('Este item parece malicioso (compressão anormal) e não será aberto.', 'ZIP_BOMB');
  }

  const fh = await fs.promises.open(filePath, 'r');
  let dataStart: number;
  try {
    const lh = await readAt(fh, entry.localHeaderOffset, 30);
    if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new ZipError('Item corrompido dentro do ZIP.');
    dataStart = entry.localHeaderOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally {
    await fh.close();
  }
  if (entry.compressedSize === 0) {
    if (opts.destPath) fs.writeFileSync(opts.destPath, Buffer.alloc(0), { mode: 0o600 });
    return opts.destPath ? null : Buffer.alloc(0);
  }

  const source = fs.createReadStream(filePath, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
  const inflater = entry.method === 8 ? zlib.createInflateRaw() : null;
  let produced = 0;
  const chunks: Buffer[] = [];
  const out = opts.destPath ? fs.createWriteStream(opts.destPath, { mode: 0o600 }) : null;

  await new Promise<void>((resolve, reject) => {
    const stream = inflater ? source.pipe(inflater) : source;
    const fail = (err: any) => {
      source.destroy();
      inflater?.destroy();
      out?.destroy();
      reject(err instanceof ZipError ? err : new ZipError('Não foi possível descompactar este item (arquivo danificado?).'));
    };
    source.on('error', fail);
    inflater?.on('error', fail);
    out?.on('error', fail);
    stream.on('data', (chunk: Buffer) => {
      produced += chunk.length;
      // O tamanho real passou do declarado ou do limite: para na hora
      if (produced > opts.maxBytes || produced > entry.size + 1024) {
        fail(new ZipError('Item maior que o permitido para visualizar.', 'ZIP_TOO_LARGE'));
        return;
      }
      if (out) {
        if (!out.write(chunk)) {
          stream.pause();
          out.once('drain', () => stream.resume());
        }
      } else chunks.push(chunk);
    });
    stream.on('end', () => {
      if (out) out.end(() => resolve());
      else resolve();
    });
  });
  return out ? null : Buffer.concat(chunks);
}

/** Atalho: lê um item pelo nome (para os XML de .xlsx/.docx) */
export async function readZipText(filePath: string, entries: ZipEntry[], name: string, maxBytes = 64 * 1024 * 1024): Promise<string | null> {
  const entry = entries.find((e) => e.name === name) || entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (!entry) return null;
  const buf = await extractZipEntry(filePath, entry, { maxBytes });
  return buf ? buf.toString('utf8') : null;
}
