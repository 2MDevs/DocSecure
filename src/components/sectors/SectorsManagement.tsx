import React, { useState } from 'react';
import {
  Building,
  HardDrive,
  UserCheck,
  Plus,
  Lock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Department, User } from '../../types';

interface SectorsManagementProps {
  departments: Department[];
  users: User[];
  currentUser: User;
  onUpdateDepartment: (deptId: string, data: Partial<Department>) => void;
  onCreateDepartment: (deptData: Partial<Department>) => void;
}

// Format bytes into readable B, KB, MB, GB, TB with decimals
export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const SectorsManagement: React.FC<SectorsManagementProps> = ({
  departments,
  users,
  currentUser,
  onUpdateDepartment,
  onCreateDepartment,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newQuotaGb, setNewQuotaGb] = useState('500');
  const [newManagerId, setNewManagerId] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const managers = users.filter((u) => u.role === 'MANAGER' || u.role === 'DIRECTOR' || u.role === 'DEVELOPER');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName) return;

    const mgr = users.find((u) => u.id === newManagerId);

    onCreateDepartment({
      name: newDeptName,
      code: newDeptCode || newDeptName.slice(0, 3).toUpperCase(),
      storageLimitBytes: parseInt(newQuotaGb || '500', 10) * 1024 * 1024 * 1024,
      storageUsedBytes: 0,
      managerId: newManagerId || undefined,
      managerName: mgr?.name || 'Não atribuído',
      description: newDesc || 'Setor corporativo DocSecure',
      isLocked: true,
      itemCount: 0,
      color: '#3b82f6',
      iconName: 'Building',
    });

    setIsModalOpen(false);
    setNewDeptName('');
    setNewDeptCode('');
    setNewDesc('');
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Setores & Quotas de Armazenamento
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cálculo 100% dinâmico baseado na soma real dos arquivos gravados no banco PostgreSQL.
          </p>
        </div>

        {currentUser.role === 'DEVELOPER' && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Setor</span>
          </button>
        )}
      </div>

      {/* Grid of Sector & Quota Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {departments.length === 0 ? (
          <div className="col-span-full bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3.5">
              <HardDrive className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Nenhum setor ou quota cadastrada</h3>
            <p className="text-xs text-slate-500 max-w-md mt-1.5 leading-relaxed">
              Os setores organizacionais e quotas de armazenamento foram zerados para implantação limpa. Conforme novos setores forem cadastrados, os dados de armazenamento e limites serão refletidos em tempo real.
            </p>
            {currentUser.role === 'DEVELOPER' && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="mt-4 px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Cadastrar Primeiro Setor</span>
              </button>
            )}
          </div>
        ) : (
          departments.map((dept) => {
          const usedFormatted = formatBytes(dept.storageUsedBytes || 0, 2);
          const limitFormatted = formatBytes(dept.storageLimitBytes || 536870912000, 0);
          const percentUsed = Math.min(
            100,
            dept.storageLimitBytes > 0
              ? parseFloat(((dept.storageUsedBytes / dept.storageLimitBytes) * 100).toFixed(2))
              : 0
          );
          const isNearLimit = percentUsed >= 85;

          return (
            <div
              key={dept.id}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                      {dept.code || 'SET'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{dept.name}</h3>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {dept.itemCount || 0} {dept.itemCount === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {dept.isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  {dept.description || 'Setor corporativo configurado para isolamento de dados.'}
                </p>

                {/* Assigned Manager */}
                <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Gestor:
                  </span>
                  <span className="font-semibold text-slate-800">{dept.managerName || 'Não Atribuído'}</span>
                </div>

                {/* Dynamic Storage Quota Progress Bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600 flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-slate-400" /> Quota Utilizada:
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {usedFormatted} / {limitFormatted} ({percentUsed}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(percentUsed > 0 ? percentUsed : 0.5, 0.5)}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${
                        percentUsed >= 90
                          ? 'bg-rose-500'
                          : percentUsed >= 75
                          ? 'bg-amber-500'
                          : 'bg-blue-600'
                      }`}
                    />
                  </div>

                  {isNearLimit && (
                    <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> Atenção: Capacidade próxima do limite.
                    </div>
                  )}
                </div>
              </div>

              {currentUser.role === 'DEVELOPER' && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const curGb = (dept.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
                      const newQuota = prompt(`Digite a nova quota em GB para o setor ${dept.name}:`, curGb);
                      if (newQuota && !isNaN(Number(newQuota))) {
                        onUpdateDepartment(dept.id, {
                          storageLimitBytes: Number(newQuota) * 1024 * 1024 * 1024,
                        });
                      }
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Ajustar Quota (GB)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateDepartment(dept.id, { isLocked: !dept.isLocked });
                    }}
                    className="text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    {dept.isLocked ? 'Desbloquear Acesso Livre' : 'Ativar Bloqueio RBAC'}
                  </button>
                </div>
              )}
            </div>
          );
        }))}
      </div>

      {/* Modal: Novo Setor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Novo Setor Empresarial</h3>
                  <p className="text-xs text-slate-500">Crie um setor com quota e gestor dedicado.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Setor</label>
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="ex: Jurídico & Compliance"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código (Sigla)</label>
                  <input
                    type="text"
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                    placeholder="ex: JUR"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quota de Disco (GB)</label>
                  <input
                    type="number"
                    value={newQuotaGb}
                    onChange={(e) => setNewQuotaGb(e.target.value)}
                    placeholder="500"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gestor do Setor</label>
                <select
                  value={newManagerId}
                  onChange={(e) => setNewManagerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Selecione um gestor responsável</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.cargo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Escopo do setor e diretrizes de sigilo"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newDeptName}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Criar Setor e Ativar Quota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
