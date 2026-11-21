// Tutorial: a guided tour that runs the real app, chapter by chapter — the start page, composing a
// song with AI, the arrangement, the piano roll, lyrics, the lead sheet, playback and the mix, export,
// printing and settings.
//
// It works on a song of its own (a sample); the user's song is put back at the end, and the settings it
// changes are restored. While it runs, popups open inside the main window (so a screen recording shows
// them). A card at the bottom right shows the step with previous / next, auto play, a chapter list and
// exit; the part of the window the step is about is outlined.
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

export const CHAPTERS = ['start', 'compose', 'arrange', 'edit', 'words', 'listen', 'output', 'help'];

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in the state the step shows;
 * `dwell`: how long auto play stays (ms).
 */
export const STEPS = [
  // ── start
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'startCompose', chapter: 'start', target: '.start-card.compose', run: (a) => a.start() },
  { id: 'samples', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  // ── compose with AI
  { id: 'workspace', chapter: 'compose', target: '#workspace', dwell: 6000, run: (a) => a.song() },
  { id: 'composePanel', chapter: 'compose', target: '#left-panel', dwell: 7000, async run(a) { await a.song(); a.app.state.leftTab = 'compose'; a.app.renderAll(); } },
  { id: 'provider', chapter: 'compose', target: '.compose-provider', async run(a) { await a.song(); a.app.state.leftTab = 'compose'; a.app.renderAll(); } },
  { id: 'wizard', chapter: 'compose', target: '.web-popup-compose', dwell: 7000, async run(a) { await a.song(); a.popup(() => a.app.popups.open('compose', { draft: a.app.state.compose, provider: 'builtin' }), 'compose'); } },
  // ── arrangement
  { id: 'arrangement', chapter: 'arrange', target: '.view-arrangement', dwell: 7000, async run(a) { await a.closeMenus(); await a.song(); a.app.setView('arrangement'); } },
  { id: 'sections', chapter: 'arrange', target: '.arr-ruler', async run(a) { await a.song(); a.app.setView('arrangement'); const s = a.app.song().sections.find((x) => x.type === 'chorus'); if (s) a.app.selectSection(s.id); } },
  { id: 'regenerate', chapter: 'arrange', target: '#right-panel', dwell: 7000, async run(a) { await a.song(); a.app.state.rightTab = 'section'; a.app.renderAll(); } },
  { id: 'tracks', chapter: 'arrange', target: '.arr-heads', async run(a) { await a.song(); a.app.setView('arrangement'); } },
  // ── piano roll
  { id: 'roll', chapter: 'edit', target: '.view-roll', dwell: 7000, async run(a) { await a.song(); const v = a.app.song().tracks.find((x) => x.role === 'vocal') ?? a.app.song().tracks[0]; a.app.selectTrack(v.id, { open: true, beat: 16 }); } },
  { id: 'tools', chapter: 'edit', target: '[data-command="tool:draw"]', async run(a) { await a.song(); a.app.setView('roll'); } },
  { id: 'instruments', chapter: 'edit', target: '#left-panel', dwell: 6000, async run(a) { await a.song(); a.app.state.leftTab = 'instruments'; a.app.renderAll(); } },
  // ── lyrics and lead sheet
  { id: 'lyrics', chapter: 'words', target: '.view-lyrics', dwell: 7000, async run(a) { await a.song(); a.app.state.leftTab = 'compose'; a.app.setView('lyrics'); } },
  { id: 'fit', chapter: 'words', target: '.lyric-card', async run(a) { await a.song(); a.app.setView('lyrics'); } },
  { id: 'sheet', chapter: 'words', target: '.view-sheet', dwell: 6000, async run(a) { await a.song(); a.app.setView('sheet'); } },
  // ── listening and the mix
  { id: 'play', chapter: 'listen', target: '[data-command="play"]', dwell: 6000, async run(a) { await a.song(); a.app.setView('arrangement'); } },
  { id: 'loop', chapter: 'listen', target: '[data-command="loop"]', async run(a) { await a.song(); } },
  { id: 'mix', chapter: 'listen', target: '#right-panel', dwell: 6000, async run(a) { await a.song(); a.app.state.rightTab = 'mix'; a.app.renderAll(); } },
  // ── output
  { id: 'save', chapter: 'output', target: '[data-command="save"]', run: (a) => a.song() },
  { id: 'export', chapter: 'output', target: '.web-popup-exportaudio', dwell: 6000, async run(a) { await a.song(); a.popup(() => a.app.popups.open('exportaudio', { tracks: a.app.song().tracks.map((x) => ({ id: x.id, name: x.name || x.instrument, color: x.color })), hasLoop: false, section: '' }), 'exportaudio'); } },
  { id: 'print', chapter: 'output', target: '.web-popup-print', dwell: 6000, async run(a) { await a.closeMenus(); await a.song(); a.popup(() => a.app.run('print'), 'print'); } },
  // ── help
  { id: 'aiSettings', chapter: 'help', target: '.web-popup-settings', dwell: 6000, async run(a) { await a.closeMenus(); await a.song(); a.popup(() => a.app.popups.open('settings', { tab: 'ai' }), 'settings'); } },
  { id: 'shortcuts', chapter: 'help', target: '.web-popup-settings', async run(a) { await a.closeMenus(); await a.song(); a.popup(() => a.app.popups.open('settings', { tab: 'shortcuts' }), 'settings'); } },
  { id: 'finish', chapter: 'help', target: '[data-command="tutorial"]', async run(a) { await a.closeMenus(); await a.song(); } },
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
      /** The tour's own song (a sample, made once). */
      async song() {
        await tutorial.closeAll();
        if (!tutorial.doc || app.takeDoc() !== tutorial.doc) {
          if (!tutorial.doc) { app.openSample(ko() ? 'pop-firstlove' : 'en-pop-love'); tutorial.doc = app.takeDoc(); } else app.putDoc(tutorial.doc);
        }
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
    this.app.stop?.();
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    this.app.putDoc(this.savedDoc ?? null);
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

