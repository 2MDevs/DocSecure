import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db';
import { User } from '../../src/types';

export interface AuthenticatedRequest extends Request {
  user: User;
  sessionId: string;
}

// Sanitiza o objeto de usuário removendo campos sensíveis
export function sanitizeUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    matricula: row.matricula,
    cpf: row.cpf,
    phone: row.phone,
    role: row.role,
    departmentId: row.department_id,
    departmentName: row.department_name,
    cargo: row.cargo,
    avatar: row.avatar,
    status: row.status,
    failedLoginAttempts: row.failed_login_attempts || 0,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    mustChangePassword: Boolean(row.must_change_password),
    permittedFolderIds:
      typeof row.permitted_folder_ids === 'string'
        ? JSON.parse(row.permitted_folder_ids)
        : row.permitted_folder_ids || [],
    granularPermissions:
      typeof row.granular_permissions === 'string'
        ? JSON.parse(row.granular_permissions)
        : row.granular_permissions || {},
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  } as User;
}

export const memorySessions = new Map<string, { user: User; expiresAt: Date; sessionId: string }>();

export function createMemorySession(user: User, req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessionId = 'sess_mem_' + crypto.randomBytes(16).toString('hex');
  const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || '8', 10);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  memorySessions.set(tokenHash, {
    user,
    expiresAt,
    sessionId,
  });

  const isHttps = process.env.APP_URL?.startsWith('https') || process.env.NODE_ENV === 'production';
  res.cookie('dcs_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: ttlHours * 60 * 60 * 1000,
    path: '/',
  });

  return { sessionId, token };
}

// Cria uma sessão segura com cookie HttpOnly de 8 horas
export async function createSession(userId: string, req: Request, res: Response, fallbackUser?: User) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const sessionId = 'sess_' + crypto.randomBytes(16).toString('hex');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Desconhecido';

  const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || '8', 10);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES ($1, $2, $3, NOW(), $4, NOW(), $5, $6)`,
      [sessionId, userId, tokenHash, expiresAt, ip, userAgent]
    );
  } catch (err: any) {
    if (fallbackUser) {
      memorySessions.set(tokenHash, {
        user: fallbackUser,
        expiresAt,
        sessionId,
      });
    }
  }

  const isHttps = process.env.APP_URL?.startsWith('https') || process.env.NODE_ENV === 'production';

  res.cookie('dcs_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: ttlHours * 60 * 60 * 1000,
    path: '/',
  });

  return { sessionId, token };
}

// Registra um dispositivo confiável com cookie HttpOnly de 30 dias
export async function createTrustedDevice(
  userId: string,
  userName: string,
  deviceName: string,
  req: Request,
  res: Response
) {
  const deviceToken = crypto.randomBytes(32).toString('hex');
  const deviceTokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
  const devId = 'dev_' + crypto.randomBytes(16).toString('hex');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || '';

  let os = 'Linux / VPS';
  if (userAgent.includes('Win')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone')) os = 'iOS';

  let browser = 'Chrome';
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';

  const trustedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO devices (
      id, user_id, user_name, device_name, device_type, os, browser,
      ip_address, last_access_at, status, device_token_hash, registered_at, trusted_until, is_current
    ) VALUES ($1, $2, $3, $4, 'desktop', $5, $6, $7, NOW(), 'TRUSTED', $8, NOW(), $9, true)`,
    [devId, userId, userName, deviceName || `${browser} em ${os}`, os, browser, ip, deviceTokenHash, trustedUntil]
  );

  const isHttps = process.env.APP_URL?.startsWith('https') || process.env.NODE_ENV === 'production';

  res.cookie('docsecure_device_token', deviceToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return { deviceId: devId, deviceToken };
}

// Revoga todas as sessões ativas de um usuário
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await pool.query(
    `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

// Middleware de Autenticação Obrigatória
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.dcs_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ error: 'Não autenticado. Sessão ausente.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 1. Checagem em memória (suporte a preview/teste e sessões resilientes)
    const memSession = memorySessions.get(tokenHash);
    if (memSession) {
      if (memSession.expiresAt.getTime() > Date.now()) {
        (req as any).user = memSession.user;
        (req as any).sessionId = memSession.sessionId;
        return next();
      } else {
        memorySessions.delete(tokenHash);
      }
    }

    let result;
    try {
      result = await pool.query(
        `SELECT s.id as session_id, s.expires_at, u.*
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
      );
    } catch (dbErr: any) {
      console.warn('[AUTH] Verificação no banco falhou:', dbErr.message);
      res.clearCookie('dcs_session', { path: '/' });
      return res.status(401).json({ error: 'Sessão inválida ou banco temporariamente offline.' });
    }

    if (!result || result.rows.length === 0) {
      res.clearCookie('dcs_session', { path: '/' });
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }

    const row = result.rows[0];

    if (row.status === 'BLOCKED') {
      await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [row.session_id]);
      res.clearCookie('dcs_session', { path: '/' });
      return res.status(403).json({ error: 'Esta conta foi suspensa por motivos de segurança.' });
    }

    // Renovar sessão e cookie
    const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || '8', 10);
    await pool.query(
      `UPDATE sessions SET last_seen_at = NOW(), expires_at = NOW() + ($1 || ' hours')::interval WHERE id = $2`,
      [ttlHours, row.session_id]
    );

    const isHttps = process.env.APP_URL?.startsWith('https') || process.env.NODE_ENV === 'production';
    res.cookie('dcs_session', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: ttlHours * 60 * 60 * 1000,
      path: '/',
    });

    (req as any).user = sanitizeUser(row);
    (req as any).sessionId = row.session_id;

    next();
  } catch (err: any) {
    console.error('[AUTH ERROR] Erro no middleware requireAuth:', err.message);
    return res.status(500).json({ error: 'Erro de validação de sessão.' });
  }
}

// Middleware de Controle de Acesso Baseado em Função (RBAC)
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    if (!user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const normalizedUserRole = user.role.toUpperCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

    if (!normalizedAllowed.includes(normalizedUserRole)) {
      return res.status(403).json({
        error: 'Acesso negado. Seu perfil de usuário não possui permissão para este recurso.',
      });
    }

    next();
  };
}

// Rate Limiter para rotas de autenticação (Proteção contra força bruta)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // limite de 10 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas a partir deste endereço IP. Tente novamente em 15 minutos.',
  },
});
