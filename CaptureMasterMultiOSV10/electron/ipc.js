// Everything the renderer may ask the main process to do, except screen
// capture (capture.js) and dialog windows (dialogs.js).
const {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const state = require('./state');
const { registerDialogHandlers, setDialogsVisible, closeAllDialogWindows } = require('./dialogs');
const { registerCaptureHandlers } = require('./capture');

// Floor and ceiling for the measured toolbar minimum: never unusably narrow,
// never so wide the window cannot be resized at all.
const MIN_WINDOW_WIDTH = 960;
const MAX_MIN_WINDOW_WIDTH = 2200;
const MIN_WINDOW_HEIGHT = 600;
const MAX_MIN_WINDOW_HEIGHT = 1400;

function ownerWin(e) { return BrowserWindow.fromWebContents(e.sender) || state.mainWin; }

// The window starts at exactly its minimum size. The renderer measures that
// minimum a few times while it settles (fonts, language), so for the first
// moments the window follows the measurement both ways; afterwards it is only
// ever widened, never shrunk under the user.
function startingUp() { return Date.now() - state.windowCreatedAt < 4000; }

// ── App info ──────────────────────────────────────────────
function readBuildInfo() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'build-info.json'),
    path.join(__dirname, '..', 'src', 'build-info.json'),
    path.join(process.resourcesPath || '', 'build-info.json'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* ignore */ }
  }
  return {};
}

function appInfo() {
  return {
    isElectron: true,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    userData: app.getPath('userData'),
    home: os.homedir(),
    pictures: safePath('pictures'),
    videos: safePath('videos'),
    packaged: app.isPackaged,
    ...readBuildInfo(),
  };
}

function safePath(name) { try { return app.getPath(name); } catch { return os.homedir(); } }

// ── Settings (userData/settings.json) ─────────────────────
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')); } catch { return null; }
}

function saveSettings(data) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  const tmp = settingsFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, settingsFile());
  return true;
}

/** Deletes every file the app wrote for this user (settings, recents, window state). */
function wipeUserData() {
  const dir = app.getPath('userData');
  for (const name of ['settings.json', 'settings.json.tmp', 'window-state.json']) {
    try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* ignore */ }
  }
  return true;
}

// ── Streaming file I/O with progress ─────────────────────
function tick(sender, id, done, total) {
  if (id && sender && !sender.isDestroyed()) sender.send('task:progress', { id, done, total });
}

function readWithProgress(sender, id, filePath) {
  return new Promise((resolve, reject) => {
    let total = 0;
    try { total = fs.statSync(filePath).size; } catch { /* unknown */ }
    const chunks = [];
    let done = 0;
    let last = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      done += chunk.length;
      const now = Date.now();
      if (now - last > 60) { last = now; tick(sender, id, done, total); }
    });
    stream.on('error', reject);
    stream.on('end', () => { tick(sender, id, done, total || done); resolve(Buffer.concat(chunks)); });
  });
}

function writeWithProgress(sender, id, filePath, data) {
  const buf = Buffer.from(data);
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const stream = fs.createWriteStream(filePath);
    const CHUNK = 1 << 20;
    let off = 0;
    const write = () => {
      while (off < buf.length) {
        const end = Math.min(off + CHUNK, buf.length);
        const ok = stream.write(buf.subarray(off, end));
        off = end;
        tick(sender, id, off, buf.length);
        if (!ok) { stream.once('drain', write); return; }
      }
      stream.end();
    };
    stream.on('error', reject);
    stream.on('finish', () => resolve(filePath));
    write();
  });
}

// ── Recording sink ────────────────────────────────────────
// MediaRecorder hands the renderer a chunk every second; each one is appended
// straight to disk so an hour-long recording never has to fit in memory.
const recordings = new Map();   // id -> { stream, path, bytes }

function registerRecordingHandlers() {
  ipcMain.handle('rec:open', (_e, { filePath }) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const id = 'rec-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    recordings.set(id, { stream: fs.createWriteStream(filePath), path: filePath, bytes: 0 });
    return id;
  });
  ipcMain.handle('rec:append', (_e, { id, data }) => new Promise((resolve, reject) => {
    const rec = recordings.get(id);
    if (!rec) return reject(new Error('Recording sink is not open: ' + id));
    const buf = Buffer.from(data);
    rec.bytes += buf.length;
    if (rec.stream.write(buf)) resolve(rec.bytes);
    else rec.stream.once('drain', () => resolve(rec.bytes));
  }));
  ipcMain.handle('rec:close', (_e, { id }) => new Promise((resolve, reject) => {
    const rec = recordings.get(id);
    if (!rec) return resolve(null);
    recordings.delete(id);
    rec.stream.on('error', reject);
    rec.stream.end(() => resolve({ path: rec.path, bytes: rec.bytes }));
  }));
  ipcMain.handle('rec:discard', (_e, { id }) => {
    const rec = recordings.get(id);
    if (!rec) return false;
    recordings.delete(id);
    rec.stream.destroy();
    try { fs.rmSync(rec.path, { force: true }); } catch { /* ignore */ }
    return true;
  });
}

// ── Printing ──────────────────────────────────────────────
// The renderer sends the pages already rendered as JPEG; they are laid out one
// per sheet in an offscreen window and handed to the system print dialog.
async function printImages({ images, title, landscape, fitToPage }) {
  if (!Array.isArray(images) || !images.length) throw new Error('There are no pages to print.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capturemaster-print-'));
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp sweep */ } };

  const srcs = images.map((bytes, i) => {
    const file = path.join(dir, `p${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return pathToFileURL(file).toString();
  });
  const sheets = srcs.map((src) => `<div class="sheet"><img src="${src}" alt=""></div>`).join('\n');
  const fit = fitToPage !== false
    ? '.sheet img { max-width: 100%; max-height: 100%; object-fit: contain; }'
    : '.sheet img { max-width: none; }';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${String(title || 'Print').replace(/[<&]/g, '')}</title>
<style>
  @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet { page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; width: 100%; height: 98vh; overflow: hidden; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  ${fit}
</style></head><body>${sheets}</body></html>`;
  const htmlFile = path.join(dir, 'print.html');
  fs.writeFileSync(htmlFile, html, 'utf-8');

  // Shown but off-screen: a hidden window is throttled and may reach the
  // printer before the images have painted.
  const win = new BrowserWindow({
    show: true, x: -32000, y: -32000, width: 900, height: 1200,
    opacity: 0, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, backgroundThrottling: false },
  });
  try {
    await win.loadFile(htmlFile);
    await win.webContents.executeJavaScript(
      'Promise.all(Array.from(document.images).map(function (i) { return i.decode().catch(function () {}); })).then(function () { return true; })'
    );
    await new Promise((r) => setTimeout(r, 250));
    const result = await new Promise((resolve) => {
      win.webContents.print({ silent: false, printBackground: true, landscape: !!landscape },
        (success, failureReason) => resolve({ success, failureReason }));
    });
    if (!result.success && result.failureReason && !/cancel/i.test(result.failureReason)) {
      throw new Error(result.failureReason);
    }
    return { printed: result.success, reason: result.failureReason || '', pages: images.length };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    cleanup();
  }
}

// ── Registration ──────────────────────────────────────────
function registerIpcHandlers({ writeInstallStamp } = {}) {
  registerDialogHandlers();
  registerCaptureHandlers();
  registerRecordingHandlers();

  ipcMain.handle('app:getInfo', () => appInfo());
  ipcMain.handle('app:takePendingOpen', () => { const p = state.pendingOpenPath; state.pendingOpenPath = null; return p; });
  ipcMain.handle('app:takeInstallCheck', () => { const v = state.pendingInstallCheck; state.pendingInstallCheck = false; return v; });
  ipcMain.handle('app:resolveInstallCheck', (_e, { wipe }) => {
    if (wipe) wipeUserData();
    if (writeInstallStamp) writeInstallStamp();
    return true;
  });
  ipcMain.handle('app:wipeUserData', () => wipeUserData());

  // The renderer has finished (saving or discarding); now the window may go.
  ipcMain.handle('app:quit', () => {
    state.quitting = true;
    closeAllDialogWindows();
    const win = state.mainWin;
    if (win && !win.isDestroyed()) win.close(); else app.quit();
    return true;
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_e, data) => saveSettings(data));

  // ── Filesystem ──
  ipcMain.handle('fs:exists', (_e, p) => { try { return fs.existsSync(p); } catch { return false; } });
  ipcMain.handle('fs:stat', (_e, p) => {
    try {
      const st = fs.statSync(p);
      return { size: st.size, mtime: st.mtimeMs, dir: path.dirname(p), name: path.basename(p), isDir: st.isDirectory() };
    } catch { return null; }
  });
  ipcMain.handle('fs:readBinary', async (e, { filePath, id }) => {
    if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
    const buf = await readWithProgress(e.sender, id, filePath);
    return { data: new Uint8Array(buf), name: path.basename(filePath), dir: path.dirname(filePath), path: filePath, size: buf.length };
  });
  ipcMain.handle('fs:readText', async (e, { filePath, id }) => {
    if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
    const buf = await readWithProgress(e.sender, id, filePath);
    return buf.toString('utf-8');
  });
  ipcMain.handle('fs:writeBinary', async (e, { filePath, data, id }) => writeWithProgress(e.sender, id, filePath, data));
  ipcMain.handle('fs:writeText', async (e, { filePath, content, id }) => writeWithProgress(e.sender, id, filePath, Buffer.from(content, 'utf-8')));
  ipcMain.handle('fs:copyFile', async (e, { from, to, id }) => {
    const buf = await readWithProgress(e.sender, id, from);
    return writeWithProgress(e.sender, id, to, buf);
  });
  ipcMain.handle('fs:tempPath', (_e, ext) => path.join(os.tmpdir(), `capturemaster-${Date.now().toString(36)}${ext || ''}`));
  ipcMain.handle('fs:remove', (_e, p) => { try { fs.rmSync(p, { force: true }); return true; } catch { return false; } });

  // ── Native dialogs ──
  ipcMain.handle('dialog:openFile', async (e, { defaultDir, filters, title, multi } = {}) => {
    const props = ['openFile'];
    if (multi) props.push('multiSelections');
    const opts = { title: title || 'Open', properties: props, filters: filters || [{ name: 'All Files', extensions: ['*'] }] };
    if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
    const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
    if (canceled || !filePaths.length) return null;
    return multi ? filePaths : filePaths[0];
  });
  ipcMain.handle('dialog:pickDirectory', async (e, { defaultDir, title } = {}) => {
    const opts = { title: title || 'Select Folder', properties: ['openDirectory', 'createDirectory'] };
    if (defaultDir && fs.existsSync(defaultDir)) opts.defaultPath = defaultDir;
    const { canceled, filePaths } = await dialog.showOpenDialog(ownerWin(e), opts);
    if (canceled || !filePaths.length) return null;
    return filePaths[0];
  });
  ipcMain.handle('dialog:pickSavePath', async (e, { defaultName, defaultDir, filters, title } = {}) => {
    const name = defaultName || 'untitled';
    const { canceled, filePath } = await dialog.showSaveDialog(ownerWin(e), {
      title: title || 'Save',
      defaultPath: defaultDir && fs.existsSync(defaultDir) ? path.join(defaultDir, name) : name,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (canceled || !filePath) return null;
    return filePath;
  });

  // ── Download (open an image from a URL) ──
  ipcMain.handle('net:download', async (e, { url, id }) => {
    const res = await net.fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText + ' — ' + url);
    const total = Number(res.headers.get('content-length') || 0);
    const reader = res.body.getReader();
    const chunks = [];
    let done = 0;
    let last = 0;
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      chunks.push(Buffer.from(value));
      done += value.length;
      const now = Date.now();
      if (now - last > 60) { last = now; tick(e.sender, id, done, total); }
    }
    const buf = Buffer.concat(chunks);
    tick(e.sender, id, buf.length, buf.length);
    let name = 'download';
    try {
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      name = m ? decodeURIComponent(m[1]) : (path.basename(new URL(url).pathname) || name);
    } catch { /* keep default */ }
    return { data: new Uint8Array(buf), name, size: buf.length, url, contentType: res.headers.get('content-type') || '' };
  });

  ipcMain.handle('print:images', (_e, payload) => printImages(payload));

  // ── Clipboard ──
  ipcMain.handle('clipboard:writeText', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });
  ipcMain.handle('clipboard:readText', () => clipboard.readText());
  ipcMain.handle('clipboard:writeImage', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) throw new Error('The clipboard image is empty (PNG decode failed).');
    clipboard.writeImage(img);
    return true;
  });
  ipcMain.handle('clipboard:readImage', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const size = img.getSize();
    return { dataUrl: img.toDataURL(), width: size.width, height: size.height };
  });

  // ── Shell ──
  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (!/^(https?|mailto):/i.test(url)) throw new Error('Refusing to open a non-web URL: ' + url);
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));

  // ── Capture support: hide everything while the screen is grabbed ──
  ipcMain.handle('capture:hideApp', () => {
    const win = state.mainWin;
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    setDialogsVisible(false);
    return true;
  });
  ipcMain.handle('capture:showApp', () => {
    const win = state.mainWin;
    if (win && !win.isDestroyed()) { win.show(); win.focus(); }
    setDialogsVisible(true);
    return true;
  });
  ipcMain.handle('capture:minimizeApp', () => { const w = state.mainWin; if (w && !w.isDestroyed()) w.minimize(); return true; });
  ipcMain.handle('capture:restoreApp', () => {
    const w = state.mainWin;
    if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
    return true;
  });

  // ── Window controls (frameless) ──
  ipcMain.handle('win:minimize', (e) => { ownerWin(e)?.minimize(); });
  ipcMain.handle('win:toggleMaximize', (e) => {
    const w = ownerWin(e);
    if (!w) return false;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
    return w.isMaximized();
  });
  ipcMain.handle('win:close', (e) => { ownerWin(e)?.close(); });
  ipcMain.handle('win:isMaximized', (e) => !!ownerWin(e)?.isMaximized());
  ipcMain.handle('win:setTitle', (e, title) => { const w = ownerWin(e); if (w && !w.isDestroyed()) w.setTitle(String(title || 'CaptureMaster')); return true; });
  ipcMain.handle('win:setOpacity', (e, value) => {
    const w = ownerWin(e);
    if (!w || w.isDestroyed()) return false;
    const v = Math.max(0.15, Math.min(1, Number(value)));
    w.setOpacity(Number.isFinite(v) ? v : 1);
    return true;
  });
  ipcMain.handle('win:getSize', (e) => {
    const w = ownerWin(e);
    if (!w || w.isDestroyed()) return null;
    const [width, height] = w.getSize();
    const [minWidth, minHeight] = w.getMinimumSize();
    return { width, height, minWidth, minHeight };
  });
  ipcMain.handle('win:setSize', (e, { width, height } = {}) => {
    const w = ownerWin(e);
    if (!w || w.isDestroyed() || w.isMaximized() || w.isFullScreen()) return false;
    const [minWidth, minHeight] = w.getMinimumSize();
    const nw = Math.max(minWidth, Math.round(Number(width) || 0));
    const nh = Math.max(minHeight, Math.round(Number(height) || 0));
    if (!Number.isFinite(nw) || !Number.isFinite(nh)) return false;
    w.setSize(nw, nh);
    return true;
  });
  // The renderer measures what the toolbar needs (it depends on language and
  // font) and the window is never allowed narrower than that.
  // Same for the height: the start screen measures what it needs to show
  // everything without scrolling.
  ipcMain.handle('win:setMinHeight', (e, height) => {
    const w = ownerWin(e);
    const want = Math.round(Number(height) || 0);
    if (!w || w.isDestroyed() || !Number.isFinite(want) || want <= 0) return false;
    const pad = Math.max(0, w.getSize()[1] - w.getContentSize()[1]);
    const min = Math.max(MIN_WINDOW_HEIGHT, Math.min(want + pad, MAX_MIN_WINDOW_HEIGHT));
    const [minW, curMin] = w.getMinimumSize();
    if (curMin === min) return true;
    w.setMinimumSize(minW, min);
    if (!w.isMaximized() && !w.isFullScreen()) {
      const [cw, ch] = w.getSize();
      if (ch < min || startingUp()) w.setSize(cw, min);
    }
    return true;
  });

  ipcMain.handle('win:setMinWidth', (e, width) => {
    const w = ownerWin(e);
    const want = Math.round(Number(width) || 0);
    if (!w || w.isDestroyed() || !Number.isFinite(want) || want <= 0) return false;
    const pad = Math.max(0, w.getSize()[0] - w.getContentSize()[0]);
    const min = Math.max(MIN_WINDOW_WIDTH, Math.min(want + pad, MAX_MIN_WINDOW_WIDTH));
    const [curMin, minH] = w.getMinimumSize();
    if (curMin === min) return true;
    w.setMinimumSize(min, minH);
    if (!w.isMaximized() && !w.isFullScreen()) {
      const [cw, ch] = w.getSize();
      if (cw < min || startingUp()) w.setSize(min, ch);
    }
    return true;
  });
}

module.exports = { registerIpcHandlers, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT };
