// Undo/redo over whole-state snapshots. Successive changes from the same source (typing in
// one field, dragging one slider) within `mergeMs` become a single step.

export class History {
  constructor({ limit = 100, mergeMs = 700, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.mergeMs = mergeMs;
    this.now = now;
    this.entries = [];
    this.index = -1;
    this.lastKey = null;
    this.lastTime = 0;
  }

  /** Starts over with `snapshot` as the only state. */
  reset(snapshot) {
    this.entries = [JSON.stringify(snapshot)];
    this.index = 0;
    this.lastKey = null;
  }

  /** Records the state after a change. Returns true when it became (or updated) a step. */
  record(snapshot, key = "") {
    const json = JSON.stringify(snapshot);
    if (json === this.entries[this.index]) return false;
    const time = this.now();
    const merge = key && key === this.lastKey && time - this.lastTime < this.mergeMs && this.index > 0 && this.index === this.entries.length - 1;
    this.lastKey = key;
    this.lastTime = time;
    if (merge) {
      this.entries[this.index] = json;
      return true;
    }
    this.entries.length = this.index + 1; // a new change drops the redo branch
    this.entries.push(json);
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
    return true;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.entries.length - 1;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    this.lastKey = null;
    return JSON.parse(this.entries[this.index]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    this.lastKey = null;
    return JSON.parse(this.entries[this.index]);
  }
}
