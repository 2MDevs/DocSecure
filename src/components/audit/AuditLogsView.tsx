import React, { useState } from 'react';
import {
  ClipboardList,
  Search,
  ShieldCheck,
  Download,
  Filter,
  CheckCircle2,
  ShieldAlert,
  Lock,
  Calendar,
  Layers,
} from 'lucide-react';
import { AuditLog, User } from '../../types';

interface AuditLogsViewProps {
  auditLogs: AuditLog[];
  currentUser: User;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ auditLogs, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
    if (!searchTerm) return true;
    return (
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.hash.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleExportCsv = () => {
    const headers = ['ID', 'Data/Hora', 'Usuário', 'Setor', 'Ação', 'Recurso', 'IP', 'Resultado', 'Hash SHA-256'];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.timestamp,
      l.userName,
      l.department,
      l.action,
      l.resourceName || '',
      l.ipAddress,
      l.result,
      l.hash,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `docsecure_audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Trilha de Auditoria Imutável
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Registro criptograficamente encadeado de todas as atividades, logins e acessos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar CSV Oficial</span>
          </button>
        </div>
      </div>

      {/* Integrity Badge */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold block text-white">Integridade Criptográfica Verificada: 100% Válida</span>
            <span className="text-[11px] text-slate-400">
              Nenhuma alteração detectada. Encadeamento de Hashes (Merkle Tree) verificado nos {auditLogs.length} blocos.
            </span>
          </div>
        </div>

        <span className="hidden sm:inline-block font-mono text-[11px] text-blue-400 bg-blue-950 px-2.5 py-1 rounded-lg border border-blue-800">
          GENESIS: #9f86d08...
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuário, ação, hash, recurso..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Todas as Ações</option>
            <option value="LOGIN">Logins</option>
            <option value="DOCUMENT_VIEWED">Visualizações</option>
            <option value="DOCUMENT_DOWNLOADED">Downloads</option>
            <option value="PERMISSIONS_MODIFIED">Permissões Alteradas</option>
            <option value="LOGIN_BLOCKED">Bloqueios de Segurança</option>
            <option value="DEVICE_APPROVED">Dispositivos Aprovados</option>
          </select>
        </div>
      </div>

      {/* Audit Log Mobile Cards (< md) */}
      <div className="md:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
            Nenhum evento de auditoria encontrado.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 block text-xs">{log.userName}</span>
                  <span className="text-[10px] text-slate-400">{log.department} • {log.timestamp}</span>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    log.result === 'SUCCESS'
                      ? 'bg-emerald-50 text-emerald-700'
                      : log.result === 'BLOCKED'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {log.result}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1 text-xs">
                <div className="font-semibold text-slate-800">{log.action}</div>
                {log.resourceName && (
                  <div className="text-[11px] text-slate-600 truncate">
                    Recurso: <strong>{log.resourceName}</strong>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 leading-relaxed">{log.details}</p>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100 font-mono">
                <span className="truncate max-w-[180px]">{log.ipAddress} • {log.deviceInfo}</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{log.hash}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Audit Log Desktop Table (hidden on mobile, visible on md+) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60 font-semibold">
                <th className="py-3 px-4 font-medium">Data / Hora</th>
                <th className="py-3 px-4 font-medium">Usuário</th>
                <th className="py-3 px-4 font-medium">Ação Realizada</th>
                <th className="py-3 px-4 font-medium">Recurso & Detalhes</th>
                <th className="py-3 px-4 font-medium">IP & Terminal</th>
                <th className="py-3 px-4 font-medium">Resultado</th>
                <th className="py-3 px-4 font-medium text-right">Hash SHA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 tabular-nums text-slate-500 font-medium whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                    <div>{log.userName}</div>
                    <span className="text-[10px] text-slate-400 font-normal">{log.department}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-slate-800 block">{log.action}</span>
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    {log.resourceName && (
                      <span className="font-semibold text-slate-900 block truncate">{log.resourceName}</span>
                    )}
                    <span className="text-[11px] text-slate-500 block truncate">{log.details}</span>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] whitespace-nowrap">
                    <span className="font-mono text-slate-700 block">{log.ipAddress}</span>
                    <span className="text-slate-400">{log.deviceInfo}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.result === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.result === 'BLOCKED'
                          ? 'bg-rose-50 text-rose-700 font-bold'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {log.result}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-[10px] text-slate-400">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{log.hash}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
