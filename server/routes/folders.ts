import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';
import { can, isAdminRole, isDepartmentManager, roleOf, writeAudit, getClientIp } from '../services/documentAccess';

export const foldersRouter = Router();

export function toFolderDto(f: any) {
  return {
    id: f.id,
    name: f.name,
    departmentId: f.department_id,
    departmentName: f.department_name,
    parentId: f.parent_id || null,
    isLocked: Boolean(f.is_locked),
    itemCount: f.item_count || 0,
    tags: f.tags || [],
    description: f.description || '',
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}

const userCtx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};

function cleanFolderName(name: unknown): string {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

foldersRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let query = 'SELECT * FROM folders ORDER BY name ASC';
    let params: any[] = [];

    if (!isAdminRole(user)) {
      const permittedIds = user.permittedFolderIds || [];
      if (roleOf(user) === 'MANAGER') {
        query = 'SELECT * FROM folders WHERE department_id = $1 OR id = ANY($2::text[]) ORDER BY name ASC';
        params = [user.departmentId, permittedIds];
      } else {
        query = 'SELECT * FROM folders WHERE id = ANY($1::text[]) ORDER BY name ASC';
        params = [permittedIds];
      }
    }

    const { rows } = await pool.query(query, params);
    return res.json(rows.map(toFolderDto));
  } catch (err: any) {
    console.error('[FOLDERS GET ERROR]', err);
    return res.status(503).json({ error: 'Erro ao listar pastas do banco de dados.' });
  }
});

foldersRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { departmentId, parentId, description, isLocked } = req.body;
    const name = cleanFolderName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Informe o nome da pasta.' });
    if (!departmentId) return res.status(400).json({ error: 'Selecione o setor da pasta.' });

    const { rows: deptRows } = await pool.query('SELECT id, name FROM departments WHERE id = $1', [departmentId]);
    if (deptRows.length === 0) return res.status(404).json({ error: 'Setor não encontrado.' });
    const dept = deptRows[0];

    let parent: any = null;
    if (parentId) {
      const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [parentId]);
      parent = rows[0];
      if (!parent || parent.department_id !== departmentId) {
        return res.status(400).json({ error: 'A pasta superior não pertence a este setor.' });
      }
    }

    if (!can(user, 'CREATE_FOLDER', departmentId, parent ? parent.id : null) && !isDepartmentManager(user, departmentId)) {
      return res.status(403).json({ error: 'Você não tem permissão para criar pastas neste setor.' });
    }

    const { rows: dup } = await pool.query(
      `SELECT 1 FROM folders WHERE department_id = $1 AND COALESCE(parent_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) LIMIT 1`,
      [departmentId, parent ? parent.id : null, name]
    );
    if (dup.length > 0) return res.status(409).json({ error: 'Já existe uma pasta com esse nome neste local.' });

    const folderId = 'folder-' + crypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO folders (id, name, department_id, department_name, parent_id, description, is_locked, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [folderId, name, departmentId, dept.name, parent ? parent.id : null, String(description || '').slice(0, 500), Boolean(isLocked)]
    );

    // Colaborador que cria a pasta passa a enxergá-la
    if (roleOf(user) === 'EMPLOYEE') {
      const permitted: string[] = [...(user.permittedFolderIds || []), folderId];
      await pool.query('UPDATE users SET permitted_folder_ids = $1 WHERE id = $2', [JSON.stringify(permitted), user.id]);
    }

    await writeAudit(userCtx(req), 'FOLDER_CREATED', folderId, name, `Pasta criada no setor ${dept.name}.`, 'SUCCESS', getClientIp(req));

    const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [folderId]);
    return res.status(201).json(toFolderDto(rows[0]));
  } catch (err: any) {
    console.error('[FOLDERS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao criar pasta.' });
  }
});

foldersRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });

    if (!isDepartmentManager(user, folder.department_id)) {
      return res.status(403).json({ error: 'Somente o gestor do setor, a Diretoria ou o Desenvolvedor podem alterar esta pasta.' });
    }

    const name = req.body.name !== undefined ? cleanFolderName(req.body.name) : undefined;
    if (name !== undefined && !name) return res.status(400).json({ error: 'Nome de pasta inválido.' });

    // Mover para outra pasta: precisa ser do mesmo setor e não pode criar ciclo
    let parentId: string | null | undefined = undefined;
    if (req.body.parentId !== undefined) {
      parentId = req.body.parentId || null;
      if (parentId) {
        if (parentId === id) return res.status(400).json({ error: 'Uma pasta não pode ficar dentro dela mesma.' });
        const { rows: target } = await pool.query('SELECT * FROM folders WHERE id = $1', [parentId]);
        if (!target[0] || target[0].department_id !== folder.department_id) {
          return res.status(400).json({ error: 'A pasta de destino precisa ser do mesmo setor.' });
        }
        let cursor = target[0].parent_id;
        for (let i = 0; cursor && i < 100; i++) {
          if (cursor === id) return res.status(400).json({ error: 'Não é possível mover uma pasta para dentro de uma subpasta dela.' });
          const { rows } = await pool.query('SELECT parent_id FROM folders WHERE id = $1', [cursor]);
          cursor = rows[0]?.parent_id;
        }
      }
    }

    await pool.query(
      `UPDATE folders SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_locked = COALESCE($3, is_locked),
        tags = COALESCE($4, tags),
        parent_id = CASE WHEN $5::boolean THEN $6 ELSE parent_id END,
        updated_at = NOW()
       WHERE id = $7`,
      [
        name ?? null,
        req.body.description ?? null,
        typeof req.body.isLocked === 'boolean' ? req.body.isLocked : null,
        Array.isArray(req.body.tags) ? req.body.tags : null,
        parentId !== undefined,
        parentId ?? null,
        id,
      ]
    );

    const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    return res.json(toFolderDto(rows[0]));
  } catch (err: any) {
    console.error('[FOLDERS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar pasta.' });
  }
});

foldersRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });

    if (!isDepartmentManager(user, folder.department_id) && !can(user, 'DELETE_FOLDER', folder.department_id, id)) {
      return res.status(403).json({ error: 'Você não tem permissão para excluir esta pasta.' });
    }

    const { rows: sub } = await pool.query('SELECT COUNT(*)::int AS total FROM folders WHERE parent_id = $1', [id]);
    const { rows: docs } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM documents WHERE folder_id = $1 AND status <> 'trash'",
      [id]
    );
    if (sub[0].total > 0 || docs[0].total > 0) {
      return res.status(409).json({
        error: `A pasta não está vazia (${docs[0].total} arquivo(s) e ${sub[0].total} subpasta(s)). Mova ou exclua o conteúdo antes.`,
      });
    }

    await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    await writeAudit(userCtx(req), 'FOLDER_DELETED', id, folder.name, `Pasta vazia removida do setor ${folder.department_name}.`, 'SUCCESS', getClientIp(req));
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[FOLDERS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir pasta.' });
  }
});
