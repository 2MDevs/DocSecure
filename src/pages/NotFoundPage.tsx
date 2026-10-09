import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DocSecureLogo } from '../components/common/DocSecureLogo';
import { ArrowLeft, Home, FileQuestion } from 'lucide-react';
import { User } from '../types';

interface NotFoundPageProps {
  currentUser?: User | null;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ currentUser }) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    if (!currentUser) {
      navigate('/login');
    } else if (currentUser.role === 'DEVELOPER') {
      navigate('/painel');
    } else {
      navigate('/documentos');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#08101e] text-slate-100 flex items-center justify-center p-4 sm:p-6 relative select-none">
      {/* Glow backgrounds */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-[#0c172c] border border-slate-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl text-center relative z-10">
        <div className="flex justify-center mb-6">
          <DocSecureLogo size="md" showSubtitle={false} />
        </div>

        <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-blue-400">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="text-4xl font-extrabold font-mono text-blue-400 tracking-wider mb-2">
          404
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Página não encontrada
        </h1>

        <p className="text-sm text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          O endereço acessado não existe, foi movido ou você não possui autorização para este recurso.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar página anterior</span>
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Ir para o Início</span>
          </button>
        </div>
      </div>
    </div>
  );
};
