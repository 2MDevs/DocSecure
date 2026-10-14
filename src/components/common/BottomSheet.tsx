import React, { useEffect } from 'react';

interface BottomSheetProps {
  onClose: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
}

/** Painel que sobe da parte de baixo da tela (padrão de apps de celular). */
export const BottomSheet: React.FC<BottomSheetProps> = ({ onClose, header, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => (e.stopPropagation(), onClose())} role="presentation">
      <div className="absolute inset-0 bg-slate-950/40 animate-in fade-in duration-150" />
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-h-[85dvh] overflow-y-auto bg-white rounded-t-3xl shadow-2xl pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300" />
        {header}
        <div className="py-1">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="mx-4 mt-1 mb-1 w-[calc(100%-2rem)] h-12 rounded-xl bg-slate-100 active:bg-slate-200 text-[15px] font-semibold text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
