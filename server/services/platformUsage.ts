import fs from 'fs';
import path from 'path';
import os from 'os';
import { pool } from '../db';
import { FILES_DIR } from './fileStorage';
import { getServerDisk } from './diskInfo';

/**
 * Quanto o DocSecure (só a plataforma, não o servidor inteiro) está consumindo:
 * disco (arquivos criptografados, banco de dados e a própria aplicação), memória RAM e processador.
 */

// ---------------------------------------------------------------- processador (amostra a cada 5 s)
let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
let cpuPercentOfServer = 0; // % do servidor inteiro (todos os núcleos)
let cpuPercentOfCore = 0; // % de um núcleo
const sampler = setInterval(() => {
  const now = process.hrtime.bigint();
  const usage = process.cpuUsage(lastCpu);
  const elapsedMicros = Number(now - lastAt) / 1000;
  lastCpu = process.cpuUsage();
  lastAt = now;
  if (elapsedMicros <= 0) return;
  const busy = usage.user + usage.system;
  cpuPercentOfCore = +((busy / elapsedMicros) * 100).toFixed(1);
  cpuPercentOfServer = +((busy / elapsedMicros / Math.max(1, os.cpus().length)) * 100).toFixed(2);
}, 5000);
sampler.unref?.();

// ---------------------------------------------------------------- tamanho de pastas (com cache)
async function dirSize(dir: string, skip: (p: string) => boolean = () => false): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (skip(full)) continue;
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        try {
          total += (await fs.promises.stat(full)).size;
        } catch {}
      }
    }
  }
  return total;
}

const cache = new Map<string, { at: number; value: number; pending?: Promise<number> }>();
async function cached(key: string, ttlMs: number, compute: () => Promise<number>): Promise<number> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.value; // já calculando: devolve o último valor
  const pending = compute()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .catch(() => hit?.value ?? 0);
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value ?? 0, pending });
  return hit ? hit.value : pending;
}

const APP_DIR = process.cwd();
const STORAGE_ROOT = path.dirname(FILES_DIR);

export async function getPlatformUsage() {
  const [filesBytes, appBytes, dbRow, docsRow] = await Promise.all([
    cached('files', 60_000, () => dirSize(STORAGE_ROOT)),
    // Aplicação instalada (código, build e dependências), sem os arquivos dos usuários e sem o histórico do git
    cached('app', 30 * 60_000, () =>
      dirSize(APP_DIR, (p) => p === STORAGE_ROOT || p.startsWith(STORAGE_ROOT + path.sep) || p.endsWith(`${path.sep}.git`))
    ),
    pool.query('SELECT pg_database_size(current_database())::bigint AS bytes').then((r) => r.rows[0]).catch(() => null),
    pool
      .query(
        `SELECT COUNT(*) FILTER (WHERE status <> 'trash')::int AS active, COUNT(*) FILTER (WHERE status = 'trash')::int AS trash,
                COALESCE(SUM(size_bytes) FILTER (WHERE status <> 'trash'), 0)::bigint AS active_bytes,
                COALESCE(SUM(size_bytes) FILTER (WHERE status = 'trash'), 0)::bigint AS trash_bytes
           FROM documents`
      )
      .then((r) => r.rows[0])
      .catch(() => null),
  ]);

  const dbBytes = Number(dbRow?.bytes || 0);
  const disk = getServerDisk();
  const mem = process.memoryUsage();
  const totalDisk = filesBytes + dbBytes + appBytes;

  return {
    disk: {
      filesBytes, // arquivos enviados (criptografados) + temporários
      databaseBytes: dbBytes,
      appBytes,
      totalBytes: totalDisk,
      serverTotalBytes: disk?.totalBytes ?? null,
      serverFreeBytes: disk?.freeBytes ?? null,
      // Parte do disco do servidor ocupada pelo DocSecure
      percentOfServer: disk?.totalBytes ? +((totalDisk / disk.totalBytes) * 100).toFixed(2) : null,
    },
    memory: {
      rssBytes: mem.rss, // RAM ocupada pelo processo do DocSecure
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      serverTotalBytes: os.totalmem(),
      serverFreeBytes: os.freemem(),
      percentOfServer: +((mem.rss / os.totalmem()) * 100).toFixed(2),
    },
    cpu: {
      percentOfServer: cpuPercentOfServer,
      percentOfCore: cpuPercentOfCore,
      cores: os.cpus().length,
      serverLoadPercent: Math.min(100, Math.round(((os.loadavg()[0] || 0) / Math.max(1, os.cpus().length)) * 100)),
    },
    documents: {
      active: Number(docsRow?.active || 0),
      trash: Number(docsRow?.trash || 0),
      activeBytes: Number(docsRow?.active_bytes || 0),
      trashBytes: Number(docsRow?.trash_bytes || 0),
    },
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
    },
  };
}
