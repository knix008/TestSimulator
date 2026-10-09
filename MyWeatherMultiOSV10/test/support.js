import { createApp } from "../src/app.js";

export function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

export function openMeteoBody(dates, maxTemp = 20) {
  return {
    daily: {
      time: dates,
      temperature_2m_min: dates.map((_, index) => 10 + index),
      temperature_2m_max: dates.map((_, index) => maxTemp + index),
      precipitation_sum: dates.map(() => 1.5),
      wind_speed_10m_max: dates.map(() => 12),
      weather_code: dates.map(() => 1),
    },
    hourly: {
      time: dates.flatMap((date) => [`${date}T00:00`, `${date}T12:00`]),
      temperature_2m: dates.flatMap(() => [11, maxTemp]),
      relative_humidity_2m: dates.flatMap(() => [60, 40]),
      precipitation: dates.flatMap(() => [0, 0.4]),
      weather_code: dates.flatMap(() => [1, 2]),
      wind_speed_10m: dates.flatMap(() => [8, 14]),
    },
  };
}

export const SAMPLE_DATES = ["2026-10-07", "2026-10-08", "2026-10-09"];

export function defaultFetch(url) {
  const href = String(url);
  if (href.includes("geocoding-api")) return jsonResponse({ results: [] });
  if (href.includes("met.no") || href.includes("wttr.in")) return jsonResponse({ error: true }, false, 503);
  if (href.includes("models=gfs")) return jsonResponse(openMeteoBody(SAMPLE_DATES, 22));
  if (href.includes("models=jma")) return jsonResponse({ reason: "unavailable" }, false, 400);
  return jsonResponse(openMeteoBody(SAMPLE_DATES, 20));
}

export function createMemoryPlatform() {
  const files = new Map();
  const platform = {
    kind: "test",
    nativePopups: false,
    nativeMenus: false,
    nativeWindow: false,
    resizeSteps: [],
    moveSteps: [],
    fonts: ["Segoe UI", "Malgun Gothic", "Arial", "Consolas", "Times New Roman"],
    files,
    settings: null,
    loginItems: [],
    prints: [],
    external: [],
    commands: [],
    quit: 0,
    newWindows: [],
    shownCities: [],
    boot: null,
    nextSavePath: null,
    nextOpen: null,
    nextImage: null,
    imageStarts: [],
    lastStartDir: undefined,
    clipboardText: "",
    fetchImpl: defaultFetch,
    readSettingsSync() {
      return this.settings ? structuredClone(this.settings) : null;
    },
    async readSettings() {
      return this.readSettingsSync();
    },
    async writeSettings(data) {
      this.settings = structuredClone(data);
    },
    async setOpenAtLogin(enabled) {
      this.loginItems.push(Boolean(enabled));
    },
    async listFonts() {
      return [...this.fonts];
    },
    async resizeWindow(step) {
      this.resizeSteps.push(step);
    },
    async moveWindow(step) {
      this.moveSteps.push(step);
    },
    onWindowState(callback) {
      this.emitWindowState = callback;
    },
    async fetch(url, options) {
      return this.fetchImpl(url, options);
    },
    async openFile({ startDir }) {
      this.lastStartDir = startDir;
      const next = this.nextOpen;
      this.nextOpen = null;
      return next;
    },
    async saveFile({ startDir, text }) {
      this.lastStartDir = startDir;
      if (!this.nextSavePath) return null;
      const filePath = this.nextSavePath;
      this.nextSavePath = null;
      files.set(filePath, text);
      return { path: filePath, directory: filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "") };
    },
    async readFile(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`ENOENT ${filePath}`);
        error.code = "ENOENT";
        throw error;
      }
      return files.get(filePath);
    },
    async writeFile(filePath, text) {
      if (this.onWrite) await this.onWrite();
      files.set(filePath, text);
      return { path: filePath, directory: filePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "") };
    },
    async pickImage({ startDir } = {}) {
      this.imageStarts.push(startDir || "");
      return this.nextImage;
    },
    async print(payload) {
      this.prints.push(payload);
    },
    async openExternal(url) {
      this.external.push(url);
    },
    async windowControl(action) {
      this.commands.push(action);
    },
    async confirmQuit() {
      this.quit += 1;
    },
    shownCity(index) {
      this.shownCities.push(index);
    },
    async newWindow(options) {
      this.newWindows.push(options);
      return true;
    },
    async windowBoot() {
      return this.boot;
    },
    async writeClipboard(text) {
      this.clipboardText = String(text);
    },
    async readClipboard() {
      return this.clipboardText;
    },
  };
  return platform;
}

export async function settle() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function withApp(fn, options = {}) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const platform = options.platform || createMemoryPlatform();
  if (options.fonts) platform.fonts = options.fonts;
  if (options.fetch) platform.fetchImpl = options.fetch;
  const app = createApp(root, {
    platform,
    autoLoad: false,
    now: () => new Date(2026, 9, 7, 9, 0, 0),
    ...options.app,
  });
  await app.ready;
  try {
    await fn({ app, platform, root });
  } finally {
    app.destroy();
    root.remove();
  }
}
