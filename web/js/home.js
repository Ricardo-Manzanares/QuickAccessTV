(function () {
  "use strict";

  var TOP = 0, DOCK = 1, GRID = 2;
  var KEY = {LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461};
  var LONG_PRESS_MS = 600;
  var DARK_CARD = "#1c1c1e";
  var FALLBACK_GLOW = "#8ea2c0";

  var FOLDER_COLOR = "#3a3a3c";

  // ---------------------------------------------------------------- geometry (px at 1920x1080)
  var C = CONFIG.columns;
  var W = 1920, H = 1080, MARGIN = 112, PAD = 36, GAP = 40;
  var tileW = Math.floor((W - 2 * MARGIN - 2 * PAD - (C - 1) * GAP) / C);
  var tileH = Math.round(tileW * 9 / 16);
  var bandH = tileH + 2 * PAD;
  var bandBottom = H - 60;
  var bandTop = bandBottom - bandH;
  var rowH = tileH + 100;
  var gridTop = bandBottom + 36;          // a sliver of the first grid row peeks under the dock
  var pageShift = bandTop - 52;           // Down lifts the page until the dock sits near the top
  var gridViewH = H - (gridTop - pageShift);
  var gridPadY = 24;

  function layout() {
    var vars = {
      "--columns": C, "--margin": MARGIN + "px", "--pad": PAD + "px", "--gap": GAP + "px",
      "--tile-w": tileW + "px", "--tile-h": tileH + "px", "--band-h": bandH + "px", "--band-top": bandTop + "px",
      "--row-h": rowH + "px", "--grid-top": gridTop + "px", "--page-shift": pageShift + "px",
      "--grid-view-h": gridViewH + "px",
      // El fondo 4K se difumina desde la mitad baja del dock hasta el borde inferior de la pantalla.
      "--bd-fade-start": (bandTop + Math.round(bandH * 0.55)) + "px", "--bd-fade-end": H + "px"
    };
    for (var k in vars) document.documentElement.style.setProperty(k, vars[k]);
    // Fondo: imagen > "background" de config > degradado gris por defecto (en el CSS).
    if (CONFIG.wallpaper) $("wallpaper").style.backgroundImage = "url('" + CONFIG.wallpaper + "')";
    else if (CONFIG.background) $("wallpaper").style.background = CONFIG.background;
  }

  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------- state
  var saved = store.getJson("focus", {});
  var state = {
    zone: saved.zone === GRID ? GRID : DOCK,
    top: 0,
    dock: saved.dock || 0,
    grid: saved.grid || 0,
    inGrid: false,
    moving: false,
    gridScroll: 0,
    loaded: false
  };
  var allApps = [], dockApps = [], gridItems = [];
  // Barra superior: cada "pill" visible con su acción. Se arma en start() según lo que ofrezca la plataforma.
  var topItems = [];

  function rememberFocus() {
    store.setJson("focus", {zone: state.zone === TOP ? DOCK : state.zone, dock: state.dock, grid: state.grid});
  }

  // ---------------------------------------------------------------- apps

  function normColor(c) {
    if (!c) return null;
    c = String(c).trim();
    if (c === "black") return "#000000";
    if (c === "white") return "#ffffff";
    if (/^[0-9a-f]{6}$/i.test(c)) c = "#" + c;
    return /^#[0-9a-f]{6}$/i.test(c) ? c : null;
  }

  function toApp(lp) {
    return {
      id: lp.id,
      title: lp.title,
      icon: lp.icon || lp.largeIcon,
      color: normColor(lp.color) || normColor(lp.iconColor) || normColor(lp.bgColor) || DARK_CARD,
      cover: !!lp.cover,     // true = la imagen rellena el tile (banners 16:9); false = icono centrado
      local: !!lp.local,
      glow: null
    };
  }

  function excluded() { return (CONFIG.exclude || []).concat(PLATFORM.defaultExclude || []); }

  function loadApps() {
    return PLATFORM.listApps().then(function (list) {
      var ex = excluded();
      applyApps(list.filter(function (lp) { return ex.indexOf(lp.id) < 0; }).map(toApp));
    });
  }

  // Un dock guardado vacío no es válido (siempre queda al menos una app): se trata como no guardado.
  function savedDock() {
    var d = store.getJson("dock", null);
    return d && d.length ? d : null;
  }

  function dockOrder() {
    return savedDock() || CONFIG.dock || PLATFORM.defaultDock || [];
  }
  // (CONFIG.dock es un override opcional; por defecto manda PLATFORM.defaultDock de cada tele.)

  function saveDockOrder() {
    store.setJson("dock", dockApps.map(function (a) { return a.id; }));
  }

  var appsSignature = "";

  function applyApps(list) {
    // Coming back from another app reloads the list; if nothing changed, keep the tiles (and their icons) as they are.
    var sig = list.map(function (a) { return a.id + "|" + a.icon; }).join(",");
    if (sig === appsSignature && state.loaded) return;
    appsSignature = sig;
    if (state.moving) endMove();
    allApps = list;
    dockApps = [];
    dockOrder().forEach(function (id) {
      if (dockApps.length >= C) return;
      var a = find(id);
      if (a) dockApps.push(a);
    });
    // Primer arranque sin dock guardado y sin coincidencias: rellena con las primeras apps.
    if (!dockApps.length && !savedDock()) {
      dockApps = allApps.slice(0, C);
      saveDockOrder();
    }
    refreshTiles();
    state.loaded = true;
    restoreFocus();
  }

  function find(id) {
    for (var i = 0; i < allApps.length; i++) if (allApps[i].id === id) return allApps[i];
    return null;
  }

  function hiddenIds() { return store.getJson("hidden", []); }

  /** Rebuild the dock and the grid (every app not in the dock and not hidden, in the TV's own order). */
  // El orden del grid (apps y carpetas) que el usuario fija con "Mover"; las novedades van al final.
  function saveGridOrder() { store.setJson("gridOrder", gridItems.map(function (it) { return it.id; })); }
  function applyGridOrder(items) {
    var order = store.getJson("gridOrder", null);
    if (!order) return items;
    var pos = {};
    order.forEach(function (k, i) { pos[k] = i; });
    return items.slice().sort(function (a, b) {
      var pa = pos[a.id], pb = pos[b.id];
      if (pa == null && pb == null) return 0;   // ambos nuevos: mantienen su orden (sort estable)
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pa - pb;
    });
  }

  function refreshTiles() {
    var hidden = hiddenIds();
    var folders = loadFolders();
    var inFolder = {};
    folders.forEach(function (f) { f.apps.forEach(function (a) { inFolder[a.id] = true; }); });
    var apps = allApps.filter(function (a) {
      return dockApps.indexOf(a) < 0 && hidden.indexOf(a.id) < 0 && !inFolder[a.id];
    });
    gridItems = applyGridOrder(folders.concat(apps));
    var dock = $("dock");
    dock.innerHTML = "";
    dockApps.forEach(function (a, i) { dock.appendChild(tileEl(a, DOCK, i)); });
    renderGrid();
  }

  function renderGrid() {
    var grid = $("grid");
    grid.innerHTML = "";
    gridItems.forEach(function (it, i) { grid.appendChild(tileEl(it, GRID, i)); });
    kickIcons();
  }

  function tileEl(item, zone, index) {
    var t = document.createElement("div");
    t.className = "tile";
    var card = document.createElement("div");
    card.className = "card";
    if (item.isFolder) {
      card.className = "card folder-card";
      card.appendChild(folderPreview(item));
    } else {
      card.style.backgroundColor = item.color;
      card.appendChild(iconImg(item));
    }
    t.appendChild(card);
    if (zone === GRID) {
      var label = document.createElement("div");
      label.className = "label";
      label.textContent = item.title;
      t.appendChild(label);
    }
    // Magic Remote pointer: hovering focuses, clicking opens.
    t.addEventListener("mouseenter", function () {
      if (state.moving || menu.open || folder.open) return;
      if (zone === DOCK) focusDock(index); else focusGrid(index);
    });
    t.addEventListener("click", function () {
      if (state.moving || menu.open || folder.open) return;
      if (item.isFolder) folder.show(item); else launch(item);
    });
    return t;
  }

  // Mini 3x3 preview of a folder's first apps, shown inside the folder tile.
  function folderPreview(f) {
    var m = document.createElement("div");
    m.className = "folder-mini";
    f.apps.slice(0, 9).forEach(function (a) {
      var cell = document.createElement("div");
      cell.className = "fm-cell";
      cell.style.backgroundColor = a.color;
      var img = makeIcon(a);
      img.className = "";       // sized by CSS (.folder-card .fm-cell img), not the .local rule
      cell.appendChild(img);
      m.appendChild(cell);
    });
    return m;
  }

  // Build an <img> for an app's icon, retrying on failure.
  // Local icons (e.g. the Live TV SVG under file://) break if a "?r=" query is appended, so retry the plain path.
  function makeIcon(app) {
    var img = document.createElement("img");
    var tries = 0;
    img.alt = "";
    img.setAttribute("data-title", app.title);
    if (app.cover) img.className = "cover";
    else if (app.local) img.className = "local";
    img.onerror = function () {
      if (++tries > 5) return;
      setTimeout(function () {
        img.src = app.local ? app.icon : app.icon + (app.icon.indexOf("?") < 0 ? "?" : "&") + "r=" + tries;
      }, 500 * tries);
    };
    img.src = app.icon;
    return img;
  }

  // One cached <img> per app for the dock and top-level grid (fetched from the TV only once).
  var iconCache = {};
  function iconImg(app) {
    var key = app.id + "|" + app.icon;
    if (!iconCache[key]) iconCache[key] = makeIcon(app);
    return iconCache[key];
  }

  // Reload any icon that ended up blank. The TV's icon server (127.0.0.1:3000) often isn't ready
  // for a moment right after returning from another app (e.g. opening the app with the number shortcut),
  // so a single pass isn't enough: kickIcons() does several staggered passes. A blank <img> is
  // complete but has naturalWidth 0; local SVGs reload by plain path, remote icons with a cache-buster.
  function ensureIcons() {
    var imgs = document.querySelectorAll("#dock img, #grid img, #folder-grid img"), broken = 0;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.complete && im.naturalWidth === 0) {
        broken++;
        var base = im.src.split("?")[0];
        im.src = "";
        im.src = base.indexOf("file:") === 0 ? base : base + "?rk=" + Date.now();
      }
    }
    return broken;
  }

  // On webOS the icon URLs expire when another client pairs with the TV (the LG phone app, or the
  // watchdog service): if icons are still blank after the retries, fetch the app list again for fresh URLs.
  var lastIconRefresh = 0;
  function lastIconPass() {
    if (ensureIcons() > 0 && Date.now() - lastIconRefresh > 15000) {
      lastIconRefresh = Date.now();
      appsSignature = "";     // rebuild the tiles even if the TV returns the same URLs
      iconCache = {};
      loadApps();
    }
  }

  var iconKicks = [];
  function kickIcons() {
    iconKicks.forEach(clearTimeout);
    iconKicks = [200, 700, 1500, 2800, 4500].map(function (ms) { return setTimeout(ensureIcons, ms); });
    iconKicks.push(setTimeout(lastIconPass, 7000));
  }

  function launch(app) {
    PLATFORM.launch(app.id).then(function (r) {
      if (r && r.ok === false) toast("No se puede abrir " + app.title);
    });
  }

  // ---------------------------------------------------------------- glow colour

  /** Most vivid pixel of the icon; needs the TV to allow reading its icons, else falls back to the tile colour. */
  function glowColor(app) {
    if (app.glow) return Promise.resolve(app.glow);
    return new Promise(function (resolve) {
      var fallback = function () {
        var c = app.color;
        var rgb = hexToRgb(c), l = (rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11) / 255;
        app.glow = l < 0.12 || l > 0.9 ? FALLBACK_GLOW : c;
        resolve(app.glow);
      };
      if (app.local) return fallback();
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          var cv = document.createElement("canvas");
          cv.width = 24; cv.height = 24;
          var ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, 24, 24);
          var d = ctx.getImageData(0, 0, 24, 24).data;
          var best = 0, pick = null;
          for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            var max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
            var sat = max === 0 ? 0 : (max - min) / max, score = sat * (max / 255);
            if (score > best) { best = score; pick = [d[i], d[i + 1], d[i + 2]]; }
          }
          if (!pick || best < 0.18) return fallback();
          // full brightness, saturation capped
          var m = Math.max(pick[0], pick[1], pick[2]) || 1;
          app.glow = "rgb(" + pick.map(function (v) { return Math.round(v * 255 / m); }).join(",") + ")";
          resolve(app.glow);
        } catch (e) {
          fallback();
        }
      };
      img.onerror = fallback;
      img.src = app.icon;
    });
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function withAlpha(color, a) {
    var rgb = color.charAt(0) === "#" ? hexToRgb(color) : color.match(/\d+/g).map(Number);
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
  }

  var glowFront = "a", glowShown = null;
  function showGlow(color) {
    if (color === glowShown) return;
    glowShown = color;
    var next = glowFront === "a" ? "b" : "a";
    var el = $("glow-" + next);
    el.style.background = "radial-gradient(closest-side, " + withAlpha(color, 0.34) + " 0%, " +
      withAlpha(color, 0.1) + " 55%, " + withAlpha(color, 0) + " 100%)";
    el.classList.add("on");
    $("glow-" + glowFront).classList.remove("on");
    glowFront = next;
  }

  // ---------------------------------------------------------------- focus

  function focusedEl() {
    if (state.zone === TOP) return topItems[state.top] && topItems[state.top].el;
    var t = state.zone === DOCK ? $("dock").children[state.dock] : $("grid").children[state.grid];
    return t ? t.firstChild : null;
  }

  function setFocusClass() {
    var els = document.querySelectorAll(".focused");
    for (var i = 0; i < els.length; i++) els[i].classList.remove("focused");
    var el = focusedEl();
    if (!el) return;
    (state.zone === TOP ? el : el.parentNode).classList.add("focused");
    glass.kick();
  }

  function setInGrid(v) {
    if (state.inGrid === v) return;
    state.inGrid = v;
    $("page").classList.toggle("in-grid", v);
    backdrop.refresh();
  }

  function focusTop(i) {
    state.zone = TOP;
    state.top = i;
    setInGrid(false);
    setFocusClass();
  }

  function focusDock(i) {
    if (!dockApps.length) return;
    state.zone = DOCK;
    state.dock = Math.max(0, Math.min(i, dockApps.length - 1));
    setInGrid(false);
    scrollGrid(0);
    setFocusClass();
    showTitle(dockApps[state.dock]);
  }

  function focusGrid(i) {
    if (!gridItems.length) return;
    state.zone = GRID;
    state.grid = Math.max(0, Math.min(i, gridItems.length - 1));
    setInGrid(true);
    var rowTop = Math.floor(state.grid / C) * rowH;
    var viewport = gridViewH - 2 * gridPadY;
    if (rowTop < state.gridScroll) scrollGrid(rowTop);
    else if (rowTop + rowH > state.gridScroll + viewport) scrollGrid(rowTop + rowH - viewport);
    setFocusClass();
  }

  function scrollGrid(y) {
    if (state.gridScroll === y) return;
    state.gridScroll = y;
    $("grid").style.transform = "translateY(" + (-y) + "px)";
    glass.kick();
  }

  function showTitle(app) {
    var title = $("title");
    var text = state.moving ? "‹  " + app.title + "  ›" : app.title;
    if (title.textContent !== text) {
      var fresh = title.textContent.replace(/[‹›]/g, "").trim() !== app.title;
      title.textContent = text;
      if (fresh) {
        title.classList.add("enter");
        void title.offsetWidth;
        title.classList.remove("enter");
      }
    }
    glowColor(app).then(function (c) { if (dockApps[state.dock] === app) showGlow(c); });
  }

  function restoreFocus() {
    if (!state.loaded) return;
    if (!dockApps.length && gridItems.length) { focusGrid(Math.min(state.grid, gridItems.length - 1)); return; }
    if (state.zone === GRID && state.grid < gridItems.length) focusGrid(state.grid);
    else if (state.zone === TOP) focusTop(state.top);
    else focusDock(state.dock);
  }

  function move(dRow, dCol) {
    var dockCount = dockApps.length, gridCount = gridItems.length;
    if (state.zone === TOP) {
      if (dRow === 0) focusTop(Math.max(0, Math.min(topItems.length - 1, state.top + dCol)));
      else if (dRow > 0 && dockCount) focusDock(state.dock);
    } else if (state.zone === DOCK) {
      if (dRow === 0) focusDock(state.dock + dCol);
      else if (dRow < 0) focusTop(state.top);
      else if (gridCount) focusGrid(Math.min(state.dock, gridCount - 1));
    } else {
      var col = state.grid % C, row = Math.floor(state.grid / C);
      if (dRow === 0) {
        var c = col + dCol;
        if (c >= 0 && c < C && state.grid + dCol < gridCount) focusGrid(state.grid + dCol);
      } else if (dRow < 0) {
        if (row === 0) focusDock(Math.min(col, dockCount - 1));
        else focusGrid(state.grid - C);
      } else {
        var below = state.grid + C;
        if (below < gridCount) focusGrid(below);
        else if ((row + 1) * C < gridCount) focusGrid(gridCount - 1);
      }
    }
    rememberFocus();
  }

  function activate() {
    if (state.zone === TOP) {
      if (topItems[state.top]) topItems[state.top].action();
    } else if (state.zone === DOCK) {
      launch(dockApps[state.dock]);
    } else {
      var it = gridItems[state.grid];
      if (it && it.isFolder) folder.show(it);
      else if (it) launch(it);
    }
  }

  // ---------------------------------------------------------------- the glass highlight (spring)

  var glass = (function () {
    var el = $("glass");
    var K = 420, D = 2 * Math.sqrt(420) * 0.68;
    var pos = [0, 0, 0, 0], vel = [0, 0, 0, 0], placed = false, raf = 0, last = 0, until = 0;

    function target() {
      var f = focusedEl();
      if (!f) return null;
      var r = f.getBoundingClientRect();
      var pad = r.height > 120 ? 14 : 8;
      return [r.left - pad, r.top - pad, r.right + pad, r.bottom + pad];
    }

    function step(now) {
      raf = 0;
      var t = target();
      if (!t) { el.style.opacity = 0; return; }
      el.style.opacity = 1;
      if (!placed) { pos = t.slice(); placed = true; }
      var dt = last ? Math.min((now - last) / 1000, 0.033) : 0.016;
      last = now;
      var moving = false;
      for (var i = 0; i < 4; i++) {
        var a = K * (t[i] - pos[i]) - D * vel[i];
        vel[i] += a * dt;
        pos[i] += vel[i] * dt;
        if (Math.abs(t[i] - pos[i]) > 0.5 || Math.abs(vel[i]) > 4) moving = true;
        else { pos[i] = t[i]; vel[i] = 0; }
      }
      var w = pos[2] - pos[0], h = pos[3] - pos[1];
      el.style.transform = "translate(" + pos[0] + "px," + pos[1] + "px)";
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.borderRadius = (h < 140 ? h / 2 : 32) + "px";
      if (moving || now < until) raf = requestAnimationFrame(step);
      else last = 0;
    }

    return {
      /** Follow the focused element for a while (it may be sliding or scaling). */
      kick: function (ms) {
        until = Math.max(until, performance.now() + (ms || 650));
        if (!raf) raf = requestAnimationFrame(step);
      },
      emphasis: function (on) { el.classList.toggle("emphasis", on); }
    };
  })();

  // ---------------------------------------------------------------- menus

  var menu = {
    open: false, items: [], index: 0,
    show: function (anchor, items) {
      var box = $("menu");
      box.innerHTML = "";
      this.items = items;
      this.index = 0;
      items.forEach(function (it, i) {
        var row = document.createElement("div");
        row.className = "menu-item";
        row.textContent = it.label;
        row.addEventListener("mouseenter", function () { menu.focus(i); });
        row.addEventListener("click", function () { menu.pick(i); });
        box.appendChild(row);
      });
      box.classList.remove("hidden");
      var a = anchor.getBoundingClientRect();
      var w = box.offsetWidth, h = box.offsetHeight;
      var left = Math.min(Math.max(a.left, 40), W - w - 40);
      if (anchor.classList.contains("pill")) left = Math.min(a.right - w, W - w - 40);
      var top = a.bottom + 20 + h > H - 20 ? a.top - 20 - h : a.bottom + 20;
      top = Math.max(20, Math.min(top, H - h - 20));   // nunca se sale por arriba ni por abajo
      box.style.left = left + "px";
      box.style.top = top + "px";
      this.open = true;
      this.focus(0);
    },
    focus: function (i) {
      var rows = $("menu").children;
      this.index = Math.max(0, Math.min(i, rows.length - 1));
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("focused", k === this.index);
    },
    pick: function (i) {
      var it = this.items[i];
      this.close();
      if (it) it.action();
    },
    close: function () {
      $("menu").classList.add("hidden");
      this.open = false;
    },
    key: function (code) {
      if (code === KEY.UP) this.focus(this.index - 1);
      else if (code === KEY.DOWN) this.focus(this.index + 1);
      else if (code === KEY.OK) this.pick(this.index);
      else if (code === KEY.BACK || code === KEY.LEFT || code === KEY.RIGHT) this.close();
    }
  };

  function openInputs() {
    PLATFORM.inputs().then(function (items) {
      menu.show($("pill-inputs"), (items || []).map(function (d) {
        return {label: d.label, action: function () { launch({id: d.id, title: d.label}); }};
      }));
    });
  }

  function openNetwork() {
    if (PLATFORM.openNetworkSettings) PLATFORM.openNetworkSettings();
  }

  function openSettingsMenu() {
    var items = [{label: "Ajustes de la TV", action: function () { PLATFORM.openSettings(); }}];
    var hidden = hiddenIds();
    if (hidden.length) {
      items.push({label: "Mostrar apps ocultas (" + hidden.length + ")", action: function () {
        store.setJson("hidden", []);
        refreshTiles();
        restoreFocus();
      }});
    }
    items.push({label: "Novedades  ·  v" + (window.APP_VERSION || "?"), action: function () { about.show(); }});
    menu.show($("pill-settings"), items);
  }

  // Acerca de / novedades (versión + cambios recientes).
  var about = {
    open: false,
    show: function () {
      $("about-ver").textContent = "v" + (window.APP_VERSION || "?");
      $("about-body").innerHTML = (window.CHANGELOG || []).map(function (c) {
        var lis = c.items.map(function (it) { return "<li>" + it + "</li>"; }).join("");
        return '<div class="cl-ver">v' + c.v + "</div><ul>" + lis + "</ul>";
      }).join("");
      $("about").classList.remove("hidden");
      this.open = true;
      backdrop.refresh();
    },
    close: function () {
      $("about").classList.add("hidden");
      this.open = false;
      backdrop.refresh();
    }
  };

  function tileMenu() {
    if (state.zone === DOCK) {
      var app = dockApps[state.dock], items = [{label: "Mover", action: startMove}];
      if (dockApps.length > 1) items.push({label: "Quitar de la barra", action: function () { removeFromDock(app); }});
      menu.show(focusedEl(), items);
    } else if (state.zone === GRID) {
      var it = gridItems[state.grid];
      if (!it) return;
      if (it.isFolder) { folderMenuFor(it); return; }
      var g = it;
      var add = dockApps.length < C
        ? {label: "Añadir a la barra", action: function () { addToDock(g, null); }}
        : {label: "Añadir a la barra (sustituye a " + dockApps[dockApps.length - 1].title + ")",
           action: function () { addToDock(g, dockApps[dockApps.length - 1]); }};
      menu.show(focusedEl(), [
        add,
        {label: "Mover (reordenar)", action: startMove},
        {label: "Mover a carpeta", action: function () { moveToFolderMenu(g); }},
        {label: "Ocultar", action: function () { hideApp(g); }},
        {label: "Desinstalar", action: function () { confirmUninstall(g); }}
      ]);
    }
  }

  // ---------------------------------------------------------------- arranging the dock

  function addToDock(app, replaced) {
    if (replaced) dockApps.splice(dockApps.indexOf(replaced), 1);
    dockApps.push(app);
    saveDockOrder();
    refreshTiles();
    focusDock(dockApps.length - 1);
    startMove();
  }

  function removeFromDock(app) {
    dockApps.splice(dockApps.indexOf(app), 1);
    saveDockOrder();
    refreshTiles();
    focusDock(Math.min(state.dock, dockApps.length - 1));
  }

  function hideApp(app) {
    var hidden = hiddenIds();
    hidden.push(app.id);
    store.setJson("hidden", hidden);
    refreshTiles();
    if (gridItems.length) focusGrid(Math.min(state.grid, gridItems.length - 1));
    else focusDock(state.dock);
    toast(app.title + " oculta. Para recuperarla: Ajustes (⚙) → Mostrar apps ocultas");
  }

  function confirmUninstall(app) {
    if (!PLATFORM.uninstall) { toast("Desinstalar no está disponible en esta tele"); return; }
    menu.show(focusedEl(), [
      {label: "Desinstalar «" + app.title + "»", action: function () { doUninstall(app); }},
      {label: "Cancelar", action: function () {}}
    ]);
  }

  function doUninstall(app) {
    PLATFORM.uninstall(app.id).then(function (r) {
      if (r && r.ok === false) { toast("No se pudo desinstalar " + app.title); return; }
      toast("Desinstalando " + app.title + "…");
      // Refresca la lista cuando la desinstalación termine (confirma el sistema / tarda un momento).
      setTimeout(function () { loadApps(); }, 2000);
    });
  }

  function startMove() {
    if (state.zone === DOCK && dockApps.length) { state.moving = true; glass.emphasis(true); focusDock(state.dock); }
    else if (state.zone === GRID && gridItems.length) { state.moving = true; glass.emphasis(true); focusGrid(state.grid); }
  }

  // Reordenar en el dock (solo horizontal).
  function moveBy(delta) {
    var to = state.dock + delta;
    if (to < 0 || to >= dockApps.length) return;
    var a = dockApps[state.dock];
    dockApps[state.dock] = dockApps[to];
    dockApps[to] = a;
    refreshTiles();
    focusDock(to);
  }

  // Reordenar en el grid (2D): izquierda/derecha ±1, arriba/abajo ±columnas.
  function gridMoveBy(dRow, dCol) {
    var from = state.grid, to = dCol ? from + dCol : from + dRow * C;
    if (to < 0 || to >= gridItems.length) return;
    var a = gridItems[from];
    gridItems[from] = gridItems[to];
    gridItems[to] = a;
    renderGrid();
    saveGridOrder();
    focusGrid(to);
  }

  function endMove() {
    state.moving = false;
    glass.emphasis(false);
    if (state.zone === GRID) saveGridOrder();
    else { saveDockOrder(); if (dockApps[state.dock]) showTitle(dockApps[state.dock]); }
    rememberFocus();
  }

  // ---------------------------------------------------------------- carpetas

  function getFolders() { return store.getJson("folders", []); }   // [{id, name, apps:[appId,...]}]
  function saveFolders(list) { store.setJson("folders", list); }

  // Carpetas con sus apps resueltas a objetos; descarta apps no instaladas y carpetas vacías.
  function loadFolders() {
    return getFolders().map(function (f) {
      var apps = (f.apps || []).map(find).filter(Boolean);
      return {isFolder: true, fid: f.id, id: "folder:" + f.id, title: f.name, color: FOLDER_COLOR, local: true, apps: apps};
    }).filter(function (f) { return f.apps.length > 0; });
  }

  function focusFolder(fid) {
    for (var i = 0; i < gridItems.length; i++) {
      if (gridItems[i].isFolder && gridItems[i].fid === fid) { focusGrid(i); return; }
    }
    if (gridItems.length) focusGrid(Math.min(state.grid, gridItems.length - 1));
    else focusDock(state.dock);
  }

  function dropFromFolders(folders, appId) {
    folders.forEach(function (f) { f.apps = f.apps.filter(function (id) { return id !== appId; }); });
  }

  function createFolder(app, name) {
    var folders = getFolders();
    dropFromFolders(folders, app.id);
    var id = String(Date.now());
    folders.push({id: id, name: name, apps: [app.id]});
    saveFolders(folders.filter(function (f) { return f.apps.length; }));
    refreshTiles();
    focusFolder(id);
    toast("Carpeta «" + name + "» creada. Mantén OK en una app para añadirla.");
  }

  function addAppToFolder(app, fid) {
    var folders = getFolders();
    dropFromFolders(folders, app.id);
    for (var i = 0; i < folders.length; i++) if (folders[i].id === fid) folders[i].apps.push(app.id);
    saveFolders(folders.filter(function (f) { return f.apps.length; }));
    refreshTiles();
    focusFolder(fid);
  }

  function removeFromFolder(app, fid) {
    var folders = getFolders();
    folders.forEach(function (f) { if (f.id === fid) f.apps = f.apps.filter(function (id) { return id !== app.id; }); });
    saveFolders(folders.filter(function (f) { return f.apps.length; }));
    refreshTiles();
    var still = loadFolders().filter(function (f) { return f.fid === fid; })[0];
    if (folder.open) { if (still) folder.show(still); else folder.close(); }
  }

  function dissolveFolder(f) {
    saveFolders(getFolders().filter(function (x) { return x.id !== f.fid; }));
    refreshTiles();
    if (gridItems.length) focusGrid(Math.min(state.grid, gridItems.length - 1));
    else focusDock(state.dock);
    toast("Carpeta deshecha; las apps vuelven a la rejilla.");
  }

  function renameFolder(f, name) {
    var folders = getFolders();
    for (var i = 0; i < folders.length; i++) if (folders[i].id === f.fid) folders[i].name = name;
    saveFolders(folders);
    refreshTiles();
    focusFolder(f.fid);
  }

  // Menús sin teclado: elegir carpeta destino o nombre de una lista.
  function moveToFolderMenu(app) {
    var items = getFolders().map(function (f) {
      return {label: "→  " + f.name, action: function () { addAppToFolder(app, f.id); }};
    });
    items.push({label: "＋  Nueva carpeta…", action: function () { newFolderMenu(app); }});
    menu.show(focusedEl(), items);
  }

  function newFolderMenu(app) {
    nameDialog.show("Nueva carpeta", "", function (name) { createFolder(app, name); });
  }

  function folderMenuFor(f) {
    menu.show(focusedEl(), [
      {label: "Abrir", action: function () { folder.show(f); }},
      {label: "Mover (reordenar)", action: startMove},
      {label: "Renombrar", action: function () { renameFolderMenu(f); }},
      {label: "Deshacer carpeta", action: function () { dissolveFolder(f); }}
    ]);
  }

  function renameFolderMenu(f) {
    nameDialog.show("Renombrar carpeta", f.title, function (name) { renameFolder(f, name); });
  }

  // Diálogo de texto libre con el teclado en pantalla de webOS (aparece al enfocar el <input>).
  var nameDialog = {
    open: false, cb: null,
    show: function (title, initial, cb) {
      this.cb = cb;
      $("nd-title").textContent = title;
      var inp = $("nd-input");
      inp.value = initial || "";
      $("namedialog").classList.remove("hidden");
      this.open = true;
      setTimeout(function () {
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
      }, 60);
    },
    confirm: function () {
      var v = $("nd-input").value.replace(/\s+/g, " ").trim();
      if (!v) return;                 // nombre vacío: no hace nada
      var cb = this.cb;
      this.close();
      if (cb) cb(v);
    },
    close: function () {
      $("namedialog").classList.add("hidden");
      this.open = false;
      this.cb = null;
      try { $("nd-input").blur(); } catch (e) {}
    }
  };

  // Tile de app dentro del overlay de carpeta (iconos frescos, no los del caché del dock/rejilla).
  function folderTile(app, i) {
    var t = document.createElement("div");
    t.className = "tile ftile";
    var card = document.createElement("div");
    card.className = "card";
    card.style.backgroundColor = app.color;
    card.appendChild(makeIcon(app));
    t.appendChild(card);
    var label = document.createElement("div");
    label.className = "label";
    label.textContent = app.title;
    t.appendChild(label);
    t.addEventListener("mouseenter", function () { if (!menu.open) folder.focus(i); });
    t.addEventListener("click", function () { if (!menu.open) launch(app); });
    return t;
  }

  var folder = {
    open: false, fid: null, items: [], index: 0, cols: 1,
    show: function (f) {
      this.fid = f.fid;
      this.items = f.apps.slice();
      this.cols = Math.min(this.items.length, C) || 1;
      var grid = $("folder-grid");
      grid.style.gridTemplateColumns = "repeat(" + this.cols + ", var(--tile-w))";
      grid.innerHTML = "";
      this.items.forEach(function (a, i) { grid.appendChild(folderTile(a, i)); });
      $("folder-name").textContent = f.title;
      $("folderview").classList.remove("hidden");
      this.open = true;
      backdrop.refresh();
      this.focus(0);
      kickIcons();
    },
    focus: function (i) {
      this.index = Math.max(0, Math.min(i, this.items.length - 1));
      var rows = $("folder-grid").children;
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("focused", k === this.index);
    },
    move: function (dRow, dCol) {
      var n = this.items.length, c = this.cols, col = this.index % c;
      if (dRow === 0) { var nc = col + dCol; if (nc >= 0 && nc < c && this.index + dCol < n) this.focus(this.index + dCol); }
      else if (dRow < 0) { if (this.index - c >= 0) this.focus(this.index - c); }
      else { if (this.index + c < n) this.focus(this.index + c); }
    },
    activate: function () { var a = this.items[this.index]; if (a) launch(a); },
    longPress: function () {
      var a = this.items[this.index], fid = this.fid;
      if (!a) return;
      menu.show($("folder-grid").children[this.index], [
        {label: "Abrir", action: function () { launch(a); }},
        {label: "Sacar de la carpeta", action: function () { removeFromFolder(a, fid); }}
      ]);
    },
    close: function () {
      $("folderview").classList.add("hidden");
      this.open = false;
      backdrop.refresh();
      if (gridItems.length) focusGrid(Math.min(state.grid, gridItems.length - 1));
    },
    key: function (code) {
      if (code === KEY.LEFT) { this.move(0, -1); return true; }
      if (code === KEY.RIGHT) { this.move(0, 1); return true; }
      if (code === KEY.UP) { this.move(-1, 0); return true; }
      if (code === KEY.DOWN) { this.move(1, 0); return true; }
      if (code === KEY.BACK) { this.close(); return true; }
      return false;
    }
  };

  // ---------------------------------------------------------------- keys

  var okDownAt = 0, okTimer = 0, okLong = false;

  function onKeyDown(code) {
    if (menu.open) { menu.key(code); return true; }
    if (folder.open) { return folder.key(code); }
    if (about.open) { if (code === KEY.BACK) about.close(); return true; }
    if (state.moving) {
      if (state.zone === GRID) {
        if (code === KEY.LEFT) gridMoveBy(0, -1);
        else if (code === KEY.RIGHT) gridMoveBy(0, 1);
        else if (code === KEY.UP) gridMoveBy(-1, 0);
        else if (code === KEY.DOWN) gridMoveBy(1, 0);
      } else {
        if (code === KEY.LEFT) moveBy(-1);
        else if (code === KEY.RIGHT) moveBy(1);
      }
      return code === KEY.LEFT || code === KEY.RIGHT || code === KEY.UP || code === KEY.DOWN ||
        code === KEY.OK || code === KEY.BACK;
    }
    if (!state.loaded) return false;
    switch (code) {
      case KEY.LEFT: move(0, -1); return true;
      case KEY.RIGHT: move(0, 1); return true;
      case KEY.UP: move(-1, 0); return true;
      case KEY.DOWN: move(1, 0); return true;
      case KEY.BACK:
        if (state.zone !== DOCK) focusDock(state.dock);
        return true;
      default: return false;
    }
  }

  document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    // Mientras se escribe el nombre, el teclado en pantalla gobierna; solo OK (guardar) y Atrás (cancelar).
    if (nameDialog.open) {
      if (code === KEY.OK) { e.preventDefault(); nameDialog.confirm(); }
      else if (code === KEY.BACK) { e.preventDefault(); nameDialog.close(); }
      return;
    }
    if (code === KEY.OK) {
      e.preventDefault();
      if (okDownAt) return;               // auto-repeat while held
      okDownAt = Date.now();
      okLong = false;
      if (!menu.open && !state.moving && !about.open) {
        var longAction = folder.open
          ? function () { folder.longPress(); }
          : (state.zone !== TOP ? tileMenu : null);
        if (longAction) okTimer = setTimeout(function () { okLong = true; longAction(); }, LONG_PRESS_MS);
      }
      return;
    }
    if (onKeyDown(code)) e.preventDefault();
  });

  document.addEventListener("keyup", function (e) {
    if (nameDialog.open) return;
    if (e.keyCode === KEY.BACK && state.moving) { endMove(); e.preventDefault(); return; }
    if (e.keyCode !== KEY.OK) return;
    e.preventDefault();
    clearTimeout(okTimer);
    var wasLong = okLong;
    okDownAt = 0;
    okLong = false;
    if (wasLong) return;                  // the long press already opened the menu
    if (about.open) return;               // solo se cierra con Atrás
    if (menu.open) menu.key(KEY.OK);
    else if (folder.open) folder.activate();
    else if (state.moving) endMove();
    else activate();
  });

  // ---------------------------------------------------------------- clock + network

  var DAYS_LOCALE = "es-ES";
  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    $("clock").textContent = ("0" + h).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    var d = now.toLocaleDateString(DAYS_LOCALE, {weekday: "long", day: "numeric", month: "long"});
    $("date").textContent = d.charAt(0).toUpperCase() + d.slice(1);
    $("greeting").textContent = h >= 6 && h < 13 ? "Buenos días" : h >= 13 && h < 21 ? "Buenas tardes" : "Buenas noches";
  }

  function scheduleClock() {
    updateClock();
    var now = new Date();
    setTimeout(scheduleClock, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50);
  }

  function watchNetwork() {
    PLATFORM.watchNetwork(function (n) {
      var wired = n.type === "wired";
      $("net-label").textContent = n.label || "Sin conexión";
      $("net-wired").classList.toggle("hidden", !wired);
      $("net-wifi").classList.toggle("hidden", wired);
    });
  }

  // ---------------------------------------------------------------- toast + SSAP status

  var toastTimer = 0;
  function toast(text, ms, small) {
    var t = $("toast");
    t.textContent = text;
    t.classList.toggle("hint", !!small);
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    if (ms !== 0) toastTimer = setTimeout(function () { t.classList.add("hidden"); }, ms || 4000);
  }

  var pairingToast = false;
  function onStatus(s) {
    if (s === "prompt") {
      pairingToast = true;
      toast("Acepta el aviso que ha aparecido en la tele para que QuickAccess TV pueda ver tus apps", 0);
    } else if (s === "ok" && pairingToast) {
      pairingToast = false;      // solo se quita el aviso de emparejamiento, no otros avisos en curso
      $("toast").classList.add("hidden");
    }
  }

  // La barra superior se arma según lo que ofrezca cada plataforma (entradas, red).
  function buildTop() {
    topItems = [];
    if (PLATFORM.inputs) topItems.push({el: $("pill-inputs"), action: openInputs});
    else $("pill-inputs").classList.add("hidden");
    if (PLATFORM.watchNetwork) { topItems.push({el: $("pill-net"), action: openNetwork}); watchNetwork(); }
    else $("pill-net").classList.add("hidden");
    topItems.push({el: $("pill-settings"), action: openSettingsMenu});
  }

  function start() {
    buildTop();
    loadApps().catch(function () {
      toast("No se pudo leer la lista de apps.", 0);
      applyApps([]);
    }).then(showUpdateNotice);
  }

  // Aviso tras actualizar, si la plataforma lo necesita (Fire TV: reiniciar para refrescar el icono).
  function showUpdateNotice() {
    var n = PLATFORM.updateNotice;
    if (!n) return;
    PLATFORM.updateNotice = null;
    toast(n.text, 20000);
    menu.show($("pill-settings"), [
      {label: n.action, action: function () { $("toast").classList.add("hidden"); n.run(); }},
      {label: "Más tarde", action: function () { $("toast").classList.add("hidden"); }}
    ]);
  }

  // Fondo 4K estilo Apple TV: solo con el dock en reposo; rota (crossfade) al volver a inicio y por tiempo.
  var backdrop = (function () {
    var el = $("backdrop"), a = $("bd-a"), b = $("bd-b"), front = a;
    var list = CONFIG.wallpapers || [], idx = -1, ready = false, timer = 0;

    function refresh() {
      el.classList.toggle("show", !!(ready && list.length && !state.inGrid && !folder.open));
    }
    function apply(url) {
      var back = front === a ? b : a;                // funde la nueva capa sobre la anterior
      back.style.backgroundImage = "url('" + url + "')";
      back.classList.add("front");
      front.classList.remove("front");
      front = back;
      ready = true;
      refresh();
    }
    function next() {
      if (!list.length) return;
      idx = (idx + 1) % list.length;
      var url = list[idx], pre = new Image();
      pre.onload = function () { apply(url); };
      pre.src = url;
    }
    function schedule() {
      if (timer) clearInterval(timer);
      var min = CONFIG.wallpaperIntervalMin;
      if (min > 0 && list.length > 1) timer = setInterval(next, min * 60000);
    }
    schedule();
    return {next: next, refresh: refresh};
  })();

  // ---------------------------------------------------------------- lifecycle

  layout();
  scheduleClock();
  backdrop.next();
  PLATFORM.onStatus = onStatus;
  PLATFORM.ready.then(start);

  // Volver de otra app: recolocar en el dock y refrescar la lista por si cambiaron las apps.
  function onReturn() {
    if (PLATFORM.activate) PLATFORM.activate();
    menu.close();
    if (folder.open) folder.close();
    if (state.moving) endMove();
    updateClock();
    backdrop.next();
    loadApps().then(function () { focusDock(state.dock); kickIcons(); });
  }

  // Devuelta por el servicio de vuelta automática: recuerda cómo llegar al menú del sistema mientras dura
  // la ventana en la que otra pulsación de Inicio lo deja pasar.
  PLATFORM.onWatchdogReturn = function () {
    if (PLATFORM.watchdogHint) toast(PLATFORM.watchdogHint, 5000, true);
  };
  document.addEventListener("webOSRelaunch", onReturn);     // webOS
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { updateClock(); glass.kick(); kickIcons(); if (state.loaded) loadApps(); }
  });

  // Botón ATRÁS (lo reenvía el shell Android; en webOS llega como tecla normal).
  function goBack() {
    if (about.open) { about.close(); return; }
    if (nameDialog.open) { nameDialog.close(); return; }
    if (menu.open) { menu.close(); return; }
    if (folder.open) { folder.close(); return; }
    if (state.moving) { endMove(); return; }
    if (state.zone !== DOCK) { focusDock(state.dock); return; }
    // Ya en el dock: no hacer nada (no salir del launcher en Android).
  }

  // Confirmar el nombre al pulsar Enter/Aceptar del teclado en pantalla (webOS y Android).
  (function () {
    var inp = $("nd-input");
    if (inp) inp.addEventListener("keydown", function (e) {
      if (e.keyCode === 13) { e.preventDefault(); nameDialog.confirm(); }
    });
  })();

  // For tools/debug and the Android shell: drive the UI without a remote.
  window.__home = {
    ssap: (PLATFORM.ssap || null),
    back: goBack,
    key: function (code) {
      if (code === KEY.OK) {
        if (menu.open) menu.key(KEY.OK);
        else if (state.moving) endMove();
        else activate();
      } else if (code === KEY.BACK) {
        goBack();
      } else {
        onKeyDown(code);
      }
    },
    longOk: tileMenu,
    state: state
  };
})();
