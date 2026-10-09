import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  User,
  Shield,
  Laptop,
  LogOut,
  RefreshCw,
  Smartphone,
  Monitor,
  CheckCircle2,
  Database,
  Menu,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { DocSecureLogo } from '../common/DocSecureLogo';
import { User as UserType, SystemNotification } from '../../types';

interface HeaderProps {
  currentUser: UserType;
  availableUsers: UserType[];
  onSwitchUser?: (user: UserType) => void;
  onLogout: () => void;
  onOpenDevices: () => void;
  onOpenSecurity: () => void;
  onToggleSidebar?: () => void;
  currentTitle?: string;
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
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  availableUsers,
  onSwitchUser,
  onLogout,
  onOpenDevices,
  onOpenSecurity,
  onToggleSidebar,
  currentTitle,
  searchTerm = '',
  onSearchChange,
  showSearchBar = true,
  notifications,
  isMobileFrameActive,
  onToggleMobileFrame,
  dbStatus,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadNotifs = notifications.filter((n) => !n.read);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'DEVELOPER':
        return 'Desenvolvedor';
      case 'DIRECTOR':
        return 'Diretor Geral';
      case 'MANAGER':
        return `Gestor (${currentUser.departmentName || 'Área'})`;
      case 'EMPLOYEE':
        return 'Colaborador';
      default:
        return role;
    }
  };

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-slate-200/80 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left side: Hamburger (Mobile) + Search Bar (Desktop) / Brand (Mobile) */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-1 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          aria-label="Abrir menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Title / Logo */}
        <div className="lg:hidden flex items-center gap-2 truncate">
          <DocSecureLogo size="sm" showSubtitle={false} />
          {currentTitle && (
            <span className="hidden xs:inline-block text-xs font-semibold text-slate-600 truncate border-l border-slate-200 pl-2">
              {currentTitle}
            </span>
          )}
        </div>

        {/* Desktop Search Input Zone */}
        <div className="hidden lg:block flex-1 max-w-md">
          {showSearchBar ? (
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Buscar documentos, pastas..."
                className="w-full pl-9 pr-4 py-2 bg-slate-100/80 hover:bg-slate-100 border border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>DocSecure Enterprise Core</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls Zone */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {/* Mobile Search Toggle */}
        {showSearchBar && (
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
              aria-label="Buscar"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* DB Connection Status Indicator (hidden on mobile, visible on tablet/desktop) */}
        {dbStatus && (
          <div
            title={`PostgreSQL: ${dbStatus.databaseName} • Latência: ${dbStatus.latencyMs}ms • Modo: ${dbStatus.mode}`}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] font-medium text-slate-700"
          >
            <Database className={`w-3.5 h-3.5 ${dbStatus.connected ? 'text-emerald-600' : 'text-amber-500'}`} />
            <span className="font-mono text-slate-800 font-semibold">{dbStatus.databaseName}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${dbStatus.connected ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
          </div>
        )}

        {/* Device Viewport Mode Toggle for Testing (Visible ONLY in DEV mode) */}
        {import.meta.env.DEV && onToggleMobileFrame && (
          <button
            type="button"
            onClick={onToggleMobileFrame}
            title={isMobileFrameActive ? 'Modo Desktop' : 'Simulador Mobile (Pixel-Perfect)'}
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isMobileFrameActive
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {isMobileFrameActive ? (
              <>
                <Monitor className="w-3.5 h-3.5" />
                <span>Ver Desktop</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span>Simulador DEV</span>
              </>
            )}
          </button>
        )}

        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors relative"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs.length > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown (responsive width on mobile) */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                <span className="text-xs font-bold text-slate-900">Notificações</span>
                <span className="text-[10px] text-slate-400">{notifications.length} eventos</span>
              </div>
              <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 rounded-xl hover:bg-slate-50 text-xs border border-transparent hover:border-slate-100 transition-colors"
                  >
                    <div className="font-semibold text-slate-900 flex items-center justify-between">
                      <span>{n.title}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{n.createdAt}</span>
                    </div>
                    <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Badge */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1 pl-1.5 sm:pl-2 hover:bg-slate-100 rounded-xl transition-all min-h-[44px]"
            aria-label="Menu do perfil"
          >
            <Avatar name={currentUser.name} avatarUrl={currentUser.avatar} size="sm" />
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[11px] text-slate-500 leading-none">
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {/* Profile Dropdown (responsive width on mobile) */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-72 max-w-xs bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100">
                <div className="font-bold text-xs text-slate-900">{currentUser.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  <Shield className="w-3 h-3 shrink-0" /> {currentUser.role}
                </div>
              </div>

              {/* Quick Switch Profiles (Restrito exclusivamente a ambiente DEV) */}
              {import.meta.env.DEV && onSwitchUser && (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center justify-between">
                    <span>Alternar Perfil (Simulação)</span>
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-mono font-bold">DEV</span>
                  </div>
                  <div className="space-y-0.5 mb-2 max-h-40 overflow-y-auto">
                    {availableUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onSwitchUser(u);
                          setIsProfileOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors min-h-[36px] ${
                          u.id === currentUser.id
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Avatar name={u.name} avatarUrl={u.avatar} size="xs" />
                          <span className="truncate">{u.name} ({u.role.slice(0, 3)})</span>
                        </div>
                        {u.id === currentUser.id && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="border-t border-slate-100 pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenDevices();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors min-h-[40px]"
                >
                  <Laptop className="w-3.5 h-3.5 text-slate-500" />
                  <span>Meus Dispositivos</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenSecurity();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors min-h-[40px]"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Segurança e 2FA</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition-colors min-h-[40px]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Mobile Search Overlay */}
      {isMobileSearchOpen && showSearchBar && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 p-3 shadow-lg z-40 animate-in slide-in-from-top-1 duration-150">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Buscar documentos, pastas..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-transparent focus:border-blue-500 focus:bg-white rounded-xl text-base sm:text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </header>
  );
};
