import { parseFcList, parseMacFonts, parseWindowsFonts, resolveFontList } from "../core/fonts.js";
import { sanitizeBoard } from "../core/settings.js";
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

export function parseFonts(listed) {
  const stdout = listed?.stdout || "";
  if (!stdout.trim()) return resolveFontList([]);
  if (listed.platform === "windows") return resolveFontList(parseWindowsFonts(stdout));
  if (listed.platform === "macos") return resolveFontList(parseMacFonts(stdout));
  return resolveFontList(parseFcList(stdout));
}

/** Where a dialog opens: beside the market window that asked, on the same display. */
async function popupPlace(api, spec) {
  const info = await api.screenInfo?.().catch(() => null);
  if (!info) return null;
  const options = popupWindowOptions(spec, null, info.workArea, info.bounds);
  return { x: options.x, y: options.y, width: options.width, height: options.height };
}

/** The desktop platform: the page's calls, carried to the Tauri shell by `api` (tauri-bridge.js). */
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
    async resizeWindowTo(size) {
      return api.resizeWindowTo(size);
    },
    onWindowState(callback) {
      api.onWindowState(callback);
    },
    async readSettings() {
      return api.readSettings();
    },
    /** An extra window's board goes into its slot as the main process would have stored it. */
    async writeSettings(data) {
      return api.writeSettings(data, sanitizeBoard(data?.defaultBoard));
    },
    async setAutoStart(on) {
      return api.setAutoStart(Boolean(on));
    },
    async getAutoStart() {
      return api.getAutoStart();
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
    onSettingsChanged(callback) {
      api.onSettingsChanged?.(callback);
    },
    onSecondInstance(callback) {
      api.onSecondInstance?.(callback);
    },
    async messageBox(options) {
      return api.messageBox?.(options);
    },
    async windowBoot() {
      return (await api.windowBoot?.()) || null;
    },
    panelPopups: {},
    async newWindow(board) {
      return api.newWindow?.(sanitizeBoard(board));
    },
    async removeWindow() {
      return api.removeWindow?.();
    },
    async openPopup(spec) {
      const started = await api.beginPopup(spec, await popupPlace(api, spec));
      if (started?.focused) return { action: "focused" };
      const id = started?.id || started;
      if (spec?.type === "panel" && spec.panel) this.panelPopups[spec.panel] = id;
      try {
        return (await api.waitPopup(id)) || { action: "close" };
      } finally {
        if (spec?.panel && this.panelPopups[spec.panel] === id) delete this.panelPopups[spec.panel];
      }
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
