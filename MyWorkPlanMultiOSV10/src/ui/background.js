// Moving backgrounds for the start page and (faintly) behind the views — all of
// them pictures of project planning (the list is ANIMATIONS in settings): a timeline,
// drifting Gantt bars, a kanban board, a dependency network, a burndown chart, a
// calendar, the critical path, milestones, progress, a resource histogram, sprint
// cycles and a blueprint. Colours follow the theme. The animation pauses while the
// window is hidden; `frames` counts drawn frames (tests use it).
import { ANIMATIONS } from '../domain/settings.js';
import { PLAN_SCENE_ITEMS, PLAN_SCENES } from './background-plan.js';

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

const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'timeline' } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : 'timeline';
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
    const count = { gantt: 26, milestones: 9, ...PLAN_SCENE_ITEMS }[this.kind] ?? 0;
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
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = this[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
  }

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

  milestones(c, w, h, time, colors) {
    const rows = this.items.length;
    const size = Math.min(w, h) / 70 + 4;
    c.lineWidth = Math.max(1, w / 1600);
    this.items.forEach((p, i) => {
      const y = ((i + 0.5) / rows) * h;
      c.strokeStyle = rgba(colors.text, 0.08);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      for (let j = 0; j < 3; j++) {
        const x = ((((p.x + j / 3 + time * 0.02 * (0.4 + p.v) * (i % 2 ? -1 : 1)) % 1) + 1) % 1) * (w + size * 4) - size * 2;
        c.beginPath();
        c.moveTo(x, y - size);
        c.lineTo(x + size, y);
        c.lineTo(x, y + size);
        c.lineTo(x - size, y);
        c.closePath();
        c.fillStyle = rgba(j === 0 && p.h > 0.6 ? colors.danger ?? colors.accent : colors.accent, 0.28);
        c.fill();
        c.strokeStyle = rgba(colors.accent, 0.5);
        c.stroke();
      }
    });
  }
}

// The planning scenes (timeline, kanban, network, burndown, calendar, critical path, progress, resources, sprint, blueprint).
Object.assign(AnimatedBackground.prototype, PLAN_SCENES);
