// The window's side of the tetrahedral finite-element engine (cad/fem) and the flow solver (cad/cfd): runs studies
// in a Web Worker (progress + cancel), the mesh controls of the Simulation PropertyManager (element size, element
// order, local refinement on picked faces, mesh quality), fixture kinds (fixed, roller / symmetry, elastic support),
// load kinds (force, pressure, torque, gravity), result probes (click a face point), a line plot between two probes,
// and a study report; plus the bodies of an assembly (one per component, in assembly space) for contact studies.
import { runStudy, setWorkerFactory } from './cad/fem/run.js';
import { mapSubFaces, carryOver } from './cad/fem/submodel.js';
import { rep } from './cad/kernel.js';
import { probeStatic } from './cad/fem/static.js';
import { linearizeStatic, linearizationChecks } from './cad/fem/linearize.js';
import { probeTemperature } from './cad/fem/thermal.js';
import { probe as probeModel } from './cad/fem/model.js';
import { thermalProperties, stressColor, temperatureColor } from './cad/fea.js';
import { materialOf, materialName } from './cad/materials.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

// Vite bundles the worker from this literal `new Worker(new URL(…))` pattern.
setWorkerFactory(() => new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' }));

export const LOAD_DIRS = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };

/** Structural material of a material id in solver units (E MPa). */
export function feaMaterial(id) {
  const m = materialOf(id);
  return { E: m.E * 1000, nu: m.nu ?? 0.3, yield: m.yield, density: m.density, ultimate: m.ultimate, alpha: m.alpha ?? 12, group: m.group, id: m.id };
}

/** Thermal material of an id: { k, cp, density }. */
export function heatMaterial(id) {
  const tp = thermalProperties(id), m = materialOf(id);
  return { k: tp.k, cp: tp.cp, density: m.density };
}

export function createFemTools(ctx) {
  const { state, t } = ctx;
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  const notify = (...a) => ctx.notify(...a);

  /** Fills the FE fields of a simulation PropertyManager state. */
  function init(e) {
    e.elementSize ??= 0; e.order ??= 2; e.refine ??= []; e.adaptive ??= false; e.adaptiveTarget ??= 5; e.adaptivePasses ??= 4; e.adaptiveMethod ??= 'h'; e.subSize ??= 0; e.subElement ??= 0; e.shell ??= false; e.shellFaces ??= []; e.shellThickness ??= 0; e.refineSize ??= 0; e.fixtureKind ??= 'fixed'; e.probes ??= []; e.contact ??= 'bonded'; e.springK ??= 1;
    // Cylindrical / prescribed-displacement fixtures: which components are held and at what value (mm).
    e.cyl ??= { r: { on: true, v: 0 }, t: { on: false, v: 0 }, a: { on: true, v: 0 } };
    e.disp ??= { x: { on: true, v: 0 }, y: { on: true, v: 0 }, z: { on: true, v: 0 } };
    // Remote load / spin: the point (mm) and the remote moment (N·m).
    e.loadPoint ??= [0, 0, 0]; e.loadMoment ??= [0, 0, 0]; e.massAtPoint ??= false;
    // Connectors: the list, and the one being set up (kind, its two faces, its values).
    e.connectors ??= [];
    e.conn ??= { type: 'bolt', a: null, b: null, axial: 1000, shear: 1000, diameter: 10, preload: 10000, radial: 1e5, spotDiameter: 6, point: null };
  }

  /** Mesh options for the engine. `size` = the part's size (mm) for the automatic element size. */
  function meshOptions(e, size = 100) {
    init(e);
    const h = e.elementSize > 0 ? e.elementSize : null;
    const refine = e.refine.length ? [{ faceIds: e.refine.map((r) => r.faceId), size: e.refineSize > 0 ? e.refineSize : (h ?? size / 16) / 4, body: e.refine[0].body ?? undefined }] : [];
    if (refine.length && e.refine.some((r) => r.body != null)) {
      const byBody = new Map();
      for (const r of e.refine) { const b = r.body ?? 0; if (!byBody.has(b)) byBody.set(b, []); byBody.get(b).push(r.faceId); }
      refine.length = 0;
      for (const [b, ids] of byBody) refine.push({ body: b, faceIds: ids, size: e.refineSize > 0 ? e.refineSize : (h ?? size / 16) / 4 });
    }
    return { size: h, resolution: 16, order: Number(e.order) === 1 ? 1 : 2, refine, grading: 0.35 };
  }

  /**
   * Fixtures as engine records (kinds and bodies). Cylindrical and displacement fixtures take the page's held
   * components; cyclic faces pair up in the order picked (side A, then the matching side B).
   */
  function fixturesOf(e) {
    init(e);
    const out = []; let cyclicA = null;
    const val = (c) => (c.on ? Number(c.v) || 0 : null);
    for (const x of e.fixtures) {
      const kind = x.kind ?? 'fixed';
      if (kind === 'cyclic') { if (!cyclicA) cyclicA = x; else { out.push({ type: 'cyclic', faceId: cyclicA.faceId, faceB: x.faceId, body: x.body }); cyclicA = null; } continue; }
      const r = { faceId: x.faceId, body: x.body, type: kind };
      if (kind === 'elastic') r.stiffness = e.springK;
      if (kind === 'cylindrical') Object.assign(r, { radial: val(e.cyl.r), circumferential: val(e.cyl.t), axial: val(e.cyl.a) });
      if (kind === 'displacement') r.value = [val(e.disp.x), val(e.disp.y), val(e.disp.z)];
      out.push(r);
    }
    return out;
  }
  /** Connectors as engine records. */
  function connectorsOf(e) {
    init(e);
    return e.connectors.map((c) => ({ type: c.type, faceA: c.a.faceId, bodyA: c.a.body, faceB: c.b.faceId, bodyB: c.b.body, axial: c.axial, shear: c.shear, diameter: c.type === 'spotWeld' ? c.spotDiameter : c.diameter, preload: c.preload, radial: c.radial, point: c.point }));
  }
  const CONN_KINDS = [['bolt', 'femBolt'], ['spring', 'femSpring'], ['pin', 'femHinge'], ['rigid', 'femRigid'], ['spotWeld', 'femSpotWeld'], ['bearing', 'femBearing']];
  /** The Connectors group: the new connector's kind, its faces and values; the list; the forces after a run. */
  function connectorGroup(e) {
    init(e);
    const { pmGroup, pmSeg, pmNum, pmList, pmButton } = ctx.pm;
    const c = e.conn;
    const face = (x) => (x ? [`${t('pm.face')}${x.bodyName ? ` · ${x.bodyName}` : ''}`] : []);
    const vals = c.type === 'spring' ? `${pmNum('conn.axial', c.axial, `${t('fem.conn.axial')} (N/mm)`, 'femSpring')}${pmNum('conn.shear', c.shear, `${t('fem.conn.shear')} (N/mm)`, 'femSpring')}`
      : c.type === 'bolt' ? `${pmNum('conn.diameter', c.diameter, `${t('fem.conn.diameter')} (mm)`, 'dimDiameter')}${pmNum('conn.preload', c.preload, `${t('fem.conn.preload')} (N)`, 'femBolt')}`
      : c.type === 'spotWeld' ? pmNum('conn.spotDiameter', c.spotDiameter, `${t('fem.conn.diameter')} (mm)`, 'dimDiameter')
      : c.type === 'bearing' ? pmNum('conn.radial', c.radial, `${t('fem.conn.radial')} (N/mm)`, 'femBearing') : '';
    const list = e.connectors.map((x, i) => `<div class="cfg-row">${icon(CONN_KINDS.find(([k]) => k === x.type)?.[1] ?? 'femBolt', 'icon tiny')}<span class="grow">${escapeHtml(`${i + 1}. ${t(`fem.conn.${x.type}`)}`)}</span><button type="button" class="icon-button" data-pm="fem.connDel:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const res = e.result?.connectors?.length ? `<table class="sim2-table"><tr><th>#</th><th>${escapeHtml(t('fem.conn.force'))}</th></tr>${e.result.connectors.map((r, i) => `<tr><td>${i + 1}. ${escapeHtml(t(`fem.conn.${r.type ?? 'bolt'}`))}</td><td>${escapeHtml(r.error ? t('fem.conn.noFaces') : r.axial != null ? `${t('fem.conn.axial')} ${fmt(r.axial, 1)} N · ${t('fem.conn.shear')} ${fmt(r.shear, 1)} N` : r.radial != null ? `${t('fem.conn.radial')} ${fmt(r.radial, 1)} N` : `${fmt(Math.hypot(...(r.force ?? [0, 0, 0])), 1)} N${r.moment ? ` · ${fmt(Math.hypot(...r.moment) / 1000, 2)} N·m` : ''}`)}</td></tr>`).join('')}</table>` : '';
    return pmGroup('femBolt', t('fem.connectors'), `${pmSeg('fem.connType', CONN_KINDS.map(([k, g]) => [k, t(`fem.conn.${k}`), g]), c.type)}
      ${pmList('connA', face(c.a), t(c.type === 'spotWeld' ? 'fem.conn.faceAPoint' : 'fem.conn.faceA'), 'femBolt', e.pick === 'connA')}${pmList('connB', face(c.b), t('fem.conn.faceB'), 'femBolt', e.pick === 'connB')}${vals}
      <p class="pm-note">${escapeHtml(t(`fem.conn.help.${c.type}`))}</p><div class="pm-row-buttons">${pmButton('fem.connAdd', 'plus', t('fem.conn.add'), c.a && c.b ? '' : 'disabled')}</div>
      <div class="custom-list">${list}</div>${res}`);
  }
  /** Load kinds that act on the whole body (no faces to pick). */
  const bodyLoad = (kind) => ['gravity', 'centrifugal', 'thermal'].includes(kind);

  /** Loads of the current load settings, shared by the picked faces. */
  function loadsOf(e) {
    init(e);
    const n = Math.max(1, e.loads.length), dir = LOAD_DIRS[e.dir] ?? [0, 0, -1];
    if (e.loadKind === 'gravity') return [];
    if (e.loadKind === 'centrifugal') return [{ centrifugal: { point: e.loadPoint, axis: dir, omega: ((Number(e.magnitude) || 0) * 2 * Math.PI) / 60 } }];
    if (e.loadKind === 'thermal') return [{ thermal: { deltaT: Number(e.magnitude) || 0 } }];
    // One record for all the picked faces: the force and moment carried by them together.
    const refs = e.loads.map((l) => (l.body != null ? { body: l.body, faceId: l.faceId } : l.faceId));
    if (e.loadKind === 'remote') return [{ faceId: refs, remote: { point: e.loadPoint, force: dir.map((v) => v * e.magnitude), moment: e.loadMoment.map((v) => v * 1000) } }];
    if (e.loadKind === 'mass') return [{ faceId: refs, mass: Number(e.magnitude) || 0, accel: dir.map((v) => v * 9.81), point: e.massAtPoint ? e.loadPoint : undefined }];
    if (e.loadKind === 'bearing') return [{ faceId: refs, bearing: dir.map((v) => v * e.magnitude) }];
    return e.loads.map((l) => {
      const base = { faceId: l.faceId, body: l.body };
      if (e.loadKind === 'pressure') return { ...base, pressure: e.magnitude };
      if (e.loadKind === 'torque') return { ...base, torque: dir.map((v) => (v * e.magnitude * 1000) / n) };   // N·m → N·mm
      return { ...base, force: dir.map((v) => (v * e.magnitude) / n) };
    });
  }
  const gravityOf = (e) => (e.loadKind === 'gravity' ? (LOAD_DIRS[e.dir] ?? [0, 0, -1]).map((v) => v * 9.81 * (e.magnitude || 1)) : null);

  /** Runs a study in the worker under the progress popup (cancellable). Resolves to the result or null. */
  async function run(kind, input, name) {
    return ctx.withProgress('progress.simulation', name, async (op, report, signal) => {
      const ac = new AbortController();
      const poll = setInterval(() => { if (signal?.cancelled) ac.abort(); }, 100);
      try {
        const stage = (info) => (typeof info === 'string' ? info : info?.stage);
        const r = await runStudy(kind, input, { signal: ac.signal, onProgress: (f, info) => report({ fraction: f, text: t(`fem.stage.${stage(info) ?? 'solve'}`, null, t('progress.solving')) }) });
        if (r?.error === 'cancelled') { notify('info', t('fem.cancelled')); return null; }
        return r;
      } finally { clearInterval(poll); }
    }, { delay: 150, cancellable: true });
  }

  function stressColours(values) {
    const sorted = Float32Array.from(values).sort();
    const top = sorted[Math.floor(sorted.length * 0.98)] || sorted.at(-1) || 1;
    const colors = new Float32Array(values.length * 3);
    values.forEach((v, i) => colors.set(stressColor(v, 0, top), i * 3));
    return { colors, top };
  }

  // ───────────────────────── the part studies (static, thermal, frequency)

  async function runPart(e, part, entry) {
    init(e);
    const mesh = meshOptions(e, entry.size ?? 100);
    if (e.study === 'thermal') {
      if (!e.fixtures.length && !(e.loads.length && ['convection', 'radiation'].includes(e.heatKind))) { notify('error', t('sim.error.no-temperature')); return; }
      const r = await run('thermal', {
        bodies: [{ mesh: entry.mesh, material: heatMaterial(part.material) }], mesh,
        temperatures: e.fixtures.map((x) => ({ faceId: x.faceId, value: e.temperature })),
        fluxes: e.heatKind === 'power' ? e.loads.map((x) => ({ faceId: x.faceId, power: e.power / e.loads.length })) : [],
        convections: e.heatKind === 'convection' ? e.loads.map((x) => ({ faceId: x.faceId, h: e.h, ambient: e.ambient })) : [],
        radiations: e.heatKind === 'radiation' ? e.loads.map((x) => ({ faceId: x.faceId, emissivity: Math.min(1, e.emissivity ?? 0.9), ambient: e.ambient })) : [],
      }, part.name);
      if (!done(r)) return;
      const colors = new Float32Array(r.vertexTemperature.length * 3);
      r.vertexTemperature.forEach((v, i) => colors.set(temperatureColor(v, r.min, r.max), i * 3));
      state.sim = { partId: part.id, key: entry.key, result: r, colors, deformed: false, scale: 1, study: 'thermal' };
      e.result = r;
      notify('success', t('notice.thermalDone', { min: fmt(r.min, 1), max: fmt(r.max, 1) }));
      return finish(e, r);
    }
    if (!e.fixtures.length) { notify('error', t('sim.error.no-fixtures')); return; }
    const material = { ...feaMaterial(part.material), nu: materialOf(part.material).nu ?? e.nu };
    if (e.study === 'modal') {
      const r = await run('modal', { bodies: [{ mesh: entry.mesh, material }], fixtures: fixturesOf(e), modes: Math.max(1, Math.min(12, Math.round(e.modes))), mesh }, part.name);
      if (!done(r)) return;
      e.result = r; e.modeIndex = 0;
      ctx.showMode?.(e, part, entry);
      notify('success', t('notice.modalDone', { f: fmt(r.frequencies[0] ?? 0, 1) }));
      return finish(e, r);
    }
    if (!e.loads.length && !bodyLoad(e.loadKind) && !e.connectors?.some((c) => c.type === 'bolt' && c.preload)) { notify('error', t('sim.error.no-loads')); return; }
    const adaptive = e.adaptive ? { target: Math.min(0.5, Math.max(0.001, e.adaptiveTarget / 100)), maxPasses: Math.max(1, Math.min(8, Math.round(e.adaptivePasses))), method: e.adaptiveMethod === 'p' ? 'p' : 'h' } : null;
    e.sub = null; e.subPreview = null;
    if (e.shell) return runShell(e, part, entry, material);
    const r = await run(adaptive ? 'adaptive' : 'static', { bodies: [{ mesh: entry.mesh, material }], fixtures: fixturesOf(e), loads: loadsOf(e), gravity: gravityOf(e), connectors: connectorsOf(e), mesh, adaptive }, part.name);
    if (!done(r)) return;
    const { colors, top } = stressColours(r.vertexStress);
    state.sim = { partId: part.id, key: entry.key, result: r, colors, top, deformed: false, scale: r.maxDisplacement > 0 ? ((entry.size ?? 100) * 0.08) / r.maxDisplacement : 1, study: 'static' };
    e.result = r;
    notify(r.minFactorOfSafety < 1 ? 'warning' : 'success', t('notice.simDone', { fos: fmt(r.minFactorOfSafety, 2) }));
    return finish(e, r);
  }

  /** The mid-surface of a shell result as a coloured preview body (deformed with the result's scale when shown so). */
  let shellCache = null;
  function shellPreview(e) {
    const r = e?.mode === 'simulation' ? e.result : null;
    if (r?.kind !== 'shell' || !r.nodes) return null;
    const sim = state.sim, k = sim?.deformed ? sim.scale : 0, top = sim?.top || r.maxStress || 1;
    if (shellCache?.r === r && shellCache.k === k && shellCache.top === top) return shellCache.spec;
    const nn = r.nodes.length / 3, vertices = new Float32Array(3 * nn), normals = new Float32Array(3 * nn), colors = new Float32Array(3 * nn);
    for (let n = 0; n < nn; n++) for (let c = 0; c < 3; c++) vertices[3 * n + c] = r.nodes[3 * n + c] + k * r.displacement[6 * n + c];
    for (let i = 0; i < r.triangles.length; i += 3) {
      const [a, b, c] = [r.triangles[i], r.triangles[i + 1], r.triangles[i + 2]];
      const u = [0, 1, 2].map((q) => vertices[3 * b + q] - vertices[3 * a + q]), v = [0, 1, 2].map((q) => vertices[3 * c + q] - vertices[3 * a + q]);
      const m = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const p of [a, b, c]) for (let q = 0; q < 3; q++) normals[3 * p + q] += m[q];
    }
    for (let n = 0; n < nn; n++) { const l = Math.hypot(normals[3 * n], normals[3 * n + 1], normals[3 * n + 2]) || 1; for (let q = 0; q < 3; q++) normals[3 * n + q] /= l; colors.set(stressColor(r.nodeStress[n], 0, top), 3 * n); }
    const spec = { mesh: { vertices, normals, triangles: Array.from(r.triangles) }, colors };   // three.js setIndex takes a plain array
    shellCache = { r, k, top, spec };
    return spec;
  }

  /** The static study on the mid-surface of the picked wall faces (shell elements). */
  async function runShell(e, part, entry, material) {
    if (!e.shellFaces.length) { notify('error', t('fem.shell.noFaces')); e.pick = 'shellFaces'; ctx.renderLeft(); return; }
    const r = await run('shell', { mesh: entry.mesh, shellFaces: e.shellFaces.map((x) => x.faceId), thickness: e.shellThickness, size: e.elementSize, fixtures: fixturesOf(e), loads: loadsOf(e), gravity: gravityOf(e), material }, part.name);
    if (!done(r)) return;
    // The colour scale from the shell's own nodes (the part's few surface vertices would miss the gradient).
    const { top } = stressColours(r.nodeStress);
    const colors = new Float32Array(r.vertexStress.length * 3);
    r.vertexStress.forEach((v, i) => colors.set(stressColor(v, 0, top), i * 3));
    state.sim = { partId: part.id, key: entry.key, result: r, colors, top, deformed: false, scale: r.maxDisplacement > 0 ? ((entry.size ?? 100) * 0.08) / r.maxDisplacement : 1, study: 'static' };
    e.result = r;
    if (r.unsupported?.length) notify('warning', t('fem.shell.unsupported', { kinds: r.unsupported.join(', ') }));
    else notify(r.minFactorOfSafety < 1 ? 'warning' : 'success', t('notice.simDone', { fos: fmt(r.minFactorOfSafety, 2) }));
    return finish(e, r);
  }

  function done(r) {
    if (!r) return false;
    if (r.error && r.error !== 'not-converged') { notify('error', `${t(`sim.error.${r.error}`, null, t(`sim2.error.${r.error}`, null, r.error))}${r.message ? `: ${String(r.message).split(String.fromCharCode(10))[0]}` : ''}`); return false; }
    if (r.error === 'not-converged') notify('warning', t('sim.error.not-converged'));
    return true;
  }
  function finish(e, r) {
    void r;
    e.probes = e.probes.map((p) => ({ ...p, values: probeValues(e, p.point) }));
    ctx.syncView(); ctx.renderLeft();
  }

  // ───────────────────────── probes, line plots, reports

  /** Probe values at a point for the study's result: [[label, text], …] or null. */
  function probeValues(e, p) {
    const r = e.result;
    if (!r?.model) return null;
    if (e.study === 'thermal' || r.nodeTemperature) { const T = probeTemperature(r, p); return T == null ? null : [[t('sim.temperature'), `${fmt(T, 2)} °C`]]; }
    if (r.nodeModes && e.study === 'modal') {
      const v = probeModel(r.model, p, { m: [r.nodeModes[e.modeIndex ?? 0], 3] }).values.m;
      return v ? [[t('fem.modeAmplitude'), fmt(Math.hypot(...v), 3)]] : null;
    }
    if (!r.stress || !r.displacement) return null;
    const q = probeStatic(r, p);
    if (!q) return null;
    return [[t('fem.vonMises'), `${fmt(q.vonMises, 2)} MPa`], [t('fem.displacement'), `${fmt(Math.hypot(...q.displacement), 4)} mm`], ['σxx · σyy · σzz', `${q.stress.slice(0, 3).map((v) => fmt(v, 1)).join(' · ')} MPa`]];
  }

  /** Scalar along the segment between the first two probes (for the plot). */
  function lineSamples(e, n = 41) {
    const r = e.result;
    if (!r?.model || e.probes.length < 2) return null;
    const [a, b] = [e.probes[0].point, e.probes[1].point];
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), p = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])];
      let v = null;
      if (r.nodeTemperature) v = probeTemperature(r, p);
      else if (r.stress) v = probeStatic(r, p)?.vonMises ?? null;
      out.push({ s: s * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), v });
    }
    return out;
  }

  /** A small SVG line chart (x, y arrays) with min / max labels. */
  function chart(xs, ys, cls = 'stress') {
    const W = 240, H = 90, good = ys.map((y, i) => [xs[i], y]).filter(([, y]) => y != null && Number.isFinite(y));
    if (good.length < 2) return '';
    const x0 = Math.min(...good.map((g) => g[0])), x1 = Math.max(...good.map((g) => g[0])) || 1, y0 = Math.min(...good.map((g) => g[1])), y1 = Math.max(...good.map((g) => g[1]));
    const sy = y1 > y0 ? y1 - y0 : 1;
    const pts = good.map(([x, y]) => `${(((x - x0) / (x1 - x0 || 1)) * W).toFixed(1)},${(H - 4 - ((y - y0) / sy) * (H - 8)).toFixed(1)}`).join(' ');
    return `<svg class="sim2-chart fem-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline class="${cls}" points="${pts}"/></svg><p class="pm-note fem-chart-range"><span>${escapeHtml(fmt(y0, 3))}</span><span>${escapeHtml(fmt(y1, 3))}</span></p>`;
  }

  /** The report of a result as rows [[section, [[label, value], …]], …]. */
  function reportRows(e, name) {
    const r = e.result;
    if (!r) return [];
    const rows = [[t('fem.report.study'), [[t('sim.study'), t(`sim.${e.study}`, null, t(`sim2.${e.study}`, null, e.study))], [t('fem.report.model'), name], [t('fem.report.date'), new Date().toLocaleString()]]]];
    if (r.elements) rows.push([t('sim.mesh'), [[t('sim.elements'), String(r.elements)], [t('fem.nodes'), String(r.nodeCount ?? '')], [t('fem.elementSize'), `${fmt(r.elementSize, 2)} mm`], [t('fem.order'), r.order === 1 ? t('fem.linear') : t('fem.quadratic')], [t('fem.quality'), r.quality ? `${fmt(r.quality.min, 3)} / ${fmt(r.quality.mean, 3)}` : '—']]]);
    const res = [];
    if (r.maxStress != null && !r.nodeTemperature) res.push([t('sim.maxStress'), `${fmt(r.maxStress, 2)} MPa`], [t('sim.maxDisp'), `${fmt(r.maxDisplacement, 4)} mm`], [t('sim.fos'), fmt(r.minFactorOfSafety, 2)]);
    if (r.nodeTemperature) res.push([t('sim.tMin'), `${fmt(r.min, 2)} °C`], [t('sim.tMax'), `${fmt(r.max, 2)} °C`], [t('sim.heatFlow'), `${fmt(r.heatFlowOut ?? 0, 3)} W`]);
    if (r.nodeTemperature && r.radiationOut) res.push([t('sim.radiated'), `${fmt(r.radiationOut, 3)} W`]);
    if (r.frequencies) r.frequencies.forEach((f, i) => res.push([`${t('sim.frequencies')} ${i + 1}`, `${fmt(f, 2)} Hz`]));
    if (r.loadFactors) r.loadFactors.forEach((f, i) => res.push([`${t('sim.loadFactors')} ${i + 1}`, fmt(f, 3)]));
    if (r.reactions) r.reactions.forEach((x, i) => res.push([`${t('fem.reaction')} ${i + 1}`, `${x.force.map((v) => fmt(v, 2)).join(', ')} N`]));
    if (r.contact?.constraints) res.push([t('fem.contactForce'), `${r.contact.force.map((v) => fmt(v, 2)).join(', ')} N`], [t('fem.contactArea'), `${fmt(r.contact.area, 3)} mm²`]);
    if (res.length) rows.push([t('sim.results'), res]);
    if (r.kind === 'shell') rows.push([t('fem.shell'), [[t('fem.shell.thickness'), `${fmt(r.thickness, 3)} mm`], [t('fem.shell.elements'), String(r.elements)], [t('fem.nodes'), String(r.nodeCount)]]]);
    if (e.sub) rows.push([t('fem.sub.title'), [[t('fem.sub.size'), `${fmt(e.sub.side, 2)} mm`], [t('sim.elements'), String(e.sub.elements)], [t('fem.sub.max'), `${fmt(e.sub.maxStress, 2)} MPa`], [t('fem.sub.globalMax'), `${fmt(e.sub.globalRegionMax, 2)} MPa`], [t('fem.sub.boundary'), `${fmt(100 * e.sub.boundary, 1)} %`]]]);
    if (r.adaptive?.history?.length) rows.push([t('fem.adaptive'), [[t('fem.adaptiveError'), `${fmt(100 * (r.adaptive.eta ?? 0), 2)} %${r.adaptive.converged ? '' : ` (${t('fem.adaptiveNotReached')})`}`], ...r.adaptive.history.map((h) => [`${t('fem.adaptivePass')} ${h.pass}`, `${h.elements} · ${fmt(100 * h.error, 2)} % · ${fmt(h.maxStress, 1)} MPa`])]]);
    if (e.probes?.length) rows.push([t('fem.probes'), e.probes.flatMap((p, i) => (p.values ?? []).map(([k, v]) => [`P${i + 1} ${k}`, v]))]);
    return rows;
  }
  function reportHtml(e, name) {
    const rows = reportRows(e, name);
    const body = rows.map(([h, list]) => `<h2>${escapeHtml(h)}</h2><table>${list.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('fem.report.title'))} — ${escapeHtml(name)}</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}h1{font-size:20px}h2{font-size:16px;margin-top:20px}table{border-collapse:collapse;min-width:420px}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f3f3f3;width:45%}</style></head><body><h1>${escapeHtml(t('fem.report.title'))} — ${escapeHtml(name)}</h1>${body}</body></html>`;
  }
  const reportText = (e, name) => reportRows(e, name).map(([h, list]) => `${h}\n${list.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`).join('\n\n');

  // ───────────────────────── PropertyManager groups

  const faceItem = (x, i) => `${t('pm.face')} ${i + 1}${x.bodyName ? ` · ${x.bodyName}` : ''}${x.kind && x.kind !== 'fixed' ? ` · ${t(`fem.fixture.${x.kind}`)}` : ''}`;

  /** The fixture-kind selector (applies to faces picked next). */
  function fixtureKinds(e) {
    init(e);
    const { pmSeg, pmNum } = ctx.pm;
    const kinds = [['fixed', t('fem.fixture.fixed'), 'fixture'], ['roller', t('fem.fixture.roller'), 'femRoller'], ['elastic', t('fem.fixture.elastic'), 'femSpring'], ['hinge', t('fem.fixture.hinge'), 'femHinge'], ['cylindrical', t('fem.fixture.cylindrical'), 'femCylindrical'], ['displacement', t('fem.fixture.displacement'), 'femDisplacement']];
    kinds.push(['cyclic', t('fem.fixture.cyclic'), 'femCyclic']);
    const comp = (group, key, label) => `<div class="fem-comp"><label class="pm-check"><input type="checkbox" data-pm-toggle="fem.${group}.${key}" ${e[group][key].on ? 'checked' : ''}/><span>${escapeHtml(label)}</span></label>${e[group][key].on ? pmNum(`fem.${group}.${key}`, e[group][key].v, `${label} (mm)`, 'femDisplacement') : ''}</div>`;
    const extra = e.fixtureKind === 'elastic' ? pmNum('springK', e.springK, `${t('fem.springStiffness')} (N/mm³)`, 'femSpring')
      : e.fixtureKind === 'cylindrical' ? `${comp('cyl', 'r', t('fem.cyl.radial'))}${comp('cyl', 't', t('fem.cyl.circumferential'))}${comp('cyl', 'a', t('fem.cyl.axial'))}<p class="pm-note">${escapeHtml(t('fem.help.cylindrical'))}</p>`
      : e.fixtureKind === 'displacement' ? `${comp('disp', 'x', 'X')}${comp('disp', 'y', 'Y')}${comp('disp', 'z', 'Z')}`
      : e.fixtureKind === 'hinge' ? `<p class="pm-note">${escapeHtml(t('fem.help.hinge'))}</p>`
      : e.fixtureKind === 'cyclic' ? `<p class="pm-note">${escapeHtml(t('fem.help.cyclic'))}</p>` : '';
    return `${pmSeg('fem.fixtureKind', kinds, e.fixtureKind)}${extra}`;
  }

  /** Load kinds for the static study. */
  const loadKinds = (e) => [['force', t('sim.force'), 'load'], ['pressure', t('sim.pressure'), 'femPressure'], ['torque', t('fem.torque'), 'femTorque'], ['gravity', t('fem.gravity'), 'femGravity'],
    ['bearing', t('fem.load.bearing'), 'femBearing'], ['remote', t('fem.load.remote'), 'femRemote'], ['mass', t('fem.load.mass'), 'femMass'], ['centrifugal', t('fem.load.centrifugal'), 'femSpin'], ['thermal', t('fem.load.thermal'), 'femThermalLoad']];
  const LABELS = { pressure: ['sim.pressure', 'MPa'], torque: ['fem.torque', 'N·m'], gravity: ['fem.gravity', 'g'], bearing: ['fem.load.bearing', 'N'], remote: ['fem.load.remote', 'N'], mass: ['fem.load.mass', 'kg'], centrifugal: ['fem.load.speed', 'rpm'], thermal: ['fem.load.deltaT', '°C'] };
  const loadLabel = (e) => { const [k, u] = LABELS[e.loadKind] ?? ['sim.force', 'N']; return `${t(k)} (${u})`; };
  /** The direction row is for loads with one (not pressure, thermal); a spin's direction is its axis. */
  const loadHasDir = (e) => !['pressure', 'thermal'].includes(e.loadKind);
  /** The extra fields of a load kind: the remote point and moment, the spin's axis point, a mass's point. */
  function loadExtras(e) {
    init(e);
    const { pmNum } = ctx.pm;
    const xyz = (key, arr, label, glyph, unit) => ['x', 'y', 'z'].map((c, i) => pmNum(`${key}.${i}`, arr[i], `${label} ${c.toUpperCase()} (${unit})`, glyph)).join('');
    if (e.loadKind === 'remote') return `${xyz('fem.loadPoint', e.loadPoint, t('fem.load.point'), 'position', 'mm')}${xyz('fem.loadMoment', e.loadMoment, t('fem.load.moment'), 'femTorque', 'N·m')}<p class="pm-note">${escapeHtml(t('fem.help.remote'))}</p>`;
    if (e.loadKind === 'centrifugal') return `${xyz('fem.loadPoint', e.loadPoint, t('fem.load.axisPoint'), 'position', 'mm')}<p class="pm-note">${escapeHtml(t('fem.help.centrifugal'))}</p>`;
    if (e.loadKind === 'mass') return `<label class="pm-check"><input type="checkbox" data-pm-toggle="fem.massAtPoint" ${e.massAtPoint ? 'checked' : ''}/><span>${escapeHtml(t('fem.load.massAtPoint'))}</span></label>${e.massAtPoint ? xyz('fem.loadPoint', e.loadPoint, t('fem.load.point'), 'position', 'mm') : ''}<p class="pm-note">${escapeHtml(t('fem.help.mass'))}</p>`;
    if (e.loadKind === 'bearing') return `<p class="pm-note">${escapeHtml(t('fem.help.bearing'))}</p>`;
    if (e.loadKind === 'thermal') return `<p class="pm-note">${escapeHtml(t('fem.help.thermal'))}</p>`;
    return '';
  }

  /** Mesh controls: element size, order, local refinement faces, run button; quality of the last mesh. */
  function meshGroup(e, { runButton = true } = {}) {
    init(e);
    const { pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const q = e.result?.quality;
    const quality = e.result?.elements ? `<dl class="pm-results"><dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(`${e.result.elements} · ${t('fem.nodes')} ${e.result.nodeCount ?? '—'}`)}</dd><dt>${escapeHtml(t('fem.elementSize'))}</dt><dd>${escapeHtml(`${fmt(e.result.elementSize, 2)} mm`)}</dd>${q ? `<dt>${escapeHtml(t('fem.quality'))}</dt><dd class="${q.min < 0.05 ? 'warn' : ''}">${escapeHtml(`${fmt(q.min, 3)} / ${fmt(q.mean, 3)}`)}</dd>` : ''}</dl>` : '';
    // Adaptive meshing (the part's static study): refine where the estimated error is large until it is under the target.
    const solidOnly = e.study === 'static' && !e.assembly;
    const sh = solidOnly ? `<label class="pm-check"><input type="checkbox" data-pm-toggle="fem.shell" ${e.shell ? 'checked' : ''}/>${icon('femShell')}<span>${escapeHtml(t('fem.shell'))}</span></label>${e.shell ? `${pmList('shellFaces', e.shellFaces.map(faceItem), t('fem.shell.faces'), 'femShell', e.pick === 'shellFaces')}${pmNum('shellThickness', e.shellThickness, `${t('fem.shell.thickness')} (mm, 0 = ${t('fem.shell.measured')})`, 'smartDim')}<p class="pm-note">${escapeHtml(t('fem.help.shell'))}</p>${e.result?.kind === 'shell' ? `<dl class="pm-results fem-shell-results"><dt>${escapeHtml(t('fem.shell.thickness'))}</dt><dd>${escapeHtml(`${fmt(e.result.thickness, 3)} mm`)}</dd><dt>${escapeHtml(t('fem.shell.elements'))}</dt><dd>${escapeHtml(String(e.result.elements))}</dd></dl>` : ''}` : ''}` : '';
    const ad = e.study === 'static' && !e.assembly && !e.shell ? `<label class="pm-check"><input type="checkbox" data-pm-toggle="fem.adaptive" ${e.adaptive ? 'checked' : ''}/>${icon('femRefine')}<span>${escapeHtml(t('fem.adaptive'))}</span></label>${e.adaptive ? `${ctx.pm.pmSeg('fem.adaptiveMethod', [['h', t('fem.adaptiveH'), 'femRefine'], ['p', t('fem.adaptiveP'), 'femQuadratic']], e.adaptiveMethod ?? 'h')}${pmNum('adaptiveTarget', e.adaptiveTarget, `${t('fem.adaptiveTarget')} (%)`, 'femRefine')}${pmNum('adaptivePasses', e.adaptivePasses, t('fem.adaptivePasses'), 'femMesh')}<p class="pm-note">${escapeHtml(t('fem.help.adaptive'))}</p>` : ''}` : '';
    const h = e.result?.adaptive?.history ?? [];
    const passes = h.length ? `<table class="sim2-table fem-adaptive-table"><tr><th>${escapeHtml(t('fem.adaptivePass'))}</th><th>p</th><th>${escapeHtml(t('sim.elements'))}</th><th>${escapeHtml(t('fem.adaptiveError'))}</th><th>${escapeHtml(t('sim.maxStress'))}</th></tr>${h.map((x) => `<tr><td>${x.pass}</td><td>${x.order ?? 2}</td><td>${x.elements}</td><td>${escapeHtml(`${fmt(100 * x.error, 2)} %`)}</td><td>${escapeHtml(fmt(x.maxStress, 1))}</td></tr>`).join('')}</table>${e.result.adaptive.converged ? '' : `<p class="pm-note warn">${escapeHtml(t('fem.adaptiveNotReached'))}</p>`}` : '';
    return pmGroup('femMesh', t('sim.mesh'), `${pmNum('elementSize', e.elementSize, `${t('fem.elementSize')} (mm, 0 = ${t('fem.auto')})`, 'femMesh')}${pmSeg('order', [['2', t('fem.quadratic'), 'femQuadratic'], ['1', t('fem.linear'), 'femLinear']], String(e.order))}${pmList('refine', e.refine.map(faceItem), t('fem.refineFaces'), 'femRefine', e.pick === 'refine')}${e.refine.length ? pmNum('refineSize', e.refineSize, `${t('fem.refineSize')} (mm, 0 = ${t('fem.auto')})`, 'femRefine') : ''}${sh}${ad}${quality}${passes}${runButton ? `<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>` : ''}`);
  }

  /** Stress linearisation along P1–P2 (a line through a wall) with the pressure-vessel checks for an allowable S. */
  function linearization(e) {
    const r = e.result;
    if (!r?.stress || r.nodeTemperature || e.probes.length < 2) return '';
    const lin = linearizeStatic(r, e.probes[0].point, e.probes[1].point, 21);
    if (!lin.ok) return `<p class="pm-note">${escapeHtml(t('fem.linOutside'))}</p>`;
    const S = e.allowS > 0 ? e.allowS : Math.round((r.model?.bodies?.[0]?.material?.yield ?? 250) / 1.5);
    const c = lin.categories;
    const rows = [['membrane', c.membrane], ['bending', c.bending], ['membraneBending', c.membraneBending], ['peak', c.peak], ['total', c.total]]
      .map(([k, v]) => `<tr><td>${escapeHtml(t(`fem.lin.${k}`))}</td><td>${fmt(v.intensity, 2)}</td><td>${fmt(v.mises, 2)}</td></tr>`).join('');
    const checks = linearizationChecks(lin, S).map((x) => `<tr class="${x.ok ? '' : 'fem-lin-fail'}"><td>${escapeHtml(x.name)}</td><td>${fmt(x.value, 1)}</td><td>≤ ${fmt(x.limit, 1)}</td></tr>`).join('');
    return `<p class="pm-note">${escapeHtml(t('fem.linTitle', { t: fmt(lin.thickness, 2) }))}</p><table class="sim2-table fem-lin"><tr><th></th><th>${escapeHtml(t('fem.lin.intensity'))}</th><th>von Mises</th></tr>${rows}</table>${ctx.pm.pmNum('allowS', S, `${t('fem.linAllowable')} S (MPa)`, 'material')}<table class="sim2-table fem-lin">${checks}</table>`;
  }

  /** Probes (pick points on the result), the plot between the first two, and the report buttons. */
  function resultTools(e) {
    init(e);
    if (!e.result?.model) return '';
    const { pmGroup, pmList, pmButton } = ctx.pm;
    const items = e.probes.map((p, i) => `P${i + 1}: ${(p.values ?? [[t('fem.outside'), '']]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    const line = lineSamples(e);
    const plot = line ? `<p class="pm-note">${escapeHtml(t('fem.linePlot'))}</p>${chart(line.map((x) => x.s), line.map((x) => x.v))}` : `<p class="pm-note">${escapeHtml(t('fem.linePlotHint'))}</p>`;
    return submodelGroup(e) + pmGroup('femProbe', t('fem.probes'), `${pmList('probes', items, t('fem.probePick'), 'femProbe', e.pick === 'probe')}${plot}${linearization(e)}<div class="pm-row">${pmButton('fem.report', 'femReport', t('fem.report.save'))}${pmButton('fem.copyReport', 'copy', t('fem.report.copy'))}</div>`);
  }

  // ───────────────────────── submodelling

  /** The region of the submodel: a cube about probe P1 (side e.subSize, 0 = a quarter of the part). */
  function subRegion(e, entry) {
    const c = e.probes[0]?.point;
    if (!c) return null;
    const side = e.subSize > 0 ? e.subSize : (entry?.size ?? 100) / 4;
    return { lo: c.map((v) => v - side / 2), hi: c.map((v) => v + side / 2), side };
  }
  /** The Submodel group (a part's static result): the region from P1, its size and element size, the run, the results. */
  function submodelGroup(e) {
    if (e.study !== 'static' || e.assembly || !e.result?.model || e.result.nodeTemperature) return '';
    const { pmGroup, pmNum, pmButton } = ctx.pm;
    const s = e.sub;
    const off = s ? Math.abs(s.boundary - 1) > 0.15 : false;
    const res = s ? `<dl class="pm-results fem-sub-results"><dt>${escapeHtml(t('fem.sub.max'))}</dt><dd>${escapeHtml(`${fmt(s.maxStress, 1)} MPa`)}</dd><dt>${escapeHtml(t('fem.sub.globalMax'))}</dt><dd>${escapeHtml(`${fmt(s.globalRegionMax, 1)} MPa`)}</dd><dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(String(s.elements))}</dd><dt>${escapeHtml(t('fem.sub.cuts'))}</dt><dd>${escapeHtml(String(s.cutFaces))}</dd><dt>${escapeHtml(t('fem.sub.boundary'))}</dt><dd class="${off ? 'warn' : ''}">${escapeHtml(`${fmt(100 * s.boundary, 1)} %`)}</dd></dl>${off ? `<p class="pm-note warn">${escapeHtml(t('fem.sub.boundaryWarn'))}</p>` : ''}${s.unsupported?.length ? `<p class="pm-note warn">${escapeHtml(t('fem.sub.unsupported', { kinds: s.unsupported.join(', ') }))}</p>` : ''}` : '';
    return pmGroup('femSubmodel', t('fem.sub.title'), `<p class="pm-note">${escapeHtml(t('fem.sub.help'))}</p>${pmNum('subSize', e.subSize, `${t('fem.sub.size')} (mm, 0 = ${t('fem.auto')})`, 'femSubmodel')}${pmNum('subElement', e.subElement, `${t('fem.elementSize')} (mm, 0 = ${t('fem.auto')})`, 'femMesh')}<div class="pm-row">${pmButton('fem.submodel', 'femSubmodel', t('fem.sub.run'), e.probes.length ? '' : 'disabled')}</div>${res}`);
  }
  /** Cuts the region out of the part, carries the study over and solves it driven by the global result. */
  async function runSubmodel(e) {
    init(e);
    const part = ctx.activePart?.(), entry = ctx.state.partEntry, g = e.result;
    if (!part || !entry?.body || !g?.model) return null;
    const box = subRegion(e, entry);
    if (!box) { notify('error', t('fem.sub.needProbe')); return null; }
    let mesh = null;
    try {
      const R = rep(), shape = entry.body.clone().intersect(R.makeBox(box.lo, box.hi));
      mesh = shape.mesh({ tolerance: Math.max(0.005, box.side / 500), angularTolerance: 0.2 });
    } catch { mesh = null; }
    if (!mesh?.triangles?.length) { notify('error', t('fem.sub.empty')); return null; }
    const mapping = mapSubFaces(entry.mesh, mesh, { tol: Math.max(1e-3, 3e-3 * (entry.size ?? 100)) });
    if (!mapping.cut.length) { notify('error', t('fem.sub.noCut')); return null; }
    const carried = carryOver({ fixtures: fixturesOf(e), loads: loadsOf(e) }, mapping);
    const material = { ...feaMaterial(part.material), nu: materialOf(part.material).nu ?? e.nu };
    const h = e.subElement > 0 ? e.subElement : box.side / 12;
    const r = await run('submodel', { bodies: [{ mesh, material }], fixtures: carried.fixtures, loads: carried.loads, gravity: gravityOf(e), cutFaces: mapping.cut, global: { model: g.model, displacement: g.displacement, nodeStress: g.nodeStress }, mesh: { size: h, order: 2, resolution: 16, grading: 0.35 } }, part.name);
    if (!done(r)) return null;
    // The global peak inside the region, for comparison.
    let gm = 0;
    for (let n = 0; n < g.model.nn; n++) { const x = g.model.nodes[3 * n], y = g.model.nodes[3 * n + 1], z = g.model.nodes[3 * n + 2]; if (x >= box.lo[0] && x <= box.hi[0] && y >= box.lo[1] && y <= box.hi[1] && z >= box.lo[2] && z <= box.hi[2]) gm = Math.max(gm, g.nodeStress[n]); }
    // The global result's colour scale, so the two read alike (the submodel's higher peak saturates red).
    const top = state.sim?.top || r.maxStress || 1;
    const colors = new Float32Array(r.vertexStress.length * 3);
    r.vertexStress.forEach((v, i) => colors.set(stressColor(v, 0, top), i * 3));
    e.subPreview = { mesh, colors };
    e.sub = { maxStress: r.maxStress, globalRegionMax: gm, elements: r.elements, cutFaces: mapping.cut.length, boundary: r.submodel.boundary, cutForce: r.submodel.cutForce, unsupported: carried.unsupported, side: box.side };
    notify('success', t('fem.sub.done', { sub: fmt(r.maxStress, 1), global: fmt(gm, 1) }));
    ctx.syncView?.(); ctx.renderLeft();
    return e.sub;
  }

  /** Handles a face pick for the FE modes; true when handled. */
  function pick(e, hit, face, body = null) {
    init(e);
    if (e.pick === 'probe') {
      if (!hit.point) return true;
      const point = hit.point.slice();
      e.probes.push({ point, values: probeValues(e, point) });
      if (e.probes.length > 6) e.probes.shift();
      ctx.renderLeft();
      return true;
    }
    if (e.pick === 'connA' || e.pick === 'connB') {
      const x = { index: hit.index, faceId: face.hashCode, type: face.geomType, body, bodyKey: hit.bodyKey, bodyName: body != null ? ctx.bodyName?.(body) : null };
      if (e.pick === 'connA') { e.conn.a = x; if (e.conn.type === 'spotWeld' && hit.point) e.conn.point = hit.point.slice(); e.pick = 'connB'; } else { e.conn.b = x; e.pick = null; }
      ctx.renderLeft();
      return true;
    }
    if (e.pick === 'shellFaces') {
      const i = e.shellFaces.findIndex((x) => x.index === hit.index);
      if (i >= 0) e.shellFaces.splice(i, 1); else e.shellFaces.push({ index: hit.index, faceId: face.hashCode, type: face.geomType });
      e.result = null; ctx.renderLeft();
      return true;
    }
    if (e.pick === 'refine') {
      const i = e.refine.findIndex((x) => x.index === hit.index && (x.bodyKey ?? 'body') === (hit.bodyKey ?? 'body'));
      if (i >= 0) e.refine.splice(i, 1); else e.refine.push({ index: hit.index, faceId: face.hashCode, type: face.geomType, body, bodyKey: hit.bodyKey });
      ctx.renderLeft();
      return true;
    }
    return false;
  }

  /** The fixture kind of a newly picked fixture face. */
  const fixtureKind = (e) => (e.study === 'thermal' ? 'fixed' : e.fixtureKind ?? 'fixed');

  const NAMES = new Set(['fem.report', 'fem.copyReport', 'fem.connAdd', 'fem.connDel', 'fem.submodel']);
  function command(name, e, docName, arg) {
    if (name === 'fem.connAdd') { init(e); if (!e.conn.a || !e.conn.b) { e.pick = 'connA'; ctx.renderLeft(); return undefined; } e.connectors.push(structuredClone(e.conn)); e.conn.a = null; e.conn.b = null; e.conn.point = null; e.pick = null; e.result = null; ctx.renderLeft(); return undefined; }
    if (name === 'fem.submodel') return runSubmodel(e);
    if (name === 'fem.connDel') { init(e); e.connectors.splice(Number(arg), 1); e.result = null; ctx.renderLeft(); return undefined; }
    if (name === 'fem.report') {
      const html = reportHtml(e, docName);
      if (ctx.saveExport) return ctx.saveExport(`${docName || 'simulation'}-report.html`, 'html', html, 'text/html');
      return undefined;
    }
    if (name === 'fem.copyReport') {
      const text = reportText(e, docName);
      try { globalThis.navigator?.clipboard?.writeText(text); notify('success', t('fem.report.copied')); } catch { /* no clipboard */ }
      return text;
    }
    return undefined;
  }
  /** pmSet keys owned here; true when handled. */
  function set(e, key, value) {
    if (key === 'fem.adaptiveMethod') { init(e); e.adaptiveMethod = value === 'p' ? 'p' : 'h'; ctx.renderLeft(); return true; }
    if (key === 'fem.connType') { init(e); e.conn.type = value; e.pick = 'connA'; ctx.renderLeft(); return true; }
    if (key === 'fem.fixtureKind') { e.fixtureKind = value; e.pick = 'fixtures'; ctx.renderLeft(); return true; }
    if (key === 'order') { e.order = Number(value) === 1 ? 1 : 2; e.result = null; state.sim = null; ctx.syncView(); ctx.renderLeft(); return true; }
    return false;
  }
  /** Check boxes owned here; true when handled. */
  function toggle(e, key, checked) {
    init(e);
    const m = /^fem\.(cyl|disp)\.([rtaxyz])$/.exec(key);
    if (m) { e[m[1]][m[2]].on = checked; e.result = null; ctx.renderLeft(); return true; }
    if (key === 'fem.massAtPoint') { e.massAtPoint = checked; e.result = null; ctx.renderLeft(); return true; }
    if (key === 'fem.adaptive') { e.adaptive = checked; ctx.renderLeft(); return true; }
    if (key === 'fem.shell') { e.shell = checked; e.result = null; if (checked && !e.shellFaces.length) e.pick = 'shellFaces'; ctx.renderLeft(); return true; }
    return false;
  }
  /** Number fields owned here; true when handled. */
  function field(e, key, v) {
    init(e);
    const m = /^fem\.(cyl|disp)\.([rtaxyz])$/.exec(key);
    if (m && v != null) { e[m[1]][m[2]].v = v; e.result = null; ctx.renderLeft(); return true; }
    const p = /^fem\.(loadPoint|loadMoment)\.([012])$/.exec(key);
    if (p && v != null) { e[p[1]][Number(p[2])] = v; e.result = null; ctx.renderLeft(); return true; }
    // A temperature change may be negative (cooling).
    if (key === 'magnitude' && e.loadKind === 'thermal' && v != null) { e.magnitude = v; e.result = null; ctx.renderLeft(); return true; }
    const cf = /^conn\.(axial|shear|diameter|preload|radial|spotDiameter)$/.exec(key);
    if (cf && v != null && v >= 0) { e.conn[cf[1]] = v; ctx.renderLeft(); return true; }
    if (key === 'allowS' && v > 0) { e.allowS = v; ctx.renderLeft(); return true; }
    if (key === 'adaptiveTarget' && v > 0) { e.adaptiveTarget = Math.min(50, Math.max(0.1, v)); ctx.renderLeft(); return true; }
    if (key === 'shellThickness' && v != null && v >= 0) { e.shellThickness = v; e.result = null; ctx.renderLeft(); return true; }
    if ((key === 'subSize' || key === 'subElement') && v != null && v >= 0) { e[key] = v; ctx.renderLeft(); return true; }
    if (key === 'adaptivePasses' && v >= 1) { e.adaptivePasses = Math.min(8, Math.round(v)); ctx.renderLeft(); return true; }
    if (!['elementSize', 'refineSize', 'springK'].includes(key) || v == null || !(v >= 0)) return false;
    e[key] = v; ctx.renderLeft();
    return true;
  }
  function clear(e, what) {
    if (what === 'refine') { e.refine = []; ctx.renderLeft(); return true; }
    if (what === 'shellFaces') { e.shellFaces = []; e.result = null; ctx.renderLeft(); return true; }
    if (what === 'probes') { e.probes = []; ctx.renderLeft(); return true; }
    if (what === 'connA' || what === 'connB') { init(e); e.conn[what === 'connA' ? 'a' : 'b'] = null; ctx.renderLeft(); return true; }
    return false;
  }

  // ───────────────────────── assembly bodies

  /**
   * The components of an assembly as solver bodies in assembly space: [{ key (viewport body key), compId, part,
   * mesh (vertices / normals / triangles / faceGroups with the placed faces' ids), faces, material, name }].
   */
  function assemblyBodies(asmDoc, tolerance = 0.2) {
    const out = [];
    for (const c of asmDoc?.components ?? []) {
      if (c.suppressed) continue;
      for (const item of ctx.componentShapes(c) ?? []) {
        let mesh = null;
        try { mesh = item.shape.mesh({ tolerance, angularTolerance: 0.3 }); } catch { mesh = null; }
        if (!mesh?.triangles?.length) continue;
        out.push({ key: `comp:${c.id}`, compId: c.id, part: item.part, mesh, faces: item.shape.faces, material: item.part?.material, name: `${c.name ?? item.part?.name ?? 'Body'}` });
      }
    }
    return out;
  }

  return {
    init, meshOptions, fixturesOf, loadsOf, gravityOf, run, runPart, stressColours, probeValues, lineSamples, chart,
    reportRows, reportHtml, reportText, fixtureKinds, loadKinds, loadLabel, meshGroup, resultTools, pick, fixtureKind, shellPreview,
    handles: (name) => NAMES.has(name), command, set, field, toggle, clear, connectorsOf, connectorGroup, assemblyBodies, faceItem, materialName, bodyLoad, loadExtras, loadHasDir,
    icon,
  };
}
