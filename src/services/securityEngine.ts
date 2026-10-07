import { User, PermissionType, AuditLog, AuditAction } from '../types';

export interface SecurityCheckResult {
  allowed: boolean;
  code: 200 | 401 | 403 | 423; // 423 = locked
  reason?: string;
}

/**
 * Validates whether a user is authorized to perform a specific action on a folder or document.
 * This is the central security verification engine simulating backend validation on EVERY request.
 */
export function verifyPermission(
  user: User | null,
  resourceType: 'folder' | 'document' | 'department' | 'user' | 'system' | 'device',
  resourceId: string,
  departmentId: string | undefined,
  requiredPermission: PermissionType | 'ADMIN_ONLY' | 'DIRECTOR_OR_ADMIN',
  folderId?: string
): SecurityCheckResult {
  if (!user) {
    return {
      allowed: false,
      code: 401,
      reason: 'Sessão não autenticada. Faça login para continuar.',
    };
  }

  if (user.status === 'BLOCKED') {
    return {
      allowed: false,
      code: 423,
      reason: 'Conta bloqueada por razões de segurança. Solicite desbloqueio a um administrador.',
    };
  }

  // Developer has full system administration
  if (user.role === 'DEVELOPER') {
    return { allowed: true, code: 200 };
  }

  // Check Developer-only system resources
  if (requiredPermission === 'ADMIN_ONLY') {
    return {
      allowed: false,
      code: 403,
      reason: 'Acesso negado: Recurso exclusivo para Administradores de Sistema (Desenvolvedor).',
    };
  }

  // Director has corporate overview
  if (user.role === 'DIRECTOR') {
    return { allowed: true, code: 200 };
  }

  if (requiredPermission === 'DIRECTOR_OR_ADMIN') {
    return {
      allowed: false,
      code: 403,
      reason: 'Acesso negado: Permissão restrita à Diretoria Executiva ou Administrador.',
    };
  }

  // Manager is strictly restricted to their department!
  if (user.role === 'MANAGER') {
    if (departmentId && departmentId !== user.departmentId) {
      return {
        allowed: false,
        code: 403,
        reason: `Acesso negado: Você é Gestor do setor ${user.departmentName} e não possui permissão para acessar recursos do setor ${departmentId}.`,
      };
    }

    // Check if manager has specific granular restriction
    const targetFolderId = folderId || resourceId;
    const managerPerms =
      (folderId && user.granularPermissions[folderId]) ||
      user.granularPermissions[targetFolderId] ||
      user.granularPermissions['*'];

    if (managerPerms && typeof requiredPermission === 'string') {
      if (!managerPerms.includes(requiredPermission as PermissionType)) {
        return {
          allowed: false,
          code: 403,
          reason: `Acesso negado: A permissão [${requiredPermission}] foi revogada para este recurso.`,
        };
      }
    }

    return { allowed: true, code: 200 };
  }

  // Employee (Colaborador) has strict granular permissions
  if (user.role === 'EMPLOYEE') {
    // 1. Department root overview access: employee always can view their own department root
    if (resourceType === 'department') {
      if (departmentId === user.departmentId || departmentId === 'dept-gerais') {
        return { allowed: true, code: 200 };
      }
      return {
        allowed: false,
        code: 403,
        reason: `Acesso negado: Você pertence ao setor ${user.departmentName} e não possui autorização para o setor ${departmentId}.`,
      };
    }

    const targetFolderId = folderId || (resourceType === 'folder' ? resourceId : undefined);

    // 2. Check department boundary - cannot cross into another department unless explicitly permitted
    if (
      departmentId &&
      departmentId !== user.departmentId &&
      (!targetFolderId || (!user.permittedFolderIds?.includes(targetFolderId) && !user.granularPermissions?.[targetFolderId]))
    ) {
      return {
        allowed: false,
        code: 403,
        reason: `Acesso negado: Colaboradores só podem acessar pastas e documentos expressamente liberados pelo Gestor de sua área.`,
      };
    }

    // 3. Resolve user's explicit granular permissions with strict priority:
    // a. Explicit folder-level permissions (if defined for folderId)
    // b. Explicit resource-level permissions (if defined for resourceId)
    // c. Department-level granular permissions
    // d. Wildcard permissions
    // e. Explicit permittedFolderIds list
    // f. Fallback for folders within employee's own department when no restrictions were explicitly set
    let userPermissions: PermissionType[] | undefined = undefined;

    if (folderId && user.granularPermissions && user.granularPermissions[folderId] !== undefined) {
      userPermissions = user.granularPermissions[folderId];
    } else if (resourceId && user.granularPermissions && user.granularPermissions[resourceId] !== undefined) {
      userPermissions = user.granularPermissions[resourceId];
    } else if (targetFolderId && user.granularPermissions && user.granularPermissions[targetFolderId] !== undefined) {
      userPermissions = user.granularPermissions[targetFolderId];
    } else if (departmentId && user.granularPermissions && user.granularPermissions[departmentId] !== undefined) {
      userPermissions = user.granularPermissions[departmentId];
    } else if (user.granularPermissions && user.granularPermissions['*'] !== undefined) {
      userPermissions = user.granularPermissions['*'];
    } else if (targetFolderId && user.permittedFolderIds && user.permittedFolderIds.includes(targetFolderId)) {
      userPermissions = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT'];
    } else if (departmentId === user.departmentId) {
      // If within employee's own department and not explicitly blocked in granularPermissions
      userPermissions = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT', 'UPLOAD_DOCUMENT'];
    } else {
      userPermissions = [];
    }

    const permLabels: Record<string, string> = {
      DOWNLOAD_DOCUMENT: 'Download de Cópia (DOWNLOAD_DOCUMENT)',
      VIEW_DOCUMENT: 'Visualização de Documento (VIEW_DOCUMENT)',
      VIEW_FOLDER: 'Visualização de Pasta (VIEW_FOLDER)',
      LIST_FILES: 'Listagem de Arquivos (LIST_FILES)',
      UPLOAD_DOCUMENT: 'Envio de Documento (UPLOAD_DOCUMENT)',
      EDIT_DOCUMENT: 'Edição de Documento (EDIT_DOCUMENT)',
      DELETE_DOCUMENT: 'Exclusão de Documento (DELETE_DOCUMENT)',
      CREATE_FOLDER: 'Criação de Subpastas (CREATE_FOLDER)',
    };

    if (typeof requiredPermission === 'string') {
      const isGranted = userPermissions.includes(requiredPermission as PermissionType);
      if (!isGranted) {
        const label = permLabels[requiredPermission] || requiredPermission;
        return {
          allowed: false,
          code: 403,
          reason: `Acesso negado: A permissão de [${label}] foi revogada pelo Gestor para seu usuário nesta pasta/documento.`,
        };
      }
    }

    return { allowed: true, code: 200 };
  }

  return {
    allowed: false,
    code: 403,
    reason: 'Acesso não autorizado.',
  };
}

/**
 * Computes a pseudo-SHA256 checksum for immutable ledger integrity simulation
 */
export function generateHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + 'a9f78b';
}

/**
 * Creates an immutable audit log entry
 */
export function createAuditEntry(
  user: User | { id: string; name: string; role: any; departmentName?: string } | null,
  action: AuditAction,
  resourceName: string,
  details: string,
  result: 'SUCCESS' | 'DENIED' | 'BLOCKED',
  previousHash?: string
): AuditLog {
  const timestamp = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rawPayload = `${timestamp}|${user?.id || 'anon'}|${action}|${resourceName}|${result}|${previousHash || 'genesis'}`;
  const hash = generateHash(rawPayload);

  return {
    id: 'audit-' + Math.random().toString(36).substring(2, 9),
    timestamp,
    userId: user?.id || 'anonymous',
    userName: user?.name || 'Desconhecido',
    role: user?.role || 'EMPLOYEE',
    department: user?.departmentName || 'Geral',
    action,
    resourceName,
    details,
    ipAddress: '187.54.120.' + Math.floor(Math.random() * 250 + 1),
    deviceInfo: navigator.userAgent.includes('Mobile') ? 'Mobile Safari / iOS' : 'Chrome 129 / macOS',
    result,
    hash,
    previousHash,
  };
}
