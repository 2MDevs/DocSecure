import crypto from 'crypto';
import { pool } from '../db';

/**
 * Regras de acesso a pastas e documentos aplicadas NO SERVIDOR (espelham o
 * securityEngine do frontend, que serve só para a interface).
 *
 * - Desenvolvedor e Diretor: acesso total.
 * - Gestor: tudo no próprio setor (salvo restrição granular); em outros setores só
 *   pastas explicitamente liberadas.
 * - Colaborador: pastas liberadas + raiz do próprio setor; permissões granulares têm prioridade.
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
const EMPLOYEE_OWN_DEPT_DEFAULT: DocPermission[] = [...READ_PERMS, 'UPLOAD_DOCUMENT'];

export const roleOf = (user: any) => String(user?.role || '').toUpperCase();
export const isAdminRole = (user: any) => ['DEVELOPER', 'DIRECTOR'].includes(roleOf(user));

function resolvePermissions(user: any, departmentId: string, folderId: string | null): DocPermission[] {
  const role = roleOf(user);
  if (user?.status === 'BLOCKED') return [];
  if (role === 'DEVELOPER' || role === 'DIRECTOR') return ALL_PERMS;

  const granular: Record<string, DocPermission[]> = user.granularPermissions || {};
  const permitted: string[] = user.permittedFolderIds || [];
  const ownDept = departmentId === user.departmentId;
  const folderPermitted = Boolean(folderId && (permitted.includes(folderId) || granular[folderId] !== undefined));

  if (role === 'MANAGER') {
    if (!ownDept && !folderPermitted) return [];
    const explicit = (folderId && granular[folderId]) || granular['*'];
    if (explicit) return explicit;
    return ownDept ? ALL_PERMS : READ_PERMS;
  }

  if (role === 'EMPLOYEE') {
    if (!ownDept && !folderPermitted) return [];
    if (folderId && granular[folderId] !== undefined) return granular[folderId];
    if (granular[departmentId] !== undefined) return granular[departmentId];
    if (granular['*'] !== undefined) return granular['*'];
    if (folderId && permitted.includes(folderId)) return READ_PERMS;
    if (ownDept) return EMPLOYEE_OWN_DEPT_DEFAULT;
    return [];
  }

  return [];
}

export function can(user: any, permission: DocPermission, departmentId: string, folderId: string | null): boolean {
  return resolvePermissions(user, departmentId, folderId).includes(permission);
}

/** Gestor do setor ou administração (Desenvolvedor/Diretor). */
export function isDepartmentManager(user: any, departmentId: string): boolean {
  return isAdminRole(user) || (roleOf(user) === 'MANAGER' && user.departmentId === departmentId);
}

/** Filtro SQL de documentos visíveis para o usuário (alias de tabela "d"). */
export function documentVisibilityFilter(user: any, startIndex = 1): { sql: string; params: any[] } {
  if (isAdminRole(user)) return { sql: 'TRUE', params: [] };
  const permitted = user.permittedFolderIds || [];
  const a = startIndex;
  if (roleOf(user) === 'MANAGER') {
    return {
      sql: `(d.department_id = $${a} OR d.folder_id = ANY($${a + 1}::text[]))`,
      params: [user.departmentId, permitted],
    };
  }
  return {
    sql: `(d.folder_id = ANY($${a}::text[]) OR (d.department_id = $${a + 1} AND d.folder_id IS NULL))`,
    params: [permitted, user.departmentId],
  };
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
