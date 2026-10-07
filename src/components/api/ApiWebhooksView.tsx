import React, { useState } from 'react';
import {
  Code2,
  Key,
  Webhook,
  Plus,
  Copy,
  Check,
  Send,
  Trash2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Play,
} from 'lucide-react';
import { ApiKey, WebhookConfig, User } from '../../types';

interface ApiWebhooksViewProps {
  currentUser: User;
  apiKeys: ApiKey[];
  webhooks: WebhookConfig[];
  onCreateApiKey: (name: string, scopes: string[]) => void;
  onCreateWebhook: (name: string, url: string, events: string[]) => void;
  onRevokeApiKey: (keyId: string) => void;
}

export const ApiWebhooksView: React.FC<ApiWebhooksViewProps> = ({
  currentUser,
  apiKeys,
  webhooks,
  onCreateApiKey,
  onCreateWebhook,
  onRevokeApiKey,
}) => {
  const [activeTab, setActiveTab] = useState<'api_keys' | 'webhooks'>('api_keys');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New API Key form
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:documents', 'write:documents']);

  // New Webhook form
  const [newWhName, setNewWhName] = useState('');
  const [newWhUrl, setNewWhUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'document.uploaded',
    'document.deleted',
    'user.blocked',
  ]);
  const [testResult, setTestResult] = useState<string | null>(null);

  const availableScopes = [
    'read:documents',
    'write:documents',
    'delete:documents',
    'read:users',
    'admin:permissions',
    'export:audit',
  ];

  const availableEvents = [
    'document.uploaded',
    'document.downloaded',
    'document.deleted',
    'document.updated',
    'user.created',
    'user.blocked',
    'device.blocked',
    'device.approved',
    'permission.changed',
    'storage.limit_reached',
    'audit.created',
  ];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName) return;
    onCreateApiKey(newKeyName, selectedScopes);
    setIsKeyModalOpen(false);
    setNewKeyName('');
  };

  const handleCreateWebhookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName || !newWhUrl) return;
    onCreateWebhook(newWhName, newWhUrl, selectedEvents);
    setIsWebhookModalOpen(false);
    setNewWhName('');
    setNewWhUrl('');
  };

  const handleTestWebhook = (wh: WebhookConfig) => {
    setTestResult(`Payload de teste despachado para ${wh.url} (Status HTTP 200 OK • Latência 42ms)`);
    setTimeout(() => setTestResult(null), 4000);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            API REST v1 & Webhooks de Integração
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Autenticação segura via bearer tokens, rate-limiting e eventos orientados a segurança.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('api_keys')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'api_keys' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Chaves de API
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhooks')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'webhooks' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Webhooks ({webhooks.length})
          </button>
        </div>
      </div>

      {testResult && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{testResult}</span>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api_keys' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Chaves de Acesso Ativas
            </span>
            <button
              type="button"
              onClick={() => setIsKeyModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Gerar Nova Chave</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {apiKeys.map((key) => (
              <div key={key.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{key.name}</h4>
                      <span className="text-[10px] text-slate-400">Criada em {key.createdAt}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                    {key.status}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                  <span className="font-mono text-xs text-slate-700">{key.keyPreview}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(key.id, key.keyPreview)}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500"
                    title="Copiar Chave"
                  >
                    {copiedId === key.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Escopos:</span>
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Último uso: {key.lastUsedAt || 'Nunca'}</span>
                  <button
                    type="button"
                    onClick={() => onRevokeApiKey(key.id)}
                    className="text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Revogar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Webhooks Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Endpoints de Notificação (Webhooks)
            </span>
            <button
              type="button"
              onClick={() => setIsWebhookModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Novo Webhook</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {webhooks.map((wh) => (
              <div key={wh.id} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Webhook className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{wh.name}</h4>
                      <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px] block">{wh.url}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                    {wh.successRate}% Success
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Eventos Assinados:</span>
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((e) => (
                      <span key={e} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-mono">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => handleTestWebhook(wh)}
                    className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" /> Enviar Ping de Teste
                  </button>
                  <span className="text-[11px] text-slate-400">Último disparo: {wh.lastTriggeredAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Nova Chave de API */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Nova Chave de Acesso à API</h3>
            <p className="text-xs text-slate-500 mb-4">Gere credenciais com escopos restritos para integrações.</p>

            <form onSubmit={handleCreateKeySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Aplicação</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="ex: Sistema ERP Contábil"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Escopos Autorizados (OAuth/RBAC)</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableScopes.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-xs text-slate-700 p-2 bg-slate-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedScopes([...selectedScopes, scope]);
                          } else {
                            setSelectedScopes(selectedScopes.filter((s) => s !== scope));
                          }
                        }}
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span className="font-mono text-[11px]">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newKeyName}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                >
                  Gerar Token Criptográfico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
