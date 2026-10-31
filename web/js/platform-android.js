// Proveedor Android TV. Habla con el puente nativo window.AndroidHome (inyectado por el WebView).
// Los iconos/banners se sirven desde el mismo origen (WebViewAssetLoader) para no "contaminar" el canvas.
(function () {
  var P = window.PLATFORM;
  var A = window.AndroidHome;
  var ICON = "https://appassets.androidplatform.net/appicon/";

  P.defaultExclude = [];
  // Dock por defecto; lo que no esté instalado se ignora solo.
  P.defaultDock = [
    "com.google.android.youtube.tv", "com.netflix.ninja", "com.disney.disneyplus",
    "com.amazon.amazonvideo.livingroom", "com.google.android.videos"
  ];

  function parse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

  // Fire TV: fuera las apps de sistema de Amazon/Android salvo estas (las instaladas por ti siempre se ven).
  var FIRE_KEEP_SYSTEM = ["com.amazon.firebat"];   // Prime Video
  var fireTv = false;
  try { fireTv = !!(A.isFireTv && A.isFireTv()); } catch (e) {}
  // Con el servicio de vuelta automática (variante firetvWatchdog), aviso al volver tras pulsar Inicio.
  if (fireTv) P.watchdogHint = "Mantén pulsado Inicio para ir al Home de Amazon";

  // Fire TV tras actualizar la app: su launcher no vuelve a leer el icono hasta reiniciar.
  if (fireTv && A.consumeUpdateNotice && A.consumeUpdateNotice()) {
    P.updateNotice = {
      text: "QuickAccess TV se ha actualizado. Para que su icono se vea en el inicio de Fire TV, reinicia el Fire TV.",
      action: "Reiniciar el Fire TV",
      run: function () { try { A.openDeviceSettings(); } catch (e) {} }
    };
  }

  P.listApps = function () {
    var apps = parse(A.listApps(), []);
    if (fireTv) {
      apps = apps.filter(function (a) { return !a.system || FIRE_KEEP_SYSTEM.indexOf(a.id) >= 0; });
    }
    return Promise.resolve(apps.map(function (a) {
      return {id: a.id, title: a.title, icon: ICON + encodeURIComponent(a.id), color: a.color, cover: !!a.cover};
    }));
  };

  P.launch = function (id) {
    var ok = true;
    try { ok = A.launch(id); } catch (e) { ok = false; }
    return Promise.resolve({ok: ok !== false});
  };

  P.openSettings = function () { try { A.openSettings(); } catch (e) {} };

  // Muestra el diálogo del sistema para desinstalar; la lista se refresca al volver.
  P.uninstall = function (id) { try { A.uninstall(id); } catch (e) {} return Promise.resolve({ok: true}); };

  if (A.openWifiSettings) {
    P.openNetworkSettings = function () { try { A.openWifiSettings(); } catch (e) {} };
  }

  if (A.network) {
    P.watchNetwork = function (cb) {
      function tick() { cb(parse(A.network(), {type: "none", label: "Sin conexión"})); }
      tick();
      setInterval(tick, 5000);
    };
  }

  // Entradas HDMI: en Android TV las gestiona el sistema; esta capa no ofrece menú de entradas.

  window.__platformReady();
})();
