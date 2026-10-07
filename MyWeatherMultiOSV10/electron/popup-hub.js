export class PopupHub {
  constructor() {
    this.windows = new Map();
    this.waiters = new Map();
    this.pending = new Map();
    this.sequence = 0;
  }

  begin(spec, createWindow) {
    this.sequence += 1;
    const id = `${spec.type}-${this.sequence}`;
    const stored = { ...spec, popupId: id };
    const win = createWindow(stored);
    this.windows.set(id, { spec: stored, win });
    return id;
  }

  take(id) {
    return this.windows.get(id)?.spec || null;
  }

  update(id, patch) {
    this.windows.get(id)?.win.send?.(patch);
  }

  wait(id) {
    if (this.pending.has(id)) {
      const result = this.pending.get(id);
      this.pending.delete(id);
      return Promise.resolve(result);
    }
    return new Promise((resolve) => {
      const list = this.waiters.get(id) || [];
      list.push(resolve);
      this.waiters.set(id, list);
    });
  }

  finish(id, result) {
    const entry = this.windows.get(id);
    this.windows.delete(id);
    const waiters = this.waiters.get(id) || [];
    this.waiters.delete(id);
    if (!waiters.length) this.pending.set(id, result);
    else waiters.forEach((resolve) => resolve(result));
    try {
      entry?.win.close?.();
    } catch {
      /* already closed */
    }
    return result;
  }

  closeAll() {
    for (const id of [...this.windows.keys()]) this.finish(id, { action: "close" });
  }
}
