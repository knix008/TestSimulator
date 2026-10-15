// FreeCAD's Sketcher commands MyCAD did not have yet: sketch objects on a
// plane (new, edit, leave, attach, reorient, merge, mirror, carbon copy,
// external projection and intersection, view and section), the creation tools
// built from lines and arcs with constraints (3-point circle, arc from centre,
// conics, arc slot, centred and rounded rectangles, triangle … octagon,
// interpolated and periodic B-splines), B-spline editing (degree, knots,
// conversion, joining), splitting, move/array, internal geometry, the solver
// diagnostics, constraint switches (active, driving, virtual space) and the
// overlays (arc circles, control polygon, curvature comb, degree, knots, weights).
import './sketcher-icons.js';
import { createEntity, grips, transformEntity } from '../domain/entities.js';
import { addEntity } from '../domain/drawing.js';
import { DIMENSIONAL, VIRTUAL_ENTITIES, addConstraint, constraintDiagnostics } from '../domain/constraints.js';
import {
  arcFromCenter, arcOverlay, arcSlotShape, centeredRectangleShape, chainSegments, circleThrough, elevateDegree, ellipseFrom3, hyperbolaArc,
  increaseMultiplicity, insertKnot, insertShape, internalGeometry, interpolate, interpolatePeriodic, joinNurbs, knotInfo, nurbsRange,
  parabolaArc, periodicSpline, polygonShape, reduceDegree, removeKnot, roundedRectangleShape, sectionSegments, splineData, splineOverlay,
  splitEdge, toNurbs, validateSketch,
} from '../domain/sketch.js';
import { apply as apply3, eulerOf, mul as mul3, rotationOf } from '../domain/transform3d.js';
import { Tool, PolylineTool, TOOL_ICONS, registerTool } from '../view/tools.js';


// ───────────────────────── creation tools (on the canvas)

/** A tool of a fixed number of clicks; make(points, api, { preview }) → { shape } | { type, data } | null. */
class PickTool extends Tool {
  constructor(id, api, count, make, op) {
    super(id, api);
    this.count = count;
    this.make = make;
    this.op = op;
  }

  click(p) {
    this.points.push(p);
    if (this.points.length < this.count) return;
    const made = this.make(this.points, this.api, {});
    this.points = [];
    if (!made) { this.api.notify('info', 'sk.cannotMake'); return; }
    if (made.shape) {
      const list = this.api.change(this.op, (d) => insertShape(d, made.shape, addEntity));
      if (list?.length) this.api.select(list.map((e) => e.id));
    } else this.api.add(made.type, made.data, this.op);
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const made = this.make([...this.points, cursor], this.api, { preview: true });
    const layer = this.api.drawing().activeLayer;
    try {
      if (made?.shape) return { previews: made.shape.entities.map((item) => createEntity(item.type, { layer, ...item.data })) };
      if (made) return { previews: [createEntity(made.type, { layer, ...made.data })] };
    } catch { /* not drawable yet */ }
    return { previewPrims: [{ kind: 'line', a: this.last, b: cursor }] };
  }

  prompt() { return `prompt.${this.id}.${Math.min(this.points.length, this.count - 1)}`; }
}

/** Curves of any number of clicks, finished with Enter (or by clicking the first point). */
class CurveTool extends PolylineTool {
  constructor(id, api, build, op) {
    super(id, api);
    this.build = build;
    this.op = op;
  }

  complete() {
    const s = this.points.length >= 2 ? this.build(this.points) : null;
    if (s) this.api.add('spline', splineData(s), this.op);
    this.points = [];
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const s = this.build([...this.points, cursor]);
    if (!s) return { previewPrims: [{ kind: 'line', a: this.last, b: cursor }] };
    return { previews: [createEntity('spline', { ...splineData(s), layer: this.api.drawing().activeLayer })] };
  }

  prompt() { return `prompt.${this.id}.${this.points.length ? 1 : 0}`; }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (c, p) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;

/** Sketcher_Split: click an edge where it should be cut. */
class SplitTool extends Tool {
  click(p) {
    const hit = this.api.hit(p, (e) => ['line', 'arc', 'circle', 'ellipse', 'polyline', 'spline'].includes(e.type));
    if (!hit) { this.api.notify('info', 'sk.pickEdge'); return; }
    const cut = splitEdge(hit, p);
    if (!cut) { this.api.notify('info', 'sk.cannotSplit'); return; }
    const made = this.api.change('sk.op.split', (d) => {
      const pieces = cut.pieces.map((piece) => addEntity(d, piece.type, piece.data));
      // Constraints on the cut edge's ends move to the piece that has that end.
      d.constraints = (d.constraints ?? []).flatMap((c) => {
        if (!c.refs.some((r) => r.id === hit.id)) return [c];
        const refs = c.refs.map((r) => {
          if (r.id !== hit.id) return r;
          const to = r.at ? cut.refMap(r.at) : null;
          return to ? { id: pieces[to.piece].id, at: to.at } : null;
        });
        return refs.every(Boolean) ? [{ ...c, refs }] : [];
      });
      d.entities = d.entities.filter((e) => e.id !== hit.id);
      return pieces;
    });
    if (made?.length) this.api.select(made.map((e) => e.id));
  }

  prompt() { return 'prompt.skSplit.0'; }
}

const polygonTool = (sides) => [2, ([c, v]) => { const shape = v ? polygonShape(c, v, sides) : null; return shape ? { shape } : null; }, 'sk.op.polygon'];
const TOOLS = {
  skCircle3: [3, ([a, b, c]) => { const circle = c ? circleThrough(a, b, c) : null; return circle ? { type: 'circle', data: circle } : null; }, 'op.circle'],
  skArcCenter: [3, ([c, s, e]) => { const arc = e ? arcFromCenter(c, s, e) : null; return arc ? { type: 'arc', data: arc } : null; }, 'op.arc'],
  skEllipse3: [3, ([a, b, q]) => { const e = q ? ellipseFrom3(a, b, q) : null; return e ? { type: 'ellipse', data: e } : null; }, 'op.ellipse'],
  skParabola: [4, ([v, f, s, e]) => { const curve = e ? parabolaArc(v, f, s, e) : null; return curve ? { type: 'spline', data: splineData(curve) } : null; }, 'sk.op.conic'],
  skHyperbola: [5, ([c, v, b, s, e]) => { const curve = e ? hyperbolaArc(c, v, b, s, e) : null; return curve ? { type: 'spline', data: splineData(curve) } : null; }, 'sk.op.conic'],
  skArcSlot: [4, ([c, s, e, w]) => {
    if (!w) return null;
    const r = dist(c, s);
    const shape = arcSlotShape(c, r, angle(c, s), angle(c, e), Math.abs(dist(c, w) - r) * 2);
    return shape ? { shape } : null;
  }, 'sk.op.slot'],
  skRectCenter: [2, ([c, p]) => { const shape = p ? centeredRectangleShape(c, p) : null; return shape ? { shape } : null; }, 'op.rect'],
  skOblong: [2, ([a, b], api) => { const shape = b ? roundedRectangleShape(a, b, api.options.oblongRadius ?? Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 0.2) : null; return shape ? { shape } : null; }, 'op.rect'],
  skPolygon3: polygonTool(3), skPolygon4: polygonTool(4), skPolygon5: polygonTool(5), skPolygon6: polygonTool(6), skPolygon7: polygonTool(7), skPolygon8: polygonTool(8),
};
const CURVES = {
  skBSplineInterp: (pts) => interpolate(pts, 3),
  skPeriodicBSpline: (pts) => (pts.length >= 3 ? periodicSpline(pts, 3) : null),
  skPeriodicInterp: (pts) => (pts.length >= 3 ? interpolatePeriodic(pts) : null),
};
for (const [id, spec] of Object.entries(TOOLS)) { registerTool(id, (api) => new PickTool(id, api, ...spec)); TOOL_ICONS[id] = id; }
for (const [id, build] of Object.entries(CURVES)) { registerTool(id, (api) => new CurveTool(id, api, build, 'op.spline')); TOOL_ICONS[id] = id; }
registerTool('skSplit', (api) => new SplitTool('skSplit', api));
TOOL_ICONS.skSplit = 'skSplit';

// ───────────────────────── sketch planes

/** The frame of a sketch: rotation matrix and origin. */
const frameOf = (sketch) => ({ R: rotationOf(sketch?.frame ?? {}), t: [sketch?.frame?.x ?? 0, sketch?.frame?.y ?? 0, sketch?.frame?.z ?? 0] });
const PLANES = { xy: { rx: 0, ry: 0, rz: 0 }, xz: { rx: 90, ry: 0, rz: 0 }, yz: { rx: 90, ry: 0, rz: 90 } };
/** A frame on a base plane, moved along its normal and maybe turned over. */
function planeFrame(plane, offset = 0, reverse = false) {
  let R = rotationOf(PLANES[plane] ?? PLANES.xy);
  if (reverse) R = mul3(R, rotationOf({ ry: 180 }));
  const n = apply3(R, [0, 0, 1]);
  const e = eulerOf(R);
  return { x: n[0] * offset, y: n[1] * offset, z: n[2] * offset, rx: e.rx, ry: e.ry, rz: e.rz };
}

/** Overlays the canvas draws for the Sketcher toggles (not saved in the drawing). */
export function sketchOverlayPrims(drawing, settings, { size = 1, refs = [], selection = [] } = {}) {
  const prims = [];
  if (!drawing) return prims;
  const splines = { polygon: settings.sketchBsplinePolygon, comb: settings.sketchBsplineComb, degree: settings.sketchBsplineDegree, knots: settings.sketchBsplineKnots, weights: settings.sketchBsplineWeights };
  const anySpline = Object.values(splines).some(Boolean);
  for (const e of drawing.entities) {
    if (e.hidden) continue;
    if (settings.sketchArcOverlay && e.type === 'arc') prims.push(...arcOverlay(e));
    if (anySpline && e.type === 'spline') prims.push(...splineOverlay(e, { ...splines, size }));
  }
  // The sketch axes picked for a constraint.
  const reach = size * 60;
  if (refs.includes('@h')) prims.push({ kind: 'line', a: { x: -reach, y: 0 }, b: { x: reach, y: 0 } });
  if (refs.includes('@v')) prims.push({ kind: 'line', a: { x: 0, y: -reach }, b: { x: 0, y: reach } });
  if (refs.includes('@origin')) prims.push({ kind: 'circle', c: { x: 0, y: 0 }, r: size * 2 });
  // Draft_SubelementHighlight: every vertex of the selection, ringed.
  for (const e of selection) for (const g of grips(e)) prims.push({ kind: 'circle', c: { x: g.x, y: g.y }, r: size * 1.5 });
  return prims;
}

export function sketcherCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const sketches = () => (drawing()?.groups ?? []).filter((g) => g.sketch);
  const hasDoc = () => Boolean(app.activeDoc());
  const selected = () => app.selectedEntities();
  const splines = () => selected().filter((e) => e.type === 'spline');
  const editing = () => sketches().find((g) => g.id === state.editSketch) ?? null;
  /** The sketch the command is about: the one being edited, picked in the tree, or holding the selection. */
  const currentSketch = () => editing() ?? sketches().find((g) => g.id === state.treeGroup) ?? sketches().find((g) => g.id === selected()[0]?.group) ?? null;
  const membersOf = (id) => drawing().entities.filter((e) => e.group === id);
  /** Geometry the sketch commands work on: the edited sketch's, else all 2D geometry. */
  const scope = () => {
    const sk = editing();
    return drawing().entities.filter((e) => e.type !== 'solid' && (!sk || e.group === sk.id));
  };
  const ok = (id = 'ok') => [{ id: 'cancel', label: t('confirm.cancel') }, { id, label: t('confirm.ok'), primary: true }];
  const pickedConstraints = () => {
    const all = drawing()?.constraints ?? [];
    const picked = all.filter((c) => (state.constraintSelection ?? []).includes(c.id));
    if (picked.length) return picked;
    const ids = new Set(app.selectedIds());
    return all.filter((c) => c.refs.some((r) => ids.has(r.id)));
  };

  // ── sketch objects

  async function newSketch() {
    const answer = await app.form({ title: t('sk.newSketch'), icon: 'skSketch', width: 480, fields: [
      { key: 'name', type: 'text', label: t('sk.name'), icon: 'skSketch', value: t('sk.sketchN', { n: sketches().length + 1 }) },
      { key: 'plane', type: 'select', label: t('sk.plane'), icon: 'skMap', value: 'xy', options: Object.keys(PLANES).map((p) => [p, t(`sk.plane.${p}`)]) },
      { key: 'offset', type: 'number', label: t('sk.offset'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'reverse', type: 'check', label: t('sk.reverse'), icon: 'skReorient', value: false },
    ], actions: ok() });
    if (answer?.action !== 'ok') return null;
    const v = answer.values;
    const sketch = { id: app.newId(), name: v.name || t('sk.sketchN', { n: sketches().length + 1 }), parent: null, sketch: true, frame: planeFrame(v.plane, v.offset ?? 0, v.reverse) };
    app.change('sk.op.newSketch', (d) => { d.groups = [...(d.groups ?? []), sketch]; });
    editSketch(sketch.id);
    return sketch;
  }

  function editSketch(id) {
    state.editSketch = id;
    state.constraintSelection = [];
    if (state.view3d) app.toggle3d(false);
    app.select(membersOf(id).map((e) => e.id));
    app.showTree();
    app.notify('success', t('sk.editing', { name: sketches().find((g) => g.id === id)?.name ?? '' }));
  }

  function leaveSketch() {
    const name = editing()?.name ?? '';
    state.editSketch = null;
    state.sketchRefs = [];
    state.constraintSelection = [];
    app.select([]);
    app.showTree();
    app.notify('info', t('sk.left', { name }));
  }

  async function chooseSketch(titleKey, icon, extra = [], { exclude = null } = {}) {
    const list = sketches().filter((g) => g.id !== exclude);
    if (!list.length) { app.notify('info', t('sk.noSketch')); return null; }
    const current = currentSketch();
    const answer = await app.form({ title: t(titleKey), icon, width: 500, fields: [
      { key: 'sketch', type: 'select', label: t('sk.sketch'), icon: 'skSketch', value: list.some((g) => g.id === current?.id) ? current.id : list[0].id, options: list.map((g) => [g.id, g.name]) },
      ...extra,
    ], actions: ok() });
    return answer?.action === 'ok' ? { sketch: list.find((g) => g.id === answer.values.sketch), values: answer.values } : null;
  }

  /** Sketcher_MapSketch / Sketcher_ReorientSketch: the sketch onto a base plane, a datum plane or a picked face. */
  async function attachSketch(titleKey, icon) {
    const face = (state.elements ?? []).find((el) => el.kind === 'face');
    const datum = app.selectedEntities().find((e) => e.kind === 'datum');
    const supports = [...Object.keys(PLANES).map((p) => [p, t(`sk.plane.${p}`)]), ...(face ? [['face', t('sk.onFace')]] : []), ...(datum ? [['datum', t('sk.onDatum')]] : [])];
    const picked = await chooseSketch(titleKey, icon, [
      { key: 'support', type: 'select', label: t('sk.support'), icon: 'skMap', value: face ? 'face' : datum ? 'datum' : 'xy', options: supports },
      { key: 'offset', type: 'number', label: t('sk.offset'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'reverse', type: 'check', label: t('sk.reverse'), icon: 'skReorient', value: false },
    ]);
    if (!picked) return;
    const v = picked.values;
    let frame;
    if (v.support === 'face' || v.support === 'datum') {
      const [origin, normal] = v.support === 'face' ? [face.signature.center, face.signature.normal] : [[datum.x ?? 0, datum.y ?? 0, datum.z ?? 0], apply3(rotationOf(datum), [0, 0, 1])];
      const n = v.reverse ? normal.map((x) => -x) : normal;
      // A frame whose Z is the normal; X stays as level as it can.
      const z = n;
      const xHint = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
      const y = unit(cross(z, xHint));
      const x = unit(cross(y, z));
      const e = eulerOf([[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]]);
      frame = { x: origin[0] + z[0] * (v.offset ?? 0), y: origin[1] + z[1] * (v.offset ?? 0), z: origin[2] + z[2] * (v.offset ?? 0), rx: e.rx, ry: e.ry, rz: e.rz };
    } else frame = planeFrame(v.support, v.offset ?? 0, v.reverse);
    app.change('sk.op.attach', (d) => { d.groups = d.groups.map((g) => (g.id === picked.sketch.id ? { ...g, frame } : g)); });
    app.notify('success', t('sk.attached', { name: picked.sketch.name }));
  }

  /** Copies of entities (and the constraints among them) into a group; `map` changes each copy, `mapRef` each constraint. */
  function copyInto(d, sources, group, { map = (e) => e, mapConstraint = (c) => c } = {}) {
    const ids = new Map();
    for (const e of sources) {
      const { id: _id, ...rest } = map(structuredClone(e));
      const made = addEntity(d, e.type, { ...rest, group: group ?? undefined });
      ids.set(e.id, made.id);
    }
    const inside = (d.constraints ?? []).filter((c) => c.refs.every((r) => ids.has(r.id) || Object.hasOwn(VIRTUAL_ENTITIES, r.id)));
    for (const c of inside) {
      const copy = mapConstraint({ ...structuredClone(c), id: `k-${app.newId()}`, refs: c.refs.map((r) => ({ ...r, id: ids.get(r.id) ?? r.id })) });
      if (copy) d.constraints = [...(d.constraints ?? []), copy];
    }
    return [...ids.values()];
  }

  async function mergeSketches() {
    const list = sketches();
    if (list.length < 2) { app.notify('info', t('sk.needTwoSketches')); return; }
    const answer = await app.form({ title: t('sk.merge'), icon: 'skMerge', width: 480, fields: list.map((g) => ({ key: g.id, type: 'check', label: g.name, icon: 'skSketch', value: true })), actions: ok() });
    if (answer?.action !== 'ok') return;
    const chosen = list.filter((g) => answer.values[g.id]);
    if (chosen.length < 2) { app.notify('info', t('sk.needTwoSketches')); return; }
    const merged = { id: app.newId(), name: t('sk.mergedName'), parent: null, sketch: true, frame: { ...chosen[0].frame } };
    app.change('sk.op.merge', (d) => {
      d.groups = [...d.groups, merged];
      copyInto(d, d.entities.filter((e) => chosen.some((g) => g.id === e.group)), merged.id);
    });
    app.notify('success', t('sk.merged', { count: chosen.length }));
  }

  async function mirrorSketch() {
    const picked = await chooseSketch('sk.mirror', 'skMirror', [{ key: 'axis', type: 'select', label: t('sk.mirrorAxis'), icon: 'skMirror', value: 'v', options: [['v', t('sk.axis.v')], ['h', t('sk.axis.h')], ['origin', t('sk.axis.origin')]] }]);
    if (!picked) return;
    const axis = picked.values.axis;
    const op = axis === 'origin' ? { type: 'rotate', angle: 180, cx: 0, cy: 0 } : { type: 'mirror', a: { x: 0, y: 0 }, b: axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 } };
    const flipX = axis !== 'h';
    const flipY = axis !== 'v';
    const sk = { id: app.newId(), name: `${picked.sketch.name} (${t('sk.mirrored')})`, parent: null, sketch: true, frame: { ...picked.sketch.frame } };
    app.change('sk.op.mirror', (d) => {
      d.groups = [...d.groups, sk];
      const sources = d.entities.filter((e) => e.group === picked.sketch.id);
      copyInto(d, sources, sk.id, {
        map: (e) => transformEntity(e, op),
        mapConstraint: (c) => {
          // A mirror turns arcs round (start ↔ end), and signed distances and angles change sign.
          const refs = op.type === 'mirror' ? c.refs.map((r) => ((r.at === 'start' || r.at === 'end') && d.entities.find((e) => e.id === r.id)?.type === 'arc' ? { ...r, at: r.at === 'start' ? 'end' : 'start' } : r)) : c.refs;
          let value = c.value;
          if (c.type === 'distanceX' && flipX) value = -value;
          if (c.type === 'distanceY' && flipY) value = -value;
          if (c.type === 'angle' && op.type === 'mirror') value = (360 - value) % 360;
          return { ...c, refs, ...(value !== undefined ? { value } : {}) };
        },
      });
    });
    app.notify('success', t('sk.mirroredDone', { name: sk.name }));
  }

  async function carbonCopy() {
    const target = editing();
    const picked = await chooseSketch('sk.carbonCopy', 'skCarbonCopy', [], { exclude: target?.id });
    if (!picked) return;
    app.change('sk.op.carbonCopy', (d) => { copyInto(d, d.entities.filter((e) => e.group === picked.sketch.id), target?.id ?? null); });
    app.notify('success', t('sk.copied', { name: picked.sketch.name }));
  }

  /** World → the edited sketch's plane (or the XY plane). */
  function toLocal() {
    const { R, t: o } = frameOf(editing());
    return (p) => {
      const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
      return [R[0][0] * d[0] + R[1][0] * d[1] + R[2][0] * d[2], R[0][1] * d[0] + R[1][1] * d[1] + R[2][1] * d[2], R[0][2] * d[0] + R[1][2] * d[1] + R[2][2] * d[2]];
    };
  }
  const EXTERNAL = { construction: true, external: true, color: '#d946ef' };

  /** Sketcher_Projection: the picked edges (or every edge of the selected solids) flattened onto the sketch, as external geometry. */
  function projection() {
    const local = toLocal();
    const edges = (state.elements ?? []).filter((el) => el.kind === 'edge' || el.kind === 'vertex');
    const paths = edges.length
      ? edges.map((el) => ({ kind: el.kind, points: app.elementPoints(el) }))
      : app.selectedSolids().flatMap((e) => app.topologyOfEntity(e).edges.map((edge) => ({ kind: 'edge', points: edge.points })));
    const group = editing()?.id;
    let count = 0;
    app.change('sk.op.projection', (d) => {
      for (const path of paths) {
        const pts = path.points.map(local).map(([x, y]) => ({ x, y }));
        if (path.kind === 'vertex' || pts.every((p) => dist(p, pts[0]) < 1e-6)) { if (pts[0]) { addEntity(d, 'point', { x: pts[0].x, y: pts[0].y, ...EXTERNAL, group }); count++; } continue; }
        if (pts.length === 2) addEntity(d, 'line', { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, ...EXTERNAL, group });
        else addEntity(d, 'polyline', { points: pts, closed: false, ...EXTERNAL, group });
        count++;
      }
    });
    app.notify(count ? 'success' : 'info', t(count ? 'sk.projected' : 'sk.needSolid', { count }));
  }

  /** Sketcher_Intersection: where the selected solids cross the sketch plane, as external geometry. */
  function intersection() {
    const local = toLocal();
    const group = editing()?.id;
    const tris = app.selectedSolids().flatMap((e) => app.solidMeshOf(e));
    const loops = chainSegments(sectionSegments(tris, local));
    app.change('sk.op.intersection', (d) => {
      for (const loop of loops) addEntity(d, 'polyline', { points: loop.points, closed: loop.closed, ...EXTERNAL, group });
    });
    app.notify(loops.length ? 'success' : 'info', t(loops.length ? 'sk.intersected' : 'sk.noIntersection', { count: loops.length }));
  }

  async function viewSketch() {
    const sk = currentSketch();
    const ids = sk ? membersOf(sk.id).map((e) => e.id) : scope().map((e) => e.id);
    if (!state.view3d) {
      app.select(ids);
      app.zoomToSelection();
      return;
    }
    const { R, t: o } = frameOf(sk);
    const n = apply3(R, [0, 0, 1]);
    const up = apply3(R, [0, 1, 0]);
    const v = app.view3d.instance;
    const reach = Math.max(100, v?.size ?? 100) * 2;
    v?.setCamera({ position: o.map((x, i) => x + n[i] * reach), target: o, up, projection: v.getCamera().projection, zoom: 1 });
  }

  async function viewSection() {
    if (!state.view3d) await app.toggle3d(true);
    const v = app.view3d.instance;
    if (!v) return;
    state.sketchSection = !state.sketchSection;
    if (!state.sketchSection) { v.setClipping(null); return; }
    const { R, t: o } = frameOf(currentSketch());
    v.setClipping({ custom: { normal: apply3(R, [0, 0, -1]), point: o } });
  }

  // ── checking and cleaning

  async function validate() {
    const d = drawing();
    const found = validateSketch({ ...d, entities: scope() });
    const malformed = constraintDiagnostics(d).malformed;
    const answer = await app.form({ title: t('sk.validate'), icon: 'skValidate', width: 520, fields: [
      { key: 'missing', type: 'info', label: t('sk.v.missing'), icon: 'kCoincident', value: String(found.missing.length) },
      { key: 'degenerate', type: 'info', label: t('sk.v.degenerate'), icon: 'warning', value: String(found.degenerate.length) },
      { key: 'duplicates', type: 'info', label: t('sk.v.duplicates'), icon: 'skCarbonCopy', value: String(found.duplicates.length) },
      { key: 'malformed', type: 'info', label: t('sk.v.malformed'), icon: 'skSelectMalformed', value: String(malformed.length) },
    ], actions: [{ id: 'cancel', label: t('sk.close') }, { id: 'fix', label: t('sk.v.fix'), primary: true }] });
    if (answer?.action !== 'fix') return found;
    app.change('sk.op.validate', (draft) => {
      for (const pair of found.missing) addConstraint(draft, 'coincident', pair);
      const drop = new Set([...found.degenerate, ...found.duplicates.map(([, second]) => second)]);
      draft.entities = draft.entities.filter((e) => !drop.has(e.id));
      draft.constraints = (draft.constraints ?? []).filter((c) => !malformed.includes(c.id));
    });
    app.notify('success', t('sk.v.fixed', { count: found.missing.length + found.degenerate.length + found.duplicates.length + malformed.length }));
    return found;
  }

  async function confirmDelete(key, icon) {
    const answer = await app.form({ title: t(key), icon, width: 460, intro: t(`${key}Ask`), fields: [], actions: ok() });
    return answer?.action === 'ok';
  }

  async function deleteAllGeometry() {
    if (!await confirmDelete('sk.deleteAllGeometry', 'skDeleteGeometry')) return;
    const ids = new Set(scope().map((e) => e.id));
    app.change('sk.op.deleteGeometry', (d) => { d.entities = d.entities.filter((e) => !ids.has(e.id)); });
    app.notify('success', t('sk.deleted', { count: ids.size }));
  }

  async function deleteAllConstraints() {
    if (!await confirmDelete('sk.deleteAllConstraints', 'skDeleteConstraints')) return;
    const ids = new Set(scope().map((e) => e.id));
    const before = drawing().constraints?.length ?? 0;
    app.change('sk.op.deleteConstraints', (d) => { d.constraints = (d.constraints ?? []).filter((c) => !c.refs.some((r) => ids.has(r.id))); });
    app.notify('success', t('sk.deleted', { count: before - (drawing().constraints?.length ?? 0) }));
  }

  // ── constraints

  /** Sketcher_Dimension: the dimension that fits the selection. */
  function dimension() {
    const ents = selected();
    const refs = state.sketchRefs ?? [];
    let type = null;
    if (ents.length === 1 && !refs.length) type = { line: 'distance', circle: 'diameter', arc: 'radius' }[ents[0].type] ?? null;
    else if (ents.length + refs.length === 2) {
      const lines = [...ents, ...refs.map((id) => VIRTUAL_ENTITIES[id])].every((e) => e.type === 'line');
      type = lines ? 'angle' : 'distance';
    }
    if (!type) { app.notify('info', t('sk.dimensionPick')); return null; }
    return app.constrainSelection(type);
  }

  async function changeDimension() {
    const c = pickedConstraints().find((k) => DIMENSIONAL.includes(k.type));
    if (!c) { app.notify('info', t('sk.pickDimension')); return; }
    const answer = await app.form({ title: t('sk.changeDimension'), icon: 'skChangeDimension', width: 440, fields: [
      { key: 'value', type: 'number', label: t(`constraint.${c.type}`), icon: 'skDimension', value: c.value ?? 0, step: c.type === 'snellsLaw' ? 0.05 : 1, ...(c.type === 'angle' ? { unit: '°' } : c.type === 'snellsLaw' ? {} : { unit: 'mm' }) },
    ], actions: ok() });
    const value = Number(answer?.values?.value);
    if (answer?.action !== 'ok' || !Number.isFinite(value)) return;
    app.change('op.constrain', (d) => { d.constraints = d.constraints.map((k) => (k.id === c.id ? { ...k, value } : k)); });
  }

  function toggleFlag(key, label, { only = null } = {}) {
    const list = pickedConstraints().filter((c) => !only || only(c));
    if (!list.length) { app.notify('info', t('sk.pickConstraint')); return; }
    const ids = new Set(list.map((c) => c.id));
    const flip = (c) => {
      const next = { ...c };
      if (key === 'virtual') { if (c.virtual) delete next.virtual; else next.virtual = true; } else if (c[key] === false) delete next[key]; else next[key] = false;
      return next;
    };
    app.change(label, (d) => { d.constraints = d.constraints.map((c) => (ids.has(c.id) ? flip(c) : c)); });
    app.notify('success', t('sk.toggled', { count: list.length }));
  }

  /** Sketcher_RemoveAxesAlignment: horizontal / vertical become parallel / perpendicular to one of the lines. */
  function removeAxesAlignment() {
    const ids = new Set(app.selectedIds());
    const aligned = (drawing().constraints ?? []).filter((c) => (c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 1 && ids.has(c.refs[0].id));
    if (!aligned.length) { app.notify('info', t('sk.noAxisAlignment')); return; }
    const ref = aligned.find((c) => c.type === 'horizontal') ?? aligned[0];
    const base = ref.refs[0].id;
    app.change('sk.op.removeAxes', (d) => {
      d.constraints = d.constraints.filter((c) => !aligned.includes(c));
      for (const c of aligned) {
        if (c.refs[0].id === base) continue;
        addConstraint(d, c.type === ref.type ? 'parallel' : 'perpendicular', [{ id: base }, { id: c.refs[0].id }]);
      }
    });
    app.notify('success', t('sk.axesRemoved', { count: aligned.length }));
  }

  // ── selection (solver messages)

  function pickConstraints(ids, key) {
    state.constraintSelection = ids;
    const d = drawing();
    const ents = new Set((d.constraints ?? []).filter((c) => ids.includes(c.id)).flatMap((c) => c.refs.map((r) => r.id)).filter((id) => !Object.hasOwn(VIRTUAL_ENTITIES, id)));
    app.select([...ents]);
    app.notify(ids.length ? 'info' : 'success', t(key, { count: ids.length }));
    return ids;
  }

  function selectSketchRef(id) {
    const refs = new Set(state.sketchRefs ?? []);
    if (refs.has(id)) refs.delete(id); else refs.add(id);
    state.sketchRefs = [...refs];
    app.repaint();
    app.notify('info', t(refs.has(id) ? 'sk.refPicked' : 'sk.refDropped', { name: t(`sk.ref.${id.slice(1)}`) }));
  }

  // ── B-splines

  /** Replaces a spline's curve (same id); constraints on its control points are dropped, those on its ends kept. */
  function setCurve(d, id, s) {
    const e = d.entities.find((x) => x.id === id);
    const data = splineData(s);
    d.entities = d.entities.map((x) => (x.id === id ? { ...x, ...data } : x));
    d.constraints = (d.constraints ?? []).filter((c) => !c.refs.some((r) => r.id === id && /^cp\d+$/.test(r.at ?? '')));
    // The control-point circles of its internal geometry no longer fit.
    if (e) d.entities = d.entities.filter((x) => x.internal !== id);
  }

  function eachSpline(label, op) {
    const list = splines();
    if (!list.length) { app.notify('info', t('sk.pickSpline')); return; }
    app.change(label, (d) => { for (const e of list) setCurve(d, e.id, op(toNurbs(e))); });
    const after = list.map((e) => drawing().entities.find((x) => x.id === e.id));
    app.notify('success', t('sk.splineDone', { degree: after[0]?.degree ?? '', count: after[0]?.points.length ?? '' }));
  }

  async function pickKnot(titleKey, icon) {
    const e = splines()[0];
    if (!e) { app.notify('info', t('sk.pickSpline')); return null; }
    const knots = knotInfo(toNurbs(e));
    if (!knots.length) { app.notify('info', t('sk.noKnots')); return null; }
    if (knots.length === 1) return { e, u: knots[0].u };
    const answer = await app.form({ title: t(titleKey), icon, width: 440, fields: [
      { key: 'knot', type: 'select', label: t('sk.knot'), icon: 'skBSplineKnots', value: '0', options: knots.map((k, i) => [String(i), `u = ${k.u.toFixed(4)} (×${k.mult})`]) },
    ], actions: ok() });
    return answer?.action === 'ok' ? { e, u: knots[Number(answer.values.knot)].u } : null;
  }

  async function knotMultiplicity(up) {
    const picked = await pickKnot(up ? 'sk.knotUp' : 'sk.knotDown', up ? 'skKnotUp' : 'skKnotDown');
    if (!picked) return;
    const s = toNurbs(picked.e);
    const next = up ? increaseMultiplicity(s, picked.u) : removeKnot(s, picked.u);
    app.change('sk.op.knot', (d) => setCurve(d, picked.e.id, next));
    const k = knotInfo(next).find((x) => Math.abs(x.u - picked.u) < 1e-9);
    app.notify('success', t('sk.multiplicity', { mult: k?.mult ?? 0 }));
  }

  async function insertKnotAt() {
    const e = splines()[0];
    if (!e) { app.notify('info', t('sk.pickSpline')); return; }
    const answer = await app.form({ title: t('sk.insertKnot'), icon: 'skInsertKnot', width: 440, fields: [
      { key: 'at', type: 'number', label: t('sk.knotAt'), icon: 'skBSplineKnots', value: 0.5, min: 0.001, max: 0.999, step: 0.05 },
      { key: 'times', type: 'number', label: t('sk.knotTimes'), icon: 'skKnotUp', value: 1, min: 1, max: e.degree, step: 1 },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const s = toNurbs(e);
    const [a, b] = nurbsRange(s);
    app.change('sk.op.knot', (d) => setCurve(d, e.id, insertKnot(s, a + (b - a) * answer.values.at, Math.round(answer.values.times))));
    app.notify('success', t('sk.knotInserted'));
  }

  function convertToNurbs() {
    const list = selected().filter((e) => e.type !== 'spline' && toNurbs(e));
    if (!list.length) { app.notify('info', t('sk.pickCurve')); return; }
    const made = app.change('sk.op.toNurbs', (d) => list.map((e) => {
      const { id: _id, type: _type, ...style } = e;
      const keep = { layer: style.layer, color: style.color, lineType: style.lineType, lineWidth: style.lineWidth, group: style.group, construction: style.construction };
      d.entities = d.entities.filter((x) => x.id !== e.id);
      return addEntity(d, 'spline', { ...keep, ...splineData(toNurbs(e)) });
    }));
    if (made?.length) app.select(made.map((e) => e.id));
    app.notify('success', t('sk.converted', { count: list.length }));
  }

  function joinCurves() {
    const list = selected().filter((e) => toNurbs(e));
    if (list.length !== 2) { app.notify('info', t('sk.pickTwoCurves')); return; }
    const joined = joinNurbs(toNurbs(list[0]), toNurbs(list[1]), 1e-3 * Math.max(1, ...list.map((e) => Math.abs(e.x1 ?? e.cx ?? 1))));
    if (!joined) { app.notify('info', t('sk.notTouching')); return; }
    const made = app.change('sk.op.join', (d) => {
      d.entities = d.entities.filter((e) => !list.some((x) => x.id === e.id));
      return addEntity(d, 'spline', { layer: list[0].layer, group: list[0].group, ...splineData(joined) });
    });
    if (made) app.select([made.id]);
  }

  // ── editing

  async function translate() {
    const ids = new Set(app.selectedIds());
    if (!ids.size) { app.notify('info', t('notice.selectFirst')); return; }
    const answer = await app.form({ title: t('sk.translate'), icon: 'skTranslate', width: 520, fields: [
      { key: 'dx', type: 'number', label: t('sk.dx'), icon: 'move', value: 20, step: 1, unit: 'mm' },
      { key: 'dy', type: 'number', label: t('sk.dy'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'copies', type: 'number', label: t('sk.copies'), icon: 'skTranslate', value: 0, min: 0, max: 100, step: 1 },
      { key: 'rows', type: 'number', label: t('sk.rows'), icon: 'skTranslate', value: 1, min: 1, max: 100, step: 1 },
      { key: 'rowDx', type: 'number', label: t('sk.rowDx'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'rowDy', type: 'number', label: t('sk.rowDy'), icon: 'move', value: 20, step: 1, unit: 'mm' },
      { key: 'constraints', type: 'check', label: t('sk.keepConstraints'), icon: 'kCoincident', value: true },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const v = answer.values;
    const copies = Math.round(v.copies ?? 0);
    const rows = Math.round(v.rows ?? 1);
    if (!copies && rows <= 1) {
      // Only a move.
      app.change('sk.op.translate', (d) => { d.entities = d.entities.map((e) => (ids.has(e.id) ? transformEntity(e, { type: 'move', dx: v.dx, dy: v.dy }) : e)); });
      return;
    }
    const made = app.change('sk.op.translate', (d) => {
      const sources = d.entities.filter((e) => ids.has(e.id));
      const out = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= copies; c++) {
          if (!r && !c) continue;
          const op = { type: 'move', dx: c * v.dx + r * v.rowDx, dy: c * v.dy + r * v.rowDy };
          out.push(...copyInto(d, sources, null, { map: (e) => ({ ...transformEntity(e, op), group: e.group }), mapConstraint: (k) => (v.constraints ? k : null) }));
        }
      }
      return out;
    });
    app.notify('success', t('sk.translated', { count: made?.length ?? 0 }));
  }

  /** Sketcher_RestoreInternalAlignmentGeometry: adds an ellipse's axes and foci or a B-spline's control-point circles — or removes them. */
  function internalAlignment() {
    const list = selected().filter((e) => e.type === 'ellipse' || e.type === 'spline');
    if (!list.length) { app.notify('info', t('sk.pickEllipseOrSpline')); return; }
    let added = 0;
    let removed = 0;
    app.change('sk.op.internal', (d) => {
      for (const e of list) {
        const existing = d.entities.filter((x) => x.internal === e.id);
        if (existing.length) {
          d.entities = d.entities.filter((x) => x.internal !== e.id);
          removed += existing.length;
          continue;
        }
        internalGeometry(e).forEach((g) => {
          const made = addEntity(d, g.type, { ...g.data, construction: true, internal: e.id, group: e.group, layer: e.layer });
          added++;
          // Each control-point circle sits on its pole: moving the circle moves the pole.
          const pole = /^pole(\d+)$/.exec(g.role);
          if (pole) addConstraint(d, 'coincident', [{ id: made.id, at: 'c' }, { id: e.id, at: `cp${pole[1]}` }]);
        });
      }
    });
    app.notify('success', t(added ? 'sk.internalAdded' : 'sk.internalRemoved', { count: added || removed }));
  }

  async function renderOrder() {
    const orders = [['normal,construction,external', t('sk.order.normal')], ['construction,normal,external', t('sk.order.construction')], ['external,normal,construction', t('sk.order.external')]];
    const now = (state.settings.sketchRenderOrder ?? ['normal', 'construction', 'external']).join(',');
    const answer = await app.form({ title: t('sk.renderOrder'), icon: 'skRenderOrder', width: 460, fields: [{ key: 'order', type: 'select', label: t('sk.onTop'), icon: 'skRenderOrder', value: orders.some(([k]) => k === now) ? now : orders[0][0], options: orders }], actions: ok() });
    if (answer?.action === 'ok') app.updateSettings({ sketchRenderOrder: answer.values.order.split(',') });
  }

  async function hexagonProfile() {
    const answer = await app.form({ title: t('sk.hexagonProfile'), icon: 'skHexagonProfile', width: 460, fields: [
      { key: 'cx', type: 'number', label: t('pd.centerX'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      { key: 'cy', type: 'number', label: t('pd.centerY'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      { key: 'r', type: 'number', label: t('sk.circumradius'), icon: 'skPolygon6', value: 10, min: 0.001, step: 1, unit: 'mm' },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const { cx, cy, r } = answer.values;
    const shape = polygonShape({ x: cx, y: cy }, { x: cx + r, y: cy }, 6);
    shape.constraints.push({ type: 'radius', refs: [{ key: 'circle' }], value: r });
    const made = app.change('sk.op.polygon', (d) => insertShape(d, shape, addEntity));
    if (made?.length) app.select(made.map((e) => e.id));
  }

  const toggle = (key) => ({ checked: () => Boolean(state.settings[key]), run: () => { app.updateSettings({ [key]: !state.settings[key] }); app.repaint(); } });
  const tool = (id) => ({ icon: id, label: `tool.${id}`, enabled: hasDoc, run: () => app.setTool(id) });
  const diag = () => constraintDiagnostics(drawing());
  const anyConstraint = () => Boolean(drawing()?.constraints?.length);

  return {
    ...Object.fromEntries([...Object.keys(TOOLS), ...Object.keys(CURVES), 'skSplit'].map((id) => [`sk:${id}`, tool(id)])),
    'sk:new': { icon: 'skSketch', label: 'sk.newSketch', enabled: hasDoc, run: () => newSketch() },
    'sk:edit': { icon: 'skEdit', label: 'sk.editSketch', enabled: () => sketches().length > 0, run: async () => { const picked = await chooseSketch('sk.editSketch', 'skEdit'); if (picked) editSketch(picked.sketch.id); } },
    'sk:leave': { icon: 'skLeave', label: 'sk.leaveSketch', enabled: () => Boolean(editing()), run: () => leaveSketch() },
    'sk:map': { icon: 'skMap', label: 'sk.mapSketch', enabled: () => sketches().length > 0, run: () => attachSketch('sk.mapSketch', 'skMap') },
    'sk:reorient': { icon: 'skReorient', label: 'sk.reorient', enabled: () => sketches().length > 0, run: () => attachSketch('sk.reorient', 'skReorient') },
    'sk:merge': { icon: 'skMerge', label: 'sk.merge', enabled: () => sketches().length > 1, run: () => mergeSketches() },
    'sk:mirror': { icon: 'skMirror', label: 'sk.mirror', enabled: () => sketches().length > 0, run: () => mirrorSketch() },
    'sk:carbonCopy': { icon: 'skCarbonCopy', label: 'sk.carbonCopy', enabled: () => sketches().length > (editing() ? 1 : 0), run: () => carbonCopy() },
    'sk:projection': { icon: 'skProjection', label: 'sk.projection', enabled: () => app.selectedSolids().length > 0 || (state.elements ?? []).length > 0, run: () => projection() },
    'sk:intersection': { icon: 'skIntersection', label: 'sk.intersection', enabled: () => app.selectedSolids().length > 0, run: () => intersection() },
    'sk:viewSketch': { icon: 'skViewSketch', label: 'sk.viewSketch', enabled: hasDoc, run: () => viewSketch() },
    'sk:viewSection': { icon: 'skViewSection', label: 'sk.viewSection', enabled: hasDoc, checked: () => Boolean(state.sketchSection), run: () => viewSection() },
    'sk:validate': { icon: 'skValidate', label: 'sk.validate', enabled: hasDoc, run: () => validate() },
    'sk:deleteAllGeometry': { icon: 'skDeleteGeometry', label: 'sk.deleteAllGeometry', enabled: () => scope().length > 0, run: () => deleteAllGeometry() },
    'sk:deleteAllConstraints': { icon: 'skDeleteConstraints', label: 'sk.deleteAllConstraints', enabled: anyConstraint, run: () => deleteAllConstraints() },
    'sk:dimension': { icon: 'skDimension', label: 'sk.dimension', enabled: () => selected().length > 0, run: () => dimension() },
    'sk:changeDimension': { icon: 'skChangeDimension', label: 'sk.changeDimension', enabled: anyConstraint, run: () => changeDimension() },
    'sk:toggleActive': { icon: 'skToggleActive', label: 'sk.toggleActive', enabled: anyConstraint, run: () => toggleFlag('active', 'sk.op.toggleActive') },
    'sk:toggleDriving': { icon: 'skToggleDriving', label: 'sk.toggleDriving', enabled: anyConstraint, run: () => toggleFlag('driving', 'sk.op.toggleDriving', { only: (c) => DIMENSIONAL.includes(c.type) }) },
    'sk:switchVirtualSpace': { icon: 'skVirtualSpace', label: 'sk.switchVirtualSpace', enabled: hasDoc, checked: () => Boolean(state.settings.sketchVirtualSpace), run: () => {
      // With constraints picked they move to the other space; without, the view shows the other space.
      if ((state.constraintSelection ?? []).length) toggleFlag('virtual', 'sk.op.virtualSpace');
      else { app.updateSettings({ sketchVirtualSpace: !state.settings.sketchVirtualSpace }); app.repaint(); }
    } },
    'sk:removeAxesAlignment': { icon: 'skRemoveAxes', label: 'sk.removeAxesAlignment', enabled: () => selected().length > 0, run: () => removeAxesAlignment() },
    'sk:selectConstraints': { icon: 'skSelectConstraints', label: 'sk.selectConstraints', enabled: () => selected().length > 0, run: () => { const ids = new Set(app.selectedIds()); state.constraintSelection = (drawing().constraints ?? []).filter((c) => c.refs.some((r) => ids.has(r.id))).map((c) => c.id); app.renderRight(); app.notify('info', t('sk.constraintsPicked', { count: state.constraintSelection.length })); } },
    'sk:selectElements': { icon: 'skSelectElements', label: 'sk.selectElements', enabled: anyConstraint, run: () => pickConstraints((state.constraintSelection ?? []).length ? state.constraintSelection : (drawing().constraints ?? []).map((c) => c.id), 'sk.elementsPicked') },
    'sk:selectDofs': { icon: 'skSelectDofs', label: 'sk.selectDofs', enabled: hasDoc, run: () => { const free = diag().free.filter((id) => scope().some((e) => e.id === id)); app.select(free); app.notify('info', t('sk.dofsPicked', { count: free.length })); } },
    'sk:selectConflicting': { icon: 'skSelectConflicting', label: 'sk.selectConflicting', enabled: anyConstraint, run: () => pickConstraints(diag().conflicting, 'sk.conflictingPicked') },
    'sk:selectRedundant': { icon: 'skSelectRedundant', label: 'sk.selectRedundant', enabled: anyConstraint, run: () => pickConstraints(diag().redundant, 'sk.redundantPicked') },
    'sk:selectPartially': { icon: 'skSelectPartially', label: 'sk.selectPartially', enabled: anyConstraint, run: () => pickConstraints(diag().partially, 'sk.partiallyPicked') },
    'sk:selectMalformed': { icon: 'skSelectMalformed', label: 'sk.selectMalformed', enabled: anyConstraint, run: () => pickConstraints(diag().malformed, 'sk.malformedPicked') },
    'sk:selectOrigin': { icon: 'skSelectOrigin', label: 'sk.selectOrigin', enabled: hasDoc, checked: () => (state.sketchRefs ?? []).includes('@origin'), run: () => selectSketchRef('@origin') },
    'sk:selectHAxis': { icon: 'skSelectHAxis', label: 'sk.selectHAxis', enabled: hasDoc, checked: () => (state.sketchRefs ?? []).includes('@h'), run: () => selectSketchRef('@h') },
    'sk:selectVAxis': { icon: 'skSelectVAxis', label: 'sk.selectVAxis', enabled: hasDoc, checked: () => (state.sketchRefs ?? []).includes('@v'), run: () => selectSketchRef('@v') },
    'sk:toNurbs': { icon: 'skToNurbs', label: 'sk.toNurbs', enabled: () => selected().some((e) => e.type !== 'spline' && toNurbs(e)), run: () => convertToNurbs() },
    'sk:degreeUp': { icon: 'skDegreeUp', label: 'sk.degreeUp', enabled: () => splines().length > 0, run: () => eachSpline('sk.op.degree', elevateDegree) },
    'sk:degreeDown': { icon: 'skDegreeDown', label: 'sk.degreeDown', enabled: () => splines().some((e) => e.degree > 1), run: () => eachSpline('sk.op.degree', reduceDegree) },
    'sk:knotUp': { icon: 'skKnotUp', label: 'sk.knotUp', enabled: () => splines().length > 0, run: () => knotMultiplicity(true) },
    'sk:knotDown': { icon: 'skKnotDown', label: 'sk.knotDown', enabled: () => splines().length > 0, run: () => knotMultiplicity(false) },
    'sk:insertKnot': { icon: 'skInsertKnot', label: 'sk.insertKnot', enabled: () => splines().length > 0, run: () => insertKnotAt() },
    'sk:joinCurves': { icon: 'skJoin', label: 'sk.joinCurves', enabled: () => selected().length === 2, run: () => joinCurves() },
    'sk:translate': { icon: 'skTranslate', label: 'sk.translate', enabled: () => selected().length > 0, run: () => translate() },
    'sk:stop': { icon: 'skStop', label: 'sk.stop', enabled: hasDoc, run: () => { app.setTool('select'); state.constraintSelection = []; state.sketchRefs = []; app.repaint(); } },
    'sk:internalGeometry': { icon: 'skInternal', label: 'sk.internalGeometry', enabled: () => selected().some((e) => e.type === 'ellipse' || e.type === 'spline'), run: () => internalAlignment() },
    'sk:arcOverlay': { icon: 'skArcOverlay', label: 'sk.arcOverlay', enabled: hasDoc, ...toggle('sketchArcOverlay') },
    'sk:bsplinePolygon': { icon: 'skBSplinePolygon', label: 'sk.bsplinePolygon', enabled: hasDoc, ...toggle('sketchBsplinePolygon') },
    'sk:bsplineComb': { icon: 'skBSplineComb', label: 'sk.bsplineComb', enabled: hasDoc, ...toggle('sketchBsplineComb') },
    'sk:bsplineDegree': { icon: 'skBSplineDegree', label: 'sk.bsplineDegree', enabled: hasDoc, ...toggle('sketchBsplineDegree') },
    'sk:bsplineKnots': { icon: 'skBSplineKnots', label: 'sk.bsplineKnots', enabled: hasDoc, ...toggle('sketchBsplineKnots') },
    'sk:bsplineWeights': { icon: 'skBSplineWeights', label: 'sk.bsplineWeights', enabled: hasDoc, ...toggle('sketchBsplineWeights') },
    'sk:renderOrder': { icon: 'skRenderOrder', label: 'sk.renderOrder', enabled: hasDoc, run: () => renderOrder() },
    'sk:hexagonProfile': { icon: 'skHexagonProfile', label: 'sk.hexagonProfile', enabled: hasDoc, run: () => hexagonProfile() },
  };
}

export const SKETCHER_MENU = {
  curves: ['sk:skCircle3', 'sk:skArcCenter', 'sk:skEllipse3', 'sk:skParabola', 'sk:skHyperbola', '-', 'sk:skRectCenter', 'sk:skOblong', 'sk:skArcSlot', '-', 'sk:skPolygon3', 'sk:skPolygon4', 'sk:skPolygon5', 'sk:skPolygon6', 'sk:skPolygon7', 'sk:skPolygon8', 'sk:hexagonProfile', '-', 'sk:skBSplineInterp', 'sk:skPeriodicBSpline', 'sk:skPeriodicInterp'],
  object: ['sk:new', 'sk:edit', 'sk:leave', '-', 'sk:map', 'sk:reorient', 'sk:merge', 'sk:mirror', 'sk:carbonCopy', '-', 'sk:projection', 'sk:intersection', '-', 'sk:viewSketch', 'sk:viewSection', 'sk:validate'],
  constraints: ['sk:dimension', 'sk:changeDimension', '-', 'sk:toggleActive', 'sk:toggleDriving', 'sk:switchVirtualSpace', '-', 'sk:removeAxesAlignment', 'sk:deleteAllConstraints'],
  select: ['sk:selectConstraints', 'sk:selectElements', 'sk:selectDofs', '-', 'sk:selectConflicting', 'sk:selectRedundant', 'sk:selectPartially', 'sk:selectMalformed', '-', 'sk:selectOrigin', 'sk:selectHAxis', 'sk:selectVAxis'],
  bspline: ['sk:toNurbs', 'sk:degreeUp', 'sk:degreeDown', '-', 'sk:knotUp', 'sk:knotDown', 'sk:insertKnot', '-', 'sk:joinCurves'],
  edit: ['sk:skSplit', 'sk:translate', 'sk:internalGeometry', 'sk:deleteAllGeometry', '-', 'sk:stop'],
  show: ['sk:arcOverlay', 'sk:bsplinePolygon', 'sk:bsplineComb', 'sk:bsplineDegree', 'sk:bsplineKnots', 'sk:bsplineWeights', '-', 'sk:renderOrder'],
};

export const SKETCHER_FREECAD = {
  Sketcher_ArcOverlay: 'sk:arcOverlay', Sketcher_BSplineComb: 'sk:bsplineComb', Sketcher_BSplineConvertToNURBS: 'sk:toNurbs',
  Sketcher_BSplineDecreaseDegree: 'sk:degreeDown', Sketcher_BSplineDecreaseKnotMultiplicity: 'sk:knotDown', Sketcher_BSplineDegree: 'sk:bsplineDegree',
  Sketcher_BSplineIncreaseDegree: 'sk:degreeUp', Sketcher_BSplineIncreaseKnotMultiplicity: 'sk:knotUp', Sketcher_BSplineInsertKnot: 'sk:insertKnot',
  Sketcher_BSplineKnotMultiplicity: 'sk:bsplineKnots', Sketcher_BSplinePoleWeight: 'sk:bsplineWeights', Sketcher_BSplinePolygon: 'sk:bsplinePolygon',
  Sketcher_CarbonCopy: 'sk:carbonCopy', Sketcher_ChangeDimensionConstraint: 'sk:changeDimension', Sketcher_ConstrainBlock: 'constrain:block',
  Sketcher_ConstrainSnellsLaw: 'constrain:snellsLaw', Sketcher_Create3PointCircle: 'sk:skCircle3', Sketcher_CreateArc: 'sk:skArcCenter',
  Sketcher_CreateArcOfHyperbola: 'sk:skHyperbola', Sketcher_CreateArcOfParabola: 'sk:skParabola', Sketcher_CreateArcSlot: 'sk:skArcSlot',
  Sketcher_CreateBSplineByInterpolation: 'sk:skBSplineInterp', Sketcher_CreateEllipseBy3Points: 'sk:skEllipse3', Sketcher_CreateHeptagon: 'sk:skPolygon7',
  Sketcher_CreateHexagon: 'sk:skPolygon6', Sketcher_CreateOblong: 'sk:skOblong', Sketcher_CreateOctagon: 'sk:skPolygon8', Sketcher_CreatePentagon: 'sk:skPolygon5',
  Sketcher_CreatePeriodicBSpline: 'sk:skPeriodicBSpline', Sketcher_CreatePeriodicBSplineByInterpolation: 'sk:skPeriodicInterp', Sketcher_CreateRectangle_Center: 'sk:skRectCenter',
  Sketcher_CreateSquare: 'sk:skPolygon4', Sketcher_CreateTriangle: 'sk:skPolygon3', Sketcher_DeleteAllConstraints: 'sk:deleteAllConstraints',
  Sketcher_DeleteAllGeometry: 'sk:deleteAllGeometry', Sketcher_Dimension: 'sk:dimension', Sketcher_EditSketch: 'sk:edit', Sketcher_Intersection: 'sk:intersection',
  Sketcher_JoinCurves: 'sk:joinCurves', Sketcher_LeaveSketch: 'sk:leave', Sketcher_MapSketch: 'sk:map', Sketcher_MergeSketches: 'sk:merge', Sketcher_MirrorSketch: 'sk:mirror',
  Sketcher_NewSketch: 'sk:new', Sketcher_ProfilesHexagon1: 'sk:hexagonProfile', Sketcher_Projection: 'sk:projection', Sketcher_RemoveAxesAlignment: 'sk:removeAxesAlignment',
  Sketcher_RenderingOrder: 'sk:renderOrder', Sketcher_ReorientSketch: 'sk:reorient', Sketcher_RestoreInternalAlignmentGeometry: 'sk:internalGeometry',
  Sketcher_SelectConflictingConstraints: 'sk:selectConflicting', Sketcher_SelectConstraints: 'sk:selectConstraints', Sketcher_SelectElementsAssociatedWithConstraints: 'sk:selectElements',
  Sketcher_SelectElementsWithDoFs: 'sk:selectDofs', Sketcher_SelectHorizontalAxis: 'sk:selectHAxis', Sketcher_SelectMalformedConstraints: 'sk:selectMalformed',
  Sketcher_SelectOrigin: 'sk:selectOrigin', Sketcher_SelectPartiallyRedundantConstraints: 'sk:selectPartially', Sketcher_SelectRedundantConstraints: 'sk:selectRedundant',
  Sketcher_SelectVerticalAxis: 'sk:selectVAxis', Sketcher_Split: 'sk:skSplit', Sketcher_StopOperation: 'sk:stop', Sketcher_SwitchVirtualSpace: 'sk:switchVirtualSpace',
  Sketcher_ToggleActiveConstraint: 'sk:toggleActive', Sketcher_ToggleDrivingConstraint: 'sk:toggleDriving', Sketcher_Translate: 'sk:translate',
  Sketcher_ValidateSketch: 'sk:validate', Sketcher_ViewSection: 'sk:viewSection', Sketcher_ViewSketch: 'sk:viewSketch',
};
