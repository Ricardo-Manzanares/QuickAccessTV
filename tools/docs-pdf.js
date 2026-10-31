// Une toda la documentación (.md) en un único PDF, en el orden del menú de la vista previa HTML.
// Monta una página temporal para imprimir y la convierte con un navegador Chromium sin ventana
// (Edge en Windows por defecto; BROWSER=/ruta/a/chrome para otro). Uso: npm run docs:pdf
const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");
const {ROOT, docs, titles, render, CSS} = require("./docs-preview");

const OUT = path.join(ROOT, "QuickAccessTV.pdf");
const TMP = path.join(ROOT, ".docs-print.html");
const BROWSER = process.env.BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const anchor = (md) => "doc-" + md.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

// Rutas relativas de cada documento -> relativas a la raíz; enlaces a otros .md -> anclas del propio PDF.
function rebase(md, html) {
  const dir = path.posix.dirname(md);
  return html
    .replace(/(src|href)="(?!https?:|mailto:|#|data:)([^"]+)"/g, (m, attr, url) => {
      const [p, hash] = url.split("#");
      const target = path.posix.normalize(path.posix.join(dir, p));
      if (/\.(md|html)$/i.test(p)) {
        const doc = docs.find((d) => d === target.replace(/\.html$/i, ".md") ||
          (target === "index.html" && d === "README.md"));
        return `${attr}="#${doc ? anchor(doc) : ""}${hash && !doc ? hash : ""}"`;
      }
      return `${attr}="${target}${hash ? "#" + hash : ""}"`;
    });
}

const toc = docs.map((d) => `<li><a href="#${anchor(d)}">${titles[d]}</a></li>`).join("\n");
const body = docs.map((d) =>
  `<section class="doc" id="${anchor(d)}">\n${rebase(d, render(d))}\n</section>`).join("\n");

const PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm; }
body { background: #fff; color: #17201f; }
.cover { text-align: center; padding-top: 40mm; page-break-after: always; }
.cover img { width: 70%; max-width: 520px; }
.cover h1 { font-size: 40px; margin: 24px 0 8px; }
.cover p { color: #5b6b69; font-size: 18px; }
.toc { page-break-after: always; }
.toc ol { font-size: 18px; line-height: 2; }
.doc { page-break-before: always; }
.doc h1 { border-bottom: 3px solid #0b8783; padding-bottom: .3em; }
article { border: 0; padding: 0; max-width: none; }
h2, h3 { page-break-after: avoid; }
table, pre, img { page-break-inside: avoid; }
pre, pre code { white-space: pre-wrap; word-break: break-word; }   /* en papel no hay scroll horizontal */
#doc-readme-md > p:first-child { display: none; }                  /* el banner ya está en la portada */
a { color: #0b8783; text-decoration: none; }`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>QuickAccess TV — Documentación</title>
<style>${CSS.replace("{FONT}", "web/fonts/Outfit.ttf")}${PRINT_CSS}</style></head>
<body><article>
<div class="cover"><img src="design/icon/banner.png" alt=""><h1>QuickAccess TV</h1>
<p>Documentación del proyecto</p></div>
<div class="toc"><h1>Índice</h1><ol>${toc}</ol></div>
${body}
</article></body></html>`;

fs.writeFileSync(TMP, html);
try {
  execFileSync(BROWSER, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files",
    "--no-pdf-header-footer", "--virtual-time-budget=5000", `--print-to-pdf=${OUT}`,
    "file:///" + TMP.split(path.sep).join("/")], {stdio: "ignore"});
} finally {
  if (!process.env.KEEP_HTML) fs.unlinkSync(TMP);   // KEEP_HTML=1: conservar la página para revisarla
}
console.log(path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + " MB");
