import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { send2FACode, sendPasswordResetEmail, maskEmail } from '../mailer';
import {
  requireAuth,
  sanitizeUser,
  createSession,
  createMemorySession,
  createTrustedDevice,
  revokeAllUserSessions,
  authRateLimiter,
} from './middleware';
import { User } from '../../src/types';

export const authRouter = Router();

export const PREVIEW_ADMIN_USER: User = {
  id: 'user-admin',
  name: 'Administrador (Preview)',
  email: 'admin@docsecure.io',
  matricula: 'admin',
  cpf: '000.000.000-00',
  phone: '',
  role: 'DEVELOPER',
  departmentId: 'dept-ti',
  departmentName: 'TI / Infraestrutura',
  cargo: 'Administrador do Sistema',
  status: 'ACTIVE',
  failedLoginAttempts: 0,
  twoFactorEnabled: false,
  mustChangePassword: false,
  permittedFolderIds: ['*'],
  granularPermissions: {
    '*': [
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
      'SHARE_DOCUMENT',
      'MANAGE_PERMISSIONS',
      'MANAGE_USERS',
      'MANAGE_DEVICES',
      'VIEW_AUDIT',
    ],
  },
  createdAt: new Date().toISOString(),
  lastLoginAt: 'Agora (Preview)',
};

// Validação de política mínima de senha: 10 caracteres, letras e números
function validatePasswordPolicy(password: string): boolean {
  if (!password || password.length < 10) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

// 1. LOGIN (1º Fator + Checagem de Dispositivo Confiável)
authRouter.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const cleanInput = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    // SUPORTE OFICIAL AO LOGIN PREVIEW / TESTE: admin / admin
    const isPreviewTest =
      (cleanInput === 'admin' ||
        cleanInput === 'admin@docsecure.io' ||
        cleanInput === 'admin@admin.com') &&
      cleanPass === 'admin';

    if (isPreviewTest) {
      console.log('[AUTH] Autenticando usuário de preview/teste: admin / admin');
      try {
        const hashed = await bcrypt.hash('admin', 12);
        await pool.query(
          `INSERT INTO users (
            id, name, email, matricula, role, department_id, department_name, cargo,
            status, password_hash, must_change_password, two_factor_enabled,
            permitted_folder_ids, granular_permissions, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, false, false, $10, $11, NOW())
          ON CONFLICT (email) DO UPDATE SET
            matricula = EXCLUDED.matricula,
            status = 'ACTIVE',
            failed_login_attempts = 0,
            locked_until = NULL,
            role = 'DEVELOPER',
            password_hash = EXCLUDED.password_hash`,
          [
            'user-admin',
            'Administrador (Preview)',
            'admin@docsecure.io',
            'admin',
            'DEVELOPER',
            'dept-ti',
            'TI / Infraestrutura',
            'Administrador do Sistema',
            hashed,
            JSON.stringify(['*']),
            JSON.stringify({
              '*': [
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
                'SHARE_DOCUMENT',
                'MANAGE_PERMISSIONS',
                'MANAGE_USERS',
                'MANAGE_DEVICES',
                'VIEW_AUDIT',
              ],
            }),
          ]
        );
        await createSession('user-admin', req, res, PREVIEW_ADMIN_USER);
        try {
          await createTrustedDevice('user-admin', 'Administrador (Preview)', 'Dispositivo Preview', req, res);
        } catch {}
      } catch (dbErr: any) {
        // Se o banco estiver offline no ambiente de preview, salva em sessão em memória
        console.warn('[AUTH] PostgreSQL offline ou inacessível no preview. Usando sessão em memória:', dbErr.message);
        createMemorySession(PREVIEW_ADMIN_USER, req, res);
      }

      return res.json({
        user: PREVIEW_ADMIN_USER,
        trustedDevice: true,
      });
    }

    // Consulta no banco de dados
    const userRes = await pool.query(
      `SELECT * FROM users
       WHERE LOWER(email) = $1 OR LOWER(matricula) = $1
       LIMIT 1`,
      [cleanInput]
    );

    if (userRes.rows.length === 0) {
      // Mensagem genérica para não revelar a existência do usuário
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const user = userRes.rows[0];

    // Checagem de bloqueio de segurança
    if (user.status === 'BLOCKED') {
      return res.status(403).json({
        error: 'Esta conta foi suspensa por motivos de segurança corporativa.',
      });
    }

    // Checagem de bloqueio temporário por tentativas incorretas
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const minutesRemaining = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000)
      );
      return res.status(429).json({
        error: `Conta temporariamente bloqueada por múltiplas tentativas incorretas. Tente novamente em ${minutesRemaining} minuto(s).`,
      });
    }

    // Usuário sem senha cadastrada (precisa do primeiro acesso)
    if (!user.password_hash) {
      return res.status(400).json({
        error: 'Senha ainda não definida. Utilize o link enviado para seu e-mail para cadastrar a primeira senha.',
      });
    }

    // Comparação estrita de senha com bcrypt
    const isPasswordValid = await bcrypt.compare(cleanPass, user.password_hash);

    if (!isPasswordValid) {
      const nextAttempts = (user.failed_login_attempts || 0) + 1;
      if (nextAttempts >= 5) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2`,
          [nextAttempts, user.id]
        );
        return res.status(429).json({
          error: 'Limite de 5 tentativas excedido. A conta foi bloqueada por 15 minutos.',
        });
      } else {
        await pool.query(`UPDATE users SET failed_login_attempts = $1 WHERE id = $2`, [
          nextAttempts,
          user.id,
        ]);
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }
    }

    // Sucesso na senha: zera tentativas de falha
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    // 2. CHECAGEM DE DISPOSITIVO CONFIÁVEL VIA COOKIE HTTPONLY
    const clientDeviceToken = req.cookies?.docsecure_device_token;
    let isDeviceTrusted = false;

    if (clientDeviceToken) {
      const deviceHash = crypto.createHash('sha256').update(clientDeviceToken).digest('hex');
      const devRes = await pool.query(
        `SELECT id FROM devices
         WHERE user_id = $1 AND device_token_hash = $2 AND status = 'TRUSTED'
           AND (trusted_until IS NULL OR trusted_until > NOW())
         LIMIT 1`,
        [user.id, deviceHash]
      );

      if (devRes.rows.length > 0) {
        isDeviceTrusted = true;
        await pool.query('UPDATE devices SET last_access_at = NOW() WHERE id = $1', [
          devRes.rows[0].id,
        ]);
      }
    }

    // Se o dispositivo já é confiável, autentica imediatamente
    if (isDeviceTrusted) {
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      await createSession(user.id, req, res);

      return res.json({
        user: sanitizeUser(user),
        trustedDevice: true,
      });
    }

    // 3. NOVO DISPOSITIVO: EXIGE 2FA VIA E-MAIL
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const challengeToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    await pool.query(
      `UPDATE users SET
        email_2fa_code_hash = $1,
        email_2fa_expires = $2,
        two_fa_attempts = 0,
        two_fa_last_sent = NOW(),
        two_fa_challenge_token = $3,
        two_fa_challenge_expires = $4
       WHERE id = $5`,
      [codeHash, expiresAt, challengeToken, expiresAt, user.id]
    );

    // Envio real por e-mail
    const sent = await send2FACode(user.email, user.name, code);
    if (!sent) {
      return res.status(500).json({
        error: 'Não foi possível enviar o código de verificação para o seu e-mail. Tente novamente mais tarde.',
      });
    }

    // Retorna desafio sem revelar código
    return res.json({
      require2FA: true,
      challengeToken,
      maskedEmail: maskEmail(user.email),
    });
  } catch (err: any) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ error: 'Erro interno ao processar autenticação.' });
  }
});

// 2. VERIFICAÇÃO DE 2FA
authRouter.post('/verify-2fa', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeToken, code, trustDevice, deviceName } = req.body;

    if (!challengeToken || !code) {
      return res.status(400).json({ error: 'Token de desafio e código 2FA são obrigatórios.' });
    }

    const cleanCode = String(code).trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      return res.status(400).json({ error: 'O código de verificação deve conter 6 dígitos numéricos.' });
    }

    const userRes = await pool.query(
      `SELECT * FROM users
       WHERE two_fa_challenge_token = $1 AND two_fa_challenge_expires > NOW()
       LIMIT 1`,
      [challengeToken]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({
        error: 'Desafio de verificação expirado ou inválido. Reinicie o login.',
      });
    }

    const user = userRes.rows[0];

    // Checagem de limite de tentativas do código
    if ((user.two_fa_attempts || 0) >= 5) {
      await pool.query(
        `UPDATE users SET
          email_2fa_code_hash = NULL,
          two_fa_challenge_token = NULL
         WHERE id = $1`,
        [user.id]
      );
      return res.status(400).json({
        error: 'Número máximo de tentativas de 2FA excedido. O código foi invalidado.',
      });
    }

    // Validação do hash do código
    const inputHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

    if (inputHash !== user.email_2fa_code_hash) {
      const nextAttempts = (user.two_fa_attempts || 0) + 1;
      await pool.query(`UPDATE users SET two_fa_attempts = $1 WHERE id = $2`, [nextAttempts, user.id]);
      return res.status(400).json({ error: 'Código de verificação incorreto.' });
    }

    // Código validado com sucesso: limpa estado de 2FA
    await pool.query(
      `UPDATE users SET
        email_2fa_code_hash = NULL,
        email_2fa_expires = NULL,
        two_fa_challenge_token = NULL,
        two_fa_challenge_expires = NULL,
        two_fa_attempts = 0,
        last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Se o usuário solicitou confiar no dispositivo
    if (trustDevice) {
      await createTrustedDevice(user.id, user.name, deviceName, req, res);
    }

    // Cria sessão autenticada em cookie HttpOnly
    await createSession(user.id, req, res);

    // Registra log de auditoria
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    await pool.query(
      `INSERT INTO audit_logs (id, timestamp, user_id, user_name, role, department, action, resource_name, details, ip_address, device_info, result, hash)
       VALUES ($1, NOW(), $2, $3, $4, $5, 'TWO_FACTOR_VERIFIED', 'Sessão Web Segura', '2FA validado com sucesso por e-mail.', $6, $7, 'SUCCESS', $8)`,
      [
        'audit_' + crypto.randomBytes(8).toString('hex'),
        user.id,
        user.name,
        user.role,
        user.department_name,
        ip,
        req.headers['user-agent'] || 'Navegador Web',
        crypto.randomBytes(16).toString('hex'),
      ]
    );

    return res.json({
      user: sanitizeUser(user),
    });
  } catch (err: any) {
    console.error('[VERIFY 2FA ERROR]', err);
    return res.status(500).json({ error: 'Erro ao validar código de segurança.' });
  }
});

// 3. REENVIO DE CÓDIGO 2FA
authRouter.post('/resend-2fa', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeToken } = req.body;
    if (!challengeToken) {
      return res.status(400).json({ error: 'Token de desafio é obrigatório.' });
    }

    const userRes = await pool.query(
      `SELECT * FROM users
       WHERE two_fa_challenge_token = $1 AND two_fa_challenge_expires > NOW()
       LIMIT 1`,
      [challengeToken]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Desafio expirado ou inválido. Reinicie o login.' });
    }

    const user = userRes.rows[0];

    // Intervalo mínimo de 60 segundos entre envios
    if (user.two_fa_last_sent) {
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(user.two_fa_last_sent).getTime()) / 1000
      );
      if (elapsedSeconds < 60) {
        return res.status(429).json({
          error: `Aguarde ${60 - elapsedSeconds} segundos antes de solicitar um novo código.`,
        });
      }
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newCodeHash = crypto.createHash('sha256').update(newCode).digest('hex');
    const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE users SET
        email_2fa_code_hash = $1,
        email_2fa_expires = $2,
        two_fa_attempts = 0,
        two_fa_last_sent = NOW()
       WHERE id = $3`,
      [newCodeHash, newExpiresAt, user.id]
    );

    const sent = await send2FACode(user.email, user.name, newCode);
    if (!sent) {
      return res.status(500).json({ error: 'Falha ao reenviar código por e-mail.' });
    }

    return res.json({
      success: true,
      maskedEmail: maskEmail(user.email),
    });
  } catch (err: any) {
    console.error('[RESEND 2FA ERROR]', err);
    return res.status(500).json({ error: 'Erro ao reenviar código.' });
  }
});

// 4. RETORNA USUÁRIO DA SESSÃO ATUAL (/api/auth/me)
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({
    user: (req as any).user,
  });
});

// 5. LOGOUT
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.dcs_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
  } catch {}

  res.clearCookie('dcs_session', { path: '/' });
  return res.json({ success: true });
});

// 6. SOLICITAÇÃO DE REDEFINIÇÃO DE SENHA / PRIMEIRO ACESSO
authRouter.post('/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const resetId = 'reset_' + crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await pool.query(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [resetId, user.id, resetHash, expiresAt]
      );

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}?reset_token=${resetToken}`;
      await sendPasswordResetEmail(user.email, user.name, resetUrl);
    }

    // Resposta genérica para evitar enumeração de contas
    return res.json({
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas.',
    });
  } catch (err: any) {
    console.error('[FORGOT PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

// 7. CONCLUSÃO DE REDEFINIÇÃO DE SENHA
authRouter.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }

    if (!validatePasswordPolicy(newPassword)) {
      return res.status(400).json({
        error: 'A senha deve conter no mínimo 10 caracteres, incluindo letras e números.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    const resetRes = await pool.query(
      `SELECT pr.*, u.email, u.name
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (resetRes.rows.length === 0) {
      return res.status(400).json({ error: 'Link de redefinição expirado ou já utilizado.' });
    }

    const resetRow = resetRes.rows[0];
    const hashed = await bcrypt.hash(newPassword, 12);

    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = false, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
      [hashed, resetRow.user_id]
    );

    // Marca token como utilizado
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [resetRow.id]);

    // Revoga todas as sessões ativas do usuário por segurança
    await revokeAllUserSessions(resetRow.user_id);

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso! Você já pode efetuar o login.',
    });
  } catch (err: any) {
    console.error('[RESET PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
});
