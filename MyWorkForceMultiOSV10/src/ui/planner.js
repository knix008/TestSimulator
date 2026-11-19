// The planner: what is on which day, as a calendar — day, week, month and year. It shows schedule tasks
// and milestones, issues with dates, sprints and releases, for this project, for the person's own work, or
// for every project. Items open where they live (an issue opens, a task opens the schedule).
import { DAY, dayOf, itemsIn, plannerItems } from '../domain/schedule.js';
import { getLanguage } from '../i18n.js';
import { participatingProjects } from '../domain/permissions.js';
import { esc, icon, L, pageHead, safeColor } from './bits.js';

const MODES = ['day', 'week', 'month', 'year'];
const KINDS = ['task', 'issue', 'sprint', 'version'];
const KIND_LABEL = { task: ['일정 작업', 'Tasks'], issue: ['이슈', 'Issues'], sprint: ['스프린트', 'Sprints'], version: ['릴리스', 'Releases'] };
const COLOR = { task: '#3a6cf0', milestone: '#7c3aed', sprint: '#0d9488', version: '#d97706' };
const MAX_LANES = 4;

const locale = () => (getLanguage() === 'en' ? 'en-US' : 'ko-KR');
const fmt = (ms, options) => new Date(ms).toLocaleDateString(locale(), { timeZone: 'UTC', ...options });
const weekStartOf = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
const monthStartOf = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const addMonths = (ms, n) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1); };

/** The planner's state with defaults (ui.planner). */
export function plannerState(ctx) {
  const state = ctx.ui.planner || {};
  const scopes = ctx.project ? ['project', 'mine', 'all'] : ['mine', 'all'];
  return {
    mode: MODES.includes(state.mode) ? state.mode : 'month',
    date: dayOf(state.date) ?? dayOf(ctx.now),
    scope: scopes.includes(state.scope) ? state.scope : scopes[0],
    scopes,
    kinds: Array.isArray(state.kinds) ? state.kinds.filter((kind) => KINDS.includes(kind)) : [...KINDS],
  };
}

/** The day the "previous / next" buttons go to. */
export function plannerStep(state, delta) {
  if (state.mode === 'day') return state.date + delta * DAY;
  if (state.mode === 'week') return state.date + delta * 7 * DAY;
  if (state.mode === 'month') return addMonths(state.date, delta);
  const d = new Date(state.date);
  return Date.UTC(d.getUTCFullYear() + delta, d.getUTCMonth(), 1);
}

function itemColor(item) {
  if (item.kind === 'issue') return safeColor(item.color);
  return COLOR[item.kind] || '#3a6cf0';
}

function itemLabel(item) {
  if (item.kind === 'issue') return `${item.key} ${item.title}`;
  if (item.kind === 'milestone') return `◆ ${item.title}`;
  if (item.kind === 'version') return `${L('릴리스', 'Release')} ${item.title}`;
  return item.title;
}

function itemAttrs(item) {
  return `data-action="planner-open" data-kind="${esc(item.kind)}" data-id="${esc(item.id)}" data-project="${esc(item.projectId)}" title="${esc(`${item.project} · ${itemLabel(item)}`)}"`;
}

function chip(item, extra = '') {
  return `<button type="button" class="pl-chip k-${esc(item.kind)}${item.done ? ' done' : ''}${item.critical ? ' critical' : ''}${extra}" style="--c:${itemColor(item)}" ${itemAttrs(item)}><span>${esc(itemLabel(item))}</span></button>`;
}

/** Lanes for the items of one week: bars that do not overlap share a lane. */
function lanes(items, from, to) {
  const rows = [];
  const placed = [];
  for (const item of itemsIn(items, from, to).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))) {
    const s = Math.max(item.start, from);
    const e = Math.min(item.end, to);
    let lane = rows.findIndex((last) => last < s);
    if (lane < 0) { lane = rows.length; rows.push(e); } else rows[lane] = e;
    placed.push({ item, lane, col: Math.round((s - from) / DAY) + 1, span: Math.round((e - s) / DAY) + 1, cutLeft: item.start < from, cutRight: item.end > to });
  }
  return placed;
}

function weekRow(items, from, focusMonth, today, maxLanes, picked) {
  const placed = lanes(items, from, from + 6 * DAY);
  const shown = placed.filter((bar) => bar.lane < maxLanes);
  const hidden = new Map();
  for (const bar of placed.filter((item) => item.lane >= maxLanes)) for (let c = bar.col; c < bar.col + bar.span; c += 1) hidden.set(c, (hidden.get(c) || 0) + 1);
  const cells = Array.from({ length: 7 }, (_, i) => {
    const day = from + i * DAY;
    const date = new Date(day);
    const other = focusMonth != null && date.getUTCMonth() !== focusMonth;
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    return `<div class="pl-cell${other ? ' other' : ''}${weekend ? ' weekend' : ''}${day === today ? ' today' : ''}${day === picked ? ' picked' : ''}" style="grid-column:${i + 1};grid-row:1 / span ${maxLanes + 2}"><button type="button" class="pl-date" data-action="planner-go" data-date="${new Date(day).toISOString().slice(0, 10)}" data-mode="day">${date.getUTCDate()}</button>${hidden.get(i + 1) ? `<button type="button" class="pl-more" data-action="planner-go" data-date="${new Date(day).toISOString().slice(0, 10)}" data-mode="day">+${hidden.get(i + 1)}</button>` : ''}</div>`;
  }).join('');
  const bars = shown.map((bar) => `<button type="button" class="pl-bar k-${esc(bar.item.kind)}${bar.item.done ? ' done' : ''}${bar.item.critical ? ' critical' : ''}${bar.cutLeft ? ' cut-left' : ''}${bar.cutRight ? ' cut-right' : ''}" style="grid-column:${bar.col} / span ${bar.span};grid-row:${bar.lane + 2};--c:${itemColor(bar.item)}" ${itemAttrs(bar.item)}><span>${esc(itemLabel(bar.item))}</span></button>`).join('');
  return `<div class="pl-week" style="grid-template-rows:24px repeat(${maxLanes}, 22px) 18px">${cells}${bars}</div>`;
}

function weekdayHead(from) {
  return `<div class="pl-head">${Array.from({ length: 7 }, (_, i) => `<span>${esc(fmt(from + i * DAY, { weekday: 'short' }))}</span>`).join('')}</div>`;
}

function monthView(items, state, today) {
  const first = monthStartOf(state.date);
  const start = weekStartOf(first);
  const month = new Date(first).getUTCMonth();
  const weeks = [];
  for (let w = start; w < addMonths(first, 1) || weeks.length < 5; w += 7 * DAY) {
    weeks.push(weekRow(items, w, month, today, MAX_LANES, state.date));
    if (weeks.length >= 6) break;
  }
  return `<div class="pl-month">${weekdayHead(start)}${weeks.join('')}</div>`;
}

function weekView(items, state, today) {
  const from = weekStartOf(state.date);
  const count = Math.max(1, ...lanes(items, from, from + 6 * DAY).map((bar) => bar.lane + 1));
  const head = `<div class="pl-head big">${Array.from({ length: 7 }, (_, i) => {
    const day = from + i * DAY;
    return `<button type="button" class="${day === today ? 'today' : ''}" data-action="planner-go" data-date="${new Date(day).toISOString().slice(0, 10)}" data-mode="day"><b>${esc(fmt(day, { weekday: 'short' }))}</b><span>${esc(fmt(day, { month: 'numeric', day: 'numeric' }))}</span></button>`;
  }).join('')}</div>`;
  return `<div class="pl-month pl-weekly">${head}${weekRow(items, from, null, today, Math.max(6, count), state.date)}</div>${dayLists(items, from, from + 6 * DAY)}`;
}

/** Under the week: each day's due and starting items as a to-do list. */
function dayLists(items, from, to) {
  const cols = [];
  for (let day = from; day <= to; day += DAY) {
    const due = items.filter((item) => item.end === day && (item.kind === 'issue' || item.kind === 'task' || item.kind === 'milestone'));
    cols.push(`<div class="pl-list"><b>${esc(fmt(day, { weekday: 'short', month: 'numeric', day: 'numeric' }))}</b>${due.map((item) => chip(item)).join('') || `<span class="muted">—</span>`}</div>`);
  }
  return `<h3 class="pl-sub">${icon('check')}<span>${L('그날 끝나는 일', 'Due that day')}</span></h3><div class="pl-lists">${cols.join('')}</div>`;
}

function dayView(items, state, today, ctx) {
  const day = state.date;
  const on = itemsIn(items, day, day);
  const group = (title, glyph, list) => `<section class="pl-group"><h3>${icon(glyph)}<span>${esc(title)}</span><small class="nav-count">${list.length}</small></h3>${list.length ? list.map((item) => `<div class="pl-row">${chip(item)}<small class="muted">${esc(item.project)} · ${esc(fmt(item.start, { month: 'numeric', day: 'numeric' }))}${item.end !== item.start ? ` – ${esc(fmt(item.end, { month: 'numeric', day: 'numeric' }))}` : ''}</small></div>`).join('') : `<p class="muted">${esc(L('없음', 'None'))}</p>`}</section>`;
  const work = on.filter((item) => item.kind === 'issue' || item.kind === 'task' || item.kind === 'milestone');
  const due = work.filter((item) => item.end === day);
  const starting = work.filter((item) => item.start === day && item.end !== day);
  const ongoing = work.filter((item) => item.start < day && item.end > day);
  const frames = on.filter((item) => item.kind === 'sprint' || item.kind === 'version');
  const overdue = day === today ? items.filter((item) => (item.kind === 'issue' || item.kind === 'task') && !item.done && item.end < today) : [];
  const add = ctx.project ? `<div class="inline pl-add"><input id="planner-new" placeholder="${esc(L(`${fmt(day, { month: 'long', day: 'numeric' })}에 할 일`, `To do on ${fmt(day, { month: 'short', day: 'numeric' })}`))}"><button type="button" class="button" data-action="planner-add" data-date="${new Date(day).toISOString().slice(0, 10)}">${icon('plus')}<span>${L('할 일 추가', 'Add a to-do')}</span></button></div>` : '';
  return `<div class="pl-day">${add}
    ${overdue.length ? group(L('기한이 지난 일', 'Overdue'), 'alert', overdue) : ''}
    ${group(L('오늘 끝나는 일', 'Due'), 'check', due)}
    ${group(L('시작하는 일', 'Starting'), 'play', starting)}
    ${group(L('진행 중인 일', 'In progress'), 'clock', ongoing)}
    ${group(L('스프린트와 릴리스', 'Sprints and releases'), 'backlog', frames)}
  </div>`;
}

function yearView(items, state, today) {
  const year = new Date(state.date).getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = Date.UTC(year, m, 1);
    const start = weekStartOf(first);
    const cells = [];
    for (let day = start; day < addMonths(first, 1) || cells.length % 7; day += DAY) {
      const inMonth = new Date(day).getUTCMonth() === m;
      const work = inMonth ? itemsIn(items, day, day).filter((item) => item.kind === 'issue' || item.kind === 'task') : [];
      const dueHere = inMonth ? items.filter((item) => item.end === day && item.kind !== 'sprint') : [];
      const mark = dueHere.some((item) => item.kind === 'milestone' || item.kind === 'version') ? ' mark' : '';
      const heat = Math.min(4, work.length);
      cells.push(inMonth
        ? `<button type="button" class="pl-y-day h${heat}${mark}${day === today ? ' today' : ''}" data-action="planner-go" data-date="${new Date(day).toISOString().slice(0, 10)}" data-mode="day" title="${esc(`${fmt(day, { month: 'long', day: 'numeric' })} · ${work.length}${dueHere.length ? ` · ${dueHere.map(itemLabel).join(', ')}` : ''}`)}">${new Date(day).getUTCDate()}</button>`
        : '<span></span>');
      if (cells.length > 42) break;
    }
    const due = items.filter((item) => item.end >= first && item.end < addMonths(first, 1) && (item.kind === 'milestone' || item.kind === 'version'));
    return `<section class="pl-y-month"><button type="button" class="pl-y-title" data-action="planner-go" data-date="${new Date(first).toISOString().slice(0, 10)}" data-mode="month">${esc(fmt(first, { month: 'long' }))}</button><div class="pl-y-grid">${cells.join('')}</div>${due.length ? `<div class="pl-y-due">${due.slice(0, 3).map((item) => chip(item)).join('')}</div>` : ''}</section>`;
  }).join('');
  return `<div class="pl-year">${months}</div><p class="muted pl-y-legend"><span class="pl-y-day h1"></span><span class="pl-y-day h2"></span><span class="pl-y-day h4"></span>${esc(L('진하게 칠할수록 그날 걸친 일이 많습니다. 테두리는 마일스톤·릴리스가 있는 날입니다.', 'The darker the day, the more work spans it. A ring marks a milestone or a release.'))}</p>`;
}

function title(state) {
  if (state.mode === 'day') return fmt(state.date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  if (state.mode === 'week') {
    const from = weekStartOf(state.date);
    return `${fmt(from, { year: 'numeric', month: 'long', day: 'numeric' })} – ${fmt(from + 6 * DAY, { month: 'long', day: 'numeric' })}`;
  }
  if (state.mode === 'month') return fmt(state.date, { year: 'numeric', month: 'long' });
  return fmt(state.date, { year: 'numeric' });
}

export function plannerView(ctx) {
  const state = plannerState(ctx);
  const today = dayOf(ctx.now);
  const items = plannerItems(ctx.ws, {
    // Other projects only as far as the person takes part in them.
    projectIds: state.scope === 'project' && ctx.project ? [ctx.project.id] : participatingProjects(ctx.ws, ctx.user?.id).map((project) => project.id),
    userId: ctx.user?.id || '',
    mine: state.scope === 'mine',
    kinds: state.kinds,
  });
  const modeButtons = `<span class="segmented">${MODES.map((mode) => `<button type="button" class="small-button${state.mode === mode ? ' active' : ''}" data-action="planner-mode" data-id="${mode}">${esc({ day: L('일간', 'Day'), week: L('주간', 'Week'), month: L('월간', 'Month'), year: L('연간', 'Year') }[mode])}</button>`).join('')}</span>`;
  const nav = `<span class="pl-nav"><button type="button" class="icon-button" data-action="planner-step" data-delta="-1" title="${esc(L('이전', 'Previous'))}">${icon('chevronLeft')}</button><button type="button" class="small-button" data-action="planner-today">${L('오늘', 'Today')}</button><button type="button" class="icon-button" data-action="planner-step" data-delta="1" title="${esc(L('다음', 'Next'))}">${icon('chevronRight')}</button><b class="pl-title">${esc(title(state))}</b></span>`;
  const scopeLabel = { project: L('이 과제', 'This project'), mine: L('내 할 일', 'My work'), all: L('모든 과제', 'All projects') };
  const filters = `<div class="pl-filters"><span class="segmented">${state.scopes.map((scope) => `<button type="button" class="small-button${state.scope === scope ? ' active' : ''}" data-action="planner-scope" data-id="${scope}">${esc(scopeLabel[scope])}</button>`).join('')}</span>
    ${KINDS.map((kind) => `<label class="check pl-kind"><input type="checkbox" data-planner-kind="${kind}" ${state.kinds.includes(kind) ? 'checked' : ''}><i style="--c:${COLOR[kind] || '#64748b'}"></i>${esc(L(...KIND_LABEL[kind]))}</label>`).join('')}</div>`;
  const body = state.mode === 'day' ? dayView(items, state, today, ctx) : state.mode === 'week' ? weekView(items, state, today) : state.mode === 'year' ? yearView(items, state, today) : monthView(items, state, today);
  const exportButton = `<button type="button" class="button" data-action="export-view">${icon('download')}<span>${L('내보내기', 'Export')}</span></button>`;
  return `<div class="page planner-page">${pageHead(L('할 일 달력', 'Planner'), `${modeButtons}${exportButton}`, 'planner')}
    <div class="pl-bar-top">${nav}</div>
    ${filters}
    ${body}
  </div>`;
}
