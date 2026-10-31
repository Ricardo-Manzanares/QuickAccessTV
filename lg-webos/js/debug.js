// Development only (CONFIG.debugReport = "" turns it off). Sends errors to the PC and, when launched with
//   ares-launch -d lgtv com.quickaccesstv.app -p '{"debug":{"keys":["DOWN","RIGHT"],"shot":"01-grid"}}'
// replays those remote keys and posts a screenshot of the page to tools/receiver.py (logs/<shot>.png).
(function () {
  if (!CONFIG.debugReport) return;
  var KEYS = {LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461};

  function post(path, body, type) {
    var x = new XMLHttpRequest();
    x.open("POST", CONFIG.debugReport + path);
    x.setRequestHeader("Content-Type", type || "application/json");
    x.send(body);
  }

  function log(name, data) {
    post("/log", JSON.stringify({t: Date.now(), name: name, data: data}));
  }

  window.onerror = function (msg, src, line, col) {
    log("error", {msg: String(msg), src: src, line: line, col: col});
  };

  function launchParams() {
    try { return JSON.parse((window.PalmSystem && PalmSystem.launchParams) || "{}"); } catch (e) { return {}; }
  }

  function withHtml2canvas(fn) {
    if (window.html2canvas) return fn();
    var s = document.createElement("script");
    s.src = "js/vendor/html2canvas.min.js";
    s.onload = fn;
    document.head.appendChild(s);
  }

  function run(p) {
    if (!p.debug) return;
    var steps = p.debug.keys || [], i = 0;
    (function next() {
      if (i < steps.length) {
        var k = steps[i++];
        if (k === "LONGOK") window.__home.longOk(); else window.__home.key(KEYS[k]);
        setTimeout(next, 500);
        return;
      }
      setTimeout(function () {
        log("state", JSON.parse(JSON.stringify(window.__home.state)));
        if (!p.debug.shot) return;
        withHtml2canvas(function () {
          window.html2canvas(document.body, {backgroundColor: "#000", scale: 0.5, useCORS: true, logging: false,
            width: 1920, height: 1080, windowWidth: 1920, windowHeight: 1080,
            // Any image (the TV's icons, and even our own under file://) taints the canvas:
            // show the app name in its place. Only affects the debug capture.
            onclone: function (doc) {
              var imgs = doc.querySelectorAll("img");
              for (var i = imgs.length - 1; i >= 0; i--) {
                var s = doc.createElement("div");
                s.textContent = imgs[i].getAttribute("data-title") || "?";
                s.style.cssText = "font-size:30px;color:#fff;opacity:.85;text-align:center;padding:0 12px";
                imgs[i].parentNode.replaceChild(s, imgs[i]);
              }
            }})
            .then(function (c) { post("/shot?name=" + p.debug.shot, c.toDataURL("image/png"), "text/plain"); })
            .catch(function (e) { log("shotError", String(e)); });
        });
      }, 1000);
    })();
  }

  // Heartbeat: shows whether webOS keeps running the app while another app is in front.
  setInterval(function () { log("beat", {hidden: document.hidden}); }, 5000);

  // Which app is in front, every time it changes (to study what happens when an app exits or Home is pressed).
  setTimeout(function () {
    window.__home.ssap.request("ssap://com.webos.applicationManager/getForegroundAppInfo", {}, function (p) {
      log("foreground", {appId: p.appId, hidden: document.hidden});
    });
  }, 2000);

  document.addEventListener("webOSRelaunch", function () { setTimeout(function () { run(launchParams()); }, 1500); });
  setTimeout(function () { run(launchParams()); }, 3000);
})();
