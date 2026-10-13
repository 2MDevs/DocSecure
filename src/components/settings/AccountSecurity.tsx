import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Hash, Loader2, CheckCircle2, AlertTriangle, Timer, Server, Trash2 } from 'lucide-react';
import { User } from '../../types';
import { apiClient } from '../../services/apiClient';

interface AccountSecurityProps {
  currentUser: User;
  onLockNow: () => void;
  onPinChanged: (hasPin: boolean) => void;
}

type Feedback = { ok: boolean; msg: string } | null;

const inputCls =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white';

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

/**
 * Segurança da conta: o que o próprio usuário pode personalizar (senha e PIN).
 * As políticas (tempo de bloqueio, tentativas) são definidas pelo desenvolvedor na tela Integração.
 */
export const AccountSecurity: React.FC<AccountSecurityProps> = ({ currentUser, onLockNow, onPinChanged }) => {
  const [policy, setPolicy] = useState<{ lockIdleMinutes: number; pinMaxAttempts: number; hasPin: boolean } | null>(null);

  // Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<Feedback>(null);

  // PIN
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<Feedback>(null);

  useEffect(() => {
    apiClient
      .getSecurityPolicy()
      .then(setPolicy)
      .catch(() => setPolicy({ lockIdleMinutes: 10, pinMaxAttempts: 5, hasPin: Boolean(currentUser.hasPin) }));
  }, [currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pwdValid = newPassword.length >= 10 && /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdFeedback(null);
    if (!pwdValid) return setPwdFeedback({ ok: false, msg: 'A nova senha precisa ter no mínimo 10 caracteres, com letras e números.' });
    if (newPassword !== confirmPassword) return setPwdFeedback({ ok: false, msg: 'A confirmação não confere com a nova senha.' });
    try {
      setPwdLoading(true);
      await apiClient.changePassword(newPassword, currentPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdFeedback({ ok: true, msg: 'Senha alterada com sucesso. Use a nova senha no próximo acesso.' });
    } catch (err: any) {
      setPwdFeedback({ ok: false, msg: err?.message || 'Não foi possível alterar a senha.' });
    } finally {
      setPwdLoading(false);
    }
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback(null);
    if (!/^\d{4,8}$/.test(pin)) return setPinFeedback({ ok: false, msg: 'O PIN deve ter de 4 a 8 números.' });
    if (pin !== pinConfirm) return setPinFeedback({ ok: false, msg: 'A confirmação do PIN não confere.' });
    try {
      setPinLoading(true);
      const res = await apiClient.setPin(pin, pinPassword);
      setPin('');
      setPinConfirm('');
      setPinPassword('');
      setPolicy((p) => (p ? { ...p, hasPin: true } : p));
      onPinChanged(true);
      setPinFeedback({ ok: true, msg: res.message || 'PIN salvo.' });
    } catch (err: any) {
      setPinFeedback({ ok: false, msg: err?.message || 'Não foi possível salvar o PIN.' });
    } finally {
      setPinLoading(false);
    }
  };

  const deletePin = async () => {
    setPinFeedback(null);
    if (!pinPassword) return setPinFeedback({ ok: false, msg: 'Digite a sua senha atual para remover o PIN.' });
    try {
      setPinLoading(true);
      const res = await apiClient.removePin(pinPassword);
      setPinPassword('');
      setPolicy((p) => (p ? { ...p, hasPin: false } : p));
      onPinChanged(false);
      setPinFeedback({ ok: true, msg: res.message || 'PIN removido.' });
    } catch (err: any) {
      setPinFeedback({ ok: false, msg: err?.message || 'Não foi possível remover o PIN.' });
    } finally {
      setPinLoading(false);
    }
  };

  const hasPin = policy?.hasPin ?? Boolean(currentUser.hasPin);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Segurança da conta</h1>
        <p className="text-sm text-slate-500 mt-0.5">{currentUser.name} • {currentUser.email}</p>
      </div>

      {/* Bloqueio automático (informativo: definido pelo desenvolvedor) */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Timer className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900">Bloqueio automático</h2>
            <p className="text-xs text-slate-500">
              {policy
                ? policy.lockIdleMinutes > 0
                  ? `Após ${policy.lockIdleMinutes} minuto(s) sem atividade a tela entra em modo de suspensão e pede o ${hasPin ? 'PIN' : 'sua senha'}. Depois de ${policy.pinMaxAttempts} tentativa(s) erradas a sessão é encerrada.`
                  : 'O bloqueio por inatividade está desativado pelo administrador.'
                : 'Carregando política…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onLockNow}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
          >
            <Lock className="w-3.5 h-3.5" /> Bloquear agora
          </button>
        </div>
      </section>

      {/* PIN */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Hash className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900">PIN de desbloqueio</h2>
            <p className="text-xs text-slate-500">
              {hasPin ? 'PIN cadastrado. Você pode trocá-lo ou removê-lo.' : 'Sem PIN: o desbloqueio usa a sua senha.'}
            </p>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              hasPin ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {hasPin ? 'Ativo' : 'Não cadastrado'}
          </span>
        </div>
        <form onSubmit={savePin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className={inputCls} type="password" inputMode="numeric" maxLength={8} placeholder="Novo PIN (4 a 8 números)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <input className={inputCls} type="password" inputMode="numeric" maxLength={8} placeholder="Confirmar PIN" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))} />
          <input className={inputCls} type="password" placeholder="Senha atual" autoComplete="current-password" value={pinPassword} onChange={(e) => setPinPassword(e.target.value)} />
          <div className="sm:col-span-3 flex flex-wrap items-center justify-end gap-2">
            {hasPin && (
              <button type="button" onClick={deletePin} disabled={pinLoading} className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> Remover PIN
              </button>
            )}
            <button type="submit" disabled={pinLoading} className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              {pinLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {hasPin ? 'Trocar PIN' : 'Cadastrar PIN'}
            </button>
          </div>
        </form>
        <FeedbackLine value={pinFeedback} />
      </section>

      {/* Senha */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Alterar senha</h2>
            <p className="text-xs text-slate-500">Mínimo de 10 caracteres, com letras e números.</p>
          </div>
        </div>
        <form onSubmit={changePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className={inputCls} type="password" placeholder="Senha atual" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Nova senha" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Confirmar nova senha" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={pwdLoading || !currentPassword || !newPassword} className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              {pwdLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Alterar senha
            </button>
          </div>
        </form>
        <FeedbackLine value={pwdFeedback} />
      </section>

      {/* Informações técnicas: somente desenvolvedor */}
      {currentUser.role === 'DEVELOPER' && (
        <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Informações técnicas (somente desenvolvedor)</h2>
              <p className="text-xs text-slate-500">Políticas de bloqueio e sessão são ajustadas em Administração › Integração.</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
            {[
              ['Arquivos em repouso', 'AES-256-GCM (chave derivada via HKDF-SHA256)'],
              ['Segredos de configuração', 'AES-256-GCM'],
              ['Senhas e PINs', 'bcrypt (custo 12)'],
              ['Sessões', 'Token aleatório, hash SHA-256, cookie HttpOnly + SameSite=Lax'],
              ['Integridade dos documentos', 'SHA-256 do arquivo original'],
              ['Fila offline do navegador', 'AES-GCM com chave não exportável (WebCrypto)'],
            ].map(([k, v]) => (
              <li key={k} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> {k}
                </div>
                <div className="font-mono text-[11px] mt-0.5">{v}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
