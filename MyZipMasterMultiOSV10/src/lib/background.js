// Moving backgrounds for the start screen, in the way MyDiagram does them: one canvas, 30 frames a
// second, the theme's colours, paused while the window is hidden. Twenty pictures, the first six
// drawn for an archiver: a zipper closing, blocks being squeezed, files going into a box, an archive
// splitting into parts, boxes rising, bytes falling. `frames` counts drawn frames (tests use it).

export const ANIMATIONS = ['zipper', 'squeeze', 'files', 'volumes', 'boxes', 'bytes', 'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'starfield', 'snow', 'fireflies', 'ripples', 'hexagons', 'orbits', 'lava', 'ribbons'];
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
  constructor(canvas, { colors, speed = () => 1, kind = 'zipper', vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'zipper';
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
      ripples: 7, bytes: 34, orbits: 8, lava: 7, files: 26, boxes: 18,
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

  /** Rows of zippers: a slider runs along, closing the two rows of teeth behind it. */
  zipper(c, w, h, time, colors) {
    const rows = 5;
    const pitch = Math.max(14, w / 70);
    const tooth = pitch * 0.42;
    for (let row = 0; row < rows; row++) {
      const y = h * ((row + 0.5) / rows);
      const reach = w + pitch * 6;
      const slider = ((time * (0.05 + row * 0.012) + row * 0.37) % 1) * reach * (row % 2 ? -1 : 1);
      const at = row % 2 ? reach + slider : slider;
      const open = h * 0.05;
      for (let i = 0, x = (row % 2) * pitch / 2; x < w + pitch; i++, x += pitch / 2) {
        // Ahead of the slider the two rows spread; behind it they mesh.
        const ahead = (row % 2 ? at - x : x - at) / (pitch * 12);
        const spread = Math.max(0, Math.min(1, ahead)) * open;
        const up = i % 2 === 0;
        const yy = y + (up ? -1 : 1) * (tooth * 0.45 + spread);
        c.fillStyle = rgba(up ? colors.accent : colors.text, 0.32);
        c.fillRect(x - tooth * 0.4, yy - tooth * 0.4, tooth * 0.8, tooth * 0.8);
      }
      c.fillStyle = rgba(colors.accent, 0.8);
      c.beginPath();
      if (c.roundRect) c.roundRect(at - pitch, y - pitch * 0.6, pitch * 2, pitch * 1.2, pitch * 0.3);
      else c.rect(at - pitch, y - pitch * 0.6, pitch * 2, pitch * 1.2);
      c.fill();
      c.fillStyle = rgba(colors.text, 0.5);
      c.fillRect(at - pitch * 0.2, y + pitch * 0.5, pitch * 0.4, pitch * 1.1);
    }
  }

  /** Rows of blocks squeezing together and spreading out again: compression, over and over. */
  squeeze(c, w, h, time, colors) {
    const rows = 9;
    const cells = 26;
    for (let row = 0; row < rows; row++) {
      const y = h * ((row + 0.15) / rows);
      const bh = (h / rows) * 0.7;
      const squeeze = 0.5 + 0.5 * Math.sin(time * 0.5 + row * 0.7);
      const width = w * (0.3 + 0.7 * squeeze);
      const left = (w - width) / 2;
      const each = width / cells;
      for (let i = 0; i < cells; i++) {
        const shade = 0.08 + 0.28 * (1 - squeeze) + 0.1 * Math.sin(i * 1.7 + row);
        c.fillStyle = rgba(i % 3 === 0 ? colors.text : colors.accent, Math.max(0.04, shade));
        c.fillRect(left + i * each, y, Math.max(1, each - Math.max(1, each * 0.14)), bh);
      }
    }
  }

  /** Documents sinking into an open box at the bottom. */
  files(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const size = unit * 0.05;
    const boxW = unit * 0.5;
    const boxH = unit * 0.2;
    const bx = w / 2;
    const by = h * 0.96;
    for (const p of this.items) {
      const t = (p.y + time * (0.03 + p.v * 0.03)) % 1;
      const eased = t * t;
      const x = p.x * w + (bx - p.x * w) * eased + Math.sin(time * 0.8 + p.h * 9) * unit * 0.012 * (1 - t);
      const y = -size * 2 + (by - boxH * 0.5 + size * 2) * eased;
      const s = size * (1 - eased * 0.45);
      const a = 0.4 * (1 - t * t * t);
      c.fillStyle = rgba(colors.text, a * 0.55);
      c.strokeStyle = rgba(colors.accent, a * 1.5);
      c.lineWidth = Math.max(1, unit / 700);
      c.beginPath();
      c.moveTo(x - s * 0.7, y - s);
      c.lineTo(x + s * 0.3, y - s);
      c.lineTo(x + s * 0.7, y - s * 0.55);
      c.lineTo(x + s * 0.7, y + s);
      c.lineTo(x - s * 0.7, y + s);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = rgba(colors.accent, 0.3);
    c.strokeStyle = rgba(colors.accent, 0.7);
    c.lineWidth = Math.max(1.5, unit / 400);
    c.beginPath();
    c.moveTo(bx - boxW / 2, by - boxH);
    c.lineTo(bx - boxW * 0.42, by);
    c.lineTo(bx + boxW * 0.42, by);
    c.lineTo(bx + boxW / 2, by - boxH);
    c.closePath();
    c.fill();
    c.stroke();
  }

  /** Bars filling up and breaking into equal parts, the way a split archive is cut. */
  volumes(c, w, h, time, colors) {
    const rows = 8;
    const bar = (h / rows) * 0.5;
    for (let row = 0; row < rows; row++) {
      const y = h * ((row + 0.25) / rows);
      const parts = 4 + (row * 3) % 5;
      const gap = Math.max(4, w * 0.008);
      const each = (w * 0.9 - gap * (parts - 1)) / parts;
      const fill = ((time * (0.06 + row * 0.008) + row * 0.23) % 1) * parts;
      for (let i = 0; i < parts; i++) {
        const x = w * 0.05 + i * (each + gap);
        c.fillStyle = rgba(colors.text, 0.07);
        c.fillRect(x, y, each, bar);
        const amount = Math.max(0, Math.min(1, fill - i));
        if (amount > 0) {
          c.fillStyle = rgba(i % 2 ? colors.accent : colors.accent2 ?? colors.accent, 0.22 + 0.2 * amount);
          c.fillRect(x, y, each * amount, bar);
        }
        c.strokeStyle = rgba(colors.accent, 0.3);
        c.lineWidth = 1;
        c.strokeRect(x, y, each, bar);
      }
    }
  }

  /** Isometric boxes drifting upward. */
  boxes(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    for (const p of this.items) {
      const s = unit * (0.03 + p.s * 0.05);
      const x = p.x * w + Math.sin(time * 0.3 + p.h * 9) * unit * 0.02;
      const y = h + s * 2 - ((p.y + time * (0.015 + p.v * 0.03)) % 1) * (h + s * 4);
      c.lineWidth = Math.max(1, unit / 900);
      c.strokeStyle = rgba(colors.accent, 0.5);
      const face = (points, alpha, colour) => {
        c.fillStyle = rgba(colour, alpha);
        c.beginPath();
        points.forEach(([a, b], i) => c[i ? 'lineTo' : 'moveTo'](x + a * s, y + b * s));
        c.closePath();
        c.fill();
        c.stroke();
      };
      face([[0, -1], [1, -0.5], [0, 0], [-1, -0.5]], 0.34, colors.accent);
      face([[-1, -0.5], [0, 0], [0, 1], [-1, 0.5]], 0.2, colors.accent);
      face([[1, -0.5], [0, 0], [0, 1], [1, 0.5]], 0.12, colors.text);
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

  /** Columns of hexadecimal falling, as an archive looks from inside. */
  bytes(c, w, h, time, colors) {
    const glyphs = '0123456789ABCDEF';
    const column = w / this.items.length;
    const size = column * 0.62;
    c.font = `${Math.round(size)}px Consolas, Menlo, monospace`;
    c.textAlign = 'center';
    const heads = this.items.map((p) => [(((p.y + time * (0.06 + p.v * 0.1)) % 1.3) - 0.1) * h, Math.floor(time * 6 + p.h * 10)]);
    // One colour per trail position (the head is brightest), set once for all columns.
    for (let k = 0; k < 12; k++) {
      c.fillStyle = k === 0 ? rgba(colors.text, 0.75) : rgba(colors.accent, 0.5 * (1 - k / 12));
      heads.forEach(([head, tick], i) => {
        const y = head - k * size * 1.15;
        if (y < -size || y > h + size) return;
        c.fillText(glyphs[(i * 7 + k * 13 + tick) % glyphs.length], (i + 0.5) * column, y);
      });
    }
    c.textAlign = 'start';
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
