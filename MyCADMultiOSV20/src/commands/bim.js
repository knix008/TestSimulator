// FreeCAD's BIM, Arch and IFC commands MyCAD did not have yet: component
// additions and subtractions (Arch_Add / Remove / ToggleSubs), cut planes,
// frames, grids, axis and structural systems, merged walls, panel cuts, pipe
// connectors, profiles, references to other drawings, survey, IFC classes,
// classification, property sets and quantities, the IFC spreadsheet,
// explorer, preflight checks and differences, trash, library, example
// building, nudging, working planes, views and the project set-up.
// Its icons are in a module of their own: the popup windows need only them.
import './bim-icons.js';
import { normalizeEntity } from '../domain/entities.js';
import { normalizeSolidData, placement, solidMesh, solidProperties } from '../domain/solids.js';
import { checkSolid, analyzeMesh } from '../domain/meshcheck.js';
import { fillHoles } from '../domain/meshops.js';
import { joinPaths, pathPoints } from '../domain/draft.js';
import { axisLines, EQUIPMENT_SIZES, EQUIPMENT_TYPES, isArchKind, normalizeMaterial, sectionOf, sectionOutline, STEEL_PRESETS } from '../domain/arch.js';
import { importMesh, parseStepEntities } from '../domain/exchange3d.js';
import { polygonArea } from '../domain/geometry.js';
import {
  axisCrossings, CLASSIFICATION_CODES, CLASSIFICATION_SYSTEMS, combineAxes, componentMembers, diffModels, exampleHouse, extendEntity, gluePaths, gridPositions,
  IFC_TYPES, ifcSheetCells, mergeWallPaths, NUDGE_PARAMS, parseProps, preflight, propsText, reorderEntities,
} from '../domain/bimtools.js';


export function bimCommands(app) {
  const { t, state, D } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  // In the order they were picked (FreeCAD: the host of Arch_Add / Remove is picked last).
  const picked = (list) => { const order = app.selectedIds(); return list.slice().sort((p, q) => order.indexOf(p.id) - order.indexOf(q.id)); };
  const solids = () => picked(app.selectedSolids());
  const selected = () => picked(app.selectedEntities());
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const close = () => [{ id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields, extra = {}) => { const a = await app.form({ title: t(titleKey), icon, width: 480, fields, actions: ok(), ...extra }); return a?.action === 'ok' ? a.values : null; };
  const report = (titleKey, icon, value, actions = close(), handlers = {}) => app.form({ title: t(titleKey), icon, width: 560, fields: [{ key: 'report', type: 'textarea', label: t('bimx.result'), icon, value, rows: Math.min(18, Math.max(4, value.split('\n').length)) }], actions }, handlers);
  const labelOf = (e) => app.labelOf(e);
  const step = () => state.settings.gridSize || 10;
  const fmt = (v, d = 1) => app.fmt(v, d);
  const world = (e) => { const map = placement(e); return (p) => { const [x, y] = map([p.x, p.y, 0]); return { x, y }; }; };
  const boxOf = (tris) => { const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity]; for (const tri of tris) for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return Number.isFinite(lo[0]) ? { lo, hi } : null; };
  const ifcClassOf = (e) => e.bim?.ifcType ?? ({ wall: 'IfcWall', curtainwall: 'IfcCurtainWall', column: 'IfcColumn', beam: 'IfcBeam', slab: 'IfcSlab', roof: 'IfcRoof', stairs: 'IfcStair', railing: 'IfcRailing', space: 'IfcSpace', truss: 'IfcMember', panel: 'IfcPlate', pipe: 'IfcPipeSegment', rebar: 'IfcReinforcingBar', axis: 'IfcGrid', equipment: 'IfcFurnishingElement' }[e.kind] ?? 'IfcBuildingElementProxy');
  const updateEach = (label, list, patch) => app.change(label, (d) => { for (const e of list) D.updateEntity(d, e.id, typeof patch === 'function' ? patch(e) : patch); });
  const otherDocs = () => state.docs.filter((doc) => doc !== app.activeDoc());

  // ── components: additions and subtractions (Arch_Add, Arch_Remove, Arch_ToggleSubs)

  /** Arch_Add: the other selected solids become additions of the last selected one (they hide, as in FreeCAD). */
  function addToComponent(role = 'add') {
    const list = solids();
    const host = list.at(-1);
    const parts = list.slice(0, -1).filter((e) => e.id !== host.id);
    if (!parts.length) { app.notify('info', t('bimx.pickHostLast')); return null; }
    const ids = parts.map((e) => e.id);
    const other = role === 'add' ? 'sub' : 'add';
    app.change(role === 'add' ? 'bimx.op.add' : 'bimx.op.remove', (d) => {
      const c = host.components ?? { add: [], sub: [] };
      D.updateEntity(d, host.id, { components: { ...c, [role]: [...new Set([...c[role], ...ids])], [other]: c[other].filter((id) => !ids.includes(id)) } });
      for (const id of ids) D.updateEntity(d, id, { hidden: true });
    });
    app.select([host.id]);
    app.notify('success', t(role === 'add' ? 'bimx.added' : 'bimx.subtracted', { count: ids.length, name: labelOf(host) }));
    return D.findEntity(drawing(), host.id);
  }

  /** Arch_Remove: with a host selected last, the others are subtracted; a lone part leaves its host; a lone host drops its parts. */
  function removeFromComponent() {
    const list = solids();
    if (list.length >= 2) return addToComponent('sub');
    const [e] = list;
    const members = componentMembers(drawing());
    const link = members.get(e.id);
    if (link) {
      app.change('bimx.op.remove', (d) => {
        const host = D.findEntity(d, link.host);
        D.updateEntity(d, host.id, { components: { ...host.components, [link.role]: host.components[link.role].filter((id) => id !== e.id) } });
        D.updateEntity(d, e.id, { hidden: false });
      });
      app.notify('success', t('bimx.detached', { name: labelOf(e) }));
      return 1;
    }
    if (e.components) {
      const ids = [...e.components.add, ...e.components.sub];
      app.change('bimx.op.remove', (d) => { D.updateEntity(d, e.id, { components: null }); for (const id of ids) if (D.findEntity(d, id)) D.updateEntity(d, id, { hidden: false }); });
      app.notify('success', t('bimx.detached', { name: labelOf(e) }));
      return ids.length;
    }
    app.notify('info', t('bimx.notComponent'));
    return 0;
  }

  /** Arch_ToggleSubs: shows or hides the additions and subtractions of the selected components (all when none is selected). */
  function toggleSubs() {
    const hosts = (solids().length ? solids() : drawing().entities).filter((e) => e.components);
    const ids = hosts.flatMap((h) => [...h.components.add, ...h.components.sub]);
    if (!ids.length) { app.notify('info', t('bimx.noSubs')); return 0; }
    const show = ids.some((id) => D.findEntity(drawing(), id)?.hidden);
    app.change('bimx.op.toggleSubs', (d) => { for (const id of ids) if (D.findEntity(d, id)) D.updateEntity(d, id, { hidden: !show }); });
    return ids.length;
  }

  // ── checks and repairs

  /** Arch_Check: which selected solids (else all) are not closed, valid solids. */
  function check() {
    const list = (solids().length ? solids() : drawing().entities.filter((e) => e.type === 'solid')).filter((e) => e.kind !== 'axis');
    const bad = list.map((e) => ({ e, r: checkSolid(e) })).filter(({ r }) => !r.ok);
    if (!bad.length) { app.notify('success', t('bimx.allValid', { count: list.length })); return []; }
    app.select(bad.map(({ e }) => e.id));
    void report('bimx.check', 'bimCheck', bad.map(({ e, r }) => `${labelOf(e)}: ${r.issues.map((k) => `${k} ${r[k]}`).join(', ')}`).join('\n'));
    return bad.map(({ e }) => e.id);
  }

  /** Arch_CloseHoles: fills the holes of the selected mesh solids. */
  function closeHoles() {
    const list = solids().filter((e) => e.kind === 'mesh');
    if (!list.length) { app.notify('info', t('bimx.pickMesh')); return 0; }
    let filled = 0;
    app.change('bimx.op.closeHoles', (d) => {
      for (const e of list) {
        const local = []; const tris = e.shape.tris;
        for (let i = 0; i + 8 < tris.length; i += 9) local.push([[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]]);
        const out = fillHoles(local);
        filled += out.filled;
        if (out.filled) D.updateEntity(d, e.id, { shape: { ...e.shape, tris: out.tris.flat(2) } });
      }
    });
    app.notify('success', t('bimx.holesClosed', { count: filled }));
    return filled;
  }

  /** Arch_SelectNonSolidMeshes: the mesh solids that are not closed. */
  function selectNonSolid() {
    const ids = drawing().entities.filter((e) => e.type === 'solid' && e.kind === 'mesh' && !analyzeMesh(solidMesh(e), { selfCheck: false }).closed).map((e) => e.id);
    app.select(ids);
    app.notify('info', t('bimx.nonSolidSelected', { count: ids.length }));
    return ids;
  }

  /** Arch_RemoveShape: cuboid meshes become parametric boxes (length, width, height). */
  function removeShape() {
    const list = solids().filter((e) => e.kind === 'mesh');
    let count = 0;
    app.change('bimx.op.removeShape', (d) => {
      for (const e of list) {
        const tris = solidMesh(e);
        const b = boxOf(tris);
        if (!b) continue;
        const size = b.hi.map((v, k) => v - b.lo[k]);
        const vol = Math.abs(analyzeMesh(tris, { selfCheck: false }).volume);
        if (!(size.every((v) => v > 1e-6) && Math.abs(vol - size[0] * size[1] * size[2]) <= 1e-3 * vol)) continue;
        const { id, shape, kind, params, ...rest } = e;
        void shape; void kind; void params;
        D.removeEntities(d, [id]);
        D.addEntity(d, 'solid', { ...rest, kind: 'box', params: { length: size[0], width: size[1], height: size[2] }, x: b.lo[0], y: b.lo[1], z: b.lo[2], rx: 0, ry: 0, rz: 0, scale: 1, flip: false });
        count += 1;
      }
    });
    app.notify(count ? 'success' : 'info', t('bimx.shapesRemoved', { count }));
    return count;
  }

  // ── making components

  /** Arch_Component: the selected solids become (undefined) BIM components on the active level. */
  function component() {
    const list = solids().filter((e) => !isArchKind(e.kind));
    updateEach('bimx.op.component', list, (e) => ({ bim: { ...(e.bim ?? {}), ifcType: e.bim?.ifcType ?? 'IfcBuildingElementProxy' }, ...(e.level ? {} : { level: app.ensureBim(drawing()).activeLevel }) }));
    app.notify('success', t('bimx.componentsMade', { count: list.length }));
    return list.length;
  }

  /** Arch_CutPlane: the selected solid loses what is on one side of a plane (a subtraction you can remove again). */
  async function cutPlane(given = null) {
    const [e] = solids();
    const v = given ?? await ask('bimx.cutPlane', 'bimCutPlane', [
      { key: 'axis', type: 'select', label: t('bimx.planeNormal'), icon: 'axes', value: 'z', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
      { key: 'offset', type: 'number', label: t('bimx.planeOffset'), icon: 'move', value: Math.round((boxOf(solidMesh(e))?.hi[2] ?? 0) / 2), step: 10, unit: 'mm' },
      { key: 'side', type: 'select', label: t('bimx.removeSide'), icon: 'bimCutPlane', value: 'above', options: [['above', t('bimx.sideAbove')], ['below', t('bimx.sideBelow')]] },
    ]);
    if (!v) return null;
    const b = boxOf(solidMesh(e));
    const k = { x: 0, y: 1, z: 2 }[v.axis];
    const pad = Math.max(...b.hi.map((h, i) => h - b.lo[i])) + 100;
    const lo = b.lo.map((x) => x - pad); const hi = b.hi.map((x) => x + pad);
    if (v.side === 'above') lo[k] = Number(v.offset); else hi[k] = Number(v.offset);
    if (!(hi[k] > lo[k])) return null;
    const made = app.change('bimx.op.cutPlane', (d) => D.addEntity(d, 'solid', { kind: 'box', name: `${t('bimx.cutPlane')} (${labelOf(e)})`, params: { length: hi[0] - lo[0], width: hi[1] - lo[1], height: hi[2] - lo[2] }, x: lo[0], y: lo[1], z: lo[2] }));
    app.select([made.id, e.id]);
    return addToComponent('sub');
  }

  /** Arch_Frame: a closed profile swept along each selected line or polyline. */
  function frame() {
    const list = selected().map((e) => ({ e, p: pathPoints(e) })).filter((x) => x.p);
    const profile = list.find((x) => x.p.closed);
    const paths = list.filter((x) => x !== profile);
    if (!profile || !paths.length) { app.notify('info', t('bimx.pickFrame')); return null; }
    const pts = profile.p.points;
    const c = pts.reduce((s, q) => ({ x: s.x + q.x / pts.length, y: s.y + q.y / pts.length }), { x: 0, y: 0 });
    const section = pts.map((q) => ({ x: q.x - c.x, y: q.y - c.y }));
    const made = app.change('bimx.op.frame', (d) => paths.map(({ e, p }) => D.addEntity(d, 'solid', { kind: 'sweep', name: t('bimx.frame'), params: {}, shape: { path: (p.closed ? [...p.points, p.points[0]] : p.points).map((q) => [q.x, q.y, 0]), section }, layer: e.layer, bim: { ifcType: 'IfcMember' } })));
    app.select(made.map((e) => e.id));
    return made;
  }

  /** Arch_Grid: a grid of axes from row and column spans. */
  async function grid(given = null) {
    const v = given ?? await ask('bimx.grid', 'bimGrid', [
      { key: 'columns', type: 'text', label: t('bimx.columnSpans'), icon: 'bimGrid', value: '6000, 6000, 6000' },
      { key: 'rows', type: 'text', label: t('bimx.rowSpans'), icon: 'bimGrid', value: '5000, 5000' },
    ]);
    if (!v) return null;
    const xs = gridPositions(v.columns); const ys = gridPositions(v.rows);
    const made = app.change('bimx.op.grid', (d) => D.addEntity(d, 'solid', { kind: 'axis', name: t('bimx.grid'), params: { countX: xs.length, countY: ys.length, spacingX: xs[1] ?? 1000, spacingY: ys[1] ?? 1000 }, shape: { xs, ys } }));
    app.select([made.id]);
    return made;
  }

  /** Arch_AxisSystem: two axis objects become one system (the first's lines one way, the second's the other). */
  function axisSystem() {
    const [a, b] = solids().filter((e) => e.kind === 'axis');
    if (!b) { app.notify('info', t('bimx.pickTwoAxes')); return null; }
    const lines = combineAxes(a, b, axisLines);
    app.change('bimx.op.axisSystem', (d) => {
      D.updateEntity(d, a.id, { name: t('bimx.axisSystem'), shape: lines, params: { ...a.params, countX: lines.xs.length, countY: lines.ys.length } });
      D.removeEntities(d, [b.id]);
    });
    app.select([a.id]);
    return D.findEntity(drawing(), a.id);
  }

  /** Arch_StructuralSystem: a copy of the selected structure at each crossing of the selected axis system. */
  function structuralSystem() {
    const axis = solids().find((e) => e.kind === 'axis');
    const template = solids().find((e) => e.kind !== 'axis');
    if (!axis || !template) { app.notify('info', t('bimx.pickAxisAndStructure')); return null; }
    const points = axisCrossings(axis, axisLines);
    const made = app.change('bimx.op.structuralSystem', (d) => {
      const { id, ...data } = template;
      void id;
      const group = `ss-${Math.random().toString(36).slice(2, 8)}`;
      d.groups = [...(d.groups ?? []), { id: group, name: t('bimx.structuralSystem'), parent: null }];
      return points.map((p, i) => D.addEntity(d, 'solid', { ...data, name: `${labelOf(template)} ${i + 1}`, x: p.x, y: p.y, rz: (template.rz ?? 0) + (axis.rz ?? 0), group }));
    });
    app.select(made.map((e) => e.id));
    app.notify('success', t('bimx.structuresMade', { count: made.length }));
    return made;
  }

  /** Arch_MergeWalls: walls of the same make that meet end to end become one. */
  function mergeWalls() {
    const walls = solids().filter((e) => e.kind === 'wall');
    if (walls.length < 2) { app.notify('info', t('bimx.pickWalls')); return null; }
    const p0 = walls[0].params;
    if (walls.some((w) => w.params.width !== p0.width || w.params.height !== p0.height || w.params.align !== p0.align || (w.z ?? 0) !== (walls[0].z ?? 0))) { app.notify('info', t('bimx.wallsDiffer')); return null; }
    const merged = mergeWallPaths(walls, (w, p) => world(w)(p));
    if (!merged) { app.notify('info', t('bimx.wallsApart')); return null; }
    const o = merged.path[0];
    const made = app.change('bimx.op.mergeWalls', (d) => {
      const { id, shape, ...rest } = walls[0];
      void id; void shape;
      D.removeEntities(d, walls.map((w) => w.id));
      return D.addEntity(d, 'solid', { ...rest, x: o.x, y: o.y, rz: 0, rx: 0, ry: 0, shape: { path: merged.path.map((q) => ({ x: q.x - o.x, y: q.y - o.y })), closed: merged.closed, openings: merged.openings, layers: walls[0].shape.layers ?? [] } });
    });
    app.select([made.id]);
    return made;
  }

  /** Arch_Panel_Cut: the flat outline of each selected panel, laid out to the right of the model. */
  function panelCut() {
    const panels = solids().filter((e) => e.kind === 'panel');
    if (!panels.length) { app.notify('info', t('bimx.pickPanels')); return null; }
    const box = D.extents(drawing());
    let x = (box?.maxX ?? 0) + 1000;
    const made = app.change('bimx.op.panelCut', (d) => panels.flatMap((e) => {
      const loops = [e.shape.outer, ...(e.shape.holes ?? [])];
      const xs = e.shape.outer.map((q) => q.x); const ys = e.shape.outer.map((q) => q.y);
      const dx = x - Math.min(...xs); const dy = -Math.min(...ys);
      x += Math.max(...xs) - Math.min(...xs) + 500;
      return loops.map((loop) => D.addEntity(d, 'polyline', { points: loop.map((q) => ({ x: q.x + dx, y: q.y + dy })), closed: true }));
    }));
    app.select(made.map((e) => e.id));
    return made;
  }

  /** Arch_PipeConnector: a ball joint where two selected pipes' nearest ends meet. */
  function pipeConnector() {
    const pipes = solids().filter((e) => e.kind === 'pipe');
    if (pipes.length !== 2) { app.notify('info', t('bimx.pickTwoPipes')); return null; }
    const ends = (e) => { const map = placement(e); const path = e.shape.path; return [path[0], path.at(-1)].map((q) => map([q.x, q.y, 0])); };
    let best = null;
    for (const a of ends(pipes[0])) for (const b of ends(pipes[1])) { const dd = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (!best || dd < best.dd) best = { dd, at: a.map((v, k) => (v + b[k]) / 2) }; }
    const r = Math.max(pipes[0].params.diameter, pipes[1].params.diameter) / 2;
    const made = app.change('bimx.op.pipeConnector', (d) => D.addEntity(d, 'solid', { kind: 'sphere', name: t('bimx.pipeConnector'), params: { radius: r * 1.15 }, x: best.at[0], y: best.at[1], z: best.at[2], layer: pipes[0].layer, bim: { ifcType: 'IfcPipeSegment' } }));
    app.select([made.id]);
    return made;
  }

  /** Arch_Profile: a 2D profile outline (steel sections and plain shapes) to make structures from. */
  async function profile(given = null) {
    const presets = STEEL_PRESETS.slice(1);
    const v = given ?? await ask('bimx.profile', 'bimProfile', [
      { key: 'preset', type: 'select', label: t('bimx.profilePreset'), icon: 'bimProfile', value: presets[0][0], options: [['rect', t('bimx.rectProfile')], ['round', t('bimx.roundProfile')], ...presets.map((p) => [p[0], p[0]])] },
      { key: 'width', type: 'number', label: t('bimx.width'), icon: 'width', value: 200, min: 1, step: 10, unit: 'mm' },
      { key: 'depth', type: 'number', label: t('bimx.depth'), icon: 'height', value: 300, min: 1, step: 10, unit: 'mm' },
    ]);
    if (!v) return null;
    const index = STEEL_PRESETS.findIndex((p) => p[0] === v.preset);
    const sec = index > 0 ? sectionOf({ preset: index }) : { shape: v.preset === 'round' ? 'round' : 'rect', w: Number(v.width), d: Number(v.depth), tw: 1, tf: 1 };
    const { outer, holes } = sectionOutline(sec);
    const made = app.change('bimx.op.profile', (d) => [outer, ...holes].map((loop) => D.addEntity(d, 'polyline', { points: loop, closed: true })));
    app.select(made.map((e) => e.id));
    return made;
  }

  /** Arch_Reference: the solids of another open drawing, copied into a group that "Reload" brings up to date. */
  async function reference(given = null) {
    const sel = selected()[0];
    const group = sel?.group ? (drawing().groups ?? []).find((g) => g.id === sel.group && g.reference) : null;
    let sourceName = group?.reference.source ?? null;
    if (!sourceName) {
      const docs = otherDocs();
      if (!docs.length) { app.notify('info', t('bimx.noOtherDrawing')); return null; }
      const v = given ?? await ask('bimx.reference', 'bimReference', [{ key: 'doc', type: 'select', label: t('bimx.sourceDrawing'), icon: 'drawing', value: app.docName(docs[0]), options: docs.map((doc) => [app.docName(doc), app.docName(doc)]) }]);
      if (!v) return null;
      sourceName = v.doc;
    }
    const doc = state.docs.find((x) => app.docName(x) === sourceName);
    if (!doc) { app.notify('error', t('bimx.sourceGone', { name: sourceName })); return null; }
    const copies = doc.drawing.entities.filter((e) => e.type === 'solid').map(({ id, group: g, ...rest }) => { void id; void g; return rest; });
    const made = app.change('bimx.op.reference', (d) => {
      let gid = group?.id;
      if (gid) D.removeEntities(d, d.entities.filter((e) => e.group === gid).map((e) => e.id));
      else { gid = `ref-${Math.random().toString(36).slice(2, 8)}`; d.groups = [...(d.groups ?? []), { id: gid, name: `${t('bimx.reference')}: ${sourceName}`, parent: null, reference: { source: sourceName } }]; }
      return copies.map((raw) => D.addEntity(d, 'solid', { ...raw, group: gid }));
    });
    app.notify('success', t(group ? 'bimx.referenceReloaded' : 'bimx.referenceMade', { count: made.length, name: sourceName }));
    return made;
  }

  // ── survey and quantities

  const lengthOf = (e) => { const p = pathPoints(e); if (!p) return null; const pts = p.closed ? [...p.points, p.points[0]] : p.points; return pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0); };
  const areaOf = (e) => { const p = pathPoints(e); return p?.closed ? Math.abs(polygonArea(p.points)) : null; };

  /** Arch_Survey: lengths, areas and volumes of the selection, with totals (copy or save as CSV). */
  async function survey() {
    const rows = selected().map((e) => {
      if (e.type === 'solid') { const pr = solidProperties(e); return { name: labelOf(e), length: pr.length ?? null, area: pr.area, volume: pr.volume }; }
      return { name: labelOf(e), length: lengthOf(e), area: areaOf(e), volume: null };
    });
    if (!rows.length) { app.notify('info', t('bimx.surveyPick')); return null; }
    const total = { length: 0, area: 0, volume: 0 };
    for (const r of rows) for (const k of Object.keys(total)) if (Number.isFinite(r[k])) total[k] += r[k];
    const cell = (v, div, d) => (Number.isFinite(v) ? fmt(v / div, d) : '');
    const lines = [[t('bimx.name'), `${t('bimx.length')} (m)`, `${t('bimx.area')} (m²)`, `${t('bimx.volume')} (m³)`], ...rows.map((r) => [r.name, cell(r.length, 1e3, 3), cell(r.area, 1e6, 3), cell(r.volume, 1e9, 4)]), [t('bimx.total'), cell(total.length, 1e3, 3), cell(total.area, 1e6, 3), cell(total.volume, 1e9, 4)]];
    const csv = lines.map((l) => l.map((x) => (/[",]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(',')).join('\n');
    void report('bimx.survey', 'bimSurvey', lines.map((l) => l.join('\t')).join('\n'), [{ id: 'copy', label: t('bimx.copy'), icon: 'copy' }, { id: 'csv', label: t('bimx.saveCsv'), icon: 'save' }, { id: 'ok', label: t('confirm.ok'), primary: true }]).then((a) => {
      if (a?.action === 'copy') void app.copyText(csv);
      if (a?.action === 'csv') void app.saveText('survey.csv', csv, 'csv');
    });
    return { rows, total, csv };
  }

  /** BIM_IfcQuantities: chosen quantities of each selected object, stored with its properties (they go out with the IFC). */
  async function ifcQuantities(given = null) {
    const list = solids();
    const v = given ?? await ask('bimx.ifcQuantities', 'bimIfcQuantities', ['Length', 'Width', 'Height', 'Area', 'Volume'].map((q) => ({ key: q, type: 'check', label: t(`bimx.q.${q}`), icon: 'bimIfcQuantities', value: true })));
    if (!v) return null;
    updateEach('bimx.op.quantities', list, (e) => {
      const pr = solidProperties(e);
      const q = { Length: pr.length ?? pr.sizeX, Width: pr.sizeY, Height: pr.sizeZ, Area: pr.area / 1e6, Volume: pr.volume / 1e9 };
      const props = { ...(e.bim?.props ?? {}) };
      for (const [k, val] of Object.entries(q)) if (v[k] && Number.isFinite(val)) props[`Qto.${k}`] = +val.toFixed(k === 'Area' || k === 'Volume' ? 4 : 1);
      return { bim: { ...(e.bim ?? {}), props } };
    });
    app.notify('success', t('bimx.quantitiesSet', { count: list.length }));
    return list.length;
  }

  /** BIM_IfcProperties: the property set of the selected objects ("Name = value" per line). */
  async function ifcProperties(given = null) {
    const list = solids();
    const v = given ?? await ask('bimx.ifcProperties', 'bimIfcProperties', [{ key: 'props', type: 'textarea', label: t('bimx.propsHint'), icon: 'bimIfcProperties', value: propsText(list[0]?.bim?.props), rows: 10 }]);
    if (!v) return null;
    const props = parseProps(v.props);
    updateEach('bimx.op.properties', list, (e) => ({ bim: { ...(e.bim ?? {}), props } }));
    return props;
  }

  /** BIM_Classification: a classification system and code for the selected objects. */
  async function classification(given = null) {
    const list = solids();
    const cur = list[0]?.bim?.classification;
    const system = cur?.system ?? CLASSIFICATION_SYSTEMS[0];
    const codes = (s) => [['', t('bimx.customCode')], ...CLASSIFICATION_CODES[s].map(([c, title]) => [c, `${c} — ${title}`])];
    const v = given ?? await ask('bimx.classification', 'bimClassification', [
      { key: 'system', type: 'select', label: t('bimx.system'), icon: 'bimClassification', value: system, options: CLASSIFICATION_SYSTEMS.map((s) => [s, s]) },
      { key: 'preset', type: 'select', label: t('bimx.code'), icon: 'bimClassification', value: '', options: codes(system) },
      { key: 'code', type: 'text', label: t('bimx.customCode'), icon: 'text', value: cur?.code ?? '' },
      { key: 'title', type: 'text', label: t('bimx.codeTitle'), icon: 'text', value: cur?.title ?? '' },
    ], { live: true });
    if (!v) return null;
    const preset = CLASSIFICATION_CODES[v.system]?.find(([c]) => c === v.preset);
    const c = preset ? { system: v.system, code: preset[0], title: preset[1] } : { system: v.system, code: v.code, title: v.title };
    if (!c.code) { app.notify('info', t('bimx.codeMissing')); return null; }
    updateEach('bimx.op.classification', list, (e) => ({ bim: { ...(e.bim ?? {}), classification: c } }));
    return c;
  }

  /** BIM_Convert: the selected objects become a chosen IFC class. */
  async function convert(given = null) {
    const list = solids();
    const v = given ?? await ask('bimx.convert', 'bimConvert', [{ key: 'type', type: 'select', label: t('bimx.ifcClass'), icon: 'bimConvert', value: list[0]?.bim?.ifcType ?? 'IfcBuildingElementProxy', options: IFC_TYPES.map((ty) => [ty, ty]) }]);
    if (!v) return null;
    updateEach('bimx.op.convert', list, (e) => ({ bim: { ...(e.bim ?? {}), ifcType: v.type } }));
    app.notify('success', t('bimx.converted', { count: list.length, type: v.type }));
    return v.type;
  }

  /** BIM_IfcElements: the IFC class of every object (the selected ones, else all) in one table. */
  async function ifcElements(given = null) {
    const list = (solids().length ? solids() : drawing().entities.filter((e) => e.type === 'solid')).filter((e) => !['wall', 'axis', 'space', 'rebar'].includes(e.kind)).slice(0, 30);
    if (!list.length) { app.notify('info', t('bimx.noElements')); return null; }
    const v = given ?? await ask('bimx.ifcElements', 'bimIfcElements', list.map((e) => ({ key: e.id, type: 'select', label: labelOf(e), icon: 'bimIfcElements', value: IFC_TYPES.includes(ifcClassOf(e)) ? ifcClassOf(e) : 'IfcBuildingElementProxy', options: IFC_TYPES.map((ty) => [ty, ty]) })));
    if (!v) return null;
    const changed = list.filter((e) => v[e.id] && v[e.id] !== ifcClassOf(e));
    updateEach('bimx.op.ifcElements', changed, (e) => ({ bim: { ...(e.bim ?? {}), ifcType: v[e.id] } }));
    return changed.length;
  }

  /** Arch_ToggleIfcBrepFlag: the selected objects go out as faceted bodies (or as extrusions again). */
  function toggleBrep() {
    const list = solids();
    const on = !list.every((e) => e.bim?.brep);
    updateEach('bimx.op.brep', list, (e) => ({ bim: { ...(e.bim ?? {}), brep: on } }));
    app.notify('info', t(on ? 'bimx.brepOn' : 'bimx.brepOff', { count: list.length }));
    return on;
  }

  /** BIM_IfcSpreadsheet: a table of the objects' IFC class and properties added to the drawing's spreadsheet. */
  function ifcSpreadsheet() {
    const list = solids().length ? solids() : drawing().entities.filter((e) => e.type === 'solid');
    const cells = ifcSheetCells(list.map((e) => ({ name: labelOf(e), ifcClass: ifcClassOf(e), props: e.bim?.props })));
    const sheet = drawing().spreadsheet ?? { cells: {} };
    const used = Object.keys(sheet.cells ?? {}).map((k) => Number(/\d+$/.exec(k)?.[0] ?? 0));
    const shift = used.length ? Math.max(...used) + 1 : 0;
    const moved = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k.replace(/\d+$/, (n) => String(Number(n) + shift)), v]));
    app.change('bimx.op.sheet', (d) => { d.spreadsheet = { ...(d.spreadsheet ?? {}), cells: { ...(d.spreadsheet?.cells ?? {}), ...moved } }; });
    void app.openSpreadsheet();
    return moved;
  }

  // ── IFC files

  const itemsOf = (list) => list.map((raw) => {
    const e = raw.kind ? normalizeSolidData(raw) : raw;
    const tris = e ? solidMesh(e) : [];
    const b = boxOf(tris);
    return { name: raw.name || raw.kind, kind: raw.kind, box: b ? [...b.lo, ...b.hi] : null, volume: tris.length ? Math.abs(analyzeMesh(tris, { selfCheck: false }).volume) : NaN };
  });
  const diffText = (res) => [
    `${t('bimx.diffAdded')}: ${res.added.length}`, ...res.added.map((n) => `  + ${n}`),
    `${t('bimx.diffRemoved')}: ${res.removed.length}`, ...res.removed.map((n) => `  − ${n}`),
    `${t('bimx.diffChanged')}: ${res.changed.length}`, ...res.changed.map((c) => `  ~ ${c.name} (${c.what.map((w) => t(`bimx.what.${w}`)).join(', ')})`),
  ].join('\n');

  /** BIM_Diff: what another open drawing has that this one does not, has not, or has differently. */
  async function diff(given = null) {
    const docs = otherDocs();
    if (!docs.length) { app.notify('info', t('bimx.noOtherDrawing')); return null; }
    const v = given ?? await ask('bimx.diff', 'bimDiff', [{ key: 'doc', type: 'select', label: t('bimx.compareWith'), icon: 'drawing', value: app.docName(docs[0]), options: docs.map((doc) => [app.docName(doc), app.docName(doc)]) }]);
    if (!v) return null;
    const other = state.docs.find((doc) => app.docName(doc) === v.doc);
    const res = diffModels(itemsOf(drawing().entities.filter((e) => e.type === 'solid')), itemsOf(other.drawing.entities.filter((e) => e.type === 'solid')));
    void report('bimx.diff', 'bimDiff', diffText(res));
    return res;
  }

  /** IFC_Diff: the drawing against an IFC file. */
  async function ifcDiff(given = null) {
    const file = given ?? await app.readTextFileDialog(['ifc']);
    if (!file) return null;
    const { entities } = importMesh('ifc', file.text);
    const res = diffModels(itemsOf(drawing().entities.filter((e) => e.type === 'solid')), itemsOf(entities.filter((e) => e.type === 'solid')));
    void report('bimx.ifcDiff', 'bimDiff', diffText(res));
    return res;
  }

  const PRODUCT_CLASSES = new Map([...IFC_TYPES, 'IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace', 'IfcDoor', 'IfcWindow', 'IfcWallStandardCase', 'IfcFurnishingElement', 'IfcReinforcingBar', 'IfcGrid', 'IfcOpeningElement', 'IfcSanitaryTerminal', 'IfcElectricAppliance', 'IfcFlowTerminal', 'IfcGeographicElement']
    .map((c) => [c.toUpperCase(), c]));
  /** BIM_IfcExplorer: what an IFC file holds (classes and named products) before importing it. */
  async function ifcExplorer(given = null) {
    const file = given ?? await app.readTextFileDialog(['ifc']);
    if (!file) return null;
    const E = parseStepEntities(file.text);
    const counts = new Map();
    const products = [];
    for (const e of E.values()) {
      if (!/^IFC/.test(e.type)) continue;
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      if (PRODUCT_CLASSES.has(e.type) && typeof e.args?.[2] === 'string') products.push(`${PRODUCT_CLASSES.get(e.type)}: ${e.args[2]}`);
    }
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(file.text)?.[1] ?? '?';
    const textValue = [`${t('bimx.file')}: ${file.name}`, `${t('bimx.schema')}: ${schema}`, `${t('bimx.entities')}: ${E.size}`, '', ...products.slice(0, 200), '', ...[...counts].filter(([k]) => !/^IFC(CARTESIANPOINT|DIRECTION|POLYLOOP|FACE|FACEOUTERBOUND|INDEXEDPOLYGONALFACE)$/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${k.replace(/^IFC/, 'Ifc')} × ${n}`)].join('\n');
    const answer = await report('bimx.ifcExplorer', 'bimIfcExplorer', textValue, [{ id: 'import', label: t('bimx.import'), icon: 'import' }, { id: 'ok', label: t('confirm.ok'), primary: true }]);
    if (answer?.action !== 'import') return { schema, products, counts };
    const { entities } = importMesh('ifc', file.text);
    const made = app.change('bimx.op.ifcImport', (d) => entities.map((raw) => D.addEntity(d, raw.type ?? 'solid', raw)).filter(Boolean));
    app.select(made.map((e) => e.id));
    return { schema, products, counts, made };
  }

  /** IFC_ConvertDocument: every solid gets a level (by its height) and an IFC class, so the drawing is a full IFC model. */
  function ifcConvertDocument() {
    const d0 = drawing();
    const levels = app.ensureBim(d0).levels;
    let count = 0;
    app.change('bimx.op.convertDoc', (d) => {
      const bim = app.ensureBim(d);
      for (const e of d.entities.filter((x) => x.type === 'solid')) {
        const patch = {};
        if (!e.level || !bim.levels.some((l) => l.id === e.level)) patch.level = [...levels].reverse().find((l) => (e.z ?? 0) >= l.elevation - 1e-6)?.id ?? levels[0].id;
        if (!isArchKind(e.kind) && !e.bim?.ifcType) patch.bim = { ...(e.bim ?? {}), ifcType: 'IfcBuildingElementProxy' };
        if (Object.keys(patch).length) { D.updateEntity(d, e.id, patch); count += 1; }
      }
    });
    app.notify('success', t('bimx.docConverted', { count }));
    return count;
  }

  /** IFC_Expand: the objects inside the selected object's group (and its sub-groups), selected and shown in the tree. */
  function ifcExpand() {
    const e = selected()[0];
    const start = e?.group ?? state.treeGroup;
    if (!start) { app.notify('info', t('bimx.noChildren')); return []; }
    const ids = new Set([start]);
    let grew = true;
    while (grew) { grew = false; for (const g of drawing().groups ?? []) if (g.parent && ids.has(g.parent) && !ids.has(g.id)) { ids.add(g.id); grew = true; } }
    const members = drawing().entities.filter((x) => x.group && ids.has(x.group)).map((x) => x.id);
    app.select(members);
    app.showTree();
    return members;
  }

  /** IFC_UpdateIOS: MyCAD reads and writes IFC itself (no IfcOpenShell to update); shows what it supports. */
  function ifcVersion() {
    void report('bimx.ifcVersion', 'ifcVersion', t('bimx.ifcEngine'));
    return true;
  }

  // ── organising

  const TRASH = 'bim-trash';
  /** BIM_Trash: the selection goes into a hidden Trash group (BIM_EmptyTrash deletes it for good). */
  function trash() {
    const ids = app.selectedIds();
    app.change('bimx.op.trash', (d) => {
      if (!(d.groups ?? []).some((g) => g.id === TRASH)) d.groups = [...(d.groups ?? []), { id: TRASH, name: t('bimx.trashName'), parent: null, hidden: true }];
      for (const id of ids) D.updateEntity(d, id, { group: TRASH, hidden: true });
    });
    app.select([]);
    return ids.length;
  }

  function emptyTrash() {
    const ids = drawing().entities.filter((e) => e.group === TRASH).map((e) => e.id);
    app.change('bimx.op.emptyTrash', (d) => { D.removeEntities(d, ids); d.groups = (d.groups ?? []).filter((g) => g.id !== TRASH); });
    app.notify('success', t('bimx.trashEmptied', { count: ids.length }));
    return ids.length;
  }

  /** BIM_Ungroup: the selection leaves its groups. */
  function ungroup() {
    const ids = selected().filter((e) => e.group).map((e) => e.id);
    app.moveToGroup(ids, null);
    return ids.length;
  }

  /** BIM_Reorder: the selected objects in a new order (one name per line). */
  async function reorder(given = null) {
    const list = selected();
    const lines = list.map((e, i) => `${i + 1}: ${labelOf(e)}`);
    const v = given ?? await ask('bimx.reorder', 'bimReorder', [{ key: 'order', type: 'textarea', label: t('bimx.reorderHint'), icon: 'bimReorder', value: lines.join('\n'), rows: Math.min(14, lines.length + 1) }]);
    if (!v) return null;
    const order = String(v.order).split(/\r?\n/).map((l) => Number(/^\s*(\d+)\s*:/.exec(l)?.[1]) - 1).filter((i) => i >= 0 && i < list.length);
    const ids = [...new Set(order)].map((i) => list[i].id);
    for (const e of list) if (!ids.includes(e.id)) ids.push(e.id);
    app.change('bimx.op.reorder', (d) => { d.entities = reorderEntities(d.entities, ids); });
    return ids;
  }

  /** BIM_ResetCloneColors: clones take their source's colour again. */
  function resetCloneColors() {
    const d0 = drawing();
    const list = (selected().length ? selected() : d0.entities).filter((e) => e.clone);
    updateEach('bimx.op.cloneColors', list, (e) => ({ color: D.findEntity(d0, e.clone.of)?.color ?? null }));
    return list.length;
  }

  /** BIM_Glue: the selected wires joined into one (gaps closed by straight segments). */
  function glue() {
    const list = selected().map((e) => ({ e, p: pathPoints(e) })).filter((x) => x.p && !x.p.closed);
    if (list.length < 2) { app.notify('info', t('bimx.pickWires')); return null; }
    const out = gluePaths(list.map((x) => x.p.points), 1e-6);
    const made = app.change('bimx.op.glue', (d) => { D.removeEntities(d, list.map((x) => x.e.id)); return D.addEntity(d, 'polyline', { points: out.points, closed: out.closed, layer: list[0].e.layer }); });
    app.select([made.id]);
    return made;
  }

  /** BIM_Rewire: the selected edges rebuilt as wires (edges that touch join; closed chains close). */
  function rewire() {
    const list = selected().map((e) => ({ e, p: pathPoints(e) })).filter((x) => x.p);
    if (!list.length) { app.notify('info', t('bimx.pickWires')); return null; }
    const chains = joinPaths(list.map((x) => (x.p.closed ? [...x.p.points, x.p.points[0]] : x.p.points)), 1e-6);
    const made = app.change('bimx.op.rewire', (d) => {
      D.removeEntities(d, list.map((x) => x.e.id));
      return chains.map(({ points, closed }) => D.addEntity(d, 'polyline', { points, closed, layer: list[0].e.layer }));
    });
    app.select(made.map((e) => e.id));
    return made;
  }

  // ── nudging (BIM_Nudge_*): by the grid size

  const nudgeMove = (dx, dy) => () => app.transformSelection({ dx: dx * step(), dy: dy * step() });
  const nudgeTurn = (deg) => () => app.transformSelection({ rz: deg });
  function nudgeSize(sign) {
    const s = sign * step();
    const list = selected();
    app.change('bimx.op.nudgeSize', (d) => {
      for (const e of list) {
        if (e.type === 'solid') {
          const keys = NUDGE_PARAMS[e.kind] ?? [];
          if (!keys.length) continue;
          const params = { ...e.params };
          for (const k of keys) params[k] = Math.max(1, (Number(params[k]) || 0) + s);
          D.updateEntity(d, e.id, { params });
        } else {
          const patch = extendEntity(e, s);
          if (patch) D.updateEntity(d, e.id, patch);
        }
      }
    });
    return list.length;
  }
  /** BIM_Nudge_Switch: from a part to its component, from a component to its parts, from a clone to its source. */
  function nudgeSwitch() {
    const e = selected()[0];
    const link = componentMembers(drawing()).get(e.id);
    const target = link ? [link.host] : e.components ? [...e.components.add, ...e.components.sub] : e.clone ? [e.clone.of] : [];
    if (!target.length) { app.notify('info', t('bimx.nothingToSwitch')); return []; }
    app.select(target);
    return target;
  }

  // ── checks before IFC (BIM_Preflight)

  async function runPreflight() {
    const d = drawing();
    const tests = preflight(d, { analyze: (e) => { const r = analyzeMesh(solidMesh(e), { selfCheck: false }); return { closed: r.closed, volume: r.volume }; }, isArch: isArchKind });
    const answer = app.form({ title: t('bimx.preflight'), icon: 'bimPreflight', width: 560, fields: [{ key: 'tests', type: 'list', label: t('bimx.tests'), icon: 'bimPreflight', options: tests.map((x) => [x.id, `${x.ok ? '✔' : '✘'} ${t(`bimx.pf.${x.id}`)}${x.ok ? '' : ` (${x.items.length})`}`, x.ok || x.id === 'project' ? '' : t('bimx.select')]) }], actions: close() }, {
      onPick: ({ value }) => { const test = tests.find((x) => x.id === value); if (test) app.select(test.items); },
    });
    void answer;
    return tests;
  }

  // ── project, views and set-up

  /** BIM_Project / IFC_MakeProject / BIM_ProjectManager: site, building and levels in one go. */
  async function project(given = null) {
    const bim = drawing().bim;
    const v = given ?? await ask('bimx.project', 'bimProject', [
      { key: 'site', type: 'text', label: t('bim.site'), icon: 'bimProject', value: bim?.site ?? t('bimx.defaultSite') },
      { key: 'building', type: 'text', label: t('bim.building'), icon: 'bimProject', value: bim?.building ?? t('bimx.defaultBuilding') },
      { key: 'levels', type: 'number', label: t('bimx.levelCount'), icon: 'bimViews', value: bim?.levels.length ?? 3, min: 1, max: 100, step: 1 },
      { key: 'height', type: 'number', label: t('bimx.levelHeight'), icon: 'height', value: bim?.levels[0]?.height ?? 3000, min: 100, step: 100, unit: 'mm' },
      { key: 'ground', type: 'number', label: t('bimx.groundElevation'), icon: 'height', value: bim?.levels[0]?.elevation ?? 0, step: 100, unit: 'mm' },
    ]);
    if (!v) return null;
    const n = Math.max(1, Math.min(100, Math.round(Number(v.levels))));
    const h = Number(v.height); const g = Number(v.ground);
    app.change('bimx.op.project', (d) => {
      const old = app.ensureBim(d);
      const levels = Array.from({ length: n }, (_, i) => ({ id: old.levels[i]?.id ?? `L${i + 1}`, name: old.levels[i]?.name ?? t('bimx.levelName', { n: i + 1 }), elevation: g + i * h, height: h, visible: true }));
      d.bim = { ...old, site: v.site, building: v.building, levels, activeLevel: levels.some((l) => l.id === old.activeLevel) ? old.activeLevel : levels[0].id, planLevel: levels.some((l) => l.id === old.planLevel) ? old.planLevel : null };
    });
    return drawing().bim;
  }

  /** BIM_Views: the levels — show one in the plan (and make it the active level) or all. */
  async function views() {
    const bim = app.ensureBim(drawing());
    return app.form({ title: t('bimx.views'), icon: 'bimViews', width: 480, fields: [{ key: 'levels', type: 'list', label: t('bim.levels'), icon: 'bimViews', options: [['*', t('bimx.allLevels'), t('bimx.show')], ...bim.levels.map((l) => [l.id, `${l.name} (${fmt(l.elevation, 0)})${bim.planLevel === l.id ? ' ●' : ''}`, t('bimx.show')])] }], actions: close() }, {
      onPick: ({ value }) => showLevel(value === '*' ? null : value),
    });
  }
  function showLevel(id) {
    app.change('bimx.op.views', (d) => { const bim = app.ensureBim(d); bim.planLevel = id; if (id) bim.activeLevel = id; });
    return drawing().bim.planLevel;
  }

  /** BIM_Setup: the units, grid and author MyCAD starts BIM work with. */
  async function setup(given = null) {
    const s = state.settings;
    const v = given ?? await ask('bimx.setup', 'bimSetup', [
      { key: 'units', type: 'select', label: t('bimx.units'), icon: 'ruler', value: s.units, options: [['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['in', 'in'], ['ft', 'ft']] },
      { key: 'gridSize', type: 'number', label: t('bimx.gridSize'), icon: 'grid', value: s.gridSize, min: 0.1, step: 10, unit: 'mm' },
      { key: 'snapGrid', type: 'check', label: t('bimx.snapGrid'), icon: 'snapGrid', value: s.snapGrid },
      { key: 'author', type: 'text', label: t('bimx.author'), icon: 'text', value: s.author ?? '' },
    ]);
    if (!v) return null;
    app.updateSettings({ units: v.units, gridSize: Number(v.gridSize) || s.gridSize, snapGrid: Boolean(v.snapGrid), author: v.author });
    return state.settings;
  }

  /** BIM_SetWPFront / Side / Top: the working plane on a main plane. */
  const wpOn = (normal) => () => (normal ? app.workPlaneOnFace([0, 0, 0], normal) : app.run('workPlaneReset'));

  /** BIM_WPView: the 3D view looks straight at the working plane. */
  async function wpView() {
    if (!state.view3d) await app.toggle3d(true);
    const view = app.view3d.instance;
    if (!view) return null;
    const f = drawing().workPlane?.frame;
    const n = f ? f.z : [0, 0, 1];
    const up = f ? f.y : [0, 1, 0];
    const cam = view.getCamera();
    const dist = Math.hypot(...cam.position.map((p, i) => p - cam.target[i])) || 1000;
    const target = f ? f.origin : cam.target;
    view.setCamera({ ...cam, target, position: target.map((p, i) => p + n[i] * dist), up });
    return { n, up };
  }

  /** BIM_TogglePanels: both side panels away (or back) at once. */
  function togglePanels() {
    const on = (id) => Boolean(app.commands[id]?.checked?.());
    const show = !(on('leftPanel') || on('rightPanel'));
    for (const id of ['leftPanel', 'rightPanel']) if (on(id) !== show) app.run(id);
    return show;
  }

  /** BIM_Material: a material of the drawing on the selected objects (BIM objects keep it, others take its colour). */
  async function material(given = null) {
    const bim = app.ensureBim(drawing());
    const list = solids();
    const v = given ?? await ask('bimx.material', 'bimMaterial', [{ key: 'material', type: 'select', label: t('bimx.material'), icon: 'bimMaterial', value: list[0]?.material?.id ?? bim.materials[0]?.id, options: bim.materials.map((m) => [m.id, m.name]) }]);
    if (!v) return null;
    const m = bim.materials.find((x) => x.id === v.material);
    updateEach('bimx.op.material', list, (e) => (isArchKind(e.kind) ? { material: normalizeMaterial(m) } : { color: m.color }));
    return m;
  }

  /** BIM_MoveView: a TechDraw view moved onto another page (its centre onto the page's). */
  async function moveView(given = null) {
    const d = drawing();
    const viewGroup = (d.groups ?? []).find((g) => g.id === selected()[0]?.group && (g.view || g.clip));
    const pages = (d.groups ?? []).filter((g) => d.entities.some((e) => e.group === g.id && e.field === 'title'));
    if (!viewGroup || !pages.length) { app.notify('info', t('bimx.pickViewAndPage')); return null; }
    const v = given ?? await ask('bimx.moveView', 'bimMoveView', [{ key: 'page', type: 'select', label: t('bimx.page'), icon: 'bimMoveView', value: pages[0].id, options: pages.map((g) => [g.id, g.name]) }]);
    if (!v) return null;
    const bounds = (gid) => { let b = null; for (const e of d.entities) { if (e.group !== gid) continue; const x = app.boxOf(e); if (x) b = b ? { minX: Math.min(b.minX, x.minX), minY: Math.min(b.minY, x.minY), maxX: Math.max(b.maxX, x.maxX), maxY: Math.max(b.maxY, x.maxY) } : { ...x }; } return b; };
    const a = bounds(viewGroup.id); const p = bounds(v.page);
    const dx = (p.minX + p.maxX) / 2 - (a.minX + a.maxX) / 2; const dy = (p.minY + p.maxY) / 2 - (a.minY + a.maxY) / 2;
    app.select(d.entities.filter((e) => e.group === viewGroup.id).map((e) => e.id));
    app.transformSelection({ dx, dy });
    return { dx, dy };
  }

  /** BIM_Reextrude: a new height (thickness) for the selected extruded objects. */
  async function reextrude(given = null) {
    const keyOf = (e) => ({ slab: 'thickness', panel: 'thickness', wall: 'height', column: 'height', curtainwall: 'height', space: 'height', box: 'height', prism: 'height', cylinder: 'height', pad: 'length' }[e.kind] ?? (Number.isFinite(e.params?.height) ? 'height' : null));
    const list = solids().filter((e) => keyOf(e));
    if (!list.length) { app.notify('info', t('bimx.pickExtrusion')); return null; }
    const v = given ?? await ask('bimx.reextrude', 'bimReextrude', [{ key: 'value', type: 'number', label: t('bimx.extrusion'), icon: 'height', value: list[0].params[keyOf(list[0])], min: 0.1, step: 10, unit: 'mm' }]);
    if (!v) return null;
    updateEach('bimx.op.reextrude', list, (e) => ({ params: { ...e.params, [keyOf(e)]: Number(v.value) } }));
    return list.length;
  }

  /** BIM_Library: furniture and fixtures to insert, and pieces saved from drawings. */
  async function library() {
    const saved = () => state.settings.bimLibrary ?? [];
    const options = () => [
      ...saved().map((item, i) => [`u${i}`, `★ ${item.name}`, t('bimx.insert')]),
      ...EQUIPMENT_TYPES.map((type, i) => [`e${i}`, t(`archOpt.${type}`), t('bimx.insert')]),
    ];
    return app.form({
      title: t('bimx.library'), icon: 'bimLibrary', width: 520,
      fields: [{ key: 'name', type: 'text', label: t('bimx.saveAs'), icon: 'text', value: '' }, { key: 'items', type: 'list', label: t('bimx.libraryItems'), icon: 'bimLibrary', options: options() }],
      actions: [{ id: 'save', label: t('bimx.saveSelection'), icon: 'save', keep: true }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    }, {
      onPick: ({ value }) => insertFromLibrary(value),
      onButton: ({ action, values }) => { if (action === 'save') { saveToLibrary(values.name); app.popups.post('form', { type: 'form:fields', fields: [{ key: 'name', type: 'text', label: t('bimx.saveAs'), icon: 'text', value: '' }, { key: 'items', type: 'list', label: t('bimx.libraryItems'), icon: 'bimLibrary', options: options() }] }); } },
    });
  }
  function insertFromLibrary(value) {
    if (value.startsWith('e')) {
      const i = Number(value.slice(1));
      const [length, width, height] = EQUIPMENT_SIZES[EQUIPMENT_TYPES[i]] ?? [1000, 1000, 1000];
      return app.insertSolid('equipment', { equipment: i, length, width, height }, { x: 0, y: 0, z: 0 });
    }
    const item = (state.settings.bimLibrary ?? [])[Number(value.slice(1))];
    if (!item) return null;
    const made = app.change('bimx.op.libraryInsert', (d) => item.entities.map((raw) => D.addEntity(d, raw.type, raw)).filter(Boolean));
    app.select(made.map((e) => e.id));
    return made;
  }
  function saveToLibrary(name) {
    const list = selected();
    if (!list.length) { app.notify('info', t('bimx.selectFirst')); return null; }
    const entities = list.map(({ id, group, ...rest }) => { void id; void group; return normalizeEntity(rest) && rest; }).filter(Boolean);
    const item = { name: (name || labelOf(list[0])).slice(0, 60), entities };
    app.updateSettings({ bimLibrary: [...(state.settings.bimLibrary ?? []), item].slice(-50) });
    app.notify('success', t('bimx.savedToLibrary', { name: item.name }));
    return item;
  }

  /** BIM_ImagePlane: a picture on a thin plate (a reference photo or scanned plan in 3D). */
  async function imagePlane(given = null) {
    const data = given ?? await app.chooseImageData();
    if (!data) return null;
    const size = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.onerror = () => resolve([1000, 1000]); img.src = data; });
    const k = 1000 / Math.max(...size);
    const [w, h] = size.map((v) => Math.round(v * k * 10));
    const made = app.change('bimx.op.imagePlane', (d) => D.addEntity(d, 'solid', { kind: 'box', name: t('bimx.imagePlane'), params: { length: w, width: h, height: 1 }, x: 0, y: 0, z: 0, texture: { data, scale: w } }));
    app.select([made.id]);
    return made;
  }

  /** BIM_Examples: a small house in a new drawing. */
  function examples() {
    app.newDrawing();
    const raws = exampleHouse({ wall: t('solid.wall'), slab: t('solid.slab'), roof: t('solid.roof'), space: t('bimx.livingRoom') });
    const made = app.change('bimx.op.example', (d) => {
      const bim = app.ensureBim(d);
      const mat = (id) => bim.materials.find((m) => m.id === id);
      d.title = t('bimx.exampleTitle');
      return raws.map((raw) => D.addEntity(d, 'solid', { ...raw, level: bim.activeLevel, ...(raw.material ? { material: mat(raw.material) } : {}) }));
    });
    app.select([]);
    return made;
  }

  const has = (n = 1) => () => solids().length >= n;
  const sel = (n = 1) => () => selected().length >= n;
  return {
    'bim:add': { icon: 'bimAdd', label: 'bimx.add', enabled: has(2), run: () => addToComponent('add') },
    'bim:remove': { icon: 'bimRemove', label: 'bimx.remove', enabled: has(1), run: () => removeFromComponent() },
    'bim:toggleSubs': { icon: 'bimToggleSubs', label: 'bimx.toggleSubs', enabled: () => Boolean(drawing()?.entities.some((e) => e.components)), run: () => toggleSubs() },
    'bim:check': { icon: 'bimCheck', label: 'bimx.check', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => check() },
    'bim:closeHoles': { icon: 'bimCloseHoles', label: 'bimx.closeHoles', enabled: has(1), run: () => closeHoles() },
    'bim:selectNonSolid': { icon: 'bimSelectNonSolid', label: 'bimx.selectNonSolid', enabled: hasDoc, run: () => selectNonSolid() },
    'bim:removeShape': { icon: 'bimRemoveShape', label: 'bimx.removeShape', enabled: has(1), run: () => removeShape() },
    'bim:component': { icon: 'bimComponent', label: 'bimx.component', enabled: has(1), run: () => component() },
    'bim:cutPlane': { icon: 'bimCutPlane', label: 'bimx.cutPlane', enabled: () => solids().length === 1, run: (ctx) => cutPlane(ctx?.values ?? null) },
    'bim:frame': { icon: 'bimFrame', label: 'bimx.frame', enabled: sel(2), run: () => frame() },
    'bim:grid': { icon: 'bimGrid', label: 'bimx.grid', enabled: hasDoc, run: (ctx) => grid(ctx?.values ?? null) },
    'bim:axisSystem': { icon: 'bimAxisSystem', label: 'bimx.axisSystem', enabled: () => solids().filter((e) => e.kind === 'axis').length >= 2, run: () => axisSystem() },
    'bim:structuralSystem': { icon: 'bimStructuralSystem', label: 'bimx.structuralSystem', enabled: has(2), run: () => structuralSystem() },
    'bim:mergeWalls': { icon: 'bimMergeWalls', label: 'bimx.mergeWalls', enabled: has(2), run: () => mergeWalls() },
    'bim:panelCut': { icon: 'bimPanelCut', label: 'bimx.panelCut', enabled: has(1), run: () => panelCut() },
    'bim:pipeConnector': { icon: 'bimPipeConnector', label: 'bimx.pipeConnector', enabled: has(2), run: () => pipeConnector() },
    'bim:profile': { icon: 'bimProfile', label: 'bimx.profile', enabled: hasDoc, run: (ctx) => profile(ctx?.values ?? null) },
    'bim:reference': { icon: 'bimReference', label: 'bimx.reference', enabled: hasDoc, run: (ctx) => reference(ctx?.values ?? null) },
    'bim:survey': { icon: 'bimSurvey', label: 'bimx.survey', enabled: sel(1), run: () => survey() },
    'bim:toggleBrep': { icon: 'bimBrep', label: 'bimx.toggleBrep', enabled: has(1), checked: () => solids().length > 0 && solids().every((e) => e.bim?.brep), run: () => toggleBrep() },
    'bim:classification': { icon: 'bimClassification', label: 'bimx.classification', enabled: has(1), run: (ctx) => classification(ctx?.values ?? null) },
    'bim:convert': { icon: 'bimConvert', label: 'bimx.convert', enabled: has(1), run: (ctx) => convert(ctx?.values ?? null) },
    'bim:ifcElements': { icon: 'bimIfcElements', label: 'bimx.ifcElements', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: (ctx) => ifcElements(ctx?.values ?? null) },
    'bim:ifcProperties': { icon: 'bimIfcProperties', label: 'bimx.ifcProperties', enabled: has(1), run: (ctx) => ifcProperties(ctx?.values ?? null) },
    'bim:ifcQuantities': { icon: 'bimIfcQuantities', label: 'bimx.ifcQuantities', enabled: has(1), run: (ctx) => ifcQuantities(ctx?.values ?? null) },
    'bim:ifcSpreadsheet': { icon: 'bimSheet', label: 'bimx.ifcSpreadsheet', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => ifcSpreadsheet() },
    'bim:diff': { icon: 'bimDiff', label: 'bimx.diff', enabled: () => state.docs.length > 1, run: (ctx) => diff(ctx?.values ?? null) },
    'bim:ifcDiff': { icon: 'bimDiff', label: 'bimx.ifcDiff', enabled: hasDoc, run: (ctx) => ifcDiff(ctx?.file ?? null) },
    'bim:ifcExplorer': { icon: 'bimIfcExplorer', label: 'bimx.ifcExplorer', enabled: hasDoc, run: (ctx) => ifcExplorer(ctx?.file ?? null) },
    'bim:ifcConvertDocument': { icon: 'ifcConvertDoc', label: 'bimx.ifcConvertDocument', enabled: hasDoc, run: () => ifcConvertDocument() },
    'bim:ifcExpand': { icon: 'ifcExpand', label: 'bimx.ifcExpand', enabled: () => Boolean(selected()[0]?.group || state.treeGroup), run: () => ifcExpand() },
    'bim:ifcVersion': { icon: 'ifcVersion', label: 'bimx.ifcVersion', run: () => ifcVersion() },
    'bim:trash': { icon: 'bimTrash', label: 'bimx.trash', enabled: sel(1), run: () => trash() },
    'bim:emptyTrash': { icon: 'bimEmptyTrash', label: 'bimx.emptyTrash', enabled: () => Boolean(drawing()?.entities.some((e) => e.group === TRASH)), run: () => emptyTrash() },
    'bim:ungroup': { icon: 'bimUngroup', label: 'bimx.ungroup', enabled: () => selected().some((e) => e.group), run: () => ungroup() },
    'bim:reorder': { icon: 'bimReorder', label: 'bimx.reorder', enabled: sel(2), run: (ctx) => reorder(ctx?.values ?? null) },
    'bim:resetCloneColors': { icon: 'bimResetCloneColors', label: 'bimx.resetCloneColors', enabled: () => Boolean(drawing()?.entities.some((e) => e.clone)), run: () => resetCloneColors() },
    'bim:glue': { icon: 'bimGlue', label: 'bimx.glue', enabled: sel(2), run: () => glue() },
    'bim:rewire': { icon: 'bimRewire', label: 'bimx.rewire', enabled: sel(1), run: () => rewire() },
    'bim:nudgeUp': { icon: 'nudgeUp', label: 'bimx.nudgeUp', key: 'Ctrl+Up', enabled: sel(1), run: nudgeMove(0, 1) },
    'bim:nudgeDown': { icon: 'nudgeDown', label: 'bimx.nudgeDown', key: 'Ctrl+Down', enabled: sel(1), run: nudgeMove(0, -1) },
    'bim:nudgeLeft': { icon: 'nudgeLeft', label: 'bimx.nudgeLeft', key: 'Ctrl+Left', enabled: sel(1), run: nudgeMove(-1, 0) },
    'bim:nudgeRight': { icon: 'nudgeRight', label: 'bimx.nudgeRight', key: 'Ctrl+Right', enabled: sel(1), run: nudgeMove(1, 0) },
    'bim:nudgeRotateLeft': { icon: 'nudgeRotateLeft', label: 'bimx.nudgeRotateLeft', enabled: sel(1), run: nudgeTurn(90) },
    'bim:nudgeRotateRight': { icon: 'nudgeRotateRight', label: 'bimx.nudgeRotateRight', enabled: sel(1), run: nudgeTurn(-90) },
    'bim:nudgeExtend': { icon: 'nudgeExtend', label: 'bimx.nudgeExtend', enabled: sel(1), run: () => nudgeSize(1) },
    'bim:nudgeShrink': { icon: 'nudgeShrink', label: 'bimx.nudgeShrink', enabled: sel(1), run: () => nudgeSize(-1) },
    'bim:nudgeSwitch': { icon: 'nudgeSwitch', label: 'bimx.nudgeSwitch', enabled: () => selected().length === 1, run: () => nudgeSwitch() },
    'bim:preflight': { icon: 'bimPreflight', label: 'bimx.preflight', enabled: hasDoc, run: () => runPreflight() },
    'bim:project': { icon: 'bimProject', label: 'bimx.project', enabled: hasDoc, run: (ctx) => project(ctx?.values ?? null) },
    'bim:views': { icon: 'bimViews', label: 'bimx.views', enabled: hasDoc, run: (ctx) => (ctx?.level !== undefined ? showLevel(ctx.level) : views()) },
    'bim:setup': { icon: 'bimSetup', label: 'bimx.setup', run: (ctx) => setup(ctx?.values ?? null) },
    'bim:wpFront': { icon: 'wpFront', label: 'bimx.wpFront', enabled: hasDoc, run: wpOn([0, -1, 0]) },
    'bim:wpSide': { icon: 'wpSide', label: 'bimx.wpSide', enabled: hasDoc, run: wpOn([1, 0, 0]) },
    'bim:wpTop': { icon: 'wpTop', label: 'bimx.wpTop', enabled: hasDoc, run: wpOn(null) },
    'bim:wpView': { icon: 'wpView', label: 'bimx.wpView', enabled: hasDoc, run: () => wpView() },
    'bim:togglePanels': { icon: 'bimTogglePanels', label: 'bimx.togglePanels', run: () => togglePanels() },
    'bim:material': { icon: 'bimMaterial', label: 'bimx.material', enabled: has(1), run: (ctx) => material(ctx?.values ?? null) },
    'bim:moveView': { icon: 'bimMoveView', label: 'bimx.moveView', enabled: sel(1), run: (ctx) => moveView(ctx?.values ?? null) },
    'bim:reextrude': { icon: 'bimReextrude', label: 'bimx.reextrude', enabled: has(1), run: (ctx) => reextrude(ctx?.values ?? null) },
    'bim:library': { icon: 'bimLibrary', label: 'bimx.library', enabled: hasDoc, run: (ctx) => (ctx?.insert ? insertFromLibrary(ctx.insert) : ctx?.save !== undefined ? saveToLibrary(ctx.save) : library()) },
    'bim:imagePlane': { icon: 'bimImagePlane', label: 'bimx.imagePlane', enabled: hasDoc, run: (ctx) => imagePlane(ctx?.data ?? null) },
    'bim:examples': { icon: 'bimExamples', label: 'bimx.examples', run: () => examples() },
  };
}

export const BIM_MENU = {
  components: ['bim:add', 'bim:remove', 'bim:toggleSubs', 'bim:component', 'bim:cutPlane', '-', 'bim:check', 'bim:closeHoles', 'bim:selectNonSolid', 'bim:removeShape'],
  structure: ['bim:frame', 'bim:profile', 'bim:grid', 'bim:axisSystem', 'bim:structuralSystem', '-', 'bim:mergeWalls', 'bim:panelCut', 'bim:pipeConnector', 'bim:reextrude'],
  ifc: ['bim:convert', 'bim:ifcElements', 'bim:classification', 'bim:ifcProperties', 'bim:ifcQuantities', 'bim:toggleBrep', 'bim:material', '-', 'bim:ifcSpreadsheet', 'bim:ifcExplorer', 'bim:ifcConvertDocument', 'bim:ifcExpand', 'bim:preflight', 'bim:diff', 'bim:ifcDiff', 'bim:ifcVersion'],
  manage: ['bim:project', 'bim:views', 'bim:setup', 'bim:reference', 'bim:library', 'bim:examples', 'bim:imagePlane', 'bim:survey', '-', 'bim:trash', 'bim:emptyTrash', 'bim:ungroup', 'bim:reorder', 'bim:resetCloneColors', 'bim:glue', 'bim:rewire', 'bim:moveView'],
  nudge: ['bim:nudgeUp', 'bim:nudgeDown', 'bim:nudgeLeft', 'bim:nudgeRight', 'bim:nudgeRotateLeft', 'bim:nudgeRotateRight', 'bim:nudgeExtend', 'bim:nudgeShrink', 'bim:nudgeSwitch'],
  workPlane: ['bim:wpFront', 'bim:wpSide', 'bim:wpTop', 'bim:wpView', 'bim:togglePanels'],
};

export const BIM_FREECAD = {
  Arch_Add: 'bim:add', Arch_AxisSystem: 'bim:axisSystem', Arch_Check: 'bim:check', Arch_CloneComponent: 'clone', Arch_CloseHoles: 'bim:closeHoles', Arch_Component: 'bim:component',
  Arch_CutPlane: 'bim:cutPlane', Arch_Frame: 'bim:frame', Arch_Grid: 'bim:grid', Arch_IfcSpreadsheet: 'bim:ifcSpreadsheet', Arch_MergeWalls: 'bim:mergeWalls', Arch_MeshToShape: 'part:shapeFromMesh',
  Arch_Panel_Cut: 'bim:panelCut', Arch_PipeConnector: 'bim:pipeConnector', Arch_Profile: 'bim:profile', Arch_Reference: 'bim:reference', Arch_Remove: 'bim:remove', Arch_RemoveShape: 'bim:removeShape',
  Arch_SelectNonSolidMeshes: 'bim:selectNonSolid', Arch_SplitMesh: 'mesh:splitComponents', Arch_StructuralSystem: 'bim:structuralSystem', Arch_StructuresFromSelection: ['arch:column', 'arch:beam'],
  Arch_Survey: 'bim:survey', Arch_ToggleIfcBrepFlag: 'bim:toggleBrep', Arch_ToggleSubs: 'bim:toggleSubs',
  BIM_Builder: 'part:builder', BIM_Classification: 'bim:classification', BIM_Compound: 'part:compound', BIM_Convert: 'bim:convert', BIM_Diff: 'bim:diff', BIM_DrawingView: 'solidSection',
  BIM_EmptyTrash: 'bim:emptyTrash', BIM_Examples: 'bim:examples', BIM_Glue: 'bim:glue', BIM_IfcElements: 'bim:ifcElements', BIM_IfcExplorer: 'bim:ifcExplorer', BIM_IfcProperties: 'bim:ifcProperties',
  BIM_IfcQuantities: 'bim:ifcQuantities', BIM_ImagePlane: 'bim:imagePlane', BIM_Library: 'bim:library', BIM_Material: 'bim:material', BIM_MoveView: 'bim:moveView',
  BIM_Nudge_Down: 'bim:nudgeDown', BIM_Nudge_Extend: 'bim:nudgeExtend', BIM_Nudge_Left: 'bim:nudgeLeft', BIM_Nudge_Right: 'bim:nudgeRight', BIM_Nudge_RotateLeft: 'bim:nudgeRotateLeft',
  BIM_Nudge_RotateRight: 'bim:nudgeRotateRight', BIM_Nudge_Shrink: 'bim:nudgeShrink', BIM_Nudge_Switch: 'bim:nudgeSwitch', BIM_Nudge_Up: 'bim:nudgeUp', BIM_Preflight: 'bim:preflight',
  BIM_Project: 'bim:project', BIM_ProjectManager: ['bim:project', 'bimManager'], BIM_Reextrude: 'bim:reextrude', BIM_Reorder: 'bim:reorder', BIM_ResetCloneColors: 'bim:resetCloneColors',
  BIM_Rewire: 'bim:rewire', BIM_Setup: 'bim:setup', BIM_SetWPFront: 'bim:wpFront', BIM_SetWPSide: 'bim:wpSide', BIM_SetWPTop: 'bim:wpTop', BIM_SimpleCopy: 'part:simpleCopy', BIM_Sketch: 'sk:new',
  BIM_TDPage: 'td:pageTemplate', BIM_TDView: 'td:activeView', BIM_TogglePanels: 'bim:togglePanels', BIM_Trash: 'bim:trash', BIM_Ungroup: 'bim:ungroup', BIM_Views: 'bim:views', BIM_WPView: 'bim:wpView',
  IFC_ConvertDocument: 'bim:ifcConvertDocument', IFC_Diff: 'bim:ifcDiff', IFC_Expand: 'bim:ifcExpand', IFC_MakeProject: 'bim:project', IFC_UpdateIOS: 'bim:ifcVersion',
};
