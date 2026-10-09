import React, { useState } from 'react';
import { FolderPlus, X, Lock } from 'lucide-react';
import { Department } from '../../types';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  currentDepartmentId?: string;
  parentFolderId?: string | null;
  onCreateFolder: (data: { name: string; departmentId: string; isLocked: boolean; description: string; parentId?: string | null }) => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  departments,
  currentDepartmentId,
  parentFolderId,
  onCreateFolder,
}) => {
  const [folderName, setFolderName] = useState('');
  const [departmentId, setDepartmentId] = useState(currentDepartmentId || departments[0]?.id || '');
  const [isLocked, setIsLocked] = useState(true);
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    onCreateFolder({
      name: folderName.trim(),
      departmentId,
      isLocked,
      description,
      parentId: parentFolderId || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Nova Pasta Segura</h3>
              <p className="text-xs text-slate-500">Crie um novo diretório com controle de acesso.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Pasta</label>
            <input
              type="text"
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="ex: Contratos 2026"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Setor Responsável</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            >
              {departments.length === 0 ? (
                <option value="">Nenhum setor cadastrado (Crie um setor antes)</option>
              ) : (
                departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Finalidade desta pasta corporativa"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
            />
            <div className="flex items-center gap-1.5 font-medium">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              <span>Exigir autorização prévia por RBAC (Bloqueada)</span>
            </div>
          </label>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20"
            >
              Criar Pasta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
