#!/usr/bin/env bash
# Uso: tools/shot.sh <nombre> [TECLA ...]   (LEFT RIGHT UP DOWN OK BACK LONGOK)
# Relanza QuickAccess TV con esas teclas simuladas; la app manda la captura a tools/receiver.py -> logs/<nombre>.png
cd "$(dirname "$0")/.."
name="$1"; shift
keys=$(printf '"%s",' "$@"); keys="[${keys%,}]"
rm -f "logs/$name.png"
npx ares-launch -d lgtv com.quickaccesstv.app -p "{\"debug\":{\"keys\":$keys,\"shot\":\"$name\"}}" >/dev/null
for i in $(seq 1 40); do [ -s "logs/$name.png" ] && { echo "logs/$name.png"; exit 0; }; sleep 0.5; done
echo "sin captura (mira logs/log.jsonl)"; exit 1
