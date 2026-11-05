// The start screen's card board: three columns, cards snapped to rows, never overlapping.
export const COLS = 3
export const ROW = 20
export const GAP = 14
// Raised when the default arrangement changes: an older saved one starts over once.
export const LAYOUT_VERSION = 2

export type Cell = { col: number; row: number; w: number; h: number; fit: boolean }
export type Cards = Record<string, Cell>
export type SavedLayout = { version: number; cards: Cards }

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export const rowsFor = (px: number) => Math.max(2, Math.ceil((px + GAP) / ROW))

export function overlaps(a: Cell, b: Cell) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}

export function clampCell(value: Partial<Cell> | null | undefined): Cell {
  const c = value ?? {}
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS)
  return {
    col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w),
    row: Math.max(0, Math.round(Number(c.row) || 0)),
    w,
    h: Math.max(2, Math.round(Number(c.h) || 2)),
    fit: c.fit !== false,
  }
}

export function pack(order: string[], widthOf: (id: string) => number, heightOf: (id: string) => { h: number; fit: boolean }): Cards {
  const top = new Array<number>(COLS).fill(0)
  const out: Cards = {}
  for (const id of order) {
    const w = clamp(Math.round(widthOf(id) || 1), 1, COLS)
    let best = 0
    let bestRow = Infinity
    for (let c = 0; c + w <= COLS; c += 1) {
      const row = Math.max(...top.slice(c, c + w))
      if (row < bestRow) {
        bestRow = row
        best = c
      }
    }
    const height = heightOf(id)
    out[id] = { col: best, row: bestRow, w, h: height.h, fit: height.fit }
    for (let c = best; c < best + w; c += 1) top[c] = bestRow + height.h
  }
  return out
}

export function resolve(cards: Cards, pinned: string | null): Cards {
  const ids = Object.keys(cards).sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col))
  const placed: Cell[] = []
  const out: Cards = {}
  for (const id of ids) {
    const c = { ...cards[id] }
    if (id !== pinned) {
      for (let guard = 0; guard < 200; guard += 1) {
        const hit = placed.filter((p) => overlaps(c, p))
        if (!hit.length) break
        c.row = Math.max(...hit.map((p) => p.row + p.h))
      }
    }
    placed.push(c)
    out[id] = c
  }
  return out
}

export function compact(cards: Cards): Cards {
  const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col)
  const placed: Cell[] = []
  const out: Cards = {}
  for (const id of ids) {
    const c = { ...cards[id] }
    let row = 0
    for (const p of placed) if (p.col < c.col + c.w && c.col < p.col + p.w) row = Math.max(row, p.row + p.h)
    c.row = row
    placed.push(c)
    out[id] = c
  }
  return out
}

export function cardsOf(saved: unknown, ids: readonly string[], defaultSpan: Record<string, number>, measured: Record<string, number> = {}, fallbackRows = 8): Cards {
  const rows = (id: string) => measured[id] || fallbackRows
  const stored = saved && typeof saved === 'object' ? (saved as Partial<SavedLayout>) : null
  let cards: Cards
  if (stored && stored.version === LAYOUT_VERSION && stored.cards && typeof stored.cards === 'object') {
    cards = {}
    for (const id of ids) if (stored.cards[id]) cards[id] = clampCell(stored.cards[id])
    let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h))
    for (const id of ids) {
      if (cards[id]) continue
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: rows(id), fit: true }
      bottom += cards[id].h
    }
  } else {
    cards = pack([...ids], (id) => defaultSpan[id] || 1, (id) => ({ h: rows(id), fit: true }))
  }
  for (const id of Object.keys(cards)) {
    if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] }
  }
  return compact(resolve(cards, null))
}

export function place(cards: Cards, id: string, target: Partial<Cell>): Cards {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id))
}

export function autoArrange(ids: readonly string[], defaultSpan: Record<string, number>, measured: Record<string, number> = {}, fallbackRows = 8): Cards {
  return compact(pack([...ids], (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })))
}

export function layoutValue(cards: Cards): SavedLayout {
  const out: Cards = {}
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit }
  return { version: LAYOUT_VERSION, cards: out }
}

export const layoutKey = (cards: Cards) =>
  Object.keys(cards)
    .sort()
    .map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`)
    .join('|')
