import { keepsOneWindow, popupKey } from "../src/ui/menu-layout.js";

export class PopupHub {
  constructor() {
    this.windows = new Map();
    this.waiters = new Map();
    this.pending = new Map();
    this.sequence = 0;
  }

  /** Each weather window keeps its own dialogs, so a key is only unique within one owner. */
  begin(spec, createWindow, owner = "") {
    const key = this.scoped(popupKey(spec), owner);
    if (keepsOneWindow(spec)) {
      for (const entry of this.windows.values()) {
        if (entry.key !== key) continue;
        entry.win.focus?.();
        return { id: entry.spec.popupId, focused: true };
      }
    }
    this.sequence += 1;
    const id = `${spec.type}-${this.sequence}`;
    const stored = { ...spec, popupId: id };
    const win = createWindow(stored);
    this.windows.set(id, { spec: stored, win, key, owner });
    return { id, focused: false };
  }

  scoped(key, owner) {
    return `${owner || ""}#${key}`;
  }

  take(id) {
    return this.windows.get(id)?.spec || null;
  }

  refresh(key, patch, options = {}, owner = "") {
    const scoped = this.scoped(key, owner);
    for (const entry of this.windows.values()) {
      if (entry.key !== scoped) continue;
      entry.spec = { ...entry.spec, ...patch };
      if (options.focus !== false) entry.win.focus?.();
      entry.win.send?.(patch);
      return { id: entry.spec.popupId, focused: true };
    }
    return null;
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

  /** A weather window that goes away takes its own dialogs with it. */
  closeOwned(owner) {
    for (const [id, entry] of [...this.windows]) {
      if (entry.owner === owner) this.finish(id, { action: "close" });
    }
  }
}
