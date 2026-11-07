// Undo / redo by whole-document snapshots: simple, and always correct whatever an operator changed.
import { serialize } from './doc.js';

// Pictures are megabytes of text that rarely change. Snapshots hold them once, by reference, or 64 steps of undo would hold
// 64 copies of every image.
const IMAGE_DATA = /"dataUrl":"([^"]{2000,})"/g;

export class History {
  constructor(limit = 64) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
    this.pool = new Map();
    this.poolIds = [];
  }

  pack(text) {
    return text.replace(IMAGE_DATA, (_, data) => {
      let id = this.pool.get(data);
      if (id == null) { id = this.poolIds.length; this.pool.set(data, id); this.poolIds.push(data); }
      return `"dataUrl":"@pool:${id}"`;
    });
  }

  unpack(text) {
    return text.replace(/"dataUrl":"@pool:(\d+)"/g, (_, id) => `"dataUrl":"${this.poolIds[Number(id)]}"`);
  }

  /** The document as it is now: the state undo returns to. */
  reset(doc, label = 'Original') {
    this.undoStack = [];
    this.redoStack = [];
    this.pool.clear();
    this.poolIds = [];
    this.current = { label, text: this.pack(serialize(doc)) };
  }

  /** Records that an edit happened. No-op when nothing really changed. */
  push(doc, label) {
    const text = this.pack(serialize(doc));
    if (this.current?.text === text) return false;
    if (this.current) this.undoStack.push(this.current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.current = { label, text };
    this.redoStack = [];
    return true;
  }

  /**
   * Folds a change that is no step of its own (the selection, the current frame) into the state undo returns to.
   * Without it, re-running an operator from that state ("Adjust Last Operation") would find nothing selected.
   */
  amend(doc) {
    if (this.current) this.current.text = this.pack(serialize(doc));
  }

  get canUndo() { return this.undoStack.length > 0; }

  get canRedo() { return this.redoStack.length > 0; }

  /** Steps back; returns the file text to load, or null. */
  undo() {
    if (!this.undoStack.length) return null;
    this.redoStack.push(this.current);
    this.current = this.undoStack.pop();
    return this.unpack(this.current.text);
  }

  redo() {
    if (!this.redoStack.length) return null;
    this.undoStack.push(this.current);
    this.current = this.redoStack.pop();
    return this.unpack(this.current.text);
  }

  /** Labels oldest → newest, with the current position (Edit › Undo History). */
  entries() {
    return {
      items: [...this.undoStack.map((e) => e.label), this.current?.label, ...[...this.redoStack].reverse().map((e) => e.label)].filter(Boolean),
      index: this.undoStack.length,
    };
  }

  /** Jumps to a position of entries(); returns the file text. */
  jump(index) {
    let text = null;
    while (this.undoStack.length > index && this.canUndo) text = this.undo();
    while (this.undoStack.length < index && this.canRedo) text = this.redo();
    return text;
  }
}
