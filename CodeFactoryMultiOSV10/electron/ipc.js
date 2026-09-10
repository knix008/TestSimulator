// Main-process IPC handlers: filesystem access, dialogs, settings, PDF export
// and window controls.
//
// Kept separate from main.js so the smoke test can register exactly the same
// handlers against its own window — otherwise the test would exercise stubs and
// prove nothing about the real wiring.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { execFile } = require('child_process');

const DEFAULT_SKIP_DIRS = new Set([
  'bin', 'obj', '.git', '.vs', '.idea', 'node_modules', 'packages',
  '__pycache__', '.venv', 'venv', 'dist', 'build', 'target', 'release',
  '.next', '.nuxt', 'vendor', 'Pods', '.gradle', '.mvn', 'coverage',
]);

// Files above this size are listed but never read: a single generated blob can
// otherwise dominate every metric and blow up memory.
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The narrowest the application window may get.
 *
 * Set from what the toolbar actually needs with every label shown — the
 * alternative, dropping labels as the window narrows, leaves buttons the user
 * cannot identify. Measured at ~1041px; the rest is headroom for the longer
 * English labels and for a different UI font.
 */
const MIN_WINDOW_WIDTH = 1160;
const MIN_WINDOW_HEIGHT = 680;

/* ---------------------------------------------------------------- settings */
// Mirrors the Windows build's %LocalAppData%\CodeAnalyzer\settings.json.

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function loadSettings() {
  try {
    return JSON.parse(await fsp.readFile(settingsPath(), 'utf-8'));
  } catch {
    return null;
  }
}

async function saveSettings(data) {
  const file = settingsPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
  return file;
}

/* ----------------------------------------------------------- file scanning */

/** Recursively lists directories under `root`, with per-directory source counts. */
async function scanDirectories(root, extensions) {
  const exts = new Set((extensions || []).map((e) => e.toLowerCase()));
  const out = [];

  async function walk(dir, depth) {
    if (depth > 24) return { files: 0, bytes: 0 };
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return { files: 0, bytes: 0 };
    }

    let files = 0;
    let bytes = 0;
    const childDirs = [];
    // Per-extension tally, so the caller can work out which programming
    // languages the tree actually contains without listing every path.
    const extensionCounts = Object.create(null);

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.isSymbolicLink()) continue;
        childDirs.push({ name: entry.name, full });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.size === 0 || exts.has(ext)) {
          files++;
          extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
          try {
            bytes += (await fsp.stat(full)).size;
          } catch { /* unreadable — count the file, skip its size */ }
        }
      }
    }

    let totalFiles = files;
    let totalBytes = bytes;
    for (const child of childDirs) {
      const sub = await walk(child.full, depth + 1);
      totalFiles += sub.files;
      totalBytes += sub.bytes;
    }

    out.push({
      path: dir,
      name: path.basename(dir) || dir,
      parent: depth === 0 ? null : path.dirname(dir),
      depth,
      ownFileCount: files,
      fileCount: totalFiles,
      byteCount: totalBytes,
      extensionCounts,
      skipByDefault: depth > 0 && DEFAULT_SKIP_DIRS.has(path.basename(dir)),
    });

    return { files: totalFiles, bytes: totalBytes };
  }

  await walk(root, 0);
  // Parents before children so the renderer can build the tree in one pass.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Lists source files directly inside each of `dirs` (non-recursive per dir). */
async function listSourceFiles(dirs, extensions) {
  const exts = new Set((extensions || []).map((e) => e.toLowerCase()));
  const seen = new Set();
  const out = [];

  for (const dir of dirs) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.size > 0 && !exts.has(ext)) continue;
      const full = path.join(dir, entry.name);
      if (seen.has(full)) continue;
      seen.add(full);
      let size = 0;
      try {
        size = (await fsp.stat(full)).size;
      } catch { /* keep 0 */ }
      out.push({ path: full, size });
    }
  }
  return out;
}

async function readFiles(paths) {
  const out = [];
  for (const p of paths) {
    try {
      const stat = await fsp.stat(p);
      if (stat.size > MAX_FILE_BYTES) {
        out.push({ path: p, text: null, size: stat.size, skipped: 'too-large' });
        continue;
      }
      const buf = await fsp.readFile(p);
      // Binary guard: a NUL byte in the first 4 KiB means this is not source text.
      if (buf.subarray(0, 4096).includes(0)) {
        out.push({ path: p, text: null, size: stat.size, skipped: 'binary' });
        continue;
      }
      out.push({ path: p, text: buf.toString('utf-8'), size: stat.size });
    } catch (err) {
      out.push({ path: p, text: null, size: 0, skipped: err.code || 'error' });
    }
  }
  return out;
}

// Git churn ("hotspot") data used by the metrics view. Absent git is not an
// error — the metric is simply reported as unavailable.
function gitChurn(root, since) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', root, 'log', '--since=' + (since || '365 days ago'), '--numstat', '--format=%H'],
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const counts = Object.create(null);
        for (const line of stdout.split('\n')) {
          const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
          if (!m) continue;
          const added = m[1] === '-' ? 0 : Number(m[1]);
          const removed = m[2] === '-' ? 0 : Number(m[2]);
          // Renames arrive as `old => new` (sometimes with braces) — keep the new path.
          const rel = m[3].includes('=>') ? m[3].replace(/.*=>\s*/, '').replace(/[{}]/g, '') : m[3];
          const abs = path.resolve(root, rel);
          counts[abs] = (counts[abs] || 0) + added + removed;
        }
        resolve(counts);
      },
    );
  });
}

/* ------------------------------------------------------------ dialog windows */

/**
 * Dialogs are real OS windows, not overlays inside the app.
 *
 * An in-page dialog cannot be moved outside the application window, which is
 * exactly what you want to do with a settings panel while you look at the view
 * behind it. Each of these loads the same bundle with `#dialog=<name>`, draws
 * only that dialog, and reports back to whichever window opened it.
 *
 * They are children of the opener (so they stay in front of it and close with
 * it) but never modal — a modal child could not be dragged aside.
 */
const dialogWindows = new Map();

/** Geometry per dialog kind: big enough to need no inner scrollbar. */
const DIALOG_SIZES = {
  settings: { width: 1180, height: 800, minWidth: 620, minHeight: 420, resizable: true },
  about: { width: 560, height: 560, minWidth: 420, minHeight: 380, resizable: false },
  report: { width: 640, height: 640, minWidth: 460, minHeight: 400, resizable: true },
  diagram: { width: 480, height: 300, minWidth: 380, minHeight: 240, resizable: false },
};

function dialogUrl(name) {
  if (process.env.ELECTRON_DEV === '1') return 'http://localhost:5183/#dialog=' + name;
  return { file: path.join(__dirname, '..', 'dist', 'index.html'), hash: 'dialog=' + name };
}

function openDialogWindow(name, payload, opener) {
  const existing = dialogWindows.get(name);
  if (existing && !existing.win.isDestroyed()) {
    existing.payload = payload;
    existing.win.webContents.send('dialog:payload', payload);
    existing.win.show();
    existing.win.focus();
    return true;
  }

  const size = DIALOG_SIZES[name] || { width: 640, height: 520, resizable: true };
  const parentBounds = opener && !opener.isDestroyed() ? opener.getBounds() : null;

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: size.minWidth || 320,
    minHeight: size.minHeight || 240,
    // Centred on the opener, but free to be dragged anywhere afterwards.
    x: parentBounds ? Math.round(parentBounds.x + (parentBounds.width - size.width) / 2) : undefined,
    y: parentBounds ? Math.round(parentBounds.y + (parentBounds.height - size.height) / 2) : undefined,
    parent: opener && !opener.isDestroyed() ? opener : undefined,
    modal: false,
    resizable: size.resizable !== false,
    minimizable: false,
    maximizable: size.resizable !== false,
    show: false,
    frame: false,
    backgroundColor: '#12161c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  dialogWindows.set(name, { win, payload, openerId: opener ? opener.id : null });

  const target = dialogUrl(name);
  if (typeof target === 'string') win.loadURL(target);
  else win.loadFile(target.file, { hash: target.hash });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => dialogWindows.delete(name));
  return true;
}

/** Closes every open dialog window. Used when the application window closes. */
function closeAllDialogWindows() {
  for (const entry of [...dialogWindows.values()]) {
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  dialogWindows.clear();
}

function registerDialogHandlers() {
  ipcMain.handle('dialog:openWindow', (event, { name, payload }) => {
    const opener = BrowserWindow.fromWebContents(event.sender);
    return openDialogWindow(name, payload, opener);
  });

  // A dialog window asks for the data it was opened with.
  ipcMain.handle('dialog:getPayload', (event) => {
    for (const entry of dialogWindows.values()) {
      if (!entry.win.isDestroyed() && entry.win.webContents.id === event.sender.id) return entry.payload;
    }
    return null;
  });

  // …and reports the user's decision back to the window that opened it.
  ipcMain.handle('dialog:submit', (event, { name, data }) => {
    const entry = dialogWindows.get(name);
    const opener = entry && entry.openerId !== null ? BrowserWindow.fromId(entry.openerId) : null;
    if (opener && !opener.isDestroyed()) opener.webContents.send('dialog:result', { name, data });
    return true;
  });

  ipcMain.handle('dialog:closeWindow', (_event, name) => {
    const entry = dialogWindows.get(name);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
    return true;
  });

  ipcMain.handle('dialog:closeSelf', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
    return true;
  });

  // A dialog window needs the same theme and language as its opener.
  ipcMain.handle('dialog:broadcastAppearance', (event, appearance) => {
    for (const entry of dialogWindows.values()) {
      if (!entry.win.isDestroyed()) entry.win.webContents.send('dialog:appearance', appearance);
    }
    return true;
  });
}

/* --------------------------------------------------------------- registration */

/**
 * Registers every handler the renderer can call.
 * @param {{focusedWindow?: () => BrowserWindow|null}} [options]
 */
function registerIpcHandlers(options = {}) {
  const focused = options.focusedWindow || (() => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]);

  ipcMain.handle('app:getInfo', () => ({
    isElectron: true,
    platform: process.platform,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    home: os.homedir(),
    userData: app.getPath('userData'),
    appVersion: app.getVersion(),
  }));

  ipcMain.handle('dialog:pickDirectory', async (_e, defaultPath) => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined,
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('fs:scanDirectories', (_e, { root, extensions }) => scanDirectories(root, extensions));
  ipcMain.handle('fs:listSourceFiles', (_e, { dirs, extensions }) => listSourceFiles(dirs, extensions));
  ipcMain.handle('fs:readFiles', (_e, paths) => readFiles(paths));
  ipcMain.handle('fs:gitChurn', (_e, { root, since }) => gitChurn(root, since));
  ipcMain.handle('fs:exists', (_e, p) => fs.existsSync(p));

  ipcMain.handle('fs:readText', async (_e, p) => {
    try {
      return await fsp.readFile(p, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('dialog:openFile', async (_e, filters) => {
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (res.canceled) return null;
    const file = res.filePaths[0];
    return { path: file, text: await fsp.readFile(file, 'utf-8') };
  });

  ipcMain.handle('dialog:saveText', async (_e, { defaultName, filters, text }) => {
    const res = await dialog.showSaveDialog({ defaultPath: defaultName, filters });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, text, 'utf-8');
    return res.filePath;
  });

  ipcMain.handle('dialog:saveBinary', async (_e, { defaultName, filters, data }) => {
    const res = await dialog.showSaveDialog({ defaultPath: defaultName, filters });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, Buffer.from(data));
    return res.filePath;
  });

  // PDF export: render the supplied HTML in an offscreen window and print it.
  ipcMain.handle('export:pdf', async (_e, { html, defaultName, landscape }) => {
    const res = await dialog.showSaveDialog({
      defaultPath: defaultName || 'report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;

    // Shown-but-offscreen (not `show:false`): a hidden window is throttled to
    // ~1 fps, which makes layout of a long report take tens of seconds.
    const printer = new BrowserWindow({
      show: true,
      x: -32000,
      y: -32000,
      width: 1000,
      height: 1400,
      opacity: 0,
      skipTaskbar: true,
      focusable: false,
      webPreferences: { sandbox: true, backgroundThrottling: false },
    });
    try {
      await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      await new Promise((r) => setTimeout(r, 300));
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        landscape: !!landscape,
        margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
      await fsp.writeFile(res.filePath, pdf);
      return res.filePath;
    } finally {
      printer.destroy();
    }
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_e, data) => saveSettings(data));

  ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  // ------------------------------------------------------- window controls --
  ipcMain.handle('win:minimize', () => {
    const win = focused();
    if (win) win.minimize();
  });

  ipcMain.handle('win:toggleMaximize', () => {
    const win = focused();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle('win:close', () => {
    const win = focused();
    if (win) win.close();
  });

  ipcMain.handle('win:isMaximized', () => {
    const win = focused();
    return win ? win.isMaximized() : false;
  });

  registerDialogHandlers();
}

module.exports = {
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  registerIpcHandlers,
  openDialogWindow,
  closeAllDialogWindows,
  scanDirectories,
  listSourceFiles,
  readFiles,
  gitChurn,
  loadSettings,
  saveSettings,
  DEFAULT_SKIP_DIRS,
  MAX_FILE_BYTES,
};
