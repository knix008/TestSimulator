import { formatError } from './errorDialog.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

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
  const normalized = normalizeAudio(audio);
  return { audioBuffer: Array.from(normalized), sampleRate };
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
  try {
    const raw = JSON.parse(await fs.readFile(path.join(modelDir, 'tokenizer.json'), 'utf-8'));
    if (Array.isArray(raw.model?.vocab)) {
      const vocab = {};
      raw.model.vocab.forEach(([tok], idx) => { vocab[tok] = idx; });
      return vocab;
    }
    if (raw.model?.vocab && typeof raw.model.vocab === 'object') return raw.model.vocab;
  } catch { /* continue */ }

  try {
    const raw = JSON.parse(await fs.readFile(path.join(modelDir, 'vocab.json'), 'utf-8'));
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  } catch { /* continue */ }

  return null;
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
let piperG2pPromise = null;

async function getOrt() {
  const mod = await import('onnxruntime-node');
  return mod.default ?? mod;
}

async function getOrtSession(cacheKey, onnxPath) {
  if (sessionCache.has(cacheKey)) return sessionCache.get(cacheKey);
  const ort = await getOrt();
  console.log(`[TTS] ONNX 세션 생성: ${onnxPath}`);
  const session = await ort.InferenceSession.create(onnxPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });
  console.log(`[TTS] 입력: [${session.inputNames}]  출력: [${session.outputNames}]`);
  const entry = { session, ort };
  sessionCache.set(cacheKey, entry);
  return entry;
}

async function getKoreanG2p() {
  if (!piperG2pPromise) {
    piperG2pPromise = import('@piper-plus/g2p/ko').then((mod) => new mod.KoreanG2P());
  }
  return piperG2pPromise;
}

// ── Piper KSS ────────────────────────────────────────────────────────────────
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
  const { Encoder } = await import('@piper-plus/g2p/encode');
  const g2p = await getKoreanG2p();
  const phonemized = g2p.phonemize(text.trim());
  const tokens = Array.isArray(phonemized) ? phonemized : (phonemized?.tokens || []);
  if (!tokens.length) throw new Error('Piper 음소 변환 결과 없음');

  const encoder = new Encoder(config.phoneme_id_map || {});
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

  console.log(`[TTS] Piper 추론: tokens=${tokens.length} ids=${phonemeIds.length}`);
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
  const tts = new sherpa.OfflineTts(config);
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
async function phonemizeEnglish(text) {
  const { phonemize } = await import('phonemizer');
  const result = await phonemize(text, 'en-us');
  if (Array.isArray(result)) return result.join(' ');
  return String(result || '');
}

async function synthesizeKokoro(text, modelId, modelDir, { voiceId = 'af_heart', speed = 1 } = {}) {
  const onnxPath = await findOnnxFile(modelDir, [
    'onnx/model_quantized.onnx',
    'onnx/model_q8f16.onnx',
    'onnx/model.onnx',
    'model.onnx',
  ]);
  if (!onnxPath) throw new Error(`Kokoro ONNX 파일 없음: ${modelDir}`);

  const vocab = await loadVocab(modelDir);
  if (!vocab) throw new Error(`Kokoro tokenizer 없음: ${modelDir}`);

  const phoneStr = await phonemizeEnglish(text.trim());
  if (!phoneStr.trim()) throw new Error('Kokoro 음소 변환 결과 없음');

  const ids = [];
  for (const ch of phoneStr) {
    if (vocab[ch] !== undefined) ids.push(vocab[ch]);
  }
  if (!ids.length) throw new Error('Kokoro 토큰 ID 없음');
  if (ids.length > 510) throw new Error(`Kokoro 입력 길이 초과 (${ids.length} > 510)`);

  const voiceName = String(voiceId || 'af_heart').replace(/\.bin$/i, '');
  const voicePath = path.join(modelDir, 'voices', `${voiceName}.bin`);
  let voiceBuf;
  try {
    voiceBuf = await fs.readFile(voicePath);
  } catch {
    voiceBuf = await fs.readFile(path.join(modelDir, 'voices', 'af_heart.bin'));
  }

  const voices = new Float32Array(voiceBuf.buffer, voiceBuf.byteOffset, Math.floor(voiceBuf.byteLength / 4));
  const styleDim = 256;
  const frames = Math.floor(voices.length / styleDim);
  const styleIndex = Math.min(ids.length, Math.max(0, frames - 1));
  const style = voices.subarray(styleIndex * styleDim, styleIndex * styleDim + styleDim);

  const padded = [0, ...ids, 0];
  const { session, ort } = await getOrtSession(`${modelId}:${onnxPath}`, onnxPath);
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(padded.map(BigInt)), [1, padded.length]),
    style: new ort.Tensor('float32', style, [1, styleDim]),
    speed: new ort.Tensor('float32', Float32Array.from([Math.max(0.25, Math.min(4, speed))]), [1]),
  };

  console.log(`[TTS] Kokoro 추론: voice=${voiceName} tokens=${ids.length}`);
  const results = await session.run(feeds);
  const audio = results[session.outputNames[0]].data;
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

// ── Public API ───────────────────────────────────────────────────────────────
export async function synthesizeText({ text, modelId, store, onProgress, voiceId, speed, language }) {
  try {
    if (!text?.trim()) throw new Error('합성할 텍스트가 비어 있습니다.');

    const result = await store.ensureModelAvailable(modelId, onProgress);
    const modelDir = result.modelPath;
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
