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

// Setores organizacionais limpos (sem arquivos ou mock data)
export const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept-ti',
    name: 'TI / Infraestrutura',
    code: 'TI',
    iconName: 'Server',
    color: '#06b6d4',
    storageLimitBytes: 500 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Gestão de infraestrutura, servidores, segurança e acessos.',
    isLocked: false,
    itemCount: 0,
  },
  {
    id: 'dept-financeiro',
    name: 'Financeiro',
    code: 'FIN',
    iconName: 'DollarSign',
    color: '#3b82f6',
    storageLimitBytes: 500 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Gestão contábil, fiscal, contas a pagar/receber e orçamentos.',
    isLocked: false,
    itemCount: 0,
  },
  {
    id: 'dept-rh',
    name: 'Recursos Humanos',
    code: 'RH',
    iconName: 'Users',
    color: '#8b5cf6',
    storageLimitBytes: 300 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Recursos Humanos, admissões, folha de pagamento e benefícios.',
    isLocked: false,
    itemCount: 0,
  },
  {
    id: 'dept-comercial',
    name: 'Comercial',
    code: 'COM',
    iconName: 'Briefcase',
    color: '#10b981',
    storageLimitBytes: 400 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Contratos comerciais, propostas, clientes e pipeline de vendas.',
    isLocked: false,
    itemCount: 0,
  },
  {
    id: 'dept-marketing',
    name: 'Marketing',
    code: 'MKT',
    iconName: 'Megaphone',
    color: '#ec4899',
    storageLimitBytes: 250 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Campanhas, ativos de marca, peças publicitárias e relatórios.',
    isLocked: false,
    itemCount: 0,
  },
  {
    id: 'dept-juridico',
    name: 'Jurídico',
    code: 'JUR',
    iconName: 'Scale',
    color: '#f59e0b',
    storageLimitBytes: 350 * 1024 * 1024 * 1024,
    storageUsedBytes: 0,
    description: 'Contratos jurídicos, procurações, compliance e regulatório.',
    isLocked: false,
    itemCount: 0,
  },
];

// Usuário oficial de Preview / Teste: admin / admin
export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Administrador (Preview)',
    email: 'admin@docsecure.io',
    matricula: 'admin',
    cpf: '000.000.000-00',
    phone: '',
    role: 'DEVELOPER', // Acesso total com privilégios máximos RBAC
    departmentId: 'dept-ti',
    departmentName: 'TI / Infraestrutura',
    cargo: 'Administrador do Sistema',
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: 'Agora (Preview)',
    permittedFolderIds: ['*'],
    granularPermissions: {
      '*': ALL_PERMISSIONS,
    },
  },
];

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
