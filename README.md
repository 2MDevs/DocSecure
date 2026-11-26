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
| `MAX_UPLOAD_MB` | Tamanho máximo por arquivo, em MB. 0 = sem limite (valem a quota do setor e o espaço do servidor). Arquivos grandes sobem em partes de 4 MB | `0` |
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

## 6. Visualização de documentos (Sistema › Visualização)

- **Básica (padrão):** Word (.docx), Excel (.xlsx), CSV, ZIP e RAR abrem no navegador sem nenhum programa extra no servidor.
- **Completa:** o desenvolvedor ativa na tela e a VPS instala o LibreOffice (~500 MB de disco). Word, Excel e PowerPoint — inclusive .doc, .xls e .ppt antigos — abrem idênticos ao original (convertidos em PDF). O LibreOffice só roda durante a conversão (~200–300 MB de RAM por alguns segundos, uma conversão por vez).
- Voltar para a básica remove só os pacotes que o DocSecure instalou (lista em `.office/packages.txt`); se outro sistema da VPS depender deles, a remoção é cancelada.
- Usa o mesmo serviço do botão "Atualizar sistema" (`scripts/update.sh` → `scripts/office-engine.sh`). Requer VPS Debian/Ubuntu (apt).

## 7. API para outros sistemas (Sistema › API & Webhooks)

Outros sistemas (ex.: Gestão de Processos, ERP) se conectam ao DocSecure com uma **chave de API**.

1. Em **Sistema › API & Webhooks › Nova Chave**, dê um nome (o sistema que vai usar) e marque o que ela pode fazer.
2. A chave completa (`dcs_live_` + 64 caracteres) aparece **uma única vez**. Copie e guarde no outro sistema. No banco fica só o hash SHA-256; se perder, revogue e gere outra.
3. O outro sistema envia a chave no cabeçalho `Authorization: Bearer dcs_live_...` (ou `X-API-Key: dcs_live_...`).

A chave age com as permissões de **quem a gerou**, limitada aos escopos marcados. Se essa pessoa for bloqueada, a chave para de funcionar. Tudo o que a chave faz aparece na Auditoria como `Nome (API: nome da chave)`.

| Escopo | Libera |
|---|---|
| `read:documents` | `GET /api/documents`, `/api/documents/:id/content` (`?download=1`), `/api/folders`, `/api/departments`, `/api/preview/*` |
| `write:documents` | enviar (`POST /api/documents/upload`, envio em partes), renomear/mover (`PATCH`), criar pastas |
| `delete:documents` | `DELETE /api/documents/:id`, `DELETE /api/folders/:id`, esvaziar/apagar da lixeira |
| `read:users` | `GET /api/users` |
| `admin:permissions` | alterar usuários e setores |
| `export:audit` | `GET /api/audit-logs` |

Login, sessão, tela Sistema, Integração, atualização, dispositivos e as próprias chaves **nunca** aceitam chave de API.

```bash
# Testar a conexão
curl -H "Authorization: Bearer $DOCSECURE_KEY" https://seu-dominio/api/external/ping
# Enviar um arquivo
curl -H "Authorization: Bearer $DOCSECURE_KEY" -F "file=@contrato.pdf" -F "departmentId=ID_DO_SETOR" -F "folderId=ID_DA_PASTA" https://seu-dominio/api/documents/upload
# Baixar
curl -H "Authorization: Bearer $DOCSECURE_KEY" -o arquivo.pdf "https://seu-dominio/api/documents/ID/content?download=1"
```

Chaves criadas antes desta versão aparecem como "Inválida — gere outra" (a chave completa nunca foi entregue).

---

## 8. Entrada pelo Gestão Hummm! (Integração › Gestão Hummm!)

O DocSecure aparece como aplicativo no Gestão (`gestaohummm.com.br`). Quem está logado no Gestão clica no aplicativo e entra aqui já logado, na mesma aba, com a faixa **Voltar ao Gestão** no topo.

- **Como entra:** o Gestão manda a pessoa para `GET /api/auth/gestao?token=...`, um passe JWT HS256 de 60 segundos, de uso único (`jti` guardado em `gestao_sso_tokens`), assinado com a chave compartilhada `GESTAO_SSO_SECRET` (cifrada com AES-256-GCM). Passe vencido, repetido ou com assinatura errada é recusado com uma página explicando.
- **Sem 2FA:** quem vem do Gestão não recebe código por e-mail (o Gestão já autenticou). A entrada fica na auditoria como `GESTAO_SSO_LOGIN`.
- **Qual conta:** a ligada à pessoa do Gestão (`users.gestao_user_id`); senão pelo e-mail; senão pelo CPF. Sem conta, cria uma como Colaborador, registrada como `GESTAO_SSO_ACCOUNT_CREATED`. Se houver "Setor das contas novas" (`GESTAO_SSO_DEPARTMENT_ID`), a conta já nasce nesse setor. Sem setor escolhido (padrão), a conta nasce **"Sem setor (aguardando)"**: entra, mas não vê nenhuma pasta e recebe um aviso até o administrador vincular a pessoa a um setor em Usuários (a lista mostra o selo "Vincular a um setor"). Conta bloqueada não entra.
- **Senha provisória:** se a conta ainda tinha senha provisória, ela deixa de valer na primeira entrada pelo Gestão. Para entrar direto no DocSecure, a pessoa usa "Esqueci minha senha".
- **Bloqueio por inatividade:** para quem entrou pelo Gestão, a tela de bloqueio mostra "Desbloquear pelo Gestão", que abre uma sessão nova pelo Gestão.
- **Limite:** 20 tentativas que falham a cada 15 minutos por IP (as que dão certo não contam, porque a loja toda sai pelo mesmo IP).
- **Abrir dentro da tela do Gestão:** não é usado. Os dois sites estão em domínios diferentes e o Safari e as abas anônimas descartam o login dentro de outro site.

Para ligar: no Gestão, Sistema → DocSecure → gere a chave. Aqui, em Integração → Gestão Hummm!: cole a chave, escolha (se quiser) o setor das contas novas, confira o endereço do Gestão, marque "Ligar" e salve. Copie o "Endereço de entrada" e cole no Gestão, ligue lá e salve.

| Variável / configuração | Padrão | Para que serve |
| :--- | :--- | :--- |
| `GESTAO_SSO_ENABLED` | `false` | Liga a entrada pelo Gestão |
| `GESTAO_SSO_SECRET` | vazio | Chave compartilhada com o Gestão (segredo) |
| `GESTAO_SSO_DEPARTMENT_ID` | vazio | Setor das contas criadas na primeira entrada (vazio = conta sem setor, aguardando o administrador) |
| `GESTAO_URL` | `https://gestaohummm.com.br` | Destino do botão "Voltar ao Gestão" |

## 9. Pasta no Windows (Segurança da conta › Pasta no Windows)

O DocSecure aparece no Explorador de Arquivos do Windows como uma unidade (ex.: **Z: DocSecure**), no **Este Computador** e no **Acesso rápido** da barra lateral. Cada pessoa vê só os setores, pastas e arquivos que pode acessar no site; o que é salvo ali vai direto para o DocSecure (criptografado, com auditoria). Não precisa instalar programa: usa o recurso de unidade de rede (WebDAV) que já vem no Windows.

**Como a pessoa conecta**
1. Em **Segurança da conta › Pasta no Windows**, gera uma **senha de aplicativo** (pede a senha atual). Ela aparece uma única vez; a senha principal nunca é digitada no Windows.
2. Baixa o **conector** (`Conectar DocSecure.bat`) e dá dois cliques. Ele prepara o Windows (aceitar arquivos de até 4 GB — o padrão do Windows é 50 MB — pede permissão uma vez), conecta a unidade, coloca o nome e o ícone do DocSecure e fixa na barra lateral.
3. Para desconectar: botão direito na unidade › Desconectar, e **Desconectar** o computador na mesma tela (a senha para de funcionar na hora).

Sem o conector: *Este Computador › Mapear unidade de rede*, endereço `https://<dominio>/dav`, usuário = e-mail, senha = senha de aplicativo.

**Regras (as mesmas do site)**
- Setor, pasta, pastas privadas e compartilhadas, segurança de cada arquivo, extensões bloqueadas, conferência do conteúdo, quota e lixeira de 7 dias.
- Arquivos "só visualizar" não aparecem na pasta (abrir no Windows = baixar).
- Arquivos que a pessoa não pode alterar aparecem como **somente leitura**.
- Salvar por cima cria **nova versão do mesmo documento**. Se a versão anterior tiver mais de 15 minutos, ela vai para a lixeira do setor ("Nome (versão de dd-mm-aaaa HHhMM)"), recuperável por 7 dias.
- Word, Excel e PowerPoint funcionam normalmente: os arquivos temporários deles (`~$...`, `~WRD0001.tmp`...) ficam só na memória do servidor e nunca viram documentos.
- Arquivo aberto por uma pessoa fica travado para as outras ("em uso").
- Tudo vai para a Auditoria com o dispositivo **Pasta no Windows**. Abrir o mesmo arquivo várias vezes em 10 minutos gera um registro só.
- 20 senhas erradas do mesmo endereço em 15 minutos bloqueiam esse endereço por 15 minutos.

**Quem pode usar** (só o desenvolvedor muda, na mesma tela): `Em teste (só desenvolvedor)` (padrão), `Liberada para todos` ou `Desligada`. Valor guardado em `WEBDAV_ACCESS` (`developers` | `all` | `off`).

**Na VPS (uma vez só)** — o Nginx precisa aceitar arquivos grandes em `/dav`:
```bash
cd /caminho/do/docsecure && sudo bash scripts/setup-webdav-nginx.sh
```
O script mexe só no site do Nginx que encaminha para a porta do DocSecure, faz cópia de segurança, testa com `nginx -t` e desfaz sozinho se der erro. Se preferir fazer à mão, coloque antes do `location / {` do site do DocSecure:
```nginx
location /dav {
    proxy_pass http://127.0.0.1:3000;   # a mesma porta do DocSecure
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```
O Windows só conecta este tipo de pasta por **HTTPS** (o DocSecure já usa).
