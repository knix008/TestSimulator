// Tutorial: a guided tour that runs the real app, chapter by chapter, through
// every feature — start page and backgrounds, drawing shapes, connecting
// them, formatting, arranging, pages and layers, shape data, views, files and
// printing, customizing, help.
//
// It works on a sample drawing of its own (a new tab, closed at the end without
// touching the user's drawings), and the theme, language and other settings it
// changes are put back when it ends. While it runs, popups open inside the main
// window (so a screen recording shows them). A card at the bottom right shows
// the step with previous / next, auto play, a chapter list and exit; the part
// of the window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { buildSample } from '../domain/templates.js';
import { DiagramDocument } from '../domain/document.js';
import * as D from '../domain/diagram.js';

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

export const CHAPTERS = ['start', 'draw', 'connect', 'format', 'arrange', 'pages', 'data', 'files', 'customize', 'help'];

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
    for (const kind of ['waves', 'flowchart', 'nodes', 'aurora']) { a.app.updateSettings({ animation: kind, backgroundKind: 'animated' }); await sleep(1300); }
  } },
  // ── drawing shapes
  { id: 'sample', chapter: 'draw', target: '#view-host', run: (a) => a.sample() },
  { id: 'layout', chapter: 'draw', target: '#workspace', run: (a) => a.sample() },
  { id: 'shapesPanel', chapter: 'draw', target: '#left-panel', dwell: 6000, async run(a) { await a.sample(); a.app.state.stencilQuery = ''; a.app.renderAll(); } },
  { id: 'dropShape', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample();
    const shape = a.app.dropMaster('star5', { x: 880, y: 560 });
    a.app.select([shape.id]);
  } },
  { id: 'search', chapter: 'draw', target: '.shapes-tools', async run(a) { await a.sample(); a.app.state.stencilQuery = getLanguage() === 'en' ? 'server' : '서버'; a.app.renderAll(); } },
  { id: 'tools', chapter: 'draw', target: '.tool-strip', dwell: 6000, async run(a) {
    await a.sample();
    a.app.state.stencilQuery = '';
    a.app.setTool('rect');
    await sleep(900);
    a.app.setTool('connector');
    await sleep(900);
    a.app.setTool('pointer');
  } },
  { id: 'text', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample();
    const shape = a.byText(getLanguage() === 'en' ? 'Confirm order' : '주문 확정');
    a.app.select([shape.id]);
    a.app.setShapeText(shape.id, getLanguage() === 'en' ? 'Confirm order\n(automatic)' : '주문 확정\n(자동)');
  } },
  { id: 'moveResize', chapter: 'draw', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample();
    const shape = a.byText(getLanguage() === 'en' ? 'Payment details' : '결제 정보');
    a.app.select([shape.id]);
    a.app.moveSelection([shape.id], 20, 0);
  } },
  { id: 'undo', chapter: 'draw', target: '[data-command="undo"]', async run(a) {
    await a.sample();
    await a.app.run('undo');
    await sleep(600);
    await a.app.run('redo');
    await sleep(600);
    await a.app.run('undo');
  } },
  // ── connecting
  { id: 'connector', chapter: 'connect', target: '#toolbar [data-command="tool:connector"]', dwell: 6000, async run(a) {
    await a.sample();
    const from = a.byText(getLanguage() === 'en' ? 'Place order' : '주문하기');
    const to = a.byText(getLanguage() === 'en' ? 'Delivered' : '수령');
    a.app.connectShapes({ id: from.id, pt: 'auto' }, { id: to.id, pt: 'auto' }, { route: 'curved', style: { dash: 'dot' } });
  } },
  { id: 'autoConnect', chapter: 'connect', target: '#view-host', dwell: 6000, async run(a) {
    await a.sample();
    const shape = a.byText(getLanguage() === 'en' ? 'Ship parcel' : '택배 발송');
    a.app.select([shape.id]);
    a.app.view.auto = shape.id;
    a.app.view.renderOverlay?.();
  } },
  { id: 'routes', chapter: 'connect', target: '#right-panel', dwell: 6000, async run(a) {
    await a.sample();
    const connector = a.app.page().shapes.find((s) => s.type === 'connector');
    a.app.select([connector.id]);
    await sleep(500);
    a.app.run('routeCurved');
    await sleep(900);
    a.app.run('routeOrtho');
  } },
  { id: 'glue', chapter: 'connect', target: '#view-host', async run(a) {
    await a.sample();
    a.app.updateSettings({ showConnectionPoints: true });
    a.app.setTool('connector');
    const shape = a.byText(getLanguage() === 'en' ? 'Confirm order' : '주문 확정');
    a.app.view.hover = { id: shape.id };
    a.app.view.renderOverlay?.();
  } },
  // ── formatting
  { id: 'properties', chapter: 'format', target: '#right-panel', dwell: 6000, async run(a) {
    await a.sample();
    a.app.setTool('pointer');
    a.app.select([a.byText(getLanguage() === 'en' ? 'Confirm order' : '주문 확정').id]);
  } },
  { id: 'quickStyle', chapter: 'format', target: '#right-panel', async run(a) {
    await a.sample();
    const shape = a.byText(getLanguage() === 'en' ? 'Pick & pack' : '상품 포장');
    a.app.select([shape.id]);
    a.app.change('op.quickStyle', (doc, page) => D.setQuickStyle(page, [shape.id], { color: 2, variant: 'gradient' }));
  } },
  { id: 'formatDialog', chapter: 'format', target: '.web-popup-shape', dwell: 7000, async run(a) {
    await a.sample();
    a.app.select([a.byText(getLanguage() === 'en' ? 'Pick & pack' : '상품 포장').id]);
    a.popup(() => a.app.run('formatShape', { tab: 'fill' }), 'shape');
  } },
  { id: 'design', chapter: 'format', target: '.web-popup-design', dwell: 7000, async run(a) { await a.sample(); a.app.select([]); a.popup(() => a.app.run('design'), 'design'); } },
  { id: 'formatPainter', chapter: 'format', target: '[data-command="formatPainter"]', async run(a) {
    await a.sample();
    a.app.select([a.byText(getLanguage() === 'en' ? 'Confirm order' : '주문 확정').id]);
  } },
  // ── arranging
  { id: 'align', chapter: 'arrange', target: '#toolbar [data-command="alignMenu"]', dwell: 6000, async run(a) {
    await a.sample();
    const ids = [getLanguage() === 'en' ? 'Confirm order' : '주문 확정', getLanguage() === 'en' ? 'Pick & pack' : '상품 포장'].map((text) => a.byText(text).id);
    a.app.select(ids);
    a.app.run('alignCenter');
  } },
  { id: 'group', chapter: 'arrange', target: '#view-host', async run(a) {
    await a.sample();
    const ids = [getLanguage() === 'en' ? 'Pick & pack' : '상품 포장', getLanguage() === 'en' ? 'Ship parcel' : '택배 발송'].map((text) => a.byText(text).id);
    a.app.select(ids);
    await a.app.run('group');
  } },
  { id: 'relayout', chapter: 'arrange', target: '.web-popup-layout', dwell: 6000, async run(a) { await a.sample(); a.app.select([]); a.popup(() => a.app.run('layout'), 'layout'); } },
  { id: 'rotate', chapter: 'arrange', target: '#view-host', async run(a) {
    await a.sample();
    const shape = a.app.page().shapes.find((s) => s.master === 'note');
    if (shape) { a.app.select([shape.id]); a.app.run('rotateLeft'); }
  } },
  // ── pages and layers
  { id: 'pageTabs', chapter: 'pages', target: '.page-tabs', dwell: 6000, async run(a) {
    await a.sample();
    const doc = a.app.doc().doc;
    a.app.goToPage(doc.pages[1].id);
    await sleep(900);
    a.app.goToPage(doc.pages[0].id);
  } },
  { id: 'backgroundPage', chapter: 'pages', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.app.select([]); } },
  { id: 'layers', chapter: 'pages', target: '.web-popup-layers', dwell: 6000, async run(a) { await a.sample(); a.popup(() => a.app.run('layers'), 'layers'); } },
  { id: 'pageSetup', chapter: 'pages', target: '.web-popup-page', dwell: 6000, async run(a) { await a.sample(); a.popup(() => a.app.run('pageSetup'), 'page'); } },
  { id: 'pagesView', chapter: 'pages', target: '#view-host', run: async (a) => { await a.closeMenus(); await a.sample('pages'); } },
  // ── shape data
  { id: 'shapeData', chapter: 'data', target: '.web-popup-data', dwell: 7000, async run(a) {
    await a.sample('drawing');
    a.app.select([a.byText(getLanguage() === 'en' ? 'Confirm order' : '주문 확정').id]);
    a.popup(() => a.app.run('shapeData'), 'data');
  } },
  { id: 'dataGraphics', chapter: 'data', target: '#view-host', async run(a) {
    await a.sample('drawing');
    if (!a.app.doc().doc.options.dataGraphics) a.app.run('dataGraphics');
  } },
  { id: 'dataView', chapter: 'data', target: '#view-host', run: async (a) => { await a.sample('shapeData'); } },
  { id: 'orgChart', chapter: 'data', target: '.web-popup-import', dwell: 7000, async run(a) { await a.sample('drawing'); a.popup(() => a.app.run('orgFromData'), 'import'); } },
  { id: 'reports', chapter: 'data', target: '#view-host', run: async (a) => { await a.closeMenus(); await a.sample(); a.app.doc().view.report = 'inventory'; a.app.switchView('reports'); } },
  { id: 'shapeSheet', chapter: 'data', target: '#view-host', run: async (a) => { await a.sample('shapeSheet'); } },
  // ── files and printing
  { id: 'fileMenu', chapter: 'files', target: '[data-menu="file"]', dwell: 5000, async run(a) { await a.sample('drawing'); a.app.openMenubarMenu('file'); } },
  { id: 'visio', chapter: 'files', target: '[data-menu="file"]', dwell: 6000, async run(a) { await a.closeMenus(); await a.sample('drawing'); a.app.openMenubarMenu('file'); } },
  { id: 'print', chapter: 'files', target: '.web-popup-print', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('drawing'); a.popup(() => a.app.run('print'), 'print'); } },
  { id: 'imageExport', chapter: 'files', target: '.web-popup-image', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('drawing'); a.popup(() => a.app.run('exportImage'), 'image'); } },
  { id: 'database', chapter: 'files', target: '.web-popup-settings', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample('drawing'); a.popup(() => a.app.popups.open('settings', { tab: 'database' }), 'settings'); } },
  { id: 'recentFiles', chapter: 'files', target: '.web-popup-recent', async run(a) { await a.sample('drawing'); a.popup(() => a.app.run('recent'), 'recent'); } },
  { id: 'dragDrop', chapter: 'files', target: '#center', dwell: 5000, async run(a) {
    await a.sample('drawing');
    const overlay = q('.drop-overlay');
    overlay?.classList.add('visible');
    const label = overlay?.querySelector('span');
    if (label) label.textContent = t('drop.hint');
    await sleep(2600);
    overlay?.classList.remove('visible');
  } },
  // ── customizing
  { id: 'theme', chapter: 'customize', target: '.split-button:not(.view-split):not(.color-split)', dwell: 6000, async run(a) {
    await a.sample('drawing');
    for (const theme of ['tokyo', 'mint', 'light']) { a.app.updateSettings({ theme }); await sleep(1100); }
  } },
  { id: 'language', chapter: 'customize', target: '[data-command="language"]', dwell: 5000, async run(a) { await a.sample('drawing'); } },
  { id: 'panels', chapter: 'customize', target: '#workspace', dwell: 5000, async run(a) {
    await a.sample('drawing');
    a.app.updateSettings({ showLeftPanel: false });
    await sleep(1200);
    a.app.updateSettings({ showLeftPanel: true });
  } },
  { id: 'minimap', chapter: 'customize', target: '#view-host', async run(a) { await a.sample('drawing'); a.app.updateSettings({ showMinimap: true }); } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', dwell: 7000, async run(a) { await a.sample('drawing'); a.app.updateSettings({ showMinimap: false }); a.popup(() => a.app.popups.open('settings', { tab: 'drawing' }), 'settings'); } },
  { id: 'statusBar', chapter: 'customize', target: '#statusbar', run: (a) => a.sample('drawing') },
  // ── help
  { id: 'presentation', chapter: 'help', target: '#presentation', dwell: 6000, async run(a) { await a.sample('drawing'); await a.app.run('presentation'); } },
  { id: 'shortcuts', chapter: 'help', target: '.web-popup-settings', async run(a) { await a.app.run('presentation'); a.stopPresentation(); await a.sample('drawing'); a.popup(() => a.app.popups.open('settings', { tab: 'shortcuts' }), 'settings'); } },
  { id: 'about', chapter: 'help', target: '.web-popup-about', async run(a) { await a.sample('drawing'); a.popup(() => a.app.run('about'), 'about'); } },
  { id: 'tutorialDoc', chapter: 'help', target: '#reader-page', dwell: 7000, async run(a) { await a.closeMenus(); a.app.openReader('tutorial'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', run: (a) => a.sample('drawing') },
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
        tutorial.stopPresentation();
        let doc = app.state.docs.find((item) => item.id === tutorial.docId);
        if (!doc) {
          const drawing = buildSample(getLanguage());
          doc = new DiagramDocument(drawing, { name: drawing.title });
          doc.markSaved(null);
          doc.stencils = [...drawing.stencils];
          tutorial.docId = doc.id;
          doc.view.id = 'drawing';
          app.state.docs.push(doc);
        }
        if (app.state.active !== doc.id || app.state.showStart || app.state.reader) {
          app.state.active = doc.id;
          app.state.showStart = false;
          app.switchView(view ?? doc.view.id ?? 'drawing');
        } else if (view && doc.view.id !== view) app.switchView(view);
        await sleep(150);
        return doc;
      },
      byText: (text) => app.page().shapes.find((s) => String(s.text ?? '').split('\n')[0] === text) ?? app.page().shapes.find((s) => s.type === 'shape'),
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
      stopPresentation: () => tutorial.stopPresentation(),
    };
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
      // 4 px around the target, but never past the window's edges (the menu bar is the window's top).
      const left = Math.max(0, r.left - 4);
      const top = Math.max(0, r.top - 4);
      const right = Math.min(window.innerWidth, r.right + 4);
      const bottom = Math.min(window.innerHeight, r.bottom + 4);
      if (right > left && bottom > top) outline = `<div class="tour-outline" style="left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px"></div>`;
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

