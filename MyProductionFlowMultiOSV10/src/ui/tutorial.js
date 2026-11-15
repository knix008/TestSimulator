// Tutorial: a guided tour that runs the real app, chapter by chapter — the start
// page, building a model with the mouse (library, placing, connecting,
// properties), running it and watching it in 2D and 3D, statistics and charts,
// experiments and reports, system dynamics and agents, files and settings.
//
// It works on models of its own (samples); the user's model is put back at the
// end, and the settings it changes are restored. While it runs, popups open
// inside the main window (so a screen recording shows them).
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

export const CHAPTERS = ['start', 'build', 'run', 'analyse', 'paradigms', 'help'];

const pick = (a, type) => a.app.model()?.blocks.find((b) => b.type === type);

export const STEPS = [
  // ── start
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'templates', chapter: 'start', target: '.start-card.templates', run: (a) => a.start() },
  { id: 'samples', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  // ── build
  { id: 'workspace', chapter: 'build', target: '#workspace', dwell: 6000, run: (a) => a.project('line') },
  { id: 'library', chapter: 'build', target: '#left-panel', dwell: 6000, run: (a) => a.project('line') },
  { id: 'place', chapter: 'build', target: '#view2d', dwell: 6000, async run(a) { await a.project('line'); a.app.setViewMode('split'); a.app.startPlacing('queue'); } },
  { id: 'connect', chapter: 'build', target: '[data-command="tool:connect"]', dwell: 6000, async run(a) { await a.project('line'); a.app.setTool('connect'); } },
  { id: 'properties', chapter: 'build', target: '#properties', dwell: 7000, async run(a) { await a.project('line'); a.app.setTool('select'); const b = pick(a, 'process'); if (b) a.app.setSelection([b.id]); } },
  { id: 'explorer', chapter: 'build', target: '#explorer', run: (a) => a.project('line') },
  { id: 'problems', chapter: 'build', target: '#bottom-panel', async run(a) { await a.project('line'); a.app.run('showProblems'); } },
  // ── run
  { id: 'runbar', chapter: 'run', target: '#run-bar', dwell: 6000, async run(a) { await a.project('line'); a.app.setSelection([]); a.app.runPause(); } },
  { id: 'view2d', chapter: 'run', target: '#view2d', dwell: 6000, async run(a) { await a.project('line'); if (a.app.state.simStatus !== 'running') a.app.runPause(); } },
  { id: 'view3d', chapter: 'run', target: '#view3d', dwell: 7000, async run(a) { await a.project('line'); a.app.setViewMode('split'); if (a.app.state.simStatus !== 'running') a.app.runPause(); a.app.view3d?.setView('iso'); } },
  { id: 'speed', chapter: 'run', target: '.run-speed', run: (a) => a.project('line') },
  { id: 'live', chapter: 'run', target: '#properties', dwell: 6000, async run(a) { await a.project('line'); const b = pick(a, 'process'); if (b) a.app.setSelection([b.id]); } },
  // ── analyse
  { id: 'stats', chapter: 'analyse', target: '#bottom-panel', dwell: 7000, async run(a) { await a.project('line'); a.app.stopRun({ quiet: true }); await a.app.runToEnd(); a.app.run('showStats'); } },
  { id: 'diagnosis', chapter: 'analyse', target: '#bottom-panel', dwell: 8000, async run(a) { await a.project('line'); if (a.app.state.simStatus !== 'finished') await a.app.runToEnd(); a.app.run('showDiagnosis'); } },
  { id: 'charts', chapter: 'analyse', target: '#bottom-panel', dwell: 6000, async run(a) { await a.project('line'); a.app.run('showCharts'); } },
  { id: 'experiment', chapter: 'analyse', target: '.web-popup-experiment', dwell: 7000, async run(a) { await a.project('line'); a.popup(() => a.app.run('experiment'), 'experiment'); } },
  { id: 'report', chapter: 'analyse', target: '.web-popup-report', dwell: 6000, async run(a) { await a.closeMenus(); await a.project('line'); a.popup(() => a.app.run('report'), 'report'); } },
  // ── paradigms
  { id: 'sd', chapter: 'paradigms', target: '#view2d', dwell: 7000, async run(a) { await a.closeMenus(); await a.project('bass'); a.app.runPause(); } },
  { id: 'agents', chapter: 'paradigms', target: '#views', dwell: 7000, async run(a) { await a.project('epidemic'); a.app.runPause(); } },
  { id: 'hybrid', chapter: 'paradigms', target: '#views', dwell: 7000, async run(a) { await a.project('hybrid'); a.app.runPause(); } },
  { id: 'traffic', chapter: 'paradigms', target: '#views', dwell: 7000, async run(a) { await a.project('intersection'); a.app.runPause(); } },
  // ── help
  { id: 'save', chapter: 'help', target: '[data-command="save"]', run: (a) => a.project('line') },
  { id: 'settings', chapter: 'help', target: '.web-popup-settings', async run(a) { await a.closeMenus(); await a.project('line'); a.popup(() => a.app.popups.open('settings', { tab: 'simulation' }), 'settings'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', async run(a) { await a.closeMenus(); await a.project('line'); } },
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
      /** One of the tour's sample models (each made once and kept while the tour runs). */
      async project(id = 'line') {
        await tutorial.closeAll();
        tutorial.docs ??= new Map();
        if (app.state.simStatus !== 'idle' && tutorial.current !== id) app.stopRun({ quiet: true });
        if (!tutorial.docs.has(id)) tutorial.docs.set(id, app.openSample(id));
        else if (app.takeDoc() !== tutorial.docs.get(id)) app.putDoc(tutorial.docs.get(id));
        tutorial.current = id;
        if (app.state.showStart) app.showStartPage(false);
        await sleep(150);
      },
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
      ko,
    };
  }

  stopPresentation() {}

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
    this.savedDoc = this.app.takeDoc();
    this.savedStart = this.app.state.showStart;
    this.docs = new Map();
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
    this.app.closeDocFrames?.();
    this.app.setTool?.('select');
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    this.app.stopRun?.({ quiet: true });
    this.app.putDoc(this.savedDoc ?? null);
    this.docs = new Map();
    if (!this.savedDoc || this.savedStart) this.app.showStartPage(true);
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

