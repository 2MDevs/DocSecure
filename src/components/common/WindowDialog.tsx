import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';

interface WindowDialogProps {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Janela no estilo do Windows: barra de título com ícone, maximizar/restaurar e fechar.
 * Pode ser arrastada pela barra de título (no computador). Esc fecha.
 */
export const WindowDialog: React.FC<WindowDialogProps> = ({ title, icon, onClose, children }) => {
  const [maximized, setMaximized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Não fecha se houver outro modal aberto por cima (ex.: confirmação dentro da janela)
      if (e.key === 'Escape' && document.querySelectorAll('.fixed.inset-0').length <= 1) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (maximized || window.innerWidth < 768 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.baseX + e.clientX - drag.current.startX, y: drag.current.baseY + e.clientY - drag.current.startY });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-0 md:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label={title}
        className={`bg-[#f8fafc] flex flex-col shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          maximized ? 'w-full h-full rounded-none' : 'w-full h-full md:w-[min(1200px,94vw)] md:h-[min(860px,88vh)] md:rounded-lg'
        }`}
        style={maximized ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        {/* Barra de título */}
        <div
          className="h-10 shrink-0 bg-white border-b border-slate-200 flex items-center pl-3 select-none cursor-default"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => setMaximized((m) => !m)}
        >
          <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
          <span className="ml-2 text-[13px] text-slate-800 truncate flex-1">{title}</span>
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            className="hidden md:flex w-11 h-10 items-center justify-center text-slate-600 hover:bg-slate-100"
            title={maximized ? 'Restaurar' : 'Maximizar'}
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-10 flex items-center justify-center text-slate-600 hover:bg-red-600 hover:text-white"
            title="Fechar (Esc)"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
};
