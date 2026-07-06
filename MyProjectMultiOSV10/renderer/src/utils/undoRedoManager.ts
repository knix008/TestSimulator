import type { GanttViewSettings, ProjectDetail } from '@web/types/project';
import type { MyProjectSettingsData } from '../projectDocument';

export interface UndoSnapshot {
  project: ProjectDetail;
  ganttViewSettings: GanttViewSettings;
  myprjSettings: MyProjectSettingsData | null;
}

const MAX_DEPTH = 50;

export class UndoRedoManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  pushSnapshot(snapshot: UndoSnapshot): void {
    this.undoStack.push(JSON.stringify(snapshot));
    this.redoStack = [];
    this.trim(this.undoStack);
  }

  undo(current: UndoSnapshot): UndoSnapshot | null {
    if (!this.canUndo()) return null;
    this.redoStack.push(JSON.stringify(current));
    return JSON.parse(this.undoStack.pop()!) as UndoSnapshot;
  }

  redo(current: UndoSnapshot): UndoSnapshot | null {
    if (!this.canRedo()) return null;
    this.undoStack.push(JSON.stringify(current));
    return JSON.parse(this.redoStack.pop()!) as UndoSnapshot;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private trim(stack: string[]): void {
    if (stack.length <= MAX_DEPTH) return;
    stack.splice(0, stack.length - MAX_DEPTH);
  }
}
