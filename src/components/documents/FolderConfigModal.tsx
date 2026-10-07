import React, { useState } from 'react';
import {
  Folder,
  X,
  Lock,
  Unlock,
  ShieldCheck,
  Users,
  Check,
  Save,
  Download,
  Eye,
  Upload,
  FileText,
  Trash2,
  Edit2,
  CheckSquare,
  Square,
  Search,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Folder as FolderType, User, PermissionType, Department } from '../../types';
import { Avatar } from '../common/Avatar';

interface FolderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: FolderType | null;
  department?: Department;
  collaborators: User[];
  currentUser: User;
  onSavePermissions: (userId: string, folderId: string, perms: PermissionType[]) => void;
  onUpdateFolder?: (folderId: string, updates: Partial<FolderType>) => void;
}

const FOLDER_PERMISSIONS_OPTIONS: { id: PermissionType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'VIEW_FOLDER',
    label: 'Visualizar Pasta',
    desc: 'Exibir a pasta na listagem e na árvore do explorador.',
    icon: <Folder className="w-3.5 h-3.5 text-blue-500" />,
  },
  {
    id: 'LIST_FILES',
    label: 'Listar Conteúdo',
    desc: 'Consultar a lista de arquivos e subitens contidos.',
    icon: <FileText className="w-3.5 h-3.5 text-slate-500" />,
  },
  {
    id: 'VIEW_DOCUMENT',
    label: 'Visualizar Documentos',
    desc: 'Abrir e ler os arquivos no visualizador online.',
    icon: <Eye className="w-3.5 h-3.5 text-indigo-500" />,
  },
  {
    id: 'DOWNLOAD_DOCUMENT',
    label: 'Baixar Cópia (Download)',
    desc: 'Fazer download de cópias locais dos documentos criptografados.',
    icon: <Download className="w-3.5 h-3.5 text-amber-500" />,
  },
  {
    id: 'UPLOAD_DOCUMENT',
    label: 'Enviar Documentos (Upload)',
    desc: 'Fazer upload de novos documentos e arquivos nesta pasta.',
    icon: <Upload className="w-3.5 h-3.5 text-emerald-500" />,
  },
  {
    id: 'EDIT_DOCUMENT',
    label: 'Editar Metadados & Versões',
    desc: 'Criar novas versões de arquivos e renomear metadados.',
    icon: <Edit2 className="w-3.5 h-3.5 text-sky-500" />,
  },
  {
    id: 'DELETE_DOCUMENT',
    label: 'Excluir Documentos',
    desc: 'Excluir ou mover arquivos para a lixeira.',
    icon: <Trash2 className="w-3.5 h-3.5 text-rose-500" />,
  },
];

export const FolderConfigModal: React.FC<FolderConfigModalProps> = ({
  isOpen,
  onClose,
  folder,
  department,
  collaborators,
  currentUser,
  onSavePermissions,
  onUpdateFolder,
}) => {
  const [activeTab, setActiveTab] = useState<'permissoes' | 'geral'>('permissoes');
  const [searchUserTerm, setSearchUserTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Local state for permissions matrix mapped by userId
  const [userPermsMap, setUserPermsMap] = useState<Record<string, PermissionType[]>>({});
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Initialize state when folder changes
  React.useEffect(() => {
    if (folder) {
      setFolderName(folder.name);
      setFolderDesc(folder.description || '');
      setIsLocked(folder.isLocked);

      // Initialize map from current user permissions
      const initialMap: Record<string, PermissionType[]> = {};
      collaborators.forEach((u) => {
        if (u.granularPermissions && u.granularPermissions[folder.id] !== undefined) {
          initialMap[u.id] = [...u.granularPermissions[folder.id]];
        } else if (u.permittedFolderIds?.includes(folder.id)) {
          initialMap[u.id] = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT'];
        } else {
          initialMap[u.id] = [];
        }
      });
      setUserPermsMap(initialMap);

      if (collaborators.length > 0 && !selectedUser) {
        setSelectedUser(collaborators[0]);
      }
    }
  }, [folder, collaborators]);

  if (!isOpen || !folder) return null;

  // Filter department collaborators
  const filteredUsers = collaborators.filter((u) => {
    if (!searchUserTerm) return true;
    return (
      u.name.toLowerCase().includes(searchUserTerm.toLowerCase()) ||
      u.cargo?.toLowerCase().includes(searchUserTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUserTerm.toLowerCase())
    );
  });

  const activeSelectedUser = selectedUser || filteredUsers[0] || null;
  const currentPerms = activeSelectedUser ? userPermsMap[activeSelectedUser.id] || [] : [];
  const hasAccess = currentPerms.length > 0;

  const handleTogglePermission = (permId: PermissionType) => {
    if (!activeSelectedUser) return;
    const prev = userPermsMap[activeSelectedUser.id] || [];
    let updated: PermissionType[];
    if (prev.includes(permId)) {
      updated = prev.filter((p) => p !== permId);
    } else {
      updated = [...prev, permId];
    }

    setUserPermsMap((old) => ({
      ...old,
      [activeSelectedUser.id]: updated,
    }));
  };

  const handleApplyPreset = (type: 'full' | 'readonly' | 'read_download' | 'block') => {
    if (!activeSelectedUser) return;
    let newPerms: PermissionType[] = [];
    if (type === 'full') {
      newPerms = [
        'VIEW_FOLDER',
        'LIST_FILES',
        'VIEW_DOCUMENT',
        'DOWNLOAD_DOCUMENT',
        'UPLOAD_DOCUMENT',
        'EDIT_DOCUMENT',
        'DELETE_DOCUMENT',
      ];
    } else if (type === 'read_download') {
      newPerms = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT'];
    } else if (type === 'readonly') {
      newPerms = ['VIEW_FOLDER', 'LIST_FILES', 'VIEW_DOCUMENT']; // NO DOWNLOAD
    } else if (type === 'block') {
      newPerms = [];
    }

    setUserPermsMap((old) => ({
      ...old,
      [activeSelectedUser.id]: newPerms,
    }));
  };

  const handleSaveForSelected = () => {
    if (!activeSelectedUser || !folder) return;
    const perms = userPermsMap[activeSelectedUser.id] || [];
    onSavePermissions(activeSelectedUser.id, folder.id, perms);

    setSaveSuccessMsg(`Permissões salvas para ${activeSelectedUser.name}!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleSaveAll = () => {
    if (!folder) return;
    collaborators.forEach((u) => {
      const perms = userPermsMap[u.id] || [];
      onSavePermissions(u.id, folder.id, perms);
    });

    if (onUpdateFolder) {
      onUpdateFolder(folder.id, {
        name: folderName,
        description: folderDesc,
        isLocked,
      });
    }

    setSaveSuccessMsg('Todas as permissões e configurações foram aplicadas!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 fill-amber-400 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Configurações da Pasta</h3>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md">
                  {folder.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Setor: <strong>{department?.name || folder.departmentName}</strong> • Gestão de Acesso dos Colaboradores
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('permissoes')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  activeTab === 'permissoes' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Permissão de Colaboradores
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('geral')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  activeTab === 'geral' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Detalhes da Pasta
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {saveSuccessMsg && (
          <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-2.5 text-xs text-emerald-800 font-medium flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveSuccessMsg}</span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          {activeTab === 'permissoes' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Collaborators of this Area */}
              <div className="md:col-span-5 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Colaboradores do Setor</span>
                    <span className="text-[10px] text-slate-400">Selecione para configurar</span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                    {filteredUsers.length} membros
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchUserTerm}
                    onChange={(e) => setSearchUserTerm(e.target.value)}
                    placeholder="Filtrar colaborador..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Users List */}
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filteredUsers.map((user) => {
                    const uPerms = userPermsMap[user.id] || [];
                    const isAllowed = uPerms.length > 0;
                    const isSelected = activeSelectedUser?.id === user.id;
                    const canDownload = uPerms.includes('DOWNLOAD_DOCUMENT');

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border border-blue-200 text-blue-950 shadow-2xs'
                            : 'hover:bg-slate-50 border border-transparent text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Avatar name={user.name} avatarUrl={user.avatar} size="xs" />
                          <div className="truncate">
                            <span className="text-xs font-bold block truncate">{user.name}</span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {user.cargo || 'Colaborador'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isAllowed ? (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                canDownload
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                              title={canDownload ? 'Acesso com Download' : 'Apenas Leitura (Sem Download)'}
                            >
                              {canDownload ? 'Download ON' : 'Sem Download'}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                              Sem Acesso
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Detailed Granular Permissions for Selected User */}
              <div className="md:col-span-7 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                {activeSelectedUser ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={activeSelectedUser.name} avatarUrl={activeSelectedUser.avatar} size="sm" />
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{activeSelectedUser.name}</h4>
                          <span className="text-[11px] text-slate-400">
                            {activeSelectedUser.cargo} • {activeSelectedUser.email}
                          </span>
                        </div>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('readonly')}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-semibold rounded-lg transition-colors"
                          title="Permite apenas ver e ler, SEM download de cópias"
                        >
                          Sem Download
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('read_download')}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-lg transition-colors"
                        >
                          Leitura + Download
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('full')}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg transition-colors"
                        >
                          Total
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset('block')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-semibold rounded-lg transition-colors"
                        >
                          Bloquear
                        </button>
                      </div>
                    </div>

                    {/* Permissions Checkbox Grid */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Permissões nesta pasta:
                      </span>

                      <div className="space-y-1.5">
                        {FOLDER_PERMISSIONS_OPTIONS.map((opt) => {
                          const isChecked = currentPerms.includes(opt.id);

                          return (
                            <div
                              key={opt.id}
                              onClick={() => handleTogglePermission(opt.id)}
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                                isChecked
                                  ? opt.id === 'DOWNLOAD_DOCUMENT'
                                    ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                                    : 'bg-blue-50/50 border-blue-200 text-blue-950'
                                  : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-50 text-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="mt-0.5">
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    {opt.icon}
                                    <span className={`text-xs font-bold ${isChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                                      {opt.label}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                                    {opt.desc}
                                  </span>
                                </div>
                              </div>

                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isChecked ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {isChecked ? 'Liberado' : 'Revogado'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Single User Save Button */}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveForSelected}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar para {activeSelectedUser.name.split(' ')[0]}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Selecione um colaborador na lista ao lado para ajustar permissões.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Tab: Detalhes Gerais da Pasta */
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 max-w-xl mx-auto">
              <h4 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                Propriedades da Pasta
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nome da Pasta</label>
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Descrição & Finalidade</label>
                  <textarea
                    rows={3}
                    value={folderDesc}
                    onChange={(e) => setFolderDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-800 block">Exigir Controle RBAC Estrito</span>
                    <span className="text-[11px] text-slate-500">
                      Bloqueia acesso a qualquer usuário fora da matriz explícita de permissões.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLocked(!isLocked)}
                    className={`p-2 rounded-xl border transition-colors ${
                      isLocked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Alterações são aplicadas em tempo real e registradas na auditoria imutável.
          </span>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Todas as Configurações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
