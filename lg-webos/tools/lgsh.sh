#!/usr/bin/env bash
# Usage: tools/lgsh.sh 'command'   or   tools/lgsh.sh < script.sh
# Runs a shell on the LG TV over Developer Mode SSH (user prisoner, port 9922).
# The key passphrase comes from $LG_ASKPASS (a script that prints it).
LG_HOST="${LG_HOST:?indica la tele: LG_HOST=<ip-de-la-tele>}"
export SSH_ASKPASS="${LG_ASKPASS:?set LG_ASKPASS to a script that prints the key passphrase}" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
exec ssh -i "${LG_KEY:-$HOME/.ssh/webos_rsa}" -p 9922 -oHostKeyAlgorithms=+ssh-rsa -oPubkeyAcceptedAlgorithms=+ssh-rsa \
  -oConnectTimeout=8 -oStrictHostKeyChecking=accept-new prisoner@"$LG_HOST" "${1:-sh -s}"
