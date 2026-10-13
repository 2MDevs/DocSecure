import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Loader2, Clock, Building, RefreshCw, ShieldAlert } from 'lucide-react';
import { Department, DocumentItem, User } from '../../types';
import { apiClient } from '../../services/apiClient';

interface TrashViewProps {
  currentUser: User;
  departments: Department[];
  onRestore: (doc: DocumentItem) => Promise<DocumentItem>;
}

const formatSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function remainingLabel(purgeAt?: string | null): { text: string; urgent: boolean } {
  if (!purgeAt) return { text: '-', urgent: false };
  const ms = new Date(purgeAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'será apagado em instantes', urgent: true };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return { text: `${days} dia${days > 1 ? 's' : ''} e ${hours}h restantes`, urgent: days < 2 };
  return { text: `${Math.max(1, hours)}h restantes`, urgent: true };
}

/**
 * Lixeira separada por setor: cada setor só enxerga a própria lixeira.
 * Itens ficam 7 dias (prazo de arrependimento) e depois são apagados do servidor automaticamente.
 */
export const TrashView: React.FC<TrashViewProps> = ({ currentUser, departments, onRestore }) => {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<DocumentItem | null>(null);

  const isAdmin = currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR';

  // Setores cuja lixeira o usuário pode abrir
  const trashDepartments = useMemo(
    () => (isAdmin ? departments : departments.filter((d) => d.id === currentUser.departmentId)),
    [isAdmin, departments, currentUser.departmentId]
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');

  useEffect(() => {
    if (!selectedDeptId || !trashDepartments.some((d) => d.id === selectedDeptId)) {
      setSelectedDeptId(trashDepartments[0]?.id || '');
    }
  }, [trashDepartments, selectedDeptId]);

  const load = useCallback(async () => {
    if (!selectedDeptId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getTrash(selectedDeptId);
      setRetentionDays(res.retentionDays);
      // Garantia extra: só exibe itens do setor selecionado
      setItems(res.items.filter((i) => i.departmentId === selectedDeptId));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar a lixeira.');
    } finally {
      setLoading(false);
    }
  }, [selectedDeptId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (doc: DocumentItem) => {
    try {
      setBusyId(doc.id);
      setError(null);
      await onRestore(doc);
      setItems((prev) => prev.filter((i) => i.id !== doc.id));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível restaurar o documento.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!confirmPurge) return;
    const doc = confirmPurge;
    try {
      setBusyId(doc.id);
      setError(null);
      await apiClient.purgeDocument(doc.id);
      setItems((prev) => prev.filter((i) => i.id !== doc.id));
      setConfirmPurge(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir definitivamente.');
      setConfirmPurge(null);
    } finally {
      setBusyId(null);
    }
  };

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl mx-auto animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-500" /> Lixeira
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cada setor tem a sua lixeira. Os itens ficam {retentionDays} dias para recuperação e depois são apagados do
            servidor definitivamente.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {trashDepartments.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {trashDepartments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDeptId(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                selectedDeptId === d.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building className="w-3.5 h-3.5" /> {d.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" /> {error}
        </div>
      )}

      {!selectedDeptId ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
          Nenhum setor disponível.
        </div>
      ) : loading ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando a lixeira de {selectedDept?.name}...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center">
          <Trash2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">A lixeira de {selectedDept?.name} está vazia</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100">
          {items.map((doc) => {
            const remaining = remainingLabel(doc.purgeAt);
            return (
              <div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate" title={doc.name}>
                    {doc.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {formatSize(doc.sizeBytes)} • Excluído por {doc.trashedByName || '-'} em {formatDate(doc.trashedAt)}
                  </div>
                  <div
                    className={`text-[11px] mt-1 inline-flex items-center gap-1 font-medium ${
                      remaining.urgent ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  >
                    <Clock className="w-3 h-3" /> Exclusão definitiva: {formatDate(doc.purgeAt)} ({remaining.text})
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(doc)}
                    disabled={busyId === doc.id}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busyId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Restaurar
                  </button>
                  {doc.canPurge && (
                    <button
                      type="button"
                      onClick={() => setConfirmPurge(doc)}
                      disabled={busyId === doc.id}
                      className="px-3 py-2 rounded-xl text-xs font-semibold border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir agora
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir definitivamente?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  <strong>{confirmPurge.name}</strong> será apagado do servidor agora. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPurge(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={busyId === confirmPurge.id}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {busyId === confirmPurge.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
