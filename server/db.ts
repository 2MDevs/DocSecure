import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  const errMsg = '[DB CRITICAL] A variável de ambiente DATABASE_URL não está definida no .env! O servidor não pode ser iniciado sem banco de dados.';
  console.error(errMsg);
  throw new Error(errMsg);
}

// Pass connectionString directly to Pool to seamlessly support special characters (+, @, #, etc.)
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

let isPostgresHealthy = false;
let lastLatency = 0;
let lastError: string | undefined = undefined;

export function isPostgresConnected(): boolean {
  return isPostgresHealthy;
}

export interface DbStatus {
  connected: boolean;
  databaseName: string;
  host: string;
  port: number;
  tablesCount: number;
  recordsCount: number;
  latencyMs: number;
  ssl: boolean;
  mode: 'POSTGRESQL_REAL' | 'OFFLINE';
  lastChecked: string;
  error?: string;
}

export async function initDatabase(): Promise<void> {
  if (!databaseUrl) {
    lastError = 'DATABASE_URL não configurada.';
    console.error('[DB] Conexão cancelada: DATABASE_URL ausente.');
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return;
  }

  console.log('[DB] Conectando ao PostgreSQL via process.env.DATABASE_URL...');
  let client: pg.PoolClient | null = null;
  try {
    const start = Date.now();
    client = await pool.connect();
    lastLatency = Date.now() - start;
    isPostgresHealthy = true;
    lastError = undefined;

    console.log(`[DB] Conexão com PostgreSQL estabelecida com sucesso! Latência: ${lastLatency}ms`);

    // 1. Idempotent Schema Creation
    await client.query(`
      -- Departamentos / Setores
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL,
        icon_name VARCHAR(100) DEFAULT 'Building',
        color VARCHAR(50) DEFAULT '#3b82f6',
        storage_limit_bytes BIGINT DEFAULT 536870912000,
        storage_used_bytes BIGINT DEFAULT 0,
        manager_id VARCHAR(100),
        manager_name VARCHAR(255),
        description TEXT,
        is_locked BOOLEAN DEFAULT false,
        item_count INT DEFAULT 0
      );

      -- Usuários Corporativos
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        matricula VARCHAR(100) NOT NULL,
        cpf VARCHAR(50),
        phone VARCHAR(50),
        role VARCHAR(50) NOT NULL,
        department_id VARCHAR(100) NOT NULL,
        department_name VARCHAR(255) NOT NULL,
        cargo VARCHAR(100) NOT NULL,
        avatar TEXT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        password_hash VARCHAR(255),
        failed_login_attempts INT DEFAULT 0,
        locked_until TIMESTAMPTZ,
        must_change_password BOOLEAN DEFAULT false,
        two_factor_enabled BOOLEAN DEFAULT true,
        two_factor_secret VARCHAR(255),
        email_2fa_code_hash VARCHAR(64),
        email_2fa_expires TIMESTAMPTZ,
        two_fa_attempts INT DEFAULT 0,
        two_fa_last_sent TIMESTAMPTZ,
        two_fa_challenge_token VARCHAR(64),
        two_fa_challenge_expires TIMESTAMPTZ,
        permitted_folder_ids JSONB DEFAULT '[]'::jsonb,
        granular_permissions JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

      -- Sessões de Usuário
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        ip VARCHAR(100),
        user_agent TEXT,
        revoked_at TIMESTAMPTZ
      );

      -- Tokens de Recuperação / Primeiro Acesso de Senha
      CREATE TABLE IF NOT EXISTS password_resets (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Dispositivos Confiáveis (Trusted Devices)
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(255) NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        device_type VARCHAR(50) DEFAULT 'desktop',
        os VARCHAR(100) NOT NULL,
        browser VARCHAR(100) NOT NULL,
        ip_address VARCHAR(100) NOT NULL,
        last_access_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'TRUSTED',
        device_token_hash VARCHAR(64),
        fingerprint_hash VARCHAR(255),
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        trusted_until TIMESTAMPTZ,
        is_current BOOLEAN DEFAULT false
      );

      -- Pastas
      CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        department_id VARCHAR(100) NOT NULL,
        department_name VARCHAR(255) NOT NULL,
        parent_id VARCHAR(100),
        is_locked BOOLEAN DEFAULT false,
        item_count INT DEFAULT 0,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Documentos
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        extension VARCHAR(20) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes BIGINT NOT NULL,
        folder_id VARCHAR(100) NOT NULL,
        department_id VARCHAR(100) NOT NULL,
        department_name VARCHAR(255) NOT NULL,
        owner_id VARCHAR(100) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        hash_sha256 VARCHAR(255) NOT NULL,
        current_version INT DEFAULT 1,
        versions JSONB DEFAULT '[]'::jsonb,
        is_favorite BOOLEAN DEFAULT false,
        is_archived BOOLEAN DEFAULT false,
        is_shared BOOLEAN DEFAULT false,
        content_summary TEXT,
        status VARCHAR(50) DEFAULT 'active',
        scan_status VARCHAR(50) DEFAULT 'clean',
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Logs Imutáveis de Auditoria
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        user_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        department VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        resource_id VARCHAR(100),
        resource_name VARCHAR(255),
        details TEXT NOT NULL,
        ip_address VARCHAR(100) NOT NULL,
        device_info VARCHAR(255) NOT NULL,
        result VARCHAR(50) NOT NULL,
        hash VARCHAR(255) NOT NULL,
        previous_hash VARCHAR(255)
      );

      -- Chaves de API
      CREATE TABLE IF NOT EXISTS api_keys (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        key_preview VARCHAR(100) NOT NULL,
        key_hash VARCHAR(255) NOT NULL,
        scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      );

      -- Webhooks
      CREATE TABLE IF NOT EXISTS webhooks (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        events TEXT[] DEFAULT ARRAY[]::TEXT[],
        secret_key VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        last_triggered_at TIMESTAMPTZ,
        success_rate INT DEFAULT 100
      );

      -- Configurações de Sistema (Tela Integração)
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        is_secret BOOLEAN DEFAULT false,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT
      );
    `);

    // 2. Migration: Ensure all columns exist on pre-existing tables ANTES de criar os índices
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_2fa_code_hash VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_2fa_expires TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_last_sent TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_challenge_token VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_challenge_expires TIMESTAMPTZ;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_token_hash VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS trusted_until TIMESTAMPTZ;
    `);

    // 3. Criação de Índices após garantir a existência das colunas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
      CREATE INDEX IF NOT EXISTS idx_devices_token_hash ON devices(device_token_hash);
      CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
    `);

    // 3. Migration: Auto-hash any legacy plain-text passwords using bcrypt cost 12
    const unhashedUsers = await client.query(
      `SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL AND password_hash NOT LIKE '$2a$%' AND password_hash NOT LIKE '$2b$%'`
    );
    if (unhashedUsers.rows.length > 0) {
      console.log(`[DB Migration] Criptografando ${unhashedUsers.rows.length} senhas em texto puro com bcrypt (custo 12)...`);
      for (const row of unhashedUsers.rows) {
        const hashed = await bcrypt.hash(row.password_hash, 12);
        await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, row.id]);
      }
      console.log('[DB Migration] Migração de senhas para bcrypt concluída.');
    }

    // 4. Migração de Segurança: Expurgar usuário fixo de preview/teste caso exista
    await client.query(`
      DELETE FROM sessions WHERE user_id = 'user-admin' OR user_id IN (SELECT id FROM users WHERE LOWER(email) = 'admin@docsecure.io');
      DELETE FROM devices WHERE user_id = 'user-admin' OR user_id IN (SELECT id FROM users WHERE LOWER(email) = 'admin@docsecure.io');
      DELETE FROM users WHERE id = 'user-admin' OR LOWER(email) = 'admin@docsecure.io';
    `);

    // 5. Administrador Inicial do .env (Apenas se não existir nenhum usuário com papel ADMIN ou DEVELOPER)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass = process.env.ADMIN_INITIAL_PASSWORD;

    const { rows: existingAdmins } = await client.query(
      "SELECT id FROM users WHERE UPPER(role) IN ('ADMIN', 'DEVELOPER') LIMIT 1"
    );

    if (existingAdmins.length === 0 && adminEmail && adminPass) {
      console.log(`[DB Bootstrap] Nenhum ADMIN/DEVELOPER encontrado. Cadastrando administrador corporativo inicial (.env: ${adminEmail})...`);
      const hashedPass = await bcrypt.hash(adminPass, 12);
      await client.query(
        `INSERT INTO users (
          id, name, email, matricula, role, department_id, department_name, cargo,
          status, password_hash, must_change_password, two_factor_enabled,
          permitted_folder_ids, granular_permissions, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, true, true, $10, $11, NOW())
        ON CONFLICT DO NOTHING`,
        [
          'user-admin-env',
          'Administrador Corporativo',
          adminEmail.trim().toLowerCase(),
          'DEV-001',
          'DEVELOPER',
          'dept-ti',
          'TI / Infraestrutura',
          'Administrador do Sistema',
          hashedPass,
          JSON.stringify(['*']),
          JSON.stringify({
            '*': [
              'VIEW_FOLDER',
              'LIST_FILES',
              'VIEW_DOCUMENT',
              'DOWNLOAD_DOCUMENT',
              'UPLOAD_DOCUMENT',
              'EDIT_DOCUMENT',
              'DELETE_DOCUMENT',
              'CREATE_FOLDER',
              'DELETE_FOLDER',
              'MOVE_DOCUMENT',
              'RENAME_DOCUMENT',
              'SHARE_DOCUMENT',
              'MANAGE_PERMISSIONS',
              'MANAGE_USERS',
              'MANAGE_DEVICES',
              'VIEW_AUDIT',
            ],
          }),
        ]
      );
    }

    // 6. Atribuir papel 'DEVELOPER' para e-mails definidos em DEVELOPER_EMAILS (sem valor padrão)
    const devEmails = (process.env.DEVELOPER_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (devEmails.length > 0) {
      await client.query(
        `UPDATE users SET role = 'DEVELOPER' WHERE LOWER(email) = ANY($1::text[])`,
        [devEmails]
      );
    }
  } catch (err: any) {
    isPostgresHealthy = false;
    lastError = err.message || 'Falha na conexão com PostgreSQL';
    console.error('[DB CRITICAL ERROR] Falha ao inicializar banco de dados:', lastError);
    if (process.env.NODE_ENV === 'production') {
      console.error('[DB] Encerrando processo conforme diretriz de produção.');
      process.exit(1);
    }
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function getDbStatus(): Promise<DbStatus> {
  let connected = isPostgresHealthy;
  let tablesCount = 0;
  let recordsCount = 0;
  let latencyMs = lastLatency;
  let databaseName = 'docsecure_db';
  let host = 'localhost';
  let port = 5432;

  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl.replace('postgresql://', 'http://').replace('postgres://', 'http://'));
      databaseName = parsed.pathname.replace('/', '') || 'docsecure_db';
      host = parsed.hostname || 'localhost';
      port = parsed.port ? parseInt(parsed.port, 10) : 5432;
    } catch {}
  }

  if (isPostgresHealthy) {
    try {
      const start = Date.now();
      const resTables = await pool.query(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
      );
      latencyMs = Date.now() - start;
      lastLatency = latencyMs;
      tablesCount = parseInt(resTables.rows[0]?.count || '0', 10);

      const resRecords = await pool.query(`
        SELECT (
          (SELECT count(*) FROM users) +
          (SELECT count(*) FROM departments) +
          (SELECT count(*) FROM folders) +
          (SELECT count(*) FROM documents) +
          (SELECT count(*) FROM audit_logs)
        ) as total_records
      `);
      recordsCount = parseInt(resRecords.rows[0]?.total_records || '0', 10);
      connected = true;
    } catch (err: any) {
      connected = false;
      lastError = err.message;
    }
  }

  return {
    connected,
    databaseName,
    host,
    port,
    tablesCount,
    recordsCount,
    latencyMs,
    ssl: false,
    mode: connected ? 'POSTGRESQL_REAL' : 'OFFLINE',
    lastChecked: new Date().toISOString(),
    error: lastError,
  };
}
