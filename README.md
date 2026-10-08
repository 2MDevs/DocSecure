# DocSecure Enterprise - Guia de Produção

Plataforma corporativa de Gestão Eletrônica de Documentos (GED) com controle granular de acesso baseado em funções (RBAC), persistência em PostgreSQL e arquitetura de segurança de alta conformidade.

---

## 1. Variáveis de Ambiente (.env)

Copie o arquivo `.env.example` para `.env` no servidor de produção e preencha as variáveis:

```bash
cp .env.example .env
```

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão direta do PostgreSQL na VPS | `postgresql://docsecure_user:SENHA@localhost:5433/docsecure_db?schema=public` |
| `SETTINGS_ENCRYPTION_KEY` | Chave de 32 bytes em base64 para criptografar segredos AES-256-GCM | *(Veja como gerar abaixo)* |
| `DEVELOPER_EMAILS` | Lista de e-mails com permissão exclusiva de Desenvolvedor | `marcosmonteiro.devs@gmail.com` |
| `PORT` | Porta de escuta da aplicação Express | `3000` |
| `NODE_ENV` | Modo de execução (`production` ou `development`) | `production` |
| `APP_URL` | URL pública onde o sistema está hospedado | `https://docsecure.suaempresa.com.br` |
| `SESSION_TTL_HOURS` | Tempo de expiração da sessão (renovado a cada requisição) | `8` |
| `MAX_UPLOAD_MB` | Tamanho máximo permitido para upload de arquivos | `25` |
| `ADMIN_EMAIL` | E-mail do primeiro administrador do sistema | `admin@suaempresa.com.br` |
| `ADMIN_INITIAL_PASSWORD` | Senha inicial temporária (mínimo 10 caracteres, letras e números) | `TroqueMe123456` |
| `SMTP_HOST` | Host do servidor SMTP para envio de 2FA e e-mails | `smtp.gmail.com` ou `mail.suaempresa.com.br` |
| `SMTP_PORT` | Porta SMTP (`587` para STARTTLS ou `465` para SSL) | `587` |
| `SMTP_SECURE` | Conexão segura SSL (`true` ou `false`) | `false` |
| `SMTP_USER` | Usuário/E-mail de autenticação no servidor SMTP | `notificacoes@suaempresa.com.br` |
| `SMTP_PASS` | Senha ou App Password do e-mail SMTP | `sua-senha-smtp` |
| `SMTP_FROM` | Remetente dos e-mails enviados pelo sistema | `DocSecure <nao-responda@suaempresa.com.br>` |
| `GEMINI_API_KEY` | Chave de API opcional para inteligência artificial com Google Gemini | `AIzaSy...` |

### Como Gerar a Chave de Criptografia (`SETTINGS_ENCRYPTION_KEY`):
No terminal do seu servidor ou máquina de desenvolvimento, execute o comando:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado gerado diretamente na variável `SETTINGS_ENCRYPTION_KEY` do seu arquivo `.env`.

---

## 2. Papel "Desenvolvedor" & Tela "Integração"

O papel **Desenvolvedor** (`developer` / `DEVELOPER`) é o nível mais alto de administração da infraestrutura:
- **Atribuição Estrita:** Nenhum usuário (nem diretores ou administradores) pode conceder o papel de desenvolvedor pela interface web ou endpoints de usuários. Esse papel é concedido exclusivamente aos e-mails listados na variável de ambiente `DEVELOPER_EMAILS`.
- **Acesso à Tela "Integração":** Apenas usuários com o papel `developer` visualizam a opção "Integração" no menu lateral e podem consumir as rotas `/api/integrations/*`.
- **Proteção no Backend:** Todas as rotas `/api/integrations/*` aplicam `requireAuth` + `requireRole('developer')`, retornando `403 Forbidden` caso qualquer outro papel tente invocá-las.
- **Armazenamento e Precedência (`system_settings`):**
  - Ordem de precedência: **Banco de Dados > Variável de Ambiente (.env) > Padrão do Sistema**.
  - Segredos (`SMTP_PASS`, `GEMINI_API_KEY`) são gravados criptografados com **AES-256-GCM**.
  - O backend **nunca** retorna senhas ou chaves em texto puro para o navegador; devolve apenas `{ configured: true, last4: "abcd" }`.
  - Recarregamento a quente: ao salvar, nodemailer, sessões e clientes são atualizados em tempo real sem derrubar o processo Node.
- **Reautenticação por Senha:** Se o desenvolvedor não interagiu com o sistema nos últimos 10 minutos, o sistema solicita a senha atual antes de permitir alterações nas configurações.
- **Auditoria Imutável:** Todas as alterações geram registros em `audit_logs` registrando quem, quando, IP e quais chaves foram alteradas (para segredos, apenas a indicação "alterado" é salva, nunca o valor).

---

## 3. Sistema Interativo de Pastas (Explorador Avançado)

O módulo de documentos e pastas conta com:
1. **Arrastar e Soltar (Drag & Drop):**
   - Arraste documentos para dentro de uma pasta para movê-los automaticamente.
   - Arraste uma pasta para dentro de outra para transformá-la em subpasta.
   - Destaque visual durante o arrasto sobre pastas alvo.
2. **Duplo Clique:** Abrir a pasta diretamente com duplo clique do botão esquerdo.
3. **1 Clique + Tecla Enter:** Selecionar a pasta com 1 clique e pressionar a tecla `Enter` abre a pasta.
4. **Botão Direito fora da Pasta (Área Vazia):**
   - Menu de contexto: *Nova Pasta*, *Modo de Visualização (Grade / Lista)* e *Atualizar*.
5. **Botão Direito sobre uma Pasta:**
   - Menu de contexto: *Abrir Pasta*, *Nova Subpasta*, *Modo de Visualização*, *Excluir Pasta* e *Propriedades*.
   - Em *Propriedades*, o modal permite configurar quem pode acessar (permissões granulares por colaborador ou setor, downloads liberados/bloqueados, etc.).

---

## 4. Roteiro de Testes Recomendados

Execute os seguintes testes para validar a segurança e funcionalidade:

1. **Restrição de Acesso RBAC à Tela Integração:**
   - Faça login com um usuário com papel Diretor, Gestor ou Colaborador (ou sem e-mail em `DEVELOPER_EMAILS`);
   - Verifique que o item "Integração" **não aparece** no menu lateral;
   - Tente fazer uma requisição manual `GET /api/integrations/settings`: o backend retornará estritamente **403 Forbidden**.
2. **Configuração e Teste de Envio SMTP:**
   - Acesse com o usuário Desenvolvedor (configurado via `ADMIN_EMAIL` / `DEVELOPER_EMAILS`);
   - Acesse a tela **Integração** e preencha as credenciais do seu servidor SMTP;
   - Clique em **"Salvar Alterações"**;
   - Clique no botão **"Enviar e-mail de teste"**: o sistema envia o e-mail para o seu endereço e exibe a confirmação de sucesso ou o erro do servidor SMTP (sem expor sua senha).
3. **Proteção de Segredos na Rede (Network Inspection):**
   - Abra a aba *Network* (Rede) das Ferramentas de Desenvolvedor (F12) no navegador;
   - Recarregue ou salve na tela Integração;
   - Inspecione a resposta do endpoint `/api/integrations/settings`:
     - O campo `SMTP_PASS` retornará apenas `{ configured: true, last4: "..." }`;
     - O campo `GEMINI_API_KEY` retornará apenas `{ configured: true, last4: "..." }`;
     - O valor real nunca é transmitido para o cliente.
4. **Auditoria de Alterações:**
   - Após salvar configurações na tela Integração, acesse o menu **"Logs de Acesso"** (Auditoria);
   - Verifique que o evento `INTEGRATION_SETTINGS_MODIFIED` foi registrado com IP, data/hora e chaves alteradas, sem expor os valores dos segredos.
5. **Interação com Pastas (Drag & Drop, Duplo Clique e Menus):**
   - Entre em um setor e crie duas pastas;
   - Dê **duplo clique** na pasta: ela abrirá imediatamente;
   - Volte, dê **1 clique** na pasta e pressione **Enter**: ela abrirá;
   - Clique com o **botão direito** no fundo branco: clique em *Nova Pasta*;
   - Clique com o **botão direito** sobre uma pasta: selecione *Propriedades* para configurar quem pode acessar ou *Excluir Pasta* para removê-la;
   - Arraste um documento para dentro de uma pasta e solte: o documento será movido.

---

## 5. Execução em Produção na VPS

```bash
# 1. Instalar dependências
npm install

# 2. Compilar o Frontend para produção
npm run build

# 3. Iniciar com PM2 (ou systemd)
pm2 start "node --import tsx server.ts" --name docsecure
# ou via npm start
npm start
```
