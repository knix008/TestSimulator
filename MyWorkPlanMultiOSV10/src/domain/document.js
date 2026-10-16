// An open plan (one tab): the project, where it is saved, its undo history,
// whether it has unsaved changes, and its schedule (recomputed after each change).
import { History } from './history.js';
import { newId } from './project.js';
import { schedule } from './schedule.js';
import { serialize } from './format.js';

/** The plan as saved, without view-only state (collapsed summaries are not a change worth asking about). */
const snapshot = (project) => JSON.stringify(project, (key, value) => (key === 'collapsed' ? undefined : value));

export class PlanDocument {
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

  get dirty() {
    return snapshot(this.project) !== this.saved;
  }

  /** Recomputes the schedule (MS Project "calculate"). */
  recalculate() {
    this.sched = schedule(this.project);
    return this.sched;
  }

  /** Runs `change(project)` as one undoable step and reschedules. Returns what `change` returned. */
  apply(label, change) {
    const before = JSON.stringify(this.project);
    const result = change(this.project);
    if (JSON.stringify(this.project) !== before) {
      this.history.record(before, label);
      this.recalculate();
    }
    return result;
  }

  undo() {
    const entry = this.history.undo(JSON.stringify(this.project));
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.recalculate();
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(JSON.stringify(this.project));
    if (!entry) return null;
    this.project = JSON.parse(entry.snapshot);
    this.recalculate();
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.fromTemplate = false;
    this.saved = snapshot(this.project);
  }

  text({ template = false } = {}) {
    return serialize(this.project, { template, sched: this.sched });
  }
}
