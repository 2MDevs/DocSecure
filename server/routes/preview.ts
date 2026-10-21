/**
 * Pré-visualização de compactados (.zip/.rar), planilhas (.xlsx/.xlsm) e documentos do Word (.docx).
 *
 *   GET /api/preview/:id/archive                     → itens do compactado
 *   GET /api/preview/:id/archive/file?path=…         → um item (visualizar; &download=1 para baixar)
 *   GET /api/preview/:id/sheet[?inner=…]             → planilha como tabela (o arquivo ou um item do compactado)
 *   GET /api/preview/:id/docx[?inner=…]              → documento do Word como blocos de texto
 *   GET /api/preview/:id/docx/image?part=…[&inner=…] → imagem usada no documento
 *   GET /api/preview/:id/pdf[?inner=…]               → Word/Excel/PowerPoint convertido em PDF (visualização completa)
 *
 * As mesmas regras do visualizador valem aqui: quem não pode ver o arquivo não vê o conteúdo;
 * baixar um item de dentro do compactado exige permissão de download do arquivo.
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';
import {
  canAccess as can,
  isDepartmentManager,
  docPolicyDecision,
  writeAudit,
  getClientIp,
} from '../services/documentAccess';
import { isFileStorageReady, StorageKeyError } from '../services/fileStorage';
import { listArchive, archiveItemFile, archiveFormat, decryptedCopy, officePdf } from '../services/previewCache';
import { FULL_OFFICE_EXT, officeMode, OfficeConvertError } from '../services/officeEngine';
import { previewXlsx, previewDocx, docxImage } from '../services/officePreview';

export const previewRouter = Router();

const SHEET_EXT = new Set(['xlsx', 'xlsm']);
const DOCX_EXT = new Set(['docx', 'docm']);
const INLINE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  json: 'text/plain; charset=utf-8',
  xml: 'text/plain; charset=utf-8',
};

const extOf = (name: string) => (name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] || '').toLowerCase();
const userCtx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};
function disposition(kind: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

class PreviewError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Carrega o documento e confere se a pessoa pode ver (ou baixar) */
async function loadAllowed(req: Request, download = false) {
  const user = (req as any).user;
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  const doc = rows[0];
  if (!doc || doc.status === 'trash') throw new PreviewError(404, 'Documento não encontrado.');
  if (!doc.storage_path) throw new PreviewError(410, 'Este registro não possui o arquivo armazenado.');
  if (!isFileStorageReady()) throw new PreviewError(503, 'Armazenamento seguro indisponível no servidor.');

  const viewOk = docPolicyDecision(user, doc, 'view') !== false;
  const allowed = async (action: 'view' | 'download') => {
    const policy = docPolicyDecision(user, doc, action);
    const perm = action === 'download' ? 'DOWNLOAD_DOCUMENT' : 'VIEW_DOCUMENT';
    return (
      viewOk &&
      (policy === null
        ? await can(user, perm, doc.department_id, doc.folder_id)
        : policy &&
          ((await can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id)) || doc.owner_id === user.id || isDepartmentManager(user, doc.department_id)))
    );
  };
  if (!(await allowed('view'))) throw new PreviewError(403, 'Você não tem permissão para visualizar este documento.');
  if (download && !(await allowed('download'))) {
    throw new PreviewError(
      403,
      doc.download_policy === 'none' ? 'O download deste arquivo está bloqueado: ele pode apenas ser visualizado.' : 'Você não tem permissão para baixar este documento.'
    );
  }
  return doc;
}

function fail(res: Response, err: any, label: string) {
  if (err instanceof PreviewError) return res.status(err.status).json({ error: err.message });
  if (err instanceof StorageKeyError) return res.status(503).json({ error: err.message });
  if (err?.code === 'ENOENT') return res.status(410).json({ error: 'O arquivo não foi encontrado no armazenamento do servidor.' });
  if (err?.code === 'RAR_UNAVAILABLE') return res.status(501).json({ error: err.message });
  if (err instanceof OfficeConvertError) return res.status(422).json({ error: err.message, code: 'OFFICE_CONVERT' });
  const known = /^(ZIP|RAR)_/.test(String(err?.code || '')) || err?.name === 'Error';
  if (!known) console.error(`[PREVIEW ${label} ERROR]`, err);
  return res.status(422).json({ error: err?.message || 'Não foi possível abrir este arquivo para visualização.' });
}

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};

/** O arquivo a ser lido: o próprio documento ou um item de dentro do compactado (?inner=) */
async function sourceFile(doc: any, inner: unknown): Promise<{ file: string; ext: string; name: string }> {
  if (typeof inner === 'string' && inner) {
    if (!archiveFormat(doc.extension)) throw new PreviewError(400, 'Este arquivo não é compactado.');
    const item = await archiveItemFile(doc, inner);
    return { file: item.file, ext: extOf(item.name), name: item.name };
  }
  return { file: await decryptedCopy(doc), ext: String(doc.extension || '').toLowerCase(), name: doc.name };
}

previewRouter.get('/:id/archive', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await loadAllowed(req);
    if (!archiveFormat(doc.extension)) return res.status(400).json({ error: 'Este arquivo não é .zip nem .rar.' });
    const result = await listArchive(doc);
    await writeAudit(userCtx(req), 'DOCUMENT_VIEWED', doc.id, doc.name, `Conteúdo do arquivo compactado visualizado (${result.items.length} itens).`, 'SUCCESS', getClientIp(req));
    noStore(res);
    return res.json(result);
  } catch (err: any) {
    return fail(res, err, 'ARCHIVE');
  }
});

previewRouter.get('/:id/archive/file', requireAuth, async (req: Request, res: Response) => {
  const download = req.query.download === '1';
  try {
    const innerPath = String(req.query.path || '');
    if (!innerPath) return res.status(400).json({ error: 'Informe o item.' });
    const doc = await loadAllowed(req, download);
    const item = await archiveItemFile(doc, innerPath);
    const ext = extOf(item.name);
    const inline = !download && INLINE_TYPES[ext];
    await writeAudit(
      userCtx(req),
      download ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_VIEWED',
      doc.id,
      doc.name,
      `${download ? 'Download' : 'Visualização'} do item "${innerPath}" de dentro do arquivo compactado.`,
      'SUCCESS',
      getClientIp(req)
    );
    noStore(res);
    res.setHeader('Content-Type', inline ? INLINE_TYPES[ext] : 'application/octet-stream');
    res.setHeader('Content-Disposition', disposition(inline ? 'inline' : 'attachment', item.name));
    res.setHeader('Content-Length', String(item.size));
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    fs.createReadStream(item.file).pipe(res);
  } catch (err: any) {
    return fail(res, err, 'ARCHIVE FILE');
  }
});

previewRouter.get('/:id/sheet', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await loadAllowed(req);
    const src = await sourceFile(doc, req.query.inner);
    if (!SHEET_EXT.has(src.ext)) return res.status(400).json({ error: 'A visualização de planilhas funciona com .xlsx e .xlsm. Para .xls antigo, baixe o arquivo.' });
    const result = await previewXlsx(src.file);
    if (!req.query.inner) await writeAudit(userCtx(req), 'DOCUMENT_VIEWED', doc.id, doc.name, 'Pré-visualização da planilha.', 'SUCCESS', getClientIp(req));
    noStore(res);
    return res.json(result);
  } catch (err: any) {
    return fail(res, err, 'SHEET');
  }
});

previewRouter.get('/:id/docx', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await loadAllowed(req);
    const src = await sourceFile(doc, req.query.inner);
    if (!DOCX_EXT.has(src.ext)) return res.status(400).json({ error: 'A visualização de documentos funciona com .docx. Para .doc antigo, baixe o arquivo.' });
    const result = await previewDocx(src.file);
    if (!req.query.inner) await writeAudit(userCtx(req), 'DOCUMENT_VIEWED', doc.id, doc.name, 'Pré-visualização do documento do Word.', 'SUCCESS', getClientIp(req));
    noStore(res);
    return res.json(result);
  } catch (err: any) {
    return fail(res, err, 'DOCX');
  }
});

previewRouter.get('/:id/docx/image', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await loadAllowed(req);
    const src = await sourceFile(doc, req.query.inner);
    const img = await docxImage(src.file, String(req.query.part || ''));
    if (!img) return res.status(404).json({ error: 'Imagem não encontrada.' });
    noStore(res);
    res.setHeader('Content-Type', INLINE_TYPES[img.ext] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.end(img.data);
  } catch (err: any) {
    return fail(res, err, 'DOCX IMAGE');
  }
});

// Visualização completa: o LibreOffice converte o arquivo do Office em PDF (idêntico ao original)
previewRouter.get('/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = await loadAllowed(req);
    if (officeMode() !== 'full') return res.status(409).json({ error: 'A visualização completa está desligada.', code: 'OFFICE_BASIC' });
    const inner = typeof req.query.inner === 'string' && req.query.inner ? req.query.inner : undefined;
    const ext = extOf(inner || doc.name) || String(doc.extension || '').toLowerCase();
    if (!FULL_OFFICE_EXT.has(ext)) return res.status(400).json({ error: 'Este formato não é do Office.' });
    const pdf = await officePdf(doc, inner);
    if (!inner) await writeAudit(userCtx(req), 'DOCUMENT_VIEWED', doc.id, doc.name, 'Pré-visualização completa (convertido em PDF).', 'SUCCESS', getClientIp(req));
    noStore(res);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition('inline', (inner ? inner.split('/').pop() || inner : doc.name).replace(/\.[^.]+$/, '') + '.pdf'));
    res.setHeader('Content-Length', String(fs.statSync(pdf).size));
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    fs.createReadStream(pdf).pipe(res);
  } catch (err: any) {
    return fail(res, err, 'PDF');
  }
});
