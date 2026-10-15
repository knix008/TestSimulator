// Canvas 2D rendering of a drawing: grid, entities (line types and weights),
// selection, grips, previews of the tool in use, snap markers, crosshair.
import { AUTO, dashScaleOf, isVisible, styleOf } from '../domain/drawing.js';
import { fromPlane, toPlane } from '../domain/workplane.js';
import { constraintGlyph } from '../domain/constraints.js';
import { DASHES, entityBox, firstBaseline, grips, LINE_GAP, primitives, textCorners } from '../domain/entities.js';
import { boxesOverlap, sweep } from '../domain/geometry.js';
import { drawingFontStack } from '../themes.js';
import { displayUnit, gridBaseFor, unitFactor, unitLabel } from '../domain/units.js';

/** Screen px per mm at 100 % zoom (a millimetre at true size on a 96 dpi screen). */
export const PX_PER_MM = 96 / 25.4;

/** Pan/zoom of a drawing on screen. zoom = screen px per mm (y up in the drawing, down on screen). */
export class Viewport {
  constructor({ cx = 0, cy = 0, zoom = PX_PER_MM, width = 800, height = 600 } = {}) {
    Object.assign(this, { cx, cy, zoom, width, height });
  }

  toScreen(p) {
    return { x: (p.x - this.cx) * this.zoom + this.width / 2, y: this.height / 2 - (p.y - this.cy) * this.zoom };
  }

  toWorld(x, y) {
    return { x: this.cx + (x - this.width / 2) / this.zoom, y: this.cy - (y - this.height / 2) / this.zoom };
  }

  /** The drawing area currently on screen. */
  worldBox() {
    const a = this.toWorld(0, this.height);
    const b = this.toWorld(this.width, 0);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }

  /** Zooms by `factor` keeping the drawing point under (sx, sy) in place. */
  zoomAt(factor, sx, sy, limits = { min: 0.01, max: 2000 }) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(limits.max, Math.max(limits.min, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  /** Shows `box` with `margin` px around it; `inset` px along the top and left are covered (rulers). */
  fit(box, margin = 40, inset = 0) {
    if (!box) {
      this.cx = 0; this.cy = 0; this.zoom = PX_PER_MM;
      return;
    }
    const w = Math.max(box.maxX - box.minX, 1e-6);
    const h = Math.max(box.maxY - box.minY, 1e-6);
    this.zoom = Math.max(0.01, Math.min(2000, Math.min((this.width - inset - margin * 2) / w, (this.height - inset - margin * 2) / h)));
    this.cx = (box.minX + box.maxX) / 2 - inset / 2 / this.zoom;
    this.cy = (box.minY + box.maxY) / 2 + inset / 2 / this.zoom;
  }

  /** Zoom as a percentage of true size. */
  get percent() {
    return (this.zoom / PX_PER_MM) * 100;
  }

  toJSON() {
    return { cx: this.cx, cy: this.cy, zoom: this.zoom };
  }
}

// Primitives and boxes are computed once per entity object (entities are
// replaced, never changed in place, when their geometry changes).
// Dimension texts depend on the display unit: a unit change starts a new cache.
let primCache = new WeakMap();
let primUnit = displayUnit();
const boxCache = new WeakMap();
export function cachedPrimitives(entity) {
  if (primUnit !== displayUnit()) { primUnit = displayUnit(); primCache = new WeakMap(); }
  let prims = primCache.get(entity);
  if (!prims) { prims = primitives(entity); primCache.set(entity, prims); }
  return prims;
}
export function cachedBox(entity) {
  let box = boxCache.get(entity);
  if (box === undefined) { box = entityBox(entity); boxCache.set(entity, box); }
  return box;
}

/** Screen line width (px) for a line weight in mm. */
export const weightPx = (mm, show = true) => (show ? Math.max(1, mm * 3.2) : 1);

function tracePrimitive(ctx, prim, vp) {
  switch (prim.kind) {
    case 'line': {
      const a = vp.toScreen(prim.a);
      const b = vp.toScreen(prim.b);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      break;
    }
    case 'poly': case 'fill': {
      prim.points.forEach((p, i) => {
        const s = vp.toScreen(p);
        if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
      });
      if (prim.closed || prim.kind === 'fill') ctx.closePath();
      // Holes of a filled region (drawn with the even-odd rule).
      for (const hole of prim.holes ?? []) {
        hole.forEach((p, i) => {
          const s = vp.toScreen(p);
          if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        });
        ctx.closePath();
      }
      break;
    }
    case 'circle': {
      // A broken radius (an imported file, a bad part) is skipped, not a failed redraw.
      if (!(prim.r > 0) || !Number.isFinite(prim.r)) break;
      const c = vp.toScreen(prim.c);
      ctx.moveTo(c.x + prim.r * vp.zoom, c.y);
      ctx.arc(c.x, c.y, prim.r * vp.zoom, 0, Math.PI * 2);
      break;
    }
    case 'arc': {
      if (!(prim.r > 0) || !Number.isFinite(prim.r)) break;
      const c = vp.toScreen(prim.c);
      const start = (-prim.start * Math.PI) / 180;
      const end = start - (sweep(prim.start, prim.end) * Math.PI) / 180;
      ctx.moveTo(c.x + prim.r * vp.zoom * Math.cos(start), c.y + prim.r * vp.zoom * Math.sin(start));
      ctx.arc(c.x, c.y, prim.r * vp.zoom, start, end, true);
      break;
    }
    default:
      break;
  }
}

function drawText(ctx, prim, vp, color, fonts) {
  const px = prim.size * vp.zoom;
  if (px < 2) return;
  const s = vp.toScreen(prim.p);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((-prim.angle * Math.PI) / 180);
  const family = prim.font ? drawingFontStack(prim.font) : fonts.stack;
  ctx.font = `${prim.italic ? 'italic' : fonts.style} ${prim.bold ? 700 : fonts.weight} ${px}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = prim.align === 'center' ? 'center' : prim.align === 'right' ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  const baseline = -firstBaseline(prim) * vp.zoom;
  String(prim.text).split('\n').forEach((line, i) => ctx.fillText(line, 0, baseline + i * px * LINE_GAP));
  ctx.restore();
}

/** Draws primitives with one style. */
export function drawPrimitives(ctx, prims, vp, { color, width, dash = [], fonts, alpha = 1, dashScale = 1 }) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  let currentDash = null;
  const setDash = (pattern) => {
    const px = pattern.map((d) => d * dashScale * vp.zoom);
    // Patterns that would be smaller than a few pixels are drawn solid.
    const scaled = px.length && px.reduce((a, b) => a + b, 0) > 4 ? px.map((d) => Math.max(0.8, d)) : [];
    const key = scaled.join(',');
    if (key !== currentDash) { ctx.setLineDash(scaled); currentDash = key; }
  };
  for (const prim of prims) {
    if (prim.kind === 'text') { drawText(ctx, prim, vp, color, fonts); continue; }
    ctx.lineWidth = prim.thin ? Math.min(width, 1) : width;
    setDash(prim.lineType ? DASHES[prim.lineType] ?? [] : dash);
    ctx.beginPath();
    tracePrimitive(ctx, prim, vp);
    if (prim.kind === 'fill') ctx.fill('evenodd'); else ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Minor grid spacing on screen stays between these (px), so the grid looks the same at every zoom. */
export const GRID_MIN_PX = 10;
export const GRID_MAX_PX = 50;

/**
 * Grid spacing for a zoom: the grid size times a power of 5, chosen so a minor
 * cell is 10–50 px on screen. Major lines every 5 minor ones, so every major
 * cell always shows 5 × 5 minor cells, zoomed in or out.
 */
export function gridStepFor(size, zoom) {
  let step = size > 0 ? size : 10;
  for (let i = 0; i < 60 && step * zoom < GRID_MIN_PX; i++) step *= 5;
  for (let i = 0; i < 60 && step * zoom >= GRID_MAX_PX; i++) step /= 5;
  return step;
}

/** Dash pattern of the cross-hair lines (px). */
export const CROSSHAIR_DASH = [6, 4];

/** A tinted, outlined box around each text primitive (selection / hover highlight). */
export function highlightTexts(ctx, prims, vp, color, strong) {
  const texts = prims.filter((prim) => prim.kind === 'text');
  if (!texts.length) return 0;
  ctx.save();
  for (const prim of texts) {
    const pad = Math.max(prim.size * 0.25, 2 / vp.zoom);
    const corners = textCorners(prim, pad).map((p) => vp.toScreen(p));
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.globalAlpha = strong ? 0.18 : 0.1;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = strong ? 0.95 : 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = strong ? 1.5 : 1;
    ctx.setLineDash(strong ? [] : [4, 3]);
    ctx.stroke();
  }
  ctx.restore();
  return texts.length;
}

function drawGrid(ctx, vp, colors, size, wp = null) {
  if (wp) return drawPlaneGrid(ctx, vp, colors, size, wp);
  const step = gridStepFor(size, vp.zoom);
  const box = vp.worldBox();
  const major = step * 5;
  const lines = (spacing, color, width) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = Math.ceil(box.minX / spacing), x = i * spacing; x <= box.maxX; i++, x = i * spacing) {
      const sx = Math.round(vp.toScreen({ x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, vp.height);
    }
    for (let i = Math.ceil(box.minY / spacing), y = i * spacing; y <= box.maxY; i++, y = i * spacing) {
      const sy = Math.round(vp.toScreen({ x: 0, y }).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(vp.width, sy);
    }
    ctx.stroke();
  };
  lines(step, colors.grid, 1);
  lines(major, colors.gridMajor, 1.4);
  // Axes through the origin.
  const o = vp.toScreen({ x: 0, y: 0 });
  ctx.beginPath();
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1;
  ctx.moveTo(0, Math.round(o.y) + 0.5); ctx.lineTo(vp.width, Math.round(o.y) + 0.5);
  ctx.moveTo(Math.round(o.x) + 0.5, 0); ctx.lineTo(Math.round(o.x) + 0.5, vp.height);
  ctx.stroke();
  return step;
}

/** The grid of a working plane: lines along its axes, its origin's axes, and a small X/Y marker. */
function drawPlaneGrid(ctx, vp, colors, size, wp) {
  const step = gridStepFor(size, vp.zoom);
  const box = vp.worldBox();
  const corners = [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }].map((p) => toPlane(p, wp));
  const lo = { x: Math.min(...corners.map((p) => p.x)), y: Math.min(...corners.map((p) => p.y)) };
  const hi = { x: Math.max(...corners.map((p) => p.x)), y: Math.max(...corners.map((p) => p.y)) };
  const segment = (a, b) => {
    const s = vp.toScreen(fromPlane(a, wp));
    const e = vp.toScreen(fromPlane(b, wp));
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
  };
  const lines = (spacing, color, width) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = Math.ceil(lo.x / spacing), x = i * spacing; x <= hi.x; i++, x = i * spacing) segment({ x, y: lo.y }, { x, y: hi.y });
    for (let i = Math.ceil(lo.y / spacing), y = i * spacing; y <= hi.y; i++, y = i * spacing) segment({ x: lo.x, y }, { x: hi.x, y });
    ctx.stroke();
  };
  lines(step, colors.grid, 1);
  lines(step * 5, colors.gridMajor, 1.4);
  ctx.beginPath();
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1;
  segment({ x: lo.x, y: 0 }, { x: hi.x, y: 0 });
  segment({ x: 0, y: lo.y }, { x: 0, y: hi.y });
  ctx.stroke();
  // The plane's own X (red) and Y (green) arrows at its origin, 40 px long.
  const o = vp.toScreen({ x: wp.x, y: wp.y });
  const len = 40 / vp.zoom;
  for (const [axis, color] of [[{ x: len, y: 0 }, '#e5484d'], [{ x: 0, y: len }, '#30a46c']]) {
    const tip = vp.toScreen(fromPlane(axis, wp));
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
  return step;
}

function drawSnapMarker(ctx, vp, snap, color) {
  const s = vp.toScreen(snap);
  const r = 7;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (snap.kind) {
    case 'endpoint': ctx.rect(s.x - r, s.y - r, r * 2, r * 2); break;
    case 'midpoint': ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y + r * 0.8); ctx.lineTo(s.x - r, s.y + r * 0.8); ctx.closePath(); break;
    case 'center': ctx.arc(s.x, s.y, r, 0, Math.PI * 2); break;
    case 'quadrant': ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x + r, s.y); ctx.lineTo(s.x, s.y + r); ctx.lineTo(s.x - r, s.y); ctx.closePath(); break;
    case 'intersection': ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y + r); ctx.moveTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r); break;
    case 'nearest': ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r); ctx.lineTo(s.x + r, s.y + r); ctx.closePath(); break;
    // Draft snaps: a right-angle mark, two parallel strokes, a dashed run-on, a fan, a star.
    case 'perpendicular': ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x - r, s.y + r); ctx.lineTo(s.x + r, s.y + r); ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x, s.y + r); break;
    case 'parallel': ctx.moveTo(s.x - r, s.y + r * 0.4); ctx.lineTo(s.x + r * 0.4, s.y - r); ctx.moveTo(s.x - r * 0.4, s.y + r); ctx.lineTo(s.x + r, s.y - r * 0.4); break;
    case 'extension': ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x - r * 0.4, s.y); ctx.moveTo(s.x - r * 0.1, s.y); ctx.lineTo(s.x + r * 0.3, s.y); ctx.moveTo(s.x + r * 0.6, s.y); ctx.lineTo(s.x + r, s.y); break;
    case 'angle': ctx.moveTo(s.x - r, s.y + r); ctx.lineTo(s.x + r, s.y + r); ctx.moveTo(s.x - r, s.y + r); ctx.lineTo(s.x + r * 0.6, s.y - r); ctx.moveTo(s.x + r * 0.3, s.y + r); ctx.arc(s.x - r, s.y + r, r * 1.3, 0, -Math.PI / 4, true); break;
    case 'special': for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; ctx.moveTo(s.x - r * Math.cos(a), s.y - r * Math.sin(a)); ctx.lineTo(s.x + r * Math.cos(a), s.y + r * Math.sin(a)); } break;
    default: ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y); ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ruler thickness in px (top and left edges of the canvas). */
export const RULER = 22;

/** A "nice" spacing (1, 2 or 5 × 10^n) at least `min` long. */
export function niceStep(min) {
  const power = 10 ** Math.floor(Math.log10(Math.max(min, 1e-9)));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= min) return factor * power;
  return 10 * power;
}

const label = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Rulers along the top and left edges: ticks and labels in the display unit, and the cursor position. */
export function drawRulers(ctx, vp, colors, cursor, unit = displayUnit()) {
  // Spacing chosen in the unit, then turned back into mm.
  const factor = unitFactor(unit);
  const majorInUnit = niceStep(70 / (vp.zoom * factor));
  const major = majorInUnit * factor;
  const minor = major / (String(majorInUnit).startsWith('2') ? 4 : 5);
  const box = vp.worldBox();
  ctx.save();
  ctx.fillStyle = colors.ruler;
  ctx.fillRect(0, 0, vp.width, RULER);
  ctx.fillRect(0, 0, RULER, vp.height);
  ctx.strokeStyle = colors.rulerLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5); ctx.lineTo(vp.width, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0); ctx.lineTo(RULER + 0.5, vp.height);
  ctx.stroke();
  ctx.fillStyle = colors.rulerText;
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let x = Math.floor(box.minX / minor) * minor; x <= box.maxX; x += minor) {
    const sx = Math.round(vp.toScreen({ x, y: 0 }).x) + 0.5;
    if (sx < RULER) continue;
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    ctx.moveTo(sx, RULER);
    ctx.lineTo(sx, RULER - (isMajor ? 12 : 5));
    if (isMajor) ctx.fillText(label(Math.round(x / major) * majorInUnit), sx + 3, 2);
  }
  for (let y = Math.floor(box.minY / minor) * minor; y <= box.maxY; y += minor) {
    const sy = Math.round(vp.toScreen({ x: 0, y }).y) + 0.5;
    if (sy < RULER) continue;
    const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    ctx.moveTo(RULER, sy);
    ctx.lineTo(RULER - (isMajor ? 12 : 5), sy);
    if (isMajor) {
      ctx.save();
      ctx.translate(2, sy - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label(Math.round(y / major) * majorInUnit), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  if (cursor) {
    const s = vp.toScreen(cursor);
    ctx.strokeStyle = colors.snap;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(s.x) + 0.5, 0); ctx.lineTo(Math.round(s.x) + 0.5, RULER);
    ctx.moveTo(0, Math.round(s.y) + 0.5); ctx.lineTo(RULER, Math.round(s.y) + 0.5);
    ctx.stroke();
  }
  // The unit is shown once, small, in the corner (tick labels are plain numbers).
  ctx.fillStyle = colors.ruler;
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.fillStyle = colors.rulerText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.fillText(unitLabel(unit), RULER / 2, RULER / 2);
  ctx.restore();
  return { major, minor, unit, majorInUnit };
}

/** Sketch constraints: a small tag at each (geometric in violet, dimensional in red; brighter for the selection). */
function drawConstraints(ctx, drawing, vp, selection, { virtualSpace = false, picked = null } = {}) {
  ctx.save();
  ctx.font = '600 10px "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const used = new Map();
  for (const c of drawing.constraints) {
    // Sketcher_SwitchVirtualSpace: only the constraints of the space shown.
    if (Boolean(c.virtual) !== Boolean(virtualSpace)) continue;
    const glyph = constraintGlyph(drawing, c);
    if (!glyph || !glyph.label) continue;
    const s = vp.toScreen(glyph.at);
    const key = `${Math.round(s.x / 6)},${Math.round(s.y / 6)}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    const x = s.x + 10 + n * 15;
    const y = s.y - 10;
    const w = Math.max(14, ctx.measureText(glyph.label).width + 6);
    const hot = c.refs.some((r) => selection.has(r.id)) || picked?.has(c.id);
    ctx.globalAlpha = glyph.inactive ? 0.35 : hot ? 1 : 0.8;
    // Inactive: grey; reference dimensions: blue (as FreeCAD).
    ctx.fillStyle = glyph.inactive ? '#8a8f98' : glyph.reference ? '#3b82f6' : glyph.dimensional ? '#e5484d' : '#9b51e0';
    ctx.beginPath();
    ctx.roundRect?.(x - w / 2, y - 7, w, 14, 4);
    if (!ctx.roundRect) ctx.rect(x - w / 2, y - 7, w, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph.label, x, y + 0.5);
  }
  ctx.restore();
}

function drawUcs(ctx, vp, color, inset = 0) {
  const x = 18 + inset;
  const y = vp.height - 18;
  const l = 34;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x, y); ctx.lineTo(x, y - l);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + l + 6, y); ctx.lineTo(x + l - 2, y - 4); ctx.lineTo(x + l - 2, y + 4); ctx.closePath();
  ctx.moveTo(x, y - l - 6); ctx.lineTo(x - 4, y - l + 2); ctx.lineTo(x + 4, y - l + 2); ctx.closePath();
  ctx.fill();
  ctx.font = '600 11px "Segoe UI", sans-serif';
  ctx.fillText('X', x + l + 9, y + 4);
  ctx.fillText('Y', x - 3, y - l - 10);
  ctx.restore();
}

/**
 * Draws one frame.
 * state: { drawing, vp, colors, settings, selection: Set, hover, previews: [entity], previewPrims,
 *          box: { a, b, crossing }, snap, cursor, gripHover, showGrips }
 */
export function render(ctx, state) {
  const { drawing, vp, colors, settings } = state;
  const dpr = state.dpr ?? 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vp.width, vp.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let gridStep = null;
  if (settings.showGrid) gridStep = drawGrid(ctx, vp, colors, gridBaseFor(drawing.grid?.size || settings.gridSize || 10), drawing.workPlane ?? null);
  const fonts = { stack: drawingFontStack(settings.fontFamily), weight: settings.fontWeight ?? 400, style: settings.fontStyle ?? 'normal' };
  const view = vp.worldBox();
  const margin = 4 / vp.zoom;
  const visibleBox = { minX: view.minX - margin, minY: view.minY - margin, maxX: view.maxX + margin, maxY: view.maxY + margin };
  const selection = state.selection ?? new Set();
  const dashScale = dashScaleOf(drawing);
  let drawn = 0;
  // Sketcher_RenderingOrder: the kind of geometry put on top is drawn last.
  const order = Array.isArray(settings.sketchRenderOrder) ? settings.sketchRenderOrder : null;
  const rank = (e) => order.indexOf(e.external ? 'external' : e.construction ? 'construction' : 'normal');
  const ordered = order ? [...drawing.entities].sort((a, b) => rank(b) - rank(a)) : drawing.entities;
  // TechDraw_ClipGroup: what is in a clip group shows only inside its window.
  const clips = new Map((drawing.groups ?? []).filter((g) => g.clip).map((g) => [g.id, g.clip]));
  for (const entity of ordered) {
    if (!isVisible(drawing, entity)) continue;
    if (entity.construction && settings.output) continue;
    const clip = entity.group ? clips.get(entity.group) : null;
    if (clip) {
      const a = vp.toScreen({ x: clip.minX, y: clip.minY }); const b = vp.toScreen({ x: clip.maxX, y: clip.maxY });
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.clip();
    }
    const box = cachedBox(entity);
    if (!box || !boxesOverlap(box, visibleBox)) continue;
    const style = styleOf(drawing, entity);
    const selected = selection.has(entity.id);
    const hovered = state.hover === entity.id && !selected;
    // Construction geometry: blue and dashed (FreeCAD Sketcher).
    const color = selected ? colors.select : hovered ? colors.hover : entity.external ? '#d946ef' : entity.construction ? '#3b82f6' : style.color === AUTO ? colors.ink : style.color;
    const width = weightPx(style.lineWidth, settings.showLineWeights) + (selected || hovered ? 1 : 0);
    const prims = cachedPrimitives(entity);
    // Selected (or hovered) texts get a tinted box behind them so the selection is easy to see.
    if (selected || hovered) highlightTexts(ctx, prims, vp, selected ? colors.select : colors.hover, selected);
    drawPrimitives(ctx, prims, vp, { color, width: entity.construction ? 1 : width, dash: entity.construction ? DASHES.dashed ?? [4, 2] : DASHES[style.lineType] ?? [], fonts, dashScale });
    if (clip) ctx.restore();
    drawn += 1;
  }
  // TechDraw_ToggleFrame: a dashed frame round each view (and each clip window).
  if (settings.tdViewFrames && !settings.output) {
    ctx.save();
    ctx.strokeStyle = colors.hover;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.fillStyle = colors.hover;
    for (const g of drawing.groups ?? []) {
      if (!g.view && !g.clip) continue;
      let box = g.clip ?? null;
      if (!box) {
        for (const e of drawing.entities) {
          if (e.group !== g.id) continue;
          const b = cachedBox(e);
          if (b) box = box ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) } : { ...b };
        }
      }
      if (!box) continue;
      const pad = g.clip ? 0 : 4 / vp.zoom * 3;
      const a = vp.toScreen({ x: box.minX - pad, y: box.maxY + pad }); const b = vp.toScreen({ x: box.maxX + pad, y: box.minY - pad });
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fillText(g.name, a.x + 3, a.y - 4);
    }
    ctx.restore();
  }
  // Tool previews (rubber band).
  for (const entity of state.previews ?? []) {
    const style = styleOf(drawing, entity);
    drawPrimitives(ctx, primitives(entity), vp, { color: colors.preview, width: weightPx(style.lineWidth, settings.showLineWeights), dash: DASHES[style.lineType] ?? [], fonts, alpha: 0.9 });
  }
  if (state.previewPrims?.length) drawPrimitives(ctx, state.previewPrims, vp, { color: colors.preview, width: 1, dash: [2 / vp.zoom * 3, 2 / vp.zoom * 3], fonts, alpha: 0.85 });
  if (drawing.constraints?.length && settings.showConstraints !== false) drawConstraints(ctx, drawing, vp, selection, { virtualSpace: settings.sketchVirtualSpace, picked: state.pickedConstraints });
  // Sketcher overlays: arc circles, B-spline control polygon, comb, knots, weights, picked axes.
  if (state.overlayPrims?.length) drawPrimitives(ctx, state.overlayPrims, vp, { color: '#f59e0b', width: 1, dash: [], fonts, alpha: 0.95 });
  // Grips of the selection.
  if (state.showGrips !== false && selection.size && selection.size <= 60) {
    ctx.save();
    for (const entity of drawing.entities) {
      if (!selection.has(entity.id)) continue;
      for (const grip of grips(entity)) {
        const s = vp.toScreen(grip);
        const hot = state.gripHover && state.gripHover.id === grip.id && state.gripHover.entity === entity.id;
        ctx.fillStyle = hot ? colors.snap : colors.grip;
        ctx.strokeStyle = colors.canvas;
        ctx.lineWidth = 1;
        ctx.fillRect(s.x - 4.5, s.y - 4.5, 9, 9);
        ctx.strokeRect(s.x - 4.5, s.y - 4.5, 9, 9);
      }
    }
    ctx.restore();
  }
  // Selection rectangle: window (left → right, solid) or crossing (right → left, dashed).
  if (state.box) {
    const a = vp.toScreen(state.box.a);
    const b = vp.toScreen(state.box.b);
    ctx.save();
    ctx.fillStyle = state.box.crossing ? colors.crossingFill : colors.windowFill;
    ctx.strokeStyle = state.box.crossing ? colors.crossing : colors.window;
    ctx.lineWidth = 1;
    if (state.box.crossing) ctx.setLineDash([5, 4]);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  }
  if (state.snap) drawSnapMarker(ctx, vp, state.snap, colors.snap);
  // Draft_Snap_Dimensions: the length and angle being drawn, next to the cursor.
  if (state.liveLabel && state.cursor) {
    const s = vp.toScreen(state.cursor);
    ctx.save();
    ctx.font = '600 11px "Segoe UI", sans-serif';
    const w = ctx.measureText(state.liveLabel).width + 10;
    ctx.fillStyle = colors.canvas;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(s.x + 14, s.y + 12, w, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.snap;
    ctx.textBaseline = 'middle';
    ctx.fillText(state.liveLabel, s.x + 19, s.y + 21);
    ctx.restore();
  }
  if (state.cursor && settings.crosshair && state.showCrosshair !== false) {
    const s = vp.toScreen(state.cursor);
    ctx.save();
    // Its colour and width come from the settings (red, 1 px by default).
    ctx.strokeStyle = settings.crosshairColor ?? colors.crosshair;
    ctx.lineWidth = settings.crosshairWidth ?? 1;
    // Dashed cross-hair lines (the dashes stay put on screen), solid pick box.
    ctx.setLineDash(CROSSHAIR_DASH.map((d) => d * Math.max(1, settings.crosshairWidth ?? 1)));
    ctx.beginPath();
    ctx.moveTo(0, Math.round(s.y) + 0.5); ctx.lineTo(vp.width, Math.round(s.y) + 0.5);
    ctx.moveTo(Math.round(s.x) + 0.5, 0); ctx.lineTo(Math.round(s.x) + 0.5, vp.height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeRect(Math.round(s.x) - 4.5, Math.round(s.y) - 4.5, 9, 9);
    ctx.restore();
  }
  drawUcs(ctx, vp, colors.ucs, settings.showRulers ? RULER : 0);
  let ruler = null;
  if (settings.showRulers && colors.ruler) ruler = drawRulers(ctx, vp, colors, state.cursor);
  return { drawn, gridStep, ruler };
}
