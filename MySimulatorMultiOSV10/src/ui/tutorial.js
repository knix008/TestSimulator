// Tutorial: a guided tour that runs the real app, chapter by chapter — the
// start page, finding your way, building a pipeline, running and results,
// the dashboard and the report, the analysis areas, automation and
// integration, and customizing.
//
// It works on samples of its own, opened in new tabs and closed at the end
// without touching the user's pipelines; the settings it changes (theme,
// panels…) are put back when it ends. A card at the bottom right shows the
// step with previous / next, auto play, a chapter list and exit; the part of
// the window the step is about is outlined. Each step's `run` puts the app in
// the state it shows from any starting point, so steps can be visited in any
// order.
import { h, replace } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { sampleModel } from '../core/samples.js';
import { CHAPTERS, STEP_TEXT, stepText, chapterName } from '../core/tutorial-text.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => document.querySelector(selector);

/** Steps: `target` is outlined; `run(a)` puts the app in the state the step shows; `dwell`: auto-play time (ms). */
export const STEPS = [
  { id: 'welcome', target: '.start-hero', run: (a) => a.start() },
  { id: 'startNew', target: '.start-card.templates', run: (a) => a.start() },
  { id: 'startRecent', target: '.start-card.recent', run: (a) => a.start() },
  { id: 'startBackground', target: '.start-card.side', dwell: 7000, async run(a) {
    await a.start();
    for (const kind of ['lorenz', 'network', 'montecarlo', 'oscilloscope']) { a.api.patchSettings({ animation: kind }); a.api.refreshStart(); await sleep(1100); }
  } },
  { id: 'startSamples', target: '[data-testid=start-samples]', async run(a) { await a.start(); document.querySelector('[data-testid=start-samples]')?.scrollIntoView({ block: 'center' }); } },
  { id: 'openSample', target: '[data-testid=viewport]', run: (a) => a.sample(true) },
  { id: 'menubar', target: '[data-testid=menubar]', run: (a) => a.sample() },
  { id: 'workbench', target: '[data-testid=left-panel]', dwell: 6500, async run(a) {
    await a.sample();
    for (const wb of ['signal', 'dynamics', 'analysis', 'montecarlo', 'integration', 'pipeline']) { a.api.patchSettings({ workbench: wb }); await sleep(800); }
  } },
  { id: 'toolbar', target: '[data-testid=toolbar]', run: (a) => a.sample() },
  { id: 'tree', target: '[data-testid=pipeline-tree]', async run(a) { await a.sample(true); a.api.patchSettings({ folds: { ...a.api.state.settings.folds, tools: true } }); } },
  { id: 'properties', target: '[data-testid=right-panel]', async run(a) { await a.sample(true); a.select('lp'); } },
  { id: 'resultStrip', target: '[data-testid=chart-strip]', async run(a) { await a.sample(true); a.select('fftClean'); a.api.setChartTab('chart'); } },
  { id: 'addNode', target: '[data-testid=left-panel]', async run(a) {
    await a.sample(true);
    a.select('lp');
    if (!a.api.doc().model.nodes.some((n) => n.type === 'signal.peaks')) a.api.run('add:signal.peaks');
  } },
  { id: 'link', target: '[data-testid=viewport]', run: (a) => a.sample(true) },
  { id: 'params', target: '[data-testid=right-panel]', async run(a) { await a.other('vibration', true); a.select('msd'); } },
  { id: 'library', target: '[data-testid=dialog-library]', async run(a) { await a.sample(); await a.dialog('nodeLibrary'); } },
  { id: 'arrange', target: '[data-testid=viewport]', dwell: 5500, async run(a) { await a.sample(); a.api.run('autoLayout'); await sleep(600); a.api.run('fit'); } },
  { id: 'run', target: '[data-testid=tb-run]', async run(a) { await a.sample(); await a.api.runPipeline(); } },
  { id: 'stale', target: '[data-testid=pipeline-tree]', async run(a) {
    await a.sample(true);
    a.api.patchNode('lp', { params: { cutoff: 70 } });
    a.select('lp');
  } },
  { id: 'dataView', target: '[data-testid=viewport]', async run(a) { await a.sample(true); a.select('lp'); a.api.setView('data'); } },
  { id: 'errors', target: '[data-testid=chart-strip]', async run(a) { await a.sample(true); a.select(null); a.api.setChartTab('log'); } },
  { id: 'dashboard', target: '[data-testid=viewport]', async run(a) { await a.sample(true); a.api.setView('dashboard'); } },
  { id: 'report', target: '[data-testid=dialog-report]', async run(a) { await a.sample(true); await a.dialog('exportReport'); } },
  { id: 'view3d', target: '[data-testid=viewport]', dwell: 6000, async run(a) { await a.other('lorenz', true); a.select('lor'); a.api.setView('3d'); } },
  { id: 'areaSignal', target: '[data-testid=viewport]', async run(a) { await a.other('chirpSpectrogram', true); a.api.setView('dashboard'); } },
  { id: 'areaControl', target: '[data-testid=viewport]', async run(a) { await a.other('pidControl', true); a.api.setView('dashboard'); } },
  { id: 'areaMl', target: '[data-testid=viewport]', async run(a) { await a.other('classification', true); a.api.setView('dashboard'); } },
  { id: 'areaMc', target: '[data-testid=viewport]', async run(a) { await a.other('tolerance', true); a.api.setView('dashboard'); } },
  { id: 'sweep', target: '[data-testid=viewport]', async run(a) { await a.other('pidSweep', true); a.api.setView('dashboard'); } },
  { id: 'python', target: '[data-testid=viewport]', async run(a) { await a.other('python'); a.select('py'); } },
  { id: 'batch', target: '[data-testid=dialog-batch]', async run(a) { await a.sample(); await a.dialog('batchHelp'); } },
  { id: 'files', target: '[data-testid=menu-file]', run: (a) => a.sample() },
  { id: 'theme', target: '.theme-picker', dwell: 6000, async run(a) {
    await a.sample();
    for (const id of ['ocean', 'forest', 'dark']) { if (a.api.state.settings.theme !== id) a.api.patchSettings({ theme: id }); await sleep(900); }
  } },
  { id: 'language', target: '[data-testid=tb-language]', run: (a) => a.sample() },
  { id: 'settings', target: '[data-testid=dialog-settings]', async run(a) { await a.sample(); await a.dialog('settings'); } },
  { id: 'finish', target: '[data-testid=menu-help]', run: (a) => a.sample() },
].map((step) => ({ ...step, chapter: STEP_TEXT[step.id].chapter }));

export const CHAPTER_IDS = Object.keys(CHAPTERS);

export class Tutorial {
  /** api: the app API (state, run, doc, openModel, select, …); layer: the fixed overlay element. */
  constructor(api, layer) {
    this.api = api;
    this.layer = layer;
    this.index = 0;
    this.active = false;
    this.busy = false;
    this.autoplay = false;
    this.timer = null;
    this.card = { right: 18, bottom: 36 };
    this.docs = new Map(); // sample id → doc id
  }

  state() {
    return { active: this.active, index: this.index, busy: this.busy, autoplay: this.autoplay, total: STEPS.length, id: STEPS[this.index]?.id };
  }

  /** Everything a step's `run` uses. */
  helpers() {
    const tour = this;
    const api = this.api;
    // A sample by id (kept and closed at the end), shown in the pipeline view; `run` computes it once.
    const open = async (sampleId, run = false) => {
      tour.closeAll();
      let doc = api.state.docs.find((d) => d.id === tour.docs.get(sampleId));
      if (!doc) {
        doc = api.openModel(sampleModel(sampleId, getLanguage()), null, { keepPristine: true });
        doc.dirty = false;
        tour.docs.set(sampleId, doc.id);
      }
      if (api.state.activeId !== doc.id) api.activate(doc.id);
      api.showStart(false);
      api.setView('graph');
      api.setChartTab('chart');
      api.patchSettings({ folds: { ...(tour.saved?.folds ?? {}) }, showToolPanel: true, showPropertyPanel: true, showChartPanel: true, leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false });
      if (run && !doc.results) await api.runPipeline();
      await sleep(150);
      api.graph()?.fit();
      return doc;
    };
    const a = {
      api,
      saved: this.saved,
      active: () => tour.active,
      async start() { tour.closeAll(); api.showStart(true); await sleep(200); },
      sample: (run = false) => open('signalCleanup', run),
      other: (id, run = false) => open(id, run),
      select(id) { api.select(id ? { kind: 'node', ids: [id] } : null); },
      async dialog(command) {
        tour.closeAll();
        await api.run(command);
        await sleep(250);
      },
    };
    return a;
  }

  closeAll() {
    for (const el of document.querySelectorAll('.popup-backdrop')) el.remove();
    this.api.closeMenu();
    if (this.api.state.themeMenu) { this.api.state.themeMenu = false; this.api.refreshToolbar?.(); }
  }

  async start({ autoplay = false, index = 0 } = {}) {
    if (this.active) {
      this.go(index);
      return;
    }
    this.active = true;
    this.autoplay = autoplay;
    // What the tour changes is put back at the end.
    this.saved = { ...this.api.state.settings };
    this.savedActive = this.api.state.activeId;
    this.savedStart = this.api.startVisible();
    this.savedView = this.api.state.view;
    this.layer.classList.add('active');
    this.go(index);
  }

  async stop() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.active = false;
    this.autoplay = false;
    this.closeAll();
    this.layer.classList.remove('active');
    replace(this.layer);
    for (const docId of this.docs.values()) this.api.closeDocForce(docId);
    this.docs.clear();
    const { recentFiles, ...rest } = this.saved;
    void recentFiles;
    this.api.patchSettings({ ...rest, tutorialDone: true });
    this.api.setView(this.savedView);
    if (this.api.state.docs.some((d) => d.id === this.savedActive)) this.api.activate(this.savedActive);
    this.api.showStart(this.savedStart);
    this.api.setStatus('tutorialEnded');
  }

  next() {
    if (this.index < STEPS.length - 1) this.go(this.index + 1);
    else this.stop();
  }

  prev() {
    if (this.index > 0) this.go(this.index - 1);
  }

  async go(index) {
    clearTimeout(this.timer);
    this.index = Math.max(0, Math.min(STEPS.length - 1, index));
    const step = STEPS[this.index];
    this.busy = true;
    this.draw(step);
    try {
      await step.run(this.helpers());
    } catch (error) {
      console.warn('tutorial step', step.id, error);
    }
    await sleep(300);
    if (!this.active || STEPS[this.index] !== step) return;
    this.busy = false;
    this.draw(step);
    if (this.autoplay) {
      this.timer = setTimeout(() => {
        if (this.active && this.autoplay && this.index < STEPS.length - 1) this.next();
      }, step.dwell ?? 4800);
    }
  }

  /** The card and the outline round the step's target. */
  draw(step) {
    const lang = getLanguage();
    const text = stepText(step.id, lang);
    const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
    const target = q(step.target);
    const items = [];
    if (target) {
      // 4 px round the target, clamped inside the window so an edge target keeps its whole outline.
      const r = target.getBoundingClientRect();
      const M = 3;
      const clamp = (v, max) => Math.min(Math.max(v, M), max - M);
      const left = clamp(r.left - 4, innerWidth);
      const top = clamp(r.top - 4, innerHeight);
      const right = clamp(r.right + 4, innerWidth);
      const bottom = clamp(r.bottom + 4, innerHeight);
      items.push(h('div', { className: 'tour-outline', dataset: { testid: 'tour-outline' }, style: { left: `${left}px`, top: `${top}px`, width: `${Math.max(12, right - left)}px`, height: `${Math.max(12, bottom - top)}px` } }));
    }
    const button = (label, action, opts = {}) => h('button', { type: 'button', className: opts.className ?? 'icon-button', title: label, 'aria-label': label, disabled: opts.disabled, dataset: { tour: action, testid: `tour-${action}` } }, opts.content ?? label);
    const card = h('div', { className: 'tour-card', role: 'dialog', 'aria-label': t('tutTitle'), dataset: { testid: 'tour-card' }, style: { right: `${this.card.right}px`, bottom: `${this.card.bottom}px` } },
      h('div', { className: 'tour-head', dataset: { tourDrag: '1' }, title: t('tutDrag') },
        h('span', null, '🎓'), h('b', null, t('tutTitle')),
        h('span', { className: 'tour-chapter' }, `${chapterName(step.chapter, lang)} · ${chapterSteps.indexOf(step) + 1}/${chapterSteps.length}`),
        h('span', { className: 'grow' }),
        button(t('tutStop'), 'stop', { content: '✕' })),
      h('div', { className: 'tour-progress' }, h('i', { style: { width: `${((this.index + 1) / STEPS.length) * 100}%` } })),
      h('h3', { dataset: { testid: 'tour-title' } }, text.title),
      h('p', null, text.text),
      h('div', { className: 'tour-foot' },
        h('select', { title: t('tutChapters'), dataset: { tourChapter: '1', testid: 'tour-chapter' } }, ...CHAPTER_IDS.map((id) => h('option', { value: id, selected: id === step.chapter }, chapterName(id, lang)))),
        h('span', { className: 'tour-count', dataset: { testid: 'tour-count' } }, `${this.index + 1} / ${STEPS.length}${this.busy ? ' …' : ''}`),
        h('span', { className: 'grow' }),
        button(t('tutPrev'), 'prev', { content: '⏮', disabled: this.index === 0 }),
        button(this.autoplay ? t('tutPause') : t('tutPlay'), 'play', { content: this.autoplay ? '⏸' : '▶', className: this.autoplay ? 'icon-button active' : 'icon-button' }),
        button(this.index === STEPS.length - 1 ? t('tutDone') : t('tutNext'), 'next', { className: 'primary small', content: `${this.index === STEPS.length - 1 ? t('tutDone') : t('tutNext')} ⏭` })));
    items.push(card);
    replace(this.layer, ...items);
    this.layer.onclick = (event) => {
      const el = event.target.closest('[data-tour]');
      if (!el || el.disabled) return;
      const action = el.dataset.tour;
      if (action === 'next') this.next();
      else if (action === 'prev') this.prev();
      else if (action === 'stop') this.stop();
      else if (action === 'play') {
        this.autoplay = !this.autoplay;
        if (this.autoplay && !this.busy) this.next();
        else this.draw(STEPS[this.index]);
      }
    };
    this.layer.onchange = (event) => {
      if (event.target.dataset.tourChapter) this.go(STEPS.findIndex((s) => s.chapter === event.target.value));
    };
    this.layer.onpointerdown = (event) => {
      if (!event.target.closest('[data-tour-drag]') || event.target.closest('button')) return;
      const start = { x: event.clientX, y: event.clientY, ...this.card };
      const move = (ev) => {
        this.card = { right: Math.max(0, start.right - (ev.clientX - start.x)), bottom: Math.max(0, start.bottom - (ev.clientY - start.y)) };
        card.style.right = `${this.card.right}px`;
        card.style.bottom = `${this.card.bottom}px`;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }
}
