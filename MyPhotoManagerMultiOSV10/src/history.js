// Undo / redo of file operations in the Manage mode: move, copy, rename and
// new folder (deleting to the trash is undone from the system trash, not here).
// Each step knows how to reverse and repeat itself; the toolbar's buttons and
// Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) walk the list. The editor has its own history.

const MAX = 100;
const undoList = [];
const redoList = [];
const listeners = new Set();
let busy = false;

const notify = () => { for (const listener of listeners) listener(); };

export const history = {
  /** step: { label, undo: async () => void, redo: async () => void } */
  push(step) {
    undoList.push(step);
    if (undoList.length > MAX) undoList.shift();
    redoList.length = 0;
    notify();
  },
  get canUndo() { return undoList.length > 0 && !busy; },
  get canRedo() { return redoList.length > 0 && !busy; },
  get undoLabel() { return undoList.at(-1)?.label ?? ''; },
  get redoLabel() { return redoList.at(-1)?.label ?? ''; },
  async undo() { return run(undoList, redoList, 'undo'); },
  async redo() { return run(redoList, undoList, 'redo'); },
  clear() { undoList.length = 0; redoList.length = 0; notify(); },
  onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};

async function run(from, to, how) {
  if (busy || !from.length) return null;
  const step = from.pop();
  busy = true;
  // Rebuilding the toolbar now would remove the button whose click is still
  // running, which can crash the webview. Update it after this event.
  setTimeout(notify, 0);
  try {
    await step[how]();
    to.push(step);
    return step;
  } finally {
    busy = false;
    notify();
  }
}
