const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
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

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1000,
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

// Save text (merged markdown or exported HTML) with a save dialog.
ipcMain.handle('dialog:saveText', async (_e, { defaultName, content, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '저장 / Save',
    defaultPath: defaultName || 'merged.md',
    filters: filters || [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

// Save a binary file (base64) — used for Word (.docx) export.
ipcMain.handle('dialog:saveBinary', async (_e, { defaultName, base64, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '저장 / Save',
    defaultPath: defaultName || 'document.bin',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

// Render standalone HTML to PDF using an offscreen window's print engine.
ipcMain.handle('export:pdf', async (_e, { html, defaultName, pdfOptions }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'PDF 내보내기 / Export PDF',
    defaultPath: defaultName || 'document.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  const opts = pdfOptions || {};
  const polyfill = opts.paged ? getPagedPolyfill() : '';
  const usePaged = !!(opts.paged && polyfill);

  // For the paged path, inject paged.js so the TOC resolves page numbers and
  // header/footer/page-number margin boxes render.
  let finalHtml = html;
  if (usePaged) {
    // After paged.js paginates, fill each TOC entry with its target heading's
    // real page number (read from the rendered .pagedjs_page[data-page-number]).
    const cfg = `window.PagedConfig={auto:true,after:function(){try{`
      + `document.querySelectorAll('.toc-list a').forEach(function(a){`
      + `var id=(a.getAttribute('href')||'').slice(1);`
      + `var el=id&&document.getElementById(id);`
      + `var pg=el&&el.closest('.pagedjs_page');`
      + `var n=pg&&pg.getAttribute('data-page-number');`
      + `var s=a.querySelector('.toc-pg');`
      + `if(s&&n)s.textContent=n;});`
      + `}catch(e){}window.__pagedReady=true;}};`;
    const inject = `<script>${cfg}</script><script>${polyfill}</script>`;
    finalHtml = html.includes('</head>') ? html.replace('</head>', `${inject}</head>`) : inject + html;
  }

  // Write HTML to a temp file so large documents avoid data-URL size limits.
  const tmp = path.join(os.tmpdir(), `mmm-export-${Date.now()}.html`);
  fs.writeFileSync(tmp, finalHtml, 'utf-8');

  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmp);

    let paged = false;
    if (usePaged) {
      // Wait for paged.js to finish paginating (bounded).
      for (let i = 0; i < 100; i++) {
        let ready = false;
        try { ready = await pdfWin.webContents.executeJavaScript('window.__pagedReady===true'); } catch { /* ignore */ }
        if (ready) { paged = true; break; }
        await delay(100);
      }
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

// Separate, movable settings window (native frame so it can leave the main window).
let settingsWin = null;
ipcMain.handle('settings:open', () => {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 700,
    height: 880,
    minWidth: 520,
    minHeight: 480,
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
let aboutWin = null;
ipcMain.handle('about:open', () => {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.show(); aboutWin.focus(); return; }
  aboutWin = new BrowserWindow({
    width: 520,
    height: 500,
    resizable: false,
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
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());
