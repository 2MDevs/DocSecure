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
} from 'lucide-react';
import { User, UserRole, UserStatus, Department } from '../../types';
import { Avatar } from '../common/Avatar';

interface UsersManagementProps {
  currentUser: User;
  users: User[];
  departments: Department[];
  onCreateUser: (userData: Partial<User>) => void;
  onToggleUserStatus: (userId: string) => void;
  onReset2FA: (userId: string) => void;
}

export const UsersManagement: React.FC<UsersManagementProps> = ({
  currentUser,
  users,
  departments,
  onCreateUser,
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

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;

    const dept = departments.find((d) => d.id === newDeptId);

    onCreateUser({
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
    });

    setIsCreateModalOpen(false);
    setNewName('');
    setNewEmail('');
    setNewMatricula('');
    setNewCpf('');
    setNewCargo('');
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
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Novo {currentUser.role === 'MANAGER' ? 'Colaborador' : 'Usuário / Gestor'}</span>
        </button>
      </div>

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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onToggleUserStatus(u.id)}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
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

                <button
                  type="button"
                  onClick={() => onReset2FA(u.id)}
                  className="py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-600 border border-slate-200 bg-slate-50 hover:bg-white transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
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
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
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

              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-2 gap-3">
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
                <p className="text-[11px] text-slate-500 pl-6">
                  Senha temporária gerada: <strong className="font-mono text-slate-800">DocSecure@2025</strong>
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newName || !newEmail}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20"
                >
                  Salvar e Criar Credenciais
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
