import React from 'react';
import { Lock, HardDrive, Image as ImageIcon, EyeOff, Users } from 'lucide-react';

/**
 * Ícones e utilidades compartilhados pelas telas no estilo do Explorador do Windows
 * (Início, Favoritos, Compartilhados e Lixeira).
 */
// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: i === 0 ? 0 : value < 10 ? 1 : 0 })} ${units[i]}`;
}


export const TYPE_LABEL: Record<string, string> = {
  pdf: 'Documento PDF',
  doc: 'Documento do Word',
  docx: 'Documento do Word',
  xls: 'Planilha do Excel',
  xlsx: 'Planilha do Excel',
  csv: 'Arquivo CSV',
  ppt: 'Apresentação do PowerPoint',
  pptx: 'Apresentação do PowerPoint',
  png: 'Imagem PNG',
  jpg: 'Imagem JPEG',
  jpeg: 'Imagem JPEG',
  gif: 'Imagem GIF',
  webp: 'Imagem WEBP',
  zip: 'Pasta compactada',
  rar: 'Arquivo compactado',
  txt: 'Documento de texto',
};
export const typeLabel = (ext: string) => TYPE_LABEL[ext?.toLowerCase()] || `Arquivo ${ext?.toUpperCase() || ''}`.trim();

export const EXT_COLORS: Record<string, string> = {
  pdf: '#dc2626',
  doc: '#2563eb',
  docx: '#2563eb',
  xls: '#16a34a',
  xlsx: '#16a34a',
  csv: '#15803d',
  ppt: '#ea580c',
  pptx: '#ea580c',
  zip: '#ca8a04',
  rar: '#ca8a04',
  txt: '#64748b',
};
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Ícone de pasta no estilo do Windows */
export const FolderGlyph: React.FC<{ size: number; locked?: boolean; dimmed?: boolean; privateFolder?: boolean; shared?: boolean }> = ({ size, locked, dimmed, privateFolder, shared }) => (
  <div className={`relative ${dimmed ? 'opacity-60' : ''}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M4 14a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z" fill="#e0a526" />
      <path d="M4 22h56v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#f8c94a" />
      <path d="M4 22h56v3H4z" fill="#fbd96b" />
    </svg>
    {shared && (
      <span className="absolute -bottom-0.5 -left-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200" title="Pasta compartilhada">
        <Users className="text-sky-600" style={{ width: size * 0.22, height: size * 0.22 }} />
      </span>
    )}
    {(locked || privateFolder) && (
      <span
        className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200"
        title={privateFolder ? 'Pasta privada' : 'Pasta trancada'}
      >
        {privateFolder ? (
          <EyeOff className="text-violet-600" style={{ width: size * 0.22, height: size * 0.22 }} />
        ) : (
          <Lock className="text-slate-600" style={{ width: size * 0.22, height: size * 0.22 }} />
        )}
      </span>
    )}
  </div>
);

/** Ícone de unidade (setor) no estilo "Este Computador" */
export const DriveGlyph: React.FC<{ size: number; locked?: boolean }> = ({ size, locked }) => (
  <div className={`relative ${locked ? 'opacity-60' : ''}`} style={{ width: size, height: size }}>
    <FolderGlyph size={size} />
    <HardDrive
      className="absolute text-amber-900/70"
      style={{ width: size * 0.32, height: size * 0.32, left: size * 0.34, top: size * 0.44 }}
    />
    {locked && (
      <span className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow border border-slate-200">
        <Lock className="text-rose-600" style={{ width: size * 0.22, height: size * 0.22 }} />
      </span>
    )}
  </div>
);

/** Ícone de arquivo: folha com canto dobrado e etiqueta da extensão */
export const FileGlyph: React.FC<{ ext: string; size: number }> = ({ ext, size }) => {
  const e = (ext || '').toLowerCase();
  if (IMAGE_EXT.includes(e)) {
    return (
      <div
        className="rounded-md bg-gradient-to-br from-sky-100 to-indigo-100 border border-slate-200 flex items-center justify-center"
        style={{ width: size * 0.82, height: size }}
      >
        <ImageIcon className="text-indigo-500" style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    );
  }
  const color = EXT_COLORS[e] || '#475569';
  const label = (e || 'arq').toUpperCase().slice(0, 4);
  return (
    <svg viewBox="0 0 52 64" width={size * 0.82} height={size} aria-hidden="true">
      <path d="M4 2h30l14 14v44a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M34 2v12a2 2 0 0 0 2 2h12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="6" y="34" width="40" height="16" rx="3" fill={color} />
      <text x="26" y="46" textAnchor="middle" fontSize={label.length > 3 ? 9 : 11} fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">
        {label}
      </text>
    </svg>
  );
};

