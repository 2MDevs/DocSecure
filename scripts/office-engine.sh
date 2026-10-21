#!/usr/bin/env bash
# =============================================================================
# DocSecure — instala ou remove a "visualização completa" (LibreOffice) na VPS.
#
# Chamado pelo scripts/update.sh (serviço systemd docsecure-update, como root)
# quando o desenvolvedor alterna a opção na tela Sistema:
#   bash scripts/office-engine.sh install   <quem pediu>
#   bash scripts/office-engine.sh uninstall <quem pediu>
#
# Segurança para a VPS compartilhada:
#  - instala só o necessário (sem interface gráfica, sem "recomendados");
#  - anota exatamente quais pacotes ELE instalou (.office/packages.txt);
#  - ao remover, remove SÓ esses pacotes. Se o LibreOffice já existia antes
#    (instalado por outro projeto), ele continua lá.
# =============================================================================
main() {
  set -uo pipefail
  local ACTION=${1:-}
  local REQUESTED_BY=${2:-painel}
  local CONF=/etc/docsecure-update.conf
  [ -f "$CONF" ] || { echo "Arquivo $CONF não encontrado."; exit 1; }
  # shellcheck disable=SC1090
  source "$CONF"
  : "${APP_DIR:?}" "${APP_OWNER:=root}"

  local STATE_DIR="$APP_DIR/.office"
  local STATUS="$STATE_DIR/status.json"
  local LOG="$STATE_DIR/office.log"
  local PKGS="$STATE_DIR/packages.txt"
  mkdir -p "$STATE_DIR"
  chown "$APP_OWNER" "$STATE_DIR" 2>/dev/null || true
  : > "$LOG"
  exec > >(tee -a "$LOG") 2>&1

  local STARTED_AT
  STARTED_AT=$(date -Is)
  write_status() { # state message
    local msg=${2//\"/\'}
    local version="" disk=0
    local bin
    bin=$(soffice_bin)
    if [ -n "$bin" ]; then version=$("$bin" --version 2>/dev/null | head -1 | tr -d '"' | cut -c1-80); fi
    if [ -s "$PKGS" ]; then
      disk=$(dpkg-query -W -f='${Installed-Size}\n' $(cat "$PKGS") 2>/dev/null | awk '{s+=$1} END {print s*1024+0}')
    fi
    cat > "$STATUS.tmp" <<JSON
{"state":"$1","message":"$msg","action":"$ACTION","requestedBy":"$REQUESTED_BY","startedAt":"$STARTED_AT","finishedAt":"$( [ "$1" = installing ] || [ "$1" = removing ] || date -Is )","version":"$version","diskBytes":$disk,"binary":"$bin"}
JSON
    mv "$STATUS.tmp" "$STATUS"
    chown "$APP_OWNER" "$STATUS" "$LOG" 2>/dev/null || true
  }
  soffice_bin() {
    for b in /usr/bin/soffice /usr/lib/libreoffice/program/soffice /opt/libreoffice*/program/soffice; do
      [ -x "$b" ] && { echo "$b"; return; }
    done
    command -v soffice 2>/dev/null || true
  }
  apt_() { DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 -y -q "$@"; }

  echo "Solicitado por $REQUESTED_BY em $STARTED_AT: $ACTION"
  if ! command -v apt-get >/dev/null || ! command -v dpkg-query >/dev/null; then
    write_status failed "A instalação automática funciona em VPS Debian/Ubuntu (apt). Este servidor não tem apt."
    exit 1
  fi

  case "$ACTION" in
    install)
      write_status installing "Baixando e instalando o LibreOffice (alguns minutos)..."
      local BEFORE
      BEFORE=$(mktemp)
      dpkg-query -W -f='${Package}\n' | sort -u > "$BEFORE"

      echo "==> $(date '+%H:%M:%S') Atualizando a lista de pacotes"
      apt_ update || { write_status failed "Não foi possível atualizar a lista de pacotes (apt update)."; rm -f "$BEFORE"; exit 1; }

      echo "==> $(date '+%H:%M:%S') Instalando LibreOffice sem interface gráfica + fontes compatíveis com o Office"
      local FONTS="fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea"
      if ! apt_ install --no-install-recommends libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui $FONTS; then
        echo "Pacotes '-nogui' indisponíveis nesta versão; tentando os pacotes padrão"
        apt_ install --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress $FONTS \
          || { write_status failed "Falha ao instalar o LibreOffice. Veja o registro."; rm -f "$BEFORE"; exit 1; }
      fi

      # Anota só o que ESTA instalação trouxe (para remover exatamente isso depois)
      local AFTER
      AFTER=$(mktemp)
      dpkg-query -W -f='${Package}\n' | sort -u > "$AFTER"
      { [ -f "$PKGS" ] && cat "$PKGS"; comm -13 "$BEFORE" "$AFTER"; } | sort -u > "$PKGS.tmp" && mv "$PKGS.tmp" "$PKGS"
      rm -f "$BEFORE" "$AFTER"
      echo "Pacotes instalados pelo DocSecure: $(wc -l < "$PKGS")"

      # Teste: converte um arquivo pequeno como o usuário do sistema (não como root)
      local BIN
      BIN=$(soffice_bin)
      [ -n "$BIN" ] || { write_status failed "LibreOffice instalado, mas o programa soffice não foi encontrado."; exit 1; }
      local T
      T=$(mktemp -d)
      chown "$APP_OWNER" "$T"
      echo "DocSecure - teste de conversao" > "$T/teste.txt"
      chown "$APP_OWNER" "$T/teste.txt"
      if runuser -u "$APP_OWNER" -- env HOME="$T" timeout 120 "$BIN" --headless --norestore --nolockcheck \
           "-env:UserInstallation=file://$T/perfil" --convert-to pdf --outdir "$T" "$T/teste.txt" >/dev/null 2>&1 \
         && [ -s "$T/teste.pdf" ]; then
        echo "Teste de conversão: ok"
        write_status installed "Visualização completa ativa (LibreOffice)."
      else
        write_status failed "O LibreOffice foi instalado, mas o teste de conversão falhou. Veja o registro."
        rm -rf "$T"
        exit 1
      fi
      rm -rf "$T"
      ;;

    uninstall)
      write_status removing "Removendo o LibreOffice..."
      if [ ! -s "$PKGS" ]; then
        if [ -n "$(soffice_bin)" ]; then
          write_status failed "O LibreOffice deste servidor não foi instalado pelo DocSecure (pode ser usado por outro sistema), então não foi removido."
        else
          write_status not_installed "Visualização básica ativa."
        fi
        exit 0
      fi
      echo "==> $(date '+%H:%M:%S') Conferindo se outro sistema passou a depender destes pacotes"
      local SIM EXTRA
      # shellcheck disable=SC2046
      SIM=$(apt-get -s purge $(cat "$PKGS") 2>/dev/null | awk '/^(Purg|Remv) /{print $2}' | sort -u)
      EXTRA=$(comm -23 <(echo "$SIM") <(sort -u "$PKGS") | grep -v '^$' || true)
      if [ -n "$EXTRA" ]; then
        echo "Remover o LibreOffice também removeria: $EXTRA"
        write_status failed "Não removido: outros programas da VPS passaram a depender do LibreOffice ($(echo "$EXTRA" | head -5 | tr '\n' ' '))."
        exit 1
      fi
      echo "==> $(date '+%H:%M:%S') Removendo os pacotes instalados pelo DocSecure"
      # shellcheck disable=SC2046
      apt_ purge $(cat "$PKGS") || { write_status failed "Falha ao remover o LibreOffice. Veja o registro."; exit 1; }
      rm -f "$PKGS"
      apt-get clean >/dev/null 2>&1 || true
      write_status not_installed "LibreOffice removido. Visualização básica ativa e espaço liberado."
      ;;

    *)
      echo "Ação desconhecida: $ACTION"
      exit 1
      ;;
  esac
  exit 0
}

main "$@"; exit
