import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Clock,
  RefreshCw,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Home,
  ArrowUpDown,
  Search,
  LayoutGrid,
  List as ListIcon,
  PanelRight,
  Check,
  CheckCircle2,
  CheckSquare,
  MoreVertical,
  FolderOpen,
  X,
} from 'lucide-react';
import { Department, DocumentItem, Folder, User } from '../../types';
import { apiClient, TrashFailure } from '../../services/apiClient';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BottomSheet } from '../common/BottomSheet';
import { formatBytes, typeLabel, FolderGlyph, DriveGlyph, FileGlyph } from './explorerGlyphs';

interface TrashViewProps {
  currentUser: User;
  departments: Department[];
  /** Pastas atuais (para mostrar o caminho original de arquivos excluídos um a um) */
  folders: Folder[];
  /** Itens restaurados: a tela principal já mostra de volta sem esperar recarregar */
  onRestored: (docs: DocumentItem[]) => void;
  /** Muda quando o servidor avisa que algo foi alterado (atualização em tempo real) */
  refreshKey?: number;
  /** Volta para o Início (explorador) */
  onGoHome?: () => void;
}

type ViewMode = 'large' | 'medium' | 'details';
type SortKey = 'name' | 'deleted' | 'size' | 'remaining';
type Item =
  | { kind: 'dept'; key: string; name: string; dept: Department; docs: DocumentItem[] }
  | { kind: 'dir'; key: string; name: string; path: string[]; docs: DocumentItem[] }
  | { kind: 'doc'; key: string; name: string; doc: DocumentItem; docs: DocumentItem[] };

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function remaining(purgeAt?: string | null): { text: string; short: string; urgent: boolean; ms: number } {
  if (!purgeAt) return { text: '-', short: '-', urgent: false, ms: Infinity };
  const ms = new Date(purgeAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'será apagado em instantes', short: 'agora', urgent: true, ms };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return { text: `${days} dia${days > 1 ? 's' : ''} e ${hours}h`, short: `${days}d`, urgent: days < 2, ms };
  return { text: `${Math.max(1, hours)}h`, short: `${Math.max(1, hours)}h`, urgent: true, ms };
}

const readPref = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const sizeOf = (docs: DocumentItem[]) => docs.reduce((s, d) => s + (d.sizeBytes || 0), 0);
const soonest = (docs: DocumentItem[]) =>
  docs.reduce<string | null>((min, d) => (d.purgeAt && (!min || d.purgeAt < min) ? d.purgeAt : min), null);
const latestDeleted = (docs: DocumentItem[]) =>
  docs.reduce<string | null>((max, d) => (d.trashedAt && (!max || d.trashedAt > max) ? d.trashedAt : max), null);

/**
 * Lixeira no mesmo estilo do Explorador: setores, pastas (o caminho original de onde os arquivos saíram)
 * e arquivos, com ícones/detalhes, seleção múltipla (clique, Ctrl, Shift, Ctrl+A ou o quadrado de seleção)
 * para restaurar ou apagar de vez — do disco do servidor e do banco de dados.
 * Cada setor só vê a própria lixeira; os itens ficam 7 dias e depois somem sozinhos.
 */
export const TrashView: React.FC<TrashViewProps> = ({ currentUser, departments, folders, onRestored, refreshKey, onGoHome }) => {
  const isMobile = useIsMobile();
  const isAdmin = currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR';

  const [items, setItems] = useState<DocumentItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failures: TrashFailure[] } | null>(null);

  // Navegação: setor + caminho original dentro dele
  const [deptId, setDeptId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [viewMode, setViewModeState] = useState<ViewMode>(() => readPref('ds.trash.view', 'details'));
  const [mobileView, setMobileViewState] = useState<'list' | 'grid'>(() => readPref('ds.trash.mobileView', 'list'));
  const [sortKey, setSortKey] = useState<SortKey>('deleted');
  const [sortAsc, setSortAsc] = useState(false);
  const [showDetails, setShowDetails] = useState<boolean>(() => readPref('ds.trash.details', true));

  const [selKeys, setSelKeys] = useState<Set<string>>(new Set());
  const anchorKey = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const suppressClick = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Item | null } | null>(null);
  const [openMenu, setOpenMenu] = useState<null | 'sort' | 'view'>(null);
  const [mobileSheet, setMobileSheet] = useState<null | 'options'>(null);
  const [selectMode, setSelectMode] = useState(false); // celular: modo de seleção (segurar o dedo)
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });

  const [confirm, setConfirm] = useState<null | { mode: 'purge' | 'empty'; docs: DocumentItem[] }>(null);
  const [busy, setBusy] = useState<null | { label: string; done: number; total: number }>(null);

  // Setores cuja lixeira o usuário pode ver
  const trashDepartments = useMemo(
    () => (isAdmin ? departments : departments.filter((d) => d.id === currentUser.departmentId)),
    [isAdmin, departments, currentUser.departmentId]
  );
  // Quem vê um setor só entra direto nele
  const singleDept = trashDepartments.length === 1 ? trashDepartments[0].id : null;
  const currentDeptId = deptId || singleDept;
  const currentDept = departments.find((d) => d.id === currentDeptId) || null;

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await apiClient.getTrash();
        setRetentionDays(res.retentionDays);
        const allowed = new Set(trashDepartments.map((d) => d.id));
        setItems(res.items.filter((i) => allowed.has(i.departmentId)));
      } catch (err: any) {
        if (!silent) setError(err?.message || 'Não foi possível carregar a lixeira.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [trashDepartments]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Atualização em tempo real: recarrega sem mostrar o "carregando"
  useEffect(() => {
    if (refreshKey) load(true);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------- caminho original de cada arquivo
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const originalPath = useCallback(
    (d: DocumentItem): string[] => {
      // Pasta ainda existe: caminho atual dela. Pasta foi excluída junto: caminho guardado na exclusão.
      if (d.folderId && folderById.has(d.folderId)) {
        const names: string[] = [];
        const guard = new Set<string>();
        let cur = folderById.get(d.folderId);
        while (cur && !guard.has(cur.id)) {
          guard.add(cur.id);
          names.unshift(cur.name);
          cur = cur.parentId ? folderById.get(cur.parentId) : undefined;
        }
        return names;
      }
      return (d.trashedPath || '').split('/').filter(Boolean);
    },
    [folderById]
  );
  const pathOf = useMemo(() => {
    const m = new Map<string, string[]>();
    items.forEach((d) => m.set(d.id, originalPath(d)));
    return m;
  }, [items, originalPath]);

  // ------------------------------------------------------------- itens do local atual
  const query = search.trim().toLowerCase();
  const visibleItems: Item[] = useMemo(() => {
    let list: Item[] = [];
    if (!currentDeptId) {
      list = trashDepartments.map((dept) => {
        const docs = items.filter((d) => d.departmentId === dept.id);
        return { kind: 'dept', key: `dept:${dept.id}`, name: dept.name, dept, docs } as Item;
      });
    } else if (query) {
      // Pesquisa: todos os arquivos do setor (em qualquer pasta) que combinam com o texto
      list = items
        .filter((d) => d.departmentId === currentDeptId && d.name.toLowerCase().includes(query))
        .map((doc) => ({ kind: 'doc', key: `doc:${doc.id}`, name: doc.name, doc, docs: [doc] }));
    } else {
      const here = items.filter((d) => {
        if (d.departmentId !== currentDeptId) return false;
        const p = pathOf.get(d.id) || [];
        return p.length >= path.length && path.every((seg, i) => p[i] === seg);
      });
      const dirs = new Map<string, DocumentItem[]>();
      const files: DocumentItem[] = [];
      here.forEach((d) => {
        const p = pathOf.get(d.id) || [];
        if (p.length === path.length) files.push(d);
        else {
          const next = p[path.length];
          dirs.set(next, [...(dirs.get(next) || []), d]);
        }
      });
      list = [
        ...[...dirs.entries()].map(
          ([name, docs]) => ({ kind: 'dir', key: `dir:${[...path, name].join('/')}`, name, path: [...path, name], docs }) as Item
        ),
        ...files.map((doc) => ({ kind: 'doc', key: `doc:${doc.id}`, name: doc.name, doc, docs: [doc] }) as Item),
      ];
    }
    const dir = sortAsc ? 1 : -1;
    const rank = (it: Item) => (it.kind === 'doc' ? 1 : 0);
    return list.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b); // pastas antes dos arquivos
      let cmp = 0;
      if (sortKey === 'size') cmp = sizeOf(a.docs) - sizeOf(b.docs);
      else if (sortKey === 'deleted') cmp = (latestDeleted(a.docs) || '').localeCompare(latestDeleted(b.docs) || '');
      else if (sortKey === 'remaining') cmp = (soonest(a.docs) || '').localeCompare(soonest(b.docs) || '');
      if (cmp === 0) cmp = a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }) * (sortKey === 'name' ? 1 : dir);
      return cmp * dir;
    });
  }, [currentDeptId, trashDepartments, items, query, path, pathOf, sortKey, sortAsc]);

  // A pasta (caminho) atual ficou vazia depois de restaurar/apagar: sobe até onde ainda há itens
  useEffect(() => {
    if (loading || !currentDeptId || !path.length) return;
    const has = (p: string[]) =>
      items.some((d) => {
        if (d.departmentId !== currentDeptId) return false;
        const dp = pathOf.get(d.id) || [];
        return dp.length >= p.length && p.every((seg, i) => dp[i] === seg);
      });
    if (has(path)) return;
    let p = path.slice(0, -1);
    while (p.length && !has(p)) p = p.slice(0, -1);
    setPath(p);
  }, [items, pathOf, path, currentDeptId, loading]);

  // Ao trocar de local, limpa a seleção
  useEffect(() => {
    setSelKeys(new Set());
    anchorKey.current = null;
  }, [currentDeptId, path.join('/'), query]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItems = visibleItems.filter((i) => selKeys.has(i.key));
  const selectedDocs = useMemo(() => {
    const m = new Map<string, DocumentItem>();
    selectedItems.forEach((it) => it.docs.forEach((d) => m.set(d.id, d)));
    return [...m.values()];
  }, [selectedItems]);
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const canPurgeSelection = selectedDocs.length > 0 && selectedDocs.every((d) => d.canPurge);
  const deptDocs = currentDeptId ? items.filter((d) => d.departmentId === currentDeptId) : [];
  const canEmpty = deptDocs.length > 0 && deptDocs.every((d) => d.canPurge);

  // ------------------------------------------------------------- navegação (com Voltar/Avançar)
  type Loc = { deptId: string | null; path: string[] };
  const [backStack, setBackStack] = useState<Loc[]>([]);
  const [forwardStack, setForwardStack] = useState<Loc[]>([]);
  const here = (): Loc => ({ deptId, path });
  const go = (loc: Loc, record = true) => {
    if (record) {
      setBackStack((b) => [...b.slice(-49), here()]);
      setForwardStack([]);
    }
    setDeptId(loc.deptId);
    setPath(loc.path);
    setSearch('');
  };
  const goBack = () => {
    const prev = backStack[backStack.length - 1];
    if (!prev) return;
    setBackStack((b) => b.slice(0, -1));
    setForwardStack((f) => [here(), ...f]);
    go(prev, false);
  };
  const goForward = () => {
    const next = forwardStack[0];
    if (!next) return;
    setForwardStack((f) => f.slice(1));
    setBackStack((b) => [...b, here()]);
    go(next, false);
  };

  const openItem = (it: Item) => {
    if (it.kind === 'dept') {
      go({ deptId: it.dept.id, path: [] });
    } else if (it.kind === 'dir') {
      go({ deptId, path: it.path });
    } else {
      setSelKeys(new Set([it.key]));
      if (!showDetails && !isMobile) toggleDetails();
      if (isMobile) setContextMenu({ x: 0, y: 0, item: it });
    }
  };
  const goUp = () => {
    if (search) return setSearch('');
    if (path.length) go({ deptId, path: path.slice(0, -1) });
    else if (!singleDept && currentDeptId) go({ deptId: null, path: [] });
  };
  const canGoUp = Boolean(search || path.length || (!singleDept && currentDeptId));
  const toggleDetails = () => {
    setShowDetails((v) => {
      writePref('ds.trash.details', !v);
      return !v;
    });
  };
  const setViewMode = (m: ViewMode) => {
    setViewModeState(m);
    writePref('ds.trash.view', m);
  };
  const setMobileView = (m: 'list' | 'grid') => {
    setMobileViewState(m);
    writePref('ds.trash.mobileView', m);
  };
  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(k);
      setSortAsc(k === 'name' || k === 'remaining');
    }
  };

  // ------------------------------------------------------------- seleção
  const onItemClick = (e: React.MouseEvent, it: Item) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      setSelKeys((prev) => {
        const next = new Set(prev);
        next.has(it.key) ? next.delete(it.key) : next.add(it.key);
        return next;
      });
      anchorKey.current = it.key;
      return;
    }
    if (e.shiftKey && anchorKey.current) {
      const keys = visibleItems.map((i) => i.key);
      const a = keys.indexOf(anchorKey.current);
      const b = keys.indexOf(it.key);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelKeys(new Set(keys.slice(lo, hi + 1)));
        return;
      }
    }
    anchorKey.current = it.key;
    setSelKeys(new Set([it.key]));
  };

  const startMarquee = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isMobile) return;
    if ((e.target as HTMLElement).closest('[data-sel-key], button, a, input, select, textarea, th')) return;
    const box = contentRef.current;
    if (!box) return;
    const bounds = box.getBoundingClientRect();
    if (e.clientX > bounds.left + box.clientWidth || e.clientY > bounds.top + box.clientHeight) return;
    const base = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(selKeys) : new Set<string>();
    const startX = e.clientX - bounds.left + box.scrollLeft;
    const startY = e.clientY - bounds.top + box.scrollTop;
    let active = false;
    let last = { x: e.clientX, y: e.clientY };
    let raf = 0;
    const update = () => {
      const b = box.getBoundingClientRect();
      const curX = last.x - b.left + box.scrollLeft;
      const curY = last.y - b.top + box.scrollTop;
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      setMarquee({ x, y, w, h });
      const sel = { left: x - box.scrollLeft + b.left, top: y - box.scrollTop + b.top, right: 0, bottom: 0 };
      sel.right = sel.left + w;
      sel.bottom = sel.top + h;
      const next = new Set(base);
      box.querySelectorAll<HTMLElement>('[data-sel-key]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < sel.right && r.right > sel.left && r.top < sel.bottom && r.bottom > sel.top) next.add(el.dataset.selKey!);
      });
      setSelKeys(next);
    };
    const onMove = (ev: MouseEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 5) return;
        active = true;
        setContextMenu(null);
        setOpenMenu(null);
      }
      const b = box.getBoundingClientRect();
      if (ev.clientY > b.bottom - 24) box.scrollTop += 18;
      else if (ev.clientY < b.top + 24) box.scrollTop -= 18;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(raf);
      if (active) {
        suppressClick.current = true;
        setMarquee(null);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ------------------------------------------------------------- ações
  const runBatched = async (
    docs: DocumentItem[],
    label: string,
    call: (ids: string[]) => Promise<{ ok: number; failed: TrashFailure[]; restored?: DocumentItem[] }>
  ) => {
    const ids = docs.map((d) => d.id);
    const failures: TrashFailure[] = [];
    let ok = 0;
    const restored: DocumentItem[] = [];
    setBusy({ label, done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100);
        const r = await call(part);
        ok += r.ok;
        failures.push(...r.failed);
        if (r.restored) restored.push(...r.restored);
        const failedIds = new Set(r.failed.map((f) => f.id));
        const doneIds = new Set(part.filter((id) => !failedIds.has(id)));
        setItems((prev) => prev.filter((d) => !doneIds.has(d.id)));
        setBusy({ label, done: Math.min(ids.length, i + part.length), total: ids.length });
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(null);
      setSelKeys(new Set());
      setSelectMode(false);
    }
    if (restored.length) onRestored(restored);
    return { ok, failures };
  };

  const restore = async (docs: DocumentItem[]) => {
    if (!docs.length) return;
    setNotice(null);
    const { ok, failures } = await runBatched(docs, 'Restaurando', async (ids) => {
      const r = await apiClient.restoreTrashItems(ids);
      return { ok: r.restored.length, failed: r.failed, restored: r.restored };
    });
    setNotice({
      text: ok
        ? `${ok} ${ok === 1 ? 'arquivo restaurado' : 'arquivos restaurados'} para o local original.`
        : 'Nenhum arquivo foi restaurado.',
      failures,
    });
  };

  const purge = async (docs: DocumentItem[]) => {
    setConfirm(null);
    if (!docs.length) return;
    setNotice(null);
    const { ok, failures } = await runBatched(docs, 'Apagando definitivamente', async (ids) => {
      const r = await apiClient.purgeTrashItems(ids);
      return { ok: r.purged.length, failed: r.failed };
    });
    setNotice({
      text: ok
        ? `${ok} ${ok === 1 ? 'arquivo apagado' : 'arquivos apagados'} definitivamente do servidor.`
        : 'Nenhum arquivo foi apagado.',
      failures,
    });
  };

  const askPurge = (docs: DocumentItem[]) => {
    if (!docs.length) return;
    if (!docs.every((d) => d.canPurge)) {
      setError('Somente o gestor do setor, a Diretoria ou o Desenvolvedor podem excluir definitivamente.');
      return;
    }
    setConfirm({ mode: 'purge', docs });
  };

  // Teclado: Ctrl+A, Delete, Enter, Backspace, Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (confirm || busy) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && currentDeptId) {
        e.preventDefault();
        setSelKeys(new Set(visibleItems.map((i) => i.key)));
      } else if (e.key === 'Escape') {
        setSelKeys(new Set());
        setContextMenu(null);
        setOpenMenu(null);
      } else if (e.key === 'Delete' && selectedDocs.length) {
        askPurge(selectedDocs);
      } else if (e.key === 'Enter' && single) {
        openItem(single);
      } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        if (backStack.length) goBack();
        else goUp();
      } else if (e.altKey && e.key === 'ArrowUp') {
        goUp();
      }
    };
    const close = () => {
      setContextMenu(null);
      setOpenMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', close);
    };
  });

  const handleContextMenu = (e: React.MouseEvent, it: Item | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (it && !selKeys.has(it.key)) setSelKeys(new Set([it.key]));
    if (!it && !currentDeptId) return;
    const x = Math.min(e.clientX, window.innerWidth - 250);
    const y = Math.min(e.clientY, window.innerHeight - 220);
    setContextMenu({ x, y, item: it });
  };

  // ------------------------------------------------------------- celular: toque, segurar e modo de seleção
  const touchHandlers = (it: Item) => ({
    onTouchStart: () => {
      longPress.current.fired = false;
      if (longPress.current.timer) clearTimeout(longPress.current.timer);
      longPress.current.timer = setTimeout(() => {
        longPress.current.fired = true;
        if (it.kind === 'dept') return;
        setSelectMode(true);
        setSelKeys((prev) => new Set(prev).add(it.key));
      }, 450);
    },
    onTouchMove: () => longPress.current.timer && clearTimeout(longPress.current.timer),
    onTouchEnd: () => longPress.current.timer && clearTimeout(longPress.current.timer),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (longPress.current.fired) {
        longPress.current.fired = false;
        return;
      }
      if (selectMode && it.kind !== 'dept') {
        setSelKeys((prev) => {
          const next = new Set(prev);
          next.has(it.key) ? next.delete(it.key) : next.add(it.key);
          if (!next.size) setSelectMode(false);
          return next;
        });
        return;
      }
      openItem(it);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (it.kind !== 'dept') {
        setSelKeys(new Set([it.key]));
        setContextMenu({ x: 0, y: 0, item: it });
      }
    },
  });

  // ------------------------------------------------------------- textos e ícones
  const locationName = search ? `Resultados para “${search}”` : path.length ? path[path.length - 1] : currentDept ? currentDept.name : 'Lixeira';
  const renderIcon = (it: Item, size: number) =>
    it.kind === 'dept' ? <DriveGlyph size={size} /> : it.kind === 'dir' ? <FolderGlyph size={size} /> : <FileGlyph ext={it.doc.extension} size={size} />;
  const countLabel = (n: number) => `${n} ${n === 1 ? 'arquivo' : 'arquivos'}`;
  const itemMeta = (it: Item) => {
    if (it.kind === 'doc') {
      const r = remaining(it.doc.purgeAt);
      return `${formatBytes(it.doc.sizeBytes)} • excluído ${formatDate(it.doc.trashedAt)} • apaga em ${r.text}`;
    }
    return `${countLabel(it.docs.length)} • ${formatBytes(sizeOf(it.docs))}`;
  };
  const originalLocation = (d: DocumentItem) => {
    const p = pathOf.get(d.id) || [];
    return [d.departmentName, ...p].join(' › ');
  };

  const toolbarBtn =
    'h-9 px-2.5 rounded-md text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent inline-flex items-center gap-1.5 transition-colors';
  const mBtn = 'h-10 w-10 shrink-0 rounded-full text-slate-700 active:bg-slate-100 inline-flex items-center justify-center';

  const MenuItem: React.FC<{ icon?: React.ReactNode; label: string; onClick: () => void; danger?: boolean; checked?: boolean; disabled?: boolean }> = ({
    icon,
    label,
    onClick,
    danger,
    checked,
    disabled,
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setContextMenu(null);
        setOpenMenu(null);
        setMobileSheet(null);
        onClick();
      }}
      className={`w-full text-left flex items-center disabled:opacity-40 ${
        isMobile ? 'px-5 py-3.5 text-[15px] gap-4 active:bg-slate-100' : 'px-3 py-1.5 text-[13px] gap-2.5'
      } ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      <span className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} flex items-center justify-center text-slate-500`}>
        {checked ? <Check className="w-4 h-4 text-blue-600" /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );

  const menuContent = () => {
    if (!contextMenu) return null;
    const it = contextMenu.item;
    if (!it) {
      return (
        <>
          <MenuItem icon={<CheckSquare className="w-4 h-4" />} label="Selecionar tudo" disabled={!visibleItems.length} onClick={() => setSelKeys(new Set(visibleItems.map((i) => i.key)))} />
          <MenuItem icon={<RefreshCw className="w-4 h-4" />} label="Atualizar" onClick={() => load()} />
          {canEmpty && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Esvaziar lixeira do setor" danger onClick={() => setConfirm({ mode: 'empty', docs: deptDocs })} />
            </>
          )}
        </>
      );
    }
    const docs = selectedDocs.length ? selectedDocs : it.docs;
    const many = selectedItems.length > 1;
    const purgeable = docs.every((d) => d.canPurge);
    return (
      <>
        {many && <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{selectedItems.length} itens selecionados</div>}
        {!many && it.kind !== 'doc' && <MenuItem icon={<FolderOpen className="w-4 h-4" />} label="Abrir" onClick={() => openItem(it)} />}
        {it.kind !== 'dept' && (
          <MenuItem
            icon={<RotateCcw className="w-4 h-4 text-emerald-600" />}
            label={docs.length > 1 ? `Restaurar ${countLabel(docs.length)}` : 'Restaurar'}
            onClick={() => restore(docs)}
          />
        )}
        {it.kind !== 'dept' && purgeable && (
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label={docs.length > 1 ? `Excluir definitivamente (${docs.length})` : 'Excluir definitivamente'}
            danger
            onClick={() => askPurge(docs)}
          />
        )}
        {many && <MenuItem icon={<X className="w-4 h-4" />} label="Limpar seleção" onClick={() => setSelKeys(new Set())} />}
      </>
    );
  };

  const emptyText = !trashDepartments.length
    ? 'Nenhum setor disponível.'
    : query
    ? 'Nenhum item da lixeira corresponde à pesquisa.'
    : currentDept
    ? `A lixeira de ${currentDept.name} está vazia.`
    : 'A lixeira está vazia.';

  // ------------------------------------------------------------- render
  return (
    <div className="h-full select-none relative">
      <div className="bg-white flex flex-col h-full md:min-h-[60dvh] overflow-hidden">
        {/* CELULAR: barra de título */}
        <div className="md:hidden border-b border-slate-200 bg-white shrink-0">
          {selectMode ? (
            <div className="h-14 flex items-center gap-0.5 px-1.5 bg-blue-50">
              <button type="button" onClick={() => (setSelectMode(false), setSelKeys(new Set()))} className={mBtn} aria-label="Sair da seleção">
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0 px-1 text-[16px] font-semibold text-slate-900">
                {selectedItems.length} {selectedItems.length === 1 ? 'selecionado' : 'selecionados'}
              </div>
              <button type="button" onClick={() => setSelKeys(new Set(visibleItems.filter((i) => i.kind !== 'dept').map((i) => i.key)))} className={mBtn} aria-label="Selecionar tudo">
                <CheckSquare className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="h-14 flex items-center gap-0.5 px-1.5">
              {canGoUp ? (
                <button type="button" onClick={goUp} className={mBtn} aria-label="Voltar">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-2" />
              )}
              <div className="flex-1 min-w-0 px-1">
                <div className="text-[17px] font-semibold text-slate-900 truncate leading-tight">{currentDeptId ? locationName : 'Lixeira'}</div>
                <div className="text-[12px] text-slate-500 truncate leading-tight mt-0.5">
                  {visibleItems.length} {visibleItems.length === 1 ? 'item' : 'itens'} • somem em {retentionDays} dias
                </div>
              </div>
              {currentDeptId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileSearchOpen((v) => !v);
                    if (mobileSearchOpen) setSearch('');
                  }}
                  className={`${mBtn} ${mobileSearchOpen ? 'bg-blue-50 text-blue-600' : ''}`}
                  aria-label="Pesquisar"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileSheet('options');
                }}
                className={mBtn}
                aria-label="Opções"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          )}
          {mobileSearchOpen && currentDeptId && !selectMode && (
            <div className="px-3 pb-2.5">
              <div className="h-10 rounded-xl bg-slate-100 flex items-center px-3 gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="search"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar na lixeira"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-slate-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* BARRA DE COMANDOS */}
        <div className="hidden md:flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-200 relative z-20">
          <button type="button" className={`${toolbarBtn} font-medium`} disabled={!selectedDocs.length || !!busy} onClick={() => restore(selectedDocs)} title="Restaurar para o local original">
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            Restaurar{selectedDocs.length > 1 ? ` (${selectedDocs.length})` : ''}
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${canPurgeSelection ? 'text-rose-700 hover:bg-rose-50' : ''}`}
            disabled={!canPurgeSelection || !!busy}
            onClick={() => askPurge(selectedDocs)}
            title={selectedDocs.length && !canPurgeSelection ? 'Somente a gestão do setor pode excluir definitivamente' : 'Apagar do servidor (Delete)'}
          >
            <Trash2 className="w-4 h-4" />
            Excluir definitivamente{selectedDocs.length > 1 ? ` (${selectedDocs.length})` : ''}
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <button
            type="button"
            className={toolbarBtn}
            disabled={!currentDeptId || !visibleItems.length}
            onClick={() => setSelKeys(new Set(visibleItems.map((i) => i.key)))}
            title="Selecionar tudo (Ctrl+A)"
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden lg:inline">Selecionar tudo</span>
          </button>
          {canEmpty && (
            <button type="button" className={toolbarBtn} disabled={!!busy} onClick={() => setConfirm({ mode: 'empty', docs: deptDocs })} title="Apagar tudo o que está na lixeira deste setor">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span className="hidden lg:inline">Esvaziar lixeira</span>
            </button>
          )}
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <div className="relative">
            <button
              type="button"
              className={toolbarBtn}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'sort' ? null : 'sort');
              }}
            >
              <ArrowUpDown className="w-4 h-4" />
              <span className="hidden md:inline">Classificar</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {openMenu === 'sort' && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-40 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                {([
                  ['name', 'Nome'],
                  ['deleted', 'Data da exclusão'],
                  ['remaining', 'Apagado em (prazo)'],
                  ['size', 'Tamanho'],
                ] as [SortKey, string][]).map(([k, label]) => (
                  <MenuItem key={k} label={label} checked={sortKey === k} onClick={() => setSort(k)} />
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              className={toolbarBtn}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'view' ? null : 'view');
              }}
            >
              {viewMode === 'details' ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              <span className="hidden md:inline">Visualizar</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {openMenu === 'view' && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-40 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                <MenuItem label="Ícones grandes" checked={viewMode === 'large'} onClick={() => setViewMode('large')} />
                <MenuItem label="Ícones médios" checked={viewMode === 'medium'} onClick={() => setViewMode('medium')} />
                <MenuItem label="Detalhes" checked={viewMode === 'details'} onClick={() => setViewMode('details')} />
              </div>
            )}
          </div>
          <button type="button" className={toolbarBtn} onClick={() => load()} title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex-1" />
          <button type="button" onClick={toggleDetails} className={`${toolbarBtn} ${showDetails ? 'bg-slate-100' : ''}`} title="Painel de detalhes">
            <PanelRight className="w-4 h-4" /> Detalhes
          </button>
        </div>

        {/* BARRA DE ENDEREÇO */}
        <div className="hidden md:flex items-center gap-1 px-2 py-1.5 border-b border-slate-200">
          <button type="button" onClick={goBack} disabled={!backStack.length} className={toolbarBtn} title="Voltar (Alt+←)">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={goForward} disabled={!forwardStack.length} className={`${toolbarBtn} hidden sm:inline-flex`} title="Avançar">
            <ArrowRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={goUp} disabled={!canGoUp} className={toolbarBtn} title="Acima (Alt+↑)">
            <ArrowUp className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 h-9 px-2 border border-slate-200 rounded-md flex items-center gap-0.5 text-[13px] text-slate-700 overflow-x-auto whitespace-nowrap">
            <button type="button" onClick={() => onGoHome?.()} className="px-1.5 py-1 rounded hover:bg-slate-100 inline-flex items-center gap-1">
              <Home className="w-3.5 h-3.5 text-blue-600" /> Início
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={() => go({ deptId: singleDept ? deptId : null, path: [] })}
              className="px-1.5 py-1 rounded hover:bg-slate-100 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Lixeira
            </button>
            {currentDept && !singleDept && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button type="button" onClick={() => go({ deptId, path: [] })} className="px-1.5 py-1 rounded hover:bg-slate-100">
                  {currentDept.name}
                </button>
              </>
            )}
            {path.map((seg, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button type="button" onClick={() => go({ deptId, path: path.slice(0, i + 1) })} className="px-1.5 py-1 rounded hover:bg-slate-100">
                  {seg}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="hidden sm:flex h-9 w-56 lg:w-72 border border-slate-200 rounded-md items-center px-2 gap-1.5">
            <input
              type="text"
              value={search}
              disabled={!currentDeptId}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={currentDeptId ? `Pesquisar na lixeira de ${currentDept?.name || ''}` : 'Abra um setor para pesquisar'}
              className="flex-1 min-w-0 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Aviso do prazo + resultado da última ação */}
        <div className="px-3 pt-2 space-y-2 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-[12px] text-slate-500">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Os itens ficam {retentionDays} dias na lixeira e depois são apagados do servidor automaticamente. Excluir definitivamente apaga na hora, do disco e do banco de dados.
          </div>
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="font-semibold">
                OK
              </button>
            </div>
          )}
          {notice && (
            <div className={`p-2.5 rounded-lg text-xs border ${notice.failures.length ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              <div className="flex items-start gap-2">
                {notice.failures.length ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span className="flex-1">
                  {notice.text}
                  {notice.failures.length > 0 && ` ${notice.failures.length} não ${notice.failures.length === 1 ? 'pôde' : 'puderam'} ser processado(s):`}
                </span>
                <button type="button" onClick={() => setNotice(null)} className="font-semibold">
                  OK
                </button>
              </div>
              {notice.failures.length > 0 && (
                <ul className="mt-1.5 pl-6 space-y-0.5 max-h-24 overflow-y-auto">
                  {notice.failures.slice(0, 20).map((f) => (
                    <li key={f.id} className="truncate">
                      {f.name}: {f.error}
                    </li>
                  ))}
                  {notice.failures.length > 20 && <li>e mais {notice.failures.length - 20}…</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* CONTEÚDO */}
          <div
            ref={contentRef}
            className={`relative flex-1 min-w-0 overflow-auto ${isMobile ? (mobileView === 'grid' ? 'p-2 pb-28' : 'pb-28') : 'p-2 sm:p-3'}`}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              if (!selectMode) setSelKeys(new Set());
            }}
            onMouseDown={startMarquee}
            onContextMenu={(e) => handleContextMenu(e, null)}
          >
            {marquee && (
              <div
                className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-500/15 rounded-[2px]"
                style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
              />
            )}

            {loading ? (
              <div className="h-full min-h-[240px] flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando a lixeira...
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-slate-400 text-sm gap-2">
                <Trash2 className="w-12 h-12 text-slate-200" />
                <span>{emptyText}</span>
              </div>
            ) : isMobile && mobileView === 'list' ? (
              <ul className="divide-y divide-slate-100">
                {visibleItems.map((it) => {
                  const isSel = selKeys.has(it.key);
                  const r = remaining(soonest(it.docs));
                  return (
                    <li
                      key={it.key}
                      role="button"
                      {...touchHandlers(it)}
                      className={`flex items-center gap-3 pl-4 pr-1 min-h-[64px] [-webkit-touch-callout:none] ${isSel ? 'bg-blue-50' : 'active:bg-slate-100'}`}
                    >
                      {selectMode && it.kind !== 'dept' && (
                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                      )}
                      <span className="w-10 flex items-center justify-center shrink-0">{renderIcon(it, 40)}</span>
                      <span className="flex-1 min-w-0 py-2">
                        <span className="block text-[15px] leading-snug truncate text-slate-900">{it.name}</span>
                        <span className={`block text-[12.5px] truncate mt-0.5 ${it.kind === 'doc' && r.urgent ? 'text-rose-600' : 'text-slate-500'}`}>
                          {it.kind === 'doc' ? `${formatBytes(it.doc.sizeBytes)} • apaga em ${r.text}` : itemMeta(it)}
                        </span>
                      </span>
                      {it.kind === 'dept' || it.kind === 'dir' ? (
                        <ChevronRight className="w-5 h-5 text-slate-300 mr-2 shrink-0" />
                      ) : (
                        !selectMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelKeys(new Set([it.key]));
                              setContextMenu({ x: 0, y: 0, item: it });
                            }}
                            onTouchStart={(e) => e.stopPropagation()}
                            className={mBtn + ' text-slate-500'}
                            aria-label={`Ações de ${it.name}`}
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : isMobile ? (
              <div className="grid grid-cols-3 gap-1">
                {visibleItems.map((it) => {
                  const isSel = selKeys.has(it.key);
                  return (
                    <div
                      key={it.key}
                      role="button"
                      {...touchHandlers(it)}
                      className={`relative flex flex-col items-center gap-1.5 px-1 py-3 rounded-xl [-webkit-touch-callout:none] ${isSel ? 'bg-blue-100' : 'active:bg-slate-100'}`}
                    >
                      {selectMode && it.kind !== 'dept' && (
                        <span className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                          {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                      )}
                      <div className="h-14 flex items-end justify-center">{renderIcon(it, 56)}</div>
                      <span className="text-[12.5px] leading-tight text-center break-words w-full line-clamp-2 text-slate-800">{it.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : viewMode === 'details' ? (
              <table className="w-full text-[13px] text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    {([
                      ['name', 'Nome', ''],
                      [null, 'Local original', 'hidden lg:table-cell'],
                      ['deleted', 'Excluído em', 'hidden sm:table-cell'],
                      [null, 'Excluído por', 'hidden xl:table-cell'],
                      ['remaining', 'Apagado em', 'hidden md:table-cell'],
                      ['size', 'Tamanho', 'text-right'],
                    ] as [SortKey | null, string, string][]).map(([k, label, cls]) => (
                      <th key={label} className={`py-1.5 px-2 font-normal ${cls}`}>
                        {k ? (
                          <button type="button" onClick={(e) => (e.stopPropagation(), setSort(k))} className="hover:text-slate-900 inline-flex items-center gap-1">
                            {label}
                            {sortKey === k && <span className="text-[10px]">{sortAsc ? '▲' : '▼'}</span>}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it) => {
                    const isSel = selKeys.has(it.key);
                    const r = remaining(soonest(it.docs));
                    return (
                      <tr
                        key={it.key}
                        data-sel-key={it.key}
                        onClick={(e) => onItemClick(e, it)}
                        onDoubleClick={() => openItem(it)}
                        onContextMenu={(e) => handleContextMenu(e, it)}
                        className={`cursor-default ${isSel ? 'bg-blue-100' : 'hover:bg-blue-50'} text-slate-800`}
                      >
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{renderIcon(it, 20)}</span>
                            <span className="truncate">{it.name}</span>
                            {it.kind !== 'doc' && <span className="text-[11px] text-slate-400 shrink-0">({it.docs.length})</span>}
                          </div>
                        </td>
                        <td className="py-1 px-2 text-slate-500 hidden lg:table-cell truncate max-w-[220px]">
                          {it.kind === 'doc' ? originalLocation(it.doc) : it.kind === 'dir' ? [currentDept?.name, ...it.path].join(' › ') : '—'}
                        </td>
                        <td className="py-1 px-2 text-slate-500 hidden sm:table-cell whitespace-nowrap">{formatDate(latestDeleted(it.docs))}</td>
                        <td className="py-1 px-2 text-slate-500 hidden xl:table-cell whitespace-nowrap truncate max-w-[140px]">
                          {it.kind === 'doc' ? it.doc.trashedByName || '-' : ''}
                        </td>
                        <td className={`py-1 px-2 hidden md:table-cell whitespace-nowrap ${r.urgent ? 'text-rose-600 font-medium' : 'text-amber-700'}`}>
                          {it.docs.length ? r.text : '-'}
                        </td>
                        <td className="py-1 px-2 text-slate-500 text-right whitespace-nowrap tabular-nums">{formatBytes(sizeOf(it.docs))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${viewMode === 'large' ? 128 : 96}px, 1fr))` }}>
                {visibleItems.map((it) => {
                  const isSel = selKeys.has(it.key);
                  const iconSize = viewMode === 'large' ? 72 : 48;
                  const r = remaining(soonest(it.docs));
                  return (
                    <div
                      key={it.key}
                      role="button"
                      tabIndex={0}
                      data-sel-key={it.key}
                      onClick={(e) => onItemClick(e, it)}
                      onDoubleClick={() => openItem(it)}
                      onContextMenu={(e) => handleContextMenu(e, it)}
                      title={`${it.name}\n${itemMeta(it)}`}
                      className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-md border cursor-default outline-none ${
                        isSel ? 'bg-blue-100 border-blue-300' : 'border-transparent hover:bg-blue-50 hover:border-blue-100'
                      }`}
                    >
                      <div className="flex items-end justify-center" style={{ height: iconSize }}>
                        {renderIcon(it, iconSize)}
                      </div>
                      <span className={`text-[12.5px] leading-tight text-center break-words w-full ${isSel ? '' : 'line-clamp-3'} text-slate-800`}>{it.name}</span>
                      {it.docs.length > 0 && (
                        <span className={`text-[10.5px] inline-flex items-center gap-0.5 ${r.urgent ? 'text-rose-600' : 'text-slate-400'}`}>
                          <Clock className="w-3 h-3" /> {it.kind === 'doc' ? r.short : `${it.docs.length} • ${r.short}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PAINEL DE DETALHES */}
          {showDetails && (
            <aside className="hidden md:block w-64 shrink-0 border-l border-slate-200 p-4 overflow-y-auto text-[13px]">
              {single && single.kind !== 'dept' ? (
                <div className="space-y-3">
                  <div className="flex justify-center py-2">{renderIcon(single, 88)}</div>
                  <div className="font-semibold text-slate-900 break-words text-center">{single.name}</div>
                  <dl className="space-y-2 text-xs">
                    {(single.kind === 'doc'
                      ? [
                          ['Tipo', typeLabel(single.doc.extension)],
                          ['Tamanho', formatBytes(single.doc.sizeBytes)],
                          ['Local original', originalLocation(single.doc)],
                          ['Enviado por', single.doc.ownerName],
                          ['Excluído por', single.doc.trashedByName || '-'],
                          ['Excluído em', formatDate(single.doc.trashedAt)],
                          ['Apagado definitivamente em', `${formatDate(single.doc.purgeAt)} (${remaining(single.doc.purgeAt).text})`],
                        ]
                      : [
                          ['Tipo', 'Pasta (caminho original)'],
                          ['Arquivos', String(single.docs.length)],
                          ['Tamanho', formatBytes(sizeOf(single.docs))],
                          ['Local original', [currentDept?.name, ...single.path].join(' › ')],
                          ['Primeiro a ser apagado', `${formatDate(soonest(single.docs))} (${remaining(soonest(single.docs)).text})`],
                        ]
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-slate-400">{k}</dt>
                        <dd className="text-slate-800 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => restore(single.docs)}
                      className="w-full h-9 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 inline-flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                    </button>
                    {single.docs.every((d) => d.canPurge) && (
                      <button
                        type="button"
                        onClick={() => askPurge(single.docs)}
                        className="w-full h-9 rounded-lg text-xs font-semibold border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 inline-flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir definitivamente
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedItems.length > 1 ? (
                <div className="space-y-3 text-center text-slate-600">
                  <div className="flex justify-center py-2">
                    <FolderGlyph size={88} />
                  </div>
                  <div className="font-semibold text-slate-900">{selectedItems.length} itens selecionados</div>
                  <div className="text-xs">
                    {countLabel(selectedDocs.length)} • {formatBytes(sizeOf(selectedDocs))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-center text-slate-500">
                  <div className="flex justify-center py-2">
                    <Trash2 className="w-16 h-16 text-rose-200" />
                  </div>
                  <div className="font-semibold text-slate-800">{currentDept ? `Lixeira de ${currentDept.name}` : 'Lixeira'}</div>
                  <div className="text-xs">
                    {countLabel(currentDeptId ? deptDocs.length : items.length)} •{' '}
                    {formatBytes(sizeOf(currentDeptId ? deptDocs : items))}
                  </div>
                  <div className="text-xs text-slate-400 pt-2">Selecione itens para restaurar ou excluir definitivamente.</div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* BARRA DE STATUS */}
        <div className="hidden md:flex items-center gap-4 px-3 py-1.5 border-t border-slate-200 text-xs text-slate-600">
          <span>
            {visibleItems.length} {visibleItems.length === 1 ? 'item' : 'itens'}
          </span>
          {selectedItems.length > 0 && (
            <span className="truncate font-medium text-blue-700">
              {selectedItems.length} {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'} • {countLabel(selectedDocs.length)} •{' '}
              {formatBytes(sizeOf(selectedDocs))}
            </span>
          )}
        </div>
      </div>

      {/* CELULAR: barra de ações da seleção */}
      {isMobile && selectMode && selectedDocs.length > 0 && (
        <div className="fixed left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 flex gap-2">
          <button
            type="button"
            onClick={() => restore(selectedDocs)}
            className="flex-1 h-12 rounded-xl bg-emerald-50 text-emerald-700 font-semibold text-[14px] inline-flex items-center justify-center gap-2 active:bg-emerald-100"
          >
            <RotateCcw className="w-4 h-4" /> Restaurar ({selectedDocs.length})
          </button>
          {canPurgeSelection && (
            <button
              type="button"
              onClick={() => askPurge(selectedDocs)}
              className="flex-1 h-12 rounded-xl bg-rose-600 text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 active:bg-rose-700"
            >
              <Trash2 className="w-4 h-4" /> Excluir ({selectedDocs.length})
            </button>
          )}
        </div>
      )}

      {/* Menu do botão direito (computador) */}
      {contextMenu && !isMobile && (
        <div style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()} className="fixed z-50 w-60 bg-white rounded-lg border border-slate-200 shadow-xl py-1">
          {menuContent()}
        </div>
      )}

      {/* CELULAR: ações em folha que sobe de baixo */}
      {isMobile && (contextMenu || mobileSheet) && (
        <BottomSheet
          onClose={() => {
            setContextMenu(null);
            setMobileSheet(null);
          }}
          header={
            contextMenu?.item ? (
              <div className="flex items-center gap-3 px-5 pb-3 pt-1 border-b border-slate-100">
                <span className="w-10 flex justify-center shrink-0">{renderIcon(contextMenu.item, 40)}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-900 truncate">{contextMenu.item.name}</span>
                  <span className="block text-[12.5px] text-slate-500 truncate">{itemMeta(contextMenu.item)}</span>
                </span>
              </div>
            ) : null
          }
        >
          {contextMenu ? (
            <>
              {contextMenu.item?.kind === 'doc' && <div className="px-5 py-2 text-[12.5px] text-slate-500">Estava em: {originalLocation(contextMenu.item.doc)}</div>}
              {menuContent()}
              {contextMenu.item && contextMenu.item.kind !== 'dept' && (
                <MenuItem
                  icon={<CheckSquare className="w-5 h-5" />}
                  label="Selecionar vários"
                  onClick={() => {
                    setSelectMode(true);
                    setSelKeys(new Set([contextMenu.item!.key]));
                  }}
                />
              )}
            </>
          ) : (
            <>
              <div className="px-5 pb-2 pt-1 text-[13px] font-semibold text-slate-500">Ordenar por</div>
              {([
                ['name', 'Nome'],
                ['deleted', 'Data da exclusão'],
                ['remaining', 'Apagado em (prazo)'],
                ['size', 'Tamanho'],
              ] as [SortKey, string][]).map(([k, label]) => (
                <MenuItem key={k} label={label} checked={sortKey === k} onClick={() => setSort(k)} />
              ))}
              <div className="px-5 pt-3 pb-2 text-[13px] font-semibold text-slate-500 border-t border-slate-100 mt-1">Exibir como</div>
              <MenuItem icon={<ListIcon className="w-5 h-5" />} label="Lista" checked={mobileView === 'list'} onClick={() => setMobileView('list')} />
              <MenuItem icon={<LayoutGrid className="w-5 h-5" />} label="Ícones" checked={mobileView === 'grid'} onClick={() => setMobileView('grid')} />
              {currentDeptId && visibleItems.some((i) => i.kind !== 'dept') && (
                <>
                  <div className="border-t border-slate-100 mt-1" />
                  <MenuItem
                    icon={<CheckSquare className="w-5 h-5" />}
                    label="Selecionar vários"
                    onClick={() => {
                      setSelectMode(true);
                      setSelKeys(new Set());
                    }}
                  />
                </>
              )}
              {canEmpty && (
                <MenuItem icon={<Trash2 className="w-5 h-5" />} label="Esvaziar lixeira do setor" danger onClick={() => setConfirm({ mode: 'empty', docs: deptDocs })} />
              )}
            </>
          )}
        </BottomSheet>
      )}

      {/* Confirmação: apagar de vez */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4 bg-slate-950/60" onClick={(e) => e.stopPropagation()}>
          <div role="dialog" aria-label="Excluir definitivamente" className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  {confirm.mode === 'empty' ? `Esvaziar a lixeira de ${currentDept?.name || 'setor'}?` : 'Excluir definitivamente?'}
                </h3>
                <p className="text-[13px] text-slate-600 mt-1">
                  {confirm.docs.length === 1 ? (
                    <>
                      <strong className="break-words">{confirm.docs[0].name}</strong> ({formatBytes(confirm.docs[0].sizeBytes)})
                    </>
                  ) : (
                    <>
                      <strong>{countLabel(confirm.docs.length)}</strong> ({formatBytes(sizeOf(confirm.docs))})
                    </>
                  )}{' '}
                  {confirm.docs.length === 1 ? 'será apagado' : 'serão apagados'} agora do disco do servidor e do banco de dados. <strong>Não dá para desfazer.</strong>
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="h-11 md:h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[14px] md:text-[13px] font-semibold text-slate-700">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => purge(confirm.docs)}
                className="h-11 md:h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[14px] md:text-[13px] font-semibold inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> {confirm.mode === 'empty' ? 'Esvaziar lixeira' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processando */}
      {busy && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-5 w-[min(22rem,calc(100%-2rem))] space-y-3">
            <div className="flex items-center gap-3 text-[14px] font-semibold text-slate-900">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              {busy.label}… {busy.done} de {busy.total}
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${busy.total ? Math.round((busy.done / busy.total) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
