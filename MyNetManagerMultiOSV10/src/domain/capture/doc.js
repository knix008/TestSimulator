// One open capture (a tab): the frames, their summaries from the first pass, the display filter
// and the rows it shows, marks / ignores / time references, cached dissections and colours.
// No DOM: the views read it, app.js changes it. Long passes run in slices so the window stays live.
import { createSession, dissect, FIELDS } from '../dissect/index.js';
import { compileFilter } from '../filter/index.js';
import { compileRules, matchColor } from '../filter/coloring.js';

const CACHE_SIZE = 400;
const SLICE_MS = 24;
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

let docCount = 0;

export class CaptureDoc {
  /** file: CaptureFile (pcap.js). prefs: dissector preferences (name resolution, decode as …). */
  constructor({ name, path = null, file, prefs = {}, handle = null, live = false }) {
    this.id = `cap-${++docCount}`;
    this.name = name;
    this.path = path;
    this.handle = handle;
    this.file = file;
    this.prefs = prefs;
    this.live = live;
    this.dirty = false;
    this.session = createSession(file, prefs);
    this.summaries = [];
    /** Summaries made with the whole file known ("reply in 5"), for the rows on screen. */
    this.full = [];
    /** Indices into frames of the rows the packet list shows (all frames until a filter is applied). */
    this.displayed = [];
    this.filterText = '';
    this.filter = null;
    this.marked = new Set();
    this.ignored = new Set();
    this.timeRefs = new Set();
    this.selected = -1;
    this.history = { back: [], forward: [] };
    this.cache = new Map();
    this.colors = new Map();
    this.coloring = null;
    this.passed = 0;
    this.busy = null;
    this.stats = { recv: 0, drop: 0 };
    this.expanded = new Set();
  }

  get frames() { return this.file.frames; }
  get count() { return this.file.frames.length; }

  /** Sets the colouring rules (compiled once; colours are found lazily for the rows on screen). */
  setColoring(rules) {
    this.coloring = rules ? compileRules(rules, { fields: FIELDS }) : null;
    this.colors.clear();
  }

  /** The first pass over frames not yet seen (all of them after open; new ones while capturing). */
  async firstPass({ onProgress = null, signal = null } = {}) {
    const frames = this.frames;
    let last = performance.now();
    while (this.passed < frames.length) {
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
      const frame = frames[this.passed];
      if (frame.no == null) frame.no = this.passed + 1;
      let summary;
      try {
        summary = this.session.firstPass(frame);
      } catch (error) {
        summary = { no: frame.no, protocol: 'ERROR', info: String(error?.message ?? error), src: '', dst: '', length: frame.len, layers: 'frame', expert: 'error' };
      }
      this.summaries[this.passed] = summary;
      if (!this.filter || this.matches(this.passed)) this.displayed.push(this.passed);
      this.passed += 1;
      const now = performance.now();
      if (now - last > SLICE_MS) {
        onProgress?.(this.passed, frames.length);
        await nextTick();
        last = performance.now();
      }
    }
    onProgress?.(this.passed, frames.length);
  }

  /** The first pass for frames that arrived just now (live capture): no awaiting, small batches. */
  passNew() {
    const added = [];
    while (this.passed < this.frames.length) {
      const index = this.passed;
      const frame = this.frames[index];
      if (frame.no == null) frame.no = index + 1;
      try {
        this.summaries[index] = this.session.firstPass(frame);
      } catch (error) {
        this.summaries[index] = { no: frame.no, protocol: 'ERROR', info: String(error?.message ?? error), src: '', dst: '', length: frame.len, layers: 'frame', expert: 'error' };
      }
      this.passed += 1;
      if (!this.filter || this.matches(index)) { this.displayed.push(index); added.push(index); }
    }
    if (added.length) this.full = [];
    return added;
  }

  /**
   * The summary a row shows: re-made with every frame known (request/response links, "reassembled in")
   * once the first pass is complete; the first-pass one while frames are still coming in.
   */
  summary(index) {
    if (this.live || this.passed < this.count || typeof this.session.summarize !== 'function') return this.summaries[index];
    let s = this.full[index];
    if (!s) {
      try { s = this.session.summarize(this.frames[index]); } catch { s = this.summaries[index]; }
      this.full[index] = s ?? this.summaries[index];
    }
    return s ?? this.summaries[index];
  }

  /** The highest expert severity of frame `index` ('error' | 'warn' | 'note' | 'chat' | null), from its full dissection. */
  expertOf(index) {
    const known = this.summaries[index]?.expert;
    if (known) return known;
    const rank = { chat: 1, note: 2, warn: 3, error: 4 };
    let best = null;
    for (const e of this.dissection(index).expert ?? []) if (!best || rank[e.severity] > rank[best]) best = e.severity;
    return best;
  }

  /** The full dissection of frame `index` (cached; the least recently used are dropped). */
  dissection(index) {
    const hit = this.cache.get(index);
    if (hit) {
      this.cache.delete(index);
      this.cache.set(index, hit);
      return hit;
    }
    const frame = this.frames[index];
    let d;
    try {
      d = dissect(this.session, frame, { tree: true });
    } catch (error) {
      d = { tree: [], columns: { protocol: 'ERROR', info: String(error?.message ?? error) }, fields: new Map(), layers: ['frame'], expert: [], sources: [{ name: `Frame (${frame.caplen} bytes)`, data: frame.data }] };
    }
    this.withColumns(index, d);
    this.cache.set(index, d);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
    return d;
  }

  /** Dissection without keeping it (filters, statistics over every frame). */
  dissectOnce(index) {
    return this.cache.get(index) ?? this.withColumns(index, dissect(this.session, this.frames[index], { tree: true }));
  }

  /**
   * `_ws.col.protocol` / `_ws.col.info` as the packet list shows them (the summary made with the whole file known),
   * so a filter on a column picks exactly the rows that read so — e.g. a TLS 1.3 Client Hello reads TLSv1.3 only
   * once its Server Hello is known.
   */
  withColumns(index, d) {
    const s = this.summary(index);
    if (s && d?.fields) {
      d.fields.set('_ws.col.protocol', [{ abbrev: '_ws.col.protocol', type: 'string', value: String(s.protocol ?? ''), start: 0, length: 0 }]);
      d.fields.set('_ws.col.info', [{ abbrev: '_ws.col.info', type: 'string', value: String(s.info ?? ''), start: 0, length: 0 }]);
    }
    return d;
  }

  matches(index) {
    if (!this.filter) return true;
    try {
      return Boolean(this.filter.test(this.dissectOnce(index)));
    } catch {
      return false;
    }
  }

  /** The colour rule of a row: { name, fg, bg } or null (lazily, the rows on screen only). */
  colorOf(index) {
    if (!this.coloring) return null;
    if (this.colors.has(index)) return this.colors.get(index);
    let color = null;
    try { color = matchColor(this.coloring, this.dissectOnce(index)); } catch { color = null; }
    this.colors.set(index, color);
    return color;
  }

  /**
   * Applies a display filter (text '' clears it). Resolves to { ok, error, at, count } — an invalid
   * filter leaves the list as it was.
   */
  async applyFilter(text, { onProgress = null, signal = null } = {}) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      this.filterText = '';
      this.filter = null;
      this.displayed = Array.from({ length: this.passed }, (_, i) => i);
      return { ok: true, count: this.displayed.length };
    }
    const compiled = compileFilter(trimmed, { fields: FIELDS });
    if (!compiled.ok) return { ok: false, error: compiled.error, at: compiled.at, code: compiled.code };
    const shown = [];
    let last = performance.now();
    for (let i = 0; i < this.passed; i += 1) {
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
      let pass = false;
      try { pass = Boolean(compiled.test(this.dissectOnce(i))); } catch { pass = false; }
      if (pass) shown.push(i);
      const now = performance.now();
      if (now - last > SLICE_MS) {
        onProgress?.(i, this.passed);
        await nextTick();
        last = performance.now();
      }
    }
    this.filterText = trimmed;
    this.filter = compiled;
    this.displayed = shown;
    return { ok: true, count: shown.length };
  }

  /** Re-runs the first pass from scratch (after Decode As, name resolution or protocol changes). */
  async redissect(prefs, options = {}) {
    this.prefs = prefs ?? this.prefs;
    this.session = createSession(this.file, this.prefs);
    this.summaries = [];
    this.full = [];
    this.displayed = [];
    this.passed = 0;
    this.cache.clear();
    this.colors.clear();
    const filter = this.filterText;
    this.filter = null;
    await this.firstPass(options);
    if (filter) await this.applyFilter(filter, options);
  }

  // ───────────────────────── rows

  rowOf(index) { return this.displayed.indexOf(index); }

  /** Selects frame `index` and remembers the move for Go Back / Go Forward. */
  select(index, { remember = true } = {}) {
    if (index === this.selected) return;
    if (remember && this.selected >= 0) {
      this.history.back.push(this.selected);
      if (this.history.back.length > 200) this.history.back.shift();
      this.history.forward = [];
    }
    this.selected = index;
  }

  toggleMark(indices) {
    const all = indices.every((i) => this.marked.has(i));
    for (const i of indices) { if (all) this.marked.delete(i); else this.marked.add(i); }
  }

  toggleIgnore(indices) {
    const all = indices.every((i) => this.ignored.has(i));
    for (const i of indices) { if (all) this.ignored.delete(i); else this.ignored.add(i); }
  }

  toggleTimeRef(index) {
    if (this.timeRefs.has(index)) this.timeRefs.delete(index); else this.timeRefs.add(index);
  }

  setComment(index, text) {
    const frame = this.frames[index];
    const value = String(text ?? '').trim() || null;
    if ((frame.comment ?? null) === value) return false;
    frame.comment = value;
    this.cache.delete(index);
    this.dirty = true;
    return true;
  }

  // ───────────────────────── time

  /** Seconds (float) of frame `index` from the epoch. */
  epoch(index) {
    const f = this.frames[index];
    return f.sec + f.nsec / 1e9;
  }

  /** Relative time: from the first frame, or from the last time reference at or before it. */
  relative(index) {
    let ref = 0;
    if (this.timeRefs.size) for (const r of this.timeRefs) if (r <= index && r > ref) ref = r;
    return this.epoch(index) - this.epoch(this.timeRefs.has(0) ? 0 : ref);
  }

  delta(index) { return index > 0 ? this.epoch(index) - this.epoch(index - 1) : 0; }

  deltaDisplayed(row) {
    if (row <= 0) return 0;
    return this.epoch(this.displayed[row]) - this.epoch(this.displayed[row - 1]);
  }

  /** Number of decimals the file's time stamps carry (6 or 9). */
  precision() {
    const res = this.file.interfaces?.[0]?.tsresol;
    return res === 9 ? 9 : 6;
  }

  /** Displayed / total / marked / ignored counts for the status bar. */
  counts() {
    return { total: this.passed, displayed: this.displayed.length, marked: this.marked.size, ignored: this.ignored.size, loading: this.passed < this.count };
  }
}

const pad = (value, width = 2) => String(value).padStart(width, '0');

function dateParts(seconds, utc) {
  const date = new Date(Math.floor(seconds) * 1000);
  const get = (local, univ) => (utc ? date[univ]() : date[local]());
  return {
    y: get('getFullYear', 'getUTCFullYear'), mo: get('getMonth', 'getUTCMonth') + 1, d: get('getDate', 'getUTCDate'),
    h: get('getHours', 'getUTCHours'), mi: get('getMinutes', 'getUTCMinutes'), s: get('getSeconds', 'getUTCSeconds'),
    doy: Math.floor((Date.UTC(get('getFullYear', 'getUTCFullYear'), get('getMonth', 'getUTCMonth'), get('getDate', 'getUTCDate')) - Date.UTC(get('getFullYear', 'getUTCFullYear'), 0, 1)) / 86400000) + 1,
  };
}

function fraction(frame, digits) {
  if (digits <= 0) return '';
  return `.${pad(frame.nsec, 9).slice(0, digits)}`;
}

/** The Time column of row `row` (frame `index`) in one of Wireshark's formats. */
export function formatTime(doc, index, row, format, precision = 'auto') {
  const frame = doc.frames[index];
  const digits = precision === 'auto' ? doc.precision() : Number(precision);
  const fixed = (value) => (Number.isFinite(value) ? value.toFixed(digits) : '');
  if (doc.timeRefs.has(index) && (format === 'relative' || format === 'delta' || format === 'delta_displayed')) return '*REF*';
  switch (format) {
    case 'relative': return fixed(doc.relative(index));
    case 'delta': return fixed(doc.delta(index));
    case 'delta_displayed': return fixed(doc.deltaDisplayed(row));
    case 'epoch': return `${frame.sec}${fraction(frame, digits)}`;
    default: {
      const utc = format.startsWith('utc');
      const p = dateParts(frame.sec, utc);
      const clock = `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${fraction(frame, digits)}`;
      if (format.endsWith('_ymd')) return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${clock}`;
      if (format.endsWith('_ydoy')) return `${p.y}/${pad(p.doy, 3)} ${clock}`;
      return clock;
    }
  }
}

/** Reads the value of a custom column (field abbrev, `a || b` alternatives) from a dissection. */
export function fieldColumn(d, spec) {
  for (const name of String(spec).split('||').map((part) => part.trim()).filter(Boolean)) {
    const nodes = d.fields?.get(name);
    if (nodes?.length) return nodes.map((node) => displayValue(node)).join(',');
  }
  return '';
}

/** The value of a node as the packet list and "Copy › Value" show it. */
export function displayValue(node) {
  const value = node.value;
  if (value == null) return '';
  if (value instanceof Uint8Array) return Array.from(value.subarray(0, 64), (b) => b.toString(16).padStart(2, '0')).join(':') + (value.length > 64 ? '…' : '');
  if (typeof value === 'object' && 'sec' in value) return `${value.sec}.${String(value.nsec ?? 0).padStart(9, '0')}`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number' && node.type === 'rel_time') return value.toFixed(9);
  const label = node.label ?? '';
  // Value strings ("Type: A (1)"): the column shows the name like Wireshark.
  const match = /:\s(.+?)\s\((?:0x[0-9a-f]+|\d+)\)$/i.exec(label);
  if (match && typeof value === 'number') return match[1];
  return String(value);
}
