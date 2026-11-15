// Moving backgrounds for the start page and (faintly) behind the views: twenty quiet scenes from the app's own
// world (the list is ANIMATIONS in settings): conveyors, an assembly line, AGVs, warehouse racks, road traffic,
// trains, pedestrians, a process network, material flows, a Gantt chart, gears, pipes and tanks, stocks and
// flows, a supply network, a utilization heat map, queues, robot arms, a container yard, live charts and agents
// (FLOW_SCENES at the end). Colours follow the theme. The animation pauses while the window is hidden;
// `frames` counts drawn frames (tests use it). The older interior scenes stay in the class but are not listed.
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
/** Sunlight: pale gold on dark themes, a deeper amber that still shows on light ones. */
const warm = (colors) => (colors.dark ? '#ffd79a' : '#e09a3c');
/** Muted interior colours for paint chips and leaves, next to the theme's accent. */
const PAINTS = ['#9caf88', '#c97b5a', '#d9c3a0', '#6b7f99', '#2f4858', '#b5838d', '#7a8450', '#e0b26f', '#8c6e5a', '#5f8f8b'];
const LEAF = '#6f9a5b';

/** Strokes the first `share` (0–1) of a list of segments [x1, y1, x2, y2]; returns the pen's position. */
function drawPartial(c, segs, share) {
  let total = 0;
  for (const s of segs) total += Math.hypot(s[2] - s[0], s[3] - s[1]);
  let left = total * clamp01(share);
  let pen = null;
  c.beginPath();
  for (const [x1, y1, x2, y2] of segs) {
    if (left <= 0) break;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const f = len > left ? left / len : 1;
    pen = [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
    c.moveTo(x1, y1);
    c.lineTo(pen[0], pen[1]);
    left -= len;
  }
  c.stroke();
  return share < 1 ? pen : null;
}

const rectSegs = (x1, y1, x2, y2) => [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]];

/** All lines of a square grid as one path. */
function gridPath(c, w, h, step, offX, offY) {
  c.beginPath();
  for (let x = mod(offX, step); x <= w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
  for (let y = mod(offY, step); y <= h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
  c.stroke();
}

function roundRectPath(c, x, y, w, h, r) {
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

/** A leaf along +x from the origin: two curves and a midrib. */
function leafPath(c, length, width) {
  c.moveTo(0, 0);
  c.quadraticCurveTo(length * 0.45, -width, length, 0);
  c.quadraticCurveTo(length * 0.45, width, 0, 0);
}

function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Furniture seen from the side, in a box about one unit tall (y down): r = rounded box, p = polygon,
 * l = line, e = ellipse (cx, cy, rx, ry, turn).
 */
const FURNITURE = [
  [['r', -0.3, -0.04, 0.62, 0.1], ['r', -0.32, -0.55, 0.09, 0.55], ['l', -0.27, 0.06, -0.27, 0.5], ['l', 0.27, 0.06, 0.27, 0.5]],
  [['r', -0.6, -0.08, 1.2, 0.28], ['r', -0.55, -0.4, 1.1, 0.3], ['r', -0.72, -0.22, 0.18, 0.44], ['r', 0.54, -0.22, 0.18, 0.44], ['l', -0.58, 0.22, -0.58, 0.34], ['l', 0.58, 0.22, 0.58, 0.34]],
  [['r', -0.62, -0.22, 1.24, 0.08], ['l', -0.5, -0.14, -0.5, 0.42], ['l', 0.5, -0.14, 0.5, 0.42], ['l', -0.5, 0.18, 0.5, 0.18]],
  [['p', -0.2, -0.62, 0.2, -0.62, 0.3, -0.36, -0.3, -0.36], ['l', 0, -0.36, 0, 0.45], ['e', 0, 0.48, 0.2, 0.04, 0]],
  [['p', -0.18, 0.08, 0.18, 0.08, 0.13, 0.5, -0.13, 0.5], ['e', -0.16, -0.16, 0.08, 0.22, -0.55], ['e', 0.16, -0.16, 0.08, 0.22, 0.55], ['e', 0, -0.3, 0.08, 0.26, 0]],
  [['r', -0.65, 0, 1.3, 0.2], ['r', -0.74, -0.36, 0.1, 0.76], ['r', -0.58, -0.09, 0.32, 0.1], ['l', 0.6, 0.2, 0.6, 0.4], ['l', -0.69, 0.4, -0.69, 0.42]],
  [['l', 0, -0.62, 0, -0.12], ['p', -0.26, 0.14, -0.12, -0.12, 0.12, -0.12, 0.26, 0.14], ['e', 0, 0.2, 0.05, 0.05, 0]],
  [['r', -0.42, -0.5, 0.84, 1], ['l', 0, -0.5, 0, 0.5], ['l', -0.08, -0.05, -0.08, 0.05], ['l', 0.08, -0.05, 0.08, 0.05]],
];

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
    const count = { dust: 150, dimensions: 10, swatches: 22, leaves: 7, furniture: 16 }[this.kind] ?? 0;
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
    const kindBoost = { heatmap: 0.8, sankey: 0.85, sunlight: 0.75, lamps: 0.8, curtains: 0.8, fabric: 0.8, parquet: 0.85, bricks: 0.85, tiles: 0.85 }[this.kind] ?? 1;
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
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
  }

  /** A drafting grid with a house elevation drawn line by line, then wiped for the next sheet. */
  blueprint(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const step = unit / 28;
    const drift = time * step * 0.12;
    c.lineWidth = Math.max(1, w / 2400);
    c.strokeStyle = rgba(colors.text, 0.04);
    gridPath(c, w, h, step, drift, drift * 0.5);
    c.strokeStyle = rgba(colors.accent, 0.08);
    gridPath(c, w, h, step * 5, drift, drift * 0.5);

    const { round, phase } = cycle(time, 16);
    const fade = fadeInOut(phase, 0.12);
    const S = Math.min(w * 0.6, h * 0.95);
    const ox = w / 2 - S / 2 + (hash(round, 1) - 0.5) * w * 0.2;
    const oy = h * 0.5 - S * 0.42;
    const P = (x, y) => [ox + x * S, oy + y * S];
    const seg = (x1, y1, x2, y2) => [...P(x1, y1), ...P(x2, y2)];
    const box = (x1, y1, x2, y2) => rectSegs(...P(x1, y1), ...P(x2, y2));
    // Construction lines first, right across the sheet.
    c.strokeStyle = rgba(colors.text, 0.07 * fade);
    drawPartial(c, [[0, P(0, 0.7)[1], w, P(0, 0.7)[1]], [0, P(0, 0.35)[1], w, P(0, 0.35)[1]], [P(0.5, 0)[0], 0, P(0.5, 0)[0], h], [0, P(0, 0.08)[1], w, P(0, 0.08)[1]]], phase / 0.15);
    const lines = [
      seg(-0.08, 0.7, 1.08, 0.7), seg(0.1, 0.7, 0.1, 0.35), seg(0.9, 0.7, 0.9, 0.35), seg(0.04, 0.35, 0.96, 0.35),
      seg(0.04, 0.35, 0.5, 0.08), seg(0.5, 0.08, 0.96, 0.35),
      seg(0.7, 0.21, 0.7, 0.1), seg(0.7, 0.1, 0.78, 0.1), seg(0.78, 0.1, 0.78, 0.25),
      ...box(0.44, 0.48, 0.56, 0.7), ...box(0.18, 0.45, 0.34, 0.59), seg(0.26, 0.45, 0.26, 0.59), seg(0.18, 0.52, 0.34, 0.52),
      ...box(0.66, 0.45, 0.82, 0.59), seg(0.74, 0.45, 0.74, 0.59), seg(0.66, 0.52, 0.82, 0.52), ...box(0.46, 0.2, 0.54, 0.28),
      seg(0.1, 0.78, 0.9, 0.78), seg(0.08, 0.8, 0.12, 0.76), seg(0.88, 0.8, 0.92, 0.76), seg(0.1, 0.72, 0.1, 0.8), seg(0.9, 0.72, 0.9, 0.8),
    ];
    c.lineWidth = Math.max(1, w / 1100) * SIZE;
    c.lineCap = 'round';
    c.strokeStyle = rgba(colors.accent, 0.38 * fade);
    const pen = drawPartial(c, lines, (phase - 0.08) / 0.62);
    if (pen) {
      c.fillStyle = rgba(colors.text, 0.5 * fade);
      c.beginPath();
      c.arc(pen[0], pen[1], 2.2 * SIZE, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = rgba(colors.text, 0.15 * fade);
      c.beginPath();
      c.moveTo(pen[0] - step, pen[1]); c.lineTo(pen[0] + step, pen[1]);
      c.moveTo(pen[0], pen[1] - step); c.lineTo(pen[0], pen[1] + step);
      c.stroke();
    }
  }

  /** Walls tracing a plan, the rooms filling in and the doors swinging into place. */
  floorplan(c, w, h, time, colors) {
    const { round, phase } = cycle(time, 17);
    const fade = fadeInOut(phase, 0.1);
    const S = Math.min((w * 0.66) / 12, (h * 0.72) / 8);
    const flip = round % 2 ? -1 : 1;
    const ox = w / 2 + Math.sin(time * 0.05) * w * 0.02;
    const oy = h / 2 - 4 * S;
    const P = (x, y) => [ox + (x - 6) * S * flip, oy + y * S];
    const rooms = [[0, 0, 7, 5], [7, 0, 12, 4], [0, 5, 4, 8], [4, 5, 7, 8], [7, 4, 12, 8]];
    rooms.forEach(([x1, y1, x2, y2], i) => {
      const k = clamp01((phase - 0.36 - i * 0.05) / 0.08) * fade;
      if (!k) return;
      const [ax, ay] = P(x1, y1);
      const [bx, by] = P(x2, y2);
      c.fillStyle = rgba(i % 2 ? colors.text : colors.accent, (i % 2 ? 0.04 : 0.08) * k);
      c.fillRect(Math.min(ax, bx), ay, Math.abs(bx - ax), by - ay);
    });
    // Faint floor grid inside the rooms.
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.035 * fade);
    c.beginPath();
    for (let x = 1; x < 12; x++) { c.moveTo(...P(x, 0)); c.lineTo(...P(x, 8)); }
    for (let y = 1; y < 8; y++) { c.moveTo(...P(0, y)); c.lineTo(...P(12, y)); }
    c.stroke();
    const seg = (x1, y1, x2, y2) => [...P(x1, y1), ...P(x2, y2)];
    const walls = [
      seg(0, 0, 12, 0), seg(12, 0, 12, 8), seg(12, 8, 0, 8), seg(0, 8, 0, 0),
      seg(7, 0, 7, 1.2), seg(7, 2.2, 7, 6.2), seg(7, 7.2, 7, 8), seg(0, 5, 1, 5), seg(2, 5, 5, 5), seg(6, 5, 7, 5), seg(4, 5, 4, 8), seg(7, 4, 9, 4), seg(10, 4, 12, 4),
    ];
    c.lineCap = 'square';
    c.lineWidth = Math.max(2, S * 0.14);
    c.strokeStyle = rgba(colors.accent, 0.42 * fade);
    drawPartial(c, walls, phase / 0.38);
    // Doors: the leaf and its swing.
    const doors = [[7, 1.2, 1, Math.PI / 2], [1, 5, 1, 0], [6, 5, 1, Math.PI], [7, 6.2, 1, Math.PI / 2], [9, 4, 1, 0]];
    c.lineWidth = Math.max(1, S * 0.03);
    c.lineCap = 'round';
    doors.forEach(([x, y, r, a], i) => {
      const k = clamp01((phase - 0.55 - i * 0.03) / 0.08) * fade;
      if (!k) return;
      const [cx, cy] = P(x, y);
      const start = flip > 0 ? a : Math.PI - a - Math.PI / 2;
      const open = (Math.PI / 2) * k;
      c.strokeStyle = rgba(colors.text, 0.3 * fade);
      c.beginPath();
      if (flip > 0) c.arc(cx, cy, r * S, start, start + open);
      else c.arc(cx, cy, r * S, start + Math.PI / 2 - open, start + Math.PI / 2);
      c.stroke();
      const end = flip > 0 ? start + open : start + Math.PI / 2 - open;
      c.strokeStyle = rgba(colors.accent, 0.45 * fade);
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(end) * r * S, cy + Math.sin(end) * r * S);
      c.stroke();
    });
  }

  /** An isometric floor with blocks rising and settling like furniture being placed. */
  isometric(c, w, h, time, colors) {
    const n = 10;
    const a = Math.max(w / (2 * n) * 1.2, h / n * 1.15);
    const cx = w / 2;
    const top = h / 2 - (n * a) / 2 + a * 0.6;
    const pt = (u, v, z = 0) => [cx + (u - v) * a, top + (u + v) * a / 2 - z];
    c.lineWidth = Math.max(1, w / 1800) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.07);
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      c.moveTo(...pt(i, 0)); c.lineTo(...pt(i, n));
      c.moveTo(...pt(0, i)); c.lineTo(...pt(n, i));
    }
    c.stroke();
    const quad = (p) => { c.beginPath(); c.moveTo(...p[0]); for (let k = 1; k < p.length; k++) c.lineTo(...p[k]); c.closePath(); c.fill(); c.stroke(); };
    for (let d = 0; d <= 2 * (n - 1); d++) {
      for (let i = Math.max(0, d - n + 1); i <= Math.min(n - 1, d); i++) {
        const j = d - i;
        if (hash(i, j) > 0.3) continue;
        const rise = 0.5 + 0.5 * Math.sin(time * 0.35 + hash(j, i) * 12);
        const H = a * (0.3 + hash(j, i, 3) * 1.4) * (0.35 + 0.65 * rise);
        const i0 = i + 0.14;
        const i1 = i + 0.86;
        const j0 = j + 0.14;
        const j1 = j + 0.86;
        c.strokeStyle = rgba(colors.accent, 0.3);
        c.fillStyle = rgba(colors.text, 0.05);
        quad([pt(i0, j1), pt(i1, j1), pt(i1, j1, H), pt(i0, j1, H)]);
        c.fillStyle = rgba(colors.accent, 0.09);
        quad([pt(i1, j1), pt(i1, j0), pt(i1, j0, H), pt(i1, j1, H)]);
        c.fillStyle = rgba(colors.accent, 0.18);
        quad([pt(i0, j0, H), pt(i1, j0, H), pt(i1, j1, H), pt(i0, j1, H)]);
      }
    }
  }

  /** A wireframe house turning slowly, its edges drawn one after another. */
  wireframe(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 20);
    const fade = fadeInOut(phase, 0.1);
    const turn = time * 0.22;
    const pitch = 0.38;
    const D = 7;
    const f = unit * 0.62 * D / 3.2;
    const project = ([x, y, z]) => {
      const x1 = x * Math.cos(turn) + z * Math.sin(turn);
      const z1 = -x * Math.sin(turn) + z * Math.cos(turn);
      const y0 = y - 0.9;
      // Seen from a little above: further points rise towards the horizon.
      const y2 = y0 * Math.cos(pitch) + z1 * Math.sin(pitch);
      const z2 = -y0 * Math.sin(pitch) + z1 * Math.cos(pitch);
      const s = f / (D + z2);
      return [w / 2 + x1 * s, h / 2 + unit * 0.05 - y2 * s];
    };
    const segs3 = [];
    const e = (a, b) => segs3.push([a, b]);
    const rect3 = (pts) => pts.forEach((p, i) => e(p, pts[(i + 1) % pts.length]));
    const W = 1.1;
    const Dp = 0.75;
    const Ht = 1.1;
    rect3([[-W, 0, -Dp], [W, 0, -Dp], [W, 0, Dp], [-W, 0, Dp]]);
    for (const [x, z] of [[-W, -Dp], [W, -Dp], [W, Dp], [-W, Dp]]) e([x, 0, z], [x, Ht, z]);
    rect3([[-W, Ht, -Dp], [W, Ht, -Dp], [W, Ht, Dp], [-W, Ht, Dp]]);
    e([-W - 0.1, Ht - 0.05, -Dp - 0.12], [-W - 0.1, 1.85, 0]); e([-W - 0.1, Ht - 0.05, Dp + 0.12], [-W - 0.1, 1.85, 0]);
    e([W + 0.1, Ht - 0.05, -Dp - 0.12], [W + 0.1, 1.85, 0]); e([W + 0.1, Ht - 0.05, Dp + 0.12], [W + 0.1, 1.85, 0]);
    e([-W - 0.1, 1.85, 0], [W + 0.1, 1.85, 0]);
    e([-W - 0.1, Ht - 0.05, Dp + 0.12], [W + 0.1, Ht - 0.05, Dp + 0.12]); e([-W - 0.1, Ht - 0.05, -Dp - 0.12], [W + 0.1, Ht - 0.05, -Dp - 0.12]);
    rect3([[-0.2, 0, Dp], [0.2, 0, Dp], [0.2, 0.7, Dp], [-0.2, 0.7, Dp]]);
    rect3([[-0.85, 0.45, Dp], [-0.45, 0.45, Dp], [-0.45, 0.82, Dp], [-0.85, 0.82, Dp]]);
    rect3([[0.45, 0.45, Dp], [0.85, 0.45, Dp], [0.85, 0.82, Dp], [0.45, 0.82, Dp]]);
    rect3([[W, 0.45, -0.3], [W, 0.45, 0.3], [W, 0.82, 0.3], [W, 0.82, -0.3]]);
    rect3([[0.45, 1.45, -0.45], [0.7, 1.45, -0.45], [0.7, 1.45, -0.2], [0.45, 1.45, -0.2]]);
    rect3([[0.45, 2.05, -0.45], [0.7, 2.05, -0.45], [0.7, 2.05, -0.2], [0.45, 2.05, -0.2]]);
    for (const [x, z] of [[0.45, -0.45], [0.7, -0.45], [0.7, -0.2], [0.45, -0.2]]) e([x, 1.45, z], [x, 2.05, z]);
    // The ground grid turns with the house.
    c.lineWidth = Math.max(1, w / 2000);
    c.strokeStyle = rgba(colors.text, 0.06);
    c.beginPath();
    for (let k = -3; k <= 3; k += 0.5) {
      c.moveTo(...project([k, 0, -3])); c.lineTo(...project([k, 0, 3]));
      c.moveTo(...project([-3, 0, k])); c.lineTo(...project([3, 0, k]));
    }
    c.stroke();
    const segs = segs3.map(([a, b]) => [...project(a), ...project(b)]);
    c.lineWidth = Math.max(1, w / 1100) * SIZE;
    c.lineCap = 'round';
    c.strokeStyle = rgba(colors.accent, 0.42 * fade);
    const pen = drawPartial(c, segs, phase / 0.6);
    if (pen) {
      c.fillStyle = rgba(colors.text, 0.45 * fade);
      c.beginPath();
      c.arc(pen[0], pen[1], 2.5 * SIZE, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Window panes of sunlight sliding across the floor as the sun moves, a leaf shadow in them. */
  sunlight(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const sun = warm(colors);
    const sweep = Math.sin(time * 0.05);
    // The beam from the window, top left.
    const beam = c.createLinearGradient(0, 0, w * 0.6, h);
    beam.addColorStop(0, rgba(sun, 0.1));
    beam.addColorStop(1, rgba(sun, 0));
    c.fillStyle = beam;
    c.fillRect(0, 0, w, h);
    const pw = unit * 0.24;
    const ph = unit * 0.2;
    const ox = w * 0.3 + sweep * w * 0.14;
    const oy = h * 0.2;
    const shear = (0.55 + 0.45 * sweep) * pw * 0.9;
    const P = (u, v) => [ox + u * pw + v * shear, oy + v * ph];
    const mull = 0.06;
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (const [grow, alpha] of [[0.06, 0.05], [0, 0.12]]) {
      c.fillStyle = rgba(sun, alpha);
      c.beginPath();
      for (let u = 0; u < 3; u++) {
        for (let v = 0; v < 3; v++) {
          const pts = [P(u + mull - grow, v + mull - grow), P(u + 1 - mull + grow, v + mull - grow), P(u + 1 - mull + grow, v + 1 - mull + grow), P(u + mull - grow, v + 1 - mull + grow)];
          c.moveTo(...pts[0]); for (let k = 1; k < 4; k++) c.lineTo(...pts[k]); c.closePath();
        }
      }
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    // Leaves outside the window, swaying in the light.
    c.fillStyle = rgba(colors.bg, colors.dark ? 0.6 : 0.45);
    for (let k = 0; k < 6; k++) {
      const [lx, ly] = P(0.4 + k * 0.32, 2.3 - (k % 3) * 0.35);
      const turnLeaf = -0.9 + k * 0.35 + Math.sin(time * 0.8 + k) * 0.12;
      c.setTransform(Math.cos(turnLeaf), Math.sin(turnLeaf), -Math.sin(turnLeaf), Math.cos(turnLeaf), lx, ly);
      c.beginPath();
      leafPath(c, unit * 0.12, unit * 0.035);
      c.fill();
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // Skirting line between wall and floor.
    c.strokeStyle = rgba(colors.text, 0.08);
    c.lineWidth = Math.max(1, w / 1600);
    c.beginPath();
    c.moveTo(0, h * 0.14); c.lineTo(w, h * 0.14);
    c.stroke();
  }

  /** Dust motes floating, bright only where they cross a slanted sunbeam. */
  dust(c, w, h, time, colors) {
    const sun = warm(colors);
    const sway = Math.sin(time * 0.05) * w * 0.05;
    const ax = w * 0.22 + sway;
    const bx = w * 0.72 + sway;
    const hw0 = w * 0.07;
    const hw1 = w * 0.2;
    const beam = c.createLinearGradient(0, 0, 0, h);
    beam.addColorStop(0, rgba(sun, 0.12));
    beam.addColorStop(1, rgba(sun, 0.02));
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(ax - hw0, 0); c.lineTo(ax + hw0, 0); c.lineTo(bx + hw1, h); c.lineTo(bx - hw1, h);
    c.closePath();
    c.fill();
    const scale = (w / 1600 + 0.6) * SIZE;
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (const p of this.items) {
      const x = mod(p.x * w + Math.sin(time * 0.17 * (0.5 + p.v) + p.h * 20) * w * 0.03 + time * w * 0.002 * (p.s - 0.5), w);
      const y = mod((p.y + time * 0.006 * (p.v - 0.45)) * h + Math.cos(time * 0.13 * (0.5 + p.s) + p.z * 20) * h * 0.03, h);
      const t = y / h;
      const d = Math.abs(x - (ax + (bx - ax) * t)) / (hw0 + (hw1 - hw0) * t);
      const lit = clamp01(1.25 - d);
      const twinkle = 0.7 + 0.3 * Math.sin(time * (1 + p.h * 2) + p.z * 9);
      c.fillStyle = rgba(lit > 0 ? sun : colors.text, (0.05 + 0.55 * lit * lit) * twinkle);
      c.beginPath();
      c.arc(x, y, (0.6 + p.s * 1.6) * scale * (0.8 + lit * 0.5), 0, Math.PI * 2);
      c.fill();
    }
  }

  /** A woven check: soft bands both ways and a fine twill, drifting like cloth on a table. */
  fabric(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const repeat = unit * 0.42;
    const offX = time * unit * 0.012;
    const offY = time * unit * 0.007;
    const bands = [[0, 0.2, colors.accent, 0.07], [0.27, 0.035, colors.text, 0.06], [0.34, 0.035, colors.text, 0.06], [0.56, 0.11, colors.accent, 0.05], [0.8, 0.02, colors.accent, 0.12]];
    for (const [at, size, hue, alpha] of bands) {
      c.fillStyle = rgba(hue, alpha);
      c.beginPath();
      for (let x = mod(offX, repeat) - repeat; x < w; x += repeat) c.rect(x + at * repeat, 0, size * repeat, h);
      for (let y = mod(offY, repeat) - repeat; y < h; y += repeat) c.rect(0, y + at * repeat, w, size * repeat);
      c.fill();
    }
    const twill = Math.max(4, unit / 110);
    c.lineWidth = Math.max(1, twill * 0.3);
    c.strokeStyle = rgba(colors.text, 0.035);
    c.beginPath();
    for (let x = mod(offX - offY, twill) - h; x < w; x += twill) { c.moveTo(x, 0); c.lineTo(x + h, h); }
    c.stroke();
  }

  /** Planks of wood with flowing grain and knots, sliding slowly past each other. */
  woodgrain(c, w, h, time, colors) {
    const rows = 6;
    const plankH = h / rows;
    const plankL = w * 0.72;
    const stepX = Math.max(4, w / 140);
    const lines = 8;
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    for (let r = 0; r < rows; r++) {
      const top = r * plankH;
      const shift = time * plankL * 0.012 * (r % 2 ? 1 : -1) + hash(r) * plankL;
      const knot0 = plankL * (0.3 + hash(r, 2) * 0.4);
      const knotY = top + plankH * (0.35 + hash(r, 3) * 0.3);
      for (let k = 0; k < lines; k++) {
        const base = top + ((k + 0.5) / lines) * plankH;
        const side = base < knotY ? -1 : 1;
        c.strokeStyle = rgba(k % 3 ? colors.text : colors.accent, k % 3 ? 0.06 : 0.13);
        c.beginPath();
        for (let x = 0; x <= w + stepX; x += stepX) {
          const u = x - shift;
          const kx = knot0 + Math.round((u - knot0) / plankL) * plankL;
          const bump = plankH * 0.22 * Math.exp(-(((u - kx) / (plankH * 0.7)) ** 2)) * side * Math.exp(-Math.abs(base - knotY) / plankH * 2.2);
          const y = base + Math.sin(u / w * Math.PI * 2 * (1 + hash(r, k)) + k * 0.5) * plankH * 0.04 + bump;
          c[x ? 'lineTo' : 'moveTo'](x, y);
        }
        c.stroke();
      }
      // Knots, the plank's top edge and its butt joints.
      c.strokeStyle = rgba(colors.accent, 0.16);
      c.beginPath();
      for (let kx = mod(knot0 + shift, plankL) - plankL; kx < w + plankL; kx += plankL) {
        c.moveTo(kx + plankH * 0.08, knotY);
        c.ellipse(kx, knotY, plankH * 0.08, plankH * 0.045, 0, 0, Math.PI * 2);
      }
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      c.moveTo(0, top); c.lineTo(w, top);
      for (let jx = mod(shift, plankL); jx < w; jx += plankL) { c.moveTo(jx, top); c.lineTo(jx, top + plankH); }
      c.stroke();
    }
  }

  /** Tiles laid one by one across the floor, a new pattern each time. */
  tiles(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const s = unit / 7;
    const gap = Math.max(1.5, s * 0.05);
    const { round, phase } = cycle(time, 20);
    const fade = fadeInOut(phase, 0.1, 0.01);
    const lay = phase / 0.72;
    const cols = Math.ceil(w / s);
    const rows = Math.ceil(h / s);
    const pattern = round % 3;
    const ox = (w - cols * s) / 2;
    const oy = (h - rows * s) / 2;
    c.lineWidth = Math.max(1, w / 1800);
    c.strokeStyle = rgba(colors.text, 0.05);
    c.beginPath();
    for (let i = 0; i <= cols; i++) { c.moveTo(ox + i * s, 0); c.lineTo(ox + i * s, h); }
    for (let j = 0; j <= rows; j++) { c.moveTo(0, oy + j * s); c.lineTo(w, oy + j * s); }
    c.stroke();
    const arcs = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const order = ((i + j) / (cols + rows - 2)) * 0.85 + hash(i, j, round) * 0.15;
        const k = clamp01((lay - order) / 0.06) * fade;
        if (!k) continue;
        const x = ox + i * s + gap / 2;
        const y = oy + j * s + gap / 2 - (1 - k) * s * 0.15;
        const size = s - gap;
        let hue = colors.accent;
        let alpha = 0.1;
        if (pattern === 0) { hue = (i + j) % 2 ? colors.text : colors.accent; alpha = (i + j) % 2 ? 0.05 : 0.13; }
        else if (pattern === 1) alpha = 0.05 + hash(j, i, round) * 0.12;
        else arcs.push([x, y, size, (i % 2) + (j % 2) * 2, k]);
        c.fillStyle = rgba(hue, alpha * k);
        c.fillRect(x, y, size, size);
      }
    }
    // Quarter circles that meet as rings across four tiles.
    if (arcs.length) {
      c.lineWidth = Math.max(1.5, s * 0.06);
      for (const [x, y, size, corner, k] of arcs) {
        const cx = corner % 2 ? x : x + size;
        const cy = corner > 1 ? y : y + size;
        c.strokeStyle = rgba(colors.accent, 0.22 * k);
        c.beginPath();
        c.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
        c.save();
        c.clip(new Path2D(`M${x} ${y}h${size}v${size}h${-size}z`));
        c.stroke();
        c.restore();
      }
    }
  }

  /** Dimension lines stretching out with their extension lines, ticks and lengths. */
  dimensions(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const snap = unit / 12;
    const ext = unit * 0.03;
    const font = Math.round((unit / 52) * Math.min(1.3, SIZE));
    c.font = `${font}px system-ui, "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.lineWidth = Math.max(1, w / 1500) * SIZE;
    c.lineCap = 'round';
    this.items.forEach((p, i) => {
      const period = 9 + p.v * 5;
      const { round, phase } = cycle(time + p.h * period, period);
      const at = (n) => hash(i, round, n);
      // Each line keeps its own lane (a row, or a column for the upright ones), so labels never overlap.
      const across = i % 3 !== 2;
      const lanes = across ? Math.ceil((this.items.length * 2) / 3) : Math.floor(this.items.length / 3);
      const lane = (across ? i - Math.floor(i / 3) : Math.floor(i / 3)) + 0.5;
      const length = Math.round(((0.14 + at(4) * 0.3) * (across ? w : h)) / snap) * snap;
      const x0 = across ? Math.round((0.05 * w + at(1) * (w * 0.9 - length)) / snap) * snap : ((lane + at(1) * 0.3) / lanes) * w * 0.9 + w * 0.05;
      const y0 = across ? ((lane + at(2) * 0.3) / lanes) * h * 0.9 + h * 0.05 : Math.round((0.06 * h + at(2) * (h * 0.88 - length)) / snap) * snap;
      const grow = clamp01(phase / 0.35);
      const alpha = fadeInOut(phase, 0.2, 0.06);
      const len = length * (1 - (1 - grow) ** 3);
      const value = Math.round((len / unit) * 6000 / 10) * 10;
      c.setTransform(...(across ? [1, 0, 0, 1, x0, y0] : [0, -1, 1, 0, x0, y0 + length]));
      c.strokeStyle = rgba(colors.text, 0.16 * alpha);
      c.beginPath();
      c.moveTo(0, ext * 0.4); c.lineTo(0, -ext);
      c.moveTo(len, ext * 0.4); c.lineTo(len, -ext);
      c.stroke();
      c.strokeStyle = rgba(colors.accent, 0.4 * alpha);
      c.beginPath();
      c.moveTo(-ext * 0.3, -ext * 0.6); c.lineTo(len + ext * 0.3, -ext * 0.6);
      const tick = ext * 0.28;
      c.moveTo(-tick, -ext * 0.6 + tick); c.lineTo(tick, -ext * 0.6 - tick);
      c.moveTo(len - tick, -ext * 0.6 + tick); c.lineTo(len + tick, -ext * 0.6 - tick);
      c.stroke();
      if (len > font * 4) {
        c.fillStyle = rgba(colors.text, 0.4 * alpha);
        c.fillText(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ','), len / 2, -ext * 0.6 - font * 0.45);
      }
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = 'start';
  }

  /** Paint chips drifting up, turning a little. */
  swatches(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const palette = [...PAINTS, colors.accent];
    c.lineWidth = Math.max(1, w / 1600);
    for (const p of this.items) {
      const cw = unit * (0.06 + p.s * 0.04) * (SIZE > 1 ? 1.15 : 1);
      const ch = cw * 1.55;
      const x = p.x * w + Math.sin(time * 0.1 + p.h * 9) * w * 0.02;
      const y = h + ch - mod(p.y + time * 0.012 * (0.5 + p.v), 1) * (h + 2 * ch);
      const turn = Math.sin(time * 0.2 + p.h * 7) * 0.3 + (p.z - 0.5) * 0.4;
      c.setTransform(Math.cos(turn), Math.sin(turn), -Math.sin(turn), Math.cos(turn), x, y);
      c.fillStyle = rgba(colors.bg, 0.5);
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      roundRectPath(c, -cw / 2, -ch / 2, cw, ch, cw * 0.06);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(palette[Math.floor(p.z * palette.length) % palette.length], 0.3);
      c.fillRect(-cw / 2 + cw * 0.08, -ch / 2 + cw * 0.08, cw * 0.84, ch * 0.66);
      c.fillStyle = rgba(colors.text, 0.12);
      c.fillRect(-cw / 2 + cw * 0.1, ch * 0.26, cw * 0.5, Math.max(1, ch * 0.03));
      c.fillRect(-cw / 2 + cw * 0.1, ch * 0.35, cw * 0.32, Math.max(1, ch * 0.025));
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Pendant lamps swaying gently, each throwing a cone of light and a pool on the floor. */
  lamps(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const light = warm(colors);
    const n = 5;
    const floor = h * 0.93;
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * w + (hash(i, 1) - 0.5) * w * 0.06;
      const cord = h * (0.16 + hash(i, 2) * 0.22);
      const swing = Math.sin(time * 0.6 * (0.6 + hash(i, 3)) + i * 1.7) * 0.05;
      const breathe = 0.85 + 0.15 * Math.sin(time * 0.4 + i);
      const lx = x + Math.sin(swing) * cord;
      const ly = Math.cos(swing) * cord;
      // Pool of light on the floor.
      const px = lx + Math.sin(swing) * (floor - ly);
      const pr = unit * 0.2;
      const pool = c.createRadialGradient(px, floor, 0, px, floor, pr);
      pool.addColorStop(0, rgba(light, 0.16 * breathe));
      pool.addColorStop(1, rgba(light, 0));
      c.fillStyle = pool;
      c.setTransform(1, 0, 0, 0.25, 0, floor * 0.75);
      c.fillRect(px - pr, floor - pr, pr * 2, pr * 2);
      // The cone, drawn turned with the lamp.
      c.setTransform(Math.cos(swing), -Math.sin(swing), Math.sin(swing), Math.cos(swing), x, 0);
      const shade = unit * 0.05;
      const cone = c.createLinearGradient(0, cord, 0, floor);
      cone.addColorStop(0, rgba(light, 0.13 * breathe));
      cone.addColorStop(1, rgba(light, 0));
      c.fillStyle = cone;
      c.beginPath();
      c.moveTo(-shade * 0.9, cord + shade * 0.5); c.lineTo(shade * 0.9, cord + shade * 0.5);
      c.lineTo(shade * 0.9 + (floor - cord) * 0.35, floor); c.lineTo(-shade * 0.9 - (floor - cord) * 0.35, floor);
      c.closePath();
      c.fill();
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = rgba(colors.text, 0.22);
      c.lineWidth = Math.max(1, w / 1800);
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(0, cord - shade * 0.5);
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.35);
      c.strokeStyle = rgba(colors.accent, 0.5);
      c.beginPath();
      if (i % 2) { c.moveTo(-shade * 0.25, cord - shade * 0.5); c.lineTo(shade * 0.25, cord - shade * 0.5); c.lineTo(shade, cord + shade * 0.5); c.lineTo(-shade, cord + shade * 0.5); c.closePath(); }
      else c.ellipse(0, cord + shade * 0.5, shade, shade, 0, Math.PI, 0);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(light, 0.7 * breathe);
      c.beginPath();
      c.arc(0, cord + shade * 0.55, shade * 0.22, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.globalCompositeOperation = 'source-over';
  }

  /** Two curtains on a rod, their folds swaying in a soft breeze, light through the gap. */
  curtains(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const rodY = h * 0.05;
    const open = 0.07 + 0.03 * Math.sin(time * 0.08);
    const gap = c.createLinearGradient(w * (0.5 - open - 0.05), 0, w * (0.5 + open + 0.05), 0);
    gap.addColorStop(0, rgba(warm(colors), 0));
    gap.addColorStop(0.5, rgba(warm(colors), 0.12));
    gap.addColorStop(1, rgba(warm(colors), 0));
    c.fillStyle = gap;
    c.fillRect(0, rodY, w, h - rodY);
    const folds = 9;
    const stepsY = 24;
    for (const side of [-1, 1]) {
      const inner = w * (0.5 + side * open);
      const outer = side < 0 ? -w * 0.02 : w * 1.02;
      const edge = (k, y) => {
        const t = (y - rodY) / (h - rodY);
        const base = outer + (inner - outer) * (k / folds) * (1 - 0.18 * t * (k / folds));
        return base + (Math.sin(time * 0.5 + k * 0.7 + t * 3) * 0.6 + Math.sin(time * 0.27 + t * 2)) * unit * 0.012 * t;
      };
      for (let k = 0; k < folds; k++) {
        const xa = edge(k, h * 0.5);
        const xb = edge(k + 1, h * 0.5);
        const g = c.createLinearGradient(xa, 0, xb, 0);
        g.addColorStop(0, rgba(colors.accent, 0.04));
        g.addColorStop(0.55, rgba(colors.accent, 0.14));
        g.addColorStop(1, rgba(colors.text, 0.03));
        c.fillStyle = g;
        c.beginPath();
        for (let s = 0; s <= stepsY; s++) { const y = rodY + (s / stepsY) * (h - rodY); c[s ? 'lineTo' : 'moveTo'](edge(k, y), y); }
        for (let s = stepsY; s >= 0; s--) { const y = rodY + (s / stepsY) * (h - rodY); c.lineTo(edge(k + 1, y), y); }
        c.closePath();
        c.fill();
      }
      c.strokeStyle = rgba(colors.text, 0.25);
      c.lineWidth = Math.max(1, unit * 0.004);
      c.beginPath();
      for (let k = 0; k <= folds; k++) { c.moveTo(edge(k, rodY) + unit * 0.008, rodY); c.arc(edge(k, rodY), rodY, unit * 0.008, 0, Math.PI * 2); }
      c.stroke();
    }
    c.strokeStyle = rgba(colors.text, 0.3);
    c.lineWidth = Math.max(2, unit * 0.007);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(w * 0.01, rodY); c.lineTo(w * 0.99, rodY);
    c.stroke();
  }

  /** House plants in the corners, their leaves swaying, and a few leaves drifting down. */
  leaves(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    c.lineCap = 'round';
    const drawLeaf = (x, y, angle, length, hue, alpha) => {
      c.setTransform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), x, y);
      c.fillStyle = rgba(hue, alpha);
      c.strokeStyle = rgba(hue, alpha * 1.6);
      c.beginPath();
      leafPath(c, length, length * 0.32);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(length * 0.85, 0);
      c.stroke();
    };
    const clusters = [[w * 0.06, h, -1.1, 9], [w * 0.95, h, -2.0, 8], [w * 0.55, h, -1.55, 5]];
    clusters.forEach(([bx, by, dir, count], ci) => {
      for (let k = 0; k < count; k++) {
        const spread = (k / (count - 1) - 0.5) * (ci === 2 ? 1.0 : 1.6);
        const length = h * (ci === 2 ? 0.18 : 0.28) * (0.6 + hash(ci, k) * 0.6);
        const sway = Math.sin(time * 0.5 + k * 0.9 + ci) * 0.05;
        const a = dir + spread + sway;
        const tx = bx + Math.cos(a) * length;
        const ty = by + Math.sin(a) * length;
        const bend = Math.sin(time * 0.4 + k) * length * 0.08;
        const mx = bx + Math.cos(a) * length * 0.5 - Math.sin(a) * bend;
        const my = by + Math.sin(a) * length * 0.5 + Math.cos(a) * bend;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.strokeStyle = rgba(k % 2 ? LEAF : colors.accent, 0.25);
        c.beginPath();
        c.moveTo(bx, by); c.quadraticCurveTo(mx, my, tx, ty);
        c.stroke();
        drawLeaf(tx, ty, a + sway * 2, unit * (0.07 + hash(k, ci) * 0.05), k % 2 ? LEAF : colors.accent, 0.16);
      }
    });
    for (const p of this.items) {
      const x = mod(p.x * w + time * w * 0.01 * (0.4 + p.v) + Math.sin(time * 0.6 + p.h * 9) * w * 0.03, w);
      const y = -unit * 0.1 + mod(p.y + time * 0.018 * (0.5 + p.s), 1) * (h + unit * 0.2);
      drawLeaf(x, y, time * (0.3 + p.z * 0.5) + p.h * 6, unit * (0.04 + p.s * 0.03), p.z > 0.5 ? LEAF : colors.accent, 0.14);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Two-point perspective: a building, its floors and windows drawn to vanishing points that slide as the view turns. */
  perspective(c, w, h, time, colors) {
    const horizon = h * 0.5 + Math.sin(time * 0.06) * h * 0.04;
    const turnV = Math.sin(time * 0.07);
    const vl = [w * (0.02 + 0.08 * turnV), horizon];
    const vr = [w * (0.98 + 0.08 * turnV), horizon];
    const x0 = w * (0.5 + 0.12 * turnV);
    const yTop = h * 0.16;
    const yBot = h * 0.86;
    const xl = x0 - (x0 - vl[0]) * 0.55;
    const xr = x0 + (vr[0] - x0) * 0.5;
    const toward = (y, vp, x) => y + (vp[1] - y) * (x - x0) / (vp[0] - x0);
    c.lineWidth = Math.max(1, w / 1800);
    // Horizon and the fan of construction rays.
    c.strokeStyle = rgba(colors.text, 0.1);
    c.beginPath();
    c.moveTo(0, horizon); c.lineTo(w, horizon);
    c.stroke();
    c.setLineDash?.([6, 8]);
    c.strokeStyle = rgba(colors.text, 0.06);
    c.beginPath();
    for (let k = -6; k <= 6; k++) {
      const y = horizon + k * h * 0.12;
      for (const vp of [vl, vr]) { c.moveTo(vp[0], vp[1]); c.lineTo(vp === vl ? w : 0, vp[1] + (y - vp[1]) * (vp === vl ? (w - vp[0]) : vp[0]) / Math.abs(x0 - vp[0])); }
    }
    c.stroke();
    c.setLineDash?.([]);
    const face = (xEnd, vp, alpha) => {
      c.fillStyle = rgba(colors.accent, alpha);
      c.strokeStyle = rgba(colors.accent, 0.42);
      c.lineWidth = Math.max(1, w / 1200) * SIZE;
      c.beginPath();
      c.moveTo(x0, yTop); c.lineTo(xEnd, toward(yTop, vp, xEnd)); c.lineTo(xEnd, toward(yBot, vp, xEnd)); c.lineTo(x0, yBot);
      c.closePath();
      c.fill();
      c.stroke();
      // Floors run to the vanishing point, window columns stand upright.
      c.strokeStyle = rgba(colors.accent, 0.2);
      c.lineWidth = Math.max(1, w / 2000);
      c.beginPath();
      const floors = 7;
      for (let f = 1; f < floors; f++) {
        const y = yTop + ((yBot - yTop) * f) / floors;
        c.moveTo(x0, y); c.lineTo(xEnd, toward(y, vp, xEnd));
      }
      const cols = 6;
      for (let k = 1; k < cols; k++) {
        // Equal steps in depth look shorter further away.
        const t = k / cols;
        const x = x0 + (xEnd - x0) * ((t * 1.4) / (1 + 0.4 * t));
        c.moveTo(x, toward(yTop, vp, x)); c.lineTo(x, toward(yBot, vp, x));
      }
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath();
      c.moveTo(x0, yTop); c.lineTo(vp[0], vp[1]);
      c.moveTo(x0, yBot); c.lineTo(vp[0], vp[1]);
      c.stroke();
    };
    face(xl, vl, 0.06);
    face(xr, vr, 0.12);
    c.fillStyle = rgba(colors.accent, 0.5);
    for (const vp of [vl, vr]) { c.beginPath(); c.arc(vp[0], vp[1], 3 * SIZE, 0, Math.PI * 2); c.fill(); }
  }

  /** A brick wall laid course by course in running bond, then cleared for the next. */
  bricks(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const bw = unit / 6.5;
    const bh = bw / 3;
    const joint = Math.max(1.5, bh * 0.14);
    const { round, phase } = cycle(time, 22);
    const fade = fadeInOut(phase, 0.1, 0.01);
    const cols = Math.ceil(w / bw) + 1;
    const rows = Math.ceil(h / bh);
    const total = cols * rows;
    const laid = (phase / 0.75) * total;
    c.lineWidth = Math.max(1, w / 2000);
    c.strokeStyle = rgba(colors.text, 0.04);
    c.beginPath();
    for (let r = 0; r <= rows; r++) { c.moveTo(0, h - r * bh); c.lineTo(w, h - r * bh); }
    c.stroke();
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? -bw / 2 : 0;
      const y = h - (r + 1) * bh;
      for (let i = 0; i < cols; i++) {
        const col = r % 2 ? cols - 1 - i : i;
        const k = clamp01(laid - (r * cols + i)) * fade;
        if (!k) continue;
        const shade = hash(col, r, round);
        c.fillStyle = rgba(shade > 0.8 ? colors.text : colors.accent, (shade > 0.8 ? 0.06 : 0.07 + shade * 0.1) * k);
        c.fillRect(offset + col * bw + joint / 2, y + joint / 2 - (1 - k) * bh * 0.8, bw - joint, bh - joint);
      }
    }
  }

  /** Chairs, sofas, tables, lamps and plants floating by in outline. */
  furniture(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const size = unit * (0.08 + p.s * 0.07) * (SIZE > 1 ? 1.1 : 1);
      const x = -size + mod(p.x + time * 0.008 * (0.4 + p.v), 1) * (w + 2 * size);
      const y = p.y * h + Math.sin(time * 0.3 * (0.5 + p.v) + p.h * 9) * h * 0.03;
      const turn = Math.sin(time * 0.15 + p.h * 7) * 0.08;
      c.setTransform(size * Math.cos(turn), size * Math.sin(turn), -size * Math.sin(turn), size * Math.cos(turn), x, y);
      c.lineWidth = (Math.max(1, w / 1400) * SIZE) / size;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.fillStyle = rgba(p.z > 0.7 ? colors.text : colors.accent, p.z > 0.7 ? 0.06 : 0.1);
      c.strokeStyle = rgba(colors.accent, 0.38);
      for (const [type, ...v] of FURNITURE[Math.floor(p.h * FURNITURE.length) % FURNITURE.length]) {
        c.beginPath();
        if (type === 'r') roundRectPath(c, v[0], v[1], v[2], v[3], Math.min(v[2], v[3]) * 0.25);
        else if (type === 'e') c.ellipse(v[0], v[1], v[2], v[3], v[4], 0, Math.PI * 2);
        else if (type === 'p') { c.moveTo(v[0], v[1]); for (let k = 2; k < v.length; k += 2) c.lineTo(v[k], v[k + 1]); c.closePath(); }
        else { c.moveTo(v[0], v[1]); c.lineTo(v[2], v[3]); c.stroke(); continue; }
        c.fill();
        c.stroke();
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A site plan with a compass and the sun's paths; the sun crosses the sky and the house's shadow turns. */
  sunpath(c, w, h, time, colors) {
    const R = Math.min(w, h) * 0.42;
    const cx = w / 2;
    const cy = h / 2;
    const lat = (37.5 * Math.PI) / 180;
    const sky = (decl, H) => {
      const east = -Math.cos(decl) * Math.sin(H);
      const north = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.cos(H) * Math.sin(lat);
      const up = Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(H) * Math.cos(lat);
      const alt = Math.asin(Math.max(-1, Math.min(1, up)));
      const az = Math.atan2(east, north);
      const r = R * (1 - alt / (Math.PI / 2));
      return { x: cx + r * Math.sin(az), y: cy - r * Math.cos(az), alt, az };
    };
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.16);
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.moveTo(cx + R * 0.66, cy);
    c.arc(cx, cy, R * 0.66, 0, Math.PI * 2);
    c.moveTo(cx + R * 0.33, cy);
    c.arc(cx, cy, R * 0.33, 0, Math.PI * 2);
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const inner = R * (k % 6 ? 0.97 : 0.93);
      c.moveTo(cx + Math.sin(a) * inner, cy - Math.cos(a) * inner);
      c.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
    }
    c.stroke();
    c.setLineDash?.([4, 6]);
    c.strokeStyle = rgba(colors.text, 0.1);
    c.beginPath();
    c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy);
    c.stroke();
    c.setLineDash?.([]);
    const font = Math.round(R * 0.07);
    c.font = `600 ${font}px system-ui, "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.fillStyle = rgba(colors.accent, 0.5);
    c.fillText('N', cx, cy - R - font * 0.5);
    c.textAlign = 'start';
    // Paths of the solstices and the equinox.
    const tilt = (23.44 * Math.PI) / 180;
    for (const decl of [tilt, 0, -tilt]) {
      const H0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
      c.strokeStyle = rgba(colors.accent, decl ? 0.18 : 0.28);
      c.beginPath();
      for (let s = 0; s <= 48; s++) { const q = sky(decl, -H0 + (2 * H0 * s) / 48); c[s ? 'lineTo' : 'moveTo'](q.x, q.y); }
      c.stroke();
    }
    const decl = tilt * Math.sin(time * 0.025);
    const H0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
    const { phase } = cycle(time, 16);
    const sun = sky(decl, -H0 + 2 * H0 * phase);
    const day = clamp01(Math.sin(phase * Math.PI) * 3);
    // The house, its shadow away from the sun.
    const turn = 0.3;
    const hw = R * 0.16;
    const hd = R * 0.1;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)]);
    const reach = Math.min(R * 0.85, (R * 0.1) / Math.tan(Math.max(0.05, sun.alt)));
    const sx = -Math.sin(sun.az) * reach;
    const sy = Math.cos(sun.az) * reach;
    const hull = convexHull([...corners, ...corners.map(([x, y]) => [x + sx, y + sy])]);
    c.fillStyle = colors.dark ? rgba('#000000', 0.22 * day) : rgba(colors.text, 0.08 * day);
    c.beginPath();
    hull.forEach(([x, y], k) => c[k ? 'lineTo' : 'moveTo'](x, y));
    c.closePath();
    c.fill();
    c.fillStyle = rgba(colors.accent, 0.22);
    c.strokeStyle = rgba(colors.accent, 0.5);
    c.beginPath();
    corners.forEach(([x, y], k) => c[k ? 'lineTo' : 'moveTo'](x, y));
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo((corners[0][0] + corners[3][0]) / 2, (corners[0][1] + corners[3][1]) / 2);
    c.lineTo((corners[1][0] + corners[2][0]) / 2, (corners[1][1] + corners[2][1]) / 2);
    c.stroke();
    const light = warm(colors);
    const glow = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, R * 0.16);
    glow.addColorStop(0, rgba(light, 0.5 * day));
    glow.addColorStop(1, rgba(light, 0));
    c.fillStyle = glow;
    c.fillRect(sun.x - R * 0.16, sun.y - R * 0.16, R * 0.32, R * 0.32);
    c.fillStyle = rgba(light, 0.8 * day);
    c.beginPath();
    c.arc(sun.x, sun.y, R * 0.025, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = rgba(light, 0.25 * day);
    c.beginPath();
    c.moveTo(cx, cy); c.lineTo(sun.x, sun.y);
    c.stroke();
  }

  /** A basket-weave parquet floor with a soft sheen of light gliding over it. */
  parquet(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const S = unit / 5.5;
    const per = 3;
    const gap = Math.max(1, S * 0.015);
    const off = time * unit * 0.01;
    const cols = Math.ceil(w / S) + 2;
    const rows = Math.ceil(h / S) + 2;
    const levels = 6;
    const groups = Array.from({ length: levels }, () => []);
    const grain = [];
    for (let bj = 0; bj < rows; bj++) {
      for (let bi = 0; bi < cols; bi++) {
        const ci = bi + Math.floor(off / S);
        const cj = bj + Math.floor(off / S / 2);
        const bx = (bi - 1) * S - mod(off, S);
        const by = (bj - 1) * S - mod(off / 2, S);
        const across = (ci + cj) % 2 === 0;
        for (let k = 0; k < per; k++) {
          const t = S / per;
          const [x, y, pw, ph] = across ? [bx, by + k * t, S, t] : [bx + k * t, by, t, S];
          const mx = x + pw / 2;
          const my = y + ph / 2;
          const sheen = Math.max(0, Math.cos((mx + my) / (unit * 0.9) - time * 0.35)) ** 6;
          const level = Math.min(levels - 1, Math.floor((hash(ci * 3 + k, cj) * 0.5 + sheen * 0.7) * levels));
          groups[level].push(x + gap, y + gap, pw - gap * 2, ph - gap * 2);
          grain.push(across, x, y, pw, ph, hash(cj, ci * 3 + k));
        }
      }
    }
    groups.forEach((list, level) => {
      if (!list.length) return;
      c.fillStyle = rgba(colors.accent, 0.04 + level * 0.03);
      c.beginPath();
      for (let i = 0; i < list.length; i += 4) c.rect(list[i], list[i + 1], list[i + 2], list[i + 3]);
      c.fill();
    });
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.04);
    c.beginPath();
    for (let i = 0; i < grain.length; i += 6) {
      const [across, x, y, pw, ph, r] = grain.slice(i, i + 6);
      for (const f of [0.3 + r * 0.1, 0.65 + r * 0.1]) {
        if (across) { c.moveTo(x + pw * 0.05, y + ph * f); c.lineTo(x + pw * 0.95, y + ph * f); }
        else { c.moveTo(x + pw * f, y + ph * 0.05); c.lineTo(x + pw * f, y + ph * 0.95); }
      }
    }
    c.stroke();
  }

  /** Contour lines of a site, the ground slowly rising and settling; every fifth line is heavier. */
  contours(c, w, h, time, colors) {
    const cell = Math.max(w, h) / 64;
    const nx = Math.ceil(w / cell) + 1;
    const ny = Math.ceil(h / cell) + 1;
    const hills = Array.from({ length: 6 }, (_, k) => ({
      x: (0.5 + 0.42 * Math.sin(time * 0.02 * (k + 1) + k * 2.1)) * w,
      y: (0.5 + 0.4 * Math.cos(time * 0.017 * (k + 2) + k * 1.3)) * h,
      r: Math.max(w, h) * (0.14 + hash(k, 1) * 0.16),
      a: (k % 3 === 2 ? -0.5 : 1) * (0.6 + hash(k, 2) * 0.6),
    }));
    const f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let v = 0;
        for (const hill of hills) { const dx = i * cell - hill.x; const dy = j * cell - hill.y; v += hill.a * Math.exp(-(dx * dx + dy * dy) / (hill.r * hill.r)); }
        f[j * nx + i] = v;
      }
    }
    const lerp = (a, b, level) => (level - a) / (b - a || 1e-6);
    c.lineJoin = 'round';
    for (let L = -4; L <= 14; L++) {
      const level = L * 0.1;
      const index = L % 5 === 0;
      c.strokeStyle = rgba(index ? colors.accent : colors.text, index ? 0.32 : 0.11);
      c.lineWidth = Math.max(1, w / (index ? 900 : 1700)) * SIZE;
      c.beginPath();
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = f[j * nx + i];
          const b = f[j * nx + i + 1];
          const d = f[(j + 1) * nx + i];
          const e = f[(j + 1) * nx + i + 1];
          const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (e > level ? 2 : 0) | (d > level ? 1 : 0);
          if (code === 0 || code === 15) continue;
          const x = i * cell;
          const y = j * cell;
          const top = [x + cell * lerp(a, b, level), y];
          const right = [x + cell, y + cell * lerp(b, e, level)];
          const bottom = [x + cell * lerp(d, e, level), y + cell];
          const left = [x, y + cell * lerp(a, d, level)];
          const pairs = {
            1: [left, bottom], 2: [bottom, right], 3: [left, right], 4: [top, right], 5: [left, top, bottom, right], 6: [top, bottom], 7: [left, top],
            8: [left, top], 9: [top, bottom], 10: [left, bottom, top, right], 11: [top, right], 12: [left, right], 13: [bottom, right], 14: [left, bottom],
          }[code];
          for (let k = 0; k < pairs.length; k += 2) { c.moveTo(pairs[k][0], pairs[k][1]); c.lineTo(pairs[k + 1][0], pairs[k + 1][1]); }
        }
      }
      c.stroke();
    }
  }
}

// ───────────────────────── production, logistics and traffic scenes (the app's own subject)

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
/** A point `share` (0–1) of the way along a polyline [[x, y], …]. */
function along(points, share) {
  const lens = []; let total = 0;
  for (let i = 1; i < points.length; i++) { const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]); lens.push(l); total += l; }
  let d = mod(share, 1) * total;
  for (let i = 0; i < lens.length; i++) { if (d <= lens[i] || i === lens.length - 1) { const k = lens[i] ? d / lens[i] : 0; return [lerp(points[i][0], points[i + 1][0], k), lerp(points[i][1], points[i + 1][1], k), Math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0])]; } d -= lens[i]; }
  return [points[0][0], points[0][1], 0];
}
const box = (c, x, y, s, fill, stroke) => { c.fillStyle = fill; c.fillRect(x - s / 2, y - s / 2, s, s); if (stroke) { c.strokeStyle = stroke; c.strokeRect(x - s / 2, y - s / 2, s, s); } };
const dot = (c, x, y, r, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const line = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
const PART = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export const FLOW_SCENES = {
  /** Belt conveyors with rollers; cartons ride along and queue at the end of each belt. */
  conveyor(c, w, h, time, colors) {
    const u = Math.min(w, h); const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = h * (0.18 + r * 0.16); const dir = r % 2 ? -1 : 1; const speed = (0.03 + 0.012 * r) * dir;
      c.fillStyle = rgba(colors.text, 0.05); c.fillRect(0, y - u * 0.025, w, u * 0.05);
      c.strokeStyle = rgba(colors.text, 0.12); c.lineWidth = Math.max(1, u / 900);
      const pitch = u * 0.03; const off = mod(time * speed * w, pitch);
      for (let x = -pitch + off; x < w + pitch; x += pitch) line(c, [[x, y - u * 0.025], [x, y + u * 0.025]]);
      for (let k = 0; k < 9; k++) {
        const x = mod(hash(k, r) * w + time * speed * w, w + u * 0.1) - u * 0.05;
        box(c, x, y - u * 0.002, u * 0.034 * SIZE, rgba(PART[(k + r) % PART.length], 0.35), rgba(colors.text, 0.25));
      }
    }
  },
  /** A line of workstations: parts step from station to station; a busy station glows. */
  assembly(c, w, h, time, colors) {
    const n = 6; const y = h * 0.5; const gap = w / (n + 1); const s = Math.min(gap * 0.45, h * 0.16);
    c.strokeStyle = rgba(colors.text, 0.15); c.lineWidth = Math.max(1, s / 30); line(c, [[gap * 0.4, y], [w - gap * 0.4, y]]);
    const cycleLen = 2.4; const { round, phase } = cycle(time, cycleLen);
    for (let i = 0; i < n; i++) {
      const x = gap * (i + 1); const busy = hash(i, round) > 0.3;
      c.fillStyle = rgba(busy ? colors.accent : colors.text, busy ? 0.14 : 0.06); c.strokeStyle = rgba(colors.accent, 0.35);
      c.beginPath(); roundRectPath(c, x - s / 2, y - s / 2, s, s, s * 0.15); c.fill(); c.stroke();
      c.fillStyle = rgba(busy ? '#22c55e' : '#f59e0b', 0.6); c.fillRect(x - s / 2, y - s / 2 - s * 0.1, s * (busy ? 0.4 + 0.6 * phase : 0.2), s * 0.05);
      // The part moving to the next station during the last third of the cycle.
      const k = clamp01((phase - 0.66) / 0.34);
      const px = k > 0 ? lerp(x, x + gap, k) : x;
      box(c, px, y, s * 0.28 * SIZE, rgba(PART[(i + round) % PART.length], 0.55), rgba(colors.text, 0.3));
    }
  },
  /** AGVs on a factory path grid, each leaving a fading trail. */
  agv(c, w, h, time, colors) {
    const cols = 8; const rows = 5; const sx = w / cols; const sy = h / rows;
    c.strokeStyle = rgba(colors.text, 0.08); c.lineWidth = Math.max(1, w / 1400);
    c.setLineDash([sx * 0.08, sx * 0.08]);
    for (let i = 0; i <= cols; i++) line(c, [[i * sx, 0], [i * sx, h]]);
    for (let j = 0; j <= rows; j++) line(c, [[0, j * sy], [w, j * sy]]);
    c.setLineDash([]);
    for (let k = 0; k < 7; k++) {
      // A rectangle loop through grid nodes, different for each vehicle.
      const x0 = Math.floor(hash(k, 1) * (cols - 2)) * sx + sx; const y0 = Math.floor(hash(k, 2) * (rows - 2)) * sy + sy;
      const x1 = Math.min(w - sx * 0.5, x0 + sx * (2 + Math.floor(hash(k, 3) * 3))); const y1 = Math.min(h - sy * 0.5, y0 + sy * (1 + Math.floor(hash(k, 4) * 2)));
      const loop = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      const share = time * (0.025 + hash(k, 5) * 0.02) + hash(k, 6);
      for (let t = 6; t >= 0; t--) { const [x, y] = along(loop, share - t * 0.008); dot(c, x, y, Math.min(sx, sy) * 0.04 * (1 - t / 8) * SIZE, rgba(colors.accent, 0.08 + 0.05 * (6 - t))); }
      const [x, y, a] = along(loop, share);
      c.save(); c.translate(x, y); c.rotate(a);
      const L = Math.min(sx, sy) * 0.22 * SIZE;
      c.fillStyle = rgba(colors.accent, 0.5); c.fillRect(-L / 2, -L / 3, L, L / 1.5);
      c.fillStyle = rgba('#f59e0b', 0.6); c.fillRect(L / 2 - L * 0.12, -L / 3, L * 0.12, L / 1.5);
      c.restore();
    }
  },
  /** Warehouse racks from above: slots fill and empty while a forklift drives the aisles. */
  warehouse(c, w, h, time, colors) {
    const racks = 6; const bays = 14; const rw = w / (racks * 1.8); const bh = (h * 0.8) / bays; const top = h * 0.1;
    for (let r = 0; r < racks; r++) {
      const x = w * 0.08 + r * rw * 1.8;
      for (let b = 0; b < bays; b++) {
        const full = hash(r, b, Math.floor(time / 3 + hash(r, b) * 4)) > 0.45;
        c.strokeStyle = rgba(colors.text, 0.12); c.strokeRect(x, top + b * bh, rw, bh);
        if (full) { c.fillStyle = rgba(PART[(r + b) % PART.length], 0.22); c.fillRect(x + bh * 0.12, top + b * bh + bh * 0.12, rw - bh * 0.24, bh * 0.76); }
      }
      // A forklift in the aisle on the right of this rack.
      const ay = top + mod(time * 0.06 * (r % 2 ? 1 : -1) + hash(r, 9), 1) * h * 0.8;
      const ax = x + rw * 1.4;
      c.fillStyle = rgba('#f59e0b', 0.5); c.fillRect(ax - rw * 0.18 * SIZE, ay - bh * 0.4, rw * 0.36 * SIZE, bh * 0.8);
    }
  },
  /** A road grid with cars, the traffic lights changing at each junction. */
  traffic(c, w, h, time, colors) {
    const vx = [w * 0.3, w * 0.7]; const hy = [h * 0.35, h * 0.72]; const lane = Math.min(w, h) * 0.035;
    c.fillStyle = rgba(colors.text, 0.06);
    for (const x of vx) c.fillRect(x - lane * 1.2, 0, lane * 2.4, h);
    for (const y of hy) c.fillRect(0, y - lane * 1.2, w, lane * 2.4);
    c.strokeStyle = rgba(colors.text, 0.18); c.setLineDash([lane, lane]); c.lineWidth = Math.max(1, lane / 12);
    for (const x of vx) line(c, [[x, 0], [x, h]]); for (const y of hy) line(c, [[0, y], [w, y]]);
    c.setLineDash([]);
    const ew = mod(time, 8) < 4; // east-west green for 4 s, then north-south
    for (const x of vx) for (const y of hy) {
      dot(c, x - lane * 1.6, y - lane * 1.6, lane * 0.28, rgba(ew ? '#22c55e' : '#ef4444', 0.75));
      dot(c, x + lane * 1.6, y + lane * 1.6, lane * 0.28, rgba(ew ? '#ef4444' : '#22c55e', 0.75));
    }
    const car = (x, y, a, k) => { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = rgba(PART[k % PART.length], 0.55); c.fillRect(-lane * 0.7 * SIZE, -lane * 0.35 * SIZE, lane * 1.4 * SIZE, lane * 0.7 * SIZE); c.restore(); };
    for (let k = 0; k < 10; k++) {
      const y = hy[k % 2] + (k % 4 < 2 ? -lane * 0.6 : lane * 0.6); const dir = k % 4 < 2 ? 1 : -1;
      let x = mod(hash(k, 1) * w + time * w * 0.06 * dir, w + lane * 4) - lane * 2;
      if (!ew) for (const sx of vx) { const stop = sx - dir * lane * 2.4; if (dir > 0 ? x > stop - lane * 3 && x < stop : x < stop + lane * 3 && x > stop) x = stop - dir * lane * (k % 3); }
      car(x, y, dir > 0 ? 0 : Math.PI, k);
      const x2 = vx[k % 2] + (k % 4 < 2 ? lane * 0.6 : -lane * 0.6); const dir2 = k % 4 < 2 ? 1 : -1;
      let y2 = mod(hash(k, 7) * h + time * h * 0.07 * dir2, h + lane * 4) - lane * 2;
      if (ew) for (const sy of hy) { const stop = sy - dir2 * lane * 2.4; if (dir2 > 0 ? y2 > stop - lane * 3 && y2 < stop : y2 < stop + lane * 3 && y2 > stop) y2 = stop - dir2 * lane * (k % 3); }
      car(x2, y2, dir2 > 0 ? Math.PI / 2 : -Math.PI / 2, k + 2);
    }
  },
  /** Rail lines with sleepers; trains run through and stop at the stations. */
  rail(c, w, h, time, colors) {
    const tracks = [h * 0.3, h * 0.55, h * 0.8]; const g = Math.min(w, h) * 0.012;
    tracks.forEach((y, i) => {
      c.strokeStyle = rgba(colors.text, 0.1); c.lineWidth = g * 0.6;
      for (let x = mod(-time * 0, g * 4); x < w; x += g * 4) line(c, [[x, y - g * 1.6], [x, y + g * 1.6]]);
      c.strokeStyle = rgba(colors.text, 0.22); c.lineWidth = Math.max(1, g * 0.3); line(c, [[0, y - g], [w, y - g]]); line(c, [[0, y + g], [w, y + g]]);
      c.fillStyle = rgba(colors.accent, 0.12); c.fillRect(w * (0.35 + i * 0.12), y - g * 5, w * 0.12, g * 2.4);
      const period = 14 + i * 3; const { phase } = cycle(time + i * 5, period);
      // Slows down into the station, waits, leaves.
      const st = 0.35 + i * 0.12 + 0.06; const k = phase < 0.4 ? (phase / 0.4) * st : phase < 0.55 ? st : st + ((phase - 0.55) / 0.45) * (1.3 - st);
      const head = -0.15 + k * 1.2;
      for (let car = 0; car < 5; car++) { const x = (head - car * 0.045) * w; c.fillStyle = rgba(car ? colors.accent : '#ef4444', car ? 0.35 : 0.5); c.fillRect(x, y - g * 2, w * 0.04, g * 4); }
    });
  },
  /** People walking from the entrances to turnstiles and on to the platforms. */
  pedestrians(c, w, h, time, colors) {
    const gates = 5; const gy = h * 0.5;
    for (let i = 0; i < gates; i++) { const x = w * (0.2 + i * 0.15); c.strokeStyle = rgba(colors.accent, 0.35); c.lineWidth = Math.max(1, w / 700); line(c, [[x - w * 0.02, gy], [x + w * 0.02, gy]]); }
    for (let k = 0; k < 140; k++) {
      const g = k % gates; const gx = w * (0.2 + g * 0.15); const sx = hash(k, 1) * w; const ex = gx + (hash(k, 2) - 0.5) * w * 0.3;
      const p = mod(time * (0.04 + hash(k, 3) * 0.04) + hash(k, 4), 1);
      const x = p < 0.5 ? lerp(sx, gx, p / 0.5) : lerp(gx, ex, (p - 0.5) / 0.5);
      const y = p < 0.5 ? lerp(h * 0.02, gy - h * 0.02, p / 0.5) : lerp(gy + h * 0.02, h * 0.98, (p - 0.5) / 0.5);
      dot(c, x, y, Math.min(w, h) * 0.006 * SIZE, rgba(p < 0.5 ? colors.text : colors.accent, 0.35));
    }
  },
  /** A process network: blocks joined by links, tokens travelling from block to block. */
  network(c, w, h, time, colors) {
    const nodes = [[0.12, 0.5], [0.3, 0.3], [0.3, 0.7], [0.5, 0.5], [0.68, 0.32], [0.68, 0.68], [0.86, 0.5]].map(([x, y]) => [x * w, y * h]);
    const links = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]];
    const s = Math.min(w, h) * 0.07;
    c.strokeStyle = rgba(colors.text, 0.15); c.lineWidth = Math.max(1, s / 25);
    for (const [a, b] of links) line(c, [nodes[a], nodes[b]]);
    links.forEach(([a, b], i) => { for (let k = 0; k < 3; k++) { const p = mod(time * 0.18 + k / 3 + hash(i), 1); dot(c, lerp(nodes[a][0], nodes[b][0], p), lerp(nodes[a][1], nodes[b][1], p), s * 0.08 * SIZE, rgba(PART[(i + k) % PART.length], 0.6)); } });
    nodes.forEach(([x, y], i) => { c.fillStyle = rgba(colors.bg, 1); c.strokeStyle = rgba(colors.accent, 0.45); c.beginPath(); roundRectPath(c, x - s / 2, y - s / 2.6, s, s / 1.3, s * 0.15); c.fill(); c.stroke(); c.fillStyle = rgba(colors.accent, 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(time * 1.5 + i))); c.fill(); });
  },
  /** Material flows as bands (a Sankey diagram) with particles drifting along them. */
  sankey(c, w, h, time, colors) {
    const bands = [[0.2, 0.35, 0.12], [0.2, 0.62, 0.08], [0.45, 0.25, 0.06], [0.45, 0.5, 0.1], [0.45, 0.78, 0.05]];
    bands.forEach(([y0, y1, th], i) => {
      const a = h * y0 + i * h * 0.12; const b = h * y1; const t = h * th;
      c.fillStyle = rgba(PART[i % PART.length], 0.1);
      c.beginPath(); c.moveTo(0, a - t / 2); c.bezierCurveTo(w * 0.5, a - t / 2, w * 0.5, b - t / 2, w, b - t / 2); c.lineTo(w, b + t / 2); c.bezierCurveTo(w * 0.5, b + t / 2, w * 0.5, a + t / 2, 0, a + t / 2); c.closePath(); c.fill();
      for (let k = 0; k < 16; k++) {
        const p = mod(time * 0.05 + hash(i, k), 1); const q = p * p * (3 - 2 * p);
        const y = lerp(a, b, q) + (hash(k, i, 2) - 0.5) * t * 0.8;
        dot(c, p * w, y, Math.min(w, h) * 0.004 * SIZE, rgba(PART[i % PART.length], 0.5));
      }
    });
  },
  /** A Gantt chart of machines: jobs grow along the time line, the now-line sweeps across. */
  gantt(c, w, h, time, colors) {
    const rows = 8; const top = h * 0.12; const rh = (h * 0.76) / rows; const { round, phase } = cycle(time, 18);
    const now = w * (0.08 + phase * 0.86);
    for (let r = 0; r < rows; r++) {
      const y = top + r * rh;
      c.fillStyle = rgba(colors.text, r % 2 ? 0.03 : 0.05); c.fillRect(0, y, w, rh);
      let x = w * 0.08 + hash(r, round) * w * 0.05;
      for (let j = 0; x < w * 0.94; j++) {
        const len = w * (0.04 + hash(r, j, round) * 0.1); const end = Math.min(x + len, now);
        if (end > x) { c.fillStyle = rgba(PART[(r + j) % PART.length], 0.35); c.fillRect(x, y + rh * 0.2, end - x, rh * 0.6); }
        x += len + w * 0.01 * hash(j, r);
      }
    }
    c.strokeStyle = rgba('#ef4444', 0.45); c.lineWidth = Math.max(1, w / 900); line(c, [[now, top - h * 0.03], [now, top + rows * rh + h * 0.03]]);
  },
  /** Meshing gears turning. */
  gears(c, w, h, time, colors) {
    const u = Math.min(w, h);
    const gearAt = (x, y, r, teeth, a, color) => {
      c.save(); c.translate(x, y); c.rotate(a); c.beginPath();
      for (let i = 0; i < teeth * 2; i++) { const rr = i % 2 ? r * 0.82 : r; const t0 = (i / (teeth * 2)) * TAU; const t1 = ((i + 1) / (teeth * 2)) * TAU; c.lineTo(Math.cos(t0) * rr, Math.sin(t0) * rr); c.lineTo(Math.cos(t1) * rr, Math.sin(t1) * rr); }
      c.closePath(); c.fillStyle = rgba(color, 0.08); c.fill(); c.strokeStyle = rgba(color, 0.3); c.lineWidth = Math.max(1, u / 700); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.22, 0, TAU); c.stroke(); c.restore();
    };
    const R = u * 0.2; const r = R * 0.6;
    gearAt(w * 0.4, h * 0.5, R, 18, time * 0.25, colors.accent);
    gearAt(w * 0.4 + R + r * 0.8, h * 0.5 - r * 0.4, r, 11, -time * 0.25 * (18 / 11) + 0.1, colors.text);
    gearAt(w * 0.4 - R - r * 0.75, h * 0.5 + r * 0.7, r, 11, -time * 0.25 * (18 / 11), colors.text);
    gearAt(w * 0.82, h * 0.25, R * 0.7, 14, time * 0.12, colors.accent);
  },
  /** Pipes with liquid flowing (dashes) between tanks whose levels rise and fall. */
  pipes(c, w, h, time, colors) {
    const tanks = [[0.15, 0.6], [0.45, 0.4], [0.75, 0.62]]; const tw = w * 0.1; const th = h * 0.36;
    c.lineWidth = Math.min(w, h) * 0.02; c.strokeStyle = rgba(colors.text, 0.1);
    const pipe = [[w * 0.15 + tw / 2, h * 0.7], [w * 0.3, h * 0.7], [w * 0.3, h * 0.5], [w * 0.45 - tw / 2, h * 0.5]];
    const pipe2 = [[w * 0.45 + tw / 2, h * 0.5], [w * 0.6, h * 0.5], [w * 0.6, h * 0.72], [w * 0.75 - tw / 2, h * 0.72]];
    for (const p of [pipe, pipe2]) { c.strokeStyle = rgba(colors.text, 0.1); c.lineWidth = Math.min(w, h) * 0.02; c.setLineDash([]); line(c, p); c.strokeStyle = rgba('#0ea5e9', 0.45); c.lineWidth = Math.min(w, h) * 0.008; c.setLineDash([12, 14]); c.lineDashOffset = -time * 40; line(c, p); }
    c.setLineDash([]); c.lineDashOffset = 0;
    tanks.forEach(([x, y], i) => {
      const lvl = 0.5 + 0.35 * Math.sin(time * 0.4 + i * 2);
      const X = x * w - tw / 2; const Y = y * h - th / 2;
      c.strokeStyle = rgba(colors.text, 0.25); c.lineWidth = Math.max(1, w / 900); c.strokeRect(X, Y, tw, th);
      c.fillStyle = rgba('#0ea5e9', 0.22); c.fillRect(X, Y + th * (1 - lvl), tw, th * lvl);
      c.strokeStyle = rgba('#0ea5e9', 0.5); line(c, [[X, Y + th * (1 - lvl) + Math.sin(time * 3) * 2], [X + tw, Y + th * (1 - lvl) - Math.sin(time * 3) * 2]]);
    });
  },
  /** Stocks and flows: three stocks whose levels follow a feedback loop, with the loop arrows. */
  stocks(c, w, h, time, colors) {
    const xs = [0.22, 0.5, 0.78]; const bw = w * 0.13; const bh = h * 0.3; const y = h * 0.45;
    const lv = [0.5 + 0.4 * Math.sin(time * 0.3), 0.5 + 0.4 * Math.sin(time * 0.3 - 1.4), 0.5 + 0.4 * Math.sin(time * 0.3 - 2.8)];
    xs.forEach((x, i) => {
      const X = x * w - bw / 2; c.strokeStyle = rgba(colors.accent, 0.4); c.lineWidth = Math.max(1.5, w / 700); c.strokeRect(X, y - bh / 2, bw, bh);
      c.fillStyle = rgba(colors.accent, 0.16); c.fillRect(X, y + bh / 2 - bh * lv[i], bw, bh * lv[i]);
      if (i < 2) { const a = x * w + bw / 2; const b = xs[i + 1] * w - bw / 2; c.strokeStyle = rgba(colors.text, 0.25); line(c, [[a, y], [b, y]]); const vx = (a + b) / 2; c.beginPath(); c.moveTo(vx - 8, y - 10); c.lineTo(vx + 8, y + 10); c.moveTo(vx + 8, y - 10); c.lineTo(vx - 8, y + 10); c.stroke(); }
    });
    c.strokeStyle = rgba(colors.text, 0.18); c.setLineDash([6, 8]); c.lineDashOffset = -time * 20;
    c.beginPath(); c.moveTo(xs[2] * w, y - bh / 2); c.bezierCurveTo(xs[2] * w, h * 0.08, xs[0] * w, h * 0.08, xs[0] * w, y - bh / 2); c.stroke();
    c.setLineDash([]); c.lineDashOffset = 0;
  },
  /** A supply network: plants, warehouses and shops, shipments moving along curved routes. */
  supply(c, w, h, time, colors) {
    const sites = [[0.1, 0.3], [0.12, 0.72], [0.45, 0.5], [0.8, 0.18], [0.85, 0.5], [0.78, 0.82]].map(([x, y]) => [x * w, y * h]);
    const routes = [[0, 2], [1, 2], [2, 3], [2, 4], [2, 5]];
    routes.forEach(([a, b], i) => {
      const [x0, y0] = sites[a]; const [x1, y1] = sites[b]; const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2 - h * 0.12;
      c.strokeStyle = rgba(colors.text, 0.12); c.lineWidth = Math.max(1, w / 900); c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke();
      for (let k = 0; k < 3; k++) { const p = mod(time * 0.08 + k / 3 + hash(i), 1); const x = (1 - p) ** 2 * x0 + 2 * (1 - p) * p * mx + p * p * x1; const y = (1 - p) ** 2 * y0 + 2 * (1 - p) * p * my + p * p * y1; box(c, x, y, Math.min(w, h) * 0.018 * SIZE, rgba(PART[i % PART.length], 0.55)); }
    });
    sites.forEach(([x, y], i) => dot(c, x, y, Math.min(w, h) * (i === 2 ? 0.035 : 0.022), rgba(i === 2 ? colors.accent : colors.text, 0.3)));
  },
  /** A utilization heat map of a factory floor, cells warming and cooling. */
  heatmap(c, w, h, time, colors) {
    const cols = 24; const rows = 14; const cw = w / cols; const ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const v = 0.5 + 0.5 * Math.sin(time * 0.35 + i * 0.45 + Math.sin(j * 0.6 + time * 0.2) * 2);
      const color = v > 0.8 ? '#ef4444' : v > 0.6 ? '#f59e0b' : v > 0.35 ? '#22c55e' : '#3b82f6';
      c.fillStyle = rgba(color, 0.05 + v * 0.1); c.fillRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
    }
  },
  /** Queues forming in front of service desks and being served. */
  queues(c, w, h, time, colors) {
    const desks = 4; const r = Math.min(w, h) * 0.012 * SIZE;
    for (let d = 0; d < desks; d++) {
      const x = w * (0.2 + d * 0.2); const deskY = h * 0.25;
      c.fillStyle = rgba(colors.accent, 0.22); c.fillRect(x - w * 0.05, deskY - h * 0.03, w * 0.1, h * 0.04);
      const len = Math.round(4 + 6 * (0.5 + 0.5 * Math.sin(time * 0.3 + d * 1.7)));
      const step = mod(time * 0.6 + d, 1);
      for (let k = 0; k < len; k++) dot(c, x, deskY + h * 0.06 + (k + 1 - step) * r * 3.2, r, rgba(PART[(k + d) % PART.length], 0.45));
      dot(c, x + step * w * 0.08, deskY - h * 0.08 - step * h * 0.1, r, rgba(colors.text, 0.3 * (1 - step)));
    }
  },
  /** Robot arms picking boxes from one belt and placing them on another. */
  robots(c, w, h, time, colors) {
    const arms = 3; const u = Math.min(w, h);
    c.fillStyle = rgba(colors.text, 0.06); c.fillRect(0, h * 0.72, w, u * 0.04); c.fillRect(0, h * 0.28, w, u * 0.04);
    for (let i = 0; i < arms; i++) {
      const bx = w * (0.25 + i * 0.25); const by = h * 0.5; const L1 = u * 0.17; const L2 = u * 0.15;
      const p = 0.5 + 0.5 * Math.sin(time * 1.1 + i * 2);
      const a1 = lerp(-1.1, -2.05, p); const a2 = lerp(1.6, -1.6, p);
      const ex = bx + Math.cos(a1) * L1; const ey = by + Math.sin(a1) * L1;
      const tx = ex + Math.cos(a1 + a2) * L2; const ty = ey + Math.sin(a1 + a2) * L2;
      c.strokeStyle = rgba(colors.accent, 0.45); c.lineWidth = u * 0.018; c.lineCap = 'round'; line(c, [[bx, by], [ex, ey], [tx, ty]]); c.lineCap = 'butt';
      dot(c, bx, by, u * 0.03, rgba(colors.text, 0.2)); dot(c, ex, ey, u * 0.014, rgba(colors.text, 0.3));
      box(c, tx, ty + u * 0.02, u * 0.035 * SIZE, rgba(PART[i % PART.length], 0.45));
    }
  },
  /** A container yard: stacks of containers, a gantry crane moving and lifting. */
  containers(c, w, h, time, colors) {
    const cols = 10; const cw = w / (cols + 2); const chh = h * 0.07;
    for (let i = 0; i < cols; i++) {
      const n = 1 + Math.floor(hash(i, Math.floor(time / 6)) * 4);
      for (let k = 0; k < n; k++) { c.fillStyle = rgba(PART[(i + k) % PART.length], 0.22); c.fillRect(cw * (i + 1) + 2, h * 0.85 - (k + 1) * chh, cw - 4, chh - 3); }
    }
    const gx = w * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.25)));
    c.strokeStyle = rgba(colors.accent, 0.4); c.lineWidth = Math.max(2, w / 500);
    line(c, [[gx - cw, h * 0.88], [gx - cw, h * 0.2], [gx + cw, h * 0.2], [gx + cw, h * 0.88]]);
    const ly = h * (0.32 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.9)));
    c.lineWidth = Math.max(1, w / 1200); line(c, [[gx, h * 0.2], [gx, ly]]);
    c.fillStyle = rgba('#f59e0b', 0.45); c.fillRect(gx - cw * 0.45, ly, cw * 0.9, chh * 0.9);
  },
  /** Live charts: a throughput line drawing itself and a histogram rising. */
  charts(c, w, h, time, colors) {
    const { phase } = cycle(time, 14);
    const L = w * 0.08; const R = w * 0.56; const T = h * 0.2; const B = h * 0.8;
    c.strokeStyle = rgba(colors.text, 0.12); c.lineWidth = Math.max(1, w / 1200);
    for (let i = 0; i <= 4; i++) line(c, [[L, lerp(T, B, i / 4)], [R, lerp(T, B, i / 4)]]);
    c.strokeStyle = rgba(colors.accent, 0.5); c.lineWidth = Math.max(1.5, w / 600) * SIZE;
    const n = Math.floor(phase * 120);
    c.beginPath();
    for (let i = 0; i <= n; i++) { const x = lerp(L, R, i / 120); const y = lerp(B, T, 0.4 + 0.25 * Math.sin(i * 0.15) + 0.1 * Math.sin(i * 0.53) + 0.05 * hash(i)); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    const bars = 12; const hx = w * 0.62; const hw = (w * 0.3) / bars;
    for (let i = 0; i < bars; i++) { const v = Math.exp(-((i - 5) ** 2) / 8) * clamp01(phase * 1.6 - i * 0.03); c.fillStyle = rgba(PART[i % PART.length], 0.3); c.fillRect(hx + i * hw + 2, B - v * (B - T), hw - 4, v * (B - T)); }
  },
  /** Agents on a map: an epidemic spreading by contact (susceptible, infected, recovered). */
  agents(c, w, h, time, colors) {
    const n = 220; const { round, phase } = cycle(time, 20);
    for (let k = 0; k < n; k++) {
      const x = mod(hash(k, 1) * w + Math.sin(time * 0.3 + k) * w * 0.03 + time * (hash(k, 2) - 0.5) * w * 0.02, w);
      const y = mod(hash(k, 3) * h + Math.cos(time * 0.27 + k) * h * 0.03, h);
      const d = Math.hypot(x / w - 0.5, y / h - 0.5) + hash(k, round) * 0.1;
      const front = phase * 0.9;
      const color = d < front - 0.25 ? '#22c55e' : d < front ? '#ef4444' : '#3b82f6';
      dot(c, x, y, Math.min(w, h) * 0.006 * SIZE, rgba(color, 0.45));
    }
  },
};

Object.assign(AnimatedBackground.prototype, FLOW_SCENES);
