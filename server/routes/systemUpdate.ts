import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

/**
 * Atualização do sistema pelo painel (exclusivo Desenvolvedor).
 *
 * O processo web NUNCA executa o deploy diretamente: ele apenas grava um arquivo
 * de solicitação em `.update/request`. Um serviço systemd separado na VPS
 * (`docsecure-update.path` → `docsecure-update.service`, instalado por
 * `scripts/install-auto-update.sh`) detecta o arquivo e roda `scripts/update.sh`,
 * que baixa o código do GitHub, instala dependências, gera o build, reinicia a
 * aplicação e desfaz tudo automaticamente se algo falhar.
 */

const execFileAsync = promisify(execFile);
export const systemUpdateRouter = Router();

// ---------------------------------------------------------------------------
// Aviso de atualização para TODOS os usuários (sininho de notificações).
// Registrado antes da trava "somente desenvolvedor" abaixo.
// ---------------------------------------------------------------------------
type ChangeGroup = { title: string; items: string[]; date: string; sha?: string };
let noticeCache: { at: number; key: string; value: ChangeGroup[] } | null = null;

/** Remove linhas técnicas (assinaturas, links) e devolve texto amigável. */
function cleanLines(text: string): string[] {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(co-authored-by|claude-session|signed-off-by)\b/i.test(l) &&
        !/generated with/i.test(l) &&
        !/^https?:\/\//i.test(l) &&
        !/^#{1,6}\s*$/.test(l)
    );
}

function toItems(lines: string[]): string[] {
  return lines
    .filter((l) => /^[-*•]\s+/.test(l) || /^\d+[.)]\s+/.test(l))
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/`/g, ''))
    .filter(Boolean)
    .slice(0, 12);
}

async function githubRepo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const remote = await git(['remote', 'get-url', 'origin']);
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
    return m ? { owner: m[1], repo: m[2] } : null;
  } catch {
    return null;
  }
}

async function gh(pathname: string): Promise<any | null> {
  try {
    const resp = await fetch(`https://api.github.com${pathname}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DocSecure-Updater' },
    });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

/** O que muda entre a versão instalada e a do GitHub, agrupado por melhoria (PR ou commit). */
async function getPendingChanges(fromSha: string, toSha: string): Promise<ChangeGroup[]> {
  const key = `${fromSha}..${toSha}`;
  if (noticeCache && noticeCache.key === key && Date.now() - noticeCache.at < 10 * 60_000) return noticeCache.value;
  const repo = await githubRepo();
  if (!repo) return [];
  const cmp = await gh(`/repos/${repo.owner}/${repo.repo}/compare/${fromSha}...${toSha}`);
  const commits: any[] = Array.isArray(cmp?.commits) ? cmp.commits : [];
  const merged = new Set<string>();
  const groups: ChangeGroup[] = [];

  // Do mais novo para o mais antigo
  for (const c of [...commits].reverse()) {
    const message = String(c.commit?.message || '');
    const date = c.commit?.committer?.date || c.commit?.author?.date || '';
    const pr = message.match(/^Merge pull request #(\d+)/i);
    if (pr) {
      // Melhoria entregue por Pull Request: usa o título e a descrição do PR
      (c.parents || []).slice(1).forEach((p: any) => merged.add(p.sha));
      const data = await gh(`/repos/${repo.owner}/${repo.repo}/pulls/${pr[1]}`);
      const lines = cleanLines(data?.body || '');
      groups.push({
        title: String(data?.title || cleanLines(message)[1] || `Melhoria #${pr[1]}`),
        items: toItems(lines),
        date,
      });
      continue;
    }
    if ((c.parents || []).length > 1) continue; // outros merges sem informação útil
    groups.push({ sha: c.sha, title: cleanLines(message)[0] || 'Ajustes gerais', items: toItems(cleanLines(message).slice(1)), date });
  }

  // Commits que já fazem parte de um PR não aparecem de novo
  const value = groups
    .filter((g) => !g.sha || !merged.has(g.sha))
    .map(({ title, items, date }) => ({ title, items, date }))
    .slice(0, 15);
  noticeCache = { at: Date.now(), key, value };
  return value;
}

// GET /api/system-update/notice — qualquer usuário logado: há atualização? o que ela traz?
systemUpdateRouter.get('/notice', requireAuth, async (_req: Request, res: Response) => {
  try {
    const [current, latest] = await Promise.all([getCurrentCommit(), getLatestCommit()]);
    const updateAvailable = Boolean(current && latest && current.commit !== latest.commit);
    if (!updateAvailable || !current || !latest) {
      return res.json({ updateAvailable: false, running: isUpdateRunning() });
    }
    const changes = await getPendingChanges(current.commit, latest.commit);
    return res.json({
      updateAvailable: true,
      running: isUpdateRunning(),
      version: latest.short,
      commit: latest.commit,
      date: latest.date,
      changes: changes.length ? changes : [{ title: latest.message || 'Melhorias e correções', items: [], date: latest.date }],
    });
  } catch (err) {
    console.error('[SYSTEM UPDATE NOTICE ERROR]', err);
    return res.json({ updateAvailable: false });
  }
});

systemUpdateRouter.use(requireAuth, requireRole('developer'));

const APP_DIR = process.cwd();
const STATE_DIR = process.env.UPDATE_STATE_DIR || path.join(APP_DIR, '.update');
const REQUEST_FILE = path.join(STATE_DIR, 'request');
const STATUS_FILE = path.join(STATE_DIR, 'status.json');
const LOG_FILE = path.join(STATE_DIR, 'update.log');
const INSTALLED_FILE = path.join(STATE_DIR, 'installed');

type CommitInfo = { commit: string; short: string; message: string; date: string } | null;

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readLogTail(lines = 60): string {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    return content.split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-c', `safe.directory=${APP_DIR}`, ...args], {
    cwd: APP_DIR,
    timeout: 10_000,
  });
  return stdout.trim();
}

async function getCurrentCommit(): Promise<CommitInfo> {
  try {
    const out = await git(['log', '-1', '--format=%H%x1f%h%x1f%s%x1f%cI']);
    const [commit, short, message, date] = out.split('\x1f');
    return { commit, short, message, date };
  } catch {
    return null;
  }
}

function getConfiguredBranch(): string {
  const conf = readJson(INSTALLED_FILE);
  return conf?.branch || 'main';
}

let latestCache: { at: number; value: CommitInfo } | null = null;

/** Último commit publicado no GitHub (cache de 60s para respeitar o limite da API). */
async function getLatestCommit(): Promise<CommitInfo> {
  if (latestCache && Date.now() - latestCache.at < 60_000) return latestCache.value;
  let value: CommitInfo = null;
  try {
    const remote = await git(['remote', 'get-url', 'origin']);
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
    if (match) {
      const [, owner, repo] = match;
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(getConfiguredBranch())}`,
        { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DocSecure-Updater' } }
      );
      if (resp.ok) {
        const data: any = await resp.json();
        value = {
          commit: data.sha,
          short: String(data.sha).slice(0, 7),
          message: String(data.commit?.message || '').split('\n')[0],
          date: data.commit?.committer?.date || data.commit?.author?.date || '',
        };
      }
    }
  } catch {
    value = null;
  }
  latestCache = { at: Date.now(), value };
  return value;
}

function isUpdateRunning(): boolean {
  if (fs.existsSync(REQUEST_FILE)) return true;
  const status = readJson(STATUS_FILE);
  if (status?.state !== 'running') return false;
  // Proteção contra status "preso" (ex.: VPS reiniciada no meio da atualização)
  const started = Date.parse(status.startedAt || '');
  return Number.isFinite(started) && Date.now() - started < 30 * 60 * 1000;
}

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1'
  );
}

async function writeAudit(user: any, ip: string, action: string, details: string, result: 'SUCCESS' | 'FAILURE') {
  const logId = 'audit-' + crypto.randomBytes(8).toString('hex');
  const logHash = crypto.createHash('sha256').update(logId + user.id + Date.now()).digest('hex');
  try {
    await pool.query(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_name, role, department, action,
        resource_id, resource_name, details, ip_address, device_info, result, hash
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, 'system_update', 'Atualização do Sistema', $7, $8, 'Painel Web', $9, $10)`,
      [logId, user.id, user.name, user.role, user.departmentName || 'Infraestrutura', action, details, ip, result, logHash]
    );
  } catch (e) {
    console.warn('[Audit Log Insert Warning]', e);
  }
}

// GET /api/system-update/status — versão atual, versão no GitHub e andamento
systemUpdateRouter.get('/status', async (_req: Request, res: Response) => {
  const installed = fs.existsSync(INSTALLED_FILE);
  const [current, latest] = await Promise.all([getCurrentCommit(), getLatestCommit()]);
  const status = readJson(STATUS_FILE);

  return res.json({
    installed,
    branch: getConfiguredBranch(),
    current,
    latest,
    updateAvailable: Boolean(current && latest && current.commit !== latest.commit),
    running: isUpdateRunning(),
    status,
    log: readLogTail(),
  });
});

// POST /api/system-update — solicita a atualização (exige confirmação de senha)
systemUpdateRouter.post('/', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const ip = getClientIp(req);

  try {
    const password = String(req.body?.password || '');
    if (!password) {
      return res.status(400).json({ error: 'Confirme a sua senha para atualizar o sistema.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    const isValid = rows[0]?.password_hash ? await bcrypt.compare(password, rows[0].password_hash) : false;
    if (!isValid) {
      await writeAudit(user, ip, 'SYSTEM_UPDATE_DENIED', 'Senha incorreta ao solicitar atualização.', 'FAILURE');
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    if (!fs.existsSync(INSTALLED_FILE)) {
      return res.status(409).json({
        error:
          'A atualização automática ainda não foi instalada nesta VPS. Rode uma vez: sudo bash scripts/install-auto-update.sh',
      });
    }

    if (isUpdateRunning()) {
      return res.status(409).json({ error: 'Já existe uma atualização em andamento.' });
    }

    const current = await getCurrentCommit();
    fs.writeFileSync(
      REQUEST_FILE,
      JSON.stringify({ requestedBy: user.email, requestedAt: new Date().toISOString(), fromCommit: current?.commit }),
      { mode: 0o664 }
    );

    await writeAudit(
      user,
      ip,
      'SYSTEM_UPDATE_REQUESTED',
      `Atualização solicitada a partir da versão ${current?.short || 'desconhecida'}.`,
      'SUCCESS'
    );

    return res.status(202).json({ success: true, message: 'Atualização iniciada.' });
  } catch (err: any) {
    console.error('[SYSTEM UPDATE ERROR]', err);
    return res.status(500).json({ error: 'Não foi possível iniciar a atualização.' });
  }
});
