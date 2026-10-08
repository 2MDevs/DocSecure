import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { pool } from '../db';
import { requireAuth } from '../auth/middleware';

export const documentsRouter = Router();

// Configuração do Multer com limite de tamanho configurável
const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB || '50', 10);
const upload = multer({
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

documentsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let query = "SELECT * FROM documents WHERE status != 'trash' ORDER BY created_at DESC";
    let params: any[] = [];

    if (user.role !== 'DEVELOPER' && user.role !== 'DIRECTOR') {
      const permittedFolders = user.permittedFolderIds || [];
      if (user.role === 'MANAGER') {
        query =
          "SELECT * FROM documents WHERE status != 'trash' AND (department_id = $1 OR folder_id = ANY($2::text[])) ORDER BY created_at DESC";
        params = [user.departmentId, permittedFolders];
      } else {
        query =
          "SELECT * FROM documents WHERE status != 'trash' AND folder_id = ANY($1::text[]) ORDER BY created_at DESC";
        params = [permittedFolders];
      }
    }

    const { rows } = await pool.query(query, params);
    return res.json(
      rows.map((doc) => ({
        id: doc.id,
        name: doc.name,
        extension: doc.extension,
        mimeType: doc.mime_type,
        sizeBytes: parseInt(doc.size_bytes, 10),
        folderId: doc.folder_id,
        departmentId: doc.department_id,
        departmentName: doc.department_name,
        ownerId: doc.owner_id,
        ownerName: doc.owner_name,
        hashSha256: doc.hash_sha256,
        currentVersion: doc.current_version || 1,
        versions: typeof doc.versions === 'string' ? JSON.parse(doc.versions) : doc.versions || [],
        isFavorite: Boolean(doc.is_favorite),
        isArchived: Boolean(doc.is_archived),
        isShared: Boolean(doc.is_shared),
        contentSummary: doc.content_summary,
        status: doc.status,
        scanStatus: doc.scan_status,
        tags: doc.tags || [],
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }))
    );
  } catch (err: any) {
    console.error('[DOCUMENTS GET ERROR]', err);
    return res.status(503).json({ error: 'Erro ao listar documentos do banco de dados.' });
  }
});

// Upload multipart com cálculo do SHA-256 real do arquivo
documentsRouter.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const { folderId, departmentId, departmentName } = req.body;
    if (!folderId || !departmentId) {
      return res.status(400).json({ error: 'folderId e departmentId são obrigatórios.' });
    }

    const user = (req as any).user;
    const realSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const docId = 'doc-' + crypto.randomBytes(8).toString('hex');
    const extMatch = file.originalname.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extMatch ? extMatch[1].toLowerCase() : 'bin';

    await pool.query(
      `INSERT INTO documents (
        id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name,
        owner_id, owner_name, hash_sha256, current_version, status, scan_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, 'active', 'clean', NOW(), NOW())`,
      [
        docId,
        file.originalname,
        extension,
        file.mimetype || 'application/octet-stream',
        file.size,
        folderId,
        departmentId,
        departmentName || 'Geral',
        user.id,
        user.name,
        realSha256,
      ]
    );

    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
    return res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('[DOCUMENTS UPLOAD ERROR]', err);
    return res.status(500).json({ error: 'Falha no processamento do upload do arquivo.' });
  }
});

// Cadastro de Metadados de Documento
documentsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const doc = req.body;
    const user = (req as any).user;
    const docId = doc.id || 'doc-' + crypto.randomBytes(8).toString('hex');
    const realSha256 = doc.hashSha256 || crypto.createHash('sha256').update(doc.name + Date.now()).digest('hex');

    await pool.query(
      `INSERT INTO documents (
        id, name, extension, mime_type, size_bytes, folder_id, department_id, department_name,
        owner_id, owner_name, hash_sha256, current_version, versions, is_favorite, is_archived,
        is_shared, content_summary, status, scan_status, tags, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        size_bytes = EXCLUDED.size_bytes,
        folder_id = EXCLUDED.folder_id,
        updated_at = NOW()`,
      [
        docId,
        doc.name,
        doc.extension || 'pdf',
        doc.mimeType || 'application/pdf',
        doc.sizeBytes || 1024,
        doc.folderId,
        doc.departmentId,
        doc.departmentName,
        user.id,
        user.name,
        realSha256,
        doc.currentVersion || 1,
        JSON.stringify(doc.versions || []),
        doc.isFavorite || false,
        doc.isArchived || false,
        doc.isShared || false,
        doc.contentSummary || '',
        doc.status || 'active',
        doc.scanStatus || 'clean',
        doc.tags || [],
      ]
    );

    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
    return res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('[DOCUMENTS POST ERROR]', err);
    return res.status(500).json({ error: 'Erro ao cadastrar documento.' });
  }
});

// Alternar favorito do documento
documentsRouter.post('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE documents SET is_favorite = NOT is_favorite, updated_at = NOW() WHERE id = $1', [id]);
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    return res.json(rows[0]);
  } catch (err: any) {
    console.error('[DOCUMENTS FAVORITE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao alternar favorito.' });
  }
});

documentsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE documents SET status = 'trash', updated_at = NOW() WHERE id = $1", [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('[DOCUMENTS DELETE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao mover documento para lixeira.' });
  }
});
