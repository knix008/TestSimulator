import guideEn from '../UsersGuide.en.md?raw';
import guideKo from '../UsersGuide.md?raw';
import wqlEn from '../docs/WQL.en.md?raw';
import wqlKo from '../docs/WQL.md?raw';
import { toCsv, toMarkdown } from './domain/export.js';
import { allowed, isWorkspaceAdmin } from './domain/permissions.js';
import { exampleWorkspace } from './domain/examples.js';
import { sampleWorkspace } from './domain/sample.js';
import { TUTORIAL } from './domain/tutorial.js';
import { createDocument, deleteDocument, shareDocument, updateDocument } from './domain/documents.js';
import { addColumn, addPage, addRow, addShape, addSpace, attachPage, commentPage, copyPage, deletePageComment, expandPage, likePage, markEditing, movePage, pageByShare, pageDocument, purgePage, removePageFile, removeShape, restorePage, restoreTrashed, setPageAccess, setPageStatus, shareLink, updatePage, watchPage } from './domain/wiki.js';
import { addArticle, addCalendar, addToken, addWebhook, authorizationUrl, csvIssueRows, decideApproval, deleteArticle, deleteToken, deleteWebhook, openApproval } from './domain/services.js';
import { loadSettings, rememberPath, saveSettings } from './domain/settings.js';
import {
  addAttachment, addComment, addComponent, addField, addGadget, addGroup, addLink, addRule, addStatus, addTransition,
  addUser, addVersion, addWorklog, blankWorkspace, cloneIssue, completeSprint, createIssue, createSprint, deleteComment, ensureAdmin,
  deleteFilter, deleteIssue, deleteRule, deleteWorklog, findIssue, markAllRead, markRead, mergeProject, newProject,
  projectDocument, rankIssues, readDocument,   releaseVersion, removeAttachment, removeField, removeGadget, removeLink,
  removeStatus, removeTransition, saveFilter, setArchived, setCustomField, setMember, setUserActive,
  startSprint, toggleGroupUser, toggleWatch, transitionGate, updateIssue, updateProject, upgradeWorkspace, userByAccount, workspaceDocument,
} from './domain/store.js';
import { fromDateInput, parseDuration, uid } from './domain/util.js';
import { connectData, dataStatus, dataUrl, hashPassword, loadWorkspace, rememberDataUrl, saveWorkspace, unlockData } from './platform/data.js';
import { getLanguage, L, setLanguage } from './i18n.js';
import { appInfo, chooseOpen, chooseSave, dragWindow, errorText, isDesktop, readTextFile, resizeWindow, setBackendLanguage, setWindowTheme, showMain, startupFiles, windowControl, writeTextFile } from './platform/native.js';
import { loadLocal, saveLocal } from './platform/storage.js';
import { applyFont, applyTheme, customFrom, randomThemeId, resolveTheme } from './themes.js';
import { esc, icon } from './ui/bits.js';
import { figure } from './ui/figures.js';
import { paletteItems, renderContext, renderMenubar, renderModal, renderNav, renderStatus, renderToolbar } from './ui/chrome.js';
import { ADMIN_VIEWS, takeShortcut } from './ui/shortcuts.js';
import { renderRight, renderView, showRight } from './ui/pages.js';
import { openDocument } from './ui/docwindow.js';
import { renderStart } from './ui/start.js';
import { WorkBackground, backgroundColors, knownBackground, nextBackground } from './ui/background.js';
import { startBoard } from './ui/startboard.js';
import { gripIcon } from './icons.js';

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
  validator: ['이 전이의 검사를 통과하지 못했습니다.', 'That move failed its check.'],
  'approval-required': ['승인이 필요합니다.', 'This move needs approval.'],
  'url-invalid': ['http 또는 https 주소여야 합니다.', 'Use an http or https address.'],
  password: ['암호가 맞지 않습니다.', 'That password does not match.'],
  'sso-required': ['발급자 주소와 클라이언트가 필요합니다.', 'An issuer and a client are required.'],
  'driver-missing': ['그 데이터베이스 드라이버가 설치되어 있지 않습니다.', 'That database driver is not installed.'],
  'engine-unknown': ['지원하지 않는 데이터베이스입니다.', 'That database is not supported.'],
  'project-required': ['프로젝트를 연 뒤에 그 프로젝트와 공유하세요.', 'Open a project before sharing with it.'],
  connect: ['데이터베이스에 연결하지 못했습니다.', 'Could not connect to the database.'],
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
    view: 'home', boardId: null, issueId: null, query: '', quick: '', sort: null, selected: [], ready: false,
    swimlane: 'none', startError: '', connecting: false, connection: null, status: null, dataUrl: '', localBackup: false, articleId: '',
    startTab: 'all', exampleFilter: '', tutorial: null, pendingExample: '', unlocked: false, context: null,
    docId: '', docTab: 'forms', docFilter: '', spaceId: '', wikiEdit: false, wikiQuery: '',
    opened: false, returnView: '',
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
  if (code === 'connect' && error?.detail && error.detail !== 'connect') return error.detail;
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
  saveTimer = setTimeout(() => {
    saveLocal(ws).catch((error) => fail(error));
    if (ui.ready) saveWorkspace(ws).catch((error) => fail(error));
  }, 400);
}

let pendingFiles = [];

async function enterWorkspace(body) {
  ws = upgradeWorkspace(body && typeof body === 'object' ? body : blankWorkspace());
  ui.ready = true;
  ui.opened = true;
  ui.connecting = false;
  ui.startError = '';
  ui.tutorial = null;
  ui.view = ui.returnView || (ws.projects.length ? 'board' : 'home');
  ui.returnView = '';
  undo = [];
  redo = [];
  paint();
  const file = pendingFiles.shift();
  if (!file) return;
  try { ingest(await readTextFile(file), file); } catch (error) { fail(error); }
}

async function refreshStatus() {
  try {
    const status = await dataStatus();
    if (status.connected) {
      const loaded = await loadWorkspace();
      const body = loaded.workspace;
      if (body) {
        const hadPassword = (body.users || []).some((user) => user.login === 'admin' && user.passwordHash);
        const upgraded = upgradeWorkspace(body);
        if (!hadPassword && upgraded.users.some((user) => user.login === 'admin' && user.passwordHash)) await saveWorkspace(upgraded);
        status.people = upgraded.users.filter((user) => user.active !== false).map((user) => ({
          id: user.id, name: user.name || '', login: user.login || '', email: user.email || '', hasPassword: Boolean(user.passwordHash),
        }));
        status.projects = (upgraded.projects || []).map((project) => ({
          id: project.id, key: project.key || '', name: project.name || '', type: project.type || 'software',
          issues: (project.issues || []).length, archived: Boolean(project.archived),
        }));
      }
    }
    ui.status = status;
  } catch {
    ui.status = { listening: false };
  }
  if (!ui.ready) paint();
}

async function afterConnect(password) {
  const loaded = await loadWorkspace();
  const body = loaded.workspace || {};
  const hadPassword = (body.users || []).some((user) => user.login === 'admin' && user.passwordHash);
  const upgraded = upgradeWorkspace(body);
  if (!hadPassword && upgraded.users.some((user) => user.login === 'admin' && user.passwordHash)) await saveWorkspace(upgraded);
  const chosen = userByAccount(upgraded.users, ui.loginAccount) || upgraded.users.find((user) => user.id === ui.loginUser) || null;
  if (ui.loginAccount && !chosen) throw new Error('not-found');
  if (chosen?.passwordHash) {
    const secret = ui.loginPassword || password;
    if (!secret) throw new Error('password');
    await unlockData(chosen.id, secret);
  } else if (!chosen && password && upgraded.users.some((user) => user.passwordHash)) {
    await unlockData(upgraded.currentUserId, password);
  }
  ui.unlocked = true;
  ui.loginPassword = '';
  if (chosen) upgraded.currentUserId = chosen.id;
  const opening = (upgraded.projects || []).find((project) => project.id === ui.openProjectId);
  if (opening) {
    upgraded.activeProjectId = opening.id;
    ui.returnView = 'board';
  }
  ui.openProjectId = '';
  await enterWorkspace(upgraded);
}

async function connectLocal() {
  const stay = ui.ready ? (ui.view || 'settings') : '';
  ui.connecting = true;
  ui.startError = '';
  paint();
  try {
    rememberDataUrl(ui.dataUrl || dataUrl());
    ui.connection = await connectData({ engine: 'sqlite' });
    if (stay) ui.returnView = stay;
    await afterConnect(ui.loginPassword || document.querySelector('#local-unlock')?.value || '');
  } catch (error) {
    ui.connecting = false;
    ui.startError = message(error);
    if (!stay) ui.ready = false;
    paint();
  }
}

async function connectServer(form) {
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || '').trim();
  rememberDataUrl(value('service'));
  ui.dataUrl = value('service') || dataUrl();
  ui.connecting = true;
  ui.startError = '';
  paint();
  try {
    ui.connection = await connectData({
      engine: value('engine') || 'mysql', host: value('host'), port: value('port'),
      database: value('database'), user: value('user'), password: value('password'),
    });
    if (ui.ready) ui.returnView = ui.view || 'settings';
    await afterConnect(value('unlock'));
  } catch (error) {
    ui.connecting = false;
    ui.startError = message(error);
    if (!ui.ready) ui.ready = false;
    paint();
  }
}

async function importLocal() {
  const stored = await loadLocal();
  if (!stored) return;
  ui.connection = await connectData({ engine: 'sqlite' });
  await saveWorkspace(upgradeWorkspace(stored));
  ui.unlocked = true;
  await enterWorkspace(stored);
}

async function ensureStore() {
  if (ui.connection) return;
  rememberDataUrl(ui.dataUrl || dataUrl());
  ui.connection = await connectData({ engine: 'sqlite' });
}

async function assertUnlocked() {
  if (ui.unlocked) return;
  const loaded = await loadWorkspace();
  const body = loaded.workspace;
  const locked = body?.users?.some((user) => user.passwordHash);
  if (!locked) {
    ui.unlocked = true;
    return;
  }
  const password = document.querySelector('#local-unlock')?.value || document.querySelector('[name="unlock"]')?.value || '';
  if (!password) throw new Error('password');
  await unlockData(body.currentUserId, password);
  ui.unlocked = true;
}

function showTutorialStep() {
  const step = TUTORIAL[ui.tutorial];
  if (!step) return;
  ui.view = step.view;
  ui.query = step.query || '';
  ui.queryError = null;
  ui.issueId = null;
  ui.modal = null;
  ui.boardId = null;
  if (step.view === 'help') ui.help = 'guide';
}

async function openExample(id, confirmed = false) {
  if (!id || ui.connecting) return;
  ui.connecting = true;
  ui.startError = '';
  ui.tutorial = null;
  paint();
  try {
    await ensureStore();
    await assertUnlocked();
    if (!confirmed && !ws.projects.length) {
      const loaded = await loadWorkspace();
      if (loaded.workspace?.projects?.length) {
        ui.connecting = false;
        ui.pendingExample = id;
        confirm(L('데이터베이스에 있는 작업 공간을 이 예제로 바꿀까요?', 'Replace the workspace in the database with this example?'), 'open-example');
        return;
      }
    }
    ws = upgradeWorkspace(exampleWorkspace(id, Date.now(), getLanguage()));
    ui.ready = true;
    ui.opened = true;
    ui.returnView = '';
    ui.connecting = false;
    ui.startError = '';
    ui.view = 'board';
    ui.boardId = null;
    ui.issueId = null;
    undo = [];
    redo = [];
    scheduleSave();
    paint();
    const name = ws.projects[0]?.name || id;
    toast(L(`${name} 예제를 열었습니다.`, `Opened the ${name} example.`));
  } catch (error) {
    ui.connecting = false;
    ui.ready = false;
    ui.startError = message(error);
    paint();
  }
}

async function beginTutorial(confirmed = false) {
  if (ui.connecting) return;
  ui.connecting = true;
  ui.startError = '';
  paint();
  try {
    await ensureStore();
    await assertUnlocked();
    if (!confirmed && !ws.projects.length) {
      const loaded = await loadWorkspace();
      if (loaded.workspace?.projects?.length) {
        ui.connecting = false;
        confirm(L('데이터베이스에 있는 작업 공간을 쇼핑몰 예제로 바꿀까요?', 'Replace the workspace in the database with the shop example?'), 'start-tutorial');
        return;
      }
    }
    ws = upgradeWorkspace(exampleWorkspace('shop', Date.now(), getLanguage()));
    ui.ready = true;
    ui.opened = true;
    ui.returnView = '';
    ui.connecting = false;
    ui.startError = '';
    ui.tutorial = 0;
    undo = [];
    redo = [];
    showTutorialStep();
    scheduleSave();
    paint();
  } catch (error) {
    ui.connecting = false;
    ui.ready = false;
    ui.tutorial = null;
    ui.startError = message(error);
    paint();
  }
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
  const guideDoc = getLanguage() === 'en' ? guideEn : guideKo;
  const wqlDoc = getLanguage() === 'en' ? wqlEn : wqlKo;
  return {
    ws, ui, settings, project: current, user: active, desktop: isDesktop(), version: VERSION, now: Date.now(),
    guide: ui.help === 'wql' ? wqlDoc : guideDoc,
    userGuide: guideDoc,
    wql: wqlDoc,
  };
}

let welcomeSeen = false;

function offerWelcome() {
  if (welcomeSeen || ui.ready || settings.showWelcome === false || ui.modal) return;
  welcomeSeen = true;
  ui.modal = { kind: 'welcome' };
}

function showStartPage(show) {
  ui.context = null;
  ui.menu = null;
  if (show) {
    if (ui.ready) ui.returnView = ui.view || 'board';
    ui.ready = false;
    ui.tutorial = null;
  } else if (ui.opened) {
    ui.ready = true;
    ui.view = ui.returnView || (ws.projects.length ? 'board' : 'home');
    ui.returnView = '';
  } else ui.startTab = 'all';
  paint();
  if (!ui.ready) refreshStatus();
}

let startCards = null;
let startBackground = null;
let backgroundTimer = 0;

function stopStartBackground() {
  clearInterval(backgroundTimer);
  backgroundTimer = 0;
  startBackground?.destroy();
  startBackground = null;
}

function markBackgroundChip() {
  const current = knownBackground(settings.background);
  document.querySelectorAll('[data-action="pick-background"]').forEach((button) => {
    const on = button.dataset.id === current;
    button.classList.toggle('on', on);
    button.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function syncStartBackground() {
  stopStartBackground();
  const canvas = document.querySelector('.start-bg');
  if (!canvas || ui.ready) return;
  settings.background = knownBackground(settings.background);
  startBackground = new WorkBackground(canvas, {
    colors: backgroundColors,
    speed: () => (Number(settings.backgroundSpeed) || 0) / 100,
    kind: settings.background,
  });
  startBackground.start();
  const seconds = Number(settings.backgroundInterval) || 0;
  if (seconds > 0) {
    backgroundTimer = setInterval(() => {
      if (ui.ready || document.hidden) return;
      settings.background = nextBackground(settings.background);
      saveSettings();
      startBackground?.setKind(settings.background);
      markBackgroundChip();
    }, seconds * 1000);
  }
}

function mountStartBoard() {
  startCards?.destroy();
  const host = document.querySelector('.start-board');
  if (!host) { startCards = null; return; }
  startCards = startBoard(host, {
    saved: settings.startLayout,
    onSave(layout) { settings.startLayout = layout; saveSettings(); },
  });
}

function paint() {
  const ctx = context();
  const app = document.querySelector('#app');
  app.classList.toggle('on-start', !ui.ready);
  if (!ui.ready) {
    app.classList.add('no-right');
    app.classList.remove('fold-left', 'fold-right');
    document.querySelector('#menubar').innerHTML = renderMenubar(ctx);
    document.querySelector('#toolbar').innerHTML = '';
    document.querySelector('#left').innerHTML = '';
    offerWelcome();
    document.querySelector('#view').innerHTML = renderStart(ctx);
    mountStartBoard();
    syncStartBackground();
    document.querySelector('#right').innerHTML = '';
    document.querySelector('#statusbar').innerHTML = `<span>${L('개인용', 'Personal')}</span><span class="grow"></span><span>${L('튜토리얼, 설명서 또는 예제를 고르세요. 데이터베이스는 설정에 있습니다.', 'Choose the tutorial, the guide, or an example. The database is in Settings.')}</span>`;
    document.title = 'MyWorkForce';
    paintModal(ctx);
    paintCoach();
    paintContext(ctx);
    return;
  }
  startCards?.destroy();
  startCards = null;
  stopStartBackground();
  if (ui.modal?.kind === 'welcome') ui.modal = null;
  if (!ctx.project && !['home', 'help', 'knowledge', 'documents', 'calendar', 'plans', 'extensions'].includes(ui.view)) ui.view = 'home';
  if (ctx.project && !ctx.project.boards.some((board) => board.id === ui.boardId)) {
    ui.boardId = ctx.project.boards.find((board) => board.type === 'scrum')?.id || ctx.project.boards[0]?.id || null;
  }
  const skipSearch = document.activeElement?.id === 'quick-search';
  const skipQuery = document.activeElement?.id === 'issue-query';
  const skipLive = Boolean(document.activeElement?.dataset?.live);
  const skipDoc = Boolean(document.activeElement?.dataset?.doc);
  const skipPage = ['page-title', 'page-body', 'page-labels', 'page-comment'].includes(document.activeElement?.id);
  app.classList.toggle('no-right', !showRight(ctx));
  app.classList.toggle('fold-left', settings.showLeftPanel === false);
  app.classList.toggle('fold-right', showRight(ctx) && settings.showRightPanel === false);
  if (ui.view !== 'issues') ui.queryError = null;
  document.querySelector('#menubar').innerHTML = renderMenubar(ctx);
  if (!skipSearch) document.querySelector('#toolbar').innerHTML = renderToolbar(ctx);
  document.querySelector('#left').innerHTML = renderNav(ctx);
  if (!skipLive && !skipQuery && !skipDoc && !skipPage) {
    document.querySelector('#view').innerHTML = renderView(ctx);
    document.querySelector('#right').innerHTML = showRight(ctx) ? renderRight(ctx) : '';
  }
  document.querySelector('#statusbar').innerHTML = renderStatus(ctx);
  paintModal(ctx);
  paintCoach();
  paintContext(ctx);
  document.title = ctx.project ? `MyWorkForce — ${ctx.project.name}` : 'MyWorkForce';
}

function paintModal(ctx) {
  const modal = document.querySelector('#modal');
  if (!modal) return;
  const kind = ui.modal?.kind || '';
  if (modal.dataset.kind === kind) return;
  modal.innerHTML = kind ? renderModal(ctx) : '';
  modal.hidden = !kind;
  modal.dataset.kind = kind;
  if (kind) modal.querySelector('input, textarea, select')?.focus();
}

function paintContext(ctx) {
  const el = document.querySelector('#context');
  if (!el) return;
  const menu = ui.context;
  if (!menu) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.className = 'menu-pop';
  el.innerHTML = renderContext(ctx);
  el.style.left = '0px';
  el.style.top = '0px';
  const rect = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8));
  const y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function paintCoach() {
  const el = document.querySelector('#coach');
  if (!el) return;
  const step = ui.ready && Number.isInteger(ui.tutorial) ? TUTORIAL[ui.tutorial] : null;
  if (!step) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const at = ui.tutorial + 1;
  el.hidden = false;
  const close = esc(L('닫기', 'Close'));
  const last = at === TUTORIAL.length;
  el.innerHTML = `<header><b>${icon('play')}<span>${esc(L(step.ko, step.en))}</span></b><span>${at} / ${TUTORIAL.length}</span><button type="button" class="icon-button popup-close" data-action="tutorial-close" title="${close}" aria-label="${close}">${icon('close')}</button></header>${figure(step.view, L(step.ko, step.en), { caption: false })}<p>${esc(L(step.bodyKo, step.bodyEn))}</p><div class="coach-actions"><button type="button" class="button popup-close" data-action="tutorial-close">${icon('close')}<span>${L('닫기', 'Close')}</span></button><button type="button" class="button" data-action="tutorial-prev" ${ui.tutorial === 0 ? 'disabled' : ''}>${icon('undo')}<span>${L('이전', 'Back')}</span></button><button type="button" class="button primary" data-action="tutorial-next">${icon(last ? 'check' : 'play')}<span>${last ? L('마치기', 'Finish') : L('다음', 'Next')}</span></button></div>`;
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
  if (modal.kind === 'password') {
    hashPassword(value('password')).then((result) => {
      const user = ws.users.find((item) => item.id === value('user'));
      if (user) user.passwordHash = result.passwordHash;
      ui.modal = null;
      scheduleSave();
      paint();
      toast(L('암호를 저장했습니다.', 'Password saved.'));
    }).catch(fail);
    return;
  }
  const ok = mutate(() => {
    const current = project();
    if (modal.kind === 'project') {
      newProject(ws, { name: value('name'), key: value('key'), type: value('type'), description: value('description'), leadId: actor() });
      if (ui.view !== 'projects') ui.view = 'board';
      return;
    }
    if (modal.kind === 'user') {
      const user = addUser(ws, { name: value('name'), email: value('email') });
      if (current && value('role')) setMember(ws, current.id, user.id, value('role'), actor());
      return;
    }
    if (modal.kind === 'group') { addGroup(ws, value('name'), actor(), current?.id); return; }
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
    if (modal.kind === 'transition') {
      addTransition(ws, current.id, {
        name: value('name'), from: value('from'), to: value('to'), condition: value('condition'), role: value('role'),
        validator: value('validator'), approval: data.get('approval') != null, approverId: value('approver'),
      }, actor());
      return;
    }
    if (modal.kind === 'csv') {
      const rows = csvIssueRows(value('csv'));
      if (!rows.length) throw new Error('summary-required');
      for (const row of rows) {
        const assignee = ws.users.find((user) => user.email === row.assignee || user.name === row.assignee);
        createIssue(ws, current.id, {
          summary: row.summary, typeId: row.typeId, priorityId: row.priorityId, statusId: row.statusId || undefined,
          assigneeId: assignee?.id || '', description: row.description,
          labels: row.labels.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
        }, actor());
      }
      return;
    }
    if (modal.kind === 'field') { addField(ws, current.id, { name: value('name'), type: value('fieldType'), options: value('options') }, actor()); return; }
    if (modal.kind === 'rule') {
      addRule(ws, current.id, { name: value('name'), when: value('when'), typeId: value('type'), statusId: value('status'), then: value('then'), userId: value('user'), priorityId: value('priority'), label: value('label') }, actor());
      return;
    }
    if (modal.kind === 'component') { addComponent(ws, current.id, { name: value('name'), description: value('description'), leadId: actor() }, actor()); return; }
    if (modal.kind === 'version') { addVersion(ws, current.id, { name: value('name'), description: value('description') }, actor()); return; }
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
    const keep = { ready: ui.ready, connection: ui.connection, status: ui.status, dataUrl: ui.dataUrl, localBackup: ui.localBackup, unlocked: ui.unlocked };
    ws = sampleWorkspace();
    ui = { ...freshUi(), ...keep, view: 'board' };
    undo = []; redo = [];
    scheduleSave();
    paint();
    return;
  }
  if (modal.action === 'open-example') { openExample(ui.pendingExample, true); return; }
  if (modal.action === 'start-tutorial') { beginTutorial(true); return; }
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
  if (name === 'open-login') {
    if (ui.modal?.kind === 'welcome') ui.modal = null;
    if (!ui.ready) {
      paint();
      document.querySelector('[data-card="login"]')?.scrollIntoView({ block: 'nearest' });
      document.querySelector('#login-account')?.focus();
      return;
    }
    ui.modal = { kind: 'login' };
    paint();
    return;
  }
  if (name === 'pick-login') {
    const password = document.querySelector('#login-password')?.value || '';
    ui.loginUser = el.dataset.id;
    ui.loginAccount = el.dataset.login || '';
    const modal = document.querySelector('#modal');
    if (modal && ui.modal?.kind === 'login') modal.dataset.kind = '';
    paint();
    const account = document.querySelector('#login-account');
    const pass = document.querySelector('#login-password');
    if (account) account.value = ui.loginAccount;
    if (pass) pass.value = password;
    pass?.focus();
    return;
  }
  if (name === 'sign-in') {
    if (ui.connecting) return;
    ui.loginAccount = document.querySelector('#login-account')?.value.trim() || '';
    ui.loginPassword = document.querySelector('#login-password')?.value || '';
    if (!ui.loginAccount && !ui.loginUser) { toast(L('로그인 ID를 입력하세요.', 'Enter a login ID.')); return; }
    const known = userByAccount(ws.users, ui.loginAccount) || (ws.users || []).find((user) => user.id === ui.loginUser);
    if (ui.opened && known) {
      const enter = () => {
        ws.currentUserId = known.id;
        ui.loginPassword = '';
        ui.unlocked = true;
        ui.menu = null;
        if (ui.modal?.kind === 'login') ui.modal = null;
        if (!ui.ready) showStartPage(false);
        else { scheduleSave(); paint(); }
      };
      if (known.passwordHash) {
        if (!ui.loginPassword) { toast(message(new Error('password'))); return; }
        const finish = () => unlockData(known.id, ui.loginPassword).then(enter).catch((error) => { ui.menu = 'login'; fail(error); });
        if (ensureAdmin(ws)) saveWorkspace(ws).then(finish).catch((error) => { ui.menu = 'login'; fail(error); });
        else finish();
        return;
      }
      enter();
      return;
    }
    connectLocal();
    return;
  }
  if (name === 'menubar-home') {
    if (ui.connecting) return;
    if (ui.ready) { showStartPage(true); return; }
    if (ui.opened) { showStartPage(false); return; }
    connectLocal();
    return;
  }
  if (name === 'open-project') {
    if (ui.connecting) return;
    ui.openProjectId = el.dataset.id || '';
    if (ui.opened && (ws.projects || []).some((project) => project.id === ui.openProjectId)) {
      ws.activeProjectId = ui.openProjectId;
      ui.openProjectId = '';
      ui.view = 'board';
      ui.returnView = '';
      showStartPage(false);
      scheduleSave();
      return;
    }
    connectLocal();
    return;
  }
  if (name === 'connect-local') { connectLocal(); return; }
  if (name === 'import-local') { importLocal().catch((error) => { ui.startError = message(error); ui.connecting = false; paint(); }); return; }
  if (name === 'open-guide' || name === 'help-doc') { openDocument(el.dataset.id || 'guide'); return; }
  if (name === 'start-tab') {
    if (['guide', 'tutorial', 'wql'].includes(el.dataset.id)) { openDocument(el.dataset.id); return; }
    ui.startTab = el.dataset.id || 'all';
    paint();
    return;
  }
  if (name === 'start-tutorial') {
    if (ws.projects.length) { confirm(L('튜토리얼은 쇼핑몰 예제로 작업 공간을 바꿉니다. 계속할까요?', 'The tutorial replaces the workspace with the shop example. Continue?'), 'start-tutorial'); return; }
    beginTutorial();
    return;
  }
  if (name === 'tutorial-close') { ui.tutorial = null; paint(); return; }
  if (name === 'tutorial-prev') {
    if (Number.isInteger(ui.tutorial) && ui.tutorial > 0) { ui.tutorial -= 1; showTutorialStep(); paint(); }
    return;
  }
  if (name === 'tutorial-next') {
    if (!Number.isInteger(ui.tutorial)) return;
    if (ui.tutorial >= TUTORIAL.length - 1) {
      ui.tutorial = null;
      toast(L('튜토리얼을 마쳤습니다.', 'You finished the tutorial.'));
      paint();
      return;
    }
    ui.tutorial += 1;
    showTutorialStep();
    paint();
    return;
  }
  if (name === 'open-example') {
    if (ws.projects.length) {
      ui.pendingExample = el.dataset.id || '';
      confirm(L('이 예제로 작업 공간을 바꿀까요?', 'Replace the workspace with this example?'), 'open-example');
      return;
    }
    openExample(el.dataset.id);
    return;
  }
  if (name === 'pick-background') {
    settings.background = knownBackground(el.dataset.id);
    saveSettings();
    startBackground?.setKind(settings.background);
    markBackgroundChip();
    return;
  }
  if (name === 'shuffle-background') {
    settings.background = nextBackground(settings.background);
    saveSettings();
    startBackground?.setKind(settings.background);
    markBackgroundChip();
    const picked = document.querySelector('[data-bg="kind"]');
    if (picked) picked.value = settings.background;
    return;
  }
  if (name === 'browse-examples') { showStartPage(true); ui.startTab = 'examples'; paint(); return; }
  if (name === 'start-screen') { showStartPage(true); return; }
  if (name === 'add-article') {
    mutate(() => {
      const typed = document.querySelector('#article-title')?.value || '';
      const article = addArticle(ws, {
        title: typed.trim() || (getLanguage() === 'en' ? 'New page' : '새 페이지'),
        body: document.querySelector('#article-body')?.value || '',
        spaceId: ui.spaceId,
        projectId: project()?.id || '',
      }, actor());
      ui.articleId = article.id;
      ui.spaceId = article.spaceId;
      ui.wikiEdit = true;
      ui.view = 'knowledge';
    });
    return;
  }
  if (name === 'add-child') {
    mutate(() => {
      const page = addPage(ws, { spaceId: ui.spaceId, parentId: el.dataset.id, title: getLanguage() === 'en' ? 'New page' : '새 페이지' }, actor());
      ui.articleId = page.id;
      ui.wikiEdit = true;
    });
    return;
  }
  if (name === 'add-blog' || name === 'add-board' || name === 'add-table') {
    const kind = name === 'add-board' ? 'board' : name === 'add-table' ? 'table' : 'blog';
    const title = kind === 'board' ? L('칠판', 'Board') : kind === 'table' ? L('표', 'Table') : L('새 소식', 'News');
    mutate(() => {
      const page = addPage(ws, { spaceId: ui.spaceId, kind, title }, actor());
      ui.articleId = page.id;
      ui.wikiEdit = kind === 'blog';
      ui.view = 'knowledge';
    });
    return;
  }
  if (name === 'add-space') {
    mutate(() => {
      const space = addSpace(ws, { name: document.querySelector('#space-name')?.value || '', key: document.querySelector('#space-key')?.value || '', projectId: '' }, actor());
      ui.spaceId = space.id;
      ui.articleId = '';
      ui.view = 'knowledge';
    });
    return;
  }
  if (name === 'open-article') {
    ui.articleId = el.dataset.id;
    ui.wikiEdit = false;
    ui.view = 'knowledge';
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    if (page) { page.views = (page.views || 0) + 1; scheduleSave(); }
    paint();
    return;
  }
  if (name === 'wiki-edit') {
    ui.wikiEdit = el.dataset.on !== '0';
    const page = (ws.articles || []).find((item) => item.id === ui.articleId);
    if (page) markEditing(ws, page.id, actor(), ui.wikiEdit);
    scheduleSave();
    paint();
    return;
  }
  if (name === 'save-page') {
    mutate(() => {
      updatePage(ws, el.dataset.id, {
        title: document.querySelector('#page-title')?.value,
        body: document.querySelector('#page-body')?.value,
        labels: document.querySelector('#page-labels')?.value,
      }, actor());
      markEditing(ws, el.dataset.id, actor(), false);
      ui.wikiEdit = false;
    });
    return;
  }
  if (name === 'watch-page') { mutate(() => watchPage(ws, el.dataset.id, actor())); return; }
  if (name === 'restrict-page') {
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    mutate(() => updatePage(ws, el.dataset.id, { restricted: !page?.restricted }, actor()));
    return;
  }
  if (name === 'comment-page') {
    mutate(() => commentPage(ws, el.dataset.id, document.querySelector('#page-comment')?.value || '', actor(), document.querySelector('#page-quote')?.value || ''));
    return;
  }
  if (name === 'like-page') { mutate(() => likePage(ws, el.dataset.id, actor())); return; }
  if (name === 'copy-page') {
    mutate(() => { const page = copyPage(ws, el.dataset.id, actor()); ui.articleId = page.id; ui.wikiEdit = true; });
    return;
  }
  if (name === 'export-page') {
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    if (!page) return;
    const doc = pageDocument(page, expandPage(ws, page));
    const word = el.dataset.format === 'doc';
    const blob = new Blob([doc.html], { type: word ? 'application/msword' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = word ? doc.filename.replace(/\.html$/, '.doc') : doc.filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (name === 'pick-page-file') { ui.pageAttach = el.dataset.id; document.querySelector('#file-attach').click(); return; }
  if (name === 'remove-page-file') { mutate(() => removePageFile(ws, el.dataset.id, el.dataset.file, actor())); return; }
  if (name === 'share-link') {
    mutate(() => { ui.shareToken = shareLink(ws, el.dataset.id, actor(), el.dataset.on === '1'); });
    return;
  }
  if (name === 'open-share') {
    const page = pageByShare(ws, document.querySelector('#share-open')?.value || '');
    if (!page) { toast(L('링크가 없습니다.', 'That link is not here.')); return; }
    ui.shareToken = page.shareToken;
    ui.spaceId = page.spaceId;
    ui.articleId = page.id;
    ui.view = 'knowledge';
    page.views = (page.views || 0) + 1;
    scheduleSave();
    paint();
    return;
  }
  if (name === 'grant-edit' || name === 'grant-read') {
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    const picked = document.querySelector(name === 'grant-edit' ? '#page-editor' : '#page-reader')?.value;
    if (!page || !picked) return;
    const key = name === 'grant-edit' ? 'editors' : 'readers';
    mutate(() => setPageAccess(ws, page.id, { [key]: [...(page[key] || []), picked], restricted: key === 'readers' ? true : page.restricted }, actor()));
    return;
  }
  if (name === 'add-shape') { mutate(() => addShape(ws, el.dataset.id, document.querySelector('#shape-text')?.value || '', actor())); return; }
  if (name === 'remove-shape') { mutate(() => removeShape(ws, el.dataset.id, el.dataset.shape, actor())); return; }
  if (name === 'add-column') { mutate(() => addColumn(ws, el.dataset.id, document.querySelector('#column-name')?.value || '', actor())); return; }
  if (name === 'add-row') { mutate(() => addRow(ws, el.dataset.id, (document.querySelector('#row-cells')?.value || '').split(','), actor())); return; }
  if (name === 'restore-trashed') { mutate(() => { restoreTrashed(ws, el.dataset.id, actor()); ui.articleId = el.dataset.id; }); return; }
  if (name === 'purge-page') { mutate(() => { purgePage(ws, el.dataset.id, actor()); if (ui.articleId === el.dataset.id) ui.articleId = ''; }); return; }
  if (name === 'delete-page-comment') { mutate(() => deletePageComment(ws, el.dataset.id, el.dataset.comment, actor())); return; }
  if (name === 'restore-page') { mutate(() => restorePage(ws, el.dataset.id, el.dataset.version, actor())); return; }
  if (name === 'doc-tab') { ui.docTab = el.dataset.id || 'forms'; ui.view = 'documents'; paint(); return; }
  if (name === 'use-form') {
    mutate(() => {
      const doc = createDocument(ws, { templateId: el.dataset.id, projectId: project()?.id || '', lang: getLanguage() }, actor());
      ui.docId = doc.id;
      ui.docTab = 'mine';
      ui.view = 'documents';
    });
    return;
  }
  if (name === 'open-doc') { ui.docId = el.dataset.id; ui.view = 'documents'; paint(); return; }
  if (name === 'share-doc') {
    mutate(() => {
      const fields = {
        title: document.querySelector('#doc-title')?.value,
        body: document.querySelector('#doc-body')?.value,
        issueKey: document.querySelector('#doc-issue')?.value,
      };
      updateDocument(ws, el.dataset.id, fields, actor());
      shareDocument(ws, el.dataset.id, el.dataset.visibility, actor());
    });
    return;
  }
  if (name === 'delete-doc') {
    mutate(() => { deleteDocument(ws, el.dataset.id, actor()); if (ui.docId === el.dataset.id) ui.docId = ''; });
    return;
  }
  if (name === 'delete-article') {
    mutate(() => {
      deleteArticle(ws, el.dataset.id, actor());
      if (ui.articleId === el.dataset.id) { ui.articleId = ''; ui.wikiEdit = false; }
    });
    return;
  }
  if (name === 'add-calendar') {
    mutate(() => addCalendar(ws, { name: document.querySelector('#calendar-name')?.value || '', timezone: document.querySelector('#calendar-zone')?.value || 'Asia/Seoul' }));
    return;
  }
  if (name === 'use-calendar') { ws.calendarId = ws.calendarId === el.dataset.id ? '' : el.dataset.id; scheduleSave(); paint(); return; }
  if (name === 'add-holiday') {
    const day = document.querySelector('#holiday')?.value;
    const calendar = (ws.calendars || []).find((item) => item.id === (ws.calendarId || ws.calendars?.[0]?.id));
    if (calendar && day && !(calendar.holidays || []).includes(day)) { calendar.holidays.push(day); scheduleSave(); paint(); }
    return;
  }
  if (name === 'add-webhook') { mutate(() => addWebhook(ws, { url: document.querySelector('#hook-url')?.value || '', events: document.querySelector('#hook-events')?.value || '' })); return; }
  if (name === 'delete-webhook') { mutate(() => deleteWebhook(ws, el.dataset.id)); return; }
  if (name === 'add-token') { mutate(() => addToken(ws, document.querySelector('#token-name')?.value || '')); return; }
  if (name === 'delete-token') { mutate(() => deleteToken(ws, el.dataset.id)); return; }
  if (name === 'start-sso') {
    try { window.open(authorizationUrl(ws.sso, `${dataUrl()}/api/sso/callback`, uid('state')), '_blank'); } catch (error) { fail(error); }
    return;
  }
  if (name === 'set-password') { ui.modal = { kind: 'password' }; paint(); return; }
  if (name === 'import-csv') { if (ensureProject()) { ui.modal = { kind: 'csv' }; paint(); } return; }
  if (name === 'open-current-project') {
    if (!ui.ready) return;
    ui.issueId = null;
    ui.view = project() ? 'board' : 'home';
    paint();
    return;
  }
  if (name === 'go') {
    ui.view = el.dataset.view || 'home';
    if (!ui.ready && ui.view === 'settings') { ui.returnView = 'settings'; connectLocal(); return; }
    paint();
    return;
  }
  if (name === 'activate') { ws.activeProjectId = el.dataset.id; ui.issueId = null; ui.selected = []; ui.boardId = null; ui.view = 'board'; scheduleSave(); paint(); return; }
  if (name === 'open-issue') { ui.issueId = el.dataset.id; ui.view = 'issue'; ui.issueTab = 'details'; ui.modal = null; paint(); return; }
  if (name === 'select-issue') { ui.issueId = el.dataset.id; paint(); return; }
  if (name === 'issue-tab') { ui.issueTab = el.dataset.id; paint(); return; }
  if (name === 'theme-random') {
    settings.theme = randomThemeId(settings.theme);
    saveSettings();
    const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
    applyTheme(theme);
    setWindowTheme(theme.dark);
    paint();
    return;
  }
  if (name === 'theme-menu') {
    ui.popover = el.dataset.id === 'list' ? 'theme' : (ui.popover ? null : 'theme');
    ui.menu = null;
    paint();
    return;
  }
  if (name === 'pick-theme') {
    if (el.dataset.id === 'custom' && !settings.customTheme) settings.customTheme = customFrom(resolveTheme(settings.theme, prefersDark(), null));
    settings.theme = el.dataset.id;
    saveSettings();
    const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
    applyTheme(theme);
    setWindowTheme(theme.dark);
    ui.popover = 'theme';
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
  if (name === 'copy-about') {
    const lines = [...document.querySelectorAll('#about-rows dt')].map((row) => `${row.textContent.trim()}: ${row.nextElementSibling?.textContent.trim() || ''}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast(L('복사했습니다.', 'Copied.'))).catch(() => toast(L('복사하지 못했습니다.', 'Could not copy.')));
    return;
  }
  if (name === 'toggle-panel') {
    const key = el.dataset.id === 'right' ? 'showRightPanel' : 'showLeftPanel';
    settings[key] = settings[key] === false;
    saveSettings();
    paint();
    return;
  }
  if (name === 'shortcuts') { ui.modal = { kind: 'shortcuts' }; paint(); return; }
  if (name === 'focus-search') {
    const box = document.querySelector(ui.view === 'issues' ? '#issue-query' : '#quick-search');
    box?.focus();
    box?.select?.();
    return;
  }
  if (name === 'command-palette') { if (ensureProject()) { ui.modal = { kind: 'palette', query: '' }; paint(); } return; }
  if (name === 'help-doc') { ui.help = el.dataset.id || 'guide'; ui.view = 'help'; paint(); return; }
  if (name === 'open-recent') { readTextFile(el.dataset.path).then((text) => ingest(text, el.dataset.path)).catch(fail); return; }
  if (!current) { ensureProject(); return; }
  if (name === 'transition') {
    const issue = findIssue(current, ui.issueId);
    if (transitionGate(current, issue, el.dataset.to, actor(), ws) === 'approval-required') {
      const rule = current.transitions.find((item) => item.from === issue.statusId && item.to === el.dataset.to);
      mutate(() => openApproval(ws, current, issue, el.dataset.to, rule?.approverId || '', actor()));
      toast(L('승인을 요청했습니다.', 'Approval requested.'));
      return;
    }
    mutate(() => updateIssue(ws, current.id, ui.issueId, { statusId: el.dataset.to }, actor()));
    return;
  }
  if (name === 'decide-approval') { mutate(() => decideApproval(ws, el.dataset.id, el.dataset.state, actor())); return; }
  if (name === 'portal-create') {
    mutate(() => createIssue(ws, current.id, { typeId: document.querySelector('#portal-type')?.value || 'request', summary: document.querySelector('#portal-summary')?.value || '' }, actor()));
    return;
  }
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
  if (name === 'archive-project') { mutate(() => setArchived(ws, el.dataset.id, el.dataset.on !== '0', actor())); return; }
  if (name === 'archive') { mutate(() => setArchived(ws, current.id, true, actor())); return; }
  if (name === 'unarchive') { mutate(() => setArchived(ws, current.id, false, actor())); return; }
  if (name === 'mark-read') { markRead(current, el.dataset.id, actor()); if (el.dataset.issue) { ui.issueId = el.dataset.issue; ui.view = 'issue'; } scheduleSave(); paint(); return; }
  if (name === 'mark-all-read') { markAllRead(current, actor()); scheduleSave(); paint(); return; }
  if (name === 'toggle-preview') { ui.preview = !ui.preview; paint(); return; }
  if (name === 'edit-custom-theme') {
    const theme = resolveTheme(settings.theme === 'custom' ? 'light' : settings.theme, prefersDark(), settings.customTheme);
    if (!settings.customTheme) settings.customTheme = customFrom(theme);
    settings.theme = 'custom';
    saveSettings();
    applyTheme(resolveTheme('custom', false, settings.customTheme));
    setWindowTheme(Boolean(settings.customTheme.dark));
    ui.popover = 'theme-custom';
    paint();
  }
}

function onChange(event) {
  const el = event.target;
  if (el.dataset.setting && ['showStartPage', 'showWelcome', 'startShowBanner', 'startShowProjects', 'startShowExamples', 'startShowBackground'].includes(el.dataset.setting)) {
    settings[el.dataset.setting] = el.checked;
    saveSettings();
    return;
  }
  if (el.dataset.bg === 'kind') {
    settings.background = knownBackground(el.value);
    saveSettings();
    startBackground?.setKind(settings.background);
    markBackgroundChip();
    return;
  }
  if (el.dataset.bg === 'random') { settings.backgroundRandom = el.checked; saveSettings(); return; }
  if (el.dataset.bg === 'interval') {
    settings.backgroundInterval = Number(el.value) || 0;
    saveSettings();
    syncStartBackground();
    return;
  }
  if (el.dataset.live) return;
  const current = project();
  if (el.dataset.choose === 'space') { ui.spaceId = el.value; ui.articleId = ''; ui.wikiEdit = false; paint(); return; }
  if (el.dataset.choose === 'page-parent') { mutate(() => movePage(ws, el.dataset.id, el.value, actor())); return; }
  if (el.dataset.choose === 'page-status') { mutate(() => setPageStatus(ws, el.dataset.id, el.value, actor())); return; }
  if (el.dataset.choose === 'project') {
    if (el.value) { ws.activeProjectId = el.value; ui.issueId = null; ui.boardId = null; ui.view = ui.view === 'home' ? 'board' : ui.view; scheduleSave(); }
    paint();
    return;
  }
  if (el.dataset.choose === 'user') { ws.currentUserId = el.value; scheduleSave(); paint(); return; }
  if (el.dataset.choose === 'board') { ui.boardId = el.value; paint(); return; }
  if (el.dataset.choose === 'swimlane') { ui.swimlane = el.value; paint(); return; }
  if (el.dataset.module) { ws.modules[el.dataset.module] = el.checked; scheduleSave(); paint(); return; }
  if (el.dataset.mail) {
    ws.mail[el.dataset.mail] = el.type === 'checkbox' ? el.checked : (el.dataset.mail === 'port' ? Number(el.value) || 587 : el.value);
    scheduleSave();
    return;
  }
  if (el.dataset.sso) { ws.sso[el.dataset.sso] = el.value; scheduleSave(); return; }
  if (el.dataset.screen && current) {
    const fields = [...document.querySelectorAll('[data-screen]')].filter((box) => box.checked).map((box) => box.dataset.screen);
    mutate(() => { current.screen = { create: ['summary', ...fields] }; });
    return;
  }
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
  if (el.dataset.managed === 'name') { mutate(() => updateProject(ws, el.dataset.id, { name: el.value }, actor())); return; }
  if (el.dataset.managed === 'lead') { mutate(() => updateProject(ws, el.dataset.id, { leadId: el.value }, actor())); return; }
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
  if (el.dataset.customColor || 'customDark' in el.dataset) {
    if (!settings.customTheme) settings.customTheme = customFrom(resolveTheme(settings.theme, prefersDark(), null));
    if (el.dataset.customColor) settings.customTheme[el.dataset.customColor] = el.value;
    if ('customDark' in el.dataset) settings.customTheme.dark = el.checked;
    settings.theme = 'custom';
    saveSettings();
    const theme = resolveTheme('custom', false, settings.customTheme);
    applyTheme(theme);
    setWindowTheme(theme.dark);
    if ('customDark' in el.dataset) paint();
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
  if (el.dataset.bg === 'speed') {
    settings.backgroundSpeed = Number(el.value) || 0;
    const out = el.parentElement?.querySelector('output');
    if (out) out.textContent = `${settings.backgroundSpeed}%`;
    saveSettings();
    return;
  }
  if (el.id === 'quick-search') { ui.quick = el.value; return; }
  if (el.id === 'example-filter') {
    ui.exampleFilter = el.value;
    paint();
    const box = document.querySelector('#example-filter');
    if (box) {
      box.focus();
      const end = box.value.length;
      box.setSelectionRange(end, end);
    }
    return;
  }
  if (el.id === 'issue-query') { ui.query = el.value; return; }
  if (el.id === 'wiki-query') {
    ui.wikiQuery = el.value;
    paint();
    const box = document.querySelector('#wiki-query');
    if (box) {
      box.focus();
      const end = box.value.length;
      box.setSelectionRange(end, end);
    }
    return;
  }
  if (el.id === 'doc-filter') {
    ui.docFilter = el.value;
    paint();
    const box = document.querySelector('#doc-filter');
    if (box) {
      box.focus();
      const end = box.value.length;
      box.setSelectionRange(end, end);
    }
    return;
  }
  if (el.dataset.doc && ui.docId) {
    const doc = (ws.documents || []).find((item) => item.id === ui.docId);
    if (!doc || doc.authorId !== actor()) return;
    doc[el.dataset.doc] = el.value;
    doc.updated = new Date().toISOString();
    if (ui.path) ui.dirty = true;
    scheduleSave();
    return;
  }
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
  const gripLabel = esc(L('끌어서 창 크기 변경', 'Drag to resize the window'));
  document.querySelector('#app').innerHTML = `<header id="menubar"></header><div id="toolbar"></div><div id="workspace"><nav id="left"></nav><main id="view"></main><aside id="right"></aside></div><footer id="statusbar"></footer><div class="resize-grip${isDesktop() ? '' : ' static'}" ${isDesktop() ? `data-resize-grip role="separator" aria-label="${gripLabel}"` : 'aria-hidden="true"'} title="${gripLabel}">${gripIcon()}</div><div id="coach" hidden></div><div id="context" class="menu-pop" hidden></div><div id="modal" hidden></div><div id="toast" hidden role="status"></div><input id="file-open" type="file" accept=".mwf,.json,application/json" hidden><input id="file-attach" type="file" hidden>`;
  document.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeWindow().catch(() => {});
  });
  document.body.addEventListener('contextmenu', (event) => {
    if (!ui.ready || event.target.closest('input, textarea, select, #modal')) return;
    const card = event.target.closest('[data-card]');
    const surface = event.target.closest('#view, #left, #toolbar, #right');
    if (!card && !surface) return;
    event.preventDefault();
    if (card) ui.issueId = card.dataset.card;
    ui.context = { kind: card ? 'issue' : 'view', id: card?.dataset.card || '', x: event.clientX, y: event.clientY };
    ui.menu = null;
    ui.popover = null;
    paint();
  });
  document.body.addEventListener('click', (event) => {
    const hadContext = Boolean(ui.context) && !event.target.closest('#context');
    if (hadContext) ui.context = null;
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
      if (actionEl.closest('#context')) ui.context = null;
      if (!['theme-menu', 'login-menu', 'pick-login'].includes(actionEl.dataset.action)) ui.popover = null;
      ui.menu = null;
      onAction(actionEl);
      return;
    }
    if (hadContext || ((ui.menu || ui.popover) && !event.target.closest('.popover') && !event.target.closest('.menu'))) {
      ui.menu = null;
      ui.popover = null;
      paint();
    }
  });
  document.body.addEventListener('change', onChange);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('submit', (event) => {
    const server = event.target.closest('#server-form');
    if (server) { event.preventDefault(); connectServer(server); return; }
    const login = event.target.closest('[data-login]');
    if (login) { event.preventDefault(); onAction({ dataset: { action: 'sign-in' } }); return; }
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
    if (!card || card.classList.contains('start-card')) return;
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
    if (!file) return;
    if (ui.pageAttach) {
      const pageId = ui.pageAttach;
      ui.pageAttach = '';
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      mutate(() => attachPage(ws, pageId, { name: file.name, mime: file.type, size: file.size, data }, actor()));
      return;
    }
    if (!current || !ui.issueId) return;
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    mutate(() => addAttachment(ws, current.id, ui.issueId, { name: file.name, mime: file.type, size: file.size, data }, actor()));
  });
  document.addEventListener('keydown', (event) => {
    const hit = takeShortcut(event);
    if (!hit) return;
    if (hit.id !== 'run-search') event.preventDefault();
    if (hit.id === 'wait') return;
    if (ui.modal && hit.id !== 'escape' && hit.id !== 'run-search') return;
    runShortcut(hit, event);
  });
}

const FREE_VIEWS = new Set(['home', 'help', 'settings', 'users', 'projects', 'extensions', 'people']);

function listedIssueIds() {
  const ids = [];
  for (const node of document.querySelectorAll('#view [data-card], #view [data-action="open-issue"]')) {
    const id = node.dataset.card || node.dataset.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function stepIssue(delta) {
  const ids = listedIssueIds();
  if (!ids.length) return;
  const at = ids.indexOf(ui.issueId);
  const next = at < 0 ? ids[delta > 0 ? 0 : ids.length - 1] : ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
  ui.issueId = next;
  ui.selected = [next];
  paint();
  document.querySelector(`[data-card="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function runShortcut(hit, event) {
  if (hit.id === 'escape') {
    if (ui.menu || ui.popover || ui.modal || ui.context) {
      ui.menu = null;
      ui.popover = null;
      ui.modal = null;
      ui.context = null;
      paint();
      return;
    }
    if (ui.view === 'issue') { ui.view = 'board'; paint(); }
    return;
  }
  if (hit.id === 'run-search') {
    if (event.target.id === 'quick-search') ui.query = searchFrom(event.target.value);
    else ui.query = event.target.value;
    ui.view = 'issues';
    event.target.blur();
    paint();
    return;
  }
  if (hit.id === 'go') {
    if (!ui.ready) return;
    if (ADMIN_VIEWS.has(hit.view) && !isWorkspaceAdmin(ws.users.find((user) => user.id === actor()))) {
      toast(L('관리자 계정으로 로그인해야 합니다.', 'Sign in with the administrator account.'));
      return;
    }
    if (!FREE_VIEWS.has(hit.view) && !ensureProject()) return;
    ui.view = hit.view;
    paint();
    return;
  }
  if (hit.id === 'panel') { onAction({ dataset: { action: 'toggle-panel', id: hit.panel } }); return; }
  if (hit.id === 'focus-search') { onAction({ dataset: { action: 'focus-search' } }); return; }
  if (hit.id === 'open-guide') { onAction({ dataset: { action: 'open-guide', id: 'guide' } }); return; }
  if (hit.id === 'comments') {
    if (!ui.issueId || !ensureProject()) return;
    ui.view = 'issue';
    ui.issueTab = 'comments';
    paint();
    document.querySelector('#comment-body')?.focus();
    return;
  }
  if (hit.id === 'next-issue') { if (ui.ready) stepIssue(1); return; }
  if (hit.id === 'prev-issue') { if (ui.ready) stepIssue(-1); return; }
  if (hit.id === 'open-selected') {
    if (!ui.ready) return;
    if (!ui.issueId) stepIssue(1);
    if (!ui.issueId) return;
    ui.view = 'issue';
    ui.issueTab = 'details';
    paint();
    return;
  }
  onAction({ dataset: { action: hit.id } });
}

export async function start() {
  if (settings.backgroundRandom) {
    settings.background = nextBackground(settings.background);
    saveSettings();
  }
  mount();
  setBackendLanguage(settings.language);
  ui.dataUrl = dataUrl();
  ui.ready = false;
  try { ui.localBackup = Boolean(await loadLocal()); } catch { ui.localBackup = false; }
  try { pendingFiles = await startupFiles() || []; } catch { pendingFiles = []; }
  await refreshStatus();
  let entered = false;
  if (settings.showStartPage === false && ui.status?.connected) {
    try {
      const loaded = await loadWorkspace();
      const body = upgradeWorkspace(loaded.workspace || {});
      const locked = (body.users || []).some((user) => user.passwordHash);
      if (!locked) {
        await enterWorkspace(body);
        entered = true;
      }
    } catch { /* a locked or unread workspace still opens on the start page */ }
  }
  if (!entered) paint();
  await showMain();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if (settings.theme === 'system') applyTheme(resolveTheme('system', prefersDark(), settings.customTheme));
  });
}
