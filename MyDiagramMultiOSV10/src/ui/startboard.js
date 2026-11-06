// The start page's cards on their board: move a card by its ⠿ handle or its heading,
// resize it by the triangle of dots at its bottom-right corner (double-click: fit the
// contents), Alt+arrows on the handle move it, Alt+Shift+arrows resize it. The
// arithmetic is in startlayout.js; this file applies it to the DOM and keeps the result
// in settings.startLayout. The start page is drawn anew on many changes, so mount() is
// called after each drawing and takes over from the previous board.
import { COLS, ROW, GAP, boxOf, cellAt, compact, layoutValue, pack, place, rowsFor, spanFor, swapVertical, clampCard, resolve } from './startlayout.js';

// Default arrangement: the column of each card, and the rows of those with a fixed height.
const DEFAULT_COLUMNS = { hero: 0, templates: 0, recent: 1, folders: 1, help: 1, samples: 2, background: 2 };
const DEFAULT_WIDTH = { hero: COLS };
const DEFAULT_ROWS = { samples: 11 };
const FALLBACK_ROWS = 8;

const measured = {};
let current = null;

/** The default positions of the cards `ids`: each in its column, one below the other. */
export function defaultCards(ids, rows = measured) {
  const cards = {};
  const top = new Array(COLS).fill(0);
  for (const id of ids) {
    const w = DEFAULT_WIDTH[id] ?? 1;
    const col = DEFAULT_COLUMNS[id] ?? 0;
    const row = Math.max(...top.slice(col, col + w));
    const h = DEFAULT_ROWS[id] ?? rows[id] ?? FALLBACK_ROWS;
    cards[id] = { col, row, w, h, fit: !DEFAULT_ROWS[id] };
    for (let c = col; c < col + w; c += 1) top[c] = row + h;
  }
  return cards;
}

/** The cards from a saved layout; a card that is new (or shown again) goes below the others. */
export function cardsFrom(saved, ids, rows = measured) {
  if (saved?.version !== 2 || !saved.cards) return compact(defaultCards(ids, rows));
  const cards = {};
  for (const id of ids) if (saved.cards[id]) cards[id] = clampCard(saved.cards[id]);
  const fresh = defaultCards(ids, rows);
  let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
  for (const id of ids) {
    if (cards[id]) continue;
    cards[id] = { ...fresh[id], row: bottom };
    bottom += cards[id].h;
  }
  for (const id of Object.keys(cards)) if (cards[id].fit && rows[id]) cards[id] = { ...cards[id], h: rows[id] };
  return compact(resolve(cards, null));
}

class Board {
  constructor(board, scroll, { layout, saveLayout }) {
    this.board = board;
    this.scroll = scroll;
    this.layout = layout;
    this.saveLayout = saveLayout;
    this.drag = null;
    this.burst = { at: 0, n: 0 };
    this.cards = new Map([...board.querySelectorAll(':scope > .start-card')].map((el) => [el.dataset.card, el]));
    this.outline = document.createElement('div');
    this.outline.className = 'card-drop-outline';
    this.outline.setAttribute('aria-hidden', 'true');
    board.append(this.outline);
    board.classList.add('no-anim');
    this.apply(this.saved());
    this.measure();
    this.abort = new AbortController();
    const { signal } = this.abort;
    board.addEventListener('pointerdown', (event) => this.onPointerDown(event), { signal });
    board.addEventListener('dblclick', (event) => {
      const grip = event.target.closest?.('[data-card-grip]');
      if (grip) this.commit(place(this.saved(), grip.closest('.start-card').dataset.card, { fit: true }));
    }, { signal });
    board.addEventListener('keydown', (event) => this.onKey(event), { signal });
    this.watch();
    requestAnimationFrame(() => requestAnimationFrame(() => board.classList.remove('no-anim')));
  }

  destroy() {
    this.ro?.disconnect();
    this.abort.abort();
    this.endDrag?.();
  }

  saved() { return cardsFrom(this.layout(), [...this.cards.keys()]); }

  // Puts every card (but `skip`, the one under the pointer) at its cell; CSS transitions make it glide.
  apply(cards, skip = null) {
    const width = this.board.clientWidth || 1000;
    let bottom = 0;
    for (const [id, el] of this.cards) {
      const c = cards[id];
      if (!c) continue;
      bottom = Math.max(bottom, c.row + c.h);
      el.classList.toggle('fit', Boolean(c.fit));
      el.classList.toggle('fixed-height', !c.fit);
      if (id === skip) continue;
      const box = boxOf(c, width);
      el.style.transform = `translate(${box.x}px, ${box.y}px)`;
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
    }
    this.board.style.height = `${bottom * ROW}px`;
    this.shown = cards;
  }

  showOutline(c) {
    if (!c) { this.outline.classList.remove('on'); return; }
    const box = boxOf(c, this.board.clientWidth || 1000);
    this.outline.style.transform = `translate(${box.x}px, ${box.y}px)`;
    this.outline.style.width = `${box.w}px`;
    this.outline.style.height = `${box.h}px`;
    this.outline.classList.add('on');
  }

  commit(cards) {
    // A card hidden in the settings keeps its place for when it comes back.
    const previous = this.layout()?.cards ?? {};
    const value = layoutValue(compact(cards));
    this.saveLayout({ version: 2, cards: { ...previous, ...value.cards } });
    this.apply(this.saved());
  }

  /** Automatic arrangement: each card goes to the shortest column, at the height of its contents. */
  arrange() {
    this.commit(compact(pack([...this.cards.keys()], (id) => DEFAULT_WIDTH[id] ?? 1, (id) => ({ h: DEFAULT_ROWS[id] ?? measured[id] ?? FALLBACK_ROWS, fit: !DEFAULT_ROWS[id] }))));
  }

  // A fit card's height follows its contents, in rows. Growing always applies; shrinking by
  // one row is ignored, so a card whose height depends on its width cannot flip forever.
  measure() {
    if (this.drag) return;
    const now = performance.now();
    if (now - this.burst.at > 1000) this.burst = { at: now, n: 0 };
    if (this.burst.n > 12) return;
    let changed = false;
    for (const [id, el] of this.cards) {
      const body = el.querySelector(':scope > .card-body');
      const head = el.querySelector(':scope > .card-head');
      const style = getComputedStyle(el);
      const content = el.classList.contains('fit') ? body.offsetHeight : body.scrollHeight;
      const need = (head ? head.offsetHeight + parseFloat(getComputedStyle(head).marginBottom || 0) : 0) + content + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
      const rows = rowsFor(need);
      const old = measured[id];
      if (old === undefined || rows > old || old - rows > 1) { measured[id] = rows; changed = true; }
    }
    if (changed) { this.burst.n += 1; this.apply(this.saved()); }
  }

  watch() {
    if (typeof ResizeObserver === 'undefined') return;
    let width = 0;
    this.ro = new ResizeObserver(() => {
      const w = this.board.clientWidth;
      if (w && w !== width) {
        const first = !width;
        width = w;
        if (!first) { // A new window width: the cards follow at once, without gliding.
          this.board.classList.add('no-anim');
          this.apply(this.shown ?? this.saved(), this.drag?.id);
          clearTimeout(this.noAnimTimer);
          this.noAnimTimer = setTimeout(() => this.board.classList.remove('no-anim'), 120);
        }
      }
      this.measure();
    });
    this.ro.observe(this.board);
    for (const el of this.cards.values()) {
      const body = el.querySelector('.card-body');
      this.ro.observe(body);
      if (body.firstElementChild) this.ro.observe(body.firstElementChild);
    }
  }

  autoScroll(event) {
    const box = this.scroll.getBoundingClientRect();
    if (event.clientY > box.bottom - 40) this.scroll.scrollTop += 14;
    else if (event.clientY < box.top + 40) this.scroll.scrollTop -= 14;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const grip = event.target.closest('[data-card-grip]');
    if (grip) { this.startResize(event, grip.closest('.start-card').dataset.card); return; }
    // The handle, or the heading outside its buttons.
    const handle = event.target.closest('.card-handle') ?? (event.target.closest('button, a, input, select, label') ? null : event.target.closest('.card-head'));
    if (handle) this.startMove(event, handle.closest('.start-card').dataset.card);
  }

  track(event, id, cssClass, move, finish) {
    event.preventDefault();
    const el = this.cards.get(id);
    this.drag = { id };
    el.classList.add(cssClass);
    const { signal } = this.abort;
    const stop = new AbortController();
    const end = (done) => {
      stop.abort();
      this.drag = null;
      this.endDrag = null;
      el.classList.remove(cssClass);
      this.showOutline(null);
      finish(done);
    };
    this.endDrag = () => end(false);
    const options = { signal: AbortSignal.any([signal, stop.signal]) };
    window.addEventListener('pointermove', move, options);
    window.addEventListener('pointerup', () => end(true), options);
    window.addEventListener('pointercancel', () => end(false), options);
  }

  // The card follows the pointer; the others make room as it goes.
  startMove(event, id) {
    const el = this.cards.get(id);
    const saved = this.saved();
    const c = saved[id];
    const width = this.board.clientWidth;
    const start = boxOf(c, width);
    const sx = event.clientX; const sy = event.clientY; const top = this.scroll.scrollTop;
    let target = { col: c.col, row: c.row };
    let pending = saved;
    this.showOutline(c);
    this.track(event, id, 'dragging', (ev) => {
      this.autoScroll(ev);
      const x = Math.max(0, Math.min(width - start.w, start.x + ev.clientX - sx));
      const y = Math.max(0, start.y + ev.clientY - sy + this.scroll.scrollTop - top);
      el.style.transform = `translate(${x}px, ${y}px) scale(1.01)`;
      const next = cellAt(x, y, c.w, width);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        pending = place(saved, id, target);
        this.apply(pending, id);
        this.showOutline(pending[id]);
      }
    }, (done) => {
      if (done && (target.col !== c.col || target.row !== c.row)) this.commit(pending);
      else this.apply(this.saved());
    });
  }

  // The size follows the pointer and snaps to whole cells when let go.
  startResize(event, id) {
    event.stopPropagation();
    const el = this.cards.get(id);
    const saved = this.saved();
    const c = saved[id];
    const width = this.board.clientWidth;
    const start = boxOf(c, width);
    const colW = (width - GAP * (COLS - 1)) / COLS;
    const maxW = boxOf({ col: c.col, row: 0, w: COLS - c.col, h: 1 }, width).w;
    const sx = event.clientX; const sy = event.clientY; const top = this.scroll.scrollTop;
    let target = { w: c.w, h: c.h };
    let pending = saved;
    this.showOutline(c);
    this.track(event, id, 'resizing', (ev) => {
      this.autoScroll(ev);
      const w = Math.max(colW, Math.min(maxW, start.w + ev.clientX - sx));
      const h = Math.max(4 * ROW - GAP, start.h + ev.clientY - sy + this.scroll.scrollTop - top);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const next = spanFor(w, h, c.col, width);
      if (next.w !== target.w || next.h !== target.h) {
        target = next;
        pending = place(saved, id, { ...target, fit: false });
        this.apply(pending, id);
        this.showOutline(pending[id]);
      }
    }, (done) => {
      if (done && (target.w !== c.w || target.h !== c.h)) this.commit(pending);
      else this.apply(this.saved());
    });
  }

  onKey(event) {
    const handle = event.target.closest?.('.card-handle');
    if (!handle || !event.altKey || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const id = handle.closest('.start-card').dataset.card;
    const saved = this.saved();
    const c = { ...saved[id] };
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (event.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) { c.h = Math.max(4, c.h + dy); c.fit = false; }
      this.commit(place(saved, id, c));
    } else if (dy) {
      this.commit(swapVertical(saved, id, dy)); // A plain move up or down would compact back.
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
      this.commit(place(saved, id, c));
    }
  }
}

/** The start page's "auto arrange" button. */
export const arrangeStartBoard = () => current?.arrange();

/** Takes over the start page's board after it was drawn. */
export function mountStartBoard(host, options) {
  current?.destroy();
  current = null;
  const board = host.querySelector('.start-board');
  if (board) current = new Board(board, host.querySelector('.start-scroll'), options);
  return current;
}
