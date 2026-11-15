// The simulation's own popup windows, drawn by popup.js's page:
//   settings tab "simulation" (editor, views, defaults),
//   "experiment"  — parameter variation, Monte Carlo replications, optimization, sensitivity analysis,
//                   multi-parameter optimization,
//   "report"      — the run report (KPIs, advice, tables, charts) to print or save.
// `api` is popup.js's popupApi (frame, row, toggle, select, close, action …).

import { renderPrintWindow, renderReportWindow, reportHostMessage, reportPopupAction } from './popups-report.js';

/** Settings › Simulation. */
export function renderSimSettings(api) {
  const { t, s, row, toggle, segmented, select } = api;
  return [
    row('viewSplit', t('settings.viewMode'), segmented('viewMode', [['2d', t('view.mode2d'), 'view2d'], ['3d', t('view.mode3d'), 'view3dBox'], ['split', t('view.modeSplit'), 'viewSplit']], s().viewMode)),
    row('grid', t('settings.snapStep'), select('data-select', 'snapStep', [[0, t('settings.snapOff')], [0.1, '0.1 m'], [0.25, '0.25 m'], [0.5, '0.5 m'], [1, '1 m'], [2, '2 m']], s().snapStep, t('settings.snapStep'))),
    toggle('showGrid', t('settings.showGrid'), 'grid'),
    toggle('showRulers', t('settings.showRulers'), 'rulers'),
    toggle('showPorts', t('settings.showPorts'), 'connectTool'),
    toggle('showLabels', t('settings.showLabels'), 'textTool'),
    toggle('showLinks', t('settings.showLinks'), 'polyline'),
    toggle('heatmap', t('settings.heatmap'), 'heatmap'),
    toggle('autoCheck', t('settings.autoCheck'), 'problems'),
    toggle('view3dShadows', t('settings.view3dShadows'), 'shadow'),
    toggle('view3dLabels', t('settings.view3dLabels'), 'tag'),
    row('quality', t('settings.view3dQuality'), segmented('view3dQuality', [['fast', t('quality.fast')], ['balanced', t('quality.balanced')], ['high', t('quality.high')]], s().view3dQuality)),
    row('clock', t('settings.defaultTimeUnit'), select('data-select', 'defaultTimeUnit', ['s', 'min', 'h', 'day'].map((u) => [u, t(`unit.${u}`)]), s().defaultTimeUnit, t('settings.defaultTimeUnit'))),
    row('speed', t('settings.defaultSpeed'), select('data-select', 'defaultSpeed', [0.25, 0.5, 1, 2, 4, 10, 30, 100, 1000].map((v) => [v, `×${v}`]), s().defaultSpeed, t('settings.defaultSpeed'))),
    api.note(t('settings.simHint')),
  ].join('');
}

const draftOf = (api) => {
  const st = api.state;
  if (!st.draft) {
    const p = api.P();
    st.draft = {
      kind: p.last?.kind ?? 'variation', parameter: p.last?.parameter ?? p.parameters?.[0]?.key ?? '', from: p.last?.from ?? 1, to: p.last?.to ?? 4, step: p.last?.step ?? 1,
      replications: p.last?.replications ?? 3, runs: p.last?.runs ?? 30, objective: p.last?.objective ?? 'throughput', goal: p.last?.goal ?? 'maximize',
      // Sensitivity: the parameters to vary and by how much; multi-parameter optimization: up to 4 ranges and a run budget.
      sens: p.last?.sens ?? (p.parameters ?? []).slice(0, 6).map((x) => x.key), percent: p.last?.percent ?? 20,
      multi: p.last?.multi ?? (p.parameters ?? []).slice(0, 2).map((x) => ({ parameter: x.key, ...rangeFor(x) })), budget: p.last?.budget ?? 40,
    };
  }
  return st.draft;
};

function renderExperiment(api) {
  const { t, P, escapeHtml: e, icon, frame, button, row, select } = api;
  const p = P();
  const d = draftOf(api);
  const kinds = [['variation', 'experiment'], ['montecarlo', 'montecarlo'], ['optimize', 'optimize'], ['sensitivity', 'fTornado'], ['multiopt', 'fMultiOpt']];
  const params = p.parameters ?? [];
  const metrics = p.metrics ?? [];
  const current = params.find((x) => x.key === d.parameter);
  const values = [];
  const single = d.kind === 'variation' || d.kind === 'optimize';
  if (single) for (let x = Number(d.from); x <= Number(d.to) + 1e-9 && values.length < 200; x += Math.max(1e-9, Number(d.step) || 1)) values.push(+x.toFixed(6));
  const gridSize = (a) => Math.max(1, Math.min(500, Math.floor((Number(a.to) - Number(a.from)) / Math.max(1e-9, Math.abs(Number(a.step)) || 1) + 1e-9) + 1));
  const space = d.multi.reduce((n, a) => n * gridSize(a), 1);
  const reps = Math.max(1, Number(d.replications) || 1);
  const total = d.kind === 'montecarlo' ? Number(d.runs) : d.kind === 'sensitivity' ? (1 + 2 * d.sens.length) * reps : d.kind === 'multiopt' ? Math.min(Number(d.budget) || 0, space) * reps : values.length * Number(d.replications);
  const options = (sel) => params.map((x) => `<option value="${e(x.key)}" ${x.key === sel ? 'selected' : ''}>${e(x.label)}${x.value != null ? ` (= ${e(x.value)})` : ''}</option>`).join('');
  const UNITS = { percent: '%', budget: t('unit.runs'), replications: t('unit.runs'), runs: t('unit.runs'), from: current?.unit ?? '', to: current?.unit ?? '', step: current?.unit ?? '' };
  const num = (key, label, glyph, min = '', step = 'any') => row(glyph, label, `<input type="number" data-draft="${key}" data-unit="${e(UNITS[key] ?? '')}" value="${e(d[key])}" ${min !== '' ? `min="${min}"` : ''} step="${step}"/>`);
  const body = `<div class="exp-setup">
    <div class="exp-kinds">${kinds.map(([id, glyph]) => `<button class="exp-kind ${d.kind === id ? 'active' : ''}" data-draft-segment="kind" data-value="${id}">${icon(glyph)}<b>${e(t(`exp.kind.${id}`))}</b><small>${e(t(`exp.kind.${id}.desc`))}</small></button>`).join('')}</div>
    ${single ? row('fParameter', t('exp.parameter'), `<select data-draft-select="parameter">${options(d.parameter)}</select>`) : ''}
    ${single ? `<div class="exp-range">${num('from', t('exp.from'), 'minus')}${num('to', t('exp.to'), 'plus')}${num('step', t('exp.step'), 'ruler', 0)}</div>` : ''}
    ${d.kind === 'sensitivity' ? `<div class="exp-checks" role="group" aria-label="${e(t('exp.sensParams'))}"><b>${icon('fParameter')}${e(t('exp.sensParams'))}</b>${params.map((x) => `<label class="exp-check"><input type="checkbox" data-sens-key="${e(x.key)}" ${d.sens.includes(x.key) ? 'checked' : ''}/><span>${e(x.label)}${x.value != null ? ` <small>(= ${e(x.value)})</small>` : ''}</span></label>`).join('')}</div>${num('percent', t('exp.percent'), 'ruler', 1)}` : ''}
    ${d.kind === 'multiopt' ? `<div class="exp-multi">${d.multi.map((a, i) => `<div class="exp-multi-row"><select data-multi="${i}:parameter" aria-label="${e(t('exp.parameter'))}">${options(a.parameter)}</select>${['from', 'to', 'step'].map((k) => `<label><small>${e(t(`exp.${k}`))}</small><input type="number" step="any" data-multi="${i}:${k}" data-unit="${e(params.find((x) => x.key === a.parameter)?.unit ?? '')}" value="${e(a[k])}"/></label>`).join('')}<small class="muted">${gridSize(a)}</small><button class="icon-button" data-action="multi-remove" data-index="${i}" title="${e(t('exp.removeParam'))}" aria-label="${e(t('exp.removeParam'))}" ${d.multi.length < 2 ? 'disabled' : ''}>${icon('close')}</button></div>`).join('')}${d.multi.length < 4 && params.length > d.multi.length ? `<button class="button small" data-action="multi-add">${icon('plus')}<span>${e(t('exp.addParam'))}</span></button>` : ''}</div>${num('budget', t('exp.budget'), 'hourglass', 2, 1)}` : ''}
    ${d.kind === 'montecarlo' ? num('runs', t('exp.runsCount'), 'dice', 2, 1) : num('replications', t('exp.replications'), 'dice', 1, 1)}
    ${row('fChart', t('exp.objective'), `<select data-draft-select="objective">${metrics.map((m) => `<option value="${e(m.key)}" ${m.key === d.objective ? 'selected' : ''}>${e(m.label)}</option>`).join('')}</select>`)}
    ${d.kind === 'optimize' || d.kind === 'multiopt' ? row('optimize', t('exp.goal'), `<span class="segmented"><button class="segment ${d.goal === 'maximize' ? 'active' : ''}" data-draft-segment="goal" data-value="maximize">${icon('arrowUp')}${e(t('exp.maximize'))}</button><button class="segment ${d.goal === 'minimize' ? 'active' : ''}" data-draft-segment="goal" data-value="minimize">${icon('arrowDown')}${e(t('exp.minimize'))}</button></span>`) : ''}
    <p class="exp-summary">${icon('info')}<span>${e(d.kind === 'sensitivity' ? t('exp.sensSummary', { runs: total, n: d.sens.length, p: d.percent }) : d.kind === 'multiopt' ? t('exp.multiSummary', { runs: total, space, n: d.multi.length }) : t('exp.summary', { runs: total, values: values.length ? values.slice(0, 8).join(', ') + (values.length > 8 ? ' …' : '') : '—', current: current?.value ?? '—' }))}</span></p>
    ${p.notice ? `<p class="exp-summary danger-text">${icon('warning')}<span>${e(p.notice)}</span></p>` : ''}
  </div>`;
  api.root.innerHTML = frame({
    glyph: 'experiment', title: t('exp.title'), body,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('exp-run', t('exp.run'), 'runPlay', 'primary', '', total > 0 && (d.kind === 'montecarlo' || params.length) && (d.kind !== 'sensitivity' || d.sens.length) ? '' : 'disabled')}`,
  });
  void select;
  api.ready();
}

function renderReport(api) {
  const { t, P, frame, button } = api;
  const p = P();
  api.root.innerHTML = frame({
    glyph: 'report', title: `${t('report.title')} — ${p.name ?? ''}`,
    body: `<div class="report-page" id="report-page">${p.html ?? ''}</div>`,
    foot: `${button('report-csv', t('report.csv'), 'csvFile')}${button('report-html', t('report.saveHtml'), 'htmlFile')}<span class="grow"></span>${button('report-print', t('action.print'), 'print')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
  api.ready();
}

export function renderSimPopup(kind, api) {
  if (kind === 'experiment') { renderExperiment(api); return true; }
  if (kind === 'report') { renderReportWindow(api); return true; }
  if (kind === 'print') { renderPrintWindow(api); return true; }
  return false;
}

/** Clicks, changes and inputs of the simulation popups; true when handled. */
export function simPopupAction(kind, target, api, type = 'click') {
  if (reportPopupAction(kind, target, api, type)) return true;
  const action = target.dataset?.action;
  if (type === 'click' && action === 'progress-cancel') { api.state.cancelled = true; api.render(); api.action('progress-cancel', { op: api.P().op }); return true; }
  if (kind === 'experiment') {
    const d = draftOf(api);
    if (type === 'click' && target.dataset.draftSegment) { d[target.dataset.draftSegment] = target.dataset.value; api.render(); return true; }
    if (type === 'change' && target.dataset.draftSelect) { d[target.dataset.draftSelect] = target.value; if (target.dataset.draftSelect === 'parameter') seedRange(api, d); api.render(); return true; }
    if ((type === 'change') && target.dataset.draft) { d[target.dataset.draft] = target.value; api.render(); return true; }
    if (type === 'change' && target.dataset.sensKey) { const k = target.dataset.sensKey; d.sens = target.checked ? [...new Set([...d.sens, k])] : d.sens.filter((x) => x !== k); api.render(); return true; }
    if ((type === 'change' || type === 'input') && target.dataset.multi) {
      const [i, field] = target.dataset.multi.split(':'); const a = d.multi[Number(i)];
      if (!a) return true;
      if (field === 'parameter') { a.parameter = target.value; Object.assign(a, rangeFor((api.P().parameters ?? []).find((x) => x.key === a.parameter))); api.render(); return true; }
      a[field] = target.value;
      if (type === 'change') api.render();
      return true;
    }
    if (type === 'click' && action === 'multi-add') { const used = new Set(d.multi.map((a) => a.parameter)); const next = (api.P().parameters ?? []).find((x) => !used.has(x.key)); if (next) d.multi.push({ parameter: next.key, ...rangeFor(next) }); api.render(); return true; }
    if (type === 'click' && action === 'multi-remove') { d.multi.splice(Number(target.dataset.index), 1); api.render(); return true; }
    if (type === 'input' && target.dataset.draft) { d[target.dataset.draft] = target.value; return true; }
    if (type === 'click' && action === 'exp-run') { api.close({ config: { ...d, from: Number(d.from), to: Number(d.to), step: Number(d.step), replications: Number(d.replications), runs: Number(d.runs), percent: Number(d.percent), budget: Number(d.budget), multi: d.multi.map((a) => ({ parameter: a.parameter, from: Number(a.from), to: Number(a.to), step: Number(a.step) })) } }); return true; }
  }
  if (kind === 'report' && type === 'click') {
    if (action === 'report-print') { window.print(); return true; }
    if (action === 'report-html') { api.action('report-save-html'); return true; }
    if (action === 'report-csv') { api.action('report-save-csv'); return true; }
  }
  return false;
}

/** A new parameter: a range around its current value. */
function seedRange(api, d) {
  const range = rangeFor((api.P().parameters ?? []).find((x) => x.key === d.parameter));
  if (range) Object.assign(d, range);
}
function rangeFor(param) {
  const v = Number(param?.value);
  if (!Number.isFinite(v)) return { from: 1, to: 4, step: 1 };
  if (param.integer) return { from: Math.max(param.min ?? 0, Math.max(1, Math.round(v / 2))), to: Math.max(Math.round(v * 2), v + 3), step: 1 };
  return { from: +(v * 0.5).toFixed(4), to: +(v * 1.5).toFixed(4), step: +(v * 0.1 || 0.1).toFixed(4) };
}

export function simHostMessage(kind, message, api) {
  if (reportHostMessage(kind, message, api)) return true;
  if (kind === 'report' && message?.type === 'report-html') { api.state.params = { ...api.state.params, html: message.html }; api.render(); return true; }
  return false;
}
