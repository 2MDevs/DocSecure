import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import {
  getAllSettingsSummary,
  saveSetting,
  getEffectiveSetting,
  markSetupCompleted,
  SettingsUpdateSchema,
  DEFAULT_SETTINGS,
} from '../services/systemSettings';
import { sendTestEmail, sendPasswordResetEmail } from '../mailer';

export const integrationsRouter = Router();

// Todas as rotas /api/integrations/* exigem autenticação e papel 'developer'
integrationsRouter.use(requireAuth, requireRole('developer'));

// Cache de reautenticação recente por ID de sessão (válido por 10 minutos)
const reauthCache = new Map<string, number>();

function isRecentlyAuthenticated(req: Request): boolean {
  const sessionId = (req as any).sessionId;
  const token = req.cookies?.dcs_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const tokenHash = token ? crypto.createHash('sha256').update(token).digest('hex') : '';

  const cacheKey = sessionId || tokenHash;
  if (!cacheKey) return false;

  const lastAuth = reauthCache.get(cacheKey);
  if (!lastAuth) return false;

  // 10 minutos = 600.000 ms
  return Date.now() - lastAuth < 10 * 60 * 1000;
}

function setReauthenticated(req: Request) {
  const sessionId = (req as any).sessionId;
  const token = req.cookies?.dcs_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const tokenHash = token ? crypto.createHash('sha256').update(token).digest('hex') : '';
  const cacheKey = sessionId || tokenHash;
  if (cacheKey) {
    reauthCache.set(cacheKey, Date.now());
  }
}

// 1. Obter Resumo de Configurações
integrationsRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const summary = await getAllSettingsSummary();
    return res.json(summary);
  } catch (err: any) {
    console.error('[INTEGRATIONS GET SETTINGS ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar configurações do sistema.' });
  }
});

// 2. Reautenticação do Desenvolvedor (Confirmação de Senha)
integrationsRouter.post('/verify-password', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const user = (req as any).user;

    if (!password) {
      return res.status(400).json({ error: 'Informe a sua senha atual.' });
    }

    // Buscar hash no banco
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: 'Usuário sem senha cadastrada.' });
    }

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    setReauthenticated(req);
    return res.json({ success: true, message: 'Identidade confirmada com sucesso.' });
  } catch (err: any) {
    console.error('[INTEGRATIONS REAUTH ERROR]', err);
    return res.status(500).json({ error: 'Falha ao validar senha.' });
  }
});

// 3. Salvar Configurações
integrationsRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    // Checar reautenticação dos últimos 10 minutos
    const passwordHeader = req.headers['x-reauth-password'] as string | undefined;
    const passwordBody = req.body?.__reauthPassword;

    if (passwordHeader || passwordBody) {
      const passToCheck = passwordHeader || passwordBody;
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      if (rows.length > 0 && rows[0].password_hash) {
        const isValid = await bcrypt.compare(passToCheck, rows[0].password_hash);
        if (isValid) setReauthenticated(req);
      }
    }

    if (!isRecentlyAuthenticated(req)) {
      return res.status(403).json({
        requireReauth: true,
        error: 'Por motivos de segurança, confirme sua senha antes de salvar alterações nesta tela.',
      });
    }

    // Validação com Zod
    const parseResult = SettingsUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json({ error: issues });
    }

    const updates = parseResult.data as Record<string, string | undefined>;
    const alteredKeys: string[] = [];
    const alteredSecrets: string[] = [];

    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue; // Não enviado

      const meta = DEFAULT_SETTINGS[key];
      if (!meta) continue;

      if (meta.isSecret) {
        // Se enviado vazio ou só espaços, mantém o segredo atual (não sobrescreve com vazio)
        if (val === '' || val === null) {
          continue;
        }
        await saveSetting(key, val, user.email);
        alteredSecrets.push(key);
      } else {
        await saveSetting(key, val, user.email);
        alteredKeys.push(key);
      }
    }

    // Tratar solicitações de remoção explícita de segredos (ex: removeSecret = 'SMTP_PASS')
    if (req.body.__removeSecret && typeof req.body.__removeSecret === 'string') {
      const toRemove = req.body.__removeSecret;
      if (DEFAULT_SETTINGS[toRemove]?.isSecret) {
        await saveSetting(toRemove, null, user.email);
        alteredSecrets.push(`${toRemove} (removido)`);
      }
    }

    // Auditoria Imutável (NUNCA grava o valor dos segredos, apenas a indicação de alteração)
    const logDetails = [
      alteredKeys.length > 0 ? `Chaves atualizadas: ${alteredKeys.join(', ')}` : '',
      alteredSecrets.length > 0 ? `Segredos criptografados: ${alteredSecrets.join(', ')} (valores ocultos por segurança)` : '',
    ]
      .filter(Boolean)
      .join(' | ') || 'Configurações de sistema salvas sem alterações de valor.';

    const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
    const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');

    try {
      await pool.query(
        `INSERT INTO audit_logs (
          id, timestamp, user_id, user_name, role, department, action,
          resource_id, resource_name, details, ip_address, device_info, result, hash
        ) VALUES ($1, NOW(), $2, $3, $4, $5, 'INTEGRATION_SETTINGS_MODIFIED', 'system_settings', 'Integração & Variáveis', $6, $7, 'Painel Web', 'SUCCESS', $8)`,
        [logId, user.id, user.name, user.role, user.departmentName || 'Infraestrutura', logDetails, ip, logHash]
      );
    } catch (e) {
      console.warn('[Audit Log Insert Warning]', e);
    }

    // Regra 5: Ao salvar o SMTP, envie automaticamente um e-mail de teste.
    // Se o envio funcionar, grave SETUP_COMPLETED='true' em system_settings.
    const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
    const smtpWasUpdated = alteredKeys.some((k) => smtpKeys.includes(k)) || alteredSecrets.some((k) => smtpKeys.includes(k));

    let smtpAutoTestResult: { success: boolean; message: string } | null = null;
    let setupCompletedNow = false;

    if (smtpWasUpdated) {
      console.log(`[SMTP AUTO-TEST] Parâmetros SMTP atualizados. Disparando e-mail de teste automático para ${user.email}...`);
      try {
        const testRes = await sendTestEmail(user.email, user.name);
        smtpAutoTestResult = testRes;

        if (testRes.success) {
          await markSetupCompleted(user.email);
          setupCompletedNow = true;
          console.log(`[SETUP COMPLETED] Configuração inicial concluída com sucesso por ${user.email}.`);

          // Auditoria de conclusão de configuração inicial
          const setupLogId = 'audit-' + crypto.randomBytes(8).toString('hex');
          const setupLogHash = crypto.createHash('sha256').update(setupLogId + user.id + Date.now()).digest('hex');
          await pool.query(
            `INSERT INTO audit_logs (
              id, timestamp, user_id, user_name, role, department, action,
              resource_id, resource_name, details, ip_address, device_info, result, hash
            ) VALUES ($1, NOW(), $2, $3, $4, $5, 'INITIAL_SETUP_COMPLETED', 'system_settings', 'Configuração Inicial Concluída', $6, $7, 'Painel Web', 'SUCCESS', $8)`,
            [
              setupLogId,
              user.id,
              user.name,
              user.role,
              user.departmentName || 'Infraestrutura',
              `Configuração inicial concluída. E-mail de teste SMTP entregue com sucesso para ${user.email}. 2FA ativado para todos os usuários.`,
              ip,
              setupLogHash,
            ]
          );
        }
      } catch (testErr: any) {
        smtpAutoTestResult = { success: false, message: testErr.message || 'Falha ao executar teste automático de e-mail.' };
      }
    }

    let responseMessage = 'Configurações atualizadas e aplicadas em tempo real com sucesso.';
    if (smtpAutoTestResult) {
      if (smtpAutoTestResult.success) {
        responseMessage = `Configurações salvas e e-mail de teste enviado com sucesso para ${user.email}! Configuração inicial concluída (2FA ativado para o sistema).`;
      } else {
        responseMessage = `Configurações salvas. Porém o teste automático do servidor SMTP falhou: ${smtpAutoTestResult.message}. O modo de configuração inicial permanecerá ativo até um envio bem-sucedido.`;
      }
    }

    const updatedSummary = await getAllSettingsSummary();
    return res.json({
      success: true,
      message: responseMessage,
      smtpTest: smtpAutoTestResult,
      setupCompleted: setupCompletedNow,
      summary: updatedSummary,
    });
  } catch (err: any) {
    console.error('[INTEGRATIONS SAVE ERROR]', err);
    return res.status(500).json({ error: err.message || 'Erro ao salvar configurações.' });
  }
});

// 4. Teste de Conexão SMTP
integrationsRouter.post('/test-smtp', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    const result = await sendTestEmail(user.email, user.name);

    if (result.success) {
      // Se teste manual funcionar, também garante gravação do SETUP_COMPLETED
      await markSetupCompleted(user.email);
    }

    // Auditoria
    try {
      const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
      const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
      await pool.query(
        `INSERT INTO audit_logs (
          id, timestamp, user_id, user_name, role, department, action,
          resource_id, resource_name, details, ip_address, device_info, result, hash
        ) VALUES ($1, NOW(), $2, $3, $4, $5, 'INTEGRATION_SMTP_TEST', 'smtp_service', 'Teste Servidor SMTP', $6, $7, 'Painel Web', $8, $9)`,
        [
          logId,
          user.id,
          user.name,
          user.role,
          user.departmentName || 'Infraestrutura',
          `Teste de envio SMTP para ${user.email}: ${result.message}`,
          ip,
          result.success ? 'SUCCESS' : 'FAILED',
          logHash,
        ]
      );
    } catch {}

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    return res.json({ success: true, message: result.message, setupCompleted: true });
  } catch (err: any) {
    console.error('[INTEGRATIONS SMTP TEST ERROR]', err);
    return res.status(500).json({
      success: false,
      message: `Erro interno no teste SMTP: ${err.message}`,
    });
  }
});

// 5. Teste de Conexão Inteligência Artificial (Google Gemini)
integrationsRouter.post('/test-gemini', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    const apiKey = (await getEffectiveSetting('GEMINI_API_KEY')).value;

    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'A chave GEMINI_API_KEY não está configurada no banco nem no .env.',
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Ping test DocSecure. Responda apenas "OK".',
      });

      const reply = response.text || 'OK';

      // Auditoria
      try {
        const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
        const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
        await pool.query(
          `INSERT INTO audit_logs (
            id, timestamp, user_id, user_name, role, department, action,
            resource_id, resource_name, details, ip_address, device_info, result, hash
          ) VALUES ($1, NOW(), $2, $3, $4, $5, 'INTEGRATION_GEMINI_TEST', 'gemini_api', 'Teste Gemini API', $6, $7, 'Painel Web', 'SUCCESS', $8)`,
          [logId, user.id, user.name, user.role, user.departmentName || 'Infraestrutura', 'Conexão com Gemini 2.5 Flash testada com sucesso.', ip, logHash]
        );
      } catch {}

      return res.json({
        success: true,
        message: `Conexão bem-sucedida! O modelo Gemini respondeu com sucesso: "${reply.trim()}".`,
      });
    } catch (apiError: any) {
      console.error('[GEMINI TEST ERROR]', apiError.message);
      return res.status(400).json({
        success: false,
        message: `Erro retornado pela API do Gemini: ${apiError.message || 'Chave de API inválida ou erro na requisição.'}`,
      });
    }
  } catch (err: any) {
    console.error('[INTEGRATIONS GEMINI TEST ERROR]', err);
    return res.status(500).json({
      success: false,
      message: `Erro ao testar API do Gemini: ${err.message}`,
    });
  }
});

// 6. Enviar Link de Redefinição de Senha ao Admin Principal
integrationsRouter.post('/send-admin-reset', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    // Determinar e-mail do admin principal
    let targetAdminEmail = (await getEffectiveSetting('ADMIN_EMAIL')).value;

    if (!targetAdminEmail) {
      const { rows } = await pool.query(
        "SELECT email FROM users WHERE role IN ('DEVELOPER', 'DIRECTOR') ORDER BY created_at ASC LIMIT 1"
      );
      if (rows.length > 0) {
        targetAdminEmail = rows[0].email;
      }
    }

    if (!targetAdminEmail) {
      return res.status(400).json({
        error: 'Nenhum e-mail de administrador configurado (defina ADMIN_EMAIL ou cadastre um administrador).',
      });
    }

    // Gerar token de uso único (hash SHA-256 no banco)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetId = 'reset_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Buscar ID do usuário admin
    const adminUserRes = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = $1 LIMIT 1', [
      targetAdminEmail.toLowerCase(),
    ]);
    const adminUserId = adminUserRes.rows[0]?.id || user.id;
    const adminUserName = adminUserRes.rows[0]?.name || 'Administrador Principal';

    await pool.query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [resetId, adminUserId, tokenHash, expiresAt]
    );

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    const sent = await sendPasswordResetEmail(targetAdminEmail, adminUserName, resetUrl);
    if (!sent) {
      return res.status(500).json({
        error: 'Falha ao despachar o e-mail pelo servidor SMTP. Verifique as configurações de e-mail.',
      });
    }

    // Auditoria
    try {
      const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
      const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
      await pool.query(
        `INSERT INTO audit_logs (
          id, timestamp, user_id, user_name, role, department, action,
          resource_id, resource_name, details, ip_address, device_info, result, hash
        ) VALUES ($1, NOW(), $2, $3, $4, $5, 'ADMIN_PASSWORD_RESET_DISPATCHED', 'admin_account', 'Redefinição de Senha Admin', $6, $7, 'Painel Web', 'SUCCESS', $8)`,
        [
          logId,
          user.id,
          user.name,
          user.role,
          user.departmentName || 'Infraestrutura',
          `Link de redefinição de senha gerado e enviado para o administrador (${targetAdminEmail}).`,
          ip,
          logHash,
        ]
      );
    } catch {}

    return res.json({
      success: true,
      message: `Link de redefinição de senha enviado com sucesso para ${targetAdminEmail}.`,
    });
  } catch (err: any) {
    console.error('[INTEGRATIONS SEND ADMIN RESET ERROR]', err);
    return res.status(500).json({ error: 'Erro ao enviar link de redefinição para o administrador.' });
  }
});
