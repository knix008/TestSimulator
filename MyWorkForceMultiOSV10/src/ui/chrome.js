import { getLanguage } from '../i18n.js';
import { CUSTOM_KEYS, DARK_THEMES, LIGHT_THEMES, themeName } from '../themes.js';
import { PROJECT_TYPES, ROLES } from '../domain/catalog.js';
import { allowed, isWorkspaceAdmin, orderedProjects, participantAccess, projectAncestors, sharesTeam } from '../domain/permissions.js';
import { createFields, moduleOn } from '../domain/services.js';
import { avatar, button, esc, icon, L, nameOf, NAV_GLYPH, options, panelFrame, primary, typeBadge, userOptions } from './bits.js';
import { shortcutGroups } from './shortcuts.js';

function item(action, glyph, label, extra = '', keys = '') {
  return `<button type="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span>${keys ? `<kbd>${keys}</kbd>` : ''}</button>`;
}

export function loginForm(ctx, ids = {}) {
  const account = ctx.ui.loginAccount || '';
  const accountId = ids.account || 'login-account';
  const passwordId = ids.password || 'login-password';
  return `<form class="login-form" data-login>
    <div class="login-row">
      <div class="login-fields">
        <label class="form-row"><span>${L('로그인 ID', 'Login ID')}</span><input id="${accountId}" name="account" value="${esc(account)}" autocomplete="username" placeholder="admin"></label>
        <label class="form-row"><span>${L('비밀번호', 'Password')}</span><input id="${passwordId}" name="password" type="password" autocomplete="current-password" placeholder="admin"></label>
      </div>
      <button type="submit" class="button primary" ${ctx.ui.connecting ? 'disabled' : ''}>${icon('check')}<span>${L('로그인', 'Sign in')}</span></button>
    </div>
    <p class="muted">${L('관리자는 admin / admin 으로 들어갑니다.', 'The administrator signs in with admin / admin.')}</p>
  </form>`;
}

function menu(ctx, id, label, glyph, body, extra = '') {
  return `<div class="menu${extra}${ctx.ui.menu === id ? ' open' : ''}"><button type="button" class="menubar-item" data-menu="${id}">${icon(glyph)}<span>${label}</span></button><div class="menu-pop"><div class="popup-bar">${closeButton()}</div>${body}</div></div>`;
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
    item('new-project', 'plus', L('새 프로젝트', 'New project'), '', 'Ctrl+Shift+N'),
    item('open-file', 'folder', L('열기', 'Open'), '', 'Ctrl+O'),
    item('save-file', 'save', L('저장', 'Save'), '', 'Ctrl+S'),
    item('save-as', 'save', L('다른 이름으로 저장', 'Save as'), '', 'Ctrl+Shift+S'),
    '<div class="sep"></div>',
    item('export-md', 'download', L('Markdown로 내보내기', 'Export Markdown')),
    item('export-csv', 'download', L('CSV로 내보내기', 'Export CSV')),
    item('export-project', 'download', L('이 프로젝트만 내보내기', 'Export this project')),
    recent ? `<div class="sep"></div>${recent}` : '',
    '<div class="sep"></div>',
    item('print', 'printer', L('인쇄', 'Print'), '', 'Ctrl+P'),
  ].join('');
  const edit = [
    item('undo', 'undo', L('실행 취소', 'Undo'), '', 'Ctrl+Z'),
    item('redo', 'redo', L('다시 실행', 'Redo'), '', 'Ctrl+Y'),
    item('focus-search', 'search', L('검색', 'Find'), '', 'Ctrl+F'),
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
    item('open-guide', 'book', L('사용 설명서', "User's guide"), 'data-id="guide"', 'F1'),
    item('open-guide', 'play', L('튜토리얼 문서', 'Tutorial document'), 'data-id="tutorial"'),
    item('open-guide', 'filter', L('WQL 설명서', 'WQL guide'), 'data-id="wql"'),
    item('shortcuts', 'bolt', L('단축키', 'Shortcuts'), '', '?'),
    item('about', 'info', L('정보', 'About'), '', 'Ctrl+Shift+A'),
  ].join('');
  const controls = ctx.desktop ? `<div class="window-controls">
      <button type="button" class="window-button" data-window="minimize" title="${esc(L('최소화', 'Minimize'))}">${icon('minus')}</button>
      <button type="button" class="window-button" data-window="maximize" title="${esc(L('최대화', 'Maximize'))}">${icon(ctx.ui.maximized ? 'restore' : 'square')}</button>
      <button type="button" class="window-button close" data-window="close" title="${esc(L('닫기', 'Close'))}">${icon('close')}</button>
    </div>` : '';
  const homeOn = !ctx.ui.ready;
  const signedIn = Boolean(ctx.ui.loginUser);
  const administrator = isWorkspaceAdmin(ctx.user) && ctx.ui.ready ? [
    item('go', 'people', L('사용자', 'Users'), 'data-view="users"'),
    item('go', 'people', L('사람', 'People'), 'data-view="people"'),
    item('go', 'settings', L('설정', 'Settings'), 'data-view="settings"'),
    item('go', 'database', L('데이터베이스', 'Database'), 'data-view="settings"'),
    item('go', 'bolt', L('확장', 'Extensions'), 'data-view="extensions"'),
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
    knowledge: L('지식 자료', 'Knowledge'), documents: L('문서', 'Documents'), calendar: L('근무 달력', 'Work calendar'), portal: L('고객 포털', 'Customer portal'),
    users: L('사용자', 'Users'), projects: L('과제', 'Projects'), 'project-settings': L('과제 설정', 'Project settings'),
    plans: L('교차 계획', 'Plan'), extensions: L('확장', 'Extensions'),
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
  const users = ctx.ws.users.filter((user) => user.active !== false).map((user) => ({ id: user.id, name: user.name }));
  const unread = ctx.project ? ctx.project.notifications.filter((item) => item.userId === ctx.user?.id && !item.read).length : 0;
  const currentName = themeName(ctx.settings.theme, getLanguage());
  const leftOpen = ctx.settings.showLeftPanel !== false;
  const rightOpen = ctx.settings.showRightPanel !== false;
  const panelButton = (id, glyph, open, ko, en, keys = '') => `<button type="button" class="tool-button${open ? ' active' : ''}" data-action="toggle-panel" data-id="${id}" title="${esc(`${L(ko, en)}${keys ? ` ${keys}` : ''}`)}" aria-label="${esc(L(ko, en))}" aria-pressed="${open ? 'true' : 'false'}">${icon(glyph)}</button>`;
  return `<div class="toolbar-inner">
      <select data-choose="project" title="${esc(L('프로젝트', 'Project'))}">${options(projects, ctx.ws.activeProjectId, L('프로젝트 없음', 'No project'))}</select>
      <label class="quick-search" title="Ctrl+F">${icon('search')}<input id="quick-search" value="${esc(ctx.ui.quick || '')}" placeholder="${esc(L('검색 또는 WQL', 'Search or WQL'))}"></label>
      <button type="button" class="tool-button" data-action="command-palette" title="${esc(L('이동', 'Go to'))} Ctrl+K">${icon('bolt')}</button>
      <span class="tool-sep"></span>
      <button type="button" class="tool-button wide" data-action="new-issue" title="Ctrl+N">${icon('plus')}<span>${L('이슈', 'Issue')}</span></button>
      <span class="grow"></span>
      <button type="button" class="tool-button" data-action="go" data-view="notifications" title="${esc(L('알림', 'Notifications'))}">${icon('bell')}${unread ? `<i class="dot">${unread}</i>` : ''}</button>
      <select data-choose="user" title="${esc(L('현재 사용자', 'Current user'))}">${options(users, ctx.ws.currentUserId)}</select>
      <button type="button" class="tool-button wide" data-action="language" title="Ctrl+Shift+L">${icon('globe')}<span>${ctx.settings.language === 'en' ? 'EN' : 'KO'}</span></button>
      ${panelButton('left', 'panelLeft', leftOpen, '왼쪽 패널', 'Left panel', 'Ctrl+Shift+1')}
      ${panelButton('right', 'panelRight', rightOpen, '오른쪽 패널', 'Right panel', 'Ctrl+Shift+2')}
      <span class="theme-anchor theme-split">
        <button type="button" class="tool-button" data-action="theme-random" title="${esc(L('테마 바꾸기', 'Change the theme'))} · ${esc(currentName)} · Ctrl+Shift+B">${icon('palette')}</button>
        <button type="button" class="tool-button split-arrow" data-action="theme-menu" title="${esc(L('테마 설정', 'Theme settings'))}" aria-haspopup="true" aria-expanded="${ctx.ui.popover === 'theme' || ctx.ui.popover === 'theme-custom' ? 'true' : 'false'}">${icon('chevronDown')}</button>
        ${themePopover(ctx)}
      </span>
      <button type="button" class="tool-button" data-action="about" title="${esc(L('프로그램 정보', 'About'))} Ctrl+Shift+A" aria-label="${esc(L('프로그램 정보', 'About'))}">${icon('info')}</button>
    </div>`;
}

const NAV = [
  ['work', ['home', 'projects', 'project-settings', 'board', 'backlog', 'roadmap', 'issues', 'queues', 'portal']],
  ['look', ['dashboard', 'reports', 'knowledge', 'documents', 'calendar', 'plans', 'releases', 'components', 'filters', 'health']],
];
const GATED = { knowledge: 'knowledge', documents: 'documents', calendar: 'calendar', portal: 'portal', plans: 'plans' };

function navButtons(ctx, items) {
  return items.filter((id) => {
    if (id === 'project-settings' && !allowed(ctx.ws, ctx.project, ctx.user?.id, 'admin')) return false;
    return (id !== 'queues' || ctx.project?.type === 'service' || (ctx.project?.queues || []).length) && (!GATED[id] || moduleOn(ctx.ws, GATED[id]));
  }).map((id) => {
    const glyph = NAV_GLYPH[id];
    return `<button type="button" class="nav-button${ctx.ui.view === id ? ' active' : ''}" data-action="go" data-view="${id}">${icon(glyph)}<span>${esc(navLabel(id))}</span></button>`;
  }).join('');
}

export function renderNav(ctx) {
  const sections = { work: L('작업', 'Work'), look: L('살펴보기', 'Review') };
  const userMenus = NAV.map(([section, items]) => `<div class="nav-section">${sections[section]}</div>${navButtons(ctx, items)}`).join('');
  const admin = isWorkspaceAdmin(ctx.user);
  const adminMenus = admin ? `<div class="nav-group nav-group-admin">${icon('settings')}<span>${L('관리자 메뉴', 'Administrator menu')}</span></div>${navButtons(ctx, ['users', 'settings'])}` : '';
  const body = `<div class="nav-group">${icon('user')}<span>${L('사용자 메뉴', 'User menu')}</span></div>${userMenus}${adminMenus}`;
  return panelFrame(ctx.settings.showLeftPanel !== false, 'left', 'list', L('탐색', 'Navigation'), `<div class="panel-body">${body}</div>`);
}

export function renderStatus(ctx) {
  const project = ctx.project;
  const count = project ? project.issues.length : 0;
  const hint = ctx.ui.queryError ? L('질의 문법을 확인하세요.', 'Check the query syntax.') : (project ? L(`${count}개 이슈`, `${count} issues`) : L('프로젝트를 여세요.', 'Open a project.'));
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
    '프로젝트와 이슈, 스프린트, 백로그, 로드맵, 대기열, 작업 달력, 지식, 문서, 보고서, 대시보드를 한 작업 공간에서 다룹니다. 이슈는 WQL로 고르고, 보드에서 상태를 옮기며, 권한과 작업 흐름, 자동화, 승인을 설정합니다. 문서는 회의록부터 릴리스 노트까지 양식으로 만들고, 지식은 공간과 페이지 트리로 정리합니다. 데이터베이스는 SQLite를 기본으로 하고 MySQL, MariaDB, SQL Server, PostgreSQL에 연결합니다. Windows, macOS, Linux, 웹에서 실행됩니다.',
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
  const accessName = (access) => (access === 'edit' ? L('편집', 'Can edit') : L('읽기', 'Read only'));
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
    const access = participantAccess(member.role);
    return `<div class="participant-row">${avatar(user)}<span class="grow">${esc(user.name)} <small>${esc(user.login || user.email || '')}</small></span>
      <select data-participant="${esc(user.id)}" aria-label="${esc(L('권한', 'Access'))}"><option value="read"${access === 'read' ? ' selected' : ''}>${esc(accessName('read'))}</option><option value="edit"${access === 'edit' ? ' selected' : ''}>${esc(accessName('edit'))}</option></select>
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
    <button type="button" class="small-button" data-action="add-participant" data-id="${esc(user.id)}" data-access="read">${icon('eye')}<span>${L('읽기', 'Read only')}</span></button>
    <button type="button" class="small-button" data-action="add-participant" data-id="${esc(user.id)}" data-access="edit">${icon('pencil')}<span>${L('편집', 'Can edit')}</span></button></div>`;
  const group = (title, glyph, people) => `<h3>${icon(glyph)}<span>${esc(title)}</span></h3>${people.map(choice).join('') || `<p class="muted">${L('없습니다.', 'None.')}</p>`}`;
  return `<div class="modal-back"><div class="modal participants">${heading('people', L('참여자', 'Participants'))}
    <p>${esc(project.name)} · ${esc(L('읽기는 보기만 할 수 있고, 편집은 이슈를 만들고 바꿀 수 있습니다.', 'Read only can look. Can edit can create and change issues.'))}</p>
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

function row(label, control) {
  return `<label class="form-row"><span>${label}</span>${control}</label>`;
}

export function renderModal(ctx) {
  const modal = ctx.ui.modal;
  if (!modal) return '';
  const project = ctx.project;
  if (modal.kind === 'confirm') {
    return `<div class="modal-back"><div class="modal">${heading('alert', L('확인', 'Confirm'))}<p>${esc(modal.message)}</p><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="button" class="button primary" data-action="confirm-yes">${icon('check')}<span>${L('계속', 'Continue')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'about') return aboutDialog(ctx);
  if (modal.kind === 'login') {
    return `<div class="modal-back"><div class="modal login-modal">${heading('user', L('로그인', 'Sign in'))}<p>${esc(L('튜토리얼을 실행하려면 등록된 사용자로 로그인하세요.', 'Sign in as a registered user to run the tutorial.'))}</p>${loginForm(ctx, { account: 'dialog-account', password: 'dialog-password' })}</div></div>`;
  }
  if (modal.kind === 'welcome') {
    const again = ctx.settings?.showWelcome !== false;
    return `<div class="modal-back"><div class="modal welcome">${heading('play', L('튜토리얼', 'Tutorial'))}<p>${esc(L('시작할 때 튜토리얼을 실행할까요? 쇼핑몰 예제로 주요 화면을 둘러봅니다. 나중에 시작 화면에서도 시작할 수 있습니다.', 'Run the tutorial at start? It walks the main screens with the shop example. You can also start it later from the start page.'))}</p><label class="check welcome-again">${icon('play')}<input type="checkbox" data-setting="showWelcome" ${again ? 'checked' : ''}>${L('시작할 때 이 창을 다시 보여주기', 'Show this window again at start')}</label><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('나중에', 'Later')}</span></button><button type="button" class="button primary" data-action="start-tutorial">${icon('play')}<span>${L('튜토리얼 시작', 'Start the tutorial')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'shortcuts') {
    const rows = shortcutGroups().map(([title, items]) => `<tr class="shortcut-group"><th colspan="2">${esc(title)}</th></tr>${items.map(([key, label]) => `<tr><td><kbd>${esc(key)}</kbd></td><td>${esc(label)}</td></tr>`).join('')}`).join('');
    return `<div class="modal-back"><div class="modal shortcut-modal">${heading('bolt', L('단축키', 'Shortcuts'))}<p class="muted">${L('글자를 입력하는 칸에서는 Ctrl 조합만 동작합니다. G를 누른 뒤 글자를 누르면 화면이 바뀝니다.', 'Only Ctrl combinations work while typing. Press G, then a letter, to change screens.')}</p><table class="data">${rows}</table><div class="modal-foot"><button type="button" class="button primary popup-close" data-action="modal-cancel">${icon('close')}<span>${L('닫기', 'Close')}</span></button></div></div></div>`;
  }
  if (modal.kind === 'palette') {
    return `<div class="modal-back"><form class="modal palette">${heading('search', L('이슈로 이동', 'Go to an issue'))}<input id="palette-search" data-palette="search" value="${esc(modal.query || '')}" placeholder="${esc(L('키 또는 요약', 'Key or summary'))}">${paletteItems(ctx, modal.query || '')}</form></div>`;
  }
  if (modal.kind === 'participants') return participantsDialog(ctx, modal);
  if (modal.kind === 'project') {
    const parents = orderedProjects(ctx.ws).filter((item) => allowed(ctx.ws, item, ctx.user?.id, 'admin'));
    const parent = parents.length ? row(L('상위 과제', 'Parent project'), `<select name="parent"><option value="">${esc(L('없음', 'None'))}</option>${parents.map((item) => `<option value="${esc(item.id)}"${item.id === modal.parentId ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</select>`) : '';
    return dialog(L('새 프로젝트', 'New project'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('키', 'Key'), '<input name="key" required maxlength="10" placeholder="SHOP">'),
      row(L('종류', 'Type'), `<select name="type">${options(PROJECT_TYPES, 'software')}</select>`),
      parent,
      row(L('설명', 'Description'), '<textarea name="description" rows="3"></textarea>'),
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
    return dialog(L('암호', 'Password'), [
      row(L('사람', 'Person'), `<select name="user">${userOptions(ctx.ws, ctx.user?.id || '')}</select>`),
      row(L('암호', 'Password'), '<input name="password" type="password" required>'),
    ].join(''), L('저장', 'Save'), 'lock');
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
    return dialog(L('사람', 'Person'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('메일', 'Email'), '<input name="email" type="email">'),
      row(L('역할', 'Role'), `<select name="role">${options(ROLES, 'developer')}</select>`),
    ].join(''), L('추가', 'Add'), 'user');
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
  const bar = `<div class="popup-bar">${closeButton()}</div>`;
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
    item('new-project', 'folder', L('새 프로젝트', 'New project')),
    item('go', 'board', L('보드', 'Board'), 'data-view="board"'),
  ].join('');
}

export { navLabel };
