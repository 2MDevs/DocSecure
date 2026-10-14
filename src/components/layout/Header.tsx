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
  Sparkles,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { DocSecureLogo } from '../common/DocSecureLogo';
import { ConnectionIndicator } from '../common/ConnectionIndicator';
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
  onNotificationClick?: (n: SystemNotification) => void;
  isMobileFrameActive?: boolean;
  onToggleMobileFrame?: () => void;
  dbStatus?: {
    connected: boolean;
    databaseName: string;
    latencyMs: number;
    mode: string;
  };
  pendingSyncCount?: number;
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
  onNotificationClick,
  isMobileFrameActive,
  onToggleMobileFrame,
  dbStatus,
  pendingSyncCount = 0,
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
    <header className="h-12 pt-[env(safe-area-inset-top)] box-content bg-white border-b border-slate-200 pl-3 pr-1 sm:px-4 flex items-center justify-between z-30 select-none shrink-0">
      {/* Left side: Hamburger (Mobile) + Search Bar (Desktop) / Brand (Mobile) */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        {/* Mobile Title / Logo */}
        <div className="flex items-center gap-2 truncate">
          <DocSecureLogo size="sm" showSubtitle={false} tone="light" />
          {currentTitle && (
            <span className="hidden sm:inline-block text-xs font-semibold text-slate-600 truncate border-l border-slate-200 pl-2">
              {currentTitle}
            </span>
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

        {/* Indicador único de conexão com o servidor/banco */}
        <ConnectionIndicator pendingCount={pendingSyncCount} />

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
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white flex items-center justify-center">
                {unreadNotifs.length}
              </span>
            )}
          </button>

          {/* Notificações: no celular ocupa a largura da tela; no computador, menu suspenso */}
          {isNotifOpen && (
            <div className="fixed md:absolute left-3 right-3 md:left-auto md:right-0 top-[calc(3.25rem+env(safe-area-inset-top))] md:top-auto md:mt-2 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-900">Notificações</span>
                {unreadNotifs.length > 0 && (
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {unreadNotifs.length} nova{unreadNotifs.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="max-h-[60dvh] md:max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-slate-400">
                    <Bell className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    Nenhuma notificação por enquanto.
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isUpdate = n.id.startsWith('update-');
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setIsNotifOpen(false);
                          onNotificationClick?.(n);
                        }}
                        className={`w-full text-left px-4 py-3 flex gap-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 active:bg-slate-100 transition-colors ${
                          n.read ? '' : 'bg-blue-50/50'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isUpdate ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {isUpdate ? <Sparkles className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-semibold text-slate-900 truncate">{n.title}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{n.createdAt}</span>
                          </span>
                          <span className="block text-[12.5px] text-slate-600 mt-0.5 leading-snug line-clamp-2">{n.message}</span>
                        </span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" aria-label="Não lida" />}
                      </button>
                    );
                  })
                )}
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
{currentUser.role === 'DEVELOPER' && (
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
                )}

                <button
                  type="button"
                  onClick={() => {
                    onOpenSecurity();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors min-h-[40px]"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Segurança da conta</span>
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
