// Tutorial: a guided tour that runs the real app, chapter by chapter — the start page, building
// a page from blocks, editing text and pictures, pages, designs, the phone and tablet views,
// previewing and publishing, settings and help.
//
// It works on a sample site of its own (closed at the end without touching the user's site), and
// the theme, language and other settings it changes are put back when it ends. While it runs,
// popups open inside the main window (so a screen recording shows them). A card at the bottom
// right shows the step with previous / next, auto play, a chapter list and exit; the part of the
// window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { buildSample } from '../domain/samples.js';
import { SiteDocument } from '../domain/document.js';

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

export const CHAPTERS = ['start', 'build', 'edit', 'pages', 'design', 'publish', 'customize', 'help'];

/** Steps. `target`: what the step outlines (selector); `run(a)` puts the app in the state the step shows; `dwell`: how long auto play stays (ms). */
export const STEPS = [
  // ── start page
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'home', chapter: 'start', target: '#menubar [data-home]', dwell: 5000, run: (a) => a.start() },
  { id: 'templates', chapter: 'start', target: '.start-card.templates', run: (a) => a.start() },
  { id: 'samples', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  { id: 'newSite', chapter: 'start', target: '.web-popup-template', dwell: 7000, async run(a) { await a.start(); await a.popup(() => a.app.run('new'), 'template'); } },
  { id: 'background', chapter: 'start', target: '.start-card.background', dwell: 7000, async run(a) {
    await a.start();
    for (const kind of ['waves', 'nodes', 'aurora']) { a.app.updateSettings({ animation: kind, backgroundKind: 'animated' }); await sleep(1300); }
  } },
  // ── building a page
  { id: 'workspace', chapter: 'build', target: '#workspace', run: (a) => a.sample() },
  { id: 'blocks', chapter: 'build', target: '#left-panel', dwell: 6000, run: (a) => a.sample() },
  { id: 'addBlock', chapter: 'build', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.selectType('features'); await sleep(400); a.app.insertBlock('quote'); } },
  { id: 'dragBlock', chapter: 'build', target: '#left-panel .block-item[data-block-type="gallery"]', dwell: 6000, async run(a) { await a.sample(); q('#left-panel .block-item[data-block-type="gallery"]')?.scrollIntoView({ block: 'center' }); } },
  { id: 'select', chapter: 'build', target: '.sel-bar', dwell: 6000, async run(a) { await a.sample(); a.selectType('features'); } },
  { id: 'moveBlock', chapter: 'build', target: '.sel-bar', dwell: 6000, async run(a) { await a.sample(); const id = a.selectType('cta'); await sleep(500); a.actions().moveBlock(-1, id); await sleep(800); a.actions().moveBlock(1, id); } },
  { id: 'insertMenu', chapter: 'build', target: '#menubar [data-menu="insert"]', run: (a) => a.sample() },
  { id: 'tree', chapter: 'build', target: '#site-tree', dwell: 6000, async run(a) { await a.sample(); a.selectType('mediaText'); } },
  // ── editing content
  { id: 'inlineText', chapter: 'edit', target: '#view-host', dwell: 7000, async run(a) {
    await a.sample(); const id = a.selectType('hero'); await sleep(300);
    const el = a.app.view?.blockElement(id)?.querySelector('[data-edit="title"]'); if (el) a.app.view.startEdit(el);
  } },
  { id: 'contentTab', chapter: 'edit', target: '#editors', dwell: 6000, async run(a) { a.app.view?.finishEdit?.(false); await a.sample(); a.selectType('features'); a.app.state.rightTab = 'content'; a.app.renderRight(); } },
  { id: 'items', chapter: 'edit', target: '#editors .items-field', dwell: 6000, async run(a) { await a.sample(); a.selectType('features'); a.app.state.rightTab = 'content'; a.app.renderRight(); await sleep(200); q('#editors .items-field')?.scrollIntoView({ block: 'start' }); } },
  { id: 'pictures', chapter: 'edit', target: '#editors .image-field', dwell: 6000, async run(a) { await a.sample(); a.selectType('mediaText'); a.app.state.rightTab = 'content'; a.app.renderRight(); await sleep(200); q('#editors .image-field')?.scrollIntoView({ block: 'center' }); } },
  { id: 'styleTab', chapter: 'edit', target: '#editors', dwell: 7000, async run(a) {
    await a.sample(); const id = a.selectType('features'); a.app.state.rightTab = 'style'; a.app.renderRight();
    for (const bg of ['surface', 'primary', 'dark', '']) { a.actions().setStyle(id, { bg }); await sleep(800); }
  } },
  { id: 'headerFooter', chapter: 'edit', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.app.select(a.doc().site.layout.header.id); } },
  { id: 'undo', chapter: 'edit', target: '[data-command="undo"]', async run(a) { await a.sample(); await a.app.run('undo'); await sleep(500); await a.app.run('redo'); } },
  // ── pages
  { id: 'pageTabs', chapter: 'pages', target: '#tabs', dwell: 6000, async run(a) { await a.sample(); for (const page of a.doc().site.pages) { a.app.openPage(page.id); await sleep(700); } a.app.openPage(a.doc().site.pages[0].id); } },
  { id: 'addPage', chapter: 'pages', target: '.web-popup-prompt', dwell: 6000, async run(a) { await a.sample(); await a.popup(() => a.app.run('addPage'), 'prompt'); } },
  { id: 'pageTab', chapter: 'pages', target: '#editors', dwell: 6000, async run(a) { await a.closeMenus(); await a.sample(); a.app.state.rightTab = 'page'; a.app.select(null); a.app.state.rightTab = 'page'; a.app.renderRight(); } },
  { id: 'navLinks', chapter: 'pages', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); a.app.select(a.doc().site.layout.header.id); } },
  // ── design
  { id: 'designs', chapter: 'design', target: '.web-popup-design', dwell: 7000, async run(a) { await a.sample(); await a.popup(() => a.app.run('designPicker'), 'design'); } },
  { id: 'designChange', chapter: 'design', target: '#view-host', dwell: 8000, async run(a) {
    await a.closeMenus(); await a.sample();
    for (const id of ['midnight', 'forest', 'rose', a.originalDesign()]) { a.actions().setDesign({ id }, { reset: true }); await sleep(1100); }
  } },
  { id: 'siteTab', chapter: 'design', target: '#editors', dwell: 6000, async run(a) { await a.sample(); a.app.select(null); a.app.state.rightTab = 'site'; a.app.renderRight(); } },
  { id: 'devices', chapter: 'design', target: '[data-command="device:mobile"]', dwell: 8000, async run(a) {
    await a.sample();
    for (const device of ['tablet', 'mobile', 'desktop']) { a.app.setDevice(device); await sleep(1300); }
  } },
  { id: 'preview', chapter: 'design', target: '[data-command="previewMode"]', dwell: 6000, async run(a) { await a.sample(); a.actions().togglePreview(); await sleep(2200); a.actions().togglePreview(); } },
  // ── publishing
  { id: 'save', chapter: 'publish', target: '[data-command="save"]', run: (a) => a.sample() },
  { id: 'check', chapter: 'publish', target: '.web-popup-confirm', async run(a) { await a.sample(); await a.popup(() => a.app.run('checkSite'), 'confirm'); } },
  { id: 'publish', chapter: 'publish', target: '.web-popup-publish', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample(); await a.popup(() => a.app.run('publish'), 'publish'); } },
  { id: 'browser', chapter: 'publish', target: '[data-command="previewBrowser"]', async run(a) { await a.closeMenus(); await a.sample(); } },
  { id: 'hosting', chapter: 'publish', target: '#workspace', dwell: 7000, run: (a) => a.sample() },
  // ── customizing
  { id: 'theme', chapter: 'customize', target: '[data-command="theme"]', dwell: 6000, async run(a) { await a.sample(); for (let i = 0; i < 3; i += 1) { await a.app.run('theme'); await sleep(900); } } },
  { id: 'language', chapter: 'customize', target: '[data-command="language"]', run: (a) => a.sample() },
  { id: 'panels', chapter: 'customize', target: '#workspace', dwell: 6000, async run(a) { await a.sample(); await a.app.run('leftPanel'); await sleep(800); await a.app.run('leftPanel'); await a.app.run('rightPanel'); await sleep(800); await a.app.run('rightPanel'); } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', async run(a) { await a.sample(); await a.popup(() => a.app.popups.open('settings', { tab: 'editor' }), 'settings'); } },
  // ── help
  { id: 'shortcuts', chapter: 'help', target: '.web-popup-settings', async run(a) { await a.sample(); await a.popup(() => a.app.popups.open('settings', { tab: 'shortcuts' }), 'settings'); } },
  { id: 'guide', chapter: 'help', target: '.web-popup-doc', dwell: 7000, async run(a) { await a.closeMenus(); await a.sample(); a.app.openDocWindow('guide'); await until(() => q('.web-popup-doc')); } },
  { id: 'about', chapter: 'help', target: '.web-popup-about', async run(a) { a.app.closeDocFrames?.(); await a.sample(); await a.popup(() => a.app.run('about'), 'about'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', async run(a) { await a.closeMenus(); await a.sample(); } },
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
    const doc = () => app.state.docs.find((item) => item.id === tutorial.docId);
    const helpers = {
      app,
      doc,
      actions: () => window.__myhomemaker?.actions ?? {},
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      async sample() {
        await tutorial.closeAll();
        let current = doc();
        if (!current) {
          const site = buildSample('bakery', getLanguage());
          current = new SiteDocument(site, { name: site.name });
          current.markSaved(null);
          current.view.device = 'desktop';
          tutorial.docId = current.id;
          tutorial.design = site.design.id;
          app.state.docs.splice(0, app.state.docs.length, current);
        }
        if (app.state.active !== current.id || app.state.showStart) {
          app.state.active = current.id;
          app.state.showStart = false;
          app.state.selected = null;
          app.showStartPage(false);
          app.setZoom(app.view?.fitZoom() ?? 70);
        }
        if (app.state.preview) window.__myhomemaker?.actions.togglePreview();
        await sleep(150);
        return current;
      },
      /** Selects the first block of a kind on the current page (opening the page that has it). */
      selectType(type) {
        const site = doc()?.site;
        const page = site?.pages.find((p) => p.blocks.some((b) => b.type === type));
        if (!page) return null;
        if (app.page()?.id !== page.id) app.openPage(page.id);
        const block = page.blocks.find((b) => b.type === type);
        app.select(block.id);
        return block.id;
      },
      originalDesign: () => tutorial.design ?? 'peach',
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
    };
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
    this.saved = { ...this.app.settings() };
    this.savedDocs = [...this.app.state.docs];
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
    this.app.view?.finishEdit?.(false);
    await this.closeAll();
    this.app.popups.inline = false;
    this.layer.classList.remove('active');
    this.layer.innerHTML = '';
    this.docId = null;
    this.app.closeDocFrames?.();
    if (this.app.state.preview) window.__myhomemaker?.actions.togglePreview();
    this.app.updateSettings({ ...this.saved, tutorialDone: true, tutorialOffered: true });
    // The user's own site comes back as it was (the tutorial's sample is dropped, never saved).
    this.app.state.docs.splice(0, this.app.state.docs.length, ...this.savedDocs);
    const back = this.app.state.docs.find((item) => item.id === this.savedActive);
    this.app.state.active = back?.id ?? null;
    this.app.state.selected = null;
    this.app.showStartPage(!back || this.savedStart);
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
    if (target && !target.hidden) {
      const r = target.getBoundingClientRect();
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
