import guideEn from '../UsersGuide.en.md?raw';
import guideKo from '../UsersGuide.md?raw';
import wqlEn from '../docs/WQL.en.md?raw';
import wqlKo from '../docs/WQL.md?raw';
import { toCsv, toMarkdown } from './domain/export.js';
import { markInboxRead, setNotice } from './domain/notices.js';
import { bindMentions } from './ui/mentions.js';
import { bindInline, highlightInline } from './ui/inline.js';
import { allowed, isWorkspaceAdmin, roleForAccess } from './domain/permissions.js';
import { exampleWorkspace } from './domain/examples.js';
import { sampleWorkspace } from './domain/sample.js';
import { TUTORIAL } from './domain/tutorial.js';
import { attachDocument, createDocument, deleteDocument, removeDocumentFile, shareDocument, updateDocument } from './domain/documents.js';
import { TEMPLATE_GROUPS, templateBody, templateById } from './domain/page-templates.js';
import { issueMacrosToMarkdown } from './domain/issue-macros.js';
import { shiftedDates } from './domain/dependencies.js';
import { timelineTodayX } from './ui/timeline.js';
import { addColumn, addPage, addRow, addShape, addSpace, attachPage, commentPage, copyPage, deletePageComment, canEditPage, deleteSpace, editPageComment, pageDescendants, resolvePageComment, updateSpace, expandPage, likePage, markEditing, movePage, pageByShare, purgePage, removePageFile, removeShape, restorePage, restoreTrashed, setPageAccess, setPageStatus, shareLink, updatePage, watchPage } from './domain/wiki.js';
import { addArticle, addCalendar, addToken, addWebhook, authorizationUrl, csvIssueRows, decideApproval, deleteArticle, deleteToken, deleteWebhook, openApproval } from './domain/services.js';
import { loadSettings, PANEL_MAX, PANEL_MIN, rememberPath, saveSettings } from './domain/settings.js';
import {
  addAttachment, addComment, addComponent, addField, addGadget, addGroup, setLogin, addLink, addRule, addStatus, addTransition,
  addUser, addVersion, addWorklog, blankWorkspace, cloneIssue, completeSprint, createIssue, createSprint, deleteComment, ensureAdmin, updateProfile,
  canDeleteProject, deleteFilter, deleteIssue, deleteProject, deleteRule, deleteWorklog, findIssue, markAllRead, markRead, mergeProject, newProject,
  projectDocument, rankIssues, readDocument,   releaseVersion, removeAttachment, removeField, removeGadget, removeLink,
  removeStatus, removeTransition, saveFilter, setAdmin, setArchived, setCustomField, setMember, setUserActive,
  startSprint, toggleGroupUser, toggleWatch, transitionGate, updateIssue, updateProject, upgradeWorkspace, userByAccount, workspaceDocument,
} from './domain/store.js';
import { writingExport } from './domain/markdown.js';
import { fromDateInput, parseDuration, uid } from './domain/util.js';
import { auditLog, encryptionKey, testConnection } from './platform/data.js';
import { closeThisWindow, openToolWindow } from './platform/native.js';
import { PRINT_CONTENT_KEY } from './ui/printwin.js';
import { refreshSettings, SETTINGS_KEY } from './domain/settings.js';
import { bindListViews, arrangedColumns, sortedRows } from './ui/listview.js';
import { bindCardDrag } from './ui/carddrag.js';
import { AUDIT_COLUMNS, actionLabel, auditSummary, formatTime } from './ui/audit.js';
import { changeOwnPassword, leavePage, livePage, releaseSignInLock, schemaSql, schemaStatus, setUserPassword, signInLocks, upgradeSchema, waitForService } from './platform/data.js';
import { clampLockMinutes, formatCountdown, formatLockMinutes, LOCK_ATTEMPTS, LOCK_MAX_MINUTES, LOCK_MIN_MINUTES } from './domain/signin-lock.js';
import { createLiveWriter, shiftedOffset, writeKeepingCaret } from './ui/live.js';
import { decorateIcons } from './ui/autoicons.js';
import { htmlToMarkdown } from './domain/htmlmd.js';
import { renderMarkdown } from './domain/markdown.js';
import { installTooltips } from './ui/tooltip.js';
import { createTeam, deleteTeam, DEFAULT_METHODS, moveProjectToTeam, setProjectAccess, setProjectMethod, setTeamMember, teamSpace, updateTeam } from './domain/teams.js';
import { clearMainRequest, clearSavedLogin, connectData, currentSession, dataStatus, dataUrl, hashPassword, loadWorkspace, loginSession, logoutSession, readMainRequest, rememberDataUrl, rememberLogin, rememberSession, savedLogin, saveWorkspace, sendTestMail, sessionToken, unlockData, watchMainRequest, watchSharedSession } from './platform/data.js';
import { getLanguage, L, setLanguage } from './i18n.js';
import { appInfo, chooseOpen, chooseSave, dragWindow, errorText, isDesktop, openBrowser, openDocWindow, openTalk, readTextFile, resizeWindow, setBackendLanguage, setLaunchAtStartup, setWindowTheme, showMain, startupFiles, windowControl, writeTextFile } from './platform/native.js';
import { loadLocal, saveLocal } from './platform/storage.js';
import { applyFont, applyTheme, customFrom, randomThemeId, resolveTheme } from './themes.js';
import { avatar as avatarHtml, esc, icon } from './ui/bits.js';
import { figure } from './ui/figures.js';
import { paletteItems, renderContext, renderMenubar, renderModal, renderNav, renderStatus, renderToolbar } from './ui/chrome.js';
import { ADMIN_VIEWS, takeShortcut } from './ui/shortcuts.js';
import { renderRight, renderView, showRight } from './ui/pages.js';
import { DOC_KINDS, openDocument, prepareReader, readingHtml } from './ui/docwindow.js';
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
  'dependency-cycle': ['이렇게 연결하면 서로를 기다리게 됩니다. 순서를 확인하세요.', 'That link would make the issues wait for each other. Check the order.'],
  'photo-invalid': ['사진은 이미지 파일이어야 합니다.', 'The photo must be an image file.'],
  'self-link': ['이슈를 자기 자신에게 연결할 수 없습니다.', 'An issue cannot be linked to itself.'],
  query: ['질의 문법을 확인하세요.', 'Check the query syntax.'],
  'status-used': ['이 상태를 쓰는 이슈가 있습니다.', 'Issues still use this status.'],
  validator: ['이 전이의 검사를 통과하지 못했습니다.', 'That move failed its check.'],
  'approval-required': ['승인이 필요합니다.', 'This move needs approval.'],
  'url-invalid': ['http 또는 https 주소여야 합니다.', 'Use an http or https address.'],
  password: ['암호가 맞지 않습니다.', 'That password does not match.'],
  conflict: ['다른 사람이 먼저 저장했습니다. 최신 내용을 다시 열었습니다.', 'Someone else saved first. The latest workspace is open.'],
  'not-registered': ['등록된 사용자가 아닙니다.', 'That account is not registered.'],
  'key-mismatch': ['이 데이터베이스는 다른 데이터 서비스의 키로 암호화되어 있습니다. 그 서비스의 설정 → 데이터베이스에서 키를 복사해 "암호화 키"에 넣고 다시 연결하세요.', "This database is encrypted with another data service's key. Copy the key from that service's Settings → Database, put it in \"Encryption key\" and connect again."],
  'tls-unsupported': ['DB 서버가 TLS를 지원하지 않습니다. 서버에서 TLS를 켜는 것이 원칙이며, 꼭 필요하면 "TLS로 암호화해 연결"을 끄고 연결하세요.', 'The database server does not support TLS. Turn TLS on at the server; only if you must, turn off "Encrypt the connection with TLS".'],
  'tls-required': ['DB 서버가 암호화된 연결만 받습니다. "TLS로 암호화해 연결"을 켜세요.', 'The database server accepts encrypted connections only. Turn on "Encrypt the connection with TLS".'],
  'tls-certificate': ['DB 서버의 인증서를 확인하지 못했습니다. 자체 서명 인증서라면 "서버 인증서 확인"을 끄세요.', "The database server's certificate could not be verified. For a self-signed certificate, turn off \"Verify the server's certificate\"."],
  'key-invalid': ['암호화 키 형식이 맞지 않습니다 (32바이트 base64 또는 hex).', 'The encryption key is not valid (32 bytes, base64 or hex).'],
  'database-missing': ['데이터베이스가 없습니다. "없으면 데이터베이스 만들기"를 켜고 다시 연결하세요.', 'The database does not exist. Turn on "Create the database if it is missing" and connect again.'],
  locked: ['로그인을 여러 번 연달아 실패해 잠시 로그인할 수 없습니다.', 'Too many failed sign-ins in a row; sign-in waits for a while.'],
  'sso-required': ['발급자 주소와 클라이언트가 필요합니다.', 'An issuer and a client are required.'],
  'driver-missing': ['그 데이터베이스 드라이버가 설치되어 있지 않습니다.', 'That database driver is not installed.'],
  'engine-unknown': ['지원하지 않는 데이터베이스입니다.', 'That database is not supported.'],
  'project-required': ['과제를 연 뒤에 그 과제와 공유하세요.', 'Open a project before sharing with it.'],
  connect: ['데이터베이스에 연결하지 못했습니다.', 'Could not connect to the database.'],
  service: ['데이터 서비스에 연결하지 못했습니다. 프로그램이 데이터 서비스를 시작하는 중일 수 있으니 잠시 뒤 다시 시도하세요.', 'The data service did not answer. The program may still be starting it; try again in a moment.'],
  'password-change': ['처음 로그인했습니다. 계속하려면 새 암호를 정하세요.', 'This is your first sign-in. Choose a new password to continue.'],
  'password-weak': ['암호는 6자 이상이어야 합니다.', 'A password needs at least 6 characters.'],
  'password-same': ['지금 암호와 다른 암호를 정하세요.', 'Choose a password different from the current one.'],
  'password-mismatch': ['새 암호 두 칸이 서로 다릅니다.', 'The two new password boxes do not match.'],
  'password-required': ['처음 암호를 입력하세요.', 'Enter a first password.'],
  'login-invalid': ['아이디는 2~32자의 영문자, 숫자, ., _, - 만 쓸 수 있습니다.', 'An ID is 2-32 letters, digits, ".", "_" or "-".'],
  'admin-required': ['로그인할 수 있는 관리자가 한 명은 있어야 합니다.', 'At least one administrator must be able to sign in.'],
  'duplicate-login': ['같은 아이디가 이미 있습니다.', 'That ID is already taken.'],
  'duplicate-team': ['같은 이름의 팀이 있습니다.', 'A team with that name already exists.'],
  'team-has-projects': ['과제가 있는 팀은 삭제할 수 없습니다. 과제를 다른 팀으로 옮기거나 삭제하세요.', 'A team with projects cannot be deleted. Move or delete its projects first.'],
  'team-last': ['마지막 팀은 삭제할 수 없습니다.', 'The last team cannot be deleted.'],
  'method-required': ['관리 방법을 하나 이상 남겨 두세요.', 'Keep at least one management method.'],
  'lead-required': ['과제의 주 책임자는 책임자로 남아야 합니다. 과제 설정에서 책임자를 먼저 바꾸세요.', 'The main lead stays a lead. Change the lead in project settings first.'],
  'project-has-children': ['하위 과제가 있는 과제는 삭제할 수 없습니다. 하위 과제를 먼저 옮기거나 삭제하세요.', 'A project with sub-projects cannot be deleted. Move or delete its sub-projects first.'],
  'database-missing': ['그 데이터베이스가 서버에 없습니다. "없으면 데이터베이스 만들기"를 켜고 다시 연결하세요.', 'That database does not exist on the server. Turn on "Create the database if it is missing" and connect again.'],
  'database-create': ['데이터베이스를 만들지 못했습니다. 계정에 CREATE DATABASE 권한이 있는지 확인하세요.', 'The database could not be created. Check that the account may CREATE DATABASE.'],
  'database-name': ['데이터베이스 이름은 영문자, 숫자, _, -, $ 만 쓸 수 있습니다.', 'A database name may use letters, digits, _, - and $ only.'],
  schema: ['표를 만들지 못했습니다. 계정에 CREATE 권한이 있는지 확인하거나, SQL 스크립트를 DBA에게 전달하세요.', 'The tables could not be created. Check that the account may CREATE tables, or give the SQL script to your DBA.'],
  'schema-newer': ['이 데이터베이스는 더 새 버전의 MyWorkForce가 만든 것입니다. 프로그램을 업데이트하세요.', 'A newer MyWorkForce made this database. Update the program.'],
  'mail-host': ['메일 서버 주소를 입력하세요.', 'Enter the mail server address.'],
  'mail-from': ['보내는 메일 주소를 입력하세요.', 'Enter the From address.'],
  'mail-to': ['받을 메일 주소를 입력하세요.', 'Enter the address that should receive the message.'],
  mail: ['메일을 보내지 못했습니다.', 'The message could not be sent.'],
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
    about: null, queryError: null, textSnap: null, textField: '', textIssue: null, screenFind: {}, reading: null,
  };
}

function project() {
  return ws.projects.find((item) => item.id === ws.activeProjectId) || null;
}

function actor() {
  return ui.loginUser || ws.currentUserId;
}

function prefersDark() {
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function message(error) {
  const code = error?.message || errorText(error);
  if ((code === 'connect' || code === 'mail') && error?.detail && error.detail !== code && error.detail !== 'mail') return error.detail;
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
  if (error?.message === 'password-change' && ui.loginUser) { askNewPassword(''); return; }
  toast(message(error));
}

let loginTimer = 0;

/**
 * A sign-in that did not work, told in the sign-in window: why, how many tries are left before the lock,
 * or — when locked — how long to wait. The window is not redrawn, so the line is written in place.
 */
function signInFailure(error) {
  const info = error?.info || {};
  if (error?.message === 'locked') {
    ui.loginLock = Number(info.until) || Date.now() + (Number(info.seconds) || 600) * 1000;
    ui.loginLockAttempts = Number(info.attempts) || LOCK_ATTEMPTS;
    ui.loginError = '';
  } else {
    ui.loginLock = 0;
    const why = message(error);
    let text = L(`로그인에 실패했습니다. ${why}`, `Sign-in failed. ${why}`);
    const left = Number(info.remaining);
    if (Number.isFinite(left) && left > 0) {
      text += ` ${L(
        `${left}번 더 실패하면 ${formatLockMinutes(info.minutes, 'ko')} 동안 로그인할 수 없습니다.`,
        `After ${left} more failed ${left > 1 ? 'tries' : 'try'}, sign-in waits ${formatLockMinutes(info.minutes, 'en')}.`,
      )}`;
    }
    ui.loginError = text;
  }
  syncLoginForms();
  // Shake the message again on every failure, so a second wrong password is noticed too.
  for (const line of document.querySelectorAll('.login-error')) { line.style.animation = 'none'; void line.offsetWidth; line.style.animation = ''; }
  const box = document.querySelector('#modal [data-login] [name="password"]');
  if (box && error?.message !== 'service') { box.value = ''; if (!ui.loginLock) box.focus(); }
  toast(ui.loginLock ? lockText() : ui.loginError);
}

function lockText() {
  const left = formatCountdown(ui.loginLock - Date.now(), getLanguage());
  const times = ui.loginLockAttempts || LOCK_ATTEMPTS;
  return L(`로그인을 ${times}번 연달아 실패해 잠겼습니다. ${left} 뒤에 다시 로그인할 수 있습니다.`, `${times} failed sign-ins in a row; sign-in is locked. Try again in ${left}.`);
}

/** Writes the sign-in message into every sign-in form, and keeps the button off while locked. */
function syncLoginForms() {
  clearTimeout(loginTimer);
  if (ui.loginLock && ui.loginLock <= Date.now()) {
    ui.loginLock = 0;
    ui.loginError = '';
    ui.loginNote = L('이제 다시 로그인할 수 있습니다.', 'You can sign in again now.');
  }
  const locked = Boolean(ui.loginLock);
  const text = locked ? lockText() : ui.loginError || ui.loginNote || '';
  for (const box of document.querySelectorAll('.login-error')) {
    box.hidden = !text;
    box.textContent = text;
    box.classList.toggle('locked', locked);
    box.classList.toggle('note', !locked && !ui.loginError && Boolean(ui.loginNote));
  }
  for (const button of document.querySelectorAll('.login-submit')) button.disabled = locked || ui.connecting;
  if (locked) loginTimer = setTimeout(syncLoginForms, 1000 - (Date.now() % 1000) + 5);
}

function clearLoginMessage() {
  ui.loginError = '';
  ui.loginNote = '';
  if (ui.loginLock && ui.loginLock <= Date.now()) ui.loginLock = 0;
}

let saving = false;

/** The page body as Markdown: from the document being written, or from the source box. */
function currentPageBody() {
  if (ui.pageSource) return document.querySelector('#page-body')?.value ?? '';
  const doc = document.querySelector('#page-doc');
  if (doc) return htmlToMarkdown(doc.innerHTML);
  return document.querySelector('#page-body')?.value ?? '';
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Adds files to a page's file list (not into its text). Too-big files are named and skipped; the rest go in. */
async function attachPageFiles(pageId, files, embed) {
  const list = [...(files || [])];
  if (!list.length) return;
  const tooBig = list.filter((file) => file.size > 700_000);
  const fit = list.filter((file) => file.size <= 700_000);
  const loaded = [];
  for (const file of fit) {
    try { loaded.push({ name: file.name, mime: file.type, size: file.size, data: await readDataUrl(file) }); } catch (error) { fail(error); }
  }
  if (loaded.length) {
    mutate(() => {
      if (document.querySelector('#page-body') && ui.wikiEdit) {
        ui.pageDraft = null;
        updatePage(ws, pageId, { title: document.querySelector('#page-title')?.value, body: currentPageBody(), labels: document.querySelector('#page-labels')?.value }, actor());
      }
      for (const item of loaded) attachPage(ws, pageId, item, actor(), { embed });
    });
  }
  if (tooBig.length) toast(`${message(new Error('attachment-big'))} ${tooBig.map((file) => file.name).join(', ')}`);
  else if (loaded.length) toast(L(`파일 ${loaded.length}개를 넣었습니다.`, `Added ${loaded.length} file${loaded.length > 1 ? 's' : ''}.`));
}

function scrollTimelineToToday() {
  const chart = document.querySelector('[data-tl-chart]');
  if (chart) chart.scrollLeft = Math.max(0, timelineTodayX(chart) - chart.clientWidth / 3);
}

/**
 * Dragging on the timeline: a bar (or one of its ends) moves its dates by whole days; the dot at a bar's
 * right drawn onto another bar makes that issue wait for this one. A press without a move opens the issue.
 */
function bindTimeline() {
  let drag = null;
  const svgPoint = (svg, event) => {
    const box = svg.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.('[data-tl-drag], [data-tl-link]');
    const svg = target?.closest('.tl-svg');
    if (!target || !svg || event.button !== 0) return;
    const group = target.closest('[data-tl-issue]');
    event.preventDefault();
    const start = svgPoint(svg, event);
    if (target.dataset.tlLink) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'tl-drag-line');
      line.setAttribute('x1', target.getAttribute('cx'));
      line.setAttribute('y1', target.getAttribute('cy'));
      line.setAttribute('x2', target.getAttribute('cx'));
      line.setAttribute('y2', target.getAttribute('cy'));
      svg.appendChild(line);
      drag = { kind: 'link', fromId: target.dataset.tlLink, line, svg };
    } else {
      drag = { kind: 'move', edge: target.dataset.tlDrag, id: group.dataset.tlIssue, group, svg, start, px: Number(svg.dataset.tlPx) || 30, moved: false };
    }
    try { target.setPointerCapture?.(event.pointerId); } catch { /* a pointer the browser does not track */ }
  });
  document.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const at = svgPoint(drag.svg, event);
    if (drag.kind === 'link') {
      drag.line.setAttribute('x2', at.x);
      drag.line.setAttribute('y2', at.y);
      for (const bar of drag.svg.querySelectorAll('.tl-bar.drop')) bar.classList.remove('drop');
      const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tl-issue]');
      if (under && under.dataset.tlIssue !== drag.fromId) under.classList.add('drop');
      return;
    }
    const dx = at.x - drag.start.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    const days = Math.round(dx / drag.px);
    drag.days = days;
    const rect = drag.group.querySelector('.tl-rect');
    if (!drag.box) drag.box = { x: Number(rect.getAttribute('x')), w: Number(rect.getAttribute('width')) };
    const shift = days * drag.px;
    if (drag.edge === 'both') drag.group.setAttribute('transform', `translate(${shift},0)`);
    else if (drag.edge === 'start') { rect.setAttribute('x', drag.box.x + Math.min(shift, drag.box.w - drag.px)); rect.setAttribute('width', Math.max(drag.px, drag.box.w - shift)); }
    else rect.setAttribute('width', Math.max(drag.px, drag.box.w + shift));
  });
  document.addEventListener('pointerup', (event) => {
    if (!drag) return;
    const done = drag;
    drag = null;
    const current = project();
    if (!current) return;
    if (done.kind === 'link') {
      done.line.remove();
      const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-tl-issue]');
      if (under && under.dataset.tlIssue !== done.fromId) mutate(() => addLink(ws, current.id, done.fromId, 'blocks', under.dataset.tlIssue, actor()));
      else paint();
      return;
    }
    if (!done.moved) {
      const open = document.createElement('button');
      open.dataset.action = 'open-issue';
      open.dataset.id = done.id;
      onAction(open);
      return;
    }
    const issue = findIssue(current, done.id);
    if (!issue || !done.days) { paint(); return; }
    mutate(() => updateIssue(ws, current.id, issue.id, shiftedDates(current, issue, done.days, done.edge), actor()));
  });
}

let autosaveTimer = 0;

/** Who else is writing the open page, shown beside its path. */
function showWriters(editors) {
  const box = document.querySelector('#live-people');
  if (!box) return;
  const others = (editors || []).filter((item) => item.id !== actor());
  box.hidden = !others.length;
  box.innerHTML = others.length
    ? `${others.map((item) => avatarHtml(ws.users.find((user) => user.id === item.id) || { name: item.name })).join('')}<span>${esc(L(`${others.map((item) => item.name).join(', ')} 님과 함께 쓰는 중`, `Writing with ${others.map((item) => item.name).join(', ')}`))}</span>`
    : '';
}

let liveRefresh = false;

/** After the server saved a page being written together, the rest of the workspace is brought up to date quietly. */
async function refreshAfterLive(revision) {
  if (liveRefresh || saveTimer || saving || !revision || revision <= (Number(ws.revision) || 0)) return;
  liveRefresh = true;
  try {
    const loaded = await loadWorkspace();
    if (loaded.workspace && Number(loaded.workspace.revision) > (Number(ws.revision) || 0) && !saveTimer && !saving) {
      ws = upgradeWorkspace(loaded.workspace);
      paint();
    }
  } catch { /* the next turn tries again */ }
  finally { liveRefresh = false; }
}

const liveWriter = createLiveWriter({
  read: () => {
    const editor = document.querySelector('#view .doc-editor');
    if (!editor || ui.view !== 'knowledge') return null;
    return { pageId: editor.dataset.page, text: currentPageBody(), title: document.querySelector('#page-title')?.value ?? '' };
  },
  write: (text) => {
    const editor = document.querySelector('#view .doc-editor');
    const page = (ws.articles || []).find((item) => item.id === editor?.dataset.page);
    if (!editor || !page) return;
    if (ui.pageSource) {
      const box = document.querySelector('#page-body');
      if (!box) return;
      const caret = box.selectionStart;
      const old = box.value;
      box.value = text;
      if (document.activeElement === box) { const at = shiftedOffset(old, text, caret); box.setSelectionRange(at, at); }
    } else {
      const doc = document.querySelector('#page-doc');
      if (!doc) return;
      writeKeepingCaret(doc, renderMarkdown(text, page.attachments || []), text, doc.textContent);
      ui.pageDraft = { id: page.id, title: document.querySelector('#page-title')?.value ?? page.title, html: doc.innerHTML };
    }
  },
  writeTitle: (title) => { const box = document.querySelector('#page-title'); if (box && document.activeElement !== box) box.value = title; },
  send: livePage,
  leave: leavePage,
  report: (turn) => {
    if (!turn.live) {
      // Back to saving here: whatever is in the editor is saved now.
      showWriters([]);
      if (turn.pageId) { ui.pageDirty = turn.pageId; flushPageSave(); }
      return;
    }
    showWriters(turn.editors);
    const page = (ws.articles || []).find((item) => item.id === turn.pageId);
    if (page) { page.body = turn.text; page.title = turn.title; }
    setSaveState(turn.error ? message(new Error(turn.error)) : turn.saved ? L('저장됨 · 함께 쓰기', 'Saved · live') : L('저장 중…', 'Saving…'), Boolean(turn.error));
    for (const name of document.querySelectorAll(`.ws-name[data-id="${CSS.escape(turn.pageId)}"] > span`)) name.textContent = turn.title;
    if (turn.saved) refreshAfterLive(turn.revision);
  },
});

/** The live link follows the editor on screen: it starts with an open page and stops when the page closes. */
function syncLive() {
  const editor = document.querySelector('#view .doc-editor');
  if (editor && ui.ready && sessionToken() && liveWriter.enabled) {
    const page = (ws.articles || []).find((item) => item.id === editor.dataset.page);
    if (page) liveWriter.start(page.id, page);
  } else if (liveWriter.active) liveWriter.stop();
}

function setSaveState(text, bad = false) {
  const box = document.querySelector('#page-save-state');
  if (!box) return;
  box.textContent = text;
  box.classList.toggle('bad', bad);
}

/** Notes that the page being written has changed and saves it a moment after typing stops. */
function pageTyped() {
  const pageId = document.querySelector('.doc-editor')?.dataset.page;
  if (!pageId) return;
  if (liveWriter.active && liveWriter.pageId === pageId) {
    setSaveState(L('저장 중…', 'Saving…'));
    liveWriter.nudge();
    return;
  }
  ui.pageDirty = pageId;
  setSaveState(L('저장 중…', 'Saving…'));
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { flushPageSave(); }, 1500);
}

/**
 * Saves the page being written (without redrawing the screen, so the caret stays). Returns false when it
 * could not be saved (an empty title, or no right to edit); the writing stays, marked unsaved.
 */
function flushPageSave() {
  clearTimeout(autosaveTimer);
  const pageId = ui.pageDirty;
  if (!pageId) return true;
  if (liveWriter.active && liveWriter.pageId === pageId) { ui.pageDirty = ''; liveWriter.nudge(); return true; }
  const page = (ws.articles || []).find((item) => item.id === pageId);
  const editor = document.querySelector(`.doc-editor[data-page="${CSS.escape(pageId)}"]`);
  if (!page || !editor) { ui.pageDirty = ''; return true; }
  const title = document.querySelector('#page-title')?.value ?? page.title;
  const labels = document.querySelector('#page-labels')?.value;
  try {
    updatePage(ws, pageId, { title, body: currentPageBody(), labels }, actor(), { coalesce: true });
  } catch (error) {
    setSaveState(message(error), true);
    return false;
  }
  ui.pageDirty = '';
  ui.pageDraft = null;
  scheduleSave();
  const time = new Date().toLocaleTimeString(getLanguage() === 'en' ? 'en' : 'ko', { hour: '2-digit', minute: '2-digit' });
  setSaveState(L(`저장됨 · ${time}`, `Saved · ${time}`));
  // The page's name in the tree follows its title without a redraw.
  for (const name of document.querySelectorAll(`.ws-name[data-id="${CSS.escape(pageId)}"] > span, .doc-crumbs .crumb[data-id="${CSS.escape(pageId)}"]`)) name.textContent = page.title;
  return true;
}

/** Draws the open dialog again (paintModal leaves a dialog of the same kind alone). */
function repaintModal() {
  const box = document.querySelector('#modal');
  const scroll = box?.querySelector('.tpl-cards')?.scrollTop || 0;
  const typed = box?.querySelector('#template-find')?.value || '';
  if (box) box.dataset.kind = '';
  paint();
  const cards = document.querySelector('#modal .tpl-cards');
  if (cards) cards.scrollTop = scroll;
  const find = document.querySelector('#modal #template-find');
  if (find && typed) { find.value = typed; filterTemplates(typed); }
}

/** Hides the template cards that do not match what is typed in the picker's search box. */
function filterTemplates(text) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  for (const card of document.querySelectorAll('#modal .tpl-card')) {
    card.hidden = !words.every((word) => (card.dataset.text || '').includes(word));
  }
}

/** The label a page made from a template gets: its kind of work, in the language in use. */
function templateLabel(template, english) {
  const group = TEMPLATE_GROUPS.find((item) => item.id === template.group);
  return group ? (english ? group.en.split(/[ &,]/)[0] : group.ko.split('·')[0]) : template.group;
}

/** Makes the page (blank or from a template) under a workspace or a parent page and opens it for writing. */
function createPageFrom(spaceId, parentId, templateId) {
  const template = templateId && templateId !== 'blank' ? templateById(templateId) : null;
  const english = getLanguage() === 'en';
  ui.modal = null;
  mutate(() => {
    const page = addPage(ws, {
      spaceId, parentId,
      title: template ? (english ? template.en : template.ko) : (english ? 'New page' : '새 페이지'),
      body: template ? templateBody(template, english ? 'en' : 'ko') : '',
      labels: template ? [templateLabel(template, english)] : [],
    }, actor());
    ui.spaceId = page.spaceId;
    ui.wsOpen = { ...(ui.wsOpen || {}), [page.spaceId]: true };
    if (parentId) ui.pageFold = { ...(ui.pageFold || {}), [parentId]: false };
    ui.articleId = page.id;
    ui.wikiEdit = true;
    ui.pageDraft = null;
    ui.pageSource = false;
    ui.view = 'knowledge';
    ui.pageView = 'edit';
  });
  requestAnimationFrame(() => { const title = document.querySelector('#page-title'); title?.focus(); title?.select?.(); });
}

let linkRange = null;

/** One formatting command on the page being written. */
function formatPage(format) {
  const doc = document.querySelector('#page-doc');
  if (!doc) return;
  if (format === 'issue-apply') {
    // One issue goes in as a chip where the caret is; a list goes in as its own paragraph.
    const mode = document.querySelector('#doc-issue-mode')?.value || 'one';
    const key = document.querySelector('#doc-issue-project')?.value || '';
    const typed = (document.querySelector('#doc-issue-text')?.value || '').replace(/[\[\]]/g, '').trim();
    document.querySelector('.doc-issue-bar')?.setAttribute('hidden', '');
    doc.focus();
    if (linkRange) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(linkRange); }
    linkRange = null;
    if (mode === 'one') {
      const issueKey = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(typed) ? typed.toUpperCase() : (/^\d+$/.test(typed) && key ? `${key}-${typed}` : '');
      if (!issueKey) { toast(L('이슈 키를 적으세요. 예: PAY-12', 'Type an issue key, such as PAY-12.')); return; }
      document.execCommand('insertText', false, `[[issue:${issueKey}]] `);
    } else {
      document.execCommand('insertHTML', false, `<p>[[issues:${key}${typed ? ` | ${typed.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))}` : ''}]]</p><p><br></p>`);
    }
    return;
  }
  if (format === 'link-apply') {
    const url = document.querySelector('#doc-link-url')?.value.trim() || '';
    document.querySelector('.doc-link-bar')?.setAttribute('hidden', '');
    doc.focus();
    if (linkRange) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(linkRange); }
    if (/^(https?:|mailto:)/i.test(url)) {
      if (getSelection()?.isCollapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '%22')}">${url.replace(/[<>&]/g, '')}</a>`);
      else document.execCommand('createLink', false, url);
    } else if (url) toast(message(new Error('url-invalid')));
    linkRange = null;
    return;
  }
  doc.focus();
  const block = { p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote', pre: 'pre' }[format];
  if (block) { document.execCommand('formatBlock', false, `<${block}>`); return; }
  const simple = { bold: 'bold', italic: 'italic', strike: 'strikeThrough', ul: 'insertUnorderedList', ol: 'insertOrderedList', hr: 'insertHorizontalRule', undo: 'undo', redo: 'redo' }[format];
  if (simple) { document.execCommand(simple, false, null); return; }
  if (format === 'code') {
    const text = String(getSelection() || '').replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
    document.execCommand('insertHTML', false, `<code>${text || 'code'}</code>&nbsp;`);
    return;
  }
  if (format === 'table') {
    const head = L(['항목', '내용', '비고'], ['Item', 'Detail', 'Note']);
    document.execCommand('insertHTML', false, `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>`);
    return;
  }
  if (format === 'toc' || format === 'children') {
    document.execCommand('insertHTML', false, `<p>[[${format}]]</p>`);
    return;
  }
  if (format === 'issue') {
    const sel = getSelection();
    linkRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    document.querySelector('.doc-issue-bar')?.removeAttribute('hidden');
    const input = document.querySelector('#doc-issue-text');
    if (input) { input.value = ''; input.focus(); }
    return;
  }
  if (format === 'link') {
    const sel = getSelection();
    linkRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const bar = document.querySelector('.doc-link-bar');
    bar?.removeAttribute('hidden');
    const input = document.querySelector('#doc-link-url');
    if (input) { input.value = ''; input.focus(); }
  }
}

/** A workspace that replaces the open one (an example, the sample, an empty one) keeps the stored revision, so saving it is not taken for someone else's change. */
function replaceWorkspace(next) {
  const revision = ws?.revision || 0;
  // The signed-in person must still be there afterwards: their id stays (the server keeps the password
  // by id), and the new workspace's person with the same login becomes them.
  const me = (ws?.users || []).find((user) => user.id === ui.loginUser);
  let out = next;
  if (me) {
    const twin = (out.users || []).find((user) => user.id === me.id)
      || (out.users || []).find((user) => me.login && String(user.login || '').toLowerCase() === String(me.login).toLowerCase());
    if (twin && twin.id !== me.id) out = JSON.parse(JSON.stringify(out).split(JSON.stringify(twin.id)).join(JSON.stringify(me.id)));
    const mine = (out.users || []).find((user) => user.id === me.id);
    if (mine) Object.assign(mine, { login: me.login, active: true });
    else (out.users = out.users || []).unshift({ ...me });
    out.currentUserId = me.id;
    out = upgradeWorkspace(out);
  }
  out.revision = revision;
  // The company's sign-in lock policy is not part of an example.
  if (ws?.security && !out.security) out.security = structuredClone(ws.security);
  return out;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    saving = true;
    const done = () => { saving = false; };
    saveLocal(ws).catch((error) => fail(error));
    if (!ui.ready) { done(); return; }
    saveWorkspace(ws).then((saved) => {
      if (saved?.revision) ws.revision = saved.revision;
      if (ws.mail?.password) {
        ws.mail.hasPassword = true;
        ws.mail.password = '';
      }
    }).catch((error) => {
      if (error?.message !== 'conflict') { fail(error); return; }
      return loadWorkspace().then((loaded) => {
        ws = upgradeWorkspace(loaded.workspace || ws);
        paint();
        toast(message(error));
      }).catch((reload) => fail(reload));
    }).finally(done);
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
  offerWelcome();
  paint();
  applyMainRequest();
  const file = pendingFiles.shift();
  if (!file) return;
  try { ingest(await readTextFile(file), file); } catch (error) { fail(error); }
}

function openRequested(request) {
  const projects = ws.projects || [];
  const named = projects.find((item) => item.id === request.projectId || (request.projectKey && item.key === request.projectKey));
  if (named) ws.activeProjectId = named.id;
  const kind = request.kind || '';
  if (request.pageId || request.view === 'knowledge') {
    ui.articleId = request.pageId || '';
    ui.view = 'knowledge';
    // Its workspace opens with it (ready to write, as a page opened here would), and the company
    // inbox notices about it count as read.
    const page = (ws.articles || []).find((item) => item.id === request.pageId);
    ui.pageView = 'edit';
    ui.pageDraft = null;
    ui.wikiEdit = Boolean(page && canEditPage(page, actor()));
    if (page) {
      ui.spaceId = page.spaceId;
      ui.wsOpen = { ...(ui.wsOpen || {}), [page.spaceId]: true };
      for (const item of ws.inbox || []) if (item.userId === actor() && item.pageId === page.id) item.read = true;
    }
  } else if (request.documentId || request.view === 'documents') {
    if (request.documentId) openDocTab(request.documentId);
    else { ui.docId = ''; ui.view = 'documents'; }
  } else if (request.view === 'issue' || request.issueId || request.issueKey) {
    const host = projects.find((item) => (item.issues || []).some((issue) => issue.id === request.issueId || (request.issueKey && issue.key === request.issueKey))) || named || project();
    if (host) ws.activeProjectId = host.id;
    const issue = findIssue(host, request.issueId || request.issueKey);
    if (issue) {
      ui.issueId = issue.id;
      ui.issueTab = kind === 'comment' ? 'comments' : 'details';
      ui.view = 'issue';
    } else ui.view = 'notifications';
  } else if (request.view) ui.view = request.view;
  if (request.profile && request.userId) {
    const user = (ws.users || []).find((item) => item.id === request.userId);
    if (user) {
      ui.profilePhoto = user.photo || '';
      ui.modal = { kind: 'profile', userId: user.id };
      ui.view = isWorkspaceAdmin(ws.users.find((item) => item.id === actor())) ? 'users' : (project() ? 'people' : ui.view);
    }
  }
  ui.menu = null;
  paint();
}

function applyMainRequest() {
  const request = readMainRequest();
  if (!request || !ui.loginUser) return;
  if (!ui.ready) {
    if (!ui.opened) return;
    ui.ready = true;
    ui.returnView = '';
  }
  clearMainRequest(request.at);
  openRequested(request);
}

let pulling = false;

async function pullWorkspace() {
  if (pulling || !ui.ready || !sessionToken() || ui.modal || saveTimer || saving || ui.dragId) return;
  const active = document.activeElement;
  if (active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)) return;
  if (ui.wikiEdit && ui.view === 'knowledge') return;
  pulling = true;
  try {
    const status = await dataStatus();
    const revision = Number(status.revision) || 0;
    if (!revision || revision === Number(ws.revision)) return;
    const loaded = await loadWorkspace();
    const body = loaded.workspace;
    if (!body || Number(body.revision) === Number(ws.revision)) return;
    ws = upgradeWorkspace(body);
    undo = [];
    redo = [];
    paint();
  } catch { /* the next pass tries again */ }
  finally { pulling = false; }
}

let statusRetry = 0;

async function refreshStatus() {
  clearTimeout(statusRetry);
  try {
    const status = await dataStatus();
    if (status.connected && sessionToken()) {
      const loaded = await loadWorkspace();
      const body = loaded.workspace;
      if (body) {
        const hadPassword = (body.users || []).some((user) => isWorkspaceAdmin(user) && user.passwordHash);
        const upgraded = upgradeWorkspace(body);
        if (!hadPassword && upgraded.users.some((user) => isWorkspaceAdmin(user) && user.passwordHash)) await saveWorkspace(upgraded);
        status.people = upgraded.users.filter((user) => user.active !== false).map((user) => ({
          id: user.id, name: user.name || '', login: user.login || '', email: user.email || '', hasPassword: Boolean(user.passwordHash),
        }));
        status.projects = (upgraded.projects || []).map((project) => ({
          id: project.id, key: project.key || '', name: project.name || '', type: project.type || 'software',
          parentId: project.parentId || '',
          parentKey: (upgraded.projects || []).find((item) => item.id === project.parentId)?.key || '',
          issues: (project.issues || []).length, archived: Boolean(project.archived),
        }));
      }
    }
    ui.status = status;
  } catch {
    ui.status = { listening: false };
  }
  if (ui.status?.listening === false) statusRetry = setTimeout(() => { refreshStatus().catch(() => {}); }, 2000);
  if (!ui.ready) paint();
}

async function afterConnect(password) {
  const loaded = await loadWorkspace();
  const body = loaded.workspace || {};
  const hadPassword = (body.users || []).some((user) => isWorkspaceAdmin(user) && user.passwordHash);
  const upgraded = upgradeWorkspace(body);
  if (!hadPassword && upgraded.users.some((user) => isWorkspaceAdmin(user) && user.passwordHash)) await saveWorkspace(upgraded);
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
  if (chosen && ui.loginAccount) ui.loginUser = chosen.id;
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
    try { ui.connection = await connectData({ engine: 'sqlite' }); }
    catch (error) { if (error?.message !== 'permission') throw error; }
    if (stay) ui.returnView = stay;
    await afterConnect(ui.loginPassword || document.querySelector('#local-unlock')?.value || '');
  } catch (error) {
    ui.connecting = false;
    ui.startError = message(error);
    if (!stay) ui.ready = false;
    paint();
  }
}

/** The connection typed in Settings → Database. */
function serverFormConfig(form) {
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || '').trim();
  return {
    engine: value('engine') || 'mysql', host: value('host'), port: value('port'),
    database: value('database'), user: value('user'), password: String(data.get('password') || ''),
    tls: data.get('tls') === 'on', tlsVerify: data.get('tlsVerify') === 'on',
    encryptionKey: value('encryptionKey'),
  };
}

/** Tries the typed connection without switching to it, and shows what it found under the form. */
async function testServerForm() {
  const form = document.querySelector('#server-form');
  if (!form || ui.dbTesting) return;
  const config = serverFormConfig(form);
  ui.dbDraft = config;
  ui.dbTesting = true;
  ui.dbTest = null;
  paint();
  try {
    const service = String(new FormData(form).get('service') || '').trim();
    if (service) rememberDataUrl(service);
    ui.dbTest = await testConnection(config);
  } catch (error) {
    ui.dbTest = { ok: false, error: error?.message || 'connect', detail: message(error) };
  }
  ui.dbTesting = false;
  paint();
  document.querySelector('.db-test')?.scrollIntoView({ block: 'nearest' });
}

/** Reads the audit log with the screen's filter. */
async function loadAudit() {
  const filter = ui.audit?.filter || {};
  ui.audit = { ...(ui.audit || {}), filter, loading: true, error: '' };
  paint();
  try {
    const result = await auditLog({ ...filter, limit: 500 });
    ui.audit = { ...ui.audit, entries: result.entries || [], people: result.people || {}, loaded: true, loading: false };
  } catch (error) {
    ui.audit = { ...ui.audit, loading: false, loaded: true, error: message(error) };
  }
  paint();
}

/** The audit entries as shown (column order and sort of the list) in a CSV file. */
async function exportAudit() {
  const audit = ui.audit || {};
  const columns = arrangedColumns(AUDIT_COLUMNS(audit.people || {}), settings.listViews?.audit || {});
  const rows = sortedRows(audit.entries || [], columns, (settings.listViews?.audit || { sort: { col: 'at', dir: 'desc' } }).sort);
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const text = [columns.map((column) => cell(column.label)).join(','), ...rows.map((row) => columns.map((column) => {
    if (column.id === 'at') return cell(formatTime(row.at));
    if (column.id === 'action') return cell(actionLabel(row.action));
    if (column.id === 'summary') return cell(auditSummary(row, audit.people || {}));
    return cell(column.value ? column.value(row) : row[column.id]);
  }).join(','))].join('\r\n');
  const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
  try {
    // A BOM so spreadsheet programs read the Korean correctly.
    if (isDesktop()) {
      const path = await chooseSave(filename, ['csv']);
      if (!path) return;
      await writeTextFile(path, `\ufeff${text}`);
    } else download(`\ufeff${text}`, filename, 'text/csv');
    toast(L('감사 로그를 저장했습니다.', 'The audit log is saved.'));
  } catch (error) {
    fail(error);
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
    const result = await connectData({ ...serverFormConfig(form), createDatabase: data.get('createDatabase') === 'on' });
    ui.dbDraft = null;
    ui.dbTest = null;
    ui.connection = result;
    if (!ui.loginUser) {
      // A first setup before anyone signed in: now that there is a database, sign in to it.
      ui.connecting = false;
      ui.startError = '';
      await refreshStatus();
      ui.modal = { kind: 'login', next: 'gate' };
      ui.loginNote = L('데이터베이스에 연결했습니다. 로그인하세요.', 'Connected to the database. Sign in.');
      paint();
      return;
    }
    ui.schema = result.schema || null;
    toast(connectSummary(result));
    if (result.sessionsReset) {
      // The new database has its own people: sign in again there.
      rememberSession('');
      ui.loginUser = '';
      ui.loginAccount = '';
      ui.loginPassword = '';
      ui.unlocked = false;
      ui.ready = false;
      ui.opened = false;
      ui.connecting = false;
      ui.modal = null;
      ui.startError = L('새 데이터베이스에 연결했습니다. 그 데이터베이스의 계정으로 다시 로그인하세요.', 'Connected to the new database. Sign in again with an account of that database.');
      await refreshStatus();
      paint();
      return;
    }
    if (ui.ready) ui.returnView = ui.view || 'settings';
    await afterConnect(value('unlock'));
  } catch (error) {
    ui.connecting = false;
    ui.startError = message(error);
    // What was typed stays in the form, so a wrong value is fixed rather than typed again.
    ui.dbDraft = serverFormConfig(form);
    if (!ui.ready) ui.ready = false;
    paint();
  }
}

/** One line about what connecting did to the database. */
function connectSummary(result) {
  const parts = [L('데이터베이스에 연결했습니다.', 'Connected to the database.')];
  if (result.createdDatabase) parts.push(L('데이터베이스를 만들었습니다.', 'The database was created.'));
  if (result.created?.length) parts.push(L(`표 ${result.created.length}개를 만들었습니다.`, `${result.created.length} tables were created.`));
  if (result.applied?.length) parts.push(L(`스키마를 버전 ${result.applied.at(-1)}(으)로 올렸습니다.`, `The schema was upgraded to version ${result.applied.at(-1)}.`));
  return parts.join(' ');
}

async function refreshSchema(loud = false) {
  if (!ui.loginUser) return;
  ui.schemaBusy = true;
  try {
    ui.schema = await schemaStatus();
    ui.schemaError = '';
    if (loud) toast(ui.schema.ready ? L('스키마가 최신입니다.', 'The schema is up to date.') : L('스키마를 만들거나 올려야 합니다.', 'The schema needs to be created or upgraded.'));
  } catch (error) {
    ui.schemaError = message(error);
  } finally {
    ui.schemaBusy = false;
    paint();
  }
}

async function runSchemaUpgrade() {
  ui.schemaBusy = true;
  paint();
  try {
    const result = await upgradeSchema();
    ui.schema = result;
    ui.schemaError = '';
    const did = [];
    if (result.created?.length) did.push(L(`표 ${result.created.length}개를 만들었습니다.`, `${result.created.length} tables were created.`));
    if (result.applied?.length) did.push(L(`버전 ${result.applied.at(-1)}(으)로 올렸습니다.`, `Upgraded to version ${result.applied.at(-1)}.`));
    toast(did.join(' ') || L('바꿀 것이 없습니다. 스키마가 최신입니다.', 'Nothing to change. The schema is up to date.'));
  } catch (error) {
    ui.schemaError = message(error);
  } finally {
    ui.schemaBusy = false;
    paint();
  }
}

async function openSchemaSql(engine) {
  try {
    const result = await schemaSql(engine);
    ui.modal = { kind: 'schema-sql', engine: result.engine, sql: result.sql };
    paint();
  } catch (error) {
    toast(message(error));
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

async function confirmRegistered(account, password) {
  if (!account) throw new Error('not-registered');
  const session = await loginSession(account, password);
  ui.opened = true;
  ui.unlocked = true;
  ui.loginUser = session.user.id;
  ui.loginAccount = session.user.login || account;
  if (session.user.mustChangePassword) {
    askNewPassword(password);
    throw new Error('password-change');
  }
}

/** Opens the window where a person must choose their own password before anything else. */
function askNewPassword(current = '') {
  ui.connecting = false;
  ui.startError = '';
  ui.modal = { kind: 'change-password', forced: true, current };
  paint();
}

/** Waits for a save in flight, then saves now, so the server knows about a person just added. */
async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  for (let i = 0; i < 100 && saving; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!ui.ready) return;
  const saved = await saveWorkspace(ws);
  if (saved?.revision) ws.revision = saved.revision;
}

/** The administrator gives a person a password; they choose their own at the next sign-in. */
async function givePassword(userId, password, mustChange) {
  await flushSave();
  const result = await setUserPassword(userId, password, mustChange);
  if (result?.revision) ws.revision = result.revision;
  const user = ws.users.find((item) => item.id === userId);
  if (user) user.mustChangePassword = Boolean(result?.mustChangePassword);
  paint();
}

async function changeMyPassword(form) {
  const modal = ui.modal || {};
  const data = new FormData(form);
  const current = modal.current || String(data.get('current') || '');
  const next = String(data.get('next') || '');
  if (next !== String(data.get('confirm') || '')) { toast(message(new Error('password-mismatch'))); return; }
  try {
    const result = await changeOwnPassword(current, next);
    if (result?.revision && ui.ready) ws.revision = result.revision;
    const me = ws.users.find((user) => user.id === ui.loginUser);
    if (me) me.mustChangePassword = false;
    if (settings.autoLogin && savedLogin()?.password) rememberLogin(ui.loginAccount, next);
    ui.modal = null;
    toast(L('암호를 바꿨습니다.', 'Your password is changed.'));
    if (modal.forced && !ui.ready) {
      await afterSignIn();
      return;
    }
    paint();
  } catch (error) {
    if (error?.message === 'password' && modal.current) ui.modal = { ...modal, current: '' };
    paint();
    toast(message(error));
  }
}

function storeAutoLogin() {
  if (!settings.autoLogin) return;
  const account = document.querySelector('[data-autologin="account"]')?.value.trim() || ui.loginAccount || savedLogin()?.account || '';
  const typed = document.querySelector('[data-autologin="password"]')?.value || '';
  const password = typed || savedLogin()?.password || '';
  if (account && password) rememberLogin(account, password);
}

let adopting = false;

async function adoptSharedSession() {
  if (ui.connecting || adopting) return Boolean(ui.loginUser && sessionToken());
  if (!sessionToken()) {
    if (ui.loginUser) {
      ui.loginUser = '';
      ui.loginAccount = '';
      ui.ready = false;
      ui.opened = false;
      ui.unlocked = false;
      paint();
    }
    return false;
  }
  if (ui.loginUser) return true;
  adopting = true;
  try {
    const data = await currentSession();
    ui.loginUser = data.user.id;
    ui.loginAccount = data.user.login || data.user.name || '';
    ui.unlocked = true;
    ui.opened = true;
    if (data.user.mustChangePassword) {
      askNewPassword('');
      return true;
    }
    if (ui.status?.connected) await afterSignIn();
    else paint();
    return true;
  } catch {
    rememberSession('');
    return false;
  } finally {
    adopting = false;
  }
}

async function autoSignIn() {
  if (ui.loginUser || !settings.autoLogin) return;
  const saved = savedLogin();
  if (!saved?.account) return;
  ui.loginAccount = saved.account;
  ui.loginPassword = saved.password || '';
  await companySignIn();
}

async function companySignIn() {
  ui.connecting = true;
  ui.startError = '';
  paint();
  try {
    if (!ui.status?.connected) {
      try { ui.connection = await connectData({}); }
      catch (error) { if (error?.message !== 'permission') throw error; }
    }
    if (!ui.connection && ui.status?.engine) ui.connection = { engine: ui.status.engine, database: ui.status.database || '' };
    const typed = ui.loginPassword;
    const session = await loginSession(ui.loginAccount, ui.loginPassword);
    clearLoginMessage();
    ui.loginLock = 0;
    askTutorial = true;
    if (settings.autoLogin) rememberLogin(ui.loginAccount, typed || savedLogin()?.password || '');
    ui.loginPassword = '';
    ui.loginUser = session.user.id;
    ui.loginAccount = session.user.login || ui.loginAccount;
    ui.unlocked = true;
    ui.opened = true;
    if (session.user.mustChangePassword) {
      askNewPassword(typed);
      return;
    }
    await afterSignIn();
  } catch (error) {
    ui.connecting = false;
    ui.loginPassword = '';
    // The failure is told where the person signs in: the sign-in window (opened for a failed automatic sign-in too).
    ui.startError = '';
    if (ui.modal?.kind !== 'login') ui.modal = { kind: 'login', next: 'gate' };
    paint();
    signInFailure(error);
  }
}

async function ensureStore() {
  if (ui.connection) return;
  rememberDataUrl(ui.dataUrl || dataUrl());
  // The database already open in the data service is the one to use; only a service without one connects.
  const status = await dataStatus().catch(() => null);
  if (status?.connected) { ui.connection = { engine: status.engine || '', database: status.database || '' }; return; }
  ui.connection = await connectData({});
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
    ws = replaceWorkspace(upgradeWorkspace(exampleWorkspace(id, Date.now(), getLanguage())));
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
    ws = replaceWorkspace(upgradeWorkspace(exampleWorkspace('shop', Date.now(), getLanguage())));
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
  const active = ws.users.find((user) => user.id === actor() && user.active !== false) || null;
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

/** Set by a sign-in: the next time the workspace opens, ask whether to run the tutorial. */
let askTutorial = false;

/** Asks whether to run the tutorial (Settings → Start page turns the question off). */
function offerWelcome() {
  if (!askTutorial || !ui.loginUser) return;
  askTutorial = false;
  if (settings.showWelcome === false || Number.isInteger(ui.tutorial)) return;
  if (ui.modal && ui.modal.kind !== 'login') return;
  ui.modal = { kind: 'welcome' };
}

/** The sign-in window, when nobody is signed in and nothing else is open. */
function askSignIn() {
  if (ui.loginUser || ui.reading || (ui.modal && ui.modal.kind !== 'login')) return;
  ui.modal = { kind: 'login', next: 'gate' };
}

let docPreviewTimer = 0;

/** A second click on the same item within a moment: a double-click, counted here because the first click redraws. */
let lastPick = { kind: '', id: '', at: 0 };
function secondClick(kind, id) {
  const now = Date.now();
  const again = lastPick.kind === kind && lastPick.id === id && now - lastPick.at < 450;
  lastPick = again ? { kind: '', id: '', at: 0 } : { kind, id, at: now };
  return again;
}

/** The screens visited, for "Back" (the last 30). */
let shownScreen = null;
let goingBack = false;
const screenOf = () => ({ view: ui.view, issueId: ui.issueId, teamId: ui.teamId, docId: ui.docId, articleId: ui.articleId, spaceId: ui.spaceId, boardId: ui.boardId });
const sameScreen = (a, b) => a && b && a.view === b.view && (a.view !== 'issue' || a.issueId === b.issueId) && (a.view !== 'team' || a.teamId === b.teamId) && (a.view !== 'documents' || a.docId === b.docId) && (a.view !== 'knowledge' || a.articleId === b.articleId);

function rememberScreen() {
  if (!ui.ready || windowMode) return;
  const now = screenOf();
  if (shownScreen && !sameScreen(shownScreen, now) && !goingBack) {
    ui.screenHistory = [...(ui.screenHistory || []), shownScreen].slice(-30);
  }
  goingBack = false;
  shownScreen = now;
}

/** "Back": the screen before this one (the board when there is none). */
function goBack() {
  const history = ui.screenHistory || [];
  let previous = history.pop();
  while (previous && sameScreen(previous, screenOf())) previous = history.pop();
  ui.screenHistory = history;
  goingBack = true;
  if (!previous) {
    if (ui.view === 'documents' && ui.docId) { ui.docId = ''; paint(); return; }
    ui.view = project() ? 'board' : 'home';
  } else {
    Object.assign(ui, previous);
    if (previous.view === 'documents' && previous.docId && !(ui.docTabs || []).includes(previous.docId)) ui.docId = '';
  }
  paint();
}

/** '' in the main window; 'settings' in the settings window (index.html?tool=settings). */
let windowMode = '';

const TOOL_TITLES = { print: ['인쇄', 'Print'], settings: ['설정', 'Settings'], about: ['프로그램 정보', 'About'] };

/** Opens a tool window of its own: print, settings or about. */
function openTool(kind) {
  const [ko, en] = TOOL_TITLES[kind] || [kind, kind];
  return openToolWindow(kind, getLanguage() === 'en' ? 'en' : 'ko', `MyWorkForce — ${L(ko, en)}`).catch((error) => toast(message(error)));
}

/** The screen's content without its buttons and inputs: what a print of "this screen" shows. */
function printableView() {
  const view = document.querySelector('#view');
  if (!view) return '';
  const copy = view.cloneNode(true);
  for (const el of copy.querySelectorAll('button, input, select, textarea, .finder, .page-actions, .tabs, .lv-resize, .doc-tabbar, .doc-files, .doc-head .doc-meta')) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const text = document.createElement('span');
      text.textContent = el.value || '';
      if (el.value && !['checkbox', 'radio', 'range', 'color'].includes(el.type)) el.replaceWith(text); else el.remove();
      continue;
    }
    if (el.tagName === 'SELECT') { const text = document.createElement('span'); text.textContent = el.selectedOptions?.[0]?.textContent || ''; el.replaceWith(text); continue; }
    el.remove();
  }
  return copy.innerHTML;
}

/**
 * Print: the document or page being written (its finished text), otherwise the screen in view. The print window
 * (its own window) lays it out on paper, with the printer, page setup and a preview.
 */
function printCurrent() {
  let title = '';
  let subtitle = '';
  let html = '';
  if (ui.view === 'documents' && ui.docId) {
    const doc = (ws.documents || []).find((item) => item.id === ui.docId);
    if (doc) {
      title = doc.title || L('문서', 'Document');
      subtitle = [(ws.users || []).find((user) => user.id === doc.authorId)?.name, doc.issueKey].filter(Boolean).join(' · ');
      html = `<h1>${esc(title)}</h1>${renderMarkdown(doc.body || '', doc.attachments || [])}`;
    }
  } else if (ui.view === 'knowledge' && ui.articleId) {
    const page = (ws.articles || []).find((item) => item.id === ui.articleId);
    if (page) {
      title = page.title || L('페이지', 'Page');
      subtitle = (ws.spaces || []).find((space) => space.id === page.spaceId)?.name || '';
      html = `<h1>${esc(title)}</h1>${renderMarkdown(currentPageBody() || page.body || '')}`;
    }
  }
  if (!html) {
    title = document.querySelector('#view .page-head h1, #view h1, #view h2')?.textContent?.trim() || 'MyWorkForce';
    subtitle = project()?.name || '';
    html = printableView();
  }
  try {
    localStorage.setItem(PRINT_CONTENT_KEY, JSON.stringify({ title, subtitle, html, at: Date.now(), lang: getLanguage() }));
  } catch {
    toast(L('인쇄할 내용이 너무 큽니다.', 'The content is too large to print.'));
    return;
  }
  openTool('print');
}

/** Opens a document in a tab of its own (or brings its tab forward). */
function openDocTab(id) {
  if (!id) return;
  // A tab already open stays where it is; a new one goes at the end.
  if (!(ui.docTabs || []).includes(id)) ui.docTabs = [...(ui.docTabs || []), id];
  ui.docId = id;
  ui.view = 'documents';
}

/** Closes a document tab; the tab beside it (or the list) comes forward. */
function closeDocTab(id) {
  const tabs = ui.docTabs || [];
  const at = tabs.indexOf(id);
  ui.docTabs = tabs.filter((item) => item !== id);
  if (ui.docId === id) ui.docId = ui.docTabs[Math.min(at, ui.docTabs.length - 1)] || '';
}

function signedOut(name, el) {
  if (ui.loginUser) return false;
  // With no database connected nobody can sign in; on the data service's own computer the database is set up first.
  if (ui.status?.setup && ['open-db-setup', 'test-connection', 'schema-sql'].includes(name)) return false;
  if (name === 'sign-in' || name === 'pick-login' || name === 'open-login' || name === 'modal-cancel') return false;
  if (name === 'close-reading' || name === 'reader-lang' || name === 'reader-print') return false;
  // The start page's own tools and help work before signing in.
  if (['start-menu', 'start-setting', 'start-arrange', 'about', 'shortcuts', 'show-welcome', 'language', 'pick-background', 'shuffle-background'].includes(name)) return false;
  if ((name === 'open-guide' || name === 'help-doc') && ['guide', 'tutorial', 'wql'].includes(el?.dataset?.id || 'guide')) return false;
  if (name === 'start-tab' && ['guide', 'tutorial'].includes(el?.dataset?.id || 'guide')) return false;
  return true;
}

function showReading(kind) {
  if (!DOC_KINDS[kind]) return;
  ui.reading = kind;
  if (ui.modal?.kind === 'login' || ui.modal?.kind === 'welcome') ui.modal = null;
  paint();
}

/**
 * The user's guide, the tutorial document and the WQL guide always open in a window of their own (an OS
 * window on the desktop, a browser window on the web), signed in or not. Only if no window can open does
 * the document show inside this window.
 */
function presentDocument(kind) {
  if (!DOC_KINDS[kind]) return;
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  ui.context = null;
  if (isDesktop()) {
    openDocWindow(kind, lang, `MyWorkForce — ${L(DOC_KINDS[kind].ko, DOC_KINDS[kind].en)}`).catch(() => showReading(kind));
    return;
  }
  if (!openDocument(kind)) showReading(kind);
}

/**
 * Where a sign-in lands: the workspace is loaded either way (so the start page and the workspace switch at once),
 * then Settings → Start page → "Show the start page when the program opens" picks the start page or the main screen.
 */
async function afterSignIn() {
  const loaded = await loadWorkspace();
  await enterWorkspace(loaded.workspace || {});
  if (settings.showStartPage !== false) showStartPage(true);
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

function applyPanelWidths() {
  const app = document.querySelector('#app');
  if (!app) return;
  app.style.setProperty('--left-width', `${settings.leftWidth || PANEL_MIN}px`);
  app.style.setProperty('--right-width', `${settings.rightWidth || PANEL_MIN}px`);
  const label = L('끌어서 패널 너비를 바꿉니다.', 'Drag to change the panel width.');
  document.querySelectorAll('.panel-split').forEach((node) => {
    node.title = label;
    node.setAttribute('aria-label', label);
  });
}

function bindPanelSplitters() {
  document.querySelectorAll('.panel-split').forEach((splitter) => {
    splitter.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const side = splitter.dataset.split;
      const app = document.querySelector('#app');
      if (!app || app.classList.contains('on-start')) return;
      if (side === 'left' && app.classList.contains('fold-left')) return;
      if (side === 'right' && (app.classList.contains('fold-right') || app.classList.contains('no-right'))) return;
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('dragging');
      const key = side === 'left' ? 'leftWidth' : 'rightWidth';
      const startX = event.clientX;
      const startWidth = Number(settings[key]) || PANEL_MIN;
      const move = (ev) => {
        const room = document.querySelector('#workspace')?.getBoundingClientRect().width || 0;
        const otherOpen = side === 'left'
          ? !app.classList.contains('no-right') && !app.classList.contains('fold-right')
          : !app.classList.contains('fold-left');
        const other = otherOpen ? Number(side === 'left' ? settings.rightWidth : settings.leftWidth) || PANEL_MIN : 36;
        const limit = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(room - other - 6 - 280)));
        const width = Math.max(PANEL_MIN, Math.min(limit, Math.round(startWidth + (side === 'left' ? ev.clientX - startX : startX - ev.clientX))));
        settings[key] = width;
        app.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`);
      };
      const up = (ev) => {
        splitter.classList.remove('dragging');
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', up);
        splitter.removeEventListener('pointercancel', up);
        if (splitter.hasPointerCapture?.(ev.pointerId)) splitter.releasePointerCapture(ev.pointerId);
        saveSettings();
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', up);
      splitter.addEventListener('pointercancel', up);
    });
  });
}

function paint() {
  if (windowMode === 'settings') ui.view = 'settings';
  rememberScreen();
  if (windowMode === 'settings') queueMicrotask(() => { document.title = `MyWorkForce — ${L('설정', 'Settings')}`; });
  const ctx = context();
  const app = document.querySelector('#app');
  applyPanelWidths();
  app.classList.toggle('on-start', !ui.ready);
  if (!ui.ready) {
    app.classList.add('no-right');
    app.classList.remove('fold-left', 'fold-right');
    document.querySelector('#menubar').innerHTML = renderMenubar(ctx);
    document.querySelector('#toolbar').innerHTML = '';
    document.querySelector('#left').innerHTML = '';
    const reading = ui.reading && DOC_KINDS[ui.reading];
    if (reading && (ui.modal?.kind === 'login' || ui.modal?.kind === 'welcome')) ui.modal = null;
    if (!reading && ui.loginUser && ui.modal?.kind === 'login') ui.modal = null;
    if (reading) {
      stopStartBackground();
      document.querySelector('#view').innerHTML = readingHtml(ui.reading);
      prepareReader(document.querySelector('#view'));
    } else {
      document.querySelector('#view').innerHTML = renderStart(ctx);
      mountStartBoard();
      syncStartBackground();
    }
    document.querySelector('#right').innerHTML = '';
    document.querySelector('#statusbar').innerHTML = `<span>${L('회사', 'Company')}</span><span class="grow"></span><span>${L('로그인하면 같은 회사의 과제와 문서를 함께 씁니다.', 'Sign in to share this company\'s projects and documents.')}</span>`;
    document.title = 'MyWorkForce';
    paintModal(ctx);
    paintCoach();
    paintContext(ctx);
    return;
  }
  startCards?.destroy();
  startCards = null;
  stopStartBackground();
  // The audit log reads itself the first time its screen opens.
  if (ui.view === 'audit' && !ui.audit?.loaded && !ui.audit?.loading) setTimeout(() => { loadAudit(); }, 0);
  if (ui.modal?.kind === 'login' && ui.loginUser) ui.modal = null;
  // Views that need no open project stay put (a fresh install has none yet, and the administrator
  // must still reach Settings, Users and Projects to make one).
  if (!ctx.project && !NO_PROJECT_VIEWS.has(ui.view)) ui.view = 'home';
  if (ctx.project && !ctx.project.boards.some((board) => board.id === ui.boardId)) {
    ui.boardId = ctx.project.boards.find((board) => board.type === 'scrum')?.id || ctx.project.boards[0]?.id || null;
  }
  const skipSearch = document.activeElement?.id === 'quick-search';
  const skipNav = document.activeElement?.id === 'nav-ws-name';
  const skipQuery = document.activeElement?.id === 'issue-query';
  const skipLive = Boolean(document.activeElement?.dataset?.live);
  const skipDoc = Boolean(document.activeElement?.dataset?.doc);
  const skipPage = ['page-title', 'page-body', 'page-labels', 'page-comment', 'comment-edit', 'reply-text', 'page-doc', 'doc-link-url', 'global-search', 'doc-title', 'doc-body', 'doc-issue'].includes(document.activeElement?.id);
  app.classList.toggle('no-right', !showRight(ctx));
  app.classList.toggle('fold-left', settings.showLeftPanel === false);
  app.classList.toggle('fold-right', showRight(ctx) && settings.showRightPanel === false);
  if (ui.view !== 'issues') ui.queryError = null;
  document.querySelector('#menubar').innerHTML = renderMenubar(ctx);
  if (!skipSearch) document.querySelector('#toolbar').innerHTML = renderToolbar(ctx);
  if (!skipNav) document.querySelector('#left').innerHTML = renderNav(ctx);
  if (ui.reading && DOC_KINDS[ui.reading]) {
    app.classList.add('no-right');
    document.querySelector('#view').innerHTML = readingHtml(ui.reading);
    prepareReader(document.querySelector('#view'));
    document.querySelector('#right').innerHTML = '';
  } else if (!skipLive && !skipQuery && !skipDoc && !skipPage) {
    document.querySelector('#view').innerHTML = renderView(ctx);
    document.querySelector('#right').innerHTML = showRight(ctx) ? renderRight(ctx) : '';
    decorateIcons(document.querySelector('#view'));
    decorateIcons(document.querySelector('#right'));
    const reading = document.querySelector('#view .doc-body.reading') || document.querySelector('#view #page-doc:not([hidden])');
    if (reading) {
      const page = (ws.articles || []).find((item) => item.id === reading.dataset.page);
      if (page) highlightInline(reading, page.comments, ui.inlineActive || '');
    }
  }
  document.querySelector('#statusbar').innerHTML = renderStatus(ctx);
  syncLive();
  paintModal(ctx);
  paintCoach();
  paintContext(ctx);
  document.title = ctx.project ? `MyWorkForce — ${ctx.project.name}` : 'MyWorkForce';
}

function paintModal(ctx) {
  const modal = document.querySelector('#modal');
  if (!modal) return;
  const kind = ui.modal?.kind || '';
  if (modal.dataset.kind === kind) { syncLoginForms(); return; }
  modal.innerHTML = kind ? renderModal(ctx) : '';
  decorateIcons(modal);
  modal.hidden = !kind;
  modal.dataset.kind = kind;
  if (kind) modal.querySelector('input, textarea, select')?.focus();
  syncLoginForms();
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
  toast(L('먼저 과제를 만드세요.', 'Create a project first.'));
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
  if (!ui.loginUser || !ui.ready) {
    if (!ui.loginUser) { ui.modal = { kind: 'login', next: 'gate' }; paint(); }
    return;
  }
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
  if (modal.kind === 'change-password') { changeMyPassword(form); return; }
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
    givePassword(value('user'), value('password'), data.get('mustChange') === 'on').then(() => {
      ui.modal = null;
      paint();
      toast(L('암호를 저장했습니다.', 'Password saved.'));
    }).catch(fail);
    return;
  }
  const admin = isWorkspaceAdmin(ws.users.find((user) => user.id === actor()));
  const typedPassword = admin ? String(data.get('password') || '') : '';
  const mustChange = data.get('mustChange') === 'on';
  if (modal.kind === 'user' && admin && !typedPassword) { toast(message(new Error('password-required'))); return; }
  if (typedPassword && typedPassword.trim().length < 6) { toast(message(new Error('password-weak'))); return; }
  let passwordFor = '';
  const ok = mutate(() => {
    const current = project();
    if (modal.kind === 'project') {
      const methods = data.getAll('methods').map(String);
      newProject(ws, { name: value('name'), key: value('key'), type: value('type'), description: value('description'), leadId: actor(), parentId: value('parent'), teamId: value('team'), methods: methods.length ? methods : null }, actor());
      if (!['projects', 'team'].includes(ui.view)) ui.view = 'home';
      return;
    }
    if (modal.kind === 'user') {
      const user = addUser(ws, { name: value('name'), email: value('email'), phone: value('phone'), jobTitle: value('jobTitle'), team: value('team'), photo: ui.profilePhoto || '' });
      if (admin) setLogin(ws, user.id, value('login'), actor());
      passwordFor = user.id;
      ui.profilePhoto = '';
      if (current && value('role')) setMember(ws, current.id, user.id, value('role'), actor());
      return;
    }
    if (modal.kind === 'profile') {
      updateProfile(ws, modal.userId, { name: value('name'), email: value('email'), phone: value('phone'), jobTitle: value('jobTitle'), team: value('team'), photo: ui.profilePhoto || '' }, actor());
      if (admin && data.has('login')) {
        setLogin(ws, modal.userId, value('login'), actor());
        if (modal.userId === ui.loginUser && ui.loginAccount !== value('login')) {
          // My own ID changed: the next sign-in (and an automatic one) uses the new ID.
          ui.loginAccount = value('login');
          const saved = savedLogin();
          if (saved?.account) rememberLogin(ui.loginAccount, saved.password || '');
          toast(L(`아이디를 ${ui.loginAccount}(으)로 바꿨습니다. 다음 로그인부터 이 아이디를 씁니다.`, `Your ID is now ${ui.loginAccount}. Use it from the next sign-in.`));
        }
      }
      passwordFor = modal.userId;
      ui.profilePhoto = '';
      return;
    }
    if (modal.kind === 'group') { addGroup(ws, value('name'), actor(), current?.id); return; }
    if (modal.kind === 'workspace') {
      if (modal.spaceId) {
        updateSpace(ws, modal.spaceId, { name: value('name'), description: String(data.get('description') ?? '') }, actor(), admin);
        return;
      }
      const where = value('where');
      const space = addSpace(ws, {
        name: value('name'), key: value('key'), description: String(data.get('description') ?? ''),
        teamId: where.startsWith('team:') ? where.slice(5) : '', projectId: where.startsWith('project:') ? where.slice(8) : '',
      }, actor());
      ui.spaceId = space.id;
      ui.articleId = '';
      ui.wikiEdit = false;
      ui.wsOpen = { ...(ui.wsOpen || {}), [space.id]: true };
      ui.view = 'knowledge';
      return;
    }
    if (modal.kind === 'team') {
      const team = createTeam(ws, { name: value('name'), key: value('key'), description: value('description'), leadId: value('lead') }, actor());
      ui.teamId = team.id;
      ui.view = 'team';
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
  if (ok && typedPassword && passwordFor) {
    givePassword(passwordFor, typedPassword, mustChange).then(() => toast(mustChange ? L('암호를 정했습니다. 다음 로그인 때 그 사람이 새 암호로 바꿉니다.', 'Password set. They choose their own at the next sign-in.') : L('암호를 정했습니다.', 'Password set.'))).catch(fail);
  }
  if (ok) { ui.modal = null; paint(); }
}

function findStoredFile(id) {
  if (!id) return null;
  const lists = [
    ...(ws.articles || []).flatMap((page) => page.attachments || []),
    ...(ws.documents || []).flatMap((doc) => doc.attachments || []),
    ...(ws.projects || []).flatMap((project) => (project.issues || []).flatMap((issue) => issue.attachments || [])),
  ];
  return lists.find((item) => item.id === id) || null;
}

function saveDownload(name, href) {
  if (!href || /^javascript:/i.test(href)) return;
  const link = document.createElement('a');
  link.href = href;
  link.download = name || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadStored(id, name, src) {
  const file = findStoredFile(id);
  saveDownload(file?.name || name || 'file', file?.data || src || '');
}

function exportWriting(title, body, files, format) {
  const doc = writingExport(title, body, files);
  if (format === 'pdf') {
    const frame = document.createElement('iframe');
    frame.title = title || 'PDF';
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
    document.body.appendChild(frame);
    const printed = frame.contentDocument;
    printed.open();
    printed.write(doc.html);
    printed.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
    return;
  }
  const markdown = format === 'md';
  const word = format === 'doc';
  const blob = new Blob([markdown ? doc.markdown : doc.html], { type: markdown ? 'text/markdown;charset=utf-8' : word ? 'application/msword' : 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  saveDownload(markdown ? `${doc.filename}.md` : word ? `${doc.filename}.doc` : `${doc.filename}.html`, url);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function confirm(messageText, action, id = null, yes = null) {
  ui.modal = { kind: 'confirm', message: messageText, action, id, yes };
  paint();
}

function runConfirmed() {
  const modal = ui.modal;
  ui.modal = null;
  if (!modal) return;
  if (modal.action === 'open-file') { paint(); pickAndLoad(); return; }
  if (modal.action === 'load-sample') {
    const keep = { ready: ui.ready, connection: ui.connection, status: ui.status, dataUrl: ui.dataUrl, localBackup: ui.localBackup, unlocked: ui.unlocked };
    ws = replaceWorkspace(upgradeWorkspace(sampleWorkspace()));
    ui = { ...freshUi(), ...keep, view: 'board' };
    undo = []; redo = [];
    scheduleSave();
    paint();
    return;
  }
  if (modal.action === 'open-example') { openExample(ui.pendingExample, true); return; }
  if (modal.action === 'start-tutorial') { beginTutorial(true); return; }
  if (modal.action === 'empty') {
    ws = replaceWorkspace(blankWorkspace());
    ui = freshUi();
    undo = []; redo = [];
    scheduleSave();
    paint();
    return;
  }
  if (modal.action === 'delete-article') {
    const page = (ws.articles || []).find((item) => item.id === modal.id);
    if (!page) { paint(); return; }
    flushPageSave();
    mutate(() => {
      deleteArticle(ws, page.id, actor());
      const gone = new Set([page.id, ...pageDescendants(ws, page.id).map((item) => item.id)]);
      if (gone.has(ui.articleId)) { ui.articleId = ''; ui.wikiEdit = false; ui.spaceId = page.spaceId; }
    });
    return;
  }
  if (modal.action === 'delete-workspace') {
    const admin = isWorkspaceAdmin(ws.users.find((user) => user.id === actor()));
    mutate(() => {
      deleteSpace(ws, modal.id, actor(), admin);
      if (ui.spaceId === modal.id) { ui.spaceId = ''; ui.articleId = ''; }
    });
    return;
  }
  if (modal.action === 'delete-team') {
    mutate(() => { deleteTeam(ws, modal.id, actor()); ui.view = 'teams'; ui.teamId = ''; });
    return;
  }
  if (modal.action === 'delete-project') {
    mutate(() => deleteProject(ws, modal.id, actor()));
    toast(L('과제를 삭제했습니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.', 'The project is deleted. Undo (Ctrl+Z) brings it back.'));
    return;
  }
  if (modal.action === 'delete-issue') mutate(() => { deleteIssue(ws, project().id, ui.issueId, actor()); ui.issueId = null; ui.view = 'issues'; });
  if (modal.action === 'open-browser') {
    const url = ui.pendingUrl || '';
    ui.pendingUrl = '';
    openBrowser(url);
    paint();
  }
}

function onAction(el) {
  const name = el.dataset.action;
  // Leaving the page being written: its repaint is held back only while someone types in it.
  if (['save-page', 'close-page', 'page-source', 'wiki-edit', 'add-child', 'add-page', 'pick-page-file', 'open-article', 'open-workspace', 'toggle-workspace', 'toggle-page', 'new-workspace'].includes(name) && ['page-doc', 'page-title', 'page-body'].includes(document.activeElement?.id)) document.activeElement.blur();
  // Sending or leaving a comment: the comment boxes hold their repaint only while someone types in them.
  if (['search-tab', 'open-hit', 'open-search'].includes(name) && document.activeElement?.id === 'global-search') document.activeElement.blur();
  if (['doc-tab', 'open-doc', 'close-doc', 'save-doc', 'doc-step', 'doc-mode', 'share-doc', 'delete-doc', 'pick-doc-file', 'remove-doc-file', 'go'].includes(name) && ['doc-title', 'doc-body', 'doc-issue'].includes(document.activeElement?.id)) document.activeElement.blur();
  if (['comment-page', 'save-page-comment', 'cancel-page-comment', 'edit-page-comment', 'send-reply', 'cancel-reply', 'reply-page-comment', 'resolve-page-comment'].includes(name) && ['page-comment', 'comment-edit', 'page-quote', 'reply-text'].includes(document.activeElement?.id)) document.activeElement.blur();
  if (ui.pageDirty && !['page-source', 'insert-mention', 'pick-page-file', 'save-page'].includes(name)) flushPageSave();
  if (signedOut(name, el)) {
    ui.modal = { kind: 'login', next: 'gate' };
    paint();
    return;
  }
  const current = project();
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
    const form = el.form || document.querySelector(ui.modal?.kind === 'login' ? '#modal [data-login]' : '[data-login]');
    ui.loginAccount = form?.querySelector('[name="account"]')?.value.trim() || '';
    ui.loginPassword = form?.querySelector('[name="password"]')?.value || '';
    if (ui.loginLock > Date.now()) { syncLoginForms(); toast(lockText()); return; }
    clearLoginMessage();
    syncLoginForms();
    if (ui.modal?.kind === 'login' && ui.modal.next === 'tutorial') {
      confirmRegistered(ui.loginAccount, ui.loginPassword).then(() => {
        ui.loginPassword = '';
        clearLoginMessage();
        if ((ws.projects || []).length) confirm(L('튜토리얼은 쇼핑몰 예제로 작업 공간을 바꿉니다. 계속할까요?', 'The tutorial replaces the workspace with the shop example. Continue?'), 'start-tutorial');
        else beginTutorial();
      }).catch((error) => (error?.message === 'password-change' ? fail(error) : signInFailure(error)));
      return;
    }
    if (!ui.loginAccount) {
      ui.loginError = L('로그인 ID를 입력하세요.', 'Enter a login ID.');
      syncLoginForms();
      toast(ui.loginError);
      return;
    }
    companySignIn();
    return;
  }
  if (name === 'sign-out') {
    logoutSession();
    ui.loginUser = '';
    ui.loginAccount = '';
    ui.loginPassword = '';
    ui.unlocked = false;
    ui.ready = false;
    ui.opened = false;
    ui.reading = null;
    ui.modal = null;
    // Signed out: the sign-in window opens again.
    askSignIn();
    paint();
    return;
  }
  if (name === 'menubar-home') {
    if (ui.connecting || !ui.loginUser) return;
    if (ui.ready) { showStartPage(true); return; }
    if (ui.opened) { showStartPage(false); return; }
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
  if (name === 'connect-local') { if (ui.loginUser) connectLocal(); return; }
  if (name === 'import-local') { importLocal().catch((error) => { ui.startError = message(error); ui.connecting = false; paint(); }); return; }
  if (name === 'open-guide' || name === 'help-doc') { presentDocument(el.dataset.id || 'guide'); return; }
  if (name === 'close-reading') { ui.reading = null; paint(); return; }
  if (name === 'reader-print') { window.print(); return; }
  if (name === 'reader-lang') {
    settings.language = settings.language === 'en' ? 'ko' : 'en';
    setLanguage(settings.language);
    saveSettings();
    setBackendLanguage(settings.language);
    paint();
    return;
  }
  if (name === 'start-tab') {
    if (['guide', 'tutorial', 'wql'].includes(el.dataset.id)) { presentDocument(el.dataset.id); return; }
    ui.startTab = el.dataset.id || 'all';
    paint();
    return;
  }
  if (name === 'start-tutorial') {
    if (ui.connecting) return;
    if (ui.loginUser) {
      ui.modal = null;
      if ((ws.projects || []).length) confirm(L('튜토리얼은 쇼핑몰 예제로 작업 공간을 바꿉니다. 계속할까요?', 'The tutorial replaces the workspace with the shop example. Continue?'), 'start-tutorial');
      else beginTutorial();
      return;
    }
    ui.modal = { kind: 'login', next: 'tutorial' };
    paint();
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
    const parent = (ws.articles || []).find((item) => item.id === el.dataset.id);
    if (!parent) return;
    ui.modal = { kind: 'page-template', spaceId: parent.spaceId, parentId: parent.id, pick: 'blank', group: 'all' };
    paint();
    return;
  }
  if (name === 'template-group' || name === 'template-pick') {
    if (ui.modal?.kind !== 'page-template') return;
    if (name === 'template-group') ui.modal.group = el.dataset.id || 'all';
    else ui.modal.pick = el.dataset.id || 'blank';
    repaintModal();
    return;
  }
  if (name === 'template-use') {
    const modal = ui.modal;
    if (modal?.kind !== 'page-template') return;
    createPageFrom(modal.spaceId, modal.parentId || '', el.dataset.id || modal.pick || 'blank');
    return;
  }
  if (name === 'add-page') {
    // A new top page in a workspace: first pick a template (or a blank page).
    const spaceId = el.dataset.space || ui.spaceId;
    if (!(ws.spaces || []).some((space) => space.id === spaceId)) return;
    ui.modal = { kind: 'page-template', spaceId, parentId: '', pick: 'blank', group: 'all' };
    paint();
    return;
  }
  if (name === 'new-workspace' || name === 'ws-create-start') {
    ui.wsCreating = true;
    if (settings.navFolded?.spaces) { settings.navFolded = { ...settings.navFolded, spaces: false }; saveSettings(); }
    if (settings.showLeftPanel === false) { settings.showLeftPanel = true; saveSettings(); }
    paint();
    document.querySelector('#nav-ws-name')?.focus();
    return;
  }
  if (name === 'ws-create-cancel') { ui.wsCreating = false; ui.wsDraft = ''; paint(); return; }
  if (name === 'create-workspace') {
    const typed = (document.querySelector('#nav-ws-name')?.value ?? ui.wsDraft ?? '').trim();
    if (!typed) { toast(message(new Error('name-required'))); document.querySelector('#nav-ws-name')?.focus(); return; }
    document.activeElement?.blur?.();
    mutate(() => {
      const space = addSpace(ws, { name: typed }, actor());
      ui.wsCreating = false;
      ui.wsDraft = '';
      ui.spaceId = space.id;
      ui.articleId = '';
      ui.wikiEdit = false;
      ui.wsOpen = { ...(ui.wsOpen || {}), [space.id]: true };
      ui.view = 'knowledge';
    });
    return;
  }
  if (name === 'toggle-nav-section') {
    // A section of the left navigation folds open or shut; the choice is kept for the next start.
    const id = el.dataset.id;
    const key = el.dataset.scope === 'side' ? 'sideFolded' : 'navFolded';
    settings[key] = { ...(settings[key] || {}), [id]: !settings[key]?.[id] };
    saveSettings();
    paint();
    return;
  }
  if (name === 'edit-workspace') { ui.spaceId = el.dataset.id; ui.articleId = ''; ui.view = 'knowledge'; if (settings.showRightPanel === false) { settings.showRightPanel = true; saveSettings(); } paint(); document.querySelector('#right [data-space-field="name"]')?.focus(); return; }
  if (name === 'delete-workspace') {
    const space = (ws.spaces || []).find((item) => item.id === el.dataset.id);
    if (!space) return;
    ui.context = null;
    const count = (ws.articles || []).filter((page) => page.spaceId === space.id).length;
    const pages = count ? L(` 안의 페이지 ${count}개(휴지통 포함)도 함께 지워지며 되돌릴 수 없습니다.`, ` Its ${count} pages (the trash too) go with it, for good.`) : '';
    confirm(L(`작업 공간 '${space.name}'을(를) 지울까요?${pages}`, `Delete the workspace '${space.name}'?${pages}`), 'delete-workspace', space.id, { ko: '작업 공간 삭제', en: 'Delete the workspace', glyph: 'trash', danger: true });
    return;
  }
  if (name === 'open-workspace') {
    ui.spaceId = el.dataset.id;
    ui.articleId = '';
    ui.shareToken = '';
    ui.wikiEdit = false;
    ui.wsOpen = { ...(ui.wsOpen || {}), [el.dataset.id]: true };
    ui.view = 'knowledge';
    paint();
    return;
  }
  if (name === 'toggle-workspace') {
    const space = (ws.spaces || []).find((item) => item.id === el.dataset.id);
    if (!space) return;
    const marks = ui.wsOpen || {};
    const now = marks[space.id] ?? space.id === ui.spaceId;
    ui.wsOpen = { ...marks, [space.id]: !now };
    paint();
    return;
  }
  if (name === 'toggle-page') {
    const folds = ui.pageFold || {};
    ui.pageFold = { ...folds, [el.dataset.id]: !folds[el.dataset.id] };
    paint();
    return;
  }
  if (name === 'edit-page-comment') { ui.commentEdit = el.dataset.comment; paint(); document.querySelector('#comment-edit')?.focus(); return; }
  if (name === 'cancel-page-comment') { ui.commentEdit = ''; paint(); return; }
  if (name === 'save-page-comment') {
    mutate(() => { editPageComment(ws, el.dataset.id, el.dataset.comment, document.querySelector('#comment-edit')?.value || '', actor()); ui.commentEdit = ''; });
    return;
  }
  if (name === 'jump') { document.getElementById(el.dataset.target || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (name === 'add-blog' || name === 'add-board' || name === 'add-table') {
    const kind = name === 'add-board' ? 'board' : name === 'add-table' ? 'table' : 'blog';
    const title = kind === 'board' ? L('칠판', 'Board') : kind === 'table' ? L('표', 'Table') : L('새 소식', 'News');
    mutate(() => {
      const page = addPage(ws, { spaceId: el.dataset.space || ui.spaceId, kind, title }, actor());
      ui.spaceId = page.spaceId;
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
    if (el.dataset.space) ui.spaceId = el.dataset.space;
    ui.articleId = el.dataset.id;
    // The pages above the one opened unfold in the left tree so it can be seen there.
    const folds = { ...(ui.pageFold || {}) };
    const seen = new Set();
    let up = (ws.articles || []).find((item) => item.id === el.dataset.id);
    while (up?.parentId && !seen.has(up.parentId)) { seen.add(up.parentId); folds[up.parentId] = false; up = (ws.articles || []).find((item) => item.id === up.parentId); }
    ui.pageFold = folds;
    if (up?.spaceId) ui.wsOpen = { ...(ui.wsOpen || {}), [up.spaceId]: true };
    ui.view = 'knowledge';
    ui.pageView = 'edit';
    ui.pageDraft = null;
    ui.pageSource = false;
    if (ui.pageCompare?.pageId !== el.dataset.id) ui.pageCompare = null;
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    ui.wikiEdit = Boolean(page && canEditPage(page, actor()));
    if (page) {
      page.views = (page.views || 0) + 1;
      if (ui.wikiEdit) markEditing(ws, page.id, actor(), true);
      scheduleSave();
    }
    paint();
    return;
  }
  if (name === 'wiki-edit') {
    ui.wikiEdit = el.dataset.on !== '0';
    if (el.dataset.id) ui.articleId = el.dataset.id;
    ui.pageDraft = null;
    ui.pageSource = false;
    const page = (ws.articles || []).find((item) => item.id === ui.articleId);
    if (page) markEditing(ws, page.id, actor(), ui.wikiEdit);
    scheduleSave();
    paint();
    return;
  }
  if (name === 'close-page') {
    // Close: what was written is saved, then the workspace's home shows.
    if (!ui.pageDirty) ui.pageDirty = el.dataset.id;
    flushPageSave();
    ui.articleId = '';
    ui.wikiEdit = false;
    paint();
    return;
  }
  if (name === 'save-page') {
    // Saving keeps the page open for writing; the tree, the title and the panel catch up.
    if (!ui.pageDirty) ui.pageDirty = el.dataset.id;
    if (flushPageSave()) { paint(); setSaveState(L('저장했습니다', 'Saved')); }
    return;
  }
  if (name === 'page-mode') {
    flushPageSave();
    ui.pageView = el.dataset.id === 'read' ? 'read' : 'edit';
    ui.wikiEdit = ui.pageView === 'edit';
    ui.pageDraft = null;
    paint();
    return;
  }
  if (name === 'page-source') {
    // Switch between writing the document and its Markdown source; nothing typed is lost.
    const pageId = document.querySelector('.doc-editor')?.dataset.page || ui.articleId;
    const page = (ws.articles || []).find((item) => item.id === pageId);
    if (!page) return;
    ui.articleId = page.id;
    const markdown = currentPageBody();
    ui.pageSource = !ui.pageSource;
    ui.pageDraft = { id: page.id, title: document.querySelector('#page-title')?.value ?? page.title, markdown, html: renderMarkdown(markdown, page.attachments || []) };
    paint();
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
  if (name === 'export-page' || name === 'export-doc') {
    const writing = name === 'export-doc'
      ? (ws.documents || []).find((item) => item.id === el.dataset.id)
      : (ws.articles || []).find((item) => item.id === el.dataset.id);
    if (!writing) return;
    const title = document.querySelector(name === 'export-doc' ? '#doc-title' : '#page-title')?.value || writing.title;
    const typed = document.querySelector(name === 'export-doc' ? '#doc-body' : '#page-body')?.value;
    const english = getLanguage() === 'en';
    const me = ws.users.find((user) => user.id === actor());
    const pageProject = name === 'export-doc' ? '' : ((ws.spaces || []).find((space) => space.id === writing.spaceId)?.projectId || '');
    const body = issueMacrosToMarkdown(ws, typed != null ? typed : (name === 'export-doc' ? writing.body : expandPage(ws, writing)), me, pageProject, english);
    exportWriting(title, body, writing.attachments || [], el.dataset.format || 'html');
    return;
  }
  if (name === 'pick-page-file' || name === 'pick-doc-file') {
    ui.pageAttach = el.dataset.id;
    ui.attachTarget = name === 'pick-doc-file' ? 'doc' : 'page';
    ui.attachKind = el.dataset.kind || 'file';
    ui.attachEmbed = el.dataset.embed !== '0';
    const input = document.querySelector('#file-attach');
    input.accept = ui.attachKind === 'image' ? 'image/*' : '';
    // The page's file list takes several files at once; the editor's buttons put one into the text.
    input.multiple = ui.attachTarget === 'page' && !ui.attachEmbed;
    input.click();
    return;
  }
  if (name === 'download-file') { downloadStored(el.dataset.file, el.dataset.name, el.dataset.src); return; }
  if (name === 'remove-page-file') { mutate(() => removePageFile(ws, el.dataset.id, el.dataset.file, actor())); return; }
  if (name === 'remove-doc-file') { mutate(() => removeDocumentFile(ws, el.dataset.id, el.dataset.file, actor())); return; }
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
  if (name === 'doc-tab') { ui.docTab = el.dataset.id || 'forms'; ui.docId = ''; ui.view = 'documents'; paint(); return; }
  if (name === 'use-form') {
    mutate(() => {
      const doc = createDocument(ws, { templateId: el.dataset.id, projectId: project()?.id || '', lang: getLanguage() }, actor());
      ui.docTab = 'mine';
      openDocTab(doc.id);
    });
    return;
  }
  if (name === 'open-doc') { openDocTab(el.dataset.id); paint(); return; }
  if (name === 'close-doc') { closeDocTab(el.dataset.id); paint(); return; }
  // The list: a click chooses (shown on the right), a double-click or Open opens it in a tab.
  if (name === 'select-doc') {
    if (secondClick('doc', el.dataset.id)) { openDocTab(el.dataset.id); paint(); return; }
    ui.docSelected = el.dataset.id;
    paint();
    return;
  }
  if (name === 'save-doc') { document.activeElement?.blur?.(); flushSave().then(() => toast(L('저장했습니다.', 'Saved.'))).catch(fail); return; }
  if (name === 'doc-back') { ui.docSelected = ui.docId || ui.docSelected; ui.docId = ''; paint(); return; }
  if (name === 'print-doc') {
    const keep = ui.docId;
    ui.docId = el.dataset.id;
    printCurrent();
    ui.docId = keep;
    return;
  }
  if (name === 'doc-step') {
    // < > beside the tabs: the previous or next open document, round the row.
    const tabs = (ui.docTabs || []).filter((id) => (ws.documents || []).some((doc) => doc.id === id));
    if (!tabs.length) return;
    const at = Math.max(0, tabs.indexOf(ui.docId));
    ui.docId = tabs[(at + Number(el.dataset.step || 1) + tabs.length) % tabs.length];
    paint();
    document.querySelector('.doc-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }
  if (name === 'doc-mode') { ui.docMode = el.dataset.id || 'split'; paint(); return; }
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
    mutate(() => { deleteDocument(ws, el.dataset.id, actor()); closeDocTab(el.dataset.id); });
    return;
  }
  if (name === 'delete-article') {
    const page = (ws.articles || []).find((item) => item.id === el.dataset.id);
    if (!page) return;
    ui.context = null;
    const kids = pageDescendants(ws, page.id).filter((item) => !item.trashed).length;
    const more = kids ? L(` 하위 페이지 ${kids}개도 함께 옮겨집니다.`, ` Its ${kids} child pages go with it.`) : '';
    confirm(L(`'${page.title}' 페이지를 휴지통으로 옮길까요?${more} 작업 공간 속성의 휴지통에서 되돌릴 수 있습니다.`, `Move the page '${page.title}' to the trash?${more} It can be restored from the trash in the workspace properties.`), 'delete-article', page.id, { ko: '휴지통으로', en: 'Move to the trash', glyph: 'trash', danger: true });
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
  if (name === 'open-talk') { openTalk(); return; }
  if (name === 'add-webhook') { mutate(() => addWebhook(ws, { url: document.querySelector('#hook-url')?.value || '', events: document.querySelector('#hook-events')?.value || '' })); return; }
  if (name === 'mail-test') {
    const to = document.querySelector('#mail-test-to')?.value?.trim() || '';
    const typed = document.querySelector('[data-mail="password"]')?.value || '';
    if (!ws.mail) ws.mail = {};
    if (typed) ws.mail.password = typed;
    saveWorkspace(ws).then((saved) => {
      if (saved?.revision) ws.revision = saved.revision;
      if (ws.mail?.password) {
        ws.mail.hasPassword = true;
        ws.mail.password = '';
      }
      return sendTestMail(to);
    }).then(() => toast(L('시험 메일을 보냈습니다.', 'The test message was sent.'))).catch((error) => fail(error));
    return;
  }
  if (name === 'mail-retry') {
    for (const item of ws.mailOutbox || []) if (item.state === 'error') { item.state = 'queued'; item.error = ''; }
    scheduleSave();
    paint();
    return;
  }
  if (name === 'delete-webhook') { mutate(() => deleteWebhook(ws, el.dataset.id)); return; }
  if (name === 'add-token') { mutate(() => addToken(ws, document.querySelector('#token-name')?.value || '')); return; }
  if (name === 'delete-token') { mutate(() => deleteToken(ws, el.dataset.id)); return; }
  if (name === 'start-sso') {
    try { window.open(authorizationUrl(ws.sso, `${dataUrl()}/api/sso/callback`, uid('state')), '_blank'); } catch (error) { fail(error); }
    return;
  }
  if (name === 'set-password') { ui.modal = { kind: 'password' }; paint(); return; }
  if (name === 'test-connection') { testServerForm(); return; }
  if (name === 'go-back') { goBack(); return; }
  if (name === 'audit-select') { ui.auditSelected = ui.auditSelected === el.dataset.id ? '' : el.dataset.id; paint(); return; }
  if (name === 'audit-reset') { ui.audit = { ...(ui.audit || {}), filter: {} }; loadAudit(); return; }
  if (name === 'audit-export') { exportAudit(); return; }
  if (name === 'open-db-setup') { ui.modal = { kind: 'db-setup' }; paint(); return; }
  if (name === 'show-encryption-key') {
    encryptionKey().then((result) => { ui.encryptionKey = result.key || ''; paint(); }).catch((error) => toast(message(error)));
    return;
  }
  if (name === 'hide-encryption-key') { ui.encryptionKey = ''; paint(); return; }
  if (name === 'copy-encryption-key') {
    navigator.clipboard?.writeText(ui.encryptionKey || '').then(() => toast(L('키를 복사했습니다. 안전한 곳에 보관하세요.', 'The key is copied. Keep it somewhere safe.'))).catch(() => toast(L('복사하지 못했습니다. 키를 직접 선택해 복사하세요.', 'Could not copy. Select the key and copy it.')));
    return;
  }
  if (name === 'refresh-signin-locks') { refreshSignInLocks(); return; }
  if (name === 'release-signin-lock') { refreshSignInLocks(el.dataset.account || ''); return; }
  if (name === 'import-csv') { if (ensureProject()) { ui.modal = { kind: 'csv' }; paint(); } return; }
  if (name === 'open-current-project') {
    if (!ui.ready) return;
    ui.issueId = null;
    ui.view = project() ? 'board' : 'home';
    paint();
    return;
  }
  if (name === 'go') {
    // Settings open in a window of their own (in that window the page itself is the settings).
    if (el.dataset.view === 'settings' && !windowMode) { openTool('settings'); return; }
    ui.view = el.dataset.view || 'home';
    if (!ui.ready && ui.view === 'settings') { ui.returnView = 'settings'; connectLocal(); return; }
    if (ui.view === 'settings') refreshSchema();
    paint();
    return;
  }
  if (name === 'schema-check') { refreshSchema(true); return; }
  if (name === 'schema-upgrade') { runSchemaUpgrade(); return; }
  if (name === 'schema-sql') { openSchemaSql(el.dataset.engine || document.querySelector('#server-form [name="engine"]')?.value || ui.schema?.engine || 'sqlite'); return; }
  if (name === 'schema-copy') {
    const text = document.querySelector('#schema-sql-text')?.value || '';
    navigator.clipboard?.writeText(text).then(() => toast(L('SQL을 복사했습니다.', 'The SQL is copied.'))).catch(() => toast(L('복사하지 못했습니다.', 'Could not copy.')));
    return;
  }
  if (name === 'activate') { ws.activeProjectId = el.dataset.id; ui.issueId = null; ui.selected = []; ui.boardId = null; ui.view = 'board'; scheduleSave(); paint(); return; }
  if (name === 'open-issue') { ui.issueId = el.dataset.id; ui.view = 'issue'; ui.issueTab = 'details'; ui.modal = null; paint(); return; }
  if (name === 'select-issue') {
    if (secondClick('issue', el.dataset.id)) { onAction({ dataset: { action: 'open-issue', id: el.dataset.id } }); return; }
    ui.issueId = el.dataset.id;
    paint();
    return;
  }
  // Save and Close of an opened issue (a card): the changes are saved, Close returns to where it was opened from.
  if (name === 'save-issue') { flushSave().then(() => toast(L('저장했습니다.', 'Saved.'))).catch(fail); return; }
  if (name === 'close-issue') { flushSave().catch(() => {}); goBack(); return; }
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
  if (name === 'modal-cancel') {
    if (!ui.loginUser && !ui.ready && ui.modal?.kind !== 'login') { ui.modal = { kind: 'login', next: 'gate' }; paint(); return; }
    ui.modal = null;
    paint();
    return;
  }
  if (name === 'confirm-yes') { runConfirmed(); return; }
  if (name === 'open-login') { ui.startError = ''; clearLoginMessage(); ui.modal = { kind: 'login', next: 'gate' }; paint(); document.querySelector('#dialog-account')?.focus(); return; }
  if (name === 'new-project') { ui.modal = { kind: 'project', parentId: el.dataset.parent || '', teamId: el.dataset.team || '' }; paint(); return; }
  if (name === 'new-team') { ui.modal = { kind: 'team' }; paint(); return; }
  if (name === 'open-team') { ui.teamId = el.dataset.id || ''; ui.view = 'team'; ui.modal = null; paint(); return; }
  if (name === 'open-team-pages') {
    const team = (ws.teams || []).find((item) => item.id === el.dataset.id);
    if (!team) return;
    const space = teamSpace(ws, team);
    ui.spaceId = space.id;
    ui.articleId = '';
    ui.wikiEdit = false;
    ui.view = 'knowledge';
    paint();
    return;
  }
  if (name === 'add-team-page') {
    const team = (ws.teams || []).find((item) => item.id === el.dataset.id);
    const title = document.querySelector('#team-page-title')?.value.trim() || '';
    if (!team || !title) { toast(message(new Error('name-required'))); return; }
    mutate(() => {
      const page = addPage(ws, { spaceId: teamSpace(ws, team).id, title }, actor());
      ui.spaceId = page.spaceId;
      ui.articleId = page.id;
      ui.wikiEdit = true;
      ui.view = 'knowledge';
    });
    return;
  }
  if (name === 'add-team-member') {
    const userId = document.querySelector('#team-add-user')?.value || '';
    if (userId) mutate(() => setTeamMember(ws, el.dataset.team, userId, 'member', actor()));
    return;
  }
  if (name === 'remove-team-member') { mutate(() => setTeamMember(ws, el.dataset.team, el.dataset.id, '', actor())); return; }
  if (name === 'delete-team') {
    const team = (ws.teams || []).find((item) => item.id === el.dataset.id);
    if (!team) return;
    confirm(L(`팀 "${team.name}"을(를) 삭제할까요? 팀 페이지는 회사 공용 공간으로 옮겨집니다.`, `Delete the team "${team.name}"? Its pages move to the company space.`), 'delete-team', team.id, { glyph: 'trash', ko: '삭제', en: 'Delete', danger: true });
    return;
  }
  if (name === 'open-project-settings') {
    const target = (ws.projects || []).find((item) => item.id === (el.dataset.id || current?.id));
    if (!target || !allowed(ws, target, actor(), 'admin')) {
      toast(L('권한이 없습니다.', 'You do not have permission.'));
      return;
    }
    ws.activeProjectId = target.id;
    ui.issueId = null;
    ui.view = 'project-settings';
    scheduleSave();
    paint();
    return;
  }
  if (name === 'project-participants') {
    const target = (ws.projects || []).find((item) => item.id === el.dataset.id);
    if (!target || !allowed(ws, target, actor(), 'admin')) {
      toast(L('권한이 없습니다.', 'You do not have permission.'));
      return;
    }
    ui.modal = { kind: 'participants', projectId: target.id, query: '' };
    paint();
    return;
  }
  if (name === 'add-participant' || name === 'remove-participant') {
    const target = ui.modal?.kind === 'participants' ? (ws.projects || []).find((item) => item.id === ui.modal.projectId) : null;
    if (!target || !el.dataset.id || el.dataset.id === target.leadId) return;
    const access = name === 'remove-participant' ? '' : (['view', 'edit', 'lead'].includes(el.dataset.access) ? el.dataset.access : 'view');
    mutate(() => setProjectAccess(ws, target.id, el.dataset.id, access, actor()));
    return;
  }
  if (name === 'new-issue') { if (ensureProject()) { ui.modal = { kind: 'issue', typeId: 'story' }; paint(); } return; }
  if (name === 'create-subtask') { if (ui.issueId) { ui.modal = { kind: 'issue', typeId: 'subtask', parentId: ui.issueId }; paint(); } return; }
  if (name === 'new-sprint') { if (ensureProject()) { ui.modal = { kind: 'sprint' }; paint(); } return; }
  if (name === 'new-status') { ui.modal = { kind: 'status' }; paint(); return; }
  if (name === 'new-transition') { ui.modal = { kind: 'transition' }; paint(); return; }
  if (name === 'new-field') { ui.modal = { kind: 'field' }; paint(); return; }
  if (name === 'new-rule') { ui.modal = { kind: 'rule' }; paint(); return; }
  if (name === 'new-user') { ui.profilePhoto = ''; ui.modal = { kind: 'user' }; paint(); return; }
  if (name === 'change-password') { ui.modal = { kind: 'change-password', forced: false }; paint(); return; }
  if (name === 'edit-profile') {
    const user = ws.users.find((item) => item.id === el.dataset.id);
    if (!user) return;
    ui.profilePhoto = user.photo || '';
    ui.modal = { kind: 'profile', userId: user.id };
    paint();
    return;
  }
  if (name === 'new-component') { ui.modal = { kind: 'component' }; paint(); return; }
  if (name === 'new-version') { ui.modal = { kind: 'version' }; paint(); return; }
  if (name === 'new-group') { ui.modal = { kind: 'group' }; paint(); return; }
  if (name === 'save-filter') { if (ensureProject()) { ui.modal = { kind: 'filter' }; paint(); } return; }
  if (name === 'open-file') { confirm(L('현재 작업 공간을 파일 내용으로 바꿀까요?', 'Replace the workspace with the file?'), 'open-file'); return; }
  if (name === 'load-sample') { confirm(L('예제 작업 공간으로 바꿀까요?', 'Replace the workspace with the example?'), 'load-sample'); return; }
  if (name === 'empty-workspace') { confirm(L('빈 작업 공간으로 바꿀까요?', 'Replace the workspace with an empty one?'), 'empty'); return; }
  if (name === 'save-file') {
    // Ctrl+S on a page being written saves the page.
    if (document.querySelector('#page-doc, #page-body:not([hidden])') && ui.view === 'knowledge') { const button = document.querySelector('[data-action="save-page"]'); if (button) onAction(button); return; }
    saveFile(false);
    return;
  }
  if (name === 'save-as') { saveFile(true); return; }
  if (name === 'export-md') { exportText('md'); return; }
  if (name === 'export-csv') { exportText('csv'); return; }
  if (name === 'export-project') { exportText('project'); return; }
  if (name === 'print') { printCurrent(); return; }
  if (name === 'undo') { if (undo.length) { redo.push(structuredClone(ws)); ws = undo.pop(); if (ui.path) ui.dirty = true; scheduleSave(); paint(); } return; }
  if (name === 'redo') { if (redo.length) { undo.push(structuredClone(ws)); ws = redo.pop(); if (ui.path) ui.dirty = true; scheduleSave(); paint(); } return; }
  if (name === 'start-menu') {
    // The start page's drop-down menus open under their button.
    const box = el.getBoundingClientRect?.();
    ui.context = { kind: el.dataset.id, x: box ? box.left : 40, y: box ? box.bottom + 4 : 40 };
    paint();
    return;
  }
  if (name === 'start-setting') {
    const key = el.dataset.id;
    if (!['startShowProjects', 'startShowExamples', 'startShowBackground', 'showWelcome', 'showStartPage'].includes(key)) return;
    settings[key] = settings[key] === false;
    saveSettings();
    ui.context = null;
    paint();
    return;
  }
  if (name === 'start-arrange') { startCards?.arrange?.(); return; }
  if (name === 'show-welcome') { ui.context = null; ui.modal = { kind: 'welcome' }; paint(); return; }
  if (name === 'about') { openTool('about'); return; }
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
  if (name === 'open-search') { openSearch(document.querySelector('#quick-search')?.value || ui.searchText || ''); return; }
  if (name === 'search-tab') { ui.searchTab = el.dataset.id || 'all'; paint(); document.querySelector('#view')?.scrollTo?.(0, 0); return; }
  if (name === 'open-hit') { openHit(el.dataset); return; }
  if (name === 'focus-search') {
    const box = document.querySelector(ui.view === 'issues' ? '#issue-query' : '#quick-search');
    box?.focus();
    box?.select?.();
    return;
  }
  if (name === 'command-palette') { if (ensureProject()) { ui.modal = { kind: 'palette', query: '' }; paint(); } return; }
  if (name === 'help-doc') { ui.help = el.dataset.id || 'guide'; ui.view = 'help'; paint(); return; }
  if (name === 'open-recent') { readTextFile(el.dataset.path).then((text) => ingest(text, el.dataset.path)).catch(fail); return; }
  // These work with or without an open project.
  if (name === 'mark-all-read') { if (current) markAllRead(current, actor()); markInboxRead(ws, actor()); scheduleSave(); paint(); return; }
  if (name === 'resolve-page-comment') {
    mutate(() => { resolvePageComment(ws, el.dataset.id, el.dataset.comment, el.dataset.on === '1', actor()); if (el.dataset.on === '1' && ui.inlineActive === el.dataset.comment) ui.inlineActive = ''; });
    return;
  }
  if (name === 'jump-inline') {
    ui.inlineActive = el.dataset.comment;
    paint();
    document.querySelector(`.inline-mark[data-comment="${CSS.escape(el.dataset.comment)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  if (name === 'reply-page-comment') { ui.replyTo = el.dataset.comment; paint(); document.querySelector('#reply-text')?.focus(); return; }
  if (name === 'cancel-reply') { ui.replyTo = ''; paint(); return; }
  if (name === 'send-reply') {
    const text = document.querySelector('#reply-text')?.value || '';
    mutate(() => { commentPage(ws, el.dataset.id, text, actor(), '', { replyTo: el.dataset.comment }); ui.replyTo = ''; });
    return;
  }
  if (name === 'timeline-scale') { ui.timelineScale = el.dataset.id || 'week'; paint(); scrollTimelineToToday(); return; }
  if (name === 'timeline-today') { scrollTimelineToToday(); return; }
  if (name === 'timeline-all') { ui.timelineAll = ui.timelineAll === false; paint(); return; }
  if (name === 'compare-page') {
    ui.pageCompare = { pageId: el.dataset.id, from: el.dataset.from, to: el.dataset.to || 'current' };
    ui.versionsOpen = true;
    paint();
    document.querySelector('.version-compare')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  if (name === 'compare-close') { ui.pageCompare = null; paint(); return; }
  if (name === 'insert-mention') {
    // Types "@" where the caret is in the page being written, which brings up the list of people.
    const doc = document.querySelector('#page-doc');
    if (!doc || doc.hidden) return;
    doc.focus();
    document.execCommand('insertText', false, '@');
    doc.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (name === 'open-inbox') {
    // A company inbox notice: mark it read and open its page (at the comments for a comment).
    const item = (ws.inbox || []).find((entry) => entry.id === el.dataset.id && entry.userId === actor());
    if (!item) return;
    markInboxRead(ws, actor(), item.id);
    scheduleSave();
    if (item.pageId && (ws.articles || []).some((page) => page.id === item.pageId && !page.trashed)) {
      const open = document.createElement('button');
      open.dataset.action = 'open-article';
      open.dataset.id = item.pageId;
      if (item.spaceId) open.dataset.space = item.spaceId;
      onAction(open);
      if (item.kind === 'page-comment' || item.where === 'comment') requestAnimationFrame(() => document.getElementById('page-comments')?.scrollIntoView({ block: 'start' }));
      return;
    }
    paint();
    return;
  }
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
  if (name === 'delete-project') {
    const target = (ws.projects || []).find((item) => item.id === el.dataset.id);
    if (!target) return;
    if (!canDeleteProject(ws, target, actor())) { toast(L('과제는 관리자만 삭제할 수 있습니다.', 'Only an administrator may delete a project.')); return; }
    if ((ws.projects || []).some((item) => item.parentId === target.id)) { toast(message(new Error('project-has-children'))); return; }
    const issues = (target.issues || []).length;
    confirm(L(`과제 "${target.name}" (${target.key})를 삭제할까요? 이슈 ${issues}개와 이 과제의 문서, 페이지, 승인도 함께 지워집니다.`, `Delete the project "${target.name}" (${target.key})? Its ${issues} issues, documents, pages and approvals go with it.`), 'delete-project', target.id, { glyph: 'trash', ko: '삭제', en: 'Delete', danger: true });
    return;
  }
  if (name === 'archive-project') { mutate(() => setArchived(ws, el.dataset.id, el.dataset.on !== '0', actor())); return; }
  if (name === 'archive') { mutate(() => setArchived(ws, current.id, true, actor())); return; }
  if (name === 'unarchive') { mutate(() => setArchived(ws, current.id, false, actor())); return; }
  if (name === 'mark-read') { markRead(current, el.dataset.id, actor()); if (el.dataset.issue) { ui.issueId = el.dataset.issue; ui.view = 'issue'; } scheduleSave(); paint(); return; }
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

/** Settings → Sign-in lock: a listed wait, or a custom number of minutes, hours or days. */
function changeLockWait(el) {
  if (!isWorkspaceAdmin((ws.users || []).find((user) => user.id === actor()))) return;
  const setMinutes = (wanted) => {
    const minutes = clampLockMinutes(wanted);
    if (wanted < LOCK_MIN_MINUTES) toast(L(`${formatLockMinutes(LOCK_MIN_MINUTES, 'ko')}보다 짧게 정할 수 없어 ${formatLockMinutes(LOCK_MIN_MINUTES, 'ko')}으로 정했습니다.`, `A wait cannot be shorter than ${formatLockMinutes(LOCK_MIN_MINUTES, 'en')}; it is set to ${formatLockMinutes(LOCK_MIN_MINUTES, 'en')}.`));
    else if (wanted > LOCK_MAX_MINUTES) toast(L(`가장 긴 시간은 ${formatLockMinutes(LOCK_MAX_MINUTES, 'ko')}입니다.`, `The longest wait is ${formatLockMinutes(LOCK_MAX_MINUTES, 'en')}.`));
    ws.security = { ...(ws.security || {}), lockMinutes: minutes };
    scheduleSave();
  };
  if (el.dataset.lock === 'choice') {
    if (el.value === 'custom') { ui.lockCustom = true; paint(); return; }
    ui.lockCustom = false;
    ui.lockUnit = '';
    setMinutes(Number(el.value));
    paint();
    return;
  }
  const card = el.closest('.signin-lock-card');
  const unit = card?.querySelector('[data-lock="unit"]')?.value || 'minute';
  const amount = Number(card?.querySelector('[data-lock="amount"]')?.value);
  ui.lockCustom = true;
  ui.lockUnit = unit;
  if (!Number.isFinite(amount) || amount <= 0) { paint(); return; }
  setMinutes(Math.round(amount * ({ minute: 1, hour: 60, day: 1440 }[unit] || 1)));
  paint();
}

async function refreshSignInLocks(account = '') {
  try {
    const result = account ? await releaseSignInLock(account) : await signInLocks();
    ui.signinLocks = result.locked || [];
    if (account) toast(L(`${account} 계정의 잠금을 풀었습니다.`, `${account} can sign in again.`));
  } catch (error) {
    toast(message(error));
  }
  paint();
}

function onChange(event) {
  const el = event.target;
  if (el.matches('[data-profile-photo]')) {
    const file = el.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 360_000) {
      toast(message(new Error(file.type.startsWith('image/') ? 'attachment-big' : 'photo-invalid')));
      el.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      ui.profilePhoto = String(reader.result || '');
      const preview = el.parentElement?.querySelector('.profile-preview') || document.createElement('img');
      preview.className = 'profile-preview';
      preview.alt = '';
      preview.src = ui.profilePhoto;
      if (!preview.parentElement) el.after(preview);
    };
    reader.readAsDataURL(file);
    return;
  }
  if (el.dataset.reveal === 'password') {
    const input = el.closest('form')?.querySelector('[name="password"]');
    if (input) input.type = el.checked ? 'text' : 'password';
    return;
  }
  if (!ui.loginUser) {
    // Signed out, only the database form of a first setup takes input.
    if (ui.status?.setup && el.closest('#server-form')) return;
    ui.modal = { kind: 'login', next: 'gate' }; paint(); return;
  }
  if (el.dataset.facet) {
    ui.screenFind = ui.screenFind || {};
    ui.screenFind[ui.view] = { ...(ui.screenFind[ui.view] || {}), [el.dataset.facet]: el.value };
    paint();
    return;
  }
  if (el.dataset.setting && ['showStartPage', 'showWelcome', 'startShowProjects', 'startShowExamples', 'startShowBackground'].includes(el.dataset.setting)) {
    settings[el.dataset.setting] = el.checked;
    saveSettings();
    if (el.dataset.setting !== 'showStartPage') paint();
    return;
  }
  if (el.dataset.setting === 'launchAtStartup' || el.dataset.setting === 'autoLogin') {
    settings[el.dataset.setting] = el.checked;
    saveSettings();
    if (el.dataset.setting === 'launchAtStartup') {
      setLaunchAtStartup(el.checked).catch((error) => toast(message(error)));
    }
    if (el.dataset.setting === 'autoLogin' && !el.checked) clearSavedLogin();
    if (el.dataset.setting === 'autoLogin' && el.checked) storeAutoLogin();
    return;
  }
  if (el.dataset.autologin) {
    storeAutoLogin();
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
  if (el.dataset.teamMember && el.dataset.team) { mutate(() => setTeamMember(ws, el.dataset.team, el.dataset.teamMember, el.value === 'lead' ? 'lead' : 'member', actor())); return; }
  if (el.dataset.teamField && el.dataset.team) { mutate(() => updateTeam(ws, el.dataset.team, { [el.dataset.teamField]: el.value }, actor())); return; }
  if (el.dataset.projectTeam) { mutate(() => moveProjectToTeam(ws, el.dataset.projectTeam, el.value, actor())); return; }
  if (el.dataset.methodProject) { mutate(() => setProjectMethod(ws, el.dataset.methodProject, el.value, el.checked, actor())); return; }
  if (el.matches('[data-project-type]')) {
    // A new project's type suggests its methods; the person can still change them.
    const suggested = new Set(DEFAULT_METHODS[el.value] || []);
    for (const box of el.form?.querySelectorAll('input[name="methods"]') || []) {
      box.checked = suggested.has(box.value);
      box.closest('.method-option')?.classList.toggle('on', box.checked);
    }
    return;
  }
  if (el.name === 'methods' && el.closest('.method-option')) { el.closest('.method-option').classList.toggle('on', el.checked); return; }
  if (el.dataset.spaceField) {
    // A workspace's name, description or audience, changed in the right panel.
    const admin = isWorkspaceAdmin(ws.users.find((user) => user.id === actor()));
    mutate(() => updateSpace(ws, el.dataset.id, { [el.dataset.spaceField]: el.value }, actor(), admin));
    return;
  }
  if ((el.dataset.choose === 'compare-from' || el.dataset.choose === 'compare-to') && ui.pageCompare) { ui.pageCompare = { ...ui.pageCompare, [el.dataset.choose === 'compare-from' ? 'from' : 'to']: el.value }; paint(); return; }
  if (el.dataset.choose === 'space') { ui.spaceId = el.value; ui.articleId = ''; ui.wikiEdit = false; paint(); return; }
  if (el.dataset.choose === 'page-parent') { mutate(() => movePage(ws, el.dataset.id, el.value, actor())); return; }
  if (el.dataset.choose === 'page-status') { mutate(() => setPageStatus(ws, el.dataset.id, el.value, actor())); return; }
  if (el.dataset.choose === 'project') {
    if (el.value) { ws.activeProjectId = el.value; ui.issueId = null; ui.boardId = null; ui.view = ui.view === 'home' ? 'board' : ui.view; scheduleSave(); }
    paint();
    return;
  }
  if (el.dataset.choose === 'user') return;
  if (el.dataset.choose === 'board') { ui.boardId = el.value; paint(); return; }
  if (el.dataset.choose === 'swimlane') { ui.swimlane = el.value; paint(); return; }
  if (el.dataset.module) { ws.modules[el.dataset.module] = el.checked; scheduleSave(); paint(); return; }
  if (el.dataset.mail) {
    if (!ws.mail) ws.mail = {};
    if (el.dataset.mail === 'password') {
      if (!el.value) return;
      ws.mail.password = el.value;
      scheduleSave();
      return;
    }
    if (el.dataset.mail === 'port') ws.mail.port = Number(el.value) || 587;
    else ws.mail[el.dataset.mail] = el.value;
    if (el.dataset.mail === 'security') {
      if (el.value === 'ssl' && Number(ws.mail.port) === 587) ws.mail.port = 465;
      if (el.value === 'starttls' && Number(ws.mail.port) === 465) ws.mail.port = 587;
      paint();
    }
    scheduleSave();
    return;
  }
  if (el.dataset.lock) { changeLockWait(el); return; }
  if (el.dataset.sso) { ws.sso[el.dataset.sso] = el.value; scheduleSave(); return; }
  if (el.dataset.screen && current) {
    if (!allowed(ws, current, actor(), 'admin')) return;
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
  if (el.dataset.notice && el.dataset.id && el.dataset.event) {
    const scope = el.dataset.notice;
    const targetId = el.dataset.id;
    const boxes = [...document.querySelectorAll('[data-notice]')].filter((box) => box.dataset.notice === scope && box.dataset.id === targetId);
    const events = {};
    for (const box of boxes) events[box.dataset.event] = box.checked;
    mutate(() => setNotice(ws, actor(), scope, targetId, events));
    return;
  }
  if (el.dataset.project && current) {
    const key = el.dataset.project;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    mutate(() => updateProject(ws, current.id, { [key]: value }, actor()));
    return;
  }
  if (el.dataset.member && current) { mutate(() => setMember(ws, current.id, el.dataset.member, el.value, actor())); return; }
  if (el.dataset.participant && ui.modal?.kind === 'participants') {
    const target = (ws.projects || []).find((item) => item.id === ui.modal.projectId);
    if (!target || el.dataset.participant === target.leadId) return;
    mutate(() => setProjectAccess(ws, target.id, el.dataset.participant, ['view', 'edit', 'lead'].includes(el.value) ? el.value : 'view', actor()));
    return;
  }
  if (el.dataset.userActive) { mutate(() => setUserActive(ws, el.dataset.userActive, el.checked)); return; }
  if (el.dataset.userAdmin) {
    // Administrator rights: the data service logs the change with who made it.
    const ok = mutate(() => setAdmin(ws, el.dataset.userAdmin, el.checked, actor()));
    if (ok !== false) {
      const user = ws.users.find((item) => item.id === el.dataset.userAdmin);
      toast(el.checked ? L(`${user?.login || ''}에게 관리자 권한을 줬습니다.`, `${user?.login || ''} is now an administrator.`) : L(`${user?.login || ''}의 관리자 권한을 뺐습니다.`, `${user?.login || ''} is no longer an administrator.`));
    }
    return;
  }
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
  if (event.target?.id === 'nav-ws-name') { ui.wsDraft = event.target.value; return; }
  const el = event.target;
  // The background speed works on the start page before signing in; the rest waits for it.
  if (!ui.loginUser && el.dataset?.bg !== 'speed') return;
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
  if (el.id === 'template-find') { filterTemplates(el.value); return; }
  if (el.id === 'screen-find') {
    ui.screenFind = ui.screenFind || {};
    ui.screenFind[ui.view] = { ...(ui.screenFind[ui.view] || {}), q: el.value };
    paint();
    const box = document.querySelector('#screen-find');
    if (box) {
      box.focus();
      const end = box.value.length;
      box.setSelectionRange?.(end, end);
    }
    return;
  }
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
    if (el.dataset.doc === 'body') {
      clearTimeout(docPreviewTimer);
      docPreviewTimer = setTimeout(() => {
        const preview = document.querySelector('#doc-preview');
        if (preview) preview.innerHTML = renderMarkdown(doc.body || '', doc.attachments || []);
      }, 150);
    }
    if (el.dataset.doc === 'title') {
      const label = document.querySelector('.doc-tab.active .doc-tab-open span');
      if (label) label.textContent = el.value || L('(제목 없음)', '(untitled)');
    }
    return;
  }
  if (el.dataset.participantSearch != null && ui.modal?.kind === 'participants') {
    ui.modal.query = el.value;
    const box = document.querySelector('#participant-results');
    if (box) {
      const probe = document.createElement('div');
      probe.innerHTML = renderModal({ ...context(), ui: { ...ui, modal: ui.modal } });
      const next = probe.querySelector('#participant-results');
      if (next) box.innerHTML = next.innerHTML;
    }
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

/** Opens one search result where it lives: its project, issue, page, document, team or person. */
function openHit(hit) {
  const activate = (projectId) => {
    if (projectId && (ws.projects || []).some((item) => item.id === projectId)) { ws.activeProjectId = projectId; ui.boardId = null; ui.selected = []; scheduleSave(); }
  };
  ui.modal = null;
  if (hit.kind === 'projects') { activate(hit.id); ui.issueId = null; ui.view = 'board'; paint(); return; }
  if (hit.kind === 'issues' || hit.on === 'issue') {
    activate(hit.project);
    ui.issueId = hit.kind === 'issues' ? hit.id : hit.issue;
    ui.view = 'issue';
    ui.issueTab = 'details';
    paint();
    return;
  }
  if (hit.kind === 'pages' || hit.on === 'page') {
    const pageId = hit.kind === 'pages' ? hit.id : hit.page;
    const open = document.createElement('button');
    open.dataset.action = 'open-article';
    open.dataset.id = pageId;
    if (hit.space) open.dataset.space = hit.space;
    onAction(open);
    if (hit.kind !== 'pages') requestAnimationFrame(() => document.getElementById(hit.on === 'page' && hit.kind === 'comments' ? 'page-comments' : 'page-files')?.scrollIntoView({ block: 'start' }));
    return;
  }
  if (hit.kind === 'documents' || hit.on === 'document') {
    activate(hit.project);
    ui.docTab = hit.mine ? 'mine' : 'shared';
    openDocTab(hit.kind === 'documents' ? hit.id : hit.doc);
    paint();
    return;
  }
  if (hit.kind === 'teams') { ui.teamId = hit.id; ui.view = 'team'; paint(); return; }
  if (hit.kind === 'spaces') {
    const open = document.createElement('button');
    open.dataset.action = 'open-workspace';
    open.dataset.id = hit.id;
    onAction(open);
    return;
  }
  if (hit.kind === 'people') {
    const user = ws.users.find((item) => item.id === hit.id);
    if (!user) return;
    ui.profilePhoto = user.photo || '';
    ui.modal = { kind: 'profile', userId: user.id };
    paint();
  }
}

function looksLikeWql(text) {
  const raw = String(text || '').trim();
  return /[=<>~]/.test(raw) || /\b(and|or|not|in|is|order)\b/i.test(raw);
}

/** The search screen with these words searched (empty: just the screen, ready for typing). */
function openSearch(text) {
  ui.searchText = String(text || '').trim();
  ui.quick = ui.searchText;
  if (!ui.searchText) ui.searchTab = 'all';
  ui.view = 'search';
  ui.modal = null;
  paint();
  const box = document.querySelector('#global-search');
  box?.focus();
  box?.select?.();
}

function searchFrom(text) {
  const raw = text.trim();
  if (!raw) return '';
  if (looksLikeWql(raw)) return raw;
  return `text ~ "${raw.replace(/"/g, '')}"`;
}

function mount() {
  const gripLabel = esc(L('끌어서 창 크기 변경', 'Drag to resize the window'));
  document.querySelector('#app').innerHTML = `<header id="menubar"></header><div id="toolbar"></div><div id="workspace"><nav id="left"></nav><div class="splitter panel-split" data-split="left" role="separator" aria-orientation="vertical"></div><main id="view"></main><div class="splitter panel-split" data-split="right" role="separator" aria-orientation="vertical"></div><aside id="right"></aside></div><footer id="statusbar"></footer><div class="resize-grip${isDesktop() ? '' : ' static'}" ${isDesktop() ? `data-resize-grip role="separator" aria-label="${gripLabel}"` : 'aria-hidden="true"'} title="${gripLabel}">${gripIcon()}</div><div id="coach" hidden></div><div id="context" class="menu-pop" hidden></div><div id="modal" hidden></div><div id="toast" hidden role="status"></div><input id="file-open" type="file" accept=".mwf,.json,application/json" hidden><input id="file-attach" type="file" hidden>`;
  bindPanelSplitters();
  bindMentions(() => ws.users || []);
  bindTimeline();
  bindInline({
    send: (pageId, quote, text) => { mutate(() => { const comment = commentPage(ws, pageId, text, actor(), quote, { inline: true }); ui.inlineActive = comment.id; }); },
    focus: (commentId) => { ui.inlineActive = commentId; paint(); document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
  });
  document.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeWindow().catch(() => {});
  });
  document.body.addEventListener('contextmenu', (event) => {
    if (!ui.ready || event.target.closest('input, textarea, select, #modal')) return;
    const stored = event.target.closest('[data-file], img.md-image, a.file-link');
    if (stored && !event.target.closest('button')) {
      event.preventDefault();
      ui.context = {
        kind: 'file',
        id: stored.dataset.file || '',
        name: stored.dataset.name || stored.getAttribute('alt') || stored.textContent || 'file',
        src: stored.dataset.file ? '' : (stored.getAttribute('src') || stored.getAttribute('href') || ''),
        x: event.clientX,
        y: event.clientY,
      };
      ui.menu = null;
      ui.popover = null;
      paint();
      return;
    }
    const pageRow = event.target.closest('[data-action="open-article"][data-id]');
    const spaceRow = !pageRow && event.target.closest('[data-action="open-workspace"][data-id]');
    if (pageRow || spaceRow) {
      event.preventDefault();
      ui.context = { kind: pageRow ? 'page' : 'workspace', id: (pageRow || spaceRow).dataset.id, x: event.clientX, y: event.clientY };
      ui.menu = null;
      ui.popover = null;
      paint();
      return;
    }
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
  installTooltips(document.body);
  document.body.addEventListener('mousedown', (event) => {
    const tool = event.target.closest('[data-format]');
    if (!tool || tool.disabled) return;
    event.preventDefault();
    formatPage(tool.dataset.format);
  });
  document.body.addEventListener('keydown', (event) => {
    if (event.target.id === 'nav-ws-name' && event.key === 'Enter') { event.preventDefault(); const button = document.querySelector('[data-action="create-workspace"]'); if (button) onAction(button); return; }
    if (event.target.id === 'nav-ws-name' && event.key === 'Escape') { event.preventDefault(); event.target.blur(); ui.wsCreating = false; ui.wsDraft = ''; paint(); return; }
    if (event.target.id === 'doc-link-url' && event.key === 'Enter') { event.preventDefault(); formatPage('link-apply'); }
    if (event.target.id === 'doc-issue-text' && event.key === 'Enter') { event.preventDefault(); formatPage('issue-apply'); }
    if (event.target.id === 'doc-issue-text' && event.key === 'Escape') { event.stopPropagation(); document.querySelector('.doc-issue-bar')?.setAttribute('hidden', ''); }
    if (event.target.id === 'doc-link-url' && event.key === 'Escape') { event.stopPropagation(); document.querySelector('.doc-link-bar')?.setAttribute('hidden', ''); }
  });
  document.body.addEventListener('input', (event) => {
    if (['page-doc', 'page-title', 'page-labels', 'page-body'].includes(event.target.id) && event.target.closest('.doc-editor')) pageTyped();
    if (event.target.id !== 'page-doc' && !(event.target.id === 'page-title' && ui.wikiEdit)) return;
    const doc = document.querySelector('#page-doc');
    if (!doc || ui.pageSource) return;
    ui.pageDraft = { id: doc.dataset.page, title: document.querySelector('#page-title')?.value, html: doc.innerHTML };
  });
  // A project row or card opens on a double-click, like its Open button (not when the click lands on a control in it).
  document.body.addEventListener('dblclick', (event) => {
    const tpl = event.target.closest?.('#modal .tpl-card');
    if (tpl && ui.modal?.kind === 'page-template') { createPageFrom(ui.modal.spaceId, ui.modal.parentId || '', tpl.dataset.id); return; }
    const docRow = event.target.closest?.('[data-open-doc]');
    if (docRow) { window.getSelection?.()?.removeAllRanges(); openDocTab(docRow.dataset.openDoc); paint(); return; }
    // A card on a scrum or kanban board (or a backlog row) opens its issue on a double-click.
    const card = event.target.closest?.('[data-card]');
    if (card && !event.target.closest('input, select, textarea, a')) {
      window.getSelection?.()?.removeAllRanges();
      const open = document.createElement('button');
      open.dataset.action = 'open-issue';
      open.dataset.id = card.dataset.card;
      onAction(open);
      return;
    }
    const row = event.target.closest?.('[data-open-project]');
    if (!row || event.target.closest('button, a, input, select, textarea, label, [contenteditable="true"]')) return;
    window.getSelection?.()?.removeAllRanges();
    const open = document.createElement('button');
    open.dataset.action = 'activate';
    open.dataset.id = row.dataset.openProject;
    onAction(open);
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
    const stored = event.target.closest('a[data-file], a.file-link, img.md-image');
    if (stored && !event.target.closest('button')) {
      event.preventDefault();
      downloadStored(stored.dataset.file, stored.dataset.name || stored.getAttribute('alt'), stored.getAttribute('href') || stored.getAttribute('src'));
      if (ui.context) { ui.context = null; paint(); }
      return;
    }
    const external = event.target.closest('a[data-external]');
    if (external) {
      event.preventDefault();
      const url = external.dataset.external || '';
      if (!/^https?:\/\//i.test(url)) return;
      ui.pendingUrl = url;
      let host = url;
      try { host = new URL(url).host; } catch { /* keep the address */ }
      confirm(L(`${host} 을 브라우저에서 열까요?`, `Open ${host} in the browser?`), 'open-browser');
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
  // List views (the audit log): sort, column widths and order, kept per list in this computer's settings.
  bindListViews({
    read: (id) => settings.listViews?.[id] || (id === 'audit' ? { sort: { col: 'at', dir: 'desc' } } : {}),
    write: (id, state) => { settings.listViews = { ...(settings.listViews || {}), [id]: state }; saveSettings(); },
    repaint: () => paint(),
  });
  document.body.addEventListener('change', onChange);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('submit', (event) => {
    const server = event.target.closest('#server-form');
    if (server) { event.preventDefault(); connectServer(server); return; }
    const auditForm = event.target.closest('#audit-form');
    if (auditForm) {
      event.preventDefault();
      const data = new FormData(auditForm);
      const filter = {};
      for (const key of ['category', 'action', 'actor', 'from', 'to', 'q']) filter[key] = String(data.get(key) || '').trim();
      ui.audit = { ...(ui.audit || {}), filter };
      ui.auditSelected = '';
      loadAudit();
      return;
    }
    const login = event.target.closest('[data-login]');
    if (login) { event.preventDefault(); onAction({ dataset: { action: 'sign-in' }, form: login }); return; }
    const finder = event.target.closest('[data-search-form]');
    if (finder) {
      event.preventDefault();
      const box = finder.querySelector('#global-search');
      box?.blur();
      openSearch(box?.value ?? '');
      return;
    }
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
  // Cards on the boards and rows in the backlog move with the pointer: a silhouette follows it and a dashed
  // placeholder shows where the card lands (ui/carddrag.js). The data is saved when it is dropped.
  bindCardDrag({
    canStart: () => Boolean(ui.loginUser) && !ui.modal,
    onStart: (id) => { ui.dragId = id; },
    onEnd: () => { ui.dragId = null; },
    onDrop: (zone, ids, dragged) => dropCard(zone, ids, dragged),
  });
  function dropCard(zone, ids, dragged) {
    const statusId = zone.dataset.status || '';
    const sprinting = zone.hasAttribute('data-sprint');
    const sprintId = zone.dataset.sprint || '';
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
  }
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
  // Files dropped on a page's file area join that page's file list.
  document.body.addEventListener('dragover', (event) => {
    const zone = event.target.closest?.('[data-page-drop]');
    if (!zone || ![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault();
    zone.classList.add('over');
  });
  document.body.addEventListener('dragleave', (event) => {
    const zone = event.target.closest?.('[data-page-drop]');
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('over');
  });
  document.body.addEventListener('drop', (event) => {
    const zone = event.target.closest?.('[data-page-drop]');
    const files = [...(event.dataTransfer?.files || [])];
    if (!zone || !files.length) return;
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('over');
    // A box still being typed in holds the repaint back; the files should show at once.
    if (['page-comment', 'comment-edit', 'page-quote'].includes(document.activeElement?.id)) document.activeElement.blur();
    attachPageFiles(zone.dataset.pageDrop, files, false);
  });
  document.querySelector('#file-attach').addEventListener('change', async (event) => {
    const picked = [...(event.target.files || [])];
    const file = picked[0];
    event.target.value = '';
    event.target.multiple = false;
    const current = project();
    if (!file) return;
    if (ui.pageAttach && (ui.attachTarget || 'page') === 'page' && ui.attachEmbed === false) {
      const pageId = ui.pageAttach;
      ui.pageAttach = '';
      ui.attachTarget = '';
      ui.attachKind = '';
      ui.attachEmbed = true;
      attachPageFiles(pageId, picked, false);
      return;
    }
    if (ui.pageAttach) {
      const pageId = ui.pageAttach;
      const target = ui.attachTarget || 'page';
      const kind = ui.attachKind || 'file';
      ui.pageAttach = '';
      ui.attachTarget = '';
      ui.attachKind = '';
      ui.attachEmbed = true;
      if (kind === 'image' && file.type && !/^image\//i.test(file.type)) {
        toast(L('이미지 파일을 고르세요.', 'Choose an image file.'));
        return;
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      mutate(() => {
        if (target === 'doc') {
          const fields = {
            title: document.querySelector('#doc-title')?.value,
            body: document.querySelector('#doc-body')?.value,
            issueKey: document.querySelector('#doc-issue')?.value,
          };
          if (fields.body != null) updateDocument(ws, pageId, fields, actor());
          attachDocument(ws, pageId, { name: file.name, mime: file.type, size: file.size, data }, actor());
          return;
        }
        if (document.querySelector('#page-body')) {
          ui.pageDraft = null;
          updatePage(ws, pageId, {
            title: document.querySelector('#page-title')?.value,
            body: currentPageBody(),
            labels: document.querySelector('#page-labels')?.value,
          }, actor());
        }
        attachPage(ws, pageId, { name: file.name, mime: file.type, size: file.size, data }, actor());
      });
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
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && ['page-comment', 'comment-edit', 'reply-text'].includes(event.target?.id)) {
      const send = document.querySelector({ 'page-comment': '[data-action="comment-page"]', 'comment-edit': '[data-action="save-page-comment"]', 'reply-text': '[data-action="send-reply"]' }[event.target.id]);
      if (send) { event.preventDefault(); onAction(send); return; }
    }
    const hit = takeShortcut(event);
    if (!hit) return;
    if (hit.id !== 'run-search') event.preventDefault();
    if (hit.id === 'wait') return;
    if (ui.modal && hit.id !== 'escape' && hit.id !== 'run-search') return;
    runShortcut(hit, event);
  });
}

const FREE_VIEWS = new Set(['search', 'home', 'help', 'settings', 'users', 'projects', 'extensions', 'people', 'teams', 'team', 'audit']);
const NO_PROJECT_VIEWS = new Set([...FREE_VIEWS, 'notifications', 'knowledge', 'documents', 'calendar', 'plans', 'teams', 'team']);

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
  if (!ui.loginUser && hit.id !== 'escape' && hit.id !== 'run-search') {
    if (!ui.modal) { ui.modal = { kind: 'login', next: 'gate' }; paint(); }
    return;
  }
  if (hit.id === 'escape') {
    if (ui.modal?.forced) return;
    if (!ui.loginUser) {
      // Signed out: Esc closes an open menu or the sign-in window.
      if (ui.menu || ui.context || ui.modal) { ui.menu = null; ui.context = null; ui.modal = null; paint(); }
      return;
    }
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
    // Plain words in the toolbar box search everything; WQL goes to the issue list.
    if (event.target.id === 'quick-search' && !looksLikeWql(event.target.value)) {
      event.target.blur();
      openSearch(event.target.value);
      return;
    }
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
    if (hit.view === 'settings' && !windowMode) { openTool('settings'); return; }
    ui.view = hit.view;
    paint();
    return;
  }
  if (hit.id === 'panel') { onAction({ dataset: { action: 'toggle-panel', id: hit.panel } }); return; }
  if (hit.id === 'open-search') { onAction({ dataset: { action: 'open-search' } }); return; }
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

/** The settings window (index.html?tool=settings): the settings page alone, with the main window's sign-in. */
async function startSettingsWindow() {
  windowMode = 'settings';
  document.body.classList.add('tool-window', 'settings-window');
  document.title = `MyWorkForce — ${L('설정', 'Settings')}`;
  mount();
  ui.dataUrl = dataUrl();
  ui.view = 'settings';
  paint();
  try { await waitForService(isDesktop() ? 30000 : 3000); } catch { /* shown below */ }
  await refreshStatus();
  if (!sessionToken()) {
    document.querySelector('#view').innerHTML = `<div class="page"><h1>${esc(L('설정', 'Settings'))}</h1><p>${esc(L('메인 창에서 로그인한 뒤 설정을 여세요.', 'Sign in in the main window, then open Settings.'))}</p></div>`;
    return;
  }
  try {
    const data = await currentSession();
    ui.loginUser = data.user.id;
    ui.loginAccount = data.user.login || '';
    ui.unlocked = true;
    ui.opened = true;
    const loaded = await loadWorkspace();
    ws = upgradeWorkspace(loaded.workspace || {});
    ui.ready = true;
    ui.view = 'settings';
    refreshSchema();
    paint();
  } catch (error) {
    document.querySelector('#view').innerHTML = `<div class="page"><h1>${esc(L('설정', 'Settings'))}</h1><p class="danger-text">${esc(message(error))}</p></div>`;
    return;
  }
  // Signed out in the main window: this window has nothing to show any more.
  watchSharedSession(() => { if (!sessionToken()) closeThisWindow(); });
  setInterval(() => { pullWorkspace().catch(() => {}); }, 4000);
}

export async function start(options = {}) {
  if (options.tool === 'settings') return startSettingsWindow();
  // Settings changed in the settings window: this window follows (theme, font, language, start page…).
  window.addEventListener('storage', (event) => {
    if (event.key !== SETTINGS_KEY) return;
    const before = settings.language;
    refreshSettings();
    applyTheme(resolveTheme(settings.theme, prefersDark(), settings.customTheme));
    applyFont(settings);
    if (settings.language !== before) { setLanguage(settings.language); setBackendLanguage(settings.language); }
    paint();
  });
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
  paint();
  try { await waitForService(isDesktop() ? 30000 : 3000); } catch { /* the start page says it did not answer, and keeps trying */ }
  await refreshStatus();
  if (settings.launchAtStartup) setLaunchAtStartup(true).catch(() => {});
  if (!(await adoptSharedSession())) await autoSignIn();
  // Nobody signed in (and no automatic sign-in): the sign-in window opens by itself.
  askSignIn();
  if (!ui.ready) paint();
  watchSharedSession(() => { adoptSharedSession().catch(() => {}); });
  watchMainRequest(() => { applyMainRequest(); });
  applyMainRequest();
  setInterval(() => { pullWorkspace().catch(() => {}); }, 4000);
  await showMain();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if (settings.theme === 'system') applyTheme(resolveTheme('system', prefersDark(), settings.customTheme));
  });
}
