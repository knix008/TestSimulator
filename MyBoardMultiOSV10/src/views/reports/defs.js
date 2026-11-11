// The reports: how each one is fetched (GET /reports/*), drawn (charts.js) and turned into CSV.
// The report page and the dashboard gadgets both use these.
//
//   REPORTS[id] = { icon, fetch(api, q) → data, draw(data, opts, size, colors, ctx) → { svg, tips, legend, counts, height? },
//                   csv(data, opts, ctx) → rows[][], summary?(data, opts, ctx) → [{ label, value }] }
// q: { boardId | projectId, from, to, … } — opts: the report's own settings — ctx: { lookups, L, lang }.
// Board scope: the board's RIGHTMOST column is the reference "done" column of every report (data.referenceColumn).
import { bars, donut, hbars, legendHtml, lines, scatter, seriesColor, stackedArea } from './charts.js';
import { escapeHtml } from '../../ui/dom.js';
import { renderIconRef } from '../../ui/iconref.js';

/** Reports whose "done" is the board's rightmost column (board scope). */
export const REF_REPORTS = new Set(['cfd', 'control', 'throughput', 'burndown', 'createdResolved', 'workload', 'version']);

/** The "기준 열: <column>" chip: the reference (rightmost) column with its icon. `col` = { id, name, icon }. */
export function refChipHtml(col, L, { size = 14, changeable = false } = {}) {
  if (!col) return '';
  // a button: it opens the choice of the reference column (the reports view; plain text inside a dashboard gadget)
  const tag = changeable ? 'button' : 'span';
  return `<${tag} ${changeable ? 'type="button" data-act="ref-column" ' : ''}class="rp-ref-chip${changeable ? ' changeable' : ''}" data-ref-column="${escapeHtml(col.id)}" title="${escapeHtml(L('refColumnTip', { name: col.name }))}">${renderIconRef(col.icon, { size, fallback: 'b:check' })}<span>${escapeHtml(L('refColumn'))}: <b>${escapeHtml(col.name)}</b></span>${changeable ? '<span class="rp-ref-caret" aria-hidden="true">▾</span>' : ''}</${tag}>`;
}

const DAY = 86400000;
export const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const days = (ms) => (ms == null ? null : Math.round((ms / DAY) * 10) / 10);

export function shortDate(value, lang, long = false) {
  const ms = typeof value === 'number' ? value : parseDay(value);
  if (!Number.isFinite(ms)) return String(value ?? '');
  return new Date(ms).toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR', long ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
}

/** Names of a breakdown key (ids of statuses, users, …). */
function keyName(field, key, ctx) {
  const lk = ctx.lookups;
  if (key == null || key === '') return ctx.L(field === 'assignee' || field === 'reporter' ? 'unassigned' : field === 'resolution' ? 'unresolved' : 'none');
  switch (field) {
    case 'status': return lk.statuses.get(key)?.name ?? key;
    case 'type': return lk.types.get(key)?.name ?? key;
    case 'priority': return lk.priorities.get(key)?.name ?? key;
    case 'assignee': case 'reporter': return lk.userName(key) || key;
    case 'project': { const p = lk.projects.get(key); return p ? `${p.name} (${p.key})` : key; }
    case 'epic': { const e = lk.epicOf(key); return e ? `${e.key} ${e.summary}` : key; }
    case 'resolution': return lk.resolutions.get(key)?.name ?? key;
    case 'component': return lk.components.get(key)?.name ?? key;
    default: return String(key);
  }
}

export const BREAKDOWN_FIELDS = ['status', 'assignee', 'priority', 'type', 'project', 'reporter', 'epic', 'resolution', 'labels', 'component'];

export const REPORTS = {
  cfd: {
    icon: 'layers',
    fetch: (api, q) => api.report('cfd', q),
    series(data, colors) { return data.columns.map((c, i) => ({ id: c.id, name: c.name, icon: c.icon ?? null, color: seriesColor(colors, i) })); },
    draw(data, opts, size, colors, ctx) {
      const hidden = new Set(opts.hidden ?? []);
      const all = this.series(data, colors);
      const byId = new Map(data.series.map((s) => [s.columnId, s.values]));
      // Done at the bottom, the backlog on top (the order work flows through the board).
      const shown = all.filter((s) => !hidden.has(s.id)).map((s) => ({ ...s, values: byId.get(s.id) ?? [] })).reverse();
      const out = stackedArea({ ...size, colors, labels: data.days, series: shown, formatLabel: (d, long) => shortDate(d, ctx.lang, long), title: ctx.L('r_cfd') });
      return { ...out, legend: legendHtml(all, { toggles: true, hidden }) };
    },
    csv(data) {
      return [['Date', ...data.columns.map((c) => c.name)], ...data.days.map((d, i) => [d, ...data.series.map((s) => s.values[i] ?? 0)])];
    },
    summary(data, opts, ctx) {
      const last = data.days.length - 1;
      return data.columns.map((c, i) => ({ label: c.name, value: data.series[i]?.values[last] ?? 0 })).concat([{ label: ctx.L('total'), value: data.series.reduce((a, s) => a + (s.values[last] ?? 0), 0) }]);
    },
  },

  control: {
    icon: 'speed',
    fetch: (api, q) => api.report('control', q),
    draw(data, opts, size, colors, ctx) {
      const pts = data.points.map((p) => ({ x: p.completedAt, y: (opts.metric === 'lead' ? p.leadTime : p.cycleTime) / DAY, key: p.key, summary: p.summary }));
      // Rolling average and a ±1 standard deviation band over the same window the core uses.
      const w = Math.max(1, data.window ?? 5);
      const line = [];
      const band = [];
      pts.forEach((p, k) => {
        const win = pts.slice(Math.max(0, k - w + 1), k + 1).map((q) => q.y);
        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length);
        line.push({ x: p.x, y: mean });
        band.push({ x: p.x, lo: mean - sd, hi: mean + sd });
      });
      const stats = opts.metric === 'lead' ? data.lead : data.cycle;
      const out = scatter({
        ...size, colors, points: pts, line, band, mean: stats.average != null ? stats.average / DAY : null, from: data.from, to: data.to,
        formatX: (v, long) => shortDate(v, ctx.lang, long), formatY: (v, long) => (long ? ctx.L('daysN', { n: Math.round(v * 10) / 10 }) : `${Math.round(v * 10) / 10}`),
        names: { cycle: ctx.L(opts.metric === 'lead' ? 'leadTime' : 'cycleTime'), done: ctx.L('completed') }, title: ctx.L('r_control'),
      });
      const legend = legendHtml([
        { name: ctx.L('issueDot'), color: colors.series[0] }, { name: ctx.L('rollingAverage', { n: w }), color: colors.series[1] },
        { name: ctx.L('stddevBand'), color: `color-mix(in srgb, ${colors.series[0]} 25%, transparent)` }, { name: ctx.L('mean'), color: colors.muted, dash: true },
      ]);
      return { ...out, legend };
    },
    csv(data) {
      return [['Key', 'Summary', 'Completed', 'Cycle time (days)', 'Lead time (days)'], ...data.points.map((p) => [p.key, p.summary, isoDay(p.completedAt), days(p.cycleTime), days(p.leadTime)])];
    },
    summary(data, opts, ctx) {
      const s = opts.metric === 'lead' ? data.lead : data.cycle;
      const d = (v) => (v == null ? '—' : ctx.L('daysN', { n: days(v) }));
      return [{ label: ctx.L('issues'), value: s.count }, { label: ctx.L('mean'), value: d(s.average) }, { label: ctx.L('median'), value: d(s.median) }, { label: ctx.L('min'), value: d(s.min) }, { label: ctx.L('max'), value: d(s.max) }, { label: ctx.L('stddev'), value: d(s.stddev) }];
    },
  },

  throughput: {
    icon: 'viewReports',
    fetch: (api, q) => api.report('throughput', q),
    draw(data, opts, size, colors, ctx) {
      const points = opts.metric === 'points';
      const values = data.buckets.map((b) => (points ? b.points : b.count));
      const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const out = bars({
        ...size, colors, labels: data.buckets.map((b) => b.date), values, average, color: colors.series[0], valueName: ctx.L(points ? 'storyPoints' : 'completedIssues'), averageName: ctx.L('average'),
        formatLabel: (d, long) => (long && data.interval === 'week' ? ctx.L('weekOf', { date: shortDate(d, ctx.lang, true) }) : shortDate(d, ctx.lang, long)), title: ctx.L('r_throughput'),
      });
      return { ...out, legend: legendHtml([{ name: ctx.L(points ? 'storyPoints' : 'completedIssues'), color: colors.series[0] }, { name: ctx.L('average'), color: colors.text, dash: true }]) };
    },
    csv(data) { return [['Start', 'Completed issues', 'Story points'], ...data.buckets.map((b) => [b.date, b.count, b.points])]; },
    summary(data, opts, ctx) {
      const total = data.buckets.reduce((a, b) => a + b.count, 0);
      return [{ label: ctx.L('completedIssues'), value: total }, { label: ctx.L('storyPoints'), value: data.buckets.reduce((a, b) => a + b.points, 0) }, { label: ctx.L(data.interval === 'day' ? 'perDay' : 'perWeek'), value: Math.round(data.average * 10) / 10 }];
    },
  },

  // Burndown: the work left each day — issues not (yet) in the reference ("done") column, from the cumulative
  // flow data — against the ideal line from the first day's amount down to zero on the last day, and the scope.
  burndown: {
    icon: 'trendDown',
    fetch: (api, q) => api.report('cfd', q),
    remaining(data) {
      const done = data.doneColumnId ?? data.referenceColumn?.id ?? data.columns.at(-1)?.id;
      const scope = data.days.map((_, i) => data.series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
      const left = data.days.map((_, i) => data.series.reduce((a, s) => a + (s.columnId === done ? 0 : s.values[i] ?? 0), 0));
      // the ideal line starts on the first day with any work (a new board has nothing before) and reaches 0 on the last day
      const n = data.days.length;
      const first = Math.max(0, scope.findIndex((v) => v > 0));
      const start = left[first] ?? 0;
      const span = n - 1 - first;
      const ideal = data.days.map((_, i) => (i < first ? null : span <= 0 ? 0 : Math.round((start * (1 - (i - first) / span)) * 10) / 10));
      return { scope, left, ideal, first };
    },
    draw(data, opts, size, colors, ctx) {
      const { scope, left, ideal } = this.remaining(data);
      const series = [
        { name: ctx.L('remainingIssues'), color: colors.series[0], values: left, area: true },
        { name: ctx.L('idealLine'), color: colors.text, values: ideal, dash: true },
        { name: ctx.L('scope'), color: colors.series[4], values: scope },
      ];
      const out = lines({ ...size, colors, labels: data.days, series, formatLabel: (d, long) => shortDate(d, ctx.lang, long), title: ctx.L('r_burndown') });
      return { ...out, legend: legendHtml(series) };
    },
    csv(data) {
      const { scope, left, ideal } = this.remaining(data);
      return [['Date', 'Remaining issues', 'Ideal', 'Scope'], ...data.days.map((d, i) => [d, left[i], ideal[i], scope[i]])];
    },
    summary(data, opts, ctx) {
      const { scope, left, first } = this.remaining(data);
      const last = left.at(-1) ?? 0;
      // burned = what reached the reference column over the period (the done count now minus on the first day)
      const burned = Math.max(0, ((scope.at(-1) ?? 0) - last) - ((scope[first] ?? 0) - (left[first] ?? 0)));
      return [{ label: ctx.L('remainingIssues'), value: last }, { label: ctx.L('burned'), value: burned }, { label: ctx.L('scope'), value: scope.at(-1) ?? 0 }, { label: ctx.L('scopeChange'), value: (scope.at(-1) ?? 0) - (scope[first] ?? 0) }];
    },
  },

  createdResolved: {
    icon: 'routeCurved',
    fetch: (api, q) => api.report('created-resolved', q),
    draw(data, opts, size, colors, ctx) {
      const cumulative = opts.mode !== 'daily';
      const series = [
        { name: ctx.L('created'), color: colors.series[7], values: data.days.map((d) => (cumulative ? d.cumulativeCreated : d.created)) },
        { name: ctx.L('resolved'), color: colors.series[2], values: data.days.map((d) => (cumulative ? d.cumulativeResolved : d.resolved)) },
      ];
      const out = lines({ ...size, colors, labels: data.days.map((d) => d.date), series, fillBetween: [0, 1], markers: !cumulative, formatLabel: (d, long) => shortDate(d, ctx.lang, long), title: ctx.L('r_createdResolved') });
      return { ...out, legend: legendHtml([...series, { name: ctx.L('moreCreated'), color: `color-mix(in srgb, ${colors.bad} 30%, transparent)` }, { name: ctx.L('moreResolved'), color: `color-mix(in srgb, ${colors.good} 30%, transparent)` }]) };
    },
    csv(data) { return [['Date', 'Created', 'Resolved', 'Cumulative created', 'Cumulative resolved'], ...data.days.map((d) => [d.date, d.created, d.resolved, d.cumulativeCreated, d.cumulativeResolved])]; },
    summary(data, opts, ctx) { return [{ label: ctx.L('created'), value: data.created }, { label: ctx.L('resolved'), value: data.resolved }, { label: ctx.L('difference'), value: data.created - data.resolved }]; },
  },

  workload: {
    icon: 'user',
    fetch: (api, q) => api.report('workload', q),
    draw(data, opts, size, colors, ctx) {
      const metric = opts.metric ?? 'count';
      const value = (it) => (metric === 'points' ? it.points : metric === 'remaining' ? Math.round((it.remaining / 3600) * 10) / 10 : it.count);
      const rows = data.items.map((it) => ({ label: it.name ?? ctx.L('unassigned'), value: value(it), extra: [{ name: ctx.L('issues'), value: it.count }, { name: ctx.L('storyPoints'), value: it.points }, { name: ctx.L('remaining'), value: ctx.L('hoursN', { n: Math.round((it.remaining / 3600) * 10) / 10 }) }] }));
      const name = ctx.L(metric === 'points' ? 'storyPoints' : metric === 'remaining' ? 'remainingHours' : 'openIssues');
      const out = hbars({ width: size.width, colors, rows, color: colors.series[0], valueName: name, title: ctx.L('r_workload') });
      return { ...out, legend: legendHtml([{ name, color: colors.series[0] }]) };
    },
    csv(data) { return [['Assignee', 'Open issues', 'Story points', 'Remaining (hours)'], ...data.items.map((it) => [it.name ?? '', it.count, it.points, Math.round((it.remaining / 3600) * 10) / 10])]; },
    summary(data, opts, ctx) { return [{ label: ctx.L('openIssues'), value: data.total }, { label: ctx.L('people'), value: data.items.filter((i) => i.userId).length }, { label: ctx.L('unassigned'), value: data.items.find((i) => !i.userId)?.count ?? 0 }]; },
  },

  version: {
    icon: 'calendar',
    needsVersion: true,
    fetch: (api, q) => api.report(`version/${encodeURIComponent(q.versionId)}`, q.boardId ? { boardId: q.boardId } : {}),
    draw(data, opts, size, colors, ctx) {
      // Burn-up: scope and done per day; a dashed forecast from today to the predicted release date.
      const labels = data.burnup.map((b) => b.date);
      const scope = data.burnup.map((b) => b.scope);
      const done = data.burnup.map((b) => b.done);
      const forecast = labels.map(() => null);
      const predicted = data.predictedReleaseDate;
      if (predicted && labels.length && predicted > labels.at(-1)) {
        const last = labels.at(-1);
        forecast[forecast.length - 1] = done.at(-1);
        const steps = Math.min(180, Math.round((parseDay(predicted) - parseDay(last)) / DAY));
        for (let i = 1; i <= steps; i++) {
          labels.push(isoDay(parseDay(last) + i * DAY));
          scope.push(scope.at(-1));
          done.push(null);
          forecast.push(done[data.burnup.length - 1] + ((scope.at(-1) - done[data.burnup.length - 1]) * i) / steps);
        }
      }
      const unit = ctx.L(data.unit === 'storyPoints' ? 'storyPoints' : 'issues');
      const series = [
        { name: ctx.L('scope'), color: colors.muted, values: scope },
        { name: ctx.L('done'), color: colors.series[2], values: done, area: true },
        { name: ctx.L('forecast'), color: colors.series[2], values: forecast, dash: true },
      ];
      const release = data.version.releaseDate;
      const extra = ({ x, plot }) => {
        let s = '';
        const mark = (date, label, color) => {
          const i = labels.indexOf(date);
          if (i < 0) return;
          s += `<line x1="${x(i)}" x2="${x(i)}" y1="${plot.top}" y2="${plot.bottom}" stroke="${color}" stroke-dasharray="4 3"/><text x="${x(i) > plot.right - 90 ? x(i) - 4 : x(i) + 4}" y="${plot.top + 10}" text-anchor="${x(i) > plot.right - 90 ? 'end' : 'start'}" fill="${color}" font-weight="600">${label.replace(/[<&>"]/g, '')}</text>`;
        };
        if (release) mark(release, ctx.L('releaseDate'), colors.text);
        if (predicted && predicted !== release) mark(predicted, ctx.L('predicted'), colors.series[2]);
        return s;
      };
      const out = lines({ ...size, colors, labels, series, formatLabel: (d, long) => shortDate(d, ctx.lang, long), extra, title: `${ctx.L('r_version')} · ${data.version.name} (${unit})` });
      return { ...out, legend: legendHtml(series.map((s) => ({ ...s, name: `${s.name}` }))) };
    },
    csv(data) { return [['Date', 'Scope', 'Done'], ...data.burnup.map((b) => [b.date, b.scope, b.done])]; },
    summary(data, opts, ctx) {
      return [
        { label: ctx.L('issues'), value: data.total }, { label: ctx.L('cat_done'), value: data.byCategory.done }, { label: ctx.L('cat_inprogress'), value: data.byCategory.inprogress }, { label: ctx.L('cat_todo'), value: data.byCategory.todo },
        { label: ctx.L('storyPoints'), value: `${data.points.done} / ${data.points.total}` }, { label: ctx.L('releaseDate'), value: data.version.releaseDate ? shortDate(data.version.releaseDate, ctx.lang, true) : '—' },
        { label: ctx.L('predicted'), value: data.predictedReleaseDate ? shortDate(data.predictedReleaseDate, ctx.lang, true) : ctx.L('noForecast') },
      ];
    },
  },

  breakdown: {
    icon: 'percent',
    fetch: (api, q) => api.report('breakdown', { jql: q.jql ?? '', field: q.field ?? 'status' }),
    items(data, colors, ctx) {
      const field = data.field;
      const list = data.items.map((it) => ({ key: it.key, label: keyName(field, it.key, ctx), value: it.count }));
      const top = list.slice(0, 7);
      const rest = list.slice(7);
      const items = top.map((it, i) => ({ ...it, color: seriesColor(colors, i) }));
      if (rest.length) items.push({ key: '__other', label: ctx.L('other', { n: rest.length }), value: rest.reduce((a, b) => a + b.value, 0), color: colors.other });
      return items;
    },
    draw(data, opts, size, colors, ctx) {
      const items = this.items(data, colors, ctx);
      if (opts.chart === 'bar') {
        const out = hbars({ width: size.width, colors, rows: items.map((it) => ({ label: it.label, value: it.value })), color: colors.series[0], valueName: ctx.L('issues'), title: ctx.L('r_breakdown') });
        return { ...out, legend: '' };
      }
      const out = donut({ ...size, colors, items, total: data.total, centerLabel: ctx.L('issues'), title: ctx.L('r_breakdown') });
      return { ...out, legend: size.width < 380 ? legendHtml(items.map((it) => ({ name: `${it.label} · ${it.value}`, color: it.color }))) : '' };
    },
    csv(data, opts, ctx) { return [[data.field, 'Count'], ...data.items.map((it) => [keyName(data.field, it.key, ctx), it.count])]; },
    summary(data, opts, ctx) { return [{ label: ctx.L('issues'), value: data.total }, { label: ctx.L('groups'), value: data.items.length }]; },
  },
};

export const REPORT_IDS = Object.keys(REPORTS);
