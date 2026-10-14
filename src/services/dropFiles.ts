/**
 * Lê o que o usuário arrastou do computador (vários arquivos e/ou pastas inteiras)
 * ou escolheu no seletor do sistema, mantendo o caminho das subpastas.
 */
export type PickedFile = {
  file: File;
  /** Pastas até o arquivo, a partir do que foi solto. Ex.: ['Contratos', '2026'] */
  dirs: string[];
};

/** Arquivos de sistema que nunca devem ser enviados */
const IGNORED = /^(\.|~\$)|^(thumbs\.db|desktop\.ini|\.ds_store)$/i;

export const hasExternalFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types || []).includes('Files');

function readAllEntries(reader: any): Promise<any[]> {
  // O navegador devolve no máximo ~100 itens por chamada: lê até acabar
  return new Promise((resolve, reject) => {
    const all: any[] = [];
    const next = () =>
      reader.readEntries((batch: any[]) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

const entryFile = (entry: any): Promise<File> => new Promise((resolve, reject) => entry.file(resolve, reject));

async function walk(entry: any, dirs: string[], out: PickedFile[], folders: Set<string>) {
  if (!entry || IGNORED.test(entry.name)) return;
  if (entry.isFile) {
    out.push({ file: await entryFile(entry), dirs });
  } else if (entry.isDirectory) {
    const here = [...dirs, entry.name];
    folders.add(here.join('/'));
    const children = await readAllEntries(entry.createReader());
    for (const child of children) await walk(child, here, out, folders);
  }
}

/** Itens soltos na tela (arquivos e pastas). Precisa ser chamado direto no evento "drop". */
export async function collectFromDrop(dt: DataTransfer): Promise<{ files: PickedFile[]; folders: string[] }> {
  const out: PickedFile[] = [];
  const folders = new Set<string>();
  const items = Array.from(dt.items || []);
  // As "entradas" precisam ser obtidas antes de qualquer espera (await)
  const entries = items
    .filter((i) => i.kind === 'file')
    .map((i) => (typeof (i as any).webkitGetAsEntry === 'function' ? (i as any).webkitGetAsEntry() : null));

  if (entries.some(Boolean)) {
    for (const entry of entries) await walk(entry, [], out, folders);
  } else {
    // Navegador sem suporte a pastas: só arquivos soltos
    Array.from(dt.files || []).forEach((file) => !IGNORED.test(file.name) && out.push({ file, dirs: [] }));
  }
  return { files: out, folders: [...folders] };
}

/** Arquivos vindos do seletor do sistema (vários arquivos ou uma pasta inteira). */
export function collectFromInput(list: FileList | null): { files: PickedFile[]; folders: string[] } {
  const out: PickedFile[] = [];
  const folders = new Set<string>();
  Array.from(list || []).forEach((file) => {
    if (IGNORED.test(file.name)) return;
    const rel = ((file as any).webkitRelativePath as string) || '';
    const dirs = rel ? rel.split('/').slice(0, -1) : [];
    if (dirs.some((d) => IGNORED.test(d))) return;
    dirs.forEach((_, i) => folders.add(dirs.slice(0, i + 1).join('/')));
    out.push({ file, dirs });
  });
  return { files: out, folders: [...folders] };
}
