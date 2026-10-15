// FreeCAD's TechDraw commands MyCAD did not have yet, on the 2D drawing as
// the page: views (active, broken, detail, draft, complex section, clip
// groups, frames, locking, stacking, moving, sharing, redrawing), cosmetic
// geometry (vertices, midpoints, quadrants, offsets, intersections, lines,
// circles, arcs, centrelines, threads, eraser), dimensions (chain,
// coordinate, chamfer, extent, axonometric, arc length, area, cascading,
// aligning, formats and prefixes, fits, repair), symbols (surface finish,
// weld, SVG), page templates and their fields, spreadsheet tables, line
// appearance and edge visibility.
import './techdraw-icons.js';
import { addEntity } from '../domain/drawing.js';
import { createEntity, entityBox, transformEntity } from '../domain/entities.js';
import { solidMesh } from '../domain/solids.js';
import { computeSheet } from '../domain/spreadsheet.js';
import { importDrawingBytes } from '../domain/import2d.js';
import { pathPoints } from '../domain/draft.js';
import { arcFromCenter, chainSegments, circleThrough, sectionSegments } from '../domain/sketch.js';
import { intersectCircles, intersectLines, intersectSegmentCircle } from '../domain/geometry.js';
import {
  PAGE_SIZES, alignDimensions, arcLength, boltCircle, brokenView, cascadeDimensions, centreLineBetween, chainDimensions, chamferDimension, circleCentreLines,
  detailView, directionView, extendLine, extentDimension, fitText, pageTemplate, regionArea, sheetTable, surfaceFinish, threadBottom, threadSide, vertexPoints, weldSymbol,
} from '../domain/techdraw.js';
import { Tool, TOOL_ICONS, registerTool } from '../view/tools.js';

// ───────────────────────── canvas tools (cosmetic geometry, symbols, areas)

const COSMETIC = { cosmetic: true, lineWidth: 0.18 };
/** A tool of fixed clicks making one entity (make(points, api) → [type, data] or null). */
class ClickTool extends Tool {
  constructor(id, api, count, make, op) { super(id, api); this.count = count; this.make = make; this.op = op; }
  click(p) {
    this.points.push(p);
    if (this.points.length < this.count) return;
    const made = this.make(this.points, this.api);
    this.points = [];
    if (!made) return;
    const list = Array.isArray(made[0]) ? made : [made];
    const added = this.api.change(this.op, (d) => list.map(([type, data]) => addEntity(d, type, data)));
    if (added?.length) this.api.select(added.map((e) => e.id));
  }

  preview(cursor) {
    if (!this.points.length) return {};
    const made = this.make([...this.points, cursor], this.api, true);
    if (!made) return { previewPrims: [{ kind: 'line', a: this.last, b: cursor }] };
    const list = Array.isArray(made[0]) ? made : [made];
    try { return { previews: list.map(([type, data]) => createEntity(type, { layer: this.api.drawing().activeLayer, ...data })) }; } catch { return {}; }
  }

  prompt() { return `prompt.${this.id}.${Math.min(this.points.length, this.count - 1)}`; }
}

let pending = {};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TOOLS = {
  tdCosVertex: [1, ([p]) => ['point', { x: p.x, y: p.y, ...COSMETIC }], 'td.op.cosmetic'],
  tdCosLine: [2, ([a, b]) => (dist(a, b) > 1e-9 ? ['line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...COSMETIC }] : null), 'td.op.cosmetic'],
  tdCosCircle: [2, ([c, p]) => (dist(c, p) > 1e-9 ? ['circle', { cx: c.x, cy: c.y, r: dist(c, p), ...COSMETIC }] : null), 'td.op.cosmetic'],
  tdCosCircle3: [3, ([a, b, c]) => { const k = c ? circleThrough(a, b, c) : null; return k ? ['circle', { ...k, ...COSMETIC }] : null; }, 'td.op.cosmetic'],
  tdCosArc: [3, ([c, s, e]) => { const k = e ? arcFromCenter(c, s, e) : null; return k ? ['arc', { ...k, ...COSMETIC }] : null; }, 'td.op.cosmetic'],
  tdSurface: [1, ([p], api) => surfaceFinish(p, { text: pending.surfaceText ?? 'Ra 3.2', size: api.settings().textHeight, removal: pending.removal ?? 'required' }).map((e) => [e.type, e]), 'td.op.symbol'],
  tdWeld: [2, ([tip, elbow], api) => (elbow && dist(tip, elbow) > 1e-9 ? weldSymbol(tip, elbow, { ...pending.weld, textHeight: api.settings().textHeight }).map((e) => [e.type, e]) : null), 'td.op.symbol'],
  tdArea: [1, ([p], api) => {
    const loops = api.regionAt?.(p);
    if (!loops?.length) { api.notify('info', 'notice.noRegion'); return null; }
    const A = regionArea(loops);
    return [['leader', { points: [p, { x: p.x + 8, y: p.y + 8 }], text: `A = ${Number(A.toFixed(2))} mm²`, size: api.settings().textHeight }]];
  }, 'td.op.area'],
};
for (const [id, spec] of Object.entries(TOOLS)) { registerTool(id, (api) => new ClickTool(id, api, ...spec)); TOOL_ICONS[id] = { tdCosVertex: 'tdCosVertex', tdCosLine: 'tdCosLine', tdCosCircle: 'tdCosCircle', tdCosCircle3: 'tdCosCircle3', tdCosArc: 'tdCosArc', tdSurface: 'tdSurfaceFinish', tdWeld: 'tdWeld', tdArea: 'tdArea' }[id]; }

export function techDrawCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const sel = () => app.selectedEntities();
  const dims = () => sel().filter((e) => e.type === 'dim');
  const lines = () => sel().filter((e) => e.type === 'line');
  const circles = () => sel().filter((e) => e.type === 'circle' || e.type === 'arc');
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields, width = 480) => { const a = await app.form({ title: t(titleKey), icon, width, fields, actions: ok() }); return a?.action === 'ok' ? a.values : null; };
  const attrs = () => ({ lineType: 'continuous', lineWidth: 0.35, color: null, spacing: 7, delta: 2, ...(state.settings.tdLine ?? {}) });
  const dimDefaults = () => ({ size: state.settings.dimTextHeight ?? 3.5, precision: state.settings.dimPrecision ?? 1 });
  const add = (label, list, extra = {}) => {
    const made = app.change(label, (d) => list.map((raw) => { const { type, ...data } = raw; return addEntity(d, type, { ...data, ...extra }); }));
    if (made?.length) app.select(made.map((e) => e.id));
    return made;
  };
  const updateEach = (label, list, patch) => app.change(label, (d) => { for (const e of list) app.D.updateEntity(d, e.id, typeof patch === 'function' ? patch(e) : patch); });
  /** Right of everything on the page (where new views go). */
  const freeSpot = () => { const b = app.D.extents(drawing()) ?? { maxX: 0, minY: 0 }; return { x: b.maxX + 30, y: b.minY }; };
  const boxOfList = (list) => { const boxes = list.map((e) => entityBox(e)).filter(Boolean); return boxes.length ? { minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)), maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)) } : null; };

  /** A view group (TechDraw view): its entities, and how to make them again (Redraw page). */
  function newView(label, name, raw, view = null) {
    const group = { id: app.newId(), name, parent: null, ...(view ? { view } : { view: { kind: 'static' } }) };
    const made = app.change(label, (d) => { d.groups = [...(d.groups ?? []), group]; return raw.map((r) => { const { type, ...data } = r; return addEntity(d, type, { ...data, group: group.id }); }); });
    app.select(made.map((e) => e.id));
    app.showTree();
    return { group, made };
  }

  // ── views

  async function activeView() {
    const solids = app.selectedSolids().length ? app.selectedSolids() : drawing().entities.filter((e) => e.type === 'solid' && !e.hidden);
    if (!solids.length) { app.notify('info', t('notice.noSolids')); return null; }
    const camera = state.view3d ? app.view3d.instance?.getCamera() : null;
    const dirNow = camera ? camera.position.map((v, k) => v - camera.target[k]) : [1, -1, 1];
    const v = await ask('td.activeView', 'tdActiveView', [
      { key: 'dx', type: 'number', label: t('td.dirX'), icon: 'axes', value: Number(dirNow[0].toFixed(3)), step: 'any' }, { key: 'dy', type: 'number', label: t('td.dirY'), icon: 'axes', value: Number(dirNow[1].toFixed(3)), step: 'any' },
      { key: 'dz', type: 'number', label: t('td.dirZ'), icon: 'axes', value: Number(dirNow[2].toFixed(3)), step: 'any' }, { key: 'scale', type: 'number', label: t('td.scale'), icon: 'tdActiveView', value: 1, min: 0.01, step: 0.1 },
    ]);
    if (!v) return null;
    const at = freeSpot();
    const view = { kind: 'projection', source: solids.map((e) => e.id), dir: [v.dx, v.dy, v.dz], scale: v.scale, x: at.x, y: at.y };
    const raw = directionView(solids.flatMap((e) => solidMesh(e)), view.dir, { x0: at.x, y0: at.y, scale: v.scale, hiddenLayer: app.D.findLayer(drawing(), 'hidden') ? 'hidden' : null });
    if (state.view3d) await app.toggle3d(false);
    return newView('td.op.view', t('td.activeViewN'), raw, view).group;
  }

  function redraw() {
    const views = (drawing().groups ?? []).filter((g) => g.view?.kind === 'projection');
    app.change('td.op.redraw', (d) => {
      for (const g of views) {
        const solids = d.entities.filter((e) => g.view.source.includes(e.id));
        d.entities = d.entities.filter((e) => e.group !== g.id);
        if (!solids.length) continue;
        for (const r of directionView(solids.flatMap((e) => solidMesh(e)), g.view.dir, { x0: g.view.x, y0: g.view.y, scale: g.view.scale, hiddenLayer: app.D.findLayer(d, 'hidden') ? 'hidden' : null })) { const { type, ...data } = r; addEntity(d, type, { ...data, group: g.id }); }
      }
    });
    app.notify('success', t('td.redrawn', { count: views.length }));
    return views.length;
  }

  async function broken() {
    const list = sel().filter((e) => pathPoints(e));
    const box = boxOfList(list);
    if (!box) { app.notify('info', t('td.pickView')); return null; }
    const v = await ask('td.brokenView', 'tdBrokenView', [
      { key: 'axis', type: 'select', label: t('td.breakAxis'), icon: 'tdBrokenView', value: 'x', options: [['x', 'X'], ['y', 'Y']] },
      { key: 'from', type: 'number', label: t('td.breakFrom'), icon: 'tdBrokenView', value: Number((box.minX + (box.maxX - box.minX) / 3).toFixed(2)), step: 1, unit: 'mm' },
      { key: 'to', type: 'number', label: t('td.breakTo'), icon: 'tdBrokenView', value: Number((box.minX + (2 * (box.maxX - box.minX)) / 3).toFixed(2)), step: 1, unit: 'mm' },
      { key: 'gap', type: 'number', label: t('td.breakGap'), icon: 'tdBrokenView', value: 6, min: 0, step: 1, unit: 'mm' },
    ]);
    if (!v) return null;
    const out = brokenView(list, v.axis, v.from, v.to, v.gap);
    app.change('td.op.view', (d) => { d.entities = d.entities.filter((e) => !list.some((x) => x.id === e.id)); });
    return newView('td.op.view', t('td.brokenViewN'), [...out.entities, ...out.breaks]).group;
  }

  async function detail() {
    const list = sel().filter((e) => pathPoints(e));
    const box = boxOfList(list);
    if (!box) { app.notify('info', t('td.pickView')); return null; }
    const v = await ask('td.detailView', 'tdDetailView', [
      { key: 'cx', type: 'number', label: t('pd.centerX'), icon: 'coordinate', value: Number(((box.minX + box.maxX) / 2).toFixed(2)), step: 1, unit: 'mm' },
      { key: 'cy', type: 'number', label: t('pd.centerY'), icon: 'coordinate', value: Number(((box.minY + box.maxY) / 2).toFixed(2)), step: 1, unit: 'mm' },
      { key: 'r', type: 'number', label: t('td.detailRadius'), icon: 'tdDetailView', value: Number((Math.max(box.maxX - box.minX, box.maxY - box.minY) / 6).toFixed(2)), min: 0.01, step: 1, unit: 'mm' },
      { key: 'scale', type: 'number', label: t('td.scale'), icon: 'tdDetailView', value: 2, min: 0.1, step: 0.5 },
      { key: 'label', type: 'text', label: t('td.label'), icon: 'text', value: 'A' },
    ]);
    if (!v) return null;
    const at = freeSpot();
    const centre = { x: at.x + v.r * v.scale, y: at.y + v.r * v.scale };
    const raw = detailView(list, { x: v.cx, y: v.cy }, v.r, v.scale, centre);
    raw.push({ type: 'text', x: centre.x - v.r * v.scale, y: centre.y - v.r * v.scale - 6, text: `${v.label} (${v.scale}:1)`, size: state.settings.textHeight });
    // On the base view: the detail's circle and letter.
    add('td.op.view', [{ type: 'circle', cx: v.cx, cy: v.cy, r: v.r, lineType: 'phantom' }, { type: 'text', x: v.cx + v.r, y: v.cy + v.r, text: v.label, size: state.settings.textHeight }]);
    return newView('td.op.view', `${t('td.detailViewN')} ${v.label}`, raw).group;
  }

  async function draftView() {
    const list = sel().filter((e) => e.type !== 'solid');
    if (!list.length) { app.notify('info', t('notice.selectFirst')); return null; }
    const v = await ask('td.draftView', 'tdDraftView', [{ key: 'scale', type: 'number', label: t('td.scale'), icon: 'tdDraftView', value: 1, min: 0.01, step: 0.1 }], 400);
    if (!v) return null;
    const box = boxOfList(list); const at = freeSpot();
    const raw = list.map((e) => { let x = transformEntity(e, { type: 'move', dx: at.x - box.minX, dy: at.y - box.minY }); if (v.scale !== 1) x = transformEntity(x, { type: 'scale', cx: at.x, cy: at.y, factor: v.scale }); const { id: _id, group: _g, ...rest } = x; return rest; });
    return newView('td.op.view', t('td.draftViewN'), raw).group;
  }

  async function complexSection() {
    const solids = app.selectedSolids();
    const path = sel().find((e) => e.type === 'polyline' || e.type === 'line');
    if (!solids.length || !path) { app.notify('info', t('td.pickSectionPath')); return null; }
    const pts = pathPoints(path).points;
    const tris = solids.flatMap((e) => solidMesh(e));
    const at = freeSpot();
    const raw = [];
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]; const b = pts[i]; const L = dist(a, b);
      if (L < 1e-9) continue;
      const u = [(b.x - a.x) / L, (b.y - a.y) / L, 0]; const n = [-u[1], u[0], 0];
      const toLocal = (p) => [(p[0] - a.x) * u[0] + (p[1] - a.y) * u[1], p[2], (p[0] - a.x) * n[0] + (p[1] - a.y) * n[1]];
      const segs = sectionSegments(tris, toLocal).filter(([p, q]) => Math.min(p.x, q.x) >= -1e-6 && Math.max(p.x, q.x) <= L + 1e-6);
      for (const loop of chainSegments(segs, 1e-6)) raw.push({ type: 'polyline', points: loop.points.map((p) => ({ x: at.x + run + p.x, y: at.y + p.y })), closed: loop.closed });
      if (i > 1) raw.push({ type: 'line', x1: at.x + run, y1: at.y - 2, x2: at.x + run, y2: at.y + Math.max(1, ...tris.flat().map((p) => p[2])) + 2, lineType: 'center' });
      run += L;
    }
    if (!raw.length) { app.notify('info', t('td.sectionEmpty')); return null; }
    return newView('td.op.view', t('td.complexSectionN'), raw).group;
  }

  async function clipGroup() {
    const list = sel();
    const box = boxOfList(list);
    if (!box) { app.notify('info', t('notice.selectFirst')); return null; }
    const v = await ask('td.clipGroup', 'tdClipGroup', [
      { key: 'x', type: 'number', label: 'X', icon: 'coordinate', value: Number(box.minX.toFixed(2)), step: 1, unit: 'mm' }, { key: 'y', type: 'number', label: 'Y', icon: 'coordinate', value: Number(box.minY.toFixed(2)), step: 1, unit: 'mm' },
      { key: 'w', type: 'number', label: t('td.width'), icon: 'tdClipGroup', value: Number(((box.maxX - box.minX) / 2).toFixed(2)), min: 0.01, step: 1, unit: 'mm' }, { key: 'h', type: 'number', label: t('td.height'), icon: 'tdClipGroup', value: Number((box.maxY - box.minY).toFixed(2)), min: 0.01, step: 1, unit: 'mm' },
    ]);
    if (!v) return null;
    const group = { id: app.newId(), name: t('td.clipGroupN'), parent: null, clip: { minX: v.x, minY: v.y, maxX: v.x + v.w, maxY: v.y + v.h } };
    app.change('td.op.clip', (d) => { d.groups = [...(d.groups ?? []), group]; for (const e of list) app.D.updateEntity(d, e.id, { group: group.id }); });
    app.showTree();
    return group;
  }

  async function clipMove(addTo) {
    const clips = (drawing().groups ?? []).filter((g) => g.clip);
    if (addTo) {
      if (!clips.length) { app.notify('info', t('td.noClipGroup')); return; }
      const v = clips.length === 1 ? { id: clips[0].id } : await ask('td.clipAdd', 'tdClipAdd', [{ key: 'id', type: 'select', label: t('td.clipGroupN'), icon: 'tdClipGroup', value: clips[0].id, options: clips.map((g) => [g.id, g.name]) }], 420);
      if (v) updateEach('td.op.clip', sel(), { group: v.id });
      return;
    }
    updateEach('td.op.clip', sel().filter((e) => clips.some((g) => g.id === e.group)), { group: null });
  }

  /** The view (group) of the selection, or the selection itself. */
  const viewMembers = () => { const ids = new Set(sel().map((e) => e.group).filter(Boolean)); return ids.size ? drawing().entities.filter((e) => ids.has(e.group)) : sel(); };

  async function moveView() {
    const others = app.state.docs.filter((doc) => doc.id !== app.state.active);
    if (!others.length) { app.notify('info', t('td.noOtherPage')); return; }
    const v = await ask('td.moveView', 'tdMoveView', [{ key: 'doc', type: 'select', label: t('td.page'), icon: 'tdPageTemplate', value: others[0].id, options: others.map((d) => [d.id, app.docName(d)]) }, { key: 'copy', type: 'check', label: t('td.keepHere'), icon: 'tdShareView', value: false }], 440);
    if (!v) return;
    const list = viewMembers();
    const target = others.find((d) => d.id === v.doc);
    target.apply(t('td.op.moveView'), (d) => { for (const e of list) { const { id: _id, group: _g, ...rest } = structuredClone(e); addEntity(d, e.type, rest); } });
    if (!v.copy) app.change('td.op.moveView', (d) => { d.entities = d.entities.filter((e) => !list.some((x) => x.id === e.id)); });
    app.notify('success', t(v.copy ? 'td.shared' : 'td.moved', { count: list.length, page: app.docName(target) }));
  }

  function stack(where) {
    const ids = new Set(viewMembers().map((e) => e.id));
    app.change('td.op.stack', (d) => {
      const moving = d.entities.filter((e) => ids.has(e.id)); const rest = d.entities.filter((e) => !ids.has(e.id));
      if (where === 'top') d.entities = [...rest, ...moving];
      else if (where === 'bottom') d.entities = [...moving, ...rest];
      else {
        // One step: past the next (or previous) entity that is not moving.
        const order = d.entities.slice(); const idx = order.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
        if (where === 'up') { const last = Math.max(...idx); if (last < order.length - 1) { const [next] = order.splice(last + 1, 1); order.splice(Math.min(...idx), 0, next); } }
        else { const first = Math.min(...idx); if (first > 0) { const [prev] = order.splice(first - 1, 1); order.splice(Math.max(...idx), 0, prev); } }
        d.entities = order;
      }
    });
  }

  // ── cosmetic

  const cosmetic = (label, raw) => add(label, raw, COSMETIC);

  async function offsetVertex() {
    const at = vertexPoints(sel())[0];
    if (!at) { app.notify('info', t('td.pickVertex')); return null; }
    const v = await ask('td.offsetVertex', 'tdOffsetVertex', [{ key: 'dx', type: 'number', label: 'ΔX', icon: 'move', value: 10, step: 1, unit: 'mm' }, { key: 'dy', type: 'number', label: 'ΔY', icon: 'move', value: 0, step: 1, unit: 'mm' }], 400);
    return v ? cosmetic('td.op.cosmetic', [{ type: 'point', x: at.x + v.dx, y: at.y + v.dy }]) : null;
  }

  function intersections() {
    const [a, b] = sel();
    const segs = (e) => { const p = pathPoints(e); return p ? p.points.slice(1).map((q, i) => [p.points[i], q]) : []; };
    const out = [];
    if (a && b) {
      const ca = a.type === 'circle' || a.type === 'arc' ? a : null; const cb = b.type === 'circle' || b.type === 'arc' ? b : null;
      if (ca && cb) out.push(...intersectCircles({ x: ca.cx, y: ca.cy }, ca.r, { x: cb.cx, y: cb.cy }, cb.r));
      else if (ca || cb) { const c = ca ?? cb; for (const [p, q] of segs(ca ? b : a)) out.push(...intersectSegmentCircle(p, q, { x: c.cx, y: c.cy }, c.r)); }
      else for (const [p, q] of segs(a)) for (const [r, s] of segs(b)) { const x = intersectLines(p, q, r, s); if (x) out.push(x); }
    }
    if (!out.length) { app.notify('info', t('td.noIntersection')); return null; }
    return cosmetic('td.op.cosmetic', out.map((p) => ({ type: 'point', x: p.x, y: p.y })));
  }

  function lineThrough(perpendicular) {
    const line = lines()[0];
    const at = vertexPoints(sel().filter((e) => e !== line))[0];
    if (!line || !at) { app.notify('info', t('td.pickLineAndPoint')); return null; }
    const L = Math.hypot(line.x2 - line.x1, line.y2 - line.y1) || 1;
    let u = { x: (line.x2 - line.x1) / L, y: (line.y2 - line.y1) / L };
    if (perpendicular) u = { x: -u.y, y: u.x };
    return cosmetic('td.op.cosmetic', [{ type: 'line', x1: at.x - (u.x * L) / 2, y1: at.y - (u.y * L) / 2, x2: at.x + (u.x * L) / 2, y2: at.y + (u.y * L) / 2 }]);
  }

  const centre = (label, list) => add(label, list.map((l) => ({ type: 'line', ...l, lineType: 'center' })), { cosmetic: true });

  function faceCentre() {
    const shape = sel().find((e) => ['rect', 'polygon'].includes(e.type) || (e.type === 'polyline' && e.closed));
    const box = shape ? entityBox(shape) : null;
    if (!box) { app.notify('info', t('td.pickFace')); return null; }
    const ext = 3;
    const long = box.maxX - box.minX >= box.maxY - box.minY;
    const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    return centre('td.op.centerline', [long ? { x1: box.minX - ext, y1: c.y, x2: box.maxX + ext, y2: c.y } : { x1: c.x, y1: box.minY - ext, x2: c.x, y2: box.maxY + ext }]);
  }

  // ── dimensions

  const dimAdd = (label, list) => (list.length ? add(label, list) : (app.notify('info', t('td.pickVertices')), null));
  const chain = (direction, coordinate) => dimAdd('td.op.dim', chainDimensions(vertexPoints(sel()), { direction, coordinate, offset: 10, spacing: attrs().spacing, ...dimDefaults() }));
  const chamfer = (direction) => { const l = lines()[0]; return l ? add('td.op.dim', [chamferDimension(l, direction, dimDefaults())]) : app.notify('info', t('td.pickLine')); };
  const extent = (direction) => { const d = extentDimension(sel(), direction, dimDefaults()); return d ? add('td.op.dim', [d]) : app.notify('info', t('td.pickVertices')); };
  const reDims = (label, f) => { const list = dims(); if (!list.length) { app.notify('info', t('td.pickDims')); return; } const next = f(list); app.change(label, (d) => { d.entities = d.entities.map((e) => next.find((x) => x.id === e.id) ?? e); }); };
  const textOf = (e) => e.text || '<>';
  const prefix = (p) => reDims('td.op.format', (list) => list.map((e) => ({ ...e, text: `${p}${textOf(e).replace(/^(⌀|□|\d+× ?)/, '')}` })));

  async function axoDimension() {
    const l = lines()[0];
    if (!l) { app.notify('info', t('td.pickLine')); return null; }
    const v = await ask('td.axoDim', 'tdAxoDim', [{ key: 'factor', type: 'number', label: t('td.axoFactor'), icon: 'tdAxoDim', value: 0.8165, min: 0.01, step: 0.01 }], 420);
    if (!v) return null;
    const L = Math.hypot(l.x2 - l.x1, l.y2 - l.y1) / v.factor;
    const n = { x: -(l.y2 - l.y1), y: l.x2 - l.x1 }; const ln = Math.hypot(n.x, n.y) || 1;
    return add('td.op.dim', [{ type: 'dim', kind: 'aligned', x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, ox: (l.x1 + l.x2) / 2 + (n.x / ln) * 8, oy: (l.y1 + l.y2) / 2 + (n.y / ln) * 8, text: String(Number(L.toFixed(dimDefaults().precision))), ...dimDefaults() }]);
  }

  function arcLengthDim() {
    const arc = sel().find((e) => e.type === 'arc');
    if (!arc) { app.notify('info', t('td.pickArc')); return null; }
    return add('td.op.dim', [{ type: 'dim', kind: 'angle', cx: arc.cx, cy: arc.cy, r: arc.r + 6, start: arc.start, end: arc.end, text: `⌒${Number(arcLength(arc).toFixed(dimDefaults().precision))}`, ...dimDefaults() }]);
  }

  async function customizeFormat() {
    const d0 = dims()[0];
    if (!d0) { app.notify('info', t('td.pickDims')); return; }
    const v = await ask('td.customizeFormat', 'tdFormat', [{ key: 'text', type: 'text', label: t('td.formatText'), icon: 'tdFormat', value: d0.text || '<>' }, { key: 'precision', type: 'number', label: t('settings.dimPrecision'), icon: 'tdFormat', value: d0.precision, min: 0, max: 4, step: 1 }], 440);
    if (v) reDims('td.op.format', (list) => list.map((e) => ({ ...e, text: v.text === '<>' ? '' : v.text, precision: Math.round(v.precision) })));
  }

  function repairDims() {
    const geo = drawing().entities.filter((e) => e.type !== 'dim' && e.type !== 'text');
    const pts = vertexPoints(geo);
    const tol = Math.max(0.5, (drawing().grid?.size ?? 10) / 4);
    const snap = (x, y) => { let best = null; for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d <= tol && (!best || d < best.d)) best = { p, d }; } return best ? best.p : { x, y }; };
    let fixed = 0;
    reDims('td.op.repair', (list) => list.map((e) => { if (!['aligned', 'horizontal', 'vertical'].includes(e.kind)) return e; const a = snap(e.x1, e.y1); const b = snap(e.x2, e.y2); if (a.x !== e.x1 || a.y !== e.y1 || b.x !== e.x2 || b.y !== e.y2) fixed++; return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }));
    app.notify('success', t('td.repaired', { count: fixed }));
  }

  async function holeShaftFit() {
    const d0 = dims().find((e) => e.kind === 'diameter' || e.kind === 'aligned' || e.kind === 'horizontal' || e.kind === 'vertical');
    if (!d0) { app.notify('info', t('td.pickDims')); return null; }
    const size = d0.kind === 'diameter' ? d0.r * 2 : Math.hypot(d0.x2 - d0.x1, d0.y2 - d0.y1);
    const v = await ask('td.holeShaftFit', 'tdFit', [
      { key: 'hole', type: 'select', label: t('td.hole'), icon: 'tdFit', value: 'H', options: ['D', 'E', 'F', 'G', 'H', 'JS', 'K', 'M', 'N', 'P', 'S'].map((x) => [x, x]) },
      { key: 'holeGrade', type: 'select', label: t('td.grade'), icon: 'tdFit', value: '7', options: ['6', '7', '8', '9', '11'].map((x) => [x, `IT${x}`]) },
      { key: 'shaft', type: 'select', label: t('td.shaft'), icon: 'tdFit', value: 'g', options: ['d', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p', 's'].map((x) => [x, x]) },
      { key: 'shaftGrade', type: 'select', label: t('td.grade'), icon: 'tdFit', value: '6', options: ['5', '6', '7', '8', '9'].map((x) => [x, `IT${x}`]) },
    ], 440);
    if (!v) return null;
    const fit = fitText(size, v.hole, Number(v.holeGrade), v.shaft, Number(v.shaftGrade));
    if (!fit) return null;
    reDims('td.op.fit', (list) => list.map((e) => (e.id === d0.id ? { ...e, text: `${e.kind === 'diameter' ? '' : '⌀'}${fit.text}` } : e)));
    app.notify('success', t(`td.fit.${fit.kind}`));
    return fit;
  }

  // ── lines

  async function selectLineAttributes() {
    const a = attrs();
    const v = await ask('td.selectLineAttributes', 'tdLineAttr', [
      { key: 'lineType', type: 'select', label: t('draft.lineType'), icon: 'line', value: a.lineType, options: ['continuous', 'dashed', 'center', 'hidden', 'phantom', 'dotted'].map((k) => [k, t(`lineType.${k}`)]) },
      { key: 'lineWidth', type: 'number', label: t('draft.lineWidth'), icon: 'line', value: a.lineWidth, min: 0.05, step: 0.05, unit: 'mm' },
      { key: 'spacing', type: 'number', label: t('td.cascadeSpacing'), icon: 'tdCascadeH', value: a.spacing, min: 1, step: 1, unit: 'mm' },
      { key: 'delta', type: 'number', label: t('td.deltaDistance'), icon: 'tdExtendLine', value: a.delta, min: 0.1, step: 0.5, unit: 'mm' },
    ]);
    if (v) app.updateSettings({ tdLine: { ...a, ...v } });
  }

  async function decorate() {
    const list = sel();
    if (!list.length) { app.notify('info', t('notice.selectFirst')); return; }
    const v = await ask('td.decorateLine', 'tdDecorate', [
      { key: 'lineType', type: 'select', label: t('draft.lineType'), icon: 'line', value: list[0].lineType ?? 'continuous', options: ['continuous', 'dashed', 'center', 'hidden', 'phantom', 'dotted'].map((k) => [k, t(`lineType.${k}`)]) },
      { key: 'lineWidth', type: 'number', label: t('draft.lineWidth'), icon: 'line', value: list[0].lineWidth ?? 0.35, min: 0.05, step: 0.05, unit: 'mm' },
      { key: 'color', type: 'color', label: t('draft.color'), icon: 'palette', value: list[0].color ?? '#ffffff' },
      { key: 'visible', type: 'check', label: t('draft.visible'), icon: 'eye', value: true },
    ]);
    if (v) updateEach('td.op.lines', list, { lineType: v.lineType, lineWidth: v.lineWidth, color: v.color, hidden: !v.visible || undefined });
  }

  function toggleHiddenEdges() {
    const d = drawing();
    const layer = app.D.findLayer(d, 'hidden');
    if (layer) { app.change('td.op.showAll', (x) => { x.layers = x.layers.map((l) => (l.id === 'hidden' ? { ...l, visible: !l.visible } : l)); }); return; }
    const list = d.entities.filter((e) => e.lineType === 'hidden');
    const show = list.some((e) => e.hidden);
    updateEach('td.op.showAll', list, { hidden: show ? undefined : true });
  }

  // ── pages

  async function template() {
    const v = await ask('td.pageTemplate', 'tdPageTemplate', [{ key: 'size', type: 'select', label: t('td.paper'), icon: 'tdPageTemplate', value: 'A4', options: Object.keys(PAGE_SIZES).map((k) => [k, `${k} (${PAGE_SIZES[k].join(' × ')})`]) }], 420);
    if (!v) return null;
    const d = drawing();
    const raw = pageTemplate(v.size, { x: 0, y: 0 }, fieldValues(d));
    return newView('td.op.template', `${t('td.page')} ${v.size}`, raw).group;
  }
  const fieldValues = (d) => ({ title: d.title || app.docName(app.activeDoc()), author: d.author || '', date: new Date().toISOString().slice(0, 10), scale: '1:1', sheet: '1 / 1', company: state.settings.company ?? '' });

  function fillFields() {
    const values = fieldValues(drawing());
    const list = drawing().entities.filter((e) => e.type === 'text' && e.field && values[e.field] !== undefined);
    updateEach('td.op.fields', list, (e) => ({ text: String(values[e.field]) }));
    app.notify('success', t('td.fieldsFilled', { count: list.length }));
    return list.length;
  }

  async function insertSvg(given = null) {
    const file = given ?? await app.readTextFileDialog(['svg']);
    if (!file) return null;
    let entities;
    try { entities = importDrawingBytes(file.name || 'symbol.svg', new TextEncoder().encode(file.text)).drawing.entities; } catch { app.notify('error', t('td.badSvg', { name: file.name })); return null; }
    const box = boxOfList(entities); const at = freeSpot();
    const raw = entities.map((e) => { const x = transformEntity(e, { type: 'move', dx: at.x - (box?.minX ?? 0), dy: at.y - (box?.minY ?? 0) }); const { id: _id, layer: _l, group: _g, ...rest } = x; return rest; });
    return newView('td.op.symbol', `${t('td.symbol')}: ${file.name}`, raw).group;
  }

  function spreadsheetView() {
    const sheet = drawing().spreadsheet;
    if (!sheet || !Object.keys(sheet.cells).length) { app.notify('info', t('td.noSheet')); return null; }
    return newView('td.op.sheet', t('td.sheetViewN'), sheetTable(sheet.cells, computeSheet(sheet), freeSpot())).group;
  }

  function alignVertices(horizontal) {
    const pts = vertexPoints(sel());
    if (pts.length < 2) { app.notify('info', t('td.pickVertices')); return; }
    const [a, b] = pts;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const target = horizontal ? (Math.abs(angle) <= 90 ? 0 : 180) : (angle >= 0 ? 90 : -90);
    const list = viewMembers();
    app.change('td.op.align', (d) => { d.entities = d.entities.map((e) => (list.some((x) => x.id === e.id) ? transformEntity(e, { type: 'rotate', cx: a.x, cy: a.y, angle: target - angle }) : e)); });
  }

  function positionSection() {
    const groups = [...new Set(sel().map((e) => e.group).filter(Boolean))];
    if (groups.length < 2) { app.notify('info', t('td.pickTwoViews')); return; }
    const d = drawing();
    const boxOf = (g) => boxOfList(d.entities.filter((e) => e.group === g));
    const base = boxOf(groups[0]);
    app.change('td.op.align', (x) => {
      for (const g of groups.slice(1)) {
        const b = boxOf(g);
        const sideBySide = b.minX >= base.maxX || b.maxX <= base.minX;
        const dy = sideBySide ? (base.minY + base.maxY) / 2 - (b.minY + b.maxY) / 2 : 0;
        const dx = sideBySide ? 0 : (base.minX + base.maxX) / 2 - (b.minX + b.maxX) / 2;
        x.entities = x.entities.map((e) => (e.group === g ? transformEntity(e, { type: 'move', dx, dy }) : e));
      }
    });
  }

  async function weldTool() {
    const v = await ask('td.weldSymbol', 'tdWeld', [
      { key: 'kind', type: 'select', label: t('td.weldKind'), icon: 'tdWeld', value: 'fillet', options: ['fillet', 'v', 'square'].map((k) => [k, t(`td.weld.${k}`)]) },
      { key: 'size', type: 'text', label: t('td.weldSize'), icon: 'tdWeld', value: 'a5' },
      { key: 'allAround', type: 'check', label: t('td.allAround'), icon: 'tdWeld', value: false }, { key: 'field', type: 'check', label: t('td.fieldWeld'), icon: 'tdWeld', value: false },
      { key: 'otherSide', type: 'check', label: t('td.otherSide'), icon: 'tdWeld', value: false },
    ]);
    if (!v) return;
    pending.weld = v;
    if (state.view3d) await app.toggle3d(false);
    app.setTool('tdWeld');
  }

  async function surfaceTool() {
    const v = await ask('td.surfaceFinish', 'tdSurfaceFinish', [{ key: 'text', type: 'text', label: t('td.roughness'), icon: 'tdSurfaceFinish', value: 'Ra 3.2' }, { key: 'removal', type: 'select', label: t('td.removal'), icon: 'tdSurfaceFinish', value: 'required', options: ['any', 'required', 'prohibited'].map((k) => [k, t(`td.removal.${k}`)]) }], 440);
    if (!v) return;
    pending = { ...pending, surfaceText: v.text, removal: v.removal };
    if (state.view3d) await app.toggle3d(false);
    app.setTool('tdSurface');
  }

  const toolCmd = (id, icon, label) => ({ icon, label, enabled: hasDoc, run: async () => { if (state.view3d) await app.toggle3d(false); app.setTool(id); } });
  const needSel = () => sel().length > 0;
  return {
    'td:activeView': { icon: 'tdActiveView', label: 'td.activeView', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => activeView() },
    'td:brokenView': { icon: 'tdBrokenView', label: 'td.brokenView', enabled: needSel, run: () => broken() },
    'td:detailView': { icon: 'tdDetailView', label: 'td.detailView', enabled: needSel, run: () => detail() },
    'td:draftView': { icon: 'tdDraftView', label: 'td.draftView', enabled: needSel, run: () => draftView() },
    'td:complexSection': { icon: 'tdComplexSection', label: 'td.complexSection', enabled: () => app.selectedSolids().length > 0, run: () => complexSection() },
    'td:clipGroup': { icon: 'tdClipGroup', label: 'td.clipGroup', enabled: needSel, run: () => clipGroup() },
    'td:clipAdd': { icon: 'tdClipAdd', label: 'td.clipAdd', enabled: needSel, run: () => clipMove(true) },
    'td:clipRemove': { icon: 'tdClipRemove', label: 'td.clipRemove', enabled: needSel, run: () => clipMove(false) },
    'td:redraw': { icon: 'tdRedraw', label: 'td.redraw', enabled: hasDoc, run: () => redraw() },
    'td:moveView': { icon: 'tdMoveView', label: 'td.moveView', enabled: needSel, run: () => moveView() },
    'td:shareView': { icon: 'tdShareView', label: 'td.shareView', enabled: needSel, run: () => moveView() },
    'td:stackTop': { icon: 'tdStackTop', label: 'td.stackTop', enabled: needSel, run: () => stack('top') },
    'td:stackUp': { icon: 'tdStackUp', label: 'td.stackUp', enabled: needSel, run: () => stack('up') },
    'td:stackDown': { icon: 'tdStackDown', label: 'td.stackDown', enabled: needSel, run: () => stack('down') },
    'td:stackBottom': { icon: 'tdStackBottom', label: 'td.stackBottom', enabled: needSel, run: () => stack('bottom') },
    'td:toggleFrame': { icon: 'tdToggleFrame', label: 'td.toggleFrame', enabled: hasDoc, checked: () => Boolean(state.settings.tdViewFrames), run: () => { app.updateSettings({ tdViewFrames: !state.settings.tdViewFrames }); app.repaint(); } },
    'td:lockView': { icon: 'tdLock', label: 'td.lockView', enabled: needSel, run: () => { const list = viewMembers(); const on = !list.every((e) => e.unselectable); updateEach('td.op.lock', list, { unselectable: on || undefined }); if (on) app.select([]); } },
    'td:positionSection': { icon: 'tdPosSection', label: 'td.positionSection', enabled: needSel, run: () => positionSection() },
    'td:alignH': { icon: 'tdAlignH', label: 'td.alignH', enabled: needSel, run: () => alignVertices(true) },
    'td:alignV': { icon: 'tdAlignV', label: 'td.alignV', enabled: needSel, run: () => alignVertices(false) },
    'td:cosVertex': toolCmd('tdCosVertex', 'tdCosVertex', 'td.cosVertex'),
    'td:cosLine': toolCmd('tdCosLine', 'tdCosLine', 'td.cosLine'),
    'td:cosCircle': toolCmd('tdCosCircle', 'tdCosCircle', 'td.cosCircle'),
    'td:cosCircle2': toolCmd('tdCosCircle', 'tdCosCircle2', 'td.cosCircle2'),
    'td:cosCircle3': toolCmd('tdCosCircle3', 'tdCosCircle3', 'td.cosCircle3'),
    'td:cosArc': toolCmd('tdCosArc', 'tdCosArc', 'td.cosArc'),
    'td:area': toolCmd('tdArea', 'tdArea', 'td.area'),
    'td:surfaceFinish': { icon: 'tdSurfaceFinish', label: 'td.surfaceFinish', enabled: hasDoc, run: () => surfaceTool() },
    'td:weld': { icon: 'tdWeld', label: 'td.weldSymbol', enabled: hasDoc, run: () => weldTool() },
    'td:offsetVertex': { icon: 'tdOffsetVertex', label: 'td.offsetVertex', enabled: needSel, run: () => offsetVertex() },
    'td:midpoints': { icon: 'tdMidpoints', label: 'td.midpoints', enabled: needSel, run: () => cosmetic('td.op.cosmetic', sel().flatMap((e) => { const p = pathPoints(e); return p ? p.points.slice(1).map((q, i) => ({ type: 'point', x: (q.x + p.points[i].x) / 2, y: (q.y + p.points[i].y) / 2 })) : []; }).slice(0, 2000)) },
    'td:quadrants': { icon: 'tdQuadrants', label: 'td.quadrants', enabled: () => circles().length > 0, run: () => cosmetic('td.op.cosmetic', circles().filter((c) => c.type === 'circle').flatMap((c) => [0, 90, 180, 270].map((a) => ({ type: 'point', x: c.cx + c.r * Math.cos((a * Math.PI) / 180), y: c.cy + c.r * Math.sin((a * Math.PI) / 180) })))) },
    'td:intersection': { icon: 'tdIntersection', label: 'td.intersection', enabled: () => sel().length === 2, run: () => intersections() },
    'td:lineParallel': { icon: 'tdLineParallel', label: 'td.lineParallel', enabled: () => lines().length > 0, run: () => lineThrough(false) },
    'td:linePerpendicular': { icon: 'tdLinePerpendicular', label: 'td.linePerpendicular', enabled: () => lines().length > 0, run: () => lineThrough(true) },
    'td:eraser': { icon: 'tdEraser', label: 'td.eraser', enabled: () => sel().some((e) => e.cosmetic), run: () => { const ids = new Set(sel().filter((e) => e.cosmetic).map((e) => e.id)); app.change('td.op.eraser', (d) => { d.entities = d.entities.filter((e) => !ids.has(e.id)); }); app.notify('success', t('td.erased', { count: ids.size })); } },
    'td:twoLineCenter': { icon: 'tdTwoLineCenter', label: 'td.twoLineCenter', enabled: () => lines().length >= 2, run: () => centre('td.op.centerline', [centreLineBetween(lines()[0], lines()[1])]) },
    'td:faceCenter': { icon: 'tdFaceCenter', label: 'td.faceCenter', enabled: needSel, run: () => faceCentre() },
    'td:circleCenters': { icon: 'tdCircleCenter', label: 'td.circleCenters', enabled: () => circles().length > 0, run: () => centre('td.op.centerline', circles().flatMap((c) => circleCentreLines(c))) },
    'td:holeCircle': { icon: 'tdHoleCircle', label: 'td.holeCircle', enabled: () => circles().length >= 3, run: () => { const b = boltCircle(circles()); if (!b) return; add('td.op.centerline', [{ type: 'circle', ...b.circle, lineType: 'center' }, ...b.radial.map((l) => ({ type: 'line', ...l, lineType: 'center' }))], { cosmetic: true }); } },
    'td:threadBoltSide': { icon: 'tdThreadBoltSide', label: 'td.threadBoltSide', enabled: () => lines().length >= 2, run: () => cosmetic('td.op.thread', threadSide(lines()[0], lines()[1]).map((l) => ({ type: 'line', ...l }))) },
    'td:threadHoleSide': { icon: 'tdThreadHoleSide', label: 'td.threadHoleSide', enabled: () => lines().length >= 2, run: () => cosmetic('td.op.thread', threadSide(lines()[0], lines()[1], { hole: true }).map((l) => ({ type: 'line', ...l }))) },
    'td:threadBoltBottom': { icon: 'tdThreadBoltBottom', label: 'td.threadBoltBottom', enabled: () => circles().length > 0, run: () => cosmetic('td.op.thread', circles().map((c) => ({ type: 'arc', ...threadBottom(c) }))) },
    'td:threadHoleBottom': { icon: 'tdThreadHoleBottom', label: 'td.threadHoleBottom', enabled: () => circles().length > 0, run: () => cosmetic('td.op.thread', circles().map((c) => ({ type: 'arc', ...threadBottom(c, { hole: true }) }))) },
    'td:chainH': { icon: 'tdChainH', label: 'td.chainH', enabled: needSel, run: () => chain('horizontal', false) },
    'td:chainV': { icon: 'tdChainV', label: 'td.chainV', enabled: needSel, run: () => chain('vertical', false) },
    'td:chainO': { icon: 'tdChainO', label: 'td.chainO', enabled: needSel, run: () => chain('oblique', false) },
    'td:coordH': { icon: 'tdCoordH', label: 'td.coordH', enabled: needSel, run: () => chain('horizontal', true) },
    'td:coordV': { icon: 'tdCoordV', label: 'td.coordV', enabled: needSel, run: () => chain('vertical', true) },
    'td:coordO': { icon: 'tdCoordO', label: 'td.coordO', enabled: needSel, run: () => chain('oblique', true) },
    'td:chamferH': { icon: 'tdChamferH', label: 'td.chamferH', enabled: () => lines().length > 0, run: () => chamfer('horizontal') },
    'td:chamferV': { icon: 'tdChamferV', label: 'td.chamferV', enabled: () => lines().length > 0, run: () => chamfer('vertical') },
    'td:extentH': { icon: 'tdExtentH', label: 'td.extentH', enabled: needSel, run: () => extent('horizontal') },
    'td:extentV': { icon: 'tdExtentV', label: 'td.extentV', enabled: needSel, run: () => extent('vertical') },
    'td:axoDim': { icon: 'tdAxoDim', label: 'td.axoDim', enabled: () => lines().length > 0, run: () => axoDimension() },
    'td:arcLength': { icon: 'tdArcLength', label: 'td.arcLength', enabled: () => sel().some((e) => e.type === 'arc'), run: () => arcLengthDim() },
    'td:cascadeH': { icon: 'tdCascadeH', label: 'td.cascadeH', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => cascadeDimensions(l.filter((d) => d.kind === 'horizontal'), attrs().spacing)) },
    'td:cascadeV': { icon: 'tdCascadeV', label: 'td.cascadeV', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => cascadeDimensions(l.filter((d) => d.kind === 'vertical'), attrs().spacing)) },
    'td:cascadeO': { icon: 'tdCascadeO', label: 'td.cascadeO', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => cascadeDimensions(l.filter((d) => d.kind === 'aligned'), attrs().spacing)) },
    'td:posH': { icon: 'tdPosH', label: 'td.posH', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => alignDimensions(l.filter((d) => d.kind === 'horizontal'))) },
    'td:posV': { icon: 'tdPosV', label: 'td.posV', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => alignDimensions(l.filter((d) => d.kind === 'vertical'))) },
    'td:posO': { icon: 'tdPosO', label: 'td.posO', enabled: () => dims().length > 1, run: () => reDims('td.op.cascade', (l) => alignDimensions(l.filter((d) => d.kind === 'aligned'))) },
    'td:customizeFormat': { icon: 'tdFormat', label: 'td.customizeFormat', enabled: () => dims().length > 0, run: () => customizeFormat() },
    'td:decimalUp': { icon: 'tdDecimalUp', label: 'td.decimalUp', enabled: () => dims().length > 0, run: () => reDims('td.op.format', (l) => l.map((e) => ({ ...e, precision: Math.min(4, e.precision + 1) }))) },
    'td:decimalDown': { icon: 'tdDecimalDown', label: 'td.decimalDown', enabled: () => dims().length > 0, run: () => reDims('td.op.format', (l) => l.map((e) => ({ ...e, precision: Math.max(0, e.precision - 1) }))) },
    'td:prefixDiameter': { icon: 'tdPrefixDiameter', label: 'td.prefixDiameter', enabled: () => dims().length > 0, run: () => prefix('⌀') },
    'td:prefixSquare': { icon: 'tdPrefixSquare', label: 'td.prefixSquare', enabled: () => dims().length > 0, run: () => prefix('□') },
    'td:prefixRepeat': { icon: 'tdPrefixRepeat', label: 'td.prefixRepeat', enabled: () => dims().length > 0, run: async () => { const v = await ask('td.prefixRepeat', 'tdPrefixRepeat', [{ key: 'n', type: 'number', label: t('td.repeatCount'), icon: 'tdPrefixRepeat', value: 2, min: 2, step: 1 }], 400); if (v) prefix(`${Math.round(v.n)}× `); } },
    'td:prefixRemove': { icon: 'tdPrefixRemove', label: 'td.prefixRemove', enabled: () => dims().length > 0, run: () => reDims('td.op.format', (l) => l.map((e) => ({ ...e, text: textOf(e).replace(/^(⌀|□|\d+× ?)/, '') === '<>' ? '' : textOf(e).replace(/^(⌀|□|\d+× ?)/, '') }))) },
    'td:holeShaftFit': { icon: 'tdFit', label: 'td.holeShaftFit', enabled: () => dims().length > 0, run: () => holeShaftFit() },
    'td:dimRepair': { icon: 'tdDimRepair', label: 'td.dimRepair', enabled: () => dims().length > 0, run: () => repairDims() },
    'td:decorateLine': { icon: 'tdDecorate', label: 'td.decorateLine', enabled: needSel, run: () => decorate() },
    'td:changeLineAttributes': { icon: 'tdLineAttr', label: 'td.changeLineAttributes', enabled: needSel, run: () => { const a = attrs(); updateEach('td.op.lines', sel(), { lineType: a.lineType, lineWidth: a.lineWidth }); } },
    'td:selectLineAttributes': { icon: 'tdLineAttr', label: 'td.selectLineAttributes', enabled: hasDoc, run: () => selectLineAttributes() },
    'td:extendLine': { icon: 'tdExtendLine', label: 'td.extendLine', enabled: () => lines().length > 0, run: () => updateEach('td.op.lines', lines(), (l) => extendLine(l, attrs().delta)) },
    'td:shortenLine': { icon: 'tdShortenLine', label: 'td.shortenLine', enabled: () => lines().length > 0, run: () => updateEach('td.op.lines', lines(), (l) => extendLine(l, -attrs().delta)) },
    'td:showAll': { icon: 'tdShowAll', label: 'td.showAll', enabled: hasDoc, run: () => toggleHiddenEdges() },
    'td:pageTemplate': { icon: 'tdPageTemplate', label: 'td.pageTemplate', enabled: hasDoc, run: () => template() },
    'td:fillFields': { icon: 'tdFillTemplate', label: 'td.fillFields', enabled: () => Boolean(drawing()?.entities.some((e) => e.field)), run: () => fillFields() },
    'td:symbol': { icon: 'tdSymbol', label: 'td.symbol', enabled: hasDoc, run: () => insertSvg() },
    'td:sheetView': { icon: 'tdSheetView', label: 'td.sheetView', enabled: () => Boolean(drawing()?.spreadsheet), run: () => spreadsheetView() },
  };
}

export const TECHDRAW_MENU = {
  views: ['td:activeView', 'td:draftView', 'td:detailView', 'td:brokenView', 'td:complexSection', '-', 'td:clipGroup', 'td:clipAdd', 'td:clipRemove', '-', 'td:moveView', 'td:shareView', 'td:redraw', 'td:toggleFrame', 'td:lockView', 'td:positionSection', '-', 'td:stackTop', 'td:stackUp', 'td:stackDown', 'td:stackBottom', '-', 'td:alignH', 'td:alignV', 'td:showAll'],
  cosmetic: ['td:cosVertex', 'td:offsetVertex', 'td:midpoints', 'td:quadrants', 'td:intersection', '-', 'td:cosLine', 'td:lineParallel', 'td:linePerpendicular', 'td:cosCircle', 'td:cosCircle2', 'td:cosCircle3', 'td:cosArc', '-', 'td:twoLineCenter', 'td:faceCenter', 'td:circleCenters', 'td:holeCircle', '-', 'td:threadBoltSide', 'td:threadBoltBottom', 'td:threadHoleSide', 'td:threadHoleBottom', '-', 'td:eraser'],
  dims: ['td:chainH', 'td:chainV', 'td:chainO', 'td:coordH', 'td:coordV', 'td:coordO', 'td:chamferH', 'td:chamferV', 'td:extentH', 'td:extentV', 'td:axoDim', 'td:arcLength', 'td:area', '-', 'td:cascadeH', 'td:cascadeV', 'td:cascadeO', 'td:posH', 'td:posV', 'td:posO', '-', 'td:customizeFormat', 'td:decimalUp', 'td:decimalDown', 'td:prefixDiameter', 'td:prefixSquare', 'td:prefixRepeat', 'td:prefixRemove', 'td:holeShaftFit', 'td:dimRepair'],
  page: ['td:pageTemplate', 'td:fillFields', 'td:sheetView', 'td:symbol', 'td:surfaceFinish', 'td:weld', '-', 'td:decorateLine', 'td:changeLineAttributes', 'td:selectLineAttributes', 'td:extendLine', 'td:shortenLine'],
};

export const TECHDRAW_FREECAD = {
  TechDraw_2LineCenterLine: 'td:twoLineCenter', TechDraw_2PointCosmeticLine: 'td:cosLine', TechDraw_3PtAngleDimension: 'tool:dimAngle', TechDraw_ActiveView: 'td:activeView',
  TechDraw_AlignVertexesHorizontally: 'td:alignH', TechDraw_AlignVertexesVertically: 'td:alignV', TechDraw_ArchView: 'solidSection', TechDraw_AreaDimension: 'td:area',
  TechDraw_AxoLengthDimension: 'td:axoDim', TechDraw_BrokenView: 'td:brokenView', TechDraw_ClipGroup: 'td:clipGroup', TechDraw_ClipGroupAdd: 'td:clipAdd', TechDraw_ClipGroupRemove: 'td:clipRemove',
  TechDraw_CommandAddOffsetVertex: 'td:offsetVertex', TechDraw_ComplexSection: 'td:complexSection', TechDraw_CosmeticCircle: 'td:cosCircle', TechDraw_CosmeticEraser: 'td:eraser',
  TechDraw_CosmeticVertex: 'td:cosVertex', TechDraw_DecorateLine: 'td:decorateLine', TechDraw_DetailView: 'td:detailView', TechDraw_DimensionRepair: 'td:dimRepair', TechDraw_DraftView: 'td:draftView',
  TechDraw_ExtensionArcLengthAnnotation: 'td:arcLength', TechDraw_ExtensionAreaAnnotation: 'td:area', TechDraw_ExtensionCascadeHorizDimension: 'td:cascadeH',
  TechDraw_ExtensionCascadeObliqueDimension: 'td:cascadeO', TechDraw_ExtensionCascadeVertDimension: 'td:cascadeV', TechDraw_ExtensionChangeLineAttributes: 'td:changeLineAttributes',
  TechDraw_ExtensionCircleCenterLines: 'td:circleCenters', TechDraw_ExtensionCreateHorizChainDimension: 'td:chainH', TechDraw_ExtensionCreateHorizChamferDimension: 'td:chamferH',
  TechDraw_ExtensionCreateHorizCoordDimension: 'td:coordH', TechDraw_ExtensionCreateLengthArc: 'td:arcLength', TechDraw_ExtensionCreateObliqueChainDimension: 'td:chainO',
  TechDraw_ExtensionCreateObliqueCoordDimension: 'td:coordO', TechDraw_ExtensionCreateVertChainDimension: 'td:chainV', TechDraw_ExtensionCreateVertChamferDimension: 'td:chamferV',
  TechDraw_ExtensionCreateVertCoordDimension: 'td:coordV', TechDraw_ExtensionCustomizeFormat: 'td:customizeFormat', TechDraw_ExtensionDecreaseDecimal: 'td:decimalDown',
  TechDraw_ExtensionDrawCosmArc: 'td:cosArc', TechDraw_ExtensionDrawCosmCircle: 'td:cosCircle2', TechDraw_ExtensionDrawCosmCircle3Points: 'td:cosCircle3', TechDraw_ExtensionExtendLine: 'td:extendLine',
  TechDraw_ExtensionHoleCircle: 'td:holeCircle', TechDraw_ExtensionIncreaseDecimal: 'td:decimalUp', TechDraw_ExtensionInsertDiameter: 'td:prefixDiameter', TechDraw_ExtensionInsertRepetition: 'td:prefixRepeat',
  TechDraw_ExtensionInsertSquare: 'td:prefixSquare', TechDraw_ExtensionLineParallel: 'td:lineParallel', TechDraw_ExtensionLinePerpendicular: 'td:linePerpendicular', TechDraw_ExtensionLockUnlockView: 'td:lockView',
  TechDraw_ExtensionPosHorizChainDimension: 'td:posH', TechDraw_ExtensionPositionSectionView: 'td:positionSection', TechDraw_ExtensionPosObliqueChainDimension: 'td:posO',
  TechDraw_ExtensionPosVertChainDimension: 'td:posV', TechDraw_ExtensionRemovePrefixChar: 'td:prefixRemove', TechDraw_ExtensionSelectLineAttributes: 'td:selectLineAttributes',
  TechDraw_ExtensionShortenLine: 'td:shortenLine', TechDraw_ExtensionThreadBoltBottom: 'td:threadBoltBottom', TechDraw_ExtensionThreadBoltSide: 'td:threadBoltSide',
  TechDraw_ExtensionThreadHoleBottom: 'td:threadHoleBottom', TechDraw_ExtensionThreadHoleSide: 'td:threadHoleSide', TechDraw_ExtensionVertexAtIntersection: 'td:intersection',
  TechDraw_FaceCenterLine: 'td:faceCenter', TechDraw_FillTemplateFields: 'td:fillFields', TechDraw_GeometricHatch: 'tool:hatch', TechDraw_Hatch: 'tool:hatch', TechDraw_HoleShaftFit: 'td:holeShaftFit',
  TechDraw_HorizontalExtentDimension: 'td:extentH', TechDraw_Midpoints: 'td:midpoints', TechDraw_MoveView: 'td:moveView', TechDraw_PageTemplate: 'td:pageTemplate', TechDraw_ProjectShape: 'solidProject',
  TechDraw_Quadrants: 'td:quadrants', TechDraw_RedrawPage: 'td:redraw', TechDraw_RichTextAnnotation: 'tool:text', TechDraw_ShareView: 'td:shareView', TechDraw_ShowAll: 'td:showAll',
  TechDraw_SpreadsheetView: 'td:sheetView', TechDraw_StackBottom: 'td:stackBottom', TechDraw_StackDown: 'td:stackDown', TechDraw_StackTop: 'td:stackTop', TechDraw_StackUp: 'td:stackUp',
  TechDraw_SurfaceFinishSymbols: 'td:surfaceFinish', TechDraw_Symbol: 'td:symbol', TechDraw_ToggleFrame: 'td:toggleFrame', TechDraw_VerticalExtentDimension: 'td:extentV', TechDraw_WeldSymbol: 'td:weld',
};

