// Tutorial: a guided tour that runs the real app, chapter by chapter, through
// every feature — start page and backgrounds, building a plan, scheduling,
// resources, tracking, views, reports, files and printing, customizing, help.
//
// It works on a sample plan of its own (a new tab, closed at the end without
// touching the user's plans), and the theme, language and other settings it
// changes are put back when it ends. While it runs, popups open inside the main
// window (so a screen recording shows them). A card at the bottom right shows
// the step with previous / next, auto play, a chapter list and exit; the part
// of the window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { buildSample } from '../domain/templates.js';
import { PlanDocument } from '../domain/document.js';
import * as P from '../domain/project.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => document.querySelector(selector);
async function until(test, timeout = 6000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    try { if (await test()) return true; } catch { /* not yet */ }
    await sleep(60);
  }
  return false;
}

export const CHAPTERS = ['start', 'build', 'schedule', 'resources', 'tracking', 'views', 'reports', 'files', 'customize', 'help'];

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in
 * the state the step shows; `dwell`: how long auto play stays (ms).
 */
export const STEPS = [
  // ── start page
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'home', chapter: 'start', target: '#menubar [data-home]', dwell: 5000, run: (a) => a.start() },
  { id: 'templates', chapter: 'start', target: '.start-card.templates', run: (a) => a.start() },
  { id: 'recent', chapter: 'start', target: '.start-card.recent', run: (a) => a.start() },
  { id: 'background', chapter: 'start', target: '.start-card.side', dwell: 7000, async run(a) {
    await a.start();
    for (const kind of ['waves', 'constellation', 'gantt', 'aurora']) { a.app.updateSettings({ animation: kind, backgroundKind: 'animated' }); await sleep(1300); }
  } },
  // ── building a plan
  { id: 'sample', chapter: 'build', target: '#view-host', run: (a) => a.sample() },
  { id: 'layout', chapter: 'build', target: '#workspace', run: (a) => a.sample() },
  { id: 'insertTask', chapter: 'build', target: '[data-command="insertTask"]', dwell: 6000, async run(a) {
    await a.sample();
    a.selectRow(3);
    a.app.insertTask({ name: t('tutorial.demoTask') }, { edit: false });
    await sleep(400);
  } },
  { id: 'duration', chapter: 'build', target: '.gantt-table', dwell: 6000, async run(a) {
    await a.sample();
    const task = a.findByName(t('tutorial.demoTask')) ?? a.taskAt(4);
    a.app.select('task', [task.id]);
    a.edit(task, 'duration', '3d');
  } },
  { id: 'milestone', chapter: 'build', target: '[data-command="insertMilestone"]', async run(a) {
    await a.sample();
    a.selectRow(6);
    a.app.run('insertMilestone');
    await sleep(300);
    a.blurEditors();
  } },
  { id: 'outline', chapter: 'build', target: '[data-command="indent"]', dwell: 6000, async run(a) {
    await a.sample();
    a.selectRow(3);
    await a.app.run('indent');
    await sleep(800);
    await a.app.run('outdent');
  } },
  { id: 'collapse', chapter: 'build', target: '.gantt-table', async run(a) {
    await a.sample();
    const summary = a.app.project().tasks.find((task) => a.app.sched().info(task.id)?.summary);
    a.app.toggleCollapse(summary.id, true);
    await sleep(900);
    a.app.toggleCollapse(summary.id, false);
  } },
  { id: 'link', chapter: 'build', target: '[data-command="link"]', dwell: 6000, async run(a) {
    await a.sample();
    a.app.select('task', [a.taskAt(2).id, a.taskAt(3).id]);
    await sleep(300);
    a.app.run('link');
  } },
  { id: 'dragBar', chapter: 'build', target: '.gantt-chart', dwell: 6000, async run(a) {
    await a.sample();
    const task = a.leafAt(5);
    a.app.select('task', [task.id]);
    a.app.view?.scrollToTask?.(task.id);
    const info = a.app.sched().info(task.id);
    a.app.moveTaskBar(task.id, info.start + 2 * 1440);
  } },
  { id: 'undo', chapter: 'build', target: '[data-command="undo"]', async run(a) {
    await a.sample();
    await a.app.run('undo');
    await sleep(600);
    await a.app.run('redo');
    await sleep(600);
    await a.app.run('undo');
  } },
  { id: 'clipboard', chapter: 'build', target: '[data-command="copy"]', async run(a) {
    await a.sample();
    a.selectRow(4);
    await a.app.run('copy');
    await sleep(300);
    await a.app.run('paste');
  } },
  // ── scheduling
  { id: 'taskInfo', chapter: 'schedule', target: '.web-popup-task', dwell: 7000, async run(a) {
    await a.sample();
    const task = a.leafAt(4);
    a.app.select('task', [task.id]);
    a.popup(() => a.app.openTaskInfo(task.id, 'predecessors'), 'task');
  } },
  { id: 'constraints', chapter: 'schedule', target: '.web-popup-task', dwell: 6000, async run(a) {
    await a.sample();
    const task = a.leafAt(6);
    a.app.select('task', [task.id]);
    a.popup(() => a.app.openTaskInfo(task.id, 'advanced'), 'task');
  } },
  { id: 'critical', chapter: 'schedule', target: '.gantt-chart', async run(a) { await a.sample(); a.app.updateSettings({ showCritical: true, showSlack: true }); } },
  { id: 'linkInfo', chapter: 'schedule', target: '.web-popup-link', async run(a) {
    await a.sample();
    const task = a.app.project().tasks.find((x) => x.predecessors.length);
    a.popup(() => a.app.openLinkInfo(task.predecessors[0].taskId, task.id), 'link');
  } },
  { id: 'calendar', chapter: 'schedule', target: '.web-popup-calendar', dwell: 6000, async run(a) { await a.sample(); a.popup(() => a.app.run('calendar'), 'calendar'); } },
  { id: 'recurring', chapter: 'schedule', target: '.web-popup-recurring', async run(a) { await a.sample(); a.popup(() => a.app.run('insertRecurring'), 'recurring'); } },
  { id: 'projectInfo', chapter: 'schedule', target: '.web-popup-project', async run(a) { await a.sample(); a.popup(() => a.app.run('projectInfo'), 'project'); } },
  // ── resources
  { id: 'resourceSheet', chapter: 'resources', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('resourceSheet'); } },
  { id: 'assign', chapter: 'resources', target: '.web-popup-assign', dwell: 6000, async run(a) {
    await a.sample('gantt');
    a.app.select('task', [a.leafAt(3).id]);
    a.popup(() => a.app.run('assign'), 'assign');
  } },
  { id: 'resourceUsage', chapter: 'resources', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('resourceUsage'); } },
  { id: 'resourceGraph', chapter: 'resources', target: '#view-host', run: async (a) => { await a.sample(); const over = a.app.project().resources.find((r) => a.app.sched().resources.get(r.id)?.overallocated) ?? a.app.project().resources[0]; a.app.switchView('resourceGraph'); a.app.select('resource', [over.id]); } },
  { id: 'leveling', chapter: 'resources', target: '.web-popup-leveling', dwell: 6000, async run(a) { await a.sample('gantt'); a.popup(() => a.app.run('levelingOptions'), 'leveling'); } },
  { id: 'teamPlanner', chapter: 'resources', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('teamPlanner'); } },
  // ── tracking
  { id: 'baseline', chapter: 'tracking', target: '.web-popup-baseline', async run(a) { await a.sample('gantt'); a.popup(() => a.app.run('setBaseline'), 'baseline'); } },
  { id: 'progress', chapter: 'tracking', target: '[data-command="pct50"]', dwell: 5000, async run(a) {
    await a.sample('gantt');
    a.app.select('task', [a.leafAt(8).id]);
    a.app.updateSettings({ showLeftPanel: true });
    await sleep(200);
    a.app.run('pct50');
  } },
  { id: 'updateProject', chapter: 'tracking', target: '.web-popup-update', async run(a) { await a.sample('gantt'); a.popup(() => a.app.run('updateProject'), 'update'); } },
  { id: 'trackingGantt', chapter: 'tracking', target: '.gantt-chart', run: async (a) => { await a.sample(); a.app.switchView('tracking'); a.app.updateSettings({ showProgressLine: true }); } },
  // ── views
  { id: 'viewMenu', chapter: 'views', target: '.view-split', dwell: 5000, async run(a) { await a.sample('gantt'); a.app.updateSettings({ showProgressLine: false, showSlack: false }); a.menuFor('viewMenu'); } },
  { id: 'submenus', chapter: 'views', target: '[data-menu="view"]', dwell: 5000, async run(a) { await a.closeMenus(); await a.sample('gantt'); a.app.openMenubarMenu('view'); } },
  { id: 'network', chapter: 'views', target: '#view-host', run: async (a) => { await a.closeMenus(); await a.sample(); a.app.switchView('network'); } },
  { id: 'calendarView', chapter: 'views', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('calendar'); } },
  { id: 'timeline', chapter: 'views', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('timeline'); } },
  { id: 'taskUsage', chapter: 'views', target: '#view-host', run: async (a) => { await a.sample(); a.app.switchView('taskUsage'); } },
  { id: 'tables', chapter: 'views', target: '#left-panel', dwell: 6000, async run(a) {
    await a.sample('gantt');
    a.app.setViewOptions({ table: 'cost' });
    await sleep(1500);
    a.app.setViewOptions({ table: 'tracking' });
    await sleep(1500);
    a.app.setViewOptions({ table: 'entry' });
  } },
  { id: 'filter', chapter: 'views', target: '#left-panel', dwell: 6000, async run(a) {
    await a.sample('gantt');
    a.app.setViewOptions({ filter: 'critical' });
    await sleep(1500);
    a.app.setViewOptions({ filter: 'all', group: 'resource' });
    await sleep(1500);
    a.app.setViewOptions({ group: 'none', highlight: true, filter: 'late' });
  } },
  { id: 'find', chapter: 'views', target: '.web-popup-find', async run(a) { await a.sample('gantt'); a.app.setViewOptions({ highlight: false, filter: 'all' }); a.popup(() => a.app.run('find'), 'find'); } },
  { id: 'zoom', chapter: 'views', target: '.toolbar-zoom', dwell: 6000, async run(a) {
    await a.sample('gantt');
    a.app.setTimescale(12);
    await sleep(1000);
    a.app.setTimescale(56);
    await sleep(1000);
    a.app.setTimescale(30);
    a.app.run('zoomIn');
    await sleep(700);
    a.app.run('zoomReset');
  } },
  { id: 'contextMenu', chapter: 'views', target: '.gantt-table', dwell: 5000, async run(a) {
    await a.sample('gantt');
    const task = a.leafAt(4);
    a.app.select('task', [task.id]);
    const cell = q(`.grid-row[data-id="${task.id}"] .grid-cell[data-field="name"]`) ?? q('.grid-body');
    const r = cell.getBoundingClientRect();
    a.app.contextMenu({ clientX: r.left + 40, clientY: r.top + 10 }, 'taskRow', { id: task.id });
  } },
  // ── reports
  { id: 'reports', chapter: 'reports', target: '#view-host', run: async (a) => { await a.closeMenus(); await a.sample(); a.app.doc().view.report = 'overview'; a.app.switchView('reports'); } },
  { id: 'reportCost', chapter: 'reports', target: '#view-host', run: async (a) => { await a.sample(); a.app.doc().view.report = 'cost'; a.app.switchView('reports'); } },
  { id: 'reportExport', chapter: 'reports', target: '[data-report-action="export"]', dwell: 6000, async run(a) {
    await a.closeMenus();
    await a.sample();
    a.app.doc().view.report = 'overview';
    a.app.switchView('reports');
    await new Promise((resolve) => setTimeout(resolve, 300));
    a.app.run('exportReport', { element: document.querySelector('[data-report-action="export"]') });
  } },
  { id: 'reportBurndown', chapter: 'reports', run: async (a) => { await a.closeMenus(); await a.sample(); a.app.doc().view.report = 'burndown'; a.app.switchView('reports'); }, target: '#view-host' },
  // ── files and printing
  { id: 'fileMenu', chapter: 'files', target: '[data-menu="file"]', dwell: 5000, async run(a) { await a.sample('gantt'); a.app.openMenubarMenu('file'); } },
  { id: 'print', chapter: 'files', target: '.web-popup-print', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('gantt'); a.popup(() => a.app.run('print'), 'print'); } },
  { id: 'imageExport', chapter: 'files', target: '.web-popup-image', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('gantt'); a.popup(() => a.app.run('exportImage'), 'image'); } },
  { id: 'database', chapter: 'files', target: '.web-popup-settings', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('gantt'); a.popup(() => a.app.popups.open('settings', { tab: 'database' }), 'settings'); } },
  { id: 'recentFiles', chapter: 'files', target: '.web-popup-recent', async run(a) { await a.sample('gantt'); a.popup(() => a.app.run('recent'), 'recent'); } },
  { id: 'dragDrop', chapter: 'files', target: '#center', dwell: 5000, async run(a) {
    await a.sample('gantt');
    const overlay = q('.drop-overlay');
    overlay?.classList.add('visible');
    overlay.querySelector('span').textContent = t('drop.hint');
    await sleep(2500);
    overlay?.classList.remove('visible');
  } },
  // ── customizing
  { id: 'theme', chapter: 'customize', target: '.split-button:not(.view-split)', dwell: 6000, async run(a) {
    await a.sample('gantt');
    for (let i = 0; i < 3; i++) { await a.app.run('theme'); await sleep(900); }
    a.menuFor('themeMenu');
  } },
  { id: 'language', chapter: 'customize', target: '[data-command="language"]', dwell: 5000, async run(a) {
    await a.closeMenus();
    await a.sample('gantt');
    await a.app.run('language');
    await sleep(2000);
    await a.app.run('language');
  } },
  { id: 'panels', chapter: 'customize', target: '#workspace', dwell: 5000, async run(a) {
    await a.sample('gantt');
    a.app.updateSettings({ showLeftPanel: false });
    await sleep(900);
    a.app.updateSettings({ showRightPanel: false });
    await sleep(900);
    a.app.updateSettings({ showLeftPanel: true, showRightPanel: true });
  } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', dwell: 7000, async run(a) { await a.sample('gantt'); a.popup(() => a.app.popups.open('settings', { tab: 'font' }), 'settings'); } },
  { id: 'statusBar', chapter: 'customize', target: '#statusbar', run: (a) => a.sample('gantt') },
  // ── help
  { id: 'shortcuts', chapter: 'help', target: '.web-popup-settings', async run(a) { await a.sample('gantt'); a.popup(() => a.app.popups.open('settings', { tab: 'shortcuts' }), 'settings'); } },
  { id: 'about', chapter: 'help', target: '.web-popup-about', async run(a) { await a.sample('gantt'); a.popup(() => a.app.run('about'), 'about'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', run: (a) => a.sample('gantt') },
];

export class Tutorial {
  constructor(app, layer) {
    this.app = app;
    this.layer = layer;
    this.index = 0;
    this.active = false;
    this.busy = false;
    this.autoplay = false;
    this.timer = null;
    this.card = { right: 18, bottom: 34 };
  }

  state() {
    return { active: this.active, index: this.index, busy: this.busy, autoplay: this.autoplay, total: STEPS.length, id: STEPS[this.index]?.id };
  }

  /** Everything a step's `run` uses. */
  helpers() {
    const app = this.app;
    const tutorial = this;
    return {
      app,
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      async sample(view = null) {
        await tutorial.closeAll();
        let doc = app.state.docs.find((item) => item.id === tutorial.docId);
        if (!doc) {
          const project = buildSample(getLanguage());
          doc = new PlanDocument(project, { name: project.title });
          doc.markSaved(null);
          tutorial.docId = doc.id;
          doc.view.id = 'gantt';
          app.state.docs.push(doc);
        }
        if (app.state.active !== doc.id || app.state.showStart) {
          app.state.active = doc.id;
          app.state.showStart = false;
          app.switchView(view ?? doc.view.id ?? 'gantt');
        } else if (view && doc.view.id !== view) app.switchView(view);
        await sleep(150);
        return doc;
      },
      taskAt: (row) => app.project().tasks[row - 1],
      leafAt: (row) => {
        const tasks = app.project().tasks;
        let count = 0;
        for (const task of tasks) if (!app.sched().info(task.id)?.summary && ++count === row) return task;
        return tasks[tasks.length - 1];
      },
      findByName: (name) => app.project().tasks.find((task) => task.name === name),
      selectRow: (row) => { const task = app.project().tasks[row - 1]; if (task) app.select('task', [task.id]); return task; },
      edit(task, fieldId, value) {
        const field = app.taskFieldMap().get(fieldId);
        app.editTaskField({ item: task, info: app.sched().info(task.id) }, field, value);
      },
      blurEditors() { document.activeElement?.blur?.(); app.view?.grid?.cancel?.(); },
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      menuFor(command) {
        const element = q(`[data-command="${command}"]`);
        if (element) app.run(command, { anchor: app.anchorBelow(element.closest('.split-button') ?? element) });
      },
      closeMenus: () => tutorial.closeAll(),
    };
  }

  async closeAll() {
    await this.app.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    this.app.popups.frames.clear();
  }

  async start({ autoplay = false, index = 0 } = {}) {
    if (this.active) { this.go(index); return; }
    this.active = true;
    this.autoplay = autoplay;
    // Remember what the tour changes, to put it back at the end.
    this.saved = { ...this.app.settings() };
    this.savedActive = this.app.state.active;
    this.savedStart = this.app.state.showStart;
    this.app.popups.inline = true;
    await this.closeAll();
    this.layer.classList.add('active');
    this.go(index);
  }

  async stop() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.active = false;
    this.autoplay = false;
    await this.closeAll();
    this.app.popups.inline = false;
    this.layer.classList.remove('active');
    this.layer.innerHTML = '';
    const doc = this.app.state.docs.find((item) => item.id === this.docId);
    if (doc) await this.app.closeDoc(doc, { force: true });
    this.docId = null;
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    const back = this.app.state.docs.find((item) => item.id === this.savedActive);
    if (back) { this.app.state.active = back.id; this.app.state.showStart = this.savedStart; this.app.switchView(back.view.id); }
    else this.app.showStartPage(true);
    this.app.notify('success', t('tutorial.ended'));
  }

  next() { if (this.index < STEPS.length - 1) this.go(this.index + 1); else this.stop(); }
  prev() { if (this.index > 0) this.go(this.index - 1); }

  async go(index) {
    clearTimeout(this.timer);
    this.index = Math.max(0, Math.min(STEPS.length - 1, index));
    const step = STEPS[this.index];
    this.busy = true;
    this.draw(step);
    try {
      await step.run(this.helpers());
    } catch (error) {
      console.error('tutorial step', step.id, error);
    }
    await sleep(350);
    if (!this.active || STEPS[this.index] !== step) return;
    this.busy = false;
    this.draw(step);
    if (this.autoplay) {
      this.timer = setTimeout(() => {
        if (!this.active || !this.autoplay) return;
        if (this.index < STEPS.length - 1) this.next();
      }, step.dwell ?? 4200);
    }
  }

  /** The card and the outline of the step's target. */
  draw(step) {
    const chapter = step.chapter;
    const chapterSteps = STEPS.filter((s) => s.chapter === chapter);
    const target = q(step.target);
    let outline = '';
    if (target) {
      const r = target.getBoundingClientRect();
      outline = `<div class="tour-outline" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px"></div>`;
    }
    this.layer.innerHTML = `${outline}
      <div class="tour-card" role="dialog" aria-label="${escapeHtml(t('tutorial.title'))}" style="right:${this.card.right}px;bottom:${this.card.bottom}px">
        <div class="tour-head" data-tour-drag title="${escapeHtml(t('tutorial.drag'))}">${icon('tutorial')}<b>${escapeHtml(t('tutorial.title'))}</b>
          <span class="tour-chapter">${escapeHtml(t(`tutorial.chapter.${chapter}`))} · ${chapterSteps.indexOf(step) + 1}/${chapterSteps.length}</span>
          <span class="grow"></span>
          <button class="icon-button" data-tour="stop" title="${escapeHtml(t('tutorial.stop'))}" aria-label="${escapeHtml(t('tutorial.stop'))}">${icon('close')}</button></div>
        <div class="tour-progress"><i style="width:${((this.index + 1) / STEPS.length) * 100}%"></i></div>
        <h3>${escapeHtml(t(`tutorial.${step.id}.title`))}</h3>
        <p>${escapeHtml(t(`tutorial.${step.id}.text`))}</p>
        <div class="tour-foot">
          <select data-tour-chapter title="${escapeHtml(t('tutorial.chapters'))}" aria-label="${escapeHtml(t('tutorial.chapters'))}">${CHAPTERS.map((id) => `<option value="${id}" ${id === chapter ? 'selected' : ''}>${escapeHtml(t(`tutorial.chapter.${id}`))}</option>`).join('')}</select>
          <span class="tour-count">${this.index + 1} / ${STEPS.length}${this.busy ? ' …' : ''}</span>
          <span class="grow"></span>
          <button class="icon-button" data-tour="prev" title="${escapeHtml(t('tutorial.prev'))}" aria-label="${escapeHtml(t('tutorial.prev'))}" ${this.index === 0 ? 'disabled' : ''}>${icon('stepBack')}</button>
          <button class="icon-button ${this.autoplay ? 'active' : ''}" data-tour="play" title="${escapeHtml(t(this.autoplay ? 'tutorial.pause' : 'tutorial.play'))}" aria-label="${escapeHtml(t(this.autoplay ? 'tutorial.pause' : 'tutorial.play'))}">${icon(this.autoplay ? 'pause' : 'play')}</button>
          <button class="button primary small" data-tour="next" title="${escapeHtml(t(this.index === STEPS.length - 1 ? 'tutorial.done' : 'tutorial.next'))}">${escapeHtml(t(this.index === STEPS.length - 1 ? 'tutorial.done' : 'tutorial.next'))}${icon('stepForward')}</button>
        </div>
      </div>`;
    this.layer.onclick = (event) => {
      const button = event.target.closest('[data-tour]');
      if (!button || button.disabled) return;
      const actionName = button.dataset.tour;
      if (actionName === 'next') this.next();
      else if (actionName === 'prev') this.prev();
      else if (actionName === 'stop') this.stop();
      else if (actionName === 'play') { this.autoplay = !this.autoplay; if (this.autoplay && !this.busy) this.next(); else this.draw(STEPS[this.index]); }
    };
    this.layer.onchange = (event) => {
      if (event.target.matches('[data-tour-chapter]')) this.go(STEPS.findIndex((s) => s.chapter === event.target.value));
    };
    this.layer.onpointerdown = (event) => {
      if (!event.target.closest('[data-tour-drag]') || event.target.closest('button')) return;
      const { right, bottom } = this.card;
      const card = this.layer.querySelector('.tour-card');
      pointerDrag(event, {
        move: (dx, dy) => { this.card = { right: Math.max(0, right - dx), bottom: Math.max(0, bottom - dy) }; card.style.right = `${this.card.right}px`; card.style.bottom = `${this.card.bottom}px`; },
      });
    };
  }
}

