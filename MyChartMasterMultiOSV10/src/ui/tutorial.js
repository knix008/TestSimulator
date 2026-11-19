// Tutorial: a guided tour that runs the real app, chapter by chapter: the start page, a sample chart, the
// chart types, the data grid, styling in the inspector, importing data, exporting and printing, and customizing.
//
// It works on sample charts of its own (tabs closed at the end without touching the user's charts); the settings
// it changes are put back when it ends. While it runs, popups open inside the main window (so a screen
// recording shows them). A card at the bottom right shows the step with previous / next, auto play, a chapter
// list and exit; the part of the window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';

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
const ko = () => getLanguage() !== 'en';

export const CHAPTERS = ['start', 'open', 'types', 'data', 'style', 'import', 'files', 'customize'];

const TOUR_CSV = '지역,1분기,2분기\n서울,120,135\n부산,80,92\n대구,64,70\n인천,71,77\n';

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in the state the step
 * shows; `dwell`: how long auto play stays (ms).
 */
export const STEPS = [
  // ── start page
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'home', chapter: 'start', target: '#menubar [data-home]', run: (a) => a.start() },
  { id: 'newChartCard', chapter: 'start', target: '.start-card.newchart', dwell: 6000, run: (a) => a.start() },
  { id: 'samplesCard', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  { id: 'recentCard', chapter: 'start', target: '.start-card.recent', run: (a) => a.start() },
  // ── a chart
  { id: 'sample', chapter: 'open', target: '#view-host', dwell: 5000, run: (a) => a.sample() },
  { id: 'stage', chapter: 'open', target: '.ch-stage', dwell: 6000, async run(a) { await a.sample(); a.hover('.ch-canvas .mark'); } },
  { id: 'gallery', chapter: 'open', target: '.ch-gallery', run: (a) => a.sample() },
  { id: 'inspector', chapter: 'open', target: '.ch-inspector', run: (a) => a.sample() },
  { id: 'grid', chapter: 'open', target: '.pane-grid', run: (a) => a.sample() },
  // ── chart types
  { id: 'typeLine', chapter: 'types', target: '.ch-gallery', dwell: 6000, async run(a) { await a.sample(); await a.type('line'); } },
  { id: 'typeStacked', chapter: 'types', target: '.ch-stage', dwell: 6000, async run(a) { await a.sample(); await a.type('stackedColumn'); } },
  { id: 'typePie', chapter: 'types', target: '.ch-stage', dwell: 6000, async run(a) { await a.sample('market-share'); await a.type('donut'); } },
  { id: 'typeSpecial', chapter: 'types', target: '.ch-stage', dwell: 7000, run: (a) => a.sample('energy-sankey') },
  { id: 'mapping', chapter: 'types', target: '.ch-inspector', dwell: 7000, async run(a) { await a.sample(); a.tab('data'); } },
  // ── data
  { id: 'gridEdit', chapter: 'data', target: '.pane-grid', dwell: 7000, async run(a) { await a.sample(); a.app.view?.grid.setActive(2, 1); } },
  { id: 'gridTools', chapter: 'data', target: '.ch-grid-tools', run: (a) => a.sample() },
  { id: 'sort', chapter: 'data', target: '.ch-stage', dwell: 6000, run: (a) => a.sample('regional-bars') },
  { id: 'dataStats', chapter: 'data', target: '.web-popup-datastats', dwell: 6000, async run(a) { await a.sample(); await a.popup(() => a.app.run('dataStats'), 'datastats'); } },
  // ── style
  { id: 'titles', chapter: 'style', target: '.ch-inspector', dwell: 6000, async run(a) { await a.sample(); a.tab('style'); } },
  { id: 'palette', chapter: 'style', target: '.web-popup-palette', dwell: 6000, async run(a) { await a.sample(); await a.popup(() => a.app.run('paletteMenu'), 'palette'); } },
  { id: 'labels', chapter: 'style', target: '.ch-stage', dwell: 6000, async run(a) { await a.sample(); a.option('dataLabels', true); } },
  { id: 'axes', chapter: 'style', target: '.ch-inspector', async run(a) { await a.sample('revenue-profit-combo'); a.tab('axes'); } },
  { id: 'series', chapter: 'style', target: '.ch-inspector', async run(a) { await a.sample(); a.tab('series'); } },
  // ── import
  { id: 'importFiles', chapter: 'import', target: '#toolbar [data-command="importData"]', run: (a) => a.sample() },
  { id: 'importPreview', chapter: 'import', target: '.web-popup-import', dwell: 7000, async run(a) { await a.start(); await a.popup(() => a.app.importText(TOUR_CSV, 'tour.csv'), 'import'); } },
  { id: 'paste', chapter: 'import', target: '#toolbar [data-command="pasteData"]', run: (a) => a.sample() },
  // ── files
  { id: 'save', chapter: 'files', target: '#toolbar [data-command="save"]', run: (a) => a.sample() },
  { id: 'export', chapter: 'files', target: '.web-popup-export', dwell: 7000, async run(a) { await a.sample(); await a.popup(() => a.app.run('exportChart'), 'export'); } },
  { id: 'print', chapter: 'files', target: '.web-popup-print', dwell: 7000, async run(a) { await a.sample(); await a.popup(() => a.app.run('print'), 'print'); } },
  // ── customize
  { id: 'theme', chapter: 'customize', target: '.split-button', dwell: 6000, async run(a) { await a.sample(); for (const theme of ['dark', 'light']) { a.app.updateSettings({ theme }); await sleep(900); } } },
  { id: 'layout', chapter: 'customize', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); for (const layout of ['grid-right', 'grid-bottom']) { a.app.updateSettings({ paneLayout: layout }); await sleep(1200); } } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', async run(a) { await a.sample(); await a.popup(() => a.app.popups.open('settings', { tab: 'charts' }), 'settings'); } },
  { id: 'help', chapter: 'customize', target: '#menubar [data-menu="help"]', run: (a) => a.sample() },
  { id: 'finish', chapter: 'customize', target: '[data-command="tutorial"]', run: (a) => a.sample() },
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
    const helpers = {
      app,
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      /** A sample chart of the tour (by id), opened once and kept for the tour. */
      async sample(id = 'monthly-sales') {
        await tutorial.closeAll();
        const samples = app.samples();
        const wanted = samples.find((x) => x.id === id) ?? samples[0];
        let doc = app.state.docs.find((d) => d.tourSample === wanted.id);
        if (!doc) {
          doc = await app.openSample(wanted.id);
          if (doc) { doc.tourSample = wanted.id; tutorial.docs.add(doc.id); }
        } else if (app.state.active !== doc.id || app.state.showStart) {
          app.state.active = doc.id; app.state.showStart = false; app.renderAll();
        }
        // The tour's own sample starts from its saved look every time.
        if (doc && doc.undoStack.length) { while (doc.undo()) { /* back to the start */ } doc.undoStack = []; doc.redoStack = []; app.refreshView(); }
        await until(() => app.view);
        await sleep(150);
        return doc;
      },
      async type(id) { app.setChartType(id); await sleep(400); },
      tab(id) { app.setInspectorTab(id); },
      option(key, value) { app.setOption(key, value); },
      hover(selector) { const el = q(selector); if (el) el.classList.add('hover'); },
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
      ko,
    };
    app.actions = window.__mychartmaster?.actions;
    return helpers;
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
    this.docs = new Set();
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
    for (const id of this.docs ?? []) {
      const doc = this.app.state.docs.find((item) => item.id === id);
      if (doc) await this.app.closeDoc(doc, { force: true });
    }
    this.docs = new Set();
    this.demoId = null;
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    const back = this.app.state.docs.find((item) => item.id === this.savedActive);
    if (back) { this.app.state.active = back.id; this.app.state.showStart = this.savedStart; this.app.renderAll(); }
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
      // 4 px around the target, but always inside the window: a target at an edge (the workspace, a side
      // panel, the start page) would otherwise have part of the outline outside it.
      const r = target.getBoundingClientRect();
      // Every edge is clamped, so a target scrolled out of a narrow window still gets a small outline at the edge.
      const M = 4; const MIN = 12;
      const clamp = (value, max) => Math.min(Math.max(value, M), max - M);
      let left = clamp(r.left - 4, window.innerWidth); let top = clamp(r.top - 4, window.innerHeight);
      const right = clamp(r.right + 4, window.innerWidth); const bottom = clamp(r.bottom + 4, window.innerHeight);
      left = Math.min(left, right - MIN); top = Math.min(top, bottom - MIN);
      outline = `<div class="tour-outline" style="left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px"></div>`;
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
          <select data-icon="tutorial" data-tour-chapter title="${escapeHtml(t('tutorial.chapters'))}" aria-label="${escapeHtml(t('tutorial.chapters'))}">${CHAPTERS.map((id) => `<option value="${id}" ${id === chapter ? 'selected' : ''}>${escapeHtml(t(`tutorial.chapter.${id}`))}</option>`).join('')}</select>
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

