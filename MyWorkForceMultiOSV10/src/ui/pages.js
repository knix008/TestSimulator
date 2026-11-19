import { GADGETS, LINK_TYPES, ROLES } from '../domain/catalog.js';
import { getLanguage } from '../i18n.js';
import { renderMarkdown } from '../domain/markdown.js';
import { runQuery } from '../domain/query.js';
import { burndown, createdResolved, cumulativeFlow, GROUP_FIELDS, groupIssues, inspect, pie, slaState, sprintReport, timeReport, velocity } from '../domain/reports.js';
import { cardGrid } from './cardgrid.js';
import { calendarOf, controlChart, epicBurndown, groupLanes } from '../domain/services.js';
import { visibleDocuments } from '../domain/documents.js';
import { noticeChecked } from '../domain/notices.js';
import { allowed, isWorkspaceAdmin, orderedProjects, projectAncestors } from '../domain/permissions.js';
import { visiblePage } from '../domain/wiki.js';
import { activeSprint, canDeleteProject, findIssue, movesFrom } from '../domain/store.js';
import { projectMethods, teamOfProject } from '../domain/teams.js';
import { methodChecks, teamsView, teamView } from './teams.js';
import { dateInputValue, formatDuration } from '../domain/util.js';
import { CUSTOM_KEYS } from '../themes.js';
import { formatCountdown, formatLockMinutes, LOCK_ATTEMPTS, LOCK_CHOICES, LOCK_MIN_MINUTES, lockPolicy } from '../domain/signin-lock.js';
import { avatar, backButton, badge, byId, empty, esc, itemActions, foldBox, formatWhen, icon, L, nameOf, options, pageHead, panelFrame, person, safeColor, typeBadge, userOptions } from './bits.js';
import { navLabel } from './chrome.js';
import { BACKGROUND_INTERVALS, BACKGROUNDS, knownBackground } from './background.js';
import { databaseSettings, startupOptions } from './start.js';
import { approvalBlock, calendarView, documentsView, extensionsView, knowledgeView, openPageOf, openSpaceOf, pageInfoPanel, spaceInfoPanel, laneLabel, mailSettings, plansView, portalView, screenSection, swimlaneOptions } from './extra.js';
import { searchView } from './search.js';
import { auditDetail, auditView } from './audit.js';
import { documentPreview } from './extra.js';
import { timelineView } from './timeline.js';
import { executionsView, qualityBlock, requirementsView, testsView, traceView } from './quality.js';
import { scheduleView } from './schedule.js';
import { plannerView } from './planner.js';
import { blockersOf } from '../domain/dependencies.js';
import { finderBar, issueFacets, issueVisible, keepBlock, matchesText, screenFind } from './finder.js';

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
  return `<div class="page">${pageHead(title, '', ctx.ui.view)}<p>${L('과제 홈에서 과제를 만드세요.', 'Create a project from Project home.')}</p><button type="button" class="button primary" data-action="go" data-view="home">${icon('home')}<span>${esc(navLabel('home'))}</span></button></div>`;
}

export function showRight(ctx) {
  if (ctx.ui.view === 'knowledge') return Boolean(openPageOf(ctx) || openSpaceOf(ctx));
  // Lists: the chosen item shows on the right.
  if (ctx.ui.view === 'documents') return !ctx.ui.docId && (ctx.ui.docTab || 'forms') !== 'forms';
  if (ctx.ui.view === 'audit') return true;
  return Boolean(ctx.project) && ['board', 'backlog', 'issues', 'issue', 'roadmap', 'queues', 'health', 'filters', 'notifications', 'requirements', 'trace', 'tests', 'executions'].includes(ctx.ui.view);
}

export function renderView(ctx) {
  if (ctx.ui.view === 'home') return home(ctx);
  if (ctx.ui.view === 'help') return help(ctx);
  if (ctx.ui.view === 'search') return searchView(ctx);
  if (ctx.ui.view === 'notifications' && !ctx.project) return notifications(ctx);
  if (ctx.ui.view === 'knowledge') return knowledgeView(ctx);
  if (ctx.ui.view === 'documents') return documentsView(ctx);
  if (ctx.ui.view === 'calendar') return calendarView(ctx);
  if (ctx.ui.view === 'portal') return portalView(ctx);
  if (ctx.ui.view === 'plans') return plansView(ctx);
  if (ctx.ui.view === 'extensions') return extensionsView(ctx);
  if (ctx.ui.view === 'settings') return settings(ctx);
  if (ctx.ui.view === 'project-settings') return projectSettings(ctx);
  if (ctx.ui.view === 'users') return usersAdmin(ctx);
  if (ctx.ui.view === 'audit') return auditView(ctx);
  if (ctx.ui.view === 'projects') return projectsAdmin(ctx);
  if (ctx.ui.view === 'teams') return teamsView(ctx);
  if (ctx.ui.view === 'team') return teamView(ctx);
  // The planner works with or without an open project (then: the person's own work everywhere).
  if (ctx.ui.view === 'planner') return plannerView(ctx);
  const missing = need(ctx, navLabel(ctx.ui.view));
  if (missing) return missing;
  const views = { board, backlog, roadmap, timeline: timelineView, issues, queues, dashboard, reports, releases, components, filters, people, health, notifications, settings, issue, requirements: requirementsView, trace: traceView, tests: testsView, executions: executionsView, schedule: scheduleView };
  return (views[ctx.ui.view] || home)(ctx);
}

function home(ctx) {
  if (!ctx.ws.projects.length) {
    const action = (name, glyph, ko, en, extra = '', primary = false) => `<button type="button" class="button${primary ? ' primary' : ''}" data-action="${name}" ${extra}>${icon(glyph)}<span>${L(ko, en)}</span></button>`;
    return `<div class="page home empty-home"><div class="center-empty">${icon('home')}
      <p>${L('과제를 생성하거나 여세요.', 'Create or open a project.')}</p>
      <div class="page-actions">
        ${action('new-project', 'plus', '새 과제', 'New project', '', true)}
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
  const find = screenFind(ctx);
  const cards = orderedProjects(ctx.ws).filter((project) => {
    if (!matchesText(find.q, project.key, project.name, project.description)) return false;
    if (find.kind && project.type !== find.kind) return false;
    if (find.state === 'archived') return Boolean(project.archived);
    if (find.state === 'active') return !project.archived;
    return true;
  }).map((project) => {
    const parent = projectAncestors(ctx.ws, project)[0];
    const kind = nameOf(project.type === 'service' ? { ko: '서비스', en: 'Service' } : project.type === 'business' ? { ko: '업무', en: 'Business' } : { ko: '소프트웨어', en: 'Software' });
    return `<button type="button" class="project-card${project.id === ctx.ws.activeProjectId ? ' active' : ''}" data-action="activate" data-id="${esc(project.id)}"><b>${icon('folder')}${esc(project.key)}</b><span>${esc(project.name)}</span><small>${parent ? `${esc(parent.key)} · ` : ''}${project.issues.length} · ${esc(kind)}</small></button>`;
  }).join('');
  return `<div class="page home">
    ${pageHead(L('과제 홈', 'Project home'), `<button type="button" class="button primary" data-action="new-project">${icon('plus')}<span>${L('새 과제', 'New project')}</span></button>`, 'home')}
    <div class="page-lead"><p>${L('이슈, 보드, 스프린트, 로드맵, 대시보드, 보고서를 한 작업 공간에서 다룹니다.', 'Issues, boards, sprints, the roadmap, dashboards and reports in one workspace.')}</p></div>
    <div class="page-actions page-actions-left">
      <button type="button" class="button" data-action="open-file">${icon('folder')}${L('열기', 'Open')}</button>
      <button type="button" class="button" data-action="browse-examples">${icon('box')}${L('예제 고르기', 'Choose an example')}</button>
      <button type="button" class="button" data-action="start-tutorial">${icon('play')}${L('튜토리얼', 'Tutorial')}</button>
      <button type="button" class="button" data-action="empty-workspace">${icon('close')}${L('빈 작업 공간', 'Empty workspace')}</button>
    </div>
    <h2>${icon('folder')}<span>${L('과제', 'Projects')}</span></h2>
    ${finderBar(ctx, [
      { id: 'kind', label: L('종류', 'Kind'), options: [{ id: 'software', label: L('소프트웨어', 'Software') }, { id: 'business', label: L('업무', 'Business') }, { id: 'service', label: L('서비스', 'Service') }] },
      { id: 'state', label: L('상태', 'State'), options: [{ id: 'active', label: L('사용', 'Active') }, { id: 'archived', label: L('보관', 'Archived') }] },
    ])}
    <div class="card-grid">${cards || empty(L('아직 없습니다.', 'Nothing here yet.'))}</div>
    ${ctx.project ? `<h2>${icon('bolt')}<span>${L('최근 활동', 'Recent activity')}</span></h2><div class="feed panel-card">${feed(ctx, 8)}</div>` : ''}
  </div>`;
}

function board(ctx) {
  const project = ctx.project;
  const current = project.boards.find((item) => item.id === ctx.ui.boardId) || project.boards[0];
  const sprint = current?.type === 'scrum' ? activeSprint(project, current.id) : null;
  const future = current?.type === 'scrum' ? project.sprints.find((item) => item.state === 'future' && item.boardId === current.id) : null;
  let issues = project.issues.filter((issue) => issue.typeId !== 'epic' && issue.typeId !== 'subtask');
  if (current?.type === 'scrum') issues = sprint ? issues.filter((issue) => issue.sprintId === sprint.id) : [];
  issues = issues.filter((issue) => issueVisible(ctx, issue));
  const findBar = finderBar(ctx, issueFacets(ctx));
  const head = `<div class="page-head">
      <h1>${icon('board')}${esc(nameOf(current))}</h1>
      <div class="page-actions">
        <select data-choose="board">${options(project.boards, current?.id)}</select>
        ${sprint ? `<span class="muted">${esc(sprint.name)} · ${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))}</span><button type="button" class="button" data-action="complete-sprint" data-id="${esc(sprint.id)}">${icon('check')}<span>${L('스프린트 완료', 'Complete sprint')}</span></button>` : ''}
        ${!sprint && future ? `<button type="button" class="button primary" data-action="start-sprint" data-id="${esc(future.id)}">${icon('play')}<span>${L('스프린트 시작', 'Start sprint')}</span></button>` : ''}
        ${current?.type === 'scrum' ? `<button type="button" class="button" data-action="new-sprint">${icon('play')}<span>${L('스프린트', 'Sprint')}</span></button>` : ''}
        ${swimlaneOptions(ctx.ui.swimlane)}
        <button type="button" class="button" data-action="export-view">${icon('download')}<span>${L('내보내기', 'Export')}</span></button>
      </div>
    </div>`;
  if (current?.type === 'scrum' && !sprint) {
    return `<div class="fill">${head}${findBar}<div class="page">${empty(L('진행 중인 스프린트가 없습니다. 계획된 스프린트를 시작하세요.', 'There is no active sprint. Start a planned one.'))}</div></div>`;
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
  if ((ctx.ui.swimlane || 'none') === 'none') return `<div class="fill">${head}${findBar}<div class="board">${columnBoard(issues)}</div></div>`;
  const lanes = groupLanes(issues, ctx.ui.swimlane).map((lane) => `<section class="lane"><header>${esc(laneLabel(ctx, ctx.ui.swimlane, lane.id))}</header><div class="board">${columnBoard(lane.issues)}</div></section>`).join('');
  return `<div class="fill">${head}${findBar}<div class="lanes">${lanes}</div></div>`;
}

function card(ctx, issue) {
  const priority = byId(ctx.project.priorities, issue.priorityId);
  const points = issue.storyPoints != null ? `<span class="pts">${esc(issue.storyPoints)}</span>` : '';
  return `<article class="card${issue.id === ctx.ui.issueId ? ' selected' : ''}" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    <div class="card-top">${typeBadge(ctx.project, issue.typeId)}<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button></div>
    <p>${esc(issue.summary)}</p>
    <div class="card-foot">${blockersOf(ctx.project, issue).open.length ? `<span class="card-blocked" title="${esc(L('먼저 끝나야 할 이슈가 남았습니다', 'Waiting for another issue'))}">${icon('lock')}</span>` : ''}<span class="pri" style="color:${safeColor(priority?.color)}">${esc(nameOf(priority))}</span>${points}${avatar(person(ctx.ws, issue.assigneeId))}</div>
  </article>`;
}

function backlog(ctx) {
  const project = ctx.project;
  let issues = project.issues.filter((issue) => issue.typeId !== 'epic' && !issue.parentId && issueVisible(ctx, issue));
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
  return `<div class="page">${pageHead(L('백로그', 'Backlog'), `<button type="button" class="button" data-action="export-view">${icon('download')}<span>${L('내보내기', 'Export')}</span></button><button type="button" class="button" data-action="new-sprint">${icon('plus')}${L('스프린트', 'Sprint')}</button>`, 'backlog')}${finderBar(ctx, issueFacets(ctx))}${body}
    ${closed.length ? `<p class="muted">${L('완료한 스프린트', 'Completed sprints')}: ${closed.map((sprint) => esc(sprint.name)).join(', ')}</p>` : ''}</div>`;
}

function row(ctx, issue) {
  const epic = findIssue(ctx.project, issue.epicId);
  return `<div class="issue-row${issue.id === ctx.ui.issueId ? ' selected' : ''}" data-card="${esc(issue.id)}" data-action="select-issue" data-id="${esc(issue.id)}">
    ${typeBadge(ctx.project, issue.typeId)}
    <button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}${esc(issue.key)}</button>
    <span class="summary">${esc(issue.summary)}</span>
    ${epic ? badge(epic.key, '#7c3aed') : ''}
    <span class="pts">${issue.storyPoints ?? ''}</span>
    ${avatar(person(ctx.ws, issue.assigneeId))}
  </div>`;
}

function roadmap(ctx) {
  const epics = ctx.project.issues.filter((issue) => issue.typeId === 'epic' && issueVisible(ctx, issue));
  const bars = epics.map((epic) => {
    const children = ctx.project.issues.filter((issue) => issue.epicId === epic.id && issue.typeId !== 'subtask');
    const done = children.filter((issue) => byId(ctx.project.statuses, issue.statusId)?.category === 'done').length;
    const pct = children.length ? Math.round((done / children.length) * 100) : 0;
    return `<button type="button" class="epic-row" data-action="open-issue" data-id="${esc(epic.id)}"><span class="key">${icon('epic')}${esc(epic.key)}</span><b>${esc(epic.summary)}</b><span class="bar"><i style="width:${pct}%"></i></span><small>${done}/${children.length}</small></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('로드맵', 'Roadmap'), '', 'roadmap')}${finderBar(ctx, issueFacets(ctx, ['status', 'assignee']))}${bars || empty(L('에픽이 없습니다.', 'There are no epics.'))}</div>`;
}

function issues(ctx) {
  const result = queried(ctx, true);
  result.issues = result.issues.filter((issue) => issueVisible(ctx, issue));
  const project = ctx.project;
  const selected = new Set(ctx.ui.selected || []);
  const head = `<tr><th></th>${['key', 'type', 'summary', 'status', 'priority', 'assignee', 'sprint', 'points'].map((field) => {
    const labels = { key: L('키', 'Key'), type: L('유형', 'Type'), summary: L('요약', 'Summary'), status: L('상태', 'Status'), priority: L('우선순위', 'Priority'), assignee: L('담당', 'Assignee'), sprint: L('스프린트', 'Sprint'), points: L('포인트', 'Points') };
    const mark = ctx.ui.sort?.field === field ? (ctx.ui.sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" data-action="sort" data-field="${field}">${icon('columns')}<span>${labels[field]}${mark}</span></button></th>`;
  }).join('')}</tr>`;
  const rowHtml = (issue) => {
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
  };
  // Grouped: a heading row per group with its count and points (an issue with two labels is in both).
  const groupField = GROUP_FIELDS.includes(ctx.ui.issueGroup) ? ctx.ui.issueGroup : '';
  const shown = result.issues.slice(0, 400);
  const body = groupField
    ? groupIssues(project, shown, groupField).map((group) => `<tr class="group-row"><td colspan="9">${icon('layers')}<b>${esc(groupLabel(ctx, groupField, group.id))}</b><span class="muted">${group.issues.length}${L('개', '')} · ${group.issues.reduce((sum, issue) => sum + (Number(issue.storyPoints) || 0), 0)}pt</span></td></tr>${group.issues.map(rowHtml).join('')}`).join('')
    : shown.map(rowHtml).join('');
  const bulk = selected.size ? `<div class="bulk"><b>${selected.size}</b>
      <select data-bulk="status">${options(project.statuses, '', L('상태 변경', 'Change status'))}</select>
      <select data-bulk="assignee">${userOptions(ctx.ws, '', L('담당 변경', 'Assign'))}</select>
      <button type="button" class="small-button" data-action="clear-selection">${icon('close')}<span>${L('선택 해제', 'Clear')}</span></button>
    </div>` : '';
  const note = result.issues.length > 400 ? `<p class="muted">${L('400개까지 표시합니다.', 'Showing the first 400.')}</p>` : '';
  return `<div class="page">${pageHead(L('이슈', 'Issues'), `<button type="button" class="button" data-action="export-view">${icon('download')}<span>${L('내보내기', 'Export')}</span></button><button type="button" class="button" data-action="import-csv">${icon('download')}${L('CSV 가져오기', 'Import CSV')}</button><button type="button" class="button primary" data-action="new-issue">${icon('plus')}${L('이슈', 'Issue')}</button>`, 'issues')}
    ${finderBar(ctx, issueFacets(ctx))}
    <div class="query-line"><label class="quick-search">${icon('filter')}<input id="issue-query" value="${esc(ctx.ui.query || '')}" placeholder="${esc(L('WQL. 예: type = bug AND status != done', 'WQL. Example: type = bug AND status != done'))}"></label><button type="button" class="button" data-action="open-guide" data-id="wql">${icon('book')}<span>${L('WQL 설명서', 'WQL guide')}</span></button>${groupSelect('data-issue-group', ctx.ui.issueGroup || 'none')}</div>
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
  const issues = current ? runQuery(ctx.ws, project, current.query, { user: ctx.user, now: ctx.now }).issues.filter((issue) => issueVisible(ctx, issue)) : [];
  return `<div class="page">${pageHead(L('대기열', 'Queues'), '', 'queues')}${finderBar(ctx, issueFacets(ctx))}<div class="split-page"><div class="queue-list">${list || empty(L('대기열이 없습니다.', 'There are no queues.'))}</div><div>${issueLines(ctx, issues)}</div></div></div>`;
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
  const find = screenFind(ctx);
  // Gadgets are cards: move, resize and enlarge them; × removes the gadget (cardgrid.js).
  const gadgetGlyph = { mine: 'user', sprint: 'play', statusPie: 'workflow', priorityPie: 'flag', activity: 'bolt', created: 'plus' };
  const gadgets = (project.dashboard || []).filter((gadget) => !find.gadget || gadget.type === find.gadget);
  const cards = gadgets.length ? cardGrid(ctx, `dashboard:${project.id}`, gadgets.map((gadget) => ({ id: gadget.id, glyph: gadgetGlyph[gadget.type], title: nameOf(GADGETS.find((item) => item.id === gadget.type)), w: ['statusPie', 'priorityPie'].includes(gadget.type) ? 4 : 6, h: 9, closeAction: 'remove-gadget', body: gadgetBody(ctx, gadget.type) }))) : '';
  return `<div class="page">${pageHead(L('대시보드', 'Dashboard'), `<select data-choose="gadget">${options(GADGETS, '', L('가젯 추가', 'Add a gadget'))}</select>`, 'dashboard')}${finderBar(ctx, [{ id: 'gadget', label: L('가젯', 'Gadget'), options: GADGETS.map((item) => ({ id: item.id, label: nameOf(item) })) }])}${cards || empty(L('가젯이 없습니다.', 'There are no gadgets.'))}</div>`;
}

function gadgetBody(ctx, type) {
  const project = ctx.project;
  if (type === 'mine') return issueLines(ctx, runQuery(ctx.ws, project, 'assignee = currentUser() AND status != done', { user: ctx.user, now: ctx.now }).issues.filter((issue) => issueVisible(ctx, issue)).slice(0, 8));
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

/** Report tabs in groups: sprints, flow, distribution and time, epics. */
const REPORT_GROUPS = [
  ['sprint', ['스프린트', 'Sprints'], [['burndown', 'chart', ['번다운', 'Burndown']], ['velocity', 'bolt', ['속도', 'Velocity']], ['sprint', 'play', ['스프린트 보고서', 'Sprint report']]]],
  ['flow', ['흐름', 'Flow'], [['flow', 'workflow', ['누적 흐름', 'Cumulative flow']], ['created', 'plus', ['생성과 해결', 'Created and resolved']], ['control', 'columns', ['제어 차트', 'Control chart']]]],
  ['spread', ['분포와 시간', 'Distribution and time'], [['pie', 'chart', ['분포', 'Distribution']], ['time', 'clock', ['시간', 'Time tracking']]]],
  ['epic', ['에픽', 'Epics'], [['epic', 'epic', ['에픽 번다운', 'Epic burndown']]]],
];

/** Fields the group-by choice offers, with their names. */
const GROUP_LABEL = {
  none: ['묶지 않음', 'No grouping'], status: ['상태', 'Status'], priority: ['우선순위', 'Priority'], type: ['유형', 'Type'], assignee: ['담당', 'Assignee'], reporter: ['보고자', 'Reporter'],
  epic: ['에픽', 'Epic'], sprint: ['스프린트', 'Sprint'], component: ['구성 요소', 'Component'], version: ['수정 버전', 'Fix version'], label: ['라벨', 'Label'], resolution: ['해결', 'Resolution'],
};

function groupSelect(attr, value, withNone = true) {
  const ids = [...(withNone ? ['none'] : []), ...GROUP_FIELDS];
  return `<label class="group-by" title="${esc(L('항목을 분류해서 묶습니다.', 'Group the items by a field.'))}">${icon('layers')}<span>${L('묶기', 'Group by')}</span><select ${attr}>${ids.map((id) => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(L(...GROUP_LABEL[id]))}</option>`).join('')}</select></label>`;
}

/** The name of one group value of a field. */
export function groupLabel(ctx, field, id) {
  const project = ctx.project;
  if (id === 'none' || id === 'unassigned') return field === 'assignee' || field === 'reporter' ? L('담당 없음', 'Unassigned') : L('없음', 'None');
  if (field === 'status') return nameOf(byId(project.statuses, id)) || id;
  if (field === 'priority') return nameOf(byId(project.priorities, id)) || id;
  if (field === 'type') return nameOf(byId(project.issueTypes, id)) || id;
  if (field === 'assignee' || field === 'reporter') return person(ctx.ws, id)?.name || id;
  if (field === 'epic') { const epic = findIssue(project, id); return epic ? `${epic.key} ${epic.summary}` : id; }
  if (field === 'sprint') return byId(project.sprints, id)?.name || id;
  if (field === 'component') return byId(project.components, id)?.name || id;
  if (field === 'version') return byId(project.versions, id)?.name || id;
  if (field === 'resolution') return nameOf(byId(project.resolutions, id)) || id;
  return id;
}

function groupColor(ctx, field, id, index) {
  const project = ctx.project;
  const colors = ['#3a6cf0', '#30a46c', '#f5a524', '#e5484d', '#7c3aed', '#0ea5e9', '#64748b', '#db2777', '#0d9488', '#ea580c', '#4f46e5', '#84cc16'];
  if (id === 'none' || id === 'unassigned') return '#94a3b8';
  const own = field === 'status' ? byId(project.statuses, id)?.color : field === 'priority' ? byId(project.priorities, id)?.color : field === 'type' ? byId(project.issueTypes, id)?.color : '';
  return safeColor(own || colors[index % colors.length]);
}

function reports(ctx) {
  const current = ctx.ui.report || 'burndown';
  const nav = `<div class="tabs tab-groups">${REPORT_GROUPS.map(([gid, name, items]) => `<span class="tab-group" data-group="${gid}"><small>${esc(L(...name))}</small><span class="tab-group-items">${items.map(([id, glyph, label]) => `<button type="button" class="tab${current === id ? ' active' : ''}" data-action="report" data-id="${id}">${icon(glyph)}<span>${esc(L(...label))}</span></button>`).join('')}</span></span>`).join('')}</div>`;
  // Reports that list issues can group them.
  const grouping = ['sprint', 'time', 'control'].includes(current) ? groupSelect('data-report-group', ctx.ui.reportGroup || (current === 'time' ? 'assignee' : 'none'), current !== 'time') : '';
  const body = current === 'pie' ? reportBody(ctx) : `<div class="report panel-card">${reportBody(ctx)}</div>`;
  return `<div class="page">${pageHead(L('보고서', 'Reports'), grouping, 'reports')}${finderBar(ctx, issueFacets(ctx))}${nav}${body}</div>`;
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
  if (ctx.ui.report === 'pie') {
    // One card per field: move, resize, enlarge or hide each (cardgrid.js); every chart fits its card.
    const fields = [['status', 'workflow', 4], ['priority', 'flag', 4], ['type', 'layers', 4], ['assignee', 'user', 6], ['epic', 'epic', 6], ['sprint', 'backlog', 4], ['component', 'component', 4], ['label', 'tag', 4]];
    return cardGrid(ctx, `report-pie:${project.id}`, fields.map(([field, glyph, w]) => ({ id: field, glyph, title: L(...GROUP_LABEL[field]), w, h: 9, body: pieBlock(ctx, field) })));
  }
  if (ctx.ui.report === 'time') {
    const field = GROUP_FIELDS.includes(ctx.ui.reportGroup) ? ctx.ui.reportGroup : 'assignee';
    const rows = timeReport(project, project.issues.filter((issue) => issueVisible(ctx, issue)), field);
    return `<table class="data"><tr><th>${esc(L(...GROUP_LABEL[field]))}</th><th>${L('이슈', 'Issues')}</th><th>${L('추정', 'Estimate')}</th><th>${L('남음', 'Remaining')}</th><th>${L('기록', 'Logged')}</th></tr>
      ${rows.map((row) => `<tr><td>${esc(groupLabel(ctx, field, row.id))}</td><td>${row.count}</td><td>${esc(dur(row.original))}</td><td>${esc(dur(row.remaining))}</td><td>${esc(dur(row.spent))}</td></tr>`).join('')}</table>`;
  }
  if (ctx.ui.report === 'sprint') {
    const sprint = project.sprints.find((item) => item.state === 'active') || project.sprints.filter((item) => item.state === 'closed').at(-1);
    const report = sprintReport(project, sprint);
    if (!report) return empty(L('스프린트가 없습니다.', 'There is no sprint.'));
    const list = (ids) => ids.map((id) => findIssue(project, id)).filter((issue) => issue && issueVisible(ctx, issue)).map((issue) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(issue.id)}">${icon('issues')}<span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span></button>`).join('') || empty(L('없음', 'None'));
    const field = GROUP_FIELDS.includes(ctx.ui.reportGroup) ? ctx.ui.reportGroup : 'none';
    const grouped = (ids) => {
      if (field === 'none') return list(ids);
      const issues = ids.map((id) => findIssue(project, id)).filter(Boolean);
      return groupIssues(project, issues, field).map((group) => `<div class="group-block"><h4 class="group-head">${esc(groupLabel(ctx, field, group.id))}<small class="nav-count">${group.issues.length}</small></h4>${list(group.issues.map((issue) => issue.id))}</div>`).join('');
    };
    return `<h2>${esc(sprint.name)}</h2><p>${report.pointsDone} / ${report.pointsTotal}</p><h3>${L('완료', 'Completed')}</h3>${grouped(report.completed)}<h3>${L('남음', 'Remaining')}</h3>${grouped(report.incomplete)}`;
  }
  if (ctx.ui.report === 'control') {
    const data = controlChart(project, ctx.now);
    const points = data.points.filter((point) => issueVisible(ctx, findIssue(project, point.id)));
    if (!points.length) return empty(L('완료까지 상태가 바뀐 이슈가 없습니다.', 'No issue has moved through to done.'));
    const field = GROUP_FIELDS.includes(ctx.ui.reportGroup) ? ctx.ui.reportGroup : 'none';
    if (field !== 'none') {
      // Average cycle time per group.
      const groups = groupIssues(project, points.map((point) => findIssue(project, point.id)).filter(Boolean), field).map((group) => {
        const days = group.issues.map((issue) => points.find((point) => point.id === issue.id)?.days || 0);
        return { label: groupLabel(ctx, field, group.id), a: days.reduce((sum, v) => sum + v, 0) / Math.max(1, days.length), b: data.average };
      });
      return `<p>${L('평균', 'Average')} ${data.average.toFixed(1)} ${L('일', 'days')} · ${esc(L(...GROUP_LABEL[field]))}${L('별 평균', ' averages')}</p>${bars(groups, ['#3a6cf0', '#94a3b8'])}`;
    }
    return `<p>${L('평균', 'Average')} ${data.average.toFixed(1)} ${L('일', 'days')}</p>${bars(points.slice(0, 16).map((point) => ({ label: point.key, a: point.days, b: data.average })), ['#3a6cf0', '#94a3b8'])}`;
  }
  if (ctx.ui.report === 'epic') {
    const epics = project.issues.filter((issue) => issue.typeId === 'epic');
    const epic = epics.find((issue) => issue.id === ctx.ui.epicId) || epics[0];
    const data = epicBurndown(project, epic, ctx.now);
    if (!data) return empty(L('에픽이 없습니다.', 'There is no epic.'));
    const unitText = data.pointed ? L('남은 포인트', 'Points remaining') : L('남은 이슈 수', 'Issues remaining');
    return `<p>${esc(epic.key)} ${esc(epic.summary)} · ${L('합계', 'Total')} ${Math.round(data.total)}</p>${lineChart(data.days.map((day) => ({ t: day.t, ideal: day.total, remaining: day.remaining })), { unit: unitText, idealLabel: L('전체 범위', 'Total scope'), actualLabel: L('남은 작업', 'Remaining work'), now: ctx.now })}`;
  }
  const sprint = project.sprints.find((item) => item.state === 'active');
  const data = burndown(project, sprint, ctx.now);
  if (!data) return empty(L('진행 중인 스프린트의 시작과 끝이 필요합니다.', 'The active sprint needs a start and an end.'));
  const unitText = data.pointed ? L('남은 스토리 포인트', 'Story points remaining') : L('남은 이슈 수', 'Issues remaining');
  return `<p>${esc(sprint.name)} · ${esc(formatWhen(sprint.start))} – ${esc(formatWhen(sprint.end))} · ${L('합계', 'Total')} ${Math.round(data.total)}${data.pointed ? L(' 포인트', ' points') : L('개', ' issues')}</p>${lineChart(data.days, { unit: unitText, idealLabel: L('이상적인 추세', 'Guideline'), actualLabel: L('남은 작업', 'Remaining work'), now: ctx.now })}`;
}

/** A round step for about `count` axis ticks up to `max` (1, 2, 5 × 10ⁿ). */
function niceStep(max, count = 5) {
  const raw = Math.max(1e-9, max / count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 5, 10].find((n) => n * power >= raw) * power;
  return Math.max(unit, max <= 5 ? 1 : unit);
}

/**
 * A burndown chart as usually drawn: days along the x axis (dates, weekends shaded), remaining work up the y
 * axis with gridlines and its unit, the ideal guideline dashed from the total down to zero, the actual remaining
 * work as a line with a dot per day, a "today" marker, and the legend above.
 * days = [{ t, ideal, remaining }] (remaining is null for days still to come).
 */
function lineChart(days, { unit = '', idealLabel = '', actualLabel = '', now = Date.now() } = {}) {
  const width = 760;
  const height = 300;
  const left = 54;
  const right = 18;
  const top = 14;
  const bottom = 48;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const peak = Math.max(1, ...days.map((day) => Math.max(day.ideal || 0, day.remaining || 0)));
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step;
  const x = (index) => left + (days.length === 1 ? plotW / 2 : (index / (days.length - 1)) * plotW);
  const y = (value) => top + plotH - (value / max) * plotH;
  const date = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const parts = [];
  // Weekends.
  const slot = days.length > 1 ? plotW / (days.length - 1) : plotW;
  days.forEach((day, index) => {
    const weekday = day.t ? new Date(day.t).getDay() : 1;
    if (weekday === 0 || weekday === 6) parts.push(`<rect x="${(x(index) - slot / 2).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plotH}" class="chart-weekend"/>`);
  });
  // Y axis: gridlines, values, title.
  for (let value = 0; value <= max + 1e-9; value += step) {
    const gy = y(value).toFixed(1);
    parts.push(`<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="${value === 0 ? 'chart-axis' : 'chart-grid'}"/><text x="${left - 8}" y="${(Number(gy) + 4).toFixed(1)}" class="chart-tick" text-anchor="end">${Number(value.toFixed(2))}</text>`);
  }
  parts.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" class="chart-axis"/>`);
  if (unit) parts.push(`<text x="14" y="${top + plotH / 2}" class="chart-title" text-anchor="middle" transform="rotate(-90 14 ${top + plotH / 2})">${esc(unit)}</text>`);
  // X axis: a tick per day, a date label on about eight of them, title.
  const every = Math.max(1, Math.ceil(days.length / 8));
  days.forEach((day, index) => {
    const gx = x(index).toFixed(1);
    parts.push(`<line x1="${gx}" y1="${top + plotH}" x2="${gx}" y2="${top + plotH + 4}" class="chart-axis"/>`);
    if (index % every === 0 || index === days.length - 1) parts.push(`<text x="${gx}" y="${top + plotH + 17}" class="chart-tick" text-anchor="middle">${esc(day.t ? date(day.t) : String(index + 1))}</text>`);
  });
  parts.push(`<text x="${left + plotW / 2}" y="${height - 6}" class="chart-title" text-anchor="middle">${esc(L('날짜', 'Date'))}</text>`);
  // Today.
  const todayIndex = days.findIndex((day, index) => day.t && new Date(day.t).toDateString() === new Date(now).toDateString() && index >= 0);
  if (todayIndex >= 0) parts.push(`<line x1="${x(todayIndex).toFixed(1)}" y1="${top}" x2="${x(todayIndex).toFixed(1)}" y2="${top + plotH}" class="chart-today"/><text x="${(x(todayIndex) + 4).toFixed(1)}" y="${top + 10}" class="chart-today-text">${esc(L('오늘', 'Today'))}</text>`);
  // Lines.
  const line = (pick, cls) => {
    const points = days.map((day, index) => ({ index, value: pick(day), day })).filter((point) => point.value != null);
    if (!points.length) return { path: '', points };
    return { path: `<path d="${points.map((point, k) => `${k ? 'L' : 'M'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}" class="${cls}"/>`, points };
  };
  const ideal = line((day) => day.ideal, 'chart-ideal');
  const actual = line((day) => day.remaining, 'chart-actual');
  parts.push(ideal.path, actual.path);
  for (const point of actual.points) {
    parts.push(`<circle cx="${x(point.index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="3.5" class="chart-dot"><title>${esc(`${point.day.t ? date(point.day.t) : point.index + 1} · ${actualLabel} ${Number(point.value.toFixed(2))}${point.day.ideal != null ? ` · ${idealLabel} ${Number(point.day.ideal.toFixed(2))}` : ''}`)}</title></circle>`);
  }
  const last = actual.points[actual.points.length - 1];
  if (last) parts.push(`<text x="${(x(last.index) + 6).toFixed(1)}" y="${(y(last.value) - 6).toFixed(1)}" class="chart-value">${Number(last.value.toFixed(2))}</text>`);
  const legend = `<div class="chart-legend"><span><i class="lg-ideal"></i>${esc(idealLabel)}</span><span><i class="lg-actual"></i>${esc(actualLabel)}</span>${todayIndex >= 0 ? `<span><i class="lg-today"></i>${esc(L('오늘', 'Today'))}</span>` : ''}<span><i class="lg-weekend"></i>${esc(L('주말', 'Weekend'))}</span></div>`;
  return `${legend}<svg class="chart burndown-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${idealLabel} / ${actualLabel}`)}">${parts.join('')}</svg>`;
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
  const slices = pie(ctx.project, ctx.project.issues.filter((issue) => issue.typeId !== 'epic' && issueVisible(ctx, issue)), field);
  if (!slices.length) return empty(L('이슈가 없습니다.', 'There are no issues.'));
  const painted = slices.map((slice, index) => ({ ...slice, label: groupLabel(ctx, field, slice.id), color: groupColor(ctx, field, slice.id, index) }));
  const total = painted.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let angle = -Math.PI / 2;
  const paths = painted.map((slice) => {
    const delta = (slice.value / total) * Math.PI * 2;
    const start = angle;
    angle += delta;
    const title = `<title>${esc(`${slice.label} · ${slice.value} (${Math.round((slice.value / total) * 100)}%)`)}</title>`;
    if (slice.value === total) return `<circle cx="70" cy="70" r="64" fill="${slice.color}">${title}</circle>`;
    const arc = (value) => [70 + 64 * Math.cos(value), 70 + 64 * Math.sin(value)];
    const [x1, y1] = arc(start);
    const [x2, y2] = arc(angle);
    return `<path d="M70,70 L${x1},${y1} A64,64 0 ${delta > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${slice.color}">${title}</path>`;
  }).join('');
  const legend = painted.map((slice) => `<li title="${esc(slice.label)}"><i style="background:${slice.color}"></i><span>${esc(slice.label)}</span><b>${slice.value}</b><small>${Math.round((slice.value / total) * 100)}%</small></li>`).join('');
  return `<div class="pie"><svg viewBox="0 0 140 140" preserveAspectRatio="xMidYMid meet">${paths}<circle cx="70" cy="70" r="30" class="pie-hole"/><text x="70" y="75" text-anchor="middle" class="pie-total">${total}</text></svg><ul>${legend}</ul></div>`;
}

function releases(ctx) {
  const project = ctx.project;
  const find = screenFind(ctx);
  const cards = project.versions.filter((version) => {
    if (!matchesText(find.q, version.name, version.description)) return false;
    if (find.state === 'released') return Boolean(version.released);
    if (find.state === 'open') return !version.released;
    return true;
  }).map((version) => {
    const issues = project.issues.filter((issue) => (issue.fixVersionIds || []).includes(version.id));
    const done = issues.filter((issue) => byId(project.statuses, issue.statusId)?.category === 'done').length;
    const pct = issues.length ? Math.round((done / issues.length) * 100) : 0;
    return `<article class="panel-card"><header><b>${esc(version.name)}</b>${version.released ? badge(L('출시', 'Released'), '#30a46c') : badge(L('예정', 'Unreleased'), '#3a6cf0')}</header><p>${esc(version.description || '')}</p><div class="bar"><i style="width:${pct}%"></i></div><p class="muted">${done}/${issues.length}${version.releaseDate ? ` · ${esc(formatWhen(version.releaseDate))}` : ''}</p><button type="button" class="small-button" data-action="release" data-id="${esc(version.id)}" data-on="${version.released ? '0' : '1'}">${icon(version.released ? 'undo' : 'release')}<span>${version.released ? L('출시 취소', 'Unrelease') : L('출시', 'Release')}</span></button></article>`;
  }).join('');
  return `<div class="page">${pageHead(L('릴리스', 'Releases'), `<button type="button" class="button" data-action="new-version">${icon('plus')}${L('버전', 'Version')}</button>`, 'releases')}${finderBar(ctx, [{ id: 'state', label: L('상태', 'State'), options: [{ id: 'open', label: L('예정', 'Unreleased') }, { id: 'released', label: L('출시', 'Released') }] }])}<div class="card-grid">${cards || empty(L('버전이 없습니다.', 'There are no versions.'))}</div></div>`;
}

function components(ctx) {
  const find = screenFind(ctx);
  const cards = ctx.project.components.filter((component) => matchesText(find.q, component.name, component.description, person(ctx.ws, component.leadId)?.name) && (!find.lead || component.leadId === find.lead)).map((component) => {
    const count = ctx.project.issues.filter((issue) => (issue.componentIds || []).includes(component.id)).length;
    return `<article class="panel-card"><header><b>${esc(component.name)}</b>${avatar(person(ctx.ws, component.leadId))}</header><p>${esc(component.description || '')}</p><p class="muted">${count}</p></article>`;
  }).join('');
  const leads = (ctx.ws.users || []).filter((user) => ctx.project.components.some((component) => component.leadId === user.id)).map((user) => ({ id: user.id, label: user.name }));
  return `<div class="page">${pageHead(L('구성 요소', 'Components'), `<button type="button" class="button" data-action="new-component">${icon('plus')}${L('구성 요소', 'Component')}</button>`, 'components')}${finderBar(ctx, [{ id: 'lead', label: L('책임', 'Lead'), options: leads }])}<div class="card-grid">${cards || empty(L('구성 요소가 없습니다.', 'There are no components.'))}</div></div>`;
}

function filters(ctx) {
  const find = screenFind(ctx);
  const list = ctx.project.filters.filter((filter) => matchesText(find.q, nameOf(filter), filter.query)).map((filter) => `<div class="link-row"><button type="button" data-action="run-filter" data-id="${esc(filter.id)}">${icon('filter')}<b>${esc(nameOf(filter))}</b><small>${esc(filter.query)}</small></button><button type="button" class="icon-button" data-action="delete-filter" data-id="${esc(filter.id)}">${icon('trash')}</button></div>`).join('');
  return `<div class="page">${pageHead(L('필터', 'Filters'), `<button type="button" class="button" data-action="open-guide" data-id="wql">${icon('book')}<span>${L('WQL 설명서', 'WQL guide')}</span></button><button type="button" class="button" data-action="save-filter">${icon('save')}<span>${L('현재 질의 저장', 'Save the current query')}</span></button>`, 'filters')}${finderBar(ctx)}<p class="muted">${esc(ctx.ui.query || L('이슈 화면의 질의가 비어 있습니다.', 'The issue query is empty.'))}</p>${list || empty(L('필터가 없습니다.', 'There are no filters.'))}</div>`;
}

function adminOnly(ctx, title, view) {
  if (isWorkspaceAdmin(ctx.user)) return '';
  return `<div class="page">${pageHead(title, '', view)}<p>${L('관리자 계정으로 로그인해야 합니다.', 'Sign in with the administrator account.')}</p></div>`;
}

function usersAdmin(ctx) {
  const blocked = adminOnly(ctx, L('사용자', 'Users'), 'users');
  if (blocked) return blocked;
  const project = ctx.project;
  const find = screenFind(ctx);
  const rows = ctx.ws.users.filter((user) => {
    const teams = (ctx.ws.teams || []).filter((team) => (team.members || []).some((item) => item.userId === user.id));
    if (!matchesText(find.q, user.name, user.login, user.email, user.phone, user.jobTitle, ...teams.map((team) => team.name))) return false;
    if (find.team && !teams.some((team) => team.id === find.team)) return false;
    if (find.active === 'yes' && user.active === false) return false;
    if (find.active === 'no' && user.active !== false) return false;
    return true;
  }).map((user) => {
    const teams = (ctx.ws.teams || []).filter((team) => (team.members || []).some((item) => item.userId === user.id));
    const role = '';
    const teamChips = teams.map((team) => `<button type="button" class="chip" data-action="open-team" data-id="${esc(team.id)}">${icon('team')}${esc(team.name)}</button>`).join(' ');
    return `<tr><td>${avatar(user)} ${esc(user.name)}</td><td>${esc(user.jobTitle || '')}</td><td>${teamChips || `<span class="muted">${esc(user.team || '')}</span>`}</td><td>${esc(user.phone || '')}</td><td>${esc(user.login || '')}${user.mustChangePassword ? ` <span class="chip access-view" title="${esc(L('다음 로그인 때 새 암호를 정해야 합니다.', 'Must choose a new password at the next sign-in.'))}">${icon('key')}${L('암호 변경 필요', 'Must change password')}</span>` : ''}</td><td>${esc(user.email || '')}</td>${role}<td><label class="check admin-check" title="${esc(L('관리자 권한', 'Administrator rights'))}"><input type="checkbox" data-user-admin="${esc(user.id)}" ${isWorkspaceAdmin({ ...user, active: true }) ? 'checked' : ''}>${icon('shield')}</label></td><td><input type="checkbox" data-user-active="${esc(user.id)}" ${user.active !== false ? 'checked' : ''}></td><td><button type="button" class="icon-button" data-action="edit-profile" data-id="${esc(user.id)}">${icon('pencil')}</button></td></tr>`;
  }).join('');
  const roleHead = '';
  return `<div class="page">${pageHead(L('사용자', 'Users'), `<button type="button" class="button" data-action="go" data-view="teams">${icon('team')}<span>${L('팀', 'Teams')}</span></button><button type="button" class="button" data-action="set-password">${icon('key')}<span>${L('암호', 'Password')}</span></button><button type="button" class="button primary" data-action="new-user">${icon('plus')}<span>${L('새 사용자', 'New user')}</span></button>`, 'users')}
    ${finderBar(ctx, [
      { id: 'team', label: L('팀', 'Team'), options: (ctx.ws.teams || []).map((team) => ({ id: team.id, label: team.name })) },
      { id: 'active', label: L('사용', 'Active'), options: [{ id: 'yes', label: L('사용', 'Active') }, { id: 'no', label: L('중지', 'Inactive') }] },
    ])}
    <p class="muted">${L('회사의 모든 계정입니다. 팀을 누르면 그 팀으로 가고, 과제의 보기·편집·책임자 권한은 과제의 사람과 권한에서 정합니다. 사용 칸을 끄면 로그인할 수 없습니다.', 'Every account in the company. A team opens that team; View, Edit and Lead on a project are set in its People & access. Turning Active off stops the sign-in.')}</p>
    <table class="data"><tr><th>${L('이름', 'Name')}</th><th>${L('직급', 'Title')}</th><th>${L('팀', 'Team')}</th><th>${L('휴대폰', 'Phone')}</th><th>${L('아이디', 'Account')}</th><th>${L('메일', 'Email')}</th>${roleHead}<th>${L('관리자', 'Admin')}</th><th>${L('사용', 'Active')}</th><th></th></tr>${rows}</table>
  </div>`;
}

function managesProject(ctx, project) {
  return allowed(ctx.ws, project, ctx.user?.id, 'admin');
}

function projectsAdmin(ctx) {
  const typeName = (type) => nameOf(type === 'service' ? { ko: '서비스', en: 'Service' } : type === 'business' ? { ko: '업무', en: 'Business' } : { ko: '소프트웨어', en: 'Software' });
  const leadName = (id) => ctx.ws.users.find((user) => user.id === id)?.name || '';
  const find = screenFind(ctx);
  const rows = orderedProjects(ctx.ws).filter((project) => {
    if (!matchesText(find.q, project.key, project.name, project.description, leadName(project.leadId))) return false;
    if (find.kind && project.type !== find.kind) return false;
    if (find.state === 'archived') return Boolean(project.archived);
    if (find.state === 'active') return !project.archived;
    return true;
  }).map((project) => {
    const manage = managesProject(ctx, project);
    const depth = projectAncestors(ctx.ws, project).length;
    const name = manage ? `<input data-managed="name" data-id="${esc(project.id)}" value="${esc(project.name)}" aria-label="${esc(L('이름', 'Name'))}">` : esc(project.name);
    const lead = manage ? `<select data-managed="lead" data-id="${esc(project.id)}" aria-label="${esc(L('책임자', 'Lead'))}">${userOptions(ctx.ws, project.leadId, '')}</select>` : esc(leadName(project.leadId));
    const archive = manage ? ` <button type="button" class="small-button" data-action="archive-project" data-id="${esc(project.id)}" data-on="${project.archived ? '0' : '1'}">${icon(project.archived ? 'restore' : 'box')}<span>${project.archived ? L('보관 해제', 'Unarchive') : L('보관', 'Archive')}</span></button>` : '';
    const participants = manage ? ` <button type="button" class="small-button" data-action="project-participants" data-id="${esc(project.id)}">${icon('people')}<span>${L('사람과 권한', 'People & access')}</span></button>` : '';
    const configure = manage ? ` <button type="button" class="small-button" data-action="open-project-settings" data-id="${esc(project.id)}">${icon('settings')}<span>${L('설정', 'Settings')}</span></button>` : '';
    const remove = canDeleteProject(ctx.ws, project, ctx.user?.id) ? ` <button type="button" class="small-button danger" data-action="delete-project" data-id="${esc(project.id)}" title="${esc(L('관리자만 삭제할 수 있습니다.', 'Only an administrator may delete.'))}">${icon('trash')}<span>${L('삭제', 'Delete')}</span></button>` : '';
    const child = manage ? ` <button type="button" class="small-button" data-action="new-project" data-parent="${esc(project.id)}">${icon('subtask')}<span>${L('하위 과제', 'Sub-project')}</span></button>` : '';
    return `<tr class="open-row" data-open-project="${esc(project.id)}" title="${esc(L('두 번 누르면 엽니다', 'Double-click to open'))}">
      <td class="nest" style="padding-left:${8 + depth * 16}px">${esc(project.key)}</td>
      <td>${name}</td>
      <td>${esc(typeName(project.type))}</td>
      <td>${esc((ctx.ws.teams || []).find((team) => team.id === project.teamId)?.name || '')}</td>
      <td>${lead}</td>
      <td>${project.archived ? L('보관', 'Archived') : L('사용', 'Active')}</td>
      <td><button type="button" class="small-button" data-action="activate" data-id="${esc(project.id)}">${icon('folder')}<span>${L('열기', 'Open')}</span></button>${child}${participants}${configure}${archive}${remove}</td>
    </tr>`;
  }).join('');
  return `<div class="page">${pageHead(L('과제', 'Projects'), `<button type="button" class="button primary" data-action="new-project">${icon('plus')}<span>${L('새 과제', 'New project')}</span></button>`, 'projects')}
    ${finderBar(ctx, [
      { id: 'kind', label: L('종류', 'Kind'), options: [{ id: 'software', label: L('소프트웨어', 'Software') }, { id: 'business', label: L('업무', 'Business') }, { id: 'service', label: L('서비스', 'Service') }] },
      { id: 'state', label: L('상태', 'State'), options: [{ id: 'active', label: L('사용', 'Active') }, { id: 'archived', label: L('보관', 'Archived') }] },
    ])}
    <table class="data"><tr><th>${L('키', 'Key')}</th><th>${L('이름', 'Name')}</th><th>${L('종류', 'Type')}</th><th>${L('팀', 'Team')}</th><th>${L('책임자', 'Lead')}</th><th>${L('상태', 'State')}</th><th></th></tr>${rows || `<tr><td colspan="7">${L('과제가 없습니다.', 'There are no projects.')}</td></tr>`}</table>
  </div>`;
}

function people(ctx) {
  const find = screenFind(ctx);
  const rows = ctx.ws.users.filter((user) => {
    const member = ctx.project.members.find((item) => item.userId === user.id);
    if (!matchesText(find.q, user.name, user.email, user.login, user.phone, user.jobTitle, user.team)) return false;
    if (find.role && (member?.role || '') !== find.role) return false;
    if (find.active === 'yes' && user.active === false) return false;
    if (find.active === 'no' && user.active !== false) return false;
    return true;
  }).map((user) => {
    const member = ctx.project.members.find((item) => item.userId === user.id);
    const edit = isWorkspaceAdmin(ctx.user) || user.id === ctx.user?.id
      ? `<button type="button" class="icon-button" data-action="edit-profile" data-id="${esc(user.id)}">${icon('pencil')}</button>`
      : '';
    return `<tr><td>${avatar(user)} ${esc(user.name)}</td><td>${esc(user.jobTitle || '')}</td><td>${esc(user.team || '')}</td><td>${esc(user.phone || '')}</td><td>${esc(user.email || '')}</td><td><select data-member="${esc(user.id)}">${options(ROLES, member?.role || '', L('역할 없음', 'No role'))}</select></td><td><input type="checkbox" data-user-active="${esc(user.id)}" ${user.active !== false ? 'checked' : ''}></td><td>${edit}</td></tr>`;
  }).join('');
  const groups = ctx.ws.groups.map((group) => `<article class="panel-card"><header><b>${esc(nameOf(group))}</b></header><div class="checks">${ctx.ws.users.map((user) => `<label class="check"><input type="checkbox" data-group="${esc(group.id)}" data-user="${esc(user.id)}" ${(group.userIds || []).includes(user.id) ? 'checked' : ''}>${esc(user.name)}</label>`).join('')}</div></article>`).join('');
  return `<div class="page">${pageHead(L('사람', 'People'), `<button type="button" class="button" data-action="new-user">${icon('plus')}${L('사람', 'Person')}</button><button type="button" class="button" data-action="new-group">${icon('people')}${L('그룹', 'Group')}</button><button type="button" class="button" data-action="set-password">${icon('lock')}${L('암호', 'Password')}</button>`, 'people')}
    ${finderBar(ctx, [
      { id: 'team', label: L('팀', 'Team'), options: (ctx.ws.teams || []).map((team) => ({ id: team.id, label: team.name })) },
      { id: 'active', label: L('사용', 'Active'), options: [{ id: 'yes', label: L('사용', 'Active') }, { id: 'no', label: L('중지', 'Inactive') }] },
    ])}
    <p class="muted">${L('책임자는 항상 관리자입니다. 위 선택은 이 과제의 역할입니다.', 'The lead is always an administrator. The choice above is the role on this project.')}</p>
    <table class="data"><tr><th>${L('이름', 'Name')}</th><th>${L('직급', 'Title')}</th><th>${L('팀', 'Team')}</th><th>${L('휴대폰', 'Phone')}</th><th>${L('메일', 'Email')}</th><th>${L('역할', 'Role')}</th><th>${L('사용', 'Active')}</th><th></th></tr>${rows}</table>
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
  const find = screenFind(ctx);
  const items = inspect(ctx.project, ctx.now, calendarOf(ctx.ws)).filter((item) => {
    const issue = findIssue(ctx.project, item.issueId);
    if (find.code && item.code !== find.code) return false;
    if (find.level && item.severity !== find.level) return false;
    return matchesText(find.q, issue?.key, issue?.summary, texts[item.code], item.code);
  }).map((item) => {
    const issue = findIssue(ctx.project, item.issueId);
    return `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId)}">${icon('alert')}${badge(item.severity === 'error' ? L('오류', 'Error') : L('주의', 'Warning'), item.severity === 'error' ? '#e5484d' : '#f5a524')}<span class="key">${esc(issue?.key || '')}</span><span>${esc(texts[item.code] || item.code)}</span><span>${esc(issue?.summary || '')}</span></button>`;
  }).join('');
  return `<div class="page">${pageHead(L('점검', 'Health'), '', 'health')}${finderBar(ctx, [
    { id: 'code', label: L('종류', 'Kind'), options: Object.entries(texts).map(([id, label]) => ({ id, label })) },
    { id: 'level', label: L('수준', 'Level'), options: [{ id: 'error', label: L('오류', 'Error') }, { id: 'warning', label: L('주의', 'Warning') }] },
  ])}${items || empty(L('문제가 없습니다.', 'Nothing needs attention.'))}</div>`;
}

function noticeBox(scope, id, event, checked, ko, en) {
  return `<label class="check"><input type="checkbox" data-notice="${scope}" data-id="${esc(id)}" data-event="${event}" ${checked ? 'checked' : ''}>${L(ko, en)}</label>`;
}

function noticeSettings(ctx) {
  const userId = ctx.user?.id;
  if (!userId) return '';
  const projectRows = orderedProjects(ctx.ws).map((project) => {
    const on = (event, fallback) => noticeChecked(ctx.ws, userId, 'project', project.id, event, fallback);
    return `<div class="notice-row"><b>${esc(project.key)} ${esc(project.name)}</b>${noticeBox('project', project.id, 'watch', on('watch', true), '관찰하는 이슈', 'Issues I watch')}${noticeBox('project', project.id, 'created', on('created', false), '새 이슈', 'New issues')}${noticeBox('project', project.id, 'assign', on('assign', false), '담당', 'Assignment')}${noticeBox('project', project.id, 'comment', on('comment', false), '의견', 'Comments')}${noticeBox('project', project.id, 'transition', on('transition', false), '상태', 'Status')}${noticeBox('project', project.id, 'page', on('page', false), '페이지', 'Pages')}</div>`;
  }).join('');
  const projectId = ctx.project?.id || '';
  const spaceIds = new Set((ctx.ws.spaces || []).filter((space) => projectId && space.projectId === projectId).map((space) => space.id));
  const pages = projectId ? (ctx.ws.articles || []).filter((page) => visiblePage(page, userId) && (spaceIds.has(page.spaceId) || page.projectId === projectId)) : [];
  const pageRows = pages.map((page) => {
    const watching = (page.watchers || []).includes(userId);
    const on = (event) => noticeChecked(ctx.ws, userId, 'page', page.id, event, watching);
    return `<div class="notice-row"><b>${esc(page.title)}</b>${noticeBox('page', page.id, 'edit', on('edit'), '수정', 'Edits')}${noticeBox('page', page.id, 'comment', on('comment'), '의견', 'Comments')}</div>`;
  }).join('');
  const documents = projectId ? visibleDocuments(ctx.ws, userId, projectId).filter((doc) => !doc.projectId || doc.projectId === projectId) : [];
  const documentRows = documents.map((doc) => `<div class="notice-row"><b>${esc(doc.title)}</b>${noticeBox('document', doc.id, 'edit', noticeChecked(ctx.ws, userId, 'document', doc.id, 'edit', false), '내용', 'Content')}</div>`).join('');
  const issues = (ctx.project?.issues || []).filter((issue) => (issue.watchers || []).includes(userId));
  const issueRows = issues.map((issue) => {
    const on = (event) => noticeChecked(ctx.ws, userId, 'issue', issue.id, event, true);
    return `<div class="notice-row"><b>${esc(issue.key)}</b><span>${esc(issue.summary)}</span>${noticeBox('issue', issue.id, 'assign', on('assign'), '담당', 'Assignment')}${noticeBox('issue', issue.id, 'comment', on('comment'), '의견', 'Comments')}${noticeBox('issue', issue.id, 'transition', on('transition'), '상태', 'Status')}</div>`;
  }).join('');
  const block = (glyph, title, hint, rows, emptyText) => `<section><h2>${icon(glyph)}<span>${title}</span></h2><p class="muted">${hint}</p><div class="notice-list">${rows || empty(emptyText)}</div></section>`;
  return `<div class="notice-settings">
    <h2>${icon('bell')}<span>${L('알림 설정', 'Notification settings')}</span></h2>
    <p class="muted">${L('이 선택은 현재 사용자에게만 적용됩니다.', 'These choices apply only to the current user.')}</p>
    ${block('folder', L('과제', 'Projects'), L('과제마다 받을 일을 고릅니다. 관찰하는 이슈를 끄면 그 과제에서는 관찰 중에도 알림이 오지 않습니다.', 'Choose what each project sends. Turning off watched issues stops those notices in that project.'), projectRows, L('과제가 없습니다.', 'There are no projects.'))}
    ${block('book', L('페이지', 'Pages'), L('이 과제의 페이지마다 수정과 의견을 따로 받습니다.', 'Each page in this project can send edits and comments separately.'), pageRows, L('페이지가 없습니다.', 'There are no pages.'))}
    ${block('file', L('문서', 'Documents'), L('문서 내용이 바뀌면 알립니다.', 'Hear when a document changes.'), documentRows, L('문서가 없습니다.', 'There are no documents.'))}
    ${block('issues', L('이슈', 'Issues'), L('관찰 중인 이슈에서 받을 일을 고릅니다.', 'Choose what each issue you watch sends.'), issueRows, L('관찰 중인 이슈가 없습니다.', 'You are not watching an issue.'))}
  </div>`;
}

function notifications(ctx) {
  const find = screenFind(ctx);
  const mine = [
    ...(ctx.project?.notifications || []).filter((item) => item.userId === ctx.user?.id).map((item) => ({ item, inbox: false })),
    ...(ctx.ws.inbox || []).filter((item) => item.userId === ctx.user?.id).map((item) => ({ item, inbox: true })),
  ].sort((a, b) => String(b.item.at || '').localeCompare(String(a.item.at || '')));
  const items = mine.filter(({ item }) => {
    if (find.read === 'unread' && item.read) return false;
    if (find.read === 'read' && !item.read) return false;
    return matchesText(find.q, activityText(ctx, item), item.issueKey);
  }).map(({ item, inbox }) => (inbox
    ? `<button type="button" class="link-row${item.read ? '' : ' unread'}" data-action="open-inbox" data-id="${esc(item.id)}">${icon(item.kind === 'mention' ? 'user' : 'book')}<span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`
    : `<button type="button" class="link-row${item.read ? '' : ' unread'}" data-action="mark-read" data-id="${esc(item.id)}" data-issue="${esc(item.issueId || '')}">${icon('bell')}<span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`)).join('');
  return `<div class="page">${pageHead(L('알림', 'Notifications'), `<button type="button" class="button" data-action="mark-all-read">${icon('check')}<span>${L('모두 읽음', 'Mark all read')}</span></button>`, 'notifications')}${finderBar(ctx, [{ id: 'read', label: L('상태', 'State'), options: [{ id: 'unread', label: L('안 읽음', 'Unread') }, { id: 'read', label: L('읽음', 'Read') }] }])}${items || empty(L('알림이 없습니다.', 'There are no notifications.'))}${noticeSettings(ctx)}</div>`;
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
      ${flag('showWelcome', 'play', '로그인 후 튜토리얼 실행 여부 묻기', 'Ask whether to run the tutorial after signing in')}
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

function parentOptions(ctx, project) {
  const blocked = new Set([project.id]);
  const walk = (id) => {
    for (const child of ctx.ws.projects || []) {
      if (child.parentId === id && !blocked.has(child.id)) {
        blocked.add(child.id);
        walk(child.id);
      }
    }
  };
  walk(project.id);
  const choices = (ctx.ws.projects || []).filter((item) => !blocked.has(item.id) && (item.id === project.parentId || managesProject(ctx, item)));
  return [`<option value="">${esc(L('없음', 'None'))}</option>`, ...choices.map((item) => `<option value="${esc(item.id)}"${item.id === (project.parentId || '') ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`)].join('');
}

function projectConfiguration(ctx, project) {
  const transitions = project.transitions.map((item) => `<li><span>${esc(nameOf(byId(project.statuses, item.from)))} → ${esc(nameOf(byId(project.statuses, item.to)))}</span> <b>${esc(nameOf(item))}</b> <button type="button" class="icon-button" data-action="delete-transition" data-id="${esc(item.id)}">${icon('trash')}</button></li>`).join('');
  const statuses = project.statuses.map((status) => `<li>${badge(nameOf(status), status.color)} <button type="button" class="icon-button" data-action="delete-status" data-id="${esc(status.id)}">${icon('trash')}</button></li>`).join('');
  const rules = project.rules.map((rule) => `<li>${esc(nameOf(rule))} <button type="button" class="icon-button" data-action="delete-rule" data-id="${esc(rule.id)}">${icon('trash')}</button></li>`).join('');
  const fields = project.fields.map((field) => `<li>${esc(nameOf(field))} <small>${esc(field.type)}</small> <button type="button" class="icon-button" data-action="delete-field" data-id="${esc(field.id)}">${icon('trash')}</button></li>`).join('');
  const team = teamOfProject(ctx.ws, project);
  const teamChoices = (ctx.ws.teams || []).map((item) => `<option value="${esc(item.id)}"${item.id === team?.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('');
  return `<section><h2>${icon('folder')}<span>${L('과제', 'Project')}</span></h2>
      <label class="form-row"><span>${icon('tag')}${L('이름', 'Name')}</span><input data-project="name" value="${esc(project.name)}"></label>
      <label class="form-row"><span>${icon('pencil')}${L('설명', 'Description')}</span><textarea data-project="description" rows="3">${esc(project.description || '')}</textarea></label>
      <label class="form-row"><span>${icon('team')}${L('팀', 'Team')}</span><select data-project-team="${esc(project.id)}">${teamChoices}</select></label>
      <label class="form-row"><span>${icon('shield')}${L('책임자', 'Lead')}</span><select data-project="leadId">${userOptions(ctx.ws, project.leadId, '')}</select></label>
      <label class="form-row"><span>${icon('subtask')}${L('상위 과제', 'Parent project')}</span><select data-project="parentId">${parentOptions(ctx, project)}</select></label>
      <label class="check"><input type="checkbox" data-project="allowAnyTransition" ${project.allowAnyTransition !== false ? 'checked' : ''}> ${L('보드에서 어떤 상태로든 옮길 수 있음', 'Cards on the board may move to any status')}</label>
      <div class="page-actions"><button type="button" class="button" data-action="${project.archived ? 'unarchive' : 'archive'}">${icon(project.archived ? 'restore' : 'box')}<span>${project.archived ? L('보관 해제', 'Unarchive') : L('과제 보관', 'Archive project')}</span></button>
      <button type="button" class="button" data-action="project-participants" data-id="${esc(project.id)}">${icon('people')}<span>${L('사람과 권한', 'People & access')}</span></button></div>
    </section>
    <section><h2>${icon('layers')}<span>${L('관리 방법', 'Management methods')}</span></h2><p class="muted">${L('이 과제를 어떻게 진행할지 고릅니다. 고른 방법의 화면만 왼쪽 탐색에 나옵니다.', 'Choose how this project is run. Only the chosen methods appear in the navigation.')}</p>${methodChecks(projectMethods(project), `data-method-project="${esc(project.id)}"`)}</section>
    <section><h2>${icon('workflow')}<span>${L('작업 흐름', 'Workflow')}</span></h2><ul class="plain">${statuses}</ul><button type="button" class="small-button" data-action="new-status">${icon('workflow')}<span>${L('상태 추가', 'Add status')}</span></button><ul class="plain">${transitions}</ul><button type="button" class="small-button" data-action="new-transition">${icon('workflow')}<span>${L('전이 추가', 'Add transition')}</span></button></section>
    <section><h2>${icon('tag')}<span>${L('필드', 'Fields')}</span></h2><ul class="plain">${fields}</ul><button type="button" class="small-button" data-action="new-field">${icon('tag')}<span>${L('필드 추가', 'Add field')}</span></button></section>
    <section><h2>${icon('bolt')}<span>${L('자동화', 'Automation')}</span></h2><ul class="plain">${rules}</ul><button type="button" class="small-button" data-action="new-rule">${icon('bolt')}<span>${L('규칙 추가', 'Add a rule')}</span></button></section>
    ${screenSection(project)}`;
}

function projectSettings(ctx) {
  const title = L('과제 설정', 'Project settings');
  const missing = need(ctx, title);
  if (missing) return missing;
  if (!managesProject(ctx, ctx.project)) {
    return `<div class="page">${pageHead(title, '', 'project-settings')}<p>${L('권한이 없습니다.', 'You do not have permission.')}</p></div>`;
  }
  const blocks = [
    ['project', L('과제', 'Project')],
    ['methods', L('관리 방법', 'Management methods')],
    ['workflow', L('작업 흐름', 'Workflow')],
    ['fields', L('필드', 'Fields')],
    ['rules', L('자동화', 'Automation')],
    ['screen', L('만들기 화면', 'Create screen')],
  ];
  const find = screenFind(ctx);
  const html = projectConfiguration(ctx, ctx.project);
  const parts = html.split(/(?=<section>)/);
  const shown = parts.filter((part) => {
    const titleText = part.match(/<h2>(?:<[^>]+>)*([^<]+)/)?.[1] || '';
    if (find.section && !titleText.includes(blocks.find((item) => item[0] === find.section)?.[1] || '')) return false;
    return keepBlock(find.q, part);
  }).join('');
  return `<div class="page settings">${pageHead(title, '', 'project-settings')}${finderBar(ctx, [{ id: 'section', label: L('분류', 'Section'), options: blocks.map(([id, label]) => ({ id, label })) }])}${shown ? `<div class="settings-grid">${shown}</div>` : empty(L('찾는 설정이 없습니다.', 'No setting matches.'))}</div>`;
}

/** How long an account waits after too many failed sign-ins in a row; locked accounts and their release. */
export function signInLockSettings(ctx) {
  const policy = lockPolicy(ctx.ws);
  const lang = getLanguage();
  const admin = isWorkspaceAdmin(ctx.user);
  const off = admin ? '' : 'disabled';
  const custom = Boolean(ctx.ui.lockCustom) || !LOCK_CHOICES.includes(policy.minutes);
  const choices = LOCK_CHOICES.map((minutes) => `<option value="${minutes}" ${!custom && minutes === policy.minutes ? 'selected' : ''}>${esc(formatLockMinutes(minutes, lang))}</option>`).join('')
    + `<option value="custom" ${custom ? 'selected' : ''}>${esc(L('직접 정하기…', 'Custom…'))}</option>`;
  const unit = ctx.ui.lockUnit || (policy.minutes % 1440 === 0 ? 'day' : policy.minutes % 60 === 0 ? 'hour' : 'minute');
  const per = { minute: 1, hour: 60, day: 1440 }[unit] || 1;
  const amount = Math.max(1, Math.round(policy.minutes / per));
  const units = [['minute', L('분', 'minutes')], ['hour', L('시간', 'hours')], ['day', L('일', 'days')]]
    .map(([id, label]) => `<option value="${id}" ${id === unit ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const customRow = custom ? `<div class="form-row"><span>${L('직접 정한 시간', 'Custom wait')}</span><span class="login-lock-custom"><input type="number" data-lock="amount" min="1" step="1" value="${esc(amount)}" ${off}><select data-lock="unit" ${off}>${units}</select></span></div>` : '';
  const now = Date.now();
  const locks = (ctx.ui.signinLocks || []).filter((item) => item.until > now);
  const list = admin
    ? `<h3>${icon('lock')}<span>${L('잠긴 계정', 'Locked accounts')}</span></h3>
      ${ctx.ui.signinLocks == null ? `<p class="muted">${L('"새로 고침"을 누르면 지금 잠긴 계정을 봅니다.', 'Press Refresh to see the accounts locked now.')}</p>`
        : locks.length ? `<div class="login-lock-list">${locks.map((item) => `<div class="link-row"><b>${esc(item.account)}</b><small>${esc(L(`${formatCountdown(item.until - now, 'ko')} 남음`, `${formatCountdown(item.until - now, 'en')} left`))}</small><button type="button" class="small-button" data-action="release-signin-lock" data-account="${esc(item.account)}">${icon('unlock')}<span>${L('잠금 풀기', 'Unlock')}</span></button></div>`).join('')}</div>`
        : empty(L('잠긴 계정이 없습니다.', 'No account is locked.'))}
      <button type="button" class="button" data-action="refresh-signin-locks">${icon('undo')}<span>${L('새로 고침', 'Refresh')}</span></button>`
    : `<p class="muted">${icon('info')}${L('관리자만 바꿀 수 있습니다.', 'Only an administrator can change this.')}</p>`;
  return `<section class="signin-lock-card"><h2>${icon('lock')}<span>${L('로그인 잠금', 'Sign-in lock')}</span></h2>
    <p class="muted">${esc(L(
      `로그인을 ${LOCK_ATTEMPTS}번 연달아 실패하면 그 계정은 정한 시간 동안 로그인할 수 없습니다. ${formatLockMinutes(LOCK_MIN_MINUTES, 'ko')}보다 짧게 정할 수 없습니다.`,
      `After ${LOCK_ATTEMPTS} failed sign-ins in a row, the account waits this long before it may try again. It cannot be shorter than ${formatLockMinutes(LOCK_MIN_MINUTES, 'en')}.`,
    ))}</p>
    <label class="form-row"><span>${L('기다리는 시간', 'Wait')}</span><select data-lock="choice" ${off}>${choices}</select></label>
    ${customRow}
    <p class="muted">${icon('clock')}<span>${esc(L(`지금 설정: ${formatLockMinutes(policy.minutes, 'ko')}`, `Now: ${formatLockMinutes(policy.minutes, 'en')}`))}</span></p>
    ${list}
  </section>`;
}

function settings(ctx) {
  const colors = ctx.settings.customTheme ? CUSTOM_KEYS.map((key) => `<label class="form-row"><span>${esc(key)}</span><input type="color" data-custom-color="${esc(key)}" value="${esc(ctx.settings.customTheme[key] || '#888888')}"></label>`).join('') : '';
  const blocks = [
    ['start', L('시작 화면', 'Start page'), startSettings(ctx)],
    ['computer', L('이 컴퓨터', 'This computer'), startupOptions(ctx)],
    ['signin', L('로그인 잠금', 'Sign-in lock'), signInLockSettings(ctx)],
    ['database', L('데이터베이스', 'Database'), databaseSettings(ctx)],
    ['mail', L('메일', 'Mail'), mailSettings(ctx)],
    ['look', L('모양', 'Appearance'), `<section><h2>${icon('palette')}<span>${L('모양', 'Appearance')}</span></h2>
      <label class="form-row"><span>${icon('file')}${L('글자 크기', 'Text size')}</span><input data-font="size" type="number" min="12" max="20" value="${esc(ctx.settings.fontSize)}"></label>
      <button type="button" class="button" data-action="edit-custom-theme">${icon('settings')}<span>${L('사용자 정의 테마 설정', 'Custom theme settings')}</span></button>
      ${colors}
    </section>`],
  ];
  // Company-wide settings (sign-in lock, the database, mail) are the administrator's: a person signed in
  // without the administrator mark sees only their own settings.
  const admin = isWorkspaceAdmin(ctx.user);
  const ADMIN_ONLY = new Set(['signin', 'database', 'mail']);
  const allowedBlocks = blocks.filter(([id]) => admin || !ADMIN_ONLY.has(id));
  const find = screenFind(ctx);
  // Related settings sit together: each group is a heading over a grid of cards.
  const groups = [
    ['general', 'settings', L('일반', 'General'), ['start', 'look']],
    ['account', 'user', L('이 컴퓨터와 로그인', 'This computer and sign-in'), ['computer', 'signin']],
    ['data', 'database', L('데이터', 'Data'), ['database']],
    ['notify', 'bell', L('알림', 'Notifications'), ['mail']],
  ];
  const html = (id) => {
    const item = allowedBlocks.find((block) => block[0] === id);
    if (!item || (find.section && find.section !== id)) return '';
    return keepBlock(find.q, item[2]);
  };
  const shown = groups.map(([id, glyph, title, ids]) => {
    const body = ids.map(html).join('');
    return body.trim() ? `<div class="settings-group" data-group="${id}"><h2 class="settings-group-title">${icon(glyph)}<span>${title}</span></h2><div class="settings-grid">${body}</div></div>` : '';
  }).join('');
  const role = admin
    ? `<span class="settings-role admin">${icon('shield')}<span>${L('관리자 설정', 'Administrator settings')}</span></span>`
    : `<span class="settings-role">${icon('user')}<span>${L('내 설정', 'My settings')}</span></span>`;
  const note = admin ? '' : `<p class="banner settings-admin-note">${icon('lock')}<span>${L('로그인 잠금, 데이터베이스, 메일 설정은 관리자로 로그인해야 보입니다.', 'Sign-in lock, database and mail settings show when you sign in as an administrator.')}</span></p>`;
  return `<div class="page settings">${pageHead(L('설정', 'Settings'), role, 'settings')}
    ${note}
    ${finderBar(ctx, [{ id: 'section', label: L('분류', 'Section'), options: allowedBlocks.map(([id, label]) => ({ id, label })) }])}
    ${shown || empty(L('찾는 설정이 없습니다.', 'No setting matches.'))}
  </div>`;
}

function help(ctx) {
  const find = screenFind(ctx);
  const open = (id, glyph, ko, en, tipKo, tipEn) => {
    const html = `<button type="button" class="button" data-action="open-guide" data-id="${id}">${icon(glyph)}<span>${L(ko, en)}</span></button><p class="muted">${L(tipKo, tipEn)}</p>`;
    if (find.kind && find.kind !== id) return '';
    return keepBlock(find.q, html);
  };
  return `<div class="page help-page">${pageHead(L('도움말', 'Help'), '', 'help')}
    ${finderBar(ctx, [{ id: 'kind', label: L('문서', 'Document'), options: [{ id: 'guide', label: L('사용 설명서', "User's guide") }, { id: 'tutorial', label: L('튜토리얼', 'Tutorial') }, { id: 'wql', label: L('작업 질의', 'Work query') }] }])}
    <p>${L('사용 설명서, 튜토리얼 문서, 작업 질의는 각각 별도의 창에서 열립니다.', 'The user guide, the tutorial document and the query language each open in their own window.')}</p>
    <div class="doc-launch">
      ${open('guide', 'book', '사용 설명서', "User's Guide", '메뉴, 이슈, 계획, 문서를 설명합니다.', 'Menus, issues, planning and documents.')}
      ${open('tutorial', 'play', '튜토리얼 문서', 'Tutorial document', '각 단계를 그 화면과 함께 봅니다.', 'Every step with its screen.')}
      ${open('wql', 'filter', 'WQL 설명서', 'WQL guide', '필드, 연산, 함수, 정렬을 설명합니다.', 'Fields, operators, functions and order.')}
    </div>
  </div>`;
}

/** What an issue is waiting for (open issues that block it) and what waits for it. */
function blockedBanner(ctx, current) {
  const waits = blockersOf(ctx.project, current).open;
  if (!waits.length) return '';
  const links = waits.map((other) => `<button type="button" class="key" data-action="open-issue" data-id="${esc(other.id)}">${esc(other.key)}</button> ${esc(other.summary)}`).join(', ');
  return `<p class="banner bad blocked-banner">${icon('lock')}<span>${L('먼저 끝나야 할 이슈', 'Waiting for')}: ${links}</span></p>`;
}

function issue(ctx) {
  const current = findIssue(ctx.project, ctx.ui.issueId);
  if (!current) return `<div class="page">${empty(L('이슈를 고르세요.', 'Choose an issue.'))}</div>`;
  const tabs = [['details', 'book', L('설명', 'Description')], ['comments', 'comment', L('의견', 'Comments')], ['work', 'clock', L('작업 기록', 'Work log')], ['history', 'list', L('기록', 'History')], ['links', 'link', L('연결', 'Links')]];
  const children = ctx.project.issues.filter((item) => (item.parentId === current.id || (current.typeId === 'epic' && item.epicId === current.id && item.id !== current.id)) && issueVisible(ctx, item));
  return `<div class="page issue">${finderBar(ctx)}
    <div class="issue-title">${typeBadge(ctx.project, current.typeId)}<span class="key">${esc(current.key)}</span></div>
    <input class="summary-input" data-field="summary" data-live value="${esc(current.summary)}">
    ${blockedBanner(ctx, current)}
    <div class="tabs item-tabs">${tabs.map(([id, glyph, label]) => `<button type="button" class="tab${ctx.ui.issueTab === id ? ' active' : ''}" data-action="issue-tab" data-id="${id}">${icon(glyph)}<span>${label}</span></button>`).join('')}${itemActions({ action: 'save-issue', attrs: `data-id="${esc(current.id)}"` }, { action: 'close-issue', attrs: `data-id="${esc(current.id)}"` })}</div>
    ${issueTab(ctx, current)}
    ${approvalBlock(ctx, current)}
    ${children.length ? `<h3>${current.typeId === 'epic' ? L('안의 이슈', 'Issues inside') : L('하위 작업', 'Sub-tasks')}</h3>${issueLines(ctx, children)}` : ''}
    ${current.typeId !== 'subtask' && current.typeId !== 'epic' ? `<button type="button" class="small-button" data-action="create-subtask">${icon('subtask')}<span>${L('하위 작업', 'Sub-task')}</span></button>` : ''}
  </div>`;
}

function issueTab(ctx, issue) {
  if (ctx.ui.issueTab === 'comments') {
    const list = issue.comments.filter((comment) => matchesText(screenFind(ctx).q, comment.body, person(ctx.ws, comment.authorId)?.name)).map((comment) => `<article class="comment"><header>${avatar(person(ctx.ws, comment.authorId))}<b>${esc(person(ctx.ws, comment.authorId)?.name || '')}</b><small>${esc(formatWhen(comment.created))}</small><button type="button" class="icon-button" data-action="delete-comment" data-id="${esc(comment.id)}">${icon('trash')}</button></header><div class="md">${renderMarkdown(comment.body)}</div></article>`).join('');
    return `${list}<textarea id="comment-body" rows="3" placeholder="${esc(L('의견을 적습니다. @이름으로 알립니다.', 'Write a comment. @name notifies that person.'))}"></textarea><button type="button" class="button" data-action="add-comment">${icon('comment')}<span>${L('등록', 'Add')}</span></button>`;
  }
  if (ctx.ui.issueTab === 'work') {
    const list = issue.worklogs.filter((log) => matchesText(screenFind(ctx).q, log.comment, person(ctx.ws, log.authorId)?.name, dur(log.minutes))).map((log) => `<div class="link-row"><span>${esc(dur(log.minutes))} · ${esc(person(ctx.ws, log.authorId)?.name || '')}</span><span>${esc(log.comment || '')}</span><button type="button" class="icon-button" data-action="delete-worklog" data-id="${esc(log.id)}">${icon('trash')}</button></div>`).join('');
    return `${list}<div class="inline"><input id="work-minutes" placeholder="1h 30m"><input id="work-note" placeholder="${esc(L('메모', 'Note'))}"><button type="button" class="button" data-action="add-worklog">${icon('clock')}<span>${L('기록', 'Log')}</span></button></div>`;
  }
  if (ctx.ui.issueTab === 'history') {
    return issue.history.slice().reverse().filter((entry) => matchesText(screenFind(ctx).q, historyText(ctx, entry), entry.field)).map((entry) => `<div class="link-row"><span>${esc(historyText(ctx, entry))}</span><small>${esc(formatWhen(entry.at))}</small></div>`).join('') || empty(L('기록이 없습니다.', 'There is no history.'));
  }
  if (ctx.ui.issueTab === 'links') {
    const list = (issue.links || []).filter((link) => {
      const other = findIssue(ctx.project, link.otherId);
      return matchesText(screenFind(ctx).q, link.type, other?.key, other?.summary);
    }).map((link) => {
      const type = LINK_TYPES.find((item) => item.id === link.type);
      const other = findIssue(ctx.project, link.otherId);
      const label = link.direction === 'out' ? nameOf(type) : (ctx.settings.language === 'en' ? type?.inverseEn : type?.inverseKo);
      return `<div class="link-row"><span>${esc(label || link.type)}</span><button type="button" class="key" data-action="open-issue" data-id="${esc(other?.id || '')}">${icon('link')}${esc(other?.key || '')}</button><span>${esc(other?.summary || '')}</span><button type="button" class="icon-button" data-action="remove-link" data-id="${esc(link.id)}">${icon('trash')}</button></div>`;
    }).join('');
    return `${list}<div class="inline"><select id="link-type">${options(LINK_TYPES, 'relates')}</select><input id="link-key" placeholder="SHOP-1"><button type="button" class="button" data-action="add-link">${icon('link')}<span>${L('연결', 'Link')}</span></button></div>`;
  }
  return `${qualityBlock(ctx, issue)}<div class="desc-tools"><button type="button" class="small-button" data-action="toggle-preview">${icon(ctx.ui.preview ? 'pencil' : 'eye')}<span>${ctx.ui.preview ? L('편집', 'Edit') : L('미리 보기', 'Preview')}</span></button></div>
    ${ctx.ui.preview ? `<article class="md">${renderMarkdown(issue.description || '')}</article>` : `<textarea data-field="description" data-live rows="12">${esc(issue.description || '')}</textarea>`}`;
}

export function renderRight(ctx) {
  if (!showRight(ctx)) return '';
  let glyph = 'issues';
  let title = L('이슈', 'Issue');
  const issueBox = () => foldBox(ctx, 'side', 'issue-preview', `${icon('issues')}<span>${L('고른 이슈', 'Chosen issue')}</span>`, preview(ctx));
  let inner = ctx.ui.view === 'knowledge' ? '' : issueBox();
  if (ctx.ui.view === 'knowledge') {
    const page = openPageOf(ctx);
    glyph = page ? 'info' : 'layers';
    title = page ? L('페이지 정보', 'Page details') : L('작업 공간 속성', 'Workspace properties');
    inner = page ? pageInfoPanel(ctx) : spaceInfoPanel(ctx);
  } else if (ctx.ui.view === 'backlog') {
    glyph = 'epic';
    title = L('에픽', 'Epics');
    const epics = ctx.project.issues.filter((issue) => issue.typeId === 'epic');
    const epicList = `<button type="button" class="nav-button${ctx.ui.epicId ? '' : ' active'}" data-action="epic-filter" data-id="">${icon('epic')}<span>${L('모든 에픽', 'All epics')}</span></button>${epics.map((epic) => `<button type="button" class="nav-button${ctx.ui.epicId === epic.id ? ' active' : ''}" data-action="epic-filter" data-id="${esc(epic.id)}">${icon('epic')}<span>${esc(epic.summary)}</span></button>`).join('')}`;
    inner = `${foldBox(ctx, 'side', 'epics', `${icon('epic')}<span>${L('에픽', 'Epics')}</span><small class="nav-count">${epics.length}</small>`, epicList)}${issueBox()}`;
  } else if (ctx.ui.view === 'issue') {
    glyph = 'list';
    title = L('세부 사항', 'Details');
    inner = fields(ctx);
  } else if (ctx.ui.view === 'documents') {
    glyph = 'file';
    title = L('문서', 'Document');
    inner = documentPreview(ctx);
  } else if (ctx.ui.view === 'audit') {
    glyph = 'info';
    title = L('기록 내용', 'Entry');
    inner = auditDetail(ctx);
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
  const box = (id, glyph, title, body, count = null) => foldBox(ctx, 'side', id, `${icon(glyph)}<span>${title}</span>${count != null ? `<small class="nav-count">${count}</small>` : ''}`, body);
  return `<div class="props">${box('issue-main', 'workflow', L('상태와 담당', 'Status and people'), `
    ${sla ? `<p class="banner${sla.breached && byId(project.statuses, issue.statusId)?.category !== 'done' ? ' bad' : ''}">${L('기한', 'Limit')} ${esc(formatWhen(new Date(sla.due).toISOString()))} · ${sla.hours}h</p>` : ''}
    <div class="wrap">${moves}</div>
    ${prop(L('상태', 'Status'), `<select data-field="statusId">${options(project.statuses, issue.statusId)}</select>`)}
    ${prop(L('해결', 'Resolution'), `<select data-field="resolutionId">${options(project.resolutions, issue.resolutionId, L('없음', 'None'))}</select>`)}
    ${prop(L('우선순위', 'Priority'), `<select data-field="priorityId">${options(project.priorities, issue.priorityId)}</select>`)}
    ${prop(L('담당', 'Assignee'), `<select data-field="assigneeId">${userOptions(ctx.ws, issue.assigneeId)}</select>`)}
    ${prop(L('보고자', 'Reporter'), `<select data-field="reporterId">${userOptions(ctx.ws, issue.reporterId, '')}</select>`)}`)}
    ${box('issue-plan', 'backlog', L('계획', 'Planning'), `
    ${prop(L('에픽', 'Epic'), `<select data-field="epicId">${options(project.issues.filter((item) => item.typeId === 'epic'), issue.epicId, L('없음', 'None'))}</select>`)}
    ${prop(L('스프린트', 'Sprint'), `<select data-field="sprintId">${options(project.sprints.filter((sprint) => sprint.state !== 'closed' || sprint.id === issue.sprintId), issue.sprintId, L('없음', 'None'))}</select>`)}
    ${prop(L('포인트', 'Points'), `<input data-field="storyPoints" data-parse="number" value="${issue.storyPoints ?? ''}">`)}
    ${prop(L('추정', 'Estimate'), `<input data-field="originalEstimate" data-parse="duration" value="${esc(dur(issue.originalEstimate))}">`)}
    ${prop(L('남음', 'Remaining'), `<input data-field="remainingEstimate" data-parse="duration" value="${esc(dur(issue.remainingEstimate))}">`)}
    ${prop(L('기록', 'Logged'), `<span>${esc(dur(issue.timeSpent))}</span>`)}`)}
    ${box('issue-dates', 'calendar', L('날짜와 라벨', 'Dates and labels'), `
    ${prop(L('시작', 'Start'), `<input type="date" data-field="start" data-parse="date" value="${esc(dateInputValue(issue.start))}">`)}
    ${prop(L('기한', 'Due'), `<input type="date" data-field="due" data-parse="date" value="${esc(dateInputValue(issue.due))}">`)}
    ${prop(L('라벨', 'Labels'), `<input data-field="labels" data-parse="labels" value="${esc((issue.labels || []).join(', '))}">`)}
    ${prop(L('환경', 'Environment'), `<input data-field="environment" data-live value="${esc(issue.environment || '')}">`)}`)}
    ${box('issue-components', 'component', L('구성 요소', 'Components'), `<div class="checks">${checks(project.components, 'componentIds') || `<p class="muted">${L('구성 요소가 없습니다.', 'There are no components.')}</p>`}</div>`, (issue.componentIds || []).length)}
    ${box('issue-versions', 'release', L('수정 버전', 'Fix versions'), `<div class="checks">${checks(project.versions, 'fixVersionIds') || `<p class="muted">${L('버전이 없습니다.', 'There are no versions.')}</p>`}</div>`, (issue.fixVersionIds || []).length)}
    ${custom ? box('issue-fields', 'tag', L('사용자 정의 필드', 'Custom fields'), custom) : ''}
    ${box('issue-watchers', 'eye', L('관찰', 'Watchers'), `<div class="avatars">${(issue.watchers || []).map((id) => avatar(person(ctx.ws, id))).join('')}</div>
    <button type="button" class="small-button" data-action="toggle-watch">${icon('eye')}<span>${watching ? L('관찰 그만', 'Stop watching') : L('관찰', 'Watch')}</span></button>`, (issue.watchers || []).length)}
    ${box('issue-files', 'paperclip', L('첨부', 'Attachments'), `${(issue.attachments || []).map((file) => `<div class="link-row"><a class="file-link" href="${esc(file.data)}" data-file="${esc(file.id)}" data-name="${esc(file.name)}" download="${esc(file.name)}">${esc(file.name)}</a><button type="button" class="icon-button" data-action="remove-attachment" data-id="${esc(file.id)}">${icon('trash')}</button></div>`).join('')}
    <button type="button" class="small-button" data-action="pick-attachment">${icon('paperclip')}<span>${L('파일 추가', 'Add a file')}</span></button>`, (issue.attachments || []).length)}
    ${box('issue-actions', 'settings', L('이슈 작업', 'Issue actions'), `<div class="page-actions"><button type="button" class="button" data-action="clone-issue">${icon('copy')}<span>${L('복제', 'Clone')}</span></button><button type="button" class="button danger" data-action="delete-issue">${icon('trash')}<span>${L('삭제', 'Delete')}</span></button></div>`)}
  </div>`;
}

function prop(label, control) {
  return `<label class="prop"><span>${label}</span>${control}</label>`;
}

function feed(ctx, count) {
  const find = screenFind(ctx);
  return (ctx.project?.activity || []).filter((item) => {
    const issue = findIssue(ctx.project, item.issueId);
    if (issue && !issueVisible(ctx, issue)) return false;
    return matchesText(find.q, activityText(ctx, item), item.issueKey);
  }).slice(0, count).map((item) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(item.issueId || '')}">${icon('clock')}<span>${esc(activityText(ctx, item))}</span><small>${esc(formatWhen(item.at))}</small></button>`).join('') || empty(L('활동이 없습니다.', 'There is no activity.'));
}

function activityText(ctx, item) {
  const who = person(ctx.ws, item.actorId)?.name || '';
  const key = item.issueKey || (ctx.project ? findIssue(ctx.project, item.issueId)?.key : '') || '';
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
  if (item.kind === 'mention') return item.where === 'comment'
    ? L(`${who} 님이 「${key}」 페이지의 댓글에서 회원님을 언급했습니다`, `${who} mentioned you in a comment on ${key}`)
    : L(`${who} 님이 「${key}」 페이지에서 회원님을 언급했습니다`, `${who} mentioned you on the page ${key}`);
  if (item.kind === 'page-comment') return L(`${who} 님이 「${key}」 페이지에 의견을 남겼습니다`, `${who} commented on the page ${key}`);
  if (item.kind === 'document') return L(`${who} 님이 「${key}」 문서를 고쳤습니다`, `${who} updated the document ${key}`);
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
