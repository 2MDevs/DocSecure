import React from 'react';
import { HardDrive, MemoryStick, Cpu, FileText, Trash2, Database, Package, FolderLock, Info } from 'lucide-react';

const fmt = (bytes?: number | null) => {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(0, Math.round(b / 1024)).toLocaleString('pt-BR')} KB`;
};
const pct = (n?: number | null) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Barra: parte usada pelo DocSecure (cor) + livre no servidor (verde claro) + resto (outros programas) */
const ShareBar: React.FC<{ used: number; free: number; total: number; color: string }> = ({ used, free, total, color }) => {
  const u = total ? Math.max(used / total, used > 0 ? 0.004 : 0) * 100 : 0;
  const f = total ? (free / total) * 100 : 0;
  return (
    <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex" aria-hidden="true">
      <div className={color} style={{ width: `${u}%` }} />
      <div className="flex-1" />
      <div className="bg-emerald-200" style={{ width: `${f}%` }} />
    </div>
  );
};

const Legend: React.FC<{ items: Array<[string, string]> }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-2">
    {items.map(([cls, label]) => (
      <span key={label} className="inline-flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} /> {label}
      </span>
    ))}
  </div>
);

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({ icon, label, value, hint }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0 text-[13px]">
    <span className="flex items-center gap-2 text-slate-600 min-w-0">
      <span className="text-slate-400 shrink-0">{icon}</span>
      <span className="truncate">
        {label}
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </span>
    <span className="font-semibold text-slate-900 tabular-nums shrink-0">{value}</span>
  </div>
);

/**
 * Aba "Recursos da plataforma": quanto o DocSecure consome do servidor (VPS compartilhada),
 * separado do que os outros sistemas da VPS usam.
 */
export const PlatformUsagePanel: React.FC<{ usage: any }> = ({ usage }) => {
  if (!usage) {
    return <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">Carregando o consumo da plataforma…</div>;
  }
  const d = usage.disk || {};
  const m = usage.memory || {};
  const c = usage.cpu || {};
  const docs = usage.documents || {};
  const diskTotal = Number(d.serverTotalBytes) || 0;
  const memTotal = Number(m.serverTotalBytes) || 0;

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-[12.5px] text-blue-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        Estes números mostram só o que o DocSecure consome. O servidor é compartilhado com outros sistemas: o
        consumo total dele está na aba “Servidor”.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* DISCO */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Disco & Armazenamento</div>
              <div className="text-[15px] font-bold text-slate-900">{fmt(d.totalBytes)} usados pelo DocSecure</div>
            </div>
          </div>
          {diskTotal > 0 && (
            <div className="mt-4">
              <ShareBar used={d.totalBytes} free={d.serverFreeBytes} total={diskTotal} color="bg-amber-500" />
              <Legend items={[['bg-amber-500', `DocSecure ${pct(d.percentOfServer)}`], ['bg-slate-200', 'Outros sistemas'], ['bg-emerald-200', 'Livre']]} />
            </div>
          )}
          <div className="mt-3">
            <Row icon={<FolderLock className="w-4 h-4" />} label="Arquivos dos setores" hint="Criptografados, incluindo a lixeira" value={fmt(d.filesBytes)} />
            <Row icon={<Database className="w-4 h-4" />} label="Banco de dados" value={fmt(d.databaseBytes)} />
            <Row icon={<Package className="w-4 h-4" />} label="Aplicação instalada" hint="Código e dependências" value={fmt(d.appBytes)} />
            {diskTotal > 0 && <Row icon={<HardDrive className="w-4 h-4" />} label="Livre no servidor" value={`${fmt(d.serverFreeBytes)} de ${fmt(diskTotal)}`} />}
          </div>
        </section>

        {/* MEMÓRIA */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <MemoryStick className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Memória RAM</div>
              <div className="text-[15px] font-bold text-slate-900">{fmt(m.rssBytes)} usados pelo DocSecure</div>
            </div>
          </div>
          {memTotal > 0 && (
            <div className="mt-4">
              <ShareBar used={m.rssBytes} free={m.serverFreeBytes} total={memTotal} color="bg-violet-500" />
              <Legend items={[['bg-violet-500', `DocSecure ${pct(m.percentOfServer)}`], ['bg-slate-200', 'Outros sistemas'], ['bg-emerald-200', 'Livre']]} />
            </div>
          )}
          <div className="mt-3">
            <Row icon={<MemoryStick className="w-4 h-4" />} label="Em uso pelo DocSecure" value={fmt(m.rssBytes)} />
            <Row icon={<MemoryStick className="w-4 h-4" />} label="Dados da aplicação (heap)" value={`${fmt(m.heapUsedBytes)} de ${fmt(m.heapTotalBytes)}`} />
            {memTotal > 0 && <Row icon={<MemoryStick className="w-4 h-4" />} label="Livre no servidor" value={`${fmt(m.serverFreeBytes)} de ${fmt(memTotal)}`} />}
          </div>
        </section>

        {/* PROCESSADOR */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Processador</div>
              <div className="text-[15px] font-bold text-slate-900">{pct(c.percentOfServer)} do servidor</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex" aria-hidden="true">
              <div className="bg-sky-500" style={{ width: `${Math.max(Number(c.percentOfServer) || 0, 0.4)}%` }} />
              <div className="bg-slate-400/60" style={{ width: `${Math.max(0, (Number(c.serverLoadPercent) || 0) - (Number(c.percentOfServer) || 0))}%` }} />
            </div>
            <Legend items={[['bg-sky-500', 'DocSecure'], ['bg-slate-400/60', 'Outros sistemas'], ['bg-slate-200', 'Livre']]} />
          </div>
          <div className="mt-3">
            <Row icon={<Cpu className="w-4 h-4" />} label="Uso pelo DocSecure" hint="Média dos últimos segundos" value={pct(c.percentOfServer)} />
            <Row icon={<Cpu className="w-4 h-4" />} label="Equivale a, de 1 núcleo" value={pct(c.percentOfCore)} />
            <Row icon={<Cpu className="w-4 h-4" />} label="Uso total do servidor" value={`${c.serverLoadPercent ?? 0}% de ${c.cores ?? '?'} núcleos`} />
          </div>
        </section>
      </div>

      {/* Documentos */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <Row icon={<FileText className="w-4 h-4" />} label="Arquivos ativos" value={`${(docs.active || 0).toLocaleString('pt-BR')} • ${fmt(docs.activeBytes)}`} />
        <Row icon={<Trash2 className="w-4 h-4" />} label="Na lixeira (apagados em até 7 dias)" value={`${(docs.trash || 0).toLocaleString('pt-BR')} • ${fmt(docs.trashBytes)}`} />
      </section>
    </div>
  );
};
