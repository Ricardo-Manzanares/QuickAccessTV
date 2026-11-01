// Servicio JS de webOS que acompaña a QuickAccess TV: escucha qué app está en primer plano y, cuando
// aparece el Home de LG, vuelve a abrir QuickAccess TV encima (como el watchdog de Fire TV).
// La app lo arranca con luna://com.quickaccesstv.app.watchdog/start y le pasa su registro SSAP
// (las APIs luna de aplicaciones están vetadas para servicios de terceros; SSAP no).
var Service = require("webos-service");
var WebSocket = require("ws");
var http = require("http");
var url = require("url");
var pkg = require("./package.json");

var APP_ID = "com.quickaccesstv.app";
var HOME_ID = "com.webos.app.home";   // la barra de inicio de LG (casita del mando)
var DELAY_MS = 500;     // abrir la app antes de que la barra termine de entrar no sirve: la tele lo ignora
var RETRY_MS = 300;     // si la barra sigue delante, se vuelve a intentar
var MAX_ATTEMPTS = 5;
var ESCAPE_MS = 6000;   // Inicio otra vez antes de este tiempo (con la app ya de vuelta): se queda el Home de LG
var SETTLE_MS = 1200;   // si la barra reaparece antes de esto, es su animación de entrada, no otra pulsación
var service = new Service(pkg.name);

var report = "";        // CONFIG.debugReport de la app: registros al PC (solo desarrollo)
var dryRun = false;     // true: solo observar, sin volver a abrir la app
var register = null;    // payload de registro SSAP (manifiesto + client-key) que manda la app
var started = false;
var paused = false;     // en pausa tras pulsar Inicio dos veces; se reactiva al abrir la app a mano
var fg = "";            // app en primer plano
var screenOff = false;  // la tele está en reposo (según su estado de energía)
var powerKnown = false; // el estado de energía llega por SSAP; si no, se deduce del primer plano vacío
var returning = false;  // se está devolviendo la app tras pulsar la casita
var cycleStart = 0;     // cuándo apareció la barra en este ciclo de vuelta
var appSince = 0;       // cuándo volvió a estar delante la app
var lastLaunch = 0;
var attempts = 0;
var timer = null;
var events = [];

function log(name, data) {
  events.push({t: Date.now(), name: name, data: data});
  if (events.length > 50) events.shift();
  if (!report) return;
  try {
    var u = url.parse(report);
    var body = JSON.stringify({t: Date.now(), name: "svc:" + name, data: data});
    var req = http.request({hostname: u.hostname, port: u.port, path: "/log", method: "POST",
      headers: {"Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)}});
    req.on("error", function () {});
    req.end(body);
  } catch (e) {}
}

// --- SSAP (ws://127.0.0.1:3000) ---------------------------------------------------------------
var ws = null, n = 0, pending = {};

function ssapSend(type, uri, payload, cb) {
  var id = "s" + (++n);
  if (cb) pending[id] = cb;
  ws.send(JSON.stringify({id: id, type: type, uri: uri, payload: payload || {}}));
}

function connect() {
  ws = new WebSocket("ws://127.0.0.1:3000");
  ws.on("open", function () {
    ws.send(JSON.stringify({id: "register", type: "register", payload: register}));
  });
  ws.on("message", function (data) {
    var msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.id === "register") {
      if (msg.type === "registered") {
        log("ssap", {registered: true});
        ssapSend("subscribe", "ssap://com.webos.applicationManager/getForegroundAppInfo", {}, function (p) {
          onForeground(p);
        });
        ssapSend("subscribe", "ssap://com.webos.service.tvpower/power/getPowerState", {}, function (p) {
          onPower(p);
        });
      } else if (msg.type === "error") {
        log("ssap", {error: msg.error});
      }
      return;
    }
    if (pending[msg.id]) pending[msg.id](msg.payload || {}, msg);
  });
  ws.on("close", function () { log("ssap", {closed: true}); setTimeout(connect, 3000); });
  ws.on("error", function (e) { log("ssap", {error: String(e && e.message)}); });
}

// La app se suscribe a "events": así sabe que ha vuelto por la casita y muestra cómo llegar a la barra.
var listeners = [];
function notifyReturn() {
  log("notifyReturn", {listeners: listeners.length});
  listeners.forEach(function (m) { try { m.respond({returnValue: true, subscribed: true, watchdog: "return"}); } catch (e) {} });
}

// Estado de energía: "Active" es la tele encendida; "Active Standby", "Suspend", "Screen Off"... es reposo.
// Los avisos con "processing" son transiciones (p. ej. "Request Power Off") y se espera al estado final.
// El primer plano vacío no sirve para esto: también llega al cerrarse ventanas de LG (actualización de
// software, Modo Desarrollador...) justo antes de que vuelva la barra de inicio.
function onPower(p) {
  if (p.returnValue === false || !p.state) {
    log("power", {error: p.errorText || p.errorCode || "sin estado"});
    return;
  }
  log("power", {state: p.state, processing: p.processing});
  if (p.processing) return;
  var on = p.state === "Active" || p.state === "Screen Saver";
  var wasKnown = powerKnown;
  powerKnown = true;
  if (!on) {
    screenOff = true;
    clearTimeout(timer);
    return;
  }
  if (screenOff && wasKnown) powerOn();
  screenOff = false;
}

// Encendido: se quita la pausa, pero no se abre la app. La tele arranca en TV en directo (o en su última
// entrada) y abrir la app encima cortaría lo que se está viendo; la casita ya lleva a QuickAccess TV.
function powerOn() {
  paused = false;
  log("powerOn", {appId: fg});
}

function onForeground(p) {
  var app = p.appId, now = Date.now();
  log("foreground", {appId: app, paused: paused});
  if (!app) {               // ventana de LG cerrándose o pantalla apagando
    if (!powerKnown) screenOff = true;
    fg = "";
    clearTimeout(timer);
    return;
  }
  fg = app;
  if (screenOff) {
    if (powerKnown) return;   // en reposo: el encendido lo detecta onPower
    screenOff = false;
    powerOn();
  }
  if (app !== HOME_ID) {
    clearTimeout(timer);
    if (app === APP_ID) {
      appSince = now;
      attempts = 0;
      // Devuelta por la casita: la app recuerda cómo llegar a la barra de LG.
      if (returning) { returning = false; notifyReturn(); }
      // Abierta a mano (no por nuestra redirección): se reactiva.
      if (paused && now - lastLaunch > 3000) { paused = false; log("resume", {}); }
    }
    return;
  }
  if (dryRun || paused) return;
  if (now - cycleStart < ESCAPE_MS) {
    // Inicio otra vez cuando la app ya había vuelto (y no es la barra terminando de entrar):
    // el usuario quiere el Home de LG.
    if (appSince > cycleStart && now - appSince >= SETTLE_MS) {
      paused = true;
      clearTimeout(timer);
      log("pause", {});
      ssapSend("request", "ssap://system.notifications/createToast",
        {message: "QuickAccess TV en pausa: ábrela para que la casita vuelva a llevarte a ella."});
      return;
    }
  } else {
    cycleStart = now;
  }
  returning = true;
  schedule(DELAY_MS);
}

// Abre la app cuando la barra ya ha entrado (antes, la tele ignora la orden) y lo reintenta si la barra
// sigue delante.
function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(function () {
    if (paused || fg === APP_ID) return;
    if (fg !== HOME_ID) return;
    if (attempts >= MAX_ATTEMPTS) { log("giveup", {}); return; }
    attempts++;
    lastLaunch = Date.now();
    var attempt = attempts;
    ssapSend("request", "ssap://system.launcher/launch", {id: APP_ID}, function (r) {
      log("redirect", {ok: r.returnValue, attempt: attempt});
    });
    schedule(RETRY_MS);
  }, delay);
}

function begin() {
  // Una actividad mantiene vivo el servicio; sin ella webOS lo cierra a los pocos segundos de inactividad.
  service.activityManager.create("quickaccesstv-watchdog", function (activity) {
    log("activity", {ok: !!activity});
  });
  connect();
  persistBoot();
}

// Actividades persistentes (sobreviven al apagado) que vuelven a arrancar el servicio tras encender la tele,
// aunque nadie abra la app. Llevan el registro SSAP en sus parámetros:
//  - "boot": su disparador es nuestro propio método bootTrigger. Al encender, el gestor de actividades
//    restaura la actividad y se suscribe al disparador, y eso arranca el servicio al instante. El método
//    nunca cumple la condición, así que el callback no llega a ejecutarse (no hay bucle).
//  - "periodic": respaldo cada 5 min (el intervalo mínimo que admite webOS).
function persistBoot() {
  var params = {register: register, report: report};
  var callback = {method: "luna://" + pkg.name + "/start", params: params};
  var activities = {
    boot: {
      name: "quickaccesstv-power",
      description: "Arranca el servicio de QuickAccess TV al encender la tele",
      type: {foreground: true, persist: true},
      trigger: {
        method: "luna://" + pkg.name + "/bootTrigger",
        params: {subscribe: true, register: register, report: report},
        where: {prop: "fired", op: "=", val: true}
      },
      callback: callback
    },
    periodic: {
      name: "quickaccesstv-boot",
      description: "Arranca el servicio de QuickAccess TV",
      type: {foreground: true, persist: true},
      schedule: {interval: "5m"},
      callback: callback
    }
  };
  Object.keys(activities).forEach(function (k) {
    service.call("luna://com.palm.activitymanager/create", {activity: activities[k], start: true, replace: true},
      function (m) { log("bootActivity", {kind: k, payload: m.payload}); });
  });
}

service.register("start", function (msg) {
  var p = msg.payload || {};
  if (p.report) report = p.report;
  if (typeof p.dryRun === "boolean") dryRun = p.dryRun;
  if (p.register) register = p.register;
  // Llamada desde una actividad: se marca como completada para que vuelva a armarse.
  if (p.$activity && p.$activity.activityId) {
    log("activityCall", {activityId: p.$activity.activityId, started: started});
    service.call("luna://com.palm.activitymanager/complete",
      {activityId: p.$activity.activityId, restart: true}, function () {});
  }
  if (!started && register) {
    started = true;
    log("start", {dryRun: dryRun, node: process.version, fromActivity: !!p.$activity});
    begin();
  }
  msg.respond({returnValue: true, started: started, dryRun: dryRun});
});

// Disparador de la actividad "boot": la suscripción del gestor de actividades arranca el servicio.
service.register("bootTrigger", function (msg) {
  var p = msg.payload || {};
  if (p.report) report = p.report;
  if (p.register) register = p.register;
  log("bootTrigger", {started: started});
  if (!started && register) {
    started = true;
    log("start", {dryRun: dryRun, node: process.version, fromBoot: true});
    begin();
  }
  msg.respond({returnValue: true, subscribed: true, fired: false});
}, function () {
  log("bootTrigger", {cancelled: true});
});

service.register("events", function (msg) {
  log("events", {subscription: !!msg.isSubscription});
  if (msg.isSubscription) listeners.push(msg);
  msg.respond({returnValue: true, subscribed: !!msg.isSubscription});
}, function (msg) {
  listeners = listeners.filter(function (m) { return m !== msg; });
});

service.register("status", function (msg) {
  msg.respond({returnValue: true, started: started, dryRun: dryRun, events: events});
});
