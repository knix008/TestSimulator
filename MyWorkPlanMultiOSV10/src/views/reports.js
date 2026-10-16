// Reports (MS Project's Report tab): dashboards built from the schedule —
// project overview, cost, work, burndown, critical / late / upcoming tasks,
// milestones and resources. Charts are SVG; every report can be copied as text
// or printed.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { formatDuration, formatMoney } from '../domain/duration.js';
import { dayOf, dayStart, formatDay, nowMin } from '../domain/time.js';
import { assignmentLoad } from '../domain/schedule.js';

export const REPORTS = [
  ['overview', 'reportOverview'], ['cost', 'reportCost'], ['work', 'reportWork'], ['burndown', 'burndown'], ['critical', 'reportCritical'],
  ['late', 'reportLate'], ['upcoming', 'reportUpcoming'], ['milestones', 'reportMilestones'], ['resources', 'reportResources'],
];

/** Plain-text rows of a report (copy / tests). */
export function reportData(id, project, sched, now = nowMin()) {
  const leaves = project.tasks.filter((task) => !sched.info(task.id)?.summary && task.active !== false).map((task) => ({ task, info: sched.info(task.id) }));
  switch (id) {
    case 'critical': return leaves.filter((r) => r.info.critical);
    case 'late': return leaves.filter((r) => r.info.late);
    case 'milestones': return leaves.filter((r) => r.task.milestone);
    case 'upcoming': {
      const from = sched.statusDate ?? now;
      return leaves.filter((r) => r.info.start >= from - 1440 * 0 && r.info.start <= from + 14 * 1440 && (r.info.percentComplete ?? 0) < 100).sort((a, b) => a.info.start - b.info.start);
    }
    default: return leaves;
  }
}

/** Cumulative series over time: planned (baseline), scheduled and actual cost or remaining work. */
export function series(project, sched, kind) {
  const from = dayOf(sched.start);
  const to = Math.max(dayOf(sched.finish), from + 1);
  const steps = Math.min(60, to - from + 1);
  const days = Array.from({ length: steps }, (_, i) => Math.round(from + ((to - from) * i) / Math.max(1, steps - 1)));
  const leaves = project.tasks.filter((task) => !sched.info(task.id)?.summary && task.active !== false);
  const share = (start, finish, day) => {
    const end = dayStart(day + 1);
    if (end <= start) return 0;
    if (end >= finish || finish <= start) return 1;
    return (end - start) / (finish - start);
  };
  const value = (task, info) => (kind === 'cost' ? info.cost : info.work);
  const baseValue = (task, info) => (kind === 'cost' ? info.baseline?.cost ?? 0 : info.baseline?.work ?? 0);
  const total = leaves.reduce((sum, task) => sum + value(task, sched.info(task.id)), 0);
  const status = sched.statusDate ?? nowMin();
  return days.map((day) => {
    let planned = 0;
    let scheduled = 0;
    let actual = 0;
    for (const task of leaves) {
      const info = sched.info(task.id);
      scheduled += value(task, info) * share(info.start, info.finish, day);
      if (info.baseline) planned += baseValue(task, info) * share(info.baseline.start, info.baseline.finish, day);
      if (dayStart(day) <= status) actual += value(task, info) * Math.min(share(info.start, info.finish, day), (info.percentComplete ?? 0) / 100);
    }
    return { day, planned, scheduled, actual: dayStart(day) <= status ? actual : null, remaining: total - actual };
  });
}

/**
 * A report as plain data for export (HTML, Markdown, Word, PDF): title, project,
 * date and blocks — kpis, donut, bars, line, table, note. `app` is the view API
 * (project, sched, settings, fieldCtx, taskFieldMap).
 */
export function reportModel(app, id = 'overview') {
  const project = app.project();
  const sched = app.sched();
  const options = project.options;
  const money = (v) => formatMoney(v ?? 0, options.currency);
  const hours = (v) => formatDuration(v ?? 0, 'h', options, getLanguage());
  const days = (v) => formatDuration(v ?? 0, 'd', options, getLanguage());
  const date = (v) => formatDay(v, app.settings().dateFormat);
  const ctx = app.fieldCtx();
  const map = app.taskFieldMap();
  const taskRows = (rows, fields, title) => ({
    type: 'table', title,
    columns: [{ label: t('field.id'), align: 'right' }, ...fields.map((f) => ({ label: t(`field.${f}`), align: map.get(f)?.align ?? 'left' }))],
    rows: rows.map(({ task, info }) => [String(info.row ?? ''), ...fields.map((f) => {
      const field = map.get(f);
      const value = field.get(ctx, task, info);
      return String((field.text ? field.text(ctx, value, task, info) : value) ?? '');
    })]),
    empty: t('report.none'),
  });
  const line = (title, points, keys, format, note) => ({
    type: 'line', title, note,
    ticks: ((max) => [0, 0.5, 1].map((f) => format(max * f)))(Math.max(1, ...points.flatMap((p) => keys.map(([key]) => p[key] ?? 0)))),
    series: keys.map(([key, tone]) => ({ key, tone, label: t(`report.series.${key}`) })),
    points: points.map((p) => ({ label: date(dayStart(p.day)), values: Object.fromEntries(keys.map(([key]) => [key, p[key] ?? null])), texts: Object.fromEntries(keys.map(([key]) => [key, p[key] == null ? '' : format(p[key])])) })),
  });
  const bars = (title, items, format, legend) => ({
    type: 'bars', title, legend, empty: t('report.none'),
    items: items.map((item) => ({ label: String(item.label ?? ''), value: item.value ?? 0, second: item.second ?? null, tone: item.cls || null, text: format(item.value ?? 0), secondText: item.second != null ? format(item.second) : '' })),
  });
  const blocks = [];
  if (id === 'overview') {
    const late = reportData('late', project, sched).length;
    const critical = reportData('critical', project, sched).length;
    blocks.push({ type: 'kpis', items: [
      { label: t('field.start'), value: date(sched.start) }, { label: t('field.finish'), value: date(sched.finish) },
      { label: t('field.duration'), value: days(sched.duration) }, { label: t('field.cost'), value: money(sched.cost) },
      { label: t('field.work'), value: hours(sched.work) }, { label: t('report.lateCount'), value: String(late), tone: late ? 'bad' : 'good' },
      { label: t('report.criticalCount'), value: String(critical) },
    ] });
    blocks.push({ type: 'donut', title: t('report.complete'), percent: sched.percentComplete ?? 0, label: t('field.percentComplete') });
    blocks.push(bars(t('report.phases'), project.tasks.filter((task) => task.outlineLevel === 1).map((task) => ({ label: task.name, value: sched.info(task.id)?.percentComplete ?? 0 })), (v) => `${v}%`));
    blocks.push(taskRows(reportData('milestones', project, sched).filter((r) => (r.info.percentComplete ?? 0) < 100).slice(0, 6), ['name', 'finish', 'finishVariance'], t('report.nextMilestones')));
  } else if (id === 'cost') {
    blocks.push({ type: 'kpis', items: [{ label: t('field.cost'), value: money(sched.cost) }, { label: t('field.actualCost'), value: money(sched.actualCost) }, { label: t('field.remainingCost'), value: money(sched.cost - sched.actualCost) }] });
    blocks.push(line(t('report.cumulativeCost'), series(project, sched, 'cost'), [['planned', 'planned'], ['scheduled', 'scheduled'], ['actual', 'actual']], money));
    blocks.push(bars(t('report.costByPhase'), project.tasks.filter((task) => task.outlineLevel === 1).map((task) => ({ label: task.name, value: sched.info(task.id)?.cost ?? 0, second: sched.info(task.id)?.baseline?.cost })), money,
      [{ tone: 'scheduled', label: t('field.cost') }, { tone: 'planned', label: t('report.series.planned') }]));
    blocks.push(bars(t('report.costByResource'), project.resources.map((r) => ({ label: r.name, value: sched.resources.get(r.id)?.cost ?? 0 })).sort((a, b) => b.value - a.value), money));
  } else if (id === 'work') {
    blocks.push({ type: 'kpis', items: [{ label: t('field.work'), value: hours(sched.work) }, { label: t('field.actualWork'), value: hours(sched.actualWork) }, { label: t('field.remainingWork'), value: hours(sched.work - sched.actualWork) }] });
    blocks.push(bars(t('report.workByResource'), project.resources.filter((r) => r.type === 'work').map((r) => {
      const info = sched.resources.get(r.id);
      return { label: r.name, value: info?.work ?? 0, second: info?.actualWork ?? 0, cls: info?.overallocated ? 'over' : '' };
    }), hours, [{ tone: 'scheduled', label: t('field.work') }, { tone: 'actual', label: t('field.actualWork') }]));
    const from = dayOf(sched.start);
    const to = dayOf(sched.finish);
    const weeks = [];
    for (let d = from; d <= to; d += 7) weeks.push({ day: d, work: 0 });
    for (const a of project.assignments) assignmentLoad(sched, a.id, from, to).forEach((m, i) => { const w = weeks[Math.floor(i / 7)]; if (w) w.work += m; });
    blocks.push(bars(t('report.workByWeek'), weeks.map((w) => ({ label: date(dayStart(w.day)), value: w.work })), hours));
  } else if (id === 'burndown') {
    const points = series(project, sched, 'work').map((p) => ({ ...p, remaining: p.actual == null ? null : p.remaining, remainingPlan: (sched.work - p.scheduled) }));
    blocks.push(line(t('report.burndownTitle'), points, [['remainingPlan', 'scheduled'], ['remaining', 'actual']], hours, t('report.burndownHint')));
  } else if (['critical', 'late', 'upcoming', 'milestones'].includes(id)) {
    const fields = {
      critical: ['name', 'duration', 'start', 'finish', 'totalSlack', 'resourceNames', 'percentComplete'],
      late: ['name', 'start', 'finish', 'percentComplete', 'resourceNames', 'finishVariance'],
      upcoming: ['name', 'start', 'finish', 'duration', 'resourceNames'],
      milestones: ['name', 'finish', 'baselineFinish', 'finishVariance', 'percentComplete'],
    }[id];
    blocks.push({ type: 'note', text: t(`report.${id}Hint`) });
    blocks.push(taskRows(reportData(id, project, sched), fields, ''));
  } else if (id === 'resources') {
    blocks.push({
      type: 'table', title: '', empty: t('graph.noResources'),
      columns: [{ label: t('field.name') }, { label: t('field.resourceType') }, { label: t('field.work'), align: 'right' }, { label: t('field.cost'), align: 'right' }, { label: t('field.peak'), align: 'right' }, { label: t('field.overallocated'), align: 'center' }],
      rows: project.resources.map((r) => {
        const info = sched.resources.get(r.id);
        return [r.name, t(`resourceType.${r.type}`), r.type === 'work' ? hours(info?.work) : '', money(info?.cost ?? 0), r.type === 'work' ? `${Math.round((info?.peak ?? 0) * 100)}%` : '', info?.overallocated ? '!' : ''];
      }),
    });
  }
  return {
    id, title: t(`report.${id}`), project: project.title || '', date: date(nowMin()), language: getLanguage(), blocks,
    labels: { item: t('report.exportItem'), value: t('report.exportValue'), date: t('report.exportDate'), generated: t('report.exportGenerated') },
  };
}

export class ReportsView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('reports-view');
    host.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-report]');
      if (tab) { app.doc().view.report = tab.dataset.report; this.render(); return; }
      const row = event.target.closest('[data-task]');
      if (row) app.selectTask(row.dataset.task, event);
      const action = event.target.closest('[data-report-action]');
      if (action?.dataset.reportAction === 'export') app.run('exportReport', { element: action });
      if (action?.dataset.reportAction === 'copy') app.run('copyReport');
      if (action?.dataset.reportAction === 'print') app.run('print');
    });
    host.addEventListener('dblclick', (event) => {
      const row = event.target.closest('[data-task]');
      if (row) app.openTaskInfo(row.dataset.task);
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const row = event.target.closest('[data-task]');
      if (row) { app.selectTask(row.dataset.task, {}); app.contextMenu(event, 'bar', { id: row.dataset.task }); } else app.contextMenu(event, 'report', {});
    });
  }

  get report() {
    return this.app.doc().view.report ?? 'overview';
  }

  render() {
    const id = this.report;
    const body = {
      overview: () => this.overview(), cost: () => this.costReport(), work: () => this.workReport(), burndown: () => this.burndown(),
      critical: () => this.taskTable('critical'), late: () => this.taskTable('late'), upcoming: () => this.taskTable('upcoming'),
      milestones: () => this.taskTable('milestones'), resources: () => this.resourceTable(),
    }[id]?.() ?? '';
    this.host.innerHTML = `
      <nav class="report-tabs" role="tablist">${REPORTS.map(([report, glyph]) => `<button class="report-tab ${report === id ? 'active' : ''}" data-report="${report}" role="tab" aria-selected="${report === id}" title="${escapeHtml(t(`report.${report}`))}">${icon(glyph)}<span>${escapeHtml(t(`report.${report}`))}</span></button>`).join('')}</nav>
      <div class="report-page">
        <div class="report-title">${icon(REPORTS.find(([r]) => r === id)?.[1] ?? 'viewReports')}<h2>${escapeHtml(t(`report.${id}`))}</h2><span class="muted">${escapeHtml(this.app.project().title)} · ${escapeHtml(formatDay(nowMin(), this.app.settings().dateFormat))}</span><span class="grow"></span>
          <button class="small-button" data-report-action="export" title="${escapeHtml(t('tip.exportReport'))}">${icon('exportReport')}<span>${escapeHtml(t('action.exportReport'))}</span></button>
          <button class="small-button" data-report-action="copy" title="${escapeHtml(t('action.copyReport'))}">${icon('copyReport')}<span>${escapeHtml(t('action.copyReport'))}</span></button>
          <button class="small-button" data-report-action="print" title="${escapeHtml(t('action.print'))}">${icon('print')}<span>${escapeHtml(t('action.print'))}</span></button></div>
        ${body}
      </div>`;
  }

  money(value) { return formatMoney(value, this.app.project().options.currency); }
  hours(value) { return formatDuration(value ?? 0, 'h', this.app.project().options, getLanguage()); }
  days(value) { return formatDuration(value ?? 0, 'd', this.app.project().options, getLanguage()); }
  date(value) { return formatDay(value, this.app.settings().dateFormat); }

  kpi(glyph, label, value, cls = '') {
    return `<div class="kpi ${cls}">${icon(glyph)}<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div></div>`;
  }

  donut(percent, label) {
    const r = 54;
    const c = 2 * Math.PI * r;
    return `<svg class="donut" viewBox="0 0 140 140" width="150" height="150"><circle class="donut-bg" cx="70" cy="70" r="${r}"/><circle class="donut-fg" cx="70" cy="70" r="${r}" stroke-dasharray="${(c * percent) / 100} ${c}" transform="rotate(-90 70 70)"/><text x="70" y="68" class="donut-value">${percent}%</text><text x="70" y="90" class="donut-label">${escapeHtml(label)}</text></svg>`;
  }

  barChart(items, format) {
    const max = Math.max(1, ...items.map((item) => Math.max(item.value, item.second ?? 0)));
    return `<div class="hbars">${items.map((item) => `<div class="hbar-row" title="${escapeHtml(`${item.label}: ${format(item.value)}`)}"><span class="hbar-label">${escapeHtml(item.label)}</span>
      <span class="hbar-track"><i class="hbar ${item.cls ?? ''}" style="width:${(item.value / max) * 100}%"></i>${item.second != null ? `<i class="hbar second" style="width:${(item.second / max) * 100}%"></i>` : ''}</span>
      <span class="hbar-value">${escapeHtml(format(item.value))}</span></div>`).join('') || `<div class="muted">${escapeHtml(t('report.none'))}</div>`}</div>`;
  }

  lineChart(points, keys, format) {
    const W = 640;
    const H = 220;
    const max = Math.max(1, ...points.flatMap((p) => keys.map(([key]) => p[key] ?? 0)));
    const x = (i) => 40 + (i / Math.max(1, points.length - 1)) * (W - 60);
    const y = (v) => H - 24 - (v / max) * (H - 44);
    const lines = keys.map(([key, cls]) => {
      const pts = points.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key])}`)).filter(Boolean);
      return pts.length ? `<polyline class="line ${cls}" points="${pts.join(' ')}"/>` : '';
    }).join('');
    const ticks = [0, 0.5, 1].map((f) => `<text x="4" y="${y(max * f) + 4}" class="axis-text">${escapeHtml(format(max * f))}</text><line class="axis" x1="40" x2="${W - 20}" y1="${y(max * f)}" y2="${y(max * f)}"/>`).join('');
    const dates = [0, Math.floor(points.length / 2), points.length - 1].map((i) => points[i] ? `<text x="${x(i)}" y="${H - 6}" class="axis-text middle">${escapeHtml(this.date(dayStart(points[i].day)))}</text>` : '').join('');
    return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${ticks}${lines}${dates}</svg>
      <div class="chart-legend">${keys.map(([key, cls]) => `<span><i class="${cls}"></i>${escapeHtml(t(`report.series.${key}`))}</span>`).join('')}</div>`;
  }

  overview() {
    const project = this.app.project();
    const sched = this.app.sched();
    const phases = project.tasks.filter((task) => task.outlineLevel === 1).map((task) => ({ label: task.name, value: sched.info(task.id)?.percentComplete ?? 0 }));
    const late = reportData('late', project, sched).length;
    const critical = reportData('critical', project, sched).length;
    const milestones = reportData('milestones', project, sched).filter((r) => (r.info.percentComplete ?? 0) < 100).slice(0, 6);
    return `<div class="kpis">
        ${this.kpi('calendar', t('field.start'), this.date(sched.start))}
        ${this.kpi('flag', t('field.finish'), this.date(sched.finish))}
        ${this.kpi('hourglass', t('field.duration'), this.days(sched.duration))}
        ${this.kpi('money', t('field.cost'), this.money(sched.cost))}
        ${this.kpi('reportWork', t('field.work'), this.hours(sched.work))}
        ${this.kpi('reportLate', t('report.lateCount'), String(late), late ? 'bad' : 'good')}
        ${this.kpi('reportCritical', t('report.criticalCount'), String(critical))}
      </div>
      <div class="report-cards">
        <section class="card"><h3>${icon('percent')}${escapeHtml(t('report.complete'))}</h3>${this.donut(sched.percentComplete ?? 0, t('field.percentComplete'))}</section>
        <section class="card wide"><h3>${icon('summaryBar')}${escapeHtml(t('report.phases'))}</h3>${this.barChart(phases, (v) => `${v}%`)}</section>
        <section class="card wide"><h3>${icon('reportMilestones')}${escapeHtml(t('report.nextMilestones'))}</h3>${this.rowsTable(milestones, ['name', 'finish', 'finishVariance'])}</section>
      </div>`;
  }

  costReport() {
    const project = this.app.project();
    const sched = this.app.sched();
    const byPhase = project.tasks.filter((task) => task.outlineLevel === 1).map((task) => ({ label: task.name, value: sched.info(task.id)?.cost ?? 0, second: sched.info(task.id)?.baseline?.cost }));
    const byResource = project.resources.map((r) => ({ label: r.name, value: sched.resources.get(r.id)?.cost ?? 0 })).sort((a, b) => b.value - a.value);
    return `<div class="kpis">${this.kpi('money', t('field.cost'), this.money(sched.cost))}${this.kpi('reportCost', t('field.actualCost'), this.money(sched.actualCost))}${this.kpi('flag', t('field.remainingCost'), this.money(sched.cost - sched.actualCost))}</div>
      <div class="report-cards">
        <section class="card wide"><h3>${icon('burndown')}${escapeHtml(t('report.cumulativeCost'))}</h3>${this.lineChart(series(project, sched, 'cost'), [['planned', 'planned'], ['scheduled', 'scheduled'], ['actual', 'actual']], (v) => this.money(v))}</section>
        <section class="card"><h3>${icon('summaryBar')}${escapeHtml(t('report.costByPhase'))}</h3>${this.barChart(byPhase, (v) => this.money(v))}</section>
        <section class="card"><h3>${icon('reportResources')}${escapeHtml(t('report.costByResource'))}</h3>${this.barChart(byResource, (v) => this.money(v))}</section>
      </div>`;
  }

  workReport() {
    const project = this.app.project();
    const sched = this.app.sched();
    const byResource = project.resources.filter((r) => r.type === 'work').map((r) => {
      const info = sched.resources.get(r.id);
      return { label: r.name, value: info?.work ?? 0, second: info?.actualWork ?? 0, cls: info?.overallocated ? 'over' : '' };
    });
    // Work per week of the whole plan.
    const from = dayOf(sched.start);
    const to = dayOf(sched.finish);
    const weeks = [];
    for (let d = from; d <= to; d += 7) weeks.push({ day: d, work: 0 });
    for (const a of project.assignments) {
      const load = assignmentLoad(sched, a.id, from, to);
      load.forEach((m, i) => { const w = weeks[Math.floor(i / 7)]; if (w) w.work += m; });
    }
    return `<div class="kpis">${this.kpi('reportWork', t('field.work'), this.hours(sched.work))}${this.kpi('check', t('field.actualWork'), this.hours(sched.actualWork))}${this.kpi('hourglass', t('field.remainingWork'), this.hours(sched.work - sched.actualWork))}</div>
      <div class="report-cards">
        <section class="card wide"><h3>${icon('reportResources')}${escapeHtml(t('report.workByResource'))}</h3>${this.barChart(byResource, (v) => this.hours(v))}<div class="chart-legend"><span><i class="scheduled"></i>${escapeHtml(t('field.work'))}</span><span><i class="actual"></i>${escapeHtml(t('field.actualWork'))}</span></div></section>
        <section class="card wide"><h3>${icon('viewResourceGraph')}${escapeHtml(t('report.workByWeek'))}</h3>${this.barChart(weeks.map((w) => ({ label: this.date(dayStart(w.day)), value: w.work })), (v) => this.hours(v))}</section>
      </div>`;
  }

  burndown() {
    const project = this.app.project();
    const sched = this.app.sched();
    const points = series(project, sched, 'work').map((p) => ({ ...p, remaining: p.actual == null ? null : p.remaining, remainingPlan: (sched.work - p.scheduled) }));
    return `<div class="report-cards"><section class="card wide"><h3>${icon('burndown')}${escapeHtml(t('report.burndownTitle'))}</h3>${this.lineChart(points, [['remainingPlan', 'scheduled'], ['remaining', 'actual']], (v) => this.hours(v))}<p class="muted">${escapeHtml(t('report.burndownHint'))}</p></section></div>`;
  }

  rowsTable(rows, fields) {
    if (!rows.length) return `<div class="muted report-none">${icon('check')}${escapeHtml(t('report.none'))}</div>`;
    const ctx = this.app.fieldCtx();
    const map = this.app.taskFieldMap();
    return `<table class="report-table"><thead><tr><th>${escapeHtml(t('field.id'))}</th>${fields.map((f) => `<th>${escapeHtml(t(`field.${f}`))}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(({ task, info }) => `<tr data-task="${escapeHtml(task.id)}" class="${this.app.isSelected(task.id) ? 'selected' : ''}"><td>${info.row}</td>${fields.map((f) => {
        const field = map.get(f);
        const value = field.get(ctx, task, info);
        return `<td class="${field.align}">${escapeHtml(field.text ? field.text(ctx, value, task, info) : value)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
  }

  taskTable(kind) {
    const project = this.app.project();
    const sched = this.app.sched();
    const rows = reportData(kind, project, sched);
    const fields = {
      critical: ['name', 'duration', 'start', 'finish', 'totalSlack', 'resourceNames', 'percentComplete'],
      late: ['name', 'start', 'finish', 'percentComplete', 'resourceNames', 'finishVariance'],
      upcoming: ['name', 'start', 'finish', 'duration', 'resourceNames'],
      milestones: ['name', 'finish', 'baselineFinish', 'finishVariance', 'percentComplete'],
    }[kind];
    return `<p class="muted">${escapeHtml(t(`report.${kind}Hint`))}</p>${this.rowsTable(rows, fields)}`;
  }

  resourceTable() {
    const project = this.app.project();
    const sched = this.app.sched();
    const rows = project.resources.map((r) => ({ r, info: sched.resources.get(r.id) }));
    if (!rows.length) return `<div class="muted report-none">${icon('info')}${escapeHtml(t('graph.noResources'))}</div>`;
    return `<table class="report-table"><thead><tr><th>${escapeHtml(t('field.name'))}</th><th>${escapeHtml(t('field.resourceType'))}</th><th>${escapeHtml(t('field.work'))}</th><th>${escapeHtml(t('field.cost'))}</th><th>${escapeHtml(t('field.peak'))}</th><th>${escapeHtml(t('field.overallocated'))}</th></tr></thead>
      <tbody>${rows.map(({ r, info }) => `<tr class="${info?.overallocated ? 'over' : ''}"><td>${escapeHtml(r.name)}</td><td>${escapeHtml(t(`resourceType.${r.type}`))}</td><td class="right">${escapeHtml(r.type === 'work' ? this.hours(info?.work) : '')}</td><td class="right">${escapeHtml(this.money(info?.cost ?? 0))}</td><td class="right">${r.type === 'work' ? `${Math.round((info?.peak ?? 0) * 100)}%` : ''}</td><td class="center">${info?.overallocated ? icon('overallocation') : ''}</td></tr>`).join('')}</tbody></table>`;
  }

  /** The current report as text (Copy report). */
  text() {
    return this.host.querySelector('.report-page')?.innerText ?? '';
  }

  update() { this.render(); }
  selectionChanged() { for (const el of this.host.querySelectorAll('tr[data-task]')) el.classList.toggle('selected', this.app.isSelected(el.dataset.task)); }
  scrollToTask() {}
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
