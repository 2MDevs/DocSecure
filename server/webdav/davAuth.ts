/**
 * Pasta no Windows — quem está acessando.
 *
 * O Windows manda e-mail + senha de aplicativo em cada requisição (autenticação "Basic", só por HTTPS).
 * A senha principal da conta nunca é aceita aqui: só senhas de aplicativo, que a pessoa gera e revoga
 * em Segurança da conta. Muitas tentativas erradas do mesmo endereço bloqueiam por 15 minutos.
 */
import type { IncomingMessage } from 'http';
import { pool } from '../db';
import { getClientIp } from '../services/documentAccess';
import { applyDeveloperDepartment } from '../services/developerDepartment';
import { withFolderShares } from '../services/sharing';
import { sanitizeUser } from '../auth/middleware';
import { verifyAppPassword, getWebdavAccess, userMayUseWebdav, WebdavAccess } from '../services/appPasswords';

export class DavAuthError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

const REALM = 'Basic realm="DocSecure", charset="UTF-8"';
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 20;
const failures = new Map<string, { count: number; first: number }>();

function tooManyFailures(ip: string): number {
  const f = failures.get(ip);
  if (!f) return 0;
  if (Date.now() - f.first > FAIL_WINDOW_MS) {
    failures.delete(ip);
    return 0;
  }
  return f.count >= MAX_FAILS ? Math.ceil((f.first + FAIL_WINDOW_MS - Date.now()) / 1000) : 0;
}

function registerFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
  if (failures.size > 10_000) failures.delete(failures.keys().next().value as string);
}

let accessCache: { at: number; value: WebdavAccess } | null = null;
async function currentAccess(): Promise<WebdavAccess> {
  if (accessCache && Date.now() - accessCache.at < 30_000) return accessCache.value;
  const value = await getWebdavAccess();
  accessCache = { at: Date.now(), value };
  return value;
}
export function forgetDavAccessCache() {
  accessCache = null;
}

/** Monta o usuário como no login pelo site (setor do desenvolvedor, pastas compartilhadas...). */
export async function buildDavUser(row: any) {
  return withFolderShares(sanitizeUser(await applyDeveloperDepartment(row)));
}

export async function loadDavUserById(userId: string) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const row = rows[0];
  if (!row || String(row.status || '').toUpperCase() === 'BLOCKED') return null;
  return buildDavUser(row);
}

export async function authenticateDav(req: IncomingMessage): Promise<{ user: any; ip: string }> {
  const ip = getClientIp(req);
  const wait = tooManyFailures(ip);
  if (wait > 0) throw new DavAuthError(429, 'Muitas tentativas erradas. Aguarde alguns minutos.', { 'Retry-After': String(wait) });

  const header = String(req.headers.authorization || '');
  if (!/^Basic\s+/i.test(header)) {
    // Primeiro contato do Windows: pede usuário e senha (não conta como erro)
    throw new DavAuthError(401, 'Informe o e-mail e a senha de aplicativo do DocSecure.', { 'WWW-Authenticate': REALM });
  }
  let decoded = '';
  try {
    decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
  } catch {}
  const sep = decoded.indexOf(':');
  let login = sep >= 0 ? decoded.slice(0, sep) : '';
  const password = sep >= 0 ? decoded.slice(sep + 1) : '';
  // O Windows pode mandar "DOMINIO\usuario": usa só a parte do e-mail
  if (login.includes('\\')) login = login.slice(login.lastIndexOf('\\') + 1);

  const found = await verifyAppPassword(login, password, ip);
  if (!found) {
    registerFailure(ip);
    throw new DavAuthError(401, 'E-mail ou senha de aplicativo incorretos.', { 'WWW-Authenticate': REALM });
  }
  const user = await buildDavUser(found.userRow);
  const access = await currentAccess();
  if (!userMayUseWebdav(user, access)) {
    throw new DavAuthError(403, access === 'off' ? 'A pasta no Windows está desligada.' : 'A pasta no Windows ainda não foi liberada para você.');
  }
  return { user, ip };
}
