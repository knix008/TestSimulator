'use strict';

/**
 * MyClock — Electron 메인 프로세스.
 *
 * 창 구성 (legacy-wpf 의 WPF 창과 1:1 대응)
 *   clockWin  — MainWindow            : 테두리 없는 투명 탁상시계
 *   panelWin  — SidePanelWindow       : 시계 좌/우에 붙는 400px 설정 패널
 *   alarmWin  — AlarmNotificationWindow: 알람·타이머 팝업
 *   fullWin   — ScreensaverWindow      : 전체 화면 시계 (Windows .scr 대체)
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell
} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');

const APP_NAME = 'MyClock';
const APP_ID = 'com.shkwon.myclock';
const STARTUP_ARG = '--autostart';

const PANEL_WIDTH = 400;
const PANEL_HEIGHT = 560;
const DIGITAL_MIN_WIDTH = 140;
const DIGITAL_MIN_HEIGHT = 50;
const DIGITAL_AMPM_ROW = 28;
const ANALOG_MIN_WIDTH = 150;
const ANALOG_MIN_HEIGHT = 150;

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// WPF 판(MyClockWinV10)이 쓰는 폴더와 겹치지 않도록 별도 폴더를 쓴다.
// 겹쳐 쓰면 두 앱이 서로의 settings.json 을 덮어쓴다.
app.setPath('userData', path.join(app.getPath('appData'), 'MyClockMultiOS'));

// 설치본은 항상 단일 인스턴스. --multi 는 개발 중 테스트 전용.
const allowMultipleInstances =
  !app.isPackaged &&
  (process.argv.includes('--multi') ||
    ['1', 'true', 'yes'].includes(String(process.env.MYCLOCK_MULTI || '').toLowerCase()));

if (allowMultipleInstances) {
  app.setPath('userData', `${app.getPath('userData')}-pid-${process.pid}`);
} else if (!app.requestSingleInstanceLock({ appId: APP_ID })) {
  app.exit(0);
  process.exit(0);
}

const startInTray = process.argv.some((arg) => arg.toLowerCase() === STARTUP_ARG);

/** @type {Electron.BrowserWindow | null} */ let clockWin = null;
/** @type {Electron.BrowserWindow | null} */ let panelWin = null;
/** @type {Electron.BrowserWindow | null} */ let alarmWin = null;
/** @type {Electron.BrowserWindow | null} */ let fullWin = null;
/** @type {Electron.BrowserWindow | null} */ let menuWin = null;
/** @type {Electron.Tray | null} */ let tray = null;

let isQuitting = false;
let panelOpensRight = true;
/** @type {NodeJS.Timeout | null} */ let gestureTimer = null;
/** @type {NodeJS.Timeout | null} */ let gestureGuard = null;

// ── 경로 helpers ────────────────────────────────────────────────────────

function assetPath(...parts) {
  return path.join(__dirname, '..', ...parts);
}

/**
 * 창 아이콘 경로.
 *
 * asar 안의 경로는 fs.existsSync 로는 존재해 보이지만 BrowserWindow 의 icon 옵션은
 * 읽지 못한다 (그러면 Electron 기본 아이콘이 그대로 남는다). 그래서 패키징본에서는
 * extraResources 로 풀어 둔 resources/ 쪽 실제 파일을 먼저 본다.
 */
function appIconPath() {
  const resources = process.resourcesPath || '';
  const unpacked = [
    path.join(resources, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(resources, 'icons', '256x256.png')
  ];
  const inRepo = [
    assetPath('asset', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    assetPath('asset', 'icon-256.png')
  ];
  const candidates = app.isPackaged ? [...unpacked, ...inRepo] : [...inRepo, ...unpacked];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || undefined;
}

// ── 시계 창 ─────────────────────────────────────────────────────────────

function minSizeFor(settings) {
  if (!settings.isDigital) return { width: ANALOG_MIN_WIDTH, height: ANALOG_MIN_HEIGHT };
  const canvasStyle = settings.digitalStyle === 'SevenSegment' || settings.digitalStyle === 'DotMatrix';
  const extra = !settings.use24h && canvasStyle ? DIGITAL_AMPM_ROW : 0;
  return { width: DIGITAL_MIN_WIDTH, height: DIGITAL_MIN_HEIGHT + extra };
}

function clampToWorkArea(bounds) {
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(bounds.y, area.y), area.y + area.height - height))
  };
}

function initialClockBounds(settings) {
  const width = Math.round(settings.windowWidth);
  const height = Math.round(settings.windowHeight);
  if (settings.windowLeft == null || settings.windowTop == null) {
    const area = screen.getPrimaryDisplay().workArea;
    return {
      width,
      height,
      x: Math.round(area.x + area.width - width - 40),
      y: Math.round(area.y + 40)
    };
  }
  return clampToWorkArea({
    width,
    height,
    x: Math.round(settings.windowLeft),
    y: Math.round(settings.windowTop)
  });
}

function createClockWindow() {
  const settings = store.loadSettings();
  const bounds = initialClockBounds(settings);
  const min = minSizeFor(settings);

  clockWin = new BrowserWindow({
    ...bounds,
    minWidth: min.width,
    minHeight: min.height,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: true,
    // 작업 표시줄에 앱 아이콘이 보이도록 한다. "트레이로 숨기기" 로 창을 감추면
    // 작업 표시줄에서도 함께 사라지고 트레이 아이콘만 남는다.
    skipTaskbar: false,
    title: APP_NAME,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: settings.alwaysOnTop,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  clockWin.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  clockWin.once('ready-to-show', () => {
    if (!startInTray) clockWin.show();
  });

  clockWin.on('move', onClockGeometryChanged);
  clockWin.on('resize', onClockGeometryChanged);

  clockWin.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });

  clockWin.on('closed', () => {
    clockWin = null;
  });
}

function onClockGeometryChanged() {
  if (!clockWin || clockWin.isDestroyed()) return;
  positionPanel();
  clockWin.webContents.send('clock:bounds', clockWin.getBounds());
}

// ── 설정 패널 창 ────────────────────────────────────────────────────────

function panelBoundsFor(openRight) {
  const clock = clockWin.getBounds();
  const display = screen.getDisplayMatching(clock) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const height = Math.min(PANEL_HEIGHT, area.height);
  let y = clock.y;
  if (y + height > area.y + area.height) y = Math.max(area.y, area.y + area.height - height);
  const x = openRight ? clock.x + clock.width : clock.x - PANEL_WIDTH;
  return { x: Math.round(x), y: Math.round(y), width: PANEL_WIDTH, height: Math.round(height) };
}

/** 오른쪽 여백이 없으면 왼쪽으로 — WPF DetermineOpenRightAt 과 같은 규칙. */
function determineOpenRight(preferRight) {
  const clock = clockWin.getBounds();
  const display = screen.getDisplayMatching(clock) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const canRight = clock.x + clock.width + PANEL_WIDTH <= area.x + area.width;
  const canLeft = clock.x - PANEL_WIDTH >= area.x;
  return preferRight ? canRight || !canLeft : !canLeft;
}

function positionPanel() {
  if (!panelWin || panelWin.isDestroyed() || !clockWin || clockWin.isDestroyed()) return;
  panelOpensRight = determineOpenRight(panelOpensRight);
  panelWin.setBounds(panelBoundsFor(panelOpensRight));
  panelWin.webContents.send('panel:side', panelOpensRight);
}

function openPanel(tab) {
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.show();
    if (tab) panelWin.webContents.send('panel:tab', tab);
    return;
  }
  panelOpensRight = determineOpenRight(panelOpensRight);

  panelWin = new BrowserWindow({
    ...panelBoundsFor(panelOpensRight),
    frame: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    parent: clockWin,
    alwaysOnTop: clockWin.isAlwaysOnTop(),
    icon: appIconPath(),
    backgroundColor: '#1E1E2E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  panelWin.loadFile(path.join(__dirname, '..', 'src', 'panel.html'));

  panelWin.once('ready-to-show', () => {
    panelWin.showInactive();
    panelWin.webContents.send('panel:side', panelOpensRight);
    if (tab) panelWin.webContents.send('panel:tab', tab);
    clockWin?.webContents.send('panel:opened', true);
  });

  panelWin.on('closed', () => {
    panelWin = null;
    clockWin?.webContents.send('panel:opened', false);
  });
}

function closePanel() {
  if (panelWin && !panelWin.isDestroyed()) panelWin.close();
}

function togglePanel(tab) {
  if (panelWin && !panelWin.isDestroyed()) {
    if (tab) {
      panelWin.webContents.send('panel:tab', tab);
      panelWin.focus();
      return;
    }
    closePanel();
  } else {
    openPanel(tab);
  }
}

// ── 알람 팝업 ───────────────────────────────────────────────────────────

function showAlarmPopup(payload) {
  if (alarmWin && !alarmWin.isDestroyed()) alarmWin.close();

  const area = screen.getPrimaryDisplay().workArea;
  const width = 340;
  const height = 190;

  alarmWin = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 3),
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: appIconPath(),
    backgroundColor: '#1E1E2E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  alarmWin.loadFile(path.join(__dirname, '..', 'src', 'alarm.html'));
  alarmWin.once('ready-to-show', () => {
    alarmWin.show();
    alarmWin.webContents.send('alarm:show', payload);
  });
  alarmWin.on('closed', () => {
    alarmWin = null;
  });
}

// ── 컨텍스트 메뉴 창 ────────────────────────────────────────────────────
//
// 메뉴를 시계 창 안에 그리면 창 크기(작게는 140×50)에 잘린다.
// 별도 창으로 띄워야 창 밖으로 넘칠 수 있다.

function closeMenuWindow() {
  if (menuWin && !menuWin.isDestroyed()) menuWin.close();
  menuWin = null;
}

function openMenuWindow(payload) {
  closeMenuWindow();

  const cursor = screen.getCursorScreenPoint();

  menuWin = new BrowserWindow({
    // 내용 크기를 잰 뒤 menu:ready 에서 실제 크기로 바꾼다.
    width: 240,
    height: 200,
    x: cursor.x,
    y: cursor.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  menuWin.loadFile(path.join(__dirname, '..', 'src', 'menu.html'));
  menuWin.once('ready-to-show', () => {
    menuWin.webContents.send('menu:items', { ...payload, anchor: cursor });
  });
  menuWin.on('blur', () => closeMenuWindow());
  menuWin.on('closed', () => {
    menuWin = null;
    clockWin?.webContents.send('menu:closed');
  });

  menuWin.__anchor = cursor;
}

/** 메뉴가 잰 크기에 맞춰 창을 커서 옆에 놓고 보여준다 — 화면 밖으로 나가면 반대쪽으로 뒤집는다. */
function placeMenuWindow(size) {
  if (!menuWin || menuWin.isDestroyed()) return;

  const anchor = menuWin.__anchor || screen.getCursorScreenPoint();
  const area = (screen.getDisplayNearestPoint(anchor) || screen.getPrimaryDisplay()).workArea;
  const width = Math.max(80, Math.round(size?.width) || 240);
  const height = Math.max(40, Math.round(size?.height) || 200);

  let x = anchor.x;
  let y = anchor.y;
  if (x + width > area.x + area.width) x = anchor.x - width;
  if (y + height > area.y + area.height) y = anchor.y - height;
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);

  menuWin.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
  menuWin.show();
  menuWin.focus();
}

// ── 전체 화면 시계 (화면 보호기 대체) ──────────────────────────────────

function openFullscreenClock() {
  if (fullWin && !fullWin.isDestroyed()) {
    fullWin.focus();
    return;
  }
  fullWin = new BrowserWindow({
    fullscreen: true,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  fullWin.loadFile(path.join(__dirname, '..', 'src', 'fullscreen.html'));
  fullWin.on('closed', () => {
    fullWin = null;
  });
}

// ── 시스템 트레이 ───────────────────────────────────────────────────────

function createTray() {
  const iconPath = appIconPath();
  tray = new Tray(iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty());
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: () => restoreFromTray() },
      { label: '설정...', click: () => { restoreFromTray(); togglePanel(); } },
      { type: 'separator' },
      { label: '종료', click: () => quitApp() }
    ])
  );
  tray.on('double-click', () => restoreFromTray());
  tray.on('click', () => {
    if (process.platform !== 'win32') restoreFromTray();
  });
}

function hideToTray() {
  closePanel();
  clockWin?.hide();
}

function restoreFromTray() {
  if (!clockWin || clockWin.isDestroyed()) return;
  if (clockWin.isMinimized()) clockWin.restore();
  clockWin.show();
  clockWin.focus();
}

function quitApp() {
  isQuitting = true;
  clockWin?.webContents.send('app:before-quit');
  // 렌더러가 마지막 설정을 저장할 짧은 여유를 준다.
  setTimeout(() => app.quit(), 120);
}

// ── 자동 실행 (플랫폼별) ────────────────────────────────────────────────

function linuxAutostartFile() {
  return path.join(os.homedir(), '.config', 'autostart', 'myclock.desktop');
}

function isStartupEnabled() {
  if (process.platform === 'linux') return fs.existsSync(linuxAutostartFile());
  return app.getLoginItemSettings({ args: [STARTUP_ARG] }).openAtLogin;
}

function setStartup(enable) {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    try {
      if (!enable) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return false;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const exec = process.env.APPIMAGE || process.execPath;
      fs.writeFileSync(
        file,
        [
          '[Desktop Entry]',
          'Type=Application',
          `Name=${APP_NAME}`,
          `Exec="${exec}" ${STARTUP_ARG}`,
          'Terminal=false',
          'X-GNOME-Autostart-enabled=true',
          ''
        ].join('\n'),
        'utf8'
      );
      return true;
    } catch {
      return false;
    }
  }
  app.setLoginItemSettings({
    openAtLogin: enable,
    args: [STARTUP_ARG],
    path: process.execPath
  });
  return isStartupEnabled();
}

// ── 창 드래그 / 리사이즈 (투명 창에서도 안정적으로 동작) ────────────────

function stopGesture() {
  if (gestureTimer) {
    clearInterval(gestureTimer);
    gestureTimer = null;
  }
  if (gestureGuard) {
    clearTimeout(gestureGuard);
    gestureGuard = null;
  }
}

/**
 * 렌더러가 제스처 종료를 알리지 못하는 경우(포커스 상실 등)에도
 * 창이 커서에 붙어 다니지 않도록, 마우스 버튼이 떼어지면 스스로 멈춘다.
 */
function armGestureGuard() {
  gestureGuard = setTimeout(() => {
    gestureGuard = null;
    stopGesture();
  }, 30000);
}

function startDrag() {
  if (!clockWin || clockWin.isDestroyed()) return;
  stopGesture();
  const start = screen.getCursorScreenPoint();
  const bounds = clockWin.getBounds();
  const dx = start.x - bounds.x;
  const dy = start.y - bounds.y;

  armGestureGuard();
  gestureTimer = setInterval(() => {
    if (!clockWin || clockWin.isDestroyed()) return stopGesture();
    const p = screen.getCursorScreenPoint();
    const current = clockWin.getBounds();
    clockWin.setBounds({
      x: p.x - dx,
      y: p.y - dy,
      width: current.width,
      height: current.height
    });
  }, 12);
}

function startResize() {
  if (!clockWin || clockWin.isDestroyed()) return;
  stopGesture();
  const bounds = clockWin.getBounds();
  const start = screen.getCursorScreenPoint();
  const gripDx = bounds.x + bounds.width - start.x;
  const gripDy = bounds.y + bounds.height - start.y;
  const [minW, minH] = clockWin.getMinimumSize();

  armGestureGuard();
  gestureTimer = setInterval(() => {
    if (!clockWin || clockWin.isDestroyed()) return stopGesture();
    const p = screen.getCursorScreenPoint();
    const current = clockWin.getBounds();
    clockWin.setBounds({
      x: current.x,
      y: current.y,
      width: Math.max(minW, Math.round(p.x + gripDx - current.x)),
      height: Math.max(minH, Math.round(p.y + gripDy - current.y))
    });
  }, 12);
}

// ── IPC ─────────────────────────────────────────────────────────────────

function registerIpc() {
  ipcMain.handle('settings:load', () => store.loadSettings());
  ipcMain.handle('settings:save', (_e, patch) => store.saveSettings(patch));
  ipcMain.handle('settings:reset', () => {
    const fresh = store.defaults();
    return store.saveSettings(fresh);
  });
  ipcMain.handle('settings:default-cities', () => store.DEFAULT_WORLD_CITIES);

  ipcMain.handle('events:load', () => store.loadEvents());
  ipcMain.handle('events:save', (_e, events) => store.saveEvents(events));

  ipcMain.handle('startup:get', () => isStartupEnabled());
  ipcMain.handle('startup:set', (_e, enable) => setStartup(enable === true));

  ipcMain.handle('clock:get-bounds', () => (clockWin && !clockWin.isDestroyed() ? clockWin.getBounds() : null));

  ipcMain.on('window:drag-start', startDrag);
  ipcMain.on('window:resize-start', startResize);
  ipcMain.on('window:gesture-end', stopGesture);

  ipcMain.on('window:minimize', () => clockWin?.minimize());
  ipcMain.on('window:hide-to-tray', () => hideToTray());
  ipcMain.on('window:toggle-maximize', () => {
    if (!clockWin || clockWin.isDestroyed()) return;
    if (clockWin.isMaximized()) clockWin.unmaximize();
    else clockWin.maximize();
  });
  ipcMain.handle('window:is-maximized', () => !!clockWin && !clockWin.isDestroyed() && clockWin.isMaximized());

  ipcMain.on('window:set-always-on-top', (_e, onTop) => {
    clockWin?.setAlwaysOnTop(onTop === true);
    panelWin?.setAlwaysOnTop(onTop === true);
  });

  ipcMain.on('window:set-min-size', (_e, size) => {
    if (!clockWin || clockWin.isDestroyed() || !size) return;
    const width = Math.max(80, Math.round(Number(size.width) || DIGITAL_MIN_WIDTH));
    const height = Math.max(40, Math.round(Number(size.height) || DIGITAL_MIN_HEIGHT));
    clockWin.setMinimumSize(width, height);
    const b = clockWin.getBounds();
    if (b.width < width || b.height < height) {
      clockWin.setBounds({ ...b, width: Math.max(b.width, width), height: Math.max(b.height, height) });
    }
  });

  ipcMain.on('window:set-size', (_e, size) => {
    if (!clockWin || clockWin.isDestroyed() || !size) return;
    const b = clockWin.getBounds();
    const [minW, minH] = clockWin.getMinimumSize();
    const wanted = { width: Number(size.width) || b.width, height: Number(size.height) || b.height };
    if (wanted.width < minW || wanted.height < minH) {
      wanted.width = Math.max(wanted.width, minW);
      wanted.height = Math.max(wanted.height, minH);
    }
    const next = clampToWorkArea({
      x: Number.isFinite(size.x) ? Math.round(size.x) : b.x,
      y: Number.isFinite(size.y) ? Math.round(size.y) : b.y,
      width: Math.round(wanted.width),
      height: Math.round(wanted.height)
    });
    clockWin.setBounds(next);
  });

  ipcMain.on('panel:toggle', (_e, tab) => togglePanel(tab));
  ipcMain.on('panel:close', () => closePanel());
  ipcMain.handle('panel:is-open', () => !!panelWin && !panelWin.isDestroyed());

  ipcMain.on('menu:open', (_e, payload) => openMenuWindow(payload || { items: [] }));
  ipcMain.on('menu:ready', (_e, size) => placeMenuWindow(size));
  ipcMain.on('menu:choose', (_e, id) => {
    closeMenuWindow();
    clockWin?.webContents.send('menu:action', id);
  });
  ipcMain.on('menu:close', () => closeMenuWindow());

  ipcMain.on('alarm:show', (_e, payload) => showAlarmPopup(payload));
  ipcMain.on('alarm:dismiss', () => alarmWin?.close());

  ipcMain.on('fullscreen:open', () => openFullscreenClock());
  ipcMain.on('fullscreen:close', () => fullWin?.close());

  ipcMain.on('tray:icon', (_e, dataUrl) => {
    if (!tray || tray.isDestroyed() || typeof dataUrl !== 'string') return;
    try {
      const image = nativeImage.createFromDataURL(dataUrl);
      if (!image.isEmpty()) tray.setImage(image);
    } catch {
      /* 아이콘 갱신 실패는 무시 */
    }
  });
  ipcMain.on('tray:tooltip', (_e, text) => {
    if (tray && !tray.isDestroyed() && typeof text === 'string') tray.setToolTip(`${APP_NAME} — ${text}`);
  });

  ipcMain.on('app:quit', () => quitApp());
  ipcMain.on('shell:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // 시계 렌더러 ↔ 패널 렌더러 중계
  ipcMain.on('relay:to-clock', (_e, message) => clockWin?.webContents.send('from-panel', message));
  ipcMain.on('relay:to-panel', (_e, message) => {
    panelWin?.webContents.send('from-clock', message);
    fullWin?.webContents.send('from-clock', message);
  });
}

// ── 앱 수명주기 ─────────────────────────────────────────────────────────

app.on('second-instance', () => restoreFromTray());

app.whenReady().then(() => {
  // 처음 실행이면 WPF 판 설정을 한 번만 읽어온다 (원본은 그대로 둔다).
  const migrated = store.migrateFromWpfIfNeeded();
  if (migrated) {
    console.log(
      `[migrate] WPF settings imported (settings=${migrated.settings}, events=${migrated.events})`
    );
  }

  registerIpc();
  createClockWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createClockWindow();
    else restoreFromTray();
  });
});

app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopGesture();
});
