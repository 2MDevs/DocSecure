import React, { useEffect } from 'react';
import { Sparkles, X, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import type { UpdateNotice } from '../../services/apiClient';

interface UpdateNoticeDialogProps {
  notice: UpdateNotice;
  /** Só o desenvolvedor pode aplicar a atualização */
  canApply: boolean;
  onApply: () => void;
  onClose: () => void;
}

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * Detalhes da nova atualização. No computador abre como caixa de diálogo central;
 * no celular sobe da parte de baixo da tela, como nos aplicativos.
 */
export const UpdateNoticeDialog: React.FC<UpdateNoticeDialogProps> = ({ notice, canApply, onApply, onClose }) => {
  const changes = notice.changes || [];
  const total = changes.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6 bg-slate-950/50 animate-in fade-in duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Nova atualização disponível"
        className="w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] md:max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-bottom-0 duration-200"
      >
        <div className="md:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 shrink-0" />

        {/* Cabeçalho */}
        <div className="px-5 md:px-6 pt-4 md:pt-6 pb-4 flex items-start gap-3.5 border-b border-slate-100 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight">Nova atualização disponível</h2>
            <p className="text-[13px] text-slate-500 mt-1">
              {total === 1 ? '1 melhoria' : `${total} melhorias`}
              {notice.date ? ` • publicada em ${formatDate(notice.date)}` : ''}
              {notice.version ? ` • versão ${notice.version}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 -mr-1.5 -mt-1 rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-100 flex items-center justify-center shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* O que muda */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 md:px-6 py-4 space-y-4">
          {changes.map((c, i) => (
            <section key={i} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <h3 className="text-[14.5px] font-semibold text-slate-900 flex items-start gap-2">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0">{c.title}</span>
              </h3>
              {c.items.length > 0 && (
                <ul className="mt-2.5 space-y-1.5 pl-7">
                  {c.items.map((item, j) => (
                    <li key={j} className="text-[13px] text-slate-600 leading-relaxed flex gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-[3px]" />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Rodapé */}
        <div className="px-5 md:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5 border-t border-slate-100 bg-white shrink-0">
          {notice.running ? (
            <div className="mb-3 text-[13px] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" /> A atualização está sendo aplicada agora.
            </div>
          ) : (
            !canApply && (
              <p className="mb-3 text-[12.5px] text-slate-500">
                A equipe de TI vai aplicar esta atualização. Você não precisa fazer nada.
              </p>
            )
          )}
          <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 md:h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[14px] md:text-[13px] font-semibold text-slate-700"
            >
              Fechar
            </button>
            {canApply && !notice.running && (
              <button
                type="button"
                onClick={onApply}
                className="h-11 md:h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[14px] md:text-[13px] font-semibold inline-flex items-center justify-center gap-2"
              >
                Atualizar agora <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
