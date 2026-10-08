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
 * Envia código numérico de 2FA por e-mail corporativo.
 */
export async function send2FACode(email: string, nome: string, codigo: string): Promise<boolean> {
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

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Código de Segurança DocSecure</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1426; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background-color: #0f1c38; border: 1px solid #1e3a8a; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .logo { font-size: 20px; font-weight: bold; color: #3b82f6; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
        .code-box { background: #08101e; border: 1px solid #3b82f6; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; }
        .code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #60a5fa; }
        .expiry { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 8px; }
        .warning { font-size: 12px; color: #f87171; border-top: 1px solid #1e293b; padding-top: 18px; margin-top: 24px; line-height: 1.5; }
        .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">DocSecure Enterprise</div>
        <div class="title">Código de Verificação em Duas Etapas</div>
        <div class="text">
          Olá, <strong>${nome || 'Colaborador'}</strong>.<br>
          Detectamos uma tentativa de login em um novo dispositivo. Utilize o código de segurança abaixo para autorizar o seu acesso:
        </div>
        
        <div class="code-box">
          <div class="code">${codigo}</div>
          <div class="expiry">Válido por 10 minutos</div>
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
      subject: `Código de verificação de segurança: ${codigo}`,
      text: `Olá ${nome}, seu código de acesso DocSecure é: ${codigo}. Válido por 10 minutos. Se não foi você, ignore este e-mail.`,
      html,
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
      <title>Redefinição de Senha DocSecure</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1426; color: #f1f5f9; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background-color: #0f1c38; border: 1px solid #1e3a8a; border-radius: 16px; padding: 32px; }
        .logo { font-size: 20px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; text-transform: uppercase; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
        .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; margin: 16px 0; }
        .warning { font-size: 12px; color: #94a3b8; border-top: 1px solid #1e293b; padding-top: 18px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">DocSecure Enterprise</div>
        <div class="title">Definição / Redefinição de Senha</div>
        <div class="text">
          Olá, <strong>${nome || 'Colaborador'}</strong>.<br>
          Recebemos uma solicitação para criar ou redefinir a sua senha de acesso no DocSecure.
        </div>
        <div style="text-align: center;">
          <a href="${resetUrl}" class="btn">Definir Nova Senha</a>
        </div>
        <div class="text" style="font-size: 12px; color: #94a3b8;">
          Este link é de uso único e expira em 1 hora.<br>
          Se o botão não funcionar, acesse: <br>
          <span style="color: #60a5fa; word-break: break-all;">${resetUrl}</span>
        </div>
        <div class="warning">
          Se você não solicitou a redefinição de senha, desconsidere esta mensagem.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: 'Instruções para definição de senha no DocSecure',
      text: `Olá ${nome}, utilize o link a seguir para definir sua senha (válido por 1 hora): ${resetUrl}`,
      html,
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
