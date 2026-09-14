// Undo / redo.
//
// A history holds an immutable `present` plus stacks of past and future
// states. States are plain objects that are never mutated, so pushing a new
// one is cheap and every earlier state stays valid. The base image of a
// capture is shared by reference between states — only crops replace it.

export const HISTORY_LIMIT = 100;

export function createHistory(present) {
  return { past: [], present, future: [] };
}

/** Records a new state. Clears the redo stack, as every editor does. */
export function push(h, next) {
  if (next === h.present) return h;
  const past = h.past.length >= HISTORY_LIMIT ? h.past.slice(h.past.length - HISTORY_LIMIT + 1) : h.past;
  return { past: [...past, h.present], present: next, future: [] };
}

/** Replaces the present without recording it (live drags, text being typed). */
export function replace(h, next) {
  return { ...h, present: next };
}

export function undo(h) {
  if (!h.past.length) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo(h) {
  if (!h.future.length) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

export function canUndo(h) { return !!h && h.past.length > 0; }
export function canRedo(h) { return !!h && h.future.length > 0; }
