#!/usr/bin/env bash
# Usage: tools/disable.sh pkg [pkg ...]  — pm disable-user --user 0, one call per package, logged to disabled.list
cd "$(dirname "$0")/.."
PROTECTED='^(android|com\.android\.(permissioncontroller|packageinstaller|systemui|shell|phone|settings|tv\.settings|providers\.(settings|media|media\.module|downloads|tv|telephony))|com\.google\.android\.(permissioncontroller|packageinstaller|ext\.services|ext\.shared|modulemetadata|gms|gsf|inputmethod\.latin)|com\.android\.(ext\.services|ext\.shared|modulemetadata)|com\.google\.android\.overlay\.modules.*|com\.android\.vending|com\.iwedia\..*|com\.google\.android\.tv\.(dtvinput|dtvprovider\.service|remote\.service|teletextservice)|com\.mft\.rcupair|com\.sdt\.(globalkey|vendor)|com\.droidlogic.*|com\.android\.bluetooth)$'
for p in "$@"; do
  if echo "$p" | grep -qE "$PROTECTED"; then echo "REFUSED (core/needed): $p"; continue; fi
  out=$(tools/tv.sh "pm disable-user --user 0 $p" | tr -d '\r'); echo "$out"
  if tools/tv.sh 'pm list packages -d' | tr -d '\r' | grep -qx "package:$p"; then
    grep -qx "$p" disabled.list 2>/dev/null || echo "$p" >> disabled.list
  else echo "NOT DISABLED: $p"; fi
done
