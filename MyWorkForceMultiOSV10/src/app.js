import guideEn from '../UsersGuide.en.md?raw';
import guideKo from '../UsersGuide.md?raw';
import wqlEn from '../docs/WQL.en.md?raw';
import wqlKo from '../docs/WQL.md?raw';
import { toCsv, toMarkdown } from './domain/export.js';
import { allowed } from './domain/permissions.js';
import { sampleWorkspace } from './domain/sample.js';
import { loadSettings, rememberPath, saveSettings } from './domain/settings.js';
import {
  addAttachment, addComment, addComponent, addField, addGadget, addGroup, addLink, addRule, addStatus, addTransition,
  addUser, addVersion, addWorklog, blankWorkspace, cloneIssue, completeSprint, createIssue, createSprint, deleteComment,
  deleteFilter, deleteIssue, deleteRule, deleteWorklog, findIssue, markAllRead, markRead, mergeProject, newProject,
  projectDocument, rankIssues, readDocument,   releaseVersion, removeAttachment, removeField, removeGadget, removeLink,
  removeStatus, removeTransition, saveFilter, setArchived, setCustomField, setMember, setUserActive,
  startSprint, toggleGroupUser, toggleWatch, updateIssue, updateProject, upgradeWorkspace, workspaceDocument,
} from './domain/store.js';
import { fromDateInput, parseDuration, uid } from './domain/util.js';
import { getLanguage, L, setLanguage } from './i18n.js';
import { appInfo, chooseOpen, chooseSave, dragWindow, errorText, isDesktop, readTextFile, setBackendLanguage, setWindowTheme, showMain, startupFiles, windowControl, writeTextFile } from './platform/native.js';
import { loadLocal, saveLocal } from './platform/storage.js';
import { applyFont, applyTheme, customFrom, resolveTheme } from './themes.js';
import { paletteItems, renderMenubar, renderModal, renderNav, renderStatus, renderToolbar } from './ui/chrome.js';
import { renderRight, renderView, showRight } from './ui/pages.js';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const ERRORS = {
  'summary-required': ['내용을 입력하세요.', 'Enter the text.'],
  'name-required': ['이름을 입력하세요.', 'Enter a name.'],
  'parent-required': ['하위 작업에는 상위 이슈가 필요합니다.', 'A sub-task needs a parent issue.'],
  permission: ['권한이 없습니다.', 'You do not have permission.'],
  'sprint-active': ['이 보드에는 이미 진행 중인 스프린트가 있습니다.', 'This board already has an active sprint.'],
  'sprint-dates': ['스프린트 시작과 끝을 확인하세요.', 'Check the sprint start and end.'],
  'sprint-state': ['이 스프린트는 지금 그렇게 바꿀 수 없습니다.', 'That sprint cannot be changed that way.'],
  'key-invalid': ['키는 영문 대문자로 시작하는 2–10자입니다.', 'A key is 2–10 characters and starts with a capital letter.'],
  'duplicate-key': ['같은 키가 이미 있습니다.', 'That key already exists.'],
  'duplicate-user': ['같은 메일이 이미 있습니다.', 'That email already exists.'],
  'not-found': ['대상을 찾을 수 없습니다.', 'That item was not found.'],
  'transition-blocked': ['이 상태로는 옮길 수 없습니다.', 'That move is not allowed.'],
  'file-invalid': ['이 파일은 작업 공간이 아닙니다.', 'This file is not a workspace.'],
  'attachment-big': ['첨부는 700KB 이하만 넣을 수 있습니다.', 'Attachments must be 700KB or smaller.'],
  'self-link': ['이슈를 자기 자신에게 연결할 수 없습니다.', 'An issue cannot be linked to itself.'],
  query: ['질의 문법을 확인하세요.', 'Check the query syntax.'],
  'status-used': ['이 상태를 쓰는 이슈가 있습니다.', 'Issues still use this status.'],
};

let ws = blankWorkspace();
let ui = freshUi();
let undo = [];
let redo = [];
let saveTimer = 0;
let toastTimer = 0;
const settings = loadSettings();

function freshUi() {
  return {
    view: 'home', boardId: null, issueId: null, query: '', quick: '', sort: null, selected: [],
    modal: null, menu: null, popover: null, issueTab: 'details', epicId: '', queueId: '',
    report: 'burndown', help: 'guide', path: null, dirty: false, maximized: false, preview: false,
    about: null, queryError: null, textSnap: null, textField: '', textIssue: null,
  };
}

function project() {
  return ws.projects.find((item) => item.id === ws.activeProjectId) || null;
}

function actor() {
  return ws.currentUserId;
}

function prefersDark() {
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function message(error) {
  const code = error?.message || errorText(error);
  const pair = ERRORS[code];
  return pair ? L(pair[0], pair[1]) : code;
}

function toast(text) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function fail(error) {
  toast(message(error));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveLocal(ws).catch((error) => fail(error)); }, 400);
}

function mutate(fn) {
  const snap = structuredClone(ws);
  try {
    fn();
  } catch (error) {
    ws = snap;
    fail(error);
    paint();
    return false;
  }
  undo.push(snap);
  if (undo.length > 40) undo.shift();
  redo = [];
  if (ui.path) ui.dirty = true;
  scheduleSave();
  paint();
  return true;
}

function context() {
  const active = ws.users.find((user) => user.id === ws.currentUserId && user.active !== false) || ws.users.find((user) => user.active !== false) || null;
  if (active && active.id !== ws.currentUserId) ws.currentUserId = active.id;
  const current = project();
  return {
    ws, ui, settings, project: current, user: active, desktop: isDesktop(), version: VERSION, now: Date.now(),
    guide: ui.help === 'wql' ? (getLanguage() === 'en' ? wqlEn : wqlKo) : (getLanguage() === 'en' ? guideEn : guideKo),
  };
}

function paint() {
  const ctx = context();
  if (!ctx.project && !['home', 'help'].includes(ui.view)) ui.view = 'home';
  if (ctx.project && !ctx.project.boards.some((board) => board.id === ui.boardId)) {
    ui.boardId = ctx.project.boards.find((board) => board.type === 'scrum')?.id || ctx.project.boards[0]?.id || null;
  }
  const skipSearch = document.activeElement?.id === 'quick-search';
  const skipQuery = document.activeElement?.id === 'issue-query';
  const skipLive = Boolean(document.activeElement?.dataset?.live);
  document.querySelector('#app').classList.toggle('no-right', !showRight(ctx));
  if (ui.view !== 'issues') ui.queryError = null;
  document.querySelector('#menubar').innerHTML = renderMenubar(ctx);
  if (!skipSearch) document.querySelector('#toolbar').innerHTML = renderToolbar(ctx);
  document.querySelector('#left').innerHTML = renderNav(ctx);
  if (!skipLive && !skipQuery) {
    document.querySelector('#view').innerHTML = renderView(ctx);
    document.querySelector('#right').innerHTML = showRight(ctx) ? renderRight(ctx) : '';
  }
  document.querySelector('#statusbar').innerHTML = renderStatus(ctx);
  const modal = document.querySelector('#modal');
  const kind = ui.modal?.kind || '';
  if (modal.dataset.kind !== kind) {
    modal.innerHTML = renderModal(ctx);
    modal.hidden = !kind;
    modal.dataset.kind = kind;
    if (kind) modal.querySelector('input, textarea, select')?.focus();
  }
  document.title = ctx.project ? `MyWorkForce — ${ctx.project.name}` : 'MyWorkForce';
}

function ensureProject() {
  if (project()) return true;
  toast(L('먼저 프로젝트를 만드세요.', 'Create a project first.'));
  return false;
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readControl(el) {
  const parse = el.dataset.parse;
  if (parse === 'number') return el.value.trim() === '' ? null : Number(el.value);
  if (parse === 'duration') return parseDuration(el.value);
  if (parse === 'date') return fromDateInput(el.value);
  if (parse === 'labels') return el.value.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  return el.value;
}

function checkedValues(name) {
  return [...document.querySelectorAll(`[data-multi="${name}"]:checked`)].map((el) => el.value);
}

async function pickAndLoad() {
  try {
    if (isDesktop()) {
      const path = await chooseOpen();
      if (!path) return;
      ingest(await readTextFile(path), path);
    } else document.querySelector('#file-open').click();
  } catch (error) { fail(error); }
}

function ingest(text, path) {
  let data;
  try { data = JSON.parse(text); } catch { fail(new Error('file-invalid')); return; }
  let doc;
  try { doc = readDocument(data); } catch (error) { fail(error); return; }
  if (doc.mode === 'workspace') ws = upgradeWorkspace(structuredClone(doc.workspace));
  else mergeProject(ws, structuredClone(doc.project), doc.users, doc.groups);
  if (doc.mode === 'workspace') ui.path = path || null;
  ui.dirty = false;
  ui.issueId = null;
  ui.selected = [];
  ui.view = ws.projects.length ? 'board' : 'home';
  undo = [];
  redo = [];
  if (path && doc.mode === 'workspace') rememberPath(path);
  scheduleSave();
  paint();
  toast(L('열었습니다.', 'Opened.'));
}

async function saveFile(saveAs) {
  const doc = workspaceDocument(ws);
  const text = JSON.stringify(doc, null, 2);
  const filename = `${project()?.key || 'workspace'}.mwf`;
  try {
    if (!isDesktop()) {
      download(text, filename, 'application/json');
      ui.dirty = false;
      paint();
      return;
    }
    let path = saveAs ? null : ui.path;
    if (!path) path = await chooseSave(filename);
    if (!path) return;
    await writeTextFile(path, text);
    ui.path = path;
    ui.dirty = false;
    rememberPath(path);
    paint();
    toast(L('저장했습니다.', 'Saved.'));
  } catch (error) { fail(error); }
}

async function exportText(kind) {
  const current = project();
  if (!current) return;
  const issues = current.issues;
  const text = kind === 'csv' ? toCsv(ws, current, issues, getLanguage()) : (kind === 'project' ? JSON.stringify(projectDocument(ws, current.id), null, 2) : toMarkdown(ws, current, issues, getLanguage()));
  const ext = kind === 'csv' ? 'csv' : kind === 'project' ? 'mwf' : 'md';
  const filename = `${current.key}.${ext}`;
  try {
    if (isDesktop()) {
      const path = await chooseSave(filename, [ext]);
      if (!path) return;
      await writeTextFile(path, text);
    } else download(text, filename, 'text/plain');
    toast(L('내보냈습니다.', 'Exported.'));
  } catch (error) { fail(error); }
}

function submitModal(form) {
  const modal = ui.modal;
  if (!modal) return;
  if (modal.kind === 'palette') {
    const first = document.querySelector('#palette-results [data-id]');
    if (first) { ui.issueId = first.dataset.id; ui.view = 'issue'; }
    ui.modal = null;
    paint();
    return;
  }
  const data = new FormData(form);
  const value = (name) => String(data.get(name) ?? '').trim();
  const ok = mutate(() => {
    const current = project();
    if (modal.kind === 'project') {
      newProject(ws, { name: value('name'), key: value('key'), type: value('type'), description: value('description'), leadId: actor() });
      ui.view = 'board';
      return;
    }
    if (!current) throw new Error('not-found');
    if (modal.kind === 'issue') {
      const issue = createIssue(ws, current.id, {
        typeId: value('type') || 'task', summary: value('summary'), description: value('description'),
        priorityId: value('priority') || 'medium', assigneeId: value('assignee'), epicId: value('epic'),
        sprintId: value('sprint'), storyPoints: value('points') === '' ? null : Number(value('points')),
        parentId: value('parent'),
      }, actor());
      ui.issueId = issue.id;
      ui.view = 'issue';
      return;
    }
    if (modal.kind === 'sprint') {
      createSprint(ws, current.id, { name: value('name'), goal: value('goal'), start: fromDateInput(value('start')), end: fromDateInput(value('end')), boardId: ui.boardId }, actor());
      return;
    }
    if (modal.kind === 'complete') {
      completeSprint(ws, current.id, modal.id, value('dest') || 'backlog', actor());
      return;
    }
    if (modal.kind === 'status') { addStatus(ws, current.id, { name: value('name'), category: value('category') }, actor()); return; }
    if (modal.kind === 'transition') { addTransition(ws, current.id, { name: value('name'), from: value('from'), to: value('to') }, actor()); return; }
    if (modal.kind === 'field') { addField(ws, current.id, { name: value('name'), type: value('fieldType'), options: value('options') }, actor()); return; }
    if (modal.kind === 'rule') {
      addRule(ws, current.id, { name: value('name'), when: value('when'), typeId: value('type'), statusId: value('status'), then: value('then'), userId: value('user'), priorityId: value('priority'), label: value('label') }, actor());
      return;
    }
    if (modal.kind === 'user') {
      const user = addUser(ws, { name: value('name'), email: value('email') });
      if (value('role')) setMember(ws, current.id, user.id, value('role'), actor());
      return;
    }
    if (modal.kind === 'component') { addComponent(ws, current.id, { name: value('name'), description: value('description'), leadId: actor() }, actor()); return; }
    if (modal.kind === 'version') { addVersion(ws, current.id, { name: value('name'), description: value('description') }, actor()); return; }
    if (modal.kind === 'group') { addGroup(ws, value('name'), actor(), current.id); return; }
    if (modal.kind === 'filter') { saveFilter(ws, current.id, { name: value('name'), query: ui.query }, actor()); return; }
  });
  if (ok) { ui.modal = null; paint(); }
}

function confirm(messageText, action, id = null) {
  ui.modal = { kind: 'confirm', message: messageText, action, id };
  paint();
}

function runConfirmed() {
  const modal = ui.modal;
  ui.modal = null;
  if (!modal) return;
  if (modal.action === 'open-file') { paint(); pickAndLoad(); return; }
  if (modal.action === 'load-sample') {
    ws = sampleWorkspace();
    ui = { ...freshUi(), view: 'board' };
    undo = []; redo = [];
    scheduleSave();
    paint();
    return;
  }
  if (modal.action === 'empty') {
    ws = blankWorkspace();
    ui = freshUi();
    undo = []; redo = [];
    scheduleSave();
    paint();
    return;
  }
  if (modal.action === 'delete-issue') mutate(() => { deleteIssue(ws, project().id, ui.issueId, actor()); ui.issueId = null; ui.view = 'issues'; });
}

function onAction(el) {
  const name = el.dataset.action;
  const current = project();
  if (name === 'go') { ui.view = el.dataset.view || 'home'; paint(); return; }
  if (name === 'activate') { ws.activeProjectId = el.dataset.id; ui.issueId = null; ui.selected = []; ui.boardId = null; ui.view = 'board'; scheduleSave(); paint(); return; }
  if (name === 'open-issue') { ui.issueId = el.dataset.id; ui.view = 'issue'; ui.issueTab = 'details'; ui.modal = null; paint(); return; }
  if (name === 'select-issue') { ui.issueId = el.dataset.id; paint(); return; }
  if (name === 'issue-tab') { ui.issueTab = el.dataset.id; paint(); return; }
  if (name === 'theme-toggle') { ui.popover = ui.popover === 'theme' ? null : 'theme'; ui.menu = null; paint(); return; }
  if (name === 'pick-theme') {
    settings.theme = el.dataset.id;
    saveSettings();
    const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
    applyTheme(theme);
    setWindowTheme(theme.dark);
    ui.popover = null;
    paint();
    return;
  }
  if (name === 'language') {
    settings.language = settings.language === 'en' ? 'ko' : 'en';
    setLanguage(settings.language);
    saveSettings();
    setBackendLanguage(settings.language);
    paint();
    return;
  }
  if (name === 'modal-cancel') { ui.modal = null; paint(); return; }
  if (name === 'confirm-yes') { runConfirmed(); return; }
  if (name === 'new-project') { ui.modal = { kind: 'project' }; paint(); return; }
  if (name === 'new-issue') { if (ensureProject()) { ui.modal = { kind: 'issue', typeId: 'story' }; paint(); } return; }
  if (name === 'create-subtask') { if (ui.issueId) { ui.modal = { kind: 'issue', typeId: 'subtask', parentId: ui.issueId }; paint(); } return; }
  if (name === 'new-sprint') { if (ensureProject()) { ui.modal = { kind: 'sprint' }; paint(); } return; }
  if (name === 'new-status') { ui.modal = { kind: 'status' }; paint(); return; }
  if (name === 'new-transition') { ui.modal = { kind: 'transition' }; paint(); return; }
  if (name === 'new-field') { ui.modal = { kind: 'field' }; paint(); return; }
  if (name === 'new-rule') { ui.modal = { kind: 'rule' }; paint(); return; }
  if (name === 'new-user') { ui.modal = { kind: 'user' }; paint(); return; }
  if (name === 'new-component') { ui.modal = { kind: 'component' }; paint(); return; }
  if (name === 'new-version') { ui.modal = { kind: 'version' }; paint(); return; }
  if (name === 'new-group') { ui.modal = { kind: 'group' }; paint(); return; }
  if (name === 'save-filter') { if (ensureProject()) { ui.modal = { kind: 'filter' }; paint(); } return; }
  if (name === 'open-file') { confirm(L('현재 작업 공간을 파일 내용으로 바꿀까요?', 'Replace the workspace with the file?'), 'open-file'); return; }
  if (name === 'load-sample') { confirm(L('예제 작업 공간으로 바꿀까요?', 'Replace the workspace with the example?'), 'load-sample'); return; }
  if (name === 'empty-workspace') { confirm(L('빈 작업 공간으로 바꿀까요?', 'Replace the workspace with an empty one?'), 'empty'); return; }
  if (name === 'save-file') { saveFile(false); return; }
  if (name === 'save-as') { saveFile(true); return; }
  if (name === 'export-md') { exportText('md'); return; }
  if (name === 'export-csv') { exportText('csv'); return; }
  if (name === 'export-project') { exportText('project'); return; }
  if (name === 'print') { window.print(); return; }
  if (name === 'undo') { if (undo.length) { redo.push(structuredClone(ws)); ws = undo.pop(); if (ui.path) ui.dirty = true; scheduleSave(); paint(); } return; }
  if (name === 'redo') { if (redo.length) { undo.push(structuredClone(ws)); ws = redo.pop(); if (ui.path) ui.dirty = true; scheduleSave(); paint(); } return; }
  if (name === 'about') { ui.modal = { kind: 'about' }; paint(); appInfo().then((info) => { ui.about = info; const modal = document.querySelector('#modal'); if (modal) { modal.dataset.kind = ''; paint(); } }); return; }
  if (name === 'shortcuts') { ui.modal = { kind: 'shortcuts' }; paint(); return; }
  if (name === 'command-palette') { if (ensureProject()) { ui.modal = { kind: 'palette', query: '' }; paint(); } return; }
  if (name === 'help-doc') { ui.help = el.dataset.id || 'guide'; ui.view = 'help'; paint(); return; }
  if (name === 'open-recent') { readTextFile(el.dataset.path).then((text) => ingest(text, el.dataset.path)).catch(fail); return; }
  if (!current) { ensureProject(); return; }
  if (name === 'transition') { mutate(() => updateIssue(ws, current.id, ui.issueId, { statusId: el.dataset.to }, actor())); return; }
  if (name === 'clone-issue') { if (!ui.issueId) return; mutate(() => { const copy = cloneIssue(ws, current.id, ui.issueId, actor()); ui.issueId = copy.id; ui.view = 'issue'; }); return; }
  if (name === 'delete-issue') { if (ui.issueId) confirm(L('이 이슈와 하위 작업을 지울까요?', 'Delete this issue and its sub-tasks?'), 'delete-issue'); return; }
  if (name === 'add-comment') { const body = document.querySelector('#comment-body')?.value || ''; mutate(() => addComment(ws, current.id, ui.issueId, body, actor())); return; }
  if (name === 'delete-comment') { mutate(() => deleteComment(ws, current.id, ui.issueId, el.dataset.id, actor())); return; }
  if (name === 'add-worklog') {
    const minutes = parseDuration(document.querySelector('#work-minutes')?.value || '');
    const comment = document.querySelector('#work-note')?.value || '';
    mutate(() => addWorklog(ws, current.id, ui.issueId, { minutes, comment }, actor()));
    return;
  }
  if (name === 'delete-worklog') { mutate(() => deleteWorklog(ws, current.id, ui.issueId, el.dataset.id, actor())); return; }
  if (name === 'add-link') {
    const type = document.querySelector('#link-type')?.value || 'relates';
    const key = document.querySelector('#link-key')?.value || '';
    mutate(() => addLink(ws, current.id, ui.issueId, type, key, actor()));
    return;
  }
  if (name === 'remove-link') { mutate(() => removeLink(ws, current.id, ui.issueId, el.dataset.id, actor())); return; }
  if (name === 'toggle-watch') { mutate(() => toggleWatch(ws, current.id, ui.issueId, actor())); return; }
  if (name === 'pick-attachment') { document.querySelector('#file-attach').click(); return; }
  if (name === 'remove-attachment') { mutate(() => removeAttachment(ws, current.id, ui.issueId, el.dataset.id, actor())); return; }
  if (name === 'start-sprint') { mutate(() => startSprint(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'complete-sprint') { ui.modal = { kind: 'complete', id: el.dataset.id }; paint(); return; }
  if (name === 'release') { mutate(() => releaseVersion(ws, current.id, el.dataset.id, el.dataset.on === '1', actor())); return; }
  if (name === 'run-filter') {
    const filter = current.filters.find((item) => item.id === el.dataset.id);
    if (filter) { ui.query = filter.query; ui.quick = filter.query; ui.view = 'issues'; paint(); }
    return;
  }
  if (name === 'delete-filter') { mutate(() => deleteFilter(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'select-one') {
    const id = el.dataset.id;
    ui.selected = ui.selected.includes(id) ? ui.selected.filter((item) => item !== id) : [...ui.selected, id];
    paint();
    return;
  }
  if (name === 'clear-selection') { ui.selected = []; paint(); return; }
  if (name === 'sort') {
    ui.sort = ui.sort?.field === el.dataset.field ? { field: el.dataset.field, dir: ui.sort.dir === 'asc' ? 'desc' : 'asc' } : { field: el.dataset.field, dir: 'asc' };
    paint();
    return;
  }
  if (name === 'report') { ui.report = el.dataset.id; paint(); return; }
  if (name === 'queue') { ui.queueId = el.dataset.id; paint(); return; }
  if (name === 'epic-filter') { ui.epicId = el.dataset.id || ''; paint(); return; }
  if (name === 'remove-gadget') { mutate(() => removeGadget(current, el.dataset.id)); return; }
  if (name === 'delete-status') { mutate(() => removeStatus(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'delete-transition') { mutate(() => removeTransition(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'delete-rule') { mutate(() => deleteRule(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'delete-field') { mutate(() => removeField(ws, current.id, el.dataset.id, actor())); return; }
  if (name === 'archive') { mutate(() => setArchived(ws, current.id, true, actor())); return; }
  if (name === 'unarchive') { mutate(() => setArchived(ws, current.id, false, actor())); return; }
  if (name === 'mark-read') { markRead(current, el.dataset.id, actor()); if (el.dataset.issue) { ui.issueId = el.dataset.issue; ui.view = 'issue'; } scheduleSave(); paint(); return; }
  if (name === 'mark-all-read') { markAllRead(current, actor()); scheduleSave(); paint(); return; }
  if (name === 'toggle-preview') { ui.preview = !ui.preview; paint(); return; }
  if (name === 'edit-custom-theme') {
    const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
    settings.customTheme = customFrom(theme);
    settings.theme = 'custom';
    saveSettings();
    applyTheme(resolveTheme('custom', false, settings.customTheme));
    paint();
  }
}

function onChange(event) {
  const el = event.target;
  if (el.dataset.live) return;
  const current = project();
  if (el.dataset.choose === 'project') {
    if (el.value) { ws.activeProjectId = el.value; ui.issueId = null; ui.boardId = null; ui.view = ui.view === 'home' ? 'board' : ui.view; scheduleSave(); }
    paint();
    return;
  }
  if (el.dataset.choose === 'user') { ws.currentUserId = el.value; scheduleSave(); paint(); return; }
  if (el.dataset.choose === 'board') { ui.boardId = el.value; paint(); return; }
  if (el.dataset.choose === 'gadget' && el.value && current) { const type = el.value; mutate(() => addGadget(current, type)); return; }
  if (el.dataset.bulk === 'status' && el.value && current) {
    const statusId = el.value;
    const ids = [...ui.selected];
    mutate(() => { for (const id of ids) updateIssue(ws, current.id, id, { statusId }, actor()); });
    return;
  }
  if (el.dataset.bulk === 'assignee' && current) {
    const assigneeId = el.value;
    const ids = [...ui.selected];
    mutate(() => { for (const id of ids) updateIssue(ws, current.id, id, { assigneeId }, actor()); });
    return;
  }
  if (el.dataset.project && current) {
    const key = el.dataset.project;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    mutate(() => updateProject(ws, current.id, { [key]: value }, actor()));
    return;
  }
  if (el.dataset.member && current) { mutate(() => setMember(ws, current.id, el.dataset.member, el.value, actor())); return; }
  if (el.dataset.userActive) { mutate(() => setUserActive(ws, el.dataset.userActive, el.checked)); return; }
  if (el.dataset.group && el.dataset.user) { mutate(() => toggleGroupUser(ws, el.dataset.group, el.dataset.user)); return; }
  if (el.dataset.font === 'size') {
    settings.fontSize = Math.min(20, Math.max(12, Number(el.value) || 13));
    saveSettings();
    applyFont(settings);
    return;
  }
  if (el.dataset.customColor) {
    if (!settings.customTheme) settings.customTheme = customFrom(resolveTheme(settings.theme, prefersDark(), null));
    settings.customTheme[el.dataset.customColor] = el.value;
    settings.theme = 'custom';
    saveSettings();
    applyTheme(resolveTheme('custom', false, settings.customTheme));
    return;
  }
  if (el.dataset.multi && current && ui.issueId) {
    const key = el.dataset.multi;
    const value = checkedValues(key);
    mutate(() => updateIssue(ws, current.id, ui.issueId, { [key]: value }, actor()));
    return;
  }
  if (el.dataset.custom && current && ui.issueId) {
    let value = readControl(el);
    if (!el.dataset.parse && el.tagName === 'SELECT') value = el.value;
    mutate(() => setCustomField(ws, current.id, ui.issueId, el.dataset.custom, value, actor()));
    return;
  }
  if (el.dataset.field && current && ui.issueId) {
    mutate(() => updateIssue(ws, current.id, ui.issueId, { [el.dataset.field]: readControl(el) }, actor()));
  }
}

function onInput(event) {
  const el = event.target;
  if (el.id === 'quick-search') { ui.quick = el.value; return; }
  if (el.id === 'issue-query') { ui.query = el.value; return; }
  if (el.dataset.palette === 'search' && ui.modal?.kind === 'palette') {
    ui.modal.query = el.value;
    const box = document.querySelector('#palette-results');
    if (box) box.outerHTML = paletteItems(context(), el.value);
    return;
  }
  if (el.dataset.live && el.dataset.field) {
    const issue = findIssue(project(), ui.issueId);
    if (!issue) return;
    issue[el.dataset.field] = el.value;
    if (ui.path) ui.dirty = true;
    scheduleSave();
  }
}

function searchFrom(text) {
  const raw = text.trim();
  if (!raw) return '';
  if (/[=<>~]/.test(raw) || /\b(and|or|not|in|is|order)\b/i.test(raw)) return raw;
  return `text ~ "${raw.replace(/"/g, '')}"`;
}

function mount() {
  document.querySelector('#app').innerHTML = `<header id="menubar"></header><div id="toolbar"></div><div id="workspace"><nav id="left"></nav><main id="view"></main><aside id="right"></aside></div><footer id="statusbar"></footer><div id="modal" hidden></div><div id="toast" hidden role="status"></div><input id="file-open" type="file" accept=".mwf,.json,application/json" hidden><input id="file-attach" type="file" hidden>`;
  document.body.addEventListener('click', (event) => {
    const win = event.target.closest('[data-window]');
    if (win) { windowControl(win.dataset.window).then((max) => { ui.maximized = Boolean(max); paint(); }); return; }
    const menuButton = event.target.closest('[data-menu]');
    if (menuButton && !event.target.closest('.menu-pop')) {
      ui.menu = ui.menu === menuButton.dataset.menu ? null : menuButton.dataset.menu;
      ui.popover = null;
      paint();
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      if (actionEl.dataset.action !== 'theme-toggle') ui.popover = null;
      ui.menu = null;
      onAction(actionEl);
      return;
    }
    if ((ui.menu || ui.popover) && !event.target.closest('.popover') && !event.target.closest('.menu')) {
      ui.menu = null;
      ui.popover = null;
      paint();
    }
  });
  document.body.addEventListener('change', onChange);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('submit', (event) => {
    const form = event.target.closest('#modal form');
    if (!form) return;
    event.preventDefault();
    submitModal(form);
  });
  document.body.addEventListener('focusin', (event) => {
    if (!event.target.dataset?.live || ui.textSnap) return;
    ui.textSnap = structuredClone(ws);
    ui.textField = event.target.dataset.field;
    ui.textIssue = ui.issueId;
  });
  document.body.addEventListener('focusout', (event) => {
    const el = event.target;
    if (!el.dataset?.live) return;
    const snap = ui.textSnap;
    const field = ui.textField;
    const issueId = ui.textIssue;
    ui.textSnap = null;
    if (!snap || !issueId) return;
    const current = project();
    const issue = findIssue(current, issueId);
    const before = findIssue(snap.projects.find((item) => item.id === current?.id), issueId);
    if (!issue || !before || (before[field] || '') === (issue[field] || '')) return;
    if (!allowed(ws, current, actor(), 'edit')) {
      issue[field] = before[field];
      toast(L('권한이 없습니다.', 'You do not have permission.'));
      paint();
      return;
    }
    if (field === 'summary' && !String(issue.summary).trim()) {
      issue.summary = before.summary;
      toast(L('요약을 입력하세요.', 'Enter a summary.'));
      paint();
      return;
    }
    issue.history.push({ id: uid('h'), at: new Date().toISOString(), actorId: actor(), field, from: before[field] || '', to: issue[field] });
    issue.updated = new Date().toISOString();
    undo.push(snap);
    redo = [];
    if (ui.path) ui.dirty = true;
    scheduleSave();
    paint();
  });
  document.body.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !event.target.closest('[data-window-drag]')) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    dragWindow();
  });
  document.body.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-card]');
    if (!card) return;
    ui.dragId = card.dataset.card;
    event.dataTransfer?.setData('text/plain', ui.dragId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  document.body.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-drop]');
    if (!zone || !ui.dragId) return;
    event.preventDefault();
    const list = zone.querySelector('[data-cards]');
    const card = document.querySelector(`[data-card="${CSS.escape(ui.dragId)}"]`);
    if (!list || !card) return;
    const next = [...list.querySelectorAll('[data-card]')].find((item) => item !== card && event.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
    list.insertBefore(card, next || null);
  });
  document.body.addEventListener('drop', (event) => {
    const zone = event.target.closest('[data-drop]');
    if (!zone || !ui.dragId) return;
    event.preventDefault();
    const list = zone.querySelector('[data-cards]');
    const ids = [...(list?.querySelectorAll('[data-card]') || [])].map((item) => item.dataset.card);
    const statusId = zone.dataset.status || '';
    const sprinting = zone.hasAttribute('data-sprint');
    const sprintId = zone.dataset.sprint || '';
    const dragged = ui.dragId;
    ui.dragId = null;
    const current = project();
    if (!current) return;
    mutate(() => {
      const issue = findIssue(current, dragged);
      if (!issue) return;
      const patch = {};
      if (statusId && issue.statusId !== statusId) patch.statusId = statusId;
      if (sprinting && issue.sprintId !== sprintId) {
        patch.sprintId = sprintId;
        if (sprintId && issue.statusId === 'backlog') patch.statusId = patch.statusId || 'todo';
        if (!sprintId && issue.statusId === 'todo') patch.statusId = 'backlog';
      }
      if (Object.keys(patch).length) updateIssue(ws, current.id, dragged, patch, actor());
      rankIssues(current, ids);
    });
  });
  window.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
  });
  window.addEventListener('drop', async (event) => {
    const file = [...(event.dataTransfer?.files || [])][0];
    if (!file || !/\.(mwf|json)$/i.test(file.name)) return;
    event.preventDefault();
    ingest(await file.text(), null);
  });
  document.querySelector('#file-open').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) ingest(await file.text(), null);
  });
  document.querySelector('#file-attach').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const current = project();
    if (!file || !current || !ui.issueId) return;
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    mutate(() => addAttachment(ws, current.id, ui.issueId, { name: file.name, mime: file.type, size: file.size, data }, actor()));
  });
  document.addEventListener('keydown', (event) => {
    const typing = event.target.matches?.('input, textarea, select');
    if (event.key === 'Escape') { ui.menu = null; ui.popover = null; ui.modal = null; paint(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (ensureProject()) { ui.modal = { kind: 'palette', query: '' }; paint(); } return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(false); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); onAction({ dataset: { action: 'open-file' } }); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); window.print(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); onAction({ dataset: { action: event.shiftKey ? 'redo' : 'undo' } }); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); onAction({ dataset: { action: 'redo' } }); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); onAction({ dataset: { action: 'new-issue' } }); return; }
    if (event.key === 'Enter' && event.target.id === 'quick-search') {
      ui.query = searchFrom(event.target.value);
      ui.view = 'issues';
      event.target.blur();
      paint();
    }
    if (event.key === 'Enter' && event.target.id === 'issue-query') {
      ui.query = event.target.value;
      event.target.blur();
      paint();
    }
    if (!typing && event.key === '?' ) { ui.modal = { kind: 'shortcuts' }; paint(); }
  });
}

export async function start() {
  mount();
  setBackendLanguage(settings.language);
  let stored = null;
  try { stored = await loadLocal(); } catch { /* start from the example */ }
  if (stored) {
    try { ws = upgradeWorkspace(stored); } catch { ws = sampleWorkspace(); }
  } else ws = sampleWorkspace();
  if (!stored) scheduleSave();
  ui.view = ws.projects.length ? 'board' : 'home';
  try {
    const files = await startupFiles();
    if (files?.[0]) ingest(await readTextFile(files[0]), files[0]);
  } catch (error) { fail(error); }
  paint();
  await showMain();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if (settings.theme === 'system') applyTheme(resolveTheme('system', prefersDark(), settings.customTheme));
  });
}
