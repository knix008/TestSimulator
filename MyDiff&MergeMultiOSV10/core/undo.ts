/**
 * A plain undo/redo stack.
 *
 * Entries are pairs of thunks rather than diffs of the model: the merge document is
 * immutable, so "undo" is simply putting the previous object back, and the same stack
 * can carry anything else the UI wants to make reversible (a pane swap, a filter
 * change) without the stack knowing what those are.
 */

export type UndoEntry = {
  /** Shown in the Edit menu and the status bar: "Undo Take Local". */
  label: string;
  undo: () => void;
  redo: () => void;
};

export class UndoStack {
  private readonly past: UndoEntry[] = [];
  private readonly future: UndoEntry[] = [];
  private readonly limit: number;
  private listeners = new Set<() => void>();

  constructor(limit = 200) {
    this.limit = limit;
  }

  /** Records an action that has already been applied. */
  push(entry: UndoEntry): void {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    this.emit();
  }

  undo(): UndoEntry | null {
    const entry = this.past.pop();
    if (!entry) return null;
    entry.undo();
    this.future.push(entry);
    this.emit();
    return entry;
  }

  redo(): UndoEntry | null {
    const entry = this.future.pop();
    if (!entry) return null;
    entry.redo();
    this.past.push(entry);
    this.emit();
    return entry;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string {
    return this.past.length > 0 ? this.past[this.past.length - 1].label : "";
  }

  get redoLabel(): string {
    return this.future.length > 0 ? this.future[this.future.length - 1].label : "";
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
