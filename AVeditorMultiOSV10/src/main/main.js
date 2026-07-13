'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mediaInfoModule = require('mediainfo.js');
const { createMenu, registerMenuIpc, prepareMenuIcons } = require('./menu');

const mediaInfoFactory = mediaInfoModule.default || mediaInfoModule.mediaInfoFactory || mediaInfoModule;
const mediaInfoCache = new Map();

let mainWindow = null;
let dragIcon = null;

/** Small PNG used by native file drag-out (Windows requires an icon). */
function getDragIcon() {
  if (dragIcon && !dragIcon.isEmpty()) return dragIcon;
  // 32×32 simple document glyph
  dragIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAlElEQVRYR+2Wuw3AMAhE3ykYp/sP4Q3SRfwkSuTIdaDgFQ8+cA8gIiJhZg/gCdwG8AEewCvA+gPwA+4ALsATuAAb8AWwABvwBbAAW/AFsABb8AWwAFvwBbAAW/AFsABb8AWwAFvwBbAAW/AFsABb8AWwAFvwBbAAW/AFsABb8AWwAFvwBbAAW/AFsABb8AWwAFvwBbAAW/AFsABb8OcFvgE7sxF/0m8QlwAAAABJRU5ErkJggg=='
  );
  if (dragIcon.isEmpty()) {
    dragIcon = nativeImage.createEmpty();
  }
  return dragIcon;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getTrackCodec(track) {
  if (!track) return null;
  const parts = [track.Format, track.Format_Profile || track.Format_AdditionalFeatures].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function normalizeMediaInfo(raw, stats, ext) {
  const tracks = raw?.media?.track || [];
  const general = tracks.find((track) => track['@type'] === 'General') || null;
  const video = tracks.find((track) => track['@type'] === 'Video') || null;
  const audioTracks = tracks.filter((track) => track['@type'] === 'Audio');
  const audio = audioTracks[0] || null;

  return {
    name: path.basename(stats.path || ''),
    path: stats.path,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    created: stats.birthtime.toISOString(),
    extension: ext,
    isVideo: !!video,
    isAudio: !video && !!audio,
    containerFormat: general?.Format || null,
    duration: toFiniteNumber(video?.Duration ?? audio?.Duration ?? general?.Duration),
    width: toFiniteNumber(video?.Width),
    height: toFiniteNumber(video?.Height),
    fps: toFiniteNumber(video?.FrameRate ?? general?.FrameRate),
    sampleRate: toFiniteNumber(audio?.SamplingRate),
    channels: toFiniteNumber(audio?.Channels),
    bitrate: toFiniteNumber(video?.BitRate ?? audio?.BitRate ?? general?.OverallBitRate),
    overallBitrate: toFiniteNumber(general?.OverallBitRate),
    codec: getTrackCodec(video || audio),
    videoCodec: getTrackCodec(video),
    audioCodec: getTrackCodec(audio),
  };
}

async function readMediaMetadata(filePath, stats, ext) {
  const cacheKey = `${filePath}:${stats.size}:${stats.mtimeMs}`;
  if (mediaInfoCache.has(cacheKey)) return mediaInfoCache.get(cacheKey);

  let fileHandle;
  let mediaInfo;

  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    mediaInfo = await mediaInfoFactory({
      format: 'object',
      locateFile: () => require.resolve('mediainfo.js/MediaInfoModule.wasm'),
    });

    const readChunk = async (size, offset) => {
      const buffer = new Uint8Array(size);
      await fileHandle.read(buffer, 0, size, offset);
      return buffer;
    };

    const raw = await mediaInfo.analyzeData(() => stats.size, readChunk);
    const normalized = normalizeMediaInfo(raw, { ...stats, path: filePath }, ext);
    mediaInfoCache.set(cacheKey, normalized);
    return normalized;
  } finally {
    if (fileHandle) await fileHandle.close();
    if (mediaInfo) mediaInfo.close();
  }
}

function resolveAppIcon() {
  const iconsDir = path.join(__dirname, '../../assets/icons');
  const iconIco = path.join(iconsDir, 'icon.ico');
  const iconPng = path.join(iconsDir, 'icon.png');
  const iconIcns = path.join(iconsDir, 'icon.icns');
  if (process.platform === 'win32' && fs.existsSync(iconIco)) return iconIco;
  if (process.platform === 'darwin' && fs.existsSync(iconIcns)) return iconIcns;
  if (fs.existsSync(iconPng)) return iconPng;
  if (fs.existsSync(iconIco)) return iconIco;
  return undefined;
}

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow() {
  const icon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    backgroundColor: '#0f0f1a',
    icon,
    title: 'AV Editor',
  });

  if (icon && process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(icon); } catch { /* ignore */ }
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// Windows taskbar: use a stable AppUserModelID so the custom icon sticks
if (process.platform === 'win32') {
  app.setAppUserModelId('com.aveditor.app');
}

app.whenReady().then(async () => {
  registerMenuIpc();
  await prepareMenuIcons();
  createWindow();
  createMenu(mainWindow, 'en');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: File system ─────────────────────────────────────────────────────────

ipcMain.handle('get-drives', async () => {
  if (process.platform === 'win32') {
    // Probe A:–Z: — more reliable than deprecated WMIC CSV parsing
    const drives = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const root = `${letter}:\\`;
      try {
        fs.accessSync(root);
        drives.push({
          name: `${letter}:`,
          label: `${letter}:`,
          path: root,
          type: 'drive',
        });
      } catch { /* skip inaccessible */ }
    }
    return drives.length
      ? drives
      : [{ name: 'C:', label: 'C:', path: 'C:\\', type: 'drive' }];
  }

  if (process.platform === 'darwin') {
    const drives = [{ name: 'Macintosh HD', label: 'Macintosh HD', path: '/', type: 'drive' }];
    try {
      for (const item of fs.readdirSync('/Volumes')) {
        if (item === 'Macintosh HD') continue;
        drives.push({
          name: item,
          label: item,
          path: path.join('/Volumes', item),
          type: 'drive',
        });
      }
    } catch { /* ignore */ }
    return drives;
  }

  // Linux: root + common mount points
  const mounts = [{ name: '/', label: 'Root (/)', path: '/', type: 'drive' }];
  const mediaUser = (() => {
    try { return path.join('/run/media', os.userInfo().username); } catch { return null; }
  })();
  for (const base of ['/media', '/mnt', mediaUser].filter(Boolean)) {
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        mounts.push({
          name: entry.name,
          label: entry.name,
          path: path.join(base, entry.name),
          type: 'drive',
        });
      }
    } catch { /* ignore */ }
  }
  return mounts;
});

ipcMain.handle('get-special-folders', async () => {
  const home = os.homedir();
  const folders = [
    { name: 'home', label: 'Home', path: home },
    { name: 'desktop', label: 'Desktop', path: path.join(home, 'Desktop') },
    { name: 'documents', label: 'Documents', path: path.join(home, 'Documents') },
    { name: 'downloads', label: 'Downloads', path: path.join(home, 'Downloads') },
  ];
  return folders.filter(f => { try { return fs.statSync(f.path).isDirectory(); } catch { return false; } });
});

ipcMain.handle('read-directory', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      // Skip hidden files on Unix-like systems
      if (entry.name.startsWith('.') && process.platform !== 'win32') continue;
      try {
        const fullPath = path.join(dirPath, entry.name);
        const stats = fs.statSync(fullPath);
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          extension: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
        });
      } catch { /* skip inaccessible */ }
    }
    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  } catch {
    return [];
  }
});

ipcMain.handle('get-file-info', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
      extension: path.extname(filePath).toLowerCase(),
      isDirectory: stats.isDirectory(),
    };
  } catch { return null; }
});

ipcMain.handle('get-media-info', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const VIDEO_EXT = new Set(['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.mts']);
    const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.aiff']);
    const basicInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
      extension: ext,
      isVideo: VIDEO_EXT.has(ext),
      isAudio: AUDIO_EXT.has(ext),
    };

    if (!basicInfo.isVideo && !basicInfo.isAudio) return basicInfo;

    try {
      return await readMediaMetadata(filePath, stats, ext);
    } catch {
      return basicInfo;
    }
  } catch { return null; }
});

ipcMain.handle('get-home-dir', async () => os.homedir());

ipcMain.handle('path-ancestors', async (_event, targetPath) => {
  try {
    if (!targetPath) return [];
    let current = path.resolve(targetPath);
    try {
      const st = fs.statSync(current);
      if (!st.isDirectory()) current = path.dirname(current);
    } catch {}
    const ancestors = [];
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      ancestors.unshift(current);
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      current = parent;
    }
    return ancestors;
  } catch { return []; }
});

ipcMain.handle('get-path-sep', async () => path.sep);

// ── IPC: Dialogs ─────────────────────────────────────────────────────────────

ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['mp4','avi','mov','mkv','mp3','wav','aac','flac','ogg','webm','flv','wmv','m4v','m4a','opus','ts','mts'] },
      { name: 'Video Files', extensions: ['mp4','avi','mov','mkv','webm','flv','wmv','m4v','ts','mts'] },
      { name: 'Audio Files', extensions: ['mp3','wav','aac','flac','ogg','m4a','wma','opus','aiff'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('open-folder-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('save-project-dialog', async (_event, defaultPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.avp',
    filters: [{ name: 'AV Editor Project', extensions: ['avp'] }],
  });
  return canceled ? null : filePath;
});

ipcMain.handle('open-project-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'AV Editor Project', extensions: ['avp'] }],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('export-dialog', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'output.mp4',
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MOV Video', extensions: ['mov'] },
      { name: 'MP3 Audio', extensions: ['mp3'] },
      { name: 'WAV Audio', extensions: ['wav'] },
    ],
  });
  return canceled ? null : filePath;
});

ipcMain.handle('show-message-box', async (_event, opts) => {
  return dialog.showMessageBox(mainWindow, opts);
});

// ── IPC: Project file I/O ────────────────────────────────────────────────────

ipcMain.handle('save-project-file', async (_event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('load-project-file', async (_event, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: Export (FFmpeg placeholder) ─────────────────────────────────────────

let exportProcess = null;

ipcMain.handle('export-media', async (_event, opts) => {
  // Placeholder – integrate fluent-ffmpeg here for real export
  if (mainWindow) {
    mainWindow.webContents.send('export-progress', { percent: 0, status: 'started' });
    // Simulate progress for demo
    let pct = 0;
    const iv = setInterval(() => {
      pct = Math.min(pct + 5, 100);
      if (mainWindow) mainWindow.webContents.send('export-progress', { percent: pct, status: pct < 100 ? 'progress' : 'done' });
      if (pct >= 100) clearInterval(iv);
    }, 200);
  }
  return { ok: true };
});

ipcMain.handle('cancel-export', async () => {
  if (exportProcess) { exportProcess.kill(); exportProcess = null; }
  return { ok: true };
});

ipcMain.handle('show-item-in-folder', async (_event, targetPath) => {
  if (!targetPath) return { ok: false };
  try {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('delete-media-file', async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') {
    return { ok: false, error: 'Invalid path' };
  }
  try {
    await fs.promises.access(targetPath);
  } catch {
    return { ok: false, error: 'File not found' };
  }
  try {
    if (typeof shell.trashItem === 'function') {
      await shell.trashItem(targetPath);
    } else {
      await fs.promises.unlink(targetPath);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Native OS drag-out from the file panel (must be sync during dragstart). */
ipcMain.on('start-drag', (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return;
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
    event.sender.startDrag({
      file: filePath,
      icon: getDragIcon(),
    });
  } catch (err) {
    console.warn('[start-drag]', err.message);
  }
});
