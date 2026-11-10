// Procedural, seamlessly tiling surface patterns for material presets (tiles with grout, parquet
// layouts, terrazzo, wallpaper, rugs, marble veins, woven fibres …), drawn on a 2D canvas.
//
// A preset opts in with `pattern: { kind, ...params }`; materials.js turns it into a CanvasTexture
// (colour map + bump map) once per distinct spec. Everything except `renderPattern` is pure and runs
// in Node (tests); without a canvas (Node) `renderPattern` returns null and presets keep their flat colour.
//
// API (keep small and stable — other preset files use it):
//   PATTERN_KINDS                      kind ids
//   validatePattern(spec) → string[]   problems ([] = fine)
//   patternLayout(spec)   → { period:[m,m], n:[nx,ny], cover:[m,m], px:[w,h], ppm }
//       `cover` = metres one texture repeat spans (n × period), `px` = canvas size
//   patternShapes(spec)   → shapes of one cover (metres, may stick out; the renderer wraps them):
//       { t:'poly', p:[x,y,…], c, h, inset? } | { t:'circle', x, y, r, c, h, ring? }
//       { t:'ellipse', x, y, rx, ry, a, c, h } | { t:'stroke', p:[x,y,…], w, c, a?, h? }
//   renderPattern(spec, makeCanvas?) → { map, bump, layout } canvases, or null without a canvas
//   patternKey(spec)      → cache key
//
// Common params (all optional unless a kind says so; lengths in metres, colours '#rrggbb'):
//   colors: [..]        tile / motif colours (a tile picks one at random; `checker` alternates the first two)
//   grout, groutWidth   joint colour and width (inset of each tile); groutWidth 0 = butt joints
//   variation           0..1 per-tile brightness jitter        seed   integer, the random layout
//   grain               0..1 per-pixel noise                    streak 'x' | 'y' fibre direction of the grain
//   cloud               0..1 soft low-frequency mottling        cloudScale  metres per cloud (0.25)
//   speckle             [[colour, density 0..1, size m], …]     granite-like flecks
//   bump                bump-map strength (materials.js), default 1
// Kinds and their own params:
//   grid { w, h, checker? }                stack-bonded tiles
//   brick { w, h, offset = 0.5 | 'random' } running bond / random-joint planks
//   herringbone { w = plank length, h = plank width } (w/h integer), laid at 45° (columns along y);
//                                        `checker` = the two plank directions take colors[0] / colors[1]
//   chevron { w = column width, h = plank pitch, angle = 45 }
//   basketweave { w = strip width, n = strips per block, fibres? = lines per strip }
//   hexagon { size = across flats }        penny { d }          fishscale { r }
//   diamond { w, h, checker? }             (harlequin; with a grout colour = trellis/lattice)
//   encaustic { w, motif: quatrefoil|flower|star|arcs|diamond|cross } colors [tile, motif, accent]
//   terrazzo { base, chips: [[colour, minSize, maxSize, perM2], …], size = cover }
//   stripes { widths: [..], dir = 'v' | 'h' }  colors align with widths
//   dots { spacing, r, base, stagger = true }  damask { w, h, base, ink }
//   botanical { base, leaf = size, density = per m² }
//   marble { base, veins: [[colour, width, count, opacity], …], angle = 30, size = 1.2 }
//   plain { base, size = 0.5 }             (grain / cloud / speckle only)
//   rug { w, h, field, borders: [[colour, width], …], medallion?: [colour, size], motif?: [colour, spacing, size] }
//   kilim { w, bands: [[type 's'|'z'|'d', height, colour, colour2, motifWidth?], …] }

export const PATTERN_KINDS = ['grid', 'brick', 'herringbone', 'chevron', 'basketweave', 'hexagon', 'penny', 'fishscale', 'diamond', 'encaustic', 'terrazzo', 'stripes', 'dots', 'damask', 'botanical', 'marble', 'plain', 'rug', 'kilim'];
/** Kinds whose shapes tile the plane exactly (no gaps or overlaps before grout) — unit-tested. */
export const TILING_KINDS = ['grid', 'brick', 'herringbone', 'chevron', 'basketweave', 'hexagon', 'diamond'];
export const ENCAUSTIC_MOTIFS = ['quatrefoil', 'flower', 'star', 'arcs', 'diamond', 'cross'];

const SQ2 = Math.SQRT2;
const SQ3 = Math.sqrt(3);
const MAX_SIDE = 1024;
const HEX = /^#[0-9a-f]{6}$/i;

// ───────────────────────── small helpers

/** Deterministic random numbers (mulberry32). */
export function random(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Colour scaled in brightness (f 1 = same). */
export const shade = (hex, f) => toHex(rgb(hex).map((v) => v * f));
export const mixHex = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const rect = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h];
const ngon = (cx, cy, r, n, a0 = 0) => { const p = []; for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2; p.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } return p; };
const rotate = (p, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); const out = []; for (let i = 0; i < p.length; i += 2) { const x = p[i] - cx, y = p[i + 1] - cy; out.push(cx + x * c - y * s, cy + x * s + y * c); } return out; };

/** Signed area of a flat polygon [x,y,…] (positive = counter-clockwise in a y-up frame). */
export function polygonArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; }
  return a / 2;
}

/** A convex polygon moved inwards by d on every edge (grout). Degenerate results collapse to the centroid. */
export function insetPolygon(p, d) {
  if (!(d > 0)) return p;
  const n = p.length / 2;
  const sign = polygonArea(p) >= 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[(2 * i + 2) % p.length], y1 = p[(2 * i + 3) % p.length];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    // Inward normal of a CCW polygon is (-dy, dx).
    const nx = (-(y1 - y0) / len) * sign, ny = ((x1 - x0) / len) * sign;
    lines.push([x0 + nx * d, y0 + ny * d, x1 - x0, y1 - y0]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay, adx, ady] = lines[(i + n - 1) % n];
    const [bx, by, bdx, bdy] = lines[i];
    const den = adx * bdy - ady * bdx;
    if (Math.abs(den) < 1e-12) { out.push(bx, by); continue; }
    const t = ((bx - ax) * bdy - (by - ay) * bdx) / den;
    out.push(ax + adx * t, ay + ady * t);
  }
  // A tile thinner than the grout turns inside out: drop it to a point.
  if (polygonArea(out) * polygonArea(p) <= 0) { let cx = 0, cy = 0; for (let i = 0; i < p.length; i += 2) { cx += p[i]; cy += p[i + 1]; } cx /= n; cy /= n; return [cx, cy, cx, cy, cx, cy]; }
  return out;
}

/** Whether (x, y) is inside the polygon (even-odd). */
export function pointInPolygon(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Colour pickers for a spec: random from `colors` with brightness jitter. */
function palette(spec, rnd) {
  const colors = spec.colors?.length ? spec.colors : ['#d8d6d0'];
  const v = spec.variation ?? 0;
  const vary = (c) => (v ? shade(c, 1 + (rnd() * 2 - 1) * v) : c);
  return {
    any: () => vary(colors[Math.floor(rnd() * colors.length)]),
    at: (i) => vary(colors[((i % colors.length) + colors.length) % colors.length]),
    colors,
  };
}

// ───────────────────────── kinds: period (metres) + shapes of nx × ny periods

const tile = (p, c, h = 1) => ({ t: 'poly', p, c, h, inset: true });

const KINDS = {
  grid: {
    period: (s) => [s.w, s.h ?? s.w],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), w = s.w, h = s.h ?? s.w, out = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push(tile(rect(i * w, j * h, w, h), s.checker ? pal.at(i + j) : pal.any()));
      return out;
    },
  },
  brick: {
    period(s) {
      if (s.offset === 'random') return [s.w, s.h];
      const off = s.offset ?? 0.5;
      let k = 1;
      while (k < 12 && Math.abs(k * off - Math.round(k * off)) > 1e-6) k++;
      return [s.w, s.h * k];
    },
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [];
      const [pw, ph] = this.period(s);
      const rows = Math.round((ph * ny) / s.h);
      for (let j = 0; j < rows; j++) {
        const shift = s.offset === 'random' ? rnd() * s.w : (((j * (s.offset ?? 0.5)) % 1) * s.w);
        for (let i = 0; i < nx * Math.round(pw / s.w); i++) out.push(tile(rect(shift + i * s.w, j * s.h, s.w, s.h), pal.any()));
      }
      return out;
    },
  },
  herringbone: {
    period: (s) => [s.w * SQ2, s.h * SQ2],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), L = s.w, W = s.h, out = [];
      // Unrotated lattice (W, W) and (L, −L) with a horizontal and a vertical plank; turned 45° it becomes
      // the rectangular period (L√2, W√2) with the zigzag columns running along y.
      const turn = (p) => { const q = []; for (let i = 0; i < p.length; i += 2) q.push((p[i] - p[i + 1]) / SQ2, (p[i] + p[i + 1]) / SQ2); return q; };
      const H = turn(rect(0, 0, L, W)), V = turn(rect(0, W, W, L));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const ox = i * L * SQ2, oy = j * W * SQ2;
        [H, V].forEach((m, q) => out.push(tile(m.map((v, k) => v + (k % 2 ? oy : ox)), s.checker ? pal.at(q) : pal.any())));
      }
      return out;
    },
  },
  chevron: {
    period: (s) => [2 * s.w, s.h],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [], rise = s.w * Math.tan(((s.angle ?? 45) * Math.PI) / 180);
      for (let c = 0; c < 2 * nx; c++) {
        const x0 = c * s.w, x1 = x0 + s.w;
        const [b0, b1] = c % 2 ? [rise, 0] : [0, rise];
        for (let j = 0; j < ny; j++) {
          const y = j * s.h;
          out.push(tile([x0, y + b0, x1, y + b1, x1, y + b1 + s.h, x0, y + b0 + s.h], pal.any()));
        }
      }
      return out;
    },
  },
  basketweave: {
    period: (s) => [2 * s.w * (s.n ?? 3), 2 * s.w * (s.n ?? 3)],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), n = s.n ?? 3, b = s.w * n, out = [];
      for (let bj = 0; bj < 2 * ny; bj++) for (let bi = 0; bi < 2 * nx; bi++) {
        const x = bi * b, y = bj * b, across = (bi + bj) % 2 === 0;
        for (let k = 0; k < n; k++) {
          const r = across ? rect(x, y + k * s.w, b, s.w) : rect(x + k * s.w, y, s.w, b);
          const c = pal.any();
          out.push(tile(r, c));
          for (let f = 0; f < (s.fibres ?? 0); f++) {
            const o = (f + 0.5 + (rnd() - 0.5) * 0.6) / s.fibres * s.w;
            const fc = shade(c, 0.82 + rnd() * 0.36), fw = (s.w / s.fibres) * (0.35 + rnd() * 0.4);
            out.push({ t: 'stroke', p: across ? [x, y + k * s.w + o, x + b, y + k * s.w + o] : [x + k * s.w + o, y, x + k * s.w + o, y + b], w: fw, c: fc, h: 0.8 + rnd() * 0.2 });
          }
        }
      }
      return out;
    },
  },
  hexagon: {
    period: (s) => [(3 * s.size) / SQ3, s.size],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), R = s.size / SQ3, out = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const ox = i * 3 * R, oy = j * s.size;
        out.push(tile(ngon(ox, oy, R, 6), pal.any()), tile(ngon(ox + 1.5 * R, oy + s.size / 2, R, 6), pal.any()));
      }
      return out;
    },
  },
  penny: {
    period: (s) => { const p = s.d + (s.groutWidth ?? 0.002); return [p, p * SQ3]; },
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), [p] = this.period(s), out = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const ox = i * p, oy = j * p * SQ3;
        out.push({ t: 'circle', x: ox, y: oy, r: s.d / 2, c: pal.any(), h: 1 }, { t: 'circle', x: ox + p / 2, y: oy + (p * SQ3) / 2, r: s.d / 2, c: pal.any(), h: 1 });
      }
      return out;
    },
  },
  fishscale: {
    ordered: true,
    period: (s) => [2 * s.r, 2 * s.r],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [];
      for (let j = 0; j < 2 * ny; j++) for (let i = 0; i < nx; i++) out.push({ t: 'circle', x: i * 2 * s.r + (j % 2 ? s.r : 0), y: j * s.r, r: s.r, c: pal.any(), h: 1, ring: true });
      return out;
    },
  },
  diamond: {
    period: (s) => [s.w, s.h],
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [];
      const d = (cx, cy) => [cx - s.w / 2, cy, cx, cy - s.h / 2, cx + s.w / 2, cy, cx, cy + s.h / 2];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const ox = i * s.w, oy = j * s.h;
        out.push(tile(d(ox, oy), s.checker ? pal.at(0) : pal.any()), tile(d(ox + s.w / 2, oy + s.h / 2), s.checker ? pal.at(1) : pal.any()));
      }
      return out;
    },
  },
  encaustic: {
    period: (s) => [s.w, s.w],
    shapes(s, nx, ny, rnd) {
      const out = [], w = s.w, [bg, ink = '#333333', accent = ink] = s.colors ?? ['#e8e2d6'];
      const v = s.variation ?? 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = i * w, y = j * w, cx = x + w / 2, cy = y + w / 2, f = v ? 1 + (rnd() * 2 - 1) * v : 1;
        const C = (c) => (f === 1 ? c : shade(c, f));
        out.push(tile(rect(x, y, w, w), C(bg)));
        const m = (shape) => out.push({ h: 0.95, ...shape });
        switch (s.motif) {
          case 'quatrefoil':
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m({ t: 'circle', x: cx + (dx * w) / 6, y: cy + (dy * w) / 6, r: w / 6, c: C(ink) });
            m({ t: 'circle', x: cx, y: cy, r: w / 12, c: C(accent) });
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) m({ t: 'poly', p: sector(x + dx * w, y + dy * w, w * 0.22, dx, dy), c: C(accent) });
            break;
          case 'flower':
            for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; m({ t: 'ellipse', x: cx + Math.cos(a) * w * 0.2, y: cy + Math.sin(a) * w * 0.2, rx: w * 0.14, ry: w * 0.06, a, c: C(k % 2 ? accent : ink) }); }
            m({ t: 'circle', x: cx, y: cy, r: w * 0.08, c: C(accent) });
            break;
          case 'star': {
            const p = [];
            for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, r = k % 2 ? w * 0.2 : w * 0.42; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
            m({ t: 'poly', p, c: C(ink) });
            m({ t: 'poly', p: ngon(cx, cy, w * 0.12, 8, Math.PI / 8), c: C(accent) });
            break;
          }
          case 'arcs':
            for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
              m({ t: 'poly', p: sector(x + dx * w, y + dy * w, w / 2, dx, dy), c: C(ink) });
              m({ t: 'poly', p: sector(x + dx * w, y + dy * w, w * 0.32, dx, dy), c: C(bg), h: 0.9 });
              m({ t: 'poly', p: sector(x + dx * w, y + dy * w, w * 0.16, dx, dy), c: C(accent) });
            }
            break;
          case 'diamond':
            m({ t: 'poly', p: [cx, y + w * 0.06, x + w * 0.94, cy, cx, y + w * 0.94, x + w * 0.06, cy], c: C(ink) });
            m({ t: 'poly', p: rect(cx - w * 0.14, cy - w * 0.14, w * 0.28, w * 0.28), c: C(accent) });
            break;
          case 'cross': default: {
            const a = w * 0.12, b = w * 0.4;
            m({ t: 'poly', p: [cx - a, cy - b, cx + a, cy - b, cx + a, cy - a, cx + b, cy - a, cx + b, cy + a, cx + a, cy + a, cx + a, cy + b, cx - a, cy + b, cx - a, cy + a, cx - b, cy + a, cx - b, cy - a, cx - a, cy - a], c: C(ink) });
            m({ t: 'circle', x: cx, y: cy, r: a * 0.8, c: C(accent) });
          }
        }
      }
      return out;
    },
  },
  terrazzo: {
    period: (s) => [s.size ?? 0.5, s.size ?? 0.5],
    background: (s) => s.base, groutH: 0.85,
    shapes(s, nx, ny, rnd) {
      const out = [], [cw, ch] = [(s.size ?? 0.5) * nx, (s.size ?? 0.5) * ny];
      for (const [c, min, max, perM2] of s.chips ?? []) {
        const count = Math.round(perM2 * cw * ch);
        for (let k = 0; k < count; k++) {
          const r = (min + rnd() * (max - min)) / 2, x = rnd() * cw, y = rnd() * ch, n = 5 + Math.floor(rnd() * 4), a0 = rnd() * 6.3;
          const p = [];
          for (let q = 0; q < n; q++) { const a = a0 + ((q + rnd() * 0.6) / n) * Math.PI * 2, rr = r * (0.65 + rnd() * 0.35); p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
          out.push({ t: 'poly', p, c: shade(c, 0.9 + rnd() * 0.2), h: 1 });
        }
      }
      return out;
    },
  },
  stripes: {
    period(s) { const sum = s.widths.reduce((a, b) => a + b, 0); return s.dir === 'h' ? [0.25, sum] : [sum, 0.25]; },
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [], h = s.dir === 'h';
      const [pw, ph] = this.period(s);
      const reps = h ? ny : nx, len = h ? pw * nx : ph * ny, sum = h ? ph : pw;
      for (let r = 0; r < reps; r++) {
        let o = r * sum;
        s.widths.forEach((wd, k) => { out.push(tile(h ? rect(0, o, len, wd) : rect(o, 0, wd, len), pal.at(k), s.heights?.[k] ?? 1)); o += wd; });
      }
      return out;
    },
  },
  dots: {
    period: (s) => [s.spacing, (s.stagger ?? true) ? s.spacing * SQ3 : s.spacing],
    background: (s) => s.base, groutH: 0.5,
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [], stagger = s.stagger ?? true, [, ph] = this.period(s);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        out.push({ t: 'circle', x: i * s.spacing, y: j * ph, r: s.r, c: pal.any(), h: 1 });
        if (stagger) out.push({ t: 'circle', x: i * s.spacing + s.spacing / 2, y: j * ph + ph / 2, r: s.r, c: pal.any(), h: 1 });
      }
      return out;
    },
  },
  damask: {
    period: (s) => [s.w, s.h],
    background: (s) => s.base, groutH: 0.5,
    shapes(s, nx, ny) {
      const out = [], { w, h } = s, ink = s.ink;
      const motif = (cx, cy, k) => {
        const e = (dx, dy, rx, ry, a) => out.push({ t: 'ellipse', x: cx + dx * w, y: cy + dy * h, rx: rx * w, ry: ry * h, a, c: ink, h: 1 });
        out.push({ t: 'poly', p: [cx, cy - h * 0.2 * k, cx + w * 0.09 * k, cy, cx, cy + h * 0.2 * k, cx - w * 0.09 * k, cy], c: ink, h: 1 });
        e(0, -0.27 * k, 0.05 * k, 0.07 * k, 0); e(0, 0.27 * k, 0.05 * k, 0.07 * k, 0);
        for (const sx of [-1, 1]) {
          e(sx * 0.13 * k, -0.12 * k, 0.1 * k, 0.035 * k, sx * 0.7); e(sx * 0.13 * k, 0.12 * k, 0.1 * k, 0.035 * k, -sx * 0.7);
          e(sx * 0.2 * k, 0, 0.035 * k, 0.09 * k, 0);
          e(sx * 0.08 * k, -0.33 * k, 0.06 * k, 0.02 * k, -sx * 0.5); e(sx * 0.08 * k, 0.33 * k, 0.06 * k, 0.02 * k, sx * 0.5);
        }
      };
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { motif(i * w + w / 2, j * h + h / 2, 1); motif(i * w, j * h, 0.55); }
      return out;
    },
  },
  botanical: {
    period: () => [0.6, 0.6],
    background: (s) => s.base, groutH: 0.5,
    shapes(s, nx, ny, rnd) {
      const pal = palette(s, rnd), out = [], cw = 0.6 * nx, ch = 0.6 * ny, size = s.leaf ?? 0.08;
      const count = Math.round((s.density ?? 60) * cw * ch);
      for (let k = 0; k < count; k++) {
        const x = rnd() * cw, y = rnd() * ch, a = rnd() * Math.PI * 2, L = size * (0.6 + rnd() * 0.6), c = pal.any();
        out.push({ t: 'ellipse', x, y, rx: L / 2, ry: L * 0.2, a, c, h: 1 });
        out.push({ t: 'stroke', p: [x - (Math.cos(a) * L) / 2, y - (Math.sin(a) * L) / 2, x + (Math.cos(a) * L) * 0.75, y + (Math.sin(a) * L) * 0.75], w: L * 0.025, c: shade(c, 0.7), h: 1 });
      }
      return out;
    },
  },
  marble: {
    period: (s) => [s.size ?? 1.2, s.size ?? 1.2],
    background: (s) => s.base, groutH: 0.5,
    shapes(s, nx, ny, rnd) {
      const out = [], cw = (s.size ?? 1.2) * nx, ch = (s.size ?? 1.2) * ny, angle = ((s.angle ?? 30) * Math.PI) / 180;
      for (const [c, width, count, opacity = 0.8] of s.veins ?? []) {
        for (let v = 0; v < count; v++) {
          let x = rnd() * cw, y = rnd() * ch, a = angle + (rnd() - 0.5) * 0.9;
          const steps = 30 + Math.floor(rnd() * 40), step = (Math.max(cw, ch) * (0.5 + rnd() * 0.7)) / steps, p = [x, y];
          // A slowly turning walk (turn rate itself drifts), so veins meander instead of looking like hair.
          let turn = 0;
          for (let k = 0; k < steps; k++) { turn = turn * 0.8 + (rnd() - 0.5) * 0.12; a += turn; a += (angle - a) * 0.04; x += Math.cos(a) * step; y += Math.sin(a) * step; p.push(x, y); }
          const wv = width * (0.5 + rnd());
          out.push({ t: 'stroke', p, w: wv * 10, c, a: opacity * 0.06, h: 0.5 }, { t: 'stroke', p, w: wv * 3, c, a: opacity * 0.2, h: 0.5 }, { t: 'stroke', p, w: wv, c, a: opacity * 0.55, h: 0.5 }, { t: 'stroke', p, w: wv * 0.35, c, a: opacity * 0.9, h: 0.5 });
        }
      }
      return out;
    },
  },
  plain: {
    period: (s) => [s.size ?? 0.5, s.size ?? 0.5],
    background: (s) => s.base, groutH: 0.5,
    shapes: () => [],
  },
  rug: {
    period: (s) => [s.w, s.h],
    background: (s) => s.field, groutH: 0.9,
    shapes(s) {
      const out = [], { w, h } = s;
      let o = 0;
      // Borders: nested frames drawn outside-in.
      for (const [c, bw] of s.borders ?? []) { out.push({ t: 'poly', p: rect(o, o, w - 2 * o, h - 2 * o), c, h: 1 }); o += bw; }
      out.push({ t: 'poly', p: rect(o, o, w - 2 * o, h - 2 * o), c: s.field, h: 1 });
      if (s.motif) {
        const [c, sp, size] = s.motif;
        for (let y = o + sp / 2; y < h - o - sp / 4; y += sp) for (let x = o + sp / 2; x < w - o - sp / 4; x += sp) out.push({ t: 'poly', p: [x, y - size / 2, x + size / 2, y, x, y + size / 2, x - size / 2, y], c, h: 1 });
      }
      if (s.medallion) {
        const [c, size, c2 = s.field] = s.medallion, cx = w / 2, cy = h / 2;
        out.push({ t: 'poly', p: [cx, cy - size * 0.75, cx + size / 2, cy, cx, cy + size * 0.75, cx - size / 2, cy], c, h: 1 });
        out.push({ t: 'circle', x: cx, y: cy, r: size * 0.22, c: c2, h: 1 });
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) out.push({ t: 'poly', p: sector(o + dx * (w - 2 * o), o + dy * (h - 2 * o), size * 0.45, dx, dy), c, h: 1 });
      }
      return out;
    },
  },
  kilim: {
    period: (s) => [s.w, s.bands.reduce((a, b) => a + b[1], 0)],
    background: (s) => s.bands[0][2], groutH: 0.9,
    shapes(s, nx, ny) {
      const out = [], [pw, ph] = this.period(s), cw = pw * nx;
      for (let r = 0; r < ny; r++) {
        let y = r * ph;
        for (const [type, bh, c, c2 = c, mw = bh] of s.bands) {
          out.push({ t: 'poly', p: rect(0, y, cw, bh), c, h: 1 });
          const count = Math.max(1, Math.round(pw / mw)), m = pw / count;
          for (let i = 0; i < count * nx; i++) {
            const x = i * m;
            if (type === 'z') out.push({ t: 'poly', p: [x, y + bh * 0.85, x + m / 2, y + bh * 0.15, x + m, y + bh * 0.85], c: c2, h: 1 });
            else if (type === 'd') out.push({ t: 'poly', p: [x + m / 2, y + bh * 0.1, x + m * 0.9, y + bh / 2, x + m / 2, y + bh * 0.9, x + m * 0.1, y + bh / 2], c: c2, h: 1 });
          }
          y += bh;
        }
      }
      return out;
    },
  },
};

/** A quarter disc at a corner (dx, dy ∈ {0,1}: which corner) pointing into the tile. */
function sector(x, y, r, dx, dy) {
  const p = [x, y], a0 = dx ? (dy ? Math.PI : Math.PI / 2) : (dy ? -Math.PI / 2 : 0);
  for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  return p;
}

// ───────────────────────── validation, layout, shapes

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const REQUIRED = {
  grid: ['w'], brick: ['w', 'h'], herringbone: ['w', 'h'], chevron: ['w', 'h'], basketweave: ['w'], hexagon: ['size'], penny: ['d'], fishscale: ['r'],
  diamond: ['w', 'h'], encaustic: ['w'], terrazzo: [], stripes: [], dots: ['spacing', 'r'], damask: ['w', 'h'], botanical: [], marble: [], plain: [], rug: ['w', 'h'], kilim: ['w'],
};

/** Problems with a pattern spec ([] = usable). Pure. */
export function validatePattern(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['pattern is not an object'];
  if (!KINDS[spec.kind]) return [`unknown kind ${spec.kind}`];
  for (const key of REQUIRED[spec.kind]) if (!num(spec[key]) || spec[key] <= 0) errors.push(`${key} must be a positive number`);
  for (const key of ['w', 'h', 'size', 'd', 'r', 'spacing', 'leaf', 'groutWidth', 'variation', 'grain', 'cloud', 'cloudScale', 'bump', 'density', 'angle', 'n', 'fibres'])
    if (key in spec && (!num(spec[key]) || spec[key] < 0)) errors.push(`${key} must be a number ≥ 0`);
  for (const key of ['variation', 'grain', 'cloud']) if (num(spec[key]) && spec[key] > 1) errors.push(`${key} must be ≤ 1`);
  const colours = [...(spec.colors ?? []), spec.grout, spec.base, spec.ink, spec.field].filter((c) => c !== undefined);
  for (const c of colours) if (typeof c !== 'string' || !HEX.test(c)) errors.push(`bad colour ${c}`);
  if (spec.colors !== undefined && (!Array.isArray(spec.colors) || !spec.colors.length)) errors.push('colors must be a non-empty array');
  if (['terrazzo', 'dots', 'damask', 'botanical', 'marble', 'plain'].includes(spec.kind) && !HEX.test(spec.base ?? '')) errors.push('base colour required');
  if (spec.kind === 'damask' && !HEX.test(spec.ink ?? '')) errors.push('ink colour required');
  if (spec.kind === 'rug' && !HEX.test(spec.field ?? '')) errors.push('field colour required');
  if (spec.kind === 'herringbone' && num(spec.w) && num(spec.h) && Math.abs(spec.w / spec.h - Math.round(spec.w / spec.h)) > 1e-6) errors.push('herringbone length must be a whole multiple of the width');
  if (spec.kind === 'encaustic' && spec.motif && !ENCAUSTIC_MOTIFS.includes(spec.motif)) errors.push(`unknown motif ${spec.motif}`);
  if (spec.kind === 'stripes' && (!Array.isArray(spec.widths) || !spec.widths.length || !spec.widths.every((v) => num(v) && v > 0))) errors.push('stripes need widths');
  if (spec.kind === 'brick' && spec.offset !== undefined && spec.offset !== 'random' && !(num(spec.offset) && spec.offset >= 0 && spec.offset < 1)) errors.push('offset must be 0..1 or "random"');
  if (spec.kind === 'kilim' && (!Array.isArray(spec.bands) || !spec.bands.length || !spec.bands.every((b) => ['s', 'z', 'd'].includes(b[0]) && num(b[1]) && b[1] > 0 && HEX.test(b[2]) && (b[3] === undefined || HEX.test(b[3]))))) errors.push('kilim bands invalid');
  if (spec.kind === 'terrazzo' && !(spec.chips ?? []).every((c) => HEX.test(c[0]) && num(c[1]) && num(c[2]) && c[2] >= c[1] && c[1] > 0 && num(c[3]))) errors.push('terrazzo chips invalid');
  if (spec.kind === 'marble' && !(spec.veins ?? []).every((v) => HEX.test(v[0]) && num(v[1]) && v[1] > 0 && Number.isInteger(v[2]))) errors.push('marble veins invalid');
  if (spec.kind === 'rug' && !(spec.borders ?? []).every((b) => HEX.test(b[0]) && num(b[1]) && b[1] > 0)) errors.push('rug borders invalid');
  for (const sp of spec.speckle ?? []) if (!HEX.test(sp[0]) || !num(sp[1]) || sp[1] < 0 || sp[1] > 1 || !num(sp[2]) || sp[2] <= 0) errors.push('speckle invalid');
  if (spec.streak !== undefined && !['x', 'y'].includes(spec.streak)) errors.push('streak must be x or y');
  if (errors.length) return errors;
  const g = spec.groutWidth ?? 0;
  const [px, py] = KINDS[spec.kind].period(spec);
  if (!(px > 0 && py > 0)) errors.push('empty period');
  if (TILING_KINDS.includes(spec.kind) && g * 2 >= Math.min(spec.w ?? spec.size, spec.h ?? spec.size ?? spec.w)) errors.push('grout wider than the tiles');
  const layout = patternLayout(spec);
  if (!(layout.px[0] >= 8 && layout.px[1] >= 8 && layout.px[0] <= MAX_SIDE && layout.px[1] <= MAX_SIDE)) errors.push(`canvas size ${layout.px.join('×')} out of range`);
  return errors;
}

/**
 * Canvas layout: how many periods one texture repeat holds (enough for tile-to-tile variety and at least
 * ~0.5 m, so repeats are not obvious) and the pixel density (grout ≥ ~2 px where the size cap allows).
 */
export function patternLayout(spec) {
  const def = KINDS[spec.kind];
  const [px, py] = def.period(spec);
  const minCover = spec.cover ?? 0.6;
  let nx = Math.max(1, Math.ceil(minCover / px - 1e-9)), ny = Math.max(1, Math.ceil(minCover / py - 1e-9));
  const g = spec.groutWidth ?? 0;
  let ppm = Math.min(2048, Math.max(512, g > 0 ? 2.2 / g : 512));
  // Shrink the repeat count first (down to one period), then the density, to stay within the canvas cap.
  while (Math.max(nx * px, ny * py) * ppm > MAX_SIDE && (nx > 1 || ny > 1)) { if (nx * px >= ny * py && nx > 1) nx--; else if (ny > 1) ny--; else nx--; }
  // A chequer needs an even count of tiles per repeat, or two equal tiles meet at the seam.
  if (spec.checker && spec.kind === 'grid') { nx += nx % 2; ny += ny % 2; }
  ppm = Math.min(ppm, MAX_SIDE / Math.max(nx * px, ny * py));
  const cover = [nx * px, ny * py];
  return { period: [px, py], n: [nx, ny], cover, px: [Math.max(1, Math.round(cover[0] * ppm)), Math.max(1, Math.round(cover[1] * ppm))], ppm };
}

/** The shapes of one cover (metres). Pure and deterministic for a spec. */
export function patternShapes(spec, layout = patternLayout(spec)) {
  return KINDS[spec.kind].shapes(spec, layout.n[0], layout.n[1], random(spec.seed ?? 1));
}

export const patternKey = (spec) => JSON.stringify(spec);

// ───────────────────────── rendering (needs a 2D canvas)

const defaultCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
};

function bbox(s) {
  if (s.t === 'circle') return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
  if (s.t === 'ellipse') { const r = Math.max(s.rx, s.ry); return [s.x - r, s.y - r, s.x + r, s.y + r]; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.p.length; i += 2) { x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]); }
  const m = s.t === 'stroke' ? s.w * 2 : 0;
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

function drawShape(ctx, s, k, ox, oy, colour, grout, g) {
  ctx.globalAlpha = s.a ?? 1;
  ctx.beginPath();
  if (s.t === 'poly') {
    const p = s.inset && g > 0 ? insetPolygon(s.p, g / 2) : s.p;
    ctx.moveTo((p[0] + ox) * k, (p[1] + oy) * k);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo((p[i] + ox) * k, (p[i + 1] + oy) * k);
    ctx.closePath();
    ctx.fillStyle = colour; ctx.fill();
  } else if (s.t === 'circle' || s.t === 'ellipse') {
    if (s.t === 'circle') ctx.arc((s.x + ox) * k, (s.y + oy) * k, Math.max(0, s.r - (s.ring ? 0 : 0)) * k, 0, Math.PI * 2);
    else ctx.ellipse((s.x + ox) * k, (s.y + oy) * k, s.rx * k, s.ry * k, s.a ?? 0, 0, Math.PI * 2);
    ctx.fillStyle = colour; ctx.fill();
    if (s.ring && g > 0) { ctx.lineWidth = g * k; ctx.strokeStyle = grout; ctx.stroke(); }
  } else if (s.t === 'stroke') {
    ctx.moveTo((s.p[0] + ox) * k, (s.p[1] + oy) * k);
    for (let i = 2; i < s.p.length; i += 2) ctx.lineTo((s.p[i] + ox) * k, (s.p[i + 1] + oy) * k);
    ctx.lineWidth = Math.max(0.6, s.w * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = colour; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const grey = (h) => { const v = Math.round(Math.max(0, Math.min(1, h)) * 255); return `rgb(${v},${v},${v})`; };

/** Wrapped value noise in 0..1 on a cells × cells grid (smooth). */
function valueNoise(rnd, cells) {
  const g = new Float32Array(cells * cells).map(() => rnd());
  return (u, v) => {
    const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Draws a pattern: { map, bump, layout } (canvases), or null where no 2D canvas exists (Node). */
export function renderPattern(spec, makeCanvas = defaultCanvas) {
  const layout = patternLayout(spec);
  const [W, H] = layout.px;
  const map = makeCanvas(W, H), bump = makeCanvas(W, H);
  const ctx = map?.getContext?.('2d'), btx = bump?.getContext?.('2d');
  if (!ctx || !btx) return null;
  const def = KINDS[spec.kind];
  // Joints of big slabs would fall below a pixel and shimmer: they are drawn at least ~1.2 px wide.
  const k = layout.ppm, [cx, cy] = layout.cover, g = spec.groutWidth > 0 ? Math.max(spec.groutWidth, 1.2 / k) : 0;
  const grout = spec.grout ?? '#bdb8ae';
  ctx.fillStyle = def.background?.(spec) ?? grout; ctx.fillRect(0, 0, W, H);
  btx.fillStyle = grey(def.groutH ?? 0); btx.fillRect(0, 0, W, H);
  // The canvas size is rounded to whole pixels: stretch the drawing by that fraction so the cover meets
  // the canvas edges exactly (no seam line where the texture repeats).
  for (const c of [ctx, btx]) c.setTransform(W / (cx * k), 0, 0, H / (cy * k), 0, 0);
  const shapes = patternShapes(spec, layout);
  // Every shape is drawn at the 3 × 3 offsets that touch the canvas, so the texture wraps seamlessly.
  const copies = [];
  for (const s of shapes) {
    const [x0, y0, x1, y1] = bbox(s);
    for (const oy of [-cy, 0, cy]) for (const ox of [-cx, 0, cx]) if (x1 + ox > 0 && x0 + ox < cx && y1 + oy > 0 && y0 + oy < cy) copies.push([s, ox, oy]);
  }
  if (def.ordered) copies.sort((a, b) => (a[0].y + a[2]) - (b[0].y + b[2]));
  for (const [s, ox, oy] of copies) {
    drawShape(ctx, s, k, ox, oy, s.c, grout, g);
    drawShape(btx, s, k, ox, oy, grey(s.h ?? 1), grey(def.groutH ?? 0), g);
  }
  // Pixel pass: grain (optionally streaked), clouds, speckles — all wrapped.
  const grain = spec.grain ?? 0, cloud = spec.cloud ?? 0, speckle = spec.speckle ?? [];
  if (grain || cloud || speckle.length) {
    const img = ctx.getImageData(0, 0, W, H), bimg = btx.getImageData(0, 0, W, H), d = img.data, bd = bimg.data;
    const rnd = random((spec.seed ?? 1) + 7);
    const cs = spec.cloudScale ?? 0.25;
    // Four octaves of value noise (fBm): one octave alone shows its square grid.
    const base = Math.max(2, Math.round(cx / cs)), octaves = [[1, 0.5], [2, 0.26], [4, 0.15], [8, 0.09]].map(([m, wt]) => [valueNoise(rnd, base * m), wt]);
    const lines = spec.streak === 'x' ? Float32Array.from({ length: H }, rnd) : spec.streak === 'y' ? Float32Array.from({ length: W }, rnd) : null;
    const flecks = speckle.map(([c, density, size]) => ({ rgb: rgb(c), density, nx: Math.max(1, Math.round(W / (size * k))), ny: Math.max(1, Math.round(H / (size * k))), salt: Math.floor(rnd() * 1e9) }));
    const hash = (a, b, salt) => { let h = (a * 374761393 + b * 668265263 + salt) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let f = 1, hb = 0;
      if (grain) {
        let n = rnd();
        if (lines) n = (spec.streak === 'x' ? lines[y] : lines[x]) * 0.65 + n * 0.35;
        f += (n - 0.5) * grain; hb += (n - 0.5) * grain * 60;
      }
      if (cloud) { let n = 0; for (const [fn, wt] of octaves) n += fn(x / W, y / H) * wt; f += (n - 0.5) * cloud; hb += (n - 0.5) * cloud * 40; }
      let r = d[i] * f, gg = d[i + 1] * f, b = d[i + 2] * f;
      for (const fl of flecks) {
        if (hash(Math.floor((x * fl.nx) / W), Math.floor((y * fl.ny) / H), fl.salt) < fl.density) { r = fl.rgb[0]; gg = fl.rgb[1]; b = fl.rgb[2]; hb += 12; break; }
      }
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
      const bv = bd[i] + hb; bd[i] = bd[i + 1] = bd[i + 2] = bv;
    }
    ctx.putImageData(img, 0, 0); btx.putImageData(bimg, 0, 0);
  }
  return { map, bump, layout };
}
