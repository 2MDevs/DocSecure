export type UserRole = 'DEVELOPER' | 'DIRECTOR' | 'MANAGER' | 'EMPLOYEE';

export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING_APPROVAL' | 'SUSPENDED';

export type PermissionType =
  | 'VIEW_FOLDER'
  | 'LIST_FILES'
  | 'VIEW_DOCUMENT'
  | 'DOWNLOAD_DOCUMENT'
  | 'UPLOAD_DOCUMENT'
  | 'EDIT_DOCUMENT'
  | 'DELETE_DOCUMENT'
  | 'CREATE_FOLDER'
  | 'DELETE_FOLDER'
  | 'MOVE_DOCUMENT'
  | 'RENAME_DOCUMENT'
  | 'SHARE_DOCUMENT'
  | 'MANAGE_PERMISSIONS'
  | 'MANAGE_USERS'
  | 'MANAGE_DEVICES'
  | 'VIEW_AUDIT';

export interface User {
  id: string;
  name: string;
  email: string;
  matricula: string;
  cpf?: string;
  phone?: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  cargo: string;
  avatar?: string;
  status: UserStatus;
  failedLoginAttempts: number;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  createdAt: string;
  lastLoginAt?: string;
  permittedFolderIds: string[];
  granularPermissions: Record<string, PermissionType[]>; // folderId -> PermissionType[]
}

export interface Department {
  id: string;
  name: string;
  code: string;
  iconName: string;
  color: string;
  storageLimitBytes: number; // in bytes
  storageUsedBytes: number;
  managerId?: string;
  managerName?: string;
  description: string;
  isLocked: boolean;
  itemCount: number;
}

export interface Folder {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  parentId: string | null; // null for department root
  createdAt: string;
  updatedAt: string;
  isLocked: boolean;
  itemCount: number;
  tags?: string[];
  description?: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  versionLabel: string;
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  hashSha256: string;
  changeLog: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  extension: 'pdf' | 'xlsx' | 'docx' | 'png' | 'jpg' | 'csv' | 'zip';
  mimeType: string;
  sizeBytes: number;
  folderId: string;
  departmentId: string;
  departmentName: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  hashSha256: string;
  currentVersion: number;
  versions: DocumentVersion[];
  isFavorite: boolean;
  isArchived: boolean;
  isShared: boolean;
  contentSummary?: string;
  status: 'active' | 'archived' | 'trash';
  scanStatus: 'clean' | 'scanning' | 'quarantined';
  tags?: string[];
}

export interface Device {
  id: string;
  userId: string;
  userName: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser: string;
  ipAddress: string;
  lastAccessAt: string;
  status: 'TRUSTED' | 'PENDING_APPROVAL' | 'BLOCKED' | 'REVOKED';
  fingerprintHash: string;
  registeredAt: string;
  isCurrent?: boolean;
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED'
  | 'LOGOUT'
  | 'TWO_FACTOR_VERIFIED'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_BLOCKED'
  | 'DEVICE_APPROVED'
  | 'DEVICE_REVOKED'
  | 'DOCUMENT_VIEWED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_EDITED'
  | 'DOCUMENT_VERSION_RESTORED'
  | 'FOLDER_CREATED'
  | 'FOLDER_DELETED'
  | 'PERMISSIONS_MODIFIED'
  | 'USER_CREATED'
  | 'USER_EDITED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'MANAGER_CREATED'
  | 'DEPARTMENT_CREATED'
  | 'DEPARTMENT_EDITED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'WEBHOOK_CREATED'
  | 'STORAGE_QUOTA_MODIFIED';

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: UserRole;
  department: string;
  action: AuditAction;
  resourceId?: string;
  resourceName?: string;
  details: string;
  ipAddress: string;
  deviceInfo: string;
  result: 'SUCCESS' | 'DENIED' | 'BLOCKED';
  hash: string;
  previousHash?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPreview: string;
  keyHash: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  status: 'ACTIVE' | 'REVOKED';
  createdBy: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  secretKey: string;
  status: 'ACTIVE' | 'PAUSED';
  lastTriggeredAt: string | null;
  successRate: number;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'security' | 'success';
  createdAt: string;
  read: boolean;
  actionUrl?: string;
  targetUserId?: string;
}
