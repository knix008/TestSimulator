'use strict';

// MISRA C:2012/2023 essential type model (Section 8.10 and Appendix D).
//
// essentialType(expr, opts) -> {
//   category: 'boolean'|'character'|'signed'|'unsigned'|'enum'|'floating'|'other',
//   type,        // the essential type (a types.js Type), e.g. unsigned char for a uint8_t operand
//   name,        // printable name of that type
//   size,        // bytes on the target (null when unknown)
//   enumName,    // for 'enum'
//   complex,     // essentially complex floating (MISRA C:2023)
//   ice,         // the expression is an integer constant expression
//   value,       // BigInt value when ice
// }
// Requires an AST analysed by symbols.js (expr.ctype / Identifier.symbol).

const Ty = require('./types');
const { T } = Ty;

const SIGNED_LADDER = [T.schar, T.short, T.int, T.long, T.llong];
const UNSIGNED_LADDER = [T.uchar, T.ushort, T.uint, T.ulong, T.ullong];

const DEFAULT_BOOL_TYPEDEFS = ['bool', 'bool_t', 'boolean_t', 'BOOL', 'Boolean', 'boolean'];

function stlr(v, target) {
  for (const t of SIGNED_LADDER) if (Ty.fitsIn(v, t, target)) return t;
  return T.llong;
}
function utlr(v, target) {
  for (const t of UNSIGNED_LADDER) if (Ty.fitsIn(v, t, target)) return t;
  return T.ullong;
}

function result(category, type, target, extra) {
  const r = { category, type, name: type ? Ty.typeToString(type) : '?', size: type ? Ty.sizeOf(type, target) : null, ice: false, value: null };
  if (extra) Object.assign(r, extra);
  return r;
}

// Essential type category of a declared type.
function essentialTypeOfType(t, opts = {}) {
  const target = Ty.resolveTarget(opts.target);
  const boolNames = new Set(opts.booleanTypedefs || DEFAULT_BOOL_TYPEDEFS);
  if (!t) return result('other', T.unknown, target);
  // a typedef designated as Boolean
  let x = t;
  let guard = 0;
  while (x && x.kind === 'typedef' && guard++ < 50) {
    if (boolNames.has(x.name)) {
      const c = Ty.canonical(x);
      if (c.kind === 'int' || c.kind === 'enum') return result('boolean', x, target);
    }
    x = x.target;
  }
  const c = Ty.unqualified(Ty.nonRef(t));
  const td = t.kind === 'typedef' ? { typedefName: t.name } : null;
  const res = (cat, ty, extra) => result(cat, ty, target, extra || td ? { ...(extra || {}), ...(td || {}) } : null);
  switch (c.kind) {
    case 'int':
      if (c.name === 'bool') return res('boolean', c);
      if (c.name === 'char') return res('character', c);
      return res(Ty.isSigned(c, target) ? 'signed' : 'unsigned', c);
    case 'enum':
      return res('enum', c, { enumName: c.name || c.typedefName || '<anonymous>' });
    case 'float':
      return res('floating', c, c.complex ? { complex: true } : null);
    default:
      return res('other', c);
  }
}

function isIce(e, target) {
  const v = Ty.constValue(e, { target });
  return v && !v.float && !v.invalid ? v : null;
}

function larger(a, b, target) {
  const sa = a.size == null ? 0 : a.size, sb = b.size == null ? 0 : b.size;
  if (sa !== sb) return sa > sb ? a : b;
  return Ty.intRank(a.type) >= Ty.intRank(b.type) ? a : b;
}

function essentialType(e, opts = {}) {
  if (!e) return null;
  const key = opts.booleanTypedefs ? null : '_essential_' + Ty.resolveTarget(opts.target).name;
  if (key && e[key]) return e[key];
  if (key && (e.type === 'BinaryExpr' || e.type === 'ParenExpr')) {
    // evaluate long left-associative chains bottom-up to keep recursion shallow
    const spine = [];
    let x = e.type === 'BinaryExpr' ? e.left : e.expr;
    while (x && (x.type === 'BinaryExpr' || x.type === 'ParenExpr') && !x[key] && spine.length < 1e6) { spine.push(x); x = x.type === 'BinaryExpr' ? x.left : x.expr; }
    for (let i = spine.length - 1; i >= 0; i--) essentialType(spine[i], opts);
  }
  let r;
  try {
    r = compute(e, opts);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    r = result('other', e.ctype || T.unknown, Ty.resolveTarget(opts.target));
    r.tooDeep = true;
  }
  if (key) Object.defineProperty(e, key, { value: r, enumerable: false, configurable: true, writable: true });
  return r;
}

function withIce(r, v) {
  if (v) { r.ice = true; r.value = v.value; }
  return r;
}

function compute(e, opts) {
  const target = Ty.resolveTarget(opts.target);
  const fromType = (t) => essentialTypeOfType(t, opts);
  const std = () => withIce(fromType(e.ctype), isIce(e, target));
  switch (e.type) {
    case 'ParenExpr': return essentialType(e.expr, opts);
    case 'CastExpr': {
      const r = fromType(e.typeName ? e.typeName.ctype : e.ctype);
      return withIce(r, isIce(e, target));
    }
    case 'IntegerLiteral': {
      // `true` / `false` from <stdbool.h> are essentially Boolean
      if (e.loc && (e.loc.macro === 'true' || e.loc.macro === 'false') && (e.value === 0n || e.value === 1n)) {
        return withIce(result('boolean', T.bool, target), { value: e.value });
      }
      const t = e.ctype || T.int;
      if (Ty.isUnsigned(t, target)) return withIce(result('unsigned', utlr(e.value, target), target), { value: e.value });
      return withIce(result('signed', stlr(e.value, target), target), { value: e.value });
    }
    case 'CharLiteral':
      if (!e.prefix) return withIce(result('character', T.char, target), isIce(e, target));
      return std();
    case 'BoolLiteral': return withIce(result('boolean', T.bool, target), { value: e.value ? 1n : 0n });
    case 'FloatingLiteral': return result('floating', e.ctype || T.double, target);
    case 'StringLiteral': return result('other', e.ctype || T.unknown, target);
    case 'Identifier': {
      const s = e.symbol;
      if (s && s.kind === 'enumerator') {
        const et = s.enumType;
        if (et && !et.name && !et.typedefName) {
          // anonymous enum: the constant is essentially signed (STLR)
          return withIce(result('signed', stlr(s.value, target), target), { value: s.value });
        }
        return withIce(result('enum', et || e.ctype, target, { enumName: et ? et.name || et.typedefName : null }), { value: s.value });
      }
      if (e.bitField != null) return bitFieldType(e, s ? s.type : e.ctype, opts, target);
      return fromType(s ? s.type : e.ctype);
    }
    case 'MemberExpr':
      if (e.bitField != null) return bitFieldType(e, e.memberSymbol ? e.memberSymbol.type : e.ctype, opts, target);
      return fromType(e.memberSymbol ? e.memberSymbol.type : e.ctype);
    case 'UnaryExpr': {
      switch (e.op) {
        case '!': return withIce(result('boolean', T.bool, target), isIce(e, target));
        case '++': case '--': return essentialType(e.arg, opts);
        case '+': case '-': {
          const a = essentialType(e.arg, opts);
          if (a.category === 'signed' || (a.category === 'unsigned' && e.op === '+')) {
            const v = isIce(e, target);
            if (v) return withIce(result(a.category, a.category === 'signed' ? stlr(v.value, target) : utlr(v.value, target), target), v);
            return a;
          }
          if (a.category === 'floating') return a;
          return std();
        }
        case '~': {
          const a = essentialType(e.arg, opts);
          if (a.category === 'unsigned') {
            const v = isIce(e.arg, target);
            if (v) {
              const val = Ty.wrapTo(~v.value, a.type, target);
              return withIce(result('unsigned', utlr(val, target), target), { value: val });
            }
            return a;
          }
          return std();
        }
        default: return std();
      }
    }
    case 'SizeofExpr': case 'AlignofExpr': case 'OffsetofExpr': case 'SizeofPackExpr': {
      const v = isIce(e, target);
      if (v) return withIce(result('unsigned', utlr(v.value, target), target), v);
      return fromType(e.ctype);
    }
    case 'BinaryExpr': {
      const op = e.op;
      if (op === '&&' || op === '||' || op === '<' || op === '>' || op === '<=' || op === '>=' || op === '==' || op === '!=') {
        return withIce(result('boolean', T.bool, target), isIce(e, target));
      }
      if (op === ',') return essentialType(e.right, opts);
      const L = essentialType(e.left, opts);
      const R = essentialType(e.right, opts);
      const v = isIce(e, target);
      if (op === '<<' || op === '>>') {
        if (L.category === 'unsigned') {
          if (v && L.ice && R.ice) return withIce(result('unsigned', utlr(v.value, target), target), v);
          return L;
        }
        return std();
      }
      if (op === '&' || op === '|' || op === '^') {
        if (L.category === 'unsigned' && R.category === 'unsigned') {
          if (v) return withIce(result('unsigned', utlr(v.value, target), target), v);
          return larger(L, R, target);
        }
        return std();
      }
      if (op === '+' || op === '-') {
        const num = (c) => c === 'signed' || c === 'unsigned';
        if (op === '+' && ((L.category === 'character' && num(R.category)) || (R.category === 'character' && num(L.category)))) {
          return withIce(result('character', T.char, target), v);
        }
        if (op === '-' && L.category === 'character' && num(R.category)) return withIce(result('character', T.char, target), v);
      }
      if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
        if ((L.category === 'signed' && R.category === 'signed') || (L.category === 'unsigned' && R.category === 'unsigned')) {
          if (v && !v.overflow) {
            if (L.category === 'signed') return withIce(result('signed', stlr(v.value, target), target), v);
            return withIce(result('unsigned', utlr(v.value, target), target), v);
          }
          return larger(L, R, target);
        }
        if (L.category === 'floating' && R.category === 'floating') return larger(L, R, target);
        return std();
      }
      return std();
    }
    case 'AssignExpr': return essentialType(e.left, opts);
    case 'ConditionalExpr': {
      const A = essentialType(e.consequent || e.test, opts);
      const B = essentialType(e.alternate, opts);
      if (A.category === B.category && A.name === B.name && A.enumName === B.enumName) return withIce({ ...A }, isIce(e, target));
      if ((A.category === 'signed' && B.category === 'signed') || (A.category === 'unsigned' && B.category === 'unsigned')) {
        return withIce({ ...larger(A, B, target) }, isIce(e, target));
      }
      if (A.category === B.category && A.category !== 'enum') return withIce({ ...larger(A, B, target) }, isIce(e, target));
      return std();
    }
    case 'CallExpr': {
      // return type as declared (keeps a Boolean typedef)
      const cs = e.calleeSymbol;
      if (cs) {
        const ft = Ty.canonical(cs.type);
        if (ft.kind === 'function') return fromType(ft.ret);
      }
      return fromType(e.ctype);
    }
    default: return std();
  }
}

function bitFieldType(e, declared, opts, target) {
  const base = essentialTypeOfType(declared, opts);
  const w = e.bitField;
  if (base.category === 'boolean' || base.category === 'enum') return base;
  if (base.category === 'signed') {
    const max = w > 0 ? (1n << BigInt(w - 1)) - 1n : 0n;
    return result('signed', stlr(max, target), target, { bitField: w });
  }
  if (base.category === 'unsigned') {
    const max = (1n << BigInt(w)) - 1n;
    return result('unsigned', utlr(max, target), target, { bitField: w });
  }
  return base;
}

module.exports = { essentialType, essentialTypeOfType, stlr, utlr, DEFAULT_BOOL_TYPEDEFS };
