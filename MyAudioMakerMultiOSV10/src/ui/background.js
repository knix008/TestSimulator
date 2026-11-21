// Moving backgrounds for the start page: twenty quiet scenes from the world of music (the list is
// ANIMATIONS in settings): a waveform, an equalizer, floating notes, a staff being written, a turning
// record, piano keys playing, a spectrum, ripples of sound, vibrating strings, a metronome, a step
// sequencer, an oscilloscope, pulsing speakers, a cassette, confetti on the beat, lyrics scrolling, the
// circle of fifths, mixer faders, an aurora of sound and a sky of notes. Colours follow the theme. The
// animation pauses while the window is hidden; `frames` counts drawn frames (tests use it).
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;
/** The kind used when a saved one is unknown (an older version's background). */
export const DEFAULT_ANIMATION = ANIMATIONS[0];

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const hash = (a, b = 0, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mod = (v, m) => ((v % m) + m) % m;
const cycle = (time, period) => { const t = time / period; return { round: Math.floor(t), phase: t - Math.floor(t) }; };

const rgbCache = new Map();
function hexToRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
    rgbCache.set(hex, rgb);
  }
  return rgb;
}
const FRAME_MS = 1000 / 30;
let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };
/** A second colour for the scenes: a warm pink next to the theme's accent. */
const second = (colors) => (colors.dark ? '#ff8fb1' : '#d6336c');
const NOTE_GLYPHS = ['♪', '♫', '♩', '♬'];

/** A music note (head and stem) at x, y of size s. */
function noteShape(c, x, y, s, beamed = false) {
  c.beginPath();
  c.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, Math.PI * 2);
  c.fill();
  c.fillRect(x + s * 0.45, y - s * 2.2, Math.max(1, s * 0.12), s * 2.2);
  if (beamed) c.fillRect(x + s * 0.45, y - s * 2.2, s * 1.6, s * 0.3);
}

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = DEFAULT_ANIMATION, vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : DEFAULT_ANIMATION;
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.last = 0;
    this.items = [];
    this.seed();
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setKind(kind) {
    if (!ANIMATION_KINDS.includes(kind) || kind === this.kind) return;
    this.kind = kind;
    this.seed();
  }

  shuffle(random = Math.random) {
    const others = ANIMATION_KINDS.filter((kind) => kind !== this.kind);
    const next = others[Math.floor(random() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  seed() {
    const r = rand(this.kind.length * 9973 + 7);
    const count = { notes: 34, confetti: 90, stars: 120, ripples: 7, lyrics: 14 }[this.kind] ?? 0;
    this.items = Array.from({ length: count }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r() }));
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (!this.running) this.draw();
    }
  }

  start() {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  pause() { this.running = false; }
  stop() { this.wanted = false; this.running = false; }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MS - 4) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt * this.speed();
    this.draw();
  }

  draw() {
    const { context: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const colors = this.colors();
    BOOST = this.vivid ? (colors.dark ? 2.1 : 2.6) : 1;
    SIZE = this.vivid ? 1.5 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (typeof fn === 'function') fn.call(this, c, w, h, this.time, colors);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  /** Layered waveforms flowing across, like an audio editor's overview. */
  waveform(c, w, h, time, colors) {
    const mid = h / 2;
    for (let layer = 0; layer < 3; layer++) {
      c.strokeStyle = rgba(layer === 1 ? second(colors) : colors.accent, 0.16 - layer * 0.03);
      c.lineWidth = Math.max(1, w / 900) * SIZE;
      c.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const u = x / w;
        const env = 0.35 + 0.65 * Math.abs(Math.sin(u * 3 + time * 0.3 + layer));
        const y = mid + Math.sin(u * 40 + time * (1.6 + layer * 0.4)) * Math.sin(u * 7 - time * 0.7 + layer) * h * 0.22 * env;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    // A bar-style waveform underneath.
    const bars = Math.floor(w / (10 * SIZE));
    for (let i = 0; i < bars; i++) {
      const v = Math.abs(Math.sin(i * 0.37 + time * 1.3) * Math.sin(i * 0.11 - time * 0.4));
      const bh = v * h * 0.18;
      c.fillStyle = rgba(colors.text, 0.05);
      c.fillRect(i * (w / bars), h * 0.86 - bh, (w / bars) * 0.6, bh * 2);
    }
  }

  /** Equalizer bars bouncing to a beat, with falling peak markers. */
  equalizer(c, w, h, time, colors) {
    const n = 32;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const beat = Math.pow(Math.abs(Math.sin(time * 2.2 + i * 0.15)), 3);
      const v = clamp01(0.15 + 0.55 * Math.abs(Math.sin(time * (1 + hash(i) * 2) + i)) * (1 - i / n * 0.4) + beat * 0.25);
      const bh = v * h * 0.7;
      const grad = c.createLinearGradient(0, h, 0, h - bh);
      grad.addColorStop(0, rgba(colors.accent, 0.18));
      grad.addColorStop(1, rgba(second(colors), 0.2));
      c.fillStyle = grad;
      for (let y = 0; y < bh; y += 10 * SIZE) c.fillRect(i * bw + bw * 0.15, h - y - 8 * SIZE, bw * 0.7, 7 * SIZE);
      c.fillStyle = rgba(colors.text, 0.25);
      c.fillRect(i * bw + bw * 0.15, h - bh - 14 * SIZE, bw * 0.7, 2 * SIZE);
    }
  }

  /** Notes floating up and drifting, turning slowly. */
  notes(c, w, h, time, colors) {
    const size = Math.min(w, h) / 22 * SIZE;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [i, it] of this.items.entries()) {
      const y = mod(it.y * h - time * (20 + it.v * 40) * SIZE, h + size * 4) - size * 2;
      const x = it.x * w + Math.sin(time * 0.6 + i) * size * 1.5;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(time * 0.5 + i) * 0.3);
      c.fillStyle = rgba(i % 3 ? colors.accent : second(colors), 0.12 + it.z * 0.18);
      c.font = `${Math.round(size * (0.7 + it.s * 1.2))}px serif`;
      c.fillText(NOTE_GLYPHS[i % 4], 0, 0);
      c.restore();
    }
  }

  /** A staff with notes written along it, bar by bar, then wiped. */
  staff(c, w, h, time, colors) {
    const gap = Math.min(h / 30, 14) * SIZE;
    const { phase } = cycle(time, 14);
    for (let s = 0; s < 3; s++) {
      const top = h * (0.22 + s * 0.26);
      c.strokeStyle = rgba(colors.text, 0.12);
      c.lineWidth = 1;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(w * 0.06, top + k * gap); c.lineTo(w * 0.94, top + k * gap); c.stroke(); }
      const count = 24;
      const shown = Math.floor(clamp01(phase * 1.3 - s * 0.15) * count);
      c.fillStyle = rgba(s === 1 ? second(colors) : colors.accent, 0.35);
      for (let i = 0; i < shown; i++) {
        const x = w * 0.1 + (i / count) * w * 0.82;
        const step = Math.round(Math.sin(i * 0.9 + s * 2) * 4 + 4);
        noteShape(c, x, top + gap * 4 - step * (gap / 2), gap * 0.9, i % 4 === 1);
        if (i % 4 === 3) { c.fillRect(x + gap * 1.6, top, 1, gap * 4); }
      }
    }
  }

  /** A record turning under a tone arm, its grooves catching the light. */
  vinyl(c, w, h, time, colors) {
    const r = Math.min(w, h) * 0.38;
    const cx = w / 2; const cy = h / 2;
    c.fillStyle = rgba(colors.text, 0.08);
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    for (let k = 0; k < 28; k++) {
      c.strokeStyle = rgba(colors.text, 0.04 + (k % 3 === 0 ? 0.03 : 0));
      c.beginPath(); c.arc(cx, cy, r * (0.35 + k * 0.023), 0, Math.PI * 2); c.stroke();
    }
    const a = time * 1.4;
    c.strokeStyle = rgba(colors.accent, 0.25);
    c.lineWidth = r * 0.04;
    c.beginPath(); c.arc(cx, cy, r * 0.8, a, a + 0.5); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.6, a + Math.PI, a + Math.PI + 0.4); c.stroke();
    c.fillStyle = rgba(second(colors), 0.35);
    c.beginPath(); c.arc(cx, cy, r * 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = colors.bg;
    c.beginPath(); c.arc(cx, cy, r * 0.03, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba(colors.text, 0.25);
    c.lineWidth = r * 0.03;
    c.beginPath(); c.moveTo(cx + r * 1.15, cy - r * 0.9); c.lineTo(cx + r * 1.05, cy + r * 0.2); c.lineTo(cx + r * 0.62, cy + r * 0.45); c.stroke();
  }

  /** A keyboard across the bottom with keys going down as a tune plays. */
  keys(c, w, h, time, colors) {
    const white = 36;
    const kw = w / white;
    const top = h * 0.55;
    const kh = h * 0.4;
    const playing = new Set([0, 1, 2].map((k) => Math.floor(mod(time * 3 + k * 7 + Math.sin(time + k) * 5, white))));
    for (let i = 0; i < white; i++) {
      c.fillStyle = playing.has(i) ? rgba(colors.accent, 0.35) : rgba(colors.text, 0.07);
      c.fillRect(i * kw + 1, top, kw - 2, kh);
    }
    for (let i = 0; i < white; i++) {
      if ([2, 6].includes(i % 7)) continue;
      c.fillStyle = rgba(colors.text, 0.22);
      c.fillRect((i + 0.65) * kw, top, kw * 0.7, kh * 0.6);
    }
    // Notes rising from the pressed keys.
    for (const i of playing) {
      for (let k = 0; k < 6; k++) {
        const y = top - mod(time * 60 + k * 40, top);
        c.fillStyle = rgba(second(colors), 0.18 * (y / top));
        c.fillRect(i * kw + kw * 0.2, y, kw * 0.6, 18 * SIZE);
      }
    }
  }

  /** A smooth spectrum, mirrored, slowly breathing. */
  spectrum(c, w, h, time, colors) {
    for (const [k, col] of [[0, colors.accent], [1, second(colors)]]) {
      c.fillStyle = rgba(col, 0.1);
      c.beginPath();
      c.moveTo(0, h / 2);
      for (let x = 0; x <= w; x += 6) {
        const u = x / w;
        const v = Math.exp(-((u - 0.3 - k * 0.3) ** 2) * 6) * (0.5 + 0.5 * Math.sin(time * 1.5 + u * 18 + k)) + 0.1 * Math.abs(Math.sin(u * 60 + time * 3));
        c.lineTo(x, h / 2 - v * h * 0.35);
      }
      for (let x = w; x >= 0; x -= 6) {
        const u = x / w;
        const v = Math.exp(-((u - 0.3 - k * 0.3) ** 2) * 6) * (0.5 + 0.5 * Math.sin(time * 1.5 + u * 18 + k)) + 0.1 * Math.abs(Math.sin(u * 60 + time * 3));
        c.lineTo(x, h / 2 + v * h * 0.35);
      }
      c.fill();
    }
  }

  /** Rings of sound spreading from points, like drops of rhythm. */
  ripples(c, w, h, time, colors) {
    for (const [i, it] of this.items.entries()) {
      const { round, phase } = cycle(time + it.v * 6, 5 + it.s * 3);
      const x = hash(round, i) * w;
      const y = hash(i, round) * h;
      for (let k = 0; k < 3; k++) {
        const p = clamp01(phase - k * 0.12);
        if (!p) continue;
        c.strokeStyle = rgba(i % 2 ? colors.accent : second(colors), 0.3 * (1 - p));
        c.lineWidth = 2 * SIZE;
        c.beginPath(); c.arc(x, y, p * Math.min(w, h) * 0.3, 0, Math.PI * 2); c.stroke();
      }
    }
  }

  /** Six strings vibrating when they are plucked. */
  strings(c, w, h, time, colors) {
    for (let s = 0; s < 6; s++) {
      const y = h * (0.25 + s * 0.1);
      const { phase } = cycle(time + s * 0.37, 2.6);
      const amp = Math.exp(-phase * 4) * h * 0.04;
      c.strokeStyle = rgba(s % 2 ? colors.accent : colors.text, 0.18 + (1 - phase) * 0.15);
      c.lineWidth = (1 + (5 - s) * 0.4) * SIZE;
      c.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const u = x / w;
        const yy = y + Math.sin(u * Math.PI) * Math.sin(time * 40 + s) * amp;
        if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
  }

  /** A metronome swinging, with the beat flashing. */
  metronome(c, w, h, time, colors) {
    const cx = w / 2; const base = h * 0.82; const size = Math.min(w, h) * 0.55;
    c.fillStyle = rgba(colors.text, 0.08);
    c.beginPath(); c.moveTo(cx - size * 0.3, base); c.lineTo(cx + size * 0.3, base); c.lineTo(cx + size * 0.12, base - size); c.lineTo(cx - size * 0.12, base - size); c.closePath(); c.fill();
    const a = Math.sin(time * Math.PI * 1.6) * 0.5;
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.lineWidth = 4 * SIZE;
    c.beginPath(); c.moveTo(cx, base - size * 0.1); c.lineTo(cx + Math.sin(a) * size * 0.85, base - size * 0.1 - Math.cos(a) * size * 0.85); c.stroke();
    const beat = Math.abs(Math.cos(time * Math.PI * 1.6));
    c.fillStyle = rgba(second(colors), 0.2 * Math.pow(beat, 6));
    c.beginPath(); c.arc(cx, base - size * 0.5, size * 0.9, 0, Math.PI * 2); c.fill();
  }

  /** A step sequencer grid with a playhead running across it. */
  sequencer(c, w, h, time, colors) {
    const cols = 16; const rows = 8;
    const cell = Math.min(w / (cols + 2), h / (rows + 2));
    const ox = (w - cell * cols) / 2; const oy = (h - cell * rows) / 2;
    const head = Math.floor(mod(time * 4, cols));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const on = hash(r, k, Math.floor(time / 8)) > 0.72;
      c.fillStyle = on ? rgba(k === head ? second(colors) : colors.accent, k === head ? 0.55 : 0.25) : rgba(colors.text, k === head ? 0.08 : 0.04);
      c.fillRect(ox + k * cell + 3, oy + r * cell + 3, cell - 6, cell - 6);
    }
  }

  /** An oscilloscope trace on a grid. */
  oscilloscope(c, w, h, time, colors) {
    c.strokeStyle = rgba(colors.text, 0.05);
    c.lineWidth = 1;
    for (let x = 0; x < w; x += w / 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += h / 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.lineWidth = 2 * SIZE;
    c.shadowBlur = 8; c.shadowColor = rgba(colors.accent, 0.4);
    c.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const u = x / w;
      const y = h / 2 + (Math.sin(u * 14 + time * 4) * 0.6 + Math.sin(u * 37 - time * 2) * 0.25) * h * 0.25;
      if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  /** Two speakers pulsing on the beat. */
  speakers(c, w, h, time, colors) {
    const beat = Math.pow(Math.abs(Math.sin(time * Math.PI)), 8);
    for (const [k, cx] of [[0, w * 0.3], [1, w * 0.7]]) {
      const r = Math.min(w, h) * 0.18 * (1 + beat * 0.06);
      c.fillStyle = rgba(colors.text, 0.06);
      c.fillRect(cx - r * 1.4, h * 0.5 - r * 2.2, r * 2.8, r * 4.2);
      c.strokeStyle = rgba(k ? second(colors) : colors.accent, 0.35);
      c.lineWidth = 3 * SIZE;
      c.beginPath(); c.arc(cx, h * 0.5 + r * 0.7, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, h * 0.5 + r * 0.7, r * 0.4, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, h * 0.5 - r * 1.2, r * 0.35, 0, Math.PI * 2); c.stroke();
      for (let k2 = 1; k2 <= 3; k2++) { c.strokeStyle = rgba(colors.accent, 0.12 * beat / k2); c.beginPath(); c.arc(cx, h * 0.5 + r * 0.7, r * (1 + k2 * 0.4), 0, Math.PI * 2); c.stroke(); }
    }
  }

  /** A cassette with its reels turning. */
  cassette(c, w, h, time, colors) {
    const cw = Math.min(w * 0.6, h * 0.9); const ch = cw * 0.62;
    const x = (w - cw) / 2; const y = (h - ch) / 2;
    c.fillStyle = rgba(colors.text, 0.07);
    c.fillRect(x, y, cw, ch);
    c.fillStyle = rgba(colors.accent, 0.14);
    c.fillRect(x + cw * 0.08, y + ch * 0.1, cw * 0.84, ch * 0.22);
    for (const [k, rx] of [[0, x + cw * 0.3], [1, x + cw * 0.7]]) {
      const ry = y + ch * 0.55; const r = ch * 0.17;
      c.strokeStyle = rgba(colors.text, 0.25);
      c.lineWidth = 2 * SIZE;
      c.beginPath(); c.arc(rx, ry, r, 0, Math.PI * 2); c.stroke();
      for (let s = 0; s < 6; s++) { const a = time * (k ? 2.4 : 2) + (s * Math.PI) / 3; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + Math.cos(a) * r, ry + Math.sin(a) * r); c.stroke(); }
    }
    c.strokeStyle = rgba(second(colors), 0.25);
    c.beginPath(); c.moveTo(x + cw * 0.3, y + ch * 0.72); c.lineTo(x + cw * 0.7, y + ch * 0.72); c.stroke();
  }

  /** Confetti bursting on every bar. */
  confetti(c, w, h, time, colors) {
    const { phase } = cycle(time, 2.4);
    for (const [i, it] of this.items.entries()) {
      const a = it.x * Math.PI * 2;
      const d = phase * (0.2 + it.v * 0.45) * Math.min(w, h);
      const x = w / 2 + Math.cos(a) * d;
      const y = h / 2 + Math.sin(a) * d + phase * phase * h * 0.3;
      c.save(); c.translate(x, y); c.rotate(time * 3 + i);
      c.fillStyle = rgba([colors.accent, second(colors), colors.text][i % 3], 0.4 * (1 - phase));
      c.fillRect(-4 * SIZE, -2 * SIZE, 8 * SIZE, 4 * SIZE);
      c.restore();
    }
  }

  /** Lyric lines scrolling up like karaoke, the current one lit. */
  lyrics(c, w, h, time, colors) {
    const lineH = Math.min(h / 9, 46) * SIZE;
    const offset = mod(time * 18, lineH);
    const index = Math.floor(time * 18 / lineH);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = -1; k < h / lineH + 1; k++) {
      const y = k * lineH - offset;
      const n = index + k;
      const it = this.items[mod(n, this.items.length)];
      const width = w * (0.3 + it.s * 0.4);
      const centre = Math.abs(y - h / 2) < lineH / 2;
      c.fillStyle = rgba(centre ? colors.accent : colors.text, centre ? 0.35 : 0.06);
      const words = 3 + Math.floor(it.v * 4);
      let x = w / 2 - width / 2;
      for (let q = 0; q < words; q++) { const ww = width / words - 10; c.fillRect(x, y - lineH * 0.15, ww, lineH * 0.3); x += ww + 10; }
    }
  }

  /** The circle of fifths, a pointer stepping round it. */
  circle(c, w, h, time, colors) {
    const names = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
    const r = Math.min(w, h) * 0.36;
    const cx = w / 2; const cy = h / 2;
    const at = Math.floor(mod(time * 0.8, 12));
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${Math.round(r * 0.14)}px system-ui, sans-serif`;
    names.forEach((name, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      c.fillStyle = rgba(i === at ? second(colors) : colors.text, i === at ? 0.6 : 0.18);
      c.fillText(name, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    });
    c.strokeStyle = rgba(colors.accent, 0.15);
    c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, r * 0.75, 0, Math.PI * 2); c.stroke();
    const a = (at / 12) * Math.PI * 2 - Math.PI / 2;
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.lineWidth = 3 * SIZE;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72); c.stroke();
  }

  /** Mixer faders gliding up and down. */
  mixer(c, w, h, time, colors) {
    const n = 12;
    const gap = w / (n + 1);
    for (let i = 1; i <= n; i++) {
      const x = i * gap;
      c.fillStyle = rgba(colors.text, 0.08);
      c.fillRect(x - 2, h * 0.2, 4, h * 0.6);
      const v = 0.5 + 0.4 * Math.sin(time * (0.5 + hash(i) * 0.8) + i);
      const y = h * 0.8 - v * h * 0.6;
      c.fillStyle = rgba(i % 4 ? colors.accent : second(colors), 0.35);
      c.fillRect(x - gap * 0.22, y - 8 * SIZE, gap * 0.44, 16 * SIZE);
      const level = clamp01(v + 0.2 * Math.sin(time * 8 + i));
      c.fillStyle = rgba(colors.accent, 0.15);
      c.fillRect(x + gap * 0.3, h * 0.8 - level * h * 0.6, 4, level * h * 0.6);
    }
  }

  /** Soft bands of colour moving like an aurora (or a long chord). */
  aurora(c, w, h, time, colors) {
    for (let k = 0; k < 4; k++) {
      const grad = c.createLinearGradient(0, 0, 0, h);
      const col = k % 2 ? second(colors) : colors.accent;
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.5, rgba(col, 0.08));
      grad.addColorStop(1, rgba(col, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 10) { const u = x / w; c.lineTo(x, h * (0.35 + k * 0.08) + Math.sin(u * 5 + time * (0.3 + k * 0.1) + k) * h * 0.12); }
      c.lineTo(w, h);
      c.fill();
    }
  }

  /** A night of small notes and stars twinkling to a slow pulse. */
  stars(c, w, h, time, colors) {
    for (const [i, it] of this.items.entries()) {
      const tw = 0.5 + 0.5 * Math.sin(time * (1 + it.v * 2) + i);
      c.fillStyle = rgba(i % 9 === 0 ? second(colors) : i % 3 === 0 ? colors.accent : colors.text, 0.06 + tw * 0.2);
      const x = mod(it.x * w + time * 4 * it.z, w);
      const y = it.y * h;
      const s = (1 + it.s * 2.4) * SIZE;
      if (i % 11 === 0) { c.font = `${Math.round(s * 7)}px serif`; c.fillText('♪', x, y); }
      else { c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill(); }
    }
  }
}
