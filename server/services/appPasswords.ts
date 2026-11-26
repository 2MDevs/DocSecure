/**
 * Senhas de aplicativo: a pessoa gera dentro do DocSecure (já logada, com 2FA) uma senha só para a
 * pasta do DocSecure no Windows. Assim a senha principal nunca é digitada no Windows e cada
 * computador pode ser desconectado sozinho (revogando a senha dele).
 *
 * - Gerada no servidor (dsk- + 32 caracteres aleatórios), mostrada uma única vez.
 * - No banco fica só o hash SHA-256 (a senha tem entropia alta, então hash rápido é seguro).
 * - Quem pode usar a pasta no Windows é definido pelo desenvolvedor (WEBDAV_ACCESS).
 */
import crypto from 'crypto';
import { pool } from '../db';
import { getEffectiveSetting, saveSetting } from './systemSettings';

export const APP_PASSWORD_PREFIX = 'dsk-';
export const MAX_ACTIVE_APP_PASSWORDS = 5;

export type WebdavAccess = 'off' | 'developers' | 'all';

export async function getWebdavAccess(): Promise<WebdavAccess> {
  try {
    const v = String((await getEffectiveSetting('WEBDAV_ACCESS')).value || '').toLowerCase();
    return v === 'off' || v === 'all' ? v : 'developers';
  } catch {
    return 'developers';
  }
}

export async function setWebdavAccess(value: WebdavAccess, byEmail: string) {
  await saveSetting('WEBDAV_ACCESS', value, byEmail);
}

/** Esta pessoa pode usar a pasta no Windows agora? */
export function userMayUseWebdav(user: any, access: WebdavAccess): boolean {
  if (access === 'off') return false;
  if (access === 'all') return true;
  return String(user?.role || '').toUpperCase() === 'DEVELOPER';
}

export const hashAppPassword = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

/** Senha legível: sem caracteres parecidos (0/O, 1/l), em blocos para facilitar colar/conferir. */
function randomReadable(len: number): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function generateAppPassword() {
  const body = randomReadable(32);
  const raw = APP_PASSWORD_PREFIX + body.match(/.{1,8}/g)!.join('-');
  return { raw, hash: hashAppPassword(raw), preview: `${APP_PASSWORD_PREFIX}${body.slice(0, 4)}…${body.slice(-4)}` };
}

export function toAppPasswordDto(r: any) {
  return {
    id: r.id,
    name: r.name,
    preview: r.token_preview,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    lastUsedIp: r.last_used_ip || null,
    revoked: Boolean(r.revoked_at),
  };
}

export async function listAppPasswords(userId: string) {
  const { rows } = await pool.query(
    'SELECT * FROM app_passwords WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(toAppPasswordDto);
}

export class AppPasswordError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createAppPassword(userId: string, name: string) {
  const clean = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || 'Meu computador';
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM app_passwords WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  if (Number(rows[0]?.n || 0) >= MAX_ACTIVE_APP_PASSWORDS) {
    throw new AppPasswordError(409, `Você já tem ${MAX_ACTIVE_APP_PASSWORDS} computadores conectados. Desconecte um antes de gerar outra senha.`);
  }
  const { raw, hash, preview } = generateAppPassword();
  const id = 'apw-' + crypto.randomBytes(8).toString('hex');
  await pool.query(
    'INSERT INTO app_passwords (id, user_id, name, token_hash, token_preview, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [id, userId, clean, hash, preview]
  );
  const { rows: saved } = await pool.query('SELECT * FROM app_passwords WHERE id = $1', [id]);
  return { ...toAppPasswordDto(saved[0]), password: raw };
}

export async function revokeAppPassword(userId: string, id: string): Promise<string | null> {
  const { rows } = await pool.query(
    'UPDATE app_passwords SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING name',
    [id, userId]
  );
  forgetCachedCredentials();
  return rows[0]?.name ?? null;
}

/** Revoga todas as senhas de aplicativo de uma pessoa (ex.: bloqueada pelo administrador). */
export async function revokeAllAppPasswords(userId: string) {
  await pool.query('UPDATE app_passwords SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  forgetCachedCredentials();
}

// ------------------------------------------------------------------ verificação (com cache curto)
// O Windows faz muitas requisições seguidas (cada pasta aberta, cada miniatura). Para não consultar o banco
// em todas, a combinação e-mail+senha já conferida fica válida por 30 segundos na memória.
type Cached = { at: number; userRow: any; passwordId: string };
const CACHE_MS = 30_000;
const credCache = new Map<string, Cached>();

export function forgetCachedCredentials() {
  credCache.clear();
}

export async function verifyAppPassword(email: string, raw: string, ip: string): Promise<{ userRow: any; passwordId: string } | null> {
  const login = String(email || '').trim().toLowerCase();
  const secret = String(raw || '').trim();
  if (!login || !secret.startsWith(APP_PASSWORD_PREFIX)) return null;
  const cacheKey = hashAppPassword(login + '\u0000' + secret);
  const hit = credCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return { userRow: hit.userRow, passwordId: hit.passwordId };

  const { rows } = await pool.query(
    `SELECT u.*, p.id AS app_password_id, p.last_used_at AS app_password_last_used
       FROM app_passwords p JOIN users u ON u.id = p.user_id
      WHERE p.token_hash = $1 AND p.revoked_at IS NULL AND LOWER(u.email) = $2
      LIMIT 1`,
    [hashAppPassword(secret), login]
  );
  const row = rows[0];
  if (!row) return null;
  if (String(row.status || '').toUpperCase() === 'BLOCKED' || String(row.status || '').toUpperCase() === 'INACTIVE') return null;

  const last = row.app_password_last_used ? new Date(row.app_password_last_used).getTime() : 0;
  if (Date.now() - last > 60_000) {
    pool
      .query('UPDATE app_passwords SET last_used_at = NOW(), last_used_ip = $1 WHERE id = $2', [ip.slice(0, 100), row.app_password_id])
      .catch(() => {});
  }
  credCache.set(cacheKey, { at: Date.now(), userRow: row, passwordId: row.app_password_id });
  if (credCache.size > 500) credCache.delete(credCache.keys().next().value as string);
  return { userRow: row, passwordId: row.app_password_id };
}
