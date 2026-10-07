import React from 'react';
import {
  Home,
  Users,
  FolderTree,
  ShieldCheck,
  ClipboardList,
  Settings,
  Folder,
  Star,
  Trash2,
  HardDrive,
  Laptop,
  Building,
  LogOut,
  ChevronRight,
  Server,
  Code2,
} from 'lucide-react';
import { DocSecureLogo } from '../common/DocSecureLogo';
import { User } from '../../types';

export type NavigationTab =
  | 'dev_dashboard'
  | 'users'
  | 'sectors'
  | 'permissions'
  | 'devices'
  | 'storage'
  | 'audit_logs'
  | 'system'
  | 'settings'
  | 'my_documents'
  | 'shared'
  | 'favorites'
  | 'trash';

interface DesktopSidebarProps {
  currentUser: User;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onLogout: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
}) => {
  const isDeveloper = currentUser.role === 'DEVELOPER';

  return (
    <aside className="w-64 bg-[#08101e] border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen select-none sticky top-0">
      {/* Top Brand Logo Area */}
      <div>
        <div className="p-5 border-b border-slate-800/80">
          <DocSecureLogo size="md" showSubtitle={false} />
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1 mt-2">
          {isDeveloper ? (
            <>
              {/* Developer Sidebar Menu Items */}
              <button
                type="button"
                onClick={() => onSelectTab('dev_dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'dev_dashboard'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>Painel do Desenvolvedor</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('users')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'users'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Usuários</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('sectors')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'sectors'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <FolderTree className="w-4 h-4 shrink-0" />
                <span>Setores</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('permissions')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'permissions'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Permissões</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('devices')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'devices'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Laptop className="w-4 h-4 shrink-0" />
                <span>Dispositivos</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('storage')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'storage'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <HardDrive className="w-4 h-4 shrink-0" />
                <span>Armazenamento</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('audit_logs')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'audit_logs'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Logs de Acesso</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('system')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'system'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Server className="w-4 h-4 shrink-0" />
                <span>Sistema & Infra</span>
              </button>
            </>
          ) : (
            <>
              {/* Employee / Manager / Director Menu Items */}
              <button
                type="button"
                onClick={() => onSelectTab('my_documents')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'my_documents'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Folder className="w-4 h-4 shrink-0" />
                <span>Meus Documentos</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('shared')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'shared'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Compartilhados comigo</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('favorites')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'favorites'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Star className="w-4 h-4 shrink-0" />
                <span>Favoritos</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab('trash')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'trash'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Lixeira</span>
              </button>

              {currentUser.role === 'MANAGER' && (
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Gestão ({currentUser.departmentName})
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTab('users')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'users'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span>Colaboradores</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTab('permissions')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'permissions'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Permissões do Setor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTab('system')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'system'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Server className="w-4 h-4 shrink-0" />
                    <span>Sistema</span>
                  </button>
                </div>
              )}

              {currentUser.role === 'DIRECTOR' && (
                <div className="pt-3 mt-3 border-t border-slate-800/60">
                  <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Diretoria Executiva
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectTab('sectors')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'sectors'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Building className="w-4 h-4 shrink-0" />
                    <span>Visão de Setores</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTab('audit_logs')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'audit_logs'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <span>Auditoria Corporativa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTab('system')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'system'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Server className="w-4 h-4 shrink-0" />
                    <span>Sistema</span>
                  </button>
                </div>
              )}
            </>
          )}
        </nav>
      </div>

      {/* Bottom Area: Settings & Logout */}
      <div className="p-3 border-t border-slate-800/80 space-y-1">
        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'settings'
              ? 'bg-[#2563eb] text-white'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Configurações</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
      </div>
    </aside>
  );
};
