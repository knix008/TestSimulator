// Saving, clipboard and settings. The desktop app goes through Rust commands (native save
// dialog, arboard clipboard, a settings file); the browser build downloads and uses
// the async clipboard API and localStorage.

const tauri = globalThis.__TAURI__;
const invoke = tauri?.core?.invoke;
const SETTINGS_KEY = "qrgenerator.settings";

export const isDesktop = Boolean(invoke);

export function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function download(name, bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Saves a file the page wrote (SVG, PDF, EPS). Resolves to the path/name, or null when cancelled. */
export async function saveFile(format, name, bytes) {
  if (invoke) return invoke("save_export", { kind: format.id, name, data: toBase64(bytes) });
  return download(name, bytes, format.mime);
}

/**
 * Encodes RGBA pixels with the Rust crate qrimage and saves the file: natively in the desktop
 * app (pixels go over binary IPC), as WebAssembly in the browser.
 */
export async function saveRaster(format, name, rgba, width, height, { quality = 92, background = 0xffffff } = {}) {
  if (invoke) {
    const headers = {
      "x-format": format.id,
      "x-width": String(width),
      "x-height": String(height),
      "x-quality": String(quality),
      "x-background": background.toString(16).padStart(6, "0"),
      "x-name": name,
    };
    return invoke("export_image", rgba, { headers });
  }
  const { wasmImageEncoder } = await import("./exporters.js");
  const encode = await wasmImageEncoder();
  return download(name, encode(rgba, width, height, format, quality, background), format.mime);
}

/** Copies a canvas as an image. */
export async function copyImage(canvas) {
  if (invoke) {
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await invoke("copy_image", { width: canvas.width, height: canvas.height, rgba: toBase64(new Uint8Array(data.buffer)) });
    return;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyText(text) {
  if (invoke) await invoke("copy_text", { text });
  else await navigator.clipboard.writeText(text);
}

export async function loadSettings() {
  try {
    const raw = invoke ? await invoke("load_settings") : localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveSettings(settings) {
  const raw = JSON.stringify(settings);
  try {
    if (invoke) await invoke("save_settings", { json: raw });
    else localStorage.setItem(SETTINGS_KEY, raw);
  } catch {
    // Settings are a convenience; failing to keep them must not break the app.
  }
}

/** Tells the desktop shell the first render is done, so the window shows without a white flash. */
export function ready() {
  if (invoke) invoke("app_ready").catch(() => {});
}
