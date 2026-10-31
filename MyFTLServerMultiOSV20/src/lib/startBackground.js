// Moving backgrounds for the start page (the engine of the sibling apps' start
// pages: one canvas, 30 frames a second with a speed factor, paused while the
// window is hidden, devicePixelRatio aware, soft glowing shapes drawn from the
// theme's bg / accent / text colours). The kinds are about networks and file
// transfer: an FTP server's world.

export const ANIMATION_KINDS = [
  'network', 'packets', 'radar', 'binaryRain', 'globe', 'transfer', 'circuit', 'waves', 'particles', 'aurora',
  'hexGrid', 'satellite', 'tunnel', 'traffic', 'folders', 'sync', 'encryption', 'warp', 'terrain', 'fiber', 'broadcast',
];

/** Icon names (components/Icons.jsx) for the kinds. */
export const ANIMATION_ICONS = {
  network: 'network', packets: 'server', radar: 'radar', binaryRain: 'binary', globe: 'globe',
  transfer: 'transfer', circuit: 'cpu', waves: 'waves', particles: 'sparkle', aurora: 'aurora',
  hexGrid: 'hexagon', satellite: 'satellite', tunnel: 'tunnel', traffic: 'chart', folders: 'tree',
  sync: 'sync', encryption: 'lock', warp: 'warp', terrain: 'terrain', fiber: 'fiber', broadcast: 'broadcast',
};

export const DEFAULT_START_BACKGROUND = { kind: 'network', speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null };

const FRAME_MS = 1000 / 30;
const HEX = '0123456789ABCDEF'.split('');
const FILES = ['report.pdf', 'photo.jpg', 'backup.zip', 'notes.txt', 'video.mp4', 'song.mp3', 'data.csv', 'site.html', 'app.exe', 'logo.png'];

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The point `d` pixels along a polyline. */
function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const s = Math.hypot(x1 - x0, y1 - y0);
    if (d <= s) { const k = s ? d / s : 0; return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; }
    d -= s;
  }
  return pts[pts.length - 1];
}

/** A point of the cubic Bézier p[0..3] at u. */
function bez(p, u) {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
}

/** A rack server: three units with blinking lights. */
function serverBox(ctx, x, y, o, t) {
  ctx.fillStyle = rgba(o.bg, 0.85);
  ctx.strokeStyle = rgba(o.accent, 0.9);
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    roundRect(ctx, x - 26, y - 30 + k * 20, 52, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(k === 0 ? o.ok : o.accent, 0.5 + 0.5 * Math.sin(t * 6 + k + x));
    ctx.beginPath();
    ctx.arc(x - 16, y - 22 + k * 20, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(o.bg, 0.85);
  }
}

export class AnimatedBackground {
  /** colors(): see themeColors(); speed(): factor (1 = normal). */
  constructor(canvas, { colors = themeColors, speed = () => 1, kind = 'network' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors;
    this.palette = colors();
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'network';
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
    if (!this.running) this.draw(0);
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
    const area = (w * h) / (1000 * 700);
    const n = {
      network: Math.round(46 * area) + 10, particles: Math.round(90 * area) + 20, binaryRain: Math.ceil(w / 18), globe: 420, radar: 14,
      warp: Math.round(220 * area) + 60, tunnel: 90, sync: 48, encryption: 28,
    }[this.kind] || 0;
    this.items = Array.from({ length: n }, (_, i) => ({ x: r() * w, y: r() * h, a: r(), b: r(), c: r(), i, vx: (r() - 0.5) * 0.6, vy: (r() - 0.5) * 0.6 }));
    if (this.kind === 'binaryRain') this.items.forEach((p, i) => { p.x = i * 18 + 4; p.y = -r() * h; p.chars = Array.from({ length: 22 }, () => (r() < 0.75 ? (r() < 0.5 ? '0' : '1') : HEX[Math.floor(r() * 16)])); });
    if (this.kind === 'globe') this.items.forEach((p, i) => { const k = (i + 0.5) / n; p.lat = Math.asin(2 * k - 1); p.lon = i * 2.39996; });
    if (this.kind === 'network') this.pulses = [];
    if (this.kind === 'packets') this.buildPackets(r);
    if (this.kind === 'transfer') this.files = Array.from({ length: Math.max(6, Math.round(w / 150)) }, (_, i) => this.newFile(r, i, true));
    if (this.kind === 'circuit') this.buildCircuit(r);
    if (this.kind === 'radar') this.items.forEach((p) => { p.ang = p.a * Math.PI * 2; p.dist = 0.2 + p.b * 0.75; });
    if (this.kind === 'globe') this.arcs = Array.from({ length: 7 }, () => ({ a: Math.floor(r() * n), b: Math.floor(r() * n), p: r() }));
    if (this.kind === 'hexGrid') this.buildHex();
    if (this.kind === 'satellite') {
      this.sats = Array.from({ length: 5 }, (_, i) => ({ orbit: 1.45 + i * 0.22, tilt: 0.25 + r() * 0.35, rot: (r() - 0.5) * 1.2, speed: (0.2 + r() * 0.3) * (r() < 0.5 ? -1 : 1), phase: r() * Math.PI * 2 }));
      this.stations = Array.from({ length: 8 }, () => ({ lon: r() * Math.PI * 2, lat: (r() - 0.5) * 1.3 }));
    }
    if (this.kind === 'tunnel') this.items.forEach((p) => { p.z = p.a; p.ang = p.b * Math.PI * 2; });
    if (this.kind === 'traffic') { this.series = [[], []]; this.scroll = 0; }
    if (this.kind === 'folders') this.buildTree(r);
    if (this.kind === 'sync') {
      this.ends = [{ x: w * 0.16, y: h * 0.5, hit: 0 }, { x: w * 0.84, y: h * 0.5, hit: 0 }];
      this.items.forEach((p) => { p.lane = Math.floor(p.a * 6); p.u = p.b; p.dir = p.c < 0.5 ? 1 : -1; });
    }
    if (this.kind === 'encryption') this.items.forEach((p) => { p.k = p.a * 2; p.ang = p.b * Math.PI * 2; });
    if (this.kind === 'warp') this.items.forEach((p) => this.newStar(p, r, true));
    if (this.kind === 'fiber') {
      this.strands = Array.from({ length: Math.max(12, Math.round(h / 40)) }, (_, i) => ({
        y0: h * (0.06 + r() * 0.88), y1: h * (0.06 + r() * 0.88), col: i % 3, phase: r(), speed: 0.08 + r() * 0.12, n: 1 + Math.floor(r() * 3),
      }));
    }
    if (this.kind === 'broadcast') {
      const count = Math.max(3, Math.round(w / 320));
      this.towers = Array.from({ length: count }, (_, i) => ({ x: (w * (i + 0.5)) / count + (r() - 0.5) * 60, y: h * (0.62 + r() * 0.28), phase: r(), rate: 0.6 + r() * 0.6 }));
    }
  }

  buildHex() {
    const w = this.w || 1000;
    const h = this.h || 700;
    const s = 26;
    const dx = s * Math.sqrt(3);
    const dy = s * 1.5;
    this.hexR = s;
    this.hexes = [];
    for (let row = -1; row * dy < h + s; row++) {
      for (let col = -1; col * dx < w + dx; col++) this.hexes.push({ x: col * dx + (row & 1 ? dx / 2 : 0), y: row * dy, lit: 0, ok: false });
    }
  }

  /** A shared-folder tree laid out left to right; leaves are files. */
  buildTree(r) {
    const w = this.w || 1000;
    const h = this.h || 700;
    const levels = 5;
    const nodes = [{ depth: 0, parent: -1, x: w * 0.07, y: h * 0.5 }];
    let frontier = [0];
    for (let d = 1; d <= levels; d++) {
      const next = [];
      for (const i of frontier) {
        let kids = d >= 3 && r() < 0.25 ? 0 : 1 + Math.floor(r() * (d < 3 ? 3 : 2));
        if (nodes.length > 100) kids = Math.min(kids, 1);
        if (d === 1) kids = Math.max(kids, 3);
        for (let k = 0; k < kids; k++) { nodes.push({ depth: d, parent: i }); next.push(nodes.length - 1); }
      }
      frontier = next;
    }
    for (let d = 1; d <= levels; d++) {
      const row = nodes.filter((nd) => nd.depth === d);
      row.forEach((nd, k) => { nd.x = w * (0.07 + d * 0.18); nd.y = h * (0.05 + (0.9 * (k + 0.5)) / row.length); });
    }
    nodes.forEach((nd, i) => { nd.leaf = !nodes.some((m) => m.parent === i); nd.hit = 0; });
    this.nodes = nodes;
    this.leaves = nodes.map((nd, i) => (nd.leaf ? i : -1)).filter((i) => i >= 0);
    this.flows = [];
  }

  newStar(p, r, scatter) {
    p.ang = r() * Math.PI * 2;
    p.d = scatter ? 0.02 + r() * 0.98 : 0.02 + r() * 0.05;
    p.v = 0.3 + r() * 0.7;
  }

  buildPackets(r) {
    const w = this.w || 1000;
    const h = this.h || 700;
    this.server = { x: w * 0.5, y: h * 0.52 };
    const count = Math.max(6, Math.round(w / 160));
    this.clients = Array.from({ length: count }, (_, i) => {
      const ang = (i / count) * Math.PI * 2 + r() * 0.4;
      const rad = Math.min(w, h) * (0.32 + r() * 0.14);
      return { x: this.server.x + Math.cos(ang) * rad * (w / h > 1.3 ? 1.5 : 1), y: this.server.y + Math.sin(ang) * rad, up: r() < 0.5, rate: 0.4 + r() * 0.8, phase: r() };
    });
  }

  buildCircuit(r) {
    const w = this.w || 1000;
    const h = this.h || 700;
    const step = 40;
    this.traces = [];
    const count = Math.round((w * h) / 22000) + 8;
    for (let k = 0; k < count; k++) {
      let x = Math.round((r() * w) / step) * step;
      let y = Math.round((r() * h) / step) * step;
      const pts = [[x, y]];
      let dir = Math.floor(r() * 4);
      const len = 3 + Math.floor(r() * 7);
      for (let s = 0; s < len; s++) {
        if (r() < 0.4) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
        x += [step, 0, -step, 0][dir];
        y += [0, step, 0, -step][dir];
        pts.push([x, y]);
      }
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.traces.push({ pts, total, phase: r(), rate: 0.5 + r() });
    }
  }

  newFile(r, i, scatter) {
    const w = this.w || 1000;
    const h = this.h || 700;
    const up = r() < 0.5;
    return { x: 30 + r() * (w - 200), y: scatter ? r() * h : (up ? h + 40 : -60), up, v: 0.5 + r() * 0.9, name: FILES[Math.floor(r() * FILES.length)], size: Math.round(1 + r() * 900), p: r() };
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
    const elapsed = now - this.last;
    if (elapsed >= FRAME_MS) {
      this.last = now - (elapsed % FRAME_MS);
      const dt = Math.min(0.1, elapsed / 1000) * Math.max(0, Number(this.speed()) || 0);
      this.time += dt;
      this.draw(dt);
    }
    requestAnimationFrame(this.loop);
  }

  draw(dt) {
    const { ctx, w, h } = this;
    const o = this.palette;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, rgba(o.bg, 1));
    g.addColorStop(1, rgba(mix(o.bg, o.accent2, o.dark ? 0.14 : 0.08), 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const fn = this[`draw_${this.kind}`];
    if (fn) fn.call(this, ctx, w, h, o, dt);
  }

  // ── Kinds ──────────────────────────────────────────────

  /** Nodes drifting, linked when close; packets run along the links. */
  draw_network(ctx, w, h, o, dt) {
    const items = this.items;
    for (const p of items) {
      p.x += p.vx * dt * 30;
      p.y += p.vy * dt * 30;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    const max = 150;
    ctx.lineWidth = 1;
    const links = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > max) continue;
        links.push([a, b]);
        ctx.strokeStyle = rgba(o.accent, (1 - d / max) * (o.dark ? 0.35 : 0.3));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    if (links.length && this.rand() < dt * 6) {
      const [a, b] = links[Math.floor(this.rand() * links.length)];
      this.pulses.push({ a, b, k: 0, col: this.rand() < 0.5 ? o.ok : o.warn });
    }
    this.pulses = this.pulses.filter((p) => p.k <= 1);
    for (const p of this.pulses) {
      p.k += dt * 1.4;
      const x = p.a.x + (p.b.x - p.a.x) * p.k;
      const y = p.a.y + (p.b.y - p.a.y) * p.k;
      glow(ctx, x, y, 9, p.col, 0.9);
    }
    for (const p of items) {
      const big = p.c > 0.85;
      glow(ctx, p.x, p.y, big ? 16 : 8, big ? o.accent : o.text, big ? 0.55 : 0.25);
      ctx.fillStyle = rgba(big ? o.accent : o.text, big ? 0.95 : 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, big ? 3.2 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A server in the middle, clients around it, uploads and downloads in flight. */
  draw_packets(ctx, w, h, o) {
    const s = this.server;
    const t = this.time;
    for (const c of this.clients) {
      const mx = (s.x + c.x) / 2 + (c.y - s.y) * 0.18;
      const my = (s.y + c.y) / 2 - (c.x - s.x) * 0.18;
      ctx.strokeStyle = rgba(o.accent, o.dark ? 0.22 : 0.25);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.quadraticCurveTo(mx, my, s.x, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) {
        let u = (t * c.rate * 0.35 + c.phase + k / 3) % 1;
        if (!c.up) u = 1 - u;
        const x = (1 - u) * (1 - u) * c.x + 2 * (1 - u) * u * mx + u * u * s.x;
        const y = (1 - u) * (1 - u) * c.y + 2 * (1 - u) * u * my + u * u * s.y;
        const col = c.up ? o.ok : o.warn;
        glow(ctx, x, y, 10, col, 0.6);
        ctx.fillStyle = rgba(col, 0.95);
        ctx.fillRect(x - 3, y - 2, 6, 4);
      }
      glow(ctx, c.x, c.y, 22, o.accent, 0.25);
      ctx.strokeStyle = rgba(o.text, 0.55);
      ctx.lineWidth = 1.4;
      roundRect(ctx, c.x - 11, c.y - 8, 22, 15, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y + 11);
      ctx.lineTo(c.x + 6, c.y + 11);
      ctx.stroke();
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    glow(ctx, s.x, s.y, 70 + pulse * 20, o.accent, 0.3);
    ctx.fillStyle = rgba(o.bg, 0.85);
    ctx.strokeStyle = rgba(o.accent, 0.9);
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      roundRect(ctx, s.x - 26, s.y - 30 + k * 20, 52, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(k === 0 ? o.ok : o.accent, 0.5 + 0.5 * Math.sin(t * 6 + k));
      ctx.beginPath();
      ctx.arc(s.x - 16, s.y - 22 + k * 20, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(o.bg, 0.85);
    }
  }

  /** A radar sweep finding clients. */
  draw_radar(ctx, w, h, o) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(w, h) * 0.42;
    ctx.strokeStyle = rgba(o.accent, 0.18);
    ctx.lineWidth = 1;
    for (let k = 1; k <= 5; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * k) / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    const ang = (this.time * 0.9) % (Math.PI * 2);
    for (let k = 0; k < 28; k++) {
      const a0 = ang - (k * 0.035);
      ctx.fillStyle = rgba(o.accent, 0.16 * (1 - k / 28));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0 - 0.035, a0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(o.accent, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.stroke();
    for (const p of this.items) {
      const since = ((ang - p.ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const fade = Math.max(0, 1 - since / (Math.PI * 1.6));
      const x = cx + Math.cos(p.ang) * R * p.dist;
      const y = cy + Math.sin(p.ang) * R * p.dist;
      const col = p.c > 0.7 ? o.warn : o.ok;
      glow(ctx, x, y, 16, col, 0.15 + fade * 0.7);
      ctx.fillStyle = rgba(col, 0.25 + fade * 0.75);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    glow(ctx, cx, cy, 30, o.accent, 0.6);
  }

  /** Columns of bits and hex digits falling. */
  draw_binaryRain(ctx, w, h, o, dt) {
    ctx.font = '13px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    for (const p of this.items) {
      p.y += (40 + p.a * 90) * dt * 2;
      if (p.y - 22 * 16 > h) { p.y = -this.rand() * 200; }
      if (this.rand() < dt * 3) p.chars[Math.floor(this.rand() * p.chars.length)] = this.rand() < 0.75 ? (this.rand() < 0.5 ? '0' : '1') : HEX[Math.floor(this.rand() * 16)];
      for (let k = 0; k < p.chars.length; k++) {
        const y = p.y - k * 16;
        if (y < -16 || y > h + 16) continue;
        const head = k === 0;
        ctx.fillStyle = head ? rgba(o.text, 0.95) : rgba(p.c > 0.8 ? o.ok : o.accent, (1 - k / p.chars.length) * 0.55);
        ctx.fillText(p.chars[k], p.x, y);
      }
    }
    ctx.textAlign = 'start';
  }

  /** A rotating dotted globe with links between places. */
  draw_globe(ctx, w, h, o) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.36;
    const rot = this.time * 0.25;
    const tilt = 0.35;
    const proj = (p) => {
      const lon = p.lon + rot;
      let x = Math.cos(p.lat) * Math.sin(lon);
      let y = Math.sin(p.lat);
      let z = Math.cos(p.lat) * Math.cos(lon);
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
      const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      return { x: cx + x * R, y: cy - y2 * R, z: z2 };
    };
    glow(ctx, cx, cy, R * 1.25, o.accent2, o.dark ? 0.18 : 0.12);
    ctx.strokeStyle = rgba(o.accent, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    for (const p of this.items) {
      const q = proj(p);
      if (q.z < -0.1) continue;
      ctx.fillStyle = rgba(o.accent, 0.15 + Math.max(0, q.z) * 0.7);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 1 + q.z * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const arc of this.arcs) {
      const a = proj(this.items[arc.a]);
      const b = proj(this.items[arc.b]);
      if (a.z < 0 || b.z < 0) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const lift = Math.hypot(a.x - b.x, a.y - b.y) * 0.45;
      const nx = mx + (mx - cx) * (lift / R);
      const ny = my + (my - cy) * (lift / R) - lift * 0.3;
      ctx.strokeStyle = rgba(o.warn, 0.45);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(nx, ny, b.x, b.y);
      ctx.stroke();
      const u = (this.time * 0.4 + arc.p) % 1;
      const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * nx + u * u * b.x;
      const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * ny + u * u * b.y;
      glow(ctx, x, y, 8, o.warn, 0.9);
      glow(ctx, a.x, a.y, 7, o.ok, 0.7);
      glow(ctx, b.x, b.y, 7, o.ok, 0.7);
    }
  }

  /** File cards travelling up (upload) and down (download) with progress bars. */
  draw_transfer(ctx, w, h, o, dt) {
    ctx.font = '12px system-ui, sans-serif';
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i];
      f.y += (f.up ? -1 : 1) * f.v * dt * 60;
      f.p = Math.min(1, f.p + dt * 0.12 * f.v);
      if (f.y < -80 || f.y > h + 80) this.files[i] = this.newFile(this.rand, i, false);
      const col = f.up ? o.ok : o.warn;
      const x = f.x;
      const y = f.y;
      ctx.fillStyle = rgba(o.bg, o.dark ? 0.55 : 0.7);
      ctx.strokeStyle = rgba(col, 0.6);
      ctx.lineWidth = 1.2;
      roundRect(ctx, x, y, 170, 46, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath();
      if (f.up) { ctx.moveTo(x + 18, y + 12); ctx.lineTo(x + 26, y + 22); ctx.lineTo(x + 10, y + 22); }
      else { ctx.moveTo(x + 18, y + 24); ctx.lineTo(x + 26, y + 14); ctx.lineTo(x + 10, y + 14); }
      ctx.fill();
      ctx.fillStyle = rgba(o.text, 0.85);
      ctx.fillText(f.name, x + 34, y + 21);
      ctx.fillStyle = rgba(o.text, 0.45);
      ctx.fillText(`${Math.round(f.size * f.p)} / ${f.size} KB`, x + 108, y + 21);
      ctx.fillStyle = rgba(o.text, 0.15);
      roundRect(ctx, x + 10, y + 31, 150, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = rgba(col, 0.85);
      roundRect(ctx, x + 10, y + 31, Math.max(5, 150 * f.p), 5, 2.5);
      ctx.fill();
    }
  }

  /** Circuit-board traces with pulses. */
  draw_circuit(ctx, w, h, o) {
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    for (const tr of this.traces) {
      ctx.strokeStyle = rgba(o.accent, o.dark ? 0.2 : 0.22);
      ctx.beginPath();
      tr.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      for (const [x, y] of [tr.pts[0], tr.pts[tr.pts.length - 1]]) {
        ctx.strokeStyle = rgba(o.accent, 0.45);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      let d = ((this.time * 120 * tr.rate) / tr.total + tr.phase) % 1 * tr.total;
      for (let i = 1; i < tr.pts.length; i++) {
        const [x0, y0] = tr.pts[i - 1];
        const [x1, y1] = tr.pts[i];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        if (d <= seg) {
          const k = d / seg;
          glow(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 10, tr.rate > 1 ? o.ok : o.accent, 0.9);
          break;
        }
        d -= seg;
      }
    }
  }

  /** Layered signal waves. */
  draw_waves(ctx, w, h, o) {
    const t = this.time;
    const layers = 6;
    for (let k = 0; k < layers; k++) {
      const col = mix(o.accent2, o.accent, k / (layers - 1));
      ctx.strokeStyle = rgba(col, 0.18 + (k / layers) * 0.35);
      ctx.lineWidth = 1.5 + k * 0.3;
      ctx.beginPath();
      const base = h * (0.3 + k * 0.09);
      for (let x = 0; x <= w; x += 8) {
        const y = base + Math.sin(x * 0.006 + t * (0.6 + k * 0.15) + k) * (24 + k * 6) + Math.sin(x * 0.017 - t * 1.3 + k * 2) * 10;
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Soft particles with constellation lines. */
  draw_particles(ctx, w, h, o, dt) {
    for (const p of this.items) {
      p.x += p.vx * dt * 20 + Math.sin(this.time * 0.5 + p.i) * 0.1;
      p.y += p.vy * dt * 20 - dt * 6 * p.a;
      if (p.y < -10) p.y = h + 10;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y > h + 10) p.y = -10;
    }
    ctx.lineWidth = 0.8;
    for (let i = 0; i < this.items.length; i++) {
      const a = this.items[i];
      for (let j = i + 1; j < this.items.length; j++) {
        const b = this.items[j];
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (d > 110) continue;
        ctx.strokeStyle = rgba(o.text, (1 - d / 110) * 0.12);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (const p of this.items) glow(ctx, p.x, p.y, 4 + p.b * 10, p.c > 0.7 ? o.accent : o.text, 0.25 + 0.3 * Math.sin(this.time * 2 + p.i) ** 2);
  }

  /** Slow aurora bands. */
  draw_aurora(ctx, w, h, o) {
    const t = this.time * 0.4;
    const cols = [o.accent, o.ok, o.accent2, o.warn];
    for (let k = 0; k < 4; k++) {
      const col = cols[k];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, o.dark ? 0.18 : 0.14));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) {
        const y = h * (0.35 + k * 0.08) + Math.sin(x * 0.004 + t * (1 + k * 0.2) + k * 1.7) * h * 0.12 + Math.sin(x * 0.011 - t * 1.6) * 18;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Hexagon cells: a diagonal wave of light, single cells flaring up. */
  draw_hexGrid(ctx, w, h, o, dt) {
    const s = this.hexR - 2;
    const t = this.time;
    if (this.rand() < dt * 8) { const hx = this.hexes[Math.floor(this.rand() * this.hexes.length)]; hx.lit = 1; hx.ok = this.rand() < 0.3; }
    ctx.lineWidth = 1;
    for (const hx of this.hexes) {
      hx.lit = Math.max(0, hx.lit - dt * 0.6);
      const wave = 0.5 + 0.5 * Math.sin((hx.x + hx.y) * 0.008 - t * 1.2);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const x = hx.x + Math.cos(a) * s;
        const y = hx.y + Math.sin(a) * s;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      if (hx.lit > 0) { ctx.fillStyle = rgba(hx.ok ? o.ok : o.accent, hx.lit * (o.dark ? 0.35 : 0.25)); ctx.fill(); }
      ctx.strokeStyle = rgba(o.accent, 0.06 + wave * (o.dark ? 0.16 : 0.14) + hx.lit * 0.5);
      ctx.stroke();
    }
  }

  /** A planet, satellites on tilted orbits beaming to ground stations. */
  draw_satellite(ctx, w, h, o) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.2;
    const t = this.time;
    glow(ctx, cx, cy, R * 1.7, o.accent2, o.dark ? 0.22 : 0.14);
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, rgba(mix(o.bg, o.accent, 0.45), 1));
    g.addColorStop(1, rgba(mix(o.bg, o.accent2, 0.2), 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(o.text, 0.12);
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + k * R * 0.33, R * Math.sqrt(1 - (k * 0.33) ** 2), R * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const stations = [];
    for (const st of this.stations) {
      const lon = st.lon + t * 0.15;
      if (Math.cos(st.lat) * Math.cos(lon) < 0.1) continue;
      const x = cx + Math.cos(st.lat) * Math.sin(lon) * R;
      const y = cy - Math.sin(st.lat) * R;
      stations.push([x, y]);
      glow(ctx, x, y, 7, o.ok, 0.8);
    }
    for (const sat of this.sats) {
      const orbit = sat.orbit * R;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sat.rot);
      ctx.strokeStyle = rgba(o.accent, 0.18);
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.ellipse(0, 0, orbit, orbit * sat.tilt, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      const a = sat.phase + t * sat.speed;
      const lx = Math.cos(a) * orbit;
      const ly = Math.sin(a) * orbit * sat.tilt;
      const x = cx + lx * Math.cos(sat.rot) - ly * Math.sin(sat.rot);
      const y = cy + lx * Math.sin(sat.rot) + ly * Math.cos(sat.rot);
      if (ly < 0 && Math.hypot(x - cx, y - cy) < R) continue;   // behind the planet
      if (stations.length) {
        let best = stations[0];
        for (const p of stations) if (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y)) best = p;
        const u = (t * 0.8 + sat.phase) % 1;
        ctx.strokeStyle = rgba(o.warn, 0.3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(best[0], best[1]);
        ctx.stroke();
        glow(ctx, x + (best[0] - x) * u, y + (best[1] - y) * u, 6, o.warn, 0.9);
      }
      glow(ctx, x, y, 12, o.accent, 0.35);
      ctx.fillStyle = rgba(o.accent, 0.8);
      ctx.fillRect(x - 13, y - 2, 8, 4);
      ctx.fillRect(x + 5, y - 2, 8, 4);
      ctx.fillStyle = rgba(o.text, 0.9);
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }

  /** Rings and packets rushing out of a tunnel. */
  draw_tunnel(ctx, w, h, o, dt) {
    const t = this.time;
    const cx = w / 2 + Math.sin(t * 0.3) * w * 0.05;
    const cy = h / 2 + Math.cos(t * 0.23) * h * 0.05;
    const maxR = Math.hypot(w, h) * 0.6;
    const ring = (rad, rot) => {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2 + rot;
        if (i) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = rgba(o.accent, 0.08);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
      ctx.stroke();
    }
    for (let k = 0; k < 14; k++) {
      const z = (k / 14 + t * 0.12) % 1;
      ctx.strokeStyle = rgba(k % 3 === 0 ? o.accent : o.accent2, z * (o.dark ? 0.45 : 0.35));
      ctx.lineWidth = 0.5 + z * 2.5;
      ring(z ** 2.2 * maxR, t * 0.1);
    }
    glow(ctx, cx, cy, 60, o.accent, 0.35);
    for (const p of this.items) {
      p.z += dt * (0.15 + p.c * 0.25);
      if (p.z > 1) { p.z -= 1; p.ang = this.rand() * Math.PI * 2; }
      const rad = p.z ** 2.2 * maxR * 0.95;
      glow(ctx, cx + Math.cos(p.ang) * rad, cy + Math.sin(p.ang) * rad, 2 + p.z * 9, p.c > 0.75 ? o.warn : o.ok, p.z * 0.9);
    }
  }

  /** Upload / download throughput scrolling by like a live graph. */
  draw_traffic(ctx, w, h, o, dt) {
    const step = 6;
    const n = Math.floor(w / step) + 1;
    const next = (arr, base, amp) => {
      const prev = arr.length ? arr[arr.length - 1] : base;
      const target = base + (this.rand() - 0.5) * amp * 2 + Math.sin(this.time * 0.6 + base * 10) * amp * 0.6;
      return Math.max(0.03, Math.min(0.97, prev * 0.8 + target * 0.2));
    };
    const push = () => { this.series[0].push(next(this.series[0], 0.58, 0.28)); this.series[1].push(next(this.series[1], 0.3, 0.2)); };
    while (this.series[0].length < n) push();
    this.scroll += dt * 40;
    while (this.scroll >= step) { this.scroll -= step; push(); }
    for (const s of this.series) if (s.length > n) s.splice(0, s.length - n);
    const top = h * 0.22;
    const H = h * 0.72;
    const off = this.scroll;
    ctx.strokeStyle = rgba(o.text, 0.07);
    ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k++) { const y = top + (H * k) / 6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = -((this.time * 40) % 60); x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + H); ctx.stroke(); }
    for (const [arr, col] of [[this.series[1], o.warn], [this.series[0], o.ok]]) {
      const g = ctx.createLinearGradient(0, top, 0, top + H);
      g.addColorStop(0, rgba(col, o.dark ? 0.35 : 0.25));
      g.addColorStop(1, rgba(col, 0));
      ctx.beginPath();
      ctx.moveTo(-off, top + H);
      arr.forEach((v, i) => ctx.lineTo(i * step - off, top + H * (1 - v)));
      ctx.lineTo((arr.length - 1) * step - off, top + H);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      arr.forEach((v, i) => { const x = i * step - off; const y = top + H * (1 - v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = rgba(col, 0.8);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      glow(ctx, (arr.length - 1) * step - off, top + H * (1 - arr[arr.length - 1]), 10, col, 0.9);
    }
  }

  /** Files travelling from the root of a shared folder tree to its leaves. */
  draw_folders(ctx, w, h, o, dt) {
    const N = this.nodes;
    const elbow = (p, nd) => { const mx = (p.x + nd.x) / 2; return [[p.x + 11, p.y], [mx, p.y], [mx, nd.y], [nd.x - 11, nd.y]]; };
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(o.accent, o.dark ? 0.25 : 0.3);
    for (const nd of N) {
      if (nd.parent < 0) continue;
      const pts = elbow(N[nd.parent], nd);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    if (this.leaves.length && this.rand() < dt * 3) {
      const leaf = this.leaves[Math.floor(this.rand() * this.leaves.length)];
      const chain = [];
      for (let i = leaf; N[i].parent >= 0; i = N[i].parent) chain.unshift(i);
      const pts = [];
      for (const i of chain) pts.push(...elbow(N[N[i].parent], N[i]));
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.flows.push({ pts, total, d: 0, leaf, up: this.rand() < 0.5 });
    }
    for (const f of this.flows) f.d += dt * 170;
    this.flows = this.flows.filter((f) => { if (f.d < f.total) return true; N[f.leaf].hit = 1; return false; });
    for (const f of this.flows) { const [x, y] = pointAt(f.pts, f.d); glow(ctx, x, y, 8, f.up ? o.ok : o.warn, 0.9); }
    for (const nd of N) {
      nd.hit = Math.max(0, nd.hit - dt * 1.2);
      if (nd.hit) glow(ctx, nd.x, nd.y, 22, o.ok, nd.hit * 0.6);
      if (nd.leaf) {
        ctx.strokeStyle = rgba(o.text, 0.55);
        ctx.lineWidth = 1.2;
        roundRect(ctx, nd.x - 6, nd.y - 8, 12, 16, 2);
        ctx.stroke();
      } else {
        const k = nd.depth ? 1 : 1.5;
        ctx.fillStyle = rgba(o.warn, o.dark ? 0.75 : 0.85);
        ctx.beginPath();
        ctx.moveTo(nd.x - 10 * k, nd.y - 7 * k);
        ctx.lineTo(nd.x - 3 * k, nd.y - 7 * k);
        ctx.lineTo(nd.x - 1 * k, nd.y - 5 * k);
        ctx.lineTo(nd.x + 10 * k, nd.y - 5 * k);
        ctx.lineTo(nd.x + 10 * k, nd.y + 7 * k);
        ctx.lineTo(nd.x - 10 * k, nd.y + 7 * k);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** Two servers keeping each other in sync over curved lanes. */
  draw_sync(ctx, w, h, o, dt) {
    const [L, R] = this.ends;
    const lanes = 6;
    const at = (lane, u) => [L.x + (R.x - L.x) * u, L.y + Math.sin(u * Math.PI) * (lane - (lanes - 1) / 2) * h * 0.09];
    ctx.strokeStyle = rgba(o.accent, 0.15);
    ctx.lineWidth = 1;
    for (let k = 0; k < lanes; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const [x, y] = at(k, i / 40); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    for (const p of this.items) {
      p.u += p.dir * dt * (0.08 + p.c * 0.12);
      if (p.u > 1 || p.u < 0) { (p.dir > 0 ? R : L).hit = 1; p.u = p.dir > 0 ? 0 : 1; }
      const [x, y] = at(p.lane, p.u);
      const col = p.dir > 0 ? o.ok : o.warn;
      glow(ctx, x, y, 7, col, 0.8);
      ctx.fillStyle = rgba(col, 1);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const s of this.ends) {
      s.hit = Math.max(0, s.hit - dt * 2);
      glow(ctx, s.x, s.y, 60 + s.hit * 30, o.accent, 0.25 + s.hit * 0.2);
      serverBox(ctx, s.x, s.y, o, this.time);
    }
  }

  /** Plain text flowing into a lock, cipher text flowing out; rings of hex digits turning. */
  draw_encryption(ctx, w, h, o, dt) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const t = this.time;
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ring = 0; ring < 3; ring++) {
      const rad = R * (0.32 + ring * 0.14);
      const count = Math.round((rad * 2 * Math.PI) / 18);
      const rot = t * (ring % 2 ? -0.15 : 0.2);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rot;
        ctx.fillStyle = rgba(o.accent, (o.dark ? 0.18 : 0.22) + 0.25 * Math.max(0, Math.sin(a * 3 + t * 2)));
        ctx.fillText(HEX[(i * 7 + ring * 3 + Math.floor(t * 2 + i)) % 16], cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
    }
    for (const p of this.items) {
      p.k += dt * (0.12 + p.c * 0.12);
      if (p.k > 2) { p.k = 0; p.ang = this.rand() * Math.PI * 2; }
      const inbound = p.k < 1;
      const d = inbound ? R * (1.25 - p.k * 0.95) : R * (0.3 + (p.k - 1) * 0.95);
      ctx.fillStyle = rgba(inbound ? o.text : o.ok, 0.75);
      ctx.fillText(inbound ? String.fromCharCode(65 + Math.floor(p.a * 26)) : HEX[Math.floor(p.b * 16)] + HEX[Math.floor(p.c * 16)], cx + Math.cos(p.ang) * d, cy + Math.sin(p.ang) * d);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    const s = Math.min(w, h) * 0.06;
    glow(ctx, cx, cy, s * 4, o.accent, 0.3 + (0.5 + 0.5 * Math.sin(t * 2)) * 0.15);
    ctx.lineWidth = s * 0.22;
    ctx.strokeStyle = rgba(o.accent, 0.95);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.6, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.6, cy - s * 0.35);
    ctx.arc(cx, cy - s * 0.35, s * 0.6, Math.PI, 0);
    ctx.lineTo(cx + s * 0.6, cy + s * 0.1);
    ctx.stroke();
    ctx.fillStyle = rgba(o.accent, 0.95);
    roundRect(ctx, cx - s, cy, s * 2, s * 1.5, s * 0.2);
    ctx.fill();
    ctx.fillStyle = rgba(o.bg, 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.6, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Stars streaking past at light speed. */
  draw_warp(ctx, w, h, o, dt) {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) / 2;
    glow(ctx, cx, cy, 90, o.accent2, 0.25);
    ctx.lineCap = 'round';
    for (const p of this.items) {
      p.d = p.d * (1 + dt * 0.9 * p.v) + dt * 0.01;
      if (p.d > 1.05) { this.newStar(p, this.rand, false); continue; }
      const r1 = p.d ** 1.6 * maxR;
      const r0 = Math.max(0, r1 - (4 + 90 * p.d * p.d) * p.v);
      const c = Math.cos(p.ang);
      const s = Math.sin(p.ang);
      ctx.strokeStyle = rgba(p.c > 0.85 ? o.accent : p.c > 0.7 ? o.warn : o.text, Math.min(1, p.d * 1.4) * (o.dark ? 0.9 : 0.7));
      ctx.lineWidth = 0.6 + p.d * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + c * r0, cy + s * r0);
      ctx.lineTo(cx + c * r1, cy + s * r1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** A wireframe landscape flowing toward the viewer. */
  draw_terrain(ctx, w, h, o) {
    const t = this.time;
    const horizon = h * 0.38;
    const X = 14;
    const rows = 22;
    const camH = 2.2;
    const z0 = t * 0.8;
    const frac = z0 % 1;
    const height = (x, z) => Math.sin(x * 0.9 + z * 0.7) * 0.5 + Math.sin(x * 0.37 - z * 1.3) * 0.35 + Math.sin(z * 0.45) * 0.3;
    const P = (x, z) => { const y = height(x * 0.6, (z + z0) * 0.6) * 1.1; return [w / 2 + (x / z) * w * 0.55, horizon + ((camH - y) / z) * h * 0.55]; };
    glow(ctx, w / 2, horizon - 20, Math.min(w, h) * 0.3, o.warn, o.dark ? 0.25 : 0.18);
    ctx.lineWidth = 1;
    for (let i = rows; i >= 0; i--) {
      const z = 1 + i - frac;
      ctx.strokeStyle = rgba(o.accent, (1 - i / rows) * (o.dark ? 0.5 : 0.4));
      ctx.beginPath();
      for (let x = -X; x <= X; x++) { const [sx, sy] = P(x, z); if (x === -X) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(o.accent2, o.dark ? 0.25 : 0.2);
    for (let x = -X; x <= X; x++) {
      ctx.beginPath();
      for (let i = rows; i >= 0; i--) { const [sx, sy] = P(x, Math.max(0.6, 1 + i - frac)); if (i === rows) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); }
      ctx.stroke();
    }
  }

  /** Light pulses racing along a bundle of optical fibres. */
  draw_fiber(ctx, w, h, o) {
    const t = this.time;
    const cols = [o.accent, o.accent2, o.ok];
    for (const s of this.strands) {
      const m = h * 0.5 + Math.sin(t * 0.4 + s.phase * 6) * h * 0.04;
      const p = [[-20, s.y0], [w * 0.35, m + (s.y0 - h * 0.5) * 0.22], [w * 0.65, m + (s.y1 - h * 0.5) * 0.22], [w + 20, s.y1]];
      const col = cols[s.col];
      ctx.strokeStyle = rgba(col, o.dark ? 0.22 : 0.25);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
      ctx.stroke();
      for (let k = 0; k < s.n; k++) {
        const u = (t * s.speed + s.phase + k / s.n) % 1;
        const [x, y] = bez(p, u);
        glow(ctx, x, y, 12, col, 0.85);
        for (let j = 1; j < 6; j++) {
          const uu = u - j * 0.008;
          if (uu < 0) break;
          const [tx, ty] = bez(p, uu);
          ctx.fillStyle = rgba(col, 0.5 * (1 - j / 6));
          ctx.beginPath();
          ctx.arc(tx, ty, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** Radio waves spreading from transmitter towers. */
  draw_broadcast(ctx, w, h, o) {
    const t = this.time;
    ctx.strokeStyle = rgba(o.accent, 0.15);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.93);
    ctx.lineTo(w, h * 0.93);
    ctx.stroke();
    for (const tw of this.towers) {
      const topY = tw.y - 60;
      for (let k = 0; k < 5; k++) {
        const u = (t * tw.rate * 0.25 + tw.phase + k / 5) % 1;
        ctx.strokeStyle = rgba(k % 2 ? o.accent : o.accent2, (1 - u) * (o.dark ? 0.45 : 0.35));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tw.x, topY, u * Math.min(w, h) * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(o.text, 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tw.x - 18, tw.y); ctx.lineTo(tw.x, topY); ctx.lineTo(tw.x + 18, tw.y);
      ctx.moveTo(tw.x - 12, tw.y - 20); ctx.lineTo(tw.x + 12, tw.y - 20);
      ctx.moveTo(tw.x - 6, tw.y - 40); ctx.lineTo(tw.x + 6, tw.y - 40);
      ctx.moveTo(tw.x - 12, tw.y - 20); ctx.lineTo(tw.x + 6, tw.y - 40);
      ctx.moveTo(tw.x + 12, tw.y - 20); ctx.lineTo(tw.x - 6, tw.y - 40);
      ctx.stroke();
      glow(ctx, tw.x, topY - 2, 10, o.danger, 0.4 + (0.5 + 0.5 * Math.sin(t * 4 + tw.phase * 9)) * 0.5);
    }
  }
}
