import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db';

export interface SecretMasked {
  configured: boolean;
  last4: string;
}

export type SettingSource = 'database' | 'env' | 'default';

export interface SettingItem {
  key: string;
  value?: string;
  configured?: boolean;
  last4?: string;
  source: SettingSource;
  isSecret: boolean;
}

// Chaves gerenciadas e seus valores padrão
export const DEFAULT_SETTINGS: Record<string, { defaultValue: string; isSecret: boolean }> = {
  SMTP_HOST: { defaultValue: '', isSecret: false },
  SMTP_PORT: { defaultValue: '587', isSecret: false },
  SMTP_SECURE: { defaultValue: 'false', isSecret: false },
  SMTP_USER: { defaultValue: '', isSecret: false },
  SMTP_PASS: { defaultValue: '', isSecret: true },
  SMTP_FROM: { defaultValue: 'DocSecure <nao-responda@docsecure.io>', isSecret: false },
  SESSION_TTL_HOURS: { defaultValue: '8', isSecret: false },
  MAX_UPLOAD_MB: { defaultValue: '25', isSecret: false },
  ADMIN_EMAIL: { defaultValue: '', isSecret: false },
  GEMINI_API_KEY: { defaultValue: '', isSecret: true },
};

// Validação com Zod
export const SettingsUpdateSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? String(val) : undefined))
    .refine((val) => {
      if (val === undefined || val === '') return true;
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= 65535;
    }, { message: 'A porta SMTP deve estar entre 1 e 65535.' }),
  SMTP_SECURE: z.union([z.boolean(), z.string()]).optional().transform((val) => (val !== undefined ? String(val) : undefined)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SESSION_TTL_HOURS: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? String(val) : undefined))
    .refine((val) => {
      if (val === undefined || val === '') return true;
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= 72;
    }, { message: 'SESSION_TTL_HOURS deve estar entre 1 e 72 horas.' }),
  MAX_UPLOAD_MB: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => (val !== undefined ? String(val) : undefined))
    .refine((val) => {
      if (val === undefined || val === '') return true;
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= 500;
    }, { message: 'MAX_UPLOAD_MB deve estar entre 1 e 500 MB.' }),
  ADMIN_EMAIL: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().email().safeParse(val).success;
    }, { message: 'ADMIN_EMAIL deve ser um e-mail válido.' }),
  GEMINI_API_KEY: z.string().optional(),
});

// Cache em memória para funcionamento resiliente mesmo sem banco conectado
const memorySettingsCache = new Map<string, { value: string; isSecret: boolean; updatedAt: Date; updatedBy: string }>();

// Verifica se a chave de criptografia de segredos está presente e válida
export function getEncryptionKey(): Buffer | null {
  const envKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!envKey) return null;
  try {
    const keyBuf = Buffer.from(envKey.trim(), 'base64');
    if (keyBuf.length === 32) {
      return keyBuf;
    }
  } catch {}
  return null;
}

export function isEncryptionKeyConfigured(): boolean {
  return getEncryptionKey() !== null;
}

// Criptografia AES-256-GCM para segredos
export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('SETTINGS_ENCRYPTION_KEY não configurada ou inválida (deve ser 32 bytes em base64).');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Formato: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('SETTINGS_ENCRYPTION_KEY não configurada no .env.');
  }

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Pode ser um valor antigo ou texto puro de transição
    return cipherText;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Busca o valor efetivo de uma configuração com a ordem de precedência:
 * Banco de Dados > .env > Padrão
 */
export async function getEffectiveSetting(key: string): Promise<{ value: string; source: SettingSource; isSecret: boolean }> {
  const meta = DEFAULT_SETTINGS[key] || { defaultValue: '', isSecret: false };

  // 1. Tentar buscar no banco de dados
  try {
    const { rows } = await pool.query('SELECT value, is_secret FROM system_settings WHERE key = $1', [key]);
    if (rows.length > 0 && rows[0].value !== null && rows[0].value !== '') {
      let rawVal = rows[0].value;
      if (rows[0].is_secret) {
        try {
          rawVal = decryptSecret(rawVal);
        } catch (e) {
          console.error(`[DECRYPT ERROR for ${key}]`, e);
        }
      }
      return { value: rawVal, source: 'database', isSecret: rows[0].is_secret };
    }
  } catch {
    // Se o banco estiver offline, checa o cache em memória
    if (memorySettingsCache.has(key)) {
      const item = memorySettingsCache.get(key)!;
      let rawVal = item.value;
      if (item.isSecret) {
        try {
          rawVal = decryptSecret(rawVal);
        } catch {}
      }
      return { value: rawVal, source: 'database', isSecret: item.isSecret };
    }
  }

  // 2. Tentar buscar nas variáveis de ambiente (.env)
  const envVal = process.env[key];
  if (envVal !== undefined && envVal !== '') {
    return { value: envVal, source: 'env', isSecret: meta.isSecret };
  }

  // 3. Valor padrão
  return { value: meta.defaultValue, source: 'default', isSecret: meta.isSecret };
}

/**
 * Retorna o resumo formatado para o frontend (NUNCA devolve segredos em texto puro).
 */
export async function getAllSettingsSummary(): Promise<{
  settings: SettingItem[];
  envOnly: { key: string; isSet: boolean }[];
  encryptionKeyConfigured: boolean;
  adminStatus: { exists: boolean; createdAt?: string; email?: string };
  initialSetupMode: boolean;
}> {
  const settings: SettingItem[] = [];

  for (const [key, meta] of Object.entries(DEFAULT_SETTINGS)) {
    const effective = await getEffectiveSetting(key);

    if (meta.isSecret) {
      const configured = Boolean(effective.value && effective.value.trim().length > 0);
      const last4 = configured && effective.value.length >= 4 ? effective.value.slice(-4) : (configured ? effective.value : '');
      settings.push({
        key,
        configured,
        last4,
        source: effective.source,
        isSecret: true,
      });
    } else {
      settings.push({
        key,
        value: effective.value,
        source: effective.source,
        isSecret: false,
      });
    }
  }

  // Status das variáveis somente leitura (.env)
  const envOnlyKeys = [
    'DATABASE_URL',
    'SETTINGS_ENCRYPTION_KEY',
    'DEVELOPER_EMAILS',
    'PORT',
    'NODE_ENV',
    'ADMIN_INITIAL_PASSWORD',
  ];

  const envOnly = envOnlyKeys.map((key) => ({
    key,
    isSet: Boolean(process.env[key] && process.env[key]!.trim().length > 0),
  }));

  // Status do Administrador inicial
  let adminStatus = { exists: false, createdAt: undefined as string | undefined, email: undefined as string | undefined };
  try {
    const { rows } = await pool.query(
      "SELECT email, created_at FROM users WHERE role IN ('DEVELOPER', 'DIRECTOR') ORDER BY created_at ASC LIMIT 1"
    );
    if (rows.length > 0) {
      adminStatus = {
        exists: true,
        createdAt: new Date(rows[0].created_at).toLocaleDateString('pt-BR'),
        email: rows[0].email,
      };
    }
  } catch {}

  const isSetupActive = await isInitialSetupModeActive();

  return {
    settings,
    envOnly,
    encryptionKeyConfigured: isEncryptionKeyConfigured(),
    adminStatus,
    initialSetupMode: isSetupActive,
  };
}

/**
 * Verifica se o sistema está em modo de configuração inicial.
 * Regras:
 * 1. A chave SETUP_COMPLETED em system_settings não existe ou é diferente de 'true'; E
 * 2. O SMTP não está configurado (sem SMTP_HOST, SMTP_USER e SMTP_PASS efetivos).
 */
export async function isInitialSetupModeActive(): Promise<boolean> {
  try {
    // 1. Checar se SETUP_COMPLETED já foi gravado no banco como 'true'
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'SETUP_COMPLETED' LIMIT 1"
    );
    if (rows.length > 0 && rows[0].value === 'true') {
      return false;
    }

    // 2. Checar se SMTP está efetivamente configurado (HOST, USER e PASS)
    const host = (await getEffectiveSetting('SMTP_HOST')).value;
    const user = (await getEffectiveSetting('SMTP_USER')).value;
    const pass = (await getEffectiveSetting('SMTP_PASS')).value;

    const isSmtpConfigured = Boolean(
      host && host.trim().length > 0 &&
      user && user.trim().length > 0 &&
      pass && pass.trim().length > 0
    );

    if (isSmtpConfigured) {
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[Initial Setup Check Error]', err);
    return false;
  }
}

/**
 * Marca SETUP_COMPLETED='true' em system_settings.
 * Invocado EXCLUSIVAMENTE pelo sistema após teste de e-mail bem-sucedido.
 */
export async function markSetupCompleted(userEmail: string): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, is_secret, updated_at, updated_by)
     VALUES ('SETUP_COMPLETED', 'true', false, NOW(), $1)
     ON CONFLICT (key) DO UPDATE SET
       value = 'true',
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [userEmail]
  );
  memorySettingsCache.set('SETUP_COMPLETED', {
    value: 'true',
    isSecret: false,
    updatedAt: new Date(),
    updatedBy: userEmail,
  });
}

/**
 * Salva ou remove uma configuração no banco de dados
 */
export async function saveSetting(
  key: string,
  rawVal: string | null,
  userEmail: string
): Promise<{ key: string; isSecret: boolean }> {
  // SETUP_COMPLETED não pode ser alterado por nenhuma rota da API nem pela tela
  if (key === 'SETUP_COMPLETED') {
    throw new Error('A chave SETUP_COMPLETED não pode ser alterada manualmente.');
  }

  const meta = DEFAULT_SETTINGS[key] || { defaultValue: '', isSecret: false };

  // Se valor for nulo ou vazio, remove do banco (voltando para .env ou padrão)
  if (rawVal === null || rawVal === undefined || rawVal === '') {
    try {
      await pool.query('DELETE FROM system_settings WHERE key = $1', [key]);
    } catch {
      memorySettingsCache.delete(key);
    }
    return { key, isSecret: meta.isSecret };
  }

  let valToSave = rawVal;
  if (meta.isSecret) {
    if (!isEncryptionKeyConfigured()) {
      throw new Error('A variável de ambiente SETTINGS_ENCRYPTION_KEY não está configurada no .env. Impossível salvar segredos com segurança.');
    }
    valToSave = encryptSecret(rawVal);
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (key, value, is_secret, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         is_secret = EXCLUDED.is_secret,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`,
      [key, valToSave, meta.isSecret, userEmail]
    );
  } catch {
    // Fallback de memória
    memorySettingsCache.set(key, {
      value: valToSave,
      isSecret: meta.isSecret,
      updatedAt: new Date(),
      updatedBy: userEmail,
    });
  }

  return { key, isSecret: meta.isSecret };
}
