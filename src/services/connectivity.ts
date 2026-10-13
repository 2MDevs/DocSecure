import { useSyncExternalStore } from 'react';

/**
 * Estado da conexão com o servidor e o banco de dados.
 * - connecting: verificando (início ou reconectando)
 * - online: servidor e banco respondendo
 * - offline: servidor inacessível ou banco fora do ar → alterações ficam bloqueadas
 *   (exceto envio de arquivos, que vai para a fila local e sobe ao reconectar)
 */
export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export const OFFLINE_MESSAGE =
  'Sem conexão com o servidor no momento. A ação foi bloqueada para não perder dados. Tente novamente quando a conexão voltar.';

let status: ConnectionStatus = 'connecting';
let lastOnlineAt: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let checking = false;

function setStatus(next: ConnectionStatus) {
  if (next === status) return;
  status = next;
  if (next === 'online') lastOnlineAt = Date.now();
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('docsecure:connection', { detail: { status: next } }));
  }
}

async function check() {
  if (checking) return;
  checking = true;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => null);
    setStatus(res.ok && body?.db === 'up' ? 'online' : 'offline');
  } catch {
    setStatus('offline');
  } finally {
    checking = false;
    schedule();
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  // Fora do ar: tenta a cada 5s; conectado: confere a cada 20s
  timer = setTimeout(check, status === 'online' ? 20_000 : 5_000);
}

export function startConnectivityMonitor() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => {
    setStatus('connecting');
    check();
  });
  window.addEventListener('offline', () => setStatus('offline'));
  check();
}

/** Chamado quando uma requisição falha por rede/servidor: confirma o estado rapidamente. */
export function reportConnectionProblem() {
  if (status === 'online') setStatus('connecting');
  check();
}

export function recheckConnection() {
  setStatus('connecting');
  check();
}

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

/** Durante a verificação inicial não bloqueia; bloqueia apenas quando confirmado offline. */
export function canWrite(): boolean {
  return status !== 'offline';
}

export function getLastOnlineAt() {
  return lastOnlineAt;
}

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status
  );
}
