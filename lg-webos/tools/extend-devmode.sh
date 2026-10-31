#!/usr/bin/env bash
# Renueva (o solo consulta) la sesion del Modo Desarrollador de la LG, sin tocar la tele:
# llama al mismo servidor de LG que usa el boton "Extend" de la app Developer Mode.
#   tools/extend-devmode.sh           -> renueva a 1000 h
#   tools/extend-devmode.sh --check   -> solo muestra el tiempo restante
# El token se lee de tools/.devmode-token (ver lg-webos/README.md). Si re-activas el Modo
# Desarrollador en la tele, el token cambia: vuelve a guardarlo con
#   tools/lgsh.sh 'cat /var/luna/preferences/devmode_enabled' | tr -d '\r\n ' > tools/.devmode-token
set -e
cd "$(dirname "$0")"
TOKEN=$(tr -d '\r\n ' < .devmode-token)
[ -n "$TOKEN" ] || { echo "No hay token en tools/.devmode-token"; exit 1; }
if [ "$1" = "--check" ]; then
  echo "Tiempo restante de la sesion:"
  curl -s "https://developer.lge.com/secure/CheckDevModeSession.dev?sessionToken=$TOKEN"; echo
else
  echo "Renovando la sesion a 1000 h..."
  curl -s "https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=$TOKEN"; echo
fi
