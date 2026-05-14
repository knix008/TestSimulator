import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node");

const MODEL_FOLDER = "vits-mimic3-ko_KO-kss_low";
const DEFAULT_ONNX = "ko_KO-kss_low.onnx";

/** @type {import('sherpa-onnx-node').OfflineTts | null} */
let tts = null;
/** @type {string | null} */
let lastModelDir = null;

export function getModelDirUsed() {
  return lastModelDir;
}

export function resolveModelDir() {
  const fromEnv = process.env.TTSWEBV10_MODEL_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "models", MODEL_FOLDER);
}

async function findOnnxFile(modelDir) {
  const preferred = path.join(modelDir, DEFAULT_ONNX);
  try {
    await fs.access(preferred);
    return preferred;
  } catch {
    const names = await fs.readdir(modelDir);
    const onnx = names.find((n) => n.endsWith(".onnx"));
    if (onnx) return path.join(modelDir, onnx);
    throw new Error(`${modelDir} 안에서 .onnx 모델 파일을 찾을 수 없습니다.`);
  }
}

async function assertModelLayout(modelDir) {
  await fs.access(modelDir);
  const tokens = path.join(modelDir, "tokens.txt");
  await fs.access(tokens);
  const dataDir = path.join(modelDir, "espeak-ng-data");
  await fs.access(dataDir);
  const onnx = await findOnnxFile(modelDir);
  return { onnx, tokens, dataDir };
}

/**
 * @returns {Promise<import('sherpa-onnx-node').OfflineTts>}
 */
export async function getOrCreateTts() {
  if (tts) return tts;

  const modelDir = resolveModelDir();
  let paths;
  try {
    paths = await assertModelLayout(modelDir);
  } catch (e) {
    throw new Error(
      `Sherpa 모델을 찾을 수 없습니다.\n` +
        `폴더: ${modelDir}\n` +
        `필요: *.onnx, tokens.txt, espeak-ng-data/\n` +
        `환경 변수 TTSWEBV10_MODEL_DIR 로 모델 루트를 지정할 수 있습니다.\n` +
        `원본: ${String(e?.message || e)}`,
    );
  }

  const threads = Math.min(
    8,
    Math.max(1, Number(process.env.TTSWEBV10_NUM_THREADS) || os.cpus().length),
  );

  const config = {
    model: {
      vits: {
        model: paths.onnx,
        tokens: paths.tokens,
        dataDir: paths.dataDir,
      },
    },
    maxNumSentences: 2,
    numThreads: threads,
    provider: "cpu",
    debug: process.env.TTSWEBV10_DEBUG === "1",
  };

  tts = await sherpa.OfflineTts.createAsync(config);
  lastModelDir = modelDir;
  return tts;
}

/**
 * UI 피치(Hz 스케일)를 반음 단위로 환산한 뒤, 이중 선형 리샘플로 대략적인 음높이 변화를 적용합니다.
 * (고품질 전용 피치 시프터는 아니며, 길이는 원본에 가깝게 유지합니다.)
 * @param {Float32Array} samples
 * @param {number} pitchHz -50..50 등
 * @returns {Float32Array}
 */
function applyPitchFromHzScale(samples, pitchHz) {
  const hz = Number(pitchHz);
  if (!Number.isFinite(hz) || Math.abs(hz) < 0.5) {
    return samples;
  }
  const semitones = Math.max(-8, Math.min(8, hz / 8));
  const factor = Math.pow(2, semitones / 12);
  const n = samples.length;
  if (n < 4) return samples;

  const midLen = Math.max(2, Math.floor(n / factor));
  const mid = new Float32Array(midLen);
  for (let i = 0; i < midLen; i++) {
    const srcIdx = i * factor;
    const i0 = Math.min(Math.floor(srcIdx), n - 2);
    const frac = srcIdx - i0;
    const a = samples[i0];
    const b = samples[i0 + 1];
    mid[i] = a + frac * (b - a);
  }

  const out = new Float32Array(n);
  const denom = midLen - 1 || 1;
  for (let i = 0; i < n; i++) {
    const srcPos = (i * (midLen - 1)) / (n - 1 || 1);
    const i0 = Math.min(Math.floor(srcPos), midLen - 2);
    const frac = srcPos - i0;
    const a = mid[i0];
    const b = mid[i0 + 1];
    out[i] = a + frac * (b - a);
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ sid?: number, ratePercent?: number, pitchHz?: number, volumePercent?: number }} opts
 */
export async function synthesizeToWavBuffer(text, opts = {}) {
  const engine = await getOrCreateTts();
  const sid = Number.isFinite(opts.sid) ? Math.max(0, Math.floor(opts.sid)) : 0;
  const safeSid = Math.min(sid, Math.max(0, engine.numSpeakers - 1));

  const rate = Number(opts.ratePercent);
  const rateClamped = Number.isFinite(rate) ? Math.max(-50, Math.min(100, rate)) : 0;
  const speed = Math.max(0.5, Math.min(2.5, 1 + rateClamped / 100));

  const generationConfig = new sherpa.GenerationConfig({
    sid: safeSid,
    speed,
    silenceScale: 0.2,
  });

  const audio = engine.generate({ text, generationConfig });
  let samples = audio.samples;
  const sampleRate = audio.sampleRate;

  const pitch = Number(opts.pitchHz);
  if (Number.isFinite(pitch) && Math.abs(pitch) >= 0.5) {
    samples = applyPitchFromHzScale(new Float32Array(samples), pitch);
  }

  const vol = Number(opts.volumePercent);
  if (Number.isFinite(vol) && vol !== 0) {
    const g = Math.max(0.25, Math.min(2, 1 + (vol / 100) * 0.85));
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i] * g;
      samples[i] = Math.max(-1, Math.min(1, x));
    }
  }

  const tmp = path.join(
    os.tmpdir(),
    `ttswebv10-wav-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
  );
  sherpa.writeWave(tmp, { samples, sampleRate });
  const buf = await fs.readFile(tmp);
  await fs.unlink(tmp).catch(() => {});
  return buf;
}

export function isReady() {
  return tts !== null;
}

export function listVoicesFromTts() {
  if (!tts) return [];
  const n = tts.numSpeakers;
  const out = [];
  for (let sid = 0; sid < n; sid++) {
    out.push({
      Name: `local-${sid}`,
      ShortName: String(sid),
      FriendlyName: n === 1 ? "VITS (한국어 KSS low)" : `화자 ${sid}`,
      Locale: "ko-KR",
    });
  }
  return out;
}
