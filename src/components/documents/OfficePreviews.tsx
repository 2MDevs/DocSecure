import React, { useMemo, useState } from 'react';
import { ChevronRight, Download, Lock, ArrowLeft, Search, Info } from 'lucide-react';
import type { ArchiveItem, DocBlock, DocRun, SheetPreview } from '../../services/apiClient';
import { FileGlyph, FolderGlyph, formatBytes } from './explorerGlyphs';

/**
 * Visualizações montadas a partir de dados simples vindos do servidor (nunca HTML do arquivo):
 * planilha (Excel/CSV), documento (Word) e conteúdo de compactados (ZIP/RAR).
 */

// ------------------------------------------------------------------ PLANILHA
const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export const SheetView: React.FC<{ sheets: SheetPreview[] }> = ({ sheets }) => {
  const [active, setActive] = useState(0);
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const cols = Math.max(sheet?.totalCols || 0, ...(sheet?.rows || []).map((r) => r.length), 1);
  const numeric = (v: string) => /^-?(R\$|US\$|€)?\s?[\d.]+(,\d+)?%?$/.test(v.trim());

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg overflow-hidden text-slate-800">
      {sheet?.truncated && (
        <div className="px-3 py-1.5 text-[11.5px] bg-amber-50 text-amber-800 border-b border-amber-200 shrink-0">
          Mostrando as primeiras {sheet.rows.length.toLocaleString('pt-BR')} linhas{sheet.totalRows ? ` de ${sheet.totalRows.toLocaleString('pt-BR')}` : ''}. Baixe o
          arquivo para ver tudo.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="border-collapse text-[12.5px] select-text">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-100 border border-slate-200 w-10 min-w-10" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="bg-slate-100 border border-slate-200 px-2 py-1 font-medium text-slate-500 min-w-[90px]">
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(sheet?.rows.length ? sheet.rows : [[]]).map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 bg-slate-100 border border-slate-200 px-2 text-right text-slate-500 tabular-nums">{r + 1}</td>
                {Array.from({ length: cols }, (_, c) => {
                  const v = row[c] || '';
                  return (
                    <td
                      key={c}
                      title={v.length > 40 ? v : undefined}
                      className={`border border-slate-200 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis align-top max-w-[420px] ${numeric(v) ? 'text-right tabular-nums' : ''}`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheets.length > 1 && (
        <div className="shrink-0 flex gap-0.5 overflow-x-auto bg-slate-100 border-t border-slate-200 px-1.5 pt-1">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`px-3 py-1.5 text-[12.5px] rounded-t-md whitespace-nowrap ${
                i === active ? 'bg-white text-emerald-700 font-semibold border border-b-0 border-slate-200' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** CSV vira planilha (separador detectado: ; , ou tab) */
export function csvToSheet(text: string, name = 'Planilha'): SheetPreview {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= 5000) break;
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return { name, rows, totalRows: rows.length, totalCols: Math.max(0, ...rows.map((r) => r.length)), truncated: rows.length >= 5000 };
}

// ------------------------------------------------------------------ WORD
const HEADING: Record<string, string> = {
  title: 'text-[28px] font-bold leading-tight mt-2 mb-4',
  subtitle: 'text-[18px] text-slate-500 mb-4',
  h1: 'text-[22px] font-bold mt-6 mb-2',
  h2: 'text-[18px] font-bold mt-5 mb-2',
  h3: 'text-[16px] font-semibold mt-4 mb-1.5',
  h4: 'text-[15px] font-semibold mt-3 mb-1',
  h5: 'text-[14px] font-semibold mt-3 mb-1',
  h6: 'text-[14px] font-semibold italic mt-3 mb-1',
};

const Runs: React.FC<{ runs: DocRun[]; imageUrl: (part: string) => string }> = ({ runs, imageUrl }) => (
  <>
    {runs.map((r, i) => {
      if (r.br) return <br key={i} />;
      if (r.img) return <img key={i} src={imageUrl(r.img)} alt={r.imgAlt || ''} className="inline-block max-w-full h-auto my-1 align-middle" loading="lazy" />;
      const cls = `${r.b ? 'font-bold' : ''} ${r.i ? 'italic' : ''} ${r.u ? 'underline' : ''} ${r.s ? 'line-through' : ''}`.trim();
      const text = r.text || '';
      if (r.href) {
        return (
          <a key={i} href={r.href} target="_blank" rel="noopener noreferrer nofollow" className={`${cls} text-blue-700 underline`}>
            {text}
          </a>
        );
      }
      return cls ? (
        <span key={i} className={cls}>
          {text}
        </span>
      ) : (
        <React.Fragment key={i}>{text}</React.Fragment>
      );
    })}
  </>
);

const Blocks: React.FC<{ blocks: DocBlock[]; imageUrl: (part: string) => string }> = ({ blocks, imageUrl }) => {
  // numeração das listas: conta itens seguidos do mesmo nível
  const counters: number[] = [];
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === 'table') {
          counters.length = 0;
          return (
            <div key={i} className="my-3 overflow-x-auto">
              <table className="border-collapse text-[13px] w-full">
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} colSpan={cell.span > 1 ? cell.span : undefined} className="border border-slate-300 px-2 py-1 align-top">
                          <Blocks blocks={cell.blocks} imageUrl={imageUrl} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const empty = !b.runs.length;
        const align = b.align ? ({ center: 'text-center', right: 'text-right', justify: 'text-justify' } as Record<string, string>)[b.align] || '' : '';
        if (b.list) {
          const lvl = b.list.level;
          counters.length = lvl + 1;
          counters[lvl] = (counters[lvl] || 0) + 1;
          return (
            <div key={i} className={`flex gap-2 my-0.5 ${align}`} style={{ paddingLeft: 18 + lvl * 22 }}>
              <span className="shrink-0 text-slate-600 min-w-4 text-right">{b.list.ordered ? `${counters[lvl]}.` : lvl % 2 ? '◦' : '•'}</span>
              <span className="min-w-0">
                <Runs runs={b.runs} imageUrl={imageUrl} />
              </span>
            </div>
          );
        }
        counters.length = 0;
        const cls = b.style ? HEADING[b.style] || '' : 'my-1.5 leading-relaxed';
        return (
          <p key={i} className={`${cls} ${align} whitespace-pre-wrap break-words`}>
            {empty ? ' ' : <Runs runs={b.runs} imageUrl={imageUrl} />}
          </p>
        );
      })}
    </>
  );
};

export const DocxView: React.FC<{ blocks: DocBlock[]; truncated?: boolean; imageUrl: (part: string) => string }> = ({ blocks, truncated, imageUrl }) => (
  <div className="w-full h-full overflow-auto">
    <div className="mx-auto max-w-[820px] bg-white text-slate-900 rounded-lg shadow-2xl px-6 sm:px-14 py-8 sm:py-12 text-[14.5px] select-text">
      <div className="mb-4 -mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" /> Visualização do texto do documento. O layout exato (cabeçalho, rodapé, margens) pode variar do Word.
      </div>
      {blocks.length ? <Blocks blocks={blocks} imageUrl={imageUrl} /> : <p className="text-slate-400">Documento sem texto.</p>}
      {truncated && <p className="mt-6 text-[12px] text-amber-700">Documento muito grande: mostrando só o início. Baixe para ver tudo.</p>}
    </div>
  </div>
);

// ------------------------------------------------------------------ COMPACTADOS
type Node = { name: string; path: string; isDir: boolean; size: number; encrypted: boolean; modifiedAt: string | null; count: number };

const formatDate = (v: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const ArchiveView: React.FC<{
  format: 'zip' | 'rar';
  items: ArchiveItem[];
  truncated: boolean;
  canDownload: boolean;
  onOpen: (item: ArchiveItem) => void;
  onDownload: (item: ArchiveItem) => void;
}> = ({ format, items, truncated, canDownload, onOpen, onDownload }) => {
  const [dir, setDir] = useState<string[]>([]);
  const [q, setQ] = useState('');

  // Monta as pastas a partir dos caminhos (nem todo .zip guarda as pastas como itens)
  const nodes = useMemo(() => {
    const prefix = dir.length ? dir.join('/') + '/' : '';
    const map = new Map<string, Node>();
    const query = q.trim().toLowerCase();
    for (const it of items) {
      if (query) {
        if (!it.isDir && it.path.toLowerCase().includes(query)) {
          map.set(it.path, { name: it.path, path: it.path, isDir: false, size: it.size, encrypted: it.encrypted, modifiedAt: it.modifiedAt, count: 0 });
        }
        continue;
      }
      if (!it.path.startsWith(prefix) || it.path === prefix.slice(0, -1)) continue;
      const rest = it.path.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      if (!head) continue;
      if (tail.length || it.isDir) {
        const key = prefix + head;
        const n = map.get(key) || { name: head, path: key, isDir: true, size: 0, encrypted: false, modifiedAt: null, count: 0 };
        if (!it.isDir) {
          n.size += it.size;
          n.count += 1;
        }
        map.set(key, n);
      } else {
        map.set(it.path, { name: head, path: it.path, isDir: false, size: it.size, encrypted: it.encrypted, modifiedAt: it.modifiedAt, count: 0 });
      }
    }
    return [...map.values()].sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) : a.isDir ? -1 : 1));
  }, [items, dir, q]);

  const files = items.filter((i) => !i.isDir);
  const total = files.reduce((s, i) => s + i.size, 0);
  const byPath = useMemo(() => new Map(items.map((i) => [i.path, i])), [items]);

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg overflow-hidden text-slate-800">
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!dir.length} onClick={() => setDir(dir.slice(0, -1))} className="h-8 w-8 rounded-md hover:bg-slate-100 disabled:opacity-30 inline-flex items-center justify-center" title="Voltar uma pasta">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-[160px] h-8 px-2 border border-slate-200 rounded-md flex items-center gap-0.5 text-[13px] overflow-x-auto whitespace-nowrap">
          <button type="button" onClick={() => setDir([])} className="px-1.5 py-0.5 rounded hover:bg-slate-100 font-medium">
            {format.toUpperCase()}
          </button>
          {dir.map((seg, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <button type="button" onClick={() => setDir(dir.slice(0, i + 1))} className="px-1.5 py-0.5 rounded hover:bg-slate-100">
                {seg}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="h-8 w-full sm:w-56 border border-slate-200 rounded-md flex items-center px-2 gap-1.5">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar no arquivo" className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-slate-500 border-b border-slate-200 text-left">
              <th className="py-1.5 px-3 font-normal">Nome</th>
              <th className="py-1.5 px-3 font-normal hidden sm:table-cell">Modificado em</th>
              <th className="py-1.5 px-3 font-normal text-right">Tamanho</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr
                key={n.path}
                className="hover:bg-blue-50 cursor-pointer"
                onClick={() => (n.isDir ? (setDir(n.path.split('/')), setQ('')) : byPath.get(n.path) && onOpen(byPath.get(n.path)!))}
              >
                <td className="py-1.5 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{n.isDir ? <FolderGlyph size={20} /> : <FileGlyph ext={(n.name.split('.').pop() || '').toLowerCase()} size={20} />}</span>
                    <span className="truncate">{n.name}</span>
                    {n.isDir && <span className="text-[11px] text-slate-400 shrink-0">({n.count})</span>}
                    {n.encrypted && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  </div>
                </td>
                <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap hidden sm:table-cell">{n.isDir ? '' : formatDate(n.modifiedAt)}</td>
                <td className="py-1.5 px-3 text-slate-500 text-right whitespace-nowrap tabular-nums">{formatBytes(n.size)}</td>
                <td className="px-1">
                  {!n.isDir && canDownload && !n.encrypted && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const it = byPath.get(n.path);
                        if (it) onDownload(it);
                      }}
                      className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-200 inline-flex items-center justify-center"
                      title="Baixar este item"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!nodes.length && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400">
                  {q ? 'Nenhum item corresponde à pesquisa.' : 'Pasta vazia.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 px-3 py-1.5 border-t border-slate-200 text-[12px] text-slate-500">
        {files.length.toLocaleString('pt-BR')} arquivo(s) • {formatBytes(total)} descompactado
        {truncated ? ' • lista muito grande, mostrando só parte' : ''}
        {!canDownload && ' • só visualização (download bloqueado)'}
      </div>
    </div>
  );
};
