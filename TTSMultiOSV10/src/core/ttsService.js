import { formatError } from './errorDialog.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureOrtNativePath } from './ortNative.js';
import {
  createChildOrtSession,
  isElectronProcess,
} from './ortChildClient.js';

const require = createRequire(import.meta.url);

// ── Korean → Latin romanization for Meta MMS-TTS (uroman-style) ──────────────
// MMS-TTS-kor expects Latin letters (vocab size 25). Hangul is romanized first.
const RR_CHO  = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const RR_JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const RR_JONG = ['','k','k','k','n','n','n','t','l','k','m','l','l','l','l','l','m','p','p','t','t','ng','t','t','k','t','p','t'];

function romanizeKorean(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00;
      const cho = Math.floor(offset / (21 * 28));
      const jung = Math.floor((offset % (21 * 28)) / 28);
      const jong = offset % 28;
      out += RR_CHO[cho] + RR_JUNG[jung] + RR_JONG[jong];
    } else if (/[A-Za-z0-9' \-]/.test(ch)) {
      out += ch;
    } else if (/\s/.test(ch)) {
      out += ' ';
    }
  }
  return out;
}

/** Apply VitsTokenizer-style MMS normalizers: lowercase, filter, blank-"u" insert. */
function prepareMmsText(text) {
  const roman = romanizeKorean(text).toLowerCase();
  // Keep chars present in MMS-kor vocab (excluding <unk>)
  const filtered = roman.replace(/[^u_twsoyahij\-kbc'nldgr emp]/g, '').trim();
  if (!filtered) return '';
  // Insert blank token "u" before every char and at the end
  let withBlanks = '';
  for (const ch of filtered) withBlanks += `u${ch}`;
  withBlanks += 'u';
  return withBlanks;
}

function normalizeAudio(samples) {
  let audio = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  let peak = 0;
  for (const v of audio) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  if (peak > 0.01) {
    const scale = 0.9 / peak;
    const normalized = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) normalized[i] = audio[i] * scale;
    audio = normalized;
  }
  return audio;
}

function toResult(audio, sampleRate) {
  // Keep Float32Array — structured clone across Worker/IPC is far cheaper than Array.from(number[]).
  const normalized = normalizeAudio(audio);
  return { audioBuffer: normalized, sampleRate };
}

// ── Find files in model directory ────────────────────────────────────────────
async function findOnnxFile(modelDir, preferred = []) {
  for (const rel of preferred) {
    const p = path.join(modelDir, rel);
    try { await fs.access(p); return p; } catch { /* continue */ }
  }

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isDirectory()) {
        const found = await scan(path.join(dir, e.name));
        if (found) return found;
      } else if (e.name.endsWith('.onnx')) {
        return path.join(dir, e.name);
      }
    }
    return null;
  }
  return scan(modelDir);
}

async function findFileByName(modelDir, names) {
  for (const name of names) {
    const p = path.join(modelDir, name);
    try { await fs.access(p); return p; } catch { /* continue */ }
  }
  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const found = await scan(full);
        if (found) return found;
      } else if (names.includes(e.name)) {
        return full;
      }
    }
    return null;
  }
  return scan(modelDir);
}

async function loadVocab(modelDir) {
  if (vocabCache.has(modelDir)) return vocabCache.get(modelDir);

  let vocab = null;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(modelDir, 'tokenizer.json'), 'utf-8'));
    if (Array.isArray(raw.model?.vocab)) {
      vocab = {};
      raw.model.vocab.forEach(([tok], idx) => { vocab[tok] = idx; });
    } else if (raw.model?.vocab && typeof raw.model.vocab === 'object') {
      vocab = raw.model.vocab;
    }
  } catch { /* continue */ }

  if (!vocab) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(modelDir, 'vocab.json'), 'utf-8'));
      if (typeof raw === 'object' && !Array.isArray(raw)) vocab = raw;
    } catch { /* continue */ }
  }

  if (vocab) vocabCache.set(modelDir, vocab);
  return vocab;
}

function tokenizeMms(text, vocab, vocabSize = 25) {
  const ids = [];
  for (const ch of text) {
    const id = vocab[ch];
    if (id === undefined) continue;
    // Embedding table is vocab_size (0..vocabSize-1); skip <unk> if out of range
    if (id < 0 || id >= vocabSize) continue;
    ids.push(id);
  }
  return ids;
}

// ── ONNX session cache ───────────────────────────────────────────────────────
const sessionCache = new Map();
const sherpaCache = new Map();
const voiceBinCache = new Map();
const vocabCache = new Map();
let phonemizeFnPromise = null;
let phonemizerWarmed = false;
let ortPromise = null;
/** @type {'node'|'node-child'|null} */
let ortBackend = null;

async function getOrt() {
  if (!ortPromise) {
    ortPromise = (async () => {
      const bindingDir = ensureOrtNativePath();
      if (bindingDir) console.log(`[TTS] ORT native path: ${bindingDir}`);

      // Electron on this Windows host cannot dlopen onnxruntime_binding.node
      // ("The operating system cannot run %1"). Use system Node child instead.
      if (isElectronProcess()) {
        ortBackend = 'node-child';
        console.log('[TTS] ORT backend: onnxruntime-node (system Node child)');
        return { kind: 'child' };
      }

      try {
        const ort = require('onnxruntime-node');
        if (!ort?.InferenceSession) throw new Error('InferenceSession 없음');
        ortBackend = 'node';
        console.log('[TTS] ORT backend: onnxruntime-node (in-process)');
        return { kind: 'local', ort };
      } catch (error) {
        console.warn(`[TTS] in-process ORT 실패, Node 자식으로 전환: ${error?.message || error}`);
        ortBackend = 'node-child';
        return { kind: 'child' };
      }
    })();
  }
  return ortPromise;
}

function listOrtBackendNames(ort) {
  try {
    const list = typeof ort.listSupportedBackends === 'function' ? ort.listSupportedBackends() : [];
    return Array.isArray(list) ? list.map((b) => b?.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildSessionOptions(ort, { preferGpu = true } = {}) {
  const backends = ort ? listOrtBackendNames(ort) : [];
  const providers = [];
  if (
    preferGpu
    && ortBackend === 'node'
    && process.platform === 'win32'
    && backends.includes('dml')
  ) {
    providers.push('dml');
  }
  providers.push('cpu');

  const opts = {
    executionProviders: providers,
    // 'all' crashes on Kokoro q8f16 (ACCESS_VIOLATION / exit 0xC0000005) with ORT 1.27.
    graphOptimizationLevel: 'extended',
  };

  if (providers[0] === 'dml') {
    opts.enableMemPattern = false;
    opts.executionMode = 'sequential';
  } else {
    const cores = os.cpus()?.length || 4;
    opts.intraOpNumThreads = Math.min(8, Math.max(2, cores - 1));
    opts.interOpNumThreads = 1;
  }

  return opts;
}

async function getOrtSession(cacheKey, onnxPath, { preferGpu = true } = {}) {
  const fullKey = `${cacheKey}|gpu=${preferGpu ? 1 : 0}`;
  if (sessionCache.has(fullKey)) return sessionCache.get(fullKey);
  if (sessionCache.has(cacheKey)) return sessionCache.get(cacheKey);

  const runtime = await getOrt();
  const options = buildSessionOptions(runtime.kind === 'local' ? runtime.ort : null, { preferGpu });
  console.log(
    `[TTS] ONNX 세션 생성: ${path.basename(onnxPath)} backend=${ortBackend} ep=[${options.executionProviders.join(',')}]`,
  );

  let entry;
  if (runtime.kind === 'child') {
    try {
      entry = await createChildOrtSession(fullKey, onnxPath, options);
    } catch (error) {
      if (options.executionProviders.includes('dml')) {
        console.warn(`[TTS] child DML 실패, CPU로 재시도: ${error?.message || error}`);
        entry = await createChildOrtSession(fullKey, onnxPath, {
          ...options,
          executionProviders: ['cpu'],
        });
        entry.usedGpu = false;
      } else {
        throw error;
      }
    }
  } else {
    const ort = runtime.ort;
    let session;
    let usedGpu = options.executionProviders.includes('dml');
    try {
      session = await ort.InferenceSession.create(onnxPath, options);
    } catch (error) {
      if (usedGpu) {
        console.warn(`[TTS] DML 세션 실패, CPU로 재시도: ${error?.message || error}`);
        usedGpu = false;
        const cpuOpts = buildSessionOptions(ort, { preferGpu: false });
        session = await ort.InferenceSession.create(onnxPath, cpuOpts);
      } else {
        throw error;
      }
    }
    entry = { session, ort, backend: ortBackend, usedGpu };
  }

  console.log(
    `[TTS] 입력: [${entry.session.inputNames}]  출력: [${entry.session.outputNames}] `
    + `ep=${entry.usedGpu ? 'dml' : 'cpu'} backend=${entry.backend || ortBackend}`,
  );
  sessionCache.set(fullKey, entry);
  return entry;
}

function kokoroOnnxCandidates({ forGpu = false } = {}) {
  // Embedded package ships q8f16 (~82MB). Prefer it; keep larger variants as optional fallbacks.
  if (forGpu) {
    return [
      'onnx/model_q8f16.onnx',
      'onnx/model_fp16.onnx',
      'onnx/model_quantized.onnx',
      'onnx/model.onnx',
      'model.onnx',
    ];
  }
  return [
    'onnx/model_q8f16.onnx',
    'onnx/model_quantized.onnx',
    'onnx/model_uint8f16.onnx',
    'onnx/model.onnx',
    'model.onnx',
  ];
}

async function resolveKokoroOnnxPath(modelDir) {
  const runtime = await getOrt();
  const wantGpu = ortBackend === 'node'
    && runtime.kind === 'local'
    && process.platform === 'win32'
    && listOrtBackendNames(runtime.ort).includes('dml');

  if (wantGpu) {
    const gpuPath = await findOnnxFile(modelDir, kokoroOnnxCandidates({ forGpu: true }));
    if (gpuPath) return { onnxPath: gpuPath, preferGpu: true };
  }
  const cpuPath = await findOnnxFile(modelDir, kokoroOnnxCandidates({ forGpu: false }));
  return { onnxPath: cpuPath, preferGpu: false };
}

// ── Piper KSS (phoneme_type: pygoruut — must use goruut IPA, not KoreanG2P) ───
async function synthesizePiper(text, modelId, modelDir, { speed = 1 } = {}) {
  const onnxPath = await findOnnxFile(modelDir, [
    'piper-kss-korean.onnx',
    'model.onnx',
  ]);
  if (!onnxPath) throw new Error(`Piper ONNX 파일 없음: ${modelDir}`);

  const configPath = await findFileByName(modelDir, [
    'piper-kss-korean.onnx.json',
    `${path.basename(onnxPath)}.json`,
    'config.json',
  ]);
  if (!configPath) throw new Error(`Piper 설정 파일 없음: ${modelDir}`);

  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  const phonemeType = config.phoneme_type || 'pygoruut';
  if (phonemeType !== 'pygoruut') {
    console.warn(`[TTS] Piper phoneme_type=${phonemeType}; expected pygoruut`);
  }

  const { phonemizeWithGoruut, ipaToPiperTokens } = await import('./goruutPhonemizer.js');
  const { Encoder } = await import('@piper-plus/g2p/encode');

  const langName = config.language?.code || config.espeak?.voice || 'Korean';
  const ipa = await phonemizeWithGoruut(text.trim(), langName);
  const idMap = config.phoneme_id_map || {};
  const tokens = ipaToPiperTokens(ipa, idMap);
  if (!tokens.length) throw new Error(`Piper 음소 변환 결과 없음 (ipa 길이=${ipa.length})`);

  const encoder = new Encoder(idMap);
  const { phonemeIds } = encoder.encode(tokens);
  if (phonemeIds.length < 3) throw new Error('Piper phoneme ID 생성 실패');

  const { session, ort } = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
  const lengthScale = Math.max(0.25, Math.min(4, (config.inference?.length_scale ?? 1) / Math.max(0.1, speed)));
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(phonemeIds.map(BigInt)), [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([
      config.inference?.noise_scale ?? 0.667,
      lengthScale,
      config.inference?.noise_w ?? 0.8,
    ]), [3]),
  };

  console.log(`[TTS] Piper(pygoruut) ipaChars=${[...ipa].length} tokens=${tokens.length} ids=${phonemeIds.length}`);
  const results = await session.run(feeds);
  const audio = results[session.outputNames[0]].data;
  return toResult(audio, config.audio?.sample_rate || 22050);
}

// ── Supertonic (sherpa-onnx) ─────────────────────────────────────────────────
function getSherpa() {
  // CommonJS native addon — must use require
  return require('sherpa-onnx-node');
}

function getSherpaTts(modelId, modelDir) {
  if (sherpaCache.has(modelId)) return sherpaCache.get(modelId);

  const sherpa = getSherpa();
  const join = (name) => path.join(modelDir, name);
  const config = {
    model: {
      supertonic: {
        durationPredictor: join('duration_predictor.int8.onnx'),
        textEncoder: join('text_encoder.int8.onnx'),
        vectorEstimator: join('vector_estimator.int8.onnx'),
        vocoder: join('vocoder.int8.onnx'),
        ttsJson: join('tts.json'),
        unicodeIndexer: join('unicode_indexer.bin'),
        voiceStyle: join('voice.bin'),
      },
      debug: 0,
      numThreads: 2,
      provider: 'cpu',
    },
    maxNumSentences: 1,
  };

  console.log(`[TTS] Supertonic 엔진 생성: ${modelDir}`);
  const tts = new sherpa.OfflineTts({
    ...config,
    // Electron/Worker: avoid sharing ArrayBuffers across isolates
    enableExternalBuffer: false,
  });
  sherpaCache.set(modelId, { sherpa, tts });
  return { sherpa, tts };
}

async function synthesizeSupertonic(text, modelId, modelDir, { voiceId, speed = 1, language = 'ko' } = {}) {
  const { sherpa, tts } = getSherpaTts(modelId, modelDir);
  const sid = Number.parseInt(String(voiceId ?? '0'), 10);
  const speakerId = Number.isFinite(sid)
    ? Math.max(0, Math.min(Math.max(0, (tts.numSpeakers || 1) - 1), sid))
    : 0;
  const lang = (language || 'ko').split('-')[0].toLowerCase();

  const generationConfig = new sherpa.GenerationConfig({
    sid: speakerId,
    speed: Math.max(0.25, Math.min(4, speed)),
    numSteps: 8,
    extra: { lang },
  });

  console.log(`[TTS] Supertonic 추론: sid=${speakerId} lang=${lang}`);
  // enableExternalBuffer must be false under Electron (external buffers blocked)
  const audio = tts.generate({
    text: text.trim(),
    generationConfig,
    enableExternalBuffer: false,
  });
  if (!audio?.samples?.length) throw new Error('Supertonic 오디오 생성 실패');
  const samples = Float32Array.from(audio.samples);
  return toResult(samples, audio.sampleRate || tts.sampleRate || 44100);
}

// ── MMS TTS ──────────────────────────────────────────────────────────────────
async function synthesizeMmsTts(text, modelId, modelDir) {
  const onnxPath = await findOnnxFile(modelDir, [
    'onnx/model.onnx',
    'onnx/model_quantized.onnx',
    'model.onnx',
  ]);
  if (!onnxPath) throw new Error(`ONNX 파일 없음: ${modelDir}`);

  const { session, ort } = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
  const vocab = await loadVocab(modelDir);
  if (!vocab) throw new Error(`토크나이저 없음: ${modelDir}`);

  const processed = prepareMmsText(text.trim());
  if (!processed) throw new Error('MMS 로마자 변환 결과 없음');
  const ids = tokenizeMms(processed, vocab, 25);
  if (!ids.length) throw new Error('토큰화 결과 없음');

  const seqLen = ids.length;
  const feeds = {};
  if (session.inputNames.includes('input_ids')) {
    feeds.input_ids = new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, seqLen]);
  }
  if (session.inputNames.includes('attention_mask')) {
    feeds.attention_mask = new ort.Tensor('int64', new BigInt64Array(seqLen).fill(1n), [1, seqLen]);
  }

  console.log(`[TTS] MMS 추론: "${processed.slice(0, 48)}" tokens=${seqLen}`);
  const results = await session.run(feeds);
  // Prefer waveform output when multiple outputs exist
  const outName = session.outputNames.includes('waveform')
    ? 'waveform'
    : session.outputNames[0];
  const audio = results[outName].data;
  return toResult(audio, 16000);
}

// ── Kokoro ───────────────────────────────────────────────────────────────────
function prepareEnglishForPhonemizer(text) {
  // espeak-ng has no ko_dict in the bundled Windows data path; Hangul triggers
  // endless "Can't read dictionary file: '/usr/share/espeak-ng-data/ko_dict'".
  // Romanize Hangul first so phonemizer stays on en-us only.
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      out += romanizeKorean(ch);
    } else if (code >= 0x1100 && code <= 0x11FF) {
      // skip raw jamo
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

async function getPhonemizeFn() {
  if (!phonemizeFnPromise) {
    phonemizeFnPromise = import('phonemizer').then((mod) => mod.phonemize);
  }
  return phonemizeFnPromise;
}

async function phonemizeEnglish(text) {
  const cleaned = prepareEnglishForPhonemizer(text);
  if (!cleaned) return '';

  const phonemize = await getPhonemizeFn();

  // Mute espeak-ng's stderr spam (missing dict / voice warnings)
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, cb) => {
    const msg = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
    if (msg.includes("Can't read dictionary file") || msg.includes('espeak-ng-data')) {
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    }
    return stderrWrite(chunk, encoding, cb);
  };

  try {
    const result = await phonemize(cleaned, 'en-us');
    if (Array.isArray(result)) return result.join(' ');
    return String(result || '');
  } finally {
    process.stderr.write = stderrWrite;
  }
}

async function loadVoiceBin(voicePath) {
  if (voiceBinCache.has(voicePath)) return voiceBinCache.get(voicePath);
  const voiceBuf = await fs.readFile(voicePath);
  const voices = new Float32Array(
    voiceBuf.buffer,
    voiceBuf.byteOffset,
    Math.floor(voiceBuf.byteLength / 4),
  );
  voiceBinCache.set(voicePath, voices);
  return voices;
}

async function synthesizeKokoro(text, modelId, modelDir, { voiceId = 'af_heart', speed = 1 } = {}) {
  let { onnxPath, preferGpu } = await resolveKokoroOnnxPath(modelDir);
  if (!onnxPath) throw new Error(`Kokoro ONNX 파일 없음: ${modelDir}`);

  const vocab = await loadVocab(modelDir);
  if (!vocab) throw new Error(`Kokoro tokenizer 없음: ${modelDir}`);

  const t0 = performance.now();
  const phoneStr = await phonemizeEnglish(text.trim());
  if (!phoneStr.trim()) throw new Error('Kokoro 음소 변환 결과 없음');

  const ids = [];
  for (const ch of phoneStr) {
    if (vocab[ch] !== undefined) ids.push(vocab[ch]);
  }
  if (!ids.length) throw new Error('Kokoro 토큰 ID 없음');
  if (ids.length > 510) throw new Error(`Kokoro 입력 길이 초과 (${ids.length} > 510)`);

  const voiceName = String(voiceId || 'af_heart').replace(/\.bin$/i, '');
  let voicePath = path.join(modelDir, 'voices', `${voiceName}.bin`);
  try {
    await fs.access(voicePath);
  } catch {
    voicePath = path.join(modelDir, 'voices', 'af_heart.bin');
  }

  const voices = await loadVoiceBin(voicePath);
  const styleDim = 256;
  const frames = Math.floor(voices.length / styleDim);
  const styleIndex = Math.min(ids.length, Math.max(0, frames - 1));
  // Copy style vector so ORT owns a non-shared buffer
  const style = Float32Array.from(
    voices.subarray(styleIndex * styleDim, styleIndex * styleDim + styleDim),
  );

  const padded = [0, ...ids, 0];
  let entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
  // If DML session fell back to CPU while we loaded an FP16 graph, switch to a CPU-optimized ONNX.
  if (preferGpu && entry.usedGpu === false) {
    const cpuPath = await findOnnxFile(modelDir, kokoroOnnxCandidates({ forGpu: false }));
    if (cpuPath && cpuPath !== onnxPath) {
      console.log(`[TTS] Kokoro CPU 폴백 모델로 전환: ${path.basename(cpuPath)}`);
      onnxPath = cpuPath;
      preferGpu = false;
      entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu: false });
    }
  }
  const { session, ort } = entry;
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(padded.map(BigInt)), [1, padded.length]),
    style: new ort.Tensor('float32', style, [1, styleDim]),
    speed: new ort.Tensor('float32', Float32Array.from([Math.max(0.25, Math.min(4, speed))]), [1]),
  };

  const t1 = performance.now();
  console.log(`[TTS] Kokoro 추론: voice=${voiceName} tokens=${ids.length} model=${path.basename(onnxPath)}`);
  const results = await session.run(feeds);
  const audio = results[session.outputNames[0]].data;
  const t2 = performance.now();
  const audioLen = audio?.length || 0;
  const audioSec = audioLen / 24000;
  console.log(
    `[TTS] Kokoro 완료: phonemize=${(t1 - t0).toFixed(0)}ms infer=${(t2 - t1).toFixed(0)}ms `
    + `audio=${audioSec.toFixed(2)}s rtf=${audioSec > 0 ? ((t2 - t1) / 1000 / audioSec).toFixed(2) : '?'} `
    + `backend=${ortBackend} ep=${entry.usedGpu ? 'dml' : 'cpu'}`,
  );
  return toResult(audio, 24000);
}

// ── Voice listing helpers (used by UI via IPC) ───────────────────────────────
export async function listModelVoices(modelId, store) {
  const catalog = await store.listModels();
  const model = catalog.find((m) => m.id === modelId);
  if (!model) return [];

  try {
    const available = await store.ensureModelAvailable(modelId, null);
    const modelDir = available.modelPath;

    if (model.runtime === 'sherpa-onnx' || modelId === 'ko-supertonic-int8') {
      try {
        const { tts } = getSherpaTts(modelId, modelDir);
        const count = tts.numSpeakers || 10;
        return Array.from({ length: count }, (_, i) => ({
          id: String(i),
          label: `Speaker ${i}`,
        }));
      } catch {
        return Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: `Speaker ${i}` }));
      }
    }

    if (modelId === 'en-kokoro' || model.runtime === 'onnx') {
      const voicesDir = path.join(modelDir, 'voices');
      const entries = await fs.readdir(voicesDir).catch(() => []);
      const voices = entries
        .filter((n) => n.endsWith('.bin'))
        .map((n) => n.replace(/\.bin$/i, ''))
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ id, label: id }));
      if (voices.length) return voices;
      return [{ id: 'af_heart', label: 'af_heart' }];
    }

    return [{ id: 'default', label: model.label }];
  } catch {
    return [{ id: 'default', label: model?.label || modelId }];
  }
}

/**
 * Preload heavy model pieces (ONNX session / phonemizer / sherpa) so the first
 * Speak click does not freeze the UI for several seconds.
 */
export async function warmModel(modelId, store) {
  if (!modelId) return { warmed: false };
  const available = await store.ensureModelAvailable(modelId, null);
  const modelDir = available.modelPath;
  const catalog = await store.listModels();
  const model = catalog.find((m) => m.id === modelId);
  const runtime = model?.runtime || 'unknown';

  if (modelId === 'en-kokoro' || runtime === 'onnx') {
    const { onnxPath, preferGpu } = await resolveKokoroOnnxPath(modelDir);
    if (onnxPath) {
      const entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
      // Warm the CPU-optimized graph too when DML init fell back.
      if (preferGpu && entry.usedGpu === false) {
        const cpuPath = await findOnnxFile(modelDir, kokoroOnnxCandidates({ forGpu: false }));
        if (cpuPath && cpuPath !== onnxPath) {
          await getOrtSession(`${modelId}:${cpuPath}`, cpuPath, { preferGpu: false });
        }
      }
    }
    await loadVocab(modelDir);
    await loadVoiceBin(path.join(modelDir, 'voices', 'af_heart.bin')).catch(() => null);
    if (!phonemizerWarmed) {
      await phonemizeEnglish('Hello.');
      phonemizerWarmed = true;
    }
    console.log(`[TTS] Kokoro warm complete: ${modelId} backend=${ortBackend}`);
    return { warmed: true, modelId };
  }

  if (modelId === 'ko-piper-kss' || runtime === 'piper-onnx') {
    const onnxPath = await findOnnxFile(modelDir, ['piper-kss-korean.onnx', 'model.onnx']);
    if (onnxPath) await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
    const { warmGoruut } = await import('./goruutPhonemizer.js');
    await warmGoruut();
    return { warmed: true, modelId };
  }

  if (modelId === 'ko-mms-tts' || runtime === 'transformers-js') {
    const onnxPath = await findOnnxFile(modelDir, [
      'onnx/model.onnx',
      'onnx/model_quantized.onnx',
    ]);
    if (onnxPath) await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
    await loadVocab(modelDir);
    return { warmed: true, modelId };
  }

  if (modelId === 'ko-supertonic-int8' || runtime === 'sherpa-onnx') {
    getSherpaTts(modelId, modelDir);
    return { warmed: true, modelId };
  }

  return { warmed: false, modelId };
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function synthesizeText({ text, modelId, store, onProgress, voiceId, speed, language }) {
  try {
    if (!text?.trim()) throw new Error('합성할 텍스트가 비어 있습니다.');

    const result = await store.ensureModelAvailable(modelId, onProgress);
    const modelDir = result.modelPath;
    // Weights replaced (e.g. Supertonic 2→3): drop cached OfflineTts handle
    if (result.downloaded) {
      sherpaCache.delete(modelId);
      for (const key of [...sessionCache.keys()]) {
        if (key.startsWith(`${modelId}:`)) sessionCache.delete(key);
      }
    }
    const catalog = await store.listModels();
    const model = catalog.find((m) => m.id === modelId);
    const runtime = model?.runtime || 'unknown';
    const opts = {
      voiceId,
      speed: Number(speed) > 0 ? Number(speed) : 1,
      language: language || model?.language || 'ko',
    };

    if (modelId === 'ko-piper-kss' || runtime === 'piper-onnx') {
      return await synthesizePiper(text, modelId, modelDir, opts);
    }
    if (modelId === 'ko-supertonic-int8' || runtime === 'sherpa-onnx') {
      return await synthesizeSupertonic(text, modelId, modelDir, opts);
    }
    if (modelId === 'ko-mms-tts' || runtime === 'transformers-js') {
      return await synthesizeMmsTts(text, modelId, modelDir);
    }
    if (modelId === 'en-kokoro' || runtime === 'onnx') {
      return await synthesizeKokoro(text, modelId, modelDir, opts);
    }

    throw new Error(`지원하지 않는 모델/런타임: ${modelId} (${runtime})`);
  } catch (error) {
    throw new Error(formatError(error));
  }
}
