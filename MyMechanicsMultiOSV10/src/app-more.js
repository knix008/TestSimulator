// The main window's side of the later tools (app.js hands in what they need, `ctx`, and calls the hooks):
//   assembly — linear / circular component pattern and mirror components (PropertyManager pages), smart mates
//     (pick two faces: the mate type and alignment come from them), move / rotate components with collision
//     detection (stop at contact or highlight what touches);
//   drawing — broken-out section, break view, crop view (dialogs on the selected view), hole table, revision
//     table, sheets (tabs under the sheet: switch, add, rename, delete; print and export use the active sheet);
//   evaluate — curvature, zebra stripes and thickness analysis as colours on the part;
//   simulation — buckling and fatigue studies in the Simulation PropertyManager next to static / thermal / frequency.
// The modelling is in cad/asm-more.js, cad/drawing-more.js, cad/evaluate.js and cad/fea-more.js (no DOM there).
import './styles-asm.css';
import { rep } from './cad/kernel.js';
import { mateEntityOfFace, captureMate, placePoint, placeDir, instanceName } from './cad/assembly.js';
import { faceSignature } from './cad/refs.js';
import { addComponentPattern, updatePatterns, prunePatterns, smartMateFor, moveWithCollision, kernelCollisions } from './cad/asm-more.js';
import { projectView } from './cad/drawing.js';
import {
  sheetsOf, activeSheetId, sheetDrawing, adoptToActiveSheet, addSheet, renameSheet, deleteSheet, setActiveSheet, adjustProjections, defaultBreak,
  viewDepth, findHoles, holeTableRows, addRevision, sheetSvg, sheetDxf,
} from './cad/drawing-more.js';
import { curvatureColours, zebraColours, thicknessAnalysis } from './cad/evaluate.js';
import { buckling, fatigue, damageColor } from './cad/fea-more.js';
import { analyse as analyseFea, stressColor } from './cad/fea.js';
import { materialOf, materialName } from './cad/materials.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const MODES = new Set(['compPattern', 'smartMate', 'moveComp']);
const SIM_STUDIES = ['buckling', 'fatigue'];
const AXES = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };
const STD_PLANE_NORMALS = { front: [0, -1, 0], top: [0, 0, 1], right: [1, 0, 0] };

export function createMoreTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const asm = () => ctx.activeAssembly();
  const part = () => ctx.activePart();
  const drw = () => ctx.activeDrawing();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const compName = (id) => asm()?.components.find((c) => c.id === id)?.name ?? '?';
  const selectedComps = () => state.selection.filter((s) => s.kind === 'comp').map((s) => s.id);

  // ───────────────────────── assembly: patterns, mirror

  function startPattern(kind) {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'compPattern', kind, seeds: selectedComps().filter((id) => !a.components.find((c) => c.id === id)?.pattern), pick: 'seeds', dir: 'x', spacing: Math.round(ctx.assemblySize(a) * 0.6), count: 3, two: false, dir2: 'y', spacing2: Math.round(ctx.assemblySize(a) * 0.6), count2: 2, axisStd: 'z', axisRef: null, cCount: 4, angle: 360, planeStd: 'right', planeRef: null, orientation: 'auto', offset: 0 };
    state.leftTab = 'pm';
    ctx.renderAll();
    notify('info', t('compPattern.pickSeeds'));
  }

  /** A picked face as a world reference: { kind, point, dir } (planes, axes) of the component it belongs to. */
  function worldRefOf(hit) {
    const topo = ctx.topoOf(hit);
    if (hit?.kind !== 'face' || !topo?.comp || !topo.shape) return null;
    const ent = mateEntityOfFace(topo.shape, faceSignature);
    let point = ent.point; let dir = ent.dir;
    if (topo.inner) { point = placePoint(topo.inner, point); dir = placeDir(topo.inner, dir); }
    const local = { comp: topo.comp.id, ...ent, point, dir, ...(topo.inner ? { path: topo.path } : {}) };
    return { comp: topo.comp, local, world: { kind: ent.kind, point: placePoint(topo.comp, point), dir: placeDir(topo.comp, dir) } };
  }

  function patternOptions(e) {
    if (e.kind === 'linear') return { type: 'linear', dir: AXES[e.dir], spacing: e.spacing, count: e.count, ...(e.two ? { dir2: AXES[e.dir2], spacing2: e.spacing2, count2: e.count2 } : {}) };
    if (e.kind === 'circular') return { type: 'circular', axis: e.axisRef ? { point: e.axisRef.point, dir: e.axisRef.dir } : { point: [0, 0, 0], dir: AXES[e.axisStd] }, count: e.cCount, angle: e.angle };
    const n = STD_PLANE_NORMALS[e.planeStd];
    return { type: 'mirror', plane: e.planeRef ? { point: e.planeRef.point, normal: e.planeRef.dir } : { point: n.map((v) => v * e.offset), normal: n }, orientation: e.orientation };
  }

  function acceptPattern() {
    const e = editing(); const a = asm();
    if (!e.seeds.length) { notify('error', t('compPattern.noSeeds')); return; }
    if (e.kind === 'circular' && !e.axisRef && !AXES[e.axisStd]) return;
    let made = [];
    state.editing = null; state.leftTab = 'tree';
    ctx.change(`op.${e.kind === 'mirror' ? 'mirrorComponents' : 'componentPattern'}`, () => {
      const r = addComponentPattern(a, e.seeds, patternOptions(e), { newId: ctx.newId, nameOf: (copy) => instanceName(a, (ctx.project().parts.find((p) => p.id === copy.part) ?? ctx.project().assemblies.find((x) => x.id === copy.sub))?.name ?? 'Part', copy.sub ?? copy.part) });
      r.pattern.name = `${t(e.kind === 'mirror' ? 'cmd.mirrorComponents' : e.kind === 'linear' ? 'cmd.linearComponentPattern' : 'cmd.circularComponentPattern')}${(a.patterns?.length ?? 0)}`;
      made = r.components;
    });
    notify('success', t('notice.patternMade', { count: made.length }));
    ctx.fitView();
  }

  function patternPm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList } = ctx.pm;
    const title = t(e.kind === 'mirror' ? 'cmd.mirrorComponents' : e.kind === 'linear' ? 'cmd.linearComponentPattern' : 'cmd.circularComponentPattern');
    const glyph = e.kind === 'mirror' ? 'compMirror' : e.kind === 'linear' ? 'compLinPattern' : 'compCirPattern';
    const seeds = pmGroup('assembly', t('compPattern.seeds'), pmList('seeds', e.seeds.map(compName), t('compPattern.seedList'), 'part', e.pick === 'seeds'));
    const dirs = Object.keys(AXES).map((k) => [k, k.toUpperCase()]);
    if (e.kind === 'linear') {
      return [pmHead(glyph, title, t('pm.help.compLinear')), seeds,
        pmGroup('compLinPattern', t('compPattern.direction1'), `${pmSeg('dir', dirs, e.dir)}${pmNum('spacing', e.spacing, t('compPattern.spacing'), 'smartDim', ctx.units())}${pmNum('count', e.count, t('compPattern.count'), 'compLinPattern')}`),
        pmGroup('compLinPattern', t('compPattern.direction2'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="two" ${e.two ? 'checked' : ''}/>${icon('compLinPattern')}<span>${escapeHtml(t('compPattern.useDirection2'))}</span></label>${e.two ? `${pmSeg('dir2', dirs, e.dir2)}${pmNum('spacing2', e.spacing2, t('compPattern.spacing'), 'smartDim', ctx.units())}${pmNum('count2', e.count2, t('compPattern.count'), 'compLinPattern')}` : ''}`)].join('');
    }
    if (e.kind === 'circular') {
      const axisBody = `${pmSeg('axisStd', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], e.axisRef ? '' : e.axisStd)}${pmList('axis', e.axisRef ? [e.axisRef.label] : [], t('compPattern.axisFace'), 'refAxis', e.pick === 'axis')}`;
      return [pmHead(glyph, title, t('pm.help.compCircular')), seeds,
        pmGroup('refAxis', t('compPattern.axis'), axisBody),
        pmGroup('compCirPattern', t('compPattern.instances'), `${pmNum('cCount', e.cCount, t('compPattern.count'), 'compCirPattern')}${pmNum('angle', e.angle, `${t('compPattern.angle')} (°)`, 'smartDim')}`)].join('');
    }
    return [pmHead(glyph, title, t('pm.help.compMirror')), seeds,
      pmGroup('refPlane', t('compPattern.mirrorPlane'), `${pmSeg('planeStd', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], e.planeRef ? '' : e.planeStd)}${e.planeRef ? '' : pmNum('offset', e.offset, t('compPattern.planeOffset'), 'smartDim', ctx.units())}${pmList('plane', e.planeRef ? [e.planeRef.label] : [], t('compPattern.planeFace'), 'refPlane', e.pick === 'plane')}`),
      pmGroup('compMirror', t('compPattern.orientation'), pmSeg('orientation', [['auto', t('compPattern.orientAuto')], ['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['none', t('compPattern.orientCopy')]], e.orientation))].join('');
  }

  // ───────────────────────── smart mates

  function startSmartMate() {
    const a = asm();
    if (!a || a.components.length < 2) { notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'smartMate', first: null, made: [] };
    state.leftTab = 'pm';
    state.selection = [];
    ctx.syncView(); ctx.renderAll();
    notify('info', t('smartMate.pickFirst'));
  }

  function smartMatePick(hit) {
    const e = editing();
    const ref = worldRefOf(hit);
    if (!ref) { notify('info', t('notice.pickComponentFace')); return; }
    if (!e.first) { e.first = { ...ref, hit }; ctx.viewport()?.setSelection([{ kind: 'face', bodyKey: hit.bodyKey, index: hit.index }]); ctx.renderLeft(); notify('info', t('smartMate.pickSecond')); return; }
    if (ref.comp.id === e.first.comp.id) { notify('info', t('notice.sameComponent')); return; }
    const a = asm();
    const m = smartMateFor(e.first.local, ref.local, e.first.comp, ref.comp);
    if (!m) { notify('warning', t('smartMate.none')); e.first = null; ctx.renderLeft(); return; }
    const count = a.mates.filter((x) => x.type === m.type).length + 1;
    const mate = { id: ctx.newId('mate'), type: m.type, aligned: m.aligned, a: e.first.local, b: ref.local, name: `${t(`mate.${m.type}`)}${count}` };
    try { captureMate(a, mate); } catch { /* nothing to capture */ }
    e.first = null;
    e.made.push(mate.name);
    ctx.change('op.addMate', () => { a.mates.push(mate); });
    notify(state.failedMates.has(mate.id) ? 'warning' : 'success', t('smartMate.made', { type: t(`mate.${m.type}`), name: mate.name }));
  }

  function smartMatePm(e) {
    const { pmHead, pmGroup, pmList } = ctx.pm;
    return [pmHead('smartMate', t('cmd.smartMate'), t('pm.help.smartMate')),
      pmGroup('mate', t('smartMate.faces'), pmList('first', e.first ? [`${e.first.comp.name} — ${t(e.first.local.kind === 'axis' ? 'smartMate.cylinder' : 'smartMate.planar')}`] : [], t('smartMate.firstFace'), 'smartMate', !e.first)),
      pmGroup('mateCoincident', t('smartMate.rules'), `<ul class="pm-list"><li>${icon('mateConcentric', 'icon tiny')}<span>${escapeHtml(t('smartMate.ruleCylinders'))}</span></li><li>${icon('mateCoincident', 'icon tiny')}<span>${escapeHtml(t('smartMate.rulePlanes'))}</span></li></ul>`),
      e.made.length ? pmGroup('check', t('smartMate.madeList'), `<ul class="pm-list">${e.made.map((n) => `<li>${icon('mate', 'icon tiny')}<span>${escapeHtml(n)}</span></li>`).join('')}</ul>`) : ''].join('');
  }

  // ───────────────────────── moving components with collision detection

  function startMove() {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'moveComp', seeds: selectedComps().filter((id) => !a.components.find((c) => c.id === id)?.fixed), pick: 'seeds', step: 10, angle: 15, collision: true, collisionMode: 'stop', last: null };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  /** The placed solid of a component (one compound for a sub-assembly). */
  function placedShape(c) {
    const list = ctx.componentShapes(c).map((x) => x.shape);
    if (!list.length) return null;
    return list.length > 1 ? rep().makeCompound(list) : list[0];
  }

  function collisionTest(ids) {
    const R = rep();
    return (a) => {
      const shapes = new Map();
      const shapeOf = (c) => { if (!shapes.has(c.id)) shapes.set(c.id, placedShape(c)); return shapes.get(c.id); };
      return kernelCollisions(a, ids, { shapeOf, distance: (s1, s2) => R.measureDistanceBetween(s1, s2), boxOf: (c) => shapeOf(c)?.boundingBox.bounds ?? [[0, 0, 0], [0, 0, 0]], tolerance: Math.max(1e-3, ctx.assemblySize(a) * 1e-5) });
    };
  }

  async function moveStep(arg) {
    const e = editing(); const a = asm();
    if (!e.seeds.length) { notify('error', t('moveComp.noSeeds')); return; }
    await ctx.ensureKernel();
    const sign = arg.startsWith('-') ? -1 : 1;
    const axis = AXES[arg.replace(/^[-+]/, '').replace(/^r/, '')];
    const move = arg.includes('r') ? { rotate: { axis, degrees: sign * e.angle } } : { translate: axis.map((v) => v * sign * e.step) };
    let r = null;
    const collides = e.collision ? collisionTest(e.seeds) : () => [];
    const before = JSON.stringify(a.components.map((c) => [c.position, c.rotation]));
    // Mates move the free components back where they belong: the move is done on the bare placements.
    for (const id of e.seeds) { const c = a.components.find((x) => x.id === id); if (c && move.rotate) move.rotate.point ??= [...c.position]; }
    r = moveWithCollision(a, e.seeds, move, collides, { steps: e.collision ? 10 : 1, mode: e.collisionMode });
    const moved = JSON.stringify(a.components.map((c) => [c.position, c.rotation])) !== before;
    e.last = r;
    if (r.hits.length) state.selection = r.hits.map((id) => ({ kind: 'comp', id, key: `comp:${id}` }));
    if (moved) ctx.commit('op.moveComponent'); else { ctx.syncView(); ctx.renderAll(); }
    if (r.hits.length) notify('warning', t(r.stopped ? 'moveComp.stopped' : 'moveComp.touching', { names: r.hits.map(compName).join(', ') }));
  }

  function movePm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const btn = (arg, label) => pmButton(`more.move:${arg}`, arg.includes('r') ? 'rotateRight' : 'moveComponent', label);
    const last = e.last ? `<p class="pm-note ${e.last.hits.length ? 'error' : ''}">${escapeHtml(e.last.hits.length ? t(e.last.stopped ? 'moveComp.stopped' : 'moveComp.touching', { names: e.last.hits.map(compName).join(', ') }) : t('moveComp.free'))}</p>` : '';
    return [pmHead('moveComponent', t('cmd.moveComponent'), t('pm.help.moveComponent')),
      pmGroup('assembly', t('compPattern.seeds'), pmList('seeds', e.seeds.map(compName), t('moveComp.components'), 'part', e.pick === 'seeds')),
      pmGroup('moveComponent', t('moveComp.translate'), `${pmNum('step', e.step, t('moveComp.step'), 'smartDim', ctx.units())}<div class="pm-row more-move-grid">${['+x', '-x', '+y', '-y', '+z', '-z'].map((k) => btn(k, k.toUpperCase())).join('')}</div>`),
      pmGroup('rotateRight', t('moveComp.rotate'), `${pmNum('angle', e.angle, `${t('compPattern.angle')} (°)`, 'smartDim')}<div class="pm-row more-move-grid">${['+rx', '-rx', '+ry', '-ry', '+rz', '-rz'].map((k) => btn(k, `${k[0]}${k.slice(2).toUpperCase()}`)).join('')}</div>`),
      pmGroup('collision', t('moveComp.collision'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="collision" ${e.collision ? 'checked' : ''}/>${icon('collision')}<span>${escapeHtml(t('moveComp.detect'))}</span></label>${e.collision ? pmSeg('collisionMode', [['stop', t('moveComp.stopAtContact')], ['highlight', t('moveComp.highlight')]], e.collisionMode) : ''}${last}`)].join('');
  }

  // ───────────────────────── PropertyManager hooks

  function pm(e) {
    if (e.mode === 'compPattern') return patternPm(e);
    if (e.mode === 'smartMate') return smartMatePm(e);
    if (e.mode === 'moveComp') return movePm(e);
    return '';
  }

  function pick(hit) {
    const e = editing();
    if (e.mode === 'smartMate') return smartMatePick(hit);
    if (e.pick === 'seeds') {
      const ref = ctx.topoOf(hit);
      const comp = ref?.comp;
      if (!comp) { notify('info', t('notice.pickComponentFace')); return undefined; }
      if (comp.pattern) { notify('info', t('compPattern.instancePicked')); return undefined; }
      if (e.mode === 'moveComp' && comp.fixed) { notify('info', t('moveComp.fixedPicked')); return undefined; }
      const i = e.seeds.indexOf(comp.id);
      if (i >= 0) e.seeds.splice(i, 1); else e.seeds.push(comp.id);
      ctx.viewport()?.setSelection(e.seeds.map((id) => ({ kind: 'body', bodyKey: `comp:${id}` })));
      return ctx.renderLeft();
    }
    const ref = worldRefOf(hit);
    if (!ref) { notify('info', t('notice.pickComponentFace')); return undefined; }
    if (e.pick === 'axis') {
      if (ref.world.kind !== 'axis') { notify('info', t('compPattern.needCylinder')); return undefined; }
      e.axisRef = { point: ref.world.point, dir: ref.world.dir, label: `${ref.comp.name} — ${t('smartMate.cylinder')}` };
    } else if (e.pick === 'plane') {
      if (ref.world.kind !== 'plane') { notify('info', t('compPattern.needPlane')); return undefined; }
      e.planeRef = { point: ref.world.point, dir: ref.world.dir, label: `${ref.comp.name} — ${t('smartMate.planar')}` };
    }
    e.pick = 'seeds';
    return ctx.renderLeft();
  }

  function field(key, raw, v) {
    const e = editing();
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); ctx.renderLeft(); return; }
    if (['count', 'count2', 'cCount'].includes(key)) e[key] = Math.max(2, Math.min(200, Math.round(v)));
    else if (key === 'angle') e[key] = Math.max(0.1, Math.min(360, v));
    else if (key === 'offset') e[key] = v;
    else if (v > 0) e[key] = v;
    ctx.renderLeft();
  }

  function set(key, value) {
    const e = editing();
    e[key] = value;
    if (key === 'axisStd') e.axisRef = null;
    if (key === 'planeStd') e.planeRef = null;
    ctx.renderLeft();
  }

  function toggle(key, checked) { const e = editing(); e[key] = checked; ctx.renderLeft(); }

  function accept() {
    const e = editing();
    if (e.mode === 'compPattern') return acceptPattern();
    return ctx.cancelEditing({ quiet: true });
  }

  const COMMAND_NAMES = new Set(['more.move']);
  function handles(name) { return COMMAND_NAMES.has(name) || (name === 'clear' && owns(editing())); }
  function command(name, arg) {
    const e = editing();
    if (name === 'more.move') return moveStep(arg);
    if (name === 'clear') {
      if (arg === 'seeds') e.seeds = [];
      if (arg === 'axis') e.axisRef = null;
      if (arg === 'plane') e.planeRef = null;
      if (arg === 'first') e.first = null;
      ctx.viewport()?.setSelection([]);
      return ctx.renderLeft();
    }
    return undefined;
  }

  const subject = (e) => t({ compPattern: e.kind === 'mirror' ? 'cmd.mirrorComponents' : e.kind === 'linear' ? 'cmd.linearComponentPattern' : 'cmd.circularComponentPattern', smartMate: 'cmd.smartMate', moveComp: 'cmd.moveComponent' }[e.mode]);

  /** After the mates are solved: copies follow their seeds; copies of deleted seeds go. */
  function afterSolve(a) {
    if (!a?.patterns?.length) return;
    prunePatterns(a);
    updatePatterns(a);
  }

  // ───────────────────────── evaluate: curvature, zebra, thickness

  const evalCache = new Map();
  async function toggleEvaluate(kind) {
    if (state.evalDisplay?.kind === kind) { state.evalDisplay = null; notify('info', t('evaluate.off')); ctx.syncView(); ctx.renderToolbarState(); return; }
    const p = part();
    if (!p || !state.partEntry?.mesh) { notify('info', t('notice.noBody')); return; }
    let threshold = null;
    if (kind === 'thickness') {
      const r = await ctx.popups.open('prompt', { title: t('cmd.thicknessAnalysis'), label: `${t('evaluate.threshold')} (${ctx.units()})`, value: String(state.settings.thicknessThreshold ?? 2) });
      if (r?.value == null) return;
      threshold = ctx.parseLen(r.value, 'length');
      if (!(threshold > 0)) { notify('error', t('notice.invalidValue', { text: r.value })); return; }
    }
    state.draftAnalysis = null;
    state.evalDisplay = { kind, threshold };
    ctx.syncView();
    ctx.renderToolbarState();
    const info = state.evalInfo;
    if (kind === 'curvature' && info) notify('info', t('evaluate.curvatureOn', { r: ctx.fmtLen(info.max > 0 ? 1 / info.max : Infinity) }));
    else if (kind === 'thickness' && info) notify(info.thin ? 'warning' : 'success', t('evaluate.thicknessOn', { min: ctx.fmtLen(info.min), count: info.thin, threshold: ctx.fmtLen(threshold) }));
    else notify('info', t('evaluate.zebraOn'));
  }

  function cameraBasis() {
    const vp = ctx.viewport();
    const dir = vp?.dir ? [vp.dir.x, vp.dir.y, vp.dir.z] : [0, -1, 0];
    const up = vp?.up ? [vp.up.x, vp.up.y, vp.up.z] : [0, 0, 1];
    return { dir, up };
  }

  /** Vertex colours of the active evaluate display for the part body (null when none is on). */
  function colours(p, entry) {
    const ev = state.evalDisplay;
    if (!ev || !entry?.mesh) return null;
    if (ev.kind === 'zebra') {
      const { dir, up } = cameraBasis();
      return { colors: zebraColours(entry.mesh, { view: dir, up, stripes: 14 }).colors };
    }
    const key = `${entry.key}|${ev.kind}|${ev.threshold}`;
    if (!evalCache.has(key)) {
      if (evalCache.size > 6) evalCache.clear();
      evalCache.set(key, ev.kind === 'curvature' ? curvatureColours(entry.mesh, { size: entry.size ?? 100 }) : thicknessAnalysis(entry.mesh, { threshold: ev.threshold }));
    }
    const r = evalCache.get(key);
    state.evalInfo = r;
    return { colors: r.colors };
  }

  let cameraTimer = 0;
  function onCamera() {
    if (state.evalDisplay?.kind !== 'zebra' || !part()) return;
    clearTimeout(cameraTimer);
    cameraTimer = setTimeout(() => ctx.syncView(), 80);
  }

  // ───────────────────────── simulation: buckling, fatigue

  const simStudy = (s) => SIM_STUDIES.includes(s);
  const studyOptions = () => [['buckling', t('sim.buckling')], ['fatigue', t('sim.fatigue')]];

  function loadsOf(e) {
    return e.loads.map((l) => (e.loadKind === 'pressure' ? { faceId: l.faceId, pressure: e.magnitude / e.loads.length } : { faceId: l.faceId, force: AXES[e.dir].map((v) => (v * e.magnitude) / e.loads.length) }));
  }
  function feaMaterial(p, e) {
    const m = materialOf(p.material);
    return { E: m.E * 1000, nu: m.nu ?? e.nu, yield: m.yield, density: m.density, group: m.group, ultimate: m.ultimate };
  }

  async function runSim(e, p, entry) {
    if (!e.fixtures.length) { notify('error', t('sim.error.no-fixtures')); return; }
    if (!e.loads.length) { notify('error', t('sim.error.no-loads')); return; }
    const material = feaMaterial(p, e);
    const resolution = Math.max(8, Math.min(e.study === 'buckling' ? 80 : 140, Math.round(e.resolution)));
    // In the simulation worker (progress, cancel) when the FE tools are there (app-fem.js); on this thread otherwise.
    const fem = ctx.fem;
    const femMesh = fem?.meshOptions(e, entry.size ?? 100);
    const fixturesFem = fem ? fem.fixturesOf(e) : null;
    const result = fem
      ? await (async () => {
        if (e.study === 'buckling') return fem.run('buckling', { bodies: [{ mesh: entry.mesh, material }], fixtures: fixturesFem, loads: loadsOf(e), mesh: femMesh, modes: Math.max(1, Math.min(4, Math.round(e.bModes ?? 2))) }, p.name);
        const stat = await fem.run('static', { bodies: [{ mesh: entry.mesh, material }], fixtures: fixturesFem, loads: loadsOf(e), mesh: femMesh }, p.name);
        if (!stat) return null;
        return { stat, fat: stat.error && stat.error !== 'not-converged' ? null : fatigue(stat, { material, loading: e.loading ?? 'reversed', cycles: e.cycles ?? 1e6 }) };
      })()
      : await ctx.withProgress('progress.simulation', p.name, async (op, report) => {
        await new Promise((r) => setTimeout(r, 30));
        const onProgress = (f) => report({ fraction: f, text: t('progress.solving') });
        if (e.study === 'buckling') return buckling(entry.mesh, { material, fixtures: e.fixtures.map((x) => x.faceId), loads: loadsOf(e), resolution, modes: Math.max(1, Math.min(4, Math.round(e.bModes ?? 2))), onProgress });
        const stat = analyseFea(entry.mesh, { material, fixtures: e.fixtures.map((x) => x.faceId), loads: loadsOf(e), resolution, onProgress });
        return { stat, fat: stat.error && stat.error !== 'not-converged' ? null : fatigue(stat, { material, loading: e.loading ?? 'reversed', cycles: e.cycles ?? 1e6 }) };
      }, { delay: 150 });
    if (!result) return;
    const err = e.study === 'buckling' ? result.error : result.stat.error;
    if (err && err !== 'not-converged') { notify('error', t(`sim.error.${err}`)); return; }
    if (err === 'not-converged') notify('warning', t('sim.error.not-converged'));
    e.result = result;
    if (e.study === 'buckling') {
      e.modeIndex = 0;
      showBucklingMode(e, p, entry);
      notify(result.loadFactor < 1 && result.loadFactor > 0 ? 'warning' : 'success', t('notice.bucklingDone', { f: ctx.fmt(result.loadFactor, 3) }));
    } else {
      const f = result.fat;
      const colors = new Float32Array(f.vertexDamage.length * 3);
      f.vertexDamage.forEach((d, i) => colors.set(damageColor(d), i * 3));
      state.sim = { partId: p.id, key: entry.key, result: result.stat, colors, deformed: false, scale: 1, study: 'fatigue' };
      notify(f.maxDamage >= 1 ? 'warning' : 'success', t('notice.fatigueDone', { life: lifeText(f.minLife), damage: ctx.fmt(f.maxDamage, 3) }));
      ctx.syncView(); ctx.renderLeft();
    }
  }

  function showBucklingMode(e, p = part(), entry = state.partEntry) {
    const r = e.result;
    const shape = r?.modes?.[e.modeIndex];
    if (!shape) return;
    const n = shape.length / 3; const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set(stressColor(Math.hypot(shape[3 * i], shape[3 * i + 1], shape[3 * i + 2]), 0, 1), 3 * i);
    state.sim = { partId: p.id, key: entry.key, result: { ...r.staticResult, vertexDisplacement: shape }, colors, deformed: true, scale: (entry.size ?? 100) * 0.08, study: 'buckling' };
    ctx.syncView(); ctx.renderLeft();
  }

  const lifeText = (n) => (Number.isFinite(n) ? `${n >= 1e4 ? n.toExponential(2) : ctx.fmt(n, 0)} ${t('sim.cycles')}` : t('sim.infiniteLife'));

  /** The Simulation PropertyManager for a buckling or fatigue study (`study` = the study selector group). */
  function simPm(e, study) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const p = part();
    const mat = materialOf(p.material);
    const faceName = (x, i) => `${t('pm.face')} ${i + 1} (${x.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`;
    const loadGroup = pmGroup('load', t('sim.loads'), `${pmSeg('loadKind', [['force', t('sim.force')], ['pressure', t('sim.pressure')]], e.loadKind)}${pmList('loads', e.loads.map(faceName), t('sim.loadFaces'), 'load', e.pick === 'loads')}${pmNum('magnitude', e.magnitude, e.loadKind === 'pressure' ? `${t('sim.pressure')} (MPa)` : `${t('sim.force')} (N)`, 'load')}${e.loadKind === 'force' ? pmSeg('dir', Object.keys(AXES).map((k) => [k, k.toUpperCase()]), e.dir) : ''}`);
    const fix = pmGroup('fixture', t('sim.fixtures'), pmList('fixtures', e.fixtures.map(faceName), t('sim.fixedFaces'), 'fixture', e.pick === 'fixtures'));
    const material = pmGroup('material', t('sim.material'), `<p class="pm-note">${escapeHtml(`${materialName(p.material, ctx.lang())} · E ${mat.E} GPa · σy ${mat.yield} MPa`)}</p>`);
    const r = e.result && state.sim?.study === e.study ? e.result : null;
    if (e.study === 'buckling') {
      const res = r ? pmGroup('buckling', t('sim.loadFactors'), `<div class="pm-relations">${r.loadFactors.map((f, i) => `<button class="small-button ${e.modeIndex === i ? 'active' : ''}" data-pm-set="modeIndex" data-value="${i}">${icon('buckling')}<span>${escapeHtml(`${i + 1}: ${ctx.fmt(f, 3)}`)}</span></button>`).join('')}</div>
        <dl class="pm-results"><dt>${escapeHtml(t('sim.criticalLoad'))}</dt><dd class="${r.loadFactor < 1 ? 'error' : ''}">${escapeHtml(`${ctx.fmt(r.loadFactor * e.magnitude, 1)} ${e.loadKind === 'pressure' ? 'MPa' : 'N'}`)}</dd><dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(`${r.elements} (${ctx.fmt(r.elementSize, 2)} mm)`)}</dd></dl>
        <p class="pm-note">${escapeHtml(t(r.loadFactor < 0 ? 'sim.bucklingReversed' : r.loadFactor < 1 ? 'sim.bucklingFails' : 'sim.bucklingSafe'))}</p><div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`) : '';
      return [pmHead('buckling', t('cmd.simulation'), t('pm.help.buckling')), study, material, fix, loadGroup,
        ctx.fem ? `${pmGroup('buckling', t('sim.modeCount'), pmNum('bModes', e.bModes ?? 2, t('sim.modeCount'), 'buckling'))}${ctx.fem.meshGroup(e)}` : pmGroup('statistics', t('sim.mesh'), `${pmNum('bModes', e.bModes ?? 2, t('sim.modeCount'), 'buckling')}${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`), res].join('');
    }
    const f = r?.fat;
    const res = f ? pmGroup('fatigue', t('sim.results'), `<dl class="pm-results"><dt>${escapeHtml(t('sim.minLife'))}</dt><dd class="${f.maxDamage >= 1 ? 'error' : ''}">${escapeHtml(lifeText(f.minLife))}</dd><dt>${escapeHtml(t('sim.maxDamage'))}</dt><dd class="${f.maxDamage >= 1 ? 'error' : ''}">${escapeHtml(ctx.fmt(f.maxDamage, 4))}</dd><dt>${escapeHtml(t('sim.fatigueFos'))}</dt><dd>${escapeHtml(Number.isFinite(f.factorOfSafety) ? ctx.fmt(f.factorOfSafety, 2) : '∞')}</dd><dt>${escapeHtml(t('sim.snCurve'))}</dt><dd>${escapeHtml(`Su ${ctx.fmt(f.curve.su, 0)} · Se ${ctx.fmt(f.curve.se, 0)} MPa`)}</dd></dl><div class="sim-legend more-damage-legend"><span>0</span><i></i><span>${escapeHtml(t('sim.damageOne'))}</span></div><div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`) : '';
    return [pmHead('fatigue', t('cmd.simulation'), t('pm.help.fatigue')), study, material, fix, loadGroup,
      pmGroup('fatigue', t('sim.fatigueLoading'), `${pmSeg('loading', [['reversed', t('sim.fullyReversed')], ['zeroBased', t('sim.zeroBased')]], e.loading ?? 'reversed')}${pmNum('cycles', e.cycles ?? 1e6, t('sim.cycleCount'), 'fatigue')}`),
      ctx.fem ? ctx.fem.meshGroup(e) : pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`), res].join('');
  }

  /** modeIndex of a buckling study: shows that mode. True when handled. */
  function simSet(e, key, value) {
    if (e.study === 'buckling' && key === 'modeIndex') { e.modeIndex = Number(value); showBucklingMode(e); return true; }
    return false;
  }

  // ───────────────────────── drawing: sheets, broken-out, break, crop, tables

  /** The view the drawing tools act on: the selected plain view, else the front view, else the first plain one. */
  function targetView(d) {
    const sd = sheetDrawing(d);
    const plain = sd.views.filter((v) => !v.kind && v.type !== 'custom');
    return plain.find((v) => v.id === state.drawingSelected) ?? plain.find((v) => v.type === 'front') ?? plain[0] ?? null;
  }

  function rawBox(d, v) {
    const { shape } = ctx.drawingShape(d);
    if (!shape) return null;
    return { shape, box: projectView(shape, v.type, v).box };
  }

  const numbers = (text) => String(text ?? '').split(/[,\s]+/).filter(Boolean).map(Number);

  async function brokenOutCmd(d) {
    const v = targetView(d);
    if (!v) { notify('info', t('notice.needParentView')); return; }
    if (v.brokenOut) { ctx.change('op.edit', () => { delete v.brokenOut; }); notify('info', t('drawing.brokenOutRemoved')); return; }
    const raw = rawBox(d, v); if (!raw) return;
    const { box, shape } = raw;
    const w = box.x1 - box.x0; const h = box.y1 - box.y0;
    const def = [box.x0 + w * 0.3, box.y0 + h * 0.3, box.x0 + w * 0.7, box.y0 + h * 0.7, viewDepth(shape, v) / 2].map((x) => ctx.fmt(x, 2));
    const r = await ctx.popups.open('prompt', { title: t('cmd.brokenOutSection'), label: t('drawing.brokenOutPrompt'), value: def.join(', ') });
    const [x0, y0, x1, y1, depth] = numbers(r?.value);
    if (![x0, y0, x1, y1, depth].every(Number.isFinite) || !(depth > 0) || x0 === x1 || y0 === y1) { if (r?.value != null) notify('error', t('notice.invalidValue', { text: r.value })); return; }
    ctx.change('op.edit', () => { v.brokenOut = { x0, y0, x1, y1, depth }; });
    notify('success', t('drawing.brokenOutMade'));
  }

  async function breakCmd(d) {
    const v = targetView(d);
    if (!v) { notify('info', t('notice.needParentView')); return; }
    if (v.break) { ctx.change('op.edit', () => { delete v.break; }); notify('info', t('drawing.breakRemoved')); return; }
    const raw = rawBox(d, v); if (!raw) return;
    const def = defaultBreak(raw.box);
    const r = await ctx.popups.open('prompt', { title: t('cmd.breakView'), label: t('drawing.breakPrompt'), value: `${def.axis}, ${ctx.fmt(def.from, 2)}, ${ctx.fmt(def.to, 2)}` });
    if (r?.value == null) return;
    const parts = String(r.value).split(/[,\s]+/).filter(Boolean);
    const axis = parts[0]?.toLowerCase() === 'y' ? 'y' : 'x';
    const [from, to] = parts.slice(1).map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) { notify('error', t('notice.invalidValue', { text: r.value })); return; }
    ctx.change('op.edit', () => { v.break = { axis, from: Math.min(from, to), to: Math.max(from, to) }; });
    notify('success', t('drawing.breakMade'));
  }

  async function cropCmd(d) {
    const v = targetView(d);
    if (!v) { notify('info', t('notice.needParentView')); return; }
    if (v.crop) { ctx.change('op.edit', () => { delete v.crop; }); notify('info', t('drawing.cropRemoved')); return; }
    const raw = rawBox(d, v); if (!raw) return;
    const { box } = raw; const w = box.x1 - box.x0; const h = box.y1 - box.y0;
    const def = [box.x0, box.y0, box.x0 + w * 0.6, box.y0 + h * 0.6].map((x) => ctx.fmt(x, 2));
    const r = await ctx.popups.open('prompt', { title: t('cmd.cropView'), label: t('drawing.cropPrompt'), value: def.join(', ') });
    const [x0, y0, x1, y1] = numbers(r?.value);
    if (![x0, y0, x1, y1].every(Number.isFinite) || x0 === x1 || y0 === y1) { if (r?.value != null) notify('error', t('notice.invalidValue', { text: r.value })); return; }
    ctx.change('op.edit', () => { v.crop = { x0, y0, x1, y1 }; });
    notify('success', t('drawing.cropMade'));
  }

  function holeTableCmd(d) {
    if (d.holeTable && (d.holeTable.sheet ?? sheetsOf(d)[0].id) === activeSheetId(d)) { ctx.change('op.edit', () => { d.holeTable = null; }); return; }
    const v = targetView(d);
    if (!v) { notify('info', t('notice.needParentView')); return; }
    ctx.change('op.edit', () => { d.holeTable = { view: v.id, sheet: activeSheetId(d) }; });
    const rows = holeRowsOf(d);
    notify(rows?.length ? 'success' : 'info', rows?.length ? t('drawing.holeTableMade', { count: rows.length }) : t('drawing.noHoles'));
  }

  async function revisionCmd(d) {
    const r = await ctx.popups.open('prompt', { title: t('cmd.revisionTable'), label: t('drawing.revisionPrompt'), value: d.revisions?.length ? '' : t('drawing.firstIssue') });
    if (r?.value == null) return;
    let row;
    ctx.change('op.edit', () => { row = addRevision(d, { description: r.value, by: d.title?.drawnBy ?? '' }); d.revisionTable.sheet ??= activeSheetId(d); });
    notify('success', t('drawing.revisionAdded', { rev: row.rev }));
  }

  async function sheetCmd(d, cmd, arg) {
    if (cmd === 'sheet') { ctx.change('op.sheet', () => { setActiveSheet(d, arg); }); ctx.fitDrawing(); return ctx.renderDrawing(); }
    if (cmd === 'sheetAdd') {
      let s;
      ctx.change('op.sheet', () => { s = addSheet(d, `${t('sheet.name')}${sheetsOf(d).length + 1}`, ctx.newId('sheet')); });
      return notify('success', t('notice.sheetAdded', { name: s.name }));
    }
    const id = arg || activeSheetId(d);
    const sheet = sheetsOf(d).find((s) => s.id === id);
    if (!sheet) return undefined;
    if (cmd === 'sheetRename') {
      const r = await ctx.popups.open('prompt', { title: t('cmd.renameSheet'), label: t('pm.name'), value: sheet.name || '1' });
      if (r?.value) ctx.change('op.sheet', () => { if (!Array.isArray(d.sheets)) d.sheets = sheetsOf(d).map((s) => ({ ...s })); renameSheet(d, id, r.value); });
      return undefined;
    }
    if (cmd === 'sheetDelete') {
      if (sheetsOf(d).length < 2) { notify('info', t('notice.lastSheet')); return undefined; }
      const choice = await ctx.ask({ title: t('cmd.deleteSheet'), message: t('confirm.deleteSheet', { name: sheet.name }), icon: 'trash', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('action.delete'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return undefined;
      ctx.change('op.sheet', () => { deleteSheet(d, id); });
      return notify('info', t('notice.sheetDeleted', { name: sheet.name }));
    }
    return undefined;
  }

  const DRAWING_CMDS = new Set(['brokenOut', 'breakView', 'cropView', 'holeTable', 'revision', 'sheet', 'sheetAdd', 'sheetRename', 'sheetDelete']);
  function drawingAction(d, cmd, arg) {
    if (!DRAWING_CMDS.has(cmd)) return undefined;
    if (cmd === 'brokenOut') return brokenOutCmd(d);
    if (cmd === 'breakView') return breakCmd(d);
    if (cmd === 'cropView') return cropCmd(d);
    if (cmd === 'holeTable') return holeTableCmd(d);
    if (cmd === 'revision') return revisionCmd(d);
    return sheetCmd(d, cmd, arg);
  }

  const holeCache = new Map();
  /** Hole table rows of the active sheet's hole table (null when there is none). */
  function holeRowsOf(d) {
    const sd = sheetDrawing(d);
    const ht = sd.holeTable;
    const v = ht && sd.views.find((x) => x.id === ht.view);
    if (!v) return null;
    const { key, shape } = ctx.drawingShape(d);
    if (!shape) return null;
    const k = `${key}|${v.type}`;
    if (!holeCache.has(k)) {
      if (holeCache.size > 20) holeCache.clear();
      let rows = [];
      try { rows = holeTableRows(findHoles(shape), v, projectView(shape, v.type, v).box); } catch { rows = []; }
      holeCache.set(k, rows);
    }
    return holeCache.get(k);
  }

  const labels = () => Object.fromEntries(['holeTable.title', 'holeTable.tag', 'holeTable.x', 'holeTable.y', 'holeTable.size', 'rev.title', 'rev.rev', 'rev.description', 'rev.date', 'rev.by', 'sheet.label'].map((k) => [k, t(k)]));

  /** The active sheet, ready to draw: { sd (sheet drawing), projections (adjusted), opts (for sheetSvg / sheetDxf) }. */
  function sheetParts(d, opts = {}) {
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    const projections = ctx.drawingProjections(sd);
    return { sd, projections, opts: { ...opts, labels: { ...(opts.labels ?? {}), ...labels() }, holeRows: holeRowsOf(d) } };
  }

  const boCache = new Map();
  /** Hook for drawingProjections(): the crop / break / broken-out changes on top of the plain projections. */
  function adjust(d, projections) {
    const needs = (d.views ?? []).some((v) => v.crop || v.break || v.brokenOut);
    if (!needs) return projections;
    const { key, shape } = ctx.drawingShape(d);
    if (boCache.size > 30) boCache.clear();
    return adjustProjections(d, projections, { shape, key, cache: boCache });
  }

  function svg(d, opts = {}) { const s = sheetParts(d, opts); return sheetSvg(s.sd, s.projections, s.opts); }
  function dxf(d, opts = {}) { const s = sheetParts(d, opts); return sheetDxf(s.sd, s.projections, s.opts); }

  function sheetTabsHtml(d) {
    const list = sheetsOf(d); const active = activeSheetId(d);
    const tabs = list.map((s, i) => `<span class="more-sheet-tab ${s.id === active ? 'active' : ''}"><button class="more-sheet-name" data-drw="sheet:${escapeHtml(s.id)}" title="${escapeHtml(t('sheet.switchTip'))}">${icon('sheet', 'icon tiny')}<span>${escapeHtml(s.name || `${t('sheet.name')}${i + 1}`)}</span></button>${s.id === active ? `<button class="icon-button" data-drw="sheetRename:${escapeHtml(s.id)}" title="${escapeHtml(t('cmd.renameSheet'))}">${icon('sheetRename', 'icon tiny')}</button>${list.length > 1 ? `<button class="icon-button" data-drw="sheetDelete:${escapeHtml(s.id)}" title="${escapeHtml(t('cmd.deleteSheet'))}">${icon('sheetDelete', 'icon tiny')}</button>` : ''}` : ''}</span>`).join('');
    return `<div class="more-sheet-tabs" role="tablist">${tabs}<button class="icon-button" data-drw="sheetAdd" title="${escapeHtml(t('cmd.addSheet'))}">${icon('sheetAdd')}</button></div>`;
  }

  // ───────────────────────── commands

  const asmOpen = () => Boolean(asm());
  const twoComps = () => (asm()?.components.length ?? 0) > 1;
  const hasDrawing = () => Boolean(drw());
  const partBody = () => Boolean(part()) && !(state.editing?.mode === 'sketch');
  const commands = {
    linearComponentPattern: { icon: 'compLinPattern', label: 'cmd.linearComponentPattern', enabled: asmOpen, checked: () => editing()?.mode === 'compPattern' && editing().kind === 'linear', run: () => startPattern('linear') },
    circularComponentPattern: { icon: 'compCirPattern', label: 'cmd.circularComponentPattern', enabled: asmOpen, checked: () => editing()?.mode === 'compPattern' && editing().kind === 'circular', run: () => startPattern('circular') },
    mirrorComponents: { icon: 'compMirror', label: 'cmd.mirrorComponents', enabled: asmOpen, checked: () => editing()?.mode === 'compPattern' && editing().kind === 'mirror', run: () => startPattern('mirror') },
    smartMate: { icon: 'smartMate', label: 'cmd.smartMate', enabled: () => asmOpen() && twoComps(), checked: () => editing()?.mode === 'smartMate', run: () => (editing()?.mode === 'smartMate' ? ctx.cancelEditing({ quiet: true }) : startSmartMate()) },
    moveComponent: { icon: 'moveComponent', label: 'cmd.moveComponent', enabled: asmOpen, checked: () => editing()?.mode === 'moveComp', run: () => (editing()?.mode === 'moveComp' ? ctx.cancelEditing({ quiet: true }) : startMove()) },
    curvature: { icon: 'curvature', label: 'cmd.curvature', enabled: partBody, checked: () => state.evalDisplay?.kind === 'curvature', run: () => toggleEvaluate('curvature') },
    zebraStripes: { icon: 'zebra', label: 'cmd.zebraStripes', enabled: partBody, checked: () => state.evalDisplay?.kind === 'zebra', run: () => toggleEvaluate('zebra') },
    thicknessAnalysis: { icon: 'thickness', label: 'cmd.thicknessAnalysis', enabled: partBody, checked: () => state.evalDisplay?.kind === 'thickness', run: () => toggleEvaluate('thickness') },
    brokenOutSection: { icon: 'brokenOut', label: 'cmd.brokenOutSection', enabled: hasDrawing, run: () => drawingAction(drw(), 'brokenOut') },
    breakView: { icon: 'breakView', label: 'cmd.breakView', enabled: hasDrawing, run: () => drawingAction(drw(), 'breakView') },
    cropView: { icon: 'cropView', label: 'cmd.cropView', enabled: hasDrawing, run: () => drawingAction(drw(), 'cropView') },
    holeTable: { icon: 'holeTable', label: 'cmd.holeTable', enabled: hasDrawing, checked: () => { const d = drw(); return Boolean(d?.holeTable && (d.holeTable.sheet ?? sheetsOf(d)[0].id) === activeSheetId(d)); }, run: () => drawingAction(drw(), 'holeTable') },
    revisionTable: { icon: 'revisionTable', label: 'cmd.revisionTable', enabled: hasDrawing, run: () => drawingAction(drw(), 'revision') },
    addSheet: { icon: 'sheetAdd', label: 'cmd.addSheet', enabled: hasDrawing, run: () => drawingAction(drw(), 'sheetAdd') },
    renameSheet: { icon: 'sheetRename', label: 'cmd.renameSheet', enabled: hasDrawing, run: () => drawingAction(drw(), 'sheetRename') },
    deleteSheet: { icon: 'sheetDelete', label: 'cmd.deleteSheet', enabled: () => hasDrawing() && sheetsOf(drw()).length > 1, run: () => drawingAction(drw(), 'sheetDelete') },
  };

  /** Command ids per CommandManager tab (appended to the app's lists). */
  const TABS = {
    assembly: ['linearComponentPattern', 'circularComponentPattern', 'mirrorComponents', 'smartMate', 'moveComponent'],
    evaluate: ['curvature', 'zebraStripes', 'thicknessAnalysis'],
    drawing: ['brokenOutSection', 'breakView', 'cropView', 'holeTable', 'revisionTable', 'addSheet', 'renameSheet', 'deleteSheet'],
  };

  return {
    commands, TABS, owns, pm, pick, field, set, toggle, accept, handles, command, subject, afterSolve,
    colours, onCamera, simStudy, studyOptions, simPm, runSim, simSet,
    drawingAction, adjust, svg, dxf, sheetTabsHtml, sheetDrawing: (d) => { adoptToActiveSheet(d); return sheetDrawing(d); },
  };
}

