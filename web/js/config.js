// Ajustes de la pantalla de inicio. Tras cambiarlos: ./build-and-install.sh
var CONFIG = {
  // Huecos del dock = columnas de la rejilla (4–7 quedan bien).
  columns: 5,

  // Override opcional del dock por defecto (IDs de app, de izquierda a derecha). Normalmente null:
  // el dock por defecto de cada tele lo define su capa de plataforma (PLATFORM.defaultDock).
  // Lo que reordenes con el mando siempre tiene prioridad sobre esto.
  dock: null,

  // Apps que nunca se muestran (además de las que excluye cada plataforma).
  exclude: [],

  // Fondos 4K estilo Apple TV: se muestran SOLO con el dock en reposo y se difuminan hacia el gris
  // bajo el dock. Rotan al volver a la pantalla de inicio. Al entrar en la rejilla o abrir una carpeta
  // se ocultan y queda el gris. Pon tus propias imágenes en img/wallpapers/ y lístalas aquí. [] = ninguno.
  wallpapers: [
    "img/wallpapers/wp1.jpg",
    "img/wallpapers/wp2.jpg",
    "img/wallpapers/wp3.jpg",
    "img/wallpapers/wp4.jpg"
  ],

  // Cada cuántos minutos rota el fondo 4K (además de rotar al volver a la pantalla de inicio). 0 = no rotar por tiempo.
  wallpaperIntervalMin: 10,

  // Fondo base (detrás de todo y cuando se ve la rejilla/carpetas). Vacío = degradado gris de css/home.css.
  // Para un color o degradado propio: una cadena CSS, p. ej. "#101014" o "radial-gradient(...)".
  background: "",

  // Fondo de imagen opcional: copia la imagen a app/img/ y pon por ejemplo "img/fondo.jpg".
  // Si se define, tiene prioridad sobre "background". Vacío = sin imagen.
  wallpaper: "",

  // Solo para desarrollo: el PC que recibe registros y capturas (tools/receiver.py), p. ej. "http://<ip-del-pc>:8765".
  // "" lo desactiva.
  debugReport: ""
};

// localStorage puede fallar; nunca debe romper la pantalla.
var store = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  getJson: function (k, fallback) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } },
  setJson: function (k, v) { this.set(k, JSON.stringify(v)); }
};
