// Thin abstraction over the two runtimes:
//   • Electron — native dialogs / filesystem via window.electronAPI (preload)
//   • Web      — <input type=file webkitdirectory> + Blob downloads
export const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
export const isElectron = !!(api && api.isElectron);

// Save text to disk. Electron opens a native Save dialog; the web build
// triggers a browser download. Returns the saved path (Electron) or the
// suggested filename (Web), or null if cancelled.
export async function saveText({ defaultName, content, filters }) {
  if (isElectron) {
    return api.saveText({ defaultName, content, filters });
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName || 'merged.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName || 'merged.md';
}

// Write over a file already chosen in this session — Save, not Save as, so no
// dialog. Only Electron can do this; a browser cannot write to a path it was
// given earlier, so the web build says so and the caller falls back to saveText.
export const canWriteInPlace = isElectron;

export async function writeTextTo(filePath, content) {
  if (!isElectron || !filePath) return null;
  return api.writeText({ filePath, content });
}

// Save binary data (a Blob) — Word/PDF export. Electron routes through a native
// Save dialog; the web build downloads the blob. Returns saved path / filename.
export async function saveBlob({ defaultName, blob, filters }) {
  if (isElectron) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return api.saveBinary({ defaultName, base64: bytesToBase64(bytes), filters });
  }
  downloadBlob(blob, defaultName);
  return defaultName;
}

// Export a standalone HTML string to PDF.
//   • Electron — native printToPDF via the main process (silent, file saved).
//   • Web      — opens a print window; the user picks “Save as PDF”.
// Print the document. Electron paginates it offscreen and opens the system
// print dialog; the web build hands the same HTML to the browser's own dialog.
// Returns { success, reason } — `success: false` also covers "user cancelled".
export async function printDocument({ html, pdfOptions }) {
  if (isElectron && api.printDoc) return api.printDoc({ html, pdfOptions });
  printHtml(html);
  return { success: true, reason: '' };
}

export async function exportPdf({ html, defaultName, pdfOptions }) {
  if (isElectron) {
    return api.exportPdf({ html, defaultName, pdfOptions });
  }
  printHtml(html);
  return defaultName;
}

// Paginate a standalone HTML document (Electron only) and return a map of each
// heading anchor to its page number ({ 'h-0': 3, … }), used to bake real TOC
// page numbers into Word / HTML exports. Returns null when unavailable (web).
export async function computeTocPageMap(html) {
  if (isElectron && api.paginate) {
    try {
      const map = await api.paginate(html);
      return map && Object.keys(map).length ? map : null;
    } catch { return null; }
  }
  return null;
}

function printHtml(html) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Give the browser a tick to lay out before invoking the print dialog.
  win.onload = () => { win.focus(); win.print(); };
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 400);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── Settings persistence ──────────────────────────────────
// localStorage is the live/cross-window store; on Electron we also mirror to a
// userData JSON file so settings survive restarts even for file:// origins.
const LS = { export: 'mmm-export', theme: 'mmm-theme', lang: 'mmm-lang' };

export function saveSettingsToDisk() {
  if (!isElectron || !api.saveSettings) return;
  try {
    api.saveSettings({
      export: JSON.parse(localStorage.getItem(LS.export) || '{}'),
      theme: localStorage.getItem(LS.theme) || '',
      lang: localStorage.getItem(LS.lang) || '',
    });
  } catch { /* ignore */ }
}

// Loads persisted settings from disk (Electron) into localStorage before the
// app renders, so restarts restore the last-used configuration.
export async function seedSettingsFromDisk() {
  if (!isElectron || !api.loadSettings) return;
  try {
    const s = await api.loadSettings();
    if (!s) return;
    if (s.export && typeof s.export === 'object') localStorage.setItem(LS.export, JSON.stringify(s.export));
    if (s.theme) localStorage.setItem(LS.theme, s.theme);
    if (s.lang) localStorage.setItem(LS.lang, s.lang);
  } catch { /* ignore */ }
}

// Reads a browser File object as UTF-8 text.
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

// Reads a browser File object as a Base64 data URL (for inlining images).
export function readFileDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
