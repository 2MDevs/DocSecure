import React, { useEffect } from 'react';
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
  SlidersHorizontal,
  X,
  Database,
  ExternalLink,
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
  | 'integrations'
  | 'settings'
  | 'my_documents'
  | 'shared'
  | 'favorites'
  | 'trash';

interface SidebarProps {
  currentUser: User;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  dbStatus?: {
    connected: boolean;
    databaseName: string;
    latencyMs: number;
    mode: string;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  isOpen = false,
  onClose,
  dbStatus,
}) => {
  const isDeveloper = currentUser.role === 'DEVELOPER';

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose?.();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose]);

  const handleItemClick = (tab: NavigationTab) => {
    onSelectTab(tab);
    onClose?.();
  };

  const content = (
    <div className="w-72 sm:w-80 lg:w-64 bg-[#08101e] border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-full select-none text-slate-100 overflow-y-auto">
      {/* Top Brand Logo Area */}
      <div>
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between">
          <DocSecureLogo size="md" showSubtitle={false} />
          {/* Close button for mobile drawer */}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Database status indicator (visible in mobile drawer if available) */}
        {dbStatus && (
          <div className="lg:hidden mx-3 mt-3 px-3 py-2 bg-slate-900/90 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className={`w-3.5 h-3.5 ${dbStatus.connected ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="font-mono text-slate-300 font-semibold">{dbStatus.databaseName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>{dbStatus.latencyMs}ms</span>
              <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>
          </div>
        )}

        {/* Navigation List */}
        <nav className="p-3 space-y-1 mt-1">
          {isDeveloper ? (
            <>
              {/* Developer Sidebar Menu Items */}
              <button
                type="button"
                onClick={() => handleItemClick('dev_dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('users')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('sectors')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'sectors'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Building className="w-4 h-4 shrink-0" />
                <span>Setores</span>
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('permissions')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('devices')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('storage')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('audit_logs')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'audit_logs'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Auditoria</span>
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('system')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'system'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Server className="w-4 h-4 shrink-0" />
                <span>Sistema</span>
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('integrations')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'integrations'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span>Integração</span>
              </button>
            </>
          ) : (
            <>
              {/* Employee / Manager / Director Menu Items */}
              <button
                type="button"
                onClick={() => handleItemClick('my_documents')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('favorites')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                onClick={() => handleItemClick('shared')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'shared'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <FolderTree className="w-4 h-4 shrink-0" />
                <span>Compartilhados</span>
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('trash')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                  activeTab === 'trash'
                    ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Lixeira</span>
              </button>

              {/* Manager & Director Extra Sections */}
              {(currentUser.role === 'MANAGER' || currentUser.role === 'DIRECTOR') && (
                <div className="pt-3 mt-3 border-t border-slate-800/60 space-y-1">
                  <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Administração
                  </div>
                  <button
                    type="button"
                    onClick={() => handleItemClick('users')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                    onClick={() => handleItemClick('devices')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                      activeTab === 'devices'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Laptop className="w-4 h-4 shrink-0" />
                    <span>Dispositivos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleItemClick('audit_logs')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
                    onClick={() => handleItemClick('system')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
      <div className="p-3 border-t border-slate-800/80 space-y-1 pb-safe">
        <button
          type="button"
          onClick={() => handleItemClick('settings')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
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
          onClick={() => {
            onLogout();
            onClose?.();
          }}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/30 transition-colors min-h-[44px] cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (>= 1024px: lg) */}
      <aside className="hidden lg:flex w-64 bg-[#08101e] border-r border-slate-800/80 shrink-0 h-screen select-none sticky top-0 z-30">
        {content}
      </aside>

      {/* Mobile / Tablet Drawer (< 1024px: < lg) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer slide-out panel */}
          <div className="relative z-10 h-full max-w-[85vw] flex animate-in slide-in-from-left duration-250 shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
