// Moving backgrounds for the start page, on the theme of simulation: an
// oscilloscope, a spectrum analyser, the Lorenz attractor, a neural network,
// a Monte Carlo estimate of π, a pipeline with flowing data, a filling
// histogram, phase portraits, an optimiser descending a valley, springs, and
// fields (contours, convection, heat map, streamlines, waves, aurora,
// particles, a circuit, diffusion, a vortex). Colours follow the theme (and
// the turbo colour map). 30 frames a second, paused while the window is
// hidden; `frames` counts drawn frames (tests).
import { ANIMATIONS } from '../core/settings.js';
import { colorAt } from '../core/colormap.js';

export const ANIMATION_KINDS = ANIMATIONS;

export const ANIMATION_ICONS = {
  oscilloscope: '∿', spectrum: '▥', lorenz: '∞', network: '🧠', montecarlo: '🎲', pipeline: '⛓', histogram: '▆', phase: '🌀', descent: '⥥', spring: '⌇',
  isotherms: '〰', convection: '⟳', heatmap: '▦', streamlines: '🌊', waves: '≈', aurora: '✦', particles: '∴', circuit: '▣', diffusion: '◎', vortex: '꩜',
};

const FRAME_MS = 1000 / 30;

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
}

const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, a))})`;
const heat = (t, a) => rgba(colorAt('turbo', t), a);

export class AnimatedBackground {
  /** colors(): { bg, accent, text, dark }; speed(): factor (1 = normal). */
  constructor(canvas, { colors, speed = () => 1, kind = 'oscilloscope' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3ec1ff', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'oscilloscope';
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.wanted = false;
    this.last = 0;
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.seed();
  }

  setKind(kind) {
    if (!ANIMATION_KINDS.includes(kind) || kind === this.kind) return;
    this.kind = kind;
    this.seed();
  }

  shuffle(rand = Math.random) {
    const others = ANIMATION_KINDS.filter((k) => k !== this.kind);
    const next = others[Math.floor(rand() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seed();
  }

  /** Items of the current kind, placed with a fixed seed so a kind always starts the same way. */
  seed() {
    const r = random(this.kind.length * 7919 + 11);
    const n = { particles: 110, streamlines: 70, circuit: 26, diffusion: 7 }[this.kind] ?? 0;
    this.trail = null;
    this.mc = null;
    this.hist = null;
    this.items = Array.from({ length: n }, () => ({ x: r() * (this.w || 1000), y: r() * (this.h || 700), a: r(), b: r(), c: r() }));
    if (this.kind === 'circuit') this.buildCircuit(r);
  }

  buildCircuit(r) {
    const step = 48;
    this.traces = [];
    for (let i = 0; i < 34; i++) {
      let x = Math.round((r() * this.w) / step) * step;
      let y = Math.round((r() * this.h) / step) * step;
      const points = [[x, y]];
      for (let k = 0; k < 5; k++) {
        if (r() < 0.5) x += (r() < 0.5 ? -1 : 1) * step * (1 + Math.floor(r() * 3));
        else y += (r() < 0.5 ? -1 : 1) * step * (1 + Math.floor(r() * 3));
        points.push([x, y]);
      }
      this.traces.push({ points, phase: r(), speed: 0.2 + r() * 0.5 });
    }
    this.chips = Array.from({ length: 7 }, () => ({ x: r() * this.w, y: r() * this.h, w: 50 + r() * 70, h: 40 + r() * 50, p: r() }));
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
    if (now - this.last >= FRAME_MS) {
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed();
      this.last = now;
      this.time += dt;
      this.draw(dt);
    }
    requestAnimationFrame(this.loop);
  }

  draw(dt = 1 / 30) {
    const { ctx, w, h } = this;
    const c = this.colors();
    const accent = hexToRgb(c.accent);
    const text = hexToRgb(c.text);
    const bg = hexToRgb(c.bg);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = rgba(bg, 1);
    ctx.fillRect(0, 0, w, h);
    const strength = c.dark ? 1 : 0.75;
    this[this.kind]?.(ctx, w, h, dt, { accent, text, bg, strength, dark: c.dark });
    this.frames += 1;
  }

  // ── the backgrounds

  oscilloscope(ctx, w, h, dt, o) {
    // Three traces on a scope grid: a sine, a damped burst and a noisy square wave sweeping across.
    const t = this.time;
    ctx.strokeStyle = rgba(o.text, 0.08 * o.strength);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 60) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += 60) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    const traces = [
      (x) => Math.sin(x * 0.012 - t * 2.2),
      (x) => Math.exp(-((x * 0.004 - t * 0.6) % 4 + 4) % 4) * Math.sin(x * 0.05 - t * 6),
      (x) => (Math.sin(x * 0.006 - t * 1.4) > 0 ? 0.7 : -0.7) + Math.sin(x * 0.9 + t * 30) * 0.06,
    ];
    traces.forEach((f, i) => {
      ctx.strokeStyle = heat(0.25 + i * 0.3, 0.6 * o.strength);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = h * (0.28 + i * 0.24) + f(x) * h * 0.08;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  spectrum(ctx, w, h, dt, o) {
    // An FFT analyser: bars with peaks that wander and fall back.
    const t = this.time;
    const n = Math.max(24, Math.floor(w / 22));
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const v = 0.12 + 0.55 * Math.exp(-(((f - 0.2 - 0.08 * Math.sin(t * 0.7)) * 9) ** 2)) + 0.35 * Math.exp(-(((f - 0.6 - 0.1 * Math.sin(t * 0.5 + 1)) * 14) ** 2)) + 0.12 * Math.abs(Math.sin(i * 1.7 + t * 3));
      const bh = Math.min(0.92, v) * h * 0.75;
      ctx.fillStyle = heat(0.15 + 0.8 * Math.min(1, v), 0.45 * o.strength);
      ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
      ctx.fillStyle = rgba(o.text, 0.35 * o.strength);
      ctx.fillRect(i * bw + 2, h - bh - 8, bw - 4, 2);
    }
  }

  lorenz(ctx, w, h, dt, o) {
    // The Lorenz attractor traced a little further every frame.
    if (!this.trail) this.trail = { p: [1, 1, 1], pts: [] };
    const tr = this.trail;
    for (let k = 0; k < Math.max(1, Math.round(dt * 600)); k++) {
      const [x, y, z] = tr.p;
      const h2 = 0.005;
      tr.p = [x + h2 * 10 * (y - x), y + h2 * (x * (28 - z) - y), z + h2 * (x * y - (8 / 3) * z)];
      tr.pts.push(tr.p);
    }
    if (tr.pts.length > 4000) tr.pts.splice(0, tr.pts.length - 4000);
    const s = Math.min(w, h) / 60;
    const a = this.time * 0.15;
    ctx.lineWidth = 1.3;
    for (let i = 1; i < tr.pts.length; i += 1) {
      const [x0, y0, z0] = tr.pts[i - 1];
      const [x1, y1, z1] = tr.pts[i];
      const X = (px, py) => w / 2 + (px * Math.cos(a) - py * Math.sin(a)) * s;
      ctx.strokeStyle = heat(i / tr.pts.length, (0.15 + 0.5 * (i / tr.pts.length)) * o.strength);
      ctx.beginPath();
      ctx.moveTo(X(x0, y0), h * 0.92 - z0 * s * 0.9);
      ctx.lineTo(X(x1, y1), h * 0.92 - z1 * s * 0.9);
      ctx.stroke();
    }
  }

  network(ctx, w, h, dt, o) {
    // A neural network: layers of neurons with signals travelling along the weights.
    const t = this.time;
    const layers = [5, 8, 8, 6, 3];
    const pos = layers.map((n, l) => Array.from({ length: n }, (_, k) => [w * (0.12 + (0.76 * l) / (layers.length - 1)), h * (0.5 + (k - (n - 1) / 2) * Math.min(0.11, 0.8 / n))]));
    for (let l = 0; l + 1 < layers.length; l++) {
      for (const [ax, ay] of pos[l]) for (const [bx, by] of pos[l + 1]) {
        const phase = (t * 0.6 + ax * 0.001 + ay * 0.003 + by * 0.002) % 1;
        ctx.strokeStyle = rgba(o.accent, 0.08 * o.strength);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = heat(0.3 + 0.6 * phase, 0.5 * o.strength);
        ctx.beginPath(); ctx.arc(ax + (bx - ax) * phase, ay + (by - ay) * phase, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    pos.forEach((layer, l) => layer.forEach(([x, y], k) => {
      const act = 0.5 + 0.5 * Math.sin(t * 1.5 + l * 1.3 + k * 0.9);
      ctx.fillStyle = heat(act, (0.35 + 0.4 * act) * o.strength);
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(o.text, 0.3 * o.strength);
      ctx.stroke();
    }));
  }

  montecarlo(ctx, w, h, dt, o) {
    // Estimating π: random points in a square, those inside the quarter circle in colour.
    if (!this.mc || this.mc.w !== w || this.mc.pts.length > 3500) this.mc = { w, pts: [], inside: 0, r: random(7) };
    const m = this.mc;
    const side = Math.min(w, h) * 0.8;
    const x0 = (w - side) / 2;
    const y0 = (h - side) / 2;
    for (let k = 0; k < Math.max(1, Math.round(dt * 300)); k++) {
      const u = m.r(); const v = m.r();
      const inside = u * u + v * v <= 1;
      m.inside += inside ? 1 : 0;
      m.pts.push([u, v, inside]);
    }
    ctx.strokeStyle = rgba(o.text, 0.25 * o.strength);
    ctx.strokeRect(x0, y0, side, side);
    ctx.beginPath(); ctx.arc(x0, y0 + side, side, -Math.PI / 2, 0); ctx.stroke();
    for (const [u, v, inside] of m.pts) {
      ctx.fillStyle = inside ? heat(0.2 + 0.5 * v, 0.55 * o.strength) : rgba(o.text, 0.2 * o.strength);
      ctx.fillRect(x0 + u * side - 1, y0 + side - v * side - 1, 2.4, 2.4);
    }
    ctx.fillStyle = rgba(o.text, 0.5 * o.strength);
    ctx.font = '600 22px "Segoe UI", sans-serif';
    ctx.fillText(`π ≈ ${((4 * m.inside) / m.pts.length).toFixed(4)}`, x0 + side * 0.62, y0 + 34);
  }

  pipeline(ctx, w, h, dt, o) {
    // Boxes joined by curves, data packets flowing from left to right.
    const t = this.time;
    const cols = 5;
    const boxes = [];
    for (let c = 0; c < cols; c++) {
      const n = c === 0 || c === cols - 1 ? 2 : 3;
      for (let k = 0; k < n; k++) boxes.push({ c, x: w * (0.08 + (0.84 * c) / (cols - 1)), y: h * (0.5 + (k - (n - 1) / 2) * 0.24) });
    }
    ctx.lineWidth = 2;
    for (const a of boxes) for (const b of boxes) {
      if (b.c !== a.c + 1) continue;
      ctx.strokeStyle = rgba(o.accent, 0.16 * o.strength);
      const mx = (a.x + b.x) / 2;
      ctx.beginPath(); ctx.moveTo(a.x + 50, a.y); ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x - 50, b.y); ctx.stroke();
      const f = (t * 0.35 + a.y * 0.002 + b.y * 0.001) % 1;
      const u = 1 - f;
      const px = u * u * u * (a.x + 50) + 3 * u * u * f * mx + 3 * u * f * f * mx + f * f * f * (b.x - 50);
      const py = u * u * u * a.y + 3 * u * u * f * a.y + 3 * u * f * f * b.y + f * f * f * b.y;
      ctx.fillStyle = heat(0.2 + 0.7 * f, 0.7 * o.strength);
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of boxes) {
      ctx.fillStyle = heat(0.15 + (0.75 * b.c) / (cols - 1), 0.22 * o.strength);
      ctx.strokeStyle = heat(0.15 + (0.75 * b.c) / (cols - 1), 0.5 * o.strength);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x - 50, b.y - 22, 100, 44, 8); else ctx.rect(b.x - 50, b.y - 22, 100, 44);
      ctx.fill(); ctx.stroke();
    }
  }

  histogram(ctx, w, h, dt, o) {
    // A histogram of normal samples filling up into the bell curve.
    if (!this.hist || this.hist.n > 6000) this.hist = { bins: new Array(41).fill(0), n: 0, r: random(3) };
    const g = this.hist;
    for (let k = 0; k < Math.max(1, Math.round(dt * 400)); k++) {
      const z = Math.sqrt(-2 * Math.log(g.r() || 1e-9)) * Math.cos(2 * Math.PI * g.r());
      const b = Math.round(20 + z * 6);
      if (b >= 0 && b < 41) g.bins[b]++;
      g.n++;
    }
    const max = Math.max(...g.bins, 1);
    const bw = (w * 0.8) / 41;
    g.bins.forEach((v, i) => {
      const bh = (v / max) * h * 0.65;
      ctx.fillStyle = heat(0.2 + 0.6 * (v / max), 0.4 * o.strength);
      ctx.fillRect(w * 0.1 + i * bw + 1, h * 0.85 - bh, bw - 2, bh);
    });
    ctx.strokeStyle = rgba(o.text, 0.4 * o.strength);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const z = (i / 200) * 41;
      const y = h * 0.85 - Math.exp(-(((z - 20.5) / 6) ** 2) / 2) * h * 0.65;
      if (i) ctx.lineTo(w * 0.1 + z * bw, y); else ctx.moveTo(w * 0.1 + z * bw, y);
    }
    ctx.stroke();
  }

  phase(ctx, w, h, dt, o) {
    // Phase portraits of damped oscillators spiralling into their equilibrium.
    const t = this.time;
    for (let k = 0; k < 7; k++) {
      const zeta = 0.05 + k * 0.03;
      const cx = w / 2; const cy = h / 2;
      const r0 = Math.min(w, h) * (0.12 + k * 0.05);
      ctx.strokeStyle = heat(0.15 + k * 0.12, 0.45 * o.strength);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 260; i++) {
        const s = i * 0.08;
        const a = r0 * Math.exp(-zeta * s);
        const x = cx + a * Math.cos(s + t * (0.4 + k * 0.05) + k);
        const y = cy + a * Math.sin(s + t * (0.4 + k * 0.05) + k) * 0.7;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }

  descent(ctx, w, h, dt, o) {
    // Contours of a valley and optimisers sliding down to its minimum.
    const t = this.time;
    const cx = w * 0.62; const cy = h * 0.55;
    for (let k = 1; k <= 12; k++) {
      ctx.strokeStyle = heat(1 - k / 13, 0.3 * o.strength);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, k * w * 0.045, k * h * 0.03, -0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let p = 0; p < 6; p++) {
      const ang = p * 1.05 + 0.3;
      const f = (t * 0.12 + p * 0.17) % 1;
      const r = (1 - f) ** 1.6;
      const x = cx + Math.cos(ang + f * 2) * r * w * 0.5;
      const y = cy + Math.sin(ang + f * 2) * r * h * 0.34;
      ctx.fillStyle = heat(0.9 - 0.6 * f, 0.75 * o.strength);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  spring(ctx, w, h, dt, o) {
    // A row of masses on springs, each at its own frequency and damping.
    const t = this.time;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = w * (0.1 + (0.8 * i) / (n - 1));
      const amp = h * 0.18 * Math.exp(-0.05 * ((t + i * 3) % 20));
      const y = h * 0.5 + amp * Math.cos((1 + i * 0.25) * t * 2);
      ctx.strokeStyle = rgba(o.text, 0.3 * o.strength);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.08);
      const coils = 14;
      for (let k = 1; k <= coils; k++) ctx.lineTo(x + (k % 2 ? 10 : -10), h * 0.08 + ((y - 20 - h * 0.08) * k) / coils);
      ctx.lineTo(x, y - 20);
      ctx.stroke();
      ctx.fillStyle = heat(0.2 + (0.6 * i) / n, 0.55 * o.strength);
      ctx.fillRect(x - 18, y - 20, 36, 36);
    }
  }

  isotherms(ctx, w, h, dt, o) {
    const t = this.time * 0.25;
    const field = (x, y) => Math.sin(x * 0.006 + t) + Math.cos(y * 0.008 - t * 0.7) + 0.6 * Math.sin((x + y) * 0.004 + t * 1.3);
    const step = 22;
    ctx.lineWidth = 1.4;
    for (let level = -2; level <= 2; level += 0.4) {
      ctx.strokeStyle = heat((level + 2.4) / 4.8, 0.55 * o.strength);
      ctx.beginPath();
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const a = field(x, y); const b = field(x + step, y); const c = field(x + step, y + step); const d = field(x, y + step);
          const pts = [];
          const edge = (va, vb, xa, ya, xb, yb) => { if ((va < level) !== (vb < level)) { const f = (level - va) / (vb - va); pts.push([xa + (xb - xa) * f, ya + (yb - ya) * f]); } };
          edge(a, b, x, y, x + step, y); edge(b, c, x + step, y, x + step, y + step); edge(c, d, x + step, y + step, x, y + step); edge(d, a, x, y + step, x, y);
          for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); }
        }
      }
      ctx.stroke();
    }
  }

  convection(ctx, w, h, dt, o) {
    // Rayleigh–Bénard rolls: hot at the bottom, cold at the top, arrows circulating.
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, heat(0.9, 0.35 * o.strength));
    grad.addColorStop(1, heat(0.1, 0.3 * o.strength));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const cell = Math.max(160, h / 2.2);
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell);
    const t = this.time * 0.6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * cell + cell / 2;
        const cy = r * cell + cell / 2;
        const dir = (c + r) % 2 ? 1 : -1;
        for (let k = 0; k < 10; k++) {
          const ang = dir * t + (k / 10) * Math.PI * 2;
          const rx = cell * 0.38;
          const ry = cell * 0.32;
          const x = cx + Math.cos(ang) * rx;
          const y = cy + Math.sin(ang) * ry;
          const temp = 0.5 + 0.45 * Math.sin(ang) * dir * (dir > 0 ? 1 : -1);
          ctx.fillStyle = heat(Math.max(0, Math.min(1, (y / h) * 0.9 + 0.05)), 0.75 * o.strength);
          ctx.beginPath();
          ctx.arc(x, y, 3 + 2 * temp, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = rgba(o.text, 0.08);
        ctx.beginPath();
        ctx.ellipse(cx, cy, cell * 0.38, cell * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  heatmap(ctx, w, h, dt, o) {
    // A coarse temperature field from a few moving hot spots, drawn as a soft colour map.
    const t = this.time * 0.35;
    const spots = [0, 1, 2, 3, 4].map((i) => [w * (0.5 + 0.38 * Math.sin(t * (0.6 + i * 0.13) + i * 2)), h * (0.5 + 0.38 * Math.cos(t * (0.5 + i * 0.11) + i))]);
    const step = 26;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        let v = 0;
        for (const [sx, sy] of spots) v += Math.exp(-(((x - sx) ** 2 + (y - sy) ** 2) / (2 * (w * 0.14) ** 2)));
        ctx.fillStyle = heat(Math.min(1, v * 0.85), 0.42 * o.strength);
        ctx.fillRect(x, y, step + 1, step + 1);
      }
    }
  }

  streamlines(ctx, w, h, dt, o) {
    // Potential flow round a cylinder: particles follow u = U(1 − R²cos2θ/r²), v = −U R² sin2θ / r².
    const cx = w * 0.42;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.12;
    ctx.strokeStyle = rgba(o.accent, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = heat(0.85, 0.35 * o.strength);
    ctx.fill();
    for (const p of this.items) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const r2 = dx * dx + dy * dy;
      const R2 = R * R;
      const u = 1 - (R2 * (dx * dx - dy * dy)) / (r2 * r2);
      const v = -(R2 * 2 * dx * dy) / (r2 * r2);
      p.x += u * 90 * dt;
      p.y += v * 90 * dt;
      if (p.x > w + 10 || r2 < R2 * 0.9 || Number.isNaN(p.x)) { p.x = -10; p.y = p.b * h; }
      const speed = Math.hypot(u, v);
      ctx.fillStyle = heat(Math.min(1, speed / 2), 0.7 * o.strength);
      ctx.fillRect(p.x, p.y, 10 * u + 2, 2);
    }
  }

  waves(ctx, w, h, dt, o) {
    const t = this.time;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = heat(0.15 + i * 0.15, 0.45 * o.strength);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.3 + i * 0.09) + Math.sin(x * 0.008 + t * (0.6 + i * 0.1) + i) * 30 + Math.sin(x * 0.02 - t) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  aurora(ctx, w, h, dt, o) {
    const t = this.time * 0.4;
    for (let i = 0; i < 4; i++) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, heat(0.1 + i * 0.25, 0));
      g.addColorStop(0.5, heat(0.1 + i * 0.25, 0.28 * o.strength));
      g.addColorStop(1, heat(0.1 + i * 0.25, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * (0.35 + 0.1 * i) + Math.sin(x * 0.004 + t + i * 1.7) * h * 0.12);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  particles(ctx, w, h, dt, o) {
    const t = this.time;
    for (const p of this.items) {
      p.x += Math.cos(p.a * 6.28 + t * 0.2) * 12 * dt;
      p.y += Math.sin(p.a * 6.28 + t * 0.2) * 12 * dt;
      if (p.x < 0) p.x += w; if (p.x > w) p.x -= w; if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;
      ctx.fillStyle = rgba(o.accent, (0.25 + 0.5 * p.c) * o.strength);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5 + 2.5 * p.b, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(o.accent, 0.12 * o.strength);
    ctx.beginPath();
    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        const a = this.items[i]; const b = this.items[j];
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 9000) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }
    }
    ctx.stroke();
  }

  diffusion(ctx, w, h, dt, o) {
    // Heat diffusing from pulsing hot spots: rings that widen and fade (the Gaussian of conduction).
    const t = this.time;
    this.items.forEach((p) => {
      const period = 4 + p.a * 3;
      const age = ((t + p.b * period) % period) / period;
      const x = p.x;
      const y = p.y;
      const r = 20 + age * Math.min(w, h) * 0.35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, heat(1 - age * 0.7, 0.55 * (1 - age) * o.strength));
      g.addColorStop(1, heat(0.2, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = heat(0.8 - age * 0.5, 0.35 * (1 - age));
      ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.stroke();
    });
  }

  vortex(ctx, w, h, dt, o) {
    // A von Kármán vortex street behind a cylinder: alternating eddies drifting downstream.
    const t = this.time;
    const cx = w * 0.15;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.07;
    ctx.fillStyle = heat(0.85, 0.45 * o.strength);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    const spacing = R * 4.5;
    const shift = (t * 50) % (spacing * 2);
    for (let n = 0; n < 14; n++) {
      const x = cx + R * 2 + n * spacing + shift - spacing * 2;
      if (x < cx + R) continue;
      const up = n % 2 === 0;
      const y = cy + (up ? -1 : 1) * R * 1.1;
      const fade = Math.max(0, 1 - (x - cx) / w);
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = heat(up ? 0.75 : 0.2, (0.5 - k * 0.08) * fade * o.strength);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r = R * (0.3 + k * 0.35);
        ctx.arc(x, y, r, (up ? 1 : -1) * t * 2 + k, (up ? 1 : -1) * t * 2 + k + Math.PI * 1.4);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
  }

  circuit(ctx, w, h, dt, o) {
    const t = this.time;
    ctx.lineWidth = 2;
    for (const trace of this.traces ?? []) {
      ctx.strokeStyle = rgba(o.accent, 0.18 * o.strength);
      ctx.beginPath();
      trace.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      // A pulse of heat running along the trace.
      const segs = trace.points.length - 1;
      const pos = ((t * trace.speed + trace.phase) % 1) * segs;
      const i = Math.floor(pos);
      const f = pos - i;
      const [x0, y0] = trace.points[i];
      const [x1, y1] = trace.points[i + 1];
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, heat(0.85, 0.9 * o.strength));
      g.addColorStop(1, heat(0.85, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const chip of this.chips ?? []) {
      const temp = 0.5 + 0.45 * Math.sin(t * 0.8 + chip.p * 6);
      ctx.fillStyle = heat(temp, 0.35 * o.strength);
      ctx.strokeStyle = rgba(o.text, 0.2);
      ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
      ctx.strokeRect(chip.x + 0.5, chip.y + 0.5, chip.w, chip.h);
    }
  }
}
