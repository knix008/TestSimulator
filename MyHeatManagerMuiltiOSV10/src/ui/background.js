// Moving backgrounds for the start page, on the theme of heat and flow: a
// rising plume, drifting isotherms, Bénard convection cells, embers, a
// morphing heat map, streamlines past a cylinder, waves, an aurora, drifting
// particles and a circuit board with travelling heat. Colours follow the
// theme (and the turbo colour map for the "hot" ones). 30 frames a second,
// paused while the window is hidden; `frames` counts drawn frames (tests).
import { ANIMATIONS } from '../core/settings.js';
import { colorAt } from '../core/colormap.js';

export const ANIMATION_KINDS = ANIMATIONS;

export const ANIMATION_ICONS = {
  plume: '♨', isotherms: '〰', convection: '⟳', embers: '🔥', heatmap: '🌡', streamlines: '🌊', waves: '≈', aurora: '✦', particles: '∴', circuit: '▦',
  infrared: '📷', diffusion: '◎', flames: '🕯', steam: '☁', sunrays: '☀', vortex: '🌀', boiling: '🫧', melting: '❄', heatpipe: '⇄', thermometer: '▮',
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
  constructor(canvas, { colors, speed = () => 1, kind = 'plume' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3ec1ff', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'plume';
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
    const n = { plume: 160, embers: 90, particles: 110, streamlines: 70, circuit: 26, flames: 120, steam: 60, boiling: 70, melting: 26, heatpipe: 80, sunrays: 18, infrared: 6, diffusion: 7 }[this.kind] ?? 0;
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

  plume(ctx, w, h, dt, o) {
    const t = this.time;
    // A warm glow at the source, then particles rising and cooling as they go.
    const glow = ctx.createRadialGradient(w / 2, h + 40, 10, w / 2, h + 40, h * 0.7);
    glow.addColorStop(0, heat(0.95, 0.5 * o.strength));
    glow.addColorStop(1, heat(0.5, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (const p of this.items) {
      p.y -= (30 + 60 * p.a) * dt;
      const rise = 1 - p.y / h;
      p.x += Math.sin(t * 1.3 + p.b * 9 + p.y * 0.01) * 18 * dt * (0.5 + rise);
      if (p.y < -20) { p.y = h + 10 + p.c * 40; p.x = w / 2 + (p.b - 0.5) * w * 0.25; }
      const spread = (p.x - w / 2) * (1 + rise * 0.6) + w / 2;
      const temp = Math.max(0, 1 - rise * 0.9 - Math.abs(spread - w / 2) / w);
      ctx.fillStyle = heat(0.25 + temp * 0.75, (0.25 + 0.45 * temp) * o.strength);
      ctx.beginPath();
      ctx.arc(spread, p.y, 2 + 9 * rise * p.c + 2, 0, Math.PI * 2);
      ctx.fill();
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

  embers(ctx, w, h, dt, o) {
    const t = this.time;
    for (const p of this.items) {
      p.y -= (14 + 40 * p.a) * dt;
      p.x += Math.sin(t * 2 + p.b * 20) * 10 * dt;
      if (p.y < -10) { p.y = h + 10; p.x = p.b * w; }
      const life = p.y / h;
      const flicker = 0.6 + 0.4 * Math.sin(t * 8 + p.c * 30);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10 + 8 * p.c);
      g.addColorStop(0, heat(0.75 + 0.25 * life, 0.9 * flicker * o.strength));
      g.addColorStop(1, heat(0.7, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10 + 8 * p.c, 0, Math.PI * 2);
      ctx.fill();
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

  infrared(ctx, w, h, dt, o) {
    // A thermal camera: warm blobs drifting on a cold scene, in the ironbow palette with a scale bar.
    const t = this.time * 0.3;
    const step = 18;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        let v = 0.08;
        this.items.forEach((p, i) => {
          const cx = w * (0.5 + 0.4 * Math.sin(t * (0.5 + p.a) + i * 1.9));
          const cy = h * (0.5 + 0.35 * Math.cos(t * (0.4 + p.b) + i));
          v += (0.55 + 0.3 * p.c) * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * (w * (0.05 + 0.05 * p.c)) ** 2));
        });
        ctx.fillStyle = rgba(colorAt('ironbow', Math.min(1, v)), 0.55 * o.strength);
        ctx.fillRect(x, y, step + 1, step + 1);
      }
    }
    for (let i = 0; i < 100; i++) { ctx.fillStyle = rgba(colorAt('ironbow', i / 99), 0.9); ctx.fillRect(w - 26, h * 0.2 + (h * 0.6 * (99 - i)) / 100, 10, h * 0.006 + 1); }
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

  flames(ctx, w, h, dt, o) {
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      p.y -= (60 + 90 * p.a) * dt;
      p.x += Math.sin(t * 6 + p.b * 30) * 30 * dt;
      const life = 1 - (h - p.y) / (h * (0.35 + 0.3 * p.c));
      if (life <= 0) { p.y = h + 10; p.x = w * (0.2 + 0.6 * p.b) + Math.sin(p.c * 50) * 40; continue; }
      const r = 6 + 22 * life;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, heat(0.55 + 0.45 * life, 0.45 * life * o.strength));
      g.addColorStop(1, heat(0.6, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  steam(ctx, w, h, dt, o) {
    const t = this.time;
    for (const p of this.items) {
      p.y -= (15 + 25 * p.a) * dt;
      p.x += Math.sin(t * 0.8 + p.b * 10) * 12 * dt;
      if (p.y < -80) { p.y = h + 40; p.x = p.b * w; }
      const rise = 1 - p.y / h;
      const r = 30 + 70 * rise;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(o.text, (0.12 - 0.08 * rise) * o.strength));
      g.addColorStop(1, rgba(o.text, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  sunrays(ctx, w, h, dt, o) {
    // Radiation: rays fanning out from a sun in the corner, slowly turning, with a warm surface below.
    const t = this.time * 0.15;
    const sx = w * 0.12;
    const sy = h * 0.12;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.6);
    glow.addColorStop(0, heat(0.85, 0.45 * o.strength));
    glow.addColorStop(1, heat(0.6, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    this.items.forEach((p, i) => {
      const a = 0.05 + (i / this.items.length) * 1.4 + Math.sin(t + p.a * 6) * 0.05;
      ctx.strokeStyle = heat(0.75 + 0.2 * p.b, (0.08 + 0.1 * p.c) * o.strength);
      ctx.lineWidth = 8 + 20 * p.c;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * w * 1.5, sy + Math.sin(a) * w * 1.5); ctx.stroke();
    });
    ctx.lineWidth = 1;
    const ground = ctx.createLinearGradient(0, h * 0.8, 0, h);
    ground.addColorStop(0, heat(0.6, 0));
    ground.addColorStop(1, heat(0.7 + 0.1 * Math.sin(this.time), 0.35 * o.strength));
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
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

  boiling(ctx, w, h, dt, o) {
    // Nucleate boiling: bubbles growing on a hot floor, breaking away and rising.
    const floor = ctx.createLinearGradient(0, h, 0, h * 0.75);
    floor.addColorStop(0, heat(0.9, 0.5 * o.strength));
    floor.addColorStop(1, heat(0.5, 0));
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.75, w, h * 0.25);
    for (const p of this.items) {
      p.y -= (20 + 70 * p.a) * dt * (p.y < h - 30 ? 1 : 0.25);
      p.x += Math.sin(this.time * 3 + p.b * 20) * 6 * dt;
      if (p.y < -20) { p.y = h - 4; p.x = p.b * w; }
      const r = 3 + 12 * p.c * Math.min(1, (h - p.y) / 120);
      ctx.strokeStyle = rgba(o.text, 0.4 * o.strength);
      ctx.fillStyle = rgba(o.accent, 0.08 * o.strength);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(o.text, 0.5);
      ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  }

  melting(ctx, w, h, dt, o) {
    // Phase change: ice crystals shrinking into droplets and growing back.
    const t = this.time;
    this.items.forEach((p, i) => {
      const phase = (Math.sin(t * 0.5 + i) + 1) / 2;
      const size = 14 + 26 * p.c;
      const arm = size * (1 - phase * 0.8);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(t * 0.1 + i);
      ctx.strokeStyle = heat(0.25 + phase * 0.5, (0.6 - phase * 0.3) * o.strength);
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -arm);
        ctx.moveTo(0, -arm * 0.6); ctx.lineTo(arm * 0.25, -arm * 0.8);
        ctx.moveTo(0, -arm * 0.6); ctx.lineTo(-arm * 0.25, -arm * 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = heat(0.3, phase * 0.5 * o.strength);
      ctx.beginPath(); ctx.arc(0, 0, size * 0.35 * phase, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    ctx.lineWidth = 1;
  }

  heatpipe(ctx, w, h, dt, o) {
    // A heat pipe: vapour flowing from the hot end to the cold end in the core, liquid returning in the wick.
    const top = h * 0.4;
    const bottom = h * 0.6;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, heat(0.95, 0.4 * o.strength));
    grad.addColorStop(1, heat(0.15, 0.4 * o.strength));
    ctx.fillStyle = grad;
    ctx.fillRect(w * 0.05, top - 24, w * 0.9, bottom - top + 48);
    ctx.strokeStyle = rgba(o.text, 0.3);
    ctx.strokeRect(w * 0.05, top - 24, w * 0.9, bottom - top + 48);
    for (const p of this.items) {
      const vapour = p.a > 0.4;
      p.x += (vapour ? 1 : -0.45) * (60 + 60 * p.b) * dt;
      if (p.x > w * 0.95) p.x = w * 0.05;
      if (p.x < w * 0.05) p.x = w * 0.95;
      const y = vapour ? top + (bottom - top) * p.c : (p.c > 0.5 ? top - 14 : bottom + 14);
      const tt = 1 - (p.x - w * 0.05) / (w * 0.9);
      ctx.fillStyle = vapour ? heat(0.3 + 0.6 * tt, 0.7 * o.strength) : rgba(o.accent, 0.7 * o.strength);
      ctx.beginPath(); ctx.arc(p.x, y, vapour ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  thermometer(ctx, w, h, dt, o) {
    // Rows of thermometer bars rising and falling like a live temperature chart.
    const t = this.time;
    const n = Math.max(12, Math.floor(w / 46));
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = 0.5 + 0.35 * Math.sin(t * 0.7 + i * 0.5) + 0.12 * Math.sin(t * 1.9 + i * 1.7);
      const bh = h * 0.75 * v;
      const x = i * bw + bw * 0.25;
      const g = ctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, heat(0.15, 0.55 * o.strength));
      g.addColorStop(1, heat(Math.min(1, v), 0.55 * o.strength));
      ctx.fillStyle = g;
      ctx.fillRect(x, h - bh, bw * 0.5, bh);
      ctx.beginPath(); ctx.arc(x + bw * 0.25, h - bh, bw * 0.25, 0, Math.PI * 2); ctx.fill();
    }
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
