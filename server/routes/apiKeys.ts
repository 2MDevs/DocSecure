import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import { API_KEY_COLUMNS, API_KEY_SCOPES, generateApiKey, toApiKeyDto } from '../auth/apiKeyAuth';
import { writeAudit } from '../services/documentAccess';

export const apiKeysRouter = Router();

// As chaves só são gerenciadas por quem está logado na tela (nunca por outra chave de API)
const noApiKey = (req: Request, res: Response, next: () => void) =>
  (req as any).apiKey ? res.status(403).json({ error: 'Chaves de API não podem gerenciar chaves de API.' }) : next();

const auditCtx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};
const clientIp = (req: Request) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// Listar Chaves de API
apiKeysRouter.get('/', requireAuth, noApiKey, requireRole('DEVELOPER', 'DIRECTOR'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT ${API_KEY_COLUMNS} FROM api_keys ORDER BY created_at DESC`);
    return res.json(rows.map(toApiKeyDto));
  } catch (err: any) {
    console.error('[API KEYS GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao listar chaves de API.' });
  }
});

// Criar Chave de API: gerada no servidor e mostrada completa apenas nesta resposta
apiKeysRouter.post('/', requireAuth, noApiKey, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Nome da credencial é obrigatório.' });
    const scopes = Array.isArray(req.body?.scopes)
      ? [...new Set(req.body.scopes.map(String))].filter((s) => (API_KEY_SCOPES as readonly string[]).includes(s as string))
      : [];
    if (!scopes.length) return res.status(400).json({ error: 'Escolha pelo menos um escopo de acesso.' });

    const user = (req as any).user;
    const keyId = 'key-' + crypto.randomBytes(8).toString('hex');
    const { rawKey, keyHash, keyPreview } = generateApiKey();

    await pool.query(
      `INSERT INTO api_keys (id, name, key_preview, key_hash, scopes, status, created_by, created_by_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, NOW())`,
      [keyId, name, keyPreview, keyHash, scopes, user.name, user.id]
    );
    await writeAudit(auditCtx(req), 'API_KEY_CREATED', keyId, name, `Chave de API gerada com escopos: ${scopes.join(', ')}.`, 'SUCCESS', clientIp(req)).catch(() => {});

    const { rows } = await pool.query(`SELECT ${API_KEY_COLUMNS} FROM api_keys WHERE id = $1`, [keyId]);
    return res.status(201).json({ ...toApiKeyDto(rows[0]), fullKey: rawKey });
  } catch (err: any) {
    console.error('[API KEYS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao gerar chave de API.' });
  }
});

apiKeysRouter.post('/:id/revoke', requireAuth, noApiKey, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("UPDATE api_keys SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 RETURNING name", [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Chave não encontrada.' });
    await writeAudit(auditCtx(req), 'API_KEY_REVOKED', id, rows[0].name, 'Chave de API revogada: deixa de funcionar imediatamente.', 'SUCCESS', clientIp(req)).catch(() => {});
    return res.json({ success: true, message: 'Chave revogada.' });
  } catch (err: any) {
    console.error('[API KEYS REVOKE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao revogar chave.' });
  }
});

apiKeysRouter.delete('/:id', requireAuth, noApiKey, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[API KEYS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao remover chave.' });
  }
});

// Teste de conexão para o outro sistema: GET /api/external/ping com a chave
export const externalRouter = Router();
externalRouter.get('/ping', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const key = (req as any).apiKey;
  return res.json({
    ok: true,
    service: 'DocSecure',
    key: key ? { name: key.name, scopes: key.scopes } : null,
    actingAs: { id: user.id, name: user.name, role: user.role, department: user.departmentName },
    time: new Date().toISOString(),
  });
});

// Rotas de Webhooks
export const webhooksRouter = Router();

webhooksRouter.get('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM webhooks ORDER BY name ASC');
    return res.json(
      rows.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        events: w.events || [],
        secretKey: w.secret_key ? 'whsec_' + w.secret_key.substring(0, 6) + '...' : '',
        status: w.status,
        lastTriggeredAt: w.last_triggered_at,
        successRate: w.success_rate,
      }))
    );
  } catch (err: any) {
    console.error('[WEBHOOKS GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao listar webhooks.' });
  }
});

webhooksRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { name, url, events } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Nome e URL do webhook são obrigatórios.' });
    }

    const whId = 'wh-' + crypto.randomBytes(8).toString('hex');
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');

    await pool.query(
      `INSERT INTO webhooks (id, name, url, events, secret_key, status, success_rate)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 100)`,
      [whId, name, url, events || ['*'], secret]
    );

    return res.status(201).json({
      id: whId,
      name,
      url,
      events: events || ['*'],
      secretKey: secret,
      status: 'ACTIVE',
      lastTriggeredAt: null,
      successRate: 100,
    });
  } catch (err: any) {
    console.error('[WEBHOOKS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao cadastrar webhook.' });
  }
});

webhooksRouter.delete('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM webhooks WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[WEBHOOKS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir webhook.' });
  }
});
