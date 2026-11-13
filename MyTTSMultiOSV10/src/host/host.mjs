/**
 * MyTTS — the Node host. Tauri (src-tauri) owns the window, file dialogs and the
 * clipboard; everything that needs Node runs here, unchanged from the Electron main process:
 * the model catalog and downloads (src/core/modelStore.js), synthesis with onnxruntime-node
 * and sherpa-onnx-node (src/core/ttsService.js), WAV / MP3 export and the log file.
 *
 * Audio crosses the line protocol as base64 Float32 PCM (`audioBase64`): a JSON number array
 * is several times larger and long clips would exhaust the webview (see tauri-bridge.js).
 *
 * If a native addon kills this process, Tauri starts a new host; the crash marker written
 * before native work (appLog.beginNativeOp) is reported by that new host on start.
 */
import { emit, call, handle, ready, start } from './rpc.mjs';
import { decodeAudio, encodeAudio } from './audio.mjs';
import { ensureModelCatalog, getDefaultCacheDirectory, getModelCatalog } from '../core/modelCatalog.js';
import { createModelStore } from '../core/modelStore.js';
import { exportWavFile } from '../core/wav.js';
import { exportMp3File } from '../core/mp3.js';
import { synthesizeText, warmModel, listModelVoices } from '../core/ttsService.js';
import { ensureSherpaNativePath } from '../core/ortNative.js';
import { terminateOrtChild } from '../core/ortChildClient.js';
import { describeError, getLogPath, installFileLogging, readLogTail, takePendingNativeCrash } from '../core/appLog.js';

installFileLogging();
// Must be read before any native load so a crash marker from the previous run is not overwritten.
const pendingNativeCrash = takePendingNativeCrash();

// Renderer splits error messages on this marker: summary before, full report after.
const ERROR_DETAIL_MARKER = '\n\n[상세 정보]\n';
const toIpcError = (error, context) => {
  const summary = error?.message || String(error ?? '알 수 없는 오류');
  return new Error(`${summary}${ERROR_DETAIL_MARKER}${describeError(error, context)}`);
};

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  emit('app:error', { title: '예기치 않은 오류가 발생했습니다.', detail: describeError(error, '[uncaughtException]') });
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  emit('app:error', { title: '처리되지 않은 오류가 발생했습니다.', detail: describeError(reason, '[unhandledRejection]') });
});

// Prefer sherpa's DLLs before any OfflineTts load (do not preload onnxruntime-node —
// its onnxruntime.dll conflicts with sherpa-onnx-win-x64 and can abort the process).
ensureSherpaNativePath();
const ttsStore = createModelStore();

// ── channels (names kept from the Electron preload) ─────────────────────────
handle('app:getModelCatalog', () => getModelCatalog());
handle('app:getCachedModels', () => createModelStore().listCachedModels());
handle('app:getCacheDirectory', () => getDefaultCacheDirectory());

handle('app:downloadAndPrepareModel', async (modelId) => {
  const store = createModelStore();
  console.log(`[Download] 시작: ${modelId}`);
  let lastLoggedPercent = -1;
  let lastSent = 0;
  try {
    const result = await store.ensureModelAvailable(modelId, (progress) => {
      const percent = Number(progress?.percent) || 0;
      if (progress?.phase !== 'download' || percent === 100 || percent === 0 || Math.floor(percent / 5) !== Math.floor(lastLoggedPercent / 5)) {
        lastLoggedPercent = percent;
        console.log(`[Download] ${modelId} ${percent}% — ${progress?.fileName || progress?.phase || ''}`);
      }
      // At most ~20 progress events a second: each one crosses two processes.
      const now = Date.now();
      if (progress?.phase === 'download' && percent > 0 && percent < 100 && now - lastSent < 50) return;
      lastSent = now;
      emit('app:modelDownloadProgress', progress);
    });
    console.log(`[Download] 완료: ${modelId} (downloaded=${result.downloaded})`);
    return result;
  } catch (error) {
    console.error(`[Download] 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[모델 다운로드] ${modelId}`);
  }
});

handle('app:deleteModel', async (modelId) => {
  try {
    const result = await createModelStore().deleteModel(modelId);
    console.log(`[Model] 삭제: ${modelId}`);
    return result;
  } catch (error) {
    console.error(`[Model] 삭제 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[모델 삭제] ${modelId}`);
  }
});

handle('app:speak', async (payload) => {
  try {
    const result = await synthesizeText({
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
    const { audioBuffer, ...rest } = result || {};
    return { ...rest, audioBase64: encodeAudio(audioBuffer), sampleCount: audioBuffer?.length ?? 0 };
  } catch (error) {
    console.error(`[TTS] 합성 실패: ${payload?.modelId}\n`, error);
    throw toIpcError(error, `[음성 합성] 모델=${payload?.modelId} 언어=${payload?.language || '-'}`);
  }
});

handle('app:warmModel', async (modelId) => {
  try {
    return await warmModel(modelId, ttsStore);
  } catch (error) {
    console.error(`[TTS] 엔진 준비 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[엔진 준비] ${modelId}`);
  }
});

handle('app:listModelVoices', async (modelId) => {
  try {
    return await listModelVoices(modelId, ttsStore);
  } catch (error) {
    console.error(`[TTS] 목소리 목록 실패: ${modelId}\n`, error);
    throw toIpcError(error, `[목소리 목록] ${modelId}`);
  }
});

handle('app:exportWav', async (payload) => {
  try {
    return await exportWavFile(payload.filePath, decodeAudio(payload), payload.sampleRate || 22050);
  } catch (error) {
    throw toIpcError(error, `[WAV 저장] ${payload?.filePath}`);
  }
});

handle('app:exportMp3', async (payload) => {
  try {
    return await exportMp3File(payload.filePath, decodeAudio(payload), payload.sampleRate || 22050, payload.bitrateKbps || 128);
  } catch (error) {
    throw toIpcError(error, `[MP3 저장] ${payload?.filePath}`);
  }
});

handle('app:reportRendererError', (payload) => {
  console.error(`[Renderer] ${payload?.title || '오류'}\n${payload?.detail || ''}`);
  return { ok: true, logPath: getLogPath() };
});

// The model to download again after a crash recovery (the page asks once it listens).
let redownloadModelId = null;
handle('app:takeRedownload', () => {
  const id = redownloadModelId;
  redownloadModelId = null;
  return id;
});

/** The previous run died inside native code (no JS error was possible) — explain it now. */
async function reportPendingNativeCrash() {
  if (!pendingNativeCrash) return;
  const crash = pendingNativeCrash;
  console.error(`[Error] 이전 실행이 네이티브 작업 중 비정상 종료됨: ${JSON.stringify(crash)}`);
  const detail = [
    `작업: ${crash.op || '-'}`,
    `모델: ${crash.modelId || '-'}`,
    `폴더: ${crash.modelDir || '-'}`,
    `시각: ${crash.startedAt || '-'}`,
    '',
    '모델 파일이 손상되었거나 다운로드가 완전하지 않으면 음성 엔진이 오류 메시지 없이 종료될 수 있습니다.',
    crash.modelId ? '「모델 삭제 후 다시 받기」를 누르면 해당 모델을 지우고 처음부터 다시 다운로드합니다.' : '',
    '',
    `최근 로그:\n${readLogTail(20)}`,
    '',
    `로그 파일: ${getLogPath()}`,
  ].join('\n');
  const title = '이전 실행에서 음성 엔진이 비정상 종료되었습니다.';
  if (!crash.modelId) {
    await call('dialog.message', { title, message: `${title}\n\n${detail}`, kind: 'error' }).catch(() => {});
    return;
  }
  const again = await call('dialog.ask', { title, message: `${title}\n\n${detail}`, ok: '모델 삭제 후 다시 받기', cancel: '닫기' }).catch(() => false);
  if (!again) return;
  try {
    await ttsStore.deleteModel(crash.modelId);
    console.log(`[Model] 크래시 복구 삭제: ${crash.modelId}`);
    redownloadModelId = crash.modelId;
    emit('app:redownloadModel', crash.modelId);
  } catch (error) {
    await call('dialog.message', { title: '모델 삭제에 실패했습니다.', message: describeError(error, crash.modelId), kind: 'error' }).catch(() => {});
  }
}

start(() => terminateOrtChild());
await ensureModelCatalog().catch((error) => console.error('[Catalog] 준비 실패', error));
ready();
void reportPendingNativeCrash();
