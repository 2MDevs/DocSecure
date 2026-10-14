import crypto from 'crypto';
import { pool } from '../db';

/**
 * Regras de acesso a pastas e documentos aplicadas NO SERVIDOR (o securityEngine do
 * frontend só espelha estas regras para a interface).
 *
 * - Diretor (ou usuário com "acesso de diretoria"): acesso a todos os setores.
 * - Gestor e Desenvolvedor: responsáveis pelo PRÓPRIO setor (tudo nele, inclusive pastas
 *   privadas); em outros setores, só pastas explicitamente liberadas. O desenvolvedor NÃO
 *   tem acesso livre aos documentos da empresa; só ganha com o "acesso de diretoria".
 * - Colaborador: no próprio setor vê, envia arquivos e cria pastas; não entra em pastas
 *   trancadas (salvo liberação do gestor) nem em pastas privadas de outros colegas.
 * - Pasta privada: visível só para quem criou + gestão do setor + diretoria.
 */

export type DocPermission =
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
  | 'RENAME_DOCUMENT';

const ALL_PERMS: DocPermission[] = [
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
];
const READ_PERMS: DocPermission[] = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT'];
/** Todo colaborador, no próprio setor, pode ver, enviar arquivos e criar pastas */
const EMPLOYEE_OWN_DEPT_DEFAULT: DocPermission[] = [...READ_PERMS, 'UPLOAD_DOCUMENT', 'CREATE_FOLDER'];

export type FolderRow = {
  id: string;
  department_id: string;
  parent_id: string | null;
  is_locked: boolean;
  is_private: boolean;
  created_by: string | null;
};
export type FolderIndex = Map<string, FolderRow>;

export const roleOf = (user: any) => String(user?.role || '').toUpperCase();

/** Diretoria: acesso a todos os setores (perfil Diretor ou "acesso de diretoria" concedido). */
export const isDocAdmin = (user: any) => roleOf(user) === 'DIRECTOR' || Boolean(user?.directorAccess);

/** Mantido por compatibilidade: agora significa "diretoria" (o desenvolvedor não entra mais aqui). */
export const isAdminRole = isDocAdmin;

/** Responsável pelo setor: diretoria, ou gestor/desenvolvedor do próprio setor. */
export function isDepartmentManager(user: any, departmentId: string): boolean {
  if (isDocAdmin(user)) return true;
  const role = roleOf(user);
  return (role === 'MANAGER' || role === 'DEVELOPER') && user.departmentId === departmentId;
}

export async function loadFolderIndex(): Promise<FolderIndex> {
  const { rows } = await pool.query(
    'SELECT id, department_id, parent_id, is_locked, COALESCE(is_private, false) AS is_private, created_by FROM folders'
  );
  return new Map(rows.map((r: FolderRow) => [r.id, r]));
}

function ancestry(folderId: string, index: FolderIndex): FolderRow[] {
  const chain: FolderRow[] = [];
  const guard = new Set<string>();
  let cursor = index.get(folderId);
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parent_id ? index.get(cursor.parent_id) : undefined;
  }
  return chain; // da pasta até a raiz
}

/** A pasta (e toda a cadeia acima dela) pode ser vista por este usuário? */
export function folderVisible(user: any, folderId: string, index: FolderIndex): boolean {
  if (user?.status === 'BLOCKED') return false;
  const folder = index.get(folderId);
  if (!folder) return false;
  if (isDepartmentManager(user, folder.department_id)) return true;

  const permitted: string[] = user.permittedFolderIds || [];
  const granular: Record<string, unknown> = user.granularPermissions || {};
  const explicitly = (id: string) => permitted.includes(id) || granular[id] !== undefined;

  const chain = ancestry(folderId, index);
  // Pasta privada de outra pessoa nunca aparece para colaboradores
  if (chain.some((f) => f.is_private && f.created_by !== user.id)) return false;

  // Liberação explícita (inclusive de outro setor) vale para a pasta e o que está dentro dela
  if (chain.some((f) => explicitly(f.id))) return true;

  // Próprio setor: tudo que não estiver trancado (trancada = só com liberação do gestor)
  if (folder.department_id !== user.departmentId) return false;
  return chain.every((f) => !f.is_locked || f.created_by === user.id);
}

function resolvePermissions(user: any, departmentId: string, folderId: string | null, index: FolderIndex): DocPermission[] {
  if (user?.status === 'BLOCKED') return [];
  if (isDepartmentManager(user, departmentId)) return ALL_PERMS;
  if (folderId && !folderVisible(user, folderId, index)) return [];

  const role = roleOf(user);
  const granular: Record<string, DocPermission[]> = user.granularPermissions || {};
  const ownDept = departmentId === user.departmentId;

  // Permissão granular definida pelo gestor tem prioridade (pasta mais próxima vence)
  if (folderId) {
    for (const f of ancestry(folderId, index)) {
      if (granular[f.id] !== undefined) return granular[f.id];
    }
  }
  if (!folderId && !ownDept) return []; // raiz de outro setor

  if (role === 'MANAGER' || role === 'DEVELOPER') return ownDept ? ALL_PERMS : READ_PERMS;
  if (role === 'EMPLOYEE') {
    if (granular[departmentId] !== undefined) return granular[departmentId];
    if (granular['*'] !== undefined) return granular['*'];
    return ownDept ? EMPLOYEE_OWN_DEPT_DEFAULT : READ_PERMS;
  }
  return [];
}

export function can(user: any, permission: DocPermission, departmentId: string, folderId: string | null, index: FolderIndex): boolean {
  return resolvePermissions(user, departmentId, folderId, index).includes(permission);
}

/** Atalho assíncrono: carrega as pastas e verifica a permissão. */
export async function canAccess(user: any, permission: DocPermission, departmentId: string, folderId: string | null): Promise<boolean> {
  return can(user, permission, departmentId, folderId, await loadFolderIndex());
}

/** Pastas que o usuário enxerga. */
export async function visibleFolderIds(user: any, index?: FolderIndex): Promise<Set<string>> {
  const idx = index || (await loadFolderIndex());
  const out = new Set<string>();
  idx.forEach((f) => folderVisible(user, f.id, idx) && out.add(f.id));
  return out;
}

/**
 * Segurança por arquivo (definida em Propriedades → Segurança pelo dono do arquivo ou pela gestão):
 * - visibility:      'folder' = todos que acessam a pasta | 'private' = só quem enviou + gestão do setor + diretoria
 * - download_policy: 'folder' = quem pode baixar na pasta | 'owner' = só quem enviou + gestão | 'none' = ninguém (só visualizar)
 * - delete_policy:   'folder' = quem pode excluir na pasta + quem enviou | 'owner' = só quem enviou + gestão | 'managers' = só a gestão
 * A gestão do setor e a diretoria nunca perdem a visão do arquivo.
 */
export type DocPolicyAction = 'view' | 'download' | 'delete';
export const VISIBILITY_VALUES = ['folder', 'private'];
export const DOWNLOAD_POLICY_VALUES = ['folder', 'owner', 'none'];
export const DELETE_POLICY_VALUES = ['folder', 'owner', 'managers'];

/** null = segue a regra normal da pasta; true/false = a regra do arquivo decide. */
export function docPolicyDecision(user: any, doc: any, action: DocPolicyAction): boolean | null {
  const manager = isDepartmentManager(user, doc.department_id);
  const owner = doc.owner_id === user.id;
  if (action === 'view') return doc.visibility === 'private' ? owner || manager : null;
  if (action === 'download') {
    if (doc.visibility === 'private' && !owner && !manager) return false;
    if (doc.download_policy === 'none') return false;
    if (doc.download_policy === 'owner') return owner || manager;
    return null;
  }
  if (doc.visibility === 'private' && !owner && !manager) return false;
  if (doc.delete_policy === 'managers') return manager;
  if (doc.delete_policy === 'owner') return owner || manager;
  return null;
}

/** Documento visível: pela pasta, ou pela raiz do setor (próprio setor / responsável / diretoria) — e pela regra do arquivo. */
export function documentVisible(user: any, doc: any, visible: Set<string>): boolean {
  if (docPolicyDecision(user, doc, 'view') === false) return false;
  if (doc.folder_id) return visible.has(doc.folder_id);
  return isDepartmentManager(user, doc.department_id) || doc.department_id === user.departmentId;
}

export function toDocumentDto(doc: any) {
  const trashedAt = doc.trashed_at ? new Date(doc.trashed_at) : null;
  return {
    id: doc.id,
    name: doc.name,
    extension: doc.extension,
    mimeType: doc.mime_type,
    sizeBytes: parseInt(doc.size_bytes, 10) || 0,
    folderId: doc.folder_id || null,
    departmentId: doc.department_id,
    departmentName: doc.department_name,
    ownerId: doc.owner_id,
    ownerName: doc.owner_name,
    hashSha256: doc.hash_sha256,
    currentVersion: doc.current_version || 1,
    versions: typeof doc.versions === 'string' ? JSON.parse(doc.versions) : doc.versions || [],
    isFavorite: Boolean(doc.is_favorite),
    isArchived: Boolean(doc.is_archived),
    isShared: Boolean(doc.is_shared),
    visibility: doc.visibility || 'folder',
    downloadPolicy: doc.download_policy || 'folder',
    deletePolicy: doc.delete_policy || 'folder',
    contentSummary: doc.content_summary,
    status: doc.status,
    scanStatus: doc.scan_status,
    tags: doc.tags || [],
    hasContent: Boolean(doc.storage_path),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    trashedAt: trashedAt ? trashedAt.toISOString() : null,
    trashedByName: doc.trashed_by_name || null,
    purgeAt: trashedAt ? new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 86400000).toISOString() : null,
  };
}

export const TRASH_RETENTION_DAYS = 7;

export function getClientIp(req: any): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1'
  );
}

/** Registro de auditoria gerado pelo servidor. */
export async function writeAudit(
  user: { id: string; name: string; role: string; departmentName?: string } | null,
  action: string,
  resourceId: string,
  resourceName: string,
  details: string,
  result: 'SUCCESS' | 'DENIED' | 'BLOCKED',
  ip = 'servidor',
  device = 'Painel Web'
) {
  const actor = user || { id: 'system', name: 'Sistema', role: 'SYSTEM', departmentName: 'Infraestrutura' };
  const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
  const logHash = crypto.createHash('sha256').update(logId + actor.id + Date.now()).digest('hex');
  try {
    await pool.query(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_name, role, department, action,
        resource_id, resource_name, details, ip_address, device_info, result, hash
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        logId,
        actor.id,
        actor.name,
        actor.role,
        actor.departmentName || 'Geral',
        action,
        resourceId,
        resourceName,
        details,
        ip,
        device,
        result,
        logHash,
      ]
    );
  } catch (e) {
    console.warn('[Audit Log Insert Warning]', e);
  }
}
