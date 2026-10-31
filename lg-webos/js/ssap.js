// Two ways of talking to the TV:
//  - luna(): the app's own service bridge. Allowed for third-party apps: launch, inputs (eim), network status.
//  - Ssap: the TV's second-screen API on ws://127.0.0.1:3000 (what LG's phone app uses). Needed for the
//    app list with icons, which luna denies. The first connection shows an "allow" prompt on the TV;
//    the client key is kept in localStorage afterwards.

var bridges = []; // keep subscription bridges alive

function luna(uri, params, onEach) {
  return new Promise(function (resolve) {
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var r = {};
        try { r = JSON.parse(msg); } catch (e) {}
        if (onEach) onEach(r);
        resolve(r);
      };
      b.call(uri, JSON.stringify(params || {}));
      if (onEach) bridges.push(b);
    } catch (e) {
      resolve({returnValue: false, errorText: String(e)});
    }
  });
}

function Ssap(onStatus) {
  this.onStatus = onStatus;
  this.ws = null;
  this.n = 0;
  this.pending = {};
  this.ready = null;
}

Ssap.prototype.connect = function () {
  var self = this;
  if (this.ready) return this.ready;
  this.ready = new Promise(function (resolve, reject) {
    var ws;
    try { ws = new WebSocket("ws://127.0.0.1:3000"); } catch (e) { self.ready = null; return reject(e); }
    self.ws = ws;
    ws.onopen = function () {
      var reg = JSON.parse(JSON.stringify(SSAP_REGISTER));
      var key = store.get("ssapKey");
      if (key) reg["client-key"] = key;
      ws.send(JSON.stringify({id: "register", type: "register", payload: reg}));
    };
    ws.onmessage = function (m) {
      var msg;
      try { msg = JSON.parse(m.data); } catch (e) { return; }
      if (msg.id === "register") {
        if (msg.type === "registered") {
          store.set("ssapKey", msg.payload["client-key"]);
          self.onStatus("ok");
          resolve(self);
        } else if (msg.payload && msg.payload.pairingType === "PROMPT") {
          self.onStatus("prompt");
        } else if (msg.type === "error") {
          self.onStatus("error", msg.error);
          reject(new Error(msg.error));
        }
        return;
      }
      var cb = self.pending[msg.id];
      if (!cb) return;
      if (!cb.sub) delete self.pending[msg.id];
      cb.fn(msg.payload || {});
    };
    ws.onclose = function () {
      self.ready = null;
      self.pending = {};
      self.onStatus("closed");
      reject(new Error("closed"));
    };
  });
  return this.ready;
};

/** One-shot request, or a subscription when onEach is given (called for every message). */
Ssap.prototype.request = function (uri, payload, onEach) {
  var self = this;
  return this.connect().then(function () {
    return new Promise(function (resolve) {
      var id = "q" + (++self.n);
      self.pending[id] = {sub: !!onEach, fn: function (p) { if (onEach) onEach(p); resolve(p); }};
      self.ws.send(JSON.stringify({id: id, type: onEach ? "subscribe" : "request", uri: uri, payload: payload || {}}));
    });
  });
};
