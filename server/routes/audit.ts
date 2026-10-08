import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

export const auditRouter = Router();

// Leitura de logs de auditoria (Apenas Administradores e Diretores)
auditRouter.get('/', requireAuth, requireRole('DEVELOPER', 'DIRECTOR'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
    return res.json(
      rows.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        userId: log.user_id,
        userName: log.user_name,
        role: log.role,
        department: log.department,
        action: log.action,
        resourceId: log.resource_id,
        resourceName: log.resource_name,
        details: log.details,
        ipAddress: log.ip_address,
        deviceInfo: log.device_info,
        result: log.result,
        hash: log.hash,
        previousHash: log.previous_hash,
      }))
    );
  } catch (err: any) {
    console.error('[AUDIT GET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar logs de auditoria.' });
  }
});

// Registro de log de auditoria: O servidor preenche usuário, IP e horário a partir da sessão
auditRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { action, resourceId, resourceName, details, result } = req.body;
    const user = (req as any).user;
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Dispositivo Corporativo';

    const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
    const logHash = crypto
      .createHash('sha256')
      .update(`${logId}:${user.id}:${action}:${Date.now()}`)
      .digest('hex');

    await pool.query(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_name, role, department, action,
        resource_id, resource_name, details, ip_address, device_info, result, hash
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        logId,
        user.id,
        user.name,
        user.role,
        user.departmentName,
        action || 'ACTION',
        resourceId || null,
        resourceName || 'Recurso',
        details || '',
        clientIp,
        userAgent,
        result || 'SUCCESS',
        logHash,
      ]
    );

    const created = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [logId]);
    return res.status(201).json(created.rows[0]);
  } catch (err: any) {
    console.error('[AUDIT POST ERROR]', err);
    return res.status(500).json({ error: 'Erro ao registrar evento de auditoria.' });
  }
});
