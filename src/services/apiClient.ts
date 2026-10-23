import { canWrite, reportConnectionProblem, OFFLINE_MESSAGE } from './connectivity';
import {
  User,
  Department,
  Folder,
  DocumentItem,
  Device,
  AuditLog,
  ApiKey,
  WebhookConfig,
  PermissionType,
  FolderShare,
} from '../types';

export interface BootstrapData {
  currentUser?: User;
  users: User[];
  departments: Department[];
  folders: Folder[];
  documents: DocumentItem[];
  devices: Device[];
  auditLogs: AuditLog[];
  apiKeys: ApiKey[];
  webhooks: WebhookConfig[];
  initialSetupMode?: boolean;
  dbStatus: {
    connected: boolean;
    databaseName: string;
    host: string;
    port: number;
    tablesCount: number;
    recordsCount: number;
    latencyMs: number;
    mode: string;
    error?: string;
  };
}

export interface SystemUpdateCommit {
  commit: string;
  short: string;
  message: string;
  date: string;
}

export interface NameConflict {
  name: string;
  existing: { id: string; ownerName: string; sizeBytes: number; updatedAt: string } | null;
  canReplace: boolean;
  suggestedName: string;
}

export interface OfficeEngineStatus {
  mode: 'full' | 'basic';
  installed: boolean;
  state: 'installing' | 'removing' | 'installed' | 'not_installed' | 'failed' | null;
  action: string | null;
  message: string;
  version: string;
  diskBytes: number;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  running: boolean;
  pending: boolean;
  canManage: boolean;
  installedByDocSecure: boolean;
  log: string;
}

export interface ArchiveItem {
  path: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  encrypted: boolean;
  modifiedAt: string | null;
}
export type SheetCellStyle = {
  b?: 1; i?: 1; u?: 1; s?: 1;
  sz?: number;
  font?: string;
  color?: string;
  bg?: string;
  h?: 'left' | 'center' | 'right' | 'justify';
  v?: 'top' | 'middle' | 'bottom';
  wrap?: 1;
  indent?: number;
  bt?: string; bb?: string; bl?: string; br?: string;
};
export interface SheetPreview {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
  truncated: boolean;
  styles?: SheetCellStyle[];
  cellStyles?: number[][];
  colWidths?: number[];
  rowHeights?: Array<number | null>;
  merges?: Array<{ r: number; c: number; rs: number; cs: number }>;
  showGrid?: boolean;
}
export type DocRun = { text?: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; href?: string; img?: string; imgAlt?: string; br?: boolean };
export type DocBlock =
  | { t: 'p'; style?: string; align?: string; list?: { level: number; ordered: boolean }; runs: DocRun[] }
  | { t: 'table'; rows: Array<Array<{ span: number; blocks: DocBlock[] }>> };

export interface TrashFailure {
  id: string;
  name: string;
  error: string;
}

export interface UpdateNotice {
  updateAvailable: boolean;
  running?: boolean;
  version?: string;
  commit?: string;
  date?: string;
  changes?: Array<{ title: string; items: string[]; date: string }>;
}

export interface SystemUpdateStatus {
  installed: boolean;
  branch: string;
  current: SystemUpdateCommit | null;
  latest: SystemUpdateCommit | null;
  updateAvailable: boolean;
  running: boolean;
  status: {
    state: 'running' | 'success' | 'failed' | 'up_to_date';
    message: string;
    requestedBy?: string;
    startedAt?: string;
    finishedAt?: string;
    fromCommit?: string;
    toCommit?: string;
  } | null;
  log: string;
}

export interface LoginResponse {
  user?: User;
  trustedDevice?: boolean;
  require2FA?: boolean;
  challengeToken?: string;
  maskedEmail?: string;
  firstAccess?: boolean;
  mustChangePassword?: boolean;
  initialSetupMode?: boolean;
}

export const SESSION_EXPIRED_EVENT = 'docsecure:session-expired';
export const SESSION_LOCKED_EVENT = 'docsecure:session-locked';

/** Erro de conexão (servidor/banco fora do ar): o envio de arquivos vai para a fila local. */
export class ConnectionError extends Error {
  isConnectionError = true;
  constructor(message = OFFLINE_MESSAGE) {
    super(message);
  }
}

export function dispatchSessionLocked() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SESSION_LOCKED_EVENT));
}
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

// Rotas isentas de disparar o evento de sessão expirada global
const EXEMPT_SESSION_EXPIRED_ROUTES = [
  '/api/auth/login',
  '/api/auth/verify-2fa',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/resend-2fa',
];

export function dispatchSessionExpired(message: string = SESSION_EXPIRED_MESSAGE): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, {
        detail: { message },
      })
    );
  }
}

/**
 * Helper central de requisição para todas as chamadas do apiClient.
 * Intercepta erros 401 de forma centralizada e notifica a aplicação via evento global.
 */
export async function apiRequest<T = any>(url: string, init?: RequestInit): Promise<T> {
  const options: RequestInit = {
    credentials: 'include',
    ...init,
  };
  const method = (options.method || 'GET').toUpperCase();

  // Fora do ar: bloqueia qualquer alteração para não perder dados
  if (method !== 'GET' && !canWrite() && !url.startsWith('/api/auth/')) {
    throw new ConnectionError();
  }

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    reportConnectionProblem();
    throw new ConnectionError();
  }

  // Sessão em modo de suspensão: pede o PIN
  if (res.status === 423) {
    dispatchSessionLocked();
    throw new Error('Sessão bloqueada por inatividade. Desbloqueie para continuar.');
  }
  // Banco indisponível / servidor reiniciando
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    reportConnectionProblem();
  }

  if (res.status === 401) {
    const isExempt = EXEMPT_SESSION_EXPIRED_ROUTES.some(
      (exemptRoute) => url === exemptRoute || url.startsWith(`${exemptRoute}?`)
    );
    if (!isExempt) {
      dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
  }

  if (!res.ok) {
    const errorBody = await res.text();
    let errorMsg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) errorMsg = parsed.error;
      else if (parsed.message) errorMsg = parsed.message;
    } catch {
      if (errorBody) errorMsg = errorBody;
    }
    throw new Error(errorMsg);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}

// ---------------------------------------------------------------------------
// Envio em partes
// ---------------------------------------------------------------------------
const DEFAULT_CHUNK = 4 * 1024 * 1024;
const MIN_CHUNK = 512 * 1024;
export const SESSION_UNLOCKED_EVENT = 'docsecure:session-unlocked';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Enquanto um envio está andando a pessoa não está "inativa": não bloqueia a tela no meio do envio */
let lastActivityMark = 0;
function markUploadActivity() {
  const now = Date.now();
  if (now - lastActivityMark < 5000) return;
  lastActivityMark = now;
  try {
    localStorage.setItem('ds.lastActivity', String(now));
  } catch {}
}

/** Tela bloqueada no meio do envio: espera a pessoa desbloquear e continua de onde parou */
function waitForUnlock(): Promise<void> {
  dispatchSessionLocked();
  return new Promise((resolve) => window.addEventListener(SESSION_UNLOCKED_EVENT, () => resolve(), { once: true }));
}

/** Espera a conexão com o servidor voltar (até 10 minutos) */
async function waitForConnection() {
  const until = Date.now() + 10 * 60_000;
  while (!canWrite() && Date.now() < until) await sleep(2000);
  if (!canWrite()) throw new ConnectionError();
}

class UploadHttpError extends Error {
  constructor(message: string, public status: number, public code?: string, public received?: number) {
    super(message);
  }
}

function uploadError(status: number, body: any): Error {
  if (status === 401) {
    dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
    return new UploadHttpError(SESSION_EXPIRED_MESSAGE, 401);
  }
  if (status === 0 || status === 502 || status === 504 || (status === 503 && !String(body?.error || '').includes('SETTINGS_ENCRYPTION_KEY'))) {
    reportConnectionProblem();
    return new ConnectionError();
  }
  if (status === 413 && !body?.error) {
    return new UploadHttpError('O servidor recusou o tamanho do envio (limite do proxy).', 413, 'PROXY_LIMIT');
  }
  return new UploadHttpError(body?.error || `Falha no envio (HTTP ${status}).`, status, body?.code, body?.received);
}

async function uploadCall<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    reportConnectionProblem();
    throw new ConnectionError();
  }
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {}
  if (!res.ok) throw uploadError(res.status, parsed);
  return parsed as T;
}

function putChunk(uploadId: string, offset: number, blob: Blob, onLoaded: (loaded: number) => void): Promise<{ received: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/documents/uploads/${uploadId}/chunk?offset=${offset}`);
    xhr.withCredentials = true;
    xhr.timeout = 300_000; // conexões lentas: 4 MB podem levar alguns minutos
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body.received === 'number') return resolve(body);
      reject(uploadError(xhr.status, body));
    };
    xhr.onerror = () => reject(uploadError(0, null));
    xhr.ontimeout = () => reject(uploadError(0, null));
    xhr.send(blob);
  });
}

export const apiClient = {
  // Autenticação & Sessão
  async login(username: string, password: string): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  async verify2FA(payload: {
    challengeToken: string;
    code: string;
    trustDevice: boolean;
    deviceName?: string;
  }): Promise<{ user: User; mustChangePassword?: boolean }> {
    return apiRequest<{ user: User; mustChangePassword?: boolean }>('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async resend2FA(challengeToken: string): Promise<{ success: boolean; maskedEmail?: string }> {
    return apiRequest<{ success: boolean; maskedEmail?: string }>('/api/auth/resend-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken }),
    });
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async changePassword(newPassword: string, currentPassword?: string): Promise<{ success: boolean; message: string; user?: User }> {
    return apiRequest<{ success: boolean; message: string; user?: User }>('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, currentPassword }),
    });
  },

  async getMe(): Promise<{ user: User; sessionLocked?: boolean }> {
    return apiRequest<{ user: User; sessionLocked?: boolean }>('/api/auth/me');
  },

  // Bloqueio por inatividade e PIN
  async getSecurityPolicy(): Promise<{ lockIdleMinutes: number; pinMaxAttempts: number; hasPin: boolean; sessionLocked: boolean; maxUploadBytes?: number; officePreview?: 'full' | 'basic' }> {
    return apiRequest('/api/auth/security-policy');
  },

  async lockSession(): Promise<void> {
    await apiRequest('/api/auth/lock', { method: 'POST' });
  },

  /** Desbloqueia com PIN (ou senha, se o usuário não tiver PIN). Não dispara "sessão expirada" automaticamente. */
  async unlockSession(secret: string): Promise<{ unlocked?: boolean; loggedOut?: boolean; error?: string }> {
    const res = await fetch('/api/auth/unlock', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: secret }),
    }).catch(() => null);
    if (!res) return { error: 'Sem conexão com o servidor.' };
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { unlocked: true };
    return { loggedOut: Boolean(body?.loggedOut), error: body?.error || 'Não foi possível desbloquear.' };
  },

  async setPin(pin: string, currentPassword: string): Promise<{ success: boolean; message: string }> {
    return apiRequest('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, currentPassword }),
    });
  },

  async removePin(currentPassword: string): Promise<{ success: boolean; message: string }> {
    return apiRequest('/api/auth/pin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword }),
    });
  },

  async logout(): Promise<void> {
    return apiRequest<void>('/api/auth/logout', {
      method: 'POST',
    });
  },

  // Bootstrap (Dados da sessão e da organização)
  async getBootstrapData(): Promise<BootstrapData> {
    return apiRequest<BootstrapData>('/api/bootstrap');
  },

  // Status do Sistema e Hardware
  /** Apaga sobras do armazenamento (arquivos sem documento e temporários parados). Só desenvolvedor. */
  async cleanStorageLeftovers(): Promise<{ files: number; bytes: number }> {
    return apiRequest('/api/system/storage-cleanup', { method: 'POST' });
  },

  async getSystemStatus(): Promise<{ db: any; server: any }> {
    return apiRequest<{ db: any; server: any }>('/api/system/status');
  },

  // Usuários
  async getUsers(): Promise<User[]> {
    return apiRequest<User[]>('/api/users');
  },

  async createUser(
    userData: Partial<User> & { initialPassword?: string }
  ): Promise<User & { emailSent?: boolean; temporaryPassword?: string }> {
    return apiRequest<User & { emailSent?: boolean; temporaryPassword?: string }>('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
  },

  async resendUserAccess(
    id: string
  ): Promise<{ success: boolean; emailSent: boolean; temporaryPassword?: string; message: string }> {
    return apiRequest(`/api/users/${id}/resend-access`, { method: 'POST' });
  },

  async updateUser(id: string, updates: Partial<User> & { password?: string }): Promise<User> {
    return apiRequest<User>(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async updateUserPermissions(userId: string, folderId: string, permissions: PermissionType[]): Promise<User> {
    return apiRequest<User>(`/api/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, permissions }),
    });
  },

  async deleteUser(id: string): Promise<void> {
    return apiRequest<void>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Departamentos / Setores
  async getDepartments(): Promise<Department[]> {
    return apiRequest<Department[]>('/api/departments');
  },

  async createDepartment(deptData: Partial<Department>): Promise<Department> {
    return apiRequest<Department>('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deptData),
    });
  },

  async deleteDepartment(id: string): Promise<{ success: boolean; deletedId: string }> {
    return apiRequest(`/api/departments/${id}`, { method: 'DELETE' });
  },

  async updateDepartment(id: string, updates: Partial<Department>): Promise<Department> {
    return apiRequest<Department>(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  // Pastas
  async getFolders(): Promise<Folder[]> {
    return apiRequest<Folder[]>('/api/folders');
  },

  async createFolder(folderData: {
    name: string;
    departmentId: string;
    departmentName?: string;
    parentId?: string | null;
    isLocked?: boolean;
    isPrivate?: boolean;
    description?: string;
  }): Promise<Folder> {
    return apiRequest<Folder>('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData),
    });
  },

  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    return apiRequest<Folder>(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async deleteFolder(id: string): Promise<{ success: boolean; deletedId: string; deletedFolderIds?: string[]; trashedDocuments?: number }> {
    return apiRequest(`/api/folders/${id}`, {
      method: 'DELETE',
    });
  },

  // Documentos
  async getDocuments(): Promise<DocumentItem[]> {
    return apiRequest<DocumentItem[]>('/api/documents');
  },

  /** Conteúdo real do arquivo (descriptografado pelo servidor). download=true exige permissão de download. */
  async getDocumentContent(id: string, download = false): Promise<Blob> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 401) {
      dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (res.status === 423) {
      dispatchSessionLocked();
      throw new Error('Sessão bloqueada por inatividade.');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }
    return res.blob();
  },

  // ---------------------------------------------------------------- pré-visualização (compactados e Office)
  async getArchiveItems(id: string): Promise<{ format: 'zip' | 'rar'; items: ArchiveItem[]; truncated: boolean }> {
    return apiRequest(`/api/preview/${encodeURIComponent(id)}/archive`);
  },

  /** Endereço de um item de dentro do compactado (visualizar ou baixar) */
  archiveItemUrl(id: string, path: string, download = false): string {
    return `/api/preview/${encodeURIComponent(id)}/archive/file?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`;
  },

  async getArchiveItemBlob(id: string, path: string, download = false): Promise<Blob> {
    const res = await fetch(this.archiveItemUrl(id, path, download), { credentials: 'include', cache: 'no-store' });
    if (res.status === 401) {
      dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (res.status === 423) {
      dispatchSessionLocked();
      throw new Error('Sessão bloqueada por inatividade.');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }
    return res.blob();
  },

  async getSheetPreview(id: string, inner?: string): Promise<{ sheets: SheetPreview[] }> {
    return apiRequest(`/api/preview/${encodeURIComponent(id)}/sheet${inner ? `?inner=${encodeURIComponent(inner)}` : ''}`);
  },

  async getDocxPreview(id: string, inner?: string): Promise<{ blocks: DocBlock[]; images: string[]; truncated: boolean }> {
    return apiRequest(`/api/preview/${encodeURIComponent(id)}/docx${inner ? `?inner=${encodeURIComponent(inner)}` : ''}`);
  },

  /** Visualização completa: o servidor converte Word/Excel/PowerPoint em PDF */
  async getOfficePdf(id: string, inner?: string): Promise<Blob> {
    const res = await fetch(`/api/preview/${encodeURIComponent(id)}/pdf${inner ? `?inner=${encodeURIComponent(inner)}` : ''}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 401) {
      dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {}
      throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { code: body?.code, status: res.status });
    }
    return res.blob();
  },

  async getOfficeEngine(): Promise<OfficeEngineStatus> {
    return apiRequest('/api/system/office-preview');
  },

  async setOfficeEngine(action: 'install' | 'uninstall', password: string): Promise<OfficeEngineStatus> {
    return apiRequest('/api/system/office-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, password }),
    });
  },

  docxImageUrl(id: string, part: string, inner?: string): string {
    return `/api/preview/${encodeURIComponent(id)}/docx/image?part=${encodeURIComponent(part)}${inner ? `&inner=${encodeURIComponent(inner)}` : ''}`;
  },

  async getTrash(departmentId?: string): Promise<{ retentionDays: number; items: DocumentItem[] }> {
    const qs = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
    return apiRequest(`/api/documents/trash${qs}`);
  },

  /** Lixeira: vários itens de uma vez. Devolve o que deu certo e o que falhou (com o motivo). */
  async restoreTrashItems(ids: string[]): Promise<{ restored: DocumentItem[]; failed: TrashFailure[] }> {
    return apiRequest('/api/documents/trash/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },

  async purgeTrashItems(ids: string[]): Promise<{ purged: string[]; failed: TrashFailure[] }> {
    return apiRequest('/api/documents/trash/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },

  async emptyTrash(departmentId: string): Promise<{ purged: string[]; failed: TrashFailure[] }> {
    return apiRequest('/api/documents/trash/empty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId }),
    });
  },

  async restoreDocument(id: string): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/api/documents/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  },

  async purgeDocument(id: string): Promise<{ success: boolean }> {
    return apiRequest(`/api/documents/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' });
  },

  async toggleFavoriteDocument(id: string): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/api/documents/${id}/favorite`, {
      method: 'POST',
    });
  },

  /** Propriedades → Segurança do arquivo (só quem enviou ou a gestão do setor) */
  async updateDocumentSecurity(
    id: string,
    security: { visibility?: string; downloadPolicy?: string; deletePolicy?: string }
  ): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/api/documents/${encodeURIComponent(id)}/security`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(security),
    });
  },

  async deleteDocument(id: string): Promise<{ success: boolean; document: DocumentItem }> {
    return apiRequest(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Compartilhamento de pasta com pessoas de outras áreas */
  async getFolderShares(folderId: string): Promise<FolderShare[]> {
    return apiRequest<FolderShare[]>(`/api/folders/${encodeURIComponent(folderId)}/shares`, { cache: 'no-store' });
  },
  async setFolderShares(folderId: string, shares: Array<{ userId: string; canDownload: boolean }>): Promise<{ success: boolean; count: number }> {
    return apiRequest(`/api/folders/${encodeURIComponent(folderId)}/shares`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares }),
    });
  },
  async searchPeople(q: string): Promise<Array<{ id: string; name: string; email: string; departmentId: string; departmentName: string }>> {
    return apiRequest(`/api/users/directory?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  },

  /** Antes de enviar: quais nomes já existem no destino (para perguntar se substitui ou mantém os dois) */
  async checkFileNames(
    departmentId: string,
    folderId: string | null,
    names: string[]
  ): Promise<{ conflicts: NameConflict[] }> {
    return apiRequest('/api/documents/check-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId, folderId, names }),
    });
  },

  /**
   * Envia o arquivo real, em partes (funciona para arquivos de vários GB).
   * - Cada parte é reenviada sozinha se a internet oscilar; quedas curtas não perdem o que já subiu.
   * - Se o proxy recusar o tamanho da parte, diminui a parte e continua.
   * - Se a tela for bloqueada por inatividade no meio, espera o desbloqueio e continua.
   * folderId vazio/null = raiz do setor.
   */
  async uploadFile(
    file: File,
    options: {
      departmentId: string;
      folderId?: string | null;
      name?: string;
      tags?: string[];
      security?: { visibility?: string; downloadPolicy?: string; deletePolicy?: string };
      /** Se já existir um arquivo com o mesmo nome na pasta: substituir ou manter os dois (renomeia) */
      onConflict?: 'replace' | 'rename';
    },
    onProgress?: (percent: number) => void
  ): Promise<DocumentItem & { replacedDocumentId?: string | null }> {
    const startBody = {
      departmentId: options.departmentId,
      folderId: options.folderId || null,
      name: options.name || file.name,
      size: file.size,
      onConflict: options.onConflict || 'rename',
      tags: options.tags || [],
      ...(options.security || {}),
    };
    const report = (sent: number) => {
      markUploadActivity();
      if (onProgress) onProgress(file.size ? Math.min(99, Math.floor((sent / file.size) * 100)) : 99);
    };

    let session = await uploadCall<{ uploadId: string; chunkSize: number }>('POST', '/api/documents/uploads', startBody);
    let chunkSize = Math.max(MIN_CHUNK, session.chunkSize || DEFAULT_CHUNK);
    let offset = 0;
    let failures = 0;
    let restarts = 0;
    report(0);

    while (offset < file.size) {
      const end = Math.min(file.size, offset + chunkSize);
      try {
        const r = await putChunk(session.uploadId, offset, file.slice(offset, end), (loaded) => report(offset + loaded));
        offset = r.received;
        failures = 0;
        report(offset);
      } catch (err: any) {
        if (err?.status === 409 && typeof err.received === 'number') {
          offset = err.received; // o servidor diz até onde já chegou
          await sleep(400);
          continue;
        }
        if (err?.status === 413 && chunkSize > MIN_CHUNK) {
          chunkSize = MIN_CHUNK; // proxy com limite baixo por requisição
          continue;
        }
        if (err?.code === 'UPLOAD_SESSION_NOT_FOUND' && restarts < 2) {
          // Servidor reiniciou no meio (ex.: atualização): recomeça este arquivo
          restarts += 1;
          session = await uploadCall('POST', '/api/documents/uploads', startBody);
          offset = 0;
          continue;
        }
        if (err?.status === 423) {
          await waitForUnlock();
          continue;
        }
        if (err?.isConnectionError) {
          failures += 1;
          if (failures >= 2 && chunkSize > MIN_CHUNK) chunkSize = MIN_CHUNK;
          if (failures > 8) throw new ConnectionError('A conexão caiu várias vezes durante o envio. Tente de novo quando a internet estabilizar.');
          await sleep(Math.min(30_000, 1000 * 2 ** failures));
          await waitForConnection();
          continue;
        }
        throw err;
      }
    }

    // Concluir (com novas tentativas se a conexão oscilar)
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await uploadCall<DocumentItem & { replacedDocumentId?: string | null }>(
          'POST',
          `/api/documents/uploads/${session.uploadId}/finish`
        );
        onProgress?.(100);
        return saved;
      } catch (err: any) {
        if (err?.status === 423) {
          await waitForUnlock();
          continue;
        }
        if (err?.isConnectionError && attempt < 5) {
          await sleep(2000 * (attempt + 1));
          await waitForConnection();
          continue;
        }
        throw err;
      }
    }
  },

  // Auditoria
  async getAuditLogs(): Promise<AuditLog[]> {
    return apiRequest<AuditLog[]>('/api/audit-logs');
  },

  async recordAuditLog(entry: {
    action: string;
    resourceName?: string;
    resourceId?: string;
    details: string;
    result: string;
  }): Promise<AuditLog> {
    return apiRequest<AuditLog>('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  },

  // Dispositivos
  async getDevices(): Promise<Device[]> {
    return apiRequest<Device[]>('/api/devices');
  },

  async updateDeviceStatus(id: string, status: 'TRUSTED' | 'BLOCKED'): Promise<void> {
    return apiRequest<void>(`/api/devices/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },

  async revokeDevice(id: string): Promise<void> {
    return apiRequest<void>(`/api/devices/${id}/revoke`, {
      method: 'POST',
    });
  },

  async deleteDevice(id: string): Promise<void> {
    return apiRequest<void>(`/api/devices/${id}`, {
      method: 'DELETE',
    });
  },

  // Chaves de API & Webhooks
  async getApiKeys(): Promise<ApiKey[]> {
    return apiRequest<ApiKey[]>('/api/api-keys');
  },

  async createApiKey(name: string, scopes: string[], createdBy?: string): Promise<ApiKey & { fullKey?: string }> {
    return apiRequest<ApiKey & { fullKey?: string }>('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes, createdBy }),
    });
  },

  async revokeApiKey(id: string): Promise<void> {
    return apiRequest<void>(`/api/api-keys/${id}/revoke`, {
      method: 'POST',
    });
  },

  async deleteApiKey(id: string): Promise<void> {
    return apiRequest<void>(`/api/api-keys/${id}`, {
      method: 'DELETE',
    });
  },

  async getWebhooks(): Promise<WebhookConfig[]> {
    return apiRequest<WebhookConfig[]>('/api/webhooks');
  },

  async createWebhook(name: string, url: string, events: string[]): Promise<WebhookConfig> {
    return apiRequest<WebhookConfig>('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, events }),
    });
  },

  async deleteWebhook(id: string): Promise<void> {
    return apiRequest<void>(`/api/webhooks/${id}`, {
      method: 'DELETE',
    });
  },

  // Documentos: Mover / Atualizar
  async updateDocument(
    id: string,
    updates: { folderId?: string | null; departmentId?: string; name?: string; tags?: string[] }
  ): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  // Integração (Exclusivo Desenvolvedor)
  async getIntegrationSettings(): Promise<{
    settings: Array<{
      key: string;
      value?: string;
      configured?: boolean;
      last4?: string;
      source: 'database' | 'env' | 'default';
      isSecret: boolean;
    }>;
    envOnly: Array<{ key: string; isSet: boolean }>;
    encryptionKeyConfigured: boolean;
    adminStatus: { exists: boolean; createdAt?: string; email?: string };
    initialSetupMode?: boolean;
  }> {
    return apiRequest<any>('/api/integrations/settings');
  },

  async verifyIntegrationPassword(password: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/integrations/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  },

  async saveIntegrationSettings(
    settings: Record<string, any>,
    password?: string
  ): Promise<{ success: boolean; message: string; summary?: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (password) {
      headers['x-reauth-password'] = password;
    }
    return apiRequest<any>('/api/integrations/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(settings),
    });
  },

  async testSmtpConnection(): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/integrations/test-smtp', {
      method: 'POST',
    });
  },

  async testGeminiConnection(): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/integrations/test-gemini', {
      method: 'POST',
    });
  },

  // Aviso de atualização (todos os usuários): o que a nova versão traz
  async getUpdateNotice(): Promise<UpdateNotice> {
    return apiRequest<UpdateNotice>('/api/system-update/notice', { cache: 'no-store' });
  },

  // Atualização do sistema pelo painel (Exclusivo Desenvolvedor)
  async getSystemUpdateStatus(): Promise<SystemUpdateStatus> {
    return apiRequest<SystemUpdateStatus>('/api/system-update/status', {
      cache: 'no-store',
    });
  },

  async startSystemUpdate(password: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/system-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  },

  async sendAdminPasswordReset(): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/api/integrations/send-admin-reset', {
      method: 'POST',
    });
  },
};
