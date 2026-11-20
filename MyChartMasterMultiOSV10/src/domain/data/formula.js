// Spreadsheet formulas for the data window (sheet.js) and the main grid: "=SUM(B2:B9)*2", "=IF(C2>0,"up","down")".
// Pure, no DOM. Cells are addressed as in Excel: A1 is the header row's first cell (row 0 of the sheet model),
// A2 the table's first data row. Ranges (B2:D9, whole columns B:D), absolute parts ($B$2), the usual operators
// (+ − * / ^ & % and comparisons) and about a hundred functions. Errors are values (#DIV/0!, #REF!, #NAME? …)
// that flow through the calculation; a cell that reads itself (directly or around a loop) is #CIRC!.
import { columnLetter, maxOf, minOf, parseDate, parseNumber } from './table.js';

export const ERRORS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#CIRC!'];
export class FormulaError {
  constructor(code) { this.error = code; }
  toString() { return this.error; }
}
const err = (code) => new FormulaError(code);
export const isError = (v) => v instanceof FormulaError;

/** "AB" → 27 (zero-based). */
export function columnIndex(letters) {
  let n = 0;
  for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** "B3" → { r: 2, c: 1 } (zero-based), or null. */
export function parseAddress(text) {
  const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d{1,7})\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  return { r: Number(m[2]) - 1, c: columnIndex(m[1]) };
}

export const addressOf = (r, c) => `${columnLetter(c)}${r + 1}`;
/** "B3:D9" (or "B3" for one cell) of a box { r0, c0, r1, c1 }. */
export const rangeAddress = (box) => (box.r0 === box.r1 && box.c0 === box.c1 ? addressOf(box.r0, box.c0) : `${addressOf(box.r0, box.c0)}:${addressOf(box.r1, box.c1)}`);
/** "B3:D9" / "B3" → a box, or null. */
export function parseRange(text) {
  const [a, b] = String(text ?? '').split(':');
  const p = parseAddress(a);
  const q = b == null ? p : parseAddress(b);
  if (!p || !q) return null;
  return { r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c), r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c) };
}

export const isFormula = (text) => typeof text === 'string' && text.length > 1 && text[0] === '=';

// ───────────────────────── tokens

const REF_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/;
const COLS_RE = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9(])/;
const ROWS_RE = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![0-9])/;
const NUM_RE = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;
const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%'];

/**
 * The formula (without its "=") as tokens: { t: 'num'|'str'|'ref'|'range'|'cols'|'rows'|'func'|'name'|'err'|'op'|'('|')'|','|'ws', s (source), … }.
 * ref: { r, c, ar, ac } (ar / ac: absolute row / column). range: { a: ref, b: ref }.
 */
export function tokenize(text) {
  const out = [];
  let i = 0;
  const s = String(text);
  const refAt = (k) => {
    const m = REF_RE.exec(s.slice(k));
    if (!m) return null;
    const after = s[k + m[0].length];
    if (after && /[A-Za-z0-9_(]/.test(after)) return null; // LOG10( and names like A1B
    return { len: m[0].length, ac: m[1] === '$', c: columnIndex(m[2]), ar: m[3] === '$', r: Number(m[4]) - 1 };
  };
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    if (/\s/.test(ch)) { let j = i; while (j < s.length && /\s/.test(s[j])) j++; out.push({ t: 'ws', s: s.slice(i, j) }); i = j; continue; }
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < s.length) {
        if (s[j] === '"') { if (s[j + 1] === '"') { value += '"'; j += 2; continue; } break; }
        value += s[j++];
      }
      out.push({ t: 'str', s: s.slice(i, j + 1), v: value });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|CIRC!)/i.exec(rest);
      if (m) { out.push({ t: 'err', s: m[0], v: m[0].toUpperCase() }); i += m[0].length; continue; }
    }
    if (ch === '(' || ch === ')') { out.push({ t: ch, s: ch }); i++; continue; }
    if (ch === ',' || ch === ';') { out.push({ t: ',', s: ch }); i++; continue; }
    const cols = COLS_RE.exec(rest);
    if (cols) {
      out.push({ t: 'cols', s: cols[0], a: { ac: cols[1] === '$', c: columnIndex(cols[2]) }, b: { ac: cols[3] === '$', c: columnIndex(cols[4]) } });
      i += cols[0].length;
      continue;
    }
    const a = /[A-Za-z$]/.test(ch) ? refAt(i) : null;
    if (a) {
      // A range: ref ":" ref.
      if (s[i + a.len] === ':') {
        const b = refAt(i + a.len + 1);
        if (b) { const len = a.len + 1 + b.len; out.push({ t: 'range', s: s.slice(i, i + len), a, b }); i += len; continue; }
      }
      out.push({ t: 'ref', s: s.slice(i, i + a.len), ...a });
      i += a.len;
      continue;
    }
    const rows = /\d|\$/.test(ch) ? ROWS_RE.exec(rest) : null;
    if (rows) {
      out.push({ t: 'rows', s: rows[0], a: { ar: rows[1] === '$', r: Number(rows[2]) - 1 }, b: { ar: rows[3] === '$', r: Number(rows[4]) - 1 } });
      i += rows[0].length;
      continue;
    }
    const num = NUM_RE.exec(rest);
    if (num) { out.push({ t: 'num', s: num[0], v: Number(num[0]) }); i += num[0].length; continue; }
    const name = NAME_RE.exec(rest);
    if (name) {
      let j = i + name[0].length;
      while (s[j] === ' ') j++;
      out.push({ t: s[j] === '(' ? 'func' : 'name', s: name[0], v: name[0].toUpperCase() });
      i += name[0].length;
      continue;
    }
    const op = OPS.find((o) => rest.startsWith(o));
    if (op) { out.push({ t: 'op', s: op }); i += op.length; continue; }
    out.push({ t: 'bad', s: ch });
    i++;
  }
  return out;
}

const refText = (p) => `${p.ac ? '$' : ''}${columnLetter(p.c)}${p.ar ? '$' : ''}${p.r + 1}`;

/**
 * Rewrites the references of a formula: `map(ref, part)` returns the moved ref ({ r, c, ar, ac }) or null (#REF!).
 * For a whole-column / whole-row range the missing coordinate is left as it is.
 */
function rewrite(formula, map) {
  if (!isFormula(formula)) return formula;
  const tokens = tokenize(formula.slice(1));
  let changed = false;
  const out = tokens.map((tk) => {
    if (tk.t === 'ref') { const m = map(tk); changed = true; return m ? refText(m) : '#REF!'; }
    if (tk.t === 'range') {
      const a = map(tk.a, 'a', tk);
      const b = map(tk.b, 'b', tk);
      changed = true;
      return a && b ? `${refText(a)}:${refText(b)}` : '#REF!';
    }
    if (tk.t === 'cols') {
      const a = map({ ...tk.a, r: 0, ar: true }, 'a', tk);
      const b = map({ ...tk.b, r: 0, ar: true }, 'b', tk);
      changed = true;
      return a && b ? `${a.ac ? '$' : ''}${columnLetter(a.c)}:${b.ac ? '$' : ''}${columnLetter(b.c)}` : '#REF!';
    }
    if (tk.t === 'rows') {
      const a = map({ ...tk.a, c: 0, ac: true }, 'a', tk);
      const b = map({ ...tk.b, c: 0, ac: true }, 'b', tk);
      changed = true;
      return a && b ? `${a.ar ? '$' : ''}${a.r + 1}:${b.ar ? '$' : ''}${b.r + 1}` : '#REF!';
    }
    return tk.s;
  });
  return changed ? `=${out.join('')}` : formula;
}

/** A formula copied by (dr, dc): relative parts move, $ parts stay (copy, fill, paste). */
export function shiftFormula(formula, dr, dc) {
  if (!dr && !dc) return formula;
  return rewrite(formula, (p) => {
    const r = p.ar ? p.r : p.r + dr;
    const c = p.ac ? p.c : p.c + dc;
    return r < 0 || c < 0 ? null : { ...p, r, c };
  });
}

/** A formula whose sheet moved by (dr, dc) as a whole: every reference moves, $ or not (a table read from C3). */
export function moveFormula(formula, dr, dc) {
  if (!dr && !dc) return formula;
  return rewrite(formula, (p) => (p.r + dr < 0 || p.c + dc < 0 ? null : { ...p, r: p.r + dr, c: p.c + dc }));
}

/**
 * A formula after rows or columns were inserted or deleted: { axis: 'row' | 'col', at, count } (count < 0 deletes).
 * References past the place move (absolute or not); a lone reference into deleted cells becomes #REF!, a range
 * shrinks.
 */
export function adjustFormula(formula, { axis, at, count }) {
  const key = axis === 'row' ? 'r' : 'c';
  return rewrite(formula, (p, part, range) => {
    const v = p[key];
    if (count > 0) return v >= at ? { ...p, [key]: v + count } : p;
    const end = at - count; // first index after the deleted block
    if (v < at) return p;
    if (v >= end) return { ...p, [key]: v + count };
    if (!range) return null;
    // Inside the deleted block: the start of a range moves to the block's place, its end to just before it.
    const other = part === 'a' ? range.b : range.a;
    const ov = other[key] ?? v;
    if (part === 'a') return ov >= end ? { ...p, [key]: at } : null;
    return ov < at ? { ...p, [key]: at - 1 } : null;
  });
}

/** Cells a formula reads (for highlighting): boxes { r0, c0, r1, c1 } of its references and ranges. */
export function formulaRanges(formula, { rows = 1048576, cols = 16384 } = {}) {
  if (!isFormula(formula)) return [];
  const out = [];
  for (const tk of tokenize(formula.slice(1))) {
    if (tk.t === 'ref') out.push({ r0: tk.r, c0: tk.c, r1: tk.r, c1: tk.c });
    else if (tk.t === 'range') out.push({ r0: Math.min(tk.a.r, tk.b.r), c0: Math.min(tk.a.c, tk.b.c), r1: Math.max(tk.a.r, tk.b.r), c1: Math.max(tk.a.c, tk.b.c) });
    else if (tk.t === 'cols') out.push({ r0: 0, r1: rows - 1, c0: Math.min(tk.a.c, tk.b.c), c1: Math.max(tk.a.c, tk.b.c) });
    else if (tk.t === 'rows') out.push({ c0: 0, c1: cols - 1, r0: Math.min(tk.a.r, tk.b.r), r1: Math.max(tk.a.r, tk.b.r) });
  }
  return out;
}

// ───────────────────────── parser

/** The formula (with or without "=") as a tree; throws { error } for a formula that cannot be read. */
export function parse(formula) {
  const text = String(formula).replace(/^=/, '');
  const tokens = tokenize(text).filter((tk) => tk.t !== 'ws');
  let k = 0;
  const peek = () => tokens[k];
  const next = () => tokens[k++];
  const fail = () => { throw err('#NAME?'); };
  const expect = (t) => { const tk = next(); if (!tk || tk.t !== t) fail(); return tk; };
  const isOp = (s) => peek()?.t === 'op' && peek().s === s;

  function primary() {
    const tk = next();
    if (!tk) fail();
    switch (tk.t) {
      case 'num': return { k: 'num', v: tk.v };
      case 'str': return { k: 'str', v: tk.v };
      case 'err': return { k: 'err', v: tk.v };
      case 'ref': return { k: 'ref', r: tk.r, c: tk.c };
      case 'range': return { k: 'range', r0: Math.min(tk.a.r, tk.b.r), c0: Math.min(tk.a.c, tk.b.c), r1: Math.max(tk.a.r, tk.b.r), c1: Math.max(tk.a.c, tk.b.c) };
      case 'cols': return { k: 'range', r0: 0, r1: Infinity, c0: Math.min(tk.a.c, tk.b.c), c1: Math.max(tk.a.c, tk.b.c) };
      case 'rows': return { k: 'range', c0: 0, c1: Infinity, r0: Math.min(tk.a.r, tk.b.r), r1: Math.max(tk.a.r, tk.b.r) };
      case 'name':
        if (tk.v === 'TRUE' || tk.v === 'FALSE') return { k: 'bool', v: tk.v === 'TRUE' };
        return { k: 'err', v: '#NAME?' };
      case 'func': {
        expect('(');
        const args = [];
        if (peek()?.t !== ')') {
          for (;;) {
            if (peek()?.t === ',' || peek()?.t === ')') args.push({ k: 'missing' });
            else args.push(comparison());
            if (peek()?.t === ',') { next(); continue; }
            break;
          }
        }
        expect(')');
        return { k: 'func', name: tk.v.replace(/^_XLFN\./, ''), args };
      }
      case '(': { const e = comparison(); expect(')'); return e; }
      case 'op':
        if (tk.s === '-' || tk.s === '+') return { k: 'un', op: tk.s, x: unary() };
        return fail();
      default: return fail();
    }
  }
  function postfix() {
    let e = primary();
    while (isOp('%')) { next(); e = { k: 'pct', x: e }; }
    return e;
  }
  function unary() {
    if (isOp('-') || isOp('+')) { const op = next().s; return { k: 'un', op, x: unary() }; }
    return postfix();
  }
  function power() {
    let e = unary();
    while (isOp('^')) { next(); e = { k: 'bin', op: '^', a: e, b: unary() }; }
    return e;
  }
  function product() {
    let e = power();
    while (isOp('*') || isOp('/')) { const op = next().s; e = { k: 'bin', op, a: e, b: power() }; }
    return e;
  }
  function sum() {
    let e = product();
    while (isOp('+') || isOp('-')) { const op = next().s; e = { k: 'bin', op, a: e, b: product() }; }
    return e;
  }
  function concat() {
    let e = sum();
    while (isOp('&')) { next(); e = { k: 'bin', op: '&', a: e, b: sum() }; }
    return e;
  }
  function comparison() {
    let e = concat();
    while (['=', '<>', '<', '>', '<=', '>='].some(isOp)) { const op = next().s; e = { k: 'bin', op, a: e, b: concat() }; }
    return e;
  }
  const tree = comparison();
  if (k < tokens.length) fail();
  return tree;
}

// ───────────────────────── values

const blank = (v) => v == null || v === '';
/** A cell's value as a number (text that reads as one counts), or an error. */
function num(v) {
  if (isError(v)) return v;
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseNumber(v);
  if (n != null) return n;
  const d = parseDate(v);
  if (d != null) return d / 86400000 + 25569;
  return err('#VALUE!');
}
const text = (v) => (isError(v) ? v : v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? numberText(v) : String(v));
const numberText = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10));
function bool(v) {
  if (isError(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (blank(v)) return false;
  const s = String(v).toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  const n = parseNumber(v);
  return n != null ? n !== 0 : err('#VALUE!');
}

/** Every value of the arguments (ranges flattened), for SUM / AVERAGE … `numbersOnly`: text in ranges is skipped. */
function flat(args) {
  const out = [];
  for (const a of args) {
    if (a && a.range) { for (const row of a.values) for (const v of row) out.push({ v, fromRange: true }); }
    else out.push({ v: a, fromRange: false });
  }
  return out;
}
/** Numbers of the arguments as Excel's SUM sees them: numbers in ranges, any number-like direct argument. */
function numbers(args) {
  const out = [];
  for (const { v, fromRange } of flat(args)) {
    if (isError(v)) return v;
    if (fromRange) { if (typeof v === 'number') out.push(v); else if (typeof v === 'string' && v.trim() !== '') { const n = parseNumber(v); if (n != null && /^[\s+\-−(]*[$€£¥₩]?[\d.,\s]+%?[)]?$/.test(v)) out.push(n); } }
    else if (v !== null && v !== undefined && !(v && v.missing)) { const n = num(v); if (isError(n)) return n; out.push(n); }
  }
  return out;
}
const scalar = (v) => (v && v.range ? (v.values[0]?.[0] ?? null) : v);
const firstError = (...vs) => vs.find(isError);

/** "<>5", ">=10", "a*", "=x": a test for COUNTIF and friends. */
function criterion(c) {
  if (typeof c === 'number') return (v) => num(v) === c && !blank(v);
  if (typeof c === 'boolean') return (v) => v === c || String(v).toUpperCase() === (c ? 'TRUE' : 'FALSE');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(String(c ?? ''));
  const op = m[1] ?? '=';
  const rhs = m[2];
  const n = rhs.trim() !== '' ? parseNumber(rhs) : null;
  if (n != null && op !== '=' && op !== '<>') {
    return (v) => { if (blank(v)) return false; const x = typeof v === 'number' ? v : parseNumber(v); if (x == null) return false; return op === '<' ? x < n : op === '>' ? x > n : op === '<=' ? x <= n : x >= n; };
  }
  if (n != null) {
    const eq = (v) => !blank(v) && (typeof v === 'number' ? v === n : parseNumber(v) === n);
    return op === '<>' ? (v) => !eq(v) : eq;
  }
  if (rhs === '') return op === '<>' ? (v) => !blank(v) : (v) => blank(v);
  const pattern = new RegExp(`^${rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?')}$`, 'is');
  const test = (v) => pattern.test(text(v));
  if (op === '<>') return (v) => !test(v);
  if (op === '=') return test;
  return (v) => { const a = text(v).toLowerCase(); const b = rhs.toLowerCase(); return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b; };
}

const cells = (a) => (a && a.range ? a.values.flat() : [a]);
function compare(a, b) {
  // Numbers < text < booleans, as in Excel; text without case.
  const rank = (v) => (typeof v === 'number' || blank(v) ? 0 : typeof v === 'boolean' ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) === 0) return (Number(a) || 0) - (Number(b) || 0);
  if (rank(a) === 2) return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'accent' });
}
const toDate = (v) => {
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000));
  const d = parseDate(v);
  return d == null ? null : new Date(d);
};
const isoDate = (d) => d.toISOString().slice(0, 10);
const roundTo = (x, digits, fn = Math.round) => { const f = 10 ** digits; return fn(x * f + (fn === Math.round ? Math.sign(x) * 1e-9 : 0)) / f; };
const stdev = (xs, sample) => { const n = xs.length; if (n < (sample ? 2 : 1)) return err('#DIV/0!'); const m = xs.reduce((a, b) => a + b, 0) / n; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - (sample ? 1 : 0))); };
const variance = (xs, sample) => { const s = stdev(xs, sample); return isError(s) ? s : s * s; };
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const median = (xs) => { if (!xs.length) return err('#NUM!'); const s = sorted(xs); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Pairs of (range, criterion) → indices of cells that pass all. */
function matchAll(pairs) {
  const size = pairs[0][0] && pairs[0][0].range ? pairs[0][0].values.flat().length : 1;
  const ok = Array(size).fill(true);
  for (const [range, crit] of pairs) {
    const values = cells(range);
    const test = criterion(scalar(crit));
    for (let i = 0; i < size; i++) if (!test(values[i] ?? null)) ok[i] = false;
  }
  return ok;
}

function lookupIndex(needle, list, mode = 0) {
  // mode 0 exact (wildcards for text), 1 largest ≤ needle in ascending data, −1 smallest ≥ in descending.
  if (mode === 0) {
    const test = typeof needle === 'string' && /[*?]/.test(needle) ? criterion(needle) : null;
    const same = (v) => { if (blank(v)) return false; if (typeof needle === 'number') return (typeof v === 'number' ? v : parseNumber(v)) === needle; if (typeof needle === 'boolean') return v === needle; return String(v).toLowerCase() === String(needle ?? '').toLowerCase(); };
    return list.findIndex((v) => (test ? test(v) : same(v)));
  }
  let found = -1;
  for (let i = 0; i < list.length; i++) {
    if (blank(list[i])) continue;
    const d = compare(list[i], needle);
    if (mode === 1 ? d <= 0 : d >= 0) found = i; else break;
  }
  return found;
}

const FUNCTIONS = {
  // ── math
  SUM: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.reduce((x, y) => x + y, 0); },
  PRODUCT: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.reduce((x, y) => x * y, 1); },
  AVERAGE: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : err('#DIV/0!'); },
  MIN: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.length ? minOf(xs) : 0; },
  MAX: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.length ? maxOf(xs) : 0; },
  COUNT: (a) => flat(a).filter(({ v, fromRange }) => (fromRange ? typeof v === 'number' : !isError(num(v)) && !blank(v))).length,
  COUNTA: (a) => flat(a).filter(({ v }) => !blank(v) && !(v && v.missing)).length,
  COUNTBLANK: (a) => flat(a).filter(({ v }) => blank(v)).length,
  MEDIAN: (a) => { const xs = numbers(a); return isError(xs) ? xs : median(xs); },
  MODE: (a) => { const xs = numbers(a); if (isError(xs)) return xs; const counts = new Map(); let best = null; let most = 1; for (const x of xs) { const n = (counts.get(x) ?? 0) + 1; counts.set(x, n); if (n > most) { most = n; best = x; } } return best ?? err('#N/A'); },
  STDEV: (a) => { const xs = numbers(a); return isError(xs) ? xs : stdev(xs, true); },
  'STDEV.S': (a) => FUNCTIONS.STDEV(a),
  STDEVP: (a) => { const xs = numbers(a); return isError(xs) ? xs : stdev(xs, false); },
  'STDEV.P': (a) => FUNCTIONS.STDEVP(a),
  VAR: (a) => { const xs = numbers(a); return isError(xs) ? xs : variance(xs, true); },
  'VAR.S': (a) => FUNCTIONS.VAR(a),
  VARP: (a) => { const xs = numbers(a); return isError(xs) ? xs : variance(xs, false); },
  'VAR.P': (a) => FUNCTIONS.VARP(a),
  LARGE: ([r, k]) => { const xs = numbers([r]); const n = num(scalar(k)); if (isError(xs)) return xs; if (isError(n)) return n; const s = sorted(xs).reverse(); return s[Math.trunc(n) - 1] ?? err('#NUM!'); },
  SMALL: ([r, k]) => { const xs = numbers([r]); const n = num(scalar(k)); if (isError(xs)) return xs; if (isError(n)) return n; return sorted(xs)[Math.trunc(n) - 1] ?? err('#NUM!'); },
  RANK: ([x, r, order]) => { const v = num(scalar(x)); const xs = numbers([r]); if (isError(v)) return v; if (isError(xs)) return xs; if (!xs.includes(v)) return err('#N/A'); const asc = order != null && !order.missing && num(scalar(order)) !== 0; return 1 + xs.filter((y) => (asc ? y < v : y > v)).length; },
  'RANK.EQ': (a) => FUNCTIONS.RANK(a),
  PERCENTILE: ([r, p]) => { const xs = sorted(numbers([r])); const q = num(scalar(p)); if (isError(q)) return q; if (!xs.length || q < 0 || q > 1) return err('#NUM!'); const at = (xs.length - 1) * q; const lo = Math.floor(at); return xs[lo] + (xs[Math.ceil(at)] - xs[lo]) * (at - lo); },
  'PERCENTILE.INC': (a) => FUNCTIONS.PERCENTILE(a),
  QUARTILE: ([r, q]) => { const n = num(scalar(q)); return isError(n) ? n : FUNCTIONS.PERCENTILE([r, n / 4]); },
  'QUARTILE.INC': (a) => FUNCTIONS.QUARTILE(a),
  SUMPRODUCT: (a) => { const lists = a.map(cells); const n = lists[0].length; if (lists.some((l) => l.length !== n)) return err('#VALUE!'); let s = 0; for (let i = 0; i < n; i++) s += lists.reduce((p, l) => p * (typeof l[i] === 'number' ? l[i] : 0), 1); return s; },
  SUMSQ: (a) => { const xs = numbers(a); return isError(xs) ? xs : xs.reduce((s, x) => s + x * x, 0); },
  ABS: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.abs(n); },
  SIGN: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.sign(n); },
  SQRT: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : n < 0 ? err('#NUM!') : Math.sqrt(n); },
  POWER: ([x, y]) => { const a = num(scalar(x)); const b = num(scalar(y)); return firstError(a, b) ?? (Number.isFinite(a ** b) ? a ** b : err('#NUM!')); },
  EXP: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.exp(n); },
  LN: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : n <= 0 ? err('#NUM!') : Math.log(n); },
  LOG: ([x, b]) => { const n = num(scalar(x)); const base = b == null || b.missing ? 10 : num(scalar(b)); return firstError(n, base) ?? (n <= 0 || base <= 0 || base === 1 ? err('#NUM!') : Math.log(n) / Math.log(base)); },
  LOG10: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : n <= 0 ? err('#NUM!') : Math.log10(n); },
  PI: () => Math.PI,
  INT: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.floor(n); },
  TRUNC: ([x, d]) => { const n = num(scalar(x)); const k = d == null || d.missing ? 0 : num(scalar(d)); return firstError(n, k) ?? roundTo(n, Math.trunc(k), Math.trunc); },
  ROUND: ([x, d]) => { const n = num(scalar(x)); const k = d == null || d.missing ? 0 : num(scalar(d)); return firstError(n, k) ?? roundTo(n, Math.trunc(k)); },
  ROUNDUP: ([x, d]) => { const n = num(scalar(x)); const k = d == null || d.missing ? 0 : num(scalar(d)); return firstError(n, k) ?? Math.sign(n) * roundTo(Math.abs(n), Math.trunc(k), (v) => Math.ceil(v - 1e-9)); },
  ROUNDDOWN: ([x, d]) => { const n = num(scalar(x)); const k = d == null || d.missing ? 0 : num(scalar(d)); return firstError(n, k) ?? Math.sign(n) * roundTo(Math.abs(n), Math.trunc(k), (v) => Math.floor(v + 1e-9)); },
  CEILING: ([x, s]) => { const n = num(scalar(x)); const step = s == null || s.missing ? 1 : num(scalar(s)); return firstError(n, step) ?? (step === 0 ? 0 : Math.ceil(n / step - 1e-9) * step); },
  FLOOR: ([x, s]) => { const n = num(scalar(x)); const step = s == null || s.missing ? 1 : num(scalar(s)); return firstError(n, step) ?? (step === 0 ? err('#DIV/0!') : Math.floor(n / step + 1e-9) * step); },
  MOD: ([x, y]) => { const a = num(scalar(x)); const b = num(scalar(y)); return firstError(a, b) ?? (b === 0 ? err('#DIV/0!') : a - b * Math.floor(a / b)); },
  QUOTIENT: ([x, y]) => { const a = num(scalar(x)); const b = num(scalar(y)); return firstError(a, b) ?? (b === 0 ? err('#DIV/0!') : Math.trunc(a / b)); },
  RAND: () => Math.random(),
  RANDBETWEEN: ([x, y]) => { const a = num(scalar(x)); const b = num(scalar(y)); return firstError(a, b) ?? Math.floor(Math.ceil(a) + Math.random() * (Math.floor(b) - Math.ceil(a) + 1)); },
  // ── logic
  IF: ([c, a, b]) => { const t = bool(scalar(c)); if (isError(t)) return t; return t ? (a == null || a.missing ? 0 : a) : b == null ? false : b.missing ? 0 : b; },
  IFS: (a) => { for (let i = 0; i + 1 < a.length; i += 2) { const t = bool(scalar(a[i])); if (isError(t)) return t; if (t) return a[i + 1]; } return err('#N/A'); },
  IFERROR: ([v, alt]) => (isError(scalar(v)) ? alt : v),
  IFNA: ([v, alt]) => (isError(scalar(v)) && scalar(v).error === '#N/A' ? alt : v),
  AND: (a) => { const vs = flat(a).map(({ v }) => v).filter((v) => !blank(v)).map(bool); return vs.find(isError) ?? (vs.length ? vs.every(Boolean) : err('#VALUE!')); },
  OR: (a) => { const vs = flat(a).map(({ v }) => v).filter((v) => !blank(v)).map(bool); return vs.find(isError) ?? (vs.length ? vs.some(Boolean) : err('#VALUE!')); },
  XOR: (a) => { const vs = flat(a).map(({ v }) => v).filter((v) => !blank(v)).map(bool); return vs.find(isError) ?? vs.filter(Boolean).length % 2 === 1; },
  NOT: ([x]) => { const b = bool(scalar(x)); return isError(b) ? b : !b; },
  TRUE: () => true,
  FALSE: () => false,
  CHOOSE: ([i, ...options]) => { const n = num(scalar(i)); if (isError(n)) return n; return options[Math.trunc(n) - 1] ?? err('#VALUE!'); },
  SWITCH: ([x, ...rest]) => { const v = scalar(x); for (let i = 0; i + 1 < rest.length; i += 2) if (compare(scalar(rest[i]), v) === 0) return rest[i + 1]; return rest.length % 2 ? rest[rest.length - 1] : err('#N/A'); },
  // ── conditional
  SUMIF: ([range, crit, sumRange]) => { const ok = matchAll([[range, crit]]); const vs = cells(sumRange && !sumRange.missing ? sumRange : range); return ok.reduce((s, yes, i) => s + (yes && typeof vs[i] === 'number' ? vs[i] : 0), 0); },
  SUMIFS: ([sumRange, ...rest]) => { const pairs = []; for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]); const ok = matchAll(pairs); const vs = cells(sumRange); return ok.reduce((s, yes, i) => s + (yes && typeof vs[i] === 'number' ? vs[i] : 0), 0); },
  COUNTIF: ([range, crit]) => matchAll([[range, crit]]).filter(Boolean).length,
  COUNTIFS: (rest) => { const pairs = []; for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]); return matchAll(pairs).filter(Boolean).length; },
  AVERAGEIF: ([range, crit, avgRange]) => { const ok = matchAll([[range, crit]]); const vs = cells(avgRange && !avgRange.missing ? avgRange : range); const xs = vs.filter((v, i) => ok[i] && typeof v === 'number'); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : err('#DIV/0!'); },
  AVERAGEIFS: ([avgRange, ...rest]) => { const pairs = []; for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]); const ok = matchAll(pairs); const xs = cells(avgRange).filter((v, i) => ok[i] && typeof v === 'number'); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : err('#DIV/0!'); },
  MAXIFS: ([r, ...rest]) => { const pairs = []; for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]); const ok = matchAll(pairs); const xs = cells(r).filter((v, i) => ok[i] && typeof v === 'number'); return xs.length ? maxOf(xs) : 0; },
  MINIFS: ([r, ...rest]) => { const pairs = []; for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]); const ok = matchAll(pairs); const xs = cells(r).filter((v, i) => ok[i] && typeof v === 'number'); return xs.length ? minOf(xs) : 0; },
  // ── lookup
  VLOOKUP: ([needle, table, col, approx]) => {
    if (!table?.range) return err('#REF!');
    const n = num(scalar(col)); if (isError(n)) return n;
    const exact = approx != null && !approx.missing && !bool(scalar(approx));
    const i = lookupIndex(scalar(needle), table.values.map((r) => r[0]), exact ? 0 : 1);
    if (i < 0) return err('#N/A');
    const row = table.values[i];
    return n < 1 || n > row.length ? err('#REF!') : row[n - 1] ?? null;
  },
  HLOOKUP: ([needle, table, row, approx]) => {
    if (!table?.range) return err('#REF!');
    const n = num(scalar(row)); if (isError(n)) return n;
    const exact = approx != null && !approx.missing && !bool(scalar(approx));
    const i = lookupIndex(scalar(needle), table.values[0] ?? [], exact ? 0 : 1);
    if (i < 0) return err('#N/A');
    return n < 1 || n > table.values.length ? err('#REF!') : table.values[n - 1][i] ?? null;
  },
  XLOOKUP: ([needle, lookIn, returnIn, notFound]) => {
    const i = lookupIndex(scalar(needle), cells(lookIn), 0);
    if (i < 0) return notFound != null && !notFound.missing ? notFound : err('#N/A');
    return cells(returnIn)[i] ?? null;
  },
  MATCH: ([needle, list, mode]) => { const m = mode == null || mode.missing ? 1 : num(scalar(mode)); if (isError(m)) return m; const i = lookupIndex(scalar(needle), cells(list), Math.sign(m)); return i < 0 ? err('#N/A') : i + 1; },
  INDEX: ([table, row, col]) => {
    if (!table?.range) return row == null || num(scalar(row)) === 1 ? table : err('#REF!');
    let r = row == null || row.missing ? 0 : num(scalar(row));
    let c = col == null || col.missing ? 0 : num(scalar(col));
    if (isError(r)) return r; if (isError(c)) return c;
    if (table.values.length === 1 && col == null) { c = r; r = 1; }
    if (!r) r = 1; if (!c) c = 1;
    return table.values[r - 1]?.[c - 1] ?? (r > table.values.length || c > (table.values[0]?.length ?? 0) ? err('#REF!') : null);
  },
  ROWS: ([r]) => (r?.range ? r.values.length : 1),
  COLUMNS: ([r]) => (r?.range ? r.values[0]?.length ?? 0 : 1),
  ROW: ([r], ctx) => (r?.range ? r.r0 + 1 : r?.ref ? r.ref.r + 1 : ctx.r + 1),
  COLUMN: ([r], ctx) => (r?.range ? r.c0 + 1 : r?.ref ? r.ref.c + 1 : ctx.c + 1),
  // ── text
  LEN: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : [...s].length; },
  LEFT: ([x, n]) => { const s = text(scalar(x)); const k = n == null || n.missing ? 1 : num(scalar(n)); return firstError(s, k) ?? [...s].slice(0, Math.max(0, k)).join(''); },
  RIGHT: ([x, n]) => { const s = text(scalar(x)); const k = n == null || n.missing ? 1 : num(scalar(n)); return firstError(s, k) ?? (k <= 0 ? '' : [...s].slice(-k).join('')); },
  MID: ([x, start, n]) => { const s = text(scalar(x)); const a = num(scalar(start)); const k = num(scalar(n)); return firstError(s, a, k) ?? [...s].slice(a - 1, a - 1 + k).join(''); },
  UPPER: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : s.toUpperCase(); },
  LOWER: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : s.toLowerCase(); },
  PROPER: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); },
  TRIM: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : s.trim().replace(/ {2,}/g, ' '); },
  CONCAT: (a) => { const parts = flat(a).map(({ v }) => text(v)); return parts.find(isError) ?? parts.join(''); },
  CONCATENATE: (a) => FUNCTIONS.CONCAT(a),
  TEXTJOIN: ([sep, skip, ...a]) => { const d = text(scalar(sep)); const s = bool(scalar(skip)); const parts = flat(a).map(({ v }) => v).filter((v) => !(s && blank(v))).map(text); return parts.find(isError) ?? parts.join(d); },
  SUBSTITUTE: ([x, from, to, which]) => {
    const s = text(scalar(x)); const f = text(scalar(from)); const r = text(scalar(to));
    const e = firstError(s, f, r); if (e) return e;
    if (!f) return s;
    if (which == null || which.missing) return s.split(f).join(r);
    const n = num(scalar(which)); let k = 0;
    return s.replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => (++k === n ? r : m));
  },
  REPLACE: ([x, start, n, to]) => { const s = [...text(scalar(x))]; const a = num(scalar(start)); const k = num(scalar(n)); const r = text(scalar(to)); return firstError(a, k, r) ?? [...s.slice(0, a - 1), r, ...s.slice(a - 1 + k)].join(''); },
  FIND: ([needle, hay, start]) => { const s = text(scalar(hay)); const f = text(scalar(needle)); const a = start == null || start.missing ? 1 : num(scalar(start)); const i = s.indexOf(f, a - 1); return i < 0 ? err('#VALUE!') : i + 1; },
  SEARCH: ([needle, hay, start]) => { const s = text(scalar(hay)).toLowerCase(); const a = start == null || start.missing ? 1 : num(scalar(start)); const test = criterion(`${text(scalar(needle))}*`); for (let i = a - 1; i < s.length; i++) if (test(s.slice(i))) return i + 1; return err('#VALUE!'); },
  REPT: ([x, n]) => { const s = text(scalar(x)); const k = num(scalar(n)); return firstError(s, k) ?? s.repeat(Math.max(0, Math.trunc(k))); },
  EXACT: ([a, b]) => text(scalar(a)) === text(scalar(b)),
  VALUE: ([x]) => num(scalar(x)),
  TEXT: ([x, fmt]) => {
    const v = scalar(x); const f = text(scalar(fmt));
    const n = num(v);
    if (isError(n)) return text(v);
    if (/[ymd]/i.test(f)) { const d = toDate(v); if (!d) return text(v); const p = (k) => String(k).padStart(2, '0'); return f.replace(/yyyy/gi, d.getUTCFullYear()).replace(/yy/gi, String(d.getUTCFullYear()).slice(2)).replace(/mm/gi, p(d.getUTCMonth() + 1)).replace(/dd/gi, p(d.getUTCDate())); }
    const percent = f.includes('%');
    const decimals = (/\.(0+)/.exec(f)?.[1].length) ?? 0;
    const grouped = f.includes(',');
    const value = percent ? n * 100 : n;
    const body = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    return `${f.match(/^[^#0.,%]*/)[0]}${body}${percent ? '%' : ''}`;
  },
  CHAR: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : String.fromCharCode(n); },
  CODE: ([x]) => { const s = text(scalar(x)); return isError(s) ? s : s ? s.charCodeAt(0) : err('#VALUE!'); },
  // ── information
  ISNUMBER: ([x]) => typeof scalar(x) === 'number',
  ISTEXT: ([x]) => typeof scalar(x) === 'string' && scalar(x) !== '',
  ISBLANK: ([x]) => blank(scalar(x)),
  ISERROR: ([x]) => isError(scalar(x)),
  ISERR: ([x]) => isError(scalar(x)) && scalar(x).error !== '#N/A',
  ISNA: ([x]) => isError(scalar(x)) && scalar(x).error === '#N/A',
  ISEVEN: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.trunc(n) % 2 === 0; },
  ISODD: ([x]) => { const n = num(scalar(x)); return isError(n) ? n : Math.abs(Math.trunc(n) % 2) === 1; },
  NA: () => err('#N/A'),
  // ── dates (dates are "2024-03-01" text in this program's tables; numbers are Excel serial days)
  TODAY: () => isoDate(new Date()),
  NOW: () => { const d = new Date(); return `${isoDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; },
  DATE: ([y, m, d]) => { const a = num(scalar(y)); const b = num(scalar(m)); const c = num(scalar(d)); return firstError(a, b, c) ?? isoDate(new Date(Date.UTC(a, b - 1, c))); },
  YEAR: ([x]) => { const d = toDate(scalar(x)); return d ? d.getUTCFullYear() : err('#VALUE!'); },
  MONTH: ([x]) => { const d = toDate(scalar(x)); return d ? d.getUTCMonth() + 1 : err('#VALUE!'); },
  DAY: ([x]) => { const d = toDate(scalar(x)); return d ? d.getUTCDate() : err('#VALUE!'); },
  WEEKDAY: ([x]) => { const d = toDate(scalar(x)); return d ? d.getUTCDay() + 1 : err('#VALUE!'); },
  DAYS: ([a, b]) => { const x = toDate(scalar(a)); const y = toDate(scalar(b)); return x && y ? Math.round((x - y) / 86400000) : err('#VALUE!'); },
  EDATE: ([x, n]) => { const d = toDate(scalar(x)); const k = num(scalar(n)); if (!d || isError(k)) return err('#VALUE!'); d.setUTCMonth(d.getUTCMonth() + k); return isoDate(d); },
};

/** Function names, for the formula bar's list and the "Insert function" menu. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS).filter((n) => !['TRUE', 'FALSE'].includes(n)).sort();
/** The functions people use most (the AutoSum button's list). */
export const COMMON_FUNCTIONS = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'ROUND', 'SUMIF', 'COUNTIF', 'VLOOKUP', 'CONCAT', 'TODAY'];

// ───────────────────────── evaluation

/**
 * Evaluates one formula. `get(r, c)` gives a cell's value (formula cells calculated); `bounds()` the used size
 * ({ rows, cols }) for whole-column ranges; `at` the formula's own cell { r, c }.
 */
export function evaluate(formula, { get, bounds = () => ({ rows: 0, cols: 0 }), at = { r: 0, c: 0 } }) {
  let tree;
  try { tree = typeof formula === 'string' ? parse(formula) : formula; } catch (e) { return isError(e) ? e : err('#NAME?'); }
  const ev = (node) => {
    switch (node.k) {
      case 'num': case 'str': case 'bool': return node.v;
      case 'err': return err(node.v);
      case 'missing': return { missing: true };
      case 'ref': { const v = get(node.r, node.c); return v === undefined ? null : v; }
      case 'range': {
        const b = bounds();
        const r1 = Math.min(node.r1, node.r1 === Infinity ? b.rows - 1 : node.r1);
        const c1 = Math.min(node.c1, node.c1 === Infinity ? b.cols - 1 : node.c1);
        const values = [];
        for (let r = node.r0; r <= r1; r++) { const row = []; for (let c = node.c0; c <= c1; c++) row.push(get(r, c) ?? null); values.push(row); }
        return { range: true, values, r0: node.r0, c0: node.c0 };
      }
      case 'un': { const x = num(scalar(ev(node.x))); return isError(x) ? x : node.op === '-' ? -x : x; }
      case 'pct': { const x = num(scalar(ev(node.x))); return isError(x) ? x : x / 100; }
      case 'bin': {
        const a = scalar(ev(node.a));
        const b = scalar(ev(node.b));
        if (isError(a)) return a;
        if (isError(b)) return b;
        if (node.op === '&') return text(a) + text(b);
        if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
          // Text that reads as a number compares as text unless both sides are numbers.
          const d = typeof a === 'string' && typeof b === 'string' ? a.toLowerCase().localeCompare(b.toLowerCase()) : compare(a ?? 0, b ?? 0);
          return { '=': d === 0, '<>': d !== 0, '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0 }[node.op];
        }
        const x = num(a);
        const y = num(b);
        if (isError(x)) return x;
        if (isError(y)) return y;
        switch (node.op) {
          case '+': return x + y;
          case '-': return x - y;
          case '*': return x * y;
          case '/': return y === 0 ? err('#DIV/0!') : x / y;
          case '^': { const p = x ** y; return Number.isFinite(p) ? p : err('#NUM!'); }
          default: return err('#VALUE!');
        }
      }
      case 'func': {
        const fn = FUNCTIONS[node.name];
        if (!fn) return err('#NAME?');
        // IF / IFERROR / CHOOSE … only need the arguments they use, but evaluating all is simpler and safe here.
        const args = node.args.map((a) => (a.k === 'ref' ? withRef(ev(a), a) : ev(a)));
        const out = fn(args, at);
        return out && out.range && out.values.length === 1 && out.values[0].length === 1 ? out.values[0][0] : out;
      }
      default: return err('#VALUE!');
    }
  };
  // ROW(B3) / COLUMN(B3) need the reference, not just its value: a one-cell range carries both.
  const withRef = (value, node) => ({ range: true, values: [[value]], r0: node.r, c0: node.c, ref: node });
  try {
    const out = scalar(ev(tree));
    if (out && typeof out === 'object' && !isError(out)) return out.missing ? 0 : err('#VALUE!');
    if (typeof out === 'number' && !Number.isFinite(out)) return err('#NUM!');
    return out;
  } catch (e) {
    return isError(e) ? e : err('#VALUE!');
  }
}

/**
 * Calculates every formula of a sheet. `cells` is the sheet as rows of values (row 0: the header names);
 * `formulas` { "r,c": "=…" }. Returns new rows with the formula cells' results written in (numbers, text,
 * TRUE/FALSE, or the error's text); the input is not changed.
 */
export function recalc(cells, formulas) {
  const keys = Object.keys(formulas ?? {});
  if (!keys.length) return cells;
  const out = cells.map((row) => [...row]);
  const values = new Map();
  const busy = new Set();
  // Whole-column ranges reach the last row that has a value or a formula.
  const keyed = keys.map((k) => k.split(',').map(Number));
  const maxRow = maxOf(keyed.map(([r]) => r + 1), out.length);
  const maxCol = maxOf(keyed.map(([, c]) => c + 1), maxOf(out.map((r) => r.length), 0));
  const rows = () => maxRow;
  const width = () => maxCol;
  const trees = new Map();
  const calc = (key) => {
    if (values.has(key)) return values.get(key);
    if (busy.has(key)) return err('#CIRC!');
    busy.add(key);
    const [r, c] = key.split(',').map(Number);
    if (!trees.has(key)) { try { trees.set(key, parse(formulas[key])); } catch (e) { trees.set(key, { k: 'err', v: isError(e) ? e.error : '#NAME?' }); } }
    const v = evaluate(trees.get(key), { get, bounds: () => ({ rows: rows(), cols: width() }), at: { r, c } });
    busy.delete(key);
    values.set(key, v);
    return v;
  };
  function get(r, c) {
    const key = `${r},${c}`;
    if (formulas[key] != null) return calc(key);
    return out[r]?.[c] ?? null;
  }
  for (const key of keys) {
    const [r, c] = key.split(',').map(Number);
    const v = calc(key);
    while (out.length <= r) out.push([]);
    out[r][c] = isError(v) ? v.error : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v === '' ? null : v;
  }
  return out;
}

// ───────────────────────── number formats

/**
 * A value as the sheet shows it in a format { type: 'general' | 'number' | 'thousands' | 'currency' | 'percent' |
 * 'scientific' | 'date' | 'text', decimals, symbol }.
 */
export function formatValue(value, fmt, language = 'ko') {
  if (value == null || value === '') return '';
  if (!fmt || !fmt.type || fmt.type === 'general' || fmt.type === 'text') {
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e10) / 1e10);
    return String(value);
  }
  const n = typeof value === 'number' ? value : parseNumber(value);
  if (fmt.type === 'date') {
    const d = typeof value === 'number' ? toDate(value) : parseDate(value) != null ? new Date(parseDate(value)) : null;
    return d ? isoDate(d) : String(value);
  }
  if (n == null) return String(value);
  const decimals = fmt.decimals ?? (fmt.type === 'percent' ? 0 : 2);
  const locale = language === 'en' ? 'en-US' : 'ko-KR';
  switch (fmt.type) {
    case 'number': return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
    case 'thousands': return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    case 'currency': {
      const symbol = fmt.symbol ?? (language === 'en' ? '$' : '₩');
      const body = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      return `${n < 0 ? '-' : ''}${symbol}${body}`;
    }
    case 'percent': return `${(n * 100).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
    case 'scientific': return n.toExponential(decimals).replace('e+', 'E+').replace('e-', 'E-');
    default: return String(value);
  }
}
