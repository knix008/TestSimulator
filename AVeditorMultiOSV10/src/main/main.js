'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const mediaInfoModule = require('mediainfo.js');
const { createMenu, registerMenuIpc, prepareMenuIcons } = require('./menu');
const { startTransformersProxy, getTransformersProxyBase, isWhisperModelCached } = require('./transformersProxy');
const { normalizeMediaInfo: normalizeMediaInfoShared } = require('../shared/mediaMeta.cjs');
const { createMediaStreamService } = require('../../scripts/lib/media-stream');

const mediaInfoFactory = mediaInfoModule.default || mediaInfoModule.mediaInfoFactory || mediaInfoModule;
const mediaInfoCache = new Map();
const mediaStreamService = createMediaStreamService();

let mainWindow = null;
let dragIcon = null;

/** Small PNG used by native file drag-out (Windows requires a non-empty icon). */
function getDragIcon() {
  if (dragIcon && !dragIcon.isEmpty()) return dragIcon;
  const candidates = [
    path.join(__dirname, '../../assets/icons/drag-32.png'),
    path.join(__dirname, '../../assets/icons/icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const img = nativeImage.createFromPath(p);
      if (img && !img.isEmpty()) {
        dragIcon = img.resize({ width: 32, height: 32 });
        return dragIcon;
      }
    } catch { /* try next */ }
  }
  // Valid 1×1 PNG fallback
  dragIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  );
  return dragIcon;
}

function normalizeMediaInfo(raw, stats, ext) {
  return normalizeMediaInfoShared(raw, {
    name: path.basename(stats.path || ''),
    path: stats.path,
    size: stats.size,
    extension: ext,
    modified: stats.mtime ? new Date(stats.mtime).toISOString() : null,
    created: stats.birthtime ? new Date(stats.birthtime).toISOString() : null,
  });
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

  // Whisper STT: proxy HF + local WASM (file:// renderer cannot fetch them directly)
  try {
    const vendorDir = path.join(__dirname, '../renderer/vendor/transformers');
    if (!fs.existsSync(path.join(vendorDir, 'transformers.min.js'))) {
      try {
        require('../../scripts/sync-transformers-vendor.js').main();
      } catch (err) {
        console.warn('[main] transformers vendor sync failed:', err?.message || err);
      }
    }
    await startTransformersProxy({
      vendorDir,
      cacheDir: path.join(app.getPath('userData'), 'whisper-models'),
    });
  } catch (err) {
    console.warn('[main] STT proxy failed to start:', err?.message || err);
  }

  // Clean up ytdl-core debug player-script files dumped to app root on parse failures.
  try {
    const appRoot = path.join(__dirname, '..', '..');
    fs.readdirSync(appRoot)
      .filter(f => /^\d+-player-script\.js$/.test(f))
      .forEach(f => { try { fs.unlinkSync(path.join(appRoot, f)); } catch {} });
  } catch {}

  // Inject YouTube headers for CDN video requests so <video src> can access them directly.
  // Without Referer/Origin, YouTube CDN returns 403.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.googlevideo.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  createWindow();
  createMenu(mainWindow, 'en');
  ensureStreamProxy().catch((e) => console.warn('[stream-proxy] start failed:', e?.message));

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

/**
 * Copy files into a destination directory (unique names on conflict).
 * @returns {{ ok: boolean, paths?: string[], error?: string }}
 */
ipcMain.handle('copy-files-to-dir', async (_event, srcPaths, destDir) => {
  if (!destDir || typeof destDir !== 'string') {
    return { ok: false, error: 'Invalid destination' };
  }
  const list = Array.isArray(srcPaths) ? srcPaths.filter((p) => typeof p === 'string' && p) : [];
  if (!list.length) return { ok: false, error: 'No files' };

  let destStat;
  try {
    destStat = await fs.promises.stat(destDir);
  } catch {
    return { ok: false, error: 'Destination not found' };
  }
  if (!destStat.isDirectory()) {
    return { ok: false, error: 'Destination is not a directory' };
  }

  const outPaths = [];
  try {
    for (const src of list) {
      let srcStat;
      try {
        srcStat = await fs.promises.stat(src);
      } catch {
        continue;
      }
      if (!srcStat.isFile()) continue;

      const base = path.basename(src);
      let destPath = path.join(destDir, base);
      if (path.resolve(src) === path.resolve(destPath)) {
        outPaths.push(destPath);
        continue;
      }

      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      let n = 1;
      while (fs.existsSync(destPath)) {
        destPath = path.join(destDir, `${stem}-${n}${ext}`);
        n += 1;
      }
      await fs.promises.copyFile(src, destPath);
      outPaths.push(destPath);
    }
    return { ok: true, paths: outPaths };
  } catch (e) {
    return { ok: false, error: e.message, paths: outPaths };
  }
});

/** Native OS drag-out from the file panel (must complete during dragstart). */
ipcMain.on('start-drag', (event, filePath) => {
  const ok = beginNativeDrag(event.sender, filePath);
  event.returnValue = ok;
});

function beginNativeDrag(webContents, filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    webContents.startDrag({
      file: filePath,
      icon: getDragIcon(),
    });
    return true;
  } catch (err) {
    console.warn('[start-drag]', err.message);
    return false;
  }
}

// ── IPC: Ollama (local VLM) + incremental analysis file I/O ─────────────────

function normalizeOllamaBase(baseUrl) {
  const raw = String(baseUrl || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  return raw || 'http://127.0.0.1:11434';
}

async function ollamaFetch(baseUrl, apiPath, opts = {}) {
  const url = `${normalizeOllamaBase(baseUrl)}${apiPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 120000);
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || data?.raw || res.statusText || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: String(msg), data };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Request timed out' : (e.message || String(e));
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('ollama-ping', async (_event, baseUrl) => {
  const result = await ollamaFetch(baseUrl, '/api/tags', { timeoutMs: 8000 });
  if (!result.ok) return { ok: false, error: result.error || 'Cannot reach Ollama' };
  const models = (result.data?.models || []).map((m) => m.name).filter(Boolean);
  return { ok: true, models };
});

ipcMain.handle('ollama-list-models', async (_event, baseUrl) => {
  const result = await ollamaFetch(baseUrl, '/api/tags', { timeoutMs: 15000 });
  if (!result.ok) return { ok: false, error: result.error || 'Cannot list models', models: [] };
  const models = (result.data?.models || []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at || m.modifiedAt || null,
  }));
  return { ok: true, models };
});

ipcMain.handle('ollama-chat', async (_event, opts = {}) => {
  const baseUrl = opts.baseUrl;
  const model = String(opts.model || '').trim();
  if (!model) return { ok: false, error: 'Model is required' };

  const images = Array.isArray(opts.images)
    ? opts.images.filter((x) => typeof x === 'string' && x.length > 0)
    : [];

  const messages = [];
  const system = String(opts.system || opts.systemPrompt || '').trim();
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({
    role: 'user',
    content: String(opts.prompt || 'Describe this scene.'),
    ...(images.length ? { images } : {}),
  });

  const body = {
    model,
    stream: false,
    messages,
  };

  const result = await ollamaFetch(baseUrl, '/api/chat', {
    method: 'POST',
    body,
    timeoutMs: opts.timeoutMs || 180000,
  });
  if (!result.ok) return { ok: false, error: result.error || 'Ollama chat failed' };
  const content = result.data?.message?.content || result.data?.response || '';
  return { ok: true, content: String(content), raw: result.data };
});

ipcMain.handle('save-analysis-dialog', async (_event, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Scene Analysis',
    defaultPath: defaultName || 'scene-analysis.jsonl',
    filters: [
      { name: 'JSON Lines', extensions: ['jsonl'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return canceled ? null : filePath;
});

ipcMain.handle('write-text-file', async (_event, filePath, content, options = {}) => {
  try {
    if (!filePath) return { ok: false, error: 'No path' };
    const text = content == null ? '' : String(content);
    if (options.append) {
      fs.appendFileSync(filePath, text, 'utf8');
    } else {
      fs.writeFileSync(filePath, text, 'utf8');
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('read-text-file', async (_event, filePath) => {
  try {
    if (!filePath) return { ok: false, error: 'No path' };
    const text = fs.readFileSync(filePath, 'utf8');
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-analysis-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Scene Analysis',
    properties: ['openFile'],
    filters: [
      { name: 'Scene Analysis', extensions: ['jsonl', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return canceled || !filePaths?.length ? null : filePaths[0];
});

const SUBTITLE_MEDIA_EXT = new Set([
  '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.mts',
  '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.aiff',
]);

/** Read media bytes for local STT (media extensions only, max 512MB). */
ipcMain.handle('read-binary-file', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'No path' };
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!SUBTITLE_MEDIA_EXT.has(ext)) return { ok: false, error: 'Not a media file' };
    const st = fs.statSync(resolved);
    if (!st.isFile()) return { ok: false, error: 'Not a file' };
    if (st.size > 512 * 1024 * 1024) return { ok: false, error: 'File too large for subtitle extraction' };
    // Prefer ArrayBuffer transfer for large media (avoids slow Buffer→JSON-ish clones)
    const data = fs.readFileSync(resolved);
    return { ok: true, data: new Uint8Array(data), byteLength: data.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('save-subtitle-dialog', async (_event, defaultName, preferredFormat) => {
  const fmt = String(preferredFormat || '').toLowerCase();
  const defaultExt = fmt === 'smi' ? 'smi' : 'srt';
  const normalizedDefault = String(defaultName || `subtitles.${defaultExt}`);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Subtitles',
    defaultPath: normalizedDefault,
    filters: [
      { name: 'SubRip', extensions: ['srt'] },
      { name: 'SAMI', extensions: ['smi'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return canceled ? null : filePath;
});

ipcMain.handle('save-media-file-dialog', async (_event, srcPath, defaultName) => {
  const ext = (defaultName || srcPath || '').split('.').pop() || 'mp4';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Media File',
    defaultPath: defaultName || path.basename(srcPath || 'media.mp4'),
    filters: [
      { name: 'Media', extensions: [ext, 'mp4', 'mkv', 'mov', 'avi', 'mp3', 'wav'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return { ok: false, cancelled: true };
  try {
    await fs.promises.copyFile(srcPath, filePath);
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/** Loopback base URL for Whisper model + WASM proxy (Electron file://). */
ipcMain.handle('get-stt-proxy-base', async () => getTransformersProxyBase());
ipcMain.handle('is-whisper-model-cached', async (_e, modelId) => isWhisperModelCached(modelId || 'Xenova/whisper-tiny'));

// ── IPC: YouTube / HTTP Stream Proxy ─────────────────────────────────────────

let _proxyServer = null;
let _proxyPort = 0;
// streamId -> { type: 'youtube'|'http', ytUrl?, url?, contentType }
const _streamMap = new Map();
let _streamSeq = 0;

async function ensureStreamProxy() {
  if (_proxyServer) return _proxyPort;
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        });
        res.end();
        return;
      }

      // Shared YouTube/HTTP/RTSP API (/api/media/*) — same as web
      try {
        const port = (server.address() && server.address().port) || _proxyPort || 0;
        if (await mediaStreamService.handleRequest(req, res, '127.0.0.1', port)) {
          return;
        }
      } catch (e) {
        console.error('[stream-proxy media]', e?.message || e);
        if (!res.headersSent) { res.writeHead(500); res.end(); }
        return;
      }

      const id = (req.url || '/').slice(1).split('?')[0];
      const entry = _streamMap.get(id);
      if (!entry) { res.writeHead(404); res.end(); return; }

      if (entry.type === 'youtube') {
        _serveYoutubeStream(entry, req, res);
      } else {
        _serveHttpProxy(entry, req, res);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      _proxyPort = server.address().port;
      _proxyServer = server;
      console.info(`[stream-proxy] port ${_proxyPort}`);
      resolve(_proxyPort);
    });
    server.on('error', reject);
  });
}

function _serveYoutubeStream(entry, req, res) {
  const formatUrl = entry.formatUrl;
  if (!formatUrl) {
    console.error('[yt-proxy] No format URL in entry');
    res.writeHead(503); res.end('No format URL'); return;
  }
  console.info('[yt-proxy]', req.method, req.headers.range || 'no-range', formatUrl.slice(0, 80) + '…');
  _proxyYoutubeUrl(formatUrl, req, res, 0);
}

function _proxyYoutubeUrl(targetUrl, req, res, redirects) {
  if (redirects > 5) { res.writeHead(502); res.end('Too many redirects'); return; }

  let tUrl;
  try { tUrl = new URL(targetUrl); } catch (e) {
    console.error('[yt-proxy] Bad URL:', e.message);
    res.writeHead(502); res.end(); return;
  }

  const reqHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com',
    'Connection': 'keep-alive',
  };
  if (req.headers.range) reqHeaders['Range'] = req.headers.range;

  const pReq = https.request({
    hostname: tUrl.hostname,
    port: 443,
    path: tUrl.pathname + tUrl.search,
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: reqHeaders,
  }, (pRes) => {
    console.info('[yt-proxy] upstream', pRes.statusCode, pRes.headers['content-type'] || '');
    if (pRes.statusCode >= 300 && pRes.statusCode < 400 && pRes.headers.location) {
      pRes.resume();
      _proxyYoutubeUrl(pRes.headers.location, req, res, redirects + 1);
      return;
    }
    const outHeaders = {
      'Content-Type': pRes.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    };
    if (pRes.headers['content-length']) outHeaders['Content-Length'] = pRes.headers['content-length'];
    if (pRes.headers['content-range']) outHeaders['Content-Range'] = pRes.headers['content-range'];
    res.writeHead(pRes.statusCode, outHeaders);
    if (req.method === 'HEAD') { res.end(); pRes.resume(); return; }
    pRes.pipe(res, { end: true });
    pRes.on('error', () => { if (!res.writableEnded) res.end(); });
  });

  pReq.on('error', (e) => {
    console.error('[yt-proxy] request error:', e.message);
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
  });
  res.on('close', () => pReq.destroy());
  pReq.end();
}

function _serveHttpProxy(entry, req, res) {
  const tUrl = new URL(entry.url);
  const isS = tUrl.protocol === 'https:';
  const lib = isS ? https : http;
  const reqHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Connection': 'close',
  };
  if (req.headers.range) reqHeaders['Range'] = req.headers.range;

  const pReq = lib.request({
    method: req.method || 'GET',
    hostname: tUrl.hostname,
    port: parseInt(tUrl.port, 10) || (isS ? 443 : 80),
    path: tUrl.pathname + tUrl.search,
    headers: reqHeaders,
  }, (pRes) => {
    const outHeaders = {
      'Content-Type': pRes.headers['content-type'] || entry.contentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    };
    if (pRes.headers['content-length']) outHeaders['Content-Length'] = pRes.headers['content-length'];
    if (pRes.headers['content-range']) outHeaders['Content-Range'] = pRes.headers['content-range'];
    res.writeHead(pRes.statusCode, outHeaders);
    pRes.pipe(res, { end: true });
    pRes.on('error', () => { if (!res.writableEnded) res.end(); });
  });

  pReq.on('error', (e) => {
    console.error('[stream-proxy http]', e.message);
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
  });
  res.on('close', () => pReq.destroy());
  pReq.end();
}

ipcMain.handle('stream-proxy-port', async () => {
  try { return await ensureStreamProxy(); } catch (e) { console.error(e); return 0; }
});

ipcMain.handle('youtube-get-info', async (_event, url) => {
  // VideoPlayerV10-style resolve via youtubei.js (shared media-stream module)
  try {
    return await mediaStreamService.youtubeGetInfo(url);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('youtube-prepare-stream', async (_event, url) => {
  try {
    const port = await ensureStreamProxy();
    if (!port) return { ok: false, error: 'Could not start stream proxy' };
    const result = await mediaStreamService.youtubePrepareStream(url);
    if (!result.ok) return result;
    if (result.playback === 'embed') {
      return {
        ok: true,
        playback: 'embed',
        streamUrl: result.embedUrl,
        embedUrl: result.embedUrl,
        videoId: result.videoId,
        title: result.title,
        duration: result.duration,
      };
    }
    // Prefer same-origin proxy so Referer/Origin are applied server-side
    return {
      ok: true,
      playback: 'proxy',
      streamUrl: `http://127.0.0.1:${port}${result.streamPath}`,
      title: result.title,
      duration: result.duration,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('http-prepare-stream', async (_event, url) => {
  try {
    const port = await ensureStreamProxy();
    if (!port) return { ok: false, error: 'Could not start stream proxy' };
    const result = mediaStreamService.prepareHttpStream(url);
    if (result.ok && result.streamPath) {
      result.streamUrl = `http://127.0.0.1:${port}${result.streamPath}`;
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('rtsp-prepare-stream', async (_event, url) => {
  try {
    const port = await ensureStreamProxy();
    if (!port) return { ok: false, error: 'Could not start stream proxy' };
    const result = await mediaStreamService.prepareRtspStream(url);
    if (result.ok && result.streamPath) {
      result.streamUrl = `http://127.0.0.1:${port}${result.streamPath}`;
      result.hls = true;
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('media-stream-capabilities', async () => {
  try {
    await ensureStreamProxy();
    return { ok: true, ...mediaStreamService.capabilities() };
  } catch (e) {
    return { ok: false, error: e.message || String(e), ...mediaStreamService.capabilities() };
  }
});

ipcMain.handle('youtube-download', async (_event, url) => {
  // Same picker as VideoPlayerV10 DownloadButton_Click: muxed → video-only
  try {
    const prepared = await mediaStreamService.youtubePrepareStream(url);
    if (!prepared.ok || prepared.playback === 'embed' || !prepared.formatUrl) {
      return { ok: false, error: prepared.error || 'YouTube 스트림을 해석하지 못했습니다.' };
    }
    const title = (prepared.title || 'youtube')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || 'youtube';

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Download YouTube Video',
      defaultPath: `${title}.mp4`,
      filters: [
        { name: 'MP4 Video', extensions: ['mp4'] },
        { name: 'WebM Video', extensions: ['webm'] },
      ],
    });
    if (canceled || !filePath) return { ok: true, cancelled: true };

    mainWindow?.webContents.send('youtube-download-progress', { percent: 0, status: 'started', filePath });

    const tUrl = new URL(prepared.formatUrl);
    const writeStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: tUrl.hostname,
        port: 443,
        path: tUrl.pathname + tUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
        },
      }, (pRes) => {
        if (pRes.statusCode >= 400) {
          reject(new Error(`Download HTTP ${pRes.statusCode}`));
          pRes.resume();
          return;
        }
        const total = parseInt(pRes.headers['content-length'] || '0', 10) || 0;
        let downloaded = 0;
        let lastEmit = 0;
        let lastPct = -1;
        const emitProgress = (force = false) => {
          if (!mainWindow) return;
          const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
          const now = Date.now();
          if (!force && now - lastEmit < 200 && percent === lastPct) return;
          lastEmit = now;
          lastPct = percent;
          mainWindow.webContents.send('youtube-download-progress', {
            percent, status: 'progress', downloaded, total,
          });
        };
        pRes.on('data', (chunk) => {
          downloaded += chunk.length;
          writeStream.write(chunk);
          emitProgress(false);
        });
        pRes.on('end', () => {
          emitProgress(true);
          writeStream.end();
        });
        pRes.on('error', reject);
      });
      req.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      req.end();
    });

    mainWindow?.webContents.send('youtube-download-progress', { percent: 100, status: 'done', filePath });
    return { ok: true, filePath };
  } catch (e) {
    const msg = e.message || String(e);
    mainWindow?.webContents.send('youtube-download-progress', { percent: 0, status: 'error', error: msg });
    return { ok: false, error: msg };
  }
});
