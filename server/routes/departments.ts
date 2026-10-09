import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

export const departmentsRouter = Router();

// Função auxiliar para recalcular dinamicamente o armazenamento dos setores
export async function getDepartmentsWithRealStorage() {
  const statsRes = await pool.query(
    `SELECT department_id, COALESCE(SUM(size_bytes), 0) as total_bytes, count(*) as total_items
     FROM documents
     WHERE status != 'trash'
     GROUP BY department_id`
  );

  const statsMap = new Map<string, { bytes: number; items: number }>();
  for (const row of statsRes.rows) {
    statsMap.set(row.department_id, {
      bytes: parseInt(row.total_bytes, 10),
      items: parseInt(row.total_items, 10),
    });
  }

  const deptRes = await pool.query('SELECT * FROM departments ORDER BY name ASC');

  return deptRes.rows.map((d) => {
    const stat = statsMap.get(d.id) || { bytes: 0, items: 0 };
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      iconName: d.icon_name || 'Building',
      color: d.color || '#3b82f6',
      storageLimitBytes: parseInt(d.storage_limit_bytes, 10) || 536870912000,
      storageUsedBytes: stat.bytes,
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

departmentsRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id, name, code, iconName, color, storageLimitBytes, managerId, managerName, description } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Nome e código do setor são obrigatórios.' });
    }

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
        storageLimitBytes || 536870912000,
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
        storageLimitBytes,
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
