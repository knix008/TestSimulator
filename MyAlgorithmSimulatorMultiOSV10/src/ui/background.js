// Moving backgrounds for the start page. Twenty-one of them, each a quiet picture of
// something the program already draws: sorting bars, array cells, a binary-search range,
// a tree, a graph, a pathfinding grid, a stack, a queue, a table, a heap, a linked list,
// bits, a call stack, the towers of Hanoi, the sieve, a merge, a pivot, a maze, hash
// buckets, numbered steps and a sliding search window. Colours follow the theme.

export const ANIMATION_KINDS = [
  'bars', 'cursor', 'binary', 'tree', 'graph', 'grid', 'stack', 'queue', 'table', 'heap', 'links',
  'bits', 'calls', 'hanoi', 'sieve', 'merge', 'pivot', 'maze', 'hash', 'steps', 'search',
];

/** Older decorative names, kept so a saved choice still opens a related picture. */
export const LEGACY_BACKGROUNDS = {
  aurora: 'bars', waves: 'queue', particles: 'bits', constellation: 'graph', bubbles: 'stack',
  gridflow: 'grid', flowchart: 'steps', starfield: 'heap', rain: 'links', snow: 'hash',
  fireflies: 'search', ripples: 'binary', coderain: 'bits', hexagons: 'sieve', orbits: 'tree',
  lava: 'hanoi', spiral: 'calls', confetti: 'merge', nodes: 'graph', ribbons: 'cursor', radar: 'maze',
};

export function backgroundKind(kind) {
  if (ANIMATION_KINDS.includes(kind)) return kind;
  return LEGACY_BACKGROUNDS[kind] ?? 'bars';
}

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

/** The backgrounds drift slowly: 30 frames a second look the same as 60–144 and cost a fraction. */
const FRAME_MS = 1000 / 30;

let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (c.roundRect) c.roundRect(x, y, w, h, radius);
  else c.rect(x, y, w, h);
}

function box(c, x, y, w, h, r, fill, stroke) {
  roundRect(c, x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}

/** One bubble-sort comparison, looped, so the bars keep sorting and starting over. */
function bubbleFrame(heights, tick) {
  const a = heights.slice();
  const n = a.length;
  const period = (n * (n - 1)) / 2;
  const done = Math.floor(tick) % period;
  let compared = 0;
  let focus = 0;
  for (let pass = 0; pass < n - 1 && compared <= done; pass++) {
    for (let j = 0; j < n - 1 - pass; j++) {
      if (compared === done) focus = j;
      if (compared < done && a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
      compared += 1;
      if (compared > done) break;
    }
  }
  return { a, focus };
}

/** Peg of each disc (0 smallest) after `step` legal moves of the n-disc puzzle. */
function hanoiPegs(n, step) {
  const towers = [Array.from({ length: n }, (_, i) => n - 1 - i), [], []];
  const total = (1 << n) - 1;
  const target = ((step % total) + total) % total;
  let moved = 0;
  const solve = (k, from, to, aux) => {
    if (!k || moved >= target) return;
    solve(k - 1, from, aux, to);
    if (moved >= target) return;
    towers[to].push(towers[from].pop());
    moved += 1;
    solve(k - 1, aux, to, from);
  };
  solve(n, 0, 2, 1);
  const peg = Array(n).fill(0);
  towers.forEach((tower, index) => tower.forEach((disc) => { peg[disc] = index; }));
  return peg;
}

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'bars', vivid = false, opacity = 1 } = {}) {
    this.vivid = vivid;
    this.opacity = Math.max(0, Math.min(1, opacity));
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#eef1f6', accent: '#3b6cff', text: '#243044', dark: false }));
    this.speed = speed;
    this.kind = backgroundKind(kind);
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

  setOpacity(opacity) {
    const next = Math.max(0, Math.min(1, Number(opacity) || 0));
    if (next === this.opacity) return;
    this.opacity = next;
    if (!this.running) this.draw();
  }

  setKind(kind) {
    const next = backgroundKind(kind);
    if (!ANIMATION_KINDS.includes(next) || next === this.kind) return;
    this.kind = next;
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
    const count = {
      bars: 22, pivot: 20, merge: 16, graph: 18, links: 7, stack: 6, queue: 8, hash: 18, bits: 1,
    }[this.kind] ?? 0;
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
    const kindBoost = { bars: 0.82, pivot: 0.82, merge: 0.82, sieve: 0.85, table: 0.85, bits: 0.8, hanoi: 0.9 }[this.kind] ?? 1;
    BOOST = (this.vivid ? (colors.dark ? 2.3 : 2.9) * kindBoost : 1) * this.opacity;
    SIZE = this.vivid ? 1.35 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
  }

  /** Sorting bars. One adjacent pair is the comparison, and the values actually bubble. */
  bars(c, w, h, time, colors) {
    const heights = this.items.map((p) => 0.22 + p.s * 0.72);
    const { a, focus } = bubbleFrame(heights, time * 3);
    this.barRow(c, w, h, a, focus, colors, 0.06, 0.08);
  }

  barRow(c, w, h, values, focus, colors, topPad, bottomPad) {
    const n = values.length;
    const gap = w / n;
    const base = h * (1 - bottomPad);
    const room = h * (1 - topPad - bottomPad);
    c.lineWidth = Math.max(1, w / 1400);
    for (let i = 0; i < n; i++) {
      const bh = Math.max(8, values[i] * room);
      const bw = gap * 0.62;
      const x = i * gap + (gap - bw) / 2;
      const hot = i === focus || i === focus + 1;
      box(c, x, base - bh, bw, bh, Math.min(7, bw * 0.28) * SIZE,
        rgba(hot ? colors.accent : colors.text, hot ? 0.2 : 0.055),
        rgba(hot ? colors.accent : colors.text, hot ? 0.45 : 0.12));
    }
  }

  /** Array cells, and a cursor walking through them the way a linear scan does. */
  cursor(c, w, h, time, colors) {
    const cols = 14;
    const rows = 6;
    const pad = Math.min(w, h) * 0.05;
    const cw = (w - pad * 2) / cols;
    const ch = (h - pad * 2) / rows;
    const at = Math.floor(time * 4) % (cols * rows);
    c.lineWidth = Math.max(1, w / 1600);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col;
        const hot = i === at;
        const seen = i < at;
        const x = pad + col * cw + cw * 0.1;
        const y = pad + r * ch + ch * 0.16;
        box(c, x, y, cw * 0.8, ch * 0.68, 6 * SIZE,
          rgba(hot ? colors.accent : colors.text, hot ? 0.2 : seen ? 0.04 : 0.02),
          rgba(hot ? colors.accent : colors.text, hot ? 0.55 : 0.1));
      }
    }
  }

  /** A range that keeps halving, with the middle cell marked. */
  binary(c, w, h, time, colors) {
    const cols = 16;
    const rows = 4;
    const padX = w * 0.05;
    const padY = h * 0.08;
    const cw = (w - padX * 2) / cols;
    const ch = (h - padY * 2) / rows;
    const target = 11;
    const steps = 5;
    const step = Math.floor(time * 0.7) % (steps + 2);
    let lo = 0;
    let hi = cols - 1;
    for (let s = 0; s < Math.min(step, steps); s++) {
      const mid = (lo + hi) >> 1;
      if (mid === target) break;
      if (mid < target) lo = mid + 1;
      else hi = mid - 1;
    }
    const mid = (lo + hi) >> 1;
    c.lineWidth = Math.max(1, w / 1600);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const inside = col >= lo && col <= hi;
        const hot = col === mid;
        const x = padX + col * cw + cw * 0.08;
        const y = padY + r * ch + ch * 0.18;
        box(c, x, y, cw * 0.84, ch * 0.64, 6 * SIZE,
          rgba(hot ? colors.accent : colors.text, hot ? 0.22 : inside ? 0.06 : 0.02),
          rgba(hot ? colors.accent : colors.text, hot ? 0.55 : inside ? 0.16 : 0.07));
      }
    }
  }

  /** A few binary trees, each with a node lighting in turn. */
  tree(c, w, h, time, colors) {
    const trees = 3;
    const depth = 4;
    const count = (1 << depth) - 1;
    const at = Math.floor(time * 1.4) % count;
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    for (let t = 0; t < trees; t++) {
      const ox = ((t + 0.5) / trees) * w;
      const top = h * (0.08 + (t % 2) * 0.04);
      const levelH = h * 0.2;
      const nodes = [];
      for (let i = 0; i < count; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const index = i - ((1 << level) - 1);
        const span = 1 << level;
        nodes.push({ x: ox + ((index + 0.5) / span - 0.5) * (w / trees) * 0.86, y: top + level * levelH, level });
      }
      nodes.forEach((node, i) => {
        const left = 2 * i + 1;
        const right = left + 1;
        c.strokeStyle = rgba(colors.text, 0.14);
        if (left < count) { c.beginPath(); c.moveTo(node.x, node.y); c.lineTo(nodes[left].x, nodes[left].y); c.stroke(); }
        if (right < count) { c.beginPath(); c.moveTo(node.x, node.y); c.lineTo(nodes[right].x, nodes[right].y); c.stroke(); }
      });
      const phase = (at + t * 3) % count;
      nodes.forEach((node, i) => {
        const hot = i === phase;
        const r = (hot ? 9 : 6.5) * SIZE * (w / 1400 + 0.7);
        c.fillStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.35 : 0.08);
        c.strokeStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.7 : 0.2);
        c.beginPath();
        c.arc(node.x, node.y, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      });
    }
  }

  /** Nodes that drift a little, linked to their nearest neighbours, with one hop lit. */
  graph(c, w, h, time, colors) {
    const pts = this.items.map((p) => ({
      x: (0.08 + p.x * 0.84 + Math.sin(time * 0.15 + p.h * 8) * 0.015) * w,
      y: (0.1 + p.y * 0.8 + Math.cos(time * 0.12 + p.v * 8) * 0.015) * h,
    }));
    const edges = [];
    for (let i = 0; i < pts.length; i++) {
      const near = pts.map((q, j) => [j, Math.hypot(pts[i].x - q.x, pts[i].y - q.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of near) if (i < j) edges.push([i, j]);
    }
    const hop = edges.length ? Math.floor(time * 1.2) % edges.length : 0;
    c.lineWidth = Math.max(1, w / 1500) * SIZE;
    edges.forEach(([i, j], k) => {
      c.strokeStyle = rgba(k === hop ? colors.accent : colors.text, k === hop ? 0.45 : 0.12);
      c.beginPath();
      c.moveTo(pts[i].x, pts[i].y);
      c.lineTo(pts[j].x, pts[j].y);
      c.stroke();
    });
    const travel = edges[hop];
    if (travel) {
      const u = (time * 1.2) % 1;
      const a = pts[travel[0]];
      const b = pts[travel[1]];
      c.fillStyle = rgba(colors.accent, 0.8);
      c.beginPath();
      c.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 4 * SIZE, 0, Math.PI * 2);
      c.fill();
    }
    for (const p of pts) {
      c.fillStyle = rgba(colors.accent, 0.16);
      c.strokeStyle = rgba(colors.accent, 0.45);
      c.beginPath();
      c.arc(p.x, p.y, 7 * SIZE * (w / 1600 + 0.65), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  /** A grid and a frontier spreading from the corner, the way a search fills cells. */
  grid(c, w, h, time, colors) {
    const cols = 20;
    const rows = 11;
    const pad = Math.min(w, h) * 0.04;
    const cw = (w - pad * 2) / cols;
    const ch = (h - pad * 2) / rows;
    const wave = (time * 2.2) % (cols + rows + 3);
    c.lineWidth = Math.max(1, w / 1800);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wall = (col * 5 + r * 3) % 11 === 0 && (col + r) !== 0;
        const dist = col + r;
        const front = !wall && Math.abs(dist - wave) < 0.8;
        const seen = !wall && dist < wave;
        const x = pad + col * cw + cw * 0.08;
        const y = pad + r * ch + ch * 0.1;
        box(c, x, y, cw * 0.84, ch * 0.8, 4 * SIZE,
          rgba(wall ? colors.text : front ? colors.accent : colors.text, wall ? 0.1 : front ? 0.28 : seen ? 0.07 : 0.025),
          rgba(front ? colors.accent : colors.text, front ? 0.5 : 0.08));
      }
    }
  }

  /** Plates pushed onto a stack and then popped back off. */
  stack(c, w, h, time, colors) {
    const piles = 5;
    const cap = 7;
    c.lineWidth = Math.max(1, w / 1500);
    for (let p = 0; p < piles; p++) {
      const count = 2 + Math.floor((Math.sin(time * 0.7 + p * 1.3) * 0.5 + 0.5) * cap);
      const cx = ((p + 0.5) / piles) * w;
      const bw = Math.min(w / piles * 0.55, 120 * SIZE);
      const bh = Math.min(h * 0.07, 28 * SIZE);
      const base = h * 0.86;
      c.strokeStyle = rgba(colors.text, 0.2);
      c.beginPath();
      c.moveTo(cx - bw * 0.7, base + bh);
      c.lineTo(cx + bw * 0.7, base + bh);
      c.stroke();
      for (let i = 0; i < count; i++) {
        const top = i === count - 1;
        box(c, cx - bw / 2, base - (i + 1) * (bh + 4), bw, bh, 6,
          rgba(top ? colors.accent : colors.text, top ? 0.22 : 0.06),
          rgba(top ? colors.accent : colors.text, top ? 0.55 : 0.16));
      }
    }
  }

  /** Boxes travelling along lanes and leaving at the front. */
  queue(c, w, h, time, colors) {
    const lanes = 4;
    const n = 8;
    c.lineWidth = Math.max(1, w / 1600);
    for (let lane = 0; lane < lanes; lane++) {
      const y = ((lane + 0.5) / lanes) * h;
      const bh = Math.min(h / lanes * 0.42, 36 * SIZE);
      const bw = Math.min(w / (n + 2), 90 * SIZE);
      const shift = (time * (40 + lane * 8) * SIZE) % (bw + 18);
      c.strokeStyle = rgba(colors.text, 0.1);
      c.beginPath();
      c.moveTo(w * 0.06, y);
      c.lineTo(w * 0.94, y);
      c.stroke();
      for (let i = 0; i < n; i++) {
        const x = w * 0.08 + i * (bw + 18) - shift;
        if (x < w * 0.04 || x > w * 0.9) continue;
        const front = i === n - 1;
        box(c, x, y - bh / 2, bw, bh, 8,
          rgba(front ? colors.accent : colors.text, front ? 0.2 : 0.05),
          rgba(front ? colors.accent : colors.text, front ? 0.5 : 0.14));
      }
    }
  }

  /** A table filling cell by cell, one row after another. */
  table(c, w, h, time, colors) {
    const cols = 12;
    const rows = 7;
    const pad = Math.min(w, h) * 0.06;
    const cw = (w - pad * 2) / cols;
    const ch = (h - pad * 2) / rows;
    const total = cols * rows;
    const at = Math.floor(time * 6) % (total + 6);
    c.lineWidth = Math.max(1, w / 1800);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col;
        const hot = i === at;
        const filled = i < at;
        box(c, pad + col * cw + 2, pad + r * ch + 2, cw - 4, ch - 4, 4,
          rgba(hot ? colors.accent : colors.text, hot ? 0.24 : filled ? 0.07 : 0.02),
          rgba(hot ? colors.accent : colors.text, hot ? 0.55 : 0.1));
      }
    }
  }

  /** A heap: the root pulses, then the highlight sifts down. */
  heap(c, w, h, time, colors) {
    const depth = 4;
    const count = (1 << depth) - 1;
    const order = [];
    for (let i = 0; i < count; i++) order.push(i);
    const at = order[Math.floor(time * 1.6) % order.length];
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const level = Math.floor(Math.log2(i + 1));
      const index = i - ((1 << level) - 1);
      const span = 1 << level;
      nodes.push({ x: ((index + 0.5) / span) * w * 0.86 + w * 0.07, y: h * 0.12 + level * h * 0.2 });
    }
    c.lineWidth = Math.max(1.2, w / 1200) * SIZE;
    nodes.forEach((node, i) => {
      for (const child of [2 * i + 1, 2 * i + 2]) {
        if (child >= count) continue;
        c.strokeStyle = rgba(colors.text, 0.16);
        c.beginPath();
        c.moveTo(node.x, node.y);
        c.lineTo(nodes[child].x, nodes[child].y);
        c.stroke();
      }
    });
    nodes.forEach((node, i) => {
      const hot = i === at;
      c.fillStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.28 : 0.07);
      c.strokeStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.65 : 0.2);
      c.beginPath();
      c.arc(node.x, node.y, (hot ? 16 : 12) * SIZE * (w / 1600 + 0.55), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    });
  }

  /** Linked nodes in rows, arrows between them, one node current. */
  links(c, w, h, time, colors) {
    const rows = 4;
    const n = 7;
    const at = Math.floor(time * 1.5) % n;
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) / rows) * h;
      const bw = Math.min(w / (n + 1) * 0.7, 78 * SIZE);
      const bh = Math.min(h / rows * 0.36, 32 * SIZE);
      for (let i = 0; i < n; i++) {
        const x = w * 0.06 + ((i + 0.15) / n) * w * 0.88;
        if (i < n - 1) {
          c.strokeStyle = rgba(colors.text, 0.2);
          c.beginPath();
          c.moveTo(x + bw, y);
          c.lineTo(x + (w * 0.88) / n - 8, y);
          c.stroke();
        }
        const hot = i === (at + r) % n;
        box(c, x, y - bh / 2, bw, bh, 8,
          rgba(hot ? colors.accent : colors.text, hot ? 0.22 : 0.05),
          rgba(hot ? colors.accent : colors.text, hot ? 0.55 : 0.16));
      }
    }
  }

  /** Bits in columns, and a scan that walks across them. */
  bits(c, w, h, time, colors) {
    const cols = 18;
    const rows = 8;
    const glyphs = '01';
    const size = Math.min((w / cols) * 0.55, (h / rows) * 0.55);
    c.font = `600 ${Math.round(size)}px Consolas, "Cascadia Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const scan = Math.floor(time * 3) % cols;
    for (let col = 0; col < cols; col++) {
      for (let r = 0; r < rows; r++) {
        const bit = glyphs[(col * 3 + r * 5 + Math.floor(time * 0.4)) % 2];
        const hot = col === scan;
        c.fillStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.55 : 0.12);
        c.fillText(bit, (col + 0.5) * (w / cols), (r + 0.5) * (h / rows));
      }
    }
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  }

  /** Nested call frames that grow and then return. */
  calls(c, w, h, time, colors) {
    const columns = 3;
    c.lineWidth = Math.max(1, w / 1400);
    for (let col = 0; col < columns; col++) {
      const depth = 3 + Math.floor((Math.sin(time * 0.55 + col) * 0.5 + 0.5) * 4);
      const x0 = (col + 0.08) * (w / columns);
      const span = w / columns * 0.84;
      const y0 = h * 0.1;
      const room = h * 0.78;
      for (let i = 0; i < depth; i++) {
        const inset = i * span * 0.06;
        const top = i === depth - 1;
        box(c, x0 + inset, y0 + i * (room / 8), span - inset * 2, room / 8 - 8, 8,
          rgba(top ? colors.accent : colors.text, top ? 0.16 : 0.035),
          rgba(top ? colors.accent : colors.text, top ? 0.5 : 0.14));
      }
    }
  }

  /** The towers of Hanoi, discs moving one legal step at a time. */
  hanoi(c, w, h, time, colors) {
    const n = 5;
    const tick = time * 0.55;
    const step = Math.floor(tick);
    const from = hanoiPegs(n, step);
    const to = hanoiPegs(n, step + 1);
    const u = tick - step;
    const changed = from.flatMap((peg, disc) => (peg === to[disc] ? [] : [disc]));
    const moving = changed.length === 1 ? changed[0] : -1;
    const pegs = from.map((peg, disc) => (disc === moving ? peg + (to[disc] - peg) * u : peg));
    const lift = from.map((peg, disc) => (disc === moving ? Math.sin(u * Math.PI) : 0));
    const base = h * 0.82;
    const pegX = [0.22, 0.5, 0.78].map((p) => p * w);
    c.lineWidth = Math.max(2, w / 700);
    c.strokeStyle = rgba(colors.text, 0.22);
    c.beginPath();
    c.moveTo(w * 0.08, base);
    c.lineTo(w * 0.92, base);
    pegX.forEach((x) => { c.moveTo(x, base); c.lineTo(x, h * 0.22); });
    c.stroke();
    for (let disc = n - 1; disc >= 0; disc--) {
      const peg = pegs[disc];
      const x = pegX[0] + (pegX[2] - pegX[0]) * (peg / 2);
      const below = pegs.filter((p, other) => other > disc && Math.abs(p - peg) < 0.35).length;
      const bw = w * (0.07 + disc * 0.035);
      const bh = Math.min(h * 0.055, 22 * SIZE);
      const y = base - (below + 1) * (bh + 4) - lift[disc] * h * 0.28;
      const hot = disc === moving;
      box(c, x - bw / 2, y, bw, bh, bh / 2,
        rgba(hot ? colors.accent : colors.text, hot ? 0.28 : 0.08),
        rgba(hot ? colors.accent : colors.text, hot ? 0.6 : 0.22));
    }
  }

  /** Multiples crossed out as the next prime is found. */
  sieve(c, w, h, time, colors) {
    const cols = 14;
    const rows = 7;
    const n = cols * rows;
    const primes = [2, 3, 5, 7, 11, 13];
    const step = Math.floor(time * 0.45) % (primes.length + 1);
    const crossed = new Set();
    for (let s = 0; s < step; s++) {
      for (let m = primes[s] * 2; m <= n; m += primes[s]) crossed.add(m);
    }
    const pad = Math.min(w, h) * 0.05;
    const cw = (w - pad * 2) / cols;
    const ch = (h - pad * 2) / rows;
    const size = Math.min(cw, ch) * 0.34;
    c.font = `600 ${Math.round(size)}px "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = Math.max(1, w / 1600);
    for (let i = 1; i <= n; i++) {
      const col = (i - 1) % cols;
      const r = Math.floor((i - 1) / cols);
      const x = pad + col * cw;
      const y = pad + r * ch;
      const prime = step > 0 && primes.slice(0, step).includes(i);
      const current = primes[step] === i;
      box(c, x + cw * 0.08, y + ch * 0.1, cw * 0.84, ch * 0.8, 6,
        rgba(current || prime ? colors.accent : colors.text, current ? 0.24 : prime ? 0.1 : 0.03),
        rgba(current || prime ? colors.accent : colors.text, current ? 0.55 : 0.12));
      c.fillStyle = rgba(crossed.has(i) ? colors.text : colors.text, crossed.has(i) ? 0.12 : 0.28);
      c.fillText(String(i), x + cw / 2, y + ch / 2);
      if (crossed.has(i)) {
        c.strokeStyle = rgba(colors.accent, 0.35);
        c.beginPath();
        c.moveTo(x + cw * 0.22, y + ch * 0.5);
        c.lineTo(x + cw * 0.78, y + ch * 0.5);
        c.stroke();
      }
    }
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  }

  /** Two sorted runs pouring into one merged row. */
  merge(c, w, h, time, colors) {
    const left = this.items.slice(0, 8).map((p) => 0.2 + p.s * 0.5).sort((a, b) => a - b);
    const right = this.items.slice(8).map((p) => 0.25 + p.s * 0.6).sort((a, b) => a - b);
    const u = (Math.sin(time * 0.6) * 0.5 + 0.5);
    const merged = [...left, ...right].sort((a, b) => a - b);
    const show = left.map((v, i) => v * (1 - u) + (merged[i] ?? v) * u).concat(right.map((v, i) => v * (1 - u) + (merged[left.length + i] ?? v) * u));
    this.barRow(c, w, h, show, Math.floor(u * (show.length - 2)), colors, 0.12, 0.14);
    c.fillStyle = rgba(colors.accent, 0.35);
    const mid = w * 0.5;
    c.fillRect(mid - 1, h * 0.1, 2, h * 0.72 * (1 - u));
  }

  /** A partition: values left of the pivot settle, and the pivot stays marked. */
  pivot(c, w, h, time, colors) {
    const values = this.items.map((p) => 0.2 + p.s * 0.75);
    const pivot = values[values.length - 1];
    const tick = time * 2.5;
    const j = Math.floor(tick) % (values.length - 1);
    const a = values.slice();
    let i = 0;
    for (let k = 0; k < j; k++) if (a[k] < pivot) { [a[i], a[k]] = [a[k], a[i]]; i += 1; }
    const n = a.length;
    const gap = w / n;
    const base = h * 0.9;
    const room = h * 0.72;
    c.lineWidth = Math.max(1, w / 1400);
    for (let k = 0; k < n; k++) {
      const bh = Math.max(8, a[k] * room);
      const bw = gap * 0.62;
      const x = k * gap + (gap - bw) / 2;
      const role = k === n - 1 ? 'pivot' : k === j ? 'look' : 'rest';
      const color = role === 'rest' ? colors.text : colors.accent;
      box(c, x, base - bh, bw, bh, Math.min(7, bw * 0.28),
        rgba(color, role === 'rest' ? 0.05 : role === 'pivot' ? 0.28 : 0.18),
        rgba(color, role === 'rest' ? 0.12 : 0.55));
    }
  }

  /** Corridors and a route lighting one cell at a time. */
  maze(c, w, h, time, colors) {
    const cols = 21;
    const rows = 11;
    const pad = Math.min(w, h) * 0.04;
    const cw = (w - pad * 2) / cols;
    const ch = (h - pad * 2) / rows;
    const open = (col, r) => (col % 2 === 0) || (r % 2 === 0 && (col + r) % 4 !== 3);
    const path = [];
    for (let r = 0; r < rows; r += 2) for (let col = 0; col < cols; col += 2) path.push([col, r]);
    const at = Math.floor(time * 4) % path.length;
    c.lineWidth = Math.max(1, w / 1800);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const wall = !open(col, r);
        const on = path.findIndex(([x, y]) => x === col && y === r);
        const hot = on === at;
        const seen = on >= 0 && on < at;
        box(c, pad + col * cw + 1.5, pad + r * ch + 1.5, cw - 3, ch - 3, 3,
          rgba(wall ? colors.text : hot ? colors.accent : colors.text, wall ? 0.11 : hot ? 0.32 : seen ? 0.08 : 0.03),
          rgba(hot ? colors.accent : colors.text, hot ? 0.55 : 0.06));
      }
    }
  }

  /** Keys dropping into buckets. */
  hash(c, w, h, time, colors) {
    const buckets = 6;
    const bw = w / buckets;
    c.lineWidth = Math.max(1, w / 1400);
    for (let b = 0; b < buckets; b++) {
      const x = b * bw + bw * 0.12;
      box(c, x, h * 0.58, bw * 0.76, h * 0.28, 10,
        rgba(colors.text, 0.03),
        rgba(colors.text, 0.16));
    }
    this.items.forEach((p, i) => {
      const bucket = Math.floor(p.h * buckets) % buckets;
      const fall = (time * (0.15 + p.v * 0.12) + p.y) % 1.15;
      const x = bucket * bw + bw * 0.5;
      const y = fall < 1 ? h * 0.08 + fall * h * 0.62 : h * 0.68 + (p.s * 0.14) * h;
      const landed = fall >= 1;
      c.fillStyle = rgba(colors.accent, landed ? 0.2 : 0.35);
      c.strokeStyle = rgba(colors.accent, landed ? 0.4 : 0.65);
      c.beginPath();
      c.arc(x + (p.x - 0.5) * bw * 0.3, y, (5 + (i % 3)) * SIZE * 0.9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    });
  }

  /** Numbered steps lighting one after another, the same idea as the step button. */
  steps(c, w, h, time, colors) {
    const n = 8;
    const at = Math.floor(time * 1.1) % n;
    const gap = Math.max(8, w * 0.012);
    const bw = Math.min(140 * SIZE, (w * 0.9 - gap * (n - 1)) / n);
    const bh = Math.min(h * 0.16, 54 * SIZE);
    c.font = `650 ${Math.round(bh * 0.38)}px "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = Math.max(1, w / 1400);
    for (let i = 0; i < n; i++) {
      const x = (w - n * bw - (n - 1) * gap) / 2 + i * (bw + gap);
      const y = h * 0.22 + i * ((h * 0.5) / n);
      const hot = i === at;
      const done = i < at;
      box(c, x, y, bw, bh, 10,
        rgba(hot ? colors.accent : colors.text, hot ? 0.22 : done ? 0.07 : 0.03),
        rgba(hot ? colors.accent : colors.text, hot ? 0.6 : 0.14));
      c.fillStyle = rgba(hot ? colors.accent : colors.text, hot ? 0.75 : 0.28);
      c.fillText(String(i + 1), x + bw / 2, y + bh / 2);
      if (i < n - 1) {
        c.strokeStyle = rgba(colors.text, 0.15);
        c.beginPath();
        c.moveTo(x + bw, y + bh);
        c.lineTo(x + bw + gap, y + (h * 0.5) / n);
        c.stroke();
      }
    }
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  }

  /** A pattern window sliding along rows of cells. */
  search(c, w, h, time, colors) {
    const cols = 16;
    const rows = 5;
    const padX = w * 0.04;
    const padY = h * 0.08;
    const cw = (w - padX * 2) / cols;
    const ch = (h - padY * 2) / rows;
    const width = 3;
    const at = Math.floor(time * 3) % (cols - width + 1);
    c.lineWidth = Math.max(1, w / 1600);
    for (let r = 0; r < rows; r++) {
      const shift = (at + r * 2) % (cols - width + 1);
      for (let col = 0; col < cols; col++) {
        const inside = col >= shift && col < shift + width;
        box(c, padX + col * cw + cw * 0.1, padY + r * ch + ch * 0.2, cw * 0.8, ch * 0.58, 5,
          rgba(inside ? colors.accent : colors.text, inside ? 0.18 : 0.03),
          rgba(inside ? colors.accent : colors.text, inside ? 0.5 : 0.1));
      }
    }
  }
}
