// An open drawing (one tab): the document, where it is saved, its undo
// history, whether it has unsaved changes, and its view state (current page,
// zoom, scroll). Connector routes are worked out per page and kept until the
// drawing changes.
import { History } from './history.js';
import { newId } from './diagram.js';
import { routePage } from './routing.js';
import { serialize } from './format.js';

/** The drawing as saved, without view-only state. */
const snapshot = (doc) => JSON.stringify(doc);

export class DiagramDocument {
  #doc;
  #saved;
  /** JSON.stringify(doc), or null when unknown. */
  #json = null;
  /** dirty, or null when unknown. */
  #dirty = null;
  /** page id → routes, cleared on every change. */
  #routes = new Map();

  constructor(doc, { path = null, handle = null, name = null, template = false } = {}) {
    this.id = newId('tab');
    this.doc = doc;
    this.path = path;
    /** Web: FileSystemFileHandle the drawing was opened from / saved to. */
    this.handle = handle;
    this.name = name;
    /** Opened from a template: "Save" asks for a new file. */
    this.fromTemplate = template;
    this.history = new History();
    this.saved = snapshot(doc);
    /** View state of this tab. */
    this.view = { id: 'drawing', pageId: doc.pages[0]?.id ?? null, zoom: null, scrollX: null, scrollY: null, report: 'inventory', filter: '', fit: 'page' };
  }

  get doc() { return this.#doc; }
  set doc(value) { this.#doc = value; this.touch(); }

  /** The current page of this tab (falls back to the first). */
  get page() {
    return this.#doc.pages.find((page) => page.id === this.view.pageId) ?? this.#doc.pages[0];
  }

  get saved() { return this.#saved; }
  set saved(value) { this.#saved = value; this.#dirty = null; }

  /** The drawing was changed in place (outside apply): forget what is known about it. */
  touch() {
    this.#json = null;
    this.#dirty = null;
    this.#routes.clear();
  }

  /** Routes may change without a document change (dragging): drop them. */
  invalidateRoutes() {
    this.#routes.clear();
  }

  get dirty() {
    this.#dirty ??= snapshot(this.#doc) !== this.#saved;
    return this.#dirty;
  }

  #currentJson() {
    this.#json ??= JSON.stringify(this.#doc);
    return this.#json;
  }

  /** Connector routes of a page: Map(connector id → route). */
  routes(page = this.page) {
    if (!page) return new Map();
    let routes = this.#routes.get(page.id);
    if (!routes) {
      routes = routePage(this.#doc, page);
      this.#routes.set(page.id, routes);
    }
    return routes;
  }

  /** Runs `change(doc)` as one undoable step. Returns what `change` returned. */
  apply(label, change) {
    const before = this.#currentJson();
    let result;
    try {
      result = change(this.#doc);
    } catch (error) {
      this.touch();
      throw error;
    }
    const after = JSON.stringify(this.#doc);
    if (after !== before) {
      this.history.record(before, label);
      this.#dirty = null;
      this.#routes.clear();
    }
    this.#json = after;
    return result;
  }

  undo() {
    const entry = this.history.undo(this.#currentJson());
    if (!entry) return null;
    this.doc = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(this.#currentJson());
    if (!entry) return null;
    this.doc = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.fromTemplate = false;
    this.saved = snapshot(this.#doc);
    this.#dirty = false;
  }

  text({ template = false } = {}) {
    return serialize(this.#doc, { template });
  }
}
