// An open project (one tab): the project, where it is saved, its undo
// history, whether it has unsaved changes, the element index (id → element,
// rebuilt after each change) and the view state: the open diagrams (working
// diagrams, shown as tabs under the canvas), the current one, and zoom and
// scroll per diagram.
import { History } from './history.js';
import { allDiagrams, buildIndex, newId } from './model.js';
import { serialize } from './format.js';

const snapshot = (project) => JSON.stringify(project);

export class ProjectDocument {
  #project;
  #saved;
  #json = null;
  #dirty = null;
  #index = null;

  constructor(project, { path = null, handle = null, name = null, template = false } = {}) {
    this.id = `tab-${newId()}`;
    this.project = project;
    this.path = path;
    /** Web: FileSystemFileHandle the project was opened from / saved to. */
    this.handle = handle;
    this.name = name;
    /** Opened from a template or an import: "Save" asks for a new file. */
    this.fromTemplate = template;
    this.history = new History();
    this.saved = snapshot(project);
    const diagrams = allDiagrams(project);
    const first = diagrams.find((d) => d.defaultDiagram) ?? diagrams[0] ?? null;
    /** View state of this tab. */
    this.view = { diagramId: first?._id ?? null, open: first ? [first._id] : [], zoom: {}, scroll: {}, expanded: new Set() };
  }

  get project() { return this.#project; }
  set project(value) { this.#project = value; this.touch(); }
  /** Compatibility name used by shared code. */
  get doc() { return this.#project; }

  get index() {
    this.#index ??= buildIndex(this.#project);
    return this.#index;
  }

  /** The current diagram (falls back to the first open one). */
  get diagram() {
    const index = this.index;
    let diagram = this.view.diagramId ? index.get(this.view.diagramId) : null;
    if (!diagram || !/Diagram$/.test(diagram._type)) {
      this.view.open = this.view.open.filter((id) => index.get(id));
      diagram = this.view.open.length ? index.get(this.view.open[0]) : null;
      this.view.diagramId = diagram?._id ?? null;
    }
    return diagram;
  }

  get saved() { return this.#saved; }
  set saved(value) { this.#saved = value; this.#dirty = null; }

  /** The project was changed in place (outside apply, e.g. while dragging): forget what is known about it. */
  touch() {
    this.#json = null;
    this.#dirty = null;
    this.#index = null;
  }

  get dirty() {
    this.#dirty ??= snapshot(this.#project) !== this.#saved;
    return this.#dirty;
  }

  #currentJson() {
    this.#json ??= JSON.stringify(this.#project);
    return this.#json;
  }

  /** Runs `change(project)` as one undoable step. Returns what `change` returned. */
  apply(label, change) {
    const before = this.#currentJson();
    let result;
    try {
      result = change(this.#project);
    } catch (error) {
      this.touch();
      throw error;
    }
    const after = JSON.stringify(this.#project);
    if (after !== before) {
      this.history.record(before, label);
      this.#dirty = null;
      this.#index = null;
    }
    this.#json = after;
    return result;
  }

  undo() {
    const entry = this.history.undo(this.#currentJson());
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(this.#currentJson());
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  /** Opens a diagram (adds it to the working diagrams) and makes it current. */
  openDiagram(id) {
    if (!this.view.open.includes(id)) this.view.open.push(id);
    this.view.diagramId = id;
  }

  /** Closes a working diagram. */
  closeDiagram(id) {
    const at = this.view.open.indexOf(id);
    if (at < 0) return;
    this.view.open.splice(at, 1);
    if (this.view.diagramId === id) this.view.diagramId = this.view.open[Math.min(at, this.view.open.length - 1)] ?? null;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.fromTemplate = false;
    this.saved = snapshot(this.#project);
    this.#dirty = false;
  }

  text({ template = false } = {}) {
    return serialize(this.#project, { template });
  }
}
