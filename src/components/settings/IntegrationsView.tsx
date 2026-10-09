import React, { useState, useEffect } from 'react';
import {
  Mail,
  Shield,
  UserCheck,
  Sparkles,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  KeyRound,
  FileCode,
  Info,
  Server,
  Terminal,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { User } from '../../types';
import { apiClient } from '../../services/apiClient';
import { SystemUpdatePanel } from './SystemUpdatePanel';

interface SettingItem {
  key: string;
  value?: string;
  configured?: boolean;
  last4?: string;
  source: 'database' | 'env' | 'default';
  isSecret: boolean;
}

interface IntegrationsViewProps {
  currentUser: User;
  onSetupCompleted?: () => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({ currentUser, onSetupCompleted }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Raw data from API
  const [settingsList, setSettingsList] = useState<SettingItem[]>([]);
  const [envOnlyList, setEnvOnlyList] = useState<Array<{ key: string; isSet: boolean }>>([]);
  const [encryptionKeyConfigured, setEncryptionKeyConfigured] = useState(true);
  const [initialSetupMode, setInitialSetupMode] = useState(false);
  const [adminStatus, setAdminStatus] = useState<{ exists: boolean; createdAt?: string; email?: string }>({
    exists: false,
  });

  // Form states
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  const [sessionTtlHours, setSessionTtlHours] = useState('8');
  const [maxUploadMb, setMaxUploadMb] = useState('25');

  const [adminEmail, setAdminEmail] = useState('');

  const [geminiApiKey, setGeminiApiKey] = useState('');

  // Password / Secret states
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [removedSecrets, setRemovedSecrets] = useState<string[]>([]);

  // Action test states
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [geminiTestLoading, setGeminiTestLoading] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [adminResetLoading, setAdminResetLoading] = useState(false);
  const [adminResetResult, setAdminResetResult] = useState<{ success: boolean; message: string } | null>(null);

  // Re-authentication modal
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthLoading, setReauthLoading] = useState(false);

  // Load settings on mount
  const loadSettings = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await apiClient.getIntegrationSettings();
      setSettingsList(res.settings);
      setEnvOnlyList(res.envOnly);
      setEncryptionKeyConfigured(res.encryptionKeyConfigured);
      setAdminStatus(res.adminStatus);
      if (res.initialSetupMode !== undefined) {
        setInitialSetupMode(Boolean(res.initialSetupMode));
      }

      // Populate form
      const getVal = (k: string) => res.settings.find((s) => s.key === k)?.value || '';

      setSmtpHost(getVal('SMTP_HOST'));
      setSmtpPort(getVal('SMTP_PORT') || '587');
      setSmtpSecure(getVal('SMTP_SECURE') === 'true');
      setSmtpUser(getVal('SMTP_USER'));
      setSmtpFrom(getVal('SMTP_FROM') || 'DocSecure <nao-responda@empresa.com.br>');

      setSessionTtlHours(getVal('SESSION_TTL_HOURS') || '8');
      setMaxUploadMb(getVal('MAX_UPLOAD_MB') || '25');

      setAdminEmail(getVal('ADMIN_EMAIL'));

      // Clean secret draft inputs
      setSmtpPass('');
      setGeminiApiKey('');
      setRemovedSecrets([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao carregar configurações de integração.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const getSourceBadge = (key: string) => {
    const item = settingsList.find((s) => s.key === key);
    if (!item) return null;

    let text = 'Padrão';
    let colorClass = 'bg-slate-100 text-slate-600 border-slate-200';

    if (item.source === 'database') {
      text = 'Banco';
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
    } else if (item.source === 'env') {
      text = '.env';
      colorClass = 'bg-blue-50 text-blue-700 border-blue-200 font-semibold';
    }

    return (
      <span
        title={`Origem do valor ativo: ${text}`}
        className={`px-2 py-0.5 text-[10px] rounded-md border ${colorClass} uppercase tracking-wider inline-flex items-center gap-1`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
        {text}
      </span>
    );
  };

  const getSecretInfo = (key: string) => {
    return settingsList.find((s) => s.key === key);
  };

  // Handle Save
  const handleSave = async (passwordOverride?: string) => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const payload: Record<string, any> = {
        SMTP_HOST: smtpHost,
        SMTP_PORT: parseInt(smtpPort, 10) || 587,
        SMTP_SECURE: smtpSecure,
        SMTP_USER: smtpUser,
        SMTP_FROM: smtpFrom,
        SESSION_TTL_HOURS: parseInt(sessionTtlHours, 10) || 8,
        MAX_UPLOAD_MB: parseInt(maxUploadMb, 10) || 25,
        ADMIN_EMAIL: adminEmail,
      };

      if (smtpPass && smtpPass.trim() !== '') {
        payload.SMTP_PASS = smtpPass;
      }

      if (geminiApiKey && geminiApiKey.trim() !== '') {
        payload.GEMINI_API_KEY = geminiApiKey;
      }

      // Se usuário solicitou remoção
      if (removedSecrets.length > 0) {
        payload.__removeSecret = removedSecrets[0]; // remove um por vez ou salva nulo
      }

      const res = await apiClient.saveIntegrationSettings(payload, passwordOverride || reauthPassword);

      if ((res as any).smtpTest) {
        setSmtpTestResult((res as any).smtpTest);
      }

      if ((res as any).setupCompleted || res.summary?.initialSetupMode === false) {
        setInitialSetupMode(false);
        onSetupCompleted?.();
      }

      setSuccessMessage(res.message || 'Configurações salvas e aplicadas em tempo real com sucesso!');
      setIsReauthModalOpen(false);
      setReauthPassword('');
      await loadSettings();
    } catch (err: any) {
      if (err.message && err.message.includes('confirme sua senha')) {
        setIsReauthModalOpen(true);
      } else {
        setErrorMessage(err.message || 'Erro ao salvar configurações.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Re-authentication submit
  const handleConfirmReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reauthPassword) {
      setReauthError('Digite a sua senha.');
      return;
    }

    try {
      setReauthLoading(true);
      setReauthError(null);
      await apiClient.verifyIntegrationPassword(reauthPassword);
      // Sucesso na verificação, procede para o save
      setIsReauthModalOpen(false);
      await handleSave(reauthPassword);
    } catch (err: any) {
      setReauthError(err.message || 'Senha incorreta.');
    } finally {
      setReauthLoading(false);
    }
  };

  // Test SMTP
  const handleTestSmtp = async () => {
    try {
      setSmtpTestLoading(true);
      setSmtpTestResult(null);
      const res = await apiClient.testSmtpConnection();
      setSmtpTestResult(res);
      if (res.success) {
        setInitialSetupMode(false);
        onSetupCompleted?.();
      }
    } catch (err: any) {
      setSmtpTestResult({ success: false, message: err.message || 'Falha no teste SMTP.' });
    } finally {
      setSmtpTestLoading(false);
    }
  };

  // Test Gemini
  const handleTestGemini = async () => {
    try {
      setGeminiTestLoading(true);
      setGeminiTestResult(null);
      const res = await apiClient.testGeminiConnection();
      setGeminiTestResult(res);
    } catch (err: any) {
      setGeminiTestResult({ success: false, message: err.message || 'Falha no teste da API Gemini.' });
    } finally {
      setGeminiTestLoading(false);
    }
  };

  // Send Admin Reset
  const handleSendAdminReset = async () => {
    try {
      setAdminResetLoading(true);
      setAdminResetResult(null);
      const res = await apiClient.sendAdminPasswordReset();
      setAdminResetResult(res);
    } catch (err: any) {
      setAdminResetResult({ success: false, message: err.message || 'Falha ao despachar link de redefinição.' });
    } finally {
      setAdminResetLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-500">Carregando painel de integrações e variáveis...</p>
      </div>
    );
  }

  const smtpSecret = getSecretInfo('SMTP_PASS');
  const geminiSecret = getSecretInfo('GEMINI_API_KEY');

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto animate-in fade-in select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integração & Infraestrutura</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              Exclusivo Desenvolvedor
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie variáveis dinâmicas de e-mail, limites de upload, chave de IA e políticas de sessão sem reiniciar o servidor.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadSettings}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors inline-flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recarregar</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-900 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-medium">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-900 text-xs animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Initial Setup Mode Notice */}
      {initialSetupMode && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3.5 text-amber-950 text-xs shadow-sm">
          <Mail className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="font-bold text-sm text-amber-900 flex items-center gap-2">
              <span>Configuração Inicial em Andamento</span>
              <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-[10px] uppercase tracking-wider font-extrabold">Modo Ativo</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              O sistema está aguardando a configuração do servidor SMTP. Preencha as credenciais na seção <strong>E-mail (SMTP)</strong> abaixo e clique em <strong>Salvar Alterações</strong>.
              O sistema fará automaticamente um disparo de teste para <strong>{currentUser.email}</strong>. Quando o teste for bem-sucedido, o 2FA será definitivamente ativado e este modo será concluído.
            </p>
          </div>
        </div>
      )}

      {/* Encryption Key Missing Notice */}
      {!encryptionKeyConfigured && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Aviso Crítico: Chave de Criptografia Ausente no .env</div>
            <p className="text-amber-800 leading-relaxed">
              A variável <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">SETTINGS_ENCRYPTION_KEY</code> não está configurada no seu arquivo <code>.env</code>.
              O salvamento de senhas e segredos no banco de dados está bloqueado até que você gere uma chave de 32 bytes em base64 e insira no servidor.
            </p>
            <div className="pt-1 text-[11px] font-mono text-amber-950">
              Gere com: <code>node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</code>
            </div>
          </div>
        </div>
      )}

      {/* Precedence Explanation Hint */}
      <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Ordem de Precedência:</strong> Banco de Dados &gt; Variável de Ambiente (.env) &gt; Padrão do Sistema.
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Banco</span>
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">.env</span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">Padrão</span>
        </div>
      </div>

      {/* Grid of Setting Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: E-MAIL (SMTP) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">E-mail (SMTP)</h2>
                  <p className="text-xs text-slate-500">Envio de códigos 2FA e redefinição de senhas</p>
                </div>
              </div>
            </div>

            {/* SMTP Host */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Servidor SMTP (Host)</label>
                {getSourceBadge('SMTP_HOST')}
              </div>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="ex: smtp.provedor.com.br"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
            </div>

            {/* SMTP Port & Secure Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Porta</label>
                  {getSourceBadge('SMTP_PORT')}
                </div>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Conexão Segura (SSL/TLS)</label>
                  {getSourceBadge('SMTP_SECURE')}
                </div>
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xs font-medium text-slate-700">
                    {smtpSecure ? 'Ligado (SSL)' : 'Desligado (STARTTLS)'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Dica: Ligado para a porta 465, desligado para a 587.</p>
              </div>
            </div>

            {/* SMTP User */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Usuário SMTP</label>
                {getSourceBadge('SMTP_USER')}
              </div>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="notificacoes@suaempresa.com.br"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
            </div>

            {/* SMTP Password (SECRET) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-slate-700">Senha SMTP</label>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">SEGREDO</span>
                </div>
                {getSourceBadge('SMTP_PASS')}
              </div>
              <div className="relative flex items-center">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={smtpSecret?.configured ? `•••••• ${smtpSecret.last4 || ''}` : 'Digite a senha do SMTP'}
                  className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass(!showSmtpPass)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600"
                    title={showSmtpPass ? 'Ocultar' : 'Exibir'}
                  >
                    {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {smtpSecret?.configured && (
                    <button
                      type="button"
                      onClick={() => {
                        setRemovedSecrets((prev) => [...prev, 'SMTP_PASS']);
                        setSmtpPass('');
                      }}
                      className="p-1 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remover segredo do banco de dados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {smtpSecret?.configured
                  ? 'Configurado com segurança. Deixe em branco para manter o valor atual.'
                  : 'Nenhuma senha gravada ainda.'}
              </p>
            </div>

            {/* SMTP From */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Remetente (SMTP_FROM)</label>
                {getSourceBadge('SMTP_FROM')}
              </div>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="DocSecure <nao-responda@empresa.com.br>"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
            </div>
          </div>

          {/* Test SMTP Action Button */}
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Dispara para: <strong>{currentUser.email}</strong>
              </span>
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={smtpTestLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {smtpTestLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Enviando teste...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar e-mail de teste</span>
                  </>
                )}
              </button>
            </div>

            {smtpTestResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in ${
                  smtpTestResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {smtpTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed font-medium">{smtpTestResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* CARD 2: SEGURANÇA E SESSÃO */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Segurança & Sessão</h2>
                  <p className="text-xs text-slate-500">Expiração de tokens HttpOnly e limites multipart</p>
                </div>
              </div>
            </div>

            {/* SESSION_TTL_HOURS */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Duração da Sessão (Horas)</label>
                {getSourceBadge('SESSION_TTL_HOURS')}
              </div>
              <input
                type="number"
                min="1"
                max="72"
                value={sessionTtlHours}
                onChange={(e) => setSessionTtlHours(e.target.value)}
                placeholder="8"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">Padrão: 8 horas (mínimo 1, máximo 72 horas). Renovada com o uso.</p>
            </div>

            {/* MAX_UPLOAD_MB */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Tamanho Máximo de Upload (MB)</label>
                {getSourceBadge('MAX_UPLOAD_MB')}
              </div>
              <input
                type="number"
                min="1"
                max="500"
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(e.target.value)}
                placeholder="25"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">Padrão: 25 MB (mínimo 1, máximo 500 MB).</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Sessões utilizam cookies HttpOnly com hash SHA-256 e proteção SameSite=Lax.</span>
          </div>
        </div>

        {/* CARD 3: ADMINISTRADOR PRINCIPAL */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Administrador Principal</h2>
                  <p className="text-xs text-slate-500">Gestão da conta mestre do sistema</p>
                </div>
              </div>
            </div>

            {/* ADMIN_EMAIL */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">E-mail do Administrador (ADMIN_EMAIL)</label>
                {getSourceBadge('ADMIN_EMAIL')}
              </div>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@empresa.com.br"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
              />
            </div>

            {/* ADMIN_INITIAL_PASSWORD (READ ONLY STATUS) */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Status do Admin Inicial</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    adminStatus.exists
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {adminStatus.exists ? `Criado em ${adminStatus.createdAt || 'banco'}` : 'Pendente'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                A variável <code className="font-mono">ADMIN_INITIAL_PASSWORD</code> é somente leitura nesta interface por motivos de segurança e só atua na criação do primeiro usuário caso o banco esteja vazio.
              </p>
            </div>
          </div>

          {/* Action: Send Reset Link */}
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Destinatário: <strong>{adminEmail || adminStatus.email || 'Admin'}</strong>
              </span>
              <button
                type="button"
                onClick={handleSendAdminReset}
                disabled={adminResetLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {adminResetLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span>Disparando...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Enviar link de redefinição de senha ao admin</span>
                  </>
                )}
              </button>
            </div>

            {adminResetResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in ${
                  adminResetResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {adminResetResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed font-medium">{adminResetResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* CARD 4: INTELIGÊNCIA ARTIFICIAL (GEMINI) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Inteligência Artificial</h2>
                  <p className="text-xs text-slate-500">Conexão com Google Gemini para análise de documentos</p>
                </div>
              </div>
            </div>

            {/* GEMINI_API_KEY */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-slate-700">GEMINI_API_KEY</label>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">SEGREDO</span>
                </div>
                {getSourceBadge('GEMINI_API_KEY')}
              </div>
              <div className="relative flex items-center">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder={geminiSecret?.configured ? `•••••• ${geminiSecret.last4 || ''}` : 'AIzaSy...'}
                  className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600"
                    title={showGeminiKey ? 'Ocultar' : 'Exibir'}
                  >
                    {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {geminiSecret?.configured && (
                    <button
                      type="button"
                      onClick={() => {
                        setRemovedSecrets((prev) => [...prev, 'GEMINI_API_KEY']);
                        setGeminiApiKey('');
                      }}
                      className="p-1 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remover segredo do banco de dados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {geminiSecret?.configured
                  ? 'Chave salva com criptografia AES-256-GCM. Deixe vazio para manter.'
                  : 'Nenhuma chave de API configurada.'}
              </p>
            </div>
          </div>

          {/* Test Gemini Action */}
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Modelo: <strong>gemini-2.5-flash</strong></span>
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={geminiTestLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {geminiTestLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Testar conexão</span>
                  </>
                )}
              </button>
            </div>

            {geminiTestResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in ${
                  geminiTestResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {geminiTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed font-medium">{geminiTestResult.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION: ATUALIZAÇÃO DO SISTEMA (GITHUB → VPS) */}
      <SystemUpdatePanel />

      {/* SECTION: VARIÁVEIS EXCLUSIVAS DO .ENV (SOMENTE LEITURA) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Variáveis Restritas do Servidor (.env)</h2>
              <p className="text-xs text-slate-500">
                Por diretrizes de segurança, estas variáveis não são editáveis pela interface e nunca têm seus valores expostos.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {envOnlyList.map((envItem) => (
            <div
              key={envItem.key}
              className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs font-mono font-bold text-slate-800 truncate" title={envItem.key}>
                  {envItem.key}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  envItem.isSet
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600 border border-slate-300'
                }`}
              >
                {envItem.isSet ? 'Definido' : 'Não definido'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* RE-AUTHENTICATION MODAL */}
      {isReauthModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Confirmação de Segurança</h3>
              <p className="text-xs text-slate-500 mt-1">
                Para salvar alterações nas variáveis de infraestrutura, confirme a sua senha de desenvolvedor.
              </p>
            </div>

            {reauthError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {reauthError}
              </div>
            )}

            <form onSubmit={handleConfirmReauth} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Sua Senha Atual</label>
                <input
                  type="password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReauthModalOpen(false);
                    setReauthPassword('');
                  }}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={reauthLoading}
                  className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {reauthLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <span>Confirmar & Salvar</span>
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
