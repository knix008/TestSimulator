// A document as the page sees it: the core's document id and info, plus a cache of 4 KiB pages of bytes with
// their modified / unreadable ranges, so the hex view draws from memory and fetches only what scrolls into
// sight. Every edit goes through the core (core.js); afterwards the cache is dropped (`changed`).
import { call as core, fromBase64 } from '../core/core.js';

export const PAGE = 4096;

export class HexDocument {
  /**
   * info: the core's document info ({ id, name, len, modified, … }).
   * source: { kind: 'file'|'memory'|'disk'|'process'|'web', path?, handle?, pid? } — where it came from.
   */
  constructor(info, source = {}) {
    this.info = info;
    this.source = { kind: 'memory', ...source };
    this.pages = new Map();
    this.pending = new Map();
    this.listeners = new Set();
    /** Bookmarks: [{ offset, length, name, color }] (kept per file in the app's file preferences). */
    this.bookmarks = [];
    /** Extra marks drawn by the views: template fields, search results, differences. */
    this.marks = { template: [], search: [], diff: [] };
    this.template = null;
  }

  get id() { return this.info.id; }
  get len() { return this.info.len; }
  get name() { return this.info.name; }
  get path() { return this.source.path ?? null; }
  get modified() { return Boolean(this.info.modified); }
  get readonly() { return Boolean(this.info.readonly); }
  get resizable() { return this.info.resizable !== false; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** The bytes changed (an edit, undo, redo, reload): new info, the cache dropped, the views told. */
  changed(info = null, range = null) {
    if (info) this.info = info;
    this.pages.clear();
    this.pending.clear();
    for (const fn of this.listeners) fn({ range });
  }

  async refreshInfo() { this.info = await core('info', { id: this.id }); return this.info; }

  /** Loads every page touching [offset, offset + length). Resolves when they are in the cache. */
  ensure(offset, length) {
    const first = Math.floor(Math.max(0, offset) / PAGE);
    const last = Math.floor(Math.max(0, Math.min(this.len, offset + length) - 1) / PAGE);
    const waits = [];
    for (let p = first; p <= last && p * PAGE < this.len; p += 1) {
      if (this.pages.has(p)) continue;
      if (!this.pending.has(p)) {
        const version = this.info.version;
        const run = core('read', { id: this.id, offset: p * PAGE, length: PAGE }).then((r) => {
          if (this.info.version !== version && r.version !== this.info.version) return;
          this.pages.set(p, { bytes: fromBase64(r.data), modified: r.modified ?? [], holes: r.holes ?? [] });
        }).finally(() => this.pending.delete(p));
        this.pending.set(p, run);
      }
      waits.push(this.pending.get(p));
    }
    return Promise.all(waits);
  }

  has(offset, length) {
    const first = Math.floor(offset / PAGE);
    const last = Math.floor(Math.max(offset, Math.min(this.len, offset + length) - 1) / PAGE);
    for (let p = first; p <= last; p += 1) if (p * PAGE < this.len && !this.pages.has(p)) return false;
    return true;
  }

  byte(offset) {
    const page = this.pages.get(Math.floor(offset / PAGE));
    return page ? page.bytes[offset % PAGE] : undefined;
  }

  /** Cached bytes [offset, offset + length) (missing ones are 0; check `has` first). */
  slice(offset, length) {
    const end = Math.min(this.len, offset + length);
    const out = new Uint8Array(Math.max(0, end - offset));
    let pos = offset;
    while (pos < end) {
      const p = Math.floor(pos / PAGE);
      const page = this.pages.get(p);
      const from = pos - p * PAGE;
      const n = Math.min(PAGE - from, end - pos);
      if (page) out.set(page.bytes.subarray(from, from + n), pos - offset);
      pos += n;
    }
    return out;
  }

  /** Ranges [[start, end]] of a kind ('modified' | 'holes') overlapping [offset, offset + length), from the cache. */
  ranges(kind, offset, length) {
    const out = [];
    const end = offset + length;
    for (let p = Math.floor(offset / PAGE); p * PAGE < end; p += 1) for (const r of this.pages.get(p)?.[kind] ?? []) if (r[1] > offset && r[0] < end) out.push(r);
    return out;
  }

  /** Fetches bytes straight from the core (any size the core allows), not through the cache. */
  async read(offset, length) {
    const r = await core('slice', { id: this.id, offset, length });
    return fromBase64(r.data);
  }
}
