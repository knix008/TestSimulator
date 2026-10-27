'use strict';

// JSON helpers for data that can outgrow one JavaScript string (V8 stops at
// about 512 MB). A large project's analysis (150 000+ issues) does, so the
// workspace, the HTTP responses and merge3 never build its JSON in one piece.

const CHUNK = 1 << 20;
// Arrays at least this long are written element by element, each element as
// one JSON.stringify (an issue, a line hash ...), so no piece grows large.
const LONG = 256;

/** JSON text of `value` (as JSON.stringify(value) would give) in pieces of about 1 MB. */
function* jsonChunks(value) {
  let buf = '';
  function* put(s) {
    buf += s;
    if (buf.length >= CHUNK) { yield buf; buf = ''; }
  }
  function* walk(v) {
    if (v !== null && typeof v === 'object' && typeof v.toJSON === 'function') v = v.toJSON();
    if (Array.isArray(v)) {
      yield* put('[');
      for (let i = 0; i < v.length; i++) {
        if (i) yield* put(',');
        const item = v[i];
        if (v.length >= LONG) yield* put(JSON.stringify(item) ?? 'null');
        else if (item === undefined || typeof item === 'function' || typeof item === 'symbol') yield* put('null');
        else yield* walk(item);
      }
      yield* put(']');
    } else if (v !== null && typeof v === 'object') {
      yield* put('{');
      let first = true;
      for (const k of Object.keys(v)) {
        const item = v[k];
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
        yield* put(`${first ? '' : ','}${JSON.stringify(k)}:`);
        first = false;
        yield* walk(item);
      }
      yield* put('}');
    } else {
      yield* put(JSON.stringify(v) ?? 'null');
    }
  }
  yield* walk(value);
  if (buf) yield buf;
}

/** Same JSON value (what JSON.stringify(a) === JSON.stringify(b) answers, without the strings). */
function sameJson(a, b) {
  if (a === b) return true;
  if (a !== null && typeof a === 'object' && typeof a.toJSON === 'function') a = a.toJSON();
  if (b !== null && typeof b === 'object' && typeof b.toJSON === 'function') b = b.toJSON();
  const skip = (v) => v === undefined || typeof v === 'function' || typeof v === 'symbol';
  if (typeof a === 'number' && typeof b === 'number') return a === b || (!Number.isFinite(a) && !Number.isFinite(b));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // JSON writes NaN/Infinity as null.
    const norm = (v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v);
    return norm(a) === norm(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = skip(a[i]) ? null : a[i];
      const y = skip(b[i]) ? null : b[i];
      if (!sameJson(x, y)) return false;
    }
    return true;
  }
  const ka = Object.keys(a).filter((k) => !skip(a[k]));
  const kb = Object.keys(b).filter((k) => !skip(b[k]));
  if (ka.length !== kb.length) return false;
  // JSON.stringify compares key order too.
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i] || !sameJson(a[ka[i]], b[kb[i]])) return false;
  }
  return true;
}

module.exports = { jsonChunks, sameJson };
