// Tutorial: a guided tour that runs the real app, chapter by chapter, through
// every feature — start page, the Model Explorer and diagrams, drawing with
// the Toolbox, quick edit and relationships, every kind of diagram, styles and
// layout, model tools (validation, find, code generation, reverse
// engineering, Mermaid import), files and exports, customizing, help.
//
// It works on a sample project of its own (a new tab, closed at the end without
// touching the user's projects), and the theme, language and other settings it
// changes are put back when it ends. While it runs, popups open inside the main
// window (so a screen recording shows them). A card at the bottom right shows
// the step with previous / next, auto play, a chapter list and exit; the part
// of the window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { buildSample } from '../domain/templates.js';
import { ProjectDocument } from '../domain/document.js';
import { allDiagrams, refId, viewsOf } from '../domain/model.js';

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

export const CHAPTERS = ['start', 'model', 'draw', 'diagrams', 'format', 'tools', 'files', 'customize', 'help'];

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
    for (const kind of ['waves', 'nodes', 'aurora']) { a.app.updateSettings({ animation: kind, backgroundKind: 'animated' }); await sleep(1300); }
  } },
  // ── the model
  { id: 'sample', chapter: 'model', target: '#workspace', run: (a) => a.sample() },
  { id: 'explorer', chapter: 'model', target: '#explorer', dwell: 6000, async run(a) { await a.sample(); a.app.run('closeDiagram'); await sleep(200); a.diagram('UMLClassDiagram'); a.explorer()?.reveal(a.element('Order')._id); a.app.selectElements([a.element('Order')._id]); } },
  { id: 'modelView', chapter: 'model', target: '#explorer', dwell: 7000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); const order = a.element('Order'); a.app.selectElements([order._id]); a.app.state.rightTab = 'properties'; a.app.renderAll(); } },
  { id: 'workingDiagrams', chapter: 'model', target: '.diagram-tabs', dwell: 6000, async run(a) { await a.sample(); for (const type of ['UMLUseCaseDiagram', 'UMLSequenceDiagram', 'UMLClassDiagram']) { a.diagram(type); await sleep(700); } } },
  { id: 'addDiagram', chapter: 'model', target: '[data-diagram-add]', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.popup(() => a.app.run('addDiagram', { anchor: a.app.anchorBelow(q('[data-diagram-add]') ?? q('#toolbar')) }), 'menu'); } },
  { id: 'editors', chapter: 'model', target: '#editors', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.selectView('Customer'); for (const tab of ['properties', 'style', 'documentation', 'tags', 'properties']) { a.app.state.rightTab = tab; a.app.renderAll(); await sleep(700); } } },
  // ── drawing
  { id: 'toolbox', chapter: 'draw', target: '#left-panel', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.app.pickTool('UMLClass'); await sleep(900); a.app.setTool(null); } },
  { id: 'createClass', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample(); a.diagram('UMLClassDiagram');
    const tool = a.domain().toolboxFor('UMLClassDiagram')[0][3].find((x) => x.id === 'UMLClass');
    const result = a.app.createNodeAt(tool, { x: 40, y: 700, w: 0, h: 0 });
    await sleep(200); a.app.view?.finishEdit?.(true); a.app.select([result.view._id]);
  } },
  { id: 'quickEdit', chapter: 'draw', target: '#view-host', dwell: 8000, async run(a) {
    await a.sample(); a.diagram('UMLClassDiagram');
    const view = a.selectView('Customer');
    await sleep(300); a.app.view?.startEdit(view._id);
  } },
  { id: 'quickButtons', chapter: 'draw', target: '.quick-bar', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.selectView('OrderLine'); a.app.updateSettings({ showQuickButtons: true }); } },
  { id: 'relationships', chapter: 'draw', target: '#left-panel', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.app.pickTool('composition'); await sleep(1200); a.app.setTool(null); a.selectView('Order', true); } },
  { id: 'addRelated', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); const v = a.selectView('Book'); a.app.quickAction('related', v._id, q('.quick-bar [data-quick="related"]') ?? q('#view-host')); } },
  { id: 'moveResize', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); const v = a.selectView('Payable'); a.app.view?.reveal(v._id); } },
  { id: 'dragFromExplorer', chapter: 'draw', target: '#explorer', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.app.selectElements([a.element('OrderStatus')._id]); a.explorer()?.reveal(a.element('OrderStatus')._id); } },
  { id: 'deleteModel', chapter: 'draw', target: '[data-command="deleteFromModel"]', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.selectView('Food'); } },
  { id: 'undo', chapter: 'draw', target: '[data-command="undo"]', async run(a) { await a.sample(); await a.app.run('undo'); await sleep(500); await a.app.run('redo'); } },
  // ── kinds of diagrams
  { id: 'useCase', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('UMLUseCaseDiagram'); } },
  { id: 'sequence', chapter: 'diagrams', target: '#view-host', dwell: 7000, run: async (a) => { await a.sample(); a.diagram('UMLSequenceDiagram'); } },
  { id: 'fragments', chapter: 'diagrams', target: '#left-panel', run: async (a) => { await a.sample(); a.diagram('UMLSequenceDiagram'); a.app.state.collapsedToolbox.clear(); a.app.renderAll(); } },
  { id: 'stateMachine', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('UMLStatechartDiagram'); } },
  { id: 'activity', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('UMLActivityDiagram'); } },
  { id: 'component', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('UMLComponentDiagram'); } },
  { id: 'deployment', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('UMLDeploymentDiagram'); } },
  { id: 'erd', chapter: 'diagrams', target: '#view-host', run: async (a) => { await a.sample(); a.diagram('ERDDiagram'); } },
  { id: 'others', chapter: 'diagrams', target: '#view-host', dwell: 7000, run: async (a) => { await a.sample(); for (const type of ['FCFlowchartDiagram', 'C4Diagram', 'UMLPackageDiagram']) { a.diagram(type); await sleep(1200); } } },
  // ── format and arrange
  { id: 'style', chapter: 'format', target: '#editors', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.selectView('Order'); a.app.state.rightTab = 'style'; a.app.renderAll(); } },
  { id: 'colors', chapter: 'format', target: '[data-command="fillColor"]', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.selectView('Product'); a.app.actions?.applyColor?.('fillColor', '#dae8fc'); } },
  { id: 'lineStyle', chapter: 'format', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample(); a.diagram('UMLClassDiagram');
    const edges = viewsOf(a.app.diagram()).filter((v) => v.tail).map((v) => v._id);
    a.app.select(edges);
    for (const s of ['oblique', 'roundRect', 'rectilinear']) { await a.app.run(`lineStyle:${s}`); await sleep(800); }
  } },
  { id: 'align', chapter: 'format', target: '[data-command="alignMenu"]', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.app.select(['Book', 'Food'].map((n) => a.viewOf(n)._id)); } },
  { id: 'layout', chapter: 'format', target: '[data-command="layoutMenu"]', dwell: 6000, async run(a) { await a.sample(); a.diagram('UMLUseCaseDiagram'); await a.app.run('layout:LR'); await sleep(1200); await a.app.run('undo'); } },
  { id: 'zoom', chapter: 'format', target: '.toolbar-zoom', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); await a.app.run('zoomOut'); await sleep(500); await a.app.run('fitPage'); } },
  // ── model tools
  { id: 'validate', chapter: 'tools', target: '[data-command="validate"]', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); await a.app.run('validate'); } },
  { id: 'find', chapter: 'tools', target: '.web-popup-find', async run(a) { await a.sample(); a.popup(() => a.app.run('find'), 'find'); } },
  { id: 'codegen', chapter: 'tools', target: '.web-popup-codegen', dwell: 7000, async run(a) { await a.sample(); a.app.selectElements([a.element('domain')._id]); a.popup(() => a.app.run('generateCode'), 'codegen'); } },
  { id: 'reverse', chapter: 'tools', target: '[data-command="reverse"]', async run(a) { await a.sample(); } },
  { id: 'textImport', chapter: 'tools', target: '.web-popup-textimport', async run(a) { await a.sample(); a.popup(() => a.app.run('importText'), 'textimport'); } },
  // ── files
  { id: 'save', chapter: 'files', target: '[data-command="save"]', run: (a) => a.sample() },
  { id: 'fileMenu', chapter: 'files', target: '.web-popup-menu', async run(a) { await a.sample(); a.popup(() => a.app.openMenubarMenu('file'), 'menu'); } },
  { id: 'exportImage', chapter: 'files', target: '.web-popup-image', async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); a.popup(() => a.app.run('exportImage'), 'image'); } },
  { id: 'exportDocs', chapter: 'files', target: '[data-command="exportMenu"]', async run(a) { await a.sample(); a.popup(() => a.app.run('exportMenu', { anchor: a.app.anchorBelow(q('[data-command="exportMenu"]')) }), 'menu'); } },
  { id: 'starUml', chapter: 'files', target: '#menubar [data-menu="file"]', run: (a) => a.sample() },
  { id: 'print', chapter: 'files', target: '.web-popup-print', async run(a) { await a.sample(); a.popup(() => a.app.run('print'), 'print'); } },
  // ── customizing
  { id: 'theme', chapter: 'customize', target: '[data-command="theme"]', dwell: 6000, async run(a) { await a.sample(); for (let i = 0; i < 3; i += 1) { await a.app.run('theme'); await sleep(900); } } },
  { id: 'diagramTheme', chapter: 'customize', target: '#view-host', dwell: 7000, async run(a) { await a.sample(); a.diagram('UMLClassDiagram'); for (const id of ['pastel', 'blueprint', 'dark', 'classic']) { a.app.updateSettings({ diagramTheme: id }); await sleep(1100); } } },
  { id: 'language', chapter: 'customize', target: '[data-command="language"]', run: (a) => a.sample() },
  { id: 'panels', chapter: 'customize', target: '#workspace', dwell: 6000, async run(a) { await a.sample(); await a.app.run('leftPanel'); await sleep(800); await a.app.run('leftPanel'); await a.app.run('rightPanel'); await sleep(800); await a.app.run('rightPanel'); } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', async run(a) { await a.sample(); a.popup(() => a.app.popups.open('settings', { tab: 'diagram' }), 'settings'); } },
  // ── help
  { id: 'presentation', chapter: 'help', target: '#presentation', dwell: 6000, async run(a) { await a.sample(); await a.app.run('presentation'); } },
  { id: 'shortcuts', chapter: 'help', target: '.web-popup-settings', async run(a) { a.stopPresentation(); await a.sample(); a.popup(() => a.app.popups.open('settings', { tab: 'shortcuts' }), 'settings'); } },
  { id: 'about', chapter: 'help', target: '.web-popup-about', async run(a) { await a.sample(); a.popup(() => a.app.run('about'), 'about'); } },
  { id: 'tutorialDoc', chapter: 'help', target: '#reader-page', dwell: 7000, async run(a) { await a.closeMenus(); a.app.openReader('tutorial'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', run: (a) => a.sample() },
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
    const tab = () => app.state.docs.find((item) => item.id === tutorial.docId);
    const helpers = {
      app,
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      async sample() {
        await tutorial.closeAll();
        tutorial.stopPresentation();
        let doc = tab();
        if (!doc) {
          const project = buildSample(getLanguage());
          doc = new ProjectDocument(project, { name: project.name });
          doc.markSaved(null);
          tutorial.docId = doc.id;
          app.state.docs.push(doc);
        }
        if (app.state.active !== doc.id || app.state.showStart || app.state.reader) {
          app.state.active = doc.id;
          app.state.showStart = false;
          app.state.reader = null;
          app.renderAll();
          if (!app.view) app.openDiagram(doc.view.diagramId ?? allDiagrams(doc.project)[0]._id);
        }
        await sleep(150);
        return doc;
      },
      /** Opens the sample's first diagram of a type. */
      diagram(type) {
        const d = allDiagrams(tab().project).find((x) => x._type === type);
        if (d) app.openDiagram(d._id);
        return d;
      },
      element: (name) => tab().index.byId && [...tab().index.byId.values()].find((e) => e.name === name && !/View$/.test(e._type)),
      viewOf: (name) => { const e = helpers.element(name); return viewsOf(app.diagram()).find((v) => refId(v.model) === e?._id); },
      selectView(name, add = false) { const v = helpers.viewOf(name); if (v) app.select(add ? [...app.selection().ids, v._id] : [v._id]); return v; },
      explorer: () => app.explorer,
      domain: () => window.__myumlmaker?.domain ?? {},
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
      stopPresentation: () => tutorial.stopPresentation(),
      ko,
    };
    app.actions = window.__myumlmaker?.actions;
    return helpers;
  }

  stopPresentation() {
    if (this.app.state.presenting) {
      this.app.state.presenting = null;
      const host = document.querySelector('#presentation');
      if (host) { host.hidden = true; host.innerHTML = ''; }
    }
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
    this.stopPresentation();
    this.app.closeReader?.();
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    const back = this.app.state.docs.find((item) => item.id === this.savedActive);
    if (back) { this.app.state.active = back.id; this.app.state.showStart = this.savedStart; this.app.renderAll(); if (back.view.diagramId) this.app.openDiagram(back.view.diagramId); }
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

