(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "mypaint.settings.v1";
  const SESSION_KEY = "mypaint.session.v1";
  const MAX_RECENT = 10;
  const START_BACKGROUNDS = [
    "brushStrokes", "paintSplash", "paletteRing", "pencils", "gallery",
    "pixelField", "colorWheel", "sprayCloud", "solids", "gridPaper",
    "bezier", "layers", "inkDrops", "swatches", "scanSlices",
    "constellation", "ripples", "aurora", "hexGrid", "bubbles",
  ];
  const START_SPEED = { min: 0, max: 300, step: 10, normal: 100, reduced: 40 };
  const START_OPACITY = { min: 20, max: 100, step: 5 };
  const START_SHUFFLE_SECONDS = 20;

  function defaults() {
    return {
      language: "ko",
      theme: "light-classic",
      fontFamily: "Segoe UI",
      fontSize: 24,
      fontStyle: "normal",
      fontUnderline: false,
      fontStrike: false,
      fontDefaultsClean: true,
      zoom: 100,
      showGrid: false,
      gridSize: 10,
      showRulers: false,
      showShapes: true,
      startScreen: {
        show: true,
        background: START_BACKGROUNDS[0],
        speed: null,
        shuffleSec: 0,
        cardOpacity: 80,
        layout: null,
      },
      recentColors: [],
      backgroundOpacity: 35,
      backgroundName: "",
      backgroundBytes: 0,
      showLeft: true,
      showRight: true,
      restoreSession: true,
      tool: "pencil",
      color: "#000000",
      fillColor: "",
      strokeWidth: 2,
      eraserSize: 12,
      shapeOpacity: 100,
      canvasWidth: 900,
      canvasHeight: 560,
      canvasBackground: "#ffffff",
      recentDirs: [],
      lastOpenDir: "",
      lastSaveDir: "",
      recent: [],
      custom: null,
      layout: { left: 200, right: 240 },
      print: {
        scope: "current",
        paper: "A4",
        orientation: "landscape",
        margin: 12,
        marginTop: 12,
        marginRight: 12,
        marginBottom: 12,
        marginLeft: 12,
        scaleMode: "fit",
        scalePercent: 100,
        align: "middle",
        copies: 1,
        printBackground: true,
        from: 1,
        to: 1,
      },
    };
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  const stepped = (value, range) => Math.max(range.min, Math.min(range.max, Math.round(value / range.step) * range.step));

  /* The start screen: whether it shows when the program starts, which moving background, how
   * fast (percent of normal; null is the default for the motion setting), how often it changes
   * by itself (seconds, 0 is off), how opaque the cards over it are, and where the cards sit
   * (see start-layout.js; null is the default arrangement). */
  function normalizeStart(raw) {
    const base = defaults().startScreen;
    const value = Object.assign({}, base, raw || {});
    const speed = value.speed === null || value.speed === undefined || value.speed === "" ? NaN : Number(value.speed);
    const opacity = Number(value.cardOpacity);
    const shuffle = Number(value.shuffleSec);
    return {
      show: value.show !== false,
      background: START_BACKGROUNDS.indexOf(value.background) >= 0 ? value.background : base.background,
      speed: Number.isFinite(speed) ? stepped(speed, START_SPEED) : null,
      shuffleSec: Number.isFinite(shuffle) && shuffle > 0 ? Math.min(600, Math.max(5, Math.round(shuffle))) : 0,
      cardOpacity: Number.isFinite(opacity) ? stepped(opacity, START_OPACITY) : base.cardOpacity,
      layout: value.layout && typeof value.layout === "object" && !Array.isArray(value.layout) ? value.layout : null,
    };
  }

  /* The speed actually used: the saved one, or the default for the motion setting. Reduced
   * motion only slows the default, never stops it: Windows reports it whenever its animation
   * effects are off. */
  function effectiveStartSpeed(start, reducedMotion) {
    return start.speed === null || start.speed === undefined ? (reducedMotion ? START_SPEED.reduced : START_SPEED.normal) : start.speed;
  }

  function load(storage) {
    const base = defaults();
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      const next = Object.assign(base, data);
      next.recent = Array.isArray(data.recent) ? data.recent.slice(0, MAX_RECENT) : [];
      next.recentDirs = Array.isArray(data.recentDirs) ? data.recentDirs.slice(0, MAX_RECENT) : [];
      next.print = Object.assign(base.print, data.print || {});
      next.layout = Object.assign(base.layout, data.layout || {});
      next.startScreen = normalizeStart(Object.assign(base.startScreen, data.startScreen || {}));
      // Text styling used to leak into these, so a saved italic may never have been asked for.
      if (!data.fontDefaultsClean) {
        next.fontStyle = "normal";
        next.fontUnderline = false;
        next.fontStrike = false;
        next.fontDefaultsClean = true;
      }
      next.gridSize = clamp(next.gridSize, 2, 200);
      next.showRulers = Boolean(next.showRulers);
      next.recentColors = Array.isArray(data.recentColors) ? data.recentColors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 12) : [];
      next.zoom = clamp(next.zoom, 25, 400);
      next.fontSize = clamp(next.fontSize, 6, 400);
      next.strokeWidth = clamp(next.strokeWidth, 1, 96);
      next.eraserSize = clamp(next.eraserSize, 1, 96);
      next.shapeOpacity = clamp(next.shapeOpacity, 0, 100);
      next.backgroundOpacity = clamp(next.backgroundOpacity, 0, 100);
      next.canvasWidth = clamp(next.canvasWidth, 16, 8192);
      next.canvasHeight = clamp(next.canvasHeight, 16, 8192);
      if (next.language !== "en") next.language = "ko";
      return next;
    } catch (error) {
      return base;
    }
  }

  function save(storage, state) {
    const copy = Object.assign({}, state, {
      recent: (state.recent || []).slice(0, MAX_RECENT),
      recentDirs: (state.recentDirs || []).slice(0, MAX_RECENT),
    });
    storage.setItem(KEY, JSON.stringify(copy));
    return copy;
  }

  function directoryOf(filePath) {
    if (!filePath) return "";
    const norm = String(filePath).replace(/\\/g, "/");
    const index = norm.lastIndexOf("/");
    return index >= 0 ? norm.slice(0, index) : "";
  }

  function addRecent(state, item) {
    const entry = {
      id: item.id || (String(item.path || item.name) + ":" + Date.now()),
      name: item.name || "untitled.mypaint",
      path: item.path || "",
      at: item.at || new Date().toISOString(),
    };
    if (item.payload) entry.payload = item.payload;
    const recent = (state.recent || []).filter((row) => (entry.path ? row.path !== entry.path : row.id !== entry.id));
    recent.unshift(entry);
    state.recent = recent.slice(0, MAX_RECENT);
    return state.recent;
  }

  function removeRecent(state, id) {
    state.recent = (state.recent || []).filter((row) => row.id !== id);
    return state.recent;
  }

  function clearRecent(state) {
    state.recent = [];
    return state.recent;
  }

  function addRecentDir(state, dir) {
    const clean = String(dir || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!clean) return state.recentDirs || [];
    const list = (state.recentDirs || []).filter((row) => row !== clean);
    list.unshift(clean);
    state.recentDirs = list.slice(0, MAX_RECENT);
    return state.recentDirs;
  }

  function removeRecentDir(state, dir) {
    state.recentDirs = (state.recentDirs || []).filter((row) => row !== dir);
    return state.recentDirs;
  }

  function clearRecentDirs(state) {
    state.recentDirs = [];
    return state.recentDirs;
  }

  function rememberDirectory(state, kind, filePath) {
    const dir = directoryOf(filePath);
    if (!dir) return state;
    if (kind === "save") state.lastSaveDir = dir;
    else state.lastOpenDir = dir;
    addRecentDir(state, dir);
    return state;
  }

  return {
    KEY: KEY,
    SESSION_KEY: SESSION_KEY,
    MAX_RECENT: MAX_RECENT,
    defaults: defaults,
    load: load,
    save: save,
    addRecent: addRecent,
    removeRecent: removeRecent,
    clearRecent: clearRecent,
    addRecentDir: addRecentDir,
    removeRecentDir: removeRecentDir,
    clearRecentDirs: clearRecentDirs,
    directoryOf: directoryOf,
    rememberDirectory: rememberDirectory,
    normalizeStart: normalizeStart,
    effectiveStartSpeed: effectiveStartSpeed,
    START_BACKGROUNDS: START_BACKGROUNDS,
    START_SPEED: START_SPEED,
    START_OPACITY: START_OPACITY,
    START_SHUFFLE_SECONDS: START_SHUFFLE_SECONDS,
  };
});
