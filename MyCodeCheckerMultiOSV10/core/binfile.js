'use strict';

// Where the issues of a binary file are, as byte ranges, for the code view's
// hex view: the "lines" an issue names (the bytes from one newline to the next)
// and the strings it names as its evidence (a library's version string …).
//
//   lookup(full, stat, lines, find) -> { ranges, found, pending }
//   settle(full)                    -> a promise, done when nothing is pending
//
// Finding them means reading the whole file. A small file is read at once; a
// large one (a 100 MB shared library) is read in the background, a chunk at a
// time with asynchronous reads, so the service keeps answering (every call of
// the window waits for it) while it runs: lookup answers at once with what is
// known so far and pending: true until the walk is over. What a walk finds is
// kept per file (path, size and modification time): the newline offsets of
// the whole file, so any line is answered from them, and every string looked for.

const fs = require('fs');

const CHUNK = 1 << 20;
// Up to this size the file is walked during the call (it takes a few ms).
const SYNC_MAX = 4 << 20;
// Files whose offsets are kept (the newline offsets of a 100 MB file are a few MB).
const KEEP = 4;
// Evidence strings shorter than this would match anywhere; more than this many are not looked for.
const NEEDLE_MIN = 3;
const NEEDLE_MAX = 50;

const files = new Map();

function entryOf(full, stat) {
  const key = `${stat.size}|${stat.mtimeMs}`;
  let e = files.get(full);
  if (e && e.key !== key) { e.dead = true; e = null; }
  if (!e) {
    e = { full, key, size: stat.size, ends: new Float64Array(1024), count: 0, linesWanted: false, linesDone: false, found: new Map(), queued: new Set(), job: null, dead: false };
  }
  // The most recently used last; the oldest goes when there are too many.
  files.delete(full);
  files.set(full, e);
  while (files.size > KEEP) {
    const [oldest, old] = files.entries().next().value;
    old.dead = true;
    files.delete(oldest);
  }
  return e;
}

// One chunk of the walk: its newlines (when the lines are still being indexed)
// and the first occurrence of each string looked for. view holds `region`
// bytes of this chunk plus, for the strings, the start of the next one.
function scanChunk(e, view, region, pos, lines, needles) {
  if (lines) {
    const own = view.subarray(0, region);
    for (let i = own.indexOf(10); i >= 0; i = own.indexOf(10, i + 1)) {
      if (e.count === e.ends.length) {
        const more = new Float64Array(e.ends.length * 2);
        more.set(e.ends);
        e.ends = more;
      }
      e.ends[e.count++] = pos + i + 1;
    }
  }
  for (const nd of needles) {
    if (e.found.get(nd.s)) continue;
    const at = view.indexOf(nd.b);
    if (at >= 0) e.found.set(nd.s, [pos + at, pos + at + nd.b.length]);
  }
}

// What one walk does: the lines when they are wanted and not yet indexed, and
// the strings queued so far (later ones wait for the next walk).
function plan(e) {
  const lines = e.linesWanted && !e.linesDone;
  const needles = [...e.queued].map((s) => ({ s, b: Buffer.from(s, 'latin1') }));
  e.queued.clear();
  if (lines) e.count = 0;
  const longest = needles.reduce((n, x) => Math.max(n, x.b.length), 1);
  return { lines, needles, longest };
}

function finish(e, { lines, needles }) {
  if (lines) e.linesDone = true;
  for (const nd of needles) if (!e.found.has(nd.s)) e.found.set(nd.s, null);
}

function walkSync(e) {
  const p = plan(e);
  if (!p.lines && !p.needles.length) return;
  const fd = fs.openSync(e.full, 'r');
  try {
    const buf = Buffer.alloc(CHUNK + p.longest);
    for (let pos = 0; pos < e.size; pos += CHUNK) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!n) break;
      scanChunk(e, buf.subarray(0, n), Math.min(n, CHUNK), pos, p.lines, p.needles);
    }
  } finally {
    fs.closeSync(fd);
  }
  finish(e, p);
}

async function walkAsync(e) {
  const fh = await fs.promises.open(e.full, 'r');
  try {
    for (;;) {
      const p = plan(e);
      if (!p.lines && !p.needles.length) return;
      const buf = Buffer.alloc(CHUNK + p.longest);
      for (let pos = 0; pos < e.size; pos += CHUNK) {
        if (e.dead) return;
        const { bytesRead: n } = await fh.read(buf, 0, buf.length, pos);
        if (!n) break;
        scanChunk(e, buf.subarray(0, n), Math.min(n, CHUNK), pos, p.lines, p.needles);
        // Calls that came in meanwhile are answered between two chunks.
        await new Promise((resolve) => setImmediate(resolve));
      }
      finish(e, p);
    }
  } finally {
    await fh.close();
  }
}

function start(e) {
  if (e.job) return;
  e.job = walkAsync(e).catch(() => {
    // Unreadable now (removed, locked): nothing more to find; the next call tries again.
    e.linesDone = true;
    for (const s of e.queued) e.found.set(s, null);
    e.queued.clear();
    files.delete(e.full);
  }).finally(() => { e.job = null; if (!e.dead && (e.queued.size || (e.linesWanted && !e.linesDone))) start(e); });
}

// The line's bytes [start, end), from the newline offsets; null while not known yet.
function lineRange(e, line) {
  const start = line === 1 ? 0 : line - 2 < e.count ? e.ends[line - 2] : null;
  if (start === null) return null;
  if (line - 1 < e.count) return [start, e.ends[line - 1]];
  // The bytes after the last newline (the file's last line).
  return e.linesDone && line - 1 === e.count ? [start, e.size] : null;
}

/**
 * The byte ranges of `lines` (1-based) and of the first occurrence of each
 * string of `find` in the file: { ranges: { line: [start, end) }, found:
 * { text: [start, end) }, pending }. A line past the end, or a string the file
 * does not hold, is left out. pending: the file is still being walked; ask
 * again for the rest.
 */
function lookup(full, stat, lines = [], find = []) {
  const e = entryOf(full, stat);
  const want = [...new Set(lines.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const needles = [...new Set(find.map(String).filter((s) => s.length >= NEEDLE_MIN))].slice(0, NEEDLE_MAX);
  if (want.length) e.linesWanted = true;
  for (const s of needles) if (!e.found.has(s)) e.queued.add(s);
  const busy = () => !!e.job || e.queued.size > 0 || (e.linesWanted && !e.linesDone);
  if (busy()) {
    if (e.size <= SYNC_MAX && !e.job) walkSync(e);
    else start(e);
  }
  const ranges = {};
  for (const n of want) {
    const r = lineRange(e, n);
    if (r) ranges[n] = r;
  }
  const found = {};
  for (const s of needles) {
    const r = e.found.get(s);
    if (r) found[s] = r;
  }
  return { ranges, found, pending: busy() };
}

/** Resolves when the file's walk (if any) is over. */
async function settle(full) {
  for (let e = files.get(full); e && e.job; e = files.get(full)) await e.job;
}

module.exports = { lookup, settle, CHUNK, SYNC_MAX };
