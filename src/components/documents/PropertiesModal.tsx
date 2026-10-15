import React, { useEffect, useMemo, useState } from 'react';
import { X, Info, ShieldCheck, Copy, Check, Lock, Loader2, Users, EyeOff, Download, Trash2, Eye, SlidersHorizontal } from 'lucide-react';
import { Department, DocumentItem, Folder, User } from '../../types';
import { FolderShareSection } from './FolderShareSection';

type Security = {
  visibility: 'folder' | 'private';
  downloadPolicy: 'folder' | 'owner' | 'none';
  deletePolicy: 'folder' | 'owner' | 'managers';
};

export type PropertiesTarget = { kind: 'doc'; doc: DocumentItem } | { kind: 'folder'; folder: Folder };

interface PropertiesModalProps {
  target: PropertiesTarget;
  icon: React.ReactNode;
  currentUser: User;
  departments: Department[];
  folders: Folder[];
  /** Tamanho e quantidade de itens (pastas) já calculados pelo explorador */
  folderSize?: number;
  folderItemCount?: number;
  typeLabel: string;
  formatBytes: (n: number) => string;
  /** O usuário é gestor do setor deste item (ou diretoria) */
  isManager: boolean;
  onClose: () => void;
  onSaveDocSecurity?: (docId: string, security: Partial<Security>) => Promise<unknown>;
  onUpdateFolder?: (folderId: string, updates: Partial<Folder>) => void;
  /** Gestão: abre as permissões detalhadas por colaborador */
  onOpenFolderPermissions?: (folder: Folder) => void;
}

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/** Grupo de opções (rádio) grande e fácil de tocar */
const OptionGroup = <T extends string>({
  title,
  icon,
  value,
  options,
  disabled,
  onChange,
}: {
  title: string;
  icon: React.ReactNode;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  disabled?: boolean;
  onChange: (v: T) => void;
}) => (
  <fieldset className="space-y-2" disabled={disabled}>
    <legend className="flex items-center gap-2 text-[13px] font-semibold text-slate-800 mb-2">
      {icon}
      {title}
    </legend>
    {options.map((o) => {
      const active = o.value === value;
      return (
        <label
          key={o.value}
          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            active ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'
          } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          <input
            type="radio"
            className="mt-0.5 accent-blue-600 w-4 h-4 shrink-0"
            checked={active}
            onChange={() => onChange(o.value)}
          />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-slate-900">{o.label}</span>
            <span className="block text-[12px] text-slate-500 leading-snug mt-0.5">{o.hint}</span>
          </span>
        </label>
      );
    })}
  </fieldset>
);

/**
 * Propriedades de um arquivo ou pasta, no estilo do Windows: aba Geral (informações) e
 * aba Segurança (quem pode ver, baixar e excluir). No celular abre de baixo para cima.
 */
export const PropertiesModal: React.FC<PropertiesModalProps> = ({
  target,
  icon,
  currentUser,
  departments,
  folders,
  folderSize = 0,
  folderItemCount = 0,
  typeLabel,
  formatBytes,
  isManager,
  onClose,
  onSaveDocSecurity,
  onUpdateFolder,
  onOpenFolderPermissions,
}) => {
  const [tab, setTab] = useState<'general' | 'security'>('general');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const doc = target.kind === 'doc' ? target.doc : null;
  const folder = target.kind === 'folder' ? target.folder : null;
  const name = doc?.name || folder?.name || '';
  const deptId = doc?.departmentId || folder?.departmentId || '';
  const dept = departments.find((d) => d.id === deptId);
  const isOwner = doc ? doc.ownerId === currentUser.id : folder?.createdBy === currentUser.id;
  const canEdit = isOwner || isManager;

  const initial: Security = {
    visibility: doc?.visibility || 'folder',
    downloadPolicy: doc?.downloadPolicy || 'folder',
    deletePolicy: doc?.deletePolicy || 'folder',
  };
  const [sec, setSec] = useState<Security>(initial);
  const [folderPrivate, setFolderPrivate] = useState<boolean>(Boolean(folder?.isPrivate));
  const dirty = doc
    ? sec.visibility !== initial.visibility || sec.downloadPolicy !== initial.downloadPolicy || sec.deletePolicy !== initial.deletePolicy
    : folderPrivate !== Boolean(folder?.isPrivate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Caminho: Setor › Pasta › Subpasta
  const location = useMemo(() => {
    const parts: string[] = [];
    let cursor = folders.find((f) => f.id === (doc ? doc.folderId : folder?.parentId));
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = folders.find((f) => f.id === cursor!.parentId);
    }
    return [dept?.name || doc?.departmentName || folder?.departmentName || 'Setor', ...parts].join(' › ');
  }, [doc, folder, folders, dept]);

  const ownerLabel = isOwner ? 'eu' : doc ? `quem enviou (${doc.ownerName.split(' ')[0]})` : 'quem criou';

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      setSaving(true);
      if (doc && onSaveDocSecurity) {
        await onSaveDocSecurity(doc.id, sec);
      } else if (folder && onUpdateFolder) {
        onUpdateFolder(folder.id, { isPrivate: folderPrivate });
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<[string, React.ReactNode]> = doc
    ? [
        ['Tipo', typeLabel],
        ['Local', location],
        ['Tamanho', `${formatBytes(doc.sizeBytes)} (${doc.sizeBytes.toLocaleString('pt-BR')} bytes)`],
        ['Enviado por', doc.ownerName],
        ['Criado em', formatDateTime(doc.createdAt)],
        ['Modificado em', formatDateTime(doc.updatedAt)],
        ['Versão', `v${doc.currentVersion || 1}`],
        [
          'Proteção',
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <Lock className="w-3.5 h-3.5" /> Criptografado no servidor (AES-256-GCM)
          </span>,
        ],
      ]
    : [
        ['Tipo', typeLabel],
        ['Local', location],
        ['Tamanho', formatBytes(folderSize)],
        ['Conteúdo', `${folderItemCount} ${folderItemCount === 1 ? 'item' : 'itens'}`],
        ['Criada em', formatDateTime(folder?.createdAt)],
        ['Modificada em', formatDateTime(folder?.updatedAt)],
        ['Acesso', folder?.isPrivate ? 'Privada' : folder?.isLocked ? 'Trancada (só com liberação da gestão)' : 'Todos do setor'],
      ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6 bg-slate-950/50 animate-in fade-in duration-150"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-label={`Propriedades de ${name}`}
        className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-bottom-0 duration-200"
      >
        <div className="md:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 shrink-0" />

        {/* Cabeçalho */}
        <div className="px-5 pt-3 md:pt-5 pb-3 flex items-center gap-3 shrink-0">
          <div className="w-12 flex justify-center shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Propriedades</div>
            <h2 className="text-[16px] font-bold text-slate-900 truncate">{name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="px-5 shrink-0">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl text-[13px] font-semibold">
            {([
              ['general', 'Geral', Info],
              ['security', 'Segurança', ShieldCheck],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-9 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  tab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          {tab === 'general' ? (
            <div className="space-y-4">
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3.5 py-2.5 text-[13px]">
                    <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
                    <dd className="flex-1 min-w-0 text-slate-900 break-words">{v}</dd>
                  </div>
                ))}
              </dl>

              {doc?.hashSha256 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-slate-700">Impressão digital (SHA-256)</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(doc.hashSha256).then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1500);
                        });
                      }}
                      className="text-[12px] font-semibold text-blue-700 inline-flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <code className="block mt-1.5 text-[11px] text-slate-600 break-all font-mono">{doc.hashSha256}</code>
                  <p className="mt-1.5 text-[11px] text-slate-500">Serve para comprovar que o arquivo não foi alterado.</p>
                </div>
              )}
            </div>
          ) : doc ? (
            <div className="space-y-5">
              {!canEdit && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 flex gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  Somente quem enviou o arquivo ({doc.ownerName}) ou a gestão do setor podem alterar a segurança.
                </div>
              )}
              <OptionGroup
                title="Quem pode ver este arquivo"
                icon={<Eye className="w-4 h-4 text-blue-600" />}
                value={sec.visibility}
                disabled={!canEdit}
                onChange={(v) => setSec((s) => ({ ...s, visibility: v }))}
                options={[
                  { value: 'folder', label: 'Todos com acesso à pasta', hint: 'Segue as permissões da pasta onde o arquivo está.' },
                  {
                    value: 'private',
                    label: `Somente ${ownerLabel} e a gestão do setor`,
                    hint: 'O arquivo fica oculto para os demais colaboradores.',
                  },
                ]}
              />
              <OptionGroup
                title="Quem pode baixar"
                icon={<Download className="w-4 h-4 text-blue-600" />}
                value={sec.downloadPolicy}
                disabled={!canEdit}
                onChange={(v) => setSec((s) => ({ ...s, downloadPolicy: v }))}
                options={[
                  { value: 'folder', label: 'Todos que podem ver', hint: 'Respeita a permissão de download da pasta.' },
                  { value: 'owner', label: `Somente ${ownerLabel} e a gestão do setor`, hint: 'Os demais só conseguem visualizar.' },
                  { value: 'none', label: 'Ninguém — apenas visualizar', hint: 'O botão Baixar fica bloqueado para todos.' },
                ]}
              />
              <OptionGroup
                title="Quem pode excluir"
                icon={<Trash2 className="w-4 h-4 text-blue-600" />}
                value={sec.deletePolicy}
                disabled={!canEdit}
                onChange={(v) => setSec((s) => ({ ...s, deletePolicy: v }))}
                options={[
                  { value: 'folder', label: 'Quem tem permissão na pasta', hint: 'Inclui quem enviou o arquivo.' },
                  { value: 'owner', label: `Somente ${ownerLabel} e a gestão do setor`, hint: 'Ninguém mais consegue enviar para a lixeira.' },
                  { value: 'managers', label: 'Somente a gestão do setor', hint: 'Protege o arquivo até contra exclusão por quem enviou.' },
                ]}
              />
              <p className="text-[12px] text-slate-500 flex gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                A gestão do setor e a diretoria nunca perdem o acesso ao arquivo. Toda alteração fica registrada na auditoria.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {!canEdit && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 flex gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  Somente quem criou a pasta ou a gestão do setor podem alterar a segurança dela.
                </div>
              )}
              <OptionGroup
                title="Quem pode ver esta pasta"
                icon={<EyeOff className="w-4 h-4 text-blue-600" />}
                value={folderPrivate ? 'private' : 'folder'}
                disabled={!canEdit}
                onChange={(v) => setFolderPrivate(v === 'private')}
                options={[
                  { value: 'folder', label: 'Todos do setor', hint: 'Respeita as permissões do setor e da pasta.' },
                  {
                    value: 'private',
                    label: `Somente ${isOwner ? 'eu' : 'quem criou'} e a gestão do setor`,
                    hint: 'A pasta e tudo o que estiver dentro ficam ocultos para os demais.',
                  },
                ]}
              />
              {folder && <FolderShareSection folder={folder} currentUser={currentUser} canManage={canEdit} />}
              {isManager && folder && onOpenFolderPermissions && (
                <button
                  type="button"
                  onClick={() => onOpenFolderPermissions(folder)}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-3 text-left"
                >
                  <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold text-slate-900">Permissões por colaborador</span>
                    <span className="block text-[12px] text-slate-500">Trancar a pasta e liberar ver, enviar, baixar ou excluir para cada pessoa.</span>
                  </span>
                  <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4 border-t border-slate-100 shrink-0">
          {error && <div className="mb-2 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 md:h-10 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[14px] md:text-[13px] font-semibold text-slate-700"
            >
              Fechar
            </button>
            {tab === 'security' && canEdit && (
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="h-11 md:h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[14px] md:text-[13px] font-semibold inline-flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                {saved ? 'Salvo' : 'Salvar segurança'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
