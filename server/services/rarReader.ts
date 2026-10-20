/**
 * Leitura de arquivos .rar (lista e extração de um item) com o node-unrar-js:
 * a biblioteca oficial do UnRAR compilada para JavaScript (sem programa extra no servidor).
 *
 * A biblioteca trabalha com um extrator por vez, então as operações entram numa fila.
 */
import fs from 'fs';
import path from 'path';

export type RarEntry = {
  name: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  encrypted: boolean;
  modifiedAt: string | null;
};

export class RarError extends Error {
  constructor(message: string, public code = 'RAR_ERROR') {
    super(message);
  }
}

let unrarModule: any = null;
async function loadUnrar() {
  if (unrarModule) return unrarModule;
  try {
    const mod: any = await import('node-unrar-js');
    unrarModule = mod?.createExtractorFromFile ? mod : mod?.default;
    if (!unrarModule?.createExtractorFromFile) throw new Error('API inesperada');
    return unrarModule;
  } catch (err: any) {
    console.error('[RAR] node-unrar-js indisponível:', err?.message || err);
    throw new RarError('A visualização de arquivos .rar não está disponível no servidor (falta instalar a dependência node-unrar-js).', 'RAR_UNAVAILABLE');
  }
}

// Fila: uma operação de RAR por vez
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

function friendly(err: any): RarError {
  if (err instanceof RarError) return err;
  const reason = String(err?.reason || '');
  if (reason === 'ERAR_MISSING_PASSWORD' || reason === 'ERAR_BAD_PASSWORD') {
    return new RarError('Este arquivo .rar (ou item) está protegido por senha.', 'RAR_ENCRYPTED');
  }
  if (reason === 'ERAR_BAD_ARCHIVE' || reason === 'ERAR_UNKNOWN_FORMAT') return new RarError('O arquivo não é um .rar válido.');
  if (reason === 'ERAR_BAD_DATA') return new RarError('O arquivo .rar está danificado.');
  if (reason === 'ERAR_NO_MEMORY') return new RarError('Arquivo .rar grande demais para abrir no navegador. Baixe o arquivo.');
  return new RarError('Não foi possível ler o arquivo .rar.');
}

export function listRar(filePath: string, maxEntries = 20000): Promise<{ entries: RarEntry[]; truncated: boolean }> {
  return serial(async () => {
    const unrar = await loadUnrar();
    try {
      const extractor = await unrar.createExtractorFromFile({ filepath: filePath });
      const list = extractor.getFileList();
      if (list.arcHeader?.flags?.headerEncrypted) throw new RarError('Este arquivo .rar está protegido por senha.', 'RAR_ENCRYPTED');
      const entries: RarEntry[] = [];
      let truncated = false;
      // O iterador precisa ser percorrido até o fim (senão a biblioteca não libera a memória)
      for (const h of list.fileHeaders as Iterable<any>) {
        if (entries.length >= maxEntries) {
          truncated = true;
          continue;
        }
        const time = h.time ? new Date(h.time) : null;
        entries.push({
          name: String(h.name || '').replace(/\\/g, '/'),
          isDir: Boolean(h.flags?.directory),
          size: Number(h.unpSize) || 0,
          compressedSize: Number(h.packSize) || 0,
          encrypted: Boolean(h.flags?.encrypted),
          modifiedAt: time && !Number.isNaN(time.getTime()) ? time.toISOString() : null,
        });
      }
      return { entries, truncated };
    } catch (err) {
      throw friendly(err);
    }
  });
}

/** Extrai um item do .rar para destPath (o nome original não é usado no disco). */
export function extractRarEntry(filePath: string, entry: RarEntry, opts: { maxBytes: number; destPath: string }): Promise<void> {
  if (entry.isDir) return Promise.reject(new RarError('É uma pasta.'));
  if (entry.encrypted) return Promise.reject(new RarError('Este item está protegido por senha.', 'RAR_ENCRYPTED'));
  if (entry.size > opts.maxBytes) return Promise.reject(new RarError('Item grande demais para visualizar. Baixe o arquivo.', 'RAR_TOO_LARGE'));
  return serial(async () => {
    const unrar = await loadUnrar();
    const workDir = fs.mkdtempSync(path.join(path.dirname(opts.destPath), 'rar-'));
    try {
      const extractor = await unrar.createExtractorFromFile({
        filepath: filePath,
        targetPath: workDir,
        // grava sempre com um nome fixo dentro da pasta temporária (nunca usa o caminho que vem do .rar)
        filenameTransform: () => 'item',
      });
      const result = extractor.extract({ files: [entry.name] });
      let found = false;
      for (const f of result.files as Iterable<any>) {
        if (!f.fileHeader?.flags?.directory) found = true;
      }
      const out = path.join(workDir, 'item');
      if (!found || !fs.existsSync(out)) throw new RarError('Item não encontrado dentro do .rar.');
      if (fs.statSync(out).size > opts.maxBytes) throw new RarError('Item grande demais para visualizar.', 'RAR_TOO_LARGE');
      fs.renameSync(out, opts.destPath);
    } catch (err) {
      throw friendly(err);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
}
