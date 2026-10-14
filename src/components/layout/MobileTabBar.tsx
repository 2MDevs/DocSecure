import React from 'react';
import { Home, Star, Users, Trash2, Menu } from 'lucide-react';
import type { NavigationTab } from './Sidebar';

interface MobileTabBarProps {
  activeTab: NavigationTab;
  onHome: () => void;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenMenu: () => void;
}

/** Barra de abas inferior, como em aplicativos de celular. Só aparece em telas pequenas. */
export const MobileTabBar: React.FC<MobileTabBarProps> = ({ activeTab, onHome, onSelectTab, onOpenMenu }) => {
  const items: Array<{ key: string; label: string; icon: React.ElementType; active: boolean; onClick: () => void }> = [
    { key: 'home', label: 'Início', icon: Home, active: activeTab === 'my_documents', onClick: onHome },
    { key: 'fav', label: 'Favoritos', icon: Star, active: activeTab === 'favorites', onClick: () => onSelectTab('favorites') },
    { key: 'shared', label: 'Compartilhados', icon: Users, active: activeTab === 'shared', onClick: () => onSelectTab('shared') },
    { key: 'trash', label: 'Lixeira', icon: Trash2, active: activeTab === 'trash', onClick: () => onSelectTab('trash') },
    { key: 'menu', label: 'Menu', icon: Menu, active: false, onClick: onOpenMenu },
  ];
  return (
    <nav
      className="md:hidden shrink-0 bg-white/95 backdrop-blur border-t border-slate-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] select-none z-30"
      aria-label="Navegação principal"
    >
      {items.map(({ key, label, icon: Icon, active, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          aria-label={key === 'menu' ? 'Abrir menu lateral' : label}
          className={`h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors active:bg-slate-100 ${
            active ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <span className={`h-7 w-12 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-blue-50' : ''}`}>
            <Icon className={`w-[21px] h-[21px] ${active && key === 'fav' ? 'fill-blue-600/15' : ''}`} strokeWidth={active ? 2.3 : 1.9} />
          </span>
          <span className="leading-none truncate max-w-full px-0.5">{key === 'shared' ? 'Compart.' : label}</span>
        </button>
      ))}
    </nav>
  );
};
