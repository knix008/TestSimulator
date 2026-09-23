'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');

let win = null;

/* The window is sized to the one tab that needs the most room - Themes, whose
 * two grids of 24 cards set both numbers - and every other tab is laid out to
 * fit inside that. Shrinking either of these without first shortening that tab
 * is what makes content disappear off the bottom, because nothing here
 * scrolls. */
const WIDTH = 880;
const HEIGHT = 600;

function open(parentTheme) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }

  // Fixed size: every tab is laid out to fit exactly this window, so there
  // are no scroll bars anywhere and resizing could only break that.
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: WIDTH,
    minHeight: HEIGHT,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // MyDockBar lives in the tray: nothing it opens belongs on the taskbar.
    skipTaskbar: true,
    title: 'MyDockBar Settings',
    backgroundColor: parentTheme === 'light' ? '#f4f5f7' : '#1c1f26',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  return win;
}

function close() {
  if (win && !win.isDestroyed()) win.close();
}

function get() {
  return win && !win.isDestroyed() ? win : null;
}

function send(channel, payload) {
  const w = get();
  if (w) w.webContents.send(channel, payload);
}

/**
 * Open the settings window on a particular dock entry.
 *
 * `open()` only starts loading the page, so sending straight afterwards races
 * the renderer registering its listener and the message is simply dropped.
 * Waiting for the load to finish is the difference between the window opening
 * on that item and opening on whatever tab it happened to be on.
 */
function focusItem(id) {
  const w = open();
  if (!w) return;

  const deliver = () => w.webContents.send('settings:focus-item', id);
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', deliver);
  else deliver();
}

module.exports = { open, close, get, send, focusItem };
