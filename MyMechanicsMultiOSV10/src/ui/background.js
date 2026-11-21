// Moving backgrounds for the start page and (faintly) behind the views: twenty quiet scenes from the
// world of interiors and architecture (the list is ANIMATIONS in settings): a blueprint being drafted,
// a floor plan tracing in, isometric blocks, a wireframe house, sunlight through a window, dust in a
// sunbeam, fabric, wood grain, tiles being laid, dimension lines, paint chips, pendant lamps, rain on a window,
// leaves, two-point perspective, a brick wall, furniture silhouettes, a sun path, parquet and site
// contours — and twenty from mechanical design: gears in mesh, an inline four's pistons, a CNC toolpath,
// an FEA stress plot, a tessellated mesh, an exploded assembly, sheet metal bending, a weld bead, a 3D
// print, nuts on bolts, ball bearings, springs, a cam and follower, conveyors, triads around a view cube,
// GD&T frames, laser cutting, a helix sweep, a section view, a fan rotor, a four-bar linkage and a chain drive. Colours follow the theme (a
// warm light is mixed in where the scene needs sunlight, an arc or a laser). The
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

// ── helpers of the mechanical scenes (gears, pistons, toolpaths, bearings …)
const TAU = Math.PI * 2;
/** Eases 0–1 in and out. */
const smooth = (t) => { const v = clamp01(t); return v * v * (3 - 2 * v); };
/** A colour between two hex colours (t 0–1), as hex. */
function mixHex(a, b, t) {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return `#${p.map((v, i) => Math.round(v + (q[i] - v) * clamp01(t)).toString(16).padStart(2, '0')).join('')}`;
}
/** A finite-element result's legend, blue (low) to red (high), muted so it sits behind the cards. */
const STRESS_STOPS = ['#3f6fd8', '#3ba7c4', '#55b06a', '#d8b43c', '#d8603c'];
const STRESS = Array.from({ length: 10 }, (_, k) => {
  const t = (k / 9) * (STRESS_STOPS.length - 1);
  const i = Math.min(STRESS_STOPS.length - 2, Math.floor(t));
  return mixHex(STRESS_STOPS[i], STRESS_STOPS[i + 1], t - i);
});
/** X, Y and Z of the coordinate triads (red, green, blue, softened). */
const AXIS = ['#d0584e', '#4f9a49', '#4c72cc'];
const MONO = 'ui-monospace, Consolas, "Cascadia Mono", monospace';
const SANS = 'system-ui, "Segoe UI", sans-serif';

/** A spur gear's outline (z teeth, module m) turned by `angle`: tooth k is centred at angle + k·2π/z. */
function gearPath(c, cx, cy, z, m, angle) {
  const r = (m * z) / 2;
  const ra = r + m;
  const rf = r - 1.25 * m;
  const p = TAU / z;
  for (let k = 0; k < z; k++) {
    const a = angle + k * p;
    const pts = [[rf, a - 0.5 * p], [rf, a - 0.31 * p], [r, a - 0.235 * p], [ra, a - 0.14 * p], [ra, a + 0.14 * p], [r, a + 0.235 * p], [rf, a + 0.31 * p]];
    for (let i = 0; i < pts.length; i++) {
      const x = cx + Math.cos(pts[i][1]) * pts[i][0];
      const y = cy + Math.sin(pts[i][1]) * pts[i][0];
      if (!k && !i) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }
  c.closePath();
}

/** Adds a closed (or open) polyline to the current path. */
function polyPath(c, pts, close = true) {
  if (!pts.length) return;
  c.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
  if (close) c.closePath();
}

/** A rounded rectangle as points, clockwise from the top edge (the path a cutter or a laser follows). */
function roundRectPoly(x, y, w, h, r, n = 6) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts = [[x + rr, y]];
  const corners = [[x + w - rr, y + rr, -Math.PI / 2], [x + w - rr, y + h - rr, 0], [x + rr, y + h - rr, Math.PI / 2], [x + rr, y + rr, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= (rr ? n : 0); k++) { const a = a0 + (k / n) * (Math.PI / 2); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  }
  pts.push([x + rr, y]);
  return pts;
}

const circlePoly = (cx, cy, r, n = 32, start = 0) => Array.from({ length: n + 1 }, (_, k) => [cx + Math.cos(start + (k / n) * TAU) * r, cy + Math.sin(start + (k / n) * TAU) * r]);
/** Consecutive points as segments [x1, y1, x2, y2]. */
const polySegs = (pts) => pts.slice(1).map((p, k) => [pts[k][0], pts[k][1], p[0], p[1]]);
const segLength = (s) => Math.hypot(s[2] - s[0], s[3] - s[1]);

/** An arrowhead at (x, y) pointing along `angle`. */
function arrowHead(c, x, y, angle, size) {
  c.moveTo(x, y);
  c.lineTo(x - Math.cos(angle - 0.4) * size, y - Math.sin(angle - 0.4) * size);
  c.lineTo(x - Math.cos(angle + 0.4) * size, y - Math.sin(angle + 0.4) * size);
  c.closePath();
}

/** Draws one geometric-tolerance symbol centred at (x, y), `s` the cell's height. */
function gdtSymbol(c, type, x, y, s) {
  const k = s * 0.3;
  c.beginPath();
  switch (type) {
    case 'position': c.moveTo(x + k * 0.75, y); c.arc(x, y, k * 0.75, 0, TAU); c.moveTo(x - k * 1.15, y); c.lineTo(x + k * 1.15, y); c.moveTo(x, y - k * 1.15); c.lineTo(x, y + k * 1.15); break;
    case 'flatness': c.moveTo(x - k, y + k * 0.55); c.lineTo(x - k * 0.4, y - k * 0.55); c.lineTo(x + k, y - k * 0.55); c.lineTo(x + k * 0.4, y + k * 0.55); c.closePath(); break;
    case 'perpendicularity': c.moveTo(x - k, y + k * 0.8); c.lineTo(x + k, y + k * 0.8); c.moveTo(x, y + k * 0.8); c.lineTo(x, y - k); break;
    case 'parallelism': c.moveTo(x - k * 0.75, y + k); c.lineTo(x - k * 0.05, y - k); c.moveTo(x + k * 0.05, y + k); c.lineTo(x + k * 0.75, y - k); break;
    case 'circularity': c.moveTo(x + k * 0.85, y); c.arc(x, y, k * 0.85, 0, TAU); break;
    case 'cylindricity': c.moveTo(x + k * 0.65, y); c.arc(x, y, k * 0.65, 0, TAU); c.moveTo(x - k * 1.05, y + k); c.lineTo(x - k * 0.2, y - k); c.moveTo(x + k * 0.2, y + k); c.lineTo(x + k * 1.05, y - k); break;
    case 'profile': c.moveTo(x - k, y + k * 0.5); c.arc(x, y + k * 0.5, k, Math.PI, 0); c.closePath(); break;
    case 'angularity': c.moveTo(x + k, y + k * 0.8); c.lineTo(x - k, y + k * 0.8); c.lineTo(x + k * 0.7, y - k * 0.8); break;
    case 'concentricity': c.moveTo(x + k * 0.9, y); c.arc(x, y, k * 0.9, 0, TAU); c.moveTo(x + k * 0.45, y); c.arc(x, y, k * 0.45, 0, TAU); break;
    case 'symmetry': c.moveTo(x - k, y); c.lineTo(x + k, y); c.moveTo(x - k * 0.6, y - k * 0.55); c.lineTo(x + k * 0.6, y - k * 0.55); c.moveTo(x - k * 0.6, y + k * 0.55); c.lineTo(x + k * 0.6, y + k * 0.55); break;
    case 'runout': c.moveTo(x - k * 0.6, y + k); c.lineTo(x + k * 0.6, y - k); c.moveTo(x + k * 0.6, y - k); c.lineTo(x + k * 0.05, y - k * 0.85); c.moveTo(x + k * 0.6, y - k); c.lineTo(x + k * 0.45, y - k * 0.45); break;
    default: c.moveTo(x - k, y); c.lineTo(x + k, y);
  }
  c.stroke();
}
const GDT_TYPES = ['position', 'flatness', 'perpendicularity', 'parallelism', 'circularity', 'cylindricity', 'profile', 'angularity', 'concentricity', 'symmetry', 'runout', 'straightness'];

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
    const count = { dust: 150, dimensions: 10, swatches: 22, leaves: 7, furniture: 16, gdtFrames: 18 }[this.kind] ?? 0;
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
    const kindBoost = { sunlight: 0.75, lamps: 0.8, fabric: 0.8, parquet: 0.85, bricks: 0.85, tiles: 0.85, stressField: 0.8, tessellation: 0.85, turbine: 0.8, sectionHatch: 0.9 }[this.kind] ?? 1;
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
    const fn = this[this.kind === 'curtains' ? 'rain' : this.kind];
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

  /** Rain sliding down a window: a pale sky, a simple frame, and streaks that fall and start again. */
  rain(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgba(colors.dark ? colors.accent : warm(colors), 0.1));
    sky.addColorStop(1, rgba(colors.accent, 0.03));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const x0 = w * 0.16;
    const y0 = h * 0.07;
    const x1 = w * 0.84;
    const y1 = h * 0.93;
    c.fillStyle = rgba(warm(colors), colors.dark ? 0.05 : 0.07);
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    const span = y1 - y0;
    const fall = time * unit * 0.16;
    c.lineCap = 'round';
    c.lineWidth = Math.max(1, unit * 0.0018) * SIZE;
    c.beginPath();
    for (let i = 0; i < 42; i++) {
      const len = unit * (0.035 + hash(i, 2) * 0.055);
      const x = x0 + unit * 0.02 + hash(i, 1) * (x1 - x0 - unit * 0.04);
      const y = y0 + mod(hash(i, 4) * span + fall * (0.55 + hash(i, 3) * 0.75), span);
      c.moveTo(x, y);
      c.lineTo(x + unit * 0.012, Math.min(y1 - 2, y + len));
    }
    c.strokeStyle = rgba(colors.text, colors.dark ? 0.22 : 0.16);
    c.stroke();
    c.strokeStyle = rgba(colors.text, 0.32);
    c.lineWidth = Math.max(2, unit * 0.011);
    c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    c.lineWidth = Math.max(1.5, unit * 0.005);
    c.beginPath();
    c.moveTo((x0 + x1) / 2, y0); c.lineTo((x0 + x1) / 2, y1);
    c.moveTo(x0, (y0 + y1) / 2); c.lineTo(x1, (y0 + y1) / 2);
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

  // ───────── mechanical scenes

  /** A gear train of five spur gears in mesh: each turns the other way, faster or slower by its count of teeth. */
  gears(c, w, h, time, colors) {
    // Teeth, and the direction to the next gear's centre.
    const train = [[24, -0.6], [12, 0.75], [36, -0.55], [16, 0.7], [28, 0]];
    const at = [[0, 0]];
    for (let i = 1; i < train.length; i++) {
      const d = (train[i - 1][0] + train[i][0]) / 2;
      at.push([at[i - 1][0] + Math.cos(train[i - 1][1]) * d, at[i - 1][1] + Math.sin(train[i - 1][1]) * d]);
    }
    // Laid out in modules first, then scaled to fit the screen.
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    train.forEach(([z], i) => { const r = z / 2 + 1; x0 = Math.min(x0, at[i][0] - r); x1 = Math.max(x1, at[i][0] + r); y0 = Math.min(y0, at[i][1] - r); y1 = Math.max(y1, at[i][1] + r); });
    const m = Math.min((w * 0.94) / (x1 - x0), (h * 0.9) / (y1 - y0));
    const ox = w / 2 - ((x0 + x1) / 2) * m + Math.sin(time * 0.05) * w * 0.01;
    const oy = h / 2 - ((y0 + y1) / 2) * m;
    // Gear i+1's teeth fall into gear i's gaps on the line of centres, turning -z_i/z_(i+1) as fast.
    const angles = [time * 0.3];
    for (let i = 1; i < train.length; i++) {
      const phi = train[i - 1][1];
      angles.push(-(angles[i - 1] - phi) * (train[i - 1][0] / train[i][0]) + phi + Math.PI + Math.PI / train[i][0]);
    }
    const line = Math.max(1, w / 1100) * SIZE;
    train.forEach(([z], i) => {
      const gx = ox + at[i][0] * m;
      const gy = oy + at[i][1] * m;
      const r = (m * z) / 2;
      const a = angles[i];
      const rb = r * (z > 14 ? 0.15 : 0.24);
      c.beginPath();
      gearPath(c, gx, gy, z, m, a);
      c.moveTo(gx + rb, gy);
      c.arc(gx, gy, rb, 0, TAU);
      const holes = z >= 24 ? 6 : 0;
      for (let k = 0; k < holes; k++) {
        const b = a + (k / holes) * TAU + Math.PI / holes;
        const hx = gx + Math.cos(b) * r * 0.56;
        const hy = gy + Math.sin(b) * r * 0.56;
        c.moveTo(hx + r * 0.13, hy);
        c.arc(hx, hy, r * 0.13, 0, TAU);
      }
      c.fillStyle = rgba(colors.accent, i % 2 ? 0.06 : 0.09);
      c.fill('evenodd');
      c.lineWidth = line;
      c.lineJoin = 'round';
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.stroke();
      // Hub and rim, the pitch circle (chain line) and the keyway, turning with the gear.
      c.lineWidth = Math.max(1, line * 0.6);
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      if (holes) {
        c.moveTo(gx + r * 0.32, gy); c.arc(gx, gy, r * 0.32, 0, TAU);
        c.moveTo(gx + r - 2.3 * m, gy); c.arc(gx, gy, r - 2.3 * m, 0, TAU);
      }
      c.stroke();
      c.setLineDash?.([m * 2.2, m * 0.6, m * 0.35, m * 0.6]);
      c.strokeStyle = rgba(colors.text, 0.13);
      c.beginPath();
      c.arc(gx, gy, r, 0, TAU);
      c.stroke();
      c.setLineDash?.([]);
      c.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), gx, gy);
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.beginPath();
      c.moveTo(rb, -m * 0.45); c.lineTo(rb + m * 0.55, -m * 0.45); c.lineTo(rb + m * 0.55, m * 0.45); c.lineTo(rb, m * 0.45);
      c.stroke();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.strokeStyle = rgba(colors.text, 0.22);
      c.beginPath();
      c.moveTo(gx - rb * 1.7, gy); c.lineTo(gx + rb * 1.7, gy);
      c.moveTo(gx, gy - rb * 1.7); c.lineTo(gx, gy + rb * 1.7);
      c.stroke();
      // Where it meshes with the next gear: the pitch point and the line of action (20°).
      if (i < train.length - 1) {
        const phi = train[i][1];
        const px = gx + Math.cos(phi) * r;
        const py = gy + Math.sin(phi) * r;
        const la = phi + Math.PI / 2 - (20 * Math.PI) / 180;
        c.strokeStyle = rgba(colors.text, 0.18);
        c.beginPath();
        c.moveTo(px - Math.cos(la) * m * 3.5, py - Math.sin(la) * m * 3.5);
        c.lineTo(px + Math.cos(la) * m * 3.5, py + Math.sin(la) * m * 3.5);
        c.stroke();
        c.fillStyle = rgba(colors.accent, 0.5);
        c.beginPath();
        c.arc(px, py, 1.8 * SIZE, 0, TAU);
        c.fill();
      }
    });
  }

  /** An inline four: pistons, rods and crankshaft turning, valves opening and each cylinder firing in order 1-3-4-2. */
  piston(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const n = 4;
    const R = Math.min(unit * 0.078, w / 24);
    const L = R * 3.3;
    const bore = R * 2.4;
    const pitch = bore * 1.7;
    const crankY = h * 0.7;
    const x0 = w / 2 - (pitch * (n - 1)) / 2;
    const theta = time * 1.1;
    const fireAt = [0, 3 * Math.PI, Math.PI, 2 * Math.PI];
    const pistonH = bore * 0.72;
    const headY = crankY - (L + R) - pistonH * 0.38 - R * 0.35;
    const linerBot = crankY - (L - R) + pistonH * 0.62 + R * 0.12;
    const wall = bore * 0.12;
    const line = Math.max(1, w / 1100) * SIZE;
    const sun = warm(colors);
    c.lineJoin = 'round';
    // Block, head and the crank's centre line.
    c.lineWidth = Math.max(1, line * 0.7);
    c.strokeStyle = rgba(colors.text, 0.14);
    c.fillStyle = rgba(colors.text, 0.03);
    c.beginPath();
    c.rect(x0 - pitch / 2, headY - R * 0.9, pitch * n, R * 0.9);
    c.rect(x0 - pitch / 2, headY, pitch * n, linerBot - headY);
    c.fill();
    c.stroke();
    c.setLineDash?.([R * 0.5, R * 0.15, R * 0.06, R * 0.15]);
    c.beginPath();
    c.moveTo(x0 - pitch * 0.75, crankY); c.lineTo(x0 + pitch * (n - 0.25), crankY);
    c.stroke();
    c.setLineDash?.([]);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pitch;
      const a = theta + (i === 1 || i === 2 ? Math.PI : 0);
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      const pinX = x + R * sa;
      const pinY = crankY - R * ca;
      const wristY = crankY - (R * ca + Math.sqrt(L * L - R * R * sa * sa));
      const top = wristY - pistonH * 0.38;
      const cyc = mod(theta - fireAt[i], 4 * Math.PI);
      // Bore: the combustion space glows as the cylinder fires.
      c.fillStyle = rgba(colors.bg, 0.7);
      c.fillRect(x - bore / 2, headY, bore, linerBot - headY);
      const burn = cyc < Math.PI ? Math.exp(-cyc * 1.5) : 0;
      if (burn > 0.02) {
        c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
        const g = c.createLinearGradient(0, headY, 0, top);
        g.addColorStop(0, rgba(sun, 0.4 * burn));
        g.addColorStop(1, rgba(sun, 0.08 * burn));
        c.fillStyle = g;
        c.fillRect(x - bore / 2, headY, bore, Math.max(0, top - headY));
        c.globalCompositeOperation = 'source-over';
      }
      c.lineWidth = line;
      c.strokeStyle = rgba(colors.text, 0.22);
      c.beginPath();
      c.moveTo(x - bore / 2, headY); c.lineTo(x - bore / 2, linerBot);
      c.moveTo(x + bore / 2, headY); c.lineTo(x + bore / 2, linerBot);
      c.moveTo(x - bore / 2 - wall, headY); c.lineTo(x - bore / 2 - wall, linerBot);
      c.moveTo(x + bore / 2 + wall, headY); c.lineTo(x + bore / 2 + wall, linerBot);
      c.stroke();
      // Valves: intake on the left (third stroke), exhaust on the right (second); the plug sparks at firing.
      const lift = (from) => (cyc > from && cyc < from + Math.PI ? Math.sin(cyc - from) : 0);
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.beginPath();
      for (const [side, l] of [[-1, lift(2 * Math.PI)], [1, lift(Math.PI)]]) {
        const vx = x + side * bore * 0.24;
        const vy = headY + l * R * 0.28;
        c.moveTo(vx, vy); c.lineTo(vx, headY - R * 0.85);
        c.moveTo(vx - bore * 0.13, vy); c.lineTo(vx + bore * 0.13, vy);
      }
      c.moveTo(x, headY); c.lineTo(x, headY - R * 0.5);
      c.stroke();
      if (burn > 0.3) {
        c.fillStyle = rgba(sun, 0.7 * burn);
        c.beginPath();
        c.arc(x, headY + R * 0.06, R * 0.07 * SIZE, 0, TAU);
        c.fill();
      }
      // Crank web with its counterweight, then the rod, then the piston over it.
      const pinDir = Math.atan2(pinY - crankY, pinX - x);
      c.fillStyle = rgba(colors.accent, 0.09);
      c.strokeStyle = rgba(colors.accent, 0.32);
      c.beginPath();
      c.arc(x, crankY, R * 1.3, pinDir + Math.PI - 1.15, pinDir + Math.PI + 1.15);
      c.arc(pinX, pinY, R * 0.5, pinDir - Math.PI / 2, pinDir + Math.PI / 2);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(x + R * 0.4, crankY); c.arc(x, crankY, R * 0.4, 0, TAU);
      c.stroke();
      const dx = pinX - x;
      const dy = pinY - wristY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const small = bore * 0.07;
      const big = R * 0.26;
      c.fillStyle = rgba(colors.accent, 0.12);
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.beginPath();
      c.moveTo(x + nx * small, wristY + ny * small); c.lineTo(pinX + nx * big, pinY + ny * big);
      c.lineTo(pinX - nx * big, pinY - ny * big); c.lineTo(x - nx * small, wristY - ny * small);
      c.closePath();
      c.moveTo(pinX + R * 0.4, pinY); c.arc(pinX, pinY, R * 0.4, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.12);
      c.beginPath();
      c.rect(x - bore * 0.47, top, bore * 0.94, pistonH);
      c.fill();
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      for (const f of [0.1, 0.18, 0.26]) { c.moveTo(x - bore * 0.47, top + pistonH * f); c.lineTo(x + bore * 0.47, top + pistonH * f); }
      c.moveTo(x + bore * 0.09, wristY); c.arc(x, wristY, bore * 0.09, 0, TAU);
      c.stroke();
    }
    // Stroke of the last cylinder: top and bottom dead centre.
    const xs = x0 + (n - 1) * pitch + bore / 2 + wall + R * 0.7;
    const tdc = crankY - (L + R) - pistonH * 0.38;
    const bdc = crankY - (L - R) - pistonH * 0.38;
    c.lineWidth = Math.max(1, line * 0.7);
    c.strokeStyle = rgba(colors.text, 0.22);
    c.fillStyle = rgba(colors.text, 0.22);
    c.beginPath();
    c.moveTo(xs - R * 0.5, tdc); c.lineTo(xs + R * 0.5, tdc);
    c.moveTo(xs - R * 0.5, bdc); c.lineTo(xs + R * 0.5, bdc);
    c.moveTo(xs, tdc); c.lineTo(xs, bdc);
    c.stroke();
    c.beginPath();
    arrowHead(c, xs, tdc, -Math.PI / 2, R * 0.22);
    arrowHead(c, xs, bdc, Math.PI / 2, R * 0.22);
    c.fill();
    c.font = `${Math.round(R * 0.32 * Math.min(1.3, SIZE))}px ${SANS}`;
    c.fillStyle = rgba(colors.text, 0.32);
    c.fillText('TDC', xs + R * 0.6, tdc + R * 0.1);
    c.fillText('BDC', xs + R * 0.6, bdc + R * 0.1);
  }

  /** A CNC pocket: the end mill spirals out from the middle, then mills four holes; the toolpath shows ahead of it. */
  toolpath(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { round, phase } = cycle(time, 28);
    const fade = fadeInOut(phase, 0.07, 0.03);
    const sw = Math.min(w * 0.64, unit * 1.15);
    const sh = Math.min(h * 0.64, sw * 0.62);
    const sx = w / 2 - sw / 2 + (hash(round, 1) - 0.5) * w * 0.05;
    const sy = h / 2 - sh / 2;
    const rt = unit * 0.021;
    const step = rt * 1.3;
    const pw = sw * (0.52 + hash(round, 2) * 0.1);
    const ph = sh * (0.56 + hash(round, 3) * 0.16);
    const px = sx + sw * 0.07;
    const py = sy + (sh - ph) / 2;
    const pr = Math.min(pw, ph) * (0.12 + hash(round, 4) * 0.14);
    // The moves: a slot through the middle, loops outwards, then rapids to the holes and a circle in each.
    const moves = [];
    const loops = [];
    for (let d = rt; pw - 2 * d >= step && ph - 2 * d >= step; d += step) loops.push(roundRectPoly(px + d, py + d, pw - 2 * d, ph - 2 * d, Math.max(0, pr - d)));
    loops.reverse();
    const cyM = py + ph / 2;
    let pen = [px + ph / 2, cyM];
    const cut = (pts) => { moves.push([pen[0], pen[1], pts[0][0], pts[0][1], 0]); for (const s of polySegs(pts)) moves.push([...s, 0]); pen = pts.at(-1); };
    cut([[px + Math.min(ph, pw) / 2, cyM], [px + pw - Math.min(ph, pw) / 2, cyM]]);
    for (const loop of loops) cut(loop);
    const rh = rt * 1.9;
    const hx = sx + sw * 0.86;
    for (let k = 0; k < 4; k++) {
      const hy = sy + sh * (0.2 + k * 0.2);
      const ring = circlePoly(hx, hy, rh - rt, 20, -Math.PI / 2);
      moves.push([pen[0], pen[1], ring[0][0], ring[0][1], 1]);
      pen = ring[0];
      cut(ring);
    }
    const weight = (mv) => segLength(mv) * (mv[4] ? 0.3 : 1);
    const total = moves.reduce((sum, mv) => sum + weight(mv), 0);
    let left = total * clamp01((phase - 0.03) / 0.82);
    let tool = [moves[0][0], moves[0][1]];
    let cutting = false;
    const done = [];
    const rapidDone = [];
    for (const mv of moves) {
      if (left <= 0) break;
      const wt = weight(mv);
      const f = wt > left ? left / wt : 1;
      const end = [mv[0] + (mv[2] - mv[0]) * f, mv[1] + (mv[3] - mv[1]) * f];
      (mv[4] ? rapidDone : done).push([mv[0], mv[1], end[0], end[1]]);
      tool = end;
      cutting = !mv[4] && f < 1;
      left -= wt;
    }
    // Stock with its work origin, the pocket and holes as designed.
    const line = Math.max(1, w / 1400) * SIZE;
    c.lineWidth = line;
    c.fillStyle = rgba(colors.text, 0.035 * fade);
    c.strokeStyle = rgba(colors.text, 0.22 * fade);
    c.beginPath();
    c.rect(sx, sy, sw, sh);
    c.fill();
    c.stroke();
    c.strokeStyle = rgba(colors.text, 0.12 * fade);
    c.beginPath();
    polyPath(c, roundRectPoly(px, py, pw, ph, pr));
    for (let k = 0; k < 4; k++) { const hy = sy + sh * (0.2 + k * 0.2); c.moveTo(hx + rh, hy); c.arc(hx, hy, rh, 0, TAU); }
    c.stroke();
    c.strokeStyle = rgba(AXIS[0], 0.4 * fade);
    c.beginPath(); c.moveTo(sx, sy + sh); c.lineTo(sx + unit * 0.06, sy + sh); c.stroke();
    c.strokeStyle = rgba(AXIS[1], 0.4 * fade);
    c.beginPath(); c.moveTo(sx, sy + sh); c.lineTo(sx, sy + sh - unit * 0.06); c.stroke();
    // The path still to come, dashed; what has been machined, as wide as the cutter.
    c.setLineDash?.([4, 5]);
    c.strokeStyle = rgba(colors.accent, 0.12 * fade);
    c.beginPath();
    for (const mv of moves) if (!mv[4]) { c.moveTo(mv[0], mv[1]); c.lineTo(mv[2], mv[3]); }
    c.stroke();
    c.strokeStyle = rgba(colors.text, 0.18 * fade);
    c.beginPath();
    for (const s of rapidDone) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }
    c.stroke();
    c.setLineDash?.([]);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = rt * 2;
    c.strokeStyle = rgba(colors.accent, 0.1 * fade);
    c.beginPath();
    for (const s of done) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }
    c.stroke();
    c.lineWidth = line;
    c.strokeStyle = rgba(colors.accent, 0.36 * fade);
    c.stroke();
    // The cutter: two flutes spinning, chips flying while it cuts.
    if (phase < 0.86) {
      const spin = time * 18;
      c.fillStyle = rgba(colors.bg, 0.45 * fade);
      c.strokeStyle = rgba(colors.text, 0.5 * fade);
      c.lineWidth = Math.max(1.2, line * 1.2);
      c.beginPath();
      c.arc(tool[0], tool[1], rt, 0, TAU);
      c.fill();
      c.stroke();
      c.lineWidth = line;
      c.beginPath();
      for (const off of [0, Math.PI]) { c.moveTo(tool[0], tool[1]); c.quadraticCurveTo(tool[0] + Math.cos(spin + off + 0.8) * rt * 0.7, tool[1] + Math.sin(spin + off + 0.8) * rt * 0.7, tool[0] + Math.cos(spin + off) * rt, tool[1] + Math.sin(spin + off) * rt); }
      c.stroke();
      if (cutting) {
        c.strokeStyle = rgba(colors.text, 0.3 * fade);
        c.beginPath();
        for (let k = 0; k < 7; k++) {
          const life = mod(time * 2.2 + hash(k, 3), 1);
          const dir = hash(k, Math.floor(time * 2.2 + hash(k, 3))) * TAU;
          const dist = rt * (1.1 + life * 2.4);
          const cx = tool[0] + Math.cos(dir) * dist;
          const cy = tool[1] + Math.sin(dir) * dist;
          c.moveTo(cx, cy); c.lineTo(cx + Math.cos(dir + 1.2) * rt * 0.3, cy + Math.sin(dir + 1.2) * rt * 0.3);
        }
        c.stroke();
      }
      const font = Math.round((unit / 62) * Math.min(1.3, SIZE));
      c.font = `${font}px ${MONO}`;
      c.fillStyle = rgba(colors.text, 0.38 * fade);
      const X = (((tool[0] - sx) / sw) * 160).toFixed(3);
      const Y = (((sy + sh - tool[1]) / sh) * 100).toFixed(3);
      c.fillText(`N${String(10 + Math.floor(phase * 900) * 10).padStart(4, '0')} ${cutting ? 'G01' : 'G00'} X${X} Y${Y} Z-4.000 F1200 S9000`, sx, sy + sh + font * 1.7);
    }
  }

  /** A cantilever bracket under load: the meshed stress plot shifts as the load swells and turns. */
  stressField(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const Lw = Math.min(w * 0.62, unit * 1.25);
    const Lh = Lw * 0.32;
    const ox = w / 2 - Lw / 2 - w * 0.04;
    const oy = h / 2 - Lh / 2 - h * 0.02;
    const nx = 40;
    const ny = 13;
    const load = 0.78 + 0.22 * Math.sin(time * 0.45);
    const tilt = Math.sin(time * 0.19);
    const hcx = ox + Lw * 0.62;
    const hcy = oy + Lh * 0.5;
    const rh = Lh * 0.2;
    const defl = Lh * 0.16 * load;
    // Nodes: inside the hole they are pushed onto its edge.
    const X = new Float32Array((nx + 1) * (ny + 1));
    const Y = new Float32Array((nx + 1) * (ny + 1));
    const V = new Float32Array((nx + 1) * (ny + 1));
    const Y0 = new Float32Array((nx + 1) * (ny + 1));
    const inside = new Uint8Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i;
        const u = i / nx;
        const v = j / ny;
        let x = ox + u * Lw;
        let y = oy + v * Lh;
        const dx = x - hcx;
        const dy = y - hcy;
        const rho = Math.hypot(dx, dy);
        if (rho < rh) { inside[k] = 1; const f = rh / Math.max(1e-6, rho); x = hcx + dx * f; y = hcy + dy * f; }
        const r2 = Math.max(rh, rho);
        // Bending (the neutral axis shifting with the pull), and the hole's stress raiser above and below it.
        const bend = (1 - u) * ((2 * v - 1) * load + 0.3 * tilt);
        const hoop = 0.55 * load * (rh / r2) ** 2 * (0.4 + Math.abs(dy) / r2);
        V[k] = clamp01((Math.abs(bend) + hoop) / 1.35);
        const ux = (x - ox) / Lw;
        X[k] = x;
        Y0[k] = y;
        Y[k] = y + defl * ux * ux * (3 - ux) * 0.5;
      }
    }
    const levels = Array.from({ length: STRESS.length }, () => []);
    const edges = [];
    const tri = (a, b, d) => {
      if (inside[a] + inside[b] + inside[d] === 3) return;
      const mx = (X[a] + X[b] + X[d]) / 3 - hcx;
      const my = (Y0[a] + Y0[b] + Y0[d]) / 3 - hcy;
      if (Math.hypot(mx, my) < rh * 0.92) return;
      const lv = Math.min(STRESS.length - 1, Math.floor(((V[a] + V[b] + V[d]) / 3) * STRESS.length));
      levels[lv].push(a, b, d);
      edges.push(a, b, d);
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const d = a + nx + 1;
        const e = d + 1;
        if ((i + j) % 2) { tri(a, b, e); tri(a, e, d); } else { tri(a, b, d); tri(b, e, d); }
      }
    }
    levels.forEach((list, lv) => {
      if (!list.length) return;
      c.fillStyle = rgba(STRESS[lv], colors.dark ? 0.15 : 0.13);
      c.beginPath();
      for (let k = 0; k < list.length; k += 3) { c.moveTo(X[list[k]], Y[list[k]]); c.lineTo(X[list[k + 1]], Y[list[k + 1]]); c.lineTo(X[list[k + 2]], Y[list[k + 2]]); c.closePath(); }
      c.fill();
    });
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.06);
    c.beginPath();
    for (let k = 0; k < edges.length; k += 3) { c.moveTo(X[edges[k]], Y[edges[k]]); c.lineTo(X[edges[k + 1]], Y[edges[k + 1]]); c.lineTo(X[edges[k + 2]], Y[edges[k + 2]]); c.closePath(); }
    c.stroke();
    // The shape before loading (dashed) and the deflected outline.
    const line = Math.max(1, w / 1100) * SIZE;
    c.setLineDash?.([5, 6]);
    c.strokeStyle = rgba(colors.text, 0.14);
    c.beginPath();
    c.rect(ox, oy, Lw, Lh);
    c.moveTo(hcx + rh, hcy); c.arc(hcx, hcy, rh, 0, TAU);
    c.stroke();
    c.setLineDash?.([]);
    const node = (i, j) => j * (nx + 1) + i;
    c.lineWidth = line;
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.beginPath();
    for (let i = 0; i <= nx; i++) c[i ? 'lineTo' : 'moveTo'](X[node(i, 0)], Y[node(i, 0)]);
    for (let j = 1; j <= ny; j++) c.lineTo(X[node(nx, j)], Y[node(nx, j)]);
    for (let i = nx - 1; i >= 0; i--) c.lineTo(X[node(i, ny)], Y[node(i, ny)]);
    c.closePath();
    const hu = (hcx - ox) / Lw;
    const hd = defl * hu * hu * (3 - hu) * 0.5;
    c.moveTo(hcx + rh, hcy + hd); c.arc(hcx, hcy + hd, rh, 0, TAU);
    c.stroke();
    // Fixed edge (hatched) and the load arrows at the free end.
    c.strokeStyle = rgba(colors.text, 0.26);
    c.beginPath();
    c.moveTo(ox, oy - Lh * 0.15); c.lineTo(ox, oy + Lh * 1.15);
    for (let y = oy - Lh * 0.1; y < oy + Lh * 1.15; y += Lh * 0.11) { c.moveTo(ox, y); c.lineTo(ox - Lh * 0.09, y + Lh * 0.09); }
    c.stroke();
    const endY = oy + defl;
    const arrow = Lh * (0.22 + 0.2 * load);
    c.fillStyle = rgba(colors.text, 0.34);
    c.strokeStyle = rgba(colors.text, 0.34);
    for (let k = 0; k < 3; k++) {
      const ax = ox + Lw - Lh * (0.06 + k * 0.16);
      const angle = Math.PI / 2 + tilt * 0.25;
      const tipY = endY - Lh * 0.02;
      c.beginPath();
      c.moveTo(ax - Math.cos(angle) * arrow, tipY - Math.sin(angle) * arrow); c.lineTo(ax, tipY);
      c.stroke();
      c.beginPath();
      arrowHead(c, ax, tipY, angle, Lh * 0.08);
      c.fill();
    }
    // Legend.
    const lx = Math.min(w - unit * 0.12, ox + Lw + unit * 0.16);
    const ly = h / 2 - unit * 0.22;
    const lh = (unit * 0.44) / STRESS.length;
    const font = Math.round((unit / 64) * Math.min(1.3, SIZE));
    c.font = `${font}px ${SANS}`;
    for (let k = 0; k < STRESS.length; k++) {
      const y = ly + (STRESS.length - 1 - k) * lh;
      c.fillStyle = rgba(STRESS[k], 0.3);
      c.fillRect(lx, y, unit * 0.025, lh - 1);
      if (k % 3 === 0 || k === STRESS.length - 1) {
        c.fillStyle = rgba(colors.text, 0.34);
        c.fillText(((k + 1) / STRESS.length * 248 * load).toFixed(1), lx + unit * 0.035, y + lh * 0.7);
      }
    }
    c.fillStyle = rgba(colors.text, 0.34);
    c.fillText('von Mises (MPa)', lx, ly - font * 0.9);
  }

  /** A torus, then a sphere, turning while its triangle mesh gets finer, step by step. */
  tessellation(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { round, phase } = cycle(time, 8);
    const fade = fadeInOut(phase, 0.12, 0.12);
    const steps = [[12, 6], [18, 9], [26, 13], [36, 18]];
    const [nu, nv] = steps[round % steps.length];
    const sphere = Math.floor(round / steps.length) % 2 === 1;
    const yaw = time * 0.22;
    const pitch = 0.75 + Math.sin(time * 0.11) * 0.25;
    const S = unit * (sphere ? 0.34 : 0.27);
    const cx = w / 2;
    const cy = h / 2;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cp = Math.cos(pitch); const sp = Math.sin(pitch);
    const rot = (x, y, z) => { const x1 = x * cyw + z * syw; const z1 = -x * syw + z * cyw; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
    const vRange = sphere ? Math.PI : TAU;
    const P = [];
    const N = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u = (i / nu) * TAU;
        const v = (j / nv) * vRange;
        let p; let n;
        if (sphere) { n = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)]; p = n; }
        else { n = [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)]; p = [(1 + 0.42 * Math.cos(v)) * Math.cos(u), 0.42 * Math.sin(v), (1 + 0.42 * Math.cos(v)) * Math.sin(u)]; }
        P.push(rot(...p));
        N.push(rot(...n));
      }
    }
    const light = [-0.45, 0.65, 0.6];
    const tris = [];
    const add = (a, b, d) => {
      const nz = N[a][2] + N[b][2] + N[d][2];
      if (nz <= 0) return;
      const shade = Math.max(0, ((N[a][0] + N[b][0] + N[d][0]) * light[0] + (N[a][1] + N[b][1] + N[d][1]) * light[1] + nz * light[2]) / 3);
      tris.push([a, b, d, P[a][2] + P[b][2] + P[d][2], shade]);
    };
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * nu + i;
        const b = j * nu + ((i + 1) % nu);
        const d = a + nu;
        const e = b + nu;
        if (!sphere || j > 0) add(a, b, e);
        if (!sphere || j < nv - 1) add(a, e, d);
      }
    }
    tris.sort((p, q) => p[3] - q[3]);
    // A soft shadow under the shape.
    const shadow = c.createRadialGradient(cx, cy + S * 1.45, 0, cx, cy + S * 1.45, S * 1.3);
    shadow.addColorStop(0, rgba(colors.text, 0.06));
    shadow.addColorStop(1, rgba(colors.text, 0));
    c.fillStyle = shadow;
    c.setTransform(1, 0, 0, 0.22, 0, (cy + S * 1.45) * 0.78);
    c.fillRect(cx - S * 1.3, cy + S * 0.15, S * 2.6, S * 2.6);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const fills = Array.from({ length: 8 }, (_, k) => rgba(colors.accent, (0.03 + 0.15 * (k / 7)) * (0.4 + 0.6 * fade)));
    c.lineWidth = Math.max(1, w / 1800) * SIZE;
    c.lineJoin = 'round';
    c.strokeStyle = rgba(colors.accent, 0.3 * fade);
    const sx = (p) => cx + p[0] * S;
    const sy = (p) => cy - p[1] * S;
    for (const [a, b, d, , shade] of tris) {
      c.fillStyle = fills[Math.min(7, Math.floor(shade * 8))];
      c.beginPath();
      c.moveTo(sx(P[a]), sy(P[a])); c.lineTo(sx(P[b]), sy(P[b])); c.lineTo(sx(P[d]), sy(P[d]));
      c.closePath();
      c.fill();
      c.stroke();
    }
    const font = Math.round((unit / 60) * Math.min(1.3, SIZE));
    c.font = `${font}px ${MONO}`;
    c.textAlign = 'center';
    c.fillStyle = rgba(colors.text, 0.34 * fade);
    const count = sphere ? nu * (nv - 1) * 2 : nu * nv * 2;
    c.fillText(`${count.toLocaleString('en-US')} △`, cx, cy + S * 1.75);
    c.textAlign = 'start';
  }

  /** A bearing block assembly turning slowly, pulled apart along its axis with balloons, then put back together. */
  exploded(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 16);
    const e = smooth((phase - 0.12) / 0.22) * (1 - smooth((phase - 0.68) / 0.22));
    const yaw = time * 0.16;
    const sp = Math.sin(0.5);
    const cp = Math.cos(0.5);
    const S = Math.min(unit * 0.18, w * 0.12);
    const cx = w * 0.5;
    const base = h * 0.8;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const P = (x, y, z) => { const X = x * cyw - z * syw; const Z = x * syw + z * cyw; return [cx + X * S, base - y * S * cp + Z * S * sp, Z]; };
    const line = Math.max(1, w / 1200) * SIZE;
    c.lineWidth = line;
    c.lineJoin = 'round';
    const gap = 0.42 * e;
    // [radius, bottom, top, bore, teeth] along the axis, each lifted further as the assembly comes apart.
    const parts = [
      [0.6, 0.22, 0.6, 0.36, 0],
      [0.4, 0.6, 0.74, 0.16, 0],
      [0.74, 0.74, 0.96, 0.16, 28],
      [0.3, 0.96, 1.08, 0.12, 0],
    ].map(([r, y0, y1, bore, teeth], k) => ({ r, y0: y0 + gap * (k + 1), y1: y1 + gap * (k + 1), bore, teeth }));
    const shaft = { r: 0.15, y0: 0.32 + gap * 0.5, y1: 1.5 + gap * 4.6 };
    const ell = (y, r) => { const [x0, y0] = P(0, y, 0); return [x0, y0, r * S, r * S * sp]; };
    const cylinder = (r, y0, y1, fill, bore = 0, teeth = 0) => {
      const [bx, by, rx, ry] = ell(y0, r);
      const [tx, ty] = ell(y1, r);
      c.beginPath();
      c.moveTo(tx - rx, ty); c.lineTo(bx - rx, by);
      c.ellipse(bx, by, rx, ry, 0, Math.PI, 0, true);
      c.lineTo(tx + rx, ty);
      c.ellipse(tx, ty, rx, ry, 0, 0, Math.PI, true);
      c.fillStyle = rgba(colors.bg, 0.88);
      c.fill();
      c.fillStyle = rgba(colors.accent, fill);
      c.fill();
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.stroke();
      c.setLineDash?.([4, 5]);
      c.strokeStyle = rgba(colors.text, 0.1);
      c.beginPath();
      c.ellipse(bx, by, rx, ry, 0, Math.PI, TAU);
      c.stroke();
      c.setLineDash?.([]);
      c.beginPath();
      if (teeth) {
        for (let k = 0; k <= teeth * 2; k++) {
          const a = (k / (teeth * 2)) * TAU;
          const rr = k % 2 ? r : r * 0.92;
          const [x, y] = P(Math.cos(a) * rr, y1, Math.sin(a) * rr);
          c[k ? 'lineTo' : 'moveTo'](x, y);
        }
      } else c.ellipse(tx, ty, rx, ry, 0, 0, TAU);
      c.fillStyle = rgba(colors.bg, 0.6);
      c.fill();
      c.fillStyle = rgba(colors.accent, fill + 0.05);
      c.fill();
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.stroke();
      if (teeth) {
        c.strokeStyle = rgba(colors.accent, 0.18);
        c.beginPath();
        for (let k = 0; k < teeth; k++) {
          const a = ((k * 2 + 1) / (teeth * 2)) * TAU;
          const [x, y, z] = P(Math.cos(a) * r, y1, Math.sin(a) * r);
          if (z > 0) { const [, yb] = P(Math.cos(a) * r, y0, Math.sin(a) * r); c.moveTo(x, y); c.lineTo(x, yb); }
        }
        c.stroke();
      }
      if (bore) {
        c.fillStyle = rgba(colors.text, 0.06);
        c.strokeStyle = rgba(colors.accent, 0.3);
        c.beginPath();
        c.ellipse(tx, ty, bore * S, bore * S * sp, 0, 0, TAU);
        c.fill();
        c.stroke();
      }
    };
    // Base plate: the top and whichever two sides face us.
    const bw = 1.3;
    const bd = 0.82;
    const bt = 0.22;
    const face = (pts, fill) => { c.beginPath(); pts.forEach((p, k) => { const [x, y] = P(...p); c[k ? 'lineTo' : 'moveTo'](x, y); }); c.closePath(); c.fillStyle = rgba(colors.bg, 0.85); c.fill(); c.fillStyle = rgba(colors.accent, fill); c.fill(); c.strokeStyle = rgba(colors.accent, 0.36); c.stroke(); };
    if (syw > 0) face([[bw, 0, -bd], [bw, 0, bd], [bw, bt, bd], [bw, bt, -bd]], 0.1);
    else face([[-bw, 0, -bd], [-bw, 0, bd], [-bw, bt, bd], [-bw, bt, -bd]], 0.1);
    if (cyw > 0) face([[-bw, 0, bd], [bw, 0, bd], [bw, bt, bd], [-bw, bt, bd]], 0.06);
    else face([[-bw, 0, -bd], [bw, 0, -bd], [bw, bt, -bd], [-bw, bt, -bd]], 0.06);
    face([[-bw, bt, -bd], [bw, bt, -bd], [bw, bt, bd], [-bw, bt, bd]], 0.13);
    const bolts = [[1.02, 0.58], [-1.02, 0.58], [1.02, -0.58], [-1.02, -0.58]].map(([x, z]) => ({ x, z, depth: x * syw + z * cyw }));
    c.fillStyle = rgba(colors.text, 0.08);
    c.strokeStyle = rgba(colors.accent, 0.3);
    for (const b of bolts) {
      const [x, y] = P(b.x, bt, b.z);
      c.beginPath();
      c.ellipse(x, y, 0.075 * S, 0.075 * S * sp, 0, 0, TAU);
      c.fill();
      c.stroke();
    }
    const lift = 1.6 * e;
    const bolt = (b) => {
      const head = bt + lift;
      const [hx, hy] = P(b.x, head, b.z);
      const [bx2, by2] = P(b.x, Math.max(bt, head - 0.5), b.z);
      if (lift > 0.02) {
        c.fillStyle = rgba(colors.bg, 0.8);
        c.strokeStyle = rgba(colors.accent, 0.34);
        c.beginPath();
        c.rect(hx - 0.06 * S, hy, 0.12 * S, by2 - hy);
        c.fill();
        c.fillStyle = rgba(colors.accent, 0.08);
        c.fill();
        c.stroke();
        c.strokeStyle = rgba(colors.text, 0.16);
        c.beginPath();
        for (let y = hy + 0.03 * S; y < by2; y += 0.035 * S) { c.moveTo(hx - 0.06 * S, y); c.lineTo(hx + 0.06 * S, y + 0.015 * S); }
        c.stroke();
      }
      c.save();
      const [x, y] = P(b.x, 0, b.z);
      c.translate(x - cx, y - base);
      cylinder(0.12, head, head + 0.09, 0.12);
      c.restore();
      if (e > 0.02) {
        c.setLineDash?.([3, 5]);
        c.strokeStyle = rgba(colors.text, 0.16 * e);
        c.beginPath();
        const [px, py] = P(b.x, bt, b.z);
        c.moveTo(px, py); c.lineTo(px, by2);
        c.stroke();
        c.setLineDash?.([]);
      }
    };
    for (const b of bolts) if (b.depth < 0) bolt(b);
    // Axis of the explosion.
    c.setLineDash?.([10, 4, 2, 4]);
    c.strokeStyle = rgba(colors.text, 0.16);
    c.beginPath();
    const [ax0, ay0] = P(0, -0.15, 0);
    const [ax1, ay1] = P(0, shaft.y1 + 0.35, 0);
    c.moveTo(ax0, ay0); c.lineTo(ax1, ay1);
    c.stroke();
    c.setLineDash?.([]);
    // The stack from the bottom up; the shaft shows only where no part hides it.
    const shaftPiece = (y0, y1) => { if (y1 - y0 > 0.005) cylinder(shaft.r, y0, y1, 0.14); };
    let below = shaft.y0;
    shaftPiece(Math.max(below, 0.22), Math.min(parts[0].y0, shaft.y1));
    parts.forEach((p, k) => {
      cylinder(p.r, p.y0, p.y1, 0.06 + (k % 2) * 0.03, p.bore, p.teeth);
      below = p.y1;
      const next = parts[k + 1]?.y0 ?? shaft.y1;
      shaftPiece(Math.max(below, shaft.y0), Math.min(next, shaft.y1));
    });
    for (const b of bolts) if (b.depth >= 0) bolt(b);
    // Balloons, numbered as in a bill of materials.
    if (e > 0.05) {
      const font = Math.round((unit / 58) * Math.min(1.3, SIZE));
      c.font = `600 ${font}px ${SANS}`;
      c.textAlign = 'center';
      const corner = [[bw, bd], [bw, -bd], [-bw, bd], [-bw, -bd]].map(([x, z]) => P(x, bt, z)).sort((p, q) => q[2] - p[2] || q[0] - p[0])[0];
      const items = [[bt, 0, 1, corner], ...parts.map((p, k) => [(p.y0 + p.y1) / 2, p.r, k + 2]), [shaft.y1 - 0.15, shaft.r, 6]];
      for (const [y, r, label, at] of items) {
        const [x0, y0] = at ?? P(0, y, 0);
        const sx = at ? x0 : x0 + r * S;
        const bx = cx + S * 2.1 + (label % 2) * S * 0.25;
        const by = y0 - S * 0.15;
        c.strokeStyle = rgba(colors.text, 0.24 * e);
        c.fillStyle = rgba(colors.bg, 0.7 * e);
        c.beginPath();
        c.moveTo(sx, y0); c.lineTo(bx - font * 1.05, by);
        c.stroke();
        c.beginPath();
        c.arc(bx, by, font * 1.05, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = rgba(colors.text, 0.45 * e);
        c.fillText(String(label), bx, by + font * 0.36);
        c.fillStyle = rgba(colors.text, 0.4 * e);
        c.beginPath();
        c.arc(sx, y0, 2 * SIZE, 0, TAU);
        c.fill();
      }
      c.textAlign = 'start';
    }
  }

  /** A sheet-metal tray: the flat blank, its four flanges bent up one after another on the press brake, then flattened. */
  sheetMetal(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 18);
    const yaw = 0.55 + time * 0.09;
    const pitch = 0.6;
    const S = Math.min(unit * 0.28, w * 0.17);
    const cx = w / 2;
    const cy = h * 0.58;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const sp = Math.sin(pitch); const cp = Math.cos(pitch);
    const P = (x, y, z) => { const X = x * cyw - z * syw; const Z = x * syw + z * cyw; return [cx + X * S, cy - y * S * cp + Z * S * sp, Z * cp + y * sp]; };
    const a = 1.15;
    const b = 0.78;
    const f = 0.5;
    const t = 0.035;
    const bend = (k) => (Math.PI / 2) * smooth((phase - 0.08 - k * 0.1) / 0.12) * (1 - smooth((phase - 0.66 - (3 - k) * 0.05) / 0.1));
    // Each flange: hinge point, the way out when flat, the way up, and the edge it runs along (with its half length).
    const flanges = [
      { o: [a, 0, 0], out: [1, 0, 0], along: [0, 0, 1], len: b },
      { o: [-a, 0, 0], out: [-1, 0, 0], along: [0, 0, 1], len: b },
      { o: [0, 0, b], out: [0, 0, 1], along: [1, 0, 0], len: a - 0.05 },
      { o: [0, 0, -b], out: [0, 0, -1], along: [1, 0, 0], len: a - 0.05 },
    ];
    const add = (p, q, k) => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
    const faces = [];
    const baseFace = { pts: [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]], normal: [0, -1, 0], shade: 0.12, holes: [[-0.5, 0], [0.5, 0]].map(([x, z]) => circlePoly(0, 0, 0.13, 20).map(([u, v]) => [x + u, 0, z + v])) };
    faces.push(baseFace);
    flanges.forEach((fl, k) => {
      const phi = bend(k);
      fl.phi = phi;
      const dir = [fl.out[0] * Math.cos(phi), Math.sin(phi), fl.out[2] * Math.cos(phi)];
      fl.dir = dir;
      const e0 = add(fl.o, fl.along, -fl.len);
      const e1 = add(fl.o, fl.along, fl.len);
      const hole = circlePoly(0, 0, 0.08, 16).map(([u, v]) => add(add(fl.o, dir, f * 0.55 + u), fl.along, v));
      faces.push({ pts: [e0, e1, add(e1, dir, f), add(e0, dir, f)], normal: [fl.out[0] * Math.sin(phi), -Math.cos(phi), fl.out[2] * Math.sin(phi)], shade: 0.06 + 0.08 * Math.abs(Math.cos(phi + k)), holes: [hole] });
    });
    const depth = (pts) => pts.reduce((s, p) => s + P(...p)[2], 0) / pts.length;
    faces.forEach((fc) => { fc.depth = depth(fc.pts); });
    faces.sort((p, q) => p.depth - q.depth);
    const line = Math.max(1, w / 1200) * SIZE;
    c.lineJoin = 'round';
    // The flat pattern on the floor, dotted, so the bend is easy to read.
    c.lineWidth = Math.max(1, line * 0.7);
    c.setLineDash?.([2, 5]);
    c.strokeStyle = rgba(colors.text, 0.16);
    c.beginPath();
    const flat = [[-a, -b], [-a + 0.05, -b], [-a + 0.05, -b - f], [a - 0.05, -b - f], [a - 0.05, -b], [a, -b], [a + f, -b], [a + f, b], [a, b], [a - 0.05, b], [a - 0.05, b + f], [-a + 0.05, b + f], [-a + 0.05, b], [-a, b], [-a - f, b], [-a - f, -b]];
    flat.forEach(([x, z], k) => { const [sx, sy] = P(x, -0.004, z); c[k ? 'lineTo' : 'moveTo'](sx, sy); });
    c.closePath();
    c.stroke();
    c.setLineDash?.([]);
    const path = (pts) => { c.beginPath(); pts.forEach((p, k) => { const [x, y] = P(...p); c[k ? 'lineTo' : 'moveTo'](x, y); }); c.closePath(); };
    for (const fc of faces) {
      // The sheet's other skin, a thickness away, then the face with its holes.
      c.lineWidth = Math.max(1, line * 0.6);
      c.strokeStyle = rgba(colors.accent, 0.16);
      path(fc.pts.map((p) => add(p, fc.normal, t)));
      c.stroke();
      c.lineWidth = line;
      path(fc.pts);
      for (const hole of fc.holes) hole.forEach((p, k) => { const [x, y] = P(...p); c[k ? 'lineTo' : 'moveTo'](x, y); });
      c.fillStyle = rgba(colors.bg, 0.8);
      c.fill('evenodd');
      c.fillStyle = rgba(colors.accent, fc.shade);
      c.fill('evenodd');
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.stroke();
    }
    // Bend lines on the base and the angle of the flange being bent.
    c.lineWidth = Math.max(1, line * 0.7);
    c.setLineDash?.([8, 4, 2, 4]);
    c.strokeStyle = rgba(colors.text, 0.2);
    c.beginPath();
    for (const fl of flanges) {
      const p0 = P(...add(fl.o, fl.along, -fl.len));
      const p1 = P(...add(fl.o, fl.along, fl.len));
      c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]);
    }
    c.stroke();
    c.setLineDash?.([]);
    const active = flanges.find((fl) => fl.phi > 0.03 && fl.phi < Math.PI / 2 - 0.03) ?? flanges.find((fl) => fl.phi > 0.03);
    if (active) {
      const r = f * 0.75;
      const centre = add(active.o, active.along, active.len * 0.6);
      c.strokeStyle = rgba(colors.accent, 0.42);
      c.beginPath();
      for (let k = 0; k <= 16; k++) {
        const q = (k / 16) * active.phi;
        const p = P(...add(centre, [active.out[0] * Math.cos(q), Math.sin(q), active.out[2] * Math.cos(q)], r));
        c[k ? 'lineTo' : 'moveTo'](p[0], p[1]);
      }
      c.stroke();
      const tip = P(...add(centre, [active.out[0] * Math.cos(active.phi / 2), Math.sin(active.phi / 2), active.out[2] * Math.cos(active.phi / 2)], r * 1.35));
      const font = Math.round((unit / 52) * Math.min(1.3, SIZE));
      c.font = `${font}px ${SANS}`;
      c.textAlign = 'center';
      c.fillStyle = rgba(colors.text, 0.45);
      c.fillText(`${Math.round((active.phi * 180) / Math.PI)}°`, tip[0], tip[1]);
      c.textAlign = 'start';
    }
  }

  /** A Warren truss being welded joint by joint: the arc glows, sparks fly and the bead cools behind it. */
  weldBead(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 26);
    const fade = fadeInOut(phase, 0.06, 0.03);
    const L = Math.min(w * 0.8, unit * 1.6);
    const H = Math.min(h * 0.36, L * 0.3);
    const x0 = w / 2 - L / 2;
    const yb = h / 2 + H / 2;
    const yt = h / 2 - H / 2;
    const t = unit * 0.034;
    const n = 6;
    const panel = L / n;
    const td = t * 0.72;
    const line = Math.max(1, w / 1200) * SIZE;
    const sun = warm(colors);
    // Members: two chords and the diagonals between them, mitred onto the chords' inner faces.
    const over = panel * 0.12;
    const members = [[x0 - over, yt - t / 2, x0 + L + over, yt - t / 2, x0 + L + over, yt + t / 2, x0 - over, yt + t / 2], [x0 - over, yb - t / 2, x0 + L + over, yb - t / 2, x0 + L + over, yb + t / 2, x0 - over, yb + t / 2]];
    const seams = [];
    const inBot = yb - t / 2;
    const inTop = yt + t / 2;
    for (let k = 0; k < n * 2; k++) {
      const up = k % 2 === 0;
      const xA = x0 + Math.floor((k + 1) / 2) * panel;
      const xB = x0 + (Math.floor(k / 2) + 0.5) * panel;
      const [fx, fy, tx, ty] = up ? [xA, inBot, xB, inTop] : [xB, inTop, x0 + (Math.floor(k / 2) + 1) * panel, inBot];
      const sin = Math.abs(ty - fy) / Math.hypot(tx - fx, ty - fy);
      const hw = td / 2 / sin;
      members.push([fx - hw, fy, fx + hw, fy, tx + hw, ty, tx - hw, ty]);
      seams.push([fx - hw * 1.15, fy, fx + hw * 1.15, fy], [tx - hw * 1.15, ty, tx + hw * 1.15, ty]);
    }
    // Two diagonals meet at each node: one seam per joint.
    const joints = [...new Map(seams.map((sm) => [`${Math.round(sm[0])},${Math.round(sm[1])}`, sm])).values()];
    seams.length = 0;
    seams.push(...joints.sort((p, q) => p[0] - q[0]));
    c.lineJoin = 'round';
    c.lineWidth = line;
    c.beginPath();
    for (const m of members) { c.moveTo(m[0], m[1]); for (let k = 2; k < 8; k += 2) c.lineTo(m[k], m[k + 1]); c.closePath(); }
    c.fillStyle = rgba(colors.accent, 0.08 * fade);
    c.fill();
    c.strokeStyle = rgba(colors.accent, 0.34 * fade);
    c.stroke();
    // Tube walls: a thin inner line along every member.
    c.lineWidth = Math.max(1, line * 0.5);
    c.strokeStyle = rgba(colors.text, 0.08 * fade);
    c.beginPath();
    for (const y of [yt, yb]) { c.moveTo(x0 - over, y - t * 0.3); c.lineTo(x0 + L + over, y - t * 0.3); c.moveTo(x0 - over, y + t * 0.3); c.lineTo(x0 + L + over, y + t * 0.3); }
    c.stroke();
    // Welding: travel along each seam in turn, with a short pause to move the torch.
    const perSeam = 0.84 / seams.length;
    const now = clamp01((phase - 0.04) / 0.84) * seams.length;
    const bead = t * 0.42;
    c.lineCap = 'round';
    let arc = null;
    seams.forEach((s, k) => {
      const local = clamp01((now - k) / 0.8);
      if (!local) return;
      const ex = s[0] + (s[2] - s[0]) * local;
      const age = Math.max(0, now - k - 0.8) * perSeam * 26;
      const heat = Math.exp(-age * 0.9);
      c.lineWidth = bead;
      c.strokeStyle = rgba(colors.text, 0.2 * fade);
      c.beginPath();
      c.moveTo(s[0], s[1]); c.lineTo(ex, s[1]);
      c.stroke();
      if (heat > 0.02) {
        c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
        c.strokeStyle = rgba(sun, (colors.dark ? 0.3 : 0.4) * heat * fade);
        c.stroke();
        c.globalCompositeOperation = 'source-over';
      }
      // Ripples of the bead.
      c.lineWidth = Math.max(1, line * 0.5);
      c.strokeStyle = rgba(colors.text, 0.2 * fade);
      c.beginPath();
      for (let x = s[0] + bead * 0.4; x < ex - bead * 0.2; x += bead * 0.45) { c.moveTo(x - bead * 0.2, s[1] - bead * 0.42); c.quadraticCurveTo(x + bead * 0.18, s[1], x - bead * 0.2, s[1] + bead * 0.42); }
      c.stroke();
      if (local < 1) arc = [ex, s[1], s[1] < h / 2 ? 1 : -1];
    });
    if (arc && fade > 0.05) {
      const [ax, ay, side] = arc;
      const flicker = 0.8 + 0.2 * Math.sin(time * 47) * Math.sin(time * 31);
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      const glow = c.createRadialGradient(ax, ay, 0, ax, ay, t * 3.2);
      glow.addColorStop(0, rgba(colors.dark ? '#ffffff' : sun, (colors.dark ? 0.6 : 0.4) * flicker * fade));
      glow.addColorStop(0.25, rgba(sun, (colors.dark ? 0.3 : 0.16) * flicker * fade));
      glow.addColorStop(1, rgba(sun, 0));
      c.fillStyle = glow;
      c.fillRect(ax - t * 3.2, ay - t * 3.2, t * 6.4, t * 6.4);
      // Sparks: thrown away from the joint, falling.
      c.lineWidth = Math.max(1, line * 0.8);
      c.strokeStyle = rgba(sun, 0.55 * fade);
      c.beginPath();
      for (let k = 0; k < 16; k++) {
        const life = mod(time * 1.6 + hash(k, 5), 1);
        const seed = Math.floor(time * 1.6 + hash(k, 5));
        const dir = (Math.PI / 2) * side + (hash(k, seed) - 0.5) * 2.6;
        const v = t * (3 + hash(seed, k) * 5);
        const sx = ax + Math.cos(dir) * v * life;
        const sy = ay + Math.sin(dir) * v * life + t * 4 * life * life;
        c.moveTo(sx, sy);
        c.lineTo(sx - Math.cos(dir) * t * 0.35, sy - (Math.sin(dir) + life * 1.6) * t * 0.35);
      }
      c.stroke();
      c.globalCompositeOperation = 'source-over';
      // The torch, coming in at an angle from the open side.
      const tx = ax + t * 1.6;
      const ty = ay + side * t * 2.2;
      c.lineWidth = Math.max(1.5, line * 1.4);
      c.strokeStyle = rgba(colors.text, 0.32 * fade);
      c.beginPath();
      c.moveTo(ax + t * 0.25, ay + side * t * 0.35);
      c.lineTo(tx, ty + side * t * 0.6);
      c.lineTo(tx + t * 1.8, ty + side * t * 3.2);
      c.stroke();
    }
  }

  /** A twisted vase printed layer by layer on an FDM printer: the nozzle traces each layer over the infill. */
  printLayers(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 30);
    const fade = fadeInOut(phase, 0.06, 0.02);
    const S = Math.min(unit * 0.24, w * 0.16);
    const cx = w / 2;
    const bed = h * 0.7;
    const NL = 40;
    const Hp = 1.55;
    const dz = Hp / NL;
    const cos30 = Math.cos(Math.PI / 6);
    const P = (x, y, z) => [cx + (x - y) * cos30 * S, bed + (x + y) * 0.5 * S - z * S];
    const radius = (z) => 0.62 + 0.22 * Math.sin((z / Hp) * Math.PI * 1.15 + 0.35);
    const contour = (z) => {
      const R = radius(z);
      return Array.from({ length: 73 }, (_, j) => {
        const th = (j / 72) * TAU;
        const r = R * (1 + 0.09 * Math.cos(5 * th + z * 2.2));
        return [Math.cos(th) * r, Math.sin(th) * r];
      });
    };
    const line = Math.max(1, w / 1400) * SIZE;
    // The bed with its grid.
    c.lineWidth = Math.max(1, line * 0.7);
    c.fillStyle = rgba(colors.text, 0.035);
    c.strokeStyle = rgba(colors.text, 0.16);
    const B = 1.15;
    c.beginPath();
    [[-B, -B], [B, -B], [B, B], [-B, B]].forEach(([x, y], k) => { const p = P(x, y, 0); c[k ? 'lineTo' : 'moveTo'](p[0], p[1]); });
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = rgba(colors.text, 0.06);
    c.beginPath();
    for (let g = -B + 0.23; g < B - 0.01; g += 0.23) {
      let p = P(g, -B, 0); c.moveTo(p[0], p[1]); p = P(g, B, 0); c.lineTo(p[0], p[1]);
      p = P(-B, g, 0); c.moveTo(p[0], p[1]); p = P(B, g, 0); c.lineTo(p[0], p[1]);
    }
    c.stroke();
    const built = clamp01((phase - 0.03) / 0.85) * NL;
    const full = Math.floor(built);
    const part = built - full;
    // Finished layers: the back half faint, the front half (towards us) stronger, and the outline of the walls.
    const left = [];
    const right = [];
    const back = new Path2D();
    const front = new Path2D();
    for (let k = 0; k < Math.min(full, NL); k++) {
      const z = (k + 1) * dz;
      const pts = contour(z).map(([x, y]) => [P(x, y, z), x + y]);
      let lo = pts[0][0];
      let hi = pts[0][0];
      for (let j = 1; j < pts.length; j++) {
        const [a] = pts[j - 1];
        const [b2, d] = pts[j];
        const target = d + pts[j - 1][1] > 0 ? front : back;
        target.moveTo(a[0], a[1]); target.lineTo(b2[0], b2[1]);
        if (b2[0] < lo[0]) lo = b2;
        if (b2[0] > hi[0]) hi = b2;
      }
      left.push(lo);
      right.push(hi);
    }
    c.lineWidth = Math.max(1, line * 0.8);
    c.strokeStyle = rgba(colors.accent, 0.06 * fade);
    c.stroke(back);
    c.strokeStyle = rgba(colors.accent, 0.17 * fade);
    c.stroke(front);
    c.lineWidth = line;
    c.strokeStyle = rgba(colors.accent, 0.36 * fade);
    for (const side of [left, right]) { c.beginPath(); side.forEach((p, k) => c[k ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke(); }
    // The top layer: infill clipped to its outline (alternating direction each layer), then the wall being laid.
    if (full < NL) {
      const z = (full + 1) * dz;
      const outline = contour(z);
      const shape = new Path2D();
      outline.forEach(([x, y], k) => { const p = P(x, y, z); shape[k ? 'lineTo' : 'moveTo'](p[0], p[1]); });
      shape.closePath();
      c.save();
      c.clip(shape);
      c.strokeStyle = rgba(colors.accent, 0.16 * fade);
      c.beginPath();
      for (let g = -1; g <= 1; g += 0.1) {
        const p0 = full % 2 ? P(g, -1, z) : P(-1, g, z);
        const p1 = full % 2 ? P(g, 1, z) : P(1, g, z);
        c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]);
      }
      c.stroke();
      c.restore();
      const n = Math.max(1, Math.floor(part * (outline.length - 1)));
      const pts = outline.slice(0, n + 1).map(([x, y]) => P(x, y, z));
      c.lineWidth = Math.max(1.2, line * 1.3);
      c.strokeStyle = rgba(colors.accent, 0.45 * fade);
      c.beginPath();
      pts.forEach((p, k) => c[k ? 'lineTo' : 'moveTo'](p[0], p[1]));
      c.stroke();
      const hot = pts.slice(Math.max(0, pts.length - 14));
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      c.strokeStyle = rgba(warm(colors), (colors.dark ? 0.35 : 0.55) * fade);
      c.beginPath();
      hot.forEach((p, k) => c[k ? 'lineTo' : 'moveTo'](p[0], p[1]));
      c.stroke();
      c.globalCompositeOperation = 'source-over';
      // Print head: heater block, nozzle and the X gantry it rides on.
      const [nx, ny] = pts.at(-1);
      const [hx, hy] = outline[n];
      const gantry = z + 0.42;
      c.lineWidth = Math.max(1, line * 0.9);
      c.strokeStyle = rgba(colors.text, 0.22 * fade);
      c.beginPath();
      for (const off of [0, 0.07]) { const p0 = P(-B, hy, gantry + off); const p1 = P(B, hy, gantry + off); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); }
      c.stroke();
      void hx;
      const s = unit * 0.035;
      c.fillStyle = rgba(colors.bg, 0.75 * fade);
      c.strokeStyle = rgba(colors.text, 0.4 * fade);
      c.beginPath();
      c.moveTo(nx, ny); c.lineTo(nx - s * 0.3, ny - s * 0.5); c.lineTo(nx + s * 0.3, ny - s * 0.5); c.closePath();
      c.rect(nx - s * 0.8, ny - s * 1.3, s * 1.6, s * 0.8);
      c.rect(nx - s * 0.55, ny - s * 2.6, s * 1.1, s * 1.3);
      c.fill();
      c.stroke();
      c.beginPath();
      for (let k = 1; k < 5; k++) { c.moveTo(nx - s * 0.55, ny - s * 1.3 - k * s * 0.26); c.lineTo(nx + s * 0.55, ny - s * 1.3 - k * s * 0.26); }
      c.stroke();
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      c.fillStyle = rgba(warm(colors), 0.6 * fade);
      c.beginPath();
      c.arc(nx, ny, 2.2 * SIZE, 0, TAU);
      c.fill();
      c.globalCompositeOperation = 'source-over';
      const font = Math.round((unit / 62) * Math.min(1.3, SIZE));
      c.font = `${font}px ${MONO}`;
      c.fillStyle = rgba(colors.text, 0.34 * fade);
      const corner = P(-B, B, 0);
      c.textAlign = 'right';
      c.fillText(`Layer ${full + 1}/${NL}  Z ${(z * 40).toFixed(2)}`, corner[0] - font, corner[1] + font * 0.35);
      c.textAlign = 'start';
    } else {
      const top = contour(NL * dz);
      c.strokeStyle = rgba(colors.accent, 0.4 * fade);
      c.beginPath();
      top.forEach(([x, y], k) => { const p = P(x, y, NL * dz); c[k ? 'lineTo' : 'moveTo'](p[0], p[1]); });
      c.stroke();
    }
  }

  /** Nuts turning onto bolts and off again: each advances one thread pitch per turn. */
  threading(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const rows = [[0.27, 0.075, 0.6, 0], [0.52, 0.095, 0.7, 1], [0.77, 0.065, 0.55, 2]];
    const line = Math.max(1, w / 1300) * SIZE;
    c.lineJoin = 'round';
    for (const [fy, fd, fl, k] of rows) {
      const d = unit * fd;
      const y = h * fy;
      const len = w * fl;
      const flip = k % 2 ? -1 : 1;
      const head = d * 0.7;
      const xHead = w / 2 - (flip * (len + head)) / 2;
      const xEnd = xHead + flip * (head + len);
      const p = d * 0.24;
      // Hexagon prism seen from the side: its edges are lines along the axis; front faces shaded.
      const hex = (xa, xb, turn, R) => {
        const x1 = Math.min(xa, xb);
        const wd = Math.abs(xb - xa);
        const ys = [];
        for (let j = 0; j < 6; j++) { const a = turn + (j * Math.PI) / 3; ys.push([Math.cos(a) * R, Math.sin(a)]); }
        let top = -Infinity;
        for (const [yy] of ys) top = Math.max(top, yy);
        c.fillStyle = rgba(colors.bg, 0.9);
        c.fillRect(x1, y - top, wd, top * 2);
        for (let j = 0; j < 6; j++) {
          const [ya, za] = ys[j];
          const [yb, zb] = ys[(j + 1) % 6];
          if (za + zb <= 0) continue;
          const lit = clamp01(0.5 + (za + zb) * 0.25 - (ya + yb) / R * 0.25);
          c.fillStyle = rgba(colors.accent, 0.05 + lit * 0.1);
          c.fillRect(x1, y + Math.min(ya, yb), wd, Math.abs(yb - ya));
        }
        c.strokeStyle = rgba(colors.accent, 0.4);
        c.lineWidth = line;
        c.beginPath();
        c.rect(x1, y - top, wd, top * 2);
        for (const [yy, z] of ys) if (z > 0.02 && Math.abs(yy) < top - 0.5) { c.moveTo(x1, y + yy); c.lineTo(x1 + wd, y + yy); }
        c.stroke();
        // Chamfer arcs at both ends.
        c.strokeStyle = rgba(colors.accent, 0.2);
        c.beginPath();
        c.moveTo(x1 + wd * 0.06, y - top); c.quadraticCurveTo(x1, y, x1 + wd * 0.06, y + top);
        c.moveTo(x1 + wd * 0.94, y - top); c.quadraticCurveTo(x1 + wd, y, x1 + wd * 0.94, y + top);
        c.stroke();
      };
      // Shank and threads (crest lines slant by half a pitch across the diameter).
      const xs0 = xHead + flip * head;
      c.fillStyle = rgba(colors.accent, 0.07);
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.lineWidth = line;
      c.beginPath();
      c.rect(Math.min(xs0, xEnd), y - d / 2, len, d);
      c.fill();
      c.stroke();
      c.strokeStyle = rgba(colors.accent, 0.24);
      c.beginPath();
      const threadFrom = xs0 + flip * len * 0.25;
      for (let x = threadFrom; flip > 0 ? x < xEnd - p : x > xEnd + p; x += flip * p) {
        c.moveTo(x, y - d / 2); c.lineTo(x + flip * p * 0.5, y + d / 2);
      }
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      c.moveTo(threadFrom, y - d * 0.4); c.lineTo(xEnd, y - d * 0.4);
      c.moveTo(threadFrom, y + d * 0.4); c.lineTo(xEnd, y + d * 0.4);
      c.stroke();
      // Centre line.
      c.setLineDash?.([d * 0.6, d * 0.15, d * 0.08, d * 0.15]);
      c.strokeStyle = rgba(colors.text, 0.16);
      c.beginPath();
      c.moveTo(xHead - flip * d * 0.4, y); c.lineTo(xEnd + flip * d * 0.4, y);
      c.stroke();
      c.setLineDash?.([]);
      hex(xHead, xHead + flip * head, 0.35 + k, d * 0.92);
      // The nut: on from the free end, up to the washer, and back off.
      const period = 11 + k * 2;
      const q = mod(time / period + k * 0.31, 1);
      const travel = len * 0.72 * smooth(q < 0.5 ? q / 0.42 : (1 - q) / 0.42);
      const nutW = d * 0.85;
      const xn = xEnd - flip * (nutW + d * 0.1 + travel);
      const turn = (travel / p) * TAU * flip;
      const xw = xs0 + flip * len * 0.06;
      c.fillStyle = rgba(colors.accent, 0.08);
      c.strokeStyle = rgba(colors.accent, 0.3);
      c.beginPath();
      c.rect(Math.min(xw, xw + flip * d * 0.12), y - d * 1.0, d * 0.12, d * 2.0);
      c.fill();
      c.stroke();
      hex(xn, xn + flip * nutW, turn, d * 0.92);
    }
  }

  /** Ball bearings: the inner ring and shaft turn, the cage follows at its own slower speed and every ball spins back. */
  bearing(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const line = Math.max(1, w / 1200) * SIZE;
    const one = (cx, cy, size, balls, speed) => {
      const Do = size;
      const Ro = size * 0.77;
      const Ri = size * 0.47;
      const Rb = size * 0.3;
      const d = (Ro - Ri) * 0.9;
      const Rp = (Ro + Ri) / 2;
      const inner = time * speed;
      // Kinematics with the outer ring fixed: cage at ω/2·(1 − d/Dp), each ball at −2·Rp/d times the cage.
      const cage = (inner / 2) * (1 - d / (2 * Rp));
      const spin = (-2 * cage * Rp) / d;
      c.lineWidth = line;
      // Outer ring.
      c.beginPath();
      c.arc(cx, cy, Do, 0, TAU);
      c.moveTo(cx + Ro + d * 0.08, cy);
      c.arc(cx, cy, Ro + d * 0.08, 0, TAU, true);
      c.fillStyle = rgba(colors.accent, 0.08);
      c.fill('evenodd');
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      c.arc(cx, cy, Do * 0.93, 0, TAU);
      c.stroke();
      // Inner ring and the shaft section (hatched, with a key) turning together.
      c.beginPath();
      c.arc(cx, cy, Ri - d * 0.08, 0, TAU);
      c.moveTo(cx + Rb, cy);
      c.arc(cx, cy, Rb, 0, TAU, true);
      c.fillStyle = rgba(colors.accent, 0.11);
      c.fill('evenodd');
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.stroke();
      c.save();
      c.beginPath();
      c.arc(cx, cy, Rb, 0, TAU);
      c.clip();
      c.setTransform(Math.cos(inner), Math.sin(inner), -Math.sin(inner), Math.cos(inner), cx, cy);
      c.strokeStyle = rgba(colors.text, 0.14);
      c.lineWidth = Math.max(1, line * 0.6);
      c.beginPath();
      for (let k = -Rb * 1.5; k < Rb * 1.5; k += Rb * 0.16) { c.moveTo(k - Rb, -Rb * 1.2); c.lineTo(k + Rb, Rb * 1.2); }
      c.stroke();
      c.restore();
      c.setTransform(Math.cos(inner), Math.sin(inner), -Math.sin(inner), Math.cos(inner), cx, cy);
      c.lineWidth = line;
      c.fillStyle = rgba(colors.bg, 0.85);
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.beginPath();
      c.rect(-Rb * 0.2, -Rb * 1.08, Rb * 0.4, Rb * 0.32);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.4);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; c.beginPath(); c.arc(Math.cos(a) * (Ri + Rb) * 0.5, Math.sin(a) * (Ri + Rb) * 0.5, Math.max(1.5, size * 0.018), 0, TAU); c.fill(); }
      c.setTransform(1, 0, 0, 1, 0, 0);
      // Cage: a ring with a pocket for every ball.
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      c.arc(cx, cy, Rp + d * 0.2, 0, TAU);
      c.moveTo(cx + Rp - d * 0.2, cy);
      c.arc(cx, cy, Rp - d * 0.2, 0, TAU);
      c.stroke();
      c.setLineDash?.([d * 0.5, d * 0.14, d * 0.07, d * 0.14]);
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      c.arc(cx, cy, Rp, 0, TAU);
      c.stroke();
      c.setLineDash?.([]);
      for (let k = 0; k < balls; k++) {
        const a = cage + (k / balls) * TAU;
        const bx = cx + Math.cos(a) * Rp;
        const by = cy + Math.sin(a) * Rp;
        const r = d / 2;
        c.fillStyle = rgba(colors.bg, 0.9);
        c.strokeStyle = rgba(colors.accent, 0.42);
        c.beginPath();
        c.arc(bx, by, r, 0, TAU);
        c.fill();
        c.fillStyle = rgba(colors.accent, 0.1);
        c.fill();
        c.stroke();
        // A mark on the ball shows its spin; the highlight stays put.
        const sa = spin + k;
        c.strokeStyle = rgba(colors.text, 0.22);
        c.beginPath();
        c.moveTo(bx + Math.cos(sa) * r * 0.75, by + Math.sin(sa) * r * 0.75);
        c.lineTo(bx - Math.cos(sa) * r * 0.75, by - Math.sin(sa) * r * 0.75);
        c.stroke();
        c.fillStyle = rgba(colors.text, colors.dark ? 0.22 : 0.3);
        c.beginPath();
        c.arc(bx - r * 0.35, by - r * 0.35, r * 0.16, 0, TAU);
        c.fill();
      }
      c.strokeStyle = rgba(colors.text, 0.18);
      c.beginPath();
      c.moveTo(cx - Do * 1.12, cy); c.lineTo(cx + Do * 1.12, cy);
      c.moveTo(cx, cy - Do * 1.12); c.lineTo(cx, cy + Do * 1.12);
      c.stroke();
    };
    one(w * 0.6, h * 0.52, unit * 0.36, 9, 0.5);
    one(w * 0.24, h * 0.3, unit * 0.17, 8, -0.9);
    one(w * 0.86, h * 0.84, unit * 0.12, 7, 1.2);
  }

  /** Compression springs squeezed and released between their plates, each at its own pace, with the length dimensioned. */
  spring(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const springs = [[0.18, 0.06, 8, 0], [0.4, 0.08, 6, 1.6], [0.62, 0.05, 10, 3.1], [0.83, 0.07, 7, 4.4]];
    const yb = h * 0.82;
    const L0 = h * 0.56;
    const line = Math.max(1, w / 1200) * SIZE;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // Floor.
    c.lineWidth = line;
    c.strokeStyle = rgba(colors.text, 0.22);
    c.beginPath();
    c.moveTo(w * 0.05, yb + unit * 0.03); c.lineTo(w * 0.95, yb + unit * 0.03);
    for (let x = w * 0.05; x < w * 0.95; x += unit * 0.025) { c.moveTo(x, yb + unit * 0.03); c.lineTo(x - unit * 0.02, yb + unit * 0.05); }
    c.stroke();
    springs.forEach(([fx, fr, coils, ph], k) => {
      const cx = w * fx;
      const r = unit * fr;
      const squeeze = 0.5 - 0.5 * Math.cos(time * (0.55 + k * 0.08) + ph);
      const L = L0 * (1 - 0.42 * squeeze);
      const top = yb - L;
      const wire = Math.max(2, r * 0.17);
      // Closed and ground ends: a turn at each end with a pitch of one wire, the active turns spread between.
      const turns = coils + 2;
      const endH = wire * 1.05;
      const active = L - 2 * endH - wire;
      const yAt = (s) => {
        const u = s / TAU;
        if (u < 1) return yb - wire / 2 - u * endH;
        if (u > turns - 1) return top + wire / 2 + (turns - u) * endH;
        return yb - wire / 2 - endH - ((u - 1) / coils) * active;
      };
      const back = new Path2D();
      const front = new Path2D();
      const n = turns * 24;
      let prev = null;
      for (let j = 0; j <= n; j++) {
        const s = (j / n) * turns * TAU;
        const p = [cx + Math.sin(s) * r, yAt(s)];
        if (prev) { const path = Math.cos(s - Math.PI / 24) > 0 ? front : back; path.moveTo(prev[0], prev[1]); path.lineTo(p[0], p[1]); }
        prev = p;
      }
      c.lineWidth = wire;
      c.strokeStyle = rgba(colors.text, 0.08);
      c.stroke(back);
      c.strokeStyle = rgba(colors.accent, 0.2 + 0.08 * squeeze);
      c.stroke(front);
      c.lineWidth = Math.max(1, line * 0.7);
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.stroke(front);
      // Plates, the rod and the load arrow.
      c.lineWidth = line;
      c.fillStyle = rgba(colors.accent, 0.1);
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.beginPath();
      c.rect(cx - r * 1.5, top - unit * 0.025, r * 3, unit * 0.025);
      c.rect(cx - r * 1.5, yb, r * 3, unit * 0.03);
      c.rect(cx - r * 0.18, top - unit * 0.025 - h * 0.08, r * 0.36, h * 0.08);
      c.fill();
      c.stroke();
      const force = 0.3 + squeeze;
      const ay = top - unit * 0.025 - h * 0.08;
      c.fillStyle = rgba(colors.text, 0.3);
      c.strokeStyle = rgba(colors.text, 0.3);
      c.beginPath();
      c.moveTo(cx, ay - unit * 0.1 * force); c.lineTo(cx, ay - 4);
      c.stroke();
      c.beginPath();
      arrowHead(c, cx, ay - 2, Math.PI / 2, unit * 0.018);
      c.fill();
      // The spring's length, dimensioned on its right.
      const dx = cx + r * 1.5 + unit * 0.035;
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      c.moveTo(cx + r * 1.55, top); c.lineTo(dx + unit * 0.012, top);
      c.moveTo(cx + r * 1.55, yb); c.lineTo(dx + unit * 0.012, yb);
      c.moveTo(dx, top); c.lineTo(dx, yb);
      c.stroke();
      c.fillStyle = rgba(colors.text, 0.24);
      c.beginPath();
      arrowHead(c, dx, top, -Math.PI / 2, unit * 0.012);
      arrowHead(c, dx, yb, Math.PI / 2, unit * 0.012);
      c.fill();
      const font = Math.round((unit / 62) * Math.min(1.3, SIZE));
      c.font = `${font}px ${SANS}`;
      c.save();
      c.translate(dx - font * 0.4, (top + yb) / 2);
      c.rotate(-Math.PI / 2);
      c.textAlign = 'center';
      c.fillStyle = rgba(colors.text, 0.4);
      c.fillText(((L / L0) * 90).toFixed(1), 0, 0);
      c.restore();
    });
  }

  /** A disc cam turning under a roller follower, the follower's lift traced onto a displacement diagram. */
  cam(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const cx = w * 0.3;
    const cy = h * 0.68;
    const rb = unit * 0.15;
    const lift = unit * 0.11;
    const rr = unit * 0.036;
    // Cycloidal rise over 120°, dwell, cycloidal return over 120°, dwell.
    const s = (beta) => {
      const b = mod(beta, TAU);
      const third = TAU / 3;
      const cyc = (x) => x - Math.sin(TAU * x) / TAU;
      if (b < third) return lift * cyc(b / third);
      if (b < third * 1.5) return lift;
      if (b < third * 2.5) return lift * (1 - cyc((b - third * 1.5) / third));
      return 0;
    };
    const N = 180;
    const profile = Array.from({ length: N }, (_, j) => { const b = (j / N) * TAU; return [b, rb + s(b)]; });
    const alpha = -time * 0.7;
    const pts = profile.map(([b, r]) => [cx + Math.cos(b + alpha) * r, cy + Math.sin(b + alpha) * r]);
    // The roller sits on the highest point it can touch.
    const rollerAt = (points) => {
      let y = Infinity;
      for (const [x, py] of points) { const dx = x - cx; if (Math.abs(dx) < rr) y = Math.min(y, py - Math.sqrt(rr * rr - dx * dx)); }
      return y;
    };
    const ry = rollerAt(pts);
    const rest = cy - rb - rr;
    const line = Math.max(1, w / 1200) * SIZE;
    c.lineWidth = line;
    c.lineJoin = 'round';
    c.beginPath();
    polyPath(c, pts);
    c.moveTo(cx + rb * 0.22, cy);
    c.arc(cx, cy, rb * 0.22, 0, TAU);
    c.fillStyle = rgba(colors.accent, 0.1);
    c.fill('evenodd');
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.stroke();
    c.setLineDash?.([6, 5]);
    c.strokeStyle = rgba(colors.text, 0.14);
    c.beginPath();
    c.arc(cx, cy, rb, 0, TAU);
    c.stroke();
    c.setLineDash?.([]);
    c.setTransform(Math.cos(alpha), Math.sin(alpha), -Math.sin(alpha), Math.cos(alpha), cx, cy);
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.beginPath();
    c.rect(-rb * 0.06, -rb * 0.3, rb * 0.12, rb * 0.1);
    c.moveTo(0, 0); c.lineTo(rb * 0.85, 0);
    c.stroke();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = rgba(colors.text, 0.2);
    c.beginPath();
    c.moveTo(cx - rb * 1.6, cy); c.lineTo(cx + rb * 1.6, cy);
    c.moveTo(cx, cy + rb * 1.6); c.lineTo(cx, cy - rb * 0.3);
    c.stroke();
    // Follower: roller, fork, stem through its guide, and the return spring.
    const guideY = rest - lift - unit * 0.15;
    c.fillStyle = rgba(colors.text, 0.06);
    c.strokeStyle = rgba(colors.text, 0.26);
    c.beginPath();
    c.rect(cx - rr * 1.6, guideY - unit * 0.05, rr * 0.9, unit * 0.1);
    c.rect(cx + rr * 0.7, guideY - unit * 0.05, rr * 0.9, unit * 0.1);
    c.fill();
    c.stroke();
    c.fillStyle = rgba(colors.accent, 0.1);
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.beginPath();
    c.rect(cx - rr * 0.35, guideY - unit * 0.07 + (ry - rest), rr * 0.7, unit * 0.07 + rest - guideY);
    c.moveTo(cx - rr * 1.15, ry - rr * 0.2); c.lineTo(cx - rr * 1.15, ry - rr * 1.5); c.lineTo(cx + rr * 1.15, ry - rr * 1.5); c.lineTo(cx + rr * 1.15, ry - rr * 0.2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(cx, ry, rr, 0, TAU);
    c.moveTo(cx + rr * 0.25, ry);
    c.arc(cx, ry, rr * 0.25, 0, TAU);
    c.fillStyle = rgba(colors.bg, 0.8);
    c.fill();
    c.stroke();
    const spinRoller = time * 4;
    c.beginPath();
    c.moveTo(cx + Math.cos(spinRoller) * rr * 0.9, ry + Math.sin(spinRoller) * rr * 0.9);
    c.lineTo(cx + Math.cos(spinRoller) * rr * 0.3, ry + Math.sin(spinRoller) * rr * 0.3);
    c.stroke();
    const collar = ry - rr * 1.5;
    const springTop = guideY + unit * 0.05;
    c.strokeStyle = rgba(colors.text, 0.24);
    c.beginPath();
    const zig = 9;
    for (let k = 0; k <= zig; k++) { const y = springTop + ((collar - springTop) * k) / zig; c[k ? 'lineTo' : 'moveTo'](cx + (k % 2 ? rr * 1.2 : -rr * 1.2), y); }
    c.stroke();
    // Displacement diagram: s against cam angle, with the current point and its projection.
    const gx = Math.max(cx + rb * 2.2, w * 0.5);
    const gw = Math.min(w * 0.42, w - gx - w * 0.05);
    const gy = rest - lift * 1.35;
    const gh = lift * 1.35 + unit * 0.02;
    c.strokeStyle = rgba(colors.text, 0.2);
    c.lineWidth = Math.max(1, line * 0.8);
    c.beginPath();
    c.moveTo(gx, gy - unit * 0.02); c.lineTo(gx, rest); c.lineTo(gx + gw, rest);
    for (let k = 1; k <= 4; k++) { const x = gx + (gw * k) / 4; c.moveTo(x, rest); c.lineTo(x, rest + unit * 0.012); }
    c.stroke();
    c.setLineDash?.([3, 6]);
    c.strokeStyle = rgba(colors.text, 0.08);
    c.beginPath();
    for (let k = 1; k <= 3; k++) { const x = gx + (gw * k) / 4; c.moveTo(x, gy); c.lineTo(x, rest); }
    c.stroke();
    c.setLineDash?.([]);
    const contact = mod(-Math.PI / 2 - alpha, TAU);
    c.strokeStyle = rgba(colors.accent, 0.16);
    c.beginPath();
    for (let k = 0; k <= 120; k++) { const b = (k / 120) * TAU; c[k ? 'lineTo' : 'moveTo'](gx + (gw * b) / TAU, rest - s(b)); }
    c.stroke();
    c.lineWidth = line;
    c.strokeStyle = rgba(colors.accent, 0.42);
    c.beginPath();
    for (let k = 0; k <= 120 * (contact / TAU); k++) { const b = (k / 120) * TAU; c[k ? 'lineTo' : 'moveTo'](gx + (gw * b) / TAU, rest - s(b)); }
    c.stroke();
    const px = gx + (gw * contact) / TAU;
    const py = ry;
    c.setLineDash?.([4, 5]);
    c.strokeStyle = rgba(colors.text, 0.16);
    c.beginPath();
    c.moveTo(cx + rr * 1.3, py); c.lineTo(px, py);
    c.stroke();
    c.setLineDash?.([]);
    c.fillStyle = rgba(colors.accent, 0.6);
    c.beginPath();
    c.arc(px, py, 3 * SIZE, 0, TAU);
    c.fill();
    const font = Math.round((unit / 62) * Math.min(1.3, SIZE));
    c.font = `${font}px ${SANS}`;
    c.fillStyle = rgba(colors.text, 0.36);
    c.textAlign = 'center';
    ['0°', '90°', '180°', '270°', '360°'].forEach((label, k) => c.fillText(label, gx + (gw * k) / 4, rest + font * 1.9));
    c.textAlign = 'start';
    c.fillText(`s = ${((rest - ry) / lift * 12).toFixed(2)} mm`, gx + font * 0.6, gy - font * 0.4);
  }

  /** Two conveyors running opposite ways: rollers turning at belt speed, parts riding past a scanner gate. */
  conveyor(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const line = Math.max(1, w / 1200) * SIZE;
    const belts = [
      { y: h * 0.7, x0: w * 0.06, x1: w * 0.94, r: unit * 0.038, dir: 1, v: unit * 0.085, gate: 0.62 },
      { y: h * 0.33, x0: w * 0.16, x1: w * 0.84, r: unit * 0.03, dir: -1, v: unit * 0.065, gate: 0 },
    ];
    const sun = warm(colors);
    belts.forEach((b, bi) => {
      const len = b.x1 - b.x0;
      const travel = time * b.v;
      const bt = b.r * 0.22;
      c.lineWidth = line;
      c.lineJoin = 'round';
      // Frame, legs and floor.
      c.strokeStyle = rgba(colors.text, 0.14);
      c.beginPath();
      const floor = b.y + b.r + unit * (bi ? 0.1 : 0.13);
      for (let x = b.x0 + len * 0.1; x < b.x1; x += len * 0.27) { c.moveTo(x, b.y + b.r * 0.4); c.lineTo(x, floor); c.moveTo(x - unit * 0.015, floor); c.lineTo(x + unit * 0.015, floor); }
      c.moveTo(b.x0, b.y + b.r * 0.4); c.lineTo(b.x1, b.y + b.r * 0.4);
      c.stroke();
      // Belt around its two pulleys.
      c.fillStyle = rgba(colors.accent, 0.06);
      c.strokeStyle = rgba(colors.accent, 0.38);
      c.beginPath();
      c.moveTo(b.x0, b.y - b.r);
      c.lineTo(b.x1, b.y - b.r);
      c.arc(b.x1, b.y, b.r, -Math.PI / 2, Math.PI / 2);
      c.lineTo(b.x0, b.y + b.r);
      c.arc(b.x0, b.y, b.r, Math.PI / 2, (3 * Math.PI) / 2);
      c.closePath();
      c.moveTo(b.x0, b.y - b.r + bt);
      c.lineTo(b.x1, b.y - b.r + bt);
      c.arc(b.x1, b.y, b.r - bt, -Math.PI / 2, Math.PI / 2);
      c.lineTo(b.x0, b.y + b.r - bt);
      c.arc(b.x0, b.y, b.r - bt, Math.PI / 2, (3 * Math.PI) / 2);
      c.closePath();
      c.fill('evenodd');
      c.stroke();
      // Pulleys and idlers turn at belt speed / radius.
      const wheel = (x, y, r) => {
        const a = (b.dir * travel) / r;
        c.strokeStyle = rgba(colors.accent, 0.34);
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.moveTo(x + r * 0.22, y);
        c.arc(x, y, r * 0.22, 0, TAU);
        for (let k = 0; k < 4; k++) { const q = a + (k * Math.PI) / 2; c.moveTo(x + Math.cos(q) * r * 0.22, y + Math.sin(q) * r * 0.22); c.lineTo(x + Math.cos(q) * r * 0.85, y + Math.sin(q) * r * 0.85); }
        c.stroke();
      };
      wheel(b.x0, b.y, b.r - bt * 1.4);
      wheel(b.x1, b.y, b.r - bt * 1.4);
      const ir = b.r * 0.42;
      for (let x = b.x0 + len * 0.08; x < b.x1 - len * 0.04; x += unit * 0.11) wheel(x, b.y - b.r + bt + ir + 1, ir);
      // Cleats on the top run going one way, on the return run the other.
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      const pitch = unit * 0.06;
      for (let k = 0; k < len / pitch; k++) {
        const top = b.x0 + mod(b.dir * travel + k * pitch, len);
        c.moveTo(top, b.y - b.r); c.lineTo(top, b.y - b.r - b.r * 0.18);
        const bottom = b.x0 + mod(-b.dir * travel + k * pitch, len);
        c.moveTo(bottom, b.y + b.r); c.lineTo(bottom, b.y + b.r + b.r * 0.18);
      }
      c.stroke();
      // Parts riding on the belt, fading in where they are loaded and out where they leave.
      const surface = b.y - b.r - b.r * 0.18;
      const count = 6;
      const parts = [];
      for (let k = 0; k < count; k++) {
        const along = mod(travel + (k + hash(k, bi) * 0.4) * (len / count), len);
        const x = b.dir > 0 ? b.x0 + along : b.x1 - along;
        const alpha = clamp01(Math.min(along, len - along) / (len * 0.07));
        const size = unit * (0.045 + hash(k, bi, 2) * 0.035);
        parts.push([x, size, alpha, Math.floor(hash(k, bi, 3) * 5)]);
      }
      let scanned = false;
      const gateX = b.x0 + len * b.gate;
      for (const [x, size, alpha, type] of parts) {
        if (!alpha) continue;
        c.fillStyle = rgba(colors.bg, 0.75 * alpha);
        c.strokeStyle = rgba(colors.accent, 0.42 * alpha);
        c.beginPath();
        if (type === 0) c.rect(x - size * 0.6, surface - size, size * 1.2, size);
        else if (type === 1) { c.rect(x - size * 0.45, surface - size * 1.3, size * 0.9, size * 1.3); }
        else if (type === 2) gearPath(c, x, surface - size * 0.55, 12, size * 0.085, travel * 0.0);
        else if (type === 3) { c.moveTo(x - size * 0.7, surface); c.lineTo(x - size * 0.7, surface - size * 1.1); c.lineTo(x - size * 0.4, surface - size * 1.1); c.lineTo(x - size * 0.4, surface - size * 0.3); c.lineTo(x + size * 0.7, surface - size * 0.3); c.lineTo(x + size * 0.7, surface); c.closePath(); }
        else { for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; c[j ? 'lineTo' : 'moveTo'](x + Math.cos(a) * size * 0.6, surface - size * 0.52 + Math.sin(a) * size * 0.52); } c.closePath(); }
        c.fill();
        c.fillStyle = rgba(colors.accent, 0.1 * alpha);
        c.fill();
        c.stroke();
        c.strokeStyle = rgba(colors.text, 0.18 * alpha);
        c.beginPath();
        if (type === 1) { c.moveTo(x - size * 0.45, surface - size * 1.2); c.lineTo(x + size * 0.45, surface - size * 1.2); }
        else if (type === 2 || type === 4) { c.moveTo(x + size * 0.18, surface - size * 0.55); c.arc(x, surface - size * 0.55, size * 0.18, 0, TAU); }
        else if (type === 0) { c.moveTo(x - size * 0.6, surface - size * 0.82); c.lineTo(x + size * 0.6, surface - size * 0.82); }
        c.stroke();
        if (b.gate && Math.abs(x - gateX) < size * 0.6) scanned = true;
      }
      if (b.gate) {
        const gh = unit * 0.22;
        c.strokeStyle = rgba(colors.text, 0.3);
        c.fillStyle = rgba(colors.text, 0.05);
        c.beginPath();
        c.rect(gateX - unit * 0.07, surface - gh, unit * 0.02, gh);
        c.rect(gateX + unit * 0.05, surface - gh, unit * 0.02, gh);
        c.rect(gateX - unit * 0.07, surface - gh - unit * 0.025, unit * 0.14, unit * 0.025);
        c.fill();
        c.stroke();
        const sweep = surface - gh * (0.1 + 0.8 * (0.5 + 0.5 * Math.sin(time * 5)));
        c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
        c.strokeStyle = rgba(sun, (scanned ? 0.6 : 0.25));
        c.lineWidth = Math.max(1, line * (scanned ? 1.4 : 0.8));
        c.beginPath();
        c.moveTo(gateX - unit * 0.05, sweep); c.lineTo(gateX + unit * 0.05, sweep);
        c.stroke();
        c.setLineDash?.([3, 4]);
        c.strokeStyle = rgba(sun, scanned ? 0.4 : 0.16);
        c.beginPath();
        c.moveTo(gateX, surface - gh); c.lineTo(gateX, surface);
        c.stroke();
        c.setLineDash?.([]);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = rgba(scanned ? sun : colors.text, scanned ? 0.7 : 0.25);
        c.beginPath();
        c.arc(gateX, surface - gh - unit * 0.0125, unit * 0.006 * SIZE, 0, TAU);
        c.fill();
      }
    });
  }

  /** A view cube turning in the middle, coordinate triads orbiting it, each tumbling on its own. */
  triads(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const yaw = time * 0.2;
    const pitch = 0.45 + Math.sin(time * 0.13) * 0.3;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cp = Math.cos(pitch); const sp = Math.sin(pitch);
    const view = ([x, y, z]) => { const x1 = x * cyw + z * syw; const z1 = -x * syw + z * cyw; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
    const cx = w / 2;
    const cy = h / 2;
    const line = Math.max(1, w / 1200) * SIZE;
    const font = Math.round((unit / 66) * Math.min(1.3, SIZE));
    // A triad: three axes with arrowheads and letters, the nearest drawn last.
    const triad = (ox, oy, axes, len, alpha) => {
      const order = [0, 1, 2].sort((a, b) => axes[a][2] - axes[b][2]);
      c.font = `600 ${font}px ${SANS}`;
      c.textAlign = 'center';
      for (const k of order) {
        const [ax, ay] = axes[k];
        const tx = ox + ax * len;
        const ty = oy - ay * len;
        c.strokeStyle = rgba(AXIS[k], 0.55 * alpha);
        c.fillStyle = rgba(AXIS[k], 0.55 * alpha);
        c.lineWidth = Math.max(1.2, line * 1.3);
        c.beginPath();
        c.moveTo(ox, oy); c.lineTo(tx, ty);
        c.stroke();
        const a = Math.atan2(ty - oy, tx - ox);
        if (Math.hypot(tx - ox, ty - oy) > len * 0.25) { c.beginPath(); arrowHead(c, tx, ty, a, len * 0.16); c.fill(); }
        c.fillStyle = rgba(AXIS[k], 0.6 * alpha);
        c.fillText('XYZ'[k], ox + ax * len * 1.28, oy - ay * len * 1.28 + font * 0.35);
      }
      c.fillStyle = rgba(colors.text, 0.4 * alpha);
      c.beginPath();
      c.arc(ox, oy, 2 * SIZE, 0, TAU);
      c.fill();
      c.textAlign = 'start';
    };
    const orbits = Array.from({ length: 7 }, (_, k) => {
      const R = 2.1 + k * 0.38;
      const o = time * (0.25 - k * 0.022) * (k % 2 ? -1 : 1) + k * 2.1;
      const tiltA = 0.35 + hash(k, 1) * 0.9;
      const tiltB = hash(k, 2) * TAU;
      const p = [Math.cos(o) * R, Math.sin(o) * R * Math.sin(tiltA), Math.sin(o) * R * Math.cos(tiltA)];
      const q = [p[0] * Math.cos(tiltB) - p[1] * Math.sin(tiltB), p[0] * Math.sin(tiltB) + p[1] * Math.cos(tiltB), p[2]];
      const a = time * (0.4 + hash(k, 3) * 0.5) + k;
      const b = time * (0.3 + hash(k, 4) * 0.4) + k * 2;
      // Its own turning: about y, then about x.
      const own = (v) => { const x1 = v[0] * Math.cos(a) + v[2] * Math.sin(a); const z1 = -v[0] * Math.sin(a) + v[2] * Math.cos(a); return [x1, v[1] * Math.cos(b) - z1 * Math.sin(b), v[1] * Math.sin(b) + z1 * Math.cos(b)]; };
      return { pos: view(q), axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => view(own(v))), R, tiltA, tiltB };
    });
    const S = Math.min(unit * 0.11, w * 0.07);
    const scale = Math.min(w * 0.42, h * 0.46) / (2.1 + 6 * 0.38 + 0.3);
    // Orbits as faint ellipses.
    c.lineWidth = Math.max(1, line * 0.6);
    c.strokeStyle = rgba(colors.text, 0.07);
    for (const { R, tiltA, tiltB } of orbits) {
      c.beginPath();
      for (let j = 0; j <= 64; j++) {
        const o = (j / 64) * TAU;
        const p = [Math.cos(o) * R, Math.sin(o) * R * Math.sin(tiltA), Math.sin(o) * R * Math.cos(tiltA)];
        const v = view([p[0] * Math.cos(tiltB) - p[1] * Math.sin(tiltB), p[0] * Math.sin(tiltB) + p[1] * Math.cos(tiltB), p[2]]);
        c[j ? 'lineTo' : 'moveTo'](cx + v[0] * scale, cy - v[1] * scale);
      }
      c.stroke();
    }
    const drawOrbit = (o) => { const near = 0.75 + 0.25 * clamp01(o.pos[2] / 3 + 0.5); triad(cx + o.pos[0] * scale, cy - o.pos[1] * scale, o.axes, unit * 0.05 * near, near); };
    for (const o of orbits) if (o.pos[2] < 0) drawOrbit(o);
    // The view cube: its visible faces, each labelled in its own plane.
    const faces = [
      [[0, 0, 1], [1, 0, 0], [0, -1, 0], 'FRONT'], [[1, 0, 0], [0, 0, -1], [0, -1, 0], 'RIGHT'], [[0, 0, -1], [-1, 0, 0], [0, -1, 0], 'BACK'],
      [[-1, 0, 0], [0, 0, 1], [0, -1, 0], 'LEFT'], [[0, 1, 0], [1, 0, 0], [0, 0, 1], 'TOP'], [[0, -1, 0], [1, 0, 0], [0, 0, -1], 'BOTTOM'],
    ].map(([n, u, v, label]) => ({ n: view(n), u: view(u), v: view(v), label })).filter((f) => f.n[2] > 0.01).sort((a, b) => a.n[2] - b.n[2]);
    const sv = (v, k = 1) => [v[0] * S * k, -v[1] * S * k];
    for (const f of faces) {
      const [ox, oy] = sv(f.n);
      const [ux, uy] = sv(f.u);
      const [vx, vy] = sv(f.v);
      c.beginPath();
      c.moveTo(cx + ox - ux - vx, cy + oy - uy - vy);
      c.lineTo(cx + ox + ux - vx, cy + oy + uy - vy);
      c.lineTo(cx + ox + ux + vx, cy + oy + uy + vy);
      c.lineTo(cx + ox - ux + vx, cy + oy - uy + vy);
      c.closePath();
      c.fillStyle = rgba(colors.bg, 0.85);
      c.fill();
      c.fillStyle = rgba(colors.accent, 0.05 + 0.13 * f.n[2]);
      c.fill();
      c.lineWidth = line;
      c.strokeStyle = rgba(colors.accent, 0.42);
      c.stroke();
      // Chamfered-corner hint: an inner square, as on a view cube's face.
      c.strokeStyle = rgba(colors.accent, 0.14);
      c.beginPath();
      c.moveTo(cx + ox - (ux + vx) * 0.8, cy + oy - (uy + vy) * 0.8);
      c.lineTo(cx + ox + (ux - vx) * 0.8, cy + oy + (uy - vy) * 0.8);
      c.lineTo(cx + ox + (ux + vx) * 0.8, cy + oy + (uy + vy) * 0.8);
      c.lineTo(cx + ox + (vx - ux) * 0.8, cy + oy + (vy - uy) * 0.8);
      c.closePath();
      c.stroke();
      c.setTransform(ux / 100, uy / 100, vx / 100, vy / 100, cx + ox, cy + oy);
      c.font = `600 30px ${SANS}`;
      c.textAlign = 'center';
      c.fillStyle = rgba(colors.text, 0.5 * f.n[2]);
      c.fillText(f.label, 0, 10);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.textAlign = 'start';
    }
    for (const o of orbits) if (o.pos[2] >= 0) drawOrbit(o);
    // The global triad in the corner turns with the cube.
    triad(unit * 0.11, h - unit * 0.11, [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(view), unit * 0.06, 1);
  }

  /** Feature control frames and datum symbols drifting by in lanes, a new tolerance each time one comes round. */
  gdtFrames(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const lanes = 7;
    const hgt = unit * 0.042 * (SIZE > 1 ? 1.1 : 1);
    const font = Math.round(hgt * 0.5);
    c.font = `${font}px ${SANS}`;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const line = Math.max(1, w / 1300) * SIZE;
    const span = w + unit * 0.6;
    this.items.forEach((p, i) => {
      const lane = i % lanes;
      const dir = lane % 2 ? -1 : 1;
      const speed = unit * (0.02 + (hash(lane, 7) * 0.012));
      const perLane = Math.ceil(this.items.length / lanes);
      const run = ((Math.floor(i / lanes) + p.x * 0.35) / perLane) * span + time * speed;
      const round = Math.floor(run / span);
      const x = dir > 0 ? mod(run, span) - unit * 0.3 : w + unit * 0.3 - mod(run, span);
      const y = ((lane + 0.5) / lanes) * h + (p.y - 0.5) * (h / lanes) * 0.4 + Math.sin(time * 0.3 + p.h * 9) * hgt * 0.25;
      const at = (n) => hash(i, round, n);
      const alpha = clamp01(Math.min(x + unit * 0.25, w + unit * 0.25 - x) / (unit * 0.25));
      if (alpha <= 0) return;
      c.lineWidth = line;
      if (at(1) < 0.22) {
        // Datum feature symbol: a framed letter on a stem ending in a filled triangle.
        const letter = 'ABCDEF'[Math.floor(at(2) * 6)];
        c.fillStyle = rgba(colors.bg, 0.6 * alpha);
        c.strokeStyle = rgba(colors.accent, 0.4 * alpha);
        c.beginPath();
        c.rect(x - hgt / 2, y - hgt / 2, hgt, hgt);
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(x, y + hgt / 2); c.lineTo(x, y + hgt * 1.2);
        c.stroke();
        c.fillStyle = rgba(colors.accent, 0.4 * alpha);
        c.beginPath();
        c.moveTo(x - hgt * 0.32, y + hgt * 1.55); c.lineTo(x + hgt * 0.32, y + hgt * 1.55); c.lineTo(x, y + hgt * 1.2);
        c.closePath();
        c.fill();
        c.fillStyle = rgba(colors.text, 0.5 * alpha);
        c.textAlign = 'center';
        c.fillText(letter, x, y + font * 0.36);
        c.textAlign = 'start';
        return;
      }
      const type = GDT_TYPES[Math.floor(at(3) * GDT_TYPES.length)];
      const diameter = type === 'position' || type === 'concentricity' || (type === 'perpendicularity' && at(4) > 0.5);
      const value = ['0.005', '0.01', '0.02', '0.025', '0.05', '0.1', '0.2'][Math.floor(at(5) * 7)];
      const modifier = type === 'position' && at(6) > 0.4 ? (at(6) > 0.7 ? 'M' : 'L') : '';
      const datums = ['flatness', 'circularity', 'cylindricity', 'straightness'].includes(type) ? 0 : 1 + Math.floor(at(7) * 3);
      const pad = hgt * 0.3;
      const tolW = (diameter ? hgt * 0.55 : 0) + c.measureText(value).width + (modifier ? hgt * 0.75 : 0) + pad * 2;
      const width = hgt + tolW + datums * hgt;
      const x0 = x - width / 2;
      const y0 = y - hgt / 2;
      c.fillStyle = rgba(colors.bg, 0.6 * alpha);
      c.fillRect(x0, y0, width, hgt);
      c.fillStyle = rgba(colors.accent, 0.06 * alpha);
      c.fillRect(x0, y0, width, hgt);
      c.strokeStyle = rgba(colors.accent, 0.42 * alpha);
      c.beginPath();
      c.rect(x0, y0, width, hgt);
      c.moveTo(x0 + hgt, y0); c.lineTo(x0 + hgt, y0 + hgt);
      for (let k = 0; k < datums; k++) { const dx = x0 + hgt + tolW + k * hgt; c.moveTo(dx, y0); c.lineTo(dx, y0 + hgt); }
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.55 * alpha);
      gdtSymbol(c, type, x0 + hgt / 2, y, hgt);
      let tx = x0 + hgt + pad;
      if (diameter) {
        const r = hgt * 0.17;
        c.beginPath();
        c.arc(tx + r, y, r, 0, TAU);
        c.moveTo(tx - r * 0.2, y + r * 1.35); c.lineTo(tx + r * 2.2, y - r * 1.35);
        c.stroke();
        tx += hgt * 0.55;
      }
      c.fillStyle = rgba(colors.text, 0.55 * alpha);
      c.fillText(value, tx, y + font * 0.36);
      tx += c.measureText(value).width + hgt * 0.12;
      if (modifier) {
        c.beginPath();
        c.arc(tx + hgt * 0.27, y, hgt * 0.27, 0, TAU);
        c.stroke();
        c.save();
        c.font = `${Math.round(font * 0.72)}px ${SANS}`;
        c.textAlign = 'center';
        c.fillText(modifier, tx + hgt * 0.27, y + font * 0.26);
        c.restore();
      }
      c.textAlign = 'center';
      for (let k = 0; k < datums; k++) c.fillText('ABC'[k], x0 + hgt + tolW + (k + 0.5) * hgt, y + font * 0.36);
      c.textAlign = 'start';
      // A leader from the frame's end down to its feature.
      if (at(8) > 0.5) {
        c.strokeStyle = rgba(colors.text, 0.22 * alpha);
        c.fillStyle = rgba(colors.text, 0.22 * alpha);
        const lx = x0 + width;
        c.beginPath();
        c.moveTo(lx, y); c.lineTo(lx + hgt * 0.8, y); c.lineTo(lx + hgt * 1.6, y + hgt * 1.3);
        c.stroke();
        c.beginPath();
        arrowHead(c, lx + hgt * 1.6, y + hgt * 1.3, Math.atan2(hgt * 1.3, hgt * 0.8), hgt * 0.3);
        c.fill();
      }
    });
  }

  /** A fibre laser cutting nested parts from a plate: holes first, then each outline; the gantry follows the head. */
  laserCut(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { round, phase } = cycle(time, 30);
    const fade = fadeInOut(phase, 0.06, 0.03);
    const pw = Math.min(w * 0.72, unit * 1.3);
    const ph = Math.min(h * 0.68, pw * 0.6);
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    const cols = 4;
    const rows = 3;
    const cw = pw / cols;
    const ch = ph / rows;
    // Each cell: its contours (holes first, the outline last).
    const parts = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = px + (i + 0.5) * cw;
        const y = py + (j + 0.5) * ch;
        const s = Math.min(cw, ch) * 0.4;
        const type = Math.floor(hash(i, j, round) * 6);
        let outer;
        const holes = [];
        if (type === 0) { outer = circlePoly(x, y, s, 40); holes.push(circlePoly(x, y, s * 0.35, 24)); for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; holes.push(circlePoly(x + Math.cos(a) * s * 0.68, y + Math.sin(a) * s * 0.68, s * 0.1, 12)); } }
        else if (type === 1) { outer = roundRectPoly(x - s * 1.15, y - s * 0.8, s * 2.3, s * 1.6, s * 0.25); holes.push(circlePoly(x - s * 0.65, y, s * 0.2, 16), circlePoly(x + s * 0.65, y, s * 0.2, 16)); }
        else if (type === 2) { outer = roundRectPoly(x - s * 1.2, y - s * 0.45, s * 2.4, s * 0.9, s * 0.45, 10); holes.push(roundRectPoly(x - s * 0.7, y - s * 0.16, s * 1.4, s * 0.32, s * 0.16, 8)); }
        else if (type === 3) { outer = Array.from({ length: 7 }, (_, k) => [x + Math.cos((k / 6) * TAU) * s, y + Math.sin((k / 6) * TAU) * s]); holes.push(circlePoly(x, y, s * 0.45, 28)); }
        else if (type === 4) {
          outer = [];
          const z = 12;
          for (let k = 0; k <= z * 4; k++) { const a = (k / (z * 4)) * TAU; const tooth = (k % 4 === 1 || k % 4 === 2) ? 1 : 0.8; outer.push([x + Math.cos(a) * s * tooth, y + Math.sin(a) * s * tooth]); }
          holes.push(circlePoly(x, y, s * 0.25, 20));
        } else {
          outer = [[x - s, y - s], [x - s * 0.4, y - s], [x - s * 0.4, y + s * 0.4], [x + s, y + s * 0.4], [x + s, y + s], [x - s, y + s], [x - s, y - s]];
          holes.push(circlePoly(x - s * 0.7, y - s * 0.5, s * 0.14, 12), circlePoly(x + s * 0.55, y + s * 0.7, s * 0.14, 12));
        }
        parts.push({ outer, holes, contours: [...holes, outer] });
      }
    }
    // Progress along cuts and rapids (rapids count a quarter: the head flies).
    const jobs = [];
    let pen = [px, py];
    parts.forEach((pt, pi) => pt.contours.forEach((ct, ci) => {
      jobs.push({ rapid: [pen[0], pen[1], ct[0][0], ct[0][1]], segs: polySegs(ct), part: pi, last: ci === pt.contours.length - 1 });
      pen = ct.at(-1);
    }));
    const total = jobs.reduce((sum, j) => sum + segLength(j.rapid) * 0.25 + j.segs.reduce((a, s) => a + segLength(s), 0) + unit * 0.05, 0);
    let left = total * clamp01((phase - 0.03) / 0.84);
    let head = [px, py];
    let cutting = false;
    let pierce = 0;
    const cut = [];
    const finished = new Set();
    for (const job of jobs) {
      if (left <= 0) break;
      const rl = segLength(job.rapid) * 0.25;
      if (left < rl) { const f = left / rl; head = [job.rapid[0] + (job.rapid[2] - job.rapid[0]) * f, job.rapid[1] + (job.rapid[3] - job.rapid[1]) * f]; left = 0; break; }
      left -= rl;
      // Piercing takes a moment before the cut starts.
      const pl = unit * 0.05;
      head = [job.rapid[2], job.rapid[3]];
      if (left < pl) { pierce = left / pl; left = 0; break; }
      left -= pl;
      for (const s of job.segs) {
        if (left <= 0) break;
        const sl = segLength(s);
        const f = sl > left ? left / sl : 1;
        cut.push([s[0], s[1], s[0] + (s[2] - s[0]) * f, s[1] + (s[3] - s[1]) * f]);
        head = [cut.at(-1)[2], cut.at(-1)[3]];
        cutting = f < 1;
        left -= sl;
      }
      if (left > 0 && job.last) finished.add(job.part);
    }
    const line = Math.max(1, w / 1300) * SIZE;
    // Plate, the planned cuts, finished parts lifted a little and the kerf.
    c.lineWidth = line;
    c.fillStyle = rgba(colors.text, 0.04 * fade);
    c.strokeStyle = rgba(colors.text, 0.22 * fade);
    c.beginPath();
    c.rect(px - unit * 0.03, py - unit * 0.03, pw + unit * 0.06, ph + unit * 0.06);
    c.fill();
    c.stroke();
    c.setLineDash?.([3, 5]);
    c.strokeStyle = rgba(colors.accent, 0.13 * fade);
    c.beginPath();
    for (const pt of parts) for (const ct of pt.contours) polyPath(c, ct, false);
    c.stroke();
    c.setLineDash?.([]);
    parts.forEach((pt, pi) => {
      if (!finished.has(pi)) return;
      c.beginPath();
      polyPath(c, pt.outer);
      for (const hole of pt.holes) polyPath(c, hole);
      c.fillStyle = rgba(colors.accent, 0.1 * fade);
      c.fill('evenodd');
    });
    c.lineWidth = Math.max(1.2, line * 1.2);
    c.lineJoin = 'round';
    c.strokeStyle = rgba(colors.accent, 0.45 * fade);
    c.beginPath();
    for (const s of cut) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }
    c.stroke();
    if (phase > 0.88) return;
    // Gantry rails through the head.
    c.lineWidth = Math.max(1, line * 0.8);
    c.strokeStyle = rgba(colors.text, 0.1 * fade);
    c.beginPath();
    c.moveTo(head[0], py - unit * 0.08); c.lineTo(head[0], py + ph + unit * 0.08);
    c.moveTo(px - unit * 0.08, head[1]); c.lineTo(px + pw + unit * 0.08, head[1]);
    c.stroke();
    const sun = warm(colors);
    const on = cutting || pierce > 0;
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    if (on) {
      const R = unit * (pierce > 0 ? 0.03 + pierce * 0.03 : 0.035);
      const glow = c.createRadialGradient(head[0], head[1], 0, head[0], head[1], R);
      glow.addColorStop(0, rgba(colors.dark ? '#ffffff' : sun, 0.75 * fade));
      glow.addColorStop(0.3, rgba(sun, 0.35 * fade));
      glow.addColorStop(1, rgba(sun, 0));
      c.fillStyle = glow;
      c.fillRect(head[0] - R, head[1] - R, R * 2, R * 2);
      c.strokeStyle = rgba(sun, 0.5 * fade);
      c.lineWidth = Math.max(1, line * 0.8);
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const life = mod(time * 3 + hash(k, 9), 1);
        const a = hash(k, Math.floor(time * 3 + hash(k, 9))) * TAU;
        const r0 = unit * 0.008 + life * unit * 0.04;
        c.moveTo(head[0] + Math.cos(a) * r0, head[1] + Math.sin(a) * r0);
        c.lineTo(head[0] + Math.cos(a) * (r0 + unit * 0.012), head[1] + Math.sin(a) * (r0 + unit * 0.012));
      }
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = rgba(colors.text, 0.45 * fade);
    c.lineWidth = line;
    c.beginPath();
    c.arc(head[0], head[1], unit * 0.016, 0, TAU);
    c.moveTo(head[0] - unit * 0.026, head[1]); c.lineTo(head[0] - unit * 0.008, head[1]);
    c.moveTo(head[0] + unit * 0.008, head[1]); c.lineTo(head[0] + unit * 0.026, head[1]);
    c.moveTo(head[0], head[1] - unit * 0.026); c.lineTo(head[0], head[1] - unit * 0.008);
    c.moveTo(head[0], head[1] + unit * 0.008); c.lineTo(head[0], head[1] + unit * 0.026);
    c.stroke();
  }

  /** A circular profile swept along a helix: the tube's rings and lines appear behind the profile as it travels. */
  helixSweep(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { phase } = cycle(time, 18);
    const fade = fadeInOut(phase, 0.08, 0.04);
    const turns = 4.5;
    const Rh = 1;
    const pitch = 0.62;
    const rp = 0.2;
    const height = turns * pitch;
    const yaw = time * 0.18;
    const tilt = 0.32;
    const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const ct = Math.cos(tilt); const st = Math.sin(tilt);
    const S = Math.min(h * 0.82 / (height * ct + 2 * (Rh + rp) * st + 0.4), w * 0.3);
    const cx = w / 2;
    const cy = h / 2;
    const proj = ([x, y, z]) => { const x1 = x * cyw + z * syw; const z1 = -x * syw + z * cyw; const yy = y - height / 2; return [cx + x1 * S, cy - (yy * ct - z1 * st) * S, yy * st + z1 * ct]; };
    const b = pitch / TAU;
    const frame = (s) => {
      const C = [Rh * Math.cos(s), b * s, Rh * Math.sin(s)];
      const T = [-Rh * Math.sin(s), b, Rh * Math.cos(s)];
      const tl = Math.hypot(...T);
      const Tn = T.map((v) => v / tl);
      const N = [-Math.cos(s), 0, -Math.sin(s)];
      const B = [Tn[1] * N[2] - Tn[2] * N[1], Tn[2] * N[0] - Tn[0] * N[2], Tn[0] * N[1] - Tn[1] * N[0]];
      return { C, N, B };
    };
    const at = (s, psi, r = rp) => { const { C, N, B } = frame(s); return proj([C[0] + r * (Math.cos(psi) * N[0] + Math.sin(psi) * B[0]), C[1] + r * (Math.cos(psi) * N[1] + Math.sin(psi) * B[1]), C[2] + r * (Math.cos(psi) * N[2] + Math.sin(psi) * B[2])]); };
    const end = turns * TAU;
    const sNow = end * clamp01((phase - 0.04) / 0.7);
    const line = Math.max(1, w / 1300) * SIZE;
    // Axis, and the path: dashed ahead, solid where it has been swept.
    c.lineWidth = Math.max(1, line * 0.7);
    c.setLineDash?.([12, 4, 2, 4]);
    c.strokeStyle = rgba(colors.text, 0.14 * fade);
    c.beginPath();
    let p = proj([0, -0.3, 0]); c.moveTo(p[0], p[1]);
    p = proj([0, height + 0.3, 0]); c.lineTo(p[0], p[1]);
    c.stroke();
    c.setLineDash?.([4, 5]);
    c.strokeStyle = rgba(colors.text, 0.16 * fade);
    c.beginPath();
    for (let k = 0; k <= 360; k++) { const s = (k / 360) * end; const q = proj(frame(s).C); c[k ? 'lineTo' : 'moveTo'](q[0], q[1]); }
    c.stroke();
    c.setLineDash?.([]);
    // The swept tube: rings and four lines, the far side faint.
    const back = new Path2D();
    const front = new Path2D();
    const seg = (a, d) => { const target = a[2] + d[2] > 0 ? front : back; target.moveTo(a[0], a[1]); target.lineTo(d[0], d[1]); };
    const ringStep = TAU / 20;
    for (let s = 0; s <= sNow; s += ringStep) {
      let prev = at(s, 0);
      for (let k = 1; k <= 16; k++) { const q = at(s, (k / 16) * TAU); seg(prev, q); prev = q; }
    }
    for (let j = 0; j < 4; j++) {
      const psi = (j / 4) * TAU + Math.PI / 4;
      let prev = at(0, psi);
      for (let s = TAU / 48; s <= sNow; s += TAU / 48) { const q = at(s, psi); seg(prev, q); prev = q; }
    }
    c.lineWidth = Math.max(1, line * 0.8);
    c.strokeStyle = rgba(colors.text, 0.08 * fade);
    c.stroke(back);
    c.strokeStyle = rgba(colors.accent, 0.3 * fade);
    c.stroke(front);
    // The profile at the end, in its sketch plane.
    if (phase < 0.95) {
      const { C, N, B } = frame(sNow);
      const corner = (u, v) => proj([C[0] + (u * N[0] + v * B[0]) * rp * 1.9, C[1] + (u * N[1] + v * B[1]) * rp * 1.9, C[2] + (u * N[2] + v * B[2]) * rp * 1.9]);
      c.fillStyle = rgba(colors.accent, 0.06 * fade);
      c.strokeStyle = rgba(colors.accent, 0.3 * fade);
      c.lineWidth = Math.max(1, line * 0.8);
      c.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], k) => { const q = corner(u, v); c[k ? 'lineTo' : 'moveTo'](q[0], q[1]); });
      c.closePath();
      c.fill();
      c.stroke();
      c.lineWidth = Math.max(1.5, line * 1.6);
      c.strokeStyle = rgba(colors.accent, 0.6 * fade);
      c.beginPath();
      for (let k = 0; k <= 32; k++) { const q = at(sNow, (k / 32) * TAU); c[k ? 'lineTo' : 'moveTo'](q[0], q[1]); }
      c.stroke();
      const q = proj(C);
      c.fillStyle = rgba(colors.text, 0.5 * fade);
      c.beginPath();
      c.arc(q[0], q[1], 2.2 * SIZE, 0, TAU);
      c.fill();
    }
  }

  /** A turned part in elevation: a sweep line crosses it and leaves it cut in section, hatched; then a new part. */
  sectionHatch(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const { round, phase } = cycle(time, 16);
    const fade = fadeInOut(phase, 0.08, 0.04);
    const L = Math.min(w * 0.72, unit * 1.45);
    const x0 = w / 2 - L / 2;
    const x1 = x0 + L;
    const cy = h * 0.48;
    // Steps of the shaft: lengths and radii, a flange somewhere, a bore and a counterbore.
    const n = 5 + Math.floor(hash(round, 1) * 3);
    const cuts = [0];
    for (let k = 1; k < n; k++) cuts.push(cuts[k - 1] + 0.5 + hash(round, k, 2));
    const totalU = cuts[n - 1] + 0.5 + hash(round, n, 2);
    const xs = cuts.map((u) => x0 + (u / totalU) * L).concat(x1);
    const flange = 1 + Math.floor(hash(round, 3) * (n - 2));
    const radii = Array.from({ length: n }, (_, k) => unit * (k === flange ? 0.2 : 0.085 + hash(round, k, 4) * 0.07));
    const rb = unit * 0.04;
    const rcb = unit * 0.062;
    const cbEnd = xs[1] * 0.5 + xs[0] * 0.5;
    const bore = (x) => (x < cbEnd ? rcb : rb);
    const holeX = (xs[flange] + xs[flange + 1]) / 2;
    const holeR = Math.min(unit * 0.018, (xs[flange + 1] - xs[flange]) * 0.25);
    const material = (sign) => {
      const path = new Path2D();
      path.moveTo(x0, cy - sign * rcb);
      for (let k = 0; k < n; k++) { path.lineTo(xs[k], cy - sign * radii[k]); path.lineTo(xs[k + 1], cy - sign * radii[k]); }
      path.lineTo(x1, cy - sign * rb);
      path.lineTo(cbEnd, cy - sign * rb);
      path.lineTo(cbEnd, cy - sign * rcb);
      path.closePath();
      if (sign > 0) path.rect(holeX - holeR, cy - radii[flange] - 2, holeR * 2, radii[flange] - rb + 2);
      return path;
    };
    const top = material(1);
    const bottom = material(-1);
    const sweep = x0 - unit * 0.02 + (L + unit * 0.04) * smooth((phase - 0.06) / 0.62);
    const line = Math.max(1, w / 1100) * SIZE;
    c.lineJoin = 'miter';
    // Behind the sweep: the part as seen from outside, its bore hidden (dashed).
    c.save();
    c.beginPath();
    c.rect(sweep, 0, w - sweep, h);
    c.clip();
    c.lineWidth = line;
    c.fillStyle = rgba(colors.accent, 0.05 * fade);
    c.strokeStyle = rgba(colors.accent, 0.38 * fade);
    c.beginPath();
    c.moveTo(x0, cy - radii[0]);
    for (let k = 0; k < n; k++) { c.lineTo(xs[k], cy - radii[k]); c.lineTo(xs[k + 1], cy - radii[k]); }
    for (let k = n - 1; k >= 0; k--) { c.lineTo(xs[k + 1], cy + radii[k]); c.lineTo(xs[k], cy + radii[k]); }
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    for (let k = 1; k < n; k++) { const r = Math.min(radii[k - 1], radii[k]); c.moveTo(xs[k], cy - r); c.lineTo(xs[k], cy + r); }
    c.stroke();
    c.setLineDash?.([6, 4]);
    c.strokeStyle = rgba(colors.text, 0.18 * fade);
    c.beginPath();
    c.moveTo(x0, cy - rcb); c.lineTo(cbEnd, cy - rcb); c.lineTo(cbEnd, cy - rb); c.lineTo(x1, cy - rb);
    c.moveTo(x0, cy + rcb); c.lineTo(cbEnd, cy + rcb); c.lineTo(cbEnd, cy + rb); c.lineTo(x1, cy + rb);
    c.moveTo(holeX - holeR, cy - radii[flange]); c.lineTo(holeX - holeR, cy - rb);
    c.moveTo(holeX + holeR, cy - radii[flange]); c.lineTo(holeX + holeR, cy - rb);
    c.stroke();
    c.setLineDash?.([]);
    c.restore();
    // In front of it: the cut faces, hatched at 45°.
    c.save();
    c.beginPath();
    c.rect(0, 0, Math.max(0, sweep), h);
    c.clip();
    c.lineWidth = line;
    for (const part of [top, bottom]) {
      c.fillStyle = rgba(colors.accent, 0.08 * fade);
      c.fill(part, 'evenodd');
      c.strokeStyle = rgba(colors.accent, 0.42 * fade);
      c.stroke(part);
      c.save();
      c.clip(part, 'evenodd');
      c.lineWidth = Math.max(1, line * 0.6);
      c.strokeStyle = rgba(colors.accent, 0.26 * fade);
      c.beginPath();
      const gap = unit * 0.014;
      for (let x = x0 - unit * 0.25; x < x1 + unit * 0.25; x += gap) { c.moveTo(x, cy + unit * 0.22); c.lineTo(x + unit * 0.44, cy - unit * 0.22); }
      c.stroke();
      c.restore();
    }
    // Edges seen through the cut: the bore's far wall and the step faces between the halves.
    c.strokeStyle = rgba(colors.accent, 0.3 * fade);
    c.beginPath();
    c.moveTo(cbEnd, cy - rb); c.lineTo(cbEnd, cy + rb);
    c.stroke();
    c.restore();
    // Centre line, the sweep line with its glow, and the title.
    c.lineWidth = Math.max(1, line * 0.7);
    c.setLineDash?.([unit * 0.04, unit * 0.01, unit * 0.005, unit * 0.01]);
    c.strokeStyle = rgba(colors.text, 0.2 * fade);
    c.beginPath();
    c.moveTo(x0 - unit * 0.04, cy); c.lineTo(x1 + unit * 0.04, cy);
    c.stroke();
    c.setLineDash?.([]);
    if (sweep > x0 - unit * 0.01 && sweep < x1 + unit * 0.01) {
      const band = c.createLinearGradient(sweep - unit * 0.06, 0, sweep, 0);
      band.addColorStop(0, rgba(colors.accent, 0));
      band.addColorStop(1, rgba(colors.accent, 0.12 * fade));
      c.fillStyle = band;
      c.fillRect(sweep - unit * 0.06, cy - unit * 0.26, unit * 0.06, unit * 0.52);
      c.strokeStyle = rgba(colors.accent, 0.5 * fade);
      c.lineWidth = line;
      c.beginPath();
      c.moveTo(sweep, cy - unit * 0.26); c.lineTo(sweep, cy + unit * 0.26);
      c.stroke();
    }
    // Cutting-plane arrows and the view's name.
    const font = Math.round((unit / 46) * Math.min(1.3, SIZE));
    c.font = `600 ${font}px ${SANS}`;
    c.textAlign = 'center';
    c.fillStyle = rgba(colors.text, 0.4 * fade);
    c.strokeStyle = rgba(colors.text, 0.32 * fade);
    c.lineWidth = Math.max(1.5, line * 1.4);
    for (const x of [x0 - unit * 0.07, x1 + unit * 0.07]) {
      c.beginPath();
      c.moveTo(x, cy + unit * 0.05); c.lineTo(x, cy - unit * 0.05);
      c.stroke();
      c.beginPath();
      arrowHead(c, x, cy - unit * 0.07, -Math.PI / 2, unit * 0.025);
      c.fill();
      c.fillText('A', x, cy + unit * 0.05 + font * 1.1);
    }
    c.fillText('SECTION A-A', w / 2, cy + unit * 0.3);
    c.textAlign = 'start';
  }

  /** A fan rotor turning in its casing over the fixed stator vanes, a second, smaller one beside it. */
  turbine(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const line = Math.max(1, w / 1200) * SIZE;
    const rotor = (cx, cy, Rout, blades, vanes, speed) => {
      const Rhub = Rout * 0.27;
      const phi = time * speed;
      const dir = Math.sign(speed);
      // Casing with its bolted flange.
      c.lineWidth = line;
      c.beginPath();
      c.arc(cx, cy, Rout * 1.13, 0, TAU);
      c.moveTo(cx + Rout * 1.03, cy);
      c.arc(cx, cy, Rout * 1.03, 0, TAU, true);
      c.fillStyle = rgba(colors.accent, 0.06);
      c.fill('evenodd');
      c.strokeStyle = rgba(colors.accent, 0.34);
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.18);
      c.beginPath();
      for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; const bx = cx + Math.cos(a) * Rout * 1.08; const by = cy + Math.sin(a) * Rout * 1.08; c.moveTo(bx + Rout * 0.016, by); c.arc(bx, by, Rout * 0.016, 0, TAU); }
      c.stroke();
      // Stator vanes behind, curved the other way.
      c.strokeStyle = rgba(colors.text, 0.08);
      c.lineWidth = Math.max(1, line * 1.4);
      c.beginPath();
      for (let k = 0; k < vanes; k++) {
        const a0 = (k / vanes) * TAU;
        for (let j = 0; j <= 8; j++) { const f = j / 8; const r = Rhub * 1.1 + (Rout * 0.98 - Rhub * 1.1) * f; const a = a0 - dir * 0.35 * f; c[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      }
      c.stroke();
      // Blades: swept, wider at the tip; a faint trail behind each for the motion.
      const blade = (a0) => {
        const pts = [];
        for (let j = 0; j <= 10; j++) {
          const f = j / 10;
          const r = Rhub * 0.95 + (Rout - Rhub * 0.95) * f;
          const ac = a0 + dir * 0.55 * f * f;
          const half = 0.1 + 0.07 * f;
          pts.push([cx + Math.cos(ac + half) * r, cy + Math.sin(ac + half) * r]);
          pts.unshift([cx + Math.cos(ac - half) * r, cy + Math.sin(ac - half) * r]);
        }
        polyPath(c, pts);
      };
      for (let g = 3; g >= 1; g--) {
        c.fillStyle = rgba(colors.accent, 0.016);
        c.beginPath();
        for (let k = 0; k < blades; k++) blade(phi - dir * g * 0.06 + (k / blades) * TAU);
        c.fill();
      }
      c.lineWidth = line;
      c.fillStyle = rgba(colors.accent, 0.1);
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.beginPath();
      for (let k = 0; k < blades; k++) blade(phi + (k / blades) * TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      for (let k = 0; k < blades; k++) {
        const a0 = phi + (k / blades) * TAU;
        for (let j = 0; j <= 8; j++) { const f = j / 8; const r = Rhub + (Rout * 0.95 - Rhub) * f; const a = a0 + dir * 0.55 * f * f; c[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      }
      c.stroke();
      // Hub, its bolts and the spinner.
      c.fillStyle = rgba(colors.bg, 0.85);
      c.strokeStyle = rgba(colors.accent, 0.42);
      c.beginPath();
      c.arc(cx, cy, Rhub, 0, TAU);
      c.fill();
      c.fillStyle = rgba(colors.accent, 0.12);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, Rhub * 0.32, 0, TAU);
      for (let k = 0; k < 6; k++) { const a = phi + (k / 6) * TAU; const bx = cx + Math.cos(a) * Rhub * 0.65; const by = cy + Math.sin(a) * Rhub * 0.65; c.moveTo(bx + Rhub * 0.08, by); c.arc(bx, by, Rhub * 0.08, 0, TAU); }
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      c.moveTo(cx - Rout * 1.22, cy); c.lineTo(cx + Rout * 1.22, cy);
      c.moveTo(cx, cy - Rout * 1.22); c.lineTo(cx, cy + Rout * 1.22);
      c.stroke();
    };
    rotor(w * 0.62, h * 0.5, unit * 0.38, 11, 17, 1.1);
    rotor(w * 0.2, h * 0.72, unit * 0.16, 7, 11, -1.9);
  }

  /** Four-bar linkages (crank-rocker): the crank turns, the rocker swings and a point on the coupler traces its curve. */
  fourBar(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const line = Math.max(1, w / 1200) * SIZE;
    // A capsule-shaped link between two pins.
    const link = (x1, y1, x2, y2, r) => {
      const a = Math.atan2(y2 - y1, x2 - x1);
      c.moveTo(x1 + Math.cos(a + Math.PI / 2) * r, y1 + Math.sin(a + Math.PI / 2) * r);
      c.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
      c.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
      c.closePath();
    };
    const pivot = (x, y, r) => {
      c.strokeStyle = rgba(colors.text, 0.28);
      c.beginPath();
      c.moveTo(x, y); c.lineTo(x - r * 1.6, y + r * 2.6); c.lineTo(x + r * 1.6, y + r * 2.6); c.closePath();
      c.moveTo(x - r * 2.4, y + r * 2.6); c.lineTo(x + r * 2.4, y + r * 2.6);
      for (let k = -2; k <= 2; k++) { c.moveTo(x + k * r, y + r * 2.6); c.lineTo(x + k * r - r * 0.8, y + r * 3.4); }
      c.stroke();
    };
    const mech = (ox, oy, S, [a, b, cc, d], [pu, pv], speed) => {
      // Ground pivots A and D; crank AB, coupler BC, rocker DC; P rides on the coupler.
      const solve = (th) => {
        const B = [ox + Math.cos(th) * a * S, oy + Math.sin(th) * a * S];
        const D = [ox + d * S, oy];
        const dx = D[0] - B[0];
        const dy = D[1] - B[1];
        const L = Math.hypot(dx, dy);
        const k = (b * b * S * S - cc * cc * S * S + L * L) / (2 * L);
        const hgt = Math.sqrt(Math.max(0, b * b * S * S - k * k));
        const C = [B[0] + (dx * k) / L + (dy * hgt) / L, B[1] + (dy * k) / L - (dx * hgt) / L];
        const ux = (C[0] - B[0]) / (b * S);
        const uy = (C[1] - B[1]) / (b * S);
        const P = [B[0] + (ux * pu - uy * pv) * b * S, B[1] + (uy * pu + ux * pv) * b * S];
        return { B, C, D, P };
      };
      const th = time * speed;
      // The coupler curve: whole (faint), and the stretch just traced.
      c.lineWidth = Math.max(1, line * 0.8);
      c.strokeStyle = rgba(colors.text, 0.12);
      c.beginPath();
      for (let k = 0; k <= 120; k++) { const { P } = solve((k / 120) * TAU); c[k ? 'lineTo' : 'moveTo'](P[0], P[1]); }
      c.stroke();
      c.lineWidth = Math.max(1.5, line * 1.6);
      c.lineCap = 'round';
      for (let k = 0; k < 24; k++) {
        const p0 = solve(th - (k + 1) * 0.06 * Math.sign(speed)).P;
        const p1 = solve(th - k * 0.06 * Math.sign(speed)).P;
        c.strokeStyle = rgba(colors.accent, 0.45 * (1 - k / 24));
        c.beginPath();
        c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]);
        c.stroke();
      }
      const { B, C, D, P } = solve(th);
      const r = unit * 0.016 * (S / (unit * 0.1));
      pivot(ox, oy, r);
      pivot(D[0], D[1], r);
      c.setLineDash?.([8, 4, 2, 4]);
      c.lineWidth = Math.max(1, line * 0.7);
      c.strokeStyle = rgba(colors.text, 0.16);
      c.beginPath();
      c.moveTo(ox, oy); c.lineTo(D[0], D[1]);
      c.moveTo(ox + a * S, oy); c.arc(ox, oy, a * S, 0, TAU);
      c.stroke();
      c.setLineDash?.([]);
      // Links, the coupler plate (B, C, P), pins.
      c.lineWidth = line;
      c.lineJoin = 'round';
      c.fillStyle = rgba(colors.bg, 0.7);
      c.strokeStyle = rgba(colors.accent, 0.4);
      for (const [p, q, f] of [[[ox, oy], B, 0.12], [D, C, 0.09]]) {
        c.beginPath();
        link(p[0], p[1], q[0], q[1], r * 1.15);
        c.fill();
        c.fillStyle = rgba(colors.accent, f);
        c.fill();
        c.stroke();
        c.fillStyle = rgba(colors.bg, 0.7);
      }
      c.beginPath();
      c.moveTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.lineTo(P[0], P[1]);
      c.closePath();
      c.lineWidth = r * 2.3;
      c.strokeStyle = rgba(colors.accent, 0.1);
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.08);
      c.fill();
      c.lineWidth = line;
      c.strokeStyle = rgba(colors.accent, 0.4);
      c.stroke();
      for (const [x, y] of [[ox, oy], B, C, D]) {
        c.fillStyle = rgba(colors.bg, 0.9);
        c.beginPath();
        c.arc(x, y, r * 0.55, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.fillStyle = rgba(colors.accent, 0.7);
      c.beginPath();
      c.arc(P[0], P[1], r * 0.45, 0, TAU);
      c.fill();
    };
    mech(w * 0.24, h * 0.62, unit * 0.11, [1, 3.2, 2.6, 3], [0.55, 0.9], 0.9);
    mech(w * 0.66, h * 0.4, unit * 0.075, [1, 3.6, 2.4, 3.3], [1.25, -0.45], -1.25);
  }

  /** A roller-chain drive: the chain runs round two sprockets, every roller seated in a tooth gap, the big one turning slower. */
  chainDrive(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const p = Math.min(unit * 0.04, w / 42);
    const z1 = 15;
    const z2 = 33;
    const R1 = (z1 * p) / TAU;
    const R2 = (z2 * p) / TAU;
    // Centre distance chosen so the chain is a whole number of pitches.
    const length = (D) => { const phi = Math.asin((R2 - R1) / D); return 2 * Math.sqrt(D * D - (R2 - R1) ** 2) + R1 * (Math.PI - 2 * phi) + R2 * (Math.PI + 2 * phi); };
    const want = Math.min(w * 0.5, unit * 0.95);
    const n = Math.round(length(want) / p);
    let lo = R2 - R1 + 1;
    let hi = w * 2;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (length(mid) < n * p) lo = mid; else hi = mid; }
    const D = (lo + hi) / 2;
    const L = n * p;
    const phi = Math.asin((R2 - R1) / D);
    const t = Math.sqrt(D * D - (R2 - R1) ** 2);
    const x1 = w / 2 - (D + R1 + R2) / 2 + R1;
    const x2 = x1 + D;
    const y = h * 0.52;
    const bu = -Math.PI / 2 - phi;
    const bl = Math.PI / 2 + phi;
    const d1 = 2 * t + R2 * (Math.PI + 2 * phi);
    // A point on the chain's pitch line, by distance from the upper tangent of the small sprocket (clockwise).
    const at = (dist) => {
      let s = mod(dist, L);
      if (s < t) { const f = s / t; return [x1 + Math.cos(bu) * R1 + (x2 - x1 + Math.cos(bu) * (R2 - R1)) * f, y + Math.sin(bu) * (R1 + (R2 - R1) * f)]; }
      s -= t;
      const a2 = R2 * (Math.PI + 2 * phi);
      if (s < a2) { const a = bu + s / R2; return [x2 + Math.cos(a) * R2, y + Math.sin(a) * R2]; }
      s -= a2;
      if (s < t) { const f = s / t; return [x2 + Math.cos(bl) * R2 + (x1 - x2 + Math.cos(bl) * (R1 - R2)) * f, y + Math.sin(bl) * (R2 + (R1 - R2) * f)]; }
      s -= t;
      const a = bl + s / R1;
      return [x1 + Math.cos(a) * R1, y + Math.sin(a) * R1];
    };
    const s = time * unit * 0.09;
    // Sprockets turn so the rollers stay in their gaps: ω = v / R, the big one z1/z2 as fast.
    const ang1 = bl + (s - d1) / R1 - Math.PI / z1;
    const ang2 = bu + (s - t) / R2 - Math.PI / z2;
    const line = Math.max(1, w / 1200) * SIZE;
    const m = p / Math.PI;
    for (const [cx, R, z, ang] of [[x1, R1, z1, ang1], [x2, R2, z2, ang2]]) {
      c.lineWidth = line;
      c.lineJoin = 'round';
      c.beginPath();
      gearPath(c, cx, y, z, m, ang);
      const rb = R * (z > 20 ? 0.16 : 0.26);
      c.moveTo(cx + rb, y);
      c.arc(cx, y, rb, 0, TAU);
      const holes = z > 20 ? 5 : 0;
      for (let k = 0; k < holes; k++) { const b = ang + (k / holes) * TAU; const hx = cx + Math.cos(b) * R * 0.55; const hy = y + Math.sin(b) * R * 0.55; c.moveTo(hx + R * 0.15, hy); c.arc(hx, hy, R * 0.15, 0, TAU); }
      c.fillStyle = rgba(colors.accent, 0.08);
      c.fill('evenodd');
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.stroke();
      c.strokeStyle = rgba(colors.text, 0.14);
      c.lineWidth = Math.max(1, line * 0.6);
      c.beginPath();
      c.moveTo(cx + R * 0.36, y); c.arc(cx, y, R * 0.36, 0, TAU);
      c.stroke();
      c.setTransform(Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang), cx, y);
      c.strokeStyle = rgba(colors.accent, 0.36);
      c.beginPath();
      c.moveTo(rb, -rb * 0.3); c.lineTo(rb * 1.35, -rb * 0.3); c.lineTo(rb * 1.35, rb * 0.3); c.lineTo(rb, rb * 0.3);
      c.stroke();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      c.moveTo(cx - R * 1.35, y); c.lineTo(cx + R * 1.35, y);
      c.moveTo(cx, y - R * 1.35); c.lineTo(cx, y + R * 1.35);
      c.stroke();
    }
    // The chain: inner and outer plates alternating, a roller at every pitch.
    const rollers = Array.from({ length: n }, (_, k) => at(s + k * p));
    c.lineWidth = Math.max(1, line * 0.8);
    for (let k = 0; k < n; k++) {
      const [ax, ay] = rollers[k];
      const [bx, by] = rollers[(k + 1) % n];
      const a = Math.atan2(by - ay, bx - ax);
      const r = p * (k % 2 ? 0.27 : 0.34);
      c.beginPath();
      c.moveTo(ax + Math.cos(a + Math.PI / 2) * r, ay + Math.sin(a + Math.PI / 2) * r);
      c.arc(ax, ay, r, a + Math.PI / 2, a - Math.PI / 2);
      c.arc(bx, by, r, a - Math.PI / 2, a + Math.PI / 2);
      c.closePath();
      c.fillStyle = rgba(colors.bg, 0.75);
      c.fill();
      c.fillStyle = rgba(k % 2 ? colors.accent : colors.text, k % 2 ? 0.12 : 0.07);
      c.fill();
      c.strokeStyle = rgba(colors.accent, k % 2 ? 0.34 : 0.26);
      c.stroke();
    }
    c.fillStyle = rgba(colors.bg, 0.85);
    c.strokeStyle = rgba(colors.accent, 0.42);
    c.beginPath();
    for (const [x, yy] of rollers) { c.moveTo(x + p * 0.19, yy); c.arc(x, yy, p * 0.19, 0, TAU); }
    c.fill();
    c.stroke();
    // Which way it runs, and the ratio.
    const font = Math.round((unit / 56) * Math.min(1.3, SIZE));
    c.font = `${font}px ${SANS}`;
    c.textAlign = 'center';
    c.fillStyle = rgba(colors.text, 0.38);
    c.fillText(`z ${z1}`, x1, y + R1 + p * 2.2);
    c.fillText(`z ${z2}`, x2, y + R2 + p * 2.2);
    c.fillText(`i = ${(z2 / z1).toFixed(2)}`, (x1 + x2) / 2, y + R2 + p * 2.2);
    c.textAlign = 'start';
    const ay = y - R2 - p * 1.6;
    c.strokeStyle = rgba(colors.text, 0.26);
    c.fillStyle = rgba(colors.text, 0.26);
    c.beginPath();
    c.moveTo((x1 + x2) / 2 - p * 2, ay); c.lineTo((x1 + x2) / 2 + p * 2, ay);
    c.stroke();
    c.beginPath();
    arrowHead(c, (x1 + x2) / 2 + p * 2.2, ay, 0, p * 0.5);
    c.fill();
  }
}
