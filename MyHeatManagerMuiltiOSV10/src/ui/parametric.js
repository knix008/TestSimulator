// Parameter study (SimScale's design variants): one value of the model — a
// body's power, a boundary's coefficient or temperature, an inlet speed, a
// material's conductivity, the cell count — is swept over a range; the model
// is solved for each value and one result figure is tabulated and plotted.
// The open model is not changed unless the user applies a row.
import { h, replace, numberField } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { formatValue } from '../core/colormap.js';
import { engineModel, normalizeModel } from '../core/model.js';
import { runStudy, cancelStudy } from '../platform/solver.js';
import { drawLineChart } from './charts.js';

const BC_FIELDS = {
  temperature: ['T'], flux: ['q'], convection: ['h', 'Tinf'], radiation: ['emissivity', 'Tamb'], inlet: ['velocity', 'Tin'],
  open: ['Tinf'], contact: ['resistance'], voltage: ['V'], currentIn: ['I'], pressure: ['p'], force: ['fy'],
};
const UNITS = { T: '°C', Tinf: '°C', Tamb: '°C', Tin: '°C', q: 'W/m²', h: 'W/m²K', velocity: 'm/s', emissivity: '', resistance: 'm²K/W', V: 'V', I: 'A', p: 'Pa', fy: 'N' };

/** Every value the study can vary: { key, label, unit, get(model), set(model, value) → model }. */
export function parameterChoices(model) {
  const out = [];
  for (const body of model.bodies) {
    out.push({ key: `body:${body.id}:power`, label: `▣ ${body.name || body.id} · ${t('power')}`, unit: 'W', get: (m) => m.bodies.find((b) => b.id === body.id)?.power ?? 0, set: (m, v) => ({ ...m, bodies: m.bodies.map((b) => (b.id === body.id ? { ...b, power: v, powerProfile: null, current: null } : b)) }) });
  }
  for (const bc of model.boundaries) {
    for (const f of BC_FIELDS[bc.type] ?? []) {
      out.push({ key: `bc:${bc.id}:${f}`, label: `≋ ${bc.name || bc.id} · ${f}`, unit: UNITS[f] ?? '', get: (m) => m.boundaries.find((b) => b.id === bc.id)?.[f] ?? 0, set: (m, v) => ({ ...m, boundaries: m.boundaries.map((b) => (b.id === bc.id ? { ...b, [f]: v } : b)) }) });
    }
  }
  for (const mat of model.materials) {
    out.push({ key: `mat:${mat.id}:k`, label: `🧱 ${mat.name || mat.id} · k`, unit: 'W/m·K', get: (m) => m.materials.find((x) => x.id === mat.id)?.k ?? 1, set: (m, v) => ({ ...m, materials: m.materials.map((x) => (x.id === mat.id ? { ...x, k: v, kx: x.kx ? (x.kx * v) / x.k : x.kx, ky: x.ky ? (x.ky * v) / x.k : x.ky, kz: x.kz ? (x.kz * v) / x.k : x.kz } : x)) }) });
  }
  out.push({ key: 'domain:cells', label: `⬚ ${t('meshScale')}`, unit: '×', get: () => 1, set: (m, v) => ({ ...m, domain: { ...m.domain, nx: Math.max(2, Math.round(m.domain.nx * v)), ny: Math.max(2, Math.round(m.domain.ny * v)), nz: m.domain.dim === 3 ? Math.max(1, Math.round(m.domain.nz * v)) : m.domain.nz } }) });
  out.push({ key: 'ambient', label: `🌡 ${t('ambient')}`, unit: '°C', get: (m) => m.ambient, set: (m, v) => ({ ...m, ambient: v }) });
  return out;
}

/** Result figures to compare: { key, label, unit, of(header) }. */
export function metricChoices(model) {
  const out = [
    { key: 'Tmax', label: `${t('maxT')} (${t('temperature')})`, unit: '°C', of: (hd) => hd.stats.Tmax },
    { key: 'Tmin', label: `${t('minT')} (${t('temperature')})`, unit: '°C', of: (hd) => hd.stats.Tmin },
  ];
  for (const body of model.bodies) out.push({ key: `body:${body.id}`, label: `▣ ${body.name || body.id} · ${t('maxT')}`, unit: '°C', of: (hd) => hd.bodies?.find((b) => b.id === body.id)?.max });
  for (const probe of model.probes) out.push({ key: `probe:${probe.id}`, label: `⊕ ${probe.name || probe.id}`, unit: '°C', of: (hd) => { const v = hd.probes?.find((p) => p.id === probe.id)?.values; return v?.[v.length - 1]; } });
  for (const bc of model.boundaries) out.push({ key: `bc:${bc.id}`, label: `≋ ${bc.name || bc.id} · ${t('heat')}`, unit: 'W', of: (hd) => hd.boundaries?.find((b) => b.id === bc.id)?.heat });
  if (model.study.flow) out.push({ key: 'dp', label: t('pressureDrop'), unit: 'Pa', of: (hd) => hd.flow?.pressureDrop });
  if (model.study.stress) out.push({ key: 'vm', label: 'σ vM max', unit: 'MPa', of: (hd) => (hd.stats.vonMisesMax ?? NaN) / 1e6 });
  return out;
}

export function sweepValues(from, to, steps) {
  const n = Math.max(2, Math.round(steps));
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

export function showParametric(app, popup) {
  const model = app.doc().model;
  const params = parameterChoices(model);
  const metrics = metricChoices(model);
  let param = params[0];
  let metric = metrics[0];
  let from = 0;
  let to = 0;
  let steps = 5;
  let rows = [];
  let running = false;
  let cancelled = false;
  const setRange = () => {
    const v = param.get(model);
    from = v === 0 ? 0 : v * 0.5;
    to = v === 0 ? 1 : v * 1.5;
  };
  setRange();
  const form = h('div', { className: 'print-options' });
  const canvas = h('canvas', { style: { width: '100%', height: '220px', display: 'block' }, dataset: { testid: 'parametric-chart' } });
  const table = h('div', { className: 'scroll', style: { maxHeight: '180px' } });
  const status = h('p', { className: 'part-help', dataset: { testid: 'parametric-status' } });
  const sel = (value, options, onChange, testid) => h('select', { dataset: { testid }, onChange: (e) => onChange(e.target.value) }, ...options.map((o) => h('option', { value: o.key, selected: o.key === value }, o.label)));
  const row = (label, control) => h('div', { className: 'row' }, h('span', null, label), control);
  const renderForm = () => replace(form,
    row(t('parameter'), sel(param.key, params, (k) => { param = params.find((p) => p.key === k); setRange(); renderForm(); }, 'parametric-param')),
    row(`${t('from')} (${param.unit})`, numberField({ value: from, step: Math.abs(from) / 10 || 0.1, onChange: (v) => { from = v; } })),
    row(`${t('to')} (${param.unit})`, numberField({ value: to, step: Math.abs(to) / 10 || 0.1, onChange: (v) => { to = v; } })),
    row(t('steps'), numberField({ value: steps, min: 2, max: 40, step: 1, onChange: (v) => { steps = Math.round(v); } })),
    row(t('metric'), sel(metric.key, metrics, (k) => { metric = metrics.find((m) => m.key === k); renderResults(); }, 'parametric-metric')));
  const renderResults = () => {
    replace(table, h('table', { className: 'data-table' },
      h('thead', null, h('tr', null, h('th', null, `${param.label} (${param.unit})`), h('th', null, `${metric.label} (${metric.unit})`), h('th', null, ''))),
      h('tbody', null, ...rows.map((r) => {
        const value = r.header ? metric.of(r.header) : null;
        return h('tr', null, h('td', { className: 'num' }, formatValue(r.value)), h('td', { className: 'num' }, r.header ? formatValue(value) : r.error ?? '…'),
          h('td', null, r.header ? h('button', { type: 'button', title: t('applyValue'), onClick: () => { app.updateModel((m) => param.set(m, r.value), true); status.textContent = t('applied'); } }, t('apply')) : null));
      }))));
    const points = rows.filter((r) => r.header).map((r) => [r.value, metric.of(r.header)]).filter((pt) => Number.isFinite(pt[1]));
    requestAnimationFrame(() => {
      if (points.length) drawLineChart(canvas, [{ name: metric.label, points }], { xLabel: `${param.label} (${param.unit})`, yLabel: metric.unit });
      else canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    });
  };
  const run = async () => {
    if (running) return;
    running = true;
    cancelled = false;
    const values = sweepValues(from, to, steps);
    rows = values.map((value) => ({ value, header: null }));
    renderResults();
    const base = app.doc().model;
    for (let i = 0; i < rows.length && !cancelled; i++) {
      status.textContent = t('parametricRunning', { i: i + 1, n: rows.length });
      try {
        const result = await runStudy(engineModel(normalizeModel(param.set(base, rows[i].value))));
        rows[i].header = result.header;
      } catch (error) {
        rows[i].error = error.message === 'cancelled' ? '—' : error.message;
      }
      renderResults();
    }
    running = false;
    status.textContent = cancelled ? t('statusCancelled') : t('parametricDone', { n: rows.filter((r) => r.header).length });
  };
  renderForm();
  renderResults();
  status.textContent = t('parametricHint');
  popup({
    id: 'parametric', title: t('parametricTitle'), icon: '📊', width: 860, height: 640,
    body: h('div', { style: { display: 'grid', gridTemplateColumns: '330px minmax(0, 1fr)', gap: '14px', flex: '1 1 auto', minHeight: 0 } },
      h('div', null, form, status), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 } }, canvas, table)),
    actions: [
      { label: `▶ ${t('parametricRun')}`, primary: true, testid: 'parametric-run', onClick: () => run() },
      { label: `■ ${t('parametricStop')}`, testid: 'parametric-stop', onClick: () => { cancelled = true; cancelStudy(); } },
      { label: t('close'), onClick: (close) => { cancelled = true; if (running) cancelStudy(); close(); } },
    ],
  });
  void getLanguage;
}
