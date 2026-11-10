// The start page's cards on screen: each card takes its cell, fit cards take the height of
// their content, the handle moves a card (a see-through copy follows the pointer), the corner
// resizes it, a double click on the corner fits it again. The arrangement goes to the settings.
import { autoArrange, cardsOf, COLS, GAP, layoutValue, compact, place, ROW, rowsFor } from './startlayout.js';

export const START_CARD_SPAN = { actions: 2, recent: 1, background: 3, algorithms: 3 };

/** Starts the board in `host` (a .start-board). onSave(saved layout). Returns { arrange, destroy }. */
export function startBoard(host, { saved, onSave, reduced = false }) {
  const ids = [...host.querySelectorAll(':scope > .start-card')].map((card) => card.dataset.card);
  const cardEl = (id) => host.querySelector(`:scope > .start-card[data-card="${id}"]`);
  let layout = saved;
  let measured = {};
  let pending = null;
  let burst = { at: 0, n: 0 };
  let rects = new Map();

  const current = () => cardsOf(layout, ids, START_CARD_SPAN, measured);

  /** Applies the cells; the other cards slide to their new places rather than jumping. */
  function paint(animate = false) {
    const shown = pending ?? current();
    for (const id of ids) {
      const cell = shown[id];
      const card = cardEl(id);
      card.style.gridColumn = `${cell.col + 1} / span ${cell.w}`;
      card.style.gridRow = `${cell.row + 1} / span ${cell.h}`;
      card.style.height = cell.fit ? '' : `${cell.h * ROW - GAP}px`;
      card.classList.toggle('fit', cell.fit);
      card.classList.toggle('fixed-height', !cell.fit);
    }
    const now = new Map();
    for (const id of ids) {
      const card = cardEl(id);
      const rect = card.getBoundingClientRect();
      now.set(id, rect);
      const old = rects.get(id);
      if (!animate || !old || reduced || card.classList.contains('drag-origin') || !card.animate) continue;
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    rects = now;
  }

  /** Fit cards take the height of their content, measured in rows. */
  function measure() {
    const next = {};
    for (const card of host.querySelectorAll(':scope > .start-card.fit')) next[card.dataset.card] = rowsFor(card.offsetHeight);
    // Growing always applies; shrinking by a single row does not, so a card whose height
    // depends on where compaction put it cannot flip between two heights.
    const time = performance.now();
    if (time - burst.at > 1000) burst = { at: time, n: 0 };
    if (burst.n > 12) return;
    const changed = Object.keys(next).filter((key) => measured[key] === undefined || next[key] > measured[key] || measured[key] - next[key] > 1);
    if (!changed.length) return;
    burst.n += 1;
    for (const key of changed) measured[key] = next[key];
    paint();
    measure();
  }

  const save = (cards) => { layout = layoutValue(compact(cards)); pending = null; paint(true); measure(); onSave(layout); };

  const columnWidth = () => (host.getBoundingClientRect().width - GAP * (COLS - 1)) / COLS;
  const cellAt = (x, y, w) => {
    const rect = host.getBoundingClientRect();
    const size = columnWidth();
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - rect.left) / (size + GAP)))), row: Math.max(0, Math.round((y - rect.top) / ROW)) };
  };
  const autoScroll = (event) => {
    const scroller = host.closest('.start-scroll');
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (event.clientY > rect.bottom - 36) scroller.scrollTop += 14;
    else if (event.clientY < rect.top + 36) scroller.scrollTop -= 14;
  };
  const follow = (move, done) => {
    const up = (event) => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', up);
      globalThis.removeEventListener('pointercancel', up);
      done(event);
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up);
    globalThis.addEventListener('pointercancel', up);
  };
  const outline = () => {
    const element = document.createElement('div');
    element.className = 'card-drop-outline';
    element.setAttribute('aria-hidden', 'true');
    host.appendChild(element);
    return element;
  };

  function startMove(event, id) {
    event.preventDefault();
    const card = cardEl(id);
    const rect = card.getBoundingClientRect();
    const offX = event.clientX - rect.left;
    const offY = event.clientY - rect.top;
    // A see-through copy follows the pointer; its buttons are not buttons.
    const ghost = card.cloneNode(true);
    ghost.classList.add('start-ghost');
    ghost.removeAttribute('data-card');
    ghost.setAttribute('aria-hidden', 'true');
    for (const node of ghost.querySelectorAll('[data-start], [data-card-handle], [data-card-resize]')) { node.removeAttribute('data-start'); node.removeAttribute('data-card-handle'); node.removeAttribute('data-card-resize'); }
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, gridColumn: 'auto', gridRow: 'auto' });
    host.appendChild(ghost);
    const drop = outline();
    const saved0 = current();
    const cell = saved0[id];
    let target = { col: cell.col, row: cell.row };
    let last = { x: event.clientX, y: event.clientY };
    const put = () => {
      const box = host.getBoundingClientRect();
      ghost.style.left = `${last.x - offX - box.left}px`;
      ghost.style.top = `${last.y - offY - box.top}px`;
    };
    const showDrop = () => {
      const shownCell = pending?.[id] ?? cell;
      drop.style.gridColumn = `${shownCell.col + 1} / span ${shownCell.w}`;
      drop.style.gridRow = `${shownCell.row + 1} / span ${shownCell.h}`;
      drop.style.height = `${shownCell.h * ROW - GAP}px`;
    };
    card.classList.add('drag-origin');
    put();
    showDrop();
    follow((moved) => {
      // Scroll first: the ghost is placed against the board, which scrolling moves.
      autoScroll(moved);
      last = { x: moved.clientX, y: moved.clientY };
      put();
      const next = cellAt(last.x - offX, last.y - offY, cell.w);
      if (next.col !== target.col || next.row !== target.row) {
        target = next;
        pending = place(saved0, id, target);
        paint(true);
        showDrop();
      }
    }, (ended) => {
      ghost.remove();
      drop.remove();
      card.classList.remove('drag-origin');
      pending = null;
      if (ended.type === 'pointerup' && (target.col !== cell.col || target.row !== cell.row)) save(place(saved0, id, target));
      else paint(true);
    });
  }

  function startResize(event, id) {
    event.preventDefault();
    event.stopPropagation();
    const card = cardEl(id);
    const rect = card.getBoundingClientRect();
    const size = columnWidth();
    const saved0 = current();
    const cell = saved0[id];
    const startX = event.clientX;
    const startY = event.clientY;
    let target = { w: cell.w, h: cell.h };
    card.classList.add('resizing');
    follow((moved) => {
      autoScroll(moved);
      const w = Math.max(1, Math.min(COLS - cell.col, Math.round((rect.width + moved.clientX - startX + GAP) / (size + GAP))));
      const h = Math.max(4, Math.round((rect.height + moved.clientY - startY + GAP) / ROW));
      if (w !== target.w || h !== target.h) {
        target = { w, h };
        pending = place(saved0, id, { ...target, fit: false });
        paint(true);
      }
    }, (ended) => {
      card.classList.remove('resizing');
      pending = null;
      if (ended.type === 'pointerup' && (target.w !== cell.w || target.h !== cell.h)) save(place(saved0, id, { ...target, fit: false }));
      else paint(true);
    });
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-card-handle]');
    if (handle) return startMove(event, handle.dataset.cardHandle);
    const corner = event.target.closest('[data-card-resize]');
    if (corner) return startResize(event, corner.dataset.cardResize);
    return undefined;
  };
  const onDoubleClick = (event) => {
    const corner = event.target.closest('[data-card-resize]');
    if (corner) save(place(current(), corner.dataset.cardResize, { fit: true }));
  };
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('dblclick', onDoubleClick);
  const observer = globalThis.ResizeObserver ? new ResizeObserver(() => measure()) : null;
  if (observer) { for (const id of ids) observer.observe(cardEl(id)); observer.observe(host); }

  paint();
  measure();

  return {
    /** Puts every card back in the default arrangement. */
    arrange() { save(autoArrange(ids, START_CARD_SPAN, measured)); },
    destroy() {
      observer?.disconnect();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('dblclick', onDoubleClick);
    },
  };
}
