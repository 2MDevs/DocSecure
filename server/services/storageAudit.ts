/**
 * Conferência do armazenamento: compara o que está no disco com o que está no banco.
 *
 * - Documentos ativos e na lixeira: arquivos criptografados que o banco conhece.
 * - Temporários: envios em andamento ou interrompidos (pasta storage/tmp).
 * - Sobras ("órfãos"): arquivos criptografados no disco que nenhum documento usa — por exemplo,
 *   de um envio que caiu no meio da gravação. Ocupam espaço sem aparecer em nenhum setor.
 * - Faltando: documentos no banco cujo arquivo não existe mais no disco.
 */
import fs from 'fs';
import path from 'path';
import { pool } from '../db';
import { FILES_DIR, UPLOAD_TMP_DIR } from './fileStorage';
import { activeUploadTempFiles } from './uploadSessions';
import { activePreviewFiles } from './previewCache';

/** Só mexe em sobras/temporários parados há pelo menos este tempo (nada que esteja sendo gravado agora) */
const SAFE_AGE_MS = 60 * 60 * 1000;

type FileInfo = { full: string; rel: string; size: number; mtimeMs: number };

async function listFiles(root: string): Promise<FileInfo[]> {
  const out: FileInfo[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        try {
          const st = await fs.promises.stat(full);
          out.push({ full, rel: path.relative(root, full), size: st.size, mtimeMs: st.mtimeMs });
        } catch {}
      }
    }
  }
  return out;
}

export type StorageScan = {
  activeBytes: number;
  activeFiles: number;
  trashBytes: number;
  trashFiles: number;
  tempBytes: number;
  tempFiles: number;
  orphanBytes: number;
  orphanFiles: number;
  missingFiles: number;
  /** Quanto dá para liberar agora com "Limpar sobras" */
  cleanableBytes: number;
  cleanableFiles: number;
  /** Por setor: espaço real no disco (ativos e lixeira) */
  byDepartment: Record<string, { activeBytes: number; trashBytes: number }>;
  scannedAt: string;
};

let lastScan: { at: number; value: StorageScan; full: { orphans: FileInfo[]; temps: FileInfo[] } } | null = null;
let running: Promise<typeof lastScan> | null = null;

async function doScan() {
  const { rows } = await pool.query('SELECT id, storage_path, status, department_id FROM documents WHERE storage_path IS NOT NULL');
  const known = new Map<string, { status: string; dept: string }>();
  rows.forEach((r: any) => known.set(path.normalize(String(r.storage_path)), { status: r.status, dept: r.department_id }));

  const [stored, tmp] = await Promise.all([listFiles(FILES_DIR), listFiles(UPLOAD_TMP_DIR)]);
  const now = Date.now();
  const inUse = new Set([...activeUploadTempFiles(), ...activePreviewFiles()].map((p) => path.resolve(p)));

  const scan: StorageScan = {
    activeBytes: 0,
    activeFiles: 0,
    trashBytes: 0,
    trashFiles: 0,
    tempBytes: 0,
    tempFiles: 0,
    orphanBytes: 0,
    orphanFiles: 0,
    missingFiles: 0,
    cleanableBytes: 0,
    cleanableFiles: 0,
    byDepartment: {},
    scannedAt: new Date(now).toISOString(),
  };
  const orphans: FileInfo[] = [];
  const temps: FileInfo[] = [];
  const seen = new Set<string>();

  for (const f of stored) {
    const ref = known.get(path.normalize(f.rel));
    if (ref) {
      seen.add(path.normalize(f.rel));
      const d = (scan.byDepartment[ref.dept] ||= { activeBytes: 0, trashBytes: 0 });
      if (ref.status === 'trash') {
        scan.trashBytes += f.size;
        scan.trashFiles++;
        d.trashBytes += f.size;
      } else {
        scan.activeBytes += f.size;
        scan.activeFiles++;
        d.activeBytes += f.size;
      }
    } else {
      scan.orphanBytes += f.size;
      scan.orphanFiles++;
      if (now - f.mtimeMs > SAFE_AGE_MS) orphans.push(f);
    }
  }
  for (const f of tmp) {
    scan.tempBytes += f.size;
    scan.tempFiles++;
    if (!inUse.has(path.resolve(f.full)) && now - f.mtimeMs > SAFE_AGE_MS) temps.push(f);
  }
  scan.missingFiles = [...known.keys()].filter((k) => !seen.has(k)).length;
  scan.cleanableFiles = orphans.length + temps.length;
  scan.cleanableBytes = [...orphans, ...temps].reduce((s, f) => s + f.size, 0);
  return { at: now, value: scan, full: { orphans, temps } };
}

/** Conferência com cache de 1 minuto (percorrer o disco é caro) */
export async function scanStorage(force = false): Promise<StorageScan | null> {
  if (!force && lastScan && Date.now() - lastScan.at < 60_000) return lastScan.value;
  if (!running) {
    running = doScan()
      .then((r) => (lastScan = r))
      .catch((err) => {
        console.error('[STORAGE SCAN ERROR]', err);
        return lastScan;
      })
      .finally(() => {
        running = null;
      });
  }
  const r = await running;
  return r?.value ?? null;
}

/**
 * Apaga as sobras (arquivos sem documento) e temporários parados há mais de 1 hora.
 * Faz uma conferência nova antes, para não apagar nada que acabou de ser registrado.
 */
export async function cleanStorageLeftovers(): Promise<{ files: number; bytes: number }> {
  await scanStorage(true);
  const targets = lastScan ? [...lastScan.full.orphans, ...lastScan.full.temps] : [];
  let files = 0;
  let bytes = 0;
  for (const f of targets) {
    try {
      fs.unlinkSync(f.full);
      files++;
      bytes += f.size;
    } catch {}
  }
  await scanStorage(true);
  return { files, bytes };
}
