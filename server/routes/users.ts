import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, requireRole, sanitizeUser, revokeAllUserSessions } from '../auth/middleware';
import { sendAccessCredentialsEmail } from '../mailer';

/**
 * Gera uma senha provisória aleatória que atende à política do sistema
 * (mínimo 10 caracteres com letras e números). Evita caracteres ambíguos (0/O, 1/l/I).
 */
function generateTemporaryPassword(length = 12): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[crypto.randomInt(letters.length)], digits[crypto.randomInt(digits.length)]];
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function getLoginUrl(req: Request): string {
  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${baseUrl}/login`;
}

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

// Criar Usuário (Desenvolvedores e Diretores; Gestores apenas colaboradores do próprio setor)
usersRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
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

    if (
      String(requester.role).toUpperCase() === 'MANAGER' &&
      (String(role).toUpperCase() !== 'EMPLOYEE' || departmentId !== requester.departmentId)
    ) {
      return res.status(403).json({
        error: 'Gestores só podem cadastrar colaboradores no próprio setor.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Checar unicidade
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const newId = 'user-' + crypto.randomBytes(8).toString('hex');
    // Senha provisória: informada pelo administrador (se cumprir a política) ou gerada aleatoriamente.
    // Em ambos os casos o usuário é obrigado a trocá-la no primeiro acesso.
    const providedPassword = initialPassword ? String(initialPassword) : '';
    const temporaryPassword =
      providedPassword.length >= 10 && /[a-zA-Z]/.test(providedPassword) && /[0-9]/.test(providedPassword)
        ? providedPassword
        : generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const mustChangePassword = true;

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

    // Envia por e-mail os dados de acesso com a senha provisória
    const emailSent = await sendAccessCredentialsEmail(cleanEmail, name, temporaryPassword, getLoginUrl(req));

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [newId]);
    return res.status(201).json({
      ...sanitizeUser(rows[0]),
      emailSent,
      // Só é devolvida ao administrador quando o e-mail falhou, para que ele possa repassá-la manualmente
      temporaryPassword: emailSent ? undefined : temporaryPassword,
    });
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
      directorAccess,
    } = req.body;

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const requester = (req as any).user;
    const requesterRole = String(requester.role).toUpperCase();
    const target = userRes.rows[0];
    const targetRole = String(target.role || '').toUpperCase();
    // Perfil só é considerado quando realmente muda
    const nextRole = role && String(role).toUpperCase() !== targetRole ? String(role).toUpperCase() : undefined;

    if (nextRole === 'DEVELOPER') {
      return res.status(403).json({
        error: 'O papel de Desenvolvedor é restrito e definido exclusivamente pela variável de ambiente DEVELOPER_EMAILS.',
      });
    }
    if (nextRole && !['EMPLOYEE', 'MANAGER', 'DIRECTOR'].includes(nextRole)) {
      return res.status(400).json({ error: 'Perfil inválido.' });
    }
    if (targetRole === 'DEVELOPER' && requesterRole !== 'DEVELOPER') {
      // O Diretor pode apenas conceder/retirar o acesso de diretoria do desenvolvedor
      const onlyDirectorAccess = requesterRole === 'DIRECTOR' && Object.keys(req.body || {}).every((k) => k === 'directorAccess');
      if (!onlyDirectorAccess) {
        return res.status(403).json({ error: 'Somente desenvolvedores podem editar os dados de outro desenvolvedor.' });
      }
    }
    if (nextRole) {
      if (targetRole === 'DEVELOPER') {
        return res.status(403).json({
          error: 'O perfil Desenvolvedor é definido pela variável DEVELOPER_EMAILS no servidor e não pode ser alterado pela tela.',
        });
      }
      if (target.id === requester.id) {
        return res.status(400).json({ error: 'Você não pode alterar o seu próprio perfil de acesso.' });
      }
    }

    // "Acesso de diretoria" (ver todos os setores): somente um Diretor concede ou retira
    let directorAccessValue: boolean | null = null;
    if (typeof directorAccess === 'boolean' && directorAccess !== Boolean(target.director_access)) {
      if (requesterRole !== 'DIRECTOR') {
        return res.status(403).json({ error: 'Somente um Diretor pode conceder ou retirar o acesso de diretoria.' });
      }
      directorAccessValue = directorAccess;
    }

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      const dup = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [cleanEmail, id]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Já existe outro usuário com este e-mail.' });
      }
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
        password_hash = COALESCE($14, password_hash),
        director_access = COALESCE($16, director_access)
       WHERE id = $15`,
      [
        name,
        email ? String(email).trim().toLowerCase() : null,
        matricula,
        cpf,
        phone,
        nextRole,
        departmentId,
        departmentName,
        cargo,
        status,
        twoFactorEnabled,
        permittedFolderIds ? JSON.stringify(permittedFolderIds) : null,
        granularPermissions ? JSON.stringify(granularPermissions) : null,
        passwordHash,
        id,
        directorAccessValue,
      ]
    );

    // Mudou o alcance de acesso: a sessão do usuário é revalidada em tempo real (aviso via realtime)

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.json(sanitizeUser(updated.rows[0]));
  } catch (err: any) {
    console.error('[USERS UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
  }
});

// Reenviar acesso: gera nova senha provisória, exige troca no próximo login e envia por e-mail
usersRouter.post('/:id/resend-access', requireAuth, requireRole('DEVELOPER', 'DIRECTOR', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requester = (req as any).user;
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const target = userRes.rows[0];
    if (target.id === requester.id) {
      return res.status(400).json({ error: 'Para trocar a sua própria senha, use a tela Segurança.' });
    }
    const targetRole = String(target.role || '').toUpperCase();
    if (targetRole === 'DEVELOPER' && String(requester.role).toUpperCase() !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Somente desenvolvedores podem reenviar o acesso de outro desenvolvedor.' });
    }
    if (String(requester.role).toUpperCase() === 'MANAGER' && (targetRole !== 'EMPLOYEE' || target.department_id !== requester.departmentId)) {
      return res.status(403).json({ error: 'Gestores só podem reenviar o acesso de colaboradores do próprio setor.' });
    }
    if (target.status === 'BLOCKED') {
      return res.status(400).json({ error: 'Desbloqueie o usuário antes de reenviar o acesso.' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = true, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
      [passwordHash, id]
    );
    await revokeAllUserSessions(id);

    const emailSent = await sendAccessCredentialsEmail(target.email, target.name, temporaryPassword, getLoginUrl(req), true);

    return res.json({
      success: true,
      emailSent,
      temporaryPassword: emailSent ? undefined : temporaryPassword,
      message: emailSent
        ? `Nova senha provisória enviada para ${target.email}.`
        : 'Não foi possível enviar o e-mail. Repasse a senha provisória ao usuário manualmente.',
    });
  } catch (err: any) {
    console.error('[USERS RESEND ACCESS ERROR]', err);
    return res.status(500).json({ error: 'Erro ao reenviar o acesso do usuário.' });
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

    const { rows: targetRows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (String(target.role).toUpperCase() === 'DEVELOPER' && String(user.role).toUpperCase() !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Somente desenvolvedores podem excluir outro desenvolvedor.' });
    }

    await revokeAllUserSessions(id);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
    const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    await pool
      .query(
        `INSERT INTO audit_logs (id, timestamp, user_id, user_name, role, department, action, resource_id, resource_name, details, ip_address, device_info, result, hash)
         VALUES ($1, NOW(), $2, $3, $4, $5, 'USER_DELETED', $6, $7, $8, $9, 'Painel Web', 'SUCCESS', $10)`,
        [logId, user.id, user.name, user.role, user.departmentName || 'Geral', id, target.name, `Usuário ${target.email} excluído. Sessões e dispositivos revogados.`, ip, logHash]
      )
      .catch((e: any) => console.warn('[Audit Log Insert Warning]', e));

    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[USERS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
