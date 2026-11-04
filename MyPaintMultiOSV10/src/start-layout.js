/* The start screen's card board.
 *
 * Every card has an explicit cell on a three-column grid of 20 px rows:
 * { col, row, w, h, fit } - col 0..2, w 1..3 columns, row and h in rows, and fit when the height
 * follows the content (then h is the last measured value). What is stored is
 * { version: 1, cards: { <id>: cell } }.
 *
 * The rules are vertical compaction, the way a dashboard grid behaves: after every move, resize
 * and on load each card floats up as far as it can within its own columns without overlapping
 * another. A dropped card keeps the column it was dropped in; the cards it lands on are pushed
 * down and then compacted.
 *
 * Nothing here touches the DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintStartLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const COLS = 3;
  const ROW = 20;
  const GAP = 14;
  const LAYOUT_VERSION = 1;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  /* Rows a card px pixels tall needs, the gap below it included. */
  const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));

  function overlaps(a, b) {
    return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
  }

  /* A stored cell made safe: whole numbers, inside the grid, never zero-sized. */
  function clampCell(value) {
    const c = value || {};
    const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
    return {
      col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w),
      row: Math.max(0, Math.round(Number(c.row) || 0)),
      w: w,
      h: Math.max(2, Math.round(Number(c.h) || 2)),
      fit: c.fit !== false,
    };
  }

  /* Masonry placement in the given order: each card goes to the left-most run of columns whose
   * top is lowest. */
  function pack(order, widthOf, heightOf) {
    const top = new Array(COLS).fill(0);
    const out = {};
    order.forEach((id) => {
      const w = clamp(Math.round(widthOf(id) || 1), 1, COLS);
      let best = 0;
      let bestRow = Infinity;
      for (let c = 0; c + w <= COLS; c += 1) {
        const row = Math.max.apply(null, top.slice(c, c + w));
        if (row < bestRow) {
          bestRow = row;
          best = c;
        }
      }
      const height = heightOf(id);
      out[id] = { col: best, row: bestRow, w: w, h: height.h, fit: height.fit };
      for (let c = best; c < best + w; c += 1) top[c] = bestRow + height.h;
    });
    return out;
  }

  /* Removes overlaps by pushing cards down. pinned (the card being dropped or resized) keeps its
   * place; the others are taken top to bottom and each goes down just far enough. */
  function resolve(cards, pinned) {
    const ids = Object.keys(cards).sort((a, b) => (
      a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col
    ));
    const placed = [];
    const out = {};
    ids.forEach((id) => {
      const c = Object.assign({}, cards[id]);
      if (id !== pinned) {
        for (let guard = 0; guard < 200; guard += 1) {
          const hit = placed.filter((p) => overlaps(c, p));
          if (!hit.length) break;
          c.row = Math.max.apply(null, hit.map((p) => p.row + p.h));
        }
      }
      placed.push(c);
      out[id] = c;
    });
    return out;
  }

  /* Every card moves up as far as it can within its own columns. */
  function compact(cards) {
    const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col);
    const placed = [];
    const out = {};
    ids.forEach((id) => {
      const c = Object.assign({}, cards[id]);
      let row = 0;
      placed.forEach((p) => {
        if (p.col < c.col + c.w && c.col < p.col + p.w) row = Math.max(row, p.row + p.h);
      });
      c.row = row;
      placed.push(c);
      out[id] = c;
    });
    return out;
  }

  /* The cells to draw, from what was saved. A card the saved layout does not know - one added in
   * a later version - goes below the others. */
  function cardsOf(saved, ids, defaultSpan, measured, fallbackRows) {
    const known = measured || {};
    const fallback = fallbackRows || 8;
    const rows = (id) => known[id] || fallback;
    const stored = saved && typeof saved === "object" ? saved : null;
    let cards;
    if (stored && stored.version === LAYOUT_VERSION && stored.cards && typeof stored.cards === "object") {
      cards = {};
      ids.forEach((id) => { if (stored.cards[id]) cards[id] = clampCell(stored.cards[id]); });
      let bottom = Math.max.apply(null, [0].concat(Object.values(cards).map((c) => c.row + c.h)));
      ids.forEach((id) => {
        if (cards[id]) return;
        cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: rows(id), fit: true };
        bottom += cards[id].h;
      });
    } else {
      cards = pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: rows(id), fit: true }));
    }
    Object.keys(cards).forEach((id) => {
      if (cards[id].fit && known[id]) cards[id] = Object.assign({}, cards[id], { h: known[id] });
    });
    return compact(resolve(cards, null));
  }

  /* Card id put at target: the cards under it pushed down, then everything compacted. */
  function place(cards, id, target) {
    const next = Object.assign({}, cards);
    next[id] = Object.assign({}, cards[id], target);
    return compact(resolve(next, id));
  }

  /* Auto arrange: masonry in reading order, every card back at its fit height. */
  function autoArrange(ids, defaultSpan, measured, fallbackRows) {
    const known = measured || {};
    const fallback = fallbackRows || 8;
    return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: known[id] || fallback, fit: true })));
  }

  /* Alt+Up / Alt+Down: swap with the nearest card above or below that shares a column. */
  function swapVertical(cards, id, direction) {
    const c = cards[id];
    if (!c) return cards;
    const shares = (o) => o.col < c.col + c.w && c.col < o.col + o.w;
    const near = Object.keys(cards)
      .filter((k) => k !== id && shares(cards[k]))
      .filter((k) => (direction < 0 ? cards[k].row < c.row : cards[k].row > c.row))
      .sort((a, b) => (direction < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row))[0];
    if (!near) return cards;
    const o = cards[near];
    const next = Object.assign({}, cards);
    if (direction < 0) {
      next[id] = Object.assign({}, c, { row: o.row });
      next[near] = Object.assign({}, o, { row: o.row + c.h });
    } else {
      next[near] = Object.assign({}, o, { row: c.row });
      next[id] = Object.assign({}, c, { row: c.row + o.h });
    }
    return compact(resolve(next, id));
  }

  /* What is stored. */
  function layoutValue(cards) {
    const out = {};
    Object.keys(cards).forEach((id) => {
      const c = cards[id];
      out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
    });
    return { version: LAYOUT_VERSION, cards: out };
  }

  return {
    COLS: COLS,
    ROW: ROW,
    GAP: GAP,
    LAYOUT_VERSION: LAYOUT_VERSION,
    rowsFor: rowsFor,
    overlaps: overlaps,
    clampCell: clampCell,
    pack: pack,
    resolve: resolve,
    compact: compact,
    cardsOf: cardsOf,
    place: place,
    autoArrange: autoArrange,
    swapVertical: swapVertical,
    layoutValue: layoutValue,
  };
});
