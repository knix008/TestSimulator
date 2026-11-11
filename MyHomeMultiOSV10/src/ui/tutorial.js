// Tutorial: a guided tour that builds a real website in the real app — "FlowNote", the homepage of
// an AI note app, four pages (Home, Pricing, About, Contact) made the way sites are made today: a bold
// first screen, a bento grid, social proof, a clear next step, dark mode, a phone check, search engine
// text and a spelling check — from an empty site to the published files (ui/tutorial-project.js).
//
// Every step starts from the site as it is after the steps before it, so the tour can jump anywhere
// and always shows the same thing; then the step plays its own part (a block appears, text is typed,
// a page is added …). The tutorial's site is its own (dropped at the end, the user's sites come back
// untouched), and the theme, language, dictionary and other settings it changes are put back. While
// it runs, popups open inside the main window (so a screen recording shows them). A card at the bottom
// right shows the step with previous / next, auto play, a chapter list and exit; the part of the
// window the step is about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';
import { SiteDocument } from '../domain/document.js';
import { OPS, TUTORIAL_WORDS, stageSite } from './tutorial-project.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => document.querySelector(selector);
/** Scrolls an element into sight inside its own scrolling box only (never the window itself). */
function scrollInside(el) {
  if (!el) return;
  let box = el.parentElement;
  while (box && box !== document.body) {
    const overflow = getComputedStyle(box).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
}
async function until(test, timeout = 6000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    try { if (await test()) return true; } catch { /* not yet */ }
    await sleep(60);
  }
  return false;
}

export const CHAPTERS = ['start', 'home', 'pages', 'design', 'mobile', 'quality', 'publish', 'finish'];

/** A step that adds a block: the site as before the step, then the step's change, the new block selected. */
const addStep = (type) => async (a) => {
  await a.stage();
  await sleep(500);
  a.play();
  a.selectType(type, { last: true });
};

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in the state the step shows
 * (a.stage() = the site after the steps before it, a.play() = this step's own change); `dwell`: how long
 * auto play stays (ms); `page`: the page (slug) the step shows.
 */
export const STEPS = [
  // ── 1. start: what we will make, a new site, the window
  { id: 'welcome', chapter: 'start', target: '.start-hero', dwell: 6000, run: (a) => a.start() },
  { id: 'plan', chapter: 'start', target: '#view-host', dwell: 9000, async run(a) {
    await a.stage({ complete: true });
    a.actions().togglePreview();
    for (const page of a.doc().site.pages) { a.app.openPage(page.id); await sleep(1400); }
    a.app.openPage(a.doc().site.pages[0].id);
  } },
  { id: 'newSite', chapter: 'start', target: '.web-popup-template', dwell: 7000, async run(a) { await a.start(); await a.popup(() => a.app.run('new'), 'template'); } },
  { id: 'workspace', chapter: 'start', target: '#workspace', dwell: 7000, run: (a) => a.stage() },
  // ── 2. the home page, block by block
  { id: 'hero', chapter: 'home', target: '#left-panel .block-item[data-block-type="hero"]', dwell: 6000, async run(a) {
    await a.stage();
    scrollInside(q('#left-panel .block-item[data-block-type="hero"]'));
    await sleep(900);
    a.play();
    a.selectType('hero');
  } },
  { id: 'heroText', chapter: 'home', target: '#view-host', dwell: 8000, async run(a) {
    await a.stage();
    const id = a.selectType('hero');
    await sleep(400);
    const el = a.app.view?.blockElement(id)?.querySelector('[data-edit="title"]');
    if (el) {
      a.app.view.startEdit(el);
      await a.typeInto(el, a.finalProps('hero').title ?? '');
      a.app.view.finishEdit(false);
    }
    a.play();
    a.selectType('hero');
  } },
  { id: 'heroButtons', chapter: 'home', target: '#editors', dwell: 7000, async run(a) {
    await a.stage();
    a.selectType('hero');
    a.showTab('content');
    await sleep(500);
    a.play();
    a.selectType('hero');
    a.showTab('content');
    await sleep(200);
    scrollInside(q('#editors [data-prop="url1"]'));
  } },
  { id: 'logos', chapter: 'home', target: '#view-host', dwell: 5500, run: addStep('logos') },
  { id: 'bento', chapter: 'home', target: '#view-host', dwell: 7500, run: addStep('features') },
  { id: 'stats', chapter: 'home', target: '#view-host', dwell: 5500, run: addStep('stats') },
  { id: 'testimonials', chapter: 'home', target: '#view-host', dwell: 5500, run: addStep('testimonials') },
  { id: 'cta', chapter: 'home', target: '#view-host', dwell: 6000, run: addStep('cta') },
  { id: 'reorder', chapter: 'home', target: '.sel-bar', dwell: 6500, async run(a) {
    await a.stage();
    const id = a.selectType('stats');
    await sleep(700);
    a.actions().moveBlock(-1, id);
    await sleep(1100);
    a.actions().moveBlock(1, id);
  } },
  { id: 'header', chapter: 'home', target: '#view-host', dwell: 6500, async run(a) {
    await a.stage();
    a.app.select(a.doc().site.layout.header.id);
    await sleep(600);
    a.play();
    a.app.select(a.doc().site.layout.header.id);
    a.showTab('content');
  } },
  { id: 'footer', chapter: 'home', target: '#editors', dwell: 6000, async run(a) {
    await a.stage();
    a.app.select(a.doc().site.layout.footer.id);
    a.showTab('content');
    await sleep(600);
    a.play();
    a.app.select(a.doc().site.layout.footer.id);
    a.showTab('content');
  } },
  // ── 3. more pages
  { id: 'addPage', chapter: 'pages', target: '.web-popup-prompt', dwell: 6500, async run(a) { await a.stage(); await a.popup(() => a.app.run('addPage'), 'prompt'); } },
  { id: 'pricing', chapter: 'pages', target: '#view-host', page: 'pricing', dwell: 7000, async run(a) { await a.stage(); await sleep(500); a.play(); a.selectType('pricing'); } },
  { id: 'about', chapter: 'pages', target: '#tabs', page: 'pricing', dwell: 7000, async run(a) { await a.stage(); await sleep(400); a.play(); a.openSlug('about'); a.selectType('team'); } },
  { id: 'contact', chapter: 'pages', target: '#view-host', page: 'about', dwell: 7000, async run(a) { await a.stage(); await sleep(400); a.play(); a.openSlug('contact'); a.selectType('contact'); } },
  { id: 'nav', chapter: 'pages', target: '#site-tree', dwell: 7000, async run(a) {
    await a.stage();
    a.app.select(a.doc().site.layout.header.id);
    for (const page of a.doc().site.pages) { a.app.openPage(page.id); await sleep(800); }
    a.app.openPage(a.doc().site.pages[0].id);
  } },
  // ── 4. design
  { id: 'designs', chapter: 'design', target: '.web-popup-design', dwell: 7000, async run(a) { await a.stage(); await a.popup(() => a.app.run('designPicker'), 'design'); } },
  { id: 'darkMode', chapter: 'design', target: '#view-host', dwell: 7500, async run(a) {
    await a.stage();
    for (const id of ['midnight', 'galaxy']) { a.actions().setDesign({ id }, { reset: true }); await sleep(1000); }
    a.play();
  } },
  { id: 'accent', chapter: 'design', target: '#editors', dwell: 7000, async run(a) { await a.stage(); a.app.select(null); a.showTab('site'); await sleep(600); a.play(); a.app.select(null); a.showTab('site'); } },
  { id: 'sectionStyle', chapter: 'design', target: '#editors', dwell: 7000, async run(a) { await a.stage(); a.selectType('features'); a.showTab('style'); await sleep(600); a.play(); a.selectType('features'); a.showTab('style'); } },
  // ── 5. phones and tablets
  { id: 'devices', chapter: 'mobile', target: '[data-command="device:mobile"]', dwell: 8000, async run(a) {
    await a.stage();
    for (const device of ['tablet', 'mobile']) { a.app.setDevice(device); await sleep(1500); }
  } },
  { id: 'preview', chapter: 'mobile', target: '[data-command="previewMode"]', dwell: 8000, async run(a) {
    await a.stage();
    a.app.setDevice('mobile');
    a.actions().togglePreview();
    await sleep(1600);
    a.openSlug('pricing');
    await sleep(1600);
    a.openSlug('index');
  } },
  // ── 6. checking: the Problems panel, spelling, search engines
  { id: 'problems', chapter: 'quality', target: '#bottom-panel', dwell: 8000, async run(a) { await a.stage(); await a.problems(); } },
  { id: 'spelling', chapter: 'quality', target: '#bottom-panel', dwell: 8000, async run(a) {
    await a.stage();
    const panel = await a.problems();
    const row = panel?.list().find((r) => r.word === TUTORIAL_WORDS.typo[getLanguage()]);
    if (row) {
      panel.select(row.key, { reveal: true });
      await sleep(1600);
      panel.replace(row, TUTORIAL_WORDS.fixed[getLanguage()]);
    }
  } },
  { id: 'dictionary', chapter: 'quality', target: '#bottom-panel', dwell: 7500, async run(a) {
    await a.stage();
    const panel = await a.problems();
    const row = panel?.list().find((r) => r.word === TUTORIAL_WORDS.newWord[getLanguage()]);
    if (row) { panel.select(row.key, { reveal: true }); await sleep(1400); }
    await a.addWord();
  } },
  { id: 'seo', chapter: 'quality', target: '#editors', dwell: 8000, async run(a) {
    await a.stage();
    await a.addWord();
    a.app.select(null);
    a.showTab('site');
    await sleep(700);
    a.play();
    a.app.select(null);
    a.showTab('site');
    await a.problems();
  } },
  // ── 7. publishing
  { id: 'save', chapter: 'publish', target: '[data-command="save"]', dwell: 5500, run: (a) => a.stage() },
  { id: 'publish', chapter: 'publish', target: '.web-popup-publish', dwell: 7000, async run(a) { await a.stage(); await a.popup(() => a.app.run('publish'), 'publish'); } },
  { id: 'browser', chapter: 'publish', target: '[data-command="previewBrowser"]', dwell: 5500, run: (a) => a.stage() },
  { id: 'hosting', chapter: 'publish', target: '#workspace', dwell: 7500, run: (a) => a.stage({ complete: true }) },
  // ── 8. your own way of working, help
  { id: 'customize', chapter: 'finish', target: '.web-popup-settings', dwell: 7000, async run(a) {
    await a.stage({ complete: true });
    for (let i = 0; i < 2; i += 1) { await a.app.run('theme'); await sleep(900); }
    await a.popup(() => a.app.popups.open('settings', { tab: 'dictionary' }), 'settings');
  } },
  { id: 'help', chapter: 'finish', target: '.web-popup-doc', dwell: 7000, async run(a) { await a.stage({ complete: true }); a.app.openDocWindow('guide'); await until(() => q('.web-popup-doc')); } },
  { id: 'finish', chapter: 'finish', target: '[data-command="tutorial"]', dwell: 6000, async run(a) { a.app.closeDocFrames?.(); await a.stage({ complete: true }); } },
];

/** The ids in order (the project's changes are applied in this order). */
const STEP_IDS = STEPS.map((s) => s.id);

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
    const step = STEPS[this.index];
    const L = () => getLanguage();
    const doc = () => app.state.docs.find((item) => item.id === tutorial.docId);
    const helpers = {
      app,
      doc,
      actions: () => window.__myhomemaker?.actions ?? {},
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      /** The tutorial's site as it is when this step starts (or finished: `complete`), shown on the step's page. */
      async stage({ complete = false } = {}) {
        await tutorial.closeAll();
        app.view?.finishEdit?.(false);
        if (app.state.preview) window.__myhomemaker?.actions.togglePreview();
        const upTo = complete ? STEP_IDS.length : STEP_IDS.indexOf(step.id);
        const site = stageSite(L(), STEP_IDS, upTo);
        const current = new SiteDocument(site, { name: site.name });
        current.markSaved(null);
        current.view.device = 'desktop';
        const page = site.pages.find((p) => p.slug === (step.page ?? 'index')) ?? site.pages[0];
        current.view.pageId = page.id;
        tutorial.docId = current.id;
        app.state.docs.splice(0, app.state.docs.length, current);
        app.state.active = current.id;
        // The Problems panel joins in the "Checking" chapter (until then the site is still being built).
        const checking = STEP_IDS.indexOf(step.id) >= STEP_IDS.indexOf('problems') || complete;
        if (app.settings().showBottomPanel !== checking) app.updateSettings({ showBottomPanel: checking });
        document.scrollingElement.scrollTop = 0;
        document.querySelector('#app').scrollTop = 0;
        app.state.selected = null;
        app.state.showStart = false;
        app.showStartPage(false);
        app.setDevice('desktop');
        app.setZoom(app.view?.fitZoom() ?? 70);
        await sleep(200);
        return current;
      },
      /** This step's own change, as one undo step. */
      play() {
        const op = OPS[step.id];
        if (!op || !doc()) return;
        app.change('tutorial.change', (site) => op(site, L()));
        app.renderAll();
      },
      /** A block's props as this step leaves them (for typing them). */
      finalProps(type) {
        const site = stageSite(L(), STEP_IDS, STEP_IDS.indexOf(step.id) + 1);
        for (const page of site.pages) { const b = page.blocks.find((x) => x.type === type); if (b) return b.props; }
        return {};
      },
      /** Types text into an element being edited on the canvas, a couple of letters at a time. */
      async typeInto(el, text) {
        el.innerText = '';
        const letters = [...text];
        for (let i = 0; i < letters.length; i += 2) { el.innerText = letters.slice(0, i + 2).join(''); await sleep(60); }
        el.innerText = text;
      },
      showTab(tab) { app.state.rightTab = tab; if (!app.settings().showRightPanel) app.updateSettings({ showRightPanel: true }); app.renderRight(); },
      openSlug(slug) { const page = doc()?.site.pages.find((p) => p.slug === slug); if (page) app.openPage(page.id); },
      /** Selects the first (or `last`) block of a kind (opening the page that has it). */
      selectType(type, { last = false } = {}) {
        const site = doc()?.site;
        const pages = site?.pages.filter((p) => p.blocks.some((b) => b.type === type)) ?? [];
        const page = last ? pages.at(-1) : pages[0];
        if (!page) return null;
        if (app.page()?.id !== page.id) app.openPage(page.id);
        const list = page.blocks.filter((b) => b.type === type);
        const block = last ? list.at(-1) : list[0];
        app.select(block.id);
        return block.id;
      },
      /** The Problems panel open and checked (spelling on). */
      async problems() {
        app.updateSettings({ showBottomPanel: true, spellCheck: true, spellEnglish: true, spellKorean: true });
        const panel = window.__myhomemaker?.problems;
        await panel?.check();
        return panel;
      },
      /** The word the dictionary step adds (kept until the tutorial ends; the settings are put back then). */
      async addWord() {
        const word = TUTORIAL_WORDS.newWord[L()];
        const words = app.settings().userWords ?? [];
        if (!words.includes(word) && !words.includes(word.toLowerCase())) await window.__myhomemaker?.problems?.addWord(word);
      },
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
          <button class="icon-button popup-close" data-tour="stop" title="${escapeHtml(t('tutorial.stop'))}" aria-label="${escapeHtml(t('tutorial.stop'))}">${icon('close')}</button></div>
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
