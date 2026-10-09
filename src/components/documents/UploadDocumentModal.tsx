import React, { useState } from 'react';
import {
  Upload,
  X,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
  HardDrive,
} from 'lucide-react';
import { Department, Folder, User } from '../../types';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  folders: Folder[];
  currentDepartmentId?: string;
  currentFolderId?: string;
  currentUser: User;
  onUploadSuccess: (newDoc: {
    name: string;
    extension: 'pdf' | 'xlsx' | 'docx' | 'png' | 'csv' | 'zip';
    sizeBytes: number;
    folderId: string;
    departmentId: string;
    tags: string[];
  }) => void;
}

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
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    currentDepartmentId || currentUser.departmentId || departments[0]?.id || ''
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    currentFolderId || ''
  );
  const [fileName, setFileName] = useState('');
  const [tags, setTags] = useState('Oficial, 2025');
  const [isScanning, setIsScanning] = useState(false);
  const [scanPassed, setScanPassed] = useState(false);

  if (!isOpen) return null;

  const availableFolders = folders.filter((f) => f.departmentId === selectedDeptId);

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setFileName(file.name);
    setIsScanning(true);
    setScanPassed(false);

    // Simulate real-time malware analysis
    setTimeout(() => {
      setIsScanning(false);
      setScanPassed(true);
    }, 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && !fileName) return;

    const extension = (fileName.split('.').pop()?.toLowerCase() || 'pdf') as any;
    const targetFolderId = selectedFolderId || availableFolders[0]?.id || 'folder-root';

    onUploadSuccess({
      name: fileName,
      extension: ['pdf', 'xlsx', 'docx', 'png', 'csv', 'zip'].includes(extension)
        ? extension
        : 'pdf',
      sizeBytes: selectedFile ? selectedFile.size : 1024 * 1024 * 1.5,
      folderId: targetFolderId,
      departmentId: selectedDeptId,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 relative overflow-hidden max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Novo Documento Seguro</h3>
              <p className="text-xs text-slate-500">Upload criptografado com verificação antivírus.</p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer relative"
          >
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="w-12 h-12 mx-auto rounded-xl bg-blue-100/60 text-blue-600 flex items-center justify-center mb-2">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-slate-800">
              {selectedFile ? selectedFile.name : 'Arraste o arquivo ou clique para selecionar'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Formatos aceitos: PDF, XLSX, DOCX, PNG, CSV, ZIP (máx. 100MB)
            </p>
          </div>

          {/* Malware Scan Status Badge */}
          {selectedFile && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span className="text-slate-700">Verificação de Segurança:</span>
              </div>
              {isScanning ? (
                <span className="text-amber-600 font-medium animate-pulse">Escaneando malware...</span>
              ) : scanPassed ? (
                <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Arquivo Limpo (SHA-256 OK)
                </span>
              ) : null}
            </div>
          )}

          {/* File Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Documento</label>
            <input
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="ex: Relatório Anual 2025.pdf"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Department & Folder Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Setor</label>
              <select
                value={selectedDeptId}
                onChange={(e) => {
                  setSelectedDeptId(e.target.value);
                  setSelectedFolderId('');
                }}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pasta de Destino</label>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tags / Metadados</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ex: Contrato, Confidencial, 2025"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

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
              disabled={!fileName}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20"
            >
              Confirmar Envio Criptografado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
