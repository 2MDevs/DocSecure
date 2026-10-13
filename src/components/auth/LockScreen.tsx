import React, { useEffect, useRef, useState } from 'react';
import { Lock, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { apiClient } from '../../services/apiClient';

interface LockScreenProps {
  currentUser: User;
  hasPin: boolean;
  onUnlocked: () => void;
  onForcedLogout: (message: string) => void;
  onLogout: () => void;
}

/**
 * Modo de suspensão: cobre toda a tela (o conteúdo fica oculto) até o usuário digitar o PIN.
 * Sem PIN cadastrado, o desbloqueio é feito com a senha.
 */
export const LockScreen: React.FC<LockScreenProps> = ({ currentUser, hasPin, onUnlocked, onForcedLogout, onLogout }) => {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret || loading) return;
    setLoading(true);
    setError(null);
    const res = await apiClient.unlockSession(secret);
    setLoading(false);
    setSecret('');
    if (res.unlocked) {
      onUnlocked();
    } else if (res.loggedOut) {
      onForcedLogout(res.error || 'Sessão encerrada por excesso de tentativas.');
    } else {
      setError(res.error || 'Não foi possível desbloquear.');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b1426] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-xs text-center text-white space-y-5">
        <div className="flex justify-center">
          <Avatar name={currentUser.name} avatarUrl={currentUser.avatar} size="lg" />
        </div>
        <div>
          <div className="text-lg font-semibold">{currentUser.name}</div>
          <div className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Sessão bloqueada por inatividade
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            ref={inputRef}
            type="password"
            inputMode={hasPin ? 'numeric' : undefined}
            autoComplete="off"
            maxLength={hasPin ? 8 : 128}
            value={secret}
            onChange={(e) => setSecret(hasPin ? e.target.value.replace(/\D/g, '') : e.target.value)}
            placeholder={hasPin ? 'Digite seu PIN' : 'Digite sua senha'}
            className={`w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-center text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400 ${
              hasPin ? 'tracking-[0.5em] text-lg' : 'text-sm'
            }`}
          />
          {error && (
            <div className="text-xs text-rose-300 flex items-start gap-1.5 text-left">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!secret || loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Desbloquear
          </button>
        </form>

        {!hasPin && (
          <p className="text-[11px] text-slate-400">
            Dica: cadastre um PIN em “Segurança da conta” para desbloquear mais rápido.
          </p>
        )}

        <button type="button" onClick={onLogout} className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Sair e entrar com outra conta
        </button>
      </div>
    </div>
  );
};
