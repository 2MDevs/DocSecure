import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Faixa no topo para quem abriu o DocSecure pelo aplicativo do Gestão Hummm!: volta para o Gestão na mesma aba.
 * Cores da marca: amarelo #F6D35C e grafite #1D1D1B.
 */
export const GestaoReturnBar: React.FC<{ url: string }> = ({ url }) => (
  <div className="shrink-0 bg-[#1D1D1B] text-[#FDF8CF] px-3 sm:px-5 h-9 flex items-center justify-between gap-3 text-xs">
    <a
      href={url}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#F6D35C] text-[#1D1D1B] font-bold px-3 py-1 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#F6D35C]/60"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      Voltar ao Gestão
    </a>
    <span className="truncate opacity-80">Você entrou pelo Gestão Hummm!</span>
  </div>
);

/**
 * Conta criada na primeira entrada pelo Gestão, ainda sem setor: a pessoa não vê nenhuma pasta até o
 * administrador do DocSecure vincular a conta a um setor (Usuários → editar → Setor).
 */
export const PendingSectorBanner: React.FC = () => (
  <div className="shrink-0 bg-[#FDF8CF] border-b border-[#F6D35C] text-[#1D1D1B] px-3 sm:px-5 py-2 text-xs">
    <strong>Sua conta foi criada e ainda não está ligada a um setor.</strong> Peça ao administrador do DocSecure para
    vincular você ao seu setor. Depois disso, as pastas aparecem aqui.
  </div>
);
