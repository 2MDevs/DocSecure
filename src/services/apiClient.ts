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
  users: User[];
  departments: Department[];
  folders: Folder[];
  documents: DocumentItem[];
  devices: Device[];
  auditLogs: AuditLog[];
  apiKeys: ApiKey[];
  webhooks: WebhookConfig[];
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

export interface LoginResponse {
  user?: User;
  token?: string;
  trustedDevice?: boolean;
  require2FA?: boolean;
  userId?: string;
  email?: string;
  maskedEmail?: string;
  previewCode?: string;
}

export const apiClient = {
  // Authentication
  async login(
    username: string,
    password: string,
    deviceInfo?: { deviceToken?: string; deviceName?: string; os?: string; browser?: string }
  ): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...deviceInfo }),
    });
    return handleResponse<LoginResponse>(res);
  },

  async verify2FA(payload: {
    userId: string;
    code: string;
    trustDevice: boolean;
    deviceToken?: string;
    deviceName?: string;
    os?: string;
    browser?: string;
  }): Promise<{ user: User; token: string; deviceToken?: string }> {
    const res = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ user: User; token: string; deviceToken?: string }>(res);
  },

  async resend2FA(userId: string): Promise<{ success: boolean; previewCode?: string }> {
    const res = await fetch('/api/auth/resend-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return handleResponse<{ success: boolean; previewCode?: string }>(res);
  },

  // Bootstrap
  async getBootstrapData(): Promise<BootstrapData> {
    const res = await fetch('/api/bootstrap');
    return handleResponse<BootstrapData>(res);
  },

  // System status
  async getSystemStatus() {
    const res = await fetch('/api/system/status');
    return handleResponse<{ db: any; server: any }>(res);
  },

  // Users
  async createUser(userData: Partial<User>): Promise<User> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse<User>(res);
  },

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<User>(res);
  },

  async updateUserPermissions(userId: string, folderId: string, permissions: PermissionType[]): Promise<User> {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, permissions }),
    });
    return handleResponse<User>(res);
  },

  // Departments
  async createDepartment(deptData: Partial<Department>): Promise<Department> {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deptData),
    });
    return handleResponse<Department>(res);
  },

  async updateDepartment(id: string, updates: Partial<Department>): Promise<Department> {
    const res = await fetch(`/api/departments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Department>(res);
  },

  // Folders
  async createFolder(folderData: {
    name: string;
    departmentId: string;
    isLocked?: boolean;
    description?: string;
    tags?: string[];
  }): Promise<Folder> {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData),
    });
    return handleResponse<Folder>(res);
  },

  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Folder>(res);
  },

  // Documents
  async uploadDocument(docData: {
    name: string;
    extension: string;
    sizeBytes: number;
    folderId: string;
    departmentId: string;
    tags?: string[];
    ownerId?: string;
    ownerName?: string;
  }): Promise<DocumentItem> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docData),
    });
    return handleResponse<DocumentItem>(res);
  },

  async toggleFavoriteDocument(id: string): Promise<DocumentItem> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}/toggle-favorite`, {
      method: 'POST',
    });
    return handleResponse<DocumentItem>(res);
  },

  async deleteDocument(id: string): Promise<DocumentItem> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<DocumentItem>(res);
  },

  // Audit Logs
  async recordAuditLog(log: AuditLog): Promise<AuditLog> {
    const res = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    });
    return handleResponse<AuditLog>(res);
  },

  // Devices
  async updateDeviceStatus(id: string, status: 'TRUSTED' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REVOKED'): Promise<Device> {
    const res = await fetch(`/api/devices/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse<Device>(res);
  },

  async revokeDevice(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // API Keys
  async createApiKey(name: string, scopes: string[], createdBy: string): Promise<ApiKey> {
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes, createdBy }),
    });
    return handleResponse<ApiKey>(res);
  },

  async revokeApiKey(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Webhooks
  async createWebhook(name: string, url: string, events: string[]): Promise<WebhookConfig> {
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, events }),
    });
    return handleResponse<WebhookConfig>(res);
  },

  async deleteWebhook(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },
};
