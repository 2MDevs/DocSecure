import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Home } from 'lucide-react';
import { NavigationTab } from './Sidebar';
import { Header } from './Header';
import { NavPane, ExplorerLocation } from './NavPane';
import { Department, Folder, User, SystemNotification } from '../../types';

interface AppShellProps {
  currentUser: User;
  activeTab: NavigationTab;
  allowedTabs: NavigationTab[];
  onSelectTab: (tab: NavigationTab) => void;
  onLogout: () => void;
  availableUsers: User[];
  onSwitchUser?: (user: User) => void;
  onOpenDevices: () => void;
  onOpenSecurity: () => void;
  notifications: SystemNotification[];
  isMobileFrameActive?: boolean;
  onToggleMobileFrame?: () => void;
  dbStatus?: { connected: boolean; databaseName: string; latencyMs: number; mode: string };
  currentTitle?: string;
  departments: Department[];
  folders: Folder[];
  explorerLocation: ExplorerLocation;
  onOpenLocation: (location: ExplorerLocation) => void;
  initialSetupBanner?: React.ReactNode;
  apiSyncErrorBanner?: React.ReactNode;
  children: React.ReactNode;
}

// Telas que já têm a própria barra de comandos/endereço (o explorador de arquivos)
const EXPLORER_TABS: NavigationTab[] = ['my_documents', 'favorites', 'shared'];
const ADMIN_TABS: NavigationTab[] = ['dev_dashboard', 'users', 'sectors', 'permissions', 'devices', 'audit_logs', 'system', 'integrations'];

/**
 * Janela única no estilo do Explorador do Windows: barra superior, um só menu lateral
 * (painel de navegação) e a área de conteúdo. Todas as telas abrem dentro dela.
 */
export const AppShell: React.FC<AppShellProps> = ({
  currentUser,
  activeTab,
  allowedTabs,
  onSelectTab,
  onLogout,
  availableUsers,
  onSwitchUser,
  onOpenDevices,
  onOpenSecurity,
  notifications,
  isMobileFrameActive,
  onToggleMobileFrame,
  dbStatus,
  currentTitle,
  departments,
  folders,
  explorerLocation,
  onOpenLocation,
  initialSetupBanner,
  apiSyncErrorBanner,
  children,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const isExplorer = EXPLORER_TABS.includes(activeTab);
  const isAdmin = ADMIN_TABS.includes(activeTab);
  const btn = 'h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 inline-flex items-center justify-center';

  return (
    <div className="h-screen h-[100dvh] bg-[#eef1f5] text-slate-900 flex flex-col overflow-hidden">
      {initialSetupBanner}

      <Header
        currentUser={currentUser}
        availableUsers={availableUsers}
        onSwitchUser={onSwitchUser}
        onLogout={onLogout}
        onOpenDevices={onOpenDevices}
        onOpenSecurity={onOpenSecurity}
        onToggleSidebar={() => setIsNavOpen((v) => !v)}
        currentTitle={currentTitle}
        showSearchBar={false}
        notifications={notifications}
        isMobileFrameActive={isMobileFrameActive}
        onToggleMobileFrame={onToggleMobileFrame}
        dbStatus={dbStatus}
      />

      {apiSyncErrorBanner}

      <div className="flex-1 min-h-0 flex">
        <NavPane
          currentUser={currentUser}
          activeTab={activeTab}
          allowedTabs={allowedTabs}
          departments={departments}
          folders={folders}
          explorerLocation={explorerLocation}
          onSelectTab={onSelectTab}
          onOpenLocation={onOpenLocation}
          onLogout={onLogout}
          isOpen={isNavOpen}
          onClose={() => setIsNavOpen(false)}
          dbStatus={dbStatus}
        />

        <main className="flex-1 min-w-0 flex flex-col bg-white">
          {!isExplorer && (
            /* Barra de endereço das demais telas (mesmo visual do explorador) */
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 bg-white shrink-0">
              <button type="button" className={btn} onClick={() => window.history.back()} title="Voltar">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button type="button" className={`${btn} hidden sm:inline-flex`} onClick={() => window.history.forward()} title="Avançar">
                <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" className={btn} onClick={() => onOpenLocation({ deptId: null, folderId: null })} title="Início">
                <ArrowUp className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0 h-8 px-2 border border-slate-200 rounded-md flex items-center gap-0.5 text-[13px] text-slate-700 overflow-x-auto whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onOpenLocation({ deptId: null, folderId: null })}
                  className="px-1.5 py-0.5 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                >
                  <Home className="w-3.5 h-3.5 text-blue-600" /> Início
                </button>
                {isAdmin && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="px-1.5 text-slate-500">Administração</span>
                  </>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="px-1.5 font-medium text-slate-900">{currentTitle}</span>
              </div>
            </div>
          )}

          <div className={`flex-1 min-h-0 overflow-auto ${isExplorer ? 'bg-white' : 'bg-[#f8fafc]'}`}>{children}</div>
        </main>
      </div>
    </div>
  );
};
