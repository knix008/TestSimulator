// Moving backgrounds for the start screen, in the way MyDiagram and MyZipMaster do them: one canvas, 30 frames a second, the
// theme's colours, paused while the window is hidden. Twenty pictures, the first six drawn for a 3D program.

export const ANIMATIONS = ['wirecubes', 'floorgrid', 'nodegraph', 'meshwave', 'keyframes', 'raytrace', 'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'starfield', 'snow', 'fireflies', 'ripples', 'hexagons', 'orbits', 'lava', 'ribbons'];
export const ANIMATION_KINDS = ANIMATIONS;

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

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

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'wirecubes', vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'wirecubes';
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
    const count = {
      particles: 90, constellation: 70, bubbles: 40, starfield: 220, snow: 120, fireflies: 45,
      ripples: 7, orbits: 8, lava: 7, wirecubes: 14, nodegraph: 9, keyframes: 7, raytrace: 18,
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
    // Broad washes (aurora, waves, lava) are strong already; lines and dots need the most help.
    const kindBoost = { aurora: 0.75, waves: 0.7, lava: 0.8, gridflow: 0.85 }[this.kind] ?? 1;
    BOOST = this.vivid ? (colors.dark ? 2.3 : 2.9) * kindBoost : 1;
    SIZE = this.vivid ? 1.6 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
  }






  /** Wireframe cubes turning as they float. */
  wirecubes(c, w, h, time, colors) {
    const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    c.lineWidth = Math.max(1, w / 900) * SIZE;
    for (const it of this.items) {
      const size = (0.03 + it.s * 0.07) * Math.min(w, h) * 1.3;
      const [a, b] = [time * (0.2 + it.v * 0.5) + it.h * 6, time * (0.15 + it.s * 0.4) + it.x * 6];
      const [cx, cy] = [it.x * w + Math.sin(time * 0.1 + it.h * 6) * w * 0.02, ((it.y - time * 0.008 * (0.5 + it.v)) % 1 + 1) % 1 * h];
      const pts = corners.map(([x, y, z]) => {
        const [x1, z1] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
        const [y1, z2] = [y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)];
        const k = 3 / (3 + z2 * 0.5);
        return [cx + x1 * size * k, cy + y1 * size * k];
      });
      c.strokeStyle = rgba(it.h > 0.5 ? colors.accent : colors.text, 0.22);
      c.beginPath();
      for (const [p, q] of edges) { c.moveTo(pts[p][0], pts[p][1]); c.lineTo(pts[q][0], pts[q][1]); }
      c.stroke();
    }
  }

  /** The endless grid of a 3D view, sliding toward the viewer. */
  floorgrid(c, w, h, time, colors) {
    const horizon = h * 0.42;
    c.lineWidth = Math.max(1, w / 1200) * SIZE;
    for (let i = -24; i <= 24; i++) {
      c.strokeStyle = rgba(i === 0 ? colors.accent : colors.text, i === 0 ? 0.5 : 0.12);
      c.beginPath();
      c.moveTo(w / 2 + (i * w) / 48, horizon);
      c.lineTo(w / 2 + i * w * 0.36, h);
      c.stroke();
    }
    const shift = (time * 0.35) % 1;
    for (let i = 0; i < 18; i++) {
      const t = (i + shift) / 18;
      const y = horizon + (h - horizon) * t * t;
      c.strokeStyle = rgba(colors.text, 0.04 + t * 0.2);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  }

  /** Nodes joined by curved links, with something travelling along them. */
  nodegraph(c, w, h, time, colors) {
    const place = (it) => [(0.08 + it.x * 0.84) * w + Math.sin(time * 0.2 + it.h * 6) * w * 0.012, (0.1 + it.y * 0.8) * h + Math.cos(time * 0.17 + it.v * 6) * h * 0.012];
    const [nw, nh] = [w * 0.085, h * 0.075];
    c.lineWidth = Math.max(1.2, w / 800) * SIZE;
    this.items.forEach((it, i) => {
      const next = this.items[(i + 1 + (i % 3)) % this.items.length];
      const [a, b] = [place(it), place(next)];
      const k = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
      c.strokeStyle = rgba(colors.accent, 0.28);
      c.beginPath();
      c.moveTo(a[0] + nw / 2, a[1]);
      c.bezierCurveTo(a[0] + nw / 2 + k, a[1], b[0] - nw / 2 - k, b[1], b[0] - nw / 2, b[1]);
      c.stroke();
      const t = (time * 0.2 + it.s) % 1;
      const u = 1 - t;
      const [p0, p1, p2, p3] = [a[0] + nw / 2, a[0] + nw / 2 + k, b[0] - nw / 2 - k, b[0] - nw / 2];
      const x = u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3;
      const y = u ** 3 * a[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * b[1];
      c.fillStyle = rgba(colors.accent, 0.7);
      c.beginPath();
      c.arc(x, y, 3 * SIZE, 0, Math.PI * 2);
      c.fill();
    });
    for (const it of this.items) {
      const [x, y] = place(it);
      c.fillStyle = rgba(colors.text, 0.1);
      c.strokeStyle = rgba(colors.text, 0.3);
      c.beginPath();
      if (c.roundRect) c.roundRect(x - nw / 2, y - nh / 2, nw, nh, 5 * SIZE); else c.rect(x - nw / 2, y - nh / 2, nw, nh);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.45);
      c.fillRect(x - nw / 2, y - nh / 2, nw, nh * 0.26);
    }
  }

  /** A wireframe surface rolling like the sea. */
  meshwave(c, w, h, time, colors) {
    const [nx, ny] = [36, 16];
    const point = (i, j) => {
      const [u, v] = [i / nx - 0.5, j / ny];
      const depth = 0.35 + v * 0.65;
      const lift = Math.sin(u * 14 + time * 0.9) * 0.5 + Math.sin(v * 9 - time * 0.7 + u * 5) * 0.5;
      return [w / 2 + u * w * 1.5 * depth, h * 0.32 + v * h * 0.62 - lift * h * 0.05 * depth];
    };
    c.lineWidth = Math.max(1, w / 1300) * SIZE;
    c.strokeStyle = rgba(colors.accent, 0.2);
    c.beginPath();
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const p = point(i, j);
      if (i < nx) { const q = point(i + 1, j); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
      if (j < ny) { const q = point(i, j + 1); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
    }
    c.stroke();
  }

  /** Dope sheet rows of keyframes passing under a playhead. */
  keyframes(c, w, h, time, colors) {
    const rows = this.items.length;
    const size = Math.max(5, h / 70) * SIZE;
    const head = (0.5 + Math.sin(time * 0.25) * 0.35) * w;
    this.items.forEach((it, r) => {
      const y = h * ((r + 0.5) / rows);
      c.fillStyle = rgba(colors.text, 0.05);
      c.fillRect(0, y - h * 0.03, w, h * 0.06);
      const gap = w * (0.09 + it.s * 0.09);
      const off = (time * 12 * (0.5 + it.v)) % gap;
      for (let x = -gap + off + it.x * gap; x < w + gap; x += gap) {
        const near = Math.abs(x - head) < size * 2;
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillStyle = rgba(near ? colors.accent : colors.text, near ? 0.8 : 0.3);
        c.fillRect(-size / 2, -size / 2, size, size);
        c.restore();
      }
    });
    c.fillStyle = rgba(colors.accent, 0.7);
    c.fillRect(head - 1, 0, 2 * SIZE, h);
  }

  /** Light paths bouncing around, as a renderer traces them. */
  raytrace(c, w, h, time, colors) {
    c.lineWidth = Math.max(1, w / 1100) * SIZE;
    for (const it of this.items) {
      const speed = 0.04 + it.v * 0.05;
      const phase = (time * speed + it.h) % 1;
      let [x, y] = [it.x * w, it.y * h];
      let angle = it.s * Math.PI * 2 + time * 0.03;
      const length = Math.max(w, h) * 0.32;
      c.strokeStyle = rgba(it.h > 0.5 ? colors.accent : colors.text, 0.22);
      c.beginPath();
      c.moveTo(x, y);
      for (let b = 0; b < 4; b++) {
        const [nx, ny] = [x + Math.cos(angle) * length * (0.5 + phase), y + Math.sin(angle) * length * (0.5 + phase)];
        c.lineTo(nx, ny);
        [x, y] = [nx, ny];
        if (x < 0 || x > w) angle = Math.PI - angle;
        if (y < 0 || y > h) angle = -angle;
        angle += (it.s - 0.5) * 1.3;
        x = Math.max(0, Math.min(w, x));
        y = Math.max(0, Math.min(h, y));
      }
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.75);
      c.beginPath();
      c.arc(x, y, 3 * SIZE, 0, Math.PI * 2);
      c.fill();
    }
  }

  aurora(c, w, h, time, colors) {
    const hues = [colors.accent, colors.accent2 ?? colors.accent, colors.text];
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.5 + 0.42 * Math.sin(time * 0.17 + i * 1.7));
      const y = h * (0.45 + 0.38 * Math.cos(time * 0.13 + i * 2.3));
      const r = Math.max(w, h) * (0.32 + 0.08 * Math.sin(time * 0.3 + i));
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(hues[i % hues.length], colors.dark ? 0.32 : 0.22));
      g.addColorStop(1, rgba(hues[i % hues.length], 0));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.globalCompositeOperation = 'source-over';
  }

  waves(c, w, h, time, colors) {
    for (let layer = 0; layer < 5; layer++) {
      c.beginPath();
      const base = h * (0.45 + layer * 0.1);
      const amp = h * (0.05 + layer * 0.012);
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(4, w / 160)) {
        c.lineTo(x, base + Math.sin(x / w * Math.PI * (2 + layer * 0.6) + time * (0.6 + layer * 0.2)) * amp + Math.sin(x / w * 9 + time * 1.3 + layer) * amp * 0.25);
      }
      c.lineTo(w, h);
      c.closePath();
      c.fillStyle = rgba(layer % 2 ? colors.accent : colors.text, 0.06 + layer * 0.025);
      c.fill();
    }
  }

  particles(c, w, h, time, colors) {
    for (const p of this.items) {
      const x = ((p.x + time * 0.02 * (0.3 + p.v)) % 1) * w;
      const y = ((p.y + Math.sin(time * 0.5 + p.h * 6) * 0.02 + 1) % 1) * h;
      const r = (1 + p.s * 3) * (w / 1400 + 0.6) * SIZE;
      c.fillStyle = rgba(p.h > 0.5 ? colors.accent : colors.text, 0.25 + p.z * 0.45);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  constellation(c, w, h, time, colors) {
    const points = this.items.map((p) => [((p.x + Math.sin(time * 0.15 + p.h * 9) * 0.04) % 1 + 1) % 1 * w, ((p.y + Math.cos(time * 0.12 + p.v * 9) * 0.04) % 1 + 1) % 1 * h]);
    const limit = Math.min(w, h) * 0.16;
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        if (d < limit) {
          c.strokeStyle = rgba(colors.accent, 0.35 * (1 - d / limit));
          c.beginPath();
          c.moveTo(points[i][0], points[i][1]);
          c.lineTo(points[j][0], points[j][1]);
          c.stroke();
        }
      }
    }
    for (const [x, y] of points) {
      c.fillStyle = rgba(colors.text, 0.6);
      c.beginPath();
      c.arc(x, y, Math.max(1.5, w / 900) * SIZE, 0, Math.PI * 2);
      c.fill();
    }
  }

  bubbles(c, w, h, time, colors) {
    for (const p of this.items) {
      const r = (10 + p.s * 40) * (w / 1600 + 0.5);
      const y = h + r - (((p.y + time * 0.03 * (0.4 + p.v)) % 1) * (h + 2 * r));
      const x = p.x * w + Math.sin(time * (0.4 + p.v) + p.h * 10) * 30;
      c.strokeStyle = rgba(colors.accent, 0.35);
      c.fillStyle = rgba(colors.accent, 0.08);
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  gridflow(c, w, h, time, colors) {
    const horizon = h * 0.42;
    c.strokeStyle = rgba(colors.accent, 0.35);
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    for (let i = -20; i <= 20; i++) {
      c.beginPath();
      c.moveTo(w / 2 + i * w * 0.01, horizon);
      c.lineTo(w / 2 + i * w * 0.12, h);
      c.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const f = ((i / 18 + time * 0.06) % 1);
      const y = horizon + (h - horizon) * f * f;
      c.strokeStyle = rgba(colors.accent, 0.1 + 0.4 * f);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    const g = c.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, rgba(colors.accent, 0));
    g.addColorStop(1, rgba(colors.accent, 0.18));
    c.fillStyle = g;
    c.fillRect(0, 0, w, horizon);
  }

  starfield(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    for (const p of this.items) {
      const z = 1 - ((p.z + time * 0.08 * (0.5 + p.v)) % 1);
      const x = cx + ((p.x - 0.5) * w) / (z * 1.4 + 0.05);
      const y = cy + ((p.y - 0.5) * h) / (z * 1.4 + 0.05);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const r = Math.max(0.6, (1 - z) * 2.6) * (w / 1600 + 0.6) * SIZE;
      c.fillStyle = rgba(p.h > 0.7 ? colors.accent : colors.text, Math.min(1, (1 - z) * 1.4));
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Flakes drifting down and swaying. */
  snow(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    for (const p of this.items) {
      const y = (((p.y + time * (0.025 + p.v * 0.045)) % 1.1) - 0.05) * h;
      const x = ((((p.x + time * 0.004 + Math.sin(time * 0.6 + p.h * 12) * 0.02) % 1) + 1) % 1) * w;
      c.fillStyle = rgba(p.h > 0.8 ? colors.accent : colors.text, 0.3 + p.z * 0.45);
      c.beginPath();
      c.arc(x, y, (1 + p.s * 3) * scale, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Glowing dots wandering and pulsing. */
  fireflies(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    for (const p of this.items) {
      const x = (0.5 + 0.46 * Math.sin(time * 0.11 * (0.5 + p.v) + p.x * 20)) * w;
      const y = (0.5 + 0.44 * Math.cos(time * 0.09 * (0.5 + p.s) + p.y * 20)) * h;
      const glow = 0.5 + 0.5 * Math.sin(time * (1 + p.h * 2) + p.z * 10);
      const r = (5 + p.s * 9) * scale * (0.7 + glow * 0.6);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(colors.accent, 0.25 + glow * 0.55));
      g.addColorStop(1, rgba(colors.accent, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = 'source-over';
  }

  /** Rings spreading from points that move on each round, like drops on water. */
  ripples(c, w, h, time, colors) {
    const reach = Math.max(w, h) * 0.32;
    c.lineWidth = Math.max(1, w / 1000);
    this.items.forEach((p, i) => {
      const period = 6 + p.v * 4;
      const t = time + p.h * period;
      const round = Math.floor(t / period);
      const phase = (t % period) / period;
      const at = (n) => { const v = Math.sin(i * 12.9898 + round * 78.233 + n) * 43758.5453; return v - Math.floor(v); };
      const x = (0.1 + at(1) * 0.8) * w;
      const y = (0.1 + at(2) * 0.8) * h;
      for (const k of [1, 0.7, 0.4]) {
        c.strokeStyle = rgba(k === 1 ? colors.accent : colors.text, (1 - phase) * 0.4 * k);
        c.beginPath();
        c.arc(x, y, Math.max(0, phase * reach * k), 0, Math.PI * 2);
        c.stroke();
      }
    });
  }


  /** A honeycomb with a wave of light running out from the middle. */
  hexagons(c, w, h, time, colors) {
    const r = Math.max(w, h) / 24;
    const step = Math.sqrt(3) * r;
    const LEVELS = 8;
    const cells = Array.from({ length: LEVELS }, () => []);
    for (let row = 0; row * r * 1.5 < h + r; row++) {
      for (let col = 0; col * step < w + step; col++) {
        const x = col * step + (row % 2) * step / 2;
        const y = row * r * 1.5;
        const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 - Math.hypot(x - w / 2, y - h / 2) / (r * 3));
        cells[Math.min(LEVELS - 1, Math.floor(pulse * LEVELS))].push(x, y);
      }
    }
    // Cells of the same brightness are drawn as one path: a few calls a frame instead of hundreds.
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    cells.forEach((list, level) => {
      if (!list.length) return;
      c.beginPath();
      for (let i = 0; i < list.length; i += 2) {
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          c[k ? 'lineTo' : 'moveTo'](list[i] + Math.cos(a) * r * 0.92, list[i + 1] + Math.sin(a) * r * 0.92);
        }
        c.closePath();
      }
      const pulse = (level + 0.5) / LEVELS;
      if (pulse > 0.8) {
        c.fillStyle = rgba(colors.accent, (pulse - 0.8) * 0.9);
        c.fill();
      }
      c.strokeStyle = rgba(colors.accent, 0.08 + pulse * pulse * 0.22);
      c.stroke();
    });
  }

  /** Planets circling a glowing centre, each on its own ring. */
  orbits(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    const unit = Math.min(w, h);
    const scale = (w / 1600 + 0.6) * SIZE;
    const sun = c.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.09);
    sun.addColorStop(0, rgba(colors.accent, 0.5));
    sun.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = sun;
    c.fillRect(cx - unit * 0.09, cy - unit * 0.09, unit * 0.18, unit * 0.18);
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    this.items.forEach((p, i) => {
      const radius = unit * (0.1 + i * 0.05);
      c.strokeStyle = rgba(colors.text, 0.09);
      c.beginPath();
      c.ellipse(cx, cy, radius * 1.35, radius, 0, 0, Math.PI * 2);
      c.stroke();
      const a = time * (0.5 / (1 + i * 0.5)) * (p.v > 0.3 ? 1 : -1) + p.h * Math.PI * 2;
      c.fillStyle = rgba(p.z > 0.7 ? colors.text : colors.accent, 0.55);
      c.beginPath();
      c.arc(cx + Math.cos(a) * radius * 1.35, cy + Math.sin(a) * radius, (3 + p.s * 6) * scale, 0, Math.PI * 2);
      c.fill();
    });
  }

  /** Soft blobs rising and sinking slowly. */
  lava(c, w, h, time, colors) {
    const hues = [colors.accent, colors.accent2 ?? colors.accent, colors.danger ?? colors.accent];
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    this.items.forEach((p, i) => {
      const x = (0.12 + 0.76 * p.x + 0.06 * Math.sin(time * 0.2 + p.h * 9)) * w;
      const y = (0.5 + 0.42 * Math.sin(time * 0.12 * (0.5 + p.v) + p.h * 9)) * h;
      const r = Math.min(w, h) * (0.1 + p.s * 0.12) * (1 + 0.08 * Math.sin(time * 0.7 + i));
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const hue = hues[i % hues.length];
      g.addColorStop(0, rgba(hue, 0.42));
      g.addColorStop(0.6, rgba(hue, 0.3));
      g.addColorStop(1, rgba(hue, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    });
    c.globalCompositeOperation = 'source-over';
  }

  /** Wide ribbons of light swaying across. */
  ribbons(c, w, h, time, colors) {
    const stepX = Math.max(4, w / 120);
    c.lineCap = 'round';
    for (let layer = 0; layer < 6; layer++) {
      c.beginPath();
      for (let x = 0; x <= w + stepX; x += stepX) {
        const y = h * (0.5 + 0.28 * Math.sin((x / w) * Math.PI * 2 * (0.8 + layer * 0.25) + time * (0.35 + layer * 0.08) + layer) * Math.sin(time * 0.15 + layer * 1.1));
        c[x ? 'lineTo' : 'moveTo'](x, y);
      }
      c.lineWidth = h * 0.008 * (1 + (layer % 3));
      c.strokeStyle = rgba(layer % 2 ? colors.accent : colors.accent2 ?? colors.text, 0.16);
      c.stroke();
    }
  }
}
