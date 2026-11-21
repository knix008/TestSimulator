// The main window's side of the later professional tools (app.js hands in `ctx`; withSim2() puts these hooks
// next to app-more.js's, so app.js calls one `more` object):
//   simulation — nonlinear static, drop test, load-case combination and flow studies in the Simulation
//     PropertyManager (cad/fea-sim2.js); flow results as a coloured section plane and streamlines;
//   model-based definition — 3D dimensions, tolerances, GD&T frames, datums and notes on faces / edges, shown as
//     screen-facing labels, listed in the tree, edited in a PropertyManager, the auto dimension scheme, and
//     "insert model annotations" into a drawing (cad/mbd.js);
//   version history — a version on every save, the history page (compare, roll back), check-out / check-in and
//     where used (cad/versions.js);
//   assembly extras — assembly cuts and holes through components, belts and chains, sketch blocks, sketch
//     pictures and library features (cad/asm-extra.js).
import * as THREE from 'three';
import './styles-sim.css';
import { rep } from './cad/kernel.js';
import { nonlinearStatic, dropTest, combinationStudy, flowField, flowSection, streamlines, FLUIDS } from './cad/fea-sim2.js';
import { stressColor } from './cad/fea.js';
import { materialOf, materialName } from './cad/materials.js';
import { faceSignature, edgeSignature, findFace, findEdges, isCylinder } from './cad/refs.js';
import { axisOfFace, placePoint, placeDir } from './cad/assembly.js';
import { faceRef } from './cad/features.js';
import { layoutViews, viewBasis } from './cad/drawing.js';
import {
  createAnnotation, editAnnotation, removeAnnotation, resolveAnnotations, annotationsOf, annotationText, labelHtml, autoDimensionScheme,
  toDrawingAnnotations, insertIntoDrawing, GDT_GLYPHS, TOL_TYPES,
} from './cad/mbd.js';
import { addVersion, versionsOf, compareVersions, rollbackTo, checkOut, checkIn, isReadOnly, setRequireCheckout, requiresCheckout, whereUsed } from './cad/versions.js';
import {
  createAsmFeature, asmFeatureTool, cutComponent, featureActsOn, beltPath, beltMesh, chainLinks, createBelt,
  makeBlock, insertBlock, blockInstances, explodeBlock, pictureCorners, normalisePicture, makeLibraryItem, insertLibraryItem, loadLibrary, saveLibrary,
} from './cad/asm-extra.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const SIM_STUDIES = ['nonlinear', 'drop', 'combination', 'flow'];
const MODES = new Set(['mbd', 'versions', 'asmFeature', 'belt', 'libInsert']);
const AXES = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };
const AUTHOR_KEY = 'mymechanics.vault.author';
const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createSim2Tools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const part = () => ctx.activePart();
  const asm = () => ctx.activeAssembly();
  const editing = () => state.editing;
  const vp = () => ctx.viewport();
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  const isSim = (e) => e?.mode === 'simulation' && SIM_STUDIES.includes(e.study);
  const owns = (e) => Boolean(e && (MODES.has(e.mode) || isSim(e)));
  const author = () => { try { return storage()?.getItem(AUTHOR_KEY) || t('ver.defaultAuthor'); } catch { return t('ver.defaultAuthor'); } };

  // ───────────────────────── simulation studies

  const DEFAULTS = {
    nonlinear: { steps: 8, tangentModulus: 0, plastic: true, geometric: true, resolution: 20 },
    drop: { height: 1000, dropDir: '-z', resolution: 24 },
    combination: { cases: [], method: 'linear', resolution: 30 },
    flow: { flowMode: 'external', flowAxis: 'x', flowSign: 1, velocity: 1, fluid: 'air', resolution: 12, quantity: 'velocity', showStreams: true },
  };

  function initStudy(e) {
    for (const [k, v] of Object.entries(DEFAULTS[e.study] ?? {})) if (e[k] === undefined) e[k] = Array.isArray(v) ? [] : v;
  }

  function feaMaterial(p) {
    const m = materialOf(p.material);
    return { E: m.E * 1000, nu: m.nu ?? 0.3, yield: m.yield, density: m.density, ultimate: m.ultimate, group: m.group };
  }
  const loadsOf = (e) => e.loads.map((l) => (e.loadKind === 'pressure' ? { faceId: l.faceId, pressure: e.magnitude / e.loads.length } : { faceId: l.faceId, force: AXES[e.dir].map((v) => (v * e.magnitude) / e.loads.length) }));
  const faceName = (x, i) => `${t('pm.face')} ${i + 1} (${x.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`;

  function stressColours(values) {
    const sorted = Float32Array.from(values).sort();
    const top = sorted[Math.floor(sorted.length * 0.98)] || sorted.at(-1) || 1;
    const colors = new Float32Array(values.length * 3);
    values.forEach((v, i) => colors.set(stressColor(v, 0, top), i * 3));
    return { colors, top };
  }

  async function runSim(e, p, entry) {
    initStudy(e);
    const material = feaMaterial(p);
    const resolution = Math.max(6, Math.min(e.study === 'flow' ? 32 : 60, Math.round(e.resolution)));
    if (['nonlinear', 'combination'].includes(e.study) && !e.fixtures.length) { notify('error', t('sim.error.no-fixtures')); return; }
    if (e.study === 'nonlinear' && !e.loads.length) { notify('error', t('sim.error.no-loads')); return; }
    if (e.study === 'combination' && !e.cases.length) { notify('error', t('sim2.noCases')); return; }
    const result = await ctx.withProgress('progress.simulation', p.name, async (op, report) => {
      await new Promise((r) => setTimeout(r, 30));
      const onProgress = (f) => report({ fraction: f, text: t('progress.solving') });
      if (e.study === 'nonlinear') return nonlinearStatic(entry.mesh, { material: { ...material, tangentModulus: e.tangentModulus > 0 ? e.tangentModulus : material.E / 20, plastic: e.plastic }, fixtures: e.fixtures.map((x) => x.faceId), loads: loadsOf(e), resolution, steps: Math.max(1, Math.min(40, Math.round(e.steps))), geometric: e.geometric, onProgress });
      if (e.study === 'drop') return dropTest(entry.mesh, { material, height: e.height, direction: AXES[e.dropDir], resolution, onProgress });
      if (e.study === 'combination') return combinationStudy(entry.mesh, { material, fixtures: e.fixtures.map((x) => x.faceId), cases: e.cases.map((c) => ({ name: c.name, loads: c.loads, factor: c.factor })), resolution, method: e.method, onProgress });
      return flowField(entry.mesh, { mode: e.flowMode, axis: e.flowAxis, sign: e.flowSign, resolution, velocity: e.velocity, fluid: e.fluid, maxSteps: 2500, onProgress });
    }, { delay: 150 });
    if (!result) return;
    if (result.error && result.error !== 'not-converged') { notify('error', t(`sim2.error.${result.error}`, null, t(`sim.error.${result.error}`, null, result.error))); return; }
    if (result.error === 'not-converged') notify('warning', t('sim.error.not-converged'));
    e.result = result;
    if (e.study === 'flow') {
      state.sim = null;
      state.flow = { partId: p.id, key: entry.key, result, quantity: e.quantity, showStreams: e.showStreams };
      buildFlowDisplay();
      notify('success', t('sim2.flowDone', { drag: fmt(result.dragForce, 4), dp: fmt(result.pressureDrop, 3) }));
    } else {
      state.flow = null;
      const { colors, top } = stressColours(result.vertexStress);
      const size = entry.size ?? 100;
      const scale = e.study === 'nonlinear' ? 1 : result.maxDisplacement > 0 ? (size * 0.08) / result.maxDisplacement : 1;
      state.sim = { partId: p.id, key: entry.key, result, colors, top, deformed: e.study === 'nonlinear', scale, study: e.study };
      if (e.study === 'drop') notify(result.minFactorOfSafety < 1 ? 'warning' : 'success', t('sim2.dropDone', { stress: fmt(result.peakStress, 1), time: fmt(result.peakStressTime * 1e6, 1) }));
      else notify(result.minFactorOfSafety < 1 ? 'warning' : 'success', t('notice.simDone', { fos: fmt(result.minFactorOfSafety, 2) }));
    }
    ctx.syncView(); ctx.renderLeft();
  }

  /** A small SVG line chart of a time history (drop test). */
  function chart(xs, series) {
    const W = 240, H = 90;
    const xmax = Math.max(...xs, 1e-30);
    const paths = series.map(({ ys, cls }) => {
      const ymax = Math.max(...ys.map(Math.abs), 1e-30);
      return `<polyline class="${cls}" points="${xs.map((x, i) => `${((x / xmax) * W).toFixed(1)},${(H - (Math.abs(ys[i]) / ymax) * (H - 4)).toFixed(1)}`).join(' ')}"/>`;
    }).join('');
    return `<svg class="sim2-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${paths}</svg>`;
  }

  function studySelector(e) {
    const { pmGroup, pmSeg } = ctx.pm;
    return pmGroup('simulation', t('sim.study'), pmSeg('study', [['static', t('sim.static')], ['thermal', t('sim.thermal')], ['modal', t('sim.modal')], ...(ctx.baseStudyOptions?.() ?? []), ...studyOptions()], e.study));
  }

  function simPm(e) {
    initStudy(e);
    const { pmHead, pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const p = part();
    const mat = materialOf(p.material);
    const material = pmGroup('material', t('sim.material'), `<p class="pm-note">${escapeHtml(`${materialName(p.material, ctx.lang())} · E ${mat.E} GPa · σy ${mat.yield} MPa · ρ ${mat.density} kg/m³`)}</p>`);
    const fix = pmGroup('fixture', t('sim.fixtures'), pmList('fixtures', e.fixtures.map(faceName), t('sim.fixedFaces'), 'fixture', e.pick === 'fixtures'));
    const loadGroup = pmGroup('load', t('sim.loads'), `${pmSeg('loadKind', [['force', t('sim.force')], ['pressure', t('sim.pressure')]], e.loadKind)}${pmList('loads', e.loads.map(faceName), t('sim.loadFaces'), 'load', e.pick === 'loads')}${pmNum('magnitude', e.magnitude, e.loadKind === 'pressure' ? `${t('sim.pressure')} (MPa)` : `${t('sim.force')} (N)`, 'load')}${e.loadKind === 'force' ? pmSeg('dir', Object.keys(AXES).map((k) => [k, k.toUpperCase()]), e.dir) : ''}`);
    const r = e.result;
    const run = `<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>`;
    const clear = `<div class="pm-row">${pmButton('clearSim', 'trash', t('sim.clear'))}</div>`;
    const dl = (rows) => `<dl class="pm-results">${rows.map(([k, v, cls = '']) => `<dt>${escapeHtml(k)}</dt><dd class="${cls}">${escapeHtml(v)}</dd>`).join('')}</dl>`;
    const legend = (lo, hi) => `<div class="sim-legend"><span>${escapeHtml(lo)}</span><i></i><span>${escapeHtml(hi)}</span></div>`;
    const head = (glyph, help) => pmHead(glyph, t('cmd.simulation'), t(help));
    if (e.study === 'nonlinear') {
      const res = r ? pmGroup('sim2Nonlinear', t('sim.results'), `${dl([[t('sim.maxStress'), `${fmt(r.maxStress, 2)} MPa`], [t('sim.maxDisp'), `${fmt(r.maxDisplacement, 4)} mm`], [t('sim.fos'), fmt(r.minFactorOfSafety, 2), r.minFactorOfSafety < 1 ? 'error' : ''], [t('sim2.yielded'), `${fmt(100 * r.plasticFraction, 1)} %`], [t('sim2.newton'), String(r.newtonIterations)], [t('sim.elements'), `${r.elements} (${fmt(r.elementSize, 2)} mm)`]])}
        <table class="sim2-table"><tr><th>${escapeHtml(t('sim2.loadFactor'))}</th><th>${escapeHtml(t('sim.maxDisp'))}</th><th>${escapeHtml(t('sim.maxStress'))}</th></tr>${r.curve.map((c) => `<tr><td>${fmt(c.factor, 2)}</td><td>${fmt(c.maxDisplacement, 4)}</td><td>${fmt(c.maxStress, 1)}</td></tr>`).join('')}</table>
        ${legend('0', `${fmt(state.sim?.top ?? r.maxStress, 1)} MPa`)}${clear}`) : '';
      return [head('sim2Nonlinear', 'pm.help.nonlinear'), studySelector(e), material, fix, loadGroup,
        pmGroup('sim2Nonlinear', t('sim2.nonlinearOptions'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="geometric" ${e.geometric ? 'checked' : ''}/>${icon('sim2Nonlinear')}<span>${escapeHtml(t('sim2.largeDisplacement'))}</span></label><label class="pm-check"><input type="checkbox" data-pm-toggle="plastic" ${e.plastic ? 'checked' : ''}/>${icon('material')}<span>${escapeHtml(t('sim2.plastic'))}</span></label>${e.plastic ? pmNum('tangentModulus', e.tangentModulus || Math.round(mat.E * 50), `${t('sim2.tangentModulus')} (MPa)`, 'material') : ''}${pmNum('steps', e.steps, t('sim2.steps'), 'statistics')}`),
        pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}${run}`), res].join('');
    }
    if (e.study === 'drop') {
      const res = r ? pmGroup('sim2Drop', t('sim.results'), `${dl([[t('sim2.impactVelocity'), `${fmt(r.impactVelocity / 1000, 3)} m/s`], [t('sim2.peakStress'), `${fmt(r.peakStress, 1)} MPa`, r.minFactorOfSafety < 1 ? 'error' : ''], [t('sim2.peakTime'), `${fmt(r.peakStressTime * 1e6, 1)} µs`], [t('sim2.peakDeformation'), `${fmt(r.peakDeformation, 4)} mm`], [t('sim2.contactTime'), `${fmt(r.contactDuration * 1e6, 1)} µs`], [t('sim2.impulse'), `${fmt(r.impulse, 4)} N·s`], [t('sim2.rebound'), `${fmt(r.reboundVelocity / 1000, 3)} m/s`], [t('sim.fos'), fmt(r.minFactorOfSafety, 2)], [t('sim2.timeStep'), `${fmt(r.dt * 1e9, 1)} ns × ${r.steps}`]])}
        ${chart(r.time, [{ ys: r.stress, cls: 'stress' }, { ys: r.force, cls: 'force' }])}<p class="pm-note sim2-chart-key"><i class="stress"></i>${escapeHtml(t('sim2.stressOverTime'))} <i class="force"></i>${escapeHtml(t('sim2.forceOverTime'))}</p>${legend('0', `${fmt(state.sim?.top ?? r.peakStress, 1)} MPa`)}${clear}`) : '';
      return [head('sim2Drop', 'pm.help.drop'), studySelector(e), material,
        pmGroup('sim2Drop', t('sim2.dropSetup'), `${pmNum('height', e.height, `${t('sim2.dropHeight')} (mm)`, 'sim2Drop')}${pmSeg('dropDir', Object.keys(AXES).map((k) => [k, k.toUpperCase()]), e.dropDir)}<p class="pm-note">${escapeHtml(t('sim2.dropNote'))}</p>`),
        pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}${run}`), res].join('');
    }
    if (e.study === 'combination') {
      const cases = e.cases.map((c, i) => `<div class="sim2-case"><span class="sim2-case-name">${icon('load', 'icon tiny')}${escapeHtml(c.name)}</span>${ctx.pm.textInput(`factor:${i}`, String(c.factor), 'sim2-factor')}<button class="icon-button" data-pm="sim2.delCase:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
      const res = r ? pmGroup('sim2Combine', t('sim.results'), `${dl([[t('sim.maxStress'), `${fmt(r.maxStress, 2)} MPa`], [t('sim.maxDisp'), `${fmt(r.maxDisplacement, 4)} mm`], [t('sim.fos'), fmt(r.minFactorOfSafety, 2), r.minFactorOfSafety < 1 ? 'error' : ''], ...(r.caseResults ?? []).map((c) => [`${c.name} ×${fmt(c.factor, 2)}`, `${fmt(c.maxStress, 1)} MPa`])])}${legend('0', `${fmt(state.sim?.top ?? r.maxStress, 1)} MPa`)}${clear}`) : '';
      return [head('sim2Combine', 'pm.help.combination'), studySelector(e), material, fix, loadGroup,
        pmGroup('sim2Combine', t('sim2.cases'), `${cases || `<p class="pm-note">${escapeHtml(t('sim2.noCases'))}</p>`}<div class="pm-row">${pmButton('sim2.addCase', 'plus', t('sim2.addCase'))}</div>${pmSeg('method', [['linear', t('sim2.linear')], ['srss', t('sim2.srss')]], e.method)}`),
        pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim.resolution'), 'statistics')}${run}`), res].join('');
    }
    // flow
    const res = r ? pmGroup('sim2Flow', t('sim.results'), `${dl([
      ...(e.flowMode === 'external' ? [[t('sim2.drag'), `${fmt(r.dragForce, 5)} N`], [t('sim2.dragCoefficient'), fmt(r.dragCoefficient, 3)], [t('sim2.frontalArea'), `${fmt(r.frontalArea, 1)} mm²`]] : [[t('sim2.hydraulicDiameter'), `${fmt(r.hydraulicDiameter, 2)} mm`]]),
      [t('sim2.pressureDrop'), `${fmt(r.pressureDrop, 4)} Pa`], [t('sim2.maxVelocity'), `${fmt(r.maxVelocity, 3)} m/s`],
      [t('sim2.reynolds'), `${fmt(r.reynolds, 1)}${r.capped ? ` → ${fmt(r.reynoldsSimulated, 0)}` : ''}`, r.capped ? 'warn' : ''], [t('sim2.cells'), `${r.dims.join('×')} (${fmt(r.h, 2)} mm)`], [t('sim2.lbmSteps'), `${r.steps}${r.converged ? '' : ' !'}`]])}
      ${r.capped ? `<p class="pm-note">${escapeHtml(t('sim2.reCapped'))}</p>` : ''}${pmSeg('quantity', [['velocity', t('sim2.velocity')], ['pressure', t('sim2.pressureField')]], e.quantity)}<label class="pm-check"><input type="checkbox" data-pm-toggle="showStreams" ${e.showStreams ? 'checked' : ''}/>${icon('sim2Flow')}<span>${escapeHtml(t('sim2.streamlines'))}</span></label>${legend(`${fmt(state.flow?.section?.min ?? 0, 3)}`, `${fmt(state.flow?.section?.max ?? 1, 3)} ${e.quantity === 'pressure' ? 'Pa' : 'm/s'}`)}${clear}`) : '';
    return [head('sim2Flow', 'pm.help.flow'), studySelector(e),
      pmGroup('sim2Flow', t('sim2.flowSetup'), `${pmSeg('flowMode', [['external', t('sim2.external')], ['internal', t('sim2.internal')]], e.flowMode)}${pmSeg('flowAxis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], e.flowAxis)}${pmSeg('flowSign', [['1', '+'], ['-1', '−']], String(e.flowSign))}${pmNum('velocity', e.velocity, `${t('sim2.velocity')} (m/s)`, 'sim2Flow')}${pmSeg('fluid', [['air', t('sim2.air')], ['water', t('sim2.water')]], e.fluid)}`),
      pmGroup('statistics', t('sim.mesh'), `${pmNum('resolution', e.resolution, t('sim2.flowResolution'), 'statistics')}<p class="pm-note">${escapeHtml(t('sim2.flowNote'))}</p>${run}`), res].join('');
  }

  function buildFlowDisplay() {
    const f = state.flow;
    if (!f?.result) return;
    const r = f.result, fa = r.flowAxis;
    // The section: the plane through the middle across the first lateral axis (Z-up: a vertical plane for flow along X or Y).
    const lateral = [0, 1, 2].filter((a) => a !== fa);
    const normalAxis = lateral.includes(1) && fa !== 1 ? 1 : lateral[0];
    f.section = flowSection(r, { normalAxis, quantity: f.quantity });
    f.streams = f.showStreams ? streamlines(r, { count: 6 }) : null;
  }

  function simSet(e, key, value) {
    if (key === 'study') {
      e.study = value; e.result = null; state.sim = null; state.flow = null;
      if (SIM_STUDIES.includes(value)) initStudy(e);
      ctx.syncView(); ctx.renderLeft(); return;
    }
    if (key === 'flowSign') e.flowSign = Number(value) < 0 ? -1 : 1;
    else e[key] = value;
    if (key === 'loadKind') e.pick = 'loads';
    if (key === 'quantity' && state.flow) { state.flow.quantity = value; buildFlowDisplay(); ctx.syncView(); }
    ctx.renderLeft();
  }

  function simPick(hit) {
    const e = editing();
    if (hit?.kind !== 'face' || hit.bodyKey !== 'body') { notify('info', t('notice.pickFace')); return; }
    const face = state.partEntry?.faces?.[hit.index];
    if (!face || !['fixtures', 'loads'].includes(e.pick)) return;
    const list = e.pick === 'loads' ? e.loads : e.fixtures;
    const i = list.findIndex((x) => x.index === hit.index);
    if (i >= 0) list.splice(i, 1); else list.push({ index: hit.index, faceId: face.hashCode, type: face.geomType });
    vp()?.setSelection([...e.fixtures, ...e.loads].map((x) => ({ kind: 'face', bodyKey: 'body', index: x.index })));
    ctx.renderLeft();
  }

  function addCase() {
    const e = editing();
    if (!e.loads.length) { notify('error', t('sim.error.no-loads')); return; }
    const n = e.cases.length + 1;
    e.cases.push({ name: `${t('sim2.case')}${n} (${fmt(e.magnitude, 1)} ${e.loadKind === 'pressure' ? 'MPa' : `N ${e.dir.toUpperCase()}`})`, loads: loadsOf(e), factor: 1 });
    e.result = null;
    notify('success', t('sim2.caseAdded', { n }));
    ctx.renderLeft();
  }

  const studyOptions = () => [['nonlinear', t('sim2.nonlinear')], ['drop', t('sim2.dropTest')], ['combination', t('sim2.combination')], ['flow', t('sim2.flow')]];

  async function openStudy(study) {
    if (editing()?.mode !== 'simulation') await ctx.runCommand('simulation');
    const e = editing();
    if (e?.mode !== 'simulation') return;
    simSet(e, 'study', study);
  }

  // ───────────────────────── model-based definition

  /** The geometry of a picked face / edge for mbd.js. */
  function faceInfo(face) {
    const sig = faceSignature(face);
    const info = { type: sig.type, center: sig.center, normal: sig.normal, area: sig.area, radius: sig.radius };
    if (isCylinder(face.geomType)) {
      const ax = axisOfFace(face);
      if (ax) info.axis = ax;
      try { const p = face.pointOnSurface(0.5, 0.5); info.point = [p.x, p.y, p.z]; } catch { /* no point */ }
    }
    return { type: 'face', sig, info };
  }
  function edgeInfo(edge) {
    const sig = edgeSignature(edge);
    return { type: 'edge', sig, info: { ...sig } };
  }

  const resolvedKey = new WeakMap();
  /** Refreshes the part's annotations against its current body (once per rebuild). */
  function resolveMbd(p, entry) {
    if (!annotationsOf(p).length || !entry?.body) return;
    const key = `${entry.key}|${JSON.stringify(annotationsOf(p).map((a) => a.refs))}`;
    if (resolvedKey.get(p) === key) return;
    resolvedKey.set(p, key);
    const size = entry.size ?? 100;
    resolveAnnotations(p, (r) => {
      try {
        if (r.type === 'edge') { const e = findEdges(entry.body, [r.sig])?.[0]; return e ? edgeInfo(e).info : null; }
        const f = findFace(entry.body, r.sig);
        return f ? faceInfo(f).info : null;
      } catch { return null; }
    }, size);
  }

  function startMbd(selectId = null) {
    const p = part();
    if (!p || !state.partEntry?.mesh) { notify('info', t('notice.noBody')); return; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'mbd', adding: null, refs: [], selected: selectId ?? annotationsOf(p)[0]?.id ?? null };
    state.leftTab = 'pm';
    ctx.syncView(); ctx.renderAll();
  }

  async function mbdCreate(e) {
    const p = part();
    const kind = e.adding;
    const opts = { size: state.partEntry?.size ?? 100, label: t(`mbd.kind.${kind}`) };
    if (kind === 'note') {
      const r = await ctx.popups.open('prompt', { title: t('mbd.kind.note'), label: t('ann.text'), value: t('ann.defaultNote') });
      if (r?.value == null) { e.adding = null; e.refs = []; ctx.renderLeft(); return; }
      opts.text = r.value;
    }
    if (kind === 'gdt') opts.datums = annotationsOf(p).filter((a) => a.kind === 'datum').map((a) => a.letter).slice(0, 3);
    let made = null;
    const refs = e.refs;
    e.adding = null; e.refs = [];
    ctx.change('op.mbd', () => { made = createAnnotation(p, kind, refs, opts); });
    if (kind === 'dimension' && !(made.value > 0)) notify('warning', t('mbd.noMeasure'));
    else notify('success', t('mbd.added', { text: annotationText(made) }));
    e.selected = made.id;
    vp()?.setSelection([]);
    ctx.renderLeft();
  }

  function mbdPick(hit) {
    const e = editing();
    if (!e.adding) { notify('info', t('mbd.chooseKind')); return; }
    if ((hit?.kind !== 'face' && hit?.kind !== 'edge') || hit.bodyKey !== 'body') { notify('info', t('notice.pickFace')); return; }
    const entry = state.partEntry;
    const shape = hit.kind === 'face' ? entry.faces?.[hit.index] : entry.edgeList?.[hit.index];
    if (!shape) return;
    e.refs.push(hit.kind === 'face' ? faceInfo(shape) : edgeInfo(shape));
    vp()?.setSelection([{ kind: hit.kind, bodyKey: 'body', index: hit.index }]);
    const need = e.adding === 'dimension' ? 2 : 1;
    if (e.refs.length >= need) mbdCreate(e);
    else { notify('info', t('mbd.pickSecond')); ctx.renderLeft(); }
  }

  function autoDimension() {
    const p = part(); const entry = state.partEntry;
    if (!p || !entry?.body) { notify('info', t('notice.noBody')); return; }
    let box;
    try { box = entry.body.boundingBox.bounds; } catch { return; }
    const faces = entry.faces.map((f) => faceInfo(f));
    let added = [];
    const labels = Object.fromEntries(['dimension', 'gdt', 'datum', 'note'].map((k) => [k, t(`mbd.kind.${k}`)]));
    ctx.change('op.mbd', () => { added = autoDimensionScheme(p, { box, faces }, { size: entry.size, labels }); });
    notify(added.length ? 'success' : 'info', t('mbd.autoDone', { count: added.length }));
    if (editing()?.mode === 'mbd') { editing().selected = added[0]?.id ?? null; ctx.renderLeft(); }
  }

  function mbdPm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmButton, textInput } = ctx.pm;
    const p = part();
    const list = annotationsOf(p);
    const kinds = ['dimension', 'gdt', 'datum', 'note'];
    const glyph = { dimension: 'mbdDimension', gdt: 'gdt', datum: 'datum', note: 'note' };
    const add = `<div class="pm-relations">${kinds.map((k) => `<button class="small-button ${e.adding === k ? 'active' : ''}" data-pm="mbd.add:${k}">${icon(glyph[k])}<span>${escapeHtml(t(`mbd.kind.${k}`))}</span></button>`).join('')}</div>${e.adding ? `<p class="pm-note">${escapeHtml(t(e.adding === 'dimension' ? 'mbd.pickTwo' : 'mbd.pickOne'))}</p>${e.adding === 'dimension' && e.refs.length === 1 ? `<div class="pm-row">${pmButton('mbd.one', 'check', t('mbd.useOne'))}</div>` : ''}` : ''}`;
    const rows = list.map((a) => `<li class="${a.id === e.selected ? 'active' : ''} ${a.dangling ? 'error' : ''}"><button class="sim2-row" data-pm="mbd.sel:${escapeHtml(a.id)}">${icon(glyph[a.kind], 'icon tiny')}<span>${escapeHtml(`${a.name}: ${annotationText(a)}`)}</span></button></li>`).join('');
    const a = list.find((x) => x.id === e.selected);
    let edit = '';
    if (a) {
      const del = `<div class="pm-row">${pmButton(`mbd.del:${a.id}`, 'trash', t('action.delete'))}</div>`;
      if (a.kind === 'dimension') edit = `${pmNum('mbd.value', a.value, `${t('mbd.nominal')} (mm)`, 'smartDim')}${pmSeg('mbd.tolType', TOL_TYPES.map((x) => [x, t(`mbd.tol.${x}`)]), a.tol?.type ?? 'none')}${a.tol?.type !== 'none' ? `${pmNum('mbd.plus', a.tol.plus, t(a.tol.type === 'symmetric' ? 'mbd.tolerance' : 'mbd.upper'), 'smartDim')}${a.tol.type !== 'symmetric' ? pmNum('mbd.minus', a.tol.minus, t('mbd.lower'), 'smartDim') : ''}` : ''}<label class="pm-field">${icon('note')}<span class="pm-label">${escapeHtml(t('mbd.prefix'))}</span>${textInput('mbd.prefix', a.prefix ?? '')}</label>`;
      else if (a.kind === 'gdt') edit = `${pmSeg('mbd.symbol', Object.entries(GDT_GLYPHS).map(([k, g]) => [k, g]), a.symbol)}<label class="pm-field">${icon('gdt')}<span class="pm-label">${escapeHtml(t('mbd.tolerance'))}</span>${textInput('mbd.tolerance', a.tolerance)}</label><label class="pm-field">${icon('datum')}<span class="pm-label">${escapeHtml(t('mbd.datums'))}</span>${textInput('mbd.datums', (a.datums ?? []).join(', '))}</label><label class="pm-check"><input type="checkbox" data-pm-toggle="mbd.diameterZone" ${a.diameterZone ? 'checked' : ''}/>${icon('gdt')}<span>${escapeHtml(t('mbd.diameterZone'))}</span></label>`;
      else if (a.kind === 'datum') edit = `<label class="pm-field">${icon('datum')}<span class="pm-label">${escapeHtml(t('mbd.letter'))}</span>${textInput('mbd.letter', a.letter)}</label>`;
      else edit = `<label class="pm-field">${icon('note')}<span class="pm-label">${escapeHtml(t('ann.text'))}</span>${textInput('mbd.text', a.text)}</label>`;
      edit = pmGroup(glyph[a.kind], `${a.name}${a.dangling ? ` — ${t('mbd.dangling')}` : ''}`, `${edit}<label class="pm-field">${icon('edit')}<span class="pm-label">${escapeHtml(t('pm.name'))}</span>${textInput('mbd.name', a.name)}</label>${del}`);
    }
    return [pmHead('mbdAnnotations', t('cmd.mbdAnnotations'), t('pm.help.mbd')),
      pmGroup('plus', t('mbd.add'), add),
      pmGroup('mbdAuto', t('cmd.mbdAutoDimension'), `<p class="pm-note">${escapeHtml(t('mbd.autoNote'))}</p><div class="pm-row">${pmButton('mbd.auto', 'mbdAuto', t('cmd.mbdAutoDimension'))}</div>`),
      pmGroup('mbdAnnotations', `${t('mbd.list')} (${list.length})`, `${list.length ? `<ul class="pm-list sim2-list">${rows}</ul>` : `<p class="pm-note">${escapeHtml(t('mbd.none'))}</p>`}<label class="pm-check"><input type="checkbox" data-pm-toggle="mbd.show" ${p.mbdHidden ? '' : 'checked'}/>${icon('eye')}<span>${escapeHtml(t('mbd.show'))}</span></label>`),
      edit].join('');
  }

  function mbdField(key, raw) {
    const e = editing(); const p = part();
    const field = key.slice(4);
    ctx.change('op.mbd', () => { editAnnotation(p, e.selected, field, raw); });
  }

  /** Labels and leader lines of the part's annotations in the 3D view. */
  function mbdDisplay(p, entry, lines, labels) {
    if (p.mbdHidden || !annotationsOf(p).length) return;
    resolveMbd(p, entry);
    const sel = editing()?.mode === 'mbd' ? editing().selected : null;
    const treeSel = new Set(state.selection.map((s) => s.key));
    const seg = [];
    for (const a of annotationsOf(p)) {
      const at = a.at, to = at.map((v, i) => v + (a.offset?.[i] ?? 0));
      seg.push(...at, ...to);
      const active = a.id === sel || treeSel.has(`mbd:${a.id}`);
      labels.push({ id: `mbd-${a.id}`, at: to, html: labelHtml(a, escapeHtml), className: `mbd-label mbd-${a.kind} ${active ? 'active' : ''} ${a.dangling ? 'dangling' : ''}`, title: escapeHtml(a.name) });
    }
    lines.push({ segments: seg, color: '#c0392b', width: 1.2, depthTest: false });
    const anchors = annotationsOf(p).flatMap((a) => a.at);
    lines.push({ points: anchors, color: '#c0392b', size: 5 });
  }

  // ───────────────────────── drawing: insert model annotations

  function insertModelAnnotations() {
    const d = ctx.activeDrawing();
    if (!d) return;
    const src = d.source?.kind === 'part' ? ctx.project().parts.find((x) => x.id === d.source.id) : null;
    if (!src) { notify('info', t('mbd.drawingNeedsPart')); return; }
    const list = annotationsOf(src);
    if (!list.length) { notify('info', t('mbd.none')); return; }
    const sd = ctx.sheetDrawing(d);
    const plain = sd.views.filter((v) => !v.kind && v.type !== 'custom');
    const v = plain.find((x) => x.id === state.drawingSelected) ?? plain.find((x) => x.type === 'front') ?? plain[0];
    if (!v) { notify('info', t('notice.needParentView')); return; }
    const projections = ctx.drawingProjections(sd);
    const pr = projections.get(v.id);
    if (!pr) return;
    const { scale, places } = layoutViews(sd, projections);
    const place = places.get(v.id);
    const b = viewBasis(v);
    const cx = (pr.box.x0 + pr.box.x1) / 2, cy = (pr.box.y0 + pr.box.y1) / 2;
    const k = scale * (Number(v.scale) > 0 ? Number(v.scale) : 1);
    const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const toSheet = (p) => [place.cx + k * (dot(p, b.x) - cx), place.cy - k * (dot(p, b.y) - cy)];
    const entry = ctx.buildPart(src);
    const infoOf = (r) => { try { if (r.type === 'edge') { const e = findEdges(entry.body, [r.sig])?.[0]; return e ? edgeInfo(e).info : null; } const f = findFace(entry.body, r.sig); return f ? faceInfo(f).info : null; } catch { return null; } };
    // Only what faces the view: annotations whose anchor normal is not along the line of sight.
    const shown = list;
    const items = toDrawingAnnotations(shown, { toSheet, newId: ctx.newId, infoOf, decimals: 2 });
    let n = 0;
    ctx.change('op.annotation', () => { n = insertIntoDrawing(d, items); });
    ctx.renderDrawing();
    notify('success', t('mbd.inserted', { count: n }));
  }

  // ───────────────────────── version history, check-out, where used

  const versionCache = new WeakMap();
  function beforeSave(d) {
    if (!d?.project) return;
    const e = editing();
    const comment = state.nextVersionComment ?? '';
    const r = addVersion(d.project, { author: author(), comment, thumbnail: ctx.projectThumbnail?.() ?? null });
    if (r.added) { state.nextVersionComment = ''; notify('info', t('ver.saved', { n: r.version.n })); }
    versionCache.set(d, d.project.versions);
    if (e?.mode === 'versions') ctx.renderLeft();
  }
  /** Undo / redo replace the project from snapshots taken before the last save: the version list is put back. */
  function keepVersions() {
    const d = ctx.doc?.();
    const cached = d && versionCache.get(d);
    if (cached && (versionsOf(d.project).length < cached.length)) d.project.versions = cached;
    else if (d?.project?.versions) versionCache.set(d, d.project.versions);
  }

  const activeRef = () => { const p = ctx.project(); return p?.active ? { kind: p.active.kind, id: p.active.id } : null; };
  const VAULT_OPS = new Set(['op.vault', 'op.rollbackVersion']);
  function blocks(labelKey) {
    const p = ctx.project();
    if (!p || VAULT_OPS.has(labelKey) || !requiresCheckout(p)) return false;
    const ref = activeRef();
    if (!ref || !isReadOnly(p, ref, author())) return false;
    notify('warning', t('ver.readOnly'));
    return true;
  }

  function startVersions() {
    if (!ctx.project()) return;
    if (editing()) ctx.cancelEditing({ quiet: true });
    const list = versionsOf(ctx.project());
    state.editing = { mode: 'versions', a: list.at(-1)?.n ?? null, b: 'current', diff: null };
    state.leftTab = 'pm';
    ctx.renderAll();
  }

  function volumeOfPart(pt) {
    const copy = JSON.parse(JSON.stringify(pt));
    const entry = ctx.buildPart(copy, { slot: 'version' });
    return entry?.body ? rep().measureVolume(entry.body) : NaN;
  }

  async function compare() {
    const e = editing(); const p = ctx.project();
    if (e.a == null) { notify('info', t('ver.none')); return; }
    await ctx.ensureKernel();
    e.diff = compareVersions(p, e.a, e.b, { volumeOf: volumeOfPart });
    ctx.renderLeft();
  }

  async function rollback(n, { confirm = true } = {}) {
    const p = ctx.project();
    const v = versionsOf(p).find((x) => x.n === Number(n));
    if (!v) return;
    const choice = confirm ? await ctx.ask({ title: t('ver.rollback'), message: t('ver.confirmRollback', { n: v.n }), icon: 'warning', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('ver.rollback'), icon: 'rollback', primary: true }] }) : 'ok';
    if (confirm && choice !== 'ok') return;
    ctx.change('op.rollbackVersion', (proj) => { rollbackTo(proj, v.n); });
    notify('success', t('ver.rolledBack', { n: v.n }));
    if (editing()?.mode === 'versions') { editing().diff = null; ctx.renderLeft(); }
    ctx.fitView?.();
  }

  function vault(cmd) {
    const p = ctx.project(); const ref = activeRef();
    if (!p || !ref) return;
    if (cmd === 'out') {
      let r;
      ctx.change('op.vault', (proj) => { r = checkOut(proj, ref, author()); });
      notify(r.ok ? 'success' : 'warning', r.ok ? t('ver.checkedOut') : t('ver.heldBy', { by: r.by }));
    } else if (cmd === 'in') {
      let r;
      ctx.change('op.vault', (proj) => { r = checkIn(proj, ref, author()); });
      notify(r.ok ? 'success' : 'warning', r.ok ? t('ver.checkedIn') : t('ver.heldBy', { by: r.by }));
    } else if (cmd === 'require') ctx.change('op.vault', (proj) => { setRequireCheckout(proj, !requiresCheckout(proj)); });
    ctx.renderAll();
  }

  function versionsPm(e) {
    const { pmHead, pmGroup, pmButton, pmSeg, textInput } = ctx.pm;
    const p = ctx.project();
    const list = versionsOf(p).slice().reverse();
    const rows = list.map((v) => `<li class="sim2-version ${e.a === v.n ? 'active' : ''}">${v.thumbnail ? `<img src="${escapeHtml(v.thumbnail)}" alt=""/>` : `<span class="sim2-thumb">${icon('part')}</span>`}<div class="sim2-version-text"><b>v${v.n}</b> <span class="muted">${escapeHtml(new Date(v.time).toLocaleString())}</span><br/><span>${escapeHtml(v.author)}</span>${v.comment ? ` — <span>${escapeHtml(v.comment)}</span>` : ''}<br/><span class="muted">${escapeHtml(t('ver.counts', v.counts ?? {}))}</span></div><div class="sim2-version-buttons"><button class="icon-button" data-pm="ver.pick:${v.n}" title="${escapeHtml(t('ver.compareThis'))}">${icon('versionCompare', 'icon tiny')}</button><button class="icon-button" data-pm="ver.rollback:${v.n}" title="${escapeHtml(t('ver.rollback'))}">${icon('rollback', 'icon tiny')}</button></div></li>`).join('');
    const opts = [...list.map((v) => [String(v.n), `v${v.n}`]), ['current', t('ver.current')]];
    const diff = e.diff ? `<ul class="pm-list sim2-diff">${e.diff.documents.filter((d) => d.status !== 'same').map((d) => `<li class="${d.status}">${icon(d.kind === 'assembly' ? 'assembly' : d.kind === 'drawing' ? 'drawing' : 'part', 'icon tiny')}<span><b>${escapeHtml(d.name)}</b> — ${escapeHtml(t(`ver.status.${d.status}`))}${d.renamed ? ` (${escapeHtml(d.renamed.from)} → ${escapeHtml(d.renamed.to)})` : ''}${d.features ? `<br/>${escapeHtml(t('ver.featureDiff', { added: d.features.added.length, removed: d.features.removed.length, changed: d.features.changed.length }))}${[...d.features.added.map((n) => `+${n}`), ...d.features.removed.map((n) => `−${n}`), ...d.features.changed.map((n) => `~${n}`)].length ? `: ${escapeHtml([...d.features.added.map((n) => `+${n}`), ...d.features.removed.map((n) => `−${n}`), ...d.features.changed.map((n) => `~${n}`)].join(', '))}` : ''}` : ''}${d.volume ? `<br/>${escapeHtml(t('ver.volumeDiff', { from: fmt(d.volume.from, 1), to: fmt(d.volume.to, 1), change: `${d.volume.change >= 0 ? '+' : ''}${fmt(d.volume.change, 1)}` }))}` : ''}${d.components ? `<br/>${escapeHtml(t('ver.componentDiff', { added: d.components.added.length, removed: d.components.removed.length }))}` : ''}</span></li>`).join('') || `<li class="muted">${escapeHtml(t('ver.noDiff'))}</li>`}</ul>` : '';
    const ref = activeRef();
    const docObj = ref && (ref.kind === 'part' ? p.parts : ref.kind === 'assembly' ? p.assemblies : p.drawings).find((d) => d.id === ref.id);
    const used = ref && ref.kind !== 'drawing' ? whereUsed(p, ref) : [];
    return [pmHead('versionHistory', t('cmd.versionHistory'), t('pm.help.versions')),
      pmGroup('save', t('ver.nextSave'), `<label class="pm-field">${icon('user')}<span class="pm-label">${escapeHtml(t('ver.author'))}</span>${textInput('ver.author', author())}</label><label class="pm-field">${icon('note')}<span class="pm-label">${escapeHtml(t('ver.comment'))}</span>${textInput('ver.comment', state.nextVersionComment ?? '')}</label>`),
      pmGroup('versionHistory', `${t('ver.list')} (${list.length})`, list.length ? `<ul class="pm-list sim2-versions">${rows}</ul>` : `<p class="pm-note">${escapeHtml(t('ver.none'))}</p>`),
      list.length ? pmGroup('versionCompare', t('ver.compare'), `<div class="sim2-compare"><span>${escapeHtml(t('ver.from'))}</span>${pmSeg('ver.a', opts, String(e.a))}<span>${escapeHtml(t('ver.to'))}</span>${pmSeg('ver.b', opts, String(e.b))}</div><div class="pm-row">${pmButton('ver.compare', 'versionCompare', t('ver.compare'), 'primary')}</div>${diff}`) : '',
      pmGroup('checkOut', t('ver.lock'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="ver.require" ${requiresCheckout(p) ? 'checked' : ''}/>${icon('checkOut')}<span>${escapeHtml(t('ver.requireCheckout'))}</span></label><p class="pm-note">${escapeHtml(docObj?.checkout ? t('ver.outBy', { by: docObj.checkout.by }) : t('ver.notOut'))}</p><div class="pm-row">${pmButton('ver.out', 'checkOut', t('cmd.checkOut'))}${pmButton('ver.in', 'checkIn', t('cmd.checkIn'))}</div>`),
      ref?.kind !== 'drawing' ? pmGroup('whereUsed', t('cmd.whereUsed'), used.length ? `<ul class="pm-list">${used.map((u) => `<li>${icon(u.kind === 'drawing' ? 'drawing' : 'assembly', 'icon tiny')}<span>${escapeHtml(`${u.name}${u.count ? ` ×${u.count}` : ''}${u.via.length ? ` (${t('ver.via')} ${u.via.join(', ')})` : ''}`)}</span></li>`).join('')}</ul>` : `<p class="pm-note">${escapeHtml(t('ver.unused'))}</p>`) : ''].join('');
  }

  function showWhereUsed() {
    const p = ctx.project(); const ref = activeRef();
    if (!p || !ref || ref.kind === 'drawing') { notify('info', t('ver.unused')); return; }
    const used = whereUsed(p, ref);
    notify('info', used.length ? t('ver.usedIn', { list: used.map((u) => u.name).join(', ') }) : t('ver.unused'));
    startVersions();
  }

  // ───────────────────────── assembly features

  function startAsmFeature(type) {
    const a = asm();
    if (!a) { notify('info', t('notice.assemblyOnly')); return; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    const size = Math.round(ctx.assemblySize(a) * 0.1) || 10;
    state.editing = { mode: 'asmFeature', type, plane: 'top', offset: 0, cx: 0, cy: 0, w: size * 2, h: size * 2, d: size, depth: 0, both: true, comps: state.selection.filter((s) => s.kind === 'comp').map((s) => s.id), pick: 'comps' };
    state.leftTab = 'pm';
    ctx.syncView(); ctx.renderAll();
  }
  const featureOf = (e) => ({ type: e.type, plane: e.plane, offset: e.offset, profile: e.type === 'asmHole' ? { kind: 'circle', cx: e.cx, cy: e.cy, d: e.d } : { kind: 'rect', cx: e.cx, cy: e.cy, w: e.w, h: e.h }, depth: e.depth, both: e.both, comps: e.comps.slice() });

  function asmFeaturePm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList } = ctx.pm;
    const a = asm();
    const glyph = e.type === 'asmHole' ? 'asmHole' : 'asmCut';
    const u = ctx.units();
    return [pmHead(glyph, t(`cmd.${e.type}`), t('pm.help.asmFeature')),
      pmGroup('refPlane', t('asmx.plane'), `${pmSeg('plane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], e.plane)}${pmNum('offset', e.offset, t('asmx.offset'), 'smartDim', u)}`),
      pmGroup(glyph, t('asmx.profile'), e.type === 'asmHole' ? `${pmNum('d', e.d, t('asmx.diameter'), 'smartDim', u)}${pmNum('cx', e.cx, t('asmx.cx'), 'smartDim', u)}${pmNum('cy', e.cy, t('asmx.cy'), 'smartDim', u)}` : `${pmNum('w', e.w, t('asmx.width'), 'smartDim', u)}${pmNum('h', e.h, t('asmx.height'), 'smartDim', u)}${pmNum('cx', e.cx, t('asmx.cx'), 'smartDim', u)}${pmNum('cy', e.cy, t('asmx.cy'), 'smartDim', u)}`),
      pmGroup('featExtrude', t('asmx.extent'), `${pmNum('depth', e.depth, t('asmx.depth'), 'smartDim', u)}<label class="pm-check"><input type="checkbox" data-pm-toggle="both" ${e.both ? 'checked' : ''}/>${icon('featCut')}<span>${escapeHtml(t('asmx.both'))}</span></label>`),
      pmGroup('assembly', t('asmx.components'), pmList('comps', e.comps.map((id) => a.components.find((c) => c.id === id)?.name ?? '?'), t('asmx.compsHint'), 'part', e.pick === 'comps'))].join('');
  }

  function acceptAsmFeature(e) {
    const a = asm();
    let f;
    state.editing = null; state.leftTab = 'tree';
    ctx.change('op.asmFeature', () => { f = createAsmFeature(a, e.type, { ...featureOf(e), name: `${t(`cmd.${e.type}`)}${(a.asmFeatures?.length ?? 0) + 1}` }); });
    notify('success', t('asmx.featureMade', { name: f.name }));
  }

  const cutCache = new Map();
  /** Replaces the bodies of components that assembly features cut. */
  function asmFeatureBodies(a) {
    const feats = (a.asmFeatures ?? []).filter((f) => !f.suppressed);
    if (!feats.length || !vp()) return;
    const size = ctx.assemblySize(a);
    for (const c of a.components) {
      if (c.sub || c.hidden || !feats.some((f) => featureActsOn(f, c.id))) continue;
      const p = ctx.project().parts.find((x) => x.id === c.part);
      if (!p) continue;
      const entry = ctx.buildPart(p);
      if (!entry?.body) continue;
      const pl = ctx.displayPlacement(a, c);
      const key = `${entry.key}|${JSON.stringify([pl.position, pl.rotation, feats.filter((f) => featureActsOn(f, c.id))])}`;
      if (!cutCache.has(key)) {
        if (cutCache.size > 40) cutCache.clear();
        let tess = null;
        try {
          const shape = cutComponent(entry.body, pl, feats, c.id, size);
          const tol = Math.max(0.01, (entry.size ?? 100) / 400);
          tess = { mesh: shape.mesh({ tolerance: tol, angularTolerance: 0.3 }), edges: shape.meshEdges({ tolerance: tol, angularTolerance: 0.3 }) };
        } catch { tess = null; }
        cutCache.set(key, tess);
      }
      const tess = cutCache.get(key);
      const bk = `comp:${c.id}`;
      const old = vp().bodies.get(bk);
      if (!tess || !old) continue;
      const matrix = old.mesh.matrix.clone();
      const color = `#${old.baseColor.getHexString()}`;
      vp().disposeBody(old); vp().bodies.delete(bk);
      const mat = materialOf(p.material);
      vp().addBody({ key: bk, mesh: tess.mesh, edges: tess.edges, faceIndex: new Map(), edgeIndex: new Map(), color, metal: mat.metal * 0.6, rough: mat.rough, matrix });
    }
  }

  // ───────────────────────── belts and chains

  function startBelt(kind = 'belt') {
    const a = asm();
    if (!a || a.components.length < 2) { notify('info', t('notice.assemblyOnly')); return; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'belt', kind, a: null, b: null, width: 10, thickness: kind === 'chain' ? 6 : 2, pitch: 12.7, pick: 'a' };
    state.leftTab = 'pm';
    ctx.syncView(); ctx.renderAll();
    notify('info', t('asmx.pickPulley'));
  }

  /** A pulley in assembly space: { c, r, dir } from a belt ref, or null. */
  function pulleyOf(a, ref, placements = null) {
    const comp = a.components.find((c) => c.id === ref.comp);
    if (!comp) return null;
    const p = ctx.project().parts.find((x) => x.id === comp.part);
    const entry = p && ctx.buildPart(p);
    if (!entry?.body) return null;
    let face;
    try { face = findFace(entry.body, ref.sig); } catch { face = null; }
    if (!face || !isCylinder(face.geomType)) return null;
    const ax = axisOfFace(face);
    const sig = faceSignature(face);
    if (!ax || !(sig.radius > 0)) return null;
    // The axis point at the face's middle (its centre of mass lies on the axis).
    const k = (sig.center[0] - ax.point[0]) * ax.dir[0] + (sig.center[1] - ax.point[1]) * ax.dir[1] + (sig.center[2] - ax.point[2]) * ax.dir[2];
    const local = ax.point.map((v, i) => v + ax.dir[i] * k);
    const pl = placements?.get(comp.id) ?? ctx.displayPlacement(a, comp);
    return { c: placePoint(pl, local), r: sig.radius, dir: placeDir(pl, ax.dir) };
  }

  function beltGeometry(a, belt, placements = null) {
    const p1 = pulleyOf(a, belt.a, placements), p2 = pulleyOf(a, belt.b, placements);
    if (!p1 || !p2) return null;
    const cross = Math.hypot(p1.dir[1] * p2.dir[2] - p1.dir[2] * p2.dir[1], p1.dir[2] * p2.dir[0] - p1.dir[0] * p2.dir[2], p1.dir[0] * p2.dir[1] - p1.dir[1] * p2.dir[0]);
    if (cross > 1e-3) return { error: 'axes' };
    const path = beltPath(p1, p2, p1.dir, { segments: 32 });
    if (!path) return { error: 'overlap' };
    const chain = belt.kind === 'chain' ? chainLinks(path.length, belt.pitch) : null;
    return { path, chain, mesh: beltMesh(path, { width: belt.width, thickness: belt.thickness }) };
  }

  function beltBodies(a, placements = null) {
    if (!vp()) return;
    for (const key of [...vp().bodies.keys()]) if (key.startsWith('belt:')) { vp().disposeBody(vp().bodies.get(key)); vp().bodies.delete(key); }
    for (const belt of a.belts ?? []) {
      if (belt.suppressed) continue;
      const g = beltGeometry(a, belt, placements);
      belt.length = g?.path ? Math.round((g.chain?.length ?? g.path.length) * 1000) / 1000 : null;
      if (belt.kind === 'chain') belt.links = g?.chain?.links ?? null;
      if (!g?.mesh) continue;
      vp().addBody({ key: `belt:${belt.id}`, mesh: { ...g.mesh, triangles: Array.from(g.mesh.triangles) }, edges: null, faceIndex: new Map(), edgeIndex: new Map(), color: belt.kind === 'chain' ? '#6b7280' : '#2b2b2b', metal: belt.kind === 'chain' ? 0.7 : 0.05, rough: 0.6, pickable: false });
    }
    vp().applyStyle?.();
    vp().requestRender?.();
  }

  function beltPick(hit) {
    const e = editing();
    const topo = ctx.topoOf(hit);
    if (hit?.kind !== 'face' || !topo?.comp || !topo.shape || !isCylinder(topo.shape.geomType) || topo.inner) { notify('info', t('asmx.needCylinder')); return; }
    const ref = { comp: topo.comp.id, sig: faceSignature(topo.shape) };
    if (e.pick === 'b' || e.a) { if (ref.comp === e.a?.comp) { notify('info', t('notice.sameComponent')); return; } e.b = ref; e.pick = null; }
    else { e.a = ref; e.pick = 'b'; notify('info', t('asmx.pickPulley2')); }
    ctx.renderLeft();
  }

  function beltPm(e) {
    const { pmHead, pmGroup, pmNum, pmSeg, pmList } = ctx.pm;
    const a = asm();
    const name = (r) => (r ? `${a.components.find((c) => c.id === r.comp)?.name ?? '?'} — ⌀${fmt(2 * (r.sig.radius ?? 0), 2)}` : null);
    let info = '';
    if (e.a && e.b) {
      const g = beltGeometry(a, { ...e, a: e.a, b: e.b });
      info = g?.path ? `<dl class="pm-results"><dt>${escapeHtml(t('asmx.beltLength'))}</dt><dd>${escapeHtml(`${fmt(g.path.length, 2)} mm`)}</dd><dt>${escapeHtml(t('asmx.centreDistance'))}</dt><dd>${escapeHtml(`${fmt(g.path.span, 2)} mm`)}</dd><dt>${escapeHtml(t('asmx.wrap'))}</dt><dd>${escapeHtml(`${fmt((g.path.wrap1 * 180) / Math.PI, 1)}° / ${fmt((g.path.wrap2 * 180) / Math.PI, 1)}°`)}</dd>${g.chain ? `<dt>${escapeHtml(t('asmx.links'))}</dt><dd>${escapeHtml(`${g.chain.links} (${fmt(g.chain.length, 2)} mm)`)}</dd>` : ''}</dl>` : `<p class="pm-note error">${escapeHtml(t(`asmx.beltError.${g?.error ?? 'axes'}`))}</p>`;
    }
    return [pmHead('belt', t('cmd.beltChain'), t('pm.help.belt')),
      pmGroup('belt', t('asmx.kind'), pmSeg('kind', [['belt', t('asmx.belt')], ['chain', t('asmx.chain')]], e.kind)),
      pmGroup('mateConcentric', t('asmx.pulleys'), `${pmList('a', e.a ? [name(e.a)] : [], t('asmx.pulley1'), 'mateConcentric', e.pick === 'a')}${pmList('b', e.b ? [name(e.b)] : [], t('asmx.pulley2'), 'mateConcentric', e.pick === 'b')}`),
      pmGroup('smartDim', t('asmx.section'), `${pmNum('width', e.width, t('asmx.width'), 'smartDim', ctx.units())}${pmNum('thickness', e.thickness, t('asmx.thickness'), 'smartDim', ctx.units())}${e.kind === 'chain' ? pmNum('pitch', e.pitch, t('asmx.pitch'), 'smartDim', ctx.units()) : ''}${info}`)].join('');
  }

  function acceptBelt(e) {
    const a = asm();
    if (!e.a || !e.b) { notify('error', t('asmx.pickPulley')); return; }
    const g = beltGeometry(a, { ...e });
    if (!g?.path) { notify('error', t(`asmx.beltError.${g?.error ?? 'axes'}`)); return; }
    let b;
    state.editing = null; state.leftTab = 'tree';
    ctx.change('op.belt', () => { b = createBelt(a, e.kind, e.a, e.b, { width: e.width, thickness: e.thickness, pitch: e.pitch, name: `${t(e.kind === 'chain' ? 'asmx.chain' : 'asmx.belt')}${(a.belts?.length ?? 0) + 1}` }); });
    notify('success', t('asmx.beltMade', { name: b.name, length: fmt(g.chain?.length ?? g.path.length, 2) }));
  }

  // ───────────────────────── sketch blocks and pictures

  const editor = () => (editing()?.mode === 'sketch' ? editing().editor : null);

  async function makeBlockCmd() {
    const ed = editor();
    if (!ed?.selection?.length) { notify('info', t('asmx.selectEntities')); return; }
    const p = ctx.project();
    const r = await ctx.popups.open('prompt', { title: t('cmd.makeBlock'), label: t('asmx.blockName'), value: `${t('asmx.block')}${(p.sketchBlocks?.length ?? 0) + 1}` });
    if (!r?.value) return;
    const block = makeBlock(ed.sketch, ed.selection, { name: r.value });
    if (!block) { notify('info', t('asmx.selectEntities')); return; }
    p.sketchBlocks = [...(p.sketchBlocks ?? []), block];
    // The selection becomes the first instance of the block.
    const inst = `bi${Date.now().toString(36).slice(-5)}`;
    const ids = new Set(block.entities.map((x) => x.id));
    for (const x of ed.sketch.entities) if (ids.has(x.id)) x.block = { id: block.id, instance: inst };
    ed.commit('op.block');
    notify('success', t('asmx.blockMade', { name: block.name, count: block.entities.length }));
  }

  async function insertBlockCmd(c = null) {
    const ed = editor();
    const p = ctx.project();
    const blocks = p?.sketchBlocks ?? [];
    if (!ed || !blocks.length) { notify('info', t('asmx.noBlocks')); return; }
    let spec = c?.spec;
    if (!spec) {
      const r = await ctx.popups.open('prompt', { title: t('cmd.insertBlock'), label: t('asmx.insertPrompt', { list: blocks.map((b, i) => `${i + 1}=${b.name}`).join(', ') }), value: `${blocks.length}, 0, 0, 0, 1` });
      if (!r?.value) return;
      spec = r.value;
    }
    const [n, x, y, angle, k] = String(spec).split(/[,\s]+/).filter(Boolean).map(Number);
    const block = blocks[Math.max(1, Math.min(blocks.length, Math.round(n) || blocks.length)) - 1];
    const res = insertBlock(ed.sketch, block, { x: x || 0, y: y || 0, angle: angle || 0, scale: k > 0 ? k : 1 });
    ed.selection = res.ids.filter((id) => ed.sketch.entities.find((q) => q.id === id)?.type !== 'point');
    ed.commit('op.block');
    notify('success', t('asmx.blockInserted', { name: block.name }));
  }

  function explodeBlockCmd() {
    const ed = editor();
    if (!ed) return;
    const sel = new Set(ed.selection ?? []);
    const insts = [...blockInstances(ed.sketch).entries()].filter(([, v]) => v.ids.some((id) => sel.has(id))).map(([k]) => k);
    if (!insts.length) { notify('info', t('asmx.noInstance')); return; }
    let n = 0;
    for (const i of insts) n += explodeBlock(ed.sketch, i);
    ed.commit('op.block');
    notify('success', t('asmx.exploded', { count: n }));
  }

  function chooseImage() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const fr = new FileReader();
        fr.onload = () => resolve({ src: String(fr.result), name: file.name });
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(file);
      });
      input.click();
    });
  }
  const imageAspect = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img.naturalHeight / Math.max(1, img.naturalWidth)); img.onerror = () => resolve(1); img.src = src; });

  async function pictureCmd(c = null) {
    const ed = editor();
    if (!ed) { notify('info', t('asmx.inSketch')); return; }
    const sk = ed.sketch;
    if (sk.picture && !c?.src) {
      const pic = sk.picture;
      const r = await ctx.popups.open('prompt', { title: t('cmd.sketchPicture'), label: t('asmx.picturePrompt'), value: `${fmt(pic.width, 2)}, ${fmt(pic.opacity, 2)}, ${fmt(pic.x, 2)}, ${fmt(pic.y, 2)}, ${fmt(pic.angle, 1)}` });
      if (r?.value == null) return;
      if (!String(r.value).trim()) { delete sk.picture; ed.commit('op.picture'); showPictures(); notify('info', t('asmx.pictureRemoved')); return; }
      const [w, op, x, y, ang] = String(r.value).split(/[,\s]+/).filter(Boolean).map(Number);
      sk.picture = normalisePicture({ ...pic, width: w || pic.width, opacity: Number.isFinite(op) ? op : pic.opacity, x: Number.isFinite(x) ? x : pic.x, y: Number.isFinite(y) ? y : pic.y, angle: Number.isFinite(ang) ? ang : pic.angle });
      ed.commit('op.picture');
      showPictures();
      return;
    }
    const img = c?.src ? { src: c.src, name: c.name ?? 'image' } : await chooseImage();
    if (!img) return;
    const aspect = c?.aspect ?? await imageAspect(img.src);
    sk.picture = normalisePicture({ src: img.src, name: img.name, width: c?.width ?? Math.max(50, Math.round((state.partEntry?.size ?? 100) * 0.8)), aspect, opacity: c?.opacity ?? 0.5, x: 0, y: 0 });
    ed.commit('op.picture');
    showPictures();
    notify('success', t('asmx.pictureAdded', { name: img.name }));
  }

  const textures = new Map();
  function pictureGroup() {
    const v = vp();
    if (!v.groups.sim2pic) { v.groups.sim2pic = new THREE.Group(); v.groups.sim2pic.name = 'sim2pic'; v.scene.add(v.groups.sim2pic); }
    return v.groups.sim2pic;
  }
  function showPictures() {
    if (!vp()) return;
    const g = pictureGroup();
    for (const o of [...g.children]) { o.removeFromParent(); o.geometry?.dispose(); o.material?.dispose(); }
    const ed = editor();
    const list = [];
    if (ed?.sketch?.picture?.visible !== false && ed?.sketch?.picture?.src) list.push({ pic: ed.sketch.picture, frame: ed.frame });
    for (const { pic, frame } of list) {
      if (!frame) continue;
      if (!textures.has(pic.src)) { if (textures.size > 8) textures.clear(); const tex = new THREE.TextureLoader().load(pic.src, () => vp()?.requestRender()); tex.colorSpace = THREE.SRGBColorSpace; textures.set(pic.src, tex); }
      const c = pictureCorners(pic, frame);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...c[0], ...c[1], ...c[2], ...c[3]], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: textures.get(pic.src), transparent: true, opacity: pic.opacity, side: THREE.DoubleSide, depthWrite: false }));
      mesh.renderOrder = -1;
      g.add(mesh);
    }
    vp().requestRender();
  }

  // ───────────────────────── library features

  function libSave() {
    const p = part();
    const sel = state.selection.find((s) => s.kind === 'feat');
    if (!p || !sel) { notify('info', t('asmx.selectFeature')); return; }
    const item = makeLibraryItem(p, sel.id);
    if (!item) { notify('info', t('asmx.needSketchFeature')); return; }
    const list = loadLibrary(storage());
    saveLibrary([...list.filter((x) => x.name !== item.name), item], storage());
    notify('success', t('asmx.libSaved', { name: item.name }));
  }

  function startLibInsert() {
    const p = part();
    if (!p) return;
    const list = loadLibrary(storage());
    if (!list.length) { notify('info', t('asmx.libEmpty')); return; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'libInsert', item: list.at(-1).id };
    state.leftTab = 'pm';
    ctx.renderAll();
    notify('info', t('asmx.libPickFace'));
  }

  function libPm(e) {
    const { pmHead, pmGroup, pmButton } = ctx.pm;
    const list = loadLibrary(storage());
    return [pmHead('libInsert', t('cmd.libInsert'), t('pm.help.libInsert')),
      pmGroup('libSave', t('asmx.library'), `<ul class="pm-list sim2-list">${list.map((x) => `<li class="${x.id === e.item ? 'active' : ''}"><button class="sim2-row" data-pm="lib.sel:${escapeHtml(x.id)}">${icon('libSave', 'icon tiny')}<span>${escapeHtml(`${x.name} (${x.features.length})`)}</span></button><button class="icon-button" data-pm="lib.del:${escapeHtml(x.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></li>`).join('')}</ul><p class="pm-note">${escapeHtml(t('asmx.libPickFace'))}</p>`),
      pmGroup('info', '', `<div class="pm-row">${pmButton('cancel', 'close', t('pm.close'))}</div>`)].join('');
  }

  function libPick(hit) {
    const e = editing(); const p = part();
    const face = hit?.kind === 'face' && hit.bodyKey === 'body' ? state.partEntry?.faces?.[hit.index] : null;
    if (!face || face.geomType !== 'PLANE') { notify('info', t('asmx.needPlane')); return; }
    const item = loadLibrary(storage()).find((x) => x.id === e.item);
    if (!item) return;
    let made = [];
    state.editing = null; state.leftTab = 'tree';
    ctx.change('op.libInsert', () => { made = insertLibraryItem(p, item, faceRef(face), { nameOf: (f) => `${item.name}-${f.name}` }); });
    notify('success', t('asmx.libInserted', { name: item.name, count: made.length }));
  }

  // ───────────────────────── viewport decoration

  function linesGroup() {
    const v = vp();
    if (!v.groups.sim2) { v.groups.sim2 = new THREE.Group(); v.groups.sim2.name = 'sim2'; v.scene.add(v.groups.sim2); }
    return 'sim2';
  }

  function decorate(kind) {
    if (!vp()) return;
    keepVersions();
    const lines = [], labels = [];
    const sketchingNow = editing()?.mode === 'sketch';
    if (kind === 'part') {
      const p = part(), entry = state.partEntry;
      // The flow display belongs to the Simulation page: it goes when the page closes.
      if (state.flow && editing()?.mode !== 'simulation') state.flow = null;
      const f = state.flow;
      if (f && p && f.partId === p.id && entry && f.key === entry.key && f.section) {
        vp().addBody({ key: 'flow:section', mesh: { ...f.section.mesh, triangles: Array.from(f.section.mesh.triangles) }, edges: null, colors: f.section.colors, faceIndex: new Map(), edgeIndex: new Map(), opacity: 0.92, pickable: false });
        const body = vp().bodies.get('body');
        if (body) { body.mesh.material.transparent = true; body.mesh.material.opacity = 0.3; body.mesh.material.depthWrite = false; }
        if (f.streams?.segments?.length) lines.push({ segments: f.streams.segments, color: '#1e88e5', width: 1.3, depthTest: true });
      } else if (f && (!p || f.partId !== p.id)) state.flow = null;
      if (p && entry?.mesh && !sketchingNow) mbdDisplay(p, entry, lines, labels);
    } else if (kind === 'assembly') {
      const a = asm();
      if (a) { asmFeatureBodies(a); beltBodies(a); }
      const e = editing();
      if (e?.mode === 'asmFeature') { try { const tool = asmFeatureTool(featureOf(e), ctx.assemblySize(a)); vp().setPreview({ mesh: tool.mesh({ tolerance: 0.5, angularTolerance: 0.4 }), cut: true }); } catch { /* bad profile */ } }
      if (a?.asmFeatures?.length || a?.belts?.length) { vp().applyStyle(); vp().refreshHighlight(); }
    }
    vp().setLines(linesGroup(), lines);
    if (!sketchingNow) vp().setLabels(labels);
    showPictures();
  }

  function onMotionPose(pose) {
    const a = asm();
    if (a?.belts?.length && pose) beltBodies(a, pose);
  }

  // ───────────────────────── tree rows

  const row = (key, glyph, label, depth, cls = '') => `<div class="tree-row ${cls}" data-tree="${escapeHtml(key)}" style="--depth:${depth}" title="${escapeHtml(label)}" role="treeitem" tabindex="-1"><span class="tree-toggle"></span>${icon(glyph)}<span class="tree-label">${escapeHtml(label)}</span></div>`;
  function treeExtra() {
    const kind = ctx.activeKind();
    const keys = new Set(state.selection.map((s) => s.key));
    const sel = (k) => (keys.has(k) ? 'selected' : '');
    const out = [];
    const p = ctx.project();
    if (kind === 'part') {
      const pt = part();
      const list = annotationsOf(pt);
      if (list.length) {
        out.push(row('mbd', 'mbdAnnotations', `${t('mbd.list')} (${list.length})`, 1, sel('mbd')));
        const glyph = { dimension: 'mbdDimension', gdt: 'gdt', datum: 'datum', note: 'note' };
        for (const a of list) out.push(row(`mbd:${a.id}`, glyph[a.kind], `${a.name}: ${annotationText(a)}`, 2, `${sel(`mbd:${a.id}`)} ${a.dangling ? 'error' : ''}`));
      }
    } else if (kind === 'assembly') {
      const a = asm();
      for (const f of a?.asmFeatures ?? []) out.push(row(`asmf:${f.id}`, f.type === 'asmHole' ? 'asmHole' : 'asmCut', `${f.name} (${f.comps?.length || t('asmx.all')})`, 1, `${sel(`asmf:${f.id}`)} ${f.suppressed ? 'suppressed' : ''}`));
      for (const b of a?.belts ?? []) out.push(row(`belt:${b.id}`, 'belt', `${b.name}${b.length ? ` — ${fmt(b.length, 1)} mm` : ''}${b.links ? ` (${b.links} ${t('asmx.linksShort')})` : ''}`, 1, sel(`belt:${b.id}`)));
    }
    const ref = activeRef();
    const d = ref && p ? (ref.kind === 'part' ? p.parts : ref.kind === 'assembly' ? p.assemblies : p.drawings).find((x) => x.id === ref.id) : null;
    const versions = versionsOf(p);
    if (versions.length || d?.checkout || requiresCheckout(p)) out.push(row('versions', d?.checkout ? 'checkOut' : 'versionHistory', `${t('ver.list')} (v${versions.at(-1)?.n ?? 0})${d?.checkout ? ` — ${t('ver.outBy', { by: d.checkout.by })}` : requiresCheckout(p) ? ` — ${t('ver.readOnlyShort')}` : ''}`, 1, sel('versions')));
    return out.length ? `<div class="tree sim2-tree" role="tree">${out.join('')}</div>` : '';
  }

  function treeDouble(key) {
    if (key === 'mbd' || key.startsWith('mbd:')) { startMbd(key.startsWith('mbd:') ? key.slice(4) : null); return true; }
    if (key === 'versions') { startVersions(); return true; }
    if (key.startsWith('asmf:') || key.startsWith('belt:')) {
      const a = asm(); const id = key.split(':')[1];
      const list = key.startsWith('asmf:') ? 'asmFeatures' : 'belts';
      ctx.ask({ title: t('action.delete'), message: t('asmx.confirmDelete', { name: a[list]?.find((x) => x.id === id)?.name ?? '' }), icon: 'trash', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'sup', label: t('asmx.toggleSuppress') }, { id: 'del', label: t('action.delete'), icon: 'trash', danger: true, primary: true }] }).then((choice) => {
        if (choice === 'del') ctx.change('op.asmFeature', () => { a[list] = a[list].filter((x) => x.id !== id); });
        if (choice === 'sup') ctx.change('op.asmFeature', () => { const x = a[list].find((y) => y.id === id); if (x) x.suppressed = !x.suppressed; });
      });
      return true;
    }
    return false;
  }

  // ───────────────────────── PropertyManager hooks

  function pm(e) {
    if (isSim(e)) return simPm(e);
    if (e.mode === 'mbd') return mbdPm(e);
    if (e.mode === 'versions') return versionsPm(e);
    if (e.mode === 'asmFeature') return asmFeaturePm(e);
    if (e.mode === 'belt') return beltPm(e);
    if (e.mode === 'libInsert') return libPm(e);
    return '';
  }
  function pick(hit) {
    const e = editing();
    if (isSim(e)) return simPick(hit);
    if (e.mode === 'mbd') return mbdPick(hit);
    if (e.mode === 'belt') return beltPick(hit);
    if (e.mode === 'libInsert') return libPick(hit);
    if (e.mode === 'asmFeature') {
      const comp = ctx.topoOf(hit)?.comp;
      if (!comp) { notify('info', t('notice.pickComponentFace')); return undefined; }
      const i = e.comps.indexOf(comp.id);
      if (i >= 0) e.comps.splice(i, 1); else e.comps.push(comp.id);
      vp()?.setSelection(e.comps.map((id) => ({ kind: 'body', bodyKey: `comp:${id}` })));
      return ctx.renderLeft();
    }
    return undefined;
  }
  function field(key, raw, v) {
    const e = editing();
    if (e.mode === 'mbd' && key.startsWith('mbd.')) return mbdField(key, raw);
    if (key === 'ver.author') { try { storage()?.setItem(AUTHOR_KEY, String(raw).trim()); } catch { /* no storage */ } return ctx.renderLeft(); }
    if (key === 'ver.comment') { state.nextVersionComment = String(raw); return undefined; }
    if (key.startsWith('factor:')) { const c = e.cases?.[Number(key.slice(7))]; const x = Number(String(raw).replace(',', '.')); if (c && Number.isFinite(x)) { c.factor = x; e.result = null; } else notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
    if (v == null) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
    if (['offset', 'cx', 'cy'].includes(key)) e[key] = v;
    else if (key === 'depth') e[key] = Math.max(0, v);
    else if (key === 'magnitude' || key === 'velocity' || key === 'height') e[key] = Math.max(1e-9, Math.abs(v));
    else if (key === 'tangentModulus') e[key] = Math.max(0, v);
    else if (v > 0) e[key] = key === 'steps' || key === 'resolution' ? Math.round(v) : v;
    if (isSim(e)) e.result = null;
    return ctx.renderLeft();
  }
  function set(key, value) {
    const e = editing();
    if (isSim(e)) return simSet(e, key, value);
    if (e.mode === 'mbd' && key.startsWith('mbd.')) return mbdField(key, value);
    if (e.mode === 'versions' && (key === 'ver.a' || key === 'ver.b')) { e[key.slice(4)] = value === 'current' ? 'current' : Number(value); e.diff = null; return ctx.renderLeft(); }
    e[key] = value;
    if (e.mode === 'belt' && key === 'kind') e.thickness = value === 'chain' ? 6 : 2;
    ctx.syncView();
    return ctx.renderLeft();
  }
  function toggle(key, checked) {
    const e = editing();
    if (key === 'mbd.show') { const p = part(); ctx.change('op.mbd', () => { p.mbdHidden = !checked; }); return; }
    if (key === 'mbd.diameterZone') return mbdField(key, checked);
    if (key === 'ver.require') return vault('require');
    if (key === 'showStreams') { e.showStreams = checked; if (state.flow) { state.flow.showStreams = checked; buildFlowDisplay(); } ctx.syncView(); return ctx.renderLeft(); }
    e[key] = checked;
    if (isSim(e)) e.result = null;
    ctx.syncView();
    return ctx.renderLeft();
  }
  function accept() {
    const e = editing();
    if (e.mode === 'asmFeature') return acceptAsmFeature(e);
    if (e.mode === 'belt') return acceptBelt(e);
    return ctx.cancelEditing({ quiet: true });
  }
  const NAMES = new Set(['sim2.addCase', 'sim2.delCase', 'mbd.add', 'mbd.one', 'mbd.sel', 'mbd.del', 'mbd.auto', 'ver.pick', 'ver.rollback', 'ver.compare', 'ver.out', 'ver.in', 'lib.sel', 'lib.del']);
  function handles(name) { return NAMES.has(name) || (owns(editing()) && ['clear', 'runSim', 'clearSim'].includes(name)); }
  function command(name, arg) {
    const e = editing();
    if (name === 'runSim') return runSim(e, part(), state.partEntry);
    if (name === 'clearSim') { state.sim = null; state.flow = null; if (e) e.result = null; ctx.syncView(); return ctx.renderLeft(); }
    if (name === 'clear') {
      if (Array.isArray(e[arg])) e[arg] = []; else e[arg] = null;
      if (e.mode === 'belt') e.pick = arg;
      vp()?.setSelection([]);
      return ctx.renderLeft();
    }
    if (name === 'sim2.addCase') return addCase();
    if (name === 'sim2.delCase') { e.cases.splice(Number(arg), 1); e.result = null; return ctx.renderLeft(); }
    if (name === 'mbd.add') { e.adding = e.adding === arg ? null : arg; e.refs = []; return ctx.renderLeft(); }
    if (name === 'mbd.one') return e.refs.length ? mbdCreate(e) : undefined;
    if (name === 'mbd.sel') { e.selected = arg; ctx.syncView(); return ctx.renderLeft(); }
    if (name === 'mbd.del') { ctx.change('op.mbd', () => { removeAnnotation(part(), arg); }); e.selected = annotationsOf(part())[0]?.id ?? null; return ctx.renderLeft(); }
    if (name === 'mbd.auto') return autoDimension();
    if (name === 'ver.pick') { e.a = Number(arg); e.b = 'current'; return compare(); }
    if (name === 'ver.compare') return compare();
    if (name === 'ver.rollback') return rollback(arg);
    if (name === 'ver.out') return vault('out');
    if (name === 'ver.in') return vault('in');
    if (name === 'lib.sel') { e.item = arg; return ctx.renderLeft(); }
    if (name === 'lib.del') { saveLibrary(loadLibrary(storage()).filter((x) => x.id !== arg), storage()); if (!loadLibrary(storage()).length) return ctx.cancelEditing({ quiet: true }); return ctx.renderLeft(); }
    return undefined;
  }
  const subject = (e) => (isSim(e) ? t(`sim2.${e.study === 'drop' ? 'dropTest' : e.study}`) : t({ mbd: 'cmd.mbdAnnotations', versions: 'cmd.versionHistory', asmFeature: `cmd.${e.type}`, belt: 'cmd.beltChain', libInsert: 'cmd.libInsert' }[e.mode] ?? 'cmd.simulation'));

  // ───────────────────────── commands, tabs, menus

  const hasPart = () => Boolean(part()) && editing()?.mode !== 'sketch';
  const asmOpen = () => Boolean(asm());
  const sketchingNow = () => editing()?.mode === 'sketch';
  const commands = {
    nonlinearStudy: { icon: 'sim2Nonlinear', label: 'cmd.nonlinearStudy', enabled: hasPart, checked: () => editing()?.study === 'nonlinear', run: () => openStudy('nonlinear') },
    dropTest: { icon: 'sim2Drop', label: 'cmd.dropTest', enabled: hasPart, checked: () => editing()?.study === 'drop', run: () => openStudy('drop') },
    loadCombination: { icon: 'sim2Combine', label: 'cmd.loadCombination', enabled: hasPart, checked: () => editing()?.study === 'combination', run: () => openStudy('combination') },
    flowStudy: { icon: 'sim2Flow', label: 'cmd.flowStudy', enabled: hasPart, checked: () => editing()?.study === 'flow', run: () => openStudy('flow') },
    mbdAnnotations: { icon: 'mbdAnnotations', label: 'cmd.mbdAnnotations', enabled: hasPart, checked: () => editing()?.mode === 'mbd', run: () => (editing()?.mode === 'mbd' ? ctx.cancelEditing({ quiet: true }) : startMbd()) },
    mbdAutoDimension: { icon: 'mbdAuto', label: 'cmd.mbdAutoDimension', enabled: hasPart, run: () => autoDimension() },
    insertModelAnnotations: { icon: 'mbdInsert', label: 'cmd.insertModelAnnotations', enabled: () => ctx.activeDrawing()?.source?.kind === 'part', run: () => insertModelAnnotations() },
    versionHistory: { icon: 'versionHistory', label: 'cmd.versionHistory', enabled: () => Boolean(ctx.project()), checked: () => editing()?.mode === 'versions', run: () => (editing()?.mode === 'versions' ? ctx.cancelEditing({ quiet: true }) : startVersions()) },
    checkOut: { icon: 'checkOut', label: 'cmd.checkOut', enabled: () => Boolean(ctx.project()?.active), run: () => vault('out') },
    checkIn: { icon: 'checkIn', label: 'cmd.checkIn', enabled: () => Boolean(ctx.project()?.active), run: () => vault('in') },
    whereUsed: { icon: 'whereUsed', label: 'cmd.whereUsed', enabled: () => Boolean(part() || asm()), run: () => showWhereUsed() },
    asmCut: { icon: 'asmCut', label: 'cmd.asmCut', enabled: asmOpen, checked: () => editing()?.mode === 'asmFeature' && editing().type === 'asmCut', run: () => startAsmFeature('asmCut') },
    asmHole: { icon: 'asmHole', label: 'cmd.asmHole', enabled: asmOpen, checked: () => editing()?.mode === 'asmFeature' && editing().type === 'asmHole', run: () => startAsmFeature('asmHole') },
    beltChain: { icon: 'belt', label: 'cmd.beltChain', enabled: () => (asm()?.components.length ?? 0) > 1, checked: () => editing()?.mode === 'belt', run: () => (editing()?.mode === 'belt' ? ctx.cancelEditing({ quiet: true }) : startBelt()) },
    'sk:makeBlock': { icon: 'sketchBlock', label: 'cmd.makeBlock', enabled: () => sketchingNow() && (editor()?.selection?.length ?? 0) > 0, run: () => makeBlockCmd() },
    'sk:insertBlock': { icon: 'insertBlock', label: 'cmd.insertBlock', enabled: () => sketchingNow() && (ctx.project()?.sketchBlocks?.length ?? 0) > 0, run: (c) => insertBlockCmd(c) },
    'sk:explodeBlock': { icon: 'explodeBlock', label: 'cmd.explodeBlock', enabled: () => sketchingNow() && (editor()?.selection?.length ?? 0) > 0, run: () => explodeBlockCmd() },
    'sk:picture': { icon: 'sketchPicture', label: 'cmd.sketchPicture', enabled: sketchingNow, checked: () => Boolean(editor()?.sketch?.picture), run: (c) => pictureCmd(c) },
    libSave: { icon: 'libSave', label: 'cmd.libSave', enabled: () => Boolean(part()) && state.selection.some((s) => s.kind === 'feat'), run: () => libSave() },
    libInsert: { icon: 'libInsert', label: 'cmd.libInsert', enabled: hasPart, checked: () => editing()?.mode === 'libInsert', run: () => startLibInsert() },
  };
  const TABS = {
    evaluate: ['nonlinearStudy', 'dropTest', 'loadCombination', 'flowStudy', 'mbdAnnotations', 'mbdAutoDimension', 'versionHistory'],
    features: ['mbdAnnotations', 'libSave', 'libInsert'],
    sketch: ['sk:makeBlock', 'sk:insertBlock', 'sk:explodeBlock', 'sk:picture'],
    assembly: ['asmCut', 'asmHole', 'beltChain', 'versionHistory'],
    drawing: ['insertModelAnnotations'],
  };
  function extendMenus(MENUS) {
    const at = (list, after, ids) => { const i = list.indexOf(after); list.splice(i >= 0 ? i + 1 : list.length, 0, ...ids); };
    if (MENUS.file) at(MENUS.file, 'saveAs', ['versionHistory', 'checkOut', 'checkIn', 'whereUsed']);
    if (MENUS.tools) at(MENUS.tools, 'simulation', ['nonlinearStudy', 'dropTest', 'loadCombination', 'flowStudy', '-', 'mbdAnnotations', 'mbdAutoDimension', 'insertModelAnnotations', '-', 'asmCut', 'asmHole', 'beltChain', '-', 'libSave', 'libInsert']);
    if (MENUS.sketch) MENUS.sketch.push('-', 'sk:makeBlock', 'sk:insertBlock', 'sk:explodeBlock', 'sk:picture');
  }

  return {
    commands, TABS, extendMenus, owns, pm, pick, field, set, toggle, accept, handles, command, subject, studyOptions,
    decorate, onMotionPose, beforeSave, blocks, treeExtra, treeDouble,
    api: { beforeSave, rollback, pick: (hit) => pick(hit), runSim, startMbd, autoDimension, insertModelAnnotations, startVersions, compare, vault, startAsmFeature, startBelt, beltGeometry, makeBlockCmd, insertBlockCmd, pictureCmd, libSave, startLibInsert, FLUIDS },
  };
}

/** app-more.js's tools and these as one object: the hooks of both, the later ones first where they own the mode. */
export function withSim2(createMore, ctx) {
  const base = createMore(ctx);
  const x = createSim2Tools({ ...ctx, baseStudyOptions: () => base.studyOptions(), sheetDrawing: (d) => base.sheetDrawing(d) });
  const tabs = { ...base.TABS };
  for (const [k, ids] of Object.entries(x.TABS)) tabs[k] = [...(tabs[k] ?? []), ...(tabs[k] ? ['|'] : []), ...ids];
  const route = (name) => (e, ...a) => (x.owns(e) ? x[name](...a) : base[name](...a));
  return {
    ...base,
    sim2: x.api,
    commands: { ...base.commands, ...x.commands },
    TABS: tabs,
    owns: (e) => x.owns(e) || base.owns(e),
    pm: (e) => (x.owns(e) ? x.pm(e) : base.pm(e)),
    pick: (hit, ev) => (x.owns(ctx.state.editing) ? x.pick(hit, ev) : base.pick(hit, ev)),
    field: (...a) => route('field')(ctx.state.editing, ...a),
    set: (...a) => route('set')(ctx.state.editing, ...a),
    toggle: (...a) => route('toggle')(ctx.state.editing, ...a),
    accept: () => (x.owns(ctx.state.editing) ? x.accept() : base.accept()),
    handles: (name) => x.handles(name) || base.handles(name),
    command: (name, arg) => (x.handles(name) ? x.command(name, arg) : base.command(name, arg)),
    subject: (e) => (x.owns(e) ? x.subject(e) : base.subject(e)),
    decorate: x.decorate, onMotionPose: x.onMotionPose, beforeSave: x.beforeSave, blocks: x.blocks, treeExtra: x.treeExtra, treeDouble: x.treeDouble, extendMenus: x.extendMenus,
  };
}
