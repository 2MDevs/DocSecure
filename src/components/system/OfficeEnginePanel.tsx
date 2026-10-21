import React, { useCallback, useEffect, useState } from 'react';
import { FileText, FileSpreadsheet, Presentation, Archive, HardDrive, MemoryStick, Check, Loader2, AlertTriangle, Lock, X, ChevronDown, ChevronUp } from 'lucide-react';
import { apiClient, OfficeEngineStatus } from '../../services/apiClient';

const fmt = (bytes?: number) => {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
  return `${Math.round(b / 1024 ** 2).toLocaleString('pt-BR')} MB`;
};
const fmtDate = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const Feature: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <li className="flex items-start gap-2 text-[12.5px]">
    {ok ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-px" /> : <X className="w-4 h-4 text-slate-300 shrink-0 mt-px" />}
    <span className={ok ? 'text-slate-700' : 'text-slate-400'}>{children}</span>
  </li>
);

/**
 * Aba "Visualização" da tela Sistema: escolher entre a visualização básica (Caminho 1, sem programa extra)
 * e a completa (Caminho 2, LibreOffice instalado na VPS). Alternar instala ou remove o LibreOffice.
 */
export const OfficeEnginePanel: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [status, setStatus] = useState<OfficeEngineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'install' | 'uninstall'>(null);
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await apiClient.getOfficeEngine());
    } catch (err: any) {
      setError(err?.message || 'Não foi possível consultar a visualização.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Enquanto instala/remove, acompanha a cada 4 segundos
  const busy = Boolean(status?.running || status?.pending);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  const send = async () => {
    if (!confirm) return;
    setSending(true);
    setError(null);
    try {
      setStatus(await apiClient.setOfficeEngine(confirm, password));
      setConfirm(null);
      setPassword('');
      setShowLog(true);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível alterar.');
    } finally {
      setSending(false);
    }
  };

  if (!status) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500 flex items-center gap-2">
        {error ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : <Loader2 className="w-4 h-4 animate-spin" />} {error || 'Carregando…'}
      </div>
    );
  }

  const full = status.mode === 'full';
  const installing = busy && status.action === 'install';
  const removing = busy && status.action === 'uninstall';
  const notOurs = status.installed && !status.installedByDocSecure;

  const Card: React.FC<{
    active: boolean;
    title: string;
    subtitle: string;
    disk: string;
    ram: string;
    features: Array<[boolean, string]>;
    action?: React.ReactNode;
  }> = ({ active, title, subtitle, disk, ram, features, action }) => (
    <section className={`rounded-2xl p-5 flex flex-col bg-white border ${active ? 'border-2 border-blue-600 shadow-md' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900">{title}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        {active && <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-blue-600 text-white">Em uso</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <HardDrive className="w-3 h-3" /> Disco
          </div>
          <div className="text-[13.5px] font-bold text-slate-900 mt-0.5">{disk}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <MemoryStick className="w-3 h-3" /> Memória
          </div>
          <div className="text-[13.5px] font-bold text-slate-900 mt-0.5">{ram}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 flex-1">
        {features.map(([ok, text]) => (
          <Feature key={text} ok={ok}>
            {text}
          </Feature>
        ))}
      </ul>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );

  const btn = 'w-full h-10 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50';

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-[12.5px] text-blue-900">
        Como os arquivos do Office abrem no visualizador. Trocar de opção instala ou remove o LibreOffice no servidor. Na memória, a
        visualização completa só pesa nos segundos em que um arquivo está sendo convertido; parada, as duas consomem o mesmo.
      </div>

      {busy && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="flex-1">
            {status.message || (installing ? 'Instalando o LibreOffice…' : 'Removendo o LibreOffice…')} A tela atualiza sozinha. Enquanto isso, a visualização
            básica continua funcionando.
          </span>
        </div>
      )}
      {!busy && status.state === 'failed' && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {status.message} {status.finishedAt && <span className="text-rose-600">({fmtDate(status.finishedAt)})</span>}
          </span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[13px] text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold">
            OK
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          active={!full}
          title="Visualização básica"
          subtitle="Sem programa extra no servidor (Caminho 1)"
          disk="0 MB a mais"
          ram="Pouca, só ao abrir"
          features={[
            [true, 'Word (.docx): texto, títulos, listas, tabelas e imagens'],
            [true, 'Excel (.xlsx) e CSV como tabela, com as abas'],
            [true, 'ZIP e RAR: navegar e abrir os itens'],
            [false, 'Layout idêntico ao Word/Excel (pode variar um pouco)'],
            [false, '.doc, .xls antigos e PowerPoint'],
          ]}
          action={
            canManage && full ? (
              <button type="button" disabled={busy || notOurs} onClick={() => setConfirm('uninstall')} className={`${btn} bg-slate-100 hover:bg-slate-200 text-slate-800`}>
                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Voltar para a básica (remove o LibreOffice)
              </button>
            ) : null
          }
        />
        <Card
          active={full}
          title="Visualização completa"
          subtitle={`LibreOffice instalado no servidor (Caminho 2)${status.version ? ` • ${status.version}` : ''}`}
          disk={full && status.diskBytes ? `+ ${fmt(status.diskBytes)}` : '+ ~500 MB'}
          ram="~200–300 MB só durante a conversão"
          features={[
            [true, 'Word, Excel e PowerPoint idênticos ao original (em PDF)'],
            [true, '.doc, .xls, .ppt antigos e OpenDocument (.odt, .ods, .odp)'],
            [true, 'ZIP e RAR: navegar e abrir os itens'],
            [true, 'Uma conversão por vez, guardada por alguns minutos'],
            [false, 'Leva alguns segundos para abrir cada arquivo'],
          ]}
          action={
            canManage && !full ? (
              <button
                type="button"
                disabled={busy || !status.canManage}
                onClick={() => setConfirm('install')}
                className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}
              >
                {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ativar a completa (instala o LibreOffice)
              </button>
            ) : null
          }
        />
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 text-[12.5px] text-slate-600 space-y-1.5">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" /> Word
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Presentation className="w-3.5 h-3.5 text-orange-600" /> PowerPoint
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5 text-amber-600" /> ZIP / RAR
          </span>
        </div>
        {!status.canManage && (
          <p className="text-amber-700">
            Para alternar por aqui, o serviço do botão “Atualizar sistema” precisa estar instalado na VPS (sudo bash scripts/install-auto-update.sh).
          </p>
        )}
        {notOurs && <p>O LibreOffice deste servidor foi instalado por fora do DocSecure (pode ser usado por outro sistema), por isso não pode ser removido por aqui.</p>}
        {!canManage && <p>Só o desenvolvedor pode alternar a visualização.</p>}
        {status.startedAt && (
          <p className="text-slate-400">
            Última alteração: {status.action === 'install' ? 'instalação' : 'remoção'} pedida por {status.requestedBy || '—'} em {fmtDate(status.startedAt)}
            {status.finishedAt ? `, concluída em ${fmtDate(status.finishedAt)}` : ''}.
          </p>
        )}
        {status.log && (
          <div>
            <button type="button" onClick={() => setShowLog((v) => !v)} className="text-blue-700 font-semibold inline-flex items-center gap-1">
              {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Registro da instalação
            </button>
            {showLog && <pre className="mt-2 max-h-64 overflow-auto bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] whitespace-pre-wrap">{status.log}</pre>}
          </div>
        )}
      </section>

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4 bg-slate-950/60" onClick={() => !sending && setConfirm(null)}>
          <div
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {confirm === 'install' ? 'Ativar a visualização completa?' : 'Voltar para a visualização básica?'}
              </h3>
              <p className="text-[13px] text-slate-600 mt-1.5">
                {confirm === 'install'
                  ? 'O servidor vai instalar o LibreOffice (cerca de 500 MB de disco). Leva alguns minutos; enquanto isso a visualização básica continua funcionando.'
                  : `O servidor vai remover o LibreOffice e liberar ${status.diskBytes ? fmt(status.diskBytes) : 'o espaço'} de disco. Word e Excel voltam a abrir na visualização básica; .doc, .xls antigos e PowerPoint voltam a ficar só com “Baixar”.`}
              </p>
            </div>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Confirme a sua senha
              </span>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && password && send()}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </label>
            {error && <p className="text-[12.5px] text-rose-700">{error}</p>}
            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
              <button type="button" disabled={sending} onClick={() => setConfirm(null)} className="h-11 md:h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[14px] md:text-[13px] font-semibold text-slate-700">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!password || sending}
                onClick={send}
                className="h-11 md:h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[14px] md:text-[13px] font-semibold inline-flex items-center justify-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />} {confirm === 'install' ? 'Instalar e ativar' : 'Remover e voltar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
