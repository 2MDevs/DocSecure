import React from 'react';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full font-semibold overflow-hidden select-none shrink-0 ${sizeClasses[size]} ${
        avatarUrl
          ? 'bg-slate-200'
          : 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-sm ring-1 ring-white/20'
      } ${className}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => {
            // fallback to initials if image fails
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : null}
      <span>{initials || 'DS'}</span>
    </div>
  );
};
