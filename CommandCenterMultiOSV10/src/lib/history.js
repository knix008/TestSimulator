// Undo / redo history of file operations.
//
// Entries are plain data (kind + the paths involved); App.jsx interprets
// them, so an entry never captures stale React state. Only operations that
// can be reversed exactly are recorded:
//
//   create   { path, isDir }              new folder / new file
//   rename   { dir, from, to }            rename in place
//   copy     { items: [{src, dest}], destDir }   copies that did not replace anything
//   move     { items: [{src, dest}], destDir }   moves that did not merge into anything
//   compress { parts, args }              archive parts written by archive.create
//   extract  { destDir, args }            an extraction into a folder that did not exist
//
// Permanent delete and trash are not recorded (nothing to bring back), but
// they still clear the redo stack like any other new operation.
const MAX_HISTORY = 50;

export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed() { this.version = (this.version || 0) + 1; for (const fn of this.listeners) fn(); }

  // A new operation: push it and forget what could have been redone.
  push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this._changed();
  }

  // An operation that cannot be undone still invalidates the redo stack.
  mark() {
    if (this.redoStack.length) { this.redoStack = []; this._changed(); }
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  peekUndo() { return this.undoStack[this.undoStack.length - 1] || null; }
  peekRedo() { return this.redoStack[this.redoStack.length - 1] || null; }

  // Moves the top entry across after a successful undo / redo.
  commitUndo(entry) { this._pop(this.undoStack, entry); this.redoStack.push(entry); this._changed(); }
  commitRedo(entry) { this._pop(this.redoStack, entry); this.undoStack.push(entry); this._changed(); }
  // Drops an entry whose reversal failed (the file system no longer matches it).
  drop(entry) { this._pop(this.undoStack, entry); this._pop(this.redoStack, entry); this._changed(); }

  _pop(stack, entry) { const i = stack.lastIndexOf(entry); if (i >= 0) stack.splice(i, 1); }

  clear() { this.undoStack = []; this.redoStack = []; this._changed(); }
}
