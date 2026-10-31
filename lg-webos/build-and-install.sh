#!/usr/bin/env bash
# Monta la UI web compartida + la capa webOS en un .ipk y lo instala/abre en la LG (dispositivo "lgtv").
# Usa las herramientas ares de este directorio (npm install, una vez).
# Uso: [WATCHDOG=1] ./build-and-install.sh
#   WATCHDOG=1  (opcional) instala también el servicio service/ (HomeWatchdogService para webOS): vuelve a
#               abrir la app al pulsar la casita. Sin esta opción el servicio no se instala.
set -e
cd "$(dirname "$0")"
ARES_BIN="${ARES_BIN:-$PWD/node_modules/.bin}"
STAGE="build/app"

rm -rf build && mkdir -p "$STAGE"
cp -r ../web/. "$STAGE/"                 # UI compartida (incluye js/platform-webos.js)
cp js/ssap.js js/ssap-manifest.js js/debug.js "$STAGE/js/"   # extras solo-webOS
cp -r js/vendor "$STAGE/js/"                                   # html2canvas: solo para las capturas de tools/shot.sh
cp appinfo.json icon.png largeIcon.png "$STAGE/"

VER=$(python -I -c "import json;print(json.load(open('appinfo.json'))['version'])")
if [ "${WATCHDOG:-0}" = "1" ]; then
  [ -d service/node_modules/ws ] || (cd service && npm install --omit=dev --no-audit --no-fund >/dev/null)
  "$ARES_BIN/ares-package" "$STAGE" service -o build --no-minify >/dev/null   # app + servicio JS
else
  "$ARES_BIN/ares-package" "$STAGE" -o build --no-minify >/dev/null           # solo la app
fi
"$ARES_BIN/ares-install" -d lgtv "build/com.quickaccesstv.app_${VER}_all.ipk"
"$ARES_BIN/ares-launch" -d lgtv com.quickaccesstv.app
