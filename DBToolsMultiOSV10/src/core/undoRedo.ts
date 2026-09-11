// Port of App/UndoRedoManager.cs — bounded snapshot history.
import type { DbSchema } from '../types';

const MAX_DEPTH = 50;

export class UndoRedoManager {
  private undoStack: DbSchema[] = [];
  private redoStack: DbSchema[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(snapshot: DbSchema): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_DEPTH) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: DbSchema): DbSchema {
    if (!this.canUndo) return current;
    this.redoStack.push(current);
    return this.undoStack.pop()!;
  }

  redo(current: DbSchema): DbSchema {
    if (!this.canRedo) return current;
    this.undoStack.push(current);
    return this.redoStack.pop()!;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
