import React from 'react';

interface BrandLockupProps {
  /** Tamanho do conjunto */
  size?: 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

/**
 * Logo da marca (hummm! Pizzas, arquivo oficial em /public/brand) + o nome da plataforma, DocSecure,
 * na fonte da marca (/public/fonts/marca-docsecure.woff). Para usar o arquivo de fonte oficial
 * enviado pela agência, basta substituir esse arquivo mantendo o mesmo nome.
 */
export const BrandLockup: React.FC<BrandLockupProps> = ({ size = 'lg', showTagline = true, className = '' }) => (
  <div className={`flex flex-col items-start select-none ${className}`}>
    <img
      src="/brand/hummm-logo-escuro.svg"
      alt="hummm! Pizzas"
      className={size === 'lg' ? 'h-14 sm:h-16 w-auto' : 'h-11 w-auto'}
      draggable={false}
    />
    <div className="mt-4 flex items-center gap-3">
      <span className="h-px w-6 bg-[#f6d35c]/60" aria-hidden="true" />
      <span
        className={`ds-brand-font leading-none tracking-[0.02em] text-[#fdf8cf] ${size === 'lg' ? 'text-[28px] sm:text-[32px]' : 'text-2xl'}`}
      >
        Doc<span className="text-[#f6d35c]">Secure</span>
      </span>
    </div>
    {showTagline && <span className="mt-2 text-[13px] text-stone-400">Seus documentos, em boas mãos.</span>}
  </div>
);
