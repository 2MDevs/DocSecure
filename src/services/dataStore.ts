import {
  User,
  Department,
  Folder,
  DocumentItem,
  Device,
  AuditLog,
  ApiKey,
  WebhookConfig,
  SystemNotification,
  PermissionType,
} from '../types';

export const ALL_PERMISSIONS: PermissionType[] = [
  'VIEW_FOLDER',
  'LIST_FILES',
  'VIEW_DOCUMENT',
  'DOWNLOAD_DOCUMENT',
  'UPLOAD_DOCUMENT',
  'EDIT_DOCUMENT',
  'DELETE_DOCUMENT',
  'CREATE_FOLDER',
  'DELETE_FOLDER',
  'MOVE_DOCUMENT',
  'RENAME_DOCUMENT',
  'SHARE_DOCUMENT',
  'MANAGE_PERMISSIONS',
  'MANAGE_USERS',
  'MANAGE_DEVICES',
  'VIEW_AUDIT',
];

// Setores organizacionais zerados (cadastrados manualmente no ambiente de produção)
export const INITIAL_DEPARTMENTS: Department[] = [];

// Nenhum usuário mockado no frontend (autenticação e usuários carregados exclusivamente via API/banco)
export const INITIAL_USERS: User[] = [];

// Ambiente totalmente limpo para teste (sem pastas mockadas)
export const INITIAL_FOLDERS: Folder[] = [];

// Ambiente totalmente limpo para teste (sem documentos mockados)
export const INITIAL_DOCUMENTS: DocumentItem[] = [];

// Lista de dispositivos limpa
export const INITIAL_DEVICES: Device[] = [];

// Logs de auditoria limpos
export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

// Chaves de API limpas
export const INITIAL_API_KEYS: ApiKey[] = [];

// Webhooks limpos
export const INITIAL_WEBHOOKS: WebhookConfig[] = [];

// Notificações limpas
export const INITIAL_NOTIFICATIONS: SystemNotification[] = [];
