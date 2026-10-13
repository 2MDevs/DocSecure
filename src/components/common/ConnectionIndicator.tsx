import React from 'react';
import { RefreshCw, CloudOff, Check } from 'lucide-react';
import { useConnectionStatus, recheckConnection } from '../../services/connectivity';

interface ConnectionIndicatorProps {
  pendingCount?: number;
}

/**
 * Indicador único de conexão com o servidor/banco:
 * - setas girando: conectando / sincronizando
 * - ponto verde com check: conectado, tudo salvo
 * - nuvem cortada vermelha: sem conexão (alterações bloqueadas; envios ficam na fila)
 */
export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ pendingCount = 0 }) => {
  const status = useConnectionStatus();
  const syncing = status === 'online' && pendingCount > 0;

  const label =
    status === 'offline'
      ? 'Sem conexão'
      : status === 'connecting'
      ? 'Conectando…'
      : syncing
      ? `Sincronizando ${pendingCount}`
      : 'Conectado';

  const title =
    status === 'offline'
      ? `Sem conexão com o servidor. Alterações estão bloqueadas para não perder dados.${
          pendingCount ? ` ${pendingCount} arquivo(s) aguardando envio neste navegador.` : ''
        } Clique para tentar novamente.`
      : status === 'connecting'
      ? 'Verificando a conexão com o servidor…'
      : syncing
      ? `Enviando ${pendingCount} arquivo(s) que estavam na fila.`
      : 'Conectado ao servidor. Tudo sincronizado.';

  return (
    <button
      type="button"
      onClick={() => status !== 'online' && recheckConnection()}
      title={title}
      aria-label={title}
      className={`h-8 px-2 rounded-full inline-flex items-center gap-1.5 text-[11px] font-medium border transition-colors ${
        status === 'offline'
          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
          : status === 'connecting' || syncing
          ? 'bg-slate-50 border-slate-200 text-slate-600'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}
    >
      {status === 'offline' ? (
        <CloudOff className="w-3.5 h-3.5" />
      ) : status === 'connecting' || syncing ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
      ) : (
        <span className="relative flex items-center justify-center w-3.5 h-3.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-30 animate-ping [animation-duration:3s]" />
          <span className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500">
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </span>
        </span>
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};
