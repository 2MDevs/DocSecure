import React, { useState } from 'react';
import { Sidebar, NavigationTab } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { User, SystemNotification } from '../../types';

interface AppShellProps {
  currentUser: User;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onLogout: () => void;
  availableUsers: User[];
  onSwitchUser?: (user: User) => void;
  onOpenDevices: () => void;
  onOpenSecurity: () => void;
  onOpenUpload?: () => void;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  showSearchBar?: boolean;
  notifications: SystemNotification[];
  isMobileFrameActive?: boolean;
  onToggleMobileFrame?: () => void;
  dbStatus?: {
    connected: boolean;
    databaseName: string;
    latencyMs: number;
    mode: string;
  };
  currentTitle?: string;
  initialSetupBanner?: React.ReactNode;
  apiSyncErrorBanner?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  availableUsers,
  onSwitchUser,
  onOpenDevices,
  onOpenSecurity,
  onOpenUpload,
  searchTerm,
  onSearchChange,
  showSearchBar,
  notifications,
  isMobileFrameActive,
  onToggleMobileFrame,
  dbStatus,
  currentTitle,
  initialSetupBanner,
  apiSyncErrorBanner,
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#f8fafc] text-slate-900 flex overflow-x-hidden">
      {/* Responsive Sidebar (Persistent on lg:flex, Drawer on < lg) */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onLogout={onLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        dbStatus={dbStatus}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen min-h-[100dvh] overflow-x-hidden">
        {/* Setup Banner */}
        {initialSetupBanner}

        {/* Responsive Top Header */}
        <Header
          currentUser={currentUser}
          availableUsers={availableUsers}
          onSwitchUser={onSwitchUser}
          onLogout={onLogout}
          onOpenDevices={onOpenDevices}
          onOpenSecurity={onOpenSecurity}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          currentTitle={currentTitle}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          showSearchBar={showSearchBar}
          notifications={notifications}
          isMobileFrameActive={isMobileFrameActive}
          onToggleMobileFrame={onToggleMobileFrame}
          dbStatus={dbStatus}
        />

        {/* Connection Notice */}
        {apiSyncErrorBanner}

        {/* Dynamic Main View */}
        <main className="flex-1 pb-20 md:pb-8 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (< md screens) */}
      <MobileBottomNav
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onOpenUpload={onOpenUpload}
        onOpenMenu={() => setIsSidebarOpen(true)}
      />
    </div>
  );
};
