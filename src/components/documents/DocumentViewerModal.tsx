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
import { apiClient, ArchiveItem, DocBlock, SheetPreview } from '../../services/apiClient';
import { ArchiveView, DocxView, SheetView, csvToSheet } from './OfficePreviews';

interface DocumentViewerModalProps {
  document: DocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onDownload: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  /** Visualização de Office: completa (LibreOffice, idêntica ao original) ou básica */
  officeMode?: 'full' | 'basic';
  /** Mantido por compatibilidade; o histórico de versões ainda não é editável. */
  onRestoreVersion?: (doc: DocumentItem, version: DocumentVersion) => void;
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const TEXT_EXT = ['txt', 'json', 'log', 'md', 'xml'];
const SHEET_EXT = ['xlsx', 'xlsm'];
const DOCX_EXT = ['docx', 'docm'];
const ARCHIVE_EXT = ['zip', 'rar'];
const MAX_TEXT_PREVIEW = 1024 * 1024; // 1 MB
const MAX_CSV_PREVIEW = 10 * 1024 * 1024;

const FULL_OFFICE_EXT = ['doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pps', 'ppsx', 'odp'];

type Kind = 'image' | 'pdf' | 'text' | 'csv' | 'sheet' | 'docx' | 'archive' | 'office';
const kindOf = (ext: string, inner = false, office: 'full' | 'basic' = 'basic'): Kind | null =>
  office === 'full' && FULL_OFFICE_EXT.includes(ext)
    ? 'office'
    : IMAGE_EXT.includes(ext)
    ? 'image'
    : ext === 'pdf'
    ? 'pdf'
    : ext === 'csv'
    ? 'csv'
    : TEXT_EXT.includes(ext)
    ? 'text'
    : SHEET_EXT.includes(ext)
    ? 'sheet'
    : DOCX_EXT.includes(ext)
    ? 'docx'
    : ARCHIVE_EXT.includes(ext) && !inner
    ? 'archive'
    : null;

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'image' | 'pdf'; url: string }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'sheet'; sheets: SheetPreview[] }
  | { kind: 'docx'; blocks: DocBlock[]; truncated: boolean }
  | { kind: 'archive'; format: 'zip' | 'rar'; items: ArchiveItem[]; truncated: boolean }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

/**
 * Carrega a pré-visualização do documento (ou de um item de dentro do compactado, quando "inner" é informado).
 * Devolve a função que libera a memória (URLs de imagem/PDF).
 */
async function loadPreview(docId: string, kind: Kind, ext: string, inner?: string): Promise<{ state: PreviewState; cleanup?: () => void }> {
  const blob = () => (inner ? apiClient.getArchiveItemBlob(docId, inner) : apiClient.getDocumentContent(docId));
  if (kind === 'office') {
    try {
      const pdf = await apiClient.getOfficePdf(docId, inner);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      return { state: { kind: 'pdf', url }, cleanup: () => URL.revokeObjectURL(url) };
    } catch (err: any) {
      // Conversão indisponível/falhou: usa a visualização básica quando o formato permite
      const basic = kindOf(ext, Boolean(inner), 'basic');
      if (basic) return loadPreview(docId, basic, ext, inner);
      throw err;
    }
  }
  if (kind === 'sheet') return { state: { kind: 'sheet', sheets: (await apiClient.getSheetPreview(docId, inner)).sheets } };
  if (kind === 'docx') {
    const r = await apiClient.getDocxPreview(docId, inner);
    return { state: { kind: 'docx', blocks: r.blocks, truncated: r.truncated } };
  }
  if (kind === 'archive') {
    const r = await apiClient.getArchiveItems(docId);
    return { state: { kind: 'archive', format: r.format, items: r.items, truncated: r.truncated } };
  }
  const b = await blob();
  if (kind === 'csv') {
    const text = await b.slice(0, MAX_CSV_PREVIEW).text();
    return { state: { kind: 'sheet', sheets: [csvToSheet(text)] } };
  }
  if (kind === 'text') {
    const text = await b.slice(0, MAX_TEXT_PREVIEW).text();
    return { state: { kind: 'text', text, truncated: b.size > MAX_TEXT_PREVIEW } };
  }
  const typed = new Blob([b], { type: kind === 'pdf' ? 'application/pdf' : b.type || `image/${ext}` });
  const url = URL.createObjectURL(typed);
  return { state: { kind: kind as 'image' | 'pdf', url }, cleanup: () => URL.revokeObjectURL(url) };
}

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
  officeMode = 'basic',
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'details'>('preview');
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });

  const ext = (document?.extension || '').toLowerCase();
  const previewKind = kindOf(ext, false, officeMode);
  // Item aberto de dentro do .zip/.rar
  const [inner, setInner] = useState<{ item: ArchiveItem; preview: PreviewState } | null>(null);

  // Carrega o conteúdo REAL do arquivo enviado
  useEffect(() => {
    if (!isOpen || !document) return;
    setActiveTab('preview');
    setInner(null);

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
    let cleanup: (() => void) | undefined;
    setPreview({ kind: 'loading' });
    loadPreview(document.id, previewKind, ext)
      .then((r) => {
        if (cancelled) return r.cleanup?.();
        cleanup = r.cleanup;
        setPreview(r.state);
      })
      .catch((err) => {
        if (!cancelled) setPreview({ kind: 'error', message: err?.message || 'Não foi possível carregar o arquivo.' });
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isOpen, document?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abre um item de dentro do compactado
  useEffect(() => {
    if (!inner || inner.preview.kind !== 'loading' || !document) return;
    const innerExt = (inner.item.path.split('.').pop() || '').toLowerCase();
    const k = kindOf(innerExt, true, officeMode);
    if (!k) {
      setInner({ ...inner, preview: { kind: 'unsupported' } });
      return;
    }
    if (inner.item.encrypted) {
      setInner({ ...inner, preview: { kind: 'error', message: 'Este item está protegido por senha.' } });
      return;
    }
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    loadPreview(document.id, k, innerExt, inner.item.path)
      .then((r) => {
        if (cancelled) return r.cleanup?.();
        cleanup = r.cleanup;
        setInner((cur) => (cur && cur.item.path === inner.item.path ? { ...cur, preview: r.state } : cur));
      })
      .catch((err) => {
        if (!cancelled) setInner((cur) => (cur ? { ...cur, preview: { kind: 'error', message: err?.message || 'Não foi possível abrir este item.' } } : cur));
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [inner?.item.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadInner = (item: ArchiveItem) => {
    if (!document) return;
    const a = window.document.createElement('a');
    a.href = apiClient.archiveItemUrl(document.id, item.path, true);
    a.download = item.path.split('/').pop() || 'arquivo';
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (!isOpen || !document) return null;

  const canDownload = verifyPermission(
    currentUser,
    'document',
    document.id,
    document.departmentId,
    'DOWNLOAD_DOCUMENT',
    document.folderId || undefined
  ).allowed;

  const renderPreview = (state: PreviewState, name: string, fileExt: string, isInner: boolean) => {
    switch (state.kind) {
      case 'loading':
        return (
          <div className="text-slate-400 text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />{' '}
            {['zip', 'rar'].includes(fileExt)
              ? 'Abrindo o arquivo compactado...'
              : officeMode === 'full' && FULL_OFFICE_EXT.includes(fileExt)
              ? 'Preparando a visualização completa (alguns segundos)...'
              : 'Carregando arquivo...'}
          </div>
        );
      case 'image':
        return <img src={state.url} alt={name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />;
      case 'pdf':
        return <iframe src={state.url} title={name} className="w-full h-full min-h-[60dvh] rounded-lg bg-white" />;
      case 'text':
        return (
          <div className="w-full h-full flex flex-col">
            {state.truncated && <div className="mb-2 text-[11px] text-amber-300">Mostrando apenas o primeiro 1 MB. Baixe para ver o arquivo completo.</div>}
            <pre className="flex-1 overflow-auto bg-white text-slate-800 rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap break-words select-text">{state.text}</pre>
          </div>
        );
      case 'sheet':
        return <SheetView sheets={state.sheets} />;
      case 'docx':
        return (
          <DocxView
            blocks={state.blocks}
            truncated={state.truncated}
            imageUrl={(part) => apiClient.docxImageUrl(document!.id, part, isInner ? inner?.item.path : undefined)}
          />
        );
      case 'archive':
        return (
          <ArchiveView
            format={state.format}
            items={state.items}
            truncated={state.truncated}
            canDownload={canDownload}
            onOpen={(item) => setInner({ item, preview: { kind: 'loading' } })}
            onDownload={downloadInner}
          />
        );
      case 'unsupported':
        return (
          <div className="text-center max-w-sm space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center">
              <FileText className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-white">Pré-visualização indisponível para .{fileExt || 'arquivo'}</p>
            <p className="text-xs text-slate-400">
              Dá para visualizar no navegador: PDF, imagens, textos, planilhas (.xlsx, .csv), documentos do Word (.docx) e o conteúdo de .zip e
              .rar. {['doc', 'xls', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'].includes(fileExt) ? 'Este formato abre quando a visualização completa estiver ligada (tela Sistema). ' : ''}
              {canDownload ? `Use “${isInner ? 'Baixar item' : 'Baixar'}” para abrir no seu computador.` : 'O download deste arquivo está bloqueado.'}
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="text-center max-w-md space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <p className="text-sm text-rose-200">{state.message}</p>
          </div>
        );
    }
  };

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
            inner ? (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Item de dentro do compactado */}
                <div className="shrink-0 px-3 sm:px-5 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2 text-white">
                  <button
                    type="button"
                    onClick={() => setInner(null)}
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 inline-flex items-center gap-1.5 shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" /> Voltar ao {ext.toUpperCase()}
                  </button>
                  <span className="text-xs text-slate-300 truncate flex-1" title={inner.item.path}>
                    {inner.item.path.split('/').join(' › ')}
                  </span>
                  {canDownload && !inner.item.encrypted && (
                    <button
                      type="button"
                      onClick={() => downloadInner(inner.item)}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Download className="w-4 h-4" /> <span className="hidden sm:inline">Baixar item</span>
                    </button>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center p-3 sm:p-6 min-h-0">
                  {renderPreview(inner.preview, inner.item.path.split('/').pop() || '', (inner.item.path.split('.').pop() || '').toLowerCase(), true)}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-3 sm:p-6 min-h-0">{renderPreview(preview, document.name, ext, false)}</div>
            )
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
