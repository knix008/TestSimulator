// The interactive tutorial: a floating panel that walks through lessons step
// by step. Watch: each step is performed on the real interface (cursor, ring
// around what is clicked, key bubbles). Practice: the user does the step and
// the player recognises when it is done (targets pulse where to click).
// Lessons are in lessons.js; texts are { ko, en } (L picks the language).
import { LESSONS } from './lessons.js';

export const L = (o, language) => (o == null ? '' : typeof o === 'string' ? o : o[language] || o.en || o.ko || '');

const UI = {
  title: { ko: '따라 하는 튜토리얼', en: 'Interactive tutorial' },
  watch: { ko: '보기', en: 'Watch' },
  practice: { ko: '직접 하기', en: 'Practice' },
  step: { ko: '단계 {n} / {m}', en: 'Step {n} / {m}' },
  running: { ko: '진행 중…', en: 'Running…' },
  done: { ko: '✓ 완료', en: '✓ Done' },
  yourTurn: { ko: '직접 해 보세요:', en: 'Your turn:' },
  look: { ko: '살펴보세요:', en: 'Have a look:' },
  wellDone: { ko: '✓ 잘했습니다!', en: '✓ Well done!' },
  play: { ko: '재생', en: 'Play' },
  pause: { ko: '일시 정지', en: 'Pause' },
  prev: { ko: '이전 단계', en: 'Previous step' },
  next: { ko: '다음 단계', en: 'Next step' },
  showMe: { ko: '보여 주기', en: 'Show me' },
  skip: { ko: '건너뛰기', en: 'Skip' },
  close: { ko: '튜토리얼 닫기', en: 'Close the tutorial' },
  speed: { ko: '속도', en: 'Speed' },
  retry: { ko: '다시 시도', en: 'Retry' },
  failed: { ko: '이 단계를 실행하지 못했습니다', en: 'This step could not be run' },
  preparing: { ko: '앞 레슨의 결과를 준비하는 중…', en: 'Preparing the result of the earlier lessons…' },
  finished: { ko: '튜토리얼을 모두 마쳤습니다. 수고하셨습니다!', en: 'You have finished the tutorial. Well done!' },
  lesson: { ko: '레슨', en: 'Lesson' },
  drag: { ko: '끌어서 옮기기', en: 'Drag to move' },
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cap: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 9l10-5 10 5-10 5z M6 11v5c3 2.5 9 2.5 12 0v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  cursor: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 10-7 1.6 4.4 7.4-3 1.6-4.3-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Settings every lesson starts from (look and language stay the user's). */
const BASELINE = {
  units: 'mm', snapObject: false, snapGrid: true, ortho: false, gridSize: 5, showGrid: true, showRulers: true, showScaleBar: true,
  showLeftPanel: true, showRightPanel: true, showStatusBar: true, collapsedSections: [], toolbarRows: 1, crosshair: true, textHeight: 3.5, dimTextHeight: 3.5, dimPrecision: 1,
};

export class TutorialPlayer {
  /** api: what app.js lends the tutorial (see tutorialApi() there). */
  constructor(api, lessons = LESSONS) {
    this.api = api;
    this.lessons = lessons;
    this.li = 0;
    this.si = 0;
    this.mode = 'watch';
    this.playing = false;
    this.busy = false;
    this.speed = 1;
    this.instant = false;
    this.completed = -1; // last lesson run to the end
    this.done = false;
    this.mem = {};
    this.timer = 0;
    this.saved = null;
  }

  get language() { return this.api.language(); }
  tr(key, vars = {}) { return L(UI[key], this.language).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }
  get lesson() { return this.lessons[this.li]; }
  get step() { return this.lesson.steps[this.si]; }

  // ───────────────────────── panel

  /**
   * The cursor, rings and targets are drawn over the main window. The panel is
   * its own OS window on the desktop (api.panelWindow: { show(html), update(html), hide() }),
   * so it can sit anywhere on the screen; in the browser it floats in the page.
   */
  get remote() { return this.api.panelWindow ?? null; }

  build() {
    if (this.ring) return;
    const body = document.body;
    this.ring = Object.assign(document.createElement('div'), { className: 'tut-ring' });
    this.cursor = Object.assign(document.createElement('div'), { className: 'tut-cursor', innerHTML: ICONS.cursor });
    this.keyBubble = Object.assign(document.createElement('div'), { className: 'tut-key' });
    this.targetLayer = Object.assign(document.createElement('div'), { className: 'tut-targets' });
    body.append(this.ring, this.targetLayer, this.cursor, this.keyBubble);
    this.ring.hidden = true;
    this.cursor.hidden = true;
    this.keyBubble.hidden = true;
    if (this.remote) return;
    this.panel = Object.assign(document.createElement('section'), { className: 'tut-panel' });
    this.panel.setAttribute('role', 'dialog');
    this.panel.hidden = true;
    body.append(this.panel);
    this.panel.addEventListener('click', (event) => this.handle({ tut: event.target.closest('[data-tut]')?.dataset.tut }));
    this.panel.addEventListener('change', (event) => {
      if (event.target.matches('.tut-lesson')) this.handle({ lesson: Number(event.target.value) });
      if (event.target.matches('.tut-speed')) this.handle({ speed: Number(event.target.value) });
    });
    // Drag by the header.
    this.panel.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.tut-head') || event.target.closest('button, select')) return;
      const r = this.panel.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: r.left, top: r.top };
      const move = (e) => {
        this.panel.style.left = `${Math.max(0, Math.min(innerWidth - r.width, start.left + e.clientX - start.x))}px`;
        this.panel.style.top = `${Math.max(0, Math.min(innerHeight - 60, start.top + e.clientY - start.y))}px`;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  render() {
    if (!this.shown) return;
    const html = this.panelHtml();
    if (this.remote) this.remote.update(html);
    else this.panel.innerHTML = html;
  }

  /** The panel's contents (the same in its window and in the page). */
  panelHtml() {
    const lesson = this.lesson;
    const step = this.step;
    const total = lesson.steps.length;
    const practice = this.mode === 'practice';
    const info = practice && step.practice && !step.practice.check;
    const lessonOptions = this.lessons.map((l, i) => `<option value="${i}" ${i === this.li ? 'selected' : ''}>${i + 1}. ${escapeHtml(L(l.title, this.language))}</option>`).join('');
    const todo = practice
      ? `<div class="tut-todo ${this.done ? 'done' : ''}"><b>${escapeHtml(this.done ? this.tr('wellDone') : step.practice?.check ? this.tr('yourTurn') : this.tr('look'))}</b> ${escapeHtml(L(step.practice?.todo ?? step.text, this.language))}</div>`
      : '';
    const button = (action, icon, label, extra = '') => `<button type="button" class="tut-btn ${extra}" data-tut="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}${extra.includes('text') ? `<span>${escapeHtml(label)}</span>` : ''}</button>`;
    const controls = practice
      ? `${button('prev', ICONS.prev, this.tr('prev'))}${button('show', '', this.tr('showMe'), 'text')}${button('skip', ICONS.next, info || !step.practice?.check ? this.tr('next') : this.tr('skip'), 'text')}`
      : `${button('prev', ICONS.prev, this.tr('prev'))}${button('play', this.playing ? ICONS.pause : ICONS.play, this.playing ? this.tr('pause') : this.tr('play'), 'primary')}${button('next', ICONS.next, this.tr('next'))}
        <label class="tut-speed-label" title="${escapeHtml(this.tr('speed'))}"><span>${escapeHtml(this.tr('speed'))}</span><select class="tut-speed">${[0.5, 1, 1.25, 1.5, 2, 4].map((s) => `<option value="${s}" ${s === this.speed ? 'selected' : ''}>${s}×</option>`).join('')}</select></label>`;
    return `
      <header class="tut-head" title="${escapeHtml(this.tr('drag'))}">${ICONS.cap}<b>${escapeHtml(this.tr('title'))}</b>
        <select class="tut-lesson" title="${escapeHtml(this.tr('lesson'))}" aria-label="${escapeHtml(this.tr('lesson'))}">${lessonOptions}</select>
        ${button('close', ICONS.close, this.tr('close'))}</header>
      <div class="tut-modebar"><span class="tut-mode" role="radiogroup">
        <button type="button" class="${practice ? '' : 'active'}" data-tut="mode-watch" role="radio" aria-checked="${!practice}">${escapeHtml(this.tr('watch'))}</button>
        <button type="button" class="${practice ? 'active' : ''}" data-tut="mode-practice" role="radio" aria-checked="${practice}">${escapeHtml(this.tr('practice'))}</button></span></div>
      <div class="tut-progress"><div style="width:${Math.round(((this.si + (this.done ? 1 : 0)) / total) * 100)}%"></div></div>
      <div class="tut-step"><span>${escapeHtml(this.tr('step', { n: this.si + 1, m: total }))}</span><span class="tut-state">${this.busy ? escapeHtml(this.tr('running')) : this.done ? escapeHtml(this.tr('done')) : ''}</span></div>
      <h3 class="tut-title">${escapeHtml(L(step.title, this.language))}</h3>
      <p class="tut-text">${escapeHtml(L(step.text, this.language))}</p>
      ${todo}
      <div class="tut-error" ${this.lastError ? '' : 'hidden'}>${escapeHtml(this.tr('failed'))}: ${escapeHtml(this.lastError ?? '')} ${button('retry', '', this.tr('retry'), 'text')}</div>
      <div class="tut-controls">${controls}</div>
      ${this.note ? `<div class="tut-note">${escapeHtml(this.note)}</div>` : ''}`;
  }

  /** What the panel asks for: { tut: button } · { lesson: index } · { speed }. */
  handle({ tut: action, lesson, speed } = {}) {
    if (lesson != null) { this.goLesson(Number(lesson)); return; }
    if (speed != null) { this.speed = Number(speed) || 1; return; }
    if (!action) return;
    if (action === 'close') this.close();
    else if (action === 'play') { if (this.playing) this.pause(); else this.play(); }
    else if (action === 'next') this.nextStep();
    else if (action === 'prev') this.prev();
    else if (action === 'mode-watch') this.setMode('watch');
    else if (action === 'mode-practice') this.setMode('practice');
    else if (action === 'show') this.showMe();
    else if (action === 'skip') this.skip();
    else if (action === 'retry') { this.lastError = null; this.render(); if (this.mode === 'watch') this.play(); else this.practiceStep(); }
  }

  // ───────────────────────── open / close

  /** opts: { lesson = 0, mode = 'watch', autoplay = false } */
  async open({ lesson = 0, mode = 'watch', autoplay = false } = {}) {
    this.build();
    this.useBaseline();
    this.mode = mode;
    if (!this.shown) {
      this.shown = true;
      if (this.remote) this.remote.show(this.panelHtml(), () => { if (this.shown) this.close(); });
      else this.panel.hidden = false;
    }
    await this.goLesson(lesson, { autoplay });
    return this;
  }

  close() {
    this.pause();
    this.stopPractice();
    this.hideMarks();
    this.hidePanel();
    this.restoreSettings();
    this.api.onTutorial?.(false);
  }

  get visible() { return Boolean(this.shown); }

  hidePanel() {
    if (!this.shown) return;
    this.shown = false;
    if (this.remote) this.remote.hide();
    else this.panel.hidden = true;
  }

  useBaseline() {
    if (!this.saved) this.saved = structuredClone(this.api.settings());
    this.api.updateSettings(BASELINE);
    this.api.onTutorial?.(true);
    // Scripted pointer events have no real pointer to capture.
    const canvas = this.api.canvas();
    if (canvas && !Object.prototype.hasOwnProperty.call(canvas, 'setPointerCapture')) {
      canvas.setPointerCapture = () => {};
      canvas.releasePointerCapture = () => {};
    }
  }

  restoreSettings() {
    if (!this.saved) return;
    const keep = this.api.settings();
    this.api.updateSettings({ ...this.saved, theme: keep.theme, language: keep.language, customTheme: keep.customTheme });
    this.saved = null;
    const canvas = this.api.canvas();
    if (canvas) { delete canvas.setPointerCapture; delete canvas.releasePointerCapture; }
  }

  // ───────────────────────── moving around

  async goLesson(index, { autoplay = false } = {}) {
    this.pause();
    this.stopPractice();
    this.li = Math.max(0, Math.min(this.lessons.length - 1, index));
    this.si = 0;
    this.done = false;
    this.lastError = null;
    await this.ensureReady();
    this.render();
    if (this.mode === 'practice') this.practiceStep();
    else if (autoplay) this.play();
  }

  /** Lessons build on each other: the earlier ones are replayed quickly when starting in the middle. */
  async ensureReady() {
    if (this.lesson.fresh) return;
    let from = this.li - 1;
    while (from > 0 && !this.lessons[from].fresh) from--;
    if (this.completed >= from && this.completed === this.li - 1) return;
    this.busy = true;
    this.showNote(this.tr('preparing'));
    const instant = this.instant;
    this.instant = true;
    try {
      for (let i = Math.max(from, 0); i < this.li; i++) for (const step of this.lessons[i].steps) await step.run(this.ctx());
      this.completed = this.li - 1;
    } catch (error) {
      this.lastError = String(error?.message ?? error);
    } finally {
      this.instant = instant;
      this.busy = false;
      this.showNote('');
    }
  }

  async setMode(mode) {
    if (this.mode === mode) return;
    this.pause();
    this.stopPractice();
    this.mode = mode;
    this.done = false;
    this.render();
    if (mode === 'practice') this.practiceStep();
  }

  pause() { this.playing = false; this.render(); }

  async play() {
    if (this.playing) return;
    this.playing = true;
    this.render();
    while (this.playing) {
      const ok = await this.exec();
      if (!ok || !this.playing) break;
      if (!(await this.advance())) break;
      await this.wait(500);
    }
    this.playing = false;
    this.render();
  }

  /** Runs the current step (watch mode). Returns true when it worked. */
  async exec() {
    if (this.busy) return false;
    this.busy = true;
    this.done = false;
    this.lastError = null;
    this.render();
    try {
      const text = L(this.step.text, this.language);
      await this.wait(Math.min(2600, 600 + text.length * 18));
      await this.step.run(this.ctx());
      this.done = true;
      return true;
    } catch (error) {
      this.lastError = String(error?.message ?? error);
      this.playing = false;
      return false;
    } finally {
      this.busy = false;
      this.hideMarks();
      this.render();
    }
  }

  /** The next step (or lesson). Returns false at the very end. */
  async advance() {
    this.done = false;
    if (this.si < this.lesson.steps.length - 1) { this.si++; this.render(); return true; }
    this.completed = Math.max(this.completed, this.li);
    if (this.li < this.lessons.length - 1) {
      this.li++;
      this.si = 0;
      await this.ensureReady();
      this.render();
      return true;
    }
    this.showNote(this.tr('finished'), 4000);
    return false;
  }

  async nextStep() {
    this.pause();
    if (!this.done) { const ok = await this.exec(); if (!ok) return; }
    await this.advance();
    if (this.mode === 'practice') this.practiceStep();
  }

  prev() {
    this.pause();
    this.stopPractice();
    if (this.si > 0) this.si--;
    else if (this.li > 0) { this.li--; this.si = this.lesson.steps.length - 1; }
    this.done = false;
    this.render();
    if (this.mode === 'practice') this.practiceStep();
  }

  // ───────────────────────── practice

  practiceStep() {
    this.stopPractice();
    const step = this.step;
    this.done = false;
    this.mem = { start: this.snapshot() };
    try { step.practice?.setup?.(this.ctx(), this.mem); } catch { /* best effort */ }
    this.render();
    if (!step.practice?.check) { this.drawTargets(); return; }
    this.timer = setInterval(() => this.tick(), 300);
  }

  stopPractice() {
    clearInterval(this.timer);
    this.timer = 0;
    this.targetLayer?.replaceChildren();
  }

  tick() {
    const step = this.step;
    this.drawTargets();
    let ok = false;
    try { ok = Boolean(step.practice.check(this.ctx(), this.mem)); } catch { ok = false; }
    if (!ok) return;
    this.stopPractice();
    this.done = true;
    this.render();
    setTimeout(async () => {
      if (!this.visible || this.mode !== 'practice') return;
      if (await this.advance()) this.practiceStep();
    }, 1300);
  }

  async showMe() {
    this.stopPractice();
    const instant = this.instant;
    this.instant = false;
    const ok = await this.exec();
    this.instant = instant;
    if (ok && (await this.advance())) this.practiceStep();
  }

  /** Skip: the step is done for the user (instantly), so later steps find what they expect. */
  async skip() {
    this.stopPractice();
    if (this.step.practice?.check) {
      const instant = this.instant;
      this.instant = true;
      try { await this.step.run(this.ctx()); } catch (error) { this.lastError = String(error?.message ?? error); this.render(); this.instant = instant; return; }
      this.instant = instant;
    }
    if (await this.advance()) this.practiceStep();
  }

  drawTargets() {
    if (!this.targetLayer) return;
    const targets = this.step.practice?.targets?.(this.ctx()) ?? [];
    const marks = [];
    for (const target of targets) {
      let rect = null;
      if (target.el) {
        const el = typeof target.el === 'function' ? target.el() : document.querySelector(target.el);
        if (el && el.getBoundingClientRect().width) rect = el.getBoundingClientRect();
        if (rect) marks.push(`<div class="tut-target-box" style="left:${rect.left - 4}px;top:${rect.top - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px"></div>`);
      } else if (Number.isFinite(target.x)) {
        const p = this.api.worldToClient(target);
        if (p) marks.push(`<div class="tut-target" style="left:${p.x}px;top:${p.y}px"></div>`);
      }
    }
    this.targetLayer.innerHTML = marks.join('');
  }

  snapshot() {
    const drawing = this.api.drawing();
    return { count: drawing?.entities.length ?? 0, ids: new Set(drawing?.entities.map((e) => e.id) ?? []) };
  }

  // ───────────────────────── marks: ring, cursor, key bubble, note

  async wait(ms) { if (!this.instant && ms > 0) await sleep(ms / this.speed); }

  ringAround(rect) {
    if (this.instant || !rect) return;
    Object.assign(this.ring.style, { left: `${rect.left - 6}px`, top: `${rect.top - 6}px`, width: `${rect.width + 12}px`, height: `${rect.height + 12}px` });
    this.ring.hidden = false;
  }

  async moveCursor(x, y) {
    if (this.instant) return;
    const from = this.cursorAt ?? { x: innerWidth / 2, y: innerHeight / 2 };
    const d = Math.hypot(x - from.x, y - from.y);
    const ms = Math.min(700, 180 + d * 0.6) / this.speed;
    this.cursor.hidden = false;
    this.cursor.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.3,1)`;
    this.cursor.style.transform = `translate(${x}px, ${y}px)`;
    this.cursorAt = { x, y };
    await sleep(ms + 30);
  }

  ripple(x, y) {
    if (this.instant) return;
    const r = Object.assign(document.createElement('div'), { className: 'tut-ripple' });
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    document.body.append(r);
    setTimeout(() => r.remove(), 600);
  }

  showKey(text) {
    if (this.instant) return;
    this.keyBubble.textContent = text;
    this.keyBubble.hidden = false;
    this.keyBubble.classList.remove('out');
    clearTimeout(this.keyTimer);
    this.keyTimer = setTimeout(() => this.keyBubble.classList.add('out'), 1100 / this.speed);
  }

  showNote(text, ms = 0) {
    this.note = text || '';
    clearTimeout(this.noteTimer);
    if (text && ms) this.noteTimer = setTimeout(() => { if (this.note === text) { this.note = ''; this.render(); } }, ms);
    this.render();
  }

  hideMarks() {
    if (this.ring) this.ring.hidden = true;
    if (this.cursor && this.instant) this.cursor.hidden = true;
  }

  // ───────────────────────── what steps use

  ctx() {
    const player = this;
    const api = this.api;
    const find = async (target, ms = 3000) => {
      const t0 = Date.now();
      for (;;) {
        const el = typeof target === 'function' ? target() : typeof target === 'string' ? document.querySelector(target) : target;
        if (el && el.getBoundingClientRect().width) return el;
        if (Date.now() - t0 > ms) throw new Error(`not found: ${typeof target === 'string' ? target : 'element'}`);
        await sleep(50);
      }
    };
    const ctx = {
      api,
      lang: this.language,
      L: (o) => L(o, player.language),
      wait: (ms) => player.wait(ms),
      expect(cond, message) { if (!cond) throw new Error(message); },
      drawing: () => api.drawing(),
      entities: (type) => (api.drawing()?.entities ?? []).filter((e) => !type || e.type === type),
      last: (type) => ctx.entities(type).at(-1),
      settings: () => api.settings(),
      /** Clicks an element (selector, element or function returning one). */
      async click(target) {
        const el = await find(target);
        el.scrollIntoView?.({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        player.ringAround(r);
        await player.moveCursor(r.left + r.width / 2, r.top + r.height / 2);
        player.ripple(r.left + r.width / 2, r.top + r.height / 2);
        el.click();
        await player.wait(250);
      },
      /** A command: its toolbar or panel button when visible, else run directly (key bubble with its name). */
      async command(id, label = null) {
        const el = [...document.querySelectorAll(`#toolbar [data-command="${id}"], #left-panel [data-command="${id}"], .view3d-bar [data-command="${id}"]`)].find((e) => e.getBoundingClientRect().width && !e.disabled);
        if (el && !player.instant) { await ctx.click(el); return; }
        if (el && player.instant) { el.click(); return; }
        player.showKey(label ?? api.commandLabel(id));
        await player.wait(500);
        await api.run(id);
        await player.wait(300);
      },
      /** A drawing tool from the left panel. */
      async tool(id) {
        api.openSectionFor(id);
        await ctx.click(`#left-panel [data-tool="${id}"]`);
      },
      /** A key, as pressed on the canvas (Enter, Escape, letters, Delete…). */
      async key(key, { ctrl = false, shift = false } = {}) {
        player.showKey([ctrl ? 'Ctrl' : '', shift ? 'Shift' : '', key.length === 1 ? key.toUpperCase() : key].filter(Boolean).join(' + '));
        // Keys go to the drawing (a text field that still has focus would keep them).
        if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur();
        const target = api.canvas();
        target.focus({ preventScroll: true });
        target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, shiftKey: shift, bubbles: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key, ctrlKey: ctrl, shiftKey: shift, bubbles: true }));
        await player.wait(350);
      },
      /** Typed into the command box (coordinates, distances, angles), then Enter. */
      async type(text) {
        const input = await find('#command-input');
        const r = input.getBoundingClientRect();
        player.ringAround(r);
        await player.moveCursor(r.left + 30, r.top + r.height / 2);
        input.focus();
        input.value = '';
        for (const c of String(text)) { input.value += c; input.dispatchEvent(new Event('input', { bubbles: true })); await player.wait(55); }
        await player.wait(200);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await player.wait(300);
      },
      /** A value into a field (properties, tool options), confirmed like Enter / leaving the field. */
      async field(selector, value) {
        const el = await find(selector);
        const r = el.getBoundingClientRect();
        player.ringAround(r);
        await player.moveCursor(r.left + r.width / 2, r.top + r.height / 2);
        el.focus();
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await player.wait(350);
      },
      /** A click on the drawing at (x, y) mm. */
      async clickAt(x, y, { shift = false } = {}) {
        const p = api.worldToClient({ x, y });
        await player.moveCursor(p.x, p.y);
        player.ripple(p.x, p.y);
        api.pointer('pointermove', p, { shift });
        api.pointer('pointerdown', p, { shift });
        api.pointer('pointerup', p, { shift });
        await player.wait(220);
      },
      async clicks(points) { for (const [x, y] of points) await ctx.clickAt(x, y); },
      /** Drags on the drawing from one point to another (mm). */
      async drag(from, to, { steps = 8 } = {}) {
        const a = api.worldToClient(from);
        const b = api.worldToClient(to);
        await player.moveCursor(a.x, a.y);
        api.pointer('pointermove', a);
        api.pointer('pointerdown', a);
        for (let i = 1; i <= steps; i++) {
          const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
          api.pointer('pointermove', p, { buttons: 1 });
          if (!player.instant) { player.cursor.style.transition = 'none'; player.cursor.style.transform = `translate(${p.x}px, ${p.y}px)`; player.cursorAt = p; await sleep(30 / player.speed); }
        }
        api.pointer('pointerup', b);
        await player.wait(250);
      },
      /** Shows a box of the drawing (mm) in the canvas. */
      view(box) { api.view(box); },
      /** Opens a dialog window, shows it a moment, closes it; then applies its result through the app. */
      async dialog(kind, open, apply = null, ms = 1600) {
        // Watching: the window opens for a moment; instant runs (tests, skip) only apply the result.
        if (!player.instant) {
          open();
          await player.wait(ms);
          api.closePopup(kind);
          await player.wait(200);
        }
        return apply ? apply() : undefined;
      },
      /** Opens a menu (or one of its submenus) for a moment so its commands can be seen; tests skip it. */
      async menu(name, path = [], ms = 2600) {
        if (player.instant) return;
        api.showMenuGroup(name, path);
        await player.wait(ms);
        api.closeMenu();
        await player.wait(250);
      },
      select(ids) { api.select(ids); },
      async fresh(title = null) {
        await api.newDrawing(title);
        api.view({ minX: -10, minY: -10, maxX: 170, maxY: 110 });
        await player.wait(300);
      },
    };
    return ctx;
  }

  // ───────────────────────── for tests

  /** Runs every step of the given lessons instantly. Returns [{ lesson, step, ok, error }]. */
  async runAll({ from = 0, to = this.lessons.length - 1 } = {}) {
    this.build();
    this.useBaseline();
    const instant = this.instant;
    this.instant = true;
    const report = [];
    for (let li = from; li <= to; li++) {
      this.li = li;
      if (li === from && !this.lessons[li].fresh) await this.ensureReady();
      for (let si = 0; si < this.lessons[li].steps.length; si++) {
        this.si = si;
        try { await this.lessons[li].steps[si].run(this.ctx()); report.push({ lesson: li + 1, step: si + 1, ok: true }); } catch (error) {
          report.push({ lesson: li + 1, step: si + 1, ok: false, error: String(error?.message ?? error) });
        }
      }
      this.completed = li;
    }
    this.instant = instant;
    return report;
  }

  /** For every step: does practice recognise it when the step is done? [{ lesson, step, run, check }] */
  async verifyPractice({ from = 0, to = this.lessons.length - 1 } = {}) {
    this.build();
    this.useBaseline();
    const instant = this.instant;
    this.instant = true;
    const report = [];
    for (let li = from; li <= to; li++) {
      this.li = li;
      if (li === from && !this.lessons[li].fresh) await this.ensureReady();
      for (let si = 0; si < this.lessons[li].steps.length; si++) {
        this.si = si;
        const step = this.lessons[li].steps[si];
        const mem = { start: this.snapshot() };
        let seen = false;
        const ctx = this.ctx();
        try { step.practice?.setup?.(ctx, mem); } catch { /* ignore */ }
        const probe = () => { try { if (step.practice?.check?.(this.ctx(), mem)) seen = true; } catch { /* not yet */ } };
        const observer = new MutationObserver(probe);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        let ran = true;
        let error = null;
        try { await step.run(ctx); } catch (e) { ran = false; error = String(e?.message ?? e); }
        probe();
        observer.disconnect();
        report.push({ lesson: li + 1, step: si + 1, run: ran, check: step.practice?.check ? seen : 'info', ...(error ? { error } : {}) });
      }
      this.completed = li;
    }
    this.instant = instant;
    return report;
  }
}
