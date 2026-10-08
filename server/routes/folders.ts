import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';

export const foldersRouter = Router();

const memoryFolders: any[] = [];

foldersRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let query = 'SELECT * FROM folders ORDER BY name ASC';
    let params: any[] = [];

    // Se não for Administrador/Diretor, filtra apenas pastas autorizadas
    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR') {
      const permittedIds = user.permittedFolderIds || [];
      if (user.role === 'MANAGER') {
        query = 'SELECT * FROM folders WHERE department_id = $1 OR id = ANY($2::text[]) ORDER BY name ASC';
        params = [user.departmentId, permittedIds];
      } else {
        query = 'SELECT * FROM folders WHERE id = ANY($1::text[]) ORDER BY name ASC';
        params = [permittedIds];
      }
    }

    const { rows } = await pool.query(query, params);
    return res.json(
      rows.map((f) => ({
        id: f.id,
        name: f.name,
        departmentId: f.department_id,
        departmentName: f.department_name,
        parentId: f.parent_id,
        isLocked: Boolean(f.is_locked),
        itemCount: f.item_count || 0,
        tags: f.tags || [],
        description: f.description || '',
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      }))
    );
  } catch (err: any) {
    // Retorna pastas em memória se o banco estiver offline
    return res.json(memoryFolders);
  }
});

foldersRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, departmentId, departmentName, parentId, description, isLocked } = req.body;
    if (!name || !departmentId) {
      return res.status(400).json({ error: 'Nome e departamento da pasta são obrigatórios.' });
    }

    const folderId = 'folder-' + crypto.randomBytes(8).toString('hex');
    try {
      await pool.query(
        `INSERT INTO folders (id, name, department_id, department_name, parent_id, description, is_locked, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [folderId, name, departmentId, departmentName || 'Geral', parentId || null, description || '', isLocked || false]
      );

      const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [folderId]);
      return res.status(201).json(rows[0]);
    } catch {
      const newFolder = {
        id: folderId,
        name,
        departmentId,
        departmentName: departmentName || 'Geral',
        parentId: parentId || null,
        description: description || '',
        isLocked: isLocked || false,
        itemCount: 0,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryFolders.push(newFolder);
      return res.status(201).json(newFolder);
    }
  } catch (err: any) {
    console.error('[FOLDERS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao criar pasta.' });
  }
});

foldersRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, isLocked, tags, parentId } = req.body;

    await pool.query(
      `UPDATE folders SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_locked = COALESCE($3, is_locked),
        tags = COALESCE($4, tags),
        parent_id = COALESCE($5, parent_id),
        updated_at = NOW()
       WHERE id = $6`,
      [name, description, isLocked, tags, parentId, id]
    );

    const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    return res.json(rows[0]);
  } catch (err: any) {
    const { name, description, isLocked, tags, parentId } = req.body;
    const mem = memoryFolders.find((f) => f.id === req.params.id);
    if (mem) {
      if (name !== undefined) mem.name = name;
      if (description !== undefined) mem.description = description;
      if (isLocked !== undefined) mem.isLocked = isLocked;
      if (tags !== undefined) mem.tags = tags;
      if (parentId !== undefined) mem.parentId = parentId;
      mem.updatedAt = new Date().toISOString();
      return res.json(mem);
    }
    return res.status(500).json({ error: 'Erro ao atualizar pasta.' });
  }
});

foldersRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    const idx = memoryFolders.findIndex((f) => f.id === req.params.id);
    if (idx > -1) {
      memoryFolders.splice(idx, 1);
      return res.json({ success: true, deletedId: req.params.id });
    }
    return res.status(500).json({ error: 'Erro ao excluir pasta.' });
  }
});
