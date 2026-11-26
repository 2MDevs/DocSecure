#!/usr/bin/env bash
# =====================================================================================
#  DocSecure — prepara o Nginx da VPS para a "Pasta no Windows" (WebDAV em /dav)
#
#  O que faz:
#   - Encontra o bloco do Nginx que JÁ atende o DocSecure (o que encaminha para a porta
#     do DocSecure definida no .env). Não mexe em nenhum outro site da VPS.
#   - Acrescenta "location /dav" com arquivos sem limite de tamanho, envio em fluxo
#     (sem guardar o arquivo inteiro no Nginx) e tempo maior para arquivos grandes.
#   - Faz cópia de segurança, testa com "nginx -t" e desfaz sozinho se algo der errado.
#
#  Uso (uma vez só, na pasta do DocSecure):   sudo bash scripts/setup-webdav-nginx.sh
# =====================================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="$(grep -E '^[[:space:]]*PORT=' "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' "\r' || true)"
PORT="${PORT:-3000}"

if [ "$(id -u)" != "0" ]; then
  echo "Rode como administrador: sudo bash scripts/setup-webdav-nginx.sh"
  exit 1
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx não encontrado nesta VPS. Nada a fazer: o DocSecure já responde a pasta no Windows direto."
  exit 0
fi

echo "Procurando o site do DocSecure no Nginx (porta ${PORT})..."
mapfile -t FILES < <(
  grep -rlE "proxy_pass[[:space:]]+https?://(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):${PORT}([/;[:space:]]|$)" \
    /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | xargs -r -n1 readlink -f | sort -u
)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "Não encontrei nenhum site do Nginx encaminhando para a porta ${PORT}."
  echo "Adicione manualmente o bloco do README (seção 9) no site do DocSecure."
  exit 1
fi
if [ "${#FILES[@]}" -gt 1 ]; then
  echo "Encontrei mais de um arquivo encaminhando para a porta ${PORT}:"
  printf '  - %s\n' "${FILES[@]}"
  echo "Para não arriscar outros sites, nada foi alterado. Adicione o bloco do README (seção 9) no arquivo certo."
  exit 1
fi

CONF="${FILES[0]}"
echo "Site do DocSecure: $CONF"
if grep -qE "location[[:space:]]+/dav" "$CONF"; then
  echo "A pasta no Windows já está configurada neste site. Nada a fazer."
  exit 0
fi

BACKUP="${CONF}.antes-da-pasta-windows.$(date +%Y%m%d%H%M%S)"
cp -p "$CONF" "$BACKUP"
echo "Cópia de segurança: $BACKUP"

RC=0
python3 - "$CONF" "$PORT" <<'PY' || RC=$?
import re, sys
conf, port = sys.argv[1], sys.argv[2]
lines = open(conf, encoding='utf-8').read().split('\n')
proxy_re = re.compile(r'^\s*proxy_pass\s+(https?://(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):' + re.escape(port) + r')(?:[/;\s]|$)')
loc_re = re.compile(r'^(\s*)location\s+/\s*\{')
out, inserted = list(lines), 0
# Para cada "proxy_pass" do DocSecure, coloca o bloco /dav logo antes do "location / {" que o contém
targets = []
for i, line in enumerate(lines):
    m = proxy_re.match(line)
    if not m:
        continue
    for j in range(i, -1, -1):
        lm = loc_re.match(lines[j])
        if lm:
            targets.append((j, lm.group(1), m.group(1)))
            break
for j, indent, upstream in sorted(set(targets), reverse=True):
    block = [
        f'{indent}# DocSecure: pasta no Windows (WebDAV) — adicionado por scripts/setup-webdav-nginx.sh',
        f'{indent}location /dav {{',
        f'{indent}    proxy_pass {upstream};',
        f'{indent}    proxy_http_version 1.1;',
        f'{indent}    proxy_set_header Host $host;',
        f'{indent}    proxy_set_header X-Real-IP $remote_addr;',
        f'{indent}    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        f'{indent}    proxy_set_header X-Forwarded-Proto $scheme;',
        f'{indent}    client_max_body_size 0;',
        f'{indent}    proxy_request_buffering off;',
        f'{indent}    proxy_buffering off;',
        f'{indent}    proxy_read_timeout 3600s;',
        f'{indent}    proxy_send_timeout 3600s;',
        f'{indent}}}',
        '',
    ]
    out[j:j] = block
    inserted += 1
if not inserted:
    print('Não encontrei o "location / {" do DocSecure neste arquivo.')
    sys.exit(2)
open(conf, 'w', encoding='utf-8').write('\n'.join(out))
print(f'Bloco /dav adicionado em {inserted} lugar(es).')
PY
if [ "$RC" -ne 0 ]; then
  cp -p "$BACKUP" "$CONF"
  echo "Nada foi alterado. Adicione manualmente o bloco do README (seção 9)."
  exit 1
fi

if nginx -t; then
  systemctl reload nginx
  echo ""
  echo "Pronto! O Nginx já aceita a pasta do DocSecure no Windows (https://<seu-dominio>/dav)."
else
  echo "O teste do Nginx falhou. Voltando o arquivo como estava..."
  cp -p "$BACKUP" "$CONF"
  nginx -t && systemctl reload nginx || true
  echo "Nada foi alterado. Me envie a mensagem de erro acima."
  exit 1
fi
