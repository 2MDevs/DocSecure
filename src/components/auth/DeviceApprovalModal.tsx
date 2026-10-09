import React from 'react';
import { Laptop, ShieldAlert, CheckCircle2, AlertTriangle, Fingerprint, Lock } from 'lucide-react';
import { Device, User } from '../../types';

interface DeviceApprovalModalProps {
  isOpen: boolean;
  user: User | null;
  currentDevice: Partial<Device>;
  onApproveByAdmin: () => void;
  onCancel: () => void;
}

export const DeviceApprovalModal: React.FC<DeviceApprovalModalProps> = ({
  isOpen,
  user,
  currentDevice,
  onApproveByAdmin,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f172a] text-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-amber-500/30 relative overflow-hidden max-h-[90dvh] overflow-y-auto">
        {/* Top warning line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        <div className="flex items-start gap-4">
          <div className="w-13 h-13 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 uppercase tracking-wider mb-1">
              <Lock className="w-3 h-3" /> Política Zero-Trust
            </span>
            <h3 className="text-xl font-bold text-white">
              Novo Dispositivo Detectado
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              O acesso a partir deste terminal não está na lista de dispositivos confiáveis autorizados.
            </p>
          </div>
        </div>

        {/* Device metadata card */}
        <div className="mt-5 p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-300 pb-2 border-b border-slate-800">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Laptop className="w-4 h-4 text-blue-400" /> Terminal:
            </span>
            <span className="font-semibold text-white">{currentDevice.deviceName || 'Navegador Web Desconhecido'}</span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500">Sistema Operacional:</span>
            <span className="font-medium text-slate-200">{currentDevice.os || 'Windows 11 Enterprise'}</span>
          </div>

          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500">Endereço IP Origem:</span>
            <span className="font-mono text-amber-400 font-medium">{currentDevice.ipAddress || '187.54.120.45'}</span>
          </div>

          <div className="flex items-center justify-between text-slate-300 pt-1">
            <span className="text-slate-500 flex items-center gap-1">
              <Fingerprint className="w-3.5 h-3.5 text-slate-400" /> Hash Criptográfico:
            </span>
            <span className="font-mono text-[11px] text-slate-400 truncate max-w-[200px]">
              {currentDevice.fingerprintHash || 'sha256-a9f87c6b54321'}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-950/40 rounded-xl border border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Uma solicitação de autorização foi despachada para a <strong>Diretoria e Administrador do Sistema</strong>.
            Você também pode simular a aprovação instantânea pelo painel administrativo abaixo.
          </p>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancelar Acesso
          </button>

          <button
            type="button"
            onClick={onApproveByAdmin}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all inline-flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Autorizar Dispositivo (Simular Admin)
          </button>
        </div>
      </div>
    </div>
  );
};
