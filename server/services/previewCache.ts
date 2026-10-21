/**
 * Cópias temporárias para a pré-visualização.
 *
 * Para listar um .zip/.rar ou montar uma planilha/documento, o servidor precisa do arquivo
 * descriptografado no disco. A cópia fica na pasta temporária (só o DocSecure lê), é reaproveitada
 * por alguns minutos enquanto a pessoa navega e depois é apagada sozinha.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { UPLOAD_TMP_DIR, ensureStorageDirs, decryptToFile } from './fileStorage';
import { listZip, extractZipEntry, isSafeEntryName } from './zipReader';
import { listRar, extractRarEntry } from './rarReader';
import { convertToPdf } from './officeEngine';

const PREFIX = 'preview-';
const TTL_MS = 15 * 60 * 1000;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024; // no máximo 4 GB de cópias ao mesmo tempo
/** Maior item de dentro de um compactado que abre na pré-visualização */
export const MAX_INNER_BYTES = 300 * 1024 * 1024;

type Entry = { path: string; at: number; size: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<string>>();

const keyFile = (key: string) => path.join(UPLOAD_TMP_DIR, PREFIX + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32));

function evict() {
  const now = Date.now();
  for (const [k, e] of cache) {
    if (now - e.at > TTL_MS) {
      cache.delete(k);
      try {
        fs.unlinkSync(e.path);
      } catch {}
    }
  }
  let total = [...cache.values()].reduce((s, e) => s + e.size, 0);
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  while (total > MAX_TOTAL_BYTES && oldest.length) {
    const [k, e] = oldest.shift()!;
    cache.delete(k);
    total -= e.size;
    try {
      fs.unlinkSync(e.path);
    } catch {}
  }
}

async function cached(key: string, build: (dest: string) => Promise<void>): Promise<string> {
  const hit = cache.get(key);
  if (hit && fs.existsSync(hit.path)) {
    hit.at = Date.now();
    return hit.path;
  }
  const running = pending.get(key);
  if (running) return running;
  const job = (async () => {
    ensureStorageDirs();
    const dest = keyFile(key);
    const partial = dest + '.part';
    try {
      await build(partial);
      fs.renameSync(partial, dest);
    } catch (err) {
      try {
        fs.unlinkSync(partial);
      } catch {}
      throw err;
    }
    cache.set(key, { path: dest, at: Date.now(), size: fs.statSync(dest).size });
    evict();
    return dest;
  })();
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

type DocRow = { id: string; storage_path: string; hash_sha256: string; extension: string };

/** Cópia descriptografada do documento (o hash entra na chave: uma nova versão gera outra cópia) */
export function decryptedCopy(doc: DocRow): Promise<string> {
  return cached(`doc:${doc.id}:${doc.hash_sha256}`, (dest) => decryptToFile(doc.storage_path, dest));
}

export type ArchiveItem = { path: string; isDir: boolean; size: number; compressedSize: number; encrypted: boolean; modifiedAt: string | null };

export function archiveFormat(ext: string): 'zip' | 'rar' | null {
  const e = ext.toLowerCase();
  if (e === 'zip') return 'zip';
  if (e === 'rar') return 'rar';
  return null;
}

/** Lista o conteúdo de um .zip/.rar */
export async function listArchive(doc: DocRow): Promise<{ format: 'zip' | 'rar'; items: ArchiveItem[]; truncated: boolean }> {
  const format = archiveFormat(doc.extension);
  if (!format) throw new Error('Formato de arquivo compactado não suportado.');
  const file = await decryptedCopy(doc);
  const { entries, truncated } = format === 'zip' ? await listZip(file) : await listRar(file);
  const items = entries
    .filter((e) => isSafeEntryName(e.name.replace(/\/$/, '')) && !/^__MACOSX\//.test(e.name) && !/(^|\/)\.DS_Store$/.test(e.name))
    .map((e) => ({
      path: e.name.replace(/\/$/, ''),
      isDir: e.isDir,
      size: e.size,
      compressedSize: e.compressedSize,
      encrypted: e.encrypted,
      modifiedAt: e.modifiedAt,
    }));
  return { format, items, truncated };
}

/** Extrai (com cache) um item de dentro do .zip/.rar e devolve o caminho do arquivo temporário */
export async function archiveItemFile(doc: DocRow, innerPath: string): Promise<{ file: string; size: number; name: string }> {
  const format = archiveFormat(doc.extension);
  if (!format) throw new Error('Formato de arquivo compactado não suportado.');
  if (!isSafeEntryName(innerPath)) throw new Error('Item inválido.');
  const archive = await decryptedCopy(doc);
  const file = await cached(`item:${doc.id}:${doc.hash_sha256}:${innerPath}`, async (dest) => {
    if (format === 'zip') {
      const { entries } = await listZip(archive);
      const entry = entries.find((e) => !e.isDir && e.name === innerPath);
      if (!entry) throw new Error('Item não encontrado dentro do arquivo compactado.');
      await extractZipEntry(archive, entry, { maxBytes: MAX_INNER_BYTES, destPath: dest });
    } else {
      const { entries } = await listRar(archive);
      const entry = entries.find((e) => !e.isDir && e.name === innerPath);
      if (!entry) throw new Error('Item não encontrado dentro do arquivo compactado.');
      await extractRarEntry(archive, entry, { maxBytes: MAX_INNER_BYTES, destPath: dest });
    }
  });
  return { file, size: fs.statSync(file).size, name: innerPath.split('/').pop() || 'arquivo' };
}

/** PDF gerado pelo LibreOffice (visualização completa), guardado por alguns minutos */
export async function officePdf(doc: DocRow, inner?: string): Promise<string> {
  const source = inner ? (await archiveItemFile(doc, inner)).file : await decryptedCopy(doc);
  const ext = (inner ? inner.split('.').pop() : doc.extension) || '';
  return cached(`pdf:${doc.id}:${doc.hash_sha256}:${inner || ''}`, (dest) => convertToPdf(source, ext.toLowerCase(), dest));
}

/** Cópias em uso (a limpeza de sobras não pode apagar) */
export function activePreviewFiles(): string[] {
  return [...cache.values()].map((e) => e.path);
}

export function startPreviewCacheCleanup() {
  // Cópias que sobraram de antes de reiniciar o servidor
  try {
    for (const name of fs.readdirSync(UPLOAD_TMP_DIR)) {
      if (name.startsWith(PREFIX)) {
        try {
          fs.unlinkSync(path.join(UPLOAD_TMP_DIR, name));
        } catch {}
      }
    }
  } catch {}
  setInterval(evict, 60 * 1000).unref();
}
