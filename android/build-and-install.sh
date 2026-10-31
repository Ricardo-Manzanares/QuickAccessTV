#!/usr/bin/env bash
# Copia la UI web compartida a los assets, compila el APK e instala la app.
# Uso:  TV=ip:5555 [FLAVOR=androidtv|firetv] [WATCHDOG=1] ./build-and-install.sh
#   TV=ip:port        tele destino (ADB por red, obligatorio)
#   FLAVOR=androidtv  variante CON HOME, para usar como launcher (por defecto)
#   FLAVOR=firetv     variante SIN HOME, aparece en la biblioteca de apps de Fire TV
#   WATCHDOG=1        (solo firetv, opcional) instala también HomeWatchdogService: vuelve a abrir la app
#                     al pulsar Inicio. Sin esta opción el servicio no se instala.
#   NO_REBOOT=1       (solo firetv) no reiniciar el Fire TV al terminar. Por defecto se reinicia: su launcher
#                     solo vuelve a leer el icono y el banner de la app al arrancar.
set -e
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
BUILD="${BUILD:-$HOME/android-build}"
export JAVA_HOME="${JAVA_HOME17:-$(ls -d "$BUILD"/jdk/* | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$BUILD/sdk}"
ADB="${ADB:-$ANDROID_HOME/platform-tools/adb}"
TV="${TV:?indica la tele, p. ej.: TV=<ip-de-la-tele>:5555 ./build-and-install.sh}"
FLAVOR="${FLAVOR:-androidtv}"
WD="plain"
[ "$FLAVOR" = "firetv" ] && [ "${WATCHDOG:-0}" = "1" ] && WD="watchdog"
# Id instalado (la variante firetv lleva sufijo, ver app/build.gradle); las clases están en com.quickaccesstv.app.
PKG="com.quickaccesstv.app"
[ "$FLAVOR" = "firetv" ] && PKG="com.quickaccesstv.app.firetv"

# UI web compartida -> assets del APK
rm -rf app/src/main/assets/web
mkdir -p app/src/main/assets/web
cp -r ../web/. app/src/main/assets/web/

# Variante Gradle = destino + watchdog: androidtvPlain, firetvPlain o firetvWatchdog
cap() { echo "$(echo "${1:0:1}" | tr '[:lower:]' '[:upper:]')${1:1}"; }
VARIANT="${FLAVOR}$(cap "$WD")"
TASK="assemble$(cap "$VARIANT")Debug"
echo "sdk.dir=$(cygpath -m "$ANDROID_HOME" 2>/dev/null || echo "$ANDROID_HOME")" > local.properties
./gradlew --no-daemon -q "$TASK"
APK="app/build/outputs/apk/${VARIANT}/debug/app-${FLAVOR}-${WD}-debug.apk"
echo "built $APK ($(du -h "$APK" | cut -f1))"

"$ADB" connect "$TV" >/dev/null
# 'adb install' puede colgarse en Android 14 esperando confirmación en pantalla: push + pm install.
"$ADB" -s "$TV" push "$APK" /data/local/tmp/quickaccesstv.apk >/dev/null
"$ADB" -s "$TV" shell "pm install -r /data/local/tmp/quickaccesstv.apk"
"$ADB" -s "$TV" shell "rm /data/local/tmp/quickaccesstv.apk"
"$ADB" -s "$TV" shell "pm grant $PKG android.permission.ACCESS_FINE_LOCATION" || true
# La variante androidtv puede ser el Home (tiene el alias); la firetv no.
if [ "$FLAVOR" = "androidtv" ]; then
  "$ADB" -s "$TV" shell "cmd package set-home-activity $PKG/com.quickaccesstv.app.HomeAlias" || true
fi
# Con watchdog: vigila el launcher de Amazon con estadísticas de uso (HomeWatchdogService)...
if [ "$WD" = "watchdog" ]; then
  "$ADB" -s "$TV" shell "appops set $PKG android:get_usage_stats allow" || true
  # ...y lo tapa con una captura de la app mientras Fire OS retiene ~5 s la vuelta (Cover).
  "$ADB" -s "$TV" shell "appops set $PKG SYSTEM_ALERT_WINDOW allow" || true
fi
# Lanzar directamente la actividad (nombre de clase completo: no lleva el sufijo del id). Tras una
# instalación nueva Android deja la app "detenida" y no le entrega BOOT_COMPLETED hasta que se abre una
# vez: abrirla aquí es lo que permite que el watchdog arranque solo al encender.
"$ADB" -s "$TV" shell "am start -n $PKG/com.quickaccesstv.app.MainActivity"
# Fire TV: el launcher de Amazon solo regenera las imágenes de los tiles al arrancar; sin reiniciar, el
# tile de la app sale en blanco tras instalar o actualizar.
if [ "$FLAVOR" = "firetv" ] && [ "${NO_REBOOT:-0}" != "1" ]; then
  sleep 5
  echo "Reiniciando el Fire TV para que muestre el icono de la app (NO_REBOOT=1 para evitarlo)..."
  "$ADB" -s "$TV" reboot
fi
