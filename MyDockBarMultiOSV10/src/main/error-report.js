'use strict';

/**
 * A serious failure has to be readable and copyable. The console is not enough:
 * a dock that failed to start has no window the user is looking at, and a
 * native message box will not let them select the text.
 */

const path = require('path');
const { app, BrowserWindow, clipboard, ipcMain } = require('electron');

const i18n = require('../shared/i18n');

const MAX_CHARS = 16000;
const DEDUPE_MS = 4000;

let installed = false;
let win = null;
let showing = false;
const queue = [];
let last = { text: '', at: 0 };

/** One block of text the popup can show and the user can copy. */
function describeError(error) {
  let text = '';
  if (error == null) text = '';
  else if (typeof error === 'string') text = error;
  else if (error instanceof Error) text = error.stack || `${error.name}: ${error.message}`;
  else if (typeof error === 'object' && (error.stack || error.message)) {
    text = error.stack || String(error.message);
  } else {
    try { text = JSON.stringify(error); } catch { text = String(error); }
  }
  text = String(text || '').trim();
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n…`;
}

function labels() {
  let locale = 'en';
  try { locale = i18n.resolve('auto', app.getLocale()); } catch { /* before ready */ }
  const t = (key) => i18n.translate(locale, key);
  return {
    title: t('error.title'),
    hint: t('error.hint'),
    copy: t('error.copy'),
    copied: t('error.copied'),
    close: t('error.close'),
  };
}

function present(text) {
  if (showing) return;
  showing = true;
  const payload = { text, ...labels() };

  win = new BrowserWindow({
    width: 560,
    height: 420,
    show: false,
    title: payload.title,
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'error-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('closed', () => {
    win = null;
    showing = false;
    const next = queue.shift();
    if (next) present(next);
  });

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    win.webContents.send('error:show', payload);
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'error.html')).catch((err) => {
    showing = false;
    console.error('[error] could not open the report window:', err.message);
  });
}

function report(error) {
  const text = describeError(error);
  if (!text) return;
  const now = Date.now();
  if (text === last.text && now - last.at < DEDUPE_MS) return;
  last = { text, at: now };

  const open = () => {
    if (showing) queue.push(text);
    else present(text);
  };

  if (app.isReady()) open();
  else app.whenReady().then(open);
}

function install() {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', (err) => report(err));
  process.on('unhandledRejection', (reason) => report(reason));

  app.on('render-process-gone', (_event, _contents, details) => {
    if (app.isQuitting) return;
    if (!details || details.reason === 'clean-exit') return;
    report(`Renderer process ended: ${details.reason} (exit ${details.exitCode})`);
  });

  ipcMain.on('app:report-error', (_event, error) => report(error));
  ipcMain.handle('error:copy', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });
}

module.exports = { describeError, report, install };
