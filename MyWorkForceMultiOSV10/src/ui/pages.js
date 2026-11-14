import { GADGETS, LINK_TYPES, ROLES } from '../domain/catalog.js';
import { getLanguage } from '../i18n.js';
import { renderMarkdown } from '../domain/markdown.js';
import { runQuery } from '../domain/query.js';
import { burndown, createdResolved, cumulativeFlow, inspect, pie, slaState, sprintReport, timeReport, velocity } from '../domain/reports.js';
import { activeSprint, findIssue, movesFrom } from '../domain/store.js';
import { dateInputValue, formatDuration } from '../domain/util.js';
import { CUSTOM_KEYS } from '../themes.js';
import { avatar, badge, byId, empty, esc, formatWhen, icon, L, nameOf, options, pageHead, person, safeColor, typeBadge, userOptions } from './bits.js';
import { navLabel } from './chrome.js';

const dur = (value) => formatDuration(value, getLanguage());

function queried(ctx, sort) {
  if (!ctx.project) return { issues: [], error: null, ordered: false };
  let text = ctx.ui.query || '';
  if (sort && ctx.ui.sort && !/\border\s+by\b/i.test(text)) text = `${text} ORDER BY ${ctx.ui.sort.field} ${ctx.ui.sort.dir}`.trim();
  const result = runQuery(ctx.ws, ctx.project, text, { user: ctx.user, now: ctx.now });
  ctx.ui.queryError = result.error;
  return result;
}

function need(ctx, title) {
  if (ctx.project) return '';
  return `<div class="page">${pageHead(title)}<p>${L('홈에서 프로젝트를 만드세요.', 'Create a project from Home.')}</p><button type="button" class="button primary" data-action="go" data-view="home">${L('홈', 'Home')}</button></div>`;
}

export function showRight(ctx) {
  return Boolean(ctx.project) && ['board', 'backlog', 'issues', 'issue', 'roadmap', 'queues', 'health', 'filters', 'notifications'].includes(ctx.ui.view);
}

export function renderView(ctx) {
  if (ctx.ui.view === 'home') return home(ctx);
  if (ctx.ui.view === 'help') return help(ctx);
  const missing = need(ctx, navLabel(ctx.ui.view));
  if (missing) return missing;
  const views = { board, backlog, roadmap, issues, queues, dashboard, reports, releases, components, filters, people, health, notifications, settings, issue };
  return (views[ctx.ui.view] || home)(ctx);
}

function home(ctx) {
  const cards = ctx.ws.projects.map((project) => `<button type="button" class="project-card${project.id === ctx.ws.activeProjectId ? ' active' : ''}" data-action="activate" data-id="${esc(project.id)}"><b>${esc(project.key)}</b><span>${esc(project.name)}</span><small>${project.issues.length} · ${esc(nameOf(project.type === 'service' ? { ko: '서비스', en: 'Service' } : project.type === 'business' ? { ko: '업무', en: 'Business' } : { ko: '소프트웨어', en: 'Software' }))}</small></button>`).join('');
  return `<div class="page home">
    <div class="hero"><img src="./icon.png" alt="" width="48" height="48"><div><h1>MyWorkForce</h1><p>${L('이슈, 보드, 스프린트, 로드맵, 대시보드, 보고서를 한 작업 공간에서 다룹니다.', 'Issues, boards, sprints, the roadmap, dashboards and reports in one workspace.')}</p></div></div>
    <div class="page-actions">
      <button type="button" class="button primary" data-action="new-project">${icon('plus')}${L('새 프로젝트', 'New project')}</button>
      <button type="button" class="button" data-action="open-file">${icon('folder')}${L('열기', 'Open')}</button>
      <button type="button" class="button" data-action="load-sample">${L('예제 불러오기', 'Load the example')}</button>
      <button type="button" class="button" data-action="empty-workspace">${L('빈 작업 공간', 'Empty workspace')}</button>
    </div>
    <h2>${L('프로젝트', 'Projects')}</h2>
    <div class="card-grid">${cards || empty(L('아직 없습니다.', 'Nothing here yet.'))}</div>
    ${ctx.project ? `<h2>${L('최근 활동', 'Recent activity')}</h2><div class="feed">${feed(ctx, 8)}</div>` : ''}
  </div>`;
}

function board(ctx) {
  const project = ctx.project;
  const current = project.boards.find((item) => item.id === ctx.ui.boardId) || project.boards[0];
  const sprint = current?.type === 'scrum' ? activeSprint(project, current.id) : null;
  const future = current?.type === 'scrum' ? project.sprints.find((item) => item.state === 'future' && item.boardId === current.id) : null;
  let issues = project.issues.filter((issue) => issue.typeId !== 'epic' && issue.typeId !== 'subtask');
  if (current?.type === 'scrum') issues = sprint ? issues.filter((issue) => issue.sprintId === sprint.id) : [];
  const head = `<div class="page-head">
      <h1>${esc(nameOf(current))}</h1>
      <div class="page-actions">
        <select data-choose="board">${options(project.boards, current?.id)}</select>
        ${sprint ? `<span class="muted">${esc(sprint.name)} · ${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))}</span><button type="button" class="button" data-action="complete-sprint" data-id="${esc(sprint.id)}">${L('스프린트 완료', 'Complete sprint')}</button>` : ''}
        ${!sprint && future ? `<button type="button" class="button primary" data-action="start-sprint" data-id="${esc(future.id)}">${L('스프린트 시작', 'Start sprint')}</button>` : ''}
        ${current?.type === 'scrum' ? `<button type="button" class="button" data-action="new-sprint">${L('스프린트', 'Sprint')}</button>` : ''}
      </div>
    </div>`;
  if (current?.type === 'scrum' && !sprint) {
    return `<div class="fill">${head}<div class="page">${empty(L('진행 중인 스프린트가 없습니다. 계획된 스프린트를 시작하세요.', 'There is no active sprint. Start a planned one.'))}</div></div>`;
  }
  const columns = (current?.columns || []).map((column) => {
    const status = byId(project.statuses, column.statusId);
    const cards = issues.filter((issue) => issue.statusId === column.statusId).sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const over = column.wip && cards.length > column.wip ? ' over' : '';
    return `<section class="column${over}" data-drop data-status="${esc(column.statusId)}">
      <header>${badge(nameOf(status), status?.color)}<b>${cards.length}</b>${column.wip ? `<small>/${column.wip}</small>` : ''}</header>
      <div class="cards" data-cards>${cards.map((issue) => card(ctx, issue)).join('')}</div>
    </section>`;
  }).join('');
  return `<div class="fill">${head}<div class="board">${columns}</div></div>`;
}

function card(ctx, issue) {
  const priority = byId(ctx.project.priorities, issue.priorityId);
  const points = issue.storyPoints != null ? `<span class="pts">${esc(issue.storyPoints)}</span>` : '';
  return `<article class="card${issue.id === ctx.ui.issueId ? ' selected' : ''}" draggable="true" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    <div class="card-top">${typeBadge(ctx.project, issue.typeId)}<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${esc(issue.key)}</button></div>
    <p>${esc(issue.summary)}</p>
    <div class="card-foot"><span class="pri" style="color:${safeColor(priority?.color)}">${esc(nameOf(priority))}</span>${points}${avatar(person(ctx.ws, issue.assigneeId))}</div>
  </article>`;
}

function backlog(ctx) {
  const project = ctx.project;
  let issues = project.issues.filter((issue) => issue.typeId !== 'epic' && !issue.parentId);
  if (ctx.ui.epicId) issues = issues.filter((issue) => issue.epicId === ctx.ui.epicId);
  const buckets = [
    ...project.sprints.filter((sprint) => sprint.state !== 'closed').map((sprint) => ({ sprint, title: `${sprint.name} · ${nameOf({ ko: sprint.state === 'active' ? '진행' : '예정', en: sprint.state === 'active' ? 'Active' : 'Future' })}` })),
    { sprint: null, title: L('백로그', 'Backlog') },
  ];
  const body = buckets.map(({ sprint, title }) => {
    const rows = issues.filter((issue) => (sprint ? issue.sprintId === sprint.id : !issue.sprintId)).sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const actions = sprint?.state === 'future' ? `<button type="button" class="small-button" data-action="start-sprint" data-id="${esc(sprint.id)}">${L('시작', 'Start')}</button>` : '';
    const complete = sprint?.state === 'active' ? `<button type="button" class="small-button" data-action="complete-sprint" data-id="${esc(sprint.id)}">${L('완료', 'Complete')}</button>` : '';
    return `<section class="bucket" data-drop data-sprint="${esc(sprint?.id || '')}">
      <header><b>${esc(title)}</b><span class="muted">${sprint ? `${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))} ${esc(sprint.goal || '')}` : ''}</span><span class="grow"></span>${actions}${complete}<span>${rows.length}</span></header>
      <div class="rows" data-cards>${rows.map((issue) => row(ctx, issue)).join('') || `<p class="empty">${L('끌어 놓으세요.', 'Drop issues here.')}</p>`}</div>
    </section>`;
  }).join('');
  const closed = project.sprints.filter((sprint) => sprint.state === 'closed');
  return `<div class="page">${pageHead(L('백로그', 'Backlog'), `<button type="button" class="button" data-action="new-sprint">${icon('plus')}${L('스프린트', 'Sprint')}</button>`)}${body}
    ${closed.length ? `<p class="muted">${L('완료한 스프린트', 'Completed sprints')}: ${closed.map((sprint) => esc(sprint.name)).join(', ')}</p>` : ''}</div>`;
}

function row(ctx, issue) {
  const epic = findIssue(ctx.project, issue.epicId);
  return `<div class="issue-row${issue.id === ctx.ui.issueId ? ' selected' : ''}" draggable="true" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    ${typeBadge(ctx.project, issue.typeId)}
    <button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${esc(issue.key)}</button>
    <span class="summary">${esc(issue.summary)}</span>
    ${epic ? badge(epic.key, '#7c3aed') : ''}
    <span class="pts">${issue.storyPoints ?? ''}</span>
    ${avatar(person(ctx.ws, issue.assigneeId))}
  </div>`;
}

function roadmap(ctx) {
  const epics = ctx.project.issues.filter((issue) => issue.typeId === 'epic');
  const bars = epics.map((epic) => {
    const children = ctx.project.issues.filter((issue) => issue.epicId === epic.id && issue.typeId !== 'subtask');
    const done = children.filter((issue) => byId(ctx.project.statuses, issue.statusId)?.category === 'done').length;
    const pct = children.length ? Math.round((done / children.length) * 100) : 0;
    return `<button type="button" class="epic-row" data-action="open-issue" data-id="${esc(epic.id)}"><span class="key">${esc(epic.key)}</span><b>${esc(epic.summary)}</b><span class="bar"><i style="width:${pct}%"></i></span><small>${done}/${children.length}</small></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('로드맵', 'Roadmap'))}${bars || empty(L('에픽이 없습니다.', 'There are no epics.'))}</div>`;
}

function issues(ctx) {
  const result = queried(ctx, true);
  const project = ctx.project;
  const selected = new Set(ctx.ui.selected || []);
  const head = `<tr><th></th>${['key', 'type', 'summary', 'status', 'priority', 'assignee', 'sprint', 'points'].map((field) => {
    const labels = { key: L('키', 'Key'), type: L('유형', 'Type'), summary: L('요약', 'Summary'), status: L('상태', 'Status'), priority: L('우선순위', 'Priority'), assignee: L('담당', 'Assignee'), sprint: L('스프린트', 'Sprint'), points: L('포인트', 'Points') };
    const mark = ctx.ui.sort?.field === field ? (ctx.ui.sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-action="sort" data-field="${field}">${labels[field]}${mark}</button></th>`;
  }).join('')}</tr>`;
  const body = result.issues.slice(0, 400).map((issue) => {
    const status = byId(project.statuses, issue.statusId);
    const priority = byId(project.priorities, issue.priorityId);
    const sprint = byId(project.sprints, issue.sprintId);
    return `<tr class="${issue.id === ctx.ui.issueId ? 'active' : ''}">
      <td><input type="checkbox" data-action="select-one" data-id="${esc(issue.id)}" ${selected.has(issue.id) ? 'checked' : ''}></td>
      <td><button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${esc(issue.key)}</button></td>
      <td>${typeBadge(project, issue.typeId)}</td>
      <td class="summary">${esc(issue.summary)}</td>
      <td>${badge(nameOf(status), status?.color)}</td>
      <td style="color:${safeColor(priority?.color)}">${esc(nameOf(priority))}</td>
      <td>${esc(person(ctx.ws, issue.assigneeId)?.name || '')}</td>
      <td>${esc(sprint?.name || '')}</td>
      <td>${issue.storyPoints ?? ''}</td>
    </tr>`;
  }).join('');
  const bulk = selected.size ? `<div class="bulk"><b>${selected.size}</b>
      <select data-bulk="status">${options(project.statuses, '', L('상태 변경', 'Change status'))}</select>
      <select data-bulk="assignee">${userOptions(ctx.ws, '', L('담당 변경', 'Assign'))}</select>
      <button type="button" class="small-button" data-action="clear-selection">${L('선택 해제', 'Clear')}</button>
    </div>` : '';
  const note = result.issues.length > 400 ? `<p class="muted">${L('400개까지 표시합니다.', 'Showing the first 400.')}</p>` : '';
  return `<div class="page">${pageHead(L('이슈', 'Issues'), `<button type="button" class="button primary" data-action="new-issue">${icon('plus')}${L('이슈', 'Issue')}</button>`)}
    <label class="quick-search query-line">${icon('filter')}<input id="issue-query" value="${esc(ctx.ui.query || '')}" placeholder="${esc(L('WQL. 예: type = bug AND status != done', 'WQL. Example: type = bug AND status != done'))}"></label>
    ${bulk}${note}<div class="table-wrap"><table class="data">${head}${body}</table></div>
    ${result.error ? `<p class="danger-text">${L('질의 문법을 확인하세요.', 'Check the query syntax.')}</p>` : `<p class="muted">${result.issues.length}</p>`}</div>`;
}

function queues(ctx) {
  const project = ctx.project;
  const queues = project.queues || [];
  const current = queues.find((queue) => queue.id === ctx.ui.queueId) || queues[0];
  const list = queues.map((queue) => {
    const count = runQuery(ctx.ws, project, queue.query, { user: ctx.user, now: ctx.now }).issues.length;
    return `<button type="button" class="nav-button${queue.id === current?.id ? ' active' : ''}" data-action="queue" data-id="${esc(queue.id)}"><span>${esc(nameOf(queue))}</span><i class="count">${count}</i></button>`;
  }).join('');
  const issues = current ? runQuery(ctx.ws, project, current.query, { user: ctx.user, now: ctx.now }).issues : [];
  return `<div class="page">${pageHead(L('대기열', 'Queues'))}<div class="split-page"><div class="queue-list">${list || empty(L('대기열이 없습니다.', 'There are no queues.'))}</div><div>${issueLines(ctx, issues)}</div></div></div>`;
}

function issueLines(ctx, issues) {
  return issues.map((issue) => {
    const sla = slaState(ctx.project, issue, ctx.now);
    const flag = sla ? (sla.breached && byId(ctx.project.statuses, issue.statusId)?.category !== 'done' ? badge(L('초과', 'Breached'), '#e5484d') : badge(L('기한 안', 'Within limit'), '#30a46c')) : '';
    return `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(issue.id)}">${typeBadge(ctx.project, issue.typeId)}<span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span>${flag}${avatar(person(ctx.ws, issue.assigneeId))}</button>`;
  }).join('') || empty(L('이슈가 없습니다.', 'There are no issues.'));
}

function dashboard(ctx) {
  const project = ctx.project;
  const cards = (project.dashboard || []).map((gadget) => `<section class="gadget"><header><b>${esc(nameOf(GADGETS.find((item) => item.id === gadget.type)))}</b><button type="button" class="icon-button" data-action="remove-gadget" data-id="${esc(gadget.id)}">${icon('close')}</button></header>${gadgetBody(ctx, gadget.type)}</section>`).join('');
  return `<div class="page">${pageHead(L('대시보드', 'Dashboard'), `<select data-choose="gadget">${options(GADGETS, '', L('가젯 추가', 'Add a gadget'))}</select>`)}<div class="gadget-grid">${cards}</div></div>`;
}

function gadgetBody(ctx, type) {
  const project = ctx.project;
  if (type === 'mine') return issueLines(ctx, runQuery(ctx.ws, project, 'assignee = currentUser() AND status != done', { user: ctx.user, now: ctx.now }).issues.slice(0, 8));
  if (type === 'activity') return `<div class="feed">${feed(ctx, 8)}</div>`;
  if (type === 'sprint') {
    const sprint = project.sprints.find((item) => item.state === 'active');
    if (!sprint) return empty(L('진행 중인 스프린트가 없습니다.', 'There is no active sprint.'));
    const report = sprintReport(project, sprint);
    const pct = report.pointsTotal ? Math.round((report.pointsDone / report.pointsTotal) * 100) : 0;
    return `<p><b>${esc(sprint.name)}</b></p><p class="muted">${esc(sprint.goal || '')}</p><div class="bar"><i style="width:${pct}%"></i></div><p>${report.pointsDone} / ${report.pointsTotal}</p>`;
  }
  if (type === 'statusPie' || type === 'priorityPie') return pieBlock(ctx, type === 'statusPie' ? 'status' : 'priority');
  if (type === 'created') return bars(createdResolved(project, ctx.now, 8).map((row) => ({ label: formatWhen(row.to), a: row.created, b: row.resolved })), ['#3a6cf0', '#30a46c']);
  return '';
}

function reports(ctx) {
  const tabs = [['burndown', L('번다운', 'Burndown')], ['velocity', L('속도', 'Velocity')], ['flow', L('누적 흐름', 'Cumulative flow')], ['created', L('생성과 해결', 'Created and resolved')], ['pie', L('분포', 'Distribution')], ['time', L('시간', 'Time')], ['sprint', L('스프린트', 'Sprint')]];
  const nav = `<div class="tabs">${tabs.map(([id, label]) => `<button type="button" class="tab${ctx.ui.report === id ? ' active' : ''}" data-action="report" data-id="${id}">${label}</button>`).join('')}</div>`;
  return `<div class="page">${pageHead(L('보고서', 'Reports'))}${nav}<div class="report">${reportBody(ctx)}</div></div>`;
}

function reportBody(ctx) {
  const project = ctx.project;
  if (ctx.ui.report === 'velocity') {
    const rows = velocity(project);
    if (!rows.length) return empty(L('완료한 스프린트가 없습니다.', 'There is no completed sprint.'));
    return bars(rows.map((row) => ({ label: row.name, a: row.committed, b: row.completed })), ['#94a3b8', '#3a6cf0']);
  }
  if (ctx.ui.report === 'flow') {
    const rows = cumulativeFlow(project, ctx.now, 14);
    return stacked(rows);
  }
  if (ctx.ui.report === 'created') return bars(createdResolved(project, ctx.now).map((row) => ({ label: formatWhen(row.to), a: row.created, b: row.resolved })), ['#3a6cf0', '#30a46c']);
  if (ctx.ui.report === 'pie') return `<div class="split-page">${pieBlock(ctx, 'status')}${pieBlock(ctx, 'priority')}${pieBlock(ctx, 'type')}</div>`;
  if (ctx.ui.report === 'time') {
    const rows = timeReport(project, project.issues);
    return `<table class="data"><tr><th>${L('담당', 'Assignee')}</th><th>${L('추정', 'Estimate')}</th><th>${L('남음', 'Remaining')}</th><th>${L('기록', 'Logged')}</th></tr>
      ${rows.map((row) => `<tr><td>${esc(row.userId === 'unassigned' ? L('없음', 'None') : person(ctx.ws, row.userId)?.name || '')}</td><td>${esc(dur(row.original))}</td><td>${esc(dur(row.remaining))}</td><td>${esc(dur(row.spent))}</td></tr>`).join('')}</table>`;
  }
  if (ctx.ui.report === 'sprint') {
    const sprint = project.sprints.find((item) => item.state === 'active') || project.sprints.filter((item) => item.state === 'closed').at(-1);
    const report = sprintReport(project, sprint);
    if (!report) return empty(L('스프린트가 없습니다.', 'There is no sprint.'));
    const list = (ids) => ids.map((id) => findIssue(project, id)).filter(Boolean).map((issue) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(issue.id)}"><span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span></button>`).join('') || empty(L('없음', 'None'));
    return `<h2>${esc(sprint.name)}</h2><p>${report.pointsDone} / ${report.pointsTotal}</p><h3>${L('완료', 'Completed')}</h3>${list(report.completed)}<h3>${L('남음', 'Remaining')}</h3>${list(report.incomplete)}`;
  }
  const sprint = project.sprints.find((item) => item.state === 'active');
  const data = burndown(project, sprint, ctx.now);
  if (!data) return empty(L('진행 중인 스프린트의 시작과 끝이 필요합니다.', 'The active sprint needs a start and an end.'));
  return `<p>${esc(sprint.name)} · ${L('합계', 'Total')} ${Math.round(data.total)}</p>${lineChart(data.days)}`;
}

function lineChart(days) {
  const width = 640;
  const height = 220;
  const pad = 28;
  const max = Math.max(1, ...days.map((day) => Math.max(day.ideal || 0, day.remaining || 0)));
  const x = (index) => pad + (days.length === 1 ? 0 : (index / (days.length - 1)) * (width - pad * 2));
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const path = (pick, color, dash) => {
    const points = days.map((day, index) => ({ index, value: pick(day) })).filter((point) => point.value != null);
    if (!points.length) return '';
    const d = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${dash ? ' stroke-dasharray="5 4"' : ''}/>`;
  };
  return `<svg class="chart" viewBox="0 0 ${width} ${height}">${path((day) => day.ideal, '#94a3b8', true)}${path((day) => day.remaining, '#3a6cf0', false)}</svg>`;
}

function bars(rows, colors) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.a, row.b]));
  return `<div class="bars">${rows.map((row) => `<div class="bar-col"><div class="bar-pair"><i style="height:${(row.a / max) * 100}%;background:${colors[0]}"></i><i style="height:${(row.b / max) * 100}%;background:${colors[1]}"></i></div><small>${esc(row.label)}</small></div>`).join('')}</div>`;
}

function stacked(rows) {
  const max = Math.max(1, ...rows.map((row) => row.new + row.indeterminate + row.done));
  return `<div class="bars">${rows.map((row) => `<div class="bar-col"><div class="stack" style="height:120px"><i style="height:${(row.done / max) * 100}%;background:#30a46c"></i><i style="height:${(row.indeterminate / max) * 100}%;background:#f5a524"></i><i style="height:${(row.new / max) * 100}%;background:#94a3b8"></i></div><small>${esc(formatWhen(row.t))}</small></div>`).join('')}</div>`;
}

function pieBlock(ctx, field) {
  const slices = pie(ctx.project, ctx.project.issues.filter((issue) => issue.typeId !== 'epic'), field);
  const colors = ['#3a6cf0', '#30a46c', '#f5a524', '#e5484d', '#7c3aed', '#0ea5e9', '#64748b', '#db2777'];
  const painted = slices.map((slice, index) => {
    const status = byId(ctx.project.statuses, slice.id);
    const priority = byId(ctx.project.priorities, slice.id);
    const type = byId(ctx.project.issueTypes, slice.id);
    const user = person(ctx.ws, slice.id);
    const label = slice.id === 'unassigned' || slice.id === 'none' ? L('없음', 'None') : (nameOf(status || priority || type) || user?.name || slice.id);
    const color = status?.color || priority?.color || type?.color || colors[index % colors.length];
    return { ...slice, label, color: safeColor(color) };
  });
  const total = painted.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let angle = -Math.PI / 2;
  const paths = painted.map((slice) => {
    const delta = (slice.value / total) * Math.PI * 2;
    const start = angle;
    angle += delta;
    if (slice.value === total) return `<circle cx="70" cy="70" r="64" fill="${slice.color}"/>`;
    const arc = (value) => [70 + 64 * Math.cos(value), 70 + 64 * Math.sin(value)];
    const [x1, y1] = arc(start);
    const [x2, y2] = arc(angle);
    return `<path d="M70,70 L${x1},${y1} A64,64 0 ${delta > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${slice.color}"/>`;
  }).join('');
  const legend = painted.map((slice) => `<li><i style="background:${slice.color}"></i>${esc(slice.label)} <b>${slice.value}</b></li>`).join('');
  return `<div class="pie"><svg viewBox="0 0 140 140">${paths}</svg><ul>${legend}</ul></div>`;
}

function releases(ctx) {
  const project = ctx.project;
  const cards = project.versions.map((version) => {
    const issues = project.issues.filter((issue) => (issue.fixVersionIds || []).includes(version.id));
    const done = issues.filter((issue) => byId(project.statuses, issue.statusId)?.category === 'done').length;
    const pct = issues.length ? Math.round((done / issues.length) * 100) : 0;
    return `<article class="panel-card"><header><b>${esc(version.name)}</b>${version.released ? badge(L('출시', 'Released'), '#30a46c') : badge(L('예정', 'Unreleased'), '#3a6cf0')}</header><p>${esc(version.description || '')}</p><div class="bar"><i style="width:${pct}%"></i></div><p class="muted">${done}/${issues.length}${version.releaseDate ? ` · ${esc(formatWhen(version.releaseDate))}` : ''}</p><button type="button" class="small-button" data-action="release" data-id="${esc(version.id)}" data-on="${version.released ? '0' : '1'}">${version.released ? L('출시 취소', 'Unrelease') : L('출시', 'Release')}</button></article>`;
  }).join('');
  return `<div class="page">${pageHead(L('릴리스', 'Releases'), `<button type="button" class="button" data-action="new-version">${icon('plus')}${L('버전', 'Version')}</button>`)}<div class="card-grid">${cards || empty(L('버전이 없습니다.', 'There are no versions.'))}</div></div>`;
}

function components(ctx) {
  const cards = ctx.project.components.map((component) => {
    const count = ctx.project.issues.filter((issue) => (issue.componentIds || []).includes(component.id)).length;
    return `<article class="panel-card"><header><b>${esc(component.name)}</b>${avatar(person(ctx.ws, component.leadId))}</header><p>${esc(component.description || '')}</p><p class="muted">${count}</p></article>`;
  }).join('');
  return `<div class="page">${pageHead(L('구성 요소', 'Components'), `<button type="button" class="button" data-action="new-component">${icon('plus')}${L('구성 요소', 'Component')}</button>`)}<div class="card-grid">${cards || empty(L('구성 요소가 없습니다.', 'There are no components.'))}</div></div>`;
}

function filters(ctx) {
  const list = ctx.project.filters.map((filter) => `<div class="link-row"><button type="button" data-action="run-filter" data-id="${esc(filter.id)}"><b>${esc(nameOf(filter))}</b><small>${esc(filter.query)}</small></button><button type="button" class="icon-button" data-action="delete-filter" data-id="${esc(filter.id)}">${icon('trash')}</button></div>`).join('');
  return `<div class="page">${pageHead(L('필터', 'Filters'), `<button type="button" class="button" data-action="save-filter">${L('현재 질의 저장', 'Save the current query')}</button>`)}<p class="muted">${esc(ctx.ui.query || L('이슈 화면의 질의가 비어 있습니다.', 'The issue query is empty.'))}</p>${list}</div>`;
}

function people(ctx) {
  const rows = ctx.ws.users.map((user) => {
    const member = ctx.project.members.find((item) => item.userId === user.id);
    return `<tr><td>${avatar(user)} ${esc(user.name)}</td><td>${esc(user.email || '')}</td><td><select data-member="${esc(user.id)}">${options(ROLES, member?.role || '', L('역할 없음', 'No role'))}</select></td><td><input type="checkbox" data-user-active="${esc(user.id)}" ${user.active !== false ? 'checked' : ''}></td></tr>`;
  }).join('');
  const groups = ctx.ws.groups.map((group) => `<article class="panel-card"><header><b>${esc(nameOf(group))}</b></header><div class="checks">${ctx.ws.users.map((user) => `<label class="check"><input type="checkbox" data-group="${esc(group.id)}" data-user="${esc(user.id)}" ${(group.userIds || []).includes(user.id) ? 'checked' : ''}>${esc(user.name)}</label>`).join('')}</div></article>`).join('');
  return `<div class="page">${pageHead(L('사람', 'People'), `<button type="button" class="button" data-action="new-user">${icon('plus')}${L('사람', 'Person')}</button><button type="button" class="button" data-action="new-group">${L('그룹', 'Group')}</button>`)}
    <p class="muted">${L('책임자는 항상 관리자입니다. 위 선택은 이 프로젝트의 역할입니다.', 'The lead is always an administrator. The choice above is the role on this project.')}</p>
    <table class="data"><tr><th>${L('이름', 'Name')}</th><th>${L('메일', 'Email')}</th><th>${L('역할', 'Role')}</th><th>${L('사용', 'Active')}</th></tr>${rows}</table>
    <h2>${L('그룹', 'Groups')}</h2><div class="card-grid">${groups}</div></div>`;
}

function health(ctx) {
  const texts = {
    'orphan-subtask': L('상위가 없는 하위 작업', 'Sub-task without a parent'),
    'done-unresolved': L('해결이 없는 완료', 'Done without a resolution'),
    'unassigned-sprint': L('스프린트의 미배정', 'Unassigned in the sprint'),
    'sla-breached': L('기한을 넘김', 'Past the time limit'),
    blocked: L('다른 이슈에 막힘', 'Blocked by another issue'),
  };
  const items = inspect(ctx.project, ctx.now).map((item) => {
    const issue = findIssue(ctx.project, item.issueId);
    return `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId)}">${badge(item.severity === 'error' ? L('오류', 'Error') : L('주의', 'Warning'), item.severity === 'error' ? '#e5484d' : '#f5a524')}<span class="key">${esc(issue?.key || '')}</span><span>${esc(texts[item.code] || item.code)}</span><span>${esc(issue?.summary || '')}</span></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('점검', 'Health'))}${items || empty(L('문제가 없습니다.', 'Nothing needs attention.'))}</div>`;
}

function notifications(ctx) {
  const items = ctx.project.notifications.filter((item) => item.userId === ctx.user?.id).map((item) => `<button type="button" class="link-row${item.read ? '' : ' unread'}" data-action="mark-read" data-id="${esc(item.id)}" data-issue="${esc(item.issueId || '')}"><span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`).join('');
  return `<div class="page">${pageHead(L('알림', 'Notifications'), `<button type="button" class="button" data-action="mark-all-read">${L('모두 읽음', 'Mark all read')}</button>`)}${items || empty(L('알림이 없습니다.', 'There are no notifications.'))}</div>`;
}

function settings(ctx) {
  const project = ctx.project;
  const colors = ctx.settings.customTheme ? CUSTOM_KEYS.map((key) => `<label class="form-row"><span>${esc(key)}</span><input type="color" data-custom-color="${esc(key)}" value="${esc(ctx.settings.customTheme[key] || '#888888')}"></label>`).join('') : '';
  const transitions = project.transitions.map((item) => `<li><span>${esc(nameOf(byId(project.statuses, item.from)))} → ${esc(nameOf(byId(project.statuses, item.to)))}</span> <b>${esc(nameOf(item))}</b> <button type="button" class="icon-button" data-action="delete-transition" data-id="${esc(item.id)}">${icon('trash')}</button></li>`).join('');
  const statuses = project.statuses.map((status) => `<li>${badge(nameOf(status), status.color)} <button type="button" class="icon-button" data-action="delete-status" data-id="${esc(status.id)}">${icon('trash')}</button></li>`).join('');
  const rules = project.rules.map((rule) => `<li>${esc(nameOf(rule))} <button type="button" class="icon-button" data-action="delete-rule" data-id="${esc(rule.id)}">${icon('trash')}</button></li>`).join('');
  const fields = project.fields.map((field) => `<li>${esc(nameOf(field))} <small>${esc(field.type)}</small> <button type="button" class="icon-button" data-action="delete-field" data-id="${esc(field.id)}">${icon('trash')}</button></li>`).join('');
  return `<div class="page settings">${pageHead(L('설정', 'Settings'))}
    <section><h2>${L('프로젝트', 'Project')}</h2>
      <label class="form-row"><span>${L('이름', 'Name')}</span><input data-project="name" value="${esc(project.name)}"></label>
      <label class="form-row"><span>${L('설명', 'Description')}</span><textarea data-project="description" rows="3">${esc(project.description || '')}</textarea></label>
      <label class="form-row"><span>${L('책임자', 'Lead')}</span><select data-project="leadId">${userOptions(ctx.ws, project.leadId, '')}</select></label>
      <label class="check"><input type="checkbox" data-project="allowAnyTransition" ${project.allowAnyTransition !== false ? 'checked' : ''}> ${L('보드에서 어떤 상태로든 옮길 수 있음', 'Cards on the board may move to any status')}</label>
      <button type="button" class="button" data-action="${project.archived ? 'unarchive' : 'archive'}">${project.archived ? L('보관 해제', 'Unarchive') : L('프로젝트 보관', 'Archive project')}</button>
    </section>
    <section><h2>${L('작업 흐름', 'Workflow')}</h2><ul class="plain">${statuses}</ul><button type="button" class="small-button" data-action="new-status">${L('상태 추가', 'Add status')}</button><ul class="plain">${transitions}</ul><button type="button" class="small-button" data-action="new-transition">${L('전이 추가', 'Add transition')}</button></section>
    <section><h2>${L('필드', 'Fields')}</h2><ul class="plain">${fields}</ul><button type="button" class="small-button" data-action="new-field">${L('필드 추가', 'Add field')}</button></section>
    <section><h2>${L('자동화', 'Automation')}</h2><ul class="plain">${rules}</ul><button type="button" class="small-button" data-action="new-rule">${L('규칙 추가', 'Add a rule')}</button></section>
    <section><h2>${L('모양', 'Appearance')}</h2>
      <label class="form-row"><span>${L('글자 크기', 'Text size')}</span><input data-font="size" type="number" min="12" max="20" value="${esc(ctx.settings.fontSize)}"></label>
      <button type="button" class="button" data-action="edit-custom-theme">${L('사용자 정의 색', 'Custom colours')}</button>
      ${colors}
    </section>
  </div>`;
}

function help(ctx) {
  return `<div class="page help-page"><div class="tabs"><button type="button" class="tab${ctx.ui.help === 'wql' ? '' : ' active'}" data-action="help-doc" data-id="guide">${L('사용 설명서', "User's guide")}</button><button type="button" class="tab${ctx.ui.help === 'wql' ? ' active' : ''}" data-action="help-doc" data-id="wql">WQL</button></div><article class="md">${renderMarkdown(ctx.guide || '')}</article></div>`;
}

function issue(ctx) {
  const current = findIssue(ctx.project, ctx.ui.issueId);
  if (!current) return `<div class="page">${empty(L('이슈를 고르세요.', 'Choose an issue.'))}</div>`;
  const tabs = [['details', L('설명', 'Description')], ['comments', L('의견', 'Comments')], ['work', L('작업 기록', 'Work log')], ['history', L('기록', 'History')], ['links', L('연결', 'Links')]];
  const children = ctx.project.issues.filter((item) => item.parentId === current.id || (current.typeId === 'epic' && item.epicId === current.id && item.id !== current.id));
  return `<div class="page issue">
    <div class="issue-title">${typeBadge(ctx.project, current.typeId)}<span class="key">${esc(current.key)}</span></div>
    <input class="summary-input" data-field="summary" data-live value="${esc(current.summary)}">
    <div class="tabs">${tabs.map(([id, label]) => `<button type="button" class="tab${ctx.ui.issueTab === id ? ' active' : ''}" data-action="issue-tab" data-id="${id}">${label}</button>`).join('')}</div>
    ${issueTab(ctx, current)}
    ${children.length ? `<h3>${current.typeId === 'epic' ? L('안의 이슈', 'Issues inside') : L('하위 작업', 'Sub-tasks')}</h3>${issueLines(ctx, children)}` : ''}
    ${current.typeId !== 'subtask' && current.typeId !== 'epic' ? `<button type="button" class="small-button" data-action="create-subtask">${L('하위 작업', 'Sub-task')}</button>` : ''}
  </div>`;
}

function issueTab(ctx, issue) {
  if (ctx.ui.issueTab === 'comments') {
    const list = issue.comments.map((comment) => `<article class="comment"><header>${avatar(person(ctx.ws, comment.authorId))}<b>${esc(person(ctx.ws, comment.authorId)?.name || '')}</b><small>${esc(formatWhen(comment.created))}</small><button type="button" class="icon-button" data-action="delete-comment" data-id="${esc(comment.id)}">${icon('trash')}</button></header><div class="md">${renderMarkdown(comment.body)}</div></article>`).join('');
    return `${list}<textarea id="comment-body" rows="3" placeholder="${esc(L('의견을 적습니다. @이름으로 알립니다.', 'Write a comment. @name notifies that person.'))}"></textarea><button type="button" class="button" data-action="add-comment">${L('등록', 'Add')}</button>`;
  }
  if (ctx.ui.issueTab === 'work') {
    const list = issue.worklogs.map((log) => `<div class="link-row"><span>${esc(dur(log.minutes))} · ${esc(person(ctx.ws, log.authorId)?.name || '')}</span><span>${esc(log.comment || '')}</span><button type="button" class="icon-button" data-action="delete-worklog" data-id="${esc(log.id)}">${icon('trash')}</button></div>`).join('');
    return `${list}<div class="inline"><input id="work-minutes" placeholder="1h 30m"><input id="work-note" placeholder="${esc(L('메모', 'Note'))}"><button type="button" class="button" data-action="add-worklog">${L('기록', 'Log')}</button></div>`;
  }
  if (ctx.ui.issueTab === 'history') {
    return issue.history.slice().reverse().map((entry) => `<div class="link-row"><span>${esc(historyText(ctx, entry))}</span><small>${esc(formatWhen(entry.at))}</small></div>`).join('') || empty(L('기록이 없습니다.', 'There is no history.'));
  }
  if (ctx.ui.issueTab === 'links') {
    const list = (issue.links || []).map((link) => {
      const type = LINK_TYPES.find((item) => item.id === link.type);
      const other = findIssue(ctx.project, link.otherId);
      const label = link.direction === 'out' ? nameOf(type) : (ctx.settings.language === 'en' ? type?.inverseEn : type?.inverseKo);
      return `<div class="link-row"><span>${esc(label || link.type)}</span><button type="button" class="key" data-action="open-issue" data-id="${esc(other?.id || '')}">${esc(other?.key || '')}</button><span>${esc(other?.summary || '')}</span><button type="button" class="icon-button" data-action="remove-link" data-id="${esc(link.id)}">${icon('trash')}</button></div>`;
    }).join('');
    return `${list}<div class="inline"><select id="link-type">${options(LINK_TYPES, 'relates')}</select><input id="link-key" placeholder="SHOP-1"><button type="button" class="button" data-action="add-link">${L('연결', 'Link')}</button></div>`;
  }
  return `<div class="desc-tools"><button type="button" class="small-button" data-action="toggle-preview">${ctx.ui.preview ? L('편집', 'Edit') : L('미리 보기', 'Preview')}</button></div>
    ${ctx.ui.preview ? `<article class="md">${renderMarkdown(issue.description || '')}</article>` : `<textarea data-field="description" data-live rows="12">${esc(issue.description || '')}</textarea>`}`;
}

export function renderRight(ctx) {
  if (!showRight(ctx)) return '';
  if (ctx.ui.view === 'backlog') {
    const epics = ctx.project.issues.filter((issue) => issue.typeId === 'epic');
    const list = `<button type="button" class="nav-button${ctx.ui.epicId ? '' : ' active'}" data-action="epic-filter" data-id="">${L('모든 에픽', 'All epics')}</button>${epics.map((epic) => `<button type="button" class="nav-button${ctx.ui.epicId === epic.id ? ' active' : ''}" data-action="epic-filter" data-id="${esc(epic.id)}">${esc(epic.summary)}</button>`).join('')}`;
    return `<div class="side"><div class="side-head">${L('에픽', 'Epics')}</div>${list}${preview(ctx)}</div>`;
  }
  if (ctx.ui.view === 'issue') return `<div class="side"><div class="side-head">${L('세부 사항', 'Details')}</div>${fields(ctx)}</div>`;
  return `<div class="side"><div class="side-head">${L('이슈', 'Issue')}</div>${preview(ctx)}</div>`;
}

function preview(ctx) {
  const issue = findIssue(ctx.project, ctx.ui.issueId);
  if (!issue) return empty(L('이슈를 고르면 여기에 나옵니다.', 'Choose an issue to see it here.'));
  const moves = movesFrom(ctx.project, issue.statusId).map((move) => `<button type="button" class="small-button" data-action="transition" data-to="${esc(move.to)}">${esc(nameOf(move))}</button>`).join('');
  return `<div class="preview">${typeBadge(ctx.project, issue.typeId)}<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${esc(issue.key)}</button><p>${esc(issue.summary)}</p><div class="wrap">${moves}</div></div>`;
}

function fields(ctx) {
  const issue = findIssue(ctx.project, ctx.ui.issueId);
  if (!issue) return empty(L('이슈를 고르세요.', 'Choose an issue.'));
  const project = ctx.project;
  const sla = slaState(project, issue, ctx.now);
  const moves = movesFrom(project, issue.statusId).map((move) => `<button type="button" class="small-button" data-action="transition" data-to="${esc(move.to)}">${esc(nameOf(move))}</button>`).join('');
  const checks = (list, key) => list.map((item) => `<label class="check"><input type="checkbox" data-multi="${key}" value="${esc(item.id)}" ${(issue[key] || []).includes(item.id) ? 'checked' : ''}>${esc(item.name || nameOf(item))}</label>`).join('');
  const custom = project.fields.map((field) => {
    const value = issue.fields?.[field.id] ?? '';
    let control = `<input data-custom="${esc(field.id)}" value="${esc(value)}">`;
    if (field.type === 'number') control = `<input data-custom="${esc(field.id)}" data-parse="number" value="${esc(value)}">`;
    if (field.type === 'date') control = `<input type="date" data-custom="${esc(field.id)}" data-parse="date" value="${esc(String(value).slice(0, 10))}">`;
    if (field.type === 'user') control = `<select data-custom="${esc(field.id)}">${userOptions(ctx.ws, value, L('없음', 'None'))}</select>`;
    if (field.type === 'select') control = `<select data-custom="${esc(field.id)}">${options((field.options || []).map((option) => ({ id: option, name: option })), value, L('없음', 'None'))}</select>`;
    return prop(nameOf(field), control);
  }).join('');
  const watching = (issue.watchers || []).includes(ctx.user?.id);
  return `<div class="props">
    ${sla ? `<p class="banner${sla.breached && byId(project.statuses, issue.statusId)?.category !== 'done' ? ' bad' : ''}">${L('기한', 'Limit')} ${esc(formatWhen(new Date(sla.due).toISOString()))} · ${sla.hours}h</p>` : ''}
    <div class="wrap">${moves}</div>
    ${prop(L('상태', 'Status'), `<select data-field="statusId">${options(project.statuses, issue.statusId)}</select>`)}
    ${prop(L('해결', 'Resolution'), `<select data-field="resolutionId">${options(project.resolutions, issue.resolutionId, L('없음', 'None'))}</select>`)}
    ${prop(L('우선순위', 'Priority'), `<select data-field="priorityId">${options(project.priorities, issue.priorityId)}</select>`)}
    ${prop(L('담당', 'Assignee'), `<select data-field="assigneeId">${userOptions(ctx.ws, issue.assigneeId)}</select>`)}
    ${prop(L('보고자', 'Reporter'), `<select data-field="reporterId">${userOptions(ctx.ws, issue.reporterId, '')}</select>`)}
    ${prop(L('에픽', 'Epic'), `<select data-field="epicId">${options(project.issues.filter((item) => item.typeId === 'epic'), issue.epicId, L('없음', 'None'))}</select>`)}
    ${prop(L('스프린트', 'Sprint'), `<select data-field="sprintId">${options(project.sprints.filter((sprint) => sprint.state !== 'closed' || sprint.id === issue.sprintId), issue.sprintId, L('없음', 'None'))}</select>`)}
    ${prop(L('포인트', 'Points'), `<input data-field="storyPoints" data-parse="number" value="${issue.storyPoints ?? ''}">`)}
    ${prop(L('추정', 'Estimate'), `<input data-field="originalEstimate" data-parse="duration" value="${esc(dur(issue.originalEstimate))}">`)}
    ${prop(L('남음', 'Remaining'), `<input data-field="remainingEstimate" data-parse="duration" value="${esc(dur(issue.remainingEstimate))}">`)}
    ${prop(L('기록', 'Logged'), `<span>${esc(dur(issue.timeSpent))}</span>`)}
    ${prop(L('기한', 'Due'), `<input type="date" data-field="due" data-parse="date" value="${esc(dateInputValue(issue.due))}">`)}
    ${prop(L('라벨', 'Labels'), `<input data-field="labels" data-parse="labels" value="${esc((issue.labels || []).join(', '))}">`)}
    ${prop(L('환경', 'Environment'), `<input data-field="environment" data-live value="${esc(issue.environment || '')}">`)}
    <h3>${L('구성 요소', 'Components')}</h3><div class="checks">${checks(project.components, 'componentIds')}</div>
    <h3>${L('수정 버전', 'Fix versions')}</h3><div class="checks">${checks(project.versions, 'fixVersionIds')}</div>
    ${custom}
    <h3>${L('관찰', 'Watchers')}</h3><div class="avatars">${(issue.watchers || []).map((id) => avatar(person(ctx.ws, id))).join('')}</div>
    <button type="button" class="small-button" data-action="toggle-watch">${watching ? L('관찰 그만', 'Stop watching') : L('관찰', 'Watch')}</button>
    <h3>${L('첨부', 'Attachments')}</h3>
    ${(issue.attachments || []).map((file) => `<div class="link-row"><a href="${esc(file.data)}" download="${esc(file.name)}">${esc(file.name)}</a><button type="button" class="icon-button" data-action="remove-attachment" data-id="${esc(file.id)}">${icon('trash')}</button></div>`).join('')}
    <button type="button" class="small-button" data-action="pick-attachment">${L('파일 추가', 'Add a file')}</button>
    <div class="page-actions"><button type="button" class="button" data-action="clone-issue">${L('복제', 'Clone')}</button><button type="button" class="button danger" data-action="delete-issue">${L('삭제', 'Delete')}</button></div>
  </div>`;
}

function prop(label, control) {
  return `<label class="prop"><span>${label}</span>${control}</label>`;
}

function feed(ctx, count) {
  return (ctx.project?.activity || []).slice(0, count).map((item) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId || '')}"><span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`).join('') || empty(L('활동이 없습니다.', 'There is no activity.'));
}

function activityText(ctx, item) {
  const who = person(ctx.ws, item.actorId)?.name || '';
  const key = item.issueKey || findIssue(ctx.project, item.issueId)?.key || '';
  if (item.kind === 'created') return L(`${who} 님이 ${key} 을(를) 만들었습니다`, `${who} created ${key}`);
  if (item.kind === 'comment') return L(`${who} 님이 ${key} 에 의견을 남겼습니다`, `${who} commented on ${key}`);
  if (item.kind === 'transition') return L(`${who} 님이 ${key} 의 상태를 바꿨습니다`, `${who} moved ${key}`);
  if (item.kind === 'assign') return L(`${who} 님이 ${key} 의 담당을 바꿨습니다`, `${who} assigned ${key}`);
  if (item.kind === 'worklog') return L(`${who} 님이 ${key} 에 시간을 기록했습니다`, `${who} logged time on ${key}`);
  if (item.kind === 'sprint') return item.state === 'active' ? L(`${who} 님이 스프린트를 시작했습니다`, `${who} started a sprint`) : L(`${who} 님이 스프린트를 완료했습니다`, `${who} completed a sprint`);
  if (item.kind === 'release') return L(`${who} 님이 버전을 출시했습니다`, `${who} released a version`);
  if (item.kind === 'delete') return L(`${who} 님이 ${key} 을(를) 지웠습니다`, `${who} deleted ${key}`);
  if (item.kind === 'link') return L(`${who} 님이 ${key} 을(를) 연결했습니다`, `${who} linked ${key}`);
  return L(`${who} 님이 ${key} 을(를) 고쳤습니다`, `${who} updated ${key}`);
}

function historyText(ctx, entry) {
  const who = person(ctx.ws, entry.actorId)?.name || '';
  const show = (value) => {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return value || L('없음', 'empty');
  };
  return L(`${who} · ${entry.field}: ${show(entry.from)} → ${show(entry.to)}`, `${who} · ${entry.field}: ${show(entry.from)} → ${show(entry.to)}`);
}
