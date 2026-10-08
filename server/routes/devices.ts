import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';

export const devicesRouter = Router();

// Listar dispositivos (usuário comum vê os seus; admin vê todos)
devicesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let query = 'SELECT * FROM devices ORDER BY last_access_at DESC';
    let params: any[] = [];

    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR') {
      query = 'SELECT * FROM devices WHERE user_id = $1 ORDER BY last_access_at DESC';
      params = [user.id];
    }

    const { rows } = await pool.query(query, params);
    return res.json(
      rows.map((d) => ({
        id: d.id,
        userId: d.user_id,
        userName: d.user_name,
        deviceName: d.device_name,
        deviceType: d.device_type,
        os: d.os,
        browser: d.browser,
        ipAddress: d.ip_address,
        lastAccessAt: d.last_access_at,
        status: d.status,
        registeredAt: d.registered_at,
        trustedUntil: d.trusted_until,
        isCurrent: Boolean(d.is_current),
      }))
    );
  } catch (err: any) {
    console.error('[DEVICES GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao listar dispositivos.' });
  }
});

// Atualizar status do dispositivo (Aprovar / Bloquear)
devicesRouter.put('/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = (req as any).user;

    const devRes = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    }

    const dev = devRes.rows[0];
    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR' && dev.user_id !== user.id) {
      return res.status(403).json({ error: 'Sem permissão para alterar este dispositivo.' });
    }

    await pool.query(
      `UPDATE devices SET status = $1, trusted_until = CASE WHEN $1 = 'TRUSTED' THEN NOW() + INTERVAL '30 days' ELSE NOW() END WHERE id = $2`,
      [status || 'TRUSTED', id]
    );

    return res.json({ success: true, status });
  } catch (err: any) {
    console.error('[DEVICES STATUS ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar status do terminal.' });
  }
});

// Revogar dispositivo confiável (usuário revoga os seus, admin revoga qualquer um)
devicesRouter.post('/:id/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const devRes = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    }

    const dev = devRes.rows[0];
    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR' && dev.user_id !== user.id) {
      return res.status(403).json({ error: 'Você não tem permissão para revogar este dispositivo.' });
    }

    await pool.query(
      "UPDATE devices SET status = 'REVOKED', trusted_until = NOW() WHERE id = $1",
      [id]
    );

    return res.json({ success: true, message: 'Dispositivo revogado com sucesso.' });
  } catch (err: any) {
    console.error('[DEVICES REVOKE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao revogar dispositivo.' });
  }
});

// Excluir registro de dispositivo
devicesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const devRes = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    }

    const dev = devRes.rows[0];
    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR' && dev.user_id !== user.id) {
      return res.status(403).json({ error: 'Sem permissão para remover este dispositivo.' });
    }

    await pool.query('DELETE FROM devices WHERE id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[DEVICES DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao remover dispositivo.' });
  }
});
