// The guided tour. Renders nothing until started; then, in a portal on
// document.body, an outline round the step's target and a card at the bottom
// right (draggable by its head) with the step text, a chapter list, ⏮ (from
// the beginning), ◀ previous, ▶ / ⏸ auto play, next ▶ and "n / N".
// Keys: → / Space next, ← previous, Esc closes. Progress is kept in
// localStorage['mcc.tutorial'] and reported through onProgress when the tour
// stops (App saves it as settings.tutorial).
//
// Each step's `action` ops (src/lib/tutorialSteps.js) drive the real app
// through window.__mcc (action, openMenu, openGuide), so a step looks the same
// whatever state the window was in. The engine is exposed as
// window.__mcc.tutorial = { start, stop, next, prev, go, state, steps, chapters }.
import React, { useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getLanguage, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { onBroadcast } from '../lib/popups';
import { Icon, CloseButton } from './Chrome';
import { dragGhost } from '../lib/dragGhost';
import { STEPS, CHAPTERS, chapterName, stepText, dwellOf } from '../lib/tutorialSteps';
import '../tutorial.css';

const STORE = 'mcc.tutorial';
const L = {
  ko: { title: '튜토리얼', close: '튜토리얼 닫기 (Esc)', restart: '처음부터', prev: '이전', next: '다음', done: '완료', play: '자동 재생', pause: '일시 정지', chapters: '장 목록', drag: '끌어서 옮기기', missing: '이 단계가 가리키는 화면 요소가 지금 창에 없습니다. 설명만 읽고 다음으로 넘어가세요.', steps: '단계' },
  en: { title: 'Tutorial', close: 'Close the tutorial (Esc)', restart: 'From the beginning', prev: 'Previous', next: 'Next', done: 'Done', play: 'Auto play', pause: 'Pause', chapters: 'Chapters', drag: 'Drag to move', missing: 'The part of the window this step is about is not on screen now. Read the text and go on.', steps: 'steps' },
};
const tr = () => L[getLanguage() === 'en' ? 'en' : 'ko'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mcc = () => {
  if (!window.__mcc) window.__mcc = {};
  return window.__mcc;
};
// The tour's own layer is never a target (the guide window may be one).
const ours = (el) => !!(el && el.closest && el.closest('.mcc-tour-layer'));
const visible = (el) => {
  if (!el || ours(el)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
/** The first selector of the list with an element on screen. */
function findTarget(selectors) {
  for (const sel of selectors || []) {
    let list = [];
    try { list = Array.from(document.querySelectorAll(sel)); } catch { /* bad selector */ }
    const el = list.find(visible);
    if (el) return el;
  }
  return null;
}
function firstMatch(selector) {
  try { return Array.from(document.querySelectorAll(selector)).find(visible) || null; } catch { return null; }
}
async function waitFor(check, timeout = 10000, every = 120) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await check()) return true; } catch { /* keep waiting */ }
    await sleep(every);
  }
  return false;
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
function saveProgress(p) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...p, at: new Date().toISOString() })); } catch { /* storage blocked */ }
}

const BOTTOM_ORDER = ['problems', 'log', 'jobs', 'output'];
const PANEL_SEL = {
  left: { on: '[data-tour="nav"], .dock.dock-left', strip: '.dock-strip.dock-left' },
  right: { on: '[data-tour="right-panel"], .dock.dock-right', strip: '.dock-strip.dock-right' },
  bottom: { on: '[data-tour="bottom-panel"], .bottom-panel', strip: '.bottom-panel.folded' },
};

/** The tour engine (one per page). React only draws what it says. */
class Engine {
  constructor() {
    this.active = false;
    this.index = 0;
    this.busy = false;
    this.autoplay = false;
    this.missing = false;
    this.timer = null;
    this.run = 0;
    this.listeners = new Set();
    this.projectReady = false;
    this.opened = [];
    this.onProgress = null;
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  state() {
    const step = STEPS[this.index];
    return { active: this.active, index: this.index, busy: this.busy, autoplay: this.autoplay, total: STEPS.length, chapter: step && step.chapter, id: step && step.id, missing: this.missing };
  }

  start({ index, autoplay = false } = {}) {
    let at = index;
    if (at == null) {
      const saved = loadProgress();
      at = saved && !saved.done && Number.isFinite(saved.index) ? saved.index : 0;
    }
    this.autoplay = !!autoplay;
    // Anything waiting for the tour (the welcome dialog) steps aside.
    window.dispatchEvent(new CustomEvent('mcc-tour-start'));
    if (!this.active) {
      this.active = true;
      this.wasOnStart = this.onStart();
      this.opened = [];
      this.projectReady = false;
    }
    return this.go(at);
  }

  async stop() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.run += 1;
    const done = this.index >= STEPS.length - 1;
    this.active = false;
    this.autoplay = false;
    this.busy = false;
    this.emit();
    saveProgress({ index: this.index, done });
    try { if (this.onProgress) this.onProgress({ index: this.index, done }); } catch { /* the app saves it */ }
    await this.closeAll();
    if (mcc().closeGuide) mcc().closeGuide();
    // Put back what the tour switched on.
    for (const side of this.opened) this.act(`panel:${side}`);
    this.opened = [];
    if (this.wasOnStart && !this.onStart()) this.act('showStart');
  }

  next() {
    if (this.index < STEPS.length - 1) return this.go(this.index + 1);
    return this.stop();
  }

  prev() {
    if (this.index > 0) return this.go(this.index - 1);
    return undefined;
  }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    clearTimeout(this.timer);
    if (this.autoplay && !this.busy) this.schedule();
    this.emit();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.autoplay || !this.active) return;
    if (this.index >= STEPS.length - 1) { this.autoplay = false; this.emit(); return; }
    const step = STEPS[this.index];
    this.timer = setTimeout(() => { if (this.active && this.autoplay && !this.busy) this.next(); }, dwellOf(step, getLanguage()));
  }

  async go(index) {
    clearTimeout(this.timer);
    const run = ++this.run;
    this.index = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
    const step = STEPS[this.index];
    this.busy = true;
    this.missing = false;
    this.emit();
    saveProgress({ index: this.index, done: false });
    try {
      await this.closeAll();
      if (!(step.action || []).includes('guide') && mcc().closeGuide) mcc().closeGuide();
      for (const op of step.action || []) {
        if (run !== this.run) return;
        await this.op(op);
      }
    } catch (err) {
      console.warn('tutorial step', step.id, err);
    }
    await sleep(250);
    if (run !== this.run || !this.active) return;
    const el = findTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.missing = !el;
    this.busy = false;
    this.emit();
    this.schedule();
  }

  // ── ops ────────────────────────────────────────────
  act(id) { const a = mcc().action; if (typeof a === 'function') a(id); else window.dispatchEvent(new CustomEvent('mcc-action', { detail: id })); }

  onStart() { return !!firstMatch('[data-tour="start-page"], .start-page'); }

  async closeAll() {
    // Menus close on a window click; dialogs on Escape or their close button.
    window.dispatchEvent(new MouseEvent('click'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    for (const btn of document.querySelectorAll('.dialog .close-x, [role="dialog"] .close-x')) {
      if (!ours(btn)) btn.click();
    }
    await sleep(120);
  }

  async ensureProject() {
    if (!this.projectReady) {
      const hasResult = async () => {
        const ws = await call('workspace.load', { slim: true });
        const p = (ws.projects || []).find((x) => x.id === ws.activeProjectId);
        return !!(p && p.branches && Object.values(p.branches).some((b) => b && b.latest));
      };
      if (!(await hasResult().catch(() => false))) {
        this.act('openSample');
        await waitFor(hasResult, 180000, 600);
      }
      await waitFor(() => !document.querySelector('.tb-busy'), 60000);
      this.projectReady = true;
    }
    if (this.onStart()) { this.act('view:overview'); await sleep(250); }
  }

  async ensurePanel(side) {
    const sel = PANEL_SEL[side];
    if (!sel) return;
    const strip = firstMatch(sel.strip);
    if (strip) {
      const open = side === 'bottom' ? strip.querySelector('.bp-tab') : (strip.querySelector('.strip-open') || strip);
      if (open) open.click();
      await sleep(200);
      return;
    }
    if (firstMatch(sel.on)) return;
    this.act(`panel:${side}`);
    this.opened.push(side);
    await sleep(250);
  }

  async op(raw) {
    const op = String(raw);
    const i = op.indexOf(':');
    const name = i < 0 ? op : op.slice(0, i);
    const arg = i < 0 ? '' : op.slice(i + 1);
    switch (name) {
      case 'start':
        if (!this.onStart()) { this.act('showStart'); await waitFor(() => this.onStart(), 3000); }
        await sleep(200);
        break;
      case 'project': await this.ensureProject(); break;
      case 'view': this.act(`view:${arg}`); await sleep(300); break;
      case 'act': this.act(arg); await sleep(300); break;
      case 'menu': if (mcc().openMenu) mcc().openMenu(arg); await sleep(250); break;
      case 'panel': await this.ensurePanel(arg); break;
      case 'bottom': {
        await this.ensurePanel('bottom');
        const tab = firstMatch(`[data-tour="bottom-tab-${arg}"]`) || document.querySelectorAll('.bp-tab')[BOTTOM_ORDER.indexOf(arg)];
        if (tab && !tab.classList.contains('on')) tab.click();
        await sleep(200);
        break;
      }
      case 'click': { const el = firstMatch(arg); if (el) { el.click(); await sleep(300); } break; }
      case 'scroll': { const el = firstMatch(arg); if (el) { el.scrollIntoView({ block: 'center' }); await sleep(300); } break; }
      case 'wait': await sleep(Number(arg) || 300); break;
      case 'fill-source': {
        // Types a sample's folder into the new-project dialog's source box.
        const input = firstMatch('[data-tour="new-project-source"] input');
        const list = await call('samples.list').catch(() => []);
        const sample = list.find((s) => s.id === arg) || list[0];
        if (input && sample) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, sample.path);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(300);
        }
        break;
      }
      case 'guide': if (mcc().openGuide) { mcc().openGuide('guide'); await sleep(600); } break;
      case 'close-guide': if (mcc().closeGuide) mcc().closeGuide(); break;
      default: break;
    }
  }
}

let engine = null;
export function tutorialEngine() {
  if (!engine) engine = new Engine();
  return engine;
}

/** The step's target rectangle, followed while the layout moves. */
function useTargetRect(active, step, busy) {
  const [, tick] = useReducer((n) => n + 1, 0);
  const rect = useRef(null);
  useEffect(() => {
    if (!active || !step) return undefined;
    const measure = () => {
      const el = busy ? null : findTarget(step.target);
      const r = el ? el.getBoundingClientRect() : null;
      const prev = rect.current;
      const same = (!r && !prev) || (r && prev && Math.abs(r.left - prev.left) < 1 && Math.abs(r.top - prev.top) < 1 && Math.abs(r.width - prev.width) < 1 && Math.abs(r.height - prev.height) < 1);
      if (!same) { rect.current = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; tick(); }
    };
    measure();
    const iv = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [active, step, busy]);
  return rect.current;
}

export function Tutorial({ onProgress }) {
  useLanguage();
  const eng = tutorialEngine();
  const [, render] = useReducer((n) => n + 1, 0);
  // A card the user dragged stays put until the next chapter: { chapter, right, bottom }.
  const [dragged, setDragged] = React.useState(null);
  // While dragging the card: where it will land ({ right, bottom, width, height }).
  const [cardDrag, setCardDrag] = React.useState(null);
  const cardRef = useRef(null);
  const [chaptersOpen, setChaptersOpen] = React.useState(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    eng.listeners.add(render);
    eng.onProgress = (p) => progressRef.current && progressRef.current(p);
    const api = {
      start: (opts) => eng.start(opts || {}),
      stop: () => eng.stop(),
      next: () => eng.next(),
      prev: () => eng.prev(),
      go: (i) => eng.go(i),
      state: () => eng.state(),
      steps: STEPS,
      chapters: CHAPTERS,
    };
    mcc().tutorial = api;
    let off = null;
    let gone = false;
    onBroadcast('mcc-tutorial-start', (p) => eng.start(p || {})).then((fn) => { if (gone) fn(); else off = fn; }).catch(() => {});
    return () => {
      eng.listeners.delete(render);
      gone = true;
      if (off) off();
      if (mcc().tutorial === api) delete mcc().tutorial;
    };
  }, [eng]);

  // Keys while the tour is on (only real key presses: the engine sends Escape to close dialogs).
  useEffect(() => {
    if (!eng.active) return undefined;
    const onKey = (e) => {
      if (!e.isTrusted) return;
      const typing = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); eng.stop(); return; }
      if (typing) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!eng.busy) eng.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (!eng.busy) eng.prev(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const step = STEPS[eng.index];
  const rect = useTargetRect(eng.active, step, eng.busy);
  if (!eng.active || !step) return null;

  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const s = tr();
  const text = stepText(step, lang);
  const inChapter = STEPS.filter((x) => x.chapter === step.chapter);
  const last = eng.index === STEPS.length - 1;
  const centred = eng.missing && !eng.busy;

  let outline = null;
  if (rect) {
    const M = 3;
    const clamp = (v, max) => Math.min(Math.max(v, M), max - M);
    const left = clamp(rect.left - 4, window.innerWidth);
    const top = clamp(rect.top - 4, window.innerHeight);
    const right = clamp(rect.left + rect.width + 4, window.innerWidth);
    const bottom = clamp(rect.top + rect.height + 4, window.innerHeight);
    outline = <div className="mcc-tour-outline" data-testid="tour-outline" style={{ left, top, width: Math.max(12, right - left), height: Math.max(12, bottom - top) }} />;
  }

  // The card goes to the first corner (bottom-right, bottom-left, top-right,
  // top-left) whose rectangle stays 16 px clear of the target; when every
  // corner would cover it, bottom-right and see-through until hovered.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = (cardRef.current && cardRef.current.offsetWidth) || Math.min(460, vw - 24);
  const ch = (cardRef.current && cardRef.current.offsetHeight) || 260;
  const corners = [
    { style: { right: 18, bottom: 40 }, box: { left: vw - 18 - cw, top: vh - 40 - ch } },
    { style: { left: 18, bottom: 40 }, box: { left: 18, top: vh - 40 - ch } },
    { style: { right: 18, top: 72 }, box: { left: vw - 18 - cw, top: 72 } },
    { style: { left: 18, top: 72 }, box: { left: 18, top: 72 } },
  ];
  const clear = (c) => {
    if (!rect) return true;
    const m = 16;
    return c.box.left + cw <= rect.left - m || c.box.left >= rect.left + rect.width + m || c.box.top + ch <= rect.top - m || c.box.top >= rect.top + rect.height + m;
  };
  const free = corners.find(clear);
  const manual = dragged && dragged.chapter === step.chapter ? dragged : null;
  const placed = manual ? { right: manual.right, bottom: manual.bottom } : (free || corners[0]).style;
  const seeThrough = !manual && !free && !!rect;
  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const box = cardRef.current ? cardRef.current.getBoundingClientRect() : { right: vw - 18, bottom: vh - 40, width: 460, height: 300 };
    const from = { x: e.clientX, y: e.clientY, right: vw - box.right, bottom: vh - box.bottom };
    // A silhouette follows the pointer, a dashed outline shows where the card
    // lands, and the card itself stays dimmed in place until the drop.
    const g = cardRef.current ? dragGhost(cardRef.current, e) : null;
    let to = null;
    const at = (ev) => ({
      // The whole card stays inside the window.
      right: Math.max(0, Math.min(window.innerWidth - box.width, from.right - (ev.clientX - from.x))),
      bottom: Math.max(0, Math.min(window.innerHeight - box.height, from.bottom - (ev.clientY - from.y))),
    });
    const move = (ev) => {
      if (g) g.move(ev);
      to = at(ev);
      setCardDrag({ right: to.right, bottom: to.bottom, width: box.width, height: box.height });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (g) g.destroy();
      setCardDrag(null);
      if (to && ev.type === 'pointerup') setDragged({ chapter: step.chapter, ...to });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const cardStyle = centred ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } : placed;

  return createPortal(
    <div className="mcc-tour-layer" onClick={(e) => e.stopPropagation()}>
      {outline}
      {cardDrag && <div className="mcc-tour-drop" aria-hidden="true" style={{ right: cardDrag.right, bottom: cardDrag.bottom, width: cardDrag.width, height: cardDrag.height }} />}
      <div ref={cardRef} className={`mcc-tour-card ${centred ? 'centred' : ''} ${seeThrough ? 'see-through' : ''} ${cardDrag ? 'drag-origin' : ''}`} role="dialog" aria-label={s.title} data-testid="tour-card" data-tour-card="1" style={cardStyle}>
        <div className="mcc-tour-head" onPointerDown={startDrag} title={s.drag}>
          <Icon name="graduation" size={16} />
          <b>{s.title}</b>
          <span className="mcc-tour-chapter">{chapterName(step.chapter, lang)} · {inChapter.indexOf(step) + 1}/{inChapter.length}</span>
          <span className="mcc-tour-grow" />
          <CloseButton className="mcc-tour-x" title={s.close} aria-label={s.close} data-testid="tour-stop" onClick={() => eng.stop()} size={14} />
        </div>
        <div className="mcc-tour-progress"><i style={{ width: `${((eng.index + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="mcc-tour-body">
          <h3 data-testid="tour-title">{text.title}</h3>
          <p>{text.body}</p>
          {centred && <p className="mcc-tour-missing"><Icon name="info" size={13} />{s.missing}</p>}
        </div>
        <div className="mcc-tour-foot">
          <div className="mcc-tour-chapters">
            <button type="button" className="mcc-tour-select" title={s.chapters} aria-haspopup="listbox" aria-expanded={chaptersOpen} data-testid="tour-chapter"
              onClick={() => setChaptersOpen((v) => !v)}>
              <Icon name="list" size={13} /><span>{chapterName(step.chapter, lang)}</span><Icon name="chevronDown" size={12} />
            </button>
            {chaptersOpen && (
              <ul className="mcc-tour-list" role="listbox" aria-label={s.chapters} onMouseLeave={() => setChaptersOpen(false)}>
                {CHAPTERS.map((c, n) => {
                  const first = STEPS.findIndex((x) => x.chapter === c.id);
                  const count = STEPS.filter((x) => x.chapter === c.id).length;
                  if (first < 0) return null;
                  return (
                    <li key={c.id} role="option" aria-selected={c.id === step.chapter} className={c.id === step.chapter ? 'on' : ''}
                      onClick={() => { setChaptersOpen(false); eng.go(first); }}>
                      <span className="n">{n + 1}</span><span className="name">{lang === 'en' ? c.en : c.ko}</span><span className="c">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <span className="mcc-tour-count" data-testid="tour-count">{eng.index + 1} / {STEPS.length}{eng.busy ? ' …' : ''}</span>
          <span className="mcc-tour-grow" />
          <button type="button" className="mcc-tour-btn" title={s.restart} aria-label={s.restart} data-testid="tour-restart" disabled={eng.index === 0} onClick={() => eng.go(0)}>⏮</button>
          <button type="button" className="mcc-tour-btn" title={s.prev} aria-label={s.prev} data-testid="tour-prev" disabled={eng.index === 0} onClick={() => eng.prev()}>◀ {s.prev}</button>
          <button type="button" className={`mcc-tour-btn ${eng.autoplay ? 'on' : ''}`} title={eng.autoplay ? s.pause : s.play} aria-label={eng.autoplay ? s.pause : s.play} aria-pressed={eng.autoplay} data-testid="tour-play" onClick={() => eng.toggleAutoplay()}>{eng.autoplay ? '⏸' : '▶'}</button>
          <button type="button" className="mcc-tour-btn primary" data-testid="tour-next" disabled={eng.busy && !last} onClick={() => eng.next()}>{last ? `${s.done} ✓` : `${s.next} ▶`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mounts <Tutorial/> on its own (scripts and pages that do not render it in App). */
export function mountTutorial(props = {}) {
  if (mcc().tutorial) return mcc().tutorial;
  const host = document.createElement('div');
  host.className = 'mcc-tour-host';
  document.body.appendChild(host);
  createRoot(host).render(<Tutorial {...props} />);
  return null;
}

export default Tutorial;
