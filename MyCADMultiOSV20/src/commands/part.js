// FreeCAD's Part workbench commands MyCAD did not have yet: element selection
// (faces, edges, vertices), compounds, Boolean Fragments, Slice, XOR and the
// Join features, Mirror, Scale, Refine, Reverse, shapes from meshes, datums
// and attachment, section cuts and cross-sections, element copies, colours per
// face, projections, curve networks, shape info, tolerance and defeaturing.
import './part-icons.js';
import { normalizeSolidData, solidMesh, solidProperties } from '../domain/solids.js';
import { MIRROR_PLANES, DATUM_TYPES, piecesOf } from '../domain/partops.js';
import { occPieces, occReady, occShapeFromMesh, occShapeInfo } from '../domain/occ.js';
import { ATTACH_MODES, attachedPlacement } from '../domain/datums.js';
import { elementName } from '../domain/topology.js';
import { checkSolid } from '../domain/meshcheck.js';
import { sectionOutlines } from '../domain/views.js';


export const ELEMENT_FILTERS = ['face', 'edge', 'vertex'];

export function partCommands(app) {
  const { t, state } = app;
  const solids = () => app.selectedSolids();
  const atLeast = (n) => () => solids().length >= n;
  const one = () => solids().length === 1;
  const elements = () => state.elements ?? [];
  const label = (entity) => app.labelOf(entity);
  const data = (entity) => normalizeSolidData(entity);

  /** A new solid made from the selection, which it consumes (as the booleans do). */
  function replaceSelection(kind, shape, params = {}, nameKey = `part.name.${kind}`) {
    const list = solids();
    const base = list[0];
    const raw = { type: 'solid', kind, name: `${t(nameKey)} (${label(base)})`, params, shape };
    const added = app.change(`part.op.${kind}`, (d) => {
      app.D.removeEntities(d, list.map((e) => e.id));
      return app.D.addEntity(d, 'solid', { ...raw, layer: base.layer, color: base.color });
    });
    app.select([added.id]);
    return added;
  }

  const op = (kind, shapeOf, extra = {}) => ({ icon: extra.icon, label: `part.${kind}`, enabled: extra.enabled ?? atLeast(1), run: async () => {
    const result = await shapeOf();
    if (!result) return;
    const added = replaceSelection(result.kind ?? kind, result.shape, result.params ?? {});
    const volume = solidProperties(added)?.volume;
    app.notify('success', t('part.done', { name: t(`part.${kind}`), volume: volume ? app.fmt(volume, 1) : '—' }));
  } });

  async function mirrorDialog() {
    const answer = await app.form({ title: t('part.mirror'), icon: 'partMirror', width: 460, fields: [
      { key: 'plane', type: 'select', label: t('part.mirrorPlane'), icon: 'partMirror', value: '0', options: MIRROR_PLANES.map((p, i) => [String(i), t(`part.plane.${p}`)]) },
      { key: 'offset', type: 'number', label: t('part.mirrorOffset'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'keep', type: 'check', label: t('part.keepOriginal'), icon: 'copy', value: true },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    return answer?.action === 'ok' ? answer.values : null;
  }

  async function scaleDialog() {
    const answer = await app.form({ title: t('part.scale'), icon: 'partScale', width: 460, intro: t('part.scaleIntro'), fields: [
      { key: 'sx', type: 'number', label: 'X', icon: 'partScale', value: 2, step: 0.1, unit: '×' },
      { key: 'sy', type: 'number', label: 'Y', icon: 'partScale', value: 2, step: 0.1, unit: '×' },
      { key: 'sz', type: 'number', label: 'Z', icon: 'partScale', value: 2, step: 0.1, unit: '×' },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    return answer?.action === 'ok' ? answer.values : null;
  }

  // ───────────────────────── element selection

  const filter = (kind) => ({
    icon: kind ? `select${kind[0].toUpperCase()}${kind.slice(1)}` : 'selectNone', label: `part.filter.${kind ?? 'off'}`,
    checked: () => (state.elementFilter ?? null) === kind, run: () => app.setElementFilter(kind),
  });

  const commands = {
    'selectFilter:face': filter('face'), 'selectFilter:edge': filter('edge'), 'selectFilter:vertex': filter('vertex'), 'selectFilter:off': filter(null),
    selectFilter: { icon: 'selectFace', label: 'part.filter.menu', run: (context) => app.showCommandMenu(['selectFilter:face', 'selectFilter:edge', 'selectFilter:vertex', '-', 'selectFilter:off'], context, 'part.filter.menu') },
    boxSelect3d: { icon: 'boxElements', label: 'part.boxSelect', enabled: () => Boolean(app.activeDoc()), run: () => app.boxSelect3d() },

    // ── compounds and booleans
    'part:compound': op('compound', () => ({ shape: { parts: solids().map(data) } }), { icon: 'partCompound' }),
    'part:fragments': op('fragments', () => ({ shape: { parts: solids().map(data) } }), { icon: 'partFragments', enabled: atLeast(2) }),
    'part:slice': op('slice', () => ({ shape: { base: data(solids()[0]), tools: solids().slice(1).map(data) } }), { icon: 'partSlice', enabled: atLeast(2) }),
    'part:sliceApart': { icon: 'partSliceApart', label: 'part.sliceApart', enabled: atLeast(2), run: () => sliceApart() },
    'part:xor': op('xor', () => ({ kind: 'boolean', shape: xorTree(solids().map(data)) }), { icon: 'partXor', enabled: atLeast(2) }),
    'part:joinConnect': op('joinConnect', () => ({ kind: 'refine', shape: { base: { type: 'solid', kind: 'boolean', name: '', params: {}, shape: { op: 'union', parts: solids().map(data) }, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false } } }), { icon: 'partConnect', enabled: atLeast(2) }),
    'part:joinEmbed': op('joinEmbed', () => ({ kind: 'boolean', shape: { op: 'union', parts: solids().map(data) } }), { icon: 'partEmbed', enabled: atLeast(2) }),
    'part:joinCutout': op('joinCutout', () => ({ kind: 'boolean', shape: { op: 'cut', parts: solids().map(data) } }), { icon: 'partCutout', enabled: atLeast(2) }),
    'part:compoundFilter': op('compoundFilter', async () => {
      const answer = await app.form({ title: t('part.compoundFilter'), icon: 'partCompoundFilter', width: 480, intro: t('part.compoundFilterIntro'), fields: [
        { key: 'from', type: 'number', label: t('part.filterFrom'), icon: 'list', value: 0, min: 0, step: 1 },
        { key: 'to', type: 'number', label: t('part.filterTo'), icon: 'list', value: 0, min: 0, step: 1 },
        { key: 'minVolume', type: 'number', label: t('part.filterMinVolume'), icon: 'partCompoundFilter', value: 0, min: 0, step: 1, unit: 'mm³' },
      ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
      return answer?.action === 'ok' ? { shape: { base: data(solids()[0]) }, params: answer.values } : null;
    }, { icon: 'partCompoundFilter', enabled: one }),

    // ── transforms of shapes
    'part:mirror': { icon: 'partMirror', label: 'part.mirror', enabled: atLeast(1), run: async () => {
      const v = await mirrorDialog();
      if (!v) return;
      const list = solids();
      const made = app.change('part.op.mirror3d', (d) => {
        if (!v.keep) app.D.removeEntities(d, list.map((e) => e.id));
        return list.map((e) => app.D.addEntity(d, 'solid', { type: 'solid', kind: 'mirror3d', name: `${t('part.name.mirror3d')} (${label(e)})`, params: { plane: Number(v.plane), offset: v.offset }, shape: { base: data(e) }, layer: e.layer, color: e.color }).id);
      });
      app.select(made);
    } },
    'part:scale': op('scale3d', async () => {
      const v = await scaleDialog();
      return v ? { shape: { base: data(solids()[0]) }, params: v } : null;
    }, { icon: 'partScale', enabled: one }),
    'part:refine': op('refine', () => ({ shape: { base: data(solids()[0]) } }), { icon: 'partRefine', enabled: one }),
    'part:reverse': op('reverse', () => ({ shape: { base: data(solids()[0]) } }), { icon: 'partReverse', enabled: one }),
    'part:simpleCopy': { icon: 'partSimpleCopy', label: 'part.simpleCopy', enabled: atLeast(1), run: () => simpleCopies(solids()) },
    'part:transformedCopy': { icon: 'partTransformedCopy', label: 'part.transformedCopy', enabled: atLeast(1), run: async () => { const ids = simpleCopies(solids(), { keepHistory: true }); app.select(ids); await app.run('transform'); } },

    // ── shapes from meshes and other shapes
    'part:shapeFromMesh': { icon: 'partFromMesh', label: 'part.shapeFromMesh', enabled: () => solids().some((e) => e.kind === 'mesh'), run: () => shapeFromMesh(false) },
    'part:makeSolid': { icon: 'partMakeSolid', label: 'part.makeSolid', enabled: atLeast(1), run: () => shapeFromMesh(true) },
    'part:pointsFromShape': { icon: 'partPoints', label: 'part.pointsFromShape', enabled: atLeast(1), run: () => pointsFromShape() },
    'part:makeFace': { icon: 'partMakeFace', label: 'part.makeFace', enabled: () => app.selectedEntities().some((e) => e.type !== 'solid'), run: () => app.makeFaceFromWires() },
    'part:builder': { icon: 'partBuilder', label: 'part.builder', enabled: () => elements().length > 0, run: () => shapeBuilder() },
    'part:elementCopy': { icon: 'partElementCopy', label: 'part.elementCopy', enabled: () => elements().length > 0, run: () => elementCopy() },
    'part:colorPerFace': { icon: 'partColorFace', label: 'part.colorPerFace', enabled: () => elements().some((e) => e.kind === 'face'), run: () => colorPerFace() },
    'part:projectOnSurface': { icon: 'partProject', label: 'part.projectOnSurface', enabled: () => elements().some((e) => e.kind === 'face') && app.selectedEntities().some((e) => e.type !== 'solid'), run: () => app.projectOnSurface() },
    'part:importCurveNet': { icon: 'partCurveNet', label: 'part.importCurveNet', run: () => app.importCurveNetwork() },
    'part:pickCurveNet': { icon: 'partCurveNet', label: 'part.pickCurveNet', enabled: () => elements().some((e) => e.kind === 'edge'), run: () => elementCopy({ edgesAsOne: true }) },

    // ── sections, information, healing
    'part:sectionCut': { icon: 'partSectionCut', label: 'part.sectionCut', enabled: () => Boolean(app.activeDrawing()?.entities.some((e) => e.type === 'solid')), run: () => sectionCut() },
    'part:crossSections': { icon: 'partCrossSections', label: 'part.crossSections', enabled: atLeast(1), run: () => crossSections() },
    'part:shapeInfo': { icon: 'partInfo', label: 'part.shapeInfo', enabled: one, run: () => shapeInfo() },
    'part:tolerance': { icon: 'partTolerance', label: 'part.tolerance', enabled: atLeast(1), run: () => toleranceDialog() },
    'part:defeaturing': { icon: 'partDefeature', label: 'part.defeaturing', enabled: () => one() && ['boolean', 'fillet', 'chamfer', 'thickness', 'offset3d', 'draft', 'pattern', 'refine'].includes(solids()[0].kind), run: () => defeaturing() },

    // ── datums and attachment
    ...Object.fromEntries(DATUM_TYPES.map((type) => [`datum:${type}`, { icon: `datum${type === 'csys' ? 'Csys' : type[0].toUpperCase() + type.slice(1)}`, label: `part.datum.${type}`, enabled: () => Boolean(app.activeDoc()), run: () => addDatum(type) }])),
    attachment: { icon: 'attachment', label: 'part.attachment', enabled: () => solids().length === 1, run: () => attachmentDialog() },
  };

  // ───────────────────────── helpers

  /** XOR of shapes: what lies in an odd number of them — (a ∪ b) − (a ∩ b), folded left. */
  function xorTree(parts) {
    const wrap = (shape) => ({ type: 'solid', kind: 'boolean', name: '', params: {}, shape, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false });
    return parts.slice(1).reduce((acc, part, i) => {
      const left = i === 0 ? parts[0] : wrap(acc);
      return { op: 'cut', parts: [wrap({ op: 'union', parts: [left, part] }), wrap({ op: 'common', parts: [left, part] })] };
    }, null) ?? { op: 'union', parts };
  }

  /** Part_SliceApart: the pieces of a slice as separate solids (exact when the kernel is there). */
  function sliceApart() {
    const list = solids();
    const slice = normalizeSolidData({ type: 'solid', kind: 'slice', params: {}, shape: { base: data(list[0]), tools: list.slice(1).map(data) } });
    const exact = occReady() ? occPieces(slice) : null;
    const pieces = exact?.length ? exact.map((p) => ({ tris: p.tris, brep: p.brep })) : piecesOf(solidMesh(slice)).map((tris) => ({ tris }));
    const made = app.change('part.op.sliceApart', (d) => {
      app.D.removeEntities(d, [list[0].id]);
      return pieces.map((piece, i) => app.D.addEntity(d, 'solid', { kind: 'mesh', name: `${label(list[0])} · ${i + 1}`, params: {}, shape: { tris: piece.tris.flat(2), ...(piece.brep ? { brep: piece.brep } : {}) }, layer: list[0].layer, color: list[0].color }).id);
    });
    app.select(made);
    app.notify('success', t('part.sliced', { count: made.length }));
  }

  /** Part_SimpleCopy: the shape alone (no history), as an exact or mesh solid; the original stays. */
  function simpleCopies(list, { keepHistory = false } = {}) {
    return app.change('part.op.copy', (d) => list.map((e) => {
      const copy = keepHistory ? { ...structuredClone(e), id: undefined } : { kind: 'mesh', name: `${label(e)} (${t('part.copy')})`, params: {}, shape: { tris: solidMesh(e).flat(2), ...(occReady() && e.kind === 'mesh' && e.shape?.brep ? { brep: e.shape.brep } : {}) }, layer: e.layer, color: e.color };
      return app.D.addEntity(d, 'solid', copy).id;
    }));
  }

  async function shapeFromMesh(solid) {
    const list = solids();
    const tolerance = list[0].tolerance ?? 1e-3;
    if (!occReady()) { app.notify('info', t('part.needsKernel')); return; }
    const made = [];
    app.change(solid ? 'part.op.makeSolid' : 'part.op.shapeFromMesh', (d) => {
      for (const e of list) {
        const brep = occShapeFromMesh(solidMesh(e), tolerance, solid);
        if (!brep) continue;
        made.push(app.D.addEntity(d, 'solid', { kind: 'mesh', name: `${label(e)} (${t(solid ? 'part.solid' : 'part.shape')})`, params: {}, shape: { tris: solidMesh(e).flat(2), brep }, layer: e.layer, color: e.color }).id);
        app.D.updateEntity(d, e.id, { hidden: true });
      }
    });
    app.select(made);
    app.notify(made.length ? 'success' : 'error', t(made.length ? 'part.shapeMade' : 'part.shapeFailed', { count: made.length }));
  }

  async function pointsFromShape() {
    const answer = await app.form({ title: t('part.pointsFromShape'), icon: 'partPoints', width: 460, fields: [{ key: 'spacing', type: 'number', label: t('part.pointSpacing'), icon: 'partPoints', value: 2, min: 0.01, step: 0.5, unit: 'mm' }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const spacing = Math.max(0.01, answer.values.spacing);
    const pts = [];
    for (const e of solids()) {
      for (const [a, b, c] of solidMesh(e)) {
        const ab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const ac = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const n = Math.max(1, Math.min(60, Math.ceil(Math.max(ab, ac) / spacing)));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
          const u = i / n; const w = j / n;
          pts.push(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * w, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * w, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * w);
        }
        if (pts.length > 1_500_000) break;
      }
    }
    // Shared edges give the same point twice: one of each.
    const seen = new Set(); const unique = [];
    for (let i = 0; i < pts.length; i += 3) { const key = `${Math.round(pts[i] / spacing * 4)},${Math.round(pts[i + 1] / spacing * 4)},${Math.round(pts[i + 2] / spacing * 4)}`; if (!seen.has(key)) { seen.add(key); unique.push(pts[i], pts[i + 1], pts[i + 2]); } }
    const id = app.change('part.op.points', (d) => app.D.addEntity(d, 'solid', { kind: 'points', name: t('part.pointsName'), params: {}, shape: { pts: unique } }).id);
    app.select([id]);
    app.notify('success', t('part.pointsMade', { count: unique.length / 3 }));
  }

  /** Part_ElementCopy / PickCurveNet: the picked faces as surface meshes, edges as 3D wires, vertices as points. */
  function elementCopy({ edgesAsOne = false } = {}) {
    const list = elements();
    const made = app.change('part.op.elementCopy', (d) => {
      const out = [];
      const faces = list.filter((e) => e.kind === 'face');
      const edges = list.filter((e) => e.kind === 'edge');
      const vertices = list.filter((e) => e.kind === 'vertex');
      for (const face of faces) {
        const tris = app.elementTriangles(face);
        if (tris.length) out.push(app.D.addEntity(d, 'solid', { kind: 'mesh', name: `${label(app.D.findEntity(d, face.id))} · ${elementName('face', face.index)}`, params: {}, shape: { tris: tris.flat(2) } }).id);
      }
      const paths = edges.map((edge) => app.elementPoints(edge)).filter((p) => p.length >= 2);
      if (paths.length) {
        if (edgesAsOne) out.push(app.D.addEntity(d, 'solid', { kind: 'wire3d', name: t('part.curveNetName'), params: {}, shape: { paths } }).id);
        else paths.forEach((path, i) => out.push(app.D.addEntity(d, 'solid', { kind: 'wire3d', name: `${label(app.D.findEntity(d, edges[i].id))} · ${elementName('edge', edges[i].index)}`, params: {}, shape: { paths: [path] } }).id));
      }
      if (vertices.length) out.push(app.D.addEntity(d, 'solid', { kind: 'points', name: t('part.vertexCopy'), params: {}, shape: { pts: vertices.flatMap((v) => app.elementPoints(v)[0] ?? []) } }).id);
      return out;
    });
    app.clearElements();
    app.select(made);
    app.notify('success', t('part.elementsCopied', { count: made.length }));
  }

  async function colorPerFace() {
    const faces = elements().filter((e) => e.kind === 'face');
    const answer = await app.form({ title: t('part.colorPerFace'), icon: 'partColorFace', width: 440, intro: t('part.colorPerFaceIntro', { count: faces.length }), fields: [{ key: 'color', type: 'color', label: t('prop.color'), icon: 'palette', value: '#e5484d' }], actions: [{ id: 'clear', label: t('part.colorClear') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (!answer) return;
    app.change('part.op.colorPerFace', (d) => {
      for (const id of new Set(faces.map((f) => f.id))) {
        const entity = app.D.findEntity(d, id);
        const mine = faces.filter((f) => f.id === id);
        const keep = (entity.faceColors ?? []).filter((fc) => !mine.some((f) => JSON.stringify(f.signature) === JSON.stringify(fc.signature)));
        app.D.updateEntity(d, id, { faceColors: answer.action === 'clear' ? keep : [...keep, ...mine.map((f) => ({ signature: f.signature, color: answer.values.color }))] });
      }
    });
    app.clearElements();
  }

  async function shapeBuilder() {
    const list = elements();
    const kinds = new Set(list.map((e) => e.kind));
    const options = [...(kinds.has('vertex') ? [['wire', t('part.build.wire')]] : []), ...(kinds.has('edge') ? [['wire', t('part.build.wireEdges')], ['face', t('part.build.face')]] : []), ...(kinds.has('face') ? [['shell', t('part.build.shell')], ['solid', t('part.build.solid')]] : [])];
    const answer = await app.form({ title: t('part.builder'), icon: 'partBuilder', width: 480, intro: t('part.builderIntro', { count: list.length }), fields: [{ key: 'make', type: 'select', label: t('part.buildMake'), icon: 'partBuilder', value: options[0]?.[0], options }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const make = answer.values.make;
    let id = null;
    app.change('part.op.builder', (d) => {
      if (make === 'wire') {
        const path = list.filter((e) => e.kind === 'vertex').map((v) => app.elementPoints(v)[0]);
        const paths = path.length >= 2 ? [path] : list.filter((e) => e.kind === 'edge').map((e) => app.elementPoints(e));
        id = app.D.addEntity(d, 'solid', { kind: 'wire3d', name: t('part.build.wire'), params: {}, shape: { paths } }).id;
      } else if (make === 'face') {
        const loop = list.filter((e) => e.kind === 'edge').flatMap((e) => app.elementPoints(e));
        id = app.D.addEntity(d, 'solid', { kind: 'mesh', name: t('part.build.face'), params: {}, shape: { tris: fanTriangles(loop).flat(2) } }).id;
      } else {
        const tris = list.filter((e) => e.kind === 'face').flatMap((f) => app.elementTriangles(f));
        const brep = make === 'solid' && occReady() ? occShapeFromMesh(tris, 1e-3, true) : null;
        id = app.D.addEntity(d, 'solid', { kind: 'mesh', name: t(`part.build.${make}`), params: {}, shape: { tris: tris.flat(2), ...(brep ? { brep } : {}) } }).id;
      }
    });
    app.clearElements();
    if (id) app.select([id]);
  }

  async function sectionCut() {
    const drawing = app.activeDrawing();
    const all = drawing.entities.filter((e) => e.type === 'solid' && !e.hidden && app.D.isVisible3d(drawing, e) && !['datum', 'wire3d', 'points'].includes(e.kind));
    const answer = await app.form({ title: t('part.sectionCut'), icon: 'partSectionCut', width: 480, intro: t('part.sectionCutIntro'), fields: [
      { key: 'axis', type: 'select', label: t('part.cutAxis'), icon: 'axes', value: 'x', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
      { key: 'at', type: 'number', label: t('part.cutAt'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'flip', type: 'check', label: t('part.cutFlip'), icon: 'mirror', value: false },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const { axis, at, flip } = answer.values;
    const big = 1e5;
    const lo = { x: -big, y: -big, z: -big };
    const box = { type: 'solid', kind: 'box', name: '', params: { length: 2 * big, width: 2 * big, height: 2 * big }, ...lo, rx: 0, ry: 0, rz: 0, scale: 1, flip: false };
    // The half of space that is cut away: above the plane (or below it, flipped).
    box[axis] = flip ? at - 2 * big : at;
    const made = app.change('part.op.sectionCut', (d) => {
      const group = { id: app.newId(), name: t('part.sectionCutGroup'), parent: null };
      d.groups = [...(d.groups ?? []), group];
      return all.map((e) => {
        app.D.updateEntity(d, e.id, { hidden: true });
        return app.D.addEntity(d, 'solid', { kind: 'boolean', name: `${label(e)} (${t('part.cut')})`, params: {}, shape: { op: 'cut', parts: [data(e), box] }, layer: e.layer, color: e.color, group: group.id }).id;
      });
    });
    app.select(made);
  }

  async function crossSections() {
    const list = solids();
    const answer = await app.form({ title: t('part.crossSections'), icon: 'partCrossSections', width: 480, intro: t('part.crossSectionsIntro'), fields: [
      { key: 'from', type: 'number', label: t('part.sectFrom'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'to', type: 'number', label: t('part.sectTo'), icon: 'move', value: 10, step: 1, unit: 'mm' },
      { key: 'count', type: 'number', label: t('part.sectCount'), icon: 'list', value: 5, min: 1, max: 200, step: 1 },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const { from, to, count } = answer.values;
    const n = Math.max(1, Math.round(count));
    const levels = Array.from({ length: n }, (_, i) => (n === 1 ? from : from + ((to - from) * i) / (n - 1)));
    const outlines = levels.flatMap((level) => sectionOutlines(list, level));
    if (!outlines.length) { app.notify('info', t('part.sectionsNone')); return; }
    const added = app.change('part.op.crossSections', (d) => app.D.insertEntities(d, outlines));
    app.select(added.map((e) => e.id));
    app.notify('success', t('part.sectionsMade', { count: added.length, levels: n }));
  }

  async function shapeInfo() {
    const e = solids()[0];
    const props = solidProperties(e) ?? {};
    const exact = occReady() ? occShapeInfo(e) : null;
    const mesh = app.topologyOfEntity(e);
    const check = checkSolid(solidMesh(e));
    const box = app.boxOf3d(e);
    const rows = [
      [t('part.info.kind'), `${e.kind}${exact ? ` (${t('part.info.exact')})` : ''}`],
      [t('part.info.volume'), `${app.fmt(props.volume ?? 0, 3)} mm³`], [t('part.info.area'), `${app.fmt(props.area ?? 0, 3)} mm²`],
      [t('part.info.box'), box ? `${box.map((v) => app.fmt(v, 2)).join(' × ')} mm` : '—'],
      [t('part.info.topology'), exact ? `${exact.solids} solids · ${exact.shells} shells · ${exact.faces} faces · ${exact.edges} edges · ${exact.vertices} vertices` : `${mesh.faces.length} faces · ${mesh.edges.length} edges · ${mesh.vertices.length} vertices`],
      [t('part.info.valid'), exact ? (exact.valid ? t('part.info.yes') : t('part.info.no')) : (check.closed ? t('part.info.closed') : t('part.info.open'))],
      [t('part.info.tolerance'), `${e.tolerance ?? 1e-3} mm`],
    ];
    await app.form({ title: `${t('part.shapeInfo')} — ${label(e)}`, icon: 'partInfo', width: 620, fields: rows.map(([l, v], i) => ({ key: `r${i}`, type: 'info', label: l, icon: 'info', value: v })), actions: [{ id: 'ok', label: t('error.close'), primary: true }] });
  }

  async function toleranceDialog() {
    const list = solids();
    const answer = await app.form({ title: t('part.tolerance'), icon: 'partTolerance', width: 460, intro: t('part.toleranceIntro'), fields: [{ key: 'tolerance', type: 'number', label: t('part.toleranceValue'), icon: 'partTolerance', value: list[0].tolerance ?? 0.001, min: 1e-7, max: 10, step: 0.001, unit: 'mm' }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    app.change('part.op.tolerance', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { tolerance: answer.values.tolerance }); });
  }

  /** Part_Defeaturing: features of a solid's history taken away (holes cut into it, roundings, patterns). */
  async function defeaturing() {
    const e = solids()[0];
    const features = [];
    if (e.kind === 'boolean' && e.shape.op !== 'common') e.shape.parts.slice(1).forEach((part, i) => features.push([`part:${i + 1}`, `${e.shape.op === 'cut' ? t('part.feature.cut') : t('part.feature.added')}: ${part.name || part.kind}`]));
    if (['fillet', 'chamfer', 'thickness', 'offset3d', 'draft', 'pattern', 'refine'].includes(e.kind)) features.push(['dress', `${t(`part.feature.${e.kind}`)}`]);
    const answer = await app.form({ title: t('part.defeaturing'), icon: 'partDefeature', width: 560, intro: t('part.defeaturingIntro'), fields: features.map(([key, name]) => ({ key, type: 'check', label: name, icon: 'partDefeature', value: false })), actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('part.removeFeatures'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const v = answer.values;
    app.change('part.op.defeaturing', (d) => {
      if (e.kind === 'boolean') {
        const parts = e.shape.parts.filter((part, i) => i === 0 || !v[`part:${i}`]);
        if (parts.length === 1) { app.D.removeEntities(d, [e.id]); app.D.addEntity(d, 'solid', { ...parts[0], x: (parts[0].x ?? 0) + (e.x ?? 0), y: (parts[0].y ?? 0) + (e.y ?? 0), z: (parts[0].z ?? 0) + (e.z ?? 0), layer: e.layer, color: e.color }); }
        else app.D.updateEntity(d, e.id, { shape: { ...e.shape, parts } });
      } else if (v.dress) {
        const base = e.shape.base;
        app.D.removeEntities(d, [e.id]);
        app.D.addEntity(d, 'solid', { ...base, x: (base.x ?? 0) + (e.x ?? 0), y: (base.y ?? 0) + (e.y ?? 0), z: (base.z ?? 0) + (e.z ?? 0), layer: e.layer, color: e.color });
      }
    });
  }

  // ───────────────────────── datums and attachment

  function addDatum(type) {
    // On the picked elements when there are any (FreeCAD attaches a new datum to the selection).
    const refs = elements().map((el) => ({ id: el.id, kind: el.kind, signature: el.signature }));
    const mode = refs.length ? autoMode(refs) : null;
    const id = app.change('part.op.datum', (d) => app.D.addEntity(d, 'solid', { kind: 'datum', name: `${t(`part.datum.${type}`)} ${(d.entities.filter((e) => e.kind === 'datum').length) + 1}`, params: { type: DATUM_TYPES.indexOf(type), size: app.datumSize() }, ...(mode ? { attach: { mode, refs, offset: [0, 0, 0] } } : {}) }).id);
    app.clearElements();
    app.select([id]);
    if (!state.view3d) app.toggle3d(true);
  }

  /** The attachment mode that fits the picked elements best. */
  function autoMode(refs) {
    const kinds = refs.map((r) => r.kind).join(',');
    if (kinds === 'face') return 'flat';
    if (kinds === 'edge') return 'normal';
    if (kinds === 'vertex') return 'point';
    if (kinds === 'vertex,vertex') return 'twoPoints';
    if (kinds === 'vertex,vertex,vertex') return 'threePoints';
    return refs[0].kind === 'face' ? 'flat' : refs[0].kind === 'edge' ? 'normal' : 'point';
  }

  async function attachmentDialog() {
    const e = solids()[0];
    const refs = elements().length ? elements().map((el) => ({ id: el.id, kind: el.kind, signature: el.signature })) : e.attach?.refs ?? [];
    const modes = Object.entries(ATTACH_MODES).filter(([, m]) => m.needs.length === refs.length && m.needs.every((need, i) => need === refs[i]?.kind));
    const answer = await app.form({ title: `${t('part.attachment')} — ${label(e)}`, icon: 'attachment', width: 560, intro: refs.length ? t('part.attachIntro', { refs: refs.map((r) => `${label(app.D.findEntity(app.activeDrawing(), r.id) ?? { name: r.id })} › ${r.kind}`).join(', ') }) : t('part.attachNoRefs'), fields: [
      { key: 'mode', type: 'select', label: t('part.attachMode'), icon: 'attachment', value: e.attach?.mode ?? modes[0]?.[0] ?? 'flat', options: (modes.length ? modes : Object.entries(ATTACH_MODES)).map(([id]) => [id, t(`part.mode.${id}`)]) },
      { key: 'ox', type: 'number', label: t('part.attachOffset', { axis: 'X' }), icon: 'move', value: e.attach?.offset?.[0] ?? 0, step: 1, unit: 'mm' },
      { key: 'oy', type: 'number', label: t('part.attachOffset', { axis: 'Y' }), icon: 'move', value: e.attach?.offset?.[1] ?? 0, step: 1, unit: 'mm' },
      { key: 'oz', type: 'number', label: t('part.attachOffset', { axis: 'Z' }), icon: 'move', value: e.attach?.offset?.[2] ?? 0, step: 1, unit: 'mm' },
    ], actions: [{ id: 'detach', label: t('part.detach'), icon: 'unlinkObject' }, { id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (!answer || answer.action === 'cancel') return;
    if (answer.action === 'detach') { app.change('part.op.attach', (d) => app.D.updateEntity(d, e.id, { attach: null })); return; }
    if (!refs.length) { app.notify('info', t('part.attachNoRefs')); return; }
    const attach = { mode: answer.values.mode, refs, offset: [answer.values.ox, answer.values.oy, answer.values.oz] };
    void attachedPlacement;
    app.change('part.op.attach', (d) => app.D.updateEntity(d, e.id, { attach }));
    app.clearElements();
  }

  return commands;
}

/** A fan of triangles over a closed loop of points (a planar face from edges). */
function fanTriangles(loop) {
  if (loop.length < 3) return [];
  const c = [0, 1, 2].map((i) => loop.reduce((s, p) => s + p[i], 0) / loop.length);
  return loop.map((p, i) => [c, p, loop[(i + 1) % loop.length]]);
}

export const PART_FREECAD = {
  Part_FaceSelection: 'selectFilter:face', Part_EdgeSelection: 'selectFilter:edge', Part_VertexSelection: 'selectFilter:vertex', Part_RemoveSelectionGate: 'selectFilter:off',
  Part_SelectFilter: 'selectFilter', Part_BoxSelection: 'boxSelect3d', Part_Compound: 'part:compound', Part_BooleanFragments: 'part:fragments', Part_Slice: 'part:slice',
  Part_SliceApart: 'part:sliceApart', Part_XOR: 'part:xor', Part_JoinConnect: 'part:joinConnect', Part_JoinEmbed: 'part:joinEmbed', Part_JoinCutout: 'part:joinCutout',
  Part_CompoundFilter: 'part:compoundFilter', Part_Mirror: 'part:mirror', Part_Scale: 'part:scale', Part_RefineShape: 'part:refine', Part_ReverseShape: 'part:reverse',
  Part_SimpleCopy: 'part:simpleCopy', Part_TransformedCopy: 'part:transformedCopy', Part_ShapeFromMesh: 'part:shapeFromMesh', Part_MakeSolid: 'part:makeSolid',
  Part_PointsFromMesh: 'part:pointsFromShape', Part_MakeFace: 'part:makeFace', Part_Builder: 'part:builder', Part_ElementCopy: 'part:elementCopy',
  Part_ColorPerFace: 'part:colorPerFace', Part_ProjectionOnSurface: 'part:projectOnSurface', Part_ImportCurveNet: 'part:importCurveNet', Part_PickCurveNet: 'part:pickCurveNet',
  Part_SectionCut: 'part:sectionCut', Part_CrossSections: 'part:crossSections', Part_ShapeInfo: 'part:shapeInfo', Part_ToleranceSet: 'part:tolerance', Part_Defeaturing: 'part:defeaturing',
  Part_DatumPlane: 'datum:plane', Part_DatumLine: 'datum:line', Part_DatumPoint: 'datum:point', Part_CoordinateSystem: 'datum:csys', Part_EditAttachment: 'attachment',
  PartDesign_Plane: 'datum:plane', PartDesign_Line: 'datum:line', PartDesign_Point: 'datum:point', PartDesign_CoordinateSystem: 'datum:csys',
};
