// The app's side of sound (core/lib/io/audio.js, audiorec.js): the engine posts and requests
// audio.* messages and this plays and records them with Web Audio.
//
//   posts:    audio.play {id, sampleRate, numChannels, channels}, audio.stop / audio.pause /
//             audio.resume {id}, audio.beep, audio.record.pause / audio.record.resume {id}
//   requests: audio.playBlocking (answered when the sound has ended), audio.devices,
//             audio.record.start / .data / .stop, audio.recordBlocking (samples as numbers in [-1, 1])
//
//   installAudioHost(engine) → () => void (uninstall)

let ctx = null;
const audio = () => { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; };

// ------------------------------------------------------------------ playing
const players = new Map(); // id → { buffer, node, startedAt, offset }

function bufferOf(msg) {
  const rate = Number(msg.sampleRate) || 8192;
  const raw = msg.channels || [];
  const chans = Array.isArray(raw[0]) || ArrayBuffer.isView(raw[0]) ? raw : [raw];
  const n = chans[0] ? chans[0].length : 0;
  if (!n) return null;
  const channels = Math.max(1, Number(msg.numChannels || chans.length));
  const buf = audio().createBuffer(channels, n, rate);
  for (let c = 0; c < channels; c++) {
    const out = buf.getChannelData(c);
    const src = chans[Math.min(c, chans.length - 1)];
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, Number(src[i]) || 0));
  }
  return buf;
}

function start(id, p, offset = 0) {
  const a = audio();
  const node = a.createBufferSource();
  node.buffer = p.buffer;
  node.connect(a.destination);
  node.onended = () => { if (p.node === node) { p.node = null; if (p.done) p.done(); } };
  node.start(0, offset);
  Object.assign(p, { node, startedAt: a.currentTime, offset });
}

function play(msg) {
  try {
    const buffer = bufferOf(msg);
    if (!buffer) return null;
    const id = msg.id || `p${players.size + 1}`;
    stopPlayer(id);
    const p = { buffer };
    players.set(id, p);
    start(id, p, 0);
    return p;
  } catch (e) { console.error('audio.play', e); return null; }
}
function stopPlayer(id) {
  const p = players.get(id);
  if (!p) return;
  const node = p.node;
  p.node = null;
  if (node) { try { node.stop(); } catch { /* ended */ } }
  if (p.done) p.done();
  players.delete(id);
}
function pausePlayer(id) {
  const p = players.get(id);
  if (!p || !p.node) return;
  const node = p.node;
  p.node = null;
  p.offset += audio().currentTime - p.startedAt;
  try { node.stop(); } catch { /* ended */ }
}
function resumePlayer(id) {
  const p = players.get(id);
  if (p && !p.node && p.offset < p.buffer.duration) start(id, p, p.offset);
}
function beep() {
  try {
    const a = audio();
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.15);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + 0.16);
  } catch (e) { console.error('audio.beep', e); }
}

// ------------------------------------------------------------------ recording
const recorders = new Map(); // id → { stream, ctx, node, chunks: [[Float32Array…] per channel], channels, paused, timer }

async function devices() {
  const md = navigator.mediaDevices;
  if (!md || !md.enumerateDevices) return { input: [], output: [] };
  const list = await md.enumerateDevices();
  const pick = (kind) => list.filter((d) => d.kind === kind).map((d, i) => ({ name: d.label || `${kind === 'audioinput' ? 'Input' : 'Output'} ${i + 1}`, id: i, driver: 'Web Audio', deviceId: d.deviceId }));
  return { input: pick('audioinput'), output: pick('audiooutput') };
}

async function startRecording(m) {
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return { error: 'This window cannot record sound (no microphone access).' };
  stopRecording(m.id);
  let deviceId;
  if (m.deviceId != null && Number(m.deviceId) >= 0) { const d = (await devices()).input[Number(m.deviceId)]; deviceId = d && d.deviceId; }
  const want = Math.max(1, Number(m.numChannels) || 1);
  let stream;
  try {
    stream = await md.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: want, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) { return { error: `Recording was not allowed: ${e.message || e}` }; }
  let rctx;
  try { rctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: Number(m.sampleRate) || 8000 }); } catch { rctx = new (window.AudioContext || window.webkitAudioContext)(); }
  const source = rctx.createMediaStreamSource(stream);
  // ScriptProcessor: simple and everywhere; the frames go to the engine as plain numbers later
  const node = rctx.createScriptProcessor(4096, want, want);
  const r = { stream, ctx: rctx, source, node, chunks: Array.from({ length: want }, () => []), channels: want, paused: false, timer: null, rate: rctx.sampleRate, limit: m.seconds ? Math.round(m.seconds * rctx.sampleRate) : Infinity, got: 0 };
  node.onaudioprocess = (e) => {
    if (r.paused || r.got >= r.limit) return;
    const n = Math.min(e.inputBuffer.length, r.limit - r.got);
    for (let c = 0; c < want; c++) {
      const ch = e.inputBuffer.getChannelData(Math.min(c, e.inputBuffer.numberOfChannels - 1));
      r.chunks[c].push(Float32Array.from(ch.subarray(0, n)));
    }
    r.got += n;
  };
  source.connect(node);
  node.connect(rctx.destination);   // a ScriptProcessor only runs when connected (it outputs silence)
  recorders.set(m.id, r);
  return { ok: true, sampleRate: r.rate };
}

/** The recorded frames so far (per channel, as number arrays; resampled to rate when the context ran at another rate). */
function takeData(r, rate) {
  const chans = r.chunks.map((parts) => {
    const n = parts.reduce((s, p) => s + p.length, 0);
    const all = new Float32Array(n);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    return all;
  });
  const want = Number(rate) || r.rate;
  if (Math.abs(want - r.rate) < 1) return chans.map((c) => Array.from(c));
  // linear resampling
  return chans.map((c) => {
    const m = Math.max(0, Math.round((c.length * want) / r.rate));
    const out = new Array(m);
    for (let i = 0; i < m; i++) { const x = (i * r.rate) / want; const k = Math.floor(x); const f = x - k; out[i] = (c[k] || 0) * (1 - f) + (c[k + 1] ?? c[k] ?? 0) * f; }
    return out;
  });
}
function stopRecording(id) {
  const r = recorders.get(id);
  if (!r) return null;
  recorders.delete(id);
  try { r.source.disconnect(); r.node.disconnect(); } catch { /* gone */ }
  for (const t of r.stream.getTracks()) t.stop();
  r.ctx.close().catch(() => {});
  return r;
}

async function recordBlocking(m) {
  const started = await startRecording({ ...m, seconds: m.seconds });
  if (started.error) return started;
  const r = recorders.get(m.id);
  const ms = Math.max(0, Number(m.seconds) || 0) * 1000;
  await new Promise((res) => {
    const t0 = Date.now();
    const tick = () => (r.got >= r.limit || Date.now() - t0 > ms + 1500 ? res() : setTimeout(tick, 50));
    setTimeout(tick, Math.min(ms, 50));
  });
  stopRecording(m.id);
  return { channels: takeData(r, m.sampleRate) };
}

// ------------------------------------------------------------------ wiring
export function installAudioHost(engine) {
  const recRate = new Map();
  const offs = [
    engine.on('audio.play', (m) => { play(m); }),
    engine.on('audio.stop', (m) => stopPlayer(m.id)),
    engine.on('audio.pause', (m) => pausePlayer(m.id)),
    engine.on('audio.resume', (m) => resumePlayer(m.id)),
    engine.on('audio.beep', () => beep()),
    engine.onRequest('audio.playBlocking', (m) => new Promise((resolve) => {
      const p = play(m);
      if (!p) { resolve({ ok: true }); return; }
      p.done = () => resolve({ ok: true });
    })),
    engine.onRequest('audio.devices', () => devices()),
    engine.onRequest('audio.record.start', async (m) => { recRate.set(m.id, m.sampleRate); return startRecording(m); }),
    engine.onRequest('audio.record.data', (m) => { const r = recorders.get(m.id); return { channels: r ? takeData(r, recRate.get(m.id)) : [] }; }),
    engine.onRequest('audio.record.stop', (m) => { const r = stopRecording(m.id); return { channels: r ? takeData(r, recRate.get(m.id)) : [] }; }),
    engine.on('audio.record.pause', (m) => { const r = recorders.get(m.id); if (r) r.paused = true; }),
    engine.on('audio.record.resume', (m) => { const r = recorders.get(m.id); if (r) r.paused = false; }),
    engine.onRequest('audio.recordBlocking', (m) => recordBlocking(m)),
  ];
  return () => { for (const off of offs) if (typeof off === 'function') off(); for (const id of [...players.keys()]) stopPlayer(id); for (const id of [...recorders.keys()]) stopRecording(id); };
}
