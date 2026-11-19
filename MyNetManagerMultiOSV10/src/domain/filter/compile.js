// AST → closures. Compiled once per filter; evaluation does only Map lookups, value conversion
// and comparisons. Value expressions evaluate to arrays (a field can occur many times) and
// relations quantify over them like Wireshark 4.x: "==" any-equal, "!=" all-not-equal,
// "===" all-equal, "!==" any-not-equal; missing fields make every relation false.
import { FILTER_ERRORS as E, FilterError, typeDescription, ftName } from './errors.js';
import { applyRanges } from './parser.js';
import {
  canon, nodeBytes, asBytes, asString, parseLiteral, parseInteger, parseFloatLit, equal, order, contains, latin1,
  NUMERIC, INTEGER, STRINGLIKE, utf8,
} from './values.js';

const EMPTY = Object.freeze([]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_\-]*(\.[A-Za-z0-9_\-]+)*$/;
const SLICEABLE = new Set(['bytes', 'ether', 'ipv6', 'ipv4', 'protocol', 'none', 'string', 'oid', 'guid']);
const CONTAINS_OK = new Set(['bytes', 'ether', 'ipv6', 'protocol', 'none', 'string', 'oid', 'guid']);
const MATCHES_OK = new Set(['bytes', 'protocol', 'none', 'string', 'oid']);

// Which relation needs what: [predicate kind, default quantifier]
const OPS = {
  eq: ['eq', 'any'], ne: ['ne', 'all'], all_eq: ['eq', 'all'], any_ne: ['ne', 'any'],
  gt: ['gt', 'any'], ge: ['ge', 'any'], lt: ['lt', 'any'], le: ['le', 'any'],
  contains: ['contains', 'any'], matches: ['matches', 'any'],
};
const MIRROR = { gt: 'lt', lt: 'gt', ge: 'le', le: 'ge' };
const OP_TEXT = { eq: '==', ne: '!=', all_eq: '===', any_ne: '!==', gt: '>', ge: '>=', lt: '<', le: '<=', contains: 'contains', matches: 'matches' };

const PRED = {
  eq: equal,
  ne: (a, b) => !equal(a, b),
  gt: (a, b) => order(a, b) > 0,
  ge: (a, b) => order(a, b) >= 0,
  lt: (a, b) => order(a, b) < 0,
  le: (a, b) => order(a, b) <= 0,
  contains,
};

function anyPair(A, B, f) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (f(A[i], B[j])) return true;
  return false;
}
function allPairs(A, B, f) {
  if (A.length === 0 || B.length === 0) return false;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (!f(A[i], B[j])) return false;
  return true;
}

// Per-dissection cache of which protocol layer each node belongs to (for the '#' operator).
const LAYER_CACHE = new WeakMap();

/**
 * Compile an AST into a test function (d, env) → boolean.
 * opts: { fields: Map|null, unknownFields: 'error'|'absent' }
 * Returns { test, fieldsUsed, warnings }.
 */
export function compileAst(ast, opts = {}) {
  const fields = opts.fields || null;
  const absentUnknown = opts.unknownFields === 'absent';
  const used = new Set();
  const warnings = [];

  const infoOf = (name) => (fields ? fields.get(name) || null : null);
  const protoOf = (name) => {
    const i = infoOf(name);
    if (i && i.protocol) return i.protocol;
    const dot = name.indexOf('.');
    return dot < 0 ? name : name.slice(0, dot);
  };
  const isField = (w) => {
    if (fields) return fields.has(w.text);
    return IDENT.test(w.text) && /[A-Za-z]/.test(w.text[0]);
  };
  const unknown = (w) => new FilterError(E.UNKNOWN_FIELD, `"${w.text}" is not a valid protocol or protocol field.`, w.at, w.end, { name: w.text });

  // ---------------------------------------------------------------- values
  // A value is { lit: AST } (unresolved literal) or { ft, info, name, ev(d, env) → array, field?, ref?, konst? }.

  function layerFilter(name, ranges) {
    const proto = protoOf(name);
    return (d, nodes) => {
      let map = LAYER_CACHE.get(d);
      if (!map) { map = buildLayers(d, protoOf); LAYER_CACHE.set(d, map); }
      const total = map.counts.get(proto) || 0;
      const out = [];
      for (const n of nodes) {
        const l = map.layer.get(n) || 1;
        if (layerMatch(l, total, ranges)) out.push(n);
      }
      return out;
    };
  }

  function fieldValue(w, isRef) {
    const name = w.text;
    const info = infoOf(name);
    if (!info && fields && !absentUnknown) throw unknown(w);
    used.add(name);
    const ft = info ? info.type : null;
    const raw = !!w.rawBytes;
    const layer = w.layer ? layerFilter(name, w.layer) : null;
    const get = (d) => {
      if (!d || !d.fields) return EMPTY;
      let nodes = d.fields.get(name);
      if (nodes === undefined || nodes.length === 0) return EMPTY;
      if (layer) nodes = layer(d, nodes);
      const out = new Array(nodes.length);
      for (let i = 0; i < nodes.length; i++) out[i] = raw ? nodeBytes(d, nodes[i]) : canon(nodes[i], d);
      if (ft === null) out.ft = nodes[0].type;
      return out;
    };
    const ev = isRef ? (d, env) => (env && env.ref ? get(env.ref) : EMPTY) : get;
    return { ft: raw ? 'bytes' : ft, info, name, ev, field: !isRef, ref: isRef, w, nodes: isRef ? null : (d) => {
      let nodes = d && d.fields ? d.fields.get(name) : undefined;
      if (nodes === undefined) return EMPTY;
      if (layer) nodes = layer(d, nodes);
      return nodes;
    } };
  }

  function value(n) {
    switch (n.k) {
      case 'paren': {
        const inner = n.a;
        if (['or', 'and', 'xor', 'not', 'cmp', 'in'].includes(inner.k)) {
          throw new FilterError(E.UNEXPECTED_TOKEN, 'A logical expression cannot be used as a value.', n.at, n.end);
        }
        return value(inner);
      }
      case 'word':
        if (n.rawBytes) {
          if (!isField(n) && !absentUnknown) throw unknown(n);
          return fieldValue(n, false);
        }
        if (n.text.startsWith(':')) return { lit: n };
        if (n.text.startsWith('.') && n.text.length > 1) {
          const w = { ...n, text: n.text.slice(1) };
          if (!isField(w) && !absentUnknown) throw unknown(w);
          return fieldValue(w, false);
        }
        if (isField(n)) return fieldValue(n, false);
        // lenient mode (colouring rules): dotted unknown names are fields that never occur
        if (absentUnknown && n.text.includes('.') && IDENT.test(n.text)) return fieldValue(n, false);
        if (n.layer) throw unknown(n);
        return { lit: n };
      case 'ref': {
        const m = /^(.*?)(?:#(-?\d+))?$/.exec(n.name);
        const w = { k: 'word', text: m[1], at: n.at, end: n.end };
        if (m[2] !== undefined) w.layer = [{ start: +m[2], len: 1 }];
        if (n.layer) w.layer = n.layer;
        if (fields && !fields.has(w.text)) throw unknown(w);
        return fieldValue(w, true);
      }
      case 'str': case 'char':
        return { lit: n };
      case 'slice': return sliceValue(n);
      case 'func': return funcValue(n);
      case 'arith': return arithValue(n);
      case 'neg': return negValue(n);
      default:
        throw new FilterError(E.UNEXPECTED_TOKEN, 'A logical expression cannot be used as a value.', n.at, n.end);
    }
  }

  /** Literal → constant value array, parsed for `ft` (when known) or lazily per runtime type. */
  function literalFor(litNode, ft, info) {
    if (ft) {
      const v = parseLiteral(litNode, ft, info);
      const arr = [v];
      return () => arr;
    }
    const cache = new Map();
    return (rtFt) => {
      const key = rtFt || 'bytes';
      let r = cache.get(key);
      if (r === undefined) {
        try { r = [parseLiteral(litNode, key, null)]; } catch { r = EMPTY; }
        cache.set(key, r);
      }
      return r;
    };
  }

  function sliceValue(n) {
    const of = value(n.of);
    if (of.lit) {
      // slicing a literal string: constant
      if (of.lit.k !== 'str') throw unknown(of.lit);
      const b = applyRanges(of.lit.bytes, n.ranges);
      const arr = b ? [b] : EMPTY;
      return { ft: 'bytes', ev: () => arr, konst: true };
    }
    if (of.ft && !SLICEABLE.has(of.ft)) {
      const what = of.name ? `"${of.name}"` : 'This expression';
      throw new FilterError(E.CANNOT_SLICE, `${what} is a ${typeDescription(of.ft, of.info)} and cannot be sliced into a sequence of bytes.`, n.of.at, n.of.end);
    }
    const ranges = n.ranges;
    const ev = (d, env) => {
      const vals = of.ev(d, env);
      if (vals.length === 0) return EMPTY;
      const ft = of.ft || vals.ft;
      const out = [];
      for (const v of vals) {
        const b = asBytes(v, ft);
        if (!b) continue;
        const s = applyRanges(b, ranges);
        if (s) out.push(s);
      }
      return out;
    };
    return { ft: 'bytes', ev, konst: of.konst, ref: of.ref };
  }

  function needArgs(n, min, max) {
    if (n.args.length < min || n.args.length > max) {
      const want = min === max ? `${min} argument${min === 1 ? '' : 's'}` : max === Infinity ? `at least ${min} arguments` : `${min} to ${max} arguments`;
      throw new FilterError(E.BAD_ARG_COUNT, `Function ${n.name}() needs ${want}.`, n.at, n.end, { name: n.name });
    }
  }

  function funcValue(n) {
    const name = n.name;
    const argErr = (msg, a) => new FilterError(E.BAD_FUNCTION_ARG, msg, a ? a.at : n.at, a ? a.end : n.end, { name });
    switch (name) {
      case 'len': {
        needArgs(n, 1, 1);
        const a = value(n.args[0]);
        if (a.lit) {
          if (a.lit.k !== 'str') throw argErr('Argument does not support the len() function', n.args[0]);
          const arr = [a.lit.bytes.length];
          return { ft: 'uint', ev: () => arr, konst: true };
        }
        if (a.ft && (NUMERIC.has(a.ft) && a.ft !== 'abs_time' || a.ft === 'abs_time')) throw argErr('Argument does not support the len() function', n.args[0]);
        return {
          ft: 'uint', konst: a.konst, ref: a.ref,
          ev: (d, env) => {
            if (a.field && !a.w.rawBytes) {
              const ns = a.nodes(d);
              if (ns.length && (ns[0].type === 'protocol' || ns[0].type === 'none')) return ns.map((x) => x.length || 0);
            }
            const vals = a.ev(d, env);
            if (vals.length === 0) return EMPTY;
            const ft = a.ft || vals.ft;
            return vals.map((v) => (typeof v === 'string' ? utf8(v).length : (asBytes(v, ft) || EMPTY).length));
          },
        };
      }
      case 'count': {
        needArgs(n, 1, 1);
        const a = value(n.args[0]);
        if (!a.field && !a.ref) throw argErr('Only fields can be used as parameter for count()', n.args[0]);
        const nodesOf = a.ref ? (d, env) => (env && env.ref && env.ref.fields.get(a.name)) || EMPTY : (d) => a.nodes(d);
        return { ft: 'uint', ev: (d, env) => { const ns = nodesOf(d, env); return [ns.length]; }, ref: a.ref };
      }
      case 'lower': case 'upper': {
        needArgs(n, 1, 1);
        const a = value(n.args[0]);
        const up = name === 'upper';
        if (a.lit) {
          if (a.lit.k !== 'str') throw argErr(`Only string type fields can be used as parameter for ${name}()`, n.args[0]);
          const arr = [up ? a.lit.str.toUpperCase() : a.lit.str.toLowerCase()];
          return { ft: 'string', ev: () => arr, konst: true };
        }
        if (a.ft && !STRINGLIKE.has(a.ft)) throw argErr(`Only string type fields can be used as parameter for ${name}()`, n.args[0]);
        return { ft: 'string', ref: a.ref, ev: (d, env) => a.ev(d, env).map((v) => (typeof v === 'string' ? (up ? v.toUpperCase() : v.toLowerCase()) : v)) };
      }
      case 'string': {
        needArgs(n, 1, 1);
        const a = value(n.args[0]);
        if (a.lit) throw argErr('Argument to string() must be a field', n.args[0]);
        if (a.ft === 'protocol' || a.ft === 'none') throw argErr('Argument does not support the string() function', n.args[0]);
        return { ft: 'string', ref: a.ref, ev: (d, env) => { const vals = a.ev(d, env); const ft = a.ft || vals.ft; return vals.map((v) => asString(v, ft)); } };
      }
      case 'abs': {
        needArgs(n, 1, 1);
        const a = value(n.args[0]);
        if (a.lit) throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', n.at, n.end);
        if (a.ft && !NUMERIC.has(a.ft)) throw argErr(`Argument does not support the abs() function`, n.args[0]);
        return { ft: a.ft, info: a.info, ref: a.ref, ev: (d, env) => a.ev(d, env).map((v) => (typeof v === 'bigint' ? (v < 0n ? -v : v) : Math.abs(v))) };
      }
      case 'max': case 'min': {
        needArgs(n, 1, Infinity);
        const args = n.args.map(value);
        const ref = args.find((a) => !a.lit);
        if (!ref) throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', n.at, n.end);
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (!a.lit && a.ft && ref.ft && a.ft !== ref.ft && !(NUMERIC.has(a.ft) && NUMERIC.has(ref.ft))) {
            throw new FilterError(E.INCOMPATIBLE_TYPES, `Arguments to '${name}' must have the same type (expected ${typeDescription(ref.ft)}, got ${typeDescription(a.ft)})`, n.args[i].at, n.args[i].end);
          }
          if (!a.lit && a.ft && !NUMERIC.has(a.ft) && !['ipv4', 'string'].includes(a.ft)) throw argErr(`Argument does not support the ${name}() function`, n.args[i]);
        }
        const evs = args.map((a) => (a.lit ? literalFor(a.lit, ref.ft, ref.info) : a.ev));
        const isMax = name === 'max';
        return {
          ft: ref.ft, info: ref.info, ref: args.some((a) => a.ref),
          ev: (d, env) => {
            let best;
            let have = false;
            for (let i = 0; i < evs.length; i++) {
              const vals = args[i].lit ? evs[i](ref.ft) : evs[i](d, env);
              for (const v of vals) {
                if (!have) { best = v; have = true; continue; }
                const o = order(v, best);
                if (isMax ? o > 0 : o < 0) best = v;
              }
            }
            return have ? [best] : EMPTY;
          },
        };
      }
      default:
        throw new FilterError(E.UNKNOWN_FUNCTION, `Function '${name}' does not exist`, n.at, n.nameEnd || n.end, { name });
    }
  }

  function numericLiteral(lit) {
    // a literal used in arithmetic without a typed partner
    const text = lit.k === 'word' ? lit.text : lit.k === 'char' ? String(lit.code) : null;
    if (text === null) throw new FilterError(E.NOT_NUMERIC, `"${lit.str}" is not a number.`, lit.at, lit.end);
    const i = parseInteger(text);
    if (i !== null) return Number(i);
    const f = parseFloatLit(text);
    if (f === null) throw unknown(lit);
    return f;
  }

  function arithValue(n) {
    const A = value(n.a), B = value(n.b);
    const op = n.op;
    if (A.lit && B.lit) {
      const r = arith(op, numericLiteral(A.lit), numericLiteral(B.lit));
      const arr = r === null ? EMPTY : [r];
      return { ft: Number.isInteger(r) ? 'int' : 'double', ev: () => arr, konst: true };
    }
    const typed = A.lit ? B : A;
    const okType = (v, node) => {
      if (!v.lit && v.ft && !NUMERIC.has(v.ft) && !(op === '&' && (v.ft === 'bytes' || v.ft === 'ether'))) {
        throw new FilterError(E.NOT_NUMERIC, `${v.name || 'This expression'} (type=${typeDescription(v.ft, v.info)}) cannot participate in arithmetic.`, node.at, node.end);
      }
    };
    okType(A, n.a); okType(B, n.b);
    const evA = A.lit ? literalFor(A.lit, typed.ft, typed.info) : null;
    const evB = B.lit ? literalFor(B.lit, typed.ft, typed.info) : null;
    const ev = (d, env) => {
      const a = A.lit ? null : A.ev(d, env);
      const b = B.lit ? null : B.ev(d, env);
      const rt = typed.ft || (a && a.ft) || (b && b.ft);
      const av = a || evA(rt);
      const bv = b || evB(rt);
      if (av.length === 0 || bv.length === 0) return EMPTY;
      const out = [];
      for (const x of av) for (const y of bv) { const r = arith(op, x, y); if (r !== null) out.push(r); }
      return out;
    };
    return { ft: typed.ft === 'bool' ? 'uint' : typed.ft, info: typed.info, ev, ref: A.ref || B.ref, konst: (A.lit || A.konst) && (B.lit || B.konst) };
  }

  function negValue(n) {
    const a = value(n.a);
    if (a.lit) {
      if (a.lit.k !== 'word') throw new FilterError(E.NOT_NUMERIC, 'Only numbers can be negated.', n.at, n.end);
      return { lit: { ...a.lit, text: '-' + a.lit.text, at: n.at } };
    }
    if (a.ft && !NUMERIC.has(a.ft)) throw new FilterError(E.NOT_NUMERIC, `${a.name || 'This expression'} (type=${typeDescription(a.ft, a.info)}) cannot be negated.`, n.at, n.end);
    const ft = a.ft === 'uint' || a.ft === 'framenum' || a.ft === 'char' || a.ft === 'bool' ? 'int' : a.ft === 'uint64' ? 'int64' : a.ft;
    return { ft, ref: a.ref, ev: (d, env) => a.ev(d, env).map((v) => (typeof v === 'bigint' ? -v : -v)) };
  }

  // ---------------------------------------------------------------- tests

  function existence(v, node) {
    if (v.lit) {
      if (absentUnknown && v.lit.k === 'word' && IDENT.test(v.lit.text)) return () => false;
      if (v.lit.k === 'str') throw new FilterError(E.NOT_A_FIELD, `${v.lit.str} is neither a field nor a protocol name.`, node.at, node.end, { name: v.lit.str });
      if (v.lit.k === 'char') throw new FilterError(E.NOT_A_FIELD, `${String.fromCodePoint(v.lit.code)} is neither a field nor a protocol name.`, node.at, node.end);
      throw unknown(v.lit);
    }
    if (v.konst) throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', node.at, node.end);
    if (v.field && !node.layer && node.k === 'word') {
      const name = v.name;
      const isProto = v.info ? v.info.type === 'protocol' : !name.includes('.');
      return (d) => {
        const ns = d.fields && d.fields.get(name);
        if (ns !== undefined && ns.length > 0) return true;
        return isProto && Array.isArray(d.layers) && d.layers.includes(name);
      };
    }
    if (v.field) return (d) => v.nodes(d).length > 0;
    if (node.k === 'slice') return (d, env) => v.ev(d, env).length > 0;
    // arithmetic / functions: true when any result is non-zero
    return (d, env) => {
      for (const x of v.ev(d, env)) {
        if (x instanceof Uint8Array) { for (const b of x) if (b) return true; continue; }
        if (typeof x === 'string' ? x.length > 0 : x !== 0 && x !== 0n) return true;
      }
      return false;
    };
  }

  function describe(v, node) {
    return v.name || (node && node.k === 'func' ? `${node.name}()` : 'expression');
  }

  function family(ft) {
    if (!ft) return null;
    if (NUMERIC.has(ft) && ft !== 'abs_time') return 'num';
    if (ft === 'abs_time') return 'time';
    if (ft === 'string' || ft === 'oid') return 'str';
    if (ft === 'ipv4') return 'ipv4';
    if (ft === 'guid') return 'guid';
    return 'bytes'; // bytes, ether, ipv6, protocol, none
  }
  function compatible(a, b) {
    const fa = family(a), fb = family(b);
    if (!fa || !fb || fa === fb) return true;
    if ((fa === 'bytes' && fb === 'str') || (fa === 'str' && fb === 'bytes')) return true;
    return false;
  }

  function relation(n) {
    let A = value(n.a), B = value(n.b);
    let op = n.op;
    let an = n.a, bn = n.b;
    const [kind0, defQuant] = OPS[op];
    const quant = n.quant || defQuant;
    if ((A.lit || A.konst || A.ref) && (B.lit || B.konst || B.ref) && !(A.ref && B.ref)) {
      throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', n.at, n.end);
    }
    if (A.lit && B.lit) throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', n.at, n.end);
    if (A.lit) {
      if (op === 'contains' || op === 'matches') throw new FilterError(E.UNEXPECTED_TOKEN, `"${n.a.text || ''}" cannot be used on the left side of ${op}.`, an.at, an.end);
      [A, B] = [B, A]; [an, bn] = [bn, an];
      op = MIRROR[op] || op;
    }
    const kind = OPS[op][0];
    void kind0;
    const ft = A.ft;
    // operator / type compatibility
    if (kind === 'contains' && ft && !CONTAINS_OK.has(ft)) {
      throw new FilterError(E.CANNOT_COMPARE, `${describe(A, an)} (type=${typeDescription(ft, A.info)}) cannot participate in contains comparison.`, an.at, an.end, { name: describe(A, an), op: 'contains' });
    }
    if (kind === 'matches' && ft && !MATCHES_OK.has(ft)) {
      throw new FilterError(E.CANNOT_COMPARE, `${describe(A, an)} (type=${typeDescription(ft, A.info)}) cannot participate in matches comparison.`, an.at, an.end, { name: describe(A, an), op: 'matches' });
    }
    if ((kind === 'gt' || kind === 'ge' || kind === 'lt' || kind === 'le') && (ft === 'protocol' || ft === 'none') && !A.lit) {
      // Wireshark allows ordering on bytes but not on protocol trees without slicing
    }
    let pred;
    let evB;
    if (kind === 'matches') {
      if (!B.lit || (B.lit.k !== 'str' && B.lit.k !== 'word')) {
        throw new FilterError(E.BAD_REGEX, 'The right side of "matches" must be a string.', bn.at, bn.end);
      }
      const re = compileRegex(B.lit.k === 'str' ? B.lit.str : B.lit.text, bn);
      const test = (v) => {
        if (typeof v === 'string') return re.test(v);
        if (v instanceof Uint8Array) return re.test(latin1(v));
        return false;
      };
      return quant === 'all' ? (d, env) => { const a = A.ev(d, env); return a.length > 0 && a.every(test); } : (d, env) => A.ev(d, env).some(test);
    }
    pred = PRED[kind];
    if (B.lit) {
      if (ft) {
        if (kind === 'contains' && B.lit.k === 'str') {
          // contains with a string: compare as text for strings, as bytes otherwise
          const v = STRINGLIKE.has(ft) ? B.lit.str : B.lit.bytes;
          const arr = [v];
          evB = () => arr;
        } else {
          const lf = literalFor(B.lit, ft === 'protocol' || ft === 'none' ? 'bytes' : ft, A.info);
          evB = () => lf();
        }
      } else {
        const lf = literalFor(B.lit, null, null);
        evB = (d, env, a) => lf(kind === 'contains' && a.ft !== 'string' ? 'bytes' : a.ft);
      }
    } else {
      if (A.ft && B.ft && !compatible(A.ft, B.ft)) {
        throw new FilterError(E.INCOMPATIBLE_TYPES, `${describe(A, an)} <${ftName(A.ft, A.info)}> and ${describe(B, bn)} <${ftName(B.ft, B.info)}> are not of compatible types.`, bn.at, bn.end);
      }
      evB = (d, env) => B.ev(d, env);
    }
    const evA = A.ev;
    if (quant === 'all') {
      return (d, env) => {
        const a = evA(d, env);
        if (a.length === 0) return false;
        return allPairs(a, evB(d, env, a), pred);
      };
    }
    return (d, env) => {
      const a = evA(d, env);
      if (a.length === 0) return false;
      return anyPair(a, evB(d, env, a), pred);
    };
  }

  function membership(n) {
    const A = value(n.a);
    if (A.lit) throw new FilterError(E.CONSTANT_EXPRESSION, 'Constant expression is invalid.', n.a.at, n.a.end);
    const items = n.set.map((it) => {
      const lo = value(it.lo);
      const hi = it.hi ? value(it.hi) : null;
      const conv = (v, node) => {
        if (v.lit) return A.ft ? literalFor(v.lit, A.ft === 'protocol' || A.ft === 'none' ? 'bytes' : A.ft, A.info) : literalFor(v.lit, null, null);
        if (A.ft && v.ft && !compatible(A.ft, v.ft)) {
          throw new FilterError(E.INCOMPATIBLE_TYPES, `${describe(A, n.a)} <${ftName(A.ft, A.info)}> and ${describe(v, node)} <${ftName(v.ft, v.info)}> are not of compatible types.`, node.at, node.end);
        }
        return null;
      };
      return { lo, hi, loLit: conv(lo, it.lo), hiLit: hi ? conv(hi, it.hi) : null };
    });
    const inSet = (x, d, env, rt) => {
      for (const it of items) {
        const los = it.loLit ? it.loLit(rt) : it.lo.ev(d, env);
        if (it.hi) {
          const his = it.hiLit ? it.hiLit(rt) : it.hi.ev(d, env);
          for (const l of los) for (const h of his) if (order(x, l) >= 0 && order(x, h) <= 0) return true;
        } else {
          for (const l of los) if (equal(x, l)) return true;
        }
      }
      return false;
    };
    // "in": any value in the set; "not in": all values outside it (Wireshark 4.6, field must exist).
    const quant = n.quant || (n.neg ? 'all' : 'any');
    const want = !n.neg;
    return (d, env) => {
      const a = A.ev(d, env);
      if (a.length === 0) return false;
      const rt = A.ft || a.ft;
      if (quant === 'all') {
        for (const x of a) if (inSet(x, d, env, rt) !== want) return false;
        return true;
      }
      for (const x of a) if (inSet(x, d, env, rt) === want) return true;
      return false;
    };
  }

  function test(n) {
    switch (n.k) {
      case 'or': { const a = test(n.a), b = test(n.b); return (d, env) => a(d, env) || b(d, env); }
      case 'and': { const a = test(n.a), b = test(n.b); return (d, env) => a(d, env) && b(d, env); }
      case 'xor': { const a = test(n.a), b = test(n.b); return (d, env) => a(d, env) !== b(d, env); }
      case 'not': { const a = test(n.a); return (d, env) => !a(d, env); }
      case 'paren': return test(n.a);
      case 'cmp': return relation(n);
      case 'in': return membership(n);
      default: return existence(value(n), n);
    }
  }

  const fn = test(ast);
  return { test: fn, fieldsUsed: [...used], warnings };
}

function arith(op, x, y) {
  if (x instanceof Uint8Array || y instanceof Uint8Array) {
    if (op !== '&') return null;
    const a = x instanceof Uint8Array ? x : Uint8Array.of(Number(x) & 255);
    const b = y instanceof Uint8Array ? y : Uint8Array.of(Number(y) & 255);
    const n = Math.min(a.length, b.length);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] & b[i];
    return out;
  }
  if (typeof x === 'bigint' || typeof y === 'bigint') {
    const a = BigInt(typeof x === 'bigint' ? x : Math.trunc(x)), b = BigInt(typeof y === 'bigint' ? y : Math.trunc(y));
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': return b === 0n ? null : a / b; case '%': return b === 0n ? null : a % b; case '&': return a & b;
    }
    return null;
  }
  const ints = Number.isInteger(x) && Number.isInteger(y);
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': if (y === 0) return null; return ints ? Math.trunc(x / y) : x / y;
    case '%': if (y === 0) return null; return x % y;
    case '&': return Number(BigInt(Math.trunc(x)) & BigInt(Math.trunc(y)));
  }
  return null;
}

/** PCRE-style leading flags "(?i)", "(?is)" → JS flags. */
export function compileRegex(src, node) {
  let flags = '';
  let body = src;
  for (;;) {
    const m = /^\(\?([imsx]+)\)/.exec(body);
    if (!m) break;
    for (const f of m[1]) if (f !== 'x' && !flags.includes(f)) flags += f;
    body = body.slice(m[0].length);
  }
  try {
    return new RegExp(body, flags);
  } catch (e) {
    throw new FilterError(E.BAD_REGEX, `Invalid regular expression: ${e.message.replace(/^Invalid regular expression: /, '')}`, node ? node.at : 0, node ? node.end : 0);
  }
}

function buildLayers(d, protoOf) {
  const layer = new Map();
  const counts = new Map();
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.abbrev) {
        if (n.type === 'protocol') {
          const c = (counts.get(n.abbrev) || 0) + 1;
          counts.set(n.abbrev, c);
          layer.set(n, c);
        } else {
          layer.set(n, counts.get(protoOf(n.abbrev)) || 1);
        }
      }
      if (n.children) walk(n.children);
    }
  };
  walk(d.tree || []);
  return { layer, counts };
}

function layerMatch(l, total, ranges) {
  for (const r of ranges) {
    const s = r.start < 0 ? total + 1 + r.start : r.start;
    let e;
    if (r.end !== undefined) e = r.end < 0 ? total + 1 + r.end : r.end;
    else if (r.len === null) e = Infinity;
    else e = s + r.len - 1;
    if (l >= s && l <= e) return true;
  }
  return false;
}

export { OP_TEXT, INTEGER };
