/**
 * The start screen's moving backgrounds: twenty small 3D scenes.
 *
 * Each scene is drawn on one 2D canvas through a perspective camera — points, lines,
 * quads and text placed in a 3D world, rotated and flown through, projected with a
 * focal length, faded with depth — so it reads as depth and motion rather than as a
 * flat pattern, without a WebGL context to lose. Up to 30 frames a second times a
 * speed factor, sized to the device pixel ratio, and paused only while nobody can see
 * it: the window hidden, or `stop()` (the start screen is not showing).
 *
 * `prefers-reduced-motion` does not stop it — the user asked for a moving start
 * screen, and Windows reports reduced motion whenever its animation effects are off —
 * it only lowers the default speed (core/startScreen.ts `effectiveSpeed`); the speed control still
 * goes anywhere from 0 to 300 %.
 *
 * Every colour comes from the theme tokens on `:root` (`--bg`, `--accent`, `--text`,
 * `--added-accent`, ...), read again whenever the theme changes.
 *
 * The settings it is driven by (background, speed, shuffle, card opacity, card
 * layout) are app settings: core/startScreen.ts.
 */

import { BACKGROUND_KINDS, type BackgroundKind, DEFAULT_START_SCREEN, isBackgroundKind } from "../core/startScreen.js";

export { BACKGROUND_KINDS, isBackgroundKind };
export type { BackgroundKind };

/** Names from `src/icons.tsx`. */
export const BACKGROUND_ICONS: Record<BackgroundKind, string> = {
  diffLines: "compareFiles",
  mergeFlow: "merge",
  folderTrees: "tree",
  hexBytes: "hex",
  pixelDiff: "image",
  pairs: "link",
  history: "branch",
  overview: "statusBar",
  wordDiff: "letterCase",
  conflicts: "conflict",
  syncArrows: "sync",
  binaryRain: "binary",
  scanBeam: "find",
  tableCells: "grid",
  waveforms: "music",
  constellation: "commit",
  ripples: "dot",
  aurora: "sun",
  hexGrid: "archive",
  bubbles: "cloud",
};

/* ------------------------------------------------------------------ colours */

type Rgb = [number, number, number];

export type Palette = {
  bg: Rgb;
  panel: Rgb;
  accent: Rgb;
  text: Rgb;
  added: Rgb;
  removed: Rgb;
  modified: Rgb;
  conflict: Rgb;
  dark: boolean;
};

function cssRgb(value: string, fallback: Rgb): Rgb {
  const v = String(value || "").trim();
  let m = /^#([0-9a-f]{6})/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as Rgb;
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as Rgb;
  m = /^rgba?\(([^)]+)\)/i.exec(v);
  if (m) return m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map((x) => parseFloat(x)) as Rgb;
  return fallback;
}

/** The theme tokens on `:root`, as RGB triples. */
export function themePalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: Rgb) => cssRgb(css.getPropertyValue(name), fallback);
  const bg = read("--bg", [238, 241, 246]);
  const text = read("--text", [29, 36, 48]);
  const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  return {
    bg,
    panel: read("--panel", bg),
    accent: read("--accent", [59, 110, 168]),
    text,
    added: read("--added-accent", text),
    removed: read("--removed-accent", text),
    modified: read("--modified-accent", text),
    conflict: read("--conflict-accent", text),
    dark: lum < 0.5,
  };
}

const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k) as Rgb;
const TAU = Math.PI * 2;
const wrap = (value: number, size: number) => ((value % size) + size) % size;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------- camera */

/** A point after projection: screen position, scale at that depth and a depth fade. */
type P = { x: number; y: number; s: number; z: number; f: number };

/**
 * A perspective camera: the world is turned by `yaw` (around Y) and `pitch` (around X),
 * pushed `dist` units away, then projected. `far` is where things have faded out.
 */
function camera(w: number, h: number, yaw: number, pitch: number, dist: number, far = 18) {
  const focal = Math.min(w, h) * 0.95;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return (x: number, y: number, z: number): P | null => {
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp + dist;
    if (z2 < 0.15) return null;
    const s = focal / z2;
    return { x: w / 2 + x1 * s, y: h / 2 + y1 * s, s, z: z2, f: Math.max(0, Math.min(1, 1.15 - z2 / far)) };
  };
}

/* ------------------------------------------------------------------- engine */

const FRAME_MS = 1000 / 30;
type Status = 0 | 1 | 2 | 3; // equal, added, removed, modified
type Item = { x: number; y: number; z: number; a: number; b: number; c: number; lane: number; status: Status; value: number };
type Draw = { ctx: CanvasRenderingContext2D; w: number; h: number; t: number; c: Palette; k: number };
type Project = (x: number, y: number, z: number) => P | null;

export class StartBackground {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private palette: Palette;
  private speed: () => number;
  kind: BackgroundKind;
  private w = 1;
  private h = 1;
  private time = 0;
  private last = 0;
  private running = false;
  private wanted = false;
  private frame = 0;
  private raf = 0;
  private resizeObserver: ResizeObserver | null;
  private items: Item[] = [];
  private links: [number, number][] = [];

  constructor(canvas: HTMLCanvasElement, options: { kind?: BackgroundKind; speed?: () => number } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.palette = themePalette();
    this.speed = options.speed ?? (() => 1);
    this.kind = isBackgroundKind(options.kind) ? options.kind : DEFAULT_START_SCREEN.background;
    this.loop = this.loop.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.seed();
    this.resize();
  }

  /** Frames drawn so far; lets a test tell a running background from a still one. */
  get frames(): number {
    return this.frame;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setKind(kind: BackgroundKind): void {
    if (!isBackgroundKind(kind) || kind === this.kind) return;
    this.kind = kind;
    this.seed();
    if (!this.running) this.draw();
  }

  /** Another kind, at random; returns it. */
  shuffle(random = Math.random): BackgroundKind {
    const others = BACKGROUND_KINDS.filter((k) => k !== this.kind);
    const next = others[Math.floor(random() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  refreshColors(): void {
    this.palette = themePalette();
    if (!this.running) this.draw();
  }

  start(): void {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.wanted = false;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver?.disconnect();
  }

  private onVisibility() {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    } else if (this.wanted) {
      this.start();
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this.draw();
  }

  private loop(now: number) {
    if (!this.running) return;
    if (now - this.last >= FRAME_MS) {
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed();
      this.last = now;
      this.time += dt;
      this.draw();
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Items placed from a fixed seed, so a kind always starts the same way. */
  private seed() {
    const r = seeded(this.kind.length * 7919 + this.kind.charCodeAt(0) * 31 + 13);
    const status = (p: number): Status => {
      const x = r();
      return x < p ? 1 : x < p * 2 ? 2 : x < p * 3 ? 3 : 0;
    };
    this.items = Array.from({ length: 320 }, (_, i) => ({
      x: r() * 2 - 1, y: r() * 2 - 1, z: r() * 2 - 1, a: r(), b: r(), c: r(),
      lane: i % 3, status: status(0.08), value: Math.floor(r() * 256),
    }));
    if (this.kind === "constellation") {
      // Stars on a shell, each linked to its two nearest neighbours.
      const stars = this.items.slice(0, 140);
      for (const s of stars) {
        const len = Math.hypot(s.x, s.y, s.z) || 1;
        const radius = 2.2 + s.a * 1.4;
        s.x = (s.x / len) * radius;
        s.y = (s.y / len) * radius;
        s.z = (s.z / len) * radius;
      }
      this.links = [];
      stars.forEach((s, i) => {
        const near = stars
          .map((o, j) => [j, (o.x - s.x) ** 2 + (o.y - s.y) ** 2 + (o.z - s.z) ** 2] as const)
          .filter(([j]) => j !== i)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 2);
        for (const [j] of near) if (j > i) this.links.push([i, j]);
      });
    }
  }

  private draw() {
    const { ctx, w, h } = this;
    const c = this.palette;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = rgba(c.bg, 1);
    ctx.fillRect(0, 0, w, h);
    const d: Draw = { ctx, w, h, t: this.time, c, k: c.dark ? 1 : 0.85 };
    this[this.kind](d);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    this.frame += 1;
  }

  private tone(c: Palette, s: Status): Rgb {
    return s === 1 ? c.added : s === 2 ? c.removed : s === 3 ? c.modified : c.text;
  }

  /* ------------------------------------------------------- drawing helpers */

  private line(ctx: CanvasRenderingContext2D, a: P | null, b: P | null, color: Rgb, alpha: number, width = 1) {
    if (!a || !b) return;
    ctx.strokeStyle = rgba(color, alpha * Math.min(a.f, b.f));
    ctx.lineWidth = Math.max(0.5, width * Math.min(a.s, b.s) / 120);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private dot(ctx: CanvasRenderingContext2D, p: P | null, size: number, color: Rgb, alpha: number) {
    if (!p) return;
    ctx.fillStyle = rgba(color, alpha * p.f);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, size * p.s / 100), 0, TAU);
    ctx.fill();
  }

  private quad(ctx: CanvasRenderingContext2D, points: (P | null)[], fill: Rgb | null, alpha: number, stroke?: Rgb, strokeAlpha = 0) {
    if (points.some((p) => !p)) return;
    const ps = points as P[];
    const f = Math.min(...ps.map((p) => p.f));
    ctx.beginPath();
    ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = rgba(fill, alpha * f);
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = rgba(stroke, strokeAlpha * f);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ----------------------------------------------------------- the scenes */

  /** Flying down a corridor whose walls are the two files; changed lines bridge it. */
  private diffLines({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.25) * 0.18, Math.sin(t * 0.17) * 0.08, 0.2, 22);
    const depth = 24;
    const travel = t * 2.2;
    for (let i = 0; i < 120; i++) {
      const it = this.items[i];
      const z = wrap(i * 0.2 - travel, depth);
      const y = -1.3 + (i % 12) * 0.24;
      const len = 0.6 + it.a * 1.6;
      const tone = this.tone(c, it.status);
      const hot = it.status !== 0;
      if (it.status !== 1) this.line(ctx, p(-2.2, y, z), p(-2.2, y, z + len), hot ? tone : c.text, (hot ? 0.8 : 0.28) * k, 5);
      if (it.status !== 2) this.line(ctx, p(2.2, y, z), p(2.2, y, z + len), hot ? tone : c.text, (hot ? 0.8 : 0.28) * k, 5);
      if (hot) this.quad(ctx, [p(-2.2, y - 0.04, z), p(2.2, y - 0.04, z), p(2.2, y + 0.04, z + len * 0.4), p(-2.2, y + 0.04, z + len * 0.4)], tone, 0.16 * k);
    }
    for (let i = 0; i < 24; i++) {
      const z = wrap(i - travel, depth);
      this.line(ctx, p(-2.2, 1.6, z), p(2.2, 1.6, z), c.accent, 0.18 * k, 2);
    }
  }

  /** Base, local and remote spiralling towards you and twisting into one stream. */
  private mergeFlow({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.2) * 0.3, 0.25 + Math.sin(t * 0.15) * 0.1, 2.5, 22);
    const lanes = [c.added, c.accent, c.modified];
    for (const it of this.items) {
      const u = wrap(it.a + t * (0.05 + it.b * 0.03), 1);
      const merge = Math.min(1, Math.max(0, (u - 0.35) / 0.4));
      const ease = merge * merge * (3 - 2 * merge);
      const radius = 1.8 * (1 - ease) + 0.25 * it.c;
      const angle = (it.lane * TAU) / 3 + u * 6 + t * 0.4;
      const z = 16 - u * 17;
      const color = ease > 0.9 ? c.accent : mix(lanes[it.lane], c.accent, ease);
      this.dot(ctx, p(Math.cos(angle) * radius, Math.sin(angle) * radius, z), 4 + it.b * 4, color, 0.75 * k);
    }
  }

  /** Two cone trees turning side by side, the entries that differ lit and pulsing. */
  private folderTrees({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.25, 0.3, 7.5, 16);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    for (const side of [-1, 1]) {
      const nodes: { x: number; y: number; z: number; it: Item }[] = [];
      for (let i = 0; i < 40; i++) {
        const it = this.items[i];
        const level = i === 0 ? 0 : i < 6 ? 1 : i < 18 ? 2 : 3;
        const index = i === 0 ? 0 : i < 6 ? i - 1 : i < 18 ? i - 6 : i - 18;
        const count = [1, 5, 12, 22][level];
        const angle = (index / count) * TAU + level * 0.6;
        const radius = level * 0.75;
        nodes.push({ x: side * 2.4 + Math.cos(angle) * radius, y: -1.8 + level * 1.15, z: Math.sin(angle) * radius, it });
        if (level > 0) {
          const parentIndex = level === 1 ? 0 : level === 2 ? 1 + (index % 5) : 6 + (index % 12);
          const parent = nodes[parentIndex];
          this.line(ctx, p(parent.x, parent.y, parent.z), p(nodes[i].x, nodes[i].y, nodes[i].z), c.text, 0.25 * k, 1.5);
        }
      }
      for (const n of nodes) {
        const missing = (side < 0 && n.it.status === 1) || (side > 0 && n.it.status === 2);
        const tone = this.tone(c, n.it.status);
        const hot = n.it.status !== 0;
        this.dot(ctx, p(n.x, n.y, n.z), hot ? 9 + pulse * 4 : 7, hot ? tone : c.accent, (missing ? 0.2 : hot ? 0.9 : 0.6) * k);
      }
    }
  }

  /** A drum of hex bytes turning; the bytes that differ are lit. */
  private hexBytes({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.3, 0.2 + Math.sin(t * 0.2) * 0.1, 6.5, 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 28; col++) {
        const it = this.items[(row * 28 + col) % this.items.length];
        const angle = (col / 28) * TAU + row * 0.05;
        const q = p(Math.cos(angle) * 3, -2.1 + row * 0.35 + Math.sin(t + col) * 0.02, Math.sin(angle) * 3);
        if (!q) continue;
        const hot = it.status !== 0;
        ctx.font = `${Math.max(6, Math.round(q.s * 0.2))}px Consolas, monospace`;
        ctx.fillStyle = rgba(hot ? this.tone(c, it.status) : c.text, (hot ? 0.95 : 0.35) * q.f * k);
        ctx.fillText(((it.value + Math.floor(t * 2) * (hot ? 7 : 0)) & 255).toString(16).padStart(2, "0"), q.x, q.y);
      }
    }
    ctx.textAlign = "start";
  }

  /** A picture's difference map raised into a field of bars, orbited. */
  private pixelDiff({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.2, 0.55, 8, 16);
    const n = 18;
    const blobs = [0, 1, 2].map((i) => ({ x: Math.sin(t * (0.4 + i * 0.15) + i * 2) * 2.5, z: Math.cos(t * (0.33 + i * 0.1) + i) * 2.5, tone: [c.added, c.removed, c.modified][i] }));
    const bars: { x: number; z: number; v: number; tone: Rgb; depth: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = (i - n / 2) * 0.36;
        const z = (j - n / 2) * 0.36;
        let v = 0;
        let tone = c.text;
        for (const b of blobs) {
          const value = Math.max(0, 1 - Math.hypot(x - b.x, z - b.z) / 1.8);
          if (value > v) { v = value; tone = b.tone; }
        }
        const q = p(x, 0, z);
        bars.push({ x, z, v, tone, depth: q ? q.z : 0 });
      }
    }
    bars.sort((a, b) => b.depth - a.depth);
    for (const b of bars) {
      const top = 1 - b.v * 2.2;
      this.line(ctx, p(b.x, 1, b.z), p(b.x, top, b.z), b.v > 0.05 ? b.tone : c.text, (b.v > 0.05 ? 0.35 + b.v * 0.6 : 0.18) * k, 10);
    }
  }

  /** Two planes of points facing each other, linked in pairs; differing pairs light up. */
  private pairs({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.22, Math.sin(t * 0.3) * 0.25, 7, 15);
    for (let i = 0; i < 90; i++) {
      const it = this.items[i];
      const y = it.y * 2 + Math.sin(t + it.a * 6) * 0.1;
      const z = it.z * 2.4;
      const shift = it.status ? Math.sin(t * 1.4 + it.b * 6) * 0.5 : 0;
      const a = p(-2, y, z);
      const b = p(2, y + shift, z);
      const tone = it.status ? this.tone(c, it.status) : c.accent;
      this.line(ctx, a, b, tone, (it.status ? 0.6 : 0.14) * k, it.status ? 2 : 1);
      this.dot(ctx, a, 6, tone, 0.85 * k);
      this.dot(ctx, b, 6, tone, 0.85 * k);
    }
    for (const x of [-2, 2]) {
      this.quad(ctx, [p(x, -2.2, -2.6), p(x, -2.2, 2.6), p(x, 2.2, 2.6), p(x, 2.2, -2.6)], c.accent, 0.04 * k, c.accent, 0.25 * k);
    }
  }

  /** Flying over a commit graph laid on the floor: lanes, commits and merges. */
  private history({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.2) * 0.2, 0.45, 1.2, 20);
    const tones = [c.accent, c.added, c.modified, c.removed];
    const lanes = 4;
    const xOf = (lane: number) => (lane - (lanes - 1) / 2) * 1.1;
    const travel = t * 2;
    for (let lane = 0; lane < lanes; lane++) this.line(ctx, p(xOf(lane), 1.2, 0.3), p(xOf(lane), 1.2, 22), tones[lane], 0.35 * k, 3);
    for (let i = 0; i < 40; i++) {
      const it = this.items[i];
      const z = wrap(i * 0.55 - travel, 22);
      const lane = it.value % lanes;
      const merge = it.status ? (lane + 1 + (it.value % (lanes - 1))) % lanes : -1;
      if (merge >= 0 && z + 0.55 < 22) this.line(ctx, p(xOf(merge), 1.2, z + 0.55), p(xOf(lane), 1.2, z), tones[merge], 0.7 * k, 3);
      this.dot(ctx, p(xOf(lane), 1.2, z), merge >= 0 ? 12 : 8, tones[lane], 0.95 * k);
    }
  }

  /** A ring of overview rulers turning, each striped with change marks scrolling down. */
  private overview({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.2, 0.15, 7, 14);
    const count = 16;
    for (let s = 0; s < count; s++) {
      const angle = (s / count) * TAU;
      const x = Math.cos(angle) * 3.2;
      const z = Math.sin(angle) * 3.2;
      this.line(ctx, p(x, -2.4, z), p(x, 2.4, z), c.text, 0.12 * k, 16);
      for (let m = 0; m < 14; m++) {
        const it = this.items[(s * 14 + m) % this.items.length];
        if (!it.status) continue;
        const y = -2.4 + wrap(it.a * 4.8 + t * 0.5, 4.8);
        this.line(ctx, p(x, y, z), p(x, Math.min(2.4, y + 0.12 + it.b * 0.3), z), this.tone(c, it.status), 0.9 * k, 16);
      }
      const vy = Math.sin(t * 0.7 + s) * 1.6;
      this.line(ctx, p(x, vy - 0.5, z), p(x, vy + 0.5, z), c.accent, 0.35 * k, 24);
    }
  }

  /** A tunnel of words rushing past, inserted and deleted words marked. */
  private wordDiff({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, 0, 0, 0.1, 20);
    const roll = t * 0.15;
    for (let i = 0; i < 220; i++) {
      const it = this.items[i];
      const angle = it.a * TAU + roll;
      const radius = 2.2;
      const z = wrap(it.z * 10 + 10 - t * 2.5, 20);
      const span = 0.2 + it.b * 0.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const tone = it.status ? this.tone(c, it.status) : c.text;
      const hot = it.status !== 0;
      const a = p(x, y, z);
      const b = p(x, y, z + span);
      this.line(ctx, a, b, tone, (hot ? 0.85 : 0.3) * k, hot ? 10 : 7);
      if (it.status === 2 && a && b) this.line(ctx, p(x * 0.97, y * 0.97, z), p(x * 0.97, y * 0.97, z + span), c.removed, 0.9 * k, 2);
    }
  }

  /** Conflict blocks floating towards you, each turning; some get resolved on the way. */
  private conflicts({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, 0, 0, 0.5, 22);
    const blocks = this.items.slice(0, 26).map((it) => ({ it, z: wrap(it.z * 11 + 11 - t * 1.6, 22) })).sort((a, b) => b.z - a.z);
    for (const { it, z } of blocks) {
      const cx = it.x * 3.4;
      const cy = it.y * 2;
      const turn = t * (0.4 + it.a * 0.5) + it.b * 6;
      const cs = Math.cos(turn);
      const sn = Math.sin(turn);
      const at = (u: number, v: number) => p(cx + u * cs, cy + v, z + u * sn);
      const resolved = Math.sin(t * 0.6 + it.c * 6) > 0.5;
      this.quad(ctx, [at(-0.7, -0.55), at(0.7, -0.55), at(0.7, 0.55), at(-0.7, 0.55)], c.panel, 0.55 * k, resolved ? c.added : c.conflict, 0.9 * k);
      const bar = (v: number, tone: Rgb, len: number) => this.line(ctx, at(-0.6, v), at(-0.6 + len, v), tone, 0.85 * k, 5);
      bar(-0.42, resolved ? c.text : c.conflict, 1.2);
      bar(-0.25, c.added, 0.9 * it.a + 0.2);
      bar(-0.1, c.added, 0.7);
      bar(0.05, resolved ? c.text : c.conflict, 1.2);
      bar(0.2, c.modified, 0.6 + it.b * 0.4);
      bar(0.42, resolved ? c.text : c.conflict, 1.2);
    }
  }

  /** Two folder towers with files arcing between them both ways. */
  private syncArrows({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.25, 0.25, 8, 16);
    for (const x of [-2.5, 2.5]) {
      for (let level = 0; level < 9; level++) {
        const y = 2 - level * 0.5;
        const s = 0.55;
        this.quad(ctx, [p(x - s, y, -s), p(x + s, y, -s), p(x + s, y, s), p(x - s, y, s)], c.accent, 0.08 * k, c.accent, 0.4 * k);
      }
    }
    for (let i = 0; i < 40; i++) {
      const it = this.items[i];
      const u = wrap(it.a + t * (0.12 + it.b * 0.1), 1);
      const toRight = it.status !== 2;
      const x = toRight ? -2.5 + u * 5 : 2.5 - u * 5;
      const y0 = 2 - (it.value % 9) * 0.5;
      const y = y0 - Math.sin(u * Math.PI) * 1.4;
      const z = (it.c - 0.5) * 0.8;
      const tone = toRight ? c.added : c.modified;
      this.dot(ctx, p(x, y, z), 8, tone, 0.9 * k);
      const back = toRight ? -0.25 : 0.25;
      this.line(ctx, p(x, y, z), p(x + back, y - Math.cos(u * Math.PI) * 0.25 * (toRight ? 1 : -1) * -1, z), tone, 0.5 * k, 3);
    }
  }

  /** Bits falling through space around you; the bits that differ glow. */
  private binaryRain({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.12, -0.15, 1, 14);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 160; i++) {
      const it = this.items[i];
      const x = it.x * 5;
      const z = it.z * 5 + 6;
      const head = 3 - wrap(it.a * 8 + t * (1.2 + it.b * 1.6), 8);
      for (let j = 0; j < 6; j++) {
        const q = p(x, head - j * 0.28, z);
        if (!q) continue;
        const cell = this.items[(i * 7 + j) % this.items.length];
        const hot = cell.status !== 0;
        ctx.font = `${Math.max(6, Math.round(q.s * 0.22))}px Consolas, monospace`;
        ctx.fillStyle = rgba(hot ? this.tone(c, cell.status) : j === 0 ? c.accent : c.text, (hot ? 0.95 : j === 0 ? 0.9 : 0.4 * (1 - j / 6)) * q.f * k);
        ctx.fillText(cell.value & 1 ? "1" : "0", q.x, q.y);
      }
    }
    ctx.textAlign = "start";
  }

  /** A document lying flat, a wall of light sweeping across it lighting the changes. */
  private scanBeam({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.2) * 0.4, 0.6, 6, 14);
    const beam = -3 + wrap(t * 0.9, 6.5);
    for (let i = 0; i < 30; i++) {
      const it = this.items[i];
      const z = -3 + i * 0.2;
      const lit = it.status !== 0 && beam > z;
      const tone = lit ? this.tone(c, it.status) : c.text;
      for (const [x0, len] of [[-2.8, 2.2 * (0.3 + it.a * 0.7)], [0.3, 2.2 * (0.3 + it.b * 0.7)]] as const) {
        this.line(ctx, p(x0, 0.8, z), p(x0 + len, 0.8, z), tone, (lit ? 0.95 : 0.3) * k, 5);
      }
    }
    this.quad(ctx, [p(-3.2, 0.85, beam), p(3.2, 0.85, beam), p(3.2, -1.2, beam), p(-3.2, -1.2, beam)], c.accent, 0.12 * k, c.accent, 0.8 * k);
  }

  /** Flying low over a spreadsheet; changed cells pulse in turn. */
  private tableCells({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.15) * 0.15, 0.5, 1.5, 18);
    const travel = t * 1.4;
    const cw = 1;
    const ch = 0.5;
    for (let row = 0; row < 36; row++) {
      const z = wrap(row * ch - travel, 18);
      for (let col = -5; col < 5; col++) {
        const it = this.items[wrap(row * 13 + col * 7 + Math.floor((row * ch - travel) / 18) * 5, this.items.length)];
        const x = col * cw;
        const hot = it.value % 7 === 0;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + it.value);
        const tone = hot ? this.tone(c, ((it.value >> 3) % 3 + 1) as Status) : c.text;
        this.quad(ctx, [p(x + 0.04, 1.2, z), p(x + cw - 0.04, 1.2, z), p(x + cw - 0.04, 1.2, z + ch - 0.04), p(x + 0.04, 1.2, z + ch - 0.04)],
          hot ? tone : null, (0.2 + 0.45 * pulse) * k, c.text, 0.22 * k);
      }
    }
  }

  /** Two waveforms as ridges of a landscape you fly over, the gaps between them shaded. */
  private waveforms({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, 0, 0.35, 1.5, 18);
    const travel = t * 1.5;
    for (let row = 0; row < 30; row++) {
      const zWorld = row * 0.6 + Math.floor(travel / 0.6) * 0.6;
      const z = row * 0.6 - wrap(travel, 0.6);
      const wave = (x: number, shift: number) =>
        Math.sin(x * 1.1 + zWorld * 0.5 + shift) * 0.35 + Math.sin(x * 2.7 - zWorld * 0.3) * 0.15;
      let prevA: P | null = null;
      let prevB: P | null = null;
      for (let i = 0; i <= 40; i++) {
        const x = -5 + i * 0.25;
        const a = p(x, 1 - wave(x, 0), z);
        const b = p(x, 1 - wave(x, 0.6 + 0.4 * Math.sin(zWorld * 0.2)), z);
        this.line(ctx, prevA, a, c.accent, 0.6 * k, 2);
        this.line(ctx, prevB, b, c.modified, 0.45 * k, 2);
        if (prevA && prevB && a && b && Math.abs(a.y - b.y) > 2) {
          this.quad(ctx, [prevA, a, b, prevB], a.y < b.y ? c.added : c.removed, 0.18 * k);
        }
        prevA = a;
        prevB = b;
      }
    }
  }

  /** A turning globe of stars, each linked to its nearest neighbours. */
  private constellation({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.18, Math.sin(t * 0.12) * 0.4, 7, 13);
    const stars = this.items.slice(0, 140);
    const projected = stars.map((s) => p(s.x, s.y, s.z));
    for (const [i, j] of this.links) this.line(ctx, projected[i], projected[j], c.accent, 0.35 * k, 1.5);
    stars.forEach((s, i) => {
      const twinkle = 0.6 + 0.4 * Math.sin(t * (1 + s.b * 2) + s.c * 6);
      this.dot(ctx, projected[i], 5 + s.b * 4, s.status ? this.tone(c, s.status) : c.accent, twinkle * k);
    });
  }

  /** A wire surface with rings of change spreading across it. */
  private ripples({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.12, 0.6, 7.5, 16);
    const sources = [0, 1, 2].map((i) => ({ x: Math.sin(i * 2.1 + t * 0.1) * 2, z: Math.cos(i * 1.7 + t * 0.13) * 2, tone: [c.accent, c.added, c.modified][i] }));
    const height = (x: number, z: number) => {
      let y = 0;
      for (const s of sources) {
        const d = Math.hypot(x - s.x, z - s.z);
        y += Math.sin(d * 3 - t * 3) * 0.25 / (1 + d);
      }
      return y;
    };
    const n = 26;
    const size = 0.3;
    for (let i = 0; i < n; i++) {
      let prevX: P | null = null;
      let prevZ: P | null = null;
      for (let j = 0; j < n; j++) {
        const a = (i - n / 2) * size;
        const b = (j - n / 2) * size;
        const qx = p(a, 0.6 - height(a, b), b);
        const qz = p(b, 0.6 - height(b, a), a);
        this.line(ctx, prevX, qx, c.accent, 0.4 * k, 1.5);
        this.line(ctx, prevZ, qz, c.text, 0.18 * k, 1.5);
        prevX = qx;
        prevZ = qz;
      }
    }
    for (const s of sources) this.dot(ctx, p(s.x, 0.6 - height(s.x, s.z), s.z), 10, s.tone, 0.9 * k);
  }

  /** Curtains of light hanging in the sky, swaying as you circle under them. */
  private aurora({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.1, -0.35, 6, 16);
    const tones = [c.accent, c.added, c.modified];
    tones.forEach((tone, band) => {
      for (let i = 0; i < 70; i++) {
        const u = i / 70;
        const angle = u * TAU;
        const radius = 3 + band * 0.9 + Math.sin(u * 9 + t * 0.8 + band) * 0.5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const top = -2.6 - Math.sin(u * 13 + t * 1.2 + band) * 0.5;
        const a = p(x, top, z);
        const b = p(x, top + 1.6 + band * 0.2, z);
        if (!a || !b) continue;
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, rgba(tone, 0));
        g.addColorStop(0.5, rgba(tone, 0.5 * a.f * k));
        g.addColorStop(1, rgba(tone, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, a.s * 0.12);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
  }

  /** Gliding over a honeycomb floor with waves of light running through it. */
  private hexGrid({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, Math.sin(t * 0.15) * 0.2, 0.55, 1.5, 16);
    const r = 0.5;
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    const travel = t * 1.2;
    const shift = wrap(travel, dy * 2);
    for (let row = 0; row < 24; row++) {
      for (let col = -7; col <= 7; col++) {
        const worldRow = row + Math.floor(travel / (dy * 2)) * 2;
        const x = col * dx + (worldRow % 2 ? dx / 2 : 0);
        const z = row * dy - shift;
        const wave = Math.max(0, Math.sin(Math.hypot(x, worldRow * dy) * 0.7 - t * 2.5));
        const corners = Array.from({ length: 6 }, (_, i) => {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          return p(x + (r - 0.04) * Math.cos(a), 1.3, z + (r - 0.04) * Math.sin(a));
        });
        this.quad(ctx, corners, wave > 0.55 ? c.accent : null, (wave - 0.55) * 1.2 * k, c.text, 0.25 * k);
      }
    }
  }

  /** Bubbles rising all around, nearer ones bigger and brighter. */
  private bubbles({ ctx, w, h, t, c, k }: Draw) {
    const p = camera(w, h, t * 0.1, -0.1, 1, 14);
    const list = this.items.slice(0, 120).map((it) => {
      const y = 3 - wrap(it.a * 7 + t * (0.4 + it.b * 0.5), 7);
      return { it, q: p(it.x * 4 + Math.sin(t + it.c * 6) * 0.2, y, it.z * 4 + 5) };
    }).filter((b) => b.q).sort((a, b) => b.q!.z - a.q!.z);
    for (const { it, q } of list) {
      const tone = it.status ? this.tone(c, it.status) : c.accent;
      const radius = Math.max(1, q!.s * (0.08 + it.b * 0.12));
      ctx.strokeStyle = rgba(tone, 0.7 * q!.f * k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q!.x, q!.y, radius, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(tone, 0.1 * q!.f * k);
      ctx.fill();
      ctx.fillStyle = rgba(c.text, 0.35 * q!.f * k);
      ctx.beginPath();
      ctx.arc(q!.x - radius * 0.35, q!.y - radius * 0.35, radius * 0.18, 0, TAU);
      ctx.fill();
    }
  }
}
