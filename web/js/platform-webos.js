// Proveedor webOS (LG). Usa luna() y Ssap de ssap.js.
(function () {
  var P = window.PLATFORM;

  // No está en la lista de launchPoints pero se puede lanzar: el sintonizador.
  var LIVE_TV = {id: "com.webos.app.livetv", title: "TV en directo", icon: "img/livetv.svg", color: "#2c2c30", local: true};

  P.defaultDock = ["com.webos.app.livetv", "com.telefonica.app.nux", "dazn", "amazon", "com.disney.disneyplus-prod"];
  P.defaultExclude = ["com.quickaccesstv.app"];

  var ssap = new Ssap(function (s) { if (P.onStatus) P.onStatus(s); });
  P.ssap = ssap;   // lo usa tools/debug.js

  // Servicio opcional (lg-webos/service, se instala con WATCHDOG=1): vuelve a abrir la app cuando aparece
  // el Home de LG. Si no está instalado, la llamada falla sin más.
  // Usa SSAP con el mismo emparejamiento que la app, así que se arranca cuando la app ya está emparejada.
  ssap.connect().then(function () {
    var reg = JSON.parse(JSON.stringify(SSAP_REGISTER));
    reg["client-key"] = store.get("ssapKey");
    return luna("luna://com.quickaccesstv.app.watchdog/start",
      {register: reg, report: CONFIG.debugReport || ""});
  }).then(function (r) {
    P.watchdog = r;
    if (!r || !r.returnValue) return;
    // El servicio avisa cuando ha devuelto la app tras pulsar la casita.
    luna("luna://com.quickaccesstv.app.watchdog/events", {subscribe: true}, function (m) {
      if (m && m.watchdog === "return" && P.onWatchdogReturn) P.onWatchdogReturn();
    });
  }, function () {});

  P.listApps = function () {
    return ssap.request("ssap://com.webos.applicationManager/listLaunchPoints").then(function (r) {
      var list = (r.launchPoints || []).map(function (lp) {
        return {id: lp.id, title: lp.title, icon: lp.largeIcon || lp.icon, iconColor: lp.iconColor, bgColor: lp.bgColor};
      });
      return [LIVE_TV].concat(list);
    });
  };

  P.launch = function (id, params) {
    return luna("luna://com.webos.applicationManager/launch", {id: id, params: params}).then(function (r) {
      return {ok: r.returnValue !== false};
    });
  };

  // Entradas: TV en directo + HDMI conectados.
  P.inputs = function () {
    return luna("luna://com.webos.service.eim/getAllInputStatus", {}).then(function (r) {
      var items = [{id: LIVE_TV.id, label: "TV en directo"}];
      (r.devices || []).forEach(function (d) {
        items.push({id: d.appId, label: d.label + (d.hdmiPlugIn || d.hdmiSignalExist ? "  ·  conectado" : "")});
      });
      return items;
    });
  };

  P.watchNetwork = function (cb) {
    luna("luna://com.webos.service.connectionmanager/getStatus", {subscribe: true}, function (r) {
      if (r.wired && r.wired.state === "connected") cb({type: "wired", label: "Ethernet"});
      else if (r.wifi && r.wifi.state === "connected") cb({type: "wifi", label: r.wifi.ssid || "Wi-Fi"});
      else cb({type: "none", label: "Sin conexión"});
    });
  };

  P.uninstall = function (id) {
    return luna("luna://com.webos.appInstallService/remove", {id: id, subscribe: false}).then(function (r) {
      return {ok: r.returnValue !== false};
    });
  };

  P.openSettings = function () { luna("luna://com.webos.applicationManager/launch", {id: "com.palm.app.settings"}); };
  // Abre la página de red. webOS 22 no admite un destino directo: se abre Ajustes → General con el foco en
  // «Red» y, con el mando virtual de SSAP (abierto antes, mientras la app sigue delante), se pulsa OK.
  P.openNetworkSettings = function () {
    function launch() {
      luna("luna://com.webos.applicationManager/launch",
        {id: "com.palm.app.settings", params: {target: "general", item: "network"}});
    }
    ssap.request("ssap://com.webos.service.networkinput/getPointerInputSocket", {}).then(function (p) {
      var pointer = new WebSocket(p.socketPath);
      pointer.onopen = function () {
        launch();
        setTimeout(function () {
          pointer.send("type:button\nname:ENTER\n\n");
          setTimeout(function () { pointer.close(); }, 500);
        }, 2500);
      };
      pointer.onerror = launch;
    }, launch);
  };
  P.activate = function () { if (window.PalmSystem && PalmSystem.activate) PalmSystem.activate(); };

  P.watchdogHint = "Pulsa la casita otra vez para ir al menú de LG";

  window.__platformReady();
})();
