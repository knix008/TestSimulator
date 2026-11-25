// Undo / redo over immutable snapshots of the design.
//
// push(before) records the state before a change. Changes that come in quick succession under
// the same key (dragging a slider, typing a text) become one step: a push with the key of the
// previous push within `window` ms is ignored.
export function createHistory({ limit = 200, window = 700, now = () => Date.now() } = {}) {
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;
  return {
    push(before, key = null) {
      const time = now();
      if (key && key === lastKey && time - lastAt < window) { lastAt = time; return; }
      past.push(before);
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
      lastKey = key;
      lastAt = time;
    },
    /** The state to go back to (current is kept for redo), or null. */
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      lastKey = null;
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      lastKey = null;
      return future.pop();
    },
    clear() { past = []; future = []; lastKey = null; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get size() { return past.length; },
  };
}
