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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = await res.text();
    let errorMsg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) errorMsg = parsed.error;
    } catch {
      if (errorBody) errorMsg = errorBody;
    }
    throw new Error(errorMsg);
  }
  return res.json();
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

export const apiClient = {
  // Autenticação & Sessão
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    return handleResponse<LoginResponse>(res);
  },

  async verify2FA(payload: {
    challengeToken: string;
    code: string;
    trustDevice: boolean;
    deviceName?: string;
  }): Promise<{ user: User }> {
    const res = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return handleResponse<{ user: User }>(res);
  },

  async resend2FA(challengeToken: string): Promise<{ success: boolean; maskedEmail?: string }> {
    const res = await fetch('/api/auth/resend-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ challengeToken }),
    });
    return handleResponse<{ success: boolean; maskedEmail?: string }>(res);
  },

  async getMe(): Promise<{ user: User }> {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    return handleResponse<{ user: User }>(res);
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  },

  // Bootstrap (Dados da sessão e da organização)
  async getBootstrapData(): Promise<BootstrapData> {
    const res = await fetch('/api/bootstrap', {
      credentials: 'include',
    });
    return handleResponse<BootstrapData>(res);
  },

  // Status do Sistema e Hardware
  async getSystemStatus() {
    const res = await fetch('/api/system/status', {
      credentials: 'include',
    });
    return handleResponse<{ db: any; server: any }>(res);
  },

  // Usuários
  async getUsers(): Promise<User[]> {
    const res = await fetch('/api/users', { credentials: 'include' });
    return handleResponse<User[]>(res);
  },

  async createUser(userData: Partial<User> & { initialPassword?: string }): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userData),
    });
    return handleResponse<User>(res);
  },

  async updateUser(id: string, updates: Partial<User> & { password?: string }): Promise<User> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    return handleResponse<User>(res);
  },

  async updateUserPermissions(userId: string, folderId: string, permissions: PermissionType[]): Promise<User> {
    const res = await fetch(`/api/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ folderId, permissions }),
    });
    return handleResponse<User>(res);
  },

  async deleteUser(id: string): Promise<void> {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  // Departamentos / Setores
  async getDepartments(): Promise<Department[]> {
    const res = await fetch('/api/departments', { credentials: 'include' });
    return handleResponse<Department[]>(res);
  },

  async createDepartment(deptData: Partial<Department>): Promise<Department> {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(deptData),
    });
    return handleResponse<Department>(res);
  },

  async updateDepartment(id: string, updates: Partial<Department>): Promise<Department> {
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    return handleResponse<Department>(res);
  },

  // Pastas
  async getFolders(): Promise<Folder[]> {
    const res = await fetch('/api/folders', { credentials: 'include' });
    return handleResponse<Folder[]>(res);
  },

  async createFolder(folderData: {
    name: string;
    departmentId: string;
    departmentName?: string;
    parentId?: string | null;
    isLocked?: boolean;
    description?: string;
  }): Promise<Folder> {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(folderData),
    });
    return handleResponse<Folder>(res);
  },

  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    return handleResponse<Folder>(res);
  },

  async deleteFolder(id: string): Promise<void> {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  // Documentos
  async getDocuments(): Promise<DocumentItem[]> {
    const res = await fetch('/api/documents', { credentials: 'include' });
    return handleResponse<DocumentItem[]>(res);
  },

  async uploadDocument(docData: Partial<DocumentItem>): Promise<DocumentItem> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(docData),
    });
    return handleResponse<DocumentItem>(res);
  },

  async toggleFavoriteDocument(id: string): Promise<DocumentItem> {
    const res = await fetch(`/api/documents/${id}/favorite`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<DocumentItem>(res);
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  async uploadFile(file: File, folderId: string, departmentId: string, departmentName: string): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('departmentId', departmentId);
    formData.append('departmentName', departmentName);

    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    return handleResponse<DocumentItem>(res);
  },

  // Auditoria
  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch('/api/audit-logs', { credentials: 'include' });
    return handleResponse<AuditLog[]>(res);
  },

  async recordAuditLog(entry: {
    action: string;
    resourceName?: string;
    resourceId?: string;
    details: string;
    result: string;
  }): Promise<AuditLog> {
    const res = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(entry),
    });
    return handleResponse<AuditLog>(res);
  },

  // Dispositivos
  async getDevices(): Promise<Device[]> {
    const res = await fetch('/api/devices', { credentials: 'include' });
    return handleResponse<Device[]>(res);
  },

  async updateDeviceStatus(id: string, status: 'TRUSTED' | 'BLOCKED'): Promise<void> {
    const res = await fetch(`/api/devices/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    return handleResponse<void>(res);
  },

  async revokeDevice(id: string): Promise<void> {
    const res = await fetch(`/api/devices/${id}/revoke`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  async deleteDevice(id: string): Promise<void> {
    const res = await fetch(`/api/devices/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  // Chaves de API & Webhooks
  async getApiKeys(): Promise<ApiKey[]> {
    const res = await fetch('/api/api-keys', { credentials: 'include' });
    return handleResponse<ApiKey[]>(res);
  },

  async createApiKey(name: string, scopes: string[], createdBy?: string): Promise<ApiKey & { fullKey?: string }> {
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, scopes, createdBy }),
    });
    return handleResponse<ApiKey & { fullKey?: string }>(res);
  },

  async revokeApiKey(id: string): Promise<void> {
    const res = await fetch(`/api/api-keys/${id}/revoke`, {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  async deleteApiKey(id: string): Promise<void> {
    const res = await fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  async getWebhooks(): Promise<WebhookConfig[]> {
    const res = await fetch('/api/webhooks', { credentials: 'include' });
    return handleResponse<WebhookConfig[]>(res);
  },

  async createWebhook(name: string, url: string, events: string[]): Promise<WebhookConfig> {
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, url, events }),
    });
    return handleResponse<WebhookConfig>(res);
  },

  async deleteWebhook(id: string): Promise<void> {
    const res = await fetch(`/api/webhooks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(res);
  },

  // Documentos: Mover / Atualizar
  async updateDocument(id: string, updates: Partial<DocumentItem>): Promise<DocumentItem> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, ...updates }),
    });
    return handleResponse<DocumentItem>(res);
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
    const res = await fetch('/api/integrations/settings', {
      credentials: 'include',
    });
    return handleResponse<any>(res);
  },

  async verifyIntegrationPassword(password: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/integrations/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async saveIntegrationSettings(
    settings: Record<string, any>,
    password?: string
  ): Promise<{ success: boolean; message: string; summary?: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (password) {
      headers['x-reauth-password'] = password;
    }
    const res = await fetch('/api/integrations/settings', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(settings),
    });
    return handleResponse<any>(res);
  },

  async testSmtpConnection(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/integrations/test-smtp', {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async testGeminiConnection(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/integrations/test-gemini', {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  // Atualização do sistema pelo painel (Exclusivo Desenvolvedor)
  async getSystemUpdateStatus(): Promise<SystemUpdateStatus> {
    const res = await fetch('/api/system-update/status', { credentials: 'include', cache: 'no-store' });
    return handleResponse<SystemUpdateStatus>(res);
  },

  async startSystemUpdate(password: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/system-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async sendAdminPasswordReset(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/integrations/send-admin-reset', {
      method: 'POST',
      credentials: 'include',
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },
};
