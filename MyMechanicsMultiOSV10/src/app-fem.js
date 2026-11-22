// The window's side of the tetrahedral finite-element engine (cad/fem) and the flow solver (cad/cfd): runs studies
// in a Web Worker (progress + cancel), the mesh controls of the Simulation PropertyManager (element size, element
// order, local refinement on picked faces, mesh quality), fixture kinds (fixed, roller / symmetry, elastic support),
// load kinds (force, pressure, torque, gravity), result probes (click a face point), a line plot between two probes,
// and a study report; plus the bodies of an assembly (one per component, in assembly space) for contact studies.
import { runStudy, setWorkerFactory } from './cad/fem/run.js';
import { probeStatic } from './cad/fem/static.js';
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
  return { E: m.E * 1000, nu: m.nu ?? 0.3, yield: m.yield, density: m.density, ultimate: m.ultimate, group: m.group, id: m.id };
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
    e.elementSize ??= 0; e.order ??= 2; e.refine ??= []; e.refineSize ??= 0; e.fixtureKind ??= 'fixed'; e.probes ??= []; e.contact ??= 'bonded'; e.springK ??= 1;
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

  /** Fixtures as engine records (kinds and bodies). */
  const fixturesOf = (e) => e.fixtures.map((x) => ({ faceId: x.faceId, body: x.body, type: x.kind ?? 'fixed', stiffness: x.kind === 'elastic' ? e.springK : undefined }));

  /** Loads of the current load settings, shared by the picked faces. */
  function loadsOf(e) {
    const n = Math.max(1, e.loads.length), dir = LOAD_DIRS[e.dir] ?? [0, 0, -1];
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
      if (!e.fixtures.length && !(e.loads.length && e.heatKind === 'convection')) { notify('error', t('sim.error.no-temperature')); return; }
      const r = await run('thermal', {
        bodies: [{ mesh: entry.mesh, material: heatMaterial(part.material) }], mesh,
        temperatures: e.fixtures.map((x) => ({ faceId: x.faceId, value: e.temperature })),
        fluxes: e.heatKind === 'power' ? e.loads.map((x) => ({ faceId: x.faceId, power: e.power / e.loads.length })) : [],
        convections: e.heatKind === 'convection' ? e.loads.map((x) => ({ faceId: x.faceId, h: e.h, ambient: e.ambient })) : [],
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
    if (!e.loads.length && e.loadKind !== 'gravity') { notify('error', t('sim.error.no-loads')); return; }
    const r = await run('static', { bodies: [{ mesh: entry.mesh, material }], fixtures: fixturesOf(e), loads: e.loadKind === 'gravity' ? [] : loadsOf(e), gravity: gravityOf(e), mesh }, part.name);
    if (!done(r)) return;
    const { colors, top } = stressColours(r.vertexStress);
    state.sim = { partId: part.id, key: entry.key, result: r, colors, top, deformed: false, scale: r.maxDisplacement > 0 ? ((entry.size ?? 100) * 0.08) / r.maxDisplacement : 1, study: 'static' };
    e.result = r;
    notify(r.minFactorOfSafety < 1 ? 'warning' : 'success', t('notice.simDone', { fos: fmt(r.minFactorOfSafety, 2) }));
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
    if (r.frequencies) r.frequencies.forEach((f, i) => res.push([`${t('sim.frequencies')} ${i + 1}`, `${fmt(f, 2)} Hz`]));
    if (r.loadFactors) r.loadFactors.forEach((f, i) => res.push([`${t('sim.loadFactors')} ${i + 1}`, fmt(f, 3)]));
    if (r.reactions) r.reactions.forEach((x, i) => res.push([`${t('fem.reaction')} ${i + 1}`, `${x.force.map((v) => fmt(v, 2)).join(', ')} N`]));
    if (r.contact?.constraints) res.push([t('fem.contactForce'), `${r.contact.force.map((v) => fmt(v, 2)).join(', ')} N`], [t('fem.contactArea'), `${fmt(r.contact.area, 3)} mm²`]);
    if (res.length) rows.push([t('sim.results'), res]);
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
    return `${pmSeg('fem.fixtureKind', [['fixed', t('fem.fixture.fixed'), 'fixture'], ['roller', t('fem.fixture.roller'), 'femRoller'], ['elastic', t('fem.fixture.elastic'), 'femSpring']], e.fixtureKind)}${e.fixtureKind === 'elastic' ? pmNum('springK', e.springK, `${t('fem.springStiffness')} (N/mm³)`, 'femSpring') : ''}`;
  }

  /** Load kinds for the static study. */
  const loadKinds = (e) => [['force', t('sim.force'), 'load'], ['pressure', t('sim.pressure'), 'femPressure'], ['torque', t('fem.torque'), 'femTorque'], ['gravity', t('fem.gravity'), 'femGravity']];
  const loadLabel = (e) => (e.loadKind === 'pressure' ? `${t('sim.pressure')} (MPa)` : e.loadKind === 'torque' ? `${t('fem.torque')} (N·m)` : e.loadKind === 'gravity' ? `${t('fem.gravity')} (g)` : `${t('sim.force')} (N)`);

  /** Mesh controls: element size, order, local refinement faces, run button; quality of the last mesh. */
  function meshGroup(e, { runButton = true } = {}) {
    init(e);
    const { pmGroup, pmNum, pmSeg, pmList, pmButton } = ctx.pm;
    const q = e.result?.quality;
    const quality = e.result?.elements ? `<dl class="pm-results"><dt>${escapeHtml(t('sim.elements'))}</dt><dd>${escapeHtml(`${e.result.elements} · ${t('fem.nodes')} ${e.result.nodeCount ?? '—'}`)}</dd><dt>${escapeHtml(t('fem.elementSize'))}</dt><dd>${escapeHtml(`${fmt(e.result.elementSize, 2)} mm`)}</dd>${q ? `<dt>${escapeHtml(t('fem.quality'))}</dt><dd class="${q.min < 0.05 ? 'warn' : ''}">${escapeHtml(`${fmt(q.min, 3)} / ${fmt(q.mean, 3)}`)}</dd>` : ''}</dl>` : '';
    return pmGroup('femMesh', t('sim.mesh'), `${pmNum('elementSize', e.elementSize, `${t('fem.elementSize')} (mm, 0 = ${t('fem.auto')})`, 'femMesh')}${pmSeg('order', [['2', t('fem.quadratic'), 'femQuadratic'], ['1', t('fem.linear'), 'femLinear']], String(e.order))}${pmList('refine', e.refine.map(faceItem), t('fem.refineFaces'), 'femRefine', e.pick === 'refine')}${e.refine.length ? pmNum('refineSize', e.refineSize, `${t('fem.refineSize')} (mm, 0 = ${t('fem.auto')})`, 'femRefine') : ''}${quality}${runButton ? `<div class="pm-row">${pmButton('runSim', 'play', t('sim.run'), 'primary')}</div>` : ''}`);
  }

  /** Probes (pick points on the result), the plot between the first two, and the report buttons. */
  function resultTools(e) {
    init(e);
    if (!e.result?.model) return '';
    const { pmGroup, pmList, pmButton } = ctx.pm;
    const items = e.probes.map((p, i) => `P${i + 1}: ${(p.values ?? [[t('fem.outside'), '']]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    const line = lineSamples(e);
    const plot = line ? `<p class="pm-note">${escapeHtml(t('fem.linePlot'))}</p>${chart(line.map((x) => x.s), line.map((x) => x.v))}` : `<p class="pm-note">${escapeHtml(t('fem.linePlotHint'))}</p>`;
    return pmGroup('femProbe', t('fem.probes'), `${pmList('probes', items, t('fem.probePick'), 'femProbe', e.pick === 'probe')}${plot}<div class="pm-row">${pmButton('fem.report', 'femReport', t('fem.report.save'))}${pmButton('fem.copyReport', 'copy', t('fem.report.copy'))}</div>`);
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

  const NAMES = new Set(['fem.report', 'fem.copyReport']);
  function command(name, e, docName) {
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
    if (key === 'fem.fixtureKind') { e.fixtureKind = value; e.pick = 'fixtures'; ctx.renderLeft(); return true; }
    if (key === 'order') { e.order = Number(value) === 1 ? 1 : 2; e.result = null; state.sim = null; ctx.syncView(); ctx.renderLeft(); return true; }
    return false;
  }
  /** Number fields owned here; true when handled. */
  function field(e, key, v) {
    if (!['elementSize', 'refineSize', 'springK'].includes(key) || v == null || !(v >= 0)) return false;
    e[key] = v; ctx.renderLeft();
    return true;
  }
  function clear(e, what) {
    if (what === 'refine') { e.refine = []; ctx.renderLeft(); return true; }
    if (what === 'probes') { e.probes = []; ctx.renderLeft(); return true; }
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
    reportRows, reportHtml, reportText, fixtureKinds, loadKinds, loadLabel, meshGroup, resultTools, pick, fixtureKind,
    handles: (name) => NAMES.has(name), command, set, field, clear, assemblyBodies, faceItem, materialName,
    icon,
  };
}
