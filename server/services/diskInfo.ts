import fs from 'fs';
import path from 'path';

/**
 * Capacidade do disco onde os arquivos do DocSecure ficam guardados (pasta storage/ ou a raiz do servidor).
 * Usada para impedir que o limite de um setor seja maior do que o disco do servidor.
 */
export function getServerDisk(): { totalBytes: number; freeBytes: number; usedBytes: number } | null {
  try {
    if (typeof (fs as any).statfsSync !== 'function') return null;
    const candidates = [path.join(process.cwd(), 'storage'), process.cwd(), '/'];
    const target = candidates.find((p) => fs.existsSync(p)) || '/';
    const s = (fs as any).statfsSync(target);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bavail ?? s.bfree) * Number(s.bsize);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    return { totalBytes, freeBytes, usedBytes: totalBytes - Number(s.bfree) * Number(s.bsize) };
  } catch {
    return null;
  }
}
