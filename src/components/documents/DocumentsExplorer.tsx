import React, { useState, useEffect, useRef } from 'react';
import {
  Folder as FolderIcon,
  FileText,
  FileSpreadsheet,
  Lock,
  Plus,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  Clock,
  Star,
  Users,
  Briefcase,
  Building,
  Download,
  Eye,
  Trash2,
  FileCode,
  ShieldCheck,
  SlidersHorizontal,
  FolderPlus,
  FolderOpen,
  ArrowRight,
  Info,
  Layers,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Department, Folder, DocumentItem, User, PermissionType } from '../../types';
import { verifyPermission } from '../../services/securityEngine';
import { FolderConfigModal } from './FolderConfigModal';

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
  onUpdateUserPermissions: (userId: string, folderId: string, permissions: PermissionType[]) => void;
  onUpdateFolder?: (folderId: string, updates: Partial<Folder>) => void;
  onDeleteFolder?: (folderId: string) => void;
  onMoveDocument?: (docId: string, targetFolderId: string) => void;
  onMoveFolder?: (folderId: string, targetFolderId: string) => void;
}

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
  onUpdateUserPermissions,
  onUpdateFolder,
  onDeleteFolder,
  onMoveDocument,
  onMoveFolder,
}) => {
  const [currentDeptId, setCurrentDeptId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<'arquivos' | 'permissoes'>('arquivos');

  // Interactive selection & drag-and-drop state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggingEntity, setDraggingEntity] = useState<{ type: 'document' | 'folder'; id: string; name: string } | null>(null);

  // Folder configuration modal state (Properties & Who Can Access)
  const [configFolderModalData, setConfigFolderModalData] = useState<{
    isOpen: boolean;
    folder: Folder | null;
  }>({
    isOpen: false,
    folder: null,
  });

  // Delete folder confirmation modal
  const [deleteConfirmFolder, setDeleteConfirmFolder] = useState<Folder | null>(null);

  // Floating Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    type: 'folder' | 'blank';
    folder?: Folder;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'blank',
  });

  const explorerRef = useRef<HTMLDivElement>(null);

  const currentDepartment = departments.find((d) => d.id === currentDeptId);
  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const isAtRoot = currentDeptId === null;

  const visibleDepartments = departments.filter((d) => {
    if (!searchTerm) return true;
    return d.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const currentFolders = folders.filter((f) => {
    if (searchTerm) {
      return f.name.toLowerCase().includes(searchTerm.toLowerCase());
    }
    if (isAtRoot) return false;
    return f.departmentId === currentDeptId && (currentFolderId ? f.parentId === currentFolderId : f.parentId === null);
  });

  const currentDocs = documents.filter((doc) => {
    if (searchTerm) {
      return (
        doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.tags?.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (isAtRoot) return false;
    if (currentFolderId) {
      return doc.folderId === currentFolderId;
    }
    // Root of department: show files in this department's folders or department root
    return doc.departmentId === currentDeptId;
  });

  // Check if current user is manager of this area or director/developer
  const canManageFolderPermissions =
    currentUser.role === 'DEVELOPER' ||
    currentUser.role === 'DIRECTOR' ||
    (currentUser.role === 'MANAGER' && currentUser.departmentId === (currentDeptId || currentFolder?.departmentId));

  // Close context menu on outside click or scroll or escape
  useEffect(() => {
    const handleClose = () => {
      setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
        setSelectedFolderId(null);
      }
      // 1 clique seleciona + Enter abre a pasta
      if (e.key === 'Enter' && selectedFolderId) {
        const target = currentFolders.find((f) => f.id === selectedFolderId);
        if (target) {
          handleOpenFolder(target);
        }
      }
    };

    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedFolderId, currentFolders]);

  // Open Folder Config Modal (Propriedades / Configuração de quem pode acessar)
  const handleOpenFolderConfig = (folder: Folder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!canManageFolderPermissions) {
      onAccessDenied('Apenas Gestores de Área e Administradores podem configurar permissões de pastas.', folder.name);
      return;
    }
    setConfigFolderModalData({
      isOpen: true,
      folder,
    });
  };

  // Folder navigation with RBAC verification
  const handleOpenDepartment = (dept: Department) => {
    const perm = verifyPermission(currentUser, 'department', dept.id, dept.id, 'VIEW_FOLDER');
    if (!perm.allowed) {
      onAccessDenied(perm.reason || `Você não possui permissão para acessar o setor ${dept.name}.`, dept.name);
      return;
    }

    setCurrentDeptId(dept.id);
    setCurrentFolderId(null);
    setSelectedFolderId(null);
  };

  const handleOpenFolder = (folder: Folder) => {
    const perm = verifyPermission(currentUser, 'folder', folder.id, folder.departmentId, 'VIEW_FOLDER');
    if (!perm.allowed) {
      onAccessDenied(
        perm.reason || `Acesso negado: Você não possui autorização para abrir a pasta ${folder.name}.`,
        folder.name
      );
      return;
    }

    setCurrentFolderId(folder.id);
    setSelectedFolderId(null);
  };

  const handleOpenDocument = (doc: DocumentItem) => {
    const perm = verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'VIEW_DOCUMENT', doc.folderId);
    if (!perm.allowed) {
      onAccessDenied(
        perm.reason || `Acesso negado: Você não possui autorização para visualizar o documento ${doc.name}.`,
        doc.name
      );
      return;
    }

    onOpenDocument(doc);
  };

  const handleTriggerDownload = (doc: DocumentItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const perm = verifyPermission(currentUser, 'document', doc.id, doc.departmentId, 'DOWNLOAD_DOCUMENT', doc.folderId);
    if (!perm.allowed) {
      onAccessDenied(
        perm.reason || `Acesso negado: A permissão de download para o arquivo ${doc.name} foi revogada pelo Gestor.`,
        doc.name
      );
      return;
    }
    onDownloadDocument(doc);
  };

  // Drag and Drop Handlers
  const handleDragStartDocument = (e: React.DragEvent, doc: DocumentItem) => {
    const data = { type: 'document' as const, id: doc.id, name: doc.name };
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
    setDraggingEntity(data);
  };

  const handleDragStartFolder = (e: React.DragEvent, folder: Folder) => {
    const data = { type: 'folder' as const, id: folder.id, name: folder.name };
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
    setDraggingEntity(data);
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleDragLeaveFolder = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    setDraggingEntity(null);

    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw) as { type: 'document' | 'folder'; id: string; name: string };

      if (data.type === 'document') {
        if (onMoveDocument) {
          onMoveDocument(data.id, targetFolder.id);
        }
      } else if (data.type === 'folder') {
        if (data.id !== targetFolder.id && onMoveFolder) {
          onMoveFolder(data.id, targetFolder.id);
        }
      }
    } catch (err) {
      console.warn('[Drag Drop Error]', err);
    }
  };

  // Context Menu Handlers
  const handleFolderContextMenu = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFolderId(folder.id);

    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);

    setContextMenu({
      isOpen: true,
      x,
      y,
      type: 'folder',
      folder,
    });
  };

  const handleBlankAreaContextMenu = (e: React.MouseEvent) => {
    // Only open if inside department view
    if (isAtRoot) return;
    e.preventDefault();

    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 180);

    setContextMenu({
      isOpen: true,
      x,
      y,
      type: 'blank',
    });
  };

  const handleDeleteFolderConfirmed = () => {
    if (deleteConfirmFolder && onDeleteFolder) {
      onDeleteFolder(deleteConfirmFolder.id);
      setDeleteConfirmFolder(null);
      if (selectedFolderId === deleteConfirmFolder.id) {
        setSelectedFolderId(null);
      }
    }
  };

  const getFileIcon = (ext: string) => {
    switch (ext) {
      case 'xlsx':
      case 'csv':
        return (
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        );
      case 'pdf':
        return (
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
      case 'docx':
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <FileCode className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div
      ref={explorerRef}
      onContextMenu={handleBlankAreaContextMenu}
      className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none min-h-[600px] relative"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Meus Documentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acesse, organize e gerencie pastas e documentos empresariais com controle de permissões.
          </p>
        </div>

        {/* Action Buttons & View Mode Toggles */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* If inside a folder and user has permission to manage, show Folder Settings button */}
          {currentFolder && canManageFolderPermissions && (
            <button
              type="button"
              onClick={() => handleOpenFolderConfig(currentFolder)}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
              <span>Propriedades da Pasta</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenUploadModal(currentDeptId || undefined, currentFolderId || undefined)}
            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Documento</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenCreateFolderModal(currentDeptId || undefined, currentFolderId || undefined)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-blue-600" />
            <span>Nova Pasta</span>
          </button>

          {/* Grid / List view toggle icons */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-100 text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-slate-100 text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Visualização em Lista"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Trail Explorer Bar */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-4 py-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
        <button
          type="button"
          onClick={() => {
            setCurrentDeptId(null);
            setCurrentFolderId(null);
            setSelectedFolderId(null);
          }}
          className={`hover:text-blue-600 transition-colors inline-flex items-center gap-1 cursor-pointer ${
            isAtRoot ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <span>🏠 Início</span>
        </button>

        {currentDepartment && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <button
              type="button"
              onClick={() => {
                setCurrentFolderId(null);
                setSelectedFolderId(null);
              }}
              className={`hover:text-blue-600 transition-colors cursor-pointer ${
                !currentFolderId ? 'text-blue-600 font-semibold' : 'text-slate-500'
              }`}
            >
              {currentDepartment.name}
            </button>
          </>
        )}

        {currentFolder && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-blue-600 font-semibold">{currentFolder.name}</span>
          </>
        )}

        {/* Interactive Helper Hint */}
        {!isAtRoot && (
          <span className="ml-auto text-[11px] text-slate-400 hidden sm:inline-flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Duplo clique ou 1 clique + Enter abre a pasta • Botão direito para opções</span>
          </span>
        )}
      </div>

      {/* Main Grid / Split Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Explorer Column */}
        <div className="lg:col-span-8 space-y-4">
          {/* Department Banner Header */}
          {currentDepartment && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shadow-xs">
                    <FolderIcon className="w-7 h-7 fill-amber-400 text-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{currentDepartment.name}</h2>
                      {currentDepartment.isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <p className="text-xs text-slate-500">
                      {currentDepartment.itemCount} itens • Gestor: {currentDepartment.managerName || 'Diretoria'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setActiveDepartmentTab('arquivos')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        activeDepartmentTab === 'arquivos'
                          ? 'bg-white text-blue-600 shadow-xs font-semibold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Arquivos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDepartmentTab('permissoes')}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        activeDepartmentTab === 'permissoes'
                          ? 'bg-white text-blue-600 shadow-xs font-semibold'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Permissões
                    </button>
                  </div>
                </div>
              </div>

              {activeDepartmentTab === 'permissoes' && (
                <div className="mt-3 p-4 bg-blue-50/60 rounded-xl border border-blue-100 text-xs text-blue-900 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span>Políticas de Acesso do Setor {currentDepartment.name}</span>
                    </div>
                    {canManageFolderPermissions && (
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Você é o Gestor Deste Setor
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    O Gestor de Área tem autoridade para conceder ou revogar o acesso de cada colaborador às pastas do setor, bem como proibir o download de cópias e restringir edições conforme as regras de segurança corporativa.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Root View: Grid or List of Departments */}
          {isAtRoot &&
            (viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {visibleDepartments.map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => handleOpenDepartment(dept)}
                    className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all text-center flex flex-col items-center justify-between group cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-amber-50/80 flex items-center justify-center text-amber-500 mb-3 group-hover:scale-110 transition-transform">
                      <FolderIcon className="w-8 h-8 fill-amber-400 text-amber-500 drop-shadow-xs" />
                    </div>

                    <div className="flex items-center gap-1 justify-center">
                      <h3 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate max-w-[120px]">
                        {dept.name}
                      </h3>
                      {dept.isLocked && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                    </div>

                    <span className="text-[11px] text-slate-400 mt-1">{dept.itemCount} itens</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Root List View Table */
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60 font-semibold">
                      <th className="py-3.5 px-4 font-medium">Nome do Setor</th>
                      <th className="py-3.5 px-4 font-medium">Itens</th>
                      <th className="py-3.5 px-4 font-medium">Gestor Responsável</th>
                      <th className="py-3.5 px-4 font-medium">Armazenamento</th>
                      <th className="py-3.5 px-4 font-medium">Segurança</th>
                      <th className="py-3.5 px-4 font-medium text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {visibleDepartments.map((dept) => {
                      const usedGb = (dept.storageUsedBytes / (1024 * 1024 * 1024)).toFixed(0);
                      const limitGb = (dept.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
                      return (
                        <tr
                          key={dept.id}
                          onClick={() => handleOpenDepartment(dept)}
                          className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                <FolderIcon className="w-5 h-5 fill-amber-400 text-amber-500" />
                              </div>
                              <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                {dept.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500 tabular-nums font-medium">
                            {dept.itemCount} itens
                          </td>
                          <td className="py-3 px-4 text-slate-700">{dept.managerName || 'Diretoria'}</td>
                          <td className="py-3 px-4 text-slate-500 tabular-nums">
                            {usedGb} GB / {limitGb} GB
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                              {dept.isLocked ? (
                                <>
                                  <Lock className="w-3 h-3 text-blue-600" />
                                  <span>RBAC Ativo</span>
                                </>
                              ) : (
                                <span>Público</span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-blue-600 font-semibold text-xs group-hover:underline inline-flex items-center gap-0.5">
                              Abrir <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

          {/* Subfolders Grid / List when inside a Department */}
          {!isAtRoot && (
            <div className="space-y-4">
              {viewMode === 'grid' ? (
                <>
                  {/* Subfolders grid */}
                  {currentFolders.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Pastas ({currentFolders.length})</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          Arraste e solte arquivos ou pastas para organizar
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {currentFolders.map((folder) => {
                          const isSelected = selectedFolderId === folder.id;
                          const isDragOver = dragOverFolderId === folder.id;

                          return (
                            <div
                              key={folder.id}
                              tabIndex={0}
                              draggable={true}
                              onDragStart={(e) => handleDragStartFolder(e, folder)}
                              onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                              onDragLeave={handleDragLeaveFolder}
                              onDrop={(e) => handleDropOnFolder(e, folder)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFolderId(folder.id);
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleOpenFolder(folder);
                              }}
                              onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                              className={`p-4 rounded-xl border transition-all text-left flex items-start justify-between group cursor-pointer relative ${
                                isDragOver
                                  ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/50 scale-[1.02] shadow-md'
                                  : isSelected
                                  ? 'bg-blue-50/40 border-blue-400 ring-2 ring-blue-500/40 shadow-xs'
                                  : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-xs'
                              }`}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <FolderIcon className="w-5 h-5 fill-amber-400 text-amber-500" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">
                                      {folder.name}
                                    </h4>
                                    {folder.isLocked && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {folder.itemCount} itens • {folder.updatedAt}
                                  </p>
                                </div>
                              </div>

                              {/* Folder settings trigger for managers */}
                              {canManageFolderPermissions && (
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenFolderConfig(folder, e)}
                                  title="Propriedades e Permissões"
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isDragOver && (
                                <div className="absolute inset-0 bg-blue-600/10 rounded-xl pointer-events-none flex items-center justify-center">
                                  <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold shadow-xs">
                                    Soltar para mover
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Documents Grid */}
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Documentos & Arquivos ({currentDocs.length})
                    </div>

                    {currentDocs.length === 0 ? (
                      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs">Nenhum documento encontrado nesta pasta.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {currentDocs.map((doc) => {
                          const canDownload = verifyPermission(
                            currentUser,
                            'document',
                            doc.id,
                            doc.departmentId,
                            'DOWNLOAD_DOCUMENT',
                            doc.folderId
                          ).allowed;

                          return (
                            <div
                              key={doc.id}
                              draggable={true}
                              onDragStart={(e) => handleDragStartDocument(e, doc)}
                              onClick={() => handleOpenDocument(doc)}
                              className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-between cursor-grab active:cursor-grabbing group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {getFileIcon(doc.extension)}
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                                    {doc.name}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {(doc.sizeBytes / 1024).toFixed(0)} KB • {doc.updatedAt}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => onToggleFavorite(doc.id)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    doc.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'
                                  }`}
                                  title="Favoritar"
                                >
                                  <Star className={`w-4 h-4 ${doc.isFavorite ? 'fill-amber-400' : ''}`} />
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleTriggerDownload(doc, e)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    canDownload
                                      ? 'hover:bg-slate-100 text-slate-400 hover:text-blue-600'
                                      : 'text-slate-200 hover:text-rose-500'
                                  }`}
                                  title={canDownload ? 'Baixar Documento' : 'Download Bloqueado (Sem Permissão)'}
                                >
                                  <Download className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenDocument(doc)}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                                  title="Visualizar"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Enhanced Unified Windows Explorer List View Table */
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60 font-semibold">
                        <th className="py-3 px-4 font-medium">Nome</th>
                        <th className="py-3 px-4 font-medium">Tipo</th>
                        <th className="py-3 px-4 font-medium">Tamanho</th>
                        <th className="py-3 px-4 font-medium">Última Modificação</th>
                        <th className="py-3 px-4 font-medium">Proprietário</th>
                        <th className="py-3 px-4 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {/* Subfolders in List Table */}
                      {currentFolders.map((folder) => {
                        const isSelected = selectedFolderId === folder.id;
                        const isDragOver = dragOverFolderId === folder.id;

                        return (
                          <tr
                            key={folder.id}
                            tabIndex={0}
                            draggable={true}
                            onDragStart={(e) => handleDragStartFolder(e, folder)}
                            onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                            onDragLeave={handleDragLeaveFolder}
                            onDrop={(e) => handleDropOnFolder(e, folder)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFolderId(folder.id);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleOpenFolder(folder);
                            }}
                            onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                            className={`transition-colors cursor-pointer group ${
                              isDragOver
                                ? 'bg-blue-100/70 border-y-2 border-blue-500'
                                : isSelected
                                ? 'bg-blue-50/60 font-semibold'
                                : 'hover:bg-blue-50/30'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                  <FolderIcon className="w-4 h-4 fill-amber-400 text-amber-500" />
                                </div>
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                  {folder.name}
                                </span>
                                {folder.isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-500">Pasta de arquivos</td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums">{folder.itemCount} itens</td>
                            <td className="py-3 px-4 text-slate-500">{folder.updatedAt}</td>
                            <td className="py-3 px-4 text-slate-600">{currentDepartment?.managerName || 'Setor'}</td>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                {canManageFolderPermissions && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleOpenFolderConfig(folder, e)}
                                    className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-amber-50 hover:text-amber-800 rounded-lg text-slate-600 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Propriedades e Permissões"
                                  >
                                    <SlidersHorizontal className="w-3 h-3" />
                                    <span>Propriedades</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenFolder(folder)}
                                  className="text-blue-600 font-semibold hover:underline cursor-pointer"
                                >
                                  Abrir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Documents in List Table */}
                      {currentDocs.map((doc) => {
                        const canDownload = verifyPermission(
                          currentUser,
                          'document',
                          doc.id,
                          doc.departmentId,
                          'DOWNLOAD_DOCUMENT',
                          doc.folderId
                        ).allowed;

                        return (
                          <tr
                            key={doc.id}
                            draggable={true}
                            onDragStart={(e) => handleDragStartDocument(e, doc)}
                            onClick={() => handleOpenDocument(doc)}
                            className="hover:bg-blue-50/30 transition-colors cursor-grab active:cursor-grabbing group"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                {getFileIcon(doc.extension)}
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                  {doc.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-500 uppercase font-mono text-[11px]">
                              {doc.extension} (v{doc.currentVersion}.0)
                            </td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums">
                              {(doc.sizeBytes / 1024).toFixed(0)} KB
                            </td>
                            <td className="py-3 px-4 text-slate-500">{doc.updatedAt}</td>
                            <td className="py-3 px-4 text-slate-600">{doc.ownerName}</td>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onToggleFavorite(doc.id)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    doc.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'
                                  }`}
                                  title="Favoritar"
                                >
                                  <Star className={`w-3.5 h-3.5 ${doc.isFavorite ? 'fill-amber-400' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleTriggerDownload(doc, e)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    canDownload
                                      ? 'hover:bg-slate-100 text-slate-400 hover:text-blue-600'
                                      : 'text-slate-200'
                                  }`}
                                  title="Download"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDocument(doc)}
                                  className="text-blue-600 font-semibold hover:underline cursor-pointer ml-1"
                                >
                                  Visualizar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Quick Access & Info */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Acesso Rápido
            </h2>

            <div className="mt-3 space-y-1">
              <button
                type="button"
                onClick={() => {
                  const recent = documents[0];
                  if (recent) handleOpenDocument(recent);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Documentos Recentes</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const fav = documents.find((d) => d.isFavorite);
                  if (fav) handleOpenDocument(fav);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">Favoritos</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const shared = documents.find((d) => d.isShared);
                  if (shared) handleOpenDocument(shared);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Compartilhados comigo</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          {/* Card 2: Meu Setor */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">Meu Setor</h2>
            <div className="mt-3 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  {currentUser.departmentName || 'Geral'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {currentUser.role === 'MANAGER' ? 'Gestor da área' : 'Colaborador'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING CONTEXT MENU */}
      {contextMenu.isOpen && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-52 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100"
        >
          {contextMenu.type === 'folder' && contextMenu.folder ? (
            /* CONTEXT MENU ON TOP OF A FOLDER */
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate border-b border-slate-100">
                📁 {contextMenu.folder.name}
              </div>

              <button
                type="button"
                onClick={() => {
                  handleOpenFolder(contextMenu.folder!);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Abrir Pasta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenCreateFolderModal(contextMenu.folder!.departmentId, contextMenu.folder!.id);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-emerald-600" />
                <span>Nova Subpasta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode(viewMode === 'grid' ? 'list' : 'grid');
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                {viewMode === 'grid' ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                <span>{viewMode === 'grid' ? 'Modo Lista' : 'Modo Grade'}</span>
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmFolder(contextMenu.folder!);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Pasta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleOpenFolderConfig(contextMenu.folder!);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-amber-50 text-amber-800 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                <span className="font-semibold">Propriedades & Acessos</span>
              </button>
            </>
          ) : (
            /* CONTEXT MENU OUTSIDE A FOLDER (BLANK AREA) */
            <>
              <button
                type="button"
                onClick={() => {
                  onOpenCreateFolderModal(currentDeptId || undefined, currentFolderId || undefined);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Nova Pasta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode(viewMode === 'grid' ? 'list' : 'grid');
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                {viewMode === 'grid' ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                <span>Alternar Visualização ({viewMode === 'grid' ? 'Lista' : 'Grade'})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId(null);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer text-slate-500"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Atualizar Conteúdo</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* DELETE FOLDER CONFIRMATION MODAL */}
      {deleteConfirmFolder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Excluir Pasta?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tem certeza que deseja excluir permanentemente a pasta <strong>{deleteConfirmFolder.name}</strong>?
                Os arquivos e subitens vinculados a ela serão removidos.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFolder(null)}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteFolderConfirmed}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-md shadow-rose-600/20"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Configuration Modal (Propriedades & Configuração de quem pode acessar) */}
      <FolderConfigModal
        isOpen={configFolderModalData.isOpen}
        onClose={() => setConfigFolderModalData({ isOpen: false, folder: null })}
        folder={configFolderModalData.folder}
        department={departments.find((d) => d.id === configFolderModalData.folder?.departmentId)}
        collaborators={users.filter(
          (u) => u.departmentId === configFolderModalData.folder?.departmentId && u.role === 'EMPLOYEE'
        )}
        currentUser={currentUser}
        onSavePermissions={onUpdateUserPermissions}
        onUpdateFolder={onUpdateFolder}
      />
    </div>
  );
};
