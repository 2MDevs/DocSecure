/**
 * Gerador de .zip em streaming, sem biblioteca externa (o registro npm não está disponível na VPS).
 *
 * - Escreve direto na resposta HTTP, um arquivo de cada vez, sem guardar nada inteiro na memória:
 *   aguenta pastas grandes (vários GB) sem estourar o servidor.
 * - Usa ZIP64: suporta arquivos e pacotes com mais de 4 GB e mais de 65.535 itens.
 * - Compacta com DEFLATE (o mesmo do .zip comum); arquivos já compactados (jpg, pdf, zip…) entram
 *   sem recompactar, para não desperdiçar CPU.
 *
 * Abre no Windows, no macOS e no Linux sem programa extra.
 */
import { Writable } from 'stream';
import zlib from 'zlib';

// Tabela de CRC-32 (padrão do .zip)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Update(crc: number, buf: Buffer): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Extensões já compactadas: entram no .zip sem recompactar (método "store"). */
const STORE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz',
  'pdf', 'mp3', 'aac', 'ogg', 'm4a', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp',
]);

const DOS_TIME = 0; // horário neutro (não expõe horário real)
const DOS_DATE = 0x21; // 1980-01-01 (data neutra e válida)

type CentralEntry = {
  nameBuf: Buffer;
  crc: number;
  compSize: number;
  size: number;
  offset: number;
  method: number;
  utf8: boolean;
};

const writeTo = (out: Writable, buf: Buffer) =>
  new Promise<void>((resolve, reject) => {
    out.write(buf, (err) => (err ? reject(err) : resolve()));
  });

/** Nome seguro dentro do .zip: sem barra inicial, sem "..", separador "/". */
export function safeZipName(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');
}

export class ZipStream {
  private offset = 0;
  private central: CentralEntry[] = [];

  constructor(private out: Writable) {}

  /** Adiciona um arquivo ao .zip a partir de um stream de leitura. */
  async addFile(name: string, source: NodeJS.ReadableStream, ext = ''): Promise<void> {
    const cleanName = safeZipName(name) || 'arquivo';
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const store = STORE_EXT.has(ext.toLowerCase());
    const method = store ? 0 : 8;
    const offset = this.offset;

    // Cabeçalho local: tamanhos vão no "data descriptor" (bit 3), que suporta ZIP64 (8 bytes)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(45, 4); // versão mínima: ZIP64
    local.writeUInt16LE(0x0008 | 0x0800, 6); // bit 3 (descriptor) + bit 11 (nome UTF-8)
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(0, 14); // crc (no descriptor)
    local.writeUInt32LE(0, 18); // comp size (no descriptor)
    local.writeUInt32LE(0, 22); // size (no descriptor)
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    await writeTo(this.out, local);
    await writeTo(this.out, nameBuf);
    this.offset += local.length + nameBuf.length;

    let crc = 0;
    let size = 0;
    let compSize = 0;
    const deflate = store ? null : zlib.createDeflateRaw({ level: 6 });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: any) => {
        source.destroy?.();
        deflate?.destroy();
        reject(err);
      };
      source.on('error', onError);

      const emit = (chunk: Buffer) => {
        compSize += chunk.length;
        this.offset += chunk.length;
        if (!this.out.write(chunk)) {
          (deflate || (source as any)).pause?.();
          this.out.once('drain', () => (deflate || (source as any)).resume?.());
        }
      };

      source.on('data', (raw: Buffer) => {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        crc = crc32Update(crc, buf);
        size += buf.length;
        if (deflate) {
          if (!deflate.write(buf)) {
            (source as any).pause?.();
            deflate.once('drain', () => (source as any).resume?.());
          }
        } else {
          emit(buf);
        }
      });

      if (deflate) {
        deflate.on('data', emit);
        deflate.on('error', onError);
        source.on('end', () => deflate.end());
        deflate.on('end', resolve);
      } else {
        source.on('end', resolve);
      }
    });

    // Data descriptor em ZIP64 (crc + comp size 8 bytes + size 8 bytes)
    const desc = Buffer.alloc(24);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeBigUInt64LE(BigInt(compSize), 8);
    desc.writeBigUInt64LE(BigInt(size), 16);
    await writeTo(this.out, desc);
    this.offset += desc.length;

    this.central.push({ nameBuf, crc, compSize, size, offset, method, utf8: true });
  }

  /** Fecha o .zip: escreve o diretório central e o fim (EOCD), com ZIP64. */
  async finish(): Promise<void> {
    const cdStart = this.offset;
    for (const e of this.central) {
      const needZip64 = e.size >= 0xffffffff || e.compSize >= 0xffffffff || e.offset >= 0xffffffff;
      const extra = needZip64 ? this.zip64Extra(e) : Buffer.alloc(0);
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(45, 4); // versão de quem criou
      h.writeUInt16LE(45, 6); // versão mínima
      h.writeUInt16LE(0x0008 | 0x0800, 8);
      h.writeUInt16LE(e.method, 10);
      h.writeUInt16LE(DOS_TIME, 12);
      h.writeUInt16LE(DOS_DATE, 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(needZip64 ? 0xffffffff : e.compSize, 20);
      h.writeUInt32LE(needZip64 ? 0xffffffff : e.size, 24);
      h.writeUInt16LE(e.nameBuf.length, 28);
      h.writeUInt16LE(extra.length, 30);
      h.writeUInt16LE(0, 32); // comentário
      h.writeUInt16LE(0, 34); // disco
      h.writeUInt16LE(0, 36); // atributos internos
      h.writeUInt32LE(0, 38); // atributos externos
      h.writeUInt32LE(needZip64 ? 0xffffffff : e.offset, 42);
      await writeTo(this.out, h);
      await writeTo(this.out, e.nameBuf);
      if (extra.length) await writeTo(this.out, extra);
      this.offset += h.length + e.nameBuf.length + extra.length;
    }
    const cdSize = this.offset - cdStart;

    // ZIP64 end of central directory + locator (sempre: simples e seguro)
    const z64 = Buffer.alloc(56);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(44n, 4); // tamanho deste registro - 12
    z64.writeUInt16LE(45, 12);
    z64.writeUInt16LE(45, 14);
    z64.writeUInt32LE(0, 16);
    z64.writeUInt32LE(0, 20);
    z64.writeBigUInt64LE(BigInt(this.central.length), 24);
    z64.writeBigUInt64LE(BigInt(this.central.length), 32);
    z64.writeBigUInt64LE(BigInt(cdSize), 40);
    z64.writeBigUInt64LE(BigInt(cdStart), 48);
    await writeTo(this.out, z64);

    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeUInt32LE(0, 4);
    loc.writeBigUInt64LE(BigInt(this.offset), 8); // posição do ZIP64 EOCD
    loc.writeUInt32LE(1, 16);
    await writeTo(this.out, loc);

    const count = Math.min(this.central.length, 0xffff);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(count, 8);
    eocd.writeUInt16LE(count, 10);
    eocd.writeUInt32LE(cdSize >= 0xffffffff ? 0xffffffff : cdSize, 12);
    eocd.writeUInt32LE(cdStart >= 0xffffffff ? 0xffffffff : cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    await writeTo(this.out, eocd);

    await new Promise<void>((resolve) => this.out.end(resolve));
  }

  private zip64Extra(e: CentralEntry): Buffer {
    const b = Buffer.alloc(32);
    b.writeUInt16LE(0x0001, 0);
    b.writeUInt16LE(28, 2);
    b.writeBigUInt64LE(BigInt(e.size), 4);
    b.writeBigUInt64LE(BigInt(e.compSize), 12);
    b.writeBigUInt64LE(BigInt(e.offset), 20);
    b.writeUInt32LE(0, 28); // disco
    return b;
  }
}
