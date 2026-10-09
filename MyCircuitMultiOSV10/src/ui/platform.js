// One file/print/settings API for both the desktop build (window.mycircuit,
// exposed by electron/preload.cjs) and the plain browser build.

const desktop = typeof window !== "undefined" ? window.mycircuit : null;

export const isDesktop = !!desktop;
export const platformName = desktop ? desktop.platform : (navigator.userAgentData?.platform || navigator.platform || "web");

export const PROJECT_FILTER = { name: "MyCircuit project", extensions: ["mycircuit"] };

function bytesToBase64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

function pickFileWeb(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return resolve(null);
      resolve(file);
    });
    // Cancel cannot be detected reliably; a focus return without a change resolves null.
    window.addEventListener("focus", () => setTimeout(() => { if (input.isConnected) { input.remove(); resolve(null); } }, 800), { once: true });
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

// → {name, path?, text} or null
export async function openTextFile({ title = "Open", filters = [PROJECT_FILTER] } = {}) {
  if (desktop) {
    const r = await desktop.openFile({ title, filters });
    if (!r || r.canceled) return null;
    return { name: r.filePath.split(/[\\/]/).pop(), path: r.filePath, text: r.encoding === "base64" ? atob(r.content) : r.content };
  }
  const accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
  const file = await pickFileWeb(accept);
  if (!file) return null;
  return { name: file.name, text: await file.text() };
}

// Several files at once → [{name, path?, text}] (empty when cancelled).
export async function openTextFiles({ title = "Open", filters } = {}) {
  const decode = (r) => (r.encoding === "base64" ? new TextDecoder().decode(Uint8Array.from(atob(r.content), (c) => c.charCodeAt(0))) : r.content);
  if (desktop) {
    const r = await desktop.openFile({ title, filters, multi: true });
    if (!r || r.canceled) return [];
    const list = r.files || [{ filePath: r.filePath, content: r.content, encoding: r.encoding }];
    return list.map((f) => ({ name: f.filePath.split(/[\\/]/).pop(), path: f.filePath, text: decode(f) }));
  }
  const accept = (filters || []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
  const files = await new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = "file";
    el.multiple = true;
    if (accept) el.accept = accept;
    el.style.display = "none";
    document.body.appendChild(el);
    el.addEventListener("change", () => { const fl = [...(el.files || [])]; el.remove(); resolve(fl); });
    window.addEventListener("focus", () => setTimeout(() => { if (el.isConnected) { el.remove(); resolve([]); } }, 800), { once: true });
    el.click();
  });
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
}

export async function readPath(path) {
  if (!desktop) return null;
  const r = await desktop.readPath(path);
  if (!r || !r.ok) throw new Error(r ? r.error : "read failed");
  return { name: path.split(/[\\/]/).pop(), path, text: r.content };
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
  const b64 = dataUrl.split(",")[1] || "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return saveBinaryFile({ name, bytes, filters });
}

export async function printPage() {
  if (desktop && desktop.print) return desktop.print();
  window.print();
}

export async function loadSettings() {
  if (desktop) {
    try { return (await desktop.loadSettings()) || null; } catch { return null; }
  }
  try { return JSON.parse(localStorage.getItem("mycircuit.settings") || "null"); } catch { return null; }
}

export async function saveSettings(settings) {
  if (desktop) {
    try { await desktop.saveSettings(settings); } catch { /* settings are a convenience */ }
    return;
  }
  try { localStorage.setItem("mycircuit.settings", JSON.stringify(settings)); } catch { /* private mode */ }
}

export function storeAutosave(text) {
  try { localStorage.setItem("mycircuit.autosave", text); localStorage.setItem("mycircuit.autosave.at", String(Date.now())); } catch { /* quota */ }
}

export function readAutosave() {
  try {
    const text = localStorage.getItem("mycircuit.autosave");
    const at = +localStorage.getItem("mycircuit.autosave.at") || 0;
    return text ? { text, at } : null;
  } catch { return null; }
}

export function clearAutosave() {
  try { localStorage.removeItem("mycircuit.autosave"); localStorage.removeItem("mycircuit.autosave.at"); } catch { /* ignore */ }
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
