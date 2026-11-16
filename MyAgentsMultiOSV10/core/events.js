// In-process event bus (ARCHITECTURE §6).
// Event: { type: '<entity>.<verb>', topics: string[], id, rev, data, by, at, client, depth? }
// Subscribers are called synchronously in registration order; async subscribers are tracked so tests
// (and shutdown) can wait for them with `idle()`.

export class EventBus {
  constructor() {
    /** @type {Array<{pattern: string, fn: Function}>} */
    this.subs = [];
    /** @type {Set<Promise<any>>} */
    this.pending = new Set();
    this.onError = (err, ev) => { console.error('[events] subscriber failed for', ev?.type, err); };
  }

  /**
   * @param {string} pattern '*' | 'issue.*' | exact type
   * @param {(event: object) => any} fn
   * @returns {() => void} unsubscribe
   */
  on(pattern, fn) {
    const sub = { pattern, fn };
    this.subs.push(sub);
    return () => { this.subs = this.subs.filter((s) => s !== sub); };
  }

  /** @param {object} event */
  emit(event) {
    if (!event.at) event.at = Date.now();
    for (const { pattern, fn } of this.subs) {
      if (!matches(pattern, event.type)) continue;
      try {
        const r = fn(event);
        if (r && typeof r.then === 'function') {
          const p = r.catch((err) => this.onError(err, event)).finally(() => this.pending.delete(p));
          this.pending.add(p);
        }
      } catch (err) {
        this.onError(err, event);
      }
    }
  }

  /** Resolves when no async subscriber work is pending (including work started by that work). */
  async idle() {
    for (let i = 0; i < 100 && this.pending.size; i++) {
      await Promise.allSettled([...this.pending]);
    }
  }
}

function matches(pattern, type) {
  if (pattern === '*' || pattern === type) return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return false;
}
