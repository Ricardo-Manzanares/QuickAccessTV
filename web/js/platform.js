// Capa de plataforma: una sola UI web para dos televisores.
//   - webOS (LG): usa SSAP (ws://127.0.0.1:3000) + luna (PalmServiceBridge).  -> platform-webos.js
//   - Android TV: usa un puente nativo inyectado por el WebView (window.AndroidHome). -> platform-android.js
// home.js solo habla con window.PLATFORM; el proveedor llama a window.__platformReady() cuando está listo.
(function () {
  function load(src, cb) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = cb || null;
    document.head.appendChild(s);
  }

  var P = {
    name: "",
    defaultDock: [],
    defaultExclude: [],
    onStatus: null
  };
  P.ready = new Promise(function (resolve) { window.__platformReady = resolve; });
  window.PLATFORM = P;

  try { console.log("PLATFORM detect: AndroidHome=" + (!!window.AndroidHome)); } catch (e) {}
  if (window.AndroidHome) {
    P.name = "android";
    load("js/platform-android.js");
  } else {
    P.name = "webos";
    load("js/ssap-manifest.js", function () {
      load("js/ssap.js", function () {
        load("js/platform-webos.js");
        // Solo en desarrollo (CONFIG.debugReport): registros y capturas para lg-webos/tools/shot.sh.
        if (window.CONFIG && CONFIG.debugReport) load("js/debug.js");
      });
    });
  }
})();
