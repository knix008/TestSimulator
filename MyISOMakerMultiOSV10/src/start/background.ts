// @ts-nocheck
// Moving backgrounds for the start screen (ported from MyZipMaster, which follows MyDiagram): one
// canvas, 30 frames a second, the theme's colours, paused while the window is hidden. Twenty-four
// pictures, the first ten drawn for a disc-image maker: spinning discs, a laser burning a track,
// sectors being written, files going into an image, an image split into parts, boxes rising,
// bytes falling, tracks with orbiting blocks, a folder tree growing, reading beams sweeping.
// `frames` counts drawn frames (tests use it).

export const ANIMATIONS = ['discs', 'burn', 'sectors', 'tracks', 'isotree', 'beams', 'files', 'volumes', 'boxes', 'bytes', 'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'starfield', 'snow', 'fireflies', 'ripples', 'hexagons', 'orbits', 'lava', 'ribbons'];
export const ANIMATION_KINDS = ANIMATIONS;
export const DEFAULT_ANIMATION = 'discs';

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
    const text = String(hex ?? '').trim();
    let m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
    if (m) rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    else if ((m = /^#?([0-9a-f]{3})$/i.exec(text))) rgb = [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
    else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text))) rgb = [m[1], m[2], m[3]].map((v) => Math.round(Number(v)));
    else rgb = [128, 128, 128];
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
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a * BOOST))})`; };

/**
 * The colours the animations use, read from the app's theme tokens (--bg0, --accent, --accent-2,
 * --text, --danger). Pass `colors: themeColors` to the constructor; it is read every frame, so a
 * theme change shows at once.
 */
export function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(`--${name}`).trim();
  const bg = read('bg0') || '#101820';
  const [r, g, b] = hexToRgb(bg);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const accent = read('accent') || '#3fd6b0';
  return { bg, accent, accent2: read('accent-2') || accent, text: read('text') || (lum < 0.45 ? '#ffffff' : '#000000'), danger: read('danger') || accent, dark: lum < 0.45 };
}

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
    this.tree = [];
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
    if (!this.running) this.draw();
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
      ripples: 7, bytes: 34, orbits: 8, lava: 7, files: 26, boxes: 18, discs: 7, beams: 5,
    }[this.kind] ?? 0;
    this.items = Array.from({ length: count }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r() }));
    this.tree = this.kind === 'isotree' ? makeTree(r) : [];
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
    if (!c) return;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const colors = this.colors();
    // Broad washes (aurora, waves, lava, beams) are strong already; lines and dots need the most help.
    const kindBoost = { aurora: 0.75, waves: 0.7, lava: 0.8, gridflow: 0.85, beams: 0.8, discs: 0.9 }[this.kind] ?? 1;
    BOOST = this.vivid ? (colors.dark ? 2.3 : 2.9) * kindBoost : 1;
    SIZE = this.vivid ? 1.6 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
  }

  /** A few CDs / DVDs drifting and slowly spinning: grooves, a moving sheen, a hub and a centre hole. */
  discs(c, w, h, time, colors) {
    const unit = Math.min(w, h);
    const hues = [colors.accent, colors.accent2 ?? colors.accent];
    this.items.forEach((p, i) => {
      const R = unit * (0.1 + p.s * 0.13);
      const x = (0.08 + 0.84 * p.x) * w + Math.sin(time * 0.07 + p.h * 9) * unit * 0.05;
      const y = (0.1 + 0.8 * p.y) * h + Math.cos(time * 0.06 + p.v * 9) * unit * 0.05;
      const rot = time * (0.25 + p.v * 0.35) * (i % 2 ? -1 : 1) + p.h * 6;
      const hue = hues[i % hues.length];
      // Body.
      c.fillStyle = rgba(hue, 0.1);
      c.strokeStyle = rgba(hue, 0.45);
      c.lineWidth = Math.max(1, unit / 700) * SIZE;
      c.beginPath();
      c.arc(x, y, R, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      // Grooves.
      c.lineWidth = Math.max(0.5, unit / 1600);
      c.strokeStyle = rgba(colors.text, 0.07);
      c.beginPath();
      for (let k = 0.45; k < 0.97; k += 0.09) {
        c.moveTo(x + R * k, y);
        c.arc(x, y, R * k, 0, Math.PI * 2);
      }
      c.stroke();
      // Sheen: two opposite wedges of light that turn with the disc.
      for (const off of [0, Math.PI]) {
        c.fillStyle = rgba(off ? hue : colors.text, off ? 0.18 : 0.12);
        c.beginPath();
        c.moveTo(x + Math.cos(rot + off) * R * 0.32, y + Math.sin(rot + off) * R * 0.32);
        c.arc(x, y, R * 0.97, rot + off, rot + off + 0.55);
        c.arc(x, y, R * 0.32, rot + off + 0.55, rot + off, true);
        c.closePath();
        c.fill();
      }
      // A mark on the label so the spin shows.
      c.strokeStyle = rgba(colors.text, 0.25);
      c.lineWidth = Math.max(1, unit / 900) * SIZE;
      c.beginPath();
      c.arc(x, y, R * 0.6, rot + 2, rot + 2.6);
      c.stroke();
      // Hub ring and the hole.
      c.strokeStyle = rgba(hue, 0.55);
      c.beginPath();
      c.arc(x, y, R * 0.3, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = colors.bg;
      c.beginPath();
      c.arc(x, y, R * 0.11, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = rgba(colors.text, 0.3);
      c.stroke();
    });
  }

  /** A laser spot spiralling outward over a disc, leaving a burnt track behind it. */
  burn(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.44;
    const r0 = R * 0.28;
    const turns = 22;
    const cycle = 26;
    const progress = Math.min(1, ((time % cycle) / cycle) * 1.12);
    const spin = time * 0.6;
    // The blank disc.
    c.fillStyle = rgba(colors.accent, 0.06);
    c.strokeStyle = rgba(colors.accent, 0.4);
    c.lineWidth = Math.max(1, R / 300) * SIZE;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(cx, cy, r0 * 0.9, 0, Math.PI * 2);
    c.stroke();
    // The burnt track so far.
    const at = (t) => {
      const a = t * turns * Math.PI * 2 + spin;
      const rr = r0 + (R * 0.97 - r0) * t;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    };
    const steps = Math.max(2, Math.floor(progress * turns * 64));
    c.lineWidth = Math.max(1, ((R - r0) / turns) * 0.55);
    c.strokeStyle = rgba(colors.accent2 ?? colors.accent, 0.32);
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, y] = at((i / steps) * progress);
      c[i ? 'lineTo' : 'moveTo'](x, y);
    }
    c.stroke();
    // The freshest stretch, brighter.
    const fresh = Math.min(progress, 0.03);
    c.strokeStyle = rgba(colors.danger ?? colors.accent, 0.55);
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const [x, y] = at(progress - fresh + (i / 40) * fresh);
      c[i ? 'lineTo' : 'moveTo'](x, y);
    }
    c.stroke();
    // The laser spot.
    if (progress < 1) {
      const [x, y] = at(progress);
      const glow = R * 0.09 * SIZE * (0.85 + 0.15 * Math.sin(time * 9));
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      const g = c.createRadialGradient(x, y, 0, x, y, glow);
      g.addColorStop(0, rgba(colors.danger ?? colors.accent, 0.8));
      g.addColorStop(0.3, rgba(colors.danger ?? colors.accent, 0.35));
      g.addColorStop(1, rgba(colors.danger ?? colors.accent, 0));
      c.fillStyle = g;
      c.fillRect(x - glow, y - glow, glow * 2, glow * 2);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = rgba(colors.text, 0.8);
      c.beginPath();
      c.arc(x, y, Math.max(1.5, R / 160) * SIZE, 0, Math.PI * 2);
      c.fill();
    }
    // Centre hole.
    c.fillStyle = colors.bg;
    c.beginPath();
    c.arc(cx, cy, r0 * 0.35, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = rgba(colors.text, 0.25);
    c.lineWidth = Math.max(1, R / 300) * SIZE;
    c.stroke();
  }

  /** A grid of sectors filling in as they are written; the write head runs ahead, then it all clears. */
  sectors(c, w, h, time, colors) {
    const size = Math.max(10, Math.min(w, h) / 22);
    const gap = Math.max(2, size * 0.18);
    const cols = Math.max(1, Math.floor((w + gap) / (size + gap)));
    const rows = Math.max(1, Math.floor((h + gap) / (size + gap)));
    const left = (w - (cols * (size + gap) - gap)) / 2;
    const top = (h - (rows * (size + gap) - gap)) / 2;
    const total = cols * rows;
    const cycle = 18;
    const phase = (time % cycle) / cycle;
    const head = phase * total * 1.15;
    const fade = phase > 0.87 ? 1 - (phase - 0.87) / 0.13 : 1;
    // Cells of the same look are drawn as one path: a few calls a frame instead of hundreds.
    const empty = new Path2D();
    const written = [new Path2D(), new Path2D(), new Path2D()];
    let headCell = null;
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = left + col * (size + gap);
      const y = top + row * (size + gap);
      // Not quite in order: sectors land in short runs, like a real write.
      const jitter = Math.sin(i * 12.9898) * 43758.5453;
      const order = i + ((jitter - Math.floor(jitter)) - 0.5) * cols * 0.6;
      if (order < head) written[(i * 7 + row) % 3].rect(x, y, size, size);
      else empty.rect(x, y, size, size);
      if (!headCell && order >= head) headCell = [x, y];
    }
    c.lineWidth = Math.max(1, size / 18);
    c.strokeStyle = rgba(colors.text, 0.1);
    c.stroke(empty);
    const hues = [colors.accent, colors.accent2 ?? colors.accent, colors.accent];
    written.forEach((path, k) => {
      c.fillStyle = rgba(hues[k], (0.16 + k * 0.07) * fade);
      c.fill(path);
      c.strokeStyle = rgba(hues[k], 0.35 * fade);
      c.stroke(path);
    });
    if (headCell && phase < 0.87) {
      c.fillStyle = rgba(colors.text, 0.6);
      c.fillRect(headCell[0], headCell[1], size, size);
    }
  }

  /** Concentric tracks with blocks orbiting along them at different speeds and directions. */
  tracks(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    const reach = Math.hypot(w, h) * 0.5;
    const rings = 11;
    const band = reach / (rings + 1);
    c.lineCap = 'butt';
    for (let i = 1; i <= rings; i++) {
      const r = band * (i + 0.3);
      c.strokeStyle = rgba(colors.text, 0.07);
      c.lineWidth = Math.max(1, band * 0.06);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      const blocks = 2 + (i * 5) % 5;
      const dir = i % 2 ? 1 : -1;
      const speed = (0.12 + ((i * 37) % 11) / 40) * dir;
      c.lineWidth = band * 0.46;
      c.strokeStyle = rgba(i % 3 === 0 ? colors.accent2 ?? colors.accent : colors.accent, 0.26);
      c.beginPath();
      for (let k = 0; k < blocks; k++) {
        const a = time * speed + (k / blocks) * Math.PI * 2 + i * 0.9;
        const len = (0.18 + ((i + k) % 4) * 0.08) * (band * 3) / r;
        c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        c.arc(cx, cy, r, a, a + len);
      }
      c.stroke();
    }
    c.fillStyle = rgba(colors.accent, 0.3);
    c.beginPath();
    c.arc(cx, cy, band * 0.5, 0, Math.PI * 2);
    c.fill();
  }

  /** Folder trees growing row by row, holding, then collapsing again; three of them across. */
  isotree(c, w, h, time, colors) {
    const nodes = this.tree;
    if (!nodes.length) return;
    const columns = w > h * 1.1 ? 3 : 2;
    const colW = w / columns;
    const rowH = Math.min(h / (nodes.length + 2), colW / 9);
    const indent = rowH * 1.4;
    const icon = rowH * 0.62;
    const top = (h - rowH * nodes.length) / 2;
    c.lineWidth = Math.max(1, rowH / 14) * SIZE;
    for (let col = 0; col < columns; col++) {
      const cycle = 14;
      const t = ((time + col * 4.3) % cycle) / cycle;
      // 0 → 0.45 grow, hold, 0.7 → 0.95 collapse, rest empty.
      const amount = t < 0.45 ? t / 0.45 : t < 0.7 ? 1 : t < 0.95 ? 1 - (t - 0.7) / 0.25 : 0;
      const shown = amount * nodes.length;
      const left = col * colW + colW * 0.12;
      nodes.forEach((n, i) => {
        const a = Math.max(0, Math.min(1, shown - i));
        if (a <= 0) return;
        const x = left + n.depth * indent;
        const y = top + i * rowH + rowH / 2;
        // Connector from the parent.
        if (n.parent >= 0) {
          const px = left + nodes[n.parent].depth * indent + icon * 0.4;
          const py = top + n.parent * rowH + rowH / 2 + icon * 0.4;
          c.strokeStyle = rgba(colors.text, 0.22 * a);
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px, y);
          c.lineTo(x - icon * 0.15, y);
          c.stroke();
        }
        const hue = n.folder ? colors.accent : colors.accent2 ?? colors.accent;
        c.fillStyle = rgba(hue, (n.folder ? 0.42 : 0.26) * a);
        c.strokeStyle = rgba(hue, 0.6 * a);
        c.beginPath();
        if (n.folder) {
          c.moveTo(x, y - icon * 0.4);
          c.lineTo(x + icon * 0.38, y - icon * 0.4);
          c.lineTo(x + icon * 0.5, y - icon * 0.26);
          c.lineTo(x + icon * 1.1, y - icon * 0.26);
          c.lineTo(x + icon * 1.1, y + icon * 0.4);
          c.lineTo(x, y + icon * 0.4);
        } else {
          c.moveTo(x + icon * 0.15, y - icon * 0.45);
          c.lineTo(x + icon * 0.6, y - icon * 0.45);
          c.lineTo(x + icon * 0.85, y - icon * 0.2);
          c.lineTo(x + icon * 0.85, y + icon * 0.45);
          c.lineTo(x + icon * 0.15, y + icon * 0.45);
        }
        c.closePath();
        c.fill();
        c.stroke();
        // The name, as a bar.
        c.fillStyle = rgba(colors.text, 0.16 * a);
        const bw = Math.min(colW * 0.8 - (x - left) - icon * 1.4, rowH * (1.5 + n.len * 4)) * a;
        if (bw > 0) c.fillRect(x + icon * 1.35, y - rowH * 0.12, bw, rowH * 0.24);
      });
    }
  }

  /** Beams of light sweeping to and fro, the way a drive's laser reads, with dots where they land. */
  beams(c, w, h, time, colors) {
    const hues = [colors.accent, colors.accent2 ?? colors.accent, colors.text];
    const reach = Math.hypot(w, h);
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    this.items.forEach((p, i) => {
      const ox = (0.1 + 0.8 * ((i + 0.5) / this.items.length)) * w;
      const oy = h * 1.02;
      const angle = -Math.PI / 2 + Math.sin(time * (0.18 + p.v * 0.22) + p.h * 9) * (0.5 + p.s * 0.35);
      const spread = 0.05 + p.z * 0.05;
      const hue = hues[i % hues.length];
      const g = c.createRadialGradient(ox, oy, 0, ox, oy, reach);
      g.addColorStop(0, rgba(hue, i % 3 === 2 ? 0.16 : 0.26));
      g.addColorStop(0.6, rgba(hue, 0.07));
      g.addColorStop(1, rgba(hue, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ox + Math.cos(angle - spread) * reach, oy + Math.sin(angle - spread) * reach);
      c.lineTo(ox + Math.cos(angle + spread) * reach, oy + Math.sin(angle + spread) * reach);
      c.closePath();
      c.fill();
      // A thin bright core.
      c.strokeStyle = rgba(hue, 0.22);
      c.lineWidth = Math.max(1, w / 1400) * SIZE;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ox + Math.cos(angle) * reach, oy + Math.sin(angle) * reach);
      c.stroke();
    });
    c.globalCompositeOperation = 'source-over';
    // Pits flickering along the top as they are read.
    const pits = 48;
    const pw = w / pits;
    for (let k = 0; k < pits; k++) {
      const v = Math.sin(k * 12.9898 + Math.floor(time * 3 + k * 0.3) * 78.233) * 43758.5453;
      const on = v - Math.floor(v);
      c.fillStyle = rgba(on > 0.5 ? colors.accent : colors.text, 0.08 + on * 0.18);
      c.fillRect(k * pw + pw * 0.15, h * 0.04, pw * (0.2 + on * 0.6), Math.max(2, h * 0.008) * SIZE);
    }
  }

  /** Documents sinking into an open box at the bottom: files going into the image. */
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

  /** Bars filling up and breaking into equal parts, the way a split image is cut. */
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

  /** Columns of hexadecimal falling, as a disc image looks from inside. */
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
    c.lineCap = 'butt';
  }
}

/** A small, fixed folder tree (depth-first order) for the `isotree` picture. */
function makeTree(r) {
  const nodes = [{ depth: 0, folder: true, parent: -1, len: 0.6 }];
  const stack = [0];
  while (nodes.length < 22) {
    const parent = stack[stack.length - 1];
    const depth = nodes[parent].depth + 1;
    const roll = r();
    const folder = depth < 4 && roll < 0.4;
    nodes.push({ depth, folder, parent, len: r() });
    const index = nodes.length - 1;
    if (folder) stack.push(index);
    else if (stack.length > 1 && r() < 0.35) stack.pop();
  }
  return nodes;
}
