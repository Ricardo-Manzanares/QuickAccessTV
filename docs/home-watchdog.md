# HomeWatchdogService: pantalla de inicio propia sin root en Fire TV y LG webOS

Técnica original, investigada y desarrollada por el autor de QuickAccess TV (octubre de 2026), para que
una app de terceros actúe como pantalla de inicio en sistemas que **no permiten sustituir el Home sin
root**: Fire OS (Fire TV) y webOS (televisores LG).

La idea es la misma en las dos plataformas: no se intenta ganar el botón Inicio, que el sistema reserva
para su launcher, sino **vigilar qué app está en primer plano por un canal que el sistema sí permite** y,
en cuanto aparece el Home del fabricante, **volver a abrir la app encima**. Cada plataforma bloquea los
caminos habituales de forma distinta, así que cada implementación usa su propio canal permitido.

Es **opcional**: solo se instala si se pide (`WATCHDOG=1`, ver [Instalación](#instalación)).

## Qué aporta y trabajos relacionados

Vigilar el Home y reabrir otra app no es nuevo como idea; lo que es original de este trabajo son los
**canales y mecanismos** con que se consigue en cada sistema, sin root y sin depender de registros
internos ni de interceptar el mando:

| | Trabajos anteriores | HomeWatchdogService |
|---|---|---|
| Fire TV | [FireStarter](https://github.com/jkchr1s/FireStarter), Launcher Manager y FTVLaunchX leían el registro del sistema (logcat) por una conexión ADB local para detectar el botón Home. Amazon los bloqueó por nombre ([AFTVnews](https://www.aftvnews.com/tag/firestarter/)). | Detecta el launcher de Amazon con **estadísticas de uso** (`UsageStatsManager`, permiso concedido con `appops`), sin leer registros ni conexión ADB interna. Tapa la espera de ~5 s que impone Android tras pulsar Home con una **ventana superpuesta** con la última imagen de la app, y usa el menú de pulsación larga de Fire OS como salida. |
| LG webOS | [LG-TV-HA-Home-Launcher](https://github.com/mbsintegrations/LG-TV-HA-Home-Launcher) (octubre de 2026) incluye un *helper* opcional que **intercepta las pulsaciones del mando** a nivel de Linux con programas nativos ARM, a través de SSH del Modo Desarrollador. Para abrir el launcher al encender la tele y volver a él al salir de una app, se apoya en **Home Assistant**, un servidor externo cuya integración de LG observa el estado y la app activa de la tele ([documentación](https://github.com/mbsintegrations/LG-TV-HA-Home-Launcher/blob/main/docs/HOME-ASSISTANT.md#start-home-when-the-tv-turns-on)). | Todo ocurre **dentro de la tele**, sin servidores externos: un **servicio JS** del propio paquete de la app vigila la app en primer plano por **SSAP** (la API de segunda pantalla de la tele) reutilizando el emparejamiento de la app, sin binarios nativos ni SSH. Sobrevive al reposo y arranca tras un arranque en frío con **actividades persistentes** del gestor de actividades, cuyo disparador es un método del propio servicio. |

## Versiones de la investigación

Todo lo descrito se investigó y comprobó en estos aparatos y versiones. Los identificadores internos
(actividades de Amazon, apps de LG) y los permisos que el sistema concede a terceros dependen de la
versión: en otras pueden cambiar.

| Plataforma | Aparato | Sistema | Componentes relevantes |
|---|---|---|---|
| Fire TV | Fire TV Stick 4K (1.ª generación, AFTMM) | Fire OS 6.7.1.1 (NS6711/5908), Android 7.1.2, API 25 | Launcher de Amazon `com.amazon.tv.launcher` (versión 724601010); ajustes `com.amazon.tv.settings.v2` |
| LG webOS | Televisor LG de 2022 | webOS TV 7.6.0 (webOS 22), firmware 04.60.90 | Servicios JS con Node.js v12.21.0; gestor de actividades `com.palm.activitymanager`; `@webos-tools/cli` 3.2.6; librería `ws` 7.5.10 |

## Fire TV (Fire OS)

### Por qué no se puede sustituir el Home

- El Home se resuelve por prioridad de intent-filter. El launcher de Amazon
  (`com.amazon.tv.launcher/.ui.HomeActivity_vNext`) declara prioridad 950; Android recorta a 0 la de
  cualquier app de terceros, y `cmd package set-home-activity` no puede superar una prioridad mayor.
- `com.amazon.tv.launcher` y `com.amazon.firehomestarter` son paquetes protegidos: no se pueden
  desactivar ni desinstalar.
- Fire OS bloquea habilitar servicios de accesibilidad de terceros (la técnica habitual de "Launcher
  Hijack"), y un servicio de accesibilidad tampoco recibe `KEYCODE_HOME`.
- Fire OS oculta de su biblioteca las apps que declaran `HOME`, así que la app no debe declararlo.

### Canal permitido: estadísticas de uso

Fire OS sí permite conceder por ADB el permiso de estadísticas de uso:

```sh
adb shell appops set com.quickaccesstv.app.firetv android:get_usage_stats allow
```

`HomeWatchdogService` es un servicio en primer plano que sondea `UsageStatsManager` cada 100 ms y procesa
los eventos `MOVE_TO_FOREGROUND` nuevos. Cuando el primer plano pasa a `com.amazon.tv.launcher` o
`com.amazon.firehomestarter`, abre `MainActivity` encima.

### Lo que hubo que resolver

| Problema | Solución |
|---|---|
| Tras pulsar Home, Android 7 retiene ~5 s cualquier `startActivity` lanzado desde segundo plano (`stopAppSwitches`); saltarlo exige el permiso de firma `STOP_APP_SWITCHES`. | `Cover`: una ventana superpuesta (`TYPE_PHONE`, permiso `SYSTEM_ALERT_WINDOW` concedido por `appops`) muestra la última captura de la app mientras Fire OS la devuelve. Se usa `TYPE_PHONE` y no `TYPE_SYSTEM_ALERT` porque con este último el botón Home deja de funcionar. |
| Hace falta una forma de ir al Home de Amazon. | La pulsación larga de Home abre `com.amazon.tv.settings.v2/.hud.HudActivity`; al verla, el servicio se pausa hasta que se abra la app a mano o se reinicie el aparato. |
| `android.settings.SETTINGS` abre una pestaña dentro del propio `HomeActivity_vNext` (pasando antes por `com.amazon.tv.settings.v2/.compliance.CTSDummySettingsHandler`). | La app abre `com.amazon.tv.launcher/.ui.MainSettingsActivity` (intent `MAIN` + categoría `LEANBACK_SETTINGS`), que es una actividad aparte y no se tapa. El Home solo se respeta si llega desde `CTSDummySettingsHandler`. |
| Al arrancar, el primer plano pasa por `com.amazon.tv.settings.v2/.system.FallbackHome`. | Se ignora como "Ajustes"; un `BOOT_COMPLETED` arranca el servicio y repasa el historial reciente para tapar el Home que ya está delante. |
| El tile de favoritos salía roto si el id de la app existía en el catálogo de la Appstore. | Id propio que no existe en el catálogo (`com.quickaccesstv.app.firetv`). |
| El launcher de Amazon solo regenera la imagen de los tiles al arrancar y la guarda por paquete: tras instalar o actualizar, el tile sale en blanco; cerrar el launcher no está permitido (paquete protegido). | Reiniciar tras instalar (lo hace el script de instalación) y, si se actualiza sin reiniciar, la app lo detecta y ofrece abrir Ajustes → Mi Fire TV → Reiniciar. |
| Una app recién instalada queda "detenida" y no recibe `BOOT_COMPLETED` hasta abrirse una vez. | El script de instalación la abre antes de reiniciar. |
| `BOOT_COMPLETED` es un broadcast ordenado y Fire OS lo entrega primero a sus apps: la nuestra lo recibía más de un minuto después de encender, y el historial de uso no siempre recoge el Home de ese arranque. | Receptor con `android:priority="999"`, y al recibirlo abre la app directamente en vez de esperar a detectar el Home. |

### Comportamiento

| Acción | Resultado |
|---|---|
| Pulsar Inicio | Vuelve a QuickAccess TV; la espera de Fire OS queda tapada por la última imagen de la app. Durante 5 s, un aviso recuerda «Mantén pulsado Inicio para ir al Home de Amazon». |
| Mantener pulsado Inicio | Menú rápido de Fire TV; la vuelta automática queda en pausa, con un aviso que lo indica. |
| Abrir la app a mano | Se reactiva. |
| Encender o reiniciar | La app se abre sola y la vuelta automática se reactiva. |

Código: `android/app/src/firetvWatchdog/` (`HomeWatchdogService`, `Cover`, `FireApp`, `BootReceiver`).

## LG webOS

### Por qué no se puede sustituir el Home

- La casita del mando siempre abre la barra de inicio de LG (`com.webos.app.home`); no se puede
  reasignar sin root.
- webOS congela las apps que no están en primer plano, incluso con `keepAlive`, así que una app no puede
  vigilar en segundo plano.
- Las APIs de aplicaciones de Luna (`getForegroundAppInfo`, `listLaunchPoints`…) están vetadas para
  apps y servicios de terceros (`Denied method call`).

### Canal permitido: un servicio JS que habla SSAP

El Modo Desarrollador permite instalar junto a la app un **servicio JS** (Node.js), que webOS ejecuta
aparte de la interfaz y no congela. Ese servicio no puede usar Luna para saber qué app está delante, pero
sí **SSAP** (`ws://127.0.0.1:3000`), la API de segunda pantalla que usa el móvil para controlar la tele:

1. La app, que ya está emparejada por SSAP para leer la lista de apps, arranca el servicio y le pasa su
   registro (manifiesto + clave). No aparece ningún aviso nuevo en la tele.
2. El servicio se suscribe a `ssap://com.webos.applicationManager/getForegroundAppInfo` y al estado de
   energía (`ssap://com.webos.service.tvpower/power/getPowerState`).
3. Cuando el primer plano pasa a `com.webos.app.home`, abre la app con `ssap://system.launcher/launch`.

Node.js en webOS 22 es la versión 12 y no trae WebSocket: el servicio usa la librería `ws` 7.

### Lo que hubo que resolver

| Problema | Solución |
|---|---|
| Mientras la barra de LG entra (unos 0,5 s), la tele acepta las órdenes de abrir la app pero las ignora; pulsar Atrás en ese momento tampoco la cierra. | Se abre la app a los 0,5 s y se reintenta cada 0,3 s si la barra sigue delante (hasta 5 veces): la app vuelve en unos 0,7 s. |
| La barra puede volver a ponerse delante una vez justo después de abrir la app (fin de su animación). | Si reaparece cuando la app lleva menos de 1,2 s delante, se trata como animación y se reintenta. |
| Hace falta una forma de ir a la barra de LG. | Pulsar Inicio otra vez cuando la app ya ha vuelto (menos de 6 s después) pausa la vuelta automática hasta abrir la app a mano. Al volver, la app muestra durante 5 s «Pulsa la casita otra vez para ir al menú de LG» (el servicio se lo comunica con una suscripción propia, `events`); al pausar, el servicio muestra un aviso del sistema de LG (`ssap://system.notifications/createToast`). |
| Los Ajustes y la página de Red se abren encima sin cambiar el primer plano. | Solo se reacciona a `com.webos.app.home`; los Ajustes no se tapan. |
| El servicio debe sobrevivir al reposo y volver a arrancar tras un arranque en frío sin abrir la app. | Una actividad del gestor de actividades (`com.palm.activitymanager`) mantiene vivo el servicio. Además se crean dos actividades **persistentes**: una cuyo disparador es un método del propio servicio (al arrancar la tele, el gestor restaura la actividad y se suscribe a ese método, lo que arranca el servicio) y otra periódica cada 5 min como respaldo, el intervalo mínimo admitido. Disparar con el estado de encendido (`tvpower`) está vetado a terceros. |
| Al encender desde reposo, la tele abre su primera app (TV en directo o el último HDMI), y abrir QuickAccess TV encima cortaría el canal que se está viendo. | No se abre la app al encender: se deja la app de la tele delante. El servicio se suscribe al estado de energía por SSAP (`ssap://com.webos.service.tvpower/power/getPowerState`, permiso `READ_POWER_STATE`) y, al pasar de reposo a `Active`, solo quita la pausa. |
| El primer plano también pasa por un valor vacío al cerrarse ventanas de LG (actualización de software, Modo Desarrollador...), no solo al apagar la pantalla; tomarlo como apagado hacía que el cierre de una ventana quitara la pausa y abriera la app como si se encendiera la tele. | El reposo se decide solo con el estado de energía. El primer plano vacío solo se usa como indicio de apagado si la tele no informa de su estado de energía. |
| Cada vez que algo se empareja por SSAP con la tele, caducan las direcciones de iconos que la app tenía. | Si quedan iconos sin cargar tras los reintentos, la app vuelve a pedir la lista de apps. |

### Comportamiento

| Acción | Resultado |
|---|---|
| Pulsar la casita | Vuelve a QuickAccess TV en unos 0,7 s, con un aviso breve de cómo ir al menú de LG. |
| Pulsar la casita otra vez con la app ya de vuelta | Se queda la barra de LG, con un aviso de que la vuelta automática está en pausa. |
| Abrir la app a mano | Se reactiva. |
| Encender la tele | Se queda la app con la que arranca la tele (TV en directo o la última entrada); la vuelta automática se reactiva. |

Código: `lg-webos/service/` (`service.js`, `services.json`, `package.json`).

## Instalación

Es opcional en las dos plataformas: sin `WATCHDOG=1` se instala solo la app.

```sh
# Fire TV
TV=<ip-de-la-tele>:5555 FLAVOR=firetv WATCHDOG=1 ./android/build-and-install.sh

# LG webOS
cd lg-webos && WATCHDOG=1 ./build-and-install.sh
```

Para quitarlo, basta con reinstalar sin `WATCHDOG=1`. En LG, las actividades persistentes que quedan
registradas apuntan a un servicio que ya no existe y no hacen nada.

## Límites

- Ninguna de las dos técnicas cambia el botón Inicio: el Home del fabricante llega a aparecer un instante.
- En LG depende del Modo Desarrollador: si caduca la sesión, webOS borra la app y el servicio.
- Ambos usan identificadores internos del fabricante (actividades de Amazon, apps de LG); una
  actualización del sistema puede cambiarlos.
