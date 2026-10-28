// Moving backgrounds for the start page (the MyCodeChecker / MyHeatManager
// engine: one canvas, 30 frames a second with a speed factor, paused while
// the window is hidden, devicePixelRatio aware, soft glowing shapes drawn
// from the theme's bg / accent / text colours). The kinds are about numerical
// computing, plotting and block-diagram simulation.

export const ANIMATION_KINDS = ['particles', 'waves', 'lissajous', 'lorenz', 'flowField', 'epicycles', 'surface', 'pendulum',
  'scope', 'blockFlow', 'spectrum', 'heatField', 'symbols', 'numberRain', 'plotDraw', 'spiral', 'matrix', 'fractal'];

/** Icon names (components/Chrome.jsx) for the kinds. */
export const ANIMATION_ICONS = {
  particles: 'circleDot', waves: 'waves', lissajous: 'target', lorenz: 'sparkle', flowField: 'flow', epicycles: 'refresh', surface: 'plotSurf', pendulum: 'gauge',
  scope: 'plotLine', blockFlow: 'model', spectrum: 'plotBar', heatField: 'plotImage', symbols: 'hash', numberRain: 'code', plotDraw: 'chart', spiral: 'star', matrix: 'table', fractal: 'layers',
};

export const DEFAULT_START_BACKGROUND = { kind: 'surface', speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null };

const FRAME_MS = 1000 / 30;
const GLYPHS = '0123456789.+-*/^=()[]{};:πΣ∫∂√∞≈≤≥λμσωθφΔ∇'.split('');
const FORMULAS = ['∫ f(x) dx', 'Σ aₙ xⁿ', 'e^{iπ} + 1 = 0', '∂u/∂t = α∇²u', 'Ax = b', 'λ = eig(A)', 'ẋ = Ax + Bu', 'y = C x + D u', 'F(ω) = ∫ f(t) e^{-iωt} dt',
  'xₙ₊₁ = xₙ - f/f′', '‖x‖₂', 'det(A − λI) = 0', 'H(s) = 1/(s² + 2ζωs + ω²)', 'σ² = E[(X − μ)²]', 'U Σ Vᵀ', 'dy/dt = −k y', '∇ · E = ρ/ε₀', 'z ↦ z² + c'];

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cssRgb(value, fallback) {
  const v = String(value || '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = /^rgba?\(([^)]+)\)/i.exec(v);
  if (m) return m[1].split(',').slice(0, 3).map((x) => parseFloat(x));
  return fallback;
}

const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);

/** Colours from the theme tokens on :root (RGB arrays). */
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const bg = cssRgb(css.getPropertyValue('--bg'), [18, 22, 28]);
  const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  return {
    bg,
    accent: cssRgb(css.getPropertyValue('--accent'), [76, 201, 240]),
    accent2: cssRgb(css.getPropertyValue('--accent-strong'), [67, 97, 238]),
    text: cssRgb(css.getPropertyValue('--fg'), [228, 233, 240]),
    danger: cssRgb(css.getPropertyValue('--danger'), [255, 107, 107]),
    ok: cssRgb(css.getPropertyValue('--ok'), [74, 222, 128]),
    warn: cssRgb(css.getPropertyValue('--folder'), [245, 196, 81]),
    dark: lum < 0.5,
  };
}

function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(rgb, a));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A colormap (dark blue → accent → warn → danger) for value v in 0..1. */
function ramp(o, v) {
  v = Math.max(0, Math.min(1, v));
  if (v < 0.33) return mix(o.accent2, o.accent, v / 0.33);
  if (v < 0.66) return mix(o.accent, o.warn, (v - 0.33) / 0.33);
  return mix(o.warn, o.danger, (v - 0.66) / 0.34);
}

const peaks = (x, y) => 3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (y + 1) ** 2) - 10 * (x / 5 - x ** 3 - y ** 5) * Math.exp(-(x ** 2) - y ** 2) - Math.exp(-((x + 1) ** 2) - y ** 2) / 3;

export class AnimatedBackground {
  /** colors(): see themeColors(); speed(): factor (1 = normal). */
  constructor(canvas, { colors = themeColors, speed = () => 1, kind = 'surface' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors;
    this.palette = colors();
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'surface';
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.wanted = false;
    this.last = 0;
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.running = false; else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (this.resizeObserver) this.resizeObserver.observe(canvas);
    this.resize();
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

  refreshColors() {
    // Only when the theme colours really changed (any root attribute change calls this).
    const next = this.colors();
    if (JSON.stringify(next) === JSON.stringify(this.palette)) return;
    this.palette = next;
    this.fractalImg = null;
    if (!this.running) this.draw(0);
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
    if (!this.running) this.draw(0);
  }

  /** Items of the current kind, placed with a fixed seed so a kind always starts the same way. */
  seed() {
    const r = random(this.kind.length * 7919 + 11);
    this.rand = r;
    const w = this.w || 1000;
    const h = this.h || 700;
    const n = { particles: 110, numberRain: Math.ceil(w / 18), symbols: 26, flowField: 520, spiral: 0, lorenz: 3 }[this.kind] || 0;
    this.items = Array.from({ length: n }, (_, i) => ({ x: r() * w, y: r() * h, a: r(), b: r(), c: r(), i }));
    if (this.kind === 'numberRain') this.items.forEach((p, i) => { p.x = i * 18 + 4; p.y = -r() * h; p.chars = Array.from({ length: 20 }, () => GLYPHS[Math.floor(r() * GLYPHS.length)]); });
    if (this.kind === 'flowField') this.items.forEach((p) => { p.age = Math.floor(r() * 120); p.trail = []; });
    if (this.kind === 'lorenz') this.items.forEach((p, i) => { p.s = [1 + i * 0.01, 1, 1]; p.trail = []; });
    if (this.kind === 'pendulum') this.pend = [0, 1, 2].map((i) => ({ th1: 2.2 + i * 0.002, th2: 2.4, w1: 0, w2: 0, trail: [] }));
    if (this.kind === 'blockFlow') this.buildBlocks(r);
    if (this.kind === 'matrix') this.cells = Array.from({ length: 64 }, () => ({ v: (r() * 20 - 10).toFixed(1), p: r() }));
    if (this.kind === 'plotDraw') this.plot = { k: 0, fn: 0 };
    if (this.kind === 'fractal') this.fractalImg = null;
  }

  buildBlocks(r) {
    const w = this.w || 1000;
    const h = this.h || 700;
    // A few rows of blocks connected left → right, with a feedback line per row.
    const names = ['Step', 'Σ', 'PID', '1/(s+1)', 'K', '∫', 'Scope', 'Sat', 'z⁻¹', 'sin', 'Mux', 'f(u)'];
    this.blocks = [];
    this.wires = [];
    const rows = Math.max(2, Math.floor(h / 170));
    const cols = Math.max(3, Math.floor(w / 190));
    for (let j = 0; j < rows; j++) {
      const y = (h / rows) * (j + 0.5);
      let prev = null;
      for (let i = 0; i < cols; i++) {
        const b = { x: (w / cols) * (i + 0.5) + (r() - 0.5) * 30, y: y + (r() - 0.5) * 30, w: 64, h: 40, label: names[Math.floor(r() * names.length)] };
        this.blocks.push(b);
        if (prev) this.wires.push({ a: prev, b, phase: r(), fb: false });
        prev = b;
      }
      const first = this.blocks[this.blocks.length - cols];
      this.wires.push({ a: prev, b: first, phase: r(), fb: true });
    }
  }

  start() {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.wanted = false;
    this.running = false;
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.resizeObserver) this.resizeObserver.disconnect();
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
    const c = this.palette;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = rgba(c.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const o = { ...c, strength: c.dark ? 1 : 0.75 };
    if (typeof this[this.kind] === 'function') this[this.kind](ctx, w, h, dt, o);
    this.frames += 1;
  }

  /** Faint 5×5 grid (major every 5 minor) behind the plot-like kinds. */
  grid(ctx, w, h, o, step = 24) {
    ctx.lineWidth = 1;
    for (let k = 0, x = 0; x <= w; x += step, k++) {
      ctx.strokeStyle = rgba(o.text, (k % 5 === 0 ? 0.08 : 0.035) * o.strength);
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
    for (let k = 0, y = 0; y <= h; y += step, k++) {
      ctx.strokeStyle = rgba(o.text, (k % 5 === 0 ? 0.08 : 0.035) * o.strength);
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    }
  }

  // ── the backgrounds ──────────────────────────────────

  particles(ctx, w, h, dt, o) {
    // Drifting points, linked when close (a sparse adjacency graph).
    const t = this.time;
    const pts = this.items;
    for (const p of pts) {
      p.x += Math.cos(p.a * 6.283 + t * 0.2) * 14 * dt;
      p.y += Math.sin(p.b * 6.283 + t * 0.17) * 14 * dt;
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d2 = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
        if (d2 > 120 * 120) continue;
        ctx.strokeStyle = rgba(o.accent, (1 - Math.sqrt(d2) / 120) * 0.22 * o.strength);
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
      }
    }
    for (const p of pts) glow(ctx, p.x, p.y, 3 + p.c * 5, mix(o.accent, o.text, p.a * 0.4), 0.55 * o.strength);
  }

  waves(ctx, w, h, dt, o) {
    // A Fourier series building a square wave: the partial sums, one per row.
    const t = this.time * 0.6;
    this.grid(ctx, w, h, o);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const terms = 1 + r * 2;
      const y0 = (h / rows) * (r + 0.5);
      const amp = h / rows * 0.32;
      ctx.strokeStyle = rgba(mix(o.accent, o.accent2, r / rows), (0.25 + 0.1 * r) * o.strength);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        let s = 0;
        for (let k = 0; k < terms; k++) { const n = 2 * k + 1; s += Math.sin(n * (x / w * 6.283 * 2 - t)) / n; }
        const y = y0 - amp * s * 1.27;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.font = '12px Consolas, monospace';
      ctx.fillStyle = rgba(o.text, 0.3 * o.strength);
      ctx.fillText(`N = ${terms}`, 14, y0 - amp - 6);
    }
  }

  lissajous(ctx, w, h, dt, o) {
    // Lissajous figures with slowly drifting phase (an XY Graph).
    const t = this.time * 0.25;
    this.grid(ctx, w, h, o);
    const ratios = [[1, 2], [3, 2], [3, 4], [5, 4], [2, 3]];
    const cx = w / 2;
    const cy = h / 2;
    ratios.forEach(([a, b], i) => {
      const R = Math.min(w, h) * (0.16 + i * 0.065);
      ctx.strokeStyle = rgba(mix(o.accent, o.accent2, i / ratios.length), 0.3 * o.strength);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k <= 400; k++) {
        const s = (k / 400) * Math.PI * 2;
        const x = cx + R * 1.4 * Math.sin(a * s + t * (1 + i * 0.2));
        const y = cy + R * Math.sin(b * s);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const s = this.time * 0.6;
      glow(ctx, cx + R * 1.4 * Math.sin(a * s + t * (1 + i * 0.2)), cy + R * Math.sin(b * s), 9, o.accent, 0.7 * o.strength);
    });
  }

  lorenz(ctx, w, h, dt, o) {
    // The Lorenz attractor integrated with RK4, projected and slowly rotated.
    const sig = 10, rho = 28, beta = 8 / 3;
    const f = ([x, y, z]) => [sig * (y - x), x * (rho - z) - y, x * y - beta * z];
    const steps = Math.max(1, Math.round(dt * 220));
    const hh = 0.005;
    const rot = this.time * 0.12;
    const sc = Math.min(w, h) / 62;
    const cols = [o.accent, o.accent2, o.warn];
    this.items.forEach((p, i) => {
      for (let k = 0; k < steps; k++) {
        const s = p.s;
        const k1 = f(s);
        const k2 = f(s.map((v, j) => v + (hh / 2) * k1[j]));
        const k3 = f(s.map((v, j) => v + (hh / 2) * k2[j]));
        const k4 = f(s.map((v, j) => v + hh * k3[j]));
        p.s = s.map((v, j) => v + (hh / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
        p.trail.push(p.s);
      }
      if (p.trail.length > 1600) p.trail.splice(0, p.trail.length - 1600);
      const proj = ([x, y, z]) => [w / 2 + (x * Math.cos(rot) - y * Math.sin(rot)) * sc, h / 2 + 14 * sc - z * sc * 0.95];
      ctx.lineWidth = 1.2;
      const tr = p.trail;
      for (let k = 1; k < tr.length; k += 1) {
        const a = proj(tr[k - 1]);
        const b = proj(tr[k]);
        ctx.strokeStyle = rgba(cols[i % 3], (k / tr.length) * 0.5 * o.strength);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      if (tr.length) { const q = proj(tr[tr.length - 1]); glow(ctx, q[0], q[1], 8, cols[i % 3], 0.8 * o.strength); }
    });
  }

  flowField(ctx, w, h, dt, o) {
    // Particles following a phase portrait (the van der Pol oscillator).
    const mu = 1.2;
    const sc = Math.min(w, h) / 7;
    const cx = w / 2;
    const cy = h / 2;
    for (const p of this.items) {
      const x = (p.x - cx) / sc;
      const y = -(p.y - cy) / sc;
      const dx = y;
      const dy = mu * (1 - x * x) * y - x;
      const m = Math.hypot(dx, dy) || 1;
      p.x += (dx / m) * 40 * dt;
      p.y -= (dy / m) * 40 * dt;
      p.trail.push([p.x, p.y]);
      if (p.trail.length > 14) p.trail.shift();
      p.age += 1;
      if (p.age > 160 || p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) { p.x = this.rand() * w; p.y = this.rand() * h; p.age = 0; p.trail = []; }
      if (p.trail.length > 1) {
        ctx.strokeStyle = rgba(mix(o.accent2, o.accent, Math.min(1, m / 6)), 0.32 * o.strength);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.trail[0][0], p.trail[0][1]);
        for (const q of p.trail) ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
    }
  }

  epicycles(ctx, w, h, dt, o) {
    // Fourier epicycles: rotating circles whose tip draws a curve.
    const t = this.time * 0.5;
    const N = 9;
    let x = w * 0.3;
    let y = h / 2;
    const R = Math.min(w, h) * 0.22;
    ctx.lineWidth = 1;
    for (let k = 0; k < N; k++) {
      const n = 2 * k + 1;
      const r = (R * 4) / (n * Math.PI);
      ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      const nx = x + r * Math.cos(n * t);
      const ny = y + r * Math.sin(n * t);
      ctx.strokeStyle = rgba(o.accent, 0.45 * o.strength);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny;
    }
    this.wave = this.wave || [];
    this.wave.unshift(y);
    const x0 = w * 0.55;
    if (this.wave.length > (w - x0) / 2) this.wave.pop();
    ctx.strokeStyle = rgba(o.accent, 0.25 * o.strength);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x0, this.wave[0]); ctx.stroke();
    ctx.strokeStyle = rgba(o.accent, 0.6 * o.strength);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.wave.forEach((v, i) => { if (i === 0) ctx.moveTo(x0, v); else ctx.lineTo(x0 + i * 2, v); });
    ctx.stroke();
    glow(ctx, x, y, 8, o.accent, 0.9 * o.strength);
  }

  surface(ctx, w, h, dt, o) {
    // A rotating wireframe of peaks(x, y), coloured by height.
    const az = this.time * 0.18;
    const el = 0.55;
    const n = 30;
    const sc = Math.min(w, h) * 0.26;
    const cx = w / 2;
    const cy = h * 0.56;
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const P = [];
    for (let i = 0; i <= n; i++) {
      P.push([]);
      for (let j = 0; j <= n; j++) {
        const x = -3 + (6 * i) / n;
        const y = -3 + (6 * j) / n;
        const z = peaks(x, y);
        const X = x * ca - y * sa;
        const Y = x * sa + y * ca;
        P[i].push({ sx: cx + X * sc * 0.55, sy: cy - (z * 0.12 * ce - Y * se) * sc * 0.9 * 0.55 * 1.6, z });
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p = P[i][j];
        const col = ramp(o, (p.z + 6.5) / 14.6);
        ctx.strokeStyle = rgba(col, 0.42 * o.strength);
        if (i < n) { const q = P[i + 1][j]; ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke(); }
        if (j < n) { const q = P[i][j + 1]; ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke(); }
      }
    }
  }

  pendulum(ctx, w, h, dt, o) {
    // Three double pendulums with nearly equal starts: chaos separates them.
    const g = 9.81, L = 1, m = 1;
    const sc = Math.min(w, h) * 0.2;
    const ox = w / 2;
    const oy = h * 0.32;
    const steps = Math.max(1, Math.round(dt * 400));
    const hh = 0.0025;
    const cols = [o.accent, o.warn, o.danger];
    this.pend.forEach((p, i) => {
      for (let k = 0; k < steps; k++) {
        const d = p.th1 - p.th2;
        const den = 2 * m + m - m * Math.cos(2 * d);
        const a1 = (-g * (2 * m + m) * Math.sin(p.th1) - m * g * Math.sin(p.th1 - 2 * p.th2) - 2 * Math.sin(d) * m * (p.w2 * p.w2 * L + p.w1 * p.w1 * L * Math.cos(d))) / (L * den);
        const a2 = (2 * Math.sin(d) * (p.w1 * p.w1 * L * (m + m) + g * (m + m) * Math.cos(p.th1) + p.w2 * p.w2 * L * m * Math.cos(d))) / (L * den);
        p.w1 += a1 * hh; p.w2 += a2 * hh;
        p.th1 += p.w1 * hh; p.th2 += p.w2 * hh;
      }
      const x1 = ox + sc * Math.sin(p.th1), y1 = oy + sc * Math.cos(p.th1);
      const x2 = x1 + sc * Math.sin(p.th2), y2 = y1 + sc * Math.cos(p.th2);
      p.trail.push([x2, y2]);
      if (p.trail.length > 260) p.trail.shift();
      ctx.lineWidth = 1.3;
      p.trail.forEach((q, k) => {
        if (!k) return;
        ctx.strokeStyle = rgba(cols[i], (k / p.trail.length) * 0.5 * o.strength);
        ctx.beginPath(); ctx.moveTo(p.trail[k - 1][0], p.trail[k - 1][1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      });
      ctx.strokeStyle = rgba(o.text, 0.35 * o.strength);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      glow(ctx, x1, y1, 7, cols[i], 0.7 * o.strength);
      glow(ctx, x2, y2, 9, cols[i], 0.85 * o.strength);
    });
  }

  scope(ctx, w, h, dt, o) {
    // An oscilloscope: a step response, a sine and noise sweeping across.
    const t = this.time;
    this.grid(ctx, w, h, o, 32);
    const span = 6;
    const traces = [
      [o.accent, (s) => 1 - Math.exp(-0.9 * (s % 6)) * (Math.cos(3 * (s % 6)) + 0.3 * Math.sin(3 * (s % 6))), 0.3],
      [o.warn, (s) => Math.sin(2.2 * s) * 0.8, 0.55],
      [o.ok, (s) => 0.35 * Math.sin(7 * s) * Math.sin(0.7 * s) + 0.15 * Math.sin(23 * s), 0.8],
    ];
    for (const [col, fn, pos] of traces) {
      const y0 = h * pos;
      const amp = h * 0.11;
      ctx.strokeStyle = rgba(col, 0.55 * o.strength);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const s = t - span + (x / w) * span;
        const y = y0 - amp * fn(s);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      glow(ctx, w - 4, y0 - amp * fn(t), 10, col, 0.7 * o.strength);
    }
  }

  blockFlow(ctx, w, h, dt, o) {
    // A block diagram with signal pulses running along its lines.
    const t = this.time;
    ctx.lineWidth = 1.4;
    for (const e of this.wires) {
      const ax = e.a.x + e.a.w / 2, ay = e.a.y;
      const bx = e.b.x - e.b.w / 2, by = e.b.y;
      const pts = e.fb ? [[ax, ay], [ax + 20, ay], [ax + 20, ay + 50], [bx - 20, by + 50], [bx - 20, by], [bx, by]] : [[ax, ay], [(ax + bx) / 2, ay], [(ax + bx) / 2, by], [bx, by]];
      ctx.strokeStyle = rgba(o.text, (e.fb ? 0.14 : 0.22) * o.strength);
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      // arrow head
      ctx.fillStyle = rgba(o.text, 0.3 * o.strength);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 7, by - 4); ctx.lineTo(bx - 7, by + 4); ctx.fill();
      // pulse along the polyline
      const seg = [];
      let len = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
      let d = (((t * 0.35 + e.phase) % 1) + 1) % 1 * len;
      for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i]) { const k = d / (seg[i] || 1); glow(ctx, pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, 7, e.fb ? o.warn : o.accent, 0.85 * o.strength); break; }
        d -= seg[i];
      }
    }
    ctx.font = '12px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of this.blocks) {
      ctx.fillStyle = rgba(o.bg, 0.85);
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.strokeStyle = rgba(o.accent, 0.4 * o.strength);
      ctx.strokeRect(b.x - b.w / 2 + 0.5, b.y - b.h / 2 + 0.5, b.w, b.h);
      ctx.fillStyle = rgba(o.text, 0.5 * o.strength);
      ctx.fillText(b.label, b.x, b.y);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  spectrum(ctx, w, h, dt, o) {
    // An FFT magnitude spectrum: harmonic peaks rising and falling.
    const t = this.time;
    const n = Math.max(24, Math.floor(w / 18));
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      let v = 0.06 + 0.04 * Math.sin(t * 3 + i * 1.7);
      for (const [c, a] of [[0.12, 0.8], [0.24, 0.5], [0.36, 0.33], [0.6 + 0.1 * Math.sin(t * 0.3), 0.45]]) v += a * Math.exp(-(((f - c) / 0.018) ** 2)) * (0.75 + 0.25 * Math.sin(t * 1.3 + c * 20));
      v = Math.min(1, v);
      const bh = h * 0.72 * v;
      const x = i * bw + bw * 0.18;
      const g = ctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, rgba(o.accent2, 0.15 * o.strength));
      g.addColorStop(1, rgba(ramp(o, v), 0.55 * o.strength));
      ctx.fillStyle = g;
      ctx.fillRect(x, h - bh, bw * 0.64, bh);
    }
  }

  heatField(ctx, w, h, dt, o) {
    // The heat equation's field from a few moving sources (imagesc of a 2D field).
    const t = this.time * 0.35;
    const spots = [0, 1, 2, 3, 4].map((i) => [w * (0.5 + 0.38 * Math.sin(t * (0.6 + i * 0.13) + i * 2)), h * (0.5 + 0.38 * Math.cos(t * (0.5 + i * 0.11) + i))]);
    const step = 22;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        let v = 0;
        for (const [sx, sy] of spots) v += Math.exp(-(((x - sx) ** 2 + (y - sy) ** 2) / (2 * (w * 0.12) ** 2)));
        v = Math.min(1, v * 0.85);
        ctx.fillStyle = rgba(ramp(o, v), (0.06 + 0.36 * v) * o.strength);
        ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
      }
    }
  }

  symbols(ctx, w, h, dt, o) {
    // Formulas floating upwards.
    const t = this.time;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.items) {
      p.y -= (8 + 14 * p.a) * dt;
      p.x += Math.sin(t * 0.4 + p.b * 10) * 5 * dt;
      if (p.y < -40) { p.y = h + 40; p.x = p.b * w; }
      const size = 13 + 16 * p.c;
      ctx.font = `${size}px "Cambria Math", "Times New Roman", serif`;
      ctx.fillStyle = rgba(mix(o.accent, o.text, p.a * 0.5), (0.12 + 0.28 * p.c) * o.strength);
      ctx.fillText(FORMULAS[p.i % FORMULAS.length], p.x, p.y);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  numberRain(ctx, w, h, dt, o) {
    // Columns of digits and operators falling.
    ctx.font = '15px Consolas, "Cascadia Mono", monospace';
    ctx.textBaseline = 'top';
    for (const p of this.items) {
      p.y += (40 + 70 * p.a) * dt;
      if (p.y - p.chars.length * 18 > h) { p.y = -this.rand() * h * 0.5; }
      if (this.rand() < 0.03) p.chars[Math.floor(this.rand() * p.chars.length)] = GLYPHS[Math.floor(this.rand() * GLYPHS.length)];
      p.chars.forEach((ch, k) => {
        const y = p.y - k * 18;
        if (y < -18 || y > h) return;
        ctx.fillStyle = k === 0 ? rgba(o.text, 0.75 * o.strength) : rgba(o.accent, (1 - k / p.chars.length) * 0.4 * o.strength);
        ctx.fillText(ch, p.x, y);
      });
    }
    ctx.textBaseline = 'alphabetic';
  }

  plotDraw(ctx, w, h, dt, o) {
    // Axes with ticks; functions drawn left to right, one after another.
    const fns = [[(x) => Math.sin(x), 'sin(x)'], [(x) => Math.exp(-0.15 * x * x) * Math.cos(3 * x), 'e^{-0.15x²}cos 3x'], [(x) => Math.tanh(x), 'tanh(x)'], [(x) => (Math.sin(3 * x) / (x || 1e-9)) * 0.9, 'sin(3x)/x'], [(x) => 0.15 * x * x - 1.2, '0.15x² − 1.2']];
    const pl = this.plot;
    pl.k += dt * 0.35;
    if (pl.k > 1.4) { pl.k = 0; pl.fn = (pl.fn + 1) % fns.length; }
    const L = w * 0.12, R = w * 0.88, T = h * 0.2, B = h * 0.8;
    this.grid(ctx, w, h, o);
    ctx.strokeStyle = rgba(o.text, 0.3 * o.strength);
    ctx.lineWidth = 1;
    ctx.strokeRect(L + 0.5, T + 0.5, R - L, B - T);
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = rgba(o.text, 0.35 * o.strength);
    for (let k = -4; k <= 4; k += 2) { const x = L + ((k + 5) / 10) * (R - L); ctx.fillText(String(k), x - 4, B + 14); }
    const X = (x) => L + ((x + 5) / 10) * (R - L);
    const Y = (y) => (T + B) / 2 - (y / 1.6) * ((B - T) / 2);
    [pl.fn - 1, pl.fn].forEach((idx, layer) => {
      if (idx < 0) return;
      const [fn, name] = fns[idx % fns.length];
      const upto = layer ? Math.min(1, pl.k) : 1;
      ctx.strokeStyle = rgba(layer ? o.accent : o.accent2, (layer ? 0.7 : 0.2) * o.strength);
      ctx.lineWidth = layer ? 2 : 1.2;
      ctx.beginPath();
      for (let s = 0; s <= upto * 400; s++) {
        const x = -5 + (s / 400) * 10;
        const y = Y(Math.max(-1.6, Math.min(1.6, fn(x))));
        if (s === 0) ctx.moveTo(X(x), y); else ctx.lineTo(X(x), y);
      }
      ctx.stroke();
      if (layer) {
        ctx.font = '14px "Cambria Math", serif';
        ctx.fillStyle = rgba(o.accent, 0.6 * o.strength);
        ctx.fillText(name, L + 10, T + 20);
        const xe = -5 + upto * 10;
        glow(ctx, X(xe), Y(Math.max(-1.6, Math.min(1.6, fn(xe)))), 9, o.accent, 0.8 * o.strength);
      }
    });
  }

  spiral(ctx, w, h, dt, o) {
    // The Ulam spiral of primes, slowly turning.
    const t = this.time * 0.05;
    const N = 2400;
    const cx = w / 2;
    const cy = h / 2;
    if (!this.primeMask) {
      const m = new Uint8Array(N + 1).fill(1);
      m[0] = m[1] = 0;
      for (let i = 2; i * i <= N; i++) if (m[i]) for (let j = i * i; j <= N; j += i) m[j] = 0;
      this.primeMask = m;
    }
    const step = Math.min(w, h) / 70;
    for (let n = 1; n <= N; n++) {
      const a = Math.sqrt(n) * 2.4 + t;
      const r = Math.sqrt(n) * step * 0.7;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (this.primeMask[n]) glow(ctx, x, y, 3.5, mix(o.accent, o.warn, (n % 7) / 7), 0.6 * o.strength);
      else if (n % 3 === 0) { ctx.fillStyle = rgba(o.text, 0.07 * o.strength); ctx.fillRect(x, y, 1.5, 1.5); }
    }
  }

  matrix(ctx, w, h, dt, o) {
    // A bracketed matrix whose entries change (an iterative solver converging).
    const t = this.time;
    const n = 8;
    const cw = Math.min(w / 12, 80);
    const ch = Math.min(h / 11, 44);
    const x0 = w / 2 - (n * cw) / 2;
    const y0 = h / 2 - (n * ch) / 2;
    ctx.strokeStyle = rgba(o.text, 0.3 * o.strength);
    ctx.lineWidth = 2;
    for (const [x, d] of [[x0 - 10, 1], [x0 + n * cw + 10, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + d * 10, y0 - 8); ctx.lineTo(x, y0 - 8); ctx.lineTo(x, y0 + n * ch + 8); ctx.lineTo(x + d * 10, y0 + n * ch + 8); ctx.stroke();
    }
    ctx.font = '15px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.cells.forEach((c, k) => {
      const i = k % n;
      const j = Math.floor(k / n);
      if (this.rand() < 0.01) c.v = (i === j ? 1 + this.rand() * 9 : (this.rand() - 0.5) * Math.exp(-((t * 0.1) % 4))).toFixed(i === j ? 2 : 3);
      const diag = i === j;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + c.p * 6);
      ctx.fillStyle = rgba(diag ? o.accent : o.text, (diag ? 0.55 : 0.18 + 0.12 * pulse) * o.strength);
      ctx.fillText(c.v, x0 + (j + 0.5) * cw, y0 + (i + 0.5) * ch);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  fractal(ctx, w, h, dt, o) {
    // The Mandelbrot set at low resolution, its colours cycling.
    const cell = 6;
    const nx = Math.ceil(w / cell);
    const ny = Math.ceil(h / cell);
    if (!this.fractalImg || this.fractalImg.nx !== nx || this.fractalImg.ny !== ny) {
      const it = new Uint8Array(nx * ny);
      const sc = 3.2 / Math.min(nx, ny * 1.4);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const cr = -0.6 + (i - nx / 2) * sc;
          const ci = (j - ny / 2) * sc;
          let zr = 0, zi = 0, k = 0;
          while (k < 60 && zr * zr + zi * zi < 4) { const tmp = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = tmp; k++; }
          it[i + j * nx] = k;
        }
      }
      this.fractalImg = { nx, ny, it };
    }
    const { it } = this.fractalImg;
    const shift = this.time * 0.08;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = it[i + j * nx];
        if (k >= 60) { ctx.fillStyle = rgba(o.bg, 1); continue; }
        if (k < 3) continue;
        const v = ((k / 60) * 3 + shift) % 1;
        ctx.fillStyle = rgba(ramp(o, v), (0.08 + 0.4 * (k / 60)) * o.strength);
        ctx.fillRect(i * cell, j * cell, cell - 1, cell - 1);
      }
    }
  }
}
