/**
 * Pasta no Windows (WebDAV) — a parte que conversa com o DocSecure.
 *
 * Mostra para cada pessoa exatamente o que ela vê no site: os setores, as pastas e os arquivos
 * que ela pode acessar. Todas as regras são as mesmas das telas (setor, pasta, segurança de cada
 * arquivo, lixeira de 7 dias, quota, extensões bloqueadas, auditoria).
 *
 * Diferenças pensadas para o Windows:
 * - Arquivos marcados "só visualizar" não aparecem na pasta (abrir no Windows = baixar).
 * - Salvar por cima de um arquivo cria uma nova versão do mesmo documento. Se a versão anterior
 *   tiver mais de 15 minutos, ela vai para a lixeira do setor (dá para recuperar por 7 dias).
 */
import crypto from 'crypto';
import fs from 'fs';
import { pool } from '../db';
import {
  can,
  isDepartmentManager,
  isDocAdmin,
  loadFolderIndex,
  visibleFolderIds,
  documentVisible,
  docPolicyDecision,
  writeAudit,
  TRASH_RETENTION_DAYS,
  FolderIndex,
} from '../services/documentAccess';
import {
  BLOCKED_EXTENSIONS,
  MAGIC_SIGNATURES,
  CONTENT_TYPES,
  getExtension,
  sanitizeFileName,
  findSameName,
  nextFreeName,
  cleanFolderName,
} from '../services/documentRules';
import { storeEncryptedFromTemp, deleteStoredFile, createDecryptStream, decryptToFile, UPLOAD_TMP_DIR, ensureStorageDirs } from '../services/fileStorage';
import { broadcastChange } from '../services/realtime';

export const DAV_DEVICE = 'Pasta no Windows';

export class DavError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type DeptRow = { id: string; name: string; updated_at?: any; created_at?: any };
export type FolderRowFull = {
  id: string;
  name: string;
  department_id: string;
  parent_id: string | null;
  is_private: boolean;
  created_by: string | null;
  created_at: any;
  updated_at: any;
};

export type DavNode =
  | { kind: 'root' }
  | { kind: 'dept'; dept: DeptRow }
  | { kind: 'folder'; dept: DeptRow; folder: FolderRowFull }
  | { kind: 'doc'; dept: DeptRow; doc: any };

export type DavChild = { name: string; node: DavNode };

/** Onde um arquivo/pasta novo pode ser criado: dentro de um setor (raiz) ou de uma pasta. */
export type DavContainer = { deptId: string; deptName: string; folderId: string | null };

export function containerOf(node: DavNode): DavContainer | null {
  if (node.kind === 'dept') return { deptId: node.dept.id, deptName: node.dept.name, folderId: null };
  if (node.kind === 'folder') return { deptId: node.dept.id, deptName: node.dept.name, folderId: node.folder.id };
  return null;
}

export const containerKey = (c: DavContainer) => `${c.deptId}:${c.folderId || ''}`;

// Documentos "escondidos" por alguns segundos enquanto o Word/Excel salvam (eles renomeiam o original
// para um nome temporário, gravam o novo e apagam o temporário). Ver davServer.ts.
const hiddenDocs = new Map<string, number>();
export function hideDoc(docId: string, ms: number) {
  hiddenDocs.set(docId, Date.now() + ms);
}
export function unhideDoc(docId: string) {
  hiddenDocs.delete(docId);
}
export function isDocHidden(docId: string): boolean {
  const until = hiddenDocs.get(docId);
  if (!until) return false;
  if (until < Date.now()) {
    hiddenDocs.delete(docId);
    return false;
  }
  return true;
}

// Abrir o mesmo arquivo várias vezes seguidas (miniaturas, reabrir) gera um único registro na auditoria
const readAuditSeen = new Map<string, number>();
const READ_AUDIT_WINDOW_MS = 10 * 60 * 1000;

/** Nome que o Windows aceita (sem \ / : * ? " < > | e sem ponto ou espaço no fim). */
export function windowsSafeName(name: string): string {
  const clean = String(name || '')
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return clean || '_';
}

function withSuffix(name: string, n: number, isFile: boolean): string {
  if (!isFile) return `${name} (${n})`;
  const m = name.match(/^(.*?)(\.[^.]{1,10})?$/);
  return `${m?.[1] || name} (${n})${m?.[2] || ''}`;
}

/** Tudo o que uma requisição precisa saber sobre quem está acessando, carregado uma vez. */
export class DavContext {
  private index: FolderIndex | null = null;
  private folders: Map<string, FolderRowFull> | null = null;
  private depts: DeptRow[] | null = null;
  private visible: Set<string> | null = null;
  private listings = new Map<string, DavChild[]>();

  constructor(public user: any, public ip: string) {}

  get auditUser() {
    return { id: this.user.id, name: this.user.name, role: this.user.role, departmentName: this.user.departmentName };
  }

  audit(action: string, id: string, name: string, details: string, result: 'SUCCESS' | 'DENIED' = 'SUCCESS') {
    return writeAudit(this.auditUser, action, id, name, details, result, this.ip, DAV_DEVICE).catch(() => {});
  }

  /** Recarrega tudo depois de uma alteração (a mesma requisição pode precisar da visão nova). */
  invalidate() {
    this.index = null;
    this.folders = null;
    this.depts = null;
    this.visible = null;
    this.listings.clear();
  }

  private async load() {
    if (this.index && this.folders && this.depts && this.visible) return;
    const [{ rows: folderRows }, { rows: deptRows }] = await Promise.all([
      pool.query(
        `SELECT id, name, department_id, parent_id, COALESCE(is_private, false) AS is_private, created_by, created_at, updated_at FROM folders`
      ),
      pool.query('SELECT id, name FROM departments ORDER BY name ASC'),
    ]);
    this.folders = new Map(folderRows.map((f: any) => [f.id, f]));
    this.depts = deptRows;
    this.index = await loadFolderIndex();
    this.visible = await visibleFolderIds(this.user, this.index);
  }

  async folderIndex(): Promise<FolderIndex> {
    await this.load();
    return this.index!;
  }

  async folderRow(id: string): Promise<FolderRowFull | undefined> {
    await this.load();
    return this.folders!.get(id);
  }

  /** "Pasta/Subpasta" dentro do setor (usado na lixeira para recriar o caminho ao restaurar). */
  async folderPath(folderId: string | null): Promise<string> {
    if (!folderId) return '';
    await this.load();
    const parts: string[] = [];
    const guard = new Set<string>();
    let cur = this.folders!.get(folderId);
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id ? this.folders!.get(cur.parent_id) : undefined;
    }
    return parts.join('/');
  }

  // ------------------------------------------------------------------ regras por arquivo
  canDownload(doc: any): boolean {
    const index = this.index!;
    const user = this.user;
    if (docPolicyDecision(user, doc, 'view') === false) return false;
    const policy = docPolicyDecision(user, doc, 'download');
    if (policy === null) return can(user, 'DOWNLOAD_DOCUMENT', doc.department_id, doc.folder_id, index);
    return (
      policy &&
      (can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id, index) || doc.owner_id === user.id || isDepartmentManager(user, doc.department_id))
    );
  }

  canEdit(doc: any): boolean {
    if (docPolicyDecision(this.user, doc, 'view') === false) return false;
    return can(this.user, 'EDIT_DOCUMENT', doc.department_id, doc.folder_id, this.index!) || doc.owner_id === this.user.id;
  }

  canWriteIn(c: DavContainer): boolean {
    return can(this.user, 'UPLOAD_DOCUMENT', c.deptId, c.folderId, this.index!);
  }

  // ------------------------------------------------------------------ listagem
  private nodeKey(node: DavNode): string {
    if (node.kind === 'root') return 'root';
    if (node.kind === 'dept') return `d:${node.dept.id}`;
    if (node.kind === 'folder') return `f:${node.folder.id}`;
    return `doc:${node.doc.id}`;
  }

  async children(node: DavNode): Promise<DavChild[]> {
    const key = this.nodeKey(node);
    const cached = this.listings.get(key);
    if (cached) return cached;
    await this.load();
    const user = this.user;
    const index = this.index!;
    const visible = this.visible!;
    const folders = [...this.folders!.values()];
    let out: DavChild[] = [];

    if (node.kind === 'root') {
      // Setores: o próprio, os que a pessoa gerencia/acessa, e os que têm alguma pasta compartilhada com ela
      out = this.depts!
        .filter((d) => can(user, 'VIEW_DOCUMENT', d.id, null, index) || folders.some((f) => f.department_id === d.id && visible.has(f.id)))
        .map((d) => ({ name: windowsSafeName(d.name), node: { kind: 'dept', dept: d } as DavNode }));
    } else if (node.kind === 'dept' || node.kind === 'folder') {
      const deptId = node.dept.id;
      const folderId = node.kind === 'folder' ? node.folder.id : null;
      const subFolders = folders
        .filter((f) => {
          if (f.department_id !== deptId || !visible.has(f.id)) return false;
          if (folderId) return f.parent_id === folderId;
          // Raiz do setor: pastas de primeiro nível + pastas compartilhadas cuja pasta de cima a pessoa não vê
          return !f.parent_id || !visible.has(f.parent_id);
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const { rows: docs } = await pool.query(
        `SELECT * FROM documents WHERE department_id = $1 AND COALESCE(folder_id, '') = COALESCE($2, '') AND status <> 'trash'
          ORDER BY name ASC, created_at ASC`,
        [deptId, folderId]
      );
      const shownDocs = docs.filter((d: any) => !isDocHidden(d.id) && documentVisible(user, d, visible) && this.canDownload(d));
      out = [
        ...subFolders.map((f) => ({ name: windowsSafeName(f.name), node: { kind: 'folder', dept: node.dept, folder: f } as DavNode })),
        ...shownDocs.map((d: any) => ({ name: windowsSafeName(d.name), node: { kind: 'doc', dept: node.dept, doc: d } as DavNode })),
      ];
    }

    // O Windows não diferencia maiúsculas de minúsculas: nomes repetidos ganham " (2)", " (3)"...
    const taken = new Set<string>();
    for (const child of out) {
      let name = child.name;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = withSuffix(child.name, n, child.node.kind === 'doc');
      child.name = name;
      taken.add(name.toLowerCase());
    }
    this.listings.set(key, out);
    return out;
  }

  /** Caminho (já decodificado, em pedaços) → item. null = não existe ou a pessoa não vê. */
  async resolve(segments: string[]): Promise<DavNode | null> {
    let node: DavNode = { kind: 'root' };
    for (const seg of segments) {
      if (node.kind === 'doc') return null;
      const kids = await this.children(node);
      const hit = kids.find((c) => c.name.toLowerCase() === seg.toLowerCase());
      if (!hit) return null;
      node = hit.node;
    }
    return node;
  }

  // ------------------------------------------------------------------ leitura
  async openRead(doc: any): Promise<NodeJS.ReadableStream> {
    await this.load();
    if (!this.canDownload(doc)) {
      await this.audit('DOCUMENT_DOWNLOADED', doc.id, doc.name, 'Acesso negado pela pasta do Windows.', 'DENIED');
      throw new DavError(403, 'Você não tem permissão para baixar este arquivo.');
    }
    if (!doc.storage_path) throw new DavError(410, 'Este registro não possui o arquivo armazenado.');
    const seenKey = `${this.user.id}:${doc.id}:${doc.hash_sha256}`;
    const last = readAuditSeen.get(seenKey) || 0;
    if (Date.now() - last > READ_AUDIT_WINDOW_MS) {
      readAuditSeen.set(seenKey, Date.now());
      if (readAuditSeen.size > 5000) readAuditSeen.delete(readAuditSeen.keys().next().value as string);
      await this.audit('DOCUMENT_DOWNLOADED', doc.id, doc.name, 'Arquivo aberto pela pasta do Windows.');
    }
    return createDecryptStream(doc.storage_path);
  }

  // ------------------------------------------------------------------ conteúdo (criar / substituir)
  private async checkContent(tempPath: string, size: number, extension: string) {
    const check = MAGIC_SIGNATURES[extension];
    if (check && size > 0) {
      const head = Buffer.alloc(16);
      const fd = fs.openSync(tempPath, 'r');
      try {
        fs.readSync(fd, head, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (!check(head)) throw new DavError(415, `O conteúdo do arquivo não corresponde a um .${extension} válido.`);
    }
  }

  private async checkQuota(deptId: string, extraBytes: number) {
    if (extraBytes <= 0) return;
    const { rows: deptRows } = await pool.query('SELECT name, storage_limit_bytes FROM departments WHERE id = $1', [deptId]);
    const limit = Number(deptRows[0]?.storage_limit_bytes || 0);
    if (limit <= 0) return;
    const { rows } = await pool.query('SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM documents WHERE department_id = $1', [deptId]);
    if (Number(rows[0].used) + extraBytes > limit) {
      throw new DavError(507, `A quota de armazenamento do setor ${deptRows[0]?.name || ''} foi atingida.`);
    }
  }

  /** Confere se um nome de arquivo novo é aceito (antes de receber o conteúdo). */
  validateNewFileName(rawName: string): { name: string; extension: string } {
    const name = sanitizeFileName(rawName);
    const extension = getExtension(name);
    if (!name || !extension) throw new DavError(403, 'O arquivo precisa ter uma extensão (ex: .pdf, .docx).');
    if (BLOCKED_EXTENSIONS.has(extension)) throw new DavError(415, `Arquivos .${extension} não são permitidos por segurança.`);
    return { name, extension };
  }

  async createDoc(c: DavContainer, rawName: string, tempPath: string, size: number): Promise<any> {
    await this.load();
    if (!this.canWriteIn(c)) {
      await this.audit('DOCUMENT_UPLOADED', '', rawName, `Envio pela pasta do Windows negado no setor ${c.deptName}.`, 'DENIED');
      throw new DavError(403, 'Você não tem permissão para enviar arquivos neste local.');
    }
    const { extension } = this.validateNewFileName(rawName);
    let { name } = this.validateNewFileName(rawName);
    await this.checkContent(tempPath, size, extension);
    await this.checkQuota(c.deptId, size);
    // Um arquivo com o mesmo nome que a pessoa não enxerga (privado de outra pessoa, "só visualizar"):
    // o novo ganha "(1)" em vez de mexer no que já existe
    if (await findSameName(c.deptId, c.folderId, name)) name = await nextFreeName(c.deptId, c.folderId, name);

    const docId = 'doc-' + crypto.randomBytes(12).toString('hex');
    const { storagePath, sha256 } = await storeEncryptedFromTemp(tempPath, c.deptId, docId);
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO documents (
          id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name,
          owner_id, owner_name, hash_sha256, current_version, versions, status, scan_status, tags,
          storage_path, visibility, download_policy, delete_policy, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, 'active', 'clean', $13, $14, 'folder', 'folder', 'folder', NOW(), NOW())`,
        [
          docId,
          name,
          extension,
          CONTENT_TYPES[extension] || 'application/octet-stream',
          size,
          c.folderId,
          c.deptId,
          c.deptName,
          this.user.id,
          this.user.name,
          sha256,
          JSON.stringify([
            {
              id: 'ver-' + crypto.randomBytes(6).toString('hex'),
              documentId: docId,
              versionNumber: 1,
              versionLabel: 'v1.0 (enviado pela pasta do Windows)',
              createdAt: now,
              createdBy: this.user.name,
              sizeBytes: size,
              hashSha256: sha256,
              changeLog: 'Arquivo enviado pela pasta do Windows e armazenado criptografado.',
            },
          ]),
          [],
          storagePath,
        ]
      );
    } catch (err) {
      deleteStoredFile(storagePath);
      throw err;
    }
    await this.audit(
      'DOCUMENT_UPLOADED',
      docId,
      name,
      `Arquivo enviado pela pasta do Windows para o setor ${c.deptName} (${size} bytes, SHA-256 ${sha256.slice(0, 12)}…).`
    );
    broadcastChange('documents', [this.user.id]);
    this.invalidate();
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
    return rows[0];
  }

  /** Salvar por cima: nova versão do mesmo documento (a anterior vai para a lixeira se tiver mais de 15 min). */
  async replaceDoc(doc: any, tempPath: string, size: number): Promise<any> {
    await this.load();
    if (!this.canEdit(doc)) {
      await this.audit('DOCUMENT_EDITED', doc.id, doc.name, 'Alteração pela pasta do Windows negada.', 'DENIED');
      throw new DavError(403, 'Você não tem permissão para alterar este arquivo.');
    }
    await this.checkContent(tempPath, size, doc.extension);

    // Mesmo conteúdo de antes (o Windows às vezes grava de novo sem mudar nada): nada a fazer
    const sha = await sha256File(tempPath);
    if (sha === doc.hash_sha256 && Number(doc.size_bytes) === size) return doc;

    await this.checkQuota(doc.department_id, size - Number(doc.size_bytes || 0));
    const versions: any[] = typeof doc.versions === 'string' ? JSON.parse(doc.versions) : doc.versions || [];
    const nextVersion = Math.max(Number(doc.current_version || 1), ...versions.map((v) => Number(v.versionNumber) || 0)) + 1;
    const { storagePath, sha256 } = await storeEncryptedFromTemp(
      tempPath,
      doc.department_id,
      `${doc.id}-v${nextVersion}-${crypto.randomBytes(3).toString('hex')}`
    );

    const oldSize = Number(doc.size_bytes || 0);
    const lastChange = doc.updated_at ? new Date(doc.updated_at).getTime() : 0;
    const keepPrevious = Boolean(doc.storage_path) && oldSize > 0 && Date.now() - lastChange > 15 * 60 * 1000;
    let previousId: string | null = null;

    try {
      if (keepPrevious) {
        previousId = 'doc-' + crypto.randomBytes(12).toString('hex');
        const stamp = new Date(lastChange || Date.now());
        const pad = (n: number) => String(n).padStart(2, '0');
        const label = `${pad(stamp.getDate())}-${pad(stamp.getMonth() + 1)}-${stamp.getFullYear()} ${pad(stamp.getHours())}h${pad(stamp.getMinutes())}`;
        const m = String(doc.name).match(/^(.*?)(\.[^.]{1,10})?$/);
        const previousName = `${m?.[1] || doc.name} (versão de ${label})${m?.[2] || ''}`;
        await pool.query(
          `INSERT INTO documents (
            id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name,
            owner_id, owner_name, hash_sha256, current_version, versions, status, scan_status, tags,
            storage_path, visibility, download_policy, delete_policy, trashed_at, trashed_by, trashed_by_name, trashed_path,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'trash', 'clean', $14, $15, $16, $17, $18,
                    NOW(), $19, $20, $21, $22, NOW())`,
          [
            previousId,
            previousName,
            doc.extension,
            doc.mime_type,
            oldSize,
            doc.folder_id,
            doc.department_id,
            doc.department_name,
            doc.owner_id,
            doc.owner_name,
            doc.hash_sha256,
            doc.current_version || 1,
            JSON.stringify(versions),
            doc.tags || [],
            doc.storage_path,
            doc.visibility || 'folder',
            doc.download_policy || 'folder',
            doc.delete_policy || 'folder',
            this.user.id,
            this.user.name,
            await this.folderPath(doc.folder_id),
            doc.created_at || new Date().toISOString(),
          ]
        );
      }

      versions.push({
        id: 'ver-' + crypto.randomBytes(6).toString('hex'),
        documentId: doc.id,
        versionNumber: nextVersion,
        versionLabel: `v${nextVersion}.0 (salvo pela pasta do Windows)`,
        createdAt: new Date().toISOString(),
        createdBy: this.user.name,
        sizeBytes: size,
        hashSha256: sha256,
        changeLog: keepPrevious ? 'Nova versão salva pela pasta do Windows; a anterior ficou na lixeira do setor.' : 'Nova versão salva pela pasta do Windows.',
      });
      await pool.query(
        `UPDATE documents SET storage_path = $1, size_bytes = $2, hash_sha256 = $3, current_version = $4, versions = $5, updated_at = NOW()
          WHERE id = $6`,
        [storagePath, size, sha256, nextVersion, JSON.stringify(versions.slice(-50)), doc.id]
      );
    } catch (err) {
      deleteStoredFile(storagePath);
      if (previousId) await pool.query('DELETE FROM documents WHERE id = $1', [previousId]).catch(() => {});
      throw err;
    }
    if (!keepPrevious) deleteStoredFile(doc.storage_path);

    await this.audit(
      'DOCUMENT_EDITED',
      doc.id,
      doc.name,
      `Nova versão (v${nextVersion}) salva pela pasta do Windows (${size} bytes).` +
        (keepPrevious ? ` A versão anterior ficou na lixeira do setor por ${TRASH_RETENTION_DAYS} dias.` : '')
    );
    broadcastChange('documents', [this.user.id]);
    this.invalidate();
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [doc.id]);
    return rows[0];
  }

  // ------------------------------------------------------------------ pastas
  async mkdir(c: DavContainer, rawName: string): Promise<void> {
    await this.load();
    const name = cleanFolderName(rawName);
    if (!name) throw new DavError(400, 'Nome de pasta inválido.');
    if (!can(this.user, 'CREATE_FOLDER', c.deptId, c.folderId, this.index!)) {
      throw new DavError(403, 'Você não tem permissão para criar pastas neste local.');
    }
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM folders WHERE department_id = $1 AND COALESCE(parent_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) LIMIT 1`,
      [c.deptId, c.folderId, name]
    );
    if (dup.length) throw new DavError(405, 'Já existe uma pasta com esse nome neste local.');
    const id = 'folder-' + crypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO folders (id, name, department_id, department_name, parent_id, description, is_locked, is_private, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, '', false, false, $6, NOW(), NOW())`,
      [id, name, c.deptId, c.deptName, c.folderId, this.user.id]
    );
    await this.audit('FOLDER_CREATED', id, name, `Pasta criada pela pasta do Windows no setor ${c.deptName}.`);
    broadcastChange('folders', [this.user.id]);
    this.invalidate();
  }

  async moveFolder(folder: FolderRowFull, dest: DavContainer, rawName: string): Promise<void> {
    await this.load();
    const name = cleanFolderName(rawName);
    if (!name) throw new DavError(400, 'Nome de pasta inválido.');
    const isManager = isDepartmentManager(this.user, folder.department_id);
    const isCreator = folder.created_by === this.user.id;
    const moving = (dest.folderId || null) !== (folder.parent_id || null) || dest.deptId !== folder.department_id;
    if (dest.deptId !== folder.department_id) throw new DavError(403, 'Uma pasta só pode ser movida dentro do próprio setor.');
    if (!isManager && !(isCreator && !moving)) {
      throw new DavError(403, moving ? 'Somente o gestor do setor ou a diretoria podem mover pastas.' : 'Somente quem criou a pasta ou a gestão do setor pode renomeá-la.');
    }
    if (moving && dest.folderId) {
      if (dest.folderId === folder.id) throw new DavError(403, 'Uma pasta não pode ficar dentro dela mesma.');
      let cursor = (await this.folderRow(dest.folderId))?.parent_id || null;
      for (let i = 0; cursor && i < 100; i++) {
        if (cursor === folder.id) throw new DavError(403, 'Não é possível mover uma pasta para dentro de uma subpasta dela.');
        cursor = (await this.folderRow(cursor))?.parent_id || null;
      }
    }
    await pool.query('UPDATE folders SET name = $1, parent_id = $2, updated_at = NOW() WHERE id = $3', [name, dest.folderId, folder.id]);
    const what = [name !== folder.name ? `renomeada para "${name}"` : '', moving ? 'movida de lugar' : ''].filter(Boolean).join(' e ');
    await this.audit('FOLDER_MOVED', folder.id, folder.name, `Pasta ${what || 'atualizada'} pela pasta do Windows.`);
    broadcastChange('folders', [this.user.id]);
    this.invalidate();
  }

  async deleteFolder(folder: FolderRowFull): Promise<void> {
    await this.load();
    const user = this.user;
    const manager = isDepartmentManager(user, folder.department_id);
    if (!manager && folder.created_by !== user.id && !can(user, 'DELETE_FOLDER', folder.department_id, folder.id, this.index!)) {
      throw new DavError(403, 'Você não tem permissão para excluir esta pasta.');
    }
    const all = [...this.folders!.values()].filter((f) => f.department_id === folder.department_id);
    const tree: string[] = [folder.id];
    for (let i = 0; i < tree.length; i++) all.filter((f) => f.parent_id === tree[i]).forEach((f) => tree.push(f.id));
    const { rows: docs } = await pool.query("SELECT * FROM documents WHERE folder_id = ANY($1::text[]) AND status <> 'trash'", [tree]);

    if (!manager) {
      const othersPrivate = tree.some((fid) => {
        const f = this.folders!.get(fid);
        return f && f.is_private && f.created_by !== user.id;
      });
      const blocked = docs.filter((d: any) => {
        const policy = docPolicyDecision(user, d, 'delete');
        return !(policy === null ? d.owner_id === user.id || can(user, 'DELETE_DOCUMENT', d.department_id, d.folder_id, this.index!) : policy);
      }).length;
      if (blocked > 0 || othersPrivate) {
        await this.audit('FOLDER_DELETED', folder.id, folder.name, 'Exclusão da pasta pela pasta do Windows negada: há conteúdo protegido.', 'DENIED');
        throw new DavError(403, 'A pasta tem conteúdo que você não pode excluir. Peça ao gestor do setor.');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const d of docs) {
        await client.query(
          `UPDATE documents SET status = 'trash', trashed_at = NOW(), trashed_by = $1, trashed_by_name = $2, trashed_path = $3, updated_at = NOW()
            WHERE id = $4`,
          [user.id, user.name, await this.folderPath(d.folder_id), d.id]
        );
      }
      await client.query(
        "UPDATE documents SET trashed_path = COALESCE(trashed_path, $2) WHERE folder_id = ANY($1::text[]) AND status = 'trash'",
        [tree, await this.folderPath(folder.id)]
      );
      await client.query('DELETE FROM folders WHERE id = ANY($1::text[])', [tree]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await this.audit(
      'FOLDER_DELETED',
      folder.id,
      folder.name,
      `Pasta excluída pela pasta do Windows com ${tree.length - 1} subpasta(s); ${docs.length} arquivo(s) foram para a lixeira (${TRASH_RETENTION_DAYS} dias).`
    );
    broadcastChange('folders', [this.user.id]);
    broadcastChange('documents', [this.user.id]);
    this.invalidate();
  }

  // ------------------------------------------------------------------ documentos (mover / excluir / copiar)
  async moveDoc(doc: any, dest: DavContainer, rawName: string): Promise<void> {
    await this.load();
    const user = this.user;
    const name = sanitizeFileName(rawName);
    if (!name) throw new DavError(400, 'Nome inválido.');
    const renaming = name !== doc.name;
    const moving = dest.deptId !== doc.department_id || (dest.folderId || null) !== (doc.folder_id || null);
    if (renaming) {
      if (getExtension(name) !== String(doc.extension).toLowerCase()) {
        throw new DavError(403, `Não é possível trocar a extensão do arquivo (.${doc.extension}).`);
      }
      if (!can(user, 'RENAME_DOCUMENT', doc.department_id, doc.folder_id, this.index!) && doc.owner_id !== user.id) {
        throw new DavError(403, 'Você não tem permissão para renomear este arquivo.');
      }
    }
    let deptName = doc.department_name;
    if (moving) {
      if (dest.deptId !== doc.department_id && !isDocAdmin(user)) {
        throw new DavError(403, 'Somente a Diretoria ou o Desenvolvedor podem mover arquivos entre setores.');
      }
      if (!can(user, 'MOVE_DOCUMENT', doc.department_id, doc.folder_id, this.index!) || !can(user, 'UPLOAD_DOCUMENT', dest.deptId, dest.folderId, this.index!)) {
        throw new DavError(403, 'Você não tem permissão para mover este arquivo para esse local.');
      }
      deptName = dest.deptName;
    }
    if (!renaming && !moving) return;
    await pool.query(
      'UPDATE documents SET name = $1, folder_id = $2, department_id = $3, department_name = $4, updated_at = NOW() WHERE id = $5',
      [name, dest.folderId, dest.deptId, deptName, doc.id]
    );
    const what = [renaming ? `renomeado para "${name}"` : '', moving ? 'movido de pasta' : ''].filter(Boolean).join(' e ');
    await this.audit('DOCUMENT_MOVED', doc.id, doc.name, `Documento ${what} pela pasta do Windows.`);
    broadcastChange('documents', [this.user.id]);
    this.invalidate();
  }

  async deleteDoc(doc: any): Promise<void> {
    await this.load();
    const user = this.user;
    const policy = docPolicyDecision(user, doc, 'delete');
    const allowed = policy === null ? can(user, 'DELETE_DOCUMENT', doc.department_id, doc.folder_id, this.index!) || doc.owner_id === user.id : policy;
    if (!allowed) {
      await this.audit('DOCUMENT_DELETED', doc.id, doc.name, 'Exclusão pela pasta do Windows negada.', 'DENIED');
      throw new DavError(403, 'Você não tem permissão para excluir este arquivo.');
    }
    await pool.query(
      `UPDATE documents SET status = 'trash', trashed_at = NOW(), trashed_by = $1, trashed_by_name = $2, trashed_path = $3, updated_at = NOW()
        WHERE id = $4`,
      [user.id, user.name, await this.folderPath(doc.folder_id), doc.id]
    );
    await this.audit(
      'DOCUMENT_DELETED',
      doc.id,
      doc.name,
      `Excluído pela pasta do Windows: foi para a lixeira do setor ${doc.department_name} (${TRASH_RETENTION_DAYS} dias).`
    );
    broadcastChange('documents', [this.user.id]);
    this.invalidate();
  }

  /** Copiar dentro da pasta do DocSecure (Ctrl+C / Ctrl+V no Explorador). */
  async copyDoc(doc: any, dest: DavContainer, rawName: string): Promise<void> {
    await this.load();
    if (!this.canDownload(doc)) throw new DavError(403, 'Você não tem permissão para copiar este arquivo.');
    ensureStorageDirs();
    const temp = `${UPLOAD_TMP_DIR}/dav-copy-${crypto.randomBytes(8).toString('hex')}`;
    try {
      await decryptToFile(doc.storage_path, temp);
      await this.createDoc(dest, rawName, temp, fs.statSync(temp).size);
    } finally {
      fs.rm(temp, { force: true }, () => {});
    }
  }
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (c) => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
