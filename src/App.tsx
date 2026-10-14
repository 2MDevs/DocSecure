import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  INITIAL_DEPARTMENTS,
  INITIAL_FOLDERS,
  INITIAL_DOCUMENTS,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_DEVICES,
  INITIAL_API_KEYS,
  INITIAL_WEBHOOKS,
  INITIAL_NOTIFICATIONS,
} from './services/dataStore';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  User,
  UserRole,
  Department,
  Folder,
  DocumentItem,
  Device,
  AuditLog,
  ApiKey,
  WebhookConfig,
  SystemNotification,
  PermissionType,
} from './types';
import { createAuditEntry, verifyPermission } from './services/securityEngine';
import { apiClient, dispatchSessionExpired, SESSION_LOCKED_EVENT } from './services/apiClient';
import type { UpdateNotice } from './services/apiClient';
import { UPDATE_CHECK_EVENT } from './components/settings/SystemUpdatePanel';
import { isNewVersionAvailable } from './services/appVersion';
import { UpdateNoticeDialog } from './components/common/UpdateNoticeDialog';

// Components
import { LoginView } from './components/auth/LoginView';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { TrashView } from './components/documents/TrashView';
import { WindowDialog } from './components/common/WindowDialog';
import { UserCog, Building2, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { ExplorerLocation } from './components/layout/NavPane';
import { NotFoundPage } from './pages/NotFoundPage';
import { DeviceApprovalModal } from './components/auth/DeviceApprovalModal';
import { AccessDeniedModal } from './components/common/AccessDeniedModal';
import { AppShell } from './components/layout/AppShell';
import { NavigationTab } from './components/layout/Sidebar';
import { DesktopHeader } from './components/layout/DesktopHeader';
import { DeveloperDashboard } from './components/dashboard/DeveloperDashboard';
import { DocumentsExplorer } from './components/documents/DocumentsExplorer';
import { DocumentViewerModal } from './components/documents/DocumentViewerModal';
import { UploadDocumentModal } from './components/documents/UploadDocumentModal';
import { CreateFolderModal } from './components/documents/CreateFolderModal';
import { UsersManagement } from './components/users/UsersManagement';
import { PermissionsMatrix } from './components/permissions/PermissionsMatrix';
import { SectorsManagement } from './components/sectors/SectorsManagement';
import { DevicesManagement } from './components/devices/DevicesManagement';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { SystemView } from './components/system/SystemView';
import { AccountSecurity } from './components/settings/AccountSecurity';
import { LockScreen } from './components/auth/LockScreen';
import { startConnectivityMonitor, useConnectionStatus, canWrite } from './services/connectivity';
import { enqueueUpload, listPendingUploads, loadPendingFile, removePendingUpload, PendingUpload } from './services/offlineQueue';
import { IntegrationsView } from './components/settings/IntegrationsView';
import { MobileAppFrame } from './components/mobile/MobileAppFrame';
import { Database, RefreshCw, AlertCircle } from 'lucide-react';

const VERSION_CHECK_EVENT = 'docsecure:version-check';

export const ROLE_ALLOWED_ROUTES: Record<string, UserRole[]> = {
  '/painel': ['DEVELOPER'],
  '/documentos': ['DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'],
  '/documentos/favoritos': ['DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'],
  '/documentos/compartilhados': ['DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'],
  '/documentos/lixeira': ['DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'],
  '/usuarios': ['DEVELOPER', 'DIRECTOR', 'MANAGER'],
  '/setores': ['DEVELOPER', 'DIRECTOR'],
  '/permissoes': ['DEVELOPER', 'MANAGER'],
  '/dispositivos': ['DEVELOPER'],
  '/armazenamento': ['DEVELOPER', 'DIRECTOR'],
  '/auditoria': ['DEVELOPER', 'DIRECTOR'],
  '/sistema': ['DEVELOPER', 'DIRECTOR'],
  '/seguranca': ['DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'],
  '/integracao': ['DEVELOPER'],
};

export const TAB_TO_PATH: Record<NavigationTab, string> = {
  dev_dashboard: '/painel',
  my_documents: '/documentos',
  favorites: '/documentos/favoritos',
  shared: '/documentos/compartilhados',
  trash: '/documentos/lixeira',
  users: '/usuarios',
  sectors: '/setores',
  permissions: '/permissoes',
  devices: '/dispositivos',
  storage: '/armazenamento',
  audit_logs: '/auditoria',
  system: '/sistema',
  settings: '/seguranca',
  integrations: '/integracao',
};

export const TAB_TO_TITLE: Record<NavigationTab, string> = {
  dev_dashboard: 'Painel do Desenvolvedor',
  my_documents: 'Meus Documentos',
  favorites: 'Documentos Favoritos',
  shared: 'Documentos Compartilhados',
  trash: 'Lixeira',
  users: 'Gestão de Usuários',
  sectors: 'Setores & Armazenamento',
  permissions: 'Matriz de Permissões',
  devices: 'Dispositivos Autorizados',
  storage: 'Armazenamento & Quota',
  audit_logs: 'Auditoria Corporativa',
  system: 'Status do Sistema',
  settings: 'Segurança & Configurações',
  integrations: 'Integração & SMTP',
};

export function getTabFromPath(pathname: string): NavigationTab {
  switch (pathname) {
    case '/painel':
      return 'dev_dashboard';
    case '/documentos':
      return 'my_documents';
    case '/documentos/favoritos':
      return 'favorites';
    case '/documentos/compartilhados':
      return 'shared';
    case '/documentos/lixeira':
      return 'trash';
    case '/usuarios':
      return 'users';
    case '/setores':
      return 'sectors';
    case '/permissoes':
      return 'permissions';
    case '/dispositivos':
      return 'devices';
    case '/armazenamento': // tela unificada com Setores
      return 'sectors';
    case '/auditoria':
      return 'audit_logs';
    case '/sistema':
      return 'system';
    case '/seguranca':
      return 'settings';
    case '/integracao':
      return 'integrations';
    default:
      return 'my_documents';
  }
}

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);
  const [pendingDeviceUser, setPendingDeviceUser] = useState<User | null>(null);

  // Core Data Stores (Hydrated from PostgreSQL / API)
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [folders, setFolders] = useState<Folder[]>(INITIAL_FOLDERS);
  const [documents, setDocuments] = useState<DocumentItem[]>(INITIAL_DOCUMENTS);
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(INITIAL_API_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(INITIAL_WEBHOOKS);
  // Aviso de nova atualização (para todos os usuários, no sininho)
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [seenUpdate, setSeenUpdate] = useState<string>(() => {
    try {
      return localStorage.getItem('ds.update.seen') || '';
    } catch {
      return '';
    }
  });
  const notifications = useMemo<SystemNotification[]>(() => {
    const list = [...INITIAL_NOTIFICATIONS];
    if (updateNotice?.updateAvailable && updateNotice.commit) {
      const changes = updateNotice.changes || [];
      const first = changes[0]?.title || 'Melhorias e correções';
      list.unshift({
        id: `update-${updateNotice.commit}`,
        title: 'Nova atualização disponível',
        message: changes.length > 1 ? `${first} e mais ${changes.length - 1} melhoria(s). Toque para ver os detalhes.` : `${first}. Toque para ver os detalhes.`,
        type: 'info',
        createdAt: updateNotice.date
          ? new Date(updateNotice.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          : '',
        read: seenUpdate === updateNotice.commit,
      });
    }
    return list;
  }, [updateNotice, seenUpdate]);

  const openUpdateNotice = () => {
    setIsUpdateDialogOpen(true);
    if (updateNotice?.commit) {
      setSeenUpdate(updateNotice.commit);
      try {
        localStorage.setItem('ds.update.seen', updateNotice.commit);
      } catch {}
    }
  };

  // Database Connection & System Health State
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    databaseName: string;
    host: string;
    port: number;
    tablesCount: number;
    recordsCount: number;
    latencyMs: number;
    mode: string;
    error?: string;
  }>({
    connected: true,
    databaseName: 'docsecure_db',
    host: 'localhost',
    port: 5432,
    tablesCount: 8,
    recordsCount: 142,
    latencyMs: 1.2,
    mode: 'POSTGRESQL_REAL',
  });

  const [isLoadingInitialData, setIsLoadingInitialData] = useState<boolean>(true);
  const [apiSyncError, setApiSyncError] = useState<string | null>(null);
  const [initialSetupMode, setInitialSetupMode] = useState<boolean>(false);

  // Active View & Navigation via React Router
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const activeTab: NavigationTab = getTabFromPath(location.pathname);
  const [isMobileSimulator, setIsMobileSimulator] = useState<boolean>(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('');

  // Modals
  const [viewingDocument, setViewingDocument] = useState<DocumentItem | null>(null);
  // Usuários, Setores e Permissões abrem como janelas (caixa de diálogo) sobre a tela atual
  const [adminWindow, setAdminWindow] = useState<'users' | 'sectors' | 'permissions' | null>(null);

  // Menu lateral único ↔ explorador de arquivos
  const [explorerLocation, setExplorerLocation] = useState<ExplorerLocation>({ deptId: null, folderId: null });
  const [explorerNav, setExplorerNav] = useState<ExplorerLocation & { nonce: number }>({ deptId: null, folderId: null, nonce: 0 });
  // Incrementado a cada recarga de dados (usado por telas que buscam dados próprios, como a Lixeira)
  const [dataVersion, setDataVersion] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadDeptId, setUploadDeptId] = useState<string | undefined>();
  const [uploadFolderId, setUploadFolderId] = useState<string | undefined>();
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [createFolderDeptId, setCreateFolderDeptId] = useState<string | undefined>();
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  // 403 Forbidden Access Denied Modal State
  const [accessDeniedState, setAccessDeniedState] = useState<{
    isOpen: boolean;
    reason: string;
    resourceName: string;
  }>({
    isOpen: false,
    reason: '',
    resourceName: '',
  });

  // Navigate to Tab via URL
  const navigateToTab = useCallback(
    (tab: NavigationTab) => {
      const targetPath = TAB_TO_PATH[tab] || '/documentos';
      if (currentUser) {
        const allowedRoles = ROLE_ALLOWED_ROUTES[targetPath];
        if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
          logSecurityEvent(
            currentUser,
            'DOCUMENT_VIEWED',
            targetPath,
            'Acesso não autorizado pelo perfil de usuário.',
            'DENIED'
          );
          setAccessDeniedState({
            isOpen: true,
            reason: `Acesso negado: Seu perfil (${currentUser.role}) não possui permissão para acessar esta área.`,
            resourceName: targetPath,
          });
          return;
        }
      }
      if (tab === 'users' || tab === 'sectors' || tab === 'permissions') {
        setAdminWindow(tab);
        return;
      }
      navigate(targetPath);
    },
    [currentUser, navigate]
  );

  // Fetch initial data from PostgreSQL REST API on startup
  const loadBootstrapData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) setIsLoadingInitialData(true);
      const data = await apiClient.getBootstrapData();
      if (data) {
        if (data.currentUser) setCurrentUser(data.currentUser);
        if (Array.isArray(data.users)) setUsers(data.users);
        if (Array.isArray(data.departments)) setDepartments(data.departments);
        if (Array.isArray(data.folders)) setFolders(data.folders);
        if (Array.isArray(data.documents)) setDocuments(data.documents);
        if (Array.isArray(data.devices)) setDevices(data.devices);
        if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
        if (Array.isArray(data.apiKeys)) setApiKeys(data.apiKeys);
        if (Array.isArray(data.webhooks)) setWebhooks(data.webhooks);
        if (data.dbStatus) setDbStatus(data.dbStatus);
        if (data.initialSetupMode !== undefined) setInitialSetupMode(Boolean(data.initialSetupMode));
      }
      setApiSyncError(null);
      setDataVersion((v) => v + 1);
    } catch (err: any) {
      console.warn('[API Sync Notice] Inicializando dados locais resilientes com backend:', err.message);
    } finally {
      if (!silent) setIsLoadingInitialData(false);
    }
  }, []);

  // Verificar se o usuário já possui sessão ativa (cookie HttpOnly via /api/auth/me)
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const res = await apiClient.getMe();
        if (res && res.user) {
          setCurrentUser(res.user);
          if (res.sessionLocked) setIsLocked(true);
          await loadBootstrapData();
        }
      } catch {
        setCurrentUser(null);
        setIsLoadingInitialData(false);
      }
    };
    checkActiveSession();
  }, [loadBootstrapData]);

  // ---------------------------------------------------------------------------
  // CONEXÃO, FILA DE ENVIO OFFLINE E BLOQUEIO POR INATIVIDADE
  // ---------------------------------------------------------------------------
  const connectionStatus = useConnectionStatus();
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState<DocumentItem[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, 'uploading' | 'pending' | 'synced' | 'error'>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [securityPolicy, setSecurityPolicy] = useState<{ lockIdleMinutes: number; hasPin: boolean }>({ lockIdleMinutes: 0, hasPin: false });
  const processingQueueRef = useRef(false);

  useEffect(() => {
    startConnectivityMonitor();
  }, []);

  const setSync = (id: string, state?: 'uploading' | 'pending' | 'synced' | 'error') =>
    setSyncStates((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });

  // Check verde por alguns segundos depois de sincronizar
  const markSynced = (id: string) => {
    setSync(id, 'synced');
    setTimeout(() => setSyncStates((prev) => {
      if (prev[id] !== 'synced') return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    }), 4000);
  };

  const pendingToDoc = useCallback(
    (p: PendingUpload): DocumentItem => ({
      id: p.id,
      name: p.name,
      extension: (p.fileName.split('.').pop() || '').toLowerCase(),
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      folderId: p.folderId,
      departmentId: p.departmentId,
      departmentName: departments.find((d) => d.id === p.departmentId)?.name || '',
      ownerId: currentUser?.id || '',
      ownerName: currentUser?.name || '',
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      hashSha256: '',
      currentVersion: 1,
      versions: [],
      isFavorite: false,
      isArchived: false,
      isShared: false,
      status: 'active',
      scanStatus: 'scanning',
      tags: p.tags,
      hasContent: false,
    }),
    [departments, currentUser?.id, currentUser?.name]
  );

  const pendingDocs = useMemo(
    () => [...uploadingDocs, ...pendingUploads.map(pendingToDoc)],
    [uploadingDocs, pendingUploads, pendingToDoc]
  );

  // Ao entrar: carrega a fila deste usuário e a política de bloqueio
  useEffect(() => {
    if (!currentUser?.id) {
      setPendingUploads([]);
      return;
    }
    listPendingUploads(currentUser.id).then((list) => {
      setPendingUploads(list);
      setSyncStates((prev) => {
        const next = { ...prev };
        list.forEach((p) => (next[p.id] = 'pending'));
        return next;
      });
    });
    if (!currentUser.mustChangePassword) {
      apiClient
        .getSecurityPolicy()
        .then((p) => {
          setSecurityPolicy({ lockIdleMinutes: p.lockIdleMinutes, hasPin: p.hasPin });
          if (p.sessionLocked) setIsLocked(true);
        })
        .catch(() => {});
    }
  }, [currentUser?.id, currentUser?.mustChangePassword]);

  // Conexão voltou: envia os arquivos da fila, um por vez
  // Verifica se há nova versão no GitHub: ao entrar, a cada 2 minutos e ao voltar para a aba
  useEffect(() => {
    if (!currentUser?.id || isLocked || connectionStatus !== 'online') return;
    let cancelled = false;
    const check = () =>
      apiClient
        .getUpdateNotice()
        .then((n) => !cancelled && setUpdateNotice(n))
        .catch(() => {});
    check();
    const timer = window.setInterval(check, 2 * 60 * 1000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    // O servidor avisa em tempo real quando sai uma versão nova
    window.addEventListener(UPDATE_CHECK_EVENT, check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(UPDATE_CHECK_EVENT, check);
    };
  }, [currentUser?.id, isLocked, connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== 'online' || isLocked || !currentUser?.id || pendingUploads.length === 0) return;
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;
    (async () => {
      for (const p of [...pendingUploads]) {
        setSync(p.id, 'uploading');
        try {
          const file = await loadPendingFile(p.id);
          if (!file) {
            await removePendingUpload(p.id);
            setPendingUploads((prev) => prev.filter((x) => x.id !== p.id));
            setSync(p.id);
            continue;
          }
          const saved = await apiClient.uploadFile(file, {
            departmentId: p.departmentId,
            folderId: p.folderId,
            name: p.name,
            tags: p.tags,
            security: p.security,
          });
          await removePendingUpload(p.id);
          setPendingUploads((prev) => prev.filter((x) => x.id !== p.id));
          setSync(p.id);
          setDocuments((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
          markSynced(saved.id);
        } catch (err: any) {
          if (err?.isConnectionError) {
            setSync(p.id, 'pending');
            break; // caiu de novo: tenta quando voltar
          }
          // Recusado pelo servidor (permissão, tipo de arquivo, quota): não adianta tentar de novo
          await removePendingUpload(p.id);
          setPendingUploads((prev) => prev.filter((x) => x.id !== p.id));
          setSync(p.id);
          setAccessDeniedState({
            isOpen: true,
            reason: `O arquivo que estava na fila não pôde ser enviado: ${err?.message || 'erro desconhecido'}`,
            resourceName: p.name,
          });
        }
      }
      processingQueueRef.current = false;
    })();
  }, [connectionStatus, isLocked, currentUser?.id, pendingUploads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bloqueio: suspende a sessão no servidor e cobre a tela
  const lockNow = useCallback(() => {
    setIsLocked(true);
    setViewingDocument(null);
    try {
      localStorage.setItem('ds.lockedAt', String(Date.now()));
    } catch {}
    apiClient.lockSession().catch(() => {});
  }, []);

  const handleUnlocked = () => {
    setIsLocked(false);
    try {
      localStorage.setItem('ds.unlockedAt', String(Date.now()));
      localStorage.setItem('ds.lastActivity', String(Date.now()));
    } catch {}
    loadBootstrapData({ silent: true });
  };

  // Detecta inatividade (compartilhada entre abas do mesmo navegador)
  useEffect(() => {
    if (!currentUser?.id || currentUser.mustChangePassword || isLocked || securityPolicy.lockIdleMinutes <= 0) return;
    let last = Date.now();
    let lastWrite = 0;
    const touch = () => {
      last = Date.now();
      if (last - lastWrite > 5000) {
        lastWrite = last;
        try {
          localStorage.setItem('ds.lastActivity', String(last));
        } catch {}
      }
    };
    touch();
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const interval = setInterval(() => {
      let shared = 0;
      try {
        shared = Number(localStorage.getItem('ds.lastActivity') || 0);
      } catch {}
      if (Date.now() - Math.max(last, shared) > securityPolicy.lockIdleMinutes * 60_000) lockNow();
    }, 10_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(interval);
    };
  }, [currentUser?.id, currentUser?.mustChangePassword, isLocked, securityPolicy.lockIdleMinutes, lockNow]);

  // Sincroniza bloqueio/desbloqueio entre abas e reage ao servidor (423)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ds.lockedAt' && currentUser) {
        setIsLocked(true);
        setViewingDocument(null);
      }
      if (e.key === 'ds.unlockedAt') {
        setIsLocked(false);
        loadBootstrapData({ silent: true });
      }
    };
    const onLocked = () => {
      if (currentUser) {
        setIsLocked(true);
        setViewingDocument(null);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_LOCKED_EVENT, onLocked);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_LOCKED_EVENT, onLocked);
    };
  }, [currentUser, loadBootstrapData]);

  // NOVA VERSÃO INSTALADA NO SERVIDOR: o app instalado (PWA) e abas antigas se atualizam sozinhos.
  // Ao voltar para o app (reabrir o PWA / trocar de aba) recarrega na hora; com a tela em uso, mostra um aviso.
  const [newVersionReady, setNewVersionReady] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = uploadingDocs.length > 0;
  useEffect(() => {
    let checking = false;
    const check = async (resumed: boolean) => {
      if (checking) return;
      checking = true;
      try {
        if (await isNewVersionAvailable()) {
          if (resumed && !busyRef.current) window.location.reload();
          else setNewVersionReady(true);
        }
      } finally {
        checking = false;
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && check(true);
    const onPageShow = (e: PageTransitionEvent) => e.persisted && check(true);
    const onServerBack = () => check(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener(VERSION_CHECK_EVENT, onServerBack);
    const timer = window.setInterval(() => check(false), 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener(VERSION_CHECK_EVENT, onServerBack);
      window.clearInterval(timer);
    };
  }, []);

  // TEMPO REAL: o servidor avisa quando pastas, arquivos, permissões, usuários ou setores mudam.
  // A tela recarrega os dados (já filtrados pelo servidor) sem o usuário precisar atualizar a página.
  useEffect(() => {
    if (!currentUser?.id || currentUser.mustChangePassword || typeof EventSource === 'undefined') return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let readyCount = 0;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadBootstrapData({ silent: true }), 250);
    };

    const source = new EventSource('/api/events', { withCredentials: true });
    source.addEventListener('changed', scheduleRefresh);
    // Nova versão publicada no GitHub: sininho e painel de atualização se atualizam sozinhos
    source.addEventListener('update', () => window.dispatchEvent(new Event(UPDATE_CHECK_EVENT)));
    source.addEventListener('session', async () => {
      // Algo mudou na conta deste usuário (perfil, setor, bloqueio): revalida a sessão
      try {
        const res = await apiClient.getMe();
        if (!res?.user) throw new Error('sessão');
        scheduleRefresh();
      } catch {
        dispatchSessionExpired('Sua sessão foi encerrada por uma alteração de segurança. Entre novamente.');
      }
    });
    // Ao reconectar (queda de rede, servidor reiniciado), busca o que pode ter mudado no intervalo
    source.addEventListener('ready', () => {
      readyCount += 1;
      if (readyCount > 1) {
        scheduleRefresh();
        window.dispatchEvent(new Event(UPDATE_CHECK_EVENT)); // servidor reiniciado (ex.: após atualizar)
        window.setTimeout(() => window.dispatchEvent(new Event(VERSION_CHECK_EVENT)), 1500);
      }
    });

    // Rede de segurança: ao voltar para a aba, sincroniza também
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      source.close();
      document.removeEventListener('visibilitychange', onVisible);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [currentUser?.id, currentUser?.mustChangePassword, loadBootstrapData]);

  // Se o documento aberto deixou de estar acessível (pasta bloqueada, permissão retirada, excluído), fecha na hora
  useEffect(() => {
    if (!viewingDocument) return;
    const fresh = documents.find((d) => d.id === viewingDocument.id);
    if (!fresh) {
      setViewingDocument(null);
      setAccessDeniedState({
        isOpen: true,
        reason: 'Seu acesso a este documento foi removido ou ele foi excluído. A visualização foi encerrada.',
        resourceName: viewingDocument.name,
      });
    } else if (fresh !== viewingDocument && (fresh.name !== viewingDocument.name || fresh.folderId !== viewingDocument.folderId)) {
      setViewingDocument(fresh);
    }
  }, [documents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: Append immutable audit log & persist via HTTP
  const logSecurityEvent = async (
    user: User | null,
    action: any,
    resourceName: string,
    details: string,
    result: 'SUCCESS' | 'DENIED' | 'BLOCKED'
  ) => {
    const lastHash = auditLogs[0]?.hash;
    const entry = createAuditEntry(user, action, resourceName, details, result, lastHash);
    setAuditLogs((prev) => [entry, ...prev]);

    try {
      await apiClient.recordAuditLog(entry);
    } catch (e) {
      console.warn('[Audit Log API Persist Warning]', e);
    }
  };

  // Sessão expirada: limpa estados e retorna para tela de login com aviso
  const handleSessionExpired = useCallback(
    (customMsg?: string) => {
      setCurrentUser(null);
      setSessionExpiredNotice(
        customMsg || 'Sua sessão expirou por inatividade. Entre novamente para continuar.'
      );
      // Limpa dados em memória carregados da sessão anterior
      setUsers(INITIAL_USERS);
      setDepartments(INITIAL_DEPARTMENTS);
      setFolders(INITIAL_FOLDERS);
      setDocuments(INITIAL_DOCUMENTS);
      setDevices(INITIAL_DEVICES);
      setAuditLogs(INITIAL_AUDIT_LOGS);
      setApiKeys(INITIAL_API_KEYS);
      setWebhooks(INITIAL_WEBHOOKS);

      const redirectPath =
        location.pathname !== '/login' ? location.pathname + location.search : '';
      const target = redirectPath
        ? `/login?redirect=${encodeURIComponent(redirectPath)}`
        : '/login';
      navigate(target);
    },
    [location.pathname, location.search, navigate]
  );

  // Interceptador global do evento de sessão expirada disparado pelo apiClient
  useEffect(() => {
    const onSessionExpired = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const msg =
        detail?.message || 'Sua sessão expirou por inatividade. Entre novamente para continuar.';
      handleSessionExpired(msg);
    };

    window.addEventListener('docsecure:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('docsecure:session-expired', onSessionExpired);
    };
  }, [handleSessionExpired]);

  // Verificação periódica (~5 min) e ao voltar para a aba ativa (visibilitychange)
  const checkSessionAlive = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await apiClient.getMe();
      if (!res || !res.user) {
        handleSessionExpired();
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.includes('401') ||
        msg.includes('Sessão') ||
        msg.includes('autenticado') ||
        msg.includes('expirou')
      ) {
        handleSessionExpired('Sua sessão expirou por inatividade. Entre novamente para continuar.');
      }
    }
  }, [currentUser, handleSessionExpired]);

  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSessionAlive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = setInterval(checkSessionAlive, 5 * 60 * 1000); // A cada ~5 minutos

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [currentUser, checkSessionAlive]);

  // EFEITOS DE ROTEAMENTO (Parte 1, 2 e 3)
  // 1. Compatibilidade com links antigos de redefinição de senha (?reset_token= ou /reset-password)
  useEffect(() => {
    const token = searchParams.get('token') || searchParams.get('reset_token');
    if (location.pathname === '/reset-password' || searchParams.has('reset_token')) {
      navigate(`/definir-senha?token=${token || ''}`, { replace: true });
    }
  }, [location.pathname, searchParams, navigate]);

  // 2. Redirecionamento da raiz /
  useEffect(() => {
    if (currentUser && location.pathname === '/') {
      const homePath =
        initialSetupMode && currentUser.role === 'DEVELOPER'
          ? '/integracao'
          : currentUser.role === 'DEVELOPER'
          ? '/documentos'
          : '/documentos';
      navigate(homePath, { replace: true });
    }
  }, [currentUser, location.pathname, initialSetupMode, navigate]);

  // 3. /login com sessão ativa redireciona para a tela inicial
  useEffect(() => {
    if (currentUser && location.pathname === '/login') {
      const redirectParam = searchParams.get('redirect');
      const homePath =
        initialSetupMode && currentUser.role === 'DEVELOPER'
          ? '/integracao'
          : currentUser.role === 'DEVELOPER'
          ? '/documentos'
          : '/documentos';
      navigate(redirectParam && redirectParam.startsWith('/') ? redirectParam : homePath, {
        replace: true,
      });
    }
  }, [currentUser, location.pathname, searchParams, initialSetupMode, navigate]);

  // 3b. Tela "Armazenamento" foi unificada com "Setores"
  useEffect(() => {
    if (location.pathname === '/armazenamento') {
      navigate('/setores', { replace: true });
    }
  }, [location.pathname, navigate]);

  // 3c. Links antigos (/usuarios, /setores, /permissoes) abrem a janela correspondente
  useEffect(() => {
    if (!currentUser) return;
    const map: Record<string, 'users' | 'sectors' | 'permissions'> = {
      '/usuarios': 'users',
      '/setores': 'sectors',
      '/permissoes': 'permissions',
    };
    const target = map[location.pathname];
    if (!target) return;
    const roles = ROLE_ALLOWED_ROUTES[location.pathname];
    if (!roles || roles.includes(currentUser.role)) setAdminWindow(target);
    navigate('/documentos', { replace: true });
  }, [location.pathname, currentUser, navigate]);

  // 4. Troca obrigatória de senha (mustChangePassword === true)
  useEffect(() => {
    if (currentUser?.mustChangePassword && location.pathname !== '/definir-senha') {
      navigate('/definir-senha?troca_obrigatoria=true', { replace: true });
    }
  }, [currentUser, location.pathname, navigate]);

  // 5. Proteção de rotas não autenticadas
  useEffect(() => {
    if (isLoadingInitialData) return;
    if (!currentUser) {
      if (
        location.pathname !== '/login' &&
        location.pathname !== '/definir-senha' &&
        location.pathname !== '/reset-password'
      ) {
        const redirectParam = location.pathname + location.search;
        navigate(`/login?redirect=${encodeURIComponent(redirectParam)}`, { replace: true });
      }
    }
  }, [currentUser, isLoadingInitialData, location.pathname, location.search, navigate]);

  // 6. Proteção de rotas por perfil de usuário (RBAC)
  useEffect(() => {
    if (!currentUser) return;
    const path = location.pathname;
    if (['/login', '/definir-senha', '/', '/reset-password'].includes(path)) return;

    const allowedRoles = ROLE_ALLOWED_ROUTES[path];
    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
      setAccessDeniedState({
        isOpen: true,
        reason: `Acesso negado: Seu perfil (${currentUser.role}) não possui permissão para acessar esta área.`,
        resourceName: path,
      });
      const homePath = '/documentos';
      navigate(homePath, { replace: true });
    }
  }, [currentUser, location.pathname, navigate]);

  // Complete Login
  const completeLogin = (user: User, isSetupMode?: boolean, mustChangePassword?: boolean) => {
    setCurrentUser(user);
    setSessionExpiredNotice(null);

    if (isSetupMode !== undefined) {
      setInitialSetupMode(Boolean(isSetupMode));
    }

    loadBootstrapData();
    logSecurityEvent(
      user,
      'LOGIN',
      'Sessão Web Segura',
      `Login efetuado com sucesso por ${user.name}.`,
      'SUCCESS'
    );

    if (mustChangePassword || user.mustChangePassword) {
      navigate('/definir-senha?troca_obrigatoria=true');
      return;
    }

    const redirectParam = searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      navigate(redirectParam);
    } else if (user.role === 'DEVELOPER') {
      navigate(isSetupMode ? '/integracao' : '/documentos');
    } else {
      navigate('/documentos');
    }
  };

  // Logout handler
  const handleLogout = async () => {
    if (
      pendingUploads.length > 0 &&
      !window.confirm(
        `${pendingUploads.length} arquivo(s) ainda não foram enviados ao servidor. Eles ficam guardados neste navegador e serão enviados no seu próximo acesso. Sair mesmo assim?`
      )
    ) {
      return;
    }
    setIsLocked(false);
    try {
      await apiClient.logout();
    } catch {}
    if (currentUser) {
      logSecurityEvent(currentUser, 'LOGOUT', 'Sessão Web', 'Sessão encerrada pelo usuário.', 'SUCCESS');
    }
    setCurrentUser(null);
    navigate('/login');
  };

  // Switch user role simulation (restrito exclusivamente a ambiente DEV)
  const handleSwitchUser = (newUser: User) => {
    if (!import.meta.env.DEV) return;
    const freshUser = users.find((u) => u.id === newUser.id) || newUser;
    setCurrentUser(freshUser);
    navigate('/documentos');
    logSecurityEvent(
      freshUser,
      'LOGIN',
      'Simulação de Perfil',
      `Perfil alternado para ${freshUser.name} (${freshUser.role}).`,
      'SUCCESS'
    );
  };

  // Access Denied Trigger (403 Forbidden)
  const triggerAccessDenied = (reason: string, resourceName: string) => {
    logSecurityEvent(currentUser, 'DOCUMENT_VIEWED', resourceName, reason, 'DENIED');
    setAccessDeniedState({
      isOpen: true,
      reason,
      resourceName,
    });
  };

  // Document Download Handler: baixa o arquivo REAL (descriptografado pelo servidor)
  const handleDownloadDocument = async (doc: DocumentItem) => {
    const perm = verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'DOWNLOAD_DOCUMENT', doc.folderId || undefined);
    if (!perm.allowed) {
      triggerAccessDenied(perm.reason || 'Você não tem permissão para baixar este documento.', doc.name);
      return;
    }
    try {
      const blob = await apiClient.getDocumentContent(doc.id, true);
      const url = URL.createObjectURL(blob);
      const element = document.createElement('a');
      element.href = url;
      element.download = doc.name;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err: any) {
      triggerAccessDenied(err?.message || 'Não foi possível baixar o arquivo.', doc.name);
    }
  };

  // Upload: com conexão, envia na hora (setas girando → check verde).
  // Sem conexão, guarda o arquivo criptografado neste navegador e envia quando voltar.
  const handleUploadDocument = async (
    file: File,
    options: {
      departmentId: string;
      folderId: string | null;
      name: string;
      tags: string[];
      security?: { visibility?: string; downloadPolicy?: string; deletePolicy?: string };
    },
    onProgress?: (percent: number) => void
  ): Promise<DocumentItem> => {
    const queueIt = async () => {
      const p = await enqueueUpload(currentUser!.id, file, options);
      setPendingUploads((prev) => [...prev, p]);
      setSync(p.id, 'pending');
      return pendingToDoc(p);
    };

    if (!canWrite()) return queueIt();

    const tempId = 'uploading-' + Date.now();
    const temp: DocumentItem = {
      ...pendingToDoc({
        id: tempId,
        userId: currentUser!.id,
        departmentId: options.departmentId,
        folderId: options.folderId,
        name: options.name || file.name,
        tags: options.tags,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      }),
    };
    setUploadingDocs((prev) => [...prev, temp]);
    setSync(tempId, 'uploading');
    try {
      const saved = await apiClient.uploadFile(file, options, onProgress);
      setDocuments((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === saved.departmentId
            ? { ...d, storageUsedBytes: (d.storageUsedBytes || 0) + saved.sizeBytes, itemCount: (d.itemCount || 0) + 1 }
            : d
        )
      );
      markSynced(saved.id);
      return saved;
    } catch (err: any) {
      if (err?.isConnectionError) return queueIt();
      throw err;
    } finally {
      setUploadingDocs((prev) => prev.filter((d) => d.id !== tempId));
      setSync(tempId);
    }
  };

  // Create Folder Handler: grava no servidor primeiro (ele valida setor e permissões)
  const handleCreateFolder = async (data: {
    name: string;
    departmentId: string;
    isLocked: boolean;
    isPrivate?: boolean;
    description: string;
    parentId?: string | null;
  }) => {
    const dept = departments.find((d) => d.id === data.departmentId);
    const created = await apiClient.createFolder({ ...data, departmentName: dept?.name });
    setFolders((prev) => [created, ...prev.filter((f) => f.id !== created.id)]);
    return created;
  };

  // Delete Folder Handler: o servidor só permite excluir pastas vazias
  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    try {
      const res = await apiClient.deleteFolder(folderId);
      // A pasta, as subpastas e os arquivos de dentro (que foram para a lixeira) saem da tela
      const removed = new Set(res.deletedFolderIds || [folderId]);
      setFolders((prev) => prev.filter((f) => !removed.has(f.id)));
      setDocuments((prev) => prev.filter((d) => !d.folderId || !removed.has(d.folderId)));
    } catch (err: any) {
      triggerAccessDenied(err?.message || 'Não foi possível excluir a pasta.', folder.name);
    }
  };

  // Excluir vários itens selecionados: um único aviso no final, com o que não deu certo
  const handleDeleteMany = async (docIds: string[], folderIds: string[]) => {
    const failures: string[] = [];
    const removedFolders = new Set<string>();
    const removedDocs = new Set<string>();
    for (const id of folderIds) {
      const f = folders.find((x) => x.id === id);
      try {
        const res = await apiClient.deleteFolder(id);
        (res.deletedFolderIds || [id]).forEach((x) => removedFolders.add(x));
      } catch (err: any) {
        failures.push(`${f?.name || 'Pasta'}: ${err?.message || 'não foi possível excluir'}`);
      }
    }
    for (const id of docIds) {
      const d = documents.find((x) => x.id === id);
      if (d?.folderId && removedFolders.has(d.folderId)) continue; // já foi junto com a pasta
      try {
        await apiClient.deleteDocument(id);
        removedDocs.add(id);
      } catch (err: any) {
        failures.push(`${d?.name || 'Arquivo'}: ${err?.message || 'não foi possível excluir'}`);
      }
    }
    setFolders((prev) => prev.filter((f) => !removedFolders.has(f.id)));
    setDocuments((prev) => prev.filter((d) => !removedDocs.has(d.id) && (!d.folderId || !removedFolders.has(d.folderId))));
    if (viewingDocument && removedDocs.has(viewingDocument.id)) setViewingDocument(null);
    if (failures.length) {
      triggerAccessDenied(
        `${failures.length} item(ns) não puderam ser excluídos: ${failures.slice(0, 4).join(' • ')}${failures.length > 4 ? ' • …' : ''}`,
        'Exclusão de vários itens'
      );
    }
  };

  // Move Document Handler (validado no servidor)
  const handleMoveDocument = async (docId: string, targetFolderId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc || doc.folderId === targetFolderId) return;
    try {
      const saved = await apiClient.updateDocument(docId, { folderId: targetFolderId });
      setDocuments((prev) => prev.map((d) => (d.id === docId ? saved : d)));
    } catch (err: any) {
      triggerAccessDenied(err?.message || 'Não foi possível mover o documento.', doc.name);
    }
  };

  // Move Folder Handler (Persisted to PostgreSQL)
  const handleMoveFolder = async (folderId: string, targetFolderId: string) => {
    if (folderId === targetFolderId) return;
    const targetFolder = folders.find((f) => f.id === targetFolderId);
    const folder = folders.find((f) => f.id === folderId);
    if (!folder || !targetFolder) return;

    try {
      await apiClient.updateFolder(folderId, { parentId: targetFolderId });
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentId: targetFolderId } : f)));
      logSecurityEvent(
        currentUser,
        'FOLDER_MOVED',
        folder.name,
        `Pasta ${folder.name} movida para dentro de ${targetFolder.name}.`,
        'SUCCESS'
      );
    } catch (err: any) {
      triggerAccessDenied(err?.message || 'Não foi possível mover a pasta.', folder.name);
    }
  };

  // Toggle Favorite (Persisted to PostgreSQL)
  const handleToggleFavorite = async (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, isFavorite: !d.isFavorite } : d))
    );
    try {
      await apiClient.toggleFavoriteDocument(docId);
    } catch (e) {
      console.warn('[Toggle Favorite API Persist]', e);
    }
  };

  // Excluir documento: vai para a lixeira do setor por 7 dias (o servidor valida a permissão)
  const handleDeleteDocument = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    try {
      await apiClient.deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (viewingDocument?.id === docId) setViewingDocument(null);
    } catch (err: any) {
      triggerAccessDenied(err?.message || 'Não foi possível excluir o documento.', doc.name);
    }
  };

  // Propriedades → Segurança do arquivo (o servidor valida quem pode alterar)
  const handleUpdateDocumentSecurity = async (
    docId: string,
    security: { visibility?: string; downloadPolicy?: string; deletePolicy?: string }
  ) => {
    const updated = await apiClient.updateDocumentSecurity(docId, security);
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    return updated;
  };

  // Restaurar da lixeira
  const handleRestoreDocument = async (doc: DocumentItem) => {
    const restored = await apiClient.restoreDocument(doc.id);
    setDocuments((prev) => [restored, ...prev.filter((d) => d.id !== restored.id)]);
    return restored;
  };

  // Device Management Actions (Persisted to PostgreSQL)
  const handleApproveDevice = async (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'TRUSTED' } : d))
    );
    try {
      await apiClient.updateDeviceStatus(deviceId, 'TRUSTED');
    } catch (e) {
      console.warn('[Approve Device API Persist]', e);
    }
    const dev = devices.find((d) => d.id === deviceId);
    logSecurityEvent(currentUser, 'DEVICE_APPROVED', dev?.deviceName || 'Dispositivo', 'Terminal autorizado como confiável.', 'SUCCESS');
  };

  const handleBlockDevice = async (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'BLOCKED' } : d))
    );
    try {
      await apiClient.updateDeviceStatus(deviceId, 'BLOCKED');
    } catch (e) {
      console.warn('[Block Device API Persist]', e);
    }
    const dev = devices.find((d) => d.id === deviceId);
    logSecurityEvent(currentUser, 'DEVICE_BLOCKED', dev?.deviceName || 'Dispositivo', 'Acesso do terminal revogado por segurança.', 'SUCCESS');
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    try {
      await apiClient.revokeDevice(deviceId);
    } catch (e) {
      console.warn('[Revoke Device API Persist]', e);
    }
    logSecurityEvent(currentUser, 'DEVICE_REVOKED', 'Terminal Revogado', 'Credencial de hardware removida.', 'SUCCESS');
  };

  // Update Granular Permissions (Persisted to PostgreSQL)
  const handleUpdatePermissions = async (userId: string, folderId: string, perms: PermissionType[]) => {
    const hasViewPerm = perms.includes('VIEW_FOLDER');

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const newPermittedFolders = hasViewPerm
          ? Array.from(new Set([...u.permittedFolderIds, folderId]))
          : u.permittedFolderIds.filter((f) => f !== folderId);

        return {
          ...u,
          permittedFolderIds: newPermittedFolders,
          granularPermissions: {
            ...u.granularPermissions,
            [folderId]: perms,
          },
        };
      })
    );

    // Synchronize active session if user is currently logged in
    setCurrentUser((prev) => {
      if (!prev || prev.id !== userId) return prev;
      const newPermittedFolders = hasViewPerm
        ? Array.from(new Set([...prev.permittedFolderIds, folderId]))
        : prev.permittedFolderIds.filter((f) => f !== folderId);

      return {
        ...prev,
        permittedFolderIds: newPermittedFolders,
        granularPermissions: {
          ...prev.granularPermissions,
          [folderId]: perms,
        },
      };
    });

    try {
      await apiClient.updateUserPermissions(userId, folderId, perms);
    } catch (e) {
      console.warn('[Update Permissions API Persist]', e);
    }

    const targetUser = users.find((u) => u.id === userId);
    logSecurityEvent(
      currentUser,
      'PERMISSIONS_MODIFIED',
      `Pasta ${folderId}`,
      `Permissões gravadas no PostgreSQL para ${targetUser?.name || 'colaborador'}. Download: ${
        perms.includes('DOWNLOAD_DOCUMENT') ? 'LIBERADO' : 'REVOGADO'
      }.`,
      'SUCCESS'
    );
  };

  // User Creation Handler (Persisted to PostgreSQL)
  const handleCreateUser = async (newUserData: any) => {
    const targetDeptId = newUserData.departmentId || departments[0]?.id || '';
    const deptFolders = folders.filter((f) => f.departmentId === targetDeptId);
    const initialPermittedFolders = deptFolders.map((f) => f.id);
    const initialGranular: Record<string, PermissionType[]> = {};

    deptFolders.forEach((f) => {
      initialGranular[f.id] = [
        'VIEW_FOLDER',
        'LIST_FILES',
        'VIEW_DOCUMENT',
        'DOWNLOAD_DOCUMENT',
        'UPLOAD_DOCUMENT',
      ];
    });

    const newUser: User = {
      id: '',
      name: newUserData.name || 'Novo Usuário',
      email: newUserData.email || '',
      matricula: newUserData.matricula || 'MAT-000',
      cpf: newUserData.cpf,
      role: newUserData.role || 'EMPLOYEE',
      departmentId: targetDeptId,
      departmentName: newUserData.departmentName || departments.find((d) => d.id === targetDeptId)?.name || 'Geral',
      cargo: newUserData.cargo || 'Colaborador',
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      twoFactorEnabled: newUserData.twoFactorEnabled ?? true,
      createdAt: new Date().toISOString(),
      permittedFolderIds: initialPermittedFolders,
      granularPermissions: initialGranular,
    };

    // Grava no servidor primeiro: é ele que gera o ID, a senha provisória e envia o e-mail
    const { id: _ignored, ...payload } = newUser;
    const created = await apiClient.createUser(payload);
    const { emailSent, temporaryPassword, ...savedUser } = created;
    setUsers((prev) => [savedUser as User, ...prev]);

    logSecurityEvent(
      currentUser,
      'USER_CREATED',
      savedUser.name,
      `Usuário gravado no banco de dados com papel ${savedUser.role} no setor ${savedUser.departmentName}. ` +
        (emailSent ? 'Senha provisória enviada por e-mail.' : 'Falha no envio do e-mail de acesso.'),
      'SUCCESS'
    );

    return { emailSent: Boolean(emailSent), temporaryPassword };
  };

  // Editar usuário (nome, e-mail, matrícula, função, perfil e setor) — gravado no servidor primeiro
  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    const before = users.find((u) => u.id === userId);
    const saved = await apiClient.updateUser(userId, updates);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...saved } : u)));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser((prev) => (prev ? { ...prev, ...saved } : prev));
    }
    const changes = Object.keys(updates)
      .filter((k) => k !== 'departmentName')
      .map((k) =>
        k === 'role'
          ? `perfil ${before?.role} → ${saved.role}`
          : k === 'departmentId'
          ? `setor ${before?.departmentName} → ${saved.departmentName}`
          : k === 'cargo'
          ? `função "${before?.cargo || '-'}" → "${saved.cargo}"`
          : k
      )
      .join(', ');
    logSecurityEvent(currentUser, 'USER_EDITED', saved.name, `Usuário atualizado: ${changes}.`, 'SUCCESS');
  };

  // Excluir usuário (o servidor revoga sessões e registra na auditoria)
  const handleDeleteUser = async (userId: string) => {
    await apiClient.deleteUser(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  // Reenviar acesso: nova senha provisória por e-mail + troca obrigatória no próximo login
  const handleResendAccess = async (userId: string) => {
    const res = await apiClient.resendUserAccess(userId);
    const target = users.find((u) => u.id === userId);
    logSecurityEvent(
      currentUser,
      'USER_EDITED',
      target?.name || userId,
      res.emailSent ? 'Nova senha provisória enviada por e-mail.' : 'Nova senha provisória gerada (falha no envio do e-mail).',
      'SUCCESS'
    );
    return { emailSent: res.emailSent, temporaryPassword: res.temporaryPassword };
  };

  // Toggle User Status (Persisted to PostgreSQL)
  const handleToggleUserStatus = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    const nextStatus = targetUser.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u))
    );

    try {
      await apiClient.updateUser(userId, { status: nextStatus });
    } catch (e) {
      console.warn('[Toggle User Status API Persist]', e);
    }

    logSecurityEvent(
      currentUser,
      nextStatus === 'BLOCKED' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
      targetUser.name,
      `Status do usuário atualizado para ${nextStatus} no PostgreSQL.`,
      'SUCCESS'
    );
  };

  // Department Creation (Persisted to PostgreSQL)
  const handleCreateDepartment = async (newDeptData: any) => {
    const newDept: Department = {
      id: 'dept-' + Date.now(),
      name: newDeptData.name || 'Novo Setor',
      code: newDeptData.code || 'SET',
      iconName: 'Building',
      color: '#3b82f6',
      storageLimitBytes: newDeptData.storageLimitBytes || 500 * 1024 * 1024 * 1024,
      storageUsedBytes: 0,
      managerId: newDeptData.managerId,
      managerName: newDeptData.managerName,
      description: newDeptData.description || '',
      isLocked: true,
      itemCount: 0,
    };

    setDepartments((prev) => [...prev, newDept]);

    try {
      await apiClient.createDepartment(newDept);
    } catch (e: any) {
      // O servidor recusou (ex.: limite maior que o disco do servidor): desfaz e avisa
      setDepartments((prev) => prev.filter((d) => d.id !== newDept.id));
      triggerAccessDenied(e?.message || 'Não foi possível criar o setor.', newDept.name);
      return;
    }

    logSecurityEvent(currentUser, 'DEPARTMENT_CREATED', newDept.name, 'Novo setor provisionado no PostgreSQL.', 'SUCCESS');
  };

  // Department Delete (somente setores vazios; o servidor valida)
  const handleDeleteDepartment = async (deptId: string) => {
    const dept = departments.find((d) => d.id === deptId);
    await apiClient.deleteDepartment(deptId);
    setDepartments((prev) => prev.filter((d) => d.id !== deptId));
    setFolders((prev) => prev.filter((f) => f.departmentId !== deptId));
    logSecurityEvent(currentUser, 'DEPARTMENT_EDITED', dept?.name || deptId, 'Setor vazio removido do PostgreSQL.', 'SUCCESS');
  };

  // Department Update (Persisted to PostgreSQL)
  const handleUpdateDepartment = async (deptId: string, data: any) => {
    const before = departments.find((d) => d.id === deptId);
    setDepartments((prev) =>
      prev.map((d) => (d.id === deptId ? { ...d, ...data } : d))
    );
    try {
      await apiClient.updateDepartment(deptId, data);
    } catch (e: any) {
      // O servidor recusou: volta ao valor anterior e mostra o motivo
      if (before) setDepartments((prev) => prev.map((d) => (d.id === deptId ? before : d)));
      triggerAccessDenied(e?.message || 'Não foi possível salvar o setor.', before?.name || 'Setor');
      return;
    }
    logSecurityEvent(currentUser, 'DEPARTMENT_EDITED', deptId, 'Parâmetros de setor gravados no PostgreSQL.', 'SUCCESS');
  };

  // API Key Creation & Revocation (Persisted to PostgreSQL)
  const handleCreateApiKey = async (name: string, scopes: string[]) => {
    const newKey: ApiKey = {
      id: 'key-' + Date.now(),
      name,
      keyPreview: `dcs_live_••••••••${Math.random().toString(36).substring(2, 6)}`,
      keyHash: 'hash_' + Date.now(),
      scopes,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      lastUsedAt: null,
      status: 'ACTIVE',
      createdBy: currentUser?.name || 'Administrador',
    };

    setApiKeys((prev) => [newKey, ...prev]);
    try {
      await apiClient.createApiKey(name, scopes, currentUser?.name || 'Administrador');
    } catch (e) {
      console.warn('[Create API Key Persist]', e);
    }
    logSecurityEvent(currentUser, 'API_KEY_CREATED', name, `Chave de API gerada com escopos: ${scopes.join(', ')}.`, 'SUCCESS');
  };

  const handleRevokeApiKey = async (keyId: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    try {
      await apiClient.revokeApiKey(keyId);
    } catch (e) {
      console.warn('[Revoke API Key Persist]', e);
    }
    logSecurityEvent(currentUser, 'API_KEY_REVOKED', keyId, 'Chave de API revogada no banco de dados.', 'SUCCESS');
  };

  // Webhook Creation (Persisted to PostgreSQL)
  const handleCreateWebhook = async (name: string, url: string, events: string[]) => {
    const newWh: WebhookConfig = {
      id: 'wh-' + Date.now(),
      name,
      url,
      events,
      secretKey: 'whsec_••••••••••••••••' + Math.random().toString(36).substring(2, 6),
      status: 'ACTIVE',
      lastTriggeredAt: null,
      successRate: 100,
    };

    setWebhooks((prev) => [newWh, ...prev]);
    try {
      await apiClient.createWebhook(name, url, events);
    } catch (e) {
      console.warn('[Create Webhook Persist]', e);
    }
    logSecurityEvent(currentUser, 'WEBHOOK_CREATED', name, `Webhook registrado no banco de dados para a URL ${url}.`, 'SUCCESS');
  };

  // Folder Metadata Update (Persisted to PostgreSQL)
  const handleUpdateFolder = async (folderId: string, updates: Partial<Folder>) => {
    const before = folders.find((f) => f.id === folderId);
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...updates } : f)));
    try {
      const saved = await apiClient.updateFolder(folderId, updates);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...saved } : f)));
    } catch (err: any) {
      // Desfaz a alteração na tela e mostra o motivo
      if (before) setFolders((prev) => prev.map((f) => (f.id === folderId ? before : f)));
      triggerAccessDenied(err?.message || 'Não foi possível alterar a pasta.', before?.name || 'Pasta');
    }
  };

  // Rota com prioridade sobre a sessão: /definir-senha abre mesmo que já exista alguém logado
  if (location.pathname === '/definir-senha') {
    return (
      <SetPasswordPage
        currentUser={currentUser}
        onPasswordChangeSuccess={(updatedUser) => {
          setCurrentUser(updatedUser);
          const home = '/documentos';
          navigate(home);
        }}
      />
    );
  }

  // If initial load in progress, display clean enterprise splash
  if (isLoadingInitialData && !currentUser) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 select-none">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <Database className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">DocSecure Enterprise Core</h3>
            <p className="text-xs text-slate-500 mt-1">Conectando ao banco de dados PostgreSQL...</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Sincronizando tabelas & RBAC...</span>
          </div>
        </div>
      </div>
    );
  }

  // If NOT logged in, display the pixel-perfect LoginView
  if (!currentUser) {
    return (
      <>
        <LoginView
          onLoginSuccess={completeLogin}
          availableUsers={users}
          onRequestDeviceApproval={(user) => setPendingDeviceUser(user)}
          sessionExpiredNotice={sessionExpiredNotice}
          onClearSessionExpiredNotice={() => setSessionExpiredNotice(null)}
        />

        {/* Device Approval Modal */}
        <DeviceApprovalModal
          isOpen={!!pendingDeviceUser}
          user={pendingDeviceUser}
          currentDevice={{
            deviceName: 'Novo Terminal (Aguardando Aprovação)',
            os: 'Windows 11 Enterprise',
            ipAddress: '187.54.120.45',
            fingerprintHash: 'sha256-a9f87c6b54321',
          }}
          onApproveByAdmin={() => {
            if (pendingDeviceUser) completeLogin(pendingDeviceUser);
            setPendingDeviceUser(null);
          }}
          onCancel={() => setPendingDeviceUser(null)}
        />
      </>
    );
  }

  // Se a rota acessada não for reconhecida, exibe 404 Página não encontrada
  const isKnownRoute =
    Object.keys(ROLE_ALLOWED_ROUTES).includes(location.pathname) ||
    ['/', '/login', '/definir-senha', '/reset-password'].includes(location.pathname);

  if (!isKnownRoute) {
    return <NotFoundPage currentUser={currentUser} />;
  }

  // If Mobile Simulator Mode is toggled
  if (isMobileSimulator) {
    return (
      <div className="relative min-h-screen bg-slate-100">
        {/* Floating Switcher Bar */}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/95 border border-slate-200 px-4 py-2 rounded-full shadow-xl flex items-center gap-3 backdrop-blur-md">
          <span className="text-xs font-bold text-slate-800">Modo Mobile Simulator</span>
          <button
            type="button"
            onClick={() => setIsMobileSimulator(false)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-semibold shadow-xs"
          >
            Voltar ao Modo Desktop
          </button>
        </div>

        <MobileAppFrame
          currentUser={currentUser}
          departments={departments}
          folders={folders}
          documents={documents}
          onOpenDocument={(doc) => setViewingDocument(doc)}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onAccessDenied={triggerAccessDenied}
        />

        {/* Document Viewer */}
        <DocumentViewerModal
          document={viewingDocument}
          isOpen={!!viewingDocument}
          onClose={() => setViewingDocument(null)}
          currentUser={currentUser}
          onDownload={handleDownloadDocument}
          onDelete={(doc) => {
            if (window.confirm(`Enviar "${doc.name}" para a lixeira do setor ${doc.departmentName}?\n\nEle poderá ser restaurado por 7 dias; depois será apagado do servidor.`)) {
              handleDeleteDocument(doc.id);
            }
          }}
        />
      </div>
    );
  }

  // RESPONSIVE UNIFIED APP SHELL (Mobile-first with drawer & bottom nav, full desktop on lg+)
  return (
    <AppShell
      currentUser={currentUser}
      activeTab={activeTab}
      allowedTabs={(Object.keys(TAB_TO_PATH) as NavigationTab[]).filter((tab) => {
        const roles = ROLE_ALLOWED_ROUTES[TAB_TO_PATH[tab]];
        return !roles || roles.includes(currentUser.role);
      })}
      onSelectTab={(tab) => navigateToTab(tab)}
      onLogout={handleLogout}
      availableUsers={users}
      onSwitchUser={import.meta.env.DEV ? handleSwitchUser : undefined}
      onOpenDevices={() => navigate('/dispositivos')}
      onOpenSecurity={() => navigate('/seguranca')}
      notifications={notifications}
      onNotificationClick={(n) => n.id.startsWith('update-') && openUpdateNotice()}
      isMobileFrameActive={isMobileSimulator}
      onToggleMobileFrame={() => setIsMobileSimulator(!isMobileSimulator)}
      dbStatus={dbStatus}
      pendingSyncCount={pendingUploads.length}
      offlineBanner={
        connectionStatus === 'offline' ? (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2 shrink-0">
            <strong>Sem conexão com o servidor.</strong> Alterações estão bloqueadas para não perder dados. Arquivos enviados
            agora ficam guardados neste navegador e sobem automaticamente quando a conexão voltar.
          </div>
        ) : null
      }
      currentTitle={TAB_TO_TITLE[activeTab] || 'DocSecure'}
      departments={departments}
      folders={folders}
      explorerLocation={explorerLocation}
      onOpenLocation={(loc) => {
        if (activeTab !== 'my_documents') navigateToTab('my_documents');
        setExplorerNav({ ...loc, nonce: Date.now() });
      }}
      initialSetupBanner={
        initialSetupMode && currentUser.role === 'DEVELOPER' ? (
          <div className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-md border-b border-amber-600 sticky top-0 z-50 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-950"></span>
              </span>
              <span>
                Configuração inicial pendente: configure o e-mail em Integração para ativar a verificação em duas etapas
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/integracao')}
              className="ml-4 px-3 py-1 bg-slate-950 hover:bg-slate-850 text-amber-300 hover:text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              Configurar Integração
            </button>
          </div>
        ) : null
      }
      apiSyncErrorBanner={
        apiSyncError ? (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{apiSyncError}</span>
            </div>
            <button
              type="button"
              onClick={() => loadBootstrapData()}
              className="font-bold underline hover:text-amber-950 cursor-pointer"
            >
              Reconectar
            </button>
          </div>
        ) : null
      }
    >
          {isLocked && (
            <LockScreen
              currentUser={currentUser}
              hasPin={securityPolicy.hasPin || Boolean(currentUser.hasPin)}
              onUnlocked={handleUnlocked}
              onForcedLogout={(msg) => {
                setIsLocked(false);
                dispatchSessionExpired(msg);
              }}
              onLogout={handleLogout}
            />
          )}

          {activeTab === 'dev_dashboard' && (
            <DeveloperDashboard
              usersCount={users.length}
              managersCount={users.filter((u) => u.role === 'MANAGER').length}
              sectorsCount={departments.length}
              auditLogsCount={auditLogs.length}
              recentAuditLogs={auditLogs}
              onNavigate={(tab) => navigateToTab(tab)}
              onOpenCreateUser={() => navigateToTab('users')}
              onOpenCreateSector={() => navigateToTab('sectors')}
            />
          )}

          {activeTab === 'my_documents' && (
            <DocumentsExplorer
              externalNavigation={explorerNav}
              onLocationChange={setExplorerLocation}
              pendingDocs={pendingDocs}
              syncStates={syncStates}
              currentUser={currentUser}
              departments={departments}
              folders={folders}
              documents={documents}
              users={users}
              searchTerm={globalSearchTerm}
              onOpenDocument={(doc) => setViewingDocument(doc)}
              onDownloadDocument={handleDownloadDocument}
              onOpenUploadModal={(deptId, folderId) => {
                setUploadDeptId(deptId);
                setUploadFolderId(folderId);
                setIsUploadModalOpen(true);
              }}
              onOpenCreateFolderModal={(deptId, parentId) => {
                setCreateFolderDeptId(deptId);
                setCreateFolderParentId(parentId || null);
                setIsCreateFolderModalOpen(true);
              }}
              onAccessDenied={triggerAccessDenied}
              onToggleFavorite={handleToggleFavorite}
              onDeleteDocument={handleDeleteDocument}
              onUpdateDocumentSecurity={handleUpdateDocumentSecurity}
              onDeleteMany={handleDeleteMany}
              onCreateFolderDirect={handleCreateFolder}
              onUploadFile={handleUploadDocument}
              isOnline={connectionStatus === 'online'}
              onUpdateUserPermissions={handleUpdatePermissions}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveDocument={handleMoveDocument}
              onMoveFolder={handleMoveFolder}
            />
          )}

          {adminWindow === 'users' && (
            <WindowDialog title="Usuários" icon={<UserCog className="w-4 h-4 text-blue-600" />} onClose={() => setAdminWindow(null)}>
            <UsersManagement
              currentUser={currentUser}
              users={users}
              departments={departments}
              onCreateUser={handleCreateUser}
              onResendAccess={handleResendAccess}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
              onToggleUserStatus={handleToggleUserStatus}
              onReset2FA={(userId) => {
                const u = users.find((x) => x.id === userId);
                alert(`Chave 2FA redefinida com sucesso para ${u?.name}.`);
              }}
            />
            </WindowDialog>
          )}

          {adminWindow === 'sectors' && (
            <WindowDialog title="Setores & Armazenamento" icon={<Building2 className="w-4 h-4 text-amber-600" />} onClose={() => setAdminWindow(null)}>
            <SectorsManagement
              departments={departments}
              users={users}
              currentUser={currentUser}
              onUpdateDepartment={handleUpdateDepartment}
              onCreateDepartment={handleCreateDepartment}
              onDeleteDepartment={handleDeleteDepartment}
            />
            </WindowDialog>
          )}

          {adminWindow === 'permissions' && (
            <WindowDialog title="Permissões" icon={<ShieldCheckIcon className="w-4 h-4 text-emerald-600" />} onClose={() => setAdminWindow(null)}>
            <PermissionsMatrix
              currentUser={currentUser}
              users={users}
              folders={folders}
              onUpdateUserPermissions={handleUpdatePermissions}
            />
            </WindowDialog>
          )}

          {activeTab === 'devices' && (
            <DevicesManagement
              currentUser={currentUser}
              devices={devices}
              onApproveDevice={handleApproveDevice}
              onBlockDevice={handleBlockDevice}
              onRevokeDevice={handleRevokeDevice}
            />
          )}

          {activeTab === 'audit_logs' && (
            <AuditLogsView auditLogs={auditLogs} currentUser={currentUser} />
          )}

          {activeTab === 'system' && (
            <SystemView
              currentUser={currentUser}
              apiKeys={apiKeys}
              webhooks={webhooks}
              onCreateApiKey={handleCreateApiKey}
              onCreateWebhook={handleCreateWebhook}
              onRevokeApiKey={handleRevokeApiKey}
              dbStatus={dbStatus}
            />
          )}

          {activeTab === 'settings' && (
            <AccountSecurity
              currentUser={currentUser}
              onLockNow={lockNow}
              onPinChanged={(hasPin) => {
                setSecurityPolicy((p) => ({ ...p, hasPin }));
                setCurrentUser((u) => (u ? { ...u, hasPin } : u));
              }}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView
              currentUser={currentUser}
              onSetupCompleted={() => setInitialSetupMode(false)}
            />
          )}

          {activeTab === 'trash' && (
            <TrashView
              currentUser={currentUser}
              departments={departments}
              onRestore={handleRestoreDocument}
              refreshKey={dataVersion}
            />
          )}

          {['shared', 'favorites'].includes(activeTab) && (
            <DocumentsExplorer
              flatView={{ title: activeTab === 'favorites' ? 'Favoritos' : 'Compartilhados' }}
              onGoHome={() => navigateToTab('my_documents')}
              currentUser={currentUser}
              departments={departments}
              folders={folders}
              documents={documents.filter((d) => {
                if (activeTab === 'favorites') return d.isFavorite;
                if (activeTab === 'shared') return d.isShared;
                return true;
              })}
              users={users}
              searchTerm={globalSearchTerm}
              onOpenDocument={(doc) => setViewingDocument(doc)}
              onDownloadDocument={handleDownloadDocument}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onOpenCreateFolderModal={(deptId, parentId) => {
                setCreateFolderDeptId(deptId);
                setCreateFolderParentId(parentId || null);
                setIsCreateFolderModalOpen(true);
              }}
              onAccessDenied={triggerAccessDenied}
              onToggleFavorite={handleToggleFavorite}
              onDeleteDocument={handleDeleteDocument}
              onUpdateDocumentSecurity={handleUpdateDocumentSecurity}
              onUpdateUserPermissions={handleUpdatePermissions}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveDocument={handleMoveDocument}
              onMoveFolder={handleMoveFolder}
            />
          )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        document={viewingDocument}
        isOpen={!!viewingDocument}
        onClose={() => setViewingDocument(null)}
        currentUser={currentUser}
        onDownload={handleDownloadDocument}
        onDelete={(doc) => {
          if (window.confirm(`Enviar "${doc.name}" para a lixeira do setor ${doc.departmentName}?\n\nEle poderá ser restaurado por 7 dias; depois será apagado do servidor.`)) {
            handleDeleteDocument(doc.id);
          }
        }}
      />

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        departments={departments}
        folders={folders}
        currentDepartmentId={uploadDeptId}
        currentFolderId={uploadFolderId}
        currentUser={currentUser}
        onUploadSuccess={handleUploadDocument}
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setIsCreateFolderModalOpen(false)}
        departments={departments}
        currentUser={currentUser}
        currentDepartmentId={createFolderDeptId}
        parentFolderId={createFolderParentId}
        onCreateFolder={handleCreateFolder}
      />

      {/* 403 Forbidden Access Denied Modal */}
      <AccessDeniedModal
        isOpen={accessDeniedState.isOpen}
        onClose={() => setAccessDeniedState({ isOpen: false, reason: '', resourceName: '' })}
        reason={accessDeniedState.reason}
        resourceName={accessDeniedState.resourceName}
        requiredRoleOrPermission="RBAC: Permissão Granular Específica"
      />
      {newVersionReady && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-5 w-[calc(100%-1.5rem)] max-w-md">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-sky-300 shrink-0" />
            <div className="flex-1 min-w-0 text-[13px] leading-snug">
              <div className="font-semibold">O DocSecure foi atualizado</div>
              <div className="text-slate-300">Recarregue para usar a versão nova.</div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold shrink-0"
            >
              Recarregar
            </button>
          </div>
        </div>
      )}
      {isUpdateDialogOpen && updateNotice?.updateAvailable && (
        <UpdateNoticeDialog
          notice={updateNotice}
          canApply={currentUser.role === 'DEVELOPER'}
          onClose={() => setIsUpdateDialogOpen(false)}
          onApply={() => {
            setIsUpdateDialogOpen(false);
            navigate('/integracao');
            window.setTimeout(() => document.getElementById('atualizacao-sistema')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
          }}
        />
      )}
    </AppShell>
  );
}
