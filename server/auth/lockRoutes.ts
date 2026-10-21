import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { requireAuth, revokeAllUserSessions, authRateLimiter } from './middleware';
import { getEffectiveSetting, getMaxUploadBytes } from '../services/systemSettings';
import { officeMode } from '../services/officeEngine';
import { writeAudit, getClientIp } from '../services/documentAccess';

/**
 * Modo de suspensão por inatividade + PIN de desbloqueio.
 *
 * - O desenvolvedor define (tela Integração) o tempo de inatividade e o limite de tentativas.
 * - Ao ficar inativo, o navegador chama /lock: a sessão passa a recusar qualquer ação (423)
 *   até o desbloqueio com o PIN (ou a senha, se o usuário não cadastrou PIN).
 * - Errou além do limite: todas as sessões do usuário são encerradas.
 */
export const lockRouter = Router();

const PIN_REGEX = /^\d{4,8}$/;

async function getPolicy() {
  const idle = parseInt((await getEffectiveSetting('LOCK_IDLE_MINUTES')).value || '10', 10);
  const attempts = parseInt((await getEffectiveSetting('PIN_MAX_ATTEMPTS')).value || '5', 10);
  return {
    lockIdleMinutes: Number.isFinite(idle) ? Math.min(Math.max(idle, 0), 240) : 10,
    pinMaxAttempts: Number.isFinite(attempts) ? Math.min(Math.max(attempts, 1), 20) : 5,
  };
}

const ctx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};

lockRouter.get('/security-policy', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const policy = await getPolicy();
  // Limite por arquivo: o navegador avisa ANTES de enviar quais arquivos passam do limite
  const maxUploadBytes = await getMaxUploadBytes().catch(() => 0);
  return res.json({ ...policy, maxUploadBytes, officePreview: officeMode(), hasPin: Boolean(user.hasPin), sessionLocked: Boolean((req as any).sessionLocked) });
});

// Coloca a sessão em suspensão (chamado pelo navegador após o tempo de inatividade)
lockRouter.post('/lock', requireAuth, async (req: Request, res: Response) => {
  await pool.query('UPDATE sessions SET locked_at = COALESCE(locked_at, NOW()) WHERE id = $1', [(req as any).sessionId]);
  return res.json({ locked: true });
});

// Desbloqueio com PIN (ou senha, quando o usuário ainda não tem PIN)
lockRouter.post('/unlock', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const { rows } = await pool.query('SELECT id, password_hash, pin_hash, pin_failed_attempts FROM users WHERE id = $1', [sessionUser.id]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Sessão inválida.' });

    const policy = await getPolicy();
    const secret = String(req.body?.pin ?? req.body?.password ?? '');
    const usingPin = Boolean(row.pin_hash);
    const hash = usingPin ? row.pin_hash : row.password_hash;
    const ok = secret.length > 0 && hash ? await bcrypt.compare(secret, hash) : false;

    if (!ok) {
      const attempts = (row.pin_failed_attempts || 0) + 1;
      if (attempts >= policy.pinMaxAttempts) {
        await pool.query('UPDATE users SET pin_failed_attempts = 0 WHERE id = $1', [row.id]);
        await revokeAllUserSessions(row.id);
        await writeAudit(ctx(req), 'SESSION_UNLOCK_FAILED', row.id, sessionUser.name, `Limite de ${policy.pinMaxAttempts} tentativas de desbloqueio atingido: sessões encerradas.`, 'BLOCKED', getClientIp(req));
        res.clearCookie('dcs_session', { path: '/' });
        return res.status(401).json({
          error: `Você errou ${policy.pinMaxAttempts} vezes. Por segurança, a sessão foi encerrada. Entre novamente.`,
          loggedOut: true,
        });
      }
      await pool.query('UPDATE users SET pin_failed_attempts = $1 WHERE id = $2', [attempts, row.id]);
      return res.status(400).json({
        error: `${usingPin ? 'PIN' : 'Senha'} incorreto(a). Restam ${policy.pinMaxAttempts - attempts} tentativa(s).`,
        remainingAttempts: policy.pinMaxAttempts - attempts,
      });
    }

    await pool.query('UPDATE users SET pin_failed_attempts = 0 WHERE id = $1', [row.id]);
    await pool.query('UPDATE sessions SET locked_at = NULL, last_seen_at = NOW() WHERE id = $1', [(req as any).sessionId]);
    return res.json({ unlocked: true });
  } catch (err) {
    console.error('[UNLOCK ERROR]', err);
    return res.status(500).json({ error: 'Erro ao desbloquear a sessão.' });
  }
});

// Cadastrar ou trocar o PIN (exige a senha atual)
lockRouter.post('/pin', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const pin = String(req.body?.pin || '');
    const password = String(req.body?.currentPassword || '');
    if (!PIN_REGEX.test(pin)) return res.status(400).json({ error: 'O PIN deve ter de 4 a 8 números.' });
    if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
      return res.status(400).json({ error: 'Escolha um PIN menos óbvio (sem números repetidos ou em sequência).' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!rows[0]?.password_hash || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    const pinHash = await bcrypt.hash(pin, 12);
    await pool.query('UPDATE users SET pin_hash = $1, pin_failed_attempts = 0 WHERE id = $2', [pinHash, user.id]);
    await writeAudit(ctx(req), 'USER_EDITED', user.id, user.name, 'PIN de desbloqueio cadastrado/alterado.', 'SUCCESS', getClientIp(req));
    return res.json({ success: true, message: 'PIN salvo com sucesso.' });
  } catch (err) {
    console.error('[PIN SET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao salvar o PIN.' });
  }
});

// Remover o PIN (volta a desbloquear com a senha)
lockRouter.delete('/pin', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const password = String(req.body?.currentPassword || '');
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!rows[0]?.password_hash || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }
    await pool.query('UPDATE users SET pin_hash = NULL, pin_failed_attempts = 0 WHERE id = $1', [user.id]);
    await writeAudit(ctx(req), 'USER_EDITED', user.id, user.name, 'PIN de desbloqueio removido.', 'SUCCESS', getClientIp(req));
    return res.json({ success: true, message: 'PIN removido. O desbloqueio passa a usar a sua senha.' });
  } catch (err) {
    console.error('[PIN DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao remover o PIN.' });
  }
});
