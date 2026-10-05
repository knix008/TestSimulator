(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEY = "mymerge.settings.v1";
  const SESSION_KEY = "mymerge.session.v1";
  const MAX_RECENT = 10;

  function defaults() {
    return {
      language: "ko",
      theme: "dark-ink",
      fontFamily: "Consolas",
      fontSize: 14,
      fontStyle: "normal",
      opacity: 100,
      zoom: 100,
      backgroundOpacity: 35,
      backgroundName: "",
      backgroundBytes: 0,
      showLeft: true,
      showRight: true,
      restoreSession: true,
      lastOpenDir: "",
      lastSaveDir: "",
      recent: [],
      custom: null,
      print: { scope: "current", paper: "A4", orientation: "portrait", margin: 12, from: 1, to: 1 },
    };
  }

  function load(storage) {
    const base = defaults();
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      const next = Object.assign(base, data);
      next.recent = Array.isArray(data.recent) ? data.recent.slice(0, MAX_RECENT) : [];
      next.print = Object.assign(base.print, data.print || {});
      next.opacity = clamp(next.opacity, 0, 100);
      next.zoom = clamp(next.zoom, 50, 200);
      next.fontSize = clamp(next.fontSize, 8, 96);
      if (next.language !== "en") next.language = "ko";
      return next;
    } catch (error) {
      return base;
    }
  }

  function save(storage, state) {
    const copy = Object.assign({}, state, { recent: (state.recent || []).slice(0, MAX_RECENT) });
    storage.setItem(KEY, JSON.stringify(copy));
    return copy;
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
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
      name: item.name || "untitled",
      path: item.path || "",
      at: item.at || new Date().toISOString(),
    };
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

  function rememberDirectory(state, kind, filePath) {
    const dir = directoryOf(filePath);
    if (!dir) return state;
    if (kind === "save") state.lastSaveDir = dir;
    else state.lastOpenDir = dir;
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
    directoryOf: directoryOf,
    rememberDirectory: rememberDirectory,
  };
});
