import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import { syncDevelopersToTI } from '../services/developerDepartment';
import { getServerDisk } from '../services/diskInfo';

const GB = 1024 ** 3;
const fmtGb = (bytes: number) => `${(bytes / GB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;

/** O limite de um setor nunca pode passar do tamanho do disco do servidor. */
function checkStorageLimit(limit: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (limit === undefined || limit === null || limit === '') return { ok: true, value: null };
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Informe um limite de armazenamento válido (em GB).' };
  const disk = getServerDisk();
  if (disk && value > disk.totalBytes) {
    return {
      ok: false,
      error: `O limite do setor (${fmtGb(value)}) não pode ser maior que o armazenamento do servidor (${fmtGb(disk.totalBytes)}).`,
    };
  }
  return { ok: true, value: Math.round(value) };
}

/** Limite padrão de um setor novo: 500 GB ou o disco inteiro, o que for menor. */
function defaultStorageLimit(): number {
  const disk = getServerDisk();
  return disk ? Math.min(500 * GB, Math.floor(disk.totalBytes)) : 500 * GB;
}

export const departmentsRouter = Router();

// Quando um setor é criado, renomeado ou excluído, mantém os desenvolvedores vinculados ao setor de TI
departmentsRouter.use((req: Request, res: Response, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) void syncDevelopersToTI();
    });
  }
  next();
});

// Função auxiliar para recalcular dinamicamente o armazenamento dos setores
export async function getDepartmentsWithRealStorage() {
  // Em uso = documentos ativos; a lixeira continua ocupando o disco (e a quota) até ser apagada
  const statsRes = await pool.query(
    `SELECT department_id,
            COALESCE(SUM(size_bytes) FILTER (WHERE status <> 'trash'), 0) AS total_bytes,
            COUNT(*) FILTER (WHERE status <> 'trash') AS total_items,
            COALESCE(SUM(size_bytes) FILTER (WHERE status = 'trash'), 0) AS trash_bytes,
            COUNT(*) FILTER (WHERE status = 'trash') AS trash_items
     FROM documents
     GROUP BY department_id`
  );

  const statsMap = new Map<string, { bytes: number; items: number; trashBytes: number; trashItems: number }>();
  for (const row of statsRes.rows) {
    statsMap.set(row.department_id, {
      bytes: parseInt(row.total_bytes, 10),
      items: parseInt(row.total_items, 10),
      trashBytes: parseInt(row.trash_bytes, 10),
      trashItems: parseInt(row.trash_items, 10),
    });
  }

  const deptRes = await pool.query('SELECT * FROM departments ORDER BY name ASC');

  return deptRes.rows.map((d) => {
    const stat = statsMap.get(d.id) || { bytes: 0, items: 0, trashBytes: 0, trashItems: 0 };
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      iconName: d.icon_name || 'Building',
      color: d.color || '#3b82f6',
      storageLimitBytes: parseInt(d.storage_limit_bytes, 10) || 536870912000,
      storageUsedBytes: stat.bytes,
      trashBytes: stat.trashBytes,
      trashItemCount: stat.trashItems,
      managerId: d.manager_id,
      managerName: d.manager_name,
      description: d.description || '',
      isLocked: Boolean(d.is_locked),
      itemCount: stat.items,
    };
  });
}

departmentsRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    const list = await getDepartmentsWithRealStorage();
    return res.json(list);
  } catch (err: any) {
    console.error('[DEPARTMENTS GET ERROR]', err);
    return res.status(503).json({ error: 'Erro ao consultar setores no banco de dados.' });
  }
});

// Tamanho do disco do servidor (para a tela de Setores mostrar o máximo permitido)
departmentsRouter.get('/storage-capacity', requireAuth, (_req: Request, res: Response) => {
  const disk = getServerDisk();
  return res.json(disk ? { totalBytes: disk.totalBytes, freeBytes: disk.freeBytes } : { totalBytes: null, freeBytes: null });
});

departmentsRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id, name, code, iconName, color, storageLimitBytes, managerId, managerName, description } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Nome e código do setor são obrigatórios.' });
    }

    const limitCheck = checkStorageLimit(storageLimitBytes);
    if ('error' in limitCheck) return res.status(400).json({ error: limitCheck.error });

    const deptId = id || 'dept-' + code.toLowerCase().trim();

    await pool.query(
      `INSERT INTO departments (id, name, code, icon_name, color, storage_limit_bytes, manager_id, manager_name, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        icon_name = EXCLUDED.icon_name,
        color = EXCLUDED.color,
        storage_limit_bytes = EXCLUDED.storage_limit_bytes,
        manager_id = EXCLUDED.manager_id,
        manager_name = EXCLUDED.manager_name,
        description = EXCLUDED.description`,
      [
        deptId,
        name,
        code.toUpperCase().trim(),
        iconName || 'Building',
        color || '#3b82f6',
        ('value' in limitCheck && limitCheck.value) || defaultStorageLimit(),
        managerId || null,
        managerName || null,
        description || '',
      ]
    );

    const list = await getDepartmentsWithRealStorage();
    const created = list.find((d) => d.id === deptId);
    return res.status(201).json(created);
  } catch (err: any) {
    console.error('[DEPARTMENTS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao salvar setor.' });
  }
});

departmentsRouter.put('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, iconName, color, storageLimitBytes, managerId, managerName, description, isLocked } = req.body;
    const limitCheck = checkStorageLimit(storageLimitBytes);
    if ('error' in limitCheck) return res.status(400).json({ error: limitCheck.error });

    await pool.query(
      `UPDATE departments SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        icon_name = COALESCE($3, icon_name),
        color = COALESCE($4, color),
        storage_limit_bytes = COALESCE($5, storage_limit_bytes),
        manager_id = COALESCE($6, manager_id),
        manager_name = COALESCE($7, manager_name),
        description = COALESCE($8, description),
        is_locked = COALESCE($9, is_locked)
       WHERE id = $10`,
      [
        name,
        code ? code.toUpperCase().trim() : null,
        iconName,
        color,
        'value' in limitCheck ? limitCheck.value : null,
        managerId,
        managerName,
        description,
        isLocked,
        id,
      ]
    );

    const list = await getDepartmentsWithRealStorage();
    const updated = list.find((d) => d.id === id);
    return res.json(updated);
  } catch (err: any) {
    console.error('[DEPARTMENTS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar setor.' });
  }
});

// Excluir setor (somente se estiver vazio: sem documentos e sem usuários vinculados)
departmentsRouter.delete('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const exists = await pool.query('SELECT id, name FROM departments WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Setor não encontrado.' });
    }

    const docs = await pool.query('SELECT COUNT(*)::int AS total FROM documents WHERE department_id = $1', [id]);
    if (docs.rows[0].total > 0) {
      return res.status(409).json({
        error: `Este setor possui ${docs.rows[0].total} documento(s), incluindo os da lixeira. Mova ou exclua os documentos antes de remover o setor.`,
      });
    }

    const members = await pool.query('SELECT COUNT(*)::int AS total FROM users WHERE department_id = $1', [id]);
    if (members.rows[0].total > 0) {
      return res.status(409).json({
        error: `Este setor possui ${members.rows[0].total} usuário(s) vinculado(s). Transfira-os para outro setor antes de removê-lo.`,
      });
    }

    await pool.query('DELETE FROM folders WHERE department_id = $1', [id]);
    await pool.query('DELETE FROM departments WHERE id = $1', [id]);

    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[DEPARTMENTS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir setor.' });
  }
});
