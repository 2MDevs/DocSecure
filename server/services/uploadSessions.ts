/**
 * Envio em partes (arquivos grandes).
 *
 * O navegador abre uma "sessão de envio", manda o arquivo em pedaços pequenos (algumas MB cada)
 * e no final pede para concluir. Assim:
 *  - arquivos de centenas de MB (ex.: .zip/.rar) não esbarram no limite de tamanho por requisição do Nginx;
 *  - se a internet oscilar, só o pedaço que falhou é reenviado (não o arquivo inteiro);
 *  - cada pedaço é gravado direto no disco (nada fica na memória do servidor).
 *
 * As sessões ficam em memória; o conteúdo parcial fica em <UPLOAD_TMP_DIR>/chunked-<id>.
 * Sessões paradas por muito tempo (ou de antes de reiniciar o servidor) são apagadas sozinhas.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { UPLOAD_TMP_DIR, ensureStorageDirs } from './fileStorage';

/** Tamanho sugerido de cada pedaço (o navegador pode mandar menos, se o proxy recusar) */
export const CHUNK_BYTES = 4 * 1024 * 1024;
/** Maior pedaço aceito numa requisição */
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
/** Sessão sem receber nada por este tempo é descartada */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
/** Quantas sessões abertas ao mesmo tempo por pessoa */
const MAX_SESSIONS_PER_USER = 30;
const FILE_PREFIX = 'chunked-';

export type UploadMeta = {
  departmentId: string;
  folderId: string | null;
  name: string;
  size: number;
  onConflict: string;
  visibility?: string;
  downloadPolicy?: string;
  deletePolicy?: string;
  tags?: string;
};

export type UploadSession = {
  id: string;
  userId: string;
  meta: UploadMeta;
  tmpPath: string;
  received: number;
  updatedAt: number;
  busy: boolean;
};

export class UploadSessionError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const sessions = new Map<string, UploadSession>();

export function createUploadSession(userId: string, meta: UploadMeta): UploadSession {
  const mine = [...sessions.values()].filter((s) => s.userId === userId);
  if (mine.length >= MAX_SESSIONS_PER_USER) {
    // Libera as mais antigas (provavelmente abandonadas) antes de recusar
    mine
      .filter((s) => !s.busy && Date.now() - s.updatedAt > 10 * 60 * 1000)
      .forEach((s) => dropUploadSession(s.id));
    if ([...sessions.values()].filter((s) => s.userId === userId).length >= MAX_SESSIONS_PER_USER) {
      throw new UploadSessionError(429, 'Muitos envios abertos ao mesmo tempo. Aguarde alguns terminarem.');
    }
  }
  ensureStorageDirs();
  const id = crypto.randomBytes(16).toString('hex');
  const tmpPath = path.join(UPLOAD_TMP_DIR, FILE_PREFIX + id);
  fs.writeFileSync(tmpPath, Buffer.alloc(0), { mode: 0o600 });
  const session: UploadSession = { id, userId, meta, tmpPath, received: 0, updatedAt: Date.now(), busy: false };
  sessions.set(id, session);
  return session;
}

/** Só quem abriu a sessão pode usá-la */
export function getUploadSession(id: string, userId: string): UploadSession {
  const s = /^[a-f0-9]{32}$/.test(id) ? sessions.get(id) : undefined;
  if (!s || s.userId !== userId) {
    throw new UploadSessionError(404, 'O envio deste arquivo foi interrompido (sessão expirada). Ele será reiniciado.', {
      code: 'UPLOAD_SESSION_NOT_FOUND',
    });
  }
  return s;
}

/**
 * Grava um pedaço a partir de "offset".
 * - offset igual ao já recebido: continua normalmente;
 * - offset menor: o navegador reenviou um pedaço cuja resposta se perdeu → regrava a partir dali;
 * - offset maior: falta um pedaço → devolve 409 com o quanto já chegou, para o navegador retomar.
 */
export async function appendChunk(s: UploadSession, offset: number, body: NodeJS.ReadableStream): Promise<number> {
  if (s.busy) throw new UploadSessionError(409, 'Este pedaço já está sendo gravado.', { received: s.received });
  if (!Number.isInteger(offset) || offset < 0 || offset > s.received) {
    throw new UploadSessionError(409, 'Pedaço fora de ordem.', { received: s.received });
  }
  s.busy = true;
  try {
    if (offset < s.received) {
      fs.truncateSync(s.tmpPath, offset);
      s.received = offset;
    }
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > MAX_CHUNK_BYTES) return cb(new UploadSessionError(413, 'Pedaço maior que o permitido.'));
        if (s.received + bytes > s.meta.size) return cb(new UploadSessionError(400, 'O arquivo enviado é maior do que o informado.'));
        cb(null, chunk);
      },
    });
    try {
      await pipeline(body, limit, fs.createWriteStream(s.tmpPath, { flags: 'a', mode: 0o600 }));
    } catch (err) {
      // Pedaço incompleto (conexão caiu no meio): volta o arquivo para o último ponto bom
      try {
        fs.truncateSync(s.tmpPath, s.received);
      } catch {}
      throw err;
    }
    s.received += bytes;
    s.updatedAt = Date.now();
    return s.received;
  } finally {
    s.busy = false;
  }
}

/** Remove a sessão. Com keepFile, o arquivo temporário continua (quem concluiu o envio cuida dele). */
export function dropUploadSession(id: string, keepFile = false) {
  const s = sessions.get(id);
  sessions.delete(id);
  if (s && !keepFile) {
    try {
      fs.unlinkSync(s.tmpPath);
    } catch {}
  }
}

/** Apaga sessões paradas e arquivos parciais "órfãos" (ex.: de antes de reiniciar o servidor). */
export function cleanupUploadSessions(now = Date.now(), atStartup = false) {
  let removed = 0;
  for (const s of sessions.values()) {
    if (!s.busy && now - s.updatedAt > IDLE_TTL_MS) {
      dropUploadSession(s.id);
      removed++;
    }
  }
  try {
    const active = new Set([...sessions.values()].map((s) => path.basename(s.tmpPath)));
    for (const name of fs.readdirSync(UPLOAD_TMP_DIR)) {
      if (!name.startsWith(FILE_PREFIX) || active.has(name)) continue;
      const full = path.join(UPLOAD_TMP_DIR, name);
      try {
        if (atStartup || now - fs.statSync(full).mtimeMs > IDLE_TTL_MS) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {}
    }
  } catch {}
  return removed;
}

export function startUploadSessionCleanup() {
  // Na partida, nenhuma sessão existe: os parciais que sobraram são de antes de reiniciar
  cleanupUploadSessions(Date.now(), true);
  setInterval(() => cleanupUploadSessions(), 30 * 60 * 1000).unref();
}
