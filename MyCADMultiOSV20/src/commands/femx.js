// FreeCAD's FEM commands MyCAD did not have yet, on one analysis kept in the
// drawing (drawing.femAnalysis, see domain/femx.js): the constraints and
// loads of every physics, the equations, the materials, meshing (Netgen /
// Gmsh element sizes, regions, boundary layers, groups, node and element
// sets, erasing elements), the solvers (internal; CalculiX, Elmer, Mystran,
// Z88 input), and post-processing — results as coloured meshes, warp, clips,
// cuts, contours, glyphs, data along a line and at a point, stress
// linearization, a calculator, histograms, line plots and tables — clipping
// planes, 1D pipe flow and beam rotation, and examples.
import './femx-icons.js';
import { addEntity } from '../domain/drawing.js';
import { solidMesh } from '../domain/solids.js';
import { normalizeFem } from '../domain/fem.js';
import { colorScale } from '../domain/meshops.js';
import { writeZip } from '../domain/zip.js';
import {
  EPS0, buildMesh, calculatorField, dataAlongLine, femId, functionValue, histogram, isoSurface, linearizedStresses, nodalValues, normalizeAnalysis,
  pipeNetwork, quadsOf, solveAnalysis, surfaceOf, toCalculixDeck, toElmer, toMystran, toZ88, valueAt,
} from '../domain/femx.js';

/** Each constraint: its icon and fields ([key, default, unit] numbers, ['?key'] optional text numbers, { select } / { check }). */
const CONSTRAINTS = {
  displacement: { icon: 'femxDisplacement', fields: ['?ux', '?uy', '?uz'] },
  pressure: { icon: 'femxPressure', fields: [['pressure', 1, 'MPa']] },
  centrif: { icon: 'femxCentrif', fields: [['rpm', 3000, 'rpm'], ['px', 0, 'mm'], ['py', 0, 'mm'], ['pz', 0, 'mm'], ['ax', 0, ''], ['ay', 0, ''], ['az', 1, '']], body: true },
  spring: { icon: 'femxSpring', fields: [['normal', 1000, 'N/mm'], ['tangential', 0, 'N/mm']] },
  rigidBody: { icon: 'femxRigid', fields: ['?ux', '?uy', '?uz'] },
  planeRotation: { icon: 'femxPlaneRotation', fields: [] },
  bearing: { icon: 'femxBearing', fields: [{ check: 'axialFixed' }] },
  gear: { icon: 'femxGear', fields: [['force', 100, 'N'], ['angle', 20, '°'], ['dx', 1, ''], ['dy', 0, ''], ['dz', 0, ''], ['rx', 0, ''], ['ry', 1, ''], ['rz', 0, '']] },
  pulley: { icon: 'femxPulley', fields: [['force1', 100, 'N'], ['force2', 50, 'N'], ['dx', 1, ''], ['dy', 0, ''], ['dz', 0, '']] },
  contact: { icon: 'femxContact', fields: [['stiffness', 1e6, 'N/mm'], ['tolerance', 1, 'mm']], pair: true },
  tie: { icon: 'femxTie', fields: [['tolerance', 1, 'mm']], pair: true },
  transform: { icon: 'femxTransform', fields: [['rx', 0, '°'], ['ry', 0, '°'], ['rz', 0, '°']] },
  sectionPrint: { icon: 'femxSectionPrint', fields: [['offset', 5, 'mm']] },
  temperature: { icon: 'femxTemperature', fields: [['value', 300, 'K']] },
  heatflux: { icon: 'femxHeatflux', fields: [{ select: ['mode', ['flux', 'convection']] }, ['flux', 1000, 'W/m²'], ['film', 10, 'W/m²K'], ['ambient', 293.15, 'K']] },
  bodyHeatSource: { icon: 'femxHeatSource', fields: [['value', 1e6, 'W/m³']], body: true },
  initialTemperature: { icon: 'femxInitialTemperature', fields: [['value', 293.15, 'K']], body: true },
  electrostaticPotential: { icon: 'femxPotential', fields: [['value', 0, 'V']] },
  electricChargeDensity: { icon: 'femxCharge', fields: [['value', 1e-6, 'C/m³']], body: true },
  currentDensity: { icon: 'femxCurrent', fields: [['flux', 1e4, 'A/m²'], ['jx', 0, 'A/mm²'], ['jy', 0, 'A/mm²'], ['jz', 1, 'A/mm²']] },
  magnetization: { icon: 'femxMagnetization', fields: [['mx', 0, 'A/m'], ['my', 0, 'A/m'], ['mz', 1e5, 'A/m']] },
  flowVelocity: { icon: 'femxFlowVelocity', fields: [['velocity', 100, 'mm/s']] },
  initialFlowVelocity: { icon: 'femxInitialFlow', fields: [['velocity', 0, 'mm/s']], body: true },
  initialPressure: { icon: 'femxInitialPressure', fields: [['value', 0.1, 'MPa']] },
  fluidBoundary: { icon: 'femxFluidBoundary', fields: [['potential', 0, '']] },
};
const EQUATION_ICONS = { deformation: 'femxNonlinear', electricforce: 'femxCharge', electrostatic: 'femxPotential', flow: 'femxFlowVelocity', flux: 'femxHeatflux', heat: 'femxTemperature', magnetodynamic: 'femxMagnetization', magnetodynamic2D: 'femxMagnetization', staticCurrent: 'femxCurrent' };
const FIELD_OF = { elasticity: 'vm', deformation: 'vm', heat: 'temperature', electrostatic: 'potential', electricforce: 'potential', staticCurrent: 'currentDensity', flow: 'velocity', flux: 'flux', magnetodynamic: 'magneticFlux', magnetodynamic2D: 'magneticFlux' };

export function femxCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const analysis = () => drawing()?.femAnalysis ?? null;
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields, width = 520, intro = null) => { const a = await app.form({ title: t(titleKey), icon, width, fields, ...(intro ? { intro } : {}), actions: ok() }); return a?.action === 'ok' ? a.values : null; };
  const setAnalysis = (label, f) => app.change(label, (d) => { d.femAnalysis = normalizeAnalysis(f(structuredClone(d.femAnalysis))); });
  let last = null;

  /** The analysis of the selected solid (made when there is none, or when another solid is selected). */
  function ensure() {
    const solid = app.selectedSolids()[0];
    const now = analysis();
    if (now && (!solid || solid.id === now.solid) && drawing().entities.some((e) => e.id === now.solid)) return now;
    if (!solid) { app.notify('info', t('femx.pickSolid')); return null; }
    app.change('femx.op.analysis', (d) => { d.femAnalysis = normalizeAnalysis({ solid: solid.id, equations: ['elasticity'] }); });
    last = null;
    return analysis();
  }
  const solidOf = (a) => drawing().entities.find((e) => e.id === a.solid);

  /** The faces picked in 3D (face filter), as selections; none → a side of the box from the dialog. */
  const pickedFaces = () => (state.elements ?? []).filter((el) => el.kind === 'face').map((el) => ({ signature: { center: el.signature.center, normal: el.signature.normal, area: el.signature.area ?? 0 }, tris: app.elementTriangles(el) }));
  const BOX = ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'];

  async function addConstraint(type) {
    const a = ensure();
    if (!a) return null;
    const spec = CONSTRAINTS[type] ?? { icon: 'fem3d', fields: [] };
    const faces = pickedFaces();
    const fields = [];
    if (!spec.body && !faces.length) fields.push({ key: 'box', type: 'select', label: t('femx.face'), icon: spec.icon, value: type === 'temperature' || type === 'electrostaticPotential' ? 'xmin' : 'xmax', options: BOX.map((b) => [b, t(`fem3d.face.${b}`)]) });
    if (spec.pair && faces.length < 2) fields.push({ key: 'box2', type: 'select', label: t('femx.face2'), icon: spec.icon, value: 'xmin', options: BOX.map((b) => [b, t(`fem3d.face.${b}`)]) });
    for (const f of spec.fields) {
      if (typeof f === 'string') fields.push({ key: f.slice(1), type: 'text', label: t(`femx.p.${f.slice(1)}`), icon: spec.icon, value: '' });
      else if (f.check) fields.push({ key: f.check, type: 'check', label: t(`femx.p.${f.check}`), icon: spec.icon, value: false });
      else if (f.select) fields.push({ key: f.select[0], type: 'select', label: t(`femx.p.${f.select[0]}`), icon: spec.icon, value: f.select[1][0], options: f.select[1].map((o) => [o, t(`femx.p.${f.select[0]}.${o}`)]) });
      else fields.push({ key: f[0], type: 'number', label: t(`femx.p.${f[0]}`), icon: spec.icon, value: f[1], step: Math.abs(f[1]) >= 100 ? 10 : 0.1, ...(f[2] ? { unit: f[2] } : {}) });
    }
    const v = fields.length ? await ask(`femx.c.${type}`, spec.icon, fields, 520, faces.length ? t('femx.onPicked', { count: faces.length }) : null) : {};
    if (!v) return null;
    const { box, box2, ...params } = v;
    const [first, ...rest] = faces;
    const constraint = {
      id: femId('k'), type,
      faces: spec.body ? [] : first ? (spec.pair ? [first] : faces) : [{ box }],
      faces2: spec.pair ? (rest.length ? rest : [{ box: box2 }]) : [],
      params,
    };
    setAnalysis('femx.op.constraint', (x) => { x.constraints.push(constraint); return x; });
    app.clearElements();
    app.notify('success', t('femx.added', { name: t(`femx.c.${type}`) }));
    return constraint;
  }

  function toggleEquation(eq) {
    const a = ensure();
    if (!a) return;
    setAnalysis('femx.op.equation', (x) => { x.equations = x.equations.includes(eq) ? x.equations.filter((e) => e !== eq) : [...x.equations, eq]; return x; });
    app.notify('info', t(analysis().equations.includes(eq) ? 'femx.equationOn' : 'femx.equationOff', { name: t(`femx.eq.${eq}`) }));
  }

  async function material(kind) {
    const a = ensure();
    if (!a) return;
    const m = a.material;
    const keys = { solid: ['name', 'E', 'nu', 'density', 'alpha', 'k', 'cp', 'eps', 'sigma', 'mu'], nonlinear: ['name', 'E', 'nu', 'density', 'yield', 'hardening'], reinforced: ['name', 'E', 'nu', 'density', 'steelRatio', 'steelE'], fluid: ['name', 'density', 'viscosity', 'k', 'cp'] }[kind];
    const v = await ask(kind === 'solid' ? 'femx.materialEditor' : `femx.material.${kind}`, { solid: 'femxMaterial', nonlinear: 'femxNonlinear', reinforced: 'femxReinforced', fluid: 'femxFluid' }[kind], keys.map((k) => (k === 'name' ? { key: k, type: 'text', label: t('femx.m.name'), icon: 'femxMaterial', value: m.name } : { key: k, type: 'number', label: t(`femx.m.${k}`), icon: 'femxMaterial', value: m[k], step: 'any' })), 520);
    if (!v) return;
    setAnalysis('femx.op.material', (x) => { x.material = { ...x.material, ...v, kind: kind === 'solid' ? (x.material.kind === 'fluid' ? 'solid' : x.material.kind) : kind }; return x; });
  }

  // ── meshing

  function meshNow() {
    const a = analysis();
    return a ? buildMesh(solidMesh(solidOf(a)), a) : null;
  }

  async function mesher(name) {
    const a = ensure();
    if (!a) return;
    const solid = solidOf(a);
    const box = solidMesh(solid).flat();
    const size = Math.max(...[0, 1, 2].map((k) => Math.max(...box.map((p) => p[k])) - Math.min(...box.map((p) => p[k]))));
    const v = await ask(`femx.mesher.${name}`, 'femxMesh', [{ key: 'size', type: 'number', label: t('femx.elementSize'), icon: 'femxMesh', value: Math.round((size / a.resolution) * 100) / 100, min: size / 64, step: 0.5, unit: 'mm' }], 440);
    if (!v) return;
    setAnalysis('femx.op.mesh', (x) => ({ ...x, mesher: name, resolution: Math.round(Math.min(64, Math.max(4, size / v.size))), meshed: true }));
    const mesh = meshNow();
    app.notify('success', t('femx.meshed', { nodes: mesh.nodes.length, elements: mesh.elements.length }));
  }

  async function facesForm(titleKey, icon, extra) {
    const a = ensure();
    if (!a) return null;
    const faces = pickedFaces();
    const v = await ask(titleKey, icon, [...(faces.length ? [] : [{ key: 'box', type: 'select', label: t('femx.face'), icon, value: 'xmax', options: BOX.map((b) => [b, t(`fem3d.face.${b}`)]) }]), ...extra], 480, faces.length ? t('femx.onPicked', { count: faces.length }) : null);
    if (!v) return null;
    app.clearElements();
    return { faces: faces.length ? faces : [{ box: v.box }], values: v };
  }

  // ── sets by polygon

  async function polygonPick() {
    if (!state.view3d) await app.toggle3d(true);
    const v = app.view3d.instance;
    app.notify('info', t('mesh.drawPolygon'));
    return new Promise((resolve) => v.startPolygonSelect((poly) => resolve(poly ? { poly, v } : null)));
  }
  const inside = ([x, y], poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

  async function setByPolygon(kind, erase = false) {
    if (!ensure()) return null;
    const mesh = meshNow();
    const got = await polygonPick();
    if (!got) return null;
    const centre = (el) => el.reduce((s, i) => s.map((x, k) => x + mesh.nodes[i][k] / 8), [0, 0, 0]);
    const ids = kind === 'nodes'
      ? mesh.nodes.map((p, i) => (inside(got.v.projectToScreen([p])[0], got.poly) ? i : -1)).filter((i) => i >= 0)
      : mesh.elements.map((el, e) => (inside(got.v.projectToScreen([centre(el)])[0], got.poly) ? e : -1)).filter((e) => e >= 0);
    if (erase) {
      const cells = ids.map((e) => mesh.cellOf[e].join(','));
      setAnalysis('femx.op.erase', (x) => { x.erased = [...new Set([...x.erased, ...cells])]; return x; });
      app.notify('success', t('femx.erased', { count: cells.length }));
      return cells.length;
    }
    const key = kind === 'nodes' ? 'nodeSets' : 'elementSets';
    setAnalysis('femx.op.set', (x) => { x[key].push({ name: `${t(kind === 'nodes' ? 'femx.nodeSet' : 'femx.elementSet')} ${x[key].length + 1}`, [kind]: ids }); return x; });
    app.notify('success', t('femx.setMade', { count: ids.length }));
    return ids.length;
  }

  // ── solving and results

  function solve() {
    const a = ensure();
    if (!a) return null;
    const result = solveAnalysis(solidMesh(solidOf(a)), a);
    if (!result.ok) { app.notify('error', t(`fem3d.error.${result.error}`)); return result; }
    last = result;
    return result;
  }
  const result = () => last ?? solve();
  const fieldNames = (r) => Object.keys(r.fields);
  const mainField = (r) => FIELD_OF[r.analysis.equations.find((eq) => r.fields[FIELD_OF[eq]])] ?? fieldNames(r)[0];

  /** A results group in the drawing (outputs of the pipeline go there). */
  function resultGroup(d) {
    let g = (d.groups ?? []).find((x) => x.femResults);
    if (!g) { g = { id: femId('g'), name: t('femx.resultsGroup'), parent: null, femResults: true }; d.groups = [...(d.groups ?? []), g]; }
    return g.id;
  }

  /** Coloured mesh entity of triangles and per-triangle values. */
  function colouredMesh(name, { tris, values }, range = null) {
    if (!tris.length) { app.notify('info', t('femx.nothingToShow')); return null; }
    const lo = range?.[0] ?? Math.min(...values); const hi = range?.[1] ?? Math.max(...values);
    const made = app.change('femx.op.result', (d) => addEntity(d, 'solid', { kind: 'mesh', name, params: {}, shape: { tris: tris.flat(2), colors: values.flatMap((v) => colorScale(v, lo, hi)) }, group: resultGroup(d) }));
    app.notify('success', t('femx.range', { name, lo: app.fmt(lo, 4), hi: app.fmt(hi, 4) }));
    return made;
  }
  const elementValue = (r, name) => { const f = r.fields[name]; if (!f) return () => 0; if (f.at === 'element') return (e) => f.values[e]; const nv = f.values; return (e) => r.mesh.elements[e].reduce((s, i) => s + nv[i], 0) / 8; };

  async function chooseField(titleKey, icon, extra = [], { vectors = false } = {}) {
    const r = result();
    if (!r?.ok) return null;
    const names = fieldNames(r).filter((n) => !vectors || r.fields[n].vectors);
    if (!names.length) { app.notify('info', t('femx.noVectors')); return null; }
    const v = await ask(titleKey, icon, [{ key: 'field', type: 'select', label: t('femx.field'), icon: 'femxPipeline', value: names.includes(mainField(r)) ? mainField(r) : names[0], options: names.map((n) => [n, `${t(`femx.f.${n}`)} (${r.fields[n].unit})`]) }, ...extra]);
    return v ? { r, v } : null;
  }
  const record = (type, field, params) => setAnalysis('femx.op.pipeline', (x) => { x.pipeline.push({ id: femId('p'), type, field, params }); return x; });

  async function showResult() {
    const got = await chooseField('femx.pipeline', 'femxPipeline');
    if (!got) return null;
    return colouredMesh(`${t('femx.f.' + got.v.field)}`, surfaceOf(got.r, () => true, elementValue(got.r, got.v.field)));
  }

  async function warp() {
    const got = await chooseField('femx.filter.warp', 'femxWarp', [{ key: 'factor', type: 'number', label: t('femx.warpFactor'), icon: 'femxWarp', value: 100, step: 10 }]);
    if (!got) return null;
    record('warp', got.v.field, { factor: got.v.factor });
    return colouredMesh(`${t('femx.filter.warp')} ×${got.v.factor}`, surfaceOf(got.r, () => true, elementValue(got.r, got.v.field), { warp: got.v.factor }));
  }

  async function clipScalar() {
    const r = result();
    if (!r?.ok) return null;
    const got = await chooseField('femx.filter.clipScalar', 'femxClipScalar', [{ key: 'value', type: 'number', label: t('femx.threshold'), icon: 'femxClipScalar', value: 0, step: 'any' }, { key: 'invert', type: 'check', label: t('femx.keepAbove'), icon: 'femxClipScalar', value: true }]);
    if (!got) return null;
    const val = elementValue(got.r, got.v.field);
    record('clipScalar', got.v.field, { value: got.v.value, invert: got.v.invert });
    return colouredMesh(t('femx.filter.clipScalar'), surfaceOf(got.r, (e) => (got.v.invert ? val(e) >= got.v.value : val(e) <= got.v.value), val));
  }

  async function functionPick(extra = []) {
    const fns = analysis()?.functions ?? [];
    if (!fns.length) { app.notify('info', t('femx.noFunctions')); return null; }
    return chooseField('femx.function', 'femxFunctions', [{ key: 'fn', type: 'select', label: t('femx.function'), icon: 'femxFunctions', value: fns[0].id, options: fns.map((f) => [f.id, `${t(`femx.fn.${f.type}`)} ${f.id.slice(-4)}`]) }, ...extra]);
  }

  async function clipRegion() {
    const got = await functionPick([{ key: 'invert', type: 'check', label: t('femx.keepOutside'), icon: 'femxClipRegion', value: false }]);
    if (!got) return null;
    const fn = analysis().functions.find((f) => f.id === got.v.fn);
    const centre = (e) => got.r.mesh.elements[e].reduce((s, i) => s.map((x, k) => x + got.r.mesh.nodes[i][k] / 8), [0, 0, 0]);
    record('clipRegion', got.v.field, { fn: fn.id, invert: got.v.invert });
    return colouredMesh(t('femx.filter.clipRegion'), surfaceOf(got.r, (e) => (functionValue(fn, centre(e)) < 0) !== got.v.invert, elementValue(got.r, got.v.field)));
  }

  async function cut() {
    const got = await functionPick();
    if (!got) return null;
    const fn = analysis().functions.find((f) => f.id === got.v.fn);
    const nodal = got.r.mesh.nodes.map((p) => functionValue(fn, p));
    record('cutFunction', got.v.field, { fn: fn.id });
    return colouredMesh(t('femx.filter.cutFunction'), isoSurface(got.r, nodal, 0, elementValue(got.r, got.v.field)));
  }

  async function contours() {
    const got = await chooseField('femx.filter.contours', 'femxContours', [{ key: 'count', type: 'number', label: t('femx.levels'), icon: 'femxContours', value: 5, min: 1, max: 30, step: 1 }]);
    if (!got) return null;
    const nodal = nodalValues(got.r, got.v.field);
    const lo = Math.min(...nodal); const hi = Math.max(...nodal);
    const all = { tris: [], values: [] };
    for (let k = 1; k <= got.v.count; k++) {
      const level = lo + ((hi - lo) * k) / (got.v.count + 1);
      const iso = isoSurface(got.r, nodal, level, () => level);
      all.tris.push(...iso.tris); all.values.push(...iso.values);
    }
    record('contours', got.v.field, { count: got.v.count });
    return colouredMesh(t('femx.filter.contours'), all, [lo, hi]);
  }

  async function glyph() {
    const got = await chooseField('femx.filter.glyph', 'femxGlyph', [{ key: 'scale', type: 'number', label: t('femx.glyphScale'), icon: 'femxGlyph', value: 5, step: 1, unit: 'mm' }], { vectors: true });
    if (!got) return null;
    const f = got.r.fields[got.v.field];
    const positions = f.at === 'node' ? got.r.mesh.nodes : got.r.mesh.elements.map((el) => el.reduce((s, i) => s.map((x, k) => x + got.r.mesh.nodes[i][k] / 8), [0, 0, 0]));
    const maxLen = Math.max(...f.vectors.map((v) => Math.hypot(...v))) || 1;
    const step = Math.max(1, Math.floor(positions.length / 400));
    const paths = [];
    for (let i = 0; i < positions.length; i += step) {
      const v = f.vectors[i]; const l = Math.hypot(...v);
      if (l < maxLen * 1e-3) continue;
      const tip = positions[i].map((x, k) => x + (v[k] / maxLen) * got.v.scale);
      paths.push([positions[i], tip]);
    }
    record('glyph', got.v.field, { scale: got.v.scale });
    const made = app.change('femx.op.result', (d) => addEntity(d, 'solid', { kind: 'wire3d', name: `${t('femx.filter.glyph')} (${t('femx.f.' + got.v.field)})`, params: {}, shape: { paths }, group: resultGroup(d) }));
    app.select([made.id]);
    return made;
  }

  const pointFields = (prefix, value) => ['x', 'y', 'z'].map((k, i) => ({ key: `${prefix}${k}`, type: 'number', label: t(`femx.${prefix}${k}`), icon: 'coordinate', value: value[i], step: 1, unit: 'mm' }));
  const boxOfMesh = (r) => [0, 1, 2].map((k) => [Math.min(...r.mesh.nodes.map((p) => p[k])), Math.max(...r.mesh.nodes.map((p) => p[k]))]);

  /** A 2D chart in the drawing: polyline (or bars) over axes, with a title — FEM_PostVisualization*. */
  function chart(title, points, { bars = false } = {}) {
    const d = drawing();
    const box = d.entities.length ? d.entities.map((e) => app.boxOf(e)).filter(Boolean).reduce((a, b) => ({ maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY) }), { maxX: 0, minY: 0 }) : { maxX: 0, minY: 0 };
    const x0 = box.maxX + 40; const y0 = box.minY;
    const W = 160; const H = 90;
    const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
    const [xa, xb] = [Math.min(...xs), Math.max(...xs) || 1]; const [ya, yb] = [Math.min(0, ...ys), Math.max(...ys) || 1];
    const X = (x) => x0 + ((x - xa) / ((xb - xa) || 1)) * W; const Y = (y) => y0 + ((y - ya) / ((yb - ya) || 1)) * H;
    const group = { id: femId('g'), name: title, parent: null };
    const made = app.change('femx.op.chart', (dd) => {
      dd.groups = [...(dd.groups ?? []), group];
      const out = [addEntity(dd, 'polyline', { points: [{ x: x0, y: y0 + H }, { x: x0, y: y0 }, { x: x0 + W, y: y0 }], closed: false, group: group.id })];
      if (bars) { const w = W / points.length; points.forEach((p, i) => out.push(addEntity(dd, 'rect', { x: x0 + i * w + w * 0.1, y: y0, width: w * 0.8, height: Math.max(1e-3, Y(p.y) - y0), group: group.id }))); }
      else out.push(addEntity(dd, 'polyline', { points: points.map((p) => ({ x: X(p.x), y: Y(p.y) })), closed: false, group: group.id }));
      out.push(addEntity(dd, 'text', { x: x0, y: y0 + H + 6, text: title, size: 5, group: group.id }));
      out.push(addEntity(dd, 'text', { x: x0 - 2, y: y0 - 7, text: app.fmt(xa, 3), size: 3.5, group: group.id }), addEntity(dd, 'text', { x: x0 + W - 10, y: y0 - 7, text: app.fmt(xb, 3), size: 3.5, group: group.id }));
      out.push(addEntity(dd, 'text', { x: x0 - 16, y: y0 + H - 2, text: app.fmt(yb, 3), size: 3.5, group: group.id }));
      return out;
    });
    if (state.view3d) app.toggle3d(false);
    app.select(made.map((e) => e.id));
    app.zoomToSelection();
    return made;
  }
  const textDoc = (name, text) => app.change('femx.op.table', (d) => { d.textDocs = [...(d.textDocs ?? []), { id: femId('t'), name, text }]; });

  async function alongLine(plot = true) {
    const r = result();
    if (!r?.ok) return null;
    const b = boxOfMesh(r);
    const got = await chooseField('femx.filter.dataAlongLine', 'femxLine', [...pointFields('a', [b[0][0], (b[1][0] + b[1][1]) / 2, (b[2][0] + b[2][1]) / 2]), ...pointFields('b', [b[0][1], (b[1][0] + b[1][1]) / 2, (b[2][0] + b[2][1]) / 2]), { key: 'count', type: 'number', label: t('femx.samples'), icon: 'femxLine', value: 40, min: 2, max: 500, step: 1 }]);
    if (!got) return null;
    const samples = dataAlongLine(got.r, got.v.field, [got.v.ax, got.v.ay, got.v.az], [got.v.bx, got.v.by, got.v.bz], Math.round(got.v.count));
    record('dataAlongLine', got.v.field, { from: [got.v.ax, got.v.ay, got.v.az], to: [got.v.bx, got.v.by, got.v.bz] });
    textDoc(`${t('femx.filter.dataAlongLine')} — ${t('femx.f.' + got.v.field)}`, samples.map((s) => `${app.fmt(s.distance, 4)}\t${app.fmt(s.value, 6)}`).join('\n'));
    if (plot) chart(`${t('femx.f.' + got.v.field)} (${got.r.fields[got.v.field].unit})`, samples.map((s) => ({ x: s.distance, y: s.value })));
    return samples;
  }

  async function atPoint() {
    const r = result();
    if (!r?.ok) return null;
    const b = boxOfMesh(r);
    const got = await chooseField('femx.filter.dataAtPoint', 'femxPoint', pointFields('a', b.map(([lo, hi]) => (lo + hi) / 2)));
    if (!got) return null;
    const value = valueAt(got.r, got.v.field, [got.v.ax, got.v.ay, got.v.az]);
    record('dataAtPoint', got.v.field, { at: [got.v.ax, got.v.ay, got.v.az] });
    await app.form({ title: t('femx.filter.dataAtPoint'), icon: 'femxPoint', width: 420, fields: [{ key: 'value', type: 'info', label: t('femx.f.' + got.v.field), icon: 'femxPoint', value: value === null ? t('femx.outside') : `${app.fmt(value, 6)} ${got.r.fields[got.v.field].unit}` }], actions: [{ id: 'ok', label: t('sk.close'), primary: true }] });
    return value;
  }

  async function linearized() {
    const r = result();
    if (!r?.ok || !r.report.stresses) { app.notify('info', t('femx.needStresses')); return null; }
    const b = boxOfMesh(r);
    const v = await ask('femx.filter.linearizedStresses', 'femxLinearized', [...pointFields('a', [(b[0][0] + b[0][1]) / 2, (b[1][0] + b[1][1]) / 2, b[2][0]]), ...pointFields('b', [(b[0][0] + b[0][1]) / 2, (b[1][0] + b[1][1]) / 2, b[2][1]])]);
    if (!v) return null;
    const out = linearizedStresses(r, [v.ax, v.ay, v.az], [v.bx, v.by, v.bz]);
    if (!out) { app.notify('info', t('femx.outside')); return null; }
    textDoc(t('femx.filter.linearizedStresses'), [`${t('femx.membrane')}\t${app.fmt(out.membrane, 4)} MPa`, `${t('femx.bending')}\t${app.fmt(out.bending, 4)} MPa`, `${t('femx.total')}\t${app.fmt(out.total, 4)} MPa`].join('\n'));
    app.notify('success', t('femx.linearizedDone', { m: app.fmt(out.membrane, 3), b: app.fmt(out.bending, 3) }));
    return out;
  }

  async function calculator() {
    const r = result();
    if (!r?.ok) return null;
    const names = fieldNames(r);
    const v = await ask('femx.filter.calculator', 'femxCalculator', [{ key: 'expr', type: 'text', label: t('femx.expression'), icon: 'femxCalculator', value: `${names[0]}*2` }, { key: 'info', type: 'info', label: t('femx.fieldsAre'), icon: 'info', value: names.join(', ') }]);
    if (!v) return null;
    const values = calculatorField(r, v.expr, names);
    r.fields.calculated = { at: 'node', values, unit: '' };
    record('calculator', 'calculated', { expr: v.expr });
    return colouredMesh(`${t('femx.filter.calculator')}: ${v.expr}`, surfaceOf(r, () => true, elementValue(r, 'calculated')));
  }

  async function newFunction() {
    if (!ensure()) return null;
    const r = result();
    const b = r?.ok ? boxOfMesh(r) : [[0, 10], [0, 10], [0, 10]];
    const c = b.map(([lo, hi]) => (lo + hi) / 2);
    const v = await ask('femx.functions', 'femxFunctions', [
      { key: 'type', type: 'select', label: t('femx.functionType'), icon: 'femxFunctions', value: 'plane', options: ['plane', 'sphere', 'box', 'cylinder'].map((k) => [k, t(`femx.fn.${k}`)]) },
      ...['x', 'y', 'z'].map((k, i) => ({ key: `c${k}`, type: 'number', label: t(`femx.a${k}`), icon: 'coordinate', value: c[i], step: 1, unit: 'mm' })),
      { key: 'nx', type: 'number', label: t('femx.dirX'), icon: 'axes', value: 1, step: 1 }, { key: 'ny', type: 'number', label: t('femx.dirY'), icon: 'axes', value: 0, step: 1 }, { key: 'nz', type: 'number', label: t('femx.dirZ'), icon: 'axes', value: 0, step: 1 },
      { key: 'r', type: 'number', label: t('femx.radiusSize'), icon: 'femxFunctions', value: Math.max(1, (b[0][1] - b[0][0]) / 4), min: 0.001, step: 1, unit: 'mm' },
    ]);
    if (!v) return null;
    const params = { px: v.cx, py: v.cy, pz: v.cz, nx: v.nx, ny: v.ny, nz: v.nz, cx: v.cx, cy: v.cy, cz: v.cz, r: v.r, sx: v.r * 2, sy: v.r * 2, sz: v.r * 2, ax: v.nx, ay: v.ny, az: v.nz };
    const fn = { id: femId('f'), type: v.type, params };
    setAnalysis('femx.op.function', (x) => { x.functions.push(fn); return x; });
    return fn;
  }

  async function applyPipeline() {
    last = null;
    const r = solve();
    if (!r?.ok) return null;
    // Old outputs go; each recorded filter is made again from the fresh result.
    app.change('femx.op.result', (d) => { const g = (d.groups ?? []).find((x) => x.femResults); if (g) d.entities = d.entities.filter((e) => e.group !== g.id); });
    const made = [];
    for (const f of analysis().pipeline) {
      const val = elementValue(r, f.field);
      if (f.type === 'warp') made.push(colouredMesh(`${t('femx.filter.warp')} ×${f.params.factor}`, surfaceOf(r, () => true, val, { warp: f.params.factor })));
      if (f.type === 'clipScalar') made.push(colouredMesh(t('femx.filter.clipScalar'), surfaceOf(r, (e) => (f.params.invert ? val(e) >= f.params.value : val(e) <= f.params.value), val)));
      if (f.type === 'contours') {
        const nodal = nodalValues(r, f.field); const lo = Math.min(...nodal); const hi = Math.max(...nodal); const all = { tris: [], values: [] };
        for (let k = 1; k <= f.params.count; k++) { const level = lo + ((hi - lo) * k) / (f.params.count + 1); const iso = isoSurface(r, nodal, level, () => level); all.tris.push(...iso.tris); all.values.push(...iso.values); }
        made.push(colouredMesh(t('femx.filter.contours'), all, [lo, hi]));
      }
    }
    app.notify('success', t('femx.applied', { count: analysis().pipeline.length }));
    return made.filter(Boolean);
  }

  async function histogramPlot() {
    const got = await chooseField('femx.histogram', 'femxHistogram', [{ key: 'bins', type: 'number', label: t('femx.bins'), icon: 'femxHistogram', value: 10, min: 2, max: 100, step: 1 }]);
    if (!got) return null;
    const bins = histogram(got.r.fields[got.v.field].values, Math.round(got.v.bins));
    return chart(`${t('femx.histogram')}: ${t('femx.f.' + got.v.field)}`, bins.map((b) => ({ x: (b.from + b.to) / 2, y: b.count })), { bars: true });
  }

  async function table() {
    const got = await chooseField('femx.table', 'femxTable');
    if (!got) return null;
    const f = got.r.fields[got.v.field];
    const rows = f.values.slice(0, 2000).map((v, i) => `${i + 1}\t${app.fmt(v, 6)}`);
    textDoc(`${t('femx.table')}: ${t('femx.f.' + got.v.field)}`, [`${f.at === 'node' ? t('femx.node') : t('femx.element')}\t${t('femx.f.' + got.v.field)} (${f.unit})`, ...rows].join('\n'));
    app.notify('success', t('femx.tableMade', { count: rows.length }));
    return rows.length;
  }

  // ── solvers

  async function writeDeck(solver) {
    const r = result();
    if (!r?.ok) return null;
    const name = (app.docName(app.activeDoc()) || 'fem').replace(/\.[^.]+$/, '');
    setAnalysis('femx.op.solver', (x) => ({ ...x, solver }));
    if (solver === 'calculix') return app.saveText(`${name}.inp`, toCalculixDeck(r, name), 'inp');
    if (solver === 'mystran') return app.saveText(`${name}.bdf`, toMystran(r, name), 'bdf');
    const files = solver === 'z88' ? toZ88(r) : toElmer(r, name);
    return app.saveBytes(`${name}-${solver}.zip`, writeZip(files), 'zip');
  }

  async function solverControl() {
    const a = ensure();
    if (!a) return null;
    const answer = await app.form({ title: t('femx.solverControl'), icon: 'femxSolverControl', width: 520, intro: t('femx.solverIntro', { equations: a.equations.map((eq) => t(`femx.eq.${eq}`)).join(', ') || '—' }), fields: [
      { key: 'solver', type: 'select', label: t('femx.solver'), icon: 'femxSolver', value: a.solver, options: ['internal', 'calculix', 'elmer', 'mystran', 'z88'].map((s) => [s, t(`femx.solver.${s}`)]) },
    ], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'write', label: t('femx.writeInput') }, { id: 'run', label: t('femx.run'), primary: true }] });
    if (!answer || answer.action === 'cancel') return null;
    if (answer.action === 'write') return answer.values.solver === 'internal' ? null : writeDeck(answer.values.solver);
    last = null;
    const r = solve();
    if (!r?.ok) return r;
    const field = mainField(r);
    colouredMesh(`${t('femx.f.' + field)}`, surfaceOf(r, () => true, elementValue(r, field)));
    return r;
  }

  // ── 1D elements

  async function fluid1D() {
    const lines = app.selectedEntities().filter((e) => e.type === 'line');
    if (!lines.length) { app.notify('info', t('femx.pickLines')); return null; }
    const v = await ask('femx.fluid1D', 'femxFluid1D', [
      { key: 'd', type: 'number', label: t('femx.pipeDiameter'), icon: 'femxFluid1D', value: 10, min: 0.01, step: 1, unit: 'mm' },
      { key: 'viscosity', type: 'number', label: t('femx.m.viscosity'), icon: 'femxFluid', value: 1e-3, min: 1e-9, step: 'any', unit: 'Pa·s' },
      { key: 'pin', type: 'number', label: t('femx.pressureIn'), icon: 'femxInitialPressure', value: 0.1, step: 0.01, unit: 'MPa' },
      { key: 'pout', type: 'number', label: t('femx.pressureOut'), icon: 'femxInitialPressure', value: 0, step: 0.01, unit: 'MPa' },
    ], 460);
    if (!v) return null;
    const pipes = lines.map((l) => ({ a: { x: l.x1, y: l.y1 }, b: { x: l.x2, y: l.y2 }, d: v.d }));
    const net = pipeNetwork(pipes, [[pipes[0].a, v.pin], [pipes.at(-1).b, v.pout]], v.viscosity);
    const maxQ = Math.max(...net.flows.map(Math.abs)) || 1;
    app.change('femx.op.fluid1D', (d) => {
      lines.forEach((l, i) => { const [r, g, b] = colorScale(Math.abs(net.flows[i]), 0, maxQ); app.D.updateEntity(d, l.id, { color: `#${[r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}` }); });
      d.textDocs = [...(d.textDocs ?? []), { id: femId('t'), name: t('femx.fluid1D'), text: lines.map((l, i) => `${i + 1}\t${app.fmt(net.flows[i] * 1e-6, 6)} L/s`).join('\n') }];
    });
    app.notify('success', t('femx.flowDone', { q: app.fmt(net.flows[0] * 1e-6, 5) }));
    return net;
  }

  async function rotation1D() {
    const now = normalizeFem(drawing().fem ?? {});
    const v = await ask('femx.rotation1D', 'femxRotation1D', [{ key: 'rotation', type: 'number', label: t('femx.beamRotation'), icon: 'femxRotation1D', value: now.rotation, step: 15, unit: '°' }], 420);
    if (v) app.change('femx.op.rotation', (d) => { d.fem = { ...normalizeFem(d.fem ?? {}), rotation: v.rotation }; });
  }

  // ── examples

  async function examples() {
    const v = await ask('femx.examples', 'femxExamples', [{ key: 'which', type: 'select', label: t('femx.example'), icon: 'femxExamples', value: 'cantilever', options: ['cantilever', 'thermal', 'capacitor'].map((k) => [k, t(`femx.ex.${k}`)]) }], 460);
    if (!v) return null;
    const dims = { cantilever: { length: 100, width: 10, height: 10 }, thermal: { length: 50, width: 20, height: 10 }, capacitor: { length: 40, width: 40, height: 4 } }[v.which];
    const solid = app.insertSolid('box', dims, { x: 0, y: 0, z: 0 });
    const setup = {
      cantilever: { equations: ['elasticity'], constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'force', faces: [{ box: 'xmax' }], params: { fz: -100 } }] },
      thermal: { equations: ['heat'], constraints: [{ type: 'temperature', faces: [{ box: 'xmin' }], params: { value: 373.15 } }, { type: 'heatflux', faces: [{ box: 'xmax' }], params: { mode: 'convection', film: 25, ambient: 293.15 } }] },
      capacitor: { equations: ['electrostatic', 'electricforce'], constraints: [{ type: 'electrostaticPotential', faces: [{ box: 'zmin' }], params: { value: 0 } }, { type: 'electrostaticPotential', faces: [{ box: 'zmax' }], params: { value: 1000 } }] },
    }[v.which];
    app.change('femx.op.analysis', (d) => { d.femAnalysis = normalizeAnalysis({ solid: solid.id, resolution: 20, ...setup, material: v.which === 'capacitor' ? { name: 'Glass', eps: 5 } : {} }); });
    app.select([solid.id]);
    last = null;
    const r = solve();
    if (r?.ok) { const field = mainField(r); colouredMesh(`${t(`femx.ex.${v.which}`)}: ${t('femx.f.' + field)}`, surfaceOf(r, () => true, elementValue(r, field))); }
    return r;
  }

  const hasAnalysis = () => Boolean(analysis()) || app.selectedSolids().length > 0;
  const withResult = () => Boolean(analysis());
  const cmds = {};
  for (const type of Object.keys(CONSTRAINTS)) cmds[`femx:c:${type}`] = { icon: CONSTRAINTS[type].icon, label: `femx.c.${type}`, enabled: hasAnalysis, run: () => addConstraint(type) };
  for (const eq of Object.keys(EQUATION_ICONS)) cmds[`femx:eq:${eq}`] = { icon: EQUATION_ICONS[eq], label: `femx.eq.${eq}`, enabled: hasAnalysis, checked: () => Boolean(analysis()?.equations.includes(eq)), run: () => toggleEquation(eq) };
  Object.assign(cmds, {
    'femx:eps0': { icon: 'femxEps0', label: 'femx.eps0', enabled: hasAnalysis, run: async () => { const a = ensure(); if (!a) return; const v = await ask('femx.eps0', 'femxEps0', [{ key: 'eps0', type: 'number', label: 'ε₀', icon: 'femxEps0', value: a.eps0, step: 'any', unit: 'F/m' }], 420); if (v) setAnalysis('femx.op.material', (x) => ({ ...x, eps0: v.eps0 || EPS0 })); } },
    'femx:materialEditor': { icon: 'femxMaterial', label: 'femx.materialEditor', enabled: hasAnalysis, run: () => material('solid') },
    'femx:materialFluid': { icon: 'femxFluid', label: 'femx.material.fluid', enabled: hasAnalysis, run: () => material('fluid') },
    'femx:materialNonlinear': { icon: 'femxNonlinear', label: 'femx.material.nonlinear', enabled: hasAnalysis, run: () => material('nonlinear') },
    'femx:materialReinforced': { icon: 'femxReinforced', label: 'femx.material.reinforced', enabled: hasAnalysis, run: () => material('reinforced') },
    'femx:meshNetgen': { icon: 'femxMesh', label: 'femx.mesher.netgen', enabled: hasAnalysis, run: () => mesher('netgen') },
    'femx:meshGmsh': { icon: 'femxMesh', label: 'femx.mesher.gmsh', enabled: hasAnalysis, run: () => mesher('gmsh') },
    'femx:meshRegion': { icon: 'femxMeshRegion', label: 'femx.meshRegion', enabled: hasAnalysis, run: async () => { const got = await facesForm('femx.meshRegion', 'femxMeshRegion', [{ key: 'size', type: 'number', label: t('femx.elementSize'), icon: 'femxMeshRegion', value: 2, min: 0.01, step: 0.5, unit: 'mm' }]); if (got) setAnalysis('femx.op.mesh', (x) => { x.regions.push({ faces: got.faces, size: got.values.size }); return x; }); } },
    'femx:meshLayer': { icon: 'femxLayer', label: 'femx.meshLayer', enabled: hasAnalysis, run: async () => { const got = await facesForm('femx.meshLayer', 'femxLayer', [{ key: 'count', type: 'number', label: t('femx.layers'), icon: 'femxLayer', value: 3, min: 1, max: 20, step: 1 }, { key: 'thickness', type: 'number', label: t('femx.layerThickness'), icon: 'femxLayer', value: 1, min: 0.001, step: 0.1, unit: 'mm' }]); if (got) setAnalysis('femx.op.mesh', (x) => { x.layers.push({ faces: got.faces, count: got.values.count, thickness: got.values.thickness }); return x; }); } },
    'femx:meshGroup': { icon: 'femxMeshGroup', label: 'femx.meshGroup', enabled: hasAnalysis, run: async () => { const got = await facesForm('femx.meshGroup', 'femxMeshGroup', [{ key: 'name', type: 'text', label: t('femx.groupName'), icon: 'femxMeshGroup', value: t('femx.groupN', { n: (analysis()?.groups.length ?? 0) + 1 }) }]); if (got) setAnalysis('femx.op.mesh', (x) => { x.groups.push({ name: got.values.name, faces: got.faces }); return x; }); } },
    'femx:meshClear': { icon: 'femxMeshClear', label: 'femx.meshClear', enabled: withResult, run: () => { setAnalysis('femx.op.mesh', (x) => ({ ...x, meshed: false, erased: [] })); last = null; } },
    'femx:meshInfo': { icon: 'femxMeshInfo', label: 'femx.meshInfo', enabled: hasAnalysis, run: async () => { if (!ensure()) return null; const mesh = meshNow(); await app.form({ title: t('femx.meshInfo'), icon: 'femxMeshInfo', width: 440, fields: [{ key: 'nodes', type: 'info', label: t('femx.nodes'), icon: 'femxMesh', value: String(mesh.nodes.length) }, { key: 'elements', type: 'info', label: t('femx.elements'), icon: 'femxMesh', value: String(mesh.elements.length) }, { key: 'faces', type: 'info', label: t('femx.faces'), icon: 'femxMesh', value: String(mesh.quads.length) }, { key: 'size', type: 'info', label: t('femx.elementSize'), icon: 'femxMesh', value: mesh.size.map((s) => app.fmt(s, 3)).join(' × ') }], actions: [{ id: 'ok', label: t('sk.close'), primary: true }] }); return mesh; } },
    'femx:mesh2mesh': { icon: 'femxMesh2Mesh', label: 'femx.mesh2mesh', enabled: hasAnalysis, run: () => { if (!ensure()) return null; const mesh = meshNow(); const tris = mesh.quads.flatMap((q) => { const P = q.nodes.map((i) => mesh.nodes[i]); return [[P[0], P[1], P[2]], [P[0], P[2], P[3]]]; }); const made = app.change('femx.op.mesh2mesh', (d) => addEntity(d, 'solid', { kind: 'mesh', name: t('femx.femMesh'), params: {}, shape: { tris: tris.flat(2) } })); app.select([made.id]); return made; } },
    'femx:nodesSet': { icon: 'femxNodesSet', label: 'femx.nodesSet', enabled: hasAnalysis, run: async () => { const got = await facesForm('femx.nodesSet', 'femxNodesSet', [{ key: 'name', type: 'text', label: t('femx.groupName'), icon: 'femxNodesSet', value: `${t('femx.nodeSet')} ${(analysis()?.nodeSets.length ?? 0) + 1}` }]); if (!got) return; const mesh = meshNow(); const ids = [...new Set(quadsOf(mesh, got.faces).flatMap((q) => q.nodes))]; setAnalysis('femx.op.set', (x) => { x.nodeSets.push({ name: got.values.name, nodes: ids }); return x; }); app.notify('success', t('femx.setMade', { count: ids.length })); } },
    'femx:nodesByPolygon': { icon: 'femxNodesSet', label: 'femx.nodesByPolygon', enabled: hasAnalysis, run: () => setByPolygon('nodes') },
    'femx:elementsByPolygon': { icon: 'femxElementsSet', label: 'femx.elementsByPolygon', enabled: hasAnalysis, run: () => setByPolygon('elements') },
    'femx:eraseElements': { icon: 'femxErase', label: 'femx.eraseElements', enabled: hasAnalysis, run: () => setByPolygon('elements', true) },
    'femx:fluid1D': { icon: 'femxFluid1D', label: 'femx.fluid1D', enabled: () => app.selectedEntities().some((e) => e.type === 'line'), run: () => fluid1D() },
    'femx:rotation1D': { icon: 'femxRotation1D', label: 'femx.rotation1D', enabled: hasDoc, run: () => rotation1D() },
    'femx:solverControl': { icon: 'femxSolverControl', label: 'femx.solverControl', enabled: hasAnalysis, run: () => solverControl() },
    'femx:solverElmer': { icon: 'femxSolver', label: 'femx.solver.elmer', enabled: hasAnalysis, run: () => writeDeck('elmer') },
    'femx:solverMystran': { icon: 'femxSolver', label: 'femx.solver.mystran', enabled: hasAnalysis, run: () => writeDeck('mystran') },
    'femx:solverZ88': { icon: 'femxSolver', label: 'femx.solver.z88', enabled: hasAnalysis, run: () => writeDeck('z88') },
    'femx:pipeline': { icon: 'femxPipeline', label: 'femx.pipeline', enabled: withResult, run: () => showResult() },
    'femx:apply': { icon: 'femxApply', label: 'femx.apply', enabled: withResult, run: () => applyPipeline() },
    'femx:branch': { icon: 'femxBranch', label: 'femx.filter.branch', enabled: withResult, run: () => { record('branch', 'vm', {}); app.notify('success', t('femx.branchMade')); } },
    'femx:functions': { icon: 'femxFunctions', label: 'femx.functions', enabled: hasAnalysis, run: () => newFunction() },
    'femx:calculator': { icon: 'femxCalculator', label: 'femx.filter.calculator', enabled: withResult, run: () => calculator() },
    'femx:clipRegion': { icon: 'femxClipRegion', label: 'femx.filter.clipRegion', enabled: withResult, run: () => clipRegion() },
    'femx:clipScalar': { icon: 'femxClipScalar', label: 'femx.filter.clipScalar', enabled: withResult, run: () => clipScalar() },
    'femx:contours': { icon: 'femxContours', label: 'femx.filter.contours', enabled: withResult, run: () => contours() },
    'femx:cut': { icon: 'femxCut', label: 'femx.filter.cutFunction', enabled: withResult, run: () => cut() },
    'femx:alongLine': { icon: 'femxLine', label: 'femx.filter.dataAlongLine', enabled: withResult, run: () => alongLine(false) },
    'femx:atPoint': { icon: 'femxPoint', label: 'femx.filter.dataAtPoint', enabled: withResult, run: () => atPoint() },
    'femx:glyph': { icon: 'femxGlyph', label: 'femx.filter.glyph', enabled: withResult, run: () => glyph() },
    'femx:linearized': { icon: 'femxLinearized', label: 'femx.filter.linearizedStresses', enabled: withResult, run: () => linearized() },
    'femx:warp': { icon: 'femxWarp', label: 'femx.filter.warp', enabled: withResult, run: () => warp() },
    'femx:histogram': { icon: 'femxHistogram', label: 'femx.histogram', enabled: withResult, run: () => histogramPlot() },
    'femx:lineplot': { icon: 'femxLineplot', label: 'femx.lineplot', enabled: withResult, run: () => alongLine(true) },
    'femx:table': { icon: 'femxTable', label: 'femx.table', enabled: withResult, run: () => table() },
    'femx:purge': { icon: 'femxPurge', label: 'femx.purge', enabled: withResult, run: () => { last = null; app.change('femx.op.purge', (d) => { const g = (d.groups ?? []).find((x) => x.femResults); if (g) { d.entities = d.entities.filter((e) => e.group !== g.id); d.groups = d.groups.filter((x) => x !== g); } }); app.notify('success', t('femx.purged')); } },
    'femx:clipAdd': { icon: 'femxClipAdd', label: 'femx.clipAdd', enabled: () => (state.elements ?? []).some((el) => el.kind === 'face'), run: async () => { const face = state.elements.find((el) => el.kind === 'face'); if (!state.view3d) await app.toggle3d(true); app.view3d.instance?.setClipping({ custom: { normal: face.signature.normal.map((v) => -v), point: face.signature.center } }); } },
    'femx:clipRemove': { icon: 'femxClipRemove', label: 'femx.clipRemove', enabled: () => Boolean(state.view3d), run: () => app.view3d.instance?.setClipping(null) },
    'femx:examples': { icon: 'femxExamples', label: 'femx.examples', enabled: hasDoc, run: () => examples() },
  });
  return cmds;
}

export const FEMX_MENU = {
  constraints: ['femx:c:displacement', 'femx:c:pressure', 'femx:c:centrif', 'femx:c:spring', 'femx:c:rigidBody', 'femx:c:planeRotation', 'femx:c:bearing', 'femx:c:gear', 'femx:c:pulley', 'femx:c:contact', 'femx:c:tie', 'femx:c:transform', 'femx:c:sectionPrint'],
  physics: ['femx:c:temperature', 'femx:c:heatflux', 'femx:c:bodyHeatSource', 'femx:c:initialTemperature', '-', 'femx:c:electrostaticPotential', 'femx:c:electricChargeDensity', 'femx:c:currentDensity', 'femx:c:magnetization', 'femx:eps0', '-', 'femx:c:flowVelocity', 'femx:c:initialFlowVelocity', 'femx:c:initialPressure', 'femx:c:fluidBoundary'],
  equations: Object.keys(EQUATION_ICONS).map((eq) => `femx:eq:${eq}`),
  materials: ['femx:materialEditor', 'femx:materialFluid', 'femx:materialNonlinear', 'femx:materialReinforced', '-', 'femx:fluid1D', 'femx:rotation1D'],
  mesh: ['femx:meshNetgen', 'femx:meshGmsh', 'femx:meshRegion', 'femx:meshLayer', 'femx:meshGroup', '-', 'femx:nodesSet', 'femx:nodesByPolygon', 'femx:elementsByPolygon', 'femx:eraseElements', '-', 'femx:meshInfo', 'femx:mesh2mesh', 'femx:meshClear'],
  solve: ['femx:solverControl', 'femx:solverElmer', 'femx:solverMystran', 'femx:solverZ88', '-', 'femx:examples'],
  results: ['femx:pipeline', 'femx:apply', 'femx:branch', 'femx:functions', '-', 'femx:warp', 'femx:clipScalar', 'femx:clipRegion', 'femx:cut', 'femx:contours', 'femx:glyph', '-', 'femx:alongLine', 'femx:atPoint', 'femx:linearized', 'femx:calculator', '-', 'femx:histogram', 'femx:lineplot', 'femx:table', '-', 'femx:purge', 'femx:clipAdd', 'femx:clipRemove'],
};

export const FEMX_FREECAD = {
  FEM_ClippingPlaneAdd: 'femx:clipAdd', FEM_ClippingPlaneRemoveAll: 'femx:clipRemove', FEM_ConstantVacuumPermittivity: 'femx:eps0',
  FEM_ConstraintBearing: 'femx:c:bearing', FEM_ConstraintBodyHeatSource: 'femx:c:bodyHeatSource', FEM_ConstraintCentrif: 'femx:c:centrif', FEM_ConstraintContact: 'femx:c:contact',
  FEM_ConstraintCurrentDensity: 'femx:c:currentDensity', FEM_ConstraintDisplacement: 'femx:c:displacement', FEM_ConstraintElectricChargeDensity: 'femx:c:electricChargeDensity',
  FEM_ConstraintElectrostaticPotential: 'femx:c:electrostaticPotential', FEM_ConstraintFlowVelocity: 'femx:c:flowVelocity', FEM_ConstraintFluidBoundary: 'femx:c:fluidBoundary',
  FEM_ConstraintGear: 'femx:c:gear', FEM_ConstraintHeatflux: 'femx:c:heatflux', FEM_ConstraintInitialFlowVelocity: 'femx:c:initialFlowVelocity', FEM_ConstraintInitialPressure: 'femx:c:initialPressure',
  FEM_ConstraintInitialTemperature: 'femx:c:initialTemperature', FEM_ConstraintMagnetization: 'femx:c:magnetization', FEM_ConstraintPlaneRotation: 'femx:c:planeRotation',
  FEM_ConstraintPressure: 'femx:c:pressure', FEM_ConstraintPulley: 'femx:c:pulley', FEM_ConstraintRigidBody: 'femx:c:rigidBody', FEM_ConstraintSectionPrint: 'femx:c:sectionPrint',
  FEM_ConstraintSpring: 'femx:c:spring', FEM_ConstraintTemperature: 'femx:c:temperature', FEM_ConstraintTie: 'femx:c:tie', FEM_ConstraintTransform: 'femx:c:transform',
  FEM_CreateElementsSet: 'femx:eraseElements', FEM_CreateNodesSet: 'femx:nodesSet', FEM_DefineElementsSet: 'femx:elementsByPolygon', FEM_DefineNodesSet: 'femx:nodesByPolygon',
  FEM_ElementFluid1D: 'femx:fluid1D', FEM_ElementRotation1D: 'femx:rotation1D',
  FEM_EquationDeformation: 'femx:eq:deformation', FEM_EquationElectricforce: 'femx:eq:electricforce', FEM_EquationElectrostatic: 'femx:eq:electrostatic', FEM_EquationFlow: 'femx:eq:flow',
  FEM_EquationFlux: 'femx:eq:flux', FEM_EquationHeat: 'femx:eq:heat', FEM_EquationMagnetodynamic: 'femx:eq:magnetodynamic', FEM_EquationMagnetodynamic2D: 'femx:eq:magnetodynamic2D',
  FEM_EquationStaticCurrent: 'femx:eq:staticCurrent', FEM_Examples: 'femx:examples', FEM_FEMMesh2Mesh: 'femx:mesh2mesh', FEM_MaterialEditor: 'femx:materialEditor',
  FEM_MaterialFluid: 'femx:materialFluid', FEM_MaterialMechanicalNonlinear: 'femx:materialNonlinear', FEM_MaterialReinforced: 'femx:materialReinforced',
  FEM_MeshBoundaryLayer: 'femx:meshLayer', FEM_MeshClear: 'femx:meshClear', FEM_MeshDisplayInfo: 'femx:meshInfo', FEM_MeshGmshFromShape: 'femx:meshGmsh', FEM_MeshGroup: 'femx:meshGroup',
  FEM_MeshNetgenFromShape: 'femx:meshNetgen', FEM_MeshRegion: 'femx:meshRegion', FEM_PostApplyChanges: 'femx:apply', FEM_PostBranchFilter: 'femx:branch', FEM_PostCreateFunctions: 'femx:functions',
  FEM_PostFilterCalculator: 'femx:calculator', FEM_PostFilterClipRegion: 'femx:clipRegion', FEM_PostFilterClipScalar: 'femx:clipScalar', FEM_PostFilterContours: 'femx:contours',
  FEM_PostFilterCutFunction: 'femx:cut', FEM_PostFilterDataAlongLine: 'femx:alongLine', FEM_PostFilterDataAtPoint: 'femx:atPoint', FEM_PostFilterGlyph: 'femx:glyph',
  FEM_PostFilterLinearizedStresses: 'femx:linearized', FEM_PostFilterWarp: 'femx:warp', FEM_PostPipelineFromResult: 'femx:pipeline', FEM_PostVisualization: 'group',
  FEM_PostVisualizationHistogram: 'femx:histogram', FEM_PostVisualizationLineplot: 'femx:lineplot', FEM_PostVisualizationTable: 'femx:table', FEM_ResultsPurge: 'femx:purge',
  FEM_SolverControl: 'femx:solverControl', FEM_SolverElmer: 'femx:solverElmer', FEM_SolverMystran: 'femx:solverMystran', FEM_SolverZ88: 'femx:solverZ88',
};

