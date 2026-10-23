/**
 * Visualização completa de Office (Caminho 2): LibreOffice converte Word, Excel e PowerPoint
 * (inclusive .doc, .xls e .ppt antigos) em PDF na hora de abrir.
 *
 * - O desenvolvedor liga/desliga na tela Sistema. Ligar instala o LibreOffice na VPS (~500 MB de disco);
 *   desligar remove e libera o espaço. Quem instala/remove é o scripts/office-engine.sh, como root,
 *   pelo mesmo serviço do botão "Atualizar sistema".
 * - O LibreOffice não fica rodando: só abre para converter um arquivo (alguns segundos) e fecha.
 *   Uma conversão por vez, com tempo máximo, como o usuário do sistema (nunca como root).
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { UPLOAD_TMP_DIR, ensureStorageDirs } from './fileStorage';

const APP_DIR = process.cwd();
const STATE_DIR = path.join(APP_DIR, '.office');
const STATUS_FILE = path.join(STATE_DIR, 'status.json');
const LOG_FILE = path.join(STATE_DIR, 'office.log');
const UPDATE_DIR = process.env.UPDATE_STATE_DIR || path.join(APP_DIR, '.update');

/** Formatos que a visualização completa converte para PDF */
export const FULL_OFFICE_EXT = new Set(['doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pps', 'ppsx', 'odp']);
const MAX_INPUT_BYTES = 150 * 1024 * 1024;
/** Planilhas: convertidas com uma página por aba (sem quebrar colunas em folhas A4) */
export const SHEET_EXT = new Set(['xls', 'xlsx', 'xlsm', 'ods']);
const TIMEOUT_MS = 120_000;

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

let binCache: { at: number; value: string | null } | null = null;
export function findSoffice(): string | null {
  if (binCache && Date.now() - binCache.at < 30_000) return binCache.value;
  const candidates = ['/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice'];
  let found: string | null = null;
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      found = c;
      break;
    } catch {}
  }
  binCache = { at: Date.now(), value: found };
  return found;
}

export type OfficeEngineStatus = {
  mode: 'full' | 'basic';
  installed: boolean;
  state: 'installing' | 'removing' | 'installed' | 'not_installed' | 'failed' | null;
  action: string | null;
  message: string;
  version: string;
  diskBytes: number;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  running: boolean;
  pending: boolean;
  /** O serviço que instala/remove existe nesta VPS (instalado junto com o "Atualizar sistema") */
  canManage: boolean;
  installedByDocSecure: boolean;
  log: string;
};

export function getOfficeEngineStatus(withLog = false): OfficeEngineStatus {
  const s = readJson(STATUS_FILE) || {};
  binCache = null;
  const bin = findSoffice();
  const started = s.startedAt ? new Date(s.startedAt).getTime() : 0;
  // "instalando/removendo" que passou de 40 minutos foi interrompido
  const running = (s.state === 'installing' || s.state === 'removing') && Date.now() - started < 40 * 60_000;
  const pending = (() => {
    try {
      return fs.readFileSync(path.join(UPDATE_DIR, 'request'), 'utf8').includes('"action":"office-');
    } catch {
      return false;
    }
  })();
  let log = '';
  if (withLog) {
    try {
      log = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-40).join('\n');
    } catch {}
  }
  return {
    mode: bin && !running ? 'full' : 'basic',
    installed: Boolean(bin),
    state: s.state || null,
    action: s.action || null,
    message: s.message || '',
    version: s.version || '',
    diskBytes: Number(s.diskBytes) || 0,
    requestedBy: s.requestedBy || '',
    startedAt: s.startedAt || null,
    finishedAt: s.finishedAt || null,
    running,
    pending,
    canManage: fs.existsSync(path.join(UPDATE_DIR, 'installed')),
    installedByDocSecure: fs.existsSync(path.join(STATE_DIR, 'packages.txt')),
    log,
  };
}

export function officeMode(): 'full' | 'basic' {
  return getOfficeEngineStatus().mode;
}

/** Pede ao serviço da VPS para instalar ou remover (o mesmo do "Atualizar sistema") */
export function requestOfficeAction(action: 'install' | 'uninstall', requestedBy: string) {
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(UPDATE_DIR, 'request'),
    JSON.stringify({ action: `office-${action}`, requestedBy, requestedAt: new Date().toISOString() }),
    { mode: 0o664 }
  );
  // Mostra "instalando/removendo" na tela até o script assumir
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const prev = readJson(STATUS_FILE) || {};
  fs.writeFileSync(
    STATUS_FILE,
    JSON.stringify({
      ...prev,
      state: action === 'install' ? 'installing' : 'removing',
      action,
      message: action === 'install' ? 'Aguardando o servidor iniciar a instalação...' : 'Aguardando o servidor iniciar a remoção...',
      requestedBy,
      startedAt: new Date().toISOString(),
      finishedAt: '',
    })
  );
}

// ---------------------------------------------------------------- conversão para PDF
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export class OfficeConvertError extends Error {}

/** Converte um arquivo do Office em PDF (destPath). Uma conversão por vez. */
export function convertToPdf(srcPath: string, ext: string, destPath: string): Promise<void> {
  return serial(async () => {
    const bin = findSoffice();
    if (!bin) throw new OfficeConvertError('A visualização completa não está instalada no servidor.');
    if (fs.statSync(srcPath).size > MAX_INPUT_BYTES) throw new OfficeConvertError('Arquivo grande demais para converter. Baixe o arquivo.');
    ensureStorageDirs();
    const work = fs.mkdtempSync(path.join(UPLOAD_TMP_DIR, 'lo-'));
    try {
      const input = path.join(work, `documento.${ext.replace(/[^a-z0-9]/gi, '')}`);
      fs.copyFileSync(srcPath, input);
      const run = (target: string) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            bin,
            [
              '--headless',
              '--norestore',
              '--nolockcheck',
              '--nodefault',
              '--nofirststartwizard',
              `-env:UserInstallation=file://${work}/perfil`,
              '--convert-to',
              target,
              '--outdir',
              work,
              input,
            ],
            { env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: work, LANG: 'pt_BR.UTF-8' }, stdio: 'ignore', detached: true }
          );
          const timer = setTimeout(() => {
            try {
              process.kill(-child.pid!, 'SIGKILL');
            } catch {}
            reject(new OfficeConvertError('A conversão demorou demais. Baixe o arquivo para abrir no computador.'));
          }, TIMEOUT_MS);
          child.on('error', (err) => {
            clearTimeout(timer);
            reject(new OfficeConvertError(`Não foi possível iniciar o LibreOffice: ${err.message}`));
          });
          child.on('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      const produced = () => {
        const f = path.join(work, 'documento.pdf');
        return fs.existsSync(f) && fs.statSync(f).size > 0;
      };
      if (SHEET_EXT.has(ext.toLowerCase())) {
        // Planilha: cada aba numa página só, do tamanho da planilha (todas as colunas, sem cortar no A4).
        // Versões antigas do LibreOffice (antes da 7.4) não aceitam a opção: aí converte do jeito normal.
        await run('pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}');
        if (!produced()) await run('pdf');
      } else {
        await run('pdf');
      }
      const out = path.join(work, 'documento.pdf');
      if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
        throw new OfficeConvertError('O LibreOffice não conseguiu converter este arquivo (pode estar danificado ou protegido por senha).');
      }
      fs.renameSync(out, destPath);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
}
