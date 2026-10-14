import { useEffect, useState } from 'react';

/**
 * Tema claro/escuro.
 * - "system": segue o celular/computador do usuário (padrão).
 * - "light" / "dark": escolha feita no botão da barra superior (fica salva neste aparelho).
 */
export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'ds.theme';
const EVENT = 'docsecure:theme';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePreference = getThemePreference()): 'light' | 'dark' {
  if (pref === 'system') return media()?.matches ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref: ThemePreference = getThemePreference()) {
  const dark = resolveTheme(pref) === 'dark';
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111a2b' : '#ffffff');
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Hook: tema atual + troca. Acompanha a mudança de tema do sistema quando está em "system". */
export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(pref));

  useEffect(() => {
    const sync = () => {
      const p = getThemePreference();
      setPref(p);
      setResolved(resolveTheme(p));
      applyTheme(p);
    };
    sync();
    const mq = media();
    mq?.addEventListener?.('change', sync);
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      mq?.removeEventListener?.('change', sync);
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    preference: pref,
    theme: resolved,
    /** Botão: alterna entre claro e escuro */
    toggle: () => setThemePreference(resolved === 'dark' ? 'light' : 'dark'),
    setPreference: setThemePreference,
  };
}
