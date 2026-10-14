import React from 'react';

interface DocSecureLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
  /** 'light' = fundo claro (texto escuro); 'dark' = fundo escuro (texto claro) */
  tone?: 'light' | 'dark';
}

/**
 * Marca do DocSecure: ícone (pasta vermelha com a carinha da hummm!) + nome na fonte da marca.
 * O nome fica em uma cor só (sem o "Secure" azul do modelo antigo).
 */
export const DocSecureLogo: React.FC<DocSecureLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
  tone = 'dark',
}) => {
  const iconSizes = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-12 h-12', xl: 'w-14 h-14' };
  const titleSizes = { sm: 'text-[17px]', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' };
  const subSizes = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm', xl: 'text-base' };

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <img src="/icon.svg?v=2" alt="" aria-hidden="true" draggable={false} className={`${iconSizes[size]} shrink-0`} />
      <div className="flex flex-col">
        <span
          className={`ds-brand-font leading-none tracking-[0.01em] ${tone === 'light' ? 'text-slate-900' : 'text-[#fdf8cf]'} ${titleSizes[size]}`}
        >
          DocSecure
        </span>
        {showSubtitle && (
          <span className={`mt-1 font-normal leading-none ${tone === 'light' ? 'text-slate-500' : 'text-slate-400'} ${subSizes[size]}`}>
            Seus documentos, em boas mãos.
          </span>
        )}
      </div>
    </div>
  );
};
