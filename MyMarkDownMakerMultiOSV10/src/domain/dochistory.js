// Undo / Redo of the document. A step is a snapshot of what it changed — the file list (order, which are
// ticked) and the merged text — taken just before the change, so undoing puts back exactly what was there
// (no re-merge). A burst of typing is one step: changes less than COALESCE_MS apart with the same label
// join the step before them.
//
//   history.record(label, before, { coalesce })   before = { files, text, edited, sel }
//   history.undo(current) → the snapshot to restore (current goes to Redo), or null
//   history.redo(current) → likewise
export const HISTORY_LIMIT = 150;
export const COALESCE_MS = 700;

/** The first offset where two texts differ (where the caret goes when a step is undone). */
export function firstDiff(a, b) {
  const left = a ?? '';
  const right = b ?? '';
  const n = Math.min(left.length, right.length);
  let i = 0;
  while (i < n && left.charCodeAt(i) === right.charCodeAt(i)) i += 1;
  return i;
}

export class DocHistory {
  constructor(limit = HISTORY_LIMIT, now = () => Date.now()) {
    this.limit = limit;
    this.now = now;
    this.past = [];
    this.future = [];
    this.listeners = new Set();
  }

  /** Records a change that is about to happen (or has just happened) from `before`. */
  record(label, before, { coalesce = false } = {}) {
    const at = this.now();
    const last = this.past.at(-1);
    if (coalesce && last && last.label === label && at - last.at < COALESCE_MS) {
      last.at = at;
    } else {
      this.past.push({ label, snapshot: before, at });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.changed();
  }

  undo(current) { return this.step(this.past, this.future, current); }
  redo(current) { return this.step(this.future, this.past, current); }

  step(from, to, current) {
    const entry = from.pop();
    if (!entry) return null;
    to.push({ label: entry.label, snapshot: current, at: 0 });
    this.changed();
    return { label: entry.label, snapshot: entry.snapshot };
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoLabel() { return this.past.at(-1)?.label ?? ''; }
  get redoLabel() { return this.future.at(-1)?.label ?? ''; }

  /** The next change starts a step of its own (after a save, a merge …). */
  seal() { const last = this.past.at(-1); if (last) last.at = 0; }

  clear() { this.past = []; this.future = []; this.changed(); }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  changed() { for (const listener of this.listeners) { try { listener(this); } catch { /* ignore */ } } }
}
