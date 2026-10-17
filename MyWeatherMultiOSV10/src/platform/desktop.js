import { parseFcList, parseMacFonts, parseWindowsFonts, resolveFontList } from "../core/fonts.js";
import { moveCityToWindow } from "../core/settings.js";
import { menuWindowOptions, popupWindowOptions } from "../ui/menu-layout.js";

/**
 * Pointer moves arrive faster than the screen redraws. Each step carries the whole offset
 * from where the drag began, so only the newest step per frame is sent; "start" and "end"
 * always go, and a held-back move is sent before "end".
 */
export function coalesceSteps(send, schedule = (fn) => requestAnimationFrame(fn)) {
  let pending = null;
  let queued = false;
  let last = Promise.resolve(null);
  const flush = () => {
    queued = false;
    const step = pending;
    pending = null;
    if (step) last = send(step);
    return last;
  };
  return (step) => {
    if (step?.phase !== "move") {
      if (pending) flush();
      last = send(step);
      return last;
    }
    pending = step;
    if (!queued) {
      queued = true;
      schedule(flush);
    }
    return last;
  };
}

function parseFonts(listed) {
  const stdout = listed?.stdout || "";
  if (!stdout.trim()) return resolveFontList([]);
  if (listed.platform === "windows") return resolveFontList(parseWindowsFonts(stdout));
  if (listed.platform === "macos") return resolveFontList(parseMacFonts(stdout));
  return resolveFontList(parseFcList(stdout));
}

/** Where a dialog opens: beside the weather window that asked, on the same display. */
async function popupPlace(api, spec) {
  const info = await api.screenInfo?.().catch(() => null);
  if (!info) return null;
  const options = popupWindowOptions(spec, null, info.workArea, info.bounds);
  return { x: options.x, y: options.y, width: options.width, height: options.height };
}

export function createDesktopPlatform(api) {
  const moveWindow = coalesceSteps((step) => api.moveWindow(step));
  const resizeWindow = coalesceSteps((step) => api.resizeWindow(step));
  return {
    kind: "desktop",
    nativePopups: true,
    nativeMenus: true,
    nativeWindow: true,
    readSettingsSync: null,
    async isOnline() {
      return typeof navigator === "undefined" || navigator.onLine !== false;
    },
    async fetch(url, options = {}) {
      const response = await api.fetch(url, { headers: options.headers || {} });
      if (response?.offline) {
        const error = new Error("OFFLINE");
        error.code = "OFFLINE";
        throw error;
      }
      return {
        ok: response.ok,
        status: response.status,
        json: async () => JSON.parse(response.text),
        text: async () => response.text,
      };
    },
    async listFonts() {
      return parseFonts(await api.listFonts());
    },
    resizeWindow,
    moveWindow,
    onWindowState(callback) {
      api.onWindowState(callback);
    },
    async readSettings() {
      return api.readSettings();
    },
    async writeSettings(data) {
      return api.writeSettings(data);
    },
    async setOpenAtLogin(enabled) {
      return api.setOpenAtLogin(Boolean(enabled));
    },
    async openFile(opts) {
      return api.openFile(opts);
    },
    async saveFile(opts) {
      return api.saveFile(opts);
    },
    async readFile(filePath) {
      return api.readFile(filePath);
    },
    async writeFile(filePath, text) {
      return api.writeFile(filePath, text);
    },
    async pickImage(opts) {
      return api.pickImage(opts);
    },
    async print(payload) {
      return api.print(payload);
    },
    async openExternal(url) {
      return api.openExternal(url);
    },
    async windowControl(action) {
      return api.windowControl(action);
    },
    async confirmQuit() {
      return api.confirmQuit();
    },
    async windowBounds() {
      return (await api.windowBounds?.()) || null;
    },
    async showMenu(payload) {
      const options = menuWindowOptions(payload.layout);
      const place = { x: options.x, y: options.y, width: options.width, height: options.height };
      return api.showMenu({ ...payload, place });
    },
    onMenuCommand(callback) {
      api.onMenuCommand(callback);
    },
    onRequestClose(callback) {
      api.onRequestClose(callback);
    },
    onSecondInstance(callback) {
      api.onSecondInstance?.(callback);
    },
    async messageBox(options) {
      return api.messageBox?.(options);
    },
    shownCity(index) {
      api.shownCity?.(index);
    },
    /** A moved city is taken out of its old saved window here, then Rust opens the new one. */
    async newWindow(options = {}) {
      const cities = Array.isArray(options.cities) ? options.cities : [];
      if (!cities.length) return api.newWindow?.(options);
      const windowKey = String(options.windowKey || `win-${Date.now().toString(36)}`);
      const stored = (await api.readSettings()) || {};
      const extraWindows = moveCityToWindow(stored.extraWindows, {
        cities,
        windowKey,
        sourceKey: options.sourceKey || "",
        moved: options.moved || null,
      });
      return api.newWindow?.({ ...options, windowKey, extraWindows });
    },
    async windowBoot() {
      return (await api.windowBoot?.()) || null;
    },
    async weatherWindowCount() {
      return api.weatherWindowCount?.();
    },
    async removeWindow() {
      return api.removeWindow?.();
    },
    onWindowsChanged(callback) {
      api.onWindowsChanged?.(callback);
    },
    onWindowRole(callback) {
      api.onWindowRole?.(callback);
    },
    async openPopup(spec) {
      const started = await api.beginPopup(spec, await popupPlace(api, spec));
      if (started?.focused) return { action: "focused" };
      const id = started?.id || started;
      return (await api.waitPopup(id)) || { action: "close" };
    },
    async beginProgress(spec) {
      const started = await api.beginPopup(spec, await popupPlace(api, spec));
      const id = started?.id || started;
      return {
        update: (percent, message) => api.updatePopup(id, { percent, message }),
        close: () => api.endPopup(id),
      };
    },
    async updatePopup(id, patch) {
      return api.updatePopup(id, patch);
    },
    refreshPopup(key, patch, options) {
      return api.refreshPopup?.(key, patch, options) || false;
    },
    onPopupImmediate(callback) {
      api.onPopupImmediate(callback);
    },
    broadcastTheme(payload) {
      api.broadcastTheme?.(payload);
    },
    broadcastWallpaper(payload) {
      api.broadcastWallpaper?.(payload);
    },
    async writeClipboard(text) {
      return api.clipboardWrite(text);
    },
    async readClipboard() {
      return api.clipboardRead();
    },
  };
}
