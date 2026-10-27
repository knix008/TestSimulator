// Canvas 2D drawing of a block diagram: 5×5 grid, rulers, blocks (shapes and
// icon glyphs), orthogonal lines with branch points, selection, and the
// geometry used for hit testing. Model coordinates: x right, y down.
import { portGeometry, portsOf } from '../../core/sim/model.js';
import { iconOf, blockDef } from '../../core/sim/blocks/index.js';

export const RULER = 22;
export const GRID_BASE = 5;
export const GRID_MIN_PX = 10;
export const GRID_MAX_PX = 50;

/** Grid spacing: base × 5^k with a minor cell 10–50 px on screen (major line every 5 minor). */
export function gridStepFor(size, zoom) {
  let step = size > 0 ? size : 10;
  for (let i = 0; i < 60 && step * zoom < GRID_MIN_PX; i++) step *= 5;
  for (let i = 0; i < 60 && step * zoom >= GRID_MAX_PX; i++) step /= 5;
  return step;
}
/** A "nice" spacing (1, 2 or 5 × 10^n) at least `min` long. */
export function niceStep(min) {
  const power = 10 ** Math.floor(Math.log10(Math.max(min, 1e-9)));
  for (const f of [1, 2, 5, 10]) if (f * power >= min) return f * power;
  return 10 * power;
}

export const toScreen = (v, x, y) => ({ x: x * v.zoom + v.px, y: y * v.zoom + v.py });
export const toModel = (v, sx, sy) => ({ x: (sx - v.px) / v.zoom, y: (sy - v.py) / v.zoom });

/** Theme colours read from the CSS variables of `el`. */
export function themeColors(el) {
  const cs = getComputedStyle(el);
  const g = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
  const bg = g('--bg', '#12161c');
  const fg = g('--fg', '#e4e9f0');
  return {
    bg, fg, canvas: g('--sim-canvas', bg), muted: g('--fg-muted', '#97a3b4'), border: g('--border', '#2a3441'), strong: g('--border-strong', '#3b4859'),
    accent: g('--accent', '#4cc9f0'), panel: g('--bg-panel', '#161b23'), elev: g('--bg-elev', '#1a2029'), danger: g('--danger', '#ff6b6b'), ok: g('--ok', '#4ade80'),
    block: g('--sim-block', g('--bg-elev', '#1a2029')), grid: g('--sim-grid', mix(fg, bg, 0.07)), gridMajor: g('--sim-grid-major', mix(fg, bg, 0.24)),
    ruler: g('--bg-panel', '#161b23'), rulerText: g('--fg-muted', '#97a3b4'),
  };
}
function mix(a, b, t) {
  const pa = parseColor(a), pb = parseColor(b);
  if (!pa || !pb) return a;
  const c = pa.map((x, i) => Math.round(pb[i] + (x - pb[i]) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function parseColor(c) {
  c = String(c).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((x) => parseFloat(x));
  return null;
}

export const RATE_COLORS = ['#e04848', '#2fb344', '#3b82f6', '#e0a800', '#14b8a6', '#a855f7', '#f97316'];
export function rateColor(rate, colors) {
  if (rate == null) return null;
  if (rate === 0) return colors.fg;
  if (rate === 'const') return '#d946ef';
  if (rate === 'trig') return '#06b6d4';
  if (typeof rate === 'number') return RATE_COLORS[(rate - 1) % RATE_COLORS.length];
  return null;
}

// ---------------------------------------------------------------- grid and rulers

export function drawGrid(ctx, v, colors) {
  const step = gridStepFor(GRID_BASE, v.zoom);
  const major = step * 5;
  const a = toModel(v, 0, 0), b = toModel(v, v.width, v.height);
  const lines = (spacing, color, width) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = Math.ceil(a.x / spacing); i * spacing <= b.x; i++) {
      if (color === colors.grid && i % 5 === 0) continue;
      const sx = Math.round(i * spacing * v.zoom + v.px) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, v.height);
    }
    for (let i = Math.ceil(a.y / spacing); i * spacing <= b.y; i++) {
      if (color === colors.grid && i % 5 === 0) continue;
      const sy = Math.round(i * spacing * v.zoom + v.py) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(v.width, sy);
    }
    ctx.stroke();
  };
  lines(step, colors.grid, 1);
  lines(major, colors.gridMajor, 1);
  return step;
}

const tickLabel = (x) => { const r = Math.round(x * 1e6) / 1e6; return Object.is(r, -0) ? '0' : String(r); };

/** Rulers along the top and left edges with major/minor ticks, labels and the cursor marker. */
export function drawRulers(ctx, v, colors, cursor) {
  const major = niceStep(70 / v.zoom);
  const minor = major / (String(major).startsWith('2') ? 4 : 5);
  const a = toModel(v, 0, 0), b = toModel(v, v.width, v.height);
  ctx.save();
  ctx.fillStyle = colors.ruler;
  ctx.fillRect(0, 0, v.width, RULER);
  ctx.fillRect(0, 0, RULER, v.height);
  ctx.strokeStyle = colors.strong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5); ctx.lineTo(v.width, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0); ctx.lineTo(RULER + 0.5, v.height);
  ctx.stroke();
  ctx.strokeStyle = colors.rulerText;
  ctx.fillStyle = colors.rulerText;
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let k = Math.floor(a.x / minor); k * minor <= b.x; k++) {
    const x = k * minor;
    const sx = Math.round(x * v.zoom + v.px) + 0.5;
    if (sx < RULER) continue;
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    const half = !isMajor && Math.abs((x * 2) / major - Math.round((x * 2) / major)) < 1e-6;
    ctx.moveTo(sx, RULER); ctx.lineTo(sx, RULER - (isMajor ? 12 : half ? 7 : 4));
    if (isMajor) ctx.fillText(tickLabel(x), sx + 3, 2);
  }
  for (let k = Math.floor(a.y / minor); k * minor <= b.y; k++) {
    const y = k * minor;
    const sy = Math.round(y * v.zoom + v.py) + 0.5;
    if (sy < RULER) continue;
    const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    const half = !isMajor && Math.abs((y * 2) / major - Math.round((y * 2) / major)) < 1e-6;
    ctx.moveTo(RULER, sy); ctx.lineTo(RULER - (isMajor ? 12 : half ? 7 : 4), sy);
    if (isMajor) { ctx.save(); ctx.translate(2, sy - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(tickLabel(y), 0, 0); ctx.restore(); }
  }
  ctx.stroke();
  if (cursor) {
    const s = toScreen(v, cursor.x, cursor.y);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(s.x, RULER); ctx.lineTo(s.x - 5, RULER - 7); ctx.lineTo(s.x + 5, RULER - 7); ctx.closePath();
    ctx.moveTo(RULER, s.y); ctx.lineTo(RULER - 7, s.y - 5); ctx.lineTo(RULER - 7, s.y + 5); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(Math.round(s.x) + 0.5, 0); ctx.lineTo(Math.round(s.x) + 0.5, RULER);
    ctx.moveTo(0, Math.round(s.y) + 0.5); ctx.lineTo(RULER, Math.round(s.y) + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = colors.ruler;
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.strokeStyle = colors.strong;
  ctx.strokeRect(0.5, 0.5, RULER, RULER);
  ctx.restore();
  return { major, minor };
}

// ---------------------------------------------------------------- line routing

const DV = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const horiz = (d) => d === 'left' || d === 'right';
const STUB = 10;

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(b[0] - c[0]) < 1e-9) || (Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(b[1] - c[1]) < 1e-9)) out.splice(i, 1);
  }
  return out;
}

/** Orthogonal route from port a (outward dir adir) to port b (outward dir bdir); boxes = [srcBox, dstBox] for detours. */
export function routeOrtho(a, adir, b, bdir, boxes = []) {
  const av = DV[adir] || [1, 0], bv = DV[bdir] || [-1, 0];
  const a1 = [a.x + av[0] * STUB, a.y + av[1] * STUB];
  const b1 = [b.x + bv[0] * STUB, b.y + bv[1] * STUB];
  let mid;
  const below = () => Math.max(a.y, b.y, ...boxes.filter(Boolean).map((r) => r.y + r.h)) + 28;
  const right = () => Math.max(a.x, b.x, ...boxes.filter(Boolean).map((r) => r.x + r.w)) + 18;
  if (horiz(adir) && horiz(bdir)) {
    const forward = (adir === 'right' && bdir === 'left' && b1[0] >= a1[0]) || (adir === 'left' && bdir === 'right' && b1[0] <= a1[0]);
    if (forward) { const mx = (a1[0] + b1[0]) / 2; mid = [[mx, a1[1]], [mx, b1[1]]]; }
    else if (adir === bdir) { const x = adir === 'right' ? Math.max(a1[0], b1[0]) : Math.min(a1[0], b1[0]); mid = [[x, a1[1]], [x, b1[1]]]; }
    else { const my = below(); mid = [[a1[0], my], [b1[0], my]]; }
  } else if (!horiz(adir) && !horiz(bdir)) {
    const forward = (adir === 'bottom' && bdir === 'top' && b1[1] >= a1[1]) || (adir === 'top' && bdir === 'bottom' && b1[1] <= a1[1]);
    if (forward) { const my = (a1[1] + b1[1]) / 2; mid = [[a1[0], my], [b1[0], my]]; }
    else if (adir === bdir) { const y = adir === 'bottom' ? Math.max(a1[1], b1[1]) : Math.min(a1[1], b1[1]); mid = [[a1[0], y], [b1[0], y]]; }
    else { const mx = right(); mid = [[mx, a1[1]], [mx, b1[1]]]; }
  } else if (horiz(adir)) mid = [[b1[0], a1[1]]];
  else mid = [[a1[0], b1[1]]];
  return simplify([[a.x, a.y], a1, ...mid, b1, [b.x, b.y]]);
}

/** Route from a free point (a branch point) to port b. */
export function routeFromPoint(p, b, bdir, boxes = []) {
  const bx = boxes.filter(Boolean);
  const bv = DV[bdir] || [-1, 0];
  const b1 = [b.x + bv[0] * STUB, b.y + bv[1] * STUB];
  if (horiz(bdir)) {
    const ok = bdir === 'left' ? p[0] <= b1[0] : p[0] >= b1[0];
    if (ok) return simplify([p, [p[0], b.y], [b.x, b.y]]);
    // backwards: detour below the destination block
    const below = Math.max(p[1], b.y, ...bx.map((r) => r.y + r.h)) + 28;
    return simplify([p, [p[0], below], [b1[0], below], b1, [b.x, b.y]]);
  }
  const ok = bdir === 'top' ? p[1] <= b1[1] : p[1] >= b1[1];
  if (ok) return simplify([p, [b.x, p[1]], [b.x, b.y]]);
  const right = Math.max(p[0], b.x, ...bx.map((r) => r.x + r.w)) + 18;
  return simplify([p, [right, p[1]], [right, b1[1]], b1, [b.x, b.y]]);
}

/** Polyline through explicit points, inserting elbows so that every segment is horizontal or vertical. */
export function orthoThrough(pts, firstHoriz = true) {
  const out = [pts[0]];
  let h = firstHoriz;
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1], q = pts[i];
    if (Math.abs(p[0] - q[0]) > 1e-9 && Math.abs(p[1] - q[1]) > 1e-9) out.push(h ? [q[0], p[1]] : [p[0], q[1]]);
    out.push(q);
    const last = out[out.length - 2];
    h = !(Math.abs(last[1] - q[1]) < 1e-9);
  }
  return simplify(out);
}

/**
 * Geometry of every line of the system: [{ line, seg, pts:[[x,y]...], branchPoint?, dst }].
 * `byId` maps block id → block.
 */
export function lineGeometry(sys, byId, override = null) {
  const out = [];
  const geo = new Map();
  const g = (b) => { let r = geo.get(b.id); if (!r) { r = portGeometry(b); geo.set(b.id, r); } return r; };
  for (const line of sys.lines) {
    const sb = byId.get(line.src.block);
    if (!sb) continue;
    const sp = g(sb).out.find((p) => p.port === line.src.port);
    if (!sp) continue;
    const rec = (seg, start, startDir, depth) => {
      let pts;
      let dstBlock = null;
      if (seg.dst) {
        dstBlock = byId.get(seg.dst.block);
        const dg = dstBlock ? g(dstBlock) : null;
        const dp = dg ? (typeof seg.dst.port === 'string' ? dg.special : dg.in).find((p) => p.port === seg.dst.port) : null;
        if (!dp) return;
        if (seg.points && seg.points.length) pts = orthoThrough([start, ...seg.points, [dp.x, dp.y]], startDir ? horiz(startDir) : false);
        else if (startDir) pts = routeOrtho({ x: start[0], y: start[1] }, startDir, dp, dp.dir, [sb, dstBlock]);
        else pts = routeFromPoint(start, dp, dp.dir, [sb, dstBlock]);
      } else {
        pts = seg.points && seg.points.length ? orthoThrough([start, ...seg.points], startDir ? horiz(startDir) : false) : [start];
      }
      const item = { line, seg, pts, dst: seg.dst, depth };
      out.push(item);
      if (seg.branches && seg.branches.length) {
        const bp = pts[pts.length - 1];
        item.branchPoint = bp;
        for (const br of seg.branches) rec(br, bp, null, depth + 1);
      }
    };
    rec(line, [sp.x, sp.y], sp.dir, 0);
  }
  if (override) out.push(...override);
  return out;
}

export function distToPolyline(pts, x, y) {
  let best = Infinity, at = null, idx = -1;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; at = [px, py]; idx = i; }
  }
  return { d: best, at, idx };
}

// ---------------------------------------------------------------- blocks

const GLYPHS = {
  sine: (k) => k.curve((t) => 0.5 - 0.35 * Math.sin(t * 2 * Math.PI)),
  step: (k) => k.poly([[0.1, 0.75], [0.45, 0.75], [0.45, 0.25], [0.9, 0.25]]),
  ramp: (k) => k.poly([[0.1, 0.8], [0.35, 0.8], [0.9, 0.2]]),
  pulse: (k) => k.poly([[0.1, 0.75], [0.25, 0.75], [0.25, 0.3], [0.45, 0.3], [0.45, 0.75], [0.6, 0.75], [0.6, 0.3], [0.8, 0.3], [0.8, 0.75], [0.9, 0.75]]),
  sawtooth: (k) => k.poly([[0.1, 0.75], [0.37, 0.25], [0.37, 0.75], [0.63, 0.25], [0.63, 0.75], [0.9, 0.25]]),
  chirp: (k) => k.curve((t) => 0.5 - 0.32 * Math.sin(t * t * 9 * Math.PI)),
  noise: (k) => k.poly(Array.from({ length: 13 }, (_, i) => [0.1 + i * 0.8 / 12, 0.5 + 0.3 * Math.sin(i * 12.9898 + 4) * Math.cos(i * 7.3)])),
  random: (k) => k.poly(Array.from({ length: 9 }, (_, i) => [0.1 + i * 0.1, 0.5 + 0.3 * Math.sin(i * 91.7)])),
  clock: (k) => { k.circle(0.5, 0.5, 0.3); k.poly([[0.5, 0.3], [0.5, 0.5], [0.65, 0.58]]); },
  scope: (k) => { k.rect(0.15, 0.2, 0.7, 0.5); k.curve((t) => 0.45 - 0.15 * Math.sin(t * 4 * Math.PI), 0.2, 0.8); k.rect(0.35, 0.75, 0.3, 0.06); },
  xy: (k) => { k.poly([[0.15, 0.15], [0.15, 0.85], [0.85, 0.85]]); k.curve((t) => 0.5, 0.2, 0.8); k.circle(0.5, 0.5, 0.2); },
  saturation: (k) => { k.axes(); k.poly([[0.12, 0.75], [0.35, 0.75], [0.65, 0.25], [0.88, 0.25]]); },
  deadzone: (k) => { k.axes(); k.poly([[0.12, 0.85], [0.35, 0.5], [0.65, 0.5], [0.88, 0.15]]); },
  relay: (k) => { k.axes(); k.poly([[0.12, 0.75], [0.6, 0.75], [0.6, 0.25], [0.88, 0.25]]); k.poly([[0.4, 0.75], [0.4, 0.25], [0.6, 0.25]]); },
  quantizer: (k) => { k.axes(); k.poly([[0.15, 0.8], [0.3, 0.8], [0.3, 0.65], [0.45, 0.65], [0.45, 0.5], [0.6, 0.5], [0.6, 0.35], [0.75, 0.35], [0.75, 0.2], [0.88, 0.2]]); },
  backlash: (k) => { k.axes(); k.poly([[0.2, 0.8], [0.6, 0.3], [0.8, 0.3], [0.4, 0.8], [0.2, 0.8]]); },
  ratelimit: (k) => { k.axes(); k.poly([[0.15, 0.8], [0.5, 0.25], [0.85, 0.25]]); },
  lookup1: (k) => { k.axes(); k.poly([[0.15, 0.75], [0.35, 0.55], [0.55, 0.6], [0.85, 0.2]]); },
  lookup2: (k) => { k.rect(0.15, 0.2, 0.7, 0.6); k.poly([[0.15, 0.4], [0.85, 0.4]]); k.poly([[0.15, 0.6], [0.85, 0.6]]); k.poly([[0.38, 0.2], [0.38, 0.8]]); k.poly([[0.62, 0.2], [0.62, 0.8]]); },
  switch: (k) => { k.poly([[0.05, 0.25], [0.3, 0.25], [0.75, 0.5], [0.95, 0.5]]); k.dot(0.05, 0.75); k.poly([[0.05, 0.75], [0.3, 0.75]]); },
  manualswitch: (k, h) => { const up = (h.pos || 1) === 1; k.poly([[0.05, 0.25], [0.3, 0.25]]); k.poly([[0.05, 0.75], [0.3, 0.75]]); k.poly([[0.3, up ? 0.25 : 0.75], [0.75, 0.5], [0.95, 0.5]]); },
  ground: (k) => { k.poly([[0.05, 0.5], [0.45, 0.5]]); k.poly([[0.45, 0.2], [0.45, 0.8]]); k.poly([[0.6, 0.3], [0.6, 0.7]]); k.poly([[0.75, 0.4], [0.75, 0.6]]); },
  terminator: (k) => { k.poly([[0.05, 0.5], [0.5, 0.5]]); k.poly([[0.5, 0.2], [0.5, 0.8]]); k.poly([[0.62, 0.3], [0.62, 0.7]]); k.poly([[0.74, 0.4], [0.74, 0.6]]); },
  abs: (k) => { k.axes(); k.poly([[0.15, 0.2], [0.5, 0.8], [0.85, 0.2]]); },
  sign: (k) => { k.axes(); k.poly([[0.12, 0.75], [0.5, 0.75], [0.5, 0.25], [0.88, 0.25]]); },
  hitcross: (k) => { k.axes(); k.poly([[0.15, 0.8], [0.85, 0.2]]); k.circle(0.5, 0.5, 0.06); },
  friction: (k) => { k.axes(); k.poly([[0.12, 0.85], [0.5, 0.65], [0.5, 0.35], [0.88, 0.15]]); },
  wrap: (k) => { k.axes(); k.poly([[0.12, 0.85], [0.5, 0.2], [0.5, 0.85], [0.88, 0.2]]); },
  enable: (k) => k.poly([[0.15, 0.75], [0.35, 0.75], [0.35, 0.3], [0.65, 0.3], [0.65, 0.75], [0.85, 0.75]]),
  trigger: (k) => { k.poly([[0.15, 0.75], [0.5, 0.75], [0.5, 0.25], [0.85, 0.25]]); k.poly([[0.42, 0.55], [0.5, 0.42], [0.58, 0.55]]); },
};

function painter(ctx, x, y, w, h) {
  const pad = Math.min(w, h) * 0.08;
  const X = (u) => x + pad + u * (w - 2 * pad), Y = (v) => y + pad + v * (h - 2 * pad);
  return {
    poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); },
    curve(f, u0 = 0.1, u1 = 0.9) { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40; const u = u0 + (u1 - u0) * t; const yy = Y(f(t)); i ? ctx.lineTo(X(u), yy) : ctx.moveTo(X(u), yy); } ctx.stroke(); },
    circle(cx, cy, r) { ctx.beginPath(); ctx.ellipse(X(cx), Y(cy), r * (w - 2 * pad), r * (h - 2 * pad), 0, 0, Math.PI * 2); ctx.stroke(); },
    rect(a, b, c, d) { ctx.strokeRect(X(a), Y(b), c * (w - 2 * pad), d * (h - 2 * pad)); },
    dot(a, b) { ctx.beginPath(); ctx.arc(X(a), Y(b), 1.5, 0, Math.PI * 2); ctx.fill(); },
    axes() { ctx.save(); ctx.globalAlpha *= 0.45; this.poly([[0.5, 0.08], [0.5, 0.92]]); this.poly([[0.08, 0.5], [0.92, 0.5]]); ctx.restore(); },
  };
}

function fitText(ctx, text, maxW, size) {
  let s = size;
  ctx.font = `${s}px "Segoe UI", sans-serif`;
  const lines = String(text).split('\n');
  const wmax = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (s > 5 && wmax() > maxW) { s -= 1; ctx.font = `${s}px "Segoe UI", sans-serif`; }
  return { lines, size: s };
}
function drawTextBlock(ctx, text, cx, cy, maxW, size = 12) {
  const { lines, size: s } = fitText(ctx, text, maxW, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * s * 1.15));
}

function shapeOf(block, hint) {
  const d = blockDef(block.type);
  return (hint && hint.shape) || (d && d.shape) || 'rect';
}

/** Outward direction of the block's "forward" side (for triangle shapes). */
function forwardDir(block) {
  const g = portGeometry(block);
  if (g.out[0]) return g.out[0].dir;
  return block.flip ? 'left' : 'right';
}

function shapePath(ctx, block, shape) {
  const { x, y, w, h } = block;
  ctx.beginPath();
  if (shape === 'triangle') {
    const d = forwardDir(block);
    if (d === 'right') { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x, y + h); }
    else if (d === 'left') { ctx.moveTo(x + w, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(x + w, y + h); }
    else if (d === 'bottom') { ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x + w, y); }
    else { ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); }
    ctx.closePath();
  } else if (shape === 'circle') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'port') { const r = Math.min(w, h) / 2; ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  else if (shape === 'tag') {
    const d = forwardDir(block); const k = Math.min(w, h) * 0.35;
    if (d === 'left') { ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h / 2); }
    else { ctx.moveTo(x, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); }
    ctx.closePath();
  } else { const r = Math.min(4, w / 4, h / 4); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
}

function fmtNum(x) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(3);
  return String(Number(x.toPrecision(5)));
}

/**
 * Draws one block in model coordinates (the context is already transformed).
 * opts: { colors, selected, rate, values (Display), lang, hover }
 */
export function drawBlock(ctx, block, opts) {
  const { colors } = opts;
  const hint = iconOf(block);
  const shape = shapeOf(block, hint);
  const fg = (opts.rate != null && rateColor(opts.rate, colors)) || block.fg || colors.fg;
  const { x, y, w, h } = block;
  ctx.save();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = fg;
  shapePath(ctx, block, shape);
  if (shape === 'bar') { ctx.fillStyle = fg; ctx.fillRect(x, y, w, h); }
  else {
    ctx.fillStyle = block.bg || colors.block;
    ctx.fill();
    if (block.system && !block.mask) { ctx.save(); ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore(); } else ctx.stroke();
  }
  // icon
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1.2;
  const pc = portsOf(block);
  if (block.mask && block.mask.display) {
    drawTextBlock(ctx, block.mask.display, x + w / 2, y + h / 2, w - 6, 12);
  } else if (shape === 'port') {
    drawTextBlock(ctx, String(block.params.Port || hint.text || '1'), x + w / 2, y + h / 2, w - 4, 12);
  } else if (shape === 'bar') {
    // nothing inside
  } else if (hint.frac) {
    drawFrac(ctx, hint.frac[0], hint.frac[1], x + w / 2, y + h / 2, w - 8);
  } else if (hint.glyph === 'display') {
    const vals = opts.values;
    const txt = vals && vals.length ? vals.slice(0, Math.max(1, Math.floor(h / 14))).map(fmtNum).join('\n') : (hint.text || '0');
    ctx.save();
    ctx.fillStyle = colors.canvas;
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = fg;
    ctx.font = `12px ${'Consolas, monospace'}`;
    ctx.restore();
    ctx.fillStyle = fg;
    drawTextBlock(ctx, txt, x + w / 2, y + h / 2, w - 8, 12);
  } else if ((hint.glyph === 'sum' || hint.glyph === 'product') && hint.text != null) {
    const signs = String(hint.text).replace(/\|/g, '');
    const g = portGeometry(block);
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.in.forEach((p, i) => {
      const s = signs[i] || (hint.glyph === 'sum' ? '+' : '×');
      const k = shape === 'circle' ? 0.22 : 0.14;
      const dx = (p.dir === 'left' ? 1 : p.dir === 'right' ? -1 : 0) * Math.max(9, block.w * k), dy = (p.dir === 'top' ? 1 : p.dir === 'bottom' ? -1 : 0) * Math.max(9, block.h * k);
      ctx.fillText(s === '*' ? '×' : s === '/' ? '÷' : s, p.x + dx, p.y + dy);
    });
    if (shape !== 'circle' || hint.glyph === 'product') drawTextBlock(ctx, hint.glyph === 'sum' ? 'Σ' : (hint.symbol || 'Π'), x + w / 2, y + h / 2, w - 16, 16);
  } else if (hint.glyph && GLYPHS[hint.glyph]) {
    const inset = Math.min(w, h) * 0.1;
    GLYPHS[hint.glyph](painter(ctx, x + inset, y + inset, w - 2 * inset, h - 2 * inset), hint);
    if (hint.text) { ctx.font = '9px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(hint.text, x + w / 2, y + h - 1); }
  } else if (hint.glyph === 'subsystem' || block.system) {
    const g = portGeometry(block);
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    (pc.inLabels || []).forEach((t, i) => { const p = g.in[i]; if (p && p.dir === 'left') { ctx.textAlign = 'left'; ctx.fillText(t, p.x + 4, p.y); } else if (p && p.dir === 'right') { ctx.textAlign = 'right'; ctx.fillText(t, p.x - 4, p.y); } });
    (pc.outLabels || []).forEach((t, i) => { const p = g.out[i]; if (p && p.dir === 'right') { ctx.textAlign = 'right'; ctx.fillText(t, p.x - 4, p.y); } else if (p && p.dir === 'left') { ctx.textAlign = 'left'; ctx.fillText(t, p.x + 4, p.y); } });
    if (hint.text && !(pc.inLabels || []).length && !(pc.outLabels || []).length) drawTextBlock(ctx, hint.text, x + w / 2, y + h / 2, w - 8, 11);
  } else {
    const text = hint.text != null ? hint.text : (blockDef(block.type)?.label.en || block.type);
    const cy = shape === 'triangle' ? y + h / 2 : y + h / 2;
    const cx = shape === 'triangle' ? x + w * (forwardDir(block) === 'right' ? 0.38 : forwardDir(block) === 'left' ? 0.62 : 0.5) : x + w / 2;
    drawTextBlock(ctx, text, cx, cy, shape === 'triangle' ? w * 0.55 : w - 8, 12);
  }
  // ports
  drawPorts(ctx, block, fg);
  // name
  if (block.showName !== false && block.name) {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.fg;
    ctx.fillText(block.name, x + w / 2, y + h + 4);
  }
  if (opts.selected) {
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.setLineDash([]);
    ctx.fillStyle = colors.accent;
    const s = 6 / (opts.zoom || 1);
    for (const [hx, hy] of handlePoints(block)) ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
  }
  if (opts.error) { ctx.strokeStyle = colors.danger; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); }
  ctx.restore();
}

export const handlePoints = (b) => [[b.x - 3, b.y - 3], [b.x + b.w + 3, b.y - 3], [b.x - 3, b.y + b.h + 3], [b.x + b.w + 3, b.y + b.h + 3]];

function drawFrac(ctx, num, den, cx, cy, maxW) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let s = 12;
  ctx.font = `${s}px "Segoe UI", sans-serif`;
  const wid = () => Math.max(ctx.measureText(String(num)).width, ctx.measureText(String(den)).width);
  while (s > 6 && wid() > maxW) { s--; ctx.font = `${s}px "Segoe UI", sans-serif`; }
  const lw = Math.min(maxW, wid() + 4);
  ctx.fillText(String(num), cx, cy - s * 0.7);
  ctx.fillText(String(den), cx, cy + s * 0.75);
  ctx.beginPath(); ctx.moveTo(cx - lw / 2, cy); ctx.lineTo(cx + lw / 2, cy); ctx.stroke();
}

function chevron(ctx, x, y, dir, inward, size = 5) {
  // arrow pointing along the signal flow: into the block for inputs, out of it for outputs
  const v = DV[dir] || [1, 0];
  const s = inward ? -1 : 1;
  const tipx = x + v[0] * s * (inward ? 0 : size), tipy = y + v[1] * s * (inward ? 0 : size);
  const bx = tipx - v[0] * s * size, by = tipy - v[1] * s * size;
  const px = -v[1] * size * 0.6, py = v[0] * size * 0.6;
  ctx.beginPath();
  ctx.moveTo(bx + px, by + py); ctx.lineTo(tipx, tipy); ctx.lineTo(bx - px, by - py);
  ctx.stroke();
}

function drawPorts(ctx, block, color) {
  const g = portGeometry(block);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  for (const p of g.in) chevron(ctx, p.x - (DV[p.dir][0] * 6), p.y - (DV[p.dir][1] * 6), p.dir, true);
  for (const p of g.out) chevron(ctx, p.x, p.y, p.dir, false);
  ctx.fillStyle = color;
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of g.special) {
    chevron(ctx, p.x - DV[p.dir][0] * 6, p.y - DV[p.dir][1] * 6, p.dir, true);
    const glyph = { enable: 'enable', trigger: 'trigger' }[p.port];
    const v = DV[p.dir];
    if (glyph) {
      const k = painter(ctx, p.x - v[0] * 8 - 6 + v[0] * 0 - 2, p.y - v[1] * 8 + (p.dir === 'top' ? 2 : -12), 14, 10);
      GLYPHS[glyph](k);
    } else ctx.fillText('▾', p.x - v[0] * 10, p.y - v[1] * 10 + 1);
  }
  ctx.restore();
}

/** Lines: polylines with arrow heads, branch dots, labels. */
export function drawLines(ctx, items, opts) {
  const { colors } = opts;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const it of items) {
    const sel = opts.selected && opts.selected.has(it.line.id);
    const col = (opts.rates && rateColor(opts.rates.get(it.line.src.block), colors)) || colors.fg;
    ctx.strokeStyle = sel ? colors.accent : col;
    ctx.lineWidth = (sel ? 2 : 1.2) * (opts.wide && opts.wide.has(`${it.line.src.block}:${it.line.src.port}`) ? 1.8 : 1);
    if (it.temp) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    it.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    if (it.dst && it.pts.length >= 2) {
      const a = it.pts[it.pts.length - 2], b = it.pts[it.pts.length - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - 7 * Math.cos(ang - 0.4), b[1] - 7 * Math.sin(ang - 0.4));
      ctx.lineTo(b[0] - 7 * Math.cos(ang + 0.4), b[1] - 7 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    if (it.branchPoint) { ctx.beginPath(); ctx.arc(it.branchPoint[0], it.branchPoint[1], 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (it.depth === 0 && it.line.name) {
      const p = it.pts.length > 1 ? [(it.pts[0][0] + it.pts[1][0]) / 2, (it.pts[0][1] + it.pts[1][1]) / 2] : it.pts[0];
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = sel ? colors.accent : colors.fg;
      ctx.fillText(it.line.name, p[0], p[1] - 3);
    }
    if (it.depth === 0 && it.line.log) {
      const p = it.pts[0];
      ctx.beginPath(); ctx.arc(p[0] + 18, p[1] - 6, 3.5, 0, Math.PI * 2); ctx.fillStyle = colors.accent; ctx.fill();
    }
  }
  ctx.restore();
}

/** Small library preview of a block on its own canvas (size px). */
export function drawPreview(canvas, block, colors) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 44, H = canvas.clientHeight || 34;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const k = Math.min((W - 10) / block.w, (H - 6) / block.h, 1);
  const b = { ...block, showName: false, x: 0, y: 0 };
  ctx.translate((W - block.w * k) / 2, (H - block.h * k) / 2);
  ctx.scale(k, k);
  drawBlock(ctx, b, { colors, zoom: k });
}
