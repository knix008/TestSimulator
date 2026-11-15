// The simulation's own popup windows, drawn by popup.js's page:
//   settings tab "simulation" (editor, views, defaults),
//   "experiment"  — parameter variation, Monte Carlo replications, optimization,
//   "report"      — the run report (KPIs, advice, tables, charts) to print or save.
// `api` is popup.js's popupApi (frame, row, toggle, select, close, action …).

/** Settings › Simulation. */
export function renderSimSettings(api) {
  const { t, s, row, toggle, segmented, select } = api;
  return [
    row('viewSplit', t('settings.viewMode'), segmented('viewMode', [['2d', t('view.mode2d'), 'view2d'], ['3d', t('view.mode3d'), 'view3dBox'], ['split', t('view.modeSplit'), 'viewSplit']], s().viewMode)),
    row('grid', t('settings.snapStep'), select('data-select', 'snapStep', [[0, t('settings.snapOff')], [0.1, '0.1 m'], [0.25, '0.25 m'], [0.5, '0.5 m'], [1, '1 m'], [2, '2 m']], s().snapStep, t('settings.snapStep'))),
    toggle('showGrid', t('settings.showGrid'), 'grid'),
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
    row('info', '', `<span class="muted">${api.escapeHtml(t('settings.simHint'))}</span>`, t('settings.simHint')),
  ].join('');
}

const draftOf = (api) => {
  const st = api.state;
  if (!st.draft) {
    const p = api.P();
    st.draft = {
      kind: p.last?.kind ?? 'variation', parameter: p.last?.parameter ?? p.parameters?.[0]?.key ?? '', from: p.last?.from ?? 1, to: p.last?.to ?? 4, step: p.last?.step ?? 1,
      replications: p.last?.replications ?? 3, runs: p.last?.runs ?? 30, objective: p.last?.objective ?? 'throughput', goal: p.last?.goal ?? 'maximize',
    };
  }
  return st.draft;
};

function renderExperiment(api) {
  const { t, P, escapeHtml: e, icon, frame, button, row, select } = api;
  const p = P();
  const d = draftOf(api);
  const kinds = [['variation', 'experiment'], ['montecarlo', 'montecarlo'], ['optimize', 'optimize']];
  const params = p.parameters ?? [];
  const metrics = p.metrics ?? [];
  const current = params.find((x) => x.key === d.parameter);
  const values = [];
  if (d.kind !== 'montecarlo') for (let x = Number(d.from); x <= Number(d.to) + 1e-9 && values.length < 200; x += Math.max(1e-9, Number(d.step) || 1)) values.push(+x.toFixed(6));
  const total = d.kind === 'montecarlo' ? Number(d.runs) : values.length * Number(d.replications);
  const num = (key, label, glyph, min = '', step = 'any') => row(glyph, label, `<input type="number" data-draft="${key}" value="${e(d[key])}" ${min !== '' ? `min="${min}"` : ''} step="${step}"/>`);
  const body = `<div class="exp-setup">
    <div class="exp-kinds">${kinds.map(([id, glyph]) => `<button class="exp-kind ${d.kind === id ? 'active' : ''}" data-draft-segment="kind" data-value="${id}">${icon(glyph)}<b>${e(t(`exp.kind.${id}`))}</b><small>${e(t(`exp.kind.${id}.desc`))}</small></button>`).join('')}</div>
    ${d.kind !== 'montecarlo' ? row('fParameter', t('exp.parameter'), `<select data-draft-select="parameter">${params.map((x) => `<option value="${e(x.key)}" ${x.key === d.parameter ? 'selected' : ''}>${e(x.label)}${x.value != null ? ` (= ${e(x.value)})` : ''}</option>`).join('')}</select>`) : ''}
    ${d.kind !== 'montecarlo' ? `<div class="exp-range">${num('from', t('exp.from'), 'minus')}${num('to', t('exp.to'), 'plus')}${num('step', t('exp.step'), 'ruler', 0)}</div>` : ''}
    ${d.kind === 'montecarlo' ? num('runs', t('exp.runsCount'), 'dice', 2, 1) : num('replications', t('exp.replications'), 'dice', 1, 1)}
    ${row('fChart', t('exp.objective'), `<select data-draft-select="objective">${metrics.map((m) => `<option value="${e(m.key)}" ${m.key === d.objective ? 'selected' : ''}>${e(m.label)}</option>`).join('')}</select>`)}
    ${d.kind === 'optimize' ? row('optimize', t('exp.goal'), `<span class="segmented"><button class="segment ${d.goal === 'maximize' ? 'active' : ''}" data-draft-segment="goal" data-value="maximize">${icon('arrowUp')}${e(t('exp.maximize'))}</button><button class="segment ${d.goal === 'minimize' ? 'active' : ''}" data-draft-segment="goal" data-value="minimize">${icon('arrowDown')}${e(t('exp.minimize'))}</button></span>`) : ''}
    <p class="exp-summary">${icon('info')}<span>${e(t('exp.summary', { runs: total, values: values.length ? values.slice(0, 8).join(', ') + (values.length > 8 ? ' …' : '') : '—', current: current?.value ?? '—' }))}</span></p>
    ${p.notice ? `<p class="exp-summary danger-text">${icon('warning')}<span>${e(p.notice)}</span></p>` : ''}
  </div>`;
  api.root.innerHTML = frame({
    glyph: 'experiment', title: t('exp.title'), body,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('exp-run', t('exp.run'), 'runPlay', 'primary', '', total > 0 && (d.kind === 'montecarlo' || params.length) ? '' : 'disabled')}`,
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
  if (kind === 'report') { renderReport(api); return true; }
  return false;
}

/** Clicks, changes and inputs of the simulation popups; true when handled. */
export function simPopupAction(kind, target, api, type = 'click') {
  const action = target.dataset?.action;
  if (type === 'click' && action === 'progress-cancel') { api.state.cancelled = true; api.render(); api.action('progress-cancel', { op: api.P().op }); return true; }
  if (kind === 'experiment') {
    const d = draftOf(api);
    if (type === 'click' && target.dataset.draftSegment) { d[target.dataset.draftSegment] = target.dataset.value; api.render(); return true; }
    if (type === 'change' && target.dataset.draftSelect) { d[target.dataset.draftSelect] = target.value; if (target.dataset.draftSelect === 'parameter') seedRange(api, d); api.render(); return true; }
    if ((type === 'change') && target.dataset.draft) { d[target.dataset.draft] = target.value; api.render(); return true; }
    if (type === 'input' && target.dataset.draft) { d[target.dataset.draft] = target.value; return true; }
    if (type === 'click' && action === 'exp-run') { api.close({ config: { ...d, from: Number(d.from), to: Number(d.to), step: Number(d.step), replications: Number(d.replications), runs: Number(d.runs) } }); return true; }
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
  const param = (api.P().parameters ?? []).find((x) => x.key === d.parameter);
  const v = Number(param?.value);
  if (!Number.isFinite(v)) return;
  if (param.integer) { d.from = Math.max(param.min ?? 0, Math.max(1, Math.round(v / 2))); d.to = Math.max(Math.round(v * 2), v + 3); d.step = 1; }
  else { d.from = +(v * 0.5).toFixed(4); d.to = +(v * 1.5).toFixed(4); d.step = +(v * 0.1 || 0.1).toFixed(4); }
}

export function simHostMessage(kind, message, api) {
  if (kind === 'report' && message?.type === 'report-html') { api.state.params = { ...api.state.params, html: message.html }; api.render(); return true; }
  return false;
}
