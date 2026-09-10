// Platform adapter.
//
// One interface, two implementations: Electron talks to the main process over
// IPC and reads the real filesystem; the web build uses the File System Access
// API (or a `webkitdirectory` upload as fallback) and keeps everything in the
// browser. Nothing above this file knows which one is live.

import { extensionsFor, languageForPath } from '../core/languages.js';

const SKIP_DIRS = new Set([
  'bin', 'obj', '.git', '.vs', '.idea', 'node_modules', 'packages',
  '__pycache__', '.venv', 'venv', 'dist', 'build', 'target', 'release',
  '.next', '.nuxt', 'vendor', 'Pods', '.gradle', '.mvn', 'coverage',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const EXTRA_EXTENSIONS = ['.sql', '.prisma'];

export const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

// ------------------------------------------------------------------ shared --

function scanExtensions(languageIds) {
  return [...extensionsFor(languageIds), ...EXTRA_EXTENSIONS];
}

/** Builds a nested tree from the flat directory list both adapters produce. */
export function buildDirectoryTree(entries) {
  const byPath = new Map();
  for (const entry of entries) byPath.set(entry.path, { ...entry, children: [] });

  const roots = [];
  for (const node of byPath.values()) {
    const parent = node.parent ? byPath.get(node.parent) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortTree = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);
  return roots;
}

// ---------------------------------------------------------------- electron --

const electronAdapter = {
  kind: 'electron',
  canPickDirectory: true,
  canUploadFolder: false,

  // Dialogs open as real OS windows, so they can be dragged clear of the app.
  dialogWindows: {
    available: true,
    open: (name, payload) => window.electronAPI.dialogs.open(name, payload),
    getPayload: () => window.electronAPI.dialogs.getPayload(),
    submit: (name, data) => window.electronAPI.dialogs.submit(name, data),
    close: (name) => window.electronAPI.dialogs.close(name),
    closeSelf: () => window.electronAPI.dialogs.closeSelf(),
    broadcastAppearance: (appearance) => window.electronAPI.dialogs.broadcastAppearance(appearance),
    onResult: (cb) => window.electronAPI.dialogs.onResult(cb),
    onPayload: (cb) => window.electronAPI.dialogs.onPayload(cb),
    onAppearance: (cb) => window.electronAPI.dialogs.onAppearance(cb),
  },

  // The app owns its frame here, so it must also draw the window buttons.
  windowControls: {
    available: true,
    minimize: () => window.electronAPI.win.minimize(),
    toggleMaximize: () => window.electronAPI.win.toggleMaximize(),
    close: () => window.electronAPI.win.close(),
    isMaximized: () => window.electronAPI.win.isMaximized(),
    onMaximizedChange: (cb) => window.electronAPI.win.onMaximizedChange(cb),
  },

  async getInfo() {
    return window.electronAPI.getInfo();
  },

  async pickDirectory(defaultPath) {
    const path = await window.electronAPI.pickDirectory(defaultPath);
    return path ? { path, handle: null } : null;
  },

  async scanDirectories(root) {
    return window.electronAPI.scanDirectories({ root: root.path, extensions: scanExtensions([]) });
  },

  async listFiles(root, dirs, languageIds) {
    return window.electronAPI.listSourceFiles({ dirs, extensions: scanExtensions(languageIds) });
  },

  async readFiles(root, entries) {
    const read = await window.electronAPI.readFiles(entries.map((e) => e.path));
    return read.map((file) => ({
      ...file,
      relPath: root && file.path.startsWith(root.path) ? file.path.slice(root.path.length + 1) : file.path,
    }));
  },

  async gitChurn(root) {
    return window.electronAPI.gitChurn({ root: root.path });
  },

  async loadSettings() {
    return window.electronAPI.loadSettings();
  },

  async saveSettings(data) {
    return window.electronAPI.saveSettings(data);
  },

  async openTextFile(filters) {
    return window.electronAPI.openFile(filters);
  },

  async saveTextFile({ defaultName, filters, text }) {
    return window.electronAPI.saveText({ defaultName, filters, text });
  },

  async saveBinaryFile({ defaultName, filters, data }) {
    return window.electronAPI.saveBinary({ defaultName, filters, data: Array.from(new Uint8Array(data)) });
  },

  async exportPdf({ html, defaultName, landscape }) {
    return window.electronAPI.exportPdf({ html, defaultName, landscape });
  },

  async revealFile(path) {
    return window.electronAPI.showItem(path);
  },

  async openExternal(url) {
    return window.electronAPI.openExternal(url);
  },
};

// --------------------------------------------------------------------- web --

/**
 * Web adapter state: directory handles (File System Access) or an uploaded
 * FileList. Files never leave the browser.
 */
const webState = {
  rootHandle: null,
  /** relative path -> File (upload fallback) */
  uploaded: null,
};

const webAdapter = {
  kind: 'web',

  // A browser tab's chrome belongs to the browser; nothing to draw.
  windowControls: { available: false },

  // No OS windows to open from a tab — the dialogs stay in the page.
  dialogWindows: { available: false },

  get canPickDirectory() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  },
  canUploadFolder: true,

  async getInfo() {
    return {
      isElectron: false,
      platform: navigator.platform || 'web',
      arch: '',
      versions: { chrome: navigator.userAgent },
      home: '',
      userData: 'localStorage',
      appVersion: null,
    };
  },

  async pickDirectory() {
    if (!this.canPickDirectory) return null;
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch {
      return null; // user dismissed the picker
    }
    webState.rootHandle = handle;
    webState.uploaded = null;
    return { path: handle.name, handle };
  },

  /** Registers a `webkitdirectory` FileList as the analysis root. */
  useUploadedFiles(fileList) {
    const files = [...fileList];
    if (files.length === 0) return null;
    const first = files[0].webkitRelativePath || files[0].name;
    const rootName = first.split('/')[0] || 'upload';
    webState.uploaded = files;
    webState.rootHandle = null;
    return { path: rootName, handle: null, uploaded: true };
  },

  async scanDirectories(root) {
    const exts = new Set(scanExtensions([]));
    const dirs = new Map();

    const ensure = (path, depth) => {
      if (dirs.has(path)) return dirs.get(path);
      const segments = path.split('/');
      const entry = {
        path,
        name: segments[segments.length - 1] || path,
        parent: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
        depth,
        ownFileCount: 0,
        fileCount: 0,
        byteCount: 0,
        extensionCounts: Object.create(null),
        skipByDefault: depth > 0 && SKIP_DIRS.has(segments[segments.length - 1]),
      };
      dirs.set(path, entry);
      return entry;
    };

    if (webState.uploaded) {
      ensure(root.path, 0);
      for (const file of webState.uploaded) {
        const rel = file.webkitRelativePath || file.name;
        const segments = rel.split('/');
        const dirPath = segments.slice(0, -1).join('/') || root.path;
        // Register every ancestor so the tree is complete.
        for (let i = 1; i <= segments.length - 1; i++) ensure(segments.slice(0, i).join('/'), i - 1);
        const ext = '.' + (segments[segments.length - 1].split('.').pop() || '').toLowerCase();
        if (!exts.has(ext)) continue;
        const dir = ensure(dirPath, segments.length - 2);
        dir.ownFileCount++;
        dir.byteCount += file.size;
        dir.extensionCounts[ext] = (dir.extensionCounts[ext] || 0) + 1;
      }
    } else if (webState.rootHandle) {
      await walkHandle(webState.rootHandle, root.path, 0, exts, ensure);
    } else {
      return [];
    }

    // Roll own counts up into totals.
    const list = [...dirs.values()].sort((a, b) => b.path.length - a.path.length);
    for (const entry of list) {
      entry.fileCount = entry.fileCount || 0;
      entry.fileCount += entry.ownFileCount;
      const parent = entry.parent ? dirs.get(entry.parent) : null;
      if (parent) {
        parent.fileCount = (parent.fileCount || 0) + entry.fileCount;
        parent.byteCount += entry.byteCount;
      }
    }
    return [...dirs.values()].sort((a, b) => a.path.localeCompare(b.path));
  },

  async listFiles(root, dirs, languageIds) {
    const exts = new Set(scanExtensions(languageIds));
    const wanted = new Set(dirs);
    const out = [];

    if (webState.uploaded) {
      for (const file of webState.uploaded) {
        const rel = file.webkitRelativePath || file.name;
        const segments = rel.split('/');
        const dirPath = segments.slice(0, -1).join('/') || root.path;
        if (!wanted.has(dirPath)) continue;
        const ext = '.' + (segments[segments.length - 1].split('.').pop() || '').toLowerCase();
        if (!exts.has(ext)) continue;
        out.push({ path: rel, size: file.size, file });
      }
      return out;
    }

    if (!webState.rootHandle) return [];
    await collectHandleFiles(webState.rootHandle, root.path, wanted, exts, out);
    return out;
  },

  async readFiles(root, entries) {
    const out = [];
    for (const entry of entries) {
      try {
        if (entry.size > MAX_FILE_BYTES) {
          out.push({ path: entry.path, relPath: entry.path, text: null, size: entry.size, skipped: 'too-large' });
          continue;
        }
        const file = entry.file || (entry.handle ? await entry.handle.getFile() : null);
        if (!file) {
          out.push({ path: entry.path, relPath: entry.path, text: null, size: 0, skipped: 'unreadable' });
          continue;
        }
        const text = await file.text();
        // Same binary guard the Electron side applies.
        if (text.slice(0, 4096).includes('\u0000')) {
          out.push({ path: entry.path, relPath: entry.path, text: null, size: file.size, skipped: 'binary' });
          continue;
        }
        out.push({ path: entry.path, relPath: entry.path, text, size: file.size });
      } catch (err) {
        out.push({ path: entry.path, relPath: entry.path, text: null, size: 0, skipped: String(err && err.name) });
      }
    }
    return out;
  },

  async gitChurn() {
    return null; // no git in the browser
  },

  async loadSettings() {
    try {
      const raw = localStorage.getItem('codefactory.settings');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveSettings(data) {
    try {
      localStorage.setItem('codefactory.settings', JSON.stringify(data));
      return 'localStorage';
    } catch {
      return null;
    }
  },

  async openTextFile(filters) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      const exts = (filters || []).flatMap((f) => (f.extensions || []).map((e) => '.' + e));
      if (exts.length) input.accept = exts.join(',');
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve(null);
          return;
        }
        resolve({ path: file.name, text: await file.text() });
      };
      input.click();
    });
  },

  async saveTextFile({ defaultName, text, mime }) {
    downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), defaultName);
    return defaultName;
  },

  async saveBinaryFile({ defaultName, data, mime }) {
    downloadBlob(new Blob([data], { type: mime || 'application/octet-stream' }), defaultName);
    return defaultName;
  },

  /**
   * The browser cannot write a PDF directly, so the report is opened in a
   * print window — "Save as PDF" in the print dialog produces the same file.
   */
  async exportPdf({ html }) {
    const win = window.open('', '_blank');
    if (!win) return null;
    win.document.write(html);
    win.document.close();
    win.addEventListener('load', () => {
      win.focus();
      win.print();
    });
    return 'print-dialog';
  },

  async revealFile() {
    return null;
  },

  async openExternal(url) {
    window.open(url, '_blank', 'noopener');
  },
};

async function walkHandle(dirHandle, path, depth, exts, ensure) {
  if (depth > 20) return;
  const entry = ensure(path, depth);
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      await walkHandle(handle, path + '/' + name, depth + 1, exts, ensure);
    } else {
      const ext = '.' + (name.split('.').pop() || '').toLowerCase();
      if (!exts.has(ext)) continue;
      entry.ownFileCount++;
      entry.extensionCounts[ext] = (entry.extensionCounts[ext] || 0) + 1;
      try {
        entry.byteCount += (await handle.getFile()).size;
      } catch { /* size unavailable — the file still counts */ }
    }
  }
}

async function collectHandleFiles(dirHandle, path, wanted, exts, out) {
  const inScope = wanted.has(path);
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      await collectHandleFiles(handle, path + '/' + name, wanted, exts, out);
      continue;
    }
    if (!inScope) continue;
    const ext = '.' + (name.split('.').pop() || '').toLowerCase();
    if (!exts.has(ext)) continue;
    let size = 0;
    try {
      size = (await handle.getFile()).size;
    } catch { /* keep 0 */ }
    out.push({ path: path + '/' + name, size, handle });
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const platform = isElectron ? electronAdapter : webAdapter;
export { webAdapter, electronAdapter, languageForPath };
