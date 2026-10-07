import React from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Fingerprint,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Device, User } from '../../types';

interface DevicesManagementProps {
  currentUser: User;
  devices: Device[];
  onApproveDevice: (deviceId: string) => void;
  onBlockDevice: (deviceId: string) => void;
  onRevokeDevice: (deviceId: string) => void;
}

export const DevicesManagement: React.FC<DevicesManagementProps> = ({
  currentUser,
  devices,
  onApproveDevice,
  onBlockDevice,
  onRevokeDevice,
}) => {
  // If employee/manager, only show their own devices unless Developer/Director
  const visibleDevices =
    currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR'
      ? devices
      : devices.filter((d) => d.userId === currentUser.id);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-blue-600" />;
      case 'tablet':
        return <Tablet className="w-5 h-5 text-indigo-600" />;
      default:
        return <Laptop className="w-5 h-5 text-blue-600" />;
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {currentUser.role === 'DEVELOPER' ? 'Controle de Dispositivos Confiáveis (Zero-Trust)' : 'Meus Dispositivos'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerenciamento de credenciais de hardware criptográfico e controle de sessões.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold border border-emerald-200 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Política de Dispositivo Confiável Ativa
          </span>
        </div>
      </div>

      {/* Warning Box */}
      <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200/80 flex items-start gap-3 text-xs text-blue-900">
        <Fingerprint className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold">Mecanismo Criptográfico de Validação de Hardware:</span>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Cada login exige uma chave simétrica assinada pelo navegador e validada contra o inventário seguro.
            Novos terminais são colocados em quarentena imediata até autorização expressa.
          </p>
        </div>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleDevices.map((dev) => (
          <div
            key={dev.id}
            className={`bg-white p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between space-y-4 ${
              dev.status === 'TRUSTED'
                ? 'border-slate-200/80 hover:border-blue-300'
                : dev.status === 'PENDING_APPROVAL'
                ? 'border-amber-300 bg-amber-50/20'
                : 'border-rose-200 bg-rose-50/20'
            }`}
          >
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    {getDeviceIcon(dev.deviceType)}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      {dev.deviceName}
                      {dev.isCurrent && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-100 text-blue-700 font-semibold">
                          Este terminal
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-slate-500">Usuário: {dev.userName}</span>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    dev.status === 'TRUSTED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : dev.status === 'PENDING_APPROVAL'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {dev.status === 'TRUSTED'
                    ? 'Confiável'
                    : dev.status === 'PENDING_APPROVAL'
                    ? 'Pendente'
                    : 'Bloqueado'}
                </span>
              </div>

              {/* Specs */}
              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Sistema / Browser:</span>
                  <span className="font-medium text-slate-800">{dev.os} • {dev.browser}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Endereço IP:</span>
                  <span className="font-mono text-slate-700">{dev.ipAddress}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Último Acesso:</span>
                  <span className="text-slate-700">{dev.lastAccessAt}</span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hash Criptográfico:</span>
                  <span className="font-mono text-[10px] text-slate-500 truncate block bg-slate-50 p-1 rounded">
                    {dev.fingerprintHash}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              {dev.status === 'PENDING_APPROVAL' ? (
                <button
                  type="button"
                  onClick={() => onApproveDevice(dev.id)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprovar Dispositivo
                </button>
              ) : dev.status === 'TRUSTED' ? (
                <>
                  <button
                    type="button"
                    onClick={() => onBlockDevice(dev.id)}
                    className="text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
                  >
                    <Lock className="w-3.5 h-3.5" /> Bloquear
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevokeDevice(dev.id)}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Revogar Token
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onApproveDevice(dev.id)}
                  className="w-full py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-semibold transition-colors"
                >
                  Desbloquear e Autorizar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
