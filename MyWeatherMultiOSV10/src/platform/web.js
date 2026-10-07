import { dirname } from "../core/paths.js";
import { resolveFontList } from "../core/fonts.js";

const KEY = "myweather.settings.v1";

export function createWebPlatform() {
  const files = new Map();
  return {
    kind: "web",
    nativePopups: false,
    nativeMenus: false,
    nativeWindow: false,
    readSettingsSync() {
      try {
        const text = localStorage.getItem(KEY);
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    },
    async readSettings() {
      return this.readSettingsSync();
    },
    async writeSettings(data) {
      localStorage.setItem(KEY, JSON.stringify(data));
    },
    async listFonts() {
      try {
        if (typeof window.queryLocalFonts === "function") {
          const fonts = await window.queryLocalFonts();
          return resolveFontList(fonts.map((font) => font.family));
        }
      } catch {
        /* permission or unsupported */
      }
      return resolveFontList([]);
    },
    async fetch(url, options = {}) {
      const headers = { ...(options.headers || {}) };
      delete headers["User-Agent"];
      return fetch(url, { headers, signal: options.signal });
    },
    async openFile({ startDir }) {
      const file = await pickFile(false);
      if (!file) return null;
      return { path: file.name, directory: startDir || "", text: await file.text() };
    },
    async saveFile({ startDir, suggestedName, text }) {
      download(suggestedName, text);
      files.set(suggestedName, text);
      return { path: suggestedName, directory: startDir || "" };
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
      files.set(filePath, text);
      download(filePath.split(/[/\\]/).pop(), text);
      return { path: filePath, directory: dirname(filePath) };
    },
    async pickImage({ startDir } = {}) {
      const file = await pickFile(true);
      if (!file) return null;
      const dataUrl = await readUrl(file);
      return { dataUrl, name: file.name, type: file.type, size: file.size, directory: startDir || "" };
    },
    async print({ html }) {
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      document.body.appendChild(frame);
      frame.srcdoc = html;
      await new Promise((resolve) => {
        frame.onload = () => resolve();
      });
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    },
    async openExternal(url) {
      window.open(url, "_blank", "noopener");
    },
    async windowControl() {},
    async confirmQuit() {},
  };
}

function pickFile(image) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = image ? "image/*" : ".myweather,application/json";
    input.addEventListener("change", () => resolve(input.files?.[0] || null));
    input.click();
  });
}

function download(name, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function readUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
