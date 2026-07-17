const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const fsp = fs.promises;
const ffmpegPath = require('ffmpeg-static');

const isDev = !app.isPackaged;
let mainWindow = null;
let dialogState = {
  lastDir: ''
};

function getDialogStatePath() {
  return path.join(app.getPath('userData'), 'dialog-state.json');
}

async function loadDialogState() {
  try {
    const raw = await fsp.readFile(getDialogStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lastDir === 'string') {
      dialogState.lastDir = parsed.lastDir;
    }
  } catch (_) {
    // Ignore missing/invalid state file and continue with defaults.
  }
}

async function saveDialogState() {
  try {
    await fsp.writeFile(getDialogStatePath(), JSON.stringify(dialogState, null, 2), 'utf8');
  } catch (_) {
    // Ignore persistence errors; dialogs still work without history.
  }
}

function getDialogDefaultPath(fallbackName = '') {
  if (dialogState.lastDir && fs.existsSync(dialogState.lastDir)) {
    return fallbackName ? path.join(dialogState.lastDir, fallbackName) : dialogState.lastDir;
  }
  const docs = app.getPath('documents');
  return fallbackName ? path.join(docs, fallbackName) : docs;
}

function updateLastDialogDirFromFilePath(filePath) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  if (!dir) return;
  dialogState.lastDir = dir;
  void saveDialogState();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1300,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12151c' : '#f3f5f8',
    title: 'Sound Effect Studio',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  if (isDev) {
    // Optional: open DevTools in development
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function getAppIconPath() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'build', 'icon.ico');
  }
  return path.join(__dirname, '..', 'build', 'icons', '512x512.png');
}

function buildMenu() {
  Menu.setApplicationMenu(null);
}

const AUDIO_EXTENSIONS = [
  'wav', 'wave', 'mp3', 'mp2', 'mpga', 'mpeg',
  'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'm4b', 'mp4',
  'webm', 'weba', 'aiff', 'aif', 'aifc', 'caf', '3gp', '3g2', 'mid', 'midi'
];

const EXPORT_AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'ogg', 'aac', 'm4a'];

function extFromFilePath(filePath = '') {
  const ext = path.extname(filePath || '').toLowerCase().replace(/^\./, '');
  return ext;
}

function ensureExportExtension(filePath, fallback = 'wav') {
  const ext = extFromFilePath(filePath);
  if (ext && EXPORT_AUDIO_EXTENSIONS.includes(ext)) return filePath;
  const normalizedFallback = EXPORT_AUDIO_EXTENSIONS.includes(fallback) ? fallback : 'wav';
  return `${filePath}.${normalizedFallback}`;
}

function ffmpegArgsFor(targetExt, inputPath, outputPath) {
  switch (targetExt) {
    case 'mp3':
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outputPath];
    case 'flac':
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'flac', outputPath];
    case 'ogg':
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'libvorbis', '-q:a', '5', outputPath];
    case 'aac':
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'aac', '-b:a', '192k', '-f', 'adts', outputPath];
    case 'm4a':
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'aac', '-b:a', '192k', '-f', 'mp4', outputPath];
    default:
      return ['-y', '-i', inputPath, '-vn', '-codec:a', 'pcm_s16le', outputPath];
  }
}

async function runFfmpeg(args) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg executable not found');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function transcodeWavBufferToFormat(wavBuffer, targetExt) {
  if (targetExt === 'wav') return wavBuffer;

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ses-export-'));
  const inputPath = path.join(tempDir, 'input.wav');
  const outputPath = path.join(tempDir, `output.${targetExt}`);

  try {
    await fsp.writeFile(inputPath, wavBuffer);
    await runFfmpeg(ffmpegArgsFor(targetExt, inputPath, outputPath));
    return await fsp.readFile(outputPath);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

ipcMain.handle('dialog:openAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Audio',
    defaultPath: getDialogDefaultPath(),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: AUDIO_EXTENSIONS },
      { name: 'WAVE', extensions: ['wav', 'wave'] },
      { name: 'MP3', extensions: ['mp3', 'mp2', 'mpga', 'mpeg'] },
      { name: 'AAC / M4A', extensions: ['aac', 'm4a', 'm4b', 'mp4'] },
      { name: 'OGG / Opus', extensions: ['ogg', 'oga', 'opus'] },
      { name: 'FLAC', extensions: ['flac'] },
      { name: 'AIFF', extensions: ['aiff', 'aif', 'aifc'] },
      { name: 'WebM', extensions: ['webm', 'weba'] },
      { name: 'MIDI', extensions: ['mid', 'midi'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return [];
  updateLastDialogDirFromFilePath(result.filePaths[0]);

  const files = [];
  for (const filePath of result.filePaths) {
    const data = await fsp.readFile(filePath);
    files.push({
      name: path.basename(filePath),
      path: filePath,
      buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    });
  }
  return files;
});

ipcMain.handle('dialog:saveAudio', async (_event, { defaultName, data, extension }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Audio',
    defaultPath: getDialogDefaultPath(defaultName || `export.${extension || 'wav'}`),
    filters: [
      { name: 'WAV', extensions: ['wav'] },
      { name: 'MP3', extensions: ['mp3'] },
      { name: 'FLAC', extensions: ['flac'] },
      { name: 'OGG', extensions: ['ogg'] },
      { name: 'AAC', extensions: ['aac'] },
      { name: 'M4A', extensions: ['m4a'] }
    ]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  let outputPath = result.filePath;
  const requestedExt = (extension || 'wav').toLowerCase();
  outputPath = ensureExportExtension(outputPath, requestedExt);
  updateLastDialogDirFromFilePath(outputPath);

  const targetExt = extFromFilePath(outputPath) || requestedExt || 'wav';
  if (!EXPORT_AUDIO_EXTENSIONS.includes(targetExt)) {
    return { ok: false, error: `지원하지 않는 저장 형식: ${targetExt}` };
  }

  try {
    const wavBuffer = Buffer.from(data);
    const outBuffer = await transcodeWavBufferToFormat(wavBuffer, targetExt);
    await fsp.writeFile(outputPath, outBuffer);
    return { ok: true, path: outputPath };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || '오디오 인코딩 실패'
    };
  }
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    defaultPath: getDialogDefaultPath(),
    properties: ['openFile'],
    filters: [
      { name: 'Mixer Project', extensions: ['smixz', 'json'] },
      { name: 'Compressed Project', extensions: ['smixz'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  updateLastDialogDirFromFilePath(result.filePaths[0]);

  const filePath = result.filePaths[0];
  const data = await fsp.readFile(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
});

ipcMain.handle('dialog:saveProject', async (_event, { defaultName, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: getDialogDefaultPath(defaultName || 'mixer_project.smixz'),
    filters: [
      { name: 'Compressed Project', extensions: ['smixz'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  updateLastDialogDirFromFilePath(result.filePath);

  const buffer = Buffer.from(data);
  await fsp.writeFile(result.filePath, buffer);
  return { ok: true, path: result.filePath };
});

ipcMain.handle('app:getPath', (_event, name) => app.getPath(name || 'userData'));

app.whenReady().then(async () => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture'].includes(permission);
    callback(allowed);
  });

  await loadDialogState();

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
