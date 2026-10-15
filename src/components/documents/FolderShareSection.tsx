import React, { useEffect, useRef, useState } from 'react';
import { Users, Search, X, Loader2, Check, Download, Eye } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { Folder, FolderShare, User } from '../../types';

/**
 * Compartilhar a pasta com pessoas de outras áreas (só visualizar, ou visualizar e baixar).
 * Quem recebe vê a pasta em "Compartilhados" e não pode enviar, alterar nem excluir nada.
 */
export const FolderShareSection: React.FC<{ folder: Folder; currentUser: User; canManage: boolean }> = ({ folder, currentUser, canManage }) => {
  const [shares, setShares] = useState<FolderShare[] | null>(null);
  const [initial, setInitial] = useState<string>('[]');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; email: string; departmentName: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!canManage) return;
    apiClient
      .getFolderShares(folder.id)
      .then((list) => {
        setShares(list);
        setInitial(JSON.stringify(list.map((s) => [s.userId, s.canDownload])));
      })
      .catch((e) => {
        setShares([]);
        setError(e?.message || 'Não foi possível carregar os compartilhamentos.');
      });
  }, [folder.id, canManage]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      setSearching(true);
      apiClient
        .searchPeople(q.trim())
        .then((r) => setResults(r.filter((p) => p.id !== currentUser.id)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, [q, currentUser.id]);

  if (!canManage) {
    return folder.sharedWithMe ? (
      <div className="p-3 rounded-xl bg-sky-50 border border-sky-100 text-[12.5px] text-sky-900 flex gap-2">
        <Users className="w-4 h-4 shrink-0 mt-0.5" />
        Esta pasta foi compartilhada com você ({folder.sharedCanDownload ? 'pode visualizar e baixar' : 'somente visualizar'}).
      </div>
    ) : null;
  }

  const dirty = shares !== null && JSON.stringify(shares.map((s) => [s.userId, s.canDownload])) !== initial;

  const add = (p: { id: string; name: string; email: string; departmentName: string }) => {
    setShares((prev) => (prev?.some((s) => s.userId === p.id) ? prev : [...(prev || []), { userId: p.id, name: p.name, email: p.email, departmentName: p.departmentName, canDownload: true }]));
    setQ('');
    setResults([]);
  };

  const save = async () => {
    if (!shares) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.setFolderShares(folder.id, shares.map((s) => ({ userId: s.userId, canDownload: s.canDownload })));
      setInitial(JSON.stringify(shares.map((s) => [s.userId, s.canDownload])));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="space-y-2.5">
      <legend className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 mb-2">
        <Users className="w-4 h-4 text-blue-600" /> Compartilhar com pessoas de outras áreas
      </legend>
      <p className="text-[12px] text-slate-500 -mt-1">
        Quem você adicionar verá esta pasta (e o que estiver dentro) em <strong>Compartilhados</strong>. Não pode enviar, alterar nem excluir.
      </p>

      <div className="relative">
        <div className="h-10 rounded-xl border border-slate-200 bg-white flex items-center px-3 gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pessoa por nome, e-mail ou setor"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
          />
          {searching && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        </div>
        {results.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
            {results.map((p) => {
              const already = shares?.some((s) => s.userId === p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => add(p)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-slate-900 truncate">{p.name}</span>
                      <span className="block text-[11.5px] text-slate-500 truncate">
                        {p.departmentName} • {p.email}
                      </span>
                    </span>
                    {already && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {shares === null ? (
        <div className="text-[12px] text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
        </div>
      ) : shares.length === 0 ? (
        <div className="text-[12px] text-slate-400">Esta pasta não está compartilhada com ninguém de fora.</div>
      ) : (
        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {shares.map((s) => (
            <li key={s.userId} className="px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-slate-900 truncate">{s.name}</span>
                <span className="block text-[11.5px] text-slate-500 truncate">{s.departmentName}</span>
              </span>
              <select
                value={s.canDownload ? 'download' : 'view'}
                onChange={(e) => setShares((prev) => prev!.map((x) => (x.userId === s.userId ? { ...x, canDownload: e.target.value === 'download' } : x)))}
                className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[12px]"
                aria-label={`Acesso de ${s.name}`}
              >
                <option value="view">Só visualizar</option>
                <option value="download">Visualizar e baixar</option>
              </select>
              <button
                type="button"
                onClick={() => setShares((prev) => prev!.filter((x) => x.userId !== s.userId))}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                aria-label={`Remover ${s.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[12.5px] font-semibold inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          {saved ? 'Compartilhamento salvo' : 'Salvar compartilhamento'}
        </button>
        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
          <Eye className="w-3 h-3" /> /
          <Download className="w-3 h-3" /> por pessoa
        </span>
      </div>
    </fieldset>
  );
};
