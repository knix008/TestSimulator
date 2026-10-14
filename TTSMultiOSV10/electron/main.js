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
import {
  describeError,
  getLogPath,
  installFileLogging,
  readLogTail,
  takePendingNativeCrash,
} from '../src/core/appLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

installFileLogging();
// Must be read before any native load so a crash marker from the previous run is not overwritten.
const pendingNativeCrash = takePendingNativeCrash();

const electronDataRoot = path.join(app.getPath('appData'), 'TTSMultiOSV10');
app.setPath('userData', path.join(electronDataRoot, 'user-data'));
app.setPath('sessionData', path.join(electronDataRoot, 'session-data'));

// Renderer splits IPC error messages on this marker: summary before, full report after.
const ERROR_DETAIL_MARKER = '\n\n[상세 정보]\n';

function toIpcError(error, context) {
  const summary = error?.message || String(error ?? '알 수 없는 오류');
  return new Error(`${summary}${ERROR_DETAIL_MARKER}${describeError(error, context)}`);
}

function rendererAlive() {
  try {
    return Boolean(
      mainWindow
      && !mainWindow.isDestroyed()
      && mainWindow.webContents
      && !mainWindow.webContents.isDestroyed()
      && !mainWindow.webContents.isLoading(),
    );
  } catch {
    return false;
  }
}

/** Native message box with a copy button; loops so the dialog stays open after copying. */
async function showNativeErrorBox(title, detail, extraButtons = []) {
  if (!app.isReady()) await app.whenReady();
  const buttons = [...extraButtons, '오류 내용 복사', '닫기'];
  const copyIndex = extraButtons.length;
  for (;;) {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const options = {
      type: 'error',
      title: 'TTS Multi OS - 오류',
      message: title,
      detail,
      buttons,
      defaultId: buttons.length - 1,
      cancelId: buttons.length - 1,
      noLink: true,
    };
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response === copyIndex) {
      clipboard.writeText(`${title}\n\n${detail}`);
      continue;
    }
    return response < extraButtons.length ? extraButtons[response] : null;
  }
}

/** Prefer the in-app error dialog (copyable); fall back to a native box. */
function reportError(title, error, context) {
  const detail = describeError(error, context);
  console.error(`[Error] ${title}\n${detail}`);
  if (rendererAlive()) {
    try {
      mainWindow.webContents.send('app:error', { title, detail });
      return;
    } catch {
      /* fall through */
    }
  }
  void showNativeErrorBox(title, detail).catch(() => {});
}

process.on('uncaughtException', (error) => {
  reportError('예기치 않은 오류가 발생했습니다.', error, '[uncaughtException]');
});

process.on('unhandledRejection', (reason) => {
  reportError('처리되지 않은 오류가 발생했습니다.', reason, '[unhandledRejection]');
});

app.on('render-process-gone', (_event, _webContents, details) => {
  const detail = `화면(렌더러) 프로세스가 종료되었습니다.\n이유: ${details?.reason || '-'}`
    + `\n종료 코드: ${details?.exitCode ?? '-'}\n\n최근 로그:\n${readLogTail(40)}\n\n로그 파일: ${getLogPath()}`;
  console.error(`[Error] render-process-gone ${JSON.stringify(details)}`);
  void showNativeErrorBox('화면 프로세스가 비정상 종료되었습니다.', detail, ['다시 불러오기'])
    .then((choice) => {
      if (choice === '다시 불러오기' && mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    })
    .catch(() => {});
});

app.on('child-process-gone', (_event, details) => {
  if (!details || ['clean-exit', 'killed'].includes(details.reason)) return;
  console.error(`[Error] child-process-gone ${JSON.stringify(details)}`);
  reportError(
    '보조 프로세스가 비정상 종료되었습니다.',
    new Error(`종류: ${details.type}\n이유: ${details.reason}\n종료 코드: ${details.exitCode ?? '-'}`
      + `${details.name ? `\n이름: ${details.name}` : ''}`),
  );
});

/** The previous run died inside native code (no JS error was possible) — explain it now. */
async function reportPendingNativeCrash() {
  if (!pendingNativeCrash) return null;
  const crash = pendingNativeCrash;
  const detail = [
    `작업: ${crash.op || '-'}`,
    `모델: ${crash.modelId || '-'}`,
    `폴더: ${crash.modelDir || '-'}`,
    `시각: ${crash.startedAt || '-'}`,
    '',
    '모델 파일이 손상되었거나 다운로드가 완전하지 않으면 음성 엔진이 오류 메시지 없이 프로그램을 종료시킬 수 있습니다.',
    '「모델 삭제 후 다시 받기」를 누르면 해당 모델을 지우고 처음부터 다시 다운로드합니다.',
    '',
    `최근 로그:\n${readLogTail(40)}`,
    '',
    `로그 파일: ${getLogPath()}`,
  ].join('\n');
  console.error(`[Error] 이전 실행이 네이티브 작업 중 비정상 종료됨: ${JSON.stringify(crash)}`);
  const extra = crash.modelId ? ['모델 삭제 후 다시 받기'] : [];
  const choice = await showNativeErrorBox(
    '이전 실행에서 음성 엔진이 비정상 종료되었습니다.',
    detail,
    extra,
  );
  if (choice !== '모델 삭제 후 다시 받기') return null;
  try {
    await ttsStore.deleteModel(crash.modelId);
    console.log(`[Model] 크래시 복구 삭제: ${crash.modelId}`);
    return crash.modelId;
  } catch (error) {
    await showNativeErrorBox('모델 삭제에 실패했습니다.', describeError(error, crash.modelId));
    return null;
  }
}

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
  // Before the window exists, so the renderer cannot auto-load the crashing model again first.
  const redownloadModelId = await reportPendingNativeCrash();
  createWindow();
  if (redownloadModelId) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app:redownloadModel', redownloadModelId);
    });
  }
}).catch((error) => {
  void showNativeErrorBox('프로그램 시작 중 오류가 발생했습니다.', describeError(error, '[startup]'));
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
    console.error(`[Download] 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[모델 다운로드] ${modelId}`);
  }
});
ipcMain.handle('app:deleteModel', async (_event, modelId) => {
  try {
    const store = createModelStore();
    const result = await store.deleteModel(modelId);
    console.log(`[Model] 삭제: ${modelId}`);
    return result;
  } catch (error) {
    console.error(`[Model] 삭제 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[모델 삭제] ${modelId}`);
  }
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
    console.error(`[TTS] 합성 실패: ${payload?.modelId}\n`, error);
    throw toIpcError(error, `[음성 합성] 모델=${payload?.modelId} 언어=${payload?.language || '-'}`);
  }
});
ipcMain.handle('app:warmModel', async (_event, modelId) => {
  try {
    return await warmModel(modelId, ttsStore);
  } catch (error) {
    console.error(`[TTS] 엔진 준비 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[엔진 준비] ${modelId}`);
  }
});
ipcMain.handle('app:listModelVoices', async (_event, modelId) => {
  try {
    return await listModelVoices(modelId, ttsStore);
  } catch (error) {
    console.error(`[TTS] 목소리 목록 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[목소리 목록] ${modelId}`);
  }
});
ipcMain.handle('app:exportWav', async (_event, payload) => {
  try {
    return await exportWavFile(payload.filePath, payload.audioBuffer, payload.sampleRate || 22050);
  } catch (error) {
    throw toIpcError(error, `[WAV 저장] ${payload?.filePath}`);
  }
});
ipcMain.handle('app:exportMp3', async (_event, payload) => {
  try {
    return await exportMp3File(payload.filePath, payload.audioBuffer, payload.sampleRate || 22050, payload.bitrateKbps || 128);
  } catch (error) {
    throw toIpcError(error, `[MP3 저장] ${payload?.filePath}`);
  }
});
ipcMain.handle('app:reportRendererError', (_event, payload) => {
  console.error(`[Renderer] ${payload?.title || '오류'}\n${payload?.detail || ''}`);
  return { ok: true, logPath: getLogPath() };
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
