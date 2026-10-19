// Twenty AI-themed moving backgrounds for the start page (ANIMATIONS in
// settings): signals through a neural network, gradient descent on a loss
// surface, attention arcs between tokens, a sliding convolution kernel,
// embeddings clustering, tensor blocks, activation functions, forward and
// backward passes, a learning decision boundary, loss curves, dropout, tokens
// through a transformer, diffusion denoising, k-means, a growing decision tree,
// a firing neural web, a weight matrix, a latent-space walk, an unrolled RNN and
// a GAN's distributions meeting. Colours follow the theme; the animation pauses
// while the window is hidden; `frames` counts drawn frames (tests use it).
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;
const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7'];
const FRAME_MS = 1000 / 30;

const rand = (seed) => {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  next.normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next());
  return next;
};

const rgbCache = new Map();
function hexToRgb(hex) {
  let value = rgbCache.get(hex);
  if (!value) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    value = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
    rgbCache.set(hex, value);
  }
  return value;
}
let BOOST = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'neural', vivid = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.vivid = vivid;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'neural';
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.last = 0;
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
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

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    this.w = Math.max(1, this.canvas.clientWidth);
    this.h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(this.w * ratio);
    this.canvas.height = Math.round(this.h * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.seed();
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
    if (now - this.last >= FRAME_MS - 2) {
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed();
      this.last = now;
      this.time += dt;
      this.draw(dt);
      this.frames++;
    }
    requestAnimationFrame(this.loop);
  }

  /** Draws one frame at once (thumbnails, tests). */
  drawOnce() { this.draw(0.016); this.frames++; }

  seed() {
    const r = rand(this.kind.length * 7919 + 13);
    this.r = r;
    const { w, h } = this;
    const s = {};
    switch (this.kind) {
      case 'neural':
      case 'backprop':
      case 'dropout': {
        const layers = this.kind === 'dropout' ? 7 : 5;
        s.cols = Array.from({ length: layers }, (_, c) => {
          const n = this.kind === 'dropout' ? 7 : [4, 7, 8, 6, 3][c];
          return Array.from({ length: n }, (__, k) => ({ x: w * (0.12 + (0.76 * c) / (layers - 1)), y: h * (0.15 + (0.7 * (k + 0.5)) / n), glow: 0, on: true }));
        });
        s.pulses = [];
        break;
      }
      case 'gradient':
        s.balls = Array.from({ length: 5 }, (_, i) => ({ x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 1.6, vx: 0, vy: 0, trail: [], color: PALETTE[i], kind: i }));
        break;
      case 'attention':
        s.tokens = Array.from({ length: 9 }, (_, i) => ({ x: w * (0.1 + (0.8 * i) / 8), weights: Array.from({ length: 9 }, () => r()) }));
        s.query = 0;
        s.phase = 0;
        break;
      case 'convolution':
        s.cells = Array.from({ length: 12 * 12 }, () => r());
        s.pos = 0;
        break;
      case 'embedding':
      case 'clusters': {
        const k = 4;
        s.centers = Array.from({ length: k }, () => ({ x: w * (0.2 + r() * 0.6), y: h * (0.2 + r() * 0.6) }));
        s.points = Array.from({ length: 160 }, (_, i) => ({ x: r() * w, y: r() * h, c: i % k, tx: 0, ty: 0, vx: 0, vy: 0 }));
        s.cent = Array.from({ length: k }, () => ({ x: r() * w, y: r() * h }));
        s.phase = 0;
        break;
      }
      case 'tensors':
        s.cubes = Array.from({ length: 18 }, () => ({ x: r() * w, y: r() * h, size: 16 + r() * 34, speed: 10 + r() * 22, depth: 1 + Math.floor(r() * 4), hue: Math.floor(r() * PALETTE.length) }));
        break;
      case 'activation':
        s.phase = 0;
        break;
      case 'decision':
        s.points = Array.from({ length: 120 }, () => {
          const x = r() * 2 - 1; const y = r() * 2 - 1;
          return { x, y, c: y > 0.45 * Math.sin(3 * x) + 0.2 * x ? 1 : 0 };
        });
        break;
      case 'loss':
        s.curves = Array.from({ length: 4 }, (_, i) => ({ decay: 1.5 + r() * 3, floor: 0.08 + r() * 0.2, noise: Array.from({ length: 200 }, () => r.normal() * 0.03), color: PALETTE[i], delay: i * 0.6 }));
        s.t = 0;
        break;
      case 'tokens':
        s.words = ['the', 'model', 'learns', 'to', 'attend', 'tokens', 'and', 'predict', 'next', 'word', 'AI', 'data'];
        s.flow = Array.from({ length: 14 }, (_, i) => ({ x: -i * 70, y: h * (0.42 + r() * 0.16), word: s.words[i % s.words.length], out: false }));
        break;
      case 'diffusion': {
        const n = 260;
        s.targets = Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          // A heart curve: the "image" the noise is denoised into.
          const x = 16 * Math.sin(a) ** 3;
          const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
          return { x: w / 2 + x * Math.min(w, h) * 0.017, y: h / 2 + y * Math.min(w, h) * 0.017 };
        });
        s.noise = s.targets.map(() => ({ x: r() * w, y: r() * h }));
        s.phase = 0;
        break;
      }
      case 'tree':
        s.phase = 0;
        s.seed = Math.floor(r() * 1000);
        break;
      case 'brain':
        s.nodes = Array.from({ length: 46 }, () => ({ x: w * (0.08 + r() * 0.84), y: h * (0.1 + r() * 0.8), fire: 0 }));
        s.links = [];
        for (let i = 0; i < s.nodes.length; i++) {
          const near = s.nodes.map((n, j) => [j, Math.hypot(n.x - s.nodes[i].x, n.y - s.nodes[i].y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
          for (const [j] of near) if (i < j) s.links.push([i, j, r() * 0.6 - 0.3]);
        }
        s.spikes = [];
        break;
      case 'weights':
        s.rows = 14; s.colsN = 22;
        s.phase = Array.from({ length: s.rows * s.colsN }, () => r() * Math.PI * 2);
        s.freq = Array.from({ length: s.rows * s.colsN }, () => 0.3 + r() * 1.2);
        break;
      case 'latent':
        s.shapes = Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => 0.55 + r() * 0.45));
        break;
      case 'recurrent':
        s.offset = 0;
        s.values = Array.from({ length: 40 }, () => r());
        break;
      case 'gan':
        s.mu = -1.8; s.sigma = 1.4;
        break;
      default: break;
    }
    this.s = s;
  }

  draw(dt) {
    const { ctx, w, h } = this;
    const colors = this.colors();
    BOOST = this.vivid ? (colors.dark ? 1.25 : 1.6) : 1;
    ctx.clearRect(0, 0, w, h);
    const fn = this[`draw_${this.kind}`];
    if (fn) fn.call(this, ctx, w, h, dt, colors);
  }

  // ───────────────────────── the twenty animations

  network(ctx, colors, { backward = false, dropout = false } = {}) {
    const { s } = this;
    for (let c = 0; c < s.cols.length - 1; c++) {
      for (const a of s.cols[c]) for (const b of s.cols[c + 1]) {
        if (dropout && (!a.on || !b.on)) continue;
        ctx.strokeStyle = rgba(colors.text, 0.06);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (const col of s.cols) for (const n of col) {
      n.glow = Math.max(0, n.glow - 0.03);
      ctx.beginPath(); ctx.arc(n.x, n.y, 9, 0, Math.PI * 2);
      if (dropout && !n.on) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(colors.text, 0.25); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      ctx.fillStyle = rgba(backward && n.back ? '#f28e2b' : colors.accent, 0.15 + n.glow * 0.7);
      ctx.fill();
      ctx.strokeStyle = rgba(colors.accent, 0.4 + n.glow * 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  draw_neural(ctx, w, h, dt, colors) {
    const { s, r } = this;
    if (r() < dt * 6) {
      const c = Math.floor(r() * (s.cols.length - 1));
      const a = s.cols[c][Math.floor(r() * s.cols[c].length)];
      const b = s.cols[c + 1][Math.floor(r() * s.cols[c + 1].length)];
      s.pulses.push({ a, b, t: 0, c });
    }
    this.network(ctx, colors);
    for (const p of s.pulses) {
      p.t += dt * 1.4;
      const x = p.a.x + (p.b.x - p.a.x) * p.t; const y = p.a.y + (p.b.y - p.a.y) * p.t;
      ctx.strokeStyle = rgba(colors.accent, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = rgba('#edc948', 0.9); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      if (p.t >= 1) {
        p.b.glow = 1;
        if (p.c + 2 < s.cols.length && r() < 0.8) {
          const next = s.cols[p.c + 2][Math.floor(r() * s.cols[p.c + 2].length)];
          s.pulses.push({ a: p.b, b: next, t: 0, c: p.c + 1 });
        }
      }
    }
    s.pulses = s.pulses.filter((p) => p.t < 1);
  }

  draw_backprop(ctx, w, h, dt, colors) {
    const { s } = this;
    const cycle = (this.time * 0.35) % 2;
    const backward = cycle >= 1;
    const progress = cycle % 1;
    const layer = backward ? (s.cols.length - 1) * (1 - progress) : (s.cols.length - 1) * progress;
    s.cols.forEach((col, c) => col.forEach((n) => { if (Math.abs(c - layer) < 0.35) { n.glow = 1; n.back = backward; } }));
    this.network(ctx, colors, { backward: true });
    const x = w * (0.12 + 0.76 * (layer / (s.cols.length - 1)));
    const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
    const c = backward ? '#f28e2b' : colors.accent;
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, 0.18)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - 60, 0, 120, h);
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_dropout(ctx, w, h, dt, colors) {
    const { s, r } = this;
    s.timer = (s.timer ?? 0) + dt;
    if (s.timer > 0.6) {
      s.timer = 0;
      for (const col of s.cols.slice(1, -1)) for (const n of col) { n.on = r() > 0.35; if (n.on) n.glow = 0.6; }
    }
    this.network(ctx, colors, { dropout: true });
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_gradient(ctx, w, h, dt, colors) {
    const { s, r } = this;
    const cx = w / 2; const cy = h / 2; const sx = w / 3; const sy = h / 2.6;
    const loss = (x, y) => 0.6 * x * x + 1.8 * y * y + 0.3 * Math.sin(3 * x) * Math.cos(2 * y);
    for (let level = 1; level <= 9; level++) {
      ctx.strokeStyle = rgba(colors.accent, 0.05 + level * 0.012);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, sx * Math.sqrt(level / 6) * 1.1, sy * Math.sqrt(level / 6) * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of s.balls) {
      const e = 1e-3;
      const gx = (loss(b.x + e, b.y) - loss(b.x - e, b.y)) / (2 * e);
      const gy = (loss(b.x, b.y + e) - loss(b.x, b.y - e)) / (2 * e);
      const lr = 0.6 * dt;
      if (b.kind % 2) { b.vx = 0.9 * b.vx - lr * gx; b.vy = 0.9 * b.vy - lr * gy; b.x += b.vx; b.y += b.vy; } else { b.x -= lr * gx; b.y -= lr * gy; }
      b.trail.push([cx + b.x * sx * 0.6, cy + b.y * sy * 0.6]);
      if (b.trail.length > 140) b.trail.shift();
      ctx.strokeStyle = rgba(b.color, 0.65); ctx.lineWidth = 2;
      ctx.beginPath(); b.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const [x, y] = b.trail.at(-1);
      ctx.fillStyle = rgba(b.color, 0.95); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      if (Math.hypot(gx, gy) < 0.02 && Math.hypot(b.vx, b.vy) < 0.002) { b.x = (r() - 0.5) * 3; b.y = (r() - 0.5) * 2; b.vx = 0; b.vy = 0; b.trail = []; }
    }
    ctx.fillStyle = rgba(colors.text, 0.5); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }

  draw_attention(ctx, w, h, dt, colors) {
    const { s } = this;
    s.phase += dt * 0.6;
    if (s.phase > 1) { s.phase = 0; s.query = (s.query + 1) % s.tokens.length; }
    const y = h * 0.72;
    const q = s.tokens[s.query];
    s.tokens.forEach((tok, i) => {
      if (i === s.query) return;
      const weight = tok.weights[s.query] ** 2;
      const mid = (tok.x + q.x) / 2;
      const lift = Math.abs(tok.x - q.x) * 0.55;
      ctx.strokeStyle = rgba(PALETTE[i % PALETTE.length], 0.15 + weight * 0.75 * Math.sin(Math.PI * s.phase));
      ctx.lineWidth = 1 + weight * 7;
      ctx.beginPath(); ctx.moveTo(q.x, y - 14); ctx.quadraticCurveTo(mid, y - 14 - lift, tok.x, y - 14); ctx.stroke();
    });
    s.tokens.forEach((tok, i) => {
      ctx.fillStyle = rgba(i === s.query ? colors.accent : colors.text, i === s.query ? 0.85 : 0.18);
      roundRect(ctx, tok.x - 26, y - 14, 52, 28, 7); ctx.fill();
      ctx.fillStyle = rgba(i === s.query ? '#ffffff' : colors.text, 0.75); ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(['The', 'cat', 'sat', 'on', 'the', 'mat', 'and', 'slept', '.'][i], tok.x, y);
    });
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(colors.text, 0.3); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_convolution(ctx, w, h, dt, colors) {
    const { s } = this;
    s.pos = (s.pos + dt * 6) % 100;
    const n = 12; const out = 10;
    const cell = Math.min(w * 0.36 / n, h * 0.6 / n);
    const ox = w * 0.16; const oy = (h - n * cell) / 2;
    const px = w * 0.6; const py = (h - out * cell) / 2;
    const step = Math.floor(s.pos);
    const kr = Math.floor(step / out); const kc = step % out;
    for (let i = 0; i < n * n; i++) {
      ctx.fillStyle = rgba(colors.accent, 0.05 + s.cells[i] * 0.3);
      ctx.fillRect(ox + (i % n) * cell + 1, oy + Math.floor(i / n) * cell + 1, cell - 2, cell - 2);
    }
    for (let i = 0; i < out * out; i++) {
      const r = Math.floor(i / out); const c = i % out;
      const done = r < kr || (r === kr && c <= kc);
      let v = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) v += s.cells[(r + a) * n + c + b];
      ctx.fillStyle = done ? rgba('#f28e2b', 0.1 + (v / 9) * 0.6) : rgba(colors.text, 0.04);
      ctx.fillRect(px + c * cell + 1, py + r * cell + 1, cell - 2, cell - 2);
    }
    if (kr < out) {
      ctx.strokeStyle = rgba('#edc948', 0.95); ctx.lineWidth = 2.5;
      ctx.strokeRect(ox + kc * cell, oy + kr * cell, cell * 3, cell * 3);
      ctx.strokeStyle = rgba('#edc948', 0.4); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ox + (kc + 3) * cell, oy + (kr + 1.5) * cell); ctx.lineTo(px + (kc + 0.5) * cell, py + (kr + 0.5) * cell); ctx.stroke();
      ctx.strokeStyle = rgba('#edc948', 0.95); ctx.lineWidth = 2;
      ctx.strokeRect(px + kc * cell, py + kr * cell, cell, cell);
    }
  }

  draw_embedding(ctx, w, h, dt, colors) {
    const { s, r } = this;
    s.phase += dt * 0.12;
    const gather = (s.phase % 1) < 0.75;
    if (s.phase % 1 < 0.01) s.centers.forEach((c) => { c.x = w * (0.2 + r() * 0.6); c.y = h * (0.2 + r() * 0.6); });
    for (const p of s.points) {
      const c = s.centers[p.c];
      const tx = gather ? c.x + Math.cos(p.x * 0.05 + p.c) * 30 : p.x + (r() - 0.5) * 6;
      const ty = gather ? c.y + Math.sin(p.y * 0.05 + p.c) * 30 : p.y + (r() - 0.5) * 6;
      p.vx = 0.92 * p.vx + (tx - p.x) * 0.004;
      p.vy = 0.92 * p.vy + (ty - p.y) * 0.004;
      if (!gather) { p.vx += (r() - 0.5) * 1.2; p.vy += (r() - 0.5) * 1.2; }
      p.x = Math.max(0, Math.min(w, p.x + p.vx));
      p.y = Math.max(0, Math.min(h, p.y + p.vy));
      ctx.fillStyle = rgba(PALETTE[p.c], 0.7);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = rgba(colors.text, 0.3); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_clusters(ctx, w, h, dt, colors) {
    const { s, r } = this;
    s.phase += dt;
    if (s.phase > 1.2) {
      s.phase = 0;
      s.iter = (s.iter ?? 0) + 1;
      if (s.iter > 8) { s.iter = 0; s.cent.forEach((c) => { c.x = r() * w; c.y = r() * h; }); }
      for (const p of s.points) {
        let best = 0;
        s.cent.forEach((c, k) => { if (Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(p.x - s.cent[best].x, p.y - s.cent[best].y)) best = k; });
        p.c = best;
      }
      s.cent.forEach((c, k) => {
        const mine = s.points.filter((p) => p.c === k);
        if (mine.length) { c.tx = mine.reduce((a, p) => a + p.x, 0) / mine.length; c.ty = mine.reduce((a, p) => a + p.y, 0) / mine.length; }
      });
    }
    if (!s.placed) {
      s.placed = true;
      s.points.forEach((p, i) => { const c = s.centers[i % s.centers.length]; p.x = c.x + r.normal() * w * 0.06; p.y = c.y + r.normal() * h * 0.08; });
    }
    for (const c of s.cent) { if (c.tx != null) { c.x += (c.tx - c.x) * 0.08; c.y += (c.ty - c.y) * 0.08; } }
    for (const p of s.points) {
      const c = s.cent[p.c];
      ctx.strokeStyle = rgba(PALETTE[p.c], 0.08); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.fillStyle = rgba(PALETTE[p.c], 0.75); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    s.cent.forEach((c, k) => {
      ctx.strokeStyle = rgba(PALETTE[k], 1); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(c.x - 9, c.y - 9); ctx.lineTo(c.x + 9, c.y + 9); ctx.moveTo(c.x + 9, c.y - 9); ctx.lineTo(c.x - 9, c.y + 9); ctx.stroke();
    });
    ctx.lineWidth = 1;
    void colors;
  }

  draw_tensors(ctx, w, h, dt, colors) {
    for (const c of this.s.cubes) {
      c.y -= c.speed * dt;
      if (c.y < -c.size * 3) { c.y = h + c.size * 2; c.x = this.r() * w; }
      for (let d = 0; d < c.depth; d++) iso(ctx, c.x + d * c.size * 0.35, c.y - d * c.size * 0.35, c.size, PALETTE[c.hue], 0.12 + d * 0.06);
    }
    void colors;
  }

  draw_activation(ctx, w, h, dt, colors) {
    const { s } = this;
    s.phase += dt * 0.25;
    const fns = [['ReLU', (x) => Math.max(0, x)], ['sigmoid', (x) => 2 / (1 + Math.exp(-x * 1.5)) - 1], ['tanh', (x) => Math.tanh(x)], ['GELU', (x) => 0.5 * x * (1 + Math.tanh(0.8 * (x + 0.044 * x ** 3)))], ['swish', (x) => x / (1 + Math.exp(-x))]];
    const i = Math.floor(s.phase) % fns.length;
    const j = (i + 1) % fns.length;
    const f = s.phase % 1;
    const mix = f < 0.7 ? 0 : (f - 0.7) / 0.3;
    const cx = w / 2; const cy = h * 0.55; const scale = Math.min(w, h) / 7;
    ctx.strokeStyle = rgba(colors.text, 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - scale * 3.4, cy); ctx.lineTo(cx + scale * 3.4, cy); ctx.moveTo(cx, cy - scale * 2.4); ctx.lineTo(cx, cy + scale * 2.4); ctx.stroke();
    ctx.strokeStyle = rgba(colors.accent, 0.85); ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let x = -3.2; x <= 3.2; x += 0.05) {
      const y = fns[i][1](x) * (1 - mix) + fns[j][1](x) * mix;
      const px = cx + x * scale; const py = cy - y * scale;
      if (x === -3.2) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const dot = Math.sin(this.time * 1.3) * 3;
    const dy = fns[i][1](dot) * (1 - mix) + fns[j][1](dot) * mix;
    ctx.fillStyle = rgba('#f28e2b', 0.95); ctx.beginPath(); ctx.arc(cx + dot * scale, cy - dy * scale, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(colors.text, 0.4); ctx.font = '600 18px system-ui'; ctx.textAlign = 'center';
  }

  draw_decision(ctx, w, h, dt, colors) {
    const { s } = this;
    const learn = (Math.sin(this.time * 0.4) + 1) / 2;
    const boundary = (x) => (0.45 * Math.sin(3 * x) + 0.2 * x) * learn + (1 - learn) * (0.6 * x - 0.1);
    const px = (x) => w * 0.1 + ((x + 1) / 2) * w * 0.8;
    const py = (y) => h * 0.1 + ((1 - y) / 2) * h * 0.8;
    ctx.fillStyle = rgba(PALETTE[1], 0.07);
    ctx.beginPath(); ctx.moveTo(px(-1), py(1));
    for (let x = -1; x <= 1.001; x += 0.02) ctx.lineTo(px(x), py(boundary(x)));
    ctx.lineTo(px(1), py(1)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(colors.text, 0.5); ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = -1; x <= 1.001; x += 0.02) (x === -1 ? ctx.moveTo(px(x), py(boundary(x))) : ctx.lineTo(px(x), py(boundary(x))));
    ctx.stroke();
    for (const p of s.points) {
      const right = (p.y > boundary(p.x) ? 1 : 0) === p.c;
      ctx.fillStyle = rgba(PALETTE[p.c ? 1 : 0], right ? 0.85 : 0.4);
      ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2); ctx.fill();
      if (!right) { ctx.strokeStyle = rgba('#e15759', 0.8); ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  draw_loss(ctx, w, h, dt, colors) {
    const { s } = this;
    s.t += dt * 0.25;
    if (s.t > 2.6) s.t = 0;
    const box = { x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.72 };
    ctx.strokeStyle = rgba(colors.text, 0.1); ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) { const y = box.y + (box.h * i) / 5; ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); }
    for (const c of s.curves) {
      const progress = Math.max(0, Math.min(1, s.t - c.delay / 3));
      ctx.strokeStyle = rgba(c.color, 0.8); ctx.lineWidth = 2.5;
      ctx.beginPath();
      const steps = Math.floor(progress * 199);
      for (let i = 0; i <= steps; i++) {
        const x = i / 199;
        const y = c.floor + (1 - c.floor) * Math.exp(-c.decay * x * 3) + c.noise[i] * (1 - x * 0.5);
        const px = box.x + x * box.w; const py = box.y + (1 - Math.min(1, Math.max(0, y))) * box.h;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 13px system-ui'; ctx.textAlign = 'left';
  }

  draw_tokens(ctx, w, h, dt, colors) {
    const { s } = this;
    const bx = w * 0.42; const bw = w * 0.16;
    ctx.fillStyle = rgba(colors.accent, 0.12); roundRect(ctx, bx, h * 0.25, bw, h * 0.5, 16); ctx.fill();
    ctx.strokeStyle = rgba(colors.accent, 0.5); ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = rgba(colors.accent, 0.12 + 0.08 * Math.sin(this.time * 2 + i)); roundRect(ctx, bx + 12, h * 0.29 + i * h * 0.11, bw - 24, h * 0.08, 6); ctx.fill(); }
    ctx.fillStyle = rgba(colors.text, 0.5); ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
    for (const tok of s.flow) {
      tok.x += dt * 70;
      if (tok.x > bx - 30 && !tok.out) { tok.out = true; tok.x = bx + bw + 10; tok.word = s.words[(s.words.indexOf(tok.word) + 3) % s.words.length]; }
      if (tok.x > w + 60) { tok.x = -60; tok.out = false; }
      ctx.fillStyle = rgba(tok.out ? '#f28e2b' : colors.text, tok.out ? 0.75 : 0.25);
      roundRect(ctx, tok.x - 28, tok.y - 12, 56, 24, 6); ctx.fill();
      ctx.fillStyle = rgba(tok.out ? '#ffffff' : colors.text, 0.85); ctx.font = '12px system-ui'; ctx.textBaseline = 'middle'; ctx.fillText(tok.word, tok.x, tok.y);
    }
    ctx.textBaseline = 'alphabetic';
  }

  draw_diffusion(ctx, w, h, dt, colors) {
    const { s, r } = this;
    s.phase += dt * 0.18;
    if (s.phase > 1.3) { s.phase = 0; s.noise = s.targets.map(() => ({ x: r() * w, y: r() * h })); }
    const k = Math.min(1, s.phase);
    const ease = k * k * (3 - 2 * k);
    s.targets.forEach((t, i) => {
      const n = s.noise[i];
      const jitter = (1 - ease) * 6;
      const x = n.x + (t.x - n.x) * ease + (r() - 0.5) * jitter;
      const y = n.y + (t.y - n.y) * ease + (r() - 0.5) * jitter;
      ctx.fillStyle = rgba(ease > 0.95 ? '#e15759' : colors.accent, 0.35 + ease * 0.5);
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_tree(ctx, w, h, dt, colors) {
    const { s } = this;
    s.phase += dt * 0.22;
    if (s.phase > 1.4) { s.phase = 0; s.seed += 1; }
    const r = rand(s.seed);
    const grow = Math.min(1, s.phase) * 5;
    const branch = (x, y, spread, depth) => {
      if (depth > 4 || depth > grow) return;
      const local = Math.min(1, grow - depth);
      ctx.fillStyle = rgba(depth === 4 ? PALETTE[Math.floor(r() * 4)] : colors.accent, depth === 4 ? 0.8 : 0.5);
      ctx.beginPath(); ctx.arc(x, y, depth === 4 ? 7 : 6, 0, Math.PI * 2); ctx.fill();
      if (depth === 4) return;
      const ny = y + h * 0.17;
      for (const side of [-1, 1]) {
        const nx = x + side * spread;
        ctx.strokeStyle = rgba(colors.text, 0.25); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (nx - x) * local, y + (ny - y) * local); ctx.stroke();
        if (r() < 0.85 || depth < 2) branch(nx, ny, spread / 2, depth + 1); else r();
      }
    };
    branch(w / 2, h * 0.12, w * 0.22, 0);
  }

  draw_brain(ctx, w, h, dt, colors) {
    const { s, r } = this;
    if (r() < dt * 3) { const i = Math.floor(r() * s.nodes.length); s.nodes[i].fire = 1; }
    for (const [a, b, bend] of s.links) {
      const p = s.nodes[a]; const q = s.nodes[b];
      ctx.strokeStyle = rgba(colors.accent, 0.08 + Math.max(p.fire, q.fire) * 0.4); ctx.lineWidth = 1.2;
      const mx = (p.x + q.x) / 2 + (q.y - p.y) * bend; const my = (p.y + q.y) / 2 - (q.x - p.x) * bend;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, q.x, q.y); ctx.stroke();
      if (p.fire > 0.95 && r() < 0.7) s.spikes.push({ a, b, t: 0, bend });
      if (q.fire > 0.95 && r() < 0.7) s.spikes.push({ a: b, b: a, t: 0, bend: -bend });
    }
    for (const sp of s.spikes) {
      sp.t += dt * 1.8;
      const p = s.nodes[sp.a]; const q = s.nodes[sp.b];
      const mx = (p.x + q.x) / 2 + (q.y - p.y) * sp.bend; const my = (p.y + q.y) / 2 - (q.x - p.x) * sp.bend;
      const t = Math.min(1, sp.t);
      const x = (1 - t) ** 2 * p.x + 2 * (1 - t) * t * mx + t * t * q.x;
      const y = (1 - t) ** 2 * p.y + 2 * (1 - t) * t * my + t * t * q.y;
      ctx.fillStyle = rgba('#edc948', 0.9); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      if (sp.t >= 1 && q.fire < 0.3) q.fire = 0.9;
    }
    s.spikes = s.spikes.filter((sp) => sp.t < 1).slice(-120);
    for (const n of s.nodes) {
      n.fire = Math.max(0, n.fire - dt * 1.2);
      ctx.fillStyle = rgba(n.fire > 0.1 ? '#edc948' : colors.accent, 0.3 + n.fire * 0.6);
      ctx.beginPath(); ctx.arc(n.x, n.y, 4 + n.fire * 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  draw_weights(ctx, w, h, dt, colors) {
    const { s } = this;
    const cell = Math.min((w * 0.8) / s.colsN, (h * 0.75) / s.rows);
    const ox = (w - cell * s.colsN) / 2; const oy = (h - cell * s.rows) / 2;
    for (let i = 0; i < s.rows * s.colsN; i++) {
      const v = Math.sin(this.time * s.freq[i] + s.phase[i]) * Math.cos(this.time * 0.3 + i * 0.01);
      ctx.fillStyle = rgba(v < 0 ? '#3170d6' : '#de463c', Math.abs(v) * 0.55);
      ctx.fillRect(ox + (i % s.colsN) * cell + 1, oy + Math.floor(i / s.colsN) * cell + 1, cell - 2, cell - 2);
    }
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_latent(ctx, w, h, dt, colors) {
    const { s } = this;
    const n = 7;
    const size = Math.min(w / (n + 1), h / 3);
    const t = this.time * 0.25;
    for (let k = 0; k < n; k++) {
      const pos = (t + k / n) % s.shapes.length;
      const a = s.shapes[Math.floor(pos) % s.shapes.length];
      const b = s.shapes[(Math.floor(pos) + 1) % s.shapes.length];
      const f = pos % 1;
      const cx = (w * (k + 1)) / (n + 1); const cy = h / 2 + Math.sin(t * 2 + k) * h * 0.06;
      ctx.fillStyle = rgba(PALETTE[k % PALETTE.length], 0.35);
      ctx.strokeStyle = rgba(PALETTE[k % PALETTE.length], 0.8); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const idx = (i / 64) * 8;
        const i0 = Math.floor(idx) % 8; const i1 = (i0 + 1) % 8; const g = idx % 1;
        const radius = ((a[i0] * (1 - g) + a[i1] * g) * (1 - f) + (b[i0] * (1 - g) + b[i1] * g) * f) * size * 0.4;
        const x = cx + Math.cos(angle) * radius; const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = rgba(colors.text, 0.15); ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(w * 0.08, h / 2); ctx.lineTo(w * 0.92, h / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(colors.text, 0.35); ctx.font = '600 14px system-ui'; ctx.textAlign = 'center';
  }

  draw_recurrent(ctx, w, h, dt, colors) {
    const { s } = this;
    s.offset += dt * 40;
    const gap = 120;
    const shift = s.offset % gap;
    const y = h / 2;
    for (let i = -1; i < w / gap + 2; i++) {
      const x = i * gap - shift + 40;
      const index = Math.floor(s.offset / gap) + i;
      const v = s.values[((index % 40) + 40) % 40];
      ctx.fillStyle = rgba(colors.accent, 0.12 + v * 0.3); roundRect(ctx, x, y - 28, 64, 56, 12); ctx.fill();
      ctx.strokeStyle = rgba(colors.accent, 0.6); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = rgba(colors.text, 0.6); ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = rgba(colors.text, 0.3); ctx.lineWidth = 2;
      arrow(ctx, x + 64, y, x + gap, y);
      arrow(ctx, x + 32, y + 70, x + 32, y + 30);
      arrow(ctx, x + 32, y - 30, x + 32, y - 70);
      ctx.fillStyle = rgba(PALETTE[index % 4 < 0 ? 0 : index % 4], 0.7); ctx.beginPath(); ctx.arc(x + 32, y + 82, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba('#f28e2b', 0.25 + v * 0.6); ctx.beginPath(); ctx.arc(x + 32, y - 82, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textBaseline = 'alphabetic';
  }

  draw_gan(ctx, w, h, dt, colors) {
    const { s } = this;
    const target = { mu: 0.8, sigma: 0.7 };
    s.mu += (target.mu - s.mu) * dt * 0.25 + Math.sin(this.time * 1.7) * dt * 0.08;
    s.sigma += (target.sigma - s.sigma) * dt * 0.25;
    if (Math.abs(s.mu - target.mu) < 0.02 && Math.abs(s.sigma - target.sigma) < 0.02) { s.mu = -2 + Math.random(); s.sigma = 1.5; }
    const box = { x: w * 0.08, y: h * 0.18, w: w * 0.84, h: h * 0.62 };
    const curve = (mu, sigma, color, label) => {
      ctx.fillStyle = rgba(color, 0.18); ctx.strokeStyle = rgba(color, 0.85); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(box.x, box.y + box.h);
      for (let i = 0; i <= 200; i++) {
        const x = -4 + (8 * i) / 200;
        const y = Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * 2.5);
        ctx.lineTo(box.x + (i / 200) * box.w, box.y + box.h - Math.min(1, y * 1.6) * box.h);
      }
      ctx.lineTo(box.x + box.w, box.y + box.h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(color, 0.9); ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
    };
    curve(target.mu, target.sigma, PALETTE[2], 'real');
    curve(s.mu, s.sigma, PALETTE[1], 'G(z)');
    ctx.strokeStyle = rgba(colors.text, 0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(box.x, box.y + box.h); ctx.lineTo(box.x + box.w, box.y + box.h); ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrow(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4)); ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle; ctx.fill();
}

function iso(ctx, x, y, size, color, alpha) {
  const s = size; const k = s * 0.5;
  ctx.fillStyle = rgba(color, alpha + 0.12);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y - k); ctx.lineTo(x + 2 * s, y); ctx.lineTo(x + s, y + k); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + k); ctx.lineTo(x + s, y + k + s); ctx.lineTo(x, y + s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba(color, alpha + 0.06);
  ctx.beginPath(); ctx.moveTo(x + s, y + k); ctx.lineTo(x + 2 * s, y); ctx.lineTo(x + 2 * s, y + s); ctx.lineTo(x + s, y + k + s); ctx.closePath(); ctx.fill();
}
