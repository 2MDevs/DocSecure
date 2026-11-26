import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  Download,
  KeyRound,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Laptop,
  Unplug,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { User } from '../../types';
import { apiClient, WindowsFolderInfo, WindowsFolderAccess } from '../../services/apiClient';

const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white';

type Feedback = { ok: boolean; msg: string } | null;

const fmt = (v: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const ACCESS_LABEL: Record<WindowsFolderAccess, string> = {
  off: 'Desligada',
  developers: 'Em teste (só desenvolvedor)',
  all: 'Liberada para todos',
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {}
    ta.remove();
    return true;
  }
}

/**
 * Pasta no Windows: o DocSecure aparece no Explorador de Arquivos como uma unidade (ex.: Z: DocSecure),
 * mostrando só o que a pessoa pode acessar. Usa uma senha de aplicativo (nunca a senha principal).
 */
export const WindowsFolderPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [info, setInfo] = useState<WindowsFolderInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [accessDraft, setAccessDraft] = useState<WindowsFolderAccess>('developers');
  const [accessPassword, setAccessPassword] = useState('');
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessFeedback, setAccessFeedback] = useState<Feedback>(null);

  const load = () =>
    apiClient
      .getWindowsFolder()
      .then((data) => {
        setInfo(data);
        setAccessDraft(data.access);
        setLoadError('');
      })
      .catch((e: any) => setLoadError(e?.message || 'Não foi possível carregar.'));

  useEffect(() => {
    void load();
  }, [currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flashCopy = async (id: string, text: string) => {
    await copyText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiClient.createAppPassword(deviceName.trim() || 'Meu computador', password);
      setCreated({ name: res.name, password: res.password });
      setPassword('');
      setDeviceName('');
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, msg: err?.message || 'Não foi possível gerar a senha.' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setConfirmRevoke(null);
    try {
      await apiClient.revokeAppPassword(id);
      await load();
    } catch (err: any) {
      setFeedback({ ok: false, msg: err?.message || 'Não foi possível desconectar.' });
    }
  };

  const saveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessPassword || accessBusy) return;
    setAccessBusy(true);
    setAccessFeedback(null);
    try {
      await apiClient.setWindowsFolderAccess(accessDraft, accessPassword);
      setAccessPassword('');
      setAccessFeedback({ ok: true, msg: `Pasta no Windows: ${ACCESS_LABEL[accessDraft].toLowerCase()}.` });
      await load();
    } catch (err: any) {
      setAccessFeedback({ ok: false, msg: err?.message || 'Não foi possível salvar.' });
    } finally {
      setAccessBusy(false);
    }
  };

  const badgeCls =
    info?.access === 'all'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : info?.access === 'off'
        ? 'bg-slate-100 text-slate-600 border-slate-200'
        : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-yellow-50 text-yellow-700 flex items-center justify-center shrink-0">
          <HardDrive className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-sm font-bold text-slate-900">Pasta no Windows</h2>
            {info && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeCls}`}>{ACCESS_LABEL[info.access]}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            O DocSecure aparece no Explorador de Arquivos como uma unidade, com as pastas que você pode acessar. O que você salva lá vai direto para o
            DocSecure.
          </p>
        </div>
      </div>

      {loadError && <p className="text-xs text-rose-700">{loadError}</p>}
      {!info && !loadError && (
        <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
        </p>
      )}

      {info && !info.secure && (
        <div className="p-2.5 rounded-lg border text-xs flex items-start gap-2 bg-amber-50 border-amber-200 text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>O Windows só conecta este tipo de pasta por HTTPS. Acesse o DocSecure pelo endereço com https:// para usar a pasta no Windows.</span>
        </div>
      )}

      {info && !info.allowed && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {info.access === 'off'
            ? 'A pasta no Windows está desligada no momento.'
            : 'A pasta no Windows está em teste e ainda não foi liberada para todos. Fale com o TI.'}
        </p>
      )}

      {info && info.allowed && (
        <>
          {/* Passo 1: senha de aplicativo */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">1</span>
              <h3 className="text-xs font-bold text-slate-900">Gere uma senha de aplicativo para este computador</h3>
            </div>
            <p className="text-xs text-slate-500">
              É uma senha só para a pasta no Windows. Sua senha principal nunca é digitada no Windows, e você pode desconectar cada computador quando
              quiser.
            </p>
            {!created ? (
              <form onSubmit={generate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className={inputCls}
                  type="text"
                  maxLength={120}
                  placeholder="Nome do computador (ex.: Notebook TI)"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
                <input
                  className={inputCls}
                  type="password"
                  placeholder="Sua senha atual (confirmação)"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  Gerar senha
                </button>
              </form>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg border text-xs flex items-start gap-2 bg-amber-50 border-amber-200 text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Copie agora: esta senha <strong>não aparece de novo</strong>. Você vai colar no conector (passo 2). Se perder, desconecte o computador e
                    gere outra.
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 font-mono text-sm bg-slate-900 text-emerald-300 rounded-lg px-3 py-2.5 break-all select-all">{created.password}</code>
                  <button
                    type="button"
                    onClick={() => flashCopy('pw', created.password)}
                    className="px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 shrink-0"
                  >
                    {copied === 'pw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === 'pw' ? 'Copiada' : 'Copiar'}
                  </button>
                </div>
                <button type="button" onClick={() => setCreated(null)} className="text-[11px] text-slate-500 hover:text-slate-800 underline">
                  Já copiei
                </button>
              </div>
            )}
            <FeedbackLine value={feedback} />
          </div>

          {/* Passo 2: conector */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">2</span>
              <h3 className="text-xs font-bold text-slate-900">Baixe e abra o conector no computador com Windows</h3>
            </div>
            <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
              <li>Dê dois cliques no arquivo baixado. Se o Windows avisar, clique em <strong>Mais informações › Executar assim mesmo</strong>.</li>
              <li>Clique em <strong>Sim</strong> quando ele pedir permissão (é para aceitar arquivos grandes).</li>
              <li>Cole a senha de aplicativo e tecle Enter. Pronto: o DocSecure aparece em <strong>Este Computador</strong> e na barra lateral.</li>
            </ul>
            <a
              href={apiClient.windowsScriptUrl()}
              download="Conectar DocSecure.bat"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white"
            >
              <Download className="w-3.5 h-3.5" /> Baixar conector para Windows
            </a>

            <button type="button" onClick={() => setShowManual((v) => !v)} className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-500 pt-1">
              <span>Prefere conectar sem o conector?</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            </button>
            {showManual && (
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-5">
                <li>
                  No Explorador de Arquivos, clique com o botão direito em <strong>Este Computador › Mapear unidade de rede</strong>.
                </li>
                <li className="space-y-1">
                  <span>Na pasta, cole este endereço e marque “Conectar usando credenciais diferentes”:</span>
                  <span className="flex items-center gap-2">
                    <code className="font-mono text-[11px] bg-slate-100 rounded px-2 py-1 break-all">{info.davUrl}</code>
                    <button type="button" onClick={() => flashCopy('url', info.davUrl)} className="text-slate-400 hover:text-blue-600" title="Copiar">
                      {copied === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </span>
                </li>
                <li>
                  Usuário: <code className="font-mono text-[11px] bg-slate-100 rounded px-1.5">{info.login}</code> • Senha: a senha de aplicativo.
                </li>
                <li>Sem o conector, arquivos acima de 50 MB podem ser recusados pelo Windows.</li>
              </ol>
            )}
          </div>

          {/* Computadores conectados */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900">Computadores conectados</h3>
            {info.items.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum computador conectado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {info.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <Laptop className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{it.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {it.lastUsedAt ? `Último uso: ${fmt(it.lastUsedAt)}${it.lastUsedIp ? ` (IP ${it.lastUsedIp})` : ''}` : 'Ainda não usado'} • criado em{' '}
                        {fmt(it.createdAt)}
                      </div>
                    </div>
                    {confirmRevoke === it.id ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => revoke(it.id)} className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white">
                          Desconectar
                        </button>
                        <button type="button" onClick={() => setConfirmRevoke(null)} className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white border border-slate-200 text-slate-600">
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(it.id)}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1 shrink-0"
                        title="A senha deste computador para de funcionar na hora"
                      >
                        <Unplug className="w-3.5 h-3.5" /> Desconectar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Somente o desenvolvedor: quem pode usar */}
      {info?.canManageAccess && (
        <form onSubmit={saveAccess} className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900">Quem pode usar a pasta no Windows (somente desenvolvedor)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['developers', 'all', 'off'] as WindowsFolderAccess[]).map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer ${
                  accessDraft === opt ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <input type="radio" name="webdav-access" checked={accessDraft === opt} onChange={() => setAccessDraft(opt)} />
                {ACCESS_LABEL[opt]}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              className={`${inputCls} sm:col-span-2`}
              type="password"
              placeholder="Sua senha atual (confirmação)"
              autoComplete="current-password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={accessBusy || !accessPassword || accessDraft === info.access}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {accessBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar
            </button>
          </div>
          <FeedbackLine value={accessFeedback} />
        </form>
      )}
    </section>
  );
};

const FeedbackLine: React.FC<{ value: Feedback }> = ({ value }) =>
  value ? (
    <div
      className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
        value.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
      }`}
    >
      {value.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span>{value.msg}</span>
    </div>
  ) : null;
