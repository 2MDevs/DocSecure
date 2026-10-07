import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Lock,
  Smartphone,
  Save,
  CheckCircle2,
  AlertTriangle,
  Server,
  Globe,
  Sliders,
} from 'lucide-react';
import { User } from '../../types';

interface SecuritySettingsProps {
  currentUser: User;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ currentUser }) => {
  const [require2FAForAll, setRequire2FAForAll] = useState(true);
  const [lockoutThreshold, setLockoutThreshold] = useState('2'); // 2 wrong attempts lock account
  const [sessionTimeoutMins, setSessionTimeoutMins] = useState('30');
  const [ipWhitelistActive, setIpWhitelistActive] = useState(true);
  const [allowedIpRange, setAllowedIpRange] = useState('187.54.0.0/16, 201.86.0.0/16, 177.132.0.0/16');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Parâmetros de Segurança Corporativa
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Políticas de autenticação, tolerância contra força-bruta e criptografia.
          </p>
        </div>

        {isSaved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" /> Configurações Atualizadas
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Card 1: 2FA & Autenticação */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Autenticação em Dois Fatores (MFA / 2FA)</h3>
              <p className="text-xs text-slate-500">Padrão RFC 6238 TOTP e chaves FIDO2/WebAuthn.</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={require2FAForAll}
              onChange={(e) => setRequire2FAForAll(e.target.checked)}
              className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500 accent-blue-600"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 block">Exigir 2FA Obrigatório para Todos os Usuários</span>
              <span className="text-[11px] text-slate-500">
                Nenhum colaborador, gestor ou diretor poderá acessar pastas sem validar o token de 6 dígitos.
              </span>
            </div>
          </label>
        </div>

        {/* Card 2: Bloqueio de Login por Tentativas Incorretas (Seção 17 do Briefing) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Proteção Anti-Brute-Force & Bloqueio Imediato</h3>
              <p className="text-xs text-slate-500">Regra rígida de bloqueio automático de credenciais.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Limite de Tentativas de Senha Incorreta
              </label>
              <select
                value={lockoutThreshold}
                onChange={(e) => setLockoutThreshold(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="2">2 Tentativas (Padrão DocSecure Rigoroso)</option>
                <option value="3">3 Tentativas</option>
                <option value="5">5 Tentativas</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                1ª tentativa: Registra evento na auditoria. 2ª tentativa: Bloqueia a conta e exige desbloqueio manual por Gestor/Admin.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempo Limite de Inatividade de Sessão (Minutos)
              </label>
              <input
                type="number"
                value={sessionTimeoutMins}
                onChange={(e) => setSessionTimeoutMins(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Revoga o token JWT da sessão após inatividade no navegador.
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Criptografia & Armazenamento */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Algoritmos de Criptografia & Hashes</h3>
              <p className="text-xs text-slate-500">Conformidade com os mais altos padrões corporativos.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px]">Hash de Senhas</span>
              <span className="font-bold text-slate-900 font-mono">Argon2id (v=19)</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px]">Criptografia em Repouso</span>
              <span className="font-bold text-slate-900 font-mono">AES-256-GCM</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px]">Comunicação</span>
              <span className="font-bold text-slate-900 font-mono">TLS 1.3 / mTLS</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Aplicar Políticas de Segurança</span>
          </button>
        </div>
      </form>
    </div>
  );
};
