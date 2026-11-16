// The open document plus undo/redo.
//
// Every edit goes through store.edit(label, fn): the project is snapshotted
// (as JSON) before fn mutates it, so undo is just "put the old JSON back".
// Plans are small, so whole snapshots are simpler and safer than
// per-operation inverse commands. Drags call begin() on pointer-down and
// commit() on release so one drag is one undo step.
//
// Imported 3D model assets (project.models, base64 GLB) can be large and never
// change once imported, so they are kept out of the snapshots: undo restores
// everything else and keeps the current asset list. Tracing images (underlay
// src data URLs) are stored once in an image pool and referenced from the
// snapshots, so moving an underlay does not copy its picture into every step.

import { normalizeProject, newProject, serializeProject } from "../core/project.js";

const LIMIT = 200;

export class Store {
  constructor() {
    this.project = normalizeProject(newProject());
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Map();
    this.dirty = false;
    this.filePath = null;
    this.fileName = null;
    this.pending = null;
    this.revision = 0;
    this.images = new Map(); // pool key → image data URL
    this.imageKeys = new Map(); // image data URL → pool key
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) {
      try { fn(data); } catch (e) { console.error(e); }
    }
  }

  load(project, { fileName = null, filePath = null } = {}) {
    this.project = normalizeProject(project);
    this.undoStack = [];
    this.redoStack = [];
    this.images.clear();
    this.imageKeys.clear();
    this.dirty = false;
    this.fileName = fileName;
    this.filePath = filePath;
    this.pending = null;
    this.revision++;
    this.emit("load", this.project);
    this.emit("change", { label: "load", load: true });
  }

  snapshot() {
    return JSON.stringify({ ...this.project, models: undefined }, (k, v) => {
      if (k !== "src" || typeof v !== "string" || v.length < 2048) return v;
      let key = this.imageKeys.get(v);
      if (!key) { key = `@img:${this.images.size + 1}`; this.images.set(key, v); this.imageKeys.set(v, key); }
      return key;
    });
  }

  // One-shot edit. Returns whatever fn returns.
  edit(label, fn) {
    const before = this.pending ? null : this.snapshot();
    const result = fn(this.project);
    if (result === false) return result; // fn may veto (nothing changed)
    if (before) this.push(label, before);
    this.touch(label);
    return result;
  }

  // Start a long edit (drag). Mutate freely, then commit() or cancel().
  begin(label) {
    if (this.pending) return;
    this.pending = { label, before: this.snapshot() };
  }

  commit({ changed = true } = {}) {
    if (!this.pending) return;
    const { label, before } = this.pending;
    this.pending = null;
    if (!changed || before === this.snapshot()) return;
    this.push(label, before);
    this.touch(label);
  }

  cancel() {
    if (!this.pending) return;
    this.project = this.parse(this.pending.before);
    this.pending = null;
    this.emit("change", { label: "cancel" });
  }

  parse(json) {
    const p = JSON.parse(json, (k, v) => (k === "src" && typeof v === "string" && v.startsWith("@img:") && this.images.has(v) ? this.images.get(v) : v));
    p.models = this.project.models || [];
    return p;
  }

  push(label, before) {
    this.undoStack.push({ label, json: before });
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  touch(label) {
    this.dirty = true;
    this.revision++;
    this.emit("change", { label });
  }

  // Live preview while dragging: redraw without recording.
  preview() {
    this.revision++;
    this.emit("preview", {});
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undoLabel() { return this.undoStack.at(-1)?.label || ""; }
  redoLabel() { return this.redoStack.at(-1)?.label || ""; }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push({ label: step.label, json: this.snapshot() });
    this.restore(step.json);
    return step.label;
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push({ label: step.label, json: this.snapshot() });
    this.restore(step.json);
    return step.label;
  }

  restore(json) {
    this.project = this.parse(json);
    this.dirty = true;
    this.revision++;
    this.emit("change", { label: "undo", restore: true });
  }

  history() {
    return { undo: this.undoStack.map((s) => s.label), redo: this.redoStack.map((s) => s.label).reverse() };
  }

  serialize() {
    return serializeProject(this.project);
  }

  markSaved({ fileName, filePath } = {}) {
    this.dirty = false;
    if (fileName) this.fileName = fileName;
    if (filePath !== undefined) this.filePath = filePath;
    this.emit("saved", {});
  }
}
