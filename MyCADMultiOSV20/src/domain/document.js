// An open drawing (one tab): the drawing, where it is saved, its undo history,
// its view (pan/zoom) and whether it has unsaved changes.
import { newId } from './entities.js';
import { syncDrawingClones } from './drawing.js';
import { solveConstraints } from './constraints.js';
import { followRobotTools } from './robot.js';
import { applyBindings } from './spreadsheet.js';
import { solveAssembly } from './assembly.js';
import { resolveAttachments } from './datums.js';
import { solidMesh } from './solids.js';
import { History } from './history.js';

/** id → JSON of every entity a constraint refers to. */
function constrainedState(drawing) {
  const ids = new Set((drawing.constraints ?? []).flatMap((c) => c.refs.map((r) => r.id)));
  return new Map(drawing.entities.filter((e) => ids.has(e.id)).map((e) => [e.id, JSON.stringify(e)]));
}

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
    // Sketch constraints: what the change touched moves least when they are solved again.
    const watched = this.drawing.constraints?.length ? constrainedState(this.drawing) : null;
    const result = change(this.drawing);
    // Clones follow their sources whatever changed; bound values follow the spreadsheet.
    syncDrawingClones(this.drawing);
    if (this.drawing.entities.some((e) => e.bind)) applyBindings(this.drawing);
    // Assembly: joints whose parts are gone go too; the rest place their parts.
    if (this.drawing.joints) {
      const ids = new Set(this.drawing.entities.map((e) => e.id));
      this.drawing.joints = this.drawing.joints.filter((j) => ids.has(j.base) && ids.has(j.part));
      if (this.drawing.joints.length) {
        // Loops solve the free joint values: they are kept (the next solve starts there).
        const run = solveAssembly(this.drawing.entities, this.drawing.joints);
        this.drawing.entities = run.entities;
        this.drawing.joints = run.joints;
        this.assemblyStatus = { failed: run.failed, error: run.error };
      }
      else { delete this.drawing.joints; delete this.drawing.animation; }
    }
    // Robot_AddToolShape: a robot's tool follows its flange.
    if (this.drawing.robots) followRobotTools(this.drawing);
    // Part_EditAttachment: attached datums and solids follow what they are attached to.
    if (this.drawing.entities.some((e) => e.attach)) resolveAttachments(this.drawing, solidMesh);
    if (this.drawing.constraints?.length || watched) {
      const after = constrainedState(this.drawing);
      const moved = new Set([...after].filter(([id, json]) => watched?.get(id) !== json).map(([id]) => id));
      this.constraintStatus = solveConstraints(this.drawing, { moved });
      if (!this.drawing.constraints?.length) delete this.drawing.constraints;
    }
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
