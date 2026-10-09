import React from 'react';
import {
  Folder,
  Star,
  FolderTree,
  Upload,
  Menu,
  Home,
  Users,
  ClipboardList,
  SlidersHorizontal,
} from 'lucide-react';
import { User } from '../../types';
import { NavigationTab } from './Sidebar';

interface MobileBottomNavProps {
  currentUser: User;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenUpload?: () => void;
  onOpenMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onOpenUpload,
  onOpenMenu,
}) => {
  const isDeveloper = currentUser.role === 'DEVELOPER';

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#08101e]/95 backdrop-blur-md border-t border-slate-800/90 px-2 pb-safe select-none shadow-2xl"
      aria-label="Navegação móvel"
    >
      <div className="flex items-center justify-around h-14">
        {isDeveloper ? (
          <>
            {/* Developer Shortcut 1: Painel */}
            <button
              type="button"
              onClick={() => onSelectTab('dev_dashboard')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'dev_dashboard' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Painel</span>
            </button>

            {/* Developer Shortcut 2: Usuários */}
            <button
              type="button"
              onClick={() => onSelectTab('users')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'users' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Usuários</span>
            </button>

            {/* Developer Shortcut 3: Auditoria */}
            <button
              type="button"
              onClick={() => onSelectTab('audit_logs')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'audit_logs' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ClipboardList className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Auditoria</span>
            </button>

            {/* Developer Shortcut 4: Integração */}
            <button
              type="button"
              onClick={() => onSelectTab('integrations')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'integrations' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Integração</span>
            </button>

            {/* Developer Shortcut 5: Menu */}
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Menu className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Menu</span>
            </button>
          </>
        ) : (
          <>
            {/* Employee Shortcut 1: Documentos */}
            <button
              type="button"
              onClick={() => onSelectTab('my_documents')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'my_documents' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Folder className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Documentos</span>
            </button>

            {/* Employee Shortcut 2: Favoritos */}
            <button
              type="button"
              onClick={() => onSelectTab('favorites')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'favorites' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Favoritos</span>
            </button>

            {/* Employee Shortcut 3: Compartilhados */}
            <button
              type="button"
              onClick={() => onSelectTab('shared')}
              className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                activeTab === 'shared' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderTree className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Partilhados</span>
            </button>

            {/* Employee Shortcut 4: Enviar (Upload) */}
            {onOpenUpload && (
              <button
                type="button"
                onClick={onOpenUpload}
                className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 -mt-2">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-[10px] leading-none mt-0.5 font-medium">Enviar</span>
              </button>
            )}

            {/* Employee Shortcut 5: Menu */}
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Menu className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-none">Menu</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
};
