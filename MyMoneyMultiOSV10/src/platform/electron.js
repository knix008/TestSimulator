export function createElectronPlatform(api) {
  return {
    kind: "electron",
    nativePopups: true,
    nativeMenus: true,
    nativeWindow: true,
    readSettingsSync: null,
    async fetch(url, options = {}) {
      const response = await api.fetch(url, { headers: options.headers || {} });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => JSON.parse(response.text),
        text: async () => response.text,
      };
    },
    async listFonts() {
      return api.listFonts();
    },
    async resizeWindow(step) {
      return api.resizeWindow(step);
    },
    async moveWindow(step) {
      return api.moveWindow(step);
    },
    async resizeWindowTo(size) {
      return api.resizeWindowTo(size);
    },
    onWindowState(callback) {
      api.onWindowState(callback);
    },
    async readSettings() {
      return api.readSettings();
    },
    async writeSettings(data) {
      return api.writeSettings(data);
    },
    async setAutoStart(on) {
      return api.setAutoStart?.(Boolean(on));
    },
    async getAutoStart() {
      return api.getAutoStart?.();
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
      return api.windowBounds?.() || null;
    },
    async showMenu(payload) {
      return api.showMenu(payload);
    },
    onMenuCommand(callback) {
      api.onMenuCommand(callback);
    },
    onRequestClose(callback) {
      api.onRequestClose(callback);
    },
    async openPopup(spec) {
      const started = await api.beginPopup(spec);
      if (started?.focused) return { action: "focused" };
      const id = started?.id || started;
      return (await api.waitPopup(id)) || { action: "close" };
    },
    async beginProgress(spec) {
      const started = await api.beginPopup(spec);
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
