// The built-in synthesizer's voices (Web Audio): one function plays one note of an instrument from
// music/instruments.js — tonal instruments from oscillators, filters and envelopes, drum kits from noise
// and swept sines. The same code runs in an AudioContext (playback) and an OfflineAudioContext (export).
import { instrument } from '../music/instruments.js';
import { midiToFrequency } from '../music/theory.js';
import { sing } from './vocal.js';

const noiseBuffers = new WeakMap();
/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ac) {
  let buffer = noiseBuffers.get(ac);
  if (!buffer) {
    buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = (seed / 0x3fffffff) - 1; }
    noiseBuffers.set(ac, buffer);
  }
  return buffer;
}

const curves = new Map();
/** A soft-clipping curve for `amount` (0–1). */
function driveCurve(amount) {
  const key = Math.round(amount * 100);
  if (!curves.has(key)) {
    const k = 1 + amount * 40;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    curves.set(key, curve);
  }
  return curves.get(key);
}

const stopAll = (nodes, at) => { for (const n of nodes) { try { n.stop(at); } catch { /* not started */ } } };

/**
 * Plays one note. dest: the track's input node; when: context time (s); dur: seconds held;
 * midi; vel 0–1; options: { syllable, track } (the vocal sings the syllable's vowel).
 * Returns the sources (so playback can stop them early) — an empty list for silence.
 */
export function playNote(ac, dest, instrumentId, when, dur, midi, vel, options = {}) {
  const inst = instrument(instrumentId);
  if (inst.drums) return playDrum(ac, dest, inst.voice.kit, midi, when, vel);
  if (inst.vocal) return sing(ac, dest, { voice: inst.voice.voice, when, dur, midi, vel, syllable: options.syllable, previous: options.previous });
  return playTone(ac, dest, inst.voice, when, dur, midi, vel);
}

/** A tonal voice: oscillators (+ FM, noise) → filter (with envelope) → drive → amplitude envelope. */
export function playTone(ac, dest, v, when, dur, midi, vel) {
  const f = midiToFrequency(midi);
  const env = v.env ?? { a: 0.01, d: 0.2, s: 0.7, r: 0.2 };
  const sources = [];
  const amp = ac.createGain();
  const peak = (v.gain ?? 0.4) * (0.25 + vel * 0.75);
  const decaying = v.decay != null;
  const release = Math.max(0.02, env.r);
  const holdEnd = when + Math.max(0.02, dur);
  // Amplitude: attack, decay to sustain (or a natural fade for struck sounds), release after the note.
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(peak, when + Math.max(0.001, env.a));
  if (decaying) {
    const fade = Math.max(0.05, v.decay * (midi > 72 ? 0.7 : midi < 48 ? 1.3 : 1));
    amp.gain.setTargetAtTime(peak * Math.max(0.001, env.s), when + env.a, Math.max(0.02, env.d / 3));
    amp.gain.setTargetAtTime(0.0001, when + env.a + env.d, fade / 4);
  } else {
    amp.gain.setTargetAtTime(peak * env.s, when + env.a, Math.max(0.01, env.d / 3));
  }
  amp.gain.cancelAndHoldAtTime?.(holdEnd);
  amp.gain.setTargetAtTime(0.0001, holdEnd, release / 3);
  const end = holdEnd + release * 1.5 + 0.05;

  let input = amp;
  if (v.drive) {
    const shaper = ac.createWaveShaper();
    shaper.curve = driveCurve(v.drive);
    shaper.oversample = '2x';
    shaper.connect(amp);
    input = shaper;
  }
  if (v.filter) {
    const filter = ac.createBiquadFilter();
    filter.type = v.filter.type ?? 'lowpass';
    const base = v.filter.track ? f * v.filter.freq : v.filter.freq;
    const cut = Math.min(18000, Math.max(40, base));
    filter.Q.value = v.filter.q ?? 0.7;
    if (v.filter.env) {
      const top = Math.min(18000, cut * 2 ** v.filter.env * (0.6 + vel * 0.6));
      filter.frequency.setValueAtTime(top, when);
      filter.frequency.setTargetAtTime(cut, when + 0.005, Math.max(0.01, (v.filter.decay ?? 0.2) / 3));
    } else filter.frequency.setValueAtTime(cut, when);
    filter.connect(input);
    input = filter;
  }
  if (v.formant) {
    // A choir pad: the oscillators sing an "ah" through two formant filters.
    const mix = ac.createGain();
    for (const [freq, gain] of [[800, 1], [1150, 0.6], [2900, 0.25]]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 8;
      const g = ac.createGain(); g.gain.value = gain * 3;
      bp.connect(g).connect(input);
      mix.connect(bp);
    }
    input = mix;
  }
  if (v.tremolo) {
    const trem = ac.createGain();
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = v.tremolo.rate;
    depth.gain.value = v.tremolo.depth * 0.5;
    trem.gain.value = 1 - v.tremolo.depth * 0.5;
    lfo.connect(depth).connect(trem.gain);
    trem.connect(input);
    input = trem;
    lfo.start(when); lfo.stop(end);
    sources.push(lfo);
  }
  amp.connect(dest);

  let vibrato = null;
  if (v.vibrato) {
    vibrato = ac.createOscillator();
    vibrato.frequency.value = v.vibrato.rate;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(v.vibrato.depth, when + (v.vibrato.delay ?? 0) + 0.25);
    vibrato.connect(depth);
    vibrato.depthNode = depth;
    vibrato.start(when); vibrato.stop(end);
    sources.push(vibrato);
  }
  (v.waves ?? [{ type: 'sine', gain: 0.5 }]).forEach((w, i) => {
    const osc = ac.createOscillator();
    osc.type = w.type ?? 'sine';
    osc.frequency.setValueAtTime(f * (w.ratio ?? 1), when);
    if (w.detune) osc.detune.setValueAtTime(w.detune, when);
    const g = ac.createGain();
    g.gain.value = w.gain ?? 0.5;
    osc.connect(g).connect(input);
    if (vibrato) vibrato.depthNode.connect(osc.detune);
    if (i === 0 && v.fm) {
      const mod = ac.createOscillator();
      const index = ac.createGain();
      mod.frequency.setValueAtTime(f * v.fm.ratio, when);
      index.gain.setValueAtTime(f * v.fm.index * (0.5 + vel * 0.5), when);
      index.gain.setTargetAtTime(f * v.fm.index * 0.1, when + 0.01, Math.max(0.01, v.fm.decay / 3));
      mod.connect(index).connect(osc.frequency);
      mod.start(when); mod.stop(end);
      sources.push(mod);
    }
    osc.start(when); osc.stop(end);
    sources.push(osc);
  });
  if (v.noise) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const g = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = Math.min(12000, f * 2);
    g.gain.setValueAtTime(v.noise * (0.4 + vel), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    src.connect(hp).connect(g).connect(input);
    src.start(when, Math.random() * 1.5); src.stop(when + 0.08);
    sources.push(src);
  }
  return sources;
}

// ───────────────────────── drums

/** How each kit colours its drums: pitch, decay and level factors. */
const KITS = {
  pop: { kick: [130, 48, 0.42, 1], snare: [1800, 0.16, 0.9, 190], hat: [7500, 1], tone: 1 },
  acoustic: { kick: [110, 52, 0.38, 0.95], snare: [1500, 0.2, 0.85, 170], hat: [7000, 1], tone: 1 },
  808: { kick: [115, 38, 1.1, 1.1, 0.4], snare: [2000, 0.18, 0.75, 210], hat: [8500, 0.8], tone: 1.1 },
  electro: { kick: [150, 45, 0.32, 1.05, 0.15], snare: [2400, 0.12, 0.95, 220], hat: [9000, 0.9], tone: 1.2 },
  lofi: { kick: [100, 46, 0.35, 0.9], snare: [1100, 0.15, 0.7, 180], hat: [5200, 0.7], tone: 0.8, dull: 3800 },
  rock: { kick: [120, 50, 0.4, 1.05, 0.1], snare: [1400, 0.22, 1, 160], hat: [6800, 1.05], tone: 1 },
  brush: { kick: [95, 50, 0.3, 0.7], snare: [3000, 0.32, 0.45, 0], hat: [6500, 0.55], tone: 0.7, brush: true },
};
const TOMS = { 41: 70, 43: 82, 45: 98, 47: 116, 48: 138, 50: 160 };

function noiseHit(ac, dest, when, { type = 'highpass', freq = 6000, q = 0.7, decay = 0.1, level = 0.5, attack = 0.001 }) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(level, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  src.connect(filter).connect(g).connect(dest);
  src.start(when, (when * 7.31) % 1.5); src.stop(when + attack + decay + 0.05);
  return src;
}

function sweep(ac, dest, when, { from, to, time, decay, level, type = 'sine', drive = 0 }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + time);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(level, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  let out = g;
  if (drive) { const shaper = ac.createWaveShaper(); shaper.curve = driveCurve(drive); g.connect(shaper); out = shaper; }
  osc.connect(g);
  out.connect(dest);
  osc.start(when); osc.stop(when + decay + 0.05);
  return osc;
}

/** One drum hit of a kit (GM drum note numbers). */
export function playDrum(ac, dest, kitId, n, when, vel) {
  const kit = KITS[kitId] ?? KITS.pop;
  const v = 0.3 + vel * 0.7;
  let out = dest;
  if (kit.dull) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kit.dull; lp.connect(dest); out = lp; }
  const s = [];
  switch (n) {
    case 35: case 36: {
      const [from, to, decay, level, drive = 0] = kit.kick;
      s.push(sweep(ac, out, when, { from, to, time: 0.08, decay, level: level * v, drive }));
      s.push(noiseHit(ac, out, when, { type: 'lowpass', freq: 3000, decay: 0.012, level: 0.12 * v }));
      break;
    }
    case 38: case 40: {
      const [freq, decay, level, tone] = kit.snare;
      if (kit.brush) s.push(noiseHit(ac, out, when, { type: 'bandpass', freq, q: 0.6, decay, level: level * v * 0.8, attack: 0.02 }));
      else {
        s.push(noiseHit(ac, out, when, { type: 'highpass', freq, decay, level: level * v * 0.7 }));
        s.push(sweep(ac, out, when, { from: tone * 1.5, to: tone, time: 0.03, decay: 0.09, level: 0.35 * v, type: 'triangle' }));
      }
      break;
    }
    case 37: s.push(sweep(ac, out, when, { from: 1700, to: 1500, time: 0.01, decay: 0.035, level: 0.25 * v, type: 'square' })); s.push(noiseHit(ac, out, when, { freq: 2500, decay: 0.02, level: 0.25 * v })); break;
    case 39: for (const off of [0, 0.011, 0.022]) s.push(noiseHit(ac, out, when + off, { type: 'bandpass', freq: 1300, q: 1.2, decay: off === 0.022 ? 0.14 : 0.012, level: 0.6 * v })); break;
    case 42: s.push(noiseHit(ac, out, when, { freq: kit.hat[0], decay: 0.045, level: 0.28 * v * kit.hat[1] })); break;
    case 44: s.push(noiseHit(ac, out, when, { freq: kit.hat[0] * 0.8, decay: 0.06, level: 0.18 * v * kit.hat[1] })); break;
    case 46: s.push(noiseHit(ac, out, when, { freq: kit.hat[0] * 0.95, decay: 0.32, level: 0.24 * v * kit.hat[1] })); break;
    case 49: case 57: s.push(noiseHit(ac, out, when, { freq: 4200, decay: 1.5, level: 0.3 * v })); s.push(noiseHit(ac, out, when, { type: 'bandpass', freq: 6200, q: 0.5, decay: 0.9, level: 0.12 * v })); break;
    case 51: case 53: {
      s.push(noiseHit(ac, out, when, { freq: 5500, decay: n === 53 ? 0.5 : 0.7, level: 0.12 * v }));
      for (const f of [n === 53 ? 1450 : 3100, n === 53 ? 2150 : 4300]) s.push(sweep(ac, out, when, { from: f, to: f, time: 0.01, decay: n === 53 ? 0.6 : 0.3, level: 0.04 * v, type: 'square' }));
      break;
    }
    case 41: case 43: case 45: case 47: case 48: case 50: {
      const f = TOMS[n] * kit.tone;
      s.push(sweep(ac, out, when, { from: f * 1.6, to: f, time: 0.06, decay: 0.38, level: 0.7 * v }));
      s.push(noiseHit(ac, out, when, { type: 'lowpass', freq: 2500, decay: 0.03, level: 0.1 * v }));
      break;
    }
    case 54: for (const off of [0, 0.008, 0.017]) s.push(noiseHit(ac, out, when + off, { type: 'bandpass', freq: 8500, q: 2, decay: 0.07, level: 0.2 * v })); break;
    case 56: for (const f of [540, 800]) s.push(sweep(ac, out, when, { from: f, to: f, time: 0.01, decay: 0.25, level: 0.12 * v, type: 'square' })); break;
    case 69: case 70: s.push(noiseHit(ac, out, when, { type: 'bandpass', freq: 7000, q: 1.5, decay: 0.05, level: 0.2 * v, attack: 0.012 })); break;
    case 75: s.push(sweep(ac, out, when, { from: 2500, to: 2500, time: 0.01, decay: 0.05, level: 0.3 * v })); break;
    case 81: s.push(sweep(ac, out, when, { from: 4200, to: 4200, time: 0.01, decay: 0.9, level: 0.08 * v })); break;
    default: s.push(noiseHit(ac, out, when, { freq: 3000, decay: 0.08, level: 0.2 * v }));
  }
  return s;
}

/** The longest a note of this instrument rings after it ends (render tails, scheduling). */
export function releaseOf(instrumentId) {
  const inst = instrument(instrumentId);
  if (inst.drums) return 1.6;
  if (inst.vocal) return 0.2;
  return Math.max(inst.voice.env?.r ?? 0.2, inst.voice.decay ?? 0) + 0.1;
}
