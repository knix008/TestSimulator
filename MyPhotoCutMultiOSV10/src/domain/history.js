// Undo / Redo: snapshots of the editable state (features, caricatures, selection), each with the
// name of the change that made it ("Undo: Eyes 130 %"). Quick repeated changes of one control
// (a stepper held down, a slider dragged) merge into one step when they share a `merge` key.
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.lastMerge = null;
    this.lastAt = 0;
  }

  /** Records the state BEFORE a change. */
  push(state, label, { merge = null, now = Date.now() } = {}) {
    if (merge && merge === this.lastMerge && now - this.lastAt < 1500 && this.undoStack.length) {
      this.lastAt = now;
      return false;
    }
    this.undoStack.push({ state: structuredClone(state), label });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.lastMerge = merge;
    this.lastAt = now;
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label ?? ''; }
  get redoLabel() { return this.redoStack.at(-1)?.label ?? ''; }

  /** Goes back: returns the earlier state (the current one goes on the redo stack), or null. */
  undo(current) {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ state: structuredClone(current), label: entry.label });
    this.lastMerge = null;
    return entry;
  }

  redo(current) {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ state: structuredClone(current), label: entry.label });
    this.lastMerge = null;
    return entry;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lastMerge = null;
  }
}
