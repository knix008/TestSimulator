// Moving backgrounds for the start page: sixteen scenes from the world of broadcasting — an ON AIR sign,
// radio waves, an equalizer, stage lights, a film strip, a tower, a video wall, scan lines, colour bars,
// chat, a camera lens, a waveform, stars, live dots, TV static and neon frames (the list is ANIMATIONS in
// settings). Colours follow the theme. The animation pauses while the window is hidden; `frames` counts
// drawn frames (tests use it).
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

/** A repeatable 0–1 number for a cell, a round, … */
const hash = (a, b = 0, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mod = (v, m) => ((v % m) + m) % m;
/** Where a repeating scene is: which round, and how far through it (0–1). */
const cycle = (time, period) => { const t = time / period; return { round: Math.floor(t), phase: t - Math.floor(t) }; };
/** Fades a repeating scene in at the start of its round and out at the end. */
const fadeInOut = (phase, out = 0.1, inn = 0.04) => Math.min(clamp01(phase / inn), clamp01((1 - phase) / out));

// Parsed once per colour: the animations ask for rgba() hundreds of times a frame.
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
/** The backgrounds drift slowly: 30 frames a second look the same as the screen's 60–144 and cost a fraction. */
const FRAME_MS = 1000 / 30;

/**
 * How strongly the current background is drawn: the start page shows it vividly (more opaque
 * colours, bigger dots — light themes need more than dark ones), the faint layer behind the
 * views as designed. Set for each frame by draw().
 */
let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };

function roundRectPath(c, x, y, w, h, r) {
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}


/** Ink colours for lines of "text" and marks (soft, readable in light and dark themes). */
const INKS = ['#3a86ff', '#8338ec', '#ff006e', '#fb5607', '#2ec4b6', '#8ac926', '#f2c94c', '#56ccf2'];
const ink = (i, colors) => (i % 4 === 0 ? colors.accent : INKS[i % INKS.length]);
const font = (c, px, weight = 600, family = 'sans-serif') => { c.font = `${weight} ${Math.round(px)}px ${family}`; };

const SCENES = {
  /** An ON AIR sign that lights up, glows and blinks, over a dim studio wall. */
  onAir(c, w, h, time, colors) {
    const bw = Math.min(w * 0.42, h * 0.5); const bh = bw * 0.36;
    const x = (w - bw) / 2; const y = h * 0.42 - bh / 2;
    const on = (Math.sin(time * 1.4) > -0.6 ? 1 : 0.25) * (0.75 + 0.25 * Math.sin(time * 9) ** 2);
    const g = c.createRadialGradient(w / 2, y + bh / 2, bh * 0.2, w / 2, y + bh / 2, bw);
    g.addColorStop(0, rgba('#ff3b3b', 0.22 * on)); g.addColorStop(1, rgba('#ff3b3b', 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.beginPath(); roundRectPath(c, x, y, bw, bh, bh * 0.18); c.fillStyle = rgba('#2a0b0b', 0.25); c.fill();
    c.lineWidth = 3 * SIZE; c.strokeStyle = rgba('#ff5a5a', 0.55 * on); c.stroke();
    font(c, bh * 0.52, 800); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = rgba('#ff6b6b', 0.75 * on); c.fillText('ON AIR', w / 2, y + bh / 2);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    for (let i = 0; i < 18; i++) { const px = hash(i, 3) * w; const py = h * 0.75 + hash(i, 4) * h * 0.2; c.fillStyle = rgba(colors.text, 0.05 + 0.04 * Math.sin(time + i)); c.fillRect(px, py, 2 * SIZE, 2 * SIZE); }
  },
  /** Radio waves leaving an antenna in rings. */
  signalWaves(c, w, h, time, colors) {
    const cx = w * 0.5; const cy = h * 0.62;
    c.lineWidth = 2.5 * SIZE;
    for (let i = 0; i < 9; i++) {
      const r = mod(time * 0.18 + i / 9, 1);
      c.strokeStyle = rgba(ink(i, colors), 0.32 * (1 - r));
      c.beginPath(); c.arc(cx, cy, r * Math.max(w, h) * 0.7, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
    c.strokeStyle = rgba(colors.text, 0.25); c.lineWidth = 4 * SIZE;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - h * 0.06, cy + h * 0.2); c.moveTo(cx, cy); c.lineTo(cx + h * 0.06, cy + h * 0.2); c.stroke();
    c.fillStyle = rgba(colors.accent, 0.6); c.beginPath(); c.arc(cx, cy, 6 * SIZE, 0, Math.PI * 2); c.fill();
  },
  /** An audio equalizer: bars rising and falling, peaks hanging above them. */
  equalizer(c, w, h, time, colors) {
    const n = 32; const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = clamp01(0.25 + 0.35 * Math.sin(time * 2.1 + i * 0.5) * Math.sin(time * 0.7 + i * 0.13) + 0.3 * hash(Math.floor(time * 8), i));
      const bh = v * h * 0.6;
      const g = c.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, rgba('#21c35a', 0.32)); g.addColorStop(0.7, rgba('#f2c94c', 0.32)); g.addColorStop(1, rgba('#ff3b3b', 0.34));
      c.fillStyle = g; c.fillRect(i * bw + bw * 0.15, h - bh, bw * 0.7, bh);
      c.fillStyle = rgba(colors.text, 0.3); c.fillRect(i * bw + bw * 0.15, h - bh - 8 * SIZE, bw * 0.7, 3 * SIZE);
    }
  },
  /** Stage lights sweeping beams across the room. */
  studioLights(c, w, h, time, colors) {
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.1 + i * 0.2); const a = Math.sin(time * 0.5 + i * 1.3) * 0.5;
      const len = h * 1.2; const spread = 0.16;
      const g = c.createLinearGradient(x, 0, x + Math.sin(a) * len, Math.cos(a) * len);
      g.addColorStop(0, rgba(ink(i + 1, colors), 0.28)); g.addColorStop(1, rgba(ink(i + 1, colors), 0));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x, -4); c.lineTo(x + Math.sin(a - spread) * len, Math.cos(a - spread) * len); c.lineTo(x + Math.sin(a + spread) * len, Math.cos(a + spread) * len); c.closePath(); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },
  /** A film strip running across with frames that light in turn. */
  filmStrip(c, w, h, time, colors) {
    const fh = h * 0.3; const y = (h - fh) / 2; const fw = fh * 1.3; const off = mod(time * 60 * SIZE, fw);
    c.fillStyle = rgba(colors.text, 0.08); c.fillRect(0, y - fh * 0.12, w, fh * 1.24);
    for (let x = -fw + off, i = 0; x < w + fw; x += fw, i++) {
      c.fillStyle = rgba(ink(i + Math.floor(time * 60 * SIZE / fw), colors), 0.18); c.fillRect(x + fw * 0.06, y + fh * 0.06, fw * 0.88, fh * 0.88);
      for (let k = 0; k < 4; k++) { c.fillStyle = rgba(colors.bg, 0.9); c.fillRect(x + k * fw / 4 + fw * 0.08, y - fh * 0.09, fw * 0.1, fh * 0.06); c.fillRect(x + k * fw / 4 + fw * 0.08, y + fh * 1.03, fw * 0.1, fh * 0.06); }
    }
  },
  /** A broadcast tower with a blinking light and signals. */
  broadcastTower(c, w, h, time, colors) {
    const cx = w * 0.3; const top = h * 0.2; const base = h * 0.95; const half = h * 0.12;
    c.strokeStyle = rgba(colors.text, 0.24); c.lineWidth = 3 * SIZE;
    c.beginPath(); c.moveTo(cx - half, base); c.lineTo(cx, top); c.lineTo(cx + half, base);
    for (let k = 1; k < 7; k++) { const yy = top + (base - top) * (k / 7); const hw = half * (k / 7); c.moveTo(cx - hw, yy); c.lineTo(cx + hw, yy); }
    c.stroke();
    c.fillStyle = rgba('#ff3b3b', Math.sin(time * 4) > 0 ? 0.8 : 0.15); c.beginPath(); c.arc(cx, top - 6 * SIZE, 7 * SIZE, 0, Math.PI * 2); c.fill();
    c.lineWidth = 2 * SIZE;
    for (let i = 0; i < 7; i++) { const r = mod(time * 0.25 + i / 7, 1); c.strokeStyle = rgba(colors.accent, 0.35 * (1 - r)); c.beginPath(); c.arc(cx, top, r * w * 0.8, -Math.PI * 0.35, Math.PI * 0.15); c.stroke(); }
  },
  /** A grid of pixels changing colour like a video wall. */
  pixelGrid(c, w, h, time, colors) {
    const s = Math.max(18, Math.min(w, h) / 14);
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const v = hash(Math.floor(x / s), Math.floor(y / s), Math.floor(time * 1.5 + hash(x, y) * 4));
      c.fillStyle = rgba(ink(Math.floor(v * 8), colors), 0.06 + v * 0.14);
      c.fillRect(x + 2, y + 2, s - 4, s - 4);
    }
  },
  /** CRT scan lines rolling over a soft glow. */
  scanLines(c, w, h, time, colors) {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    g.addColorStop(0, rgba(colors.accent, 0.16)); g.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = rgba(colors.text, 0.05);
    for (let y = mod(time * 30, 6 * SIZE); y < h; y += 6 * SIZE) c.fillRect(0, y, w, 2 * SIZE);
    const band = mod(time * 0.25, 1.4) - 0.2;
    c.fillStyle = rgba(colors.text, 0.06); c.fillRect(0, band * h, w, h * 0.08);
  },
  /** Colour bars of a test signal, sliding slowly. */
  colorBars(c, w, h, time, colors) {
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    const bw = w / 7; const off = mod(time * 20, bw);
    for (let i = -1; i < 8; i++) { c.fillStyle = rgba(bars[mod(i + Math.floor(time * 20 / bw), 7)], 0.2); c.fillRect(i * bw + off, h * 0.2, bw + 1, h * 0.5); }
    c.fillStyle = rgba(colors.text, 0.1); c.fillRect(0, h * 0.72, w, h * 0.05);
  },
  /** Chat messages floating up beside a stream. */
  chatBubbles(c, w, h, time, colors) {
    for (let i = 0; i < 14; i++) {
      const p = mod(time * 0.06 + hash(i, 1), 1);
      const x = w * (0.55 + hash(i, 2) * 0.38); const y = h * (1.05 - p * 1.1);
      const bw = w * (0.12 + hash(i, 3) * 0.16); const bh = h * 0.05;
      c.beginPath(); roundRectPath(c, x - bw / 2, y, bw, bh, bh / 2); c.fillStyle = rgba(ink(i, colors), 0.16 * fadeInOut(p, 0.2, 0.1)); c.fill();
      c.fillStyle = rgba(colors.text, 0.2 * fadeInOut(p, 0.2, 0.1)); c.fillRect(x - bw / 2 + bh * 0.5, y + bh * 0.42, bw * 0.6, bh * 0.16);
    }
    c.beginPath(); roundRectPath(c, w * 0.06, h * 0.18, w * 0.44, h * 0.6, 12 * SIZE); c.strokeStyle = rgba(colors.text, 0.15); c.lineWidth = 2 * SIZE; c.stroke();
    c.fillStyle = rgba('#ff3b3b', 0.5); c.beginPath(); c.arc(w * 0.09, h * 0.22, 6 * SIZE, 0, Math.PI * 2); c.fill();
  },
  /** A camera lens: rings focusing and an iris opening. */
  cameraLens(c, w, h, time, colors) {
    const cx = w / 2; const cy = h / 2; const R = Math.min(w, h) * 0.32;
    for (let i = 0; i < 6; i++) { c.strokeStyle = rgba(colors.text, 0.08 + i * 0.02); c.lineWidth = (2 + i) * SIZE; c.beginPath(); c.arc(cx, cy, R * (1 - i * 0.12 + 0.02 * Math.sin(time + i)), 0, Math.PI * 2); c.stroke(); }
    const open = 0.35 + 0.25 * Math.sin(time * 0.8);
    c.fillStyle = rgba(colors.accent, 0.14);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + time * 0.2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * open, cy + Math.sin(a) * R * open); c.lineTo(cx + Math.cos(a + 1.2) * R * 0.7, cy + Math.sin(a + 1.2) * R * 0.7); c.lineTo(cx + Math.cos(a + 0.6) * R * 0.75, cy + Math.sin(a + 0.6) * R * 0.75); c.closePath(); c.fill(); }
    c.fillStyle = rgba('#ffffff', 0.12); c.beginPath(); c.arc(cx - R * 0.3, cy - R * 0.3, R * 0.12, 0, Math.PI * 2); c.fill();
  },
  /** A sound waveform scrolling by. */
  waveform(c, w, h, time, colors) {
    for (let layer = 0; layer < 3; layer++) {
      c.strokeStyle = rgba(ink(layer, colors), 0.3 - layer * 0.07); c.lineWidth = (3 - layer) * SIZE;
      c.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const u = x / w;
        const y = h / 2 + Math.sin(u * 22 + time * (2 + layer)) * h * 0.12 * Math.sin(u * 3 + time * 0.4) + Math.sin(u * 70 + time * 6) * h * 0.02;
        if (x) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    }
  },
  /** Stars streaming towards the viewer (going live). */
  starStream(c, w, h, time, colors) {
    const cx = w / 2; const cy = h / 2;
    for (let i = 0; i < 160; i++) {
      const z = mod(hash(i, 9) - time * 0.12, 1);
      const a = hash(i, 1) * Math.PI * 2; const d = (1 - z) ** 2 * Math.max(w, h) * 0.8;
      const x = cx + Math.cos(a) * d; const y = cy + Math.sin(a) * d;
      c.fillStyle = rgba(i % 7 ? colors.text : colors.accent, 0.12 + (1 - z) * 0.4);
      const s = (1 - z) * 3.5 * SIZE + 0.5;
      c.fillRect(x, y, s, s);
    }
  },
  /** LIVE badges and dots pulsing on a map of streams. */
  liveDots(c, w, h, time, colors) {
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 5) * w; const y = hash(i, 6) * h; const p = mod(time * 0.5 + hash(i, 7), 1);
      c.strokeStyle = rgba(i % 3 ? colors.accent : '#ff3b3b', 0.35 * (1 - p)); c.lineWidth = 2 * SIZE;
      c.beginPath(); c.arc(x, y, 4 * SIZE + p * 28 * SIZE, 0, Math.PI * 2); c.stroke();
      c.fillStyle = rgba(i % 3 ? colors.accent : '#ff3b3b', 0.5); c.beginPath(); c.arc(x, y, 3 * SIZE, 0, Math.PI * 2); c.fill();
    }
  },
  /** Soft TV static with a slow-moving glow. */
  tvStatic(c, w, h, time, colors) {
    const s = 6 * SIZE; const frame = Math.floor(time * 12);
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s * 3) {
      const v = hash(x, y, frame);
      c.fillStyle = rgba(colors.text, v * 0.08); c.fillRect(x + (v * s * 2), y, s * 1.5, s);
    }
    const g = c.createRadialGradient(w * (0.5 + 0.3 * Math.sin(time * 0.3)), h * 0.5, 0, w * 0.5, h * 0.5, w * 0.6);
    g.addColorStop(0, rgba(colors.accent, 0.12)); g.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  },
  /** Neon frames (like scene items) drifting and turning. */
  neonFrames(c, w, h, time, colors) {
    c.lineWidth = 2.5 * SIZE;
    for (let i = 0; i < 10; i++) {
      const fw = w * (0.12 + hash(i, 1) * 0.2); const fh = fw * 0.5625;
      const x = mod(hash(i, 2) * w + time * (10 + hash(i, 3) * 20) * SIZE, w + fw) - fw; const y = hash(i, 4) * (h - fh);
      c.save(); c.translate(x + fw / 2, y + fh / 2); c.rotate(Math.sin(time * 0.3 + i) * 0.1);
      c.strokeStyle = rgba(ink(i, colors), 0.4); c.shadowColor = rgba(ink(i, colors), 0.5); c.shadowBlur = 12 * SIZE;
      c.strokeRect(-fw / 2, -fh / 2, fw, fh);
      c.restore();
    }
    c.shadowBlur = 0;
  },
};

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

  /** A different animation, chosen at random. */
  shuffle(random = Math.random) {
    const others = ANIMATION_KINDS.filter((kind) => kind !== this.kind);
    const next = others[Math.floor(random() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  seed() {
    const r = rand(this.kind.length * 9973 + 7);
    const count = 0;
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

  pause() {
    this.running = false;
  }

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
    // A little slack, so a 60 Hz screen draws every other frame instead of drifting between 1 and 3.
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
    // Broad washes (light, glow, cloth) are strong already; thin lines and dots need the most help.
    const kindBoost = { tvStatic: 0.8, pixelGrid: 0.85 }[this.kind] ?? 1;
    BOOST = this.vivid ? (colors.dark ? 2.3 : 2.9) * kindBoost : 1;
    SIZE = this.vivid ? 1.6 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = SCENES[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
  }
}
