const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';

app.commandLine.appendSwitch('disable-features', 'Autofill');

// ── File association (.mtg) — open a file passed on the command line ───────
// Find the first .mtg/.json path in an argv list that exists on disk.
function fileArgFrom(argv) {
  for (const a of (argv || []).slice(1)) {
    if (typeof a === 'string' && /\.(mtg|json)$/i.test(a) && fs.existsSync(a)) return a;
  }
  return null;
}
// A file to open once the renderer is ready (from the initial launch / macOS).
let pendingFile = fileArgFrom(process.argv);

// Read the file and hand it to the renderer to load into the editor.
function sendFileToWindow(win, filePath) {
  if (!win || win.isDestroyed()) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    win.webContents.send('file:open', { name: path.basename(filePath), path: filePath, content });
  } catch { /* ignore unreadable files */ }
}

// macOS delivers the opened file via this event.
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { sendFileToWindow(win, filePath); win.focus(); }
  else pendingFile = filePath;
});

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
    minWidth: 1120, // floor before the renderer measures the exact toolbar width
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
    title: 'MyMeeting v1.0',
  });

  if (isDev) {
    win.loadURL('http://localhost:5179');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());

  // Once the app has loaded, open any file the user launched us with.
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) { sendFileToWindow(win, pendingFile); pendingFile = null; }
  });

  // Keep the toolbar's maximize/restore button in sync.
  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

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
        title: 'MyMeeting',
        message: 'MyMeeting가 이미 실행 중입니다.\nMyMeeting is already running.',
        buttons: ['OK'],
      });
    } catch { /* ignore */ }
    app.quit();
  });
} else {
  app.on('second-instance', (_e, argv) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      // A second launch with a .mtg file (e.g. double-click) opens it here.
      const f = fileArgFrom(argv);
      if (f) sendFileToWindow(win, f);
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
  packaged: app.isPackaged,
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

ipcMain.handle('dialog:pickDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '소스 폴더 선택 / Select Source Folder',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return null;
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
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Markdown 파일 선택 / Select Markdown Files',
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return [];
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

// Open a single text file (used to load a saved .mtg / .json meeting).
ipcMain.handle('dialog:openTextFile', async (_e, { filters, defaultDir } = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '열기 / Open',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    ...(defaultDir ? { defaultPath: defaultDir } : {}),
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  return { name: path.basename(filePath), path: filePath, content: fs.readFileSync(filePath, 'utf-8') };
});

// Save text (meeting file or exported document) with a save dialog.
// Join a persisted directory with a filename for a dialog's initial location.
function initialPath(defaultDir, defaultName, fallback) {
  const name = defaultName || fallback;
  return defaultDir ? path.join(defaultDir, name) : name;
}

ipcMain.handle('dialog:saveText', async (_e, { defaultName, content, filters, defaultDir }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '저장 / Save',
    defaultPath: initialPath(defaultDir, defaultName, 'meeting.mtg'),
    filters: filters || [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// Write text straight to a known path — Save (Ctrl+S) on a document that
// already has a file, with no dialog. Returns the path, or an { error } object.
ipcMain.handle('fs:writeText', async (_e, { filePath, content } = {}) => {
  if (!filePath || typeof content !== 'string') return { error: 'bad-request' };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { path: filePath };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

// Save a binary file (base64) — used for Word (.docx) export.
ipcMain.handle('dialog:saveBinary', async (_e, { defaultName, base64, filters, defaultDir }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '저장 / Save',
    defaultPath: initialPath(defaultDir, defaultName, 'document.bin'),
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

// Render standalone HTML to PDF using an offscreen window's print engine.
ipcMain.handle('export:pdf', async (_e, { html, defaultName, pdfOptions, defaultDir }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'PDF 내보내기 / Export PDF',
    defaultPath: initialPath(defaultDir, defaultName, 'document.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  const opts = pdfOptions || {};
  const polyfill = opts.paged ? getPagedPolyfill() : '';
  const usePaged = !!(opts.paged && polyfill);

  // Write HTML to a temp file so large documents avoid data-URL size limits.
  const finalHtml = usePaged ? injectPagedConfig(html) : html;
  const tmp = path.join(os.tmpdir(), `mtg-export-${Date.now()}.html`);
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
// heading anchor to its real page number ({ 'h-0': 3, 'h-1': 4, … }). Word and
// HTML export use this to bake right-aligned TOC page numbers (they cannot run
// the paged.js layout themselves the way the PDF path does during its render).
ipcMain.handle('export:paginate', async (_e, html) => {
  const polyfill = getPagedPolyfill();
  if (!polyfill || typeof html !== 'string') return {};

  const finalHtml = injectPagedConfig(html);
  const tmp = path.join(os.tmpdir(), `mtg-paginate-${Date.now()}.html`);
  fs.writeFileSync(tmp, finalHtml, 'utf-8');
  const win = createRenderWindow();
  try {
    await win.loadFile(tmp);
    // After pagination, walk every heading (id="h-N"), find the page it landed
    // on and record its number.
    const tail = `var map={};`
      + `document.querySelectorAll('[id^="h-"]').forEach(function(el){`
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

// ── Printing ──────────────────────────────────────────────
// Load a standalone HTML document into the offscreen render window, paginate it
// with paged.js, run `tailJs` in the page and hand the *still open* window plus
// the tail's return value to `fn`. Window and temp file are always cleaned up.
async function withPagedWindow(html, tailJs, fn) {
  const polyfill = getPagedPolyfill();
  if (!polyfill || typeof html !== 'string') return null;
  const tmp = path.join(os.tmpdir(), `mtg-print-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  fs.writeFileSync(tmp, injectPagedConfig(html), 'utf-8');
  const win = createRenderWindow();
  try {
    await win.loadFile(tmp);
    const info = await win.webContents.executeJavaScript(pagedDriver(polyfill, tailJs));
    return await fn(win, info);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// How many pages the document has, and which page each heading lands on. The
// Print dialog uses this to show the total and to resolve "current page".
ipcMain.handle('print:info', async (_e, html) => {
  const tail = `var map={};`
    + `document.querySelectorAll('[id^="h-"]').forEach(function(el){`
    + `var pg=el.closest('.pagedjs_page');`
    + `var n=pg&&pg.getAttribute('data-page-number');`
    + `if(n!=null)map[el.id]=parseInt(n,10);});`
    + `return {pages:document.querySelectorAll('.pagedjs_page').length,map:map};`;
  try {
    return (await withPagedWindow(html, tail, (_w, info) => info)) || { pages: 0, map: {} };
  } catch { return { pages: 0, map: {} }; }
});

// The printers this machine can reach, for the Print dialog's picker.
ipcMain.handle('print:printers', async (e) => {
  try {
    const list = await e.sender.getPrintersAsync();
    return (list || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!p.isDefault,
      status: p.status,
    }));
  } catch { return []; }
});

// Print a standalone HTML document.
// The page selection is applied by deleting the pages paged.js laid out that
// are not wanted — exact on every platform, and the surviving pages keep the
// page numbers already rendered into their margin boxes.
// `pages` is an array of 1-based page numbers; null/empty prints everything.
ipcMain.handle('print:document', async (_e, { html, pages, options } = {}) => {
  const keep = Array.isArray(pages) && pages.length ? pages.filter((n) => Number.isInteger(n) && n > 0) : null;
  // paged.js renders the page number as `content: … counter(page)` in a margin
  // box, so it would restart at 1 once pages are removed. Freeze every margin
  // box that uses the counter to its literal number FIRST (keeping any
  // header/footer text around it), then drop the unwanted pages.
  const tail = `var keep=${keep ? JSON.stringify(keep) : 'null'};`
    + `var all=Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page'));`
    + `if(keep){`
    + `var rules=[];`
    + `all.forEach(function(p){`
    + `var n=p.getAttribute('data-page-number');if(n==null)return;`
    + `p.querySelectorAll('.pagedjs_margin-content').forEach(function(m){`
    + `var c=(getComputedStyle(m,':after').content)||'';`
    + `if(c.indexOf('counter(page)')<0)return;`
    + `m.setAttribute('data-mtg-pgno',n);`
    + `rules.push('.pagedjs_margin-content[data-mtg-pgno="'+n+'"]:after{content:'`
    + `+c.split('counter(page)').join('"'+n+'"')+' !important}');});});`
    + `if(rules.length){var st=document.createElement('style');`
    + `st.textContent=rules.join('');document.head.appendChild(st);}`
    + `all.forEach(function(p){`
    + `var n=parseInt(p.getAttribute('data-page-number'),10);`
    + `if(keep.indexOf(n)<0)p.parentNode.removeChild(p);});}`
    + `return {pages:all.length,printed:document.querySelectorAll('.pagedjs_page').length};`;

  const o = options || {};
  const int = (v, min, max, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
  };
  const printOptions = {
    // silent skips the system dialog and prints straight to the chosen printer.
    silent: !!o.silent,
    printBackground: true,
    pageSize: 'A4',
    // paged.js already drew the page margins into the layout.
    margins: { marginType: 'none' },
    copies: int(o.copies, 1, 99, 1),
    collate: o.collate !== false,
    color: o.color !== false,
    landscape: !!o.landscape,
    scaleFactor: int(o.scaleFactor, 10, 200, 100),
    pagesPerSheet: [1, 2, 4, 6, 9, 16].includes(Number(o.pagesPerSheet)) ? Number(o.pagesPerSheet) : 1,
  };
  if (o.deviceName) printOptions.deviceName = o.deviceName;
  if (['simplex', 'shortEdge', 'longEdge'].includes(o.duplexMode)) printOptions.duplexMode = o.duplexMode;

  const run = (win, info) => new Promise((resolve) => {
    if (!info || !info.printed) { resolve({ ok: false, reason: 'empty', ...(info || {}) }); return; }
    win.webContents.print(
      printOptions,
      (ok, reason) => resolve({ ok, reason: ok ? '' : (reason || ''), ...info }),
    );
  });

  try {
    const r = await withPagedWindow(html, tail, run);
    return r || { ok: false, reason: 'unavailable', pages: 0, printed: 0 };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err), pages: 0, printed: 0 };
  }
});

// Separate, movable settings window (native frame so it can leave the main window).
let settingsWin = null;
ipcMain.handle('settings:open', () => {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 860,
    minHeight: 520,
    title: 'MyMeeting — Settings',
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
    settingsWin.loadURL('http://localhost:5179/#settings');
  } else {
    settingsWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'settings' });
  }
  settingsWin.on('closed', () => { settingsWin = null; });
});

// Separate, movable About window (frameless — custom title bar only).
let aboutWin = null;
ipcMain.handle('about:open', () => {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.show(); aboutWin.focus(); return; }
  aboutWin = new BrowserWindow({
    width: 520,
    height: 500,
    resizable: false,
    title: 'About MyMeeting',
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
    aboutWin.loadURL('http://localhost:5179/#about');
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

// ── Native context menu ───────────────────────────────────
// Renderer sends a serializable template: [{ id, label, enabled }|{ type:'separator' }].
// We show it as a real OS popup (never clipped by the window) at the cursor and
// resolve with the clicked item's id (or null when dismissed) so the renderer
// can run the exact same action the in-app menu would have.
ipcMain.handle('menu:popup', (event, template) => new Promise((resolve) => {
  // Returns { shown, id }: `shown:false` tells the renderer to fall back to its
  // in-app menu so a context menu is never lost if the native popup can't show.
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    let picked = null;
    const items = (Array.isArray(template) ? template : []).map((it) => (
      it && it.type === 'separator'
        ? { type: 'separator' }
        : {
          label: String((it && it.label) || ''),
          enabled: !(it && it.enabled === false),
          click: () => { picked = (it && it.id != null) ? it.id : null; },
        }
    ));
    if (!win || !items.length) { resolve({ shown: false, id: null }); return; }
    const menu = Menu.buildFromTemplate(items);
    menu.popup({ window: win, callback: () => resolve({ shown: true, id: picked }) });
  } catch {
    resolve({ shown: false, id: null });
  }
}));

// ── Window controls (frameless) ───────────────────────────
// The renderer measures the toolbar's required width and sets it as the window's
// minimum so the toolbar never wraps or clips buttons on resize.
ipcMain.handle('win:setMinWidth', (e, w) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  const minW = Math.max(600, Math.min(2400, Math.ceil(Number(w) || 0)));
  const [, minH] = win.getMinimumSize();
  win.setMinimumSize(minW, minH || 620);
  const [curW, curH] = win.getSize();
  if (curW < minW) win.setSize(minW, curH);
  return true;
});
ipcMain.handle('win:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
ipcMain.handle('win:toggleMaximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMaximized()) w.unmaximize(); else w.maximize();
  return w.isMaximized();
});
ipcMain.handle('win:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());
