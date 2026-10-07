import React from 'react';

interface DocSecureLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

export const DocSecureLogo: React.FC<DocSecureLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const subSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base',
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* 3D Modern Shield Icon matching reference image */}
      <div className={`relative ${iconSizes[size]} flex items-center justify-center shrink-0`}>
        <div className="absolute inset-0 bg-blue-500/20 rounded-xl blur-sm" />
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md relative z-10"
        >
          {/* Outer Shield with gradient */}
          <path
            d="M24 4L7 11V22C7 32.5 14.2 42.2 24 44C33.8 42.2 41 32.5 41 22V11L24 4Z"
            fill="url(#shield_gradient_main)"
            stroke="#38bdf8"
            strokeWidth="1.5"
          />
          {/* Inner Highlight Shield */}
          <path
            d="M24 7L10 13V22.5C10 31 16 39 24 40.8C32 39 38 31 38 22.5V13L24 7Z"
            fill="url(#shield_gradient_inner)"
            fillOpacity="0.85"
          />
          {/* Subtle Padlock / Document Symbol in center */}
          <rect x="18" y="22" width="12" height="10" rx="2" fill="#ffffff" fillOpacity="0.95" />
          <path
            d="M20 22V18C20 15.8 21.8 14 24 14C26.2 14 28 15.8 28 18V22"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="27" r="1.5" fill="#1e3a8a" />

          <defs>
            <linearGradient id="shield_gradient_main" x1="7" y1="4" x2="41" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1d4ed8" />
              <stop offset="0.5" stopColor="#2563eb" />
              <stop offset="1" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="shield_gradient_inner" x1="10" y1="7" x2="38" y2="41" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3b82f6" />
              <stop offset="1" stopColor="#1e40af" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex flex-col">
        <span className={`font-bold tracking-tight text-white ${titleSizes[size]}`}>
          Doc<span className="text-blue-400">Secure</span>
        </span>
        {showSubtitle && (
          <span className={`text-slate-400 font-normal leading-none ${subSizes[size]}`}>
            Seus documentos, em boas mãos.
          </span>
        )}
      </div>
    </div>
  );
};
