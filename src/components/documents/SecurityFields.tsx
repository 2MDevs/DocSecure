import React from 'react';
import { ShieldCheck, Eye, Download, Trash2 } from 'lucide-react';
import type { DocSecurity } from '../../types';

export const DEFAULT_SECURITY: Required<DocSecurity> = { visibility: 'folder', downloadPolicy: 'folder', deletePolicy: 'folder' };

const SELECT =
  'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 disabled:opacity-60';

/**
 * Segurança do arquivo escolhida já no envio (as mesmas opções de Propriedades → Segurança).
 * Pode ser alterada depois em Propriedades.
 */
export const SecurityFields: React.FC<{
  value: Required<DocSecurity>;
  onChange: (v: Required<DocSecurity>) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const set = (patch: Partial<DocSecurity>) => onChange({ ...value, ...patch } as Required<DocSecurity>);
  const custom = value.visibility !== 'folder' || value.downloadPolicy !== 'folder' || value.deletePolicy !== 'folder';
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5" disabled={disabled}>
      <legend className="px-1 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Segurança do arquivo
        {custom && <span className="ml-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">Personalizada</span>}
      </legend>
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 mb-1">
          <Eye className="w-3 h-3" /> Quem pode ver
        </span>
        <select className={SELECT} value={value.visibility} onChange={(e) => set({ visibility: e.target.value as DocSecurity['visibility'] })}>
          <option value="folder">Todos com acesso à pasta</option>
          <option value="private">Somente eu e a gestão do setor</option>
        </select>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 mb-1">
            <Download className="w-3 h-3" /> Quem pode baixar
          </span>
          <select className={SELECT} value={value.downloadPolicy} onChange={(e) => set({ downloadPolicy: e.target.value as DocSecurity['downloadPolicy'] })}>
            <option value="folder">Todos que podem ver</option>
            <option value="owner">Somente eu e a gestão</option>
            <option value="none">Ninguém (só visualizar)</option>
          </select>
        </label>
        <label className="block">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 mb-1">
            <Trash2 className="w-3 h-3" /> Quem pode excluir
          </span>
          <select className={SELECT} value={value.deletePolicy} onChange={(e) => set({ deletePolicy: e.target.value as DocSecurity['deletePolicy'] })}>
            <option value="folder">Quem tem permissão na pasta</option>
            <option value="owner">Somente eu e a gestão</option>
            <option value="managers">Somente a gestão do setor</option>
          </select>
        </label>
      </div>
      <p className="text-[10.5px] text-slate-500">A gestão do setor e a diretoria sempre mantêm o acesso. Dá para mudar depois em Propriedades.</p>
    </fieldset>
  );
};
