import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { getEffectiveSetting } from '../services/systemSettings';
import rateLimit from 'express-rate-limit';
import { createSession } from './middleware';

/**
 * Entrada pelo Gestão Hummm! (aplicativo DocSecure em gestaohummm.com.br).
 *
 * O Gestão manda a pessoa para GET /api/auth/gestao?token=<JWT HS256 de 60 s>, assinado com a chave
 * compartilhada (GESTAO_SSO_SECRET). Aqui o passe é conferido, usado uma vez só, a conta é achada (ou criada como
 * Colaborador no setor escolhido) e a sessão é aberta sem o 2FA, porque quem autenticou foi o Gestão.
 * Contrato: docs/DOCSECURE.md no repositório do Gestão.
 */
export const gestaoSsoRouter = Router();

const CLOCK_SKEW_SECONDS = 30;

// Muitas pessoas da mesma loja ou do escritório saem pelo mesmo IP: só as tentativas que falham contam.
const gestaoSsoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Muitas tentativas de entrada pelo Gestão a partir deste endereço. Tente novamente em 15 minutos.',
});

interface GestaoUser {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  position: string | null;
  cpf: string | null;
}

interface GestaoClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  user: GestaoUser;
}

class SsoError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Confere assinatura HS256, emissor, destino e validade. Devolve as informações do passe. */
export function verifyGestaoToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): GestaoClaims {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new SsoError('Passe de entrada inválido.');
  const [head, body, sig] = parts;

  let header: any;
  let claims: any;
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new SsoError('Passe de entrada inválido.');
  }
  if (header?.alg !== 'HS256') throw new SsoError('Passe de entrada inválido.');

  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    // Causa mais comum: a chave salva aqui não é a mesma gerada no Gestão (foi gerada outra lá, ou colada pela metade)
    throw new SsoError(
      'A chave da integração no DocSecure não é a mesma do Gestão. No Gestão, em Sistema → DocSecure, confira os 4 últimos caracteres da chave (ou gere uma nova) e cole a mesma chave no DocSecure, em Integração → Gestão Hummm!.'
    );
  }

  if (claims?.iss !== 'gestao-hummm' || claims?.aud !== 'docsecure') throw new SsoError('Passe de entrada inválido.');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new SsoError('O passe de entrada venceu.');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) throw new SsoError('Passe de entrada inválido.');
  if (typeof claims.jti !== 'string' || !claims.jti || claims.jti.length > 100) throw new SsoError('Passe de entrada inválido.');
  const u = claims.user;
  if (!u || typeof u.id !== 'string' || !u.id || u.id !== claims.sub || typeof u.name !== 'string') {
    throw new SsoError('Passe de entrada inválido.');
  }
  return claims as GestaoClaims;
}

/** Uso único: grava o jti; se já existia, o passe foi reaproveitado. */
async function consumeJti(jti: string, exp: number) {
  await pool.query('DELETE FROM gestao_sso_tokens WHERE expires_at < NOW()');
  const r = await pool.query(
    'INSERT INTO gestao_sso_tokens (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING',
    [jti, exp + CLOCK_SKEW_SECONDS]
  );
  if (r.rowCount === 0) throw new SsoError('Este passe de entrada já foi usado.');
}

/** Setor vazio: conta criada pelo Gestão esperando o administrador vincular a um setor. Não vê nenhuma pasta. */
export const NO_DEPARTMENT_ID = '';
export const NO_DEPARTMENT_NAME = 'Sem setor (aguardando)';

/** Acha a conta pela ligação com o Gestão, depois pelo e-mail, depois pelo CPF. Sem conta, cria. */
async function findOrCreateUser(g: GestaoUser): Promise<{ user: any; created: boolean }> {
  const email = (g.email || '').trim().toLowerCase();
  const cpf = (g.cpf || '').replace(/\D/g, '');

  let res = await pool.query('SELECT * FROM users WHERE gestao_user_id = $1 LIMIT 1', [g.id]);
  if (res.rows.length === 0 && email) {
    res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  }
  if (res.rows.length === 0 && cpf.length === 11) {
    res = await pool.query(
      "SELECT * FROM users WHERE regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g') = $1 LIMIT 2",
      [cpf]
    );
    // Dois cadastros com o mesmo CPF: não escolhe por conta própria
    if (res.rows.length > 1) res = { ...res, rows: [] } as any;
  }

  if (res.rows.length > 0) {
    const user = res.rows[0];
    if (user.gestao_user_id && user.gestao_user_id !== g.id) {
      throw new SsoError('Esta conta do DocSecure já está ligada a outra pessoa do Gestão. Fale com o administrador.', 409);
    }
    if (!user.gestao_user_id) {
      await pool.query('UPDATE users SET gestao_user_id = $1 WHERE id = $2', [g.id, user.id]);
      user.gestao_user_id = g.id;
    }
    return { user, created: false };
  }

  // Conta nova: precisa de e-mail (é o login do DocSecure)
  if (!email) throw new SsoError('Seu usuário do Gestão não tem e-mail. Peça para incluírem o seu e-mail.', 403);
  // Setor das contas novas, se escolhido na Integração. Sem setor: a conta nasce "Sem setor (aguardando)" e
  // não vê nenhuma pasta até o administrador vincular a pessoa a um setor (tela Usuários).
  const departmentId = (await getEffectiveSetting('GESTAO_SSO_DEPARTMENT_ID')).value;
  const found = departmentId
    ? await pool.query('SELECT id, name FROM departments WHERE id = $1 LIMIT 1', [departmentId])
    : { rows: [] as any[] };
  const dep = found.rows[0] || { id: NO_DEPARTMENT_ID, name: NO_DEPARTMENT_NAME };

  const newId = 'user-' + crypto.randomBytes(8).toString('hex');
  // Senha aleatória que ninguém conhece: a pessoa entra pelo Gestão (ou usa "Esqueci minha senha")
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 12);
  const name = g.name.trim().slice(0, 255) || email;
  const cargo = (g.position || 'Colaborador').slice(0, 100);
  const matricula = `GESTAO-${g.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase()}`;

  await pool.query(
    `INSERT INTO users (
      id, name, email, matricula, cpf, role, department_id, department_name, cargo,
      status, password_hash, must_change_password, two_factor_enabled, permitted_folder_ids, granular_permissions,
      gestao_user_id, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'EMPLOYEE', $6, $7, $8, 'ACTIVE', $9, false, true, '[]'::jsonb, '{}'::jsonb, $10, NOW())`,
    [newId, name, email, matricula, cpf.length === 11 ? cpf : null, dep.id, dep.name, cargo, passwordHash, g.id]
  );
  const created = await pool.query('SELECT * FROM users WHERE id = $1', [newId]);
  return { user: created.rows[0], created: true };
}

async function audit(user: any, action: string, details: string, req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
  const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
  await pool
    .query(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_name, role, department, action,
        resource_id, resource_name, details, ip_address, device_info, result, hash
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, 'system_auth', 'Entrada pelo Gestão', $7, $8, $9, 'SUCCESS', $10)`,
      [logId, user.id, user.name, user.role, user.department_name || 'Geral', action, details, ip, req.headers['user-agent'] || 'Navegador Web', logHash]
    )
    .catch((e: any) => console.warn('[Audit Log Insert Warning]', e?.message || e));
}

function errorPage(res: Response, status: number, message: string, gestaoUrl: string) {
  const link = gestaoUrl ? `<a href="${escapeHtml(gestaoUrl)}">Voltar ao Gestão</a> · ` : '';
  res
    .status(status)
    .type('text/html; charset=utf-8')
    .setHeader('Cache-Control', 'no-store');
  return res.send(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DocSecure</title>` +
      `<body style="font-family:Poppins,system-ui,sans-serif;background:#FDF8CF;color:#1D1D1B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">` +
      `<div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08);border-top:6px solid #F6D35C">` +
      `<h1 style="font-size:18px;margin:0 0 8px">Não foi possível entrar pelo Gestão</h1><p style="font-size:14px;line-height:1.5">${escapeHtml(message)}</p>` +
      `<p style="font-size:14px">Abra o DocSecure pelo aplicativo do Gestão. ${link}<a href="/">Entrar com e-mail e senha</a></p></div></body></html>`
  );
}

gestaoSsoRouter.get('/gestao', gestaoSsoLimiter, async (req: Request, res: Response) => {
  const gestaoUrl = await getEffectiveSetting('GESTAO_URL').then((s) => s.value).catch(() => '');
  try {
    const enabled = (await getEffectiveSetting('GESTAO_SSO_ENABLED')).value === 'true';
    const secret = (await getEffectiveSetting('GESTAO_SSO_SECRET')).value;
    if (!enabled || !secret) throw new SsoError('A entrada pelo Gestão não está ligada no DocSecure.', 503);

    const claims = verifyGestaoToken(String(req.query.token || ''), secret);
    if (!claims.user.active) throw new SsoError('Seu usuário está desativado no Gestão.', 403);
    await consumeJti(claims.jti, claims.exp);

    const { user, created } = await findOrCreateUser(claims.user);
    if (user.status !== 'ACTIVE') throw new SsoError('Sua conta no DocSecure está bloqueada. Fale com o administrador.', 403);

    // Conta criada com senha provisória e nunca usada: quem entra pelo Gestão não precisa dela. A provisória
    // deixa de valer (troca por uma aleatória) e a pessoa não fica presa na troca obrigatória de senha.
    const replacedTemporary = Boolean(user.must_change_password);
    if (replacedTemporary) {
      const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 12);
      await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [randomHash, user.id]);
    }
    await pool.query('UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    // A sessão anterior deste navegador (por exemplo, bloqueada por inatividade) é substituída por esta
    const previous = req.cookies?.dcs_session;
    if (previous) {
      const prevHash = crypto.createHash('sha256').update(previous).digest('hex');
      await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [prevHash]);
    }
    await createSession(user.id, req, res, { viaGestao: true });
    await audit(
      user,
      created ? 'GESTAO_SSO_ACCOUNT_CREATED' : 'GESTAO_SSO_LOGIN',
      created
        ? `Conta criada na primeira entrada pelo Gestão (pessoa ${claims.user.id}), como Colaborador ${
            user.department_id ? `no setor ${user.department_name}` : 'sem setor: aguardando o administrador vincular a um setor'
          }. Sem 2FA: autenticado pelo Gestão.`
        : `Entrada pelo Gestão (pessoa ${claims.user.id}). Sem 2FA: autenticado pelo Gestão.${replacedTemporary ? ' Senha provisória invalidada.' : ''}`,
      req
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Sem o passe no endereço
    return res.redirect(302, '/');
  } catch (err: any) {
    if (err instanceof SsoError) return errorPage(res, err.status, err.message, gestaoUrl);
    console.error('[GESTAO SSO ERROR]', err);
    return errorPage(res, 500, 'Erro interno ao entrar pelo Gestão. Tente de novo em instantes.', gestaoUrl);
  }
});
