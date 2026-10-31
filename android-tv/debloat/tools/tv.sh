#!/usr/bin/env bash
export MSYS_NO_PATHCONV=1
# Usage: tools/tv.sh '<shell command>'   — runs one shell command on the TV
ADB="${ADB:-adb}"
TV="${TV:?indica la tele: TV=<ip>:5555}"
exec "$ADB" -s "$TV" shell "$@"
