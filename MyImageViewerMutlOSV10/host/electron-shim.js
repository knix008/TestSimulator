/**
 * Enough of Electron's main-process API for host/service.js to run inside
 * the Tauri desktop host (plain Node) instead of Electron.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const handlers = new Map();
const ons = new Map();
const clients = new Set();
const backlog = [];
const appEvents = new Map();
const readyWaiters = [];
let readyFired = false;

function psQuote(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

function runPs(script) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch (err) {
    return String(err.stdout || '').trim();
  }
}

function emit(channel, payload) {
  const msg = JSON.stringify({ channel, payload });
  if (clients.size === 0) {
    backlog.push(msg);
    if (backlog.length > 40) backlog.shift();
    return;
  }
  for (const res of clients) {
    try { res.write(`data: ${msg}\n\n`); } catch { /* client gone */ }
  }
}

function addClient(res) {
  for (const msg of backlog) {
    try { res.write(`data: ${msg}\n\n`); } catch { /* ignore */ }
  }
  backlog.length = 0;
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

let displaysCache = null;
function getAllDisplays() {
  if (displaysCache) return displaysCache;
  const fallback = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  if (process.platform !== 'win32') {
    displaysCache = fallback;
    return displaysCache;
  }
  const raw = runPs(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
      $w = $_.WorkingArea
      '{0},{1},{2},{3}' -f $w.X,$w.Y,$w.Width,$w.Height
    }
  `);
  const list = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [x, y, width, height] = line.split(',').map(Number);
    return { workArea: { x, y, width, height } };
  }).filter((d) => d.workArea.width > 0 && d.workArea.height > 0);
  displaysCache = list.length ? list : fallback;
  return displaysCache;
}

async function getPrintersAsync() {
  if (process.platform !== 'win32') return [];
  try {
    const raw = runPs('Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((p) => p && p.Name).map((p) => ({
      name: p.Name,
      displayName: p.Name,
      description: '',
      isDefault: !!p.Default,
    }));
  } catch {
    return [];
  }
}

const bounds = { x: 80, y: 60, width: 1400, height: 900 };
const webContents = {
  isLoading: () => false,
  send: (channel, payload) => emit(channel, payload),
  getPrintersAsync,
  print: (_opts, cb) => { if (typeof cb === 'function') cb(false, 'printed-in-webview'); },
  executeJavaScript: async () => {},
  startDrag: () => {},
};

const windowStub = {
  isDestroyed: () => false,
  isMinimized: () => false,
  isMaximized: () => false,
  isFullScreen: () => false,
  webContents,
  getBounds: () => ({ ...bounds }),
  getNormalBounds: () => ({ ...bounds }),
  getContentBounds: () => ({ ...bounds }),
  getMinimumSize: () => [1200, 600],
  setMinimumSize() {},
  setBounds(b) { Object.assign(bounds, b); },
  setFullScreen() {},
  setIgnoreMouseEvents() {},
  minimize() {},
  maximize() {},
  unmaximize() {},
  restore() {},
  show() {},
  focus() {},
  close() {},
  destroy() {},
};

function filterString(filters) {
  if (!filters || !filters.length) return 'All files|*.*';
  return filters.map((f) => {
    const exts = (f.extensions && f.extensions.length) ? f.extensions : ['*'];
    const spec = exts.map((e) => (e === '*' ? '*.*' : `*.${e}`)).join(';');
    return `${f.name || 'Files'}|${spec}`;
  }).join('|');
}

function showOpenDialog(_win, options = {}) {
  if (process.platform !== 'win32') return Promise.resolve({ canceled: true, filePaths: [] });
  const props = options.properties || [];
  const initial = options.defaultPath || '';
  if (props.includes('openDirectory') || props.includes('openFolder')) {
    const out = runPs(`
      Add-Type -AssemblyName System.Windows.Forms
      $d = New-Object System.Windows.Forms.FolderBrowserDialog
      $d.SelectedPath = ${psQuote(initial)}
      if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }
    `);
    if (!out) return Promise.resolve({ canceled: true, filePaths: [] });
    return Promise.resolve({ canceled: false, filePaths: [out] });
  }
  const out = runPs(`
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Filter = ${psQuote(filterString(options.filters))}
    $d.InitialDirectory = ${psQuote(initial)}
    if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }
  `);
  if (!out) return Promise.resolve({ canceled: true, filePaths: [] });
  return Promise.resolve({ canceled: false, filePaths: [out] });
}

function showSaveDialog(_win, options = {}) {
  if (process.platform !== 'win32') return Promise.resolve({ canceled: true });
  const initial = options.defaultPath || '';
  const dir = initial ? path.dirname(initial) : '';
  const name = initial ? path.basename(initial) : 'image.png';
  const out = runPs(`
    Add-Type -AssemblyName System.Windows.Forms
    $d = New-Object System.Windows.Forms.SaveFileDialog
    $d.Filter = ${psQuote(filterString(options.filters))}
    $d.InitialDirectory = ${psQuote(dir)}
    $d.FileName = ${psQuote(name)}
    if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }
  `);
  if (!out) return Promise.resolve({ canceled: true });
  return Promise.resolve({ canceled: false, filePath: out });
}

function showMessageBox(_win, options = {}) {
  const buttons = options.buttons && options.buttons.length ? options.buttons : ['OK'];
  if (process.platform !== 'win32') {
    return Promise.resolve({ response: options.cancelId ?? 0 });
  }
  let kind = 'OK';
  if (buttons.length === 2) kind = 'YesNo';
  else if (buttons.length >= 3) kind = 'YesNoCancel';
  const text = [options.message, options.detail].filter(Boolean).join('\n\n');
  const out = runPs(`
    Add-Type -AssemblyName System.Windows.Forms
    $r = [System.Windows.Forms.MessageBox]::Show(${psQuote(text)}, ${psQuote(options.title || 'MyImageViewer')}, [System.Windows.Forms.MessageBoxButtons]::${kind})
    Write-Output $r
  `);
  const map = { OK: 0, Yes: 0, No: 1, Cancel: buttons.length >= 3 ? 2 : 1 };
  return Promise.resolve({ response: map[out] ?? (options.cancelId ?? 0) });
}

function openExternal(target) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', String(target)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [String(target)], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [String(target)], { detached: true, stdio: 'ignore' }).unref();
  }
  return Promise.resolve();
}

function showItemInFolder(filePath) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [`/select,${filePath}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-R', filePath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [path.dirname(filePath)], { detached: true, stdio: 'ignore' }).unref();
  }
}

function imageStub() {
  return { isEmpty: () => false, resize: () => imageStub() };
}

function emitApp(name, ...args) {
  for (const fn of appEvents.get(name) || []) {
    try { fn(...args); } catch (err) { console.error(err); }
  }
}

function flushReady() {
  if (readyFired) return;
  readyFired = true;
  readyWaiters.splice(0).forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });
}

const app = {
  windowStub,
  isPackaged: process.env.MYIMAGEVIEWER_PACKAGED === '1',
  dock: null,
  setAppUserModelId() {},
  requestSingleInstanceLock: () => true,
  quit() { emitApp('before-quit'); process.exit(0); },
  getVersion: () => pkg.version || '0.0.0',
  getName: () => 'MyImageViewer',
  getAppPath: () => ROOT,
  getPath(name) {
    const home = os.homedir();
    if (name === 'userData') {
      const base = process.env.APPDATA || path.join(home, '.config');
      return path.join(base, 'image-viewer-multios');
    }
    if (name === 'documents') return path.join(home, 'Documents');
    if (name === 'temp') return os.tmpdir();
    if (name === 'home') return home;
    if (name === 'exe') return process.env.MYIMAGEVIEWER_EXE || process.execPath;
    return home;
  },
  on(name, fn) {
    if (!appEvents.has(name)) appEvents.set(name, []);
    appEvents.get(name).push(fn);
  },
  whenReady() {
    return new Promise((resolve) => {
      if (readyFired) resolve();
      else readyWaiters.push(resolve);
    });
  },
};

class BrowserWindow {
  constructor() {
    this.webContents = webContents;
  }
  static getAllWindows() { return []; }
  loadURL() { return Promise.resolve(); }
  loadFile() { return Promise.resolve(); }
  isDestroyed() { return false; }
  close() {}
  destroy() {}
  setBounds() {}
  setIgnoreMouseEvents() {}
}

const ipcMain = {
  handle(channel, fn) { handlers.set(channel, fn); },
  on(channel, fn) {
    if (!ons.has(channel)) ons.set(channel, []);
    ons.get(channel).push(fn);
  },
};

async function invoke(channel, args) {
  const event = { sender: webContents };
  const list = Array.isArray(args) ? args : [];
  if (handlers.has(channel)) return handlers.get(channel)(event, ...list);
  for (const fn of ons.get(channel) || []) fn(event, ...list);
  return null;
}

const dialog = { showOpenDialog, showSaveDialog, showMessageBox };
const Menu = {
  buildFromTemplate() { return {}; },
  setApplicationMenu() {},
};
const shell = { openExternal, showItemInFolder };
const clipboard = { writeText() {}, readText: () => '' };
const nativeImage = {
  createFromPath: () => imageStub(),
  createEmpty: () => ({ isEmpty: () => true, resize: () => imageStub() }),
};
const screen = {
  getAllDisplays,
  getDisplayMatching: () => getAllDisplays()[0],
  getDisplayNearestPoint: () => getAllDisplays()[0],
};

process.on('SIGINT', () => { emitApp('before-quit'); process.exit(0); });
process.on('SIGTERM', () => { emitApp('before-quit'); process.exit(0); });

module.exports = {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  clipboard,
  nativeImage,
  screen,
  invoke,
  addClient,
  removeClient,
  flushReady,
};
