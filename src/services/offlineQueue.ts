/**
 * Fila local de envios: quando o servidor/banco está fora do ar, o arquivo fica guardado
 * NESTE navegador (IndexedDB) criptografado com AES-GCM, usando uma chave não exportável
 * gerada pelo próprio navegador, e é enviado automaticamente quando a conexão voltar.
 *
 * A fila é por usuário: só é processada quando o mesmo usuário estiver logado.
 */

export interface PendingUpload {
  id: string;
  userId: string;
  departmentId: string;
  folderId: string | null;
  name: string;
  tags: string[];
  /** Segurança escolhida no envio (aplicada quando o arquivo subir) */
  security?: { visibility?: string; downloadPolicy?: string; deletePolicy?: string };
  onConflict?: 'replace' | 'rename';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface StoredUpload extends PendingUpload {
  iv: Uint8Array;
  data: ArrayBuffer;
}

const DB_NAME = 'docsecure-offline';
const DB_VERSION = 1;
const STORE = 'uploads';
const KEY_STORE = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Armazenamento local indisponível neste navegador.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(db, KEY_STORE, 'readonly', (s) => s.get('upload-key') as IDBRequest<CryptoKey | undefined>);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await tx(db, KEY_STORE, 'readwrite', (s) => s.put(key, 'upload-key'));
  return key;
}

const toMeta = (s: StoredUpload): PendingUpload => ({
  id: s.id,
  userId: s.userId,
  departmentId: s.departmentId,
  folderId: s.folderId,
  name: s.name,
  tags: s.tags,
  security: s.security,
  onConflict: s.onConflict,
  fileName: s.fileName,
  mimeType: s.mimeType,
  sizeBytes: s.sizeBytes,
  createdAt: s.createdAt,
});

export async function enqueueUpload(
  userId: string,
  file: File,
  options: {
    departmentId: string;
    folderId: string | null;
    name: string;
    tags: string[];
    security?: { visibility?: string; downloadPolicy?: string; deletePolicy?: string };
    onConflict?: 'replace' | 'rename';
  }
): Promise<PendingUpload> {
  const db = await openDb();
  const key = await getKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer());
  const item: StoredUpload = {
    id: 'pending-' + crypto.getRandomValues(new Uint32Array(2)).join(''),
    userId,
    departmentId: options.departmentId,
    folderId: options.folderId,
    name: options.name || file.name,
    tags: options.tags,
    security: options.security,
    onConflict: options.onConflict,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
    iv,
    data,
  };
  await tx(db, STORE, 'readwrite', (s) => s.put(item));
  return toMeta(item);
}

export async function listPendingUploads(userId: string): Promise<PendingUpload[]> {
  try {
    const db = await openDb();
    const all = await tx<StoredUpload[]>(db, STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredUpload[]>);
    return all.filter((i) => i.userId === userId).map(toMeta).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function loadPendingFile(id: string): Promise<File | null> {
  const db = await openDb();
  const item = await tx<StoredUpload | undefined>(db, STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredUpload | undefined>);
  if (!item) return null;
  const key = await getKey(db);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(item.iv) }, key, item.data);
  return new File([plain], item.fileName, { type: item.mimeType });
}

export async function removePendingUpload(id: string): Promise<void> {
  try {
    const db = await openDb();
    await tx(db, STORE, 'readwrite', (s) => s.delete(id));
  } catch {}
}
