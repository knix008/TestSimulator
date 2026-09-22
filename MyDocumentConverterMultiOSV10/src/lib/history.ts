/**
 * Undo/redo for one document.
 *
 * A snapshot is the whole editable state — the source text, the formats and
 * the writer options — so undoing crosses freely between typing and changing
 * an option. Typing is coalesced: edits closer together than `COALESCE_MS`
 * fold into the same step, so Undo takes back a burst of typing rather than
 * one character.
 */

export type Snapshot<T> = { state: T; label: string; at: number }

export type History<T> = { undo: Snapshot<T>[]; redo: Snapshot<T>[]; limit: number }

export const COALESCE_MS = 700

export function createHistory<T>(limit = 200): History<T> {
  return { undo: [], redo: [], limit }
}

/** Records `previous` as the state to return to. `coalesce` folds a burst of typing into one step. */
export function push<T>(history: History<T>, previous: T, label: string, coalesce = false): History<T> {
  const now = Date.now()
  const last = history.undo[history.undo.length - 1]
  if (coalesce && last && last.label === label && now - last.at < COALESCE_MS) {
    return { ...history, undo: [...history.undo.slice(0, -1), { ...last, at: now }], redo: [] }
  }
  const undo = [...history.undo, { state: previous, label, at: now }]
  if (undo.length > history.limit) undo.splice(0, undo.length - history.limit)
  return { ...history, undo, redo: [] }
}

export function undo<T>(history: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const last = history.undo[history.undo.length - 1]
  if (!last) return null
  return {
    history: { ...history, undo: history.undo.slice(0, -1), redo: [...history.redo, { state: current, label: last.label, at: Date.now() }] },
    state: last.state,
    label: last.label,
  }
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; state: T; label: string } | null {
  const next = history.redo[history.redo.length - 1]
  if (!next) return null
  return {
    history: { ...history, redo: history.redo.slice(0, -1), undo: [...history.undo, { state: current, label: next.label, at: Date.now() }] },
    state: next.state,
    label: next.label,
  }
}
