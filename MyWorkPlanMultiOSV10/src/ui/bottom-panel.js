// The bottom panel of the main window: "Schedule check". Tabs for problems, the
// critical path, overallocated people, delays and milestones of the open plan
// (domain/insights.js), each with its count. A row jumps to its task or resource.
// Folded, the panel is one header line — icon, title, counts and the unfold
// button — so it always says what it is and whether something needs attention.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { INSIGHT_TABS } from '../domain/insights.js';
import { formatDay } from '../domain/time.js';
import { formatDuration } from '../domain/duration.js';

const TAB_ICONS = { problems: 'warning', critical: 'criticalPath', overallocation: 'overallocation', delays: 'hourglass', milestones: 'milestone' };
const SEVERITY_ICONS = { error: 'error', warning: 'warning', info: 'info' };

/**
 * The panel's HTML. ctx = { project, sched, insights, tab, collapsed, dateFormat, language, options }.
 */
export function bottomPanelHtml(ctx) {
  const { insights, collapsed } = ctx;
  const tab = INSIGHT_TABS.includes(ctx.tab) ? ctx.tab : 'problems';
  const counts = insights?.counts ?? {};
  const badge = (id) => {
    const n = counts[id] ?? 0;
    const tone = id === 'problems' ? (counts.errors ? 'bad' : n ? 'warn' : 'ok') : id === 'overallocation' || id === 'delays' ? (n ? 'warn' : 'ok') : 'plain';
    return `<span class="bp-count ${tone}">${n}</span>`;
  };
  const tabs = INSIGHT_TABS.map((id) => `<button type="button" class="bp-tab ${id === tab && !collapsed ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${id === tab}" title="${escapeHtml(t(`bottom.tip.${id}`))}">${icon(TAB_ICONS[id])}<span>${escapeHtml(t(`bottom.tab.${id}`))}</span>${badge(id)}</button>`).join('');
  const head = `<div class="bp-head" data-bottom-head>
    <span class="bp-title" title="${escapeHtml(t('bottom.titleTip'))}">${icon('scheduleCheck')}<b>${escapeHtml(t('bottom.title'))}</b></span>
    <div class="bp-tabs" role="tablist">${tabs}</div>
    <span class="grow"></span>
    <button type="button" class="icon-button" data-command="bottomPanelFold" title="${escapeHtml(t(collapsed ? 'bottom.expand' : 'bottom.collapse'))}" aria-label="${escapeHtml(t(collapsed ? 'bottom.expand' : 'bottom.collapse'))}" aria-expanded="${!collapsed}">${icon(collapsed ? 'foldUp' : 'foldDown')}</button>
    <button type="button" class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.close'))}" aria-label="${escapeHtml(t('bottom.close'))}">${icon('close')}</button>
  </div>`;
  if (collapsed) return head;
  return `${head}<div class="bp-body" role="tabpanel" data-bottom-body="${tab}">${body(ctx, tab)}</div>`;
}

function body(ctx, tab) {
  if (!ctx.insights) return empty('bottom.noPlan');
  switch (tab) {
    case 'critical': return criticalBody(ctx);
    case 'overallocation': return overBody(ctx);
    case 'delays': return delayBody(ctx);
    case 'milestones': return milestoneBody(ctx);
    default: return problemBody(ctx);
  }
}

const empty = (key) => `<div class="bp-empty">${icon('check')}<span>${escapeHtml(t(key))}</span></div>`;
const taskOf = (ctx, id) => ctx.project.tasks.find((task) => task.id === id);
const resourceOf = (ctx, id) => ctx.project.resources.find((r) => r.id === id);
const date = (ctx, minutes) => (minutes == null ? '' : formatDay(minutes, ctx.dateFormat));
const days = (ctx, minutes) => formatDuration(minutes ?? 0, 'd', ctx.options, ctx.language);
const where = (ctx, item) => {
  if (item.taskId) { const task = taskOf(ctx, item.taskId); return task ? `${ctx.sched.info(task.id)?.row ?? ''}. ${task.name}` : ''; }
  if (item.resourceId) return resourceOf(ctx, item.resourceId)?.name ?? '';
  return '';
};
const target = (item) => (item.taskId ? `data-bottom-task="${escapeHtml(item.taskId)}"` : item.resourceId ? `data-bottom-resource="${escapeHtml(item.resourceId)}"` : '');

function table(head, rows) {
  return `<table class="bp-table"><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function problemBody(ctx) {
  const list = ctx.insights.problems;
  if (!list.length) return empty('bottom.noProblems');
  const text = (item) => t(`bottom.problem.${item.kind}`, {
    days: item.days ?? 0, peak: Math.round((item.peak ?? 0) * 100), percent: item.percent ?? 0, expected: item.expected ?? 0,
    constraint: item.constraint ? t(`constraint.${item.constraint}`) : '',
  });
  return table([t('bottom.col.severity'), t('bottom.col.problem'), t('bottom.col.where')], list.map((item) => `<tr class="bp-row ${item.severity}" ${target(item)} tabindex="0" title="${escapeHtml(t('bottom.goTip'))}">
    <td class="bp-sev">${icon(SEVERITY_ICONS[item.severity], `icon bp-sev-${item.severity}`)}<span>${escapeHtml(t(`bottom.severity.${item.severity}`))}</span></td>
    <td>${escapeHtml(text(item))}</td><td class="bp-where">${escapeHtml(where(ctx, item))}</td></tr>`));
}

function criticalBody(ctx) {
  const c = ctx.insights.critical;
  if (!c.tasks.length) return empty('bottom.noCritical');
  const summary = `<div class="bp-summary">${icon('criticalPath')}<span>${escapeHtml(t('bottom.criticalSummary', { count: c.tasks.length, chains: c.chains, remaining: c.remaining, finish: date(ctx, c.finish), duration: days(ctx, c.duration) }))}</span>
    <button type="button" class="small-button" data-command="criticalPath" title="${escapeHtml(t('action.criticalPath'))}">${icon('criticalPath')}<span>${escapeHtml(t('bottom.showOnChart'))}</span></button></div>`;
  return summary + table([t('field.id'), t('field.name'), t('field.start'), t('field.finish'), t('field.duration'), t('field.totalSlack'), t('field.percentComplete')], c.tasks.map((x) => {
    const task = taskOf(ctx, x.taskId);
    return `<tr class="bp-row critical" ${target(x)} tabindex="0" title="${escapeHtml(t('bottom.goTip'))}"><td>${ctx.sched.info(x.taskId)?.row ?? ''}</td><td>${escapeHtml(task?.name ?? '')}</td><td>${escapeHtml(date(ctx, x.start))}</td><td>${escapeHtml(date(ctx, x.finish))}</td><td>${escapeHtml(days(ctx, x.duration))}</td><td>${escapeHtml(days(ctx, x.slack))}</td><td>${x.percent}%</td></tr>`;
  }));
}

function overBody(ctx) {
  const list = ctx.insights.overallocation;
  if (!list.length) return empty('bottom.noOverallocation');
  const actions = `<div class="bp-summary">${icon('overallocation')}<span>${escapeHtml(t('bottom.overSummary', { count: list.length }))}</span>
    <button type="button" class="small-button" data-command="nextOverallocation" title="${escapeHtml(t('action.nextOverallocation'))}">${icon('overallocation')}<span>${escapeHtml(t('action.nextOverallocation'))}</span></button>
    <button type="button" class="small-button" data-command="levelAll" title="${escapeHtml(t('action.levelAll'))}">${icon('level')}<span>${escapeHtml(t('action.levelAll'))}</span></button></div>`;
  return actions + table([t('field.name'), t('field.peak'), t('field.maxUnits'), t('bottom.col.days'), t('bottom.col.period'), t('bottom.col.tasks')], list.map((x) => {
    const tasks = x.tasks.map((id) => taskOf(ctx, id)?.name).filter(Boolean);
    return `<tr class="bp-row warning" ${target(x)} tabindex="0" title="${escapeHtml(t('bottom.goTip'))}"><td>${escapeHtml(resourceOf(ctx, x.resourceId)?.name ?? '')}</td><td class="danger-text">${Math.round(x.peak * 100)}%</td><td>${Math.round(x.maxUnits * 100)}%</td><td>${x.days}</td><td>${escapeHtml(`${date(ctx, x.first)} – ${date(ctx, x.last)}`)}</td><td class="bp-where" title="${escapeHtml(tasks.join(', '))}">${escapeHtml(tasks.join(', '))}</td></tr>`;
  }));
}

function delayBody(ctx) {
  const list = ctx.insights.delays;
  if (!list.length) return empty('bottom.noDelays');
  return table([t('bottom.col.severity'), t('field.id'), t('field.name'), t('bottom.col.reason'), t('field.finishVariance'), t('field.percentComplete'), t('field.finish')], list.map((x) => {
    const task = taskOf(ctx, x.taskId);
    return `<tr class="bp-row ${x.severity}" ${target(x)} tabindex="0" title="${escapeHtml(t('bottom.goTip'))}"><td class="bp-sev">${icon(SEVERITY_ICONS[x.severity], `icon bp-sev-${x.severity}`)}${x.critical ? `<span class="bp-crit" title="${escapeHtml(t('bottom.onCritical'))}">${icon('criticalPath')}</span>` : ''}</td><td>${ctx.sched.info(x.taskId)?.row ?? ''}</td><td>${escapeHtml(task?.name ?? '')}</td>
      <td>${escapeHtml(t(`bottom.delay.${x.kind}`, { percent: x.percent, expected: x.expected }))}</td><td>${x.slip > 0 ? `+${escapeHtml(days(ctx, x.slip))}` : ''}</td><td>${x.percent}%</td><td>${escapeHtml(date(ctx, x.finish))}</td></tr>`;
  }));
}

function milestoneBody(ctx) {
  const list = ctx.insights.milestones;
  if (!list.length) return empty('bottom.noMilestones');
  return table([t('bottom.col.status'), t('field.id'), t('field.name'), t('field.finish'), t('field.finishVariance')], list.map((x) => {
    const task = taskOf(ctx, x.taskId);
    const status = x.done ? t('bottom.ms.done') : x.severity === 'error' ? t('bottom.ms.missed') : x.slip > 0 ? t('bottom.ms.slipping') : t('bottom.ms.onTrack');
    return `<tr class="bp-row ${x.done ? 'done' : x.severity}" ${target(x)} tabindex="0" title="${escapeHtml(t('bottom.goTip'))}"><td class="bp-sev">${icon(x.done ? 'check' : 'milestone')}<span>${escapeHtml(status)}</span></td><td>${ctx.sched.info(x.taskId)?.row ?? ''}</td><td>${escapeHtml(task?.name ?? '')}</td><td>${escapeHtml(date(ctx, x.finish))}</td><td>${x.slip > 0 ? `+${escapeHtml(days(ctx, x.slip))}` : ''}</td></tr>`;
  }));
}
