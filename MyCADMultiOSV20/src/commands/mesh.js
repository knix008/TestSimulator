// FreeCAD's Mesh, MeshPart, Points, Reverse Engineering, Surface and
// Inspection commands MyCAD did not have yet. Meshes are 'mesh' solids
// (triangles in world coordinates after a command), clouds are 'points'
// solids; picked faces, edges and vertices come from the 3D element selection.
import './mesh-icons.js';
import { addEntity } from '../domain/drawing.js';
import { solidMesh, solidPoints, SOLID_KINDS, SOLIDS } from '../domain/solids.js';
import { normalizeEntity } from '../domain/entities.js';
import { meshPieces } from '../domain/partops.js';
import { pathPoints } from '../domain/draft.js';
import { splineData } from '../domain/sketch.js';
import { apply as apply3, rotationOf } from '../domain/transform3d.js';
import {
  addFacet, approximateCurve, approximateSurface, blendCurve, boundaryLoops, boundingBox, colorScale, crossSections, curveOnMesh, extendFace, fillHoles,
  flipNormals, insideScreenPolygon, inspectDistances, reconstructSurface, refineMesh, scaleMesh, segmentBestFit, segmentSmooth, smoothMesh, splitComponents,
  structurePoints, triangleGrid, triangleInfo, trimByPlane, unwrapMesh, unwrappedOutline, vertexCurvatures,
} from '../domain/meshops.js';


const flatTris = (tris) => tris.flat(2);
const fmtVec = (v, fmt) => v.map((x) => fmt(x, 3)).join(', ');

export function meshCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const solids = () => app.selectedSolids();
  const meshes = () => solids().filter((e) => e.kind === 'mesh');
  const clouds = () => solids().filter((e) => e.kind === 'points');
  const elements = (kind) => (state.elements ?? []).filter((el) => !kind || el.kind === kind);
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const close = () => [{ id: 'ok', label: t('sk.close'), primary: true }];
  const worldTris = (e) => solidMesh(e);

  /** A new mesh solid (world coordinates). */
  const newMesh = (d, name, tris, extra = {}) => addEntity(d, 'solid', { kind: 'mesh', name, params: {}, shape: { tris: flatTris(tris), ...(extra.shape ?? {}) }, ...(extra.layer ? { layer: extra.layer } : {}) });
  const newWire = (d, name, paths) => addEntity(d, 'solid', { kind: 'wire3d', name, params: {}, shape: { paths } });
  const newCloud = (d, name, pts, extra = {}) => addEntity(d, 'solid', { kind: 'points', name, params: {}, shape: { pts: pts.flat(), ...(extra.shape ?? {}) } });
  /** A mesh's triangles replaced (placement folded in). */
  const setTris = (d, id, tris, shape = {}) => {
    d.entities = d.entities.map((e) => (e.id === id ? normalizeEntity({ ...e, kind: 'mesh', params: {}, shape: { tris: flatTris(tris), ...shape }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false }) ?? e : e));
  };
  /** Each selected mesh changed by op(tris) (one undo step). */
  function eachMesh(label, op, done) {
    const list = meshes();
    if (!list.length) { app.notify('info', t('mesh.pickMesh')); return; }
    app.change(label, (d) => { for (const e of list) setTris(d, e.id, op(worldTris(e), e)); });
    if (done) app.notify('success', done);
  }

  // ── information

  async function boundingBoxInfo() {
    const target = solids()[0];
    const box = boundingBox(worldTris(target));
    if (!box) return;
    await app.form({ title: t('mesh.boundingBox'), icon: 'meshBoundingBox', width: 520, fields: [
      { key: 'min', type: 'info', label: t('mesh.min'), icon: 'coordinate', value: fmtVec(box.min, app.fmt) },
      { key: 'max', type: 'info', label: t('mesh.max'), icon: 'coordinate', value: fmtVec(box.max, app.fmt) },
      { key: 'size', type: 'info', label: t('mesh.size'), icon: 'meshBoundingBox', value: fmtVec(box.size, app.fmt) },
      { key: 'center', type: 'info', label: t('mesh.center'), icon: 'coordinate', value: fmtVec(box.center, app.fmt) },
    ], actions: close() });
  }

  async function faceInfo() {
    const face = elements('face')[0];
    const tris = app.elementTriangles(face);
    const area = tris.reduce((s, tri) => s + triangleInfo(tri).area, 0);
    const first = triangleInfo(tris[0]);
    await app.form({ title: t('mesh.faceInfo'), icon: 'meshFaceInfo', width: 520, fields: [
      { key: 'triangles', type: 'info', label: t('mesh.triangles'), icon: 'meshFaceInfo', value: String(tris.length) },
      { key: 'area', type: 'info', label: t('mesh.area'), icon: 'meshFaceInfo', value: `${app.fmt(area, 4)} mm²` },
      { key: 'normal', type: 'info', label: t('mesh.normal'), icon: 'meshFlipNormals', value: fmtVec(first.normal, app.fmt) },
      { key: 'center', type: 'info', label: t('mesh.center'), icon: 'coordinate', value: fmtVec(first.center, app.fmt) },
    ], actions: close() });
  }

  async function curvatureInfo() {
    const pick = elements('vertex')[0] ?? elements()[0];
    const entity = drawing().entities.find((e) => e.id === pick.id);
    const at = app.elementPoints(pick)[0] ?? pick.signature?.center;
    const k = vertexCurvatures(worldTris(entity));
    const nearest = k.reduce((best, v) => (Math.hypot(...v.point.map((x, i) => x - at[i])) < Math.hypot(...best.point.map((x, i) => x - at[i])) ? v : best), k[0]);
    await app.form({ title: t('mesh.curvatureInfo'), icon: 'meshCurvature', width: 480, fields: [
      { key: 'k1', type: 'info', label: t('mesh.k1'), icon: 'meshCurvature', value: app.fmt(nearest.k1, 6) },
      { key: 'k2', type: 'info', label: t('mesh.k2'), icon: 'meshCurvature', value: app.fmt(nearest.k2, 6) },
      { key: 'mean', type: 'info', label: t('mesh.mean'), icon: 'meshCurvature', value: app.fmt(nearest.mean, 6) },
      { key: 'gaussian', type: 'info', label: t('mesh.gaussian'), icon: 'meshCurvature', value: app.fmt(nearest.gaussian, 6) },
    ], actions: close() });
    return nearest;
  }

  async function curvaturePlot() {
    const target = solids()[0];
    const answer = await app.form({ title: t('mesh.curvaturePlot'), icon: 'meshCurvaturePlot', width: 460, fields: [
      { key: 'which', type: 'select', label: t('mesh.curvature'), icon: 'meshCurvature', value: 'mean', options: ['mean', 'gaussian', 'k1', 'k2'].map((k) => [k, t(`mesh.${k}`)]) },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const tris = worldTris(target);
    const k = vertexCurvatures(tris);
    const byKey = new Map(k.map((v) => [v.point.map((x) => Math.round(x * 1e5)).join(','), v[answer.values.which]]));
    const valueAt = (p) => byKey.get(p.map((x) => Math.round(x * 1e5)).join(',')) ?? 0;
    const values = tris.map((tri) => (valueAt(tri[0]) + valueAt(tri[1]) + valueAt(tri[2])) / 3);
    // The scale runs from the 5th to the 95th percentile (sharp corners would hide the rest).
    const sorted = values.slice().sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
    const hi = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const colors = values.flatMap((v) => colorScale(v, lo, hi));
    const made = app.change('mesh.op.curvature', (d) => newMesh(d, `${t('mesh.curvaturePlot')} (${app.labelOf(target)})`, tris, { shape: { colors } }));
    app.select([made.id]);
    app.notify('success', t('mesh.scale', { lo: app.fmt(lo, 4), hi: app.fmt(hi, 4) }));
  }

  // ── making meshes

  async function regularSolid() {
    const kinds = SOLID_KINDS.filter((k) => k !== 'helix');
    // One dialog: the size fields follow the chosen solid.
    const fields = (kind) => [
      { key: 'kind', type: 'select', label: t('mesh.solidKind'), icon: 'meshRegularSolid', value: kind, options: kinds.map((k) => [k, t(`solid.${k}`)]) },
      ...SOLIDS[kind].params.map((p) => ({ key: p.key, type: 'number', label: t(`solidParam.${p.key}`), icon: 'move', value: p.def, min: p.min, max: p.max, step: p.step ?? 1, ...(p.unit ? { unit: p.unit } : {}) })),
    ];
    let kind = 'box';
    const most = Math.max(...kinds.map((k) => SOLIDS[k].params.length));
    const answer = await app.form({ title: t('mesh.regularSolid'), icon: 'meshRegularSolid', width: 460, live: true, reserveRows: most - SOLIDS.box.params.length, fields: fields(kind), actions: ok() }, {
      onChange: ({ values }) => { if (values.kind !== kind) { kind = values.kind; app.popups.post('form', { type: 'form:fields', fields: fields(kind) }); } },
    });
    if (answer?.action !== 'ok') return null;
    kind = answer.values.kind;
    const params = Object.fromEntries(SOLIDS[kind].params.map((p) => [p.key, Number.isFinite(answer.values[p.key]) ? answer.values[p.key] : p.def]));
    const tris = solidMesh(normalizeEntity({ type: 'solid', kind, params }));
    const made = app.change('mesh.op.regular', (d) => newMesh(d, t(`solid.${kind}`), tris));
    app.select([made.id]);
    return made;
  }

  async function fromShape() {
    const list = solids().filter((e) => e.kind !== 'mesh' && e.kind !== 'points' && e.kind !== 'wire3d');
    const answer = await app.form({ title: t('mesh.fromShape'), icon: 'meshFromShape', width: 460, fields: [
      { key: 'maxEdge', type: 'number', label: t('mesh.maxEdge'), icon: 'meshRefine', value: 0, min: 0, step: 1, unit: 'mm' },
    ], actions: ok() });
    if (answer?.action !== 'ok') return;
    const made = app.change('mesh.op.fromShape', (d) => list.map((e) => {
      const tris = worldTris(e);
      return newMesh(d, `${t('mesh.meshOf')} ${app.labelOf(e)}`, answer.values.maxEdge > 0 ? refineMesh(tris, answer.values.maxEdge) : tris, { layer: e.layer });
    }));
    app.select(made.map((e) => e.id));
    app.notify('success', t('mesh.meshed', { count: made.length }));
  }

  function merge() {
    const list = meshes();
    const made = app.change('mesh.op.merge', (d) => {
      d.entities = d.entities.filter((e) => !list.some((x) => x.id === e.id));
      return newMesh(d, t('mesh.merged'), list.flatMap(worldTris), { layer: list[0].layer });
    });
    app.select([made.id]);
  }

  async function asked(titleKey, icon, fields) {
    const answer = await app.form({ title: t(titleKey), icon, width: 460, fields, actions: ok() });
    return answer?.action === 'ok' ? answer.values : null;
  }

  // ── cutting with a polygon drawn on the view

  /** Waits for a polygon on the 3D view (opened if needed). */
  async function polygon() {
    if (!state.view3d) await app.toggle3d(true);
    const v = app.view3d.instance;
    if (!v) return null;
    app.notify('info', t('mesh.drawPolygon'));
    return new Promise((resolve) => v.startPolygonSelect((poly) => resolve(poly ? { poly, v } : null)));
  }

  async function polyOp(mode) {
    const list = meshes();
    if (!list.length) { app.notify('info', t('mesh.pickMesh')); return; }
    const got = await polygon();
    if (!got) return;
    const project = (p) => got.v.projectToScreen([p])[0];
    let changed = 0;
    app.change(`mesh.op.${mode}`, (d) => {
      for (const e of list) {
        const tris = worldTris(e);
        const inside = insideScreenPolygon(tris, project, got.poly);
        const inner = tris.filter((_, i) => inside[i]);
        const outer = tris.filter((_, i) => !inside[i]);
        if (!inner.length) continue;
        changed += inner.length;
        if (mode === 'polyTrim') setTris(d, e.id, inner);
        else setTris(d, e.id, outer);
        if (mode === 'polySplit') newMesh(d, `${app.labelOf(e)} (${t('mesh.part')})`, inner, { layer: e.layer });
        if (mode === 'polySegment') newMesh(d, `${app.labelOf(e)} (${t('mesh.segment')})`, inner, { layer: e.layer, shape: { colors: inner.flatMap(() => [0.95, 0.45, 0.2]) } });
      }
    });
    app.notify(changed ? 'success' : 'info', t(changed ? 'mesh.polyDone' : 'mesh.polyNothing', { count: changed }));
  }

  async function pointsPolyCut() {
    const list = clouds();
    if (!list.length) { app.notify('info', t('mesh.pickCloud')); return; }
    const got = await polygon();
    if (!got) return;
    let removed = 0;
    app.change('mesh.op.pointsCut', (d) => {
      for (const e of list) {
        const pts = solidPoints(e);
        const inside = insideScreenPolygon(pts, (p) => got.v.projectToScreen([p])[0], got.poly);
        removed += inside.filter(Boolean).length;
        const kept = pts.filter((_, i) => !inside[i]);
        d.entities = d.entities.map((x) => (x.id === e.id ? normalizeEntity({ ...x, shape: { pts: kept.flat() }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }) ?? x : x));
      }
    });
    app.notify('success', t('mesh.pointsRemoved', { count: removed }));
  }

  // ── editing

  async function trimPlane() {
    const datum = app.selectedEntities().find((e) => e.kind === 'datum');
    const v = await asked('mesh.trimPlane', 'meshTrimPlane', [
      ...(datum ? [{ key: 'useDatum', type: 'check', label: t('mesh.useDatum'), icon: 'meshTrimPlane', value: true }] : []),
      { key: 'axis', type: 'select', label: t('mesh.planeNormal'), icon: 'axes', value: 'z', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
      { key: 'offset', type: 'number', label: t('mesh.planeAt'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'keep', type: 'select', label: t('mesh.keep'), icon: 'meshTrimPlane', value: 'below', options: [['below', t('mesh.below')], ['above', t('mesh.above')]] },
    ]);
    if (!v) return;
    const [origin, normal] = v.useDatum && datum
      ? [[datum.x ?? 0, datum.y ?? 0, datum.z ?? 0], apply3(rotationOf(datum), [0, 0, 1])]
      : [{ x: [v.offset, 0, 0], y: [0, v.offset, 0], z: [0, 0, v.offset] }[v.axis], { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[v.axis]];
    eachMesh('mesh.op.trim', (tris) => trimByPlane(tris, origin, normal, v.keep), t('mesh.trimmed'));
  }

  async function fillHole() {
    const pick = [...elements('edge'), ...elements('vertex')][0];
    const near = pick ? app.elementPoints(pick)[0] : null;
    const target = pick ? drawing().entities.find((e) => e.id === pick.id) : meshes()[0];
    if (!target) { app.notify('info', t('mesh.pickMesh')); return; }
    let filled = 0;
    app.change('mesh.op.fillHole', (d) => { const r = fillHoles(worldTris(target), { near }); filled = r.filled; setTris(d, target.id, r.tris); });
    app.notify(filled ? 'success' : 'info', t(filled ? 'mesh.holesFilled' : 'mesh.noHoles', { count: filled }));
  }

  function addTriangle() {
    const picks = elements('vertex');
    if (picks.length !== 3) { app.notify('info', t('mesh.pickThreeVertices')); return; }
    const target = drawing().entities.find((e) => e.id === picks[0].id);
    const tri = picks.map((p) => app.elementPoints(p)[0]);
    app.change('mesh.op.addFacet', (d) => setTris(d, target.id, addFacet(worldTris(target), tri)));
    app.clearElements();
  }

  function removeComponentsByHand() {
    const faces = elements('face');
    if (!faces.length) { app.notify('info', t('mesh.pickFaces')); return; }
    const key = (tri) => tri.map((p) => p.map((x) => Math.round(x * 1e5)).join(',')).sort().join('|');
    const byEntity = new Map();
    for (const f of faces) {
      if (!byEntity.has(f.id)) byEntity.set(f.id, new Set());
      for (const tri of app.elementTriangles(f)) byEntity.get(f.id).add(key(tri));
    }
    let removed = 0;
    app.change('mesh.op.removeComponents', (d) => {
      for (const [id, keys] of byEntity) {
        const e = d.entities.find((x) => x.id === id);
        const kept = meshPieces(worldTris(e)).filter((piece) => { const hit = piece.some((tri) => keys.has(key(tri))); if (hit) removed++; return !hit; });
        setTris(d, id, kept.flat());
      }
    });
    app.clearElements();
    app.notify('success', t('mesh.componentsRemoved', { count: removed }));
  }

  function splitInto(label, pieces, source, names) {
    return app.change(label, (d) => {
      d.entities = d.entities.filter((e) => e.id !== source.id);
      return pieces.map((tris, i) => newMesh(d, names(i), tris.tris ?? tris, { layer: source.layer, ...(tris.colors ? { shape: { colors: tris.colors } } : {}) }));
    });
  }

  const SEGMENT_COLORS = [[0.93, 0.33, 0.31], [0.2, 0.6, 0.86], [0.18, 0.8, 0.44], [0.95, 0.77, 0.06], [0.61, 0.35, 0.71], [0.9, 0.49, 0.13], [0.1, 0.74, 0.61], [0.75, 0.75, 0.75]];
  const painted = (tris, i) => ({ tris, colors: tris.flatMap(() => SEGMENT_COLORS[i % SEGMENT_COLORS.length]) });

  function segmentation(bestFit) {
    const e = meshes()[0];
    const tris = worldTris(e);
    const parts = bestFit ? segmentBestFit(tris) : segmentSmooth(tris).map((r) => ({ type: 'region', tris: r }));
    const made = splitInto('mesh.op.segment', parts.map((p, i) => painted(p.tris, i)), e, (i) => `${app.labelOf(e)} · ${bestFit ? t(`mesh.fit.${parts[i].type}`) : t('mesh.segmentN', { n: i + 1 })}`);
    app.select(made.map((x) => x.id));
    app.notify('success', t('mesh.segmented', { count: made.length }));
  }

  function splitAll() {
    const e = meshes()[0];
    const pieces = splitComponents(worldTris(e));
    const made = splitInto('mesh.op.split', pieces, e, (i) => `${app.labelOf(e)} ${i + 1}`);
    app.select(made.map((x) => x.id));
    app.notify('success', t('mesh.splitDone', { count: made.length }));
  }

  // ── unwrapping, curves

  function unwrapInto2d(label, tris, name) {
    const flat = unwrapMesh(tris);
    if (!flat) { app.notify('info', t('mesh.cannotUnwrap')); return null; }
    const segments = unwrappedOutline(flat);
    const group = { id: app.newId(), name, parent: null };
    const made = app.change(label, (d) => {
      d.groups = [...(d.groups ?? []), group];
      return segments.map(([p, q]) => addEntity(d, 'line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, group: group.id }));
    });
    if (state.view3d) app.toggle3d(false);
    app.select(made.map((x) => x.id));
    app.zoomToSelection();
    app.notify('success', t('mesh.unwrapped', { count: made.length }));
    return made;
  }

  function curveOn() {
    const picks = elements('vertex');
    if (picks.length < 2) { app.notify('info', t('mesh.pickVertices')); return; }
    const target = drawing().entities.find((e) => e.id === picks[0].id);
    const path = curveOnMesh(worldTris(target), picks.map((p) => app.elementPoints(p)[0]));
    const made = app.change('mesh.op.curveOnMesh', (d) => newWire(d, t('mesh.curveOnMesh'), [path]));
    app.clearElements();
    app.select([made.id]);
  }

  /** Surface_BlendCurve: between two picked 3D edges, or two selected 2D curves, from their nearest ends. */
  function blend() {
    const edges = elements('edge');
    if (edges.length >= 2) {
      const [a, b] = edges.slice(0, 2).map((el) => app.elementPoints(el));
      const ends = (P) => [{ point: P[0], tangent: P[0].map((v, k) => v - P[1][k]) }, { point: P[P.length - 1], tangent: P[P.length - 1].map((v, k) => v - P[P.length - 2][k]) }];
      const pairs = ends(a).flatMap((x) => ends(b).map((y) => [x, y])).sort((p, q) => Math.hypot(...p[0].point.map((v, k) => v - p[1].point[k])) - Math.hypot(...q[0].point.map((v, k) => v - q[1].point[k])));
      const path = blendCurve(pairs[0][0], pairs[0][1]);
      const made = app.change('mesh.op.blend', (d) => newWire(d, t('mesh.blendCurve'), [path]));
      app.clearElements();
      app.select([made.id]);
      return;
    }
    const curves = app.selectedEntities().filter((e) => pathPoints(e) && !pathPoints(e).closed);
    if (curves.length !== 2) { app.notify('info', t('mesh.pickTwoCurves')); return; }
    const ends = (e) => { const P = pathPoints(e).points.map((p) => [p.x, p.y, 0]); return [{ point: P[0], tangent: P[0].map((v, k) => v - P[1][k]) }, { point: P[P.length - 1], tangent: P[P.length - 1].map((v, k) => v - P[P.length - 2][k]) }]; };
    const pairs = ends(curves[0]).flatMap((x) => ends(curves[1]).map((y) => [x, y])).sort((p, q) => Math.hypot(p[0].point[0] - p[1].point[0], p[0].point[1] - p[1].point[1]) - Math.hypot(q[0].point[0] - q[1].point[0], q[0].point[1] - q[1].point[1]));
    const [x, y] = pairs[0];
    const dist = Math.hypot(x.point[0] - y.point[0], x.point[1] - y.point[1]);
    const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const [ta, tb] = [unit(x.tangent), unit(y.tangent)];
    const ctrl = [x.point, [x.point[0] + (ta[0] * dist) / 3, x.point[1] + (ta[1] * dist) / 3], [y.point[0] + (tb[0] * dist) / 3, y.point[1] + (tb[1] * dist) / 3], y.point].map(([px, py]) => ({ x: px, y: py }));
    const made = app.change('mesh.op.blend', (d) => addEntity(d, 'spline', { ...splineData({ degree: 3, points: ctrl, knots: [0, 0, 0, 0, 1, 1, 1, 1], weights: null }), layer: curves[0].layer }));
    app.select([made.id]);
  }

  async function extend() {
    const face = elements('face')[0];
    const v = await asked('mesh.extendFace', 'surfExtendFace', [{ key: 'distance', type: 'number', label: t('mesh.distance'), icon: 'move', value: 5, min: 0.001, step: 1, unit: 'mm' }]);
    if (!v) return;
    const tris = extendFace(app.elementTriangles(face), v.distance);
    const made = app.change('mesh.op.extendFace', (d) => newMesh(d, t('mesh.extendedFace'), tris));
    app.clearElements();
    app.select([made.id]);
  }

  // ── reverse engineering

  /** Points to fit: a cloud, the picked vertices, or the vertices of a mesh. */
  function samplePoints() {
    const cloud = clouds()[0];
    if (cloud) return solidPoints(cloud);
    const picks = elements('vertex');
    if (picks.length >= 3) return picks.map((p) => app.elementPoints(p)[0]);
    const mesh = solids()[0];
    if (!mesh) return [];
    const seen = new Map();
    for (const tri of worldTris(mesh)) for (const p of tri) seen.set(p.map((x) => Math.round(x * 1e5)).join(','), p);
    return [...seen.values()];
  }

  async function approxCurve() {
    const pts = samplePoints();
    if (pts.length < 4) { app.notify('info', t('mesh.needPoints')); return; }
    const v = await asked('mesh.approxCurve', 'reApproxCurve', [{ key: 'controls', type: 'number', label: t('mesh.controlPoints'), icon: 'reApproxCurve', value: 8, min: 4, max: 200, step: 1 }]);
    if (!v) return;
    const path = approximateCurve(pts, Math.round(v.controls));
    const made = app.change('mesh.op.approx', (d) => newWire(d, t('mesh.approxCurve'), [path]));
    app.select([made.id]);
  }

  async function approxSurface(kind) {
    const pts = samplePoints();
    if (pts.length < 6) { app.notify('info', t('mesh.needPoints')); return; }
    const v = kind === 'bspline' ? await asked('mesh.approxSurface', 'reApproxSurface', [{ key: 'controls', type: 'number', label: t('mesh.controlPoints'), icon: 'reApproxSurface', value: 6, min: 4, max: 20, step: 1 }]) : {};
    if (!v) return;
    const surface = approximateSurface(pts, { kind, controls: Math.round(v.controls ?? 6) });
    const made = app.change('mesh.op.approx', (d) => newMesh(d, t(kind === 'bspline' ? 'mesh.approxSurface' : 'mesh.approxPolynomial'), surface.tris));
    app.select([made.id]);
    app.notify('success', t('mesh.fitRms', { rms: app.fmt(surface.rms, 5) }));
  }

  function meshBoundary() {
    const e = meshes()[0] ?? solids()[0];
    const { mesh, loops } = boundaryLoops(worldTris(e));
    if (!loops.length) { app.notify('info', t('mesh.closedNoBoundary')); return; }
    const made = app.change('mesh.op.boundary', (d) => newWire(d, `${t('mesh.boundaryOf')} ${app.labelOf(e)}`, loops.map((l) => [...l, l[0]].map((i) => mesh.points[i]))));
    app.select([made.id]);
  }

  async function poisson() {
    const pts = samplePoints();
    if (pts.length < 20) { app.notify('info', t('mesh.needPoints')); return; }
    const v = await asked('mesh.poisson', 'rePoisson', [{ key: 'depth', type: 'number', label: t('mesh.depth'), icon: 'rePoisson', value: 5, min: 3, max: 7, step: 1 }]);
    if (!v) return;
    const tris = reconstructSurface(pts, { depth: Math.round(v.depth) });
    const made = app.change('mesh.op.poisson', (d) => newMesh(d, t('mesh.reconstructed'), tris));
    app.select([made.id]);
    app.notify('success', t('mesh.meshed', { count: 1 }));
  }

  // ── points

  function mergeClouds() {
    const list = clouds();
    const made = app.change('mesh.op.mergeClouds', (d) => {
      d.entities = d.entities.filter((e) => !list.some((x) => x.id === e.id));
      return newCloud(d, t('mesh.mergedCloud'), list.flatMap((e) => solidPoints(e)));
    });
    app.select([made.id]);
  }

  async function structure() {
    const e = clouds()[0];
    const pts = solidPoints(e);
    const side = Math.max(2, Math.round(Math.sqrt(pts.length)));
    const v = await asked('mesh.structure', 'pointsStructure', [
      { key: 'width', type: 'number', label: t('mesh.gridWidth'), icon: 'pointsStructure', value: side, min: 2, max: 2000, step: 1 },
      { key: 'height', type: 'number', label: t('mesh.gridHeight'), icon: 'pointsStructure', value: side, min: 2, max: 2000, step: 1 },
    ]);
    if (!v) return;
    const s = structurePoints(pts, Math.round(v.width), Math.round(v.height));
    const made = app.change('mesh.op.structure', (d) => newCloud(d, `${app.labelOf(e)} (${s.width}×${s.height})`, s.points));
    app.select([made.id]);
  }

  // ── inspection

  async function visualInspection() {
    const list = solids();
    const actual = list.find((e) => e.kind === 'mesh' || e.kind === 'points') ?? list[0];
    const nominal = list.find((e) => e !== actual);
    if (!actual || !nominal) { app.notify('info', t('mesh.pickInspect')); return null; }
    const nominalTris = worldTris(nominal);
    const isCloud = actual.kind === 'points';
    const pts = isCloud ? solidPoints(actual) : worldTris(actual).map((tri) => triangleInfo(tri).center);
    const r = inspectDistances(pts, nominalTris);
    const range = Math.max(Math.abs(r.min), Math.abs(r.max)) || 1;
    const colors = r.distances.flatMap((d) => colorScale(d, -range, range));
    const inspect = { nominal: nominal.id, min: r.min, max: r.max, rms: r.rms };
    const name = `${t('mesh.inspectionOf')} ${app.labelOf(actual)}`;
    const made = app.change('mesh.op.inspect', (d) => (isCloud ? newCloud(d, name, pts, { shape: { colors, inspect } }) : newMesh(d, name, worldTris(actual), { shape: { colors, inspect } })));
    app.select([made.id]);
    await app.form({ title: t('mesh.visualInspection'), icon: 'inspectVisual', width: 460, fields: [
      { key: 'min', type: 'info', label: t('mesh.minDistance'), icon: 'inspectVisual', value: `${app.fmt(r.min, 4)} mm` },
      { key: 'max', type: 'info', label: t('mesh.maxDistance'), icon: 'inspectVisual', value: `${app.fmt(r.max, 4)} mm` },
      { key: 'rms', type: 'info', label: t('mesh.rms'), icon: 'inspectVisual', value: `${app.fmt(r.rms, 4)} mm` },
    ], actions: close() });
    return made;
  }

  async function inspectElement() {
    const pick = elements('vertex')[0] ?? elements()[0];
    const result = drawing().entities.find((e) => e.id === pick?.id && e.shape?.inspect);
    if (!result) { app.notify('info', t('mesh.pickInspected')); return null; }
    const nominal = drawing().entities.find((e) => e.id === result.shape.inspect.nominal);
    if (!nominal) { app.notify('info', t('mesh.nominalGone')); return null; }
    const at = app.elementPoints(pick)[0] ?? pick.signature?.center;
    const hit = triangleGrid(worldTris(nominal)).nearest(at);
    const { distances } = inspectDistances([at], worldTris(nominal));
    await app.form({ title: t('mesh.inspectElement'), icon: 'inspectElement', width: 460, fields: [
      { key: 'point', type: 'info', label: t('mesh.point'), icon: 'coordinate', value: fmtVec(at, app.fmt) },
      { key: 'distance', type: 'info', label: t('mesh.distance'), icon: 'inspectElement', value: `${app.fmt(distances[0], 4)} mm` },
      { key: 'nearest', type: 'info', label: t('mesh.nearestNominal'), icon: 'coordinate', value: fmtVec(hit.point, app.fmt) },
    ], actions: close() });
    return distances[0];
  }

  const anyMesh = () => meshes().length > 0;
  const oneSolid = () => solids().length > 0;
  return {
    'mesh:addFacet': { icon: 'meshAddFacet', label: 'mesh.addFacet', enabled: () => elements('vertex').length === 3, run: () => addTriangle() },
    'mesh:boundingBox': { icon: 'meshBoundingBox', label: 'mesh.boundingBox', enabled: oneSolid, run: () => boundingBoxInfo() },
    'mesh:regularSolid': { icon: 'meshRegularSolid', label: 'mesh.regularSolid', enabled: hasDoc, run: () => regularSolid() },
    'mesh:crossSections': { icon: 'meshCrossSections', label: 'mesh.crossSections', enabled: oneSolid, run: async () => {
      const v = await asked('mesh.crossSections', 'meshCrossSections', [
        { key: 'axis', type: 'select', label: t('mesh.across'), icon: 'axes', value: 'z', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
        { key: 'count', type: 'number', label: t('pd.count'), icon: 'meshCrossSections', value: 5, min: 1, max: 200, step: 1 },
      ]);
      if (!v) return;
      const paths = solids().flatMap((e) => crossSections(worldTris(e), v.axis, Math.round(v.count)));
      const made = app.change('mesh.op.sections', (d) => newWire(d, t('mesh.crossSections'), paths));
      app.select([made.id]);
    } },
    'mesh:curvatureInfo': { icon: 'meshCurvature', label: 'mesh.curvatureInfo', enabled: () => elements().length > 0, run: () => curvatureInfo() },
    'mesh:curvaturePlot': { icon: 'meshCurvaturePlot', label: 'mesh.curvaturePlot', enabled: oneSolid, run: () => curvaturePlot() },
    'mesh:faceInfo': { icon: 'meshFaceInfo', label: 'mesh.faceInfo', enabled: () => elements('face').length > 0, run: () => faceInfo() },
    'mesh:fillHole': { icon: 'meshFillHole', label: 'mesh.fillHole', enabled: () => anyMesh() || elements().length > 0, run: () => fillHole() },
    'mesh:flipNormals': { icon: 'meshFlipNormals', label: 'mesh.flipNormals', enabled: anyMesh, run: () => eachMesh('mesh.op.flip', flipNormals, t('mesh.flipped')) },
    'mesh:fromShape': { icon: 'meshFromShape', label: 'mesh.fromShape', enabled: () => solids().some((e) => !['mesh', 'points', 'wire3d'].includes(e.kind)), run: () => fromShape() },
    'mesh:merge': { icon: 'meshMerge', label: 'mesh.merge', enabled: () => meshes().length >= 2, run: () => merge() },
    'mesh:polyCut': { icon: 'meshPolyCut', label: 'mesh.polyCut', enabled: anyMesh, run: () => polyOp('polyCut') },
    'mesh:polyTrim': { icon: 'meshPolyTrim', label: 'mesh.polyTrim', enabled: anyMesh, run: () => polyOp('polyTrim') },
    'mesh:polySplit': { icon: 'meshPolySplit', label: 'mesh.polySplit', enabled: anyMesh, run: () => polyOp('polySplit') },
    'mesh:polySegment': { icon: 'meshPolySegment', label: 'mesh.polySegment', enabled: anyMesh, run: () => polyOp('polySegment') },
    'mesh:refine': { icon: 'meshRefine', label: 'mesh.refine', enabled: anyMesh, run: async () => { const v = await asked('mesh.refine', 'meshRefine', [{ key: 'maxEdge', type: 'number', label: t('mesh.maxEdge'), icon: 'meshRefine', value: 2, min: 0.001, step: 0.5, unit: 'mm' }]); if (v) eachMesh('mesh.op.refine', (tris) => refineMesh(tris, v.maxEdge), t('mesh.refined')); } },
    'mesh:removeComponentsByHand': { icon: 'meshRemoveComponent', label: 'mesh.removeComponentsByHand', enabled: () => elements('face').length > 0, run: () => removeComponentsByHand() },
    'mesh:scale': { icon: 'meshScale', label: 'mesh.scaleMesh', enabled: anyMesh, run: async () => { const v = await asked('mesh.scaleMesh', 'meshScale', [{ key: 'factor', type: 'number', label: t('mesh.factor'), icon: 'meshScale', value: 2, min: 0.0001, step: 0.1 }]); if (v) eachMesh('mesh.op.scale', (tris) => scaleMesh(tris, v.factor)); } },
    'mesh:segmentation': { icon: 'meshSegmentation', label: 'mesh.segmentation', enabled: anyMesh, run: () => segmentation(false) },
    'mesh:segmentationBestFit': { icon: 'meshBestFit', label: 'mesh.segmentationBestFit', enabled: anyMesh, run: () => segmentation(true) },
    'mesh:smooth': { icon: 'meshSmooth', label: 'mesh.smooth', enabled: anyMesh, run: async () => { const v = await asked('mesh.smooth', 'meshSmooth', [{ key: 'iterations', type: 'number', label: t('mesh.iterations'), icon: 'meshSmooth', value: 5, min: 1, max: 200, step: 1 }]); if (v) eachMesh('mesh.op.smooth', (tris) => smoothMesh(tris, { iterations: Math.round(v.iterations) }), t('mesh.smoothed')); } },
    'mesh:splitComponents': { icon: 'meshSplitComponents', label: 'mesh.splitComponents', enabled: anyMesh, run: () => splitAll() },
    'mesh:trimPlane': { icon: 'meshTrimPlane', label: 'mesh.trimPlane', enabled: anyMesh, run: () => trimPlane() },
    'mesh:unwrapFace': { icon: 'meshUnwrapFace', label: 'mesh.unwrapFace', enabled: () => elements('face').length > 0, run: () => unwrapInto2d('mesh.op.unwrap', app.elementTriangles(elements('face')[0]), t('mesh.unwrappedFace')) },
    'mesh:unwrapMesh': { icon: 'meshUnwrapMesh', label: 'mesh.unwrapMesh', enabled: oneSolid, run: () => unwrapInto2d('mesh.op.unwrap', worldTris(solids()[0]), `${t('mesh.unwrappedOf')} ${app.labelOf(solids()[0])}`) },
    'mesh:curveOnMesh': { icon: 'meshCurveOnMesh', label: 'mesh.curveOnMesh', enabled: () => elements('vertex').length >= 2, run: () => curveOn() },
    'points:merge': { icon: 'pointsMerge', label: 'mesh.mergeClouds', enabled: () => clouds().length >= 2, run: () => mergeClouds() },
    'points:polyCut': { icon: 'pointsPolyCut', label: 'mesh.pointsPolyCut', enabled: () => clouds().length > 0, run: () => pointsPolyCut() },
    'points:structure': { icon: 'pointsStructure', label: 'mesh.structure', enabled: () => clouds().length > 0, run: () => structure() },
    're:approxCurve': { icon: 'reApproxCurve', label: 'mesh.approxCurve', enabled: () => clouds().length > 0 || elements('vertex').length >= 4 || oneSolid(), run: () => approxCurve() },
    're:approxSurface': { icon: 'reApproxSurface', label: 'mesh.approxSurface', enabled: () => clouds().length > 0 || oneSolid(), run: () => approxSurface('bspline') },
    're:approxPolynomial': { icon: 'reApproxPolynomial', label: 'mesh.approxPolynomial', enabled: () => clouds().length > 0 || oneSolid(), run: () => approxSurface('polynomial') },
    're:meshBoundary': { icon: 'reMeshBoundary', label: 'mesh.meshBoundary', enabled: oneSolid, run: () => meshBoundary() },
    're:poisson': { icon: 'rePoisson', label: 'mesh.poisson', enabled: () => clouds().length > 0 || oneSolid(), run: () => poisson() },
    'surface:blendCurve': { icon: 'surfBlendCurve', label: 'mesh.blendCurve', enabled: () => elements('edge').length >= 2 || app.selectedEntities().length === 2, run: () => blend() },
    'surface:extendFace': { icon: 'surfExtendFace', label: 'mesh.extendFace', enabled: () => elements('face').length > 0, run: () => extend() },
    'inspection:visual': { icon: 'inspectVisual', label: 'mesh.visualInspection', enabled: () => solids().length >= 2, run: () => visualInspection() },
    'inspection:element': { icon: 'inspectElement', label: 'mesh.inspectElement', enabled: () => elements().length > 0, run: () => inspectElement() },
  };
}

export const MESH_MENU = {
  mesh: ['mesh:regularSolid', 'mesh:fromShape', 'mesh:merge', '-', 'mesh:boundingBox', 'mesh:faceInfo', 'mesh:curvatureInfo', 'mesh:curvaturePlot', '-', 'mesh:flipNormals', 'mesh:fillHole', 'mesh:addFacet', 'mesh:refine', 'mesh:smooth', 'mesh:scale', '-', 'mesh:trimPlane', 'mesh:polyCut', 'mesh:polyTrim', 'mesh:polySplit', 'mesh:polySegment', '-', 'mesh:crossSections', 'mesh:splitComponents', 'mesh:removeComponentsByHand', 'mesh:segmentation', 'mesh:segmentationBestFit', '-', 'mesh:unwrapFace', 'mesh:unwrapMesh', 'mesh:curveOnMesh'],
  reverse: ['re:approxCurve', 're:approxSurface', 're:approxPolynomial', 're:meshBoundary', 're:poisson', '-', 'points:merge', 'points:polyCut', 'points:structure', '-', 'surface:blendCurve', 'surface:extendFace', '-', 'inspection:visual', 'inspection:element'],
};

export const MESH_FREECAD = {
  Mesh_AddFacet: 'mesh:addFacet', Mesh_BoundingBox: 'mesh:boundingBox', Mesh_BuildRegularSolid: 'mesh:regularSolid', Mesh_CrossSections: 'mesh:crossSections',
  Mesh_CurvatureInfo: 'mesh:curvatureInfo', Mesh_EvaluateFacet: 'mesh:faceInfo', Mesh_FillInteractiveHole: 'mesh:fillHole', Mesh_FlipNormals: 'mesh:flipNormals',
  Mesh_FromGeometry: 'mesh:fromShape', Mesh_FromPartShape: 'mesh:fromShape', Mesh_Merge: 'mesh:merge', Mesh_PolyCut: 'mesh:polyCut', Mesh_PolySegm: 'mesh:polySegment',
  Mesh_PolySplit: 'mesh:polySplit', Mesh_PolyTrim: 'mesh:polyTrim', Mesh_RemeshGmsh: 'mesh:refine', Mesh_RemoveCompByHand: 'mesh:removeComponentsByHand', Mesh_Scale: 'mesh:scale',
  Mesh_Segmentation: 'mesh:segmentation', Mesh_SegmentationBestFit: 'mesh:segmentationBestFit', Mesh_Smoothing: 'mesh:smooth', Mesh_SplitComponents: 'mesh:splitComponents',
  Mesh_TrimByPlane: 'mesh:trimPlane', Mesh_VertexCurvature: 'mesh:curvaturePlot', MeshPart_CreateFlatFace: 'mesh:unwrapFace', MeshPart_CreateFlatMesh: 'mesh:unwrapMesh',
  MeshPart_CrossSections: 'mesh:crossSections', MeshPart_CurveOnMesh: 'mesh:curveOnMesh', MeshPart_Mesher: 'mesh:fromShape', MeshPart_TrimByPlane: 'mesh:trimPlane',
  Points_Convert: 'part:pointsFromShape', Points_Merge: 'points:merge', Points_PolyCut: 'points:polyCut', Points_Structure: 'points:structure',
  Reen_ApproxCurve: 're:approxCurve', Reen_ApproxPolynomial: 're:approxPolynomial', Reen_ApproxSurface: 're:approxSurface', Reen_MeshBoundary: 're:meshBoundary',
  Reen_PoissonReconstruction: 're:poisson', Reen_Segmentation: 'mesh:segmentationBestFit', Reen_SegmentationFromComponents: 'mesh:splitComponents', Reen_SegmentationManual: 'mesh:polySegment',
  Surface_BlendCurve: 'surface:blendCurve', Surface_CurveOnMesh: 'mesh:curveOnMesh', Surface_ExtendFace: 'surface:extendFace',
  Inspection_InspectElement: 'inspection:element', Inspection_VisualInspection: 'inspection:visual',
};

