import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import type { Response } from 'express';
import { getEncryptionKey } from './systemSettings';

/**
 * Armazenamento físico dos documentos.
 *
 * - Cada arquivo é gravado CRIPTOGRAFADO (AES-256-GCM) em disco, com chave derivada
 *   da SETTINGS_ENCRYPTION_KEY via HKDF. Sem a chave, os arquivos são ilegíveis.
 * - O nome no disco é o ID aleatório do documento (o nome original fica só no banco).
 * - Formato do arquivo: "DSF1" (4 bytes) | IV (12 bytes) | conteúdo cifrado | tag GCM (16 bytes)
 * - Pasta separada por setor: <FILES_DIR>/<setor>/<documento>.enc
 */

const MAGIC = Buffer.from('DSF1');
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN;

export const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(process.cwd(), 'storage', 'files'));
export const UPLOAD_TMP_DIR = path.resolve(process.env.UPLOAD_TMP_DIR || path.join(process.cwd(), 'storage', 'tmp'));

export class StorageKeyError extends Error {}

function getFileKey(): Buffer {
  const master = getEncryptionKey();
  if (!master) {
    throw new StorageKeyError(
      'Armazenamento seguro indisponível: SETTINGS_ENCRYPTION_KEY não configurada no servidor. Os arquivos não podem ser gravados sem criptografia.'
    );
  }
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from('docsecure-files-v1'), 32));
}

export function isFileStorageReady(): boolean {
  return getEncryptionKey() !== null;
}

function safeSegment(value: string): string {
  const clean = String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!clean || clean === '.' || clean === '..') throw new Error('Identificador inválido para armazenamento.');
  return clean;
}

/** Converte o caminho relativo salvo no banco em caminho absoluto, impedindo sair de FILES_DIR. */
function resolveStoragePath(relativePath: string): string {
  const abs = path.resolve(FILES_DIR, relativePath);
  if (!abs.startsWith(FILES_DIR + path.sep)) {
    throw new Error('Caminho de armazenamento inválido.');
  }
  return abs;
}

export function ensureStorageDirs() {
  fs.mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Criptografa um arquivo temporário (vindo do upload) para o armazenamento definitivo.
 * Retorna o caminho relativo e o SHA-256 do conteúdo ORIGINAL.
 */
export async function storeEncryptedFromTemp(
  tempPath: string,
  departmentId: string,
  documentId: string
): Promise<{ storagePath: string; sha256: string }> {
  const key = getFileKey();
  const relative = path.join(safeSegment(departmentId), `${safeSegment(documentId)}.enc`);
  const finalPath = resolveStoragePath(relative);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 });

  const partialPath = `${finalPath}.partial`;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const hash = crypto.createHash('sha256');

  const hasher = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  const out = fs.createWriteStream(partialPath, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));

  try {
    // Lê o temporário → calcula SHA-256 → cifra → grava (sem fechar, para anexar a tag no final)
    await new Promise<void>((resolve, reject) => {
      const src = fs.createReadStream(tempPath);
      const fail = (err: any) => reject(err);
      src.on('error', fail);
      hasher.on('error', fail);
      cipher.on('error', fail);
      out.on('error', fail);
      cipher.on('end', () => resolve());
      src.pipe(hasher).pipe(cipher);
      cipher.pipe(out, { end: false });
    });
    await new Promise<void>((resolve, reject) => {
      out.end(cipher.getAuthTag(), (err?: any) => (err ? reject(err) : resolve()));
    });
    fs.renameSync(partialPath, finalPath);
  } catch (err) {
    out.destroy();
    try {
      fs.unlinkSync(partialPath);
    } catch {}
    throw err;
  }
  return { storagePath: relative, sha256: hash.digest('hex') };
}

/** Envia o conteúdo descriptografado diretamente para a resposta HTTP. */
export async function streamDecryptedTo(storagePath: string, res: Response): Promise<void> {
  const key = getFileKey();
  const abs = resolveStoragePath(storagePath);
  const stat = fs.statSync(abs);
  if (stat.size < HEADER_LEN + TAG_LEN) throw new Error('Arquivo armazenado corrompido.');

  const fd = fs.openSync(abs, 'r');
  const header = Buffer.alloc(HEADER_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    fs.readSync(fd, header, 0, HEADER_LEN, 0);
    fs.readSync(fd, tag, 0, TAG_LEN, stat.size - TAG_LEN);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Formato de arquivo armazenado desconhecido.');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);

  await pipeline(
    fs.createReadStream(abs, { start: HEADER_LEN, end: stat.size - TAG_LEN - 1 }),
    decipher,
    res
  );
}

/** Remove o arquivo do disco de forma definitiva (sobrescreve com dados aleatórios antes de apagar). */
export function deleteStoredFile(storagePath: string | null | undefined) {
  if (!storagePath) return;
  let abs: string;
  try {
    abs = resolveStoragePath(storagePath);
  } catch {
    return;
  }
  try {
    const { size } = fs.statSync(abs);
    const fd = fs.openSync(abs, 'r+');
    try {
      const chunk = 1024 * 1024;
      for (let pos = 0; pos < size; pos += chunk) {
        fs.writeSync(fd, crypto.randomBytes(Math.min(chunk, size - pos)), 0, Math.min(chunk, size - pos), pos);
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // arquivo pode já não existir
  }
  try {
    fs.unlinkSync(abs);
  } catch {}
}

export function removeTempFile(tempPath?: string) {
  if (!tempPath) return;
  try {
    fs.unlinkSync(tempPath);
  } catch {}
}
