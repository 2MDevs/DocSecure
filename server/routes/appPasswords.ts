/**
 * Pasta do DocSecure no Windows: senhas de aplicativo, quem pode usar e o conector (.bat).
 * Só funciona logado na tela (chaves de API não acessam estas rotas).
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import { writeAudit, getClientIp } from '../services/documentAccess';
import {
  AppPasswordError,
  createAppPassword,
  getWebdavAccess,
  listAppPasswords,
  revokeAppPassword,
  setWebdavAccess,
  userMayUseWebdav,
  forgetCachedCredentials,
  WebdavAccess,
} from '../services/appPasswords';
import { forgetDavAccessCache } from '../webdav/davAuth';

export const appPasswordsRouter = Router();

const auditCtx = (req: Request) => {
  const u = (req as any).user;
  return { id: u.id, name: u.name, role: u.role, departmentName: u.departmentName };
};

/**
 * Endereço público do DocSecure: o mesmo pelo qual a pessoa entrou no site. Se o Nginx não informar o
 * protocolo, usa o do APP_URL (quando é o mesmo domínio) ou HTTPS para domínios (nunca para IP/localhost).
 */
export function publicBaseUrl(req: Request): URL {
  const host = String(req.get('host') || '').trim();
  let proto = req.protocol === 'https' ? 'https' : 'http';
  try {
    const env = new URL(String(process.env.APP_URL || ''));
    if (!host) return env;
    if (env.host.toLowerCase() === host.toLowerCase()) proto = env.protocol.replace(':', '');
  } catch {}
  if (proto === 'http' && host && !/^(localhost|127\.|\[?::1\]?|\d+\.\d+\.\d+\.\d+)(:|$)/i.test(host)) proto = 'https';
  return new URL(`${proto}://${host || 'localhost'}`);
}

async function checkPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return Boolean(rows[0]?.password_hash) && (await bcrypt.compare(password, rows[0].password_hash));
}

appPasswordsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const access = await getWebdavAccess();
    const base = publicBaseUrl(req);
    return res.json({
      access,
      allowed: userMayUseWebdav(user, access),
      canManageAccess: String(user.role).toUpperCase() === 'DEVELOPER',
      davUrl: `${base.origin}/dav`,
      secure: base.protocol === 'https:',
      login: user.email,
      items: await listAppPasswords(user.id),
    });
  } catch (err) {
    console.error('[APP PASSWORDS LIST ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar a pasta no Windows.' });
  }
});

appPasswordsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const access = await getWebdavAccess();
    if (!userMayUseWebdav(user, access)) {
      return res.status(403).json({
        error: access === 'off' ? 'A pasta no Windows está desligada.' : 'A pasta no Windows está em teste e liberada só para o desenvolvedor.',
      });
    }
    if (!(await checkPassword(user.id, String(req.body?.password || '')))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    const created = await createAppPassword(user.id, String(req.body?.name || ''));
    await writeAudit(
      auditCtx(req),
      'APP_PASSWORD_CREATED',
      created.id,
      created.name,
      'Senha de aplicativo gerada para conectar a pasta do DocSecure no Windows.',
      'SUCCESS',
      getClientIp(req)
    );
    return res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof AppPasswordError) return res.status(err.status).json({ error: err.message });
    console.error('[APP PASSWORDS CREATE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao gerar a senha de aplicativo.' });
  }
});

appPasswordsRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const name = await revokeAppPassword(user.id, String(req.params.id));
    if (name === null) return res.status(404).json({ error: 'Senha não encontrada.' });
    await writeAudit(
      auditCtx(req),
      'APP_PASSWORD_REVOKED',
      String(req.params.id),
      name,
      'Computador desconectado: a senha de aplicativo deixou de funcionar.',
      'SUCCESS',
      getClientIp(req)
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[APP PASSWORDS REVOKE ERROR]', err);
    return res.status(500).json({ error: 'Erro ao desconectar o computador.' });
  }
});

// Quem pode usar a pasta no Windows (só o desenvolvedor decide, com a senha)
appPasswordsRouter.put('/access', requireAuth, requireRole('DEVELOPER'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const value = String(req.body?.access || '') as WebdavAccess;
    if (!['off', 'developers', 'all'].includes(value)) return res.status(400).json({ error: 'Opção inválida.' });
    if (!(await checkPassword(user.id, String(req.body?.password || '')))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    await setWebdavAccess(value, user.email || user.name);
    forgetCachedCredentials();
    forgetDavAccessCache();
    const label = value === 'off' ? 'desligada' : value === 'all' ? 'liberada para todos' : 'só para desenvolvedores (teste)';
    await writeAudit(auditCtx(req), 'PERMISSIONS_MODIFIED', 'WEBDAV_ACCESS', 'Pasta no Windows', `Pasta no Windows ${label}.`, 'SUCCESS', getClientIp(req));
    return res.json({ access: value });
  } catch (err) {
    console.error('[APP PASSWORDS ACCESS ERROR]', err);
    return res.status(500).json({ error: 'Erro ao salvar.' });
  }
});

// Conector para Windows: um .bat que liga a pasta com o nome e o ícone do DocSecure
appPasswordsRouter.get('/windows-script', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const access = await getWebdavAccess();
  if (!userMayUseWebdav(user, access)) return res.status(403).json({ error: 'A pasta no Windows não está liberada para você.' });
  const base = publicBaseUrl(req);
  const script = buildWindowsScript({
    host: base.hostname,
    port: base.port,
    origin: base.origin,
    login: String(user.email || ''),
  });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'attachment; filename="Conectar DocSecure.bat"');
  return res.send(script);
});

/** Só caracteres seguros (o e-mail e o endereço vêm do servidor, mas por garantia). */
const scriptSafe = (v: string) => String(v).replace(/[^a-zA-Z0-9@._:/+-]/g, '');

/**
 * Conector: um .bat "híbrido". O Windows abre com dois cliques como um .bat comum, e o próprio
 * arquivo roda como PowerShell (que lê a senha sem mostrar na tela e mexe no registro com segurança).
 * Nada é instalado: usa o recurso de unidade de rede (WebDAV) que já vem no Windows.
 */
export function buildWindowsScript(o: { host: string; port: string; origin: string; login: string }): string {
  const host = scriptSafe(o.host);
  const port = o.port && o.port !== '443' ? scriptSafe(o.port) : '';
  const origin = scriptSafe(o.origin);
  const ps = `
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'DocSecure - Pasta no Windows'
$DsHost  = '${host}'
$DsUrl   = '${origin}/dav'
$DsUser  = '${scriptSafe(o.login)}'
$DsIcon  = '${origin}/docsecure.ico'
$MountKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\##${host}@SSL${port ? '@' + port : ''}#dav'
$DsDir   = Join-Path $env:LOCALAPPDATA 'DocSecure'

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Fim($code) { Say ''; Read-Host 'Tecle Enter para fechar' | Out-Null; exit $code }

Say ''
Say '  =====================================================' Yellow
Say '    DocSecure - Pasta no Windows' Yellow
Say '  =====================================================' Yellow
Say ''
Say '  Este assistente coloca o DocSecure como uma pasta no Windows.'
Say '  Tenha em maos a SENHA DE APLICATIVO gerada no DocSecure'
Say '  (Seguranca da conta > Pasta no Windows).'
Say ''
New-Item -ItemType Directory -Force -Path $DsDir | Out-Null

# 1) Preparo do Windows (uma vez, como administrador): servico WebClient automatico
#    e arquivos de ate 4 GB (o padrao do Windows para este tipo de pasta e 50 MB).
Say '  [1/3] Preparando o Windows. Clique em "Sim" se o Windows pedir permissao...' Cyan
$admin = @'
sc.exe config WebClient start= auto | Out-Null
New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters' -Name FileSizeLimitInBytes -Type DWord -Value 0xFFFFFFFF
Restart-Service -Name WebClient -Force -ErrorAction SilentlyContinue
Start-Service -Name WebClient -ErrorAction SilentlyContinue
'@
try {
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($admin))
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $enc"
} catch {
  Say '        Permissao negada: a pasta funciona, mas arquivos acima de 50 MB podem falhar.' DarkYellow
}
try { Start-Service -Name WebClient -ErrorAction SilentlyContinue } catch { }

# 2) Desliga uma conexao antiga do DocSecure (se houver) e escolhe uma letra livre
try {
  Get-CimInstance -ClassName Win32_MappedLogicalDisk -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -like "*$DsHost*" } |
    ForEach-Object { cmd.exe /c "net use $($_.Name) /delete /y" | Out-Null }
} catch { }
$used = (Get-PSDrive -PSProvider FileSystem).Name
$letter = [char[]](90..75) | Where-Object { $used -notcontains [string]$_ } | Select-Object -First 1
if (-not $letter) { Say '  Nenhuma letra de unidade livre. Desconecte alguma unidade e tente de novo.' Red; Fim 1 }
$drive = "$($letter):"

Say ''
Say "  [2/3] Conectando o DocSecure na unidade $drive" Cyan
Say "        Usuario: $DsUser"
Say '        Cole a SENHA DE APLICATIVO e tecle Enter (ela nao aparece na tela).'
$sec = Read-Host '        Senha de aplicativo' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if (-not $plain) { Say '  Nenhuma senha informada.' Red; Fim 1 }

# Guarda a senha no Gerenciador de Credenciais do Windows (para reconectar sozinho ao ligar o computador)
cmdkey.exe "/add:$DsHost" "/user:$DsUser" "/pass:$plain" | Out-Null
$out = cmd.exe /c "net use $drive ""$DsUrl"" /user:$DsUser ""$plain"" /persistent:yes 2>&1"
$ok = $LASTEXITCODE -eq 0
$plain = $null
if (-not $ok) {
  Say ''
  Say '  Nao foi possivel conectar:' Red
  Say "  $out" Red
  Say '  Confira a senha de aplicativo e se a pasta no Windows esta liberada para voce.' Red
  cmdkey.exe "/delete:$DsHost" | Out-Null
  Fim 1
}

# 3) Nome "DocSecure", icone e atalho na barra lateral do Explorador
Say ''
Say '  [3/3] Colocando o nome, o icone e o atalho na barra lateral...' Cyan
try {
  New-Item -Path $MountKey -Force | Out-Null
  Set-ItemProperty -Path $MountKey -Name '_LabelFromReg' -Value 'DocSecure'
} catch { }
try {
  $ico = Join-Path $DsDir 'docsecure.ico'
  Invoke-WebRequest -UseBasicParsing -Uri $DsIcon -OutFile $ico
  $iconKey = "HKCU:\\Software\\Classes\\Applications\\Explorer.exe\\Drives\\$letter\\DefaultIcon"
  New-Item -Path $iconKey -Force | Out-Null
  Set-Item -Path $iconKey -Value $ico
} catch { }
try {
  $shell = New-Object -ComObject Shell.Application
  $shell.NameSpace("$drive\\").Self.Name = 'DocSecure'
  $shell.NameSpace("$drive\\").Self.InvokeVerb('pintohome')
} catch { }
try { Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden } catch { }

Say ''
Say "  Pronto! O DocSecure esta na unidade $drive e no Acesso rapido do Explorador." Green
Say '  Para desconectar: botao direito na unidade > Desconectar, e depois'
Say '  desconecte este computador no DocSecure (Seguranca da conta).'
Start-Process -FilePath 'explorer.exe' -ArgumentList "$drive\\"
Fim 0
`;
  const header = [
    '<# :',
    '@echo off',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText(\'%~f0\'); Invoke-Expression $f"',
    'exit /b',
    '#>',
  ].join('\r\n');
  return header + ps.replace(/\r?\n/g, '\r\n');
}
