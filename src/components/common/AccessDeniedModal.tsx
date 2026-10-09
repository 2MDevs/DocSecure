import React from 'react';
import { ShieldAlert, Lock, ArrowLeft, KeyRound } from 'lucide-react';

interface AccessDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  resourceName?: string;
  requiredRoleOrPermission?: string;
}

export const AccessDeniedModal: React.FC<AccessDeniedModalProps> = ({
  isOpen,
  onClose,
  reason = 'Você não possui permissão para acessar esta pasta ou executar esta operação.',
  resourceName,
  requiredRoleOrPermission,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 relative overflow-hidden max-h-[90dvh] overflow-y-auto">
        {/* Top security banner accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-red-500 to-amber-500" />

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-rose-100 text-rose-800 mb-1">
              <Lock className="w-3 h-3" /> 403 Forbidden
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              Acesso Não Autorizado
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Protocolo de Segurança RBAC — Tentativa Registrada na Auditoria
            </p>
          </div>
        </div>

        <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
          {resourceName && (
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-slate-600">
              <span className="text-slate-500">Recurso Solicitado:</span>
              <span className="font-semibold text-slate-900 truncate max-w-[200px]">{resourceName}</span>
            </div>
          )}
          <p className="text-slate-600 leading-relaxed">{reason}</p>
          {requiredRoleOrPermission && (
            <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 p-2 rounded-lg text-[11px]">
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>Requer permissão: <strong>{requiredRoleOrPermission}</strong></span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Entendido, Voltar
          </button>
        </div>
      </div>
    </div>
  );
};
