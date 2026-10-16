// Main window: menu bar, toolbar, plan tabs, tool panel (left), the current
// view (Gantt chart, sheets, network diagram, calendar, timeline, usage,
// resource graph, team planner, reports), properties panel (right), status bar.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import * as P from './domain/project.js';
import { PlanDocument } from './domain/document.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isCsvFileName, isImageFileName, isPlanFileName, isTemplateFileName, isXmlFileName, parsePlan, serialize, stripExtension, withExtension,
} from './domain/format.js';
import { exportCsv, exportMspdi, importCsv, importMspdi, tasksFromText, tasksToTsv } from './domain/interop.js';
import { buildSample, buildTemplate, TEMPLATES } from './domain/templates.js';
import { FILTERS, GROUPS, rowsFor, SORTS } from './domain/filters.js';
import { RESOURCE_FIELD_MAP, RESOURCE_TABLES, TASK_FIELD_MAP, TASK_TABLES } from './domain/fields.js';
import { levelResources } from './domain/schedule.js';
import { clearBaseline, leafIds, markOnTrack, setBaseline, setPercentComplete, updateProgress, updateProjectThrough, rescheduleUncompleted, copyBaseline } from './domain/tracking.js';
import { insertRecurring } from './domain/recurring.js';
import { addRecent, loadRecent, loadRecentDirs, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  loadSettings, PANEL_MIN, PRINT_KEY, RECENT_DIRS_KEY, RECENT_KEY, SESSION_KEY, STORAGE_KEY, storeSettings, timescaleStep, TIMESCALE, VIEWS, ZOOM,
  dbConfig, dbDescribe, dbProblems, ANIMATIONS,
} from './domain/settings.js';
import { compactDuration, formatDuration, formatLag, formatMoney, parseDuration } from './domain/duration.js';
import { dayOf, dayStart, formatDay, fromMin, nowMin, parseDay, toMin } from './domain/time.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { GanttView } from './views/gantt.js';
import { TaskSheetView, ResourceSheetView } from './views/sheet.js';
import { UsageView } from './views/usage.js';
import { NetworkView } from './views/network.js';
import { CalendarView } from './views/calendar-view.js';
import { TimelineView } from './views/timeline.js';
import { ResourceGraphView } from './views/resource-graph.js';
import { TeamPlannerView } from './views/team-planner.js';
import { REPORTS, ReportsView, reportModel } from './views/reports.js';
import { bytesToBase64, reportFileName, reportToDocx, reportToHtml, reportToMarkdown } from './export/report-export.js';
import { chartPngs, reportToPdf } from './export/report-pdf.js';
import { CONTENTS, renderPrintSvg } from './print/render.js';
import { criticalPath } from './domain/critical.js';
import { encodeBmp, encodeTiff, imageFormat, rasterSize } from './export/image-encode.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  recentDirs: loadRecentDirs(globalThis.localStorage),
  samples: [],
  docs: [],
  active: null,
  selection: { kind: null, ids: [], link: null, anchor: null },
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  untitled: 0,
  dropActive: false,
  minWidth: 0,
  clipboard: null,
  showStart: false,
  view: null,
  viewId: null,
  columnWidths: {},
  fonts: null,
};
try { state.columnWidths = JSON.parse(globalThis.localStorage?.getItem('myworkplan.columns.v1') ?? '{}') ?? {}; } catch { state.columnWidths = {}; }

const activeDoc = () => state.docs.find((doc) => doc.id === state.active) ?? null;
const docName = (doc) => (doc.path ? baseName(doc.path) : doc.name ?? doc.project.title);

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, text) {
  state.notice = { kind, text, at: Date.now() };
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  if (error instanceof FormatError || (error?.code && /^(format|calendar)\./.test(error.code))) return { message: t(error.code), detail: [error.detail, error.message !== error.code ? error.message : ''].filter(Boolean).join('\n') };
  const text = native.errorText(error);
  if (/^[a-z]+\.[a-zA-Z.]+$/.test(text) && t(text) !== text) return { message: t(text), detail: '' };
  return { message: text, detail: error?.stack && !String(error.stack).startsWith(text) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}

/** Shows an error in its own popup (details can be copied) and in the status bar. */
function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`);
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey),
    message,
    detail: detail ?? '',
    context,
    time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyWorkPlan ${VERSION}`,
  });
}

window.addEventListener('error', (event) => showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── documents

function untitledName() {
  state.untitled += 1;
  return t('tabs.untitled', { n: state.untitled });
}

function applyGlobalDefaults(project) {
  const s = state.settings;
  project.options = { ...project.options, hoursPerDay: s.hoursPerDay, hoursPerWeek: s.hoursPerWeek, daysPerMonth: s.daysPerMonth, defaultTaskMode: s.defaultTaskMode };
  return project;
}

function addDocument(doc) {
  doc.view.id = state.settings.defaultView;
  state.docs.push(doc);
  activate(doc.id);
  persistSession();
  return doc;
}

function newPlan(templateId = 'blank') {
  const name = untitledName();
  const project = templateId === 'blank'
    ? applyGlobalDefaults(P.createProject({ title: name, language: getLanguage(), calendarNames: calendarNames() }))
    : buildTemplate(templateId, { language: getLanguage() });
  const doc = addDocument(new PlanDocument(project, { name: templateId === 'blank' ? name : project.title, template: templateId !== 'blank' }));
  if (templateId !== 'blank') doc.markSaved(null);
  notify('success', t(templateId === 'blank' ? 'notice.newPlan' : 'notice.fromTemplate', { name: project.title }));
  return doc;
}

function openSampleBuiltin() {
  const project = buildSample(getLanguage());
  const doc = addDocument(new PlanDocument(project, { name: project.title }));
  doc.markSaved(null);
  return doc;
}

const calendarNames = () => ({ standard: t('calendar.standard'), allDay: t('calendar.allDay'), night: t('calendar.night') });

function activate(id) {
  state.active = id;
  state.selection = { kind: null, ids: [], link: null, anchor: null };
  state.showStart = false;
  state.reader = null;
  mountView();
  renderAll();
}

function activateDoc(id) {
  if (state.active === id && !state.showStart) return;
  activate(id);
  scrollActiveTabIntoView();
}

/** Applies a change to the active plan as one undo step and redraws. */
function change(labelKey, mutate, { right = true } = {}) {
  const doc = activeDoc();
  if (!doc) return undefined;
  const result = doc.apply(t(labelKey), mutate);
  state.rows = null;
  pruneSelection();
  updateView();
  renderTabs();
  renderStatus();
  renderToolbarState();
  if (right) renderRight();
  return result;
}

function persistSession() {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify({ files: state.docs.filter((doc) => doc.path).map((doc) => doc.path) }));
  } catch { /* ignore */ }
}

// ───────────────────────── rows, fields, selection

function taskRows() {
  const doc = activeDoc();
  if (!doc) return [];
  if (state.rows && state.rowsFor === doc && state.rowsSched === doc.sched) return state.rows;
  const rows = rowsFor(doc.project, doc.sched, { ...doc.view, text: doc.view.text ?? '' }).map((row) => (row.group ? row : { ...row, id: row.task.id, item: row.task, number: row.info?.row }));
  state.rows = rows;
  state.rowsFor = doc;
  state.rowsSched = doc.sched;
  return rows;
}

function invalidateRows() {
  state.rows = null;
}

function fieldCtx() {
  const doc = activeDoc();
  return {
    project: doc?.project, sched: doc?.sched, language: getLanguage(), dateFormat: state.settings.dateFormat, showTime: state.settings.showTime, t, toMin,
  };
}

const selectedTasks = () => (state.selection.kind === 'task' ? state.selection.ids : []);
const selectedResources = () => (state.selection.kind === 'resource' ? state.selection.ids : []);
const isSelected = (id) => state.selection.kind === 'task' && state.selection.ids.includes(id);
const isResourceSelected = (id) => state.selection.kind === 'resource' && state.selection.ids.includes(id);
const isLinkSelected = (from, to) => state.selection.kind === 'link' && state.selection.link?.from === from && state.selection.link?.to === to;

function select(kind, ids, { anchor = null } = {}) {
  state.selection = { kind: ids.length || kind === 'link' ? kind : null, ids, link: null, anchor: anchor ?? ids[ids.length - 1] ?? null };
  selectionChanged();
}

function selectionChanged() {
  state.view?.selectionChanged?.();
  renderRight();
  renderStatus();
  renderToolbarState();
}

/** Click / Ctrl+click / Shift+click on a task. */
function selectTask(id, event = {}) {
  const ids = state.selection.kind === 'task' ? state.selection.ids : [];
  if (event.ctrlKey || event.metaKey) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    select('task', next, { anchor: id });
  } else if (event.shiftKey && state.selection.anchor) {
    const rows = taskRows().filter((row) => row.task);
    const a = rows.findIndex((row) => row.id === state.selection.anchor);
    const b = rows.findIndex((row) => row.id === id);
    if (a >= 0 && b >= 0) {
      const [from, to] = a < b ? [a, b] : [b, a];
      state.selection = { kind: 'task', ids: rows.slice(from, to + 1).map((row) => row.id), link: null, anchor: state.selection.anchor };
      selectionChanged();
    } else select('task', [id]);
  } else if (!(ids.length === 1 && ids[0] === id)) select('task', [id]);
}

function selectResource(id, event = {}) {
  const ids = selectedResources();
  if (event.ctrlKey || event.metaKey) select('resource', ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  else if (event.shiftKey && state.selection.anchor) {
    const list = activeDoc().project.resources;
    const a = list.findIndex((r) => r.id === state.selection.anchor);
    const b = list.findIndex((r) => r.id === id);
    const [from, to] = a < b ? [a, b] : [b, a];
    state.selection = { kind: 'resource', ids: list.slice(from, to + 1).map((r) => r.id), link: null, anchor: state.selection.anchor };
    selectionChanged();
  } else select('resource', [id]);
}

function selectLink(from, to) {
  state.selection = { kind: 'link', ids: [], link: { from, to }, anchor: null };
  selectionChanged();
}

function clearSelection() {
  if (state.selection.kind) select(null, []);
}

function pruneSelection() {
  const project = activeDoc()?.project;
  if (!project) return;
  if (state.selection.kind === 'task') state.selection.ids = state.selection.ids.filter((id) => P.findTask(project, id));
  if (state.selection.kind === 'resource') state.selection.ids = state.selection.ids.filter((id) => P.findResource(project, id));
  if (state.selection.kind === 'link') {
    const to = P.findTask(project, state.selection.link?.to);
    if (!to?.predecessors.some((link) => link.taskId === state.selection.link.from)) state.selection = { kind: null, ids: [], link: null, anchor: null };
  }
  if (!state.selection.ids.length && state.selection.kind !== 'link') state.selection.kind = null;
}

// ───────────────────────── task operations

/** Row index (in project.tasks) where new tasks go: above the selected task, or at the end. */
function insertIndex() {
  const project = activeDoc().project;
  const id = selectedTasks()[0];
  return id ? P.taskIndex(project, id) : project.tasks.length;
}

function insertTask(data = {}, { edit = true } = {}) {
  if (!activeDoc()) newPlan();
  ensureTaskView();
  const index = data.index ?? insertIndex();
  const task = change('op.insertTask', (project) => P.insertTask(project, index, { name: data.name ?? t('task.newName'), ...data, index: undefined }));
  select('task', [task.id]);
  state.view?.scrollToTask?.(task.id);
  if (edit) editNameSoon(task.id);
  return task;
}

function editNameSoon(id) {
  setTimeout(() => {
    const grid = state.view?.grid;
    if (!grid || state.view instanceof ResourceSheetView) return;
    const index = grid.list.findIndex((row) => row.id === id);
    if (index >= 0) grid.startEdit(index, 'name');
  }, 30);
}

function insertSummary() {
  const ids = selectedTasks();
  if (!activeDoc()) newPlan();
  ensureTaskView();
  if (!ids.length) return insertTask({ name: t('task.newSummary') });
  // "Insert summary task": a new summary above the selected tasks, which move under it.
  const project = activeDoc().project;
  const roots = P.topmost(project, ids);
  const first = P.taskIndex(project, roots[0]);
  const level = project.tasks[first].outlineLevel;
  const summary = change('op.insertSummary', (draft) => {
    const created = P.insertTask(draft, first, { name: t('task.newSummary'), outlineLevel: level });
    for (const id of roots) {
      const [start, end] = P.subtreeRange(draft, id);
      for (let i = start; i < end; i++) draft.tasks[i].outlineLevel += 1;
    }
    P.fixOutline(draft);
    return created;
  });
  select('task', [summary.id]);
  editNameSoon(summary.id);
  return summary;
}

function insertMilestone() {
  return insertTask({ name: t('task.newMilestone'), milestone: true, duration: 0, estimated: false });
}

async function deleteSelection() {
  const doc = activeDoc();
  if (!doc) return;
  if (state.selection.kind === 'link') {
    const { from, to } = state.selection.link;
    change('op.unlink', (project) => P.unlinkTasks(project, from, to));
    notify('success', t('notice.linkDeleted'));
    return;
  }
  if (state.selection.kind === 'resource') {
    const ids = selectedResources();
    if (state.settings.confirmDelete && !(await confirmDelete(ids.map((id) => P.findResource(doc.project, id)?.name ?? ''), 'resource'))) return;
    change('op.deleteResources', (project) => P.deleteResources(project, ids));
    notify('success', t('notice.deletedResources', { count: ids.length }));
    return;
  }
  const ids = selectedTasks();
  if (!ids.length) return;
  const names = ids.map((id) => P.findTask(doc.project, id)?.name ?? '');
  if (state.settings.confirmDelete && !(await confirmDelete(names, 'task'))) return;
  const rows = taskRows();
  const nextIndex = rows.findIndex((row) => row.id === ids[0]);
  const count = change('op.deleteTasks', (project) => P.deleteTasks(project, ids));
  const next = taskRows()[Math.min(nextIndex, taskRows().length - 1)];
  select(next?.task ? 'task' : null, next?.task ? [next.id] : []);
  notify('success', t('notice.deletedTasks', { count }));
}

async function confirmDelete(names, kind) {
  const choice = await ask({
    icon: 'trash', title: t(kind === 'task' ? 'confirm.deleteTasksTitle' : 'confirm.deleteResourcesTitle'),
    message: t(kind === 'task' ? 'confirm.deleteTasks' : 'confirm.deleteResources', { count: names.length }), items: names,
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('confirm.delete'), icon: 'trash', danger: true, primary: true }],
  });
  return choice === 'delete';
}

function linkSelected() {
  const ids = selectedTasks();
  if (ids.length < 2) return notify('info', t('notice.selectTwo'));
  const made = change('op.link', (project) => P.linkSequence(project, ids));
  notify(made ? 'success' : 'error', made ? t('notice.linked', { count: made }) : t('notice.linkRefused'));
  return made;
}

function linkFromTo(from, to, type = 'FS') {
  const project = activeDoc().project;
  if (P.wouldCycle(project, from, to)) return notify('error', t('notice.linkRefused'));
  change('op.link', (draft) => P.linkTasks(draft, from, to, type));
  notify('success', t('notice.linkedPair', { from: P.rowOf(project, from), to: P.rowOf(project, to) }));
  return true;
}

function unlinkSelected() {
  const ids = selectedTasks();
  const removed = change('op.unlink', (project) => P.unlinkAll(project, ids));
  notify('success', t('notice.unlinked', { count: removed }));
}

function moveTaskBar(id, start) {
  const task = P.findTask(activeDoc().project, id);
  const info = activeDoc().sched.info(id);
  if (!task || !info || start === info.start) return;
  change('op.moveTask', (project) => {
    const target = P.findTask(project, id);
    if (target.manual) {
      const length = info.finish - info.start;
      target.start = fromMin(start);
      target.finish = fromMin(start + length);
    } else {
      target.constraint = { type: 'SNET', date: fromMin(start) };
      target.levelingDelay = 0;
    }
  });
  notify('info', t('notice.moved', { name: task.name, date: formatDay(activeDoc().sched.info(id).start, state.settings.dateFormat) }));
}

function resizeTaskBar(id, finish) {
  const doc = activeDoc();
  const task = P.findTask(doc.project, id);
  const info = doc.sched.info(id);
  if (!task || !info || finish <= info.start) return;
  const minutes = doc.sched.calendarFor(task).between(info.start, finish);
  change('op.duration', (project) => {
    if (task.manual) P.findTask(project, id).finish = fromMin(finish);
    else P.setTaskDuration(project, id, Math.max(0, minutes), task.durationUnit);
  });
}

function setProgress(ids, percent) {
  const doc = activeDoc();
  const targets = ids ?? selectedTasks();
  if (!doc || !targets.length) return;
  change('op.progress', (project) => setPercentComplete(project, doc.sched, targets, percent));
  notify('success', t('notice.progress', { count: leafIds(doc.project, targets).length, percent }));
}

function indentSelected(direction) {
  const ids = selectedTasks();
  const count = change(direction > 0 ? 'op.indent' : 'op.outdent', (project) => (direction > 0 ? P.indentTasks(project, ids) : P.outdentTasks(project, ids)));
  if (!count) notify('info', t(direction > 0 ? 'notice.cannotIndent' : 'notice.cannotOutdent'));
}

function moveSelected(direction) {
  const ids = selectedTasks();
  const count = change('op.moveRows', (project) => P.moveTasks(project, ids, direction));
  if (count) state.view?.scrollToTask?.(ids[0]);
}

function toggleCollapse(id, collapsed = null) {
  const doc = activeDoc();
  const task = P.findTask(doc.project, id);
  if (!task || !doc.sched.info(id)?.summary) return;
  // Collapsing is a view change: not an undo step and not a modification worth asking about.
  task.collapsed = collapsed ?? !task.collapsed;
  doc.touch();
  invalidateRows();
  updateView();
}

function setOutlineLevel(level) {
  const doc = activeDoc();
  for (const task of doc.project.tasks) if (doc.sched.info(task.id)?.summary) task.collapsed = level != null && task.outlineLevel >= level;
  doc.touch();
  invalidateRows();
  updateView();
}

function toggleField(key, ids = selectedTasks()) {
  const doc = activeDoc();
  if (!ids.length) return;
  const on = !ids.every((id) => P.findTask(doc.project, id)?.[key]);
  change(`op.${key}`, (project) => ids.forEach((id) => { const task = P.findTask(project, id); if (task) task[key] = on; }));
}

function setMode(manual) {
  const ids = selectedTasks();
  const doc = activeDoc();
  change('op.mode', (project) => ids.forEach((id) => {
    const task = P.findTask(project, id);
    const info = doc.sched.info(id);
    if (!task || info?.summary) return;
    if (manual && !task.manual) Object.assign(task, { manual: true, start: fromMin(info.start), finish: fromMin(info.finish) });
    if (!manual) task.manual = false;
  }));
}

function toggleInactive() {
  const ids = selectedTasks();
  const doc = activeDoc();
  const active = ids.some((id) => P.findTask(doc.project, id)?.active === false);
  change('op.inactive', (project) => ids.forEach((id) => { const task = P.findTask(project, id); if (task) task.active = active; }));
}

function editTaskField(row, field, value) {
  try {
    change(`field.${field.id}`, () => field.set({ ...fieldCtx() }, row.item, value));
  } catch (error) {
    showError('error.input', error, t(`field.${field.id}`));
  }
}

function editResourceField(row, field, value) {
  try {
    change(`field.${field.id}`, () => field.set({ ...fieldCtx() }, row.item, value));
  } catch (error) {
    showError('error.input', error, t(`field.${field.id}`));
  }
}

function createTaskFromRow(field, value) {
  const doc = activeDoc();
  const task = change('op.insertTask', (project) => P.insertTask(project, project.tasks.length, { name: String(value).trim() }));
  select('task', [task.id]);
  setTimeout(() => {
    const grid = state.view?.grid;
    if (grid) grid.setActive(grid.list.length, 'name');
  }, 0);
  void doc;
}

function createResourceFromRow(field, value) {
  const resource = change('op.addResource', (project) => P.addResource(project, { name: String(value).trim() }));
  select('resource', [resource.id]);
}

function addResource() {
  if (!activeDoc()) newPlan();
  if (!['resourceSheet', 'resourceUsage', 'teamPlanner', 'resourceGraph'].includes(activeDoc().view.id)) switchView('resourceSheet');
  const project = activeDoc().project;
  const resource = change('op.addResource', (draft) => P.addResource(draft, { name: t('resource.newName', { n: project.resources.length + 1 }) }));
  select('resource', [resource.id]);
  setTimeout(() => {
    const grid = state.view?.grid;
    const index = grid?.list.findIndex((row) => row.id === resource.id);
    if (grid && index >= 0) grid.startEdit(index, 'name');
  }, 30);
}

function reassignTask(taskId, fromResource, toResource) {
  change('op.assign', (project) => {
    let units = 1;
    if (fromResource) {
      units = project.assignments.find((a) => a.taskId === taskId && a.resourceId === fromResource)?.units ?? 1;
      P.unassignResource(project, taskId, fromResource);
    }
    if (toResource) P.assignResource(project, taskId, toResource, units);
  });
  const project = activeDoc().project;
  notify('success', t('notice.reassigned', { task: P.findTask(project, taskId)?.name ?? '', resource: toResource ? P.findResource(project, toResource)?.name : t('team.unassigned') }));
}

function fillDown() {
  const ids = selectedTasks();
  const grid = state.view?.grid;
  const fieldId = grid?.active.field;
  const field = TASK_FIELD_MAP.get(fieldId);
  if (ids.length < 2 || !field?.set) return notify('info', t('notice.fillDown'));
  const doc = activeDoc();
  const first = P.findTask(doc.project, ids[0]);
  const ctx = fieldCtx();
  const raw = field.get(ctx, first, doc.sched.info(first.id));
  const text = ['select', 'bool'].includes(field.kind) ? raw : field.text ? field.text(ctx, raw, first, doc.sched.info(first.id)) : String(raw ?? '');
  try {
    change('op.fillDown', (project) => ids.slice(1).forEach((id) => field.set({ ...ctx, project }, P.findTask(project, id), text)));
  } catch (error) {
    showError('error.input', error, t(`field.${field.id}`));
  }
}

// ───────────────────────── clipboard

const CLIP_MARK = 'myworkplan/tasks';

async function copySelection({ cut = false } = {}) {
  const doc = activeDoc();
  if (!doc) return;
  let text;
  if (state.selection.kind === 'resource') {
    const resources = selectedResources().map((id) => P.findResource(doc.project, id)).filter(Boolean);
    text = resources.map((r) => [r.name, r.type, r.initials, r.group, r.stdRate].join('\t')).join('\n');
    state.clipboard = { kind: 'resources', text, resources: JSON.parse(JSON.stringify(resources)) };
  } else {
    const ids = selectedTasks();
    if (!ids.length) return;
    const copied = P.copyTasks(doc.project, ids);
    text = tasksToTsv(doc.project, doc.sched, copied.tasks.map((task) => task.id));
    state.clipboard = { kind: 'tasks', text, copied, mark: CLIP_MARK };
  }
  try {
    await native.clipboardWrite(text);
  } catch (error) {
    showError('error.clipboard', error);
  }
  if (cut) {
    if (state.selection.kind === 'resource') change('op.cut', (project) => P.deleteResources(project, selectedResources()));
    else change('op.cut', (project) => P.deleteTasks(project, selectedTasks()));
    clearSelection();
  }
  notify('success', t(cut ? 'notice.cut' : 'notice.copied', { count: state.clipboard.kind === 'resources' ? state.clipboard.resources.length : state.clipboard.copied.tasks.length }));
}

async function pasteClipboard() {
  if (!activeDoc()) newPlan();
  const doc = activeDoc();
  let text = '';
  try { text = await native.clipboardRead(); } catch { text = state.clipboard?.text ?? ''; }
  const own = state.clipboard && (state.clipboard.text === text || !text);
  if (own && state.clipboard.kind === 'resources') {
    const added = change('op.paste', (project) => state.clipboard.resources.map((r) => P.addResource(project, { ...r, id: undefined })));
    select('resource', added.map((r) => r.id));
    return notify('success', t('notice.pasted', { count: added.length }));
  }
  if (['resourceSheet', 'resourceUsage', 'teamPlanner', 'resourceGraph'].includes(doc.view.id) && !own) {
    const names = String(text).split(/\r?\n/).map((line) => line.split('\t')[0].trim()).filter(Boolean);
    const added = change('op.paste', (project) => names.map((name) => P.addResource(project, { name })));
    select('resource', added.map((r) => r.id));
    return notify('success', t('notice.pasted', { count: added.length }));
  }
  const index = insertIndex();
  let ids;
  if (own && state.clipboard.kind === 'tasks') {
    ids = change('op.paste', (project) => P.pasteTasks(project, state.clipboard.copied, index));
  } else {
    const items = tasksFromText(text, doc.project.options);
    if (!items.length) return notify('info', t('notice.clipboardEmpty'));
    ids = change('op.paste', (project) => P.pasteTasks(project, { tasks: items.map((item) => P.createTask(project, { ...item, estimated: item.duration == null })), assignments: [] }, index));
  }
  ensureTaskView();
  select('task', ids);
  state.view?.scrollToTask?.(ids[0]);
  return notify('success', t('notice.pasted', { count: ids.length }));
}

// ───────────────────────── views

function ensureTaskView() {
  const doc = activeDoc();
  if (doc && ['resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'].includes(doc.view.id)) switchView('gantt');
}

function switchView(id) {
  const doc = activeDoc();
  if (!doc) return;
  if (!VIEWS.includes(id)) return;
  state.showStart = false;
  state.reader = null;
  doc.view.id = id;
  doc.view.scrollTop = 0;
  if (['resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner'].includes(id) && state.selection.kind === 'task') state.selection = { kind: null, ids: [], link: null, anchor: null };
  mountView();
  renderAll();
  notify('info', t('notice.view', { name: t(`view.${id}`) }));
}

function mountView() {
  state.view?.destroy?.();
  state.view = null;
  const host = root.querySelector('#view-host');
  if (!host) return;
  host.className = 'view-host';
  host.innerHTML = '';
  const doc = activeDoc();
  invalidateRows();
  if (!doc || state.showStart) return;
  const id = doc.view.id;
  state.viewId = id;
  const make = {
    gantt: () => new GanttView(appApi, host),
    tracking: () => new GanttView(appApi, host, { tracking: true }),
    taskSheet: () => new TaskSheetView(appApi, host),
    taskUsage: () => new UsageView(appApi, host, 'task'),
    network: () => new NetworkView(appApi, host),
    calendar: () => new CalendarView(appApi, host),
    timeline: () => new TimelineView(appApi, host),
    resourceSheet: () => new ResourceSheetView(appApi, host),
    resourceUsage: () => new UsageView(appApi, host, 'resource'),
    resourceGraph: () => new ResourceGraphView(appApi, host),
    teamPlanner: () => new TeamPlannerView(appApi, host),
    reports: () => new ReportsView(appApi, host),
  }[id] ?? (() => new GanttView(appApi, host));
  state.view = make();
}

function updateView() {
  invalidateRows();
  try {
    state.view?.update?.();
  } catch (error) {
    showError('error.view', error, state.viewId ?? '');
  }
}

function renderView() {
  invalidateRows();
  const host = root.querySelector('#view-host');
  const start = root.querySelector('#start-page');
  const reader = root.querySelector('#reader-page');
  const reading = Boolean(state.reader);
  const showStart = !reading && (state.showStart || !activeDoc());
  root.classList.toggle('on-start', showStart || reading);
  root.classList.toggle('on-reader', reading);
  start.hidden = !showStart;
  reader.hidden = !reading;
  host.hidden = showStart || reading;
  if (reading) {
    renderReader();
    return;
  }
  if (showStart) {
    renderStartPage();
    return;
  }
  try {
    state.view?.render?.();
  } catch (error) {
    showError('error.view', error, state.viewId ?? '');
  }
}

/** Table (column set) of the current task / resource sheet, with the user's added or removed columns. */
function currentColumns(kind) {
  const doc = activeDoc();
  const tableId = kind === 'resource' ? doc?.view.resourceTable ?? 'entry' : doc?.view.table ?? 'entry';
  const custom = state.settings[`columns:${kind}:${tableId}`];
  const base = (kind === 'resource' ? RESOURCE_TABLES : TASK_TABLES)[tableId] ?? (kind === 'resource' ? RESOURCE_TABLES.entry : TASK_TABLES.entry);
  return Array.isArray(custom) && custom.length ? custom : base;
}

function columnWidths(key) {
  state.columnWidths[key] ??= {};
  return state.columnWidths[key];
}

function saveColumnWidths() {
  try { globalThis.localStorage?.setItem('myworkplan.columns.v1', JSON.stringify(state.columnWidths)); } catch { /* ignore */ }
}

function indicatorsFor(row) {
  const { task, info } = row;
  if (!task || !info) return '';
  const out = [];
  if ((info.percentComplete ?? 0) >= 100) out.push(icon('check', 'icon ind ok'));
  if (task.notes) out.push(icon('notes', 'icon ind'));
  if (task.hyperlink) out.push(icon('hyperlink', 'icon ind'));
  if (!['ASAP', 'ALAP'].includes(task.constraint?.type ?? 'ASAP')) out.push(icon('constraint', 'icon ind'));
  if (info.missedDeadline) out.push(icon('deadline', 'icon ind bad'));
  if (info.overallocated && !info.summary) out.push(icon('overallocation', 'icon ind bad'));
  if (task.recurring) out.push(icon('recurring', 'icon ind'));
  if (task.manual) out.push(icon('manualMode', 'icon ind'));
  if (task.active === false) out.push(icon('inactive', 'icon ind'));
  if (info.late) out.push(icon('reportLate', 'icon ind bad'));
  return `<span class="indicators">${out.slice(0, 3).join('')}</span>`;
}

function indicatorTip(row) {
  const { task, info } = row;
  if (!task || !info) return '';
  const tips = [];
  if ((info.percentComplete ?? 0) >= 100) tips.push(t('ind.complete'));
  if (task.notes) tips.push(`${t('field.notes')}: ${task.notes.slice(0, 80)}`);
  if (task.hyperlink) tips.push(`${t('field.hyperlink')}: ${task.hyperlink}`);
  if (!['ASAP', 'ALAP'].includes(task.constraint?.type ?? 'ASAP')) tips.push(`${t(`constraint.${task.constraint.type}`)} ${formatDay(toMin(task.constraint.date), state.settings.dateFormat)}`);
  if (info.missedDeadline) tips.push(t('ind.deadline'));
  if (info.overallocated) tips.push(t('ind.overallocated'));
  if (task.recurring) tips.push(t('ind.recurring'));
  if (task.manual) tips.push(t('mode.manual'));
  if (task.active === false) tips.push(t('ind.inactive'));
  if (info.late) tips.push(t('ind.late'));
  return tips.join('\n');
}

function taskGridOptions(extra = {}) {
  const doc = () => activeDoc();
  return {
    kind: 'task',
    rows: () => taskRows(),
    fields: () => currentColumns('task').map((id) => TASK_FIELD_MAP.get(id)).filter(Boolean),
    ctx: () => fieldCtx(),
    rowHeight: () => rowHeight(),
    get widths() { return columnWidths(`task:${doc()?.view.table ?? 'entry'}`); },
    onWidth: () => saveColumnWidths(),
    selected: (row) => isSelected(row.id),
    onSelect: (row, event) => (row ? selectTask(row.id, event) : clearSelection()),
    onSelectAll: () => run('selectAll'),
    onEdit: (row, field, value) => editTaskField(row, field, value),
    onCreate: (field, value) => createTaskFromRow(field, value),
    onActivate: (row) => openTaskInfo(row.id),
    onContext: (event, row, field) => contextMenu(event, row ? 'taskRow' : 'taskEmpty', { id: row?.id ?? null, field }),
    onHeaderContext: (event, field) => contextMenu(event, 'header', { field: field?.id ?? null, kind: 'task' }),
    onToggle: (row) => toggleCollapse(row.id),
    onDragRows: (target, level) => {
      const ids = selectedTasks();
      const project = doc().project;
      const rows = taskRows();
      const targetTask = rows[target]?.task;
      const index = targetTask ? P.taskIndex(project, targetTask.id) : project.tasks.length;
      change('op.moveRows', (draft) => P.moveTasksTo(draft, ids, index, level));
    },
    groupLabel: (group) => groupLabel(group),
    indicators: (row) => indicatorsFor(row),
    indicatorTip: (row) => indicatorTip(row),
    nameCell: (row, text) => {
      const { task, info } = row;
      const level = task.outlineLevel ?? 1;
      const grouped = doc()?.view.group && doc().view.group !== 'none';
      const sorted = doc()?.view.sort && doc().view.sort !== 'id';
      const pad = grouped || sorted ? 0 : (level - 1) * 16;
      const toggle = info?.summary && !grouped && !sorted
        ? `<button class="outline-toggle" data-toggle title="${escapeHtml(t(task.collapsed ? 'grid.expand' : 'grid.collapse'))}" aria-label="${escapeHtml(t(task.collapsed ? 'grid.expand' : 'grid.collapse'))}">${task.collapsed ? icon('caretRight', 'icon tiny') : icon('caretDown', 'icon tiny')}</button>`
        : '<span class="outline-space"></span>';
      const glyph = info?.summary ? icon('summaryBar', 'icon tiny name-glyph') : task.milestone ? icon('milestone', 'icon tiny name-glyph') : '';
      return `<span class="outline" style="padding-left:${pad}px">${toggle}${glyph}<span class="${info?.summary ? 'summary-name' : ''} ${task.active === false ? 'inactive-name' : ''}">${escapeHtml(text)}</span></span>`;
    },
    rowClass: (row) => [row.info?.summary ? 'summary-row' : '', row.info?.critical && viewSettings().showCritical ? 'critical-row' : '', row.task?.active === false ? 'inactive-row' : '', row.task?.manual ? 'manual-row' : ''].join(' '),
    newRow: !doc()?.view.group || doc().view.group === 'none',
    ...extra,
  };
}

function resourceGridOptions() {
  return {
    kind: 'resource',
    rows: () => activeDoc().project.resources.map((resource, index) => ({ id: resource.id, item: resource, info: null, number: index + 1 })),
    fields: () => currentColumns('resource').map((id) => RESOURCE_FIELD_MAP.get(id)).filter(Boolean),
    ctx: () => fieldCtx(),
    rowHeight: () => rowHeight(),
    get widths() { return columnWidths(`resource:${activeDoc()?.view.resourceTable ?? 'entry'}`); },
    onWidth: () => saveColumnWidths(),
    selected: (row) => isResourceSelected(row.id),
    onSelect: (row, event) => (row ? selectResource(row.id, event) : clearSelection()),
    onSelectAll: () => select('resource', activeDoc().project.resources.map((r) => r.id)),
    onEdit: (row, field, value) => editResourceField(row, field, value),
    onCreate: (field, value) => createResourceFromRow(field, value),
    onActivate: (row) => openResourceInfo(row.id),
    onContext: (event, row) => contextMenu(event, row ? 'resourceRow' : 'resourceEmpty', { id: row?.id ?? null }),
    onHeaderContext: (event, field) => contextMenu(event, 'header', { field: field?.id ?? null, kind: 'resource' }),
    indicators: (row) => {
      const info = activeDoc().sched.resources.get(row.id);
      const out = [];
      if (info?.overallocated) out.push(icon('overallocation', 'icon ind bad'));
      if (row.item.notes) out.push(icon('notes', 'icon ind'));
      return `<span class="indicators">${out.join('')}</span>`;
    },
    indicatorTip: (row) => (activeDoc().sched.resources.get(row.id)?.overallocated ? t('ind.overallocatedResource') : ''),
    nameCell: (row, text) => `<span class="outline">${icon(row.item.type === 'material' ? 'layers' : row.item.type === 'cost' ? 'money' : 'user', 'icon tiny name-glyph')}<span class="${activeDoc().sched.resources.get(row.id)?.overallocated ? 'over-name' : ''}">${escapeHtml(text)}</span></span>`,
    rowClass: (row) => (activeDoc().sched.resources.get(row.id)?.overallocated ? 'overallocated-row' : ''),
    newRow: true,
  };
}

function groupLabel(group) {
  const key = group.key;
  const kind = group.kind;
  let label = key;
  if (kind === 'critical' || kind === 'milestones') label = t(key === 'yes' ? `group.${kind}.yes` : `group.${kind}.no`);
  else if (kind === 'priority') label = `${t('field.priority')} ${key}–${Number(key) + 99}`;
  else if (kind === 'resource') label = key || t('group.noResource');
  else if (kind === 'status') label = key ? t(`status.${key}`) : '—';
  else if (kind === 'duration') label = t(`group.duration.${key}`);
  else if (kind === 'complete') label = t(`group.complete.${key}`);
  else if (kind === 'constraint') label = t(`constraint.${key}`);
  else if (kind === 'mode') label = t(`mode.${key}`);
  const doc = activeDoc();
  const range = Number.isFinite(group.start) ? `${formatDay(group.start, state.settings.dateFormat)} – ${formatDay(group.finish, state.settings.dateFormat)}` : '';
  return `${icon('group', 'icon tiny')}<b>${escapeHtml(label)}</b><span class="muted">${escapeHtml(t('group.count', { count: group.count }))} · ${escapeHtml(range)} · ${escapeHtml(formatDuration(group.work, 'h', doc.project.options, getLanguage()))}</span>`;
}

const rowHeight = () => Math.round(state.settings.rowHeight * (state.settings.zoom / 100));

function durationText(info, task) {
  return formatDuration(info.duration ?? 0, info.summary ? 'd' : task.durationUnit ?? 'd', activeDoc().project.options, getLanguage());
}

function lagText(link) {
  return formatLag(link.lag, link.lagUnit, activeDoc().project.options);
}

function setTimescale(px) {
  const value = Math.max(TIMESCALE.min, Math.min(TIMESCALE.max, Math.round(px)));
  if (value === state.settings.timescale) return;
  updateSettings({ timescale: value });
}

/** Ctrl+wheel on a chart: the next zoom step, keeping the moment under the pointer in place. */
function stepTimescale(direction, clientX, view) {
  const next = timescaleStep(state.settings.timescale, direction);
  if (view?.zoomAround) view.zoomAround(clientX, next);
  else setTimescale(next);
}

function fitProject() {
  const doc = activeDoc();
  const view = state.view;
  if (!doc || !view?.chartBody) return setTimescale(TIMESCALE.steps[6]);
  const days = Math.max(1, (doc.sched.finish - doc.sched.start) / 1440 + 4);
  const px = Math.max(TIMESCALE.min, Math.min(TIMESCALE.max, (view.chartBody.clientWidth - 60) / days));
  doc.view.anchorMin = doc.sched.start - 1440;
  doc.view.anchorX = 10;
  doc.view.scrollLeft = null;
  updateSettings({ timescale: Math.round(px * 10) / 10 });
  return undefined;
}

function setTableWidth(width) {
  updateSettings({ tableWidth: Math.round(width) }, { quiet: true });
}

// ───────────────────────── commands

const hasDoc = () => Boolean(activeDoc());
const hasTasks = () => selectedTasks().length > 0;
const taskViewActive = () => hasDoc() && !state.showStart && !['resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner'].includes(activeDoc().view.id);
const viewIs = (...ids) => hasDoc() && !state.showStart && ids.includes(activeDoc().view.id);

const VIEW_ICONS = {
  gantt: 'viewGantt', tracking: 'viewTracking', taskSheet: 'viewSheet', taskUsage: 'viewTaskUsage', network: 'viewNetwork', calendar: 'viewCalendar',
  timeline: 'viewTimeline', resourceSheet: 'viewResourceSheet', resourceUsage: 'viewResourceUsage', resourceGraph: 'viewResourceGraph', teamPlanner: 'viewTeam', reports: 'viewReports',
};

const commands = {
  // file
  new: { icon: 'fileNew', label: 'action.new', key: 'Ctrl+N', run: () => newPlan() },
  open: { icon: 'folderOpen', label: 'action.open', key: 'Ctrl+O', run: () => openWithDialog() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart || !hasDoc(), run: () => showStartPage(!state.showStart || !hasDoc()) },
  save: { icon: 'save', label: 'action.save', key: 'Ctrl+S', enabled: hasDoc, run: () => saveDoc(activeDoc()) },
  saveAs: { icon: 'saveAs', label: 'action.saveAs', key: 'Ctrl+Shift+S', enabled: hasDoc, run: () => saveDoc(activeDoc(), { saveAs: true }) },
  saveAll: { icon: 'saveAll', label: 'action.saveAll', key: 'Ctrl+Alt+S', enabled: () => state.docs.some((doc) => doc.dirty), run: () => saveAll() },
  saveTemplate: { icon: 'template', label: 'action.saveTemplate', enabled: hasDoc, run: () => exportAs('mwpt') },
  dbSave: { icon: 'dbSave', label: 'action.dbSave', enabled: () => desktop && hasDoc(), run: () => saveToDatabase(activeDoc()) },
  dbOpen: { icon: 'dbOpen', label: 'action.dbOpen', enabled: () => desktop, run: () => openFromDatabase() },
  import: { icon: 'importFile', label: 'action.import', run: () => openWithDialog() },
  exportXml: { icon: 'xmlFile', label: 'action.exportXml', enabled: hasDoc, run: () => exportAs('xml') },
  exportCsv: { icon: 'csvFile', label: 'action.exportCsv', enabled: hasDoc, run: () => exportAs('csv') },
  exportImage: { icon: 'exportImage', label: 'action.exportImage', enabled: hasDoc, run: () => exportImage() },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  recentFolders: { icon: 'recentFolder', label: 'action.recentFolders', run: (context) => recentFoldersMenu(context?.anchor) },
  clearRecent: { icon: 'clearHistory', label: 'action.clearRecent', enabled: () => state.recent.length > 0 || state.recentDirs.length > 0, run: () => clearRecentAll() },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', enabled: hasDoc, run: () => openPrint() },
  closeTab: { icon: 'closeTab', label: 'action.closeTab', key: 'Ctrl+W', enabled: hasDoc, run: () => closeDoc(activeDoc()) },
  closeAll: { icon: 'closeAll', label: 'action.closeAll', enabled: () => state.docs.length > 0, run: () => closeAll() },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => Boolean(activeDoc()?.history.canUndo), run: () => undo() },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => Boolean(activeDoc()?.history.canRedo), run: () => redo() },
  cut: { icon: 'cut', label: 'action.cut', key: 'Ctrl+X', enabled: () => hasTasks() || selectedResources().length > 0, run: () => copySelection({ cut: true }) },
  copy: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', enabled: () => hasTasks() || selectedResources().length > 0, run: () => copySelection() },
  paste: { icon: 'paste', label: 'action.paste', key: 'Ctrl+V', run: () => pasteClipboard() },
  delete: { icon: 'trash', label: 'action.delete', key: 'Delete', enabled: () => hasTasks() || selectedResources().length > 0 || state.selection.kind === 'link', run: () => deleteSelection() },
  selectAll: { icon: 'selectAll', label: 'action.selectAll', key: 'Ctrl+A', enabled: hasDoc, run: () => (viewIs('resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner') ? select('resource', activeDoc().project.resources.map((r) => r.id)) : select('task', taskRows().filter((row) => row.task).map((row) => row.id))) },
  clearSelection: { icon: 'deselect', label: 'action.clearSelection', key: 'Esc', enabled: () => Boolean(state.selection.kind), run: () => clearSelection() },
  find: { icon: 'search', label: 'action.find', key: 'Ctrl+F', enabled: hasDoc, run: () => openFind('find') },
  replace: { icon: 'replace', label: 'action.replace', key: 'Ctrl+H', enabled: hasDoc, run: () => openFind('replace') },
  goTo: { icon: 'goTo', label: 'action.goTo', key: 'Ctrl+G', enabled: hasDoc, run: () => openFind('goto') },
  fillDown: { icon: 'fillDown', label: 'action.fillDown', key: 'Ctrl+D', enabled: () => selectedTasks().length > 1, run: () => fillDown() },
  // view
  ...Object.fromEntries(VIEWS.map((id) => [`view:${id}`, { icon: VIEW_ICONS[id], label: `view.${id}`, enabled: hasDoc, checked: () => hasDoc() && !state.showStart && activeDoc().view.id === id, run: () => switchView(id) }])),
  viewMenu: { icon: 'viewSwitch', label: 'action.viewMenu', enabled: hasDoc, run: (context) => viewsMenu(context?.anchor) },
  table: { icon: 'table', label: 'action.table', enabled: () => viewIs('gantt', 'tracking', 'taskSheet', 'resourceSheet'), run: (context) => tablesMenu(context?.anchor) },
  columns: { icon: 'columns', label: 'action.columns', enabled: () => viewIs('gantt', 'tracking', 'taskSheet', 'resourceSheet'), run: () => openColumns() },
  filter: { icon: 'filter', label: 'action.filter', enabled: taskViewActive, run: (context) => filtersMenu(context?.anchor) },
  clearFilter: { icon: 'filterClear', label: 'action.clearFilter', enabled: () => hasDoc() && (activeDoc().view.filter !== 'all' || Boolean(activeDoc().view.text) || activeDoc().view.group !== 'none' || activeDoc().view.sort !== 'id'), run: () => setViewOptions({ filter: 'all', text: '', group: 'none', sort: 'id', params: null }) },
  group: { icon: 'group', label: 'action.group', enabled: taskViewActive, run: (context) => groupsMenu(context?.anchor) },
  sort: { icon: 'sort', label: 'action.sort', enabled: taskViewActive, run: (context) => sortMenu(context?.anchor) },
  highlight: { icon: 'highlight', label: 'action.highlight', enabled: taskViewActive, checked: () => Boolean(activeDoc()?.view.highlight), run: () => setViewOptions({ highlight: !activeDoc().view.highlight }) },
  outlineCollapse: { icon: 'outlineCollapse', label: 'action.collapseAll', enabled: taskViewActive, run: () => setOutlineLevel(1) },
  outlineExpand: { icon: 'outlineExpand', label: 'action.expandAll', enabled: taskViewActive, run: () => setOutlineLevel(null) },
  zoomIn: { icon: 'zoomIn', label: 'action.zoomIn', key: 'Ctrl+=', enabled: () => state.settings.zoom < ZOOM.max, run: () => setZoom(state.settings.zoom + ZOOM.step) },
  zoomOut: { icon: 'zoomOut', label: 'action.zoomOut', key: 'Ctrl+-', enabled: () => state.settings.zoom > ZOOM.min, run: () => setZoom(state.settings.zoom - ZOOM.step) },
  zoomReset: { icon: 'zoomReset', label: 'action.zoomReset', key: 'Ctrl+0', run: () => setZoom(100) },
  timescaleIn: { icon: 'timescaleIn', label: 'action.timescaleIn', key: 'Ctrl+Shift+=', enabled: () => state.settings.timescale < TIMESCALE.max, run: () => stepTimescale(1, null, state.view) },
  timescaleOut: { icon: 'timescaleOut', label: 'action.timescaleOut', key: 'Ctrl+Shift+-', enabled: () => state.settings.timescale > TIMESCALE.min, run: () => stepTimescale(-1, null, state.view) },
  fitProject: { icon: 'fitProject', label: 'action.fitProject', enabled: () => viewIs('gantt', 'tracking'), run: () => fitProject() },
  scrollToTask: { icon: 'scrollToTask', label: 'action.scrollToTask', key: 'Ctrl+Shift+F5', enabled: () => selectedTasks().length > 0, run: () => state.view?.scrollToTask?.(selectedTasks()[0]) },
  goToday: { icon: 'today', label: 'action.goToday', enabled: () => viewIs('gantt', 'tracking'), run: () => state.view?.scrollToDate?.(nowMin()) },
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => state.settings.showLeftPanel, run: () => updateSettings({ showLeftPanel: !state.settings.showLeftPanel }) },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => state.settings.showRightPanel, run: () => updateSettings({ showRightPanel: !state.settings.showRightPanel }) },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => state.settings.showStatusBar, run: () => updateSettings({ showStatusBar: !state.settings.showStatusBar }) },
  criticalPath: { icon: 'criticalPath', label: 'action.criticalPath', key: 'Ctrl+Shift+P', enabled: hasDoc, checked: () => criticalMode, run: () => toggleCriticalPath() },
  showCritical: { icon: 'critical', label: 'action.showCritical', checked: () => state.settings.showCritical, run: () => updateSettings({ showCritical: !state.settings.showCritical }) },
  showSlack: { icon: 'slack', label: 'action.showSlack', checked: () => state.settings.showSlack, run: () => updateSettings({ showSlack: !state.settings.showSlack }) },
  showBaseline: { icon: 'baselineShow', label: 'action.showBaseline', checked: () => state.settings.showBaseline, run: () => updateSettings({ showBaseline: !state.settings.showBaseline }) },
  showProgressLine: { icon: 'progressLine', label: 'action.showProgressLine', checked: () => state.settings.showProgressLine, run: () => updateSettings({ showProgressLine: !state.settings.showProgressLine }) },
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(state.settings.theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (context) => openThemePicker(context?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(state.settings.backgroundImage) || state.settings.backgroundKind !== 'none', run: () => removeBackground() },
  // task
  insertTask: { icon: 'taskAdd', label: 'action.insertTask', key: 'Insert', run: () => insertTask() },
  insertSummary: { icon: 'summaryAdd', label: 'action.insertSummary', key: 'Ctrl+Shift+K', run: () => insertSummary() },
  insertMilestone: { icon: 'milestoneAdd', label: 'action.insertMilestone', key: 'Ctrl+Shift+M', run: () => insertMilestone() },
  insertRecurring: { icon: 'recurring', label: 'action.insertRecurring', run: () => openRecurring() },
  indent: { icon: 'indent', label: 'action.indent', key: 'Alt+Shift+Right', enabled: hasTasks, run: () => indentSelected(1) },
  outdent: { icon: 'outdent', label: 'action.outdent', key: 'Alt+Shift+Left', enabled: hasTasks, run: () => indentSelected(-1) },
  moveUp: { icon: 'moveUp', label: 'action.moveUp', key: 'Alt+Shift+Up', enabled: hasTasks, run: () => moveSelected(-1) },
  moveDown: { icon: 'moveDown', label: 'action.moveDown', key: 'Alt+Shift+Down', enabled: hasTasks, run: () => moveSelected(1) },
  link: { icon: 'link', label: 'action.link', key: 'Ctrl+F2', enabled: () => selectedTasks().length > 1, run: () => linkSelected() },
  unlink: { icon: 'unlink', label: 'action.unlink', key: 'Ctrl+Shift+F2', enabled: hasTasks, run: () => unlinkSelected() },
  taskInfo: { icon: 'taskInfo', label: 'action.taskInfo', key: 'Shift+F2', enabled: () => hasTasks() || selectedResources().length > 0 || state.selection.kind === 'link', run: () => infoForSelection() },
  notes: { icon: 'notes', label: 'action.notes', enabled: () => selectedTasks().length === 1, run: () => openTaskInfo(selectedTasks()[0], 'notes') },
  pct0: { icon: 'pct0', label: 'action.pct0', enabled: hasTasks, run: () => setProgress(null, 0) },
  pct25: { icon: 'pct25', label: 'action.pct25', enabled: hasTasks, run: () => setProgress(null, 25) },
  pct50: { icon: 'pct50', label: 'action.pct50', enabled: hasTasks, run: () => setProgress(null, 50) },
  pct75: { icon: 'pct75', label: 'action.pct75', enabled: hasTasks, run: () => setProgress(null, 75) },
  pct100: { icon: 'pct100', label: 'action.pct100', enabled: hasTasks, run: () => setProgress(null, 100) },
  markOnTrack: { icon: 'onTrack', label: 'action.markOnTrack', enabled: hasTasks, run: () => change('op.progress', (project) => markOnTrack(project, activeDoc().sched, selectedTasks())) },
  updateTasks: { icon: 'updateTasks', label: 'action.updateTasks', enabled: () => selectedTasks().length === 1, run: () => openUpdateTasks() },
  inactivate: { icon: 'inactive', label: 'action.inactivate', enabled: hasTasks, checked: () => hasTasks() && selectedTasks().every((id) => P.findTask(activeDoc().project, id)?.active === false), run: () => toggleInactive() },
  manualMode: { icon: 'manualMode', label: 'action.manualMode', enabled: hasTasks, checked: () => hasTasks() && selectedTasks().every((id) => P.findTask(activeDoc().project, id)?.manual), run: () => setMode(true) },
  autoMode: { icon: 'autoMode', label: 'action.autoMode', enabled: hasTasks, checked: () => hasTasks() && selectedTasks().every((id) => !P.findTask(activeDoc().project, id)?.manual), run: () => setMode(false) },
  addToTimeline: { icon: 'timelineAdd', label: 'action.addToTimeline', enabled: hasTasks, checked: () => hasTasks() && selectedTasks().every((id) => P.findTask(activeDoc().project, id)?.timeline), run: () => toggleField('timeline') },
  // resource
  addResource: { icon: 'resourceAdd', label: 'action.addResource', key: 'Ctrl+Shift+R', run: () => addResource() },
  resourceInfo: { icon: 'resourceInfo', label: 'action.resourceInfo', enabled: () => selectedResources().length === 1, run: () => openResourceInfo(selectedResources()[0]) },
  assign: { icon: 'assign', label: 'action.assign', key: 'Alt+F10', enabled: hasTasks, run: () => openAssign() },
  levelAll: { icon: 'level', label: 'action.levelAll', enabled: () => hasDoc() && activeDoc().project.resources.length > 0, run: () => levelNow() },
  clearLeveling: { icon: 'levelClear', label: 'action.clearLeveling', enabled: () => hasDoc() && activeDoc().project.tasks.some((task) => task.levelingDelay), run: () => clearLeveling() },
  levelingOptions: { icon: 'levelOptions', label: 'action.levelingOptions', enabled: hasDoc, run: () => openLeveling() },
  nextOverallocation: { icon: 'overallocation', label: 'action.nextOverallocation', enabled: () => hasDoc() && [...activeDoc().sched.tasks.values()].some((info) => info.overallocated && !info.summary), run: () => nextOverallocation() },
  // project
  projectInfo: { icon: 'projectInfo', label: 'action.projectInfo', enabled: hasDoc, run: () => openProjectInfo('general') },
  calendar: { icon: 'calendarEdit', label: 'action.calendar', enabled: hasDoc, run: () => openCalendar() },
  setBaseline: { icon: 'baselineSet', label: 'action.setBaseline', enabled: hasDoc, run: () => openBaseline('set') },
  clearBaseline: { icon: 'baselineClear', label: 'action.clearBaseline', enabled: () => hasDoc() && activeDoc().project.tasks.some((task) => Object.keys(task.baselines ?? {}).length), run: () => openBaseline('clear') },
  updateProject: { icon: 'updateProject', label: 'action.updateProject', enabled: hasDoc, run: () => openUpdateProject() },
  statusDate: { icon: 'statusDate', label: 'action.statusDate', enabled: hasDoc, run: () => openProjectInfo('status') },
  calculate: { icon: 'calculate', label: 'action.calculate', key: 'F9', enabled: hasDoc, run: () => { activeDoc().recalculate(); updateView(); renderRight(); renderStatus(); notify('success', t('notice.calculated')); } },
  statistics: { icon: 'statistics', label: 'action.statistics', enabled: hasDoc, run: () => openProjectInfo('statistics') },
  insertProject: { icon: 'insertProject', label: 'action.insertProject', enabled: hasDoc, run: () => insertProjectFile() },
  // report
  ...Object.fromEntries(REPORTS.map(([id, glyph]) => [`report:${id}`, { icon: glyph, label: `report.${id}`, enabled: hasDoc, checked: () => viewIs('reports') && (activeDoc().view.report ?? 'overview') === id, run: () => { activeDoc().view.report = id; switchView('reports'); } }])),
  copyReport: { icon: 'copyReport', label: 'action.copyReport', enabled: () => viewIs('reports'), run: async () => { await native.clipboardWrite(state.view.text()); notify('success', t('notice.reportCopied')); } },
  exportReport: { icon: 'exportReport', label: 'action.exportReport', enabled: hasDoc, run: (context) => chooseReportFormat(context) },
  exportReportHtml: { icon: 'reportHtml', label: 'action.exportReportHtml', enabled: hasDoc, run: () => exportReport('html') },
  exportReportMd: { icon: 'reportMarkdown', label: 'action.exportReportMd', enabled: hasDoc, run: () => exportReport('md') },
  exportReportDocx: { icon: 'reportWord', label: 'action.exportReportDocx', enabled: hasDoc, run: () => exportReport('docx') },
  exportReportPdf: { icon: 'reportPdf', label: 'action.exportReportPdf', enabled: hasDoc, run: () => exportReport('pdf') },
  // help
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openUserGuide() },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', checked: () => state.reader?.doc === 'tutorial', run: () => openReader('tutorial') },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: () => popups.open('settings', { tab: 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

function commandEnabled(id) {
  const command = commands[id];
  return Boolean(command) && (!command.enabled || command.enabled());
}

function commandTip(id) {
  const command = commands[id];
  let label = t(command.label).replace(/…$/, '');
  const doc = activeDoc();
  if (id === 'undo' && doc?.history.canUndo) label = t('tip.undoWith', { label: doc.history.undoLabel });
  if (id === 'redo' && doc?.history.canRedo) label = t('tip.redoWith', { label: doc.history.redoLabel });
  if (id === 'language') label = t('tip.language');
  if ((id === 'save' || id === 'saveAs') && dbActive()) label = t('tip.saveBoth', { label, where: dbDescribe(state.settings) });
  if (id === 'theme') label = t('tip.themeRandom', { current: themeName(state.settings.theme, getLanguage()) });
  if (id === 'viewMenu' && doc) label = t('tip.viewMenu', { name: t(`view.${doc.view.id}`) });
  return command.key ? t('tip.withKey', { label, key: keyLabel(command.key) }) : label;
}

async function run(id, context) {
  const command = commands[id];
  if (!command || !commandEnabled(id)) return;
  try {
    await command.run(context);
  } catch (error) {
    showError('error.unexpected', error, t(command.label));
  }
}

function undo() {
  const label = activeDoc().undo();
  if (label) afterHistory(t('notice.undone', { label }));
}

function redo() {
  const label = activeDoc().redo();
  if (label) afterHistory(t('notice.redone', { label }));
}

function afterHistory(text) {
  invalidateRows();
  pruneSelection();
  updateView();
  renderAll();
  notify('info', text);
}

// ───────────────────────── layout

// Long menus are grouped: a { sub } entry opens its items in a menu beside it.
const SUBMENUS = {
  transfer: { icon: 'exportFile', items: ['import', 'exportXml', 'exportCsv', 'exportImage'] },
  views: { icon: 'viewSwitch', items: VIEWS.map((id) => `view:${id}`) },
  tableData: { icon: 'table', items: ['table', 'columns', '-', 'filter', 'clearFilter', 'group', 'sort', 'highlight', '-', 'outlineCollapse', 'outlineExpand'] },
  zoom: { icon: 'zoomIn', items: ['zoomIn', 'zoomOut', 'zoomReset', '-', 'timescaleIn', 'timescaleOut', 'fitProject', '-', 'scrollToTask', 'goToday'] },
  show: { icon: 'eye', items: ['showCritical', 'showSlack', 'showBaseline', 'showProgressLine', '-', 'leftPanel', 'rightPanel', 'statusBar'] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  progress: { icon: 'percent', items: ['pct0', 'pct25', 'pct50', 'pct75', 'pct100', '-', 'markOnTrack', 'updateTasks'] },
  reportExport: { icon: 'exportReport', items: ['exportReportHtml', 'exportReportMd', 'exportReportDocx', 'exportReportPdf'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: ['new', 'open', 'startPage', 'recent', 'recentFolders', 'clearRecent', '-', 'save', 'saveAs', 'saveAll', 'saveTemplate', '-', ...(desktop ? ['dbOpen', 'dbSave', '-'] : []), sub('transfer'), '-', 'print', '-', 'closeTab', 'closeAll', '-', 'exit'],
  edit: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'fillDown', 'delete', '-', 'selectAll', 'clearSelection', '-', 'find', 'replace', 'goTo'],
  view: [sub('views'), 'viewMenu', '-', sub('tableData'), sub('zoom'), sub('show'), '-', sub('appearance')],
  task: ['insertTask', 'insertSummary', 'insertMilestone', 'insertRecurring', '-', 'indent', 'outdent', 'moveUp', 'moveDown', '-', 'link', 'unlink', '-', 'taskInfo', 'notes', 'addToTimeline', '-', sub('progress'), '-', 'manualMode', 'autoMode', 'inactivate'],
  resource: ['addResource', 'resourceInfo', 'assign', '-', 'levelAll', 'clearLeveling', 'levelingOptions', 'nextOverallocation', '-', 'view:resourceSheet', 'view:resourceUsage', 'view:resourceGraph', 'view:teamPlanner'],
  project: ['projectInfo', 'calendar', 'statistics', '-', 'setBaseline', 'clearBaseline', 'updateProject', 'statusDate', '-', 'calculate', 'criticalPath', 'insertProject'],
  report: [...REPORTS.map(([id]) => `report:${id}`), '-', sub('reportExport'), 'copyReport', 'print'],
  help: ['tutorial', 'tutorialDoc', 'userGuide', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', view: 'eye', task: 'bar', resource: 'user', project: 'project', report: 'statistics', help: 'question' };

const TOOLBAR = [
  ['new', 'open', 'save', 'print'],
  ['undo', 'redo'],
  ['copy', 'paste'],
  ['insertTask', 'insertMilestone', 'indent', 'outdent', 'link', 'taskInfo'],
  ['viewSplit'],
  ['showCritical', 'criticalPath'],
  ['zoom'],
  ['timescaleOut', 'timescaleIn'],
  ['leftPanel', 'rightPanel'],
];
/** Right end of the toolbar: start page, tutorial, theme (random + dropdown), language, settings, about. */
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];

function renderShell() {
  root.innerHTML = `
    <div class="app-bg" aria-hidden="true"><canvas class="anim-bg"></canvas><div class="image-bg"></div></div>
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.leftTitle'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="view-host" class="view-host"></div>
          <div id="start-page" hidden></div>
          <div id="reader-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span></span></div></div>
        </div>
      </section>
      <div class="splitter vertical panel-split" data-split="right" title="${escapeHtml(t('tip.panelSplitter'))}" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.rightTitle'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" aria-label="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" title="${escapeHtml(t('tip.resize'))}" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const onStart = state.showStart || !activeDoc();
  const home = `<button class="menubar-item menubar-home ${onStart ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-label="${escapeHtml(t('menu.home'))}" aria-pressed="${onStart}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  menubar.innerHTML = home + Object.keys(MENUS).map((name) => `
    <button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('');
}

/** Language the toolbar was built in (renderAll rebuilds it only when that changes). */
let toolbarLanguage = null;

function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const command = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(command.icon);
    return `<button class="tool-button ${extra}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(command.label))}">${glyph}</button>`;
  };
  const button = (id) => {
    if (id === 'zoom') {
      return `<span class="stepper toolbar-zoom" title="${escapeHtml(t('tip.zoomValue'))}">
        <button class="tool-button stepper-button-tool" data-command="zoomOut" title="${escapeHtml(commandTip('zoomOut'))}" aria-label="${escapeHtml(t('action.zoomOut'))}">${icon('minus')}</button>
        <input class="stepper-value" id="zoom-value" type="text" inputmode="decimal" value="${state.settings.zoom}%" title="${escapeHtml(t('tip.zoomValue'))}" aria-label="${escapeHtml(t('tip.zoomValue'))}" />
        <button class="tool-button stepper-button-tool" data-command="zoomIn" title="${escapeHtml(commandTip('zoomIn'))}" aria-label="${escapeHtml(t('action.zoomIn'))}">${icon('plus')}</button>
      </span>`;
    }
    if (id === 'themeSplit') {
      return `<span class="split-button">${plain('theme')}<button class="tool-button split-arrow" data-command="themeMenu" title="${escapeHtml(commandTip('themeMenu'))}" aria-label="${escapeHtml(t('action.themeChoose'))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
    }
    if (id === 'viewSplit') {
      const current = activeDoc()?.view.id ?? 'gantt';
      return `<span class="split-button view-split"><button class="tool-button wide" data-command="viewMenu" title="${escapeHtml(commandTip('viewMenu'))}" aria-label="${escapeHtml(t('action.viewMenu'))}" aria-haspopup="true" data-view-icon="${current}">${icon(VIEW_ICONS[current])}<span class="view-name">${Object.keys(VIEW_ICONS).map((id) => `<span data-view-name="${id}" class="${id === current ? '' : 'off'}" aria-hidden="${id !== current}">${escapeHtml(t(`view.${id}`))}</span>`).join('')}</span>${icon('chevronDown', 'icon tiny')}</button></span>`;
    }
    return plain(id);
  };
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group) => `<div class="tool-group">${group.map(button).join('')}</div>`).join('<span class="tool-sep" aria-hidden="true"></span>')}</div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
}

function renderToolbarState() {
  for (const element of root.querySelectorAll('#toolbar [data-command]')) {
    const id = element.dataset.command;
    element.disabled = !commandEnabled(id);
    element.title = commandTip(id);
    const checked = commands[id].checked?.();
    element.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) element.setAttribute('aria-pressed', String(Boolean(checked)));
  }
  const zoom = root.querySelector('#zoom-value');
  if (zoom && document.activeElement !== zoom) zoom.value = `${state.settings.zoom}%`;
  // Every view name sits in the same cell (only the current one shows), so the button keeps the width of the longest one.
  const current = activeDoc()?.view.id ?? 'gantt';
  const viewButton = root.querySelector('.view-split [data-view-icon]');
  if (viewButton && viewButton.dataset.viewIcon !== current) {
    viewButton.querySelector('svg').outerHTML = icon(VIEW_ICONS[current]);
    viewButton.dataset.viewIcon = current;
  }
  for (const name of root.querySelectorAll('.view-split [data-view-name]')) { const off = name.dataset.viewName !== current; name.classList.toggle('off', off); name.setAttribute('aria-hidden', String(off)); }
}

/** The window can never be so narrow that toolbar buttons or menus are hidden. */
function updateMinimumWidth() {
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  if (!left || !right) return;
  requestAnimationFrame(() => {
    const toolbar = root.querySelector('#toolbar');
    const style = getComputedStyle(toolbar);
    const menus = [...root.querySelectorAll('.menubar-item')].reduce((sum, el) => sum + el.offsetWidth + 2, 24);
    const width = Math.ceil(Math.max(menus, left.scrollWidth + right.scrollWidth + 24 + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2));
    if (Math.abs(width - state.minWidth) < 1) return;
    state.minWidth = width;
    document.documentElement.style.setProperty('--min-width', `${width}px`);
    native.setMinimumSize(width, 600).catch(() => {});
  });
}

// ───────────────────────── tabs

function renderTabs() {
  const tabs = root.querySelector('#tabs');
  const scroll = tabs.querySelector('.tab-strip')?.scrollLeft ?? 0;
  tabs.innerHTML = `
    <div class="tab-strip"><div class="tab-list" role="tablist">
      ${state.docs.map((doc) => `
        <div class="tab ${doc.id === state.active && !state.showStart ? 'active' : ''} ${doc.dirty ? 'dirty' : ''}" role="tab" aria-selected="${doc.id === state.active}" data-doc="${doc.id}" title="${escapeHtml(doc.path ?? docName(doc))}">
          ${icon(doc.fromTemplate ? 'template' : 'plan')}<span class="tab-name">${escapeHtml(docName(doc))}</span>
          <span class="tab-dirty" title="${escapeHtml(t('status.modified'))}">●</span>
          <button class="tab-close" data-close-doc="${doc.id}" title="${escapeHtml(t('tabs.close'))}" aria-label="${escapeHtml(t('tabs.close'))}">${icon('close')}</button>
        </div>`).join('')}
    </div></div>
    <button class="tab-add" data-tab-new title="${escapeHtml(t('tabs.new'))}" aria-label="${escapeHtml(t('tabs.new'))}">${icon('plus')}</button>
    <div class="tab-nav">
      <button class="tab-scroll" data-tab-scroll="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-tab-scroll="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
  const strip = tabs.querySelector('.tab-strip');
  strip.scrollLeft = scroll;
  updateTabNav();
}

/** "<" ">" stay at the right end; they are enabled only when the tabs are wider than the strip. */
function updateTabNav() {
  const tabs = root.querySelector('#tabs');
  const strip = tabs?.querySelector('.tab-strip');
  if (!strip) return;
  const overflow = strip.scrollWidth > strip.clientWidth + 1;
  tabs.classList.toggle('overflow', overflow);
  const [left, right] = tabs.querySelectorAll('.tab-scroll');
  left.disabled = strip.scrollLeft <= 0;
  right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

function scrollTabs(direction) {
  const strip = root.querySelector('.tab-strip');
  strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * 0.6), behavior: 'instant' });
  updateTabNav();
}

function scrollActiveTabIntoView() {
  const strip = root.querySelector('.tab-strip');
  const tab = strip?.querySelector('.tab.active');
  if (!tab) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < strip.scrollLeft) strip.scrollLeft = left;
  else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  updateTabNav();
}

function cycleTab(direction) {
  const index = state.docs.findIndex((doc) => doc.id === state.active);
  const next = state.docs[(index + direction + state.docs.length) % state.docs.length];
  if (next) activateDoc(next.id);
}

// ───────────────────────── left panel (tools)

const LEFT_TOOLS = [
  ['insert', 'taskAdd', ['insertTask', 'insertSummary', 'insertMilestone', 'insertRecurring', 'addResource', 'assign']],
  ['schedule', 'link', ['indent', 'outdent', 'link', 'unlink', 'moveUp', 'moveDown', 'manualMode', 'autoMode', 'inactivate']],
  ['progress', 'percent', ['pct0', 'pct25', 'pct50', 'pct75', 'pct100', 'markOnTrack']],
];

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  const doc = activeDoc();
  if (!state.settings.showLeftPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}" aria-label="${escapeHtml(t('panel.expandLeft'))}">${icon('chevronRight')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.leftTitle'))}">${icon('viewSwitch')}<span>${escapeHtml(t('panel.toolsShort'))}</span></div>
      ${VIEWS.map((id) => `<button class="rail-button ${doc && !state.showStart && doc.view.id === id ? 'active' : ''}" data-command="view:${id}" title="${escapeHtml(t(`view.${id}`))}" ${doc ? '' : 'disabled'}>${icon(VIEW_ICONS[id])}<span class="rail-label">${escapeHtml(t(`viewShort.${id}`))}</span></button>`).join('')}
    </div>`;
    return;
  }
  const view = doc?.view;
  const options = (list, current, prefix) => list.map((value) => `<option value="${value}" ${value === current ? 'selected' : ''}>${escapeHtml(t(`${prefix}.${value}`))}</option>`).join('');
  panel.innerHTML = `
    <div class="panel-header">${icon('viewSwitch')}<span>${escapeHtml(t('panel.leftTitle'))}</span>
      <button class="icon-button" data-command="leftPanel" title="${escapeHtml(t('panel.collapseLeft'))}" aria-label="${escapeHtml(t('panel.collapseLeft'))}">${icon('chevronLeft')}</button></div>
    <section class="panel-section">
      <h3>${icon('eye')}<span>${escapeHtml(t('panel.views'))}</span></h3>
      <div class="view-list">${VIEWS.map((id) => `<button class="view-button ${doc && !state.showStart && doc.view.id === id ? 'active' : ''}" data-command="view:${id}" title="${escapeHtml(t(`view.${id}`))}" ${doc ? '' : 'disabled'}>${icon(VIEW_ICONS[id])}<span>${escapeHtml(t(`view.${id}`))}</span></button>`).join('')}</div>
    </section>
    ${LEFT_TOOLS.map(([id, glyph, list]) => `<section class="panel-section">
      <h3>${icon(glyph)}<span>${escapeHtml(t(`panel.${id}`))}</span></h3>
      <div class="tool-grid">${list.map((command) => `<button class="tool-tile" data-command="${command}" title="${escapeHtml(commandTip(command))}" ${commandEnabled(command) ? '' : 'disabled'}>${icon(commands[command].icon)}<span>${escapeHtml(t(`toolShort.${command}`))}</span></button>`).join('')}</div>
    </section>`).join('')}
    <section class="panel-section">
      <h3>${icon('filter')}<span>${escapeHtml(t('panel.data'))}</span></h3>
      <label class="search-box" title="${escapeHtml(t('tip.search'))}">${icon('search')}<input id="panel-search" type="search" value="${escapeHtml(view?.text ?? '')}" placeholder="${escapeHtml(t('panel.searchPlaceholder'))}" aria-label="${escapeHtml(t('tip.search'))}" ${doc ? '' : 'disabled'} /></label>
      <div class="field-row"><span>${icon('filter')}${escapeHtml(t('panel.filter'))}</span><select data-view-option="filter" title="${escapeHtml(t('panel.filter'))}" ${doc ? '' : 'disabled'}>${options(FILTERS, view?.filter ?? 'all', 'filter')}</select></div>
      <div class="field-row"><span>${icon('group')}${escapeHtml(t('panel.group'))}</span><select data-view-option="group" title="${escapeHtml(t('panel.group'))}" ${doc ? '' : 'disabled'}>${options(GROUPS, view?.group ?? 'none', 'groupBy')}</select></div>
      <div class="field-row"><span>${icon('sort')}${escapeHtml(t('panel.sort'))}</span><select data-view-option="sort" title="${escapeHtml(t('panel.sort'))}" ${doc ? '' : 'disabled'}>${options(SORTS, view?.sort ?? 'id', 'sortBy')}</select></div>
      <div class="field-row"><span>${icon('table')}${escapeHtml(t('panel.table'))}</span><select data-view-option="table" title="${escapeHtml(t('panel.table'))}" ${doc ? '' : 'disabled'}>${options(Object.keys(TASK_TABLES), view?.table ?? 'entry', 'tableName')}</select></div>
      <label class="check-row" title="${escapeHtml(t('action.highlight'))}"><input type="checkbox" data-view-toggle="highlight" ${view?.highlight ? 'checked' : ''} ${doc ? '' : 'disabled'} /><span>${escapeHtml(t('action.highlight'))}</span></label>
      <div class="filter-foot"><span class="muted" id="filter-count">${doc ? escapeHtml(t('panel.rows', { shown: taskRows().filter((row) => row.task).length, total: doc.project.tasks.length })) : ''}</span>
        <button class="small-button" data-command="clearFilter" title="${escapeHtml(t('action.clearFilter'))}" ${commandEnabled('clearFilter') ? '' : 'disabled'}>${icon('filterClear')}<span>${escapeHtml(t('panel.clear'))}</span></button></div>
    </section>
    <section class="panel-section">
      <h3>${icon('eye')}<span>${escapeHtml(t('panel.show'))}</span></h3>
      ${['showCritical', 'showSlack', 'showBaseline', 'showProgressLine'].map((id) => `<label class="check-row" title="${escapeHtml(t(commands[id].label))}"><input type="checkbox" data-setting-toggle="${id}" ${state.settings[id] ? 'checked' : ''} /><span>${icon(commands[id].icon)}${escapeHtml(t(commands[id].label))}</span></label>`).join('')}
    </section>`;
}

function setViewOptions(patch) {
  const doc = activeDoc();
  if (!doc) return;
  Object.assign(doc.view, patch);
  invalidateRows();
  if ('table' in patch) { mountView(); renderView(); } else updateView();
  renderLeft();
  renderStatus();
  renderToolbarState();
}

// ───────────────────────── right panel (properties)

function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel) return;
  if (!state.settings.showRightPanel) {
    panel.innerHTML = `<div class="panel-rail">
      <button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}" aria-label="${escapeHtml(t('panel.expandRight'))}">${icon('chevronLeft')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button>
      <div class="rail-title" title="${escapeHtml(t('panel.rightTitle'))}">${icon('taskInfo')}<span>${escapeHtml(t('panel.propsShort'))}</span></div>
      ${['taskInfo', 'resourceInfo', 'projectInfo', 'calendar', 'setBaseline', 'levelAll'].map((id) => `<button class="rail-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}<span class="rail-label">${escapeHtml(t(`toolShort.${id}`))}</span></button>`).join('')}
    </div>`;
    return;
  }
  const doc = activeDoc();
  let title = t('panel.rightTitle');
  let body = `<div class="panel-hint">${icon('info')}<span>${escapeHtml(t('props.noPlan'))}</span></div>`;
  if (doc) {
    if (state.selection.kind === 'task' && state.selection.ids.length === 1) ({ title, body } = taskProps(doc, state.selection.ids[0]));
    else if (state.selection.kind === 'task' && state.selection.ids.length > 1) ({ title, body } = multiProps(doc));
    else if (state.selection.kind === 'resource' && state.selection.ids.length) ({ title, body } = resourceProps(doc, state.selection.ids[0]));
    else if (state.selection.kind === 'link') ({ title, body } = linkProps(doc));
    else ({ title, body } = projectProps(doc));
  }
  panel.innerHTML = `
    <div class="panel-header">${icon('taskInfo')}<span>${escapeHtml(title)}</span>
      <button class="icon-button" data-command="rightPanel" title="${escapeHtml(t('panel.collapseRight'))}" aria-label="${escapeHtml(t('panel.collapseRight'))}">${icon('chevronRight')}</button></div>
    <div class="props">${body}</div>`;
}

const propRow = (glyph, label, control, tall = false) => `<div class="prop-row ${tall ? 'tall' : ''}" title="${escapeHtml(label)}"><span class="prop-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
const propValue = (value) => `<span class="prop-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;

function taskProps(doc, id) {
  const task = P.findTask(doc.project, id);
  const info = doc.sched.info(id);
  if (!task || !info) return projectProps(doc);
  const ctx = fieldCtx();
  const text = (fieldId) => {
    const field = TASK_FIELD_MAP.get(fieldId);
    try { return field.text ? field.text(ctx, field.get(ctx, task, info), task, info) : String(field.get(ctx, task, info) ?? ''); } catch { return ''; }
  };
  const input = (fieldId, editable = true) => (editable
    ? `<input type="text" data-prop-field="${fieldId}" value="${escapeHtml(fieldId === 'name' || fieldId === 'predecessors' || fieldId === 'resourceNames' ? String(TASK_FIELD_MAP.get(fieldId).get(ctx, task, info) ?? '') : text(fieldId))}" title="${escapeHtml(t(`field.${fieldId}`))}" aria-label="${escapeHtml(t(`field.${fieldId}`))}" />`
    : propValue(text(fieldId)));
  const leaf = !info.summary;
  const pct = info.percentComplete ?? 0;
  const body = [
    propRow('edit', t('field.name'), input('name')),
    propRow('flag', t('field.wbs'), propValue(`${info.wbs} · ID ${info.row}`)),
    propRow('hourglass', t('field.duration'), input('duration', leaf)),
    propRow('calendar', t('field.start'), input('start', leaf)),
    propRow('flag', t('field.finish'), input('finish', leaf)),
    leaf ? `<div class="prop-row" title="${escapeHtml(t('field.percentComplete'))}"><span class="prop-label">${icon('percent')}<span>${escapeHtml(t('field.percentComplete'))}</span></span><span class="prop-control range-wrap"><input type="range" min="0" max="100" step="5" value="${pct}" data-prop-percent aria-label="${escapeHtml(t('field.percentComplete'))}" title="${escapeHtml(t('field.percentComplete'))}" /><output>${pct}%</output></span></div>` : propRow('percent', t('field.percentComplete'), propValue(`${pct}%`)),
    propRow('link2', t('field.predecessors'), input('predecessors')),
    propRow('user', t('field.resourceNames'), input('resourceNames', leaf)),
    propRow('autoMode', t('field.mode'), `<select data-prop-field="mode" title="${escapeHtml(t('field.mode'))}">${['auto', 'manual'].map((m) => `<option value="${m}" ${(task.manual ? 'manual' : 'auto') === m ? 'selected' : ''}>${escapeHtml(t(`mode.${m}`))}</option>`).join('')}</select>`),
    propRow('constraint', t('field.constraintType'), `<select data-prop-field="constraintType" title="${escapeHtml(t('field.constraintType'))}">${P.CONSTRAINTS.map((c) => `<option value="${c}" ${task.constraint?.type === c ? 'selected' : ''}>${escapeHtml(t(`constraint.${c}`))}</option>`).join('')}</select>`),
    task.constraint?.date ? propRow('calendar', t('field.constraintDate'), input('constraintDate')) : '',
    propRow('deadline', t('field.deadline'), input('deadline')),
    propRow('priority', t('field.priority'), input('priority')),
    propRow('money', t('field.cost'), propValue(text('cost'))),
    propRow('reportWork', t('field.work'), propValue(text('work'))),
    propRow('slack', t('field.totalSlack'), propValue(text('totalSlack'))),
    `<div class="prop-badges">${info.critical ? `<span class="badge danger">${icon('critical', 'icon')}${escapeHtml(t('chart.critical'))}</span>` : ''}${info.late ? `<span class="badge warn">${icon('reportLate', 'icon')}${escapeHtml(t('ind.late'))}</span>` : ''}${info.overallocated ? `<span class="badge warn">${icon('overallocation', 'icon')}${escapeHtml(t('ind.overallocated'))}</span>` : ''}${info.baseline ? `<span class="badge">${icon('baselineShow', 'icon')}${escapeHtml(t('props.variance', { value: text('finishVariance') }))}</span>` : ''}</div>`,
    propRow('notes', t('field.notes'), `<textarea data-prop-field="notes" rows="3" title="${escapeHtml(t('field.notes'))}" aria-label="${escapeHtml(t('field.notes'))}">${escapeHtml(task.notes ?? '')}</textarea>`, true),
    `<div class="prop-colors">${P.BAR_COLORS.map((color) => `<button class="swatch ${task.barColor === color ? 'active' : ''} ${color ? '' : 'swatch-none'}" data-bar-color="${color}" style="--swatch:${color || 'transparent'}" title="${escapeHtml(color ? t('props.barColor') : t('props.barColorDefault'))}"></button>`).join('')}</div>`,
    `<div class="prop-actions">
      <button class="small-button" data-command="taskInfo" title="${escapeHtml(commandTip('taskInfo'))}">${icon('taskInfo')}<span>${escapeHtml(t('props.more'))}</span></button>
      <button class="small-button" data-command="assign" title="${escapeHtml(commandTip('assign'))}">${icon('assign')}<span>${escapeHtml(t('toolShort.assign'))}</span></button>
      <button class="small-button" data-command="scrollToTask" title="${escapeHtml(commandTip('scrollToTask'))}">${icon('scrollToTask')}<span>${escapeHtml(t('toolShort.scrollToTask'))}</span></button>
    </div>`,
  ].join('');
  return { title: `${info.summary ? t('props.summary') : task.milestone ? t('props.milestone') : t('props.task')}: ${task.name || '—'}`, body };
}

function multiProps(doc) {
  const ids = selectedTasks();
  const infos = ids.map((id) => doc.sched.info(id)).filter(Boolean);
  const start = Math.min(...infos.map((info) => info.start));
  const finish = Math.max(...infos.map((info) => info.finish));
  const cost = infos.filter((info) => !info.summary).reduce((sum, info) => sum + info.cost, 0);
  const body = [
    propRow('selectAll', t('props.selected'), propValue(String(ids.length))),
    propRow('calendar', t('field.start'), propValue(formatDay(start, state.settings.dateFormat))),
    propRow('flag', t('field.finish'), propValue(formatDay(finish, state.settings.dateFormat))),
    propRow('money', t('field.cost'), propValue(formatMoney(cost, doc.project.options.currency))),
    `<div class="prop-actions">${['link', 'unlink', 'indent', 'outdent', 'pct0', 'pct50', 'pct100', 'inactivate', 'taskInfo'].map((id) => `<button class="small-button" data-command="${id}" title="${escapeHtml(commandTip(id))}">${icon(commands[id].icon)}<span>${escapeHtml(t(`toolShort.${id}`))}</span></button>`).join('')}</div>`,
  ].join('');
  return { title: t('props.multi', { count: ids.length }), body };
}

function resourceProps(doc, id) {
  const resource = P.findResource(doc.project, id);
  if (!resource) return projectProps(doc);
  const info = doc.sched.resources.get(id);
  const ctx = fieldCtx();
  const input = (fieldId) => {
    const field = RESOURCE_FIELD_MAP.get(fieldId);
    const value = field.get(ctx, resource);
    return `<input type="text" data-prop-resource="${fieldId}" value="${escapeHtml(fieldId === 'maxUnits' ? `${value}%` : String(value ?? ''))}" title="${escapeHtml(t(`field.${fieldId}`))}" aria-label="${escapeHtml(t(`field.${fieldId}`))}" />`;
  };
  const tasks = doc.project.assignments.filter((a) => a.resourceId === id).map((a) => ({ a, task: P.findTask(doc.project, a.taskId) })).filter((x) => x.task);
  const body = [
    propRow('edit', t('field.name'), input('name')),
    propRow('user', t('field.resourceType'), `<select data-prop-resource="resourceType" title="${escapeHtml(t('field.resourceType'))}">${P.RESOURCE_TYPES.map((type) => `<option value="${type}" ${resource.type === type ? 'selected' : ''}>${escapeHtml(t(`resourceType.${type}`))}</option>`).join('')}</select>`),
    propRow('tag', t('field.initials'), input('initials')),
    propRow('group', t('field.group'), input('group')),
    resource.type === 'work' ? propRow('percent', t('field.maxUnits'), input('maxUnits')) : '',
    resource.type !== 'cost' ? propRow('money', t('field.stdRate'), input('stdRate')) : '',
    propRow('money', t('field.costPerUse'), input('costPerUse')),
    propRow('reportWork', t('field.work'), propValue(RESOURCE_FIELD_MAP.get('work').text(ctx, info?.work ?? 0, resource))),
    propRow('reportCost', t('field.cost'), propValue(RESOURCE_FIELD_MAP.get('cost').text(ctx, info?.cost ?? 0, resource))),
    info?.overallocated ? `<div class="prop-badges"><span class="badge danger">${icon('overallocation', 'icon')}${escapeHtml(t('ind.overallocatedResource'))}</span></div>` : '',
    `<h4 class="prop-subhead">${icon('list')}${escapeHtml(t('props.assignedTasks', { count: tasks.length }))}</h4>`,
    `<ul class="prop-list">${tasks.slice(0, 12).map(({ a, task }) => `<li><button class="link-button" data-goto-task="${escapeHtml(task.id)}" title="${escapeHtml(task.name)}">${icon('bar', 'icon tiny')}<span>${escapeHtml(task.name)}</span><small>${Math.round((a.units ?? 1) * 100)}%</small></button></li>`).join('')}${tasks.length > 12 ? `<li class="muted">… +${tasks.length - 12}</li>` : ''}</ul>`,
    `<div class="prop-actions"><button class="small-button" data-command="resourceInfo" title="${escapeHtml(commandTip('resourceInfo'))}">${icon('resourceInfo')}<span>${escapeHtml(t('props.more'))}</span></button></div>`,
  ].join('');
  return { title: `${t('props.resource')}: ${resource.name}`, body };
}

function linkProps(doc) {
  const { from, to } = state.selection.link;
  const succ = P.findTask(doc.project, to);
  const pred = P.findTask(doc.project, from);
  const link = succ?.predecessors.find((item) => item.taskId === from);
  if (!link) return projectProps(doc);
  const body = [
    propRow('bar', t('link.from'), propValue(`${P.rowOf(doc.project, from)}. ${pred?.name ?? ''}`)),
    propRow('bar', t('link.to'), propValue(`${P.rowOf(doc.project, to)}. ${succ?.name ?? ''}`)),
    propRow('link2', t('link.type'), `<select data-prop-link="type" title="${escapeHtml(t('link.type'))}">${['FS', 'SS', 'FF', 'SF'].map((type) => `<option value="${type}" ${link.type === type ? 'selected' : ''}>${escapeHtml(t(`linkType.${type}`))}</option>`).join('')}</select>`),
    propRow('hourglass', t('link.lag'), `<input type="text" data-prop-link="lag" value="${escapeHtml(link.lag ? formatLag(link.lag, link.lagUnit, doc.project.options) : '0d')}" title="${escapeHtml(t('link.lag'))}" aria-label="${escapeHtml(t('link.lag'))}" />`),
    `<div class="prop-actions"><button class="small-button danger" data-command="delete" title="${escapeHtml(t('link.delete'))}">${icon('unlink')}<span>${escapeHtml(t('link.delete'))}</span></button></div>`,
  ].join('');
  return { title: t('props.link'), body };
}

function projectProps(doc) {
  const s = doc.sched;
  const project = doc.project;
  const settings = state.settings;
  const ctx = fieldCtx();
  const money = TASK_FIELD_MAP.get('cost').text(ctx, s.cost);
  const work = TASK_FIELD_MAP.get('work').text(ctx, s.work);
  const critical = [...s.tasks.values()].filter((info) => info.critical && !info.summary).length;
  const late = [...s.tasks.values()].filter((info) => info.late && !info.summary).length;
  const over = project.resources.filter((r) => s.resources.get(r.id)?.overallocated).length;
  const body = [
    propRow('edit', t('field.title'), `<input type="text" data-prop-project="title" value="${escapeHtml(project.title)}" title="${escapeHtml(t('field.title'))}" aria-label="${escapeHtml(t('field.title'))}" />`),
    propRow('calendar', t('field.projectStart'), `<input type="text" data-prop-project="start" value="${escapeHtml(formatDay(toMin(project.start), settings.dateFormat))}" title="${escapeHtml(t('field.projectStart'))}" aria-label="${escapeHtml(t('field.projectStart'))}" />`),
    propRow('flag', t('field.finish'), propValue(formatDay(s.finish, settings.dateFormat))),
    propRow('hourglass', t('field.duration'), propValue(formatDuration(s.duration, 'd', project.options, getLanguage()))),
    propRow('statusDate', t('field.statusDate'), propValue(project.statusDate ? formatDay(toMin(project.statusDate), settings.dateFormat) : t('common.na'))),
    `<div class="prop-row" title="${escapeHtml(t('field.percentComplete'))}"><span class="prop-label">${icon('percent')}<span>${escapeHtml(t('field.percentComplete'))}</span></span><span class="prop-control"><span class="mini-progress"><i style="width:${s.percentComplete}%"></i></span><b>${s.percentComplete}%</b></span></div>`,
    propRow('money', t('field.cost'), propValue(money)),
    propRow('reportWork', t('field.work'), propValue(work)),
    propRow('list', t('props.taskCount'), propValue(String(project.tasks.length))),
    propRow('user', t('props.resourceCount'), propValue(String(project.resources.length))),
    `<div class="prop-badges">
      <span class="badge ${critical ? 'danger' : ''}">${icon('critical', 'icon')}${escapeHtml(t('props.criticalCount', { count: critical }))}</span>
      <span class="badge ${late ? 'warn' : ''}">${icon('reportLate', 'icon')}${escapeHtml(t('props.lateCount', { count: late }))}</span>
      <span class="badge ${over ? 'warn' : ''}">${icon('overallocation', 'icon')}${escapeHtml(t('props.overCount', { count: over }))}</span>
      ${s.conflicts.length ? `<span class="badge warn">${icon('warning', 'icon')}${escapeHtml(t('props.conflicts', { count: s.conflicts.length }))}</span>` : ''}
    </div>`,
    `<div class="prop-actions">${['projectInfo', 'calendar', 'setBaseline', 'levelAll'].map((id) => `<button class="small-button" data-command="${id}" title="${escapeHtml(commandTip(id))}" ${commandEnabled(id) ? '' : 'disabled'}>${icon(commands[id].icon)}<span>${escapeHtml(t(`toolShort.${id}`))}</span></button>`).join('')}</div>`,
    `<p class="panel-hint">${escapeHtml(t('props.hint'))}</p>`,
  ].join('');
  return { title: `${t('props.project')}: ${project.title}`, body };
}

// ───────────────────────── status bar

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const doc = activeDoc();
  const s = state.settings;
  const notice = state.notice;
  const items = [];
  items.push(`<span class="status-notice ${notice?.kind ?? ''}" title="${escapeHtml(notice?.text ?? t('status.ready'))}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(notice?.text ?? t('status.ready'))}</span></span>`);
  if (doc) {
    const sched = doc.sched;
    const selected = state.selection.kind === 'task' ? state.selection.ids.length : state.selection.kind === 'resource' ? state.selection.ids.length : 0;
    items.push(`<button class="status-item mode" data-status="mode" title="${escapeHtml(t('status.newTaskMode'))}">${icon(doc.project.options.defaultTaskMode === 'manual' ? 'manualMode' : 'autoMode')}<span>${escapeHtml(t(`status.mode.${doc.project.options.defaultTaskMode === 'manual' ? 'manual' : 'auto'}`))}</span></button>`);
    items.push(`<span class="status-item ${doc.dirty ? 'modified' : 'saved'}" title="${escapeHtml(doc.path ?? t('status.unsavedFile'))}">${icon(doc.dirty ? 'edit' : 'save')}<span>${escapeHtml(doc.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('status.tasksTip'))}">${icon('list')}<span>${escapeHtml(t('status.tasks', { count: doc.project.tasks.length }))}</span></span>`);
    if (selected) items.push(`<span class="status-item" title="${escapeHtml(t('status.selectedTip'))}">${icon('selectAll')}<span>${escapeHtml(t('status.selected', { count: selected }))}</span></span>`);
    if (criticalMode) {
      const cp = criticalPath(doc.project, sched);
      items.push(`<button class="status-item critical-status" data-command="criticalPath" title="${escapeHtml(t('status.criticalTip'))}">${icon('criticalPath')}<span>${escapeHtml(t('status.critical', { count: cp.ids.size }))}</span></button>`);
    }
    items.push(`<span class="status-item" title="${escapeHtml(t('field.finish'))}">${icon('flag')}<span>${escapeHtml(formatDay(sched.finish, s.dateFormat))}</span></span>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('field.percentComplete'))}">${icon('percent')}<span>${sched.percentComplete}%</span></span>`);
    if (sched.conflicts.length) items.push(`<span class="status-item warn" title="${escapeHtml(t('status.conflictsTip'))}">${icon('warning')}<span>${escapeHtml(t('status.conflicts', { count: sched.conflicts.length }))}</span></span>`);
    if (doc.view.filter !== 'all' || doc.view.text) items.push(`<span class="status-item warn" title="${escapeHtml(t(`filter.${doc.view.filter}`))}">${icon('filter')}<span>${escapeHtml(t('status.filter'))}</span></span>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  items.push(`<label class="status-item timescale" title="${escapeHtml(t('status.timescaleTip'))}">${icon('timescaleIn')}<input type="range" id="timescale-slider" min="0" max="${TIMESCALE.steps.length - 1}" step="1" value="${Math.max(0, TIMESCALE.steps.findIndex((step) => step >= s.timescale))}" aria-label="${escapeHtml(t('status.timescaleTip'))}" title="${escapeHtml(t('status.timescaleTip'))}" /></label>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('tip.zoomValue'))}">${icon('zoomIn')}<span>${s.zoom}%</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

function renderAll() {
  root.classList.toggle('critical-focus', criticalMode && Boolean(activeDoc()));
  root.classList.toggle('no-status', !state.settings.showStatusBar);
  root.classList.toggle('no-left', !state.settings.showLeftPanel);
  root.classList.toggle('no-right', !state.settings.showRightPanel);
  root.style.setProperty('--left-width', `${state.settings.leftWidth}px`);
  root.style.setProperty('--right-width', `${state.settings.rightWidth}px`);
  root.style.setProperty('--zoom', String(state.settings.zoom / 100));
  root.style.setProperty('--row-height', `${rowHeight()}px`);
  renderMenubar();
  // The toolbar markup only depends on the language; otherwise only its state changes.
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  renderTabs();
  renderLeft();
  renderView();
  renderRight();
  renderStatus();
  updateBackgroundState();
}

// ───────────────────────── start page

function renderStartPage() {
  const host = root.querySelector('#start-page');
  host.innerHTML = startPageHtml(appApi);
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => state.settings.animationSpeed / 100, kind: state.settings.animation });
  if (state.settings.backgroundKind === 'animated') startBackground.start();
  else startBackground.draw();
  canvas.classList.toggle('static', state.settings.backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && state.settings.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && state.settings.backgroundKind === 'image');
}

function showStartPage(show = true) {
  state.showStart = show;
  state.reader = null;
  if (show) {
    state.view?.destroy?.();
    state.view = null;
  } else mountView();
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'template': return newPlan(value);
    case 'open': return openWithDialog();
    case 'import': return openWithDialog();
    case 'open-recent': return openRecent(value);
    case 'remove-recent': state.recent = removeRecent(state.recent, value); storeRecent(globalThis.localStorage, state.recent); return renderStartPage();
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); notify('success', t('notice.recentCleared')); return renderStartPage();
    case 'open-folder': return openWithDialog(value);
    case 'remove-folder': state.recentDirs = removeRecent(state.recentDirs, value); storeRecentDirs(globalThis.localStorage, state.recentDirs); return renderStartPage();
    case 'clear-folders': state.recentDirs = []; storeRecentDirs(globalThis.localStorage, []); return renderStartPage();
    case 'open-sample': return openPath(value);
    case 'builtin-sample': return openSampleBuiltin();
    case 'tutorial': return startTutorial();
    case 'guide': return openUserGuide();
    case 'tutorial-doc': return openReader('tutorial');
    case 'shortcuts': return run('shortcuts');
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
  if (startBackground && startBackground.kind !== s.animation) startBackgroundChangedAt = Date.now();
  startBackground?.setKind(s.animation);
  const showStart = state.showStart || !activeDoc();
  const animated = s.backgroundKind === 'animated' && !showStart && !s.animationOnStartOnly && s.backgroundOpacity > 0;
  layer.classList.toggle('animated', animated);
  layer.classList.toggle('image', s.backgroundKind === 'image' && Boolean(state.backgroundUrl));
  layer.style.setProperty('--bg-opacity', String(s.backgroundOpacity / 100));
  const image = layer.querySelector('.image-bg');
  const fit = s.backgroundFit;
  image.style.backgroundImage = state.backgroundUrl && s.backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none';
  image.style.backgroundSize = { cover: 'cover', contain: 'contain', tile: 'auto', center: 'auto', stretch: '100% 100%' }[fit];
  image.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
  if (animated) appBackground.start(); else appBackground.stop();
  if (showStart && startBackground) {
    if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); }
  }
}

// Start page: a different animation at every start (Settings › Background › random), and a
// new one every few seconds while the start page shows (animationInterval; 0 = never).
let startBackgroundChangedAt = Date.now();

function randomAnimation(current) {
  const others = ANIMATIONS.filter((kind) => kind !== current);
  return others[Math.floor(Math.random() * others.length)];
}

/** Fades the start page background out, switches to another animation, fades it back in. */
function rotateStartBackground() {
  startBackgroundChangedAt = Date.now();
  const next = randomAnimation(state.settings.animation);
  const canvas = root.querySelector('#start-page .start-bg');
  if (!canvas) return updateSettings({ animation: next }, { quiet: true });
  canvas.classList.add('fading');
  setTimeout(() => {
    updateSettings({ animation: next }, { quiet: true });
    root.querySelector('#start-page .start-bg')?.classList.remove('fading');
  }, 450);
  return undefined;
}

function tickStartBackground() {
  const s = state.settings;
  const showing = (state.showStart || !activeDoc()) && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  // The clock runs only while the start page is on screen.
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) rotateStartBackground();
}

// ───────────────────────── critical path (toolbar toggle)

/** On: the critical path is found and highlighted (critical bars, links and rows stand out; the rest dims). */
let criticalMode = false;

/** Settings as the views see them: the critical-path mode always shows critical tasks. */
const viewSettings = () => (criticalMode ? { ...state.settings, showCritical: true } : state.settings);

function toggleCriticalPath() {
  criticalMode = !criticalMode;
  const doc = activeDoc();
  let showFirst = null;
  if (criticalMode && doc) {
    // Forward and backward passes, then the driving critical chains that reach the project finish.
    doc.recalculate();
    const cp = criticalPath(doc.project, doc.sched);
    const name = (id) => `${doc.sched.info(id).row}. ${P.findTask(doc.project, id)?.name ?? ''}`;
    if (cp.ids.size) {
      notify('success', t('notice.criticalPath', { count: cp.ids.size, chains: cp.chains.length, from: name(cp.chains[0][0]), to: name(cp.chains[0].at(-1)), finish: formatDay(cp.finish, state.settings.dateFormat) }));
      showFirst = cp.chains[0][0];
    } else {
      notify('info', t('notice.criticalNone'));
    }
  } else {
    notify('info', t('notice.criticalOff'));
  }
  renderAll();
  // After the redraw: bring the start of the critical path into view (Gantt views).
  if (showFirst) requestAnimationFrame(() => state.view?.scrollToTask?.(showFirst));
}

function shuffleBackground() {
  const next = (startBackground ?? appBackground)?.shuffle() ?? 'aurora';
  updateSettings({ animation: next, backgroundKind: 'animated' });
  notify('info', t('notice.animation', { name: t(`animation.${next}`) }));
}

async function loadBackground() {
  try {
    state.backgroundUrl = await native.backgroundUrl(state.settings);
  } catch (error) {
    state.backgroundUrl = null;
    showError('error.background', error);
  }
  updateBackgroundState();
  if (state.showStart || !activeDoc()) renderStartPage();
}

async function chooseBackground() {
  try {
    if (desktop) {
      const path = await native.chooseImage(state.settings.lastDirectory);
      if (path) await setBackgroundFromPath(path);
    } else {
      const [file] = await native.pickWithInput('image/*');
      if (file) await setBackgroundFromFile(file);
    }
  } catch (error) {
    showError('error.background', error);
  }
}

async function setBackgroundFromPath(path) {
  const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op));
  rememberDirectory(directoryOf(path));
  updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image', lastDirectory: directoryOf(path) || state.settings.lastDirectory });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function setBackgroundFromFile(file) {
  await withProgress('progress.background', file.name, async () => native.storeWebBackground(file));
  updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' });
  await loadBackground();
  notify('success', t('notice.background'));
}

async function removeBackground() {
  await native.clearBackground();
  state.backgroundUrl = null;
  updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: state.settings.backgroundKind === 'image' ? 'animated' : 'none' });
  notify('success', t('notice.backgroundCleared'));
}

// ───────────────────────── settings, theme, zoom

function setZoom(value) {
  const zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round(value / ZOOM.step) * ZOOM.step));
  if (zoom === state.settings.zoom) return;
  updateSettings({ zoom });
}

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if (quiet) return;
  applySettings(previous);
}

/** Applies settings after a change (from this window or from the settings popup). */
function applySettings(previous = {}) {
  const s = state.settings;
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  if (s.language !== getLanguage()) {
    setLanguage(s.language);
    native.setBackendLanguage(s.language);
    if (previous.language) notify('info', t('notice.language'));
  }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  for (const doc of state.docs) {
    for (const key of ['hoursPerDay', 'hoursPerWeek', 'daysPerMonth']) {
      if (previous[key] != null && s[key] !== previous[key]) { doc.project.options[key] = s[key]; doc.touch(); doc.recalculate(); }
    }
  }
  const needsRemount = ['zoom', 'rowHeight', 'timescale', 'language', 'dateFormat', 'showTime'].some((key) => s[key] !== previous[key]);
  if (needsRemount && !state.showStart) mountView();
  renderAll();
  // Font and size settings change how wide the toolbar is.
  updateMinimumWidth();
}

/** Theme dropdown: a popup with the dark and the light themes in two columns. */
async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const result = await popups.open('theme', { current: state.settings.theme }, { anchor: anchor ?? anchorBelow(element) });
  if (result?.theme) updateSettings({ theme: result.theme });
}

// ───────────────────────── progress

/**
 * Runs a long task; when it takes longer than a moment, a progress popup shows
 * how far it got (bytes read/written by the backend, or steps of a calculation).
 */
async function withProgress(titleKey, name, task) {
  const op = P.newId('op');
  let shown = false;
  let last = null;
  const timer = setTimeout(() => {
    shown = true;
    popups.open('progress', { title: t(titleKey), name, op, last });
  }, 250);
  const unlisten = await native.listen('io-progress', (progress) => {
    if (progress.op !== op) return;
    last = progress;
    if (shown) popups.post('progress', { type: 'progress', ...progress });
  });
  try {
    return await task(op, (progress) => {
      last = { op, ...progress };
      if (shown) popups.post('progress', { type: 'progress', ...last });
    });
  } finally {
    clearTimeout(timer);
    unlisten();
    if (shown) {
      popups.post('progress', { type: 'done' });
      setTimeout(() => popups.close('progress'), 300);
    }
  }
}

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

// ───────────────────────── files

const findOpenDoc = (path) => state.docs.find((doc) => doc.path && doc.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());

function rememberRecent(entry) {
  state.recent = addRecent(state.recent, entry);
  storeRecent(globalThis.localStorage, state.recent);
  if (!entry.web) rememberDirectory(directoryOf(entry.path));
}

function rememberDirectory(dir) {
  if (!dir) return;
  state.recentDirs = addRecent(state.recentDirs, { path: dir });
  storeRecentDirs(globalThis.localStorage, state.recentDirs);
  if (state.settings.lastDirectory !== dir) updateSettings({ lastDirectory: dir }, { quiet: true });
}

/** A project from file text by its type: .mwp/.mwpt/.json, MS Project XML, CSV. */
function parseAny(name, text) {
  if (isXmlFileName(name) || /^\s*(<\?xml|<Project)/.test(text)) return { project: importMspdi(text, { language: getLanguage() }), template: false, imported: true };
  if (isCsvFileName(name)) return { project: importCsv(text, { language: getLanguage(), title: stripExtension(name) }), template: false, imported: true };
  const parsed = parsePlan(text, getLanguage());
  return { ...parsed, template: parsed.template || isTemplateFileName(name) };
}

async function openPath(path, { quiet = false } = {}) {
  const existing = findOpenDoc(path);
  if (existing) {
    activateDoc(existing.id);
    if (!quiet) notify('info', t('notice.alreadyOpen', { name: baseName(path) }));
    return existing;
  }
  try {
    const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
    const { project, template, imported } = parseAny(baseName(path), text);
    const doc = new PlanDocument(project, { path: template || imported ? null : path, name: template || imported ? project.title : null, template });
    if (imported) doc.saved = '';
    addDocument(doc);
    rememberRecent({ path, title: project.title });
    if (!quiet) notify('success', t(imported ? 'notice.imported' : 'notice.opened', { name: baseName(path) }));
    return doc;
  } catch (error) {
    showError('error.open', error, path);
    return null;
  }
}

function openText(name, text, handle = null) {
  try {
    const { project, template, imported } = parseAny(name, text);
    const doc = new PlanDocument(project, { name: template || imported ? project.title : name, handle: template || imported ? null : handle, template });
    if (imported) doc.saved = '';
    addDocument(doc);
    rememberRecent({ path: name, title: project.title, web: true });
    notify('success', t('notice.opened', { name }));
    return doc;
  } catch (error) {
    showError('error.open', error, name);
    return null;
  }
}

async function openWithDialog(directory = null) {
  try {
    if (desktop) {
      const paths = await native.choosePlansToOpen(directory ?? state.settings.lastDirectory);
      for (const path of paths) await openPath(path);
    } else {
      const files = await native.pickPlanFilesWeb();
      for (const file of files) openText(file.name, file.text, file.handle);
    }
  } catch (error) {
    showError('error.open', error);
  }
}

async function openRecent(path) {
  const item = state.recent.find((entry) => entry.path === path);
  if (item?.web || !desktop) {
    const handle = await native.loadWebHandle(path);
    if (handle?.getFile) {
      try {
        if ((await handle.queryPermission?.({ mode: 'read' })) !== 'granted') await handle.requestPermission?.({ mode: 'read' });
        const file = await handle.getFile();
        return openText(file.name, await file.text(), handle);
      } catch (error) {
        return showError('error.open', error, path);
      }
    }
    return notify('info', t('notice.webRecent'));
  }
  const [exists] = await native.pathsExist([path]);
  if (!exists) {
    const choice = await ask({
      icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage', { path }),
      buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.removeEntry'), icon: 'trash', primary: true }],
    });
    if (choice === 'remove') { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderAll(); }
    return null;
  }
  return openPath(path);
}

function clearRecentAll() {
  state.recent = [];
  state.recentDirs = [];
  storeRecent(globalThis.localStorage, []);
  storeRecentDirs(globalThis.localStorage, []);
  notify('success', t('notice.recentCleared'));
  renderAll();
}

async function recentFoldersMenu(anchor) {
  const items = state.recentDirs.length
    ? state.recentDirs.map((item, index) => ({ id: `custom:dir:${index}`, label: item.path, icon: 'folder' }))
    : [{ id: 'none', label: t('recent.noFolders'), icon: 'info', disabled: true }];
  const handlers = Object.fromEntries(state.recentDirs.map((item, index) => [`custom:dir:${index}`, () => openWithDialog(item.path)]));
  return showMenu(items, anchor ?? anchorBelow(root.querySelector('[data-menu="file"]')), 'context', { handlers, header: { icon: 'recentFolder', title: t('action.recentFolders') } });
}

/** Saves a plan. Plans opened from a template, imports and new plans ask for a file name. */
async function saveDoc(doc, { saveAs = false } = {}) {
  if (!doc) return false;
  const text = doc.text();
  const suggested = `${(doc.path ? stripExtension(baseName(doc.path)) : doc.project.title || 'plan').replace(/[\\/:*?"<>|]/g, '_')}.mwp`;
  try {
    if (desktop) {
      let path = doc.path;
      if (!path || saveAs || extensionOf(path) !== 'mwp') {
        const dir = doc.path ? directoryOf(doc.path) : state.settings.lastDirectory;
        path = await native.chooseSavePath(dir ? `${dir}/${suggested}` : suggested, ['mwp']);
        if (!path) return false;
        path = withExtension(path, 'mwp');
      }
      await withProgress('progress.save', baseName(path), (op) => native.writeTextFile(path, text, op));
      doc.markSaved(path);
      doc.name = null;
      rememberRecent({ path, title: doc.project.title });
    } else {
      const saved = await native.saveFileWeb(text, { name: suggested, handle: doc.handle, saveAs: saveAs || !doc.handle });
      if (!saved) return false;
      doc.handle = saved.handle;
      doc.name = saved.name;
      doc.markSaved(null);
      if (saved.handle) native.storeWebHandle(saved.name, saved.handle);
      rememberRecent({ path: saved.name, title: doc.project.title, web: true });
    }
    persistSession();
    renderAll();
    // A database is set up: the plan goes there too (the file stays the local copy).
    if (dbActive()) {
      const stored = await saveToDatabase(doc, { quiet: true });
      if (stored) notify('success', t('notice.savedBoth', { name: docName(doc), where: dbDescribe(state.settings) }));
      return stored;
    }
    notify('success', t('notice.saved', { name: docName(doc) }));
    return true;
  } catch (error) {
    showError('error.save', error, doc.path ?? docName(doc));
    return false;
  }
}

async function saveAll() {
  for (const doc of state.docs.filter((item) => item.dirty)) {
    activateDoc(doc.id);
    if (!(await saveDoc(doc))) return false;
  }
  return true;
}

// ───────────────────────── plans in a database (desktop; Settings › Database)

/** The database password for this run of the app (when it is not saved in the settings). */
let dbSessionPassword = '';

/** A database is chosen in Settings: saving writes the file and the database. */
const dbActive = () => desktop && Boolean(state.settings.dbKind) && state.settings.dbKind !== 'none';

/** Connection settings, or null after pointing the user at Settings › Database. */
function dbReady() {
  const settings = loadSettings(globalThis.localStorage);
  const problems = dbProblems(settings);
  if (problems.length) {
    notify('info', `${t('notice.dbSetup')} (${problems.map((code) => t(code)).join(' · ')})`);
    popups.open('settings', { tab: 'database' });
    return null;
  }
  return { config: dbConfig(settings, dbSessionPassword), where: dbDescribe(settings) };
}

/** Stores the plan (its .mwp text) in the database, replacing an earlier copy. */
async function saveToDatabase(doc, { quiet = false } = {}) {
  if (!doc || !desktop) return false;
  const db = dbReady();
  if (!db) return false;
  try {
    const id = doc.dbId ?? doc.project.id ?? P.newId('prj');
    const text = doc.text();
    await withProgress('progress.dbSave', db.where, () => native.dbSave(db.config, { id, title: doc.project.title || docName(doc), data: text }));
    doc.dbId = id;
    // A plan without a file now lives in the database: no unsaved changes left.
    if (!doc.path) {
      doc.name = doc.name ?? doc.project.title;
      doc.markSaved(null);
    }
    persistSession();
    renderAll();
    if (!quiet) notify('success', t('notice.dbSaved', { name: docName(doc), where: db.where }));
    return true;
  } catch (error) {
    showError('error.dbSave', error, db.where);
    return false;
  }
}

const dbList = (db) => withProgress('progress.dbList', db.where, () => native.dbList(db.config));

/** Lists the stored plans in a popup: open one, or delete it. */
async function openFromDatabase() {
  if (!desktop) return;
  const db = dbReady();
  if (!db) return;
  let items;
  try {
    items = await dbList(db);
  } catch (error) {
    showError('error.dbOpen', error, db.where);
    return;
  }
  const result = await popups.open('database', { items, where: db.where });
  if (result?.action === 'open' && result.id) await openDatabasePlan(result.id);
}

async function openDatabasePlan(id) {
  const existing = state.docs.find((doc) => doc.dbId === id);
  if (existing) {
    activateDoc(existing.id);
    notify('info', t('notice.alreadyOpen', { name: docName(existing) }));
    return existing;
  }
  const db = dbReady();
  if (!db) return null;
  try {
    const row = await withProgress('progress.dbLoad', db.where, () => native.dbLoad(db.config, id));
    if (!row) {
      notify('error', t('notice.dbMissing', { name: id }));
      return null;
    }
    const { project } = parseAny(`${row.title || 'plan'}.mwp`, row.data);
    const doc = new PlanDocument(project, { name: row.title || project.title });
    doc.dbId = id;
    addDocument(doc);
    notify('success', t('notice.dbOpened', { name: docName(doc) }));
    return doc;
  } catch (error) {
    showError('error.dbOpen', error, db.where);
    return null;
  }
}

async function deleteDatabasePlan(id, title) {
  const db = dbReady();
  if (!db) return;
  const choice = await ask({
    icon: 'warning', title: t('db.deleteTitle'), message: t('db.deleteMessage', { name: title || id }),
    buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'delete', label: t('db.delete'), icon: 'trash', primary: true }],
  });
  if (choice !== 'delete') return;
  try {
    await native.dbDelete(db.config, id);
    for (const doc of state.docs) if (doc.dbId === id) doc.dbId = null;
    notify('success', t('notice.dbDeleted', { name: title || id }));
    popups.post('database', { type: 'db-list', items: await dbList(db) });
  } catch (error) {
    showError('error.dbOpen', error, db.where);
  }
}

/** Settings › Database › Test connection (run here, so the password for this run is known). */
async function testDatabase(password, kind) {
  const settings = loadSettings(globalThis.localStorage);
  const problems = dbProblems(settings);
  if (problems.length) return popups.post(kind, { type: 'db-result', ok: false, text: problems.map((code) => t(code)).join(' · ') });
  try {
    const version = await native.dbTest(dbConfig(settings, password || dbSessionPassword));
    if (password && !settings.dbSavePassword) dbSessionPassword = password;
    return popups.post(kind, { type: 'db-result', ok: true, text: t('db.testOk', { version }) });
  } catch (error) {
    return popups.post(kind, { type: 'db-result', ok: false, text: native.errorText(error) });
  }
}

async function chooseDatabaseFile() {
  const settings = loadSettings(globalThis.localStorage);
  const fallback = state.settings.lastDirectory ? `${state.settings.lastDirectory}/myworkplan.db` : 'myworkplan.db';
  const file = await native.chooseDatabaseFile(settings.dbFile || fallback);
  if (file) updateSettings({ dbFile: file });
}

/** Template, MS Project XML, CSV or JSON copy of the plan. */
async function exportAs(type) {
  const doc = activeDoc();
  if (!doc) return;
  const content = type === 'xml' ? exportMspdi(doc.project, doc.sched)
    : type === 'csv' ? exportCsv(doc.project, doc.sched, { language: getLanguage() })
      : type === 'mwpt' ? doc.text({ template: true })
        : doc.text();
  const name = `${(doc.path ? stripExtension(baseName(doc.path)) : doc.project.title || 'plan').replace(/[\\/:*?"<>|]/g, '_')}.${type}`;
  try {
    if (desktop) {
      const dir = state.settings.lastDirectory;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
      if (!path) return;
      path = withExtension(path, type);
      await withProgress('progress.export', baseName(path), (op) => native.writeTextFile(path, content, op));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(content, { name, saveAs: true, mime: type === 'xml' ? 'text/xml' : type === 'csv' ? 'text/csv' : 'application/json' });
      if (saved) notify('success', t('notice.exported', { name: saved.name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
}

/** The Gantt chart of the whole plan as a PNG picture. */
const IMAGE_CHOICE_KEY = 'myworkplan.imageExport';

/** The Gantt chart as an image file: PNG, JPEG, WebP, BMP, TIFF or SVG, with a transparent or white background. */
async function exportImage(options) {
  const doc = activeDoc();
  if (!doc) return;
  const drawing = (content, transparent) => renderPrintSvg(doc.project, doc.sched, { single: true, content, transparent, language: getLanguage(), dateFormat: state.settings.dateFormat, columns: ['name', 'duration', 'start', 'finish'], t });
  let choice = options;
  if (!choice) {
    let last = null;
    try { last = JSON.parse(localStorage.getItem(IMAGE_CHOICE_KEY) ?? 'null'); } catch { /* none yet */ }
    const sizes = Object.fromEntries(CONTENTS.map((content) => { const { width, height } = drawing(content, false); return [content, { width, height }]; }));
    choice = await popups.open('image', { sizes, last });
    if (!choice?.format) return;
    try { localStorage.setItem(IMAGE_CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode */ }
  }
  const format = imageFormat(choice.format);
  const transparent = format.alpha && choice.transparent !== false;
  const name = `${(doc.project.title || 'plan').replace(/[\/:*?"<>|]/g, '_')}.${format.ext}`;
  try {
    const blob = await withProgress('progress.image', name, async (op, report) => {
      report?.({ done: 1, total: 4 });
      const { svg, width, height } = drawing(choice.content ?? 'both', transparent);
      if (format.encoder === 'svg') return new Blob([svg], { type: format.mime });
      report?.({ done: 2, total: 4 });
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const size = rasterSize(width, height, choice.scale ?? 2);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!transparent) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      report?.({ done: 3, total: 4 });
      if (format.encoder === 'canvas') {
        return new Promise((resolve, reject) => canvas.toBlob((b) => (b?.type === format.mime ? resolve(b) : reject(new Error(`${format.mime}: not supported by this system`))), format.mime, (choice.quality ?? 92) / 100));
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const bytes = format.encoder === 'bmp' ? encodeBmp(pixels, canvas.width, canvas.height) : encodeTiff(pixels, canvas.width, canvas.height);
      return new Blob([bytes], { type: format.mime });
    });
    if (desktop) {
      const dir = state.settings.lastDirectory;
      const type = format.ext === 'jpg' ? 'jpg' : format.ext;
      let path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [type]);
      if (!path) return;
      if (!(native.SAVE_TYPES[type]?.extensions ?? [format.ext]).includes(extensionOf(path))) path = withExtension(path, format.ext);
      const data = await blobToBase64(blob);
      await withProgress('progress.export', baseName(path), (op) => native.writeBase64File(path, data, op));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      await native.saveFileWeb(blob, { name, saveAs: true, mime: format.mime });
      notify('success', t('notice.exported', { name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ───────────────────────── report export (HTML, Markdown, Word, PDF)

const REPORT_FORMATS = {
  html: { mime: 'text/html', text: true },
  md: { mime: 'text/markdown', text: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { mime: 'application/pdf' },
};

/** Export report: a menu of the formats, below the report's button or near the middle of the window. */
function chooseReportFormat(context = {}) {
  const anchor = context.element ? anchorBelow(context.element) : { ...toScreen(Math.max(0, window.innerWidth / 2 - 140), window.innerHeight / 3), flipY: toScreen(0, window.innerHeight / 3).y };
  return showMenu(menuItems(SUBMENUS.reportExport.items), anchor, 'context', { header: { icon: 'exportReport', title: t('submenu.reportExport') } });
}

/** The current report (Report menu / reports view) as an HTML, Markdown, Word or PDF file. */
async function exportReport(format) {
  const doc = activeDoc();
  const spec = REPORT_FORMATS[format];
  if (!doc || !spec) return;
  const model = reportModel(appApi, doc.view.report ?? 'overview');
  const name = reportFileName(model, format);
  try {
    let path = null;
    if (desktop) {
      const dir = state.settings.lastDirectory;
      path = await native.chooseSavePath(dir ? `${dir}/${name}` : name, [format]);
      if (!path) return;
      path = withExtension(path, format);
    }
    const content = await withProgress('progress.report', path ? baseName(path) : name, async (op, report) => {
      if (format === 'html') return reportToHtml(model);
      if (format === 'md') return reportToMarkdown(model);
      if (format === 'docx') return reportToDocx(model, { images: await chartPngs(model) });
      return reportToPdf(model, { onProgress: (done, total) => report?.({ done, total }) });
    });
    if (desktop) {
      await withProgress('progress.export', baseName(path), (op) => (spec.text ? native.writeTextFile(path, content, op) : native.writeBase64File(path, bytesToBase64(content), op)));
      rememberDirectory(directoryOf(path));
      notify('success', t('notice.exported', { name: baseName(path) }));
    } else {
      const saved = await native.saveFileWeb(new Blob([content], { type: spec.mime }), { name, saveAs: true, mime: spec.mime });
      if (saved) notify('success', t('notice.exported', { name: saved.name }));
    }
  } catch (error) {
    showError('error.export', error, name);
  }
}

async function insertProjectFile() {
  try {
    let source = null;
    if (desktop) {
      const [path] = await native.choosePlansToOpen(state.settings.lastDirectory);
      if (!path) return;
      const text = await withProgress('progress.open', baseName(path), (op) => native.readTextFile(path, op));
      source = parseAny(baseName(path), text).project;
    } else {
      const [file] = await native.pickPlanFilesWeb();
      if (!file) return;
      source = parseAny(file.name, file.text).project;
    }
    const index = insertIndex();
    const ids = change('op.insertProject', (project) => {
      // The inserted plan becomes a summary task with its tasks under it; resources are merged by name.
      const summary = P.insertTask(project, index, { name: source.title, estimated: false });
      const map = new Map();
      for (const r of source.resources) {
        const same = project.resources.find((x) => x.name === r.name);
        map.set(r.id, same ? same.id : P.addResource(project, { ...r, id: undefined }).id);
      }
      const copied = { tasks: source.tasks, assignments: source.assignments.map((a) => ({ ...a, resourceId: map.get(a.resourceId) })) };
      const pasted = P.pasteTasks(project, copied, index + 1, summary.outlineLevel + 1);
      return [summary.id, ...pasted];
    });
    select('task', [ids[0]]);
    notify('success', t('notice.inserted', { name: source.title, count: ids.length - 1 }));
  } catch (error) {
    showError('error.open', error);
  }
}

async function closeDoc(doc, { force = false } = {}) {
  if (!doc) return true;
  if (doc.dirty && !force) {
    activateDoc(doc.id);
    const choice = await ask({
      icon: 'save', title: t('confirm.closeTitle'), message: t('confirm.closeMessage', { name: docName(doc) }),
      buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
    });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(doc))) return false;
  }
  const index = state.docs.indexOf(doc);
  state.docs.splice(index, 1);
  if (state.active === doc.id) {
    const next = state.docs[Math.min(index, state.docs.length - 1)];
    state.active = next?.id ?? null;
    state.selection = { kind: null, ids: [], link: null, anchor: null };
    if (!next) state.showStart = true;
    mountView();
  }
  persistSession();
  renderAll();
  return true;
}

async function closeAll() {
  for (const doc of [...state.docs]) if (!(await closeDoc(doc))) return false;
  return true;
}

// ───────────────────────── print

function openPrint() {
  const doc = activeDoc();
  const rows = taskRows().filter((row) => row.task).map((row) => row.id);
  let setup = {};
  try { setup = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { setup = {}; }
  popups.open('print', {
    project: doc.project,
    title: doc.project.title,
    visible: rows,
    selected: selectedTasks(),
    columns: currentColumns('task').filter((id) => id !== 'indicators' && id !== 'mode'),
    view: doc.view.id,
    setup,
    dateFormat: state.settings.dateFormat,
    showCritical: state.settings.showCritical,
  });
}

// ───────────────────────── confirmation & exit

async function ask(params) {
  const result = await popups.open('confirm', params);
  return result?.choice ?? 'cancel';
}

async function requestExit() {
  if (desktop) return appWindow.close();
  return undefined;
}

/** Before the window closes: unsaved plans → save / don't save / cancel. */
async function confirmExit() {
  const dirty = state.docs.filter((doc) => doc.dirty);
  if (!dirty.length) return true;
  const choice = await ask({
    kind: 'exit', icon: 'save', title: t('confirm.exitTitle'), message: t('confirm.exitMessage'),
    items: dirty.map(docName),
    buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('confirm.save'), icon: 'save', primary: true }],
  });
  if (choice === 'save') return saveAll();
  return choice === 'discard';
}

// ───────────────────────── information popups

function taskListForPopup(project) {
  const sched = activeDoc().sched;
  return project.tasks.map((task) => ({ id: task.id, row: sched.info(task.id)?.row, name: task.name, summary: sched.info(task.id)?.summary, level: task.outlineLevel }));
}

async function openTaskInfo(id, tab = 'general') {
  const doc = activeDoc();
  const ids = id ? [id] : selectedTasks();
  if (!doc || !ids.length) return;
  const multi = ids.length > 1;
  const task = P.findTask(doc.project, ids[0]);
  if (!task) return;
  const info = doc.sched.info(task.id);
  const result = await popups.open('task', {
    tab, multi, count: ids.length,
    task, info: { ...info, children: undefined }, assignments: doc.project.assignments.filter((a) => a.taskId === task.id),
    tasks: taskListForPopup(doc.project), resources: doc.project.resources, calendars: doc.project.calendars.map((cal) => ({ id: cal.id, name: cal.name })),
    options: doc.project.options, dateFormat: state.settings.dateFormat, start: fromMin(info.start), finish: fromMin(info.finish),
  });
  if (result?.action !== 'apply') return;
  try {
    change('op.taskInfo', (project) => {
      for (const targetId of ids) applyTaskPatch(project, targetId, result, multi);
    });
    notify('success', t('notice.taskUpdated', { count: ids.length }));
  } catch (error) {
    showError('error.input', error);
  }
}

/** Applies the Task Information popup's result to one task. */
function applyTaskPatch(project, id, result, multi) {
  const task = P.findTask(project, id);
  if (!task) return;
  const sched = activeDoc().sched;
  const p = result.patch ?? {};
  const set = (key) => key in p && (!multi || p[key] !== undefined);
  for (const key of ['name', 'priority', 'notes', 'hyperlink', 'type', 'effortDriven', 'manual', 'active', 'calendarId', 'text1', 'text2', 'text3', 'number1', 'flag1', 'barColor', 'hideBar', 'timeline', 'fixedCost', 'deadline', 'constraint', 'estimated']) {
    if (set(key) && !(multi && key === 'name')) task[key] = p[key];
  }
  if (set('duration') && !sched.info(id)?.summary) P.setTaskDuration(project, id, p.duration, p.durationUnit ?? task.durationUnit);
  if (set('milestone')) { task.milestone = p.milestone; if (p.milestone) task.duration = 0; else if (!task.duration) task.duration = 480; }
  if (set('manualStart') && task.manual) { task.start = p.manualStart; task.finish = p.manualFinish ?? task.finish; }
  if (set('percentComplete') && !sched.info(id)?.summary) setPercentComplete(project, sched, [id], p.percentComplete);
  if (result.predecessors && !multi) {
    const before = task.predecessors;
    task.predecessors = result.predecessors.filter((link) => link.taskId !== id && P.findTask(project, link.taskId));
    if (task.predecessors.some((link) => P.wouldCycle({ ...project, tasks: project.tasks.map((x) => (x.id === id ? { ...x, predecessors: before } : x)) }, link.taskId, id) && !before.some((b) => b.taskId === link.taskId))) {
      task.predecessors = before;
      throw new Error(t('field.loop'));
    }
  }
  if (result.assignments && !multi) {
    const keep = new Set(result.assignments.map((a) => a.resourceId));
    for (const a of project.assignments.filter((x) => x.taskId === id && !keep.has(x.resourceId))) P.unassignResource(project, id, a.resourceId);
    for (const a of result.assignments) P.assignResource(project, id, a.resourceId, a.units, a.cost != null ? { cost: a.cost } : {});
  }
}

async function openResourceInfo(id) {
  const doc = activeDoc();
  const resource = P.findResource(doc?.project, id);
  if (!resource) return;
  const result = await popups.open('resource', {
    resource, calendars: doc.project.calendars.map((cal) => ({ id: cal.id, name: cal.name })), options: doc.project.options,
    assignments: doc.project.assignments.filter((a) => a.resourceId === id).map((a) => ({ ...a, taskName: P.findTask(doc.project, a.taskId)?.name ?? '', work: doc.sched.assignments.get(a.id)?.work ?? 0 })),
    info: { work: doc.sched.resources.get(id)?.work ?? 0, cost: doc.sched.resources.get(id)?.cost ?? 0, overallocated: doc.sched.resources.get(id)?.overallocated ?? false, peak: doc.sched.resources.get(id)?.peak ?? 0 },
  });
  if (result?.action !== 'apply') return;
  change('op.resourceInfo', (project) => {
    const target = P.findResource(project, id);
    Object.assign(target, result.patch);
    for (const a of result.assignments ?? []) {
      const existing = project.assignments.find((x) => x.id === a.id);
      if (existing) existing.units = a.units;
    }
  });
  notify('success', t('notice.resourceUpdated', { name: result.patch.name ?? resource.name }));
}

async function openLinkInfo(from, to) {
  const doc = activeDoc();
  const succ = P.findTask(doc.project, to);
  const link = succ?.predecessors.find((item) => item.taskId === from);
  if (!link) return;
  const result = await popups.open('link', { from: { row: P.rowOf(doc.project, from), name: P.findTask(doc.project, from)?.name }, to: { row: P.rowOf(doc.project, to), name: succ.name }, link, options: doc.project.options });
  if (result?.action === 'delete') {
    change('op.unlink', (project) => P.unlinkTasks(project, from, to));
    notify('success', t('notice.linkDeleted'));
  } else if (result?.action === 'apply') {
    change('op.editLink', (project) => P.linkTasks(project, from, to, result.type, result.lag, result.lagUnit));
    notify('success', t('notice.linkUpdated'));
  }
}

function infoForSelection() {
  if (state.selection.kind === 'resource') return openResourceInfo(selectedResources()[0]);
  if (state.selection.kind === 'link') return openLinkInfo(state.selection.link.from, state.selection.link.to);
  return openTaskInfo(selectedTasks().length > 1 ? null : selectedTasks()[0]);
}

async function openProjectInfo(tab = 'general') {
  const doc = activeDoc();
  const s = doc.sched;
  const top = (key) => s[key];
  const baseline = [...s.tasks.values()].filter((info) => !info.parentId && info.baseline);
  const stats = {
    start: s.start, finish: s.finish, duration: s.duration, work: top('work'), cost: top('cost'), actualWork: top('actualWork'), actualCost: top('actualCost'), percentComplete: s.percentComplete,
    baselineStart: baseline.length ? Math.min(...baseline.map((info) => info.baseline.start)) : null,
    baselineFinish: baseline.length ? Math.max(...baseline.map((info) => info.baseline.finish)) : null,
    baselineCost: baseline.reduce((sum, info) => sum + (info.baseline.cost ?? 0), 0),
    baselineWork: baseline.reduce((sum, info) => sum + (info.baseline.work ?? 0), 0),
    tasks: doc.project.tasks.length, milestones: doc.project.tasks.filter((x) => x.milestone).length, resources: doc.project.resources.length,
    critical: [...s.tasks.values()].filter((info) => info.critical && !info.summary).length, late: [...s.tasks.values()].filter((info) => info.late && !info.summary).length,
    conflicts: s.conflicts.length,
  };
  const { tasks, resources, assignments, ...properties } = doc.project;
  void tasks; void resources; void assignments;
  const result = await popups.open('project', { tab, project: properties, stats, dateFormat: state.settings.dateFormat });
  if (result?.action !== 'apply') return;
  change('op.projectInfo', (project) => {
    Object.assign(project, result.patch);
    project.options = { ...project.options, ...(result.options ?? {}) };
  });
  notify('success', t('notice.projectUpdated'));
}

async function openCalendar() {
  const doc = activeDoc();
  const result = await popups.open('calendar', { calendars: doc.project.calendars, projectCalendar: doc.project.calendarId, start: doc.project.start, finish: fromMin(doc.sched.finish), dateFormat: state.settings.dateFormat });
  if (result?.action !== 'apply') return;
  change('op.calendar', (project) => {
    project.calendars = result.calendars;
    if (result.projectCalendar) project.calendarId = result.projectCalendar;
    const ids = new Set(project.calendars.map((cal) => cal.id));
    for (const task of project.tasks) if (task.calendarId && !ids.has(task.calendarId)) task.calendarId = null;
    for (const r of project.resources) if (r.calendarId && !ids.has(r.calendarId)) r.calendarId = null;
  });
  notify('success', t('notice.calendarUpdated'));
}

async function openBaseline(mode) {
  const doc = activeDoc();
  const saved = Object.keys(doc.project.baselineDates ?? {}).map(Number);
  const result = await popups.open('baseline', { mode, saved, dates: doc.project.baselineDates ?? {}, selected: selectedTasks().length, dateFormat: state.settings.dateFormat });
  if (!result?.action) return;
  const ids = result.scope === 'selected' ? selectedTasks() : null;
  if (result.action === 'set') {
    const count = change('op.baseline', (project) => {
      if (result.keepCopy && result.index === 0 && saved.includes(0)) copyBaseline(project, 0, result.copyTo ?? 1);
      return setBaseline(project, doc.sched, result.index, ids);
    });
    notify('success', t('notice.baselineSet', { index: result.index, count }));
  } else if (result.action === 'clear') {
    const count = change('op.baselineClear', (project) => clearBaseline(project, result.index, ids));
    notify('success', t('notice.baselineCleared', { index: result.index, count }));
  }
}

async function openUpdateTasks() {
  const doc = activeDoc();
  const id = selectedTasks()[0];
  const task = P.findTask(doc.project, id);
  const info = doc.sched.info(id);
  if (!task || !info || info.summary) return notify('info', t('notice.leafOnly'));
  const result = await popups.open('update', { mode: 'task', task, info: { start: info.start, finish: info.finish, duration: info.duration, actualDuration: info.actualDuration, remainingDuration: info.remainingDuration, percentComplete: info.percentComplete }, options: doc.project.options, dateFormat: state.settings.dateFormat });
  if (result?.action !== 'apply') return;
  change('op.progress', (project) => updateProgress(project, doc.sched, id, result.values));
  notify('success', t('notice.taskUpdated', { count: 1 }));
}

async function openUpdateProject() {
  const doc = activeDoc();
  const result = await popups.open('update', { mode: 'project', statusDate: doc.project.statusDate ?? fromMin(dayStart(dayOf(nowMin())) + 1020), selected: selectedTasks().length, dateFormat: state.settings.dateFormat });
  if (result?.action !== 'apply') return;
  const ids = result.scope === 'selected' ? selectedTasks() : null;
  const count = change('op.updateProject', (project) => {
    project.statusDate = result.date;
    return result.how === 'reschedule' ? rescheduleUncompleted(project, doc.sched, result.date) : updateProjectThrough(project, doc.sched, result.date, ids);
  });
  notify('success', t('notice.projectProgress', { count }));
}

async function openLeveling() {
  const doc = activeDoc();
  const options = { order: 'standard', withinSlack: false, clear: true, ...(doc.project.leveling ?? {}) };
  const over = doc.project.resources.filter((r) => doc.sched.resources.get(r.id)?.overallocated).map((r) => r.name);
  const result = await popups.open('leveling', { options, over });
  if (!result?.action) return;
  change('op.levelingOptions', (project) => { project.leveling = result.options; });
  if (result.action === 'level') await levelNow();
  if (result.action === 'clear') clearLeveling();
}

async function levelNow() {
  const doc = activeDoc();
  const options = doc.project.leveling ?? {};
  const outcome = await withProgress('progress.leveling', doc.project.title, async (op, report) => {
    await nextFrame();
    // Each step is a full reschedule: run in slices so the progress popup can update.
    return levelResources(JSON.parse(JSON.stringify(doc.project)), { ...options, onProgress: (done, total) => report?.({ done, total }) });
  });
  change('op.level', (project) => {
    for (const task of project.tasks) task.levelingDelay = outcome.delays.get(task.id) ?? 0;
  });
  const names = outcome.unresolved.map((id) => P.findResource(doc.project, id)?.name).filter(Boolean);
  notify(names.length ? 'error' : 'success', names.length ? t('notice.levelPartly', { count: outcome.moved.length, names: names.join(', ') }) : t('notice.leveled', { count: outcome.moved.length }));
}

function clearLeveling() {
  const ids = selectedTasks();
  const count = change('op.levelClear', (project) => {
    let n = 0;
    for (const task of project.tasks) if ((!ids.length || ids.includes(task.id)) && task.levelingDelay) { task.levelingDelay = 0; n += 1; }
    return n;
  });
  notify('success', t('notice.levelCleared', { count }));
}

function nextOverallocation() {
  const doc = activeDoc();
  ensureTaskView();
  const rows = taskRows().filter((row) => row.info?.overallocated && !row.info.summary);
  if (!rows.length) return notify('info', t('notice.noOverallocation'));
  const current = rows.findIndex((row) => row.id === selectedTasks()[0]);
  const next = rows[(current + 1) % rows.length];
  select('task', [next.id]);
  state.view?.scrollToTask?.(next.id);
  void doc;
  return undefined;
}

async function openRecurring() {
  if (!activeDoc()) newPlan();
  ensureTaskView();
  const doc = activeDoc();
  const info = selectedTasks()[0] ? doc.sched.info(selectedTasks()[0]) : null;
  const result = await popups.open('recurring', { start: fromMin(info?.start ?? doc.sched.start), options: doc.project.options, dateFormat: state.settings.dateFormat });
  if (result?.action !== 'apply') return;
  const cal = doc.sched.projectCal;
  const summary = change('op.recurring', (project) => insertRecurring(project, insertIndex(), result.data, (day) => cal.isWorkingDay(day)));
  if (!summary) return notify('error', t('notice.recurringNone'));
  select('task', [summary.id]);
  notify('success', t('notice.recurring', { count: doc.sched.info(summary.id)?.children.length ?? 0 }));
}

async function openAssign() {
  const doc = activeDoc();
  const ids = selectedTasks().filter((id) => !doc.sched.info(id)?.summary);
  if (!ids.length) return notify('info', t('notice.leafOnly'));
  const result = await popups.open('assign', {
    tasks: ids.map((id) => ({ id, name: P.findTask(doc.project, id)?.name })),
    resources: doc.project.resources.map((r) => ({ ...r, overallocated: doc.sched.resources.get(r.id)?.overallocated ?? false })),
    assignments: doc.project.assignments.filter((a) => ids.includes(a.taskId)),
    currency: doc.project.options.currency,
  });
  if (result?.action !== 'apply') return;
  change('op.assign', (project) => {
    for (const r of result.newResources ?? []) P.addResource(project, r);
    for (const id of ids) {
      for (const change2 of result.changes) {
        if (change2.units > 0) P.assignResource(project, id, change2.resourceId, change2.units, change2.cost != null ? { cost: change2.cost } : {});
        else P.unassignResource(project, id, change2.resourceId);
      }
    }
  });
  notify('success', t('notice.assigned', { count: ids.length }));
}

async function openColumns() {
  const doc = activeDoc();
  const kind = doc.view.id === 'resourceSheet' ? 'resource' : 'task';
  const tableId = kind === 'resource' ? doc.view.resourceTable ?? 'entry' : doc.view.table ?? 'entry';
  const all = (kind === 'resource' ? [...RESOURCE_FIELD_MAP.keys()] : [...TASK_FIELD_MAP.keys()]).filter((id) => id !== 'id');
  const result = await popups.open('columns', { kind, table: tableId, columns: currentColumns(kind), all, defaults: (kind === 'resource' ? RESOURCE_TABLES : TASK_TABLES)[tableId] });
  if (!result?.columns) return;
  updateSettings({ [`columns:${kind}:${tableId}`]: result.columns }, { quiet: true });
  mountView();
  renderView();
  notify('success', t('notice.columns', { count: result.columns.length }));
}

async function openFind(mode) {
  const doc = activeDoc();
  ensureTaskView();
  await popups.open('find', { mode, fields: ['name', 'notes', 'resourceNames', 'text1', 'text2', 'text3', 'hyperlink'], text: doc.view.lastFind ?? '', dateFormat: state.settings.dateFormat });
}

/** Find / replace / go to — the find popup sends these as actions while it stays open. */
function findNext({ text, field = 'name', matchCase = false, whole = false, direction = 1 }) {
  const doc = activeDoc();
  doc.view.lastFind = text;
  const rows = taskRows().filter((row) => row.task);
  const test = matcher(text, matchCase, whole);
  const value = (task, info) => (field === 'resourceNames' ? (info?.resourceNames ?? []).join(', ') : String(task[field] ?? ''));
  const start = rows.findIndex((row) => row.id === selectedTasks()[0]);
  for (let step = 1; step <= rows.length; step++) {
    const row = rows[(start + direction * step + rows.length * 2) % rows.length];
    if (test(value(row.task, row.info))) {
      select('task', [row.id]);
      state.view?.scrollToTask?.(row.id);
      return { found: true, row: row.info.row };
    }
  }
  notify('info', t('notice.notFound', { text }));
  return { found: false };
}

function matcher(text, matchCase, whole) {
  const escaped = String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(whole ? `(^|\\b)${escaped}(\\b|$)` : escaped, matchCase ? '' : 'i');
  return (value) => Boolean(text) && pattern.test(value);
}

function replaceAll({ text, replacement, field = 'name', matchCase = false, whole = false }) {
  const escaped = String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(whole ? `\\b${escaped}\\b` : escaped, matchCase ? 'g' : 'gi');
  if (!text || !['name', 'notes', 'text1', 'text2', 'text3', 'hyperlink'].includes(field)) return { count: 0 };
  const count = change('op.replace', (project) => {
    let n = 0;
    for (const task of project.tasks) {
      const before = String(task[field] ?? '');
      const after = before.replace(pattern, replacement ?? '');
      if (after !== before) { task[field] = after; n += 1; }
    }
    return n;
  });
  notify('success', t('notice.replaced', { count }));
  return { count };
}

function goToTask({ row, date }) {
  const doc = activeDoc();
  if (row) {
    const task = P.taskAtRow(doc.project, Number(row));
    if (!task) return notify('error', t('notice.noRow', { row }));
    const ancestors = P.ancestors(doc.project, task.id);
    for (const id of ancestors) P.findTask(doc.project, id).collapsed = false;
    doc.touch();
    invalidateRows();
    updateView();
    select('task', [task.id]);
    state.view?.scrollToTask?.(task.id);
  } else if (date) {
    const minutes = toMin(date);
    if (minutes != null) state.view?.scrollToDate?.(minutes);
  }
  return undefined;
}

// ───────────────────────── document reader (the tutorial document inside the program)

const READER_DOCS = { tutorial: { file: 'Tutorial', title: 'action.tutorialDoc', glyph: 'tutorialDoc' } };

/** Shows a document from docs/ in the centre of the window (instead of a browser). */
function openReader(doc = 'tutorial', lang = getLanguage()) {
  popups.hideMenu();
  state.reader = { doc, lang: lang === 'en' ? 'en' : 'ko' };
  state.view?.destroy?.();
  state.view = null;
  renderAll();
}

function readerUrl() {
  const info = READER_DOCS[state.reader.doc];
  return `docs/${info.file}${state.reader.lang === 'en' ? '.en' : ''}.html`;
}

function renderReader() {
  const host = root.querySelector('#reader-page');
  const info = READER_DOCS[state.reader.doc];
  const url = readerUrl();
  const frame = host.querySelector('.reader-frame');
  if (frame && frame.dataset.url === url && host.dataset.uiLang === getLanguage()) return; // stays where it was scrolled
  host.dataset.uiLang = getLanguage();
  const lang = state.reader.lang;
  host.innerHTML = `
    <div class="reader-bar">
      <button class="button" data-reader="home" title="${escapeHtml(t('tip.home'))}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button>
      <h2 class="reader-title">${icon(info.glyph)}<span>${escapeHtml(t(info.title))}</span></h2>
      <select class="reader-chapters" data-reader-chapter title="${escapeHtml(t('reader.chapters'))}" aria-label="${escapeHtml(t('reader.chapters'))}"><option value="">${escapeHtml(t('reader.chapters'))}</option></select>
      <span class="grow"></span>
      <span class="segmented" role="radiogroup" title="${escapeHtml(t('reader.language'))}">
        <button class="segment ${lang === 'ko' ? 'active' : ''}" data-reader="lang" data-value="ko" role="radio" aria-checked="${lang === 'ko'}" title="한국어">한국어</button>
        <button class="segment ${lang === 'en' ? 'active' : ''}" data-reader="lang" data-value="en" role="radio" aria-checked="${lang === 'en'}" title="English">English</button>
      </span>
      <button class="button primary" data-reader="tutorial" title="${escapeHtml(commandTip('tutorial'))}">${icon('tutorial')}<span>${escapeHtml(t('reader.startTutorial'))}</span></button>
      <button class="button" data-reader="external" title="${escapeHtml(t('reader.externalTip'))}">${icon('readerExternal')}<span>${escapeHtml(t('reader.external'))}</span></button>
    </div>
    <iframe class="reader-frame" data-url="${escapeHtml(url)}" src="${escapeHtml(url)}" title="${escapeHtml(t(info.title))}"></iframe>`;
  const iframe = host.querySelector('.reader-frame');
  iframe.addEventListener('load', () => {
    // The chapter list comes from the document's own headings (same origin).
    const select = host.querySelector('[data-reader-chapter]');
    const headings = [...(iframe.contentDocument?.querySelectorAll('h2[id]') ?? [])];
    select.innerHTML = `<option value="">${escapeHtml(t('reader.chapters'))}</option>${headings.map((h) => `<option value="${escapeHtml(h.id)}">${escapeHtml(h.textContent.replace(/#\s*$/, '').trim())}</option>`).join('')}`;
  });
}

async function onReaderAction(target) {
  switch (target.dataset.reader) {
    case 'home': return showStartPage(true);
    case 'lang': state.reader.lang = target.dataset.value; return renderAll();
    case 'tutorial': return startTutorial();
    case 'external': {
      if (!desktop) return window.open(readerUrl(), '_blank');
      try { await native.openDocument(readerUrl().slice('docs/'.length)); } catch (error) { showError('error.guide', error); }
      return undefined;
    }
    default: return undefined;
  }
}

async function openUserGuide() {
  try {
    const name = getLanguage() === 'en' ? 'UsersGuide.en.html' : 'UsersGuide.html';
    await native.openDocument(name);
    notify('info', t('notice.guide'));
  } catch (error) {
    showError('error.guide', error);
  }
}

// ───────────────────────── menus (popup windows)

/** Screen position of a point in this window, in CSS pixels. */
const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => {
  if (!event.isTrusted) return;
  screenOffset.x = event.screenX - event.clientX;
  screenOffset.y = event.screenY - event.clientY;
  screenOffset.measured = true;
}, { passive: true });

function toScreen(x, y) {
  if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y };
  estimateOffset();
  return { x: screenOffset.x + x, y: screenOffset.y + y };
}

function anchorBelow(element) {
  const rect = element.getBoundingClientRect();
  const point = toScreen(rect.left, rect.bottom + 2);
  return { ...point, flipY: toScreen(rect.left, rect.top - 2).y };
}

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? { // not id.sub: every string has a legacy .sub() method
    id: `submenu:${id.sub}`,
    label: t(`submenu.${id.sub}`),
    icon: SUBMENUS[id.sub].icon,
    submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : {
    id,
    label: t(commands[id].label),
    icon: commands[id].icon,
    shortcut: commands[id].key ? keyLabel(commands[id].key) : '',
    disabled: !commandEnabled(id),
    checked: commands[id].checked?.(),
  }));
}

async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'plan', title: 'MyWorkPlan' });
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) {
    state.openMenu = null;
    state.lastMenuClose = { name, at: Date.now() };
    renderMenubar();
  }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}

function openMenubarMenu(name) {
  const element = root.querySelector(`[data-menu="${name}"]`);
  if (!element) return;
  showMenu(menuItems(MENUS[name]), anchorBelow(element), name);
}

function choiceMenu(anchor, title, glyph, list, current, labelPrefix, apply, icons = {}) {
  const items = list.map((value) => ({ id: `custom:${value}`, label: t(`${labelPrefix}.${value}`), icon: icons[value] ?? glyph, checked: value === current }));
  const handlers = Object.fromEntries(list.map((value) => [`custom:${value}`, () => apply(value)]));
  return showMenu(items, anchor, 'context', { handlers, header: { icon: glyph, title } });
}

const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function viewsMenu(anchor) {
  return showMenu(menuItems(VIEWS.map((id) => `view:${id}`)), anchor ?? anchorFor('viewMenu'), 'context', { header: { icon: 'viewSwitch', title: t('action.viewMenu') } });
}

function tablesMenu(anchor) {
  const doc = activeDoc();
  if (doc.view.id === 'resourceSheet') return choiceMenu(anchor ?? anchorFor('table'), t('action.table'), 'table', Object.keys(RESOURCE_TABLES), doc.view.resourceTable ?? 'entry', 'tableName', (value) => setViewOptions({ resourceTable: value, table: doc.view.table }));
  return choiceMenu(anchor ?? anchorFor('table'), t('action.table'), 'table', Object.keys(TASK_TABLES), doc.view.table ?? 'entry', 'tableName', (value) => setViewOptions({ table: value }));
}

async function filtersMenu(anchor) {
  const doc = activeDoc();
  return choiceMenu(anchor ?? anchorFor('filter'), t('action.filter'), 'filter', FILTERS, doc.view.filter, 'filter', async (value) => {
    if (value === 'dateRange') {
      const result = await popups.open('find', { mode: 'range', dateFormat: state.settings.dateFormat, from: fromMin(doc.sched.start), to: fromMin(doc.sched.finish) });
      void result;
      return;
    }
    if (value === 'usingResource') {
      const resources = doc.project.resources;
      if (!resources.length) return notify('info', t('graph.noResources'));
      const items = resources.map((r) => ({ id: `custom:${r.id}`, label: r.name, icon: 'user', checked: doc.view.params?.resourceId === r.id }));
      const handlers = Object.fromEntries(resources.map((r) => [`custom:${r.id}`, () => setViewOptions({ filter: 'usingResource', params: { resourceId: r.id } })]));
      return showMenu(items, anchor ?? anchorFor('filter'), 'context', { handlers, header: { icon: 'filter', title: t('filter.usingResource') } });
    }
    return setViewOptions({ filter: value, params: null });
  });
}

function groupsMenu(anchor) {
  return choiceMenu(anchor ?? anchorFor('group'), t('action.group'), 'group', GROUPS, activeDoc().view.group, 'groupBy', (value) => setViewOptions({ group: value }));
}

function sortMenu(anchor) {
  return choiceMenu(anchor ?? anchorFor('sort'), t('action.sort'), 'sort', SORTS, activeDoc().view.sort, 'sortBy', (value) => setViewOptions({ sort: value }));
}

/** Context menus: different for task rows, bars, links, resources, headers, the chart, text fields, tabs… */
function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const doc = activeDoc();
  if (kind === 'taskRow' || kind === 'bar') {
    if (!payload.id) return showMenu(menuItems(['insertTask', 'insertMilestone', 'insertSummary', 'paste', '-', 'selectAll']), anchor, 'context', { header: { icon: 'bar', title: t('menu.task') } });
    const task = P.findTask(doc.project, payload.id);
    const info = doc.sched.info(payload.id);
    const ids = kind === 'bar' ? ['taskInfo', 'notes', 'updateTasks', '-', 'pct0', 'pct50', 'pct100', 'markOnTrack', '-', 'link', 'unlink', 'scrollToTask', 'addToTimeline', '-', 'manualMode', 'autoMode', 'inactivate', '-', 'cut', 'copy', 'delete']
      : ['taskInfo', 'notes', 'assign', '-', 'cut', 'copy', 'paste', 'fillDown', 'delete', '-', 'insertTask', 'insertMilestone', 'insertSummary', '-', 'indent', 'outdent', 'moveUp', 'moveDown', '-', 'link', 'unlink', 'addToTimeline', 'inactivate'];
    const items = menuItems(ids);
    if (info?.summary && kind === 'taskRow') items.push({ separator: true }, { id: 'custom:collapse', label: t(task.collapsed ? 'grid.expand' : 'grid.collapse'), icon: task.collapsed ? 'outlineExpand' : 'outlineCollapse' });
    const handlers = { 'custom:collapse': () => toggleCollapse(payload.id) };
    const glyph = info?.summary ? 'summaryBar' : task?.milestone ? 'milestone' : 'bar';
    return showMenu(items, anchor, 'context', { handlers, header: { icon: glyph, title: selectedTasks().length > 1 ? t('props.multi', { count: selectedTasks().length }) : `${info?.row}. ${task?.name ?? ''}` } });
  }
  if (kind === 'taskEmpty') return showMenu(menuItems(['insertTask', 'insertMilestone', 'insertSummary', 'insertRecurring', 'paste', '-', 'selectAll', 'outlineExpand', 'outlineCollapse']), anchor, 'context', { header: { icon: 'list', title: t(`view.${doc.view.id}`) } });
  if (kind === 'link') {
    const handlers = {
      'custom:edit': () => openLinkInfo(payload.from, payload.to),
      ...Object.fromEntries(['FS', 'SS', 'FF', 'SF'].map((type) => [`custom:type:${type}`, () => change('op.editLink', (project) => { const link = P.findTask(project, payload.to).predecessors.find((x) => x.taskId === payload.from); link.type = type; })])),
      'custom:delete': () => { change('op.unlink', (project) => P.unlinkTasks(project, payload.from, payload.to)); notify('success', t('notice.linkDeleted')); },
    };
    const current = P.findTask(doc.project, payload.to)?.predecessors.find((x) => x.taskId === payload.from)?.type;
    return showMenu([
      { id: 'custom:edit', label: t('link.edit'), icon: 'link2' },
      { separator: true },
      ...['FS', 'SS', 'FF', 'SF'].map((type) => ({ id: `custom:type:${type}`, label: t(`linkType.${type}`), icon: { FS: 'linkFS', SS: 'linkSS', FF: 'linkFF', SF: 'linkSF' }[type], checked: current === type })),
      { separator: true },
      { id: 'custom:delete', label: t('link.delete'), icon: 'unlink', danger: true },
    ], anchor, 'context', { handlers, header: { icon: 'link', title: `${t('props.link')}: ${P.rowOf(doc.project, payload.from)} → ${P.rowOf(doc.project, payload.to)}` } });
  }
  if (kind === 'chart') return showMenu(menuItems(['timescaleIn', 'timescaleOut', 'fitProject', 'goToday', '-', 'showCritical', 'showSlack', 'showBaseline', 'showProgressLine', '-', 'exportImage', 'print', '-', 'shuffleBackground']), anchor, 'context', { header: { icon: 'viewGantt', title: t(`view.${doc?.view.id ?? 'gantt'}`) } });
  if (kind === 'resourceRow') {
    if (!payload.id) return showMenu(menuItems(['addResource', 'paste', '-', 'levelAll']), anchor, 'context', { header: { icon: 'user', title: t('menu.resource') } });
    if (!isResourceSelected(payload.id)) selectResource(payload.id, {});
    const r = P.findResource(doc.project, payload.id);
    return showMenu(menuItems(['resourceInfo', '-', 'cut', 'copy', 'paste', 'delete', '-', 'addResource', 'levelAll', 'nextOverallocation', '-', 'view:resourceGraph', 'view:resourceUsage']), anchor, 'context', { header: { icon: 'user', title: r?.name ?? '' } });
  }
  if (kind === 'resourceEmpty') return showMenu(menuItems(['addResource', 'paste', '-', 'selectAll']), anchor, 'context', { header: { icon: 'user', title: t('view.resourceSheet') } });
  if (kind === 'header') {
    const field = payload.field;
    const handlers = {
      'custom:hide': () => {
        const cols = currentColumns(payload.kind).filter((id) => id !== field);
        const tableId = payload.kind === 'resource' ? doc.view.resourceTable ?? 'entry' : doc.view.table ?? 'entry';
        updateSettings({ [`columns:${payload.kind}:${tableId}`]: cols }, { quiet: true });
        mountView();
        renderView();
      },
      'custom:fit': () => { const grid = state.view?.grid; if (grid) { grid.o.widths[field] = undefined; delete grid.o.widths[field]; saveColumnWidths(); grid.render(); } },
      ...Object.fromEntries(SORTS.map((sort) => [`custom:sort:${sort}`, () => setViewOptions({ sort })])),
    };
    const sortable = { name: 'name', start: 'start', finish: 'finish', duration: 'duration', priority: 'priority', cost: 'cost', work: 'work', totalSlack: 'slack' }[field];
    return showMenu([
      ...(sortable && payload.kind === 'task' ? [{ id: `custom:sort:${sortable}`, label: t('grid.sortBy', { name: t(`field.${field}`) }), icon: 'sort' }, { id: 'custom:sort:id', label: t('sortBy.id'), icon: 'list' }, { separator: true }] : []),
      ...menuItems(['columns', 'table']),
      { id: 'custom:hide', label: t('grid.hideColumn'), icon: 'eye', disabled: !field || field === 'name' },
      { id: 'custom:fit', label: t('grid.resetWidth'), icon: 'zoomReset', disabled: !field },
    ], anchor, 'context', { handlers, header: { icon: 'columns', title: field ? t(`field.${field}`) : t('action.columns') } });
  }
  if (kind === 'report') return showMenu(menuItems([...REPORTS.map(([id]) => `report:${id}`), '-', { sub: 'reportExport' }, 'copyReport', 'print']), anchor, 'context', { header: { icon: 'viewReports', title: t('menu.report') } });
  if (kind === 'tab') {
    activateDoc(payload.id);
    return showMenu(menuItems(['save', 'saveAs', 'saveTemplate', '-', 'projectInfo', 'print', '-', 'closeTab', 'closeAll', '-', 'new']), anchor, 'context', { header: { icon: 'plan', title: docName(activeDoc()) } });
  }
  if (kind === 'panel') return showMenu(menuItems(['leftPanel', 'rightPanel', 'statusBar', '-', 'settings']), anchor, 'context', { header: { icon: 'panelLeft', title: t('panel.leftTitle') } });
  if (kind === 'start') return showMenu(menuItems(['new', 'open', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { header: { icon: 'home', title: t('action.startPage') } });
  if (kind === 'status') return showMenu(menuItems(['statusBar', '-', 'zoomIn', 'zoomOut', 'zoomReset', 'timescaleIn', 'timescaleOut', '-', 'theme', 'language']), anchor, 'context', { header: { icon: 'statusBar', title: t('action.statusBar') } });
  return showMenu(menuItems(['new', 'open', 'save', '-', 'undo', 'redo', '-', 'settings', 'about']), anchor, 'context', { header: { icon: 'plan', title: 'MyWorkPlan' } });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => {
      element.focus();
      const text = await native.clipboardRead().catch(() => '');
      document.execCommand('insertText', false, text ?? '');
    },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
    'custom:undo': () => { element.focus(); document.execCommand('undo'); },
  };
  const hasSelection = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:undo', label: t('action.undoText'), icon: 'undo', shortcut: keyLabel('Ctrl+Z') },
    { separator: true },
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', shortcut: keyLabel('Ctrl+X'), disabled: !hasSelection },
    { id: 'custom:copy', label: t('action.copy'), icon: 'copy', shortcut: keyLabel('Ctrl+C'), disabled: !hasSelection },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste', shortcut: keyLabel('Ctrl+V') },
    { separator: true },
    { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll', shortcut: keyLabel('Ctrl+A') },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── external drag & drop

async function handleDroppedPaths(paths) {
  for (const path of paths) {
    const name = baseName(path);
    try {
      if (isPlanFileName(name) || isXmlFileName(name) || isCsvFileName(name)) await openPath(path);
      else if (isImageFileName(name)) await setBackgroundFromPath(path);
      else notify('error', t('notice.unsupportedDrop', { name }));
    } catch (error) {
      showError('error.drop', error, path);
    }
  }
}

async function handleDroppedFiles(files, text) {
  for (const file of files) {
    try {
      if (isPlanFileName(file.name) || isXmlFileName(file.name) || isCsvFileName(file.name)) openText(file.name, await file.text());
      else if (isImageFileName(file.name) || file.type.startsWith('image/')) await setBackgroundFromFile(file);
      else notify('error', t('notice.unsupportedDrop', { name: file.name }));
    } catch (error) {
      showError('error.drop', error, file.name);
    }
  }
  if (!files.length && text) {
    // Dropped text: one task per line.
    if (!activeDoc()) newPlan();
    const items = tasksFromText(text, activeDoc().project.options);
    if (!items.length) return;
    ensureTaskView();
    const ids = change('op.import', (project) => P.pasteTasks(project, { tasks: items.map((item) => P.createTask(project, item)), assignments: [] }, project.tasks.length));
    select('task', ids);
    notify('success', t('notice.pasted', { count: ids.length }));
  }
}

function setDropActive(active) {
  state.dropActive = active;
  const overlay = root.querySelector('.drop-overlay');
  overlay.classList.toggle('visible', active);
  overlay.querySelector('span').textContent = t('drop.hint');
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) {
      const name = menu.dataset.menu;
      if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined;
      return openMenubarMenu(name);
    }
    if (target.closest('[data-home]')) return showStartPage(true);
    const reader = target.closest('[data-reader]');
    if (reader) return onReaderAction(reader);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) {
      const id = command.dataset.command;
      const anchor = ['themeMenu', 'viewMenu', 'table', 'filter', 'group', 'sort', 'recentFolders'].includes(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined;
      return run(id, { anchor });
    }
    const closeButton = target.closest('[data-close-doc]');
    if (closeButton) return closeDoc(state.docs.find((doc) => doc.id === closeButton.dataset.closeDoc));
    const tab = target.closest('[data-doc]');
    if (tab) return activateDoc(tab.dataset.doc);
    if (target.closest('[data-tab-new]')) return newPlan();
    const scroll = target.closest('[data-tab-scroll]');
    if (scroll) return scrollTabs(Number(scroll.dataset.tabScroll));
    const swatch = target.closest('[data-bar-color]');
    if (swatch) return change('op.barColor', (project) => selectedTasks().forEach((id) => { P.findTask(project, id).barColor = swatch.dataset.barColor; }));
    const gotoTask = target.closest('[data-goto-task]');
    if (gotoTask) { ensureTaskView(); select('task', [gotoTask.dataset.gotoTask]); state.view?.scrollToTask?.(gotoTask.dataset.gotoTask); return undefined; }
    const statusMode = target.closest('[data-status="mode"]');
    if (statusMode && activeDoc()) {
      const manual = activeDoc().project.options.defaultTaskMode !== 'manual';
      change('op.taskMode', (project) => { project.options.defaultTaskMode = manual ? 'manual' : 'auto'; });
      notify('info', t(`status.mode.${manual ? 'manual' : 'auto'}`));
    }
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const tabs = event.target.closest('#tabs');
    if (tabs && !event.target.closest('[data-doc], button')) newPlan();
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable && !event.target.closest('.grid-editor')) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const tab = event.target.closest('[data-doc]');
    if (tab) return contextMenu(event, 'tab', { id: tab.dataset.doc });
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    if (event.target.closest('.side-panel, #toolbar, #menubar')) return contextMenu(event, 'panel');
    return contextMenu(event, 'default');
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.viewOption) return setViewOptions({ [target.dataset.viewOption]: target.value, ...(target.dataset.viewOption === 'filter' ? { params: null } : {}) });
    if (target.dataset.viewToggle) return setViewOptions({ [target.dataset.viewToggle]: target.checked });
    if (target.dataset.settingToggle) return updateSettings({ [target.dataset.settingToggle]: target.checked });
    if ('startToggle' in target.dataset) return updateSettings({ showStartPage: target.checked }, { quiet: true });
    if (target.id === 'zoom-value') return setZoom(parseFloat(target.value) || 100);
    if (target.dataset.propField) return onPropField(target);
    if (target.dataset.propResource) {
      const field = RESOURCE_FIELD_MAP.get(target.dataset.propResource);
      const resource = P.findResource(activeDoc().project, selectedResources()[0]);
      return editResourceField({ item: resource }, field, target.value);
    }
    if (target.dataset.propProject) {
      const key = target.dataset.propProject;
      if (key === 'start') {
        const minutes = parseDayInput(target.value);
        if (minutes == null) return showError('error.input', new Error(t('field.badDate')), t('field.projectStart'));
        return change('op.projectInfo', (project) => { project.start = fromMin(minutes + (minutes % 1440 === 0 ? project.options.defaultStart ?? 480 : 0)); });
      }
      return change('op.projectInfo', (project) => { project[key] = target.value; });
    }
    if (target.dataset.propLink) {
      const { from, to } = state.selection.link ?? {};
      const opts = activeDoc().project.options;
      if (target.dataset.propLink === 'type') return change('op.editLink', (project) => { P.findTask(project, to).predecessors.find((x) => x.taskId === from).type = target.value; });
      const lag = parseLagInput(target.value, opts);
      if (!lag) return showError('error.input', new Error(t('field.badDuration')), t('link.lag'));
      return change('op.editLink', (project) => Object.assign(P.findTask(project, to).predecessors.find((x) => x.taskId === from), lag));
    }
    if ('propPercent' in target.dataset) return setProgress(selectedTasks(), Number(target.value));
    if (target.id === 'timescale-slider') return setTimescale(TIMESCALE.steps[Number(target.value)]);
    if ('startSpeed' in target.dataset) return updateSettings({ animationSpeed: Number(target.value) }, { quiet: true });
    if ('readerChapter' in target.dataset && target.value) {
      root.querySelector('.reader-frame')?.contentDocument?.getElementById(target.value)?.scrollIntoView({ block: 'start' });
      return undefined;
    }
    if ('startRandom' in target.dataset) return updateSettings({ animationRandom: target.checked }, { quiet: true });
    if ('startInterval' in target.dataset) {
      startBackgroundChangedAt = Date.now();
      return updateSettings({ animationInterval: Number(target.value) }, { quiet: true });
    }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'panel-search') {
      clearTimeout(bindEvents.searchTimer);
      bindEvents.searchTimer = setTimeout(() => setViewOptions({ text: target.value }), 160);
    }
    if ('propPercent' in target.dataset) target.parentElement.querySelector('output').textContent = `${target.value}%`;
    if ('startSpeed' in target.dataset) {
      target.parentElement.querySelector('output').textContent = `${target.value}%`;
      state.settings.animationSpeed = Number(target.value);
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.target.id === 'zoom-value' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setZoom(state.settings.zoom + (event.key === 'ArrowUp' ? ZOOM.step : -ZOOM.step));
    } else if (event.target.id === 'zoom-value' && event.key === 'Enter') event.target.blur();
    else if (event.target.matches?.('.props input') && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  // Ctrl+wheel: zoom (the charts handle it for their timescale).
  root.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
    if (event.target.closest('.chart-body, .network-body, .usage-body, .team-body')) return;
    event.preventDefault();
    setZoom(state.settings.zoom + (event.deltaY < 0 ? ZOOM.step : -ZOOM.step));
  }, { passive: false });

  root.querySelector('#tabs').addEventListener('wheel', (event) => {
    const strip = root.querySelector('.tab-strip');
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY || event.deltaX;
    updateTabNav();
  }, { passive: false });

  // Side panel splitters.
  root.querySelectorAll('[data-split]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !state.settings.showLeftPanel) || (side === 'right' && !state.settings.showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = state.settings[key];
    const minimum = side === 'left' ? PANEL_MIN.left : PANEL_MIN.right;
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => {
        const width = Math.max(minimum, Math.min(600, startWidth + (side === 'left' ? dx : -dx)));
        root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`);
        state.settings[key] = width;
      },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: state.settings[key] }, { quiet: true }); state.view?.render?.(); } },
    });
  }));

  // Bottom-right grip: drag to resize the window.
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    appWindow?.startResizeDragging('SouthEast').catch(() => {});
  });

  window.addEventListener('resize', frameThrottle(() => {
    updateTabNav();
    state.view?.drawHeadAndBg?.();
    state.view?.drawChart?.();
    state.view?.grid?.drawRows?.();
    // Programmatic resizes are not limited by the OS minimum size: grow back.
    if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 600).catch(() => {});
  }));

  document.addEventListener('keydown', onKeyDown, true);

  // Settings and recent files changed in another window (settings popup, recent popup).
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const previous = state.settings;
      state.settings = loadSettings(globalThis.localStorage);
      applySettings(previous);
    } else if (event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) {
      state.recent = loadRecent(globalThis.localStorage);
      state.recentDirs = loadRecentDirs(globalThis.localStorage);
      if (state.showStart || !activeDoc()) renderStartPage();
      renderToolbarState();
    }
  });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if (event.dataTransfer?.types?.length) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      setDropActive(false);
      handleDroppedFiles([...(event.dataTransfer?.files ?? [])], event.dataTransfer?.getData('text/plain') ?? '');
    });
    window.addEventListener('beforeunload', (event) => {
      if (state.docs.some((doc) => doc.dirty)) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  setInterval(() => {
    const clock = root.querySelector('#status-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, 15000);
}

/** A date typed in the display format (or ISO): midnight of that day, or null. */
function parseDayInput(text) {
  const minutes = parseDay(text, state.settings.dateFormat);
  return minutes == null ? null : minutes - (minutes % 1440);
}

function parseLagInput(text, options) {
  const value = String(text).trim();
  if (!value || value === '0') return { lag: 0, lagUnit: 'd' };
  const percent = /^([-+]?\d*\.?\d+)\s*%$/.exec(value);
  if (percent) return { lag: Number(percent[1]), lagUnit: '%' };
  const parsed = parseDuration(value, options, 'd', { allowNegative: true });
  return parsed ? { lag: parsed.minutes, lagUnit: parsed.unit } : null;
}

function onPropField(target) {
  const id = selectedTasks()[0];
  const doc = activeDoc();
  const task = P.findTask(doc.project, id);
  if (!task) return;
  const field = TASK_FIELD_MAP.get(target.dataset.propField);
  editTaskField({ item: task, info: doc.sched.info(id) }, field, target.value);
}

const SHORTCUTS = [
  ['n', false, 'new'], ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'saveAs'], ['r', false, 'recent'], ['w', false, 'closeTab'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['x', false, 'cut'], ['c', false, 'copy'], ['v', false, 'paste'],
  ['a', false, 'selectAll'], ['p', false, 'print'], ['f', false, 'find'], ['h', false, 'replace'], ['g', false, 'goTo'], ['d', false, 'fillDown'],
  ['=', false, 'zoomIn'], ['+', false, 'zoomIn'], ['-', false, 'zoomOut'], ['0', false, 'zoomReset'], ['+', true, 'timescaleIn'], ['=', true, 'timescaleIn'], ['_', true, 'timescaleOut'], ['-', true, 'timescaleOut'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'],
  ['@', true, 'rightPanel'], ['2', true, 'rightPanel'], ['q', false, 'exit'], ['k', true, 'insertSummary'], ['m', true, 'insertMilestone'], ['r', true, 'addResource'],
  ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['f2', false, 'link'], ['f2', true, 'unlink'],
];

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.altKey && key === 's') { event.preventDefault(); run('saveAll'); return; }
  if (mod && !event.altKey) {
    // Text fields keep their own clipboard and undo.
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    if (key === 'tab') { event.preventDefault(); cycleTab(event.shiftKey ? -1 : 1); return; }
    if (key === 'f5' && event.shiftKey) { event.preventDefault(); run('scrollToTask'); return; }
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      run(shortcut[2]);
    }
    return;
  }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f9') { event.preventDefault(); run('calculate'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (key === 'f2' && event.shiftKey) { event.preventDefault(); run('taskInfo'); return; }
  if (key === 'f10' && event.altKey) { event.preventDefault(); run('assign'); return; }
  if (event.altKey && event.shiftKey && ['arrowright', 'arrowleft', 'arrowup', 'arrowdown'].includes(key)) {
    event.preventDefault();
    run({ arrowright: 'indent', arrowleft: 'outdent', arrowup: 'moveUp', arrowdown: 'moveDown' }[key]);
    return;
  }
  if (editing) {
    if (key === 'escape' && !event.target.classList.contains('grid-editor')) event.target.blur();
    return;
  }
  if (key === 'delete' || (isMac && key === 'backspace')) { event.preventDefault(); run('delete'); }
  else if (key === 'insert') { event.preventDefault(); run('insertTask'); }
  else if (key === 'escape') run('clearSelection');
}

// ───────────────────────── popup actions

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('open-folder', (data) => openWithDialog(data.path));
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('printed', () => notify('success', t('notice.printed')));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('find-next', (data, kind) => popups.post(kind, { type: 'find-result', ...findNext(data) }));
  popups.on('replace-all', (data, kind) => popups.post(kind, { type: 'find-result', ...replaceAll(data) }));
  popups.on('go-to', (data) => goToTask(data));
  popups.on('date-range', (data) => setViewOptions({ filter: 'dateRange', params: { from: toMin(data.from), to: toMin(data.to) } }));
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
  popups.on('db-password', (data) => { dbSessionPassword = String(data.password ?? ''); });
  popups.on('db-test', (data, kind) => testDatabase(String(data.password ?? ''), kind));
  popups.on('db-browse', () => chooseDatabaseFile());
  popups.on('db-delete', (data) => deleteDatabasePlan(data.id, data.title));
  popups.on('db-refresh', async () => {
    const db = dbReady();
    if (db) popups.post('database', { type: 'db-list', items: await dbList(db).catch((error) => { showError('error.dbOpen', error, db.where); return []; }) });
  });
}

// ───────────────────────── tutorial

let tutorial = null;

async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

async function restoreSession() {
  if (!desktop || !state.settings.restoreSession) return;
  let files = [];
  try { files = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? '{}').files ?? []; } catch { /* none */ }
  if (!files.length) return;
  const exists = await native.pathsExist(files);
  for (const [index, path] of files.entries()) if (exists[index]) await openPath(path, { quiet: true });
}

/** What views and the tutorial use. */
const appApi = {
  state,
  t,
  version: () => (state.info?.version ?? VERSION),
  settings: () => viewSettings(),
  criticalMode: () => criticalMode,
  openReader: (doc, lang) => openReader(doc, lang),
  closeReader: () => { if (state.reader) { state.reader = null; if (activeDoc()) mountView(); renderAll(); } },
  setCriticalMode: (on) => { if (Boolean(on) !== criticalMode) toggleCriticalPath(); },
  doc: () => activeDoc(),
  project: () => activeDoc()?.project,
  sched: () => activeDoc()?.sched,
  selection: () => state.selection,
  taskRows,
  fieldCtx,
  rowHeight,
  toMin,
  durationText,
  lagText,
  isSelected,
  isResourceSelected,
  isLinkSelected,
  selectTask,
  selectResource,
  selectLink,
  clearSelection,
  select,
  contextMenu,
  openTaskInfo,
  openResourceInfo,
  openLinkInfo,
  moveTaskBar,
  resizeTaskBar,
  setProgress,
  linkFromTo,
  reassignTask,
  editTaskField,
  editResourceField,
  setTableWidth,
  setTimescale,
  stepTimescale,
  taskGridOptions,
  resourceGridOptions,
  columnWidths,
  saveColumnWidths,
  taskFieldMap: () => TASK_FIELD_MAP,
  run,
  commands,
  popups,
  notify,
  showError,
  change,
  newPlan,
  openSampleBuiltin,
  switchView,
  showStartPage,
  updateSettings,
  insertTask,
  setViewOptions,
  openMenubarMenu,
  toggleCollapse,
  shuffleBackground,
  renderAll,
  anchorBelow,
  closeDoc,
  ask,
  get view() { return state.view; },
};

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  state.info = await native.appInfo().catch(() => null);
  if (state.settings.animationRandom) updateSettings({ animation: randomAnimation(state.settings.animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  // Desktop: the OS title bar comes from Rust; web: the browser tab shows the same "name vX".
  document.title = `MyWorkPlan v${state.info?.version ?? VERSION}`;
  native.setBackendLanguage(state.settings.language);
  state.samples = await native.sampleFiles().catch(() => []);
  applySettings({});
  await loadBackground();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) {
        state.quitting = true;
        await native.quitApp();
      }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') {
        setDropActive(false);
        handleDroppedPaths(event.payload.paths ?? []);
      }
    });
    native.listen('fatal-error', (fatal) => {
      const detail = [`${t('error.location')}: ${fatal.location}`, `${t('error.thread')}: ${fatal.thread}`, fatal.log ? `${t('error.log')}: ${fatal.log}` : '', '', fatal.backtrace].join('\n');
      const error = new Error(fatal.message);
      error.stack = detail;
      showError('error.fatal', error, fatal.location);
    });
  }

  await restoreSession();
  for (const path of await native.startupFiles().catch(() => [])) await openPath(path);
  state.showStart = !state.docs.length && state.settings.showStartPage;
  if (!state.docs.length && !state.settings.showStartPage) newPlan();
  if (!state.active && state.docs.length) activate(state.docs[0].id);
  else renderAll();
  if (desktop) {
    await appWindow.show();
    await appWindow.setFocus();
    setTimeout(() => popups.prewarm('menu'), 400);
  }
  // First run: tell the user there is a tutorial.
  if (!state.settings.tutorialOffered && !globalThis.__MYWORKPLAN_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome')) {
    updateSettings({ tutorialOffered: true }, { quiet: true });
    setTimeout(async () => {
      const result = await popups.open('welcome', {});
      if (result?.choice === 'tutorial') startTutorial();
      else if (result?.choice === 'sample') openSampleBuiltin();
    }, 600);
  }
}

// Test hook: the E2E suites drive the app through this (no effect on normal use).
window.__myworkplan = {
  state,
  t,
  commands,
  popups,
  run,
  api: appApi,
  debug: () => ({ openMenu: state.openMenu, view: state.viewId, showStart: state.showStart, focus: document.activeElement?.outerHTML?.slice(0, 80) ?? null, pending: [...popups.pending.keys()] }),
  actions: {
    newPlan, openPath, openText, saveDoc, closeDoc, insertTask, insertSummary, insertMilestone, select, selectTask, change, undo, redo, copySelection, pasteClipboard,
    setZoom, updateSettings, handleDroppedPaths, handleDroppedFiles, setBackgroundFromPath, removeBackground, confirmExit, openRecent, showError, openMenubarMenu,
    contextMenu, activeDoc, toScreen, docName, scrollTabs, withProgress, switchView, showStartPage, exportAs, exportImage, exportReport, openTaskInfo, openResourceInfo, openLinkInfo,
    moveTaskBar, resizeTaskBar, setProgress, linkFromTo, levelNow, clearLeveling, openSampleBuiltin, shuffleBackground, findNext, replaceAll, goToTask,
    taskRows, fieldCtx, setViewOptions, toggleCollapse, setTimescale, stepTimescale, fitProject, startTutorial, rememberDirectory, reassignTask, addResource, indentSelected,
    linkSelected, editTaskField, setOutlineLevel, applyTaskPatch,
  },
  domain: { P, TEMPLATES, buildTemplate, buildSample, compactDuration, criticalPath, tutorialSteps: () => TUTORIAL_STEPS.length },
  tutorial: () => tutorial,
};

start()
  .catch((error) => showError('error.unexpected', error, 'start'))
  .finally(() => {
    // The main window starts hidden (no flash of an empty page); show it even if start-up failed.
    if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {});
  });
