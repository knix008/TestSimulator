// Moving backgrounds for the start page and (faintly) behind the views. All twenty are charts, the program's
// subject (the list is ANIMATIONS in settings): rising bars, lines drawing themselves, turning pies, a drifting
// scatter with its trend line, stacked waves, a candle ticker, breathing radars, a heat map, bubbles, gauges,
// a treemap that re-divides, Sankey ribbons, a histogram filling up, box plots, a spreadsheet of numbers,
// a wall of sparklines, funnels, waterfalls, polar roses and a dashboard of small charts. Colours follow the
// theme plus a chart palette. The animation pauses while the window is hidden; `frames` counts drawn frames
// (tests use it).
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** A stable pseudo-random number in [0, 1) for a pair of integers. */
const hash = (a, b = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
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
/** The backgrounds drift slowly: 30 frames a second look the same as the screen's 60–144 and cost a fraction. */
const FRAME_MS = 1000 / 30;

/** How strongly the current background is drawn (the start page vividly, the layer behind the views faintly). */
let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };
const MONO = 'Consolas, Menlo, "DejaVu Sans Mono", monospace';
/** Series colours: the theme's accent first, then a chart palette. */
const SERIES = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];
const pal = (colors, i) => (i % SERIES.length === 0 ? colors.accent : SERIES[i % SERIES.length]);
/** A smooth value in [0, 1] that wanders with time (each `seed` its own way). */
const wave = (time, seed, speed = 0.3) => 0.5 + 0.25 * Math.sin(time * speed + seed * 7.1) + 0.2 * Math.sin(time * speed * 1.7 + seed * 3.3) + 0.05 * Math.sin(time * speed * 4.3 + seed);

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
    const count = { scatter: 90, bubbles: 26, gauges: 6, pies: 7, radar: 4, boxplot: 9, funnel: 3, polar: 3, sparklines: 24, candles: 60 }[this.kind] ?? 0;
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
    const kindBoost = { heatmap: 0.7, treemap: 0.7, areas: 0.8, spreadsheet: 1.1 }[this.kind] ?? 1;
    BOOST = this.vivid ? (colors.dark ? 2.1 : 2.6) * kindBoost : 1;
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
    c.globalCompositeOperation = 'source-over';
    c.textAlign = 'start';
    c.setLineDash([]);
  }

  /** Faint axes and grid lines in a box (most charts share them). */
  frame(c, x, y, w, h, colors, rows = 4) {
    c.lineWidth = Math.max(1, w / 900);
    c.strokeStyle = rgba(colors.text, 0.06);
    c.beginPath();
    for (let i = 1; i <= rows; i++) { const yy = y + h - (h * i) / rows; c.moveTo(x, yy); c.lineTo(x + w, yy); }
    c.stroke();
    c.strokeStyle = rgba(colors.text, 0.16);
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x, y + h); c.lineTo(x + w, y + h);
    c.stroke();
  }

  /** Grouped columns that rise and fall like monthly figures. */
  bars(c, w, h, time, colors) {
    const x0 = w * 0.05;
    const y0 = h * 0.12;
    const cw = w * 0.9;
    const ch = h * 0.8;
    this.frame(c, x0, y0, cw, ch, colors, 5);
    const n = 14;
    const groups = 3;
    const band = cw / n;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < groups; k++) {
        const v = 0.15 + 0.8 * wave(time, i * 3 + k, 0.35);
        const bw = (band * 0.72) / groups;
        const x = x0 + i * band + band * 0.14 + k * bw;
        c.fillStyle = rgba(pal(colors, k), 0.16);
        c.fillRect(x, y0 + ch * (1 - v), bw - 2, ch * v);
        c.fillStyle = rgba(pal(colors, k), 0.3);
        c.fillRect(x, y0 + ch * (1 - v), bw - 2, Math.max(2, 3 * SIZE));
      }
    }
  }

  /** Line series drawing themselves from left to right, over and over. */
  lines(c, w, h, time, colors) {
    const x0 = w * 0.04;
    const y0 = h * 0.1;
    const cw = w * 0.92;
    const ch = h * 0.8;
    this.frame(c, x0, y0, cw, ch, colors, 6);
    const n = 40;
    const progress = ((time * 0.12) % 1.25);
    for (let k = 0; k < 4; k++) {
      c.strokeStyle = rgba(pal(colors, k), 0.32);
      c.lineWidth = 2.2 * SIZE * Math.max(1, w / 1600);
      c.beginPath();
      const upto = Math.min(n, Math.floor(progress * n * 1.0) + 1);
      for (let i = 0; i < upto; i++) {
        const v = 0.15 + 0.7 * (0.5 + 0.35 * Math.sin(i * 0.35 + k * 1.7) + 0.15 * Math.sin(i * 0.9 + k));
        const x = x0 + (i / (n - 1)) * cw;
        const y = y0 + ch * (1 - v);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      for (let i = 0; i < upto; i += 4) {
        const v = 0.15 + 0.7 * (0.5 + 0.35 * Math.sin(i * 0.35 + k * 1.7) + 0.15 * Math.sin(i * 0.9 + k));
        c.fillStyle = rgba(pal(colors, k), 0.35);
        c.beginPath();
        c.arc(x0 + (i / (n - 1)) * cw, y0 + ch * (1 - v), 3.2 * SIZE, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  /** Pie and donut charts turning slowly, their slices breathing. */
  pies(c, w, h, time, colors) {
    for (const [i, p] of this.items.entries()) {
      const cx = (0.08 + p.x * 0.84) * w;
      const cy = (0.12 + p.y * 0.76) * h;
      const r = (0.06 + p.s * 0.07) * Math.min(w, h) * 1.4;
      const parts = 3 + Math.floor(p.z * 4);
      const values = Array.from({ length: parts }, (_, k) => 0.4 + wave(time, i * 10 + k, 0.25));
      const total = values.reduce((a, b) => a + b, 0);
      let a = time * (0.08 + p.v * 0.1) * (p.h > 0.5 ? 1 : -1);
      values.forEach((v, k) => {
        const da = (v / total) * Math.PI * 2;
        c.fillStyle = rgba(pal(colors, k + i), 0.17);
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, r, a, a + da - 0.03);
        c.closePath();
        c.fill();
        a += da;
      });
      if (p.h > 0.45) { c.fillStyle = colors.bg; c.globalAlpha = 0.9; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    }
  }

  /** A cloud of points drifting around a trend line. */
  scatter(c, w, h, time, colors) {
    const x0 = w * 0.06;
    const y0 = h * 0.08;
    const cw = w * 0.88;
    const ch = h * 0.84;
    this.frame(c, x0, y0, cw, ch, colors, 5);
    const slope = 0.6 + 0.2 * Math.sin(time * 0.1);
    for (const [i, p] of this.items.entries()) {
      const x = p.x;
      const y = Math.max(0.02, Math.min(0.98, 0.15 + slope * x + (p.y - 0.5) * 0.35 + Math.sin(time * 0.3 + i) * 0.02));
      c.fillStyle = rgba(pal(colors, i % 3), 0.28);
      c.beginPath();
      c.arc(x0 + x * cw, y0 + ch * (1 - y), (2.5 + p.s * 3) * SIZE, 0, Math.PI * 2);
      c.fill();
    }
    c.setLineDash([10 * SIZE, 8 * SIZE]);
    c.strokeStyle = rgba(colors.accent, 0.35);
    c.lineWidth = 2 * SIZE;
    c.beginPath();
    c.moveTo(x0, y0 + ch * (1 - 0.15));
    c.lineTo(x0 + cw, y0 + ch * (1 - 0.15 - slope));
    c.stroke();
    c.setLineDash([]);
  }

  /** Stacked areas flowing sideways like a streamgraph. */
  areas(c, w, h, time, colors) {
    const n = 60;
    const layers = 5;
    const base = Array(n).fill(0);
    for (let k = 0; k < layers; k++) {
      const top = base.map((b, i) => b + 0.07 + 0.08 * (0.5 + 0.5 * Math.sin(i * 0.18 + time * 0.25 + k * 1.3)) * (0.6 + 0.4 * Math.sin(i * 0.05 + k)));
      c.fillStyle = rgba(pal(colors, k), 0.13);
      c.beginPath();
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * w; const y = h * (0.92 - top[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      for (let i = n - 1; i >= 0; i--) c.lineTo((i / (n - 1)) * w, h * (0.92 - base[i]));
      c.closePath();
      c.fill();
      for (let i = 0; i < n; i++) base[i] = top[i];
    }
  }

  /** A candlestick ticker scrolling to the left. */
  candles(c, w, h, time, colors) {
    const x0 = w * 0.03;
    const y0 = h * 0.1;
    const cw = w * 0.94;
    const ch = h * 0.8;
    this.frame(c, x0, y0, cw, ch, colors, 6);
    const n = 48;
    const step = cw / n;
    const shift = (time * 0.8) % 1;
    const start = Math.floor(time * 0.8);
    let price = 0.5;
    const series = [];
    for (let i = 0; i < start + n + 1; i++) {
      const open = price;
      price = Math.max(0.12, Math.min(0.88, price + (hash(i, 1) - 0.5) * 0.09));
      if (i >= start) series.push({ open, close: price, high: Math.max(open, price) + hash(i, 2) * 0.04, low: Math.min(open, price) - hash(i, 3) * 0.04 });
    }
    series.forEach((d, i) => {
      const x = x0 + (i - shift) * step + step / 2;
      if (x < x0 || x > x0 + cw) return;
      const up = d.close >= d.open;
      const color = up ? '#16a34a' : '#dc2626';
      c.strokeStyle = rgba(color, 0.3);
      c.lineWidth = 1.4 * SIZE;
      c.beginPath();
      c.moveTo(x, y0 + ch * (1 - d.high));
      c.lineTo(x, y0 + ch * (1 - d.low));
      c.stroke();
      c.fillStyle = rgba(color, up ? 0.14 : 0.26);
      const top = y0 + ch * (1 - Math.max(d.open, d.close));
      c.fillRect(x - step * 0.3, top, step * 0.6, Math.max(2, ch * Math.abs(d.close - d.open)));
    });
  }

  /** Radar charts whose polygons breathe. */
  radar(c, w, h, time, colors) {
    const spots = [[0.22, 0.32], [0.75, 0.3], [0.3, 0.75], [0.78, 0.74]];
    spots.forEach(([fx, fy], s) => {
      const cx = fx * w;
      const cy = fy * h;
      const R = Math.min(w, h) * 0.2 * SIZE * 0.85;
      const n = 6;
      c.strokeStyle = rgba(colors.text, 0.08);
      c.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring++) {
        c.beginPath();
        for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const x = cx + Math.sin(a) * R * ring / 4; const y = cy - Math.cos(a) * R * ring / 4; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
      }
      for (let k = 0; k < 2; k++) {
        c.fillStyle = rgba(pal(colors, k + s), 0.13);
        c.strokeStyle = rgba(pal(colors, k + s), 0.32);
        c.lineWidth = 2 * SIZE;
        c.beginPath();
        for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const v = 0.35 + 0.6 * wave(time, s * 20 + k * 7 + (i % n), 0.4); const x = cx + Math.sin(a) * R * v; const y = cy - Math.cos(a) * R * v; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.fill();
        c.stroke();
      }
    });
  }

  /** A heat map whose cells warm and cool. */
  heatmap(c, w, h, time, colors) {
    const cols = 28;
    const rows = Math.max(8, Math.round((cols * h) / w));
    const cw = w / cols;
    const rh = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const v = 0.5 + 0.5 * Math.sin(i * 0.4 + time * 0.5) * Math.cos(j * 0.5 - time * 0.3) * (0.6 + 0.4 * hash(i, j));
        c.fillStyle = rgba(v > 0.6 ? '#ef4444' : v > 0.4 ? '#f59e0b' : colors.accent, 0.04 + v * 0.12);
        c.fillRect(i * cw + 1.5, j * rh + 1.5, cw - 3, rh - 3);
      }
    }
  }

  /** Bubbles rising slowly, sized by a third value. */
  bubbles(c, w, h, time, colors) {
    for (const [i, p] of this.items.entries()) {
      const y = (((p.y - time * (0.015 + p.v * 0.02)) % 1) + 1) % 1;
      const r = (12 + p.s * 55) * SIZE * Math.max(1, w / 1600);
      const x = (p.x + Math.sin(time * 0.3 + i) * 0.015) * w;
      c.fillStyle = rgba(pal(colors, i), 0.11);
      c.strokeStyle = rgba(pal(colors, i), 0.25);
      c.lineWidth = 1.5 * SIZE;
      c.beginPath();
      c.arc(x, y * (h + 2 * r) - r, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  /** Gauges whose needles swing between zones. */
  gauges(c, w, h, time, colors) {
    this.items.forEach((p, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = w * (0.18 + col * 0.32);
      const cy = h * (0.42 + row * 0.42);
      const R = Math.min(w / 7, h / 4.2) * SIZE * 0.8;
      const zones = [[0, 0.6, '#16a34a'], [0.6, 0.85, '#f59e0b'], [0.85, 1, '#dc2626']];
      c.lineWidth = R * 0.22;
      for (const [a, b, color] of zones) {
        c.strokeStyle = rgba(color, 0.13);
        c.beginPath();
        c.arc(cx, cy, R, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
        c.stroke();
      }
      const v = wave(time, i, 0.45);
      c.strokeStyle = rgba(pal(colors, i), 0.3);
      c.beginPath();
      c.arc(cx, cy, R, Math.PI, Math.PI + v * Math.PI);
      c.stroke();
      c.lineWidth = 3 * SIZE;
      c.strokeStyle = rgba(colors.text, 0.3);
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(Math.PI + v * Math.PI) * R * 0.85, cy + Math.sin(Math.PI + v * Math.PI) * R * 0.85);
      c.stroke();
      c.fillStyle = rgba(colors.text, 0.25);
      c.font = `${Math.round(R * 0.32)}px ${MONO}`;
      c.textAlign = 'center';
      c.fillText(`${Math.round(v * 100)}%`, cx, cy + R * 0.38);
    });
  }

  /** A treemap that keeps dividing itself again. */
  treemap(c, w, h, time, colors) {
    const values = Array.from({ length: 14 }, (_, i) => 0.3 + wave(time, i, 0.18));
    const split = (list, x, y, ww, hh, depth) => {
      if (list.length === 1) {
        const [v, i] = list[0];
        void v;
        c.fillStyle = rgba(pal(colors, i), 0.12);
        c.fillRect(x + 2, y + 2, ww - 4, hh - 4);
        c.strokeStyle = rgba(pal(colors, i), 0.25);
        c.lineWidth = 1.5;
        c.strokeRect(x + 2, y + 2, ww - 4, hh - 4);
        return;
      }
      const total = list.reduce((a, [v]) => a + v, 0);
      let acc = 0;
      let cut = 1;
      for (; cut < list.length - 1; cut++) { acc += list[cut - 1][0]; if (acc >= total / 2) break; }
      const a = list.slice(0, cut);
      const b = list.slice(cut);
      const fa = a.reduce((s, [v]) => s + v, 0) / total;
      if (ww >= hh) { split(a, x, y, ww * fa, hh, depth + 1); split(b, x + ww * fa, y, ww * (1 - fa), hh, depth + 1); } else { split(a, x, y, ww, hh * fa, depth + 1); split(b, x, y + hh * fa, ww, hh * (1 - fa), depth + 1); }
    };
    split(values.map((v, i) => [v, i]), w * 0.02, h * 0.03, w * 0.96, h * 0.94, 0);
  }

  /** Sankey ribbons flowing from sources to targets. */
  sankey(c, w, h, time, colors) {
    const cols = [0.08, 0.5, 0.92];
    const nodes = [[0.15, 0.45, 0.8], [0.25, 0.65], [0.12, 0.38, 0.62, 0.86]];
    const node = (k, j) => ({ x: cols[k] * w, y: nodes[k][j] * h + Math.sin(time * 0.3 + k + j) * h * 0.01 });
    const links = [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 2, 1], [1, 0, 0], [1, 0, 1], [1, 1, 2], [1, 1, 3], [1, 0, 2]];
    links.forEach(([k, a, b], i) => {
      const p = node(k, a);
      const q = node(k + 1, b);
      const thick = (14 + 30 * wave(time, i, 0.2)) * SIZE;
      c.strokeStyle = rgba(pal(colors, i), 0.1);
      c.lineWidth = thick;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.bezierCurveTo((p.x + q.x) / 2, p.y, (p.x + q.x) / 2, q.y, q.x, q.y);
      c.stroke();
      const f = (time * 0.15 + hash(i)) % 1;
      const t = f;
      const x = (1 - t) ** 3 * p.x + 3 * (1 - t) ** 2 * t * ((p.x + q.x) / 2) + 3 * (1 - t) * t * t * ((p.x + q.x) / 2) + t ** 3 * q.x;
      const y = (1 - t) ** 3 * p.y + 3 * (1 - t) ** 2 * t * p.y + 3 * (1 - t) * t * t * q.y + t ** 3 * q.y;
      c.fillStyle = rgba(pal(colors, i), 0.35);
      c.beginPath();
      c.arc(x, y, 3.5 * SIZE, 0, Math.PI * 2);
      c.fill();
    });
    nodes.forEach((list, k) => list.forEach((_, j) => { const p = node(k, j); c.fillStyle = rgba(colors.text, 0.18); c.fillRect(p.x - 6 * SIZE, p.y - 34 * SIZE, 12 * SIZE, 68 * SIZE); }));
  }

  /** A histogram filling up as values land in their bins. */
  histogram(c, w, h, time, colors) {
    const x0 = w * 0.06;
    const y0 = h * 0.1;
    const cw = w * 0.88;
    const ch = h * 0.82;
    this.frame(c, x0, y0, cw, ch, colors, 5);
    const bins = 24;
    const fill = (time * 0.12) % 1.3;
    for (let i = 0; i < bins; i++) {
      const z = (i - bins / 2 + 0.5) / (bins / 6);
      const target = Math.exp(-z * z / 2);
      const v = Math.min(target, target * Math.min(1, fill * 1.2 + hash(i) * 0.15));
      const bw = cw / bins;
      c.fillStyle = rgba(colors.accent, 0.17);
      c.fillRect(x0 + i * bw + 1, y0 + ch * (1 - v * 0.9), bw - 2, ch * v * 0.9);
    }
    c.strokeStyle = rgba('#f97316', 0.35);
    c.lineWidth = 2 * SIZE;
    c.beginPath();
    for (let i = 0; i <= 100; i++) { const z = (i / 100 - 0.5) * 8; const x = x0 + (i / 100) * cw; const y = y0 + ch * (1 - Math.exp(-z * z / 2) * 0.9); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    // A falling value.
    const f = (time * 0.8) % 1;
    const bin = Math.floor(hash(Math.floor(time * 0.8), 9) * bins);
    c.fillStyle = rgba('#f97316', 0.4);
    c.beginPath();
    c.arc(x0 + (bin + 0.5) * (cw / bins), y0 + ch * f * 0.8, 4 * SIZE, 0, Math.PI * 2);
    c.fill();
  }

  /** Box plots: quartile boxes and whiskers that stretch and shrink. */
  boxplot(c, w, h, time, colors) {
    const x0 = w * 0.05;
    const y0 = h * 0.08;
    const cw = w * 0.9;
    const ch = h * 0.84;
    this.frame(c, x0, y0, cw, ch, colors, 6);
    const n = this.items.length;
    this.items.forEach((p, i) => {
      const cx = x0 + ((i + 0.5) / n) * cw;
      const mid = 0.3 + 0.4 * wave(time, i, 0.25);
      const spread = 0.08 + 0.1 * p.s + 0.04 * Math.sin(time * 0.4 + i);
      const bw = (cw / n) * 0.45;
      const y = (v) => y0 + ch * (1 - v);
      c.strokeStyle = rgba(pal(colors, i), 0.32);
      c.lineWidth = 1.6 * SIZE;
      c.beginPath();
      c.moveTo(cx, y(mid + spread * 2.2)); c.lineTo(cx, y(mid - spread * 2.2));
      c.moveTo(cx - bw / 3, y(mid + spread * 2.2)); c.lineTo(cx + bw / 3, y(mid + spread * 2.2));
      c.moveTo(cx - bw / 3, y(mid - spread * 2.2)); c.lineTo(cx + bw / 3, y(mid - spread * 2.2));
      c.stroke();
      c.fillStyle = rgba(pal(colors, i), 0.13);
      c.fillRect(cx - bw / 2, y(mid + spread), bw, ch * spread * 2);
      c.strokeRect(cx - bw / 2, y(mid + spread), bw, ch * spread * 2);
      c.beginPath();
      c.moveTo(cx - bw / 2, y(mid)); c.lineTo(cx + bw / 2, y(mid));
      c.stroke();
    });
  }

  /** A spreadsheet of numbers with cells lighting up as they change. */
  spreadsheet(c, w, h, time, colors) {
    const size = Math.max(11, Math.round(14 * SIZE * Math.max(1, w / 1800)));
    const rowH = size * 2;
    const colW = size * 7;
    const cols = Math.ceil(w / colW) + 1;
    const rows = Math.ceil(h / rowH) + 1;
    c.font = `${size}px ${MONO}`;
    c.textAlign = 'right';
    c.strokeStyle = rgba(colors.text, 0.05);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= cols; i++) { c.moveTo(i * colW, 0); c.lineTo(i * colW, h); }
    for (let j = 0; j <= rows; j++) { c.moveTo(0, j * rowH); c.lineTo(w, j * rowH); }
    c.stroke();
    const tick = Math.floor(time * 2);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const changed = hash(i + tick, j) > 0.97;
        if (changed) { c.fillStyle = rgba(colors.accent, 0.1); c.fillRect(i * colW + 1, j * rowH + 1, colW - 2, rowH - 2); }
        if (j === 0) { c.fillStyle = rgba(colors.text, 0.22); c.fillText(String.fromCharCode(65 + (i % 26)), i * colW + colW - 8, rowH * 0.68); continue; }
        const v = Math.round((hash(i, j + (changed ? tick : 0)) * 9000 + 100)) / (i % 3 === 0 ? 1 : 10);
        c.fillStyle = rgba(changed ? colors.accent : colors.text, changed ? 0.4 : 0.13);
        c.fillText(v.toLocaleString('en-US'), i * colW + colW - 8, j * rowH + rowH * 0.68);
      }
    }
  }

  /** A wall of small line charts, each with its last value marked. */
  sparklines(c, w, h, time, colors) {
    const cols = 4;
    const rows = Math.ceil(this.items.length / cols);
    const cw = w / cols;
    const rh = h / rows;
    this.items.forEach((p, i) => {
      const x0 = (i % cols) * cw + cw * 0.1;
      const y0 = Math.floor(i / cols) * rh + rh * 0.25;
      const ww = cw * 0.8;
      const hh = rh * 0.5;
      const n = 30;
      c.strokeStyle = rgba(pal(colors, i), 0.3);
      c.lineWidth = 1.8 * SIZE;
      c.beginPath();
      let last = [0, 0];
      for (let k = 0; k < n; k++) {
        const v = 0.5 + 0.3 * Math.sin(k * 0.4 + time * (0.3 + p.v * 0.5) + i) + 0.2 * Math.sin(k * 1.3 + i * 2 + time * 0.2);
        const x = x0 + (k / (n - 1)) * ww;
        const y = y0 + hh * (1 - v);
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
        last = [x, y];
      }
      c.stroke();
      c.fillStyle = rgba(pal(colors, i), 0.45);
      c.beginPath();
      c.arc(last[0], last[1], 3 * SIZE, 0, Math.PI * 2);
      c.fill();
    });
  }

  /** Funnels whose stages narrow and widen. */
  funnel(c, w, h, time, colors) {
    this.items.forEach((p, f) => {
      const cx = w * (0.2 + f * 0.3);
      const top = h * 0.12;
      const height = h * 0.76;
      const maxW = w * 0.24;
      const stages = 5;
      let width = maxW;
      for (let s = 0; s < stages; s++) {
        const next = width * (0.62 + 0.25 * wave(time, f * 10 + s, 0.3));
        const y = top + (s * height) / stages;
        const hh = height / stages - 6;
        c.fillStyle = rgba(pal(colors, s + f), 0.15);
        c.beginPath();
        c.moveTo(cx - width / 2, y); c.lineTo(cx + width / 2, y); c.lineTo(cx + next / 2, y + hh); c.lineTo(cx - next / 2, y + hh);
        c.closePath();
        c.fill();
        width = next;
      }
    });
  }

  /** Waterfall bridges: steps up and down to a total. */
  waterfall(c, w, h, time, colors) {
    const x0 = w * 0.05;
    const y0 = h * 0.1;
    const cw = w * 0.9;
    const ch = h * 0.8;
    this.frame(c, x0, y0, cw, ch, colors, 5);
    const n = 14;
    const band = cw / n;
    let run = 0.35;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const delta = last ? 0 : (wave(time, i, 0.2) - 0.5) * 0.3;
      const a = last ? 0 : run;
      const b = last ? run : Math.max(0.05, Math.min(0.95, run + delta));
      const color = last ? colors.accent : b >= a ? '#16a34a' : '#dc2626';
      c.fillStyle = rgba(color, 0.18);
      c.fillRect(x0 + i * band + band * 0.15, y0 + ch * (1 - Math.max(a, b)), band * 0.7, Math.max(2, ch * Math.abs(b - a)));
      if (!last) {
        c.strokeStyle = rgba(colors.text, 0.12);
        c.setLineDash([4, 4]);
        c.beginPath();
        c.moveTo(x0 + i * band + band * 0.85, y0 + ch * (1 - b));
        c.lineTo(x0 + (i + 1) * band + band * 0.15, y0 + ch * (1 - b));
        c.stroke();
        c.setLineDash([]);
        run = b;
      }
    }
  }

  /** Polar roses: equal angles, petals that grow and shrink. */
  polar(c, w, h, time, colors) {
    this.items.forEach((p, k) => {
      const cx = w * (0.2 + k * 0.3);
      const cy = h * (k % 2 ? 0.62 : 0.4);
      const R = Math.min(w / 6.5, h / 2.6) * SIZE * 0.85;
      const n = 8 + k * 2;
      c.strokeStyle = rgba(colors.text, 0.07);
      for (let ring = 1; ring <= 3; ring++) { c.beginPath(); c.arc(cx, cy, (R * ring) / 3, 0, Math.PI * 2); c.stroke(); }
      for (let i = 0; i < n; i++) {
        const v = 0.25 + 0.75 * wave(time, k * 30 + i, 0.3);
        const a = (i / n) * Math.PI * 2 + time * 0.05 * (k % 2 ? 1 : -1);
        c.fillStyle = rgba(pal(colors, i), 0.14);
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, R * Math.sqrt(v), a, a + (Math.PI * 2) / n - 0.04);
        c.closePath();
        c.fill();
      }
    });
  }

  /** A dashboard of small charts: KPI numbers, bars, a line, a donut. */
  dashboard(c, w, h, time, colors) {
    const pad = Math.min(w, h) * 0.03;
    const cells = [[0, 0, 0.32, 0.4], [0.34, 0, 0.66, 0.4], [0, 0.42, 0.48, 0.58], [0.5, 0.42, 0.5, 0.58]];
    cells.forEach(([fx, fy, fw, fh], k) => {
      const x = pad + fx * (w - pad * 2);
      const y = pad + fy * (h - pad * 2);
      const ww = fw * (w - pad * 2) - pad;
      const hh = fh * (h - pad * 2) - pad;
      c.strokeStyle = rgba(colors.text, 0.1);
      c.lineWidth = 1.2;
      c.strokeRect(x, y, ww, hh);
      if (k === 0) {
        // KPI tiles.
        for (let i = 0; i < 3; i++) {
          const v = Math.round(wave(time, i, 0.2) * 1000);
          c.fillStyle = rgba(pal(colors, i), 0.35);
          c.font = `${Math.round(hh * 0.18)}px ${MONO}`;
          c.textAlign = 'left';
          c.fillText(v.toLocaleString('en-US'), x + ww * 0.08, y + hh * (0.32 + i * 0.28));
        }
      } else if (k === 1) {
        const n = 20;
        for (let i = 0; i < n; i++) {
          const v = wave(time, i, 0.4);
          c.fillStyle = rgba(pal(colors, 0), 0.16);
          c.fillRect(x + (i / n) * ww + 3, y + hh * (0.95 - v * 0.8), ww / n - 6, hh * v * 0.8);
        }
      } else if (k === 2) {
        c.strokeStyle = rgba(pal(colors, 1), 0.35);
        c.lineWidth = 2 * SIZE;
        c.beginPath();
        for (let i = 0; i <= 40; i++) { const v = wave(time * 0.6, i * 0.15, 1); const px = x + (i / 40) * ww; const py = y + hh * (0.9 - v * 0.75); if (i) c.lineTo(px, py); else c.moveTo(px, py); }
        c.stroke();
      } else {
        const cx = x + ww / 2;
        const cy = y + hh / 2;
        const r = Math.min(ww, hh) * 0.38;
        let a = time * 0.1;
        for (let i = 0; i < 4; i++) {
          const da = (0.15 + 0.35 * wave(time, i, 0.2)) * 2;
          c.strokeStyle = rgba(pal(colors, i), 0.3);
          c.lineWidth = r * 0.35;
          c.beginPath();
          c.arc(cx, cy, r, a, a + da);
          c.stroke();
          a += da + 0.05;
        }
      }
    });
  }
}
