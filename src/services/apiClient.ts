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
  async getSecurityPolicy(): Promise<{ lockIdleMinutes: number; pinMaxAttempts: number; hasPin: boolean; sessionLocked: boolean }> {
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

  async deleteFolder(id: string): Promise<{ success: boolean; deletedId: string }> {
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

  async getTrash(departmentId?: string): Promise<{ retentionDays: number; items: DocumentItem[] }> {
    const qs = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
    return apiRequest(`/api/documents/trash${qs}`);
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

  async deleteDocument(id: string): Promise<{ success: boolean; document: DocumentItem }> {
    return apiRequest(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Envia o arquivo real. folderId vazio/null = raiz do setor. */
  async uploadFile(
    file: File,
    options: { departmentId: string; folderId?: string | null; name?: string; tags?: string[] },
    onProgress?: (percent: number) => void
  ): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('departmentId', options.departmentId);
    if (options.folderId) formData.append('folderId', options.folderId);
    if (options.name) formData.append('name', options.name);
    if (options.tags?.length) formData.append('tags', options.tags.join(','));
    formData.append('file', file);

    // XMLHttpRequest para acompanhar o progresso do envio
    return new Promise<DocumentItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/documents/upload');
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status === 401) {
          dispatchSessionExpired(SESSION_EXPIRED_MESSAGE);
          return reject(new Error(SESSION_EXPIRED_MESSAGE));
        }
        if (xhr.status === 423) {
          dispatchSessionLocked();
          return reject(new Error('Sessão bloqueada por inatividade. Desbloqueie para continuar.'));
        }
        if (xhr.status === 0 || xhr.status === 502 || xhr.status === 504 || (xhr.status === 503 && !body?.error?.includes('SETTINGS_ENCRYPTION_KEY'))) {
          reportConnectionProblem();
          return reject(new ConnectionError());
        }
        if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body as DocumentItem);
        reject(new Error(body?.error || `Falha no envio (HTTP ${xhr.status}).`));
      };
      xhr.onerror = () => {
        reportConnectionProblem();
        reject(new ConnectionError());
      };
      xhr.send(formData);
    });
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
