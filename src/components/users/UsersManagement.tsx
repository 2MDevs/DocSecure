import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Unlock,
  KeyRound,
  MoreVertical,
  Building,
  Smartphone,
  AlertCircle,
  X,
  Mail,
  Copy,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { User, UserRole, UserStatus, Department } from '../../types';
import { Avatar } from '../common/Avatar';

export interface UserAccessResult {
  emailSent: boolean;
  temporaryPassword?: string;
}

interface UsersManagementProps {
  currentUser: User;
  users: User[];
  departments: Department[];
  onCreateUser: (userData: Partial<User>) => Promise<UserAccessResult>;
  onResendAccess: (userId: string) => Promise<UserAccessResult>;
  onUpdateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onToggleUserStatus: (userId: string) => void;
  onReset2FA: (userId: string) => void;
}

export const UsersManagement: React.FC<UsersManagementProps> = ({
  currentUser,
  users,
  departments,
  onCreateUser,
  onResendAccess,
  onUpdateUser,
  onDeleteUser,
  onToggleUserStatus,
  onReset2FA,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states for creating a new user
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('EMPLOYEE');
  const [newDeptId, setNewDeptId] = useState<string>(departments[0]?.id || '');
  const [newCargo, setNewCargo] = useState('');
  const [require2FA, setRequire2FA] = useState(true);

  // Envio de credenciais (cadastro / reenvio de acesso)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [accessResult, setAccessResult] = useState<
    (UserAccessResult & { name: string; email: string; isResend: boolean }) | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Edição de usuário (nome, e-mail, matrícula, cargo/função, perfil e setor)
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMatricula, setEditMatricula] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('EMPLOYEE');
  const [editDeptId, setEditDeptId] = useState('');
  const [editDirectorAccess, setEditDirectorAccess] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canEditUsers = currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR';
  // Diretor também abre o desenvolvedor (para conceder o acesso de diretoria)
  const canEditTarget = (u: User) => canEditUsers && (u.role !== 'DEVELOPER' || currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR');
  // Perfil não pode ser alterado para desenvolvedores (definido no .env) nem para o próprio usuário logado
  const canChangeRole = (u: User) => u.role !== 'DEVELOPER' && u.id !== currentUser.id;

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditMatricula(u.matricula || '');
    setEditCargo(u.cargo || '');
    setEditRole(u.role);
    setEditDeptId(u.departmentId || departments[0]?.id || '');
    setEditDirectorAccess(Boolean(u.directorAccess));
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || isSavingEdit) return;
    if (!editName.trim() || !editEmail.trim()) {
      setEditError('Nome e e-mail são obrigatórios.');
      return;
    }

    const updates: Partial<User> = {};
    if (editName.trim() !== editingUser.name) updates.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== editingUser.email.toLowerCase()) updates.email = editEmail.trim().toLowerCase();
    if (editMatricula.trim() !== (editingUser.matricula || '')) updates.matricula = editMatricula.trim();
    if (editCargo.trim() !== (editingUser.cargo || '')) updates.cargo = editCargo.trim();
    if (canChangeRole(editingUser) && editRole !== editingUser.role) updates.role = editRole;
    if (editDeptId && editDeptId !== editingUser.departmentId) {
      updates.departmentId = editDeptId;
      updates.departmentName = departments.find((d) => d.id === editDeptId)?.name || editingUser.departmentName;
    }

    if (currentUser.role === 'DIRECTOR' && editDirectorAccess !== Boolean(editingUser.directorAccess)) {
      updates.directorAccess = editDirectorAccess;
    }

    if (Object.keys(updates).length === 0) {
      setEditingUser(null);
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);
      await onUpdateUser(editingUser.id, updates);
      setEditingUser(null);
    } catch (err: any) {
      setEditError(err?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Exclusão de usuário
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDeleteTarget = (u: User) => canEditTarget(u) && u.id !== currentUser.id && (u.role !== 'DEVELOPER' || currentUser.role === 'DEVELOPER');

  const handleConfirmDelete = async () => {
    if (!deletingUser || isDeleting) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await onDeleteUser(deletingUser.id);
      setDeletingUser(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Não foi possível excluir o usuário.');
    } finally {
      setIsDeleting(false);
    }
  };

  const canManageAccess = currentUser.role === 'DEVELOPER' || currentUser.role === 'DIRECTOR' || currentUser.role === 'MANAGER';

  const handleResendAccess = async (u: User) => {
    if (!window.confirm(`Gerar uma nova senha provisória para ${u.name} e enviar para ${u.email}?\n\nA senha atual deixará de funcionar.`)) {
      return;
    }
    try {
      setResendingId(u.id);
      setActionError(null);
      const res = await onResendAccess(u.id);
      setCopied(false);
      setAccessResult({ ...res, name: u.name, email: u.email, isResend: true });
    } catch (err: any) {
      setActionError(err?.message || 'Não foi possível reenviar o acesso.');
    } finally {
      setResendingId(null);
    }
  };

  // Filter users based on Manager scope or search
  const filteredUsers = users.filter((u) => {
    // If Manager, only show employees of their department
    if (currentUser.role === 'MANAGER' && u.departmentId !== currentUser.departmentId) {
      return false;
    }
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (!searchTerm) return true;
    return (
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.matricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.departmentName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || isSubmitting) return;

    const dept = departments.find((d) => d.id === newDeptId);
    const userData: Partial<User> = {
      name: newName,
      email: newEmail,
      matricula: newMatricula || `MAT-${Math.floor(Math.random() * 900 + 100)}`,
      cpf: newCpf,
      role: newRole,
      departmentId: newDeptId,
      departmentName: dept?.name || 'Geral',
      cargo: newCargo || (newRole === 'MANAGER' ? `Gestor de ${dept?.name}` : 'Analista'),
      status: 'ACTIVE',
      twoFactorEnabled: require2FA,
      failedLoginAttempts: 0,
      permittedFolderIds: [],
      granularPermissions: {},
    };

    try {
      setIsSubmitting(true);
      setCreateError(null);
      const res = await onCreateUser(userData);
      setIsCreateModalOpen(false);
      setCopied(false);
      setAccessResult({ ...res, name: newName, email: newEmail.trim().toLowerCase(), isResend: false });
      setNewName('');
      setNewEmail('');
      setNewMatricula('');
      setNewCpf('');
      setNewCargo('');
    } catch (err: any) {
      setCreateError(err?.message || 'Não foi possível cadastrar o usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {currentUser.role === 'MANAGER' ? `Colaboradores (${currentUser.departmentName})` : 'Gestão de Usuários & Acessos'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {currentUser.role === 'MANAGER'
              ? 'Cadastre e administre as permissões da sua equipe.'
              : 'Administração central de identidades, gestores e papéis.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Novo {currentUser.role === 'MANAGER' ? 'Colaborador' : 'Usuário / Gestor'}</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-2">
          <span className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            {actionError}
          </span>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700" aria-label="Fechar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail, matrícula..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
          />
        </div>

        {currentUser.role !== 'MANAGER' && (
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
            {['ALL', 'DEVELOPER', 'DIRECTOR', 'MANAGER', 'EMPLOYEE'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  roleFilter === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r === 'ALL'
                  ? 'Todos'
                  : r === 'DEVELOPER'
                  ? 'Desenvolvedores'
                  : r === 'DIRECTOR'
                  ? 'Diretoria'
                  : r === 'MANAGER'
                  ? 'Gestores'
                  : 'Colaboradores'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Users Responsive List / Table */}
      {/* Mobile Card List (< md) */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
            Nenhum usuário encontrado.
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div
              key={u.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={u.name} avatarUrl={u.avatar} size="sm" />
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block truncate text-sm">{u.name}</span>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {u.email} • Matrícula: {u.matricula}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                    u.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {u.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100">
                <div>
                  <span className="text-slate-400 block">Setor & Cargo</span>
                  <span className="font-semibold text-slate-800">{u.departmentName}</span>
                  <span className="text-slate-500 block">{u.cargo}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Perfil RBAC</span>
                  <span className="font-semibold text-blue-700">{u.role}</span>
                  <div className="mt-0.5">
                    {u.twoFactorEnabled ? (
                      <span className="text-emerald-600 font-medium text-[10px] inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 2FA Ativo
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium text-[10px] inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> 2FA Pendente
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onToggleUserStatus(u.id)}
                  className={`w-full min-w-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
                    u.status === 'ACTIVE'
                      ? 'border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-100'
                      : 'border-emerald-200 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100'
                  }`}
                >
                  {u.status === 'ACTIVE' ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Bloquear</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Desbloquear</span>
                    </>
                  )}
                </button>

                {canEditTarget(u) && (
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="w-full min-w-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 border border-slate-200 bg-slate-50 hover:bg-white transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
                    title="Editar usuário"
                  >
                    <Pencil className="w-4 h-4 text-slate-500" />
                    <span>Editar</span>
                  </button>
                )}

                {canDeleteTarget(u) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingUser(u);
                    }}
                    className="w-full min-w-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50/50 hover:bg-rose-100 transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
                    title="Excluir usuário"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>
                )}

                {canManageAccess && u.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => handleResendAccess(u)}
                    disabled={resendingId === u.id}
                    className="w-full min-w-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 border border-slate-200 bg-slate-50 hover:bg-white transition-colors flex items-center justify-center gap-1.5 min-h-[44px] disabled:opacity-50"
                    title="Gerar nova senha provisória e enviar por e-mail"
                  >
                    {resendingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 text-slate-500" />}
                    <span>Reenviar acesso</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onReset2FA(u.id)}
                  className="w-full min-w-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 border border-slate-200 bg-slate-50 hover:bg-white transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
                  title="Redefinir Credencial 2FA"
                >
                  <KeyRound className="w-4 h-4 text-slate-500" />
                  <span>Reset 2FA</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Users Table (hidden on mobile, visible on md+) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60 font-semibold">
                <th className="py-3 px-4 font-medium">Usuário</th>
                <th className="py-3 px-4 font-medium">Setor & Cargo</th>
                <th className="py-3 px-4 font-medium">Perfil RBAC</th>
                <th className="py-3 px-4 font-medium">2FA & Segurança</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} avatarUrl={u.avatar} size="sm" />
                      <div>
                        <span className="font-bold text-slate-900 block">{u.name}</span>
                        <span className="text-[11px] text-slate-400">
                          {u.email} • Matrícula: {u.matricula}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-slate-800 block">{u.departmentName}</span>
                    <span className="text-[11px] text-slate-500">{u.cargo}</span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                        u.role === 'DEVELOPER'
                          ? 'bg-blue-100 text-blue-800'
                          : u.role === 'DIRECTOR'
                          ? 'bg-purple-100 text-purple-800'
                          : u.role === 'MANAGER'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Shield className="w-3 h-3" /> {u.role}
                    </span>
                    {u.directorAccess && (
                      <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200" title="Acesso de diretoria aos documentos">
                        + Diretoria
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      {u.twoFactorEnabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 2FA Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5" /> 2FA Pendente
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleUserStatus(u.id)}
                        className={`p-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          u.status === 'ACTIVE'
                            ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={u.status === 'ACTIVE' ? 'Bloquear Usuário' : 'Desbloquear Usuário'}
                      >
                        {u.status === 'ACTIVE' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      {canEditTarget(u) && (
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                          title="Editar usuário (função, perfil e setor)"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canDeleteTarget(u) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeletingUser(u);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 border border-slate-200 hover:bg-rose-50 transition-colors"
                          title="Excluir usuário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canManageAccess && u.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => handleResendAccess(u)}
                          disabled={resendingId === u.id}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                          title="Reenviar acesso (nova senha provisória por e-mail)"
                        >
                          {resendingId === u.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onReset2FA(u.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                        title="Redefinir Credencial 2FA"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Cadastrar Novo Usuário / Colaborador / Gestor */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full px-5 pt-5 sm:px-6 sm:pt-6 shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {currentUser.role === 'MANAGER' ? 'Novo Colaborador' : 'Novo Usuário do Sistema'}
                  </h3>
                  <p className="text-xs text-slate-500">Defina perfil, escopo departamental e 2FA.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: João da Silva"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail Corporativo</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="joao@empresa.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Matrícula</label>
                  <input
                    type="text"
                    value={newMatricula}
                    onChange={(e) => setNewMatricula(e.target.value)}
                    placeholder="ex: MAT-402"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentUser.role === 'DEVELOPER' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nível Hierárquico (RBAC)</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="EMPLOYEE">Colaborador (Funcionário)</option>
                      <option value="MANAGER">Gestor de Área</option>
                      <option value="DIRECTOR">Diretoria</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      O papel Desenvolvedor é restrito e definido via DEVELOPER_EMAILS no .env.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Cargo</label>
                    <input
                      type="text"
                      value={newCargo}
                      onChange={(e) => setNewCargo(e.target.value)}
                      placeholder="ex: Analista Pleno"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Setor</label>
                  <select
                    disabled={currentUser.role === 'MANAGER'}
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:opacity-75"
                  >
                    {departments.length === 0 ? (
                      <option value="">Geral (Sem setor cadastrado)</option>
                    ) : (
                      departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {currentUser.role === 'DEVELOPER' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Função / Cargo</label>
                  <input
                    type="text"
                    value={newCargo}
                    onChange={(e) => setNewCargo(e.target.value)}
                    placeholder="ex: Analista Pleno"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={require2FA}
                    onChange={(e) => setRequire2FA(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <span className="font-semibold">Exigir 2FA no Primeiro Acesso</span>
                </label>
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Uma <strong>senha provisória aleatória</strong> será gerada e enviada para o e-mail cadastrado. No primeiro
                  acesso, o usuário será obrigado a criar a própria senha.
                </span>
              </div>

              {createError && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newName || !newEmail || isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Cadastrando e enviando e-mail...' : 'Salvar e Enviar Acesso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuário */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full px-5 pt-5 sm:px-6 sm:pt-6 shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Editar Usuário</h3>
                  <p className="text-xs text-slate-500">Altere dados, função, perfil de acesso e setor.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail Corporativo</label>
                  <input type="email" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Matrícula</label>
                  <input type="text" value={editMatricula} onChange={(e) => setEditMatricula(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Função / Cargo</label>
                  <input
                    type="text"
                    value={editCargo}
                    onChange={(e) => setEditCargo(e.target.value)}
                    placeholder="ex: Analista Financeiro"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Perfil de Acesso (RBAC)</label>
                  {canChangeRole(editingUser) ? (
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:opacity-60">
                      <option value="EMPLOYEE">Colaborador (Funcionário)</option>
                      <option value="MANAGER">Gestor de Área</option>
                      <option value="DIRECTOR">Diretoria</option>
                    </select>
                  ) : (
                    <>
                      <select disabled value={editingUser.role} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:opacity-60">
                        <option value={editingUser.role}>
                          {editingUser.role === 'DEVELOPER'
                            ? 'Desenvolvedor'
                            : editingUser.role === 'DIRECTOR'
                            ? 'Diretoria'
                            : editingUser.role === 'MANAGER'
                            ? 'Gestor de Área'
                            : 'Colaborador (Funcionário)'}
                        </option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {editingUser.role === 'DEVELOPER'
                          ? 'Definido pela variável DEVELOPER_EMAILS no servidor.'
                          : 'Você não pode alterar o seu próprio perfil.'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Setor</label>
                <select value={editDeptId} disabled={editingUser.role === 'DEVELOPER'} onChange={(e) => setEditDeptId(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:opacity-60">
                  {departments.length === 0 ? (
                    <option value="">Geral (Sem setor cadastrado)</option>
                  ) : (
                    departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                  )}
                </select>
                {editingUser.role === 'DEVELOPER' && (
                  <p className="text-[10px] text-slate-400 mt-1">O Desenvolvedor faz parte do setor de Tecnologia da Informação (TI).</p>
                )}
              </div>

              {currentUser.role === 'DIRECTOR' && editingUser.id !== currentUser.id && editingUser.role !== 'DIRECTOR' && (
                <label className="flex items-start gap-2 p-3 bg-purple-50/60 rounded-xl border border-purple-200 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDirectorAccess}
                    onChange={(e) => setEditDirectorAccess(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-purple-600"
                  />
                  <div>
                    <div className="font-semibold text-purple-900">Acesso de diretoria aos documentos</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Permite ver e gerenciar as pastas e arquivos de <strong>todos os setores</strong>. Sem isso, o
                      desenvolvedor e o gestor só acessam o próprio setor.
                    </p>
                  </div>
                </label>
              )}

              {editError && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Excluir Usuário */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Excluir usuário?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                <strong>{deletingUser.name}</strong> ({deletingUser.email}) perderá o acesso imediatamente e a conta será
                apagada. Os documentos que ele enviou continuam no sistema. Esta ação não pode ser desfeita. Se quiser apenas
                suspender o acesso, use <strong>Bloquear</strong>.
              </p>
            </div>
            {deleteError && (
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800">{deleteError}</div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resultado do envio de credenciais */}
      {accessResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  accessResult.emailSent ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                {accessResult.emailSent ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {accessResult.isResend ? 'Acesso reenviado' : 'Usuário cadastrado'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {accessResult.emailSent ? (
                    <>
                      A senha provisória de <strong>{accessResult.name}</strong> foi enviada para{' '}
                      <strong>{accessResult.email}</strong>. No primeiro acesso, o sistema pedirá que ele(a) crie uma nova senha.
                    </>
                  ) : (
                    <>
                      Não foi possível enviar o e-mail para <strong>{accessResult.email}</strong>. Verifique o SMTP na tela
                      Integração e repasse a senha provisória abaixo ao usuário por um canal seguro.
                    </>
                  )}
                </p>
              </div>
            </div>

            {!accessResult.emailSent && accessResult.temporaryPassword && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Senha provisória</div>
                  <div className="font-mono text-base font-bold text-slate-900 select-all">{accessResult.temporaryPassword}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(accessResult.temporaryPassword || '').then(() => setCopied(true)).catch(() => {});
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAccessResult(null)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
