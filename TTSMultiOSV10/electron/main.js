import { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ensureModelCatalog, getDefaultCacheDirectory, getModelCatalog } from '../src/core/modelCatalog.js';
import { createModelStore } from '../src/core/modelStore.js';
import { exportWavFile } from '../src/core/wav.js';
import { exportMp3File } from '../src/core/mp3.js';
import { synthesizeText, warmModel, listModelVoices } from '../src/core/ttsService.js';
import { ensureSherpaNativePath } from '../src/core/ortNative.js';
import { terminateOrtChild } from '../src/core/ortChildClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDataRoot = path.join(app.getPath('appData'), 'TTSMultiOSV10');
app.setPath('userData', path.join(electronDataRoot, 'user-data'));
app.setPath('sessionData', path.join(electronDataRoot, 'session-data'));

// Prefer sherpa's DLLs before any OfflineTts load (do not preload onnxruntime-node —
// its onnxruntime.dll conflicts with sherpa-onnx-win-x64 and can abort the process).
ensureSherpaNativePath();

const ttsStore = createModelStore();
let mainWindow;

function sanitizeFileBaseName(name) {
  const value = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return value || 'tts-output';
}

function normalizeAudioFormat(format) {
  return String(format || '').toLowerCase() === 'mp3' ? 'mp3' : 'wav';
}

function inferFormatFromPath(filePath, fallback = 'wav') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.mp3') return 'mp3';
  if (ext === '.wav') return 'wav';
  return normalizeAudioFormat(fallback);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 910,
    resizable: false,
    maximizable: false,
    backgroundColor: '#101319',
    title: 'TTS Multi OS',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
}

app.whenReady().then(async () => {
  await ensureModelCatalog();
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  terminateOrtChild();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  terminateOrtChild();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('app:getModelCatalog', async () => getModelCatalog());
ipcMain.handle('app:getCachedModels', async () => {
  const store = createModelStore();
  return store.listCachedModels();
});
ipcMain.handle('app:getCacheDirectory', async () => getDefaultCacheDirectory());
ipcMain.handle('app:selectAudioPath', async (_event, payload) => {
  const preferred = normalizeAudioFormat(payload?.format);
  const baseName = sanitizeFileBaseName(payload?.baseName);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${baseName}.${preferred}`,
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3'] },
      { name: 'WAV Audio', extensions: ['wav'] },
      { name: 'MP3 Audio', extensions: ['mp3'] },
    ]
  });

  if (result.canceled || !result.filePath) return null;

  const format = inferFormatFromPath(result.filePath, preferred);
  const finalPath = path.extname(result.filePath)
    ? result.filePath
    : `${result.filePath}.${format}`;
  return { filePath: finalPath, format };
});
ipcMain.handle('app:selectWavPath', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'tts-output.wav',
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
  });
  return result.canceled ? null : result.filePath;
});
ipcMain.handle('app:selectMp3Path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'tts-output.mp3',
    filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }]
  });
  return result.canceled ? null : result.filePath;
});
ipcMain.handle('app:copyText', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return { ok: true, length: String(text ?? '').length };
});
ipcMain.handle('app:downloadAndPrepareModel', async (_event, modelId) => {
  const store = createModelStore();
  console.log(`[Download] 시작: ${modelId}`);
  let lastLoggedPercent = -1;
  const sendProgress = (progress) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const wc = mainWindow.webContents;
      if (!wc || wc.isDestroyed()) return;
      wc.send('app:modelDownloadProgress', progress);
    } catch {
      // Window closed mid-download — ignore IPC errors.
    }
  };
  try {
    const result = await store.ensureModelAvailable(modelId, (progress) => {
      const percent = Number(progress?.percent) || 0;
      if (
        progress?.phase !== 'download'
        || percent === 100
        || percent === 0
        || Math.floor(percent / 5) !== Math.floor(lastLoggedPercent / 5)
      ) {
        lastLoggedPercent = percent;
        console.log(`[Download] ${modelId} ${percent}% — ${progress?.fileName || progress?.phase || ''}`);
      }
      sendProgress(progress);
    });
    console.log(`[Download] 완료: ${modelId} (downloaded=${result.downloaded})`);
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    console.error(`[Download] 실패: ${modelId}\n`, message);
    // Surface a clean message to the renderer (avoid opaque "fetch failed" only).
    throw new Error(message);
  }
});
ipcMain.handle('app:deleteModel', async (_event, modelId) => {
  const store = createModelStore();
  const result = await store.deleteModel(modelId);
  console.log(`[Model] 삭제: ${modelId}`);
  return result;
});
ipcMain.handle('app:speak', async (_event, payload) => {
  // Main-process inference: worker_threads cannot reliably load onnxruntime DLLs on Windows.
  try {
    return await synthesizeText({
      text: payload.text,
      modelId: payload.modelId,
      voiceId: payload.voiceId,
      speed: payload.speed,
      language: payload.language,
      noiseScale: payload.noiseScale,
      noiseW: payload.noiseW,
      normalize: payload.normalize,
      normalizeLevel: payload.normalizeLevel,
      store: ttsStore,
      onProgress: null,
    });
  } catch (error) {
    throw new Error(error?.message || String(error));
  }
});
ipcMain.handle('app:warmModel', async (_event, modelId) => {
  try {
    return await warmModel(modelId, ttsStore);
  } catch (error) {
    throw new Error(error?.message || String(error));
  }
});
ipcMain.handle('app:listModelVoices', async (_event, modelId) => {
  try {
    return await listModelVoices(modelId, ttsStore);
  } catch (error) {
    throw new Error(error?.message || String(error));
  }
});
ipcMain.handle('app:exportWav', async (_event, payload) => {
  return exportWavFile(payload.filePath, payload.audioBuffer, payload.sampleRate || 22050);
});
ipcMain.handle('app:exportMp3', async (_event, payload) => {
  return exportMp3File(payload.filePath, payload.audioBuffer, payload.sampleRate || 22050, payload.bitrateKbps || 128);
});
ipcMain.handle('app:openTextFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '텍스트 파일 열기',
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return { content, filePath: result.filePaths[0] };
});
