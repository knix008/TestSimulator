// The guided tour: a card with the step's text next to the part of the window it is about, which is
// outlined while the rest dims. Every step's `run` makes its own state from any starting point (open the
// sample, switch the tab, train …), so the tour can start at any step and scripts/tutorial-capture.mjs can
// jump straight to one. While the tour runs, popups are frames in the page (a recording sees them).
// The words are in src/domain/tutorial-text.js, in the same order as STEPS.
import { CHAPTERS, STEP_TEXT } from '../domain/tutorial-text.js';
import { escapeHtml } from './dom.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** [id, target selector (null: the card in the middle), run(app), dwell ms when playing by itself] */
export const STEPS = [
  ['welcome', '#start-page .start-hero', (a) => a.showStart(), 3500],
  ['samples', '#start-page .samples-card', (a) => a.showStart(), 4000],
  ['openSample', '#tabs', (a) => a.openSample('moons', 'model'), 4000],
  ['graph', '#center-body', (a) => a.openSample('moons', 'model'), 4500],
  ['palette', '#left-panel', (a) => a.openSample('moons', 'model'), 4500],
  ['inspector', '#right-panel', (a) => a.openSample('moons', 'model'), 4000],
  ['console', '#bottom-panel', (a) => a.openSample('moons', 'model'), 3500],
  ['data', '#center-body', (a) => a.openSample('moons', 'data'), 4500],
  ['trainTab', '#center-body .train-side, #center-body', (a) => a.openSample('moons', 'train'), 4500],
  ['engine', '#toolbar .tool-engine', (a) => a.openSample('moons', 'train'), 4000],
  ['startTraining', '#center-body [data-command="train"], #toolbar [data-command="train"]', (a) => a.openSample('moons', 'train'), 3500],
  ['liveCharts', '#center-body', async (a) => { await a.openSample('moons', 'train'); await a.train({ wait: 4000 }); }, 5000],
  ['neurons', '#center-body', async (a) => { await a.openSample('moons', 'train'); await a.train({ wait: 0 }); a.switchTab('neurons'); }, 4500],
  ['test', '#center-body', async (a) => { await a.openSample('moons', 'train'); await a.train({ wait: 0 }); await a.evaluate(); a.switchTab('test'); }, 4500],
  ['code', '#center-body', async (a) => { await a.openSample('moons', 'code'); }, 4000],
  ['variants', '#center-body .variant-switch, #center-body', (a) => a.openSample('activations', 'train'), 5000],
  ['export', '#toolbar [data-command="exportModel"]', (a) => a.openSample('activations', 'model'), 4500],
  ['settings', '#toolbar [data-command="settings"]', () => {}, 4000],
  ['help', '[data-menu="help"]', () => {}, 5000],
];

const TEXT = new Map(STEP_TEXT.map(([id, chapter, koTitle, koText, enTitle, enText]) => [id, { chapter, ko: [koTitle, koText], en: [enTitle, enText] }]));

export class Tutorial {
  /** app: { t, lang(), onStart(), onEnd() } plus the step actions (see STEPS). */
  constructor(app) {
    this.app = app;
    this.index = -1;
    this.active = false;
    this.autoplay = false;
    this.busy = false;
    this.layer = null;
    this.onKey = (event) => this.key(event);
    this.onResize = () => this.place();
  }

  state() {
    return { active: this.active, index: this.index, count: STEPS.length, id: STEPS[this.index]?.[0] ?? null, busy: this.busy, autoplay: this.autoplay };
  }

  async start({ index = 0, autoplay = false } = {}) {
    if (!this.active) {
      this.active = true;
      this.app.onStart?.();
      this.layer = document.createElement('div');
      this.layer.className = 'tutorial-layer';
      this.layer.innerHTML = '<div class="tutorial-shade"></div><div class="tutorial-spot"></div><div class="tutorial-card" role="dialog" aria-live="polite"></div>';
      document.body.append(this.layer);
      this.layer.addEventListener('click', (event) => this.click(event));
      addEventListener('keydown', this.onKey, true);
      addEventListener('resize', this.onResize);
    }
    this.autoplay = autoplay;
    await this.go(index);
    if (autoplay) this.play();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.autoplay = false;
    this.layer?.remove();
    this.layer = null;
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('resize', this.onResize);
    this.index = -1;
    this.app.onEnd?.();
  }

  /** Shows step i: runs it (its state), then outlines its target and places the card. */
  async go(i) {
    if (!this.active) return;
    const index = Math.max(0, Math.min(STEPS.length - 1, i));
    this.index = index;
    this.busy = true;
    this.renderCard();
    // At once to the new target when it is already on the screen (else the middle); again once the step has run.
    this.place();
    try { await STEPS[index][2](this.app); } catch (error) { this.app.onError?.(error); }
    if (this.index !== index || !this.active) return;
    await sleep(250);
    this.busy = false;
    this.renderCard();
    this.place();
  }

  async play() {
    while (this.active && this.autoplay) {
      const step = this.index;
      await sleep(STEPS[step][3]);
      if (!this.active || !this.autoplay || this.index !== step) return;
      if (step === STEPS.length - 1) { this.stop(); return; }
      await this.go(step + 1);
    }
  }

  next() { if (this.index >= STEPS.length - 1) this.stop(); else this.go(this.index + 1); }
  prev() { if (this.index > 0) this.go(this.index - 1); }

  key(event) {
    if (!this.active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.stop(); }
    else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); this.prev(); }
  }

  click(event) {
    const button = event.target.closest('[data-tour]');
    if (!button) return;
    const what = button.dataset.tour;
    if (what === 'next') this.next();
    else if (what === 'prev') this.prev();
    else if (what === 'close') this.stop();
  }

  target() {
    const selector = STEPS[this.index]?.[1];
    if (!selector) return null;
    for (const one of selector.split(',')) {
      const el = document.querySelector(one.trim());
      if (el && el.getClientRects().length && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  }

  renderCard() {
    if (!this.layer) return;
    const { t } = this.app;
    const lang = this.app.lang() === 'en' ? 'en' : 'ko';
    const [id] = STEPS[this.index];
    const text = TEXT.get(id);
    const last = this.index === STEPS.length - 1;
    this.layer.querySelector('.tutorial-card').innerHTML = `
      <div class="tutorial-meta"><span>${escapeHtml(CHAPTERS[text.chapter][lang])}</span><span>${this.index + 1} / ${STEPS.length}</span></div>
      <h3>${escapeHtml(text[lang][0])}</h3>
      <p>${escapeHtml(text[lang][1])}</p>
      <div class="tutorial-progress"><i style="width:${((this.index + 1) / STEPS.length) * 100}%"></i></div>
      <div class="tutorial-buttons">
        <button class="button" data-tour="close">${escapeHtml(t('tutorial.close'))}</button><span class="grow"></span>
        <button class="button" data-tour="prev" ${this.index === 0 ? 'disabled' : ''}>${escapeHtml(t('tutorial.prev'))}</button>
        <button class="button primary" data-tour="next" ${this.busy ? 'disabled' : ''}>${escapeHtml(t(last ? 'tutorial.finish' : 'tutorial.next'))}</button>
      </div>`;
    this.layer.dataset.step = id;
  }

  /** Outlines the target (or nothing) and puts the card beside it, inside the window. */
  place() {
    if (!this.layer) return;
    const spot = this.layer.querySelector('.tutorial-spot');
    const card = this.layer.querySelector('.tutorial-card');
    const el = this.target();
    const W = innerWidth; const H = innerHeight;
    const cw = card.offsetWidth; const ch = card.offsetHeight;
    if (!el) {
      spot.hidden = true;
      this.layer.classList.add('no-target');
      card.style.left = `${(W - cw) / 2}px`; card.style.top = `${(H - ch) / 2}px`;
      return;
    }
    this.layer.classList.remove('no-target');
    const r = el.getBoundingClientRect();
    const pad = 6;
    const box = { left: Math.max(2, r.left - pad), top: Math.max(2, r.top - pad), right: Math.min(W - 2, r.right + pad), bottom: Math.min(H - 2, r.bottom + pad) };
    spot.hidden = false;
    Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
    // Beside the target where there is room: below, above, right, left; else over its lower right corner.
    const gap = 14;
    const spots = [
      [box.left, box.bottom + gap, H - box.bottom - gap >= ch],
      [box.left, box.top - gap - ch, box.top - gap >= ch],
      [box.right + gap, box.top, W - box.right - gap >= cw],
      [box.left - gap - cw, box.top, box.left - gap >= cw],
    ];
    const [x, y] = spots.find((s) => s[2]) ?? [box.right - cw - 20, box.bottom - ch - 20];
    card.style.left = `${Math.max(10, Math.min(W - cw - 10, x))}px`;
    card.style.top = `${Math.max(10, Math.min(H - ch - 10, y))}px`;
  }
}
