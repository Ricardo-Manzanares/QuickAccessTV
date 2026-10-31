// Captura real de la pantalla de la LG (no de la página): se empareja por SSAP como un mando de segunda
// pantalla, abre QuickAccess TV y pide a la tele una captura con ssap://tv/executeOneShot.
// La primera vez la tele muestra un aviso de emparejamiento que hay que aceptar con el mando; la clave se
// guarda en tools/.ssap-client-key para no volver a preguntar.
// Uso: node tools/capture.js <ip-de-la-tele> <salida.jpg> [appId]     (Node 22 o superior)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [ip, out, appId = "com.quickaccesstv.app"] = process.argv.slice(2);
if (!ip || !out) { console.error("uso: node tools/capture.js <ip-de-la-tele> <salida.jpg> [appId]"); process.exit(1); }

// La tele usa un certificado autofirmado en wss://<ip>:3001.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "ssap-manifest.js"), "utf8") + "\nthis.R = SSAP_REGISTER;", ctx);
const reg = ctx.R;
reg.manifest.permissions = Array.from(new Set([...(reg.manifest.permissions || []), "CAPTURE_TV_SCREEN"]));
const keyFile = path.join(__dirname, ".ssap-client-key");
try { reg["client-key"] = fs.readFileSync(keyFile, "utf8").trim(); } catch (e) {}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error("sin respuesta en " + url)); }, 6000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("no se pudo conectar a " + url)); };
  });
}

(async () => {
  let ws;
  try { ws = await open(`wss://${ip}:3001`); } catch (e) { ws = await open(`ws://${ip}:3000`); }

  let n = 0;
  const pending = {};
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending[msg.id]) pending[msg.id](msg);
  };
  function send(type, uri, payload, untilRegistered) {
    const id = "m" + (++n);
    return new Promise((resolve) => {
      pending[id] = (msg) => {
        if (untilRegistered && msg.type === "response") return;   // aviso mostrado: espera a que se acepte
        delete pending[id];
        resolve(msg);
      };
      ws.send(JSON.stringify(Object.assign({id, type}, uri ? {uri} : {}, {payload})));
    });
  }

  if (!reg["client-key"]) console.log("Acepta el aviso de emparejamiento en la tele...");
  const r = await send("register", null, reg, true);
  if (r.type !== "registered") throw new Error("emparejamiento rechazado: " + JSON.stringify(r.payload || r));
  fs.writeFileSync(keyFile, r.payload["client-key"]);

  await send("request", "ssap://system.launcher/launch", {id: appId});
  await new Promise((res) => setTimeout(res, 8000));      // que la app cargue sus iconos y el fondo

  const s = await send("request", "ssap://tv/executeOneShot", {});
  const uri = s.payload && s.payload.imageUri;
  if (!uri) throw new Error("la tele no devolvió captura: " + JSON.stringify(s.payload));
  const resp = await fetch(uri);
  fs.writeFileSync(out, Buffer.from(await resp.arrayBuffer()));
  console.log(out);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
