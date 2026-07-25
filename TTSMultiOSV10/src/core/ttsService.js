import { formatError } from './errorDialog.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureOrtNativePath, ensureSherpaNativePath } from './ortNative.js';
import {
  createChildOrtSession,
  isElectronProcess,
  terminateOrtChild,
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

function normalizeAudio(samples, targetPeak = 0.9) {
  let audio = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  let peak = 0;
  for (const v of audio) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  if (peak > 0.01) {
    const scale = targetPeak / peak;
    const normalized = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) normalized[i] = audio[i] * scale;
    audio = normalized;
  }
  return audio;
}

function toResult(audio, sampleRate, { normalize = true, normalizeLevel = 0.9 } = {}) {
  // Keep Float32Array — structured clone across Worker/IPC is far cheaper than Array.from(number[]).
  let result = audio instanceof Float32Array ? audio : Float32Array.from(audio || []);
  if (normalize) result = normalizeAudio(result, normalizeLevel);
  return { audioBuffer: result, sampleRate };
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
const meloTtsSymbolsCache = new Map();
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
  try {
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
  } catch (error) {
    if (isCorruptOnnxError(error)) {
      const wrapped = new Error(error?.message || String(error));
      wrapped.code = 'CORRUPT_ONNX';
      wrapped.onnxPath = onnxPath;
      throw wrapped;
    }
    throw error;
  }

  console.log(
    `[TTS] 입력: [${entry.session.inputNames}]  출력: [${entry.session.outputNames}] `
    + `ep=${entry.usedGpu ? 'dml' : 'cpu'} backend=${entry.backend || ortBackend}`,
  );
  sessionCache.set(fullKey, entry);
  return entry;
}

function isCorruptOnnxError(error) {
  const text = String(error?.message || error || '');
  return /Protobuf parsing failed|InvalidProtobuf|Load model from .* failed/i.test(text);
}

function clearSessionsForModel(modelId, onnxPath = '') {
  const base = onnxPath ? path.basename(onnxPath) : '';
  for (const key of [...sessionCache.keys()]) {
    if (key.includes(modelId) || (base && key.includes(base))) {
      sessionCache.delete(key);
    }
  }
}

/** Delete a corrupt ONNX + package marker, then re-download. */
async function repairCorruptOnnx(store, modelId, onnxPath) {
  console.warn(`[TTS] 손상된 ONNX 감지 → 재다운로드: ${onnxPath}`);
  clearSessionsForModel(modelId, onnxPath);
  await terminateOrtChild().catch(() => {});
  await fs.rm(onnxPath, { force: true }).catch(() => {});
  await fs.rm(path.join(path.dirname(onnxPath), '.download-manifest.json'), { force: true }).catch(() => {});
  if (typeof store?.deleteModel === 'function') {
    await store.deleteModel(modelId).catch(() => {});
  }
  return store.ensureModelAvailable(modelId, null);
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

// PUA codepoints from @piper-plus/g2p/ko → nearest single-char IPA in the
// KSS model's phoneme_id_map (which has no PUA entries).
// Aspirated/tense distinctions collapse to their plain base; affricates → ɕ.
const KO_PUA_FALLBACK = {
  '': 'p',      // pʰ (ㅍ) → p
  '': 't',      // tʰ (ㅌ) → t
  '': 'k',      // kʰ (ㅋ) → k
  '': 'ɕ', // tɕ  (ㅈ) → ɕ  [171]
  '': 'ɕ', // tɕʰ (ㅊ) → ɕ
  '': 'p',      // p͈  (ㅃ) → p
  '': 't',      // t͈  (ㄸ) → t
  '': 'k',      // k͈  (ㄲ) → k
  '': 's',      // s͈  (ㅆ) → s
  '': 'ɕ', // t͈ɕ (ㅉ) → ɕ
  '': 'k',      // k̚  (ㄱ 받침) → k
  '': 't',      // t̚  (ㄷ 받침) → t
  '': 'p',      // p̚  (ㅂ 받침) → p
};

// ── Piper KSS ────────────────────────────────────────────────────────────────
async function synthesizePiper(text, modelId, modelDir, opts = {}) {
  const { speed = 1, store = null } = opts;
  let resolvedDir = modelDir;
  let onnxPath = await findOnnxFile(resolvedDir, [
    'piper-kss-korean.onnx',
    'model.onnx',
  ]);
  if (!onnxPath) throw new Error(`Piper ONNX 파일 없음: ${resolvedDir}`);

  const loadConfig = async (dir, onnx) => {
    const configPath = await findFileByName(dir, [
      'piper-kss-korean.onnx.json',
      `${path.basename(onnx)}.json`,
      'config.json',
    ]);
    if (!configPath) throw new Error(`Piper 설정 파일 없음: ${dir}`);
    return JSON.parse(await fs.readFile(configPath, 'utf-8'));
  };

  let config = await loadConfig(resolvedDir, onnxPath);
  const idMap = config.phoneme_id_map || {};

  const { KoreanG2P } = await import('@piper-plus/g2p/ko');
  const { Encoder } = await import('@piper-plus/g2p/encode');

  const g2p = new KoreanG2P();
  const { tokens: rawTokens } = g2p.phonemize(text.trim());
  // Map PUA codepoints to approximate single-char IPA present in this model's map
  const tokens = rawTokens.map(t => KO_PUA_FALLBACK[t] ?? t);
  if (!tokens.some(t => t in idMap)) throw new Error('Piper 음소 변환 결과 없음');

  const encoder = new Encoder(idMap);
  const { phonemeIds } = encoder.encode(tokens);
  if (phonemeIds.length < 3) throw new Error('Piper phoneme ID 생성 실패');

  let entry;
  try {
    entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
  } catch (error) {
    if (error?.code === 'CORRUPT_ONNX' && store) {
      const repaired = await repairCorruptOnnx(store, modelId, onnxPath);
      resolvedDir = repaired.modelPath;
      onnxPath = await findOnnxFile(resolvedDir, [
        'piper-kss-korean.onnx',
        'model.onnx',
      ]);
      if (!onnxPath) throw error;
      config = await loadConfig(resolvedDir, onnxPath);
      entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
    } else {
      throw error;
    }
  }
  const { session, ort } = entry;
  const lengthScale = Math.max(0.25, Math.min(4, (config.inference?.length_scale ?? 1) / Math.max(0.1, speed)));
  const noiseScale = opts.noiseScale ?? config.inference?.noise_scale ?? 0.667;
  const noiseW     = opts.noiseW     ?? config.inference?.noise_w     ?? 0.8;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(phonemeIds.map(BigInt)), [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseW]), [3]),
  };

  console.log(`[TTS] Piper(KoreanG2P) rawTokens=${rawTokens.length} ids=${phonemeIds.length} noise_scale=${noiseScale.toFixed(3)} noise_w=${noiseW.toFixed(3)}`);
  const results = await session.run(feeds);
  const audio = results[session.outputNames[0]].data;
  return toResult(audio, config.audio?.sample_rate || 22050, opts);
}

// ── Supertonic (sherpa-onnx) ─────────────────────────────────────────────────
function getSherpa() {
  // CommonJS native addon — must use require
  ensureSherpaNativePath();
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
  // Supertonic 3 + sherpa 1.13.x can abort the whole process (uncaught Ort::Exception).
  // Keep construction isolated from unexpected JS throws; native abort is avoided by catalog model choice.
  const tts = new sherpa.OfflineTts({
    ...config,
    // Electron/Worker: avoid sharing ArrayBuffers across isolates
    enableExternalBuffer: false,
  });
  sherpaCache.set(modelId, { sherpa, tts });
  return { sherpa, tts };
}

async function synthesizeSupertonic(text, modelId, modelDir, opts = {}) {
  const { voiceId, speed = 1, language = 'ko' } = opts;
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
  return toResult(samples, audio.sampleRate || tts.sampleRate || 44100, opts);
}

// ── MMS TTS ──────────────────────────────────────────────────────────────────
function mmsOnnxCandidates() {
  // Xenova mms-tts-kor full/fp16 ONNX often fail ORT protobuf parse; quantized loads reliably.
  return [
    'onnx/model_quantized.onnx',
    'onnx/model.onnx',
    'model_quantized.onnx',
    'model.onnx',
  ];
}

async function synthesizeMmsTts(text, modelId, modelDir, opts = {}) {
  const onnxPath = await findOnnxFile(modelDir, mmsOnnxCandidates());
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
  return toResult(audio, 16000, opts);
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

async function tokenizeKokoroText(text, vocab) {
  const phoneStr = await phonemizeEnglish(text.trim());
  if (!phoneStr.trim()) return [];

  const ids = [];
  for (const ch of phoneStr) {
    if (vocab[ch] !== undefined) ids.push(vocab[ch]);
  }
  return ids;
}

function splitTextNearMiddle(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (value.length <= 1) return null;

  const midpoint = Math.floor(value.length / 2);
  const separators = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' '];

  for (const separator of separators) {
    const leftIndex = value.lastIndexOf(separator, midpoint);
    const rightIndex = value.indexOf(separator, midpoint);
    const hasLeft = leftIndex > 0;
    const hasRight = rightIndex > 0;

    let splitIndex = -1;
    if (hasLeft && hasRight) {
      splitIndex = (midpoint - leftIndex) <= (rightIndex - midpoint) ? leftIndex : rightIndex;
    } else if (hasLeft) {
      splitIndex = leftIndex;
    } else if (hasRight) {
      splitIndex = rightIndex;
    }

    if (splitIndex > 0) {
      const cut = splitIndex + separator.length;
      const left = value.slice(0, cut).trim();
      const right = value.slice(cut).trim();
      if (left && right) return [left, right];
    }
  }

  const left = value.slice(0, midpoint).trim();
  const right = value.slice(midpoint).trim();
  if (left && right) return [left, right];
  return null;
}

async function splitKokoroByTokenLimit(text, vocab, maxTokens = 510) {
  const input = String(text || '').trim();
  if (!input) return [];

  const chunks = [];
  const queue = [input];

  while (queue.length) {
    const current = queue.shift();
    if (!current?.trim()) continue;

    const ids = await tokenizeKokoroText(current, vocab);
    if (!ids.length) continue;

    if (ids.length <= maxTokens) {
      chunks.push({ text: current, ids });
      continue;
    }

    const split = splitTextNearMiddle(current);
    if (!split) {
      throw new Error(`Kokoro 입력 길이 초과 (${ids.length} > ${maxTokens})`);
    }

    const [left, right] = split;
    queue.unshift(right);
    queue.unshift(left);
  }

  return chunks;
}

function concatFloat32(chunks) {
  if (!chunks.length) return new Float32Array();
  if (chunks.length === 1) return chunks[0];

  let total = 0;
  for (const chunk of chunks) total += chunk.length;

  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function synthesizeKokoro(text, modelId, modelDir, opts = {}) {
  const { voiceId = 'af_heart', speed = 1, store = null } = opts;
  let resolvedDir = modelDir;
  let { onnxPath, preferGpu } = await resolveKokoroOnnxPath(resolvedDir);
  if (!onnxPath) throw new Error(`Kokoro ONNX 파일 없음: ${resolvedDir}`);

  const vocab = await loadVocab(resolvedDir);
  if (!vocab) throw new Error(`Kokoro tokenizer 없음: ${resolvedDir}`);

  const t0 = performance.now();
  const chunks = await splitKokoroByTokenLimit(text, vocab, 510);
  if (!chunks.length) throw new Error('Kokoro 토큰 ID 없음');

  const voiceName = String(voiceId || 'af_heart').replace(/\.bin$/i, '');
  let voicePath = path.join(resolvedDir, 'voices', `${voiceName}.bin`);
  try {
    await fs.access(voicePath);
  } catch {
    voicePath = path.join(resolvedDir, 'voices', 'af_heart.bin');
  }

  const voices = await loadVoiceBin(voicePath);
  const styleDim = 256;
  const frames = Math.floor(voices.length / styleDim);

  let entry;
  try {
    entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
  } catch (error) {
    if (error?.code === 'CORRUPT_ONNX' && store) {
      const repaired = await repairCorruptOnnx(store, modelId, onnxPath);
      resolvedDir = repaired.modelPath;
      ({ onnxPath, preferGpu } = await resolveKokoroOnnxPath(resolvedDir));
      if (!onnxPath) throw error;
      entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
    } else {
      throw error;
    }
  }
  // If DML session fell back to CPU while we loaded an FP16 graph, switch to a CPU-optimized ONNX.
  if (preferGpu && entry.usedGpu === false) {
    const cpuPath = await findOnnxFile(resolvedDir, kokoroOnnxCandidates({ forGpu: false }));
    if (cpuPath && cpuPath !== onnxPath) {
      console.log(`[TTS] Kokoro CPU 폴백 모델로 전환: ${path.basename(cpuPath)}`);
      onnxPath = cpuPath;
      preferGpu = false;
      entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu: false });
    }
  }
  const { session, ort } = entry;

  const t1 = performance.now();
  const chunkAudios = [];
  let tokenTotal = 0;
  for (let index = 0; index < chunks.length; index++) {
    const { ids } = chunks[index];
    tokenTotal += ids.length;

    const styleIndex = Math.min(ids.length, Math.max(0, frames - 1));
    const style = Float32Array.from(
      voices.subarray(styleIndex * styleDim, styleIndex * styleDim + styleDim),
    );

    const padded = new BigInt64Array(ids.length + 2);
    padded[0] = 0n;
    for (let i = 0; i < ids.length; i++) padded[i + 1] = BigInt(ids[i]);
    padded[padded.length - 1] = 0n;

    const feeds = {
      input_ids: new ort.Tensor('int64', padded, [1, padded.length]),
      style: new ort.Tensor('float32', style, [1, styleDim]),
      speed: new ort.Tensor('float32', Float32Array.of(Math.max(0.25, Math.min(4, speed))), [1]),
    };

    console.log(
      `[TTS] Kokoro 추론: voice=${voiceName} chunk=${index + 1}/${chunks.length} `
      + `tokens=${ids.length} model=${path.basename(onnxPath)}`,
    );
    const results = await session.run(feeds);
    chunkAudios.push(Float32Array.from(results[session.outputNames[0]].data));
  }

  const audio = concatFloat32(chunkAudios);
  const t2 = performance.now();
  const audioLen = audio?.length || 0;
  const audioSec = audioLen / 24000;
  console.log(
    `[TTS] Kokoro 완료: chunks=${chunks.length} tokens=${tokenTotal} `
    + `phonemize=${(t1 - t0).toFixed(0)}ms infer=${(t2 - t1).toFixed(0)}ms `
    + `audio=${audioSec.toFixed(2)}s rtf=${audioSec > 0 ? ((t2 - t1) / 1000 / audioSec).toFixed(2) : '?'} `
    + `backend=${ortBackend} ep=${entry.usedGpu ? 'dml' : 'cpu'}`,
  );
  return toResult(audio, 24000, opts);
}

// ── MeloTTS (한국어/영어 VITS, gnyong/melotts-kr-onnx) ──────────────────────

// language_id_map from myshell-ai/MeloTTS melo/text/symbols.py
const MELOTTS_LANG_IDS = { ZH: 0, JP: 1, EN: 2, ZH_MIX_EN: 3, KR: 4, ES: 5, FR: 6 };

async function loadMeloTtsSymbols(modelDir) {
  if (meloTtsSymbolsCache.has(modelDir)) return meloTtsSymbolsCache.get(modelDir);

  // Prefer melotts_kr_config.json symbols — they match the ONNX embedding table.
  // symbols.json in the HF package can drift (IPA rows shift) and break Korean jamo IDs.
  const configPath = path.join(modelDir, 'melotts_kr_config.json');
  const symbolsPath = path.join(modelDir, 'symbols.json');

  let symbols = [];
  let langToneStartMap = { KR: 11, EN: 7 };
  let languageIdMap = { ...MELOTTS_LANG_IDS };

  try {
    const cfg = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    if (Array.isArray(cfg.symbols) && cfg.symbols.length) symbols = cfg.symbols;
  } catch {
    /* fall through */
  }

  try {
    const raw = JSON.parse(await fs.readFile(symbolsPath, 'utf-8'));
    if (!symbols.length && Array.isArray(raw.symbols)) symbols = raw.symbols;
    if (raw.language_tone_start_map) langToneStartMap = raw.language_tone_start_map;
    if (raw.language_id_map) languageIdMap = raw.language_id_map;
  } catch {
    /* optional maps */
  }

  if (!symbols.length) throw new Error(`MeloTTS symbols 없음: ${modelDir}`);

  const symbolToId = {};
  symbols.forEach((sym, idx) => { symbolToId[sym] = idx; });

  const entry = {
    symbolToId,
    blankId: symbolToId['_'] ?? 0,
    langToneStartMap,
    languageIdMap,
  };
  meloTtsSymbolsCache.set(modelDir, entry);
  return entry;
}

/**
 * Official MeloTTS KR front-end:
 *   normalize → g2pkk → hangul_to_jamo → ['_']+phones+['_'] → intersperse(blank)
 *   tones all 0 then + language_tone_start_map.KR
 *   language ids intersperse with 0 (blanks are lang 0, not KR)
 */
async function tokenizeMeloTts(
  text, symbolToId, blankId, langToneStartMap, modelDir = '', languageIdMap = null, preferredLanguage = 'ko',
) {
  const { koreanTextToPhonemes, intersperse } = await import('./meloKoreanG2p.js');

  const langIds = languageIdMap || MELOTTS_LANG_IDS;
  const KR_LANG = langIds.KR ?? MELOTTS_LANG_IDS.KR;
  const EN_LANG = langIds.EN ?? MELOTTS_LANG_IDS.EN;
  const KR_TONE_START = langToneStartMap.KR ?? 11;
  const EN_TONE_START = langToneStartMap.EN ?? 7;
  const preferEn = String(preferredLanguage || 'ko').toLowerCase().startsWith('en');

  // Split into Hangul-dominant vs Latin runs so English IPA still works.
  const segments = [];
  let buf = '';
  let mode = null; // 'ko' | 'en' | 'other'
  const flush = () => {
    if (!buf) return;
    segments.push({ mode, text: buf });
    buf = '';
  };

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isHangul = code >= 0xAC00 && code <= 0xD7A3;
    const isLatin = (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A) || ch === "'";
    const next = isHangul ? 'ko' : (isLatin ? 'en' : 'other');
    if (mode && next !== mode && !(next === 'other' && (ch === ' ' || ch === '.' || ch === ',' || ch === '!' || ch === '?'))) {
      flush();
    }
    if (!mode) mode = next === 'other' ? (preferEn ? 'en' : 'ko') : next;
    if (next !== 'other') mode = next;
    buf += ch;
  }
  flush();

  const phoneSyms = [];
  for (const seg of segments) {
    const useEn = seg.mode === 'en' && /[A-Za-z]/.test(seg.text);
    // Preferred language forces Latin-only segments to English IPA when set to EN.
    if (useEn || (preferEn && seg.mode === 'en')) {
      const ipa = await phonemizeEnglish(seg.text.trim());
      for (const ch of ipa) {
        if (symbolToId[ch] !== undefined) phoneSyms.push({ sym: ch, lang: EN_LANG, tone: EN_TONE_START });
      }
    } else {
      const jamos = koreanTextToPhonemes(seg.text, modelDir);
      for (const j of jamos) {
        if (symbolToId[j] !== undefined) {
          phoneSyms.push({ sym: j, lang: KR_LANG, tone: KR_TONE_START });
        }
      }
    }
  }

  const defaultLang = preferEn ? EN_LANG : KR_LANG;
  const defaultTone = preferEn ? EN_TONE_START : KR_TONE_START;

  // ['_'] + phones + ['_'] then intersperse blanks — matches MeloTTS commons.intersperse
  const phones = [blankId, ...phoneSyms.map((p) => symbolToId[p.sym]), blankId];
  const tones  = [defaultTone, ...phoneSyms.map((p) => p.tone), defaultTone];
  const langs  = [defaultLang, ...phoneSyms.map((p) => p.lang), defaultLang];

  return {
    tokenIds: intersperse(phones, blankId),
    toneIds:  intersperse(tones, 0),
    langIds:  intersperse(langs, 0),
  };
}

async function synthesizeMeloTts(text, modelId, modelDir, opts = {}) {
  const { voiceId = '0', speed = 1, store = null, language = 'ko' } = opts;

  let onnxPath = await findOnnxFile(modelDir, [
    'melotts_kr_int8.onnx', 'melotts_kr_fp16.onnx', 'melotts_kr_fp32.onnx',
  ]);
  if (!onnxPath) throw new Error(`MeloTTS ONNX 없음: ${modelDir}`);

  const { symbolToId, blankId, langToneStartMap, languageIdMap } = await loadMeloTtsSymbols(modelDir);

  const t0 = performance.now();
  const { tokenIds, langIds, toneIds } = await tokenizeMeloTts(
    text.trim(), symbolToId, blankId, langToneStartMap, modelDir, languageIdMap, language,
  );
  if (!tokenIds.length) throw new Error('MeloTTS 토큰 없음');

  const T = tokenIds.length;
  const sid = BigInt(Math.max(0, Number(voiceId) || 0));
  const lengthScale = 1.0 / Math.max(0.25, Math.min(4, speed));

  let sessionEntry;
  try {
    sessionEntry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
  } catch (error) {
    if (error?.code === 'CORRUPT_ONNX' && store) {
      const repaired = await repairCorruptOnnx(store, modelId, onnxPath);
      onnxPath = await findOnnxFile(repaired.modelPath, [
        'melotts_kr_int8.onnx', 'melotts_kr_fp16.onnx', 'melotts_kr_fp32.onnx',
      ]);
      if (!onnxPath) throw error;
      sessionEntry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
    } else {
      throw error;
    }
  }
  const { session, ort } = sessionEntry;
  const t1 = performance.now();

  const feeds = {
    x:             new ort.Tensor('int64',   BigInt64Array.from(tokenIds.map(BigInt)), [1, T]),
    x_lengths:     new ort.Tensor('int64',   BigInt64Array.from([BigInt(T)]),           [1]),
    sid:           new ort.Tensor('int64',   BigInt64Array.from([sid]),                 [1]),
    tone:          new ort.Tensor('int64',   BigInt64Array.from(toneIds.map(BigInt)),   [1, T]),
    language:      new ort.Tensor('int64',   BigInt64Array.from(langIds.map(BigInt)),   [1, T]),
    noise_scale:   new ort.Tensor('float32', Float32Array.of(0.6),                      [1]),
    length_scale:  new ort.Tensor('float32', Float32Array.of(lengthScale),              [1]),
    noise_scale_w: new ort.Tensor('float32', Float32Array.of(0.8),                      [1]),
    sdp_ratio:     new ort.Tensor('float32', Float32Array.of(0.2),                      [1]),
  };

  if (session.inputNames.includes('bert')) {
    feeds.bert    = new ort.Tensor('float32', new Float32Array(1024 * T), [1, 1024, T]);
  }
  if (session.inputNames.includes('ja_bert')) {
    feeds.ja_bert = new ort.Tensor('float32', new Float32Array(768  * T), [1, 768,  T]);
  }

  console.log(`[TTS] MeloTTS 추론: tokens=${T} model=${path.basename(onnxPath)}`);
  const results = await session.run(feeds);
  const audio = Float32Array.from(results[session.outputNames[0]].data);

  const t2 = performance.now();
  const audioSec = audio.length / 44100;
  console.log(
    `[TTS] MeloTTS 완료: tokens=${T} g2p=${(t1 - t0).toFixed(0)}ms `
    + `infer=${(t2 - t1).toFixed(0)}ms audio=${audioSec.toFixed(2)}s`,
  );

  return toResult(audio, 44100, opts);
}

// ── Voice listing helpers (used by UI via IPC) ───────────────────────────────
export async function listModelVoices(modelId, store) {
  const catalog = await store.listModels();
  const model = catalog.find((m) => m.id === modelId);
  if (!model) return [];

  try {
    const available = await store.ensureModelAvailable(modelId, null);
    const modelDir = available.modelPath;

    if (model.runtime === 'melotts') {
      return [{ id: '0', label: 'KR' }];
    }

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

  if (runtime === 'melotts') {
    let onnxPath = await findOnnxFile(modelDir, [
      'melotts_kr_int8.onnx', 'melotts_kr_fp16.onnx', 'melotts_kr_fp32.onnx',
    ]);
    if (onnxPath) {
      try {
        await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
      } catch (error) {
        if (error?.code === 'CORRUPT_ONNX' && store) {
          const repaired = await repairCorruptOnnx(store, modelId, onnxPath);
          onnxPath = await findOnnxFile(repaired.modelPath, [
            'melotts_kr_int8.onnx', 'melotts_kr_fp16.onnx', 'melotts_kr_fp32.onnx',
          ]);
          if (onnxPath) await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
        } else {
          throw error;
        }
      }
    }
    await loadMeloTtsSymbols(modelDir).catch(() => null);
    if (!phonemizerWarmed) {
      await phonemizeEnglish('Hello.');
      phonemizerWarmed = true;
    }
    console.log(`[TTS] MeloTTS warm complete: ${modelId}`);
    return { warmed: true, modelId };
  }

  if (modelId === 'en-kokoro' || modelId === 'ko-en-kokoro' || runtime === 'onnx') {
    let { onnxPath, preferGpu } = await resolveKokoroOnnxPath(modelDir);
    if (onnxPath) {
      try {
        const entry = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
        if (preferGpu && entry.usedGpu === false) {
          const cpuPath = await findOnnxFile(modelDir, kokoroOnnxCandidates({ forGpu: false }));
          if (cpuPath && cpuPath !== onnxPath) {
            await getOrtSession(`${modelId}:${cpuPath}`, cpuPath, { preferGpu: false });
          }
        }
      } catch (error) {
        if (error?.code === 'CORRUPT_ONNX' && store) {
          const repaired = await repairCorruptOnnx(store, modelId, onnxPath);
          ({ onnxPath, preferGpu } = await resolveKokoroOnnxPath(repaired.modelPath));
          if (onnxPath) await getOrtSession(`${modelId}:${onnxPath}`, onnxPath, { preferGpu });
        } else {
          throw error;
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
    return { warmed: true, modelId };
  }

  if (modelId === 'ko-mms-tts' || runtime === 'transformers-js') {
    const onnxPath = await findOnnxFile(modelDir, mmsOnnxCandidates());
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
export async function synthesizeText({ text, modelId, store, onProgress, voiceId, speed, language, noiseScale, noiseW, normalize, normalizeLevel }) {
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
      noiseScale: Number.isFinite(Number(noiseScale)) ? Number(noiseScale) : undefined,
      noiseW:     Number.isFinite(Number(noiseW))     ? Number(noiseW)     : undefined,
      normalize:  normalize !== false,
      normalizeLevel: Number.isFinite(Number(normalizeLevel)) ? Math.max(0.05, Math.min(1, Number(normalizeLevel))) : 0.9,
      store,
    };

    if (modelId === 'ko-piper-kss' || runtime === 'piper-onnx') {
      return await synthesizePiper(text, modelId, modelDir, opts);
    }
    if (modelId === 'ko-supertonic-int8' || runtime === 'sherpa-onnx') {
      return await synthesizeSupertonic(text, modelId, modelDir, opts);
    }
    if (modelId === 'ko-mms-tts' || runtime === 'transformers-js') {
      return await synthesizeMmsTts(text, modelId, modelDir, opts);
    }
    if (modelId === 'en-kokoro' || modelId === 'ko-en-kokoro' || runtime === 'onnx') {
      return await synthesizeKokoro(text, modelId, modelDir, opts);
    }
    if (runtime === 'melotts') {
      return await synthesizeMeloTts(text, modelId, modelDir, opts);
    }

    throw new Error(`지원하지 않는 모델/런타임: ${modelId} (${runtime})`);
  } catch (error) {
    throw new Error(formatError(error));
  }
}
