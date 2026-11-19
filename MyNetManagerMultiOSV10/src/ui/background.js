// Moving backgrounds for the start page and (faintly) behind the views. All twenty are about
// networks, the program's subject (the list is ANIMATIONS in settings): packets travelling a
// topology, a three-tier network, a hex dump, line signals, fibre, Wi-Fi, a scan radar, a
// throughput graph, an internet globe, a data centre, a circuit board, a bit stream, a TCP flow
// diagram, the OSI layers, ping pulses, satellite links, a traffic heatmap, a live packet list,
// a radio spectrum and a mesh with its route. Colours follow the theme. The animation pauses
// while the window is hidden; `frames` counts drawn frames (tests use it).
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** A stable pseudo-random number in [0, 1) for a pair of integers (blinking LEDs, hex bytes, rows). */
const hash = (a, b = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
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
const MONO = 'Consolas, Menlo, "DejaVu Sans Mono", monospace';

/** The protocols the packet list, flow diagram and packets are labelled with, and which colour each takes. */
const PROTOCOLS = ['TCP', 'TLS', 'DNS', 'HTTP', 'UDP', 'QUIC', 'ARP', 'ICMP'];
const protoColor = (colors, i) => [colors.accent, colors.accent2 ?? colors.accent, colors.text, colors.danger ?? colors.accent][i % 4];

/** Links between normalised points: each joined to its `k` nearest (seen on a 16:10 screen), no duplicates. */
function nearestLinks(points, k) {
  const links = new Set();
  points.forEach((p, i) => {
    points
      .map((q, j) => ({ j, d: Math.hypot((p.x - q.x) * 1.6, p.y - q.y) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .forEach(({ j }) => links.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  return [...links].map((key) => key.split('-').map(Number));
}

/** A circuit trace: right angles and 45° bends on a grid, in normalised coordinates. */
function tracePath(r) {
  const grid = 1 / 40;
  let x = Math.round(r() * 40) * grid;
  let y = Math.round(r() * 26) * grid * 1.54;
  const points = [[x, y]];
  let dir = Math.floor(r() * 4);
  for (let n = 0; n < 4 + Math.floor(r() * 4); n++) {
    const length = (2 + Math.floor(r() * 7)) * grid;
    const diagonal = r() < 0.3;
    const dx = [1, 0, -1, 0][dir];
    const dy = [0, 1, 0, -1][dir];
    x += diagonal ? (dx || 1) * length * 0.7 : dx * length;
    y += diagonal ? (dy || 1) * length * 0.7 * 1.54 : dy * length * 1.54;
    points.push([x, y]);
    dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
  }
  return points;
}

/** The point at `f` (0–1) along a polyline, and its total length (pixels). */
function along(points, f) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(d);
    total += d;
  }
  let at = f * total;
  for (let i = 1; i < points.length; i++) {
    if (at <= lengths[i - 1] || i === points.length - 1) {
      const k = lengths[i - 1] ? Math.min(1, at / lengths[i - 1]) : 0;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * k, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * k];
    }
    at -= lengths[i - 1];
  }
  return points[points.length - 1];
}

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = ANIMATION_KINDS[0], vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : ANIMATION_KINDS[0];
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
      packetflow: 16, topology: 0, wifi: 26, radar: 40, globe: 34, circuit: 26, bitstream: 40, pings: 14,
      satellites: 7, fiber: 12, mesh: 34, layers: 9,
    }[this.kind] ?? 0;
    this.items = Array.from({ length: count }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r() }));
    this.links = this.kind === 'packetflow' ? nearestLinks(this.items, 2) : this.kind === 'pings' ? nearestLinks(this.items, 3) : [];
    this.traces = this.kind === 'circuit' ? this.items.map(() => tracePath(r)) : [];
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
    // Broad fills (heatmap, spectrum, throughput) are strong already; thin lines and text need the most help.
    const kindBoost = { heatmap: 0.75, spectrum: 0.8, throughput: 0.85, layers: 0.85 }[this.kind] ?? 1;
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
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.textAlign = 'start';
    c.setLineDash([]);
  }

  /** Hosts joined by links, with packets (small frames) travelling both ways along them. */
  packetflow(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const pts = this.items.map((p) => ({
      x: (0.06 + p.x * 0.88 + Math.sin(time * 0.1 + p.h * 9) * 0.01) * w,
      y: (0.08 + p.y * 0.84 + Math.cos(time * 0.08 + p.v * 9) * 0.012) * h,
      router: p.z > 0.72,
    }));
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.12);
    c.beginPath();
    for (const [a, b] of this.links) { c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y); }
    c.stroke();
    this.links.forEach(([a, b], i) => {
      for (let k = 0; k < 2; k++) {
        const forward = (i + k) % 2 === 0;
        const f = (time * (0.08 + hash(i, k) * 0.1) + hash(k, i)) % 1;
        const [from, to] = forward ? [pts[a], pts[b]] : [pts[b], pts[a]];
        const x = from.x + (to.x - from.x) * f;
        const y = from.y + (to.y - from.y) * f;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const size = 7 * scale;
        c.setTransform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), x, y);
        c.fillStyle = rgba(protoColor(colors, i + k), 0.55 * Math.sin(f * Math.PI));
        c.fillRect(-size, -size * 0.45, size * 2, size * 0.9);
        c.fillStyle = rgba(colors.bg, 0.6);
        c.fillRect(-size * 0.35, -size * 0.45, size * 0.12, size * 0.9);
      }
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of pts) {
      const r = (p.router ? 9 : 6) * scale;
      c.fillStyle = rgba(colors.bg, 0.9);
      c.strokeStyle = rgba(p.router ? colors.accent : colors.text, 0.5);
      c.beginPath();
      if (p.router) c.arc(p.x, p.y, r, 0, Math.PI * 2);
      else c.rect(p.x - r, p.y - r * 0.7, r * 2, r * 1.4);
      c.fill();
      c.stroke();
      if (p.router) {
        c.beginPath();
        c.moveTo(p.x - r * 0.55, p.y); c.lineTo(p.x + r * 0.55, p.y);
        c.moveTo(p.x, p.y - r * 0.55); c.lineTo(p.x, p.y + r * 0.55);
        c.stroke();
      }
    }
  }

  /** Core, distribution and access switches above the hosts; traffic runs down the tree and back. */
  topology(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const tiers = [2, 4, 8, 16].map((n, level) => Array.from({ length: n }, (_, i) => ({
      x: ((i + 0.5) / n) * w + Math.sin(time * 0.2 + i + level) * w * 0.004,
      y: h * (0.14 + level * 0.24),
    })));
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    for (let level = 1; level < tiers.length; level++) {
      tiers[level].forEach((node, i) => {
        const parents = level === 1 ? tiers[0] : [tiers[level - 1][Math.floor(i / 2)]];
        parents.forEach((parent, j) => {
          c.strokeStyle = rgba(colors.text, 0.13);
          c.beginPath(); c.moveTo(parent.x, parent.y); c.lineTo(node.x, node.y); c.stroke();
          const f = (time * 0.22 + hash(level * 31 + i, j)) % 1;
          const up = hash(i, level) > 0.5;
          const k = up ? 1 - f : f;
          c.fillStyle = rgba(up ? colors.accent2 ?? colors.accent : colors.accent, 0.7 * Math.sin(f * Math.PI));
          c.beginPath();
          c.arc(parent.x + (node.x - parent.x) * k, parent.y + (node.y - parent.y) * k, 3.2 * scale, 0, Math.PI * 2);
          c.fill();
        });
      });
    }
    tiers.forEach((list, level) => {
      const width = [34, 28, 22, 10][level] * scale;
      list.forEach((node, i) => {
        c.fillStyle = rgba(colors.bg, 0.92);
        c.strokeStyle = rgba(level < 3 ? colors.accent : colors.text, 0.5);
        c.beginPath();
        if (c.roundRect) c.roundRect(node.x - width / 2, node.y - width * 0.3, width, width * 0.6, 3 * scale);
        else c.rect(node.x - width / 2, node.y - width * 0.3, width, width * 0.6);
        c.fill();
        c.stroke();
        if (level < 3) {
          // Port lights.
          for (let k = 0; k < 4; k++) {
            const on = hash(level * 100 + i * 7 + k, Math.floor(time * 3)) > 0.4;
            c.fillStyle = rgba(on ? colors.accent : colors.text, on ? 0.75 : 0.15);
            c.fillRect(node.x - width * 0.36 + k * width * 0.2, node.y - 1.5 * scale, width * 0.1, 3 * scale);
          }
        }
      });
    });
  }

  /** A hex dump scrolling up — offset, sixteen bytes and their text — with a selection moving through it. */
  hexdump(c, w, h, time, colors) {
    const size = Math.max(11, Math.min(w / 62, h / 30));
    const line = size * 1.45;
    c.font = `${Math.round(size)}px ${MONO}`;
    const charW = c.measureText('0').width;
    const columns = Math.max(1, Math.floor(w / (charW * 78)));
    const blockW = w / columns;
    const scroll = time * 1.6;
    const first = Math.floor(scroll);
    const offsetY = (scroll - first) * line;
    const rows = Math.ceil(h / line) + 2;
    const printable = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/:-_';
    for (let col = 0; col < columns; col++) {
      const x0 = col * blockW + (blockW - charW * 74) / 2;
      const selected = Math.floor(time * 0.7 + col * 5) % 24;
      for (let row = 0; row < rows; row++) {
        const n = first + row + col * 997;
        const y = row * line - offsetY + line;
        const bytes = Array.from({ length: 16 }, (_, k) => Math.floor(hash(n, k + col * 17) * 256));
        const hit = (n % 24) === selected;
        if (hit) {
          c.fillStyle = rgba(colors.accent, 0.16);
          c.fillRect(x0 + charW * 9.5, y - size, charW * 48, line);
        }
        c.fillStyle = rgba(colors.accent, 0.4);
        c.fillText((n * 16 & 0xffff).toString(16).padStart(4, '0'), x0, y);
        c.fillStyle = rgba(colors.text, hit ? 0.55 : 0.26);
        c.fillText(bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '), x0 + charW * 10, y);
        c.fillStyle = rgba(colors.text, 0.17);
        c.fillText(bytes.map((b) => (b > 32 && b < 127 ? printable[b % printable.length] : '.')).join(''), x0 + charW * 59, y);
      }
    }
  }

  /** Line codes on an oscilloscope grid: an analogue carrier, NRZ bits and Manchester coding. */
  waveform(c, w, h, time, colors) {
    const cell = Math.max(w, h) / 20;
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.07);
    c.beginPath();
    for (let x = 0; x <= w; x += cell) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = 0; y <= h; y += cell) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();
    const step = Math.max(2, w / 400);
    const bit = w / 28;
    const shift = time * bit * 0.9;
    const bitAt = (x) => (hash(Math.floor((x + shift) / bit), 3) > 0.5 ? 1 : 0);
    const traces = [
      { y: 0.2, amp: 0.07, color: colors.accent, f: (x) => Math.sin((x + shift) / w * Math.PI * 14) * (0.6 + 0.4 * Math.sin((x + shift) / w * Math.PI * 2)) },
      { y: 0.5, amp: 0.06, color: colors.accent2 ?? colors.accent, f: (x) => (bitAt(x) ? 1 : -1) },
      { y: 0.8, amp: 0.06, color: colors.text, f: (x) => { const phase = ((x + shift) % bit) / bit; return (bitAt(x) ? 1 : -1) * (phase < 0.5 ? -1 : 1); } },
    ];
    c.lineWidth = Math.max(1.5, w / 900) * SIZE;
    for (const trace of traces) {
      c.strokeStyle = rgba(trace.color, 0.42);
      c.beginPath();
      for (let x = 0; x <= w; x += step) {
        const y = h * (trace.y - trace.amp * trace.f(x));
        c[x ? 'lineTo' : 'moveTo'](x, y);
      }
      c.stroke();
    }
    // The trigger cursor sweeping across.
    const sweep = ((time * 0.12) % 1) * w;
    c.strokeStyle = rgba(colors.accent, 0.25);
    c.beginPath(); c.moveTo(sweep, 0); c.lineTo(sweep, h); c.stroke();
  }

  /** Strands of fibre curving across, light pulses racing along them. */
  fiber(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const curve = (p, f) => {
      const y0 = (0.1 + p.y * 0.8) * h;
      const y1 = (0.1 + p.z * 0.8) * h;
      const a = (1 - f);
      const cy1 = y0 + Math.sin(time * 0.15 + p.h * 9) * h * 0.25;
      const cy2 = y1 - Math.cos(time * 0.12 + p.s * 9) * h * 0.25;
      return [w * (-0.05 + 1.1 * f), a * a * a * y0 + 3 * a * a * f * cy1 + 3 * a * f * f * cy2 + f * f * f * y1];
    };
    c.lineWidth = Math.max(1, w / 1200) * SIZE;
    this.items.forEach((p) => {
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath();
      for (let k = 0; k <= 40; k++) { const [x, y] = curve(p, k / 40); c[k ? 'lineTo' : 'moveTo'](x, y); }
      c.stroke();
    });
    c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
    this.items.forEach((p, i) => {
      for (let n = 0; n < 3; n++) {
        const head = (time * (0.08 + p.v * 0.08) + n / 3 + p.h) % 1;
        for (let k = 0; k < 8; k++) {
          const f = head - k * 0.006;
          if (f < 0) break;
          const [x, y] = curve(p, f);
          c.fillStyle = rgba(i % 3 ? colors.accent : colors.accent2 ?? colors.accent, 0.5 * (1 - k / 8));
          c.beginPath();
          c.arc(x, y, (3 - k * 0.25) * scale, 0, Math.PI * 2);
          c.fill();
        }
      }
    });
  }

  /** Access points sending out Wi-Fi rings, clients flickering as they talk to the nearest one. */
  wifi(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const aps = this.items.slice(0, 5).map((p) => ({ x: (0.1 + p.x * 0.8) * w, y: (0.12 + p.y * 0.76) * h }));
    const reach = Math.max(w, h) * 0.22;
    c.lineWidth = Math.max(1, w / 1200) * SIZE;
    aps.forEach((ap, i) => {
      for (let k = 0; k < 4; k++) {
        const f = (time * 0.18 + k / 4 + i * 0.13) % 1;
        c.strokeStyle = rgba(colors.accent, 0.4 * (1 - f));
        c.beginPath();
        c.arc(ap.x, ap.y, f * reach, 0, Math.PI * 2);
        c.stroke();
      }
    });
    this.items.slice(5).forEach((p, i) => {
      const x = (0.04 + p.x * 0.92 + Math.sin(time * 0.1 + p.h * 9) * 0.02) * w;
      const y = (0.05 + p.y * 0.9 + Math.cos(time * 0.08 + p.v * 9) * 0.02) * h;
      const ap = aps.reduce((best, a) => (Math.hypot(a.x - x, a.y - y) < Math.hypot(best.x - x, best.y - y) ? a : best), aps[0]);
      const talking = hash(i, Math.floor(time * 1.5 + p.s * 5)) > 0.6;
      if (talking) {
        c.strokeStyle = rgba(colors.accent2 ?? colors.accent, 0.35);
        c.setLineDash([4 * scale, 4 * scale]);
        c.beginPath(); c.moveTo(x, y); c.lineTo(ap.x, ap.y); c.stroke();
        c.setLineDash([]);
      }
      c.fillStyle = rgba(colors.text, talking ? 0.7 : 0.3);
      c.beginPath(); c.arc(x, y, 3.5 * scale, 0, Math.PI * 2); c.fill();
    });
    aps.forEach((ap) => {
      c.strokeStyle = rgba(colors.accent, 0.7);
      c.lineWidth = Math.max(1.5, w / 900) * SIZE;
      for (let k = 1; k <= 3; k++) {
        c.beginPath();
        c.arc(ap.x, ap.y + 6 * scale, k * 5 * scale, Math.PI * 1.25, Math.PI * 1.75);
        c.stroke();
      }
      c.fillStyle = rgba(colors.accent, 0.8);
      c.beginPath(); c.arc(ap.x, ap.y + 6 * scale, 2.2 * scale, 0, Math.PI * 2); c.fill();
    });
  }

  /** A scan sweeping round; hosts light up as it passes and fade until the next turn. */
  radar(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.hypot(w, h) * 0.5;
    const scale = (w / 1600 + 0.6) * SIZE;
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.09);
    c.beginPath();
    for (let k = 1; k <= 6; k++) { c.moveTo(cx + radius * k / 6, cy); c.arc(cx, cy, radius * k / 6, 0, Math.PI * 2); }
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); }
    c.stroke();
    const angle = (time * 0.6) % (Math.PI * 2);
    for (let k = 0; k < 24; k++) {
      const a = angle - k * 0.025;
      c.strokeStyle = rgba(colors.accent, 0.4 * (1 - k / 24));
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); c.stroke();
    }
    for (const p of this.items) {
      const a = p.h * Math.PI * 2;
      const d = (0.12 + p.v * 0.85) * Math.min(w, h) * 0.6 * (1 + p.s * 0.4);
      const since = ((angle - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const glow = 1 - since / (Math.PI * 2);
      const open = p.z > 0.65;
      c.fillStyle = rgba(open ? colors.accent2 ?? colors.accent : colors.text, 0.15 + glow * 0.7);
      c.beginPath();
      c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (2 + glow * 3) * scale, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** An I/O graph scrolling left: throughput areas over a grid, with a bar for each interval. */
  throughput(c, w, h, time, colors) {
    const rows = 6;
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.07);
    c.beginPath();
    for (let k = 1; k < rows; k++) { c.moveTo(0, h * k / rows); c.lineTo(w, h * k / rows); }
    c.stroke();
    const step = Math.max(3, w / 220);
    const shift = time * 0.35;
    const series = [
      { color: colors.accent, base: 0.55, amp: 0.22, f: 1.3 },
      { color: colors.accent2 ?? colors.text, base: 0.72, amp: 0.13, f: 2.1 },
      { color: colors.danger ?? colors.accent, base: 0.88, amp: 0.06, f: 3.3 },
    ];
    for (const s of series) {
      const at = (x) => { const u = x / w * 6 + shift; return h * (s.base - s.amp * (Math.sin(u * s.f) * 0.6 + Math.sin(u * s.f * 2.7 + 1) * 0.3 + Math.sin(u * 7.1) * 0.1)); };
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step) c.lineTo(x, at(x));
      c.lineTo(w, h);
      c.closePath();
      c.fillStyle = rgba(s.color, 0.1);
      c.fill();
      c.beginPath();
      for (let x = 0; x <= w + step; x += step) c[x ? 'lineTo' : 'moveTo'](x, at(x));
      c.strokeStyle = rgba(s.color, 0.45);
      c.lineWidth = Math.max(1.5, w / 1000) * SIZE;
      c.stroke();
    }
    const bar = w / 60;
    const offset = (time * 0.35 / 6 * w) % bar;
    for (let k = -1; k < 62; k++) {
      const n = Math.floor(time * 0.35 / 6 * 60) + k;
      const x = k * bar - offset;
      const value = hash(n, 11) * 0.12 + 0.02;
      c.fillStyle = rgba(colors.accent, 0.16);
      c.fillRect(x + bar * 0.2, h * (1 - value), bar * 0.6, h * value);
    }
  }

  /** A turning wireframe globe; arcs between cities carry packets across the internet. */
  globe(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const spin = time * 0.12;
    const tilt = 0.35;
    const project = (lat, lon) => {
      const x = Math.cos(lat) * Math.sin(lon + spin);
      const z0 = Math.cos(lat) * Math.cos(lon + spin);
      const y0 = Math.sin(lat);
      const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
      const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      return { x: cx + x * R, y: cy - y * R, z };
    };
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    const glow = c.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.25);
    glow.addColorStop(0, rgba(colors.accent, 0.12));
    glow.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = glow;
    c.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
    const drawLine = (fn) => {
      let front = false;
      c.beginPath();
      for (let k = 0; k <= 64; k++) {
        const p = fn(k / 64);
        if (p.z < 0) { front = false; continue; }
        c[front ? 'lineTo' : 'moveTo'](p.x, p.y);
        front = true;
      }
      c.stroke();
    };
    c.strokeStyle = rgba(colors.text, 0.12);
    for (let k = -2; k <= 2; k++) drawLine((f) => project(k * Math.PI / 6, f * Math.PI * 2));
    for (let k = 0; k < 12; k++) drawLine((f) => project(-Math.PI / 2 + f * Math.PI, k * Math.PI / 6));
    const cities = this.items.map((p) => ({ lat: (p.y - 0.5) * Math.PI * 0.8, lon: p.x * Math.PI * 2 }));
    const scale = (w / 1600 + 0.6) * SIZE;
    for (let i = 0; i + 1 < cities.length; i += 2) {
      const a = cities[i];
      const b = cities[i + 1];
      const pointAt = (f) => {
        const lat = a.lat + (b.lat - a.lat) * f;
        const lon = a.lon + (b.lon - a.lon) * f;
        const p = project(lat, lon);
        const lift = 1 + Math.sin(f * Math.PI) * 0.18;
        return { x: cx + (p.x - cx) * lift, y: cy + (p.y - cy) * lift, z: p.z };
      };
      c.strokeStyle = rgba(colors.accent, 0.3);
      drawLine(pointAt);
      const f = (time * 0.2 + hash(i, 5)) % 1;
      const p = pointAt(f);
      if (p.z >= 0) {
        c.fillStyle = rgba(colors.accent2 ?? colors.accent, 0.85);
        c.beginPath(); c.arc(p.x, p.y, 3 * scale, 0, Math.PI * 2); c.fill();
      }
    }
    for (const city of cities) {
      const p = project(city.lat, city.lon);
      if (p.z < 0) continue;
      c.fillStyle = rgba(colors.text, 0.3 + p.z * 0.5);
      c.beginPath(); c.arc(p.x, p.y, 2.2 * scale, 0, Math.PI * 2); c.fill();
    }
  }

  /** Rows of server racks, their status lights blinking with the traffic. */
  datacenter(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const racks = Math.max(6, Math.round(w / (90 * scale)));
    const rackW = w / racks;
    const unitH = 14 * scale;
    const units = Math.floor((h * 0.84) / unitH);
    const top = (h - units * unitH) / 2;
    const tick = Math.floor(time * 5);
    c.lineWidth = Math.max(1, w / 1600) * SIZE;
    for (let r = 0; r < racks; r++) {
      const x = r * rackW + rackW * 0.1;
      const width = rackW * 0.8;
      c.strokeStyle = rgba(colors.text, 0.16);
      c.strokeRect(x, top, width, units * unitH);
      for (let u = 0; u < units; u++) {
        const y = top + u * unitH;
        if (hash(r, u) < 0.12) continue; // an empty slot
        c.fillStyle = rgba(colors.text, 0.05);
        c.fillRect(x + 2, y + 1.5, width - 4, unitH - 3);
        for (let k = 0; k < 4; k++) {
          const busy = hash(r * 64 + u, k + tick * 4 + Math.floor(hash(u, r) * 9)) > 0.55;
          const fault = hash(r * 31 + u, k) > 0.985;
          c.fillStyle = fault ? rgba(colors.danger ?? colors.accent, 0.8) : rgba(k % 2 ? colors.accent : colors.accent2 ?? colors.accent, busy ? 0.75 : 0.12);
          c.fillRect(x + width - (k + 1) * 7 * scale, y + unitH * 0.35, 4 * scale, unitH * 0.3);
        }
      }
    }
  }

  /** Copper traces on a circuit board, signals running along them between pads. */
  circuit(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const toPx = (points) => points.map(([x, y]) => [x * w, y * h]);
    c.lineWidth = Math.max(1.5, w / 900) * SIZE;
    c.lineJoin = 'round';
    this.traces.forEach((trace, i) => {
      const pts = toPx(trace);
      c.strokeStyle = rgba(colors.accent, 0.16);
      c.beginPath();
      pts.forEach(([x, y], k) => c[k ? 'lineTo' : 'moveTo'](x, y));
      c.stroke();
      for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
        c.strokeStyle = rgba(colors.accent, 0.35);
        c.beginPath(); c.arc(x, y, 4 * scale, 0, Math.PI * 2); c.stroke();
      }
      const f = (time * (0.12 + this.items[i].v * 0.12) + this.items[i].h) % 1.4;
      if (f <= 1) {
        const [x, y] = along(pts, f);
        const g = c.createRadialGradient(x, y, 0, x, y, 10 * scale);
        g.addColorStop(0, rgba(colors.accent2 ?? colors.accent, 0.8));
        g.addColorStop(1, rgba(colors.accent2 ?? colors.accent, 0));
        c.fillStyle = g;
        c.fillRect(x - 10 * scale, y - 10 * scale, 20 * scale, 20 * scale);
      }
    });
    // A few chips the traces run between.
    for (let k = 0; k < 4; k++) {
      const x = (0.15 + hash(k, 1) * 0.7) * w;
      const y = (0.15 + hash(k, 2) * 0.7) * h;
      const s = 34 * scale;
      c.fillStyle = rgba(colors.bg, 0.85);
      c.strokeStyle = rgba(colors.text, 0.25);
      c.fillRect(x - s, y - s * 0.6, s * 2, s * 1.2);
      c.strokeRect(x - s, y - s * 0.6, s * 2, s * 1.2);
      c.beginPath();
      for (let p = 0; p < 6; p++) {
        const px = x - s * 0.8 + p * s * 0.32;
        c.moveTo(px, y - s * 0.6); c.lineTo(px, y - s * 0.85);
        c.moveTo(px, y + s * 0.6); c.lineTo(px, y + s * 0.85);
      }
      c.stroke();
    }
  }

  /** Columns of bits falling, grouped into bytes, each column led by a bright head. */
  bitstream(c, w, h, time, colors) {
    const column = w / this.items.length;
    const size = Math.min(column * 0.6, h / 22);
    c.font = `${Math.round(size)}px ${MONO}`;
    c.textAlign = 'center';
    const heads = this.items.map((p) => [(((p.y + time * (0.05 + p.v * 0.08)) % 1.4) - 0.1) * h, Math.floor(time * 4 + p.h * 10)]);
    for (let k = 0; k < 16; k++) {
      c.fillStyle = k === 0 ? rgba(colors.text, 0.75) : rgba(k % 8 === 0 ? colors.accent2 ?? colors.accent : colors.accent, 0.5 * (1 - k / 16));
      heads.forEach(([head, tick], i) => {
        const y = head - k * size * 1.2 - Math.floor(k / 8) * size * 0.6;
        if (y < -size || y > h + size) return;
        c.fillText(hash(i * 16 + k, tick) > 0.5 ? '1' : '0', (i + 0.5) * column, y);
      });
    }
  }

  /** A TCP flow diagram: hosts' lifelines and the handshake, request and teardown arrows scrolling up. */
  sequence(c, w, h, time, colors) {
    const hosts = ['Client', 'Router', 'DNS', 'Server'];
    const lanes = hosts.map((_, i) => w * (0.14 + i * 0.24));
    const size = Math.max(11, Math.min(w / 80, h / 40));
    c.font = `${Math.round(size)}px ${MONO}`;
    c.textAlign = 'center';
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    c.setLineDash([6, 6]);
    c.strokeStyle = rgba(colors.text, 0.14);
    c.beginPath();
    for (const x of lanes) { c.moveTo(x, 0); c.lineTo(x, h); }
    c.stroke();
    c.setLineDash([]);
    const script = [
      [0, 2, 'DNS A? example.com', 2], [2, 0, 'DNS A 93.184.216.34', 2], [0, 3, 'SYN', 0], [3, 0, 'SYN, ACK', 0], [0, 3, 'ACK', 0],
      [0, 3, 'TLS Client Hello', 1], [3, 0, 'TLS Server Hello', 1], [0, 3, 'GET /index.html', 1], [3, 0, '200 OK', 1],
      [0, 1, 'ICMP Echo', 3], [1, 0, 'ICMP Reply', 3], [0, 3, 'FIN, ACK', 0], [3, 0, 'FIN, ACK', 0], [0, 3, 'ACK', 0],
    ];
    const gap = size * 3.2;
    const scroll = time * size * 1.6;
    const first = Math.floor(scroll / gap);
    for (let k = 0; k < Math.ceil(h / gap) + 2; k++) {
      const n = first + k;
      const y = h - (n * gap - scroll) - gap * 0.5;
      if (y < -gap || y > h + gap) continue;
      const [from, to, label, colorIndex] = script[((n % script.length) + script.length) % script.length];
      const x1 = lanes[from];
      const x2 = lanes[to];
      const dir = Math.sign(x2 - x1);
      const color = protoColor(colors, colorIndex);
      c.strokeStyle = rgba(color, 0.45);
      c.beginPath();
      c.moveTo(x1, y); c.lineTo(x2, y + gap * 0.25);
      c.stroke();
      c.fillStyle = rgba(color, 0.5);
      c.beginPath();
      c.moveTo(x2, y + gap * 0.25);
      c.lineTo(x2 - dir * size * 0.8, y + gap * 0.25 - size * 0.45);
      c.lineTo(x2 - dir * size * 0.8, y + gap * 0.25 + size * 0.2);
      c.closePath();
      c.fill();
      c.fillStyle = rgba(colors.text, 0.32);
      c.fillText(label, (x1 + x2) / 2, y - size * 0.35);
    }
    c.fillStyle = rgba(colors.bg, 0.8);
    c.fillRect(0, 0, w, size * 2.4);
    c.fillStyle = rgba(colors.accent, 0.6);
    hosts.forEach((name, i) => c.fillText(name, lanes[i], size * 1.6));
  }

  /** The seven OSI layers; data goes down one stack gaining headers and up the other losing them. */
  layers(c, w, h, time, colors) {
    const names = ['7 Application', '6 Presentation', '5 Session', '4 Transport', '3 Network', '2 Data link', '1 Physical'];
    const band = h / 7;
    const size = Math.max(11, Math.min(band * 0.22, w / 70));
    c.font = `${Math.round(size)}px ${MONO}`;
    names.forEach((name, i) => {
      c.fillStyle = rgba(i % 2 ? colors.text : colors.accent, i % 2 ? 0.03 : 0.05);
      c.fillRect(0, i * band, w, band);
      c.fillStyle = rgba(colors.text, 0.22);
      c.textAlign = 'center';
      c.fillText(name, w / 2, i * band + band / 2 + size * 0.35);
    });
    const headers = [null, null, null, 'TCP', 'IP', 'ETH', null];
    const stacks = [w * 0.2, w * 0.8];
    const unit = Math.min(w * 0.035, band * 0.5);
    this.items.forEach((p, i) => {
      const f = (time * 0.06 + i / this.items.length) % 1;
      // 0–0.45 down the sender, 0.45–0.55 along the wire, 0.55–1 up the receiver.
      let x;
      let y;
      if (f < 0.45) { x = stacks[0]; y = (f / 0.45) * h * (6.5 / 7); }
      else if (f < 0.55) { x = stacks[0] + (stacks[1] - stacks[0]) * ((f - 0.45) / 0.1); y = h * (6.5 / 7); }
      else { x = stacks[1]; y = (1 - (f - 0.55) / 0.45) * h * (6.5 / 7); }
      const layer = Math.min(6, Math.floor(y / band));
      const added = headers.slice(0, layer + 1).filter(Boolean);
      const parts = [...added.reverse(), 'DATA'];
      const total = parts.length * unit * 1.25;
      let left = x - total / 2;
      const color = protoColor(colors, i);
      parts.forEach((part, k) => {
        const width = (part === 'DATA' ? 1.6 : 1) * unit;
        c.fillStyle = rgba(part === 'DATA' ? color : colors.accent2 ?? colors.accent, part === 'DATA' ? 0.4 : 0.3 + k * 0.05);
        c.fillRect(left, y - unit * 0.35, width - 2, unit * 0.7);
        left += width;
      });
    });
  }

  /** Hosts pinging their neighbours: an echo goes out, a ring spreads, the reply comes back. */
  pings(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const pts = this.items.map((p) => ({ x: (0.08 + p.x * 0.84) * w, y: (0.1 + p.y * 0.8) * h }));
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.08);
    c.beginPath();
    for (const [a, b] of this.links) { c.moveTo(pts[a].x, pts[a].y); c.lineTo(pts[b].x, pts[b].y); }
    c.stroke();
    this.links.forEach(([a, b], i) => {
      const period = 5 + hash(i, 1) * 4;
      const t = (time + hash(i, 2) * period) % period;
      const f = t / 2; // 0–1 echo request, 1–2 reply, then quiet
      if (f > 2) return;
      const out = f <= 1;
      const k = out ? f : 2 - f;
      const lost = hash(i, Math.floor((time + hash(i, 2) * period) / period)) > 0.88;
      if (!out && lost) return;
      const x = pts[a].x + (pts[b].x - pts[a].x) * k;
      const y = pts[a].y + (pts[b].y - pts[a].y) * k;
      c.fillStyle = rgba(out ? colors.accent : colors.accent2 ?? colors.accent, 0.8);
      c.beginPath(); c.arc(x, y, 3 * scale, 0, Math.PI * 2); c.fill();
      if (out && f < 0.4) {
        c.strokeStyle = rgba(colors.accent, 0.4 * (1 - f / 0.4));
        c.beginPath(); c.arc(pts[a].x, pts[a].y, f / 0.4 * 40 * scale, 0, Math.PI * 2); c.stroke();
      }
      if (out && lost && f > 0.95) {
        c.strokeStyle = rgba(colors.danger ?? colors.accent, 0.7);
        c.beginPath(); c.moveTo(x - 5 * scale, y - 5 * scale); c.lineTo(x + 5 * scale, y + 5 * scale); c.moveTo(x + 5 * scale, y - 5 * scale); c.lineTo(x - 5 * scale, y + 5 * scale); c.stroke();
      }
    });
    for (const p of pts) {
      c.fillStyle = rgba(colors.bg, 0.9);
      c.strokeStyle = rgba(colors.text, 0.45);
      c.beginPath(); c.arc(p.x, p.y, 6 * scale, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }

  /** Satellites on their orbits above the curve of the earth, relaying to ground stations and each other. */
  satellites(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const cx = w / 2;
    const R = Math.max(w * 0.9, h * 1.2);
    const cy = h + R * 0.82;
    const earth = c.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.04);
    earth.addColorStop(0, rgba(colors.accent, 0.14));
    earth.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = earth;
    c.fillRect(0, 0, w, h);
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    c.strokeStyle = rgba(colors.accent, 0.35);
    c.beginPath(); c.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    const stations = [0.2, 0.42, 0.62, 0.84].map((f) => {
      const a = Math.PI * (1.1 + f * 0.8);
      return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    });
    const sats = this.items.map((p, i) => {
      const orbit = R * (1.12 + p.s * 0.35);
      c.strokeStyle = rgba(colors.text, 0.07);
      c.beginPath(); c.arc(cx, cy, orbit, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      const a = Math.PI * (1.05 + (((p.h + time * 0.02 * (0.5 + p.v)) % 1) * 0.9));
      return { x: cx + Math.cos(a) * orbit, y: cy + Math.sin(a) * orbit, i };
    }).filter((s) => s.y > -20 && s.x > -20 && s.x < w + 20);
    c.setLineDash([5 * scale, 5 * scale]);
    for (const s of sats) {
      const ground = stations.reduce((best, g) => (Math.hypot(g.x - s.x, g.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y) ? g : best), stations[0]);
      c.strokeStyle = rgba(colors.accent2 ?? colors.accent, 0.3 + 0.2 * Math.sin(time * 3 + s.i));
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(ground.x, ground.y); c.stroke();
    }
    c.strokeStyle = rgba(colors.text, 0.15);
    for (let i = 0; i + 1 < sats.length; i++) { c.beginPath(); c.moveTo(sats[i].x, sats[i].y); c.lineTo(sats[i + 1].x, sats[i + 1].y); c.stroke(); }
    c.setLineDash([]);
    for (const s of sats) {
      c.fillStyle = rgba(colors.text, 0.65);
      c.fillRect(s.x - 3 * scale, s.y - 3 * scale, 6 * scale, 6 * scale);
      c.fillStyle = rgba(colors.accent, 0.5);
      c.fillRect(s.x - 13 * scale, s.y - 1.5 * scale, 8 * scale, 3 * scale);
      c.fillRect(s.x + 5 * scale, s.y - 1.5 * scale, 8 * scale, 3 * scale);
    }
    for (const g of stations) {
      c.fillStyle = rgba(colors.accent, 0.7);
      c.beginPath(); c.moveTo(g.x, g.y - 9 * scale); c.lineTo(g.x - 5 * scale, g.y); c.lineTo(g.x + 5 * scale, g.y); c.closePath(); c.fill();
    }
  }

  /** A conversation matrix: who talks to whom, cells warming and cooling with the traffic. */
  heatmap(c, w, h, time, colors) {
    const cell = Math.max(w, h) / 30;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const gap = Math.max(1, cell * 0.08);
    const hot = Math.floor(time * 0.3) % rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const base = hash(r, k);
        const v = base > 0.6 ? 0.5 + 0.5 * Math.sin(time * (0.4 + base) + base * 20) : base * 0.4;
        const highlight = r === hot ? 0.15 : 0;
        c.fillStyle = rgba(v > 0.8 ? colors.danger ?? colors.accent : colors.accent, 0.03 + v * 0.2 + highlight);
        c.fillRect(k * cell + gap, r * cell + gap, cell - gap * 2, cell - gap * 2);
      }
    }
  }

  /** A live capture's packet list: rows coloured by protocol arriving at the bottom and moving up. */
  packetlist(c, w, h, time, colors) {
    const size = Math.max(11, Math.min(w / 95, h / 40));
    const line = size * 1.7;
    c.font = `${Math.round(size)}px ${MONO}`;
    const columns = [0.02, 0.08, 0.17, 0.33, 0.49, 0.57, 0.64];
    const scroll = time * 2.2;
    const first = Math.floor(scroll);
    const offset = (scroll - first) * line;
    const rows = Math.ceil(h / line) + 2;
    const ip = (n, k) => `10.${Math.floor(hash(n, k) * 4)}.${Math.floor(hash(n, k + 1) * 255)}.${1 + Math.floor(hash(n, k + 2) * 250)}`;
    const infos = {
      TCP: '443 → 51322 [ACK] Seq=1 Ack=518 Win=501', TLS: 'Application Data', DNS: 'Standard query 0x1a2b A example.com',
      HTTP: 'GET /api/status HTTP/1.1', UDP: '5353 → 5353 Len=48', QUIC: 'Protected Payload (KP0)', ARP: 'Who has 10.0.0.1? Tell 10.0.0.23', ICMP: 'Echo (ping) request id=0x0001',
    };
    for (let k = 0; k < rows; k++) {
      const n = first + k;
      const y = h - k * line + offset - line * 0.3;
      if (y < -line || y > h + line) continue;
      const proto = PROTOCOLS[Math.floor(hash(n, 1) * PROTOCOLS.length)];
      const color = protoColor(colors, PROTOCOLS.indexOf(proto));
      c.fillStyle = rgba(color, k === 0 ? 0.2 : 0.07);
      c.fillRect(0, y - line * 0.72, w, line - 1);
      c.fillStyle = rgba(colors.text, 0.3);
      const cells = [String(n), (n * 0.0132).toFixed(4), ip(n, 2), ip(n, 7), proto, String(54 + Math.floor(hash(n, 9) * 1400)), infos[proto]];
      cells.forEach((text, i) => c.fillText(text, w * columns[i], y));
    }
  }

  /** A radio spectrum: Wi-Fi channels rising and falling, a waterfall of past readings below. */
  spectrum(c, w, h, time, colors) {
    const split = h * 0.55;
    const channels = [0.12, 0.27, 0.42, 0.62, 0.72, 0.82, 0.92];
    const level = (x) => channels.reduce((sum, at, i) => {
      const width = i < 3 ? 0.05 : 0.035;
      const height = 0.35 + 0.35 * Math.sin(time * (0.5 + hash(i, 3)) + i * 2) + 0.15 * Math.sin(time * 3.1 + i);
      return sum + height * Math.exp(-(((x - at) / width) ** 2));
    }, 0.04 + 0.02 * Math.sin(x * 90 + time * 6));
    c.lineWidth = 1;
    c.strokeStyle = rgba(colors.text, 0.07);
    c.beginPath();
    for (let k = 1; k < 10; k++) { c.moveTo(w * k / 10, 0); c.lineTo(w * k / 10, split); }
    for (let k = 1; k < 5; k++) { c.moveTo(0, split * k / 5); c.lineTo(w, split * k / 5); }
    c.stroke();
    const step = Math.max(2, w / 300);
    c.beginPath();
    c.moveTo(0, split);
    for (let x = 0; x <= w + step; x += step) c.lineTo(x, split - Math.min(0.95, level(x / w)) * split * 0.85);
    c.lineTo(w, split);
    c.closePath();
    const g = c.createLinearGradient(0, 0, 0, split);
    g.addColorStop(0, rgba(colors.accent, 0.35));
    g.addColorStop(1, rgba(colors.accent, 0.04));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = rgba(colors.accent, 0.55);
    c.lineWidth = Math.max(1.5, w / 1000) * SIZE;
    c.stroke();
    // The waterfall: each row an older reading.
    const rowH = Math.max(3, h / 120);
    const cellW = Math.max(4, w / 120);
    for (let r = 0; split + r * rowH < h; r++) {
      const past = time - r * 0.12;
      for (let x = 0; x < w; x += cellW) {
        const u = (x + cellW / 2) / w;
        const v = channels.reduce((sum, at, i) => sum + (0.35 + 0.35 * Math.sin(past * (0.5 + hash(i, 3)) + i * 2)) * Math.exp(-(((u - at) / (i < 3 ? 0.05 : 0.035)) ** 2)), 0);
        if (v < 0.08) continue;
        c.fillStyle = rgba(v > 0.6 ? colors.accent2 ?? colors.accent : colors.accent, Math.min(0.4, v * 0.35));
        c.fillRect(x, split + r * rowH, cellW - 1, rowH - 1);
      }
    }
  }

  /** A wireless mesh drifting; the route between two gateways is found hop by hop and lit up. */
  mesh(c, w, h, time, colors) {
    const scale = (w / 1600 + 0.6) * SIZE;
    const pts = this.items.map((p) => ({
      x: (p.x + Math.sin(time * 0.12 * (0.3 + p.v) + p.h * 9) * 0.05) * w,
      y: (p.y + Math.cos(time * 0.1 * (0.3 + p.s) + p.z * 9) * 0.05) * h,
    }));
    const reach = Math.min(w, h) * 0.26;
    const near = pts.map((p) => pts.map((q, j) => (Math.hypot(p.x - q.x, p.y - q.y) < reach ? j : -1)).filter((j) => j >= 0));
    c.lineWidth = Math.max(1, w / 1400) * SIZE;
    pts.forEach((p, i) => near[i].forEach((j) => {
      if (j <= i) return;
      const d = Math.hypot(p.x - pts[j].x, p.y - pts[j].y);
      c.strokeStyle = rgba(colors.text, 0.18 * (1 - d / reach));
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(pts[j].x, pts[j].y); c.stroke();
    }));
    // Breadth-first search for the fewest hops between the two gateways of this round.
    const round = Math.floor(time / 6);
    const from = Math.floor(hash(round, 1) * pts.length);
    const to = Math.floor(hash(round, 2) * pts.length);
    const previous = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length && !previous.has(to)) {
      const n = queue.shift();
      for (const j of near[n]) if (!previous.has(j)) { previous.set(j, n); queue.push(j); }
    }
    const route = [];
    if (previous.has(to)) for (let n = to; n !== -1; n = previous.get(n)) route.unshift(n);
    if (route.length > 1) {
      const shown = Math.min(route.length - 1, ((time % 6) / 3) * (route.length - 1));
      c.strokeStyle = rgba(colors.accent, 0.75);
      c.lineWidth = Math.max(2, w / 700) * SIZE;
      c.beginPath();
      c.moveTo(pts[route[0]].x, pts[route[0]].y);
      for (let k = 1; k <= Math.floor(shown); k++) c.lineTo(pts[route[k]].x, pts[route[k]].y);
      const part = shown - Math.floor(shown);
      if (part > 0 && Math.floor(shown) + 1 < route.length) {
        const a = pts[route[Math.floor(shown)]];
        const b = pts[route[Math.floor(shown) + 1]];
        c.lineTo(a.x + (b.x - a.x) * part, a.y + (b.y - a.y) * part);
      }
      c.stroke();
    }
    pts.forEach((p, i) => {
      const gateway = i === from || i === to;
      c.fillStyle = rgba(gateway ? colors.accent2 ?? colors.accent : route.includes(i) ? colors.accent : colors.text, gateway ? 0.9 : route.includes(i) ? 0.7 : 0.35);
      c.beginPath(); c.arc(p.x, p.y, (gateway ? 6 : 3.5) * scale, 0, Math.PI * 2); c.fill();
    });
  }
}
