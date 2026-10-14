import React, { useEffect, useState } from 'react';
import { Upload, X, ShieldCheck, AlertCircle, Loader2, FileText } from 'lucide-react';
import { Department, DocSecurity, DocumentItem, Folder, User } from '../../types';
import { SecurityFields, DEFAULT_SECURITY } from './SecurityFields';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  folders: Folder[];
  currentDepartmentId?: string;
  currentFolderId?: string;
  currentUser: User;
  onUploadSuccess: (
    file: File,
    options: { departmentId: string; folderId: string | null; name: string; tags: string[]; security?: DocSecurity },
    onProgress?: (percent: number) => void
  ) => Promise<DocumentItem>;
}

const BLOCKED = ['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jar', 'sh', 'dll', 'hta', 'html', 'htm', 'svg', 'php'];

const formatSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  departments,
  folders,
  currentDepartmentId,
  currentFolderId,
  currentUser,
  onUploadSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [fileName, setFileName] = useState('');
  const [tags, setTags] = useState('');
  const [security, setSecurity] = useState<Required<DocSecurity>>(DEFAULT_SECURITY);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Ao abrir, sincroniza o destino com o local onde o usuário está navegando
  useEffect(() => {
    if (!isOpen) return;
    const deptId = currentDepartmentId || currentUser.departmentId || departments[0]?.id || '';
    setSelectedDeptId(departments.some((d) => d.id === deptId) ? deptId : departments[0]?.id || '');
    setSelectedFolderId(currentFolderId || '');
    setSelectedFile(null);
    setFileName('');
    setTags('');
    setSecurity(DEFAULT_SECURITY);
    setProgress(0);
    setError(null);
    setIsUploading(false);
  }, [isOpen, currentDepartmentId, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const availableFolders = folders.filter((f) => f.departmentId === selectedDeptId);

  const handleFileChange = (file: File) => {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!file.name.includes('.') || !ext) {
      setError('O arquivo precisa ter uma extensão (ex: .pdf, .png).');
      return;
    }
    if (BLOCKED.includes(ext)) {
      setError(`Arquivos .${ext} não são permitidos por segurança.`);
      return;
    }
    setSelectedFile(file);
    setFileName(file.name);
  };

  const handleClose = () => {
    if (isUploading) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedDeptId || isUploading) return;

    try {
      setIsUploading(true);
      setError(null);
      setProgress(0);
      await onUploadSuccess(
        selectedFile,
        {
          departmentId: selectedDeptId,
          folderId: selectedFolderId || null,
          name: fileName.trim() || selectedFile.name,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          security,
        },
        setProgress
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar o arquivo.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 relative max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Enviar Documento</h3>
              <p className="text-xs text-slate-500">O arquivo é guardado no servidor com criptografia AES-256.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Área de seleção / arrastar */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!isUploading && e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer relative"
          >
            <input
              type="file"
              disabled={isUploading}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                e.target.value = '';
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="w-12 h-12 mx-auto rounded-xl bg-blue-100/60 text-blue-600 flex items-center justify-center mb-2">
              {selectedFile ? <FileText className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
            </div>
            <div className="text-xs font-semibold text-slate-800 break-all">
              {selectedFile ? selectedFile.name : 'Arraste o arquivo ou clique para selecionar'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {selectedFile
                ? formatSize(selectedFile.size)
                : 'PDF, imagens, Word, Excel, CSV, TXT, ZIP e outros. Executáveis e scripts são bloqueados.'}
            </p>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Documento</label>
            <input
              type="text"
              value={fileName}
              disabled={!selectedFile || isUploading}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Selecione um arquivo"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
            />
            <p className="text-[10px] text-slate-400 mt-1">A extensão original do arquivo é sempre mantida.</p>
          </div>

          {/* Setor e Pasta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Setor</label>
              <select
                value={selectedDeptId}
                disabled={isUploading}
                onChange={(e) => {
                  setSelectedDeptId(e.target.value);
                  setSelectedFolderId('');
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              >
                {departments.length === 0 ? (
                  <option value="">Nenhum setor cadastrado (crie um setor antes)</option>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pasta de Destino</label>
              <select
                value={selectedFolderId}
                disabled={isUploading}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="">Raiz do Setor</option>
                {availableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (opcional)</label>
            <input
              type="text"
              value={tags}
              disabled={isUploading}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ex: Contrato, Confidencial, 2026"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Segurança já no envio */}
          <SecurityFields value={security} onChange={setSecurity} disabled={isUploading} />

          {isUploading && (
            <div className="space-y-1.5">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                {progress < 100 ? `Enviando... ${progress}%` : 'Criptografando e gravando no servidor...'}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedFile || !selectedDeptId || isUploading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 inline-flex items-center gap-2"
            >
              {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isUploading ? 'Enviando...' : 'Enviar Arquivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
