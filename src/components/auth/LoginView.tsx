import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Mail,
  Smartphone,
  ArrowLeft,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DocSecureLogo } from '../common/DocSecureLogo';
import { User as UserType } from '../../types';
import { apiClient } from '../../services/apiClient';

interface LoginViewProps {
  onLoginSuccess: (user: UserType, initialSetupMode?: boolean) => void;
  availableUsers?: UserType[];
  onTriggerLockoutNotice?: () => void;
  onRequestDeviceApproval?: (user: UserType) => void;
  sessionExpiredNotice?: string | null;
  onClearSessionExpiredNotice?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  sessionExpiredNotice,
  onClearSessionExpiredNotice,
}) => {
  // Step 1 State: Credentials
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Step 2 State: 2FA Verification
  const [step, setStep] = useState<'LOGIN' | '2FA'>('LOGIN');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  const [trustDevice, setTrustDevice] = useState<boolean>(true);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // General States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // STEP 1: Handle Initial Credentials Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onClearSessionExpiredNotice?.();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!emailOrUsername.trim() || !password) {
      setErrorMessage('Por favor, informe o usuário ou e-mail e a senha.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient.login(emailOrUsername.trim(), password);

      if (res.require2FA) {
        // Dispositivo não reconhecido -> Solicita código de e-mail (2FA)
        setChallengeToken(res.challengeToken || '');
        setMaskedEmail(res.maskedEmail || 'seu e-mail');
        setTwoFactorCode('');
        setStep('2FA');
        setResendCooldown(60);
      } else if (res.user) {
        // Dispositivo confiável ou modo de configuração inicial -> Acesso liberado
        onLoginSuccess(res.user, res.initialSetupMode);
      } else {
        setErrorMessage('Usuário ou senha inválidos');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Usuário ou senha inválidos';
      setErrorMessage(
        errorMsg.includes('401') || errorMsg.includes('inválidos')
          ? 'Usuário ou senha inválidos'
          : errorMsg
      );
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Handle 2FA Verification Submit
  const handleVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const cleanCode = twoFactorCode.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setErrorMessage('Por favor, digite o código de 6 dígitos completo recebido no seu e-mail.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient.verify2FA({
        challengeToken,
        code: cleanCode,
        trustDevice,
      });

      if (res && res.user) {
        setSuccessNotice('Código verificado com sucesso! Carregando sistema...');
        setTimeout(() => {
          onLoginSuccess(res.user);
        }, 500);
      } else {
        setErrorMessage('Código de verificação incorreto ou expirado.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Código de verificação incorreto ou expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Resend 2FA Code
  const handleResendCode = async () => {
    if (resendCooldown > 0 || !challengeToken) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      await apiClient.resend2FA(challengeToken);
      setResendCooldown(60);
      setSuccessNotice('Novo código de verificação enviado para o seu e-mail!');
      setTimeout(() => setSuccessNotice(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao reenviar código. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#08101e] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden select-none">
      {/* Ambient background glow effects */}
      <div className="absolute top-1/4 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card container */}
      <div className="w-full max-w-4xl bg-[#0c172c] border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
        {/* Left Visual Area - 3D Padlock & Security Theme */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#0e1e3b] via-[#09152b] to-[#060c18] p-8 lg:p-10 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden">
          {/* Subtle geometric pattern overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

          {/* Top Logo */}
          <div className="relative z-10">
            <DocSecureLogo size="lg" showSubtitle={true} />
          </div>

          {/* Center 3D Security Graphic */}
          <div className="relative z-10 my-8 py-6 flex flex-col items-center justify-center">
            <div className="relative w-44 h-44 flex items-center justify-center">
              {/* Glowing Outer Rings */}
              <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl animate-pulse" />
              <div className="absolute w-40 h-40 rounded-3xl border border-blue-500/20 rotate-6" />
              <div className="absolute w-40 h-40 rounded-3xl border border-indigo-500/20 -rotate-3" />

              {/* 3D Blue Folder with Glow & Padlock */}
              <div className="relative z-10 w-32 h-28 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-2xl shadow-blue-500/30 p-3.5 border border-blue-400/40 flex flex-col justify-between transform hover:scale-105 transition-transform duration-300">
                <div className="absolute -top-3 left-4 w-12 h-3.5 bg-blue-500 rounded-t-lg border-t border-l border-r border-blue-400/50" />

                <div className="space-y-1.5 opacity-40 mt-1">
                  <div className="w-14 h-1.5 bg-white rounded" />
                  <div className="w-18 h-1.5 bg-white rounded" />
                </div>

                <div className="self-center my-auto w-10 h-10 bg-white/10 rounded-xl backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
                  {step === '2FA' ? (
                    <Mail className="w-5 h-5 text-amber-300 animate-pulse" />
                  ) : (
                    <Shield className="w-5 h-5 text-white" />
                  )}
                </div>

                <div className="flex items-center justify-between text-[9px] text-blue-200 font-mono">
                  <span>POSTGRESQL</span>
                  <span>2FA EMAIL</span>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-400 max-w-xs mt-4">
              {step === '2FA'
                ? 'Proteção avançada: Dispositivos novos exigem verificação de segundo fator via e-mail corporativo.'
                : 'Plataforma corporativa com controle de acesso granular RBAC e persistência em banco de dados PostgreSQL.'}
            </p>
          </div>

          {/* Bottom Security Highlights */}
          <div className="relative z-10 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>2FA por E-mail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              <span>Dispositivo Confiável</span>
            </div>
          </div>
        </div>

        {/* Right Form Area */}
        <div className="lg:col-span-7 p-8 sm:p-10 lg:p-12 flex flex-col justify-between bg-[#0b1426]">
          {step === 'LOGIN' ? (
            /* STEP 1: CREDENTIALS FORM */
            <div>
              {/* Header */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Acesse sua conta
                </h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  Digite suas credenciais de usuário para acessar a plataforma.
                </p>
              </div>

              {/* Session Expired Notice */}
              {sessionExpiredNotice && (
                <div className="mt-5 p-3.5 bg-amber-950/70 border border-amber-600/80 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1">
                    <span className="leading-relaxed font-semibold">{sessionExpiredNotice}</span>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="mt-5 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                {/* Input 1: User / Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Usuário ou e-mail
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      disabled={isLoading}
                      value={emailOrUsername}
                      onChange={(e) => {
                        setEmailOrUsername(e.target.value);
                        if (sessionExpiredNotice) onClearSessionExpiredNotice?.();
                      }}
                      placeholder="seu.email@empresa.com.br ou matrícula"
                      className="w-full pl-10 pr-4 py-3 bg-[#08101e] border border-slate-700/80 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Input 2: Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (sessionExpiredNotice) onClearSessionExpiredNotice?.();
                      }}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-11 py-3 bg-[#08101e] border border-slate-700/80 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember me & Forgot password */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500/30 accent-blue-600 cursor-pointer"
                    />
                    <span>Lembrar-me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      alert('Para redefinição de credenciais, utilize o e-mail de recuperação ou solicite ao administrador.')
                    }
                    className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verificando credenciais...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Entrar</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* STEP 2: 2FA VIA EMAIL CODE & TRUSTED DEVICE */
            <div className="animate-in fade-in duration-300">
              {/* Back Button */}
              <button
                type="button"
                onClick={() => {
                  setStep('LOGIN');
                  setErrorMessage(null);
                  setSuccessNotice(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar para o login</span>
              </button>

              {/* Header */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-xs font-semibold mb-3">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Novo Dispositivo Detectado</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Verificação em Duas Etapas
                </h2>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Enviamos um código de segurança de 6 dígitos para o e-mail:
                  <span className="text-blue-400 font-mono font-medium block mt-0.5">
                    {maskedEmail}
                  </span>
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="mt-4 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Success Alert */}
              {successNotice && (
                <div className="mt-4 p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{successNotice}</span>
                </div>
              )}

              {/* Form 2FA */}
              <form onSubmit={handleVerify2FASubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Digite o código de 6 dígitos
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      required
                      autoFocus
                      disabled={isLoading}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full py-3.5 px-4 text-center text-2xl font-mono font-bold tracking-[0.5em] bg-[#08101e] border border-slate-700/80 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Trusted Device Checkbox */}
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500/30 accent-blue-600 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-200 block">
                        Confiar neste dispositivo por 30 dias
                      </span>
                      <span className="text-slate-400 text-[11px] block mt-0.5">
                        Não será necessário solicitar o código de e-mail nos próximos logins neste navegador.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Action Buttons */}
                <button
                  type="submit"
                  disabled={isLoading || twoFactorCode.length !== 6}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Validando código...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirmar e Acessar</span>
                    </>
                  )}
                </button>

                {/* Resend Code Button */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isLoading}
                    onClick={handleResendCode}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    {resendCooldown > 0 ? (
                      <span>Reenviar código em {resendCooldown}s</span>
                    ) : (
                      <span>Não recebeu? Reenviar código por e-mail</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Footer Security Badge */}
          <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            <span>Ambiente seguro corporativo • PostgreSQL Database Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};
