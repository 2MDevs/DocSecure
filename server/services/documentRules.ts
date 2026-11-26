/**
 * Regras de arquivos compartilhadas entre o site (rotas /api/documents) e a pasta no Windows (WebDAV):
 * extensões bloqueadas, assinatura do conteúdo, tipos de conteúdo, nomes e conflitos de nome.
 */
import { pool } from '../db';

// Extensões que nunca são aceitas (executáveis, scripts e páginas que poderiam rodar código no navegador)
export const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jse',
  'wsf', 'wsh', 'jar', 'sh', 'bash', 'dll', 'sys', 'cpl', 'hta', 'lnk', 'reg', 'html', 'htm', 'xhtml',
  'svg', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'app', 'dmg', 'apk', 'deb', 'rpm',
]);

// Assinatura (magic bytes) esperada para tipos comuns: impede renomear um arquivo para enganar o sistema
export const MAGIC_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  zip: (b) => b[0] === 0x50 && b[1] === 0x4b,
  docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  xlsx: (b) => b[0] === 0x50 && b[1] === 0x4b,
  pptx: (b) => b[0] === 0x50 && b[1] === 0x4b,
};

// Content-Type devolvido por extensão (nunca HTML/SVG)
export const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

export function getExtension(fileName: string): string {
  const m = fileName.match(/\.([a-zA-Z0-9]{1,10})$/);
  return m ? m[1].toLowerCase() : '';
}

export function sanitizeFileName(name: string): string {
  return String(name)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
}


// ---------------------------------------------------------------------------
// ARQUIVOS COM O MESMO NOME na mesma pasta: perguntar se substitui ou mantém os dois ("nome (1).pdf")
// ---------------------------------------------------------------------------
export async function findSameName(departmentId: string, folderId: string | null, name: string) {
  const { rows } = await pool.query(
    `SELECT * FROM documents WHERE department_id = $1 AND COALESCE(folder_id, '') = COALESCE($2, '')
       AND LOWER(name) = LOWER($3) AND status <> 'trash' ORDER BY created_at DESC LIMIT 1`,
    [departmentId, folderId, name]
  );
  return rows[0] || null;
}

/** "Relatório.pdf" → "Relatório (1).pdf", "(2)"... o primeiro número livre na pasta */
export async function nextFreeName(departmentId: string, folderId: string | null, name: string): Promise<string> {
  const m = name.match(/^(.*?)(\.[a-zA-Z0-9]{1,10})?$/);
  const base = (m?.[1] || name).replace(/ \(\d+\)$/, '');
  const ext = m?.[2] || '';
  const { rows } = await pool.query(
    `SELECT LOWER(name) AS n FROM documents WHERE department_id = $1 AND COALESCE(folder_id, '') = COALESCE($2, '') AND status <> 'trash'`,
    [departmentId, folderId]
  );
  const taken = new Set(rows.map((r: any) => r.n));
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}


/** Nome de pasta: sem caracteres proibidos no Windows, espaços normalizados, até 120 caracteres. */
export function cleanFolderName(name: unknown): string {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
