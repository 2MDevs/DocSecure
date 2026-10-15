import { pool } from '../db';

/**
 * Compartilhamento de pastas com pessoas de outras áreas e favoritos por pessoa.
 */
const READ = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT'];

export type ShareRow = { folder_id: string; can_download: boolean; department_id: string };

/** Pastas compartilhadas com este usuário */
export async function loadUserShares(userId: string): Promise<ShareRow[]> {
  try {
    const { rows } = await pool.query(
      `SELECT s.folder_id, s.can_download, f.department_id
         FROM folder_shares s JOIN folders f ON f.id = s.folder_id
        WHERE s.user_id = $1`,
      [userId]
    );
    return rows;
  } catch {
    return []; // tabela ainda não criada (primeira inicialização)
  }
}

/**
 * Acrescenta ao usuário (da sessão) as pastas compartilhadas com ele.
 * Em pastas de outro setor ele ganha só leitura (com ou sem download), nunca enviar/excluir.
 */
export async function withFolderShares(user: any) {
  if (!user?.id) return user;
  const shares = await loadUserShares(user.id);
  if (!shares.length) return { ...user, sharedFolders: [], sharedFolderIds: [] };
  const permitted = new Set<string>(user.permittedFolderIds || []);
  const granular: Record<string, string[]> = { ...(user.granularPermissions || {}) };
  for (const s of shares) {
    permitted.add(s.folder_id);
    if (s.department_id !== user.departmentId && granular[s.folder_id] === undefined) {
      granular[s.folder_id] = s.can_download ? [...READ, 'DOWNLOAD_DOCUMENT'] : [...READ];
    }
  }
  return {
    ...user,
    permittedFolderIds: [...permitted],
    granularPermissions: granular,
    sharedFolders: shares.map((s) => ({ folderId: s.folder_id, canDownload: Boolean(s.can_download) })),
    sharedFolderIds: shares.map((s) => s.folder_id),
  };
}

/** Quantas pessoas têm cada pasta compartilhada (para o ícone de "compartilhada") */
export async function shareCounts(): Promise<Map<string, number>> {
  try {
    const { rows } = await pool.query('SELECT folder_id, COUNT(*)::int AS n FROM folder_shares GROUP BY folder_id');
    return new Map(rows.map((r: any) => [r.folder_id, r.n]));
  } catch {
    return new Map();
  }
}

/** Marca nas pastas: compartilhada comigo? com quantas pessoas? */
export async function decorateFolders(dtos: any[], user: any) {
  const counts = await shareCounts();
  const mine = new Map<string, boolean>((user?.sharedFolders || []).map((s: any) => [s.folderId, s.canDownload]));
  return dtos.map((f) => ({
    ...f,
    sharedWithMe: mine.has(f.id),
    sharedCanDownload: mine.has(f.id) ? mine.get(f.id) : undefined,
    shareCount: counts.get(f.id) || 0,
  }));
}

/** Favoritos de cada pessoa */
export async function favoriteIds(userId: string): Promise<Set<string>> {
  try {
    const { rows } = await pool.query('SELECT document_id FROM document_favorites WHERE user_id = $1', [userId]);
    return new Set(rows.map((r: any) => r.document_id));
  } catch {
    return new Set();
  }
}

export async function decorateDocuments(dtos: any[], user: any) {
  const favs = await favoriteIds(user?.id);
  return dtos.map((d) => ({ ...d, isFavorite: favs.has(d.id) }));
}
