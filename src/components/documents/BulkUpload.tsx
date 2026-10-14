import React, { useMemo, useState } from 'react';
import { Upload, X, FolderUp, FileText, AlertTriangle, CheckCircle2, Loader2, XCircle, ChevronDown, ChevronUp, EyeOff } from 'lucide-react';
import type { DocSecurity } from '../../types';
import type { PickedFile } from '../../services/dropFiles';
import { SecurityFields, DEFAULT_SECURITY } from './SecurityFields';

/** Tipos que o servidor nunca aceita (executáveis/scripts) — já ficam de fora antes de enviar */
const BLOCKED = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jse', 'wsf', 'wsh',
  'jar', 'sh', 'bash', 'dll', 'sys', 'cpl', 'hta', 'lnk', 'reg', 'html', 'htm', 'xhtml', 'svg', 'php', 'phtml', 'asp',
  'aspx', 'jsp', 'app', 'dmg', 'apk', 'deb', 'rpm',
]);
export const isBlockedFile = (name: string) => BLOCKED.has((name.split('.').pop() || '').toLowerCase());
export const MAX_BULK_FILES = 1000;

const fmt = (bytes: number) =>
  bytes >= 1073741824
    ? `${(bytes / 1073741824).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
    : bytes >= 1048576
    ? `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ---------------------------------------------------------------------------
// 1) Confirmação: o que vai subir, para onde e com qual segurança
// ---------------------------------------------------------------------------
export const BulkUploadConfirm: React.FC<{
  files: PickedFile[];
  folders: string[];
  destination: string;
  online: boolean;
  onCancel: () => void;
  onConfirm: (opts: { security: Required<DocSecurity>; privateFolders: boolean }) => void;
}> = ({ files, folders, destination, online, onCancel, onConfirm }) => {
  const [security, setSecurity] = useState<Required<DocSecurity>>(DEFAULT_SECURITY);
  const [privateFolders, setPrivateFolders] = useState(false);
  const allowed = useMemo(() => files.filter((f) => !isBlockedFile(f.file.name)), [files]);
  const blocked = files.length - allowed.length;
  const total = allowed.reduce((s, f) => s + f.file.size, 0);
  const tooMany = allowed.length > MAX_BULK_FILES;
  const foldersOffline = folders.length > 0 && !online;
  const topLevel = useMemo(() => {
    const names = new Map<string, { isDir: boolean; count: number }>();
    allowed.forEach((f) => {
      const key = f.dirs[0] || f.file.name;
      const cur = names.get(key) || { isDir: f.dirs.length > 0, count: 0 };
      cur.count += 1;
      names.set(key, cur);
    });
    return [...names.entries()].slice(0, 8);
  }, [allowed]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6 bg-slate-950/50 animate-in fade-in duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onClick={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-label="Enviar vários arquivos" className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="md:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 shrink-0" />
        <div className="px-5 pt-3 md:pt-5 pb-3 flex items-start gap-3 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            {folders.length ? <FolderUp className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900">
              Enviar {allowed.length} {allowed.length === 1 ? 'arquivo' : 'arquivos'}
              {folders.length > 0 && ` em ${folders.length} ${folders.length === 1 ? 'pasta' : 'pastas'}`}
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5 truncate">
              Para: <strong className="text-slate-700">{destination}</strong> • {fmt(total)}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
            {topLevel.map(([name, info]) => (
              <li key={name} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                {info.isDir ? (
                  <svg viewBox="0 0 64 64" width={18} height={18} aria-hidden="true" className="shrink-0">
                    <path d="M4 14a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z" fill="#e0a526" />
                    <path d="M4 22h56v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#f8c94a" />
                  </svg>
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate text-slate-800">{name}</span>
                {info.isDir && <span className="text-[11.5px] text-slate-500 shrink-0">{info.count} arquivo(s)</span>}
              </li>
            ))}
            {allowed.length > 0 && topLevel.length === 8 && (
              <li className="px-3 py-2 text-[12px] text-slate-500">e mais itens…</li>
            )}
          </ul>

          {folders.length > 0 && (
            <p className="text-[12px] text-slate-500">
              As pastas e subpastas serão criadas com a mesma organização do seu computador. Se já existir uma pasta com o mesmo nome, os
              arquivos entram nela.
            </p>
          )}

          {blocked > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {blocked} {blocked === 1 ? 'arquivo não será enviado' : 'arquivos não serão enviados'} por segurança (programas e scripts, como .exe, .bat
              e .js, são bloqueados).
            </div>
          )}
          {tooMany && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-800">
              São muitos arquivos de uma vez. Envie no máximo {MAX_BULK_FILES.toLocaleString('pt-BR')} por vez.
            </div>
          )}
          {foldersOffline && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-800">
              Sem conexão com o servidor: pastas só podem ser enviadas com a conexão ativa.
            </div>
          )}

          <SecurityFields value={security} onChange={setSecurity} />

          {folders.length > 0 && (
            <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={privateFolders} onChange={(e) => setPrivateFolders(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-violet-600" />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  <EyeOff className="w-3.5 h-3.5 text-violet-600" /> Criar as pastas novas como privadas
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">Só você, a gestão do setor e a diretoria veem as pastas criadas.</span>
              </span>
            </label>
          )}
        </div>

        <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4 border-t border-slate-100 flex flex-col-reverse md:flex-row md:justify-end gap-2 shrink-0">
          <button type="button" onClick={onCancel} className="h-11 md:h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[14px] md:text-[13px] font-semibold text-slate-700">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!allowed.length || tooMany || foldersOffline}
            onClick={() => onConfirm({ security, privateFolders })}
            className="h-11 md:h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[14px] md:text-[13px] font-semibold inline-flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" /> Enviar {allowed.length} {allowed.length === 1 ? 'arquivo' : 'arquivos'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2) Progresso: painel no canto (no celular, acima da barra de abas)
// ---------------------------------------------------------------------------
export type BulkItemState = { name: string; path: string; status: 'wait' | 'up' | 'ok' | 'err'; error?: string; percent?: number };

export const BulkUploadPanel: React.FC<{
  items: BulkItemState[];
  foldersCreated: number;
  running: boolean;
  onClose: () => void;
}> = ({ items, foldersCreated, running, onClose }) => {
  const [open, setOpen] = useState(true);
  const done = items.filter((i) => i.status === 'ok').length;
  const failed = items.filter((i) => i.status === 'err').length;
  const finished = done + failed;
  const percent = items.length ? Math.round((items.reduce((s, i) => s + (i.status === 'ok' || i.status === 'err' ? 100 : i.percent || 0), 0) / (items.length * 100)) * 100) : 0;
  const title = running
    ? `Enviando ${Math.min(finished + 1, items.length)} de ${items.length}…`
    : failed
    ? `${done} enviado(s), ${failed} com erro`
    : `${done} ${done === 1 ? 'arquivo enviado' : 'arquivos enviados'}`;

  return (
    <div className="fixed z-[55] right-3 left-3 md:left-auto md:w-96 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-5 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        {running ? (
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
        ) : failed ? (
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-slate-900 truncate">{title}</div>
          <div className="text-[11.5px] text-slate-500">
            {foldersCreated > 0 ? `${foldersCreated} pasta(s) criada(s) • ` : ''}
            {percent}%
          </div>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label={open ? 'Recolher' : 'Expandir'}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {!running && (
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="h-1 bg-slate-100">
        <div className={`h-full transition-all ${failed && !running ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${percent}%` }} />
      </div>
      {open && (
        <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {items.map((it, i) => (
            <li key={i} className="px-4 py-2 flex items-center gap-2.5 text-[12.5px]">
              {it.status === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : it.status === 'err' ? (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              ) : it.status === 'up' ? (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block truncate text-slate-800">{it.name}</span>
                {(it.path || it.error) && (
                  <span className={`block truncate text-[11px] ${it.error ? 'text-rose-600' : 'text-slate-400'}`}>{it.error || it.path}</span>
                )}
              </span>
              {it.status === 'up' && typeof it.percent === 'number' && <span className="text-[11px] text-slate-500 tabular-nums">{it.percent}%</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
