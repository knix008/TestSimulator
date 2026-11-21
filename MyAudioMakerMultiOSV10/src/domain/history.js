// Undo/redo by snapshots: before each change the board is serialized; undo
// swaps the current board with the last snapshot (and redo the other way).

export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Records the state *before* a change labelled `label`. */
  record(snapshot, label) {
    this.undoStack.push({ snapshot, label });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Returns the snapshot to restore, or null. `current` is kept for redo. */
  undo(current) {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ snapshot: current, label: entry.label });
    return entry;
  }

  redo(current) {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ snapshot: current, label: entry.label });
    return entry;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label ?? ''; }
  get redoLabel() { return this.redoStack.at(-1)?.label ?? ''; }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
