import { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ensureModelCatalog, getDefaultCacheDirectory, getModelCatalog } from '../src/core/modelCatalog.js';
import { createModelStore } from '../src/core/modelStore.js';
import { exportWavFile } from '../src/core/wav.js';
import { callTtsWorker, terminateTtsWorker } from './ttsWorkerHost.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDataRoot = path.join(app.getPath('appData'), 'TTSMultiOSV10');
app.setPath('userData', path.join(electronDataRoot, 'user-data'));
app.setPath('sessionData', path.join(electronDataRoot, 'session-data'));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 1000,
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
  terminateTtsWorker();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  terminateTtsWorker();
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
ipcMain.handle('app:selectWavPath', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'tts-output.wav',
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
  });
  return result.canceled ? null : result.filePath;
});
ipcMain.handle('app:downloadAndPrepareModel', async (_event, modelId) => {
  const store = createModelStore();
  console.log(`[Download] 시작: ${modelId}`);
  try {
    const result = await store.ensureModelAvailable(modelId, (progress) => {
      if (progress.phase === 'download' && progress.percent % 10 === 0) {
        console.log(`[Download] ${modelId} ${progress.percent}% — ${progress.fileName || ''}`);
      }
      mainWindow?.webContents?.send('app:modelDownloadProgress', progress);
    });
    console.log(`[Download] 완료: ${modelId} (downloaded=${result.downloaded})`);
    return result;
  } catch (error) {
    console.error(`[Download] 실패: ${modelId}\n`, error?.message || error);
    throw error;
  }
});
ipcMain.handle('app:speak', async (_event, payload) => {
  // Run in a worker so ONNX/phonemizer work does not freeze the UI thread
  return callTtsWorker('speak', {
    text:     payload.text,
    modelId:  payload.modelId,
    voiceId:  payload.voiceId,
    speed:    payload.speed,
    language: payload.language,
  });
});
ipcMain.handle('app:warmModel', async (_event, modelId) => {
  return callTtsWorker('warm', { modelId });
});
ipcMain.handle('app:listModelVoices', async (_event, modelId) => {
  return callTtsWorker('voices', { modelId });
});
ipcMain.handle('app:exportWav', async (_event, payload) => {
  return exportWavFile(payload.filePath, payload.audioBuffer, payload.sampleRate || 22050);
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
