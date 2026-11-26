/**
 * Pasta no Windows (WebDAV) — o protocolo.
 *
 * O Windows conecta o endereço https://<dominio>/dav como uma unidade de rede (recurso nativo do
 * Windows, nada para instalar). Cada pasta aberta, arquivo aberto ou salvo vira uma requisição aqui:
 * PROPFIND (listar), GET (abrir), PUT (salvar), MKCOL (nova pasta), MOVE (renomear/mover),
 * COPY, DELETE (lixeira), LOCK/UNLOCK (arquivo em edição) e PROPPATCH (datas do Windows).
 *
 * Arquivos temporários do Word/Excel/Windows (~$doc.docx, ~WRD0001.tmp, desktop.ini...) não viram
 * documentos: ficam só na memória do servidor por pouco tempo e somem sozinhos. Quando o Office
 * termina de salvar (renomeia o temporário para o nome do documento), o conteúdo vira uma nova
 * versão do documento original.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { UPLOAD_TMP_DIR, ensureStorageDirs, isFileStorageReady } from '../services/fileStorage';
import { getMaxUploadBytes } from '../services/systemSettings';
import { CONTENT_TYPES } from '../services/documentRules';
import { getServerDisk } from '../services/diskInfo';
import {
  DavContext,
  DavError,
  DavNode,
  DavContainer,
  containerOf,
  containerKey,
  hideDoc,
  unhideDoc,
  isDocHidden,
} from './davBackend';
import { authenticateDav, DavAuthError } from './davAuth';

export const DAV_PREFIX = '/dav';

// ---------------------------------------------------------------------------------------------
// Arquivos temporários (do Office e do Windows): ficam fora do banco, por pessoa, por pouco tempo
// ---------------------------------------------------------------------------------------------
type Transient = {
  userId: string;
  container: DavContainer;
  name: string;
  kind: 'file' | 'alias';
  tempPath?: string; // conteúdo (kind=file)
  size: number;
  docId?: string; // documento real "renomeado" para um nome temporário (kind=alias)
  originalName?: string;
  attrs?: string; // atributos do Windows (oculto, sistema...)
  pendingEmpty?: boolean; // arquivo novo ainda vazio (o Windows cria vazio e depois grava o conteúdo)
  createdAt: number;
  modifiedAt: number;
};
const transients = new Map<string, Transient>();
const TRANSIENT_TTL_MS = 60 * 60 * 1000;
const ALIAS_TTL_MS = 10 * 60 * 1000;
const PENDING_EMPTY_TTL_MS = 10 * 60 * 1000;

const tKey = (userId: string, c: DavContainer, name: string) => `${userId}|${containerKey(c)}|${name.toLowerCase()}`;

/** Nomes que o Office e o Windows usam só durante um salvamento ou para controle. */
export function isTransientName(name: string): boolean {
  return (
    /^~\$/.test(name) || // dono do arquivo em edição (Word/Excel/PowerPoint)
    /\.tmp$/i.test(name) || // ~WRD0000.tmp, ~WRL0001.tmp, ppt1A2B.tmp, Planilha.xlsx~RF12.TMP
    /^\.~lock\./i.test(name) || // LibreOffice
    /^~.*#$/.test(name) ||
    /^[0-9A-F]{8}$/.test(name) || // temporário do Excel (sem extensão)
    /^desktop\.ini$/i.test(name) ||
    /^thumbs\.db$/i.test(name) ||
    /^\.ds_store$/i.test(name) ||
    /^\._/.test(name)
  );
}

function defaultAttrs(name: string): string {
  if (/^desktop\.ini$/i.test(name) || /^thumbs\.db$/i.test(name)) return '00000026'; // oculto + sistema + arquivo
  if (/^~\$|^~|^\.~lock|^\._|^\.ds_store$/i.test(name)) return '00000022'; // oculto + arquivo
  return '00000020';
}

function dropTransient(key: string, t: Transient) {
  transients.delete(key);
  if (t.tempPath) fs.rm(t.tempPath, { force: true }, () => {});
  if (t.kind === 'alias' && t.docId) unhideDoc(t.docId);
}

/** Varredura: tira o que passou do prazo; arquivos novos que ficaram vazios viram documentos vazios. */
type Materializer = (t: Transient) => Promise<void>;
let materializeEmpty: Materializer | null = null;
function sweepTransients() {
  const now = Date.now();
  for (const [key, t] of transients) {
    if (t.pendingEmpty && now - t.modifiedAt > PENDING_EMPTY_TTL_MS) {
      transients.delete(key);
      materializeEmpty?.(t).catch((err) => console.error('[DAV] arquivo vazio não pôde ser criado:', err?.message || err));
      continue;
    }
    const ttl = t.kind === 'alias' ? ALIAS_TTL_MS : TRANSIENT_TTL_MS;
    if (now - t.modifiedAt > ttl) dropTransient(key, t);
  }
}
let sweeper: NodeJS.Timeout | null = null;
export function startDavHousekeeping(materializer: Materializer) {
  materializeEmpty = materializer;
  if (!sweeper) {
    sweeper = setInterval(sweepTransients, 60 * 1000);
    sweeper.unref();
  }
  // Sobras de arquivos temporários de antes de reiniciar o servidor
  try {
    for (const f of fs.readdirSync(UPLOAD_TMP_DIR)) {
      if (f.startsWith('dav-')) fs.rm(path.join(UPLOAD_TMP_DIR, f), { force: true }, () => {});
    }
  } catch {}
}

/** Arquivos temporários em uso (a limpeza de sobras na tela Sistema não pode apagar). */
export function activeDavTempFiles(): string[] {
  return [...transients.values()].map((t) => t.tempPath).filter(Boolean) as string[];
}

/** Para testes: roda a varredura agora, como se o tempo tivesse passado. */
export function _forceSweepForTests(ageMs: number) {
  for (const t of transients.values()) t.modifiedAt -= ageMs;
  sweepTransients();
}

function transientsIn(userId: string, c: DavContainer): Transient[] {
  const prefix = `${userId}|${containerKey(c)}|`;
  return [...transients.entries()].filter(([k]) => k.startsWith(prefix)).map(([, t]) => t);
}

// ---------------------------------------------------------------------------------------------
// Travas (LOCK): o Windows/Office trava o arquivo enquanto edita; outra pessoa recebe "em uso"
// ---------------------------------------------------------------------------------------------
type LockInfo = { token: string; userId: string; owner: string; expires: number; path: string };
const locks = new Map<string, LockInfo>();
const LOCK_SECONDS = 3600;

function lockOf(pathKey: string): LockInfo | null {
  const l = locks.get(pathKey);
  if (!l) return null;
  if (l.expires < Date.now()) {
    locks.delete(pathKey);
    return null;
  }
  return l;
}

function assertNotLockedByOther(pathKey: string, userId: string) {
  const l = lockOf(pathKey);
  if (l && l.userId !== userId) throw new DavError(423, 'Arquivo em edição por outra pessoa.');
}

// ---------------------------------------------------------------------------------------------
// Utilidades de protocolo
// ---------------------------------------------------------------------------------------------
const xmlEsc = (s: string) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

function hrefOf(segments: string[], isCollection: boolean): string {
  const p = segments.map((s) => encodeURIComponent(s)).join('/');
  return `${DAV_PREFIX}/${p}${isCollection && p ? '/' : ''}`;
}

/** /dav/Setor/Pasta/arquivo.pdf → ['Setor','Pasta','arquivo.pdf'] (decodificado). */
export function parseDavPath(rawUrl: string): string[] | null {
  let p = String(rawUrl || '').split('?')[0].split('#')[0];
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    return null;
  }
  if (p !== DAV_PREFIX && !p.startsWith(DAV_PREFIX + '/')) return null;
  const rest = p.slice(DAV_PREFIX.length);
  const segs: string[] = [];
  for (const part of rest.split('/')) {
    if (!part) continue;
    let dec: string;
    try {
      dec = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (dec === '.' || dec === '..' || dec.includes('/') || dec.includes('\\') || dec.includes('\u0000')) return null;
    segs.push(dec);
  }
  return segs;
}

const rfc1123 = (v: any) => {
  const d = v ? new Date(v) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toUTCString();
};
const iso = (v: any) => {
  const d = v ? new Date(v) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toISOString();
};

function readBody(req: IncomingMessage, limit = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new DavError(413, 'Corpo da requisição grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Recebe o conteúdo de um PUT num arquivo temporário (com limite de tamanho, se houver). */
async function receiveToTemp(req: IncomingMessage): Promise<{ tempPath: string; size: number }> {
  ensureStorageDirs();
  const maxBytes = await getMaxUploadBytes();
  const declared = Number(req.headers['content-length'] || 0);
  if (maxBytes > 0 && declared > maxBytes) {
    throw new DavError(413, `O arquivo ultrapassa o limite de ${Math.round(maxBytes / 1024 / 1024)} MB por arquivo.`);
  }
  const tempPath = path.join(UPLOAD_TMP_DIR, `dav-${crypto.randomBytes(12).toString('hex')}`);
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (maxBytes > 0 && size > maxBytes) return cb(new DavError(413, 'O arquivo ultrapassa o limite por arquivo.'));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(tempPath, { mode: 0o600 }));
  } catch (err) {
    fs.rm(tempPath, { force: true }, () => {});
    throw err;
  }
  return { tempPath, size };
}

type Entry = {
  segments: string[];
  name: string;
  collection: boolean;
  size?: number;
  contentType?: string;
  modified?: any;
  created?: any;
  etag?: string;
  attrs?: string;
  quota?: { used: number; available: number };
};

function propXml(e: Entry): string {
  const props: string[] = [];
  props.push(`<D:displayname>${xmlEsc(e.name)}</D:displayname>`);
  props.push(e.collection ? '<D:resourcetype><D:collection/></D:resourcetype>' : '<D:resourcetype/>');
  if (!e.collection) {
    props.push(`<D:getcontentlength>${e.size || 0}</D:getcontentlength>`);
    props.push(`<D:getcontenttype>${xmlEsc(e.contentType || 'application/octet-stream')}</D:getcontenttype>`);
  }
  props.push(`<D:getlastmodified>${rfc1123(e.modified)}</D:getlastmodified>`);
  props.push(`<D:creationdate>${iso(e.created || e.modified)}</D:creationdate>`);
  if (e.etag) props.push(`<D:getetag>"${xmlEsc(e.etag)}"</D:getetag>`);
  props.push(
    '<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>'
  );
  props.push('<D:lockdiscovery/>');
  props.push(`<Z:Win32FileAttributes>${e.attrs || (e.collection ? '00000010' : '00000020')}</Z:Win32FileAttributes>`);
  if (e.quota) {
    props.push(`<D:quota-used-bytes>${Math.max(0, Math.round(e.quota.used))}</D:quota-used-bytes>`);
    props.push(`<D:quota-available-bytes>${Math.max(0, Math.round(e.quota.available))}</D:quota-available-bytes>`);
  }
  return (
    `<D:response><D:href>${xmlEsc(hrefOf(e.segments, e.collection))}</D:href>` +
    `<D:propstat><D:prop>${props.join('')}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  );
}

const MULTI_OPEN = '<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:" xmlns:Z="urn:schemas-microsoft-com:">';
const MULTI_CLOSE = '</D:multistatus>';

function sendXml(res: ServerResponse, status: number, xml: string, extra: Record<string, string> = {}) {
  const body = Buffer.from(xml, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

function sendStatus(res: ServerResponse, status: number, message = '', extra: Record<string, string> = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = Buffer.from(message, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

const ALLOW = 'OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, COPY, MOVE, PROPFIND, PROPPATCH, LOCK, UNLOCK';
const DAV_HEADERS = { DAV: '1, 2', 'MS-Author-Via': 'DAV', Allow: ALLOW };

function nodeEntry(ctx: DavContext, segments: string[], name: string, node: DavNode): Entry {
  if (node.kind === 'root') return { segments, name: 'DocSecure', collection: true, attrs: '00000010' };
  if (node.kind === 'dept') {
    return { segments, name, collection: true, modified: node.dept.updated_at, created: node.dept.created_at, attrs: '00000010', etag: `d-${node.dept.id}` };
  }
  if (node.kind === 'folder') {
    return {
      segments,
      name,
      collection: true,
      modified: node.folder.updated_at,
      created: node.folder.created_at,
      attrs: '00000010',
      etag: `f-${node.folder.id}-${new Date(node.folder.updated_at || 0).getTime()}`,
    };
  }
  const d = node.doc;
  return {
    segments,
    name,
    collection: false,
    size: Number(d.size_bytes || 0),
    contentType: (CONTENT_TYPES[String(d.extension).toLowerCase()] || 'application/octet-stream').split(';')[0],
    modified: d.updated_at,
    created: d.created_at,
    etag: `${String(d.hash_sha256 || '').slice(0, 16)}-${d.size_bytes}`,
    // Somente leitura quando a pessoa não pode alterar (o Word abre como "somente leitura")
    attrs: ctx.canEdit(d) ? '00000020' : '00000021',
  };
}

function transientEntry(parentSegs: string[], t: Transient): Entry {
  return {
    segments: [...parentSegs, t.name],
    name: t.name,
    collection: false,
    size: t.size,
    contentType: 'application/octet-stream',
    modified: t.modifiedAt,
    created: t.createdAt,
    etag: `t-${t.createdAt}-${t.size}-${t.modifiedAt}`,
    attrs: t.attrs || defaultAttrs(t.name),
  };
}

// ---------------------------------------------------------------------------------------------
// Resolução de um caminho, incluindo os temporários da pessoa
// ---------------------------------------------------------------------------------------------
type Target = {
  segments: string[];
  name: string;
  parentSegs: string[];
  parent: DavNode | null; // null = a pasta de cima não existe / não é visível
  node: DavNode | null; // item real
  transient: { key: string; t: Transient } | null;
};

async function locate(ctx: DavContext, segments: string[]): Promise<Target> {
  const parentSegs = segments.slice(0, -1);
  const name = segments[segments.length - 1] || '';
  if (!segments.length) return { segments, name: '', parentSegs, parent: null, node: { kind: 'root' }, transient: null };
  const parent = await ctx.resolve(parentSegs);
  let node: DavNode | null = null;
  let transient: Target['transient'] = null;
  if (parent) {
    const c = containerOf(parent);
    if (c) {
      const key = tKey(ctx.user.id, c, name);
      const t = transients.get(key);
      if (t) transient = { key, t };
    }
    if (!transient) node = await ctx.resolve(segments);
  }
  return { segments, name, parentSegs, parent, node, transient };
}

// ---------------------------------------------------------------------------------------------
// Métodos
// ---------------------------------------------------------------------------------------------
async function handlePropfind(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  await readBody(req).catch(() => '');
  const depthHeader = String(req.headers['depth'] ?? '1').toLowerCase();
  if (depthHeader === 'infinity') {
    return sendXml(
      res,
      403,
      '<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:propfind-finite-depth/></D:error>'
    );
  }
  const depth = depthHeader === '0' ? 0 : 1;
  const target = await locate(ctx, segments);
  const parts: string[] = [];

  if (target.transient) {
    parts.push(propXml(transientEntry(target.parentSegs, target.transient.t)));
    return sendXml(res, 207, MULTI_OPEN + parts.join('') + MULTI_CLOSE);
  }
  const node = target.node;
  if (!node) return sendStatus(res, 404, 'Não encontrado.');

  const self = nodeEntry(ctx, segments, target.name, node);
  if (node.kind === 'root') {
    const disk = getServerDisk();
    if (disk) self.quota = { used: disk.usedBytes, available: disk.freeBytes };
  }
  parts.push(propXml(self));

  if (depth === 1 && node.kind !== 'doc') {
    for (const child of await ctx.children(node)) {
      parts.push(propXml(nodeEntry(ctx, [...segments, child.name], child.name, child.node)));
    }
    const c = containerOf(node);
    if (c) {
      for (const t of transientsIn(ctx.user.id, c)) {
        if (t.kind === 'alias') continue; // o documento real "renomeado" fica escondido enquanto o Office salva
        parts.push(propXml(transientEntry(segments, t)));
      }
    }
  }
  return sendXml(res, 207, MULTI_OPEN + parts.join('') + MULTI_CLOSE);
}

async function handleGet(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[], head: boolean) {
  const target = await locate(ctx, segments);
  if (target.transient) {
    const t = target.transient.t;
    if (t.kind === 'alias' && t.docId) {
      // Original "renomeado" pelo Office: o conteúdo continua sendo o do documento
      const doc = await findDocById(ctx, t.docId);
      if (!doc) return sendStatus(res, 404, 'Não encontrado.');
      return sendDoc(ctx, res, doc, head);
    }
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(t.size),
      'Last-Modified': rfc1123(t.modifiedAt),
      'Cache-Control': 'no-store',
    };
    res.writeHead(200, headers);
    if (head || !t.tempPath || t.size === 0) return res.end();
    fs.createReadStream(t.tempPath).pipe(res);
    return;
  }
  const node = target.node;
  if (!node) return sendStatus(res, 404, 'Não encontrado.');
  if (node.kind !== 'doc') {
    if (head) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end();
    }
    return sendStatus(res, 200, 'DocSecure — use o Explorador de Arquivos do Windows para navegar nesta pasta.');
  }
  return sendDoc(ctx, res, node.doc, head);
}

async function sendDoc(ctx: DavContext, res: ServerResponse, doc: any, head: boolean) {
  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[String(doc.extension).toLowerCase()] || 'application/octet-stream',
    'Content-Length': String(doc.size_bytes),
    'Last-Modified': rfc1123(doc.updated_at),
    ETag: `"${String(doc.hash_sha256 || '').slice(0, 16)}-${doc.size_bytes}"`,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  };
  if (head) {
    await ctx.folderIndex();
    if (!ctx.canDownload(doc)) throw new DavError(403, 'Você não tem permissão para baixar este arquivo.');
    res.writeHead(200, headers);
    return res.end();
  }
  const stream = await ctx.openRead(doc);
  res.writeHead(200, headers);
  try {
    await pipeline(stream as any, res);
  } catch (err: any) {
    console.error('[DAV GET] falha ao enviar:', err?.message || err);
    res.destroy();
  }
}

async function handlePut(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  if (!isFileStorageReady()) throw new DavError(503, 'Armazenamento seguro indisponível no servidor.');
  const target = await locate(ctx, segments);
  if (!target.parent) throw new DavError(409, 'A pasta de destino não existe.');
  const c = containerOf(target.parent);
  if (!c) throw new DavError(403, 'Escolha um setor ou uma pasta para salvar arquivos.');
  const pathKey = segments.join('/').toLowerCase();
  assertNotLockedByOther(pathKey, ctx.user.id);
  if (target.node && target.node.kind !== 'doc') throw new DavError(405, 'Já existe uma pasta com esse nome.');

  // Temporários do Office/Windows: guardados à parte, sem virar documento
  if (target.transient?.t.kind === 'file' || (!target.node && isTransientName(target.name))) {
    const { tempPath, size } = await receiveToTemp(req);
    const key = tKey(ctx.user.id, c, target.name);
    const prev = transients.get(key);
    if (prev?.tempPath) fs.rm(prev.tempPath, { force: true }, () => {});
    const isPendingEmpty = Boolean(prev?.pendingEmpty);
    if (isPendingEmpty && size > 0) {
      // Arquivo novo que estava vazio recebeu o conteúdo: agora vira documento
      transients.delete(key);
      try {
        await ctx.createDoc(c, target.name, tempPath, size);
      } finally {
        fs.rm(tempPath, { force: true }, () => {});
      }
      return sendStatus(res, 201);
    }
    transients.set(key, {
      userId: ctx.user.id,
      container: c,
      name: prev?.name || target.name,
      kind: 'file',
      tempPath,
      size,
      attrs: prev?.attrs,
      pendingEmpty: isPendingEmpty,
      createdAt: prev?.createdAt || Date.now(),
      modifiedAt: Date.now(),
    });
    return sendStatus(res, prev ? 204 : 201);
  }

  // Documento "renomeado" pelo Office para um nome temporário e regravado por cima
  if (target.transient?.t.kind === 'alias') {
    const t = target.transient.t;
    const { tempPath, size } = await receiveToTemp(req);
    try {
      const doc = await findDocById(ctx, t.docId!);
      if (doc) await ctx.replaceDoc(doc, tempPath, size);
      t.size = size;
      t.modifiedAt = Date.now();
    } finally {
      fs.rm(tempPath, { force: true }, () => {});
    }
    return sendStatus(res, 204);
  }

  if (!target.node) ctx.validateNewFileName(target.name); // recusa .exe etc. antes de receber o arquivo
  const { tempPath, size } = await receiveToTemp(req);
  try {
    if (target.node && target.node.kind === 'doc') {
      await ctx.replaceDoc(target.node.doc, tempPath, size);
      return sendStatus(res, 204);
    }
    // Word/Excel: o original foi "renomeado" para um temporário; gravar no nome original = nova versão dele
    const alias = transientsIn(ctx.user.id, c).find(
      (t) => t.kind === 'alias' && String(t.originalName || '').toLowerCase() === target.name.toLowerCase()
    );
    if (alias?.docId) {
      const doc = await findDocById(ctx, alias.docId);
      unhideDoc(alias.docId);
      if (doc) {
        await ctx.replaceDoc(doc, tempPath, size);
        return sendStatus(res, 204);
      }
    }
    if (size === 0) {
      // O Windows cria o arquivo vazio e logo depois grava o conteúdo: espera o conteúdo chegar
      ensureStorageDirs();
      const key = tKey(ctx.user.id, c, target.name);
      transients.set(key, {
        userId: ctx.user.id,
        container: c,
        name: target.name,
        kind: 'file',
        tempPath: undefined,
        size: 0,
        pendingEmpty: true,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      });
      return sendStatus(res, 201);
    }
    await ctx.createDoc(c, target.name, tempPath, size);
    return sendStatus(res, 201);
  } finally {
    fs.rm(tempPath, { force: true }, () => {});
  }
}

async function findDocById(ctx: DavContext, docId: string): Promise<any | null> {
  const { pool } = await import('../db');
  const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1 AND status <> 'trash'", [docId]);
  const doc = rows[0];
  if (!doc) return null;
  // A pessoa precisa continuar podendo ver o documento
  await ctx.folderIndex();
  return ctx.canDownload(doc) ? doc : null;
}

async function handleMkcol(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  const body = await readBody(req, 64 * 1024).catch(() => '');
  if (body.trim()) throw new DavError(415, 'Corpo não suportado.');
  const target = await locate(ctx, segments);
  if (target.node || target.transient) throw new DavError(405, 'Já existe um item com esse nome.');
  if (!target.parent) throw new DavError(409, 'A pasta de cima não existe.');
  const c = containerOf(target.parent);
  if (!c) throw new DavError(403, 'Não é possível criar setores pela pasta do Windows.');
  await ctx.mkdir(c, target.name);
  return sendStatus(res, 201);
}

async function handleDelete(ctx: DavContext, res: ServerResponse, segments: string[]) {
  const target = await locate(ctx, segments);
  assertNotLockedByOther(segments.join('/').toLowerCase(), ctx.user.id);
  if (target.transient) {
    // Apagar um temporário nunca apaga documento: se era o original "renomeado", ele volta a aparecer
    dropTransient(target.transient.key, target.transient.t);
    return sendStatus(res, 204);
  }
  const node = target.node;
  if (!node) return sendStatus(res, 404, 'Não encontrado.');
  if (node.kind === 'root' || node.kind === 'dept') throw new DavError(403, 'Setores não podem ser excluídos pela pasta do Windows.');
  if (node.kind === 'folder') await ctx.deleteFolder(node.folder);
  else await ctx.deleteDoc(node.doc);
  locks.delete(segments.join('/').toLowerCase());
  return sendStatus(res, 204);
}

async function handleMoveCopy(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[], isCopy: boolean) {
  const destSegs = parseDavPath(String(req.headers['destination'] || ''));
  if (!destSegs || !destSegs.length) throw new DavError(400, 'Destino inválido.');
  const overwrite = String(req.headers['overwrite'] || 'T').toUpperCase() !== 'F';
  const src = await locate(ctx, segments);
  if (!src.node && !src.transient) return sendStatus(res, 404, 'Origem não encontrada.');
  if (src.node && (src.node.kind === 'root' || src.node.kind === 'dept')) throw new DavError(403, 'Setores não podem ser movidos.');
  if (segments.join('/').toLowerCase() === destSegs.join('/').toLowerCase() && src.name === destSegs[destSegs.length - 1]) {
    return sendStatus(res, 204);
  }
  if (!isCopy) assertNotLockedByOther(segments.join('/').toLowerCase(), ctx.user.id);

  const dst = await locate(ctx, destSegs);
  if (!dst.parent) throw new DavError(409, 'A pasta de destino não existe.');
  const dc = containerOf(dst.parent);
  if (!dc) throw new DavError(403, 'Escolha um setor ou uma pasta como destino.');
  assertNotLockedByOther(destSegs.join('/').toLowerCase(), ctx.user.id);
  const sameItem = Boolean(src.node && dst.node && src.node.kind === dst.node.kind && nodeId(src.node) === nodeId(dst.node));
  let existed = Boolean((dst.node && !sameItem) || dst.transient);
  if (existed && !overwrite) throw new DavError(412, 'Já existe um item com esse nome no destino.');

  // ---- origem temporária (o Office terminando de salvar)
  if (src.transient) {
    const t = src.transient.t;
    if (t.kind === 'alias') {
      // Original "renomeado" voltando a ter nome normal (ou indo para outro lugar)
      const doc = t.docId ? await findDocById(ctx, t.docId) : null;
      transients.delete(src.transient.key);
      if (t.docId) unhideDoc(t.docId);
      if (!doc) return sendStatus(res, 404, 'Documento não encontrado.');
      if (isTransientName(dst.name)) {
        hideDoc(doc.id, ALIAS_TTL_MS);
        transients.set(tKey(ctx.user.id, dc, dst.name), { ...t, container: dc, name: dst.name, modifiedAt: Date.now() });
        return sendStatus(res, existed ? 204 : 201);
      }
      if (dst.node && dst.node.kind === 'doc' && dst.node.doc.id !== doc.id) await ctx.deleteDoc(dst.node.doc);
      await ctx.moveDoc(doc, dc, dst.name);
      return sendStatus(res, existed ? 204 : 201);
    }
    // Arquivo novo ainda vazio sendo renomeado (ex.: "Novo Documento de Texto.txt" → "notas.txt"):
    // continua esperando o conteúdo, agora com o nome novo
    if (t.pendingEmpty && !isCopy && !dst.node && !dst.transient) {
      if (!isTransientName(dst.name)) ctx.validateNewFileName(dst.name);
      transients.delete(src.transient.key);
      transients.set(tKey(ctx.user.id, dc, dst.name), { ...t, container: dc, name: dst.name, modifiedAt: Date.now() });
      return sendStatus(res, 201);
    }
    // Conteúdo temporário → nome definitivo
    if (isTransientName(dst.name)) {
      if (dst.transient) dropTransient(dst.transient.key, dst.transient.t);
      const moved: Transient = { ...t, container: dc, name: dst.name, modifiedAt: Date.now() };
      if (isCopy && t.tempPath) {
        moved.tempPath = path.join(UPLOAD_TMP_DIR, `dav-${crypto.randomBytes(12).toString('hex')}`);
        fs.copyFileSync(t.tempPath, moved.tempPath);
      } else transients.delete(src.transient.key);
      transients.set(tKey(ctx.user.id, dc, dst.name), moved);
      return sendStatus(res, existed ? 204 : 201);
    }
    const temp = t.tempPath || path.join(UPLOAD_TMP_DIR, `dav-${crypto.randomBytes(12).toString('hex')}`);
    if (!t.tempPath) fs.writeFileSync(temp, Buffer.alloc(0), { mode: 0o600 });
    try {
      const alias = transientsIn(ctx.user.id, dc).find(
        (a) => a.kind === 'alias' && String(a.originalName || '').toLowerCase() === dst.name.toLowerCase()
      );
      if (dst.node && dst.node.kind === 'doc') {
        await ctx.replaceDoc(dst.node.doc, temp, t.size);
      } else if (alias?.docId) {
        // O caso do Word/Excel: o temporário com o conteúdo novo ganha o nome do original → nova versão
        const doc = await findDocById(ctx, alias.docId);
        unhideDoc(alias.docId);
        if (doc) await ctx.replaceDoc(doc, temp, t.size);
        else await ctx.createDoc(dc, dst.name, temp, t.size);
        existed = true;
      } else if (dst.node) {
        throw new DavError(405, 'Já existe uma pasta com esse nome.');
      } else {
        ctx.validateNewFileName(dst.name);
        await ctx.createDoc(dc, dst.name, temp, t.size);
      }
    } finally {
      if (!isCopy) {
        transients.delete(src.transient.key);
        fs.rm(temp, { force: true }, () => {});
      } else if (!t.tempPath) fs.rm(temp, { force: true }, () => {});
    }
    return sendStatus(res, existed ? 204 : 201);
  }

  const node = src.node!;
  // ---- documento real → nome temporário (o Office guardando o original antes de gravar o novo)
  if (node.kind === 'doc' && !isCopy && isTransientName(dst.name)) {
    if (dst.transient) dropTransient(dst.transient.key, dst.transient.t);
    hideDoc(node.doc.id, ALIAS_TTL_MS);
    transients.set(tKey(ctx.user.id, dc, dst.name), {
      userId: ctx.user.id,
      container: dc,
      name: dst.name,
      kind: 'alias',
      docId: node.doc.id,
      originalName: src.name,
      size: Number(node.doc.size_bytes || 0),
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
    return sendStatus(res, existed ? 204 : 201);
  }

  // ---- destino ocupado (com Overwrite: T): o que estava lá vai para a lixeira
  if (dst.node && !sameItem) {
    if (dst.node.kind === 'folder' || node.kind === 'folder') {
      throw new DavError(412, 'Já existe uma pasta com esse nome no destino. Renomeie antes de mover.');
    }
    if (dst.node.kind === 'doc') await ctx.deleteDoc(dst.node.doc);
  }
  if (dst.transient) dropTransient(dst.transient.key, dst.transient.t);

  if (node.kind === 'doc') {
    if (isCopy) await ctx.copyDoc(node.doc, dc, dst.name);
    else await ctx.moveDoc(node.doc, dc, dst.name);
  } else if (node.kind === 'folder') {
    if (isCopy) await copyFolderTree(ctx, node, dc, dst.name);
    else await ctx.moveFolder(node.folder, dc, dst.name);
  }
  if (!isCopy) {
    const from = segments.join('/').toLowerCase();
    const l = locks.get(from);
    if (l) {
      locks.delete(from);
      locks.set(destSegs.join('/').toLowerCase(), { ...l, path: destSegs.join('/') });
    }
  }
  return sendStatus(res, existed ? 204 : 201);
}

function nodeId(n: DavNode): string {
  if (n.kind === 'doc') return n.doc.id;
  if (n.kind === 'folder') return n.folder.id;
  if (n.kind === 'dept') return n.dept.id;
  return 'root';
}

async function copyFolderTree(ctx: DavContext, node: DavNode & { kind: 'folder' }, dest: DavContainer, name: string) {
  let count = 0;
  const walk = async (src: DavNode, into: DavContainer, newName: string) => {
    await ctx.mkdir(into, newName);
    ctx.invalidate();
    const { pool } = await import('../db');
    const { rows } = await pool.query(
      `SELECT * FROM folders WHERE department_id = $1 AND COALESCE(parent_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) LIMIT 1`,
      [into.deptId, into.folderId, newName]
    );
    const created = rows[0];
    if (!created) return;
    const newContainer: DavContainer = { deptId: into.deptId, deptName: into.deptName, folderId: created.id };
    for (const child of await ctx.children(src)) {
      if (++count > 2000) throw new DavError(507, 'Pasta grande demais para copiar pela pasta do Windows (mais de 2.000 itens).');
      if (child.node.kind === 'doc') await ctx.copyDoc(child.node.doc, newContainer, child.name);
      else if (child.node.kind === 'folder') await walk(child.node, newContainer, child.name);
    }
  };
  await walk(node, dest, name);
}

async function handleLock(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  const body = await readBody(req, 64 * 1024).catch(() => '');
  const pathKey = segments.join('/').toLowerCase();
  const existing = lockOf(pathKey);
  const timeoutHdr = String(req.headers['timeout'] || '');
  const m = timeoutHdr.match(/Second-(\d+)/i);
  const seconds = Math.min(m ? Number(m[1]) : LOCK_SECONDS, LOCK_SECONDS);

  if (existing && existing.userId !== ctx.user.id) throw new DavError(423, 'Arquivo em edição por outra pessoa.');
  let lock: LockInfo;
  if (existing && !body.trim()) {
    existing.expires = Date.now() + seconds * 1000; // renovação
    lock = existing;
  } else {
    const ownerMatch = body.match(/<(?:\w+:)?owner[^>]*>([\s\S]*?)<\/(?:\w+:)?owner>/i);
    lock = {
      token: `opaquelocktoken:${crypto.randomUUID()}`,
      userId: ctx.user.id,
      owner: ownerMatch ? ownerMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200) : ctx.user.name,
      expires: Date.now() + seconds * 1000,
      path: segments.join('/'),
    };
    locks.set(pathKey, lock);
  }
  const target = await locate(ctx, segments);
  const exists = Boolean(target.node || target.transient);
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>' +
    '<D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>0</D:depth>' +
    `<D:owner>${xmlEsc(lock.owner)}</D:owner><D:timeout>Second-${seconds}</D:timeout>` +
    `<D:locktoken><D:href>${lock.token}</D:href></D:locktoken>` +
    `<D:lockroot><D:href>${xmlEsc(hrefOf(segments, false))}</D:href></D:lockroot>` +
    '</D:activelock></D:lockdiscovery></D:prop>';
  return sendXml(res, exists ? 200 : 201, xml, { 'Lock-Token': `<${lock.token}>` });
}

function handleUnlock(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  const pathKey = segments.join('/').toLowerCase();
  const l = lockOf(pathKey);
  const token = String(req.headers['lock-token'] || '').replace(/[<>]/g, '').trim();
  if (l && (l.token === token || l.userId === ctx.user.id)) locks.delete(pathKey);
  return sendStatus(res, 204);
}

async function handleProppatch(ctx: DavContext, req: IncomingMessage, res: ServerResponse, segments: string[]) {
  const body = await readBody(req, 256 * 1024).catch(() => '');
  const target = await locate(ctx, segments);
  if (!target.node && !target.transient) return sendStatus(res, 404, 'Não encontrado.');
  // O Windows grava datas e atributos. Guardamos só os atributos dos temporários (ex.: ~$ oculto);
  // as datas do documento são sempre as do DocSecure.
  const attrs = body.match(/<(?:\w+:)?Win32FileAttributes[^>]*>\s*([0-9a-fA-F]{1,8})\s*</);
  if (attrs && target.transient) target.transient.t.attrs = attrs[1].padStart(8, '0');
  const names = [...body.matchAll(/<(?:(\w+):)?(Win32\w+|getlastmodified|creationdate|displayname|[A-Za-z0-9_-]+)\b[^>]*\/?>/g)]
    .map((m) => m[2])
    .filter((n) => !['propertyupdate', 'set', 'remove', 'prop'].includes(n.toLowerCase()));
  const uniq = [...new Set(names)];
  const props = uniq.map((n) => (n.startsWith('Win32') ? `<Z:${n}/>` : `<D:${n}/>`)).join('');
  const xml =
    MULTI_OPEN +
    `<D:response><D:href>${xmlEsc(hrefOf(segments, Boolean(target.node && target.node.kind !== 'doc')))}</D:href>` +
    `<D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>` +
    MULTI_CLOSE;
  return sendXml(res, 207, xml);
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------
/** Responde OPTIONS/PROPFIND na raiz do site (o Windows testa a raiz antes de conectar /dav). */
export function davRootProbe(req: IncomingMessage, res: ServerResponse): boolean {
  const url = String(req.url || '').split('?')[0];
  if (url !== '/' && url !== '') return false;
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { ...DAV_HEADERS, 'Content-Length': '0' });
    res.end();
    return true;
  }
  if (req.method === 'PROPFIND') {
    req.resume();
    sendXml(
      res,
      207,
      MULTI_OPEN +
        '<D:response><D:href>/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>' +
        '<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>' +
        MULTI_CLOSE
    );
    return true;
  }
  return false;
}

export async function davHandler(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) {
  const method = String(req.method || 'GET').toUpperCase();
  const rawUrl = req.originalUrl || req.url || '';
  const segments = parseDavPath(rawUrl);
  try {
    if (!segments) throw new DavError(400, 'Caminho inválido.');
    if (method === 'OPTIONS') {
      res.writeHead(200, { ...DAV_HEADERS, 'Content-Length': '0' });
      return res.end();
    }

    const auth = await authenticateDav(req);
    const ctx = new DavContext(auth.user, auth.ip);

    switch (method) {
      case 'PROPFIND':
        return await handlePropfind(ctx, req, res, segments);
      case 'GET':
        return await handleGet(ctx, req, res, segments, false);
      case 'HEAD':
        return await handleGet(ctx, req, res, segments, true);
      case 'PUT':
        return await handlePut(ctx, req, res, segments);
      case 'MKCOL':
        return await handleMkcol(ctx, req, res, segments);
      case 'DELETE':
        return await handleDelete(ctx, res, segments);
      case 'MOVE':
        return await handleMoveCopy(ctx, req, res, segments, false);
      case 'COPY':
        return await handleMoveCopy(ctx, req, res, segments, true);
      case 'LOCK':
        return await handleLock(ctx, req, res, segments);
      case 'UNLOCK':
        return handleUnlock(ctx, req, res, segments);
      case 'PROPPATCH':
        return await handleProppatch(ctx, req, res, segments);
      default:
        return sendStatus(res, 405, 'Método não suportado.', { Allow: ALLOW });
    }
  } catch (err: any) {
    if (!req.readableEnded) req.resume();
    if (err instanceof DavAuthError) {
      return sendStatus(res, err.status, err.message, err.headers);
    }
    if (err instanceof DavError) return sendStatus(res, err.status, err.message);
    if (err?.status && Number(err.status) >= 400 && Number(err.status) < 600) return sendStatus(res, Number(err.status), String(err.message || ''));
    console.error('[DAV ERROR]', method, rawUrl, err?.message || err);
    return sendStatus(res, 500, 'Erro interno.');
  }
}

/** Arquivo novo que ficou vazio por 10 minutos (ex.: "Novo Documento de Texto.txt"): vira documento vazio. */
export function makeEmptyMaterializer(loadUser: (userId: string) => Promise<any | null>): Materializer {
  return async (t: Transient) => {
    const user = await loadUser(t.userId);
    if (!user) return;
    const ctx = new DavContext(user, 'servidor');
    ensureStorageDirs();
    const temp = path.join(UPLOAD_TMP_DIR, `dav-${crypto.randomBytes(12).toString('hex')}`);
    fs.writeFileSync(temp, Buffer.alloc(0), { mode: 0o600 });
    try {
      const { pool } = await import('../db');
      const { rows } = await pool.query(
        `SELECT 1 FROM documents WHERE department_id = $1 AND COALESCE(folder_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) AND status <> 'trash'`,
        [t.container.deptId, t.container.folderId, t.name]
      );
      if (!rows.length) await ctx.createDoc(t.container, t.name, temp, 0);
    } finally {
      fs.rm(temp, { force: true }, () => {});
    }
  };
}

export { isDocHidden };
