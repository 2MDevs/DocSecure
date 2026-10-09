import React, { useState } from 'react';
import {
  Folder as FolderIcon,
  FileText,
  FileSpreadsheet,
  Clock,
  Star,
  Search,
  SlidersHorizontal,
  ChevronRight,
  MoreVertical,
  Plus,
  ArrowLeft,
  Home,
  Users,
  Building,
  Menu,
  ShieldCheck,
  Download,
  Share2,
  ChevronLeft,
  Lock,
  UserCheck,
  ClipboardList,
  Shield,
  FileCode,
} from 'lucide-react';
import { User, Department, Folder, DocumentItem } from '../../types';
import { DocSecureLogo } from '../common/DocSecureLogo';
import { Avatar } from '../common/Avatar';

interface MobileAppFrameProps {
  currentUser: User;
  departments: Department[];
  folders: Folder[];
  documents: DocumentItem[];
  onOpenDocument: (doc: DocumentItem) => void;
  onOpenUpload: () => void;
  onAccessDenied: (reason: string, resourceName: string) => void;
}

export const MobileAppFrame: React.FC<MobileAppFrameProps> = ({
  currentUser,
  departments,
  folders,
  documents,
  onOpenDocument,
  onOpenUpload,
  onAccessDenied,
}) => {
  const isDeveloper = currentUser.role === 'DEVELOPER';
  const [activeTab, setActiveTab] = useState<'inicio' | 'pastas' | 'favoritos' | 'mais' | 'usuarios' | 'setores'>('inicio');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [rhActiveTab, setRhActiveTab] = useState<'arquivos' | 'permissoes'>('arquivos');
  const [searchTerm, setSearchTerm] = useState('');

  const selectedDept = departments.find((d) => d.id === selectedDeptId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const deptFolders = folders.filter((f) => f.departmentId === selectedDeptId);
  const deptDocs = documents.filter((d) => d.departmentId === selectedDeptId);

  const handleOpenSector = (dept: Department) => {
    if (currentUser.role === 'EMPLOYEE' && dept.id !== currentUser.departmentId && dept.id !== 'dept-gerais') {
      onAccessDenied(`Você é colaborador do setor ${currentUser.departmentName} e não possui autorização para este setor.`, dept.name);
      return;
    }
    setSelectedDeptId(dept.id);
    setSelectedFolderId(null);
  };

  const getFileIcon = (ext: string) => {
    switch (ext) {
      case 'xlsx':
        return (
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        );
      case 'pdf':
        return (
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3 flex items-center justify-center select-none">
      {/* Mobile Device Frame Mockup replicating exact 390x844px iPhone geometry */}
      <div className="w-full max-w-[390px] h-[844px] bg-slate-50 rounded-[44px] border-[10px] border-slate-800 shadow-2xl overflow-hidden flex flex-col relative">
        {/* iOS Dynamic Island / Notch */}
        <div className="bg-[#0b1528] pt-2 px-6 pb-2 flex items-center justify-between text-white text-xs z-20">
          <span className="font-semibold text-[13px]">9:41</span>
          <div className="w-20 h-4 bg-black rounded-full mx-auto" />
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold">5G</span>
            <div className="w-4 h-2.5 border border-white rounded-xs p-0.5 flex">
              <div className="w-full h-full bg-white rounded-xs" />
            </div>
          </div>
        </div>

        {/* Mobile Header matching screen #2 and #3 */}
        {!selectedDeptId ? (
          <div className="bg-[#0b1528] px-4 py-3 flex items-center justify-between text-white border-b border-slate-800">
            <DocSecureLogo size="sm" showSubtitle={false} />

            <div className="flex items-center gap-2">
              <Avatar name={currentUser.name} avatarUrl={currentUser.avatar} size="xs" />
              <div className="text-left">
                <span className="text-xs font-bold block leading-tight">{currentUser.name}</span>
                <span className="text-[10px] text-slate-400 leading-none">
                  {currentUser.role === 'DEVELOPER' ? 'Administrador' : currentUser.role}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Sub-screen Top Bar matching screen #4 & #5 */
          <div className="bg-[#0b1528] px-4 py-3 flex items-center justify-between text-white border-b border-slate-800">
            <button
              type="button"
              onClick={() => {
                if (selectedFolderId) setSelectedFolderId(null);
                else setSelectedDeptId(null);
              }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <span className="text-sm font-bold text-white truncate max-w-[200px]">
              {selectedFolder ? selectedFolder.name : selectedDept?.name}
            </span>

            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        )}

        {/* Mobile Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
          {/* SCREEN 2: Mobile Painel do Desenvolvedor */}
          {isDeveloper && !selectedDeptId && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <h2 className="text-base font-bold text-slate-900">Olá, Desenvolvedor!</h2>
                <p className="text-xs text-slate-500">Aqui está um resumo do sistema.</p>
              </div>

              {/* 4 Stats in 2x2 grid matching Mobile Screenshot #2 */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 block">Usuários Cadastrados</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">248</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                    <FolderIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 block">Setores de Área</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">12</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-2">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 block">Colaboradores Ativos</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">1.432</span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-2">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 block">Acessos Hoje</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">86</span>
                </div>
              </div>

              {/* Ações Rápidas List */}
              <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-2xs space-y-1">
                <span className="text-xs font-bold text-slate-900 block p-2 pb-1">Ações Rápidas</span>

                {[
                  { title: 'Cadastrar Usuário', sub: 'Adicione novos colaboradores', icon: Users },
                  { title: 'Gerenciar Setores', sub: 'Crie e edite os setores da empresa', icon: Building },
                  { title: 'Configurar Permissões', sub: 'Defina o que cada usuário pode acessar', icon: ShieldCheck },
                  { title: 'Ver Logs de Acesso', sub: 'Acompanhe as atividades no sistema', icon: ClipboardList },
                ].map((act, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <act.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block leading-tight">{act.title}</span>
                        <span className="text-[10px] text-slate-400">{act.sub}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCREEN 3: Mobile Meus Documentos (Colaborador / Gestor) */}
          {!isDeveloper && !selectedDeptId && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <h2 className="text-base font-bold text-slate-900">Olá, {currentUser.name.split(' ')[0]}!</h2>
                <p className="text-xs text-slate-500">Acesse rapidamente seus documentos e pastas.</p>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar documentos, pastas..."
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* 3 Quick Action Pills matching Mobile Screenshot #3 */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDeptId(departments[0]?.id || null)}
                  className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col items-center text-center shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5">
                    <FolderIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">Meus Docs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const doc = documents[0];
                    if (doc) onOpenDocument(doc);
                  }}
                  className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col items-center text-center shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">Recentes</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const fav = documents.find((d) => d.isFavorite);
                    if (fav) onOpenDocument(fav);
                  }}
                  className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col items-center text-center shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center mb-1.5">
                    <Star className="w-4 h-4 fill-amber-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">Favoritos</span>
                </button>
              </div>

              {/* Meus Setores List matching screen #3 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs space-y-1">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 px-1">
                  <span className="text-xs font-bold text-slate-900">Meus Setores</span>
                  <span className="text-[11px] text-blue-600 font-semibold">Ver todos &gt;</span>
                </div>

                {departments.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Nenhum setor cadastrado ainda.</p>
                ) : (
                  departments.slice(0, 5).map((dept) => (
                    <div
                      key={dept.id}
                      onClick={() => handleOpenSector(dept)}
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                          <FolderIcon className="w-5 h-5 fill-amber-400 text-amber-500" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{dept.name}</span>
                          <span className="text-[10px] text-slate-400">{dept.itemCount} itens</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SCREEN 4 & 5: Mobile Department / Folder View */}
          {selectedDeptId && (
            <div className="space-y-4 animate-in fade-in">
              {/* Sector Banner if RH detail matching screen #5 */}
              {selectedDept?.id === 'dept-rh' && !selectedFolderId && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                        <FolderIcon className="w-6 h-6 fill-amber-400 text-amber-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">RH</h3>
                        <span className="text-[10px] text-slate-500">8 itens • Acesso: Equipe RH</span>
                      </div>
                    </div>
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>

                  {/* Tabs: Arquivos | Permissões */}
                  <div className="flex border-b border-slate-100 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setRhActiveTab('arquivos')}
                      className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                        rhActiveTab === 'arquivos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                      }`}
                    >
                      Arquivos
                    </button>
                    <button
                      type="button"
                      onClick={() => setRhActiveTab('permissoes')}
                      className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                        rhActiveTab === 'permissoes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                      }`}
                    >
                      Permissões
                    </button>
                  </div>
                </div>
              )}

              {/* Breadcrumb matching screen #4 */}
              <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <span>Início</span>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span className="text-blue-600 font-bold">{selectedDept?.name}</span>
              </div>

              {/* Items List (Folders & Files) matching screen #4 & #5 */}
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-2xs overflow-hidden">
                {/* Subfolders */}
                {deptFolders.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                        <FolderIcon className="w-5 h-5 fill-amber-400 text-amber-500" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{f.name}</span>
                        <span className="text-[10px] text-slate-400">{f.itemCount} itens • {f.updatedAt}</span>
                      </div>
                    </div>
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>
                ))}

                {/* Documents */}
                {deptDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => onOpenDocument(doc)}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {getFileIcon(doc.extension)}
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{doc.name}</span>
                        <span className="text-[10px] text-slate-400">
                          {(doc.sizeBytes / 1024).toFixed(0)} KB • {doc.updatedAt}
                        </span>
                      </div>
                    </div>
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Floating Action Button (+) matching mobile screenshots #4 & #5 */}
        <button
          type="button"
          onClick={onOpenUpload}
          className="absolute bottom-16 right-5 w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg shadow-blue-600/40 flex items-center justify-center z-20 cursor-pointer transition-transform active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>

        {/* Mobile Bottom Navigation Bar matching screenshot */}
        <div className="bg-white border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-slate-400 z-10">
          <button
            type="button"
            onClick={() => {
              setSelectedDeptId(null);
              setSelectedFolderId(null);
              setActiveTab('inicio');
            }}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'inicio' && !selectedDeptId ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Início</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedDeptId(departments[0]?.id || null);
              setActiveTab('pastas');
            }}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'pastas' || selectedDeptId ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            <FolderIcon className="w-4 h-4" />
            <span>Pastas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const fav = documents.find((d) => d.isFavorite);
              if (fav) onOpenDocument(fav);
            }}
            className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
          >
            <Star className="w-4 h-4" />
            <span>Favoritos</span>
          </button>

          <button
            type="button"
            onClick={() => alert('Configurações da conta, dispositivos e credenciais 2FA.')}
            className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
          >
            <Menu className="w-4 h-4" />
            <span>Mais</span>
          </button>
        </div>
      </div>
    </div>
  );
};
