import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { getEffectiveSetting } from './services/systemSettings';

dotenv.config();

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

/**
 * Monta o link único e padronizado para definição ou redefinição de senha:
 * ${baseUrl}/definir-senha?token=<token>
 */
export function buildPasswordLink(token: string, reqBaseUrl?: string): string {
  const baseUrl = process.env.APP_URL || reqBaseUrl || 'http://localhost:3000';
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/definir-senha?token=${encodeURIComponent(token)}`;
}

export async function getDynamicTransporter() {
  const host = (await getEffectiveSetting('SMTP_HOST')).value;
  const portStr = (await getEffectiveSetting('SMTP_PORT')).value;
  const secureStr = (await getEffectiveSetting('SMTP_SECURE')).value;
  const user = (await getEffectiveSetting('SMTP_USER')).value;
  const pass = (await getEffectiveSetting('SMTP_PASS')).value;

  const isConfigured = Boolean(host && user && pass);
  if (!isConfigured) return null;

  const port = parseInt(portStr || '587', 10);
  const secure = secureStr === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Envia código numérico de 2FA por e-mail corporativo com aviso anti-spam e alta entregabilidade.
 */
export async function send2FACode(email: string, nome: string, codigo: string, isFirstAccess?: boolean): Promise<boolean> {
  const masked = maskEmail(email);
  const transporter = await getDynamicTransporter();

  // Ambiente de desenvolvimento sem SMTP configurado
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[MAILER ERROR] Servidor SMTP não configurado no ambiente de produção.');
      return false;
    }

    // Permitido exclusivamente em desenvolvimento quando SMTP não configurado
    console.log(`[DEV MAILER] (Sem SMTP configurado) Código 2FA para ${masked}: ${codigo}`);
    return true;
  }

  const fromAddress = (await getEffectiveSetting('SMTP_FROM')).value || 'DocSecure <nao-responda@docsecure.io>';

  const subjectTitle = isFirstAccess
    ? `[DocSecure] Código de Confirmação do Primeiro Acesso: ${codigo}`
    : `[DocSecure] Código de Verificação em Duas Etapas: ${codigo}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${subjectTitle}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1426; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background-color: #0f1c38; border: 1px solid #1e3a8a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .logo { font-size: 20px; font-weight: bold; color: #3b82f6; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
        .code-box { background: #08101e; border: 1px solid #3b82f6; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; }
        .code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #60a5fa; }
        .expiry { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 8px; }
        .spam-box { font-size: 12px; color: #cbd5e1; background-color: #0b1426; border: 1px dashed #334155; border-radius: 8px; padding: 12px; margin: 20px 0; line-height: 1.5; }
        .warning { font-size: 12px; color: #f87171; border-top: 1px solid #1e293b; padding-top: 18px; margin-top: 20px; line-height: 1.5; }
        .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">DocSecure Enterprise</div>
        <div class="title">${isFirstAccess ? 'Confirmação de Primeiro Acesso' : 'Código de Verificação em Duas Etapas'}</div>
        <div class="text">
          Olá, <strong>${nome || 'Colaborador'}</strong>.<br>
          ${isFirstAccess
            ? 'Para concluir a ativação da sua conta e validar o seu e-mail corporativo, utilize o código de segurança abaixo:'
            : 'Detectamos uma tentativa de login em um novo dispositivo. Utilize o código de segurança abaixo para autorizar o seu acesso:'}
        </div>
        
        <div class="code-box">
          <div class="code">${codigo}</div>
          <div class="expiry">Válido por 10 minutos</div>
        </div>

        <div class="spam-box">
          <strong>💡 Dica contra Spam:</strong> Adicione o remetente <code>${fromAddress}</code> aos seus contatos confiáveis. Se esta mensagem caiu na pasta de Spam ou Lixo Eletrônico, marque-a como <em>"Não é spam"</em> para garantir a entrega rápida dos próximos acessos.
        </div>

        <div class="warning">
          <strong>Atenção:</strong> Se você não realizou esta tentativa de login, ignore este e-mail imediatamente e altere sua senha de acesso. Nenhum colaborador do DocSecure solicitará este código.
        </div>
      </div>
      <div class="footer">
        DocSecure Gestão Eletrônica de Documentos • Servidor Seguro
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: subjectTitle,
      text: `Olá ${nome}, seu código de acesso DocSecure é: ${codigo}. Válido por 10 minutos. Caso não encontre nossos e-mails, verifique a pasta de Spam ou Lixo Eletrônico e adicione ${fromAddress} aos seus contatos.`,
      html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
      },
    });
    console.log(`[MAILER] Código de verificação 2FA enviado com sucesso para ${masked}.`);
    return true;
  } catch (error: any) {
    console.error(`[MAILER ERROR] Falha ao enviar e-mail 2FA para ${masked}:`, error.message);
    return false;
  }
}

/**
 * Envia e-mail para redefinição ou primeiro acesso de senha.
 */
export async function sendPasswordResetEmail(
  email: string,
  nome: string,
  resetUrl: string
): Promise<boolean> {
  const masked = maskEmail(email);
  const transporter = await getDynamicTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[MAILER ERROR] Servidor SMTP não configurado para redefinição de senha.');
      return false;
    }
    console.log(`[DEV MAILER] Link de redefinição para ${masked}: ${resetUrl}`);
    return true;
  }

  const fromAddress = (await getEffectiveSetting('SMTP_FROM')).value || 'DocSecure <nao-responda@docsecure.io>';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>[DocSecure] Definição de Senha de Acesso</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1426; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background-color: #0f1c38; border: 1px solid #1e3a8a; border-radius: 16px; padding: 32px; }
        .logo { font-size: 20px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; text-transform: uppercase; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
        .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; margin: 16px 0; }
        .spam-box { font-size: 12px; color: #cbd5e1; background-color: #0b1426; border: 1px dashed #334155; border-radius: 8px; padding: 12px; margin: 20px 0; line-height: 1.5; }
        .warning { font-size: 12px; color: #94a3b8; border-top: 1px solid #1e293b; padding-top: 18px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">DocSecure Enterprise</div>
        <div class="title">Definição / Redefinição de Senha</div>
        <div class="text">
          Olá, <strong>${nome || 'Colaborador'}</strong>.<br>
          Recebemos uma solicitação para cadastrar ou redefinir a sua senha de acesso na plataforma DocSecure.
        </div>
        <div style="text-align: center;">
          <a href="${resetUrl}" class="btn">Definir Nova Senha</a>
        </div>
        <div class="text" style="font-size: 12px; color: #94a3b8;">
          Este link é de uso único e expira em 1 hora.<br>
          Se o botão não funcionar, copie e cole o endereço no seu navegador: <br>
          <span style="color: #60a5fa; word-break: break-all;">${resetUrl}</span>
        </div>
        <div class="spam-box">
          <strong>💡 Dica contra Spam:</strong> Adicione <code>${fromAddress}</code> aos seus contatos confiáveis ou verifique a pasta de Lixo Eletrônico/Spam caso não localize os e-mails na caixa principal.
        </div>
        <div class="warning">
          Se você não solicitou este link, desconsidere esta mensagem com segurança.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: '[DocSecure] Instruções para Definição de Senha',
      text: `Olá ${nome}, utilize o link a seguir para definir sua senha (válido por 1 hora): ${resetUrl}. Se não encontrar nossos e-mails, confira a pasta de Spam.`,
      html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
      },
    });
    console.log(`[MAILER] E-mail de redefinição de senha enviado para ${masked}.`);
    return true;
  } catch (error: any) {
    console.error(`[MAILER ERROR] Falha ao enviar redefinição de senha para ${masked}:`, error.message);
    return false;
  }
}

/**
 * Envia e-mail de teste para validar a configuração SMTP (usado na tela Integração)
 */
export async function sendTestEmail(targetEmail: string, developerName: string): Promise<{ success: boolean; message: string }> {
  const transporter = await getDynamicTransporter();
  if (!transporter) {
    return {
      success: false,
      message: 'Configurações SMTP incompletas. Preencha Servidor (Host), Usuário e Senha.',
    };
  }

  const fromAddress = (await getEffectiveSetting('SMTP_FROM')).value || 'DocSecure <nao-responda@docsecure.io>';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Teste de Conexão SMTP - DocSecure</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1426; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background-color: #0f1c38; border: 1px solid #10b981; border-radius: 16px; padding: 32px; }
        .logo { font-size: 20px; font-weight: bold; color: #10b981; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">DocSecure Enterprise</div>
        <div class="title">✅ Conexão SMTP Estabelecida com Sucesso!</div>
        <div class="text">
          Olá, <strong>${developerName}</strong>.<br><br>
          Este é um e-mail de teste disparado pelo painel de Integração do DocSecure.
          As credenciais e conexões do servidor SMTP estão funcionando perfeitamente.
          <br><br>
          <em>Data e Hora do Envio: ${new Date().toLocaleString('pt-BR')}</em>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: fromAddress,
      to: targetEmail,
      subject: 'DocSecure - Teste de Envio SMTP Concluído com Sucesso',
      text: `Olá ${developerName}, o teste de conexão SMTP do DocSecure foi concluído com sucesso em ${new Date().toLocaleString('pt-BR')}.`,
      html,
    });
    return { success: true, message: `E-mail de teste enviado com sucesso para ${targetEmail}.` };
  } catch (error: any) {
    // Retorna a mensagem de erro do servidor SMTP sem expor a senha
    return {
      success: false,
      message: `Erro retornado pelo servidor SMTP: ${error.message || 'Falha na autenticação ou timeout de conexão.'}`,
    };
  }
}
