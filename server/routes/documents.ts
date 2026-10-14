import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';
import { getEffectiveSetting } from '../services/systemSettings';
import {
  canAccess as can,
  isDepartmentManager,
  isDocAdmin,
  roleOf,
  loadFolderIndex,
  visibleFolderIds,
  documentVisible,
  docPolicyDecision,
  VISIBILITY_VALUES,
  DOWNLOAD_POLICY_VALUES,
  DELETE_POLICY_VALUES,
  toDocumentDto,
  writeAudit,
  getClientIp,
  TRASH_RETENTION_DAYS,
} from '../services/documentAccess';
import {
  UPLOAD_TMP_DIR,
  ensureStorageDirs,
  isFileStorageReady,
  storeEncryptedFromTemp,
  streamDecryptedTo,
  deleteStoredFile,
  removeTempFile,
  StorageKeyError,
} from '../services/fileStorage';

export const documentsRouter = Router();

// Extensões que nunca são aceitas (executáveis, scripts e páginas que poderiam rodar código no navegador)
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jse',
  'wsf', 'wsh', 'jar', 'sh', 'bash', 'dll', 'sys', 'cpl', 'hta', 'lnk', 'reg', 'html', 'htm', 'xhtml',
  'svg', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'app', 'dmg', 'apk', 'deb', 'rpm',
]);

// Assinatura (magic bytes) esperada para tipos comuns: impede renomear um arquivo para enganar o sistema
const MAGIC_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
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
const CONTENT_TYPES: Record<string, string> = {
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

function getExtension(fileName: string): string {
  const m = fileName.match(/\.([a-zA-Z0-9]{1,10})$/);
  return m ? m[1].toLowerCase() : '';
}

function sanitizeFileName(name: string): string {
  return String(name)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
}

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function getMaxUploadBytes(): Promise<number> {
  const raw = parseInt((await getEffectiveSetting('MAX_UPLOAD_MB')).value || '25', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 25;
  return mb * 1024 * 1024;
}

async function loadDocument(id: string) {
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0] || null;
}

async function loadFolder(id: string) {
  const { rows } = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// ARQUIVOS COM O MESMO NOME na mesma pasta: perguntar se substitui ou mantém os dois ("nome (1).pdf")
// ---------------------------------------------------------------------------
async function findSameName(departmentId: string, folderId: string | null, name: string) {
  const { rows } = await pool.query(
    `SELECT * FROM documents WHERE department_id = $1 AND COALESCE(folder_id, '') = COALESCE($2, '')
       AND LOWER(name) = LOWER($3) AND status <> 'trash' ORDER BY created_at DESC LIMIT 1`,
    [departmentId, folderId, name]
  );
  return rows[0] || null;
}

/** "Relatório.pdf" → "Relatório (1).pdf", "(2)"... o primeiro número livre na pasta */
async function nextFreeName(departmentId: string, folderId: string | null, name: string): Promise<string> {
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

/** Pode substituir = pode mandar o arquivo antigo para a lixeira */
async function canReplace(user: any, doc: any): Promise<boolean> {
  if (docPolicyDecision(user, doc, 'view') === false) return false;
  const policy = docPolicyDecision(user, doc, 'delete');
  return policy === null ? (await can(user, 'DELETE_DOCUMENT', doc.department_id, doc.folder_id)) || doc.owner_id === user.id : policy;
}

const userCtx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};

// ---------------------------------------------------------------------------
// LISTAGEM
// ---------------------------------------------------------------------------
documentsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const visible = await visibleFolderIds(user);
    const { rows } = await pool.query(`SELECT d.* FROM documents d WHERE d.status <> 'trash' ORDER BY d.created_at DESC`);
    return res.json(rows.filter((d: any) => documentVisible(user, d, visible)).map(toDocumentDto));
  } catch (err: any) {
    console.error('[DOCUMENTS GET ERROR]', err);
    return res.status(503).json({ error: 'Erro ao listar documentos do banco de dados.' });
  }
});

// Lixeira: cada setor tem a sua. Ninguém vê a lixeira de um setor ao qual não pertence.
documentsRouter.get('/trash', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const requestedDept = typeof req.query.departmentId === 'string' ? req.query.departmentId : '';
    let sql = "SELECT d.* FROM documents d WHERE d.status = 'trash'";
    const params: any[] = [];

    if (isDocAdmin(user)) {
      if (requestedDept) {
        params.push(requestedDept);
        sql += ` AND d.department_id = $${params.length}`;
      }
    } else if (roleOf(user) === 'MANAGER' || roleOf(user) === 'DEVELOPER') {
      params.push(user.departmentId);
      sql += ` AND d.department_id = $${params.length}`;
    } else {
      // Colaborador: somente itens do próprio setor que ele enviou ou excluiu
      params.push(user.departmentId, user.id);
      sql += ` AND d.department_id = $1 AND (d.owner_id = $2 OR d.trashed_by = $2)`;
    }

    sql += ' ORDER BY d.trashed_at DESC NULLS LAST';
    const { rows: all } = await pool.query(sql, params);
    const rows = all.filter((r: any) => docPolicyDecision(user, r, 'view') !== false);
    return res.json({
      retentionDays: TRASH_RETENTION_DAYS,
      items: rows.map((r) => ({ ...toDocumentDto(r), canPurge: isDepartmentManager(user, r.department_id) })),
    });
  } catch (err: any) {
    console.error('[DOCUMENTS TRASH LIST ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar a lixeira.' });
  }
});

// Antes de enviar: quais nomes já existem no destino?
documentsRouter.post('/check-names', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const departmentId = String(req.body?.departmentId || '');
    const folderId = req.body?.folderId ? String(req.body.folderId) : null;
    const names: string[] = Array.isArray(req.body?.names) ? req.body.names.slice(0, 1000).map((n: any) => sanitizeFileName(String(n))) : [];
    if (!departmentId || !names.length) return res.json({ conflicts: [] });
    if (!(await can(user, 'UPLOAD_DOCUMENT', departmentId, folderId))) return res.json({ conflicts: [] });

    const conflicts = [];
    for (const name of [...new Set(names)]) {
      const existing = await findSameName(departmentId, folderId, name);
      if (!existing) continue;
      const visible = docPolicyDecision(user, existing, 'view') !== false;
      conflicts.push({
        name,
        // Arquivo privado de outra pessoa: só avisamos que o nome está em uso, sem detalhes
        existing: visible
          ? { id: existing.id, ownerName: existing.owner_name, sizeBytes: Number(existing.size_bytes), updatedAt: existing.updated_at }
          : null,
        canReplace: visible && (await canReplace(user, existing)),
        suggestedName: await nextFreeName(departmentId, folderId, name),
      });
    }
    return res.json({ conflicts });
  } catch (err: any) {
    console.error('[DOCUMENTS CHECK NAMES ERROR]', err);
    return res.status(500).json({ error: 'Erro ao verificar nomes de arquivos.' });
  }
});

// ---------------------------------------------------------------------------
// UPLOAD (arquivo real, criptografado em disco)
// ---------------------------------------------------------------------------
async function receiveUpload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isFileStorageReady()) {
      return res.status(503).json({
        error:
          'Armazenamento seguro indisponível: configure a SETTINGS_ENCRYPTION_KEY no servidor antes de enviar arquivos.',
      });
    }
    ensureStorageDirs();
    const maxBytes = await getMaxUploadBytes();
    const uploader = multer({
      storage: multer.diskStorage({
        destination: UPLOAD_TMP_DIR,
        filename: (_req, _file, cb) => cb(null, 'up-' + crypto.randomBytes(16).toString('hex')),
      }),
      limits: { fileSize: maxBytes, files: 1, fields: 10 },
      defParamCharset: 'utf8',
    } as any);

    uploader.single('file')(req, res, (err: any) => {
      if (err) {
        removeTempFile((req as any).file?.path);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `O arquivo excede o limite de ${Math.round(maxBytes / 1048576)} MB.` });
        }
        return res.status(400).json({ error: 'Falha ao receber o arquivo enviado.' });
      }
      next();
    });
  } catch (err) {
    next(err);
  }
}

documentsRouter.post('/upload', requireAuth, receiveUpload, async (req: Request, res: Response) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  const user = (req as any).user;
  const ip = getClientIp(req);
  try {
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const departmentId = String(req.body.departmentId || '');
    const folderId = req.body.folderId ? String(req.body.folderId) : null;
    if (!departmentId) return res.status(400).json({ error: 'Informe o setor de destino.' });

    const { rows: deptRows } = await pool.query('SELECT * FROM departments WHERE id = $1', [departmentId]);
    const dept = deptRows[0];
    if (!dept) return res.status(404).json({ error: 'Setor de destino não encontrado.' });

    if (folderId) {
      const folder = await loadFolder(folderId);
      if (!folder || folder.department_id !== departmentId) {
        return res.status(400).json({ error: 'A pasta de destino não pertence a este setor.' });
      }
    }

    if (!await can(user, 'UPLOAD_DOCUMENT', departmentId, folderId)) {
      await writeAudit(userCtx(req), 'DOCUMENT_UPLOADED', '', file.originalname, `Envio negado para o setor ${dept.name}.`, 'DENIED', ip);
      return res.status(403).json({ error: 'Você não tem permissão para enviar arquivos neste local.' });
    }

    // Nome final: o usuário pode renomear, mas a extensão real do arquivo é mantida
    const originalName = sanitizeFileName(file.originalname) || 'arquivo';
    const extension = getExtension(originalName);
    if (!extension) return res.status(400).json({ error: 'O arquivo precisa ter uma extensão (ex: .pdf, .png).' });
    if (BLOCKED_EXTENSIONS.has(extension)) {
      return res.status(415).json({ error: `Arquivos .${extension} não são permitidos por segurança.` });
    }

    let displayName = req.body.name ? sanitizeFileName(String(req.body.name)) : originalName;
    if (!displayName) displayName = originalName;
    if (getExtension(displayName) !== extension) {
      displayName = `${displayName.replace(/\.[a-zA-Z0-9]{1,10}$/, '')}.${extension}`;
    }

    // Já existe um arquivo com este nome nesta pasta?
    //  replace = o antigo vai para a lixeira (7 dias) e o novo ocupa o lugar
    //  rename (padrão) = o novo recebe "(1)", "(2)"... no nome
    const onConflict = String(req.body.onConflict || 'rename');
    let replacedDoc: any = null;
    const sameName = await findSameName(departmentId, folderId, displayName);
    if (sameName) {
      if (onConflict === 'replace') {
        if (!(await canReplace(user, sameName))) {
          return res.status(403).json({ error: `Você não pode substituir "${sameName.name}". Envie com outro nome ou peça à gestão do setor.` });
        }
        replacedDoc = sameName;
      } else {
        displayName = await nextFreeName(departmentId, folderId, displayName);
      }
    }

    // Confere se o conteúdo corresponde à extensão (ex.: um .png precisa ser realmente um PNG)
    const check = MAGIC_SIGNATURES[extension];
    if (check) {
      const head = Buffer.alloc(16);
      const fd = fs.openSync(file.path, 'r');
      try {
        fs.readSync(fd, head, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (!check(head)) {
        return res.status(415).json({ error: `O conteúdo do arquivo não corresponde a um .${extension} válido.` });
      }
    }

    // Quota do setor
    const { rows: usage } = await pool.query(
      'SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM documents WHERE department_id = $1',
      [departmentId]
    );
    const limit = Number(dept.storage_limit_bytes || 0);
    if (limit > 0 && Number(usage[0].used) + file.size > limit) {
      return res.status(507).json({ error: `A quota de armazenamento do setor ${dept.name} foi atingida.` });
    }

    const docId = 'doc-' + crypto.randomBytes(12).toString('hex');
    const { storagePath, sha256 } = await storeEncryptedFromTemp(file.path, departmentId, docId);
    const tags = String(req.body.tags || '')
      .split(',')
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 15);
    // Segurança definida no momento do envio (padrão: segue a pasta)
    const pick = (v: unknown, allowed: string[]) => (allowed.includes(String(v)) ? String(v) : 'folder');
    const visibility = pick(req.body.visibility, VISIBILITY_VALUES);
    const downloadPolicy = pick(req.body.downloadPolicy, DOWNLOAD_POLICY_VALUES);
    const deletePolicy = pick(req.body.deletePolicy, DELETE_POLICY_VALUES);

    try {
      await pool.query(
        `INSERT INTO documents (
          id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name,
          owner_id, owner_name, hash_sha256, current_version, versions, status, scan_status, tags,
          storage_path, visibility, download_policy, delete_policy, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, 'active', 'clean', $13, $14, $15, $16, $17, NOW(), NOW())`,
        [
          docId,
          displayName,
          extension,
          CONTENT_TYPES[extension] || 'application/octet-stream',
          file.size,
          folderId,
          departmentId,
          dept.name,
          user.id,
          user.name,
          sha256,
          JSON.stringify([
            {
              id: 'ver-' + crypto.randomBytes(6).toString('hex'),
              documentId: docId,
              versionNumber: 1,
              versionLabel: 'v1.0 (envio original)',
              createdAt: new Date().toISOString(),
              createdBy: user.name,
              sizeBytes: file.size,
              hashSha256: sha256,
              changeLog: 'Arquivo original enviado e armazenado criptografado.',
            },
          ]),
          tags,
          storagePath,
          visibility,
          downloadPolicy,
          deletePolicy,
        ]
      );
    } catch (dbErr) {
      deleteStoredFile(storagePath);
      throw dbErr;
    }

    if (replacedDoc) {
      await pool.query(
        `UPDATE documents SET status = 'trash', trashed_at = NOW(), trashed_by = $1, trashed_by_name = $2, updated_at = NOW() WHERE id = $3`,
        [user.id, user.name, replacedDoc.id]
      );
      await writeAudit(
        userCtx(req),
        'DOCUMENT_DELETED',
        replacedDoc.id,
        replacedDoc.name,
        `Substituído por um novo envio com o mesmo nome; a versão anterior ficou na lixeira do setor por ${TRASH_RETENTION_DAYS} dias.`,
        'SUCCESS',
        ip
      );
    }

    await writeAudit(
      userCtx(req),
      'DOCUMENT_UPLOADED',
      docId,
      displayName,
      `Arquivo enviado para o setor ${dept.name} (${file.size} bytes, SHA-256 ${sha256.slice(0, 12)}…)` +
        (visibility !== 'folder' || downloadPolicy !== 'folder' || deletePolicy !== 'folder'
          ? ` com segurança: visível=${visibility}, download=${downloadPolicy}, exclusão=${deletePolicy}.`
          : '.'),
      'SUCCESS',
      ip
    );

    const saved = await loadDocument(docId);
    return res.status(201).json({ ...toDocumentDto(saved), replacedDocumentId: replacedDoc?.id || null });
  } catch (err: any) {
    if (err instanceof StorageKeyError) return res.status(503).json({ error: err.message });
    console.error('[DOCUMENTS UPLOAD ERROR]', err);
    return res.status(500).json({ error: 'Falha ao processar o envio do arquivo.' });
  } finally {
    removeTempFile(file?.path);
  }
});

// ---------------------------------------------------------------------------
// CONTEÚDO (visualizar / baixar) — sempre descriptografado sob demanda
// ---------------------------------------------------------------------------
documentsRouter.get('/:id/content', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const isDownload = req.query.download === '1';
  try {
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status === 'trash') return res.status(404).json({ error: 'Documento não encontrado.' });

    const perm = isDownload ? 'DOWNLOAD_DOCUMENT' : 'VIEW_DOCUMENT';
    const policy = docPolicyDecision(user, doc, isDownload ? 'download' : 'view');
    const viewOk = docPolicyDecision(user, doc, 'view') !== false;
    const allowedByRules =
      viewOk &&
      (policy === null
        ? await can(user, perm, doc.department_id, doc.folder_id)
        : policy && (await can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id) || doc.owner_id === user.id || isDepartmentManager(user, doc.department_id)));
    if (!allowedByRules) {
      await writeAudit(
        userCtx(req),
        isDownload ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_VIEWED',
        doc.id,
        doc.name,
        'Acesso negado ao conteúdo do documento.',
        'DENIED',
        getClientIp(req)
      );
      return res.status(403).json({
        error: isDownload
          ? doc.download_policy === 'none'
            ? 'O download deste arquivo está bloqueado: ele pode apenas ser visualizado.'
            : 'Você não tem permissão para baixar este documento.'
          : 'Você não tem permissão para visualizar este documento.',
      });
    }

    if (!doc.storage_path) {
      return res.status(410).json({
        error:
          'Este registro foi criado por uma versão antiga do sistema e não possui o arquivo armazenado. Exclua-o e envie o arquivo novamente.',
      });
    }

    await writeAudit(
      userCtx(req),
      isDownload ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_VIEWED',
      doc.id,
      doc.name,
      isDownload ? 'Download do arquivo original.' : 'Pré-visualização do arquivo.',
      'SUCCESS',
      getClientIp(req)
    );

    res.setHeader('Content-Type', CONTENT_TYPES[doc.extension] || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(doc.name));
    res.setHeader('Content-Length', String(doc.size_bytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Document-Sha256', doc.hash_sha256);

    await streamDecryptedTo(doc.storage_path, res);
  } catch (err: any) {
    console.error('[DOCUMENTS CONTENT ERROR]', err?.message || err);
    if (!res.headersSent) {
      if (err instanceof StorageKeyError) return res.status(503).json({ error: err.message });
      if (err?.code === 'ENOENT') {
        return res.status(410).json({ error: 'O arquivo não foi encontrado no armazenamento do servidor.' });
      }
      return res.status(500).json({ error: 'Falha ao ler o arquivo. A integridade pode ter sido comprometida.' });
    }
    res.destroy();
  }
});

// ---------------------------------------------------------------------------
// MOVER / RENOMEAR / TAGS
// ---------------------------------------------------------------------------
documentsRouter.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status === 'trash' || docPolicyDecision(user, doc, 'view') === false) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    const changes: string[] = [];

    if (req.body.folderId !== undefined) {
      const targetFolderId = req.body.folderId ? String(req.body.folderId) : null;
      let targetDeptId = doc.department_id;
      let targetDeptName = doc.department_name;
      if (targetFolderId) {
        const target = await loadFolder(targetFolderId);
        if (!target) return res.status(404).json({ error: 'Pasta de destino não encontrada.' });
        targetDeptId = target.department_id;
        targetDeptName = target.department_name;
      } else if (req.body.departmentId) {
        targetDeptId = String(req.body.departmentId);
      }
      if (targetDeptId !== doc.department_id && !isDocAdmin(user)) {
        return res.status(403).json({ error: 'Somente a Diretoria ou o Desenvolvedor podem mover arquivos entre setores.' });
      }
      if (
        !await can(user, 'MOVE_DOCUMENT', doc.department_id, doc.folder_id) ||
        !await can(user, 'UPLOAD_DOCUMENT', targetDeptId, targetFolderId)
      ) {
        return res.status(403).json({ error: 'Você não tem permissão para mover este documento para esse local.' });
      }
      params.push(targetFolderId, targetDeptId, targetDeptName);
      updates.push(`folder_id = $${params.length - 2}, department_id = $${params.length - 1}, department_name = $${params.length}`);
      changes.push('movido de pasta');
    }

    if (req.body.name !== undefined) {
      if (!await can(user, 'RENAME_DOCUMENT', doc.department_id, doc.folder_id) && doc.owner_id !== user.id) {
        return res.status(403).json({ error: 'Você não tem permissão para renomear este documento.' });
      }
      let newName = sanitizeFileName(String(req.body.name));
      if (!newName) return res.status(400).json({ error: 'Nome inválido.' });
      if (getExtension(newName) !== doc.extension) {
        newName = `${newName.replace(/\.[a-zA-Z0-9]{1,10}$/, '')}.${doc.extension}`;
      }
      params.push(newName);
      updates.push(`name = $${params.length}`);
      changes.push(`renomeado para "${newName}"`);
    }

    if (Array.isArray(req.body.tags)) {
      if (!await can(user, 'EDIT_DOCUMENT', doc.department_id, doc.folder_id) && doc.owner_id !== user.id) {
        return res.status(403).json({ error: 'Você não tem permissão para editar as tags deste documento.' });
      }
      params.push(req.body.tags.map((t: any) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 15));
      updates.push(`tags = $${params.length}`);
      changes.push('tags atualizadas');
    }

    if (updates.length === 0) return res.json(toDocumentDto(doc));

    params.push(doc.id);
    await pool.query(`UPDATE documents SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
    await writeAudit(userCtx(req), 'DOCUMENT_MOVED', doc.id, doc.name, `Documento ${changes.join(', ')}.`, 'SUCCESS', getClientIp(req));

    return res.json(toDocumentDto(await loadDocument(doc.id)));
  } catch (err: any) {
    console.error('[DOCUMENTS PATCH ERROR]', err);
    return res.status(500).json({ error: 'Erro ao atualizar documento.' });
  }
});

// ---------------------------------------------------------------------------
// SEGURANÇA DO ARQUIVO (Propriedades → Segurança): só quem enviou ou a gestão do setor/diretoria
// ---------------------------------------------------------------------------
documentsRouter.put('/:id/security', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status === 'trash' || docPolicyDecision(user, doc, 'view') === false) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }
    const manager = isDepartmentManager(user, doc.department_id);
    if (doc.owner_id !== user.id && !manager) {
      await writeAudit(userCtx(req), 'DOCUMENT_SECURITY_CHANGED', doc.id, doc.name, 'Alteração de segurança negada.', 'DENIED', getClientIp(req));
      return res.status(403).json({ error: 'Somente quem enviou o arquivo ou a gestão do setor podem alterar a segurança dele.' });
    }
    const { visibility, downloadPolicy, deletePolicy } = req.body || {};
    if (
      (visibility !== undefined && !VISIBILITY_VALUES.includes(visibility)) ||
      (downloadPolicy !== undefined && !DOWNLOAD_POLICY_VALUES.includes(downloadPolicy)) ||
      (deletePolicy !== undefined && !DELETE_POLICY_VALUES.includes(deletePolicy))
    ) {
      return res.status(400).json({ error: 'Opção de segurança inválida.' });
    }
    await pool.query(
      `UPDATE documents SET
         visibility = COALESCE($1, visibility),
         download_policy = COALESCE($2, download_policy),
         delete_policy = COALESCE($3, delete_policy),
         updated_at = NOW()
       WHERE id = $4`,
      [visibility ?? null, downloadPolicy ?? null, deletePolicy ?? null, doc.id]
    );
    const updated = await loadDocument(doc.id);
    const label: Record<string, string> = {
      folder: 'padrão da pasta', private: 'somente o dono e a gestão', owner: 'somente o dono e a gestão',
      none: 'ninguém (só visualizar)', managers: 'somente a gestão',
    };
    await writeAudit(
      userCtx(req),
      'DOCUMENT_SECURITY_CHANGED',
      doc.id,
      doc.name,
      `Segurança do arquivo: visível para ${label[updated.visibility] || updated.visibility}; download: ${label[updated.download_policy]}; exclusão: ${label[updated.delete_policy]}.`,
      'SUCCESS',
      getClientIp(req)
    );
    return res.json(toDocumentDto(updated));
  } catch (err: any) {
    console.error('[DOCUMENTS SECURITY ERROR]', err);
    return res.status(500).json({ error: 'Erro ao salvar a segurança do arquivo.' });
  }
});

documentsRouter.post('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || docPolicyDecision(user, doc, 'view') === false || !await can(user, 'VIEW_DOCUMENT', doc.department_id, doc.folder_id)) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }
    await pool.query('UPDATE documents SET is_favorite = NOT is_favorite, updated_at = NOW() WHERE id = $1', [doc.id]);
    return res.json(toDocumentDto(await loadDocument(doc.id)));
  } catch (err: any) {
    console.error('[DOCUMENTS FAVORITE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao alternar favorito.' });
  }
});

// ---------------------------------------------------------------------------
// LIXEIRA: excluir → 7 dias na lixeira do setor → apagado do servidor
// ---------------------------------------------------------------------------
documentsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status === 'trash') return res.status(404).json({ error: 'Documento não encontrado.' });

    const policy = docPolicyDecision(user, doc, 'delete');
    const allowed =
      policy === null ? (await can(user, 'DELETE_DOCUMENT', doc.department_id, doc.folder_id)) || doc.owner_id === user.id : policy;
    if (!allowed) {
      await writeAudit(userCtx(req), 'DOCUMENT_DELETED', doc.id, doc.name, 'Exclusão negada.', 'DENIED', getClientIp(req));
      return res.status(403).json({ error: 'Você não tem permissão para excluir este documento.' });
    }

    await pool.query(
      `UPDATE documents SET status = 'trash', trashed_at = NOW(), trashed_by = $1, trashed_by_name = $2, updated_at = NOW()
       WHERE id = $3`,
      [user.id, user.name, doc.id]
    );
    await writeAudit(
      userCtx(req),
      'DOCUMENT_DELETED',
      doc.id,
      doc.name,
      `Enviado para a lixeira do setor ${doc.department_name}. Exclusão definitiva em ${TRASH_RETENTION_DAYS} dias.`,
      'SUCCESS',
      getClientIp(req)
    );
    return res.json({ success: true, document: toDocumentDto(await loadDocument(doc.id)) });
  } catch (err: any) {
    console.error('[DOCUMENTS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao mover documento para a lixeira.' });
  }
});

documentsRouter.post('/:id/restore', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status !== 'trash') return res.status(404).json({ error: 'Item não encontrado na lixeira.' });

    const allowed =
      isDepartmentManager(user, doc.department_id) ||
      await can(user, 'DELETE_DOCUMENT', doc.department_id, doc.folder_id) ||
      (user.departmentId === doc.department_id && (doc.trashed_by === user.id || doc.owner_id === user.id));
    if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para restaurar este documento.' });

    // Se a pasta original foi excluída, recria o caminho (Pasta › Subpasta) com os mesmos nomes;
    // sem caminho conhecido, o arquivo volta para a raiz do setor
    let folderId = doc.folder_id;
    let recreated = 0;
    if (folderId) {
      const folder = await loadFolder(folderId);
      if (!folder || folder.department_id !== doc.department_id) folderId = null;
    }
    if (!folderId && doc.trashed_path) {
      const { rows: deptRows } = await pool.query('SELECT name FROM departments WHERE id = $1', [doc.department_id]);
      let parent: string | null = null;
      for (const name of String(doc.trashed_path).split('/').filter(Boolean)) {
        const { rows } = await pool.query(
          `SELECT id FROM folders WHERE department_id = $1 AND COALESCE(parent_id, '') = COALESCE($2, '') AND LOWER(name) = LOWER($3) LIMIT 1`,
          [doc.department_id, parent, name]
        );
        if (rows[0]) {
          parent = rows[0].id;
        } else {
          const newId = 'folder-' + crypto.randomBytes(8).toString('hex');
          await pool.query(
            `INSERT INTO folders (id, name, department_id, department_name, parent_id, description, is_locked, is_private, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, '', false, false, $6, NOW(), NOW())`,
            [newId, name, doc.department_id, deptRows[0]?.name || doc.department_name, parent, user.id]
          );
          parent = newId;
          recreated++;
        }
      }
      folderId = parent;
    }

    await pool.query(
      `UPDATE documents SET status = 'active', folder_id = $1, trashed_at = NULL, trashed_by = NULL, trashed_by_name = NULL,
       trashed_path = NULL, updated_at = NOW() WHERE id = $2`,
      [folderId, doc.id]
    );
    await writeAudit(
      userCtx(req),
      'DOCUMENT_RESTORED',
      doc.id,
      doc.name,
      folderId
        ? recreated
          ? `Restaurado da lixeira; ${recreated} pasta(s) do caminho original foram recriadas.`
          : 'Restaurado da lixeira para a pasta original.'
        : 'Restaurado da lixeira para a raiz do setor.',
      'SUCCESS',
      getClientIp(req)
    );
    return res.json(toDocumentDto(await loadDocument(doc.id)));
  } catch (err: any) {
    console.error('[DOCUMENTS RESTORE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao restaurar documento.' });
  }
});

documentsRouter.delete('/:id/permanent', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const doc = await loadDocument(req.params.id);
    if (!doc || doc.status !== 'trash') return res.status(404).json({ error: 'Item não encontrado na lixeira.' });
    if (!isDepartmentManager(user, doc.department_id)) {
      return res.status(403).json({ error: 'Somente o gestor do setor, a Diretoria ou o Desenvolvedor podem excluir definitivamente.' });
    }

    await purgeDocument(doc, userCtx(req), 'Excluído definitivamente da lixeira antes do prazo.', getClientIp(req));
    return res.json({ success: true, deletedId: doc.id });
  } catch (err: any) {
    console.error('[DOCUMENTS PURGE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao excluir definitivamente.' });
  }
});

async function purgeDocument(doc: any, actor: any, details: string, ip = 'servidor') {
  deleteStoredFile(doc.storage_path);
  await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]);
  await writeAudit(actor, 'DOCUMENT_PURGED', doc.id, doc.name, `${details} Setor: ${doc.department_name}.`, 'SUCCESS', ip, 'Servidor');
}

/** Apaga do banco e do disco tudo o que está na lixeira há mais de 7 dias. */
export async function purgeExpiredTrash(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT * FROM documents WHERE status = 'trash' AND trashed_at < NOW() - ($1 || ' days')::interval`,
    [String(TRASH_RETENTION_DAYS)]
  );
  for (const doc of rows) {
    try {
      await purgeDocument(doc, null, `Prazo de ${TRASH_RETENTION_DAYS} dias na lixeira expirado: arquivo apagado do servidor.`);
    } catch (e) {
      console.error('[TRASH PURGE ERROR]', doc.id, e);
    }
  }
  if (rows.length > 0) console.log(`[TRASH] ${rows.length} documento(s) apagado(s) definitivamente.`);
  return rows.length;
}

export function startTrashPurgeJob() {
  const run = () => purgeExpiredTrash().catch((e) => console.error('[TRASH PURGE JOB ERROR]', e));
  setTimeout(run, 30_000);
  setInterval(run, 60 * 60 * 1000).unref();
}
