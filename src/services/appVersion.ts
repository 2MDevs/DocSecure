/**
 * Detecta quando o sistema foi atualizado no servidor enquanto esta tela (ou o app instalado / PWA)
 * continua aberta com a versão antiga.
 *
 * Cada versão gerada pelo build tem um arquivo principal com nome único (/assets/index-XXXX.js).
 * Comparamos o arquivo que esta tela carregou com o que o servidor entrega agora.
 */
const ASSET_RE = /\/assets\/index-[\w-]+\.js/;

function loadedBundle(): string | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  for (const s of scripts) {
    const m = s.src.match(ASSET_RE);
    if (m) return m[0];
  }
  return null;
}

const current = typeof document !== 'undefined' ? loadedBundle() : null;

/** true quando o servidor já tem uma versão diferente da que está rodando nesta tela. */
export async function isNewVersionAvailable(): Promise<boolean> {
  if (!current) return false; // modo desenvolvimento (sem build)
  try {
    const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return false;
    const html = await res.text();
    const m = html.match(ASSET_RE);
    return Boolean(m && m[0] !== current);
  } catch {
    return false; // sem conexão: tenta depois
  }
}
