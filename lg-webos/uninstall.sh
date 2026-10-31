#!/usr/bin/env bash
# Quita QuickAccess TV de la tele (no se tocó nada del sistema).
# Sin PC: en la barra de LG, mantén OK sobre «QuickAccess TV» y elige Eliminar.
cd "$(dirname "$0")"
"${ARES_BIN:-$PWD/node_modules/.bin}/ares-install" -d lgtv --remove com.quickaccesstv.app
