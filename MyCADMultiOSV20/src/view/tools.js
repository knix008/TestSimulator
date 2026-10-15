// Drawing and modify tools. A tool collects points (clicked with snaps, or
// typed as coordinates), shows a preview while the mouse moves, and changes
// the drawing through the `api` it is given:
//   api.add(type, data, opKey)        → new entity (one undo step)
//   api.change(opKey, (drawing) => …) → one undo step
//   api.selection() / api.select(ids) / api.hit(point) / api.options / api.notify(kind, key, params)
//   api.settings / api.layerFor(kind) / api.done()  (back to the select tool)
import { createEntity, formatNumber, offsetEntity, primitives } from '../domain/entities.js';
import { chamferLines, extendEntity, filletLines, filletPolylineVertex, trimEntity } from '../domain/edit2d.js';
import { angleOf, arcFrom3, dist, normDeg, rad } from '../domain/geometry.js';
import { evaluate } from '../domain/expr.js';
import { displayUnit, evaluateLength, toUnit, unitLabel } from '../domain/units.js';
import { parseCoordinate } from '../domain/snap.js';
import { throughPoints } from '../domain/nurbs.js';
import { normalizeParams } from '../domain/parts.js';
import { addEntity, findEntity, isVisible, removeEntities, transformEntities } from '../domain/drawing.js';

/** Tool ids in the order of the tool panel. */
export const DRAW_TOOLS = ['select', 'pan', 'line', 'polyline', 'rect', 'circle', 'arc', 'ellipse', 'ellipseArc', 'polygon', 'spline', 'point', 'text', 'leader', 'hatch', 'centerline'];
export const VIEW_TOOLS = ['workPlane'];
export const DIM_TOOLS = ['dimLinear', 'dimAligned', 'dimRadius', 'dimDiameter', 'dimAngle', 'balloon', 'gdt', 'datum', 'measure'];
export const MODIFY_TOOLS = ['move', 'copy', 'rotate', 'mirror', 'scale', 'offset', 'trim', 'extend', 'fillet', 'chamfer'];
export const TOOL_ICONS = {
  select: 'select', pan: 'pan', line: 'line', polyline: 'polyline', rect: 'rect', circle: 'circle', arc: 'arc', ellipse: 'ellipse', polygon: 'polygon',
  text: 'text', centerline: 'centerline', ellipseArc: 'ellipseArc', spline: 'spline', point: 'point', leader: 'leader', workPlane: 'workPlane', balloon: 'balloon', gdt: 'gdt', datum: 'datum', hatch: 'hatch', dimLinear: 'dimHorizontal', dimAligned: 'dimension', dimRadius: 'dimRadius', dimDiameter: 'dimDiameter',
  dimAngle: 'dimAngle', measure: 'measure', move: 'move', copy: 'copyEntity', rotate: 'rotate', mirror: 'mirror', scale: 'scale', offset: 'offset', trim: 'trim', extend: 'extend', fillet: 'fillet2d', chamfer: 'chamfer2d', place: 'part',
};
export const TOOL_KEYS = { line: 'L', polyline: 'P', rect: 'R', circle: 'C', arc: 'A', ellipse: 'E', polygon: 'G', text: 'T', dimLinear: 'D', move: 'M', rotate: 'O', mirror: 'I', offset: 'F', trim: 'X', extend: 'W', fillet: 'J', chamfer: 'K', measure: 'Q', pan: 'H', select: 'S' };
/** Tools that work on the current selection. */
export const NEEDS_SELECTION = new Set(['move', 'copy', 'rotate', 'mirror', 'scale']);

const lineData = (a, b) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

/** Base class: points, preview, typed input, finishing. */
export class Tool {
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
    const p = parseCoordinate(text, this.base(), cursor, undefined, this.api.drawing().workPlane ?? null);
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

export class PolylineTool extends Tool {
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
    case 'ellipseArc': return [5, ([c, a, b, s0, s1], api, { preview } = {}) => {
      // Centre, end of the major axis, minor radius, then where the arc starts and ends.
      const rx = dist(c, a);
      if (rx < 1e-9 || !b) return null;
      const angle = angleOf(c, a);
      const local = (q) => ({ x: (q.x - c.x) * Math.cos(rad(angle)) + (q.y - c.y) * Math.sin(rad(angle)), y: -(q.x - c.x) * Math.sin(rad(angle)) + (q.y - c.y) * Math.cos(rad(angle)) });
      const ry = Math.max(Math.abs(local(b).y), 1e-3);
      const param = (q) => { const l = local(q); return normDeg((Math.atan2(l.y / ry, l.x / rx) * 180) / Math.PI); };
      if (!s0) return preview ? ['ellipse', { cx: c.x, cy: c.y, rx, ry, angle }] : null;
      const start = param(s0);
      let end = s1 ? param(s1) : start + 90;
      if (end <= start) end += 360;
      return ['ellipse', { cx: c.x, cy: c.y, rx, ry, angle, start, end }];
    }, 'op.ellipse'];
    case 'point': return [1, ([q]) => ['point', { x: q.x, y: q.y }], 'op.point'];
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
    const value = evaluateLength(text);
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

// ───────────────────────── trim, extend, fillet, chamfer (FreeCAD Draft / Sketcher)

const EDITABLE = ['line', 'polyline', 'rect', 'polygon', 'circle', 'arc'];

/** The edges of every visible entity but the one being edited. */
function edgesBut(api, id) {
  const drawing = api.drawing();
  return drawing.entities.filter((e) => e.id !== id && isVisible(drawing, e) && !['text', 'dim', 'hatch', 'solid', 'point'].includes(e.type)).flatMap((e) => primitives(e)).filter((prim) => prim.kind !== 'text' && prim.kind !== 'fill');
}

/** Replaces an entity by pieces in one undo step. */
function replaceBy(api, entity, pieces, op) {
  api.change(op, (drawing) => {
    removeEntities(drawing, [entity.id]);
    for (const piece of pieces) addEntity(drawing, piece.type, piece);
  });
}

/** Trim: click the part of a line, arc, circle or outline to cut away between the edges that cross it. */
class TrimTool extends Tool {
  click(p) {
    const hit = this.api.hit(p, (entity) => EDITABLE.includes(entity.type));
    if (!hit) return this.api.notify('info', 'notice.pickEntity');
    const pieces = trimEntity(hit, p, edgesBut(this.api, hit.id));
    if (!pieces) return this.api.notify('info', 'notice.trimNothing');
    replaceBy(this.api, hit, pieces, 'op.trim');
    return undefined;
  }

  preview(cursor) {
    const hit = this.api.hit(cursor, (entity) => EDITABLE.includes(entity.type));
    if (!hit) return {};
    const pieces = trimEntity(hit, cursor, edgesBut(this.api, hit.id));
    return pieces ? { previews: pieces.map((piece) => createEntity(piece.type, piece)) } : {};
  }

  prompt() { return 'prompt.trim.0'; }
}

/** Extend: click near the end of a line, arc or open polyline to run it on to the next edge. */
class ExtendTool extends Tool {
  click(p) {
    const hit = this.api.hit(p, (entity) => ['line', 'polyline', 'arc'].includes(entity.type));
    if (!hit) return this.api.notify('info', 'notice.pickEntity');
    const longer = extendEntity(hit, p, edgesBut(this.api, hit.id));
    if (!longer) return this.api.notify('info', 'notice.extendNothing');
    replaceBy(this.api, hit, [longer], 'op.extend');
    return undefined;
  }

  preview(cursor) {
    const hit = this.api.hit(cursor, (entity) => ['line', 'polyline', 'arc'].includes(entity.type));
    const longer = hit ? extendEntity(hit, cursor, edgesBut(this.api, hit.id)) : null;
    return longer ? { previews: [createEntity(longer.type, longer)] } : {};
  }

  prompt() { return 'prompt.extend.0'; }
}

/**
 * Fillet / chamfer: click two lines (the parts to keep), or one corner of a
 * polyline. The radius (fillet) or distance (chamfer) is typed in the command box.
 */
class CornerTool extends Tool {
  get size() { return this.api.options[this.id] ?? (this.id === 'fillet' ? 10 : 5); }

  make(first, p1, second, p2) {
    return this.id === 'fillet' ? filletLines(first, p1, second, p2, this.size) : chamferLines(first, p1, second, p2, this.size);
  }

  click(p) {
    const hit = this.api.hit(p, (entity) => ['line', 'polyline', 'rect', 'polygon'].includes(entity.type));
    if (!hit) return this.api.notify('info', 'notice.pickEntity');
    if (!this.first && hit.type !== 'line') {
      // One corner of an outline.
      const source = hit.type === 'polyline' ? hit : { ...hit, type: 'polyline', points: primitives(hit)[0]?.points ?? [], closed: true };
      const result = filletPolylineVertex(source, p, this.size, this.id === 'chamfer');
      if (!result) return this.api.notify('info', 'notice.cornerFailed');
      replaceBy(this.api, hit, [result], `op.${this.id}`);
      return undefined;
    }
    if (!this.first) { this.first = { entity: hit, p }; return undefined; }
    if (hit.type !== 'line' || hit.id === this.first.entity.id) return this.api.notify('info', 'notice.pickEntity');
    const pieces = this.make(this.first.entity, this.first.p, hit, p);
    if (!pieces) { this.api.notify('info', 'notice.cornerFailed'); this.first = null; return undefined; }
    const [one, two, ...extra] = pieces;
    const firstId = this.first.entity.id;
    this.api.change(`op.${this.id}`, (drawing) => {
      removeEntities(drawing, [firstId, hit.id]);
      for (const piece of [one, two, ...extra]) addEntity(drawing, piece.type, piece);
    });
    this.first = null;
    return undefined;
  }

  typed(text) {
    const value = evaluateLength(text);
    if (!(value >= 0)) return false;
    this.api.setOption(this.id, value);
    return true;
  }

  preview(cursor) {
    if (!this.first) return {};
    const hit = this.api.hit(cursor, (entity) => entity.type === 'line' && entity.id !== this.first.entity.id);
    const pieces = hit ? this.make(this.first.entity, this.first.p, hit, cursor) : null;
    return pieces ? { previews: pieces.map((piece) => createEntity(piece.type, piece)) } : {};
  }

  prompt() { return `prompt.${this.id}.${this.first ? 1 : 0}`; }
  cancel() { super.cancel(); this.first = null; }
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
/** Spline: click the points it passes through, Enter (or click the first point) to finish. */
class SplineTool extends PolylineTool {
  complete(closed) {
    if (this.points.length >= 2) this.api.add('spline', splineThrough(this.points, closed), 'op.spline');
    this.points = [];
  }

  preview(cursor) {
    if (!this.points.length) return {};
    return { previews: [createEntity('spline', { ...splineThrough([...this.points, cursor], false), layer: this.api.drawing().activeLayer })], length: dist(this.last, cursor) };
  }

  prompt() { return `prompt.spline.${this.points.length ? 1 : 0}`; }
}

const splineThrough = (points, closed) => {
  const curve = throughPoints(points.map((q) => [q.x, q.y]), closed);
  return { points: curve.points.map(([x, y]) => ({ x, y })), degree: curve.degree, knots: curve.knots };
};

/** Leader: the arrow tip first, then bends; Enter finishes and the note text is edited in the properties. */
class LeaderTool extends PolylineTool {
  complete() {
    if (this.points.length >= 2) {
      const entity = this.api.add('leader', { points: this.points, text: this.api.t('leader.defaultText'), size: this.api.settings().textHeight, layer: this.api.layerFor('text') }, 'op.leader');
      if (entity) { this.api.select([entity.id]); this.api.focusProperty?.('text'); }
    }
    this.points = [];
  }

  click(p) {
    if (this.last && dist(this.last, p) < 1e-9) return;
    this.points.push(p);
  }

  preview(cursor) {
    if (!this.points.length) return {};
    return { previews: [createEntity('leader', { points: [...this.points, cursor], text: '', size: this.api.settings().textHeight, layer: this.api.drawing().activeLayer })], length: dist(this.last, cursor) };
  }

  prompt() { return `prompt.leader.${this.points.length ? 1 : 0}`; }
}

/**
 * Balloon, GD&T feature control frame, datum symbol (TechDraw): click what it
 * points at, then where the head goes. Balloons number themselves, datums take the next letter.
 */
class AnnotationTool extends Tool {
  defaults() {
    const leaders = this.api.drawing().entities.filter((e) => e.type === 'leader' && e.style === this.id);
    if (this.id === 'balloon') return { text: String(Math.max(0, ...leaders.map((e) => Number.parseInt(e.text, 10)).filter(Number.isFinite)) + 1) };
    if (this.id === 'datum') {
      const used = new Set(leaders.map((e) => e.text.trim().toUpperCase()));
      const letter = [...'ABCDEFGHJKLMNPRSTUVWXYZ'].find((c) => !used.has(c)) ?? 'A';
      return { text: letter };
    }
    return { text: '0.05', symbol: this.api.options.gdtSymbol ?? 'position', datums: '' };
  }

  entity(points) {
    return { points, style: this.id, ...this.defaults(), size: this.api.settings().textHeight, layer: this.api.layerFor('text') };
  }

  click(p) {
    if (!this.tip) { this.tip = p; return; }
    if (dist(this.tip, p) < 1e-9) return;
    const entity = this.api.add('leader', this.entity([this.tip, p]), `op.${this.id}`);
    this.tip = null;
    if (entity) { this.api.select([entity.id]); this.api.focusProperty?.('text'); }
  }

  preview(cursor) {
    if (!this.tip || dist(this.tip, cursor) < 1e-9) return {};
    return { previews: [createEntity('leader', this.entity([this.tip, cursor]))], length: dist(this.tip, cursor) };
  }

  prompt() { return `prompt.${this.id}.${this.tip ? 1 : 0}`; }
  cancel() { super.cancel(); this.tip = null; }
}

/** Working plane: click its origin, then a point on its X axis (the elevation Z stays). */
class WorkPlaneTool extends Tool {
  click(p) {
    if (!this.origin) { this.origin = p; return; }
    if (dist(this.origin, p) < 1e-9) return;
    const origin = this.origin;
    this.origin = null;
    this.api.setWorkPlane?.(origin, p);
  }

  preview(cursor) {
    if (!this.origin) return {};
    return { previews: [createEntity('line', { x1: this.origin.x, y1: this.origin.y, x2: cursor.x, y2: cursor.y, layer: this.api.drawing().activeLayer })], length: dist(this.origin, cursor) };
  }

  prompt() { return `prompt.workPlane.${this.origin ? 1 : 0}`; }
  cancel() { super.cancel(); this.origin = null; }
}

/** Hatch: click inside a closed area (outlines around it are found; inner outlines stay holes). */
class HatchTool extends Tool {
  click(p) {
    const loops = this.api.regionAt?.(p);
    if (!loops?.length) {
      this.api.notify('info', 'notice.noRegion');
      return;
    }
    const o = this.api.options;
    this.api.add('hatch', { loops, pattern: o.hatchPattern ?? 'ansi31', scale: o.hatchScale ?? 1, angle: o.hatchAngle ?? 0, layer: this.api.layerFor('hatch') }, 'op.hatch');
  }

  prompt() { return 'prompt.hatch.0'; }
}

/** Tools added by command modules (the Sketcher's): id → (api, extra) => tool. */
const REGISTERED = new Map();
export function registerTool(id, factory) { REGISTERED.set(id, factory); }

export function createTool(id, api, extra = {}) {
  if (REGISTERED.has(id)) return REGISTERED.get(id)(api, extra);
  if (id === 'line') return new LineTool(id, api);
  if (id === 'spline') return new SplineTool(id, api);
  if (id === 'leader') return new LeaderTool(id, api);
  if (id === 'balloon' || id === 'gdt' || id === 'datum') return new AnnotationTool(id, api);
  if (id === 'workPlane') return new WorkPlaneTool(id, api);
  if (id === 'hatch') return new HatchTool(id, api);
  if (id === 'centerline') return new LineTool(id, api, { center: true });
  if (id === 'polyline') return new PolylineTool(id, api);
  if (id === 'dimRadius' || id === 'dimDiameter') return new RadialDimTool(id, api);
  if (id === 'measure') return new MeasureTool(id, api);
  if (['move', 'copy', 'rotate', 'mirror', 'scale'].includes(id)) return new ModifyTool(id, api);
  if (id === 'offset') return new OffsetTool(id, api);
  if (id === 'trim') return new TrimTool(id, api);
  if (id === 'extend') return new ExtendTool(id, api);
  if (id === 'fillet' || id === 'chamfer') return new CornerTool(id, api);
  if (id === 'place') return new PlaceTool(id, api, extra.part);
  const spec = buildFor(id);
  if (spec) return new PointsTool(id, api, ...spec);
  return null;
}

/** Live readout for the status bar while a tool is used ("L 25.4  ∠ 30°"). */
export function readout(info, precision = 2) {
  const parts = [];
  if (Number.isFinite(info?.length)) parts.push(`L ${formatNumber(toUnit(info.length), precision)} ${unitLabel(displayUnit())}`);
  if (Number.isFinite(info?.angle)) parts.push(`∠ ${formatNumber(normDeg(info.angle), 1)}°`);
  return parts.join('  ');
}

