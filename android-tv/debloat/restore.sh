#!/usr/bin/env bash
# Re-enables every package listed in disabled.list and restores the stock home screen.
# Uso: TV=<ip-de-la-tele>:5555 ./restore.sh
cd "$(dirname "$0")"
ADB="${ADB:-adb}"; TV="${TV:?indica la tele: TV=<ip>:5555}"; export MSYS_NO_PATHCONV=1
"$ADB" connect "$TV" >/dev/null
for p in com.google.android.tvlauncher com.google.android.tungsten.setupwraith $(cat disabled.list 2>/dev/null); do
  echo "enable $p"; "$ADB" -s "$TV" shell "pm enable --user 0 $p"
done
"$ADB" -s "$TV" shell "cmd package set-home-activity com.google.android.tvlauncher/.MainActivity"
"$ADB" -s "$TV" shell "settings put secure screensaver_components com.google.android.backdrop/.Backdrop"
echo "Opcional, quitar QuickAccess TV:  $ADB -s $TV uninstall com.quickaccesstv.app"
