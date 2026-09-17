'use strict';

/**
 * 알람음 생성기 — MyClockWinV10/Services/WavToneGenerator.cs 이식.
 * WAV 파일을 캐시하는 대신 같은 합성 공식을 Web Audio 버퍼로 만든다.
 */

const RATE = 44100;

// ── 유틸 ────────────────────────────────────────────────────────────────

const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);
const phase = (hz, t) => 2 * Math.PI * hz * t;

function fadeInOut(i, n, attack, release) {
  const fadeIn = Math.min(1, i / Math.max(1, attack));
  const fadeOut = Math.min(1, (n - i) / Math.max(1, release));
  return fadeIn * fadeOut;
}

function silence(seconds) {
  return new Float32Array(Math.round(RATE * seconds));
}

function offset(src, offsetSamples) {
  const out = new Float32Array(src.length + offsetSamples);
  out.set(src, offsetSamples);
  return out;
}

function scale(src, factor) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] * factor;
  return out;
}

function normalize(samples, peak) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  if (max < 1e-6) return samples;
  const gain = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

function concat(...parts) {
  const len = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return normalize(out, 0.92);
}

function repeatPattern(pattern, times) {
  return concat(...Array.from({ length: times }, () => pattern));
}

function addAt(dest, src, offsetSamples) {
  for (let i = 0; i < src.length && offsetSamples + i < dest.length; i++) {
    dest[offsetSamples + i] += src[i];
  }
}

/** 재현 가능한 의사난수 — C# `new Random(42)` 자리를 대신한다. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ── 음색 ────────────────────────────────────────────────────────────────

function pluckVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp((-7.0 * t) / dur);
    s[i] =
      env *
      amp *
      (Math.sin(phase(hz, t)) * 0.75 + Math.sin(phase(hz * 2.01, t)) * 0.2 + Math.sin(phase(hz * 3.98, t)) * 0.08);
  }
  return s;
}

const softPluckVoice = (hz, dur, amp) => scale(pluckVoice(hz, dur * 1.1, amp), 0.85);

function softBellVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp((-3.5 * t) / dur);
    s[i] =
      env *
      amp *
      (Math.sin(phase(hz, t)) * 0.6 + Math.sin(phase(hz * 2.4, t)) * 0.25 + Math.sin(phase(hz * 5.2, t)) * 0.1);
  }
  return s;
}

const bellVoice = (hz, dur, amp) => softBellVoice(hz, dur, amp * 1.1);

function pianoVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp((-4.0 * t) / dur) * (1 - Math.exp(-30 * t));
    s[i] = env * amp * Math.sin(phase(hz, t));
  }
  return s;
}

const harpVoice = (hz, dur, amp) => pluckVoice(hz, dur * 0.9, amp * 0.9);

function brassVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = fadeInOut(i, n, RATE * 0.01, RATE * 0.06);
    const wave = Math.sin(phase(hz, t)) * 0.7 + Math.sin(phase(hz * 2, t)) * 0.25;
    s[i] = wave * amp * env;
  }
  return s;
}

function sineVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    s[i] = Math.sin(phase(hz, t)) * amp * fadeInOut(i, n, RATE * 0.005, RATE * 0.02);
  }
  return s;
}

function squareVoice(hz, dur, amp) {
  const n = Math.round(RATE * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    s[i] = (Math.sin(phase(hz, t)) >= 0 ? 1 : -1) * amp * 0.35;
  }
  return s;
}

// ── 패턴 빌더 ───────────────────────────────────────────────────────────

function patternMelody(notes, noteSec, amp, voice) {
  return concat(...notes.map((note) => voice(midi(note), noteSec, amp)));
}

const patternArpeggio = patternMelody;

function patternRadar() {
  const n = Math.round(RATE * 2.4);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const sweep = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 0.55);
    const hz = 520 + sweep * 680;
    s[i] = Math.sin(phase(hz, t)) * 0.42 * fadeInOut(i, n, RATE * 0.02, RATE * 0.04);
  }
  return s;
}

function patternBeacon() {
  const a = squareVoice(880, 0.22, 0.5);
  const gap = silence(0.08);
  const b = squareVoice(660, 0.22, 0.45);
  return repeatPattern(concat(a, gap, b, gap), 4);
}

function patternCircuit() {
  const s = new Float32Array(Math.round(RATE * 2.2));
  const freqs = [440, 554, 659, 880];
  let pos = 0;
  for (let r = 0; r < 3; r++) {
    for (const f of freqs) {
      addAt(s, squareVoice(f, 0.07, 0.38), pos);
      pos += Math.round(RATE * 0.11);
    }
    pos += Math.round(RATE * 0.06);
  }
  return s;
}

function patternSlowRise() {
  const notes = [60, 62, 64, 65, 67, 69, 71, 72];
  return concat(...notes.map((note) => softBellVoice(midi(note), 0.38, 0.34)));
}

function patternOrbit() {
  const s = new Float32Array(Math.round(RATE * 2.5));
  const seq = [67, 71, 74, 77, 74, 71];
  let pos = 0;
  for (let lap = 0; lap < 2; lap++) {
    for (const n of seq) {
      addAt(s, softPluckVoice(midi(n), 0.2, 0.36), pos);
      pos += Math.round(RATE * 0.19);
    }
  }
  return s;
}

function patternRipple() {
  const s = new Float32Array(Math.round(RATE * 2.4));
  for (let i = 0; i < 6; i++) {
    addAt(s, pluckVoice(520 + i * 55, 0.28, 0.4 - i * 0.03), i * Math.round(RATE * 0.22));
  }
  return s;
}

function patternChime() {
  const a = bellVoice(midi(72), 0.55, 0.45);
  const b = offset(bellVoice(midi(76), 0.65, 0.42), Math.round(RATE * 0.32));
  return concat(a, b, silence(0.35));
}

function patternBell() {
  const s = new Float32Array(Math.round(RATE * 1.8));
  addAt(s, bellVoice(880, 1.0, 0.38), 0);
  addAt(s, bellVoice(1320, 0.85, 0.18), 0);
  for (let i = 0; i < s.length; i++) s[i] *= Math.exp((-2.2 * i) / s.length);
  return concat(s, silence(0.4));
}

function patternDigital() {
  const beep = squareVoice(988, 0.09, 0.42);
  const rest = silence(0.07);
  return repeatPattern(concat(beep, rest, beep, rest, beep, silence(0.28)), 2);
}

function patternLadder() {
  const notes = [60, 64, 67, 71, 74, 77, 81];
  return concat(...notes.map((n) => pluckVoice(midi(n), 0.16, 0.44)));
}

function patternEcho() {
  const core = pluckVoice(midi(76), 0.35, 0.5);
  const s = new Float32Array(Math.round(RATE * 2.2));
  addAt(s, core, 0);
  addAt(s, scale(core, 0.55), Math.round(RATE * 0.38));
  addAt(s, scale(core, 0.32), Math.round(RATE * 0.76));
  return s;
}

function patternWave() {
  const n = Math.round(RATE * 2.5);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const hz = 420 + Math.sin(2 * Math.PI * 2.2 * t) * 120;
    s[i] = Math.sin(phase(hz, t)) * 0.32 * fadeInOut(i, n, RATE * 0.05, RATE * 0.1);
  }
  return s;
}

function patternPulse() {
  const s = new Float32Array(Math.round(RATE * 2.0));
  for (let p = 0; p < 6; p++) addAt(s, sineVoice(740, 0.09, 0.48), p * Math.round(RATE * 0.16));
  return s;
}

function patternBird() {
  const s = new Float32Array(Math.round(RATE * 1.6));
  let pos = 0;
  for (const f of [2000, 2350, 1800, 2500, 2100]) {
    addAt(s, sineVoice(f, 0.1, 0.35), pos);
    pos += Math.round(RATE * 0.13);
  }
  return concat(s, silence(0.5));
}

function patternClock() {
  const tick = squareVoice(1200, 0.04, 0.25);
  const tock = squareVoice(800, 0.04, 0.22);
  return repeatPattern(concat(tick, silence(0.04), tock, silence(0.36)), 3);
}

function patternBreeze() {
  const s = new Float32Array(Math.round(RATE * 2.3));
  const rand = seededRandom(42);
  let pos = 0;
  while (pos < s.length - RATE * 0.2) {
    const hz = 600 + rand() * 500;
    addAt(s, softBellVoice(hz, 0.14 + rand() * 0.08, 0.28), pos);
    pos += Math.round(RATE * (0.14 + rand() * 0.12));
  }
  return s;
}

function patternSiren() {
  const n = Math.round(RATE * 2.2);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const hz = 480 + 280 * Math.sin((2 * Math.PI * t) / 0.45);
    s[i] = Math.sin(phase(hz, t)) * 0.36;
  }
  return s;
}

function patternUrgent() {
  return repeatPattern(concat(squareVoice(784, 0.12, 0.5), silence(0.06)), 8);
}

const PATTERNS = {
  Marimba: () => patternMelody([76, 79, 84, 79, 76, 72, 76], 0.14, 0.52, pluckVoice),
  Radar: patternRadar,
  Beacon: patternBeacon,
  Circuit: patternCircuit,
  Crystals: () => patternArpeggio([84, 88, 91, 95, 91, 88], 0.1, 0.32, bellVoice),
  Hillside: () => patternMelody([64, 67, 71, 72, 71, 67], 0.22, 0.42, pluckVoice),
  Sencha: () => patternMelody([60, 64, 67, 64], 0.35, 0.38, softPluckVoice),
  Silk: () => patternMelody([67, 69, 71, 74, 71, 69], 0.28, 0.32, softBellVoice),
  SlowRise: patternSlowRise,
  Stargaze: () => patternArpeggio([60, 64, 67, 72, 76], 0.18, 0.34, softBellVoice),
  Summit: () => patternMelody([60, 64, 67, 71, 74, 71, 67], 0.2, 0.45, pluckVoice),
  Dawn: () => patternMelody([67, 69, 71, 74, 76, 74, 71], 0.25, 0.36, softPluckVoice),
  Galaxy: () => patternArpeggio([48, 55, 60, 64, 67, 72], 0.16, 0.3, bellVoice),
  Orbit: patternOrbit,
  Ripple: patternRipple,
  Chime: patternChime,
  Bell: patternBell,
  Digital: patternDigital,
  Piano: () => patternMelody([72, 76, 79, 84], 0.24, 0.5, pianoVoice),
  Harp: () => patternArpeggio([60, 64, 67, 71, 74, 78], 0.12, 0.28, harpVoice),
  Fanfare: () => patternMelody([60, 64, 67, 72, 76, 72], 0.16, 0.48, brassVoice),
  Ladder: patternLadder,
  Echo: patternEcho,
  Wave: patternWave,
  Gentle: () => patternMelody([64, 67, 71], 0.45, 0.35, softBellVoice),
  Pulse: patternPulse,
  Bird: patternBird,
  Clock: patternClock,
  Breeze: patternBreeze,
  Siren: patternSiren,
  Urgent: patternUrgent,
  Classic: () => patternMelody([72, 76, 79, 84], 0.32, 0.44, bellVoice)
};

// ── 재생 ────────────────────────────────────────────────────────────────

/** 알람음 합성·재생기 — 생성한 버퍼는 사운드 id 별로 캐시한다. */
class AlarmSoundPlayer {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    this.buffers = new Map();
    /** @type {AudioBufferSourceNode | null} */
    this.source = null;
    /** @type {GainNode | null} */
    this.gain = null;
    this.volume = 0.5;
  }

  ensureContext() {
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') this.context.resume();
    return this.context;
  }

  bufferFor(soundId) {
    const id = PATTERNS[soundId] ? soundId : 'Marimba';
    if (this.buffers.has(id)) return this.buffers.get(id);

    const samples = PATTERNS[id]();
    const ctx = this.ensureContext();
    const buffer = ctx.createBuffer(1, samples.length, RATE);
    buffer.getChannelData(0).set(samples);
    this.buffers.set(id, buffer);
    return buffer;
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** 한 번 재생 (미리듣기). */
  preview(soundId, volume) {
    this.play(soundId, volume, false);
  }

  /** @param {boolean} loop 알람이 해제될 때까지 반복할지 여부 */
  play(soundId, volume, loop = true) {
    this.stop();
    const ctx = this.ensureContext();
    if (typeof volume === 'number') this.volume = Math.min(1, Math.max(0, volume));

    const source = ctx.createBufferSource();
    source.buffer = this.bufferFor(soundId);
    source.loop = loop;

    const gain = ctx.createGain();
    gain.gain.value = this.volume;

    source.connect(gain).connect(ctx.destination);
    source.start();

    this.source = source;
    this.gain = gain;
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.gain = null;
      }
    };
  }

  stop() {
    if (!this.source) return;
    try {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
    } catch {
      /* 이미 멈춘 소스는 무시 */
    }
    this.source = null;
    this.gain = null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { AlarmSoundPlayer, PATTERNS };
}
