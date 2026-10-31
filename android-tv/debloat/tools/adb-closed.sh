#!/usr/bin/env bash
# Usage: tools/adb-closed.sh <ip> [port]  — checks that network ADB is really closed.
# Only "Connection refused" proves the port is closed; a timeout just means unreachable.
IP="${1:?uso: tools/adb-closed.sh <ip> [puerto]}"; PORT="${2:-5555}"
out=$(timeout 4 bash -c "exec 3<>/dev/tcp/$IP/$PORT" 2>&1); rc=$?
if [ $rc -eq 0 ]; then echo "OPEN: $IP:$PORT still accepts connections - ADB is NOT closed"; exit 1
elif echo "$out" | grep -qi refused; then echo "CLOSED: $IP:$PORT refused the connection"; exit 0
else echo "UNKNOWN: no answer from $IP:$PORT (timeout/unreachable) - this proves nothing; is the TV on?"; exit 2
fi
