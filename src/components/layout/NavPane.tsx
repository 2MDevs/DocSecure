import React, { useEffect, useMemo, useState } from 'react';
import {
  Home,
  Star,
  Users,
  Trash2,
  ChevronRight,
  ChevronDown,
  Lock,
  LayoutDashboard,
  UserCog,
  Building2,
  ShieldCheck,
  Laptop,
  ClipboardList,
  Server,
  Plug,
  Settings,
  LogOut,
  Database,
  X,
} from 'lucide-react';
import { Department, Folder, User } from '../../types';
import type { NavigationTab } from './Sidebar';
import { DocSecureLogo } from '../common/DocSecureLogo';

export type ExplorerLocation = { deptId: string | null; folderId: string | null };

interface NavPaneProps {
  currentUser: User;
  activeTab: NavigationTab;
  allowedTabs: NavigationTab[];
  departments: Department[];
  folders: Folder[];
  explorerLocation: ExplorerLocation;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenLocation: (location: ExplorerLocation) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  dbStatus?: { connected: boolean; databaseName: string; latencyMs: number; mode: string };
}

/** Todos veem todos os setores; o acesso é liberado no próprio setor ou quando há pastas liberadas nele. */
export function canAccessDepartment(user: User, dept: Department, folders: Folder[]): boolean {
  if (user.role === 'DEVELOPER' || user.role === 'DIRECTOR') return true;
  if (dept.id === user.departmentId) return true;
  return folders.some((f) => f.departmentId === dept.id);
}

const ADMIN_ITEMS: Array<{ tab: NavigationTab; label: string; icon: React.ElementType }> = [
  { tab: 'dev_dashboard', label: 'Painel', icon: LayoutDashboard },
  { tab: 'users', label: 'Usuários', icon: UserCog },
  { tab: 'sectors', label: 'Setores & Armazenamento', icon: Building2 },
  { tab: 'permissions', label: 'Permissões', icon: ShieldCheck },
  { tab: 'devices', label: 'Dispositivos', icon: Laptop },
  { tab: 'audit_logs', label: 'Auditoria', icon: ClipboardList },
  { tab: 'system', label: 'Sistema', icon: Server },
  { tab: 'integrations', label: 'Integração', icon: Plug },
];

const SmallFolder: React.FC<{ open?: boolean }> = ({ open }) => (
  <svg viewBox="0 0 64 64" width={18} height={18} aria-hidden="true" className="shrink-0">
    <path d="M4 14a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z" fill="#e0a526" />
    <path d={open ? 'M8 24h54l-6 26a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z' : 'M4 22h56v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z'} fill="#f8c94a" />
  </svg>
);

/**
 * Menu lateral único, no estilo do painel de navegação do Explorador do Windows:
 * atalhos, árvore de setores/pastas e as telas administrativas permitidas ao perfil.
 */
export const NavPane: React.FC<NavPaneProps> = ({
  currentUser,
  activeTab,
  allowedTabs,
  departments,
  folders,
  explorerLocation,
  onSelectTab,
  onOpenLocation,
  onLogout,
  isOpen = false,
  onClose,
  dbStatus,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const inExplorer = activeTab === 'my_documents';

  // Mantém expandido o caminho da pasta aberta
  useEffect(() => {
    if (!explorerLocation.deptId) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(`d:${explorerLocation.deptId}`);
      let cursor = folders.find((f) => f.id === explorerLocation.folderId);
      const guard = new Set<string>();
      while (cursor?.parentId && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        next.add(`f:${cursor.parentId}`);
        cursor = folders.find((f) => f.id === cursor!.parentId);
      }
      return next;
    });
  }, [explorerLocation.deptId, explorerLocation.folderId, folders]);

  // Trava a rolagem da página quando o menu está aberto no celular
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, Folder[]>();
    folders.forEach((f) => {
      const key = f.parentId ? `f:${f.parentId}` : `d:${f.departmentId}`;
      map.set(key, [...(map.get(key) || []), f]);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })));
    return map;
  }, [folders]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const go = (tab: NavigationTab) => {
    onSelectTab(tab);
    onClose?.();
  };
  const open = (loc: ExplorerLocation) => {
    onOpenLocation(loc);
    onClose?.();
  };

  const rowBase = 'w-full flex items-center gap-2 pr-2 h-8 text-[13px] rounded-md transition-colors';
  const rowState = (active: boolean) => (active ? 'bg-blue-100/80 text-slate-900' : 'text-slate-700 hover:bg-slate-100');

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    const key = `f:${folder.id}`;
    const kids = childrenOf.get(key) || [];
    const isOpenNode = expanded.has(key);
    const active = inExplorer && explorerLocation.folderId === folder.id;
    return (
      <div key={folder.id}>
        <div className={`${rowBase} ${rowState(active)}`} style={{ paddingLeft: 8 + depth * 14 }}>
          <button
            type="button"
            onClick={() => kids.length && toggle(key)}
            className="w-4 h-4 flex items-center justify-center text-slate-400 shrink-0"
            aria-label={isOpenNode ? 'Recolher' : 'Expandir'}
          >
            {kids.length > 0 && (isOpenNode ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
          </button>
          <button type="button" onClick={() => open({ deptId: folder.departmentId, folderId: folder.id })} className="flex-1 min-w-0 flex items-center gap-2 text-left h-full">
            <SmallFolder open={active} />
            <span className="truncate">{folder.name}</span>
            {folder.isLocked && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
          </button>
        </div>
        {isOpenNode && kids.map((k) => renderFolder(k, depth + 1))}
      </div>
    );
  };

  const adminItems = ADMIN_ITEMS.filter((i) => allowedTabs.includes(i.tab));

  const pane = (
    <div className="w-64 md:w-60 h-full bg-[#f9fafb] border-r border-slate-200 flex flex-col select-none">
      {/* Cabeçalho do menu no celular */}
      <div className="md:hidden h-12 px-3 flex items-center justify-between border-b border-slate-200 bg-white">
        <DocSecureLogo size="sm" showSubtitle={false} />
        <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-slate-100" aria-label="Fechar menu">
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <button type="button" onClick={() => open({ deptId: null, folderId: null })} className={`${rowBase} pl-2 ${rowState(inExplorer && !explorerLocation.deptId)}`}>
          <Home className="w-4 h-4 text-blue-600" /> Início
        </button>
        <button type="button" onClick={() => go('favorites')} className={`${rowBase} pl-2 ${rowState(activeTab === 'favorites')}`}>
          <Star className="w-4 h-4 text-amber-500" /> Favoritos
        </button>
        <button type="button" onClick={() => go('shared')} className={`${rowBase} pl-2 ${rowState(activeTab === 'shared')}`}>
          <Users className="w-4 h-4 text-sky-600" /> Compartilhados
        </button>
        <button type="button" onClick={() => go('trash')} className={`${rowBase} pl-2 ${rowState(activeTab === 'trash')}`}>
          <Trash2 className="w-4 h-4 text-slate-500" /> Lixeira
        </button>

        <div className="pt-3 pb-1 px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Setores</div>
        {departments.length === 0 && <div className="px-2 py-1 text-xs text-slate-400">Nenhum setor cadastrado</div>}
        {departments.map((dept) => {
          const key = `d:${dept.id}`;
          const access = canAccessDepartment(currentUser, dept, folders);
          const kids = access ? childrenOf.get(key) || [] : [];
          const isOpenNode = expanded.has(key);
          const active = inExplorer && explorerLocation.deptId === dept.id && !explorerLocation.folderId;
          return (
            <div key={dept.id}>
              <div className={`${rowBase} ${rowState(active)}`} style={{ paddingLeft: 8 }}>
                <button
                  type="button"
                  onClick={() => kids.length && toggle(key)}
                  className="w-4 h-4 flex items-center justify-center text-slate-400 shrink-0"
                  aria-label={isOpenNode ? 'Recolher' : 'Expandir'}
                >
                  {kids.length > 0 && (isOpenNode ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
                </button>
                <button
                  type="button"
                  onClick={() => open({ deptId: dept.id, folderId: null })}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left h-full"
                  title={access ? dept.name : `${dept.name} — sem permissão de acesso`}
                >
                  <SmallFolder />
                  <span className={`truncate ${access ? '' : 'text-slate-400'}`}>{dept.name}</span>
                  {!access && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                </button>
              </div>
              {isOpenNode && kids.map((f) => renderFolder(f, 1))}
            </div>
          );
        })}

        {adminItems.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Administração</div>
            {adminItems.map(({ tab, label, icon: Icon }) => (
              <button key={tab} type="button" onClick={() => go(tab)} className={`${rowBase} pl-2 ${rowState(activeTab === tab)}`}>
                <Icon className="w-4 h-4 text-slate-500" /> {label}
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 px-2 py-2 space-y-0.5">
        {allowedTabs.includes('settings') && (
          <button type="button" onClick={() => go('settings')} className={`${rowBase} pl-2 ${rowState(activeTab === 'settings')}`}>
            <Settings className="w-4 h-4 text-slate-500" /> Segurança da conta
          </button>
        )}
        <button type="button" onClick={onLogout} className={`${rowBase} pl-2 text-rose-600 hover:bg-rose-50`}>
          <LogOut className="w-4 h-4" /> Encerrar sessão
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex shrink-0 h-full">{pane}</aside>
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
          <div className="relative h-full shadow-2xl animate-in slide-in-from-left duration-150">{pane}</div>
        </div>
      )}
    </>
  );
};
