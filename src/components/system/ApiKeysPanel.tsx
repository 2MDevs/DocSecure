import React, { useState } from 'react';
import { Key, Plus, Copy, Check, Trash2, AlertTriangle, ChevronDown, ShieldCheck, Ban } from 'lucide-react';
import { ApiKey } from '../../types';

const SCOPES: { id: string; label: string }[] = [
  { id: 'read:documents', label: 'Ler documentos, pastas e setores' },
  { id: 'write:documents', label: 'Enviar, renomear e mover' },
  { id: 'delete:documents', label: 'Mandar para a lixeira / apagar' },
  { id: 'read:users', label: 'Ler a lista de usuários' },
  { id: 'admin:permissions', label: 'Alterar usuários e setores' },
  { id: 'export:audit', label: 'Ler a auditoria' },
];

const fmtDate = (v: string | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona para copiar com Ctrl+C
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
    }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
  };
  return { copied, copy };
}

interface Props {
  apiKeys: ApiKey[];
  currentUserName: string;
  onCreate: (name: string, scopes: string[]) => Promise<string>;
  onRevoke: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export const ApiKeysPanel: React.FC<Props> = ({ apiKeys, currentUserName, onCreate, onRevoke, onDelete }) => {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read:documents']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [savedAck, setSavedAck] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: 'revoke' | 'delete' } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const { copied, copy } = useCopy();

  const base = typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio';

  const openModal = () => {
    setName('');
    setScopes(['read:documents']);
    setError('');
    setCreated(null);
    setSavedAck(false);
    setModal(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !scopes.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const key = await onCreate(name.trim(), scopes);
      setCreated({ name: name.trim(), key });
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gerar a chave.');
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    if (created && !savedAck) return;
    setModal(false);
    setCreated(null);
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { id, action } = confirm;
    setConfirm(null);
    if (action === 'revoke') await onRevoke(id);
    else await onDelete(id);
  };

  const curlPing = `curl -H "Authorization: Bearer SUA_CHAVE" ${base}/api/external/ping`;
  const curlList = `curl -H "Authorization: Bearer SUA_CHAVE" ${base}/api/documents`;
  const curlDownload = `curl -H "Authorization: Bearer SUA_CHAVE" -o arquivo.pdf "${base}/api/documents/ID_DO_DOCUMENTO/content?download=1"`;
  const curlUpload = `curl -H "Authorization: Bearer SUA_CHAVE" -F "file=@contrato.pdf" -F "departmentId=ID_DO_SETOR" -F "folderId=ID_DA_PASTA" ${base}/api/documents/upload`;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Chaves de API (REST / JSON)</h3>
            <p className="text-xs text-slate-400">Para outros sistemas se conectarem ao DocSecure.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Chave</span>
        </button>
      </div>

      <div className="space-y-3">
        {apiKeys.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">Nenhuma chave gerada ainda.</p>
        )}
        {apiKeys.map((key) => {
          const revoked = key.status === 'REVOKED';
          const legacy = key.usable === false;
          const asking = confirm?.id === key.id;
          return (
            <div
              key={key.id}
              className={`p-3.5 rounded-xl border space-y-2 ${revoked || legacy ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-slate-50/70 border-slate-200/80'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-xs text-slate-900 truncate">{key.name}</span>
                  {revoked ? (
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-md">Revogada</span>
                  ) : legacy ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md" title="Criada antes da correção: a chave completa nunca foi mostrada. Gere uma nova.">
                      Inválida — gere outra
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md">Ativa</span>
                  )}
                </div>
                {asking ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={runConfirm} className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-semibold">
                      {confirm!.action === 'revoke' ? 'Revogar' : 'Excluir'}
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="px-2 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold">
                      Cancelar
                    </button>
                  </div>
                ) : revoked || legacy ? (
                  <button
                    type="button"
                    onClick={() => setConfirm({ id: key.id, action: 'delete' })}
                    className="text-slate-400 hover:text-rose-600 p-1"
                    title="Excluir da lista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirm({ id: key.id, action: 'revoke' })}
                    className="text-rose-500 hover:text-rose-700 p-1 inline-flex items-center gap-1 text-[11px] font-semibold"
                    title="Revogar: a chave para de funcionar na hora"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Revogar</span>
                  </button>
                )}
              </div>

              <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-mono text-xs text-slate-500 truncate" title="Por segurança, a chave completa só aparece no momento em que é gerada.">
                {key.keyPreview}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span>Escopos: {key.scopes.join(', ') || '—'}</span>
                <span>Criada por {key.createdBy}{key.createdAt ? ` em ${fmtDate(key.createdAt)}` : ''}</span>
                <span className="w-full">{key.lastUsedAt ? `Último uso: ${fmtDate(key.lastUsedAt)}${key.lastUsedIp ? ` (IP ${key.lastUsedIp})` : ''}` : 'Ainda não usada'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <button type="button" onClick={() => setShowGuide((v) => !v)} className="w-full flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>Como conectar outro sistema</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
        </button>
        {showGuide && (
          <div className="mt-3 space-y-3 text-[11px] text-slate-600 leading-relaxed">
            <p>
              O outro sistema manda a chave no cabeçalho <code className="font-mono bg-slate-100 px-1 rounded">Authorization: Bearer dcs_live_…</code>{' '}
              (ou <code className="font-mono bg-slate-100 px-1 rounded">X-API-Key</code>). A chave age com as permissões de quem a gerou, limitada aos escopos
              marcados, e tudo o que ela faz aparece na Auditoria como “Nome (API: nome da chave)”.
            </p>
            {[
              ['Testar a conexão', curlPing],
              ['Listar documentos', curlList],
              ['Baixar um arquivo', curlDownload],
              ['Enviar um arquivo', curlUpload],
            ].map(([label, cmd]) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700">{label}</span>
                  <button type="button" onClick={() => copy(label, cmd)} className="text-slate-400 hover:text-blue-600 p-0.5" title="Copiar">
                    {copied === label ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <pre className="font-mono text-[10.5px] bg-slate-900 text-slate-100 rounded-lg p-2.5 whitespace-pre-wrap break-all">{cmd}</pre>
              </div>
            ))}
            <p className="text-slate-500">
              Outras rotas: <code className="font-mono">GET /api/folders</code>, <code className="font-mono">GET /api/departments</code>,{' '}
              <code className="font-mono">PATCH /api/documents/ID</code>, <code className="font-mono">DELETE /api/documents/ID</code>. Telas de sistema, login, usuários de acesso e as
              próprias chaves nunca aceitam chave de API.
            </p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs" onClick={closeModal}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {!created ? (
              <>
                <h3 className="text-base font-bold text-slate-900">Gerar nova chave de API</h3>
                <form onSubmit={submit} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nome / sistema que vai usar</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Gestão de Processos, ERP, Portal RH"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">O que a chave pode fazer</label>
                    <div className="space-y-1.5">
                      {SCOPES.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scopes.includes(s.id)}
                            onChange={(e) => setScopes((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                          />
                          <span className="flex-1">{s.label}</span>
                          <span className="font-mono text-[10px] text-slate-400">{s.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                    A chave vai agir com as <strong>suas</strong> permissões ({currentUserName}), só dentro dos escopos marcados. Se o seu acesso for bloqueado, ela para de
                    funcionar.
                  </p>
                  {error && <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">{error}</p>}
                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={busy || !name.trim() || !scopes.length}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs"
                    >
                      {busy ? 'Gerando…' : 'Gerar chave'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">Chave “{created.name}” gerada</h3>
                </div>
                <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Copie agora e guarde no outro sistema. <strong>Ela não será mostrada de novo</strong> — o DocSecure guarda só uma impressão digital (hash) dela. Se perder, revogue e
                    gere outra.
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 font-mono text-[11px] bg-slate-900 text-emerald-300 rounded-lg p-2.5 break-all select-all">{created.key}</code>
                  <button
                    type="button"
                    onClick={() => copy('new', created.key)}
                    className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                  >
                    {copied === 'new' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied === 'new' ? 'Copiada' : 'Copiar'}</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700 block mb-1">Teste no outro sistema:</span>
                  <pre className="font-mono text-[10.5px] bg-slate-100 rounded-lg p-2.5 whitespace-pre-wrap break-all">{curlPing.replace('SUA_CHAVE', created.key)}</pre>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={savedAck} onChange={(e) => setSavedAck(e.target.checked)} />
                  <span>Já copiei e guardei a chave</span>
                </label>
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={!savedAck}
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold"
                  >
                    Concluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
