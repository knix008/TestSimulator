// Moving backgrounds for the start page. The engine is MyHeatManager's
// (src/ui/background.js): one canvas, 30 frames a second with a speed factor,
// paused while the window is hidden, devicePixelRatio aware, soft glowing
// shapes drawn from the theme's bg / accent / text colours (dark and light
// aware). The 20 kinds are about code and its analysis.

export const ANIMATION_KINDS = ['particles', 'codeRain', 'binary', 'scanLine', 'bugHunt', 'depGraph', 'callPulse', 'astTree', 'controlFlow', 'taint',
  'radar', 'hexGrid', 'circuit', 'constellation', 'gateLights', 'commitGraph', 'terminal', 'spectrum', 'heatCells', 'brackets'];

/** Icon names (components/Chrome.jsx) for the kinds. */
export const ANIMATION_ICONS = {
  particles: 'circleDot', codeRain: 'code', binary: 'hash', scanLine: 'search', bugHunt: 'bug', depGraph: 'link', callPulse: 'flow', astTree: 'tree', controlFlow: 'branch', taint: 'drop',
  radar: 'target', hexGrid: 'grid', circuit: 'cpu', constellation: 'star', gateLights: 'gate', commitGraph: 'history', terminal: 'terminal', spectrum: 'chart', heatCells: 'layers', brackets: 'code',
};

export const DEFAULT_START_BACKGROUND = { kind: 'particles', speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null };

const FRAME_MS = 1000 / 30;
const GLYPHS = '{}()[];=<>+-*/&|!?:.,01abcdefxyzconstletreturnifforwhile#$%'.split('');
const WORDS = ['const x = scan(src);', 'if (issue.isNew) {', 'return gate.ok;', 'for (f of files)', 'analyze --branch main', '$ mcc scan .', 'fix(rule, line)', 'git commit -m "fix"', 'assert(x != null);', 'while (queue.length)'];

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

export class AnimatedBackground {
  /** colors(): see themeColors(); speed(): factor (1 = normal). */
  constructor(canvas, { colors = themeColors, speed = () => 1, kind = 'particles' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = colors;
    this.palette = colors();
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'particles';
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
    this.palette = this.colors();
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
    const n = { particles: 110, codeRain: Math.ceil(w / 16), binary: Math.ceil(h / 22), scanLine: Math.ceil(h / 22), bugHunt: 26, depGraph: 64, callPulse: 22, constellation: 90, brackets: 40, terminal: 0, taint: 5 }[this.kind] || 0;
    this.items = Array.from({ length: n }, (_, i) => ({ x: r() * w, y: r() * h, a: r(), b: r(), c: r(), i }));
    if (this.kind === 'codeRain') this.items.forEach((p, i) => { p.x = i * 16 + 4; p.y = -r() * h; p.chars = Array.from({ length: 22 }, () => GLYPHS[Math.floor(r() * GLYPHS.length)]); });
    if (this.kind === 'binary') this.items.forEach((p, i) => { p.y = 12 + i * 22; p.bits = Array.from({ length: Math.ceil(w / 12) + 4 }, () => (r() < 0.5 ? '0' : '1')); p.dir = r() < 0.5 ? -1 : 1; });
    if (this.kind === 'scanLine') this.items.forEach((p, i) => { p.y = 24 + i * 22; p.len = 0.15 + r() * 0.55; p.indent = Math.floor(r() * 4); p.bug = r() < 0.14; });
    if (this.kind === 'bugHunt') this.items.forEach((p) => { p.caught = 0; });
    if (this.kind === 'callPulse' || this.kind === 'depGraph' || this.kind === 'constellation') this.buildEdges(r);
    if (this.kind === 'circuit') this.buildCircuit(r);
    if (this.kind === 'astTree') this.tree = null;
    if (this.kind === 'commitGraph') this.commits = Array.from({ length: 40 }, (_, i) => ({ lane: Math.floor(r() * 5), y: i * 38, merge: r() < 0.25, from: Math.floor(r() * 5) }));
    if (this.kind === 'terminal') this.term = { lines: [], typed: 0, word: 0 };
    if (this.kind === 'taint') this.items.forEach((p, i) => { p.y = h * (0.18 + i * 0.16); p.phase = r(); });
    if (this.kind === 'hexGrid') this.hexes = [];
  }

  buildEdges(r) {
    const pts = this.items;
    this.edges = [];
    for (let i = 0; i < pts.length; i++) {
      const near = pts.map((q, j) => [j, (q.x - pts[i].x) ** 2 + (q.y - pts[i].y) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of near) if (!this.edges.some((e) => (e.a === j && e.b === i))) this.edges.push({ a: i, b: j, phase: r(), speed: 0.2 + r() * 0.4 });
    }
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

  // ── the backgrounds ──────────────────────────────────

  particles(ctx, w, h, dt, o) {
    // MyHeatManager's default: drifting dots, linked when close.
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

  codeRain(ctx, w, h, dt, o) {
    ctx.font = '13px Consolas, "Cascadia Mono", monospace';
    ctx.textBaseline = 'top';
    for (const p of this.items) {
      p.y += (36 + 70 * p.a) * dt;
      if (p.y - p.chars.length * 16 > h) p.y = -p.b * h * 0.4;
      for (let k = 0; k < p.chars.length; k++) {
        const y = p.y - k * 16;
        if (y < -16 || y > h) continue;
        ctx.fillStyle = k === 0 ? rgba(o.text, 0.8 * o.strength) : rgba(mix(o.accent, o.ok, p.c), 0.5 * (1 - k / p.chars.length) * o.strength);
        if (((this.frames + k * 7 + p.i) % 41) === 0) p.chars[k] = GLYPHS[(p.i + k + this.frames) % GLYPHS.length];
        ctx.fillText(p.chars[k], p.x, y);
      }
    }
  }

  binary(ctx, w, h, dt, o) {
    ctx.font = '12px Consolas, monospace';
    ctx.textBaseline = 'middle';
    const t = this.time;
    for (const p of this.items) {
      const off = ((t * (30 + 50 * p.a) * p.dir) % 12 + 12) % 12;
      const fade = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.7 + p.b * 6));
      for (let k = 0; k < p.bits.length; k++) {
        const x = k * 12 - 24 + off * p.dir;
        const pulse = Math.abs(((t * 0.25 + p.c) % 1) * p.bits.length - k) < 3;
        ctx.fillStyle = pulse ? rgba(o.accent, 0.9 * o.strength) : rgba(o.text, fade * o.strength);
        ctx.fillText(p.bits[k], x, p.y);
      }
    }
  }

  scanLine(ctx, w, h, dt, o) {
    // Code lines and a magnifier sweeping them; lines with an issue light up red once read.
    const t = this.time;
    const beam = ((t * 0.12) % 1.15) * h - h * 0.05;
    const left = Math.max(40, w * 0.12);
    for (const p of this.items) {
      const x = left + p.indent * 26;
      const len = (w - left * 2) * p.len;
      const hit = p.bug && beam > p.y;
      const near = Math.max(0, 1 - Math.abs(p.y - beam) / 50);
      ctx.fillStyle = hit ? rgba(o.danger, 0.55 * o.strength) : rgba(o.text, (0.08 + 0.22 * near) * o.strength);
      ctx.fillRect(x, p.y, len, 5);
      if (hit) glow(ctx, x - 12, p.y + 2, 9, o.danger, 0.7 * o.strength);
    }
    const mx = w / 2 + Math.sin(t * 0.9) * w * 0.28;
    glow(ctx, mx, beam, 90, o.accent, 0.18 * o.strength);
    ctx.strokeStyle = rgba(o.accent, 0.8 * o.strength);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, beam, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + 24, beam + 24); ctx.lineTo(mx + 52, beam + 52); ctx.stroke();
    ctx.lineWidth = 1;
  }

  bugHunt(ctx, w, h, dt, o) {
    // Red bugs wander; a hunter dot sweeps by and turns them into green checks, which fade and respawn.
    const t = this.time;
    const hx = w / 2 + Math.cos(t * 0.35) * w * 0.38;
    const hy = h / 2 + Math.sin(t * 0.52) * h * 0.36;
    glow(ctx, hx, hy, 70, o.accent, 0.3 * o.strength);
    ctx.fillStyle = rgba(o.accent, 0.9 * o.strength);
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
    for (const p of this.items) {
      if (p.caught > 0) {
        p.caught -= dt * 0.4;
        if (p.caught <= 0) { p.x = this.rand() * w; p.y = this.rand() * h; }
        const a = Math.min(1, p.caught) * o.strength;
        ctx.strokeStyle = rgba(o.ok, a);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x - 2, p.y + 6); ctx.lineTo(p.x + 8, p.y - 6); ctx.stroke();
        ctx.lineWidth = 1;
        continue;
      }
      p.x += Math.cos(t * (0.8 + p.a) + p.b * 10) * 20 * dt;
      p.y += Math.sin(t * (0.7 + p.c) + p.a * 10) * 20 * dt;
      if ((p.x - hx) ** 2 + (p.y - hy) ** 2 < 900) p.caught = 2;
      glow(ctx, p.x, p.y, 12, o.danger, 0.45 * o.strength);
      ctx.fillStyle = rgba(o.danger, 0.85 * o.strength);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(o.danger, 0.6 * o.strength);
      ctx.beginPath();
      for (const s of [-1, 1]) { ctx.moveTo(p.x + s * 3, p.y - 2); ctx.lineTo(p.x + s * 8, p.y - 5); ctx.moveTo(p.x + s * 3, p.y + 2); ctx.lineTo(p.x + s * 8, p.y + 5); }
      ctx.stroke();
    }
  }

  depGraph(ctx, w, h, dt, o) {
    const t = this.time;
    for (const p of this.items) {
      p.x += Math.cos(p.a * 6.28 + t * 0.15) * 10 * dt;
      p.y += Math.sin(p.b * 6.28 + t * 0.12) * 10 * dt;
      if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
    }
    ctx.lineWidth = 1;
    for (const e of this.edges) {
      const a = this.items[e.a]; const b = this.items[e.b];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > Math.max(w, h) * 0.35) continue;
      ctx.strokeStyle = rgba(o.accent, 0.22 * o.strength);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // arrow head at b
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.fillStyle = rgba(o.accent, 0.3 * o.strength);
      ctx.beginPath(); ctx.moveTo(b.x - Math.cos(ang) * 8, b.y - Math.sin(ang) * 8);
      ctx.lineTo(b.x - Math.cos(ang - 0.4) * 16, b.y - Math.sin(ang - 0.4) * 16);
      ctx.lineTo(b.x - Math.cos(ang + 0.4) * 16, b.y - Math.sin(ang + 0.4) * 16); ctx.fill();
    }
    for (const p of this.items) {
      const cyc = p.c < 0.07;
      glow(ctx, p.x, p.y, 14, cyc ? o.danger : o.accent2, 0.35 * o.strength);
      ctx.fillStyle = rgba(cyc ? o.danger : mix(o.accent, o.accent2, p.b), 0.85 * o.strength);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 2.5 * p.a, 0, Math.PI * 2); ctx.fill();
    }
  }

  callPulse(ctx, w, h, dt, o) {
    // A fixed call graph; pulses travel caller → callee.
    const t = this.time;
    ctx.lineWidth = 1.2;
    for (const e of this.edges) {
      const a = this.items[e.a]; const b = this.items[e.b];
      ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const f = (t * e.speed + e.phase) % 1;
      glow(ctx, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 10, o.accent, 0.75 * o.strength);
    }
    for (const p of this.items) {
      const beat = 0.5 + 0.5 * Math.sin(t * 2 + p.a * 6);
      glow(ctx, p.x, p.y, 18 + 8 * beat, o.accent2, 0.25 * o.strength);
      ctx.strokeStyle = rgba(o.accent, 0.7 * o.strength);
      ctx.fillStyle = rgba(o.bg, 0.9);
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  astTree(ctx, w, h, dt, o) {
    // An abstract syntax tree growing from the root; it starts over when full.
    if (!this.tree || this.tree.age > 14) {
      const r = random(Math.floor(this.time * 10) + 7);
      const nodes = [{ x: w / 2, y: 50, d: 0, p: -1, born: 0 }];
      for (let i = 1; i < 90; i++) {
        const parent = nodes[Math.floor(r() * nodes.length)];
        if (parent.d > 6) continue;
        const kids = nodes.filter((n) => n.p === nodes.indexOf(parent)).length;
        if (kids > 2) continue;
        const spread = w / (2.6 ** (parent.d + 1));
        nodes.push({ x: Math.max(20, Math.min(w - 20, parent.x + (r() - 0.5) * spread * 2.2)), y: parent.y + 70 + r() * 20, d: parent.d + 1, p: nodes.indexOf(parent), born: 0.3 + nodes.length * 0.12 });
      }
      this.tree = { nodes, age: 0 };
    }
    const tr = this.tree;
    tr.age += dt;
    ctx.lineWidth = 1.5;
    tr.nodes.forEach((n) => {
      const k = Math.max(0, Math.min(1, (tr.age - n.born) / 0.6));
      if (k <= 0) return;
      if (n.p >= 0) {
        const p = tr.nodes[n.p];
        ctx.strokeStyle = rgba(o.accent, 0.35 * o.strength);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (n.x - p.x) * k, p.y + (n.y - p.y) * k); ctx.stroke();
      }
      if (k >= 1) {
        glow(ctx, n.x, n.y, 12, n.d % 2 ? o.accent2 : o.accent, 0.35 * o.strength);
        ctx.fillStyle = rgba(n.d % 2 ? o.accent2 : o.accent, 0.85 * o.strength);
        ctx.fillRect(n.x - 5, n.y - 5, 10, 10);
      }
    });
    const fade = tr.age > 12 ? (tr.age - 12) / 2 : 0;
    if (fade > 0) { ctx.fillStyle = rgba(o.bg, Math.min(1, fade)); ctx.fillRect(0, 0, w, h); }
    ctx.lineWidth = 1;
  }

  controlFlow(ctx, w, h, dt, o) {
    // Basic blocks in columns with branches and a back edge; a token walks the paths.
    const t = this.time;
    const cols = Math.max(3, Math.floor(w / 260));
    ctx.lineWidth = 1.4;
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * (w / cols);
      const blocks = [0.15, 0.35, 0.55, 0.75, 0.92].map((f, i) => ({ x: cx + (i === 2 ? (c % 2 ? 60 : -60) : 0), y: h * f }));
      ctx.strokeStyle = rgba(o.text, 0.16 * o.strength);
      for (let i = 0; i + 1 < blocks.length; i++) { ctx.beginPath(); ctx.moveTo(blocks[i].x, blocks[i].y + 14); ctx.lineTo(blocks[i + 1].x, blocks[i + 1].y - 14); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(blocks[1].x, blocks[1].y + 14); ctx.lineTo(blocks[3].x, blocks[3].y - 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(blocks[3].x + 40, blocks[3].y); ctx.bezierCurveTo(cx + 140, blocks[3].y, cx + 140, blocks[1].y, blocks[1].x + 40, blocks[1].y); ctx.stroke();
      for (const b of blocks) {
        ctx.fillStyle = rgba(o.accent2, 0.12 * o.strength);
        ctx.strokeStyle = rgba(o.accent, 0.45 * o.strength);
        ctx.fillRect(b.x - 40, b.y - 14, 80, 28); ctx.strokeRect(b.x - 40, b.y - 14, 80, 28);
      }
      const seg = ((t * 0.5 + c * 0.37) % 1) * (blocks.length - 1);
      const i = Math.floor(seg); const f = seg - i;
      const a = blocks[i]; const b = blocks[i + 1];
      glow(ctx, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 14, o.accent, 0.9 * o.strength);
    }
    ctx.lineWidth = 1;
  }

  taint(ctx, w, h, dt, o) {
    // Data flow: tainted values travel from a source (green) to a sink (red) along curved paths.
    const t = this.time;
    for (const p of this.items) {
      const y = p.y;
      const path = (f) => [w * 0.08 + f * w * 0.84, y + Math.sin(f * Math.PI * 2 + p.phase * 6) * h * 0.06];
      ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const [x, yy] = path(k / 40); if (k) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
      ctx.stroke();
      const [sx, sy] = path(0); const [ex, ey] = path(1);
      glow(ctx, sx, sy, 22, o.ok, 0.5 * o.strength);
      glow(ctx, ex, ey, 22, o.danger, 0.5 * o.strength);
      for (let k = 0; k < 6; k++) {
        const f = ((t * 0.12 + p.phase + k / 6) % 1);
        const [x, yy] = path(f);
        glow(ctx, x, yy, 8, mix(o.ok, o.danger, f), 0.85 * o.strength);
      }
    }
    ctx.lineWidth = 1;
  }

  radar(ctx, w, h, dt, o) {
    const t = this.time;
    const cx = w / 2; const cy = h / 2;
    const R = Math.hypot(w, h) * 0.45;
    ctx.strokeStyle = rgba(o.accent, 0.12 * o.strength);
    for (let k = 1; k <= 5; k++) { ctx.beginPath(); ctx.arc(cx, cy, (R * k) / 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    const ang = (t * 0.6) % (Math.PI * 2);
    for (let k = 0; k < 24; k++) {
      ctx.fillStyle = rgba(o.accent, (0.16 - k * 0.006) * o.strength);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, ang - (k + 1) * 0.03, ang - k * 0.03); ctx.fill();
    }
    const r = random(5);
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2; const d = (0.15 + r() * 0.8) * R;
      const since = ((ang - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const v = Math.max(0, 1 - since / 2.5);
      glow(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 10, k % 6 === 0 ? o.danger : o.accent, v * 0.9 * o.strength);
    }
  }

  hexGrid(ctx, w, h, dt, o) {
    const t = this.time;
    const s = 26;
    const hw = Math.sqrt(3) * s;
    ctx.lineWidth = 1;
    for (let row = -1; row * s * 1.5 < h + s; row++) {
      for (let col = -1; col * hw < w + hw; col++) {
        const x = col * hw + (row % 2 ? hw / 2 : 0);
        const y = row * s * 1.5;
        const v = Math.max(0, Math.sin(t * 0.8 + col * 0.45 + row * 0.7) * Math.sin(t * 0.33 + col * 0.21 - row * 0.3));
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const px = x + Math.cos(a) * (s - 2); const py = y + Math.sin(a) * (s - 2); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath();
        ctx.strokeStyle = rgba(o.accent, (0.08 + 0.25 * v) * o.strength);
        ctx.stroke();
        if (v > 0.55) { ctx.fillStyle = rgba(v > 0.85 ? o.warn : o.accent, (v - 0.5) * 0.5 * o.strength); ctx.fill(); }
      }
    }
  }

  circuit(ctx, w, h, dt, o) {
    const t = this.time;
    ctx.lineWidth = 2;
    for (const trace of this.traces) {
      ctx.strokeStyle = rgba(o.accent, 0.18 * o.strength);
      ctx.beginPath();
      trace.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      const segs = trace.points.length - 1;
      const pos = ((t * trace.speed + trace.phase) % 1) * segs;
      const i = Math.floor(pos);
      const f = pos - i;
      const [x0, y0] = trace.points[i];
      const [x1, y1] = trace.points[i + 1];
      glow(ctx, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 12, o.accent, 0.9 * o.strength);
    }
    for (const chip of this.chips) {
      const v = 0.5 + 0.45 * Math.sin(t * 0.8 + chip.p * 6);
      ctx.fillStyle = rgba(o.accent2, 0.1 + 0.15 * v * o.strength);
      ctx.strokeStyle = rgba(o.text, 0.2);
      ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
      ctx.strokeRect(chip.x + 0.5, chip.y + 0.5, chip.w, chip.h);
    }
    ctx.lineWidth = 1;
  }

  constellation(ctx, w, h, dt, o) {
    const t = this.time;
    const shown = Math.floor((t * 3) % (this.edges.length + 30));
    ctx.strokeStyle = rgba(o.accent, 0.3 * o.strength);
    ctx.beginPath();
    this.edges.slice(0, shown).forEach((e) => { const a = this.items[e.a]; const b = this.items[e.b]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); });
    ctx.stroke();
    for (const p of this.items) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + p.a) + p.b * 10));
      glow(ctx, p.x, p.y, 6 + 6 * p.c, mix(o.accent, o.text, 0.4), tw * 0.6 * o.strength);
      ctx.fillStyle = rgba(o.text, tw * 0.8 * o.strength);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + p.c, 0, Math.PI * 2); ctx.fill();
    }
  }

  gateLights(ctx, w, h, dt, o) {
    // Quality gate traffic lights: each turns red → amber → green at its own pace.
    const t = this.time;
    const cols = Math.max(4, Math.floor(w / 120));
    const rows = Math.max(3, Math.floor(h / 170));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * (w / cols);
        const y = (r + 0.5) * (h / rows);
        const phase = Math.floor((t * 0.35 + c * 0.37 + r * 0.61) % 3);
        ctx.fillStyle = rgba(o.text, 0.06 * o.strength);
        ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 16, y - 46, 32, 92, 10) : ctx.rect(x - 16, y - 46, 32, 92); ctx.fill(); ctx.stroke();
        [o.danger, o.warn, o.ok].forEach((col, k) => {
          const on = k === phase;
          if (on) glow(ctx, x, y - 28 + k * 28, 26, col, 0.5 * o.strength);
          ctx.fillStyle = rgba(col, (on ? 0.95 : 0.15) * o.strength);
          ctx.beginPath(); ctx.arc(x, y - 28 + k * 28, 9, 0, Math.PI * 2); ctx.fill();
        });
      }
    }
  }

  commitGraph(ctx, w, h, dt, o) {
    // Branch lanes scrolling up with commits and merges.
    const t = this.time;
    const lanes = 5;
    const lx = (k) => w * 0.2 + (k * w * 0.6) / (lanes - 1);
    const colors = [o.accent, o.ok, o.warn, o.accent2, o.danger];
    const scroll = (t * 28) % 38;
    ctx.lineWidth = 3;
    for (let k = 0; k < lanes; k++) {
      ctx.strokeStyle = rgba(colors[k], 0.25 * o.strength);
      ctx.beginPath(); ctx.moveTo(lx(k), 0); ctx.lineTo(lx(k), h); ctx.stroke();
    }
    const n = Math.ceil(h / 38) + 2;
    for (let i = 0; i < n; i++) {
      const cm = this.commits[(i + Math.floor(t * 28 / 38)) % this.commits.length];
      const y = h - (i * 38 + scroll);
      const x = lx(cm.lane);
      if (cm.merge && cm.from !== cm.lane) {
        ctx.strokeStyle = rgba(colors[cm.from], 0.45 * o.strength);
        ctx.beginPath(); ctx.moveTo(lx(cm.from), y + 38); ctx.bezierCurveTo(lx(cm.from), y + 14, x, y + 24, x, y); ctx.stroke();
      }
      glow(ctx, x, y, 14, colors[cm.lane], 0.4 * o.strength);
      ctx.fillStyle = rgba(o.bg, 1);
      ctx.strokeStyle = rgba(colors[cm.lane], 0.9 * o.strength);
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  terminal(ctx, w, h, dt, o) {
    const term = this.term;
    const lineH = 22;
    term.typed += dt * 18;
    const word = WORDS[term.word % WORDS.length];
    if (term.typed > word.length + 12) { term.lines.push(word); term.typed = 0; term.word += 1; }
    const maxLines = Math.floor((h - 80) / lineH);
    while (term.lines.length > maxLines) term.lines.shift();
    ctx.font = '15px Consolas, "Cascadia Mono", monospace';
    ctx.textBaseline = 'middle';
    const x0 = Math.max(40, w * 0.1);
    term.lines.forEach((l, i) => {
      ctx.fillStyle = rgba(o.ok, 0.45 * o.strength);
      ctx.fillText('›', x0, 50 + i * lineH);
      ctx.fillStyle = rgba(o.text, (0.18 + 0.5 * (i / Math.max(1, term.lines.length))) * o.strength);
      ctx.fillText(l, x0 + 18, 50 + i * lineH);
    });
    const y = 50 + term.lines.length * lineH;
    const shown = word.slice(0, Math.floor(term.typed));
    ctx.fillStyle = rgba(o.ok, 0.7 * o.strength);
    ctx.fillText('›', x0, y);
    ctx.fillStyle = rgba(o.text, 0.85 * o.strength);
    ctx.fillText(shown, x0 + 18, y);
    if (Math.floor(this.time * 2) % 2 === 0) {
      const cw = ctx.measureText(shown).width;
      ctx.fillStyle = rgba(o.accent, 0.9 * o.strength);
      ctx.fillRect(x0 + 20 + cw, y - 9, 9, 18);
    }
  }

  spectrum(ctx, w, h, dt, o) {
    // Measures as bars rising and falling (MyHeat's thermometer bars, in the accent colours).
    const t = this.time;
    const n = Math.max(14, Math.floor(w / 40));
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = 0.45 + 0.32 * Math.sin(t * 0.8 + i * 0.5) + 0.15 * Math.sin(t * 2.1 + i * 1.7);
      const bh = h * 0.7 * v;
      const x = i * bw + bw * 0.22;
      const g = ctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, rgba(o.accent2, 0.15 * o.strength));
      g.addColorStop(1, rgba(v > 0.85 ? o.danger : o.accent, 0.5 * o.strength));
      ctx.fillStyle = g;
      ctx.fillRect(x, h - bh, bw * 0.56, bh);
      glow(ctx, x + bw * 0.28, h - bh, bw * 0.4, v > 0.85 ? o.danger : o.accent, 0.5 * o.strength);
    }
  }

  heatCells(ctx, w, h, dt, o) {
    // A heat map of issue density: soft cells from a few moving hot spots.
    const t = this.time * 0.35;
    const spots = [0, 1, 2, 3, 4].map((i) => [w * (0.5 + 0.38 * Math.sin(t * (0.6 + i * 0.13) + i * 2)), h * (0.5 + 0.38 * Math.cos(t * (0.5 + i * 0.11) + i))]);
    const step = 28;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        let v = 0;
        for (const [sx, sy] of spots) v += Math.exp(-(((x - sx) ** 2 + (y - sy) ** 2) / (2 * (w * 0.13) ** 2)));
        v = Math.min(1, v * 0.85);
        const col = v < 0.5 ? mix(o.accent2, o.accent, v * 2) : mix(o.warn, o.danger, (v - 0.5) * 2);
        ctx.fillStyle = rgba(col, (0.06 + 0.36 * v) * o.strength);
        ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
      }
    }
  }

  brackets(ctx, w, h, dt, o) {
    const t = this.time;
    const marks = ['{ }', '< >', '( )', '[ ]', '</>', '=>', '&&', '//'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.items) {
      p.y -= (8 + 16 * p.a) * dt;
      p.x += Math.sin(t * 0.5 + p.b * 10) * 6 * dt;
      if (p.y < -40) { p.y = h + 40; p.x = p.b * w; }
      const size = 14 + 26 * p.c;
      ctx.font = `${size}px Consolas, monospace`;
      ctx.fillStyle = rgba(mix(o.accent, o.text, p.a * 0.5), (0.12 + 0.28 * p.c) * o.strength);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.sin(t * 0.3 + p.a * 6) * 0.3);
      ctx.fillText(marks[p.i % marks.length], 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'start';
  }
}
