// Genera el icono y el banner de QuickAccess TV en SVG (fondo esmeralda, celdas de cromo plata, play grabado).
// Uso: node design/icon/icon.js   -> design/icon/icon.svg (esquinas redondeadas), icon-square.svg (webOS, sin fondo)
//                                    y design/icon/banner.svg (16:9)
// Los PNG de cada plataforma salen de estos SVG con design/icon/render.sh.
const fs = require("fs");
const path = require("path");

const BG = ["#00b894", "#0a5f86"];   // esmeralda -> petróleo
const PLAY = "#0b6b6e";              // tono oscuro del fondo, para el play grabado

function defs() {
  return "<defs>" +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BG[0]}"/><stop offset="1" stop-color="${BG[1]}"/></linearGradient>` +
    '<radialGradient id="hl" cx=".2" cy=".05" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    // cromo pulido: bandas claras y oscuras alternas, como un reflejo de estudio
    '<linearGradient id="cr" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="#d2d6db"/><stop offset=".4" stop-color="#f7f8f9"/>' +
      '<stop offset=".55" stop-color="#9ea4ab"/><stop offset=".72" stop-color="#e4e7ea"/><stop offset="1" stop-color="#979da4"/></linearGradient>' +
    '<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<filter id="lf" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="4.5" flood-color="#000" flood-opacity=".45"/></filter>' +
    "</defs>";
}

// Celda de cromo: relleno + brillo en la mitad superior + filo de luz interior.
function tile(x, y, w, h, op = 1) {
  const r = Math.min(w, h) * 0.24;
  return `<g filter="url(#lf)" opacity="${op}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#cr)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#sh)"/>` +
    `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="${r - 1.5}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.5"/></g>`;
}

// Play grabado: luz debajo + triángulo encima.
function play(cx, cy, s) {
  const a = s * 0.5, b = s * 0.42;
  const pts = (dy) => `${cx - b * 0.75},${cy - a + dy} ${cx - b * 0.75},${cy + a + dy} ${cx + b * 1.05},${cy + dy}`;
  return `<polygon points="${pts(1.6)}" fill="#fff" fill-opacity=".7"/><polygon points="${pts(0)}" fill="${PLAY}"/>`;
}

// Mosaico 2×2 en un lienzo de 256: la primera celda lleva el play, la última deja ver el fondo.
const mosaic = tile(54, 54, 68, 68) + play(88, 88, 32) + tile(134, 54, 68, 68) + tile(54, 134, 68, 68) + tile(134, 134, 68, 68, 0.5);

function background(w, h, rx) {
  return `<rect width="${w}" height="${h}" rx="${rx}" fill="url(#bg)"/>` +
    `<rect width="${w}" height="${h}" rx="${rx}" fill="url(#hl)"/>`;
}

const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">' +
  defs() + background(256, 256, 52) + mosaic + "</svg>\n";

// webOS pinta la ficha con "iconColor" (appinfo.json) y pone el icono encima, centrado y más pequeño:
// el icono va sin fondo, solo el mosaico, para que no quede un marco alrededor.
const iconSquare = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 40 176 176" width="256" height="256">' +
  defs() + mosaic + "</svg>\n";

const banner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">' +
  defs() + background(320, 180, 0) +
  `<svg x="10" y="26" width="128" height="128" viewBox="0 0 256 256">${mosaic}</svg>` +
  '<text x="146" y="86" fill="#fff" font-family="Outfit, Segoe UI, sans-serif" font-weight="700" font-size="25">QuickAccess</text>' +
  '<text x="146" y="122" fill="#fff" fill-opacity=".85" font-family="Outfit, Segoe UI, sans-serif" font-weight="800" font-size="30" letter-spacing="3">TV</text>' +
  "</svg>\n";

fs.writeFileSync(path.join(__dirname, "icon.svg"), icon);
fs.writeFileSync(path.join(__dirname, "icon-square.svg"), iconSquare);
fs.writeFileSync(path.join(__dirname, "banner.svg"), banner);
console.log("icon.svg, icon-square.svg, banner.svg");
