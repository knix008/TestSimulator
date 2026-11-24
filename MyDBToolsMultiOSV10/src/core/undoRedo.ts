// Port of App/UndoRedoManager.cs — bounded snapshot history.
import type { DbSchema } from '../types';

const MAX_DEPTH = 50;

/** A document's undo history, detached from the manager that was holding it. */
export interface UndoRedoSnapshot {
  undoStack: DbSchema[];
  redoStack: DbSchema[];
}

export const EMPTY_HISTORY: UndoRedoSnapshot = { undoStack: [], redoStack: [] };

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

  /**
   * Lift the history out so it can be put back later. Each open document keeps
   * its own — switching tabs must not hand one document another's past.
   */
  capture(): UndoRedoSnapshot {
    return { undoStack: [...this.undoStack], redoStack: [...this.redoStack] };
  }

  restore(snapshot: UndoRedoSnapshot | null | undefined): void {
    this.undoStack = snapshot ? [...snapshot.undoStack] : [];
    this.redoStack = snapshot ? [...snapshot.redoStack] : [];
  }
}
