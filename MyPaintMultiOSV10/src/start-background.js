/* The start screen's moving backgrounds: twenty small 3D scenes, the same set of twenty as the
 * other programs' start screens but about painting.
 *
 * Each scene is drawn on one 2D canvas through a perspective camera - points, lines and quads
 * placed in a 3D world, rotated and flown through, projected with a focal length, faded with
 * depth - so it reads as depth and motion without a WebGL context to lose. Up to 30 frames a
 * second times a speed factor, sized to the device pixel ratio, and paused only while nobody can
 * see it: the window hidden, or stop() (the start screen is not showing).
 *
 * prefers-reduced-motion does not stop it - Windows reports reduced motion whenever its
 * animation effects are off - it only lowers the default speed (Store.effectiveStartSpeed).
 *
 * Colours come from the theme tokens on :root, read again whenever the theme changes. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintStartBackground = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const KINDS = root.MyPaintStore.START_BACKGROUNDS;

  /* Names from src/icons.js. */
  const ICONS = {
    brushStrokes: "brush",
    paintSplash: "fill",
    paletteRing: "palette",
    pencils: "pencil",
    gallery: "canvas",
    pixelField: "image",
    colorWheel: "themePalette",
    sprayCloud: "spray",
    solids: "shapes",
    gridPaper: "grid",
    bezier: "curve",
    layers: "layerUp",
    inkDrops: "marker",
    swatches: "picker",
    scanSlices: "scan",
    constellation: "freeCurve",
    ripples: "opacity",
    aurora: "theme",
    hexGrid: "frames",
    bubbles: "ellipse",
  };

  /* ---------------------------------------------------------------- colours */

  function cssRgb(value, fallback) {
    const v = String(value || "").trim();
    let m = /^#([0-9a-f]{6})/i.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = /^#([0-9a-f]{3})$/i.exec(v);
    if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
    m = /^rgba?\(([^)]+)\)/i.exec(v);
    if (m) return m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map((x) => parseFloat(x));
    return fallback;
  }

  /* The theme tokens on :root, as RGB triples. */
  function themePalette() {
    const css = getComputedStyle(document.documentElement);
    const read = (name, fallback) => cssRgb(css.getPropertyValue(name), fallback);
    const bg = read("--bg", [243, 244, 246]);
    const text = read("--ink", [31, 35, 40]);
    const accent = read("--accent", [37, 99, 235]);
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    const added = read("--add-ink", text);
    const removed = read("--del-ink", text);
    const modified = read("--base-ink", text);
    const blue = read("--local-ink", text);
    const violet = read("--remote-ink", text);
    return {
      bg: bg,
      panel: read("--panel", bg),
      accent: accent,
      text: text,
      added: added,
      removed: removed,
      modified: modified,
      // a painter's box of colours that stays readable on this theme's background
      paints: [accent, removed, modified, added, blue, violet],
      dark: lum < 0.5,
    };
  }

  const rgba = (c, a) => "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + Math.max(0, Math.min(1, a)) + ")";
  const mix = (a, b, k) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
  const TAU = Math.PI * 2;
  const wrap = (value, size) => ((value % size) + size) % size;

  function hue(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
    };
    return [f(0), f(8), f(4)];
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ----------------------------------------------------------------- camera */

  /* A perspective camera: the world is turned by yaw (around Y) and pitch (around X), pushed dist
   * units away, then projected. far is where things have faded out. A projected point is
   * { x, y, s (scale at that depth), z, f (depth fade) }, or null behind the camera. */
  function camera(w, h, yaw, pitch, dist, far) {
    const fade = far || 18;
    const focal = Math.min(w, h) * 0.95;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    return (x, y, z) => {
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp + dist;
      if (z2 < 0.15) return null;
      const s = focal / z2;
      return { x: w / 2 + x1 * s, y: h / 2 + y1 * s, s: s, z: z2, f: Math.max(0, Math.min(1, 1.15 - z2 / fade)) };
    };
  }

  /* ----------------------------------------------------------------- engine */

  const FRAME_MS = 1000 / 30;

  class StartBackground {
    constructor(canvas, options) {
      const o = options || {};
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.palette = themePalette();
      this.speed = o.speed || (() => 1);
      this.kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : KINDS[0];
      this.w = 1;
      this.h = 1;
      this.time = 0;
      this.last = 0;
      this.running = false;
      this.wanted = false;
      this.frame = 0;
      this.raf = 0;
      this.items = [];
      this.links = [];
      this.loop = this.loop.bind(this);
      this.onVisibility = this.onVisibility.bind(this);
      document.addEventListener("visibilitychange", this.onVisibility);
      this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
      if (this.resizeObserver) this.resizeObserver.observe(canvas);
      this.seed();
      this.resize();
    }

    /* Frames drawn so far; lets a test tell a running background from a still one. */
    get frames() { return this.frame; }
    get isRunning() { return this.running; }

    setKind(kind) {
      if (KINDS.indexOf(kind) < 0 || kind === this.kind) return;
      this.kind = kind;
      this.seed();
      if (!this.running) this.draw();
    }

    /* Another kind, at random; returns it. */
    shuffle(random) {
      const others = KINDS.filter((k) => k !== this.kind);
      const next = others[Math.floor((random || Math.random)() * others.length) % others.length];
      this.setKind(next);
      return next;
    }

    refreshColors() {
      this.palette = themePalette();
      if (!this.running) this.draw();
    }

    start() {
      this.wanted = true;
      if (this.running || document.hidden) return;
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
      this.wanted = false;
      this.running = false;
      cancelAnimationFrame(this.raf);
    }

    /* The last frame stays, redrawn at the present size and colours. */
    still() {
      this.stop();
      this.draw();
    }

    destroy() {
      this.stop();
      document.removeEventListener("visibilitychange", this.onVisibility);
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }

    onVisibility() {
      if (document.hidden) {
        this.running = false;
        cancelAnimationFrame(this.raf);
      } else if (this.wanted) {
        this.start();
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(1, rect.width);
      this.h = Math.max(1, rect.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!this.running) this.draw();
    }

    loop(now) {
      if (!this.running) return;
      if (now - this.last >= FRAME_MS) {
        const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed();
        this.last = now;
        this.time += dt;
        this.draw();
      }
      this.raf = requestAnimationFrame(this.loop);
    }

    /* Items placed from a fixed seed, so a kind always starts the same way. */
    seed() {
      const r = seeded(this.kind.length * 7919 + this.kind.charCodeAt(0) * 31 + 13);
      this.items = Array.from({ length: 320 }, (_, i) => {
        const x = r();
        return {
          x: r() * 2 - 1, y: r() * 2 - 1, z: r() * 2 - 1, a: r(), b: r(), c: r(),
          lane: i % 3, paint: Math.floor(r() * 6), status: x < 0.08 ? 1 : x < 0.16 ? 2 : x < 0.24 ? 3 : 0, value: Math.floor(r() * 256),
        };
      });
      if (this.kind === "constellation") {
        // Stars on a shell, each linked to its two nearest neighbours.
        const stars = this.items.slice(0, 140);
        stars.forEach((s) => {
          const len = Math.hypot(s.x, s.y, s.z) || 1;
          const radius = 2.2 + s.a * 1.4;
          s.x = (s.x / len) * radius;
          s.y = (s.y / len) * radius;
          s.z = (s.z / len) * radius;
        });
        this.links = [];
        stars.forEach((s, i) => {
          stars
            .map((o, j) => [j, (o.x - s.x) ** 2 + (o.y - s.y) ** 2 + (o.z - s.z) ** 2])
            .filter((pair) => pair[0] !== i)
            .sort((a, b) => a[1] - b[1])
            .slice(0, 2)
            .forEach((pair) => { if (pair[0] > i) this.links.push([i, pair[0]]); });
        });
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const c = this.palette;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = rgba(c.bg, 1);
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "butt";
      this[this.kind]({ ctx: ctx, w: w, h: h, t: this.time, c: c, k: c.dark ? 1 : 0.85 });
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.globalAlpha = 1;
      this.frame += 1;
    }

    tone(c, s) {
      return s === 1 ? c.added : s === 2 ? c.removed : s === 3 ? c.modified : c.text;
    }

    /* ------------------------------------------------------ drawing helpers */

    line(ctx, a, b, color, alpha, width) {
      if (!a || !b) return;
      ctx.strokeStyle = rgba(color, alpha * Math.min(a.f, b.f));
      ctx.lineWidth = Math.max(0.5, (width || 1) * Math.min(a.s, b.s) / 120);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    dot(ctx, p, size, color, alpha) {
      if (!p) return;
      ctx.fillStyle = rgba(color, alpha * p.f);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, size * p.s / 100), 0, TAU);
      ctx.fill();
    }

    quad(ctx, points, fill, alpha, stroke, strokeAlpha) {
      if (points.some((p) => !p)) return;
      const f = Math.min.apply(null, points.map((p) => p.f));
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = rgba(fill, alpha * f);
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = rgba(stroke, (strokeAlpha || 0) * f);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    /* ------------------------------------------------- the painting scenes */

    /* Flying through long brush strokes, each a ribbon with bristle lines along it. */
    brushStrokes({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.2) * 0.15, Math.sin(t * 0.13) * 0.08, 0.2, 22);
      const strokes = this.items.slice(0, 34)
        .map((it) => ({ it: it, z: wrap(it.z * 11 + 11 - t * 2, 22) }))
        .sort((a, b) => b.z - a.z);
      strokes.forEach(({ it, z }) => {
        const color = c.paints[it.paint];
        const cx = it.x * 4.2;
        const cy = it.y * 2.4;
        const len = 1.6 + it.a * 2.6;
        const thick = 0.1 + it.c * 0.16;
        const wave = (u) => cy + Math.sin(u * 3 + it.b * 6 + t * 0.6) * 0.3;
        const edge = [];
        const under = [];
        const bristles = [[], [], []];
        for (let i = 0; i <= 18; i++) {
          const u = i / 18;
          const x = cx - len / 2 + u * len;
          const y = wave(u);
          // a loaded brush lands quickly and runs dry towards the end
          const taper = Math.min(1, u * 9) * (1 - u * u * 0.8) * thick;
          edge.push(p(x, y - taper, z));
          under.unshift(p(x, y + taper, z));
          bristles[0].push(p(x, y - taper * 0.5, z));
          bristles[1].push(p(x, y + taper * 0.1, z));
          bristles[2].push(p(x, y + taper * 0.6, z));
        }
        this.quad(ctx, edge.concat(under), color, 0.62 * k);
        bristles.forEach((row, n) => {
          for (let i = 1; i < row.length; i++) {
            this.line(ctx, row[i - 1], row[i], mix(color, n === 1 ? c.bg : c.text, 0.3), 0.4 * k, 1.5);
          }
        });
      });
    }

    /* Paint thrown from a few places: droplets burst out, slow down and fall. */
    paintSplash({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.1, 0.1, 7, 16);
      const bursts = 7;
      this.items.forEach((it, i) => {
        const burst = i % bursts;
        const phase = wrap(t * 0.28 + burst / bursts, 1);
        const round = Math.floor(t * 0.28 + burst / bursts);
        const origin = this.items[(burst * 11 + round * 7) % this.items.length];
        const len = Math.hypot(it.x, it.y, it.z) || 1;
        const reach = (1 - (1 - phase) ** 3) * (0.8 + it.a * 2.2);
        const x = origin.x * 6.4 + (it.x / len) * reach * 1.5;
        const y = origin.y * 2.2 + (it.y / len) * reach * 1.3 + phase * phase * 2.4;
        const z = origin.z * 2.5 + (it.z / len) * reach;
        const color = c.paints[(origin.paint + round) % c.paints.length];
        this.dot(ctx, p(x, y, z), (5 + it.b * 15) * (1 - phase * 0.5), color, Math.min(1, (1 - phase) * 1.6) * 0.85 * k);
      });
    }

    /* A painter's palette turning in the air, its blobs of paint breathing. */
    paletteRing({ ctx, w, h, t, c, k }) {
      const pitch = -0.95 + Math.sin(t * 0.3) * 0.12;
      const p = camera(w, h, t * 0.22, pitch, 7.5, 14);
      const outline = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU;
        const bite = Math.max(0, 1 - Math.hypot(Math.cos(a) - 0.92, Math.sin(a) - 0.38) * 2.1);
        const radius = 3.6 * (1 - bite * 0.36);
        outline.push(p(Math.cos(a) * radius * 1.12, 0, Math.sin(a) * radius * 0.86));
      }
      this.quad(ctx, outline, mix(c.panel, c.modified, 0.3), 0.75 * k, c.text, 0.45 * k);
      const hole = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        hole.push(p(2.2 + Math.cos(a) * 0.46, 0, 1.2 + Math.sin(a) * 0.36));
      }
      this.quad(ctx, hole, c.bg, 0.95, c.text, 0.45 * k);
      c.paints.concat(c.paints).forEach((color, i) => {
        const a = (i / 12) * TAU * 0.86 + 2.1;
        const size = 26 + Math.sin(t * 1.6 + i) * 4;
        const q = p(Math.cos(a) * 2.75 * 1.05, -0.08, Math.sin(a) * 2.75 * 0.8);
        this.dot(ctx, q, size, color, 0.95 * k);
        if (q) this.dot(ctx, { x: q.x - size * q.s / 300, y: q.y - size * q.s / 300, s: q.s, f: q.f }, size * 0.26, c.text, 0.25 * k);
      });
    }

    /* A slow ring of coloured pencils standing on their points. */
    pencils({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.24, 0.22, 8.2, 15);
      const wood = mix(c.modified, c.panel, 0.45);
      const list = [];
      for (let i = 0; i < 26; i++) {
        const it = this.items[i];
        const a = (i / 26) * TAU;
        const x = Math.cos(a) * 3.6;
        const z = Math.sin(a) * 3.6;
        const bob = Math.sin(t * 0.9 + it.a * 6) * 0.35;
        const far = p(x, 0, z);
        list.push({ x: x, z: z, bob: bob, color: c.paints[i % c.paints.length], depth: far ? far.z : 0 });
      }
      list.sort((a, b) => b.depth - a.depth);
      ctx.lineCap = "round";
      list.forEach((n) => {
        const top = p(n.x, -2.2 + n.bob, n.z);
        const end = p(n.x, 1.3 + n.bob, n.z);
        const tip = p(n.x, 2 + n.bob, n.z);
        if (!top || !end || !tip) return;
        const half = 0.15 * end.s;
        this.quad(ctx, [
          { x: end.x - half, y: end.y, f: end.f }, { x: end.x + half, y: end.y, f: end.f }, { x: tip.x, y: tip.y, f: tip.f },
        ], wood, 0.95 * k);
        this.quad(ctx, [
          { x: tip.x - half * 0.32, y: tip.y - (tip.y - end.y) * 0.32, f: tip.f }, { x: tip.x + half * 0.32, y: tip.y - (tip.y - end.y) * 0.32, f: tip.f }, { x: tip.x, y: tip.y, f: tip.f },
        ], n.color, 1);
        ctx.lineCap = "butt";
        this.line(ctx, top, end, n.color, 0.9 * k, 36);
        this.line(ctx, p(n.x, -2.2 + n.bob, n.z), p(n.x, 1.3 + n.bob, n.z), c.text, 0.12 * k, 8);
      });
    }

    /* Walking down a gallery: framed canvases on both walls, each with its own picture. */
    gallery({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.2) * 0.1, 0, 0.1, 24);
      const depth = 26;
      const travel = t * 1.8;
      const frames = [];
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 1 : -1;
        frames.push({ i: i, side: side, z: wrap(i * 1.45 + (side > 0 ? 0.7 : 0) - travel, depth) });
      }
      for (let i = 0; i < 26; i++) {
        const z = wrap(i - travel, depth);
        this.line(ctx, p(-3.3, 1.9, z), p(3.3, 1.9, z), c.text, 0.1 * k, 2);
        this.line(ctx, p(-3.3, -2.1, z), p(3.3, -2.1, z), c.text, 0.07 * k, 2);
      }
      frames.sort((a, b) => b.z - a.z).forEach((f) => {
        const it = this.items[f.i * 5];
        const x = f.side * 3.2;
        const at = (u, v) => p(x, -0.1 + v, f.z + u);
        const wide = 0.55 + it.a * 0.2;
        const tall = 0.75 + it.b * 0.3;
        this.quad(ctx, [at(-wide, -tall), at(wide, -tall), at(wide, tall), at(-wide, tall)], c.panel, 0.92, c.text, 0.55 * k);
        for (let s = 0; s < 4; s++) {
          const pick = this.items[(f.i * 13 + s * 3) % 320];
          const v = -tall * 0.72 + (s / 3) * tall * 1.44;
          this.line(ctx, at(-wide * 0.72, v), at(-wide * 0.72 + wide * (0.5 + pick.a), v + (pick.b - 0.5) * 0.3), c.paints[pick.paint], 0.9 * k, 14);
        }
      });
    }

    /* A picture's pixels raised into a field of blocks, a wave of colour passing through. */
    pixelField({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.16, 0.72, 6.6, 17);
      const n = 19;
      const size = 0.38;
      const cells = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = (i - n / 2) * size;
          const z = (j - n / 2) * size;
          const v = 0.5 + 0.5 * Math.sin(Math.hypot(x, z) * 1.5 - t * 1.4 + Math.sin(i * 0.7) * 0.6);
          const q = p(x, 0, z);
          cells.push({ x: x, z: z, v: v, i: i, j: j, depth: q ? q.z : 0 });
        }
      }
      cells.sort((a, b) => b.depth - a.depth).forEach((b) => {
        const y = 1 - b.v * 1.5;
        const s = size * 0.46;
        const color = c.paints[(b.i >> 2) % 3 + ((b.j >> 2) % 2) * 3];
        const tint = mix(c.panel, color, 0.25 + b.v * 0.75);
        this.line(ctx, p(b.x, 1, b.z), p(b.x, y, b.z), color, 0.28 * k, 14);
        this.quad(ctx, [p(b.x - s, y, b.z - s), p(b.x + s, y, b.z - s), p(b.x + s, y, b.z + s), p(b.x - s, y, b.z + s)], tint, 0.95 * k, c.text, 0.18 * k);
      });
    }

    /* The colour wheel as a turning disc, its rings of hue rippling up and down. */
    colorWheel({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.3, 0.85 + Math.sin(t * 0.25) * 0.15, 5.4, 14);
      const slices = 30;
      const rings = 7;
      const cells = [];
      for (let r = 0; r < rings; r++) {
        for (let s = 0; s < slices; s++) {
          const a0 = (s / slices) * TAU;
          const a1 = ((s + 1) / slices) * TAU;
          const r0 = 0.5 + r * 0.46;
          const r1 = r0 + 0.42;
          const y = Math.sin(t * 1.4 - r * 0.8 + s * 0.42) * 0.22;
          const q = p(Math.cos(a0) * r0, y, Math.sin(a0) * r0);
          cells.push({ a0: a0, a1: a1, r0: r0, r1: r1, y: y, s: s, r: r, depth: q ? q.z : 0 });
        }
      }
      cells.sort((a, b) => b.depth - a.depth).forEach((b) => {
        const color = hue(b.s / slices, 0.72, c.dark ? 0.32 + b.r * 0.05 : 0.72 - b.r * 0.05);
        this.quad(ctx, [
          p(Math.cos(b.a0) * b.r0, b.y, Math.sin(b.a0) * b.r0), p(Math.cos(b.a1) * b.r0, b.y, Math.sin(b.a1) * b.r0),
          p(Math.cos(b.a1) * b.r1, b.y, Math.sin(b.a1) * b.r1), p(Math.cos(b.a0) * b.r1, b.y, Math.sin(b.a0) * b.r1),
        ], color, 0.9 * k);
      });
    }

    /* Spray cans out of frame: cones of fine dots, spreading and fading as they fly. */
    sprayCloud({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.2) * 0.4, 0.05, 6.5, 14);
      this.items.forEach((it, i) => {
        const stream = i % 4;
        const u = wrap(it.a + t * (0.14 + it.b * 0.1), 1);
        const cone = u * (0.6 + it.b * 2.6);
        const angle = it.c * TAU + t * 0.3;
        const dir = stream % 2 ? 1 : -1;
        const color = c.paints[(stream + Math.floor(t * 0.12)) % c.paints.length];
        const x = dir * (-7.2 + u * 11);
        const y = -1.5 + stream * 1 + Math.cos(angle) * cone;
        this.dot(ctx, p(x, y, Math.sin(angle) * cone), 4.5 + it.b * 9, color, (1 - u * 0.8) * 0.8 * k);
      });
    }

    /* Wire solids - cubes, pyramids and diamonds - drifting towards you and turning. */
    solids({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, 0, 0, 0.5, 22);
      const shapes = [
        { v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
        { v: [[0, -1.3, 0], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], e: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]] },
        { v: [[0, -1.4, 0], [0, 1.4, 0], [-1.1, 0, 0], [1.1, 0, 0], [0, 0, -1.1], [0, 0, 1.1]], e: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]] },
      ];
      this.items.slice(0, 26)
        .map((it) => ({ it: it, z: wrap(it.z * 11 + 11 - t * 1.4, 22) }))
        .sort((a, b) => b.z - a.z)
        .forEach(({ it, z }) => {
          const shape = shapes[it.value % shapes.length];
          const color = c.paints[it.paint];
          const size = 0.34 + it.a * 0.34;
          const yaw = t * (0.4 + it.b * 0.6) + it.c * 6;
          const pitch = t * (0.3 + it.a * 0.4);
          const cy = Math.cos(yaw);
          const sy = Math.sin(yaw);
          const cp = Math.cos(pitch);
          const sp = Math.sin(pitch);
          const points = shape.v.map(([vx, vy, vz]) => {
            const x1 = vx * cy - vz * sy;
            const z1 = vx * sy + vz * cy;
            const y1 = vy * cp - z1 * sp;
            const z2 = vy * sp + z1 * cp;
            return p(it.x * 4 + x1 * size, it.y * 2.4 + y1 * size, z + z2 * size);
          });
          shape.e.forEach(([a, b]) => this.line(ctx, points[a], points[b], color, 0.9 * k, 4));
          points.forEach((q) => this.dot(ctx, q, 3, color, 0.9 * k));
        });
    }

    /* Flying low over graph paper while a curve is drawn across it, cell by cell. */
    gridPaper({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.15) * 0.12, 0.42, 1.5, 19);
      const cell = 0.5;
      const travel = t * 1.3;
      const shift = wrap(travel, cell);
      const first = Math.floor(travel / cell);
      for (let row = 0; row < 40; row++) {
        const z = row * cell - shift;
        const world = first + row;
        const major = world % 5 === 0;
        this.line(ctx, p(-6, 1.25, z), p(6, 1.25, z), c.text, (major ? 0.3 : 0.12) * k, major ? 2.4 : 1);
        const curves = [Math.sin(world * 0.16) * 3.2, Math.sin(world * 0.09 + 2) * 4.2];
        curves.forEach((centre, n) => {
          const col = Math.round(centre / cell) * cell;
          const color = c.paints[(n * 2 + Math.floor(world / 24)) % c.paints.length];
          this.quad(ctx, [p(col, 1.25, z), p(col + cell, 1.25, z), p(col + cell, 1.25, z + cell), p(col, 1.25, z + cell)], color, 0.72 * k);
        });
      }
      for (let col = -12; col <= 12; col++) {
        const major = col % 5 === 0;
        this.line(ctx, p(col * cell, 1.25, 0.3), p(col * cell, 1.25, 20), c.text, (major ? 0.3 : 0.12) * k, major ? 2.4 : 1);
      }
    }

    /* Curves in space being edited: anchor points, control handles and the curve between them. */
    bezier({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.16) * 0.5, 0.18, 7, 15);
      for (let n = 0; n < 6; n++) {
        const color = c.paints[n];
        const pts = [0, 1, 2, 3].map((i) => {
          const it = this.items[n * 4 + i];
          return [
            -6.6 + i * 4.4 + Math.sin(t * (0.3 + it.a * 0.4) + it.b * 6) * 0.5,
            it.y * 2 + Math.sin(t * (0.4 + it.c * 0.5) + it.a * 6) * 0.9,
            it.z * 2.6 + Math.cos(t * (0.3 + it.b * 0.3) + it.c * 6) * 0.7,
          ];
        });
        let prev = null;
        for (let i = 0; i <= 44; i++) {
          const u = i / 44;
          const v = 1 - u;
          const at = [0, 1, 2].map((d) => v * v * v * pts[0][d] + 3 * v * v * u * pts[1][d] + 3 * v * u * u * pts[2][d] + u * u * u * pts[3][d]);
          const here = p(at[0], at[1], at[2]);
          if (prev) this.line(ctx, prev, here, color, 0.95 * k, 12);
          prev = here;
        }
        const screen = pts.map((q) => p(q[0], q[1], q[2]));
        this.line(ctx, screen[0], screen[1], c.text, 0.4 * k, 1.6);
        this.line(ctx, screen[3], screen[2], c.text, 0.4 * k, 1.6);
        screen.forEach((q, i) => {
          if (!q) return;
          const box = (i === 0 || i === 3 ? 4.6 : 3) * q.s / 100;
          ctx.fillStyle = rgba(i === 0 || i === 3 ? c.panel : color, q.f * k);
          ctx.strokeStyle = rgba(color, q.f);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(q.x - box, q.y - box, box * 2, box * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    }

    /* The layers of a drawing pulled apart and pushed together, each with its own marks. */
    layers({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.2, 0.62, 6, 16);
      const count = 8;
      const spread = 0.42 + (0.5 + 0.5 * Math.sin(t * 0.7)) * 0.34;
      const list = [];
      for (let i = 0; i < count; i++) {
        const y = (count / 2 - i) * spread;
        const q = p(0, y, 0);
        list.push({ i: i, y: y, depth: q ? q.z : 0 });
      }
      list.sort((a, b) => b.depth - a.depth).forEach(({ i, y }) => {
        const color = c.paints[i % c.paints.length];
        const it = this.items[i * 9];
        this.quad(ctx, [p(-3.4, y, -2.1), p(3.4, y, -2.1), p(3.4, y, 2.1), p(-3.4, y, 2.1)], mix(c.panel, color, 0.2), 0.38 * k, color, 0.85 * k);
        const ring = [];
        for (let s = 0; s < 22; s++) {
          const a = (s / 22) * TAU;
          ring.push(p(it.x * 1.3 + Math.cos(a) * (0.4 + it.a * 0.6), y, it.z * 0.8 + Math.sin(a) * (0.4 + it.b * 0.4)));
        }
        this.quad(ctx, ring, color, 0.7 * k);
        this.line(ctx, p(-2.1, y, it.y * 1.3), p(2.1, y, -it.y * 1.3), color, 0.85 * k, 4);
      });
    }

    /* Drops of ink falling on a wet floor and spreading in widening rings. */
    inkDrops({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.08, 0.72, 6.6, 15);
      const drops = 12;
      for (let d = 0; d < drops; d++) {
        const phase = wrap(t * 0.2 + d / drops, 1);
        const round = Math.floor(t * 0.2 + d / drops);
        const it = this.items[(d * 17 + round * 29) % this.items.length];
        const color = c.paints[it.paint];
        const x = it.x * 6;
        const z = it.z * 3.4;
        if (phase < 0.16) {
          const u = phase / 0.16;
          this.dot(ctx, p(x, -3.2 + u * u * 4, z), 9, color, 0.95 * k);
          continue;
        }
        const u = (phase - 0.16) / 0.84;
        const blot = [];
        for (let s = 0; s < 34; s++) {
          const a = (s / 34) * TAU;
          const edge = 1 + Math.sin(a * 5 + it.a * 6) * 0.09 + Math.sin(a * 9 + it.b * 6) * 0.05;
          const radius = (0.08 + (1 - (1 - u) ** 2.4) * (0.6 + it.c * 0.7)) * edge;
          blot.push(p(x + Math.cos(a) * radius, 0.8, z + Math.sin(a) * radius));
        }
        this.quad(ctx, blot, color, (1 - u) * 0.72 * k, color, (1 - u) * 0.9 * k);
        for (let r = 1; r <= 2; r++) {
          const ring = [];
          const radius = Math.max(0, u * (1 + r * 0.7) - r * 0.12);
          for (let s = 0; s < 34; s++) {
            const a = (s / 34) * TAU;
            ring.push(p(x + Math.cos(a) * radius, 0.8, z + Math.sin(a) * radius));
          }
          this.quad(ctx, ring, null, 0, color, (1 - u) * 0.5 * k);
        }
      }
    }

    /* A fan deck of colour swatches turning, its cards opening out and folding back. */
    swatches({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, Math.sin(t * 0.2) * 0.35, 0.28, 5.2, 13);
      const count = 22;
      const open = 0.6 + (0.5 + 0.5 * Math.sin(t * 0.5)) * 0.4;
      const cards = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU * open + t * 0.3;
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        const q = p(cs * 2.2, 0, sn * 2.2);
        cards.push({ i: i, cs: cs, sn: sn, depth: q ? q.z : 0 });
      }
      cards.sort((a, b) => b.depth - a.depth).forEach(({ i, cs, sn }) => {
        const at = (r, y) => p(cs * r, y, sn * r);
        const color = mix(c.paints[i % c.paints.length], c.paints[(i + 1) % c.paints.length], (i % 4) / 4);
        this.quad(ctx, [at(0.25, -1.55), at(3.2, -1.55), at(3.2, 1.35), at(0.25, 1.35)], color, 0.9 * k, c.text, 0.25 * k);
        this.quad(ctx, [at(0.25, 1.35), at(3.2, 1.35), at(3.2, 1.75), at(0.25, 1.75)], c.panel, 0.95, c.text, 0.25 * k);
      });
    }

    /* A stack of scan slices - the DICOM side of the program - with one slice lit moving through it. */
    scanSlices({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.2, 0.7, 4.8, 15);
      const count = 26;
      const lit = wrap(t * 3.2, count);
      const list = [];
      for (let i = 0; i < count; i++) {
        const y = (i - count / 2) * 0.17;
        const q = p(0, y, 0);
        list.push({ i: i, y: y, depth: q ? q.z : 0 });
      }
      const circle = (cx, cz, rx, rz, y, a) => {
        const out = [];
        for (let s = 0; s < 32; s++) {
          const u = (s / 32) * TAU;
          out.push(p(cx + Math.cos(u) * rx * a, y, cz + Math.sin(u) * rz * a));
        }
        return out;
      };
      list.sort((a, b) => b.depth - a.depth).forEach(({ i, y }) => {
        const near = Math.max(0, 1 - Math.min(Math.abs(i - lit), count - Math.abs(i - lit)) / 2.4);
        const profile = Math.sqrt(Math.max(0.05, 1 - ((i - count / 2) / (count / 2 + 2)) ** 2));
        const shell = mix(c.text, c.accent, near);
        this.quad(ctx, circle(0, 0, 2.5, 1.9, y, profile), near ? c.accent : c.panel, 0.08 + near * 0.3, shell, (0.26 + near * 0.7) * k);
        this.quad(ctx, circle(-1, 0.1, 0.72, 1.1, y, profile), c.text, 0.03 + near * 0.16, shell, (0.14 + near * 0.6) * k);
        this.quad(ctx, circle(1, 0.1, 0.72, 1.1, y, profile), c.text, 0.03 + near * 0.16, shell, (0.14 + near * 0.6) * k);
        this.quad(ctx, circle(0, -1.35, 0.26, 0.26, y, profile), c.modified, (0.2 + near * 0.6) * k, c.modified, (0.3 + near * 0.6) * k);
      });
    }

    /* ------------------------------------- the scenes every program shares */

    /* A turning globe of stars, each linked to its nearest neighbours. */
    constellation({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.18, Math.sin(t * 0.12) * 0.4, 7, 13);
      const stars = this.items.slice(0, 140);
      const projected = stars.map((s) => p(s.x, s.y, s.z));
      this.links.forEach(([i, j]) => this.line(ctx, projected[i], projected[j], c.accent, 0.35 * k, 1.5));
      stars.forEach((s, i) => {
        const twinkle = 0.6 + 0.4 * Math.sin(t * (1 + s.b * 2) + s.c * 6);
        this.dot(ctx, projected[i], 5 + s.b * 4, s.status ? this.tone(c, s.status) : c.accent, twinkle * k);
      });
    }

    /* A wire surface with rings of change spreading across it. */
    ripples({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.12, 0.6, 5.2, 16);
      const sources = [0, 1, 2].map((i) => ({ x: Math.sin(i * 2.1 + t * 0.1) * 2, z: Math.cos(i * 1.7 + t * 0.13) * 2, tone: [c.accent, c.added, c.modified][i] }));
      const height = (x, z) => {
        let y = 0;
        sources.forEach((s) => {
          const d = Math.hypot(x - s.x, z - s.z);
          y += Math.sin(d * 3 - t * 3) * 0.25 / (1 + d);
        });
        return y;
      };
      const n = 26;
      const size = 0.3;
      for (let i = 0; i < n; i++) {
        let prevX = null;
        let prevZ = null;
        for (let j = 0; j < n; j++) {
          const a = (i - n / 2) * size;
          const b = (j - n / 2) * size;
          const qx = p(a, 0.6 - height(a, b), b);
          const qz = p(b, 0.6 - height(b, a), a);
          this.line(ctx, prevX, qx, c.accent, 0.62 * k, 2);
          this.line(ctx, prevZ, qz, c.text, 0.28 * k, 1.5);
          prevX = qx;
          prevZ = qz;
        }
      }
      sources.forEach((s) => this.dot(ctx, p(s.x, 0.6 - height(s.x, s.z), s.z), 10, s.tone, 0.9 * k));
    }

    /* Curtains of light hanging in the sky, swaying as you circle under them. */
    aurora({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.1, -0.35, 6, 16);
      [c.accent, c.added, c.modified].forEach((tone, band) => {
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

    /* Gliding over a honeycomb floor with waves of light running through it. */
    hexGrid({ ctx, w, h, t, c, k }) {
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

    /* Bubbles rising all around, nearer ones bigger and brighter. */
    bubbles({ ctx, w, h, t, c, k }) {
      const p = camera(w, h, t * 0.1, -0.1, 1, 14);
      this.items.slice(0, 120).map((it) => {
        const y = 3 - wrap(it.a * 7 + t * (0.4 + it.b * 0.5), 7);
        return { it: it, q: p(it.x * 4 + Math.sin(t + it.c * 6) * 0.2, y, it.z * 4 + 5) };
      }).filter((b) => b.q).sort((a, b) => b.q.z - a.q.z).forEach(({ it, q }) => {
        const tone = c.paints[it.paint];
        const radius = Math.max(1, q.s * (0.08 + it.b * 0.12));
        ctx.strokeStyle = rgba(tone, 0.7 * q.f * k);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, radius, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(tone, 0.1 * q.f * k);
        ctx.fill();
        ctx.fillStyle = rgba(c.text, 0.35 * q.f * k);
        ctx.beginPath();
        ctx.arc(q.x - radius * 0.35, q.y - radius * 0.35, radius * 0.18, 0, TAU);
        ctx.fill();
      });
    }
  }

  return { StartBackground: StartBackground, KINDS: KINDS, ICONS: ICONS };
});
