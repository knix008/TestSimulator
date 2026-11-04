/**
 * The start screen's card layout: explicit positions on a 3-column grid of 20px rows.
 * A card is { col, row, w, h, fit }: col 0..2, w 1..3 columns, row and h in rows; fit
 * means the height follows the content (h is then the last measured value).
 *
 * After every move, resize and on load each card floats up as far as it can in its
 * own columns without overlapping. A dropped card keeps the column it was dropped in;
 * cards it overlaps are pushed down and then compacted.
 */

export const COLS = 3
export const ROW = 20
export const GAP = 14
const LAYOUT_VERSION = 1

export type Card = { col: number; row: number; w: number; h: number; fit: boolean }
export type Cards = Record<string, Card>

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Rows needed by a card `px` pixels high, plus the gap below it. */
export const rowsFor = (px: number) => Math.max(2, Math.ceil((px + GAP) / ROW))

export function overlaps(a: Card, b: Card) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}

function fix(card: Partial<Card>): Card {
  const w = clamp(Math.round(Number(card.w) || 1), 1, COLS)
  return {
    col: clamp(Math.round(Number(card.col) || 0), 0, COLS - w),
    row: Math.max(0, Math.round(Number(card.row) || 0)),
    w,
    h: Math.max(2, Math.round(Number(card.h) || 2)),
    fit: card.fit !== false,
  }
}

/** Masonry placement in the given order: each card goes to the left-most columns whose top is lowest. */
export function pack(order: string[], widthOf: (id: string) => number, heightOf: (id: string) => { h: number; fit: boolean }) {
  const top = new Array<number>(COLS).fill(0)
  const out: Cards = {}
  for (const id of order) {
    const w = clamp(widthOf(id) || 1, 1, COLS)
    let best = 0
    let bestRow = Infinity
    for (let col = 0; col + w <= COLS; col += 1) {
      const row = Math.max(...top.slice(col, col + w))
      if (row < bestRow) { bestRow = row; best = col }
    }
    const height = heightOf(id)
    out[id] = { col: best, row: bestRow, w, h: height.h, fit: height.fit }
    for (let col = best; col < best + w; col += 1) top[col] = bestRow + height.h
  }
  return out
}

/** Removes overlaps by pushing cards down; `pinned` (the card being dropped) keeps its place. */
export function resolve(cards: Cards, pinned: string | null) {
  const ids = Object.keys(cards).sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col))
  const placed: Card[] = []
  const out: Cards = {}
  for (const id of ids) {
    const card = { ...cards[id] }
    if (id !== pinned) {
      for (let guard = 0; guard < 200; guard += 1) {
        const hit = placed.filter((other) => overlaps(card, other))
        if (!hit.length) break
        card.row = Math.max(...hit.map((other) => other.row + other.h))
      }
    }
    placed.push(card)
    out[id] = card
  }
  return out
}

/** Every card moves up as far as it can, in its own columns. */
export function compact(cards: Cards) {
  const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col)
  const placed: Card[] = []
  const out: Cards = {}
  for (const id of ids) {
    const card = { ...cards[id] }
    let row = 0
    for (const other of placed) {
      if (other.col < card.col + card.w && card.col < other.col + other.w) row = Math.max(row, other.row + other.h)
    }
    card.row = row
    placed.push(card)
    out[id] = card
  }
  return out
}

/**
 * The card positions from a saved layout. `ids` is every card in the default order,
 * `defaultSpan` their default widths, `measured` the rows of the fit cards as last
 * measured. A card the saved layout does not know goes below the others.
 */
export function cardsOf(saved: unknown, ids: string[], defaultSpan: Record<string, number>, measured: Record<string, number> = {}, fallbackRows = 8) {
  const fitRows = (id: string) => measured[id] || fallbackRows
  const layout = saved as { version?: number; cards?: Record<string, Partial<Card>> } | null
  let cards: Cards
  if (layout?.version === LAYOUT_VERSION && layout.cards && typeof layout.cards === 'object') {
    cards = {}
    for (const id of ids) if (layout.cards[id]) cards[id] = fix(layout.cards[id])
    let bottom = Math.max(0, ...Object.values(cards).map((card) => card.row + card.h))
    for (const id of ids) {
      if (cards[id]) continue
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: fitRows(id), fit: true }
      bottom += cards[id].h
    }
  } else {
    cards = pack(ids, (id) => defaultSpan[id], (id) => ({ h: fitRows(id), fit: true }))
  }
  for (const id of Object.keys(cards)) {
    if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] }
  }
  return compact(resolve(cards, null))
}

/** The result of putting card `id` at `target`: pushed down, then compacted. */
export function place(cards: Cards, id: string, target: Partial<Card>) {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id))
}

/** Automatic arrangement: back to the default order, every card at its fit height. */
export function autoArrange(ids: string[], defaultSpan: Record<string, number>, measured: Record<string, number> = {}, fallbackRows = 8) {
  return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })))
}

/** Alt+Up / Alt+Down: swap with the nearest card above or below that shares a column. */
export function swapVertical(cards: Cards, id: string, direction: number) {
  const card = cards[id]
  if (!card) return cards
  const shares = (other: Card) => other.col < card.col + card.w && card.col < other.col + other.w
  const near = Object.keys(cards)
    .filter((key) => key !== id && shares(cards[key]) && (direction < 0 ? cards[key].row < card.row : cards[key].row > card.row))
    .sort((a, b) => (direction < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row))[0]
  if (!near) return cards
  const other = cards[near]
  const next = { ...cards }
  if (direction < 0) {
    next[id] = { ...card, row: other.row }
    next[near] = { ...other, row: other.row + card.h }
  } else {
    next[near] = { ...other, row: card.row }
    next[id] = { ...card, row: card.row + other.h }
  }
  return compact(resolve(next, id))
}

/** What goes into settings.startBackground.layout. */
export function layoutValue(cards: Cards) {
  const out: Cards = {}
  for (const [id, card] of Object.entries(cards)) out[id] = { col: card.col, row: card.row, w: card.w, h: card.h, fit: card.fit }
  return { version: LAYOUT_VERSION, cards: out }
}

export const layoutKey = (cards: Cards) => Object.keys(cards).sort().map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`).join('|')
