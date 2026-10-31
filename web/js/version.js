// Versión y novedades de la app. ÚNICO sitio donde se define: mantener igual en las 3 compilaciones
// (lg-webos/appinfo.json "version" y android versionName deben coincidir). Se muestra en Ajustes ⚙ → Novedades.
var APP_VERSION = "3.0.0";

// Novedades recientes (más reciente primero). El detalle completo está en el README del repositorio.
var CHANGELOG = [
  {v: "3.0.0", items: [
    "QuickAccess TV para LG webOS, Android TV y Fire TV, con una sola interfaz.",
    "Dock y rejilla de apps, carpetas, reordenar con el mando y fondos 4K.",
    "HomeWatchdogService (opcional) en Fire TV y LG: vuelve sola al pulsar Inicio, sin root.",
    "Fire TV: mantener Inicio pulsado deja el Home de Amazon. LG: pulsar la casita otra vez deja la barra de LG.",
    "Fire TV: el botón de Ajustes abre la Configuración a pantalla completa."
  ]}
];
