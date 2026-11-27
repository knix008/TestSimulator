// Tutorial: a guided tour that runs the real app, chapter by chapter — the start page, the hex view (text
// column, editing, data inspector, explorer), structure (templates, file information, bookmarks), the tools
// (find, go to, strings, disassembler, recovery, compare, calculator), data (operations, checksums, statistics,
// export) and settings. It opens sample files of its own; the tabs the user had are kept, the tour's tabs are
// closed at the end, and the settings it changes are restored. While it runs, popups open inside the main
// window (so a screen recording shows them). A card at the bottom right shows the step with previous / next,
// auto play, a chapter list and exit; the part of the window the step is about is outlined.
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

export const CHAPTERS = ['start', 'view', 'structure', 'tools', 'data', 'finish'];

/** The tour's sample in a tab of its own (opened fresh when missing), made active. */
const sample = async (a, id, file) => {
  const editor = a.app.editor;
  let tab = editor.tabs.find((x) => x.doc.name === file && x.kind === 'hex');
  if (!tab) tab = await a.app.openSample(id);
  if (tab && editor.activeId !== tab.id) editor.activate(tab.id);
  if (a.app.state.showStart) a.app.showStartPage(false);
  await sleep(250);
  return tab;
};
const caret = (a, offset, length = 0) => { const v = a.app.editor.activeView(); if (!v) return; if (length) v.select(offset, offset + length, { center: true }); else v.setCaret(offset); };

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in
 * the state the step shows; `dwell`: how long auto play stays (ms).
 */
export const STEPS = [
  // ── start
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'actions', chapter: 'start', target: '.start-card.actions', run: (a) => a.start() },
  { id: 'samples', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  { id: 'toolsCard', chapter: 'start', target: '.start-card.tools', run: (a) => a.start() },
  // ── the hex view
  { id: 'hexview', chapter: 'view', target: '.hx-view', dwell: 6000, run: async (a) => { await a.closeMenus(); await sample(a, 'png', 'sample.png'); caret(a, 0); } },
  { id: 'textcol', chapter: 'view', target: '.hx-view', run: async (a) => { await a.closeMenus(); await sample(a, 'text', 'readme-utf8.txt'); a.app.updateSettings({ charset: 'utf8' }); caret(a, 0x20, 3); } },
  { id: 'editing', chapter: 'view', target: '.hex-tab-bar', run: async (a) => { await a.closeMenus(); await sample(a, 'png', 'sample.png'); caret(a, 0x10); } },
  { id: 'inspector', chapter: 'view', target: '#right-panel', run: async (a) => { await a.closeMenus(); await sample(a, 'png', 'sample.png'); caret(a, 0x10); a.app.setRightTab('inspector'); } },
  { id: 'explorer', chapter: 'view', target: '#left-panel', run: async (a) => { await a.closeMenus(); await sample(a, 'png', 'sample.png'); } },
  // ── structure
  { id: 'template', chapter: 'structure', target: '#right-panel', dwell: 6000, run: async (a) => { await a.closeMenus(); const tab = await sample(a, 'png', 'sample.png'); await a.app.runTemplate(tab, { template: 'png', quiet: true }); a.app.setRightTab('structure'); } },
  { id: 'templateEditor', chapter: 'structure', target: '.web-popup-template', async run(a) { await a.closeMenus(); await sample(a, 'png', 'sample.png'); await a.popup(() => a.app.openTool('template', { template: 'png' }), 'template'); } },
  { id: 'info', chapter: 'structure', target: '#right-panel', run: async (a) => { await a.closeMenus(); await sample(a, 'elf', 'hello.elf'); a.app.setRightTab('info'); } },
  { id: 'bookmarks', chapter: 'structure', target: '#right-panel', run: async (a) => { await a.closeMenus(); const tab = await sample(a, 'png', 'sample.png'); if (!tab.doc.bookmarks.length) { caret(a, 8, 25); a.app.editor.toggleBookmark(); } a.app.setRightTab('bookmarks'); } },
  // ── tools
  { id: 'find', chapter: 'tools', target: '.web-popup-find', async run(a) { await a.closeMenus(); await sample(a, 'png', 'sample.png'); await a.popup(() => a.app.openTool('find', { value: '49 44 41 54' }), 'find'); } },
  { id: 'goto', chapter: 'tools', target: '.web-popup-goto', async run(a) { await a.closeMenus(); await sample(a, 'png', 'sample.png'); await a.popup(() => a.app.openTool('goto'), 'goto'); } },
  { id: 'strings', chapter: 'tools', target: '.web-popup-strings', async run(a) { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); await a.popup(() => a.app.openTool('strings'), 'strings'); } },
  { id: 'disasm', chapter: 'tools', target: '.web-popup-disasm', async run(a) { await a.closeMenus(); await sample(a, 'elf', 'hello.elf'); caret(a, 0x78); await a.popup(() => a.app.openTool('disasm'), 'disasm'); } },
  { id: 'carve', chapter: 'tools', target: '.web-popup-carve', async run(a) { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); await a.popup(() => a.app.openTool('carve'), 'carve'); } },
  { id: 'compare', chapter: 'tools', target: '#workspace', dwell: 6000, async run(a) { await a.closeMenus(); const x = await sample(a, 'elf', 'hello.elf'); const y = await sample(a, 'pe', 'hello.exe'); const open = a.app.editor.tabs.find((t) => t.kind === 'compare'); if (open) a.app.editor.activate(open.id); else await a.app.openCompare(x.doc.id, y.doc.id, 'bytes'); } },
  { id: 'calc', chapter: 'tools', target: '.web-popup-calc', async run(a) { await a.closeMenus(); await a.popup(() => a.app.openTool('calc'), 'calc'); } },
  // ── data
  { id: 'operations', chapter: 'data', target: '#toolbar [data-command="operations"]', run: async (a) => { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); } },
  { id: 'checksums', chapter: 'data', target: '#right-panel', run: async (a) => { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); await a.app.props.runHashes(); } },
  { id: 'stats', chapter: 'data', target: '#right-panel', dwell: 6000, run: async (a) => { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); await a.app.props.runStats(); } },
  { id: 'export', chapter: 'data', target: '#toolbar [data-command="exportMenu"]', run: async (a) => { await a.closeMenus(); await sample(a, 'mixed', 'firmware.bin'); } },
  // ── finish
  { id: 'status', chapter: 'finish', target: '#statusbar', run: async (a) => { await a.closeMenus(); await sample(a, 'png', 'sample.png'); } },
  { id: 'theme', chapter: 'finish', target: '[data-command="theme"]', run: (a) => a.closeMenus() },
  { id: 'settings', chapter: 'finish', target: '.web-popup-settings', async run(a) { await a.closeMenus(); await a.popup(() => a.app.popups.open('settings', { tab: 'view' }), 'settings'); } },
  { id: 'finish', chapter: 'finish', target: '[data-command="tutorial"]', async run(a) { await a.closeMenus(); } },
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
    this.doc = null;
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
    await this.app.putDoc(this.savedDoc ?? null);
    this.doc = null;
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

