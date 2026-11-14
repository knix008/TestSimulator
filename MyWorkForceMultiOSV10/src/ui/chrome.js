import { getLanguage } from '../i18n.js';
import { LIGHT_THEMES, DARK_THEMES } from '../themes.js';
import { PROJECT_TYPES, ROLES } from '../domain/catalog.js';
import { avatar, button, esc, icon, L, nameOf, options, pageHead, primary, userOptions } from './bits.js';

function item(action, glyph, label, extra = '', keys = '') {
  return `<button type="button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span>${keys ? `<kbd>${keys}</kbd>` : ''}</button>`;
}

function menu(ctx, id, label, body) {
  return `<div class="menu${ctx.ui.menu === id ? ' open' : ''}"><button type="button" class="menubar-item" data-menu="${id}">${label}</button><div class="menu-pop">${body}</div></div>`;
}

export function renderMenubar(ctx) {
  const project = ctx.project;
  const dirty = ctx.ui.dirty ? ' dirty' : '';
  const name = project ? esc(project.name) : '';
  const recent = (ctx.settings.recent || []).map((path) => item('open-recent', 'folder', esc(path.split(/[/\\]/).pop()), `data-path="${esc(path)}"`)).join('');
  const file = [
    item('new-project', 'plus', L('새 프로젝트', 'New project')),
    item('open-file', 'folder', L('열기', 'Open'), '', 'Ctrl+O'),
    item('save-file', 'save', L('저장', 'Save'), '', 'Ctrl+S'),
    item('save-as', 'save', L('다른 이름으로 저장', 'Save as')),
    '<div class="sep"></div>',
    item('export-md', 'download', L('Markdown로 내보내기', 'Export Markdown')),
    item('export-csv', 'download', L('CSV로 내보내기', 'Export CSV')),
    item('export-project', 'download', L('이 프로젝트만 내보내기', 'Export this project')),
    recent ? `<div class="sep"></div>${recent}` : '',
    '<div class="sep"></div>',
    item('print', 'box', L('인쇄', 'Print'), '', 'Ctrl+P'),
  ].join('');
  const edit = [
    item('undo', 'undo', L('실행 취소', 'Undo'), '', 'Ctrl+Z'),
    item('redo', 'redo', L('다시 실행', 'Redo'), '', 'Ctrl+Y'),
  ].join('');
  const view = ['home', 'board', 'backlog', 'issues', 'dashboard', 'reports', 'settings', 'help']
    .map((id) => `<button type="button" data-action="go" data-view="${id}"><span>${esc(navLabel(id))}</span></button>`).join('');
  const issue = [
    item('new-issue', 'plus', L('새 이슈', 'New issue'), '', 'Ctrl+N'),
    item('clone-issue', 'copy', L('복제', 'Clone')),
    item('delete-issue', 'trash', L('삭제', 'Delete')),
  ].join('');
  const plan = [
    item('go', 'backlog', L('백로그', 'Backlog'), 'data-view="backlog"'),
    item('go', 'board', L('보드', 'Board'), 'data-view="board"'),
    item('new-sprint', 'play', L('스프린트 만들기', 'New sprint')),
    item('go', 'roadmap', L('로드맵', 'Roadmap'), 'data-view="roadmap"'),
  ].join('');
  const help = [
    item('go', 'help', L('사용 설명서', "User's guide"), 'data-view="help"'),
    item('help-doc', 'help', 'WQL', 'data-id="wql"'),
    item('shortcuts', 'bolt', L('단축키', 'Shortcuts')),
    item('about', 'help', L('정보', 'About')),
  ].join('');
  const controls = ctx.desktop ? `<div class="window-controls">
      <button type="button" class="window-button" data-window="minimize" title="${esc(L('최소화', 'Minimize'))}">${icon('minus')}</button>
      <button type="button" class="window-button" data-window="maximize" title="${esc(L('최대화', 'Maximize'))}">${icon(ctx.ui.maximized ? 'restore' : 'square')}</button>
      <button type="button" class="window-button close" data-window="close" title="${esc(L('닫기', 'Close'))}">${icon('close')}</button>
    </div>` : '';
  return `<div class="app-brand" data-window-drag><img class="app-brand-icon" src="./icon.png" alt="" data-window-drag><span class="app-brand-name" data-window-drag>MyWorkForce</span><span class="app-brand-version" data-window-drag>v${esc(ctx.version)}</span><span class="app-brand-project${dirty}${project ? '' : ' empty'}" data-window-drag><span class="app-brand-project-name" data-window-drag>${name}</span><span class="app-brand-dirty" data-window-drag>●</span></span></div>
    ${menu(ctx, 'file', L('파일', 'File'), file)}
    ${menu(ctx, 'edit', L('편집', 'Edit'), edit)}
    ${menu(ctx, 'view', L('보기', 'View'), view)}
    ${menu(ctx, 'issue', L('이슈', 'Issue'), issue)}
    ${menu(ctx, 'plan', L('계획', 'Plan'), plan)}
    ${menu(ctx, 'help', L('도움말', 'Help'), help)}
    <div class="menubar-drag" data-window-drag></div>${controls}`;
}

function navLabel(id) {
  const names = {
    home: L('홈', 'Home'), board: L('보드', 'Board'), backlog: L('백로그', 'Backlog'), roadmap: L('로드맵', 'Roadmap'),
    issues: L('이슈', 'Issues'), queues: L('대기열', 'Queues'), dashboard: L('대시보드', 'Dashboard'), reports: L('보고서', 'Reports'),
    releases: L('릴리스', 'Releases'), components: L('구성 요소', 'Components'), filters: L('필터', 'Filters'), people: L('사람', 'People'),
    health: L('점검', 'Health'), notifications: L('알림', 'Notifications'), settings: L('설정', 'Settings'), help: L('도움말', 'Help'),
  };
  return names[id] || id;
}

export function renderToolbar(ctx) {
  const projects = ctx.ws.projects.map((project) => ({ id: project.id, name: `${project.key} · ${project.name}` }));
  const users = ctx.ws.users.filter((user) => user.active !== false).map((user) => ({ id: user.id, name: user.name }));
  const unread = ctx.project ? ctx.project.notifications.filter((item) => item.userId === ctx.user?.id && !item.read).length : 0;
  const swatches = ctx.ui.popover === 'theme' ? `<div class="popover theme-pop">
      <p>${L('라이트', 'Light')}</p><div class="swatches">${DARK_THEMES && LIGHT_THEMES.map((theme) => swatch(theme)).join('')}</div>
      <p>${L('다크', 'Dark')}</p><div class="swatches">${DARK_THEMES.map((theme) => swatch(theme)).join('')}</div>
      <button type="button" data-action="pick-theme" data-id="system">${L('시스템 설정', 'System setting')}</button>
    </div>` : '';
  return `<div class="toolbar-inner">
      <select data-choose="project" title="${esc(L('프로젝트', 'Project'))}">${options(projects, ctx.ws.activeProjectId, L('프로젝트 없음', 'No project'))}</select>
      <label class="quick-search">${icon('search')}<input id="quick-search" value="${esc(ctx.ui.quick || '')}" placeholder="${esc(L('검색 또는 WQL', 'Search or WQL'))}"></label>
      <button type="button" class="tool-button" data-action="command-palette" title="${esc(L('이동', 'Go to'))} Ctrl+K">${icon('search')}</button>
      <span class="tool-sep"></span>
      <button type="button" class="tool-button wide" data-action="new-issue">${icon('plus')}<span>${L('이슈', 'Issue')}</span></button>
      <span class="grow"></span>
      <button type="button" class="tool-button" data-action="go" data-view="notifications" title="${esc(L('알림', 'Notifications'))}">${icon('bell')}${unread ? `<i class="dot">${unread}</i>` : ''}</button>
      <select data-choose="user" title="${esc(L('현재 사용자', 'Current user'))}">${options(users, ctx.ws.currentUserId)}</select>
      <button type="button" class="tool-button wide" data-action="language">${ctx.settings.language === 'en' ? 'EN' : 'KO'}</button>
      <span class="theme-anchor"><button type="button" class="tool-button" data-action="theme-toggle" title="${esc(L('테마', 'Theme'))}">${icon('sun')}</button>${swatches}</span>
    </div>`;
}

function swatch(theme) {
  const [bg, , accent] = theme.swatch || [theme.colors.bg, theme.colors.surface, theme.colors.accent];
  const title = theme.name?.[getLanguage()] || theme.id;
  return `<button type="button" class="swatch" data-action="pick-theme" data-id="${esc(theme.id)}" title="${esc(title)}" style="background:${bg}"><i style="background:${accent}"></i></button>`;
}

const NAV = [
  ['work', [['home', 'home'], ['board', 'board'], ['backlog', 'backlog'], ['roadmap', 'roadmap'], ['issues', 'issues'], ['queues', 'list']]],
  ['look', [['dashboard', 'dashboard'], ['reports', 'chart'], ['releases', 'release'], ['components', 'component'], ['filters', 'filter'], ['health', 'alert']]],
  ['manage', [['people', 'people'], ['notifications', 'bell'], ['settings', 'settings'], ['help', 'help']]],
];

export function renderNav(ctx) {
  const sections = { work: L('작업', 'Work'), look: L('살펴보기', 'Review'), manage: L('관리', 'Manage') };
  const unread = ctx.project ? ctx.project.notifications.filter((item) => item.userId === ctx.user?.id && !item.read).length : 0;
  return NAV.map(([section, items]) => {
    const buttons = items.filter(([id]) => id !== 'queues' || ctx.project?.type === 'service' || (ctx.project?.queues || []).length).map(([id, glyph]) => {
      const count = id === 'notifications' && unread ? `<i class="count">${unread}</i>` : '';
      return `<button type="button" class="nav-button${ctx.ui.view === id ? ' active' : ''}" data-action="go" data-view="${id}">${icon(glyph)}<span>${esc(navLabel(id))}</span>${count}</button>`;
    }).join('');
    return `<div class="nav-section">${sections[section]}</div>${buttons}`;
  }).join('');
}

export function renderStatus(ctx) {
  const project = ctx.project;
  const count = project ? project.issues.length : 0;
  const hint = ctx.ui.queryError ? L('질의 문법을 확인하세요.', 'Check the query syntax.') : (project ? L(`${count}개 이슈`, `${count} issues`) : L('프로젝트를 여세요.', 'Open a project.'));
  const where = ctx.ui.path ? ctx.ui.path.split(/[/\\]/).pop() : L('이 기기에 자동 저장', 'Saved on this device');
  return `<span>${hint}</span><span class="grow"></span><span>${esc(project ? `${project.key} · ${nameOf(PROJECT_TYPES.find((type) => type.id === project.type))}` : '')}</span><span class="tool-sep"></span><span>${ctx.user ? avatar(ctx.user) : ''}${esc(ctx.user?.name || '')}</span><span>${esc(where)}</span>`;
}

function dialog(title, body, submit) {
  return `<div class="modal-back"><form class="modal"><h2>${title}</h2><div class="modal-body">${body}</div><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${L('취소', 'Cancel')}</button><button type="submit" class="button primary">${submit}</button></div></form></div>`;
}

function row(label, control) {
  return `<label class="form-row"><span>${label}</span>${control}</label>`;
}

export function renderModal(ctx) {
  const modal = ctx.ui.modal;
  if (!modal) return '';
  const project = ctx.project;
  if (modal.kind === 'confirm') {
    return `<div class="modal-back"><div class="modal"><h2>${L('확인', 'Confirm')}</h2><p>${esc(modal.message)}</p><div class="modal-foot"><button type="button" class="button" data-action="modal-cancel">${L('취소', 'Cancel')}</button><button type="button" class="button primary" data-action="confirm-yes">${L('계속', 'Continue')}</button></div></div></div>`;
  }
  if (modal.kind === 'about') {
    const info = ctx.ui.about || {};
    return `<div class="modal-back"><div class="modal about"><img src="./icon.png" alt="" width="64" height="64"><h2>MyWorkForce</h2><p>v${esc(ctx.version)}</p><p class="muted">${esc([info.os, info.arch, info.target].filter(Boolean).join(' · '))}</p><p class="muted">${esc(info.commit || '')}</p><div class="modal-foot"><button type="button" class="button primary" data-action="modal-cancel">${L('닫기', 'Close')}</button></div></div></div>`;
  }
  if (modal.kind === 'shortcuts') {
    const rows = [
      ['Ctrl+K', L('이슈로 이동', 'Go to an issue')],
      ['Ctrl+N', L('새 이슈', 'New issue')],
      ['Ctrl+S', L('저장', 'Save')],
      ['Ctrl+O', L('열기', 'Open')],
      ['Ctrl+Z', L('실행 취소', 'Undo')],
      ['Ctrl+Y', L('다시 실행', 'Redo')],
      ['Ctrl+P', L('인쇄', 'Print')],
      ['Enter', L('검색 실행', 'Run the search')],
      ['Esc', L('창 닫기', 'Close a dialog')],
    ];
    return `<div class="modal-back"><div class="modal"><h2>${L('단축키', 'Shortcuts')}</h2><table class="data">${rows.map(([key, label]) => `<tr><td><kbd>${key}</kbd></td><td>${label}</td></tr>`).join('')}</table><div class="modal-foot"><button type="button" class="button primary" data-action="modal-cancel">${L('닫기', 'Close')}</button></div></div></div>`;
  }
  if (modal.kind === 'palette') {
    return `<div class="modal-back"><form class="modal palette"><h2>${L('이슈로 이동', 'Go to an issue')}</h2><input id="palette-search" data-palette="search" value="${esc(modal.query || '')}" placeholder="${esc(L('키 또는 요약', 'Key or summary'))}">${paletteItems(ctx, modal.query || '')}</form></div>`;
  }
  if (modal.kind === 'project') {
    return dialog(L('새 프로젝트', 'New project'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('키', 'Key'), '<input name="key" required maxlength="10" placeholder="SHOP">'),
      row(L('종류', 'Type'), `<select name="type">${options(PROJECT_TYPES, 'software')}</select>`),
      row(L('설명', 'Description'), '<textarea name="description" rows="3"></textarea>'),
    ].join(''), L('만들기', 'Create'));
  }
  if (modal.kind === 'issue' && project) {
    return dialog(L('새 이슈', 'New issue'), [
      row(L('유형', 'Type'), `<select name="type">${options(project.issueTypes, modal.typeId || 'story')}</select>`),
      row(L('요약', 'Summary'), '<input name="summary" required>'),
      row(L('설명', 'Description'), '<textarea name="description" rows="4"></textarea>'),
      row(L('우선순위', 'Priority'), `<select name="priority">${options(project.priorities, 'medium')}</select>`),
      row(L('담당', 'Assignee'), `<select name="assignee">${userOptions(ctx.ws, ctx.user?.id || '')}</select>`),
      row(L('에픽', 'Epic'), `<select name="epic">${options(project.issues.filter((issue) => issue.typeId === 'epic'), modal.epicId || '', L('없음', 'None'))}</select>`),
      row(L('스프린트', 'Sprint'), `<select name="sprint">${options(project.sprints.filter((sprint) => sprint.state !== 'closed'), modal.sprintId || '', L('백로그', 'Backlog'))}</select>`),
      row(L('포인트', 'Points'), '<input name="points" inputmode="decimal">'),
      modal.parentId ? `<input type="hidden" name="parent" value="${esc(modal.parentId)}">` : '',
    ].join(''), L('만들기', 'Create'));
  }
  if (modal.kind === 'sprint') {
    return dialog(L('스프린트', 'Sprint'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('목표', 'Goal'), '<input name="goal">'),
      row(L('시작', 'Start'), '<input name="start" type="date" required>'),
      row(L('끝', 'End'), '<input name="end" type="date" required>'),
    ].join(''), L('만들기', 'Create'));
  }
  if (modal.kind === 'complete' && project) {
    const futures = project.sprints.filter((sprint) => sprint.state === 'future');
    return dialog(L('스프린트 완료', 'Complete sprint'), `<p>${L('끝내지 못한 이슈를 어디로 보낼까요?', 'Where should unfinished issues go?')}</p>
      <label class="check"><input type="radio" name="dest" value="backlog" checked> ${L('백로그', 'Backlog')}</label>
      ${futures.map((sprint) => `<label class="check"><input type="radio" name="dest" value="${esc(sprint.id)}"> ${esc(sprint.name)}</label>`).join('')}`, L('완료', 'Complete'));
  }
  if (modal.kind === 'status') {
    return dialog(L('상태', 'Status'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('구분', 'Category'), `<select name="category"><option value="new">${L('시작 전', 'To do')}</option><option value="indeterminate">${L('진행', 'In progress')}</option><option value="done">${L('완료', 'Done')}</option></select>`),
    ].join(''), L('추가', 'Add'));
  }
  if (modal.kind === 'transition' && project) {
    return dialog(L('전이', 'Transition'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('에서', 'From'), `<select name="from">${options(project.statuses, project.statuses[0]?.id)}</select>`),
      row(L('으로', 'To'), `<select name="to">${options(project.statuses, project.statuses[1]?.id || project.statuses[0]?.id)}</select>`),
    ].join(''), L('추가', 'Add'));
  }
  if (modal.kind === 'field') {
    return dialog(L('필드', 'Field'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('종류', 'Type'), `<select name="fieldType"><option value="text">${L('글', 'Text')}</option><option value="number">${L('숫자', 'Number')}</option><option value="select">${L('선택', 'Select')}</option><option value="date">${L('날짜', 'Date')}</option><option value="user">${L('사람', 'Person')}</option></select>`),
      row(L('선택지', 'Options'), `<input name="options" placeholder="${esc(L('쉼표로 구분', 'Comma separated'))}">`),
    ].join(''), L('추가', 'Add'));
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
    ].join(''), L('추가', 'Add'));
  }
  if (modal.kind === 'user') {
    return dialog(L('사람', 'Person'), [
      row(L('이름', 'Name'), '<input name="name" required>'),
      row(L('메일', 'Email'), '<input name="email" type="email">'),
      row(L('역할', 'Role'), `<select name="role">${options(ROLES, 'developer')}</select>`),
    ].join(''), L('추가', 'Add'));
  }
  if (modal.kind === 'component' || modal.kind === 'version' || modal.kind === 'group' || modal.kind === 'filter') {
    const titles = { component: L('구성 요소', 'Component'), version: L('버전', 'Version'), group: L('그룹', 'Group'), filter: L('필터', 'Filter') };
    return dialog(titles[modal.kind], [
      row(L('이름', 'Name'), '<input name="name" required>'),
      modal.kind === 'component' || modal.kind === 'version' ? row(L('설명', 'Description'), '<textarea name="description" rows="2"></textarea>') : '',
    ].join(''), L('추가', 'Add'));
  }
  return '';
}

export function paletteItems(ctx, text) {
  if (!ctx.project) return '';
  const needle = String(text || '').trim().toLowerCase();
  const issues = ctx.project.issues.filter((issue) => !needle || issue.key.toLowerCase().includes(needle) || issue.summary.toLowerCase().includes(needle)).slice(0, 12);
  return `<div id="palette-results">${issues.map((issue) => `<button type="button" data-action="open-issue" data-id="${esc(issue.id)}"><span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span></button>`).join('') || `<p class="empty">${L('없음', 'Nothing to show')}</p>`}</div>`;
}

export { navLabel };
