import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DocSecureLogo } from '../components/common/DocSecureLogo';
import { apiClient } from '../services/apiClient';
import { User } from '../types';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
  Lock,
  ArrowRight,
  Shield,
  Send,
} from 'lucide-react';

interface SetPasswordPageProps {
  currentUser?: User | null;
  onPasswordChangeSuccess?: (user: User) => void;
}

export const SetPasswordPage: React.FC<SetPasswordPageProps> = ({
  currentUser,
  onPasswordChangeSuccess,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tokenFromUrl = searchParams.get('token') || searchParams.get('reset_token') || '';
  const tipo = searchParams.get('tipo');
  const isMustChangeParam = searchParams.get('troca_obrigatoria') === 'true' || currentUser?.mustChangePassword;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(!tokenFromUrl && !isMustChangeParam);

  // Modal para solicitar novo link de redefinição
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // Validação da política de senha: 10 caracteres, letras e números
  const hasMinLength = newPassword.length >= 10;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hasMinLength || !hasLetter || !hasNumber) {
      setErrorMessage('A senha deve conter no mínimo 10 caracteres, incluindo letras e números.');
      return;
    }

    if (!passwordsMatch) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    try {
      setIsLoading(true);

      if (isMustChangeParam && currentUser) {
        // Modo troca autenticada obrigatória
        const res = await apiClient.changePassword(newPassword);
        setIsSuccess(true);
        if (res.user && onPasswordChangeSuccess) {
          onPasswordChangeSuccess(res.user);
        }
      } else {
        // Modo token enviado por e-mail
        if (!tokenFromUrl) {
          setIsInvalidToken(true);
          setErrorMessage('Token de redefinição ausente. Solicite um novo link.');
          return;
        }

        await apiClient.resetPassword(tokenFromUrl, newPassword);

        // Regra de segurança: encerra qualquer sessão ativa anterior antes de direcionar para o login
        try {
          await apiClient.logout();
        } catch {}

        setIsSuccess(true);
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao processar solicitação de senha.';
      setErrorMessage(msg);
      if (
        msg.includes('expirado') ||
        msg.includes('utilizado') ||
        msg.includes('inválido') ||
        msg.includes('Token')
      ) {
        setIsInvalidToken(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    try {
      setForgotLoading(true);
      setForgotFeedback(null);
      const res = await apiClient.forgotPassword(forgotEmail.trim());
      setForgotFeedback({
        success: true,
        msg: res.message || 'Instruções enviadas para seu e-mail caso cadastrado.',
      });
    } catch (err: any) {
      setForgotFeedback({
        success: false,
        msg: err.message || 'Falha ao solicitar novo link.',
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const getPageTitle = () => {
    if (isMustChangeParam) return 'Troca de Senha Obrigatória';
    if (tipo === 'reset') return 'Redefinir sua Senha';
    return 'Definir sua Senha';
  };

  const getPageSubtitle = () => {
    if (isMustChangeParam) {
      return 'Por questões de segurança corporativa, é necessário definir uma nova senha para continuar o acesso.';
    }
    if (tipo === 'reset') {
      return 'Crie uma nova senha segura para recuperar o acesso à sua conta DocSecure.';
    }
    return 'Cadastre a sua senha de acesso corporativa para ativar a sua conta DocSecure.';
  };

  return (
    <div className="min-h-screen w-full bg-[#08101e] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden select-none">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card container */}
      <div className="w-full max-w-4xl bg-[#0c172c] border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px] relative z-10">
        {/* Left Visual Area */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#0e1e3b] via-[#09152b] to-[#060c18] p-8 lg:p-10 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

          <div className="relative z-10">
            <DocSecureLogo size="lg" showSubtitle={true} />
          </div>

          <div className="relative z-10 my-8 py-6 flex flex-col items-center justify-center">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl animate-pulse" />
              <div className="absolute w-40 h-40 rounded-3xl border border-blue-500/20 rotate-6" />
              <div className="absolute w-40 h-40 rounded-3xl border border-indigo-500/20 -rotate-3" />

              <div className="relative z-10 w-32 h-28 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-2xl shadow-blue-500/30 p-3.5 border border-blue-400/40 flex flex-col justify-between">
                <div className="absolute -top-3 left-4 w-12 h-3.5 bg-blue-500 rounded-t-lg border-t border-l border-r border-blue-400/50" />
                <div className="space-y-1.5 opacity-40 mt-1">
                  <div className="w-14 h-1.5 bg-white rounded" />
                  <div className="w-18 h-1.5 bg-white rounded" />
                </div>
                <div className="self-center my-auto w-10 h-10 bg-white/10 rounded-xl backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-400 max-w-xs mt-4">
              Proteja seus documentos corporativos com criptografia de ponta a ponta e controle estrito de credenciais.
            </p>
          </div>

          <div className="relative z-10 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Bcrypt Cripto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              <span>Mínimo 10 Dígitos</span>
            </div>
          </div>
        </div>

        {/* Right Form Area */}
        <div className="lg:col-span-7 p-8 sm:p-10 lg:p-12 flex flex-col justify-between bg-[#0b1426]">
          {isSuccess ? (
            /* SUCCESS STATE */
            <div className="my-auto text-center py-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Senha salva com sucesso!
              </h2>

              <p className="text-sm text-slate-300 max-w-sm mx-auto mb-8 leading-relaxed">
                {isMustChangeParam
                  ? 'Sua nova senha foi gravada com sucesso. Você já pode utilizar todas as funcionalidades do sistema.'
                  : 'Sua senha foi definida com sucesso. Entre com seu e-mail e a nova senha cadastrada para continuar.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (isMustChangeParam && currentUser) {
                    navigate(currentUser.role === 'DEVELOPER' ? '/painel' : '/documentos');
                  } else {
                    navigate('/login');
                  }
                }}
                className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/25 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isMustChangeParam ? 'Ir para o Painel' : 'Ir para o Login'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : isInvalidToken && !isMustChangeParam ? (
            /* INVALID OR MISSING TOKEN STATE */
            <div className="my-auto py-4 animate-in fade-in">
              <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-5 text-amber-400">
                <AlertCircle className="w-7 h-7" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Link inválido ou expirado
              </h2>

              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                O token de definição de senha não foi encontrado, já foi utilizado ou expirou.
                Por motivos de segurança corporativa, os links são de uso único e expiram após 1 hora.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Solicitar novo link</span>
                </button>

                <Link
                  to="/login"
                  className="px-5 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center transition-colors"
                >
                  Voltar ao Login
                </Link>
              </div>
            </div>
          ) : (
            /* SET PASSWORD FORM */
            <div>
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 text-xs font-semibold mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Segurança Corporativa</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {getPageTitle()}
                </h2>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                  {getPageSubtitle()}
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="mt-4 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSavePassword} className="mt-6 space-y-4">
                {/* Nova Senha */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="Mínimo 10 caracteres (letras e números)"
                      className="w-full py-3 pl-4 pr-11 bg-[#08101e] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Senha */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="Repita a nova senha"
                      className="w-full py-3 pl-4 pr-11 bg-[#08101e] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Checklist de Requisitos da Senha */}
                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Requisitos da política de senha:
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasMinLength ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {hasMinLength ? '✓' : '•'}
                    </span>
                    <span className={hasMinLength ? 'text-emerald-300' : 'text-slate-400'}>
                      Mínimo de 10 caracteres ({newPassword.length}/10)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${hasLetter && hasNumber ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {hasLetter && hasNumber ? '✓' : '•'}
                    </span>
                    <span className={hasLetter && hasNumber ? 'text-emerald-300' : 'text-slate-400'}>
                      Combinação de letras e números
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] ${passwordsMatch ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {passwordsMatch ? '✓' : '•'}
                    </span>
                    <span className={passwordsMatch ? 'text-emerald-300' : 'text-slate-400'}>
                      As duas senhas coincidem
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !isFormValid}
                  className="w-full py-3.5 px-4 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando senha...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Salvar Senha</span>
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-3">
                <Link
                  to="/login"
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Lembrou sua senha? Voltar ao login
                </Link>
              </div>
            </div>
          )}

          {/* Footer Badge */}
          <div className="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            <span>Ambiente seguro corporativo • DocSecure Enterprise</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal for requesting new reset link */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0c172c] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <span>Solicitar Novo Link de Redefinição</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotFeedback(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Informe seu e-mail cadastrado. Enviaremos um novo link de definição de senha válido por 1 hora.
            </p>

            {forgotFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  forgotFeedback.success
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                }`}
              >
                {forgotFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <span>{forgotFeedback.msg}</span>
              </div>
            )}

            <form onSubmit={handleRequestNewLink} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail corporativo
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu.nome@empresa.com.br"
                  className="w-full py-2.5 px-3 bg-[#08101e] border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Enviar instruções</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
