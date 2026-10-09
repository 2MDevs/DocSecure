import React from 'react';
import {
  Users,
  UserCheck,
  Building,
  ClipboardList,
  UserPlus,
  FolderTree,
  ShieldCheck,
  FileText,
  ChevronRight,
  Settings,
  ArrowUpRight,
  HardDrive,
  Shield,
  Activity,
} from 'lucide-react';
import { AuditLog, Department, User } from '../../types';
import { NavigationTab } from '../layout/DesktopSidebar';

interface DeveloperDashboardProps {
  usersCount: number;
  managersCount: number;
  sectorsCount: number;
  auditLogsCount: number;
  recentAuditLogs: AuditLog[];
  onNavigate: (tab: NavigationTab) => void;
  onOpenCreateUser: () => void;
  onOpenCreateSector: () => void;
}

export const DeveloperDashboard: React.FC<DeveloperDashboardProps> = ({
  usersCount = 248,
  managersCount = 12,
  sectorsCount = 8,
  auditLogsCount = 1432,
  recentAuditLogs,
  onNavigate,
  onOpenCreateUser,
  onOpenCreateSector,
}) => {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Title & Subtitle matching the screenshot */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Painel do Desenvolvedor
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie o sistema, usuários, setores e permissões.
        </p>
      </div>

      {/* 4 Stat Cards in 4-column grid matching screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Usuários Cadastrados */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Usuários Cadastrados
            </span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {usersCount.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {/* Card 2: Gestores de Área */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Gestores de Área
            </span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {managersCount}
            </span>
          </div>
        </div>

        {/* Card 3: Setores */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Setores
            </span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {sectorsCount}
            </span>
          </div>
        </div>

        {/* Card 4: Logs de Acesso (24h) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">
              Logs de Acesso (24h)
            </span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {auditLogsCount.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      {/* Ações Rápidas Section */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cadastrar Usuário */}
          <button
            type="button"
            onClick={onOpenCreateUser}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all text-left group flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                Cadastrar Usuário
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Adicione novos colaboradores ao sistema.
              </p>
            </div>
          </button>

          {/* Card 2: Gerenciar Setores */}
          <button
            type="button"
            onClick={() => onNavigate('sectors')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all text-left group flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FolderTree className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                Gerenciar Setores
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Crie e edite os setores da empresa.
              </p>
            </div>
          </button>

          {/* Card 3: Configurar Permissões */}
          <button
            type="button"
            onClick={() => onNavigate('permissions')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all text-left group flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                Configurar Permissões
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Defina o que cada usuário pode acessar.
              </p>
            </div>
          </button>

          {/* Card 4: Ver Logs de Acesso */}
          <button
            type="button"
            onClick={() => onNavigate('audit_logs')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all text-left group flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                Ver Logs de Acesso
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Acompanhe as atividades no sistema.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Split Bottom: Últimos Acessos (Left) + Acesso Rápido (Right) matching screenshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Últimos Acessos */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Últimos Acessos</h2>
            <button
              type="button"
              onClick={() => onNavigate('audit_logs')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors inline-flex items-center gap-1"
            >
              <span>Ver todos</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Card List (< sm) */}
          <div className="sm:hidden space-y-2 mt-2">
            {recentAuditLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{log.userName}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">{log.timestamp}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {log.action === 'LOGIN'
                      ? 'Login'
                      : log.action === 'DOCUMENT_VIEWED'
                      ? 'Acesso a documento'
                      : log.action === 'PERMISSIONS_MODIFIED'
                      ? 'Alterou permissões'
                      : log.action === 'DOCUMENT_DOWNLOADED'
                      ? 'Download de documento'
                      : log.action}
                  </span>
                  <span className="font-medium text-slate-600">{log.department}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop / Tablet Table (sm+) */}
          <div className="hidden sm:block overflow-x-auto mt-2">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-400 font-semibold border-b border-slate-100">
                  <th className="py-2.5 px-2 font-medium">Usuário</th>
                  <th className="py-2.5 px-2 font-medium">Ação</th>
                  <th className="py-2.5 px-2 font-medium">Setor</th>
                  <th className="py-2.5 px-2 font-medium">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentAuditLogs.slice(0, 4).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-2 font-medium text-slate-900">{log.userName}</td>
                    <td className="py-3 px-2 text-slate-600">
                      {log.action === 'LOGIN'
                        ? 'Login'
                        : log.action === 'DOCUMENT_VIEWED'
                        ? 'Acesso a documento'
                        : log.action === 'PERMISSIONS_MODIFIED'
                        ? 'Alterou permissões'
                        : log.action === 'DOCUMENT_DOWNLOADED'
                        ? 'Download de documento'
                        : log.action}
                    </td>
                    <td className="py-3 px-2 text-slate-600">{log.department}</td>
                    <td className="py-3 px-2 text-slate-500 tabular-nums">{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Card: Acesso Rápido list */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Acesso Rápido
            </h2>

            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => onNavigate('users')}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Gerenciar Usuários</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('sectors')}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <FolderTree className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Gerenciar Setores</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('permissions')}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Permissões</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Configurações do Sistema</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Status da API: Saudável</span>
            <span className="font-mono text-emerald-600 font-semibold">99.99% Up</span>
          </div>
        </div>
      </div>
    </div>
  );
};
