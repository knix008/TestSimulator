// One file/print/settings API for both the desktop build (window.myarch,
// exposed by electron/preload.cjs) and the plain browser build.

const desktop = typeof window !== "undefined" ? window.myarch : null;

export const isDesktop = !!desktop;
export const platformName = desktop ? desktop.platform : (navigator.userAgentData?.platform || navigator.platform || "web");

export const PROJECT_FILTER = { name: "MyArchitecture project", extensions: ["myarch"] };

export function bytesToBase64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeText = (bytes) => {
  // UTF-8 unless it is clearly not (old DXF files are often ANSI / CP949).
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* not UTF-8 */ }
  for (const enc of ["euc-kr", "windows-1252"]) { try { return new TextDecoder(enc).decode(bytes); } catch { /* unsupported */ } }
  return new TextDecoder().decode(bytes);
};

function pickFilesWeb(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    });
    // Cancel cannot be detected reliably; a focus return without a change resolves empty.
    window.addEventListener("focus", () => setTimeout(() => { if (input.isConnected) { input.remove(); resolve([]); } }, 800), { once: true });
    input.click();
  });
}

function downloadWeb(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const accept = (filters) => (filters || []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");

// → {name, path?, text} or null
export async function openTextFile({ title = "Open", filters = [PROJECT_FILTER] } = {}) {
  const f = await openFile({ title, filters });
  return f ? { name: f.name, path: f.path, text: f.text } : null;
}

// Any file; `bytes` always, `text` decoded too (UTF-8, else EUC-KR).
// → {name, path?, bytes, text} or null
export async function openFile({ title = "Open", filters } = {}) {
  if (desktop) {
    const r = await desktop.openFile({ title, filters, binary: true });
    if (!r || r.canceled) return null;
    const bytes = base64ToBytes(r.content);
    return { name: r.filePath.split(/[\\/]/).pop(), path: r.filePath, bytes, get text() { return decodeText(bytes); } };
  }
  const [file] = await pickFilesWeb(accept(filters));
  if (!file) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, bytes, get text() { return decodeText(bytes); } };
}

// A File from drag & drop → the same shape as openFile().
export async function fromDroppedFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = desktop && desktop.pathForFile ? desktop.pathForFile(file) : "";
  return { name: file.name, path: path || undefined, bytes, get text() { return decodeText(bytes); } };
}

export async function readPath(path) {
  if (!desktop) return null;
  const r = await desktop.readPath(path, { binary: true });
  if (!r || !r.ok) throw new Error(r ? r.error : "read failed");
  const bytes = base64ToBytes(r.content);
  return { name: path.split(/[\\/]/).pop(), path, bytes, get text() { return decodeText(bytes); } };
}

// Save text with a dialog (or straight to `path` when given on desktop).
// → {name, path?} or null when cancelled
export async function saveTextFile({ name, text, path, title = "Save", filters = [PROJECT_FILTER] }) {
  if (desktop) {
    if (path) {
      const r = await desktop.writeFile(path, text);
      if (!r.ok) throw new Error(r.error);
      return { name: path.split(/[\\/]/).pop(), path };
    }
    const r = await desktop.saveFile({ title, defaultPath: name, filters, content: text });
    if (!r || r.canceled) return null;
    return { name: r.filePath.split(/[\\/]/).pop(), path: r.filePath };
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: filters.map((f) => ({ description: f.name, accept: { "application/octet-stream": f.extensions.map((e) => `.${e}`) } })) });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return { name: handle.name };
    } catch (e) {
      if (e && e.name === "AbortError") return null;
    }
  }
  downloadWeb(name, text, "text/plain;charset=utf-8");
  return { name };
}

export async function saveBinaryFile({ name, bytes, title = "Export", filters }) {
  if (desktop) {
    const r = await desktop.saveFile({ title, defaultPath: name, filters, contentBase64: bytesToBase64(bytes) });
    if (!r || r.canceled) return null;
    return { name: r.filePath.split(/[\\/]/).pop(), path: r.filePath };
  }
  downloadWeb(name, new Blob([bytes]), "application/octet-stream");
  return { name };
}

export async function saveDataUrl({ name, dataUrl, filters }) {
  return saveBinaryFile({ name, bytes: base64ToBytes(dataUrl.split(",")[1] || ""), filters });
}

export async function printPage() {
  if (desktop && desktop.print) return desktop.print();
  window.print();
}

export async function printToPDF(opts) {
  if (desktop && desktop.printToPDF) return desktop.printToPDF(opts);
  window.print();
  return null;
}

export async function loadSettings() {
  if (desktop) {
    try { return (await desktop.loadSettings()) || null; } catch { return null; }
  }
  try { return JSON.parse(localStorage.getItem("myarch.settings") || "null"); } catch { return null; }
}

export async function saveSettings(settings) {
  if (desktop) {
    try { await desktop.saveSettings(settings); } catch { /* settings are a convenience */ }
    return;
  }
  try { localStorage.setItem("myarch.settings", JSON.stringify(settings)); } catch { /* private mode */ }
}

export function storeAutosave(text) {
  try { localStorage.setItem("myarch.autosave", text); localStorage.setItem("myarch.autosave.at", String(Date.now())); } catch { /* quota */ }
}

export function readAutosave() {
  try {
    const text = localStorage.getItem("myarch.autosave");
    const at = +localStorage.getItem("myarch.autosave.at") || 0;
    return text ? { text, at } : null;
  } catch { return null; }
}

export function clearAutosave() {
  try { localStorage.removeItem("myarch.autosave"); localStorage.removeItem("myarch.autosave.at"); } catch { /* ignore */ }
}

export function openExternal(url) {
  if (desktop && desktop.openExternal) desktop.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

export function onOpenPath(fn) {
  if (desktop && desktop.onOpenPath) desktop.onOpenPath(fn);
}

export function onRequestClose(fn) {
  if (desktop && desktop.onRequestClose) desktop.onRequestClose(fn);
}

export function confirmClose(allow) {
  if (desktop && desktop.confirmClose) desktop.confirmClose(allow);
}

export function setTitleBarTheme(colors) {
  if (desktop && desktop.setTitleBar) desktop.setTitleBar(colors);
}

export function setWindowTitle(title) {
  document.title = title;
}

export function setMinSize(w, h) {
  if (desktop && desktop.setMinSize) desktop.setMinSize(w, h);
}
