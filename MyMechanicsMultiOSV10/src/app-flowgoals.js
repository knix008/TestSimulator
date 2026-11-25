// Goals and parametric studies of the flow study (app-sim2.js chains these in): the goals to report — global ones,
// pressures and forces on picked faces (kept by signature, so a rebuilt part finds them again), speeds, pressure and
// temperature in a box —, whether each settled, stopping a steady run when its goals settle, and a parametric study
// that runs the flow once per value of the inlet velocity, inlet temperature, rotation speed or a global variable of
// the part (rebuilt each time) and tabulates and plots the goals (CSV export). Calculations: cad/cfd/goals.js.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { GLOBAL_GOALS, SURFACE_GOALS, VOLUME_GOALS, evaluateGoals, goalValue, parameterValues, parametricStudy, parametricCsv } from './cad/cfd/goals.js';
import { faceSignature, findFace } from './cad/refs.js';
import { variableValues } from './cad/params.js';

export function createFlowGoals(ctx) {
  const { t } = ctx;
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v) ? '—' : ctx.fmt(v, d));

  function init(e) {
    e.goals ??= [{ kind: 'global', id: 'drag' }];
    e.goalStop ??= false; e.goalTol ??= 0.5;
    e.goalSurfKind ??= 'pAvg'; e.goalVolKind ??= 'vAvg'; e.goalFaces ??= [];
    e.goalBox ??= null;
    e.param ??= { name: 'velocity', from: 0.5, to: 2, steps: 4 };
  }

  /** A goal's label. */
  function goalName(g) {
    if (g.kind === 'global') return t(`goal.${g.id}`);
    if (g.kind === 'surface') return `${t(`goal.s.${g.id}`)} (${t('goal.faces', { n: g.faces?.length ?? 0 })})`;
    return `${t(`goal.v.${g.id}`)} (${t('goal.box')})`;
  }

  /** The goals with their faces found on a body (faces by signature → mesh face ids). */
  function resolved(goals, body) {
    return goals.map((g) => (g.kind === 'surface' ? { ...g, faceIds: (g.faces ?? []).map((s) => findFace(body, s)?.hashCode).filter((x) => x != null) } : g));
  }

  function pm(e, { body, pmGroup, pmSeg, pmNum, pmButton, pmList, check }) {
    init(e);
    const rows = e.goals.map((g, i) => `<div class="cfg-row"><span class="grow">${escapeHtml(goalName(g))}</span><button type="button" class="icon-button" data-pm="goal.del:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const have = new Set(e.goals.filter((g) => g.kind === 'global').map((g) => g.id));
    const globalSel = `<p class="pm-note">${escapeHtml(t('goal.addGlobal'))}</p>${pmSeg('goal.addGlobal', Object.keys(GLOBAL_GOALS).filter((k) => !have.has(k)).map((k) => [k, t(`goal.${k}`), 'plus']), '')}`;
    const surf = `${pmSeg('goal.surfKind', Object.keys(SURFACE_GOALS).map((k) => [k, t(`goal.s.${k}`), 'femPressure']), e.goalSurfKind)}${pmList('goalFaces', e.goalFaces.map((x, i) => `${t('pm.face')} ${i + 1}`), t('goal.pickFaces'), 'femPressure', e.pick === 'goalFaces')}<div class="pm-row-buttons">${pmButton('goal.addSurface', 'plus', t('goal.addSurface'))}</div>`;
    const box = e.goalBox;
    const vol = `${pmSeg('goal.volKind', Object.keys(VOLUME_GOALS).map((k) => [k, t(`goal.v.${k}`), 'sim2Flow']), e.goalVolKind)}${box ? ['lo', 'hi'].flatMap((w) => [0, 1, 2].map((a) => pmNum(`goal.box.${w}.${a}`, box[w][a], `${t(`goal.box.${w}`)} ${'XYZ'[a]} (mm)`, 'position'))).join('') : ''}<div class="pm-row-buttons">${box ? '' : pmButton('goal.boxDefault', 'boundingBox', t('goal.boxDefault'))}${pmButton('goal.addVolume', 'plus', t('goal.addVolume'), box ? '' : 'disabled')}</div>`;
    // Values of the last run.
    let res = '';
    if (e.result?.ok) {
      const list = evaluateGoals(e.result, state().partEntry?.mesh, resolved(e.goals, body), { tol: e.goalTol / 100 });
      res = `<table class="sim2-table goal-table"><tr><th>${escapeHtml(t('goal.goal'))}</th><th>${escapeHtml(t('goal.value'))}</th><th>${escapeHtml(t('goal.settled'))}</th></tr>${list.map((r) => `<tr><td>${escapeHtml(goalName(r.goal))}</td><td>${escapeHtml(`${fmt(r.value)} ${r.unit}`)}</td><td class="${r.settled ? '' : 'error'}">${r.settled ? '✓' : '✗'}${r.drift != null ? ` ${fmt(100 * r.drift, 2)} %` : ''}</td></tr>`).join('')}</table>`;
    }
    const goals = pmGroup('goal', t('goal.title'), `<div class="custom-list">${rows || `<p class="pm-note">${escapeHtml(t('goal.none'))}</p>`}</div>${globalSel}
      <p class="pm-note">${escapeHtml(t('goal.surface'))}</p>${surf}
      <p class="pm-note">${escapeHtml(t('goal.volume'))}</p>${vol}
      ${check('goalStop', e.goalStop, 'femSteady', t('goal.stop'))}${e.goalStop ? pmNum('goalTol', e.goalTol, `${t('goal.tol')} (%)`, 'femSteady') : ''}${res}`);
    // The parametric study.
    const vars = [...(variableValues(ctx.activePart() ?? { variables: [] }).values.keys())];
    const params = [['velocity', t('goal.p.velocity'), 'sim2Flow'], ['inletT', t('goal.p.inletT'), 'femHeat'], ['rpm', t('goal.p.rpm'), 'rotateTool'], ...vars.map((v) => [`var:${v}`, v, 'equation'])];
    const st = e.paramStudy;
    const table = st ? `<table class="sim2-table goal-table"><tr><th>${escapeHtml(paramLabel(e.param.name))}</th>${st.goals.map((g) => `<th>${escapeHtml(goalName(g))}</th>`).join('')}</tr>${st.rows.map((r) => `<tr class="${r.ok ? '' : 'error'}"><td>${escapeHtml(fmt(r.value))}</td>${r.goals.map((v) => `<td>${escapeHtml(fmt(v))}</td>`).join('')}</tr>`).join('')}</table>${st.rows.length > 1 && st.goals.length ? ctx.fem.chart(st.rows.map((r) => r.value), st.rows.map((r) => r.goals[e.paramPlot ?? 0] ?? 0), 'force') : ''}${st.goals.length > 1 ? pmSeg('goal.plot', st.goals.map((g, i) => [String(i), goalName(g)]), String(e.paramPlot ?? 0)) : ''}` : '';
    const param = pmGroup('designStudy', t('goal.param'), `${pmSeg('goal.param', params, e.param.name)}${pmNum('goal.from', e.param.from, t('goal.from'), 'smartDim')}${pmNum('goal.to', e.param.to, t('goal.to'), 'smartDim')}${pmNum('goal.steps', e.param.steps, t('goal.steps'), 'statistics')}
      <p class="pm-note">${escapeHtml(t('goal.paramHelp', { n: parameterValues(e.param).length }))}</p><div class="pm-row-buttons">${pmButton('goal.runParam', 'play', t('goal.runParam'), 'primary')}${st ? pmButton('goal.csv', 'export', t('goal.csv')) : ''}</div>${table}`);
    return goals + param;
  }
  const state = () => ctx.state;
  const paramLabel = (name) => (name.startsWith('var:') ? name.slice(4) : t(`goal.p.${name}`));

  function pick(e, hit, face) {
    if (e.pick !== 'goalFaces') return false;
    init(e);
    const sig = faceSignature(face);
    const i = e.goalFaces.findIndex((x) => x.index === hit.index);
    if (i >= 0) e.goalFaces.splice(i, 1); else e.goalFaces.push({ index: hit.index, sig });
    ctx.renderLeft();
    return true;
  }

  /** The default box: the middle third of the flow domain's extent around the part. */
  function defaultBox() {
    const b = state().partEntry?.body?.boundingBox?.bounds;
    if (!b) return { lo: [0, 0, 0], hi: [10, 10, 10] };
    const [lo, hi] = b, d = [0, 1, 2].map((a) => hi[a] - lo[a]);
    return { lo: lo.map((v, a) => Math.round((v - d[a] / 2) * 100) / 100), hi: hi.map((v, a) => Math.round((v + d[a] / 2) * 100) / 100) };
  }

  function select(e, key, value) {
    if (key !== 'goal.addGlobal' || !value) return false;
    init(e);
    if (!e.goals.some((g) => g.kind === 'global' && g.id === value)) e.goals.push({ kind: 'global', id: value });
    ctx.renderLeft();
    return true;
  }
  function set(e, key, value) {
    init(e);
    if (key === 'goal.addGlobal') return select(e, key, value);
    if (key === 'goal.surfKind') { e.goalSurfKind = value; ctx.renderLeft(); return true; }
    if (key === 'goal.volKind') { e.goalVolKind = value; ctx.renderLeft(); return true; }
    if (key === 'goal.param') { e.param = { ...e.param, name: value }; e.paramStudy = null; ctx.renderLeft(); return true; }
    if (key === 'goal.plot') { e.paramPlot = Number(value) || 0; ctx.renderLeft(); return true; }
    return false;
  }
  function field(e, key, v) {
    init(e);
    if (v == null) return false;
    if (key === 'goalTol') { e.goalTol = Math.max(0.01, v); ctx.renderLeft(); return true; }
    if (key === 'goal.from' || key === 'goal.to') { e.param = { ...e.param, [key.slice(5)]: v }; ctx.renderLeft(); return true; }
    if (key === 'goal.steps') { e.param = { ...e.param, steps: Math.max(1, Math.min(30, Math.round(v))) }; ctx.renderLeft(); return true; }
    const m = /^goal\.box\.(lo|hi)\.([012])$/.exec(key);
    if (m && e.goalBox) { e.goalBox[m[1]][Number(m[2])] = v; ctx.renderLeft(); return true; }
    return false;
  }
  function toggle(e, key, checked) {
    if (key !== 'goalStop') return false;
    init(e); e.goalStop = checked; ctx.renderLeft();
    return true;
  }
  const NAMES = new Set(['goal.del', 'goal.addSurface', 'goal.addVolume', 'goal.boxDefault', 'goal.runParam', 'goal.csv']);
  const handles = (name) => NAMES.has(name);
  async function command(e, name, arg, run) {
    init(e);
    if (name === 'goal.del') { e.goals.splice(Number(arg), 1); ctx.renderLeft(); return true; }
    if (name === 'goal.addSurface') {
      if (!e.goalFaces.length) { e.pick = 'goalFaces'; ctx.notify('info', t('goal.pickFaces')); ctx.renderLeft(); return true; }
      e.goals.push({ kind: 'surface', id: e.goalSurfKind, faces: e.goalFaces.map((x) => x.sig) });
      e.goalFaces = []; e.pick = null; ctx.renderLeft(); return true;
    }
    if (name === 'goal.boxDefault') { e.goalBox = defaultBox(); ctx.renderLeft(); return true; }
    if (name === 'goal.addVolume') { if (e.goalBox) e.goals.push({ kind: 'volume', id: e.goalVolKind, box: structuredClone(e.goalBox) }); ctx.renderLeft(); return true; }
    if (name === 'goal.runParam') { await runParametric(e, run); return true; }
    if (name === 'goal.csv') {
      const st = e.paramStudy; if (!st) return true;
      await ctx.saveExport(`${ctx.activePart()?.name ?? 'flow'} - ${t('goal.param')}.csv`, 'csv', parametricCsv(st, paramLabel(e.param.name), st.goals.map(goalName)), 'text/csv');
      return true;
    }
    return false;
  }

  /**
   * The parametric study: for each value, the study's inputs changed (or the part rebuilt with the variable) and the
   * flow run in the worker; the goals read from each result. `run(e, part, entry)` → the flow result.
   */
  async function runParametric(e, run) {
    const p = ctx.activePart(); const entry0 = state().partEntry;
    if (!p || !entry0) return null;
    const values = parameterValues(e.param);
    const goals = e.goals.slice();
    const name = e.param.name;
    const saved = { velocity: e.velocity, inletT: e.inletT, rpm: e.rpm, rotOn: e.rotOn, thermalOn: e.thermalOn };
    let cancelled = false;
    try {
      const study = await parametricStudy(values, async (value) => {
        let entry = entry0, part = p;
        if (name === 'velocity') e.velocity = value;
        else if (name === 'inletT') { e.inletT = value; e.thermalOn = true; }
        else if (name === 'rpm') { e.rpm = value; e.rotOn = true; }
        else if (name.startsWith('var:')) {
          const v = name.slice(4);
          part = { ...p, variables: (p.variables ?? []).map((x) => (x.name === v ? { ...x, expr: String(value) } : x)) };
          entry = ctx.buildPart(part, { slot: 'flowParam' });
          if (!entry?.body) return { result: { error: 'rebuild' } };
        }
        const result = await run(e, part, entry);
        if (!result) { cancelled = true; return { result: { error: 'cancelled' } }; }
        return { result, mesh: entry.mesh, goals: resolved(goals, entry.body) };
      }, goals.map((g) => g), {
        cancel: () => cancelled,
        onRow: () => {},
      });
      // Surface goals of rebuilt parts: re-evaluated with their own faces (goalValue on the mesh given per run).
      e.paramStudy = { ...study, goals };
      ctx.notify('success', t('goal.paramDone', { n: study.rows.filter((r) => r.ok).length }));
    } finally {
      Object.assign(e, saved);
      ctx.renderLeft();
    }
    return e.paramStudy;
  }

  return { init, pm, pick, select, set, field, toggle, handles, command, resolved, goalName, runParametric };
}
export { goalValue };
