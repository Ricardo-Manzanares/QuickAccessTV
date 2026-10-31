"""Tiny receiver for the TV app's debug reports: POST /log (JSON) and POST /shot (PNG data URL).
Usage: python -I tools/receiver.py [port]   — files land in logs/ next to tools/."""
import base64, json, os, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logs")
os.makedirs(OUT, exist_ok=True)

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"ok")

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        stamp = time.strftime("%H%M%S")
        if self.path.startswith("/shot"):
            name = self.path.split("name=")[-1] if "name=" in self.path else stamp
            data = body.decode().split(",", 1)[-1]
            with open(os.path.join(OUT, f"{name}.png"), "wb") as f:
                f.write(base64.b64decode(data))
        else:
            with open(os.path.join(OUT, "log.jsonl"), "ab") as f:
                f.write(body + b"\n")
        print(stamp, self.path, len(body), flush=True)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b"ok")

    def log_message(self, *a):
        pass

HTTPServer(("0.0.0.0", int(sys.argv[1]) if len(sys.argv) > 1 else 8765), Handler).serve_forever()
