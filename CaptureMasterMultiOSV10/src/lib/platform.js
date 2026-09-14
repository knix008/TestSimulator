// Platform adapter.
//
// The UI talks to this object only. In Electron every call goes through the
// preload bridge; in a plain browser (`npm run dev` opened in a tab) the same
// calls fall back to web APIs — in-page dialogs, getDisplayMedia, localStorage,
// downloads — so the interface can be developed and tested without Electron.

import { dialogBus } from './dialogBus.js';

const api = typeof window !== 'undefined' ? window.electronAPI : null;
export const isElectron = !!(api && api.isElectron);

let progressListeners = [];
if (isElectron) api.onProgress((p) => { for (const cb of progressListeners) cb(p); });

export function onProgress(cb) {
  progressListeners.push(cb);
  return () => { progressListeners = progressListeners.filter((x) => x !== cb); };
}

/** Emits a progress tick locally (used by web fallbacks and in-renderer work). */
export function emitProgress(p) { for (const cb of progressListeners) cb(p); }

let taskSeq = 0;
export function newTaskId() { taskSeq += 1; return `t${Date.now().toString(36)}-${taskSeq}`; }

// ── Web helpers ───────────────────────────────────────────
const WEB_SETTINGS_KEY = 'capturemaster.settings';

function webPickFile(accept, multi) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = !!multi;
    input.onchange = () => resolve(multi ? Array.from(input.files) : input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function webDownload(bytes, name, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

// ── The adapter ───────────────────────────────────────────
export const platform = {
  isElectron,

  async getInfo() {
    if (isElectron) return api.getInfo();
    return { isElectron: false, version: '', platform: navigator.platform || 'web', arch: '', electron: '', chrome: navigator.userAgent, node: '', userData: 'localStorage', home: '', pictures: '', videos: '', packaged: false };
  },
  takePendingOpen: () => (isElectron ? api.takePendingOpen() : Promise.resolve(null)),
  onOpenPath: (cb) => (isElectron ? api.onOpenPath(cb) : () => {}),
  onCloseRequested: (cb) => (isElectron ? api.onCloseRequested(cb) : () => {}),
  onMainError: (cb) => (isElectron ? api.onMainError(cb) : () => {}),
  takeInstallCheck: () => (isElectron ? api.takeInstallCheck() : Promise.resolve(false)),
  resolveInstallCheck: (wipe) => (isElectron ? api.resolveInstallCheck(wipe) : Promise.resolve(true)),
  quit: () => (isElectron ? api.quit() : Promise.resolve(window.close())),

  async loadSettings() {
    if (isElectron) return api.loadSettings();
    try { return JSON.parse(localStorage.getItem(WEB_SETTINGS_KEY) || 'null'); } catch { return null; }
  },
  async saveSettings(data) {
    if (isElectron) return api.saveSettings(data);
    localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(data));
    return true;
  },

  // ── Files ──
  fs: {
    exists: (p) => (isElectron ? api.fs.exists(p) : Promise.resolve(false)),
    stat: (p) => (isElectron ? api.fs.stat(p) : Promise.resolve(null)),
    readBinary: (filePath, id) => api.fs.readBinary({ filePath, id }),
    readText: (filePath, id) => api.fs.readText({ filePath, id }),
    writeBinary: (filePath, data, id) => api.fs.writeBinary({ filePath, data, id }),
    writeText: (filePath, content, id) => api.fs.writeText({ filePath, content, id }),
    copyFile: (from, to, id) => api.fs.copyFile({ from, to, id }),
    tempPath: (ext) => api.fs.tempPath(ext),
    remove: (p) => (isElectron ? api.fs.remove(p) : Promise.resolve(false)),
  },

  /** Opens a file. Electron: a path (or paths). Web: File object(s). */
  async openFileDialog({ defaultDir, filters, title, multi, accept } = {}) {
    if (isElectron) return api.dialog.openFile({ defaultDir, filters, title, multi });
    return webPickFile(accept, multi);
  },
  pickDirectory: (opts) => (isElectron ? api.dialog.pickDirectory(opts || {}) : Promise.resolve(null)),
  pickSavePath: (opts) => (isElectron ? api.dialog.pickSavePath(opts || {}) : Promise.resolve(null)),
  /** Web-only: hands the bytes to the browser as a download. */
  webDownload,

  download: (url, id) => {
    if (isElectron) return api.download({ url, id });
    return fetch(url).then(async (res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' — ' + url);
      const buf = new Uint8Array(await res.arrayBuffer());
      const name = url.split('/').pop().split('?')[0] || 'download';
      return { data: buf, name, size: buf.length, url, contentType: res.headers.get('content-type') || '' };
    });
  },

  printImages: (payload) => {
    if (isElectron) return api.printImages(payload);
    return webPrint(payload);
  },

  clipboard: {
    writeText: (t) => (isElectron ? api.clipboard.writeText(t) : navigator.clipboard.writeText(t)),
    readText: () => (isElectron ? api.clipboard.readText() : navigator.clipboard.readText()),
    writeImage: async (dataUrl) => {
      if (isElectron) return api.clipboard.writeImage(dataUrl);
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    },
    readImage: async () => {
      if (isElectron) return api.clipboard.readImage();
      if (!navigator.clipboard.read) return null;
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
        return { dataUrl, width: 0, height: 0 };
      }
      return null;
    },
  },

  shell: {
    openExternal: (url) => (isElectron ? api.shell.openExternal(url) : Promise.resolve(window.open(url, '_blank', 'noopener'))),
    showItem: (p) => (isElectron ? api.shell.showItem(p) : Promise.resolve(false)),
    openPath: (p) => (isElectron ? api.shell.openPath(p) : Promise.resolve(false)),
  },

  capture: {
    available: isElectron || !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    listSources: (opts) => (isElectron ? api.capture.listSources(opts) : Promise.resolve([])),
    grabScreen: (sourceId) => api.capture.grabScreen(sourceId),
    displays: () => (isElectron ? api.capture.displays() : Promise.resolve([{ id: 'web', bounds: { x: 0, y: 0, width: screen.width, height: screen.height }, scaleFactor: devicePixelRatio, isPrimary: true }])),
    cursorDisplay: () => (isElectron ? api.capture.cursorDisplay() : Promise.resolve('web')),
    hideApp: () => (isElectron ? api.capture.hideApp() : Promise.resolve(true)),
    showApp: () => (isElectron ? api.capture.showApp() : Promise.resolve(true)),
    minimizeApp: () => (isElectron ? api.capture.minimizeApp() : Promise.resolve(true)),
    restoreApp: () => (isElectron ? api.capture.restoreApp() : Promise.resolve(true)),
  },

  rec: isElectron ? api.rec : null,

  /** Path → URL that <video>/<img> can load inside the app. */
  mediaUrl(p) {
    if (!isElectron) return p;
    return 'cm-media://local/' + encodeURIComponent(String(p).replace(/\\/g, '/'));
  },

  // ── Dialog windows (in-page modals on the web) ──
  dialogs: {
    windowed: isElectron,
    open: (name, payload) => (isElectron ? api.dialogs.open(name, payload) : dialogBus.open(name, payload)),
    getPayload: () => (isElectron ? api.dialogs.getPayload() : Promise.resolve(null)),
    update: (name, payload) => (isElectron ? api.dialogs.update(name, payload) : dialogBus.update(name, payload)),
    submit: (name, data, keepOpen) => (isElectron ? api.dialogs.submit(name, data, keepOpen) : dialogBus.submit(name, data, keepOpen)),
    close: (name) => (isElectron ? api.dialogs.close(name) : dialogBus.close(name)),
    closeSelf: () => (isElectron ? api.dialogs.closeSelf() : Promise.resolve(true)),
    ready: () => (isElectron ? api.dialogs.ready() : Promise.resolve(true)),
    isOpen: (name) => (isElectron ? api.dialogs.isOpen(name) : Promise.resolve(dialogBus.isOpen(name))),
    broadcastAppearance: (a) => (isElectron ? api.dialogs.broadcastAppearance(a) : Promise.resolve(true)),
    setSize: (w, h) => (isElectron ? api.dialogs.setSize(w, h) : Promise.resolve(true)),
    onResult: (cb) => (isElectron ? api.dialogs.onResult(cb) : dialogBus.onResult(cb)),
    onClosed: (cb) => (isElectron ? api.dialogs.onClosed(cb) : dialogBus.onClosed(cb)),
    onPayload: (cb) => (isElectron ? api.dialogs.onPayload(cb) : () => {}),
    onAppearance: (cb) => (isElectron ? api.dialogs.onAppearance(cb) : () => {}),
  },

  windowControls: {
    available: isElectron,
    minimize: () => api.win.minimize(),
    toggleMaximize: () => api.win.toggleMaximize(),
    close: () => api.win.close(),
    isMaximized: () => api.win.isMaximized(),
    onMaximizedChange: (cb) => api.win.onMaximizeChange(cb),
    setTitle: (t) => { document.title = t; return isElectron ? api.win.setTitle(t) : Promise.resolve(true); },
    setOpacity: (v) => (isElectron ? api.win.setOpacity(v) : Promise.resolve(false)),
    setMinWidth: (w) => (isElectron ? api.win.setMinWidth(w) : Promise.resolve(false)),
    setMinHeight: (h) => (isElectron ? api.win.setMinHeight(h) : Promise.resolve(false)),
    getSize: () => (isElectron ? api.win.getSize() : Promise.resolve(null)),
    setSize: (p) => (isElectron ? api.win.setSize(p) : Promise.resolve(false)),
  },
};

// Web printing: an iframe with the pages, then the browser's print dialog.
function webPrint({ images, title, landscape }) {
  return new Promise((resolve) => {
    const urls = images.map((bytes) => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><title>${String(title || 'Print').replace(/[<&]/g, '')}</title><style>
      @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; } body { margin: 0; }
      .sheet { page-break-after: always; display: flex; align-items: center; justify-content: center; height: 98vh; }
      .sheet img { max-width: 100%; max-height: 100%; object-fit: contain; }
    </style></head><body>${urls.map((u) => `<div class="sheet"><img src="${u}"></div>`).join('')}</body></html>`);
    doc.close();
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => { frame.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); resolve({ printed: true, pages: images.length }); }, 1000);
    }, 400);
  });
}
