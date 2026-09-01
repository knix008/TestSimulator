// Electron main process (CommonJS).
// Responsibilities:
//   * create the window and load src/index.html
//   * IPC bridge for HTTPS device commands (accepts self-signed certs)
//   * IPC for reading the editable buttons.json config
//   * IPC for persisting sessions + exporting CSV via native dialogs
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const isDev = !app.isPackaged;

function userConfigPath() {
  return path.join(app.getPath('userData'), 'buttons.json');
}
function bundledConfigPath() {
  return path.join(__dirname, '..', 'src', 'config', 'buttons.json');
}
function sessionsPath() {
  return path.join(app.getPath('userData'), 'sessions.json');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    useContentSize: true,
    backgroundColor: '#0f1420',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

/* ---------- IPC: HTTPS device command ---------- */
ipcMain.handle('device:send', async (_e, opts) => {
  const { ip, port, path: reqPath, command, timeoutMs } = opts;
  return await new Promise((resolve) => {
    const data = Buffer.from(command, 'utf8');
    const req = https.request(
      {
        host: ip,
        port,
        path: reqPath || '/at',
        method: 'POST',
        rejectUnauthorized: false, // accept self-signed device certificate
        headers: { 'Content-Type': 'text/plain', 'Content-Length': data.length },
        timeout: timeoutMs || 15000
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => { req.destroy(new Error(`타임아웃 (${timeoutMs}ms)`)); });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
    req.write(data);
    req.end();
  });
});

/* ---------- IPC: config ---------- */
ipcMain.handle('config:read', async () => {
  try {
    const p = fs.existsSync(userConfigPath()) ? userConfigPath() : bundledConfigPath();
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    return null;
  }
});

/* ---------- IPC: sessions persistence ---------- */
ipcMain.handle('sessions:load', async () => {
  try {
    if (!fs.existsSync(sessionsPath())) return null;
    return JSON.parse(fs.readFileSync(sessionsPath(), 'utf8'));
  } catch { return null; }
});
ipcMain.handle('sessions:save', async (_e, payload) => {
  try {
    fs.writeFileSync(sessionsPath(), JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

/* ---------- IPC: CSV export ---------- */
ipcMain.handle('csv:save', async (_e, { filename, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '보고서 저장',
    defaultPath: filename,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, '﻿' + content, 'utf8'); // BOM for Excel
    return { ok: true, path: filePath };
  } catch (err) { return { ok: false, error: err.message }; }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
