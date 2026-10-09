import React, { useState } from 'react';
import { ShieldCheck, Smartphone, KeyRound, AlertCircle, RefreshCw } from 'lucide-react';

interface TwoFactorModalProps {
  isOpen: boolean;
  onVerify: (code: string) => void;
  onCancel: () => void;
  userName: string;
  email: string;
  error?: string;
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({
  isOpen,
  onVerify,
  onCancel,
  userName,
  email,
  error,
}) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  if (!isOpen) return null;

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`2fa-input-${index + 1}`);
      nextInput?.focus();
    }

    if (newCode.every((d) => d !== '')) {
      onVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`2fa-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newCode = [...code];
      for (let i = 0; i < 6; i++) {
        newCode[i] = pasted[i] || '';
      }
      setCode(newCode);
      if (pasted.length === 6) {
        onVerify(pasted);
      }
    }
  };

  const handleQuickFill = () => {
    const defaultCode = '123456';
    setCode(defaultCode.split(''));
    onVerify(defaultCode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0f172a] text-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-700 relative overflow-hidden max-h-[90dvh] overflow-y-auto">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold tracking-tight text-white">
            Autenticação em Dois Fatores (2FA)
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Digite o código de 6 dígitos gerado pelo aplicativo autenticador para <strong>{userName}</strong> ({email}).
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {!useBackupCode ? (
          <div className="mt-6">
            <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  id={`2fa-input-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  autoFocus={idx === 0}
                  className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-mono font-bold bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all shadow-inner"
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <button
                type="button"
                onClick={handleQuickFill}
                className="text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Preencher código demo (123456)
              </button>

              <button
                type="button"
                onClick={() => setUseBackupCode(true)}
                className="text-slate-400 hover:text-white underline transition-colors"
              >
                Usar chave de contingência
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Chave Criptográfica de Recuperação (Backup)
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="ex: DOC-SEC-9842-8821"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onVerify(backupCode || 'BACKUP-123')}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Validar Chave de Recuperação
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setUseBackupCode(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← Voltar para código do aplicativo
              </button>
            </div>
          </div>
        )}

        <div className="mt-7 pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancelar Login
          </button>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Smartphone className="w-3.5 h-3.5" />
            <span>RFC 6238 TOTP Padrão</span>
          </div>
        </div>
      </div>
    </div>
  );
};
