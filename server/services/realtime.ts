import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Atualização em tempo real (Server-Sent Events).
 *
 * Cada navegador logado mantém uma conexão aberta em /api/events. Quando alguém altera
 * pastas, arquivos, permissões, usuários ou setores, o servidor envia um aviso "changed"
 * e cada navegador recarrega os dados pela API normal, que já filtra pelo que aquele
 * usuário pode ver. O aviso não carrega nenhum dado sensível (nomes, conteúdo, IDs).
 */

type Client = { id: string; userId: string; res: Response };
const clients = new Map<string, Client>();

const HEARTBEAT_MS = 25_000; // abaixo do proxy_read_timeout do Nginx

function send(client: Client, event: string, data: unknown) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(client.id);
  }
}

/** GET /api/events — exige sessão válida (montado após requireAuth). */
export function eventsHandler(req: Request, res: Response) {
  const user = (req as any).user;
  const client: Client = { id: crypto.randomBytes(8).toString('hex'), userId: user.id, res };

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: não segurar os eventos em buffer
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');

  clients.set(client.id, client);
  send(client, 'ready', { at: Date.now() });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* conexão encerrada */
    }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client.id);
  });
}

let pendingTopics = new Set<string>();
let pendingUsers = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

/** Agrupa várias alterações seguidas em um único aviso (evita recarregar a tela várias vezes). */
export function broadcastChange(topic: string, affectedUserIds: string[] = []) {
  pendingTopics.add(topic);
  affectedUserIds.forEach((id) => id && pendingUsers.add(id));
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const topics = [...pendingTopics];
    const users = pendingUsers;
    pendingTopics = new Set();
    pendingUsers = new Set();
    flushTimer = null;
    for (const client of clients.values()) {
      send(client, 'changed', { topics, self: users.has(client.userId) });
    }
  }, 150);
}

/** Encerra imediatamente as conexões de um usuário (ex.: bloqueado ou sessão revogada). */
export function notifyUserSessionChanged(userId: string) {
  for (const client of clients.values()) {
    if (client.userId === userId) send(client, 'session', { reason: 'changed' });
  }
}

const TOPIC_BY_PREFIX: Array<[string, string]> = [
  ['/api/documents', 'documents'],
  ['/api/folders', 'folders'],
  ['/api/users', 'users'],
  ['/api/departments', 'departments'],
  ['/api/devices', 'devices'],
];

/**
 * Middleware: após qualquer alteração bem-sucedida (POST/PUT/PATCH/DELETE) nas áreas acima,
 * avisa todos os navegadores conectados. Assim nenhuma rota precisa lembrar de notificar.
 */
export function realtimeChangeNotifier(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const path = req.originalUrl.split('?')[0];
  const match = TOPIC_BY_PREFIX.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  if (!match) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const topic = match[1];
    const affected: string[] = [];
    if (topic === 'users') {
      const userId = path.split('/')[3];
      if (userId) {
        affected.push(userId);
        notifyUserSessionChanged(userId);
      }
    }
    broadcastChange(topic, affected);
  });
  next();
}

export function connectedClientsCount() {
  return clients.size;
}
