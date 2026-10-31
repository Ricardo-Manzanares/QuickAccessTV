#!/usr/bin/env bash
export MSYS_NO_PATHCONV=1
# Usage: tools/shot.sh <out.png> [KEY ...]  — press keys (e.g. DPAD_RIGHT HOME), then capture the screen
ADB="${ADB:-adb}"; TV="${TV:?indica la tele: TV=<ip>:5555}"
out="$1"; shift
for k in "$@"; do "$ADB" -s "$TV" shell input keyevent "KEYCODE_$k"; sleep 0.6; done
sleep 1
"$ADB" -s "$TV" shell screencap -p /sdcard/_shot.png && "$ADB" -s "$TV" pull /sdcard/_shot.png "$out" >/dev/null
[ -s "$out" ] || { echo "empty screenshot (protected content?) - check topResumedActivity"; exit 1; }
echo "$out"
