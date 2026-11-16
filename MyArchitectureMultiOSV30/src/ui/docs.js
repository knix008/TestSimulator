// Open documents (one tab each). The app keeps a single Store; its listeners
// (plan, 3D, panels, tutorial) stay attached to it, and switching tabs swaps the
// Store's document fields — project, undo/redo stacks, image pool, file name and
// path, dirty flag — with the ones parked in the tab being activated. The
// active tab's live state is always the Store itself; the others hold a copy of
// those fields in `doc.state`. `doc.view` is app-owned view state (plan level,
// zoom, 3D camera, …) that this module only stores. No DOM here: unit-testable.

import { newProject, normalizeProject } from "../core/project.js";

// Store fields that belong to one document. `revision` stays global (it only
// ever grows, so caches and the tutorial's "changed since" checks keep working).
export const DOC_FIELDS = ["project", "undoStack", "redoStack", "images", "imageKeys", "dirty", "filePath", "fileName", "pending"];

let seq = 0;
const nextId = () => `doc${++seq}`;

export function blankState(title = "") {
  return { project: normalizeProject(newProject(title)), undoStack: [], redoStack: [], images: new Map(), imageKeys: new Map(), dirty: false, filePath: null, fileName: null, pending: null };
}

export class DocumentSet {
  constructor(store) {
    this.store = store;
    const first = { id: nextId(), state: null, view: {} };
    this.docs = [first];
    this.activeId = first.id;
  }

  get active() { return this.byId(this.activeId); }
  get count() { return this.docs.length; }
  byId(id) { return this.docs.find((d) => d.id === id) || null; }
  indexOf(id) { return this.docs.findIndex((d) => d.id === id); }

  // The document fields of a tab: the Store's for the active one.
  stateOf(doc) { return doc.id === this.activeId ? this.store : doc.state; }

  // Never edited, never saved, not from a file: an empty "Untitled" that a
  // newly opened drawing may take over instead of opening another tab.
  isUntouched(doc = this.active) {
    const s = this.stateOf(doc);
    return !s.dirty && !s.fileName && !s.filePath && !s.undoStack.length && !s.redoStack.length;
  }

  info(doc) {
    const s = this.stateOf(doc);
    return { id: doc.id, fileName: s.fileName || "", filePath: s.filePath || "", title: (s.project && s.project.meta && s.project.meta.title) || "", dirty: !!s.dirty, active: doc.id === this.activeId };
  }

  list() { return this.docs.map((d) => this.info(d)); }
  dirtyDocs() { return this.docs.filter((d) => this.stateOf(d).dirty); }
  findByPath(path) {
    if (!path) return null;
    const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();
    return this.docs.find((d) => { const s = this.stateOf(d); return s.filePath && norm(s.filePath) === norm(path); }) || null;
  }

  capture() {
    const doc = this.active;
    doc.state = Object.fromEntries(DOC_FIELDS.map((k) => [k, this.store[k]]));
    return doc;
  }

  apply(doc) {
    for (const k of DOC_FIELDS) this.store[k] = doc.state[k];
    doc.state = null;
    this.activeId = doc.id;
    this.store.revision++;
  }

  // Park the active document and make `id` the live one. Returns the tab.
  switchTo(id) {
    const doc = this.byId(id);
    if (!doc || id === this.activeId) return doc;
    this.capture();
    this.apply(doc);
    return doc;
  }

  // Open a new tab after the active one (or at `index`) and make it active,
  // with a blank document (or `state`) in the Store.
  add({ state = null, index = null, view = {} } = {}) {
    const doc = { id: nextId(), state: state || blankState(), view };
    const at = index == null ? this.indexOf(this.activeId) + 1 : Math.max(0, Math.min(this.docs.length, index));
    this.docs.splice(at, 0, doc);
    this.capture();
    this.apply(doc);
    return doc;
  }

  // Remove a tab. Closing the active one activates its right-hand neighbour
  // (or the left one at the end); closing the last leaves one blank tab.
  remove(id) {
    const i = this.indexOf(id);
    if (i < 0) return null;
    if (this.docs.length === 1) {
      const fresh = this.add();
      this.docs.splice(this.indexOf(id), 1);
      return fresh;
    }
    if (id === this.activeId) {
      const next = this.docs[i + 1] || this.docs[i - 1];
      this.switchTo(next.id);
    }
    this.docs.splice(this.indexOf(id), 1);
    return this.active;
  }

  move(id, toIndex) {
    const i = this.indexOf(id);
    if (i < 0) return;
    const [d] = this.docs.splice(i, 1);
    this.docs.splice(Math.max(0, Math.min(this.docs.length, toIndex)), 0, d);
  }

  // The tab `step` places from the active one, wrapping around.
  neighbour(step) {
    const n = this.docs.length;
    return this.docs[(((this.indexOf(this.activeId) + step) % n) + n) % n];
  }
}
