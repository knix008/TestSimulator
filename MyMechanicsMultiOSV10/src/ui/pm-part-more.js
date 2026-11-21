// PropertyManager pages of the newer part features (body tools, reference geometry, fillet variants,
// patterns, curves), and the parameters a new one starts with from the selection. HTML only — app.js
// binds the data-pm* attributes like the other pages.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select, pickBox } from './propertymanager.js';
import { PART_MORE_TYPES, CURVE_TYPES } from '../cad/part-more-types.js';
import { profiles, standalonePoints } from '../cad/sketch.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
const before = (api, f) => api.featuresBefore?.(f) ?? [];
const bodyCount = (api, f) => api.bodyCount?.(f) ?? 0;
const bodyName = (api, i) => `${api.t('pm.body')} ${i + 1}`;
/** A body chooser: one of the bodies (as "0", "1" …). */
const bodySeg = (api, f, key) => {
  const n = bodyCount(api, f);
  return n ? `<label class="pm-field"><span class="pm-label">${escapeHtml(api.t(`pm.${key}`))}</span></label>${seg(key, Array.from({ length: n }, (_, i) => [String(i), bodyName(api, i), 'part']), String(f[key] ?? 0))}` : note(api.t('pm.needBodies'), true);
};
/** Check boxes for a list of bodies (`list:<key>:<index>`). */
const bodyChecks = (api, f, key, skip = null) => {
  const n = bodyCount(api, f);
  const chosen = (f[key] ?? []).map(String);
  const rows = Array.from({ length: n }, (_, i) => i).filter((i) => String(i) !== String(skip)).map((i) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="list:${key}:${i}" ${chosen.includes(String(i)) ? 'checked' : ''}/>${icon('part')}<span>${escapeHtml(bodyName(api, i))}</span></label>`);
  return `<div class="pm-checklist">${rows.join('') || note(api.t('pm.nothingToChoose'))}</div>`;
};
const seedBox = (api, f) => pickBox(api, 'seeds', (f.seeds ?? []).map((id) => api.featureName(id) ?? id), api.t('pm.seedFeatures'), 'featExtrude');
const faceItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`);
const edgeItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.edge')} ${i + 1}`);
const oneFace = (api, sig) => (sig ? [`${api.t('pm.face')} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`] : []);
const oneEdge = (api, sig) => (sig ? [`${api.t('pm.edge')} (${sig.type === 'CIRCLE' ? api.t('pm.circular') : sig.type === 'LINE' ? api.t('pm.straight') : api.t('pm.curve')})`] : []);
const xyz = (api, f, keys, glyph = 'pointTool') => keys.map((k) => field(api, k, f[k] ?? 0, { label: k.replace(/[0-9]/g, '').toUpperCase() + (k.match(/[0-9]/)?.[0] ?? ''), glyph })).join('');
const axes3 = (key, value) => seg(key, [['x', 'X'], ['y', 'Y'], ['z', 'Z']], value);
const dirs6 = (key, value) => seg(key, [['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y'], ['z', '+Z'], ['-z', '−Z']], value);
const ofType = (api, f, types) => before(api, f).filter((x) => types.includes(x.type) && !x.suppressed);
const planeOptions = (api, f) => [['std:front', api.t('plane.front')], ['std:top', api.t('plane.top')], ['std:right', api.t('plane.right')], ...ofType(api, f, ['plane']).map((p) => [`ref:${p.id}`, p.name, 'refPlane'])];
const sketchOptions = (api, f, test) => [['', `— ${api.t('pm.chooseSketch')} —`], ...before(api, f).filter((x) => x.type === 'sketch' && !x.suppressed && test(x)).map((s) => [s.id, s.name, 'featSketch'])];
const hasCurves = (s) => s.entities.some((k) => k.type !== 'point' && !k.construction);
const curveOptions = (api, f) => [...before(api, f).filter((x) => x.type === 'sketch' && hasCurves(x)).map((s) => [s.id, s.name, 'featSketch']), ...ofType(api, f, CURVE_TYPES).map((c) => [c.id, c.name, c.type === 'helix' ? 'helix' : 'sketch3d'])];
const table = (api, f, label) => {
  const { t } = api;
  const rows = (f.points ?? []).map((p, i) => `<div class="pt3-row"><b>${i + 1}</b>${['x', 'y', 'z'].map((axis, j) => `<input type="text" class="pm-text" data-pm-field="pt3:${i}:${j}" data-num value="${escapeHtml(api.fmtLenBare(p[j]))}" title="${axis.toUpperCase()}" spellcheck="false"/>`).join('')}<button class="icon-button" data-pm="delPt3:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
  return group('tablePattern', label, `<div class="pt3-table"><div class="pt3-row head"><b>#</b><span>X</span><span>Y</span><span>Z</span><span></span></div>${rows}</div><div class="pm-row"><button class="small-button" data-pm="addPt3">${icon('plus')}<span>${escapeHtml(t('pm.addPoint'))}</span></button></div>`);
};

export const PART_MORE_PM = {
  combine(api, f) {
    const { t } = api;
    return [
      group('combineBodies', t('pm.operationType'), seg('op', [['add', t('combine.add'), 'featExtrude'], ['subtract', t('combine.subtract'), 'featCut'], ['common', t('combine.common'), 'featIntersect']], f.op ?? 'add')),
      group('part', t('pm.mainBody'), bodySeg(api, f, 'main')),
      group('part', t('pm.bodiesToCombine'), `${bodyChecks(api, f, 'bodies', f.main ?? 0)}${note(t('pm.help.combineAll'))}`),
    ].join('');
  },
  deleteBody(api, f) {
    const { t } = api;
    return [
      group('deleteBody', t('pm.type'), seg('mode', [['delete', t('deleteBody.delete'), 'trash'], ['keep', t('deleteBody.keep'), 'check']], f.mode ?? 'delete')),
      group('part', t('pm.bodies'), bodyChecks(api, f, 'bodies')),
    ].join('');
  },
  indent(api, f) {
    const { t } = api;
    return [
      group('part', t('pm.targetBody'), bodySeg(api, f, 'target')),
      group('indent', t('pm.toolBody'), `${bodySeg(api, f, 'toolBody')}${check('keepTool', f.keepTool, t('pm.keepToolBody'), 'part')}`),
      group('indent', t('pm.parameters'), `${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.01 })}${field(api, 'clearance', f.clearance, { label: t('pm.clearance'), min: 0 })}`),
    ].join('');
  },
  flex(api, f) {
    const { t } = api;
    const mode = f.mode ?? 'bend';
    const value = mode === 'taper' ? field(api, 'factor', f.factor, { label: t('pm.taperFactor'), unit: 'number', glyph: 'scaleBody', min: 0.01 })
      : mode === 'stretch' ? field(api, 'stretch', f.stretch, { label: t('pm.stretchDistance') })
        : field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' });
    return [
      group('flex', t('pm.flexType'), seg('mode', [['bend', t('flex.bend')], ['twist', t('flex.twist')], ['taper', t('flex.taper')], ['stretch', t('flex.stretch')]], mode)),
      group('refAxis', t('pm.flexAxis'), `${axes3('axis', f.axis ?? 'x')}${mode === 'bend' ? `<label class="pm-field"><span class="pm-label">${escapeHtml(t('pm.bendToward'))}</span></label>${axes3('toward', f.toward ?? 'y')}` : ''}`),
      group('flex', t('pm.parameters'), `${value}${note(t('pm.help.faceted'))}`),
    ].join('');
  },
  deform(api, f) {
    const { t } = api;
    const pts = ofType(api, f, ['refPoint']);
    return [
      group('refPoint', t('pm.deformPoint'), `${select('pointRef', [['', t('pm.coordinates')], ...pts.map((p) => [p.id, p.name, 'refPoint'])], f.pointRef ?? '', t('pm.refPoint'))}${f.pointRef ? '' : xyz(api, f, ['x', 'y', 'z'])}`),
      group('deform', t('pm.parameters'), `${dirs6('dir', f.dir ?? 'y')}${field(api, 'amount', f.amount, { label: t('pm.deformDistance') })}${field(api, 'radius', f.radius, { label: t('pm.deformRadius'), glyph: 'dimRadius', min: 0.01 })}${note(t('pm.help.faceted'))}`),
    ].join('');
  },
  refAxis(api, f) {
    const { t } = api;
    const kind = f.kind ?? 'std';
    let body = '';
    if (kind === 'std') body = axes3('axis', f.axis ?? 'y');
    else if (kind === 'twoPoints') body = `${xyz(api, f, ['x1', 'y1', 'z1'])}${xyz(api, f, ['x2', 'y2', 'z2'])}`;
    else if (kind === 'edge') body = pickBox(api, 'edge', oneEdge(api, f.edge), t('pm.edge'), 'lineTool');
    else if (kind === 'cylinder') body = pickBox(api, 'face', oneFace(api, f.face), t('pm.cylindricalFace'), 'featRevolve');
    else body = `${select('planeA', planeOptions(api, f), f.planeA ?? 'std:front', `${t('pm.plane')} 1`)}${select('planeB', planeOptions(api, f), f.planeB ?? 'std:right', `${t('pm.plane')} 2`)}`;
    return group('refAxis', t('pm.selections'), `${seg('kind', [['std', t('refAxis.std')], ['twoPoints', t('refAxis.twoPoints')], ['edge', t('refAxis.edge')], ['cylinder', t('refAxis.cylinder')], ['twoPlanes', t('refAxis.twoPlanes')]], kind)}${body}`);
  },
  refPoint(api, f) {
    const { t } = api;
    const kind = f.kind ?? 'coords';
    let body = '';
    if (kind === 'coords') body = xyz(api, f, ['x', 'y', 'z']);
    else if (kind === 'faceCenter') body = pickBox(api, 'face', oneFace(api, f.face), t('pm.face'), 'part');
    else body = `${pickBox(api, 'edge', oneEdge(api, f.edge), t('pm.edge'), 'lineTool')}${kind === 'onEdge' ? field(api, 'at', f.at ?? 0.5, { label: t('pm.alongEdge'), unit: 'number', min: 0 }) : ''}`;
    return group('refPoint', t('pm.selections'), `${seg('kind', [['coords', t('refPoint.coords')], ['faceCenter', t('refPoint.faceCenter')], ['arcCenter', t('refPoint.arcCenter')], ['onEdge', t('refPoint.onEdge')]], kind)}${body}`);
  },
  coordSys(api, f) {
    const { t } = api;
    const pts = ofType(api, f, ['refPoint']);
    return [
      group('coordSys', t('pm.origin'), `${select('pointRef', [['', t('pm.coordinates')], ...pts.map((p) => [p.id, p.name, 'refPoint'])], f.pointRef ?? '', t('pm.refPoint'))}${f.pointRef ? '' : xyz(api, f, ['x', 'y', 'z'])}`),
      group('rotateRight', t('pm.rotation'), ['rx', 'ry', 'rz'].map((k) => field(api, k, f[k] ?? 0, { label: `${t('pm.about')} ${k[1].toUpperCase()}`, unit: 'angle', glyph: 'dimAngle' })).join('')),
    ].join('');
  },
  variableFillet(api, f) {
    const { t } = api;
    return group('variableFillet', t('pm.items'), `${pickBox(api, 'edges', edgeItems(api, f.edges), t('pm.edges'), 'featFillet')}${field(api, 'r1', f.r1, { label: t('pm.startRadius'), glyph: 'dimRadius', min: 0.001 })}${field(api, 'r2', f.r2, { label: t('pm.endRadius'), glyph: 'dimRadius', min: 0.001 })}`);
  },
  faceFillet(api, f) {
    const { t } = api;
    return group('faceFillet', t('pm.items'), `${field(api, 'radius', f.radius, { label: t('pm.radius'), glyph: 'dimRadius', min: 0.001 })}${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.faceSets'), 'faceFillet')}${note(t('pm.help.faceFillet'))}`);
  },
  fullRoundFillet(api, f) {
    const { t } = api;
    const n = (f.faces ?? []).length;
    return group('fullRoundFillet', t('pm.items'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.fullRoundFaces'), 'fullRoundFillet')}${n < 3 ? note(t('pm.help.fullRound'), true) : ''}`);
  },
  curvePattern(api, f) {
    const { t } = api;
    return [
      group('curvePattern', t('pm.direction1'), `${select('curve', [['', `— ${t('pm.chooseCurve')} —`], ...curveOptions(api, f)], f.curve ?? '', t('pm.patternCurve'))}${field(api, 'count', f.count, { label: t('pm.instances'), unit: 'count', glyph: 'curvePattern', min: 1, step: 1 })}${check('equal', f.equal !== false, t('pm.equalSpacing'), 'relEqual')}${f.equal === false ? field(api, 'spacing', f.spacing, { label: t('pm.spacing') }) : ''}${check('align', f.align, t('pm.alignToCurve'), 'rotateEntities')}`),
      group('part', t('pm.featuresToPattern'), seedBox(api, f)),
    ].join('');
  },
  sketchPattern(api, f) {
    const { t } = api;
    return [
      group('sketchDrivenPattern', t('pm.selections'), `${select('sketch', sketchOptions(api, f, (s) => standalonePoints(s).length > 0), f.sketch ?? '', t('pm.referenceSketch'))}${note(t('pm.help.sketchPattern'))}`),
      group('part', t('pm.featuresToPattern'), seedBox(api, f)),
    ].join('');
  },
  tablePattern(api, f) {
    const { t } = api;
    const cs = ofType(api, f, ['coordSys']);
    return [
      group('coordSys', t('pm.selections'), select('cs', [['', t('pm.worldAxes')], ...cs.map((c) => [c.id, c.name, 'coordSys'])], f.cs ?? '', t('pm.coordSys'))),
      table(api, f, t('pm.offsetsTable')),
      group('part', t('pm.featuresToPattern'), seedBox(api, f)),
    ].join('');
  },
  fillPattern(api, f) {
    const { t } = api;
    const seeds = (f.seeds ?? []).length > 0;
    return [
      group('fillPattern', t('pm.fillBoundary'), pickBox(api, 'face', oneFace(api, f.face), t('pm.fillFace'), 'part')),
      group('fillPattern', t('pm.patternLayout'), `${seg('layout', [['square', t('fill.square')], ['hex', t('fill.hex')]], f.layout ?? 'square')}${field(api, 'spacing', f.spacing, { label: t('pm.spacing'), min: 0.1 })}${field(api, 'margin', f.margin, { label: t('pm.margin'), min: 0 })}${field(api, 'angle', f.angle ?? 0, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}`),
      group('part', t('pm.featuresToPattern'), `${seedBox(api, f)}${seeds ? '' : `${note(t('pm.help.fillCut'))}${field(api, 'diameter', f.diameter, { label: t('hole.diameter'), glyph: 'dimDiameter', min: 0.05 })}`}`),
    ].join('');
  },
  variablePattern(api, f) {
    const { t } = api;
    const seed = before(api, f).find((x) => x.id === (f.seeds ?? [])[0]);
    const params = seed ? Object.keys(seed).filter((k) => typeof seed[k] === 'number' && !['offset'].includes(k)) : [];
    return [
      group('part', t('pm.seedFeature'), seedBox(api, f)),
      group('variablePattern', t('pm.varyValue'), `${params.length ? select('param', params.map((k) => [k, t(`pm.${k}`, null, k)]), f.param ?? params[0], t('pm.parameter')) : note(t('pm.help.variableSeed'), true)}${field(api, 'delta', f.delta, { label: t('pm.increment') })}`),
      group('featLinPattern', t('pm.direction1'), `${axes3('axis', f.axis ?? 'x')}${field(api, 'spacing', f.spacing, { label: t('pm.spacing') })}${field(api, 'count', f.count, { label: t('pm.instances'), unit: 'count', glyph: 'variablePattern', min: 1, step: 1 })}`),
    ].join('');
  },
  projectedCurve(api, f) {
    const { t } = api;
    return group('projectedCurve', t('pm.selections'), `${select('sketch', sketchOptions(api, f, hasCurves), f.sketch ?? '', t('pm.sketchToProject'))}${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.projectionFaces'), 'part')}${note(t('pm.help.projectAll'))}`);
  },
  splitLine(api, f) {
    const { t } = api;
    return group('splitLine', t('pm.selections'), `${select('sketch', sketchOptions(api, f, hasCurves), f.sketch ?? '', t('pm.sketchToProject'))}${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.facesToSplit'), 'part')}${note(t('pm.help.projectAll'))}`);
  },
  compositeCurve(api, f) {
    const { t } = api;
    const list = curveOptions(api, f);
    const chosen = f.curves ?? [];
    const rows = list.map(([id, name, glyph]) => { const at = chosen.indexOf(id); return `<label class="pm-check"><input type="checkbox" data-pm-toggle="curv:${escapeHtml(id)}" ${at >= 0 ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(name)}${at >= 0 ? ` <b class="pm-order">${at + 1}</b>` : ''}</span></label>`; }).join('');
    return group('compositeCurve', t('pm.entitiesToJoin'), `<div class="pm-checklist">${rows || note(t('pm.nothingToChoose'))}</div>${pickBox(api, 'edges', edgeItems(api, f.edges), t('pm.edges'), 'lineTool')}`);
  },
  curveXYZ(api, f) {
    const { t } = api;
    return [table(api, f, t('pm.curvePoints')), group('curveXYZ', t('pm.options'), check('closed', f.closed, t('pm.closedCurve'), 'refresh'))].join('');
  },
};

/**
 * A new feature's parameters from the selection: `sel` = { faces: [sig], edges: [sig], features: [feature],
 * planes: [ref] }. Returns { params, pick } or { notice } (what is missing).
 */
export function startParams(type, part, sel, featuresBefore) {
  const params = {}; let pick = null;
  const feats = sel.features ?? [];
  const sketches = feats.filter((f) => f.type === 'sketch');
  const tools = feats.filter((f) => !['sketch', 'plane', ...PART_MORE_TYPES.filter((x) => x.startsWith('ref') || x === 'coordSys')].includes(f.type));
  const last = (pred) => [...featuresBefore].reverse().find(pred);
  switch (type) {
    case 'variableFillet': params.edges = sel.edges; pick = 'edges'; break;
    case 'faceFillet': case 'fullRoundFillet': params.faces = sel.faces; pick = 'faces'; break;
    case 'refAxis':
      if (sel.edges[0]) { params.kind = 'edge'; params.edge = sel.edges[0]; pick = 'edge'; }
      else if (sel.faces[0] && /CYL/.test(sel.faces[0].type)) { params.kind = 'cylinder'; params.face = sel.faces[0]; pick = 'face'; }
      break;
    case 'refPoint':
      if (sel.faces[0]) { params.kind = 'faceCenter'; params.face = sel.faces[0]; pick = 'face'; }
      else if (sel.edges[0]) { params.kind = sel.edges[0].type === 'CIRCLE' ? 'arcCenter' : 'onEdge'; params.edge = sel.edges[0]; pick = 'edge'; }
      break;
    case 'coordSys': { const p = feats.find((f) => f.type === 'refPoint'); if (p) params.pointRef = p.id; break; }
    case 'deform': { const p = feats.find((f) => f.type === 'refPoint') ?? last((f) => f.type === 'refPoint'); if (p) params.pointRef = p.id; break; }
    case 'curvePattern': case 'sketchPattern': case 'tablePattern': case 'fillPattern': case 'variablePattern': {
      params.seeds = tools.map((f) => f.id);
      if (!params.seeds.length) { const s = last((f) => ['extrude', 'revolve', 'hole', 'sweep', 'loft'].includes(f.type) && f !== featuresBefore.find((x) => x.type === 'extrude')); if (s) params.seeds = [s.id]; }
      if (type === 'variablePattern') params.seeds = params.seeds.slice(0, 1);
      pick = 'seeds';
      if (type === 'curvePattern') { const c = feats.find((f) => f.type !== 'sketch' && ['helix', 'sketch3d', 'projectedCurve', 'compositeCurve', 'curveXYZ'].includes(f.type)) ?? sketches.find((s) => s.entities.some((k) => k.type !== 'point' && !k.construction)) ?? last((f) => ['sketch3d', 'curveXYZ', 'compositeCurve', 'helix'].includes(f.type)); if (c) params.curve = c.id; }
      if (type === 'sketchPattern') { const s = sketches.find((x) => standalonePoints(x).length) ?? last((f) => f.type === 'sketch' && standalonePoints(f).length > 0); if (!s) return { notice: 'notice.needPointSketch' }; params.sketch = s.id; }
      if (type === 'fillPattern') { const fc = sel.faces.find((x) => x.type === 'PLANE'); if (fc) params.face = fc; else pick = 'face'; if (!sel.features?.length && !tools.length) params.seeds = []; }
      if (type === 'variablePattern' && params.seeds[0]) { const seed = featuresBefore.find((f) => f.id === params.seeds[0]); params.param = ['depth', 'diameter', 'radius', 'angle'].find((k) => typeof seed?.[k] === 'number') ?? 'depth'; }
      break;
    }
    case 'projectedCurve': case 'splitLine': {
      const s = sketches.find((x) => x.entities.some((k) => k.type !== 'point' && !k.construction)) ?? last((f) => f.type === 'sketch' && f.entities.some((k) => k.type !== 'point' && !k.construction) && !featuresBefore.some((x) => x.sketch === f.id));
      if (!s) return { notice: 'notice.needSketch' };
      params.sketch = s.id; params.faces = sel.faces; pick = 'faces';
      break;
    }
    case 'compositeCurve': params.curves = feats.filter((f) => ['sketch', 'sketch3d', 'helix', 'curveXYZ', 'projectedCurve'].includes(f.type)).map((f) => f.id); params.edges = sel.edges; pick = 'edges'; break;
    case 'deleteBody': params.bodies = []; break;
    default: break;
  }
  void profiles;
  return { params, pick };
}
