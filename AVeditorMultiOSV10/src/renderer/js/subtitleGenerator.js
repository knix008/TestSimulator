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

  // Whisper expects roughly [-1, 1]; boost quiet speech, clamp peaks
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length));
  // Quiet dialogue (common in narrated Korean video) → amplify toward ~0.1 RMS
  let gain = 1;
  if (rms > 1e-6 && rms < 0.04) {
    gain = Math.min(12, 0.1 / rms);
  }
  if (peak * gain > 0.95) {
    gain = Math.min(gain, 0.95 / peak);
  }
  if (Math.abs(gain - 1) > 0.02) {
    for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
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
  languageMode = 'auto',
  confidenceProfile = 'balanced',
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

  // Keep language decision independent from UI locale to reduce wrong-language
  // subtitles when media speech language differs from current app language.
  const localeCode = locale === 'ko' ? 'ko' : 'en';
  const normalizedMode = normalizeLanguageMode(languageMode);
  const profile = normalizeConfidenceProfile(confidenceProfile);
  const mode = normalizedMode.mode;

  let result;
  let usedLanguage = mode === 'auto' ? 'auto' : normalizedMode.code;
  let detectedLanguage = null;
  let detectionConfidence = 'low';
  try {
    const runWhisper = (extra = {}) => transcriber(samples, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      // Suppress decoder n-gram loops (common tiny-model hallucination)
      no_repeat_ngram_size: 3,
      ...extra,
    });

    if (mode === 'auto') {
      const candidates = [];
      const pushCandidate = (lang, value, expectedLang = null) => {
        const quality = transcriptionQualityScore(value);
        const fit = expectedLang ? languageFitBonus(value, expectedLang) : 0;
        candidates.push({
          lang,
          value,
          score: quality + fit,
        });
      };

      onProgress?.({ phase: 'stt', percent: 60, labelKey: 'subtitle.transcribing' });
      const autoResult = await runWhisper();
      const autoDetected = inferLanguageCodeFromResult(autoResult) || localeCode;
      pushCandidate(autoDetected, autoResult);

      // For mixed/noisy audio, probe en/ko as rescue candidates. This keeps
      // previous reliability for EN/KO while still supporting other languages
      // through Whisper auto-detection.
      onProgress?.({ phase: 'stt', percent: 70, labelKey: 'subtitle.transcribing' });
      const enResult = await runWhisper({ language: 'english' });
      pushCandidate('en', enResult, 'en');

      if (cancelled()) return { cues: [], duration, cancelled: true };

      const koResult = await runWhisper({ language: 'korean' });
      pushCandidate('ko', koResult, 'ko');

      let best = candidates.sort((a, b) => b.score - a.score)[0] || null;

      if (!best || best.score < 4) {
        onProgress?.({ phase: 'stt', percent: 78, labelKey: 'subtitle.transcribing' });
        const fallbackAuto = await runWhisper();
        const autoLang = inferLanguageCodeFromResult(fallbackAuto) || localeCode;
        const autoCandidate = {
          lang: autoLang,
          value: fallbackAuto,
          score: transcriptionQualityScore(fallbackAuto),
        };
        candidates.push(autoCandidate);
        best = candidates.sort((a, b) => b.score - a.score)[0] || autoCandidate;
      }

      result = best.value;
      usedLanguage = best.lang;
      detectedLanguage = inferLanguageCodeFromResult(result) || best.lang;
      detectionConfidence = estimateDetectionConfidence(candidates, best, detectedLanguage, profile);
    } else {
      const forced = normalizedMode.whisperLanguage || 'english';
      result = await runWhisper({ language: forced });
      usedLanguage = normalizedMode.code;
      detectedLanguage = inferLanguageCodeFromResult(result) || normalizedMode.code;
      detectionConfidence = isPoorTranscription(result) ? 'low' : 'medium';

      // If forced mode is very poor, retry once with auto as a safety fallback.
      if (isPoorTranscription(result)) {
        onProgress?.({ phase: 'stt', percent: 78, labelKey: 'subtitle.transcribing' });
        const autoResult = await runWhisper();
        if (transcriptionQualityScore(autoResult) > transcriptionQualityScore(result)) {
          result = autoResult;
          detectedLanguage = inferLanguageCodeFromResult(autoResult) || normalizedMode.code;
          usedLanguage = 'auto';
          detectionConfidence = 'medium';
        }
      }
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
  return {
    cues,
    duration,
    cancelled: false,
    raw: result,
    detectedLanguage: detectedLanguage || localeCode,
    usedLanguage,
    detectionConfidence,
  };
}

function detectDominantLanguageFromResult(result) {
  const text = collectResultText(result);
  return detectDominantLanguageFromText(text);
}

function inferLanguageCodeFromResult(result) {
  const raw = String(result?.language || result?.lang || '').trim().toLowerCase();
  if (raw) {
    const token = raw.match(/<\|([a-z]{2,3})\|>/i)?.[1] || raw;
    const normalized = normalizeLanguageMode(token);
    if (normalized?.code && normalized.code !== 'auto') return normalized.code;
  }
  return detectDominantLanguageFromResult(result);
}

function normalizeLanguageMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (!raw || raw === 'auto') {
    return { mode: 'auto', code: 'auto', whisperLanguage: null };
  }

  const aliases = {
    en: 'english',
    english: 'english',
    ko: 'korean',
    korean: 'korean',
    ja: 'japanese',
    japanese: 'japanese',
    zh: 'chinese',
    chinese: 'chinese',
    es: 'spanish',
    spanish: 'spanish',
    fr: 'french',
    french: 'french',
    de: 'german',
    german: 'german',
    it: 'italian',
    italian: 'italian',
    pt: 'portuguese',
    portuguese: 'portuguese',
    ru: 'russian',
    russian: 'russian',
    ar: 'arabic',
    arabic: 'arabic',
    hi: 'hindi',
    hindi: 'hindi',
    tr: 'turkish',
    turkish: 'turkish',
    vi: 'vietnamese',
    vietnamese: 'vietnamese',
    th: 'thai',
    thai: 'thai',
    id: 'indonesian',
    indonesian: 'indonesian',
    pl: 'polish',
    polish: 'polish',
    nl: 'dutch',
    dutch: 'dutch',
    sv: 'swedish',
    swedish: 'swedish',
    no: 'norwegian',
    norwegian: 'norwegian',
    da: 'danish',
    danish: 'danish',
    fi: 'finnish',
    finnish: 'finnish',
    cs: 'czech',
    czech: 'czech',
    ro: 'romanian',
    romanian: 'romanian',
    hu: 'hungarian',
    hungarian: 'hungarian',
    uk: 'ukrainian',
    ukrainian: 'ukrainian',
  };

  const whisperLanguage = aliases[raw] || raw;
  const code = whisperLanguageToCode(whisperLanguage);
  return {
    mode: 'forced',
    code,
    whisperLanguage,
  };
}

function whisperLanguageToCode(name) {
  const key = String(name || '').trim().toLowerCase();
  const map = {
    english: 'en',
    korean: 'ko',
    japanese: 'ja',
    chinese: 'zh',
    spanish: 'es',
    french: 'fr',
    german: 'de',
    italian: 'it',
    portuguese: 'pt',
    russian: 'ru',
    arabic: 'ar',
    hindi: 'hi',
    turkish: 'tr',
    vietnamese: 'vi',
    thai: 'th',
    indonesian: 'id',
    polish: 'pl',
    dutch: 'nl',
    swedish: 'sv',
    norwegian: 'no',
    danish: 'da',
    finnish: 'fi',
    czech: 'cs',
    romanian: 'ro',
    hungarian: 'hu',
    ukrainian: 'uk',
  };
  return map[key] || key;
}

function collectResultText(result) {
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (chunks.length) {
    return chunks
      .map((c) => String(c?.text || '').trim())
      .filter(Boolean)
      .join(' ');
  }
  return String(result?.text || '').trim();
}

function detectDominantLanguageFromText(text) {
  const src = String(text || '');
  if (!src.trim()) return null;

  let latin = 0;
  let hangul = 0;

  for (const ch of src) {
    if (/[A-Za-z]/.test(ch)) latin += 1;
    else if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(ch)) hangul += 1;
  }

  if (latin === 0 && hangul === 0) return null;
  if (hangul > latin * 1.15) return 'ko';
  if (latin > hangul * 1.15) return 'en';
  return hangul >= latin ? 'ko' : 'en';
}

function scoreTranscriptionForLanguage(result, lang) {
  return transcriptionQualityScore(result) + languageFitBonus(result, lang);
}

function languageFitBonus(result, lang) {
  const text = collectResultText(result);
  const trimmed = text.trim();
  if (!trimmed) return -12;

  let latin = 0;
  let hangul = 0;
  for (const ch of trimmed) {
    if (/[A-Za-z]/.test(ch)) latin += 1;
    else if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(ch)) hangul += 1;
  }
  const total = Math.max(1, latin + hangul);
  const latinRatio = latin / total;
  const hangulRatio = hangul / total;

  let score = 0;

  if (lang === 'ko') {
    score += hangulRatio * 14;
    score -= latinRatio * 6;
  } else if (lang === 'en') {
    score += latinRatio * 14;
    score -= hangulRatio * 6;
  }

  const dominant = detectDominantLanguageFromText(trimmed);
  if (dominant === lang) score += 3;
  else if (dominant && dominant !== lang) score -= 3;

  return score;
}

function transcriptionQualityScore(result) {
  const text = collectResultText(result);
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const trimmed = text.trim();
  if (!trimmed) return -100;
  if (isPoorTranscription(result)) return -80;

  let score = 0;
  score += Math.min(34, Math.log2(trimmed.length + 1) * 8);
  score += Math.min(12, chunks.length * 0.55);
  score += Math.min(8, new Set(trimmed.replace(/\s+/g, '')).size * 0.2);

  return score;
}

function estimateDetectionConfidence(candidates, best, detectedLanguage, profile) {
  const list = Array.isArray(candidates) ? candidates.slice().sort((a, b) => b.score - a.score) : [];
  if (!best || !list.length) return 'low';
  const top = Number(list[0]?.score || 0);
  const second = Number(list[1]?.score || (top - 0.1));
  const margin = top - second;
  const text = collectResultText(best.value);
  const len = String(text || '').replace(/\s+/g, '').length;
  const inferred = inferLanguageCodeFromResult(best.value);

  if (
    inferred && detectedLanguage && inferred === detectedLanguage
    && top >= profile.highTop && margin >= profile.highMargin && len >= profile.highLen
  ) {
    return 'high';
  }
  if (top >= profile.mediumTop && margin >= profile.mediumMargin && len >= profile.mediumLen) {
    return 'medium';
  }
  return 'low';
}

function normalizeConfidenceProfile(profile) {
  const v = String(profile || '').trim().toLowerCase();
  if (v === 'strict') {
    return {
      highTop: 14,
      highMargin: 5,
      highLen: 30,
      mediumTop: 8.5,
      mediumMargin: 2.4,
      mediumLen: 12,
    };
  }
  if (v === 'lenient') {
    return {
      highTop: 10,
      highMargin: 3,
      highLen: 18,
      mediumTop: 6,
      mediumMargin: 1.2,
      mediumLen: 8,
    };
  }
  return {
    highTop: 12,
    highMargin: 4,
    highLen: 24,
    mediumTop: 7,
    mediumMargin: 1.8,
    mediumLen: 10,
  };
}

/** True when Whisper output is empty or a known-style hallucination loop. */
function isLikelyHallucinationText(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  const t = raw.replace(/[\s.…·・\-_/\\|'"`~]+/g, '');
  if (!t) return true;

  // Single character/syllable repeated: 끌끌끌, ㅋㅋㅋ, aaa
  if (t.length >= 4) {
    const first = t[0];
    if ([...t].every((c) => c === first)) return true;
  }

  // Short n-gram repeated many times: 끌끌 / 감사합니다감사합니다…
  for (let n = 1; n <= Math.min(4, Math.floor(t.length / 4)); n += 1) {
    const gram = t.slice(0, n);
    if (!gram) continue;
    let pos = 0;
    let reps = 0;
    while (pos + n <= t.length && t.slice(pos, pos + n) === gram) {
      reps += 1;
      pos += n;
    }
    if (reps >= 4 && pos >= t.length * 0.85) return true;
  }

  // Very low unique-character diversity
  const unique = new Set([...t]).size;
  if (t.length >= 8 && unique <= 2) return true;

  // Stock Whisper silence phrases (ko/en)
  const normalized = raw.replace(/\s+/g, '').toLowerCase();
  const stock = [
    '시청해주셔서감사합니다',
    '구독과좋아요',
    'thankyouforwatching',
    'thanksforwatching',
    'pleasesubscribe',
    'mbc뉴스',
  ];
  if (stock.some((s) => normalized === s || normalized === `${s}.` || normalized === `${s}!`)) {
    return true;
  }

  return false;
}

function isPoorTranscription(result) {
  const text = String(result?.text || '').trim();
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (!text && !chunks.length) return true;
  if (isLikelyHallucinationText(text)) return true;
  if (chunks.length) {
    const bad = chunks.filter((c) => isLikelyHallucinationText(c?.text)).length;
    if (bad >= Math.max(1, Math.ceil(chunks.length * 0.5))) return true;
  }
  return false;
}

function normalizeWhisperResult(result, mediaDuration) {
  const cues = [];
  const chunks = Array.isArray(result?.chunks) ? result.chunks : null;
  const mediaDur = Number(mediaDuration) || 0;

  if (chunks?.length) {
    for (const ch of chunks) {
      const text = String(ch.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (isLikelyHallucinationText(text)) continue;
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
    if (text && !isLikelyHallucinationText(text)) {
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

/** Format cues as SAMI (SMI) text. */
export function cuesToSmi(cues) {
  const list = Array.isArray(cues) ? cues : [];
  const lines = [
    '<SAMI>',
    '<HEAD>',
    '<STYLE TYPE="text/css">',
    '<!--',
    'P { margin-left: 8pt; margin-right: 8pt; margin-bottom: 2pt; margin-top: 2pt; font-size: 20px; text-align: center; font-family: Arial, sans-serif; font-weight: bold; color: white; background-color: transparent; }',
    '.KRCC { Name: Korean; lang: ko-KR; SAMIType: CC; }',
    '-->',
    '</STYLE>',
    '</HEAD>',
    '<BODY>',
  ];

  for (const cue of list) {
    const startMs = Math.max(0, Math.round((Number(cue?.start) || 0) * 1000));
    const endMs = Math.max(startMs + 1, Math.round((Number(cue?.end) || 0) * 1000));
    const text = escapeHtml(String(cue?.text || '').trim()).replace(/\r?\n/g, '<br>');
    if (!text) continue;
    lines.push(`<SYNC Start=${startMs}><P Class=KRCC>${text}`);
    lines.push(`<SYNC Start=${endMs}><P Class=KRCC>&nbsp;`);
  }

  lines.push('</BODY>');
  lines.push('</SAMI>');
  return lines.join('\n');
}

/** Parse subtitle text to normalized cues (supports .srt and .smi). */
export function parseSubtitleText(text, ext = '.srt') {
  const raw = String(text || '');
  const type = String(ext || '').toLowerCase();
  const cues = (type === '.smi' || type === 'smi')
    ? parseSmi(raw)
    : parseSrt(raw);
  return normalizeParsedCues(cues);
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function parseSrt(text) {
  const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = src.split(/\n\s*\n+/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    const timeLineIdx = lines.findIndex((l) => /-->/.test(l));
    if (timeLineIdx < 0) continue;

    const timeLine = lines[timeLineIdx];
    const m = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/);
    if (!m) continue;
    const start = parseSrtTime(m[1]);
    const end = parseSrtTime(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const textLines = lines.slice(timeLineIdx + 1);
    const cueText = textLines.join('\n').trim();
    if (!cueText) continue;
    cues.push({ start, end, text: cueText });
  }
  return cues;
}

function parseSrtTime(v) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(String(m[4]).padEnd(3, '0'));
  return h * 3600 + mm * 60 + s + ms / 1000;
}

function parseSmi(text) {
  const src = String(text || '');
  const syncRe = /<sync\b[^>]*start\s*=\s*['\"]?(\d+)['\"]?[^>]*>([\s\S]*?)(?=<sync\b[^>]*start\s*=|$)/gi;
  const cues = [];
  let m;

  while ((m = syncRe.exec(src))) {
    const startMs = Number(m[1]);
    if (!Number.isFinite(startMs)) continue;
    const inner = String(m[2] || '');
    let cueText = inner
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\uFEFF/g, '');
    cueText = decodeHtmlEntities(cueText).replace(/[ \t]+/g, ' ').trim();
    cues.push({ start: startMs / 1000, text: cueText });
  }

  const out = [];
  for (let i = 0; i < cues.length; i += 1) {
    const cur = cues[i];
    const next = cues[i + 1];
    if (!cur.text || cur.text === '&nbsp;') continue;
    const end = next ? next.start : cur.start + Math.max(1.5, Math.min(8, cur.text.length * 0.08));
    if (end <= cur.start) continue;
    out.push({ start: cur.start, end, text: cur.text });
  }
  return out;
}

function normalizeParsedCues(cues) {
  const out = [];
  for (const c of Array.isArray(cues) ? cues : []) {
    const start = Math.max(0, Number(c?.start) || 0);
    const end = Math.max(start + 0.001, Number(c?.end) || 0);
    const text = String(c?.text || '').replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').trim();
    if (!text) continue;
    if (end <= start) continue;
    out.push({ start, end, text });
  }

  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
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
