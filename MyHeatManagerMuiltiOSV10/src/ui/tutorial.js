// Tutorial: a guided tour that runs the real app, chapter by chapter — the
// start page, finding your way, drawing, materials, heat sources and
// boundaries, solving, results, advanced studies (transient, CHT, stress),
// reliability / U-factor / heat maps, files and customizing.
//
// It works on samples of its own, opened in new tabs and closed at the end
// without touching the user's models; the settings it changes (theme,
// panels…) are put back when it ends. A card at the bottom right shows the
// step with previous / next, auto play, a chapter list and exit; the part of
// the window the step is about is outlined. Each step's `run` puts the app in
// the state it shows from any starting point, so steps can be visited in any
// order (and scripts/tutorial-capture.mjs screenshots them one by one).
import { h, replace } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { sampleModel } from '../core/samples.js';
import { materialFromLibrary } from '../core/materials.js';
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
    for (const kind of ['isotherms', 'convection', 'embers', 'plume']) { a.api.patchSettings({ animation: kind }); a.api.refreshStart(); await sleep(1100); }
  } },
  { id: 'startLayout', target: '[data-testid=start-board]', run: (a) => a.start() },
  { id: 'startSamples', target: '[data-testid=start-samples]', async run(a) { await a.start(); document.querySelector('[data-testid=start-samples]')?.scrollIntoView({ block: 'center' }); } },
  { id: 'openSample', target: '[data-testid=viewport]', run: (a) => a.sample() },
  { id: 'menubar', target: '[data-testid=menubar]', run: (a) => a.sample() },
  { id: 'workbench', target: '[data-testid=left-panel]', dwell: 6000, async run(a) {
    await a.sample();
    for (const wb of ['materials', 'loads', 'study', 'results', 'geometry']) { a.api.patchSettings({ workbench: wb }); await sleep(700); }
  } },
  { id: 'toolbar', target: '[data-testid=toolbar]', run: (a) => a.sample() },
  { id: 'zoomReset', target: '.zoom-control', async run(a) { await a.sample(); a.api.run('zoomIn'); a.api.run('zoomIn'); await sleep(700); a.api.run('zoomReset'); } },
  { id: 'tree', target: '[data-testid=left-panel]', async run(a) { await a.sample(); a.api.patchSettings({ folds: { ...a.api.state.settings.folds, tools: true } }); } },
  { id: 'properties', target: '[data-testid=right-panel]', async run(a) { await a.sample(); a.select('body', 'sink'); } },
  { id: 'statusbar', target: '[data-testid=statusbar]', run: (a) => a.sample() },
  { id: 'panelsFold', target: '[data-testid=left-panel]', dwell: 6000, async run(a) { await a.sample(); a.api.patchSettings({ leftCollapsed: true }); await sleep(1400); a.api.patchSettings({ leftCollapsed: false }); } },
  { id: 'viewButtons', target: '[data-testid=toolbar]', dwell: 6000, async run(a) { await a.sample(); a.api.patchSettings({ showMesh: true }); await sleep(1500); a.api.patchSettings({ showMesh: false }); } },
  { id: 'contextMenu', target: '[data-testid=menu-popup]', async run(a) { await a.sample(); a.select('body', 'sink'); a.api.openContextAt('body', 420, 420); } },
  { id: 'tabs', target: '[data-testid=tabstrip]', run: (a) => a.sample() },
  { id: 'domain', target: '[data-testid=dialog-domain]', async run(a) { await a.sample(); await a.dialog('domain'); } },
  { id: 'drawRect', target: '[data-testid=viewport]', async run(a) {
    await a.sample();
    a.api.run('rect');
    a.ensureBody({ id: 'tutCap', name: t('tutCapacitor'), shape: 'rect', material: 'emc', x: 70, y: 1.6, w: 6, h: 6 });
    a.select('body', 'tutCap');
  } },
  { id: 'drawShapes', target: '[data-testid=viewport]', async run(a) {
    await a.sample();
    a.ensureBody({ id: 'tutCap', name: t('tutCapacitor'), shape: 'rect', material: 'emc', x: 70, y: 1.6, w: 6, h: 6 });
    a.ensureBody({ id: 'tutCoil', name: t('tutInductor'), shape: 'circle', material: 'emc', cx: 63, cy: 22, r: 4 });
    a.ensureBody({ id: 'tutClip', name: t('tutClip'), shape: 'polygon', material: 'al6061', points: [[54, 5], [60, 5], [60, 14], [57, 14]] });
    a.api.run('polygon');
    a.select('body', 'tutCoil');
  } },
  { id: 'moveResize', target: '[data-testid=viewport]', async run(a) {
    await a.sample();
    a.ensureBody({ id: 'tutCap', name: t('tutCapacitor'), shape: 'rect', material: 'emc', x: 70, y: 1.6, w: 6, h: 6 });
    a.api.run('select');
    a.select('body', 'tutCap');
    a.api.updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (b.id === 'tutCap' ? { ...b, h: 8 } : b)) }));
    await sleep(700);
    a.api.run('undo');
  } },
  { id: 'library', target: '[data-testid=dialog-materials]', async run(a) { await a.sample(); await a.dialog('materials'); } },
  { id: 'assign', target: '[data-testid=right-panel]', async run(a) {
    await a.sample();
    const m = a.api.doc().model;
    if (!m.materials.some((x) => x.id === 'copper')) a.api.updateModel((model) => ({ ...model, materials: [...model.materials, materialFromLibrary('copper', getLanguage())] }));
    a.api.updateModel((model) => ({ ...model, bodies: model.bodies.map((b) => (b.id === 'sink' ? { ...b, material: 'copper' } : b)) }));
    a.select('body', 'sink');
  } },
  { id: 'anisotropic', target: '[data-testid=right-panel]', async run(a) { await a.sample(); a.select('material', 'pcb4'); } },
  { id: 'heatSource', target: '[data-testid=right-panel]', async run(a) {
    await a.sample(); a.api.patchSettings({ workbench: 'loads' }); a.select('body', 'q1');
    await sleep(100); q('input[data-testid="prop-power"]')?.focus();
  } },
  { id: 'convection', target: '[data-testid=right-panel]', async run(a) { await a.sample(); a.api.patchSettings({ workbench: 'loads' }); a.select('boundary', 'fan'); } },
  { id: 'boundaryTarget', target: '[data-testid=viewport]', async run(a) { await a.sample(); a.select('boundary', 'board'); } },
  { id: 'probe', target: '[data-testid=viewport]', async run(a) { await a.sample(); a.select('probe', 'p1'); } },
  { id: 'studySettings', target: '[data-testid=dialog-study]', async run(a) { await a.sample(); a.api.patchSettings({ workbench: 'study' }); await a.dialog('solverSettings'); } },
  { id: 'validate', target: '[data-testid=dialog-validate]', async run(a) { await a.sample(); await a.dialog('validate'); } },
  { id: 'run', target: '[data-testid=tb-run]', async run(a) { await a.sample(); await a.solve(true); } },
  { id: 'temperature', target: '[data-testid=viewport]', async run(a) { await a.result('fieldT'); } },
  { id: 'flux', target: '[data-testid=viewport]', async run(a) { await a.result('fieldFlux', { vectors: true }); } },
  { id: 'isotherms', target: '[data-testid=viewport]', async run(a) { await a.result('fieldT', { isotherms: true }); } },
  { id: 'lineCut', target: '[data-testid=chart-strip]', async run(a) {
    await a.result('fieldT');
    a.api.setLineCut({ a: { x: 26, y: 1 }, b: { x: 26, y: 25.5 } });
  } },
  { id: 'view3d', target: '[data-testid=viewport]', dwell: 6000, async run(a) { await a.result('fieldT'); a.api.run('view3d'); } },
  { id: 'guides3d', target: '[data-testid=viewport]', dwell: 7000, async run(a) {
    await a.other('pcb3d'); a.api.run('view3d'); await sleep(600);
    for (let i = 0; i < 3; i++) { a.api.run('zoomOut'); await sleep(450); }
  } },
  { id: 'slice3d', target: '[data-testid=viewport]', dwell: 7000, async run(a) {
    await a.other('pcb3d'); await a.solve(); a.api.run('fieldT'); a.api.run('view3d'); await sleep(400);
    a.api.setDisplay({ slice: { axis: 'y', index: 30 }, iso: null }); await sleep(1200);
    a.api.setDisplay({ slice: null, iso: { on: true, value: 60 } });
  } },
  { id: 'bottomPanel', target: '[data-testid=chart-strip]', async run(a) { await a.result('fieldT'); a.api.setChartTab('probes'); } },
  { id: 'report', target: '[data-testid=dialog-report]', async run(a) { await a.result('fieldT'); await a.dialog('exportReport'); } },
  { id: 'transient', target: '[data-testid=chart-strip]', dwell: 8000, async run(a) {
    await a.other('pcmSink'); await a.solve();
    a.api.run('fieldT'); a.api.setChartTab('probes');
    a.api.setFrame(18);
    await sleep(300);
    if (a.active()) a.api.run('animate');
  } },
  { id: 'cht', target: '[data-testid=viewport]', async run(a) { await a.other('microchannel'); await a.solve(); a.display({ vectors: true }); a.api.run('fieldVelocity'); } },
  { id: 'stress', target: '[data-testid=viewport]', async run(a) { await a.other('ledStress'); await a.solve(); a.display({ deformed: true }); a.api.run('fieldStress'); } },
  { id: 'turbulence', target: '[data-testid=viewport]', dwell: 7000, async run(a) { await a.other('turbulentDuct'); await a.solve(); a.display({ streamlines: true }); a.api.run('fieldVelocity'); } },
  { id: 'residuals', target: '[data-testid=chart-strip]', async run(a) { await a.other('turbulentDuct'); await a.solve(); a.api.setChartTab('residuals'); } },
  { id: 'flowMetrics', target: '[data-testid=right-panel]', async run(a) { await a.other('turbulentDuct'); await a.solve(); a.select('boundary', 'out'); } },
  { id: 'joule', target: '[data-testid=viewport]', async run(a) { await a.other('busbar'); await a.solve(); a.api.run('fieldCurrent'); } },
  { id: 'contact', target: '[data-testid=right-panel]', async run(a) { await a.other('busbar'); await a.solve(); a.api.run('fieldT'); a.select('boundary', 'joint'); } },
  { id: 'structural', target: '[data-testid=viewport]', async run(a) { await a.other('cantilever'); await a.solve(); a.display({ deformed: true }); a.api.run('fieldStress'); } },
  { id: 'modal', target: '[data-testid=viewport]', dwell: 7000, async run(a) { await a.other('bracketModal'); await a.solve(); a.api.run('fieldMode'); for (const k of [0, 1, 2]) { a.api.setMode(k); await sleep(900); } } },
  { id: 'comfort', target: '[data-testid=viewport]', async run(a) { await a.other('officeComfort'); await a.solve(); a.api.run('fieldComfort'); } },
  { id: 'bioheat', target: '[data-testid=viewport]', async run(a) { await a.other('tumorAblation'); await a.solve(); a.api.run('fieldT'); a.api.setFrame(40); } },
  { id: 'fanCurve', target: '[data-testid=right-panel]', async run(a) { await a.other('fanEnclosure'); a.select('boundary', 'fan'); } },
  { id: 's2s', target: '[data-testid=viewport]', async run(a) { await a.other('vacuumOven'); await a.solve(); a.api.run('fieldT'); } },
  { id: 'parametric', target: '[data-testid=dialog-parametric]', dwell: 9000, async run(a) {
    await a.sample(); await a.dialog('parametric');
    const pick = (sel, value) => { const el = document.querySelector(sel); if (el) { el.value = value; el.dispatchEvent(new Event('change')); } };
    pick('[data-testid=parametric-param]', 'bc:fan:h');
    pick('[data-testid=parametric-metric]', 'body:q1');
    document.querySelector('[data-testid=parametric-run]')?.click();
    await sleep(2500);
  } },
  { id: 'autoMesh', target: '[data-testid=right-panel]', async run(a) { await a.sample(); a.api.run('autoMesh'); a.select('domain', null); a.api.select({ kind: 'domain', ids: [] }); } },
  { id: 'reliability', target: '[data-testid=dialog-reliability]', async run(a) { await a.sample(); await a.solve(); await a.dialog('reliability'); } },
  { id: 'uFactor', target: '[data-testid=dialog-ufactor]', async run(a) { await a.other('windowFrame'); await a.solve(); await a.dialog('uFactor'); } },
  { id: 'heatmap', target: '[data-testid=dialog-heatmap]', async run(a) {
    await a.sample(); await a.dialog('heatmapView');
    q('[data-testid=heatmap-sample]')?.click();
  } },
  { id: 'thermal', target: '[data-testid=dialog-thermal]', async run(a) { await a.sample(); await a.dialog('thermalAnalysis'); document.querySelector('[data-testid=thermal-dsc]')?.click(); await sleep(100); document.querySelector('[data-testid=thermal-sample]')?.click(); } },
  { id: 'kinetics', target: '[data-testid=dialog-thermal]', dwell: 7000, async run(a) { await a.sample(); await a.dialog('thermalAnalysis'); a.api.query('[data-testid=thermal-kinetics]')?.click(); await sleep(150); a.api.query('[data-testid=thermal-kin-sample]')?.click(); } },
  { id: 'electronics', target: '[data-testid=dialog-heatsink]', async run(a) { await a.sample(); await a.dialog('heatSink'); } },
  { id: 'fatigue', target: '[data-testid=dialog-fatigue]', async run(a) { await a.other('battery'); await a.solve(); await a.dialog('solderFatigue'); } },
  { id: 'interop', target: '[data-testid=menu-popup]', async run(a) { await a.sample(); a.api.openMenuById('file'); } },
  { id: 'batch', target: '[data-testid=dialog-batch]', async run(a) { await a.sample(); await a.dialog('batchHelp'); } },
  { id: 'save', target: '[data-testid=tb-save]', run: (a) => a.sample() },
  { id: 'export', target: '[data-testid=menu-popup]', async run(a) { await a.sample(); a.api.openMenuById('file'); } },
  { id: 'formats', target: '[data-testid=dialog-formats]', async run(a) { await a.sample(); await a.dialog('fileFormats'); } },
  { id: 'print', target: '[data-testid=dialog-print]', dwell: 7000, async run(a) { await a.result('fieldT'); await a.dialog('print'); await sleep(500); } },
  { id: 'gallery', target: '[data-testid=dialog-samples]', async run(a) { await a.sample(); await a.dialog('newFromSample'); } },
  { id: 'theme', target: '[data-testid=tb-theme]', dwell: 6000, async run(a) {
    await a.sample();
    for (const id of ['ocean', 'light', 'ember', a.saved?.theme ?? 'dark']) { a.api.patchSettings({ theme: id }); await sleep(900); }
  } },
  { id: 'themeMenu', target: '[data-testid=theme-menu]', async run(a) { await a.sample(); if (!a.api.state.themeMenu) q('[data-testid=tb-theme-menu]')?.click(); await sleep(200); } },
  { id: 'settings', target: '[data-testid=dialog-settings]', async run(a) { await a.sample(); await a.dialog('settings'); q('[data-testid=settings-tabResults]')?.click(); } },
  { id: 'customTheme', target: '[data-testid=dialog-settings]', async run(a) { await a.sample(); await a.dialog('settings'); document.querySelector('[data-testid=settings-tabCustomTheme]')?.click(); } },
  { id: 'docWindow', target: '[data-testid=menu-popup]', async run(a) { await a.sample(); a.api.openMenuById('help'); } },
  { id: 'popouts', target: '[data-testid=menubar]', run: (a) => a.sample() },
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
    const open = async (sampleId) => {
      tour.closeAll();
      api.stopPlaying();
      let doc = api.state.docs.find((d) => d.id === tour.docs.get(sampleId));
      if (!doc) {
        doc = api.openModel(sampleModel(sampleId, getLanguage()), null, { keepPristine: true });
        doc.dirty = false;
        tour.docs.set(sampleId, doc.id);
      }
      if (api.state.activeId !== doc.id) api.activate(doc.id);
      api.showStart(false);
      api.setView('2d');
      api.run('select');
      api.setDisplay({ isotherms: false, vectors: false, deformed: false, streamlines: false, slice: null, iso: null });
      api.setChartTab('probes');
      // Panels as the user had them (the model-tree step folds the tools).
      api.patchSettings({ folds: { ...(tour.saved?.folds ?? {}) }, showToolPanel: true, showPropertyPanel: true, showChartPanel: true, leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false });
      await sleep(120);
      return doc;
    };
    const a = {
      api,
      saved: this.saved,
      active: () => tour.active,
      async start() { tour.closeAll(); api.stopPlaying(); api.showStart(true); await sleep(200); },
      sample: () => open('tutorial'),
      other: (id) => open(id),
      select(kind, id) { api.select(id ? { kind, ids: [id] } : null); },
      ensureBody(body) {
        if (api.doc().model.bodies.some((b) => b.id === body.id)) return;
        api.updateModel((m) => ({ ...m, bodies: [...m.bodies, body] }));
      },
      display: (flags) => api.setDisplay(flags),
      async dialog(command) {
        tour.closeAll();
        await api.run(command);
        await sleep(250);
      },
      /** Solves the active model unless it already has a current result. */
      async solve(always = false) {
        const doc = api.doc();
        if (!always && doc.result && !doc.stale) return;
        await api.run('run');
      },
      async result(command, flags = {}) {
        await open('tutorial');
        await a.solve();
        api.setDisplay({ isotherms: false, vectors: false, deformed: false, ...flags });
        api.run(command);
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
    this.api.stopPlaying();
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
