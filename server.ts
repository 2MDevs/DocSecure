import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { initDatabase } from './server/db';
import { authRouter } from './server/auth/routes';
import { usersRouter } from './server/routes/users';
import { departmentsRouter } from './server/routes/departments';
import { foldersRouter } from './server/routes/folders';
import { documentsRouter } from './server/routes/documents';
import { auditRouter } from './server/routes/audit';
import { devicesRouter } from './server/routes/devices';
import { apiKeysRouter, webhooksRouter } from './server/routes/apiKeys';
import { systemRouter } from './server/routes/system';
import { integrationsRouter } from './server/routes/integrations';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Habilita suporte a proxies reversos (Nginx/Cloud Run) para correta detecção de IP no rate limiter e cookies
app.set('trust proxy', 1);

// 1. Hardening & Segurança HTTP
app.use(
  helmet({
    contentSecurityPolicy: false, // Permite execução adequada do Vite SPA
    crossOriginEmbedderPolicy: false,
  })
);
app.disable('x-powered-by');

// 2. Middlewares de Requisição
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 3. Endpoint Público de Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'UP',
    environment: isProduction ? 'production' : 'development',
    timestamp: new Date().toISOString(),
  });
});

// 4. Montagem das Rotas da API
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/api-keys', apiKeysRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/system', systemRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api', systemRouter); // Permite acesso a /api/bootstrap

// 5. Middleware Global de Tratamento de Erros
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER UNHANDLED ERROR]', err);
  if (isProduction) {
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
  return res.status(500).json({ error: err.message || 'Erro interno no servidor' });
});

// 6. Inicialização do Servidor e Banco de Dados
async function startServer() {
  // Inicialização e migrações do PostgreSQL
  await initDatabase();

  // Integração com Frontend Vite (Dev) ou Arquivos Estáticos Compilados (Prod)
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DocSecure Server] Executando em http://0.0.0.0:${PORT} (Modo: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'})`);
  });
}

startServer().catch((err) => {
  console.error('[DocSecure FATAL]', err);
  process.exit(1);
});
