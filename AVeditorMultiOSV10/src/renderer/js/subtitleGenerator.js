/**
 * Local speech-to-text subtitles via Transformers.js Whisper.
 * Works in Electron and web (model downloads once, then cached).
 *
 * Electron loads the browser build from ./vendor/transformers (synced from
 * node_modules on npm start). file:// pages cannot import CDN ES modules.
 */

let _pipelinePromise = null;
let _pipelineMod = null;
let _loadedScriptUrl = null;

const WHISPER_MODEL = 'Xenova/whisper-tiny';

function transformersCandidateUrls() {
  const list = [];
  // Same folder as index.html — works for Electron file:// and web builds
  try {
    list.push(new URL('vendor/transformers/transformers.min.js', window.location.href).href);
  } catch { /* ignore */ }

  // Dev web server proxy (npm run web)
  if (/^https?:$/i.test(window.location.protocol)) {
    list.push(`${window.location.origin}/xenova/dist/transformers.min.js`);
  }

  // CDN last resort (http(s) pages only; blocked from file://)
  if (/^https?:$/i.test(window.location.protocol)) {
    list.push('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
  }
  return list;
}

function wasmBaseForScript(scriptUrl) {
  try {
    return new URL('./', scriptUrl).href;
  } catch {
    return null;
  }
}

async function loadTransformers() {
  if (_pipelineMod) return _pipelineMod;
  let lastErr = null;
  for (const url of transformersCandidateUrls()) {
    try {
      const mod = await import(/* webpackIgnore: true */ url);
      if (!mod?.pipeline) throw new Error('Transformers.js loaded without pipeline export');
      _pipelineMod = mod;
      _loadedScriptUrl = url;
      return mod;
    } catch (err) {
      lastErr = err;
      console.warn('[subtitle] Transformers load failed:', url, err?.message || err);
    }
  }
  throw lastErr || new Error('Failed to load Transformers.js');
}

function progressCallback(onProgress, fromCache) {
  return (p) => {
    if (!onProgress || !p) return;
    if (p.status === 'progress' && p.total) {
      const pct = Math.round((p.loaded / p.total) * 100);
      onProgress({
        phase: 'model',
        percent: Math.min(40, Math.round(pct * 0.4)),
        labelKey: fromCache ? 'subtitle.loadingCachedModel' : 'subtitle.downloadingModel',
        labelParams: { percent: pct },
      });
    } else if (p.status === 'ready' || p.status === 'done') {
      onProgress({ phase: 'model', percent: 40, labelKey: 'subtitle.modelReady' });
    }
  };
}

/**
 * True when quantized Whisper weights are already on disk (no HF download needed).
 */
async function detectWhisperCached(proxyBase) {
  if (window.electronAPI?.isWhisperModelCached) {
    try {
      return !!(await window.electronAPI.isWhisperModelCached(WHISPER_MODEL));
    } catch { /* fall through */ }
  }
  if (proxyBase) {
    try {
      const res = await fetch(
        `${String(proxyBase).replace(/\/+$/, '')}/whisper-cache?model=${encodeURIComponent(WHISPER_MODEL)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        return !!data?.cached;
      }
    } catch { /* ignore */ }
  }
  if (/^https?:$/i.test(window.location.protocol)) {
    try {
      const res = await fetch(
        `${window.location.origin}/whisper-cache?model=${encodeURIComponent(WHISPER_MODEL)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        return !!data?.cached;
      }
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Configure ONNX Runtime + Hub hosts for Electron file:// vs http(s).
 * Electron file:// cannot fetch Hugging Face / CDN (CORS) — use loopback proxy.
 * @returns {{ fromCache: boolean }}
 */
async function configureTransformersEnv(env) {
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    // Threaded WASM workers break under Electron file:// (no COOP/COEP).
    wasm.numThreads = 1;
    wasm.proxy = false;
  }

  let proxyBase = null;

  // Electron: always prefer the main-process STT proxy (never the web :4173 server).
  if (window.electronAPI?.isElectron && window.electronAPI.getSttProxyBase) {
    try {
      proxyBase = await window.electronAPI.getSttProxyBase();
    } catch (err) {
      console.warn('[subtitle] STT proxy unavailable:', err?.message || err);
    }
    if (!proxyBase) {
      throw new Error(
        'Whisper STT proxy is not running. Restart the desktop app and try again.'
      );
    }
  }

  // Web (npm run web): same-origin /hf + /models
  const webOrigin = !proxyBase && /^https?:$/i.test(window.location.protocol)
    ? window.location.origin
    : null;

  const hubBase = proxyBase
    ? String(proxyBase).replace(/\/+$/, '')
    : webOrigin;

  const fromCache = hubBase ? await detectWhisperCached(hubBase) : false;

  // Probe /models (local layout). If missing (old server), still use /hf disk cache.
  let localModelsOk = false;
  if (hubBase && fromCache) {
    try {
      const probe = await fetch(
        `${hubBase}/models/${WHISPER_MODEL}/config.json`,
        { method: 'GET', cache: 'no-store' }
      );
      localModelsOk = probe.ok;
    } catch {
      localModelsOk = false;
    }
  }

  if (hubBase) {
    env.remoteHost = `${hubBase}/hf/`;
    env.useBrowserCache = !proxyBase;
    env.allowRemoteModels = true;
    env.allowLocalModels = localModelsOk;
    if (localModelsOk) {
      env.localModelPath = `${hubBase}/models/`;
    }
    if (wasm) {
      if (proxyBase) {
        wasm.wasmPaths = `${hubBase}/xenova-wasm/`;
      } else {
        const localBase = wasmBaseForScript(_loadedScriptUrl);
        if (localBase) wasm.wasmPaths = localBase;
        else wasm.wasmPaths = `${hubBase}/xenova/dist/`;
      }
    }
    console.info(
      '[subtitle] model hub',
      hubBase,
      fromCache ? (localModelsOk ? '(local /models)' : '(disk cache via /hf)') : '(download if needed)'
    );
    return { fromCache, localModelsOk };
  }

  // file:// without Electron proxy — last resort (usually blocked by CORS)
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  if (wasm) {
    const isFile = window.location.protocol === 'file:';
    if (isFile) {
      wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
    } else {
      const localBase = wasmBaseForScript(_loadedScriptUrl);
      if (localBase) wasm.wasmPaths = localBase;
    }
  }
  return { fromCache: false, localModelsOk: false };
}

async function getTranscriber(onProgress) {
  // Reuse loaded Whisper pipeline for the whole session (no re-download per generate).
  if (_pipelinePromise) {
    onProgress?.({ phase: 'model', percent: 40, labelKey: 'subtitle.modelReady' });
    return _pipelinePromise;
  }

  _pipelinePromise = (async () => {
    const mod = await loadTransformers();
    const {
      env,
      AutoModelForSpeechSeq2Seq,
      AutoTokenizer,
      AutoProcessor,
      AutomaticSpeechRecognitionPipeline,
    } = mod;

    if (!AutoModelForSpeechSeq2Seq || !AutomaticSpeechRecognitionPipeline) {
      throw new Error('Transformers.js build is missing Whisper ASR exports');
    }

    const { fromCache } = await configureTransformersEnv(env);
    const progress_callback = progressCallback(onProgress, fromCache);

    onProgress?.({
      phase: 'model',
      percent: 22,
      labelKey: fromCache ? 'subtitle.loadingCachedModel' : 'subtitle.loadingWhisper',
      labelParams: { percent: 0 },
    });

    // Do NOT set local_files_only — /models may be unavailable while /hf disk cache works.
    const loadOpts = {
      quantized: true,
      progress_callback,
    };

    let model;
    try {
      model = await AutoModelForSpeechSeq2Seq.from_pretrained(WHISPER_MODEL, loadOpts);
    } catch (err) {
      throw new Error(`Failed to load Whisper model: ${err?.message || err}`);
    }

    const [tokenizer, processor] = await Promise.all([
      AutoTokenizer.from_pretrained(WHISPER_MODEL, { progress_callback }),
      AutoProcessor.from_pretrained(WHISPER_MODEL, { progress_callback }),
    ]);

    onProgress?.({ phase: 'model', percent: 40, labelKey: 'subtitle.modelReady' });

    return new AutomaticSpeechRecognitionPipeline({
      task: 'automatic-speech-recognition',
      model,
      tokenizer,
      processor,
    });
  })().catch((err) => {
    _pipelinePromise = null;
    throw err;
  });

  return _pipelinePromise;
}

/**
 * Decode media URL/path to mono Float32Array @ 16 kHz for Whisper.
 * Uses OfflineAudioContext for high-quality resampling (linear resample hurts STT).
 */
export async function extractMono16kFloat32(preview, onProgress) {
  onProgress?.({ phase: 'audio', percent: 5, labelKey: 'subtitle.extractingAudio' });

  const buf = await readMediaArrayBuffer(preview);
  onProgress?.({ phase: 'audio', percent: 12, labelKey: 'subtitle.decodingAudio' });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded;
  try {
    // decodeAudioData detaches the buffer — pass a copy
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch (err) {
    throw new Error(
      `Audio decode failed (browser cannot decode this codec/container): ${err?.message || err}`
    );
  } finally {
    await ctx.close().catch(() => {});
  }

  if (!decoded?.length) throw new Error('Decoded audio is empty');

  const samples = await resampleToMono16k(decoded);
  if (!samples?.length) throw new Error('Resampled audio is empty');

  // Whisper expects roughly [-1, 1]; clamp pathological peaks
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1.05) {
    const inv = 1 / peak;
    for (let i = 0; i < samples.length; i += 1) samples[i] *= inv;
  }

  onProgress?.({ phase: 'audio', percent: 20, labelKey: 'subtitle.audioReady' });
  return { samples, sampleRate: 16000, duration: samples.length / 16000 };
}

async function resampleToMono16k(audioBuffer) {
  const targetRate = 16000;
  const mono = mixToMono(audioBuffer);
  if (audioBuffer.sampleRate === targetRate) return mono;

  // Build a mono AudioBuffer then render at 16 kHz
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) {
    return resampleLinear(mono, audioBuffer.sampleRate, targetRate);
  }

  const frames = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
  const offline = new OfflineCtx(1, frames, targetRate);
  const tmpBuf = offline.createBuffer(1, mono.length, audioBuffer.sampleRate);
  tmpBuf.copyToChannel(mono, 0);
  const src = offline.createBufferSource();
  src.buffer = tmpBuf;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(0);
}

function toArrayBuffer(data) {
  if (!data) throw new Error('Empty binary data');
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  // Electron sometimes clones Buffer as { type: 'Buffer', data: number[] }
  if (data?.type === 'Buffer' && Array.isArray(data.data)) {
    return Uint8Array.from(data.data).buffer;
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data).buffer;
  }
  throw new Error('Unsupported binary data from IPC');
}

async function readMediaArrayBuffer(preview) {
  const el = preview?.mediaEl;
  if (!el) throw new Error('No media element');

  // Prefer known disk path (Electron) — most reliable for file:// media.
  const diskPath = preview.currentFile?.path;
  if (diskPath && window.electronAPI?.readBinaryFile && window.electronAPI?.isElectron) {
    const res = await window.electronAPI.readBinaryFile(diskPath);
    if (res?.ok && res.data) return toArrayBuffer(res.data);
    if (res && !res.ok) {
      console.warn('[subtitle] readBinaryFile failed:', res.error);
    }
  }

  const src = el.currentSrc || el.src;
  if (!src) throw new Error('Media has no source');

  if (/^(blob:|https?:|data:)/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`);
    return res.arrayBuffer();
  }

  if (src.startsWith('file:') && window.electronAPI?.readBinaryFile) {
    let filePath = src.replace(/^file:\/\//i, '');
    try { filePath = decodeURIComponent(filePath); } catch { /* keep */ }
    // Windows: file:///C:/... or file://C:/...
    if (filePath.startsWith('/') && /^[A-Za-z]:/.test(filePath.slice(1))) {
      filePath = filePath.slice(1);
    }
    if (window.electronAPI.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
    const res = await window.electronAPI.readBinaryFile(filePath);
    if (!res?.ok || !res.data) throw new Error(res?.error || 'Failed to read media file');
    return toArrayBuffer(res.data);
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch media (${res.status})`);
  return res.arrayBuffer();
}

function mixToMono(audioBuffer) {
  const { numberOfChannels, length } = audioBuffer;
  if (numberOfChannels === 1) return audioBuffer.getChannelData(0).slice(0);
  const out = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c += 1) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) out[i] += ch[i] / numberOfChannels;
  }
  return out;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

/**
 * Generate subtitle cues from preview media.
 * @returns {Promise<{cues: Array<{start:number,end:number,text:string}>, duration:number}>}
 */
export async function generateSubtitlesFromPreview(preview, {
  locale = 'en',
  onProgress = null,
  cancelled = () => false,
} = {}) {
  const { samples, duration } = await extractMono16kFloat32(preview, onProgress);
  if (cancelled()) return { cues: [], duration, cancelled: true };

  console.info('[subtitle] audio ready', {
    samples: samples.length,
    durationSec: Number(duration.toFixed(2)),
    locale,
  });

  onProgress?.({ phase: 'stt', percent: 45, labelKey: 'subtitle.loadingWhisper' });
  const transcriber = await getTranscriber(onProgress);
  if (cancelled()) return { cues: [], duration, cancelled: true };

  onProgress?.({ phase: 'stt', percent: 55, labelKey: 'subtitle.transcribing' });

  // Do NOT force UI locale as Whisper language on the first pass — wrong language
  // yields empty/garbage text. Auto-detect when `language` is omitted.
  // Important: Transformers.js mutates the options object (sets forced_decoder_ids).
  // Always pass a fresh object; never reuse / spread a previous call's options.
  let result;
  try {
    const runWhisper = (extra = {}) => transcriber(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      ...extra,
    });

    result = await runWhisper();

    const text = String(result?.text || '').trim();
    const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
    const hasUseful = text.length > 0 || chunks.some((c) => String(c?.text || '').trim());

    // Retry once with an explicit language hint if auto produced nothing
    if (!hasUseful && (locale === 'ko' || locale === 'en')) {
      onProgress?.({ phase: 'stt', percent: 70, labelKey: 'subtitle.transcribing' });
      result = await runWhisper({
        language: locale === 'ko' ? 'korean' : 'english',
      });
    }
  } catch (err) {
    console.error('[subtitle] whisper error', err);
    throw new Error(`Whisper transcription failed: ${err?.message || err}`);
  }

  if (cancelled()) return { cues: [], duration, cancelled: true };

  console.info('[subtitle] whisper raw', {
    text: String(result?.text || '').slice(0, 200),
    chunks: Array.isArray(result?.chunks) ? result.chunks.length : 0,
  });

  const cues = normalizeWhisperResult(result, duration);
  onProgress?.({ phase: 'done', percent: 100, labelKey: 'subtitle.done' });
  return { cues, duration, cancelled: false, raw: result };
}

function normalizeWhisperResult(result, mediaDuration) {
  const cues = [];
  const chunks = Array.isArray(result?.chunks) ? result.chunks : null;
  const mediaDur = Number(mediaDuration) || 0;

  if (chunks?.length) {
    for (const ch of chunks) {
      const text = String(ch.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      // Skip Whisper hallucination placeholders
      if (/^[\s.[\]()]*$/.test(text) || text === '...' || text === '……') continue;

      let start = 0;
      let end = 0;
      const ts = ch.timestamp;
      if (Array.isArray(ts)) {
        start = Number(ts[0]);
        end = Number(ts[1]);
      }
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end <= start) {
        // Estimate duration from text length (~12 chars/sec speaking rate)
        const est = Math.max(1.2, Math.min(8, text.length * 0.08));
        end = start + est;
      }
      if (mediaDur > 0) {
        start = Math.min(start, mediaDur);
        end = Math.min(end, mediaDur);
      }
      if (end <= start && mediaDur > 0) {
        end = Math.min(mediaDur, start + 1.5);
      }
      if (end <= start) continue;
      cues.push({ start, end, text });
    }
  }

  if (!cues.length) {
    const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
    if (text && text !== '...' && text !== '……') {
      cues.push({
        start: 0,
        end: Math.max(1.5, mediaDur || 3),
        text,
      });
    }
  }

  // Merge overlapping / adjacent identical fragments
  const merged = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (
      prev
      && c.text === prev.text
      && c.start <= prev.end + 0.35
    ) {
      prev.end = Math.max(prev.end, c.end);
      continue;
    }
    if (
      prev
      && c.start <= prev.end + 0.15
      && c.text.startsWith(prev.text)
    ) {
      prev.end = Math.max(prev.end, c.end);
      prev.text = c.text;
      continue;
    }
    merged.push({ ...c });
  }

  return merged.filter((c) => c.text && c.end > c.start);
}

/** Format cues as SRT text. */
export function cuesToSrt(cues) {
  const lines = [];
  (cues || []).forEach((c, i) => {
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}`);
    lines.push(c.text);
    lines.push('');
  });
  return lines.join('\n');
}

function formatSrtTime(sec) {
  const msTotal = Math.max(0, Math.round(Number(sec) * 1000));
  const h = Math.floor(msTotal / 3600000);
  const m = Math.floor((msTotal % 3600000) / 60000);
  const s = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

/** Find active cue at media time. */
export function cueAtTime(cues, t) {
  const time = Number(t) || 0;
  if (!Array.isArray(cues) || !cues.length) return null;
  for (let i = 0; i < cues.length; i += 1) {
    const c = cues[i];
    if (time >= c.start && time < c.end) return c;
  }
  return null;
}
