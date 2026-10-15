// FreeCAD's Draft commands MyCAD did not have yet: groups and layers for the
// selection, styles (current style, annotation styles), auto-group, upgrade /
// downgrade, join, Draft ↔ Sketch, stretch, Bézier curves, path and point
// arrays (copies or links), flipping dimensions, healing, slope, wire ↔
// B-spline, text outlines (ShapeString), working-plane proxies, the layer
// manager, the snap toolbar and every Draft snap, sub-element highlighting and
// per-object wireframe.
import './draft-icons.js';
import { createEntity, entityBox, normalizeEntity, transformEntity } from '../domain/entities.js';
import { addEntity } from '../domain/drawing.js';
import { addConstraint } from '../domain/constraints.js';
import {
  arrayPoints, bezierFromPoints, flipDimension, joinPaths, loopArea, pathPoints, placesAlong, slopePath, stretchEntity, traceOutlines,
} from '../domain/draft.js';
import { interpolate, knotInfo, nurbsPoint, nurbsRange, splineData, toNurbs, validateSketch } from '../domain/sketch.js';
import { SNAP_MODES } from '../domain/settings.js';
import { PolylineTool, Tool, TOOL_ICONS, registerTool } from '../view/tools.js';

const SNAP_ICON = { endpoint: 'snapEndpoint', midpoint: 'snapMidpoint', center: 'snapCenter', quadrant: 'snapQuadrant', intersection: 'snapIntersection', nearest: 'snapNearest', perpendicular: 'snapPerpendicular', parallel: 'snapParallel', extension: 'snapExtension', angle: 'snapAngle', special: 'snapSpecial' };

// ───────────────────────── tools

/** Draft_BezCurve / Draft_CubicBezCurve: control points clicked, Enter to finish. */
class BezierTool extends PolylineTool {
  constructor(id, api, degreeOf) {
    super(id, api);
    this.degreeOf = degreeOf;
  }

  build(points) { return points.length >= 2 ? bezierFromPoints(points, this.degreeOf(points.length)) : null; }

  complete() {
    const s = this.build(this.points);
    if (s) this.api.add('spline', splineData(s), 'op.spline');
    this.points = [];
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const s = this.build([...this.points, cursor]);
    const layer = this.api.drawing().activeLayer;
    return { previews: s ? [createEntity('spline', { ...splineData(s), layer })] : [], previewPrims: [{ kind: 'poly', points: [...this.points, cursor], closed: false }] };
  }

  prompt() { return `prompt.${this.id}.${this.points.length ? 1 : 0}`; }
}

/** Draft_Stretch: a window, then a base point and where it goes; points inside the window move. */
class StretchTool extends Tool {
  box() {
    const [a, b] = this.points;
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  }

  targets() {
    const d = this.api.drawing();
    const picked = new Set(this.api.selection());
    return d.entities.filter((e) => (picked.size ? picked.has(e.id) : true) && e.type !== 'solid' && !e.hidden);
  }

  stretched(to) {
    const box = this.box();
    const [, , base] = this.points;
    return this.targets().map((e) => ({ e, out: stretchEntity(e, box, to.x - base.x, to.y - base.y) })).filter((x) => x.out);
  }

  click(p) {
    this.points.push(p);
    if (this.points.length < 4) return;
    const list = this.stretched(p);
    this.api.change('draft.op.stretch', (d) => {
      for (const { e, out } of list) {
        if (out.type === e.type) d.entities = d.entities.map((x) => (x.id === e.id ? normalizeEntity({ ...out.data, id: e.id, type: out.type }) ?? x : x));
        else { d.entities = d.entities.filter((x) => x.id !== e.id); addEntity(d, out.type, out.data); }
      }
    });
    this.api.notify('success', 'draft.stretched', { count: list.length });
    this.points = [];
  }

  preview(cursor) {
    if (!this.points.length) return {};
    if (this.points.length === 1) {
      const a = this.points[0];
      return { previewPrims: [{ kind: 'poly', points: [a, { x: cursor.x, y: a.y }, cursor, { x: a.x, y: cursor.y }], closed: true }] };
    }
    const box = this.box();
    const frame = { kind: 'poly', points: [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }], closed: true };
    if (this.points.length === 2) return { previewPrims: [frame] };
    const layer = this.api.drawing().activeLayer;
    const previews = [];
    for (const { out } of this.stretched(cursor)) { try { previews.push(createEntity(out.type, { layer, ...out.data })); } catch { /* skip */ } }
    return { previews, previewPrims: [frame, { kind: 'line', a: this.points[2], b: cursor }] };
  }

  prompt() { return `prompt.draftStretch.${Math.min(this.points.length, 3)}`; }
}

registerTool('draftBezCurve', (api) => new BezierTool('draftBezCurve', api, (n) => n - 1));
registerTool('draftCubicBez', (api) => new BezierTool('draftCubicBez', api, () => 3));
registerTool('draftStretch', (api) => new StretchTool('draftStretch', api));
Object.assign(TOOL_ICONS, { draftBezCurve: 'draftBezCurve', draftCubicBez: 'draftCubicBez', draftStretch: 'draftStretch' });

export function draftCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const selected = () => app.selectedEntities();
  const hasSel = () => selected().length > 0;
  const groups = () => drawing()?.groups ?? [];
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];

  // ── groups and layers

  function newGroupWith(name, ids, extra = {}) {
    const group = { id: app.newId(), name, parent: null, ...extra };
    app.change('draft.op.group', (d) => {
      d.groups = [...(d.groups ?? []), group];
      for (const id of ids) app.D.updateEntity(d, id, { group: group.id });
    });
    app.showTree();
    return group;
  }

  async function chooseGroup(titleKey, icon, { none = false } = {}) {
    const list = groups().filter((g) => !g.sketch);
    if (!list.length && !none) { app.notify('info', t('draft.noGroup')); return undefined; }
    const options = [...(none ? [['', t('draft.noAutoGroup')]] : []), ...list.map((g) => [g.id, g.name])];
    const answer = await app.form({ title: t(titleKey), icon, width: 460, fields: [{ key: 'group', type: 'select', label: t('draft.group'), icon: 'group', value: (none ? state.autoGroup : null) ?? options[0][0], options }], actions: ok() });
    return answer?.action === 'ok' ? answer.values.group : undefined;
  }

  function addConstruction() {
    const ids = app.selectedIds();
    const existing = groups().find((g) => g.construction);
    if (existing) app.change('draft.op.group', (d) => { for (const id of ids) app.D.updateEntity(d, id, { group: existing.id, construction: true }); });
    else {
      const group = newGroupWith(t('draft.constructionGroup'), ids, { construction: true });
      app.change('draft.op.group', (d) => { for (const id of ids) app.D.updateEntity(d, id, { construction: true, group: group.id }); });
    }
    app.notify('success', t('draft.addedToConstruction', { count: ids.length }));
  }

  async function addToLayer() {
    const layers = drawing().layers;
    const answer = await app.form({ title: t('draft.addToLayer'), icon: 'draftAddToLayer', width: 460, fields: [{ key: 'layer', type: 'select', label: t('draft.layer'), icon: 'layers', value: drawing().activeLayer, options: layers.map((l) => [l.id, l.name]) }], actions: ok() });
    if (answer?.action !== 'ok') return;
    const ids = app.selectedIds();
    app.change('draft.op.layer', (d) => { for (const id of ids) app.D.updateEntity(d, id, { layer: answer.values.layer }); });
    app.notify('success', t('draft.movedToLayer', { count: ids.length }));
  }

  async function layerManager() {
    const layers = drawing().layers;
    const fields = layers.flatMap((l, i) => [
      { key: `name${i}`, type: 'text', label: t('draft.layerN', { n: i + 1 }), icon: 'layers', value: l.name },
      { key: `color${i}`, type: 'color', label: t('draft.color'), icon: 'palette', value: l.color ?? '#ffffff' },
      { key: `visible${i}`, type: 'check', label: t('draft.visible'), icon: 'eye', value: l.visible !== false },
      { key: `locked${i}`, type: 'check', label: t('draft.locked'), icon: 'lock', value: Boolean(l.locked) },
    ]);
    const answer = await app.form({ title: t('draft.layerManager'), icon: 'draftLayerManager', width: 520, fields, actions: ok() });
    if (answer?.action !== 'ok') return;
    const v = answer.values;
    app.change('draft.op.layers', (d) => {
      d.layers = d.layers.map((l, i) => ({ ...l, name: String(v[`name${i}`] ?? l.name).trim() || l.name, color: v[`color${i}`] ?? l.color, visible: Boolean(v[`visible${i}`]), locked: Boolean(v[`locked${i}`]) }));
    });
  }

  // ── styles

  const styleOf = () => state.settings.draftStyle ?? { color: null, lineWidth: null, lineType: null, textHeight: state.settings.textHeight };

  async function setStyle() {
    const s = styleOf();
    const answer = await app.form({ title: t('draft.setStyle'), icon: 'draftSetStyle', width: 480, fields: [
      { key: 'useColor', type: 'check', label: t('draft.useColor'), icon: 'palette', value: Boolean(s.color) },
      { key: 'color', type: 'color', label: t('draft.color'), icon: 'palette', value: s.color ?? '#ffcc00' },
      { key: 'lineWidth', type: 'select', label: t('draft.lineWidth'), icon: 'line', value: String(s.lineWidth ?? ''), options: [['', t('draft.byLayer')], ...[0.13, 0.25, 0.35, 0.5, 0.7, 1].map((w) => [String(w), `${w} mm`])] },
      { key: 'lineType', type: 'select', label: t('draft.lineType'), icon: 'line', value: s.lineType ?? '', options: [['', t('draft.byLayer')], ...['continuous', 'dashed', 'center', 'hidden', 'phantom', 'dotted'].map((k) => [k, t(`lineType.${k}`)])] },
      { key: 'textHeight', type: 'number', label: t('draft.textHeight'), icon: 'text', value: s.textHeight ?? 3.5, min: 0.1, step: 0.5, unit: 'mm' },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const v = answer.values;
    app.updateSettings({ draftStyle: { color: v.useColor ? v.color : null, lineWidth: v.lineWidth ? Number(v.lineWidth) : null, lineType: v.lineType || null, textHeight: v.textHeight } });
  }

  function applyStyle() {
    const s = styleOf();
    const list = selected();
    app.change('draft.op.style', (d) => {
      for (const e of list) {
        const patch = { color: s.color, lineWidth: s.lineWidth, lineType: s.lineType };
        if ((e.type === 'text' || e.type === 'dim' || e.type === 'leader') && s.textHeight) patch.size = s.textHeight;
        app.D.updateEntity(d, e.id, patch);
      }
    });
    app.notify('success', t('draft.styled', { count: list.length }));
  }

  async function annotationStyles() {
    const styles = drawing().annotationStyles ?? [];
    let picked = '';
    const answer = await app.form({ title: t('draft.annotationStyles'), icon: 'draftAnnotationStyles', width: 520, intro: t('draft.annotationIntro', { count: styles.length }), fields: [
      { key: 'pick', type: 'select', label: t('draft.style'), icon: 'draftAnnotationStyles', value: '', options: [['', t('draft.newStyle')], ...styles.map((s, i) => [String(i), s.name])] },
      { key: 'name', type: 'text', label: t('draft.styleName'), icon: 'text', value: styles[0]?.name ?? t('draft.styleN', { n: styles.length + 1 }) },
      { key: 'textHeight', type: 'number', label: t('draft.textHeight'), icon: 'text', value: styles[0]?.textHeight ?? 3.5, min: 0.1, step: 0.5, unit: 'mm' },
      { key: 'precision', type: 'number', label: t('settings.dimPrecision'), icon: 'dimension', value: styles[0]?.precision ?? 2, min: 0, max: 6, step: 1 },
      { key: 'color', type: 'color', label: t('draft.color'), icon: 'palette', value: styles[0]?.color ?? '#ffffff' },
    ], live: true, actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete') }, { id: 'apply', label: t('draft.applyToSelection') }, { id: 'ok', label: t('draft.saveStyle'), primary: true }] }, {
      // Picking a saved style puts its values in the fields.
      onChange: ({ values }) => {
        if (values.pick === picked) return;
        picked = values.pick;
        const s = values.pick === '' ? null : styles[Number(values.pick)];
        if (s) for (const [key, value] of Object.entries({ name: s.name, textHeight: s.textHeight, precision: s.precision, color: s.color ?? '#ffffff' })) app.popups.post('form', { type: 'form:set', key, value });
      },
    });
    if (!answer || answer.action === 'cancel') return;
    const v = answer.values;
    const style = { name: String(v.name || t('draft.styleN', { n: styles.length + 1 })).trim(), textHeight: v.textHeight, precision: Math.round(v.precision), color: v.color };
    const index = v.pick === '' ? -1 : Number(v.pick);
    if (answer.action === 'delete') { if (index >= 0) app.change('draft.op.annotation', (d) => { d.annotationStyles = styles.filter((_, i) => i !== index); }); return; }
    if (answer.action === 'apply') {
      const list = selected().filter((e) => ['text', 'dim', 'leader'].includes(e.type));
      app.change('draft.op.annotation', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { size: style.textHeight, color: style.color, ...(e.type === 'dim' ? { precision: style.precision } : {}) }); });
      app.notify('success', t('draft.styled', { count: list.length }));
      return;
    }
    app.change('draft.op.annotation', (d) => { d.annotationStyles = index >= 0 ? styles.map((s, i) => (i === index ? style : s)) : [...styles, style]; });
  }

  // ── upgrade, downgrade, join

  /** Lines and polylines that meet end to end become one polyline each. */
  function joinWires(label) {
    const wires = selected().filter((e) => e.type === 'line' || (e.type === 'polyline' && !e.closed));
    if (wires.length < 2) return 0;
    const joined = joinPaths(wires.map((e) => pathPoints(e).points));
    if (joined.length >= wires.length) return 0;
    const made = app.change(label, (d) => {
      d.entities = d.entities.filter((e) => !wires.some((w) => w.id === e.id));
      return joined.map((j) => addEntity(d, 'polyline', { points: j.points, closed: j.closed, layer: wires[0].layer, group: wires[0].group }));
    });
    app.select(made.map((e) => e.id));
    return wires.length - joined.length;
  }

  function upgrade() {
    const list = selected();
    const solids = list.filter((e) => e.type === 'solid');
    if (solids.length >= 2) { app.run('bool:union'); return 'union'; }
    if (joinWires('draft.op.upgrade')) { app.notify('success', t('draft.upgradedWire')); return 'wire'; }
    const closed = list.filter((e) => ['rect', 'polygon', 'circle', 'ellipse'].includes(e.type) || (e.type === 'polyline' && e.closed) || (e.type === 'spline' && e.closed));
    if (closed.length) { app.makeFaceFromWires(); return 'face'; }
    app.notify('info', t('draft.nothingToUpgrade'));
    return null;
  }

  function downgrade() {
    if (app.commandEnabled('explode')) { app.run('explode'); app.notify('success', t('draft.downgraded')); return 'explode'; }
    app.notify('info', t('draft.nothingToDowngrade'));
    return null;
  }

  /** Draft_Draft2Sketch: plain 2D into a new sketch (ends that meet get coincident constraints), or a sketch's geometry back to plain 2D. */
  function toSketch() {
    const list = selected().filter((e) => e.type !== 'solid');
    const sketchIds = new Set(groups().filter((g) => g.sketch).map((g) => g.id));
    if (list.length && list.every((e) => sketchIds.has(e.group))) {
      app.change('draft.op.toSketch', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { group: null }); });
      app.notify('success', t('draft.fromSketch', { count: list.length }));
      return 'draft';
    }
    const sketch = { id: app.newId(), name: t('draft.sketchFromDraft'), parent: null, sketch: true, frame: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } };
    app.change('draft.op.toSketch', (d) => {
      d.groups = [...(d.groups ?? []), sketch];
      for (const e of list) app.D.updateEntity(d, e.id, { group: sketch.id });
      const found = validateSketch({ ...d, entities: d.entities.filter((e) => e.group === sketch.id) });
      for (const pair of found.missing) addConstraint(d, 'coincident', pair);
    });
    app.showTree();
    app.notify('success', t('draft.toSketchDone', { count: list.length }));
    return 'sketch';
  }

  // ── arrays

  /** Copies (or links) of `sources` placed at `places` ({ x, y, angle }), carried from `base`. */
  function placeCopies(label, sources, base, places, { link = false } = {}) {
    return app.change(label, (d) => {
      const made = [];
      for (const place of places) {
        const angle = place.angle ?? 0;
        for (const s of sources) {
          if (link) {
            const raw = { ...structuredClone(s), id: undefined, clone: { of: s.clone?.of ?? s.id, cx: base.x, cy: base.y, dx: place.x - base.x, dy: place.y - base.y, angle, scale: 1, flip: false } };
            delete raw.id;
            const entity = normalizeEntity(raw);
            if (entity) { d.entities.push(entity); made.push(entity); }
          } else {
            let e = transformEntity(s, { type: 'move', dx: place.x - base.x, dy: place.y - base.y });
            if (angle) e = transformEntity(e, { type: 'rotate', cx: place.x, cy: place.y, angle });
            const { id: _id, ...data } = e;
            made.push(addEntity(d, e.type, data));
          }
        }
      }
      if (link) app.D.syncDrawingClones(d);
      return made;
    });
  }

  const centerOf = (list) => {
    const boxes = list.map((e) => entityBox(e)).filter(Boolean);
    if (!boxes.length) return { x: 0, y: 0 };
    return { x: (Math.min(...boxes.map((b) => b.minX)) + Math.max(...boxes.map((b) => b.maxX))) / 2, y: (Math.min(...boxes.map((b) => b.minY)) + Math.max(...boxes.map((b) => b.maxY))) / 2 };
  };

  async function pathArray({ link = false, twisted = false } = {}) {
    const ordered = app.selectedIds().map((id) => drawing().entities.find((e) => e.id === id)).filter(Boolean);
    const pathEntity = [...ordered].reverse().find((e) => pathPoints(e));
    const sources = ordered.filter((e) => e !== pathEntity);
    if (!pathEntity || !sources.length) { app.notify('info', t('draft.pickPathArray')); return null; }
    const answer = await app.form({ title: t(twisted ? 'draft.pathTwistedArray' : 'draft.pathArray'), icon: twisted ? 'draftPathTwisted' : link ? 'draftPathLinkArray' : 'draftPathArray', width: 480, fields: [
      { key: 'count', type: 'number', label: t('pd.count'), icon: 'draftPathArray', value: 5, min: 1, max: 1000, step: 1 },
      { key: 'align', type: 'check', label: t('draft.align'), icon: 'rotate', value: true },
      ...(twisted ? [{ key: 'twist', type: 'number', label: t('draft.twist'), icon: 'rotate', value: 15, step: 5, unit: '°' }] : []),
    ], actions: ok() });
    if (answer?.action !== 'ok') return null;
    const v = answer.values;
    const base = centerOf(sources);
    const places = placesAlong(pathPoints(pathEntity), Math.round(v.count)).map((p, k) => ({ x: p.x, y: p.y, angle: (v.align ? p.angle : 0) + (twisted ? (v.twist ?? 0) * k : 0) }));
    const made = placeCopies('draft.op.pathArray', sources, base, places, { link });
    app.notify('success', t('draft.arrayMade', { count: made?.length ?? 0 }));
    return made;
  }

  async function pointArray({ link = false } = {}) {
    const ordered = app.selectedIds().map((id) => drawing().entities.find((e) => e.id === id)).filter(Boolean);
    // The points: point objects, or the last selected path's vertices.
    const pointObjs = ordered.filter((e) => e.type === 'point');
    const holder = pointObjs.length ? pointObjs : [ordered[ordered.length - 1]];
    const sources = ordered.filter((e) => !holder.includes(e));
    const places = arrayPoints(holder);
    if (!sources.length || !places.length) { app.notify('info', t('draft.pickPointArray')); return null; }
    const made = placeCopies('draft.op.pointArray', sources, centerOf(sources), places, { link });
    app.notify('success', t('draft.arrayMade', { count: made?.length ?? 0 }));
    return made;
  }

  // ── fixes and conversions

  function heal() {
    let fixed = 0;
    app.change('draft.op.heal', (d) => {
      const ids = new Set(d.entities.map((e) => e.id));
      d.entities = d.entities.flatMap((e) => {
        const again = normalizeEntity(e);
        if (!again) { fixed++; return []; }
        // A clone whose source is gone becomes an ordinary object.
        if (again.clone && !again.clone.external && !ids.has(again.clone.of)) { delete again.clone; fixed++; }
        if (again.type === 'line' && Math.hypot(again.x2 - again.x1, again.y2 - again.y1) < 1e-9) { fixed++; return []; }
        if (again.group && !(d.groups ?? []).some((g) => g.id === again.group)) { delete again.group; fixed++; }
        return [again];
      });
    });
    app.notify('success', t('draft.healed', { count: fixed }));
    return fixed;
  }

  function wireToBSpline() {
    const list = selected().filter((e) => e.type === 'polyline' || e.type === 'spline');
    if (!list.length) { app.notify('info', t('draft.pickWireOrSpline')); return; }
    const made = app.change('draft.op.wireToBSpline', (d) => list.map((e) => {
      const keep = { layer: e.layer, color: e.color, lineType: e.lineType, lineWidth: e.lineWidth, group: e.group };
      d.entities = d.entities.filter((x) => x.id !== e.id);
      if (e.type === 'polyline') {
        const pts = e.closed ? [...e.points, e.points[0]] : e.points;
        return addEntity(d, 'spline', { ...keep, ...splineData(interpolate(pts, 3)) });
      }
      // A B-spline: the points it passes through at its knots, as a wire.
      const s = toNurbs(e);
      const [a, b] = nurbsRange(s);
      const pts = [a, ...knotInfo(s).map((k) => k.u), b].map((u) => nurbsPoint(s, u));
      const closed = e.closed && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9;
      return addEntity(d, 'polyline', { ...keep, points: closed ? pts.slice(0, -1) : pts, closed });
    }));
    app.select(made.map((e) => e.id));
  }

  async function slope() {
    const list = selected().filter((e) => e.type === 'line' || e.type === 'polyline');
    if (!list.length) { app.notify('info', t('draft.pickWire')); return; }
    const answer = await app.form({ title: t('draft.slope'), icon: 'draftSlope', width: 440, fields: [
      { key: 'percent', type: 'number', label: t('draft.slopePercent'), icon: 'draftSlope', value: 10, step: 1, unit: '%' },
      { key: 'z0', type: 'number', label: t('draft.startHeight'), icon: 'move', value: 0, step: 1, unit: 'mm' },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const made = app.change('draft.op.slope', (d) => list.map((e) => {
      const path = pathPoints(e);
      d.entities = d.entities.filter((x) => x.id !== e.id);
      return addEntity(d, 'solid', { kind: 'wire3d', name: t('draft.slopedWire'), params: {}, shape: { paths: [slopePath(path.points, answer.values.percent, answer.values.z0)] }, layer: e.layer, group: e.group });
    }));
    app.select(made.map((e) => e.id));
    app.notify('success', t('draft.sloped', { count: made.length }));
  }

  async function shapeString() {
    const answer = await app.form({ title: t('draft.shapeString'), icon: 'draftShapeString', width: 500, fields: [
      { key: 'text', type: 'text', label: t('draft.string'), icon: 'text', value: 'MyCAD' },
      { key: 'size', type: 'number', label: t('draft.textHeight'), icon: 'text', value: 10, min: 0.1, step: 1, unit: 'mm' },
      { key: 'x', type: 'number', label: 'X', icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      { key: 'y', type: 'number', label: 'Y', icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      { key: 'bold', type: 'check', label: t('draft.bold'), icon: 'text', value: false },
    ], actions: ok() });
    if (answer?.action !== 'ok' || !String(answer.values.text ?? '').trim()) return null;
    return makeShapeString(answer.values);
  }

  /** The outline of a text in the drawing's font, traced from its picture at 160 px per em. */
  function makeShapeString({ text, size, x = 0, y = 0, bold = false }) {
    const em = 160;
    const family = state.settings.fontFamily ? `"${state.settings.fontFamily}", ` : '';
    const font = `${bold ? 700 : 400} ${em}px ${family}"Segoe UI", "Malgun Gothic", Arial, sans-serif`;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const w = Math.ceil(measure.measureText(text).width) + 20;
    const h = Math.ceil(em * 1.4) + 20;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = font;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    const baseline = 10 + em;
    ctx.fillText(text, 10, baseline);
    const data = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    const loops = traceOutlines(alpha, w, h, { tolerance: 0.6 });
    const k = size / em;
    // Picture (y down, baseline at `baseline`) → drawing (y up, baseline at y).
    const world = loops.map((loop) => loop.map((p) => ({ x: x + (p.x - 10) * k, y: y + (baseline - p.y) * k })));
    const group = { id: app.newId(), name: `${t('draft.textOutline')}: ${text}`, parent: null };
    const made = app.change('draft.op.shapeString', (d) => {
      d.groups = [...(d.groups ?? []), group];
      return world.map((points) => addEntity(d, 'polyline', { points: loopArea(points) < 0 ? points.slice().reverse() : points, closed: true, group: group.id }));
    });
    app.select(made.map((e) => e.id));
    app.notify('success', t('draft.shapeStringMade', { count: made.length }));
    return made;
  }

  async function wpProxy() {
    const proxies = drawing().wpProxies ?? [];
    const answer = await app.form({ title: t('draft.wpProxy'), icon: 'draftWpProxy', width: 480, fields: [
      { key: 'name', type: 'text', label: t('draft.proxyName'), icon: 'draftWpProxy', value: t('draft.proxyN', { n: proxies.length + 1 }) },
      { key: 'restore', type: 'select', label: t('draft.restoreProxy'), icon: 'workPlane', value: '', options: [['', '—'], ...proxies.map((p, i) => [String(i), p.name])] },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'restore', label: t('draft.restore') }, { id: 'ok', label: t('draft.saveProxy'), primary: true }] });
    if (!answer || answer.action === 'cancel') return;
    if (answer.action === 'restore') {
      const p = proxies[Number(answer.values.restore)];
      if (!p) return;
      app.change('draft.op.wpProxy', (d) => { if (p.workPlane) d.workPlane = structuredClone(p.workPlane); else delete d.workPlane; });
      if (p.camera && state.view3d) app.view3d.instance?.setCamera(p.camera);
      app.notify('success', t('draft.proxyRestored', { name: p.name }));
      return;
    }
    const proxy = { name: answer.values.name || t('draft.proxyN', { n: proxies.length + 1 }), workPlane: drawing().workPlane ? structuredClone(drawing().workPlane) : null, ...(state.view3d && app.view3d.instance ? { camera: app.view3d.instance.getCamera() } : {}) };
    app.change('draft.op.wpProxy', (d) => { d.wpProxies = [...proxies, proxy]; });
    app.notify('success', t('draft.proxySaved', { name: proxy.name }));
  }

  // ── snaps

  const snapMode = (mode) => ({
    icon: SNAP_ICON[mode], label: `snap.${mode}`, enabled: hasDoc,
    checked: () => Boolean(state.settings.snapModes?.[mode]),
    run: () => app.updateSettings({ snapModes: { ...state.settings.snapModes, [mode]: !state.settings.snapModes?.[mode] }, ...(state.settings.snapModes?.[mode] ? {} : { snapObject: true }) }),
  });
  const settingToggle = (key, icon, label) => ({ icon, label, enabled: hasDoc, checked: () => state.settings[key] !== false, run: () => app.updateSettings({ [key]: state.settings[key] === false }) });

  return {
    'tool:draftBezCurve': { icon: 'draftBezCurve', label: 'tool.draftBezCurve', enabled: hasDoc, run: () => app.setTool('draftBezCurve') },
    'tool:draftCubicBez': { icon: 'draftCubicBez', label: 'tool.draftCubicBez', enabled: hasDoc, run: () => app.setTool('draftCubicBez') },
    'tool:draftStretch': { icon: 'draftStretch', label: 'tool.draftStretch', enabled: hasDoc, run: () => app.setTool('draftStretch') },
    'draft:addConstruction': { icon: 'draftConstruction', label: 'draft.addConstruction', enabled: hasSel, run: () => addConstruction() },
    'draft:addNamedGroup': { icon: 'draftNamedGroup', label: 'draft.addNamedGroup', enabled: hasSel, run: async () => {
      const answer = await app.form({ title: t('draft.addNamedGroup'), icon: 'draftNamedGroup', width: 440, fields: [{ key: 'name', type: 'text', label: t('draft.groupName'), icon: 'group', value: t('draft.groupN', { n: groups().length + 1 }) }], actions: ok() });
      if (answer?.action === 'ok') newGroupWith(answer.values.name || t('draft.groupN', { n: groups().length + 1 }), app.selectedIds());
    } },
    'draft:addToGroup': { icon: 'draftAddToGroup', label: 'draft.addToGroup', enabled: () => hasSel() && groups().some((g) => !g.sketch), run: async () => { const id = await chooseGroup('draft.addToGroup', 'draftAddToGroup'); if (id) app.moveToGroup(app.selectedIds(), id); } },
    'draft:addToLayer': { icon: 'draftAddToLayer', label: 'draft.addToLayer', enabled: hasSel, run: () => addToLayer() },
    'draft:layerManager': { icon: 'draftLayerManager', label: 'draft.layerManager', enabled: hasDoc, run: () => layerManager() },
    'draft:annotationStyles': { icon: 'draftAnnotationStyles', label: 'draft.annotationStyles', enabled: hasDoc, run: () => annotationStyles() },
    'draft:setStyle': { icon: 'draftSetStyle', label: 'draft.setStyle', enabled: hasDoc, run: () => setStyle() },
    'draft:applyStyle': { icon: 'draftApplyStyle', label: 'draft.applyStyle', enabled: hasSel, run: () => applyStyle() },
    'draft:autoGroup': { icon: 'draftAutoGroup', label: 'draft.autoGroup', enabled: hasDoc, checked: () => Boolean(state.autoGroup), run: async () => { const id = await chooseGroup('draft.autoGroup', 'draftAutoGroup', { none: true }); if (id !== undefined) { state.autoGroup = id || null; app.notify('info', id ? t('draft.autoGroupOn', { name: groups().find((g) => g.id === id)?.name ?? '' }) : t('draft.autoGroupOff')); } } },
    'draft:selectGroup': { icon: 'draftSelectGroup', label: 'draft.selectGroup', enabled: () => selected().some((e) => e.group), run: () => { const ids = new Set(selected().map((e) => e.group).filter(Boolean)); app.select(drawing().entities.filter((e) => ids.has(e.group)).map((e) => e.id)); } },
    'draft:upgrade': { icon: 'draftUpgrade', label: 'draft.upgrade', enabled: hasSel, run: () => upgrade() },
    'draft:downgrade': { icon: 'draftDowngrade', label: 'draft.downgrade', enabled: hasSel, run: () => downgrade() },
    'draft:join': { icon: 'draftJoin', label: 'draft.join', enabled: () => selected().filter((e) => e.type === 'line' || e.type === 'polyline').length >= 2, run: () => { const n = joinWires('draft.op.join'); app.notify(n ? 'success' : 'info', t(n ? 'draft.joined' : 'draft.notJoined', { count: n })); } },
    'draft:toSketch': { icon: 'draftToSketch', label: 'draft.toSketch', enabled: hasSel, run: () => toSketch() },
    'draft:flipDimension': { icon: 'draftFlipDimension', label: 'draft.flipDimension', enabled: () => selected().some((e) => e.type === 'dim'), run: () => { const list = selected().filter((e) => e.type === 'dim'); app.change('draft.op.flip', (d) => { d.entities = d.entities.map((e) => (list.some((x) => x.id === e.id) ? flipDimension(e) ?? e : e)); }); } },
    'draft:heal': { icon: 'draftHeal', label: 'draft.heal', enabled: hasDoc, run: () => heal() },
    'draft:pathArray': { icon: 'draftPathArray', label: 'draft.pathArray', enabled: () => selected().length >= 2, run: () => pathArray() },
    'draft:pathLinkArray': { icon: 'draftPathLinkArray', label: 'draft.pathLinkArray', enabled: () => selected().length >= 2, run: () => pathArray({ link: true }) },
    'draft:pathTwistedArray': { icon: 'draftPathTwisted', label: 'draft.pathTwistedArray', enabled: () => selected().length >= 2, run: () => pathArray({ twisted: true }) },
    'draft:pathTwistedLinkArray': { icon: 'draftPathTwisted', label: 'draft.pathTwistedLinkArray', enabled: () => selected().length >= 2, run: () => pathArray({ twisted: true, link: true }) },
    'draft:pointArray': { icon: 'draftPointArray', label: 'draft.pointArray', enabled: () => selected().length >= 2, run: () => pointArray() },
    'draft:pointLinkArray': { icon: 'draftPointArray', label: 'draft.pointLinkArray', enabled: () => selected().length >= 2, run: () => pointArray({ link: true }) },
    'draft:wireToBSpline': { icon: 'draftWireToBSpline', label: 'draft.wireToBSpline', enabled: () => selected().some((e) => e.type === 'polyline' || e.type === 'spline'), run: () => wireToBSpline() },
    'draft:slope': { icon: 'draftSlope', label: 'draft.slope', enabled: () => selected().some((e) => e.type === 'line' || e.type === 'polyline'), run: () => slope() },
    'draft:shapeString': { icon: 'draftShapeString', label: 'draft.shapeString', enabled: hasDoc, run: () => shapeString() },
    'draft:wpProxy': { icon: 'draftWpProxy', label: 'draft.wpProxy', enabled: hasDoc, run: () => wpProxy() },
    'draft:subelementHighlight': { icon: 'draftSubelements', label: 'draft.subelementHighlight', enabled: hasDoc, checked: () => Boolean(state.settings.subelementHighlight), run: () => { app.updateSettings({ subelementHighlight: !state.settings.subelementHighlight }); app.repaint(); } },
    'draft:wireframe': { icon: 'draftWireframe', label: 'draft.wireframe', enabled: () => selected().some((e) => e.type === 'solid'), run: () => { const list = selected().filter((e) => e.type === 'solid'); const on = !list.every((e) => e.wireframe); app.change('draft.op.wireframe', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { wireframe: on || undefined }); }); } },
    'draft:snapBar': { icon: 'draftSnapBar', label: 'draft.snapBar', enabled: hasDoc, run: () => app.showCommandMenu(['snap', '-', ...SNAP_MODES.map((m) => `snapMode:${m}`), '-', 'snapMode:workingPlane', 'snapMode:dimensions', '-', 'snapGrid', 'ortho'], null, 'draft.snapBar') },
    ...Object.fromEntries(SNAP_MODES.map((mode) => [`snapMode:${mode}`, snapMode(mode)])),
    'snapMode:workingPlane': settingToggle('snapWorkingPlane', 'snapWorkingPlane', 'snap.workingPlane'),
    'snapMode:dimensions': { icon: 'snapDimensions', label: 'snap.dimensions', enabled: hasDoc, checked: () => Boolean(state.settings.snapDimensions), run: () => app.updateSettings({ snapDimensions: !state.settings.snapDimensions }) },
  };
}

export const DRAFT_MENU = {
  draw: ['tool:draftBezCurve', 'tool:draftCubicBez', 'draft:shapeString'],
  modify: ['tool:draftStretch', 'draft:upgrade', 'draft:downgrade', 'draft:join', 'draft:wireToBSpline', 'draft:toSketch', 'draft:slope', 'draft:flipDimension', 'draft:heal'],
  arrays: ['draft:pathArray', 'draft:pathLinkArray', 'draft:pathTwistedArray', 'draft:pathTwistedLinkArray', '-', 'draft:pointArray', 'draft:pointLinkArray'],
  organize: ['draft:addNamedGroup', 'draft:addToGroup', 'draft:selectGroup', 'draft:autoGroup', 'draft:addConstruction', '-', 'draft:addToLayer', 'draft:layerManager', '-', 'draft:setStyle', 'draft:applyStyle', 'draft:annotationStyles', '-', 'draft:wpProxy'],
  snaps: ['draft:snapBar', '-', ...SNAP_MODES.map((m) => `snapMode:${m}`), '-', 'snapMode:workingPlane', 'snapMode:dimensions', '-', 'draft:subelementHighlight', 'draft:wireframe'],
};

export const DRAFT_FREECAD = {
  Draft_AddConstruction: 'draft:addConstruction', Draft_AddNamedGroup: 'draft:addNamedGroup', Draft_AddToGroup: 'draft:addToGroup', Draft_AddToLayer: 'draft:addToLayer',
  Draft_AnnotationStyleEditor: 'draft:annotationStyles', Draft_ApplyStyle: 'draft:applyStyle', Draft_Arc: 'sk:skArcCenter', Draft_AutoGroup: 'draft:autoGroup',
  Draft_BezCurve: 'tool:draftBezCurve', Draft_CubicBezCurve: 'tool:draftCubicBez', Draft_Downgrade: 'draft:downgrade', Draft_Draft2Sketch: 'draft:toSketch',
  Draft_Edit: 'editObject', Draft_Facebinder: 'part:elementCopy', Draft_FlipDimension: 'draft:flipDimension', Draft_Heal: 'draft:heal', Draft_Join: 'draft:join',
  Draft_LayerManager: 'draft:layerManager', Draft_PathArray: 'draft:pathArray', Draft_PathLinkArray: 'draft:pathLinkArray', Draft_PathTwistedArray: 'draft:pathTwistedArray',
  Draft_PathTwistedLinkArray: 'draft:pathTwistedLinkArray', Draft_PointArray: 'draft:pointArray', Draft_PointLinkArray: 'draft:pointLinkArray', Draft_SelectGroup: 'draft:selectGroup',
  Draft_SetStyle: 'draft:setStyle', Draft_ShapeString: 'draft:shapeString', Draft_ShowSnapBar: 'draft:snapBar', Draft_Slope: 'draft:slope',
  Draft_Snap_Angle: 'snapMode:angle', Draft_Snap_Center: 'snapMode:center', Draft_Snap_Dimensions: 'snapMode:dimensions', Draft_Snap_Endpoint: 'snapMode:endpoint',
  Draft_Snap_Extension: 'snapMode:extension', Draft_Snap_Intersection: 'snapMode:intersection', Draft_Snap_Midpoint: 'snapMode:midpoint', Draft_Snap_Near: 'snapMode:nearest',
  Draft_Snap_Parallel: 'snapMode:parallel', Draft_Snap_Perpendicular: 'snapMode:perpendicular', Draft_Snap_Special: 'snapMode:special', Draft_Snap_WorkingPlane: 'snapMode:workingPlane',
  Draft_Split: 'sk:skSplit', Draft_Stretch: 'tool:draftStretch', Draft_SubelementHighlight: 'draft:subelementHighlight', Draft_ToggleDisplayMode: 'draft:wireframe',
  Draft_Upgrade: 'draft:upgrade', Draft_WireToBSpline: 'draft:wireToBSpline', Draft_WorkingPlaneProxy: 'draft:wpProxy',
};
