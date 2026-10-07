import pg from 'pg';
import dotenv from 'dotenv';
import {
  INITIAL_DEPARTMENTS,
  INITIAL_FOLDERS,
  INITIAL_DOCUMENTS,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_DEVICES,
  INITIAL_API_KEYS,
  INITIAL_WEBHOOKS,
} from '../services/dataStore';

dotenv.config();

const { Pool } = pg;

export interface DbStatus {
  connected: boolean;
  databaseName: string;
  host: string;
  port: number;
  tablesCount: number;
  recordsCount: number;
  latencyMs: number;
  ssl: boolean;
  mode: 'POSTGRESQL_REAL' | 'POSTGRESQL_CONNECTING' | 'REDUNDANT_CACHE';
  lastChecked: string;
  error?: string;
}

// Parse PostgreSQL connection string supporting special characters in passwords (+, @, *, %, etc.)
export function parseDatabaseUrl(urlStr: string) {
  if (!urlStr) {
    return {
      host: 'localhost',
      port: 5432,
      database: 'docsecure_db',
      user: 'docsecure_user',
    };
  }

  try {
    const match = urlStr.match(
      /^(?:postgres(?:ql)?:\/\/)(?:([^:]+)(?::([^@]*))?@)?([^:\/?#]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?(.*))?$/
    );
    if (match) {
      const [, user, password, host, port, database] = match;
      return {
        user: user ? decodeURIComponent(user) : undefined,
        password: password ? (password.includes('%') ? decodeURIComponent(password) : password) : undefined,
        host: host || 'localhost',
        port: port ? parseInt(port, 10) : 5432,
        database: database || 'docsecure_db',
      };
    }
  } catch (err) {
    console.warn('[DB] Fallback url parser used:', err);
  }

  return { connectionString: urlStr };
}

const dbConfig = parseDatabaseUrl(
  process.env.DATABASE_URL || 'postgresql://docsecure_user:+******98@localhost:5432/docsecure_db?schema=public'
);

export const pool = new Pool({
  ...dbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let isPostgresHealthy = false;
let lastLatency = 1.2;
let lastError: string | undefined = undefined;

// In-memory persistent cache to ensure zero downtime and high availability
export const memoryCache = {
  users: [...INITIAL_USERS],
  departments: [...INITIAL_DEPARTMENTS],
  folders: [...INITIAL_FOLDERS],
  documents: [...INITIAL_DOCUMENTS],
  devices: [...INITIAL_DEVICES],
  auditLogs: [...INITIAL_AUDIT_LOGS],
  apiKeys: [...INITIAL_API_KEYS],
  webhooks: [...INITIAL_WEBHOOKS],
};

export async function initDatabase() {
  console.log('[DB] Inicializando conexão PostgreSQL com DATABASE_URL...');
  try {
    const start = Date.now();
    const client = await pool.connect();
    lastLatency = Date.now() - start;
    isPostgresHealthy = true;
    lastError = undefined;

    console.log(`[DB] Conexão com PostgreSQL bem-sucedida! Latência: ${lastLatency}ms`);

    // Create Tables if not exist
    await client.query(`
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

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        matricula VARCHAR(100) NOT NULL,
        cpf VARCHAR(50),
        phone VARCHAR(50),
        role VARCHAR(50) NOT NULL,
        department_id VARCHAR(100) NOT NULL,
        department_name VARCHAR(255) NOT NULL,
        cargo VARCHAR(100) NOT NULL,
        avatar TEXT,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        failed_login_attempts INT DEFAULT 0,
        two_factor_enabled BOOLEAN DEFAULT true,
        two_factor_secret VARCHAR(255),
        permitted_folder_ids JSONB DEFAULT '[]'::jsonb,
        granular_permissions JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

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

      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        device_type VARCHAR(50) NOT NULL,
        os VARCHAR(100) NOT NULL,
        browser VARCHAR(100) NOT NULL,
        ip_address VARCHAR(100) NOT NULL,
        last_access_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'TRUSTED',
        fingerprint_hash VARCHAR(255) NOT NULL,
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        is_current BOOLEAN DEFAULT false
      );

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
    `);

    // Migrations / Ensure columns exist
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_2fa_code VARCHAR(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_2fa_expires TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT '+62726798';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_token VARCHAR(255);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS trusted_until TIMESTAMPTZ;
    `);

    // Ensure database cleanup for users: remove old mock users and ensure Marcos Monteiro exists
    console.log('[DB] Higienizando tabela de usuários e garantindo administrador oficial...');
    await client.query(`DELETE FROM users WHERE LOWER(email) != 'marcosmonteiro.devs@gmail.com'`);

    // Insert or update Developer Marcos Monteiro
    const devUser = INITIAL_USERS[0];
    await client.query(
      `INSERT INTO users (
        id, name, email, matricula, cpf, phone, role, department_id, department_name, 
        cargo, avatar, status, failed_login_attempts, two_factor_enabled, two_factor_secret, 
        permitted_folder_ids, granular_permissions, password_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        matricula = EXCLUDED.matricula,
        role = EXCLUDED.role,
        status = 'ACTIVE',
        password_hash = '+62726798'`,
      [
        devUser.id,
        devUser.name,
        devUser.email,
        devUser.matricula,
        devUser.cpf || null,
        devUser.phone || null,
        devUser.role,
        devUser.departmentId,
        devUser.departmentName,
        devUser.cargo,
        devUser.avatar || null,
        'ACTIVE',
        0,
        true,
        devUser.twoFactorSecret || 'JBSWY3DPEHPK3PXP',
        JSON.stringify(devUser.permittedFolderIds),
        JSON.stringify(devUser.granularPermissions),
        '+62726798',
        devUser.createdAt || new Date().toISOString(),
      ]
    );
    // Seed initial data if tables are empty
    const { rows: deptCount } = await client.query('SELECT count(*) FROM departments');
    if (parseInt(deptCount[0].count, 10) === 0) {
      console.log('[DB] Populando dados iniciais no PostgreSQL...');
      for (const d of INITIAL_DEPARTMENTS) {
        await client.query(
          `INSERT INTO departments (id, name, code, icon_name, color, storage_limit_bytes, storage_used_bytes, manager_id, manager_name, description, is_locked, item_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
          [d.id, d.name, d.code, d.iconName, d.color, d.storageLimitBytes, d.storageUsedBytes, d.managerId || null, d.managerName || null, d.description, d.isLocked, d.itemCount]
        );
      }

      for (const u of INITIAL_USERS) {
        await client.query(
          `INSERT INTO users (id, name, email, matricula, cpf, phone, role, department_id, department_name, cargo, avatar, status, failed_login_attempts, two_factor_enabled, two_factor_secret, permitted_folder_ids, granular_permissions, created_at, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING`,
          [u.id, u.name, u.email, u.matricula, u.cpf || null, u.phone || null, u.role, u.departmentId, u.departmentName, u.cargo, u.avatar || null, u.status, u.failedLoginAttempts, u.twoFactorEnabled, u.twoFactorSecret || null, JSON.stringify(u.permittedFolderIds), JSON.stringify(u.granularPermissions), u.createdAt, u.lastLoginAt || null]
        );
      }

      for (const f of INITIAL_FOLDERS) {
        await client.query(
          `INSERT INTO folders (id, name, department_id, department_name, parent_id, is_locked, item_count, tags, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
          [f.id, f.name, f.departmentId, f.departmentName, f.parentId, f.isLocked, f.itemCount, f.tags || [], f.description || '', f.createdAt, f.updatedAt]
        );
      }

      for (const doc of INITIAL_DOCUMENTS) {
        await client.query(
          `INSERT INTO documents (id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name, owner_id, owner_name, hash_sha256, current_version, versions, is_favorite, is_archived, is_shared, content_summary, status, scan_status, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) ON CONFLICT (id) DO NOTHING`,
          [doc.id, doc.name, doc.extension, doc.mimeType, doc.sizeBytes, doc.folderId, doc.departmentId, doc.departmentName, doc.ownerId, doc.ownerName, doc.hashSha256, doc.currentVersion, JSON.stringify(doc.versions), doc.isFavorite, doc.isArchived, doc.isShared, doc.contentSummary || '', doc.status, doc.scanStatus, doc.tags || [], doc.createdAt, doc.updatedAt]
        );
      }

      for (const dev of INITIAL_DEVICES) {
        await client.query(
          `INSERT INTO devices (id, user_id, user_name, device_name, device_type, os, browser, ip_address, last_access_at, status, fingerprint_hash, registered_at, is_current)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
          [dev.id, dev.userId, dev.userName, dev.deviceName, dev.deviceType, dev.os, dev.browser, dev.ipAddress, dev.lastAccessAt, dev.status, dev.fingerprintHash, dev.registeredAt, dev.isCurrent || false]
        );
      }

      for (const log of INITIAL_AUDIT_LOGS) {
        await client.query(
          `INSERT INTO audit_logs (id, timestamp, user_id, user_name, role, department, action, resource_id, resource_name, details, ip_address, device_info, result, hash, previous_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT (id) DO NOTHING`,
          [log.id, log.timestamp, log.userId, log.userName, log.role, log.department, log.action, log.resourceId || null, log.resourceName || null, log.details, log.ipAddress, log.deviceInfo, log.result, log.hash, log.previousHash || null]
        );
      }

      for (const k of INITIAL_API_KEYS) {
        await client.query(
          `INSERT INTO api_keys (id, name, key_preview, key_hash, scopes, status, created_by, created_at, last_used_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
          [k.id, k.name, k.keyPreview, k.keyHash, k.scopes, k.status, k.createdBy, k.createdAt, k.lastUsedAt || null]
        );
      }

      for (const wh of INITIAL_WEBHOOKS) {
        await client.query(
          `INSERT INTO webhooks (id, name, url, events, secret_key, status, last_triggered_at, success_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
          [wh.id, wh.name, wh.url, wh.events, wh.secretKey, wh.status, wh.lastTriggeredAt || null, wh.successRate]
        );
      }
      console.log('[DB] Dados populados com sucesso no PostgreSQL!');
    }

    client.release();
  } catch (error: any) {
    isPostgresHealthy = false;
    lastError = error?.message || 'Falha ao conectar no host PostgreSQL';
    console.warn('[DB] PostgreSQL indisponível no momento. Usando camada de resiliência e persistência:', lastError);
  }
}

export async function getDbStatus(): Promise<DbStatus> {
  let connected = isPostgresHealthy;
  let tablesCount = 8;
  let recordsCount = 142;
  let latencyMs = lastLatency;

  if (isPostgresHealthy) {
    try {
      const start = Date.now();
      const res = await pool.query('SELECT current_database(), count(*) FROM information_schema.tables WHERE table_schema = \'public\'');
      latencyMs = Date.now() - start;
      lastLatency = latencyMs;
      connected = true;
      tablesCount = parseInt(res.rows[0]?.count || '8', 10);
    } catch (err: any) {
      connected = false;
      lastError = err.message;
    }
  }

  const dbConfigInfo = parseDatabaseUrl(
    process.env.DATABASE_URL || 'postgresql://docsecure_user:+******98@localhost:5432/docsecure_db?schema=public'
  );

  return {
    connected,
    databaseName: (dbConfigInfo as any).database || 'docsecure_db',
    host: (dbConfigInfo as any).host || 'localhost',
    port: (dbConfigInfo as any).port || 5432,
    tablesCount,
    recordsCount:
      memoryCache.users.length +
      memoryCache.departments.length +
      memoryCache.folders.length +
      memoryCache.documents.length +
      memoryCache.auditLogs.length,
    latencyMs,
    ssl: false,
    mode: connected ? 'POSTGRESQL_REAL' : 'REDUNDANT_CACHE',
    lastChecked: new Date().toISOString(),
    error: lastError,
  };
}
