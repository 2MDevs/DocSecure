import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, requireRole, sanitizeUser, revokeAllUserSessions } from '../auth/middleware';
import { sendPasswordResetEmail } from '../mailer';

export const usersRouter = Router();

// Listar Usuários (Filtrado por permissão do requisitante)
usersRouter.get('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let query = 'SELECT * FROM users ORDER BY created_at DESC';
    let params: any[] = [];

    // Gestores veem apenas colaboradores do seu respectivo setor
    if (user.role === 'MANAGER') {
      query = 'SELECT * FROM users WHERE department_id = $1 ORDER BY created_at DESC';
      params = [user.departmentId];
    }

    const { rows } = await pool.query(query, params);
    return res.json(rows.map(sanitizeUser));
  } catch (err: any) {
    const user = (req as any).user;
    return res.json(user ? [user] : []);
  }
});

// Criar Usuário (Apenas Desenvolvedores e Diretores)
usersRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      matricula,
      cpf,
      phone,
      role,
      departmentId,
      departmentName,
      cargo,
      avatar,
      initialPassword,
      twoFactorEnabled,
      permittedFolderIds,
      granularPermissions,
    } = req.body;

    if (!name || !email || !matricula || !role || !departmentId) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    if (String(role).toUpperCase() === 'DEVELOPER') {
      return res.status(403).json({
        error: 'O papel de Desenvolvedor é restrito e definido exclusivamente pela variável de ambiente DEVELOPER_EMAILS.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Checar unicidade
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const newId = 'user-' + crypto.randomBytes(8).toString('hex');
    let passwordHash: string | null = null;
    let mustChangePassword = true;

    if (initialPassword && String(initialPassword).length >= 10) {
      passwordHash = await bcrypt.hash(String(initialPassword), 12);
    }

    await pool.query(
      `INSERT INTO users (
        id, name, email, matricula, cpf, phone, role, department_id, department_name, cargo, avatar,
        status, password_hash, must_change_password, two_factor_enabled, permitted_folder_ids, granular_permissions, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE', $12, $13, $14, $15, $16, NOW())`,
      [
        newId,
        name,
        cleanEmail,
        matricula,
        cpf || null,
        phone || null,
        role,
        departmentId,
        departmentName || 'Geral',
        cargo || 'Colaborador',
        avatar || null,
        passwordHash,
        mustChangePassword,
        twoFactorEnabled ?? true,
        JSON.stringify(permittedFolderIds || []),
        JSON.stringify(granularPermissions || {}),
      ]
    );

    // Se não informou senha inicial, dispara e-mail de primeiro acesso
    if (!passwordHash) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      await pool.query(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
        ['reset_' + crypto.randomBytes(16).toString('hex'), newId, resetHash]
      );

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}?reset_token=${resetToken}`;
      sendPasswordResetEmail(cleanEmail, name, resetUrl).catch(console.error);
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [newId]);
    return res.status(201).json(sanitizeUser(rows[0]));
  } catch (err: any) {
    console.error('[USERS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao cadastrar novo usuário.' });
  }
});

// Atualizar Permissões Granulares do Usuário
usersRouter.put('/:id/permissions', requireAuth, requireRole('DEVELOPER', 'DIRECTOR', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { folderId, permissions } = req.body;

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const user = userRes.rows[0];
    const permittedFolders: string[] = typeof user.permitted_folder_ids === 'string'
      ? JSON.parse(user.permitted_folder_ids)
      : user.permitted_folder_ids || [];
    const granular: Record<string, any> = typeof user.granular_permissions === 'string'
      ? JSON.parse(user.granular_permissions)
      : user.granular_permissions || {};

    if (permissions && permissions.length > 0) {
      if (!permittedFolders.includes(folderId)) permittedFolders.push(folderId);
      granular[folderId] = permissions;
    } else {
      const idx = permittedFolders.indexOf(folderId);
      if (idx > -1) permittedFolders.splice(idx, 1);
      delete granular[folderId];
    }

    await pool.query(
      `UPDATE users SET permitted_folder_ids = $1, granular_permissions = $2 WHERE id = $3`,
      [JSON.stringify(permittedFolders), JSON.stringify(granular), id]
    );

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.json(sanitizeUser(updated.rows[0]));
  } catch (err: any) {
    console.error('[PERMISSIONS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar permissões do usuário.' });
  }
});

// Atualizar Usuário
usersRouter.put('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      matricula,
      cpf,
      phone,
      role,
      departmentId,
      departmentName,
      cargo,
      status,
      password,
      twoFactorEnabled,
      permittedFolderIds,
      granularPermissions,
    } = req.body;

    if (role && String(role).toUpperCase() === 'DEVELOPER') {
      return res.status(403).json({
        error: 'O papel de Desenvolvedor é restrito e definido exclusivamente pela variável de ambiente DEVELOPER_EMAILS.',
      });
    }

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    let passwordHash: string | undefined;
    if (password) {
      if (password.length < 10) {
        return res.status(400).json({ error: 'A nova senha deve possuir no mínimo 10 caracteres.' });
      }
      passwordHash = await bcrypt.hash(password, 12);
      // Se trocou senha, invalida todas as sessões anteriores
      await revokeAllUserSessions(id);
    }

    // Se o usuário foi bloqueado, revoga as sessões
    if (status === 'BLOCKED') {
      await revokeAllUserSessions(id);
    }

    await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        matricula = COALESCE($3, matricula),
        cpf = COALESCE($4, cpf),
        phone = COALESCE($5, phone),
        role = COALESCE($6, role),
        department_id = COALESCE($7, department_id),
        department_name = COALESCE($8, department_name),
        cargo = COALESCE($9, cargo),
        status = COALESCE($10, status),
        two_factor_enabled = COALESCE($11, two_factor_enabled),
        permitted_folder_ids = COALESCE($12, permitted_folder_ids),
        granular_permissions = COALESCE($13, granular_permissions),
        password_hash = COALESCE($14, password_hash)
       WHERE id = $15`,
      [
        name,
        email ? String(email).trim().toLowerCase() : null,
        matricula,
        cpf,
        phone,
        role,
        departmentId,
        departmentName,
        cargo,
        status,
        twoFactorEnabled,
        permittedFolderIds ? JSON.stringify(permittedFolderIds) : null,
        granularPermissions ? JSON.stringify(granularPermissions) : null,
        passwordHash,
        id,
      ]
    );

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.json(sanitizeUser(updated.rows[0]));
  } catch (err: any) {
    console.error('[USERS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
  }
});

// Excluir Usuário
usersRouter.delete('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    if (id === user.id) {
      return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário conectado.' });
    }

    await revokeAllUserSessions(id);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[USERS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
