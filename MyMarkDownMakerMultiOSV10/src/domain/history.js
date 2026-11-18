// Undo / Redo. The data lives in the database, so a step is a pair of actions rather than a
// snapshot: `do` already happened when the step is recorded; `undo()` and `redo()` call the API.
// Steps run one at a time (a step's promise must finish before the next starts); a failed undo
// leaves the stacks as they were and rethrows (a conflict: someone changed the row meanwhile).
//
//   history.record({ label, undo: async () => …, redo: async () => … })
//   await history.undo()  → the label, or null
//   await history.redo()  → the label, or null

export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.running = null;
    this.listeners = new Set();
  }

  /** Records a step that has just been done. */
  record(step) {
    if (!step || typeof step.undo !== 'function' || typeof step.redo !== 'function') throw new TypeError('A step needs undo() and redo()');
    this.undoStack.push({ label: step.label ?? '', undo: step.undo, redo: step.redo, at: Date.now() });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.changed();
  }

  async undo() { return this.step(this.undoStack, this.redoStack, 'undo'); }
  async redo() { return this.step(this.redoStack, this.undoStack, 'redo'); }

  async step(from, to, method) {
    if (this.running || !from.length) return null;
    const entry = from.at(-1);
    this.running = entry;
    this.changed();
    try {
      await entry[method]();
      from.pop();
      to.push(entry);
      return entry.label;
    } finally {
      this.running = null;
      this.changed();
    }
  }

  get canUndo() { return !this.running && this.undoStack.length > 0; }
  get canRedo() { return !this.running && this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label ?? ''; }
  get redoLabel() { return this.redoStack.at(-1)?.label ?? ''; }

  /** Called whenever the stacks change (the toolbar updates). Returns an unsubscribe. */
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  changed() { for (const listener of this.listeners) { try { listener(this); } catch { /* ignore */ } } }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }
}
