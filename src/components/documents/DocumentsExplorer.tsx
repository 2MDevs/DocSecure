import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder as FolderIcon,
  Lock,
  Plus,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Search,
  Download,
  Trash2,
  Star,
  SlidersHorizontal,
  FolderPlus,
  Upload,
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  PanelRight,
  Home,
  HardDrive,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Check,
  CheckCircle2,
  RefreshCw,
  EyeOff,
  Eye,
  MoreVertical,
  FolderUp,
  Files,
  X,
} from 'lucide-react';
import { Department, Folder, DocumentItem, User, PermissionType } from '../../types';
import { verifyPermission } from '../../services/securityEngine';
import { FolderConfigModal } from './FolderConfigModal';
import { PropertiesModal } from './PropertiesModal';
import { BulkUploadConfirm, BulkUploadPanel, BulkItemState, isBlockedFile } from './BulkUpload';
import { collectFromDrop, collectFromInput, hasExternalFiles, PickedFile } from '../../services/dropFiles';
import { canAccessDepartment } from '../layout/NavPane';
import { useIsMobile } from '../../hooks/useIsMobile';
import { BottomSheet } from '../common/BottomSheet';

interface DocumentsExplorerProps {
  currentUser: User;
  departments: Department[];
  folders: Folder[];
  documents: DocumentItem[];
  users: User[];
  searchTerm: string;
  onOpenDocument: (doc: DocumentItem) => void;
  onDownloadDocument: (doc: DocumentItem) => void;
  onOpenUploadModal: (deptId?: string, folderId?: string) => void;
  onOpenCreateFolderModal: (deptId?: string, parentId?: string | null) => void;
  onAccessDenied: (reason: string, resourceName: string) => void;
  onToggleFavorite: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  /** Envio em lote (arrastar arquivos/pastas do computador) */
  onCreateFolderDirect?: (data: {
    name: string;
    departmentId: string;
    parentId?: string | null;
    isLocked: boolean;
    isPrivate?: boolean;
    description: string;
  }) => Promise<Folder>;
  onUploadFile?: (
    file: File,
    options: { departmentId: string; folderId: string | null; name: string; tags: string[]; security?: any },
    onProgress?: (percent: number) => void
  ) => Promise<DocumentItem>;
  isOnline?: boolean;
  /** Excluir vários itens de uma vez (arquivos vão para a lixeira; pastas com o conteúdo) */
  onDeleteMany?: (docIds: string[], folderIds: string[]) => Promise<unknown>;
  /** Propriedades → Segurança do arquivo */
  onUpdateDocumentSecurity?: (
    docId: string,
    security: { visibility?: string; downloadPolicy?: string; deletePolicy?: string }
  ) => Promise<unknown>;
  onUpdateUserPermissions: (userId: string, folderId: string, permissions: PermissionType[]) => void;
  onUpdateFolder?: (folderId: string, updates: Partial<Folder>) => void;
  onDeleteFolder?: (folderId: string) => void;
  onMoveDocument?: (docId: string, targetFolderId: string) => void;
  onMoveFolder?: (folderId: string, targetFolderId: string) => void;
  /** Navegação pedida pelo menu lateral (muda o nonce a cada clique) */
  externalNavigation?: { deptId: string | null; folderId: string | null; nonce: number };
  /** Informa a pasta aberta para o menu lateral destacar */
  onLocationChange?: (location: { deptId: string | null; folderId: string | null }) => void;
  /** Lista plana (Favoritos / Compartilhados): mostra só os documentos recebidos */
  flatView?: { title: string };
  /** Em Favoritos/Compartilhados, o "Início" volta para o explorador */
  onGoHome?: () => void;
  /** Arquivos aguardando envio (fila offline) ou sendo enviados agora */
  pendingDocs?: DocumentItem[];
  /** Estado de sincronização por documento: enviando, na fila ou recém-sincronizado */
  syncStates?: Record<string, 'uploading' | 'pending' | 'synced' | 'error'>;
}

type ViewMode = 'large' | 'medium' | 'details';
type SortKey = 'name' | 'date' | 'type' | 'size';
type Location = { deptId: string | null; folderId: string | null };
type Item =
  | { kind: 'dept'; id: string; name: string; dept: Department }
  | { kind: 'folder'; id: string; name: string; folder: Folder }
  | { kind: 'doc'; id: string; name: string; doc: DocumentItem };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: i === 0 ? 0 : value < 10 ? 1 : 0 })} ${units[i]}`;
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const TYPE_LABEL: Record<string, string> = {
  pdf: 'Documento PDF',
  doc: 'Documento do Word',
  docx: 'Documento do Word',
  xls: 'Planilha do Excel',
  xlsx: 'Planilha do Excel',
  csv: 'Arquivo CSV',
  ppt: 'Apresentação do PowerPoint',
  pptx: 'Apresentação do PowerPoint',
  png: 'Imagem PNG',
  jpg: 'Imagem JPEG',
  jpeg: 'Imagem JPEG',
  gif: 'Imagem GIF',
  webp: 'Imagem WEBP',
  zip: 'Pasta compactada',
  rar: 'Arquivo compactado',
  txt: 'Documento de texto',
};
const typeLabel = (ext: string) => TYPE_LABEL[ext?.toLowerCase()] || `Arquivo ${ext?.toUpperCase() || ''}`.trim();

const EXT_COLORS: Record<string, string> = {
  pdf: '#dc2626',
  doc: '#2563eb',
  docx: '#2563eb',
  xls: '#16a34a',
  xlsx: '#16a34a',
  csv: '#15803d',
  ppt: '#ea580c',
  pptx: '#ea580c',
  zip: '#ca8a04',
  rar: '#ca8a04',
  txt: '#64748b',
};
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Ícone de pasta no estilo do Windows */
const FolderGlyph: React.FC<{ size: number; locked?: boolean; dimmed?: boolean; privateFolder?: boolean }> = ({ size, locked, dimmed, privateFolder }) => (
  <div className={`relative ${dimmed ? 'opacity-60' : ''}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M4 14a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z" fill="#e0a526" />
      <path d="M4 22h56v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#f8c94a" />
      <path d="M4 22h56v3H4z" fill="#fbd96b" />
    </svg>
    {(locked || privateFolder) && (
      <span
        className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200"
        title={privateFolder ? 'Pasta privada' : 'Pasta trancada'}
      >
        {privateFolder ? (
          <EyeOff className="text-violet-600" style={{ width: size * 0.22, height: size * 0.22 }} />
        ) : (
          <Lock className="text-slate-600" style={{ width: size * 0.22, height: size * 0.22 }} />
        )}
      </span>
    )}
  </div>
);

/** Ícone de unidade (setor) no estilo "Este Computador" */
const DriveGlyph: React.FC<{ size: number; locked?: boolean }> = ({ size, locked }) => (
  <div className={`relative ${locked ? 'opacity-60' : ''}`} style={{ width: size, height: size }}>
    <FolderGlyph size={size} />
    <HardDrive
      className="absolute text-amber-900/70"
      style={{ width: size * 0.32, height: size * 0.32, left: size * 0.34, top: size * 0.44 }}
    />
    {locked && (
      <span className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200">
        <Lock className="text-rose-600" style={{ width: size * 0.22, height: size * 0.22 }} />
      </span>
    )}
  </div>
);

/** Ícone de arquivo: folha com canto dobrado e etiqueta da extensão */
const FileGlyph: React.FC<{ ext: string; size: number }> = ({ ext, size }) => {
  const e = (ext || '').toLowerCase();
  if (IMAGE_EXT.includes(e)) {
    return (
      <div
        className="rounded-md bg-gradient-to-br from-sky-100 to-indigo-100 border border-slate-200 flex items-center justify-center"
        style={{ width: size * 0.82, height: size }}
      >
        <ImageIcon className="text-indigo-500" style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    );
  }
  const color = EXT_COLORS[e] || '#475569';
  const label = (e || 'arq').toUpperCase().slice(0, 4);
  return (
    <svg viewBox="0 0 52 64" width={size * 0.82} height={size} aria-hidden="true">
      <path d="M4 2h30l14 14v44a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M34 2v12a2 2 0 0 0 2 2h12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="6" y="34" width="40" height="16" rx="3" fill={color} />
      <text x="26" y="46" textAnchor="middle" fontSize={label.length > 3 ? 9 : 11} fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">
        {label}
      </text>
    </svg>
  );
};

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

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export const DocumentsExplorer: React.FC<DocumentsExplorerProps> = ({
  currentUser,
  departments,
  folders,
  documents,
  users,
  searchTerm,
  onOpenDocument,
  onDownloadDocument,
  onOpenUploadModal,
  onOpenCreateFolderModal,
  onAccessDenied,
  onToggleFavorite,
  onDeleteDocument,
  onUpdateDocumentSecurity,
  onCreateFolderDirect,
  onUploadFile,
  isOnline = true,
  onDeleteMany,
  onUpdateUserPermissions,
  onUpdateFolder,
  onDeleteFolder,
  onMoveDocument,
  onMoveFolder,
  externalNavigation,
  onLocationChange,
  flatView,
  onGoHome,
  pendingDocs = [],
  syncStates = {},
}) => {
  // Arquivos na fila aparecem junto com os demais, com o ícone de sincronização
  const allDocuments = useMemo(() => (pendingDocs.length ? [...pendingDocs, ...documents] : documents), [pendingDocs, documents]);
  const [location, setLocation] = useState<Location>({ deptId: null, folderId: null });
  const [backStack, setBackStack] = useState<Location[]>([]);
  const [forwardStack, setForwardStack] = useState<Location[]>([]);

  const [viewMode, setViewModeState] = useState<ViewMode>(() => readPref('ds.explorer.view', 'large'));
  const [sortKey, setSortKeyState] = useState<SortKey>(() => readPref('ds.explorer.sort', 'name'));
  const [sortAsc, setSortAscState] = useState<boolean>(() => readPref('ds.explorer.sortAsc', true));
  const [showDetailsPane, setShowDetailsPaneState] = useState<boolean>(() => readPref('ds.explorer.details', false));
  const setViewMode = (v: ViewMode) => (setViewModeState(v), writePref('ds.explorer.view', v));
  const setSort = (k: SortKey) => {
    const asc = k === sortKey ? !sortAsc : true;
    setSortKeyState(k);
    setSortAscState(asc);
    writePref('ds.explorer.sort', k);
    writePref('ds.explorer.sortAsc', asc);
  };
  const toggleDetailsPane = () => {
    setShowDetailsPaneState((v) => (writePref('ds.explorer.details', !v), !v));
  };

  const [localSearch, setLocalSearch] = useState('');
  // Seleção (uma ou várias): clique, Ctrl+clique, Shift+clique, Ctrl+A ou o "quadrado" de seleção
  const [selKeys, setSelKeys] = useState<Set<string>>(() => new Set());
  const anchorKey = useRef<string | null>(null);
  const keyOf = (it: { kind: string; id: string }) => `${it.kind}:${it.id}`;
  const setSelected = (sel: { kind: string; id: string } | null) => {
    anchorKey.current = sel ? keyOf(sel) : null;
    setSelKeys(sel ? new Set([keyOf(sel)]) : new Set());
  };
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const suppressClick = useRef(false);
  const [deleteMany, setDeleteMany] = useState<Item[] | null>(null);
  const [openMenu, setOpenMenu] = useState<'new' | 'sort' | 'view' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Item | null } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deleteConfirmFolder, setDeleteConfirmFolder] = useState<Folder | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<DocumentItem | null>(null);
  const [configFolder, setConfigFolder] = useState<Folder | null>(null);
  const [propsTarget, setPropsTarget] = useState<{ kind: 'doc' | 'folder'; id: string } | null>(null);

  // ---------------------------------------------------------------- arrastar do computador / envio em lote
  const [externalDrag, setExternalDrag] = useState(false);
  const dragDepth = useRef(0);
  const [pick, setPick] = useState<{
    files: PickedFile[];
    folders: string[];
    dest: { deptId: string; folderId: string | null };
    label: string;
  } | null>(null);
  const [bulk, setBulk] = useState<{ items: BulkItemState[]; foldersCreated: number; running: boolean } | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const canBulk = Boolean(onUploadFile);
  const [accessRevokedNotice, setAccessRevokedNotice] = useState<string | null>(null);
  const [expandedDeptIds, setExpandedDeptIds] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- celular (visual de app)
  const isMobile = useIsMobile();
  const [mobileView, setMobileViewState] = useState<'list' | 'grid'>(() => readPref('ds.explorer.mview', 'list'));
  const setMobileView = (v: 'list' | 'grid') => (setMobileViewState(v), writePref('ds.explorer.mview', v));
  const [mobileSheet, setMobileSheet] = useState<'new' | 'options' | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });

  const role = currentUser.role;
  // Diretoria vê todos os setores; o desenvolvedor é tratado como responsável do próprio setor
  const isAdmin = role === 'DIRECTOR' || Boolean(currentUser.directorAccess);
  const currentDept = departments.find((d) => d.id === location.deptId) || null;
  const currentFolder = folders.find((f) => f.id === location.folderId) || null;
  const query = (localSearch || searchTerm || '').trim().toLowerCase();

  // ---------------------------------------------------------------- acesso
  /** Todos veem todos os setores; só entram onde têm permissão. */
  const hasDeptAccess = (dept: Department) => canAccessDepartment(currentUser, dept, folders);
  const isManagerOf = (deptId?: string | null) =>
    isAdmin || ((role === 'MANAGER' || role === 'DEVELOPER') && !!deptId && currentUser.departmentId === deptId);
  const canEditFolderPrivacy = (f: Folder) => isManagerOf(f.departmentId) || f.createdBy === currentUser.id;
  // Regras do próprio arquivo (Propriedades → Segurança); o servidor confere de novo
  const docOwnerOrManager = (doc: DocumentItem) => doc.ownerId === currentUser.id || isManagerOf(doc.departmentId);
  const canDeleteDoc = (doc: DocumentItem) =>
    doc.deletePolicy === 'managers'
      ? isManagerOf(doc.departmentId)
      : doc.deletePolicy === 'owner'
      ? docOwnerOrManager(doc)
      : doc.ownerId === currentUser.id ||
        verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'DELETE_DOCUMENT', doc.folderId || undefined).allowed;
  const canDownloadDoc = (doc: DocumentItem) =>
    doc.downloadPolicy === 'none'
      ? false
      : doc.downloadPolicy === 'owner'
      ? docOwnerOrManager(doc)
      : verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'DOWNLOAD_DOCUMENT', doc.folderId || undefined).allowed;

  // ---------------------------------------------------------------- tamanhos
  const { folderSize, folderCount } = useMemo(() => {
    const children = new Map<string | null, Folder[]>();
    folders.forEach((f) => {
      const key = f.parentId || null;
      children.set(key, [...(children.get(key) || []), f]);
    });
    const docBytes = new Map<string, number>();
    const docCount = new Map<string, number>();
    documents.forEach((d) => {
      if (!d.folderId) return;
      docBytes.set(d.folderId, (docBytes.get(d.folderId) || 0) + (d.sizeBytes || 0));
      docCount.set(d.folderId, (docCount.get(d.folderId) || 0) + 1);
    });
    const size = new Map<string, number>();
    const count = new Map<string, number>();
    const visit = (f: Folder, guard: Set<string>): [number, number] => {
      if (size.has(f.id)) return [size.get(f.id)!, count.get(f.id)!];
      if (guard.has(f.id)) return [0, 0];
      guard.add(f.id);
      let s = docBytes.get(f.id) || 0;
      let c = (docCount.get(f.id) || 0) + (children.get(f.id)?.length || 0);
      (children.get(f.id) || []).forEach((child) => {
        const [cs] = visit(child, guard);
        s += cs;
      });
      size.set(f.id, s);
      count.set(f.id, c);
      return [s, c];
    };
    folders.forEach((f) => visit(f, new Set()));
    return { folderSize: size, folderCount: count };
  }, [folders, documents]);

  // ---------------------------------------------------------------- navegação
  const navigate = (next: Location) => {
    setBackStack((prev) => [...prev, location]);
    setForwardStack([]);
    setLocation(next);
    setSelected(null);
    setLocalSearch('');
  };

  const openDept = (dept: Department) => {
    if (!hasDeptAccess(dept)) {
      onAccessDenied(
        `Você não tem permissão para acessar o setor ${dept.name}. Peça liberação ao gestor responsável.`,
        dept.name
      );
      return;
    }
    navigate({ deptId: dept.id, folderId: null });
    setExpandedDeptIds((prev) => (prev.includes(dept.id) ? prev : [...prev, dept.id]));
  };

  const openFolder = (folder: Folder) => {
    const perm = verifyPermission(currentUser, 'folder', folder.id, folder.departmentId, 'VIEW_FOLDER');
    if (!perm.allowed) {
      onAccessDenied(perm.reason || `Você não tem autorização para abrir a pasta ${folder.name}.`, folder.name);
      return;
    }
    navigate({ deptId: folder.departmentId, folderId: folder.id });
  };

  const openDoc = (doc: DocumentItem) => {
    const perm = verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'VIEW_DOCUMENT', doc.folderId || undefined);
    if (!perm.allowed) {
      onAccessDenied(perm.reason || `Você não tem autorização para abrir ${doc.name}.`, doc.name);
      return;
    }
    onOpenDocument(doc);
  };

  const downloadDoc = (doc: DocumentItem) => {
    if (!canDownloadDoc(doc)) {
      onAccessDenied(
        doc.downloadPolicy === 'none'
          ? `O download de ${doc.name} está bloqueado nas propriedades do arquivo: ele pode apenas ser visualizado.`
          : `A permissão de download do arquivo ${doc.name} não está liberada para você.`,
        doc.name
      );
      return;
    }
    onDownloadDocument(doc);
  };

  const goBack = () => {
    const prev = backStack[backStack.length - 1];
    if (!prev) return;
    setBackStack((s) => s.slice(0, -1));
    setForwardStack((s) => [location, ...s]);
    setLocation(prev);
    setSelected(null);
  };
  const goForward = () => {
    const next = forwardStack[0];
    if (!next) return;
    setForwardStack((s) => s.slice(1));
    setBackStack((s) => [...s, location]);
    setLocation(next);
    setSelected(null);
  };
  const goUp = () => {
    if (currentFolder) navigate({ deptId: currentFolder.departmentId, folderId: currentFolder.parentId || null });
    else if (location.deptId) navigate({ deptId: null, folderId: null });
  };

  // Menu lateral único: abre o setor/pasta clicado
  useEffect(() => {
    if (!externalNavigation) return;
    const { deptId, folderId } = externalNavigation;
    if (deptId === location.deptId && folderId === location.folderId) return;
    if (!deptId) {
      navigate({ deptId: null, folderId: null });
      return;
    }
    const dept = departments.find((d) => d.id === deptId);
    if (!dept) return;
    if (!folderId) {
      openDept(dept);
      return;
    }
    const folder = folders.find((f) => f.id === folderId);
    if (folder) openFolder(folder);
  }, [externalNavigation?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelKeys(new Set());
    anchorKey.current = null;
  }, [location.deptId, location.folderId, flatView?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onLocationChange?.(location);
  }, [location.deptId, location.folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caminho completo da pasta atual (Início > Setor > Pasta > Subpasta)
  const folderPath = useMemo(() => {
    const path: Folder[] = [];
    let cursor = currentFolder;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      path.unshift(cursor);
      cursor = folders.find((f) => f.id === cursor!.parentId) || null;
    }
    return path;
  }, [currentFolder, folders]);

  // Tempo real: se a pasta/setor aberto deixar de estar acessível, sai dele e avisa
  useEffect(() => {
    if (location.folderId && !folders.some((f) => f.id === location.folderId)) {
      setLocation({ deptId: location.deptId, folderId: null });
      setSelected(null);
      setAccessRevokedNotice('A pasta que você estava vendo foi bloqueada, excluída ou o seu acesso foi alterado.');
    } else if (location.deptId) {
      const dept = departments.find((d) => d.id === location.deptId);
      if (!dept || !hasDeptAccess(dept)) {
        setLocation({ deptId: null, folderId: null });
        setSelected(null);
        setAccessRevokedNotice('O setor que você estava vendo não está mais disponível para você.');
      }
    }
  }, [folders, departments]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!accessRevokedNotice) return;
    const t = setTimeout(() => setAccessRevokedNotice(null), 8000);
    return () => clearTimeout(t);
  }, [accessRevokedNotice]);

  // ---------------------------------------------------------------- itens da pasta atual
  const items: Item[] = useMemo(() => {
    let list: Item[] = [];
    if (flatView) {
      list = allDocuments
        .filter((d) => !query || d.name.toLowerCase().includes(query) || d.tags?.some((t) => t.toLowerCase().includes(query)))
        .map((d) => ({ kind: 'doc' as const, id: d.id, name: d.name, doc: d }));
    } else if (query) {
      // Pesquisa: dentro do setor atual ou em tudo que o usuário enxerga (Início)
      const inScope = (deptId: string) => !location.deptId || deptId === location.deptId;
      list = [
        ...folders
          .filter((f) => inScope(f.departmentId) && f.name.toLowerCase().includes(query))
          .map((f) => ({ kind: 'folder' as const, id: f.id, name: f.name, folder: f })),
        ...allDocuments
          .filter(
            (d) =>
              inScope(d.departmentId) &&
              (d.name.toLowerCase().includes(query) || d.tags?.some((t) => t.toLowerCase().includes(query)))
          )
          .map((d) => ({ kind: 'doc' as const, id: d.id, name: d.name, doc: d })),
      ];
      if (!location.deptId) {
        list = [
          ...departments
            .filter((d) => d.name.toLowerCase().includes(query))
            .map((d) => ({ kind: 'dept' as const, id: d.id, name: d.name, dept: d })),
          ...list,
        ];
      }
    } else if (!location.deptId) {
      list = departments.map((d) => ({ kind: 'dept' as const, id: d.id, name: d.name, dept: d }));
    } else {
      list = [
        ...folders
          .filter((f) => f.departmentId === location.deptId && (f.parentId || null) === location.folderId)
          .map((f) => ({ kind: 'folder' as const, id: f.id, name: f.name, folder: f })),
        ...allDocuments
          .filter((d) => d.departmentId === location.deptId && (d.folderId || null) === location.folderId)
          .map((d) => ({ kind: 'doc' as const, id: d.id, name: d.name, doc: d })),
      ];
    }

    const sizeOf = (it: Item) =>
      it.kind === 'doc' ? it.doc.sizeBytes : it.kind === 'folder' ? folderSize.get(it.id) || 0 : it.dept.storageUsedBytes || 0;
    const dateOf = (it: Item) =>
      new Date(it.kind === 'doc' ? it.doc.updatedAt : it.kind === 'folder' ? it.folder.updatedAt : '').getTime() || 0;
    const typeOf = (it: Item) => (it.kind === 'doc' ? typeLabel(it.doc.extension) : '');
    const rank = (it: Item) => (it.kind === 'doc' ? 1 : 0); // pastas sempre primeiro, como no Windows
    const dir = sortAsc ? 1 : -1;

    return [...list].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      let cmp = 0;
      if (sortKey === 'size') cmp = sizeOf(a) - sizeOf(b);
      else if (sortKey === 'date') cmp = dateOf(a) - dateOf(b);
      else if (sortKey === 'type') cmp = typeOf(a).localeCompare(typeOf(b), 'pt-BR');
      if (cmp === 0) cmp = a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
      return cmp * dir;
    });
  }, [query, location, departments, folders, allDocuments, sortKey, sortAsc, folderSize, flatView]);

  const selectedItems = items.filter((i) => selKeys.has(keyOf(i)));
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const multiSelected = selectedItems.length > 1;
  const selectedDoc = selectedItem?.kind === 'doc' ? selectedItem.doc : null;
  const selectedFolder = selectedItem?.kind === 'folder' ? selectedItem.folder : null;

  const isPendingDoc = (it: Item | null) => it?.kind === 'doc' && (syncStates[it.id] === 'pending' || syncStates[it.id] === 'uploading');

  const activate = (item: Item) => {
    if (isPendingDoc(item)) {
      onAccessDenied(
        syncStates[item.id] === 'uploading'
          ? 'Este arquivo ainda está sendo enviado. Aguarde a confirmação (✓).'
          : 'Este arquivo está guardado neste navegador e será enviado automaticamente quando a conexão com o servidor voltar.',
        item.name
      );
      return;
    }
    if (item.kind === 'dept') openDept(item.dept);
    else if (item.kind === 'folder') openFolder(item.folder);
    else openDoc(item.doc);
  };

  /** Clique em um item: simples (só ele), Ctrl/Cmd (adiciona/remove) ou Shift (intervalo) */
  const onItemClick = (e: React.MouseEvent, it: Item) => {
    e.stopPropagation();
    const k = keyOf(it);
    if (e.ctrlKey || e.metaKey) {
      setSelKeys((prev) => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
      });
      anchorKey.current = k;
      return;
    }
    if (e.shiftKey && anchorKey.current) {
      const keys = items.map(keyOf);
      const a = keys.indexOf(anchorKey.current);
      const b = keys.indexOf(k);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelKeys(new Set(keys.slice(lo, hi + 1)));
        return;
      }
    }
    setSelected({ kind: it.kind, id: it.id });
  };

  /** Quadrado de seleção: clicar no espaço vazio e arrastar, como no Explorador do Windows */
  const startMarquee = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isMobile) return;
    if ((e.target as HTMLElement).closest('[data-sel-key], button, a, input, select, textarea, th')) return;
    const box = contentRef.current;
    if (!box) return;
    const bounds = box.getBoundingClientRect();
    // Clique na barra de rolagem não inicia seleção
    if (e.clientX > bounds.left + box.clientWidth || e.clientY > bounds.top + box.clientHeight) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selKeys) : new Set<string>();
    const startX = e.clientX - bounds.left + box.scrollLeft;
    const startY = e.clientY - bounds.top + box.scrollTop;
    let active = false;
    let lastClient = { x: e.clientX, y: e.clientY };
    let raf = 0;

    const update = () => {
      const b = box.getBoundingClientRect();
      const curX = lastClient.x - b.left + box.scrollLeft;
      const curY = lastClient.y - b.top + box.scrollTop;
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      setMarquee({ x, y, w, h });
      // Retângulo em coordenadas da tela, para comparar com os itens
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
      lastClient = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 5) return;
        active = true;
        setContextMenu(null);
        setOpenMenu(null);
      }
      // Rolagem automática ao encostar nas bordas
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
        suppressClick.current = true; // o "click" que vem logo depois não limpa a seleção
        setMarquee(null);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /** Excluir vários itens selecionados de uma vez */
  const requestDeleteMany = (list: Item[]) => {
    const targets = list.filter((i) => i.kind !== 'dept' && !isPendingDoc(i));
    if (!targets.length) return;
    const denied = targets.filter((i) =>
      i.kind === 'doc'
        ? !canDeleteDoc(i.doc)
        : i.kind === 'folder'
        ? !isManagerOf(i.folder.departmentId) && i.folder.createdBy !== currentUser.id
        : true
    );
    if (denied.length === targets.length) {
      onAccessDenied('Você não tem permissão para excluir os itens selecionados.', `${targets.length} itens`);
      return;
    }
    setDeleteMany(targets.filter((i) => !denied.includes(i)));
  };

  /** Quantos arquivos e subpastas existem dentro de uma pasta (todos os níveis) */
  const folderContents = (folderId: string) => {
    const tree = [folderId];
    for (let i = 0; i < tree.length; i++) folders.filter((f) => f.parentId === tree[i]).forEach((f) => tree.push(f.id));
    const files = allDocuments.filter((d) => d.folderId && tree.includes(d.folderId)).length;
    return { files, subfolders: tree.length - 1 };
  };

  const requestDelete = (item: Item | null) => {
    if (!item || isPendingDoc(item)) return;
    if (item.kind === 'doc') {
      if (!canDeleteDoc(item.doc)) {
        onAccessDenied('Você não tem permissão para excluir este arquivo.', item.name);
        return;
      }
      setDeleteConfirmDoc(item.doc);
    } else if (item.kind === 'folder') {
      if (!isManagerOf(item.folder.departmentId) && item.folder.createdBy !== currentUser.id) {
        onAccessDenied('Somente quem criou a pasta, o gestor do setor ou a diretoria podem excluí-la.', item.name);
        return;
      }
      setDeleteConfirmFolder(item.folder);
    }
  };

  /** Propriedades (Geral + Segurança) de um arquivo ou pasta */
  const openProperties = (folder: Folder) => setPropsTarget({ kind: 'folder', id: folder.id });
  const openItemProperties = (item: Item | null) => {
    if (!item || item.kind === 'dept' || isPendingDoc(item)) return;
    setPropsTarget({ kind: item.kind, id: item.id });
  };

  /** Nome do destino para mostrar ao usuário: Setor › Pasta › Subpasta */
  const destLabel = (deptId: string, folderId: string | null) => {
    const parts: string[] = [];
    let cursor = folders.find((f) => f.id === folderId);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = folders.find((f) => f.id === cursor!.parentId);
    }
    return [departments.find((d) => d.id === deptId)?.name || 'Setor', ...parts].join(' › ');
  };

  const beginPick = (picked: { files: PickedFile[]; folders: string[] }, dest: { deptId: string; folderId: string | null }) => {
    if (!picked.files.length) {
      onAccessDenied(
        picked.folders.length ? 'As pastas soltas estão vazias.' : 'Nenhum arquivo encontrado para enviar.',
        'Envio de arquivos'
      );
      return;
    }
    if (bulk?.running) {
      onAccessDenied('Aguarde terminar o envio em andamento antes de começar outro.', 'Envio de arquivos');
      return;
    }
    setPick({ ...picked, dest, label: destLabel(dest.deptId, dest.folderId) });
  };

  const handleExternalDrop = async (e: React.DragEvent, dest: { deptId: string; folderId: string | null } | null) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setExternalDrag(false);
    setDragOverId(null);
    if (!canBulk) return;
    if (!dest) {
      onAccessDenied('Abra um setor ou uma pasta para soltar os arquivos nela.', 'Envio de arquivos');
      return;
    }
    const picked = await collectFromDrop(e.dataTransfer);
    beginPick(picked, dest);
  };

  /** Envia tudo: cria as pastas (mesma organização do computador) e sobe os arquivos, 3 por vez */
  const runBulk = async (opts: { security: any; privateFolders: boolean }) => {
    if (!pick || !onUploadFile) return;
    const { dest } = pick;
    const files = pick.files.filter((f) => !isBlockedFile(f.file.name));
    setPick(null);
    const items: BulkItemState[] = files.map((f) => ({ name: f.file.name, path: f.dirs.join(' › '), status: 'wait' }));
    let foldersCreated = 0;
    const update = (i: number, patch: Partial<BulkItemState>) =>
      setBulk((b) => (b ? { ...b, items: b.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) } : b));
    setBulk({ items, foldersCreated: 0, running: true });

    // 1) Pastas: criadas ANTES dos arquivos, uma de cada vez (pais antes dos filhos),
    //    reaproveitando as que já existem com o mesmo nome no mesmo lugar
    const folderIdByPath = new Map<string, Promise<string | null>>([['', Promise.resolve(dest.folderId)]]);
    const ensure = (dirs: string[]): Promise<string | null> => {
      const key = dirs.join('/');
      const known = folderIdByPath.get(key);
      if (known) return known;
      const job = (async () => {
        const parentId = await ensure(dirs.slice(0, -1));
        const name = dirs[dirs.length - 1];
        const existing = foldersRef.current.find(
          (f) =>
            f.departmentId === dest.deptId &&
            (f.parentId || null) === (parentId || null) &&
            f.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
        if (existing) return existing.id;
        if (!onCreateFolderDirect) throw new Error('Criação de pastas indisponível.');
        try {
          const created = await onCreateFolderDirect({
            name,
            departmentId: dest.deptId,
            parentId,
            isLocked: false,
            isPrivate: opts.privateFolders,
            description: '',
          });
          foldersCreated += 1;
          setBulk((b) => (b ? { ...b, foldersCreated } : b));
          return created.id;
        } catch (err: any) {
          throw new Error(`Pasta "${name}": ${err?.message || 'não foi possível criar'}`);
        }
      })();
      folderIdByPath.set(key, job); // guarda a promessa: ninguém cria a mesma pasta duas vezes
      return job;
    };
    const allDirs = [...new Set(files.filter((f) => f.dirs.length).map((f) => f.dirs.join('/')))].sort(
      (a, b) => a.split('/').length - b.split('/').length
    );
    for (const d of allDirs) {
      await ensure(d.split('/')).catch(() => undefined); // o erro aparece nos arquivos daquela pasta
    }

    // 2) Arquivos: até 3 envios ao mesmo tempo
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        const f = files[i];
        update(i, { status: 'up', percent: 0 });
        try {
          const folderId = await ensure(f.dirs);
          await onUploadFile(
            f.file,
            { departmentId: dest.deptId, folderId, name: f.file.name, tags: [], security: opts.security },
            (pct) => update(i, { percent: pct })
          );
          update(i, { status: 'ok', percent: 100 });
        } catch (err: any) {
          update(i, { status: 'err', error: err?.message || 'Falha no envio.' });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBulk((b) => (b ? { ...b, running: false } : b));
  };

  // ---------------------------------------------------------------- teclado e cliques fora
  useEffect(() => {
    const close = () => {
      setContextMenu(null);
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Com qualquer janela/modal aberta (visualizador, envio, confirmações), o teclado não age no explorador
      if (document.querySelector('.fixed.inset-0')) return;
      if (e.key === 'Escape') {
        close();
        setSelected(null);
      } else if (e.key === 'Enter' && selectedItem) {
        activate(selectedItem);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isMobile) {
        e.preventDefault();
        setSelKeys(new Set(items.map(keyOf)));
      } else if (e.key === 'Delete' && multiSelected) {
        requestDeleteMany(selectedItems);
      } else if (e.key === 'Delete' && selectedItem) {
        requestDelete(selectedItem);
      } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowUp') {
        goUp();
      }
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }); // reavalia a cada render para usar o estado atual

  // ---------------------------------------------------------------- arrastar e soltar
  // Arquivo solto fora da área do explorador: não deixa o navegador abrir o arquivo e sair da plataforma
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (hasExternalFiles(e.dataTransfer)) e.preventDefault();
    };
    const reset = () => {
      dragDepth.current = 0;
      setExternalDrag(false);
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
      window.removeEventListener('drop', reset);
      window.removeEventListener('dragend', reset);
    };
  }, []);
  const onDragStart = (e: React.DragEvent, item: Item) => {
    if (item.kind === 'dept') return;
    // Arrastando um item que faz parte de uma seleção múltipla: leva todos
    const group =
      selKeys.has(keyOf(item)) && selKeys.size > 1
        ? selectedItems.filter((i) => i.kind !== 'dept').map((i) => ({ kind: i.kind, id: i.id }))
        : [{ kind: item.kind, id: item.id }];
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: item.kind, id: item.id, group }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropOnFolder = (e: React.DragEvent, target: Folder) => {
    if (hasExternalFiles(e.dataTransfer)) {
      handleExternalDrop(e, { deptId: target.departmentId, folderId: target.id });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      const group: Array<{ kind: string; id: string }> = Array.isArray(data.group) && data.group.length ? data.group : [data];
      group.forEach((g) => {
        if (g.kind === 'doc' && onMoveDocument) onMoveDocument(g.id, target.id);
        if (g.kind === 'folder' && g.id !== target.id && onMoveFolder) onMoveFolder(g.id, target.id);
      });
    } catch {}
  };

  // ---------------------------------------------------------------- textos auxiliares
  const locationName = flatView?.title || currentFolder?.name || currentDept?.name || 'Início';
  const itemSize = (it: Item) =>
    it.kind === 'doc' ? it.doc.sizeBytes : it.kind === 'folder' ? folderSize.get(it.id) || 0 : it.dept.storageUsedBytes || 0;
  const itemDate = (it: Item) =>
    it.kind === 'doc' ? formatDate(it.doc.updatedAt) : it.kind === 'folder' ? formatDate(it.folder.updatedAt) : '';
  const itemType = (it: Item) =>
    it.kind === 'doc'
      ? typeLabel(it.doc.extension)
      : it.kind === 'folder'
      ? it.folder.isPrivate
        ? 'Pasta privada'
        : it.folder.isLocked
        ? 'Pasta trancada'
        : 'Pasta de arquivos'
      : 'Setor';

  const iconSize = viewMode === 'large' ? 72 : 44;

  /** Setas girando (enviando / na fila) e check verde ao concluir — discretos, no canto do ícone */
  const SyncBadge: React.FC<{ id: string; size: number }> = ({ id, size }) => {
    const st = syncStates[id];
    if (!st) return null;
    const px = Math.max(12, Math.round(size * 0.3));
    const title =
      st === 'uploading'
        ? 'Enviando…'
        : st === 'pending'
        ? 'Aguardando conexão: será enviado automaticamente'
        : st === 'error'
        ? 'Falha no envio'
        : 'Sincronizado';
    return (
      <span title={title} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white shadow-sm" style={{ width: px, height: px }}>
        {st === 'synced' ? (
          <CheckCircle2 className="w-full h-full text-emerald-500 animate-in zoom-in duration-200" />
        ) : st === 'error' ? (
          <AlertTriangle className="w-full h-full text-rose-500" />
        ) : (
          <RefreshCw className={`w-full h-full p-[1px] animate-spin [animation-duration:1.6s] ${st === 'pending' ? 'text-amber-500' : 'text-sky-500'}`} />
        )}
      </span>
    );
  };

  const renderIcon = (it: Item, size: number) => {
    if (it.kind === 'doc' && syncStates[it.id]) {
      return (
        <span className={`relative inline-flex ${syncStates[it.id] === 'pending' ? 'opacity-70' : ''}`}>
          <FileGlyph ext={it.doc.extension} size={size} />
          <SyncBadge id={it.id} size={size} />
        </span>
      );
    }
    if (it.kind === 'dept') return <DriveGlyph size={size} locked={!hasDeptAccess(it.dept)} />;
    if (it.kind === 'folder') return <FolderGlyph size={size} locked={it.folder.isLocked} privateFolder={it.folder.isPrivate} />;
    if (it.doc.visibility === 'private' || it.doc.downloadPolicy === 'none') {
      return (
        <span className="relative inline-flex">
          <FileGlyph ext={it.doc.extension} size={size} />
          <span
            className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200"
            title={it.doc.visibility === 'private' ? 'Arquivo privado' : 'Download bloqueado'}
          >
            {it.doc.visibility === 'private' ? (
              <EyeOff className="text-violet-600" style={{ width: size * 0.22, height: size * 0.22 }} />
            ) : (
              <Lock className="text-slate-600" style={{ width: size * 0.22, height: size * 0.22 }} />
            )}
          </span>
        </span>
      );
    }
    return <FileGlyph ext={it.doc.extension} size={size} />;
  };

  const handleContextMenu = (e: React.MouseEvent, item: Item | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (item && !selKeys.has(keyOf(item))) setSelected({ kind: item.kind, id: item.id });
    setOpenMenu(null);
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - 280),
      item,
    });
  };

  const canCreateHere = !flatView && !!location.deptId;
  const mBtn = 'h-10 w-10 shrink-0 rounded-full text-slate-700 active:bg-slate-100 inline-flex items-center justify-center';
  const mobileSubtitle = (() => {
    const count = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    const waiting = pendingDocs.length ? ` • ${pendingDocs.length} aguardando envio` : '';
    if (flatView || !location.deptId) return (query ? `${count} encontrados` : flatView ? count : 'Setores da empresa') + waiting;
    const trail = [currentDept?.name, ...folderPath.slice(0, -1).map((f) => f.name)].filter(Boolean) as string[];
    return (currentFolder ? `${trail.join(' › ')} • ${count}` : count) + waiting;
  })();
  const mobileMeta = (it: Item) => {
    const st = it.kind === 'doc' ? syncStates[it.id] : undefined;
    if (st === 'pending') return 'Aguardando conexão para enviar';
    if (st === 'uploading') return 'Enviando…';
    if (it.kind === 'dept') {
      return hasDeptAccess(it.dept) ? `Setor • ${formatBytes(it.dept.storageUsedBytes || 0)}` : 'Sem permissão de acesso';
    }
    if (it.kind === 'folder') {
      const n = folderCount.get(it.id) || 0;
      const extra = it.folder.isPrivate ? ' • Privada' : it.folder.isLocked ? ' • Trancada' : '';
      return `${n} ${n === 1 ? 'item' : 'itens'} • ${formatBytes(folderSize.get(it.id) || 0)}${extra}`;
    }
    const tag = it.doc.visibility === 'private' ? ' • Privado' : it.doc.downloadPolicy === 'none' ? ' • Só visualizar' : '';
    return `${formatBytes(it.doc.sizeBytes)} • ${formatDate(it.doc.updatedAt)}${flatView || query ? ` • ${it.doc.departmentName}` : ''}${tag}`;
  };
  const openActions = (item: Item) => {
    setSelected({ kind: item.kind, id: item.id });
    setContextMenu({ x: 0, y: 0, item });
  };
  /** Toque abre; segurar o dedo (ou ⋮) mostra as ações */
  const touchHandlers = (it: Item) => ({
    onTouchStart: () => {
      longPress.current.fired = false;
      if (longPress.current.timer) clearTimeout(longPress.current.timer);
      longPress.current.timer = setTimeout(() => {
        longPress.current.fired = true;
        if (it.kind !== 'dept') openActions(it);
      }, 500);
    },
    onTouchMove: () => longPress.current.timer && clearTimeout(longPress.current.timer),
    onTouchEnd: () => longPress.current.timer && clearTimeout(longPress.current.timer),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (longPress.current.fired) {
        longPress.current.fired = false;
        return;
      }
      activate(it);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (it.kind !== 'dept') openActions(it);
    },
  });
  const toolbarBtn =
    'h-9 px-2.5 rounded-md text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent inline-flex items-center gap-1.5 transition-colors';

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
      } ${
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} flex items-center justify-center text-slate-500`}>{checked ? <Check className="w-4 h-4 text-blue-600" /> : icon}</span>
      <span>{label}</span>
    </button>
  );

  const contextMenuContent = () =>
    !contextMenu ? null : contextMenu.item && multiSelected && selKeys.has(keyOf(contextMenu.item)) ? (
      <>
        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{selectedItems.length} itens selecionados</div>
        <MenuItem icon={<Trash2 className="w-4 h-4" />} label={`Excluir ${selectedItems.length} itens`} danger onClick={() => requestDeleteMany(selectedItems)} />
        <MenuItem icon={<X className="w-4 h-4" />} label="Limpar seleção" onClick={() => setSelected(null)} />
      </>
    ) : (
      <>
          {!contextMenu.item ? (
            <>
              <MenuItem icon={<FolderPlus className="w-4 h-4 text-amber-500" />} label="Nova pasta" onClick={() => onOpenCreateFolderModal(location.deptId || undefined, location.folderId)} />
              <MenuItem icon={<Upload className="w-4 h-4 text-blue-600" />} label="Enviar arquivo" onClick={() => onOpenUploadModal(location.deptId || undefined, location.folderId || undefined)} />
              {canBulk && <MenuItem icon={<Files className="w-4 h-4 text-blue-600" />} label="Enviar vários arquivos" onClick={() => filesInputRef.current?.click()} />}
              {canBulk && <MenuItem icon={<FolderUp className="w-4 h-4 text-amber-500" />} label="Enviar pasta inteira" onClick={() => folderInputRef.current?.click()} />}
              <div className="border-t border-slate-100 my-1" />
              <MenuItem label="Ícones grandes" checked={viewMode === 'large'} onClick={() => setViewMode('large')} />
              <MenuItem label="Ícones médios" checked={viewMode === 'medium'} onClick={() => setViewMode('medium')} />
              <MenuItem label="Detalhes" checked={viewMode === 'details'} onClick={() => setViewMode('details')} />
              {currentFolder && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <MenuItem icon={<SlidersHorizontal className="w-4 h-4" />} label="Propriedades desta pasta" onClick={() => openProperties(currentFolder)} />
                </>
              )}
            </>
          ) : contextMenu.item.kind === 'dept' ? (
            <MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Abrir" onClick={() => activate(contextMenu.item!)} />
          ) : contextMenu.item.kind === 'folder' ? (
            <>
              <MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Abrir" onClick={() => activate(contextMenu.item!)} />
              <MenuItem
                icon={<FolderPlus className="w-4 h-4 text-amber-500" />}
                label="Nova subpasta"
                onClick={() => {
                  const f = (contextMenu.item as Extract<Item, { kind: 'folder' }>).folder;
                  onOpenCreateFolderModal(f.departmentId, f.id);
                }}
              />
              {(() => {
                const f = (contextMenu.item as Extract<Item, { kind: 'folder' }>).folder;
                const manager = isManagerOf(f.departmentId);
                const editPrivacy = canEditFolderPrivacy(f);
                return (
                  <>
                    <MenuItem icon={<SlidersHorizontal className="w-4 h-4" />} label="Propriedades" onClick={() => openProperties(f)} />
                    {editPrivacy && onUpdateFolder && (
                      <MenuItem
                        icon={f.isPrivate ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-violet-600" />}
                        label={f.isPrivate ? 'Tornar visível para o setor' : 'Tornar privada (só eu e a gestão)'}
                        onClick={() => onUpdateFolder(f.id, { isPrivate: !f.isPrivate })}
                      />
                    )}
                    {(manager || f.createdBy === currentUser.id) && (
                      <>
                        <div className="border-t border-slate-100 my-1" />
                        <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Excluir pasta" danger onClick={() => requestDelete(contextMenu.item)} />
                      </>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            (() => {
              const doc = (contextMenu.item as Extract<Item, { kind: 'doc' }>).doc;
              return (
                <>
                  <MenuItem icon={<ExternalLink className="w-4 h-4" />} label="Abrir" onClick={() => openDoc(doc)} />
                  <MenuItem icon={<Download className="w-4 h-4" />} label="Baixar" disabled={!canDownloadDoc(doc)} onClick={() => downloadDoc(doc)} />
                  <MenuItem
                    icon={<Star className={`w-4 h-4 ${doc.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />}
                    label={doc.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    onClick={() => onToggleFavorite(doc.id)}
                  />
                  <MenuItem
                    icon={<SlidersHorizontal className="w-4 h-4" />}
                    label="Propriedades e segurança"
                    onClick={() => setPropsTarget({ kind: 'doc', id: doc.id })}
                  />
                  {canDeleteDoc(doc) && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Excluir" danger onClick={() => requestDelete(contextMenu.item)} />
                    </>
                  )}
                </>
              );
            })()
          )}
      </>
    );

  // ---------------------------------------------------------------- render
  return (
    <div className="h-full select-none relative">
      <div className="bg-white flex flex-col h-full md:min-h-[60dvh] overflow-hidden">
        {/* CELULAR: barra de título do app (voltar, local atual, pesquisa e opções) */}
        <div className="md:hidden border-b border-slate-200 bg-white shrink-0">
          <div className="h-14 flex items-center gap-0.5 px-1.5">
            {!flatView && location.deptId ? (
              <button type="button" onClick={goUp} className={mBtn} aria-label="Voltar para a pasta anterior">
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <span className="w-2" />
            )}
            <div className="flex-1 min-w-0 px-1">
              <div className="text-[17px] font-semibold text-slate-900 truncate leading-tight">{locationName}</div>
              <div className="text-[12px] text-slate-500 truncate leading-tight mt-0.5">{mobileSubtitle}</div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSearchOpen((v) => !v);
                if (mobileSearchOpen) setLocalSearch('');
              }}
              className={`${mBtn} ${mobileSearchOpen ? 'bg-blue-50 text-blue-600' : ''}`}
              aria-label="Pesquisar"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheet('options');
              }}
              className={mBtn}
              aria-label="Ordenar e visualizar"
            >
              <ArrowUpDown className="w-5 h-5" />
            </button>
          </div>
          {mobileSearchOpen && (
            <div className="px-3 pb-2.5">
              <div className="h-10 rounded-xl bg-slate-100 flex items-center px-3 gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="search"
                  autoFocus
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder={`Pesquisar em ${locationName}`}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-slate-400"
                />
                {localSearch && (
                  <button type="button" onClick={() => setLocalSearch('')} className="text-slate-400" aria-label="Limpar pesquisa">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BARRA DE COMANDOS (como a do Explorador do Windows) */}
        <div className="hidden md:flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-200 relative z-20">
          <div className="relative">
            <button
              type="button"
              disabled={!canCreateHere}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'new' ? null : 'new');
              }}
              className={`${toolbarBtn} font-medium`}
              title={canCreateHere ? 'Novo' : 'Abra um setor para criar pastas ou enviar arquivos'}
            >
              <Plus className="w-4 h-4 text-blue-600" /> Novo <ChevronDown className="w-3 h-3" />
            </button>
            {openMenu === 'new' && (
              <div onClick={(e) => e.stopPropagation()} className="absolute z-40 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                <MenuItem
                  icon={<FolderPlus className="w-4 h-4 text-amber-500" />}
                  label="Pasta"
                  onClick={() => onOpenCreateFolderModal(location.deptId || undefined, location.folderId)}
                />
                <MenuItem
                  icon={<Upload className="w-4 h-4 text-blue-600" />}
                  label="Enviar arquivo"
                  onClick={() => onOpenUploadModal(location.deptId || undefined, location.folderId || undefined)}
                />
                {canBulk && (
                  <>
                    <MenuItem icon={<Files className="w-4 h-4 text-blue-600" />} label="Enviar vários arquivos" onClick={() => filesInputRef.current?.click()} />
                    <MenuItem icon={<FolderUp className="w-4 h-4 text-amber-500" />} label="Enviar pasta inteira" onClick={() => folderInputRef.current?.click()} />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          <button
            type="button"
            className={toolbarBtn}
            disabled={!selectedItem}
            onClick={() => selectedItem && activate(selectedItem)}
            title="Abrir"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden md:inline">Abrir</span>
          </button>
          <button
            type="button"
            className={toolbarBtn}
            disabled={!selectedDoc}
            onClick={() => selectedDoc && downloadDoc(selectedDoc)}
            title="Baixar"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Baixar</span>
          </button>
          <button
            type="button"
            className={toolbarBtn}
            disabled={!selectedDoc}
            onClick={() => selectedDoc && onToggleFavorite(selectedDoc.id)}
            title="Favoritar"
          >
            <Star className={`w-4 h-4 ${selectedDoc?.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
          <button
            type="button"
            className={toolbarBtn}
            disabled={!selectedItem || selectedItem.kind === 'dept'}
            onClick={() => openItemProperties(selectedItem)}
            title="Propriedades: informações e segurança"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden lg:inline">Propriedades</span>
          </button>
          <button
            type="button"
            className={toolbarBtn}
            disabled={multiSelected ? false : !selectedItem || selectedItem.kind === 'dept'}
            onClick={() => (multiSelected ? requestDeleteMany(selectedItems) : requestDelete(selectedItem))}
            title={multiSelected ? `Excluir ${selectedItems.length} itens (Delete)` : 'Excluir (Delete)'}
          >
            <Trash2 className="w-4 h-4" />
          </button>

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
                  ['date', 'Data de modificação'],
                  ['type', 'Tipo'],
                  ['size', 'Tamanho'],
                ] as [SortKey, string][]).map(([k, label]) => (
                  <MenuItem key={k} label={label} checked={sortKey === k} onClick={() => setSort(k)} />
                ))}
                <div className="border-t border-slate-100 my-1" />
                <MenuItem
                  label={sortAsc ? 'Crescente (A→Z)' : 'Decrescente (Z→A)'}
                  icon={<ArrowUpDown className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setSortAscState(!sortAsc);
                    writePref('ds.explorer.sortAsc', !sortAsc);
                  }}
                />
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

          <div className="flex-1" />
          <button
            type="button"
            onClick={toggleDetailsPane}
            className={`${toolbarBtn} hidden md:inline-flex ${showDetailsPane ? 'bg-slate-100' : ''}`}
            title="Painel de detalhes"
          >
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
          <button type="button" onClick={goUp} disabled={!location.deptId} className={toolbarBtn} title="Acima (Alt+↑)">
            <ArrowUp className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 h-9 px-2 border border-slate-200 rounded-md flex items-center gap-0.5 text-[13px] text-slate-700 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={() => (flatView ? onGoHome?.() : location.deptId && navigate({ deptId: null, folderId: null }))}
              className="px-1.5 py-1 rounded hover:bg-slate-100 inline-flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5 text-blue-600" /> Início
            </button>
            {flatView && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="px-1.5 py-1 font-medium text-slate-900">{flatView.title}</span>
              </>
            )}
            {!flatView && currentDept && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button type="button" onClick={() => navigate({ deptId: currentDept.id, folderId: null })} className="px-1.5 py-1 rounded hover:bg-slate-100">
                  {currentDept.name}
                </button>
              </>
            )}
            {!flatView && folderPath.map((f) => (
              <React.Fragment key={f.id}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button type="button" onClick={() => navigate({ deptId: f.departmentId, folderId: f.id })} className="px-1.5 py-1 rounded hover:bg-slate-100">
                  {f.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="hidden sm:flex h-9 w-56 lg:w-72 border border-slate-200 rounded-md items-center px-2 gap-1.5">
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={`Pesquisar em ${locationName}`}
              className="flex-1 min-w-0 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {accessRevokedNotice && (
          <div className="mx-3 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="flex-1">{accessRevokedNotice}</span>
            <button type="button" onClick={() => setAccessRevokedNotice(null)} className="font-semibold">
              OK
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* CONTEÚDO */}
          <div
            ref={contentRef}
            className={`relative flex-1 min-w-0 overflow-auto ${isMobile ? (mobileView === 'grid' ? 'p-2 pb-24' : 'pb-24') : 'p-2 sm:p-3'}`}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              setSelected(null);
            }}
            onMouseDown={startMarquee}
            onDragEnter={(e) => {
              if (!hasExternalFiles(e.dataTransfer) || !canBulk) return;
              e.preventDefault();
              dragDepth.current += 1;
              setExternalDrag(true);
            }}
            onDragOver={(e) => {
              if (!hasExternalFiles(e.dataTransfer) || !canBulk) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = canCreateHere ? 'copy' : 'none';
            }}
            onDragLeave={(e) => {
              if (!hasExternalFiles(e.dataTransfer)) return;
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setExternalDrag(false);
            }}
            onDrop={(e) => {
              if (!hasExternalFiles(e.dataTransfer)) return;
              handleExternalDrop(e, canCreateHere && location.deptId ? { deptId: location.deptId, folderId: location.folderId } : null);
            }}
            onContextMenu={(e) => location.deptId && handleContextMenu(e, null)}
          >
            {/* Quadrado de seleção (clique e arraste no espaço vazio) */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-500/15 rounded-[2px]"
                style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
              />
            )}
            {/* Arrastando arquivos/pastas do computador */}
            {externalDrag && (
              <div className="pointer-events-none absolute inset-2 z-30 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/85 backdrop-blur-[1px] flex flex-col items-center justify-center text-center gap-2 p-6">
                <Upload className="w-10 h-10 text-blue-600" />
                {canCreateHere ? (
                  <>
                    <div className="text-[15px] font-semibold text-slate-900">Solte para enviar para {locationName}</div>
                    <div className="text-[12.5px] text-slate-600">Arquivos e pastas inteiras (com subpastas). Ou solte em cima de uma pasta para enviar para dentro dela.</div>
                  </>
                ) : (
                  <>
                    <div className="text-[15px] font-semibold text-slate-900">Solte sobre um setor ou abra uma pasta</div>
                    <div className="text-[12.5px] text-slate-600">Os arquivos precisam ir para um setor ou pasta.</div>
                  </>
                )}
              </div>
            )}
            {items.length === 0 ? (
              <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-slate-400 text-sm gap-2">
                {query ? (
                  <span>Nenhum item corresponde à pesquisa.</span>
                ) : flatView ? (
                  <span>Nenhum documento em {flatView.title}.</span>
                ) : !location.deptId ? (
                  <span>Nenhum setor cadastrado. Cadastre os setores na tela “Setores”.</span>
                ) : (
                  <>
                    <FolderGlyph size={64} dimmed />
                    <span>Esta pasta está vazia.</span>
                    <span className="text-xs px-6">
                      {isMobile
                        ? 'Toque no botão + para criar uma pasta ou enviar um arquivo.'
                        : 'Use “Novo” ou clique com o botão direito para criar uma pasta ou enviar um arquivo.'}
                    </span>
                  </>
                )}
              </div>
            ) : isMobile && mobileView === 'list' ? (
              <ul className="divide-y divide-slate-100">
                {items.map((it) => {
                  const locked = it.kind === 'dept' && !hasDeptAccess(it.dept);
                  return (
                    <li
                      key={`${it.kind}-${it.id}`}
                      role="button"
                      {...touchHandlers(it)}
                      className="flex items-center gap-3 pl-4 pr-1 min-h-[64px] active:bg-slate-100 [-webkit-touch-callout:none]"
                    >
                      <span className="w-10 flex items-center justify-center shrink-0">{renderIcon(it, 40)}</span>
                      <span className="flex-1 min-w-0 py-2">
                        <span className={`block text-[15px] leading-snug truncate ${locked ? 'text-slate-400' : 'text-slate-900'}`}>{it.name}</span>
                        <span className="block text-[12.5px] text-slate-500 truncate mt-0.5">{mobileMeta(it)}</span>
                      </span>
                      {it.kind === 'dept' ? (
                        locked ? (
                          <Lock className="w-4 h-4 text-slate-300 mr-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-300 mr-2 shrink-0" />
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openActions(it);
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          className={mBtn + ' text-slate-500'}
                          aria-label={`Ações de ${it.name}`}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : isMobile ? (
              <div className="grid grid-cols-3 gap-1">
                {items.map((it) => {
                  const locked = it.kind === 'dept' && !hasDeptAccess(it.dept);
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      role="button"
                      {...touchHandlers(it)}
                      className="flex flex-col items-center gap-1.5 px-1 py-3 rounded-xl active:bg-slate-100 [-webkit-touch-callout:none]"
                    >
                      <div className="h-14 flex items-end justify-center">{renderIcon(it, 56)}</div>
                      <span className={`text-[12.5px] leading-tight text-center break-words w-full line-clamp-2 ${locked ? 'text-slate-400' : 'text-slate-800'}`}>
                        {it.name}
                      </span>
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
                      ['date', 'Data de modificação', 'hidden sm:table-cell'],
                      ['type', 'Tipo', 'hidden md:table-cell'],
                      ['size', 'Tamanho', 'text-right'],
                    ] as [SortKey, string, string][]).map(([k, label, cls]) => (
                      <th key={k} className={`py-1.5 px-2 font-normal ${cls}`}>
                        <button type="button" onClick={(e) => (e.stopPropagation(), setSort(k))} className="hover:text-slate-900 inline-flex items-center gap-1">
                          {label}
                          {sortKey === k && <span className="text-[10px]">{sortAsc ? '▲' : '▼'}</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const isSel = selKeys.has(keyOf(it));
                    const locked = it.kind === 'dept' && !hasDeptAccess(it.dept);
                    return (
                      <tr
                        key={`${it.kind}-${it.id}`}
                        draggable={it.kind !== 'dept'}
                        onDragStart={(e) => onDragStart(e, it)}
                        onDragOver={(e) => (it.kind === 'folder' || (it.kind === 'dept' && hasExternalFiles(e.dataTransfer))) && (e.preventDefault(), e.stopPropagation(), setDragOverId(it.id))}
                        onDragLeave={() => setDragOverId(null)}
                        onDrop={(e) =>
                          it.kind === 'folder'
                            ? onDropOnFolder(e, it.folder)
                            : it.kind === 'dept' && hasExternalFiles(e.dataTransfer)
                            ? handleExternalDrop(e, hasDeptAccess(it.dept) ? { deptId: it.dept.id, folderId: null } : null)
                            : undefined
                        }
                        data-sel-key={keyOf(it)}
                        onClick={(e) => onItemClick(e, it)}
                        onDoubleClick={() => activate(it)}
                        onContextMenu={(e) => handleContextMenu(e, it)}
                        className={`cursor-default ${isSel ? 'bg-blue-100' : 'hover:bg-blue-50'} ${
                          dragOverId === it.id ? 'outline outline-2 outline-blue-400' : ''
                        } ${locked ? 'text-slate-400' : 'text-slate-800'}`}
                      >
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{renderIcon(it, 20)}</span>
                            <span className="truncate">{it.name}</span>
                          </div>
                        </td>
                        <td className="py-1 px-2 text-slate-500 hidden sm:table-cell whitespace-nowrap">{itemDate(it)}</td>
                        <td className="py-1 px-2 text-slate-500 hidden md:table-cell whitespace-nowrap">{itemType(it)}</td>
                        <td className="py-1 px-2 text-slate-500 text-right whitespace-nowrap tabular-nums">{formatBytes(itemSize(it))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${viewMode === 'large' ? 128 : 96}px, 1fr))` }}
              >
                {items.map((it) => {
                  const isSel = selKeys.has(keyOf(it));
                  const locked = it.kind === 'dept' && !hasDeptAccess(it.dept);
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      role="button"
                      tabIndex={0}
                      draggable={it.kind !== 'dept'}
                      onDragStart={(e) => onDragStart(e, it)}
                      onDragOver={(e) => (it.kind === 'folder' || (it.kind === 'dept' && hasExternalFiles(e.dataTransfer))) && (e.preventDefault(), e.stopPropagation(), setDragOverId(it.id))}
                      onDragLeave={() => setDragOverId(null)}
                      onDrop={(e) =>
                          it.kind === 'folder'
                            ? onDropOnFolder(e, it.folder)
                            : it.kind === 'dept' && hasExternalFiles(e.dataTransfer)
                            ? handleExternalDrop(e, hasDeptAccess(it.dept) ? { deptId: it.dept.id, folderId: null } : null)
                            : undefined
                        }
                      data-sel-key={keyOf(it)}
                      onClick={(e) => onItemClick(e, it)}
                      onDoubleClick={() => activate(it)}
                      onContextMenu={(e) => handleContextMenu(e, it)}
                      title={`${it.name}\n${itemType(it)} • ${formatBytes(itemSize(it))}${locked ? '\nSem permissão de acesso' : ''}`}
                      className={`group flex flex-col items-center gap-1.5 p-2 rounded-md border cursor-default outline-none ${
                        isSel ? 'bg-blue-100 border-blue-300' : 'border-transparent hover:bg-blue-50 hover:border-blue-100'
                      } ${dragOverId === it.id ? 'border-blue-400 bg-blue-50' : ''}`}
                    >
                      <div className="flex items-end justify-center" style={{ height: iconSize }}>
                        {renderIcon(it, iconSize)}
                      </div>
                      <span
                        className={`text-[12.5px] leading-tight text-center break-words w-full ${
                          isSel ? '' : 'line-clamp-3'
                        } ${locked ? 'text-slate-400' : 'text-slate-800'}`}
                      >
                        {it.name}
                      </span>
                      {it.kind === 'dept' && (
                        <span className="text-[11px] text-slate-400">{formatBytes(it.dept.storageUsedBytes || 0)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PAINEL DE DETALHES (direita) */}
          {showDetailsPane && (
            <aside className="hidden md:block w-64 shrink-0 border-l border-slate-200 p-4 overflow-y-auto text-[13px]">
              {selectedItem ? (
                <div className="space-y-3">
                  <div className="flex justify-center py-2">{renderIcon(selectedItem, 88)}</div>
                  <div className="font-semibold text-slate-900 break-words text-center">{selectedItem.name}</div>
                  <dl className="space-y-2 text-xs">
                    {[
                      ['Tipo', itemType(selectedItem)],
                      ['Tamanho', formatBytes(itemSize(selectedItem))],
                      selectedItem.kind === 'folder' ? ['Itens', String(folderCount.get(selectedItem.id) || 0)] : null,
                      selectedItem.kind === 'doc' ? ['Enviado por', selectedItem.doc.ownerName] : null,
                      selectedItem.kind === 'doc' ? ['Criado em', formatDate(selectedItem.doc.createdAt)] : null,
                      selectedItem.kind !== 'dept' ? ['Modificado em', itemDate(selectedItem)] : null,
                      selectedItem.kind === 'dept'
                        ? ['Uso / Limite', `${formatBytes(selectedItem.dept.storageUsedBytes || 0)} de ${formatBytes(selectedItem.dept.storageLimitBytes || 0)}`]
                        : null,
                      selectedItem.kind === 'dept' ? ['Gestor', selectedItem.dept.managerName || '-'] : null,
                      selectedItem.kind === 'dept' ? ['Acesso', hasDeptAccess(selectedItem.dept) ? 'Liberado' : 'Sem permissão'] : null,
                    ]
                      .filter(Boolean)
                      .map((row) => (
                        <div key={(row as string[])[0]}>
                          <dt className="text-slate-400">{(row as string[])[0]}</dt>
                          <dd className="text-slate-800 break-words">{(row as string[])[1]}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ) : (
                <div className="space-y-3 text-center text-slate-500">
                  <div className="flex justify-center py-2">
                    {currentDept ? <FolderGlyph size={88} /> : <Home className="w-16 h-16 text-blue-200" />}
                  </div>
                  <div className="font-semibold text-slate-800">{locationName}</div>
                  <div className="text-xs">{items.length} {items.length === 1 ? 'item' : 'itens'}</div>
                  {currentFolder && <div className="text-xs">{formatBytes(folderSize.get(currentFolder.id) || 0)}</div>}
                  {!currentFolder && currentDept && (
                    <div className="text-xs">
                      {formatBytes(currentDept.storageUsedBytes || 0)} de {formatBytes(currentDept.storageLimitBytes || 0)}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 pt-2">Selecione um item para ver os detalhes.</div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* BARRA DE STATUS */}
        <div className="hidden md:flex items-center gap-4 px-3 py-1.5 border-t border-slate-200 text-xs text-slate-600">
          <span>
            {items.length} {items.length === 1 ? 'item' : 'itens'}
          </span>
          {pendingDocs.length > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700" title="Arquivos guardados neste navegador aguardando a conexão com o servidor">
              <RefreshCw className="w-3 h-3 animate-spin [animation-duration:1.6s]" />
              {pendingDocs.length} aguardando envio
            </span>
          )}
          {multiSelected && (
            <span className="truncate font-medium text-blue-700">
              {selectedItems.length} itens selecionados •{' '}
              {formatBytes(selectedItems.reduce((sum, i) => sum + (i.kind === 'dept' ? 0 : itemSize(i)), 0))}
            </span>
          )}
          {selectedItem && (
            <span className="truncate">
              1 item selecionado {selectedItem.kind !== 'dept' || hasDeptAccess(selectedItem.dept) ? formatBytes(itemSize(selectedItem)) : ''}
            </span>
          )}
          {currentDept && !selectedItem && (
            <span className="hidden sm:inline">
              {currentFolder
                ? `Tamanho da pasta: ${formatBytes(folderSize.get(currentFolder.id) || 0)}`
                : `Setor: ${formatBytes(currentDept.storageUsedBytes || 0)} de ${formatBytes(currentDept.storageLimitBytes || 0)}`}
            </span>
          )}
          <div className="flex-1" />
          <button type="button" onClick={() => setViewMode('details')} className={`p-1 rounded ${viewMode === 'details' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Detalhes">
            <ListIcon className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setViewMode('large')} className={`p-1 rounded ${viewMode !== 'details' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} title="Ícones grandes">
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MENU DE CONTEXTO (botão direito) */}
      {contextMenu && !isMobile && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 bg-white rounded-lg border border-slate-200 shadow-xl py-1"
        >
          {contextMenuContent()}
        </div>
      )}

      {/* CELULAR: ações em "folha" que sobe da parte de baixo da tela */}
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
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-slate-900 truncate">{contextMenu.item.name}</div>
                  <div className="text-[12.5px] text-slate-500 truncate">{itemType(contextMenu.item)} • {formatBytes(itemSize(contextMenu.item))}</div>
                </div>
              </div>
            ) : mobileSheet === 'new' ? (
              <div className="px-5 pb-2 pt-1 text-[13px] font-semibold text-slate-500">Criar em {locationName}</div>
            ) : mobileSheet === 'options' ? (
              <div className="px-5 pb-2 pt-1 text-[13px] font-semibold text-slate-500">Ordenar por</div>
            ) : null
          }
        >
          {contextMenu ? (
            contextMenuContent()
          ) : mobileSheet === 'new' ? (
            <>
              <MenuItem
                icon={<FolderPlus className="w-5 h-5 text-amber-500" />}
                label="Nova pasta"
                onClick={() => onOpenCreateFolderModal(location.deptId || undefined, location.folderId)}
              />
              <MenuItem
                icon={<Upload className="w-5 h-5 text-blue-600" />}
                label="Enviar arquivo"
                onClick={() => onOpenUploadModal(location.deptId || undefined, location.folderId || undefined)}
              />
              {canBulk && (
                <MenuItem icon={<Files className="w-5 h-5 text-blue-600" />} label="Enviar vários arquivos" onClick={() => filesInputRef.current?.click()} />
              )}
              {currentFolder && (
                <MenuItem icon={<SlidersHorizontal className="w-5 h-5" />} label="Propriedades desta pasta" onClick={() => openProperties(currentFolder)} />
              )}
            </>
          ) : (
            <>
              {([
                ['name', 'Nome'],
                ['date', 'Data de modificação'],
                ['type', 'Tipo'],
                ['size', 'Tamanho'],
              ] as [SortKey, string][]).map(([k, label]) => (
                <MenuItem key={k} label={label} checked={sortKey === k} onClick={() => setSort(k)} />
              ))}
              <MenuItem
                label={sortAsc ? 'Ordem crescente (A→Z)' : 'Ordem decrescente (Z→A)'}
                icon={<ArrowUpDown className="w-4 h-4" />}
                onClick={() => {
                  setSortAscState(!sortAsc);
                  writePref('ds.explorer.sortAsc', !sortAsc);
                }}
              />
              <div className="px-5 pt-3 pb-2 text-[13px] font-semibold text-slate-500 border-t border-slate-100 mt-1">Exibir como</div>
              <MenuItem icon={<ListIcon className="w-5 h-5" />} label="Lista" checked={mobileView === 'list'} onClick={() => setMobileView('list')} />
              <MenuItem icon={<LayoutGrid className="w-5 h-5" />} label="Ícones" checked={mobileView === 'grid'} onClick={() => setMobileView('grid')} />
            </>
          )}
        </BottomSheet>
      )}

      {/* CELULAR: botão flutuante "+" (nova pasta / enviar arquivo) */}
      {isMobile && canCreateHere && !contextMenu && !mobileSheet && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheet('new');
          }}
          className="md:hidden absolute right-4 bottom-4 z-20 h-14 w-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30 active:scale-95 transition-transform flex items-center justify-center"
          aria-label="Criar pasta ou enviar arquivo"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* CONFIRMAÇÃO: excluir pasta */}
      {deleteConfirmFolder && (
        <div data-modal-open="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-center">
              <FolderGlyph size={56} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Excluir a pasta “{deleteConfirmFolder.name}”?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {(() => {
                  const c = folderContents(deleteConfirmFolder.id);
                  return c.files || c.subfolders ? (
                    <>
                      A pasta tem <strong>{c.files} arquivo(s)</strong>
                      {c.subfolders ? (
                        <>
                          {' '}e <strong>{c.subfolders} subpasta(s)</strong>
                        </>
                      ) : null}
                      . Os arquivos vão para a <strong>lixeira do setor por 7 dias</strong> e podem ser restaurados — ao restaurar, as pastas
                      são recriadas.
                    </>
                  ) : (
                    'A pasta está vazia.'
                  );
                })()}
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirmFolder(null)} className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteFolder?.(deleteConfirmFolder.id);
                  setDeleteConfirmFolder(null);
                  setSelected(null);
                }}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO: excluir documento → lixeira do setor */}
      {deleteConfirmDoc && (
        <div data-modal-open="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-center">
              <FileGlyph ext={deleteConfirmDoc.extension} size={56} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Enviar para a lixeira?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong className="break-all">{deleteConfirmDoc.name}</strong> irá para a lixeira do setor{' '}
                <strong>{deleteConfirmDoc.departmentName}</strong>. Pode ser restaurado por <strong>7 dias</strong>; depois
                será apagado do servidor definitivamente.
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirmDoc(null)} className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDocument(deleteConfirmDoc.id);
                  setDeleteConfirmDoc(null);
                  setSelected(null);
                }}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
              >
                Enviar para a lixeira
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO: excluir vários itens selecionados */}
      {deleteMany && (
        <div data-modal-open="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-7 h-7" />
              </div>
            </div>
            {(() => {
              const docsSel = deleteMany.filter((i) => i.kind === 'doc');
              const foldersSel = deleteMany.filter((i) => i.kind === 'folder') as Array<Extract<Item, { kind: 'folder' }>>;
              const inner = foldersSel.reduce((acc, f) => acc + folderContents(f.id).files, 0);
              const skipped = selectedItems.filter((i) => i.kind !== 'dept').length - deleteMany.length;
              return (
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Excluir {deleteMany.length} itens?</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {docsSel.length > 0 && <>{docsSel.length} arquivo(s)</>}
                    {docsSel.length > 0 && foldersSel.length > 0 && ' e '}
                    {foldersSel.length > 0 && (
                      <>
                        {foldersSel.length} pasta(s){inner ? ` com ${inner} arquivo(s) dentro` : ''}
                      </>
                    )}
                    . Os arquivos vão para a <strong>lixeira do setor por 7 dias</strong> e podem ser restaurados.
                  </p>
                  {skipped > 0 && <p className="text-[11px] text-amber-700">{skipped} item(ns) sem permissão de exclusão ficarão de fora.</p>}
                </div>
              );
            })()}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteMany(null)} className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const list = deleteMany;
                  setDeleteMany(null);
                  setSelected(null);
                  const docIds = list.filter((i) => i.kind === 'doc').map((i) => i.id);
                  const folderIds = list.filter((i) => i.kind === 'folder').map((i) => i.id);
                  if (onDeleteMany) await onDeleteMany(docIds, folderIds);
                  else {
                    docIds.forEach((id) => onDeleteDocument(id));
                    folderIds.forEach((id) => onDeleteFolder?.(id));
                  }
                }}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
              >
                Excluir {deleteMany.length} itens
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seletores do sistema: vários arquivos ou uma pasta inteira */}
      <input
        ref={filesInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = collectFromInput(e.target.files);
          e.target.value = '';
          if (location.deptId) beginPick(picked, { deptId: location.deptId, folderId: location.folderId });
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={(e) => {
          const picked = collectFromInput(e.target.files);
          e.target.value = '';
          if (location.deptId) beginPick(picked, { deptId: location.deptId, folderId: location.folderId });
        }}
      />

      {/* Envio em lote: confirmação (destino + segurança) e progresso */}
      {pick && (
        <BulkUploadConfirm
          files={pick.files}
          folders={pick.folders}
          destination={pick.label}
          online={isOnline}
          onCancel={() => setPick(null)}
          onConfirm={runBulk}
        />
      )}
      {bulk && <BulkUploadPanel items={bulk.items} foldersCreated={bulk.foldersCreated} running={bulk.running} onClose={() => setBulk(null)} />}

      {/* Propriedades: Geral + Segurança (arquivo ou pasta) */}
      {propsTarget &&
        (() => {
          const doc = propsTarget.kind === 'doc' ? allDocuments.find((d) => d.id === propsTarget.id) : null;
          const fol = propsTarget.kind === 'folder' ? folders.find((f) => f.id === propsTarget.id) : null;
          if (!doc && !fol) return null;
          const item: Item = doc ? { kind: 'doc', id: doc.id, name: doc.name, doc } : { kind: 'folder', id: fol!.id, name: fol!.name, folder: fol! };
          return (
            <PropertiesModal
              key={`${propsTarget.kind}-${propsTarget.id}`}
              target={doc ? { kind: 'doc', doc } : { kind: 'folder', folder: fol! }}
              icon={renderIcon(item, 44)}
              currentUser={currentUser}
              departments={departments}
              folders={folders}
              folderSize={fol ? folderSize.get(fol.id) || 0 : 0}
              folderItemCount={fol ? folderCount.get(fol.id) || 0 : 0}
              typeLabel={itemType(item)}
              formatBytes={formatBytes}
              isManager={isManagerOf(doc ? doc.departmentId : fol!.departmentId)}
              onClose={() => setPropsTarget(null)}
              onSaveDocSecurity={onUpdateDocumentSecurity}
              onUpdateFolder={onUpdateFolder}
              onOpenFolderPermissions={(f) => {
                setPropsTarget(null);
                setConfigFolder(f);
              }}
            />
          );
        })()}

      {/* Propriedades e permissões da pasta (gestor / administração) */}
      <FolderConfigModal
        isOpen={!!configFolder}
        onClose={() => setConfigFolder(null)}
        folder={configFolder}
        department={departments.find((d) => d.id === configFolder?.departmentId)}
        collaborators={users.filter((u) => u.departmentId === configFolder?.departmentId && u.role === 'EMPLOYEE')}
        currentUser={currentUser}
        onSavePermissions={onUpdateUserPermissions}
        onUpdateFolder={onUpdateFolder}
      />
    </div>
  );
};
