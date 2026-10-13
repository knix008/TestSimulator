// An open drawing (one tab): the drawing, where it is saved, its undo history,
// its view (pan/zoom) and whether it has unsaved changes.
import { newId } from './entities.js';
import { History } from './history.js';

export class DrawingDocument {
  constructor(drawing, { path = null, handle = null, name = null, format = 'mcad' } = {}) {
    this.id = newId('doc');
    this.drawing = drawing;
    this.path = path;
    /** Web: FileSystemFileHandle the drawing was opened from / saved to. */
    this.handle = handle;
    this.name = name;
    /** 'mcad', or 'dxf' for an imported DXF (saving asks for a .mcad name). */
    this.format = format;
    this.history = new History();
    this.saved = JSON.stringify(drawing);
    /** View: centre (drawing units) and zoom (screen px per mm); null = fit on first show. */
    this.view = null;
  }

  get dirty() {
    return JSON.stringify(this.drawing) !== this.saved;
  }

  /** Runs `change(drawing)` as one undoable step. Returns what `change` returned. */
  apply(label, change) {
    const before = JSON.stringify(this.drawing);
    const result = change(this.drawing);
    if (JSON.stringify(this.drawing) !== before) this.history.record(before, label);
    return result;
  }

  undo() {
    const entry = this.history.undo(JSON.stringify(this.drawing));
    if (!entry) return null;
    this.drawing = JSON.parse(entry.snapshot);
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(JSON.stringify(this.drawing));
    if (!entry) return null;
    this.drawing = JSON.parse(entry.snapshot);
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.format = 'mcad';
    this.saved = JSON.stringify(this.drawing);
  }
}
