// Recursive-descent parser for display filters. Precedence follows Wireshark's grammar.lemon:
//   || (or)  <  ^^ (xor)  <  && (and)  <  ! (not)  <  relations  <  &  <  + -  <  * / %  <  unary -
// Words stay unresolved here (field or literal is decided by the compiler).
import { FILTER_ERRORS as E, FilterError } from './errors.js';
import { tokenize } from './lexer.js';

/**
 * AST nodes (all carry at/end character positions):
 *   { k: 'or'|'and'|'xor', a, b }  { k: 'not', a }
 *   { k: 'cmp', op, quant: null|'any'|'all', a, b }
 *   { k: 'in', a, set: [{ lo, hi? }], neg, quant }
 *   { k: 'word', text, rawBytes?, layer?: ranges, slices?: [ranges] }  -- field or unparsed literal
 *   { k: 'str', bytes, str } | { k: 'char', code }
 *   { k: 'ref', name, layer? }
 *   { k: 'func', name, args }
 *   { k: 'arith', op, a, b } | { k: 'neg', a }
 *   { k: 'slice', of, ranges }
 *   { k: 'paren', a }  (kept so "(a) == b" errors point at the right place)
 */
export function parse(text) {
  const toks = tokenize(text);
  const deprecated = [];
  for (const t of toks) if (t.deprecated) deprecated.push({ message: t.deprecated, at: t.at, end: t.end });
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const unexpected = (t) => {
    if (t.t === 'eof') return new FilterError(E.UNEXPECTED_END, 'Unexpected end of filter expression.', t.at, t.at);
    return new FilterError(E.UNEXPECTED_TOKEN, `"${t.text}" was unexpected in this context.`, t.at, t.end);
  };
  const expect = (type) => {
    const t = peek();
    if (t.t !== type) throw unexpected(t);
    return next();
  };

  function orExpr() {
    let a = xorExpr();
    while (peek().t === 'or') { next(); const b = xorExpr(); a = { k: 'or', a, b, at: a.at, end: b.end }; }
    return a;
  }
  function xorExpr() {
    let a = andExpr();
    while (peek().t === 'xor') { next(); const b = andExpr(); a = { k: 'xor', a, b, at: a.at, end: b.end }; }
    return a;
  }
  function andExpr() {
    let a = notExpr();
    while (peek().t === 'and') { next(); const b = notExpr(); a = { k: 'and', a, b, at: a.at, end: b.end }; }
    return a;
  }
  function notExpr() {
    if (peek().t === 'not') {
      const t = next();
      const a = notExpr();
      return { k: 'not', a, at: t.at, end: a.end };
    }
    return relation();
  }
  function relation() {
    let quant = null;
    let qt = null;
    if (peek().t === 'any' || peek().t === 'all') { qt = next(); quant = qt.t; }
    const a = bitand();
    const t = peek();
    if (t.t === 'cmp') {
      next();
      const b = bitand();
      if (peek().t === 'cmp') throw unexpected(peek()); // relations do not chain
      return { k: 'cmp', op: t.v, opAt: t.at, opEnd: t.end, quant, a, b, at: qt ? qt.at : a.at, end: b.end };
    }
    if (t.t === 'in' || (t.t === 'not' && toks[p + 1].t === 'in')) {
      const neg = t.t === 'not';
      next(); if (neg) next();
      const s = set();
      return { k: 'in', a, set: s.items, neg, quant, at: qt ? qt.at : a.at, end: s.end, spaceSep: s.spaceSep };
    }
    if (quant) throw unexpected(t);
    return a;
  }
  function set() {
    const open = expect('lbrace');
    const items = [];
    let spaceSep = null;
    if (peek().t === 'rbrace') throw unexpected(peek());
    for (;;) {
      const lo = bitand();
      let hi = null;
      if (peek().t === 'dotdot') { next(); hi = bitand(); }
      items.push({ lo, hi });
      const t = peek();
      if (t.t === 'rbrace') { next(); return { items, end: t.end, spaceSep, at: open.at }; }
      if (t.t === 'comma') { next(); continue; }
      if (t.t === 'eof') throw unexpected(t);
      // Wireshark 4.6 requires commas; older versions separated by spaces. Accept, flag as deprecated.
      if (!spaceSep) spaceSep = { at: t.at, end: t.end };
    }
  }
  function bitand() {
    let a = additive();
    while (peek().t === 'arith' && peek().v === '&') { const o = next(); const b = additive(); a = { k: 'arith', op: '&', a, b, at: a.at, end: b.end, opAt: o.at }; }
    return a;
  }
  function additive() {
    let a = mult();
    while (peek().t === 'arith' && (peek().v === '+' || peek().v === '-')) { const o = next(); const b = mult(); a = { k: 'arith', op: o.v, a, b, at: a.at, end: b.end, opAt: o.at }; }
    return a;
  }
  function mult() {
    let a = unary();
    while (peek().t === 'arith' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) { const o = next(); const b = unary(); a = { k: 'arith', op: o.v, a, b, at: a.at, end: b.end, opAt: o.at }; }
    return a;
  }
  function unary() {
    const t = peek();
    if (t.t === 'arith' && (t.v === '-' || t.v === '+')) {
      next();
      const a = unary();
      if (t.v === '+') return a;
      return { k: 'neg', a, at: t.at, end: a.end };
    }
    return postfix();
  }
  function postfix() {
    let a = primary();
    for (;;) {
      const t = peek();
      if (t.t === 'slice') {
        next();
        a = { k: 'slice', of: a, ranges: parseRanges(t.v, t.at + 1), at: a.at, end: t.end, sliceAt: t.at };
        continue;
      }
      if (t.t === 'hash') {
        next();
        if (a.k !== 'word' && a.k !== 'ref') throw new FilterError(E.BAD_LAYER, 'Layer operator can only be applied to a field.', t.at, t.end);
        const l = peek();
        let ranges;
        if (l.t === 'slice') { next(); ranges = parseRanges(l.v, l.at + 1); }
        else if (l.t === 'word' && /^\d+$/.test(l.v)) { next(); ranges = [{ start: +l.v, len: 1 }]; }
        else if (l.t === 'arith' && l.v === '-' && toks[p + 1].t === 'word' && /^\d+$/.test(toks[p + 1].v)) { next(); const w = next(); ranges = [{ start: -w.v, len: 1 }]; }
        else throw unexpected(l);
        a = { ...a, layer: ranges, end: toks[p - 1].end };
        continue;
      }
      return a;
    }
  }
  function primary() {
    const t = peek();
    switch (t.t) {
      case 'word': {
        next();
        if (peek().t === 'lp') {
          next();
          const args = [];
          if (peek().t !== 'rp') {
            for (;;) {
              args.push(bitand());
              if (peek().t === 'comma') { next(); continue; }
              break;
            }
          }
          const close = expect('rp');
          return { k: 'func', name: t.v, args, at: t.at, end: close.end, nameEnd: t.end };
        }
        return { k: 'word', text: t.v, rawBytes: !!t.rawBytes, at: t.at, end: t.end };
      }
      case 'str': next(); return { k: 'str', bytes: t.v.bytes, str: t.v.str, at: t.at, end: t.end, raw: t.raw };
      case 'char': next(); return { k: 'char', code: t.v, at: t.at, end: t.end };
      case 'ref': next(); return { k: 'ref', name: t.v, at: t.at, end: t.end };
      case 'lp': {
        next();
        const a = orExpr();
        const close = expect('rp');
        return { k: 'paren', a, at: t.at, end: close.end };
      }
      default:
        throw unexpected(t);
    }
  }

  if (peek().t === 'eof') return { ast: null, deprecated };
  const ast = orExpr();
  if (peek().t !== 'eof') throw unexpected(peek());
  return { ast, deprecated, setSpaces: collectSetSpaces(ast) };
}

function collectSetSpaces(ast) {
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.k === 'in' && n.spaceSep) out.push(n.spaceSep);
    for (const key of ['a', 'b', 'of']) if (n[key]) walk(n[key]);
    if (n.args) n.args.forEach(walk);
  })(ast);
  return out;
}

/**
 * Slice / layer range list: "0:3", "1-2", ":4", "2:", "-1", "0,3-5". Offsets may be negative (from the end).
 * Returns [{ start, len?: number|null (null = to end), end?: inclusive end }].
 */
export function parseRanges(text, at = 0) {
  const parts = text.split(',');
  if (!text.trim()) throw new FilterError(E.BAD_SLICE, `"[${text}]" is not a valid slice.`, at - 1, at + text.length + 1);
  const out = [];
  let pos = at;
  for (const raw of parts) {
    const s = raw.trim();
    let m;
    const bad = () => new FilterError(E.BAD_SLICE, `"${s}" is not a valid slice.`, pos, pos + raw.length);
    if ((m = /^(-?\d+)?:(\d+)?$/.exec(s))) {
      // start:length (either side optional)
      out.push({ start: m[1] === undefined ? 0 : +m[1], len: m[2] === undefined ? null : +m[2] });
    } else if ((m = /^(-?\d+)-(-?\d+)$/.exec(s))) {
      out.push({ start: +m[1], end: +m[2] });
    } else if ((m = /^-?\d+$/.exec(s))) {
      out.push({ start: +s, len: 1 });
    } else throw bad();
    pos += raw.length + 1;
  }
  return out;
}

/** Apply slice ranges to a byte array (Wireshark semantics: clipped to the data, concatenated). */
export function applyRanges(data, ranges) {
  const n = data.length;
  if (ranges.length === 1) {
    const [s, e] = bounds(ranges[0], n);
    if (s === null) return null;
    return data.subarray(s, e);
  }
  const parts = [];
  let total = 0;
  for (const r of ranges) {
    const [s, e] = bounds(r, n);
    if (s === null) return null;
    parts.push(data.subarray(s, e));
    total += e - s;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function bounds(r, n) {
  let s = r.start < 0 ? n + r.start : r.start;
  let e;
  if (r.end !== undefined) e = (r.end < 0 ? n + r.end : r.end) + 1;
  else if (r.len === null) e = n;
  else e = s + r.len;
  if (s < 0 || s >= n || e <= s) return [null, null];
  if (e > n) {
    // Wireshark: a slice that runs past the end of the value does not exist.
    return [null, null];
  }
  return [s, e];
}
