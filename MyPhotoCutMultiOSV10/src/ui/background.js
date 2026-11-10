// Moving backgrounds for the start page and (faintly) behind the views, drawn for a caricature
// studio (the list is ANIMATIONS in settings): floating cartoon faces, photo prints, brush
// strokes, pencil hatching, a halftone wave, pop-art tiles, speech bubbles, sparkles, ink drops,
// paint palettes, film strips, a magnifying lens bending a grid (the exaggeration), crayon
// scribbles, paint confetti, sticker emoji and pixels. Colours follow the theme plus a cheerful
// paint palette. The animation pauses while the window is hidden; `frames` counts drawn frames.
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

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
/** 30 frames a second: the backgrounds drift slowly. */
const FRAME_MS = 1000 / 30;
/** Paint colours shared by every background (the theme's accent joins them). */
const PAINT = ['#ff5d8f', '#ffb347', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#00c2d1'];

let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };
const wrap = (v) => ((v % 1) + 1) % 1;

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = ANIMATION_KINDS[0], vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : ANIMATION_KINDS[0];
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

  /** A different animation, chosen at random. */
  shuffle(random = Math.random) {
    const others = ANIMATION_KINDS.filter((kind) => kind !== this.kind);
    const next = others[Math.floor(random() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  seed() {
    const r = rand(this.kind.length * 9973 + 7);
    const count = {
      faces: 16, polaroids: 12, brushes: 9, pencil: 60, halftone: 0, popart: 0, bubbles: 14, sparkles: 70, inkdrops: 10,
      palettes: 8, film: 3, lens: 3, crayons: 12, confetti: 90, stickers: 22, pixels: 0,
    }[this.kind] ?? 0;
    this.items = Array.from({ length: count }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r(), c: Math.floor(r() * PAINT.length) }));
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

  stop() {
    this.wanted = false;
    this.running = false;
  }

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
    BOOST = this.vivid ? (colors.dark ? 2 : 2.4) : 1;
    SIZE = this.vivid ? 1.4 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** A simple cartoon face: a big head, dot eyes, a grin. `big` swells the head (the caricature). */
  face(c, x, y, r, color, ink, alpha, mood = 0) {
    c.fillStyle = rgba(color, alpha);
    c.strokeStyle = rgba(ink, alpha * 1.2);
    c.lineWidth = Math.max(1, r * 0.08);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = rgba(ink, alpha * 1.4);
    const eye = r * (0.16 + 0.06 * mood);
    c.beginPath(); c.arc(x - r * 0.35, y - r * 0.12, eye, 0, Math.PI * 2); c.arc(x + r * 0.35, y - r * 0.12, eye, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x, y + r * 0.12, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  }

  faces(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const r = unit * (0.035 + p.s * 0.05) * SIZE * (1 + 0.25 * Math.sin(time * 0.8 + p.h * 9));
      const x = wrap(p.x + Math.sin(time * 0.1 + p.v * 6) * 0.04) * w;
      const y = (1 - wrap(p.y + time * 0.012 * (0.4 + p.z))) * (h + r * 4) - r * 2;
      this.face(c, x, y, r, PAINT[p.c], colors.text, 0.1 + p.z * 0.1, p.v);
    }
  }

  polaroids(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const s = unit * (0.08 + p.s * 0.08) * SIZE;
      const x = wrap(p.x + time * 0.008 * (0.3 + p.v)) * (w + s * 2) - s;
      const y = wrap(p.y + Math.sin(time * 0.2 + p.h * 7) * 0.03) * h;
      c.save();
      c.translate(x, y);
      c.rotate(Math.sin(time * 0.15 + p.h * 9) * 0.35);
      c.fillStyle = rgba('#ffffff', colors.dark ? 0.1 : 0.32);
      c.strokeStyle = rgba(colors.text, 0.08);
      c.fillRect(-s / 2, -s * 0.6, s, s * 1.2);
      c.strokeRect(-s / 2, -s * 0.6, s, s * 1.2);
      c.fillStyle = rgba(PAINT[p.c], 0.14);
      c.fillRect(-s * 0.42, -s * 0.52, s * 0.84, s * 0.84);
      this.face(c, 0, -s * 0.12, s * 0.22, '#ffd2b0', colors.text, 0.16);
      c.restore();
    }
  }

  brushes(c, w, h, time, colors) {
    c.lineCap = 'round';
    for (const p of this.items) {
      const phase = wrap(time * 0.05 * (0.5 + p.v) + p.h);
      const len = Math.min(1, phase * 1.6);
      const fade = phase > 0.75 ? (1 - phase) / 0.25 : 1;
      const y0 = p.y * h;
      c.strokeStyle = rgba(PAINT[p.c], 0.12 * fade);
      c.lineWidth = Math.min(w, h) * (0.03 + p.s * 0.05) * SIZE;
      c.beginPath();
      const steps = 30;
      for (let i = 0; i <= steps * len; i++) {
        const t = i / steps;
        const x = (p.x - 0.3 + t * 0.9) * w;
        const y = y0 + Math.sin(t * 5 + p.z * 6) * h * 0.06;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  pencil(c, w, h, time, colors) {
    c.lineCap = 'round';
    c.lineWidth = Math.max(1, Math.min(w, h) / 500) * SIZE;
    for (const p of this.items) {
      const phase = wrap(time * 0.08 * (0.5 + p.v) + p.h);
      const alpha = Math.sin(phase * Math.PI) * 0.22;
      const x = p.x * w;
      const y = p.y * h;
      const len = Math.min(w, h) * (0.05 + p.s * 0.08);
      c.strokeStyle = rgba(colors.text, alpha);
      for (let k = 0; k < 5; k++) {
        const o = k * len * 0.16;
        c.beginPath();
        c.moveTo(x + o, y);
        c.lineTo(x + o + len * 0.6, y - len * Math.min(1, phase * 2));
        c.stroke();
      }
    }
  }

  halftone(c, w, h, time, colors) {
    const cell = Math.max(14, Math.min(w, h) / 34) * SIZE;
    for (let y = cell / 2; y < h; y += cell) {
      for (let x = cell / 2; x < w; x += cell) {
        const v = 0.5 + 0.5 * Math.sin(x / w * 6 + time * 0.6) * Math.cos(y / h * 5 - time * 0.45);
        const r = cell * 0.45 * v;
        if (r < 0.6) continue;
        c.fillStyle = rgba(x / w + y / h > 1 ? colors.accent : PAINT[0], 0.1 + v * 0.06);
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
    }
  }

  popart(c, w, h, time, colors) {
    const cols = 4;
    const rows = 3;
    const tw = w / cols;
    const th = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const k = Math.floor(time * 0.25 + i * 1.3 + j * 2.1) % PAINT.length;
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.7 + i + j * 2);
        c.fillStyle = rgba(PAINT[k], 0.05 + pulse * 0.05);
        c.fillRect(i * tw + 4, j * th + 4, tw - 8, th - 8);
        this.face(c, i * tw + tw / 2, j * th + th / 2, Math.min(tw, th) * (0.22 + pulse * 0.06) * SIZE, PAINT[(k + 3) % PAINT.length], colors.text, 0.09);
      }
    }
  }

  bubbles(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const bw = unit * (0.08 + p.s * 0.08) * SIZE;
      const bh = bw * 0.6;
      const x = wrap(p.x + Math.sin(time * 0.12 + p.h * 8) * 0.03) * w;
      const y = (1 - wrap(p.y + time * 0.015 * (0.4 + p.v))) * (h + bh * 3) - bh;
      const a = 0.1 + p.z * 0.08;
      c.fillStyle = rgba(colors.dark ? '#ffffff' : '#ffffff', a * 1.6);
      c.strokeStyle = rgba(PAINT[p.c], a * 2);
      c.lineWidth = Math.max(1, bw * 0.04);
      c.beginPath();
      c.ellipse(x, y, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      c.moveTo(x - bw * 0.1, y + bh * 0.45);
      c.lineTo(x - bw * 0.28, y + bh * 0.85);
      c.lineTo(x + bw * 0.05, y + bh * 0.48);
      c.fill(); c.stroke();
      c.fillStyle = rgba(PAINT[p.c], a * 2.2);
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.arc(x + k * bw * 0.16, y, bw * 0.045 * (1 + 0.4 * Math.sin(time * 3 + k + p.h * 9)), 0, Math.PI * 2); c.fill(); }
    }
  }

  sparkles(c, w, h, time, colors) {
    for (const p of this.items) {
      const tw = Math.max(0, Math.sin(time * (0.8 + p.v * 1.5) + p.h * 20));
      const r = Math.min(w, h) * (0.006 + p.s * 0.016) * SIZE * (0.4 + tw);
      const x = p.x * w;
      const y = p.y * h;
      c.fillStyle = rgba(p.c % 2 ? colors.accent : PAINT[2], 0.12 + tw * 0.22);
      c.beginPath();
      c.moveTo(x, y - r * 2); c.quadraticCurveTo(x, y, x + r * 2, y); c.quadraticCurveTo(x, y, x, y + r * 2); c.quadraticCurveTo(x, y, x - r * 2, y); c.quadraticCurveTo(x, y, x, y - r * 2);
      c.fill();
    }
  }

  inkdrops(c, w, h, time, colors) {
    for (const p of this.items) {
      const phase = wrap(time * 0.06 * (0.5 + p.v) + p.h);
      const r = Math.min(w, h) * (0.05 + p.s * 0.18) * phase * SIZE;
      const g = c.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, Math.max(1, r));
      const a = 0.16 * (1 - phase);
      g.addColorStop(0, rgba(PAINT[p.c], a));
      g.addColorStop(0.75, rgba(PAINT[p.c], a * 0.8));
      g.addColorStop(1, rgba(PAINT[p.c], 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(p.x * w, p.y * h, Math.max(1, r), 0, Math.PI * 2); c.fill();
    }
  }

  palettes(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const s = unit * (0.07 + p.s * 0.06) * SIZE;
      const x = wrap(p.x + time * 0.01 * (p.v - 0.5)) * w;
      const y = wrap(p.y + Math.sin(time * 0.2 + p.h * 5) * 0.03) * h;
      c.save();
      c.translate(x, y);
      c.rotate(time * 0.1 * (p.v - 0.5) + p.h * 6);
      c.fillStyle = rgba(colors.dark ? '#d9b38c' : '#c49a6c', 0.12);
      c.beginPath(); c.ellipse(0, 0, s, s * 0.75, 0, 0, Math.PI * 2); c.fill();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 1.4 - 0.6;
        c.fillStyle = rgba(PAINT[(p.c + k) % PAINT.length], 0.2);
        c.beginPath(); c.arc(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.45, s * 0.14, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  }

  film(c, w, h, time, colors) {
    const band = Math.min(h / 5, 160 * SIZE);
    this.items.forEach((p, i) => {
      const y = h * (0.2 + i * 0.3);
      const dir = i % 2 ? -1 : 1;
      const frameW = band * 1.1;
      const shift = (time * 30 * dir * (0.6 + p.v)) % frameW;
      c.fillStyle = rgba(colors.text, 0.08);
      c.fillRect(0, y - band / 2, w, band);
      for (let x = -frameW + shift; x < w + frameW; x += frameW) {
        c.fillStyle = rgba(colors.bg, 0.6);
        for (let k = 0; k < 4; k++) { c.fillRect(x + k * frameW / 4 + 4, y - band / 2 + 4, frameW / 8, band * 0.08); c.fillRect(x + k * frameW / 4 + 4, y + band / 2 - 4 - band * 0.08, frameW / 8, band * 0.08); }
        c.fillStyle = rgba(PAINT[Math.abs(Math.round(x / frameW) + i) % PAINT.length], 0.1);
        c.fillRect(x + 6, y - band * 0.32, frameW - 12, band * 0.64);
        this.face(c, x + frameW / 2, y, band * 0.2, '#ffd2b0', colors.text, 0.12);
      }
    });
  }

  lens(c, w, h, time, colors) {
    // A grid bent by moving magnifying lenses: the caricature's exaggeration.
    const lenses = this.items.map((p, i) => ({ x: (0.5 + 0.38 * Math.sin(time * 0.17 + i * 2.1)) * w, y: (0.5 + 0.35 * Math.cos(time * 0.13 + i * 1.7)) * h, r: Math.min(w, h) * (0.16 + 0.05 * Math.sin(time * 0.5 + i)) }));
    const bend = (x, y) => {
      let px = x;
      let py = y;
      for (const l of lenses) {
        const dx = px - l.x;
        const dy = py - l.y;
        const d = Math.hypot(dx, dy);
        if (d < l.r) { const k = 1 + 0.6 * (1 - (d / l.r) ** 2); px = l.x + dx * k; py = l.y + dy * k; }
      }
      return [px, py];
    };
    const step = Math.max(28, Math.min(w, h) / 18);
    c.lineWidth = Math.max(1, Math.min(w, h) / 700) * SIZE;
    c.strokeStyle = rgba(colors.accent, 0.14);
    for (let x = 0; x <= w; x += step) { c.beginPath(); for (let y = 0; y <= h; y += step / 3) { const [a, b] = bend(x, y); if (y === 0) c.moveTo(a, b); else c.lineTo(a, b); } c.stroke(); }
    for (let y = 0; y <= h; y += step) { c.beginPath(); for (let x = 0; x <= w; x += step / 3) { const [a, b] = bend(x, y); if (x === 0) c.moveTo(a, b); else c.lineTo(a, b); } c.stroke(); }
    for (const l of lenses) {
      c.strokeStyle = rgba(colors.text, 0.1);
      c.lineWidth = Math.max(2, l.r * 0.04);
      c.beginPath(); c.arc(l.x, l.y, l.r, 0, Math.PI * 2); c.stroke();
    }
  }

  crayons(c, w, h, time, colors) {
    c.lineCap = 'round';
    for (const p of this.items) {
      c.strokeStyle = rgba(PAINT[p.c], 0.12);
      c.lineWidth = Math.min(w, h) * (0.006 + p.s * 0.01) * SIZE;
      c.beginPath();
      const cx = p.x * w;
      const cy = p.y * h;
      const r = Math.min(w, h) * (0.05 + p.z * 0.1);
      for (let t = 0; t < Math.PI * 6; t += 0.12) {
        const rr = r * (0.6 + 0.4 * Math.sin(t * 1.7 + time * 0.8 + p.h * 6));
        const x = cx + Math.cos(t + time * 0.3 * (p.v - 0.5)) * rr + t * r * 0.05;
        const y = cy + Math.sin(t * 1.1) * rr * 0.6;
        if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  confetti(c, w, h, time, colors) {
    for (const p of this.items) {
      const x = wrap(p.x + Math.sin(time * 0.4 + p.h * 10) * 0.02) * w;
      const y = wrap(p.y + time * 0.03 * (0.4 + p.v)) * h;
      const s = Math.min(w, h) * (0.006 + p.s * 0.012) * SIZE;
      c.save();
      c.translate(x, y);
      c.rotate(time * (1 + p.v * 2) + p.h * 6);
      c.fillStyle = rgba(PAINT[p.c], 0.24);
      if (p.z > 0.5) c.fillRect(-s, -s * 0.5, s * 2, s); else { c.beginPath(); c.arc(0, 0, s * 0.8, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
  }

  stickers(c, w, h, time, colors) {
    const glyphs = ['😀', '😎', '🤪', '😜', '🥸', '🤩', '❤️', '⭐', '✨', '🎨', '📸', '🖌️'];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.items) {
      const size = Math.min(w, h) * (0.03 + p.s * 0.05) * SIZE;
      const x = wrap(p.x + time * 0.006 * (p.v - 0.5)) * w;
      const y = (1 - wrap(p.y + time * 0.01 * (0.3 + p.z))) * (h + size * 2) - size;
      c.save();
      c.globalAlpha = Math.min(1, (0.14 + p.z * 0.12) * BOOST * 0.8);
      c.translate(x, y);
      c.rotate(Math.sin(time * 0.6 + p.h * 9) * 0.3);
      c.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      c.fillText(glyphs[Math.floor(p.h * glyphs.length)], 0, 0);
      c.restore();
    }
  }

  pixels(c, w, h, time, colors) {
    const cell = Math.max(16, Math.min(w, h) / 22) * SIZE;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        const r = n - Math.floor(n);
        const on = Math.sin(time * 0.5 + r * 12 + i * 0.2) > 0.55;
        if (!on) continue;
        c.fillStyle = rgba(PAINT[Math.floor(r * PAINT.length)], 0.1);
        c.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
      }
    }
  }
}
