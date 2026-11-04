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
  const ColorPicker = window.MyPaintColorPicker;
  const RichText = window.MyPaintRichText;
  const SvgDoc = window.MyPaintSvgDoc;
  const SVG_REDRAW_MS = 150;    // the source is drawn again when typing pauses this long
  const StartScreen = window.MyPaintStartScreen;
  const Effects = window.MyPaintEffects;
  const ColorWheel = window.MyPaintColorWheel;
  const Range = window.MyPaintRange;
  const TEST = new URLSearchParams(location.search).get("test") === "1";
  const GUIDE_URL = "https://localhost/mypaint/USERSGUIDE.md";
  /* .mypaint is the drawing format; files saved by earlier versions as .mpaint still open. */
  const DRAWING_EXT = /\.(mypaint|mpaint)$/i;

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
  let progressLabel = "";
  let popupEl = null;
  let popupWindow = null;
  let popupHtml = "";
  let popupKind = "";
  let popupBoxSize = null;
  let menuEl = null;
  let appClosed = false;
  let fontCatalog = Fonts.FALLBACK.slice();
  let pendingDrop = null;
  let bgObjectUrl = "";
  let settingsTab = "general";
  let printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
  let draft = null;
  let dragState = null;
  let lastCanvasDrop = null;
  let pixelAnchor = null;       // the first pixel of a pixel selection being dragged
  let popupGen = 0;             // numbers the popup commands, so the host can drop a late one
  let pendingDropMore = [];     // the other pictures of one drop: the one answer covers them all
  let pendingDropAt = null;     // where on the picture they were dropped, if on the picture
  let pressAdds = false;        // Shift or Ctrl was held at this press: it adds to the selection
  let pointer = { x: 0, y: 0 };
  let pointerSeen = false;
  let textEditing = null;
  let textSession = null;
  let textFieldUndo = false;
  let svgEditUndo = null;       // the document whose source box has pushed its undo step for this stay
  let svgTimer = null;          // the redraw waiting for typing to pause
  let svgToken = 0;             // only the newest redraw of the source may land
  let svgPending = Promise.resolve(null);
  let textFocusToken = 0;
  let editorCaret = null;       // where the caret was when the text editor lost focus
  let lastTextRestyle = null;
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
  let lastMenu = null;          // the menu last opened, so taking a recent file off reopens it
  let startVisible = false;     // the start screen is over the work area
  let exportUndoTaken = false;
  let fxWheelTarget = "border.color"; // which effect colour the round chooser sets
  let startView = null;         // its view (start-screen.js), made the first time it shows
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

  /* The grid is measured on the picture, so zooming scales a 5 x 5 block with the drawing. When a
   * cell grows to GRID_MAX_CELL on the screen it becomes the next 5 x 5 block, split into five
   * again; when it shrinks below GRID_MIN_CELL, five cells become one. Each step keeps the lines
   * of the coarser grid where they were. */
  function gridSpacing(size, zoom) {
    let cell = size * zoom;
    while (cell >= metrics.GRID_MAX_CELL) cell /= 5;
    while (cell < metrics.GRID_MIN_CELL) cell *= 5;
    const exact = (value) => Number(value.toFixed(3));
    return { cell: exact(cell), major: exact(cell * 5) };
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
    const grid = gridSpacing(settings.gridSize, scale());
    root.style.setProperty("--grid-cell", grid.cell + "px");
    root.style.setProperty("--grid-major", grid.major + "px");
    root.style.setProperty("--canvas-w", (doc ? doc.width : 900) + "px");
    root.style.setProperty("--canvas-h", (doc ? doc.height : 560) + "px");
    root.style.setProperty("--workspace-image-opacity", String((settings.backgroundOpacity || 0) / 100));
    document.title = BUILD.title;
    if (startVisible) startScreen().syncTheme();
    const title = $("appTitle");
    if (title) title.textContent = BUILD.title;
  }

  function newDoc(options) {
    const name = "untitled-" + nextName + ".mypaint";
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
    forgetSvgEdits();
    // a frame lives outside the snapshot: one whose source came back is drawn again
    docs.forEach((doc) => {
      if (doc.svg && extrasOf(doc).svgDrawn !== doc.svg) drawSvgFrame(doc);
    });
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

  function activeTextShapes() {
    return selectedShapes().filter((shape) => shape.kind === "text");
  }

  /* While a text is being typed the toolbar shows the style the next character takes;
   * otherwise that of the first selected text, or the default for new text. */
  function caretFontStyle() {
    const shape = editingShape();
    const editor = $("textEditor");
    if (!shape || !editor || editor.hidden || !RichText) return null;
    return RichText.caretStyle(editor, Paint.styleOfShape(shape));
  }

  function activeFontSize() {
    const caret = caretFontStyle();
    if (caret) return caret.fontSize;
    const shapes = activeTextShapes();
    return shapes.length ? shapes[0].fontSize : settings.fontSize;
  }

  function activeFontFamily() {
    const caret = caretFontStyle();
    if (caret) return caret.fontFamily;
    const shapes = activeTextShapes();
    return shapes.length ? shapes[0].fontFamily : settings.fontFamily;
  }

  function fontFlag(kind) {
    const caret = caretFontStyle();
    if (caret) return Boolean(caret[kind]);
    const shapes = activeTextShapes();
    if (shapes.length) {
      // a selected text with mixed parts: lit only when all of it has the style
      const runs = Paint.textRuns(shapes[0]);
      if (runs.length) return runs.every((run) => Boolean(run[kind]));
    }
    const style = String(shapes.length ? shapes[0].fontStyle : settings.fontStyle);
    if (kind === "bold") return style.indexOf("bold") >= 0;
    if (kind === "italic") return style.indexOf("italic") >= 0;
    if (kind === "underline") return shapes.length ? !!shapes[0].underline : !!settings.fontUnderline;
    return shapes.length ? !!shapes[0].strike : !!settings.fontStrike;
  }

  /* Only the font controls follow the caret, so moving it does not rebuild the toolbar. */
  function syncFontControls() {
    const size = activeFontSize();
    const value = $("fontSizeValue");
    if (value) value.textContent = String(size);
    const pick = document.querySelector("#toolbar .font-pick");
    const family = activeFontFamily();
    if (pick && document.activeElement !== pick) {
      if (!Array.from(pick.options).some((option) => option.value === family)) pick.insertAdjacentHTML("afterbegin", optionTag(family, family, family));
      pick.value = family;
    }
    [["fontBold", "bold"], ["fontItalic", "italic"], ["fontUnderline", "underline"], ["fontStrike", "strike"]].forEach((pair) => {
      const on = fontFlag(pair[1]);
      document.querySelectorAll('#toolbar [data-action="' + pair[0] + '"]').forEach((el) => {
        el.classList.toggle("on", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  }

  function fontStyleButton(action, mark, label, on) {
    return '<button type="button" class="tool-btn font-style' + (on ? " on" : "") + '" data-action="' + action + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + mark + "</button>";
  }

  function fontToolbar() {
    const family = activeFontFamily();
    const size = activeFontSize();
    const names = fontCatalog.indexOf(family) >= 0 ? fontCatalog : [family].concat(fontCatalog);
    const down = size <= 6 ? " disabled" : "";
    const up = size >= 400 ? " disabled" : "";
    return '<span class="font-bar">' +
      '<select class="font-pick" data-font="family" title="' + esc(t("font.family")) + '" aria-label="' + esc(t("font.family")) + '">' +
      names.map((name) => optionTag(name, name, family)).join("") + "</select>" +
      '<button type="button" class="tool-btn font-step" data-action="fontDown" title="' + esc(t("font.smaller")) + '" aria-label="' + esc(t("font.smaller")) + '"' + down + ">−</button>" +
      '<button type="button" class="tool-btn font-size" id="fontSizeValue" title="' + esc(t("font.size")) + '" aria-label="' + esc(t("font.size") + " " + size) + '">' + size + "</button>" +
      '<button type="button" class="tool-btn font-step" data-action="fontUp" title="' + esc(t("font.larger")) + '" aria-label="' + esc(t("font.larger")) + '"' + up + ">+</button>" +
      fontStyleButton("fontBold", "<b>B</b>", t("font.bold"), fontFlag("bold")) +
      fontStyleButton("fontItalic", "<i>I</i>", t("font.italic"), fontFlag("italic")) +
      fontStyleButton("fontUnderline", "<u>U</u>", t("font.underline"), fontFlag("underline")) +
      fontStyleButton("fontStrike", "<s>S</s>", t("font.strike"), fontFlag("strike")) +
      "</span>";
  }

  function button(action, icon, label, extra) {
    return '<button type="button" class="tool-btn" data-action="' + action + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + Icons.icon(icon) + (extra || "") + "</button>";
  }

  function toggleButton(action, icon, label, on) {
    return '<button type="button" class="tool-btn' + (on ? " on" : "") + '" data-action="' + action + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + Icons.icon(icon) + "</button>";
  }

  /* The toolbar is a row of groups, each a kind of command, with a separator between two
   * groups. The buttons pushed to the right end (theme, language, settings, about) are not a
   * group of the row and get no separator. */
  function toolbarGroups() {
    return [
      ["file", [
        button("new", "new", t("file.new")),
        button("open", "open", t("file.open")),
        button("save", "save", t("file.save")),
        button("export", "download", t("file.export")),
        button("print", "print", t("file.print")),
      ]],
      ["history", [
        button("undo", "undo", t("edit.undo")),
        button("redo", "redo", t("edit.redo")),
      ]],
      ["clipboard", [
        button("cut", "cut", t("edit.cut")),
        button("copy", "copy", t("edit.copy")),
        button("paste", "paste", t("edit.paste")),
        button("deleteShape", "trash", t("edit.delete")),
        button("cropRegion", "crop", t("edit.crop")),
        button("selectAll", "select", t("edit.selectAll")),
      ]],
      ["order", [
        button("bringForward", "layerUp", t("draw.bringForward")),
        button("sendBackward", "layerDown", t("draw.sendBackward")),
      ]],
      ["zoom", [
        button("zoomOut", "zoomOut", t("view.zoomOut")),
        '<button type="button" class="tool-btn zoom-readout" data-action="zoomReset" id="zoomValue" title="' + esc(t("view.zoomReset")) + '">' + settings.zoom + "%</button>",
        button("zoomIn", "zoomIn", t("view.zoomIn")),
      ]],
      ["view", [
        toggleButton("toggleGrid", "grid", t("view.grid"), settings.showGrid),
        toggleButton("toggleRulers", "ruler", t("view.rulers"), settings.showRulers),
        toggleButton("toggleShapes", "shapes", t("view.shapes"), settings.showShapes !== false),
      ]],
      ["panels", [
        toggleButton("toggleLeft", "panelLeft", t("view.left"), settings.showLeft),
        toggleButton("toggleRight", "panelRight", t("view.right"), settings.showRight),
      ]],
      ["font", [fontToolbar()]],
    ];
  }

  /* The toolbar's tooltip: at once, on the whole of a button, a disabled one too. The browser's
   * own waits about a second and is given up when the toolbar is drawn again, so the title moves
   * to data-tip. Found by position, because a disabled button takes no pointer events itself. */
  let toolTipEl = null;
  let toolTipOwner = null;
  let toolTipPoint = null;   // where the pointer rests over the toolbar
  let toolTipFollow = null;

  function hideToolTip() {
    if (toolTipEl) toolTipEl.hidden = true;
    toolTipOwner = null;
  }

  function showToolTip(owner) {
    if (owner === toolTipOwner) return;
    if (!toolTipEl) {
      toolTipEl = document.createElement("div");
      toolTipEl.className = "quick-tip";
      toolTipEl.setAttribute("role", "tooltip");
      document.body.appendChild(toolTipEl);
    }
    toolTipOwner = owner;
    toolTipEl.textContent = owner.dataset.tip;
    toolTipEl.hidden = false;
    const box = owner.getBoundingClientRect();
    const width = toolTipEl.offsetWidth;
    toolTipEl.style.left = Math.max(4, Math.min(window.innerWidth - width - 4, box.left + box.width / 2 - width / 2)) + "px";
    toolTipEl.style.top = (box.bottom + 6) + "px";
  }

  function wireToolTips() {
    const bar = $("toolbar");
    const follow = (event) => {
      toolTipPoint = { clientX: event.clientX, clientY: event.clientY };
      const owner = [...bar.querySelectorAll("[title], [data-tip]")].find((node) => {
        const box = node.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom;
      });
      if (!owner) { hideToolTip(); return; }
      if (owner.title) {
        owner.dataset.tip = owner.title;
        owner.removeAttribute("title");
      }
      showToolTip(owner);
    };
    bar.addEventListener("pointerover", follow);
    bar.addEventListener("pointermove", follow);
    toolTipFollow = follow;
    const away = () => { toolTipPoint = null; hideToolTip(); };
    bar.addEventListener("pointerleave", away);
    bar.addEventListener("pointerdown", away);
    window.addEventListener("blur", away);
  }

  function renderToolbar() {
    hideToolTip();
    const groups = toolbarGroups().map((group) => (
      '<span class="tool-group" data-group="' + group[0] + '">' + group[1].join("") + "</span>"
    ));
    $("toolbar").innerHTML = groups.join('<i class="sep"></i>') +
      '<span class="toolbar-end">' + toolbarActions().map(toolActionButton).join("") + "</span>";
    updateHistoryButtons();
    syncGrid();
    syncShapes();
    syncPanels();
    if (toolTipPoint && toolTipFollow) toolTipFollow(toolTipPoint);
  }

  /* The separators beside the panels: dragging one resizes its panel. The largest two panels
   * together still leave the stage room in the smallest window. */
  const panelLeast = (side) => (side === "right" ? metrics.PROP_PANEL : metrics.TOOL_PANEL);

  function panelWidth(side) {
    const value = Number(settings.layout && settings.layout[side]);
    return Math.max(panelLeast(side), Math.min(metrics.PANEL_MAX, Number.isFinite(value) ? value : panelLeast(side)));
  }

  function syncSplitters() {
    const root = document.documentElement;
    root.style.setProperty("--tool-panel", panelWidth("left") + "px");
    root.style.setProperty("--prop-panel", panelWidth("right") + "px");
    [["splitLeft", "left", settings.showLeft], ["splitRight", "right", settings.showRight]].forEach((row) => {
      const node = $(row[0]);
      if (!node) return;
      node.classList.toggle("hidden", !row[2]);
      node.title = t("panel.resize");
      node.setAttribute("aria-label", t("panel.resize"));
      node.setAttribute("aria-valuemin", String(panelLeast(row[1])));
      node.setAttribute("aria-valuemax", String(metrics.PANEL_MAX));
      node.setAttribute("aria-valuenow", String(panelWidth(row[1])));
    });
  }

  function setPanelWidth(side, width) {
    settings.layout = Object.assign({}, settings.layout);
    settings.layout[side] = Math.round(Math.max(panelLeast(side), Math.min(metrics.PANEL_MAX, width)));
    syncSplitters();
    scheduleRulers();
    return settings.layout[side];
  }

  function wireSplitter(id, side) {
    const node = $(id);
    if (!node) return;
    const grow = side === "left" ? 1 : -1;
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = panelWidth(side);
      node.classList.add("dragging");
      const move = (ev) => setPanelWidth(side, startWidth + (ev.clientX - startX) * grow);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        node.classList.remove("dragging");
        saveSettings();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
    node.addEventListener("dblclick", () => {
      setPanelWidth(side, panelLeast(side));
      saveSettings();
    });
    node.addEventListener("keydown", (event) => {
      const delta = event.key === "ArrowRight" ? 10 : event.key === "ArrowLeft" ? -10 : 0;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      setPanelWidth(side, panelWidth(side) + delta * grow);
      saveSettings();
    });
  }

  function syncPanels() {
    syncSplitters();
    [["toggleLeft", settings.showLeft], ["toggleRight", settings.showRight], ["toggleRulers", settings.showRulers]].forEach((pair) => {
      document.querySelectorAll('#toolbar [data-action="' + pair[0] + '"]').forEach((el) => {
        el.classList.toggle("on", Boolean(pair[1]));
        el.setAttribute("aria-pressed", pair[1] ? "true" : "false");
      });
    });
  }

  function syncGrid() {
    const grid = $("canvasGrid");
    if (grid) grid.hidden = !settings.showGrid;
    document.querySelectorAll('[data-action="toggleGrid"]').forEach((el) => {
      el.classList.toggle("on", Boolean(settings.showGrid));
      el.setAttribute("aria-pressed", settings.showGrid ? "true" : "false");
    });
  }

  function syncShapes() {
    const on = settings.showShapes !== false;
    document.querySelectorAll('[data-action="toggleShapes"]').forEach((el) => {
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* Only the flag of the language the button switches to; its name is the tooltip. */
  function languageButton() {
    const toEnglish = settings.language !== "en";
    const label = toEnglish ? "English" : "한국어";
    const code = toEnglish ? "uk" : "kr";
    const tip = t("view.language") + ": " + label;
    return '<button type="button" class="tool-btn lang-btn" data-action="language" data-flag="' + code + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      Icons.flag(code) + "</button>";
  }

  function toolbarActions() {
    return [
      { action: "themeCycle", icon: "themePalette", tip: t("view.theme") },
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

  /* A recent file is a row of two buttons: the name opens it, the cross beside it takes it off
   * the list without opening it. */
  function recentMenuItems() {
    const rows = (settings.recent || []).slice(0, Store.MAX_RECENT).map((row) => {
      const item = menuItem("recent:" + row.id, "file", row.name);
      item.remove = "recentRemove:" + row.id;
      item.tip = row.path || row.name;
      return item;
    });
    const recent = [menuItem("recent-label", "folder", t("file.recent"), "", true)].concat(rows);
    if (!rows.length) recent.push(menuItem("recent-none", "file", t("file.none"), "", true));
    return recent;
  }

  function menuDefinitions() {
    return [
      { id: "file", label: t("menu.file"), icon: "file", items: [
        menuItem("new", "new", t("file.new"), "Ctrl+N"),
        menuItem("open", "open", t("file.open"), "Ctrl+O"),
        menuItem("openUrl", "link", t("file.openUrl")),
        menuItem("save", "save", t("file.save"), "Ctrl+S"),
        menuItem("saveAs", "saveAs", t("file.saveAs"), "Ctrl+Shift+S"),
        menuItem("export", "download", t("file.export"), "Ctrl+E"),
        menuItem("print", "print", t("file.print"), "Ctrl+P"),
      ].concat(recentMenuItems()).concat([
        menuItem("recentManager", "folder", t("file.manageRecent")),
        menuItem("clearRecent", "trash", t("file.clearRecent"), "", !(settings.recent || []).length),
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
      { id: "draw", label: t("menu.draw"), icon: "draw", items: Paint.TOOLS.filter((tool) => !tool.panelOnly).map((tool) => (
        menuItem("tool:" + tool.id, tool.icon, t("tool." + tool.id))
      )).concat([
        menuItem("palette", "palette", t("draw.palette")),
        menuItem("bringForward", "layerUp", t("draw.bringForward")),
        menuItem("sendBackward", "layerDown", t("draw.sendBackward")),
        menuItem("canvasSize", "canvas", t("draw.canvasSize")),
        menuItem("clearDrawing", "clear", t("draw.clear")),
      ]) },
      { id: "view", label: t("menu.view"), icon: "search", items: [
        menuItem("zoomIn", "zoomIn", t("view.zoomIn"), "Ctrl++"),
        menuItem("zoomOut", "zoomOut", t("view.zoomOut"), "Ctrl+-"),
        menuItem("zoomReset", "check", t("view.zoomReset"), "Ctrl+0"),
        menuItem("toggleGrid", "grid", t("view.grid")),
        menuItem("toggleRulers", "ruler", t("view.rulers")),
        menuItem("toggleShapes", "shapes", t("view.shapes")),
        menuItem("toggleLeft", "panelLeft", t("view.left")),
        menuItem("toggleRight", "panelRight", t("view.right")),
        menuItem("home", "home", t("start.open")),
      ] },
      { id: "tools", label: t("menu.tools"), icon: "wrench", items: [
        menuItem("dicomInfo", "scan", t("dicom.info"), "", !dicomOf()),
        menuItem("dicomCine", "play", t("dicom.play"), "", !dicomOf()),
        menuItem("download", "download", t("tools.download")),
        menuItem("link", "link", t("tools.link")),
        menuItem("settings", "settings", t("file.settings")),
      ] },
      { id: "help", label: t("menu.help"), icon: "help", items: [
        menuItem("guide", "help", t("help.guide")),
        menuItem("formats", "image", t("popup.formats")),
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

  /* The home button left of the File menu: a toggle, pressed while the start screen shows. */
  function homeButton() {
    const label = startVisible ? t("start.close") : t("start.open");
    return '<button type="button" class="menu-root home-btn' + (startVisible ? " on" : "") + '" id="homeButton" data-action="toggleStart"' +
      ' aria-pressed="' + (startVisible ? "true" : "false") + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + Icons.icon("home") + "<span>" + esc(t("start.label")) + "</span></button>";
  }

  function syncHomeButton() {
    const btn = $("homeButton");
    if (!btn) return;
    const label = startVisible ? t("start.close") : t("start.open");
    btn.classList.toggle("on", startVisible);
    btn.setAttribute("aria-pressed", startVisible ? "true" : "false");
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function renderMenubar() {
    $("menubar").innerHTML =
      '<span class="app-title"><img src="assets/icon.png" width="16" height="16" alt=""><strong id="appTitle">' + esc(BUILD.title) + "</strong></span>" +
      homeButton() +
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

  const loadingImages = new Set();

  function loadMissingImages(doc) {
    doc.shapes.forEach((shape) => {
      if (shape.kind !== "image" || images[shape.src] || loadingImages.has(shape.src) || String(shape.src).indexOf("data:") !== 0) return;
      loadingImages.add(shape.src);
      const src = shape.src;
      const picture = new Image();
      picture.src = src;
      picture.decode().then(() => { images[src] = picture; loadingImages.delete(src); renderBoard(); }).catch(() => { loadingImages.delete(src); });
    });
  }

  /* The grid sits under the board, on the picture's background, in a colour that shows on it. */
  function syncGridLayer(doc) {
    const grid = $("canvasGrid");
    if (!grid) return;
    grid.style.backgroundColor = doc.background;
    const hex = /^#[0-9a-f]{6}$/i.test(doc.background) ? doc.background : "#ffffff";
    const light = parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 > 128;
    grid.style.setProperty("--grid-ink", light ? "0, 0, 0" : "255, 255, 255");
  }

  function renderBoard() {
    const doc = current();
    const board = $("board");
    if (!doc || !board) return;
    board.style.cursor = dragState ? "move" : (TOOL_CURSORS[settings.tool] || "crosshair");
    if (board.width !== doc.width) board.width = doc.width;
    if (board.height !== doc.height) board.height = doc.height;
    document.documentElement.style.setProperty("--canvas-w", doc.width + "px");
    document.documentElement.style.setProperty("--canvas-h", doc.height + "px");
    syncEffects();
    loadMissingImages(doc);
    syncGridLayer(doc);
    const ctx = board.getContext("2d");
    let shapes = doc.shapes;
    if (textEditing) shapes = shapes.filter((shape) => shape.id !== textEditing);
    Paint.render(ctx, doc, {
      preview: draft,
      images: images,
      shapes: shapes,
      // the grid lies between the background and the shapes: the board leaves the background to it
      noBackground: Boolean(settings.showGrid),
    });
    renderOverlay();
    layoutTextEditor();
    scheduleRulers();
  }

  /* The eight handles of the one selected shape; several selected move together, without them. */
  const RESIZE_HANDLES = [["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0], ["e", 1, 0.5], ["se", 1, 1], ["s", 0.5, 1], ["sw", 0, 1], ["w", 0, 0.5]];

  function shapeHandles(shape, box, factor) {
    if (selected.length !== 1 || textEditing === shape.id) return "";
    return RESIZE_HANDLES.map((row) => (
      '<i class="shape-handle" data-handle="' + row[0] + '" style="left:' + ((box.x + box.w * row[1]) * factor) + "px;top:" + ((box.y + box.h * row[2]) * factor) + 'px"></i>'
    )).join("");
  }

  /* A handle is dragged from the shape as it was, so the drag never accumulates rounding. One
   * drag is one undo step, and a press that does not move leaves no step behind. */
  function wireShapeHandles() {
    $("canvasOverlay").addEventListener("pointerdown", (event) => {
      const grip = event.target.closest && event.target.closest(".shape-handle");
      if (!grip || event.button !== 0) return;
      const shape = firstSelected();
      if (!shape) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = grip.dataset.handle;
      const origin = JSON.stringify(shape);
      const box = Paint.bounds(shape);
      let moved = false;
      const move = (ev) => {
        const point = toDocPoint(ev.clientX, ev.clientY);
        if (!moved) { pushUndo(); moved = true; }
        const copy = JSON.parse(origin);
        Paint.resizeShape(copy, handle, Paint.resizedBox(box, handle, point.x, point.y));
        Object.keys(copy).forEach((key) => { shape[key] = copy[key]; });
        markDirty();
        renderBoard();
        renderOverlay();
        renderRight();
        renderStatus();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (moved) renderAll();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  }

  function renderOverlay() {
    const overlay = $("canvasOverlay");
    if (!overlay) return;
    const factor = scale();
    const doc = current();
    const shapes = selectedShapes().map((shape) => {
      const box = Paint.bounds(shape);
      return '<div class="marquee" style="left:' + (box.x * factor) + "px;top:" + (box.y * factor) +
        "px;width:" + Math.max(2, box.w * factor) + "px;height:" + Math.max(2, box.h * factor) + 'px"></div>' + shapeHandles(shape, box, factor);
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

  /* ── start screen ──
   * Over the work area when the program starts (if the settings say so) and whenever Home is
   * pressed. The view lives in start-screen.js; this is what it needs from the program. */
  function startPrefs() {
    return Store.normalizeStart(settings.startScreen);
  }

  function startScreen() {
    if (startView) return startView;
    startView = StartScreen.create({
      el: $("startScreen"),
      t: t,
      esc: esc,
      icon: Icons.icon,
      build: BUILD,
      prefs: startPrefs,
      savePrefs: saveStartPrefs,
      run: runAction,
      recent: () => (settings.recent || []).slice(0, Store.MAX_RECENT),
      docs: () => docs,
      activeIndex: () => active,
      isDrawing: (name) => DRAWING_EXT.test(name),
      themes: () => Themes.THEMES,
      customTheme: () => Themes.byId("custom", settings.custom),
      themeId: () => settings.theme,
      themeName: (item) => Themes.nameOf(item, settings.language),
    });
    return startView;
  }

  /* A change made on the start screen: nothing is rebuilt, and an open Settings window follows. */
  function saveStartPrefs(patch) {
    settings.startScreen = Store.normalizeStart(Object.assign({}, settings.startScreen, patch));
    saveSettings();
    if (startVisible) startScreen().syncPrefs();
    if (popupKind === "settings") refreshSettingsPopup();
    return settings.startScreen;
  }

  function renderStart() {
    if (startVisible) startScreen().render();
  }

  function showStart() {
    if (textEditing) finishTextEditor();
    closeMenu();
    startVisible = true;
    startScreen().show();
    syncHomeButton();
    return true;
  }

  function hideStart() {
    if (!startVisible) return false;
    startVisible = false;
    startScreen().hide();
    syncHomeButton();
    scheduleRulers();
    return true;
  }

  /* ── rulers ──
   * Two strips along the top and the left of the stage, counting picture pixels from the
   * picture's top-left corner. The step between numbers follows the zoom so the labels never
   * crowd, and is cut into fifths like the grid. A mark follows the pointer. */
  const RULER_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const RULER_SIZE = 20;
  const RULER_MARK = "#ef4444";
  let rulerFrame = 0;

  function rulerStep(zoom) {
    return RULER_STEPS.find((step) => step * zoom >= 48) || RULER_STEPS[RULER_STEPS.length - 1];
  }

  function scheduleRulers() {
    if (rulerFrame || !settings.showRulers) return;
    rulerFrame = requestAnimationFrame(() => { rulerFrame = 0; renderRulers(); });
  }

  function paintRuler(canvas, length, origin, zoom, vertical, mark) {
    const ratio = window.devicePixelRatio || 1;
    const width = vertical ? RULER_SIZE : length;
    const height = vertical ? length : RULER_SIZE;
    // the strip's size on screen comes from the layout; only its backing store is set here
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const ctx = canvas.getContext("2d");
    const css = getComputedStyle(document.documentElement);
    const ink = (css.getPropertyValue("--muted") || "#667085").trim();
    const line = (css.getPropertyValue("--line") || "#d0d5dd").trim();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (vertical) { ctx.moveTo(RULER_SIZE - 0.5, 0); ctx.lineTo(RULER_SIZE - 0.5, length); }
    else { ctx.moveTo(0, RULER_SIZE - 0.5); ctx.lineTo(length, RULER_SIZE - 0.5); }
    ctx.stroke();
    const step = rulerStep(zoom);
    const minor = step / 5;
    const first = Math.floor((-origin / zoom) / minor) * minor;
    const last = (length - origin) / zoom;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.font = "10px " + cssFamily("Segoe UI");
    ctx.textBaseline = "top";
    ctx.beginPath();
    for (let value = first; value <= last + minor; value += minor) {
      const at = Math.round(origin + value * zoom) + 0.5;
      if (at < 0 || at > length) continue;
      const major = Math.abs(value / step - Math.round(value / step)) < 1e-6;
      const tick = major ? RULER_SIZE : (Math.abs((value / minor) % 5) === 0 ? 10 : 5);
      if (vertical) { ctx.moveTo(RULER_SIZE - tick, at); ctx.lineTo(RULER_SIZE, at); }
      else { ctx.moveTo(at, RULER_SIZE - tick); ctx.lineTo(at, RULER_SIZE); }
      if (major) {
        const label = String(Math.round(value));
        if (vertical) {
          ctx.save();
          ctx.translate(2, at + 2);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(label, 0, -9);
          ctx.restore();
        } else {
          ctx.fillText(label, at + 2, 2);
        }
      }
    }
    ctx.stroke();
    if (mark != null) {
      const at = Math.round(origin + mark * zoom) + 0.5;
      ctx.strokeStyle = RULER_MARK;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(0, at); ctx.lineTo(RULER_SIZE, at); }
      else { ctx.moveTo(at, 0); ctx.lineTo(at, RULER_SIZE); }
      ctx.stroke();
    }
    return step;
  }

  function renderRulers() {
    const wrap = $("stageWrap");
    if (!wrap) return null;
    wrap.classList.toggle("no-rulers", !settings.showRulers);
    if (!settings.showRulers) return null;
    const stage = $("stage");
    const frame = $("canvasFrame");
    const top = $("rulerH");
    const side = $("rulerV");
    if (!stage || !frame || !top || !side) return null;
    const stageBox = stage.getBoundingClientRect();
    const box = $("board").getBoundingClientRect();
    const zoom = scale();
    const mark = pointerSeen ? pointer : null;
    const step = paintRuler(top, stageBox.width, box.left - stageBox.left, zoom, false, mark ? mark.x : null);
    paintRuler(side, stageBox.height, box.top - stageBox.top, zoom, true, mark ? mark.y : null);
    return { step: step, originX: box.left - stageBox.left, originY: box.top - stageBox.top };
  }

  const WIDTHS = [1, 2, 4, 8, 12, 20];

  function panelBar(side, titleKey, iconName) {
    const open = side === "left" ? settings.showLeft : settings.showRight;
    const action = side === "left" ? "toggleLeft" : "toggleRight";
    const label = open ? t("panel.fold") : t("panel.unfold");
    const stripe = side === "left" ? 9 : 15;
    const inward = side === "left" ? (open ? "M16.5 8.5 13 12l3.500 3.500" : "M13 8.500 16.500 12 13 15.500") : (open ? "M7.500 8.500 11 12l-3.500 3.500" : "M11 8.500 7.500 12l3.500 3.500");
    const shade = open ? '<rect class="fold-shade" x="' + (side === "left" ? 3 : 15) + '" y="4.500" width="6" height="15" fill="#38bdf8"/>' : "";
    return '<div class="panel-bar">' + Icons.icon(iconName) + "<span>" + esc(t(titleKey)) + "</span>" +
      '<button type="button" class="panel-fold" data-action="' + action + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' + shade + '<rect x="3" y="4.500" width="18" height="15" rx="2" stroke="#2563eb"/><path d="M' + stripe + ' 4.500v15" stroke="#2563eb"/><path class="fold-arrow" d="' + inward + '" stroke="#f97316"/></svg></button></div>';
  }

  function sizingEraser() {
    return settings.tool === "eraser";
  }

  /* The shapes the line width goes to: picked as for a colour; a text or a picture has no line. */
  function widthTargets() {
    return colorTargets().filter((shape) => shape.kind !== "text" && shape.kind !== "image" && shape.kind !== "eraser");
  }

  /* With a shape picked, the width control shows that shape's line. */
  function activeSize() {
    if (sizingEraser()) return settings.eraserSize;
    const picked = widthTargets();
    return picked.length ? picked[0].width : settings.strokeWidth;
  }

  function widthMark(width) {
    if (sizingEraser()) {
      const side = Math.max(4, Math.min(14, 3 + width * 0.5));
      const x = (36 - side) / 2;
      const y = (16 - side) / 2;
      return '<rect x="' + x + '" y="' + y + '" width="' + side + '" height="' + side + '" rx="1" fill="currentColor"/>';
    }
    const thick = Math.max(1.4, Math.min(7.5, width * 0.42));
    return '<line x1="4" y1="8" x2="32" y2="8" stroke="currentColor" stroke-linecap="round" stroke-width="' + thick + '"/>';
  }

  function widthPicks() {
    const label = t(sizingEraser() ? "palette.eraser" : "palette.width");
    const current = activeSize();
    return '<div class="width-picks" role="group" aria-label="' + esc(label) + '">' +
      WIDTHS.map((width) => {
        const on = current === width;
        return '<button type="button" class="width-pick' + (on ? " on" : "") + '" data-action="width:' + width + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          '<svg viewBox="0 0 36 16" aria-hidden="true">' + widthMark(width) + "</svg></button>";
      }).join("") + "</div>";
  }

  /* The size field is exactly as wide as its digits, so the number and its "px" sit in the
   * middle of the box together instead of the number hugging a fixed-width field's right edge. */
  function digitsWidth(value) {
    return Math.max(1, String(value == null ? "" : value).trim().length) + "ch";
  }

  function widthStep() {
    const width = activeSize();
    const label = t(sizingEraser() ? "palette.eraser" : "palette.width");
    const down = width <= 1 ? " disabled" : "";
    const up = width >= 96 ? " disabled" : "";
    return '<div class="width-step" role="group" aria-label="' + esc(label) + '">' +
      '<button type="button" data-action="strokeDown" title="' + esc(t("palette.thinner")) + '" aria-label="' + esc(t("palette.thinner")) + '"' + down + ">-</button>" +
      '<label class="width-now" title="' + esc(label) + '">' +
      '<input type="number" min="1" max="96" data-pick="size" value="' + width + '" style="width:' + digitsWidth(width) + '" aria-label="' + esc(label + " " + width + "px") + '">' +
      '<span class="unit">px</span></label>' +
      '<button type="button" data-action="strokeUp" title="' + esc(t("palette.thicker")) + '" aria-label="' + esc(t("palette.thicker")) + '"' + up + ">+</button>" +
      "</div>";
  }

  function renderLeft() {
    const doc = current();
    $("leftPanel").classList.toggle("collapsed", !settings.showLeft);
    const tools = Paint.TOOLS.map((tool) => (
      '<button type="button" class="tool-cell' + (settings.tool === tool.id ? " on" : "") + '" data-action="tool:' + tool.id + '" title="' + esc(t("tool." + tool.id)) + '" aria-label="' + esc(t("tool." + tool.id)) + '">' +
      Icons.icon(tool.icon) + "</button>"
    )).join("");
    const swatches = Paint.PALETTE.map((color) => (
      '<button type="button" class="swatch-btn' + (settings.color === color ? " on" : "") + '" data-action="color:' + color + '" style="background:' + color + '" title="' + esc(color) + '" aria-label="' + esc(color) + '"></button>'
    )).join("");
    const shapeRows = (doc ? doc.shapes.filter((shape) => !shape.svgFrame) : []).slice().reverse().map((shape) => (
      '<div class="shape-item' + (selected.indexOf(shape.id) >= 0 ? " active" : "") + '">' +
      '<button type="button" class="shape-pick" data-action="shape:' + esc(shape.id) + '" title="' + esc(t("kind." + shape.kind)) + '">' +
      Icons.icon(shape.kind) +
      "<span>" + esc(t("kind." + shape.kind)) + "</span>" +
      '<i class="dot" style="background:' + esc(shape.fill || shape.color) + '"></i></button>' +
      '<button type="button" class="shape-remove" data-action="removeShape:' + esc(shape.id) + '" title="' + esc(t("left.removeShape")) + '" aria-label="' + esc(t("left.removeShape")) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></div>'
    )).join("") || '<div class="line" style="padding:0 8px">' + esc(t("status.none")) + "</div>";
    $("leftPanel").innerHTML = [
      panelBar("left", "left.tools", "wrench"),
      '<div class="tool-grid">' + tools + "</div>",
      "<h2>" + esc(t("left.colors")) + "</h2>",
      '<div class="swatches">' + swatches + "</div>",
      '<div class="color-row"><span>' + esc(t("palette.color")) + "</span>" + colorButton("pick:color", settings.color, t("palette.color")) + "</div>",
      '<div class="color-row"><span>' + esc(t("palette.fill")) + "</span>" + colorButton("pick:fillColor", settings.fillColor, t("palette.fill"), true) + "</div>",
      '<label class="color-row"><span>' + esc(t("palette.none")) + '</span><input type="checkbox" data-pick="noFill"' + (settings.fillColor ? "" : " checked") + ' title="' + esc(t("palette.none")) + '"></label>',
      widthPicks(),
      widthStep(),
      settings.showShapes === false ? "" : "<h2>" + Icons.icon("shapes") + "<span>" + esc(t("left.shapes")) + "</span></h2>" + '<div class="shape-list">' + shapeRows + "</div>",
    ].join("");
  }

  /* A colour is a swatch button; pressing it opens the chooser beside it (colorpicker.js). */
  function colorButton(target, value, label, allowNone) {
    const shown = value || "";
    return '<button type="button" class="color-swatch-btn' + (shown ? "" : " none") + '" data-color="' + target + '"' + (allowNone ? " data-allow-none" : "") +
      ' style="--swatch:' + esc(shown || "transparent") + '" title="' + esc(label) + '" aria-label="' + esc(label + " " + (shown || t("palette.none"))) + '">' +
      '<i class="chip"></i><span class="hex">' + esc(shown || t("palette.none")) + "</span></button>";
  }

  function colorLine(label, control) {
    return '<div class="line prop-line"><span>' + esc(label) + "</span>" + control + "</div>";
  }

  function colorValueOf(target) {
    const doc = current();
    const shape = firstSelected();
    if (target === "pick:color") return settings.color;
    if (target === "pick:fillColor") return settings.fillColor || "";
    if (target === "pixel:color") return regionColor();
    if (target === "prop:background") return doc ? doc.background : "#ffffff";
    if (target === "prop:color") return shape ? shape.color : "";
    if (target === "prop:fill") return shape ? shape.fill || "" : "";
    if (target.indexOf("fx:") === 0) {
      const parts = target.slice(3).split(".");
      return effectsOf(fxOwners(doc)[0])[parts[0]][parts[1]];
    }
    return "";
  }

  function rememberColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
    settings.recentColors = [color].concat((settings.recentColors || []).filter((item) => item !== color)).slice(0, 12);
  }

  /* Writing a colour while the chooser is open draws it at once; the undo step is taken on
   * the first change, so one visit to the chooser is one undo. */
  function writeColor(target, color, session) {
    const doc = current();
    const shape = firstSelected();
    if (target === "pick:color") {
      if (color) {
        settings.color = color;
        if (region && !selected.length) paintRegion(color, session);
        else recolorSelection("color", color, session);
      }
      return;
    }
    if (target.indexOf("fx:") === 0) {
      if (!doc || !color) return;
      if (!session.undo) { fxBegin(doc); session.undo = true; }
      fxOwners(doc).forEach((owner) => writeEffect(owner, target.slice(3), color));
      effectsChanged(doc);
      syncFxWheel(false);
      return;
    }
    if (target === "pick:fillColor") { settings.fillColor = color || ""; recolorSelection("fill", color || "", session); return; }
    if (target === "pixel:color") { paintRegion(color, session); return; }
    if (target.indexOf("prop:") !== 0 || !doc) return;
    if (!session.undo) { pushUndo(); session.undo = true; }
    const key = target.slice(5);
    if (key === "background") { if (color) doc.background = color; }
    else if (shape) {
      selectedShapes().forEach((item) => {
        if (key === "fill") { if (Paint.isFillable(item.kind)) item.fill = color || ""; return; }
        if (!color) return;
        item.color = color;
        if (item.kind === "text" && Array.isArray(item.runs)) {
          Paint.setTextRuns(item, Paint.restyleRuns(Paint.textRuns(item), 0, item.text.length, { color: color }, Paint.styleOfShape(item)));
        }
      });
    }
    markDirty();
    renderBoard();
  }

  function openColorFor(btn) {
    if (!window.MyPaintColorPicker || ColorPicker.recentlyClosed(btn)) return null;
    const target = btn.dataset.color;
    const session = { undo: false };
    const paintButton = (color) => {
      btn.style.setProperty("--swatch", color || "transparent");
      btn.classList.toggle("none", !color);
      const hex = btn.querySelector(".hex");
      if (hex) hex.textContent = color || t("palette.none");
    };
    return ColorPicker.open({
      anchor: btn,
      value: colorValueOf(target),
      allowNone: btn.hasAttribute("data-allow-none"),
      palette: Paint.PALETTE,
      recent: settings.recentColors || [],
      labels: { title: btn.title, none: t("palette.none"), palette: t("left.colors"), recent: t("color.recent"), hex: "HEX" },
      onInput: (color) => { paintButton(color); writeColor(target, color, session); },
      onChange: (color) => { rememberColor(color); },
      onClose: () => {
        saveSettings();
        if (target.indexOf("pick:") === 0) renderLeft();
        else { renderRight(); renderLeft(); renderTabs(); }
        renderStatus();
      },
    });
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

  /* ── the source of an SVG document ──
   * doc.svg is always a source that drew. What is being typed stays in extras as svgDraft until it
   * draws, so saving in the middle of a mistake still writes a good file. The picture is the
   * svgFrame image shape, whose pixels come from doc.svg and stay out of the saved drawing. */

  function svgFacts(doc) {
    const info = SvgDoc.inspect(doc.svg);
    return {
      size: doc.width + " × " + doc.height,
      viewBox: info.viewBox ? info.viewBox.join(" ") : t("status.none"),
      total: String(info.total || 0),
    };
  }

  function svgSection(doc) {
    if (!doc || !doc.svg || !SvgDoc) return "";
    const facts = svgFacts(doc);
    const fact = (key, id, value) => '<div class="line"><span>' + esc(t(key)) + '</span><b class="grow" id="' + id + '">' + esc(value) + "</b></div>";
    const error = extrasOf(doc).svgError;
    return '<h2 class="fx-title">' + Icons.icon("image") + "<span>" + esc(t("svg.title")) + "</span></h2>" +
      '<div class="props svg-section">' +
      fact("svg.size", "svgSize", facts.size) +
      fact("svg.viewBox", "svgViewBox", facts.viewBox) +
      fact("svg.elements", "svgElements", facts.total) +
      '<div class="svg-error" id="svgError" role="alert"' + (error ? "" : " hidden") + ">" + esc(error ? t("svg.error") + " " + error : "") + "</div>" +
      '<textarea id="svgSource" class="svg-source" spellcheck="false" wrap="off" aria-label="' + esc(t("svg.title")) + '"></textarea>' +
      "</div>";
  }

  /* The facts and the error change in place, so the box being typed in is left alone. */
  function showSvgState(doc) {
    if (doc !== current() || !$("svgSource")) return;
    const facts = svgFacts(doc);
    $("svgSize").textContent = facts.size;
    $("svgViewBox").textContent = facts.viewBox;
    $("svgElements").textContent = facts.total;
    const error = extrasOf(doc).svgError;
    $("svgError").hidden = !error;
    $("svgError").textContent = error ? t("svg.error") + " " + error : "";
  }

  function svgFrameOf(doc) {
    return doc.shapes.find((shape) => shape.svgFrame) || null;
  }

  function forgetSvgEdits() {
    if (svgTimer) clearTimeout(svgTimer);
    svgTimer = null;
    svgToken += 1;
    svgEditUndo = null;
    docs.forEach((doc) => {
      const item = extras.get(doc.id);
      if (item) { delete item.svgDraft; delete item.svgError; }
    });
  }

  /* Draws doc.svg into the frame; the board shows it as soon as it is there. */
  async function drawSvgFrame(doc) {
    const text = doc.svg;
    const canvas = await SvgDoc.rasterize(text, doc.width, doc.height);
    if (doc.svg !== text || docs.indexOf(doc) < 0) return false;
    images[frameKey(doc)] = canvas;
    extrasOf(doc).svgDrawn = text;
    if (doc === current()) renderBoard();
    return true;
  }

  /* A drawing that was saved or kept with its source: the document has a new id, so its frame
   * shape is pointed at the new key and drawn from the source. */
  function attachSvgFrame(doc) {
    if (!doc.svg || !SvgDoc) return;
    let frame = svgFrameOf(doc);
    if (!frame) {
      frame = Paint.makeShape("image", { x: 0, y: 0, w: doc.width, h: doc.height, width: 1, svgFrame: true });
      doc.shapes.unshift(frame);
    }
    frame.src = frameKey(doc);
    drawSvgFrame(doc).catch(showError);
  }

  /* The canvas size was changed from outside the source: the source follows, and the picture
   * scales with it through its viewBox. */
  function svgFollowCanvas(doc) {
    if (!doc.svg || !SvgDoc) return;
    doc.svg = SvgDoc.setSize(doc.svg, doc.width, doc.height);
    const frame = svgFrameOf(doc);
    if (frame) { frame.w = doc.width; frame.h = doc.height; }
    delete extrasOf(doc).svgDraft;
    delete extrasOf(doc).svgError;
    drawSvgFrame(doc).catch(showError);
  }

  /* The picture stopped being its source (cropped, erased, cleared): it is plain pixels now. */
  function dropSvgSource(doc) {
    if (!doc.svg) return;
    delete doc.svg;
    const item = extrasOf(doc);
    delete item.svgDraft;
    delete item.svgError;
    delete item.svgDrawn;
  }

  async function applySvgSource(doc) {
    const item = extrasOf(doc);
    const text = item.svgDraft;
    if (text == null || !doc.svg) return false;
    const token = ++svgToken;
    if (text === doc.svg) {
      delete item.svgDraft;
      delete item.svgError;
      showSvgState(doc);
      return true;
    }
    const info = SvgDoc.inspect(text);
    let canvas = null;
    let problem = info.ok ? "" : info.error;
    if (info.ok) {
      try {
        canvas = await SvgDoc.rasterize(text, info.width, info.height);
      } catch (error) {
        problem = error.message;
      }
    }
    if (token !== svgToken) return false;
    if (problem) {
      item.svgError = problem;
      showSvgState(doc);
      return false;
    }
    if (svgEditUndo !== doc.id || document.activeElement !== $("svgSource")) {
      pushUndo();
      svgEditUndo = doc.id;
    }
    const resized = doc.width !== info.width || doc.height !== info.height;
    doc.svg = text;
    doc.width = info.width;
    doc.height = info.height;
    const frame = svgFrameOf(doc);
    if (frame) { frame.w = info.width; frame.h = info.height; }
    images[frameKey(doc)] = canvas;
    item.svgDrawn = text;
    delete item.svgDraft;
    delete item.svgError;
    doc.dirty = true;
    persistSession();
    if (resized && doc === current()) renderAll();
    else {
      renderBoard();
      renderTabs();
      renderStatus();
    }
    showSvgState(doc);
    return true;
  }

  function onSvgInput(target) {
    const doc = current();
    if (!doc || !doc.svg) return;
    extrasOf(doc).svgDraft = target.value;
    if (svgTimer) clearTimeout(svgTimer);
    svgTimer = setTimeout(() => {
      svgTimer = null;
      svgPending = applySvgSource(doc).catch(showError);
    }, SVG_REDRAW_MS);
  }

  function flushSvg() {
    if (svgTimer) {
      clearTimeout(svgTimer);
      svgTimer = null;
      const doc = current();
      if (doc) svgPending = applySvgSource(doc).catch(showError);
    }
    return svgPending;
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

  /* ── effects ──
   * Values kept with the document, never in its pixels (effects.js): the board previews them,
   * and a picture format gets them burnt in when it is saved. */
  function effectsOf(doc) {
    return Effects.normalize(doc && doc.effects);
  }

  /* What the effects apply to: the selected shapes and text, or else the whole picture. */
  function fxOwners(doc) {
    const shapes = selectedShapes();
    return shapes.length ? shapes : (doc ? [doc] : []);
  }

  /* An area picked with a marquee becomes a picture of its own, in place, so an effect changes that
   * part only and the drawing under it stays as it was. */
  function liftRegion(doc) {
    if (!region || selected.length) return;
    const cut = regionCanvas();
    if (!cut) return;
    const src = cut.canvas.toDataURL("image/png");
    images[src] = cut.canvas;
    const shape = Paint.addShape(doc, Paint.makeShape("image", { src: src, x: Math.round(cut.box.x), y: Math.round(cut.box.y), w: cut.canvas.width, h: cut.canvas.height, width: 1, lifted: true }));
    selected = [shape.id];
    region = null;
    renderOverlay();
  }

  /* What a reset covers: the selection; or the shapes an area touches, never the whole picture when
   * only a part of it is picked; or, with nothing selected, the picture's own effects. */
  function fxResetTargets(doc) {
    const shapes = selectedShapes();
    if (shapes.length) return shapes;
    if (!doc) return [];
    if (region) {
      const box = Paint.regionBounds(region);
      return doc.shapes.filter((shape) => shape.effects && !Paint.isBackdrop(shape) && Paint.boxesOverlap(Paint.bounds(shape), box));
    }
    return [doc];
  }

  const hasEffects = (owner) => !Effects.isPlain(effectsOf(owner));

  /* The undo step and the area, before a change: one call for one change. */
  function fxBegin(doc) {
    pushUndo();
    liftRegion(doc);
  }

  function fxSection(doc) {
    const fx = effectsOf(fxOwners(doc)[0]);
    const scope = selectedShapes().length ? "fx.scope.shape" : (region ? "fx.scope.region" : "fx.scope.doc");
    const L = Effects.LIMITS;
    const spin = (name, value, range, step, key) => propLine(t(key), propSpin("fx", name, value, range[0], range[1], step, t(key)));
    const sub = (icon, key) => '<div class="fx-sub">' + Icons.icon(icon) + "<span>" + esc(t(key)) + "</span></div>";
    const looks = Effects.LOOK_IDS.map((id) => (
      '<button type="button" class="fx-look' + (fx.look === id ? " on" : "") + '" data-action="fxLook:' + id + '" aria-pressed="' + (fx.look === id ? "true" : "false") + '" title="' + esc(t("fx.look." + id)) + '">' +
      '<i class="fx-chip" style="filter:' + Effects.lookFilter(id) + '"></i><span>' + esc(t("fx.look." + id)) + "</span></button>"
    )).join("");
    const check = (name, on, key) => '<label class="line prop-line fx-check"><input data-fx="' + name + '" type="checkbox"' + (on ? " checked" : "") + "><span>" + esc(t(key)) + "</span></label>";
    return '<h2 class="fx-title">' + Icons.icon("effects") + "<span>" + esc(t("right.effects")) + "</span></h2>" +
      '<div class="props fx-section">' +
      '<div class="fx-scope" data-scope="' + scope.slice(9) + '">' + esc(t(scope)) + "</div>" +
      '<div class="line"><button type="button" class="action grow" data-action="fxReset"' + (fxResetTargets(doc).some(hasEffects) ? "" : " disabled") + ">" + Icons.icon("undo") + "<span>" + esc(t("fx.reset")) + "</span></button></div>" +
      '<div class="fx-looks">' + looks + "</div>" +
      spin("brightness", fx.brightness, L.brightness, 5, "fx.brightness") +
      spin("contrast", fx.contrast, L.contrast, 5, "fx.contrast") +
      spin("saturate", fx.saturate, L.saturate, 5, "fx.saturate") +
      spin("blur", fx.blur, L.blur, 1, "fx.blur") +
      sub("themePalette", "fx.wheel") +
      fxWheelBlock(fx) +
      sub("rect", "fx.border") +
      spin("border.top", fx.border.top, L.border, 1, "fx.top") +
      spin("border.bottom", fx.border.bottom, L.border, 1, "fx.bottom") +
      spin("border.left", fx.border.left, L.border, 1, "fx.left") +
      spin("border.right", fx.border.right, L.border, 1, "fx.right") +
      colorLine(t("fx.color"), colorButton("fx:border.color", fx.border.color, t("fx.border") + " " + t("fx.color"))) +
      sub("layerDown", "fx.shadow") +
      check("shadow.on", fx.shadow.on, "fx.shadowOn") +
      spin("shadow.x", fx.shadow.x, L.offset, 1, "fx.x") +
      spin("shadow.y", fx.shadow.y, L.offset, 1, "fx.y") +
      spin("shadow.blur", fx.shadow.blur, L.shadowBlur, 1, "fx.shadowBlur") +
      spin("shadow.opacity", fx.shadow.opacity, L.opacity, 5, "fx.opacity") +
      colorLine(t("fx.color"), colorButton("fx:shadow.color", fx.shadow.color, t("fx.shadow") + " " + t("fx.color"))) +
      colorLine(t("fx.backdrop"), colorButton("fx:shadow.backdrop", fx.shadow.backdrop, t("fx.backdrop"))) +
      check("shadow.transparent", fx.shadow.transparent, "fx.transparent") +
      "</div>";
  }

  const FX_WHEEL_SIZE = 148;
  const FX_WHEEL_TARGETS = [["border.color", "fx.border"], ["shadow.color", "fx.shadow"], ["shadow.backdrop", "fx.backdrop"]];

  function fxColor(fx, name) {
    const parts = name.split(".");
    return fx[parts[0]][parts[1]];
  }

  function fxWheelBlock(fx) {
    const hsv = ColorWheel.hexToHsv(fxColor(fx, fxWheelTarget));
    const tabs = FX_WHEEL_TARGETS.map((row) => (
      '<button type="button" class="fx-target' + (fxWheelTarget === row[0] ? " on" : "") + '" data-action="fxWheel:' + row[0] + '" aria-pressed="' + (fxWheelTarget === row[0] ? "true" : "false") + '">' + esc(t(row[1])) + "</button>"
    )).join("");
    return '<div class="fx-targets">' + tabs + "</div>" +
      '<div class="fx-wheel" id="fxWheel"><canvas id="fxWheelDisc" width="' + FX_WHEEL_SIZE + '" height="' + FX_WHEEL_SIZE + '" title="' + esc(t("fx.wheel")) + '"></canvas><i class="fx-wheel-mark" id="fxWheelMark"></i></div>' +
      propLine(t("fx.value"), propSpin("fxwheel", "value", Math.round(hsv.v * 100), 0, 100, 5, t("fx.value")));
  }

  /* The disc is drawn once after the panel is built; a drag moves only the mark and the swatch. */
  function syncFxWheel(paintDisc) {
    const disc = $("fxWheelDisc");
    const mark = $("fxWheelMark");
    if (!disc || !mark) return;
    if (paintDisc) ColorWheel.paint(disc);
    const fx = effectsOf(fxOwners(current())[0]);
    const hex = fxColor(fx, fxWheelTarget);
    const at = ColorWheel.position(ColorWheel.hexToHsv(hex), FX_WHEEL_SIZE);
    mark.style.left = at.x + "px";
    mark.style.top = at.y + "px";
    mark.style.background = hex;
    const swatch = $("rightPanel").querySelector('[data-color="fx:' + fxWheelTarget + '"]');
    if (swatch) {
      swatch.style.setProperty("--swatch", hex);
      swatch.querySelector(".hex").textContent = hex;
    }
  }

  function setFxWheelColor(hsv) {
    const doc = current();
    if (!doc) return;
    fxOwners(doc).forEach((owner) => writeEffect(owner, fxWheelTarget, ColorWheel.hsvToHex(hsv.h, hsv.s, hsv.v)));
    effectsChanged(doc);
    syncFxWheel(false);
  }

  /* One drag is one undo step. A colour with no value would not change at all, so picking on the
   * disc brings a black one up to full value. */
  function onFxWheelDown(event) {
    if (event.button !== 0 || event.target.id !== "fxWheelDisc") return;
    const disc = event.target;
    const box = disc.getBoundingClientRect();
    const first = ColorWheel.pick(event.clientX - box.left, event.clientY - box.top, box.width, false);
    if (!first) return;
    event.preventDefault();
    const doc = current();
    if (!doc) return;
    fxBegin(doc);
    const was = ColorWheel.hexToHsv(fxColor(effectsOf(fxOwners(doc)[0]), fxWheelTarget));
    const value = was.v > 0 ? was.v : 1;
    const apply = (spot) => setFxWheelColor({ h: spot.h, s: spot.s, v: value });
    apply(first);
    const move = (ev) => {
      const now = disc.getBoundingClientRect();
      apply(ColorWheel.pick(ev.clientX - now.left, ev.clientY - now.top, now.width, true));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      renderRight();
      if (popupKind === "convert") refreshPopupDocument("convert");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /* Writes one value, "border.top" style; the undo step is the caller's. */
  function writeEffect(doc, name, value) {
    const fx = effectsOf(doc);
    const parts = name.split(".");
    if (parts.length === 2) fx[parts[0]][parts[1]] = value;
    else fx[name] = value;
    doc.effects = Effects.normalize(fx);
  }

  /* The preview: a CSS filter on the board, and behind it a layer for the border and the shadow.
   * The stage makes room around the picture so the whole frame can be scrolled to. */
  function syncEffects() {
    const doc = current();
    const board = $("board");
    const layer = $("canvasEffect");
    const frame = $("canvasFrame");
    const stage = $("stage");
    if (!doc || !board || !layer || !frame || !stage) return;
    const fx = effectsOf(doc);
    const zoom = scale();
    board.style.filter = Effects.cssFilter(fx, zoom);
    const framed = Effects.hasFrame(fx);
    layer.hidden = !framed;
    frame.classList.toggle("fx-framed", framed);
    if (!framed) { stage.style.padding = ""; return; }
    layer.style.top = -fx.border.top * zoom + "px";
    layer.style.left = -fx.border.left * zoom + "px";
    layer.style.right = -fx.border.right * zoom + "px";
    layer.style.bottom = -fx.border.bottom * zoom + "px";
    layer.style.background = fx.border.color;
    layer.style.boxShadow = fx.shadow.on ? (fx.shadow.x * zoom) + "px " + (fx.shadow.y * zoom) + "px " + (fx.shadow.blur * zoom) + "px " + Effects.shadowColour(fx) : "none";
    const reach = Effects.extents(fx);
    stage.style.padding = [reach.top, reach.right, reach.bottom, reach.left].map((value) => (20 + value * zoom) + "px").join(" ");
  }

  function effectsChanged(doc) {
    doc.dirty = true;
    persistSession();
    renderBoard();
    renderTabs();
    renderStatus();
    scheduleRulers();
  }

  function onEffectChange(event) {
    const target = event.target;
    if (target.dataset && target.dataset.fxwheel) {
      const owner = current();
      if (!owner) return;
      fxBegin(owner);
      const hsv = ColorWheel.hexToHsv(fxColor(effectsOf(fxOwners(owner)[0]), fxWheelTarget));
      const value = Math.max(0, Math.min(100, Number(target.value) || 0)) / 100;
      setFxWheelColor({ h: hsv.h, s: hsv.s, v: value });
      renderRight();
      return;
    }
    if (!target.dataset || !target.dataset.fx) return;
    const doc = current();
    if (!doc) return;
    fxBegin(doc);
    fxOwners(doc).forEach((owner) => writeEffect(owner, target.dataset.fx, target.type === "checkbox" ? target.checked : target.value));
    effectsChanged(doc);
    // the typed value may have been limited; the rebuilt panel shows the one in force
    renderRight();
    if (popupKind === "convert") refreshPopupDocument("convert");
  }

  function setEffectLook(id) {
    const doc = current();
    if (!doc) return null;
    fxBegin(doc);
    fxOwners(doc).forEach((owner) => writeEffect(owner, "look", id));
    effectsChanged(doc);
    renderRight();
    return effectsOf(fxOwners(doc)[0]);
  }

  function resetEffects() {
    const doc = current();
    if (!doc) return null;
    const targets = fxResetTargets(doc).filter(hasEffects);
    if (!targets.length) return effectsOf(fxOwners(doc)[0]);
    pushUndo();
    targets.forEach((owner) => {
      delete owner.effects;
      // a piece lifted out of the picture only for its effect has no more reason to be there
      if (owner.lifted) {
        doc.shapes = doc.shapes.filter((shape) => shape !== owner);
        selected = selected.filter((id) => id !== owner.id);
      }
    });
    effectsChanged(doc);
    renderRight();
    if (popupKind === "convert") refreshPopupDocument("convert");
    return effectsOf(doc);
  }

  /* The border and shadow part of the export dialog: the same values as the panel. */
  function exportEffectFields(number) {
    const fx = effectsOf(current());
    const L = Effects.LIMITS;
    const cell = (key, control) => '<div class="line"><span>' + esc(t(key)) + "</span>" + control + "</div>";
    const colorCell = (key, field, value) => '<label class="line"><span>' + esc(t(key)) + '</span><input data-field="' + field + '" type="color" value="' + esc(value) + '"></label>';
    const box = (key, field, on) => '<label class="line fx-box"><input data-field="' + field + '" type="checkbox"' + (on ? " checked" : "") + "> " + esc(t(key)) + "</label>";
    return '<p class="fx-form-title">' + esc(t("fx.border")) + '</p><div class="fx-form">' +
      cell("fx.top", number("fxBorderTop", fx.border.top, L.border[0], L.border[1])) +
      cell("fx.bottom", number("fxBorderBottom", fx.border.bottom, L.border[0], L.border[1])) +
      cell("fx.left", number("fxBorderLeft", fx.border.left, L.border[0], L.border[1])) +
      cell("fx.right", number("fxBorderRight", fx.border.right, L.border[0], L.border[1])) +
      colorCell("fx.color", "fxBorderColor", fx.border.color) +
      '</div><p class="fx-form-title">' + esc(t("fx.shadow")) + '</p><div class="fx-form">' +
      box("fx.shadowOn", "fxShadowOn", fx.shadow.on) +
      box("fx.transparent", "fxShadowTransparent", fx.shadow.transparent) +
      cell("fx.x", number("fxShadowX", fx.shadow.x, L.offset[0], L.offset[1])) +
      cell("fx.y", number("fxShadowY", fx.shadow.y, L.offset[0], L.offset[1])) +
      cell("fx.shadowBlur", number("fxShadowBlur", fx.shadow.blur, L.shadowBlur[0], L.shadowBlur[1])) +
      cell("fx.opacity", number("fxShadowOpacity", fx.shadow.opacity, L.opacity[0], L.opacity[1])) +
      colorCell("fx.color", "fxShadowColor", fx.shadow.color) +
      colorCell("fx.backdrop", "fxShadowBackdrop", fx.shadow.backdrop) +
      '</div><div class="line hint fx-note">' + esc(t("fx.note")) + "</div>";
  }

  const EXPORT_FIELDS = {
    fxBorderTop: "border.top", fxBorderBottom: "border.bottom", fxBorderLeft: "border.left", fxBorderRight: "border.right", fxBorderColor: "border.color",
    fxShadowOn: "shadow.on", fxShadowTransparent: "shadow.transparent", fxShadowX: "shadow.x", fxShadowY: "shadow.y", fxShadowBlur: "shadow.blur",
    fxShadowOpacity: "shadow.opacity", fxShadowColor: "shadow.color", fxShadowBackdrop: "shadow.backdrop",
  };

  /* One undo step for one visit to the dialog, however many fields change. */
  function applyExportEffects(fields) {
    const doc = current();
    if (!doc) return;
    const before = JSON.stringify(effectsOf(doc));
    const fx = effectsOf(doc);
    Object.keys(EXPORT_FIELDS).forEach((field) => {
      if (!(field in fields)) return;
      const parts = EXPORT_FIELDS[field].split(".");
      fx[parts[0]][parts[1]] = fields[field];
    });
    const next = Effects.normalize(fx);
    if (JSON.stringify(next) === before) return;
    if (!exportUndoTaken) { pushUndo(); exportUndoTaken = true; }
    doc.effects = next;
    effectsChanged(doc);
    renderRight();
  }

  /* What a picture format writes. */
  const NO_TRANSPARENCY = ["jpeg", "bmp", "jp2", "j2k", "dicom", "ppm", "pcx"];
  function exportCanvas(doc, format) {
    return Effects.apply(renderCanvas(doc), doc.effects, { flatten: NO_TRANSPARENCY.indexOf(format) >= 0 });
  }

  /* The small pictures on the buttons of a line's looks. */
  const HEAD_GLYPHS = {
    none: '<path d="M2 7H26"/>',
    triangle: '<path d="M2 7H15"/><path d="M14 2 26 7 14 12z" fill="currentColor"/>',
    open: '<path d="M2 7H25M16 2 25 7 16 12"/>',
    diamond: '<path d="M2 7H12"/><path d="M12 7 19 2 26 7 19 12z" fill="currentColor"/>',
    circle: '<path d="M2 7H17"/><circle cx="21" cy="7" r="4.5" fill="currentColor"/>',
    bar: '<path d="M2 7H24"/><path d="M25 2V12" stroke-width="2.6"/>',
  };
  const lineGlyph = (body) => '<svg viewBox="0 0 28 14" aria-hidden="true">' + body + "</svg>";
  const LOOK_GLYPHS = {
    lineCap: {
      round: '<path d="M8 7H20" stroke-width="7" stroke-linecap="round"/>',
      butt: '<path d="M8 7H20" stroke-width="7" stroke-linecap="butt"/>',
      square: '<path d="M8 7H20" stroke-width="7" stroke-linecap="square"/>',
    },
    lineDash: {
      solid: '<path d="M2 7H26" stroke-width="2.4"/>',
      dashed: '<path d="M2 7H26" stroke-width="2.4" stroke-dasharray="6 3.4"/>',
      dotted: '<path d="M2 7H26" stroke-width="2.4" stroke-dasharray="0.1 4.4" stroke-linecap="round"/>',
      dashdot: '<path d="M2 7H26" stroke-width="2.4" stroke-dasharray="7 3 1.5 3"/>',
    },
    lineJoin: {
      round: '<path d="M7 12V3H22" stroke-width="3.6" stroke-linejoin="round"/>',
      miter: '<path d="M7 12V3H22" stroke-width="3.6" stroke-linejoin="miter"/>',
      bevel: '<path d="M7 12V3H22" stroke-width="3.6" stroke-linejoin="bevel"/>',
    },
  };

  function lookTiles(label, key, ids, current, glyphOf, nameOf) {
    return '<div class="line prop-line prop-looks"><span>' + esc(label) + '</span><span class="prop-tiles" role="radiogroup" aria-label="' + esc(label) + '">' +
      ids.map((id) => (
        '<button type="button" role="radio" class="prop-tile' + (id === current ? " on" : "") + '" data-action="propLook:' + key + ":" + id + '" aria-checked="' + (id === current ? "true" : "false") + '" title="' + esc(nameOf(id)) + '" aria-label="' + esc(nameOf(id)) + '">' + glyphOf(id) + "</button>"
      )).join("") + "</span></div>";
  }

  function lineLookRows(shape) {
    const looks = Paint.lineOptions(shape.kind);
    const rows = [];
    if (looks.heads) {
      const start = (id) => lineGlyph('<g transform="rotate(180 14 7)">' + HEAD_GLYPHS[id] + "</g>");
      const end = (id) => lineGlyph(HEAD_GLYPHS[id]);
      const name = (id) => t("head." + id);
      rows.push(lookTiles(t("prop.arrowStart"), "arrowStart", Paint.ARROW_HEADS, shape.arrowStart || "none", start, name));
      rows.push(lookTiles(t("prop.arrowEnd"), "arrowEnd", Paint.ARROW_HEADS, shape.arrowEnd || "triangle", end, name));
      rows.push(propLine(t("prop.headSize"), propSpin("prop", "headSize", shape.headSize == null ? 100 : shape.headSize, 50, 300, 10, t("prop.headSize"))));
    }
    if (looks.cap) rows.push(lookTiles(t("prop.lineCap"), "lineCap", Paint.LINE_CAPS, shape.lineCap || "round", (id) => lineGlyph(LOOK_GLYPHS.lineCap[id]), (id) => t("cap." + id)));
    if (looks.dash) rows.push(lookTiles(t("prop.lineDash"), "lineDash", Paint.LINE_DASHES, shape.lineDash || "solid", (id) => lineGlyph(LOOK_GLYPHS.lineDash[id]), (id) => t("dash." + id)));
    if (looks.join && !looks.cap) rows.push(lookTiles(t("prop.lineJoin"), "lineJoin", Paint.LINE_JOINS, shape.lineJoin || "round", (id) => lineGlyph(LOOK_GLYPHS.lineJoin[id]), (id) => t("join." + id)));
    return rows;
  }

  /* One look, to every selected shape that has it. */
  function setLineLook(key, value) {
    const has = { lineCap: "cap", lineDash: "dash", lineJoin: "join", arrowStart: "heads", arrowEnd: "heads" }[key];
    const targets = selectedShapes().filter((shape) => Paint.lineOptions(shape.kind)[has]);
    if (!targets.length) return null;
    pushUndo();
    targets.forEach((shape) => {
      shape[key] = value;
      // on an open line one choice decides both its ends and where it bends
      if (key === "lineCap") shape.lineJoin = value === "round" ? "round" : "miter";
    });
    markDirty();
    renderBoard();
    renderRight();
    renderTabs();
    return value;
  }

  function renderRight() {
    const doc = current();
    $("rightPanel").classList.toggle("collapsed", !settings.showRight);
    const shape = firstSelected();
    const rows = [];
    if (shape) {
      rows.push('<div class="line"><span>' + esc(t("prop.kind")) + '</span><b class="grow">' + esc(t("kind." + shape.kind)) + "</b></div>");
      rows.push(colorLine(t("prop.color"), colorButton("prop:color", shape.color, t("prop.color"))));
      if (Paint.isFillable(shape.kind)) {
        rows.push(colorLine(t("prop.fill"), colorButton("prop:fill", shape.fill, t("prop.fill"), true)));
      }
      rows.push(propLine(t("prop.width"), propSpin("prop", "width", shape.width, 1, 96, 1, t("prop.width"))));
      rows.push(propLine(t("prop.opacity"), propSpin("prop", "opacity", shape.opacity, 0, 100, 5, t("prop.opacity"))));
      lineLookRows(shape).forEach((row) => rows.push(row));
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
      rows.push(propLine(t("prop.w"), propSpin("prop", "shapeW", size.width, 1, 8192, 1, t("prop.w"))));
      rows.push(propLine(t("prop.h"), propSpin("prop", "shapeH", size.height, 1, 8192, 1, t("prop.h"))));
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
      rows.push(colorLine(t("prop.background"), colorButton("prop:background", doc ? doc.background : "#ffffff", t("prop.background"))));
      rows.push(propLine(t("canvas.width"), propSpin("prop", "canvasWidth", doc ? doc.width : 0, 16, 8192, 10, t("canvas.width"))));
      rows.push(propLine(t("canvas.height"), propSpin("prop", "canvasHeight", doc ? doc.height : 0, 16, 8192, 10, t("canvas.height"))));
      rows.push('<div class="line"><span>' + esc(t("prop.shapes")) + '</span><b class="grow">' + (doc ? doc.shapes.filter((shape) => !shape.svgFrame).length : 0) + "</b></div>");
      if (region) {
        const box = Paint.regionBounds(region);
        rows.push('<div class="line"><span>' + esc(t("status.selection")) + '</span><b class="grow" id="regionKind">' + esc(t("region." + region.kind)) + "</b></div>");
        rows.push('<div class="line"><span>' + esc(t("region.size")) + '</span><b class="grow" id="regionSize">' + Math.round(box.w) + " x " + Math.round(box.h) + "</b></div>");
        if (box.w >= 1 && box.h >= 1) rows.push(colorLine(t("pixel.color"), colorButton("pixel:color", regionColor(), t("pixel.color"))));
        rows.push('<div class="line"><button type="button" class="action grow" data-action="cropRegion">' + esc(t("edit.crop")) + "</button></div>");
        rows.push('<div class="line"><button type="button" class="action grow" data-action="eraseRegion">' + esc(t("edit.eraseRegion")) + "</button></div>");
      } else {
        rows.push('<div class="line"><span>' + esc(t("status.selection")) + '</span><b class="grow">' + esc(t("status.none")) + "</b></div>");
      }
    }
    const scrolled = $("rightPanel").querySelector(".right-scroll");
    const top = scrolled ? scrolled.scrollTop : 0;
    const oldBox = $("svgSource");
    const boxState = oldBox && document.activeElement === oldBox
      ? { start: oldBox.selectionStart, end: oldBox.selectionEnd, top: oldBox.scrollTop, left: oldBox.scrollLeft }
      : null;
    $("rightPanel").innerHTML = panelBar("right", "right.props", "properties") + '<div class="right-scroll"><div class="props">' + rows.join("") + "</div>" +
      svgSection(doc) + fxSection(doc) + pictureSection(doc) + dicomSection(doc) + "</div>";
    $("rightPanel").querySelector(".right-scroll").scrollTop = top;
    const box = $("svgSource");
    if (box) {
      // through .value: as HTML a first line break would be lost, and it needs no escaping
      const draft = extrasOf(doc).svgDraft;
      box.value = draft != null ? draft : doc.svg;
      if (boxState) {
        box.focus({ preventScroll: true });
        box.setSelectionRange(boxState.start, boxState.end);
        box.scrollTop = boxState.top;
        box.scrollLeft = boxState.left;
      }
    }
    // every change of selection comes through here: the font buttons show what is selected now
    syncFontControls();
    syncFxWheel(true);
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
      ["stShapes", t("status.shapes") + " " + (doc ? doc.shapes.filter((shape) => !shape.svgFrame).length : 0)],
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
    if (startVisible) renderStart();
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
    return items.map((item) => {
      const main = '<button type="button" class="menu-item" data-action="' + esc(item.action) + '"' + (item.disabled ? " disabled" : "") + ' title="' + esc(item.tip || item.label) + '">' +
        '<span class="ico">' + Icons.icon(item.icon) + "</span>" +
        '<span class="label">' + esc(item.label) + "</span>" +
        '<span class="shortcut">' + esc(item.shortcut) + "</span></button>";
      if (!item.remove) return main;
      return '<div class="menu-row">' + main +
        '<button type="button" class="menu-x" data-action="' + esc(item.remove) + '" title="' + esc(t("recent.remove")) + '" aria-label="' + esc(t("recent.remove") + " " + item.label) + '">' +
        '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></div>';
    }).join("");
  }

  function themeMenuHTML() {
    const column = (mode) => Themes.THEMES.filter((item) => item.mode === mode).map((item) => (
      '<button type="button" class="menu-item theme-choice' + (item.id === settings.theme ? " on" : "") + '" data-action="theme:' + esc(item.id) + '" title="' + esc(Themes.nameOf(item, settings.language)) + '">' +
      '<i class="swatch" style="background:' + esc(item.vars["--bg"]) + ";border-color:" + esc(item.vars["--accent"]) + '"></i>' +
      '<span class="label">' + esc(Themes.nameOf(item, settings.language)) + "</span></button>"
    )).join("");
    const col = (mode, label) => '<div class="theme-col"><div class="theme-col-head">' + Icons.icon(mode === "dark" ? "moon" : "sun") + "<span>" + esc(label) + "</span></div>" + column(mode) + "</div>";
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
    lastMenu = { id: id, x: x, y: y, align: align };
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
    ].concat(textContextItems()).concat([
      menuItem("palette", "palette", t("draw.palette")),
      menuItem("canvasSize", "canvas", t("draw.canvasSize")),
      menuItem("export", "download", t("file.export")),
      menuItem("print", "print", t("file.print"), "Ctrl+P"),
    ]);
  }

  function textContextItems() {
    const shape = activeTextShapes()[0];
    if (!shape) return [];
    return [
      menuItem("fontDown", "text", t("font.smaller"), "", shape.fontSize <= 6),
      menuItem("fontUp", "text", t("font.larger"), "", shape.fontSize >= 400),
      menuItem("fontMenu", "text", t("font.family")),
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
      newdoc: "new",
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
      newdoc: "popup.newdoc",
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
    page.doc.shapes.forEach((shape) => Paint.drawWithEffects(ctx, shape, page.doc, images));
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

  /* What a document prints as. Effects of the whole picture can make it larger, so such a document
   * prints as one picture of the finished size, and the pages are split from that. A view is kept
   * until the document changes, since every change of a print setting asks for the pages again. */
  const printViews = new Map();

  function printView(doc) {
    if (Effects.isPlain(Effects.normalize(doc.effects))) return doc;
    const showBackground = printState.printBackground !== false;
    const key = showBackground + JSON.stringify(doc, (name, value) => (name === "src" ? String(value).length : value));
    const frame = images[frameKey(doc)] || null;
    const kept = printViews.get(doc.id);
    if (kept && kept.key === key && kept.frame === frame) return kept.view;
    const source = document.createElement("canvas");
    source.width = doc.width;
    source.height = doc.height;
    Paint.render(source.getContext("2d"), doc, { images: images, noBackground: !showBackground });
    const fx = Effects.normalize(doc.effects);
    if (!showBackground) fx.shadow.transparent = true;
    const canvas = Effects.apply(source, fx, { clearBehind: !showBackground });
    const src = "print:" + doc.id;
    images[src] = canvas;
    const view = {
      id: doc.id,
      name: doc.name,
      width: canvas.width,
      height: canvas.height,
      // the backdrop is in the picture already, and a clear one leaves the paper showing
      background: "transparent",
      shapes: [Paint.makeShape("image", { src: src, x: 0, y: 0, w: canvas.width, h: canvas.height, width: 1 })],
    };
    printViews.set(doc.id, { key: key, frame: frame, view: view });
    return view;
  }

  function pagesForPrint() {
    return Print.selectPages(docs.map(printView), {
      scope: printState.scope,
      currentIndex: active,
      paper: printState.paper,
      orientation: printState.orientation,
      margin: printMargins(),
      from: Number(printState.from) || 1,
      to: Number(printState.to) || 1,
    });
  }

  /* What each dialog button shows beside its label. Added in one place so no dialog can leave a
   * button out: an arrow button is its icon alone. */
  const POPUP_BUTTON_ICONS = {
    "apply-canvas": "check", "apply-convert": "download", "apply-custom": "check", "apply-drop": "check", "apply-palette": "check", "apply-settings": "check",
    "bg-choose": "folder", "bg-clear": "trash", "cancel": "clear", "clear-dirs": "trash", "clear-recent": "trash", "close": "exit",
    "confirm-save": "save", "copy-error": "copy", "create-new": "new", "discard": "trash", "do-print": "print", "fetch-url": "download",
    "print-next": "next", "print-prev": "prev", "remove-dir": "trash", "remove-recent": "trash", "save-close": "save",
    "start-arrange": "grid", "start-preview": "home", "start-reset": "undo", "stop-progress": "stop", "tag-next": "next", "tag-prev": "prev",
  };

  function withButtonIcons(html) {
    return html.replace(/(<button type="button" class="action[^"]*" data-popup-action="([a-z0-9-]+)"[^>]*>)(&lt;|&gt;)?/g, (whole, open, action) => (
      POPUP_BUTTON_ICONS[action] ? open + Icons.icon(POPUP_BUTTON_ICONS[action]) : whole
    ));
  }

  function popupHTML(kind) {
    return withButtonIcons(popupMarkup(kind));
  }

  function popupMarkup(kind) {
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
      const families = [
        ["native", Formats.NATIVE],
        ["tiff", Formats.TIFF],
        ["heif", Formats.HEIF],
        ["j2k", Formats.J2K],
        ["dicom", Formats.DICOM],
        ["raw", Formats.RAW],
      ];
      const aboutRow = (name, value, attrs) => (
        '<span class="about-name">' + esc(name) + '</span><span class="about-value"' + (attrs || "") + ">" + value + "</span>"
      );
      const formats = families.map((family) => {
        const names = Array.from(family[1]).sort().map((name) => "." + name).join("  ");
        return aboutRow(t("kind." + family[0]), esc(names));
      }).join("");
      const channelKey = "channel." + BUILD.channel;
      const channelName = t(channelKey) === channelKey ? BUILD.channel : t(channelKey);
      return head(t("popup.about")) +
        '<div class="popup-body">' +
        '<div class="about-head">' +
        '<img src="assets/icon.png" width="48" height="48" alt="">' +
        '<div class="about-intro"><b>' + esc(BUILD.title) + "</b><span>" + esc(t("about.desc")) + "</span></div></div>" +
        '<div class="about-table">' +
        aboutRow(t("about.version"), esc(BUILD.version), ' id="aboutVersion"') +
        aboutRow(t("about.build"), esc(BUILD.build), ' id="aboutBuild"') +
        aboutRow(t("about.channel"), esc(channelName), ' id="aboutChannel"') +
        aboutRow(t("about.author"), esc(BUILD.author), ' id="aboutAuthor" data-author="' + esc(BUILD.author) + '"') +
        aboutRow(t("about.built"), esc(BUILD.builtAt)) +
        formats +
        "</div></div>" + foot(btn("close", t("action.close")));
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
        '<div class="line" id="progressText">' + esc(progressLabel || t("status.busy")) + "</div>" +
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
        optionTag("mypaint", t("save.drawing"), doc && doc.svg ? "svg" : "mypaint") +
        Formats.writableFormats().map((item) => optionTag(item.id, t("format." + item.id) + " (." + item.ext + ")", doc && doc.svg ? "svg" : "mypaint")).join("") +
        "</select></label>" +
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
    if (kind === "newdoc") {
      return head(t("popup.newdoc")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("canvas.width")) + "</span>" + number("width", settings.canvasWidth, 16, 8192) + "</label>" +
        '<label class="line"><span>' + esc(t("canvas.height")) + "</span>" + number("height", settings.canvasHeight, 16, 8192) + "</label>" +
        "</div>" + foot(btn("create-new", t("action.create"), true) + btn("cancel", t("action.cancel")));
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
        '<label class="line"><input type="radio" name="role" data-field="role" value="drawing"' + (pendingDropAt ? "" : " checked") + "> " + esc(t("drop.asDrawing")) + "</label>" +
        '<label class="line"><input type="radio" name="role" data-field="role" value="image"' + (pendingDropAt ? " checked" : "") + "> " + esc(t("drop.asImage")) + "</label>" +
        '<label class="line"><input type="radio" name="role" data-field="role" value="background"> ' + esc(t("drop.asBackground")) + "</label>" +
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
        Formats.writableFormats().map((item) => optionTag(item.id, t("format." + item.id) + " (." + item.ext + ")", convertState.format)).join("") + "</select></label>" +
        '<label class="line quality-line" id="qualityLine"' + (lossyFormat(convertState.format) ? "" : " data-off") + '><span>' + esc(t("convert.quality")) + "</span>" +
        number("quality", convertState.quality, 10, 100) + '<b class="unit" id="qualityPct">%</b></label>' +
        '<div class="line hint" id="qualityHint">' + esc(lossyFormat(convertState.format) ? t("convert.qualityHint") : t("convert.lossless")) + "</div>" +
        exportEffectFields(number) +
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
      [["general", "settings.general", "settings"], ["font", "settings.font", "font"], ["appearance", "settings.appearance", "themePalette"], ["workspace", "settings.workspace", "canvas"], ["start", "settings.start", "home"]].map((pair) => (
        '<button type="button" class="tab-ico' + (settingsTab === pair[0] ? " on" : "") + '" data-tab="' + pair[0] + '">' + Icons.icon(pair[2]) + "<span>" + esc(t(pair[1])) + "</span></button>"
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
      '<label class="line"><span>' + esc(t("settings.gridSize")) + "</span>" + number("gridSize", settings.gridSize, 2, 200) + '<b class="unit">px</b></label>' +
      "</div>" +
      startSettingsPanel() +
      "</div>" + foot(btn("apply-settings", t("action.apply"), true) + btn("cancel", t("action.cancel")));
  }

  /* Everything about the start screen, shared live with the start screen itself. */
  function startSettingsPanel() {
    const conf = startPrefs();
    const reduced = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const range = (field, label, limits, value) => (
      '<div class="line"><span>' + esc(label) + "</span>" +
      Range.html({ field: field, label: esc(label), min: limits.min, max: limits.max, step: limits.step, suffix: "%", value: value }) + "</div>"
    );
    const button = (action, icon, label) => '<button type="button" class="action" data-popup-action="' + action + '">' + esc(label) + "</button>";
    return '<div data-panel="start"' + (settingsTab === "start" ? "" : " hidden") + ">" +
      '<p class="settings-start-title">' + esc(t("start.set.background")) + "</p>" +
      '<div class="bg-grid settings-start-grid" role="radiogroup" aria-label="' + esc(t("start.set.background")) + '">' +
      Store.START_BACKGROUNDS.map((kind) => StartScreen.backgroundTile(kind, kind === conf.background,
        'data-popup-action="start-bg" data-id="' + kind + '"', { t: t, esc: esc, icon: Icons.icon })).join("") + "</div>" +
      range("startSpeed", t("start.set.speed"), Store.START_SPEED, Store.effectiveStartSpeed(conf, reduced)) +
      range("startOpacity", t("start.cardOpacity"), Store.START_OPACITY, conf.cardOpacity) +
      '<label class="line"><input data-field="startShuffle" type="checkbox"' + (conf.shuffleSec > 0 ? " checked" : "") + "> " + esc(t("start.set.shuffle").replace("{0}", Store.START_SHUFFLE_SECONDS)) + "</label>" +
      '<label class="line"><input data-field="startShow" type="checkbox"' + (conf.show ? " checked" : "") + "> " + esc(t("start.showAtStart")) + "</label>" +
      '<div class="line"><span>' + esc(t("start.set.layout")) + '</span><span class="start-layout-buttons">' +
      button("start-arrange", "grid", t("start.set.arrange")) + button("start-reset", "clear", t("start.set.reset")) + button("start-preview", "home", t("start.set.open")) +
      "</span></div>" +
      "</div>";
  }

  function messageTarget() {
    return /^https?:$/.test(location.protocol) ? location.origin : "*";
  }

  function postPopup(type, extra) {
    if (!popupWindow || popupWindow.closed) return;
    popupWindow.postMessage(Object.assign({ source: "mypaint", type: type }, extra || {}), messageTarget());
  }

  function postPopupHtml() {
    const box = popupBoxSize || { width: 0, height: 0 };
    postPopup("html", { html: popupHtml, width: box.width, height: box.height });
  }

  /* English labels are wider, so the format list wraps onto more lines. */
  function popupSpec(kind) {
    const spec = metrics.POPUPS[kind];
    if (kind === "about" && settings.language === "en") return { width: spec.width, height: 497 };
    return spec;
  }

  function closePopup() {
    if (popupEl) popupEl.remove();
    popupEl = null;
    popupKind = "";
    popupHtml = "";
    if (window.desktop && window.desktop.closePopup && !TEST) window.desktop.closePopup(++popupGen);
    if (popupWindow && !popupWindow.closed) popupWindow.close();
    popupWindow = null;
  }

  /* A browser popup is its own window. Reuse it when another dialog replaces the one on screen. */
  function openOwnWindow(kind, spec, place) {
    popupHtml = popupDocument(kind);
    popupBoxSize = spec;
    const left = Math.round((window.screenX || 0) + place.x);
    const top = Math.round((window.screenY || 0) + place.y);
    if (!popupWindow || popupWindow.closed) {
      const features = "popup=yes,width=" + spec.width + ",height=" + spec.height + ",left=" + left + ",top=" + top;
      popupWindow = window.open("popup.html", "mypaint-popup", features);
      return Boolean(popupWindow);
    }
    popupWindow.focus();
    try { popupWindow.moveTo(left, top); } catch (error) { /* a browser may refuse to move a window it did not open just now */ }
    postPopupHtml();
    return true;
  }

  function popupDocument(kind) {
    return themeStyle() + '<section class="popup" data-kind="' + kind + '">' + popupHTML(kind) + "</section>";
  }

  function openPopup(kind, anchor) {
    if (kind === "convert") exportUndoTaken = false;
    if (kind === "print") printState = Object.assign({}, Store.defaults().print, settings.print, { pageIndex: 0 });
    const spec = popupSpec(kind);
    const place = anchor || {
      x: Math.max(0, (window.innerWidth - spec.width) / 2),
      y: Math.max(0, (window.innerHeight - spec.height) / 2),
    };
    popupKind = kind;
    if (window.desktop && window.desktop.openPopup && !TEST) {
      window.desktop.openPopup({
        gen: ++popupGen,
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
    if (!TEST && openOwnWindow(kind, spec, place)) {
      if (popupEl) popupEl.remove();
      popupEl = null;
      return null;
    }
    closePopup();
    popupKind = kind;
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
      progressLabel = label || "";
      openPopup("progress");
      paintProgress(label, 0);
    } else if (label) {
      paintProgress(label);
    }
    progressDepth += 1;
  }

  function paintProgress(label, value) {
    if (label) progressLabel = label;
    const now = value == null ? (progressMarks[progressMarks.length - 1] || 0) : value;
    if (popupEl && popupEl.dataset.kind === "progress") {
      const text = popupEl.querySelector("#progressText");
      const fill = popupEl.querySelector("#progressFill");
      const pct = popupEl.querySelector("#progressPct");
      if (text && progressLabel) text.textContent = progressLabel;
      if (fill) fill.style.width = now + "%";
      if (pct) pct.textContent = String(now);
      return;
    }
    if (!TEST && popupKind === "progress") refreshPopupDocument("progress");
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
    if (popupWindow && !popupWindow.closed) postPopup("theme", { css: themeCss() });
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

  /* `code` is the physical key, so Ctrl+S still saves when the input language is Korean
   * and `key` comes back as Hangul or "Process". */
  function shortcutLetter(event) {
    const code = String(event.code || "");
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    const key = String(event.key || "");
    if (key.length === 1) return key.toLowerCase();
    return "";
  }

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
    renderRulers();
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

  /* A font change while a text is being typed goes to the selected characters, or — with
   * nothing selected — to what is typed from the caret on (richtext.js). With text shapes
   * selected but not being typed, it goes to the whole of each. It is also the default for
   * the next new text. */
  function runPatch(patch) {
    const out = {};
    if (patch.fontFamily) out.fontFamily = settings.fontFamily;
    if (patch.fontSize != null) out.fontSize = settings.fontSize;
    if (patch.fontStyle) {
      out.bold = String(patch.fontStyle).indexOf("bold") >= 0;
      out.italic = String(patch.fontStyle).indexOf("italic") >= 0;
    }
    if (patch.underline != null) out.underline = !!patch.underline;
    if (patch.strike != null) out.strike = !!patch.strike;
    if (patch.color) out.color = patch.color;
    return out;
  }

  function applyTextFont(patch) {
    const editing = editingShape();
    const editor = $("textEditor");
    const shapes = activeTextShapes();
    if (patch.fontFamily) settings.fontFamily = patch.fontFamily;
    if (patch.fontSize != null) settings.fontSize = clamp(patch.fontSize, 6, 400);
    // the face and marks given to a text belong to that text; only with no text in hand do they
    // set what the next text starts with, or one italic word would make every later text italic
    if (!editing && !shapes.length) {
      if (patch.fontStyle) settings.fontStyle = patch.fontStyle;
      if (patch.underline != null) settings.fontUnderline = !!patch.underline;
      if (patch.strike != null) settings.fontStrike = !!patch.strike;
    }
    const change = runPatch(patch);
    if (editing && editor && !editor.hidden && RichText) {
      const base = Paint.styleOfShape(editing);
      const result = RichText.restyle(editor, change, base, scale(), editorCaret);
      if (result.mode === "range") {
        Paint.setTextRuns(editing, result.runs);
        markDirty();
      } else if (!editing.text) {
        // nothing typed yet: the new style is the text's own
        Object.assign(editing, { fontFamily: result.style.fontFamily, fontSize: result.style.fontSize, fontStyle: Paint.styleName(result.style), underline: result.style.underline, strike: result.style.strike });
      }
      lastTextRestyle = result;
      saveSettings();
      applyVisual();
      layoutTextEditor();
      renderRight();
      syncFontControls();
      editor.focus();
      return { family: activeFontFamily(), size: activeFontSize(), mode: result.mode };
    }
    if (shapes.length) {
      pushUndo();
      shapes.forEach((shape) => {
        if (patch.fontFamily) shape.fontFamily = settings.fontFamily;
        if (patch.fontSize != null) shape.fontSize = settings.fontSize;
        if (patch.fontStyle) shape.fontStyle = patch.fontStyle;
        if (patch.underline != null) shape.underline = !!patch.underline;
        if (patch.strike != null) shape.strike = !!patch.strike;
        if (Array.isArray(shape.runs)) shape.runs = Paint.restyleRuns(shape.runs, 0, shape.text.length, change, Paint.styleOfShape(shape));
        Paint.normalizeShape(shape);
      });
      markDirty();
    }
    saveSettings();
    applyVisual();
    renderBoard();
    renderRight();
    renderToolbar();
    return { family: settings.fontFamily, size: activeFontSize() };
  }

  /* Toggles from what the button shows: while typing that is the style at the caret, not the
   * text's own, so a second press turns it off and the other face is kept. */
  function toggleFontFace(kind) {
    const whole = activeTextShapes();
    if (!editingShape() && whole.length) {
      // the whole text is selected: this one face goes to all of it, and every other style stays
      const value = !fontFlag(kind);
      pushUndo();
      whole.forEach((shape) => {
        const runs = Paint.textRuns(shape);
        const change = {};
        change[kind] = value;
        Paint.setTextRuns(shape, Paint.restyleRuns(runs, 0, shape.text.length, change, Paint.styleOfShape(shape)));
      });
      markDirty();
      saveSettings();
      applyVisual();
      renderBoard();
      renderRight();
      renderToolbar();
      return null;
    }
    const bold = kind === "bold" ? !fontFlag("bold") : fontFlag("bold");
    const italic = kind === "italic" ? !fontFlag("italic") : fontFlag("italic");
    let next = "normal";
    if (bold && italic) next = "bold-italic";
    else if (bold) next = "bold";
    else if (italic) next = "italic";
    applyTextFont({ fontStyle: next });
  }

  function toggleFontMark(kind) {
    const on = fontFlag(kind);
    applyTextFont(kind === "underline" ? { underline: !on } : { strike: !on });
  }

  function openFontMenu(x, y) {
    const width = 240;
    const full = Math.max(1, fontCatalog.length) * metrics.MENU_ROW + metrics.MENU_PAD + 2;
    const height = Math.min(full, Math.max(metrics.MENU_ROW + metrics.MENU_PAD, window.innerHeight - 16));
    const place = fitMenu(x, y, width, height);
    const current = activeFontFamily();
    const html = fontCatalog.map((name) => (
      '<button type="button" class="menu-item' + (name === current ? " on" : "") + '" data-action="font:' + esc(name) + '" title="' + esc(name) + '">' +
      '<span class="ico">' + Icons.icon("text") + "</span>" +
      '<span class="label">' + esc(name) + "</span></button>"
    )).join("");
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: "font",
        x: place.x,
        y: place.y,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu font-menu">' + html + "</div>",
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu font-menu";
    el.dataset.menu = "font";
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = html;
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function setTool(id) {
    if (!Paint.TOOLS.some((tool) => tool.id === id)) return settings.tool;
    if (textEditing && id !== "text") finishTextEditor();
    settings.tool = id;
    band = null;
    saveSettings();
    renderBoard();
    renderLeft();
    renderStatus();
    return settings.tool;
  }

  /* A colour chosen with something selected goes to it. While a drawing tool is in hand the shape
   * just drawn counts as selected too, but a colour picked then is for the next one, or picking
   * a colour would repaint the last stroke. A selected text is always meant: it was finished. */
  function colorTargets() {
    const shapes = selectedShapes();
    if (settings.tool === "select") return shapes;
    return shapes.filter((shape) => shape.kind === "text");
  }

  /* Changed pixels live on a see-through picture over the drawing, one for each run of changes, so
   * the shapes under them stay shapes. The last shape carries on if it is such a layer. */
  function paintRegion(color, session) {
    const doc = current();
    if (!doc || !region || !color) return false;
    const box = Paint.regionBounds(region);
    if (box.w < 1 || box.h < 1) return false;
    if (!session || !session.undo) {
      pushUndo();
      if (session) session.undo = true;
    }
    const last = doc.shapes[doc.shapes.length - 1];
    const layer = last && last.pixelLayer && last.w === doc.width && last.h === doc.height ? last : null;
    const canvas = document.createElement("canvas");
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext("2d");
    if (layer && images[layer.src]) ctx.drawImage(images[layer.src], 0, 0);
    ctx.save();
    Paint.clipRegion(ctx, region);
    ctx.fillStyle = color;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    const src = canvas.toDataURL("image/png");
    images[src] = canvas;
    if (layer) {
      delete images[layer.src]; // an undo that needs it again reads it back from its own src
      layer.src = src;
    } else {
      Paint.addShape(doc, Paint.makeShape("image", { src: src, x: 0, y: 0, w: doc.width, h: doc.height, width: 1, pixelLayer: true }));
    }
    markDirty();
    renderBoard();
    renderTabs();
    return true;
  }

  /* The colour at the middle of the picked pixels, as it looks now. */
  function regionColor() {
    const doc = current();
    if (!doc || !region) return "#000000";
    const box = Paint.regionBounds(region);
    const x = Math.max(0, Math.min(doc.width - 1, Math.floor(box.x + box.w / 2)));
    const y = Math.max(0, Math.min(doc.height - 1, Math.floor(box.y + box.h / 2)));
    const data = renderCanvas(doc).getContext("2d", { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    return "#" + [data[0], data[1], data[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  /* One pixel per click, whatever the zoom; a drag takes every pixel it touches, both ends included. */
  function setPixelRegion(x, y) {
    const doc = current();
    const inside = (value, size) => Math.max(0, Math.min(size - 1, Math.floor(value)));
    const px = inside(x, doc.width);
    const py = inside(y, doc.height);
    region.x = Math.min(pixelAnchor.x, px);
    region.y = Math.min(pixelAnchor.y, py);
    region.w = Math.abs(px - pixelAnchor.x) + 1;
    region.h = Math.abs(py - pixelAnchor.y) + 1;
  }

  /* key is color or fill. The undo step is taken once per session, so one visit to a chooser is
   * one undo. Returns whether anything was changed. */
  function recolorSelection(key, value, session) {
    const targets = colorTargets().filter((shape) => (key === "fill" ? Paint.isFillable(shape.kind) : shape.kind !== "image" && shape.kind !== "eraser"));
    if (!targets.length) return false;
    if (!session || !session.undo) {
      pushUndo();
      if (session) session.undo = true;
    }
    targets.forEach((shape) => {
      if (key === "fill") { shape.fill = value || ""; return; }
      if (!value) return;
      shape.color = value;
      if (shape.kind === "text" && Array.isArray(shape.runs)) {
        // each part may carry its own colour, which would otherwise hide the change
        Paint.setTextRuns(shape, Paint.restyleRuns(Paint.textRuns(shape), 0, shape.text.length, { color: value }, Paint.styleOfShape(shape)));
      }
    });
    markDirty();
    renderBoard();
    renderTabs();
    return true;
  }

  function setColor(color) {
    settings.color = color;
    if (editingShape()) {
      // while typing: from the caret, or on the selected characters
      applyTextFont({ color: color });
    } else if (region && !selected.length) {
      paintRegion(color);
      renderRight();
    } else if (recolorSelection("color", color)) {
      renderRight();
      renderLeft();
    }
    saveSettings();
    renderLeft();
    renderStatus();
    return settings.color;
  }

  function setStrokeWidth(value) {
    settings.strokeWidth = clamp(value, 1, 96);
    const picked = widthTargets();
    if (picked.length) {
      pushUndo();
      picked.forEach((shape) => { shape.width = settings.strokeWidth; });
      markDirty();
      renderBoard();
      renderRight();
      renderTabs();
    }
    saveSettings();
    renderLeft();
    return settings.strokeWidth;
  }

  function setEraserSize(value) {
    settings.eraserSize = clamp(value, 1, 96);
    saveSettings();
    renderLeft();
    return settings.eraserSize;
  }

  function setActiveSize(value) {
    return sizingEraser() ? setEraserSize(value) : setStrokeWidth(value);
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

  function textDefaults() {
    return Object.assign(shapeDefaults(), {
      kind: "text",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      fill: "",
      text: "",
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      fontStyle: settings.fontStyle,
      underline: !!settings.fontUnderline,
      strike: !!settings.fontStrike,
    });
  }

  function shapeDefaults() {
    return {
      color: settings.color,
      fill: settings.fillColor || "",
      width: settings.tool === "eraser" ? settings.eraserSize : settings.strokeWidth,
      opacity: settings.shapeOpacity,
    };
  }

  function editingShape() {
    const doc = current();
    if (!doc || textEditing == null) return null;
    return doc.shapes.find((shape) => shape.id === textEditing) || null;
  }

  /* The editor sits where the text's baseline is, at the zoom of the picture: its spans
   * carry sizes in picture pixels times the zoom, and it grows with what is typed. */
  function layoutTextEditor() {
    const shape = editingShape();
    const editor = $("textEditor");
    if (!shape || !editor || editor.hidden) return;
    const zoom = scale();
    const base = Paint.styleOfShape(shape);
    if (editor.__zoom !== zoom) {
      const at = RichText.selection(editor);
      RichText.render(editor, RichText.read(editor, base), base, zoom);
      editor.__zoom = zoom;
      if (at && document.activeElement === editor) RichText.select(editor, at.start, at.end);
    }
    const runs = RichText.read(editor, base);
    const size = runs.reduce((max, run) => Math.max(max, run.fontSize), 0) || shape.fontSize;
    editor.style.left = (shape.x * zoom) + "px";
    editor.style.top = ((shape.y - size * 0.92) * zoom) + "px";
    editor.style.fontSize = (size * zoom) + "px";
    editor.style.minHeight = (size * 1.2 * zoom) + "px";
    editor.style.minWidth = (Math.max(shape.fontSize, 8) * zoom) + "px";
    editor.style.fontFamily = cssFamily(shape.fontFamily);
    editor.style.color = shape.color;
    editor.style.caretColor = shape.color;
    editor.style.fontStyle = String(shape.fontStyle).indexOf("italic") >= 0 ? "italic" : "normal";
    editor.style.fontWeight = String(shape.fontStyle).indexOf("bold") >= 0 ? "700" : "400";
    editor.style.textDecoration = [shape.underline ? "underline" : "", shape.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
  }

  /* What was typed goes back into the shape as runs. */
  function readTextEditor() {
    const shape = editingShape();
    const editor = $("textEditor");
    if (!shape || !editor) return null;
    Paint.setTextRuns(shape, RichText.read(editor, Paint.styleOfShape(shape)));
    return shape;
  }

  function ensureTextEditor() {
    let editor = $("textEditor");
    if (editor) return editor;
    editor = document.createElement("div");
    editor.id = "textEditor";
    editor.className = "text-editor";
    editor.contentEditable = "true";
    editor.spellcheck = false;
    editor.setAttribute("role", "textbox");
    editor.setAttribute("autocomplete", "off");
    RichText.attach(editor, () => {
      const shape = editingShape();
      return shape ? Paint.styleOfShape(shape) : Paint.styleOfShape(Paint.makeShape("text", textDefaults()));
    });
    editor.addEventListener("input", () => {
      const shape = readTextEditor();
      if (!shape) return;
      const field = document.querySelector('#rightPanel [data-prop="text"]');
      if (field && document.activeElement !== field) field.value = shape.text;
      markDirty();
      layoutTextEditor();
      renderBoard();
      syncFontControls();
    });
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        editor.blur();
      } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        editor.blur();
      }
    });
    editor.addEventListener("keyup", syncFontControls);
    editor.addEventListener("mouseup", syncFontControls);
    editor.addEventListener("blur", () => {
      const id = textEditing;
      editorCaret = (RichText.selection(editor) || {}).start;
      setTimeout(() => {
        if (textEditing !== id) return;
        const now = document.activeElement;
        if (now === editor) return;
        // the font list keeps the text open: its choice comes back to the caret
        if (now && now.closest && now.closest("#toolbar .font-bar")) return;
        const field = document.querySelector('#rightPanel [data-prop="text"]');
        if (field && now === field) {
          readTextEditor();
          textEditing = null;
          editor.hidden = true;
          return;
        }
        finishTextEditor();
      }, 0);
    });
    $("canvasFrame").appendChild(editor);
    return editor;
  }

  function placeCaret(editor, selectAll) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    if (!selectAll) range.collapse(false);
    const sel = document.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  }

  function focusTextEditor(selectAll) {
    const editor = $("textEditor");
    const token = ++textFocusToken;
    const id = textEditing;
    setTimeout(() => {
      if (!editor || token !== textFocusToken || textEditing !== id) return;
      editor.focus();
      placeCaret(editor, selectAll);
      syncFontControls();
    }, 0);
  }

  function openTextEditor(shape, fresh) {
    if (textEditing === shape.id) {
      const editor = ensureTextEditor();
      editor.hidden = false;
      layoutTextEditor();
      focusTextEditor(false);
      return;
    }
    if (textEditing) finishTextEditor();
    const editor = ensureTextEditor();
    if (!fresh) pushUndo();
    textSession = { id: shape.id, fresh: !!fresh, before: JSON.stringify([shape.text || "", shape.runs || null]), depth: undoStack.length };
    textEditing = shape.id;
    editorCaret = null;
    editor.hidden = false;
    editor.__zoom = scale();
    RichText.render(editor, Paint.textRuns(shape), Paint.styleOfShape(shape), scale());
    editor.setAttribute("aria-label", t("prop.text"));
    layoutTextEditor();
    focusTextEditor(!!shape.text);
  }

  function finishTextEditor() {
    const session = textSession;
    const editor = $("textEditor");
    if (editor && !editor.hidden) readTextEditor();
    const shape = editingShape();
    const doc = current();
    textEditing = null;
    textSession = null;
    editorCaret = null;
    if (editor) editor.hidden = true;
    if (shape && doc && !shape.text) {
      doc.shapes = doc.shapes.filter((item) => item.id !== shape.id);
      selected = selected.filter((id) => id !== shape.id);
      if (session && session.fresh && undoStack.length === session.depth) undoStack.pop();
      updateHistoryButtons();
    } else if (session && !session.fresh && shape && JSON.stringify([shape.text, shape.runs || null]) === session.before && undoStack.length === session.depth) {
      undoStack.pop();
      updateHistoryButtons();
    }
    renderAll();
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
      const hit = Paint.hitTest(doc, x, y);
      if (hit && hit.kind === "text") {
        selected = [hit.id];
        renderBoard();
        renderLeft();
        renderRight();
        renderStatus();
        openTextEditor(hit, false);
        return hit;
      }
      pushUndo();
      const shape = Paint.addShape(doc, Object.assign(textDefaults(), { x: x, y: y }));
      selected = [shape.id];
      markDirty();
      renderBoard();
      renderLeft();
      renderRight();
      renderStatus();
      renderTabs();
      openTextEditor(shape, true);
      return shape;
    }
    const marquee = (Paint.TOOLS.find((item) => item.id === tool) || {}).region;
    if (marquee) {
      region = Paint.makeRegion(marquee, x, y);
      if ((Paint.TOOLS.find((item) => item.id === tool) || {}).pixel) {
        pixelAnchor = { x: Math.max(0, Math.min(doc.width - 1, Math.floor(x))), y: Math.max(0, Math.min(doc.height - 1, Math.floor(y))) };
        setPixelRegion(x, y);
      }
      regionDrag = true;
      selected = [];
      renderOverlay();
      renderStatus();
      return region;
    }
    if (tool === "select") {
      const hit = Paint.hitTest(doc, x, y);
      // several selected: a press anywhere in one of their boxes takes hold of them all,
      // which is also how a thin line in the group is not missed
      const held = selected.length > 1 && selectedShapes().find((shape) => {
        const box = Paint.bounds(shape);
        return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
      });
      let settleOn = null;
      if (pressAdds) {
        if (hit && selected.indexOf(hit.id) >= 0) selected = selected.filter((id) => id !== hit.id);
        else if (hit) selected = selected.concat([hit.id]);
      } else if (held) {
        // a click that does not drag narrows the group to the shape under it, or lets go of it
        settleOn = hit ? hit.id : "none";
      } else {
        selected = hit ? [hit.id] : [];
      }
      const grabbed = pressAdds ? (hit && selected.indexOf(hit.id) >= 0 ? hit : null) : (held || hit);
      if (grabbed) {
        pushUndo();
        dragState = { id: grabbed.id, ids: selected.slice(), lastX: x, lastY: y, moved: false, settleOn: settleOn };
      } else if (!hit) {
        // nothing under the pointer, so the drag draws a box around what to pick
        band = { x: x, y: y, w: 0, h: 0, adds: pressAdds };
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
    scheduleRulers();
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
      if (pixelAnchor) setPixelRegion(x, y);
      else Paint.growRegion(region, x, y);
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
      const adds = band.adds;
      band = null;
      if (box.w >= 2 || box.h >= 2) {
        // only what is wholly inside: a neighbour the box merely touches is not meant
        const inside = doc.shapes.filter((shape) => !Paint.isBackdrop(shape) && Paint.boxContains(box, shape)).map((shape) => shape.id);
        selected = adds ? selected.concat(inside.filter((id) => selected.indexOf(id) < 0)) : inside;
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
        if (state.settleOn) selected = state.settleOn === "none" ? [] : [state.settleOn];
      }
      renderTabs();
      renderAll();
      return state;
    }
    if (regionDrag && region && !draft) {
      if (x != null && y != null) {
        if (pixelAnchor) setPixelRegion(x, y);
        else Paint.growRegion(region, x, y);
      }
      regionDrag = false;
      const box = Paint.regionBounds(region);
      // a slip of the mouse is no area, but one pixel is what the pixel tool is for
      if (!pixelAnchor && box.w < 2 && box.h < 2) region = null;
      pixelAnchor = null;
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
    // a free curve keeps only the points it bends at; the drawing smooths between them
    if (shape.kind === "freeCurve") shape.points = Paint.simplifyPoints(shape.points, Math.max(0.8, 1.6 / scale()));
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
    dropSvgSource(doc);
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
    selected = doc ? doc.shapes.filter((shape) => !Paint.isBackdrop(shape)).map((shape) => shape.id) : [];
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
    dropSvgSource(doc);
    Paint.clearDoc(doc);
    selected = [];
    markDirty();
    renderAll();
    return doc.shapes.length;
  }

  function createNewDoc(fields) {
    const doc = newDoc({
      width: clamp(fields.width, 16, 8192),
      height: clamp(fields.height, 16, 8192),
    });
    closePopup();
    return addDoc(doc, false);
  }

  function applyCanvas(fields) {
    const doc = current();
    if (!doc) return null;
    pushUndo();
    doc.width = clamp(fields.width, 16, 8192);
    doc.height = clamp(fields.height, 16, 8192);
    if (fields.background) doc.background = fields.background;
    svgFollowCanvas(doc);
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
    hideStart();
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

  /* at: centre the image there, keeping it on the picture; otherwise it goes in the top left. */
  async function placeImage(dataUrl, name, at) {
    const doc = current();
    const image = await imageFromSource(dataUrl);
    const factor = Math.min(1, doc.width / image.width, doc.height / image.height);
    const w = Math.round(image.width * factor);
    const h = Math.round(image.height * factor);
    pushUndo();
    const shape = Paint.addShape(doc, Paint.makeShape("image", {
      src: dataUrl,
      x: at ? Math.round(clamp(at.x - w / 2, 0, Math.max(0, doc.width - w))) : 0,
      y: at ? Math.round(clamp(at.y - h / 2, 0, Math.max(0, doc.height - h))) : 0,
      w: w,
      h: h,
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
    parsed.documents.forEach(attachSvgFrame);
    return parsed.documents.length;
  }

  /* What a file name saves as: a drawing for .mypaint (or no extension), otherwise the picture
   * format its extension names. */
  function saveFormatOf(filePath) {
    const ext = Formats.extensionOf(filePath);
    if (!ext || ext === "mypaint" || ext === "mpaint") return "mypaint";
    const spec = Formats.SAVE_FORMATS.find((item) => item.ext === ext || item.id === ext ||
      (item.id === "jpeg" && ext === "jpeg") || (item.id === "tiff" && ext === "tiff"));
    return spec ? spec.id : "mypaint";
  }

  function saveFilters() {
    return [{ name: t("open.drawing"), extensions: ["mypaint"] }].concat(Formats.writableFormats().map((item) => ({
      name: t("format." + item.id) + " (." + item.ext + ")",
      extensions: item.id === "jpeg" ? ["jpg", "jpeg"] : item.id === "tiff" ? ["tif", "tiff"] : [item.ext],
    })));
  }

  /* An SVG document saves back to SVG unless another format is asked for. */
  function defaultSaveName(doc) {
    if (doc.path) return doc.path;
    if (doc.svg) return doc.name.replace(/\.[^.]+$/, "") + ".svg";
    return DRAWING_EXT.test(doc.name) ? doc.name : doc.name.replace(/\.[^.]+$/, "") + ".mypaint";
  }

  async function saveCurrent(forceDialog) {
    const doc = current();
    if (!doc) return null;
    if (forceDialog || !doc.path) {
      if (TEST && !forceDialog) return finishSave(doc, doc.name, doc.svg ? "svg" : "mypaint");
      if (window.desktop && window.desktop.pickSave && !TEST) {
        const file = await window.desktop.pickSave(defaultSaveName(doc), saveFilters());
        if (!file) return null;
        return finishSave(doc, file, saveFormatOf(file));
      }
      openPopup("save");
      return null;
    }
    return finishSave(doc, doc.path, saveFormatOf(doc.path));
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
      // the source draws this one again when the file is opened
      if (shape.svgFrame && doc.svg) return Object.assign(Paint.cloneShape(shape), { src: "" });
      const canvas = images[shape.src];
      const clone = Paint.cloneShape(shape);
      clone.src = canvas ? canvas.toDataURL("image/png") : "";
      return clone;
    });
    return copy;
  }

  async function finishSave(doc, filePath, format) {
    if (format === "png" && !doc.svg) return exportPng(doc, filePath);
    if (format && format !== "mypaint" && format !== "mpaint") {
      const result = await convertDoc(doc, format, convertState.quality, filePath);
      // an SVG kept as SVG is the document itself, so it is saved; any other picture is an export
      if (format === "svg" && doc.svg) {
        doc.path = filePath;
        doc.name = String(filePath).split(/[/\\]/).pop() || doc.name;
        doc.dirty = false;
        rememberDoc(doc);
        renderAll();
      }
      lastSaved = { path: filePath, bytes: result ? result.bytes : 0, format: format };
      return lastSaved;
    }
    const payload = Paint.serialize([flattenFrames(doc)]);
    await withProgress(t("progress.saving"), payload.length, async (report) => {
      await report(40);
      lastSaved = { path: filePath, text: payload, bytes: payload.length, format: "mypaint" };
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
    const picture = exportCanvas(target, "png");
    const url = picture.toDataURL("image/png");
    const base64 = url.slice(url.indexOf(",") + 1);
    await withProgress(t("progress.exporting"), base64.length, async (report) => {
      await report(45);
      lastExport = { path: path, bytes: base64.length, format: "png", width: picture.width, height: picture.height };
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
      lastDownload = { name: "sample.mypaint", text: text, bytes: blob.size };
    });
    if (!TEST) downloadBlob("sample.mypaint", blob);
    return lastDownload;
  }

  /* The user's guide is its own page (guide.html) in a window of its own: a host window in the
   * desktop build, a named tab in a browser, so asking again brings the same one forward. */
  let lastGuide = "";
  async function openGuide(section) {
    const url = "guide.html?lang=" + encodeURIComponent(settings.language) + (section ? "&section=" + encodeURIComponent(section) : "");
    lastGuide = url;
    if (TEST) return url;
    if (window.desktop && window.desktop.openWindow) {
      await window.desktop.openWindow({ label: "guide", url: url, title: t("help.guide") + " - MyPaint", width: 1000, height: 760, minWidth: 640, minHeight: 480 });
    } else {
      window.open(url, "mypaint-guide");
    }
    return url;
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
      page.doc.shapes.forEach((shape) => Paint.drawWithEffects(ctx, shape, page.doc, images));
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

  function bytesFromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function diskPath(file) {
    if (!file || !window.desktop || typeof window.desktop.pathForFile !== "function") return "";
    try { return window.desktop.pathForFile(file) || ""; } catch (error) { return ""; }
  }

  async function fileBytes(file) {
    const disk = diskPath(file);
    if (disk && window.desktop.readBinary) {
      try { return bytesFromBase64(await window.desktop.readBinary(disk)); } catch (error) { /* the file itself may still be readable */ }
    }
    if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
    return new Uint8Array(0);
  }

  async function readFileEntry(file) {
    const size = file.size || String(file.text || "").length;
    const named = Formats.kindOf(file.name, null);
    const disk = diskPath(file);
    if ((named === "" && DRAWING_EXT.test(file.name || "")) || (disk && DRAWING_EXT.test(disk))) {
      if (disk && window.desktop.readFile) {
        return { kind: "drawing", name: file.name, text: await window.desktop.readFile(disk) };
      }
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

  /* point: where on the picture it was dropped, when it was dropped on the picture. */
  async function handleDroppedFiles(files, point) {
    const list = Array.from(files || []);
    if (!list.length) return null;
    const pictures = [];
    for (const file of list) {
      const entry = await readFileEntry(file);
      if (entry.kind === "picture") {
        pictures.push(entry);
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
    if (pictures.length) {
      pendingDrop = pictures[0];
      pendingDropMore = pictures.slice(1);
      pendingDropAt = point || null;
      openPopup("drop");
    }
    return pendingDrop;
  }

  /* The one answer goes to every picture of the drop. Put into the picture, they go where they were
   * dropped, stepping down and to the right so none hides another, selected and ready to be moved. */
  async function applyDropRole(role) {
    if (!pendingDrop) return null;
    const entries = [pendingDrop].concat(pendingDropMore);
    const point = pendingDropAt;
    pendingDrop = null;
    pendingDropMore = [];
    pendingDropAt = null;
    if (role === "background") {
      const entry = entries[0];
      const result = await decodeBytes(entry.bytes || new Uint8Array(0), entry.name, { kind: entry.format });
      const blob = await (await fetch(Formats.toDataUrl(result))).blob();
      return setBackgroundBlob(blob, entry.name);
    }
    if (role === "image") {
      if (textEditing) finishTextEditor();
      hideStart();
      const placed = [];
      for (const entry of entries) {
        const result = await decodeBytes(entry.bytes || new Uint8Array(0), entry.name, { kind: entry.format });
        const step = placed.length * 24;
        placed.push(await placeImage(Formats.toDataUrl(result), entry.name, point ? { x: point.x + step, y: point.y + step } : null));
      }
      settings.tool = "select";
      selected = placed.map((shape) => shape.id);
      saveSettings();
      renderAll();
      return placed[0];
    }
    let doc = null;
    for (const entry of entries) {
      doc = await openPicture(entry.bytes || new Uint8Array(0), entry.name, "");
      Store.rememberDirectory(settings, "open", "drop/" + entry.name);
    }
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

  /* The drawing as an SVG file: every shape as an SVG element, pictures as embedded PNGs. */
  function documentSvg(doc) {
    if (!SvgDoc) throw new Error("SVG writing is not available.");
    return SvgDoc.fromDoc(doc, images, frameKey(doc));
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
    const hasSource = result.svgText != null && Boolean(SvgDoc);
    Paint.addShape(doc, Paint.makeShape("image", Object.assign({
      src: frameKey(doc), x: 0, y: 0, w: result.width, h: result.height, width: 1,
    }, hasSource ? { svgFrame: true } : {})));
    doc.dirty = false;
    const item = extrasOf(doc);
    if (hasSource) {
      doc.svg = String(result.svgText);
      item.svgDrawn = doc.svg;
    }
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
    hideStart();
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
    if (shape.kind === "line" || shape.kind === "arrow") {
      const px = Math.hypot(shape.w, shape.h);
      const mm = spacing ? Math.hypot(shape.w * spacing[1], shape.h * spacing[0]) : 0;
      return { kind: "length", px: px, mm: mm };
    }
    if (Paint.isFillable(shape.kind)) {
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

  /* The quality percentage only changes what a lossy encoder writes. */
  const LOSSY = ["jpeg", "webp", "avif", "jp2", "j2k"];
  function lossyFormat(id) {
    const spec = Formats.SAVE_FORMATS.find((item) => item.id === id);
    if (spec && typeof spec.lossy === "boolean") return spec.lossy;
    return LOSSY.indexOf(id) >= 0;
  }

  async function convertCurrent(format, quality, filePath) {
    const doc = current();
    if (!doc) return null;
    return convertDoc(doc, format, quality, filePath);
  }

  /* Every picture format goes through here: the drawing is flattened to pixels and encoded,
   * except SVG, which is written as vectors — the shapes themselves, over the SVG source of
   * a document that came from an SVG file. */
  async function convertDoc(doc, format, quality, filePath) {
    const spec = Formats.SAVE_FORMATS.find((item) => item.id === format) || Formats.SAVE_FORMATS[0];
    const canvas = spec.vector ? renderCanvas(doc) : exportCanvas(doc, spec.id);
    const picture = { width: canvas.width, height: canvas.height, rgba: canvasPixels(canvas), canvas: canvas };
    const out = await withProgress(t("progress.exporting"), canvas.width * canvas.height * 4, async (report) => {
      await report(40);
      const options = { quality: (quality == null ? convertState.quality : quality) / 100, name: doc.name };
      if (spec.id === "svg") options.svgText = documentSvg(doc);
      const encoded = await Formats.encode(spec.id, picture, options);
      await report(85);
      return encoded;
    });
    const base = (doc.name.replace(/\.[^.]+$/, "") || "image") + "." + out.ext;
    const dir = settings.lastSaveDir;
    const path = filePath || (dir ? dir.replace(/\\/g, "/").replace(/\/$/, "") + "/" + base : base);
    lastConvert = { path: path, format: spec.id, mime: out.mime, bytes: out.bytes.length, width: canvas.width, height: canvas.height };
    Store.rememberDirectory(settings, "save", path);
    saveSettings();
    if (window.desktop && window.desktop.writeBinary && !TEST) {
      let binary = "";
      out.bytes.forEach((value) => { binary += String.fromCharCode(value); });
      await window.desktop.writeBinary(path, btoa(binary));
    } else if (!TEST) {
      downloadBlob(path.split(/[/\\]/).pop() || base, new Blob([out.bytes], { type: out.mime }));
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
      { name: t("open.everything"), extensions: ["mypaint", "mpaint"].concat(pictures) },
      { name: t("open.drawing"), extensions: ["mypaint", "mpaint"] },
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
    return [".mypaint", ".mpaint"].concat(Formats.listExtensions().map((name) => "." + name)).join(",");
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
    new: () => openPopup("newdoc"),
    open: () => {
      if (TEST) {
        return openDrawingText(Paint.serialize([Paint.createDoc(Sample.shapes)]), "opened.mypaint", "");
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
    strokeDown: () => setActiveSize(activeSize() - 1),
    strokeUp: () => setActiveSize(activeSize() + 1),
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
    toggleGrid: () => {
      settings.showGrid = !settings.showGrid;
      saveSettings();
      syncGrid();
      renderBoard();
      return settings.showGrid;
    },
    toggleShapes: () => {
      settings.showShapes = settings.showShapes === false;
      saveSettings();
      syncShapes();
      renderLeft();
      return settings.showShapes;
    },
    print: () => openPopup("print"),
    settings: () => openPopup("settings"),
    about: () => openPopup("about"),
    language: () => setLanguage(settings.language === "en" ? "ko" : "en"),
    fontDown: () => applyTextFont({ fontSize: activeFontSize() - 1 }),
    fontUp: () => applyTextFont({ fontSize: activeFontSize() + 1 }),
    fontBold: () => toggleFontFace("bold"),
    fontItalic: () => toggleFontFace("italic"),
    fontUnderline: () => toggleFontMark("underline"),
    fontStrike: () => toggleFontMark("strike"),
    fontMenu: () => openFontMenu(80, 48),
    themeCycle: () => setTheme(Themes.next(settings.theme)),
    themeMenu: () => {
      const place = anchorUnder("[data-action='themeMenu']", 0);
      return openThemeMenu(place.x, place.y);
    },
    themeCustom: () => openPopup("theme", anchorUnder("[data-action='themeMenu']", metrics.POPUPS.theme.width)),
    toggleLeft: () => { settings.showLeft = !settings.showLeft; saveSettings(); renderLeft(); syncPanels(); renderRulers(); return settings.showLeft; },
    toggleRight: () => { settings.showRight = !settings.showRight; saveSettings(); renderRight(); syncPanels(); renderRulers(); return settings.showRight; },
    toggleRulers: () => {
      settings.showRulers = !settings.showRulers;
      saveSettings();
      syncPanels();
      renderRulers();
      return settings.showRulers;
    },
    home: () => showStart(),
    toggleStart: () => (startVisible ? !hideStart() : showStart()),
    settingsStart: () => { settingsTab = "start"; return openPopup("settings"); },
    hideStart: () => hideStart(),
    download: () => downloadSample(),
    link: () => openLink(GUIDE_URL),
    guide: () => openGuide(),
    guidePopup: () => openPopup("guide"),
    recentManager: () => openPopup("recent"),
    clearRecent: () => clearRecentEntries(),
    exit: () => requestClose(),
  };

  async function ingestPaths(files) {
    if (!files || !files.length) return null;
    for (const file of files) {
      const name = String(file).split(/[/\\]/).pop();
      if (DRAWING_EXT.test(file)) {
        const text = await window.desktop.readFile(file);
        openDrawingText(text, name, file);
        Store.rememberDirectory(settings, "open", file);
        saveSettings();
        continue;
      }
      const bytes = bytesFromBase64(await window.desktop.readBinary(file));
      await openPicture(bytes, name, file);
      Store.rememberDirectory(settings, "open", file);
      saveSettings();
    }
    return files.length;
  }

  function runAction(action) {
    try {
      if (action.startsWith("recent:")) { closeMenu(); hideStart(); return openRecent(action.slice(7)); }
      if (action.startsWith("recentRemove:")) return removeRecentEntry(action.slice(13), true);
      if (action.startsWith("propLook:")) {
        const parts = action.split(":");
        return setLineLook(parts[1], parts[2]);
      }
      if (action.startsWith("fxLook:")) return setEffectLook(action.slice(7));
      if (action.startsWith("fxWheel:")) { fxWheelTarget = action.slice(8); renderRight(); return fxWheelTarget; }
      if (action === "fxReset") return resetEffects();
      if (action.startsWith("startDocClose:")) return closeTab(Number(action.slice(14)));
      if (action.startsWith("startDoc:")) {
        active = Number(action.slice(9));
        selected = [];
        hideStart();
        renderAll();
        return active;
      }
      if (action.startsWith("tool:")) {
        closeMenu();
        if (action === "tool:select") {
          // a fresh start: nothing stays picked from before, shapes or an area
          if (textEditing) finishTextEditor();
          selected = [];
          region = null;
          renderOverlay();
          renderRight();
          renderLeft();
        }
        return setTool(action.slice(5));
      }
      if (action.startsWith("color:")) { closeMenu(); return setColor(action.slice(6)); }
      if (action.startsWith("width:")) { closeMenu(); return setActiveSize(Number(action.slice(6))); }
      if (action.startsWith("removeShape:")) { closeMenu(); return removeShapeById(action.slice(12)); }
      if (action.startsWith("shape:")) { closeMenu(); return selectShape(action.slice(6)); }
      if (action.startsWith("theme:")) { closeMenu(); return setTheme(action.slice(6)); }
      if (action === "fontMenu") {
        const node = document.querySelector("[data-action='fontMenu']");
        const rect = node ? node.getBoundingClientRect() : { left: 80, bottom: 48 };
        closeMenu();
        return openFontMenu(rect.left, rect.bottom);
      }
      if (action.startsWith("font:")) { closeMenu(); return applyTextFont({ fontFamily: action.slice(5) }); }
      const fn = actions[action];
      if (!fn) throw new Error("Unknown action: " + action);
      closeMenu();
      return Promise.resolve(fn()).catch(showError);
    } catch (error) {
      showError(error);
      return null;
    }
  }

  /* Taking one file off the recent list. From the File menu the menu opens again where it was,
   * one row shorter, so several can be taken off in a row. */
  function removeRecentEntry(id, reopen) {
    Store.removeRecent(settings, id);
    saveSettings();
    const reopenAt = reopen ? lastMenu : null;
    closeMenu();
    renderMenubar();
    renderStart();
    if (popupKind === "recent") refreshPopupDocument("recent");
    if (reopenAt && reopenAt.id === "file") openMenu("file", reopenAt.x, reopenAt.y, reopenAt.align);
    return settings.recent;
  }

  function clearRecentEntries() {
    Store.clearRecent(settings);
    saveSettings();
    closeMenu();
    renderMenubar();
    renderStart();
    if (popupKind === "recent") refreshPopupDocument("recent");
    return settings.recent;
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
    if (textEditing) finishTextEditor();
    settings.tool = "select";
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
    if (fields.gridSize != null && fields.gridSize !== "") settings.gridSize = clamp(fields.gridSize, 2, 200);
    const start = {};
    if ("startShow" in fields) start.show = Boolean(fields.startShow);
    if (fields.startSpeed != null && fields.startSpeed !== "") start.speed = Number(fields.startSpeed);
    if (fields.startOpacity != null && fields.startOpacity !== "") start.cardOpacity = Number(fields.startOpacity);
    if ("startShuffle" in fields) start.shuffleSec = fields.startShuffle ? Store.START_SHUFFLE_SECONDS : 0;
    settings.startScreen = Store.normalizeStart(Object.assign({}, settings.startScreen, start));
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
    const html = popupDocument(kind);
    if (window.desktop && window.desktop.refreshPopup && !TEST) {
      window.desktop.refreshPopup(html, popupGen);
      return;
    }
    if (popupWindow && !popupWindow.closed && !TEST) {
      popupHtml = html;
      postPopupHtml();
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

  /* Picking a lossless format greys the quality out instead of rebuilding the dialog, so the
   * list keeps its focus. A dialog in its own window is rebuilt. */
  function syncConvertPopup() {
    const lossy = lossyFormat(convertState.format);
    if (popupEl && popupEl.dataset.kind === "convert") {
      const line = popupEl.querySelector("#qualityLine");
      const hint = popupEl.querySelector("#qualityHint");
      if (line) line.toggleAttribute("data-off", !lossy);
      if (hint) hint.textContent = lossy ? t("convert.qualityHint") : t("convert.lossless");
      return;
    }
    if (popupKind === "convert") refreshPopupDocument("convert");
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
    if (action === "create-new") return createNewDoc(fields);
    if (action === "canvas-sync") return null;
    if (action === "apply-custom") {
      setCustom(fields);
      setTheme("custom");
      closePopup();
      return settings.custom;
    }
    if (action === "apply-drop") {
      lastCanvasDrop = applyDropRole(fields.role || "drawing").catch(showError);
      closePopup();
      return fields.role;
    }
    if (action === "fetch-url") {
      closePopup();
      openFromUrl(fields.url).catch(showError);
      return fields.url;
    }
    if (action === "convert-sync") {
      const before = convertState.format;
      convertState.format = fields.format || convertState.format;
      if (fields.quality) convertState.quality = clamp(fields.quality, 10, 100);
      applyExportEffects(fields);
      if (before !== convertState.format) syncConvertPopup();
      return convertState;
    }
    if (action === "apply-convert") {
      applyExportEffects(fields);
      convertState.format = fields.format || convertState.format;
      if (fields.quality) convertState.quality = clamp(fields.quality, 10, 100);
      const spec = Formats.SAVE_FORMATS.find((item) => item.id === convertState.format) || Formats.SAVE_FORMATS[0];
      // the desktop build asks where to write it; a browser downloads it
      if (window.desktop && window.desktop.pickSave && !TEST) {
        const doc = current();
        const base = (doc.name.replace(/\.[^.]+$/, "") || "image") + "." + spec.ext;
        const dir = settings.lastSaveDir ? settings.lastSaveDir.replace(/\\/g, "/").replace(/\/$/, "") + "/" : "";
        closePopup();
        window.desktop.pickSave(dir + base, saveFilters().filter((item) => item.extensions.indexOf(spec.ext) >= 0))
          .then((file) => (file ? convertCurrent(spec.id, convertState.quality, file) : null))
          .catch(showError);
        return convertState;
      }
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
        const target = tab.path || defaultSaveName(tab);
        finishSave(tab, target, saveFormatOf(target)).then(() => { closePopup(); dropTab(index); });
        return null;
      }
      const doc = current();
      const target = doc.path || defaultSaveName(doc);
      finishSave(doc, target, saveFormatOf(target)).then(() => closeApplication());
      return null;
    }
    if (action === "confirm-save") {
      const doc = current();
      const name = fields.name || doc.name;
      const dir = fields.dir || settings.lastSaveDir || "";
      const picked = Formats.SAVE_FORMATS.find((item) => item.id === fields.format);
      const format = picked ? picked.id : "mypaint";
      const base = name.split(/[/\\]/).pop().replace(/\.[A-Za-z0-9]{1,8}$/, "") + "." + (picked ? picked.ext : "mypaint");
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
    if (action === "settings-tab") { settingsTab = fields.id || settingsTab; return settingsTab; }
    if (action === "start-bg") {
      return saveStartPrefs({ background: (fieldOverride && fieldOverride.id) || (source && source.dataset && source.dataset.id) });
    }
    if (action === "start-arrange") {
      if (startVisible) startScreen().arrange();
      else saveStartPrefs({ layout: null });
      return settings.startScreen;
    }
    if (action === "start-reset") return saveStartPrefs(Store.defaults().startScreen);
    if (action === "start-preview") {
      applySettingsForm(fields, true);
      closePopup();
      return showStart();
    }
    if (action === "bg-choose") { $("bgOpen").click(); return null; }
    if (action === "bg-clear") { clearBackground(); return null; }
    if (action === "remove-recent") {
      const id = (fieldOverride && fieldOverride.id) || (source && source.dataset && source.dataset.id);
      removeRecentEntry(id, false);
      openPopup("recent");
      return settings.recent;
    }
    if (action === "clear-recent") {
      clearRecentEntries();
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
      if (!popupEl) refreshPopupDocument("print");
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
    if (shape && key === "text") {
      if (textEditing === shape.id) {
        textEditing = null;
        textSession = null;
        const editor = $("textEditor");
        if (editor) editor.hidden = true;
      }
      if (!textFieldUndo) pushUndo();
      textFieldUndo = false;
      shape.text = target.value;
      delete shape.runs;
      Paint.normalizeShape(shape);
      markDirty();
      renderAll();
      return;
    }
    if (shape && key === "headSize") {
      pushUndo();
      selectedShapes().forEach((item) => {
        if (item.kind === "arrow") item.headSize = clamp(target.value, 50, 300);
      });
      markDirty();
      renderAll();
      return;
    }
    if (shape && (key === "shapeW" || key === "shapeH")) {
      // the top left corner stays; a text takes the size as a font size
      const box = Paint.bounds(shape);
      const value = clamp(target.value, 1, 8192);
      pushUndo();
      if (key === "shapeW") Paint.resizeShape(shape, "e", { x: box.x, y: box.y, w: value, h: box.h });
      else Paint.resizeShape(shape, "s", { x: box.x, y: box.y, w: box.w, h: value });
      markDirty();
      renderAll();
      return;
    }
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
    if (key === "canvasWidth" || key === "canvasHeight") svgFollowCanvas(doc);
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
    else if (key === "noFill") { settings.fillColor = target.checked ? "" : (settings.fillColor || "#ffffff"); recolorSelection("fill", settings.fillColor); saveSettings(); renderLeft(); }
    else if (key === "strokeWidth") setStrokeWidth(target.value);
    else if (key === "size") { target.style.width = digitsWidth(target.value); setActiveSize(target.value); }
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
      pressAdds = event.shiftKey || event.ctrlKey || event.metaKey;
      beginDraw(point.x, point.y);
      pressAdds = false;
    });
    board.addEventListener("pointermove", (event) => {
      const point = toDocPoint(event.clientX, event.clientY);
      if (!boardDragging()) {
        pointer = point;
        pointerSeen = true;
        probeAt(point.x, point.y);
        renderStatus();
        scheduleRulers();
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
      if (event.target.closest("#board, #textEditor")) return;
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
    $("stage").addEventListener("scroll", scheduleRulers, { passive: true });
    window.addEventListener("resize", scheduleRulers);
    $("toolbar").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    // pressing a font button while typing must not take the caret out of the text
    $("toolbar").addEventListener("mousedown", (event) => {
      if (textEditing && event.target.closest(".font-bar button")) event.preventDefault();
    });
    $("leftPanel").addEventListener("mousedown", (event) => {
      if (textEditing && event.target.closest(".swatch-btn")) event.preventDefault();
    });
    $("toolbar").addEventListener("change", (event) => {
      const pick = event.target.closest("[data-font='family']");
      if (pick) applyTextFont({ fontFamily: pick.value });
    });
    $("menubar").addEventListener("click", (event) => {
      const control = event.target.closest("[data-window]");
      if (control) {
        closeMenu();
        if (window.desktop && window.desktop.windowCommand) window.desktop.windowCommand(control.dataset.window);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) {
        closeMenu();
        runAction(action.dataset.action);
        return;
      }
      const btn = event.target.closest("[data-menu]");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      openMenu(btn.dataset.menu, rect.left, rect.bottom, "left");
    });
    $("leftPanel").addEventListener("click", (event) => {
      const swatch = event.target.closest("[data-color]");
      if (swatch) { openColorFor(swatch); return; }
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("leftPanel").addEventListener("change", onPaletteChange);
    $("leftPanel").addEventListener("input", onPaletteChange);
    $("rightPanel").addEventListener("input", (event) => {
      const target = event.target;
      if (target.id === "svgSource") {
        onSvgInput(target);
        return;
      }
      if (!target.dataset || target.dataset.prop !== "text") return;
      const shape = firstSelected();
      if (!shape || shape.kind !== "text") return;
      if (textEditing === shape.id) {
        textEditing = null;
        textSession = null;
        const editor = $("textEditor");
        if (editor) editor.hidden = true;
      }
      if (!textFieldUndo) {
        pushUndo();
        textFieldUndo = true;
      }
      shape.text = target.value;
      delete shape.runs;
      markDirty();
      renderBoard();
    });
    // one undo step per stay in the source box
    $("rightPanel").addEventListener("focusout", (event) => {
      if (event.target.id === "svgSource") svgEditUndo = null;
    });
    $("rightPanel").addEventListener("change", onPropertyChange);
    $("rightPanel").addEventListener("change", onDicomChange);
    $("rightPanel").addEventListener("change", onEffectChange);
    $("rightPanel").addEventListener("pointerdown", onFxWheelDown);
    $("rightPanel").addEventListener("click", (event) => {
      const step = event.target.closest("[data-step]");
      if (step) {
        event.preventDefault();
        stepProperty(step);
        return;
      }
      const swatch = event.target.closest("[data-color]");
      if (swatch) { openColorFor(swatch); return; }
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("menuLayer").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn && !btn.disabled) runAction(btn.dataset.action);
    });
    Range.bind($("popupLayer"));
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
      if (kind === "convert") { popupAction("convert-sync", null, readFields(popupEl)); return; }
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
      if (textEditing) finishTextEditor();
      active = Number(tab.dataset.tab);
      selected = [];
      renderAll();
    });
    wireToolTips();
    wireSplitter("splitLeft", "left");
    wireSplitter("splitRight", "right");
    wireShapeHandles();
    $("tabPrev").addEventListener("click", () => { $("tabstrip").scrollLeft -= 140; });
    $("tabNext").addEventListener("click", () => { $("tabstrip").scrollLeft += 140; });
    $("stage").addEventListener("contextmenu", (event) => {
      if (event.target.id === "board") return;
      event.preventDefault();
      openContext(event.clientX, event.clientY);
    });
    window.addEventListener("keydown", (event) => {
      const inField = event.target.closest && event.target.closest("input, textarea, select");
      if (settings.tool === "text" && !inField && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        let shape = editingShape();
        if (!shape) {
          const doc = current();
          if (!doc) return;
          const point = pointerSeen ? pointer : { x: doc.width / 2, y: doc.height / 2 };
          shape = beginDraw(point.x, point.y);
        }
        const editor = $("textEditor");
        if (!editor || !shape) return;
        editor.focus();
        if (!RichText.selection(editor)) placeCaret(editor, false);
        if (!document.execCommand("insertText", false, event.key)) {
          editor.value = (editor.value || "") + event.key;
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      if (event.key === "Escape" || event.code === "Escape") {
        if (inField) return;
        if (startVisible && !menuEl && !popupEl) { hideStart(); return; }
        closeMenu();
        doDeselect();
        return;
      }
      if (!inField && (event.key === "Delete" || event.key === "Backspace" || event.code === "Delete" || event.code === "Backspace")) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = shortcutLetter(event);
      // typing in the source: undo is the box's own, one keystroke at a time
      if (event.target.id === "svgSource" && (key === "z" || key === "y")) return;
      if (!key && event.code !== "Equal" && event.code !== "Minus" && event.code !== "Digit0" && event.code !== "NumpadAdd" && event.code !== "NumpadSubtract" && event.code !== "Numpad0") return;
      if (key === "c") { if (!inField) doCopy(); }
      else if (key === "v") { if (!inField) { event.preventDefault(); doPaste(); } }
      else if (key === "x") { if (!inField) { event.preventDefault(); doCut(); } }
      else if (key === "a") { if (!inField) { event.preventDefault(); doSelectAll(); } }
      else if (key === "z" && event.shiftKey) { event.preventDefault(); doRedo(); }
      else if (key === "z") { event.preventDefault(); doUndo(); }
      else if (key === "y") { event.preventDefault(); doRedo(); }
      else if (key === "s" && !event.shiftKey) { event.preventDefault(); actions.save(); }
      else if (key === "p") { event.preventDefault(); actions.print(); }
      else if (key === "n") { event.preventDefault(); actions.new(); }
      else if (key === "o") { event.preventDefault(); actions.open(); }
      else if (!inField && (key === "+" || key === "=" || event.code === "Equal" || event.code === "NumpadAdd")) { event.preventDefault(); zoomStep(1); }
      else if (!inField && (key === "-" || event.code === "Minus" || event.code === "NumpadSubtract")) { event.preventDefault(); zoomStep(-1); }
      else if (!inField && (key === "0" || event.code === "Digit0" || event.code === "Numpad0")) { event.preventDefault(); setZoom(100); }
    }, true);
    window.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomByWheel(event.deltaY);
    }, { passive: false });
    const acceptDrop = (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    window.addEventListener("dragenter", acceptDrop, true);
    window.addEventListener("dragover", acceptDrop, true);
    window.addEventListener("drop", (event) => {
      acceptDrop(event);
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      // dropped on the work area, the question already has "into this picture" chosen, for that spot
      const onStage = event.target && event.target.closest && event.target.closest("#stage");
      const point = onStage && !startVisible && current() ? toDocPoint(event.clientX, event.clientY) : null;
      handleDroppedFiles(files, point).catch(showError);
    }, true);
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
    const onPopupMessage = (payload) => {
      const name = payload && payload.name;
      if (!name) return;
      if (actions[name] || name.indexOf(":") > 0) runAction(name);
      else popupAction(name, null, payload.detail || {});
    };
    if (window.desktop && window.desktop.onHostAction) window.desktop.onHostAction(onPopupMessage);
    window.addEventListener("message", (event) => {
      if (!popupWindow || event.source !== popupWindow) return;
      const data = event.data;
      if (!data || data.source !== "mypaint") return;
      if (data.type === "ready") postPopupHtml();
      if (data.type === "action") onPopupMessage(data);
    });
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
    /* The desktop host lists the installed fonts itself. queryLocalFonts() comes second and
     * only gets a few seconds: in a web view its permission prompt can wait forever, and
     * boot() waits for this before anything is drawn. */
    if (window.desktop && window.desktop.listFonts) {
      try {
        const names = await window.desktop.listFonts();
        if (names && names.length) { fontCatalog = names; return fontCatalog; }
      } catch (error) { /* fall through */ }
    }
    try {
      if (typeof window.queryLocalFonts === "function") {
        const faces = await Promise.race([
          window.queryLocalFonts(),
          new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
        ]);
        const names = Fonts.uniqueFamilies(faces.map((face) => face.family));
        if (names.length) { fontCatalog = names; return fontCatalog; }
      }
    } catch (error) { /* permission or unsupported */ }
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
    await Promise.all([loadFonts(), Formats.probeWriters().catch(() => [])]);
    docs.forEach(attachSvgFrame);
    renderAll();
    if (!TEST && Store.normalizeStart(settings.startScreen).show) showStart();
    window.MyPaint = api;
    api.ready = true;
  }

  async function resetForTests() {
    hideStart();
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
    lastGuide = "";
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
    pointerSeen = false;
    textEditing = null;
    textSession = null;
    textFieldUndo = false;
    const textEditor = $("textEditor");
    if (textEditor) textEditor.hidden = true;
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
    startScreen: () => startScreen(),
    canvasDropDone: () => lastCanvasDrop,
    getSelected: () => selected.slice(),
    markRulers: (x, y) => { pointer = { x: x, y: y }; pointerSeen = true; return renderRulers(); },
    saveStartPrefs: saveStartPrefs,
    getStartBackgrounds: () => Store.START_BACKGROUNDS.slice(),
    showStart: showStart,
    hideStart: hideStart,
    startVisible: () => startVisible,
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
    setPanelWidth: setPanelWidth,
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
    flushSvg: flushSvg,
    pagesForPrint: pagesForPrint,
    images: () => images,
    renderCanvas: renderCanvas,
    setPrintState: (values) => Object.assign(printState, values),
    finishSave: finishSave,
    documentSvg: () => documentSvg(current()),
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
    addTabs: (count) => { for (let i = 0; i < count; i += 1) docs.push(newDoc({ name: "extra-" + i + ".mypaint" })); renderTabs(); },
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
    getLastGuide: () => lastGuide,
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
