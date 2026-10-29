// Moving backgrounds for the start page. The engine is MyCodeChecker's
// (src/lib/startBackground.js, from MyHeatManager): one canvas, 30 frames a
// second times a speed factor, paused while the window is hidden,
// devicePixelRatio aware, soft shapes in the theme's bg / accent / text
// colours (dark and light aware). The kinds are about buildings and their
// drawings; "model3d" (the live 3D sample) is drawn by start.js instead.

export const ANIMATION_KINDS = ["blueprint", "floorplans", "skyline", "cranes", "massing", "structGrid", "truss", "sunPath", "dimensions", "tiles", "particles", "constellation", "facade", "brickwork", "arches", "contours", "staircase", "wireframe", "hatching", "timberFrame", "model3d"];

/** Icon names (icons.js) for the kinds. */
export const ANIMATION_ICONS = {
  blueprint: "floorplan", floorplans: "room", skyline: "building", cranes: "tower", massing: "massShape", structGrid: "gridline", truss: "bridge",
  sunPath: "sunlight", dimensions: "dimension", tiles: "material", particles: "dots", constellation: "bulbRays",
  facade: "elevation", brickwork: "wall", arches: "column", contours: "skTerrain", staircase: "stairs", wireframe: "box3d", hatching: "section", timberFrame: "roof", model3d: "cube",
};

/** Names and descriptions (English keys for t()). */
export const ANIMATION_NAMES = {
  blueprint: ["Blueprint", "Walls drawn line by line on blueprint paper"],
  floorplans: ["Floor plans", "Rooms split and furnished, plan after plan"],
  skyline: ["Skyline", "A city at dusk, windows lighting up"],
  cranes: ["Cranes", "Tower cranes lifting loads over a building site"],
  massing: ["Massing", "Isometric blocks growing like a massing study"],
  structGrid: ["Structural grid", "Grid lines, bubbles and columns"],
  truss: ["Truss bridge", "A load travelling across a steel truss"],
  sunPath: ["Sun path", "The sun crossing the sky, shadows turning"],
  dimensions: ["Dimensions", "Dimension lines and figures appearing"],
  tiles: ["Floor tiles", "A floor pattern shimmering in the light"],
  particles: ["Particles", "Drifting dots, linked when close"],
  constellation: ["Constellation", "Stars joined into lines"],
  facade: ["Facade", "A tower's elevation, floors lighting up at night"],
  brickwork: ["Brickwork", "Bricks laid course by course in running bond"],
  arches: ["Arcade", "A colonnade of arches passing by"],
  contours: ["Site contours", "Contour lines of a site, rising and falling"],
  staircase: ["Staircase", "Steps climbing floor after floor"],
  wireframe: ["Wireframe", "A wireframe building turning slowly"],
  hatching: ["Section hatching", "Section cuts filled with material hatches"],
  timberFrame: ["Timber frame", "A house frame raised post by post, beam by beam"],
  model3d: ["3D model", "The two-storey house turning in 3D"],
};

export const DEFAULT_START_BACKGROUND = { kind: "blueprint", speed: 100, transparency: 0, shuffleSec: 0, random: false, layout: null };

const FRAME_MS = 1000 / 30;

function random(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function cssRgb(value, fallback) {
  const v = String(value || "").trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = /^rgba?\(([^)]+)\)/i.exec(v);
  if (m) return m[1].split(",").slice(0, 3).map((x) => parseFloat(x));
  return fallback;
}

const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, a))})`;
const mix = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));

/** Colours from the theme tokens on :root (RGB arrays). */
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const bg = cssRgb(css.getPropertyValue("--bg"), [21, 24, 30]);
  const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  return {
    bg,
    accent: cssRgb(css.getPropertyValue("--accent"), [76, 141, 255]),
    text: cssRgb(css.getPropertyValue("--text"), [228, 233, 240]),
    muted: cssRgb(css.getPropertyValue("--muted"), [140, 150, 165]),
    danger: cssRgb(css.getPropertyValue("--danger"), [255, 107, 107]),
    ok: cssRgb(css.getPropertyValue("--ok"), [74, 222, 128]),
    warn: cssRgb(css.getPropertyValue("--warn"), [245, 196, 81]),
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
  constructor(canvas, { colors = themeColors, speed = () => 1, kind = "blueprint" } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.colors = colors;
    this.palette = colors();
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : "blueprint";
    this.time = 0;
    this.running = false;
    this.wanted = false;
    this.last = 0;
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.running = false; else if (this.wanted) this.start(); };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    if (this.resizeObserver) this.resizeObserver.observe(canvas);
    this.resize();
  }

  setKind(kind) {
    if (!ANIMATION_KINDS.includes(kind) || kind === this.kind) return;
    this.kind = kind;
    this.time = 0;
    this.seed();
    if (!this.running) this.draw(0);
  }

  // Another kind (never the 3D model, which start.js draws).
  shuffle(rand = Math.random) {
    const others = ANIMATION_KINDS.filter((k) => k !== this.kind && k !== "model3d");
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

  // Items of the current kind, placed with a fixed seed so a kind always starts the same way.
  seed() {
    const r = random(this.kind.length * 7919 + 11);
    this.rand = r;
    const w = this.w || 1000, h = this.h || 700;
    const n = { particles: 110, constellation: 90, cranes: 3, massing: 26 }[this.kind] || 0;
    this.items = Array.from({ length: n }, (_, i) => ({ x: r() * w, y: r() * h, a: r(), b: r(), c: r(), i }));
    if (this.kind === "constellation") this.buildEdges(r);
    if (this.kind === "skyline") this.buildSkyline(r);
    if (this.kind === "blueprint" || this.kind === "floorplans") this.plans = [];
    if (this.kind === "dimensions") this.dims = [];
    if (this.kind === "cranes") this.items.forEach((p, i) => { p.x = w * (0.2 + i * 0.3); p.y = h * (0.86 - 0.04 * (i % 2)); p.mast = h * (0.48 + 0.14 * p.b); p.jib = 140 + 120 * p.c; });
  }

  buildEdges(r) {
    const pts = this.items;
    this.edges = [];
    for (let i = 0; i < pts.length; i++) {
      const near = pts.map((q, j) => [j, (q.x - pts[i].x) ** 2 + (q.y - pts[i].y) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of near) if (!this.edges.some((e) => e.a === j && e.b === i)) this.edges.push({ a: i, b: j, phase: r() });
    }
  }

  buildSkyline(r) {
    const layers = [];
    for (let l = 0; l < 3; l++) {
      const bs = [];
      let x = -40;
      while (x < this.w * 2 + 80) {
        const bw = 40 + r() * (90 - l * 15);
        const bh = this.h * (0.14 + r() * (0.34 + l * 0.12)) * (1 - l * 0.12);
        bs.push({ x, w: bw, h: bh, win: Array.from({ length: Math.floor(bh / 18) * Math.max(1, Math.floor(bw / 16)) }, () => ({ on: r() < 0.3, t: r() * 8 })) , roof: r() });
        x += bw + 4 + r() * 14;
      }
      layers.push({ bs, width: x, depth: l });
    }
    this.city = layers;
  }

  start() {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() { this.wanted = false; this.running = false; }

  destroy() {
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
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
    if (this.kind === "model3d") return; // the 3D view sits on top
    const o = { ...c, strength: c.dark ? 1 : 0.75 };
    if (typeof this[this.kind] === "function") this[this.kind](ctx, w, h, dt, o);
  }

  // ── the backgrounds ───────────────────────────────────

  // Blueprint paper; one floor plan after another is drawn wall by wall, then fades.
  blueprint(ctx, w, h, dt, o) {
    const t = this.time;
    const g = 24;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(o.accent, 0.07 * o.strength);
    ctx.beginPath();
    for (let x = (t * 4) % g; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = rgba(o.accent, 0.13 * o.strength);
    ctx.beginPath();
    for (let x = (t * 4) % (g * 5); x < w; x += g * 5) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += g * 5) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    if (!this.plans.length || this.plans[this.plans.length - 1].born < t - 3.5) {
      if (this.plans.length > 4) this.plans.shift();
      this.plans.push(this.makePlan(this.rand, t, g * 5));
    }
    for (const p of this.plans) {
      const age = t - p.born;
      const fade = age > 13 ? Math.max(0, 1 - (age - 13) / 3) : 1;
      if (fade <= 0) continue;
      const done = Math.min(p.walls.length, age * 3.2);
      ctx.lineWidth = 3;
      ctx.lineCap = "square";
      ctx.strokeStyle = rgba(o.text, 0.32 * fade * o.strength);
      ctx.beginPath();
      p.walls.forEach((wl, i) => {
        if (i >= done) return;
        const k = Math.min(1, done - i);
        ctx.moveTo(wl[0], wl[1]); ctx.lineTo(wl[0] + (wl[2] - wl[0]) * k, wl[1] + (wl[3] - wl[1]) * k);
      });
      ctx.stroke();
      if (done >= p.walls.length) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(o.accent, 0.35 * fade * o.strength);
        for (const d of p.doors) { ctx.beginPath(); ctx.arc(d[0], d[1], d[2], d[3], d[3] + Math.PI / 2); ctx.stroke(); }
        ctx.fillStyle = rgba(o.accent, 0.05 * fade * o.strength);
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
    }
    ctx.lineCap = "butt";
  }

  // An outline split into rooms (a few rectangles) with door swings.
  makePlan(r, t, unit) {
    const w = this.w, h = this.h;
    const pw = unit * (2 + Math.floor(r() * 3)), ph = unit * (2 + Math.floor(r() * 2));
    const x = Math.round((r() * Math.max(1, w - pw)) / 24) * 24, y = Math.round((r() * Math.max(1, h - ph)) / 24) * 24;
    const walls = [[x, y, x + pw, y], [x + pw, y, x + pw, y + ph], [x + pw, y + ph, x, y + ph], [x, y + ph, x, y]];
    const doors = [];
    const sx = x + pw * (0.35 + r() * 0.3);
    walls.push([sx, y, sx, y + ph]);
    const sy = y + ph * (0.4 + r() * 0.2);
    walls.push([x, sy, sx, sy]);
    doors.push([sx, sy + 10, 26, -Math.PI / 2], [x + 12, y + ph, 26, -Math.PI / 2]);
    return { born: t, x, y, w: pw, h: ph, walls, doors };
  }

  // Rooms divided again and again (a plan being laid out), a fresh one every few seconds.
  floorplans(ctx, w, h, dt, o) {
    const t = this.time;
    const cycle = 9;
    const n = Math.floor(t / cycle);
    if (this.planN !== n) {
      this.planN = n;
      const r = random(n * 131 + 7);
      const pw = Math.min(w * 0.7, 900), ph = Math.min(h * 0.7, 560);
      const root = { x: (w - pw) / 2 + (r() - 0.5) * w * 0.2, y: (h - ph) / 2 + (r() - 0.5) * h * 0.15, w: pw, h: ph };
      const rooms = [root];
      const cuts = [];
      for (let i = 0; i < 9; i++) {
        rooms.sort((a, b) => b.w * b.h - a.w * a.h);
        const big = rooms.shift();
        const vert = big.w > big.h;
        const k = 0.35 + r() * 0.3;
        if (vert) { const cx = big.x + big.w * k; cuts.push([cx, big.y, cx, big.y + big.h, i]); rooms.push({ x: big.x, y: big.y, w: big.w * k, h: big.h }, { x: cx, y: big.y, w: big.w * (1 - k), h: big.h }); }
        else { const cy = big.y + big.h * k; cuts.push([big.x, cy, big.x + big.w, cy, i]); rooms.push({ x: big.x, y: big.y, w: big.w, h: big.h * k }, { x: big.x, y: cy, w: big.w, h: big.h * (1 - k) }); }
      }
      this.fp = { root, rooms, cuts, r: rooms.map(() => r()) };
    }
    const age = t - n * cycle;
    const alpha = Math.min(1, age / 0.8) * Math.min(1, (cycle - age) / 1.2);
    const { root, rooms, cuts } = this.fp;
    const shown = Math.min(cuts.length, age * 1.8);
    rooms.forEach((rm, i) => {
      if (i > shown) return;
      ctx.fillStyle = rgba(mix(o.accent, o.warn, this.fp.r[i]), 0.06 * alpha * o.strength);
      ctx.fillRect(rm.x, rm.y, rm.w, rm.h);
      if (age > cuts.length / 1.8 + 0.6 && rm.w > 60 && rm.h > 50) { ctx.strokeStyle = rgba(o.text, 0.12 * alpha * o.strength); ctx.lineWidth = 1; ctx.strokeRect(rm.x + rm.w * 0.3, rm.y + rm.h * 0.35, rm.w * 0.4, rm.h * 0.3); }
    });
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba(o.text, 0.3 * alpha * o.strength);
    ctx.strokeRect(root.x, root.y, root.w, root.h);
    ctx.lineWidth = 2;
    ctx.beginPath();
    cuts.forEach((c, i) => {
      const k = Math.max(0, Math.min(1, shown - i));
      if (!k) return;
      ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + (c[2] - c[0]) * k, c[1] + (c[3] - c[1]) * k);
    });
    ctx.stroke();
  }

  // A city at dusk: three layers of buildings sliding by, windows lighting up.
  skyline(ctx, w, h, dt, o) {
    const t = this.time;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgba(o.bg, 0));
    sky.addColorStop(1, rgba(mix(o.bg, o.accent, 0.25), 0.6 * o.strength));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.78, h * 0.3, 90, o.warn, 0.18 * o.strength);
    for (const layer of [...this.city].reverse()) {
      const sp = 6 + (2 - layer.depth) * 9;
      const off = (t * sp) % (layer.width / 2);
      const col = mix(o.bg, o.text, 0.06 + (2 - layer.depth) * 0.05);
      for (const b of layer.bs) {
        const x = b.x - off;
        if (x > w || x + b.w < 0) continue;
        const y = h - b.h;
        ctx.fillStyle = rgba(col, 0.95);
        ctx.fillRect(x, y, b.w, b.h);
        if (b.roof > 0.8) ctx.fillRect(x + b.w / 2 - 1, y - 18, 2, 18);
        if (layer.depth === 0) {
          const cols = Math.max(1, Math.floor(b.w / 16));
          b.win.forEach((wn, i) => {
            const lit = wn.on !== (Math.floor((t + wn.t) / 6) % 4 === 0);
            if (!lit) return;
            const cx = x + 6 + (i % cols) * 16, cy = y + 8 + Math.floor(i / cols) * 18;
            if (cy > h - 8) return;
            ctx.fillStyle = rgba(o.warn, 0.55 * o.strength);
            ctx.fillRect(cx, cy, 6, 8);
          });
        }
      }
    }
  }

  // Tower cranes turning their jibs, a load going up and down.
  cranes(ctx, w, h, dt, o) {
    const t = this.time;
    const base = h * 0.88;
    ctx.fillStyle = rgba(mix(o.bg, o.text, 0.08), 1);
    // The building rising floor by floor.
    const floors = 3 + Math.floor((t / 4) % 9);
    const bw = Math.min(w * 0.4, 520), bx = w * 0.32;
    for (let f = 0; f < floors; f++) {
      ctx.fillStyle = rgba(mix(o.bg, o.text, 0.1 + 0.01 * f), 1);
      ctx.fillRect(bx, base - (f + 1) * 26, bw, 24);
      ctx.fillStyle = rgba(o.warn, 0.25 * o.strength);
      for (let x = bx + 10; x < bx + bw - 10; x += 30) ctx.fillRect(x, base - (f + 1) * 26 + 8, 14, 8);
    }
    ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
    for (const c of this.items) {
      const top = c.y - c.mast;
      ctx.strokeStyle = rgba(o.accent, 0.45 * o.strength);
      ctx.lineWidth = 1;
      // The lattice mast.
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x - 6, top); ctx.moveTo(c.x + 6, c.y); ctx.lineTo(c.x + 6, top);
      for (let y = c.y; y > top; y -= 14) { ctx.moveTo(c.x - 6, y); ctx.lineTo(c.x + 6, y - 14); }
      ctx.stroke();
      // The jib swings slowly (its length foreshortened).
      const swing = Math.cos(t * (0.12 + c.a * 0.08) + c.b * 6);
      const jib = c.jib * swing, back = -c.jib * 0.3 * swing;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x + back, top); ctx.lineTo(c.x + jib, top); ctx.moveTo(c.x, top - 22); ctx.lineTo(c.x + jib, top); ctx.moveTo(c.x, top - 22); ctx.lineTo(c.x + back, top); ctx.stroke();
      ctx.fillStyle = rgba(o.accent, 0.4 * o.strength);
      ctx.fillRect(c.x + back - 8 * Math.sign(back || 1), top, 10, 10);
      // The hook and its load.
      const hx = c.x + jib * (0.55 + 0.35 * Math.sin(t * 0.2 + c.c * 5));
      const drop = (c.mast - 40) * (0.5 + 0.45 * Math.sin(t * 0.35 + c.a * 9));
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(o.text, 0.3 * o.strength);
      ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, top + drop); ctx.stroke();
      ctx.fillStyle = rgba(o.warn, 0.5 * o.strength);
      ctx.fillRect(hx - 12, top + drop, 24, 8);
      glow(ctx, c.x, top - 22, 8, o.danger, (0.4 + 0.4 * Math.sin(t * 3 + c.i)) * o.strength);
    }
  }

  // Isometric blocks rising and settling, like a massing study.
  massing(ctx, w, h, dt, o) {
    const t = this.time;
    const s = 30;
    const iso = (gx, gy, z) => [w / 2 + (gx - gy) * s, h * 0.42 + (gx + gy) * s * 0.5 - z];
    const blocks = this.items.map((p, i) => ({ gx: (i % 6) - 2.5 + (p.a - 0.5) * 0.2, gy: Math.floor(i / 6) - 1.5, size: 0.8, z: 20 + 140 * ease(0.5 + 0.5 * Math.sin(t * 0.4 + p.b * 6.28)) * (0.4 + p.c), p }));
    blocks.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
    for (const b of blocks) {
      const d = b.size / 2;
      const [ax, ay] = iso(b.gx - d, b.gy - d, 0), [bx, by] = iso(b.gx + d, b.gy - d, 0), [cx, cy] = iso(b.gx + d, b.gy + d, 0), [dx, dy] = iso(b.gx - d, b.gy + d, 0);
      const z = b.z;
      const top = mix(o.bg, o.accent, 0.35 + 0.3 * b.p.a), left = mix(o.bg, o.accent, 0.16), right = mix(o.bg, o.text, 0.12);
      ctx.fillStyle = rgba(left, 0.85 * o.strength);
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - z); ctx.lineTo(dx, dy - z); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(right, 0.85 * o.strength);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.lineTo(bx, by - z); ctx.lineTo(cx, cy - z); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(top, 0.9 * o.strength);
      ctx.beginPath(); ctx.moveTo(ax, ay - z); ctx.lineTo(bx, by - z); ctx.lineTo(cx, cy - z); ctx.lineTo(dx, dy - z); ctx.closePath(); ctx.fill();
    }
  }

  // Structural grid: axes with numbered bubbles, columns pulsing in turn.
  structGrid(ctx, w, h, dt, o) {
    const t = this.time;
    const step = 140;
    const ox = ((t * 10) % step) - step, oy = 60;
    ctx.setLineDash([16, 5, 3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(o.accent, 0.22 * o.strength);
    ctx.beginPath();
    for (let x = ox; x < w + step; x += step) { ctx.moveTo(x, 40); ctx.lineTo(x, h); }
    for (let y = oy; y < h; y += step * 0.8) { ctx.moveTo(40, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let i = Math.floor(-ox / step);
    for (let x = ox; x < w + step; x += step, i++) {
      ctx.strokeStyle = rgba(o.accent, 0.4 * o.strength); ctx.beginPath(); ctx.arc(x, 24, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(o.text, 0.45 * o.strength); ctx.fillText(String(((i % 99) + 99) % 99 + 1), x, 24);
    }
    let j = 0;
    for (let y = oy; y < h; y += step * 0.8, j++) {
      ctx.strokeStyle = rgba(o.accent, 0.4 * o.strength); ctx.beginPath(); ctx.arc(24, y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(o.text, 0.45 * o.strength); ctx.fillText(String.fromCharCode(65 + (j % 26)), 24, y);
    }
    i = 0;
    for (let x = ox; x < w + step; x += step, i++) {
      j = 0;
      for (let y = oy; y < h; y += step * 0.8, j++) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 - (i + j) * 0.6);
        ctx.fillStyle = rgba(mix(o.text, o.accent, pulse), (0.2 + 0.35 * pulse) * o.strength);
        ctx.fillRect(x - 7, y - 7, 14, 14);
      }
    }
  }

  // A Warren truss across the screen, a load crossing it and the members it stresses glowing.
  truss(ctx, w, h, dt, o) {
    const t = this.time;
    const y0 = h * 0.62, depth = Math.min(120, h * 0.18), panel = 70;
    const n = Math.ceil(w / panel) + 2;
    const load = ((t * 60) % (w + 200)) - 100;
    const heat = (x) => Math.max(0, 1 - Math.abs(x - load) / 220);
    ctx.lineWidth = 2;
    for (let i = -1; i < n; i++) {
      const x1 = i * panel, x2 = x1 + panel, xm = x1 + panel / 2;
      const seg = (ax, ay, bx, by) => { const k = heat((ax + bx) / 2); ctx.strokeStyle = rgba(mix(o.accent, o.danger, k), (0.25 + 0.5 * k) * o.strength); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
      seg(x1, y0, x2, y0);
      seg(xm - panel, y0 - depth, xm, y0 - depth);
      seg(x1, y0, xm, y0 - depth);
      seg(xm, y0 - depth, x2, y0);
    }
    // Piers and the water.
    for (let x = panel * 3; x < w; x += panel * 6) { ctx.fillStyle = rgba(mix(o.bg, o.text, 0.12), 1); ctx.fillRect(x - 10, y0, 20, h - y0); }
    ctx.strokeStyle = rgba(o.accent, 0.12 * o.strength);
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 12) { const y = h - 50 + k * 9 + Math.sin(x * 0.02 + t * 1.5 + k) * 3; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.fillStyle = rgba(o.warn, 0.7 * o.strength);
    ctx.fillRect(load - 26, y0 - 18, 52, 16);
    glow(ctx, load, y0 - 10, 40, o.warn, 0.2 * o.strength);
  }

  // The sun crossing an arc; blocks on the ground throw shadows that turn with it.
  sunPath(ctx, w, h, dt, o) {
    const t = this.time;
    const k = (t * 0.03) % 1;
    const ang = Math.PI * (1 - k);
    const cx = w / 2, cy = h * 0.82, R = Math.min(w * 0.42, h * 0.7);
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = rgba(o.warn, 0.25 * o.strength);
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke();
    ctx.setLineDash([]);
    const sx = cx + Math.cos(ang) * R, sy = cy - Math.sin(ang) * R;
    glow(ctx, sx, sy, 70, o.warn, 0.35 * o.strength);
    ctx.fillStyle = rgba(o.warn, 0.8 * o.strength);
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(o.text, 0.12 * o.strength);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    const blocks = [[-0.3, 60, 90], [-0.08, 40, 150], [0.12, 70, 60], [0.3, 50, 110]];
    const len = Math.min(4, 1 / Math.max(0.15, Math.sin(ang)));
    for (const [px, bw, bh] of blocks) {
      const x = cx + px * w;
      const dir = -Math.cos(ang);
      ctx.fillStyle = rgba(o.bg, 0);
      ctx.fillStyle = rgba(mix(o.bg, [0, 0, 0], 0.4), 0.45 * o.strength);
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + bw, cy); ctx.lineTo(x + bw + dir * bh * len, cy + 18); ctx.lineTo(x + dir * bh * len, cy + 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(mix(o.bg, o.text, 0.14), 1);
      ctx.fillRect(x, cy - bh, bw, bh);
      ctx.fillStyle = rgba(o.warn, 0.18 * Math.max(0, -dir) * o.strength + 0.05);
      ctx.fillRect(x, cy - bh, bw / 2, bh);
    }
  }

  // Dimension lines with ticks and figures appearing and fading.
  dimensions(ctx, w, h, dt, o) {
    const t = this.time;
    const r = this.rand;
    if (!this.dims.length || this.dims[this.dims.length - 1].born < t - 0.7) {
      if (this.dims.length > 22) this.dims.shift();
      const vert = r() < 0.4;
      const len = 80 + r() * 300;
      const x = r() * (w - (vert ? 40 : len)), y = r() * (h - (vert ? len : 40));
      this.dims.push({ born: t, vert, x, y, len, mm: Math.round((len * 20) / 50) * 50 });
    }
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const d of this.dims) {
      const age = t - d.born;
      const a = Math.min(1, age * 2) * Math.max(0, 1 - Math.max(0, age - 10) / 4);
      if (a <= 0) continue;
      const grow = ease(age * 1.5);
      const col = rgba(o.accent, 0.5 * a * o.strength);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (d.vert) {
        const y2 = d.y + d.len * grow;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, y2);
        for (const yy of [d.y, y2]) { ctx.moveTo(d.x - 5, yy + 5); ctx.lineTo(d.x + 5, yy - 5); ctx.moveTo(d.x - 10, yy); ctx.lineTo(d.x + 10, yy); }
      } else {
        const x2 = d.x + d.len * grow;
        ctx.moveTo(d.x, d.y); ctx.lineTo(x2, d.y);
        for (const xx of [d.x, x2]) { ctx.moveTo(xx - 5, d.y + 5); ctx.lineTo(xx + 5, d.y - 5); ctx.moveTo(xx, d.y - 10); ctx.lineTo(xx, d.y + 10); }
      }
      ctx.stroke();
      if (grow >= 1) {
        ctx.fillStyle = rgba(o.text, 0.5 * a * o.strength);
        if (d.vert) { ctx.save(); ctx.translate(d.x - 4, d.y + d.len / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(d.mm), 0, 0); ctx.restore(); }
        else ctx.fillText(String(d.mm), d.x + d.len / 2, d.y - 4);
      }
    }
  }

  // A herringbone floor with light sweeping across it.
  tiles(ctx, w, h, dt, o) {
    const t = this.time;
    const L = 48, W = 16;
    const sweep = ((t * 80) % (w + h + 400)) - 200;
    for (let y = -L; y < h + L; y += W * 2) {
      for (let x = -L; x < w + L; x += W * 2) {
        for (const vertical of [false, true]) {
          const px = x + (vertical ? W : 0), py = y + (vertical ? 0 : W);
          const d = Math.abs(px + py - sweep);
          const light = Math.max(0, 1 - d / 260);
          const base = ((Math.floor(x / W) * 7 + Math.floor(y / W) * 13) % 5) / 5;
          ctx.fillStyle = rgba(mix(mix(o.bg, o.warn, 0.08 + 0.05 * base), o.warn, light * 0.25), 1);
          if (vertical) ctx.fillRect(px + 1, py + 1, W - 2, L - 2); else ctx.fillRect(px + 1, py + 1, L - 2, W - 2);
        }
      }
    }
  }

  // MyHeatManager's default: drifting dots, linked when close.
  particles(ctx, w, h, dt, o) {
    const t = this.time;
    for (const p of this.items) {
      p.x += Math.cos(p.a * 6.28 + t * 0.2) * 12 * dt;
      p.y += Math.sin(p.a * 6.28 + t * 0.2) * 12 * dt;
      if (p.x < 0) p.x += w; if (p.x > w) p.x -= w; if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;
      ctx.fillStyle = rgba(o.accent, (0.25 + 0.5 * p.c) * o.strength);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + 2.5 * p.b, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = rgba(o.accent, 0.12 * o.strength);
    ctx.beginPath();
    for (let i = 0; i < this.items.length; i++) for (let j = i + 1; j < this.items.length; j++) {
      const a = this.items[i], b = this.items[j];
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 9000) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.stroke();
  }

  constellation(ctx, w, h, dt, o) {
    const t = this.time;
    const shown = Math.floor((t * 3) % (this.edges.length + 30));
    ctx.strokeStyle = rgba(o.accent, 0.3 * o.strength);
    ctx.beginPath();
    this.edges.slice(0, shown).forEach((e) => { const a = this.items[e.a], b = this.items[e.b]; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); });
    ctx.stroke();
    for (const p of this.items) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + p.a) + p.b * 10));
      glow(ctx, p.x, p.y, 6 + 6 * p.c, mix(o.accent, o.text, 0.4), tw * 0.6 * o.strength);
      ctx.fillStyle = rgba(o.text, tw * 0.8 * o.strength);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + p.c, 0, Math.PI * 2); ctx.fill();
    }
  }

  // A tower's elevation: mullions and floor slabs, windows lighting up floor by floor.
  facade(ctx, w, h, dt, o) {
    const t = this.time;
    const fw = Math.min(w * 0.46, 560), fx = (w - fw) / 2, top = h * 0.12, fh = 34, floors = Math.max(1, Math.floor((h * 0.88 - top) / fh));
    const bays = Math.max(4, Math.floor(fw / 46)), bw = fw / bays;
    ctx.fillStyle = rgba(mix(o.bg, o.text, 0.07), 1);
    ctx.fillRect(fx, top, fw, floors * fh);
    const lit = (t * 1.6) % (floors + 8);
    for (let f = 0; f < floors; f++) {
      const y = top + (floors - 1 - f) * fh;
      for (let b = 0; b < bays; b++) {
        const on = f < lit && (f * 7 + b * 3) % 5 !== 0;
        ctx.fillStyle = on ? rgba(o.warn, (0.25 + 0.1 * ((f + b) % 3)) * o.strength) : rgba(mix(o.bg, o.accent, 0.18), 0.6 * o.strength);
        ctx.fillRect(fx + b * bw + 4, y + 6, bw - 8, fh - 10);
      }
    }
    ctx.strokeStyle = rgba(o.text, 0.22 * o.strength);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let b = 0; b <= bays; b++) { ctx.moveTo(fx + b * bw, top); ctx.lineTo(fx + b * bw, top + floors * fh); }
    for (let f = 0; f <= floors; f++) { ctx.moveTo(fx - 6, top + f * fh); ctx.lineTo(fx + fw + 6, top + f * fh); }
    ctx.stroke();
    ctx.strokeStyle = rgba(o.text, 0.14 * o.strength);
    ctx.beginPath(); ctx.moveTo(0, top + floors * fh); ctx.lineTo(w, top + floors * fh); ctx.stroke();
    glow(ctx, fx + fw / 2, top - 14, 10, o.danger, (0.4 + 0.4 * Math.sin(t * 2.5)) * o.strength);
  }

  // Bricks laid course by course in running bond; the wall starts again when it is full.
  brickwork(ctx, w, h, dt, o) {
    const t = this.time;
    const bl = 60, bh = 22, gap = 4;
    const cols = Math.ceil(w / (bl + gap)) + 2, rows = Math.ceil(h / (bh + gap));
    const laid = Math.floor((t * 40) % (cols * rows + 60));
    let n = 0;
    for (let r = rows - 1; r >= 0 && n < laid; r--) {
      const y = r * (bh + gap);
      const off = (rows - 1 - r) % 2 ? -(bl + gap) / 2 : 0;
      for (let c = 0; c < cols && n < laid; c++, n++) {
        const k = ((c * 13 + r * 7) % 9) / 9;
        const fresh = Math.max(0, 1 - (laid - n) / 20);
        ctx.fillStyle = rgba(mix(mix(o.bg, o.danger, 0.16 + 0.1 * k), o.warn, 0.35 * fresh), (0.75 + 0.25 * fresh) * o.strength);
        ctx.fillRect(off + c * (bl + gap), y, bl, bh);
      }
    }
    ctx.strokeStyle = rgba(o.text, 0.06 * o.strength);
    ctx.beginPath();
    for (let y = 0; y < h; y += bh + gap) { ctx.moveTo(0, y - gap / 2); ctx.lineTo(w, y - gap / 2); }
    ctx.stroke();
  }

  // A colonnade of round arches sliding by, light falling through onto the floor.
  arches(ctx, w, h, dt, o) {
    const t = this.time;
    const span = 150, pier = 26, base = h * 0.8, rise = Math.min(h * 0.42, 300);
    const off = (t * 22) % span;
    const top = base - rise - span / 2;
    ctx.fillStyle = rgba(mix(o.bg, o.text, 0.06), 1);
    ctx.fillRect(0, top - 50, w, 50);
    for (let x = -off - span; x < w + span; x += span) {
      const cx = x + span / 2, r = (span - pier) / 2;
      ctx.fillStyle = rgba(mix(o.bg, o.text, 0.12), 1);
      ctx.beginPath();
      ctx.moveTo(x, base); ctx.lineTo(x, top); ctx.lineTo(x + span, top); ctx.lineTo(x + span, base);
      ctx.lineTo(cx + r, base); ctx.lineTo(cx + r, base - rise); ctx.arc(cx, base - rise, r, 0, Math.PI, true); ctx.lineTo(cx - r, base);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(o.accent, 0.3 * o.strength);
      ctx.beginPath(); ctx.arc(cx, base - rise, r + 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = rgba(o.warn, 0.08 * o.strength);
      ctx.beginPath(); ctx.moveTo(cx - r, base); ctx.lineTo(cx + r, base); ctx.lineTo(cx + r + 60, h); ctx.lineTo(cx - r + 60, h); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = rgba(o.text, 0.16 * o.strength);
    ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); ctx.stroke();
  }

  // Contour lines of a site: rings around three hills that swell and settle.
  contours(ctx, w, h, dt, o) {
    const t = this.time;
    const hills = [[w * 0.32, h * 0.45, 1], [w * 0.7, h * 0.6, 0.8], [w * 0.55, h * 0.2, 0.5]];
    for (let lv = 1; lv <= 14; lv++) {
      const major = lv % 5 === 0;
      ctx.strokeStyle = rgba(mix(o.accent, o.ok, lv / 14), (major ? 0.4 : 0.2) * o.strength);
      ctx.lineWidth = major ? 1.6 : 1;
      for (const [hx, hy, k] of hills) {
        const r0 = (15 - lv) * 26 * k * (1 + 0.06 * Math.sin(t * 0.5 + k * 4));
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          const rr = r0 * (1 + 0.12 * Math.sin(a * 3 + lv * 0.7 + t * 0.2) + 0.06 * Math.cos(a * 5 - t * 0.15));
          const x = hx + Math.cos(a) * rr * 1.3, y = hy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = rgba(o.text, 0.35 * o.strength);
    for (const [hx, hy, k] of hills) ctx.fillText(`+${(40 * k + 2 * Math.sin(t * 0.5)).toFixed(1)}`, hx + 6, hy);
  }

  // A staircase in section climbing across the screen, a light walking up its steps.
  staircase(ctx, w, h, dt, o) {
    const t = this.time;
    const tread = 46, riser = 17;
    const n = Math.ceil(w / tread) + 3;
    const off = (t * 18) % tread;
    const y0 = h / 2 + (n * riser) / 2;
    const pts = [];
    for (let i = -1; i < n; i++) pts.push([i * tread - off, y0 - (i - off / tread) * riser]);
    ctx.fillStyle = rgba(mix(o.bg, o.text, 0.1), 1);
    ctx.beginPath(); ctx.moveTo(pts[0][0], h);
    for (const [x, y] of pts) { ctx.lineTo(x, y); ctx.lineTo(x + tread, y); }
    ctx.lineTo(pts[pts.length - 1][0] + tread, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(o.accent, 0.4 * o.strength);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [x, y] of pts) { ctx.moveTo(x, y + riser); ctx.lineTo(x, y); ctx.lineTo(x + tread, y); }
    ctx.stroke();
    // The handrail.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(o.text, 0.25 * o.strength);
    const last = pts[pts.length - 1];
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - 60); ctx.lineTo(last[0] + tread, last[1] - 60); ctx.stroke();
    const p = pts[Math.floor(((t * 0.08) % 1) * (pts.length - 1))];
    glow(ctx, p[0] + tread / 2, p[1] - 10, 22, o.warn, 0.4 * o.strength);
    ctx.fillStyle = rgba(o.warn, 0.8 * o.strength);
    ctx.beginPath(); ctx.arc(p[0] + tread / 2, p[1] - 10, 5, 0, Math.PI * 2); ctx.fill();
  }

  // A wireframe building (a tall block, a low wing with a pitched roof) turning slowly.
  wireframe(ctx, w, h, dt, o) {
    const a = this.time * 0.25, ca = Math.cos(a), sa = Math.sin(a);
    const s = Math.min(w, h) / 9;
    const P = (x, y, z) => { const rx = x * ca - y * sa, ry = x * sa + y * ca; return [w / 2 + rx * s, h * 0.6 + ry * s * 0.45 - z * s]; };
    const ring = (c, z) => { c.forEach(([x, y], i) => { const p = P(x, y, z); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); };
    const box = (x0, y0, x1, y1, z0, z1) => {
      const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      ctx.beginPath();
      ring(c, z0); ring(c, z1);
      for (const [x, y] of c) { const p = P(x, y, z0), q = P(x, y, z1); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (let z = z0 + 0.6; z < z1 - 0.1; z += 0.6) ring(c, z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(o.accent, 0.18 * o.strength);
    ctx.beginPath();
    for (let i = -4; i <= 4; i++) {
      let p = P(i, -4, 0), q = P(i, 4, 0); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      p = P(-4, i, 0); q = P(4, i, 0); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(o.accent, 0.06 * o.strength);
    ctx.beginPath(); ring([[-2.5, -1.5], [0.5, -1.5], [0.5, 1.5], [-2.5, 1.5]], 0); ctx.fill();
    ctx.strokeStyle = rgba(o.accent, 0.55 * o.strength);
    box(-2.5, -1.5, 0.5, 1.5, 0, 3.6);
    ctx.strokeStyle = rgba(o.text, 0.4 * o.strength);
    box(0.5, -1, 2.5, 1, 0, 1.8);
    const r1 = P(0.5, 0, 2.6), r2 = P(2.5, 0, 2.6);
    ctx.beginPath();
    for (const y of [-1, 1]) { const e1 = P(0.5, y, 1.8), e2 = P(2.5, y, 1.8); ctx.moveTo(e1[0], e1[1]); ctx.lineTo(r1[0], r1[1]); ctx.moveTo(e2[0], e2[1]); ctx.lineTo(r2[0], r2[1]); }
    ctx.moveTo(r1[0], r1[1]); ctx.lineTo(r2[0], r2[1]);
    ctx.stroke();
  }

  // Section cuts filled with material hatches (concrete, brick, earth, insulation, steel), sliding past.
  hatching(ctx, w, h, dt, o) {
    const t = this.time;
    const cell = 220, bw = cell - 40, bh = cell * 0.7 - 40;
    const off = (t * 16) % cell;
    const kinds = ["concrete", "brick", "earth", "insulation", "steel"];
    const base = Math.floor((t * 16) / cell);
    for (let y = 30, row = 0; y < h; y += cell * 0.7, row++) {
      let i = 0;
      for (let x = -off - cell + (row % 2) * (cell / 2); x < w + cell; x += cell, i++) {
        const kind = kinds[(((i - base) % 5) + 5 + row * 2) % 5];
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
        ctx.fillStyle = rgba(mix(o.bg, o.text, 0.05), 1);
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = rgba(o.accent, 0.3 * o.strength);
        ctx.fillStyle = rgba(o.accent, 0.3 * o.strength);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (kind === "brick" || kind === "steel") for (let d = -bh; d < bw; d += kind === "steel" ? 6 : 12) { ctx.moveTo(x + d, y + bh); ctx.lineTo(x + d + bh, y); }
        if (kind === "steel") for (let d = -bh; d < bw; d += 6) { ctx.moveTo(x + d, y); ctx.lineTo(x + d + bh, y + bh); }
        if (kind === "earth") for (let d = 0; d < bw + bh; d += 16) { ctx.moveTo(x + d, y); ctx.lineTo(x + d - 8, y + 8); ctx.moveTo(x + d - 4, y + bh); ctx.lineTo(x + d - 12, y + bh - 8); }
        if (kind === "insulation") for (let xx = x; xx < x + bw; xx += 14) { ctx.moveTo(xx, y + bh / 2); ctx.quadraticCurveTo(xx + 3.5, y + 4, xx + 7, y + bh / 2); ctx.quadraticCurveTo(xx + 10.5, y + bh - 4, xx + 14, y + bh / 2); }
        ctx.stroke();
        if (kind === "concrete") { const r = random(i * 31 + row * 7 + base * 5); for (let k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(x + r() * bw, y + r() * bh, 1 + r() * 2, 0, Math.PI * 2); ctx.fill(); } }
        ctx.restore();
        ctx.strokeStyle = rgba(o.text, 0.35 * o.strength);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, bw, bh);
      }
    }
    ctx.lineWidth = 1;
  }

  // A timber house frame raised piece by piece (sills, posts, beams, rafters, braces), then taken down for the next.
  timberFrame(ctx, w, h, dt, o) {
    const t = this.time;
    const cycle = 16, age = t % cycle;
    const alpha = Math.min(1, age / 0.6) * Math.min(1, (cycle - age) / 1.2);
    const s = Math.min(w / 14, h / 9);
    // An oblique view: x across, y into the picture, z up.
    const P = (x, y, z) => [w / 2 + (x - 3) * s + y * s * 0.55, h * 0.78 - z * s - y * s * 0.32];
    const members = [];
    const L = 6, D = 4, H = 3, R = 2;
    for (const y of [0, D]) members.push(["sill", [0, y, 0], [L, y, 0]]);
    for (const x of [0, L]) members.push(["sill", [x, 0, 0], [x, D, 0]]);
    for (const x of [0, 2, 4, 6]) for (const y of [0, D]) members.push(["post", [x, y, 0], [x, y, H]]);
    for (const y of [0, D]) members.push(["beam", [0, y, H], [L, y, H]]);
    for (const x of [0, 2, 4, 6]) members.push(["beam", [x, 0, H], [x, D, H]]);
    for (const x of [0, 2, 4, 6]) { members.push(["rafter", [x, 0, H], [x, D / 2, H + R]]); members.push(["rafter", [x, D, H], [x, D / 2, H + R]]); }
    members.push(["ridge", [0, D / 2, H + R], [L, D / 2, H + R]]);
    for (const x of [0, 4]) for (const y of [0, D]) members.push(["brace", [x, y, H - 1], [x + 1, y, H]]);
    const built = age * 5;
    // The ground and the grid of footings.
    ctx.strokeStyle = rgba(o.text, 0.1 * o.strength);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -2; x <= L + 2; x++) { const a = P(x, -1.5, 0), b = P(x, D + 1.5, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let y = -1.5; y <= D + 1.5; y += 1) { const a = P(-2, y, 0), b = P(L + 2, y, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    const col = { sill: o.muted, post: o.warn, beam: o.warn, rafter: o.accent, ridge: o.accent, brace: o.text };
    const width = { sill: 6, post: 5, beam: 5, rafter: 4, ridge: 5, brace: 2.5 };
    members.forEach(([kind, a, b], i) => {
      const k = Math.max(0, Math.min(1, built - i));
      if (!k) return;
      const pa = P(...a), pb = P(...b);
      const e = ease(k);
      ctx.strokeStyle = rgba(mix(o.bg, col[kind], 0.75), (0.5 + 0.3 * (k < 1 ? 1 : 0)) * alpha * o.strength);
      ctx.lineWidth = width[kind];
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pa[0] + (pb[0] - pa[0]) * e, pa[1] + (pb[1] - pa[1]) * e); ctx.stroke();
      if (k < 1) glow(ctx, pa[0] + (pb[0] - pa[0]) * e, pa[1] + (pb[1] - pa[1]) * e, 16, o.warn, 0.5 * alpha * o.strength);
    });
    ctx.lineCap = "butt";
    ctx.lineWidth = 1;
    // A crane hook lowering the piece being placed.
    const cur = members[Math.min(members.length - 1, Math.floor(built))];
    if (built < members.length) {
      const m = P(...cur[2]);
      ctx.strokeStyle = rgba(o.text, 0.25 * alpha * o.strength);
      ctx.beginPath(); ctx.moveTo(m[0], 0); ctx.lineTo(m[0], m[1] - 6); ctx.stroke();
      ctx.fillStyle = rgba(o.text, 0.4 * alpha * o.strength);
      ctx.fillRect(m[0] - 3, m[1] - 10, 6, 5);
    }
  }
}
