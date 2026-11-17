// Start screen card board — the same board as MyUMLMaker and MyImageViewer:
// three columns, cards snapped to 20 px rows and never overlapping. The handle
// (three lines) moves a card — a see-through copy follows the pointer and the
// others slide aside — the corner resizes it, and a double click on the corner
// fits it to its content again. The arrangement is kept in localStorage.
//
// The layout functions at the top are pure (tested in test/unit/startboard.test.js);
// `card()` and `startBoard()` work on the DOM.

export const COLS = 3;
export const ROW = 20;
export const GAP = 14;
/** Raised when the default arrangement changes: an older saved one starts over once. */
export const LAYOUT_VERSION = 1;
export const LAYOUT_KEY = 'mycapture.startLayout.v1';
/** Columns each card takes in the default arrangement. */
export const SPAN = { hero: 3, begin: 3, recent: 2, tips: 1, themes: 3 };

/** Move handle: three horizontal lines. */
const HANDLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
/** Resize corner: a triangle of dots. */
const GRIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));
export const overlaps = (a, b) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** The program-name card stays full width on the first row. It is not moved or resized. */
const pinHero = (cell) => ({ ...cell, col: 0, row: 0, w: COLS, fit: true });

function pushDown(cell, obstacles) {
  const next = { ...cell };
  for (let guard = 0; guard < 200; guard += 1) {
    const hit = obstacles.filter((p) => overlaps(next, p));
    if (!hit.length) break;
    next.row = Math.max(...hit.map((p) => p.row + p.h));
  }
  return next;
}

function clampCell(value) {
  const c = value || {};
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return { col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w), row: Math.max(0, Math.round(Number(c.row) || 0)), w, h: Math.max(2, Math.round(Number(c.h) || 2)), fit: c.fit !== false };
}

/** Default arrangement: cards fill rows left to right, a row as tall as its tallest card. */
function pack(order, widthOf, heightOf) {
  const out = {};
  let row = 0;
  if (order.includes('hero')) {
    const h = Math.max(2, Math.round(Number(heightOf('hero')) || 2));
    out.hero = { col: 0, row: 0, w: COLS, h, fit: true };
    row = h;
  }
  let col = 0;
  let shelf = [];
  const close = () => {
    if (!shelf.length) return;
    const h = Math.max(...shelf.map((id) => out[id].h));
    for (const id of shelf) out[id].h = h;
    row += h;
    col = 0;
    shelf = [];
  };
  for (const id of order) {
    if (id === 'hero') continue;
    const w = clamp(Math.round(widthOf(id) || 1), 1, COLS);
    const h = Math.max(2, Math.round(Number(heightOf(id)) || 2));
    if (col > 0 && col + w > COLS) close();
    out[id] = { col, row, w, h, fit: true };
    shelf.push(id);
    col += w;
    if (col >= COLS) close();
  }
  close();
  return out;
}

/** Pushes overlapping cards down. The card being moved stays, unless it covers the name card. */
function resolve(cards, pinned) {
  const rest = Object.keys(cards).filter((id) => id !== 'hero').sort((a, b) => (
    a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col
  ));
  const order = cards.hero ? ['hero', ...rest] : rest;
  const placed = [];
  const out = {};
  for (const id of order) {
    let c = { ...cards[id] };
    if (id === 'hero') c = pinHero(c);
    else if (id === pinned) c = pushDown(c, placed.filter((p) => p.fixed));
    else c = pushDown(c, placed);
    placed.push({ ...c, fixed: id === 'hero' });
    out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  }
  return out;
}

/** Moves every card up as far as the cards above it allow. */
export function compact(cards) {
  const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col);
  const placed = [];
  const out = {};
  for (const id of ids) {
    const c = { ...cards[id] };
    let row = 0;
    for (const p of placed) if (p.col < c.col + c.w && c.col < p.col + p.w) row = Math.max(row, p.row + p.h);
    c.row = row;
    placed.push(c);
    out[id] = c;
  }
  return out;
}

/** The board from the saved layout (or the default); fit cards take their measured heights. */
export function cardsOf(saved, ids, measured = {}, fallbackRows = 8) {
  const rows = (id) => measured[id] || fallbackRows;
  const valid = saved && typeof saved === 'object' && saved.version === LAYOUT_VERSION && saved.flow !== 'auto' && saved.cards && typeof saved.cards === 'object';
  if (!valid) return compact(pack([...ids], (id) => SPAN[id] || 1, rows));
  const cards = {};
  for (const id of ids) if (saved.cards[id]) cards[id] = id === 'hero' ? pinHero(clampCell(saved.cards[id])) : clampCell(saved.cards[id]);
  let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
  for (const id of ids) {
    if (cards[id]) continue;
    cards[id] = { col: 0, row: bottom, w: clamp(SPAN[id] || 1, 1, COLS), h: rows(id), fit: true };
    bottom += cards[id].h;
  }
  for (const id of Object.keys(cards)) if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
  return compact(resolve(cards, null));
}

/** Puts card `id` at `target` (any of col, row, w, h, fit), kept inside the columns. */
export function place(cards, id, target) {
  const next = { ...cards[id], ...target };
  next.w = clamp(next.w, 1, COLS);
  next.col = clamp(next.col, 0, COLS - next.w);
  return compact(resolve({ ...cards, [id]: next }, id));
}
export const autoArrange = (ids, measured = {}, fallbackRows = 8) => compact(pack([...ids], (id) => SPAN[id] || 1, (id) => measured[id] || fallbackRows));

export function layoutValue(cards, flow = 'custom') {
  const out = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  return { version: LAYOUT_VERSION, flow, cards: out };
}

function loadLayout(storage) {
  try { return JSON.parse(storage?.getItem(LAYOUT_KEY) || 'null'); } catch { return null; }
}
function saveLayout(storage, layout) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* no storage: the layout lasts for this run */ }
}

// ───────────────────────── DOM

/**
 * One card: handle and title, body (an HTML string) and resize corner. A locked
 * card (the program name) has neither handle nor corner; a bare one has no title.
 */
export function card(id, { icon = '', title = '', body = '', bare = false, locked = false, moveTip = 'Move', resizeTip = 'Resize', extra = '' }) {
  const handle = locked ? '' : `<button type="button" class="card-handle" data-card-handle="${id}" title="${moveTip}" aria-label="${moveTip}">${HANDLE_SVG}</button>`;
  const head = bare
    ? (handle ? `<span class="card-handle-float">${handle}</span>` : '')
    : `<h2>${handle}<span class="start-card-icon">${icon}</span><span class="start-card-title">${title}</span><span class="grow"></span>${extra}</h2>`;
  const corner = locked ? '' : `<span class="card-resize" data-card-resize="${id}" title="${resizeTip}">${GRIP_SVG}</span>`;
  return `<section class="start-card start-card-${id}${bare ? ' bare' : ''}" data-card="${id}" ${title ? `aria-label="${title}"` : ''}>${head}<div class="card-body">${body}</div>${corner}</section>`;
}

/** Starts the board in `host` (a .start-board holding .start-card children). Returns { arrange, destroy }. */
export function startBoard(host, { reduced = false, storage = globalThis.localStorage } = {}) {
  const ids = [...host.querySelectorAll(':scope > .start-card')].map((el) => el.dataset.card);
  const cardEl = (id) => host.querySelector(`:scope > .start-card[data-card="${id}"]`);
  let layout = loadLayout(storage);
  const measured = {};
  let pending = null;
  let burst = { at: 0, n: 0 };
  let rects = new Map();

  const current = () => cardsOf(layout, ids, measured);

  /** Applies the cells; the other cards slide to their new places rather than jumping. */
  function paint(animate = false) {
    const shown = pending || current();
    for (const id of ids) {
      const cell = shown[id];
      const el = cardEl(id);
      el.style.gridColumn = `${cell.col + 1} / span ${cell.w}`;
      el.style.gridRow = `${cell.row + 1} / span ${cell.h}`;
      el.style.height = cell.fit ? '' : `${cell.h * ROW - GAP}px`;
      el.classList.toggle('fit', cell.fit);
      el.classList.toggle('fixed-height', !cell.fit);
    }
    const now = new Map();
    for (const id of ids) {
      const el = cardEl(id);
      const rect = el.getBoundingClientRect();
      now.set(id, rect);
      const old = rects.get(id);
      if (!animate || !old || reduced || el.classList.contains('drag-origin') || !el.animate) continue;
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    rects = now;
  }

  /** Height of a card's content (not its box, which a taller neighbour may stretch). */
  function contentPx(el) {
    const head = el.querySelector(':scope > h2');
    const body = el.querySelector(':scope > .card-body');
    const cs = getComputedStyle(el);
    let px = (el.offsetHeight - el.clientHeight) + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    if (head) px += head.offsetHeight + (parseFloat(getComputedStyle(head).marginBottom) || 0);
    if (body) {
      const kids = [...body.children];
      for (const kid of kids) px += kid.offsetHeight;
      const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
      if (kids.length > 1) px += gap * (kids.length - 1);
    }
    return px;
  }

  function measure() {
    if (!host.isConnected || !host.offsetParent) return;
    const next = {};
    for (const el of host.querySelectorAll(':scope > .start-card.fit')) next[el.dataset.card] = rowsFor(contentPx(el));
    // Growing always applies; shrinking by a single row does not, so a card whose
    // height depends on where compaction put it cannot flip between two heights.
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

  const save = (cards, flow = 'custom') => {
    layout = layoutValue(flow === 'auto' ? cards : compact(cards), flow);
    pending = null;
    paint(true);
    measure();
    saveLayout(storage, layout);
  };

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
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      done(event);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  function startMove(event, id) {
    if (id === 'hero') return;
    event.preventDefault();
    const el = cardEl(id);
    const rect = el.getBoundingClientRect();
    const offX = event.clientX - rect.left;
    const offY = event.clientY - rect.top;
    // A see-through copy follows the pointer; its buttons are not buttons.
    const ghost = el.cloneNode(true);
    ghost.classList.add('start-ghost');
    ghost.removeAttribute('data-card');
    ghost.setAttribute('aria-hidden', 'true');
    for (const node of ghost.querySelectorAll('[id]')) node.removeAttribute('id');
    for (const node of ghost.querySelectorAll('[data-card-handle], [data-card-resize], [data-action]')) {
      node.removeAttribute('data-card-handle');
      node.removeAttribute('data-card-resize');
      node.removeAttribute('data-action');
    }
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, gridColumn: 'auto', gridRow: 'auto' });
    host.appendChild(ghost);
    const drop = document.createElement('div');
    drop.className = 'card-drop-outline';
    drop.setAttribute('aria-hidden', 'true');
    host.appendChild(drop);
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
      const shownCell = (pending && pending[id]) || cell;
      drop.style.gridColumn = `${shownCell.col + 1} / span ${shownCell.w}`;
      drop.style.gridRow = `${shownCell.row + 1} / span ${shownCell.h}`;
      drop.style.height = `${shownCell.h * ROW - GAP}px`;
    };
    el.classList.add('drag-origin');
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
      el.classList.remove('drag-origin');
      pending = null;
      if (ended.type === 'pointerup' && (target.col !== cell.col || target.row !== cell.row)) save(place(saved0, id, target));
      else paint(true);
    });
  }

  function startResize(event, id) {
    if (id === 'hero') return;
    event.preventDefault();
    event.stopPropagation();
    const el = cardEl(id);
    const rect = el.getBoundingClientRect();
    const size = columnWidth();
    const saved0 = current();
    const cell = saved0[id];
    const startX = event.clientX;
    const startY = event.clientY;
    let target = { w: cell.w, h: cell.h };
    el.classList.add('resizing');
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
      el.classList.remove('resizing');
      pending = null;
      if (ended.type === 'pointerup' && (target.w !== cell.w || target.h !== cell.h)) save(place(saved0, id, { ...target, fit: false }));
      else paint(true);
    });
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-card-handle]');
    if (handle) { startMove(event, handle.dataset.cardHandle); return; }
    const corner = event.target.closest('[data-card-resize]');
    if (corner) startResize(event, corner.dataset.cardResize);
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
    arrange() { save(autoArrange(ids, measured), 'auto'); },
    /** Current cells (for tests). */
    cells: () => current(),
    destroy() {
      observer?.disconnect();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('dblclick', onDoubleClick);
    },
  };
}
