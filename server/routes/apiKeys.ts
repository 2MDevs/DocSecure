import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

export const apiKeysRouter = Router();

// Listar Chaves de API
apiKeysRouter.get('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT id, name, key_preview, scopes, status, created_by, created_at, last_used_at FROM api_keys ORDER BY created_at DESC');
    return res.json(
      rows.map((k) => ({
        id: k.id,
        name: k.name,
        keyPreview: k.key_preview,
        scopes: k.scopes || [],
        status: k.status,
        createdBy: k.created_by,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      }))
    );
  } catch (err: any) {
    console.error('[API KEYS GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao listar chaves de API.' });
  }
});

// Criar Chave de API: Gera com crypto.randomBytes e exibe a chave completa apenas uma vez
apiKeysRouter.post('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { name, scopes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome da credencial é obrigatório.' });
    }

    const user = (req as any).user;
    const keyId = 'key-' + crypto.randomBytes(8).toString('hex');
    const rawKey = 'dcs_live_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPreview = rawKey.substring(0, 12) + '...' + rawKey.substring(rawKey.length - 4);

    await pool.query(
      `INSERT INTO api_keys (id, name, key_preview, key_hash, scopes, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW())`,
      [keyId, name, keyPreview, keyHash, scopes || ['read:documents'], user?.name || 'Administrador']
    );

    return res.status(201).json({
      id: keyId,
      name,
      keyPreview,
      fullKey: rawKey, // Exibida exclusivamente nesta resposta de criação
      scopes: scopes || ['read:documents'],
      status: 'ACTIVE',
      createdBy: user?.name || 'Administrador',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
  } catch (err: any) {
    console.error('[API KEYS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao gerar chave de API.' });
  }
});

apiKeysRouter.post('/:id/revoke', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE api_keys SET status = 'REVOKED' WHERE id = $1", [id]);
    return res.json({ success: true, message: 'Chave revogada.' });
  } catch (err: any) {
    console.error('[API KEYS REVOKE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao revogar chave.' });
  }
});

apiKeysRouter.delete('/:id', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[API KEYS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao remover chave.' });
  }
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
