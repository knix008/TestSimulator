import { getLanguage } from '../i18n.js';
import { CUSTOM_KEYS, DARK_THEMES, LIGHT_THEMES, themeName } from '../themes.js';
import { PROJECT_TYPES, ROLES } from '../domain/catalog.js';
import { allowed, isWorkspaceAdmin, orderedProjects, participantAccess, participatingProjects, projectAncestors, sharesTeam } from '../domain/permissions.js';
import { createFields, moduleOn } from '../domain/services.js';
import { avatar, button, esc, foldBox, icon, L, nameOf, NAV_GLYPH, options, panelFrame, primary, typeBadge, userOptions } from './bits.js';
import { shortcutGroups } from './shortcuts.js';
import { ACCESS, canManageTeam, isTeamMember, projectViews, teamOfProject, teamsOf, visibleSpaces, DEFAULT_METHODS } from '../domain/teams.js';
import { canEditPage, pagesIn } from '../domain/wiki.js';
import { spaceOpen, workspacePageTree } from './extra.js';
import { templatePicker } from './templates.js';
import { methodChecks } from './teams.js';
import { databaseSettings } from './start.js';

function item(action, glyph, label, extra = '', keys = '') {
  return `<button type="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span>${keys ? `<kbd>${keys}</kbd>` : ''}</button>`;
}

/**
 * The sign-in form. `layout: 'row'` (the start page) puts ID, Password and the button on one line;
 * `layout: 'stack'` (the sign-in window) lines the labels up in one column with the button below.
 */
export function loginForm(ctx, ids = {}) {
  const account = ctx.ui.loginAccount || '';
  const accountId = ids.account || 'login-account';
  const passwordId = ids.password || 'login-password';
  const layout = ids.layout === 'stack' ? 'stack' : 'row';
  const busy = ctx.ui.connecting;
  const reveal = `<label class="check password-reveal"><input type="checkbox" data-reveal="password">${icon('eye')}<span>${L('비밀번호 표시', 'Show password')}</span></label>`;
  // Why the last sign-in failed, or how long a locked account waits; app.js writes it in place.
  return `<form class="login-form login-${layout}" data-login>
    <p class="login-error" role="alert" aria-live="assertive" hidden></p>
    <div class="login-grid">
      <label class="login-field" for="${accountId}"><span class="login-label">${icon('idCard')}<span>ID</span></span><input id="${accountId}" name="account" value="${esc(account)}" autocomplete="username" spellcheck="false" autocapitalize="off"></label>
      <label class="login-field" for="${passwordId}"><span class="login-label">${icon('key')}<span>Password</span></span><input id="${passwordId}" name="password" type="password" autocomplete="current-password"></label>
      ${layout === 'stack' ? reveal : ''}
      <button type="submit" class="login-submit" ${busy ? 'disabled' : ''}>${icon(busy ? 'clock' : 'login')}<span>${busy ? L('확인 중…', 'Checking…') : L('로그인', 'Sign in')}</span></button>
    </div>
    ${layout === 'stack' ? '' : reveal}
  </form>`;
}

function menu(ctx, id, label, glyph, body, extra = '') {
  return `<div class="menu${extra}${ctx.ui.menu === id ? ' open' : ''}"><button type="button" class="menubar-item" data-menu="${id}">${icon(glyph)}<span>${label}</span></button><div class="menu-pop" role="menu">${body}</div></div>`;
}

function closeButton(action = 'modal-cancel') {
  const label = esc(L('닫기', 'Close'));
  return `<button type="button" class="icon-button popup-close" data-action="${action}" title="${label}" aria-label="${label}">${icon('close')}</button>`;
}

function heading(glyph, title) {
  return `<h2>${icon(glyph)}<span class="grow">${title}</span>${closeButton()}</h2>`;
}

export function renderMenubar(ctx) {
  const project = ctx.project;
  const dirty = ctx.ui.dirty ? ' dirty' : '';
  const name = project ? esc(project.name) : '';
  const recent = (ctx.settings.recent || []).map((path) => item('open-recent', 'folder', esc(path.split(/[/\\]/).pop()), `data-path="${esc(path)}"`)).join('');
  const file = [
    item('new-project', 'plus', L('새 과제', 'New project'), '', 'Ctrl+Shift+N'),
    item('open-file', 'folder', L('열기', 'Open'), '', 'Ctrl+O'),
    item('save-file', 'save', L('저장', 'Save'), '', 'Ctrl+S'),
    item('save-as', 'save', L('다른 이름으로 저장', 'Save as'), '', 'Ctrl+Shift+S'),
    '<div class="sep"></div>',
    item('export-md', 'download', L('Markdown로 내보내기', 'Export Markdown')),
    item('export-csv', 'download', L('CSV로 내보내기', 'Export CSV')),
    item('export-project', 'download', L('이 과제만 내보내기', 'Export this project')),
    recent ? `<div class="sep"></div>${recent}` : '',
    '<div class="sep"></div>',
    item('print', 'printer', L('인쇄', 'Print'), '', 'Ctrl+P'),
    ctx.ui.loginUser ? '<div class="sep"></div>' : '',
    ctx.ui.loginUser ? item('change-password', 'key', L('암호 바꾸기', 'Change password')) : '',
    ctx.ui.loginUser ? item('sign-out', 'logout', L('로그아웃', 'Sign out')) : '',
  ].join('');
  const edit = [
    item('undo', 'undo', L('실행 취소', 'Undo'), '', 'Ctrl+Z'),
    item('redo', 'redo', L('다시 실행', 'Redo'), '', 'Ctrl+Y'),
    item('focus-search', 'search', L('검색', 'Find'), '', 'Ctrl+F'),
    item('open-search', 'search', L('전체 검색', 'Search everything'), '', 'Ctrl+Shift+F'),
  ].join('');
  const viewGlyph = { home: 'home', board: 'board', backlog: 'backlog', issues: 'issues', dashboard: 'dashboard', reports: 'chart', documents: 'file', help: 'help' };
  const viewKeys = { home: 'Ctrl+1', board: 'Ctrl+2', backlog: 'Ctrl+3', issues: 'Ctrl+5', dashboard: 'Ctrl+6', reports: 'Ctrl+7', documents: 'Ctrl+9' };
  const view = Object.keys(viewGlyph).map((id) => item('go', viewGlyph[id], esc(navLabel(id)), `data-view="${id}"`, viewKeys[id] || '')).join('');
  const issue = [
    item('new-issue', 'plus', L('새 이슈', 'New issue'), '', 'Ctrl+N'),
    item('create-subtask', 'subtask', L('하위 작업', 'Sub-task'), '', 'Ctrl+Shift+T'),
    item('clone-issue', 'copy', L('복제', 'Clone'), '', 'Ctrl+D'),
    item('delete-issue', 'trash', L('삭제', 'Delete'), '', 'Delete'),
  ].join('');
  const plan = [
    item('go', 'backlog', L('백로그', 'Backlog'), 'data-view="backlog"', 'Ctrl+3'),
    item('go', 'board', L('보드', 'Board'), 'data-view="board"', 'Ctrl+2'),
    item('new-sprint', 'play', L('스프린트 만들기', 'New sprint'), '', 'Ctrl+Shift+P'),
    item('go', 'roadmap', L('로드맵', 'Roadmap'), 'data-view="roadmap"', 'Ctrl+4'),
  ].join('');
  const help = [
    item('open-talk', 'comment', L('대화', 'Talk'), '', ''),
    item('open-guide', 'book', L('사용 설명서', "User's guide"), 'data-id="guide"', 'F1'),
    item('open-guide', 'play', L('튜토리얼 문서', 'Tutorial document'), 'data-id="tutorial"'),
    item('open-guide', 'filter', L('WQL 설명서', 'WQL guide'), 'data-id="wql"'),
    item('shortcuts', 'bolt', L('단축키', 'Shortcuts'), '', '?'),
    item('about', 'info', L('정보', 'About'), '', 'Ctrl+Shift+A'),
  ].join('');
  const leftOpen = ctx.settings?.showLeftPanel !== false;
  const rightOpen = ctx.settings?.showRightPanel !== false;
  const panelToggle = (id, glyph, open, ko, en, keys) => `<button type="button" class="window-button panel-toggle${open ? ' active' : ''}" data-action="toggle-panel" data-id="${id}" title="${esc(`${L(ko, en)} · ${keys}`)}" aria-label="${esc(L(ko, en))}" aria-pressed="${open ? 'true' : 'false'}">${icon(glyph)}</button>`;
  const panels = ctx.ui.ready ? `<span class="panel-toggles">${panelToggle('left', 'panelLeft', leftOpen, '왼쪽 패널', 'Left panel', 'Ctrl+Shift+1')}${panelToggle('right', 'panelRight', rightOpen, '오른쪽 패널', 'Right panel', 'Ctrl+Shift+2')}</span>` : '';
  const controls = ctx.desktop ? `<div class="window-controls">${panels}
      <button type="button" class="window-button" data-window="minimize" title="${esc(L('최소화', 'Minimize'))}">${icon('minus')}</button>
      <button type="button" class="window-button" data-window="maximize" title="${esc(L('최대화', 'Maximize'))}">${icon(ctx.ui.maximized ? 'restore' : 'square')}</button>
      <button type="button" class="window-button close" data-window="close" title="${esc(L('닫기', 'Close'))}">${icon('close')}</button>
    </div>` : (panels ? `<div class="window-controls">${panels}</div>` : '');
  const homeOn = !ctx.ui.ready;
  const signedIn = Boolean(ctx.ui.loginUser);
  const administrator = isWorkspaceAdmin(ctx.user) && ctx.ui.ready ? [
    item('go', 'people', L('사용자', 'Users'), 'data-view="users"'),
    item('go', 'team', L('팀', 'Teams'), 'data-view="teams"'),
    item('go', 'folder', L('과제', 'Projects'), 'data-view="projects"'),
    item('go', 'settings', L('설정', 'Settings'), 'data-view="settings"'),
    item('go', 'database', L('데이터베이스', 'Database'), 'data-view="settings"'),
    item('go', 'bolt', L('확장', 'Extensions'), 'data-view="extensions"'),
    item('go', 'list', L('감사 로그', 'Audit log'), 'data-view="audit"'),
  ].join('') : '';
  return `<div class="app-brand" data-window-drag><img class="app-brand-icon" src="./icon.png" alt="" data-window-drag><span class="app-brand-name" data-window-drag>MyWorkForce</span><span class="app-brand-version" data-window-drag>v${esc(ctx.version)}</span></div>
    <button type="button" class="menubar-item menubar-home${homeOn ? ' current' : ''}" data-action="menubar-home" aria-pressed="${homeOn ? 'true' : 'false'}" ${signedIn ? '' : 'disabled'} title="${esc(signedIn ? L('시작 화면을 열고, 다시 누르면 작업 공간으로 돌아갑니다.', 'Opens the start page. Press again to return to the workspace.') : L('로그인한 뒤에 시작 화면과 작업 공간을 오갈 수 있습니다.', 'Sign in before switching between the start page and the workspace.'))} Ctrl+Shift+H">${icon('spark')}<span>${L('시작', 'Start')}</span></button>
    <span class="menubar-cluster">
    ${menu(ctx, 'file', L('파일', 'File'), 'folder', file)}
    ${menu(ctx, 'edit', L('편집', 'Edit'), 'pencil', edit)}
    ${menu(ctx, 'view', L('보기', 'View'), 'eye', view)}
    ${menu(ctx, 'issue', L('이슈', 'Issue'), 'issues', issue)}
    ${menu(ctx, 'plan', L('계획', 'Plan'), 'roadmap', plan)}
    ${menu(ctx, 'help', L('도움말', 'Help'), 'help', help)}
    </span>
    ${administrator ? `<span class="menubar-split"></span>${menu(ctx, 'admin', L('관리자', 'Administrator'), 'settings', administrator, ' menu-admin')}` : ''}
    <span class="app-brand-project${dirty}${project ? '' : ' empty'}" data-window-drag data-action="open-current-project" role="button" tabindex="0" title="${esc(project ? L('이 과제의 보드로 이동합니다.', 'Open this project.') : L('과제 홈으로 이동합니다.', 'Open Project home.'))}"><span class="app-brand-project-name" data-window-drag>${name || esc(L('과제 없음', 'No project'))}</span><span class="app-brand-dirty" data-window-drag>●</span></span>
    <div class="menubar-drag" data-window-drag></div>${controls}`;
}

function navLabel(id) {
  const names = {
    home: L('과제 홈', 'Project home'), board: L('보드', 'Board'), backlog: L('백로그', 'Backlog'), roadmap: L('로드맵', 'Roadmap'),
    issues: L('이슈', 'Issues'), queues: L('대기열', 'Queues'), dashboard: L('대시보드', 'Dashboard'), reports: L('보고서', 'Reports'),
    releases: L('릴리스', 'Releases'), components: L('구성 요소', 'Components'), filters: L('필터', 'Filters'), people: L('사람', 'People'),
    health: L('점검', 'Health'), notifications: L('알림', 'Notifications'), settings: L('설정', 'Settings'), help: L('도움말', 'Help'),
    knowledge: L('작업 공간', 'Workspaces'), documents: L('문서', 'Documents'), calendar: L('근무 달력', 'Work calendar'), portal: L('고객 포털', 'Customer portal'),
    users: L('사용자', 'Users'), projects: L('과제', 'Projects'), 'project-settings': L('과제 설정', 'Project settings'),
    plans: L('교차 계획', 'Plan'), extensions: L('확장', 'Extensions'), audit: L('감사 로그', 'Audit log'), teams: L('팀', 'Teams'), team: L('팀', 'Team'),
    search: L('전체 검색', 'Search everything'),
    timeline: L('타임라인', 'Timeline'),
  };
  return names[id] || id;
}

const COLOR_LABEL = {
  bg: ['배경', 'Background'], surface: ['표면', 'Surface'], panel: ['패널', 'Panel'], text: ['글자', 'Text'],
  muted: ['흐린 글자', 'Muted'], border: ['테두리', 'Border'], accent: ['강조', 'Accent'], accentText: ['강조 글자', 'Accent text'],
  gridAlt: ['격자', 'Grid'], chart: ['차트', 'Chart'], toolbar: ['도구 막대', 'Toolbar'], status: ['상태 막대', 'Status bar'],
};

function themeChoice(id, active) {
  const language = getLanguage();
  const name = themeName(id, language);
  const mark = active ? icon('check') : '';
  if (id === 'system' || id === 'custom') {
    return `<button type="button" class="theme-choice${active ? ' active' : ''}" data-action="pick-theme" data-id="${id}">${icon(id === 'custom' ? 'palette' : 'sun')}<span>${esc(name)}</span>${mark}</button>`;
  }
  const theme = [...LIGHT_THEMES, ...DARK_THEMES].find((item) => item.id === id);
  const [bg, surface, accent] = theme?.swatch || ['#ccc', '#eee', '#36c'];
  return `<button type="button" class="theme-choice${active ? ' active' : ''}" data-action="pick-theme" data-id="${esc(id)}" title="${esc(name)}"><span class="theme-swatch"><i style="background:${bg}"></i><i style="background:${surface}"></i><i style="background:${accent}"></i></span><span>${esc(name)}</span>${mark}</button>`;
}

function themePopover(ctx) {
  const current = ctx.settings.theme;
  if (ctx.ui.popover === 'theme-custom') {
    const custom = ctx.settings.customTheme || {};
    const colors = CUSTOM_KEYS.map((key) => `<label class="color-row"><span>${icon('palette')}${esc(L(COLOR_LABEL[key][0], COLOR_LABEL[key][1]))}</span><input type="color" data-custom-color="${esc(key)}" value="${esc(custom[key] || '#888888')}" aria-label="${esc(L(COLOR_LABEL[key][0], COLOR_LABEL[key][1]))}"></label>`).join('');
    return `<div class="popover theme-pop">
      <div class="popup-bar"><b>${icon('palette')}<span>${L('사용자 정의 테마 설정', 'Custom theme settings')}</span></b>${closeButton('theme-menu')}</div>
      <label class="check"><input type="checkbox" data-custom-dark ${custom.dark ? 'checked' : ''}>${L('어두운 테마', 'Dark theme')}</label>
      <div class="color-grid">${colors}</div>
      <div class="theme-foot"><button type="button" class="button" data-action="theme-menu" data-id="list">${icon('sun')}<span>${L('테마 목록', 'Theme list')}</span></button></div>
    </div>`;
  }
  if (ctx.ui.popover !== 'theme') return '';
  const column = (glyph, title, list) => `<div class="picker-column"><h3>${icon(glyph)}<span>${title}</span></h3>${list.map((theme) => themeChoice(theme.id, current === theme.id)).join('')}</div>`;
  return `<div class="popover theme-pop">
    <div class="popup-bar"><b>${icon('palette')}<span>${L('테마', 'Theme')}</span></b>${closeButton('theme-menu')}</div>
    <div class="picker-top">${themeChoice('system', current === 'system')}${themeChoice('custom', current === 'custom')}</div>
    <div class="picker-columns">${column('sun', L('라이트', 'Light'), LIGHT_THEMES)}${column('moon', L('다크', 'Dark'), DARK_THEMES)}</div>
    <div class="theme-foot">
      <button type="button" class="button" data-action="pick-theme" data-id="custom">${icon('palette')}<span>${L('사용자 정의 테마', 'Custom theme')}</span></button>
      <button type="button" class="button" data-action="edit-custom-theme">${icon('settings')}<span>${L('사용자 정의 테마 설정', 'Custom theme settings')}</span></button>
    </div>
  </div>`;
}

export function renderToolbar(ctx) {
  const projects = orderedProjects(ctx.ws).map((project) => {
    const depth = projectAncestors(ctx.ws, project).length;
    return { id: project.id, name: `${depth ? '– '.repeat(depth) : ''}${project.key} · ${project.name}` };
  });
  const unread = (ctx.project ? ctx.project.notifications.filter((item) => item.userId === ctx.user?.id && !item.read).length : 0)
    + (ctx.ws.inbox || []).filter((item) => item.userId === ctx.user?.id && !item.read).length;
  const currentName = themeName(ctx.settings.theme, getLanguage());
  return `<div class="toolbar-inner">
      <select data-choose="project" title="${esc(L('과제', 'Project'))}">${options(projects, ctx.ws.activeProjectId, L('과제 없음', 'No project'))}</select>
      <label class="quick-search" title="Ctrl+F">${icon('search')}<input id="quick-search" value="${esc(ctx.ui.quick || '')}" placeholder="${esc(L('검색 또는 WQL', 'Search or WQL'))}"></label>
      <button type="button" class="tool-button${ctx.ui.view === 'search' ? ' active' : ''}" data-action="open-search" title="${esc(L('전체 검색', 'Search everything'))} · Ctrl+Shift+F" aria-label="${esc(L('전체 검색', 'Search everything'))}">${icon('search')}</button>
      <button type="button" class="tool-button" data-action="command-palette" title="${esc(L('이동', 'Go to'))} · Ctrl+K" aria-label="${esc(L('이동', 'Go to'))}">${icon('bolt')}</button>
      <span class="tool-sep"></span>
      <button type="button" class="tool-button" data-action="new-issue" title="${esc(L('새 이슈', 'New issue'))} · Ctrl+N" aria-label="${esc(L('새 이슈', 'New issue'))}">${icon('plus')}</button>
      <span class="grow"></span>
      <button type="button" class="tool-button" data-action="go" data-view="notifications" title="${esc(L('알림', 'Notifications'))}" aria-label="${esc(L('알림', 'Notifications'))}">${icon('bell')}${unread ? `<i class="dot">${unread}</i>` : ''}</button>
      <button type="button" class="tool-button" data-action="open-talk" title="${esc(L('대화 프로그램 열기', 'Open Talk'))}" aria-label="${esc(L('대화', 'Talk'))}">${icon('comment')}</button>
      <span class="signed-in" title="${esc(`${L('로그인한 사람', 'Signed in')}: ${ctx.user?.name || ''}${ctx.user?.login ? ` (${ctx.user.login})` : ''}`)}">${ctx.user ? avatar(ctx.user) : ''}</span>
      <button type="button" class="tool-button" data-action="sign-out" title="${esc(L('로그아웃', 'Sign out'))}" aria-label="${esc(L('로그아웃', 'Sign out'))}">${icon('logout')}</button>
      <button type="button" class="tool-button" data-action="language" title="${esc(L('언어: 한국어 → English', 'Language: English → 한국어'))} · Ctrl+Shift+L" aria-label="${esc(L('언어', 'Language'))}">${icon('globe')}</button>
      <span class="theme-anchor theme-split">
        <button type="button" class="tool-button" data-action="theme-random" title="${esc(L('테마 바꾸기', 'Change the theme'))} · ${esc(currentName)} · Ctrl+Shift+B" aria-label="${esc(L('테마 바꾸기', 'Change the theme'))}">${icon('palette')}</button>
        <button type="button" class="tool-button split-arrow" data-action="theme-menu" title="${esc(L('테마 설정', 'Theme settings'))}" aria-label="${esc(L('테마 설정', 'Theme settings'))}" aria-haspopup="true" aria-expanded="${ctx.ui.popover === 'theme' || ctx.ui.popover === 'theme-custom' ? 'true' : 'false'}">${icon('chevronDown')}</button>
        ${themePopover(ctx)}
      </span>
      <button type="button" class="tool-button" data-action="about" title="${esc(L('프로그램 정보', 'About'))} · Ctrl+Shift+A" aria-label="${esc(L('프로그램 정보', 'About'))}">${icon('info')}</button>
    </div>`;
}

/** A project's screens, in this order; projectViews() keeps the ones its management methods use. */
const PROJECT_NAV = ['home', 'issues', 'board', 'backlog', 'roadmap', 'timeline', 'queues', 'portal', 'releases', 'components', 'filters', 'dashboard', 'reports', 'health', 'project-settings'];
const GATED = { knowledge: 'knowledge', documents: 'documents', calendar: 'calendar', portal: 'portal', plans: 'plans' };

function navButtons(ctx, items) {
  return items.filter((id) => {
    if (id === 'project-settings' && !allowed(ctx.ws, ctx.project, ctx.user?.id, 'admin')) return false;
    return !GATED[id] || moduleOn(ctx.ws, GATED[id]);
  }).map((id) => {
    const glyph = NAV_GLYPH[id];
    return `<button type="button" class="nav-button${ctx.ui.view === id ? ' active' : ''}" data-action="go" data-view="${id}">${icon(glyph)}<span>${esc(navLabel(id))}</span></button>`;
  }).join('');
}

function projectNav(ctx) {
  const mine = participatingProjects(ctx.ws, ctx.user?.id);
  const visible = new Set(mine.map((project) => project.id));
  const rows = mine.map((project) => {
    const depth = projectAncestors(ctx.ws, project).filter((ancestor) => visible.has(ancestor.id)).length;
    const current = project.id === ctx.ws.activeProjectId;
    const archived = project.archived ? ` · ${L('보관', 'Archived')}` : '';
    return `<button type="button" class="nav-button nav-project${current ? ' active' : ''}" data-action="activate" data-id="${esc(project.id)}" style="padding-left:${8 + depth * 14}px" title="${esc(`${project.key} · ${project.name}`)}">${icon('folder')}<span><small>${esc(project.key)}</small> ${esc(project.name)}${esc(archived)}</span></button>`;
  }).join('');
  const empty = `<p class="muted nav-empty">${L('참여 중인 과제가 없습니다.', 'You are not in a project yet.')}</p>`;
  return `<div class="nav-section">${icon('folder')}${L('참여 과제', 'My projects')}</div>${rows || empty}`;
}

function teamNav(ctx) {
  const mine = teamsOf(ctx.ws, ctx.user?.id).filter((team) => isTeamMember(team, ctx.user?.id) || isWorkspaceAdmin(ctx.user));
  if (!mine.length) return '';
  const rows = mine.map((team) => {
    const current = ctx.ui.view === 'team' && ctx.ui.teamId === team.id;
    return `<button type="button" class="nav-button${current ? ' active' : ''}" data-action="open-team" data-id="${esc(team.id)}" title="${esc(team.name)}">${icon('team')}<span>${esc(team.name)}</span></button>`;
  }).join('');
  return `<div class="nav-section">${icon('team')}${L('내 팀', 'My teams')}</div>${rows}`;
}

/** The open project's screens: only those its management methods bring. */
function currentProjectNav(ctx) {
  const project = ctx.project;
  if (!project) return `<p class="muted nav-empty">${L('열린 과제가 없습니다.', 'No project is open.')}</p>${navButtons(ctx, ['home'])}`;
  const views = projectViews(project);
  const items = PROJECT_NAV.filter((id) => id === 'project-settings' || views.has(id));
  return `<p class="nav-project-name" title="${esc(project.name)}">${esc(project.name)}</p>${navButtons(ctx, items)}`;
}

/**
 * The workspaces section: each workspace folds open to its pages (and their child pages); a new workspace
 * is made here by typing its name.
 */
function workspaceNav(ctx) {
  const order = { company: 0, team: 1, project: 2 };
  const spaces = visibleSpaces(ctx.ws, ctx.user.id).slice().sort((a, b) => (order[a.scope || 'company'] ?? 0) - (order[b.scope || 'company'] ?? 0));
  const onPages = ctx.ui.view === 'knowledge';
  const openPage = onPages ? ctx.ui.articleId : '';
  const rows = spaces.map((space) => {
    const open = spaceOpen(ctx, space, onPages ? ctx.ui.spaceId : '');
    const active = onPages && ctx.ui.spaceId === space.id && !ctx.ui.articleId;
    const count = pagesIn(ctx.ws, space.id, ctx.user.id).length;
    const mark = ([...String(space.name || space.key || '?').trim()][0] || '?').toUpperCase();
    const row = `<div class="nav-sub${active ? ' active' : ''}${onPages && ctx.ui.spaceId === space.id ? ' current' : ''}">
      <button type="button" class="nav-sub-caret" data-action="toggle-workspace" data-id="${esc(space.id)}" aria-expanded="${open ? 'true' : 'false'}" title="${esc(open ? L('접기', 'Collapse') : L('펼치기', 'Expand'))}">${icon(open ? 'chevronDown' : 'chevronRight')}</button>
      <button type="button" class="nav-sub-open" data-action="open-workspace" data-id="${esc(space.id)}" title="${esc(space.name)}"><span class="ws-badge">${esc(mark)}</span><span class="nav-sub-name">${esc(space.name)}</span><small>${count}</small></button>
      <button type="button" class="nav-sub-add" data-action="add-page" data-space="${esc(space.id)}" title="${esc(L('이 작업 공간에 새 페이지', 'New page in this workspace'))}" aria-label="${esc(L('새 페이지', 'New page'))}">${icon('plus')}</button>
    </div>`;
    return row + (open ? `<div class="nav-ws-tree">${workspacePageTree(ctx, space, openPage)}</div>` : '');
  }).join('');
  const create = ctx.ui.wsCreating
    ? `<div class="nav-ws-create"><input id="nav-ws-name" value="${esc(ctx.ui.wsDraft || '')}" placeholder="${esc(L('새 작업 공간 이름', 'New workspace name'))}" aria-label="${esc(L('새 작업 공간 이름', 'New workspace name'))}" maxlength="60"><button type="button" class="nav-sub-add shown" data-action="create-workspace" title="${esc(L('만들기 (Enter)', 'Create (Enter)'))}" aria-label="${esc(L('만들기', 'Create'))}">${icon('check')}</button><button type="button" class="nav-sub-add shown" data-action="ws-create-cancel" title="${esc(L('취소 (Esc)', 'Cancel (Esc)'))}" aria-label="${esc(L('취소', 'Cancel'))}">${icon('close')}</button></div>`
    : `<button type="button" class="nav-sub-new" data-action="ws-create-start">${icon('plus')}<span>${L('새 작업 공간', 'New workspace')}</span></button>`;
  return `<div class="nav-subs">${rows}${create}</div>`;
}

/** One section of the navigation: a title that folds it, an optional count and button, and its contents. */
function navSection(ctx, id, glyph, title, body, { count = null, extra = '', tone = '' } = {}) {
  return foldBox(ctx, 'nav', id, `${icon(glyph)}<span>${title}</span>${count != null ? `<small class="nav-count">${count}</small>` : ''}`, body, { extra, tone });
}

export function renderNav(ctx) {
  const admin = isWorkspaceAdmin(ctx.user);
  const sections = [];
  sections.push(navSection(ctx, 'company', 'globe', esc(L('회사', 'Company')), navButtons(ctx, ['teams', 'projects', 'documents', 'calendar', 'plans'])));
  if (moduleOn(ctx.ws, 'knowledge') && ctx.user) {
    const spaces = visibleSpaces(ctx.ws, ctx.user.id);
    const add = `<button type="button" class="nav-sect-add" data-action="ws-create-start" title="${esc(L('새 작업 공간', 'New workspace'))}" aria-label="${esc(L('새 작업 공간', 'New workspace'))}">${icon('plus')}</button>`;
    sections.push(navSection(ctx, 'spaces', 'layers', esc(L('작업 공간', 'Workspaces')), workspaceNav(ctx), { count: spaces.length, extra: add, tone: ctx.ui.view === 'knowledge' ? 'current' : '' }));
  }
  sections.push(navSection(ctx, 'work', 'user', esc(L('내 작업', 'My work')), `${teamNav(ctx)}${projectNav(ctx)}`));
  const project = ctx.project;
  const projectTitle = project ? `${esc(L('이 과제', 'This project'))} <b class="nav-key">${esc(project.key)}</b>` : esc(L('이 과제', 'This project'));
  sections.push(navSection(ctx, 'project', 'folder', projectTitle, currentProjectNav(ctx)));
  if (admin) sections.push(navSection(ctx, 'admin', 'settings', esc(L('관리자 메뉴', 'Administrator menu')), navButtons(ctx, ['users', 'settings', 'extensions', 'audit']), { tone: 'admin' }));
  const body = sections.join('');
  return panelFrame(ctx.settings.showLeftPanel !== false, 'left', 'list', L('탐색', 'Navigation'), `<div class="panel-body">${body}</div>`);
}

export function renderStatus(ctx) {
  const project = ctx.project;
  const count = project ? project.issues.length : 0;
  const hint = ctx.ui.queryError ? L('질의 문법을 확인하세요.', 'Check the query syntax.') : (project ? L(`${count}개 이슈`, `${count} issues`) : L('과제를 여세요.', 'Open a project.'));
  const where = ctx.ui.connection?.engine || (ctx.ui.path ? ctx.ui.path.split(/[/\\]/).pop() : L('데이터베이스에 연결', 'Connect a database'));
  return `<span>${hint}</span><span class="grow"></span><span>${esc(project ? `${project.key} · ${nameOf(PROJECT_TYPES.find((type) => type.id === project.type))}` : '')}</span><span class="tool-sep"></span><span>${ctx.user ? avatar(ctx.user) : ''}${esc(ctx.user?.name || '')}</span><span>${esc(where)}</span>`;
}

function aboutDialog(ctx) {
  const info = ctx.ui.about || {};
  const version = info.version || ctx.version || '';
  const parsed = info.buildDate ? new Date(info.buildDate) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(getLanguage() === 'en' ? 'en' : 'ko') : '-';
  const runtime = info.web ? L('웹 (브라우저)', 'Web (browser)') : `Tauri ${info.tauri || '-'} · ${info.rustc || '-'}`;
  const rows = [
    ['info', L('버전', 'Version'), version || '-'],
    ['clock', L('빌드 날짜', 'Build date'), date],
    ['link', L('커밋', 'Commit'), info.commit || '-'],
    ['layers', L('대상', 'Target'), info.target || '-'],
    ['settings', L('빌드 종류', 'Profile'), info.profile || '-'],
    ['bolt', L('런타임', 'Runtime'), runtime],
    ['globe', L('플랫폼', 'Platform'), `${info.os || '-'} / ${info.arch || '-'}`],
    ['user', L('제작자', 'Author'), 'SHKWON (knix008@naver.com)'],
  ];
  const table = rows.map(([glyph, label, value]) => `<dt title="${esc(label)}">${icon(glyph)}<span>${esc(label)}</span></dt><dd title="${esc(value)}">${esc(value)}</dd>`).join('');
  const description = L(
    '과제와 이슈, 스프린트, 백로그, 로드맵, 대기열, 작업 달력, 지식, 문서, 보고서, 대시보드를 한 작업 공간에서 다룹니다. 이슈는 WQL로 고르고, 보드에서 상태를 옮기며, 권한과 작업 흐름, 자동화, 승인을 설정합니다. 문서는 회의록부터 릴리스 노트까지 양식으로 만들고, 지식은 공간과 페이지 트리로 정리합니다. 데이터베이스는 SQLite를 기본으로 하고 MySQL, MariaDB, SQL Server, PostgreSQL에 연결합니다. Windows, macOS, Linux, 웹에서 실행됩니다.',
    'Projects, issues, sprints, the backlog, the roadmap, queues, the work calendar, knowledge, documents, reports and dashboards live in one workspace. WQL picks issues, the board moves their status, and permissions, workflow, automation and approvals are configured here. Documents start from forms such as meeting notes and release notes. Knowledge is organized in spaces and a page tree. The database is a SQLite file by default and connects to MySQL, MariaDB, SQL Server or PostgreSQL. It runs on Windows, macOS, Linux and the web.',
  );
  return `<div class="modal-back"><div class="modal about">${heading('info', L('프로그램 정보', 'About'))}<div class="about">
      <div class="about-top">
        <img class="about-icon" src="./icon.png" alt="">
        <div class="about-text">
          <div class="about-name">MyWorkForce <span class="about-version">v${esc(version)}</span></div>
          <div class="about-tagline">${esc(L('작업, 계획, 지식, 문서를 한곳에서', 'Work, planning, knowledge and documents in one place'))}</div>
          <p class="about-description">${esc(description)}</p>
        </div>
      </div>
      <div class="about-rows" id="about-rows"><h3 class="about-section">${icon('settings')}<span>${esc(L('빌드 정보', 'Build'))}</span></h3><dl class="about-table">${table}</dl></div>
    </div><div class="modal-foot"><button type="button" class="button" data-action="copy-about">${icon('copy')}<span>${L('복사', 'Copy')}</span></button><button type="button" class="button primary" data-action="modal-cancel">${icon('check')}<span>${L('완료', 'Done')}</span></button></div></div></div>`;
}

function participantsDialog(ctx, modal) {
  const project = (ctx.ws.projects || []).find((item) => item.id === modal.projectId);
  if (!project) return '';
  const lead = (ctx.ws.users || []).find((user) => user.id === project.leadId);
  const accessName = (access) => { const level = ACCESS.find((item) => item.id === (access === 'read' ? 'view' : access)); return level ? L(level.ko, level.en) : ''; };
  const accessOfRole = (role) => (role === 'administrator' ? 'lead' : (['developer', 'tester'].includes(role) ? 'edit' : 'view'));
  const accessOptions = (current) => ACCESS.map((level) => `<option value="${level.id}"${level.id === current ? ' selected' : ''}>${esc(L(level.ko, level.en))}</option>`).join('');
  const inherited = [];
  const inheritedIds = new Set();
  for (const ancestor of projectAncestors(ctx.ws, project)) {
    const grants = new Map((ancestor.members || []).filter((member) => member.userId && member.role).map((member) => [member.userId, member.role]));
    if (ancestor.leadId) grants.set(ancestor.leadId, 'administrator');
    for (const [userId, role] of grants) {
      if (userId === project.leadId || (project.members || []).some((member) => member.userId === userId)) continue;
      const prior = inherited.find((item) => item.userId === userId);
      if (!prior) inherited.push({ userId, role, from: ancestor });
      else if ((['viewer', 'customer', 'tester', 'developer', 'administrator'].indexOf(role)) > (['viewer', 'customer', 'tester', 'developer', 'administrator'].indexOf(prior.role))) {
        prior.role = role;
        prior.from = ancestor;
      }
      inheritedIds.add(userId);
    }
  }
  const inheritedRows = inherited.map((item) => {
    const user = (ctx.ws.users || []).find((person) => person.id === item.userId);
    if (!user) return '';
    return `<div class="participant-row">${avatar(user)}<span class="grow">${esc(user.name)} <small>${esc(user.login || user.email || '')}</small></span><span class="muted">${esc(L(`${item.from.key}에서`, `From ${item.from.key}`))}</span><b>${esc(accessName(participantAccess(item.role)))}</b></div>`;
  }).join('');
  const memberRows = (project.members || []).filter((member) => member.userId !== project.leadId).map((member) => {
    const user = (ctx.ws.users || []).find((item) => item.id === member.userId);
    if (!user) return '';
    const access = accessOfRole(member.role);
    return `<div class="participant-row">${avatar(user)}<span class="grow">${esc(user.name)} <small>${esc(user.login || user.email || '')}</small></span>
      <select data-participant="${esc(user.id)}" aria-label="${esc(L('권한', 'Access'))}">${accessOptions(access)}</select>
      <button type="button" class="small-button" data-action="remove-participant" data-id="${esc(user.id)}">${icon('trash')}<span>${L('빼기', 'Remove')}</span></button></div>`;
  }).join('');
  const needle = String(modal.query || '').trim().toLowerCase();
  const taken = new Set([project.leadId, ...(project.members || []).map((member) => member.userId), ...inheritedIds]);
  const matches = (ctx.ws.users || []).filter((user) => {
    if (user.active === false || taken.has(user.id)) return false;
    const haystack = `${user.name || ''} ${user.login || ''} ${user.email || ''}`.toLowerCase();
    return !needle || haystack.includes(needle);
  });
  const team = matches.filter((user) => sharesTeam(ctx.ws, project.leadId, user.id));
  const others = matches.filter((user) => !sharesTeam(ctx.ws, project.leadId, user.id));
  const choice = (user) => `<div class="participant-row">${avatar(user)}<span class="grow">${esc(user.name)} <small>${esc(user.login || user.email || '')}</small></span>
    <button type="button" class="small-button" data-action="add-participant" data-id="${esc(user.id)}" data-access="view">${icon('eye')}<span>${L('보기', 'View')}</span></button>
    <button type="button" class="small-button" data-action="add-participant" data-id="${esc(user.id)}" data-access="edit">${icon('pencil')}<span>${L('편집', 'Edit')}</span></button></div>`;
  const group = (title, glyph, people) => `<h3>${icon(glyph)}<span>${esc(title)}</span></h3>${people.map(choice).join('') || `<p class="muted">${L('없습니다.', 'None.')}</p>`}`;
  return `<div class="modal-back"><div class="modal participants">${heading('people', L('사람과 권한', 'People & access'))}
    <p>${esc(project.name)} · ${esc(L('보기는 읽기만 하고, 편집은 이슈와 페이지를 만들고 바꾸며, 책임자는 사람과 권한과 설정을 관리합니다. 과제 삭제는 관리자만 합니다.', 'View can read. Edit can create and change issues and pages. Lead manages people, access and settings. Only an administrator deletes a project.'))}</p>
    <div class="participant-row">${lead ? avatar(lead) : ''}<span class="grow">${esc(lead?.name || '')}</span><b>${esc(L('책임자', 'Lead'))}</b></div>
    ${memberRows || `<p class="muted">${L('추가된 참여자가 없습니다.', 'No one else is on this project yet.')}</p>`}
    ${inheritedRows ? `<h3>${icon('folder')}<span>${esc(L('상위 과제', 'Parent project'))}</span></h3>${inheritedRows}` : ''}
    <label class="form-row"><span>${L('찾기', 'Find')}</span><input id="participant-search" data-participant-search value="${esc(modal.query || '')}" placeholder="${esc(L('이름, 아이디, 메일', 'Name, account, or email'))}" autocomplete="off"></label>
    <div id="participant-results" class="participant-results">${group(L('팀원', 'Team'), 'people', team)}${group(L('다른 사람', 'Other people'), 'user', others)}</div>
    <div class="modal-foot"><button type="button" class="button primary" data-action="modal-cancel">${icon('check')}<span>${L('완료', 'Done')}</span></button></div>
  </div></div>`;
}

function dialog(title, body, submit, glyph = 'plus') {
  return `<div class="modal-back"><form class="modal">${heading(glyph, title)}<div class="modal-body">${body}</div><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="submit" class="button primary">${icon('check')}<span>${submit}</span></button></div></form></div>`;
}

/** Field name → icon, so each dialog row shows what it asks for. */
const FIELD_GLYPH = {
  name: 'tag', key: 'idCard', type: 'layers', parent: 'subtask', description: 'pencil', team: 'team', summary: 'tag',
  priority: 'flag', assignee: 'user', reporter: 'user', sprint: 'backlog', epic: 'epic', component: 'component', version: 'release',
  due: 'calendar', start: 'calendar', end: 'calendar', estimate: 'clock', labels: 'tag', email: 'globe', phone: 'phone',
  jobTitle: 'idCard', role: 'shield', lead: 'shield', login: 'idCard', current: 'key', next: 'key', confirm: 'key', password: 'key', user: 'user', goal: 'flag', status: 'workflow', from: 'workflow', to: 'workflow',
  query: 'filter', url: 'link', events: 'bell', title: 'tag', body: 'file', color: 'palette', category: 'box', field: 'tag',
};

function row(label, control) {
  const name = /\bname="([^"]+)"/.exec(control)?.[1] || '';
  const glyph = FIELD_GLYPH[name];
  return `<label class="form-row"><span>${glyph ? icon(glyph) : ''}${label}</span>${control}</label>`;
}

function accountFields(ctx, user = {}, isNew = false) {
  if (!isWorkspaceAdmin(ctx.user)) {
    return user.id && user.id === ctx.user?.id ? `<div class="form-block"><button type="button" class="button" data-action="change-password">${icon('key')}<span>${L('내 암호 바꾸기', 'Change my password')}</span></button></div>` : '';
  }
  const state = user.id ? (user.mustChangePassword ? L('다음 로그인 때 암호를 바꿔야 합니다.', 'Must change the password at the next sign-in.') : '') : '';
  const idRow = row(L('아이디', 'ID'), `<input name="login" required pattern="[A-Za-z0-9._-]{2,32}" value="${esc(user.login || '')}" autocomplete="off" spellcheck="false">`);
  if (user.id && user.id === ctx.user?.id) {
    // The administrator's own account: the ID changes here, the password with the current one.
    return `<div class="form-block"><span class="form-block-title">${icon('idCard')}${L('내 계정', 'My account')}</span>
      ${idRow}
      <p class="muted">${icon('info')}${L('다음 로그인부터 바뀐 아이디를 씁니다.', 'The new ID is used from the next sign-in.')}</p>
      <button type="button" class="button" data-action="change-password">${icon('key')}<span>${L('내 암호 바꾸기', 'Change my password')}</span></button>
    </div>`;
  }
  return `<div class="form-block"><span class="form-block-title">${icon('idCard')}${L('계정', 'Account')}</span>
    ${idRow}
    ${row(isNew ? L('처음 암호', 'First password') : L('새 암호', 'New password'), `<input name="password" type="password" minlength="6" autocomplete="new-password" ${isNew ? 'required' : `placeholder="${esc(L('바꿀 때만 입력', 'Only to change it'))}"`}>`)}
    <label class="check"><input type="checkbox" name="mustChange" checked>${L('다음 로그인 때 자기 암호로 바꾸게 하기', 'Make them choose their own at the next sign-in')}</label>
    ${state ? `<p class="muted">${icon('alert')}${esc(state)}</p>` : ''}
  </div>`;
}

function personFields(ctx, user = {}) {
  const photo = String(ctx.ui.profilePhoto || '');
  const preview = photo.startsWith('data:image/') ? `<img class="profile-preview" alt="" src="${esc(photo)}">` : '';
  return [
    row(L('이름', 'Name'), `<input name="name" required value="${esc(user.name || '')}">`),
    row(L('직급', 'Title'), `<input name="jobTitle" value="${esc(user.jobTitle || '')}">`),
    row(L('팀', 'Team'), `<input name="team" value="${esc(user.team || '')}">`),
    row(L('휴대폰', 'Phone'), `<input name="phone" value="${esc(user.phone || '')}" autocomplete="tel">`),
    row(L('메일', 'Email'), `<input name="email" type="email" value="${esc(user.email || '')}">`),
    row(L('사진', 'Photo'), `<input type="file" accept="image/*" data-profile-photo>${preview}`),
  ].join('');
}

export function renderModal(ctx) {
  const modal = ctx.ui.modal;
  if (!modal) return '';
  const project = ctx.project;
  if (modal.kind === 'confirm') {
    return `<div class="modal-back"><div class="modal">${heading('alert', L('확인', 'Confirm'))}<p>${esc(modal.message)}</p><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="button" class="button ${modal.yes?.danger ? 'primary danger-fill' : 'primary'}" data-action="confirm-yes">${icon(modal.yes?.glyph || 'check')}<span>${modal.yes ? L(modal.yes.ko, modal.yes.en) : L('계속', 'Continue')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'about') return aboutDialog(ctx);
  if (modal.kind === 'change-password') {
    const forced = Boolean(modal.forced);
    const lead = forced
      ? L('처음 로그인했습니다. 관리자가 정해 준 암호 대신, 자신만 아는 새 암호를 정해야 계속할 수 있습니다.', 'This is your first sign-in. Replace the password you were given with one only you know to continue.')
      : L('지금 암호를 확인한 뒤 새 암호로 바꿉니다.', 'Confirm the current password, then choose a new one.');
    const head = forced ? `<h2>${icon('key')}<span class="grow">${esc(L('새 암호 정하기', 'Choose a new password'))}</span></h2>` : heading('key', L('암호 바꾸기', 'Change password'));
    const foot = forced
      ? `<button type="button" class="button" data-action="sign-out">${icon('logout')}<span>${L('로그아웃', 'Sign out')}</span></button>`
      : `<button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button>`;
    return `<div class="modal-back"><form class="modal password-modal">${head}<p class="muted">${esc(lead)}</p><div class="modal-body">
      ${modal.current ? '' : row(L('지금 암호', 'Current password'), '<input name="current" type="password" required autocomplete="current-password">')}
      ${row(L('새 암호', 'New password'), '<input name="next" type="password" required minlength="6" autocomplete="new-password">')}
      ${row(L('다시 입력', 'Repeat'), '<input name="confirm" type="password" required minlength="6" autocomplete="new-password">')}
      <p class="muted">${icon('info')}${L('6자 이상, 지금 암호와 다르게 정합니다.', 'At least 6 characters, different from the current one.')}</p>
    </div><div class="modal-foot">${foot}<button type="submit" class="button primary">${icon('check')}<span>${L('바꾸기', 'Change')}</span></button></div></form></div>`;
  }
  if (modal.kind === 'schema-sql') {
    return `<div class="modal-back"><div class="modal schema-sql-modal">${heading('code', L('SQL 스크립트', 'SQL script'))}
      <p class="muted">${L('DBA가 직접 표를 만들 때 이 스크립트를 실행합니다. 여러 번 실행해도 안전합니다.', 'A DBA runs this script to create the tables by hand. It is safe to run more than once.')} · <b>${esc(modal.engine)}</b></p>
      <textarea id="schema-sql-text" class="schema-sql" readonly spellcheck="false">${esc(modal.sql || '')}</textarea>
      <div class="modal-foot"><button type="button" class="button" data-action="schema-copy">${icon('copy')}<span>${L('복사', 'Copy')}</span></button><button type="button" class="button primary" data-action="modal-cancel">${icon('check')}<span>${L('닫기', 'Close')}</span></button></div>
    </div></div>`;
  }
  if (modal.kind === 'login') {
    const gate = modal.next !== 'tutorial';
    const lead = gate
      ? L('로그인해야 나머지를 사용할 수 있습니다. 사용 설명서와 튜토리얼 문서는 로그인하지 않아도 이 창에서 볼 수 있습니다.', 'Sign in to use the rest. You can read the user guide and the tutorial document in this window without signing in.')
      : L('튜토리얼을 실행하려면 등록된 사용자로 로그인하세요.', 'Sign in as a registered user to run the tutorial.');
    const error = ctx.ui.startError ? `<p class="danger-text">${esc(ctx.ui.startError)}</p>` : '';
    const docs = gate ? `<div class="page-actions login-docs"><button type="button" class="button" data-action="open-guide" data-id="guide">${icon('book')}<span>${L('사용 설명서', "User's guide")}</span></button><button type="button" class="button" data-action="open-guide" data-id="tutorial">${icon('play')}<span>${L('튜토리얼 문서', 'Tutorial document')}</span></button></div>` : '';
    const head = heading('login', L('로그인', 'Sign in'));
    // No database yet: accounts live in it, so on the data service's own computer it is set up first.
    const setup = ctx.ui.status?.setup
      ? `<p class="login-error note">${esc(L('데이터베이스에 연결되어 있지 않아 로그인할 수 없습니다. 먼저 데이터베이스를 설정하세요.', 'No database is connected, so nobody can sign in. Set up the database first.'))}</p><div class="page-actions"><button type="button" class="button primary" data-action="open-db-setup">${icon('database')}<span>${L('데이터베이스 설정', 'Database settings')}</span></button></div>`
      : '';
    return `<div class="modal-back"><div class="modal login-modal">${head}<p>${esc(lead)}</p>${error}${setup}${docs}${loginForm(ctx, { account: 'dialog-account', password: 'dialog-password', layout: 'stack' })}</div></div>`;
  }
  if (modal.kind === 'db-setup') {
    return `<div class="modal-back"><div class="modal db-setup-modal">${heading('database', L('데이터베이스 설정', 'Database settings'))}${databaseSettings(ctx)}</div></div>`;
  }
  if (modal.kind === 'welcome') {
    const again = ctx.settings?.showWelcome !== false;
    return `<div class="modal-back"><div class="modal welcome">${heading('play', L('튜토리얼', 'Tutorial'))}<p>${esc(L('시작할 때 튜토리얼을 실행할까요? 쇼핑몰 예제로 주요 화면을 둘러봅니다. 나중에 시작 화면에서도 시작할 수 있습니다.', 'Run the tutorial at start? It walks the main screens with the shop example. You can also start it later from the start page.'))}</p><p>${esc(L('사용 설명서와 튜토리얼 문서는 로그인하지 않아도 이 창에서 볼 수 있습니다.', 'You can read the user guide and the tutorial document in this window without signing in.'))}</p><div class="page-actions"><button type="button" class="button" data-action="open-guide" data-id="guide">${icon('book')}<span>${L('사용 설명서', "User's guide")}</span></button><button type="button" class="button" data-action="open-guide" data-id="tutorial">${icon('play')}<span>${L('튜토리얼 문서', 'Tutorial document')}</span></button></div><label class="check welcome-again">${icon('play')}<input type="checkbox" data-setting="showWelcome" ${again ? 'checked' : ''}>${L('시작할 때 이 창을 다시 보여주기', 'Show this window again at start')}</label><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('나중에', 'Later')}</span></button><button type="button" class="button primary" data-action="start-tutorial">${icon('play')}<span>${L('튜토리얼 시작', 'Start the tutorial')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'shortcuts') {
    // A wide window of a fixed size: the groups flow over four columns so every shortcut shows at once.
    const groups = shortcutGroups().map(([title, items]) => `<section class="shortcut-set"><h4>${esc(title)}</h4>${items.map(([key, label]) => `<div class="shortcut-row"><kbd>${esc(key)}</kbd><span>${esc(label)}</span></div>`).join('')}</section>`).join('');
    return `<div class="modal-back"><div class="modal shortcut-modal" role="dialog" aria-label="${esc(L('단축키', 'Shortcuts'))}">${heading('bolt', L('단축키', 'Shortcuts'))}<p class="muted">${L('글자를 입력하는 칸에서는 Ctrl 조합만 동작합니다. G를 누른 뒤 글자를 누르면 화면이 바뀝니다.', 'Only Ctrl combinations work while typing. Press G, then a letter, to change screens.')}</p><div class="shortcut-cols">${groups}</div><div class="modal-foot"><button type="button" class="button primary popup-close" data-action="modal-cancel">${icon('close')}<span>${L('닫기', 'Close')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'palette') {
    return `<div class="modal-back"><form class="modal palette">${heading('search', L('이슈로 이동', 'Go to an issue'))}<input id="palette-search" data-palette="search" value="${esc(modal.query || '')}" placeholder="${esc(L('키 또는 요약', 'Key or summary'))}">${paletteItems(ctx, modal.query || '')}</form></div>`;
  }
  if (modal.kind === 'participants') return participantsDialog(ctx, modal);
  if (modal.kind === 'page-template') return templatePicker(ctx);
  if (modal.kind === 'workspace') {
    const space = modal.spaceId ? (ctx.ws.spaces || []).find((item) => item.id === modal.spaceId) : null;
    if (space) {
      return dialog(L('작업 공간', 'Workspace'), [
        row(L('이름', 'Name'), `<input name="name" required value="${esc(space.name)}">`),
        row(L('설명', 'Description'), `<textarea name="description" rows="3">${esc(space.description || '')}</textarea>`),
      ].join(''), L('저장', 'Save'), 'layers');
    }
    // Who sees it: everybody in the company, one team's members, or one project's people.
    const teams = teamsOf(ctx.ws, ctx.user?.id);
    const projects = orderedProjects(ctx.ws).filter((item) => !item.archived && participatingProjects(ctx.ws, ctx.user?.id).some((mine) => mine.id === item.id));
    const where = `<select name="where"><option value="">${esc(L('회사 전체 — 모두 봅니다', 'The whole company — everyone sees it'))}</option>
      ${teams.length ? `<optgroup label="${esc(L('팀 — 팀원만', 'A team — its members'))}">${teams.map((team) => `<option value="team:${esc(team.id)}">${esc(team.name)}</option>`).join('')}</optgroup>` : ''}
      ${projects.length ? `<optgroup label="${esc(L('과제 — 과제 사람만', 'A project — its people'))}">${projects.map((item) => `<option value="project:${esc(item.id)}">${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</optgroup>` : ''}</select>`;
    return dialog(L('새 작업 공간', 'New workspace'), [
      row(L('이름', 'Name'), `<input name="name" required placeholder="${esc(L('예: 개발 문서', 'e.g. Engineering docs'))}">`),
      row(L('키', 'Key'), `<input name="key" maxlength="10" placeholder="${esc(L('비우면 자동', 'Automatic when empty'))}">`),
      row(L('보는 사람', 'Who sees it'), where),
      row(L('설명', 'Description'), '<textarea name="description" rows="3"></textarea>'),
    ].join(''), L('만들기', 'Create'), 'layers');
  }
  if (modal.kind === 'team') {
    return dialog(L('새 팀', 'New team'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('키', 'Key'), `<input name="key" maxlength="10" placeholder="${esc(L('비우면 자동', 'Automatic when empty'))}">`),
      row(L('팀장', 'Lead'), `<select name="lead">${userOptions(ctx.ws, ctx.user?.id || '', '')}</select>`),
      row(L('설명', 'Description'), '<textarea name="description" rows="3"></textarea>'),
    ].join(''), L('만들기', 'Create'), 'team');
  }
  if (modal.kind === 'project') {
    const parents = orderedProjects(ctx.ws).filter((item) => allowed(ctx.ws, item, ctx.user?.id, 'admin'));
    const parent = parents.length ? row(L('상위 과제', 'Parent project'), `<select name="parent"><option value="">${esc(L('없음', 'None'))}</option>${parents.map((item) => `<option value="${esc(item.id)}"${item.id === modal.parentId ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</select>`) : '';
    const admin = isWorkspaceAdmin(ctx.user);
    const teams = (ctx.ws.teams || []).filter((team) => admin || isTeamMember(team, ctx.user?.id));
    const parentTeam = (ctx.ws.projects || []).find((item) => item.id === modal.parentId)?.teamId;
    const chosenTeam = modal.teamId || parentTeam || (ctx.ui.view === 'team' ? ctx.ui.teamId : '') || teams[0]?.id || '';
    const type = modal.type || 'software';
    return dialog(L('새 과제', 'New project'), [
      row(L('팀', 'Team'), `<select name="team">${teams.map((team) => `<option value="${esc(team.id)}"${team.id === chosenTeam ? ' selected' : ''}>${esc(team.name)}</option>`).join('')}</select>`),
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('키', 'Key'), '<input name="key" required maxlength="10" placeholder="SHOP">'),
      row(L('종류', 'Type'), `<select name="type" data-project-type>${options(PROJECT_TYPES, type)}</select>`),
      parent,
      row(L('설명', 'Description'), '<textarea name="description" rows="3"></textarea>'),
      `<div class="form-block"><span class="form-block-title">${icon('layers')}${L('관리 방법', 'Management methods')}</span>${methodChecks(modal.methods || DEFAULT_METHODS[type])}</div>`,
    ].join(''), L('만들기', 'Create'), 'folder');
  }
  if (modal.kind === 'issue' && project) {
    const show = new Set(createFields(project));
    return dialog(L('새 이슈', 'New issue'), [
      show.has('type') ? row(L('유형', 'Type'), `<select name="type">${options(project.issueTypes, modal.typeId || 'story')}</select>`) : '<input type="hidden" name="type" value="task">',
      row(L('요약', 'Summary'), '<input name="summary" required>'),
      show.has('description') ? row(L('설명', 'Description'), '<textarea name="description" rows="4"></textarea>') : '',
      show.has('priority') ? row(L('우선순위', 'Priority'), `<select name="priority">${options(project.priorities, 'medium')}</select>`) : '',
      show.has('assignee') ? row(L('담당', 'Assignee'), `<select name="assignee">${userOptions(ctx.ws, ctx.user?.id || '')}</select>`) : '',
      show.has('epic') ? row(L('에픽', 'Epic'), `<select name="epic">${options(project.issues.filter((issue) => issue.typeId === 'epic'), modal.epicId || '', L('없음', 'None'))}</select>`) : '',
      show.has('sprint') ? row(L('스프린트', 'Sprint'), `<select name="sprint">${options(project.sprints.filter((sprint) => sprint.state !== 'closed'), modal.sprintId || '', L('백로그', 'Backlog'))}</select>`) : '',
      show.has('points') ? row(L('포인트', 'Points'), '<input name="points" inputmode="decimal">') : '',
      modal.parentId ? `<input type="hidden" name="parent" value="${esc(modal.parentId)}">` : '',
    ].join(''), L('만들기', 'Create'), 'issues');
  }
  if (modal.kind === 'sprint') {
    return dialog(L('스프린트', 'Sprint'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('목표', 'Goal'), '<input name="goal">'),
      row(L('시작', 'Start'), '<input name="start" type="date" required>'),
      row(L('끝', 'End'), '<input name="end" type="date" required>'),
    ].join(''), L('만들기', 'Create'), 'play');
  }
  if (modal.kind === 'complete' && project) {
    const futures = project.sprints.filter((sprint) => sprint.state === 'future');
    return dialog(L('스프린트 완료', 'Complete sprint'), `<p>${L('끝내지 못한 이슈를 어디로 보낼까요?', 'Where should unfinished issues go?')}</p>
      <label class="check"><input type="radio" name="dest" value="backlog" checked> ${L('백로그', 'Backlog')}</label>
      ${futures.map((sprint) => `<label class="check"><input type="radio" name="dest" value="${esc(sprint.id)}"> ${esc(sprint.name)}</label>`).join('')}`, L('완료', 'Complete'), 'check');
  }
  if (modal.kind === 'status') {
    return dialog(L('상태', 'Status'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('구분', 'Category'), `<select name="category"><option value="new">${L('시작 전', 'To do')}</option><option value="indeterminate">${L('진행', 'In progress')}</option><option value="done">${L('완료', 'Done')}</option></select>`),
    ].join(''), L('추가', 'Add'), 'workflow');
  }
  if (modal.kind === 'transition' && project) {
    return dialog(L('전이', 'Transition'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('에서', 'From'), `<select name="from">${options(project.statuses, project.statuses[0]?.id)}</select>`),
      row(L('으로', 'To'), `<select name="to">${options(project.statuses, project.statuses[1]?.id || project.statuses[0]?.id)}</select>`),
      row(L('조건', 'Condition'), `<select name="condition"><option value="">${L('없음', 'None')}</option><option value="assignee">${L('담당자만', 'Assignee only')}</option><option value="role">${L('역할', 'Role')}</option></select>`),
      row(L('역할', 'Role'), `<select name="role">${options(ROLES, 'developer')}</select>`),
      row(L('검사', 'Check'), `<select name="validator"><option value="">${L('없음', 'None')}</option><option value="assignee">${L('담당 필요', 'Assignee required')}</option><option value="points">${L('포인트 필요', 'Points required')}</option></select>`),
      `<label class="check"><input type="checkbox" name="approval"> ${L('승인이 필요함', 'Needs approval')}</label>`,
      row(L('승인자', 'Approver'), `<select name="approver">${userOptions(ctx.ws, '', L('아무나', 'Anyone'))}</select>`),
    ].join(''), L('추가', 'Add'), 'workflow');
  }
  if (modal.kind === 'csv') {
    return dialog(L('CSV 가져오기', 'Import CSV'), `<p class="muted">summary, type, priority, status, assignee, labels, description</p><textarea name="csv" rows="8" required></textarea>`, L('가져오기', 'Import'), 'download');
  }
  if (modal.kind === 'password') {
    return dialog(L('암호 정하기', 'Set a password'), [
      row(L('사람', 'Person'), `<select name="user">${userOptions(ctx.ws, modal.userId || ctx.user?.id || '')}</select>`),
      row(L('암호', 'Password'), '<input name="password" type="password" minlength="6" required autocomplete="new-password">'),
      `<label class="check"><input type="checkbox" name="mustChange" checked>${L('다음 로그인 때 자기 암호로 바꾸게 하기', 'Make them choose their own at the next sign-in')}</label>`,
    ].join(''), L('저장', 'Save'), 'key');
  }
  if (modal.kind === 'field') {
    return dialog(L('필드', 'Field'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('종류', 'Type'), `<select name="fieldType"><option value="text">${L('글', 'Text')}</option><option value="number">${L('숫자', 'Number')}</option><option value="select">${L('선택', 'Select')}</option><option value="date">${L('날짜', 'Date')}</option><option value="user">${L('사람', 'Person')}</option></select>`),
      row(L('선택지', 'Options'), `<input name="options" placeholder="${esc(L('쉼표로 구분', 'Comma separated'))}">`),
    ].join(''), L('추가', 'Add'), 'tag');
  }
  if (modal.kind === 'rule' && project) {
    return dialog(L('자동화', 'Automation'), [
      row(L('이름', 'Name'), '<input name="name">'),
      row(L('언제', 'When'), `<select name="when"><option value="created">${L('만들어질 때', 'Created')}</option><option value="transition">${L('상태로 바뀔 때', 'Moved to a status')}</option></select>`),
      row(L('유형', 'Type'), `<select name="type">${options(project.issueTypes, '', L('모두', 'Any'))}</select>`),
      row(L('상태', 'Status'), `<select name="status">${options(project.statuses, '', L('모두', 'Any'))}</select>`),
      row(L('그러면', 'Then'), `<select name="then"><option value="watch">${L('관찰자로 추가', 'Add a watcher')}</option><option value="assign">${L('담당 지정', 'Assign')}</option><option value="priority">${L('우선순위', 'Set priority')}</option><option value="label">${L('라벨 추가', 'Add a label')}</option></select>`),
      row(L('사람', 'Person'), `<select name="user">${userOptions(ctx.ws, ctx.user?.id || '')}</select>`),
      row(L('우선순위', 'Priority'), `<select name="priority">${options(project.priorities, 'medium')}</select>`),
      row(L('라벨', 'Label'), '<input name="label">'),
    ].join(''), L('추가', 'Add'), 'bolt');
  }
  if (modal.kind === 'user') {
    return dialog(L('새 사용자', 'New user'), [
      personFields(ctx),
      accountFields(ctx, {}, true),
      row(L('역할', 'Role'), `<select name="role">${options(ROLES, 'developer')}</select>`),
    ].join(''), L('추가', 'Add'), 'user');
  }
  if (modal.kind === 'profile') {
    const user = (ctx.ws.users || []).find((item) => item.id === modal.userId) || {};
    return dialog(L('사용자 정보', 'User details'), personFields(ctx, user) + accountFields(ctx, user), L('저장', 'Save'), 'user');
  }
  if (modal.kind === 'component' || modal.kind === 'version' || modal.kind === 'group' || modal.kind === 'filter') {
    const titles = { component: L('구성 요소', 'Component'), version: L('버전', 'Version'), group: L('그룹', 'Group'), filter: L('필터', 'Filter') };
    const glyphs = { component: 'component', version: 'release', group: 'people', filter: 'filter' };
    return dialog(titles[modal.kind], [
      row(L('이름', 'Name'), '<input name="name" required>'),
      modal.kind === 'component' || modal.kind === 'version' ? row(L('설명', 'Description'), '<textarea name="description" rows="2"></textarea>') : '',
    ].join(''), L('추가', 'Add'), glyphs[modal.kind]);
  }
  return '';
}

export function paletteItems(ctx, text) {
  if (!ctx.project) return '';
  const needle = String(text || '').trim().toLowerCase();
  const issues = ctx.project.issues.filter((issue) => !needle || issue.key.toLowerCase().includes(needle) || issue.summary.toLowerCase().includes(needle)).slice(0, 12);
  return `<div id="palette-results">${issues.map((issue) => `<button type="button" data-action="open-issue" data-id="${esc(issue.id)}">${typeBadge(ctx.project, issue.typeId)}<span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span></button>`).join('') || `<p class="empty">${L('없음', 'Nothing to show')}</p>`}</div>`;
}

export function renderContext(ctx) {
  const menu = ctx.ui.context;
  if (!menu) return '';
  // A menu is its list of items: no title bar and no close button (Esc or a click outside closes it).
  const bar = '';
  if (menu.kind === 'page') {
    const page = (ctx.ws.articles || []).find((item) => item.id === menu.id);
    if (!page) return '';
    const canEdit = canEditPage(page, ctx.user?.id);
    const id = `data-id="${esc(page.id)}"`;
    return bar + [
      item('open-article', 'book', L('열기', 'Open'), `${id} data-space="${esc(page.spaceId)}"`),
      canEdit && (page.kind || 'page') === 'page' ? item('add-child', 'plus', L('하위 페이지 만들기', 'New child page'), id) : '',
      item('copy-page', 'copy', L('복사본 만들기', 'Make a copy'), id),
      item('export-page', 'download', L('HTML로 내보내기', 'Export as HTML'), `${id} data-format="html"`),
      canEdit ? '<div class="sep"></div>' : '',
      canEdit ? item('delete-article', 'trash', L('휴지통으로 삭제', 'Move to the trash'), `${id} class="danger"`) : '',
    ].join('');
  }
  if (menu.kind === 'workspace') {
    const space = (ctx.ws.spaces || []).find((item) => item.id === menu.id);
    if (!space) return '';
    const manage = isWorkspaceAdmin(ctx.user) || space.authorId === ctx.user?.id;
    const id = `data-id="${esc(space.id)}"`;
    return bar + [
      item('open-workspace', 'layers', L('열기', 'Open'), id),
      item('add-page', 'plus', L('새 페이지', 'New page'), `data-space="${esc(space.id)}"`),
      item('edit-workspace', 'settings', L('속성', 'Properties'), id),
      manage ? '<div class="sep"></div>' : '',
      manage ? item('delete-workspace', 'trash', L('작업 공간 삭제', 'Delete the workspace'), `${id} class="danger"`) : '',
    ].join('');
  }
  if (menu.kind === 'start-help') {
    return bar + [
      item('show-welcome', 'spark', L('시작 안내 창', 'Welcome window')),
      item('start-tutorial', 'play', L('튜토리얼', 'Tutorial')),
      item('open-guide', 'file', L('튜토리얼 문서', 'Tutorial document'), 'data-id="tutorial"'),
      item('open-guide', 'book', L('사용 설명서', 'User guide'), 'data-id="guide"'),
      item('open-guide', 'filter', L('WQL 설명서', 'WQL guide'), 'data-id="wql"'),
      '<div class="sep"></div>',
      item('shortcuts', 'key', L('단축키', 'Shortcuts')),
      item('about', 'info', L('프로그램 정보', 'About')),
    ].join('');
  }
  if (menu.kind === 'start-settings') {
    const on = (key) => ctx.settings?.[key] !== false;
    const toggle = (key, glyph, ko, en) => item('start-setting', on(key) ? 'check' : glyph, L(ko, en), `data-id="${key}" role="menuitemcheckbox" aria-checked="${on(key) ? 'true' : 'false'}"`);
    return bar + [
      toggle('startShowProjects', 'folder', '과제 카드 보이기', 'Show the projects card'),
      toggle('startShowExamples', 'box', '예제 카드 보이기', 'Show the examples card'),
      toggle('startShowBackground', 'spark', '배경 카드 보이기', 'Show the background card'),
      '<div class="sep"></div>',
      toggle('showWelcome', 'spark', '시작할 때 안내 창 보이기', 'Show the welcome window at start'),
      toggle('showStartPage', 'home', '시작할 때 시작 화면 표시', 'Show the start page at launch'),
    ].join('');
  }
  if (menu.kind === 'file') {
    return bar + item('download-file', 'download', L('다운로드', 'Download'), `data-file="${esc(menu.id || '')}" data-name="${esc(menu.name || '')}" data-src="${esc(menu.src || '')}"`);
  }
  if (menu.kind === 'issue') {
    return bar + [
      item('open-issue', 'issues', L('열기', 'Open'), `data-id="${esc(menu.id)}"`),
      item('clone-issue', 'copy', L('복제', 'Clone')),
      item('toggle-watch', 'eye', L('관찰', 'Watch')),
      '<div class="sep"></div>',
      item('delete-issue', 'trash', L('삭제', 'Delete')),
    ].join('');
  }
  return bar + [
    item('menubar-home', 'spark', L('시작', 'Start')),
    item('new-issue', 'plus', L('새 이슈', 'New issue')),
    item('new-project', 'folder', L('새 과제', 'New project')),
    item('go', 'board', L('보드', 'Board'), 'data-view="board"'),
  ].join('');
}

export { navLabel };
