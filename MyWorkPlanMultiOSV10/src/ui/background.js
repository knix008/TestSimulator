// Moving backgrounds for the start page and (faintly) behind the views:
// aurora, waves, particles, constellation, bubbles, a flowing grid, drifting
// Gantt bars and a star field. Colours follow the theme. The animation pauses
// while the window is hidden; `frames` counts drawn frames (tests use it).
export const ANIMATION_KINDS = ['aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'gantt', 'starfield'];

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [128, 128, 128];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'aurora' } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'aurora';
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
    const count = { particles: 90, constellation: 70, bubbles: 40, gantt: 26, starfield: 220 }[this.kind] ?? 0;
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
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt * this.speed();
    this.draw();
    requestAnimationFrame(this.loop);
  }

  draw() {
    const { context: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const colors = this.colors();
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
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
      const r = (1 + p.s * 3) * (w / 1400 + 0.6);
      c.fillStyle = rgba(p.h > 0.5 ? colors.accent : colors.text, 0.25 + p.z * 0.45);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  constellation(c, w, h, time, colors) {
    const points = this.items.map((p) => [((p.x + Math.sin(time * 0.15 + p.h * 9) * 0.04) % 1 + 1) % 1 * w, ((p.y + Math.cos(time * 0.12 + p.v * 9) * 0.04) % 1 + 1) % 1 * h]);
    const limit = Math.min(w, h) * 0.16;
    c.lineWidth = Math.max(1, w / 1600);
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
      c.arc(x, y, Math.max(1.5, w / 900), 0, Math.PI * 2);
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
    c.lineWidth = Math.max(1, w / 1400);
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

  /** Gantt bars drifting across, linked by thin arrows — the app's own motif. */
  gantt(c, w, h, time, colors) {
    const rowH = h / this.items.length;
    let previous = null;
    this.items.forEach((p, i) => {
      const length = (0.08 + p.s * 0.22) * w;
      const x = ((p.x + time * 0.015 * (0.4 + p.v)) % 1.3 - 0.15) * w;
      const y = i * rowH + rowH * 0.3;
      const height = rowH * 0.42;
      c.fillStyle = rgba(p.h > 0.75 ? colors.danger ?? colors.accent : colors.accent, 0.22);
      c.strokeStyle = rgba(colors.accent, 0.45);
      c.lineWidth = 1;
      c.beginPath();
      c.roundRect?.(x, y, length, height, height / 2);
      if (!c.roundRect) c.rect(x, y, length, height);
      c.fill();
      c.stroke();
      c.fillStyle = rgba(colors.accent, 0.35);
      c.fillRect(x + 2, y + height * 0.3, length * p.z * 0.9, height * 0.4);
      if (previous && previous.x + previous.length < x + length) {
        c.strokeStyle = rgba(colors.text, 0.18);
        c.beginPath();
        c.moveTo(previous.x + previous.length, previous.y + height / 2);
        c.lineTo(previous.x + previous.length + 10, previous.y + height / 2);
        c.lineTo(previous.x + previous.length + 10, y + height / 2);
        c.stroke();
      }
      previous = { x, y, length };
    });
  }

  starfield(c, w, h, time, colors) {
    const cx = w / 2;
    const cy = h / 2;
    for (const p of this.items) {
      const z = 1 - ((p.z + time * 0.08 * (0.5 + p.v)) % 1);
      const x = cx + ((p.x - 0.5) * w) / (z * 1.4 + 0.05);
      const y = cy + ((p.y - 0.5) * h) / (z * 1.4 + 0.05);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const r = Math.max(0.6, (1 - z) * 2.6) * (w / 1600 + 0.6);
      c.fillStyle = rgba(p.h > 0.7 ? colors.accent : colors.text, Math.min(1, (1 - z) * 1.4));
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
}
