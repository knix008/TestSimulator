// Drawing and modify tools. A tool collects points (clicked with snaps, or
// typed as coordinates), shows a preview while the mouse moves, and changes
// the drawing through the `api` it is given:
//   api.add(type, data, opKey)        → new entity (one undo step)
//   api.change(opKey, (drawing) => …) → one undo step
//   api.selection() / api.select(ids) / api.hit(point) / api.options / api.notify(kind, key, params)
//   api.settings / api.layerFor(kind) / api.done()  (back to the select tool)
import { createEntity, formatNumber, offsetEntity } from '../domain/entities.js';
import { angleOf, arcFrom3, dist, normDeg, rad } from '../domain/geometry.js';
import { evaluate } from '../domain/expr.js';
import { parseCoordinate } from '../domain/snap.js';
import { normalizeParams } from '../domain/parts.js';
import { findEntity, transformEntities } from '../domain/drawing.js';

/** Tool ids in the order of the tool panel. */
export const DRAW_TOOLS = ['select', 'pan', 'line', 'polyline', 'rect', 'circle', 'arc', 'ellipse', 'polygon', 'text', 'centerline'];
export const DIM_TOOLS = ['dimLinear', 'dimAligned', 'dimRadius', 'dimDiameter', 'dimAngle', 'measure'];
export const MODIFY_TOOLS = ['move', 'copy', 'rotate', 'mirror', 'scale', 'offset'];
export const TOOL_ICONS = {
  select: 'select', pan: 'pan', line: 'line', polyline: 'polyline', rect: 'rect', circle: 'circle', arc: 'arc', ellipse: 'ellipse', polygon: 'polygon',
  text: 'text', centerline: 'centerline', dimLinear: 'dimHorizontal', dimAligned: 'dimension', dimRadius: 'dimRadius', dimDiameter: 'dimDiameter',
  dimAngle: 'dimAngle', measure: 'measure', move: 'move', copy: 'copyEntity', rotate: 'rotate', mirror: 'mirror', scale: 'scale', offset: 'offset', place: 'part',
};
export const TOOL_KEYS = { line: 'L', polyline: 'P', rect: 'R', circle: 'C', arc: 'A', ellipse: 'E', polygon: 'G', text: 'T', dimLinear: 'D', move: 'M', rotate: 'O', mirror: 'I', offset: 'F', measure: 'Q', pan: 'H', select: 'S' };
/** Tools that work on the current selection. */
export const NEEDS_SELECTION = new Set(['move', 'copy', 'rotate', 'mirror', 'scale']);

const lineData = (a, b) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

/** Base class: points, preview, typed input, finishing. */
class Tool {
  constructor(id, api) {
    this.id = id;
    this.api = api;
    this.points = [];
  }

  get last() { return this.points[this.points.length - 1] ?? null; }
  /** i18n key of the prompt for the next point. */
  prompt() { return `prompt.${this.id}.${Math.min(this.points.length, 3)}`; }
  /** Point the next rubber band starts from (ortho / relative coordinates). */
  base() { return this.last; }
  preview() { return {}; }
  click() {}
  /** Enter / right click. Returns true when the tool consumed it. */
  finish() { return false; }
  cancel() { this.points = []; }
  /** A number or coordinate typed in the command box. */
  typed(text, cursor) {
    const p = parseCoordinate(text, this.base(), cursor);
    if (!p) return false;
    this.click(p);
    return true;
  }
}

class LineTool extends Tool {
  constructor(id, api, { center = false } = {}) {
    super(id, api);
    this.center = center;
  }

  click(p) {
    if (this.last) {
      if (dist(this.last, p) < 1e-9) return;
      const style = this.center ? { lineType: 'center', layer: this.api.layerFor('center') } : {};
      this.api.add('line', { ...lineData(this.last, p), ...style }, this.center ? 'op.centerline' : 'op.line');
    }
    this.points.push(p);
  }

  preview(cursor) {
    if (!this.last) return {};
    return { previews: [createEntity('line', { ...lineData(this.last, cursor), layer: this.center ? this.api.layerFor('center') : this.api.drawing().activeLayer, ...(this.center ? { lineType: 'center' } : {}) })], length: dist(this.last, cursor), angle: angleOf(this.last, cursor) };
  }

  prompt() { return `prompt.line.${this.points.length ? 1 : 0}`; }
  finish() { if (!this.points.length) return false; this.points = []; return true; }
}

class PolylineTool extends Tool {
  click(p, { tolerance = 0 } = {}) {
    if (this.points.length >= 3 && dist(p, this.points[0]) <= tolerance) return this.complete(true);
    if (this.last && dist(this.last, p) < 1e-9) return undefined;
    this.points.push(p);
    return undefined;
  }

  complete(closed) {
    if (this.points.length >= 2) this.api.add('polyline', { points: this.points, closed }, 'op.polyline');
    this.points = [];
  }

  finish() {
    if (!this.points.length) return false;
    this.complete(false);
    return true;
  }

  preview(cursor) {
    if (!this.points.length) return {};
    return { previews: [createEntity('polyline', { points: [...this.points, cursor], closed: false, layer: this.api.drawing().activeLayer })], length: dist(this.last, cursor) };
  }

  prompt() { return `prompt.polyline.${this.points.length ? 1 : 0}`; }
}

/** Tools made of a fixed number of points; `build(points)` returns [type, data] or null. */
class PointsTool extends Tool {
  constructor(id, api, count, build, op) {
    super(id, api);
    this.count = count;
    this.build = build;
    this.op = op;
  }

  click(p) {
    this.points.push(p);
    if (this.points.length < this.count) return;
    const made = this.build(this.points, this.api);
    this.points = [];
    if (made) {
      const entity = this.api.add(made[0], made[1], this.op);
      if (this.id === 'text' && entity) {
        this.api.select([entity.id]);
        this.api.focusProperty?.('text');
        this.api.done();
      }
    }
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const made = this.build([...this.points, cursor], this.api, { preview: true });
    if (!made) return { previewPrims: this.points.length ? [{ kind: 'line', a: this.last, b: cursor }] : [] };
    try {
      return { previews: [createEntity(made[0], { layer: this.api.drawing().activeLayer, ...made[1] })], length: dist(this.last, cursor) };
    } catch {
      return {};
    }
  }
}

const dimDefaults = (api) => ({ size: api.settings().dimTextHeight, precision: api.settings().dimPrecision, layer: api.layerFor('dim') });

function buildFor(id) {
  switch (id) {
    case 'rect': return [2, ([a, b]) => (Math.abs(b.x - a.x) > 1e-9 && Math.abs(b.y - a.y) > 1e-9 ? ['rect', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }] : null), 'op.rect'];
    case 'circle': return [2, ([c, p]) => (dist(c, p) > 1e-9 ? ['circle', { cx: c.x, cy: c.y, r: dist(c, p) }] : null), 'op.circle'];
    case 'arc': return [3, (pts) => {
      if (pts.length === 2) return null;
      const arc = arcFrom3(...pts);
      return arc ? ['arc', arc] : null;
    }, 'op.arc'];
    case 'ellipse': return [3, ([c, a, b], api, { preview } = {}) => {
      const rx = dist(c, a);
      if (rx < 1e-9) return null;
      const angle = angleOf(c, a);
      const ry = b ? Math.abs(-(b.x - c.x) * Math.sin(rad(angle)) + (b.y - c.y) * Math.cos(rad(angle))) : rx / 2;
      if (!b && !preview) return null;
      return ['ellipse', { cx: c.x, cy: c.y, rx, ry: Math.max(ry, 1e-3), angle }];
    }, 'op.ellipse'];
    case 'polygon': return [2, ([c, p], api) => (dist(c, p) > 1e-9 ? ['polygon', { cx: c.x, cy: c.y, r: dist(c, p), sides: api.options.sides, angle: angleOf(c, p) }] : null), 'op.polygon'];
    case 'text': return [1, ([p], api) => ['text', { x: p.x, y: p.y, text: api.t('tool.textDefault'), size: api.settings().textHeight, layer: api.layerFor('text') }], 'op.text'];
    case 'dimAligned': return [3, ([a, b, o], api) => (dist(a, b) > 1e-9 ? ['dim', { kind: 'aligned', ...lineData(a, b), ox: (o ?? b).x, oy: (o ?? b).y, ...dimDefaults(api) }] : null), 'op.dim'];
    case 'dimLinear': return [3, ([a, b, o], api) => {
      if (dist(a, b) < 1e-9) return null;
      const at = o ?? b;
      // Like AutoCAD DIMLINEAR: dragging above/below gives a horizontal dimension, left/right a vertical one.
      const minX = Math.min(a.x, b.x); const maxX = Math.max(a.x, b.x); const minY = Math.min(a.y, b.y); const maxY = Math.max(a.y, b.y);
      const outsideX = at.x < minX || at.x > maxX;
      const outsideY = at.y < minY || at.y > maxY;
      const kind = outsideX && !outsideY ? 'vertical' : 'horizontal';
      return ['dim', { kind, ...lineData(a, b), ox: at.x, oy: at.y, ...dimDefaults(api) }];
    }, 'op.dim'];
    case 'dimAngle': return [3, ([c, a, b], api) => {
      if (!b || dist(c, a) < 1e-9 || dist(c, b) < 1e-9) return null;
      return ['dim', { kind: 'angle', cx: c.x, cy: c.y, r: Math.max(dist(c, b), 1), start: angleOf(c, a), end: angleOf(c, b), ...dimDefaults(api) }];
    }, 'op.dim'];
    default: return null;
  }
}

/** Radius/diameter: pick a circle or arc, then where the leader goes. */
class RadialDimTool extends Tool {
  click(p) {
    if (!this.target) {
      const hit = this.api.hit(p, (entity) => entity.type === 'circle' || entity.type === 'arc');
      if (!hit) return this.api.notify('info', 'notice.pickCircle');
      this.target = hit;
      this.points.push(p);
      return undefined;
    }
    const e = this.target;
    this.api.add('dim', { kind: this.id === 'dimRadius' ? 'radius' : 'diameter', cx: e.cx, cy: e.cy, r: e.r, angle: angleOf({ x: e.cx, y: e.cy }, p), ...dimDefaults(this.api) }, 'op.dim');
    this.target = null;
    this.points = [];
    return undefined;
  }

  preview(cursor) {
    if (!this.target) return {};
    const e = this.target;
    return { previews: [createEntity('dim', { kind: this.id === 'dimRadius' ? 'radius' : 'diameter', cx: e.cx, cy: e.cy, r: e.r, angle: angleOf({ x: e.cx, y: e.cy }, cursor), ...dimDefaults(this.api) })] };
  }

  prompt() { return `prompt.dimRadius.${this.target ? 1 : 0}`; }
  cancel() { super.cancel(); this.target = null; }
}

class MeasureTool extends Tool {
  click(p) {
    this.points.push(p);
    if (this.points.length === 2) {
      const [a, b] = this.points;
      this.api.measured({ distance: dist(a, b), dx: b.x - a.x, dy: b.y - a.y, angle: angleOf(a, b) });
      this.points = [];
    }
  }

  preview(cursor) {
    if (!this.last) return {};
    return { previewPrims: [{ kind: 'line', a: this.last, b: cursor }], length: dist(this.last, cursor), angle: angleOf(this.last, cursor) };
  }

  prompt() { return `prompt.measure.${this.points.length}`; }
}

/** Move / copy / rotate / mirror / scale the selection. */
class ModifyTool extends Tool {
  constructor(id, api) {
    super(id, api);
    this.ids = api.selection();
  }

  targets() {
    const drawing = this.api.drawing();
    return this.ids.map((id) => findEntity(drawing, id)).filter(Boolean);
  }

  op(points) {
    const [a, b, c] = points;
    switch (this.id) {
      case 'move': case 'copy': return b ? { type: 'move', dx: b.x - a.x, dy: b.y - a.y } : null;
      case 'rotate': return b ? { type: 'rotate', cx: a.x, cy: a.y, angle: angleOf(a, b) } : null;
      case 'mirror': return b && dist(a, b) > 1e-9 ? { type: 'mirror', a, b } : null;
      case 'scale': {
        if (!b || !c) return null;
        const r0 = dist(a, b);
        return r0 > 1e-9 ? { type: 'scale', cx: a.x, cy: a.y, factor: dist(a, c) / r0 } : null;
      }
      default: return null;
    }
  }

  needed() { return this.id === 'scale' ? 3 : 2; }

  apply(op) {
    if (!op) return;
    const copy = this.id === 'copy' || (this.id === 'mirror' && this.api.options.mirrorKeep);
    const label = `op.${this.id}`;
    const created = this.api.change(label, (drawing) => transformEntities(drawing, this.ids, op, { copy }));
    if (this.id !== 'copy') {
      if (this.id === 'mirror' && copy) this.api.select(created.map((entity) => entity.id));
      this.points = [];
      this.api.done();
    } else {
      // Copy repeats from the same base point until Esc.
      this.points = [this.points[0]];
    }
  }

  click(p) {
    if (!this.ids.length) return this.api.notify('info', 'notice.selectFirst');
    this.points.push(p);
    if (this.points.length >= this.needed()) this.apply(this.op(this.points));
    return undefined;
  }

  typed(text, cursor) {
    // After the base point: rotate takes an angle, scale a factor.
    const value = evaluate(text);
    if (this.points.length >= 1 && Number.isFinite(value)) {
      const [a] = this.points;
      if (this.id === 'rotate') { this.apply({ type: 'rotate', cx: a.x, cy: a.y, angle: value }); return true; }
      if (this.id === 'scale' && value > 0) { this.apply({ type: 'scale', cx: a.x, cy: a.y, factor: value }); return true; }
    }
    return super.typed(text, cursor);
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const op = this.op([...this.points, cursor]);
    const prims = [{ kind: 'line', a: this.points[0], b: cursor }];
    if (this.id === 'scale' && this.points.length === 1) return { previewPrims: prims };
    if (!op) return { previewPrims: prims };
    const scratch = structuredClone(this.api.drawing());
    const moved = transformEntities(scratch, this.ids, op);
    return { previews: moved, previewPrims: prims, length: dist(this.points[0], cursor), angle: angleOf(this.points[0], cursor) };
  }

  prompt() { return `prompt.${this.id}.${Math.min(this.points.length, this.needed() - 1)}`; }
}

class OffsetTool extends Tool {
  click(p) {
    if (!this.target) {
      const hit = this.api.hit(p, (entity) => ['line', 'circle', 'arc', 'polyline', 'rect', 'polygon', 'ellipse'].includes(entity.type));
      if (!hit) return this.api.notify('info', 'notice.pickEntity');
      this.target = hit;
      return undefined;
    }
    const copy = offsetEntity(this.target, this.api.options.offset, p);
    if (!copy) this.api.notify('error', 'notice.offsetFailed');
    else this.api.add(copy.type, copy, 'op.offset');
    this.target = null;
    return undefined;
  }

  typed(text) {
    const value = evaluate(text);
    if (!(value > 0)) return false;
    this.api.setOption('offset', value);
    return true;
  }

  preview(cursor) {
    if (!this.target) return {};
    const copy = offsetEntity(this.target, this.api.options.offset, cursor);
    return copy ? { previews: [copy] } : {};
  }

  prompt() { return `prompt.offset.${this.target ? 1 : 0}`; }
  cancel() { super.cancel(); this.target = null; }
}

/** Places a part (from the parts panel or the part window) where the user clicks. */
class PlaceTool extends Tool {
  constructor(id, api, part) {
    super(id, api);
    this.part = { kind: part.kind, params: normalizeParams(part.kind, part.params), angle: part.angle ?? 0 };
  }

  click(p) {
    const entity = this.api.add('part', { ...this.part, x: p.x, y: p.y }, 'op.part');
    if (entity) this.api.select([entity.id]);
    this.api.done();
  }

  preview(cursor) {
    return { previews: [createEntity('part', { ...this.part, x: cursor.x, y: cursor.y, layer: this.api.drawing().activeLayer })] };
  }

  prompt() { return 'prompt.place.0'; }
}

/** Creates the tool object for an id. */
export function createTool(id, api, extra = {}) {
  if (id === 'line') return new LineTool(id, api);
  if (id === 'centerline') return new LineTool(id, api, { center: true });
  if (id === 'polyline') return new PolylineTool(id, api);
  if (id === 'dimRadius' || id === 'dimDiameter') return new RadialDimTool(id, api);
  if (id === 'measure') return new MeasureTool(id, api);
  if (['move', 'copy', 'rotate', 'mirror', 'scale'].includes(id)) return new ModifyTool(id, api);
  if (id === 'offset') return new OffsetTool(id, api);
  if (id === 'place') return new PlaceTool(id, api, extra.part);
  const spec = buildFor(id);
  if (spec) return new PointsTool(id, api, ...spec);
  return null;
}

/** Live readout for the status bar while a tool is used ("L 25.4  ∠ 30°"). */
export function readout(info, precision = 2) {
  const parts = [];
  if (Number.isFinite(info?.length)) parts.push(`L ${formatNumber(info.length, precision)}`);
  if (Number.isFinite(info?.angle)) parts.push(`∠ ${formatNumber(normDeg(info.angle), 1)}°`);
  return parts.join('  ');
}

