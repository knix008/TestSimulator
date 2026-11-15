import { GADGETS, LINK_TYPES, ROLES } from '../domain/catalog.js';
import { getLanguage } from '../i18n.js';
import { renderMarkdown } from '../domain/markdown.js';
import { runQuery } from '../domain/query.js';
import { burndown, createdResolved, cumulativeFlow, inspect, pie, slaState, sprintReport, timeReport, velocity } from '../domain/reports.js';
import { calendarOf, controlChart, epicBurndown, groupLanes } from '../domain/services.js';
import { isWorkspaceAdmin } from '../domain/permissions.js';
import { activeSprint, findIssue, movesFrom } from '../domain/store.js';
import { dateInputValue, formatDuration } from '../domain/util.js';
import { CUSTOM_KEYS } from '../themes.js';
import { avatar, badge, byId, empty, esc, formatWhen, icon, L, nameOf, options, pageHead, panelFrame, person, safeColor, typeBadge, userOptions } from './bits.js';
import { navLabel } from './chrome.js';
import { BACKGROUND_INTERVALS, BACKGROUNDS, knownBackground } from './background.js';
import { databaseSettings } from './start.js';
import { approvalBlock, calendarView, documentsView, extensionsView, knowledgeView, laneLabel, plansView, portalView, screenSection, swimlaneOptions } from './extra.js';

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
  return `<div class="page">${pageHead(title, '', ctx.ui.view)}<p>${L('과제 홈에서 프로젝트를 만드세요.', 'Create a project from Project home.')}</p><button type="button" class="button primary" data-action="go" data-view="home">${icon('home')}<span>${esc(navLabel('home'))}</span></button></div>`;
}

export function showRight(ctx) {
  return Boolean(ctx.project) && ['board', 'backlog', 'issues', 'issue', 'roadmap', 'queues', 'health', 'filters', 'notifications'].includes(ctx.ui.view);
}

export function renderView(ctx) {
  if (ctx.ui.view === 'home') return home(ctx);
  if (ctx.ui.view === 'help') return help(ctx);
  if (ctx.ui.view === 'knowledge') return knowledgeView(ctx);
  if (ctx.ui.view === 'documents') return documentsView(ctx);
  if (ctx.ui.view === 'calendar') return calendarView(ctx);
  if (ctx.ui.view === 'portal') return portalView(ctx);
  if (ctx.ui.view === 'plans') return plansView(ctx);
  if (ctx.ui.view === 'extensions') return extensionsView(ctx);
  if (ctx.ui.view === 'settings') return settings(ctx);
  if (ctx.ui.view === 'users') return usersAdmin(ctx);
  if (ctx.ui.view === 'projects') return projectsAdmin(ctx);
  const missing = need(ctx, navLabel(ctx.ui.view));
  if (missing) return missing;
  const views = { board, backlog, roadmap, issues, queues, dashboard, reports, releases, components, filters, people, health, notifications, settings, issue };
  return (views[ctx.ui.view] || home)(ctx);
}

function home(ctx) {
  if (!ctx.ws.projects.length) {
    const action = (name, glyph, ko, en, extra = '', primary = false) => `<button type="button" class="button${primary ? ' primary' : ''}" data-action="${name}" ${extra}>${icon(glyph)}<span>${L(ko, en)}</span></button>`;
    return `<div class="page home empty-home"><div class="center-empty">${icon('home')}
      <p>${L('과제를 생성하거나 여세요.', 'Create or open a project.')}</p>
      <div class="page-actions">
        ${action('new-project', 'plus', '새 프로젝트', 'New project', '', true)}
        ${action('open-file', 'folder', '열기', 'Open')}
        ${action('browse-examples', 'box', '예제 고르기', 'Choose an example')}
        ${action('start-tutorial', 'play', '튜토리얼', 'Tutorial')}
      </div>
      <div class="page-actions">
        ${action('open-guide', 'book', '사용 설명서', "User's guide", 'data-id="guide"')}
        ${action('open-guide', 'play', '튜토리얼 문서', 'Tutorial document', 'data-id="tutorial"')}
        ${action('open-guide', 'filter', 'WQL 설명서', 'WQL guide', 'data-id="wql"')}
        ${action('go', 'database', '데이터베이스', 'Database', 'data-view="settings"')}
      </div>
    </div></div>`;
  }
  const cards = ctx.ws.projects.map((project) => `<button type="button" class="project-card${project.id === ctx.ws.activeProjectId ? ' active' : ''}" data-action="activate" data-id="${esc(project.id)}"><b>${icon('folder')}${esc(project.key)}</b><span>${esc(project.name)}</span><small>${project.issues.length} · ${esc(nameOf(project.type === 'service' ? { ko: '서비스', en: 'Service' } : project.type === 'business' ? { ko: '업무', en: 'Business' } : { ko: '소프트웨어', en: 'Software' }))}</small></button>`).join('');
  return `<div class="page home">
    <div class="hero"><img src="./icon.png" alt="" width="48" height="48"><div><h1>${icon('home')}MyWorkForce</h1><p>${L('이슈, 보드, 스프린트, 로드맵, 대시보드, 보고서를 한 작업 공간에서 다룹니다.', 'Issues, boards, sprints, the roadmap, dashboards and reports in one workspace.')}</p></div></div>
    <div class="page-actions">
      <button type="button" class="button primary" data-action="new-project">${icon('plus')}${L('새 프로젝트', 'New project')}</button>
      <button type="button" class="button" data-action="open-file">${icon('folder')}${L('열기', 'Open')}</button>
      <button type="button" class="button" data-action="browse-examples">${icon('box')}${L('예제 고르기', 'Choose an example')}</button>
      <button type="button" class="button" data-action="start-tutorial">${icon('play')}${L('튜토리얼', 'Tutorial')}</button>
      <button type="button" class="button" data-action="empty-workspace">${icon('close')}${L('빈 작업 공간', 'Empty workspace')}</button>
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
      <h1>${icon('board')}${esc(nameOf(current))}</h1>
      <div class="page-actions">
        <select data-choose="board">${options(project.boards, current?.id)}</select>
        ${sprint ? `<span class="muted">${esc(sprint.name)} · ${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))}</span><button type="button" class="button" data-action="complete-sprint" data-id="${esc(sprint.id)}">${icon('check')}<span>${L('스프린트 완료', 'Complete sprint')}</span></button>` : ''}
        ${!sprint && future ? `<button type="button" class="button primary" data-action="start-sprint" data-id="${esc(future.id)}">${icon('play')}<span>${L('스프린트 시작', 'Start sprint')}</span></button>` : ''}
        ${current?.type === 'scrum' ? `<button type="button" class="button" data-action="new-sprint">${icon('play')}<span>${L('스프린트', 'Sprint')}</span></button>` : ''}
        ${swimlaneOptions(ctx.ui.swimlane)}
      </div>
    </div>`;
  if (current?.type === 'scrum' && !sprint) {
    return `<div class="fill">${head}<div class="page">${empty(L('진행 중인 스프린트가 없습니다. 계획된 스프린트를 시작하세요.', 'There is no active sprint. Start a planned one.'))}</div></div>`;
  }
  const columnBoard = (list) => (current?.columns || []).map((column) => {
    const status = byId(project.statuses, column.statusId);
    const cards = list.filter((issue) => issue.statusId === column.statusId).sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const over = column.wip && cards.length > column.wip ? ' over' : '';
    return `<section class="column${over}" data-drop data-status="${esc(column.statusId)}">
      <header>${badge(nameOf(status), status?.color)}<b>${cards.length}</b>${column.wip ? `<small>/${column.wip}</small>` : ''}</header>
      <div class="cards" data-cards>${cards.map((issue) => card(ctx, issue)).join('')}</div>
    </section>`;
  }).join('');
  if ((ctx.ui.swimlane || 'none') === 'none') return `<div class="fill">${head}<div class="board">${columnBoard(issues)}</div></div>`;
  const lanes = groupLanes(issues, ctx.ui.swimlane).map((lane) => `<section class="lane"><header>${esc(laneLabel(ctx, ctx.ui.swimlane, lane.id))}</header><div class="board">${columnBoard(lane.issues)}</div></section>`).join('');
  return `<div class="fill">${head}<div class="lanes">${lanes}</div></div>`;
}

function card(ctx, issue) {
  const priority = byId(ctx.project.priorities, issue.priorityId);
  const points = issue.storyPoints != null ? `<span class="pts">${esc(issue.storyPoints)}</span>` : '';
  return `<article class="card${issue.id === ctx.ui.issueId ? ' selected' : ''}" draggable="true" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    <div class="card-top">${typeBadge(ctx.project, issue.typeId)}<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button></div>
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
    const actions = sprint?.state === 'future' ? `<button type="button" class="small-button" data-action="start-sprint" data-id="${esc(sprint.id)}">${icon('play')}<span>${L('시작', 'Start')}</span></button>` : '';
    const complete = sprint?.state === 'active' ? `<button type="button" class="small-button" data-action="complete-sprint" data-id="${esc(sprint.id)}">${icon('check')}<span>${L('완료', 'Complete')}</span></button>` : '';
    return `<section class="bucket" data-drop data-sprint="${esc(sprint?.id || '')}">
      <header><b>${esc(title)}</b><span class="muted">${sprint ? `${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))} ${esc(sprint.goal || '')}` : ''}</span><span class="grow"></span>${actions}${complete}<span>${rows.length}</span></header>
      <div class="rows" data-cards>${rows.map((issue) => row(ctx, issue)).join('') || `<p class="empty">${L('끌어 놓으세요.', 'Drop issues here.')}</p>`}</div>
    </section>`;
  }).join('');
  const closed = project.sprints.filter((sprint) => sprint.state === 'closed');
  return `<div class="page">${pageHead(L('백로그', 'Backlog'), `<button type="button" class="button" data-action="new-sprint">${icon('plus')}${L('스프린트', 'Sprint')}</button>`, 'backlog')}${body}
    ${closed.length ? `<p class="muted">${L('완료한 스프린트', 'Completed sprints')}: ${closed.map((sprint) => esc(sprint.name)).join(', ')}</p>` : ''}</div>`;
}

function row(ctx, issue) {
  const epic = findIssue(ctx.project, issue.epicId);
  return `<div class="issue-row${issue.id === ctx.ui.issueId ? ' selected' : ''}" draggable="true" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    ${typeBadge(ctx.project, issue.typeId)}
    <button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button>
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
    return `<button type="button" class="epic-row" data-action="open-issue" data-id="${esc(epic.id)}"><span class="key">${icon('epic')}${esc(epic.key)}</span><b>${esc(epic.summary)}</b><span class="bar"><i style="width:${pct}%"></i></span><small>${done}/${children.length}</small></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('로드맵', 'Roadmap'), '', 'roadmap')}${bars || empty(L('에픽이 없습니다.', 'There are no epics.'))}</div>`;
}

function issues(ctx) {
  const result = queried(ctx, true);
  const project = ctx.project;
  const selected = new Set(ctx.ui.selected || []);
  const head = `<tr><th></th>${['key', 'type', 'summary', 'status', 'priority', 'assignee', 'sprint', 'points'].map((field) => {
    const labels = { key: L('키', 'Key'), type: L('유형', 'Type'), summary: L('요약', 'Summary'), status: L('상태', 'Status'), priority: L('우선순위', 'Priority'), assignee: L('담당', 'Assignee'), sprint: L('스프린트', 'Sprint'), points: L('포인트', 'Points') };
    const mark = ctx.ui.sort?.field === field ? (ctx.ui.sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-action="sort" data-field="${field}">${icon('columns')}<span>${labels[field]}${mark}</span></button></th>`;
  }).join('')}</tr>`;
  const body = result.issues.slice(0, 400).map((issue) => {
    const status = byId(project.statuses, issue.statusId);
    const priority = byId(project.priorities, issue.priorityId);
    const sprint = byId(project.sprints, issue.sprintId);
    return `<tr class="${issue.id === ctx.ui.issueId ? 'active' : ''}">
      <td><input type="checkbox" data-action="select-one" data-id="${esc(issue.id)}" ${selected.has(issue.id) ? 'checked' : ''}></td>
      <td><button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button></td>
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
      <button type="button" class="small-button" data-action="clear-selection">${icon('close')}<span>${L('선택 해제', 'Clear')}</span></button>
    </div>` : '';
  const note = result.issues.length > 400 ? `<p class="muted">${L('400개까지 표시합니다.', 'Showing the first 400.')}</p>` : '';
  return `<div class="page">${pageHead(L('이슈', 'Issues'), `<button type="button" class="button" data-action="import-csv">${icon('download')}${L('CSV 가져오기', 'Import CSV')}</button><button type="button" class="button primary" data-action="new-issue">${icon('plus')}${L('이슈', 'Issue')}</button>`, 'issues')}
    <div class="query-line"><label class="quick-search">${icon('filter')}<input id="issue-query" value="${esc(ctx.ui.query || '')}" placeholder="${esc(L('WQL. 예: type = bug AND status != done', 'WQL. Example: type = bug AND status != done'))}"></label><button type="button" class="button" data-action="open-guide" data-id="wql">${icon('book')}<span>${L('WQL 설명서', 'WQL guide')}</span></button></div>
    ${bulk}${note}<div class="table-wrap"><table class="data">${head}${body}</table></div>
    ${result.error ? `<p class="danger-text">${L('질의 문법을 확인하세요.', 'Check the query syntax.')}</p>` : `<p class="muted">${result.issues.length}</p>`}</div>`;
}

function queues(ctx) {
  const project = ctx.project;
  const queues = project.queues || [];
  const current = queues.find((queue) => queue.id === ctx.ui.queueId) || queues[0];
  const list = queues.map((queue) => {
    const count = runQuery(ctx.ws, project, queue.query, { user: ctx.user, now: ctx.now }).issues.length;
    return `<button type="button" class="nav-button${queue.id === current?.id ? ' active' : ''}" data-action="queue" data-id="${esc(queue.id)}">${icon('list')}<span>${esc(nameOf(queue))}</span><i class="count">${count}</i></button>`;
  }).join('');
  const issues = current ? runQuery(ctx.ws, project, current.query, { user: ctx.user, now: ctx.now }).issues : [];
  return `<div class="page">${pageHead(L('대기열', 'Queues'), '', 'queues')}<div class="split-page"><div class="queue-list">${list || empty(L('대기열이 없습니다.', 'There are no queues.'))}</div><div>${issueLines(ctx, issues)}</div></div></div>`;
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
  return `<div class="page">${pageHead(L('대시보드', 'Dashboard'), `<select data-choose="gadget">${options(GADGETS, '', L('가젯 추가', 'Add a gadget'))}</select>`, 'dashboard')}<div class="gadget-grid">${cards}</div></div>`;
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
  const tabs = [['burndown', L('번다운', 'Burndown')], ['velocity', L('속도', 'Velocity')], ['flow', L('누적 흐름', 'Cumulative flow')], ['created', L('생성과 해결', 'Created and resolved')], ['pie', L('분포', 'Distribution')], ['time', L('시간', 'Time')], ['sprint', L('스프린트', 'Sprint')], ['control', L('제어', 'Control')], ['epic', L('에픽 번다운', 'Epic burndown')]];
  const glyphs = { burndown: 'chart', velocity: 'bolt', flow: 'workflow', created: 'plus', pie: 'chart', time: 'clock', sprint: 'play', control: 'columns', epic: 'epic' };
  const nav = `<div class="tabs">${tabs.map(([id, label]) => `<button type="button" class="tab${ctx.ui.report === id ? ' active' : ''}" data-action="report" data-id="${id}">${icon(glyphs[id])}<span>${label}</span></button>`).join('')}</div>`;
  return `<div class="page">${pageHead(L('보고서', 'Reports'), '', 'reports')}${nav}<div class="report">${reportBody(ctx)}</div></div>`;
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
    const list = (ids) => ids.map((id) => findIssue(project, id)).filter(Boolean).map((issue) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}<span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span></button>`).join('') || empty(L('없음', 'None'));
    return `<h2>${esc(sprint.name)}</h2><p>${report.pointsDone} / ${report.pointsTotal}</p><h3>${L('완료', 'Completed')}</h3>${list(report.completed)}<h3>${L('남음', 'Remaining')}</h3>${list(report.incomplete)}`;
  }
  if (ctx.ui.report === 'control') {
    const data = controlChart(project, ctx.now);
    if (!data.points.length) return empty(L('완료까지 상태가 바뀐 이슈가 없습니다.', 'No issue has moved through to done.'));
    return `<p>${L('평균', 'Average')} ${data.average.toFixed(1)} ${L('일', 'days')}</p>${bars(data.points.slice(0, 16).map((point) => ({ label: point.key, a: point.days, b: data.average })), ['#3a6cf0', '#94a3b8'])}`;
  }
  if (ctx.ui.report === 'epic') {
    const epics = project.issues.filter((issue) => issue.typeId === 'epic');
    const epic = epics.find((issue) => issue.id === ctx.ui.epicId) || epics[0];
    const data = epicBurndown(project, epic, ctx.now);
    if (!data) return empty(L('에픽이 없습니다.', 'There is no epic.'));
    return `<p>${esc(epic.key)} ${esc(epic.summary)} · ${Math.round(data.total)}</p>${lineChart(data.days.map((day) => ({ ideal: day.total, remaining: day.remaining })))}`;
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
    return `<article class="panel-card"><header><b>${esc(version.name)}</b>${version.released ? badge(L('출시', 'Released'), '#30a46c') : badge(L('예정', 'Unreleased'), '#3a6cf0')}</header><p>${esc(version.description || '')}</p><div class="bar"><i style="width:${pct}%"></i></div><p class="muted">${done}/${issues.length}${version.releaseDate ? ` · ${esc(formatWhen(version.releaseDate))}` : ''}</p><button type="button" class="small-button" data-action="release" data-id="${esc(version.id)}" data-on="${version.released ? '0' : '1'}">${icon(version.released ? 'undo' : 'release')}<span>${version.released ? L('출시 취소', 'Unrelease') : L('출시', 'Release')}</span></button></article>`;
  }).join('');
  return `<div class="page">${pageHead(L('릴리스', 'Releases'), `<button type="button" class="button" data-action="new-version">${icon('plus')}${L('버전', 'Version')}</button>`, 'releases')}<div class="card-grid">${cards || empty(L('버전이 없습니다.', 'There are no versions.'))}</div></div>`;
}

function components(ctx) {
  const cards = ctx.project.components.map((component) => {
    const count = ctx.project.issues.filter((issue) => (issue.componentIds || []).includes(component.id)).length;
    return `<article class="panel-card"><header><b>${esc(component.name)}</b>${avatar(person(ctx.ws, component.leadId))}</header><p>${esc(component.description || '')}</p><p class="muted">${count}</p></article>`;
  }).join('');
  return `<div class="page">${pageHead(L('구성 요소', 'Components'), `<button type="button" class="button" data-action="new-component">${icon('plus')}${L('구성 요소', 'Component')}</button>`, 'components')}<div class="card-grid">${cards || empty(L('구성 요소가 없습니다.', 'There are no components.'))}</div></div>`;
}

function filters(ctx) {
  const list = ctx.project.filters.map((filter) => `<div class="link-row"><button type="button" data-action="run-filter" data-id="${esc(filter.id)}">${icon('filter')}<b>${esc(nameOf(filter))}</b><small>${esc(filter.query)}</small></button><button type="button" class="icon-button" data-action="delete-filter" data-id="${esc(filter.id)}">${icon('trash')}</button></div>`).join('');
  return `<div class="page">${pageHead(L('필터', 'Filters'), `<button type="button" class="button" data-action="open-guide" data-id="wql">${icon('book')}<span>${L('WQL 설명서', 'WQL guide')}</span></button><button type="button" class="button" data-action="save-filter">${icon('save')}<span>${L('현재 질의 저장', 'Save the current query')}</span></button>`, 'filters')}<p class="muted">${esc(ctx.ui.query || L('이슈 화면의 질의가 비어 있습니다.', 'The issue query is empty.'))}</p>${list}</div>`;
}

function adminOnly(ctx, title, view) {
  if (isWorkspaceAdmin(ctx.user)) return '';
  return `<div class="page">${pageHead(title, '', view)}<p>${L('관리자 계정으로 로그인해야 합니다.', 'Sign in with the administrator account.')}</p></div>`;
}

function usersAdmin(ctx) {
  const blocked = adminOnly(ctx, L('사용자', 'Users'), 'users');
  if (blocked) return blocked;
  const project = ctx.project;
  const rows = ctx.ws.users.map((user) => {
    const member = project?.members?.find((item) => item.userId === user.id);
    const role = project ? `<td><select data-member="${esc(user.id)}">${options(ROLES, member?.role || '', L('역할 없음', 'No role'))}</select></td>` : '';
    return `<tr><td>${avatar(user)} ${esc(user.name)}</td><td>${esc(user.login || '')}</td><td>${esc(user.email || '')}</td>${role}<td><input type="checkbox" data-user-active="${esc(user.id)}" ${user.active !== false ? 'checked' : ''}></td></tr>`;
  }).join('');
  const roleHead = project ? `<th>${L('역할', 'Role')}</th>` : '';
  return `<div class="page">${pageHead(L('사용자', 'Users'), `<button type="button" class="button" data-action="new-user">${icon('plus')}${L('사용자', 'User')}</button><button type="button" class="button" data-action="new-group">${icon('people')}${L('그룹', 'Group')}</button><button type="button" class="button" data-action="set-password">${icon('lock')}${L('암호', 'Password')}</button>`, 'users')}
    <p class="muted">${project ? L('선택한 과제의 역할을 바꿉니다. 사용 칸은 이 작업 공간의 로그인입니다.', 'The role is for the open project. The Active box is the sign-in for this workspace.') : L('과제를 연 뒤 그 과제의 역할을 정할 수 있습니다.', 'Open a project to set a role on it.')}</p>
    <table class="data"><tr><th>${L('이름', 'Name')}</th><th>${L('아이디', 'Account')}</th><th>${L('메일', 'Email')}</th>${roleHead}<th>${L('사용', 'Active')}</th></tr>${rows}</table>
  </div>`;
}

function projectsAdmin(ctx) {
  const blocked = adminOnly(ctx, L('과제', 'Projects'), 'projects');
  if (blocked) return blocked;
  const typeName = (type) => nameOf(type === 'service' ? { ko: '서비스', en: 'Service' } : type === 'business' ? { ko: '업무', en: 'Business' } : { ko: '소프트웨어', en: 'Software' });
  const rows = ctx.ws.projects.map((project) => `<tr>
      <td>${esc(project.key)}</td>
      <td><input data-managed="name" data-id="${esc(project.id)}" value="${esc(project.name)}" aria-label="${esc(L('이름', 'Name'))}"></td>
      <td>${esc(typeName(project.type))}</td>
      <td><select data-managed="lead" data-id="${esc(project.id)}" aria-label="${esc(L('책임자', 'Lead'))}">${userOptions(ctx.ws, project.leadId, '')}</select></td>
      <td>${project.archived ? L('보관', 'Archived') : L('사용', 'Active')}</td>
      <td><button type="button" class="small-button" data-action="activate" data-id="${esc(project.id)}">${icon('folder')}<span>${L('열기', 'Open')}</span></button> <button type="button" class="small-button" data-action="archive-project" data-id="${esc(project.id)}" data-on="${project.archived ? '0' : '1'}">${icon(project.archived ? 'restore' : 'box')}<span>${project.archived ? L('보관 해제', 'Unarchive') : L('보관', 'Archive')}</span></button></td>
    </tr>`).join('');
  return `<div class="page">${pageHead(L('과제', 'Projects'), `<button type="button" class="button primary" data-action="new-project">${icon('plus')}${L('새 과제', 'New project')}</button>`, 'projects')}
    <table class="data"><tr><th>${L('키', 'Key')}</th><th>${L('이름', 'Name')}</th><th>${L('종류', 'Type')}</th><th>${L('책임자', 'Lead')}</th><th>${L('상태', 'State')}</th><th></th></tr>${rows || `<tr><td colspan="6">${L('과제가 없습니다.', 'There are no projects.')}</td></tr>`}</table>
  </div>`;
}

function people(ctx) {
  const rows = ctx.ws.users.map((user) => {
    const member = ctx.project.members.find((item) => item.userId === user.id);
    return `<tr><td>${avatar(user)} ${esc(user.name)}</td><td>${esc(user.email || '')}</td><td><select data-member="${esc(user.id)}">${options(ROLES, member?.role || '', L('역할 없음', 'No role'))}</select></td><td><input type="checkbox" data-user-active="${esc(user.id)}" ${user.active !== false ? 'checked' : ''}></td></tr>`;
  }).join('');
  const groups = ctx.ws.groups.map((group) => `<article class="panel-card"><header><b>${esc(nameOf(group))}</b></header><div class="checks">${ctx.ws.users.map((user) => `<label class="check"><input type="checkbox" data-group="${esc(group.id)}" data-user="${esc(user.id)}" ${(group.userIds || []).includes(user.id) ? 'checked' : ''}>${esc(user.name)}</label>`).join('')}</div></article>`).join('');
  return `<div class="page">${pageHead(L('사람', 'People'), `<button type="button" class="button" data-action="new-user">${icon('plus')}${L('사람', 'Person')}</button><button type="button" class="button" data-action="new-group">${icon('people')}${L('그룹', 'Group')}</button><button type="button" class="button" data-action="set-password">${icon('lock')}${L('암호', 'Password')}</button>`, 'people')}
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
  const items = inspect(ctx.project, ctx.now, calendarOf(ctx.ws)).map((item) => {
    const issue = findIssue(ctx.project, item.issueId);
    return `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId)}">${icon('alert')}${badge(item.severity === 'error' ? L('오류', 'Error') : L('주의', 'Warning'), item.severity === 'error' ? '#e5484d' : '#f5a524')}<span class="key">${esc(issue?.key || '')}</span><span>${esc(texts[item.code] || item.code)}</span><span>${esc(issue?.summary || '')}</span></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('점검', 'Health'), '', 'health')}${items || empty(L('문제가 없습니다.', 'Nothing needs attention.'))}</div>`;
}

function notifications(ctx) {
  const items = ctx.project.notifications.filter((item) => item.userId === ctx.user?.id).map((item) => `<button type="button" class="link-row${item.read ? '' : ' unread'}" data-action="mark-read" data-id="${esc(item.id)}" data-issue="${esc(item.issueId || '')}">${icon('bell')}<span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`).join('');
  return `<div class="page">${pageHead(L('알림', 'Notifications'), `<button type="button" class="button" data-action="mark-all-read">${icon('check')}<span>${L('모두 읽음', 'Mark all read')}</span></button>`, 'notifications')}${items || empty(L('알림이 없습니다.', 'There are no notifications.'))}</div>`;
}

function startSettings(ctx) {
  const settings = ctx.settings || {};
  const current = knownBackground(settings.background);
  const speed = Number.isFinite(Number(settings.backgroundSpeed)) ? Number(settings.backgroundSpeed) : 100;
  const interval = BACKGROUND_INTERVALS.includes(Number(settings.backgroundInterval)) ? Number(settings.backgroundInterval) : 0;
  const intervalLabel = (seconds) => (seconds ? L(`${seconds}초`, `${seconds}s`) : L('끄기', 'Off'));
  const flag = (key, glyph, ko, en) => `<label class="check">${icon(glyph)}<input type="checkbox" data-setting="${key}" ${settings[key] !== false ? 'checked' : ''}>${L(ko, en)}</label>`;
  return `<section><h2>${icon('home')}<span>${L('시작 화면', 'Start page')}</span></h2>
      ${flag('showStartPage', 'spark', '프로그램을 열면 시작 화면을 표시', 'Show the start page when the program opens')}
      ${flag('showWelcome', 'play', '시작할 때 이 창을 다시 보여주기', 'Show this window again at start')}
      ${flag('startShowBanner', 'info', '안내 표시', 'Show the introduction')}
      ${flag('startShowProjects', 'folder', '과제 표시', 'Show projects')}
      ${flag('startShowExamples', 'box', '예제 표시', 'Show examples')}
      ${flag('startShowBackground', 'spark', '배경 고르기 표시', 'Show the background picker')}
      <button type="button" class="button" data-action="start-screen">${icon('spark')}<span>${L('시작 화면 열기', 'Open the start page')}</span></button>
    </section>
    <section><h2>${icon('spark')}<span>${L('시작 화면 배경', 'Start page background')}</span></h2>
      <label class="form-row"><span>${L('배경', 'Background')}</span><select data-bg="kind">${BACKGROUNDS.map((item) => `<option value="${item.id}" ${item.id === current ? 'selected' : ''}>${esc(L(item.ko, item.en))}</option>`).join('')}</select></label>
      <button type="button" class="button" data-action="shuffle-background">${icon('spark')}<span>${L('다른 배경', 'Another background')}</span></button>
      <label class="form-row"><span>${L('속도', 'Speed')}</span><span class="start-speed"><input type="range" min="0" max="300" step="10" value="${speed}" data-bg="speed"><output>${speed}%</output></span></label>
      <label class="check">${icon('sun')}<input type="checkbox" data-bg="random" ${settings.backgroundRandom ? 'checked' : ''}>${L('시작할 때 무작위로', 'Random at start')}</label>
      <label class="form-row"><span>${L('자동으로 바꾸기', 'Change automatically')}</span><select data-bg="interval">${BACKGROUND_INTERVALS.map((seconds) => `<option value="${seconds}" ${interval === seconds ? 'selected' : ''}>${intervalLabel(seconds)}</option>`).join('')}</select></label>
    </section>`;
}

function settings(ctx) {
  const project = ctx.project;
  const database = databaseSettings(ctx);
  const start = startSettings(ctx);
  if (!project) return `<div class="page settings">${pageHead(L('설정', 'Settings'), '', 'settings')}${start}${database}</div>`;
  const colors = ctx.settings.customTheme ? CUSTOM_KEYS.map((key) => `<label class="form-row"><span>${esc(key)}</span><input type="color" data-custom-color="${esc(key)}" value="${esc(ctx.settings.customTheme[key] || '#888888')}"></label>`).join('') : '';
  const transitions = project.transitions.map((item) => `<li><span>${esc(nameOf(byId(project.statuses, item.from)))} → ${esc(nameOf(byId(project.statuses, item.to)))}</span> <b>${esc(nameOf(item))}</b> <button type="button" class="icon-button" data-action="delete-transition" data-id="${esc(item.id)}">${icon('trash')}</button></li>`).join('');
  const statuses = project.statuses.map((status) => `<li>${badge(nameOf(status), status.color)} <button type="button" class="icon-button" data-action="delete-status" data-id="${esc(status.id)}">${icon('trash')}</button></li>`).join('');
  const rules = project.rules.map((rule) => `<li>${esc(nameOf(rule))} <button type="button" class="icon-button" data-action="delete-rule" data-id="${esc(rule.id)}">${icon('trash')}</button></li>`).join('');
  const fields = project.fields.map((field) => `<li>${esc(nameOf(field))} <small>${esc(field.type)}</small> <button type="button" class="icon-button" data-action="delete-field" data-id="${esc(field.id)}">${icon('trash')}</button></li>`).join('');
  return `<div class="page settings">${pageHead(L('설정', 'Settings'), '', 'settings')}
    ${start}
    ${database}
    <section><h2>${L('프로젝트', 'Project')}</h2>
      <label class="form-row"><span>${L('이름', 'Name')}</span><input data-project="name" value="${esc(project.name)}"></label>
      <label class="form-row"><span>${L('설명', 'Description')}</span><textarea data-project="description" rows="3">${esc(project.description || '')}</textarea></label>
      <label class="form-row"><span>${L('책임자', 'Lead')}</span><select data-project="leadId">${userOptions(ctx.ws, project.leadId, '')}</select></label>
      <label class="check"><input type="checkbox" data-project="allowAnyTransition" ${project.allowAnyTransition !== false ? 'checked' : ''}> ${L('보드에서 어떤 상태로든 옮길 수 있음', 'Cards on the board may move to any status')}</label>
      <button type="button" class="button" data-action="${project.archived ? 'unarchive' : 'archive'}">${icon(project.archived ? 'restore' : 'box')}<span>${project.archived ? L('보관 해제', 'Unarchive') : L('프로젝트 보관', 'Archive project')}</span></button>
    </section>
    <section><h2>${L('작업 흐름', 'Workflow')}</h2><ul class="plain">${statuses}</ul><button type="button" class="small-button" data-action="new-status">${icon('workflow')}<span>${L('상태 추가', 'Add status')}</span></button><ul class="plain">${transitions}</ul><button type="button" class="small-button" data-action="new-transition">${icon('workflow')}<span>${L('전이 추가', 'Add transition')}</span></button></section>
    <section><h2>${L('필드', 'Fields')}</h2><ul class="plain">${fields}</ul><button type="button" class="small-button" data-action="new-field">${icon('tag')}<span>${L('필드 추가', 'Add field')}</span></button></section>
    <section><h2>${L('자동화', 'Automation')}</h2><ul class="plain">${rules}</ul><button type="button" class="small-button" data-action="new-rule">${icon('bolt')}<span>${L('규칙 추가', 'Add a rule')}</span></button></section>
    ${screenSection(project)}
    <section><h2>${L('모양', 'Appearance')}</h2>
      <label class="form-row"><span>${L('글자 크기', 'Text size')}</span><input data-font="size" type="number" min="12" max="20" value="${esc(ctx.settings.fontSize)}"></label>
      <button type="button" class="button" data-action="edit-custom-theme">${icon('settings')}<span>${L('사용자 정의 테마 설정', 'Custom theme settings')}</span></button>
      ${colors}
    </section>
  </div>`;
}

function help() {
  const open = (id, glyph, ko, en, tipKo, tipEn) => `<button type="button" class="button" data-action="open-guide" data-id="${id}">${icon(glyph)}<span>${L(ko, en)}</span></button><p class="muted">${L(tipKo, tipEn)}</p>`;
  return `<div class="page help-page">${pageHead(L('도움말', 'Help'), '', 'help')}
    <p>${L('사용 설명서, 튜토리얼 문서, 작업 질의는 각각 별도의 창에서 열립니다.', 'The user guide, the tutorial document and the query language each open in their own window.')}</p>
    <div class="doc-launch">
      ${open('guide', 'book', '사용 설명서', "User's Guide", '메뉴, 이슈, 계획, 문서를 설명합니다.', 'Menus, issues, planning and documents.')}
      ${open('tutorial', 'play', '튜토리얼 문서', 'Tutorial document', '각 단계를 그 화면과 함께 봅니다.', 'Every step with its screen.')}
      ${open('wql', 'filter', 'WQL 설명서', 'WQL guide', '필드, 연산, 함수, 정렬을 설명합니다.', 'Fields, operators, functions and order.')}
    </div>
  </div>`;
}

function issue(ctx) {
  const current = findIssue(ctx.project, ctx.ui.issueId);
  if (!current) return `<div class="page">${empty(L('이슈를 고르세요.', 'Choose an issue.'))}</div>`;
  const tabs = [['details', 'book', L('설명', 'Description')], ['comments', 'comment', L('의견', 'Comments')], ['work', 'clock', L('작업 기록', 'Work log')], ['history', 'list', L('기록', 'History')], ['links', 'link', L('연결', 'Links')]];
  const children = ctx.project.issues.filter((item) => item.parentId === current.id || (current.typeId === 'epic' && item.epicId === current.id && item.id !== current.id));
  return `<div class="page issue">
    <div class="issue-title">${typeBadge(ctx.project, current.typeId)}<span class="key">${esc(current.key)}</span></div>
    <input class="summary-input" data-field="summary" data-live value="${esc(current.summary)}">
    <div class="tabs">${tabs.map(([id, glyph, label]) => `<button type="button" class="tab${ctx.ui.issueTab === id ? ' active' : ''}" data-action="issue-tab" data-id="${id}">${icon(glyph)}<span>${label}</span></button>`).join('')}</div>
    ${issueTab(ctx, current)}
    ${approvalBlock(ctx, current)}
    ${children.length ? `<h3>${current.typeId === 'epic' ? L('안의 이슈', 'Issues inside') : L('하위 작업', 'Sub-tasks')}</h3>${issueLines(ctx, children)}` : ''}
    ${current.typeId !== 'subtask' && current.typeId !== 'epic' ? `<button type="button" class="small-button" data-action="create-subtask">${icon('subtask')}<span>${L('하위 작업', 'Sub-task')}</span></button>` : ''}
  </div>`;
}

function issueTab(ctx, issue) {
  if (ctx.ui.issueTab === 'comments') {
    const list = issue.comments.map((comment) => `<article class="comment"><header>${avatar(person(ctx.ws, comment.authorId))}<b>${esc(person(ctx.ws, comment.authorId)?.name || '')}</b><small>${esc(formatWhen(comment.created))}</small><button type="button" class="icon-button" data-action="delete-comment" data-id="${esc(comment.id)}">${icon('trash')}</button></header><div class="md">${renderMarkdown(comment.body)}</div></article>`).join('');
    return `${list}<textarea id="comment-body" rows="3" placeholder="${esc(L('의견을 적습니다. @이름으로 알립니다.', 'Write a comment. @name notifies that person.'))}"></textarea><button type="button" class="button" data-action="add-comment">${icon('comment')}<span>${L('등록', 'Add')}</span></button>`;
  }
  if (ctx.ui.issueTab === 'work') {
    const list = issue.worklogs.map((log) => `<div class="link-row"><span>${esc(dur(log.minutes))} · ${esc(person(ctx.ws, log.authorId)?.name || '')}</span><span>${esc(log.comment || '')}</span><button type="button" class="icon-button" data-action="delete-worklog" data-id="${esc(log.id)}">${icon('trash')}</button></div>`).join('');
    return `${list}<div class="inline"><input id="work-minutes" placeholder="1h 30m"><input id="work-note" placeholder="${esc(L('메모', 'Note'))}"><button type="button" class="button" data-action="add-worklog">${icon('clock')}<span>${L('기록', 'Log')}</span></button></div>`;
  }
  if (ctx.ui.issueTab === 'history') {
    return issue.history.slice().reverse().map((entry) => `<div class="link-row"><span>${esc(historyText(ctx, entry))}</span><small>${esc(formatWhen(entry.at))}</small></div>`).join('') || empty(L('기록이 없습니다.', 'There is no history.'));
  }
  if (ctx.ui.issueTab === 'links') {
    const list = (issue.links || []).map((link) => {
      const type = LINK_TYPES.find((item) => item.id === link.type);
      const other = findIssue(ctx.project, link.otherId);
      const label = link.direction === 'out' ? nameOf(type) : (ctx.settings.language === 'en' ? type?.inverseEn : type?.inverseKo);
      return `<div class="link-row"><span>${esc(label || link.type)}</span><button type="button" class="key" data-action="open-issue" data-id="${esc(other?.id || '')}">${icon('link')}${esc(other?.key || '')}</button><span>${esc(other?.summary || '')}</span><button type="button" class="icon-button" data-action="remove-link" data-id="${esc(link.id)}">${icon('trash')}</button></div>`;
    }).join('');
    return `${list}<div class="inline"><select id="link-type">${options(LINK_TYPES, 'relates')}</select><input id="link-key" placeholder="SHOP-1"><button type="button" class="button" data-action="add-link">${icon('link')}<span>${L('연결', 'Link')}</span></button></div>`;
  }
  return `<div class="desc-tools"><button type="button" class="small-button" data-action="toggle-preview">${icon(ctx.ui.preview ? 'pencil' : 'eye')}<span>${ctx.ui.preview ? L('편집', 'Edit') : L('미리 보기', 'Preview')}</span></button></div>
    ${ctx.ui.preview ? `<article class="md">${renderMarkdown(issue.description || '')}</article>` : `<textarea data-field="description" data-live rows="12">${esc(issue.description || '')}</textarea>`}`;
}

export function renderRight(ctx) {
  if (!showRight(ctx)) return '';
  let glyph = 'issues';
  let title = L('이슈', 'Issue');
  let inner = preview(ctx);
  if (ctx.ui.view === 'backlog') {
    glyph = 'epic';
    title = L('에픽', 'Epics');
    const epics = ctx.project.issues.filter((issue) => issue.typeId === 'epic');
    inner = `<button type="button" class="nav-button${ctx.ui.epicId ? '' : ' active'}" data-action="epic-filter" data-id="">${icon('epic')}<span>${L('모든 에픽', 'All epics')}</span></button>${epics.map((epic) => `<button type="button" class="nav-button${ctx.ui.epicId === epic.id ? ' active' : ''}" data-action="epic-filter" data-id="${esc(epic.id)}">${icon('epic')}<span>${esc(epic.summary)}</span></button>`).join('')}${preview(ctx)}`;
  } else if (ctx.ui.view === 'issue') {
    glyph = 'list';
    title = L('세부 사항', 'Details');
    inner = fields(ctx);
  }
  return panelFrame(ctx.settings.showRightPanel !== false, 'right', glyph, title, `<div class="side">${inner}</div>`);
}

function preview(ctx) {
  const issue = findIssue(ctx.project, ctx.ui.issueId);
  if (!issue) return empty(L('이슈를 고르면 여기에 나옵니다.', 'Choose an issue to see it here.'));
  const moves = movesFrom(ctx.project, issue.statusId).map((move) => `<button type="button" class="small-button" data-action="transition" data-to="${esc(move.to)}">${icon('workflow')}<span>${esc(nameOf(move))}</span></button>`).join('');
  return `<div class="preview">${typeBadge(ctx.project, issue.typeId)}<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button><p>${esc(issue.summary)}</p><div class="wrap">${moves}</div></div>`;
}

function fields(ctx) {
  const issue = findIssue(ctx.project, ctx.ui.issueId);
  if (!issue) return empty(L('이슈를 고르세요.', 'Choose an issue.'));
  const project = ctx.project;
  const sla = slaState(project, issue, ctx.now);
  const moves = movesFrom(project, issue.statusId).map((move) => `<button type="button" class="small-button" data-action="transition" data-to="${esc(move.to)}">${icon('workflow')}<span>${esc(nameOf(move))}</span></button>`).join('');
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
    <button type="button" class="small-button" data-action="toggle-watch">${icon('eye')}<span>${watching ? L('관찰 그만', 'Stop watching') : L('관찰', 'Watch')}</span></button>
    <h3>${L('첨부', 'Attachments')}</h3>
    ${(issue.attachments || []).map((file) => `<div class="link-row"><a href="${esc(file.data)}" download="${esc(file.name)}">${esc(file.name)}</a><button type="button" class="icon-button" data-action="remove-attachment" data-id="${esc(file.id)}">${icon('trash')}</button></div>`).join('')}
    <button type="button" class="small-button" data-action="pick-attachment">${icon('paperclip')}<span>${L('파일 추가', 'Add a file')}</span></button>
    <div class="page-actions"><button type="button" class="button" data-action="clone-issue">${icon('copy')}<span>${L('복제', 'Clone')}</span></button><button type="button" class="button danger" data-action="delete-issue">${icon('trash')}<span>${L('삭제', 'Delete')}</span></button></div>
  </div>`;
}

function prop(label, control) {
  return `<label class="prop"><span>${label}</span>${control}</label>`;
}

function feed(ctx, count) {
  return (ctx.project?.activity || []).slice(0, count).map((item) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId || '')}">${icon('clock')}<span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`).join('') || empty(L('활동이 없습니다.', 'There is no activity.'));
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
  if (item.kind === 'page') return L(`${who} 님이 「${key}」 페이지를 고쳤습니다`, `${who} updated the page ${key}`);
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
