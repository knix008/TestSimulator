// The AI singer's worker: onnxruntime-web (WebGPU when the device has it, WebAssembly otherwise) runs
// the bank's models phrase by phrase, off the page's thread, with progress and cancel.
//
// Messages in:  { type: 'render', job, bankKey, source, vocoderSource, vocoder, speaker, phrases, opts, ort }
//               { type: 'cancel', job } · { type: 'info', ort } · { type: 'dispose' }
// Messages out: { type: 'progress', job, stage, done, total, phrase } · { type: 'phrase', job, index, startMs, samples }
//               { type: 'done', job, info } · { type: 'error', job, message, code } · { type: 'info', info }
//
// Backend check: WebGPU builds of onnxruntime have given wrong acoustic output before (1.22), so the
// first time a bank runs on WebGPU a short phrase is rendered on WebGPU and on WebAssembly and the
// results compared; when they disagree the worker stays on WebAssembly (the verdict is returned so
// the page can remember it).
import { readBankLayout, readVocoderLayout } from './bank.js';
import { acousticFeeds, loadRuntime, melForVocoder, renderPhrase, rulePitch, tensor } from './pipeline.js';
import { makeReader } from './reader.js';

let ort = null;
let info = null;
const sessions = new Map();
let bank = null; // { key, rt, read, readVoc, ep }
const controllers = new Map();

async function initOrt(opts = {}) {
  if (ort) return info;
  const base = opts.base;
  ort = await import(/* @vite-ignore */ `${base}ort.webgpu.min.mjs`);
  ort.env.wasm.wasmPaths = base;
  ort.env.logLevel = 'error';
  const isolated = globalThis.crossOriginIsolated === true;
  const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
  ort.env.wasm.numThreads = isolated ? Math.max(1, Math.min(opts.threads || 8, cores)) : 1;
  let adapter = null;
  if (globalThis.navigator?.gpu) {
    try {
      const a = await navigator.gpu.requestAdapter();
      if (a) adapter = [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(' ') || 'WebGPU';
    } catch { adapter = null; }
  }
  info = { ort: ort.env.versions?.web ?? '1.31.1', webgpu: Boolean(adapter), adapter, isolated, threads: ort.env.wasm.numThreads };
  return info;
}

const toTensor = (v) => (v instanceof ort.Tensor ? v : new ort.Tensor(v.type, v.data, v.dims));

async function createSession(bytes, ep) {
  return ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'basic' });
}

function makeRunner(keyPrefix, models, read, ep, onLoad, timings = {}) {
  return {
    timings,
    inputs: (key) => sessions.get(`${keyPrefix}:${key}`)?.inputs ?? null,
    async load(key) {
      const id = `${keyPrefix}:${key}`;
      let s = sessions.get(id);
      if (!s) {
        const path = models[key];
        if (!path) throw new Error(`No model for ${key}`);
        onLoad?.(key, path);
        const bytes = await read(path, 'bytes');
        let session;
        try { session = await createSession(bytes, ep); } catch (error) {
          // A model this runtime cannot run (e.g. a vocoder that casts to float64).
          throw Object.assign(new Error(`${path}: ${error?.message ?? error}`), { code: key === 'vocoder' ? 'vocoderLoad' : 'modelLoad' });
        }
        s = { session, inputs: new Set(session.inputNames) };
        sessions.set(id, s);
      }
      return s;
    },
    async run(key, feeds) {
      const { session } = await this.load(key);
      const f = {};
      for (const [k, v] of Object.entries(feeds)) f[k] = toTensor(v);
      const t0 = performance.now();
      const out = await session.run(f);
      timings[key] = (timings[key] ?? 0) + performance.now() - t0;
      const o = {};
      for (const [k, t] of Object.entries(out)) {
        const data = t.location && t.location !== 'cpu' ? await t.getData(true) : t.data;
        o[k] = { type: t.type, data, dims: t.dims };
      }
      return o;
    },
  };
}

async function releaseAll() {
  for (const s of sessions.values()) { try { await s.session.release(); } catch { /* gone */ } }
  sessions.clear();
}

/** A short test phrase's mel and audio on one backend (for the WebGPU check). */
async function probe(rt, read, ep) {
  const runner = makeRunner(`probe-${ep}`, rt.models, read, ep);
  const vowel = [...rt.acoustic.tokens.keys()].find((k) => rt.dicts.ko.isVowel(k) && !/^(?:SP|AP)$/.test(k)) ?? [...rt.acoustic.tokens.keys()][3];
  const phones = [{ phoneme: vowel, positionMs: 0, durationMs: 1200 }];
  await runner.load('acoustic');
  const pitch = rulePitch([{ startMs: 0, endMs: 1200, midi: 60 }], -8 * rt.frameMs, 200, rt.frameMs);
  const ac = acousticFeeds(rt, phones, pitch, { steps: 4, inputNames: runner.inputs('acoustic') });
  const mel = Float32Array.from((await runner.run('acoustic', ac.feeds)).mel?.data ?? []);
  await runner.load('vocoder');
  const melV = melForVocoder(mel, rt.config.mel_base, rt.vocoder.config.mel_base);
  const out = await runner.run('vocoder', { mel: { type: 'float32', data: melV, dims: [1, ac.totalFrames, mel.length / ac.totalFrames] }, f0: tensor.f32(ac.f0) });
  const wave = Object.values(out)[0].data;
  for (const [id, s] of sessions) if (id.startsWith(`probe-${ep}:`)) { try { await s.session.release(); } catch { /* gone */ } sessions.delete(id); }
  return { mel, wave };
}

const stats = (a) => {
  let sum = 0; let sq = 0; let min = Infinity; let max = -Infinity; let bad = 0;
  for (const v of a) { if (!Number.isFinite(v)) { bad++; continue; } sum += v; sq += v * v; if (v < min) min = v; if (v > max) max = v; }
  const n = Math.max(1, a.length - bad);
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), min, max, bad, rms: Math.sqrt(sq / n) };
};

/** WebGPU vs WebAssembly on the same short input: { ok, detail }. */
async function selfCheck(rt, read) {
  const gpu = await probe(rt, read, 'webgpu');
  const cpu = await probe(rt, read, 'wasm');
  const g = stats(gpu.mel); const c = stats(cpu.mel);
  const gw = stats(gpu.wave); const cw = stats(cpu.wave);
  const ok = !g.bad && !gw.bad && g.max < 12 && g.min > -30 && Math.abs(g.mean - c.mean) < 0.6 && Math.abs(g.std - c.std) < 0.6
    && cw.rms > 0 && gw.rms / cw.rms > 0.5 && gw.rms / cw.rms < 2;
  return { ok, detail: { gpuMel: [g.mean, g.std, g.min, g.max].map((x) => +x.toFixed(3)), cpuMel: [c.mean, c.std, c.min, c.max].map((x) => +x.toFixed(3)), rms: [gw.rms, cw.rms].map((x) => +x.toFixed(4)) } };
}

async function prepareBank(msg, post) {
  if (bank && bank.key === msg.bankKey && bank.speaker === msg.speaker && bank.backend === msg.opts.backend) return bank;
  await releaseAll();
  bank = null;
  const read = makeReader(msg.source);
  const readVoc = msg.vocoderSource ? makeReader(msg.vocoderSource) : read;
  const layout = await readBankLayout(msg.files, read);
  let vocoder = null;
  if (msg.vocoderSource) {
    const v = await readVocoderLayout(msg.vocoderFiles, readVoc);
    vocoder = { config: v.config, model: v.model };
  }
  const rt = await loadRuntime(layout, read, { speaker: msg.speaker, vocoder });
  // The vocoder's files come from its own folder.
  const readModel = (path, kind) => (msg.vocoderSource && path === rt.models.vocoder ? readVoc(path, kind) : read(path, kind));
  const want = msg.opts.backend ?? 'auto';
  let ep = 'wasm';
  let check = msg.opts.verdict ?? null;
  if (want === 'webgpu' && info.webgpu) ep = 'webgpu';
  else if (want === 'auto' && info.webgpu) {
    if (!check) {
      post({ type: 'progress', job: msg.job, stage: 'check', done: 0, total: 1 });
      try { check = await selfCheck(rt, readModel); } catch (error) { check = { ok: false, detail: String(error?.message ?? error) }; }
      check.adapter = info.adapter;
      check.ort = info.ort;
    }
    ep = check.ok ? 'webgpu' : 'wasm';
  }
  bank = { key: msg.bankKey, speaker: msg.speaker, backend: msg.opts.backend, rt, read: readModel, ep, check };
  return bank;
}

async function render(msg) {
  const post = (m, transfer) => self.postMessage(m, transfer ?? []);
  const controller = new AbortController();
  controllers.set(msg.job, controller);
  try {
    await initOrt(msg.ort);
    const b = await prepareBank(msg, post);
    const runner = makeRunner(`${b.key}|${b.ep}`, b.rt.models, b.read, b.ep, (key) => post({ type: 'progress', job: msg.job, stage: 'load', model: key, done: 0, total: 1 }));
    // Load every model first (the slow part of the first render), then sing.
    const keys = Object.keys(b.rt.models);
    for (let i = 0; i < keys.length; i++) {
      if (controller.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      post({ type: 'progress', job: msg.job, stage: 'load', model: keys[i], done: i, total: keys.length });
      await runner.load(keys[i]);
    }
    const total = msg.phrases.reduce((a, p) => a + Math.max(1, p.notes[p.notes.length - 1].endMs - p.notes[0].startMs), 0);
    let done = 0;
    const timing = { audioMs: 0, renderMs: 0 };
    for (const [i, phrase] of msg.phrases.entries()) {
      post({ type: 'progress', job: msg.job, stage: 'render', phrase: i, phrases: msg.phrases.length, done, total });
      const t0 = performance.now();
      const res = await renderPhrase(b.rt, phrase, runner, { ...msg.opts, signal: controller.signal });
      timing.renderMs += performance.now() - t0;
      timing.audioMs += (res.samples.length / res.sampleRate) * 1000;
      done += Math.max(1, phrase.notes[phrase.notes.length - 1].endMs - phrase.notes[0].startMs);
      post({ type: 'phrase', job: msg.job, index: i, key: phrase.key, startMs: res.startMs, samples: res.samples, sampleRate: res.sampleRate, unknown: res.unknown }, [res.samples.buffer]);
    }
    post({ type: 'progress', job: msg.job, stage: 'render', phrase: msg.phrases.length, phrases: msg.phrases.length, done: total, total });
    post({ type: 'done', job: msg.job, info: { ...info, ep: b.ep, check: b.check, rtf: timing.audioMs ? timing.renderMs / timing.audioMs : null, audioMs: Math.round(timing.audioMs), modelMs: Object.fromEntries(Object.entries(runner.timings).map(([k, v]) => [k, Math.round(v)])) } });
  } catch (error) {
    const aborted = error?.name === 'AbortError' || controller.signal.aborted;
    post({ type: 'error', job: msg.job, message: String(error?.message ?? error), code: aborted ? 'cancelled' : (error?.code ?? 'render') });
  } finally {
    controllers.delete(msg.job);
  }
}

self.onmessage = async ({ data: msg }) => {
  if (msg.type === 'render') render(msg);
  else if (msg.type === 'cancel') controllers.get(msg.job)?.abort();
  else if (msg.type === 'info') self.postMessage({ type: 'info', info: await initOrt(msg.ort).catch((e) => ({ error: String(e?.message ?? e) })) });
  else if (msg.type === 'dispose') { await releaseAll(); bank = null; self.postMessage({ type: 'disposed' }); }
};
