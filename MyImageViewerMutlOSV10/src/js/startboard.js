/* Start page card board (same as MyUMLMaker): three columns, cards snapped to 20px rows and
   never overlapping. The handle (three lines) moves a card — a see-through copy follows the
   pointer and the others slide aside — the corner resizes it, a double click on the corner
   fits it to its content again. The arrangement is saved in localStorage ('startLayout'). */
window.StartBoard = (() => {
  const COLS = 3;
  const ROW = 20;
  const GAP = 14;
  // Raised when the default arrangement changes: an older saved one starts over once.
  const LAYOUT_VERSION = 1;
  const STORE_KEY = 'startLayout';
  /** Columns each card takes in the default arrangement. */
  const SPAN = { hero: 3, begin: 1, tasks: 2, recent: 1, scenes: 2 };

  /** Move handle: three horizontal lines. */
  const HANDLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
  /** Resize corner: a triangle of dots. */
  const GRIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));
  const overlaps = (a, b) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

  /** The program-name card stays full width on the first row. It is not moved or resized. */
  function pinHero(cell) {
    return { ...cell, col: 0, row: 0, w: COLS, fit: true };
  }

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

  /** The cards in order, each put in the columns where it can start highest. */
  function pack(order, widthOf, heightOf) {
    const top = new Array(COLS).fill(0);
    const out = {};
    for (const id of order) {
      const w = clamp(Math.round(widthOf(id) || 1), 1, COLS);
      let best = 0;
      let bestRow = Infinity;
      for (let c = 0; c + w <= COLS; c += 1) {
        const row = Math.max(...top.slice(c, c + w));
        if (row < bestRow) { bestRow = row; best = c; }
      }
      out[id] = { col: best, row: bestRow, w, h: heightOf(id), fit: true };
      for (let c = best; c < best + w; c += 1) top[c] = bestRow + out[id].h;
    }
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
  function compact(cards) {
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
  function cardsOf(saved, ids, measured = {}, fallbackRows = 8) {
    const rows = (id) => measured[id] || fallbackRows;
    let cards;
    if (saved && typeof saved === 'object' && saved.version === LAYOUT_VERSION && saved.cards && typeof saved.cards === 'object') {
      cards = {};
      for (const id of ids) if (saved.cards[id]) cards[id] = id === 'hero' ? pinHero(clampCell(saved.cards[id])) : clampCell(saved.cards[id]);
      let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
      for (const id of ids) {
        if (cards[id]) continue;
        cards[id] = { col: 0, row: bottom, w: clamp(SPAN[id] || 1, 1, COLS), h: rows(id), fit: true };
        bottom += cards[id].h;
      }
    } else {
      cards = pack([...ids], (id) => SPAN[id] || 1, rows);
    }
    for (const id of Object.keys(cards)) if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
    return compact(resolve(cards, null));
  }

  const place = (cards, id, target) => compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));
  const autoArrange = (ids, measured = {}, fallbackRows = 8) => compact(pack([...ids], (id) => SPAN[id] || 1, (id) => measured[id] || fallbackRows));

  function layoutValue(cards) {
    const out = {};
    for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
    return { version: LAYOUT_VERSION, cards: out };
  }

  function loadLayout() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
  }
  function saveLayout(layout) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(layout)); } catch { /* no storage */ }
  }

  /**
   * One card: its handle and title (a bare card has a floating handle and no title), its body
   * and its resize corner. A locked card (the program name) has neither. `title` / `extra`
   * are text / nodes; the body is a node.
   */
  function card(id, { icon = '', title = '', body, bare = false, locked = false, moveTip = 'Move', resizeTip = 'Resize', extra = null }) {
    const sec = document.createElement('section');
    sec.className = `start-card start-card-${id}${bare ? ' bare' : ''}`;
    sec.dataset.card = id;
    if (title) sec.setAttribute('aria-label', title);
    if (!locked) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'card-handle';
      handle.dataset.cardHandle = id;
      handle.title = moveTip;
      handle.setAttribute('aria-label', moveTip);
      handle.innerHTML = HANDLE_SVG;
      if (bare) {
        const float = document.createElement('span');
        float.className = 'card-handle-float';
        float.appendChild(handle);
        sec.appendChild(float);
      } else {
        const h = document.createElement('h2');
        const ic = document.createElement('span');
        ic.className = 'start-card-icon';
        ic.innerHTML = icon;
        const tx = document.createElement('span');
        tx.className = 'start-card-title';
        tx.textContent = title;
        const grow = document.createElement('span');
        grow.className = 'grow';
        h.append(handle, ic, tx, grow);
        if (extra) h.append(extra);
        sec.appendChild(h);
      }
    } else if (!bare && title) {
      const h = document.createElement('h2');
      const ic = document.createElement('span');
      ic.className = 'start-card-icon';
      ic.innerHTML = icon;
      const tx = document.createElement('span');
      tx.className = 'start-card-title';
      tx.textContent = title;
      h.append(ic, tx);
      if (extra) h.append(extra);
      sec.appendChild(h);
    }
    const wrap = document.createElement('div');
    wrap.className = 'card-body';
    wrap.appendChild(body);
    sec.appendChild(wrap);
    if (!locked) {
      const corner = document.createElement('span');
      corner.className = 'card-resize';
      corner.dataset.cardResize = id;
      corner.title = resizeTip;
      corner.innerHTML = GRIP_SVG;
      sec.appendChild(corner);
    }
    return sec;
  }

  /** Starts the board in `host` (a .start-board holding .start-card children). Returns { arrange, destroy }. */
  function start(host, { reduced = false } = {}) {
    const ids = [...host.querySelectorAll(':scope > .start-card')].map((el) => el.dataset.card);
    const cardEl = (id) => host.querySelector(`:scope > .start-card[data-card="${id}"]`);
    let layout = loadLayout();
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

    /** Fit cards take the height of their content, measured in rows. */
    function measure() {
      if (!host.isConnected || !host.offsetParent) return;
      const next = {};
      for (const el of host.querySelectorAll(':scope > .start-card.fit')) next[el.dataset.card] = rowsFor(el.offsetHeight);
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

    const save = (cards) => { layout = layoutValue(compact(cards)); pending = null; paint(true); measure(); saveLayout(layout); };

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
    const outline = () => {
      const el = document.createElement('div');
      el.className = 'card-drop-outline';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
      return el;
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
      for (const node of ghost.querySelectorAll('[data-card-handle], [data-card-resize]')) { node.removeAttribute('data-card-handle'); node.removeAttribute('data-card-resize'); }
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
    const observer = window.ResizeObserver ? new ResizeObserver(() => measure()) : null;
    if (observer) { for (const id of ids) observer.observe(cardEl(id)); observer.observe(host); }

    paint();
    measure();

    return {
      /** Puts every card back in the default arrangement. */
      arrange() { save(autoArrange(ids, measured)); },
      destroy() {
        observer?.disconnect();
        host.removeEventListener('pointerdown', onPointerDown);
        host.removeEventListener('dblclick', onDoubleClick);
      },
    };
  }

  return {
    COLS, ROW, GAP, LAYOUT_VERSION, SPAN, HANDLE_SVG,
    card, start,
    // pure layout, for tests
    cardsOf, place, compact, autoArrange, layoutValue, overlaps,
  };
})();
