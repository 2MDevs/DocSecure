import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  History,
  FileText,
  Lock,
  RotateCcw,
  Eye,
  CheckCircle2,
  Printer,
  Sparkles,
} from 'lucide-react';
import { DocumentItem, DocumentVersion, User } from '../../types';
import { verifyPermission } from '../../services/securityEngine';

interface DocumentViewerModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onDownload: (doc: DocumentItem) => void;
  onRestoreVersion?: (doc: DocumentItem, version: DocumentVersion) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  isOpen,
  onClose,
  currentUser,
  onDownload,
  onRestoreVersion,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 12;
  const [activeTab, setActiveTab] = useState<'preview' | 'versions' | 'security'>('preview');

  if (!isOpen || !document) return null;

  const downloadPermissionCheck = verifyPermission(
    currentUser,
    'document',
    document.id,
    document.departmentId,
    'DOWNLOAD_DOCUMENT',
    document.folderId
  );
  const canDownload = downloadPermissionCheck.allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Top Bar matching mobile #6 & desktop specs */}
        <div className="px-5 py-3.5 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between text-white select-none">
          <div className="flex items-center gap-3 truncate">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h3 className="text-sm font-bold text-white truncate">{document.name}</h3>
              <span className="text-[11px] text-slate-400">
                v{document.currentVersion}.0 • {document.departmentName} • {(document.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
          </div>

          {/* Top Actions & Tabs */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Tab switcher */}
            <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'preview' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                Visualizar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('versions')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'versions' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                Versões ({document.versions.length || 1})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'security' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                Segurança
              </button>
            </div>

            <button
              type="button"
              onClick={() => onDownload(document)}
              title={canDownload ? 'Download Cópia Criptografada' : 'Download Bloqueado (Permissão Revogada)'}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ${
                canDownload
                  ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                  : 'bg-rose-950/80 border border-rose-800/80 text-rose-400 hover:bg-rose-900 cursor-pointer'
              }`}
            >
              {canDownload ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4 text-rose-400" />}
              <span className="hidden sm:inline">
                {canDownload ? 'Baixar' : 'Download Bloqueado'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 flex justify-center">
          {activeTab === 'preview' ? (
            /* Document Render Canvas matching exact mobile screen #6 */
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl p-6 sm:p-8 text-slate-900 border border-slate-200">
              {/* Report Header */}
              <div className="flex items-center justify-between border-b pb-4 border-slate-200">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Relatório Financeiro</h2>
                  <span className="text-xs text-slate-500">Setembro 2025 • Consolidado Oficial</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    DS
                  </div>
                  <span className="font-bold text-slate-900 text-sm">DocSecure</span>
                </div>
              </div>

              {/* Chart & KPI Section matching screenshot #6 */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">Receita Total</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">R$ 458.230,00</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 block">Despesa Total</span>
                  <span className="text-base font-bold text-slate-900 tabular-nums">R$ 312.540,00</span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[11px] font-medium text-emerald-700 block">Saldo</span>
                  <span className="text-base font-bold text-emerald-700 tabular-nums">R$ 145.690,00</span>
                </div>
              </div>

              {/* Bar Chart Representation: Receitas x Despesas */}
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-800">Receitas x Despesas</span>
                  <span className="text-[10px] text-slate-400">Em milhares (R$)</span>
                </div>
                <div className="h-32 flex items-end justify-between gap-3 px-2 pt-2 border-b border-slate-200">
                  {[
                    { label: 'Sem 1', rec: 85, desp: 55 },
                    { label: 'Sem 2', rec: 110, desp: 75 },
                    { label: 'Sem 3', rec: 130, desp: 90 },
                    { label: 'Sem 4', rec: 133, desp: 92 },
                  ].map((item, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center gap-1.5 h-24">
                        <div
                          style={{ height: `${(item.rec / 140) * 100}%` }}
                          className="w-3 sm:w-5 bg-blue-600 rounded-t transition-all hover:opacity-80"
                          title={`Receita: R$ ${item.rec}k`}
                        />
                        <div
                          style={{ height: `${(item.desp / 140) * 100}%` }}
                          className="w-3 sm:w-5 bg-amber-500 rounded-t transition-all hover:opacity-80"
                          title={`Despesa: R$ ${item.desp}k`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center gap-6 mt-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-xs" />
                    <span>Receitas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-xs" />
                    <span>Despesas</span>
                  </div>
                </div>
              </div>

              {/* Donut Chart Representation: Principais Categorias */}
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-800 block mb-3">Principais Categorias</span>
                <div className="flex flex-col sm:flex-row items-center justify-around gap-4">
                  {/* Visual Donut representation */}
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      {/* Circle slices */}
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#2563eb" strokeWidth="4" strokeDasharray="42 58" strokeDashoffset="0" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#0ea5e9" strokeWidth="4" strokeDasharray="28 72" strokeDashoffset="-42" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f59e0b" strokeWidth="4" strokeDasharray="20 80" strokeDashoffset="-70" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f97316" strokeWidth="4" strokeDasharray="10 90" strokeDashoffset="-90" />
                    </svg>
                    <span className="absolute text-[11px] font-bold text-slate-700">100%</span>
                  </div>

                  {/* Legend matching screenshot */}
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        <span>Operacional</span>
                      </div>
                      <span className="font-semibold tabular-nums">42%</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                        <span>Administrativo</span>
                      </div>
                      <span className="font-semibold tabular-nums">28%</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span>Comercial</span>
                      </div>
                      <span className="font-semibold tabular-nums">20%</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                        <span>Outros</span>
                      </div>
                      <span className="font-semibold tabular-nums">10%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Watermark / Signature */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Homologado por Marcos Silva (Gestor Financeiro)</span>
                <span className="font-mono text-[10px]">HASH: 9f86d081...a08</span>
              </div>
            </div>
          ) : activeTab === 'versions' ? (
            /* Versioning History tab */
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold">Histórico de Versões</h3>
                  <p className="text-xs text-slate-400">Controle rigoroso de alterações e auditoria de autoria.</p>
                </div>
                <span className="px-2.5 py-1 bg-blue-950 text-blue-400 border border-blue-800 rounded-lg text-xs font-semibold">
                  Versão Atual: v{document.currentVersion}.0
                </span>
              </div>

              <div className="space-y-3">
                {document.versions.map((ver) => (
                  <div
                    key={ver.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      ver.versionNumber === document.currentVersion
                        ? 'bg-blue-950/30 border-blue-500/50'
                        : 'bg-slate-800/40 border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-sm text-white">{ver.versionLabel}</span>
                        {ver.versionNumber === document.currentVersion && (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold rounded">
                            Atual
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{ver.createdAt}</span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2">{ver.changeLog}</p>

                    <div className="mt-3 pt-2 border-t border-slate-700/40 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Autor: <strong className="text-slate-200">{ver.createdBy}</strong></span>
                      {ver.versionNumber !== document.currentVersion && onRestoreVersion && (
                        <button
                          type="button"
                          onClick={() => onRestoreVersion(document, ver)}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restaurar esta versão
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Security & Integrity tab */
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4">
              <h3 className="text-base font-bold">Criptografia & Integridade do Arquivo</h3>
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Assinatura Digital SHA-256:</span>
                  <div className="font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-blue-300 select-all break-all">
                    {document.hashSha256}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-slate-400">Antivírus / Malware Scan:</span>
                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mt-0.5">
                      <CheckCircle2 className="w-4 h-4" /> 100% Limpo (Verificado)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Armazenamento:</span>
                    <div className="font-semibold text-slate-200 mt-0.5">Object Storage Criptografado</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Pagination & Navigation toolbar matching mobile screen #6 */}
        <div className="px-6 py-3 bg-[#0a1222] border-t border-slate-800 flex items-center justify-between text-white text-xs select-none">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onDownload(document)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Baixar Cópia Criptografada"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => alert(`Link seguro copiado com expiração de 24h para: ${document.name}`)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Compartilhar Link Seguro"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
