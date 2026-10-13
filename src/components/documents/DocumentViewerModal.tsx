import React, { useEffect, useState } from 'react';
import {
  X,
  Download,
  ChevronLeft,
  ShieldCheck,
  FileText,
  Lock,
  Loader2,
  AlertTriangle,
  Info,
  Trash2,
} from 'lucide-react';
import { DocumentItem, DocumentVersion, User } from '../../types';
import { verifyPermission } from '../../services/securityEngine';
import { apiClient } from '../../services/apiClient';

interface DocumentViewerModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onDownload: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  /** Mantido por compatibilidade; o histórico de versões ainda não é editável. */
  onRestoreVersion?: (doc: DocumentItem, version: DocumentVersion) => void;
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const TEXT_EXT = ['txt', 'csv', 'json', 'log', 'md'];
const MAX_TEXT_PREVIEW = 1024 * 1024; // 1 MB

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'image' | 'pdf'; url: string }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

const formatSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (value?: string) => {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  isOpen,
  onClose,
  currentUser,
  onDownload,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'details'>('preview');
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });

  const ext = (document?.extension || '').toLowerCase();
  const previewKind: 'image' | 'pdf' | 'text' | null = IMAGE_EXT.includes(ext)
    ? 'image'
    : ext === 'pdf'
    ? 'pdf'
    : TEXT_EXT.includes(ext)
    ? 'text'
    : null;

  // Carrega o conteúdo REAL do arquivo enviado
  useEffect(() => {
    if (!isOpen || !document) return;
    setActiveTab('preview');

    if (document.hasContent === false) {
      setPreview({
        kind: 'error',
        message:
          'Este registro foi criado por uma versão antiga do sistema e não possui o arquivo armazenado. Exclua-o e envie o arquivo novamente.',
      });
      return;
    }
    if (!previewKind) {
      setPreview({ kind: 'unsupported' });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreview({ kind: 'loading' });

    apiClient
      .getDocumentContent(document.id)
      .then(async (blob) => {
        if (cancelled) return;
        if (previewKind === 'text') {
          const truncated = blob.size > MAX_TEXT_PREVIEW;
          const text = await blob.slice(0, MAX_TEXT_PREVIEW).text();
          if (!cancelled) setPreview({ kind: 'text', text, truncated });
          return;
        }
        const typed = new Blob([blob], { type: previewKind === 'pdf' ? 'application/pdf' : blob.type || `image/${ext}` });
        objectUrl = URL.createObjectURL(typed);
        setPreview({ kind: previewKind, url: objectUrl });
      })
      .catch((err) => {
        if (!cancelled) setPreview({ kind: 'error', message: err?.message || 'Não foi possível carregar o arquivo.' });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, document?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !document) return null;

  const canDownload = verifyPermission(
    currentUser,
    'document',
    document.id,
    document.departmentId,
    'DOWNLOAD_DOCUMENT',
    document.folderId || undefined
  ).allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-2xl w-full max-w-5xl h-full sm:h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Barra superior */}
        <div className="px-4 sm:px-5 py-3 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between gap-3 text-white select-none">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate" title={document.name}>
                {document.name}
              </h3>
              <span className="text-[11px] text-slate-400">
                {ext.toUpperCase()} • {document.departmentName} • {formatSize(document.sizeBytes)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center bg-slate-800/80 p-0.5 rounded-lg text-xs">
              {(['preview', 'details'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === tab ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab === 'preview' ? 'Visualizar' : 'Detalhes'}
                </button>
              ))}
            </div>

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(document)}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Excluir (enviar para a lixeira do setor)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onDownload(document)}
              disabled={!canDownload || document.hasContent === false}
              title={canDownload ? 'Baixar arquivo original' : 'Download bloqueado (sem permissão)'}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                canDownload
                  ? 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40'
                  : 'bg-rose-950/80 border border-rose-800/80 text-rose-400 cursor-not-allowed'
              }`}
            >
              {canDownload ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span className="hidden sm:inline">{canDownload ? 'Baixar' : 'Download bloqueado'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-h-0 overflow-auto bg-slate-950 flex">
          {activeTab === 'preview' ? (
            <div className="flex-1 flex items-center justify-center p-3 sm:p-6 min-h-0">
              {preview.kind === 'loading' && (
                <div className="text-slate-400 text-xs flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando arquivo...
                </div>
              )}

              {preview.kind === 'image' && (
                <img
                  src={preview.url}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white"
                />
              )}

              {preview.kind === 'pdf' && (
                <iframe src={preview.url} title={document.name} className="w-full h-full min-h-[60dvh] rounded-lg bg-white" />
              )}

              {preview.kind === 'text' && (
                <div className="w-full h-full flex flex-col">
                  {preview.truncated && (
                    <div className="mb-2 text-[11px] text-amber-300">Mostrando apenas o primeiro 1 MB. Baixe para ver o arquivo completo.</div>
                  )}
                  <pre className="flex-1 overflow-auto bg-white text-slate-800 rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap break-words select-text">
                    {preview.text}
                  </pre>
                </div>
              )}

              {preview.kind === 'unsupported' && (
                <div className="text-center max-w-sm space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center">
                    <FileText className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-semibold text-white">Pré-visualização indisponível para .{ext}</p>
                  <p className="text-xs text-slate-400">
                    A visualização no navegador funciona para PDF, imagens e arquivos de texto. Use “Baixar” para abrir este
                    arquivo no seu computador.
                  </p>
                </div>
              )}

              {preview.kind === 'error' && (
                <div className="text-center max-w-md space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950 text-rose-400 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7" />
                  </div>
                  <p className="text-sm text-rose-200">{preview.message}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl mx-auto p-4 sm:p-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-4">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" /> Detalhes do Arquivo
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    ['Nome', document.name],
                    ['Tipo', ext.toUpperCase()],
                    ['Tamanho', formatSize(document.sizeBytes)],
                    ['Setor', document.departmentName],
                    ['Enviado por', document.ownerName],
                    ['Enviado em', formatDate(document.createdAt)],
                    ['Última alteração', formatDate(document.updatedAt)],
                    ['Tags', document.tags?.length ? document.tags.join(', ') : '-'],
                  ].map(([label, value]) => (
                    <div key={label} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60">
                      <dt className="text-slate-400 mb-0.5">{label}</dt>
                      <dd className="text-slate-100 font-medium break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 text-xs space-y-1">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> SHA-256 do arquivo original
                  </div>
                  <div className="font-mono text-blue-300 break-all select-all">{document.hashSha256}</div>
                  <div className="text-slate-500 pt-1">Armazenado no servidor com criptografia AES-256-GCM.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Abas no celular */}
        <div className="sm:hidden px-4 py-2 bg-[#0a1222] border-t border-slate-800 flex gap-2">
          {(['preview', 'details'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {tab === 'preview' ? 'Visualizar' : 'Detalhes'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
