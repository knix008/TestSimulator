(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "mypaint.settings.v1";
  const SESSION_KEY = "mypaint.session.v1";
  const MAX_RECENT = 10;

  function defaults() {
    return {
      language: "ko",
      theme: "light-classic",
      fontFamily: "Segoe UI",
      fontSize: 24,
      fontStyle: "normal",
      zoom: 100,
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
      shapeOpacity: 100,
      canvasWidth: 900,
      canvasHeight: 560,
      canvasBackground: "#ffffff",
      recentDirs: [],
      lastOpenDir: "",
      lastSaveDir: "",
      recent: [],
      custom: null,
      layout: { left: 200, right: 200 },
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
      next.zoom = clamp(next.zoom, 25, 400);
      next.fontSize = clamp(next.fontSize, 6, 400);
      next.strokeWidth = clamp(next.strokeWidth, 1, 96);
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
      name: item.name || "untitled.mpaint",
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
  };
});
