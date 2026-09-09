const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';

app.commandLine.appendSwitch('disable-features', 'Autofill');

// paged.js polyfill (paginates content so the TOC can resolve real page numbers
// via target-counter). Loaded lazily and cached.
let pagedPolyfillSrc = null;
function getPagedPolyfill() {
  if (pagedPolyfillSrc !== null) return pagedPolyfillSrc;
  const candidates = [
    path.join(__dirname, '..', 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
  ];
  try { candidates.unshift(require.resolve('pagedjs/dist/paged.polyfill.js')); } catch { /* ignore */ }
  for (const p of candidates) {
    try { pagedPolyfillSrc = fs.readFileSync(p, 'utf-8'); return pagedPolyfillSrc; } catch { /* ignore */ }
  }
  pagedPolyfillSrc = '';
  return pagedPolyfillSrc;
}

// Windows whose close the renderer has already approved (see the 'close' hook),
// and the pending "renderer did not answer" timers.
const closeApproved = new WeakSet();
const closeTimers = new WeakMap();

// Offscreen render window for paged.js pagination / PDF printing.
// IMPORTANT: this is NOT `show:false`. A hidden window has its rendering
// throttled to ~1fps, which makes paged.js ~40× slower (17s vs 0.4s for a
// 19-page doc). A shown-but-offscreen, fully-transparent, no-taskbar window
// renders at full speed while remaining invisible to the user.
function createRenderWindow() {
  return new BrowserWindow({
    show: true, x: -32000, y: -32000, width: 900, height: 700,
    opacity: 0, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, backgroundThrottling: false },
  });
}

// Disable paged.js auto-run so we can drive it explicitly (see pagedDriver).
function injectPagedConfig(html) {
  const cfg = '<script>window.PagedConfig={auto:false};</script>';
  return html.includes('</head>') ? html.replace('</head>', `${cfg}</head>`) : cfg + html;
}

// Build the JS that paginates a loaded document and then runs `tailJs`.
// paged.js must be injected as pure JS (inlining it in an HTML <script> tag
// breaks HTML parsing → SyntaxError → it never loads), and driven explicitly
// via preview() because the auto-run `after` hook does not fire reliably here.
// `tailJs` runs with pagination complete and must `return` a serializable value.
function pagedDriver(polyfill, tailJs) {
  return `(async function(){\n${polyfill}\n;\nvar __p=new window.Paged.Previewer();\nawait __p.preview();\n${tailJs}\n})()`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    // A starting point only: the renderer measures the toolbar it actually drew
    // and raises this to whatever that row needs (win:setMinWidth), in whichever
    // language is on. Adding a toolbar button no longer means re-measuring a
    // constant by hand.
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#161b1a',
    frame: false,            // custom title bar / window controls live in the toolbar
    autoHideMenuBar: true,
    show: false,
    title: 'MarkDown Merge v1.0',
  });

  if (isDev) {
    win.loadURL('http://localhost:5178');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());

  // Keep the toolbar's maximize/restore button in sync.
  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // Unsaved changes: the first close attempt is held back and handed to the
  // renderer, which asks the user (save / don't save / cancel). The renderer
  // calls back through `win:confirmClose`, which sets the flag and closes for
  // real. Cancelling simply means no callback ever comes.
  win.on('close', (e) => {
    if (closeApproved.has(win) || win.webContents.isDestroyed()) return;
    e.preventDefault();
    win.webContents.send('app:requestClose');
    // Safety net: a renderer that cannot answer (crashed, still loading, an old
    // build without the listener) must never leave an unclosable window. If no
    // answer arrives, close anyway. Answering cancels this timer, so a user who
    // picks "Cancel" keeps the window.
    clearTimeout(closeTimers.get(win));
    closeTimers.set(win, setTimeout(() => {
      closeTimers.delete(win);
      if (!win.isDestroyed() && !closeApproved.has(win)) {
        closeApproved.add(win);
        win.close();
      }
    }, 3000));
  });

  // Closing the main window closes every other window (settings / about / any)
  // and quits, so the app fully exits instead of lingering behind them.
  win.on('closed', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.destroy();
    }
    app.quit();
  });
  return win;
}

// ── Single instance ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.whenReady().then(() => {
    try {
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'MyMarkDownMaker',
        message: 'MyMarkDownMaker가 이미 실행 중입니다.\nMyMarkDownMaker is already running.',
        buttons: ['OK'],
      });
    } catch { /* ignore */ }
    app.quit();
  });
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Allow the Local Font Access API (queryLocalFonts) used by the settings dialog.
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
        cb(permission === 'local-fonts');
      });
    } catch { /* ignore */ }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ── App info ──────────────────────────────────────────────
function readBuildInfo() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'build-info.json'),
    path.join(__dirname, '..', 'src', 'build-info.json'),
    path.join(process.resourcesPath || '', 'build-info.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { /* ignore */ }
  }
  return {};
}

ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  ...readBuildInfo(),
}));

// ── Filesystem ────────────────────────────────────────────
ipcMain.handle('fs:home', () => os.homedir());

// Recursively collect .md/.markdown files under a directory.
function scanMarkdown(dir, recursive) {
  const results = [];
  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue; // skip dotfiles/dotdirs
      const full = path.join(current, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try { isDir = fs.statSync(full).isDirectory(); } catch { continue; }
      }
      if (isDir) {
        if (recursive) walk(full);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      if (ext !== '.md' && ext !== '.markdown') continue;
      let mtime = 0, size = 0;
      try { const st = fs.statSync(full); mtime = st.mtimeMs; size = st.size; } catch { /* ignore */ }
      results.push({
        name: e.name,
        relPath: path.relative(dir, full).split(path.sep).join('/'),
        fullPath: full,
        mtime,
        size,
      });
    }
  };
  walk(dir);
  return results;
}

// ── Last used folder ──────────────────────────────────────
// Kept in its own file (settings.json is rewritten wholesale by the renderer,
// which would drop anything the main process put there). The open dialogs start
// in this folder, so the next run picks up where the last one left off.
function lastDirFile() { return path.join(app.getPath('userData'), 'last-dir.json'); }

function readLastDir() {
  try {
    const { dir } = JSON.parse(fs.readFileSync(lastDirFile(), 'utf-8'));
    if (dir && fs.existsSync(dir)) return dir;
  } catch { /* ignore */ }
  return undefined;
}

function rememberDir(dir) {
  try { fs.writeFileSync(lastDirFile(), JSON.stringify({ dir }, null, 2), 'utf-8'); } catch { /* ignore */ }
}

function dialogParent() {
  const win = BrowserWindow.getFocusedWindow()
    || BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
  return win && !win.isDestroyed() ? win : undefined;
}

function openDialog(opts) {
  const win = dialogParent();
  return win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts);
}

function saveDialog(opts) {
  const win = dialogParent();
  return win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts);
}

ipcMain.handle('dialog:pickDirectory', async () => {
  const { canceled, filePaths } = await openDialog({
    title: '소스 폴더 선택 / Select Source Folder',
    defaultPath: readLastDir(),
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return null;
  rememberDir(filePaths[0]);
  return filePaths[0];
});

ipcMain.handle('fs:scanMarkdown', (_e, { dir, recursive }) => {
  if (!dir || !fs.existsSync(dir)) return { dir, files: [] };
  return { dir, files: scanMarkdown(dir, !!recursive) };
});

ipcMain.handle('fs:readFile', (_e, filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
});

// Resolve a local image referenced by a markdown file and return it as a
// Base64 data URI (used to inline images at merge time). Returns null for
// remote/data URLs, missing files, non-images, or oversized files.
const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.tif': 'image/tiff',
  '.tiff': 'image/tiff', '.ico': 'image/x-icon', '.avif': 'image/avif',
};
ipcMain.handle('fs:embedImage', (_e, { mdPath, src }) => {
  try {
    let s = String(src || '').trim().replace(/^<|>$/g, '');
    if (!s || /^(https?:|data:|\/\/)/i.test(s)) return null;
    let decoded = s;
    try { decoded = decodeURI(s); } catch { /* ignore */ }
    const clean = decoded.split('#')[0].split('?')[0];
    const base = path.dirname(mdPath);
    const abs = path.isAbsolute(clean) ? clean : path.resolve(base, clean);
    const ext = path.extname(abs).toLowerCase();
    const mime = IMG_MIME[ext];
    if (!mime || !fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    if (buf.length > 25 * 1024 * 1024) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
});

// Read many files at once (used when merging).
ipcMain.handle('fs:readFiles', (_e, paths) => {
  const out = {};
  for (const p of paths) {
    try { out[p] = fs.readFileSync(p, 'utf-8'); }
    catch (err) { out[p] = `<!-- Cannot read ${p}: ${err.message} -->`; }
  }
  return out;
});

// Pick individual Markdown files (fallback / add-files flow).
ipcMain.handle('dialog:openFiles', async () => {
  const { canceled, filePaths } = await openDialog({
    title: 'Markdown 파일 선택 / Select Markdown Files',
    defaultPath: readLastDir(),
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
  rememberDir(path.dirname(filePaths[0]));
  return filePaths.map((fp) => {
    let mtime = 0;
    try { mtime = fs.statSync(fp).mtimeMs; } catch { /* ignore */ }
    return {
      name: path.basename(fp),
      relPath: path.basename(fp),
      fullPath: fp,
      mtime,
      content: fs.readFileSync(fp, 'utf-8'),
    };
  });
});

// Save text (merged markdown or exported HTML) with a save dialog.
ipcMain.handle('dialog:saveText', async (_e, { defaultName, content, filters }) => {
  const { canceled, filePath } = await saveDialog({
    title: '저장 / Save',
    defaultPath: defaultName || 'merged.md',
    filters: filters || [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// The renderer measures the toolbar it actually laid out — fonts, language and
// all — and reports how wide the window has to be for it. That beats a constant
// nobody remembers to re-measure when a button is added. Clamped to the display
// so a small screen never gets a window it cannot fit.
ipcMain.handle('win:setMinWidth', (e, width) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return null;
  const workArea = screen.getPrimaryDisplay().workAreaSize.width;
  const w = Math.max(640, Math.min(Math.round(width), workArea));
  const [, minH] = win.getMinimumSize();
  win.setMinimumSize(w, minH);
  const [curW, curH] = win.getSize();
  if (curW < w) win.setSize(w, curH);
  return w;
});

// A frameless window has no OS resize grip, so the status bar draws one and
// drives the resize from the renderer (see startResize in App.jsx).
ipcMain.handle('win:getSize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return win ? win.getSize() : [0, 0];
});

ipcMain.handle('win:setSize', (e, { width, height }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  // setSize already clamps to the window's minimum size.
  if (win && !win.isMaximized()) win.setSize(Math.round(width), Math.round(height));
  return null;
});

// Overwrite a file the user has already chosen — this is what Save (as opposed
// to Save as) does, so it must not open a dialog. The path always comes from an
// earlier save dialog in this session, never from the document.
ipcMain.handle('fs:writeText', async (_e, { filePath, content }) => {
  if (!filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// Save a binary file (base64) — used for Word (.docx) export.
ipcMain.handle('dialog:saveBinary', async (_e, { defaultName, base64, filters }) => {
  const { canceled, filePath } = await saveDialog({
    title: '저장 / Save',
    defaultPath: defaultName || 'document.bin',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

// Render standalone HTML to PDF using an offscreen window's print engine.
// Print the document itself — the same paginated HTML the PDF export renders,
// so what comes out of the printer matches the preview (cover, contents with
// real page numbers, header/footer, page breaks). Shows the system print dialog.
ipcMain.handle('doc:print', async (_e, { html, pdfOptions }) => {
  const opts = pdfOptions || {};
  const polyfill = opts.paged ? getPagedPolyfill() : '';
  const usePaged = !!(opts.paged && polyfill);
  const tmp = path.join(os.tmpdir(), `mmm-print-${Date.now()}.html`);
  fs.writeFileSync(tmp, usePaged ? injectPagedConfig(html) : html, 'utf-8');

  // An offscreen-but-shown window: a hidden window cannot be printed on Windows.
  const win = createRenderWindow();
  const cleanup = () => {
    if (!win.isDestroyed()) win.destroy();
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  };
  try {
    await win.loadFile(tmp);
    if (usePaged) {
      const tail = `document.querySelectorAll('.toc-table tr').forEach(function(tr){`
        + `var a=tr.querySelector('a');var s=tr.querySelector('.toc-c-pg');if(!a||!s)return;`
        + `var id=(a.getAttribute('href')||'').slice(1);`
        + `var el=id&&document.getElementById(id);`
        + `var pg=el&&el.closest('.pagedjs_page');`
        + `var n=pg&&pg.getAttribute('data-page-number');`
        + `if(n!=null)s.textContent=n;});`
        + `return true;`;
      try { await win.webContents.executeJavaScript(pagedDriver(polyfill, tail)); }
      catch { /* fall through and print what rendered */ }
    }
    return await new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        (success, reason) => { cleanup(); resolve({ success, reason: reason || '' }); },
      );
    });
  } catch (err) {
    cleanup();
    throw err;
  }
});

ipcMain.handle('export:pdf', async (_e, { html, defaultName, pdfOptions }) => {
  const { canceled, filePath } = await saveDialog({
    title: 'PDF 내보내기 / Export PDF',
    defaultPath: defaultName || 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  const opts = pdfOptions || {};
  const polyfill = opts.paged ? getPagedPolyfill() : '';
  const usePaged = !!(opts.paged && polyfill);

  // Write HTML to a temp file so large documents avoid data-URL size limits.
  const finalHtml = usePaged ? injectPagedConfig(html) : html;
  const tmp = path.join(os.tmpdir(), `mmm-export-${Date.now()}.html`);
  fs.writeFileSync(tmp, finalHtml, 'utf-8');

  const pdfWin = usePaged ? createRenderWindow() : new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmp);

    let paged = false;
    if (usePaged) {
      // Paginate with paged.js, then fill each TOC entry with its target
      // heading's real page number (from the rendered .pagedjs_page).
      const tail = `document.querySelectorAll('.toc-table tr').forEach(function(tr){`
        + `var a=tr.querySelector('a');var s=tr.querySelector('.toc-c-pg');if(!a||!s)return;`
        + `var id=(a.getAttribute('href')||'').slice(1);`
        + `var el=id&&document.getElementById(id);`
        + `var pg=el&&el.closest('.pagedjs_page');`
        + `var n=pg&&pg.getAttribute('data-page-number');`
        + `if(n!=null)s.textContent=n;});`
        + `return true;`;
      try { paged = (await pdfWin.webContents.executeJavaScript(pagedDriver(polyfill, tail))) === true; }
      catch { paged = false; }
    }

    let data;
    if (paged) {
      // paged.js drew fixed-size pages + margin boxes → print them 1:1.
      data = await pdfWin.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
    } else {
      // Fallback: plain print with header/footer templates.
      const fb = opts.fallback || {};
      data = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4', ...fb });
    }
    fs.writeFileSync(filePath, data);
    return filePath;
  } finally {
    pdfWin.destroy();
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
});

// Paginate a standalone HTML document with paged.js and return a map of every
// heading and figure anchor to its real page number ({ 'h-0': 3, 'fig-0': 5, … }).
// Word and HTML export use this to bake right-aligned page numbers into the
// contents and figure index pages (they cannot run the paged.js layout
// themselves the way the PDF path does during its render).
ipcMain.handle('export:paginate', async (_e, html) => {
  const polyfill = getPagedPolyfill();
  if (!polyfill || typeof html !== 'string') return {};

  const finalHtml = injectPagedConfig(html);
  const tmp = path.join(os.tmpdir(), `mmm-paginate-${Date.now()}.html`);
  fs.writeFileSync(tmp, finalHtml, 'utf-8');
  const win = createRenderWindow();
  try {
    await win.loadFile(tmp);
    // After pagination, walk every heading (id="h-N") and figure (id="fig-N"),
    // find the page each landed on and record its number.
    const tail = `var map={};`
      + `document.querySelectorAll('[id^="h-"],[id^="fig-"]').forEach(function(el){`
      + `var pg=el.closest('.pagedjs_page');`
      + `var n=pg&&pg.getAttribute('data-page-number');`
      + `if(n!=null)map[el.id]=parseInt(n,10);});`
      + `return map;`;
    return (await win.webContents.executeJavaScript(pagedDriver(polyfill, tail))) || {};
  } catch { return {}; }
  finally {
    win.destroy();
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
});

// Separate, movable settings window (native frame so it can leave the main window).
// The settings window's fixed size (see the three-column form in App.css).
const SETTINGS_W = 1240;
// A starting height only, deliberately generous: the settings window measures
// the form it actually laid out and asks to be resized to exactly fit
// (settings:resize). Adding a section no longer means guessing a new constant,
// and an over-tall window is a strip of empty space — an under-tall one hides
// settings, which is what the old hand-kept constant kept doing.
const SETTINGS_H = 820;

let settingsWin = null;
// The settings window reports how tall its form came out — in the language and
// at the font size actually in use — and is resized to exactly that.
ipcMain.handle('settings:resize', (e, { width, height }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win !== settingsWin) return null;
  const area = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.max(640, Math.min(Math.round(width || win.getSize()[0]), area.width));
  const h = Math.max(420, Math.min(Math.round(height), area.height));
  const [curW, curH] = win.getSize();
  if (curW === w && curH === h) return [w, h];
  // The window is pinned to one size, so all three have to move together.
  win.setMinimumSize(w, h);
  win.setMaximumSize(w, h);
  win.setSize(w, h);
  win.center();
  return [w, h];
});

ipcMain.handle('settings:open', () => {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  // Fixed size: the form is laid out in three columns to fit exactly this box,
  // so the window never scrolls in either direction and cannot be resized into
  // a shape where it would have to.
  settingsWin = new BrowserWindow({
    width: SETTINGS_W,
    height: SETTINGS_H,
    minWidth: SETTINGS_W,
    minHeight: SETTINGS_H,
    maxWidth: SETTINGS_W,
    maxHeight: SETTINGS_H,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'MyMarkDownMaker — Settings',
    frame: false,            // only the in-app settings title bar is shown
    autoHideMenuBar: true,
    backgroundColor: '#1b1917',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenu(null);
  if (isDev) {
    settingsWin.loadURL('http://localhost:5178/#settings');
  } else {
    settingsWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'settings' });
  }
  settingsWin.on('closed', () => { settingsWin = null; });
});

// Separate, movable About window (frameless — custom title bar only).
// The About window's fixed size.
const ABOUT_W = 520;
const ABOUT_H = 400;

let aboutWin = null;
ipcMain.handle('about:open', () => {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.show(); aboutWin.focus(); return; }
  // Fixed size, measured to the content: no scrolling, no empty space.
  aboutWin = new BrowserWindow({
    width: ABOUT_W,
    height: ABOUT_H,
    minWidth: ABOUT_W, minHeight: ABOUT_H, maxWidth: ABOUT_W, maxHeight: ABOUT_H,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'About MarkDown Merge',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1917',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aboutWin.setMenu(null);
  if (isDev) {
    aboutWin.loadURL('http://localhost:5178/#about');
  } else {
    aboutWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'about' });
  }
  aboutWin.on('closed', () => { aboutWin = null; });
});

// Persisted settings (survive restarts) stored under userData/settings.json.
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
ipcMain.handle('settings:load', () => {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')); } catch { return null; }
});
ipcMain.handle('settings:save', (_e, data) => {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2), 'utf-8'); return true; } catch { return false; }
});

ipcMain.handle('shell:showItem', (_e, p) => {
  try { shell.showItemInFolder(p); return true; } catch { return false; }
});

// ── Window controls (frameless) ───────────────────────────
ipcMain.handle('win:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
ipcMain.handle('win:toggleMaximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
  return w.isMaximized();
});
ipcMain.handle('win:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
// The renderer is showing its "save before quitting?" dialog — stop the
// no-answer timer so the question can wait for the user as long as it needs to.
ipcMain.handle('win:holdClose', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  clearTimeout(closeTimers.get(w));
  closeTimers.delete(w);
});

// The renderer has dealt with unsaved changes — close for real this time.
ipcMain.handle('win:confirmClose', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  clearTimeout(closeTimers.get(w));
  closeTimers.delete(w);
  closeApproved.add(w);
  w.close();
});
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());
