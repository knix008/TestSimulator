'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
  screen,
  clipboard
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const store = require('./store');

const APP_NAME = 'MyMemoPad';
const APP_ID = 'com.shkwon.mymemopad';
const STARTUP_ARG = '--autostart';
const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WINDOWS_RUN_DUPLICATES = [
  'my-memopad-multios',
  'electron.app.MyMemoPad',
  'electron.app.my-memopad-multios'
];

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Installed builds are always single-instance. --multi is for unpackaged testing only.
const allowMultipleInstances =
  !app.isPackaged &&
  (process.argv.includes('--multi') ||
    ['1', 'true', 'yes'].includes(String(process.env.MyMemoPad_MULTI || '').toLowerCase()));

let gotSingleInstanceLock = true;
if (allowMultipleInstances) {
  const baseUserData = app.getPath('userData');
  app.setPath('userData', `${baseUserData}-pid-${process.pid}`);
} else {
  gotSingleInstanceLock = app.requestSingleInstanceLock({ appId: APP_ID });
  if (!gotSingleInstanceLock) {
    app.exit(0);
    process.exit(0);
  }
}

const startInTray = process.argv.some((arg) => arg.toLowerCase() === STARTUP_ARG);

/** @type {Map<string, { win: Electron.BrowserWindow, isHost: boolean, sourceIndex: number, empty: boolean }>} */
const pads = new Map();
/** @type {Electron.BrowserWindow | null} */
let listWindow = null;
/** @type {Electron.BrowserWindow | null} */
let settingsWindow = null;
/** @type {{ ownerWin: Electron.BrowserWindow | null, context: object, committed: boolean } | null} */
let settingsSession = null;
/** @type {Electron.Tray | null} */
let appTray = null;
let nextPadId = 1;
let hostPadId = null;
let isQuitting = false;
let trayHideHintShown = false;

function assetPath(...parts) {
  return path.join(__dirname, '..', ...parts);
}

function getAppIconPath() {
  const resources = process.resourcesPath || '';
  const candidates = [
    assetPath('asset', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(resources, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(resources, 'icons', '256x256.png'),
    assetPath('asset', 'icon-256.png'),
    assetPath('src', 'favicon.png')
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || undefined;
}

function getTrayIcon() {
  const file = getAppIconPath();
  if (!file) return nativeImage.createEmpty();
  const image = nativeImage.createFromPath(file);
  return process.platform === 'win32' ? image.resize({ width: 16, height: 16 }) : image;
}

function isKoreanLocale() {
  try {
    return store.loadSettings().language !== 'en';
  } catch {
    return true;
  }
}

function uiFile() {
  return path.join(__dirname, '..', 'src', 'index.html');
}

function readInstallerOptions() {
  const candidates = [
    path.join(process.resourcesPath || '', 'installer-options.json'),
    path.join(path.dirname(process.execPath), 'resources', 'installer-options.json'),
    path.join(path.dirname(process.execPath), 'installer-options.json')
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function refreshAutoStartCommand() {
  const current = app.getLoginItemSettings();
  const installer = app.isPackaged ? readInstallerOptions() : null;
  if (current.openAtLogin || installer?.autoStart) {
    applyAutoStart(true);
  }
}

function writeWindowsRunKey(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  if (enabled) {
    spawnSync(
      'reg',
      [
        'add',
        WINDOWS_RUN_KEY,
        '/v',
        APP_NAME,
        '/t',
        'REG_SZ',
        '/d',
        `"${process.execPath}" ${STARTUP_ARG}`,
        '/f'
      ],
      { windowsHide: true }
    );
  } else {
    spawnSync('reg', ['delete', WINDOWS_RUN_KEY, '/v', APP_NAME, '/f'], { windowsHide: true });
  }
}

function removeDuplicateWindowsRunKeys() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  for (const name of WINDOWS_RUN_DUPLICATES) {
    spawnSync('reg', ['delete', WINDOWS_RUN_KEY, '/v', name, '/f'], { windowsHide: true });
  }
}

function applyAutoStart(enabled) {
  const settings = {
    openAtLogin: Boolean(enabled),
    openAsHidden: true,
    args: [STARTUP_ARG]
  };
  if (!app.isPackaged) {
    settings.path = process.execPath;
    settings.args = [path.resolve(__dirname, '..'), STARTUP_ARG];
  }
  app.setLoginItemSettings(settings);
  writeWindowsRunKey(enabled);
  removeDuplicateWindowsRunKeys();
  return app.getLoginItemSettings().openAtLogin || (enabled && app.isPackaged);
}

function broadcast(channel, payload, { skipSettings = false } = {}) {
  for (const rec of pads.values()) {
    if (!rec.win.isDestroyed()) {
      rec.win.webContents.send(channel, payload);
    }
  }
  if (listWindow && !listWindow.isDestroyed()) {
    listWindow.webContents.send(channel, payload);
  }
  if (!skipSettings && settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(channel, payload);
  }
}

function broadcastMemos() {
  broadcast('memos:changed', store.loadMemos());
}

function sendToOwner(channel, payload) {
  const owner = settingsSession?.ownerWin;
  if (owner && !owner.isDestroyed()) {
    owner.webContents.send(channel, payload);
  }
}

function createSettingsWindow(ownerWin, context) {
  settingsSession = {
    ownerWin: ownerWin && !ownerWin.isDestroyed() ? ownerWin : null,
    context,
    committed: false
  };

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:load', context);
    fitSettingsWindowHeight(settingsWindow).then(() => showWindow(settingsWindow));
    return settingsWindow;
  }

  const pos = offsetFrom(ownerWin, 40, 20);
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 480,
    minWidth: 420,
    minHeight: 240,
    useContentSize: true,
    x: pos.x,
    y: pos.y,
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    parent: ownerWin && !ownerWin.isDestroyed() ? ownerWin : undefined,
    modal: false,
    icon: getAppIconPath(),
    backgroundColor: '#F0F0F0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(uiFile(), {
    query: { role: 'settings', lang: store.loadSettings().language }
  });

  settingsWindow.webContents.once('did-finish-load', async () => {
    settingsWindow.webContents.send('settings:load', settingsSession?.context || context);
    await new Promise((resolve) => setTimeout(resolve, 160));
    await fitSettingsWindowHeight(settingsWindow);
    showWindow(settingsWindow);
  });

  settingsWindow.on('close', () => {
    if (settingsSession && !settingsSession.committed) {
      sendToOwner('settings:command', { type: 'cancel', snapshot: settingsSession.context });
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    settingsSession = null;
  });

  return settingsWindow;
}

async function fitSettingsWindowHeight(win, measuredHeight) {
  if (!win || win.isDestroyed()) return;
  try {
    let needed = Number(measuredHeight);
    if (!Number.isFinite(needed) || needed < 200) {
      needed = await win.webContents.executeJavaScript(`
        (() => {
          const root = document.getElementById('view-settings');
          const form = document.getElementById('settings-form');
          const bar = document.getElementById('settings-toolbar');
          if (!root || root.hidden || !form) return 0;
          const barH = bar ? bar.offsetHeight : 32;
          const cs = getComputedStyle(form);
          let inner = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
          for (const el of form.children) {
            const s = getComputedStyle(el);
            if (el.hidden || s.display === 'none') continue;
            inner += el.offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
          }
          return Math.ceil(barH + inner);
        })()
      `);
    }
    if (!Number.isFinite(needed) || needed < 200) return;
    const display = screen.getDisplayMatching(win.getBounds());
    const work = display.workAreaSize.height;
    const [contentWidth] = win.getContentSize();
    const height = Math.min(needed + 2, work - 24);
    win.setMinimumSize(420, 240);
    win.setMaximumSize(2000, work);
    win.setContentSize(contentWidth, height);
    win.setMinimumSize(420, height);
    win.setMaximumSize(2000, height);
  } catch {
    /* keep default size */
  }
}

function resolveSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function findPadByWindow(win) {
  for (const [id, rec] of pads) {
    if (rec.win === win) return { id, rec };
  }
  return null;
}

function findPadByIndex(index) {
  if (index < 0) return null;
  for (const [id, rec] of pads) {
    if (rec.sourceIndex === index && !rec.win.isDestroyed()) {
      return { id, rec };
    }
  }
  return null;
}

function findEmptyVisiblePad() {
  for (const [id, rec] of pads) {
    if (!rec.win.isDestroyed() && rec.win.isVisible() && rec.sourceIndex < 0 && rec.empty) {
      return { id, rec };
    }
  }
  return null;
}

function showWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function offsetFrom(win, dx, dy) {
  if (!win || win.isDestroyed()) {
    return { x: undefined, y: undefined };
  }
  const [x, y] = win.getPosition();
  return { x: x + dx, y: y + dy };
}

function createPadWindow({
  sourceIndex = -1,
  html = '',
  file = null,
  look = null,
  offsetWin = null,
  offset = { x: 30, y: 30 },
  show = true
} = {}) {
  const id = String(nextPadId++);
  const pos = offsetFrom(offsetWin, offset.x, offset.y);
  const win = new BrowserWindow({
    width: 428,
    height: 406,
    minWidth: 320,
    minHeight: 280,
    x: pos.x,
    y: pos.y,
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    icon: getAppIconPath(),
    backgroundColor: '#F8E18C',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setMenuBarVisibility(false);
  const isHost = hostPadId == null;
  if (isHost) hostPadId = id;

  pads.set(id, {
    win,
    isHost,
    sourceIndex,
    empty: !html || !String(html).replace(/<[^>]+>/g, '').trim(),
    html: html || '',
    look: look || null
  });

  win.loadFile(uiFile(), {
    query: { role: 'pad', id, lang: store.loadSettings().language }
  });

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('pad:load', {
      id,
      sourceIndex,
      html,
      file,
      look: look || store.getLook(sourceIndex, store.loadMemos().length),
      settings: store.loadSettings()
    });
    if (show) showWindow(win);
  });

  win.on('close', (event) => {
    const rec = pads.get(id);
    if (rec) persistPadRecord(rec);
    if (isQuitting) return;
    if (rec?.isHost) {
      event.preventDefault();
      win.hide();
      maybeHintTray();
    }
  });

  win.on('closed', () => {
    pads.delete(id);
    if (hostPadId === id) hostPadId = null;
  });

  return { id, win };
}

function createListWindow({ show = true } = {}) {
  if (listWindow && !listWindow.isDestroyed()) {
    if (show) showWindow(listWindow);
    return listWindow;
  }

  listWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 400,
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    icon: getAppIconPath(),
    backgroundColor: '#F8E18C',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  listWindow.setMenuBarVisibility(false);
  listWindow.loadFile(uiFile(), {
    query: { role: 'list', lang: store.loadSettings().language }
  });

  listWindow.webContents.once('did-finish-load', () => {
    listWindow.webContents.send('settings:changed', store.loadSettings());
    listWindow.webContents.send('memos:changed', store.loadMemos());
    if (show) showWindow(listWindow);
  });

  listWindow.on('closed', () => {
    listWindow = null;
  });

  return listWindow;
}

function persistPadRecord(rec) {
  if (!rec || !rec.html) return;
  const result = store.upsertMemo(rec.sourceIndex, rec.sourceMemo, rec.html);
  rec.sourceIndex = result.sourceIndex;
  rec.sourceMemo = result.sourceMemo;
  rec.empty = !String(rec.html).replace(/<[^>]+>/g, '').trim();
  if (result.sourceIndex >= 0 && rec.look) {
    store.setLook(result.sourceIndex, rec.look, result.items.length);
  }
  if (result.updated || result.sourceIndex >= 0) {
    broadcastMemos();
  }
}

function maybeHintTray() {
  if (trayHideHintShown || !appTray) return;
  trayHideHintShown = true;
  try {
    appTray.displayBalloon?.({
      title: APP_NAME,
      content: isKoreanLocale()
        ? '트레이에서 계속 실행 중입니다. 종료는 트레이 메뉴의 “종료”를 사용하세요.'
        : 'Still running in the system tray. Use Exit in the tray menu to quit.'
    });
  } catch {
    /* balloon is Windows-only */
  }
}

function showList() {
  createListWindow({ show: true });
}

function openMemoByIndex(index) {
  const memos = store.loadMemos();
  if (index < 0 || index >= memos.length) return false;

  const existing = findPadByIndex(index);
  if (existing) {
    showWindow(existing.rec.win);
    existing.rec.win.webContents.send('pad:load', {
      id: existing.id,
      sourceIndex: index,
      html: memos[index],
      look: store.getLook(index, memos.length),
      settings: store.loadSettings()
    });
    return true;
  }

  const empty = findEmptyVisiblePad();
  const look = store.getLook(index, memos.length);
  if (empty) {
    empty.rec.sourceIndex = index;
    empty.rec.empty = false;
    showWindow(empty.rec.win);
    empty.rec.win.webContents.send('pad:load', {
      id: empty.id,
      sourceIndex: index,
      html: memos[index],
      look,
      settings: store.loadSettings()
    });
    return true;
  }

  const host = hostPadId ? pads.get(hostPadId) : null;
  createPadWindow({
    sourceIndex: index,
    html: memos[index],
    look,
    offsetWin: host?.win,
    offset: { x: -30, y: -30 },
    show: true
  });
  return true;
}

function openBlankMemo(fromWin) {
  createPadWindow({
    sourceIndex: -1,
    html: '',
    look: store.getLook(-1, store.loadMemos().length),
    offsetWin: fromWin,
    offset: { x: 30, y: 30 },
    show: true
  });
}

function openExternalText(filePath, fromWin) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: 'missing' };
  }
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, error: 'failed' };
  }

  const ext = path.extname(filePath).toLowerCase();
  createPadWindow({
    sourceIndex: -1,
    html: '',
    file: { ext, content },
    look: { ...store.getLook(-1, store.loadMemos().length), transparencyPercent: 0 },
    offsetWin: fromWin,
    offset: { x: -30, y: -30 },
    show: true
  });
  return { ok: true };
}

function quitApplication() {
  isQuitting = true;
  try {
    if (appTray) {
      appTray.destroy();
      appTray = null;
    }
  } catch {
    /* ignore */
  }
  app.quit();
}

function buildTrayMenu() {
  const ko = isKoreanLocale();
  return Menu.buildFromTemplate([
    {
      label: ko ? '메모 목록 열기' : 'Open memo list',
      click: () => showList()
    },
    { type: 'separator' },
    {
      label: ko ? '종료' : 'Exit',
      click: () => quitApplication()
    }
  ]);
}

function createTray() {
  if (appTray) return appTray;
  try {
    appTray = new Tray(getTrayIcon());
  } catch (err) {
    console.error('[tray] failed to create tray icon:', err);
    return null;
  }
  appTray.setToolTip(isKoreanLocale() ? '메모 패드' : 'Memo Pad');
  appTray.setContextMenu(buildTrayMenu());
  appTray.on('click', () => {
    if (process.platform === 'darwin') return;
    showList();
  });
  appTray.on('double-click', () => showList());
  appTray.on('right-click', () => {
    appTray?.setContextMenu(buildTrayMenu());
    appTray?.popUpContextMenu();
  });
  return appTray;
}

function rebuildTray() {
  if (!appTray) return;
  appTray.setToolTip(isKoreanLocale() ? '메모 패드' : 'Memo Pad');
  appTray.setContextMenu(buildTrayMenu());
}

function showExistingHost() {
  const host = hostPadId ? pads.get(hostPadId) : null;
  if (host?.win && !host.win.isDestroyed()) {
    showWindow(host.win);
    return;
  }
  for (const rec of pads.values()) {
    if (rec.win && !rec.win.isDestroyed()) {
      showWindow(rec.win);
      return;
    }
  }
  if (listWindow && !listWindow.isDestroyed()) {
    showWindow(listWindow);
  }
}

function focusExistingInstance(argv = []) {
  const args = argv.slice(1);
  if (args.some((a) => String(a).toLowerCase() === STARTUP_ARG)) {
    return;
  }
  const openIndex = parseArgValue(args, '--open-index');
  const openFile = parseArgValue(args, '--open-file');
  if (openFile) {
    openExternalText(openFile, hostPadId ? pads.get(hostPadId)?.win : null);
    return;
  }
  if (openIndex != null && /^\d+$/.test(openIndex)) {
    openMemoByIndex(Number(openIndex));
    return;
  }
  if (args.includes('--list')) {
    showList();
    return;
  }
  if (args.includes('--new')) {
    openBlankMemo(hostPadId ? pads.get(hostPadId)?.win : null);
    return;
  }
  showExistingHost();
}

function parseArgValue(args, name) {
  const i = args.findIndex((a) => String(a).toLowerCase() === name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return null;
}

if (gotSingleInstanceLock) {
  app.on('second-instance', (_event, argv) => {
    focusExistingInstance(argv);
  });
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    app.exit(0);
    return;
  }
  refreshAutoStartCommand();
  createTray();
  createPadWindow({ show: !startInTray });
  if (!startInTray) {
    /* empty pad is the default launch, matching MemoPadV10 */
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPadWindow({ show: true });
    } else {
      showList();
    }
  });
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
  // Stay alive in the tray on every platform.
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.handle('app:getInfo', () => ({
  name: APP_NAME,
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  language: store.loadSettings().language
}));

ipcMain.handle('app:quit', () => {
  quitApplication();
});

ipcMain.handle('clipboard:writeText', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('autostart:set', (_event, enabled) => applyAutoStart(enabled));

ipcMain.handle('window:minimize', (event) => {
  const win = resolveSenderWindow(event);
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.on('window:fitSettings', (event, height) => {
  const win = resolveSenderWindow(event);
  if (win && win === settingsWindow) {
    fitSettingsWindowHeight(win, height);
  }
});

ipcMain.handle('window:close', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return;
  if (win === settingsWindow || win === listWindow) {
    win.close();
    return;
  }
  const found = findPadByWindow(win);
  if (found?.rec.isHost) {
    win.hide();
    maybeHintTray();
    return;
  }
  win.close();
});

ipcMain.handle('window:setOpacity', (event, opacity) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return 1;
  const value = Math.min(1, Math.max(0.15, Number(opacity)));
  if (!Number.isFinite(value)) return win.getOpacity();
  win.setOpacity(value);
  return win.getOpacity();
});

/** @type {{ win: Electron.BrowserWindow, offsetX: number, offsetY: number } | null} */
let windowMoveDrag = null;

ipcMain.on('window:beginDrag', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) {
    windowMoveDrag = null;
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  windowMoveDrag = { win, offsetX: cursor.x - wx, offsetY: cursor.y - wy };
});

ipcMain.on('window:updateDrag', (event, screenX, screenY) => {
  const drag = windowMoveDrag;
  if (!drag?.win || drag.win.isDestroyed()) return;
  const senderWin = resolveSenderWindow(event);
  if (senderWin && senderWin !== drag.win) return;
  const cursor = screen.getCursorScreenPoint();
  const x = Number.isFinite(Number(screenX)) ? Number(screenX) : cursor.x;
  const y = Number.isFinite(Number(screenY)) ? Number(screenY) : cursor.y;
  drag.win.setPosition(Math.round(x - drag.offsetX), Math.round(y - drag.offsetY));
});

ipcMain.on('window:endDrag', () => {
  windowMoveDrag = null;
});

ipcMain.handle('memos:get', () => store.loadMemos());

ipcMain.handle('memos:save', (_event, items) => {
  const list = store.saveMemos(items);
  broadcastMemos();
  return list;
});

ipcMain.handle('settings:get', () => store.loadSettings());

ipcMain.handle('settings:save', (_event, data) => {
  const next = store.saveSettings(data);
  broadcast('settings:changed', next);
  broadcast('settings:language', next.language);
  rebuildTray();
  return next;
});

ipcMain.handle('look:get', (_event, index) => store.getLook(Number(index), store.loadMemos().length));

ipcMain.handle('look:set', (_event, index, look) => {
  store.setLook(Number(index), look, store.loadMemos().length);
  return store.getLook(Number(index), store.loadMemos().length);
});

ipcMain.handle('look:remove', (_event, index) => {
  store.removeLookAt(Number(index));
  return true;
});

ipcMain.handle('pad:openNew', (event) => {
  openBlankMemo(resolveSenderWindow(event));
});

ipcMain.handle('settings:open', (event, context) => {
  createSettingsWindow(resolveSenderWindow(event), context || {});
});

ipcMain.handle('settings:getContext', () => settingsSession?.context || null);

ipcMain.on('settings:command', (event, cmd) => {
  if (!cmd || typeof cmd !== 'object') return;
  if (cmd.type === 'commit') {
    if (settingsSession) settingsSession.committed = true;
    if (cmd.look?.editorBackColor) {
      store.saveSettings({
        ...(cmd.settings || {}),
        editorBackColor: cmd.look.editorBackColor,
        formBackColor: cmd.look.formBackColor || cmd.look.editorBackColor
      });
      store.applyBackColorToAllLooks(cmd.look.editorBackColor);
      broadcast('settings:previewColor', cmd.look.editorBackColor, { skipSettings: true });
      broadcast('settings:changed', store.loadSettings());
    }
    sendToOwner('settings:command', cmd);
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
    return;
  }
  if (cmd.type === 'cancel') {
    sendToOwner('settings:command', {
      type: 'cancel',
      snapshot: settingsSession?.context || cmd.snapshot
    });
    broadcast('settings:restoreLooks', undefined, { skipSettings: true });
    if (settingsSession) settingsSession.committed = true;
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
    return;
  }
  sendToOwner('settings:command', cmd);
  if (cmd.type === 'previewColor') {
    broadcast('settings:previewColor', cmd.color, { skipSettings: true });
  }
  if (cmd.type === 'language') {
    broadcast('settings:language', cmd.language);
  }
});

ipcMain.handle('pad:openIndex', (_event, index) => openMemoByIndex(Number(index)));

ipcMain.handle('pad:openFile', async (event) => {
  const win = resolveSenderWindow(event);
  const result = await dialog.showOpenDialog(win || undefined, {
    title: isKoreanLocale() ? '텍스트 파일 불러오기' : 'Open a text file',
    filters: [
      { name: isKoreanLocale() ? '텍스트 파일' : 'Text files', extensions: ['txt', 'rtf', 'html', 'md'] },
      { name: isKoreanLocale() ? '모든 파일' : 'All files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  return openExternalText(result.filePaths[0], win);
});

ipcMain.handle('list:show', () => {
  showList();
});

ipcMain.handle('pad:hide', (event) => {
  const win = resolveSenderWindow(event);
  if (win && !win.isDestroyed()) win.hide();
});

ipcMain.handle('pad:close', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return;
  const found = findPadByWindow(win);
  if (found?.rec.isHost) {
    win.hide();
    maybeHintTray();
    return;
  }
  win.close();
});

ipcMain.on('pad:state', (event, state) => {
  const win = resolveSenderWindow(event);
  const found = findPadByWindow(win);
  if (!found) return;
  if (state && typeof state === 'object') {
    if (typeof state.sourceIndex === 'number') found.rec.sourceIndex = state.sourceIndex;
    if (typeof state.empty === 'boolean') found.rec.empty = state.empty;
    if (typeof state.html === 'string') found.rec.html = state.html;
    if (typeof state.sourceMemo === 'string' || state.sourceMemo === null) {
      found.rec.sourceMemo = state.sourceMemo;
    }
    if (state.look && typeof state.look === 'object') found.rec.look = state.look;
  }
});

ipcMain.on('settings:previewColor', (_event, color) => {
  broadcast('settings:previewColor', color, { skipSettings: true });
});
