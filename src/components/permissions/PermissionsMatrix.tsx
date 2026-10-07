import React, { useState } from 'react';
import {
  ShieldCheck,
  Folder,
  User as UserIcon,
  Check,
  Save,
  CheckSquare,
  Square,
  Lock,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { User, Folder as FolderType, PermissionType } from '../../types';
import { ALL_PERMISSIONS } from '../../services/dataStore';
import { Avatar } from '../common/Avatar';

interface PermissionsMatrixProps {
  currentUser: User;
  users: User[];
  folders: FolderType[];
  onUpdateUserPermissions: (userId: string, folderId: string, permissions: PermissionType[]) => void;
}

export const PermissionsMatrix: React.FC<PermissionsMatrixProps> = ({
  currentUser,
  users,
  folders,
  onUpdateUserPermissions,
}) => {
  // Select first employee or manager's subordinate
  const availableUsers = users.filter((u) => {
    if (currentUser.role === 'MANAGER') {
      return u.departmentId === currentUser.departmentId;
    }
    return u.role === 'EMPLOYEE' || u.role === 'MANAGER';
  });

  const [selectedUserId, setSelectedUserId] = useState<string>(availableUsers[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(folders[0]?.id || '');
  const [localPermissions, setLocalPermissions] = useState<Record<string, PermissionType[]>>({});
  const [isSaved, setIsSaved] = useState(false);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // Available folders filtered for manager
  const availableFolders = folders.filter((f) => {
    if (currentUser.role === 'MANAGER') {
      return f.departmentId === currentUser.departmentId;
    }
    return true;
  });

  // Current active permissions for this user on this folder
  const currentFolderPerms: PermissionType[] =
    localPermissions[selectedFolderId] !== undefined
      ? localPermissions[selectedFolderId]
      : selectedUser?.granularPermissions[selectedFolderId] !== undefined
      ? selectedUser.granularPermissions[selectedFolderId]
      : selectedUser?.permittedFolderIds.includes(selectedFolderId)
      ? (['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT'] as PermissionType[])
      : [];

  const handleTogglePermission = (perm: PermissionType) => {
    setIsSaved(false);
    let updated: PermissionType[];
    if (currentFolderPerms.includes(perm)) {
      updated = currentFolderPerms.filter((p) => p !== perm);
    } else {
      updated = [...currentFolderPerms, perm];
    }

    setLocalPermissions((prev) => ({
      ...prev,
      [selectedFolderId]: updated,
    }));
  };

  const handleSave = () => {
    if (!selectedUserId || !selectedFolderId) return;
    onUpdateUserPermissions(selectedUserId, selectedFolderId, currentFolderPerms);
    setLocalPermissions((prev) => ({
      ...prev,
      [selectedFolderId]: currentFolderPerms,
    }));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const permissionLabels: Record<PermissionType, { label: string; desc: string }> = {
    VIEW_FOLDER: { label: 'Visualizar Pasta', desc: 'Permite enxergar a existência da pasta na árvore' },
    LIST_FILES: { label: 'Listar Arquivos', desc: 'Permite consultar o conteúdo e metadados' },
    VIEW_DOCUMENT: { label: 'Visualizar Documento', desc: 'Permite abrir no leitor de documentos' },
    DOWNLOAD_DOCUMENT: { label: 'Baixar Documento', desc: 'Permite download da cópia criptografada' },
    UPLOAD_DOCUMENT: { label: 'Enviar Documento', desc: 'Permite novos uploads nesta pasta' },
    EDIT_DOCUMENT: { label: 'Editar Metadados', desc: 'Permite criar novas versões e renomear' },
    DELETE_DOCUMENT: { label: 'Excluir Documento', desc: 'Permite mover arquivos para a lixeira' },
    CREATE_FOLDER: { label: 'Criar Subpastas', desc: 'Permite criar novos diretórios internos' },
    DELETE_FOLDER: { label: 'Excluir Pasta', desc: 'Permite exclusão de diretórios vazios' },
    MOVE_DOCUMENT: { label: 'Mover Documentos', desc: 'Permite alterar a localização de arquivos' },
    RENAME_DOCUMENT: { label: 'Renomear', desc: 'Permite alterar títulos e extensões' },
    SHARE_DOCUMENT: { label: 'Compartilhar', desc: 'Permite gerar links de acesso seguro' },
    MANAGE_PERMISSIONS: { label: 'Gerenciar Permissões', desc: 'Permite delegar acessos (Gestores)' },
    MANAGE_USERS: { label: 'Gerenciar Usuários', desc: 'Permite cadastrar e bloquear contas' },
    MANAGE_DEVICES: { label: 'Gerenciar Dispositivos', desc: 'Permite aprovar e revogar terminais' },
    VIEW_AUDIT: { label: 'Consultar Auditoria', desc: 'Permite visualizar logs de acesso e hashes' },
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Matriz de Permissões Granulares (RBAC)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Defina o que cada usuário pode visualizar, baixar, enviar ou excluir em cada pasta.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaved ? 'Permissões Salvas!' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {/* Selector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* User Selection Sidebar */}
        <div className="md:col-span-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900">1. Selecione o Colaborador</span>
            <span className="text-[11px] text-slate-400">{availableUsers.length} usuários</span>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {availableUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelectedUserId(u.id);
                  setLocalPermissions({});
                  setIsSaved(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                  selectedUserId === u.id
                    ? 'bg-blue-50 border border-blue-200 text-blue-900'
                    : 'hover:bg-slate-50 border border-transparent text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Avatar name={u.name} avatarUrl={u.avatar} size="xs" />
                  <div className="truncate">
                    <span className="text-xs font-bold block truncate">{u.name}</span>
                    <span className="text-[10px] text-slate-400 block truncate">{u.departmentName} • {u.cargo}</span>
                  </div>
                </div>
                {selectedUserId === u.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Folder Selection & Permissions Checkboxes */}
        <div className="md:col-span-8 space-y-4">
          {/* Folder tabs */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <span className="text-xs font-bold text-slate-900 block pb-1 border-b border-slate-100">
              2. Selecione a Pasta Corporativa
            </span>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {availableFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(f.id);
                    setIsSaved(false);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                    selectedFolderId === f.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{f.name}</span>
                  {f.isLocked && <Lock className="w-3 h-3 opacity-60" />}
                </button>
              ))}
            </div>
          </div>

          {/* Granular Matrix Cards */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Permissões de {selectedUser?.name} na pasta "{selectedFolder?.name}"
                </h3>
                <p className="text-xs text-slate-500">
                  Validação estrita no backend: tentativas não autorizadas são barradas com HTTP 403.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocalPermissions((prev) => ({
                      ...prev,
                      [selectedFolderId]: ALL_PERMISSIONS.slice(0, 4), // Read-only baseline
                    }));
                  }}
                  className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
                >
                  Somente Leitura
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalPermissions((prev) => ({
                      ...prev,
                      [selectedFolderId]: ALL_PERMISSIONS, // Full
                    }));
                  }}
                  className="px-2.5 py-1 text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors font-medium"
                >
                  Controle Total
                </button>
              </div>
            </div>

            {/* Checkbox grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_PERMISSIONS.map((perm) => {
                const isChecked = currentFolderPerms.includes(perm);
                const info = permissionLabels[perm] || { label: perm, desc: '' };

                return (
                  <div
                    key={perm}
                    onClick={() => handleTogglePermission(perm)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      isChecked
                        ? 'bg-blue-50/50 border-blue-200 shadow-2xs'
                        : 'bg-slate-50/40 border-slate-200/70 hover:bg-slate-50'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-bold block ${isChecked ? 'text-blue-950' : 'text-slate-800'}`}>
                        {info.label}
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                        {info.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
