// Undo / Redo: a stack of { label, undo, redo } (async functions that call
// the same API as the original action), capped at LIMIT entries. A new action
// clears the redo side; opening another project clears both.
const LIMIT = 100;
const state = { done: [], undone: [], busy: false };
const subs = new Set();
const snap = () => ({
  canUndo: state.done.length > 0 && !state.busy,
  canRedo: state.undone.length > 0 && !state.busy,
  undoLabel: state.done.length ? state.done[state.done.length - 1].label : '',
  redoLabel: state.undone.length ? state.undone[state.undone.length - 1].label : '',
  size: state.done.length,
  redoSize: state.undone.length,
  busy: state.busy,
});
const emit = () => { const s = snap(); subs.forEach((fn) => fn(s)); };

export function subscribeHistory(fn) {
  subs.add(fn);
  fn(snap());
  return () => subs.delete(fn);
}

export const historyState = snap;

/** Records an action that has already been done. */
export function record(entry) {
  if (!entry || typeof entry.undo !== 'function' || typeof entry.redo !== 'function') return;
  state.done.push({ label: entry.label || '', undo: entry.undo, redo: entry.redo });
  if (state.done.length > LIMIT) state.done.splice(0, state.done.length - LIMIT);
  state.undone = [];
  emit();
}

export function clearHistory() {
  state.done = [];
  state.undone = [];
  emit();
}

// onAfter(kind, entry) runs after a successful undo / redo (App marks the project dirty).
let after = null;
export function onHistoryApplied(fn) { after = fn; }

async function step(from, to, kind) {
  if (state.busy || !from.length) return { ok: false };
  const entry = from.pop();
  state.busy = true;
  emit();
  try {
    await entry[kind]();
    to.push(entry);
    if (after) after(kind, entry);
    return { ok: true, label: entry.label };
  } catch (error) {
    // Keep the entry where it was so the user can try again.
    from.push(entry);
    return { ok: false, error, label: entry.label };
  } finally {
    state.busy = false;
    emit();
  }
}

export const undo = () => step(state.done, state.undone, 'undo');
export const redo = () => step(state.undone, state.done, 'redo');

/** Ctrl+Z / Ctrl+Y stay with the field when focus is in an input, a textarea or the code view. */
export function typingTarget(el) {
  if (!el || !el.closest) return false;
  if (el.isContentEditable) return true;
  if (el.closest('input, textarea, select, [contenteditable="true"], .codepane')) return true;
  // A text selection inside the code view (it is not focusable) also keeps the keys.
  try {
    const sel = window.getSelection && window.getSelection();
    const node = sel && !sel.isCollapsed && sel.anchorNode;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    if (host && host.closest && host.closest('.codepane')) return true;
  } catch { /* no selection API */ }
  return false;
}
