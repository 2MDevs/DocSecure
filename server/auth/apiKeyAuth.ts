/**
 * Chaves de API para outros sistemas se conectarem ao DocSecure.
 *
 * - A chave é gerada no servidor (dcs_live_ + 64 caracteres aleatórios) e mostrada uma única vez.
 *   No banco fica só o hash SHA-256: nem quem tem acesso ao banco consegue recuperar a chave.
 * - O outro sistema manda a chave no cabeçalho `Authorization: Bearer dcs_live_...` (ou `X-API-Key`).
 * - A chave age com as permissões de quem a criou, limitada aos escopos escolhidos. Se essa pessoa
 *   for bloqueada ou removida, a chave para de funcionar. Telas de sistema, usuários de login,
 *   integrações e as próprias chaves nunca podem ser acessadas por chave de API.
 */
import { Request } from 'express';
import crypto from 'crypto';
import { pool } from '../db';

export const API_KEY_PREFIX = 'dcs_live_';

export const API_KEY_SCOPES = [
  'read:documents',
  'write:documents',
  'delete:documents',
  'read:users',
  'admin:permissions',
  'export:audit',
] as const;

export type ApiKeyContext = { id: string; name: string; scopes: string[] };

export function generateApiKey() {
  const rawKey = API_KEY_PREFIX + crypto.randomBytes(32).toString('hex');
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPreview: rawKey.slice(0, 13) + '…' + rawKey.slice(-4),
  };
}

export const hashApiKey = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

/** Chave enviada pelo outro sistema (só por cabeçalho; nunca por cookie ou endereço) */
export function apiKeyFromRequest(req: Request): string | null {
  const header = req.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader && fromHeader.trim().startsWith(API_KEY_PREFIX)) return fromHeader.trim();
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (bearer && bearer.startsWith(API_KEY_PREFIX)) return bearer;
  return null;
}

/**
 * Qual escopo a rota pede. `''` = qualquer chave válida; `null` = rota fechada para chaves de API.
 */
export function requiredScope(method: string, url: string): string | null {
  const path = url.split('?')[0].replace(/\/+$/, '');
  const m = method.toUpperCase();
  const read = m === 'GET' || m === 'HEAD';
  const under = (base: string) => path === base || path.startsWith(base + '/');

  if (path === '/api/external/ping') return '';

  if (under('/api/documents') || under('/api/folders')) {
    if (read) return 'read:documents';
    if (m === 'DELETE') return 'delete:documents';
    if (/^\/api\/documents\/trash\/(purge|empty)$/.test(path)) return 'delete:documents';
    return 'write:documents';
  }
  if (under('/api/preview')) return read ? 'read:documents' : null;
  if (under('/api/departments')) return read ? 'read:documents' : 'admin:permissions';
  if (under('/api/users')) return read ? 'read:users' : 'admin:permissions';
  if (under('/api/audit-logs')) return read ? 'export:audit' : null;
  return null;
}

export class ApiKeyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Confere a chave e devolve o registro do usuário (linha do banco) que ela representa */
export async function authenticateApiKey(raw: string, req: Request): Promise<{ key: ApiKeyContext; userRow: any }> {
  const { rows } = await pool.query(
    `SELECT id, name, scopes, status, created_by_id FROM api_keys WHERE key_hash = $1 LIMIT 1`,
    [hashApiKey(raw)]
  );
  const k = rows[0];
  if (!k) throw new ApiKeyError(401, 'Chave de API inválida.');
  if (k.status !== 'ACTIVE') throw new ApiKeyError(401, 'Esta chave de API foi revogada.');
  if (!k.created_by_id) {
    throw new ApiKeyError(401, 'Esta chave foi criada por uma versão antiga do sistema e não funciona. Gere uma nova chave na tela Sistema.');
  }

  const scopes: string[] = k.scopes || [];
  const needed = requiredScope(req.method, req.originalUrl || req.url);
  if (needed === null) throw new ApiKeyError(403, 'Esta rota não pode ser acessada com chave de API.');
  if (needed && !scopes.includes(needed)) {
    throw new ApiKeyError(403, `A chave "${k.name}" não tem o escopo ${needed}.`);
  }

  const { rows: users } = await pool.query('SELECT * FROM users WHERE id = $1', [k.created_by_id]);
  const userRow = users[0];
  if (!userRow || userRow.status === 'BLOCKED' || userRow.status === 'INACTIVE') {
    throw new ApiKeyError(401, 'A pessoa que criou esta chave não está mais ativa. Gere uma nova chave.');
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 100);
  pool.query('UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $1 WHERE id = $2', [ip, k.id]).catch(() => {});

  return { key: { id: k.id, name: k.name, scopes }, userRow };
}

export function toApiKeyDto(k: any) {
  return {
    id: k.id,
    name: k.name,
    keyPreview: k.key_preview,
    scopes: k.scopes || [],
    status: k.status,
    createdBy: k.created_by,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    lastUsedIp: k.last_used_ip || null,
    /** Chaves antigas (sem dono registrado) não funcionam: precisam ser geradas de novo */
    usable: Boolean(k.created_by_id),
  };
}

export const API_KEY_COLUMNS = 'id, name, key_preview, scopes, status, created_by, created_by_id, created_at, last_used_at, last_used_ip';
