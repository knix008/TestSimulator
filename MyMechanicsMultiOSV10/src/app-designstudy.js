// Design study (Evaluate): the part's global variables varied over scenarios, a grid or an optimisation
// (cad/design-study.js), each design rebuilt on a copy of the part (the open one is left alone) and measured —
// mass, volume, surface area, bounding size, and with a simulation setup (fixed and loaded faces kept by their
// signatures so they are found again on every rebuilt shape) the largest stress and displacement and the first
// natural frequency. The best design can be applied to the part (one undo step); the table exports as CSV.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { runDesignStudy, allowedValues, designStudyCsv } from './cad/design-study.js';
import { variableValues } from './cad/params.js';
import { faceSignature, findFace } from './cad/refs.js';

export const SENSORS = ['mass', 'volume', 'area', 'sizeX', 'sizeY', 'sizeZ', 'maxStress', 'maxDisplacement', 'frequency1'];
const SIM_SENSORS = new Set(['maxStress', 'maxDisplacement', 'frequency1']);
const AXES = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

export function createDesignStudyTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'designStudy';
  const part = () => ctx.activePart();
  const fmt = (v, d = 3) => ctx.fmt(v, d);
  /** The global variables' current values { name: number } (variableValues gives a Map). */
  const valuesOf = (p) => (p ? Object.fromEntries(variableValues(p).values) : {});

  // ───────────────────────── the study (kept on the part, saved with the project)

  function studyOf(p = part()) {
    if (!p) return null;
    p.designStudy ??= { method: 'optimise', vars: {}, sensors: ['mass'], scenarios: [], goal: { sensor: 'mass', sense: 'min', value: 0 }, constraints: [], maxEvaluations: 40, sim: { fixtures: [], loads: [], magnitude: 1000, dir: '-z' } };
    return p.designStudy;
  }
  const edit = (mutate) => { const p = part(); if (!p) return; ctx.change('op.designStudy', () => mutate(studyOf(p))); };
  const variablesOf = (p = part()) => (p?.variables ?? []).map((v) => v.name);
  /** The study's active variables with their settings (defaults from the current value ± 50 %). */
  function studyVariables(p = part()) {
    const s = studyOf(p), cur = valuesOf(p);
    return Object.entries(s.vars).filter(([name, v]) => v.on && variablesOf(p).includes(name)).map(([name, v]) => (v.kind === 'discrete'
      ? { name, kind: 'discrete', values: String(v.values ?? '').split(/[,;\s]+/).map(Number).filter(Number.isFinite) }
      : { name, kind: 'range', min: Number(v.min ?? cur[name] * 0.5), max: Number(v.max ?? cur[name] * 1.5), step: Number(v.step) || Math.abs(cur[name]) / 4 || 1 }));
  }

  // ───────────────────────── evaluation of one design

  /** Rebuilds a copy of the part with the variables set and measures the sensors. */
  async function evaluateDesign(p, values, sensors, sim) {
    const copy = { ...p, variables: (p.variables ?? []).map((v) => (v.name in values ? { ...v, expr: String(values[v.name]) } : v)) };
    let entry;
    try { entry = ctx.buildPart(copy, { slot: 'study' }); } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
    if (!entry?.body || entry.result?.results && [...entry.result.results.values()].some((r) => r?.ok === false)) return { ok: false, error: 'rebuild' };
    const R = ctx.rep(), out = {};
    const vp = R.measureShapeVolumeProperties(entry.body);
    out.volume = vp.volume; out.mass = ctx.massOf(vp.volume, p.material) * 1000;   // g
    if (sensors.includes('area')) out.area = R.measureArea(entry.body);
    const [lo, hi] = entry.body.boundingBox.bounds;
    out.sizeX = hi[0] - lo[0]; out.sizeY = hi[1] - lo[1]; out.sizeZ = hi[2] - lo[2];
    if (sensors.some((s) => SIM_SENSORS.has(s))) {
      const faceIds = (sigs) => sigs.map((sig) => findFace(entry.body, sig)).filter(Boolean).map((f) => f.hashCode);
      const fixtures = faceIds(sim.fixtures).map((faceId) => ({ faceId })), loadFaces = faceIds(sim.loads);
      if (!fixtures.length) return { ok: false, error: 'no-fixtures' };
      const material = ctx.feaMaterial(p);
      const bodies = [{ mesh: entry.mesh, material }];
      if (sensors.includes('maxStress') || sensors.includes('maxDisplacement')) {
        if (!loadFaces.length) return { ok: false, error: 'no-loads' };
        const dir = AXES[sim.dir] ?? [0, 0, -1];
        const loads = loadFaces.map((faceId) => ({ faceId, force: dir.map((x) => (x * sim.magnitude) / loadFaces.length) }));
        const r = await ctx.runFem('static', { bodies, fixtures, loads, mesh: { resolution: 12, order: 2 }, tol: 1e-6 });
        if (!r || (r.error && r.error !== 'not-converged')) return { ok: false, error: r?.error ?? 'static' };
        out.maxStress = r.maxStress; out.maxDisplacement = r.maxDisplacement;
      }
      if (sensors.includes('frequency1')) {
        const r = await ctx.runFem('modal', { bodies, fixtures, modes: 1, mesh: { resolution: 12, order: 2 } });
        if (!r?.frequencies?.length) return { ok: false, error: r?.error ?? 'modal' };
        out.frequency1 = r.frequencies[0];
      }
    }
    return { ok: true, sensors: out };
  }

  // ───────────────────────── the mode

  function begin() {
    const p = part();
    if (!p) { notify('info', t('notice.partOnly')); return; }
    if (!(p.variables ?? []).length) notify('info', t('ds.noVariables'));
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    studyOf(p);
    state.editing = { mode: 'designStudy', pick: null, result: null, running: false };
    ctx.renderAll();
  }
  function finish() { ctx.cancelEditing({ quiet: true }); }

  async function run() {
    const e = editing(); const p = part(); if (!owns(e) || !p || e.running) return null;
    const s = studyOf(p), variables = studyVariables(p);
    if (!variables.length) { notify('error', t('ds.noActive')); return null; }
    const sensors = [...new Set([...s.sensors, ...(s.method !== 'whatif' && s.goal?.sensor ? [s.goal.sensor] : []), ...s.constraints.map((c) => c.sensor)])];
    const cur = valuesOf(p);
    const start = Object.fromEntries(variables.map((v) => [v.name, cur[v.name]]));
    e.running = true; ctx.renderLeft();
    try {
      const result = await ctx.withProgress('progress.designStudy', p.name, (op, report, signal) => runDesignStudy({
        variables, method: s.method, scenarios: s.scenarios.map((sc) => ({ name: sc.name, values: Object.fromEntries(Object.entries(sc.values).map(([k, v]) => [k, Number(v)])) })),
        goal: s.method === 'whatif' ? null : s.goal, constraints: s.constraints, start, maxEvaluations: s.method === 'grid' ? 400 : Math.max(2, Math.round(s.maxEvaluations)),
        evaluate: (values) => evaluateDesign(p, values, sensors, s.sim),
        onProgress: (done, total, row) => report({ fraction: total ? Math.min(0.99, done / total) : 0, text: `${done}${total ? ` / ${total}` : ''} · ${variables.map((v) => `${v.name} ${fmt(row.values[v.name], 3)}`).join(', ')}` }),
        cancel: () => signal?.cancelled,
      }), { cancellable: true, delay: 0 });
      e.result = { ...result, variables, sensors };
      const best = result.best >= 0 ? result.rows[result.best] : null;
      notify(best || s.method === 'whatif' ? 'success' : 'warning', best ? t('ds.doneBest', { n: result.evaluations, values: variables.map((v) => `${v.name} = ${fmt(best.values[v.name], 4)}`).join(', ') }) : t(s.method === 'whatif' ? 'ds.done' : 'ds.noFeasible', { n: result.evaluations }));
      return e.result;
    } catch (error) {
      if (error?.code === 'too-many') notify('error', t('ds.tooMany')); else if (!error?.cancelled) notify('error', String(error?.message ?? error));
      return null;
    } finally { e.running = false; ctx.renderLeft(); }
  }

  /** Sets the part's variables to a design's values (one undo step). */
  function apply(index) {
    const r = editing()?.result?.rows?.[index]; const p = part(); if (!r || !p) return;
    ctx.change('op.designStudyApply', () => { for (const v of p.variables ?? []) if (v.name in r.values) v.expr = String(+Number(r.values[v.name]).toPrecision(10)); });
    notify('success', t('ds.applied'));
  }
  function exportCsv() {
    const r = editing()?.result; if (!r) return undefined;
    return ctx.saveExport(`${ctx.fileSafe(part()?.name ?? 'part')} - ${t('ds.title')}.csv`, 'csv', designStudyCsv(r, r.variables, r.sensors), 'text/csv');
  }

  // ───────────────────────── PropertyManager

  const sensorName = (s) => t(`ds.sensor.${s}`);
  const unitOf = (s) => ({ mass: 'g', volume: 'mm³', area: 'mm²', sizeX: 'mm', sizeY: 'mm', sizeZ: 'mm', maxStress: 'MPa', maxDisplacement: 'mm', frequency1: 'Hz' }[s] ?? '');
  const text = (key, value, label, cls = '') => `<label class="pm-field ${cls}"><span class="pm-label">${escapeHtml(label)}</span><input type="text" class="pm-text" data-pm-field="${key}" value="${escapeHtml(value ?? '')}" spellcheck="false"/></label>`;
  const select = (key, options, current) => `<select class="pm-select" data-pm-select="${key}">${options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === current ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmSeg, pmNum } = ctx.pm;
    const p = part(); const s = studyOf(p); const cur = valuesOf(p);
    const names = variablesOf(p);
    const vars = names.length ? names.map((name) => {
      const v = s.vars[name] ?? {};
      const on = Boolean(v.on);
      const settings = !on ? '' : v.kind === 'discrete'
        ? text(`ds.values:${name}`, v.values ?? '', t('ds.values'))
        : `<div class="ds-range">${text(`ds.min:${name}`, v.min ?? +(cur[name] * 0.5).toPrecision(4), t('ds.min'))}${text(`ds.max:${name}`, v.max ?? +(cur[name] * 1.5).toPrecision(4), t('ds.max'))}${text(`ds.step:${name}`, v.step ?? +(Math.abs(cur[name]) / 4 || 1).toPrecision(4), t('ds.step'))}</div>`;
      return `<div class="ds-var"><label class="pm-check"><input type="checkbox" data-pm-toggle="ds.on:${escapeHtml(name)}" ${on ? 'checked' : ''}/><span><b>${escapeHtml(name)}</b> = ${escapeHtml(fmt(cur[name], 4))}</span></label>${on ? pmSeg(`ds.kind:${name}`, [['range', t('ds.range')], ['discrete', t('ds.discrete')]], v.kind ?? 'range') : ''}${settings}</div>`;
    }).join('') : `<p class="pm-note">${escapeHtml(t('ds.noVariables'))}</p>`;
    const sensors = `<div class="ds-sensors">${SENSORS.map((x) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="ds.sensor:${x}" ${s.sensors.includes(x) ? 'checked' : ''}/><span>${escapeHtml(sensorName(x))}</span></label>`).join('')}</div>`;
    const needsSim = [...s.sensors, s.goal?.sensor, ...s.constraints.map((c) => c.sensor)].some((x) => SIM_SENSORS.has(x));
    const sim = needsSim ? pmGroup('simulation', t('ds.simSetup'), `<div class="pm-row">${pmButton('ds.pick:fixtures', 'fixture', `${t('sim.fixedFaces')} (${s.sim.fixtures.length})`, e.pick === 'fixtures' ? 'primary' : '')}${pmButton('ds.pick:loads', 'load', `${t('sim.loadFaces')} (${s.sim.loads.length})`, e.pick === 'loads' ? 'primary' : '')}${pmButton('ds.clearFaces', 'trash', t('ds.clearFaces'))}</div>${pmNum('ds.magnitude', s.sim.magnitude, `${t('sim.force')} (N)`, 'load')}${pmSeg('ds.dir', Object.keys(AXES).map((k) => [k, k.toUpperCase()]), s.sim.dir)}<p class="pm-note">${escapeHtml(t('ds.simNote'))}</p>`) : '';
    const activeVars = studyVariables(p);
    let method = '';
    if (s.method === 'whatif') {
      const rows = s.scenarios.map((sc, i) => `<div class="ds-scenario">${text(`ds.scName:${i}`, sc.name, t('ds.scenario'), 'ds-sc-name')}${activeVars.map((v) => text(`ds.scVal:${i}:${v.name}`, sc.values[v.name] ?? cur[v.name], v.name, 'ds-sc-val')).join('')}<button type="button" class="icon-button" data-pm="ds.delScenario:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
      method = `${rows || `<p class="pm-note">${escapeHtml(t('ds.noScenarios'))}</p>`}<div class="pm-row">${pmButton('ds.addScenario', 'plus', t('ds.addScenario'))}</div>`;
    } else {
      const goal = `<p class="pm-note">${escapeHtml(t('ds.goal'))}</p>${select('ds.goalSensor', SENSORS.map((x) => [x, sensorName(x)]), s.goal.sensor)}${pmSeg('ds.goalSense', [['min', t('ds.minimise')], ['max', t('ds.maximise')], ['target', t('ds.target')]], s.goal.sense)}${s.goal.sense === 'target' ? text('ds.goalValue', s.goal.value, t('ds.targetValue')) : ''}`;
      const cons = s.constraints.map((c, i) => `<div class="ds-constraint">${select(`ds.conSensor:${i}`, SENSORS.map((x) => [x, sensorName(x)]), c.sensor)}${pmSeg(`ds.conOp:${i}`, [['<=', '≤'], ['>=', '≥']], c.op)}${text(`ds.conValue:${i}`, c.value, unitOf(c.sensor))}<button type="button" class="icon-button" data-pm="ds.delConstraint:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
      method = `${s.method === 'optimise' ? goal : ''}<p class="pm-note">${escapeHtml(t('ds.constraints'))}</p>${cons}<div class="pm-row">${pmButton('ds.addConstraint', 'plus', t('ds.addConstraint'))}</div>${s.method === 'optimise' ? pmNum('ds.maxEval', s.maxEvaluations, t('ds.maxEvaluations'), 'statistics') : `<p class="pm-note">${escapeHtml(t('ds.gridCount', { n: activeVars.reduce((n, v) => n * Math.max(1, allowedValues(v).length), activeVars.length ? 1 : 0) }))}</p>`}`;
    }
    let results = '';
    const r = e.result;
    if (r) {
      const head = `<tr><th></th>${r.variables.map((v) => `<th>${escapeHtml(v.name)}</th>`).join('')}${r.sensors.map((x) => `<th>${escapeHtml(sensorName(x))}</th>`).join('')}<th></th></tr>`;
      const rows = r.rows.map((row, i) => `<tr class="${i === r.best ? 'ds-best' : ''} ${row.ok && row.feasible ? '' : 'ds-bad'}"><td>${escapeHtml(row.name || String(i + 1))}</td>${r.variables.map((v) => `<td>${escapeHtml(fmt(row.values[v.name], 4))}</td>`).join('')}${r.sensors.map((x) => `<td>${row.ok ? escapeHtml(fmt(row.sensors[x], 4)) : '—'}</td>`).join('')}<td>${row.ok ? `<button type="button" class="icon-button" data-pm="ds.apply:${i}" title="${escapeHtml(t('ds.apply'))}">${icon('check', 'icon tiny')}</button>` : escapeHtml(t(`ds.err.${row.error}`, null, row.error ?? ''))}</td></tr>`).join('');
      results = pmGroup('statistics', t('ds.results', { n: r.evaluations }), `<div class="ds-table-wrap"><table class="sim2-table ds-table">${head}${rows}</table></div>${r.best >= 0 ? `<p class="pm-note">${escapeHtml(t('ds.bestNote'))}</p><div class="pm-row">${pmButton(`ds.apply:${r.best}`, 'check', t('ds.applyBest'), 'primary')}</div>` : ''}<div class="pm-row">${pmButton('ds.csv', 'inspCsv', t('ds.csv'))}</div>`);
    }
    return [
      pmHead('designStudy', t('cmd.designStudy'), t('pm.help.designStudy')),
      pmGroup('equations', t('ds.variables'), vars),
      pmGroup('massProps', t('ds.sensors'), sensors),
      sim,
      pmGroup('designStudy', t('ds.method'), `${pmSeg('ds.method', [['whatif', t('ds.whatif')], ['grid', t('ds.grid')], ['optimise', t('ds.optimise')]], s.method)}${method}<div class="pm-row">${pmButton('ds.run', 'play', t('ds.run'), 'primary')}</div>`),
      results,
    ].join('');
  }

  // ───────────────────────── input

  function field(key, raw) {
    const v = String(raw ?? '').trim(), num = Number(v.replace(',', '.'));
    let m;
    if ((m = /^ds\.(min|max|step):(.+)$/.exec(key))) { if (Number.isFinite(num)) edit((s) => { s.vars[m[2]] = { ...(s.vars[m[2]] ?? { on: true }), [m[1]]: num }; }); else notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
    if ((m = /^ds\.values:(.+)$/.exec(key))) { edit((s) => { s.vars[m[1]] = { ...(s.vars[m[1]] ?? { on: true }), values: v }; }); return ctx.renderLeft(); }
    if ((m = /^ds\.scName:(\d+)$/.exec(key))) { edit((s) => { const sc = s.scenarios[Number(m[1])]; if (sc) sc.name = v || sc.name; }); return ctx.renderLeft(); }
    if ((m = /^ds\.scVal:(\d+):(.+)$/.exec(key))) { if (Number.isFinite(num)) edit((s) => { const sc = s.scenarios[Number(m[1])]; if (sc) sc.values[m[2]] = num; }); return ctx.renderLeft(); }
    if ((m = /^ds\.conValue:(\d+)$/.exec(key))) { if (Number.isFinite(num)) edit((s) => { const c = s.constraints[Number(m[1])]; if (c) c.value = num; }); return ctx.renderLeft(); }
    if (key === 'ds.goalValue') { if (Number.isFinite(num)) edit((s) => { s.goal.value = num; }); return ctx.renderLeft(); }
    if (key === 'ds.magnitude') { if (num > 0) edit((s) => { s.sim.magnitude = num; }); return ctx.renderLeft(); }
    if (key === 'ds.maxEval') { if (num >= 2) edit((s) => { s.maxEvaluations = Math.round(num); }); return ctx.renderLeft(); }
    return undefined;
  }
  function set(key, value) {
    let m;
    if (key === 'ds.method') edit((s) => { s.method = value; });
    else if (key === 'ds.goalSense') edit((s) => { s.goal.sense = value; });
    else if (key === 'ds.dir') edit((s) => { s.sim.dir = value; });
    else if ((m = /^ds\.kind:(.+)$/.exec(key))) edit((s) => { s.vars[m[1]] = { ...(s.vars[m[1]] ?? { on: true }), kind: value }; });
    else if ((m = /^ds\.conOp:(\d+)$/.exec(key))) edit((s) => { const c = s.constraints[Number(m[1])]; if (c) c.op = value; });
    else return undefined;
    const e = editing(); if (owns(e)) e.result = null;
    return ctx.renderLeft();
  }
  function selectChange(key, value) {
    let m;
    if (key === 'ds.goalSensor') edit((s) => { s.goal.sensor = value; });
    else if ((m = /^ds\.conSensor:(\d+)$/.exec(key))) edit((s) => { const c = s.constraints[Number(m[1])]; if (c) c.sensor = value; });
    else return false;
    ctx.renderLeft();
    return true;
  }
  function toggle(key, checked) {
    let m;
    if ((m = /^ds\.on:(.+)$/.exec(key))) { edit((s) => { s.vars[m[1]] = { ...(s.vars[m[1]] ?? { kind: 'range' }), on: Boolean(checked) }; }); ctx.renderLeft(); return true; }
    if ((m = /^ds\.sensor:(.+)$/.exec(key))) { edit((s) => { const set2 = new Set(s.sensors); if (checked) set2.add(m[1]); else set2.delete(m[1]); s.sensors = SENSORS.filter((x) => set2.has(x)); }); ctx.renderLeft(); return true; }
    return false;
  }
  /** A face picked for the simulation setup: kept by its signature. */
  function pick(hit) {
    const e = editing(); if (!owns(e) || !e.pick) return undefined;
    if (hit?.kind !== 'face') { notify('info', t('notice.pickFace')); return undefined; }
    const face = state.partEntry?.faces?.[hit.index]; if (!face) return undefined;
    const sig = faceSignature(face);
    edit((s) => { const list = s.sim[e.pick]; const i = list.findIndex((x) => JSON.stringify(x.center) === JSON.stringify(sig.center)); if (i >= 0) list.splice(i, 1); else list.push(sig); });
    ctx.renderLeft();
    return undefined;
  }

  const NAMES = new Set(['ds.run', 'ds.apply', 'ds.csv', 'ds.addScenario', 'ds.delScenario', 'ds.addConstraint', 'ds.delConstraint', 'ds.pick', 'ds.clearFaces']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing(); const p = part(); const cur = p ? valuesOf(p) : {};
    switch (name) {
      case 'ds.run': return run();
      case 'ds.apply': return apply(Number(arg));
      case 'ds.csv': return exportCsv();
      case 'ds.addScenario': edit((s) => { s.scenarios.push({ name: `${t('ds.scenario')} ${s.scenarios.length + 1}`, values: Object.fromEntries(studyVariables(p).map((v) => [v.name, cur[v.name]])) }); }); return ctx.renderLeft();
      case 'ds.delScenario': edit((s) => { s.scenarios.splice(Number(arg), 1); }); return ctx.renderLeft();
      case 'ds.addConstraint': edit((s) => { s.constraints.push({ sensor: 'maxStress', op: '<=', value: 100 }); }); return ctx.renderLeft();
      case 'ds.delConstraint': edit((s) => { s.constraints.splice(Number(arg), 1); }); return ctx.renderLeft();
      case 'ds.pick': if (owns(e)) e.pick = e.pick === arg ? null : arg; return ctx.renderLeft();
      case 'ds.clearFaces': edit((s) => { s.sim.fixtures = []; s.sim.loads = []; }); return ctx.renderLeft();
      default: return undefined;
    }
  }

  const commands = {
    designStudy: { icon: 'designStudy', label: 'cmd.designStudy', enabled: () => Boolean(part()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
  };
  const api = { begin, run, apply, exportCsv, evaluateDesign, study: () => studyOf(), result: () => editing()?.result ?? null };
  return { commands, owns, pm, pick, field, set, select: selectChange, toggle, accept: () => finish(), handles, command, subject: () => t('cmd.designStudy'), finish, api };
}
