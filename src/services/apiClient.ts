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
  initialSetupMode?: boolean;
}

export const SESSION_EXPIRED_EVENT = 'docsecure:session-expired';
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

// Rotas isentas de disparar o evento de sessão expirada global
const EXEMPT_SESSION_EXPIRED_ROUTES = [
  '/api/auth/login',
  '/api/auth/verify-2fa',
  '/api/auth/me',
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

  const res = await fetch(url, options);

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
  }): Promise<{ user: User }> {
    return apiRequest<{ user: User }>('/api/auth/verify-2fa', {
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

  async getMe(): Promise<{ user: User }> {
    return apiRequest<{ user: User }>('/api/auth/me');
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

  async createUser(userData: Partial<User> & { initialPassword?: string }): Promise<User> {
    return apiRequest<User>('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
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

  async deleteFolder(id: string): Promise<void> {
    return apiRequest<void>(`/api/folders/${id}`, {
      method: 'DELETE',
    });
  },

  // Documentos
  async getDocuments(): Promise<DocumentItem[]> {
    return apiRequest<DocumentItem[]>('/api/documents');
  },

  async uploadDocument(docData: Partial<DocumentItem>): Promise<DocumentItem> {
    return apiRequest<DocumentItem>('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docData),
    });
  },

  async toggleFavoriteDocument(id: string): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/api/documents/${id}/favorite`, {
      method: 'POST',
    });
  },

  async deleteDocument(id: string): Promise<void> {
    return apiRequest<void>(`/api/documents/${id}`, {
      method: 'DELETE',
    });
  },

  async uploadFile(file: File, folderId: string, departmentId: string, departmentName: string): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('departmentId', departmentId);
    formData.append('departmentName', departmentName);

    return apiRequest<DocumentItem>('/api/documents/upload', {
      method: 'POST',
      body: formData,
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
  async updateDocument(id: string, updates: Partial<DocumentItem>): Promise<DocumentItem> {
    return apiRequest<DocumentItem>('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
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
