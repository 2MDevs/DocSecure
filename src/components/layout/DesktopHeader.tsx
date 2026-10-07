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
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { User as UserType, SystemNotification } from '../../types';

interface DesktopHeaderProps {
  currentUser: UserType;
  availableUsers: UserType[];
  onSwitchUser: (user: UserType) => void;
  onLogout: () => void;
  onOpenDevices: () => void;
  onOpenSecurity: () => void;
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

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  currentUser,
  availableUsers,
  onSwitchUser,
  onLogout,
  onOpenDevices,
  onOpenSecurity,
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
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Search Input Zone */}
      <div className="flex-1 max-w-md">
        {showSearchBar ? (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
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

      {/* Right Controls Zone */}
      <div className="flex items-center gap-3">
        {/* DB Connection Status Indicator */}
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

        {/* Device Viewport Mode Toggle for Testing */}
        {onToggleMobileFrame && (
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
                <span>Simulador Mobile</span>
              </>
            )}
          </button>
        )}

        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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

        {/* User Profile Badge matching screenshot */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 p-1 pl-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <Avatar name={currentUser.name} avatarUrl={currentUser.avatar} size="sm" />
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[11px] text-slate-500 leading-none">
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {/* Profile & Role-Switch Dropdown */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100">
                <div className="font-bold text-xs text-slate-900">{currentUser.name}</div>
                <div className="text-[11px] text-slate-500">{currentUser.email}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  <Shield className="w-3 h-3" /> {currentUser.role} • Matrícula: {currentUser.matricula}
                </div>
              </div>

              {/* Quick Switch Profiles */}
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Alternar Perfil (Simulação)
              </div>
              <div className="space-y-0.5 mb-2">
                {availableUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onSwitchUser(u);
                      setIsProfileOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
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

              <div className="border-t border-slate-100 pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenDevices();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
