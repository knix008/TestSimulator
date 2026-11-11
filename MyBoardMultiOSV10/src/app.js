// MyBoard main window: the menu bar (also the title bar), the toolbar, the left sidebar (projects →
// boards / backlog / reports / settings), the centre workspace (#workspace: the board), the right
// issue-detail panel (#detail), the bottom panel (Activity · Messages · Information) and the status bar.
//
// The shell (menus as popup windows, toolbar folding into », panels with grips, start page of movable
// cards over a moving background, settings, themes, progress popups, Undo/Redo, window memory) is
// MySketchBook's. The data lives in the database behind the core (api/client.js); realtime events come
// through live/channel.js. The board, backlog, reports and issue detail are views (views/registry.js)
// that later parts register; until then the shell shows placeholders.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { api } from './api/client.js';
import { createChannel } from './live/channel.js';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, loadRecentDirs, parseRecentPath, recentPath, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import { History } from './domain/history.js';
import { keyFromName, SAMPLES, TEMPLATES } from './domain/starters.js';
import { baseName, extensionOf, fileSafe } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, CUSTOM, customTheme, DARK_THEMES, LIGHT_THEMES, randomThemeId, resolveTheme, SYSTEM, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { findProblems, countBySeverity } from './ui/problems.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { renderIconRef, setIconApiBase } from './ui/iconref.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { getView, onViewRegistered, registerView } from './views/registry.js';
import './views/index.js';
import './print/texts.js';
import { gatherPrintContent } from './print/host.js';

/** The left panel's lower section (the view's sidebar): its smallest and default height; the tree keeps TREE_MIN. */
const SIDE_MIN = 120;
const SIDE_DEFAULT = 240;
const TREE_MIN = 140;

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const client = api();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();
const history = new History();

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  // The core: 'connecting' | 'ready' | 'error'; info = GET /api/info.
  core: { status: 'connecting', info: null, error: '' },
  live: { state: 'idle', presence: [] },
  // The open workspace ("document"): { project, board, view, demo } — null on the start page only.
  doc: null,
  projects: [],
  boardsByProject: new Map(),
  expanded: new Set(),
  collapsed: new Set(),
  sidebarQuery: '',
  selectedIssue: null,
  counts: null,
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  showStart: false,
  dynamicMenus: new Map(),
  // Bottom panel: Activity (what changed, from the live channel and this window), Messages (notices and errors), Information.
  bottomTab: 'problems',
  problems: { boardId: null, list: [], loading: false, at: 0 },
  activity: [],
  log: [],
};

const doc = () => state.doc;
const project = () => state.doc?.project ?? null;
const board = () => state.doc?.board ?? null;
const hasDoc = () => Boolean(state.doc) && !state.showStart;
const coreReady = () => state.core.status === 'ready';
const dbLabel = () => state.core.info?.db?.label ?? '';

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text, detail = '') {
  state.notice = { kind, text, at: Date.now() };
  state.log.unshift({ kind, text, detail, at: new Date() });
  if (state.log.length > 500) state.log.length = 500;
  if (state.bottomTab === 'messages') renderBottom();
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const code = error?.code;
  const key = code ? `error.code.${String(code).toLowerCase()}` : '';
  if (key && t(key) !== key) return { message: t(key), detail: error.message ?? '' };
  const text = native.errorText(error);
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyBoard ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

/** Activity: one line per change (live events from others, and this window's own steps). */
function logActivity(entry) {
  state.activity.unshift({ at: new Date(), ...entry });
  if (state.activity.length > 500) state.activity.length = 500;
  if (state.bottomTab === 'activity') renderBottom();
}

// ───────────────────────── the core (database) and the live channel

let live = createChannel({ desktop: true });

/** Connects to the core: GET /info, then the live channel (web with realtime). Never throws. */
async function connectCore({ quiet = false } = {}) {
  state.core = { status: 'connecting', info: state.core.info, error: '' };
  renderAll();
  try {
    let info = await client.info();
    setIconApiBase(() => client.url('').replace(/\/$/, ''));
    // Signed in first (a server with accounts, a new web server): the core counts as ready afterwards.
    if ((info?.needsLogin || info?.setupRequired) && !info.user) info = (await askLogin({ setup: Boolean(info.setupRequired) })) || info;
    if ((info?.needsLogin || info?.setupRequired) && !info.user) {
      // Not signed in (the user closed the sign-in window): nothing is loaded and no live connection is made.
      live.close();
      state.core = { status: 'login', info, error: '' };
      renderAll();
      return false;
    }
    state.core = { status: 'ready', info, error: '' };
    if (state.core.info?.dbError) notify('warning', t('core.dbError', { message: state.core.info.dbError.message ?? state.core.info.dbError.code ?? '' }));
    live.close();
    live = createChannel({ desktop: info?.mode !== 'web', realtime: Boolean(info?.realtime) });
    bindLive();
    live.connect();
    await refreshProjects();
    if (!quiet) notify('success', t('core.connected', { db: info?.db?.label ?? info?.db?.type ?? '' }));
  } catch (error) {
    state.core = { status: 'error', info: null, error: formatError(error).message, cause: error };
    if (!quiet) notify('error', `${t('core.unreachableTitle')}: ${state.core.error}`);
  }
  renderAll();
  return coreReady();
}

function bindLive() {
  live.on('state', ({ state: s, resync }) => {
    state.live.state = s;
    renderStatus();
    if (resync) { notify('info', t('live.resynced')); reloadWorkspace(); }
  });
  live.on('presence', ({ topic, users }) => {
    if (board() && topic === `board:${board().id}`) { state.live.presence = users; renderStatus(); }
  });
  live.on('event', (event) => {
    logActivity({ kind: 'live', type: event.type, text: describeEvent(event), by: event.by, id: event.id });
    getView(doc()?.view ?? 'board')?.update?.(viewContext({ event }));
    updateSide({ event });
    if (/^(project|board)\./.test(event.type)) refreshProjects();
    refreshProblems();
  });
  window.addEventListener('myboard:event', () => refreshProblems());
}

function describeEvent(event) {
  const [entity, verb] = String(event.type ?? '').split('.');
  // A readable name, never a raw row id (a notification carries its issue in `payload`).
  const d = event.data ?? {};
  const p = d.payload ?? {};
  const name = [d.key ?? p.key, d.name ?? d.summary ?? p.summary].filter(Boolean).join(' ') || d.title || '';
  return t('activity.event', { entity: t(`entity.${entity}`, null, entity), verb: t(`verb.${verb}`, null, verb), name }).replace(/:\s*$/, '');
}

/**
 * The user signs in (a server with accounts), or creates the administrator on a new web server.
 * → the new GET /info, or null when the user gave up (the app then works without a user: the API refuses).
 */
async function askLogin({ setup = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await popups.open('login', { setup, error: attempt ? t(setup ? 'login.setupFailed' : 'login.failed') : '' });
    if (!result?.username) return null;
    try {
      if (setup) await client.setup({ username: result.username, password: result.password ?? '', displayName: result.username });
      else await client.login(result.username, result.password ?? '');
      return await client.info();
    } catch { /* ask again */ }
  }
  return null;
}

async function refreshProjects() {
  if (!coreReady()) return;
  try {
    const list = await client.projects({ limit: 500 });
    state.projects = Array.isArray(list) ? list : list?.items ?? [];
    renderLeft();
    if (state.showStart || !state.doc) renderStartPage();
  } catch (error) {
    notify('error', `${t('error.loadProjects')}: ${formatError(error).message}`);
  }
}

async function boardsOf(projectId, { force = false } = {}) {
  if (!force && state.boardsByProject.has(projectId)) return state.boardsByProject.get(projectId);
  try {
    const list = await client.boards({ projectId, limit: 200 });
    const items = Array.isArray(list) ? list : list?.items ?? [];
    state.boardsByProject.set(projectId, items);
    return items;
  } catch {
    state.boardsByProject.set(projectId, []);
    return [];
  }
}

// ───────────────────────── the workspace (one project / board at a time)

const docName = (d = doc()) => (d ? [d.project?.name, d.board?.name].filter(Boolean).join(' › ') : '');

function setDoc(d) {
  if (!state.tutorial?.active) popups.close('welcome');
  const previous = state.doc;
  if (previous?.board && previous.board.id !== d?.board?.id) live.unsubscribe([`board:${previous.board.id}`]);
  if (previous?.project && previous.project.id !== d?.project?.id) live.unsubscribe([`project:${previous.project.id}`]);
  state.doc = d;
  state.selectedIssue = null;
  state.showStart = false;
  state.counts = null;
  if (d?.project && !d.demo) {
    state.expanded.add(d.project.id);
    live.subscribe([`project:${d.project.id}`, ...(d.board ? [`board:${d.board.id}`] : [])]);
    if (d.board && state.settings.realtimePresence) live.setPresence(`board:${d.board.id}`, { view: d.view === 'backlog' ? 'board' : d.view });
  }
  history.clear();
  persistSession();
  renderAll();
  loadCounts();
}

/** Opens a project (its first board) or a board. `kind` 'project' | 'board'. */
async function openTarget(kind, id, { view = null, quiet = false } = {}) {
  if (!coreReady()) { notify('warning', t('core.notReady')); return null; }
  try {
    let projectRow;
    let boardRow = null;
    if (kind === 'board') {
      boardRow = await client.board(id);
      boardRow = boardRow?.board ?? boardRow;
      projectRow = boardRow?.project_id ?? boardRow?.projectId ? await client.project(boardRow.project_id ?? boardRow.projectId) : null;
    } else {
      projectRow = await client.project(id);
    }
    projectRow = projectRow?.project ?? projectRow;
    if (projectRow && !boardRow) boardRow = (await boardsOf(projectRow.id, { force: true }))[0] ?? null;
    const d = { project: projectRow, board: boardRow, view: view ?? 'board', demo: false };
    setDoc(d);
    rememberRecent(d);
    if (!quiet) notify('success', t('notice.opened', { name: docName(d) }));
    return d;
  } catch (error) {
    showError('error.open', error, `${kind}:${id}`);
    return null;
  }
}

/** A demo workspace in memory (the tutorial; also without a core): nothing is written to the database. */
function openDemo(templateId = 'kanban') {
  const [, , ref, key] = TEMPLATES.find(([id]) => id === templateId) ?? TEMPLATES[0];
  const d = {
    demo: true, view: 'board',
    project: { id: 'demo', key, name: t('demo.project'), icon: ref, template: templateId },
    board: { id: 'demo-board', name: t('demo.board'), icon: 'b:kanban' },
  };
  setDoc(d);
  return d;
}

function setView(view) {
  if (!state.doc) return;
  state.doc = { ...state.doc, view };
  if (board() && !state.doc.demo && state.settings.realtimePresence) live.setPresence(`board:${board().id}`, { view: view === 'issue' ? 'issue' : 'board' });
  persistSession();
  renderTabs();
  renderWorkspace();
  renderLeft();
  renderToolbarState();
}

async function reloadWorkspace() {
  if (!state.doc || state.doc.demo) return;
  getView(state.doc.view)?.update?.(viewContext({ reload: true }));
  updateSide({ reload: true });
  loadCounts();
}

async function loadCounts() {
  const d = doc();
  if (!d || d.demo || !coreReady()) { state.counts = null; renderStatus(); return; }
  try {
    const key = d.project?.key;
    const [all, open] = await Promise.all([
      client.issues({ jql: `project = "${key}"`, limit: 0 }),
      client.issues({ jql: `project = "${key}" AND statusCategory != done`, limit: 0 }),
    ]);
    state.counts = { total: all?.total ?? 0, open: open?.total ?? 0 };
  } catch {
    state.counts = null;
  }
  renderStatus();
  if (state.bottomTab === 'info') renderBottom();
}

async function closeProject() {
  if (!state.doc) return true;
  if (board() && !state.doc.demo) live.setPresence(`board:${board().id}`, null);
  state.doc = null;
  state.selectedIssue = null;
  history.clear();
  persistSession();
  showStartPage(true);
  return true;
}

function persistSession() {
  if (state.instance && !state.instance.first) return;
  const d = state.doc;
  const value = d && !d.demo ? { path: recentPath(d.board ? 'board' : 'project', d.board?.id ?? d.project.id, dbLabel()), view: d.view } : null;
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(value ?? {})); } catch { /* ignore */ }
}

async function restoreSession() {
  if (!state.settings.restoreSession || !coreReady()) return;
  if (state.instance && !state.instance.first) return;
  let session = {};
  try { session = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}') ?? {}; } catch { /* none */ }
  const target = parseRecentPath(session.path);
  if (!target || (target.db && target.db !== dbLabel())) return;
  await openTarget(target.kind, target.id, { view: session.view, quiet: true });
}

/** The start page's slider steppers: − off at the minimum, + off at the maximum. */
function syncSliderSteps(holder) {
  const input = holder?.querySelector('input[type="range"]');
  if (!input) return;
  for (const button of holder.querySelectorAll('[data-slider-step]')) button.disabled = Number(button.dataset.sliderStep) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max);
}

/** A copied issue link (`…#issue=KEY`, views/board/menu.js): opens the issue's project board and its detail panel. */
const hashIssueKey = () => { const m = /(?:^#|&)issue=([^&]+)/.exec(globalThis.location?.hash ?? ''); return m ? decodeURIComponent(m[1]) : null; };
async function openIssueLink(key = hashIssueKey()) {
  if (!key || !coreReady()) return false;
  try {
    const row = await client.issue(key);
    const issue = row?.issue ?? row;
    if (!issue?.id) return false;
    const projectId = issue.projectId ?? issue.project_id;
    if (project()?.id !== projectId || state.showStart) await openTarget('project', projectId, { view: project()?.id === projectId ? doc().view : 'board', quiet: true });
    if (project()?.id !== projectId) return false;
    openIssue(issue.id);
    return true;
  } catch (error) {
    showError('error.open', error, key);
    return false;
  } finally {
    // Used once: a later reload goes back to the saved session, not to this issue.
    if (hashIssueKey() === key) globalThis.history?.replaceState?.(null, '', location.pathname + location.search);
  }
}

// ───────────────────────── projects: new, from template, sample, import, export

async function newProjectAsk(templateId = 'kanban') {
  if (!coreReady()) { notify('warning', t('core.notReady')); return null; }
  const [, , ref, defaultKey] = TEMPLATES.find(([id]) => id === templateId) ?? TEMPLATES[0];
  const result = await popups.open('prompt', { icon: 'fileNew', title: t('newProject.title', { template: t(`template.${templateId}`) }), label: t('newProject.name'), value: t(`template.${templateId}`) });
  const name = result?.value?.trim();
  if (!name) return null;
  return withProgress('progress.newProject', name, async () => {
    const key = await freeKey(keyFromName(name, defaultKey));
    const created = await client.createProject({ name, key, template: templateId, icon: ref });
    const row = created?.project ?? created;
    await refreshProjects();
    const d = await openTarget('project', row.id, { quiet: true });
    notify('success', t('notice.projectCreated', { name, key }));
    recordProjectCreate(row);
    return d;
  }).catch((error) => showError('error.newProject', error));
}

/** The key, or the key with a number when another project has it. */
async function freeKey(key) {
  const taken = new Set(state.projects.map((p) => String(p.key).toUpperCase()));
  if (!taken.has(key)) return key;
  for (let n = 2; n < 100; n++) { const next = `${key.slice(0, 8)}${n}`; if (!taken.has(next)) return next; }
  return `${key.slice(0, 6)}${Date.now() % 10000}`;
}

/** Deletes a project after the user confirms; the project is exported first, so Undo brings it back. */
async function deleteProjectAsk(id) {
  const p = state.projects.find((x) => x.id === id) ?? (doc()?.project?.id === id ? doc().project : null);
  if (!p || id === 'demo' || !coreReady()) return false;
  const label = `${p.name} (${p.key})`;
  const choice = await ask({ icon: 'trash', title: t('confirm.deleteProjectTitle'), message: t('confirm.deleteProjectMessage'), items: [label],
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('action.deleteProject'), icon: 'trash', danger: true, primary: true }] });
  if (choice !== 'delete') return false;
  try {
    const backup = await client.exportProject(id);
    let current = id;
    const remove = async () => {
      // the open project goes: its neighbour in the list opens instead (the start page only when none is left)
      const wasOpen = doc()?.project?.id === current;
      const order = state.projects.map((x) => x.id);
      const at = order.indexOf(current);
      await client.deleteProject(current);
      state.boardsByProject.delete(current);
      state.expanded.delete(current);
      state.collapsed.delete(current);
      await refreshProjects();
      if (!wasOpen) return;
      const left = state.projects.filter((x) => x.id !== current);
      const next = left.find((x) => x.id === order[at + 1]) ?? left.find((x) => x.id === order[at - 1]) ?? left[0];
      if (!next || !(await openTarget('project', next.id, { quiet: true }))) await closeProject();
    };
    await remove();
    history.record({
      label: t('op.deleteProject', { name: label }),
      undo: async () => { const row = await client.importMyBoard({ file: backup, key: p.key, name: p.name }); current = row?.id ?? current; await refreshProjects(); },
      redo: remove,
    });
    notify('success', t('notice.projectDeleted', { name: label }));
    logActivity({ kind: 'local', type: 'project.deleted', text: t('op.deleteProject', { name: label }) });
    return true;
  } catch (error) { showError('error.deleteProject', error); return false; }
}

function recordProjectCreate(row) {
  history.record({
    label: t('op.createProject', { name: row.name }),
    undo: async () => { await client.deleteProject(row.id); if (project()?.id === row.id) await closeProject(); await refreshProjects(); },
    redo: async () => { notify('info', t('notice.redoCreateUnavailable')); throw Object.assign(new Error(t('notice.redoCreateUnavailable')), { code: 'redo_unavailable' }); },
  });
  logActivity({ kind: 'local', type: 'project.created', text: t('op.createProject', { name: row.name }) });
}

/** The sample projects (POST /api/samples makes all three at once); the chosen one opens. */
async function openSampleAsk(id) {
  const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
  if (!coreReady()) { notify('warning', t('core.notReady')); return null; }
  return withProgress('progress.sample', t(`sample.${sample.id}`), async () => {
    const out = await client.createSamples(lang());
    const made = out?.projects ?? [];
    await refreshProjects();
    const chosen = made.find((p) => String(p.key).toUpperCase().startsWith(sample.key)) ?? made[0];
    notify('success', t('notice.samplesCreated', { count: made.length, issues: made.reduce((n, p) => n + (p.issueCount ?? 0), 0) }));
    logActivity({ kind: 'local', type: 'project.created', text: t('notice.samplesCreated', { count: made.length, issues: made.reduce((n, p) => n + (p.issueCount ?? 0), 0) }) });
    return chosen ? openTarget(chosen.boardId ? 'board' : 'project', chosen.boardId ?? chosen.id, { quiet: true }) : null;
  }).catch((error) => showError('error.newProject', error));
}

/** File › Import: .myboard (MyBoard export), .json (another board app's board export), .csv. */
async function importDialog() {
  if (!coreReady()) { notify('warning', t('core.notReady')); return; }
  let files = [];
  if (desktop) {
    const paths = await native.chooseFiles(state.settings.lastDirectory, [{ name: t('import.filterAll'), extensions: ['myboard', 'json', 'csv'] }], true);
    for (const path of paths) files.push({ name: baseName(path), text: await native.readTextFile(path, '') });
  } else {
    const picked = await native.pickWithInput('.myboard,.json,.csv', true);
    for (const file of picked) files.push({ name: file.name, text: await file.text() });
  }
  for (const file of files) await importText(file.name, file.text);
}

async function importText(name, text) {
  const ext = extensionOf(name);
  try {
    let result;
    await withProgress('progress.import', name, async () => {
      if (ext === 'csv') result = await client.importCsv({ csv: text, projectId: project()?.id ?? null, fileName: name });
      else {
        const data = JSON.parse(text);
        const trello = data && Array.isArray(data.lists) && Array.isArray(data.cards);
        result = trello ? await client.importTrello({ board: data, fileName: name }) : await client.importMyBoard(data);
      }
    });
    await refreshProjects();
    const projectId = result?.projectId ?? result?.project?.id ?? null;
    notify('success', t('notice.imported', { name }));
    logActivity({ kind: 'local', type: 'import', text: t('notice.imported', { name }) });
    if (projectId) await openTarget('project', projectId, { quiet: true });
  } catch (error) {
    showError('error.import', error, name);
  }
}

async function exportProject() {
  const p = project();
  if (!p || state.doc.demo) return;
  try {
    const data = await withProgress('progress.export', p.name, () => client.exportProject(p.id));
    const text = JSON.stringify(data, null, 2);
    const name = `${fileSafe(p.key || p.name)}.myboard`;
    if (desktop) {
      const path = await native.chooseSavePath(state.settings.lastDirectory ? `${state.settings.lastDirectory}/${name}` : name, ['myboard', 'json']);
      if (!path) return;
      await native.writeTextFile(path, text, '');
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(text, { name, mime: 'application/json' });
      if (saved) notify('success', t('notice.exported', { name: saved.name }));
    }
  } catch (error) {
    showError('error.export', error, p.name);
  }
}

// ───────────────────────── save (Ctrl+S): the open project as a .myboard file
// Desktop: the first save (and Save as…) asks where; the path is remembered per project (and database), so the next
// Ctrl+S writes the same file at once. Web: a download each time. The data itself always lives in the database.
const SAVE_PATHS_KEY = 'myboard.savePaths.v1';
const savePaths = () => { try { return JSON.parse(globalThis.localStorage?.getItem(SAVE_PATHS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const savePathKey = (p) => `${p.id}@${dbLabel()}`;

/** Save (Ctrl+S): the database. Every change is written as it is made; what a view keeps as unsaved changes (the
 * workflow editor's) is written now. */
async function saveToDatabase() {
  const p = project();
  if (!p || state.doc.demo) return;
  try {
    const command = getView(doc()?.view ?? '')?.commands?.save;
    if (command) await command.run(viewContext());
    notify('success', t('notice.savedDb', { name: p.name }));
  } catch (error) {
    showError('error.save', error, p.name);
  }
}

/** Save to file (Ctrl+Shift+S): the project as a .myboard file (the database stays the place it lives). */
async function saveProject({ as = false } = {}) {
  const p = project();
  if (!p || state.doc.demo) return;
  try {
    const data = await withProgress('progress.save', p.name, () => client.exportProject(p.id));
    const text = JSON.stringify(data, null, 2);
    const name = `${fileSafe(p.key || p.name)}.myboard`;
    if (desktop) {
      const paths = savePaths();
      let path = as ? null : paths[savePathKey(p)] ?? null;
      if (!path) {
        path = await native.chooseSavePath(state.settings.lastDirectory ? `${state.settings.lastDirectory}/${name}` : name, ['myboard']);
        if (!path) return;
        if (!/\.myboard$/i.test(path)) path += '.myboard';
      }
      await native.writeTextFile(path, text, '');
      try { globalThis.localStorage?.setItem(SAVE_PATHS_KEY, JSON.stringify({ ...paths, [savePathKey(p)]: path })); } catch { /* storage off */ }
      notify('success', t('notice.saved', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(text, { name, mime: 'application/json' });
      if (saved) notify('success', t('notice.saved', { name: saved.name }));
    }
  } catch (error) {
    showError('error.save', error, p.name);
  }
}

/** File › Open: projects with their boards (a menu of submenus). */
async function openMenu(anchor) {
  if (!coreReady()) { notify('warning', t('core.notReady')); return undefined; }
  if (!state.projects.length) await refreshProjects();
  const handlers = {};
  const items = [];
  for (const p of state.projects) {
    const boards = await boardsOf(p.id);
    handlers[`custom:project:${p.id}`] = () => openTarget('project', p.id);
    const children = boards.map((b) => { handlers[`custom:board:${b.id}`] = () => openTarget('board', b.id); return { id: `custom:board:${b.id}`, label: b.name, icon: 'columns' }; });
    items.push(children.length > 1
      ? { id: `submenu:project-${p.id}`, label: `${p.name} (${p.key})`, icon: 'folder', submenu: true, children: [{ id: `custom:project:${p.id}`, label: t('open.wholeProject'), icon: 'folderOpen' }, { separator: true }, ...children] }
      : { id: `custom:project:${p.id}`, label: `${p.name} (${p.key})`, icon: 'folder' });
  }
  if (!items.length) items.push({ id: 'custom:none', label: t('open.noProjects'), icon: 'info', disabled: true });
  items.push({ separator: true }, ...menuItems(['newProject', 'import', 'recent']));
  return showMenu(items, anchor ?? anchorFor('open'), 'context', { handlers, header: { icon: 'folderOpen', title: t('action.openBoard') } });
}

function templateMenu(anchor) {
  const handlers = Object.fromEntries(TEMPLATES.map(([id]) => [`custom:${id}`, () => newProjectAsk(id)]));
  return showMenu(TEMPLATES.map(([id, glyph]) => ({ id: `custom:${id}`, label: t(`template.${id}`), icon: glyph })), anchor ?? anchorFor('newProject'), 'context', { handlers, header: { icon: 'template', title: t('action.newFromTemplate') } });
}

function samplesMenu(anchor) {
  const handlers = Object.fromEntries(SAMPLES.map((s) => [`custom:${s.id}`, () => openSampleAsk(s.id)]));
  return showMenu(SAMPLES.map((s) => ({ id: `custom:${s.id}`, label: t(`sample.${s.id}`), icon: s.glyph })), anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'samples', title: t('action.openSample') } });
}

// ───────────────────────── undo / redo

async function undo() {
  try { const label = await history.undo(); if (label != null) { notify('info', t('notice.undone', { label })); reloadWorkspace(); } } catch (error) { if (error?.code !== 'redo_unavailable') showError('error.undo', error); }
  renderToolbarState();
}
async function redo() {
  try { const label = await history.redo(); if (label != null) { notify('info', t('notice.redone', { label })); reloadWorkspace(); } } catch (error) { if (error?.code !== 'redo_unavailable') showError('error.redo', error); }
  renderToolbarState();
}
history.onChange(() => renderToolbarState());

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !state.settings[key] });
const viewCommand = (view, glyph) => ({ icon: glyph, label: `view.${view}`, enabled: () => hasDoc(), checked: () => hasDoc() && doc().view === view, run: () => setView(view) });

const commands = {
  // file
  newProject: { icon: 'fileNew', label: 'action.newProject', key: 'Ctrl+N', enabled: coreReady, run: () => newProjectAsk('kanban') },
  newFromTemplate: { icon: 'template', label: 'action.newFromTemplate', enabled: coreReady, run: (c) => templateMenu(c?.anchor) },
  openSample: { icon: 'samples', label: 'action.openSample', enabled: coreReady, run: (c) => samplesMenu(c?.anchor) },
  open: { icon: 'folderOpen', label: 'action.openBoard', key: 'Ctrl+O', enabled: coreReady, run: (c) => openMenu(c?.anchor) },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !state.doc, run: () => showStartPage(!state.showStart || !state.doc) },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0, run: () => clearRecentAll() },
  import: { icon: 'importFile', label: 'action.import', key: 'Ctrl+I', enabled: coreReady, run: () => importDialog() },
  exportProject: { icon: 'exportFile', label: 'action.exportProject', key: 'Ctrl+E', enabled: () => hasDoc() && !doc().demo, run: () => exportProject() },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: () => hasDoc() && !doc().demo, run: () => saveToDatabase() },
  saveFile: { icon: 'saveAs', label: 'action.saveFile', key: 'Ctrl+Shift+S', enabled: () => hasDoc() && !doc().demo, run: () => saveProject() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: () => hasDoc() && !doc().demo, run: () => popups.open('print', { at: Date.now() }) },
  saveFileAs: { icon: 'exportFile', label: 'action.saveFileAs', enabled: () => hasDoc() && !doc().demo, run: () => saveProject({ as: true }) },
  database: { icon: 'database', label: 'action.connectDatabase', enabled: () => !(state.core.info?.mode === 'web' && state.core.info?.user?.role !== 'admin'), run: () => popups.open('settings', { tab: 'database' }) },
  reconnect: { icon: 'refresh', label: 'action.reconnect', run: () => connectCore() },
  deleteProject: { icon: 'trash', label: 'action.deleteProject', enabled: () => coreReady() && hasDoc() && !doc().demo, run: (c) => deleteProjectAsk(c?.id ?? doc()?.project?.id) },
  closeProject: { icon: 'closeTab', label: 'action.closeProject', key: 'Ctrl+W', enabled: () => Boolean(state.doc), run: () => closeProject() },
  exitProject: { icon: 'exitProject', label: 'action.exitProject', enabled: () => Boolean(state.doc) && !state.showStart, run: () => closeProject() },
  logout: { icon: 'user', label: 'action.logout', enabled: () => Boolean(state.core.info?.needsLogin !== undefined && state.core.info?.mode === 'web' && state.core.info?.user), run: async () => { await client.logout().catch(() => {}); await connectCore(); } },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => history.canUndo, run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => history.canRedo, run: () => redo() },
  createIssue: { icon: 'plus', label: 'action.createIssue', key: 'C', enabled: () => hasDoc() && !doc().demo, run: () => runViewCommand('createIssue') },
  // A column on the open board (views/board/addcolumn.js); on another view it opens the board first.
  addColumn: { icon: 'columns', label: 'action.addColumn', enabled: () => hasDoc() && !doc().demo && (getView('board')?.commands?.addColumn?.enabled?.() ?? true), run: async () => { if (doc()?.view !== 'board') { setView('board'); await new Promise((r) => setTimeout(r, 300)); } return getView('board')?.commands?.addColumn?.run(viewContext()); } },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: hasDoc, run: () => runViewCommand('find') },
  refresh: { icon: 'refresh', label: 'action.refresh', key: 'F5', enabled: () => hasDoc() || !coreReady(), run: () => (coreReady() ? (refreshProjects(), reloadWorkspace()) : connectCore()) },
  // view
  'view:board': viewCommand('board', 'columns'),
  'view:backlog': viewCommand('backlog', 'list'),
  'view:reports': viewCommand('reports', 'viewReports'),
  'view:projectSettings': viewCommand('projectSettings', 'folderSettings'),
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => toggle('showRightPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => toggle('showStatusBar') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => state.settings.showBottomPanel, run: () => toggle('showBottomPanel') },
  refreshProblems: { icon: 'refresh', label: 'bottom.problemsRefresh', enabled: () => hasDoc(), run: () => { showBottomTab('problems'); refreshProblems({ now: true }); } },
  showProblems: { icon: 'warning', label: 'action.showProblems', run: () => showBottomTab('problems') },
  showActivity: { icon: 'recent', label: 'action.showActivity', run: () => showBottomTab('activity') },
  showMessages: { icon: 'info', label: 'action.showMessages', run: () => showBottomTab('messages') },
  showInformation: { icon: 'database', label: 'action.showInformation', run: () => showBottomTab('info') },
  clearMessages: { icon: 'clearHistory', label: 'action.clearMessages', enabled: () => state.log.length > 0, run: () => { state.log = []; renderBottom(); } },
  copyMessages: { icon: 'copy', label: 'action.copyMessages', enabled: () => state.log.length > 0, run: () => native.clipboardWrite(state.log.map(logLine).join('\n')).catch(() => navigator.clipboard?.writeText(state.log.map(logLine).join('\n'))).then(() => notify('success', t('notice.copiedText'))) },
  clearActivity: { icon: 'clearHistory', label: 'action.clearActivity', enabled: () => state.activity.length > 0, run: () => { state.activity = []; renderBottom(); } },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (c) => openThemePicker(c?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  iconPicker: { icon: 'iconInsert', label: 'action.iconPicker', run: () => pickIcon('').then((ref) => { if (ref) notify('info', t('notice.iconPicked', { ref })); }) },
  // help
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

/** A command a view supplies (createIssue, find …): the current view's own, else a notice. */
function runViewCommand(id) {
  const view = getView(doc()?.view ?? 'board');
  const command = view?.commands?.[id];
  if (command) return command.run(viewContext());
  notify('info', t('notice.viewNotReady'));
  return undefined;
}

function commandEnabled(id) { const c = commands[id]; return Boolean(c) && (c.enabled ? Boolean(c.enabled()) : true); }
function commandTip(id) {
  const c = commands[id];
  if (!c) return id;
  const tip = t(`tip.${id.replace(':', '.')}`, null, '');
  return `${t(c.label)}${c.key ? ` (${keyLabel(c.key)})` : ''}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const c = commands[id];
  if (!c || !commandEnabled(id)) return undefined;
  try { return await c.run(context); } catch (error) { return showError('error.command', error, t(c.label)); }
}

// ───────────────────────── menus

const SUBMENUS = {
  importFrom: { icon: 'importFile', items: ['import'] },
  views: { icon: 'columns', items: ['view:board', 'view:backlog', 'view:reports', 'view:projectSettings'] },
  show: { icon: 'eye', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'showProblems', 'showActivity', 'showMessages', 'showInformation'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  newFrom: { icon: 'fileNew', items: ['newProject', 'newFromTemplate', 'openSample'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: [sub('newFrom'), 'open', 'save', 'saveFile', 'saveFileAs', '-', 'print', '-', 'startPage', 'recent', 'clearRecent', '-', 'import', 'exportProject', '-', 'database', 'reconnect', '-', 'closeProject', 'deleteProject', '-', 'logout', 'exit'],
  edit: ['undo', 'redo', '-', 'createIssue', 'addColumn', 'find', '-', 'iconPicker'],
  view: [sub('views'), 'refresh', '-', sub('show'), '-', sub('appearance')],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', help: 'question' };

const TOOLBAR = [
  ['newProject', 'open', 'save', 'print', 'exitProject', 'import', 'exportProject'],
  ['undo', 'redo'],
  ['createIssue', 'addColumn', 'find', 'refresh'],
  ['view:board', 'view:backlog', 'view:reports', 'view:projectSettings'],
  ['leftPanel', 'bottomPanel', 'rightPanel'],
];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const LABELED = new Set(['newProject', 'createIssue', 'addColumn', 'view:board', 'view:backlog', 'view:reports']);
/** Main command of a toolbar entry (split buttons: the button part) — what the » menu lists. */
const TOOLBAR_MAIN = { themeSplit: 'theme' };

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="shell">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.projects'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="workspace" class="workspace" tabindex="-1"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.detail'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !state.doc;
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyBoard v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyBoard</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const projectName = '<span class="menubar-project" data-window-drag><span class="app-brand-project-name" data-window-drag></span><span class="app-brand-dirty" data-window-drag>●</span></span>';
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + projectName + `<div class="menubar-drag" data-window-drag></div>${controls}`;
  renderTitleProject();
}

function renderTitleProject() {
  const box = root.querySelector('.menubar-project');
  if (!box) return;
  const d = state.showStart ? null : state.doc;
  box.classList.toggle('empty', !d);
  box.classList.remove('dirty');
  box.querySelector('.app-brand-project-name').textContent = d ? docName(d) : '';
  box.title = d ? `${docName(d)}${d.demo ? ` (${t('demo.tag')})` : ''}` : '';
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

async function trackMaximized() {
  if (!desktop) return;
  const update = async () => {
    const maximized = await appWindow.isMaximized().catch(() => false);
    if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); }
  };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
  const mark = (key) => { try { globalThis.localStorage?.setItem(key, String(Date.now())); } catch { /* private mode */ } };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, () => mark('myboard.main.input'), { capture: true, passive: true });
  window.addEventListener('focus', () => mark('myboard.main.focus'));
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const c = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(c.icon);
    const labeled = LABELED.has(id);
    return `<button class="tool-button ${labeled ? 'tool-labeled' : ''} ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(c.label))}">${glyph}${labeled ? `<span>${escapeHtml(t(c.label))}</span>` : ''}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => (id === 'themeSplit' ? split('theme', 'themeMenu', 'action.themeChoose') : plain(id));
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
  fitToolbar();
}

/**
 * A window narrower than the toolbar: the left groups that do not fit are hidden from the end and listed in
 * the » menu instead, so the right group (tutorial, theme, language, settings) and the window buttons always show.
 */
function fitToolbar() {
  const inner = root.querySelector('.toolbar-inner');
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  const more = root.querySelector('[data-toolbar-more]');
  if (!inner || !left || !right || !more) return;
  const groups = [...left.querySelectorAll('[data-group]')];
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = false;
  more.hidden = true;
  const room = inner.clientWidth - right.offsetWidth - 12;
  if (left.scrollWidth <= room) { state.toolbarHidden = []; return; }
  more.hidden = false;
  const limit = room - more.offsetWidth - 6;
  const start = left.getBoundingClientRect().left;
  let cut = groups.length;
  for (const [i, g] of groups.entries()) if (g.getBoundingClientRect().right - start > limit) { cut = Math.max(1, i); break; }
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = Number(el.dataset.group ?? el.dataset.groupSep) >= cut;
  state.toolbarHidden = TOOLBAR.slice(cut);
}

function showToolbarMore(button) {
  const ids = (state.toolbarHidden ?? []).flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #tabs [data-command]')) {
    const id = el.dataset.command;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const undoBtn = root.querySelector('#toolbar [data-command="undo"]');
  if (undoBtn) undoBtn.title = history.canUndo ? `${commandTip('undo')}: ${history.undoLabel}` : commandTip('undo');
  const redoBtn = root.querySelector('#toolbar [data-command="redo"]');
  if (redoBtn) redoBtn.title = history.canRedo ? `${commandTip('redo')}: ${history.redoLabel}` : commandTip('redo');
}

function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    // The toolbar folds into » when narrow: the minimum is the menu bar plus the right group and a few left groups.
    const width = Math.ceil(Math.max(menus, right.scrollWidth + 360));
    const screenWidth = window.screen?.availWidth || Infinity;
    const min = Math.min(screenWidth, Math.max(width, 900));
    if (Math.abs(min - state.minWidth) < 1) return;
    state.minWidth = min;
    document.documentElement.style.setProperty('--min-width', `${min}px`);
    native.setMinimumSize(min, 600).catch(() => {});
  });
}

/** Above the workspace: the project and board, and the view tabs (Board · Backlog · Reports · Settings). */
function renderTabs() {
  renderTitleProject();
  const tabs = root.querySelector('#tabs');
  const d = state.showStart ? null : doc();
  if (!d) { tabs.innerHTML = ''; return; }
  const views = [['view:board', 'board'], ['view:backlog', 'backlog'], ['view:reports', 'reports'], ['view:projectSettings', 'projectSettings']];
  tabs.innerHTML = `<div class="tab-strip">
      <span class="ws-crumb" title="${escapeHtml(docName(d))}">${renderIconRef(d.project?.icon, { size: 18, fallback: `l:${(d.project?.key ?? '?').slice(0, 2)}` })}<b>${escapeHtml(d.project?.name ?? '')}</b>${d.project?.key ? `<code>${escapeHtml(d.project.key)}</code>` : ''}${d.board ? `<span class="muted">›</span>${renderIconRef(d.board.icon, { size: 16, fallback: 'b:kanban' })}<span>${escapeHtml(d.board.name)}</span>` : ''}${d.demo ? `<i class="badge">${escapeHtml(t('demo.tag'))}</i>` : ''}</span>
    </div>
    <span class="grow"></span>
    <div class="tabs-right"><span class="seg-toggle" role="tablist">${views.map(([command, view]) => `<button class="${d.view === view ? 'active' : ''}" data-command="${command}" role="tab" aria-selected="${d.view === view}" title="${escapeHtml(commandTip(command))}">${icon(commands[command].icon)}<span>${escapeHtml(t(`view.${view}`))}</span></button>`).join('')}</span></div>`;
}

// ───────────────────────── left sidebar: projects → boards / backlog / reports / settings

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel) return;
  if (state.showStart || !state.doc) return;
  if (!state.settings.showLeftPanel) {
    unmountSide();
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('panelLeftOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('folder')}<span>${escapeHtml(t('panel.projectsShort'))}</span></div></div>`;
    return;
  }
  ensureLeftLayout(panel);
  const top = panel.querySelector(':scope > .left-top');
  const scroll = top.querySelector('.panel-body')?.scrollTop ?? 0;
  const focused = document.activeElement?.id === 'sidebar-search';
  const query = state.sidebarQuery.trim().toLowerCase();
  const d = doc();
  const list = d?.demo ? [d.project] : state.projects;
  const shown = list.filter((p) => !query || `${p.name} ${p.key}`.toLowerCase().includes(query));
  const node = (p) => {
    // the open project starts expanded, but its arrow folds it like any other
    const open = Boolean(query) || state.expanded.has(p.id) || (p.id === d?.project?.id && !state.collapsed.has(p.id));
    const boards = d?.demo && p.id === 'demo' ? [d.board] : state.boardsByProject.get(p.id) ?? [];
    const here = (view, boardId = null) => d?.project?.id === p.id && d.view === view && (!boardId || d.board?.id === boardId);
    const leaf = (attrs, glyph, label, active, extra = '') => `<button class="nav-leaf ${active ? 'active' : ''}" ${attrs} title="${escapeHtml(label)}" ${active ? 'aria-current="page"' : ''}>${glyph}<span>${escapeHtml(label)}</span>${extra}</button>`;
    const children = open ? `<div class="nav-children" role="group">
        ${boards.length ? boards.map((b) => leaf(`data-nav-board="${escapeHtml(b.id)}" data-nav-project="${escapeHtml(p.id)}"`, renderIconRef(b.icon, { size: 16, fallback: 'b:kanban' }), b.name, here('board', b.id))).join('') : `<span class="nav-empty muted">${escapeHtml(state.boardsByProject.has(p.id) ? t('nav.noBoards') : t('nav.loading'))}</span>`}
        ${leaf(`data-nav-view="backlog" data-nav-project="${escapeHtml(p.id)}"`, icon('list'), t('view.backlog'), here('backlog'))}
        ${leaf(`data-nav-view="reports" data-nav-project="${escapeHtml(p.id)}"`, icon('viewReports'), t('view.reports'), here('reports'))}
        ${leaf(`data-nav-view="projectSettings" data-nav-project="${escapeHtml(p.id)}"`, icon('folderSettings'), t('view.projectSettings'), here('projectSettings'))}
      </div>` : '';
    if (open && !state.boardsByProject.has(p.id) && !d?.demo) boardsOf(p.id).then(() => renderLeft());
    return `<div class="nav-project ${d?.project?.id === p.id ? 'current' : ''}" data-project-node="${escapeHtml(p.id)}">
      <div class="nav-row">
        <button class="nav-toggle" data-nav-toggle="${escapeHtml(p.id)}" aria-expanded="${open}" title="${escapeHtml(t(open ? 'nav.collapse' : 'nav.expand'))}">${icon(open ? 'chevronDown' : 'chevronRight', 'icon tiny')}</button>
        <button class="nav-project-name" data-nav-open-project="${escapeHtml(p.id)}" title="${escapeHtml(`${p.name} (${p.key})`)}">${renderIconRef(p.icon, { size: 18, fallback: `l:${String(p.key ?? '?').slice(0, 2)}` })}<span>${escapeHtml(p.name)}</span><code>${escapeHtml(p.key ?? '')}</code></button>
      </div>${children}</div>`;
  };
  const body = !coreReady() && !d?.demo
    ? `<p class="panel-hint">${icon('warning')}<span>${escapeHtml(t('core.unreachableShort'))}</span></p><button class="small-button" data-command="reconnect">${icon('refresh')}<span>${escapeHtml(t('action.reconnect'))}</span></button>`
    : shown.length ? shown.map(node).join('') : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t(query ? 'nav.noMatch' : 'nav.noProjects'))}</span></p>`;
  top.innerHTML = `<div class="panel-header">${icon('folder')}<span>${escapeHtml(t('panel.projects'))}</span>
      <button class="icon-button" data-command="newProject" title="${escapeHtml(commandTip('newProject'))}">${icon('plus')}</button>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}">${icon('panelLeftClose')}</button></div>
    <div class="nav-search"><label class="search-box mini">${icon('search')}<input id="sidebar-search" type="search" value="${escapeHtml(state.sidebarQuery)}" placeholder="${escapeHtml(t('nav.search'))}" aria-label="${escapeHtml(t('nav.search'))}" /></label></div>
    <div class="panel-body nav-tree" role="tree">${body}</div>`;
  top.querySelector('.panel-body').scrollTop = scroll;
  if (focused) { const input = top.querySelector('#sidebar-search'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  for (const b of top.querySelectorAll('[data-command]')) b.disabled = !commandEnabled(b.dataset.command);
  renderSide();
}

// ───────────────────────── left panel, lower part: the current view's sidebar (views/registry.js `sidebar`)
// Board, backlog, reports and project settings show their own navigation and information here, under a
// title of their own; the section and the divider above it stay while the project tree above is redrawn.

const SIDE_GLYPHS = { board: 'columns', backlog: 'list', reports: 'viewReports', projectSettings: 'folderSettings' };

function ensureLeftLayout(panel) {
  if (panel.querySelector(':scope > .left-top')) return;
  panel.innerHTML = `<div class="left-top"></div>
    <div class="left-split" role="separator" aria-orientation="horizontal" title="${escapeHtml(t('panel.sideResize'))}"></div>
    <section class="left-view" aria-labelledby="left-view-title"><div class="panel-header left-view-header"><span class="left-view-glyph"></span><span id="left-view-title"></span><span class="left-view-sub"></span></div><div class="left-view-body"></div></section>`;
  mounted.side = null;
}

function unmountSide() {
  if (!mounted.side) return;
  try { mounted.side.side?.unmount?.(); } catch (error) { console.error(error); }
  mounted.side = null;
}

/** The title row of the lower section: the view's icon and name, and what the view adds (its `title(ctx)`). */
function renderSideHeader() {
  const panel = root.querySelector('#left-panel');
  const section = panel?.querySelector(':scope > .left-view');
  if (!section) return;
  const d = state.showStart ? null : doc();
  const id = d?.view ?? null;
  const side = id ? getView(id)?.sidebar ?? null : null;
  let sub = '';
  try { sub = side?.title?.(viewContext()) ?? ''; } catch { sub = ''; }
  section.querySelector('.left-view-glyph').innerHTML = icon(side?.icon ?? SIDE_GLYPHS[id] ?? 'columns');
  section.querySelector('#left-view-title').textContent = id ? t(`view.${id}`) : '';
  const subEl = section.querySelector('.left-view-sub');
  subEl.textContent = sub ? sub : '';
  subEl.hidden = !sub;
  section.title = [id ? t(`view.${id}`) : '', sub].filter(Boolean).join(' — ');
}

function renderSide() {
  const panel = root.querySelector('#left-panel');
  const section = panel?.querySelector(':scope > .left-view');
  const host = section?.querySelector('.left-view-body');
  const d = state.showStart ? null : doc();
  const id = d?.view ?? null;
  const side = id ? getView(id)?.sidebar ?? null : null;
  if (mounted.side && (mounted.side.host !== host || mounted.side.side !== side || mounted.side.doc !== d || mounted.side.id !== id)) unmountSide();
  if (!section) return;
  const show = Boolean(d) && state.settings.showViewSide !== false;
  section.hidden = !show;
  panel.querySelector(':scope > .left-split').hidden = !show;
  panel.style.setProperty('--left-view-height', `${state.settings.leftViewHeight}px`);
  if (!show) { unmountSide(); return; }
  renderSideHeader();
  if (mounted.side) return;
  mounted.side = { host, side, doc: d, id };
  host.innerHTML = '';
  if (!side) { host.innerHTML = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('panel.sideEmpty'))}</span></p>`; return; }
  try { side.mount(host, viewContext()); } catch (error) { showError('error.view', error, `${id}:sidebar`); }
}

/** A view's sidebar hears what its view hears (live events, reloads, settings). */
function updateSide(extra) {
  const side = mounted.side?.side;
  if (!side?.update) return;
  try { side.update(viewContext(extra)); } catch (error) { console.error(error); }
  renderSideHeader();
}

async function onNav(target) {
  const projectId = target.dataset.navProject ?? target.dataset.navOpenProject;
  const d = doc();
  if (target.dataset.navBoard) {
    if (d?.demo) return setView('board');
    if (d?.board?.id === target.dataset.navBoard) return setView('board');
    return openTarget('board', target.dataset.navBoard);
  }
  if (target.dataset.navView) {
    if (d?.project?.id === projectId) return setView(target.dataset.navView);
    return openTarget('project', projectId, { view: target.dataset.navView });
  }
  if (target.dataset.navOpenProject) {
    if (d?.project?.id === projectId) return setView('board');
    return openTarget('project', projectId);
  }
  return undefined;
}

// ───────────────────────── centre workspace and right detail panel (views)

let mounted = { workspace: null, detail: null, side: null };

/** What a view gets (views/registry.js). */
function viewContext(extra = {}) {
  return {
    api: client, live, workspace: doc(), settings: state.settings, t, icon, renderIconRef, notify, showError, history, popups, app: appApi,
    openIssue: (id) => openIssue(id), pickIcon, ...extra,
  };
}

function renderWorkspace() {
  const host = root.querySelector('#workspace');
  if (!host) return;
  const d = state.showStart ? null : doc();
  const id = d?.view ?? null;
  const view = id ? getView(id) : null;
  if (mounted.workspace && (mounted.workspace.id !== id || mounted.workspace.view !== view || mounted.workspace.doc !== d)) {
    try { mounted.workspace.view?.unmount?.(); } catch (error) { console.error(error); }
    mounted.workspace = null;
  }
  if (!d) { host.innerHTML = ''; return; }
  if (view) {
    if (!mounted.workspace) {
      host.innerHTML = '';
      mounted.workspace = { id, view, doc: d };
      try { view.mount(host, viewContext()); } catch (error) { showError('error.view', error, id); }
    }
    return;
  }
  mounted.workspace = { id, view: null, doc: d };
  host.innerHTML = placeholderHtml(d);
}

/** Until the board view is registered: what will be here, with the board's columns when the core has them. */
function placeholderHtml(d) {
  const columns = d.view === 'board' ? [t('placeholder.colTodo'), t('placeholder.colSelected'), t('placeholder.colProgress'), t('placeholder.colDone')] : [];
  const glyph = { board: 'columns', backlog: 'list', reports: 'viewReports', projectSettings: 'folderSettings' }[d.view] ?? 'columns';
  return `<div class="ws-placeholder">
    <div class="ws-placeholder-head">${icon(glyph)}<div><h2>${escapeHtml(t(`view.${d.view}`))} — ${escapeHtml(d.board?.name ?? d.project?.name ?? '')}</h2><p class="muted">${escapeHtml(t('placeholder.text'))}</p></div></div>
    ${columns.length ? `<div class="ws-columns">${columns.map((name, i) => `<section class="ws-column"><h3>${escapeHtml(name)}<i>${i === 0 ? 3 : i === 3 ? 1 : 2}</i></h3>${Array.from({ length: i === 0 ? 3 : i === 3 ? 1 : 2 }, (_, k) => `<div class="ws-card-ghost" data-issue-ghost="${i}-${k}"><span></span><span></span><small>${escapeHtml(d.project?.key ?? 'KAN')}-${i * 3 + k + 1}</small></div>`).join('')}</section>`).join('')}</div>` : ''}
  </div>`;
}

function openIssue(id) {
  state.selectedIssue = id;
  if (!state.settings.showRightPanel) updateSettings({ showRightPanel: true }); else renderRight();
}

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (state.showStart || !state.doc) return;
  if (!state.settings.showRightPanel) {
    if (mounted.detail) { try { mounted.detail.view?.unmount?.(); } catch { /* ignore */ } mounted.detail = null; }
    panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('panelRightOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title">${icon('notes')}<span>${escapeHtml(t('panel.detailShort'))}</span></div></div>`;
    return;
  }
  if (!panel.querySelector('#detail')) {
    mounted.detail = null;
    panel.innerHTML = `<div class="panel-header">${icon('notes')}<span>${escapeHtml(t('panel.detail'))}</span>
        <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}">${icon('panelRightClose')}</button></div>
      <div id="detail" class="detail-host"></div>`;
  }
  const host = panel.querySelector('#detail');
  const view = getView('detail');
  if (view) {
    if (!mounted.detail || mounted.detail.view !== view) { host.innerHTML = ''; mounted.detail = { view }; try { view.mount(host, viewContext({ issueId: state.selectedIssue })); } catch (error) { showError('error.view', error, 'detail'); } }
    else view.update?.(viewContext({ issueId: state.selectedIssue }));
    return;
  }
  host.innerHTML = `<div class="detail-empty">${icon('notes', 'icon big')}<p>${escapeHtml(state.selectedIssue ? t('detail.loading', { id: state.selectedIssue }) : t('detail.none'))}</p><small class="muted">${escapeHtml(t('detail.hint'))}</small></div>`;
}

onViewRegistered((id) => { if (doc()?.view === id) { unmountSide(); renderSide(); } if (id === 'detail') { mounted.detail = null; renderRight(); } else if (doc()?.view === id) { mounted.workspace = null; renderWorkspace(); } });

// ───────────────────────── bottom panel (activity, messages, information)

const logLine = (e) => `[${e.at.toLocaleTimeString()}] ${e.kind.toUpperCase()} ${e.text}${e.detail ? `\n${e.detail}` : ''}`;
const SEV_ICON = { error: 'error', warning: 'warning', info: 'info', success: 'check' };

/** The Problems tab's list: the board's problems (loaded) and the app's own (now). */
function currentProblems() {
  const errors = state.log.filter((e) => e.kind === 'error').length;
  const system = findProblems(null, { coreOk: coreReady() || Boolean(doc()?.demo), errors });
  return [...system, ...state.problems.list];
}

let problemsTimer = null;
/** Looks for problems again: soon after a change (several changes, one check), or at once. */
function refreshProblems({ now = false } = {}) {
  clearTimeout(problemsTimer);
  problemsTimer = setTimeout(loadProblems, now ? 0 : 500);
}
async function loadProblems() {
  const d = doc();
  const b = d && !d.demo ? board() : null;
  state.problems = { ...state.problems, boardId: b?.id ?? null, loading: Boolean(b && coreReady()) };
  let list = [];
  if (b && coreReady()) {
    try { list = findProblems(await client.boardData(b.id), { coreOk: true, errors: 0 }); } catch { list = []; }
  }
  if ((board()?.id ?? null) !== (b?.id ?? null)) { state.problems.loading = false; return; }
  state.problems = { boardId: b?.id ?? null, list, loading: false, at: Date.now() };
  renderBottom();
}

function showBottomTab(tab) {
  state.bottomTab = tab;
  if (!state.settings.showBottomPanel) updateSettings({ showBottomPanel: true }); else renderBottom();
}

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!state.settings.showBottomPanel || state.showStart || !state.doc) { host.innerHTML = ''; return; }
  const shownBoard = doc()?.demo ? null : board()?.id ?? null;
  if (state.problems.boardId !== shownBoard && !state.problems.loading) refreshProblems({ now: true });
  const problems = currentProblems();
  const sev = countBySeverity(problems);
  const tabs = [['problems', sev.error ? 'error' : 'warning', t('bottom.problems'), problems.length], ['activity', 'recent', t('bottom.activity'), state.activity.length], ['messages', 'info', t('bottom.messages'), state.log.length], ['info', 'database', t('bottom.info'), null]];
  const tabHtml = `<span class="segmented" role="tablist">${tabs.map(([id, glyph, label, n]) => `<button class="segment ${state.bottomTab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${state.bottomTab === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span>${n != null ? `<i class="bottom-count">${n}</i>` : ''}</button>`).join('')}</span>`;
  let tools = '';
  let body = '';
  if (state.bottomTab === 'problems') {
    const chip = (k, glyph) => `<span class="problems-chip sev-${k}" title="${escapeHtml(t(`problems.sev.${k}`))}">${icon(glyph)}<span>${sev[k]}</span></span>`;
    tools = `<span class="problems-counts">${chip('error', 'error')}${chip('warning', 'warning')}${chip('info', 'info')}</span><span class="grow"></span><button class="small-button" data-command="refreshProblems" ${state.problems.loading ? 'disabled' : ''}>${icon(state.problems.loading ? 'hourglass' : 'refresh')}<span>${escapeHtml(t('bottom.problemsRefresh'))}</span></button>`;
    body = problems.length ? problems.map((p, i) => {
      const glyph = { error: 'error', warning: 'warning', info: 'info' }[p.severity];
      const text = t(`problems.${p.kind}`, p.params);
      const where = p.issueKey ?? p.params?.column ?? p.params?.status ?? '';
      return `<div class="problem-row bottom-row problems-row sev-${p.severity} ${p.issueId || p.kind === 'messages' || p.kind === 'core' ? 'link' : ''}" data-problem="${i}" title="${escapeHtml(text)}"><span class="cell sev">${icon(glyph)}</span><span class="cell">${escapeHtml(text)}</span><span class="cell muted">${escapeHtml(where)}</span><span class="cell muted">${escapeHtml(t(`problems.sev.${p.severity}`))}</span></div>`;
    }).join('') : `<p class="problems-empty">${icon(state.problems.loading ? 'hourglass' : 'check')}<span>${escapeHtml(t(state.problems.loading ? 'bottom.problemsChecking' : 'bottom.noProblems'))}</span></p>`;
  } else if (state.bottomTab === 'activity') {
    tools = `<span class="grow"></span><span class="muted live-chip ${state.live.state}">${icon(liveGlyph())}<span>${escapeHtml(liveText())}</span></span><button class="small-button danger" data-command="clearActivity" ${state.activity.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearActivity'))}</span></button>`;
    body = state.activity.length ? state.activity.map((e, i) => `<div class="problem-row bottom-row activity-row" data-activity="${i}" title="${escapeHtml(e.text)}"><span class="cell sev">${icon(e.kind === 'live' ? 'globe' : 'user')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.type ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noActivity'))}</span></p>`;
  } else if (state.bottomTab === 'messages') {
    tools = `<span class="grow"></span><button class="small-button" data-command="copyMessages" ${state.log.length ? '' : 'disabled'}>${icon('copy')}<span>${escapeHtml(t('action.copyMessages'))}</span></button><button class="small-button danger" data-command="clearMessages" ${state.log.length ? '' : 'disabled'}>${icon('clearHistory')}<span>${escapeHtml(t('action.clearMessages'))}</span></button>`;
    body = state.log.length ? state.log.map((e, i) => `<div class="problem-row bottom-row log-row ${e.kind === 'error' ? 'error' : e.kind === 'info' ? '' : e.kind}" data-log="${i}" title="${escapeHtml(e.detail || e.text)}"><span class="cell sev">${icon(SEV_ICON[e.kind] ?? 'info')}</span><span class="cell">${escapeHtml(e.text)}</span><span class="cell muted">${escapeHtml(e.detail.split('\n')[0] ?? '')}</span><span class="cell muted">${escapeHtml(e.at.toLocaleTimeString())}</span></div>`).join('') : `<p class="problems-empty">${icon('info')}<span>${escapeHtml(t('bottom.noMessages'))}</span></p>`;
  } else {
    const info = state.core.info;
    const d = doc();
    const rows = [
      ['database', t('bottom.infoDb'), info?.db ? `${t(`db.kind.${info.db.type}`, null, info.db.type)} · ${info.db.label ?? ''}` : t('core.unreachableShort')],
      ['server', t('bottom.infoMode'), info ? `${t(`db.mode.${info.mode}`, null, info.mode)} · v${info.version ?? '?'} · ${info.realtime ? t('live.on') : t('live.off')}` : '—'],
      ['user', t('bottom.infoUser'), info?.user ? `${info.user.displayName ?? info.user.display_name ?? info.user.username} (${info.user.role ?? ''})` : '—'],
      ['folder', t('bottom.infoProject'), d ? `${d.project?.name ?? ''} (${d.project?.key ?? ''})${d.board ? ` · ${d.board.name}` : ''}${d.demo ? ` · ${t('demo.tag')}` : ''}` : '—'],
      ['list', t('bottom.infoIssues'), state.counts ? t('status.issues', state.counts) : '—'],
      ['folderOpen', t('bottom.infoProjects'), String(state.projects.length)],
    ];
    body = rows.map(([glyph, label, value]) => `<div class="problem-row bottom-row info-row"><span class="cell sev">${icon(glyph)}</span><span class="cell"><b>${escapeHtml(label)}</b></span><span class="cell info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`).join('');
  }
  const scroll = host.querySelector('.problems-list')?.scrollTop ?? 0;
  host.innerHTML = `<div class="problems-header">${tabHtml}${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="problems-list bottom-${state.bottomTab}" tabindex="0">${body}</div>`;
  host.querySelector('.problems-list').scrollTop = scroll;
}

// ───────────────────────── status bar

const liveGlyph = () => ({ open: 'globe', connecting: 'hourglass', reconnecting: 'refresh', disabled: 'database', closed: 'unlink' })[state.live.state] ?? 'globe';
function liveText() {
  if (!coreReady()) return state.core.status === 'connecting' ? t('core.connecting') : state.core.status === 'login' ? t('core.loginNeeded') : t('core.unreachableShort');
  return t(`live.state.${state.live.state}`, null, state.live.state);
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = state.settings;
  const notice = state.notice;
  const hint = notice?.text ?? t('status.ready');
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  const info = state.core.info;
  const core = state.core.status;
  const dbText = core === 'ready' ? t(`db.kind.${info?.db?.type}`, null, info?.db?.type ?? '') : core === 'error' ? t('core.unreachableShort') : core === 'login' ? t('core.loginNeeded') : t('core.connecting');
  const dbTip = core === 'ready' ? t('status.dbTip', { type: info?.db?.type ?? '', label: info?.db?.label ?? '' }) : core === 'error' ? `${t('core.unreachableTitle')}: ${state.core.error}` : core === 'login' ? t('core.loginNeeded') : t('core.connecting');
  items.push(`<button class="status-item db-state ${core}" data-command="${core === 'error' || core === 'login' ? 'reconnect' : 'showInformation'}" title="${escapeHtml(dbTip)}">${icon(core === 'ready' ? 'database' : core === 'error' ? 'error' : core === 'login' ? 'user' : 'hourglass')}<span>${escapeHtml(dbText)}</span></button>`);
  if (info?.user) items.push(`<span class="status-item" title="${escapeHtml(t('status.userTip'))}">${renderIconRef(info.user.avatar, { size: 14, fallback: `l:${String(info.user.displayName ?? info.user.display_name ?? info.user.username ?? '?').slice(0, 1)}` })}<span>${escapeHtml(info.user.displayName ?? info.user.display_name ?? info.user.username)}</span></span>`);
  if (coreReady()) {
    const presence = state.live.presence?.length ? ` · ${t('status.presence', { count: state.live.presence.length })}` : '';
    items.push(`<span class="status-item live-state ${state.live.state}" title="${escapeHtml(t('status.liveTip'))}">${icon(liveGlyph())}<span>${escapeHtml(liveText() + presence)}</span></span>`);
  }
  if (hasDoc() && state.counts) items.push(`<span class="status-item" title="${escapeHtml(t('status.issuesTip'))}">${icon('list')}<span>${escapeHtml(t('status.issues', state.counts))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  const onStart = state.showStart || !state.doc;
  // The start page needs no side panels or bottom panel: the cards use the whole window.
  root.classList.toggle('on-start', onStart);
  root.classList.toggle('no-bottom', !state.settings.showBottomPanel);
  root.style.setProperty('--bottom-height', `${state.settings.bottomHeight}px`);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart;
  root.querySelector('#workspace').hidden = onStart;
  renderWorkspace();
  if (onStart) renderStartPage(); else { startCards?.destroy(); startCards = null; startHost.innerHTML = ''; }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  if (!host || host.hidden) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: state.settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  for (const holder of host.querySelectorAll('.start-speed')) syncSliderSteps(holder);
  const canvas = host.querySelector('.start-bg');
  // drawn again (another setting changed): the scene carries on where it was instead of starting over
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation, vivid: true });
  if (carry && carry.kind === startBackground.kind) startBackground.time = carry.time;
  if (state.settings.backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  state.showStart = show && true;
  if (!state.doc) state.showStart = true;
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'new-project': return newProjectAsk('kanban');
    case 'template': return newProjectAsk(value);
    case 'sample': return openSampleAsk(value);
    case 'open': return openMenu(anchorBelow(target));
    case 'database': return run('database');
    case 'import': return importDialog();
    case 'retry-core': return connectCore();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'continue': return value ? openRecent(value) : openMenu(anchorBelow(target));
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'tutorial': return startTutorial();
    case 'guide': return openDocWindow('guide');
    case 'tutorial-doc': return openDocWindow('tutorial');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

// ───────────────────────── background (animated / image)

let appBackground = null;
let startBackground = null;

function backgroundColors() {
  const theme = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme);
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}

function updateBackgroundState() {
  const s = state.settings;
  const layer = root.querySelector('.app-bg');
  if (!layer) return;
  if (!appBackground) appBackground = new AnimatedBackground(layer.querySelector('.anim-bg'), { colors: backgroundColors, speed: () => s.animationSpeed / 100, kind: s.animation });
  appBackground.speed = () => state.settings.animationSpeed / 100;
  appBackground.setKind(s.animation);
  startBackground?.setKind(s.animation);
  const showStart = state.showStart || !state.doc;
  // The board covers the window: the animated background runs only on the start page.
  layer.classList.toggle('animated', false);
  appBackground.stop();
  if (showStart && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}

let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !state.doc) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); }
}
function shuffleBackground() { const next = (startBackground ?? appBackground)?.shuffle() ?? ANIMATIONS[0]; updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(state.settings); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
  updateBackgroundState();
  if (state.showStart || !state.doc) renderStartPage();
}
async function chooseBackground() {
  try {
    if (desktop) { const path = await native.chooseImage(state.settings.lastDirectory); if (path) { const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' }); await loadBackground(); } }
    else { const [file] = await native.pickWithInput('image/*'); if (file) { await native.storeWebBackground(file); updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' }); await loadBackground(); } }
  } catch (error) { showError('error.background', error); }
}
async function removeBackground() { await native.clearBackground(); state.backgroundUrl = null; updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : 'none' }); }

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
  applySettings(previous);
}

function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    // The reason the core is not reachable, in the new language.
    if (state.core.cause) state.core.error = formatError(state.core.cause).message;
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
    const panel = root.querySelector('#right-panel');
    if (panel && !getView('detail')) panel.innerHTML = '';
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  renderAll();
  getView(doc()?.view ?? '')?.update?.(viewContext({ settingsChanged: true }));
  updateSide({ settingsChanged: true });
  updateMinimumWidth();
}

/** The toolbar's theme ▾: a drop-down menu like the others — follow the system, the custom theme, then every dark and
 * light theme side by side on the same level (each with its colour swatch, the current one ticked), edit custom, random. */
async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = state.settings.theme;
  const handlers = {};
  const item = (theme, glyph = null) => {
    const id = `custom:theme:${theme.id ?? theme}`;
    handlers[id] = () => updateSettings({ theme: theme.id ?? theme });
    return { id, label: themeName(theme.id ?? theme, lang()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) };
  };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    item(SYSTEM, 'monitor'),
    item(customTheme(state.settings.customTheme), 'palette'),
    { separator: true },
    // every theme at once: dark | light side by side, no submenus
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true },
    { id: 'custom:theme-edit', label: t('settings.editCustom'), icon: 'edit' },
    { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

/** The icon picker popup (ui/iconpicker.js) → an IconRef ('' = none, null = cancelled). */
async function pickIcon(value = '', { title = '', category = null } = {}) {
  const result = await popups.open('iconpicker', { value, title, category, recent: state.settings.recentIcons });
  if (!result || result.ref == null) return null;
  if (result.ref) updateSettings({ recentIcons: [result.ref, ...state.settings.recentIcons.filter((r) => r !== result.ref)].slice(0, 24) }, { quiet: true });
  return result.ref;
}

// ───────────────────────── progress popup (long work: create, import, export)

const progressJobs = [];
let progressSeq = 0;
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${Date.now().toString(36)}-${(progressSeq += 1)}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false };
  const job = { op, reopen: null };
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) signal.cancelled = true; }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  popups.on(`cancel:${op}`, () => { signal.cancelled = true; });
  try {
    return await task(op, (progress) => {
      last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    if (shown || (desktop && !popups.useFrames)) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, shown ? 700 : 0);
    }
  }
}

// ───────────────────────── recent boards and projects

function rememberRecent(d) {
  if (!d || d.demo) return;
  const kind = d.board ? 'board' : 'project';
  const entry = { path: recentPath(kind, d.board?.id ?? d.project.id, dbLabel()), title: d.board ? d.board.name : d.project.name, kind, project: d.project.name, icon: d.board?.icon || d.project.icon || '', db: dbLabel(), web: !desktop };
  state.recent = addRecent(loadRecent(globalThis.localStorage), entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (dbLabel()) {
    state.recentDirs = addRecent(loadRecentDirs(globalThis.localStorage), { path: `${state.core.info?.db?.type}:${dbLabel()}`, title: dbLabel() });
    storeRecentDirs(globalThis.localStorage, state.recentDirs);
  }
}

async function openRecent(path) {
  const target = parseRecentPath(path);
  if (!target) return null;
  if (target.db && dbLabel() && target.db !== dbLabel()) { notify('warning', t('recent.otherDb', { db: target.db })); return null; }
  const d = await openTarget(target.kind, target.id);
  if (!d) {
    const choice = await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage'), items: [path], buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.remove'), icon: 'trash', danger: true, primary: true }] });
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderStartPage(); }
  }
  return d;
}

function clearRecentAll() { state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); renderAll(); }

// ───────────────────────── confirmation & exit

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  // Every change is saved to the database as it is made: nothing to ask, unless a step is still running.
  if (!history.running) return true;
  const choice = await ask({ kind: 'exit', icon: 'hourglass', title: t('confirm.exitTitle'), message: t('confirm.exitBusy'), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'exit', label: t('action.exit'), icon: 'exit', danger: true, primary: true }] });
  return choice === 'exit';
}

// ───────────────────────── menus (popup windows)

const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => { if (!event.isTrusted) return; screenOffset.x = event.screenX - event.clientX; screenOffset.y = event.screenY - event.clientY; screenOffset.measured = true; }, { passive: true });
function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; estimateOffset(); return { x: screenOffset.x + x, y: screenOffset.y + y }; }
function anchorBelow(element) { const rect = element.getBoundingClientRect(); const point = toScreen(rect.left, rect.bottom + 2); return { ...point, flipY: toScreen(rect.left, rect.top - 2).y }; }
const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}

function withChildren(items, handlers, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || depth > 3) return item;
    if (item.children) return { ...item, children: withChildren(item.children, handlers, depth + 1) };
    const key = item.id.slice('submenu:'.length);
    const dynamic = state.dynamicMenus.get(key);
    if (dynamic) Object.assign(handlers, dynamic.handlers);
    const children = dynamic ? dynamic.items : SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, handlers, depth + 1) } : item;
  });
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'columns', title: 'MyBoard' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items, context.handlers);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    if (!SUBMENUS[key]) return undefined;
    const at = result.at ?? anchor;
    const where = { x: at.x, y: at.y, flipY: at.flipY ?? at.y };
    return showMenu(menuItems(SUBMENUS[key].items), where, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  if (kind === 'activity') {
    const e = state.activity[payload.index];
    const handlers = { 'custom:copy': () => native.clipboardWrite(e?.text ?? '').then(() => notify('success', t('notice.copiedText'))) };
    return showMenu([{ id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !e }, { separator: true }, ...menuItems(['clearActivity', 'refresh', '-', 'bottomPanel'])], anchor, 'context', { handlers, header: { icon: 'recent', title: t('bottom.activity') } });
  }
  if (kind === 'log') {
    const e = state.log[payload.index];
    const handlers = { 'custom:copy': () => native.clipboardWrite(logLine(e)).then(() => notify('success', t('notice.copiedText'))) };
    return showMenu([{ id: 'custom:copy', label: t('bottom.copy'), icon: 'copy', disabled: !e }, { separator: true }, ...menuItems(['copyMessages', 'clearMessages', '-', 'bottomPanel'])], anchor, 'context', { handlers, header: { icon: 'info', title: t('bottom.messages') } });
  }
  if (kind === 'bottom') return showMenu(menuItems(['showProblems', 'refreshProblems', '-', 'showActivity', 'showMessages', 'showInformation', '-', 'copyMessages', 'clearMessages', 'clearActivity', '-', 'bottomPanel']), anchor, 'context', { header: { icon: 'panelBottom', title: t('bottom.title') } });
  if (kind === 'project') {
    const p = state.projects.find((x) => x.id === payload.id) ?? (doc()?.project?.id === payload.id ? doc().project : null);
    const handlers = {
      'custom:open': () => openTarget('project', payload.id),
      'custom:backlog': () => openTarget('project', payload.id, { view: 'backlog' }),
      'custom:settings': () => openTarget('project', payload.id, { view: 'projectSettings' }),
      'custom:icon': async () => { const ref = await pickIcon(p?.icon ?? ''); if (ref != null && p && !doc()?.demo) await changeProjectIcon(p, ref); },
      'custom:copyKey': () => native.clipboardWrite(p?.key ?? '').then(() => notify('success', t('notice.copiedText'))),
      'custom:delete': () => deleteProjectAsk(payload.id),
    };
    return showMenu([
      { id: 'custom:open', label: t('nav.openProject'), icon: 'folderOpen' }, { id: 'custom:backlog', label: t('view.backlog'), icon: 'list' }, { id: 'custom:settings', label: t('view.projectSettings'), icon: 'folderSettings' },
      { separator: true }, { id: 'custom:icon', label: t('nav.changeIcon'), icon: 'iconInsert', disabled: !p || doc()?.demo }, { id: 'custom:copyKey', label: t('nav.copyKey'), icon: 'copy' },
      { separator: true }, ...menuItems(['newProject', 'exportProject', 'refresh']),
      { separator: true }, { id: 'custom:delete', label: t('action.deleteProject'), icon: 'trash', danger: true, disabled: !p || payload.id === 'demo' || !coreReady() },
    ], anchor, 'context', { handlers, header: { icon: 'folder', title: p ? `${p.name} (${p.key})` : t('panel.projects') } });
  }
  // The centre (backlog, reports, project settings … where nothing has a menu of its own): the view's commands.
  if (kind === 'workspace') {
    const view = doc()?.view ?? 'board';
    return showMenu(menuItems(['createIssue', 'addColumn', 'find', 'refresh', '-', 'view:board', 'view:backlog', 'view:reports', 'view:projectSettings', '-', 'leftPanel', 'rightPanel', 'bottomPanel']), anchor, 'context', { header: { icon: SIDE_GLYPHS[view] ?? 'columns', title: t(`view.${view}`) } });
  }
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('menu.view') } });
  if (kind === 'start') return showMenu(menuItems(['newProject', 'open', 'recent', '-', 'database', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', 'showInformation', 'reconnect', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['newProject', 'open', '-', 'undo', 'redo', '-', 'createIssue', 'refresh', '-', 'leftPanel', 'rightPanel', 'statusBar', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'columns', title: 'MyBoard' } });
}

/** Changes a project's icon in the database: one undo step. */
async function changeProjectIcon(p, ref) {
  const before = p.icon ?? '';
  const apply = async (value) => {
    const fresh = await client.project(p.id);
    const row = fresh?.project ?? fresh;
    const updated = await client.updateProject(p.id, { icon: value, rev: row?.rev });
    const next = updated?.project ?? updated ?? { ...row, icon: value };
    state.projects = state.projects.map((x) => (x.id === p.id ? { ...x, ...next } : x));
    if (doc()?.project?.id === p.id) state.doc = { ...state.doc, project: { ...state.doc.project, ...next } };
    renderLeft();
    renderTabs();
  };
  try {
    await apply(ref);
    history.record({ label: t('op.changeIcon'), undo: () => apply(before), redo: () => apply(ref) });
    logActivity({ kind: 'local', type: 'project.updated', text: t('op.changeIcon') });
  } catch (error) { showError('error.save', error, p.name); }
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const text = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, text ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const hasSel = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !hasSel }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !hasSel },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `myboard-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(state.settings.theme, prefersDark(), state.settings.customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let frame = popups.frames.get(key);
  if (!frame) { frame = document.createElement('div'); frame.className = `web-popup web-popup-doc web-popup-${key}`; frame.dataset.kind = key; frame.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`; document.body.append(frame); popups.frames.set(key, frame); }
  return frame;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

// ───────────────────────── drag & drop: .myboard / .json / .csv files import

function setDropActive(active) {
  if (state.dropActive === active) return;
  state.dropActive = active;
  root.classList.toggle('drop-active', active);
}

async function handleDroppedFiles(files) {
  for (const file of files) {
    if (!/\.(myboard|json|csv)$/i.test(file.name)) { notify('warning', t('drop.unsupported', { name: file.name })); continue; }
    await importText(file.name, await file.text());
  }
}

async function handleDroppedPaths(paths) {
  for (const path of paths) {
    if (!/\.(myboard|json|csv)$/i.test(path)) { notify('warning', t('drop.unsupported', { name: baseName(path) })); continue; }
    try { await importText(baseName(path), await native.readTextFile(path, '')); } catch (error) { showError('error.import', error, path); }
  }
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart || !state.doc);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const toolbarMore = target.closest('[data-toolbar-more]');
    if (toolbarMore) return showToolbarMore(toolbarMore);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchored = ['themeMenu', 'open', 'newFromTemplate', 'openSample'].includes(id);
      return run(id, { anchor: anchored ? anchorBelow(command.closest('.split-button') ?? command) : undefined });
    }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    const navToggle = target.closest('[data-nav-toggle]');
    if (navToggle) { const id = navToggle.dataset.navToggle; if (navToggle.getAttribute('aria-expanded') === 'true') { state.expanded.delete(id); state.collapsed.add(id); } else { state.collapsed.delete(id); state.expanded.add(id); } return renderLeft(); }
    const nav = target.closest('[data-nav-board], [data-nav-view], [data-nav-open-project]');
    if (nav) return onNav(nav);
    const bottomTab = target.closest('[data-bottom-tab]');
    if (bottomTab) { state.bottomTab = bottomTab.dataset.bottomTab; return renderBottom(); }
    const problemRow = target.closest('[data-problem]');
    if (problemRow) { const p = currentProblems()[Number(problemRow.dataset.problem)]; if (p?.issueId) return openIssue(p.issueId); if (p?.kind === 'messages') return showBottomTab('messages'); if (p?.kind === 'core') return connectCore(); return undefined; }
    const ghost = target.closest('[data-issue-ghost]');
    if (ghost) return openIssue(ghost.dataset.issueGhost);
    return undefined;
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('startOpacity' in target.dataset) return updateSettings({ startCardOpacity: Number(target.value) }, { quiet: true });
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(target.value) }, { quiet: true }); }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'sidebar-search') { state.sidebarQuery = target.value; clearTimeout(bindEvents.searchTimer); bindEvents.searchTimer = setTimeout(renderLeft, 120); }
    if ('startSpeed' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; state.settings.animationSpeed = Number(target.value); }
    if ('startOpacity' in target.dataset) { target.parentElement.querySelector('output').textContent = `${target.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${target.value}%`); }
  });

  // The start page's sliders: − / + beside them move one step (held down: again and again), as dragging would.
  const sliderStep = (button) => {
    const input = button.parentElement.querySelector('input[type="range"]');
    if (!input) return false;
    const before = input.value;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.sliderStep) * Number(input.step || 1))));
    if (input.value === before) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    syncSliderSteps(input.parentElement);
    return true;
  };
  root.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-slider-step]');
    if (!button || event.button !== 0 || button.disabled) return;
    event.preventDefault();
    if (!sliderStep(button)) return;
    let timer = setTimeout(function again() { if (sliderStep(button)) timer = setTimeout(again, 90); }, 420);
    const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true); };
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
  });
  root.addEventListener('input', (event) => { if (event.target.matches?.('.start-speed input[type="range"]')) syncSliderSteps(event.target.parentElement); });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    // A view that shows its own menu calls preventDefault (the board's cards and columns …); anything else gets the
    // app's menu below — never the browser's own (it has no icons and does not match the app).
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const activityRow = event.target.closest('[data-activity]');
    if (activityRow) return contextMenu(event, 'activity', { index: Number(activityRow.dataset.activity) });
    const logRow = event.target.closest('[data-log]');
    if (logRow) return contextMenu(event, 'log', { index: Number(logRow.dataset.log) });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    if (event.target.closest('#workspace')) return contextMenu(event, 'workspace');
    const projectNode = event.target.closest('[data-project-node]');
    if (projectNode) return contextMenu(event, 'project', { id: projectNode.dataset.projectNode });
    if (event.target.closest('#left-panel, #right-panel')) return contextMenu(event, 'panel');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(800, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) updateSettings({ [key]: state.settings[key] }, { quiet: true }); },
    });
  }));

  root.addEventListener('pointerdown', (event) => {
    const split = event.target.closest?.('#left-panel > .left-split');
    if (!split || event.button !== 0) return;
    event.preventDefault();
    const panel = split.parentElement;
    // From the height shown now (the section also grows into the room the tree leaves).
    const start = Math.round(panel.querySelector(':scope > .left-view')?.getBoundingClientRect().height ?? state.settings.leftViewHeight);
    const max = () => Math.max(SIDE_MIN, panel.getBoundingClientRect().height - TREE_MIN);
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.round(Math.max(SIDE_MIN, Math.min(max(), start - dy))); panel.style.setProperty('--left-view-height', `${h}px`); state.settings.leftViewHeight = h; },
      end: (e, moved) => { if (moved) updateSettings({ leftViewHeight: state.settings.leftViewHeight }, { quiet: true }); },
    });
  });
  root.addEventListener('dblclick', (event) => { if (event.target.closest?.('#left-panel > .left-split')) updateSettings({ leftViewHeight: SIDE_DEFAULT }); });

  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!state.settings.showBottomPanel) return;
    event.preventDefault();
    const start = state.settings.bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, start - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); },
      end: (e, moved) => { if (moved) updateSettings({ bottomHeight: state.settings.bottomHeight }, { quiet: true }); },
    });
  });

  root.querySelector('#menubar')?.addEventListener('mousedown', (event) => {
    if (!desktop || event.button !== 0 || !event.target.closest?.('[data-window-drag]')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow?.toggleMaximize().catch(() => {});
    else native.invoke('window_drag', {}).catch(() => {});
  });
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => appWindow?.startResizeDragging('SouthEast').catch(() => {}));
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) { state.recent = loadRecent(globalThis.localStorage); state.recentDirs = loadRecentDirs(globalThis.localStorage); if (state.showStart || !state.doc) renderStartPage(); }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => { event.preventDefault(); depth = 0; setDropActive(false); handleDroppedFiles([...(event.dataTransfer?.files ?? [])]); });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

/** Ctrl+key shortcuts: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'newProject'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveFile'], ['p', false, 'print'], ['w', false, 'closeProject'], ['i', false, 'import'], ['e', false, 'exportProject'], ['f', false, 'find'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['j', false, 'bottomPanel'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f5') { event.preventDefault(); run('refresh'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (!hasDoc()) return;
  if (key === 'c' && !event.shiftKey && !event.altKey) { event.preventDefault(); run('createIssue'); }
}

// ───────────────────────── popup actions

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  // The form popup's icon fields (ui/formpopup.js): the picker opens from here, the choice goes back to the form.
  // The print window asks for what to print (print/host.js): the project, the board, the reports, the issues.
  popups.on('print-content', async () => {
    try {
      const content = await gatherPrintContent({ api: client, project, board, t, language: lang });
      popups.post('print', { type: 'print-content', content });
    } catch (error) { showError('print.failed', error, project()?.name ?? ''); }
  });
  popups.on('form-pick-icon', async (data) => { const ref = await pickIcon(data.value ?? '', { title: data.title ?? '', category: data.category ?? null }); if (ref != null) popups.post('form', { type: 'form-icon', name: data.name, ref }); });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
  // Settings › Database switched or copied the database: everything is read again.
  popups.on('database-changed', async () => { await closeProject(); state.projects = []; state.boardsByProject.clear(); await connectCore(); });
}

// ───────────────────────── tutorial

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  state.tutorial = tutorial;
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

/** What the start page reads. */
const panelApi = {
  state, commands, commandTip, commandEnabled, t, coreReady,
  settings: () => state.settings,
  version: () => state.info?.version ?? VERSION,
};

/** What the tutorial, the views and tests use. */
const appApi = {
  state, t, run, commands, popups, notify, showError, showStartPage, updateSettings, renderAll, ask, history, api: client,
  live: () => live, settings: () => state.settings, project, board, anchorBelow, openMenubarMenu,
  // Views' context menus: showMenu(items, anchor, name, { handlers, header }); anchorAt(clientX, clientY) → a menu anchor.
  showMenu, anchorAt: (x, y) => { const point = toScreen(x, y); return { x: point.x + 1, y: point.y + 1, flipY: point.y }; }, openDocWindow, closeDocFrames,
  closeProject, openTarget, setView, openIssue, pickIcon, withProgress, logActivity, registerView, version: () => state.info?.version ?? VERSION,
  // A view's sidebar changed what its subtitle says (the left panel's lower section).
  renderSideHeader,
  // The tutorial keeps the user's workspace: it swaps in its own and puts the user's back afterwards.
  takeDoc: () => state.doc, putDoc: (d) => { if (d) setDoc(d); else closeProject(); },
  openTemplate: (id) => openDemo(id),
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  const welcomeLikely = desktop && state.settings.showWelcome && state.settings.showStartPage !== false && !globalThis.__MYBOARD_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  state.instance = await native.instanceInfo().catch(() => ({ first: true, others: 0 }));
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  document.title = `MyBoard v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  state.showStart = true;
  applySettings({});
  await loadBackground();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; live.close(); await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
    native.listen('core-exited', (info) => { state.core = { status: 'error', info: null, error: info?.message ?? t('core.exited') }; renderAll(); });
  }

  trackMaximized();
  // The window shows now with the start page; the core may still be starting (desktop: core.rs, in the background).
  if (desktop) await appWindow.show();
  await connectCore({ quiet: true });
  if (!(await openIssueLink())) await restoreSession();
  window.addEventListener('hashchange', () => { if (hashIssueKey()) openIssueLink(); });
  for (const path of await native.startupFiles().catch(() => [])) await handleDroppedPaths([path]);
  if (!state.doc) state.showStart = true;
  renderAll();
  // The welcome popup belongs to the start page: not when the app opens straight into a board.
  const welcome = state.settings.showWelcome && state.showStart && !globalThis.__MYBOARD_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome();
  else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  }
}

async function openWelcome() {
  updateSettings({ tutorialOffered: true }, { quiet: true });
  const result = await popups.open('welcome', {});
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') openSampleAsk('shop');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__myboard = {
  state, t, commands, popups, run, history, api: client,
  live: () => live,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  app: appApi,
  renderSideHeader,
  actions: { deleteProjectAsk, connectCore, openTarget, openDemo, setView, closeProject, showStartPage, updateSettings, newProjectAsk, openSampleAsk, importText, exportProject, pickIcon, openIssue, undo, redo, withProgress, refreshProjects },
  domain: { TEMPLATES, SAMPLES, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
  startBackground: () => startBackground,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
