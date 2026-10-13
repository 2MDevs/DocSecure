import React, { useEffect, useState } from 'react';
import { FolderPlus, X, Lock, AlertCircle, Loader2, EyeOff } from 'lucide-react';
import { Department, User } from '../../types';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  currentUser: User;
  currentDepartmentId?: string;
  parentFolderId?: string | null;
  onCreateFolder: (data: { name: string; departmentId: string; isLocked: boolean; isPrivate: boolean; description: string; parentId?: string | null }) => Promise<void>;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  departments,
  currentUser,
  currentDepartmentId,
  parentFolderId,
  onCreateFolder,
}) => {
  const [folderName, setFolderName] = useState('');
  const [departmentId, setDepartmentId] = useState(currentDepartmentId || departments[0]?.id || '');
  const [isLocked, setIsLocked] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O modal fica montado o tempo todo: a cada abertura, sincroniza o setor com o local atual.
  // (Antes o setor ficava "preso" em vazio e a criação falhava em silêncio.)
  useEffect(() => {
    if (!isOpen) return;
    // Pastas são criadas no setor onde o usuário está; colaboradores só no próprio setor
    const deptId = currentDepartmentId || currentUser.departmentId || departments[0]?.id || '';
    setDepartmentId(departments.some((d) => d.id === deptId) ? deptId : departments[0]?.id || '');
    setFolderName('');
    setDescription('');
    setIsLocked(false);
    setIsPrivate(false);
    setError(null);
    setIsSaving(false);
  }, [isOpen, currentDepartmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Trancar (exigir liberação do gestor) é coisa da gestão; privada qualquer um pode
  const isDocAdmin = currentUser.role === 'DIRECTOR' || Boolean(currentUser.directorAccess);
  const canLock =
    isDocAdmin || ((currentUser.role === 'MANAGER' || currentUser.role === 'DEVELOPER') && currentUser.departmentId === departmentId);
  const selectableDepartments = isDocAdmin ? departments : departments.filter((d) => d.id === currentUser.departmentId || d.id === departmentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim() || isSaving) return;
    if (!departmentId) {
      setError('Cadastre um setor antes de criar pastas.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onCreateFolder({
        name: folderName.trim(),
        departmentId,
        isLocked: canLock ? isLocked : false,
        isPrivate,
        description,
        parentId: parentFolderId || null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a pasta.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
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
              disabled={Boolean(parentFolderId)}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            >
              {selectableDepartments.length === 0 ? (
                <option value="">Nenhum setor cadastrado (Crie um setor antes)</option>
              ) : (
                selectableDepartments.map((dept) => (
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

          <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-violet-600"
            />
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <EyeOff className="w-3.5 h-3.5 text-violet-600" />
                <span>Pasta privada</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Só você, o gestor do setor e a diretoria veem. Os outros colaboradores não.
              </p>
            </div>
          </label>

          {canLock && (
            <label className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-blue-600"
              />
              <div>
                <div className="flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Trancada</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Colaboradores do setor só entram se você liberar em “Propriedades e permissões”.
                </p>
              </div>
            </label>
          )}

          <p className="text-[11px] text-slate-400">Pessoas de outros setores nunca veem esta pasta, a menos que a gestão libere.</p>

          {error && (
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

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
              disabled={!folderName.trim() || isSaving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSaving ? 'Criando...' : 'Criar Pasta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
