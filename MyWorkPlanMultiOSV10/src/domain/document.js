// An open plan (one tab): the project, where it is saved, its undo history,
// whether it has unsaved changes, and its schedule (recomputed after each change).
import { History } from './history.js';
import { newId } from './project.js';
import { schedule } from './schedule.js';
import { serialize } from './format.js';

/** The plan as saved, without view-only state (collapsed summaries are not a change worth asking about). */
const snapshot = (project) => JSON.stringify(project, (key, value) => (key === 'collapsed' ? undefined : value));

// Serializing a large plan takes tens of milliseconds, and the tabs and the status bar ask
// "unsaved?" on every redraw. So the JSON of the plan and the dirty flag are kept until the
// plan changes: apply/undo/redo, a new `project` or `saved`, or touch() (code that changes
// the plan in place outside apply, such as collapsing summaries or new working hours, calls it).
export class PlanDocument {
  #project;
  #saved;
  /** JSON.stringify(project), or null when unknown. */
  #json = null;
  /** dirty, or null when unknown. */
  #dirty = null;

  constructor(project, { path = null, handle = null, name = null, template = false } = {}) {
    this.id = newId('doc');
    this.project = project;
    this.path = path;
    /** Web: FileSystemFileHandle the plan was opened from / saved to. */
    this.handle = handle;
    this.name = name;
    /** Opened from a template: "Save" asks for a new plan file. */
    this.fromTemplate = template;
    this.history = new History();
    this.saved = snapshot(project);
    /** View state of this tab: which view, scroll, timescale, filter… */
    this.view = { id: 'gantt', scrollTop: 0, scrollLeft: null, filter: 'all', group: 'none', sort: 'id', highlight: false, table: 'entry' };
    this.recalculate();
  }

  get project() { return this.#project; }
  set project(value) { this.#project = value; this.touch(); }

  /** The plan as saved (snapshot form); '' for a plan that was never saved as a MyWorkPlan file. */
  get saved() { return this.#saved; }
  set saved(value) { this.#saved = value; this.#dirty = null; }

  /** The plan was changed in place (outside apply): forget what is known about it. */
  touch() {
    this.#json = null;
    this.#dirty = null;
  }

  get dirty() {
    this.#dirty ??= snapshot(this.#project) !== this.#saved;
    return this.#dirty;
  }

  #currentJson() {
    this.#json ??= JSON.stringify(this.#project);
    return this.#json;
  }

  /** Recomputes the schedule (MS Project "calculate"). */
  recalculate() {
    this.sched = schedule(this.#project);
    return this.sched;
  }

  /** Runs `change(project)` as one undoable step and reschedules. Returns what `change` returned. */
  apply(label, change) {
    const before = this.#currentJson();
    let result;
    try {
      result = change(this.#project);
    } catch (error) {
      // It may have changed part of the plan before failing.
      this.touch();
      throw error;
    }
    const after = JSON.stringify(this.#project);
    if (after !== before) {
      this.history.record(before, label);
      this.#dirty = null;
      this.recalculate();
    }
    this.#json = after;
    return result;
  }

  undo() {
    const entry = this.history.undo(this.#currentJson());
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.recalculate();
    this.#json = entry.snapshot;
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(this.#currentJson());
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.recalculate();
    this.#json = entry.snapshot;
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.fromTemplate = false;
    this.saved = snapshot(this.#project);
    this.#dirty = false;
  }

  text({ template = false } = {}) {
    return serialize(this.#project, { template, sched: this.sched });
  }
}
