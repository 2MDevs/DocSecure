import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  GitCommitHorizontal,
  Lock,
  RefreshCw,
  ScrollText,
  X,
} from 'lucide-react';
import { apiClient, SystemUpdateStatus } from '../../services/apiClient';

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const SystemUpdatePanel: React.FC = () => {
  const [data, setData] = useState<SystemUpdateStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Momento em que o usuário clicou em atualizar (para saber quando a execução atual terminou)
  const [requestedAt, setRequestedAt] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setChecking(true);
      const res = await apiClient.getSystemUpdateStatus();
      setData(res);
      setLoadError(null);
      return res;
    } catch (err: any) {
      // Durante o reinício o servidor fica fora do ar por alguns segundos: ignorar no modo silencioso
      if (!silent) {
        const isSessionExpired =
          err?.message?.includes('expirou') ||
          err?.message?.includes('401') ||
          err?.message?.includes('Sessão ausente');
        setLoadError(
          isSessionExpired ? 'Sua sessão expirou. Entre novamente.' : err.message || 'Falha ao consultar a versão do sistema.'
        );
      }
      return null;
    } finally {
      if (!silent) setChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Acompanha a atualização em andamento
  useEffect(() => {
    if (requestedAt === null) return;
    const tick = async () => {
      const res = await load(true);
      if (!res || res.running) return;
      const started = Date.parse(res.status?.startedAt || '');
      if (!res.status || !Number.isFinite(started) || started < requestedAt - 60_000) return;

      setRequestedAt(null);
      if (res.status.state === 'success') {
        setResult({ ok: true, message: 'Sistema atualizado! A página será recarregada em instantes...' });
        window.setTimeout(() => window.location.reload(), 4000);
      } else if (res.status.state === 'up_to_date') {
        setResult({ ok: true, message: 'O sistema já estava na versão mais recente.' });
      } else {
        setResult({ ok: false, message: res.status.message || 'A atualização falhou.' });
        setShowLog(true);
      }
    };
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [requestedAt, load]);

  // Se a tela for aberta com uma atualização já em andamento, acompanhar também
  useEffect(() => {
    if (data?.running && requestedAt === null) {
      const started = Date.parse(data.status?.startedAt || '');
      setRequestedAt(Number.isFinite(started) ? started : Date.now());
    }
  }, [data, requestedAt]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setSubmitError('Digite a sua senha.');
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError(null);
      setResult(null);
      await apiClient.startSystemUpdate(password);
      setModalOpen(false);
      setPassword('');
      setRequestedAt(Date.now());
      setData((prev) =>
        prev
          ? {
              ...prev,
              running: true,
              status: { state: 'running', message: 'Aguardando o início da atualização...', startedAt: new Date().toISOString() },
            }
          : prev
      );
    } catch (err: any) {
      const isSessionExpired =
        err?.message?.includes('expirou') ||
        err?.message?.includes('401') ||
        err?.message?.includes('Sessão ausente');
      setSubmitError(
        isSessionExpired ? 'Sua sessão expirou. Entre novamente.' : err.message || 'Não foi possível iniciar a atualização.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const running = requestedAt !== null || Boolean(data?.running);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <CloudDownload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Atualização do Sistema</h2>
            <p className="text-xs text-slate-500">
              Baixa a última versão publicada no GitHub, gera o build e reinicia o sistema. Se algo falhar, a versão
              anterior é restaurada automaticamente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => load()}
            disabled={checking || running}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Verificar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              setModalOpen(true);
            }}
            disabled={running || !data?.installed}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <CloudDownload className="w-3.5 h-3.5" />
                <span>Atualizar sistema</span>
              </>
            )}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {data && !data.installed && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-xs space-y-1">
          <div className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Atualização pelo painel ainda não ativada nesta VPS
          </div>
          <p>
            Rode uma única vez na VPS, dentro da pasta do projeto:{' '}
            <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">sudo bash scripts/install-auto-update.sh</code>
          </p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Versão instalada</div>
            {data.current ? (
              <div className="flex items-start gap-2">
                <GitCommitHorizontal className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate" title={data.current.message}>
                    {data.current.message}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {data.current.short} · {formatDate(data.current.date)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Não identificada</div>
            )}
          </div>

          <div
            className={`p-3 border rounded-xl ${
              data.updateAvailable ? 'bg-indigo-50/70 border-indigo-200' : 'bg-slate-50/70 border-slate-200/60'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1 flex items-center justify-between">
              <span>Última versão no GitHub ({data.branch})</span>
              {data.latest &&
                (data.updateAvailable ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white normal-case">
                    Nova versão disponível
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 normal-case">
                    Em dia
                  </span>
                ))}
            </div>
            {data.latest ? (
              <div className="flex items-start gap-2">
                <GitCommitHorizontal className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate" title={data.latest.message}>
                    {data.latest.message}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {data.latest.short} · {formatDate(data.latest.date)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Não foi possível consultar o GitHub agora.</div>
            )}
          </div>
        </div>
      )}

      {running && data?.status?.message && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2 text-indigo-900 text-xs">
          <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="font-medium">{data.status.message}</span>
        </div>
      )}

      {result && (
        <div
          className={`p-3 border rounded-xl flex items-start gap-2 text-xs ${
            result.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{result.message}</span>
        </div>
      )}

      {!running && !result && data?.status && data.status.state !== 'running' && (
        <div className="text-[11px] text-slate-500">
          Última atualização: {formatDate(data.status.finishedAt || data.status.startedAt)}
          {data.status.requestedBy ? ` por ${data.status.requestedBy}` : ''} — {data.status.message}
        </div>
      )}

      {data?.log && (
        <div>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
          >
            <ScrollText className="w-3.5 h-3.5" />
            {showLog ? 'Ocultar registro' : 'Ver registro da atualização'}
          </button>
          {showLog && (
            <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] leading-relaxed max-h-72 overflow-auto whitespace-pre-wrap select-text">
              {data.log}
            </pre>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirmar atualização</h3>
                  <p className="text-xs text-slate-500">O sistema ficará indisponível por alguns segundos.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs">{submitError}</div>
            )}

            <form onSubmit={handleConfirm} className="space-y-4">
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha atual"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {submitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Atualizar agora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
