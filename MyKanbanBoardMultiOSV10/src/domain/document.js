// An open board (one tab): the board, where it is saved, its undo history and
// whether it has unsaved changes.
import { History } from './history.js';
import { newId } from './board.js';
import { serialize } from './format.js';

export class BoardDocument {
  constructor(board, { path = null, handle = null, name = null } = {}) {
    this.id = newId('doc');
    this.board = board;
    this.path = path;
    /** Web: FileSystemFileHandle the board was opened from / saved to. */
    this.handle = handle;
    this.name = name;
    this.history = new History();
    this.saved = JSON.stringify(board);
  }

  get dirty() {
    return JSON.stringify(this.board) !== this.saved;
  }

  /** Runs `change(board)` as one undoable step. Returns what `change` returned. */
  apply(label, change) {
    const before = JSON.stringify(this.board);
    const result = change(this.board);
    if (JSON.stringify(this.board) !== before) this.history.record(before, label);
    return result;
  }

  undo() {
    const entry = this.history.undo(JSON.stringify(this.board));
    if (!entry) return null;
    this.board = JSON.parse(entry.snapshot);
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(JSON.stringify(this.board));
    if (!entry) return null;
    this.board = JSON.parse(entry.snapshot);
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.saved = JSON.stringify(this.board);
  }

  text() {
    return serialize(this.board);
  }
}
