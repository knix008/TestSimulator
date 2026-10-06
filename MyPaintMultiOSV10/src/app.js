(function () {
  const BUILD = window.MYPAINT_BUILD;
  const metrics = window.MyPaintMetrics;
  const Paint = window.PaintEngine;
  const Formats = window.MyPaintFormats;
  const Dicom = window.DicomDecoder;
  const Fonts = window.MyPaintFonts;
  const Print = window.MyPaintPrint;
  const Themes = window.MyPaintThemes;
  const I18n = window.MyPaintI18n;
  const Icons = window.MyPaintIcons;
  const Store = window.MyPaintStore;
  const Sample = window.MyPaintSample;
  const TEST = new URLSearchParams(location.search).get("test") === "1";
  const GUIDE_URL = "https://localhost/mypaint/USERSGUIDE.md";

  let settings = Store.defaults();
  let docs = [];
  let active = 0;
  let selected = [];
  let nextName = 1;
  let undoStack = [];
  let redoStack = [];
  let clipboard = "";
  let lastError = "";
  let lastSaved = null;
  let lastExport = null;
  let lastDownload = null;
  let lastLink = "";
  let lastPrint = null;
  let progressMarks = [];
  let popupEl = null;
  let menuEl = null;
  let appClosed = false;
  let fontCatalog = Fonts.FALLBACK.slice();
  let pendingDrop = null;
  let bgObjectUrl = "";
  let settingsTab = "general";
  let printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
  let draft = null;
  let dragState = null;
  let pointer = { x: 0, y: 0 };
  let cineTimer = null;
  let tagPage = 0;
  let convertState = { format: "png", quality: 92 };
  let lastConvert = null;
  let lastProbe = null;
  let downloadWatcher = null;
  let progressDepth = 0;
  let downloadStop = null;
  let pendingClose = -1;
  let region = null;
  let regionDrag = false;   // the picked area is still being dragged out
  let lastSystemCopy = null;   // the picture last handed to the system clipboard
  let band = null;
  const images = {};
  const extras = new Map();

  const $ = (id) => document.getElementById(id);
  const t = (key) => I18n.translate(settings.language, key);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));

  function current() { return docs[active] || docs[0]; }

  function clamp(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function scale() { return settings.zoom / 100; }

  function idb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("mypaint", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPut(key, value) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function idbGet(key) {
    const db = await idb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  }

  async function idbDelete(key) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function saveSettings() {
    try { Store.save(localStorage, settings); }
    catch (error) { showError(error); }
  }

  function persistSession() {
    if (TEST || !settings.restoreSession) return;
    try {
      // pictures stay in the files they came from, so only drawings go into the session
      const keep = docs.filter((doc) => !extras.get(doc.id) || !extras.get(doc.id).source);
      if (keep.length) localStorage.setItem(Store.SESSION_KEY, Paint.serialize(keep));
      else localStorage.removeItem(Store.SESSION_KEY);
    } catch (error) { /* the drawing may be too large to keep */ }
  }

  function cssFamily(name) {
    const clean = String(name || "Segoe UI").replace(/["\\]/g, "");
    return '"' + clean + '", sans-serif';
  }

  function applyVisual() {
    const theme = Themes.byId(settings.theme, settings.custom);
    const root = document.documentElement;
    const doc = current();
    root.dataset.theme = theme.id;
    root.dataset.mode = theme.mode;
    root.style.colorScheme = theme.mode === "light" ? "light" : "dark";
    root.lang = settings.language === "en" ? "en" : "ko";
    Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.style.setProperty("--editor-font", cssFamily(settings.fontFamily));
    root.style.setProperty("--editor-size", settings.fontSize + "px");
    root.style.setProperty("--editor-weight", String(settings.fontStyle).indexOf("bold") >= 0 ? "700" : "400");
    root.style.setProperty("--editor-style", String(settings.fontStyle).indexOf("italic") >= 0 ? "italic" : "normal");
    root.style.setProperty("--zoom", String(scale()));
    root.style.setProperty("--canvas-w", (doc ? doc.width : 900) + "px");
    root.style.setProperty("--canvas-h", (doc ? doc.height : 560) + "px");
    root.style.setProperty("--workspace-image-opacity", String((settings.backgroundOpacity || 0) / 100));
    applyLayout();
    document.title = BUILD.title;
    const title = $("appTitle");
    if (title) title.textContent = BUILD.title;
  }

  function layout() {
    if (!settings.layout) settings.layout = { left: metrics.PANEL_MIN, right: metrics.PANEL_MIN };
    return settings.layout;
  }

  function applyLayout() {
    const root = document.documentElement;
    const box = layout();
    // never narrower than the longest label, so nothing is cut off or pushed onto a second line
    box.left = Math.max(metrics.PANEL_MIN, box.left || metrics.PANEL_MIN);
    box.right = Math.max(metrics.PANEL_MIN, box.right || metrics.PANEL_MIN);
    root.style.setProperty("--left", box.left + "px");
    root.style.setProperty("--right", box.right + "px");
  }

  function bindSplitters() {
    const root = document.documentElement;
    const bars = {
      splitLeft: (event) => {
        const left = document.querySelector(".body").getBoundingClientRect().left;
        const value = clamp(event.clientX - left, metrics.PANEL_MIN, 520);
        layout().left = value;
        root.style.setProperty("--left", value + "px");
      },
      splitRight: (event) => {
        const right = document.querySelector(".body").getBoundingClientRect().right;
        const value = clamp(right - event.clientX, metrics.PANEL_MIN, 520);
        layout().right = value;
        root.style.setProperty("--right", value + "px");
      },
    };
    Object.keys(bars).forEach((id) => {
      const bar = $(id);
      if (!bar) return;
      bar.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        bar.classList.add("dragging");
        try { bar.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
        const move = (motion) => bars[id](motion);
        const stop = () => {
          bar.classList.remove("dragging");
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", stop);
          bar.removeEventListener("pointercancel", stop);
          saveSettings();
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", stop);
        bar.addEventListener("pointercancel", stop);
      });
      bar.addEventListener("dblclick", () => {
        const box = layout();
        if (id === "splitLeft") box.left = metrics.PANEL_MIN;
        else box.right = metrics.PANEL_MIN;
        applyLayout();
        saveSettings();
      });
    });
  }

  function newDoc(options) {
    const name = "untitled-" + nextName + ".mpaint";
    nextName += 1;
    return Paint.createDoc(Object.assign({
      name: name,
      width: settings.canvasWidth,
      height: settings.canvasHeight,
      background: settings.canvasBackground,
    }, options || {}));
  }

  function capture() {
    return JSON.stringify({ active: active, selected: selected, docs: docs });
  }

  function pushUndo() {
    undoStack.push(capture());
    if (undoStack.length > metrics.MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function restore(raw) {
    const data = JSON.parse(raw);
    docs = data.docs.map((doc) => Paint.createDoc(doc));
    active = data.active;
    selected = data.selected || [];
    renderAll();
  }

  function selectedShapes() {
    const doc = current();
    if (!doc) return [];
    return doc.shapes.filter((shape) => selected.indexOf(shape.id) >= 0);
  }

  function firstSelected() {
    return selectedShapes()[0] || null;
  }

  function markDirty() {
    const doc = current();
    if (doc) doc.dirty = true;
    persistSession();
  }

  function button(action, icon, label, extra) {
    return '<button type="button" class="tool-btn" data-action="' + action + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + Icons.icon(icon) + (extra || "") + "</button>";
  }

  function renderToolbar() {
    $("toolbar").innerHTML = [
      button("new", "new", t("file.new")),
      button("open", "open", t("file.open")),
      button("save", "save", t("file.save")),
      button("export", "download", t("file.export")),
      '<i class="sep"></i>',
      button("undo", "undo", t("edit.undo")),
      button("redo", "redo", t("edit.redo")),
      '<i class="sep"></i>',
      button("cut", "cut", t("edit.cut")),
      button("copy", "copy", t("edit.copy")),
      button("paste", "paste", t("edit.paste")),
      button("deleteShape", "trash", t("edit.delete")),
      button("cropRegion", "crop", t("edit.crop")),
      '<i class="sep"></i>',
      button("zoomOut", "zoomOut", t("view.zoomOut")),
      '<button type="button" class="tool-btn zoom-readout" data-action="zoomReset" id="zoomValue" title="' + esc(t("view.zoomReset")) + '">' + settings.zoom + "%</button>",
      button("zoomIn", "zoomIn", t("view.zoomIn")),
      '<i class="sep"></i>',
      button("print", "print", t("file.print")),
      '<i class="sep"></i>',
      button("toggleLeft", "panelLeft", t("view.left")),
      button("toggleRight", "panelRight", t("view.right")),
      '<span class="toolbar-end">' + toolbarActions().map(toolActionButton).join("") + "</span>",
    ].join("");
    updateHistoryButtons();
  }

  function languageButton() {
    const toEnglish = settings.language !== "en";
    const label = toEnglish ? "English" : "한국어";
    const code = toEnglish ? "uk" : "kr";
    const tip = t("view.language") + ": " + label;
    return '<button type="button" class="tool-btn lang-btn" data-action="language" data-flag="' + code + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      Icons.flag(code) + '<span class="lang-label">' + esc(label) + "</span></button>";
  }

  function toolbarActions() {
    return [
      { action: "themeCycle", icon: "theme", tip: t("view.theme") },
      { action: "themeMenu", icon: "caret", tip: t("view.themeList"), caret: true },
      { action: "language", icon: "language", tip: t("view.language") },
      { action: "settings", icon: "settings", tip: t("file.settings") },
      { action: "about", icon: "about", tip: t("help.about") },
    ];
  }

  function toolActionButton(item) {
    if (item.action === "language") return languageButton();
    return button(item.action, item.icon, item.tip).replace('class="tool-btn"', 'class="tool-btn' + (item.caret ? " tool-caret" : "") + '"');
  }

  function updateHistoryButtons() {
    document.querySelectorAll('[data-action="undo"]').forEach((el) => { el.disabled = undoStack.length === 0; });
    document.querySelectorAll('[data-action="redo"]').forEach((el) => { el.disabled = redoStack.length === 0; });
  }

  function menuItem(action, icon, label, shortcut, disabled) {
    return { action: action, icon: icon, label: label, shortcut: shortcut || "", disabled: Boolean(disabled) };
  }

  function menuDefinitions() {
    const recent = [menuItem("recent-label", "folder", t("file.recent"), "", true)]
      .concat((settings.recent || []).map((row) => menuItem("recent:" + row.id, "file", row.name)));
    if (recent.length === 1) recent.push(menuItem("recent-none", "file", t("file.none"), "", true));
    return [
      { id: "file", label: t("menu.file"), icon: "file", items: [
        menuItem("new", "new", t("file.new"), "Ctrl+N"),
        menuItem("open", "open", t("file.open"), "Ctrl+O"),
        menuItem("openImage", "image", t("file.openImageAny")),
        menuItem("openUrl", "link", t("file.openUrl")),
        menuItem("save", "save", t("file.save"), "Ctrl+S"),
        menuItem("saveAs", "saveAs", t("file.saveAs")),
        menuItem("export", "download", t("file.export")),
        menuItem("exportPng", "image", t("file.exportPng")),
      ].concat(recent).concat([
        menuItem("recentManager", "folder", t("file.manageRecent")),
        menuItem("clearRecent", "trash", t("file.clearRecent")),
        menuItem("print", "print", t("file.print"), "Ctrl+P"),
        menuItem("exit", "exit", t("file.exit")),
      ]) },
      { id: "edit", label: t("menu.edit"), icon: "copy", items: [
        menuItem("undo", "undo", t("edit.undo"), "Ctrl+Z", undoStack.length === 0),
        menuItem("redo", "redo", t("edit.redo"), "Ctrl+Y", redoStack.length === 0),
        menuItem("cut", "cut", t("edit.cut"), "Ctrl+X"),
        menuItem("copy", "copy", t("edit.copy"), "Ctrl+C"),
        menuItem("paste", "paste", t("edit.paste"), "Ctrl+V"),
        menuItem("deleteShape", "trash", t("edit.delete"), "Delete"),
        menuItem("selectAll", "select", t("edit.selectAll"), "Ctrl+A"),
        menuItem("deselect", "clear", t("edit.deselect"), "Esc"),
        menuItem("cropRegion", "crop", t("edit.crop"), "", !region),
        menuItem("eraseRegion", "marquee", t("edit.eraseRegion"), "", !region),
      ] },
      { id: "draw", label: t("menu.draw"), icon: "palette", items: Paint.TOOLS.map((tool) => (
        menuItem("tool:" + tool.id, tool.icon, t("tool." + tool.id))
      )).concat([
        menuItem("palette", "palette", t("draw.palette")),
        menuItem("bringForward", "layerUp", t("draw.bringForward")),
        menuItem("sendBackward", "layerDown", t("draw.sendBackward")),
        menuItem("canvasSize", "canvas", t("draw.canvasSize")),
        menuItem("clearDrawing", "clear", t("draw.clear")),
      ]) },
      { id: "view", label: t("menu.view"), icon: "zoomIn", items: [
        menuItem("zoomIn", "zoomIn", t("view.zoomIn")),
        menuItem("zoomOut", "zoomOut", t("view.zoomOut")),
        menuItem("zoomReset", "check", t("view.zoomReset")),
        menuItem("toggleLeft", "panelLeft", t("view.left")),
        menuItem("toggleRight", "panelRight", t("view.right")),
      ] },
      { id: "tools", label: t("menu.tools"), icon: "wrench", items: [
        menuItem("formats", "image", t("popup.formats")),
        menuItem("dicomInfo", "scan", t("dicom.info"), "", !dicomOf()),
        menuItem("dicomCine", "play", t("dicom.play"), "", !dicomOf()),
        menuItem("download", "download", t("tools.download")),
        menuItem("link", "link", t("tools.link")),
        menuItem("settings", "settings", t("file.settings")),
      ] },
      { id: "help", label: t("menu.help"), icon: "help", items: [
        menuItem("guide", "help", t("help.guide")),
        menuItem("about", "about", t("help.about")),
      ] },
    ];
  }

  function menuRootButton(menu) {
    return '<button type="button" class="menu-root" data-menu="' + menu.id + '" data-align="left" title="' + esc(menu.label) + '">' +
      Icons.icon(menu.icon) + "<span>" + esc(menu.label) + "</span></button>";
  }

  function windowControls() {
    const control = (name, label, path) => (
      '<button type="button" class="win-btn' + (name === "close" ? " close" : "") + '" data-window="' + name + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true">' + path + "</svg></button>"
    );
    return '<div class="window-controls">' +
      control("minimize", t("window.minimize"), '<path d="M0 5h10"/>') +
      control("maximize", t("window.maximize"), '<rect x="0.5" y="0.5" width="9" height="9"/>') +
      control("close", t("window.close"), '<path d="M0 0l10 10M10 0 0 10"/>') +
      "</div>";
  }

  function renderMenubar() {
    $("menubar").innerHTML =
      '<span class="app-title"><img src="assets/icon.png" width="16" height="16" alt=""><strong id="appTitle">' + esc(BUILD.title) + "</strong></span>" +
      menuDefinitions().map(menuRootButton).join("") +
      '<span class="menu-spacer"></span>' +
      windowControls();
  }

  function renderTabs() {
    const strip = $("tabstrip");
    strip.innerHTML = docs.map((doc, index) => (
      '<span class="tab' + (index === active ? " active" : "") + '">' +
      '<button type="button" class="tab-name" data-tab="' + index + '" title="' + esc(doc.name) + '">' + esc(doc.name) + (doc.dirty ? " *" : "") + "</button>" +
      '<button type="button" class="tab-close" data-close="' + index + '" title="' + esc(t("tab.close")) + '" aria-label="' + esc(t("tab.close")) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></span>'
    )).join("");
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    $("tabPrev").disabled = !overflow;
    $("tabNext").disabled = !overflow;
    $("tabPrev").title = t("tab.prev");
    $("tabNext").title = t("tab.next");
  }

  const TOOL_CURSORS = {
    select: "default",
    text: "text",
    picker: "crosshair",
    fill: "crosshair",
  };

  function renderBoard() {
    const doc = current();
    const board = $("board");
    if (!doc || !board) return;
    board.style.cursor = dragState ? "move" : (TOOL_CURSORS[settings.tool] || "crosshair");
    if (board.width !== doc.width) board.width = doc.width;
    if (board.height !== doc.height) board.height = doc.height;
    document.documentElement.style.setProperty("--canvas-w", doc.width + "px");
    document.documentElement.style.setProperty("--canvas-h", doc.height + "px");
    const ctx = board.getContext("2d");
    Paint.render(ctx, doc, { preview: draft, images: images });
    renderOverlay();
  }

  function renderOverlay() {
    const overlay = $("canvasOverlay");
    if (!overlay) return;
    const factor = scale();
    const doc = current();
    const shapes = selectedShapes().map((shape) => {
      const box = Paint.bounds(shape);
      return '<div class="marquee" style="left:' + (box.x * factor) + "px;top:" + (box.y * factor) +
        "px;width:" + Math.max(2, box.w * factor) + "px;height:" + Math.max(2, box.h * factor) + 'px"></div>';
    }).join("");
    const outline = region ? Paint.regionOutline(region, factor) : "";
    const box = band ? Paint.normalizeRect(band) : null;
    const dragBox = box
      ? '<rect class="band" x="' + (box.x * factor) + '" y="' + (box.y * factor) +
        '" width="' + Math.max(1, box.w * factor) + '" height="' + Math.max(1, box.h * factor) + '"/>'
      : "";
    const picked = (outline || dragBox) && doc
      ? '<svg class="region" width="' + (doc.width * factor) + '" height="' + (doc.height * factor) + '" aria-hidden="true">' +
        outline + dragBox + "</svg>"
      : "";
    overlay.innerHTML = shapes + picked;
  }

  function renderLeft() {
    const doc = current();
    $("leftPanel").classList.toggle("hidden", !settings.showLeft);
    $("splitLeft").classList.toggle("hidden", !settings.showLeft);
    const tools = Paint.TOOLS.map((tool) => (
      '<button type="button" class="tool-cell' + (settings.tool === tool.id ? " on" : "") + '" data-action="tool:' + tool.id + '" title="' + esc(t("tool." + tool.id)) + '" aria-label="' + esc(t("tool." + tool.id)) + '">' +
      Icons.icon(tool.icon) + "</button>"
    )).join("");
    const swatches = Paint.PALETTE.map((color) => (
      '<button type="button" class="swatch-btn' + (settings.color === color ? " on" : "") + '" data-action="color:' + color + '" style="background:' + color + '" title="' + esc(color) + '" aria-label="' + esc(color) + '"></button>'
    )).join("");
    const shapeRows = (doc ? doc.shapes : []).slice().reverse().map((shape) => (
      '<div class="shape-item' + (selected.indexOf(shape.id) >= 0 ? " active" : "") + '">' +
      '<button type="button" class="shape-pick" data-action="shape:' + esc(shape.id) + '" title="' + esc(t("kind." + shape.kind)) + '">' +
      Icons.icon(shape.kind === "pencil" ? "pencil" : shape.kind === "brush" ? "brush" : shape.kind === "eraser" ? "eraser" : shape.kind) +
      "<span>" + esc(t("kind." + shape.kind)) + "</span>" +
      '<i class="dot" style="background:' + esc(shape.fill || shape.color) + '"></i></button>' +
      '<button type="button" class="shape-remove" data-action="removeShape:' + esc(shape.id) + '" title="' + esc(t("left.removeShape")) + '" aria-label="' + esc(t("left.removeShape")) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></div>'
    )).join("") || '<div class="line" style="padding:0 8px">' + esc(t("status.none")) + "</div>";
    $("leftPanel").innerHTML = [
      "<h2>" + esc(t("left.tools")) + "</h2>",
      '<div class="tool-grid">' + tools + "</div>",
      "<h2>" + esc(t("left.colors")) + "</h2>",
      '<div class="swatches">' + swatches + "</div>",
      '<label class="color-row"><span>' + esc(t("palette.color")) + '</span><input type="color" data-pick="color" value="' + esc(settings.color) + '" title="' + esc(t("palette.color")) + '"></label>',
      '<label class="color-row"><span>' + esc(t("palette.fill")) + '</span><input type="color" data-pick="fillColor" value="' + esc(settings.fillColor || "#ffffff") + '" title="' + esc(t("palette.fill")) + '"></label>',
      '<label class="color-row"><span>' + esc(t("palette.none")) + '</span><input type="checkbox" data-pick="noFill"' + (settings.fillColor ? "" : " checked") + ' title="' + esc(t("palette.none")) + '"></label>',
      '<div class="color-row"><span>' + esc(t("palette.width")) + "</span>" +
        '<button type="button" class="step-btn" data-action="strokeDown" title="' + esc(t("palette.thinner")) + '" aria-label="' + esc(t("palette.thinner")) + '">&#8722;</button>' +
        '<input type="range" min="1" max="48" value="' + settings.strokeWidth + '" data-pick="strokeWidth" title="' + esc(t("palette.width")) + '" aria-label="' + esc(t("palette.width")) + '">' +
        '<button type="button" class="step-btn" data-action="strokeUp" title="' + esc(t("palette.thicker")) + '" aria-label="' + esc(t("palette.thicker")) + '">+</button>' +
        '<b id="strokeValue">' + settings.strokeWidth + "</b></div>",
      "<h2>" + esc(t("left.shapes")) + "</h2>",
      '<div class="shape-list">' + shapeRows + "</div>",
    ].join("");
  }

  function propLine(label, control) {
    return '<label class="line prop-line"><span>' + esc(label) + "</span>" + control + "</label>";
  }

  /* Every number in the panel is typed or stepped, so it works without aiming at a tiny
   * caret. `attr` is the attribute the value is read back from: prop or dicom. */
  function propSpin(attr, name, value, min, max, step, label) {
    const by = step || 1;
    const limits = (min == null ? "" : ' min="' + min + '"') + (max == null ? "" : ' max="' + max + '"');
    const button = (delta, mark, tip) => (
      '<button type="button" class="spin-btn" data-step="' + attr + ":" + name + ":" + delta + '" tabindex="-1" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + mark + "</button>"
    );
    return '<span class="spin">' +
      button(-by, "&#8722;", t("spin.less") + " " + label) +
      '<input data-' + attr + '="' + name + '" type="number"' + limits + ' value="' + esc(value) + '" title="' + esc(label) + '">' +
      button(by, "+", t("spin.more") + " " + label) +
      "</span>";
  }

  function stepProperty(target) {
    const parts = String(target.dataset.step || "").split(":");
    if (parts.length !== 3) return false;
    const panel = $("rightPanel");
    const input = panel.querySelector("[data-" + parts[0] + '="' + parts[1] + '"]');
    if (!input) return true;
    const delta = Number(parts[2]) || 1;
    const low = input.min === "" ? -Infinity : Number(input.min);
    const high = input.max === "" ? Infinity : Number(input.max);
    input.value = String(Math.min(high, Math.max(low, (Number(input.value) || 0) + delta)));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function pictureSection(doc) {
    const source = sourceOf(doc);
    if (!source) return "";
    const rows = [
      '<div class="line"><span>' + esc(t("image.kind")) + '</span><b class="grow" id="sourceKind">' + esc(t("kind." + source.kind)) + "</b></div>",
    ];
    if (source.pages > 1 && source.kind !== "dicom") {
      rows.push('<div class="line"><span>' + esc(t("image.page")) + '</span><b class="grow" id="pageValue">' +
        (source.page + 1) + "/" + source.pages + "</b></div>");
      rows.push('<div class="line step-row">' +
        '<button type="button" class="action grow" data-action="prevPage" title="' + esc(t("tab.prev")) + '">&lt;</button>' +
        '<button type="button" class="action grow" data-action="nextPage" title="' + esc(t("tab.next")) + '">&gt;</button></div>');
    }
    if (source.exifText) {
      rows.push('<div class="line" title="' + esc(source.exifText) + '"><span>' + esc(t("image.camera")) + '</span><b class="grow" id="cameraInfo">' + esc(source.exifText) + "</b></div>");
    }
    return "<h2>" + esc(t("popup.formats")) + '</h2><div class="props">' + rows.join("") + "</div>";
  }

  function dicomSection(doc) {
    const image = dicomOf(doc);
    if (!image) return "";
    const state = image.state;
    const rows = [];
    if (image.frames > 1) {
      rows.push('<div class="line"><span>' + esc(t("dicom.frame")) + '</span><b class="grow" id="dicomFrame">' +
        (state.frame + 1) + "/" + image.frames + "</b></div>");
      rows.push('<div class="line step-row">' +
        '<button type="button" class="action grow" data-action="prevPage" title="' + esc(t("tab.prev")) + '">&lt;</button>' +
        '<button type="button" class="action grow" data-action="nextPage" title="' + esc(t("tab.next")) + '">&gt;</button>' +
        '<button type="button" class="action grow" data-action="dicomCine" title="' + esc(cineTimer ? t("dicom.stop") : t("dicom.play")) + '">' +
        Icons.icon(cineTimer ? "stop" : "play") + "</button></div>");
    }
    // A window, a colour map and a VOI function only mean something for grey values; an RGB or
    // palette scan keeps the frame stepper, inversion and its overlays.
    const windowed = image.windowed !== false;
    if (windowed) {
      const chosen = extrasOf(doc).preset || "file";
      rows.push(propLine(t("dicom.preset"), '<select data-dicom="preset" title="' + esc(t("dicom.preset")) + '">' +
        dicomPresets(image).map((preset) => optionTag(preset.id, preset.label, chosen)).join("") + "</select>"));
      rows.push(propLine(t("dicom.center"), propSpin("dicom", "wc", Math.round(state.wc == null ? 0 : state.wc), null, null, 10, t("dicom.center"))));
      rows.push(propLine(t("dicom.width"), propSpin("dicom", "ww", Math.round(state.ww == null ? 1 : state.ww), 1, null, 10, t("dicom.width"))));
      rows.push(propLine(t("dicom.colormap"), '<select data-dicom="colormap" title="' + esc(t("dicom.colormap")) + '">' +
        (image.colormaps || ["gray"]).map((name) => optionTag(name, name, state.colormap)).join("") + "</select>"));
    }
    rows.push('<label class="line prop-line"><span>' + esc(t("dicom.invert")) + '</span><input data-dicom="invert" type="checkbox"' + (state.invert ? " checked" : "") + "></label>");
    if ((image.overlays || []).length) {
      rows.push('<label class="line prop-line"><span>' + esc(t("dicom.overlays")) + '</span><input data-dicom="overlays" type="checkbox"' + (state.overlays ? " checked" : "") + "></label>");
    }
    if ((image.voiLuts || []).length) {
      rows.push(propLine(t("dicom.voiLut"), '<select data-dicom="voiLut" title="' + esc(t("dicom.voiLut")) + '">' +
        [{ id: "-1", label: t("dicom.preset.file") }].concat(image.voiLuts.map((lut, index) => ({ id: String(index), label: lut.label })))
          .map((item) => optionTag(item.id, item.label, String(state.voiLut))).join("") + "</select>"));
    }
    if (windowed) {
      rows.push(propLine(t("dicom.voiFunction"), '<select data-dicom="voiFunction" title="' + esc(t("dicom.voiFunction")) + '">' +
        ["LINEAR", "LINEAR_EXACT", "SIGMOID"].map((name) => optionTag(name, name, state.voiFunction)).join("") + "</select>"));
    }
    if (lastProbe) {
      const text = lastProbe.r != null
        ? lastProbe.r + ", " + lastProbe.g + ", " + lastProbe.b
        : (Math.round(lastProbe.value * 100) / 100) + (lastProbe.units ? " " + lastProbe.units : "");
      rows.push('<div class="line"><span>' + esc(t("dicom.value")) + '</span><b class="grow" id="dicomValue">' + esc(text) + "</b></div>");
    }
    rows.push('<div class="line"><button type="button" class="action grow" data-action="dicomReset">' + esc(t("dicom.reset")) + "</button></div>");
    rows.push('<div class="line"><button type="button" class="action grow" data-action="dicomInfo">' + esc(t("dicom.info")) + "</button></div>");
    return "<h2>" + esc(t("dicom.title")) + '</h2><div class="props">' + rows.join("") + "</div>";
  }

  function renderRight() {
    const doc = current();
    $("rightPanel").classList.toggle("hidden", !settings.showRight);
    $("splitRight").classList.toggle("hidden", !settings.showRight);
    const shape = firstSelected();
    const rows = [];
    if (shape) {
      rows.push('<div class="line"><span>' + esc(t("prop.kind")) + '</span><b class="grow">' + esc(t("kind." + shape.kind)) + "</b></div>");
      rows.push(propLine(t("prop.color"), '<input data-prop="color" type="color" value="' + esc(shape.color) + '" title="' + esc(t("prop.color")) + '">'));
      if (shape.kind === "rect" || shape.kind === "ellipse") {
        rows.push(propLine(t("prop.fill"), '<input data-prop="fill" type="color" value="' + esc(shape.fill || "#ffffff") + '" title="' + esc(t("prop.fill")) + '">'));
      }
      rows.push(propLine(t("prop.width"), propSpin("prop", "width", shape.width, 1, 96, 1, t("prop.width"))));
      rows.push(propLine(t("prop.opacity"), propSpin("prop", "opacity", shape.opacity, 0, 100, 5, t("prop.opacity"))));
      if (shape.kind === "text") {
        rows.push(propLine(t("prop.text"), '<input data-prop="text" type="text" value="' + esc(shape.text) + '" title="' + esc(t("prop.text")) + '">'));
        rows.push(propLine(t("prop.font"), '<select data-prop="fontFamily" title="' + esc(t("prop.font")) + '">' + fontCatalog.map((name) => optionTag(name, name, shape.fontFamily)).join("") + "</select>"));
        rows.push(propLine(t("prop.fontSize"), propSpin("prop", "fontSize", shape.fontSize, 6, 400, 2, t("prop.fontSize"))));
        rows.push(propLine(t("prop.fontStyle"), '<select data-prop="fontStyle" title="' + esc(t("prop.fontStyle")) + '">' +
          optionTag("normal", t("font.normal"), shape.fontStyle) + optionTag("italic", t("font.italic"), shape.fontStyle) +
          optionTag("bold", t("font.bold"), shape.fontStyle) + optionTag("bold-italic", t("font.boldItalic"), shape.fontStyle) + "</select>"));
      }
      if (!Paint.isStroke(shape.kind)) {
        rows.push(propLine(t("prop.x"), propSpin("prop", "x", Math.round(shape.x), null, null, 1, t("prop.x"))));
        rows.push(propLine(t("prop.y"), propSpin("prop", "y", Math.round(shape.y), null, null, 1, t("prop.y"))));
      }
      const size = Paint.sizeOf(shape);
      rows.push('<div class="line"><span>' + esc(t("prop.w")) + '</span><b class="grow">' + size.width + "</b></div>");
      rows.push('<div class="line"><span>' + esc(t("prop.h")) + '</span><b class="grow">' + size.height + "</b></div>");
      const measure = measurementOf(shape);
      if (measure && measure.kind === "length") {
        rows.push('<div class="line"><span>' + esc(t("dicom.length")) + '</span><b class="grow" id="measureLength">' +
          (measure.mm ? (Math.round(measure.mm * 100) / 100) + " mm" : Math.round(measure.px) + " px") + "</b></div>");
      }
      if (measure && measure.kind === "roi") {
        rows.push('<div class="line"><span>' + esc(t("dicom.mean")) + '</span><b class="grow" id="measureMean">' + (Math.round(measure.mean * 100) / 100) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("dicom.std")) + '</span><b class="grow">' + (Math.round(measure.std * 100) / 100) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("dicom.min")) + '</span><b class="grow">' + (Math.round(measure.min * 100) / 100) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("dicom.max")) + '</span><b class="grow">' + (Math.round(measure.max * 100) / 100) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("dicom.area")) + '</span><b class="grow">' +
          (measure.areaMm2 ? (Math.round(measure.areaMm2 * 100) / 100) + " mm2" : Math.round(measure.areaPx) + " px") + "</b></div>");
      }
    } else {
      rows.push(propLine(t("prop.name"), '<input data-prop="name" type="text" value="' + esc(doc ? doc.name : "") + '" title="' + esc(t("prop.name")) + '">'));
      rows.push('<div class="line"><span>' + esc(t("prop.path")) + '</span><b class="grow">' + esc((doc && doc.path) || "-") + "</b></div>");
      rows.push(propLine(t("prop.background"), '<input data-prop="background" type="color" value="' + esc(doc ? doc.background : "#ffffff") + '" title="' + esc(t("prop.background")) + '">'));
      rows.push(propLine(t("canvas.width"), propSpin("prop", "canvasWidth", doc ? doc.width : 0, 16, 8192, 10, t("canvas.width"))));
      rows.push(propLine(t("canvas.height"), propSpin("prop", "canvasHeight", doc ? doc.height : 0, 16, 8192, 10, t("canvas.height"))));
      rows.push('<div class="line"><span>' + esc(t("prop.shapes")) + '</span><b class="grow">' + (doc ? doc.shapes.length : 0) + "</b></div>");
      if (region) {
        const box = Paint.regionBounds(region);
        rows.push('<div class="line"><span>' + esc(t("status.selection")) + '</span><b class="grow" id="regionKind">' + esc(t("region." + region.kind)) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("region.size")) + '</span><b class="grow" id="regionSize">' + Math.round(box.w) + " x " + Math.round(box.h) + "</b></div>");
        rows.push('<div class="line"><button type="button" class="action grow" data-action="cropRegion">' + esc(t("edit.crop")) + "</button></div>");
        rows.push('<div class="line"><button type="button" class="action grow" data-action="eraseRegion">' + esc(t("edit.eraseRegion")) + "</button></div>");
      } else {
        rows.push('<div class="line"><span>' + esc(t("status.selection")) + '</span><b class="grow">' + esc(t("status.none")) + "</b></div>");
      }
    }
    $("rightPanel").innerHTML = "<h2>" + esc(t("right.props")) + '</h2><div class="props">' + rows.join("") + "</div>" +
      pictureSection(doc) + dicomSection(doc);
    const shapeNode = firstSelected();
    if (shapeNode && shapeNode.kind === "text") {
      const family = $("rightPanel").querySelector('[data-prop="fontFamily"]');
      const style = $("rightPanel").querySelector('[data-prop="fontStyle"]');
      if (family) family.value = shapeNode.fontFamily;
      if (style) style.value = shapeNode.fontStyle;
    }
  }

  function renderStatus() {
    const doc = current();
    const shape = firstSelected();
    const source = sourceOf(doc);
    const theme = Themes.byId(settings.theme, settings.custom);
    const fields = [
      ["stState", t("status.ready")],
      ["stFile", doc ? doc.name : "-"],
      ["stTool", t("status.tool") + " " + t("tool." + settings.tool)],
      ["stShapes", t("status.shapes") + " " + (doc ? doc.shapes.length : 0)],
      ["stSelection", t("status.selection") + " " + (region ? t("region." + region.kind) : shape ? t("kind." + shape.kind) : t("status.none"))],
      ["stSize", t("status.size") + " " + (doc ? doc.width + "x" + doc.height : "-")],
      ["stFormat", t("status.format") + " " + (source ? t("kind." + source.kind) : t("kind.native"))],
      ["stFrame", t("status.frame") + " " + (source ? (source.page + 1) + "/" + source.pages : "1/1")],
      ["stPos", t("status.pos") + " " + Math.round(pointer.x) + ", " + Math.round(pointer.y)],
      ["stZoom", t("status.zoom") + " " + settings.zoom + "%"],
      ["stColor", t("status.color") + " " + settings.color, settings.color],
      ["stDirty", doc && doc.dirty ? t("status.dirty") : t("status.clean")],
      ["stLang", settings.language === "en" ? "EN" : "KO"],
      ["stTheme", Themes.nameOf(theme, settings.language)],
      ["stVersion", BUILD.version],
    ];
    $("statusbar").innerHTML = fields.map((field) => (
      '<span id="' + field[0] + '">' + (field[2] ? '<i class="chip" style="background:' + esc(field[2]) + '"></i>' : "") + esc(field[1]) + "</span>"
    )).join("");
    const grip = $("resizeGrip");
    if (grip) grip.title = t("window.resize");
  }

  function renderAll() {
    applyVisual();
    renderMenubar();
    renderToolbar();
    renderTabs();
    renderBoard();
    renderLeft();
    renderRight();
    renderStatus();
  }

  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
  }

  function themeCss() {
    const theme = Themes.byId(settings.theme, settings.custom);
    const css = Object.entries(theme.vars).map((pair) => pair[0] + ":" + pair[1]).join(";");
    return ":root{color-scheme:" + theme.mode + ";" + css + "}";
  }

  function themeStyle() {
    return '<style id="themeVars">' + themeCss() + "</style>";
  }

  function optionTag(value, label, chosen) {
    return '<option value="' + esc(value) + '"' + (String(value) === String(chosen) ? " selected" : "") + ">" + esc(label) + "</option>";
  }

  /* The same placement rule the desktop build applies on the screen, here against the page. */
  function fitMenu(x, y, width, height) {
    const limitX = window.innerWidth;
    const limitY = window.innerHeight;
    let left = x;
    let top = y;
    if (left + width > limitX) left = x - width;
    if (left + width > limitX) left = limitX - width;
    if (left < 0) left = 0;
    if (top + height > limitY) top = y - height;
    if (top + height > limitY) top = limitY - height;
    if (top < 0) top = 0;
    return { x: Math.round(left), y: Math.round(top) };
  }

  function menuHTML(items) {
    return items.map((item) => (
      '<button type="button" class="menu-item" data-action="' + esc(item.action) + '"' + (item.disabled ? " disabled" : "") + ' title="' + esc(item.label) + '">' +
      '<span class="ico">' + Icons.icon(item.icon) + "</span>" +
      '<span class="label">' + esc(item.label) + "</span>" +
      '<span class="shortcut">' + esc(item.shortcut) + "</span></button>"
    )).join("");
  }

  function themeMenuHTML() {
    const column = (mode) => Themes.THEMES.filter((item) => item.mode === mode).map((item) => (
      '<button type="button" class="menu-item theme-choice' + (item.id === settings.theme ? " on" : "") + '" data-action="theme:' + esc(item.id) + '" title="' + esc(Themes.nameOf(item, settings.language)) + '">' +
      '<i class="swatch" style="background:' + esc(item.vars["--bg"]) + ";border-color:" + esc(item.vars["--accent"]) + '"></i>' +
      '<span class="label">' + esc(Themes.nameOf(item, settings.language)) + "</span></button>"
    )).join("");
    const col = (mode, label) => '<div class="theme-col"><div class="theme-col-head">' + esc(label) + "</div>" + column(mode) + "</div>";
    return '<div class="theme-cols">' + col("dark", t("theme.dark")) + col("light", t("theme.light")) + "</div>" +
      '<button type="button" class="menu-item theme-custom' + (settings.theme === "custom" ? " on" : "") + '" data-action="themeCustom">' +
      '<span class="ico">' + Icons.icon("image") + "</span>" +
      '<span class="label">' + esc(t("theme.custom")) + "</span></button>";
  }

  function openThemeMenu(x, y) {
    const width = 360;
    const rows = Math.max(1, Math.ceil(Themes.THEMES.length / 2));
    const height = 24 + rows * 24 + 35 + 10;
    const place = fitMenu(x - width, y, width, height);
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: "theme",
        x: place.x,
        y: place.y,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu theme-menu">' + themeMenuHTML() + "</div>",
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu theme-menu";
    el.dataset.menu = "theme";
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = themeMenuHTML();
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function openMenu(id, x, y, align) {
    const def = menuDefinitions().find((item) => item.id === id);
    if (!def) return null;
    const width = 320;
    const height = def.items.length * metrics.MENU_ROW + metrics.MENU_PAD + 2;
    const place = fitMenu(align === "right" ? x - width : x, y, width, height);
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: id,
        x: place.x,
        y: place.y,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu">' + menuHTML(def.items) + "</div>",
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.dataset.menu = id;
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = menuHTML(def.items);
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function contextItems() {
    const shape = firstSelected();
    return [
      menuItem("undo", "undo", t("edit.undo"), "Ctrl+Z", !canUndo()),
      menuItem("redo", "redo", t("edit.redo"), "Ctrl+Y", !canRedo()),
      menuItem("cut", "cut", t("edit.cut"), "Ctrl+X", !shape),
      menuItem("copy", "copy", t("edit.copy"), "Ctrl+C", !shape),
      menuItem("paste", "paste", t("edit.paste"), "Ctrl+V", !clipboard),
      menuItem("deleteShape", "trash", t("edit.delete"), "Delete", !shape),
      menuItem("selectAll", "select", t("edit.selectAll"), "Ctrl+A"),
      menuItem("cropRegion", "crop", t("edit.crop"), "", !region),
      menuItem("eraseRegion", "marquee", t("edit.eraseRegion"), "", !region),
      menuItem("bringForward", "layerUp", t("draw.bringForward"), "", !shape),
      menuItem("sendBackward", "layerDown", t("draw.sendBackward"), "", !shape),
      menuItem("palette", "palette", t("draw.palette")),
      menuItem("canvasSize", "canvas", t("draw.canvasSize")),
      menuItem("export", "download", t("file.export")),
      menuItem("print", "print", t("file.print"), "Ctrl+P"),
    ];
  }

  function openContext(x, y) {
    const items = contextItems();
    const width = 300;
    const height = items.length * metrics.MENU_ROW + metrics.MENU_PAD + 2;
    const place = fitMenu(x, y, width, height);
    // like the other menus, this is a window of its own so it can run past the edge
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: "context",
        x: place.x,
        y: place.y,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu">' + menuHTML(items) + "</div>",
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.dataset.menu = "context";
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = menuHTML(items);
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function popupIcon(kind) {
    const map = {
      settings: "settings",
      about: "about",
      theme: "theme",
      print: "print",
      guide: "help",
      error: "warning",
      progress: "download",
      recent: "folder",
      save: "save",
      unsaved: "save",
      canvas: "canvas",
      drop: "image",
      palette: "palette",
      convert: "download",
      link: "link",
      dicom: "scan",
      formats: "image",
    };
    return map[kind] || "settings";
  }

  function popupTitle(kind) {
    const keys = {
      about: "popup.about",
      error: "popup.error",
      progress: "popup.progress",
      print: "popup.print",
      unsaved: "popup.unsaved",
      recent: "popup.recent",
      save: "popup.save",
      canvas: "popup.canvas",
      drop: "popup.drop",
      theme: "popup.theme",
      guide: "popup.guide",
      palette: "popup.palette",
      convert: "popup.convert",
      link: "popup.link",
      dicom: "popup.dicom",
      formats: "popup.formats",
    };
    return t(keys[kind] || "popup.settings");
  }

  function printScale(naturalWidth, naturalHeight, areaWidth, areaHeight) {
    const mode = printState.scaleMode || "fit";
    if (mode === "actual") return 1;
    if (mode === "custom") return Math.max(0.05, (Number(printState.scalePercent) || 100) / 100);
    return Math.min(1, areaWidth / naturalWidth, areaHeight / naturalHeight);
  }

  function alignOffset(areaHeight, drawHeight) {
    const spare = Math.max(0, areaHeight - drawHeight);
    if (printState.align === "top") return 0;
    if (printState.align === "bottom") return spare;
    return spare / 2;
  }

  /* The preview is the sheet that comes out of the printer: the paper at its real shape, the
   * margin left empty, and the picture laid into the printable area exactly the way the print
   * stylesheet lays it out — at its natural size in millimetres, shrunk only if it would not fit. */
  function previewDataUrl(page) {
    if (!page) return "";
    const paper = Print.paperSize(printState.paper, printState.orientation);
    const margin = printMargins();
    const scale = Math.min(620 / paper.width, 860 / paper.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(paper.width * scale));
    canvas.height = Math.max(1, Math.round(paper.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const areaWidth = Math.max(1, paper.width - margin.left - margin.right);
    const areaHeight = Math.max(1, paper.height - margin.top - margin.bottom);
    const naturalWidth = page.source.w / Print.MM_TO_PX;
    const naturalHeight = page.source.h / Print.MM_TO_PX;
    const fit = printScale(naturalWidth, naturalHeight, areaWidth, areaHeight);
    const drawWidth = naturalWidth * fit * scale;
    const drawHeight = naturalHeight * fit * scale;
    const left = (margin.left + (areaWidth - naturalWidth * fit) / 2) * scale;
    const top = (margin.top + alignOffset(areaHeight, naturalHeight * fit)) * scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, drawWidth, drawHeight);
    ctx.clip();
    ctx.translate(left, top);
    ctx.scale(drawWidth / page.source.w, drawHeight / page.source.h);
    ctx.translate(-page.source.x, -page.source.y);
    if (printState.printBackground !== false) {
      ctx.fillStyle = page.doc.background;
      ctx.fillRect(page.source.x, page.source.y, page.source.w, page.source.h);
    }
    page.doc.shapes.forEach((shape) => Paint.drawShape(ctx, shape, page.doc, images));
    ctx.restore();

    if (margin.top + margin.right + margin.bottom + margin.left > 0) {
      ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(margin.left * scale) + 0.5,
        Math.round(margin.top * scale) + 0.5,
        Math.round(areaWidth * scale) - 1,
        Math.round(areaHeight * scale) - 1,
      );
      ctx.setLineDash([]);
    }
    try { return canvas.toDataURL("image/png"); }
    catch (error) { return ""; }
  }

  function printAreaLabel() {
    const area = Print.printable(printState.paper, printState.orientation, printMargins());
    return Math.round(area.width) + " x " + Math.round(area.height) + " mm";
  }

  function printMargins() {
    return Print.marginsOf({
      top: printState.marginTop,
      right: printState.marginRight,
      bottom: printState.marginBottom,
      left: printState.marginLeft,
    });
  }

  function pagesForPrint() {
    return Print.selectPages(docs, {
      scope: printState.scope,
      currentIndex: active,
      paper: printState.paper,
      orientation: printState.orientation,
      margin: printMargins(),
      from: Number(printState.from) || 1,
      to: Number(printState.to) || 1,
    });
  }

  function popupHTML(kind) {
    const head = (title) => (
      '<header class="popup-titlebar"><strong><span class="popup-ico">' + Icons.icon(popupIcon(kind)) + "</span>" +
      '<span class="popup-title">' + esc(title) + "</span></strong>" +
      '<button type="button" class="dialog-x" data-popup-action="cancel" title="' + esc(t("action.close")) + '" aria-label="' + esc(t("action.close")) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></header>'
    );
    const foot = (buttons) => '<footer><span class="spacer"></span>' + buttons + "</footer>";
    const btn = (action, label, primary) => '<button type="button" class="action' + (primary ? " primary" : "") + '" data-popup-action="' + action + '">' + esc(label) + "</button>";
    const number = (field, value, min, max) => (
      '<span class="spin">' +
      '<button type="button" class="spin-btn" data-spin="' + field + ':-1" tabindex="-1" aria-label="-">&#8722;</button>' +
      '<input data-field="' + field + '" type="number" min="' + min + '" max="' + max + '" value="' + esc(value) + '">' +
      '<button type="button" class="spin-btn" data-spin="' + field + ':1" tabindex="-1" aria-label="+">+</button></span>'
    );
    if (kind === "about") {
      return head(t("popup.about")) +
        '<div class="popup-body">' +
        '<div class="line"><img src="assets/icon.png" width="20" height="20" alt=""><b>' + esc(BUILD.title) + "</b></div>" +
        '<div class="line" id="aboutBuild">' + esc(settings.language === "en" ? "Build" : "빌드") + " " + esc(BUILD.build) + "</div>" +
        '<div class="line" id="aboutAuthor" data-author="' + esc(BUILD.author) + '">' + esc(BUILD.author) + "</div>" +
        '<div class="line">' + esc(t("about.desc")) + "</div>" +
        '<div class="line">' + esc(BUILD.builtAt) + "</div>" +
        "</div>" + foot(btn("close", t("action.close")));
    }
    if (kind === "error") {
      const message = (lastError.split("\n")[1] || lastError).slice(0, 180);
      return head(t("popup.error")) +
        '<div class="popup-body">' +
        '<div class="line" id="errorMessage" title="' + esc(message) + '">' + esc(message) + "</div>" +
        '<input id="errorDetail" class="line-input" readonly value="' + esc(lastError.replace(/\s+/g, " ").trim()) + '">' +
        "</div>" + foot(btn("copy-error", t("action.copy")) + btn("close", t("action.close")));
    }
    if (kind === "progress") {
      const value = progressMarks.length ? progressMarks[progressMarks.length - 1] : 0;
      return head(t("popup.progress")) +
        '<div class="popup-body">' +
        '<div class="line" id="progressText">' + esc(t("status.busy")) + "</div>" +
        '<div class="line bar-row"><span class="bar"><span id="progressFill" style="width:' + value + '%"></span></span>' +
        '<b id="progressPct">' + value + '</b><span class="unit">%</span></div>' +
        "</div>" + foot(btn("stop-progress", t("action.cancel")));
    }
    if (kind === "unsaved") {
      return head(t("popup.unsaved")) +
        '<div class="popup-body"><div class="line">' + esc(t("unsaved.message")) + "</div></div>" +
        foot(btn("save-close", t("action.save"), true) + btn("discard", t("action.discard")) + btn("cancel", t("action.cancel")));
    }
    if (kind === "save") {
      const doc = current();
      return head(t("popup.save")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("save.name")) + '</span><input data-field="name" type="text" value="' + esc(doc ? (doc.path || doc.name) : "") + '"></label>' +
        '<label class="line"><span>' + esc(t("save.dir")) + '</span><input data-field="dir" type="text" value="' + esc(settings.lastSaveDir) + '"></label>' +
        '<label class="line"><span>' + esc(t("save.format")) + '</span><select data-field="format">' +
        optionTag("mpaint", t("save.drawing"), "mpaint") + optionTag("png", t("save.png"), "mpaint") + "</select></label>" +
        "</div>" + foot(btn("confirm-save", t("action.save"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "link") {
      return head(t("popup.link")) +
        '<div class="popup-body">' +
        '<div class="line">' + esc(t("link.message")) + "</div>" +
        '<label class="line"><span>' + esc(t("link.address")) + '</span><input data-field="url" type="text" placeholder="https://" value="' + esc(lastDownload && lastDownload.url ? lastDownload.url : "") + '"></label>' +
        '<div class="line">' + esc(t("link.hint")) + "</div>" +
        "</div>" + foot(btn("fetch-url", t("link.fetch"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "canvas") {
      const doc = current();
      return head(t("popup.canvas")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("canvas.width")) + "</span>" + number("width", doc ? doc.width : 900, 16, 8192) + "</label>" +
        '<label class="line"><span>' + esc(t("canvas.height")) + "</span>" + number("height", doc ? doc.height : 560, 16, 8192) + "</label>" +
        '<label class="line"><span>' + esc(t("canvas.background")) + '</span><input data-field="background" type="color" value="' + esc(doc ? doc.background : "#ffffff") + '"></label>' +
        "</div>" + foot(btn("apply-canvas", t("action.apply"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "palette") {
      return head(t("popup.palette")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("palette.color")) + '</span><input data-field="color" type="color" value="' + esc(settings.color) + '"></label>' +
        '<label class="line"><span>' + esc(t("palette.fill")) + '</span><input data-field="fillColor" type="color" value="' + esc(settings.fillColor || "#ffffff") + '"></label>' +
        '<label class="line"><span>' + esc(t("palette.none")) + '</span><input data-field="noFill" type="checkbox"' + (settings.fillColor ? "" : " checked") + "></label>" +
        '<label class="line"><span>' + esc(t("palette.width")) + "</span>" + number("strokeWidth", settings.strokeWidth, 1, 96) + "</label>" +
        '<label class="line"><span>' + esc(t("palette.opacity")) + "</span>" + number("shapeOpacity", settings.shapeOpacity, 0, 100) + "</label>" +
        "</div>" + foot(btn("apply-palette", t("action.apply"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "drop") {
      const format = pendingDrop ? t("kind." + pendingDrop.format) : "";
      return head(t("popup.drop")) +
        '<div class="popup-body">' +
        '<div class="line">' + esc(t("drop.message")) + "</div>" +
        '<div class="line"><span>' + esc(t("image.kind")) + '</span><b class="grow" id="dropKind">' + esc(format) + "</b></div>" +
        '<label class="line"><input type="radio" name="role" data-field="role" value="drawing" checked> ' + esc(t("drop.asDrawing")) + "</label>" +
        '<label class="line"><input type="radio" name="role" value="image"> ' + esc(t("drop.asImage")) + "</label>" +
        '<label class="line"><input type="radio" name="role" value="background"> ' + esc(t("drop.asBackground")) + "</label>" +
        "</div>" + foot(btn("apply-drop", t("action.ok"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "convert") {
      const doc = current();
      const source = sourceOf(doc);
      return head(t("popup.convert")) +
        '<div class="popup-body">' +
        '<div class="line"><span>' + esc(t("convert.source")) + '</span><b class="grow">' + esc(source ? t("kind." + source.kind) : t("kind.native")) + "</b></div>" +
        '<div class="line"><span>' + esc(t("convert.size")) + '</span><b class="grow">' + (doc ? doc.width + " x " + doc.height : "-") + "</b></div>" +
        '<label class="line"><span>' + esc(t("convert.format")) + '</span><select data-field="format">' +
        Formats.SAVE_FORMATS.map((item) => optionTag(item.id, t("format." + item.id), convertState.format)).join("") + "</select></label>" +
        '<label class="line"><span>' + esc(t("convert.quality")) + "</span>" + number("quality", convertState.quality, 10, 100) + "</label>" +
        "</div>" + foot(btn("apply-convert", t("convert.run"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "formats") {
      const groups = [
        ["native", Array.from(Formats.NATIVE)],
        ["tiff", Array.from(Formats.TIFF)],
        ["heif", Array.from(Formats.HEIF)],
        ["j2k", Array.from(Formats.J2K)],
        ["dicom", Array.from(Formats.DICOM)],
        ["raw", Array.from(Formats.RAW)],
      ];
      const tabs = groups.map((group, index) => (
        '<button type="button" data-tab="' + group[0] + '"' + (index === 0 ? ' class="on"' : "") + ' title="' + esc(t("kind." + group[0])) + '">' + esc(t("kindShort." + group[0])) + "</button>"
      )).join("");
      const panels = groups.map((group, index) => {
        const names = group[1].slice().sort();
        const rows = [];
        for (let i = 0; i < names.length; i += 8) rows.push(names.slice(i, i + 8).map((name) => "." + name).join("  "));
        return '<div data-panel="' + group[0] + '"' + (index === 0 ? "" : " hidden") + ">" +
          rows.map((row) => '<div class="line">' + esc(row) + "</div>").join("") + "</div>";
      }).join("");
      return head(t("popup.formats")) +
        '<div class="popup-body"><div class="tabs">' + tabs + "</div>" + panels + "</div>" +
        foot(btn("close", t("action.close")));
    }
    if (kind === "dicom") {
      const image = dicomOf();
      if (!image) {
        return head(t("popup.dicom")) +
          '<div class="popup-body"><div class="line">' + esc(t("dicom.none")) + "</div></div>" +
          foot(btn("close", t("action.close")));
      }
      const meta = image.meta || {};
      const rows = [
        ["patientName", meta.patientName], ["patientId", meta.patientId], ["modality", meta.modality],
        ["studyDescription", meta.studyDescription], ["seriesDescription", meta.seriesDescription],
        ["imageSize", meta.imageSize], ["photometric", meta.photometric], ["bitDepth", meta.bitDepth],
        ["frames", meta.frames], ["transferSyntax", meta.transferSyntax], ["pixelSpacing", meta.pixelSpacing],
        ["window", meta.window], ["warning", meta.warning],
      ].filter((row) => row[1]);
      const tags = dicomTags();
      const pages = tagPages();
      const page = Math.max(0, Math.min(pages - 1, tagPage));
      const slice = tags.slice(page * metrics.TAG_ROWS, page * metrics.TAG_ROWS + metrics.TAG_ROWS);
      return head(t("popup.dicom")) +
        '<div class="popup-body"><div class="tabs">' +
        '<button type="button" data-tab="meta" class="on">' + esc(t("dicom.meta")) + "</button>" +
        '<button type="button" data-tab="tags">' + esc(t("dicom.tags")) + "</button></div>" +
        '<div data-panel="meta">' +
        rows.map((row) => '<div class="line"><span>' + esc(t("meta." + row[0])) + '</span><b class="grow">' + esc(String(row[1])) + "</b></div>").join("") +
        "</div>" +
        '<div data-panel="tags" hidden>' +
        '<div class="line"><button type="button" class="action" data-popup-action="tag-prev">&lt;</button>' +
        '<span id="tagPage">' + esc(t("dicom.tagsPage")) + " " + (page + 1) + "/" + pages + " (" + tags.length + ")</span>" +
        '<button type="button" class="action" data-popup-action="tag-next">&gt;</button></div>' +
        slice.map((tag) => (
          '<div class="line" title="' + esc(tag.tag + " " + tag.name) + '"><span>' + esc(tag.tag) + '</span><span class="grow">' + esc(tag.name) + '</span><b>' + esc(String(tag.value == null ? "" : tag.value).slice(0, 40)) + "</b></div>"
        )).join("") +
        "</div></div>" + foot(btn("close", t("action.close")));
    }
    if (kind === "recent") {
      const rows = (settings.recent || []).map((row) => (
        '<div class="line"><span class="grow">' + esc(row.name) + '</span><button type="button" class="action" data-popup-action="remove-recent" data-id="' + esc(row.id) + '">' + esc(t("action.delete")) + "</button></div>"
      )).join("") || '<div class="line">' + esc(t("recent.empty")) + "</div>";
      return head(t("popup.recent")) +
        '<div class="popup-body"><div class="recent-slot">' + rows + "</div></div>" +
        foot(btn("clear-recent", t("action.deleteAll")) + btn("close", t("action.close")));
    }
    if (kind === "print") {
      const pages = pagesForPrint();
      const index = Math.max(0, Math.min(pages.length - 1, printState.pageIndex));
      const page = pages[index];
      const url = previewDataUrl(page);
      const settingsColumn = '<div class="print-settings">' +
        '<label class="line"><span>' + esc(t("print.scope")) + '</span><select data-field="scope">' +
        optionTag("all", t("print.all"), printState.scope) + optionTag("current", t("print.current"), printState.scope) + optionTag("custom", t("print.custom"), printState.scope) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.from")) + "</span>" + number("from", printState.from, 1, 9999) + "</label>" +
        '<label class="line"><span>' + esc(t("print.to")) + "</span>" + number("to", printState.to, 1, 9999) + "</label>" +
        '<label class="line"><span>' + esc(t("print.paper")) + '</span><select data-field="paper">' +
        Print.PAPER_IDS.map((name) => optionTag(name, name, printState.paper)).join("") + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.orientation")) + '</span><select data-field="orientation">' +
        optionTag("portrait", t("print.portrait"), printState.orientation) + optionTag("landscape", t("print.landscape"), printState.orientation) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.marginTop")) + "</span>" + number("marginTop", printState.marginTop, 0, 60) + "</label>" +
        '<label class="line"><span>' + esc(t("print.marginBottom")) + "</span>" + number("marginBottom", printState.marginBottom, 0, 60) + "</label>" +
        '<label class="line"><span>' + esc(t("print.marginLeft")) + "</span>" + number("marginLeft", printState.marginLeft, 0, 60) + "</label>" +
        '<label class="line"><span>' + esc(t("print.marginRight")) + "</span>" + number("marginRight", printState.marginRight, 0, 60) + "</label>" +
        '<label class="line"><span>' + esc(t("print.scale")) + '</span><select data-field="scaleMode">' +
        optionTag("fit", t("print.scaleFit"), printState.scaleMode) + optionTag("actual", t("print.scaleActual"), printState.scaleMode) + optionTag("custom", t("print.scaleCustom"), printState.scaleMode) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.scalePercent")) + "</span>" + number("scalePercent", printState.scalePercent, 10, 400) + "</label>" +
        '<label class="line"><span>' + esc(t("print.align")) + '</span><select data-field="align">' +
        optionTag("top", t("print.alignTop"), printState.align) + optionTag("middle", t("print.alignMiddle"), printState.align) + optionTag("bottom", t("print.alignBottom"), printState.align) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.copies")) + "</span>" + number("copies", printState.copies, 1, 99) + "</label>" +
        '<label class="line"><span>' + esc(t("print.background")) + '</span><input data-field="printBackground" type="checkbox"' + (printState.printBackground !== false ? " checked" : "") + "></label>" +
        '<div class="line"><span>' + esc(t("print.area")) + '</span><b class="grow" id="printArea">' + printAreaLabel() + "</b></div>" +
        "</div>";
      const previewColumn = '<div class="print-side">' +
        '<div class="preview" id="printPreview">' + (url ? '<img id="printImage" src="' + url + '" alt="' + esc(t("print.preview")) + '">' : "") + "</div>" +
        '<div class="line page-nav"><button type="button" class="action" data-popup-action="print-prev">&lt;</button>' +
        '<span id="printPage">' + esc(t("print.page")) + " " + (index + 1) + "/" + pages.length + "</span>" +
        '<button type="button" class="action" data-popup-action="print-next">&gt;</button></div>' +
        "</div>";
      return head(t("popup.print")) +
        '<div class="popup-body print-body">' + settingsColumn + previewColumn + "</div>" +
        foot(btn("do-print", t("action.print"), true) + btn("close", t("action.close")));
    }
    if (kind === "theme") {
      const colors = Object.assign(Themes.defaultCustom(), settings.custom || {});
      const colorLine = (key) => '<label class="line"><span>' + esc(t("theme." + key)) + '</span><input data-field="' + key + '" type="color" value="' + esc(colors[key]) + '"></label>';
      return head(t("popup.theme")) +
        '<div class="popup-body"><div data-panel="custom">' +
        '<label class="line"><span>' + esc(t("theme.mode")) + '</span><select data-field="mode">' + optionTag("dark", t("theme.dark"), colors.mode) + optionTag("light", t("theme.light"), colors.mode) + "</select></label>" +
        ["bg", "panel", "text", "muted", "accent", "border", "toolbar", "status", "menu"].map(colorLine).join("") +
        '<div class="line"><span class="grow"></span><button type="button" class="action primary" data-popup-action="apply-custom">' + esc(t("action.apply")) + "</button></div>" +
        "</div></div>";
    }
    if (kind === "guide") {
      const sections = [
        ["draw", ["guide.draw.1", "guide.draw.2", "guide.draw.3", "guide.draw.4", "guide.draw.5", "guide.draw.6"]],
        ["edit", ["guide.edit.1", "guide.edit.2", "guide.edit.3", "guide.edit.4", "guide.edit.5", "guide.edit.6"]],
        ["file", ["guide.file.1", "guide.file.2", "guide.file.3", "guide.file.4", "guide.file.5", "guide.file.6"]],
        ["view", ["guide.view.1", "guide.view.2", "guide.view.3", "guide.view.4", "guide.view.5", "guide.view.6", "guide.view.7"]],
      ];
      const tabs = sections.map((section, index) => (
        '<button type="button" data-tab="' + section[0] + '"' + (index === 0 ? ' class="on"' : "") + ">" + esc(t("guide.tab." + section[0])) + "</button>"
      )).join("");
      const panels = sections.map((section, index) => (
        '<div data-panel="' + section[0] + '"' + (index === 0 ? "" : " hidden") + ">" +
        section[1].map((key) => '<div class="line">' + esc(t(key)) + "</div>").join("") +
        "</div>"
      )).join("");
      return head(t("popup.guide")) +
        '<div class="popup-body"><div class="tabs">' + tabs + "</div>" + panels + "</div>" +
        foot(btn("close", t("action.close")));
    }
    return head(t("popup.settings")) +
      '<div class="popup-body">' +
      '<div class="tabs">' +
      [["general", "settings.general"], ["font", "settings.font"], ["appearance", "settings.appearance"], ["workspace", "settings.workspace"]].map((pair) => (
        '<button type="button" data-tab="' + pair[0] + '"' + (settingsTab === pair[0] ? ' class="on"' : "") + ">" + esc(t(pair[1])) + "</button>"
      )).join("") + "</div>" +
      '<div data-panel="general"' + (settingsTab === "general" ? "" : " hidden") + ">" +
      '<label class="line"><span>' + esc(t("settings.language")) + '</span><select data-field="language">' + optionTag("ko", t("lang.ko"), settings.language) + optionTag("en", t("lang.en"), settings.language) + "</select></label>" +
      '<label class="line"><span>' + esc(t("settings.theme")) + '</span><select data-field="theme">' +
      Themes.THEMES.concat([Themes.byId("custom", settings.custom)]).map((item) => optionTag(item.id, Themes.nameOf(item, settings.language), settings.theme)).join("") + "</select></label>" +
      '<label class="line"><span>' + esc(t("settings.canvasWidth")) + "</span>" + number("canvasWidth", settings.canvasWidth, 16, 8192) + "</label>" +
      '<label class="line"><span>' + esc(t("settings.canvasHeight")) + "</span>" + number("canvasHeight", settings.canvasHeight, 16, 8192) + "</label>" +
      '<label class="line"><input data-field="restoreSession" type="checkbox"' + (settings.restoreSession ? " checked" : "") + "> " + esc(t("settings.restore")) + "</label>" +
      "</div>" +
      '<div data-panel="font"' + (settingsTab === "font" ? "" : " hidden") + ">" +
      '<label class="line"><span>' + esc(t("settings.family")) + '</span><select data-field="fontFamily">' + fontCatalog.map((name) => optionTag(name, name, settings.fontFamily)).join("") + "</select></label>" +
      '<label class="line"><span>' + esc(t("settings.size")) + "</span>" + number("fontSize", settings.fontSize, 6, 400) + "</label>" +
      '<label class="line"><span>' + esc(t("settings.style")) + '</span><select data-field="fontStyle">' + optionTag("normal", t("font.normal"), settings.fontStyle) + optionTag("italic", t("font.italic"), settings.fontStyle) + optionTag("bold", t("font.bold"), settings.fontStyle) + optionTag("bold-italic", t("font.boldItalic"), settings.fontStyle) + "</select></label>" +
      "</div>" +
      '<div data-panel="appearance"' + (settingsTab === "appearance" ? "" : " hidden") + ">" +
      '<div class="line"><span class="grow">' + esc(settings.backgroundName || t("settings.bgChoose")) + '</span><button type="button" class="action" data-popup-action="bg-choose">' + esc(t("action.browse")) + "</button></div>" +
      '<div class="line"><span class="grow">' + esc(t("settings.bgClear")) + '</span><button type="button" class="action" data-popup-action="bg-clear">' + esc(t("action.delete")) + "</button></div>" +
      '<label class="line"><span>' + esc(t("settings.bgOpacity")) + "</span>" + number("backgroundOpacity", settings.backgroundOpacity, 0, 100) + "</label>" +
      "</div>" +
      '<div data-panel="workspace"' + (settingsTab === "workspace" ? "" : " hidden") + ">" +
      '<label class="line"><input data-field="showLeft" type="checkbox"' + (settings.showLeft ? " checked" : "") + "> " + esc(t("settings.showLeft")) + "</label>" +
      '<label class="line"><input data-field="showRight" type="checkbox"' + (settings.showRight ? " checked" : "") + "> " + esc(t("settings.showRight")) + "</label>" +
      '<div class="line"><span>' + esc(t("settings.recentDirs")) + "</span>" +
      '<select data-field="recentDir" title="' + esc(t("settings.recentDirs")) + '">' +
      ((settings.recentDirs || []).length
        ? (settings.recentDirs || []).map((dir) => optionTag(dir, dir, settings.lastOpenDir)).join("")
        : '<option value="">' + esc(t("settings.dirsEmpty")) + "</option>") + "</select>" +
      '<button type="button" class="action" data-popup-action="remove-dir"' + ((settings.recentDirs || []).length ? "" : " disabled") + ">" + esc(t("action.delete")) + "</button>" +
      '<button type="button" class="action" data-popup-action="clear-dirs"' + ((settings.recentDirs || []).length ? "" : " disabled") + ">" + esc(t("action.deleteAll")) + "</button></div>" +
      '<label class="line"><span>' + esc(t("settings.lastOpen")) + '</span><input data-field="lastOpenDir" type="text" readonly value="' + esc(settings.lastOpenDir) + '"></label>' +
      '<label class="line"><span>' + esc(t("settings.lastSave")) + '</span><input data-field="lastSaveDir" type="text" readonly value="' + esc(settings.lastSaveDir) + '"></label>' +
      "</div></div>" + foot(btn("apply-settings", t("action.apply"), true) + btn("cancel", t("action.cancel")));
  }

  function closePopup() {
    if (popupEl) popupEl.remove();
    popupEl = null;
    // in the desktop build the popup is a window of its own, so the host closes it
    if (window.desktop && window.desktop.closePopup && !TEST) window.desktop.closePopup();
  }

  function popupDocument(kind) {
    return themeStyle() + '<section class="popup" data-kind="' + kind + '">' + popupHTML(kind) + "</section>";
  }

  function openPopup(kind, anchor) {
    if (kind === "print") printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
    const spec = metrics.POPUPS[kind];
    const place = anchor || {
      x: Math.max(0, (window.innerWidth - spec.width) / 2),
      y: Math.max(0, (window.innerHeight - spec.height) / 2),
    };
    if (window.desktop && window.desktop.openPopup && !TEST) {
      window.desktop.openPopup({
        kind: kind,
        title: popupTitle(kind),
        width: spec.width,
        height: spec.height,
        html: popupDocument(kind),
        x: place.x,
        y: place.y,
        anchor: Boolean(anchor),
      });
      return null;
    }
    closePopup();
    const el = document.createElement("section");
    el.className = "popup";
    el.dataset.kind = kind;
    el.style.width = spec.width + "px";
    el.style.height = spec.height + "px";
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.innerHTML = popupHTML(kind);
    $("popupLayer").appendChild(el);
    popupEl = el;
    bindPopup(el, kind);
    return el;
  }

  function stepSpin(root, target) {
    const spin = target.closest ? target.closest("[data-spin]") : null;
    if (!spin || !root.contains(spin)) return false;
    const parts = String(spin.dataset.spin).split(":");
    const input = root.querySelector('[data-field="' + parts[0] + '"]');
    if (!input) return true;
    const step = Number(parts[1]) || 1;
    const low = input.min === "" ? -Infinity : Number(input.min);
    const high = input.max === "" ? Infinity : Number(input.max);
    input.value = String(Math.min(high, Math.max(low, (Number(input.value) || 0) + step)));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function bindPopup(el, kind) {
    if (kind === "error") {
      const detail = el.querySelector("#errorDetail");
      if (detail) detail.value = lastError.replace(/\s+/g, " ").trim();
    }
    if (kind === "settings") {
      const fields = {
        language: settings.language,
        fontFamily: settings.fontFamily,
        fontSize: String(settings.fontSize),
        fontStyle: settings.fontStyle,
        theme: settings.theme,
      };
      Object.entries(fields).forEach(([key, value]) => {
        const node = el.querySelector('[data-field="' + key + '"]');
        if (node) node.value = value;
      });
    }
    if (kind === "print") {
      ["scope", "paper", "orientation", "margin", "from", "to"].forEach((key) => {
        const node = el.querySelector('[data-field="' + key + '"]');
        if (node && printState[key] != null) node.value = printState[key];
      });
    }
    if (kind === "progress") paintProgress();
  }

  function readFields(root) {
    const fields = {};
    root.querySelectorAll("[data-field]").forEach((el) => {
      if (el.type === "radio") {
        if (el.checked) fields[el.dataset.field || el.name] = el.value;
        return;
      }
      fields[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    });
    const picked = root.querySelector('input[name="role"]:checked');
    if (picked) fields.role = picked.value;
    return fields;
  }

  function refreshPrintPreview() {
    const pages = pagesForPrint();
    if (printState.pageIndex >= pages.length) printState.pageIndex = pages.length - 1;
    if (printState.pageIndex < 0) printState.pageIndex = 0;
    if (!popupEl || popupEl.dataset.kind !== "print") return;
    const page = pages[printState.pageIndex];
    const label = popupEl.querySelector("#printPage");
    const preview = popupEl.querySelector("#printPreview");
    if (label) label.textContent = t("print.page") + " " + (printState.pageIndex + 1) + "/" + pages.length;
    if (preview) {
      const url = previewDataUrl(page);
      preview.innerHTML = url ? '<img id="printImage" src="' + url + '" alt="' + esc(t("print.preview")) + '">' : "";
    }
  }

  function showError(error) {
    const message = error && error.message ? error.message : String(error);
    const code = error && error.code ? "code: " + error.code : "";
    const stack = error && error.stack ? error.stack : "";
    lastError = [BUILD.title, message, code, stack].filter(Boolean).join("\n");
    openPopup("error");
    return lastError;
  }

  /* One progress window covers a whole job, even when it is made of several steps that each
   * report on their own — a download followed by the decoding of what arrived, say. */
  function beginProgress(label) {
    if (progressDepth === 0) {
      progressMarks.push(0);
      openPopup("progress");
      paintProgress(label, 0);
    } else if (label) {
      paintProgress(label);
    }
    progressDepth += 1;
  }

  function paintProgress(label, value) {
    if (!popupEl || popupEl.dataset.kind !== "progress") return;
    const text = popupEl.querySelector("#progressText");
    const fill = popupEl.querySelector("#progressFill");
    const pct = popupEl.querySelector("#progressPct");
    const now = value == null ? (progressMarks[progressMarks.length - 1] || 0) : value;
    if (text && label) text.textContent = label;
    if (fill) fill.style.width = now + "%";
    if (pct) pct.textContent = String(now);
  }

  /* Stopping whatever the progress window is showing. Only a download can be interrupted
   * part way; the rest finish on their own and simply close the window. */
  function cancelProgress() {
    if (downloadStop) {
      try { downloadStop.abort(); } catch (error) { /* already finished */ }
    }
    if (window.desktop && window.desktop.cancelDownload && !TEST) window.desktop.cancelDownload();
    downloadStop = null;
    progressDepth = 0;
    closePopup();
    return true;
  }

  async function stepProgress(value, label) {
    progressMarks.push(value);
    paintProgress(label, value);
    await delay(0);
  }

  function endProgress() {
    progressDepth = Math.max(0, progressDepth - 1);
    if (progressDepth > 0) return;
    closePopup();
  }

  async function withProgress(label, size, work) {
    const slow = size >= metrics.PROGRESS_BYTES;
    if (slow) beginProgress(label);
    const result = await work(async (value) => { if (slow) await stepProgress(value, label); });
    if (slow) {
      await stepProgress(100, label);
      endProgress();
    }
    return result;
  }

  function setLanguage(lang) {
    settings.language = lang === "en" ? "en" : "ko";
    saveSettings();
    renderAll();
  }

  function setTheme(id) {
    settings.theme = Themes.byId(id, settings.custom).id;
    saveSettings();
    applyVisual();
    renderStatus();
    paintChildWindows();
  }

  function paintChildWindows() {
    if (window.desktop && window.desktop.applyTheme && !TEST) window.desktop.applyTheme(themeCss());
  }

  function setCustom(colors) {
    settings.custom = Object.assign({}, Themes.defaultCustom(), settings.custom || {}, colors || {});
    if (settings.theme === "custom") applyVisual();
    saveSettings();
    renderStatus();
    return settings.custom;
  }

  function anchorUnder(selector, width) {
    const node = document.querySelector(selector);
    if (!node) return { x: 12, y: 70 };
    const rect = node.getBoundingClientRect();
    return { x: Math.max(0, rect.right - width), y: rect.bottom };
  }

  function stageCenterPoint() {
    const stage = $("stage");
    const frame = $("canvasFrame");
    if (!stage || !frame) return null;
    const box = stage.getBoundingClientRect();
    const view = frame.getBoundingClientRect();
    const factor = scale();
    return {
      x: (box.left + box.width / 2 - view.left) / factor,
      y: (box.top + box.height / 2 - view.top) / factor,
    };
  }

  function keepCentered(point) {
    const stage = $("stage");
    const frame = $("canvasFrame");
    if (!stage || !frame || !point) return;
    const box = stage.getBoundingClientRect();
    const view = frame.getBoundingClientRect();
    const factor = scale();
    stage.scrollLeft += (view.left + point.x * factor) - (box.left + box.width / 2);
    stage.scrollTop += (view.top + point.y * factor) - (box.top + box.height / 2);
  }

  /* The steps zoom in and out walk through: a twelfth bigger each time, counted away from 100%
   * so that 100 — and 25, 50, 200, 400 with it — land exactly on a step. A click is a nudge
   * rather than a jump, and the way back down passes through the same numbers. */
  const ZOOM_RATIO = 1.08;
  const ZOOM_STOPS = (() => {
    const stops = [];
    for (let n = -18; n <= 18; n += 1) {
      const stop = Math.round(100 * Math.pow(ZOOM_RATIO, n));
      if (stop >= 25 && stop <= 400 && stops[stops.length - 1] !== stop) stops.push(stop);
    }
    return stops;
  })();
  const ZOOM_MIN = ZOOM_STOPS[0];
  const ZOOM_MAX = ZOOM_STOPS[ZOOM_STOPS.length - 1];

  function zoomStep(direction) {
    const now = settings.zoom;
    if (direction > 0) {
      const next = ZOOM_STOPS.find((stop) => stop > now + 0.5);
      return setZoom(next === undefined ? ZOOM_MAX : next);
    }
    const below = ZOOM_STOPS.filter((stop) => stop < now - 0.5);
    return setZoom(below.length ? below[below.length - 1] : ZOOM_MIN);
  }

  /* The wheel zooms by however far it was turned: a mouse notch comes in at about 100 and moves
   * one step, while a trackpad sends a stream of small amounts and glides. */
  function zoomByWheel(delta) {
    const now = settings.zoom;
    const next = now * Math.pow(ZOOM_RATIO, -delta / 100);
    const rounded = Math.round(next);
    // never let a small turn round away to nothing
    if (rounded === now && delta !== 0) return setZoom(now + (delta < 0 ? 1 : -1));
    return setZoom(rounded);
  }

  function setZoom(value) {
    // zooming keeps whatever sits in the middle of the stage in the middle
    const anchor = stageCenterPoint();
    settings.zoom = clamp(value, ZOOM_MIN, ZOOM_MAX);
    saveSettings();
    applyVisual();
    const label = $("zoomValue");
    if (label) label.textContent = settings.zoom + "%";
    renderOverlay();
    renderStatus();
    keepCentered(anchor);
    return settings.zoom;
  }

  function setFont(family, size, style) {
    settings.fontFamily = family || settings.fontFamily;
    settings.fontSize = clamp(size == null ? settings.fontSize : size, 6, 400);
    settings.fontStyle = style || settings.fontStyle;
    saveSettings();
    applyVisual();
    return { family: settings.fontFamily, size: settings.fontSize, style: settings.fontStyle };
  }

  function setTool(id) {
    if (!Paint.TOOLS.some((tool) => tool.id === id)) return settings.tool;
    settings.tool = id;
    band = null;
    saveSettings();
    renderBoard();
    renderLeft();
    renderStatus();
    return settings.tool;
  }

  function setColor(color) {
    settings.color = color;
    saveSettings();
    renderLeft();
    renderStatus();
    return settings.color;
  }

  function setStrokeWidth(value) {
    settings.strokeWidth = clamp(value, 1, 96);
    saveSettings();
    renderLeft();
    return settings.strokeWidth;
  }

  async function setBackgroundBlob(blob, name) {
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = URL.createObjectURL(blob);
    settings.backgroundName = name || "";
    settings.backgroundBytes = blob.size;
    document.documentElement.style.setProperty("--workspace-image", 'url("' + bgObjectUrl + '")');
    document.documentElement.style.setProperty("--workspace-image-opacity", String(settings.backgroundOpacity / 100));
    saveSettings();
    try { await idbPut("background", blob); }
    catch (error) { showError(error); }
    return settings.backgroundName;
  }

  async function clearBackground() {
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = "";
    settings.backgroundName = "";
    settings.backgroundBytes = 0;
    document.documentElement.style.setProperty("--workspace-image", "none");
    saveSettings();
    try { await idbDelete("background"); } catch (error) { /* already empty */ }
  }

  function toDocPoint(clientX, clientY) {
    const board = $("board");
    const rect = board.getBoundingClientRect();
    const factor = scale();
    return {
      x: (clientX - rect.left) / factor,
      y: (clientY - rect.top) / factor,
    };
  }

  function shapeDefaults() {
    return {
      color: settings.color,
      fill: settings.fillColor || "",
      width: settings.strokeWidth,
      opacity: settings.shapeOpacity,
    };
  }

  function beginDraw(x, y) {
    const doc = current();
    if (!doc) return null;
    pointer = { x: x, y: y };
    const tool = settings.tool;
    if (tool === "picker") {
      setColor(Paint.pickAt(doc, x, y));
      return null;
    }
    if (tool === "fill") {
      pushUndo();
      const result = Paint.fillAt(doc, x, y, settings.color);
      markDirty();
      renderBoard();
      renderLeft();
      renderRight();
      renderStatus();
      renderTabs();
      return result;
    }
    if (tool === "text") {
      pushUndo();
      const shape = Paint.addShape(doc, Object.assign(shapeDefaults(), {
        kind: "text",
        x: x,
        y: y,
        w: 0,
        h: 0,
        fill: "",
        text: settings.language === "en" ? "Text" : "글자",
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        fontStyle: settings.fontStyle,
      }));
      selected = [shape.id];
      markDirty();
      renderBoard();
      renderLeft();
      renderRight();
      renderStatus();
      renderTabs();
      return shape;
    }
    const marquee = (Paint.TOOLS.find((item) => item.id === tool) || {}).region;
    if (marquee) {
      region = Paint.makeRegion(marquee, x, y);
      regionDrag = true;
      selected = [];
      renderOverlay();
      renderStatus();
      return region;
    }
    if (tool === "select") {
      const hit = Paint.hitTest(doc, x, y);
      selected = hit ? [hit.id] : [];
      if (hit) {
        pushUndo();
        dragState = { id: hit.id, ids: selected.slice(), lastX: x, lastY: y, moved: false };
      } else {
        // nothing under the pointer, so the drag draws a box around what to pick
        band = { x: x, y: y, w: 0, h: 0 };
      }
      renderOverlay();
      renderLeft();
      renderRight();
      renderStatus();
      return hit;
    }
    const kind = (Paint.TOOLS.find((item) => item.id === tool) || {}).kind;
    if (!kind) return null;
    if (Paint.isStroke(kind)) {
      draft = Paint.makeShape(kind, Object.assign(shapeDefaults(), { points: [{ x: x, y: y }] }));
    } else {
      draft = Paint.makeShape(kind, Object.assign(shapeDefaults(), { x: x, y: y, w: 0, h: 0 }));
    }
    renderBoard();
    return draft;
  }

  function moveDraw(x, y) {
    pointer = { x: x, y: y };
    probeAt(x, y);
    const doc = current();
    if (dragState) {
      const dx = x - dragState.lastX;
      const dy = y - dragState.lastY;
      dragState.lastX = x;
      dragState.lastY = y;
      dragState.moved = true;
      doc.shapes.forEach((shape) => {
        if (dragState.ids.indexOf(shape.id) >= 0) Paint.moveShape(shape, dx, dy);
      });
      markDirty();
      renderBoard();
      renderRight();
      renderStatus();
      return dragState;
    }
    if (band) {
      band.w = x - band.x;
      band.h = y - band.y;
      renderOverlay();
      renderStatus();
      return band;
    }
    if (regionDrag && region && !draft) {
      Paint.growRegion(region, x, y);
      renderOverlay();
      renderStatus();
      return region;
    }
    if (!draft) {
      renderStatus();
      return null;
    }
    if (Paint.isStroke(draft.kind)) draft.points.push({ x: x, y: y });
    else {
      draft.w = x - draft.x;
      draft.h = y - draft.y;
    }
    renderBoard();
    renderStatus();
    return draft;
  }

  function endDraw(x, y) {
    const doc = current();
    if (band) {
      if (x != null && y != null) {
        band.w = x - band.x;
        band.h = y - band.y;
      }
      const box = Paint.normalizeRect(band);
      band = null;
      if (box.w >= 2 || box.h >= 2) {
        selected = doc.shapes.filter((shape) => Paint.boxesOverlap(Paint.bounds(shape), box)).map((shape) => shape.id);
      }
      renderOverlay();
      renderLeft();
      renderRight();
      renderStatus();
      return selected.slice();
    }
    if (dragState) {
      const state = dragState;
      dragState = null;
      if (!state.moved) {
        undoStack.pop();
        updateHistoryButtons();
      }
      renderTabs();
      renderAll();
      return state;
    }
    if (regionDrag && region && !draft) {
      if (x != null && y != null) Paint.growRegion(region, x, y);
      regionDrag = false;
      const box = Paint.regionBounds(region);
      if (box.w < 2 && box.h < 2) region = null;
      renderOverlay();
      renderRight();
      renderStatus();
      return region;
    }
    if (!draft) return null;
    if (x != null && y != null) moveDraw(x, y);
    const shape = draft;
    draft = null;
    const box = Paint.bounds(shape);
    if (!Paint.isStroke(shape.kind) && box.w < 1 && box.h < 1) {
      renderBoard();
      return null;
    }
    pushUndo();
    const added = Paint.addShape(doc, shape);
    selected = [added.id];
    markDirty();
    renderAll();
    return added;
  }

  /* Is a press that started on the board still being dragged? Drawing tools have a draft
   * shape and moving shapes has a drag state, but picking an area and the select tool's box
   * have neither — without them the pointer handlers would drop the drag on the floor. */
  function boardDragging() {
    return Boolean(draft || dragState || band || regionDrag);
  }

  function regionCanvas() {
    const doc = current();
    if (!doc || !region) return null;
    const box = Paint.regionBounds(region);
    if (box.w < 1 || box.h < 1) return null;
    const source = renderCanvas(doc);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(box.w));
    out.height = Math.max(1, Math.round(box.h));
    const ctx = out.getContext("2d");
    ctx.save();
    ctx.translate(-box.x, -box.y);
    Paint.clipRegion(ctx, region);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
    return { canvas: out, box: box };
  }

  function replaceWithCanvas(doc, canvas) {
    images[frameKey(doc)] = canvas;
    doc.width = canvas.width;
    doc.height = canvas.height;
    doc.shapes = [Paint.makeShape("image", { src: frameKey(doc), x: 0, y: 0, w: canvas.width, h: canvas.height, width: 1 })];
  }

  function cropToRegion() {
    const doc = current();
    const cut = regionCanvas();
    if (!cut) return null;
    pushUndo();
    replaceWithCanvas(doc, cut.canvas);
    const source = sourceOf(doc);
    if (source) {
      source.pages = 1;
      source.page = 0;
      source.bytes = null;
    }
    region = null;
    regionDrag = false;
    selected = [];
    markDirty();
    renderAll();
    return { width: doc.width, height: doc.height };
  }

  function eraseRegion() {
    const doc = current();
    if (!doc || !region) return null;
    const source = renderCanvas(doc);
    const ctx = source.getContext("2d");
    ctx.save();
    Paint.clipRegion(ctx, region);
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.restore();
    pushUndo();
    replaceWithCanvas(doc, source);
    region = null;
    regionDrag = false;
    markDirty();
    renderAll();
    return { width: doc.width, height: doc.height };
  }

  /* What was copied, as a picture, so the system clipboard can carry it to another program:
   * the picked area with everything outside it transparent, or the smallest rectangle around
   * the selected shapes, cut out of the drawing as it looks. */
  function clipboardCanvas() {
    const doc = current();
    if (!doc) return null;
    if (region) {
      const cut = regionCanvas();
      return cut ? cut.canvas : null;
    }
    const shapes = selectedShapes();
    if (!shapes.length) return null;
    let box = null;
    shapes.forEach((shape) => {
      const b = Paint.bounds(shape);
      box = box ? {
        x: Math.min(box.x, b.x), y: Math.min(box.y, b.y),
        r: Math.max(box.r, b.x + b.w), b: Math.max(box.b, b.y + b.h),
      } : { x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h };
    });
    const x = Math.max(0, Math.floor(box.x));
    const y = Math.max(0, Math.floor(box.y));
    const w = Math.min(doc.width - x, Math.ceil(box.r - x));
    const h = Math.min(doc.height - y, Math.ceil(box.b - y));
    if (w < 1 || h < 1) return null;
    const source = renderCanvas(doc);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d").drawImage(source, -x, -y);
    return out;
  }

  /* Hand a picture to the system clipboard. Electron passes it to the OS, and in a browser the
   * async clipboard API does it where the page is allowed to. Nothing is written as text: the
   * shapes MyPaint keeps for its own paste would be gibberish in another program. */
  function toSystemClipboard(canvas) {
    if (!canvas) return Promise.resolve(false);
    lastSystemCopy = { width: canvas.width, height: canvas.height, type: "image/png", done: false };
    const dataUrl = canvas.toDataURL("image/png");
    const browserWrite = () => new Promise((resolve) => {
      if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem !== "function" || !canvas.toBlob) {
        resolve(false);
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) { resolve(false); return; }
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => resolve(true)).catch(() => resolve(false));
      }, "image/png");
    });
    const finish = (done) => { lastSystemCopy.done = Boolean(done); return lastSystemCopy.done; };
    if (window.desktop && window.desktop.clipboardWriteImage) {
      return Promise.resolve(window.desktop.clipboardWriteImage(dataUrl))
        .then((done) => (done ? finish(true) : browserWrite().then(finish)))
        .catch(() => browserWrite().then(finish));
    }
    return browserWrite().then(finish);
  }

  function copyRegion() {
    const cut = regionCanvas();
    if (!cut) return "";
    clipboard = JSON.stringify([Paint.makeShape("image", {
      src: cut.canvas.toDataURL("image/png"),
      x: Math.round(cut.box.x),
      y: Math.round(cut.box.y),
      w: cut.canvas.width,
      h: cut.canvas.height,
      width: 1,
    })]);
    toSystemClipboard(cut.canvas);
    return clipboard;
  }

  function clearRegion() {
    region = null;
    regionDrag = false;
    renderOverlay();
    renderRight();
    renderStatus();
    return null;
  }

  function deleteSelection() {
    const doc = current();
    if (!doc || !selected.length) return 0;
    pushUndo();
    let removed = 0;
    selected.forEach((id) => { removed += Paint.removeShape(doc, id); });
    selected = [];
    markDirty();
    renderAll();
    return removed;
  }

  function doCopy() {
    if (region) return copyRegion();
    const shapes = selectedShapes();
    if (!shapes.length) return "";
    clipboard = JSON.stringify(shapes);
    toSystemClipboard(clipboardCanvas());
    return clipboard;
  }

  function doCut() {
    const text = doCopy();
    if (!text) return "";
    if (region) eraseRegion();
    else deleteSelection();
    return text;
  }

  function doPaste() {
    if (!clipboard) return [];
    const doc = current();
    let payload;
    try { payload = JSON.parse(clipboard); }
    catch (error) { return []; }
    const list = Array.isArray(payload) ? payload : [payload];
    pushUndo();
    list.forEach((item) => {
      if (item.kind === "image" && String(item.src).indexOf("data:") === 0 && !images[item.src]) {
        const picture = new Image();
        picture.src = item.src;
        picture.decode().then(() => { images[item.src] = picture; renderBoard(); }).catch(() => {});
      }
    });
    const added = list.map((item) => {
      const shape = Paint.cloneShape(item);
      shape.id = undefined;
      const clean = Paint.normalizeShape(shape);
      Paint.moveShape(clean, 16, 16);
      return Paint.addShape(doc, clean);
    });
    selected = added.map((shape) => shape.id);
    markDirty();
    renderAll();
    return added;
  }

  function doSelectAll() {
    const doc = current();
    selected = doc ? doc.shapes.map((shape) => shape.id) : [];
    renderOverlay();
    renderLeft();
    renderRight();
    renderStatus();
    return selected.slice();
  }

  function doDeselect() {
    selected = [];
    region = null;
    regionDrag = false;
    band = null;
    renderOverlay();
    renderLeft();
    renderRight();
    renderStatus();
    return selected;
  }

  function doUndo() {
    if (!undoStack.length) return false;
    redoStack.push(capture());
    restore(undoStack.pop());
    updateHistoryButtons();
    persistSession();
    return true;
  }

  function doRedo() {
    if (!redoStack.length) return false;
    undoStack.push(capture());
    restore(redoStack.pop());
    updateHistoryButtons();
    persistSession();
    return true;
  }

  function moveSelectedLayer(delta) {
    const doc = current();
    const shape = firstSelected();
    if (!doc || !shape) return -1;
    pushUndo();
    const index = Paint.moveLayer(doc, shape.id, delta);
    markDirty();
    renderAll();
    return index;
  }

  function clearDrawing() {
    const doc = current();
    if (!doc) return 0;
    pushUndo();
    Paint.clearDoc(doc);
    selected = [];
    markDirty();
    renderAll();
    return doc.shapes.length;
  }

  function applyCanvas(fields) {
    const doc = current();
    if (!doc) return null;
    pushUndo();
    doc.width = clamp(fields.width, 16, 8192);
    doc.height = clamp(fields.height, 16, 8192);
    if (fields.background) doc.background = fields.background;
    markDirty();
    renderAll();
    return { width: doc.width, height: doc.height, background: doc.background };
  }

  function closeTab(index) {
    const doc = docs[index];
    if (!doc) return docs.length;
    if (doc.dirty) {
      pendingClose = index;
      openPopup("unsaved");
      return docs.length;
    }
    return dropTab(index);
  }

  function dropTab(index) {
    const doc = docs[index];
    if (!doc) return docs.length;
    if (dicomOf(doc)) stopCine();
    extras.delete(doc.id);
    delete images[frameKey(doc)];
    docs.splice(index, 1);
    if (!docs.length) docs.push(newDoc());
    active = Math.max(0, Math.min(docs.length - 1, index > active ? active : active - (index < active ? 1 : 0)));
    if (index === active && active >= docs.length) active = docs.length - 1;
    selected = [];
    pendingClose = -1;
    renderAll();
    persistSession();
    return docs.length;
  }

  function addDoc(doc, remember) {
    docs.push(doc);
    active = docs.length - 1;
    selected = [];
    if (remember) rememberDoc(doc);
    renderAll();
    persistSession();
    return doc;
  }

  function rememberDoc(doc) {
    const entry = {
      id: doc.path || doc.name,
      name: doc.name,
      path: doc.path || doc.name,
    };
    // A picture keeps its pixels in the file it came from, so only the path is remembered.
    if (!sourceOf(doc)) {
      entry.payload = {
        name: doc.name,
        width: doc.width,
        height: doc.height,
        background: doc.background,
        shapes: doc.shapes,
      };
    }
    Store.addRecent(settings, entry);
    saveSettings();
  }

  function openRecent(id) {
    const row = (settings.recent || []).find((item) => item.id === id);
    if (!row) return null;
    if (!row.payload && row.path && Formats.isSupported(row.path) && window.desktop && window.desktop.readBinary && !TEST) {
      return ingestPaths([row.path]);
    }
    const doc = Paint.createDoc(row.payload || { name: row.name });
    doc.path = row.path;
    Store.rememberDirectory(settings, "open", row.path);
    saveSettings();
    return addDoc(doc, false);
  }

  async function imageFromSource(src) {
    if (images[src]) return images[src];
    const image = new Image();
    image.src = src;
    await image.decode();
    images[src] = image;
    return image;
  }

  async function placeImage(dataUrl, name) {
    const doc = current();
    const image = await imageFromSource(dataUrl);
    const factor = Math.min(1, doc.width / image.width, doc.height / image.height);
    pushUndo();
    const shape = Paint.addShape(doc, Paint.makeShape("image", {
      src: dataUrl,
      x: 0,
      y: 0,
      w: Math.round(image.width * factor),
      h: Math.round(image.height * factor),
      width: 1,
    }));
    selected = [shape.id];
    markDirty();
    renderAll();
    Store.rememberDirectory(settings, "open", "drop/" + (name || "image"));
    saveSettings();
    return shape;
  }

  function openDrawingText(text, name, path) {
    const parsed = Paint.parse(text);
    const first = parsed.documents[0];
    first.name = name || first.name;
    first.path = path || "";
    parsed.documents.slice(1).forEach((doc) => docs.push(doc));
    addDoc(first, Boolean(path));
    return parsed.documents.length;
  }

  async function saveCurrent(forceDialog) {
    const doc = current();
    if (!doc) return null;
    if (forceDialog || !doc.path) {
      if (TEST && !forceDialog) return finishSave(doc, doc.name, "mpaint");
      if (window.desktop && window.desktop.pickSave && !TEST) {
        const file = await window.desktop.pickSave(doc.path || doc.name);
        if (!file) return null;
        return finishSave(doc, file, /\.png$/i.test(file) ? "png" : "mpaint");
      }
      openPopup("save");
      return null;
    }
    return finishSave(doc, doc.path, /\.png$/i.test(doc.path) ? "png" : "mpaint");
  }

  function canvasDataUrl(doc) {
    const canvas = document.createElement("canvas");
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext("2d");
    Paint.render(ctx, doc, { images: images });
    return canvas.toDataURL("image/png");
  }

  function flattenFrames(doc) {
    // A picture frame lives in the image cache under a key, so saving writes the pixels out.
    const copy = Paint.createDoc(doc);
    copy.shapes = doc.shapes.map((shape) => {
      if (shape.kind !== "image" || String(shape.src).indexOf("frame:") !== 0) return shape;
      const canvas = images[shape.src];
      const clone = Paint.cloneShape(shape);
      clone.src = canvas ? canvas.toDataURL("image/png") : "";
      return clone;
    });
    return copy;
  }

  async function finishSave(doc, filePath, format) {
    if (format === "png") return exportPng(doc, filePath);
    const payload = Paint.serialize([flattenFrames(doc)]);
    await withProgress(t("progress.saving"), payload.length, async (report) => {
      await report(40);
      lastSaved = { path: filePath, text: payload, bytes: payload.length, format: "mpaint" };
      await report(80);
    });
    doc.path = filePath;
    doc.name = String(filePath).split(/[/\\]/).pop() || doc.name;
    doc.dirty = false;
    Store.rememberDirectory(settings, "save", filePath);
    rememberDoc(doc);
    renderAll();
    if (window.desktop && window.desktop.writeFile && !TEST) await window.desktop.writeFile(filePath, payload);
    else if (!TEST) downloadBlob(doc.name, new Blob([payload], { type: "application/vnd.mypaint.drawing" }));
    return lastSaved;
  }

  async function exportPng(doc, filePath) {
    const target = doc || current();
    const path = filePath || (target.name.replace(/\.[^.]+$/, "") + ".png");
    const url = canvasDataUrl(target);
    const base64 = url.slice(url.indexOf(",") + 1);
    await withProgress(t("progress.exporting"), base64.length, async (report) => {
      await report(45);
      lastExport = { path: path, bytes: base64.length, format: "png" };
      await report(90);
    });
    Store.rememberDirectory(settings, "save", path);
    saveSettings();
    if (window.desktop && window.desktop.writeBinary && !TEST) await window.desktop.writeBinary(path, base64);
    else if (!TEST) downloadBlob(path.split(/[/\\]/).pop(), await (await fetch(url)).blob());
    renderStatus();
    return lastExport;
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadSample() {
    const text = Paint.serialize([Paint.createDoc(Sample.welcome), Paint.createDoc(Sample.shapes)]);
    const blob = new Blob([text], { type: "application/vnd.mypaint.drawing" });
    await withProgress(t("progress.downloading"), Math.max(blob.size, metrics.PROGRESS_BYTES), async (report) => {
      await report(25);
      await report(70);
      lastDownload = { name: "sample.mpaint", text: text, bytes: blob.size };
    });
    if (!TEST) downloadBlob("sample.mpaint", blob);
    return lastDownload;
  }

  async function openLink(url) {
    await withProgress(t("progress.link"), metrics.PROGRESS_BYTES, async (report) => {
      await report(30);
      lastLink = url;
      await report(90);
    });
    if (window.desktop && window.desktop.openExternal && !TEST) window.desktop.openExternal(url);
    else if (!TEST) window.open(url, "_blank", "noopener");
    return lastLink;
  }

  function printDocument(pages) {
    const paper = Print.paperSize(printState.paper, printState.orientation);
    const margin = printMargins();
    const areaWidth = Math.max(1, paper.width - margin.left - margin.right);
    const areaHeight = Math.max(1, paper.height - margin.top - margin.bottom);
    const place = printState.align === "top" ? "flex-start" : printState.align === "bottom" ? "flex-end" : "center";
    const body = pages.map((page) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(page.source.w));
      canvas.height = Math.max(1, Math.round(page.source.h));
      const ctx = canvas.getContext("2d");
      if (printState.printBackground !== false) {
        ctx.fillStyle = page.doc.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.save();
      ctx.translate(-page.source.x, -page.source.y);
      page.doc.shapes.forEach((shape) => Paint.drawShape(ctx, shape, page.doc, images));
      ctx.restore();
      const naturalWidth = page.source.w / Print.MM_TO_PX;
      const naturalHeight = page.source.h / Print.MM_TO_PX;
      const fit = printScale(naturalWidth, naturalHeight, areaWidth, areaHeight);
      const style = "width:" + (naturalWidth * fit).toFixed(2) + "mm;height:" + (naturalHeight * fit).toFixed(2) + "mm";
      return '<section><img style="' + style + '" src="' + canvas.toDataURL("image/png") + '" alt="' + esc(page.name) + '"></section>';
    }).join("");
    const style = "@page { size: " + paper.width + "mm " + paper.height + "mm; margin: " +
      margin.top + "mm " + margin.right + "mm " + margin.bottom + "mm " + margin.left + "mm; }" +
      "body { margin: 0; }" +
      "section { page-break-after: always; height: " + areaHeight + "mm; display: flex; align-items: " + place + "; justify-content: center; }" +
      "section:last-child { page-break-after: auto; }" +
      "img { display: block; }";
    const frame = $("printFrame");
    const doc = frame.contentDocument;
    doc.open();
    doc.write("<!DOCTYPE html><html><head><title>" + esc(BUILD.title) + "</title><style>" + style + "</style></head><body>" + body + "</body></html>");
    doc.close();
    const options = { copies: Math.max(1, Number(printState.copies) || 1), landscape: printState.orientation === "landscape" };
    if (window.desktop && window.desktop.print) window.desktop.print(options);
    else frame.contentWindow.print();
  }

  async function fileBytes(file) {
    if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
    return new Uint8Array(0);
  }

  async function readFileEntry(file) {
    const size = file.size || String(file.text || "").length;
    const named = Formats.kindOf(file.name, null);
    if (named === "" && /\.mpaint$/i.test(file.name)) {
      const text = typeof file.text === "function" ? await file.text() : String(file.text || "");
      return { kind: "drawing", name: file.name, text: text };
    }
    return withProgress(t("progress.opening"), size, async (report) => {
      await report(20);
      const bytes = await fileBytes(file);
      const kind = named || Formats.kindOf(file.name, bytes);
      await report(60);
      if (kind) return { kind: "picture", format: kind, name: file.name, bytes: bytes };
      const text = typeof file.text === "function" ? await file.text() : new TextDecoder().decode(bytes);
      await report(85);
      return { kind: "drawing", name: file.name, text: text };
    });
  }

  async function handleDroppedFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return null;
    for (const file of list) {
      const entry = await readFileEntry(file);
      if (entry.kind === "picture") {
        pendingDrop = entry;
        openPopup("drop");
        continue;
      }
      if (Paint.looksLikeDrawing(entry.text)) {
        openDrawingText(entry.text, entry.name, "");
        Store.rememberDirectory(settings, "open", "drop/" + entry.name);
        saveSettings();
        continue;
      }
      throw new Error("The file " + entry.name + " is not a MyPaint drawing or a picture MyPaint can read.");
    }
    return pendingDrop;
  }

  async function applyDropRole(role) {
    if (!pendingDrop) return null;
    const entry = pendingDrop;
    pendingDrop = null;
    const bytes = entry.bytes || new Uint8Array(0);
    if (role === "background") {
      const result = await decodeBytes(bytes, entry.name, { kind: entry.format });
      const blob = await (await fetch(Formats.toDataUrl(result))).blob();
      return setBackgroundBlob(blob, entry.name);
    }
    if (role === "image") {
      const result = await decodeBytes(bytes, entry.name, { kind: entry.format });
      const doc = current();
      const url = Formats.toDataUrl(result);
      Store.rememberDirectory(settings, "open", "drop/" + entry.name);
      saveSettings();
      return placeImage(url, entry.name);
    }
    const doc = await openPicture(bytes, entry.name, "");
    Store.rememberDirectory(settings, "open", "drop/" + entry.name);
    saveSettings();
    return doc;
  }

  function requestClose() {
    if (docs.some((doc) => doc.dirty)) {
      openPopup("unsaved");
      return "ask";
    }
    closeApplication();
    return "closed";
  }

  function closeApplication(code) {
    appClosed = true;
    stopCine();
    closeMenu();
    closePopup();
    if (window.desktop && window.desktop.forceClose) window.desktop.forceClose(code || 0);
  }

  /* ── pictures that come from a file ──
   * Every document made from a picture keeps its decoded frame in the image cache and its
   * reader details in `extras`, which stays out of the saved drawing and out of the undo
   * snapshots. A DICOM document also keeps the decoder, so its window, frame, colour map
   * and measurements stay live. */

  function extrasOf(doc) {
    if (!doc) return {};
    let item = extras.get(doc.id);
    if (!item) {
      item = {};
      extras.set(doc.id, item);
    }
    return item;
  }

  function sourceOf(doc) {
    return extrasOf(doc || current()).source || null;
  }

  function dicomOf(doc) {
    return extrasOf(doc || current()).dicom || null;
  }

  function frameKey(doc) {
    return "frame:" + doc.id;
  }

  function renderCanvas(doc) {
    const canvas = document.createElement("canvas");
    canvas.width = doc.width;
    canvas.height = doc.height;
    Paint.render(canvas.getContext("2d"), doc, { images: images });
    return canvas;
  }

  function canvasPixels(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  function pictureDoc(result, name, path) {
    const doc = Paint.createDoc({
      name: name,
      path: path || "",
      width: result.width,
      height: result.height,
      background: "#ffffff",
    });
    images[frameKey(doc)] = Formats.toCanvas(result);
    Paint.addShape(doc, Paint.makeShape("image", {
      src: frameKey(doc), x: 0, y: 0, w: result.width, h: result.height, width: 1,
    }));
    doc.dirty = false;
    const item = extrasOf(doc);
    item.source = {
      kind: result.kind,
      name: name,
      pages: result.pages || 1,
      page: result.page || 0,
      exifText: result.exifText || "",
      exif: result.exif || {},
      bytes: result.bytes || null,
    };
    if (result.dicom) item.dicom = result.dicom;
    return doc;
  }

  async function decodeBytes(bytes, name, options) {
    const result = await withProgress(t("progress.opening"), bytes.length, async (report) => {
      await report(25);
      const out = await Formats.decode(bytes, name, options || {});
      await report(85);
      return out;
    });
    result.bytes = bytes;
    return result;
  }

  function base64ToBytes(base64) {
    const binary = atob(String(base64 || ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function sizeLabel(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  }

  function downloadLabel(received, total) {
    const base = t("progress.downloading");
    if (!received) return base;
    if (total) return base + "  " + sizeLabel(received) + " / " + sizeLabel(total);
    return base + "  " + sizeLabel(received);
  }

  /* How far a download has got. With a known length it is the real share; without one the bar
   * creeps up so it still shows that something is happening. */
  function downloadPercent(received, total) {
    if (total > 0) return clamp(Math.round((received / total) * 100), 0, 100);
    return clamp(Math.round((received / (received + 2 * 1024 * 1024)) * 100), 0, 95);
  }

  /* In the desktop build the download runs in the main process, which no cross-origin rule
   * applies to. In a browser it is an ordinary fetch, so the site has to allow it. */
  async function fetchPicture(link, onProgress) {
    const clean = String(link || "").trim();
    if (!clean) throw new Error("Type the address of a picture first.");
    if (window.desktop && window.desktop.downloadUrl && !TEST) {
      downloadWatcher = onProgress;
      try {
        const payload = await window.desktop.downloadUrl(clean);
        return { name: payload.name, bytes: base64ToBytes(payload.base64), url: payload.url, type: payload.type };
      } finally {
        downloadWatcher = null;
      }
    }
    let target;
    try {
      target = new URL(clean, location.href);
    } catch (error) {
      throw new Error("That is not a web address.");
    }
    downloadStop = new AbortController();
    const stop = downloadStop;
    const response = await fetch(target.href, { signal: stop.signal }).catch((error) => {
      if (stop.signal.aborted) throw new Error("The download was stopped.");
      throw error;
    });
    if (!response.ok) throw new Error("The server answered " + response.status + ".");
    const total = Number(response.headers.get("content-length") || 0);
    const chunks = [];
    let received = 0;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      for (;;) {
        if (stop.signal.aborted) throw new Error("The download was stopped.");
        const step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        received += step.value.length;
        if (onProgress) await onProgress(received, total);
      }
    } else {
      const whole = new Uint8Array(await response.arrayBuffer());
      chunks.push(whole);
      received = whole.length;
      if (onProgress) await onProgress(received, total);
    }
    downloadStop = null;
    const bytes = new Uint8Array(received);
    let at = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, at); at += chunk.length; });
    if (!bytes.length) throw new Error("The address gave back an empty file.");
    const last = decodeURIComponent(target.pathname.split("/").filter(Boolean).pop() || "");
    return { name: last || "download", bytes: bytes, url: target.href, type: response.headers.get("content-type") || "" };
  }

  async function openFromUrl(link) {
    beginProgress(t("progress.downloading"));
    let payload;
    try {
      payload = await fetchPicture(link, async (received, total) => {
        progressMarks.push(downloadPercent(received, total));
        paintProgress(downloadLabel(received, total), downloadPercent(received, total));
        await delay(0);
      });
      await stepProgress(100, downloadLabel(payload.bytes.length, payload.bytes.length));
    } finally {
      endProgress();
    }
    if (!Formats.kindOf(payload.name, payload.bytes)) {
      throw new Error("What came back from " + payload.url + " is not a picture MyPaint can read.");
    }
    const doc = await openPicture(payload.bytes, payload.name, "");
    lastDownload = { name: payload.name, url: payload.url, bytes: payload.bytes.length };
    Store.addRecent(settings, { id: payload.url, name: payload.name, path: payload.url });
    Store.rememberDirectory(settings, "open", payload.url);
    saveSettings();
    renderAll();
    return doc;
  }

  async function openPicture(bytes, name, path) {
    const result = await decodeBytes(bytes, name);
    const doc = pictureDoc(result, name, path);
    docs.push(doc);
    active = docs.length - 1;
    selected = [];
    if (path) rememberDoc(doc);
    renderAll();
    return doc;
  }

  async function showPage(page) {
    const doc = current();
    const source = sourceOf(doc);
    if (!source || !source.bytes || source.pages < 2) return null;
    const result = await decodeBytes(source.bytes, source.name, { kind: source.kind, page: page });
    images[frameKey(doc)] = Formats.toCanvas(result);
    doc.width = result.width;
    doc.height = result.height;
    doc.shapes = [Paint.makeShape("image", { src: frameKey(doc), x: 0, y: 0, w: result.width, h: result.height, width: 1 })];
    source.page = result.page;
    renderAll();
    return source.page;
  }

  /* ── DICOM ── */

  async function renderDicom(options) {
    const doc = current();
    const image = dicomOf(doc);
    if (!image) return null;
    const render = await image.render(options || {});
    images[frameKey(doc)] = Formats.toCanvas({ width: render.width, height: render.height, rgba: render.rgba });
    const source = sourceOf(doc);
    if (source) source.page = render.state.frame;
    renderBoard();
    renderRight();
    renderStatus();
    return render.state;
  }

  function stopCine() {
    if (!cineTimer) return false;
    clearInterval(cineTimer);
    cineTimer = null;
    return true;
  }

  function toggleCine() {
    const image = dicomOf();
    if (!image || image.frames < 2) return false;
    if (stopCine()) {
      renderRight();
      return false;
    }
    const fps = image.frameRate || metrics.CINE_FPS;
    cineTimer = setInterval(() => {
      const playing = dicomOf();
      if (!playing) {
        stopCine();
        return;
      }
      renderDicom({ frame: (playing.state.frame + 1) % playing.frames }).catch(showError);
    }, Math.max(40, Math.round(1000 / fps)));
    renderRight();
    return true;
  }

  function dicomPresets(image) {
    const rows = [{ id: "file", label: t("dicom.preset.file") }, { id: "auto", label: t("dicom.preset.auto") }];
    (image.presets || []).forEach((preset) => {
      rows.push({ id: preset.id, label: t("dicom.preset." + preset.id), wc: preset.wc, ww: preset.ww });
    });
    return rows;
  }

  function applyPreset(id) {
    const image = dicomOf();
    if (!image) return null;
    extrasOf(current()).preset = id;
    if (id === "file") return renderDicom({ resetWindow: true });
    if (id === "auto") {
      const range = image.range || { min: 0, max: 255 };
      return renderDicom({ wc: (range.min + range.max) / 2, ww: Math.max(1, range.max - range.min) });
    }
    const preset = (image.presets || []).find((item) => item.id === id);
    if (!preset) return null;
    return renderDicom({ wc: preset.wc, ww: preset.ww });
  }

  function measurementOf(shape) {
    const image = dicomOf();
    if (!image || !shape) return null;
    const spacing = image.geometry && image.geometry.pixelSpacing;
    if (shape.kind === "line") {
      const px = Math.hypot(shape.w, shape.h);
      const mm = spacing ? Math.hypot(shape.w * spacing[1], shape.h * spacing[0]) : 0;
      return { kind: "length", px: px, mm: mm };
    }
    if (shape.kind === "rect" || shape.kind === "ellipse") {
      const box = Paint.normalizeRect(shape);
      const stats = image.stats({ x: box.x, y: box.y, w: box.w, h: box.h, shape: shape.kind === "ellipse" ? "ellipse" : "rect" });
      return stats ? Object.assign({ kind: "roi" }, stats) : null;
    }
    return null;
  }

  function probeAt(x, y) {
    const image = dicomOf();
    if (!image) {
      lastProbe = null;
      return null;
    }
    try { lastProbe = image.valueAt(Math.round(x), Math.round(y)); }
    catch (error) { lastProbe = null; }
    return lastProbe;
  }

  function dicomTags() {
    const image = dicomOf();
    return image && image.tags ? image.tags : [];
  }

  function tagPages() {
    return Math.max(1, Math.ceil(dicomTags().length / metrics.TAG_ROWS));
  }

  /* ── converting to another format ── */

  async function convertCurrent(format, quality) {
    const doc = current();
    if (!doc) return null;
    const spec = Formats.SAVE_FORMATS.find((item) => item.id === format) || Formats.SAVE_FORMATS[0];
    const canvas = renderCanvas(doc);
    const picture = { width: canvas.width, height: canvas.height, rgba: canvasPixels(canvas), canvas: canvas };
    const out = await withProgress(t("progress.exporting"), canvas.width * canvas.height * 4, async (report) => {
      await report(40);
      const encoded = await Formats.encode(spec.id, picture, { quality: (quality == null ? convertState.quality : quality) / 100 });
      await report(85);
      return encoded;
    });
    const base = (doc.name.replace(/\.[^.]+$/, "") || "image") + "." + out.ext;
    const dir = settings.lastSaveDir;
    const path = dir ? dir.replace(/\\/g, "/").replace(/\/$/, "") + "/" + base : base;
    lastConvert = { path: path, format: spec.id, mime: out.mime, bytes: out.bytes.length, width: canvas.width, height: canvas.height };
    Store.rememberDirectory(settings, "save", path);
    saveSettings();
    if (window.desktop && window.desktop.writeBinary && !TEST) {
      let binary = "";
      out.bytes.forEach((value) => { binary += String.fromCharCode(value); });
      await window.desktop.writeBinary(path, btoa(binary));
    } else if (!TEST) {
      downloadBlob(base, new Blob([out.bytes], { type: out.mime }));
    }
    renderStatus();
    return lastConvert;
  }

  /* Open shows everything MyPaint can read, with the drawing format and the picture families
   * as the groups underneath. */
  function openFilters() {
    const group = (key, names) => ({ name: t(key) + " (" + names.map((name) => "." + name).join(" ").slice(0, 120) + ")", extensions: names });
    const pictures = Formats.listExtensions();
    return [
      { name: t("open.everything"), extensions: ["mpaint"].concat(pictures) },
      { name: t("open.drawing"), extensions: ["mpaint"] },
      group("kind.native", Array.from(Formats.NATIVE).sort()),
      group("kind.tiff", Array.from(Formats.TIFF).sort()),
      group("kind.heif", Array.from(Formats.HEIF).sort()),
      group("kind.j2k", Array.from(Formats.J2K).sort()),
      group("kind.dicom", Array.from(Formats.DICOM).sort()),
      group("kind.raw", Array.from(Formats.RAW).sort()),
      { name: t("open.allFiles"), extensions: ["*"] },
    ];
  }

  function acceptAttribute() {
    return [".mpaint"].concat(Formats.listExtensions().map((name) => "." + name)).join(",");
  }

  /* Picking a file through Open places it straight away; dropping one asks what to do with it. */
  async function handleOpenedFiles(files) {
    const list = Array.from(files || []);
    for (const file of list) {
      const entry = await readFileEntry(file);
      if (entry.kind === "picture") {
        await openPicture(entry.bytes, entry.name, "");
        Store.rememberDirectory(settings, "open", "open/" + entry.name);
        saveSettings();
        continue;
      }
      if (Paint.looksLikeDrawing(entry.text)) {
        openDrawingText(entry.text, entry.name, "");
        Store.rememberDirectory(settings, "open", "open/" + entry.name);
        saveSettings();
        continue;
      }
      throw new Error("The file " + entry.name + " is not a MyPaint drawing or a picture MyPaint can read.");
    }
    return list.length;
  }

  const actions = {
    new: () => addDoc(newDoc(), false),
    open: () => {
      if (TEST) {
        return openDrawingText(Paint.serialize([Paint.createDoc(Sample.shapes)]), "opened.mpaint", "");
      }
      if (window.desktop && window.desktop.pickFiles) {
        return window.desktop.pickFiles(settings.lastOpenDir, openFilters()).then((files) => ingestPaths(files)).catch(showError);
      }
      $("fileOpen").click();
      return null;
    },
    openUrl: () => openPopup("link"),
    openImage: () => {
      if (TEST) return null;
      if (window.desktop && window.desktop.pickFiles) {
        return window.desktop.pickFiles(settings.lastOpenDir, openFilters().slice(2)).then((files) => ingestPaths(files)).catch(showError);
      }
      $("imageOpen").click();
      return null;
    },
    convert: () => openPopup("convert"),
    formats: () => openPopup("formats"),
    dicomInfo: () => {
      tagPage = 0;
      return openPopup("dicom");
    },
    dicomReset: () => renderDicom({ resetWindow: true }),
    dicomInvert: () => {
      const image = dicomOf();
      return image ? renderDicom({ invert: !image.state.invert }) : null;
    },
    dicomCine: () => toggleCine(),
    nextPage: () => {
      const source = sourceOf();
      const image = dicomOf();
      if (image) return renderDicom({ frame: Math.min(image.frames - 1, image.state.frame + 1) });
      return source ? showPage(Math.min(source.pages - 1, source.page + 1)) : null;
    },
    prevPage: () => {
      const source = sourceOf();
      const image = dicomOf();
      if (image) return renderDicom({ frame: Math.max(0, image.state.frame - 1) });
      return source ? showPage(Math.max(0, source.page - 1)) : null;
    },
    save: () => saveCurrent(false),
    saveAs: () => openPopup("save"),
    export: () => openPopup("convert"),
    exportPng: () => exportPng(current(), null),
    undo: () => doUndo(),
    redo: () => doRedo(),
    cut: () => doCut(),
    copy: () => doCopy(),
    paste: () => doPaste(),
    deleteShape: () => deleteSelection(),
    selectAll: () => doSelectAll(),
    deselect: () => doDeselect(),
    strokeDown: () => setStrokeWidth(settings.strokeWidth - 1),
    strokeUp: () => setStrokeWidth(settings.strokeWidth + 1),
    cropRegion: () => cropToRegion(),
    eraseRegion: () => eraseRegion(),
    clearRegion: () => clearRegion(),
    palette: () => openPopup("palette"),
    canvasSize: () => openPopup("canvas"),
    bringForward: () => moveSelectedLayer(1),
    sendBackward: () => moveSelectedLayer(-1),
    clearDrawing: () => clearDrawing(),
    zoomIn: () => zoomStep(1),
    zoomOut: () => zoomStep(-1),
    zoomReset: () => setZoom(100),
    print: () => openPopup("print"),
    settings: () => openPopup("settings"),
    about: () => openPopup("about"),
    language: () => setLanguage(settings.language === "en" ? "ko" : "en"),
    themeCycle: () => setTheme(Themes.next(settings.theme)),
    themeMenu: () => {
      const place = anchorUnder("[data-action='themeMenu']", 0);
      return openThemeMenu(place.x, place.y);
    },
    themeCustom: () => openPopup("theme", anchorUnder("[data-action='themeMenu']", metrics.POPUPS.theme.width)),
    toggleLeft: () => { settings.showLeft = !settings.showLeft; saveSettings(); renderLeft(); return settings.showLeft; },
    toggleRight: () => { settings.showRight = !settings.showRight; saveSettings(); renderRight(); return settings.showRight; },
    download: () => downloadSample(),
    link: () => openLink(GUIDE_URL),
    guide: () => openPopup("guide"),
    recentManager: () => openPopup("recent"),
    clearRecent: () => { Store.clearRecent(settings); saveSettings(); renderMenubar(); return settings.recent; },
    exit: () => requestClose(),
  };

  async function ingestPaths(files) {
    if (!files || !files.length) return null;
    for (const file of files) {
      const name = String(file).split(/[/\\]/).pop();
      if (/\.mpaint$/i.test(file)) {
        const text = await window.desktop.readFile(file);
        openDrawingText(text, name, file);
        Store.rememberDirectory(settings, "open", file);
        saveSettings();
        continue;
      }
      const base64 = await window.desktop.readBinary(file);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      await openPicture(bytes, name, file);
      Store.rememberDirectory(settings, "open", file);
      saveSettings();
    }
    return files.length;
  }

  function runAction(action) {
    try {
      if (action.startsWith("recent:")) { closeMenu(); return openRecent(action.slice(7)); }
      if (action.startsWith("tool:")) { closeMenu(); return setTool(action.slice(5)); }
      if (action.startsWith("color:")) { closeMenu(); return setColor(action.slice(6)); }
      if (action.startsWith("removeShape:")) { closeMenu(); return removeShapeById(action.slice(12)); }
      if (action.startsWith("shape:")) { closeMenu(); return selectShape(action.slice(6)); }
      if (action.startsWith("theme:")) { closeMenu(); return setTheme(action.slice(6)); }
      const fn = actions[action];
      if (!fn) throw new Error("Unknown action: " + action);
      closeMenu();
      return Promise.resolve(fn()).catch(showError);
    } catch (error) {
      showError(error);
      return null;
    }
  }

  function removeShapeById(id) {
    const doc = current();
    if (!doc) return 0;
    const shape = doc.shapes.find((item) => item.id === id);
    if (!shape) return 0;
    pushUndo();
    const removed = Paint.removeShape(doc, id);
    selected = selected.filter((item) => item !== id);
    markDirty();
    renderAll();
    return removed;
  }

  function selectShape(id) {
    selected = [id];
    renderOverlay();
    renderLeft();
    renderRight();
    renderStatus();
    return id;
  }

  function applySettingsForm(fields, live) {
    const languageChanged = Boolean(fields.language) && fields.language !== settings.language;
    if (fields.language) setLanguage(fields.language);
    if (fields.theme) setTheme(fields.theme);
    setFont(fields.fontFamily || settings.fontFamily, fields.fontSize, fields.fontStyle || settings.fontStyle);
    if (fields.backgroundOpacity != null && fields.backgroundOpacity !== "") {
      settings.backgroundOpacity = clamp(fields.backgroundOpacity, 0, 100);
      document.documentElement.style.setProperty("--workspace-image-opacity", String(settings.backgroundOpacity / 100));
    }
    if (fields.canvasWidth) settings.canvasWidth = clamp(fields.canvasWidth, 16, 8192);
    if (fields.canvasHeight) settings.canvasHeight = clamp(fields.canvasHeight, 16, 8192);
    if ("restoreSession" in fields) settings.restoreSession = Boolean(fields.restoreSession);
    if ("showLeft" in fields) settings.showLeft = Boolean(fields.showLeft);
    if ("showRight" in fields) settings.showRight = Boolean(fields.showRight);
    saveSettings();
    renderAll();
    if (!live) {
      closePopup();
      return settings;
    }
    if (languageChanged) refreshSettingsPopup();
    return settings;
  }

  function refreshPopupDocument(kind, tab) {
    if (kind === "settings") settingsTab = tab || settingsTab;
    if (window.desktop && window.desktop.refreshPopup && !TEST) {
      window.desktop.refreshPopup(popupDocument(kind));
      return;
    }
    if (popupEl && popupEl.dataset.kind === kind) {
      popupEl.innerHTML = popupHTML(kind);
      bindPopup(popupEl, kind);
      const want = kind === "settings" ? settingsTab : tab;
      if (want) {
        const node = popupEl.querySelector('[data-tab="' + want + '"]');
        if (node) node.click();
      }
    }
  }

  function refreshSettingsPopup(tab) {
    refreshPopupDocument("settings", tab);
  }

  function applyPaletteForm(fields) {
    if (fields.color) settings.color = fields.color;
    settings.fillColor = fields.noFill ? "" : (fields.fillColor || settings.fillColor || "#ffffff");
    if (fields.strokeWidth) settings.strokeWidth = clamp(fields.strokeWidth, 1, 96);
    if (fields.shapeOpacity != null && fields.shapeOpacity !== "") settings.shapeOpacity = clamp(fields.shapeOpacity, 0, 100);
    saveSettings();
    renderLeft();
    renderStatus();
    return settings;
  }

  const PRINT_NUMBERS = ["margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "scalePercent", "copies", "from", "to"];

  function syncPrintFields(fields) {
    if (!fields) return;
    ["scope", "paper", "orientation", "scaleMode", "align"].forEach((key) => { if (fields[key]) printState[key] = fields[key]; });
    PRINT_NUMBERS.forEach((key) => {
      if (fields[key] != null && fields[key] !== "") printState[key] = Number(fields[key]);
    });
    if ("printBackground" in fields) printState.printBackground = Boolean(fields.printBackground);
  }

  function popupAction(action, source, fieldOverride) {
    const root = source && source.closest ? source.closest(".popup") : popupEl;
    const fields = fieldOverride || (root ? readFields(root) : {});
    if (action === "stop-progress") { cancelProgress(); return null; }
    if (action === "close" || action === "cancel") { pendingClose = -1; closePopup(); return null; }
    if (action === "copy-error") {
      const detail = root && root.querySelector("#errorDetail");
      clipboard = detail && detail.value ? detail.value : lastError;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastError).catch(() => {});
      return lastError;
    }
    if (action === "apply-settings") return applySettingsForm(fields);
    if (action === "settings-sync") return applySettingsForm(fields, true);
    if (action === "apply-palette") { applyPaletteForm(fields); closePopup(); return settings; }
    if (action === "palette-sync") return applyPaletteForm(fields);
    if (action === "apply-canvas") { const result = applyCanvas(fields); closePopup(); return result; }
    if (action === "canvas-sync") return null;
    if (action === "apply-custom") {
      setCustom(fields);
      setTheme("custom");
      closePopup();
      return settings.custom;
    }
    if (action === "apply-drop") {
      applyDropRole(fields.role || "drawing").catch(showError);
      closePopup();
      return fields.role;
    }
    if (action === "fetch-url") {
      closePopup();
      openFromUrl(fields.url).catch(showError);
      return fields.url;
    }
    if (action === "apply-convert") {
      convertState.format = fields.format || convertState.format;
      if (fields.quality) convertState.quality = clamp(fields.quality, 10, 100);
      convertCurrent(convertState.format, convertState.quality).then(() => closePopup()).catch(showError);
      return convertState;
    }
    if (action === "tag-prev" || action === "tag-next") {
      tagPage = Math.max(0, Math.min(tagPages() - 1, tagPage + (action === "tag-next" ? 1 : -1)));
      refreshPopupDocument("dicom", "tags");
      return tagPage;
    }
    if (action === "discard") {
      if (pendingClose >= 0) {
        const index = pendingClose;
        docs[index].dirty = false;
        closePopup();
        return dropTab(index);
      }
      docs.forEach((doc) => { doc.dirty = false; });
      closeApplication(0);
      return null;
    }
    if (action === "save-close") {
      if (pendingClose >= 0) {
        const index = pendingClose;
        const tab = docs[index];
        finishSave(tab, tab.path || tab.name, "mpaint").then(() => { closePopup(); dropTab(index); });
        return null;
      }
      const doc = current();
      finishSave(doc, doc.path || doc.name, "mpaint").then(() => closeApplication());
      return null;
    }
    if (action === "confirm-save") {
      const doc = current();
      const name = fields.name || doc.name;
      const dir = fields.dir || settings.lastSaveDir || "";
      const format = fields.format === "png" ? "png" : "mpaint";
      const base = name.split(/[/\\]/).pop().replace(/\.(mpaint|png)$/i, "") + "." + format;
      const path = dir ? (dir.replace(/\\/g, "/").replace(/\/$/, "") + "/" + base) : base;
      finishSave(doc, path, format).then(() => closePopup());
      return path;
    }
    if (action === "clear-dirs" || action === "remove-dir") {
      if (action === "clear-dirs") {
        Store.clearRecentDirs(settings);
        settings.lastOpenDir = "";
        settings.lastSaveDir = "";
      } else {
        const dir = fields.recentDir || settings.lastOpenDir;
        Store.removeRecentDir(settings, dir);
        if (settings.lastOpenDir === dir) settings.lastOpenDir = (settings.recentDirs || [])[0] || "";
      }
      saveSettings();
      refreshSettingsPopup("workspace");
      return settings.recentDirs;
    }
    if (action === "bg-choose") { $("bgOpen").click(); return null; }
    if (action === "bg-clear") { clearBackground(); return null; }
    if (action === "remove-recent") {
      const id = (fieldOverride && fieldOverride.id) || (source && source.dataset && source.dataset.id);
      Store.removeRecent(settings, id);
      saveSettings();
      openPopup("recent");
      return settings.recent;
    }
    if (action === "clear-recent") {
      Store.clearRecent(settings);
      saveSettings();
      openPopup("recent");
      return settings.recent;
    }
    if (action === "print-prev" || action === "print-next" || action === "do-print" || action === "print-sync") {
      syncPrintFields(fields);
      if (action === "print-prev") printState.pageIndex -= 1;
      else if (action === "print-next") printState.pageIndex += 1;
      else printState.pageIndex = action === "do-print" ? printState.pageIndex : 0;
      if (action === "do-print") {
        const pages = pagesForPrint();
        const area = Print.printable(printState.paper, printState.orientation, printMargins());
        lastPrint = {
          scope: printState.scope,
          paper: printState.paper,
          orientation: printState.orientation,
          margin: Number(printState.marginTop),
          margins: printMargins(),
          scaleMode: printState.scaleMode,
          scalePercent: Number(printState.scalePercent),
          align: printState.align,
          copies: Number(printState.copies) || 1,
          printBackground: printState.printBackground !== false,
          area: { width: Math.round(area.width), height: Math.round(area.height) },
          count: pages.length,
          from: Number(printState.from),
          to: Number(printState.to),
        };
        settings.print = Object.assign({}, settings.print, printState);
        delete settings.print.pageIndex;
        saveSettings();
        if (!TEST) printDocument(pages);
        return lastPrint;
      }
      refreshPrintPreview();
      if (!popupEl && window.desktop && window.desktop.refreshPopup && !TEST) window.desktop.refreshPopup(popupDocument("print"));
      return printState;
    }
    return null;
  }

  function onPropertyChange(event) {
    const target = event.target;
    if (!target.dataset || !target.dataset.prop) return;
    const doc = current();
    const key = target.dataset.prop;
    const shape = firstSelected();
    pushUndo();
    if (shape) {
      if (key === "width" || key === "opacity" || key === "fontSize" || key === "x" || key === "y") shape[key] = Number(target.value);
      else shape[key] = target.value;
      Paint.normalizeShape(shape);
      markDirty();
      renderAll();
      return;
    }
    if (key === "name") doc.name = target.value;
    else if (key === "background") doc.background = target.value;
    else if (key === "canvasWidth") doc.width = clamp(target.value, 16, 8192);
    else if (key === "canvasHeight") doc.height = clamp(target.value, 16, 8192);
    markDirty();
    renderAll();
  }

  function onDicomChange(event) {
    const target = event.target;
    if (!target.dataset || !target.dataset.dicom) return;
    const key = target.dataset.dicom;
    if (key === "preset") {
      applyPreset(target.value);
      return;
    }
    const options = {};
    if (key === "wc") options.wc = Number(target.value);
    else if (key === "ww") options.ww = Math.max(1, Number(target.value));
    else if (key === "colormap") options.colormap = target.value;
    else if (key === "voiFunction") options.voiFunction = target.value;
    else if (key === "voiLut") options.voiLut = parseInt(target.value, 10);
    else if (key === "invert") options.invert = target.checked;
    else if (key === "overlays") options.overlays = target.checked;
    renderDicom(options).catch(showError);
  }

  function onPaletteChange(event) {
    const target = event.target;
    if (!target.dataset || !target.dataset.pick) return;
    const key = target.dataset.pick;
    if (key === "color") setColor(target.value);
    else if (key === "fillColor") { settings.fillColor = target.value; saveSettings(); renderLeft(); }
    else if (key === "noFill") { settings.fillColor = target.checked ? "" : (settings.fillColor || "#ffffff"); saveSettings(); renderLeft(); }
    else if (key === "strokeWidth") setStrokeWidth(target.value);
  }

  function wireResizeGrip() {
    const grip = $("resizeGrip");
    if (!grip) return;
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (!window.desktop || !window.desktop.resizeWindow) return;
      event.preventDefault();
      const startX = event.screenX;
      const startY = event.screenY;
      const startW = window.outerWidth;
      const startH = window.outerHeight;
      try { grip.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      const move = (ev) => {
        window.desktop.resizeWindow(startW + (ev.screenX - startX), startH + (ev.screenY - startY));
      };
      const end = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
  }

  function wireBoard() {
    const board = $("board");
    board.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try { board.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      const point = toDocPoint(event.clientX, event.clientY);
      beginDraw(point.x, point.y);
    });
    board.addEventListener("pointermove", (event) => {
      const point = toDocPoint(event.clientX, event.clientY);
      if (!boardDragging()) {
        pointer = point;
        probeAt(point.x, point.y);
        renderStatus();
        return;
      }
      moveDraw(point.x, point.y);
    });
    const finish = (event) => {
      if (!boardDragging()) return;
      const point = toDocPoint(event.clientX, event.clientY);
      endDraw(point.x, point.y);
    };
    board.addEventListener("pointerup", finish);
    board.addEventListener("pointercancel", finish);
    board.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const point = toDocPoint(event.clientX, event.clientY);
      const hit = Paint.hitTest(current(), point.x, point.y);
      if (hit) selected = [hit.id];
      renderOverlay();
      renderRight();
      openContext(event.clientX, event.clientY);
    });
  }

  function wireStagePan() {
    const stage = $("stage");
    if (!stage) return;
    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      // the canvas itself draws; the space around it drags the picture
      if (event.target.closest("#board")) return;
      event.preventDefault();
      stage.classList.add("panning");
      const startX = event.clientX;
      const startY = event.clientY;
      const left = stage.scrollLeft;
      const top = stage.scrollTop;
      try { stage.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      const move = (motion) => {
        stage.scrollLeft = left - (motion.clientX - startX);
        stage.scrollTop = top - (motion.clientY - startY);
      };
      const stop = () => {
        stage.classList.remove("panning");
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerup", stop);
        stage.removeEventListener("pointercancel", stop);
      };
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerup", stop);
      stage.addEventListener("pointercancel", stop);
    });
  }

  function wire() {
    wireResizeGrip();
    wireBoard();
    wireStagePan();
    bindSplitters();
    $("toolbar").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("menubar").addEventListener("click", (event) => {
      const control = event.target.closest("[data-window]");
      if (control) {
        closeMenu();
        if (window.desktop && window.desktop.windowCommand) window.desktop.windowCommand(control.dataset.window);
        return;
      }
      const btn = event.target.closest("[data-menu]");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      openMenu(btn.dataset.menu, rect.left, rect.bottom, "left");
    });
    $("leftPanel").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("leftPanel").addEventListener("change", onPaletteChange);
    $("leftPanel").addEventListener("input", onPaletteChange);
    $("rightPanel").addEventListener("change", onPropertyChange);
    $("rightPanel").addEventListener("change", onDicomChange);
    $("rightPanel").addEventListener("click", (event) => {
      const step = event.target.closest("[data-step]");
      if (step) {
        event.preventDefault();
        stepProperty(step);
        return;
      }
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("menuLayer").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn && !btn.disabled) runAction(btn.dataset.action);
    });
    $("popupLayer").addEventListener("click", (event) => {
      if (event.target.id === "popupLayer") { closePopup(); return; }
      const tab = event.target.closest("[data-tab]");
      if (tab && popupEl && popupEl.contains(tab)) {
        if (popupEl.dataset.kind === "settings") settingsTab = tab.dataset.tab;
        popupEl.querySelectorAll("[data-tab]").forEach((node) => node.classList.toggle("on", node === tab));
        popupEl.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
        return;
      }
      if (popupEl && stepSpin(popupEl, event.target)) return;
      const btn = event.target.closest("[data-popup-action]");
      if (btn) popupAction(btn.dataset.popupAction, btn);
    });
    $("popupLayer").addEventListener("change", () => {
      if (!popupEl) return;
      const kind = popupEl.dataset.kind;
      if (kind === "settings") { applySettingsForm(readFields(popupEl), true); return; }
      if (kind === "palette") { applyPaletteForm(readFields(popupEl)); return; }
      if (kind !== "print") return;
      syncPrintFields(readFields(popupEl));
      printState.pageIndex = 0;
      refreshPrintPreview();
    });
    $("tabstrip").addEventListener("click", (event) => {
      const close = event.target.closest("[data-close]");
      if (close) {
        closeTab(Number(close.dataset.close));
        return;
      }
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      active = Number(tab.dataset.tab);
      selected = [];
      renderAll();
    });
    $("tabPrev").addEventListener("click", () => { $("tabstrip").scrollLeft -= 140; });
    $("tabNext").addEventListener("click", () => { $("tabstrip").scrollLeft += 140; });
    $("stage").addEventListener("contextmenu", (event) => {
      if (event.target.id === "board") return;
      event.preventDefault();
      openContext(event.clientX, event.clientY);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeMenu(); doDeselect(); return; }
      if (event.key === "Delete" && !event.target.closest("input, select, textarea")) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c") doCopy();
      else if (key === "v") { event.preventDefault(); doPaste(); }
      else if (key === "x") { event.preventDefault(); doCut(); }
      else if (key === "z" && event.shiftKey) { event.preventDefault(); doRedo(); }
      else if (key === "z") { event.preventDefault(); doUndo(); }
      else if (key === "y") { event.preventDefault(); doRedo(); }
      else if (key === "a") { event.preventDefault(); doSelectAll(); }
      else if (key === "s") { event.preventDefault(); actions.save(); }
      else if (key === "p") { event.preventDefault(); actions.print(); }
      else if (key === "n") { event.preventDefault(); actions.new(); }
      else if (key === "o") { event.preventDefault(); actions.open(); }
    });
    window.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomByWheel(event.deltaY);
    }, { passive: false });
    window.addEventListener("dragover", (event) => { event.preventDefault(); });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        handleDroppedFiles(event.dataTransfer.files).catch(showError);
      }
    });
    document.addEventListener("mousedown", (event) => {
      if (menuEl && !menuEl.contains(event.target) && !event.target.closest("[data-menu]") && !event.target.closest("#toolbar [data-action]")) closeMenu();
    });
    $("fileOpen").accept = acceptAttribute();
    $("imageOpen").accept = acceptAttribute();
    $("fileOpen").addEventListener("change", () => { handleOpenedFiles($("fileOpen").files).catch(showError); });
    $("imageOpen").addEventListener("change", () => { handleOpenedFiles($("imageOpen").files).catch(showError); });
    $("bgOpen").addEventListener("change", () => {
      const file = $("bgOpen").files && $("bgOpen").files[0];
      if (file) setBackgroundBlob(file, file.name).catch(showError);
    });
    if (!window.desktop) {
      window.addEventListener("beforeunload", (event) => {
        if (TEST) return;
        if (docs.some((doc) => doc.dirty)) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
    }
    if (window.desktop && window.desktop.onCloseRequest) window.desktop.onCloseRequest(() => requestClose());
    if (window.desktop && window.desktop.onHostAction) {
      window.desktop.onHostAction((payload) => {
        const name = payload && payload.name;
        if (!name) return;
        if (actions[name] || name.indexOf(":") > 0) runAction(name);
        else popupAction(name, null, payload.detail || {});
      });
    }
    if (window.desktop && window.desktop.onDownloadProgress) {
      window.desktop.onDownloadProgress((payload) => {
        if (!downloadWatcher || !payload) return;
        downloadWatcher(payload.received, payload.total);
      });
    }
    if (window.desktop && window.desktop.onLaunch) {
      window.desktop.onLaunch((launch) => { openLaunch(launch).catch(showError); });
    }
    window.addEventListener("error", (event) => { if (!TEST) showError(event.error || new Error(event.message)); });
  }

  async function openLaunch(launch) {
    if (!launch || !window.desktop || launch.mode === "standalone") return null;
    if (launch.mode === "drawing") {
      const text = await window.desktop.readFile(launch.file);
      return openDrawingText(text, String(launch.file).split(/[/\\]/).pop(), launch.file);
    }
    return ingestPaths([launch.file]);
  }

  async function loadFonts() {
    if (TEST) {
      fontCatalog = Fonts.FALLBACK.slice();
      return fontCatalog;
    }
    try {
      if (typeof window.queryLocalFonts === "function") {
        const faces = await window.queryLocalFonts();
        const names = Fonts.uniqueFamilies(faces.map((face) => face.family));
        if (names.length) { fontCatalog = names; return fontCatalog; }
      }
    } catch (error) { /* permission or unsupported */ }
    if (window.desktop && window.desktop.listFonts) {
      try {
        const names = await window.desktop.listFonts();
        if (names && names.length) { fontCatalog = names; return fontCatalog; }
      } catch (error) { /* fall through */ }
    }
    fontCatalog = Fonts.FALLBACK.slice();
    return fontCatalog;
  }

  function sampleDocs() {
    return [Paint.createDoc(Sample.welcome), Paint.createDoc(Sample.shapes)];
  }

  async function boot() {
    settings = TEST ? Store.defaults() : Store.load(localStorage);
    printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
    if (!TEST && settings.backgroundName) {
      try {
        const blob = await idbGet("background");
        if (blob) {
          bgObjectUrl = URL.createObjectURL(blob);
          document.documentElement.style.setProperty("--workspace-image", 'url("' + bgObjectUrl + '")');
        }
      } catch (error) { /* image is optional */ }
    }
    docs = [];
    if (!TEST && settings.restoreSession) {
      try {
        const raw = localStorage.getItem(Store.SESSION_KEY);
        if (raw) docs = Paint.parse(raw).documents;
      } catch (error) { docs = []; }
    }
    if (!docs.length) docs = sampleDocs();
    active = 0;
    selected = [];
    wire();
    await loadFonts();
    renderAll();
    window.MyPaint = api;
    api.ready = true;
  }

  async function resetForTests() {
    closeMenu();
    closePopup();
    settings = Store.defaults();
    Store.save(localStorage, settings);
    localStorage.removeItem(Store.SESSION_KEY);
    undoStack = [];
    redoStack = [];
    clipboard = "";
    lastError = "";
    lastSaved = null;
    lastExport = null;
    lastDownload = null;
    lastLink = "";
    lastPrint = null;
    progressMarks = [];
    progressDepth = 0;
    downloadStop = null;
    appClosed = false;
    pendingDrop = null;
    pendingClose = -1;
    region = null;
    regionDrag = false;
    band = null;
    draft = null;
    dragState = null;
    pointer = { x: 0, y: 0 };
    stopCine();
    extras.clear();
    Object.keys(images).forEach((key) => { delete images[key]; });
    lastProbe = null;
    lastConvert = null;
    tagPage = 0;
    convertState = { format: "png", quality: 92 };
    fontCatalog = Fonts.FALLBACK.slice();
    docs = sampleDocs();
    active = 0;
    selected = [];
    nextName = 1;
    printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
    await clearBackground().catch(() => {});
    settings.backgroundOpacity = 35;
    renderAll();
  }

  const api = {
    ready: false,
    build: BUILD,
    metrics: metrics,
    resetForTests: resetForTests,
    t: (key) => t(key),
    setLanguage: setLanguage,
    getLanguage: () => settings.language,
    setTheme: setTheme,
    getTheme: () => settings.theme,
    themes: () => Themes.ids(),
    setCustom: setCustom,
    setZoom: setZoom,
    getZoom: () => settings.zoom,
    setFont: setFont,
    setFontCatalog: (names) => { fontCatalog = Fonts.uniqueFamilies(names); return fontCatalog; },
    getFontCatalog: () => fontCatalog.slice(),
    getSettings: () => Object.assign({}, settings),
    saveSettings: saveSettings,
    loadSettings: () => { settings = Store.load(localStorage); applyVisual(); renderAll(); return api.getSettings(); },
    setPanelWidth: (side, value) => {
      layout()[side] = value;
      applyLayout();
      saveSettings();
      return side === "left" ? layout().left : layout().right;
    },
    rememberDirectory: (kind, filePath) => { Store.rememberDirectory(settings, kind, filePath); saveSettings(); return kind === "save" ? settings.lastSaveDir : settings.lastOpenDir; },
    run: runAction,
    menuDefinitions: menuDefinitions,
    contextItems: contextItems,
    hasAction: (name) => Boolean(actions[name]),
    openMenu: (id, x, y) => openMenu(id, x == null ? 12 : x, y == null ? 70 : y, "left"),
    closeMenu: closeMenu,
    getMenu: () => menuEl,
    openContextAt: (x, y) => openContext(x == null ? 30 : x, y == null ? 80 : y),
    fitMenu: fitMenu,
    openPopup: openPopup,
    closePopup: closePopup,
    getPopup: () => popupEl,
    popupAction: (name, fields) => popupAction(name, null, fields),
    closeApplication: closeApplication,
    isClosed: () => appClosed,
    reopen: () => { appClosed = false; },
    getDoc: () => current(),
    getDocs: () => docs.slice(),
    setTool: setTool,
    getTool: () => settings.tool,
    setColor: setColor,
    getColor: () => settings.color,
    setStrokeWidth: setStrokeWidth,
    draw: (x0, y0, x1, y1) => {
      beginDraw(x0, y0);
      moveDraw(x1 == null ? x0 : x1, y1 == null ? y0 : y1);
      return endDraw(x1 == null ? x0 : x1, y1 == null ? y0 : y1);
    },
    stroke: (points) => {
      if (!points.length) return null;
      beginDraw(points[0].x, points[0].y);
      points.slice(1).forEach((point) => moveDraw(point.x, point.y));
      const last = points[points.length - 1];
      return endDraw(last.x, last.y);
    },
    click: (x, y) => beginDraw(x, y),
    pointerDraw: (x0, y0, x1, y1) => {
      const board = $("board");
      const rect = board.getBoundingClientRect();
      const factor = scale();
      const at = (x, y) => ({ clientX: rect.left + x * factor, clientY: rect.top + y * factor, bubbles: true, button: 0, pointerId: 1, pointerType: "mouse" });
      board.dispatchEvent(new PointerEvent("pointerdown", at(x0, y0)));
      board.dispatchEvent(new PointerEvent("pointermove", at(x1, y1)));
      board.dispatchEvent(new PointerEvent("pointerup", at(x1, y1)));
      return current().shapes[current().shapes.length - 1];
    },
    select: (x, y) => {
      setTool("select");
      beginDraw(x, y);
      const hit = firstSelected();
      endDraw(x, y);
      return hit;
    },
    getSelection: () => selected.slice(),
    selectShape: selectShape,
    removeShape: removeShapeById,
    selectAll: doSelectAll,
    deselect: doDeselect,
    getRegion: () => (region ? JSON.parse(JSON.stringify(region)) : null),
    getBand: () => (band ? Paint.normalizeRect(band) : null),
    regionBounds: () => (region ? Paint.regionBounds(region) : null),
    cropRegion: cropToRegion,
    eraseRegion: eraseRegion,
    copyRegion: copyRegion,
    clearRegion: clearRegion,
    shapes: () => current().shapes.slice(),
    shapeCount: () => current().shapes.length,
    deleteSelection: deleteSelection,
    clearDrawing: clearDrawing,
    applyCanvas: applyCanvas,
    moveLayer: moveSelectedLayer,
    copy: doCopy,
    cut: doCut,
    paste: doPaste,
    getClipboard: () => clipboard,
    systemClipboard: () => (lastSystemCopy ? Object.assign({}, lastSystemCopy) : null),
    clipboardImage: () => { const canvas = clipboardCanvas(); return canvas ? { width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL("image/png") } : null; },
    undo: doUndo,
    redo: doRedo,
    canUndo: canUndo,
    canRedo: canRedo,
    framePixelAt: (x, y) => {
      const canvas = images[frameKey(current())];
      if (!canvas || !canvas.getContext) return null;
      const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    },
    pixelAt: (x, y) => {
      const ctx = $("board").getContext("2d", { willReadFrequently: true });
      const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    },
    closeTab: closeTab,
    addTabs: (count) => { for (let i = 0; i < count; i += 1) docs.push(newDoc({ name: "extra-" + i + ".mpaint" })); renderTabs(); },
    tabOverflow: () => $("tabstrip").scrollWidth > $("tabstrip").clientWidth + 1,
    scrollTabs: (dir) => { $("tabstrip").scrollLeft += dir * 140; return $("tabstrip").scrollLeft; },
    showError: showError,
    getErrorText: () => lastError,
    copyError: () => { clipboard = lastError; return lastError; },
    showProgress: (label, value) => { progressMarks.push(value); openPopup("progress"); paintProgress(label, value); },
    progressValue: () => (progressMarks.length ? progressMarks[progressMarks.length - 1] : 0),
    progressMarks: () => progressMarks.slice(),
    finishProgress: endProgress,
    cancelProgress: cancelProgress,
    isDownloading: () => Boolean(downloadStop),
    runDownload: downloadSample,
    runOpenLink: openLink,
    runExport: () => exportPng(current(), null),
    getLastDownload: () => lastDownload,
    getLastLink: () => lastLink,
    getLastSaved: () => lastSaved,
    getLastExport: () => lastExport,
    getLastPrint: () => lastPrint,
    setPrintOption: (key, value) => {
      printState[key] = value;
      settings.print[key] = value;
      if (popupEl) {
        const node = popupEl.querySelector('[data-field="' + key + '"]');
        if (node) node.value = value;
      }
      printState.pageIndex = 0;
      refreshPrintPreview();
      return printState;
    },
    previewCount: () => pagesForPrint().length,
    previewPage: () => printState.pageIndex,
    stageCenterPoint: stageCenterPoint,
    requestClose: requestClose,
    dropFiles: async (items) => {
      const files = items.map((item) => new File([item.text || ""], item.name, { type: item.type || "text/plain" }));
      return handleDroppedFiles(files);
    },
    dropImage: async (name, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width || 40;
      canvas.height = height || 30;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      pendingDrop = { kind: "picture", format: "native", name: name || "dropped.png", bytes: bytes };
      openPopup("drop");
      return pendingDrop;
    },
    makePng: async (width, height, color) => {
      const canvas = document.createElement("canvas");
      canvas.width = width || 32;
      canvas.height = height || 24;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color || "#2244ff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      return new Uint8Array(await blob.arrayBuffer());
    },
    applyDrop: (role) => applyDropRole(role),
    setBackgroundBytes: async (bytes, type, name) => setBackgroundBlob(new Blob([bytes], { type: type || "application/octet-stream" }), name),
    clearBackground: clearBackground,
    addRecent: (item) => { Store.addRecent(settings, item); saveSettings(); return settings.recent.slice(); },
    removeRecent: (id) => { Store.removeRecent(settings, id); saveSettings(); return settings.recent.slice(); },
    clearRecent: () => { Store.clearRecent(settings); saveSettings(); return settings.recent.slice(); },
    openDrawingText: openDrawingText,
    openFilters: openFilters,
    openFromUrl: openFromUrl,
    downloadPercent: downloadPercent,
    sizeLabel: sizeLabel,
    acceptAttribute: acceptAttribute,
    openFiles: (items) => handleOpenedFiles(items.map((item) => (
      item.bytes
        ? new File([item.bytes], item.name, { type: item.type || "application/octet-stream" })
        : new File([item.text || ""], item.name, { type: item.type || "text/plain" })
    ))),
    serialize: () => Paint.serialize(docs),
    formats: () => Formats,
    supportedFormats: () => Formats.listExtensions(),
    openBytes: (bytes, name, path) => openPicture(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), name, path || ""),
    decodeBytes: (bytes, name, options) => Formats.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), name, options),
    sourceInfo: () => {
      const source = sourceOf();
      return source ? { kind: source.kind, pages: source.pages, page: source.page, exifText: source.exifText } : null;
    },
    showPage: showPage,
    dicom: () => dicomOf(),
    dicomState: () => {
      const image = dicomOf();
      return image ? Object.assign({}, image.state) : null;
    },
    dicomRender: (options) => renderDicom(options),
    dicomPreset: (id) => applyPreset(id),
    dicomPresets: () => {
      const image = dicomOf();
      return image ? dicomPresets(image).map((item) => item.id) : [];
    },
    dicomTags: dicomTags,
    dicomMeta: () => {
      const image = dicomOf();
      return image ? image.meta : null;
    },
    dicomMeasure: (shape) => measurementOf(shape || firstSelected()),
    dicomProbe: (x, y) => probeAt(x, y),
    dicomCine: () => toggleCine(),
    cineRunning: () => Boolean(cineTimer),
    stopCine: stopCine,
    tagPages: tagPages,
    convert: (format, quality) => convertCurrent(format, quality),
    getLastConvert: () => lastConvert,
    dropBytes: async (bytes, name) => {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      pendingDrop = { kind: "picture", format: Formats.kindOf(name, data), name: name, bytes: data };
      openPopup("drop");
      return pendingDrop;
    },
    saveCurrent: saveCurrent,
    exportPng: exportPng,
  };

  boot().catch((error) => {
    console.error(error);
    showError(error);
  });
})();
