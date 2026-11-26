import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { decorateFolders } from '../services/sharing';
import { requireAuth } from '../auth/middleware';
import { canAccess, can, isDepartmentManager, roleOf, writeAudit, getClientIp, visibleFolderIds, loadFolderIndex, folderVisible, docPolicyDecision, TRASH_RETENTION_DAYS } from '../services/documentAccess';
import { isFileStorageReady, createDecryptStream } from '../services/fileStorage';
import { ZipStream, safeZipName } from '../services/zipWriter';
import { cleanFolderName } from '../services/documentRules';

export const foldersRouter = Router();

export function toFolderDto(f: any) {
  return {
    id: f.id,
    name: f.name,
    departmentId: f.department_id,
    departmentName: f.department_name,
    parentId: f.parent_id || null,
    isLocked: Boolean(f.is_locked),
    isPrivate: Boolean(f.is_private),
    createdBy: f.created_by || null,
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


foldersRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const visible = await visibleFolderIds(user);
    const { rows } = await pool.query('SELECT * FROM folders ORDER BY name ASC');
    return res.json(await decorateFolders(rows.filter((f: any) => visible.has(f.id)).map(toFolderDto), user));
  } catch (err: any) {
    console.error('[FOLDERS GET ERROR]', err);
    return res.status(503).json({ error: 'Erro ao listar pastas do banco de dados.' });
  }
});

foldersRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { departmentId, parentId, description, isLocked, isPrivate } = req.body;
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

    if (!(await canAccess(user, 'CREATE_FOLDER', departmentId, parent ? parent.id : null))) {
      return res.status(403).json({
        error:
          departmentId === user.departmentId
            ? 'Você não tem permissão para criar pastas neste local.'
            : 'Você só pode criar pastas no seu próprio setor.',
      });
    }

    // Colaborador não define permissões: só pode marcar como privada (só ele + gestão + diretoria)
    const isManager = isDepartmentManager(user, departmentId);
    const lockedFlag = isManager ? Boolean(isLocked) : false;
    const privateFlag = Boolean(isPrivate);

    const { rows: dup } = await pool.query(
      `SELECT 1 FROM folders WHERE department_id = $1 AND COALESCE(parent_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) LIMIT 1`,
      [departmentId, parent ? parent.id : null, name]
    );
    if (dup.length > 0) return res.status(409).json({ error: 'Já existe uma pasta com esse nome neste local.' });

    const folderId = 'folder-' + crypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO folders (id, name, department_id, department_name, parent_id, description, is_locked, is_private, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [folderId, name, departmentId, dept.name, parent ? parent.id : null, String(description || '').slice(0, 500), lockedFlag, privateFlag, user.id]
    );

    await writeAudit(userCtx(req), 'FOLDER_CREATED', folderId, name, `Pasta ${privateFlag ? 'privada ' : ''}criada no setor ${dept.name}.`, 'SUCCESS', getClientIp(req));

    const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [folderId]);
    return res.status(201).json(toFolderDto(rows[0]));
  } catch (err: any) {
    console.error('[FOLDERS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao criar pasta.' });
  }
});

// ---------------------------------------------------------------------------
// COMPARTILHAR PASTA com pessoas de outras áreas (gestão do setor ou quem criou a pasta)
// ---------------------------------------------------------------------------
async function canManageShares(user: any, folder: any) {
  return isDepartmentManager(user, folder.department_id) || folder.created_by === user.id;
}

foldersRouter.get('/:id/shares', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [req.params.id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });
    if (!(await canManageShares(user, folder))) return res.status(403).json({ error: 'Somente a gestão do setor ou quem criou a pasta podem ver os compartilhamentos.' });
    const { rows } = await pool.query(
      `SELECT s.user_id, s.can_download, s.shared_by_name, s.created_at, u.name, u.email, u.department_name
         FROM folder_shares s JOIN users u ON u.id = s.user_id WHERE s.folder_id = $1 ORDER BY u.name`,
      [folder.id]
    );
    return res.json(
      rows.map((r: any) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        departmentName: r.department_name,
        canDownload: Boolean(r.can_download),
        sharedByName: r.shared_by_name,
        createdAt: r.created_at,
      }))
    );
  } catch (err: any) {
    console.error('[FOLDER SHARES GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar compartilhamentos.' });
  }
});

// Substitui a lista de pessoas com quem a pasta está compartilhada
foldersRouter.put('/:id/shares', requireAuth, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const user = (req as any).user;
    const { rows: found } = await client.query('SELECT * FROM folders WHERE id = $1', [req.params.id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });
    if (!(await canManageShares(user, folder))) {
      return res.status(403).json({ error: 'Somente a gestão do setor ou quem criou a pasta podem compartilhá-la.' });
    }
    const list: Array<{ userId: string; canDownload?: boolean }> = Array.isArray(req.body?.shares) ? req.body.shares.slice(0, 500) : [];
    const ids = [...new Set(list.map((s) => String(s.userId)).filter((id) => id && id !== user.id))];
    if (ids.length) {
      const { rows: valid } = await client.query("SELECT id FROM users WHERE id = ANY($1::text[]) AND status <> 'BLOCKED'", [ids]);
      if (valid.length !== ids.length) return res.status(400).json({ error: 'Há pessoas inválidas ou bloqueadas na lista.' });
    }
    const { rows: before } = await client.query('SELECT user_id FROM folder_shares WHERE folder_id = $1', [folder.id]);
    await client.query('BEGIN');
    await client.query('DELETE FROM folder_shares WHERE folder_id = $1', [folder.id]);
    for (const id of ids) {
      const item = list.find((s) => String(s.userId) === id);
      await client.query(
        `INSERT INTO folder_shares (folder_id, user_id, can_download, shared_by, shared_by_name) VALUES ($1, $2, $3, $4, $5)`,
        [folder.id, id, item?.canDownload !== false, user.id, user.name]
      );
    }
    await client.query('COMMIT');
    const added = ids.filter((id) => !before.some((b: any) => b.user_id === id)).length;
    const removed = before.filter((b: any) => !ids.includes(b.user_id)).length;
    await writeAudit(
      userCtx(req),
      'FOLDER_SHARED',
      folder.id,
      folder.name,
      `Compartilhamento da pasta atualizado: ${ids.length} pessoa(s) com acesso (${added} adicionada(s), ${removed} removida(s)).`,
      'SUCCESS',
      getClientIp(req)
    );
    return res.json({ success: true, count: ids.length });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[FOLDER SHARES PUT ERROR]', err);
    return res.status(500).json({ error: 'Erro ao salvar compartilhamento.' });
  } finally {
    client.release();
  }
});

foldersRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });

    const isManager = isDepartmentManager(user, folder.department_id);
    const isCreator = folder.created_by === user.id;
    const onlyOwnerFields = Object.keys(req.body || {}).every((k) => ['name', 'isPrivate', 'description'].includes(k));
    if (!isManager && !(isCreator && onlyOwnerFields)) {
      return res.status(403).json({ error: 'Somente o gestor do setor ou a diretoria podem alterar esta pasta.' });
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
        is_private = COALESCE($8, is_private),
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
        typeof req.body.isPrivate === 'boolean' ? req.body.isPrivate : null,
      ]
    );

    const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    return res.json(toFolderDto(rows[0]));
  } catch (err: any) {
    console.error('[FOLDERS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar pasta.' });
  }
});

// Baixar a pasta inteira (com subpastas) como um único .zip
foldersRouter.get('/:id/download', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  try {
    if (!isFileStorageReady()) return res.status(503).json({ error: 'Armazenamento seguro indisponível no servidor.' });

    const { rows: found } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });

    const index = await loadFolderIndex();
    if (!folderVisible(user, id, index)) {
      await writeAudit(userCtx(req), 'FOLDER_DOWNLOADED', id, folder.name, 'Download da pasta negado: sem acesso.', 'DENIED', getClientIp(req));
      return res.status(403).json({ error: 'Você não tem permissão para acessar esta pasta.' });
    }

    // A pasta e todas as subpastas que esta pessoa enxerga
    const tree: string[] = [id];
    for (let i = 0; i < tree.length; i++) {
      index.forEach((f) => {
        if (f.parent_id === tree[i] && !tree.includes(f.id) && folderVisible(user, f.id, index)) tree.push(f.id);
      });
    }

    // Caminho de cada subpasta dentro do .zip (começando pelo nome da pasta escolhida)
    const nameOf = (fid: string) => index.get(fid)?.name || 'pasta';
    const relPath = (fid: string): string => {
      const parts: string[] = [];
      let cur: string | undefined = fid;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        parts.unshift(nameOf(cur));
        if (cur === id) break;
        cur = index.get(cur)?.parent_id || undefined;
      }
      return parts.join('/');
    };

    const { rows: docs } = await pool.query(
      "SELECT * FROM documents WHERE folder_id = ANY($1::text[]) AND status <> 'trash' AND storage_path IS NOT NULL ORDER BY name",
      [tree]
    );

    // Só entram os arquivos que a pessoa pode ver E baixar (respeita a segurança de cada arquivo)
    const canDownload = (doc: any) => {
      const viewOk = docPolicyDecision(user, doc, 'view') !== false && can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id, index);
      if (!viewOk) return false;
      const policy = docPolicyDecision(user, doc, 'download');
      if (policy === null) return can(user, 'DOWNLOAD_DOCUMENT', doc.department_id, doc.folder_id, index);
      return policy && (can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id, index) || doc.owner_id === user.id || isDepartmentManager(user, doc.department_id));
    };
    const included = docs.filter(canDownload);
    const skipped = docs.length - included.length;

    if (included.length === 0) {
      return res.status(404).json({
        error: skipped > 0 ? 'Você não tem permissão para baixar os arquivos desta pasta.' : 'Esta pasta não tem arquivos para baixar.',
      });
    }

    // Nomes repetidos na mesma pasta do .zip ganham sufixo "(1)", "(2)"…
    const used = new Set<string>();
    const uniquePath = (dir: string, name: string) => {
      let full = dir ? `${dir}/${name}` : name;
      if (!used.has(full.toLowerCase())) { used.add(full.toLowerCase()); return full; }
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let n = 1;
      do {
        full = dir ? `${dir}/${base} (${n})${ext}` : `${base} (${n})${ext}`;
        n++;
      } while (used.has(full.toLowerCase()));
      used.add(full.toLowerCase());
      return full;
    };

    const zipName = (safeZipName(folder.name) || 'pasta') + '.zip';
    const asciiName = zipName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    const zip = new ZipStream(res);
    let added = 0;
    try {
      for (const doc of included) {
        const dir = relPath(doc.folder_id);
        const entry = uniquePath(dir, doc.name);
        // Um arquivo por vez (await), para manter o uso de memória baixo mesmo com pastas grandes
        await zip.addFile(entry, createDecryptStream(doc.storage_path), String(doc.extension || ''));
        added++;
      }
    } catch (err) {
      // Conexão caiu no meio ou arquivo corrompido: encerra sem deixar o .zip pela metade "ok"
      console.error('[FOLDER DOWNLOAD STREAM ERROR]', err);
      try { res.destroy(); } catch {}
      return;
    }
    await zip.finish();

    await writeAudit(
      userCtx(req),
      'FOLDER_DOWNLOADED',
      id,
      folder.name,
      `Pasta baixada em .zip: ${added} arquivo(s)${skipped > 0 ? `; ${skipped} sem permissão de download ficaram de fora` : ''}.`,
      'SUCCESS',
      getClientIp(req)
    );
  } catch (err: any) {
    console.error('[FOLDER DOWNLOAD ERROR]', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Erro ao baixar a pasta.' });
    try { res.destroy(); } catch {}
  }
});

foldersRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { rows: found } = await client.query('SELECT * FROM folders WHERE id = $1', [id]);
    const folder = found[0];
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });

    const manager = isDepartmentManager(user, folder.department_id);
    if (!manager && folder.created_by !== user.id && !(await canAccess(user, 'DELETE_FOLDER', folder.department_id, id))) {
      return res.status(403).json({ error: 'Você não tem permissão para excluir esta pasta.' });
    }

    // Toda a árvore: a pasta e as subpastas (de qualquer nível)
    const { rows: allFolders } = await client.query('SELECT * FROM folders WHERE department_id = $1', [folder.department_id]);
    const byId = new Map<string, any>(allFolders.map((f: any) => [f.id, f]));
    const tree: string[] = [id];
    for (let i = 0; i < tree.length; i++) {
      allFolders.filter((f: any) => f.parent_id === tree[i]).forEach((f: any) => tree.push(f.id));
    }
    const pathOf = (fid: string) => {
      const parts: string[] = [];
      let cur = byId.get(fid);
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        parts.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      return parts.join('/');
    };

    const { rows: docs } = await client.query(
      "SELECT * FROM documents WHERE folder_id = ANY($1::text[]) AND status <> 'trash'",
      [tree]
    );

    // Quem não é da gestão só exclui se puder excluir tudo o que está dentro
    if (!manager) {
      const index = await loadFolderIndex();
      const othersPrivateFolders = tree.filter((fid) => {
        const f = byId.get(fid);
        return f && f.is_private && f.created_by !== user.id;
      });
      let blocked = 0;
      for (const d of docs) {
        const policy = docPolicyDecision(user, d, 'delete');
        const ok = policy === null ? d.owner_id === user.id || can(user, 'DELETE_DOCUMENT', d.department_id, d.folder_id, index) : policy;
        if (!ok) blocked++;
      }
      if (blocked > 0 || othersPrivateFolders.length > 0) {
        await writeAudit(userCtx(req), 'FOLDER_DELETED', id, folder.name, 'Exclusão da pasta negada: há conteúdo protegido.', 'DENIED', getClientIp(req));
        return res.status(403).json({
          error:
            blocked > 0
              ? `A pasta tem ${blocked} arquivo(s) que você não pode excluir (protegidos por outra pessoa ou pela gestão). Peça ao gestor do setor.`
              : 'A pasta tem subpastas privadas de outras pessoas. Somente a gestão do setor pode excluí-la.',
        });
      }
    }

    await client.query('BEGIN');
    // Arquivos vão para a lixeira do setor (7 dias), guardando o caminho para recriar as pastas ao restaurar
    for (const d of docs) {
      await client.query(
        `UPDATE documents SET status = 'trash', trashed_at = NOW(), trashed_by = $1, trashed_by_name = $2, trashed_path = $3, updated_at = NOW()
         WHERE id = $4`,
        [user.id, user.name, pathOf(d.folder_id), d.id]
      );
    }
    // Arquivos que já estavam na lixeira também guardam o caminho
    await client.query(
      "UPDATE documents SET trashed_path = COALESCE(trashed_path, $2) WHERE folder_id = ANY($1::text[]) AND status = 'trash'",
      [tree, pathOf(id)]
    );
    await client.query('DELETE FROM folders WHERE id = ANY($1::text[])', [tree]);
    await client.query('COMMIT');

    await writeAudit(
      userCtx(req),
      'FOLDER_DELETED',
      id,
      folder.name,
      `Pasta removida do setor ${folder.department_name} com ${tree.length - 1} subpasta(s); ${docs.length} arquivo(s) enviados para a lixeira (${TRASH_RETENTION_DAYS} dias).`,
      'SUCCESS',
      getClientIp(req)
    );
    return res.json({ success: true, deletedId: id, deletedFolderIds: tree, trashedDocuments: docs.length });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[FOLDERS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir pasta.' });
  } finally {
    client.release();
  }
});
