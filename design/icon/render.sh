#!/usr/bin/env bash
# Convierte icon.svg / banner.svg en los PNG de cada plataforma con un navegador Chromium sin ventana
# (Edge en Windows por defecto; BROWSER=/ruta/a/chrome para otro). Requiere Node para generar los SVG.
# Uso: design/icon/render.sh
set -e
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
BROWSER="${BROWSER:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
node icon.js >/dev/null

# png <svg> <ancho> <alto> <salida>: pinta el SVG escalado a ese tamaño con fondo transparente.
# El SVG va dentro de la página (no como <img>) para que use la fuente Outfit de web/fonts.
FONT="file:///$(cygpath -m "$ROOT/web/fonts/Outfit.ttf" 2>/dev/null || echo "$ROOT/web/fonts/Outfit.ttf")"
png() {
  local tmp page
  tmp="$(mktemp -d)"; page="$tmp/page.html"
  { printf '<html><head><style>@font-face{font-family:Outfit;src:url("%s")}' "$FONT"
    printf 'body{margin:0;background:transparent}svg{display:block;width:%spx;height:%spx}</style></head><body>' "$2" "$3"
    cat "$1"; printf '</body></html>'; } > "$page"
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --allow-file-access-from-files --virtual-time-budget=3000 \
    --window-size="$2,$3" --screenshot="$(cygpath -w "$4" 2>/dev/null || echo "$4")" \
    "file:///$(cygpath -m "$page" 2>/dev/null || echo "$page")" >/dev/null 2>&1
  rm -rf "$tmp"
  echo "$4 (${2}x${3})"
}

RES="$ROOT/android/app/src/main/res"
mkdir -p "$RES/drawable" "$RES/drawable-xhdpi"
# Densidad base (drawable/), para launchers que no escalan desde otras densidades.
png icon.svg 256 256 "$RES/drawable/ic_launcher.png"
png banner.svg 320 180 "$RES/drawable/banner.png"
# xhdpi (2x): nitidez en teles 1080p/4K.
png icon.svg 512 512 "$RES/drawable-xhdpi/ic_launcher.png"
png banner.svg 640 360 "$RES/drawable-xhdpi/banner.png"
# Fire TV encaja el icono de las apps instaladas fuera de la Appstore en un hueco cuadrado y pinta él los
# laterales del tile (gris): el icono cuadrado es el que mejor lo llena; uno apaisado se ve diminuto.
png icon-square.svg 80 80 "$ROOT/lg-webos/icon.png"     # webOS: icono de la barra (la ficha la redondea webOS)
png icon-square.svg 130 130 "$ROOT/lg-webos/largeIcon.png"
png icon.svg 512 512 "$ROOT/design/icon/icon.png"     # para el README / GitHub
png banner.svg 1280 720 "$ROOT/design/icon/banner.png"
