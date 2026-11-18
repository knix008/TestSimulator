// The project timeline: each issue as a bar between its start and due dates, grouped under its epic,
// with "blocks" dependencies drawn as arrows. Bars can be dragged to move or resize them, and dragged
// from their end dot onto another bar to make that one wait for them.
import { DAY_MS, blockersOf, issueSpan, scheduleConflicts } from '../domain/dependencies.js';
import { byId, esc, icon, L, pageHead, safeColor, typeBadge } from './bits.js';
import { finderBar, issueFacets, issueVisible } from './finder.js';

const ROW = 34;
const HEAD = 46;
const SCALES = { week: 30, month: 12, quarter: 5 };

function dayStart(time) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function timelineView(ctx) {
  const project = ctx.project;
  const scale = SCALES[ctx.ui.timelineScale] ? ctx.ui.timelineScale : 'week';
  const px = SCALES[scale];
  const showAll = ctx.ui.timelineAll !== false;
  const visible = project.issues.filter((issue) => issue.typeId !== 'subtask' && issueVisible(ctx, issue));
  const planned = (issue) => Boolean(issue.start || issue.due || issue.sprintId);
  const shown = visible.filter((issue) => showAll || planned(issue) || issue.typeId === 'epic');
  // Rows: each epic, then its issues; then the issues without an epic.
  const epics = shown.filter((issue) => issue.typeId === 'epic');
  const rows = [];
  for (const epic of epics) {
    rows.push({ issue: epic, epic: true });
    for (const child of shown.filter((issue) => issue.epicId === epic.id && issue.typeId !== 'epic')) rows.push({ issue: child, depth: 1 });
  }
  const loose = shown.filter((issue) => issue.typeId !== 'epic' && !epics.some((epic) => epic.id === issue.epicId));
  if (loose.length) {
    if (epics.length) rows.push({ heading: L('에픽 없음', 'No epic') });
    for (const issue of loose) rows.push({ issue, depth: 0 });
  }
  const spans = new Map(rows.filter((row) => row.issue).map((row) => [row.issue.id, issueSpan(project, row.issue)]));
  // An epic with dated children covers them.
  for (const row of rows) {
    if (!row.epic) continue;
    const kids = rows.filter((other) => other.issue && other.issue.epicId === row.issue.id && other.issue.id !== row.issue.id).map((other) => spans.get(other.issue.id));
    const own = spans.get(row.issue.id);
    if (kids.length && !own.planned) spans.set(row.issue.id, { start: Math.min(...kids.map((span) => span.start)), end: Math.max(...kids.map((span) => span.end)), planned: false, rolled: true });
  }
  const today = dayStart(Date.now());
  const all = [...spans.values()];
  const from = dayStart(Math.min(today - 7 * DAY_MS, ...all.map((span) => span.start)) - 3 * DAY_MS);
  const until = Math.max(today + 28 * DAY_MS, ...all.map((span) => span.end)) + 10 * DAY_MS;
  const days = Math.round((until - from) / DAY_MS);
  const width = days * px;
  const x = (time) => Math.round(((time - from) / DAY_MS) * px);
  const height = HEAD + rows.length * ROW + 8;
  const rowY = new Map();
  rows.forEach((row, at) => { if (row.issue) rowY.set(row.issue.id, HEAD + at * ROW); });

  // Header: months on top, then weeks or days.
  const ticks = [];
  const months = [];
  for (let day = 0; day <= days; day += 1) {
    const time = from + day * DAY_MS;
    const date = new Date(time);
    if (date.getUTCDate() === 1 || day === 0) months.push(`<text x="${x(time) + 4}" y="15" class="tl-month">${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}</text><line x1="${x(time)}" y1="0" x2="${x(time)}" y2="${height}" class="tl-month-line"/>`);
    const weekStart = date.getUTCDay() === 1;
    if (scale === 'week' || (scale === 'month' && weekStart)) ticks.push(`<text x="${x(time) + 3}" y="36" class="tl-day${date.getUTCDay() === 0 || date.getUTCDay() === 6 ? ' weekend' : ''}">${date.getUTCDate()}</text>`);
    if (scale === 'week' && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) ticks.push(`<rect x="${x(time)}" y="${HEAD}" width="${px}" height="${height - HEAD}" class="tl-weekend"/>`);
    if (weekStart && scale !== 'quarter') ticks.push(`<line x1="${x(time)}" y1="${HEAD - 6}" x2="${x(time)}" y2="${height}" class="tl-week-line"/>`);
  }
  const conflicts = scheduleConflicts(project);
  const conflictKey = new Set(conflicts.map((item) => `${item.fromId}>${item.toId}`));
  const bars = rows.map((row, at) => {
    if (!row.issue) return `<text x="8" y="${HEAD + at * ROW + 22}" class="tl-heading">${esc(row.heading)}</text>`;
    const issue = row.issue;
    const span = spans.get(issue.id);
    const status = byId(project.statuses, issue.statusId);
    const color = safeColor(status?.color) || '#3a6cf0';
    const y = HEAD + at * ROW + 7;
    const left = x(span.start);
    const barWidth = Math.max(px, x(span.end + DAY_MS) - left);
    const blocked = blockersOf(project, issue).open.length > 0;
    const done = status?.category === 'done';
    const label = `${issue.key} ${issue.summary}`;
    const draggable = !row.epic || !span.rolled;
    return `<g class="tl-bar${row.epic ? ' epic' : ''}${span.planned ? '' : ' estimated'}${blocked ? ' blocked' : ''}${done ? ' done' : ''}" data-tl-issue="${esc(issue.id)}" data-key="${esc(issue.key)}">
      <title>${esc(label)}${span.planned ? '' : ` · ${L('날짜를 정하지 않아 어림한 기간', 'dates not set, estimated')}`}${blocked ? ` · ${L('막힌 이슈', 'blocked')}` : ''}</title>
      <rect x="${left}" y="${y}" width="${barWidth}" height="${ROW - 14}" rx="6" class="tl-rect" style="--bar:${color}" ${draggable ? 'data-tl-drag="both"' : ''}/>
      ${draggable ? `<rect x="${left}" y="${y}" width="6" height="${ROW - 14}" class="tl-edge" data-tl-drag="start"/><rect x="${left + barWidth - 6}" y="${y}" width="6" height="${ROW - 14}" class="tl-edge" data-tl-drag="end"/>` : ''}
      <text x="${left + 8}" y="${y + 14}" class="tl-label">${esc(barWidth > 90 ? issue.key : '')}</text>
      ${row.epic ? '' : `<circle cx="${left + barWidth + 7}" cy="${y + (ROW - 14) / 2}" r="5" class="tl-link-dot" data-tl-link="${esc(issue.id)}"><title>${esc(L('끌어서 다른 이슈에 놓으면 그 이슈를 막습니다', 'Drag onto another issue to make it wait for this one'))}</title></circle>`}
    </g>`;
  }).join('');
  // Dependency arrows from the end of the blocker to the start of the blocked issue.
  const arrows = rows.filter((row) => row.issue).flatMap((row) => (row.issue.links || [])
    .filter((link) => link.type === 'blocks' && link.direction === 'out' && rowY.has(link.otherId))
    .map((link) => {
      const a = spans.get(row.issue.id);
      const b = spans.get(link.otherId);
      const x1 = x(a.end + DAY_MS);
      const y1 = rowY.get(row.issue.id) + ROW / 2;
      const x2 = x(b.start);
      const y2 = rowY.get(link.otherId) + ROW / 2;
      const bend = Math.max(x1 + 12, Math.min(x2 - 12, x1 + 40));
      const path = x2 - 12 > x1 ? `M${x1},${y1} H${bend} V${y2} H${x2 - 2}` : `M${x1},${y1} h12 V${(y1 + y2) / 2} H${x2 - 16} V${y2} H${x2 - 2}`;
      const bad = conflictKey.has(`${row.issue.id}>${link.otherId}`);
      return `<path d="${path}" class="tl-arrow${bad ? ' conflict' : ''}" marker-end="url(#tl-head${bad ? '-bad' : ''})"><title>${esc(`${row.issue.key} → ${(project.issues.find((issue) => issue.id === link.otherId) || {}).key || ''}`)}${bad ? ` · ${esc(L('일정이 겹칩니다', 'schedule conflict'))}` : ''}</title></path>`;
    }));
  const todayLine = `<line x1="${x(today) + px / 2}" y1="${HEAD}" x2="${x(today) + px / 2}" y2="${height}" class="tl-today"/><text x="${x(today) + px / 2 + 4}" y="${height - 6}" class="tl-today-text">${esc(L('오늘', 'Today'))}</text>`;
  const svg = `<svg class="tl-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-tl-from="${from}" data-tl-px="${px}">
    <defs><marker id="tl-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="tl-head"/></marker><marker id="tl-head-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="tl-head bad"/></marker></defs>
    ${ticks.join('')}${months.join('')}${rows.map((row, at) => `<line x1="0" y1="${HEAD + (at + 1) * ROW}" x2="${width}" y2="${HEAD + (at + 1) * ROW}" class="tl-row-line"/>`).join('')}
    ${todayLine}${arrows.join('')}${bars}
  </svg>`;
  const names = rows.map((row) => (row.issue
    ? `<button type="button" class="tl-name${row.epic ? ' epic' : ''}" style="padding-left:${8 + (row.depth || 0) * 16}px" data-action="open-issue" data-id="${esc(row.issue.id)}" title="${esc(`${row.issue.key} ${row.issue.summary}`)}">${typeBadge(project, row.issue.typeId)}<b>${esc(row.issue.key)}</b><span>${esc(row.issue.summary)}</span>${blockersOf(project, row.issue).open.length ? `<i class="tl-blocked" title="${esc(L('먼저 끝나야 할 이슈가 남았습니다', 'Waiting for another issue'))}">${icon('lock')}</i>` : ''}</button>`
    : `<div class="tl-name heading">${esc(row.heading)}</div>`)).join('');
  const scaleButtons = Object.keys(SCALES).map((id) => `<button type="button" class="small-button${scale === id ? ' primary' : ''}" data-action="timeline-scale" data-id="${id}">${esc({ week: L('일', 'Days'), month: L('주', 'Weeks'), quarter: L('월', 'Months') }[id])}</button>`).join('');
  const legend = `<span class="tl-legend"><i class="sw planned"></i>${L('날짜 정함', 'Dates set')}<i class="sw estimated"></i>${L('어림', 'Estimated')}<i class="sw blocked"></i>${L('막힘', 'Blocked')}<i class="sw arrow"></i>${L('막음', 'Blocks')}<i class="sw conflict"></i>${L('일정 겹침', 'Conflict')}</span>`;
  const conflictNote = conflicts.length ? `<p class="banner bad">${icon('alert')}<span>${esc(L(`앞선 이슈가 늦게 끝나 일정이 겹치는 연결이 ${conflicts.length}개 있습니다. 빨간 화살표를 확인하세요.`, `${conflicts.length} dependencies end after the next issue should start. See the red arrows.`))}</span></p>` : '';
  return `<div class="page timeline-page">${pageHead(L('타임라인', 'Timeline'), `${scaleButtons}<button type="button" class="small-button" data-action="timeline-today">${icon('calendar')}<span>${L('오늘로', 'Today')}</span></button><label class="check"><input type="checkbox" data-action="timeline-all" ${showAll ? 'checked' : ''}>${L('날짜 없는 이슈도', 'Undated issues too')}</label>`, 'timeline')}
    ${finderBar(ctx, issueFacets(ctx, ['type', 'status', 'assignee']))}
    <p class="muted">${L('막대를 끌면 날짜가, 끝을 끌면 기간이 바뀝니다. 막대 오른쪽 점을 다른 이슈에 끌어 놓으면 "막음" 연결이 생깁니다. 이름을 누르면 이슈가 열립니다.', 'Drag a bar to move its dates and an end to change its length. Drag the dot on a bar\'s right onto another issue to make it wait. Click a name to open the issue.')}</p>
    ${legend}${conflictNote}
    ${rows.length ? `<div class="tl-wrap"><div class="tl-names" style="padding-top:${HEAD}px">${names}</div><div class="tl-chart" data-tl-chart>${svg}</div></div>` : `<p class="empty">${L('이슈가 없습니다.', 'There are no issues.')}</p>`}
  </div>`;
}

export function timelineTodayX(chart) {
  const svg = chart?.querySelector('.tl-svg');
  if (!svg) return 0;
  const from = Number(svg.dataset.tlFrom);
  const px = Number(svg.dataset.tlPx);
  return ((dayStart(Date.now()) - from) / DAY_MS) * px;
}
