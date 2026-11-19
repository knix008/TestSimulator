// Wireshark packet-range strings ("1-10,15,20-", "-5", "3 7 9-12") as used by
// File → Export Specified Packets, Print and the range fields of other dialogs.

/**
 * Parse a packet-range string.
 * @param {string} text
 * @param {number} [maxFrame=Infinity] highest frame number; open ends ("20-") stop here
 * @returns {{ok:true, ranges:[number,number][], text:string} | {ok:false, error:string, code:string, at:number, ranges:[]}}
 *   `ranges` are inclusive, sorted and merged (overlaps collapse), so inRange can binary-search.
 */
export function parseRange(text, maxFrame = Infinity) {
  const s = String(text ?? '');
  const out = [];
  const max = Number.isFinite(maxFrame) ? Math.max(0, Math.floor(maxFrame)) : Infinity;
  let i = 0;
  const fail = (code, error, at) => ({ ok: false, code, error, at, ranges: [] });
  const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const readNum = () => {
    const st = i;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    return i > st ? Number(s.slice(st, i)) : null;
  };
  skipSpace();
  if (i >= s.length) return fail('empty', 'The range is empty.', 0);
  while (i < s.length) {
    skipSpace();
    if (s[i] === ',') { i++; continue; }
    const at = i;
    let a = readNum();
    skipSpace();
    let b = a;
    if (s[i] === '-') {
      i++;
      skipSpace();
      b = readNum();
      if (a === null && b === null) return fail('syntax', `"-" needs a number on at least one side.`, at);
      if (a === null) a = 1;           // "-5" → 1-5
      if (b === null) b = max;         // "20-" → 20 to the last frame
    } else if (a === null) {
      return fail('syntax', `"${s[i]}" is not a valid range character.`, i);
    }
    if (a === 0 || b === 0) return fail('zero', 'Packet numbers start at 1.', at);
    if (b < a) [a, b] = [b, a];        // Wireshark accepts "10-5"
    if (Number.isFinite(max)) { if (a > max) { skipSpace(); continue; } b = Math.min(b, max); }
    out.push([a, b]);
    skipSpace();
    if (i < s.length && s[i] !== ',' && !(s[i] >= '0' && s[i] <= '9') && s[i] !== '-') {
      return fail('syntax', `"${s[i]}" is not a valid range character.`, i);
    }
  }
  return { ok: true, ranges: mergeRanges(out), text: s.trim() };
}

function mergeRanges(list) {
  list.sort((x, y) => x[0] - y[0]);
  const m = [];
  for (const [a, b] of list) {
    const last = m[m.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else m.push([a, b]);
  }
  return m;
}

/** True when frame number `no` is inside a parsed range (or a ranges array). */
export function inRange(parsed, no) {
  const r = Array.isArray(parsed) ? parsed : parsed?.ranges || [];
  let lo = 0, hi = r.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (no < r[mid][0]) hi = mid - 1;
    else if (no > r[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Number of frames covered by a parsed range. */
export function rangeCount(parsed) {
  let n = 0;
  for (const [a, b] of parsed?.ranges || []) n += Number.isFinite(b) ? b - a + 1 : 0;
  return n;
}

/**
 * Frames (objects with `.no`) selected by a range string or parsed range.
 * @param {string|{ranges:[number,number][]}} range
 * @param {{no:number}[]} frames
 */
export function rangeToFrames(range, frames) {
  const maxNo = frames.length ? frames[frames.length - 1].no : 0;
  const parsed = typeof range === 'string' ? parseRange(range, maxNo) : range;
  if (!parsed?.ok && typeof range === 'string') return [];
  return frames.filter((f) => inRange(parsed, f.no));
}

/** Canonical text for a parsed range: "1-10,15,20-30". */
export function formatRange(parsed) {
  return (parsed?.ranges || []).map(([a, b]) => (a === b ? String(a) : `${a}-${Number.isFinite(b) ? b : ''}`)).join(',');
}
