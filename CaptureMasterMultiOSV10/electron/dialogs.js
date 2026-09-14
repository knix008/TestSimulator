// Dialog windows.
//
// Every popup (settings, about, errors, progress, print, source picker, the
// region-selection overlay, the recording controller …) is its own OS window:
// it can be moved anywhere, sits beside the main window rather than blocking
// it, and is still torn down with it. All of them load the same bundle with
// `#dialog=<name>` selecting which dialog fills the window (src/DialogHost.jsx).
//
// Names may carry an instance suffix (`error#3`) so several copies of one
// dialog can be open; the part before `#` selects the size and the component.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const state = require('./state');

/** @type {Map<string, {win: BrowserWindow, payload: any, openerId: number|null, submitted: boolean}>} */
const dialogWindows = new Map();

const DIALOG_SPECS = {
  settings: { width: 820, height: 680, minWidth: 640, minHeight: 480 },
  about: { width: 600, height: 560, minWidth: 480, minHeight: 420 },
  error: { width: 660, height: 460, minWidth: 420, minHeight: 300 },
  progress: { width: 480, height: 190, resizable: false },
  confirm: { width: 520, height: 230, resizable: false },
  prompt: { width: 560, height: 230, resizable: false },
  print: { width: 640, height: 600, minWidth: 520, minHeight: 440 },
  sources: { width: 920, height: 660, minWidth: 600, minHeight: 420 },
  recent: { width: 680, height: 500, minWidth: 480, minHeight: 320 },
  recorder: { width: 320, height: 96, resizable: false, alwaysOnTop: true, skipTaskbar: true, place: 'top-right', detached: true },
  region: { overlay: true },
};

function baseName(name) { return String(name).split('#')[0]; }

function dialogUrl(name) {
  if (process.env.ELECTRON_DEV === '1') return 'http://localhost:5184/#dialog=' + encodeURIComponent(name);
  return { file: path.join(__dirname, '..', 'dist', 'index.html'), hash: 'dialog=' + encodeURIComponent(name) };
}

function displayFor(payload, opener) {
  const displays = screen.getAllDisplays();
  if (payload && payload.displayId != null) {
    const d = displays.find((x) => String(x.id) === String(payload.displayId));
    if (d) return d;
  }
  if (opener && !opener.isDestroyed()) return screen.getDisplayMatching(opener.getBounds());
  return screen.getPrimaryDisplay();
}

function openDialogWindow(name, payload, opener) {
  const existing = dialogWindows.get(name);
  if (existing && !existing.win.isDestroyed()) {
    existing.payload = payload;
    existing.submitted = false;
    existing.win.webContents.send('dialog:payload', payload);
    existing.win.show();
    existing.win.focus();
    return true;
  }

  const spec = DIALOG_SPECS[baseName(name)] || { width: 640, height: 520, resizable: true };
  const appearance = (payload && payload.appearance) || {};
  const bg = typeof appearance.bg === 'string' ? appearance.bg : '#12161c';
  const parentOk = opener && !opener.isDestroyed();

  let bounds;
  if (spec.overlay) {
    // The region picker covers exactly one display, on top of everything.
    const d = displayFor(payload, opener);
    bounds = { ...d.bounds };
  } else {
    const width = spec.width;
    const height = spec.height;
    if (spec.place === 'top-right') {
      const d = displayFor(payload, opener);
      bounds = { x: d.workArea.x + d.workArea.width - width - 24, y: d.workArea.y + 24, width, height };
    } else if (parentOk) {
      const pb = opener.getBounds();
      bounds = { x: Math.round(pb.x + (pb.width - width) / 2), y: Math.round(pb.y + (pb.height - height) / 2), width, height };
    } else {
      bounds = { width, height };
    }
  }

  const win = new BrowserWindow({
    ...bounds,
    minWidth: spec.overlay ? undefined : (spec.minWidth || 320),
    minHeight: spec.overlay ? undefined : (spec.minHeight || 160),
    // A child of the main window: raised with it and destroyed with it. The
    // recording controller is detached so it stays visible while the main
    // window is minimised for the recording.
    parent: parentOk && !spec.detached && !spec.overlay ? opener : undefined,
    modal: false,
    resizable: !spec.overlay && spec.resizable !== false,
    movable: !spec.overlay,
    minimizable: false,
    maximizable: !spec.overlay && spec.resizable !== false,
    fullscreenable: false,
    alwaysOnTop: !!spec.alwaysOnTop || !!spec.overlay,
    skipTaskbar: !!spec.skipTaskbar || !!spec.overlay,
    hasShadow: !spec.overlay,
    enableLargerThanScreen: !!spec.overlay,
    show: false,
    frame: false,
    backgroundColor: spec.overlay ? '#000000' : bg,
    title: (payload && payload.title) || 'CaptureMaster',
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  dialogWindows.set(name, { win, payload, openerId: parentOk ? opener.id : null, submitted: false });

  if (!require('electron').app.isPackaged) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const tag = ['debug', 'info', 'warn', 'error'][level] || 'log';
      console.log(`[dialog:${name}:${tag}] ${message}  (${sourceId}:${line})`);
    });
  }

  if (spec.overlay) {
    // Above full-screen apps and on every workspace; the overlay must sit on
    // top of whatever the user is about to clip.
    try { win.setAlwaysOnTop(true, 'screen-saver'); } catch { /* not every platform */ }
    try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch { /* ignore */ }
    win.setBounds(bounds);
  }

  const target = dialogUrl(name);
  if (typeof target === 'string') win.loadURL(target);
  else win.loadFile(target.file, { hash: target.hash });

  // Shown once the renderer has painted the payload (dialog:ready), so the
  // window never flashes empty — the region overlay in particular must appear
  // with the screenshot already in place. ready-to-show is only a fallback.
  const reveal = () => {
    if (win.isDestroyed() || win.isVisible()) return;
    if (spec.overlay) win.setBounds(bounds);
    win.show();
    if (spec.overlay) win.focus();
  };
  const entry = dialogWindows.get(name);
  entry.reveal = reveal;
  win.once('ready-to-show', () => setTimeout(reveal, spec.overlay ? 4000 : 1500));

  win.on('closed', () => {
    const entry = dialogWindows.get(name);
    dialogWindows.delete(name);
    // A dialog dismissed without an answer still resolves the opener's promise.
    const opener2 = entry && entry.openerId !== null ? BrowserWindow.fromId(entry.openerId) : null;
    if (opener2 && !opener2.isDestroyed()) {
      if (!entry.submitted) opener2.webContents.send('dialog:result', { name, data: null });
      opener2.webContents.send('dialog:closed', { name });
    }
  });
  return true;
}

/** Closes every open dialog window. Used when the application window closes. */
function closeAllDialogWindows() {
  for (const entry of [...dialogWindows.values()]) {
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  dialogWindows.clear();
}

/** Hides / shows every dialog together with the main window during a capture. */
function setDialogsVisible(visible) {
  for (const entry of dialogWindows.values()) {
    if (entry.win.isDestroyed()) continue;
    if (visible) { if (!entry.win.isVisible()) entry.win.showInactive(); }
    else entry.win.hide();
  }
}

function entryForSender(sender) {
  for (const [name, entry] of dialogWindows) {
    if (!entry.win.isDestroyed() && entry.win.webContents.id === sender.id) return { name, entry };
  }
  return null;
}

function registerDialogHandlers() {
  ipcMain.handle('dialog:openWindow', (event, { name, payload }) => {
    const opener = BrowserWindow.fromWebContents(event.sender) || state.mainWin;
    return openDialogWindow(name, payload, opener);
  });

  // A dialog window asks for the data it was opened with.
  ipcMain.handle('dialog:getPayload', (event) => {
    const found = entryForSender(event.sender);
    return found ? { name: found.name, payload: found.entry.payload } : null;
  });

  // The opener pushes fresh data (progress ticks, elapsed recording time …).
  ipcMain.handle('dialog:update', (_event, { name, payload }) => {
    const entry = dialogWindows.get(name);
    if (!entry || entry.win.isDestroyed()) return false;
    entry.payload = payload;
    entry.win.webContents.send('dialog:payload', payload);
    return true;
  });

  // …and a dialog reports the user's decision back to the window that opened it.
  ipcMain.handle('dialog:submit', (event, { name, data, keepOpen }) => {
    const entry = dialogWindows.get(name);
    if (!entry) return false;
    entry.submitted = !keepOpen ? true : entry.submitted;
    const opener = entry.openerId !== null ? BrowserWindow.fromId(entry.openerId) : state.mainWin;
    if (opener && !opener.isDestroyed()) opener.webContents.send('dialog:result', { name, data });
    return true;
  });

  ipcMain.handle('dialog:closeWindow', (_event, name) => {
    const entry = dialogWindows.get(name);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
    return true;
  });

  // The dialog has rendered its payload and may be shown.
  ipcMain.handle('dialog:ready', (event) => {
    const found = entryForSender(event.sender);
    if (found && found.entry.reveal) found.entry.reveal();
    return true;
  });

  ipcMain.handle('dialog:closeSelf', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
    return true;
  });

  ipcMain.handle('dialog:isOpen', (_event, name) => {
    const entry = dialogWindows.get(name);
    return !!(entry && !entry.win.isDestroyed());
  });

  // A dialog window needs the same theme, language and font as its opener.
  ipcMain.handle('dialog:broadcastAppearance', (_event, appearance) => {
    for (const entry of dialogWindows.values()) {
      if (!entry.win.isDestroyed()) entry.win.webContents.send('dialog:appearance', appearance);
    }
    return true;
  });

  // Dialog windows are frameless too, so they drag and close themselves.
  ipcMain.handle('dialog:setSize', (event, { width, height }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    const [minW, minH] = win.getMinimumSize();
    win.setSize(Math.max(minW, Math.round(width)), Math.max(minH, Math.round(height)));
    return true;
  });
}

module.exports = { registerDialogHandlers, openDialogWindow, closeAllDialogWindows, setDialogsVisible, dialogWindows };
