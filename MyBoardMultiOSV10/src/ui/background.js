// Moving backgrounds for the start page and (faintly) behind the views: sixteen quiet scenes from the world of
// Kanban — cards flowing across board columns, a wall of sticky notes, cumulative flow bands, a burndown being drawn,
// throughput bars, cycle-time dots, linked issues, swimlanes, a checklist ticking, a timeline, a workflow lighting
// its transitions, label chips drifting up, WIP gauges, a due-date calendar, hand-offs and a pipeline (the list is ANIMATIONS in settings). Colours follow the theme. The
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


/** Sticky-note colours (soft, readable in light and dark themes) and chart band colours. */
const NOTES = ['#f2c94c', '#f2994a', '#6fcf97', '#56ccf2', '#bb6bd9', '#eb5757', '#9b9b9b'];
const CHART = ['#3a86ff', '#8338ec', '#ff006e', '#fb5607', '#2ec4b6', '#8ac926'];
/** A card's colour: the theme's accent for some, note colours for the rest. */
const card = (i, colors) => (i % 5 === 0 ? colors.accent : NOTES[i % NOTES.length]);

/** A small Kanban card: a rounded body, a coloured stripe on the left and two lines of "text". */
function noteCard(c, x, y, w, h, color, alpha, colors) {
  if (alpha <= 0.01) return;
  c.fillStyle = rgba(colors.dark ? '#ffffff' : '#ffffff', (colors.dark ? 0.06 : 0.55) * alpha);
  c.beginPath(); roundRectPath(c, x, y, w, h, Math.min(10, h * 0.2)); c.fill();
  c.fillStyle = rgba(color, 0.55 * alpha);
  c.beginPath(); roundRectPath(c, x, y, Math.max(3, w * 0.04), h, 3); c.fill();
  c.fillStyle = rgba(colors.text, 0.12 * alpha);
  c.fillRect(x + w * 0.12, y + h * 0.28, w * 0.6, h * 0.13);
  c.fillRect(x + w * 0.12, y + h * 0.56, w * 0.38, h * 0.11);
  c.fillStyle = rgba(color, 0.4 * alpha);
  c.beginPath(); c.arc(x + w * 0.86, y + h * 0.66, Math.min(w, h) * 0.12, 0, Math.PI * 2); c.fill();
}

const SCENES = {
  // ───────────────────────── the scenes (Kanban, flow, charts, teamwork)

  /** Board columns; cards glide from To do to Done, column by column, and a new one drops in at the left. */
  flowBoard(c, w, h, time, colors) {
    const cols = 4;
    const gap = w * 0.03;
    const cw = (w - gap * (cols + 1)) / cols;
    const top = h * 0.12;
    const ch = Math.min(cw * 0.42, h * 0.11);
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    for (let k = 0; k < cols; k++) {
      const x = gap + k * (cw + gap);
      c.fillStyle = rgba(colors.text, 0.03);
      c.beginPath(); roundRectPath(c, x, top - ch * 0.9, cw, h - top, 14); c.fill();
      c.fillStyle = rgba(k === cols - 1 ? colors.accent : colors.text, 0.12);
      c.beginPath(); roundRectPath(c, x + cw * 0.08, top - ch * 0.62, cw * 0.4, ch * 0.22, 6); c.fill();
    }
    const n = 14;
    for (let i = 0; i < n; i++) {
      const speed = 0.035 + hash(i, 3) * 0.02;
      const p = mod(time * speed + hash(i, 1), 1);
      const pos = p * cols;
      const col = Math.min(cols - 1, Math.floor(pos));
      const f = pos - col;
      const move = clamp01((f - 0.78) / 0.22);
      const ease = move * move * (3 - 2 * move);
      const slot = Math.floor(hash(i, 2) * 6);
      const x = gap + (col + (col < cols - 1 ? ease : 0)) * (cw + gap) + cw * 0.08;
      const y = top + slot * ch * 1.25 - (col < cols - 1 ? Math.sin(ease * Math.PI) * ch * 0.6 : 0);
      if (y + ch > h) continue;
      noteCard(c, x, y, cw * 0.84, ch, card(i, colors), fadeInOut(p, 0.06, 0.04), colors);
    }
  },

  /** A wall of sticky notes: they are pinned one by one, sway a little, and fade to make room. */
  stickyWall(c, w, h, time, colors) {
    const size = Math.min(w, h) * 0.13;
    const cols = Math.ceil(w / (size * 1.35)) + 1;
    const rows = Math.ceil(h / (size * 1.35)) + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const { phase } = cycle(time + hash(k, 7) * 40, 24 + hash(k, 8) * 18);
        const a = fadeInOut(phase, 0.15, 0.08) * (0.35 + hash(k, 9) * 0.65);
        if (a <= 0.01) continue;
        const x = i * size * 1.35 + (hash(k, 4) - 0.5) * size * 0.4;
        const y = j * size * 1.35 + (hash(k, 5) - 0.5) * size * 0.4;
        c.save();
        c.translate(x + size / 2, y + size / 2);
        c.rotate((hash(k, 6) - 0.5) * 0.18 + Math.sin(time * 0.5 + k) * 0.015);
        c.fillStyle = rgba(NOTES[k % NOTES.length], 0.16 * a);
        c.fillRect(-size / 2, -size / 2, size, size);
        c.fillStyle = rgba(colors.text, 0.06 * a);
        for (let l = 0; l < 3; l++) c.fillRect(-size * 0.36, -size * 0.2 + l * size * 0.18, size * (0.72 - l * 0.16), size * 0.05);
        c.fillStyle = rgba(colors.accent, 0.3 * a);
        c.beginPath(); c.arc(0, -size * 0.42, size * 0.04 * SIZE, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
  },

  /** A cumulative flow diagram scrolling by: the total work rises to the right; done (the bottom band) grows the most. */
  cumulativeFlow(c, w, h, time, colors) {
    const steps = 40;
    const dx = w / steps;
    const travel = time * 18;
    const shift = mod(travel, dx);
    const day0 = Math.floor(travel / dx);
    const bands = 5;
    const stacks = [];
    const xs = [];
    for (let i = 0; i <= steps + 1; i++) {
      // a point keeps its values while it scrolls: they depend on its day (d) and its place on screen (x), never on i
      const d = day0 + i;
      const x = i * dx - shift;
      const across = clamp01(x / w);
      const total = h * (0.25 + 0.55 * across) + Math.sin(d * 0.21) * h * 0.025;
      const doneShare = 0.25 + 0.3 * across + Math.sin(d * 0.13) * 0.03;
      const rest = [0.3, 0.25, 0.25, 0.2].map((v, k) => v * (1 + Math.sin(d * 0.17 + k * 1.3) * 0.25));
      const sum = rest.reduce((a, b) => a + b, 0);
      stacks.push([doneShare, ...rest.map((v) => (v / sum) * (1 - doneShare))].map((v) => v * total));
      xs.push(x);
    }
    const base = h * 0.95;
    const below = new Array(stacks.length).fill(0);
    for (let b = 0; b < bands; b++) {
      c.fillStyle = rgba(b === 0 ? colors.accent : CHART[b % CHART.length], b === 0 ? 0.2 : 0.11);
      c.beginPath();
      for (let i = 0; i < stacks.length; i++) c.lineTo(xs[i], base - below[i] - stacks[i][b]);
      for (let i = stacks.length - 1; i >= 0; i--) c.lineTo(xs[i], base - below[i]);
      c.closePath(); c.fill();
      for (let i = 0; i < stacks.length; i++) below[i] += stacks[i][b];
    }
  },


  /** A burndown: the remaining work drawn day by day under a dashed ideal line, then a new sprint starts. */
  burndownLine(c, w, h, time, colors) {
    const { round, phase } = cycle(time, 30);
    const a = fadeInOut(phase, 0.1, 0.05);
    const left = w * 0.1; const right = w * 0.9; const top = h * 0.18; const bottom = h * 0.85;
    c.strokeStyle = rgba(colors.text, 0.1 * a); c.lineWidth = 1;
    gridPath(c, w, h, Math.min(w, h) / 10, left, top);
    c.setLineDash([10 * SIZE, 8 * SIZE]);
    c.strokeStyle = rgba(colors.text, 0.28 * a); c.lineWidth = 2 * SIZE;
    c.beginPath(); c.moveTo(left, top); c.lineTo(right, bottom); c.stroke();
    c.setLineDash([]);
    const days = 20;
    const pts = [];
    let rest = 1;
    for (let d = 0; d <= days; d++) {
      pts.push([left + (right - left) * (d / days), top + (bottom - top) * (1 - rest)]);
      rest = Math.max(0, rest - (hash(round, d) < 0.25 ? 0 : 0.03 + hash(round, d, 2) * 0.07) + (hash(round, d, 3) < 0.08 ? 0.05 : 0));
    }
    const segs = pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], pts[i][1], p[0], pts[i][1], p[0], p[1]]).flatMap(([x1, y1, x2, y2, x3, y3, x4, y4]) => [[x1, y1, x2, y2], [x3, y3, x4, y4]]);
    c.strokeStyle = rgba(colors.accent, 0.55 * a); c.lineWidth = 3 * SIZE; c.lineJoin = 'round';
    const pen = drawPartial(c, segs, phase / 0.85);
    if (pen) { c.fillStyle = rgba(colors.accent, 0.8 * a); c.beginPath(); c.arc(pen[0], pen[1], 5 * SIZE, 0, Math.PI * 2); c.fill(); }
  },

  /** Throughput: a bar for each week rises in turn, the average line follows them. */
  throughput(c, w, h, time, colors) {
    const n = 16;
    const gap = w / n;
    const shift = mod(time * 8, gap);
    const first = Math.floor(time * 8 / gap);
    let sum = 0;
    for (let i = -1; i <= n; i++) {
      const v = 0.25 + hash(first + i, 4) * 0.55;
      sum += v;
      const grow = clamp01((i * gap - shift) / w * -1 + 1.2);
      const bh = h * 0.6 * v * Math.min(1, grow);
      const x = i * gap - shift + gap * 0.18;
      c.fillStyle = rgba(i % 4 === 0 ? colors.accent : colors.text, i % 4 === 0 ? 0.22 : 0.08);
      c.beginPath(); roundRectPath(c, x, h * 0.88 - bh, gap * 0.64, bh, 8); c.fill();
    }
    const avg = h * 0.88 - h * 0.6 * (sum / (n + 2));
    c.setLineDash([12 * SIZE, 9 * SIZE]); c.strokeStyle = rgba(colors.accent, 0.4); c.lineWidth = 2 * SIZE;
    c.beginPath(); c.moveTo(0, avg); c.lineTo(w, avg); c.stroke(); c.setLineDash([]);
  },

  /** A control chart: finished issues appear as dots by cycle time; a rolling average winds through them. */
  controlDots(c, w, h, time, colors) {
    const n = 90;
    const span = 60;
    const t0 = time - span;
    const pts = [];
    for (let i = Math.floor(t0 * 1.5); i < time * 1.5; i++) {
      const at = i / 1.5;
      const x = ((at - t0) / span) * w;
      const y = h * (0.82 - 0.55 * Math.pow(hash(i, 11), 2.2));
      pts.push([x, y, clamp01((time - at) * 2)]);
      if (pts.length > n) pts.shift();
    }
    c.fillStyle = rgba(colors.accent, 0.05);
    c.fillRect(0, h * 0.5, w, h * 0.2);
    for (const [x, y, a] of pts) { c.fillStyle = rgba(colors.accent, 0.35 * a); c.beginPath(); c.arc(x, y, 4 * SIZE, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = rgba(colors.text, 0.3); c.lineWidth = 2 * SIZE; c.beginPath();
    pts.forEach((p, i) => { const win = pts.slice(Math.max(0, i - 6), i + 1); const y = win.reduce((s, q) => s + q[1], 0) / win.length; if (i) c.lineTo(p[0], y); else c.moveTo(p[0], y); });
    c.stroke();
  },

  /** Linked issues: cards as nodes, links between them; a pulse runs along a link now and then. */
  issueGraph(c, w, h, time, colors) {
    const n = 18;
    const nodes = Array.from({ length: n }, (_, i) => ({
      x: w * (0.08 + 0.84 * hash(i, 1)) + Math.sin(time * 0.15 + i) * w * 0.015,
      y: h * (0.1 + 0.8 * hash(i, 2)) + Math.cos(time * 0.13 + i * 1.7) * h * 0.02,
    }));
    const links = [];
    for (let i = 0; i < n; i++) for (const j of [(i * 7 + 3) % n, (i * 5 + 1) % n]) if (i < j) links.push([i, j]);
    c.lineWidth = 1.5 * SIZE;
    links.forEach(([a, b], k) => {
      const A = nodes[a]; const B = nodes[b];
      c.strokeStyle = rgba(colors.text, 0.1); c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      const { phase } = cycle(time + hash(k, 5) * 20, 6 + hash(k, 6) * 6);
      if (phase < 0.5) {
        const p = phase * 2;
        c.fillStyle = rgba(colors.accent, 0.6 * Math.sin(p * Math.PI));
        c.beginPath(); c.arc(A.x + (B.x - A.x) * p, A.y + (B.y - A.y) * p, 4 * SIZE, 0, Math.PI * 2); c.fill();
      }
    });
    const cw = Math.min(w, h) * 0.09;
    nodes.forEach((p, i) => noteCard(c, p.x - cw / 2, p.y - cw * 0.3, cw, cw * 0.6, card(i, colors), 0.9, colors));
  },

  /** Swimlanes: horizontal lanes; cards move along their lane through the column lines. */
  swimlanes(c, w, h, time, colors) {
    const lanes = 5;
    const lh = h / lanes;
    c.lineWidth = 1;
    for (let k = 0; k < lanes; k++) {
      c.fillStyle = rgba(k % 2 ? colors.text : colors.accent, 0.03);
      c.fillRect(0, k * lh, w, lh);
      c.fillStyle = rgba(colors.accent, 0.18);
      c.fillRect(0, k * lh + lh * 0.1, 6 * SIZE, lh * 0.8);
    }
    c.strokeStyle = rgba(colors.text, 0.08);
    for (let x = w / 5; x < w; x += w / 5) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    const cw = w * 0.11; const ch = lh * 0.48;
    for (let i = 0; i < 16; i++) {
      const lane = i % lanes;
      const p = mod(time * (0.012 + hash(i, 3) * 0.01) + hash(i, 4), 1);
      const step = Math.floor(p * 5); const f = p * 5 - step;
      const x = (step + (f > 0.8 ? (f - 0.8) / 0.2 : 0)) * (w / 5) + w * 0.035;
      noteCard(c, x, lane * lh + (lh - ch) / 2, cw, ch, card(i, colors), fadeInOut(p, 0.05, 0.05), colors);
    }
  },

  /** A checklist: lines appear, their boxes tick one after another, and a progress bar fills. */
  checklist(c, w, h, time, colors) {
    const { round, phase } = cycle(time, 22);
    const a = fadeInOut(phase, 0.12, 0.05);
    const rows = 9; const rh = h * 0.075; const x = w * 0.28; const top = h * 0.17; const box = rh * 0.5;
    const done = Math.floor(phase / 0.85 * (rows + 1));
    c.fillStyle = rgba(colors.text, 0.06 * a); c.beginPath(); roundRectPath(c, x - box, top - rh * 1.4, w * 0.46, h * 0.06, 10); c.fill();
    c.fillStyle = rgba(colors.accent, 0.35 * a); c.beginPath(); roundRectPath(c, x - box, top - rh * 1.4, w * 0.46 * Math.min(1, done / rows), h * 0.06, 10); c.fill();
    for (let r = 0; r < rows; r++) {
      const y = top + r * rh;
      const on = r < done;
      c.lineWidth = 2 * SIZE; c.strokeStyle = rgba(on ? colors.accent : colors.text, (on ? 0.6 : 0.2) * a);
      c.beginPath(); roundRectPath(c, x, y, box, box, 4); c.stroke();
      if (on) { c.beginPath(); c.moveTo(x + box * 0.2, y + box * 0.52); c.lineTo(x + box * 0.42, y + box * 0.75); c.lineTo(x + box * 0.82, y + box * 0.25); c.stroke(); }
      c.fillStyle = rgba(colors.text, (on ? 0.1 : 0.16) * a);
      c.fillRect(x + box * 1.8, y + box * 0.35, w * (0.18 + 0.2 * hash(round, r)), box * 0.3);
    }
  },

  /** A timeline: bars of work across the days grow, and the "today" line walks to the right. */
  timeline(c, w, h, time, colors) {
    const day = w / 30;
    const shift = mod(time * 6, day * 7);
    c.strokeStyle = rgba(colors.text, 0.06); c.lineWidth = 1;
    for (let x = -shift; x < w; x += day) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    const rows = 11; const rh = h / rows;
    const offset = Math.floor(time * 6 / (day * 7)) * 7;
    for (let r = 0; r < rows; r++) {
      const start = (hash(r, offset, 1) * 20) * day - shift;
      const len = (3 + hash(r, offset, 2) * 10) * day;
      c.fillStyle = rgba(r % 3 === 0 ? colors.accent : CHART[r % CHART.length], 0.18);
      c.beginPath(); roundRectPath(c, start, r * rh + rh * 0.28, len, rh * 0.44, rh * 0.22); c.fill();
      c.fillStyle = rgba(colors.accent, 0.3);
      c.beginPath(); roundRectPath(c, start, r * rh + rh * 0.28, len * clamp01(hash(r, offset, 3) + 0.2), rh * 0.44, rh * 0.22); c.fill();
    }
    const today = w * 0.62;
    c.strokeStyle = rgba(colors.accent, 0.55); c.lineWidth = 2 * SIZE;
    c.beginPath(); c.moveTo(today, 0); c.lineTo(today, h); c.stroke();
  },

  /** A workflow: status boxes in a row with arrows; a token travels through the transitions and lights them. */
  workflow(c, w, h, time, colors) {
    const n = 5; const bw = w * 0.13; const bh = h * 0.1; const y = h * 0.45;
    const xs = Array.from({ length: n }, (_, i) => w * 0.08 + i * (w * 0.84 - bw) / (n - 1));
    const p = mod(time * 0.08, n - 1);
    const at = Math.floor(p); const f = p - at;
    c.lineWidth = 2 * SIZE;
    for (let i = 0; i < n - 1; i++) {
      const lit = i === at;
      c.strokeStyle = rgba(lit ? colors.accent : colors.text, lit ? 0.6 : 0.15);
      const x1 = xs[i] + bw; const x2 = xs[i + 1];
      c.beginPath(); c.moveTo(x1, y + bh / 2); c.lineTo(x2 - 8, y + bh / 2); c.stroke();
      c.beginPath(); c.moveTo(x2 - 14, y + bh / 2 - 6); c.lineTo(x2 - 4, y + bh / 2); c.lineTo(x2 - 14, y + bh / 2 + 6); c.stroke();
      // a "back" transition below
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath(); c.moveTo(x2 + bw * 0.3, y + bh); c.quadraticCurveTo((x1 + x2) / 2, y + bh * 2.4, xs[i] + bw * 0.7, y + bh); c.stroke();
    }
    xs.forEach((x, i) => {
      const lit = i === at || (i === at + 1 && f > 0.9);
      c.fillStyle = rgba(i === n - 1 ? colors.accent : colors.text, lit ? 0.22 : 0.07);
      c.beginPath(); roundRectPath(c, x, y, bw, bh, 12); c.fill();
      c.fillStyle = rgba(colors.text, 0.18); c.fillRect(x + bw * 0.18, y + bh * 0.42, bw * 0.64, bh * 0.16);
    });
    const tx = xs[at] + bw + (xs[at + 1] - xs[at] - bw) * f;
    c.fillStyle = rgba(colors.accent, 0.8); c.beginPath(); c.arc(tx, y + bh / 2, 6 * SIZE, 0, Math.PI * 2); c.fill();
  },

  /** Labels: little tag chips drift up and turn slowly, like confetti from a finished sprint. */
  labels(c, w, h, time, colors) {
    const n = 34;
    const size = Math.min(w, h) * 0.05;
    for (let i = 0; i < n; i++) {
      const y = h * 1.1 - mod(time * (0.02 + hash(i, 1) * 0.03) * h + hash(i, 2) * h * 1.2, h * 1.2);
      const x = w * hash(i, 3) + Math.sin(time * 0.4 + i) * size;
      c.save();
      c.translate(x, y); c.rotate(Math.sin(time * 0.3 + i) * 0.4);
      const tw = size * (1.4 + hash(i, 4) * 1.6);
      c.fillStyle = rgba(i % 4 === 0 ? colors.accent : NOTES[i % NOTES.length], 0.18);
      c.beginPath(); c.moveTo(-tw / 2, -size / 3); c.lineTo(tw / 2 - size / 3, -size / 3); c.lineTo(tw / 2, 0); c.lineTo(tw / 2 - size / 3, size / 3); c.lineTo(-tw / 2, size / 3); c.closePath(); c.fill();
      c.fillStyle = rgba(colors.bg, 0.6); c.beginPath(); c.arc(tw / 2 - size / 2.2, 0, size * 0.07, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  },

  /** WIP gauges: one per column, filling and emptying as work comes and goes; over the limit they turn to the accent. */
  wipGauge(c, w, h, time, colors) {
    const n = 6; const gap = w / (n + 1); const r = Math.min(gap * 0.38, h * 0.22); const y = h * 0.55;
    for (let i = 0; i < n; i++) {
      const x = gap * (i + 1);
      const v = 0.5 + 0.45 * Math.sin(time * (0.18 + i * 0.03) + i * 1.7);
      const over = v > 0.8;
      c.lineWidth = r * 0.22; c.lineCap = 'round';
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath(); c.arc(x, y, r, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
      c.strokeStyle = rgba(over ? colors.accent : CHART[i % CHART.length], over ? 0.55 : 0.28);
      c.beginPath(); c.arc(x, y, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v)); c.stroke();
      c.strokeStyle = rgba(colors.text, 0.25); c.lineWidth = 2 * SIZE;
      const lim = Math.PI * (0.75 + 1.5 * 0.8);
      c.beginPath(); c.moveTo(x + Math.cos(lim) * r * 0.8, y + Math.sin(lim) * r * 0.8); c.lineTo(x + Math.cos(lim) * r * 1.2, y + Math.sin(lim) * r * 1.2); c.stroke();
      c.lineCap = 'butt';
    }
  },

  /** A month calendar: due dates appear in the days as dots; today walks across the grid. */
  dueCalendar(c, w, h, time, colors) {
    const cols = 7; const rows = 5; const cw = w * 0.82 / cols; const ch = h * 0.78 / rows; const x0 = w * 0.09; const y0 = h * 0.12;
    const { round, phase } = cycle(time, 35);
    const today = Math.floor(phase * cols * rows);
    c.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k; const x = x0 + k * cw; const y = y0 + r * ch;
        c.strokeStyle = rgba(colors.text, 0.08); c.strokeRect(x, y, cw, ch);
        if (i === today) { c.fillStyle = rgba(colors.accent, 0.14); c.fillRect(x, y, cw, ch); }
        const dots = Math.floor(hash(round, i) * 4);
        for (let d = 0; d < dots; d++) {
          const late = i < today && hash(round, i, d) < 0.3;
          c.fillStyle = rgba(late ? '#eb5757' : NOTES[(i + d) % NOTES.length], i <= today ? 0.45 : 0.22);
          c.beginPath(); roundRectPath(c, x + cw * 0.12, y + ch * (0.25 + d * 0.22), cw * 0.76, ch * 0.14, 4); c.fill();
        }
      }
    }
  },

  /** Hand-offs: people around a circle pass cards to each other. */
  handoff(c, w, h, time, colors) {
    const n = 7; const cx = w / 2; const cy = h / 2; const R = Math.min(w, h) * 0.34; const r = R * 0.16;
    const pos = Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2 - Math.PI / 2) * R * 1.25, y: cy + Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) * R }));
    pos.forEach((p, i) => {
      c.fillStyle = rgba(card(i, colors), 0.25); c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba(colors.text, 0.18); c.beginPath(); c.arc(p.x, p.y - r * 0.2, r * 0.32, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(p.x, p.y + r * 0.75, r * 0.6, Math.PI, 0); c.fill();
    });
    for (let k = 0; k < 5; k++) {
      const t = time * 0.25 + k * 1.37;
      const from = Math.floor(t + hash(k, 1) * n) % n; const to = (from + 1 + Math.floor(hash(k, Math.floor(t)) * (n - 1))) % n;
      const f = t - Math.floor(t); const e = f * f * (3 - 2 * f);
      const A = pos[from]; const B = pos[to];
      const x = A.x + (B.x - A.x) * e; const y = A.y + (B.y - A.y) * e - Math.sin(e * Math.PI) * R * 0.25;
      noteCard(c, x - r * 0.9, y - r * 0.5, r * 1.8, r, card(k + 2, colors), Math.sin(f * Math.PI), colors);
    }
  },

  /** A pipeline: issues stream through stages that narrow, some drop out, the rest arrive at the end. */
  pipeline(c, w, h, time, colors) {
    const stages = 5; const sw = w / stages; const cy = h / 2;
    for (let s = 0; s < stages; s++) {
      const hh = h * (0.62 - s * 0.09);
      c.fillStyle = rgba(s === stages - 1 ? colors.accent : colors.text, s === stages - 1 ? 0.1 : 0.04 + s * 0.008);
      c.beginPath(); roundRectPath(c, s * sw + sw * 0.06, cy - hh / 2, sw * 0.88, hh, 16); c.fill();
    }
    for (let i = 0; i < 70; i++) {
      const p = mod(time * (0.03 + hash(i, 1) * 0.02) + hash(i, 2), 1);
      const stage = Math.floor(p * stages);
      const drop = hash(i, 3) * stages;
      if (stage > drop + 1) continue;
      const hh = h * (0.62 - Math.min(stage, stages - 1) * 0.09);
      const x = p * w; const y = cy + (hash(i, 4) - 0.5) * hh * 0.8;
      const a = stage >= drop + 1 ? 1 - (p * stages - Math.floor(p * stages)) : 1;
      c.fillStyle = rgba(card(i, colors), 0.45 * a * fadeInOut(p, 0.04, 0.04));
      c.beginPath(); c.arc(x, y, 4 * SIZE, 0, Math.PI * 2); c.fill();
    }
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
    const kindBoost = { cumulativeFlow: 0.8, stickyWall: 0.85, timeline: 0.85 }[this.kind] ?? 1;
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
