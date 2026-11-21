// The sampler: plays instruments from the bundled sound library (real recordings, see soundlib.js and
// scripts/fetch-sounds.mjs) — nearest recorded note pitched by playbackRate, a velocity layer, attack and release
// envelope, baked loops for sustained notes, drum hits per General MIDI drum note with hi-hat choke. An instrument
// with `samples` in music/instruments.js plays here once its sets are loaded; until then (or when the library
// is missing) voices.js plays the built-in synthesizer instead.
//
// Decoded samples are kept once for the whole program (AudioBuffers work in every context: the speakers'
// AudioContext and an export's OfflineAudioContext). Call preloadInstruments() before scheduling.
import { instrument, INSTRUMENTS } from '../music/instruments.js';
import { fetchSoundFile, loadManifest, currentManifest, setFiles, setsOfInstrument } from './soundlib.js';

const SAMPLE_RATE = 48000;
const buffers = new Map();   // file → AudioBuffer
const loads = new Map();     // setId → Promise<boolean>
const failedSets = new Set();
let generation = 0;

const isCancelled = (signal) => Boolean(signal?.aborted || signal?.cancelled);
const cancelledError = () => Object.assign(new Error('cancelled'), { code: 'cancelled' });
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Whether a set's samples are all decoded. */
export function setReady(setId) {
  const set = currentManifest()?.sets?.[setId];
  return Boolean(set) && !failedSets.has(setId) && setFiles(set).every((z) => buffers.has(z.file));
}

/** Whether an instrument plays from samples now (false: the synthesizer plays it). */
export function instrumentReady(id) {
  const inst = instrument(id);
  if (!inst.samples || !currentManifest()) return false;
  return [].concat(inst.samples).every((s) => setReady(s));
}

/** The instrument ids of a song's tracks. */
export const songInstruments = (song) => [...new Set((song?.tracks ?? []).map((t) => t.instrument))];

/** Instruments of the list that have samples but are not loaded yet. */
export function instrumentsToLoad(ids) {
  return [...new Set(ids)].filter((id) => instrument(id).samples && !instrumentReady(id));
}

async function toBuffer(ac, decoded) {
  const { channelData, length, sampleRate } = decoded;
  let buffer;
  try { buffer = new AudioBuffer({ length: Math.max(1, length), numberOfChannels: channelData.length, sampleRate }); } catch { buffer = ac.createBuffer(channelData.length, Math.max(1, length), sampleRate); }
  channelData.forEach((ch, i) => { if (buffer.copyToChannel) buffer.copyToChannel(ch, i); else buffer.getChannelData(i).set(ch); });
  return buffer;
}

let opusDecode = null;
async function decodeFile(ac, bytes) {
  try {
    opusDecode ??= (await import('./ogg-opus.js')).decodeOggOpus;
    return await toBuffer(ac, await opusDecode(bytes));
  } catch (error) {
    // The WebAssembly decoder could not run: the platform's own decoder (most browsers read Ogg Opus).
    if (typeof ac?.decodeAudioData !== 'function') throw error;
    return await new Promise((resolve, reject) => {
      const copy = bytes.slice().buffer;
      const p = ac.decodeAudioData(copy, resolve, reject);
      p?.then?.(resolve, reject);
    });
  }
}

/**
 * Loads (fetches and decodes) the samples of these instruments. Never throws for a missing or damaged library —
 * those instruments keep the synthesizer — except when cancelled (error.code 'cancelled').
 * options: { onProgress({ fraction, done, total, instrumentsDone, instrumentsTotal, bytes, totalBytes, instrument }),
 *            signal (AbortSignal or { cancelled }) }.
 * Resolves { loaded: [instrument ids], failed: [instrument ids], available (the library was found) }.
 */
export async function preloadInstruments(ac, ids, { onProgress = null, signal = null } = {}) {
  const wanted = [...new Set(ids)].filter((id) => instrument(id).samples);
  const m = await loadManifest();
  if (!m) { onProgress?.({ fraction: 1, done: 0, total: 0, instrumentsDone: wanted.length, instrumentsTotal: wanted.length, bytes: 0, totalBytes: 0 }); return { loaded: [], failed: wanted, available: false }; }
  const plan = wanted.map((id) => ({ id, sets: setsOfInstrument(id, m).filter((s) => m.sets[s]) }));
  const files = [...new Map(plan.flatMap((p) => p.sets.flatMap((s) => setFiles(m.sets[s]).map((z) => [z.file, { ...z, set: s }])))).values()].filter((z) => !buffers.has(z.file));
  const totalBytes = files.reduce((s, z) => s + (z.bytes ?? 0), 0);
  let done = 0; let bytes = 0; let instrumentsDone = 0;
  const report = (name) => onProgress?.({ fraction: totalBytes ? bytes / totalBytes : files.length ? done / files.length : 1, done, total: files.length, instrumentsDone, instrumentsTotal: plan.length, bytes, totalBytes, instrument: name });
  report(null);
  const myGeneration = generation;
  for (const p of plan) {
    for (const setId of p.sets) {
      if (failedSets.has(setId)) continue;
      const todo = setFiles(m.sets[setId]).filter((z) => !buffers.has(z.file));
      // Fetch a few ahead, decode one at a time (decoding blocks the page briefly; yield between files).
      const fetches = new Map();
      const fetchAhead = (i) => { const z = todo[i]; if (z && !fetches.has(z.file)) fetches.set(z.file, fetchSoundFile(z.file).catch((e) => e)); };
      for (let i = 0; i < Math.min(4, todo.length); i++) fetchAhead(i);
      for (let i = 0; i < todo.length; i++) {
        if (isCancelled(signal)) throw cancelledError();
        fetchAhead(i + 4);
        const z = todo[i];
        const data = await fetches.get(z.file);
        fetches.delete(z.file);
        if (!buffers.has(z.file)) {
          try {
            if (data instanceof Error) throw data;
            const buffer = await decodeFile(ac, data);
            if (myGeneration === generation) buffers.set(z.file, buffer);
          } catch { failedSets.add(setId); }
        }
        done += 1; bytes += z.bytes ?? 0;
        report(p.id);
        await pause();
        if (failedSets.has(setId)) break;
      }
    }
    instrumentsDone += 1;
    report(p.id);
  }
  const loaded = wanted.filter((id) => instrumentReady(id));
  return { loaded, failed: wanted.filter((id) => !loaded.includes(id)), available: true };
}

/** Loads in the background (playback picks the samples up as they arrive). */
export function preloadInBackground(ac, ids) {
  const key = instrumentsToLoad(ids).sort().join(',');
  if (!key) return Promise.resolve();
  if (!loads.has(key)) loads.set(key, preloadInstruments(ac, key.split(',')).catch(() => {}).finally(() => loads.delete(key)));
  return loads.get(key);
}

/** Forgets decoded samples (after a repair, or to free memory); the next play loads again. */
export function forgetSamples() {
  buffers.clear(); failedSets.clear(); loads.clear();
  generation += 1;
}

// ───────────────────────── effects (guitar amp, tone)

const curves = new Map();
function driveCurve(amount) {
  const key = Math.round(amount * 100);
  if (!curves.has(key)) {
    const k = 1 + amount * 60;
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    curves.set(key, curve);
  }
  return curves.get(key);
}

const chains = new WeakMap(); // destination node → Map(fx key → input node)
/**
 * The effect chain of an instrument into `dest`, shared by all its notes on that track (an overdriven guitar
 * distorts the chord as a whole, like an amplifier). fx: { drive 0–1, cab (speaker cabinet), bright (dB), warm (dB) }.
 */
function fxInput(ac, dest, fx) {
  if (!fx || !(fx.drive || fx.cab || fx.bright || fx.warm)) return dest;
  let map = chains.get(dest);
  if (!map) { map = new Map(); chains.set(dest, map); }
  const key = JSON.stringify(fx);
  if (map.has(key)) return map.get(key);
  let out = dest;
  const chain = [];
  if (fx.cab) {
    // A 4×12 cabinet, roughly: no deep lows, a presence bump, nothing above ~5 kHz.
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.7;
    const mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1800; mid.Q.value = 0.9; mid.gain.value = 3;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fx.drive > 0.6 ? 4300 : 5200; lp.Q.value = 0.8;
    const lp2 = ac.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 7000; lp2.Q.value = 0.5;
    chain.push(hp, mid, lp, lp2);
  }
  if (fx.bright) { const hs = ac.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 2500; hs.gain.value = fx.bright; chain.push(hs); }
  if (fx.warm) { const ls = ac.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 250; ls.gain.value = fx.warm; chain.push(ls); }
  // chain order: [drive →] filters → dest
  for (let i = chain.length - 1; i >= 0; i--) { chain[i].connect(out); out = chain[i]; }
  if (fx.drive) {
    const pre = ac.createGain(); pre.gain.value = 1 + fx.drive * 6;
    const tight = ac.createBiquadFilter(); tight.type = 'highpass'; tight.frequency.value = 160; // tight low end before the clipping
    const shaper = ac.createWaveShaper(); shaper.curve = driveCurve(fx.drive); shaper.oversample = '4x';
    const post = ac.createGain(); post.gain.value = 0.45 / (1 + fx.drive);
    pre.connect(tight).connect(shaper).connect(post).connect(out);
    out = pre;
  }
  map.set(key, out);
  return out;
}

// ───────────────────────── notes

const velocityAmp = (vel) => (0.22 + 0.78 * Math.max(0, Math.min(1, vel))) ** 1.5;
const layerOf = (layers, vel) => layers.find((l) => vel >= l.vel[0] && vel < l.vel[1]) ?? (vel >= 1 ? layers.at(-1) : layers[0]);

const ranges = new WeakMap();
function rootRange(set) {
  if (!ranges.has(set)) { const roots = set.layers.flatMap((l) => l.zones.map((z) => z.root)); ranges.set(set, [Math.min(...roots), Math.max(...roots)]); }
  return ranges.get(set);
}

function nearestZone(zones, midi) {
  let best = zones[0]; let bestD = Infinity;
  for (const z of zones) {
    const d = Math.abs(midi - z.root);
    // On a tie, the recording above (pitching down sounds more natural).
    if (d < bestD || (d === bestD && z.root > best.root)) { best = z; bestD = d; }
  }
  return best;
}

/**
 * Plays one note of a sampled instrument, or returns null when its samples are not loaded (the caller then
 * uses the synthesizer). Returns the sources, like voices.playTone.
 */
export function playSampledNote(ac, dest, inst, when, dur, midi, vel) {
  const m = currentManifest();
  if (!m || !inst.samples) return null;
  const all = [].concat(inst.samples);
  if (!all.every((s) => setReady(s))) return null;
  // A section of several instruments: each plays only near its own range (no trumpet growling at tuba depth).
  const near = all.filter((s) => { const [lo, hi] = rootRange(m.sets[s]); return midi >= lo - 7 && midi <= hi + 7; });
  const ids = near.length ? near : all;
  const fx = inst.sampleFx ?? null;
  const input = fxInput(ac, dest, fx);
  const sources = [];
  const spread = ids.length > 1 ? [0, 7, -7, 4] : [0];
  ids.forEach((setId, i) => {
    const set = m.sets[setId];
    const layer = layerOf(set.layers, vel);
    const zone = nearestZone(layer.zones, midi);
    const buffer = buffers.get(zone.file);
    if (!buffer) return;
    const rate = 2 ** ((midi - zone.root) / 12 - (zone.tune ?? 0) / 1200 + (spread[i] ?? 0) / 1200);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, when);
    const looping = Boolean(set.loop && zone.loop);
    if (looping) { src.loop = true; src.loopStart = zone.loop[0]; src.loopEnd = zone.loop[1]; }
    const amp = ac.createGain();
    const peak = set.gain * (inst.sampleGain ?? 1) * (fx?.gain ?? 1) * velocityAmp(vel) / Math.sqrt(ids.length);
    const attack = Math.max(0.001, set.attack ?? 0.003);
    const hold = Math.max(when + attack, when + Math.max(0.02, dur));
    const release = Math.max(0.03, set.release ?? 0.2);
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + attack);
    amp.gain.setValueAtTime(peak, hold);
    amp.gain.setTargetAtTime(0, hold, release / 3);
    const natural = looping ? Infinity : when + buffer.duration / rate;
    const stopAt = Math.min(natural, hold + release * 2.5) + 0.02;
    src.connect(amp).connect(input);
    src.start(when);
    src.stop(Math.max(when + 0.01, stopAt));
    sources.push(src);
  });
  return sources.length ? sources : null;
}

const chokes = new WeakMap(); // destination → Map(group → { amp, src, until })

/**
 * One drum hit of a sampled kit (GM drum note), or null when the kit has no sample for the note or is not
 * loaded (the caller then uses the synthesized drum). Hi-hats choke each other.
 */
export function playSampledDrum(ac, dest, setId, n, when, vel) {
  const m = currentManifest();
  const kit = m?.sets?.[setId];
  if (!kit || !setReady(setId)) return null;
  let hit = kit.notes[n];
  if (!hit && kit.also && setReady(kit.also)) hit = m.sets[kit.also]?.notes?.[n];
  const gain = hit && kit.notes[n] ? kit.gain : (m.sets[kit.also]?.gain ?? kit.gain);
  if (!hit) return null;
  const layer = layerOf(hit.layers, vel);
  const buffer = buffers.get(layer.file);
  if (!buffer) return null;
  const rate = 2 ** ((hit.pitch ?? 0) / 12);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.setValueAtTime(rate, when);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain * Math.sqrt(layer.level ?? 1) * (0.3 + 0.7 * Math.max(0, Math.min(1, vel))), when);
  src.connect(amp).connect(dest);
  src.start(when);
  const end = when + buffer.duration / rate;
  src.stop(end + 0.02);
  if (hit.group) {
    let map = chokes.get(dest);
    if (!map) { map = new Map(); chokes.set(dest, map); }
    const before = map.get(hit.group);
    if (before && before.until > when && before.start < when) {
      try {
        before.amp.gain.setTargetAtTime(0, when, 0.012);
        before.src.stop(when + 0.08);
      } catch { /* already stopped */ }
    }
    map.set(hit.group, { amp, src, start: when, until: end });
  }
  return [src];
}

/** How long a sampled instrument rings after its note ends (render tails, preview clean-up), or null. */
export function sampledRelease(inst) {
  const m = currentManifest();
  if (!m || !inst.samples) return null;
  const rel = Math.max(...[].concat(inst.samples).map((s) => m.sets[s]?.release ?? 0.2));
  return rel * 2.5 + 0.1;
}

/** The sampled kit set of a synthesizer kit name ('pop' → 'popKit'), for voices.playDrum. */
export const KIT_SETS = Object.fromEntries(INSTRUMENTS.filter((i) => i.drums && i.samples).map((i) => [i.voice.kit, i.samples]));

export { SAMPLE_RATE };
