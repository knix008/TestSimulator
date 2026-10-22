'use strict';

// C/C++ type representation, target sizes, integer promotions, usual
// arithmetic conversions, constant folding of integer constant expressions
// and C++ value categories. See AST.md "Types".

// ---------------------------------------------------------------- targets

const TARGETS = {
  lp64: { name: 'lp64', char: 1, short: 2, int: 4, long: 8, longlong: 8, pointer: 8, float: 4, double: 8, longdouble: 16, wchar: 4, wcharSigned: true, charSigned: true, bool: 1, int128: 16, maxAlign: 16 },
  ilp32: { name: 'ilp32', char: 1, short: 2, int: 4, long: 4, longlong: 8, pointer: 4, float: 4, double: 8, longdouble: 12, wchar: 4, wcharSigned: true, charSigned: true, bool: 1, int128: 16, maxAlign: 8 },
  llp64: { name: 'llp64', char: 1, short: 2, int: 4, long: 4, longlong: 8, pointer: 8, float: 4, double: 8, longdouble: 8, wchar: 2, wcharSigned: false, charSigned: true, bool: 1, int128: 16, maxAlign: 16 },
};

function resolveTarget(t) {
  if (!t) return TARGETS.lp64;
  if (typeof t === 'string') return TARGETS[t.toLowerCase()] || TARGETS.lp64;
  if (t.__resolved) return t;
  const base = TARGETS[(t.name || 'lp64').toLowerCase()] || TARGETS.lp64;
  const r = { ...base, ...t };
  Object.defineProperty(r, '__resolved', { value: true });
  return r;
}

// ---------------------------------------------------------------- integers

// canonical integer type names -> [rank, signed, sizeKey]
const INT_INFO = {
  bool: [0, false, 'bool'],
  char: [1, null, 'char'],
  'signed char': [1, true, 'char'],
  'unsigned char': [1, false, 'char'],
  short: [2, true, 'short'],
  'unsigned short': [2, false, 'short'],
  int: [3, true, 'int'],
  'unsigned int': [3, false, 'int'],
  long: [4, true, 'long'],
  'unsigned long': [4, false, 'long'],
  'long long': [5, true, 'longlong'],
  'unsigned long long': [5, false, 'longlong'],
  __int128: [6, true, 'int128'],
  'unsigned __int128': [6, false, 'int128'],
  wchar_t: [3, null, 'wchar'],
  char8_t: [1, false, 'char'],
  char16_t: [2, false, 'short'],
  char32_t: [3, false, 'int'],
};
const FLOAT_INFO = { float: 1, double: 2, 'long double': 3, _Float16: 0, _Decimal32: 1, _Decimal64: 2, _Decimal128: 3 };

const CACHE = new Map();
function prim(kind, name) {
  const key = kind + ':' + name;
  let t = CACHE.get(key);
  if (!t) { t = Object.freeze({ kind, name }); CACHE.set(key, t); }
  return t;
}

const T = {
  void: prim('void', 'void'),
  bool: prim('int', 'bool'),
  char: prim('int', 'char'),
  schar: prim('int', 'signed char'),
  uchar: prim('int', 'unsigned char'),
  short: prim('int', 'short'),
  ushort: prim('int', 'unsigned short'),
  int: prim('int', 'int'),
  uint: prim('int', 'unsigned int'),
  long: prim('int', 'long'),
  ulong: prim('int', 'unsigned long'),
  llong: prim('int', 'long long'),
  ullong: prim('int', 'unsigned long long'),
  wchar: prim('int', 'wchar_t'),
  char8: prim('int', 'char8_t'),
  char16: prim('int', 'char16_t'),
  char32: prim('int', 'char32_t'),
  float: prim('float', 'float'),
  double: prim('float', 'double'),
  ldouble: prim('float', 'long double'),
  nullptr: prim('nullptr', 'std::nullptr_t'),
  unknown: Object.freeze({ kind: 'unknown', name: '?' }),
};

function intType(name) { return prim('int', name); }
function floatType(name) { return prim('float', name); }

// From the BuiltinType names list of a DeclSpec, e.g. ['unsigned','long','long','int'].
function builtinFromNames(names, bits) {
  let signed = null, shorts = 0, longs = 0, base = null, complex = false;
  for (const n of names) {
    switch (n) {
      case 'signed': signed = true; break;
      case 'unsigned': signed = false; break;
      case 'short': shorts++; break;
      case 'long': longs++; break;
      case '_Complex': complex = true; break;
      case '_Imaginary': complex = true; break;
      default: base = n;
    }
  }
  if (base === 'void') return T.void;
  if (base === '_Bool' || base === 'bool') return T.bool;
  if (base === '_BitInt') return { kind: 'int', name: (signed === false ? 'unsigned ' : '') + `_BitInt(${bits || 0})`, bits: bits || 0, bitInt: true, signedBitInt: signed !== false };
  if (base === 'float') return complex ? { kind: 'float', name: 'float', complex: true } : T.float;
  if (base === 'double') {
    const t = longs ? T.ldouble : T.double;
    return complex ? { kind: 'float', name: t.name, complex: true } : t;
  }
  if (base === '_Decimal32' || base === '_Decimal64' || base === '_Decimal128') return floatType(base);
  if (base === '__builtin_va_list') return { kind: 'pointer', to: T.char, builtinVaList: true };
  if (base === 'char') return signed === null ? T.char : signed ? T.schar : T.uchar;
  if (base === 'wchar_t') return T.wchar;
  if (base === 'char8_t') return T.char8;
  if (base === 'char16_t') return T.char16;
  if (base === 'char32_t') return T.char32;
  if (base === '__int128') return intType(signed === false ? 'unsigned __int128' : '__int128');
  let name;
  if (shorts) name = 'short';
  else if (longs >= 2) name = 'long long';
  else if (longs === 1) name = 'long';
  else name = 'int';
  if (complex && !base) return { kind: 'float', name: 'double', complex: true };
  return intType(signed === false ? 'unsigned ' + name : name);
}

// ---------------------------------------------------------------- constructors

function withQuals(t, q) {
  if (!q) return t;
  const add = {};
  let any = false;
  for (const k of ['const', 'volatile', 'restrict', 'atomic']) if (q[k] && !t[k]) { add[k] = true; any = true; }
  if (!any) return t;
  return { ...t, ...add };
}
function qualsOf(t) {
  return { const: !!t.const, volatile: !!t.volatile, restrict: !!t.restrict, atomic: !!t.atomic };
}
function unqualified(t) {
  if (!t || !(t.const || t.volatile || t.restrict || t.atomic)) return t;
  const c = { ...t };
  delete c.const; delete c.volatile; delete c.restrict; delete c.atomic;
  if (c.kind === 'int' || c.kind === 'float' || c.kind === 'void') {
    const p = CACHE.get(c.kind + ':' + c.name);
    if (p && Object.keys(c).length === 2) return p;
  }
  return c;
}
function pointerTo(t, q) { return withQuals({ kind: 'pointer', to: t }, q); }
function referenceTo(t, rvalue) { return { kind: 'reference', to: t, rvalue: !!rvalue }; }
function arrayOf(t, size, extra) { return { kind: 'array', of: t, size: size == null ? null : size, ...(extra || {}) }; }
function functionType(ret, params, variadic, extra) { return { kind: 'function', ret, params: params || [], variadic: !!variadic, prototype: true, ...(extra || {}) }; }
function typedefType(name, target, decl) { return { kind: 'typedef', name, target, decl: decl || null }; }
function unknownType(name) { return { kind: 'unknown', name: name || '?' }; }
// Type of an identifier that resolved to nothing (std::cout without <iostream>,
// a name from a missing header). isUnknown() is true for it.
function unresolvedType(name) { return { kind: 'unknown', name: name || '?', unresolved: true }; }

// ---------------------------------------------------------------- queries

// Strip typedefs, keeping qualifiers accumulated along the chain.
function canonical(t) {
  if (!t) return T.unknown;
  let q = null;
  let guard = 0;
  while (t.kind === 'typedef' && guard++ < 100) {
    if (t.const || t.volatile || t.restrict || t.atomic) q = mergeQ(q, t);
    t = t.target || T.unknown;
  }
  return q ? withQuals(t, q) : t;
}
function mergeQ(q, t) {
  q = q || {};
  for (const k of ['const', 'volatile', 'restrict', 'atomic']) if (t[k]) q[k] = true;
  return q;
}
// Strip references too (C++).
function nonRef(t) {
  t = canonical(t);
  return t.kind === 'reference' ? canonical(t.to) : t;
}

function isVoid(t) { return nonRef(t).kind === 'void'; }
function isBool(t) { const c = nonRef(t); return c.kind === 'int' && c.name === 'bool'; }
function isEnum(t) { return nonRef(t).kind === 'enum'; }
function isInteger(t) { const c = nonRef(t); return c.kind === 'int' || c.kind === 'enum'; }
function isFloating(t) { return nonRef(t).kind === 'float'; }
function isArithmetic(t) { const k = nonRef(t).kind; return k === 'int' || k === 'enum' || k === 'float'; }
function isPointer(t) { return nonRef(t).kind === 'pointer'; }
function isArray(t) { return nonRef(t).kind === 'array'; }
function isFunction(t) { return nonRef(t).kind === 'function'; }
function isRecord(t) { return nonRef(t).kind === 'record'; }
function isScalar(t) { const k = nonRef(t).kind; return k === 'int' || k === 'enum' || k === 'float' || k === 'pointer' || k === 'nullptr' || k === 'memberPointer'; }
function isUnknown(t) { const k = nonRef(t).kind; return k === 'unknown' || k === 'dependent' || k === 'auto'; }
function isCharType(t) { const c = nonRef(t); return c.kind === 'int' && (c.name === 'char' || c.name === 'signed char' || c.name === 'unsigned char'); }
function isPlainChar(t) { const c = nonRef(t); return c.kind === 'int' && c.name === 'char'; }
function isComplete(t) {
  const c = nonRef(t);
  if (c.kind === 'void' || c.kind === 'function') return false;
  if (c.kind === 'record') return !!c.complete;
  if (c.kind === 'array') return c.size != null && isComplete(c.of);
  if (c.kind === 'enum') return true;
  return c.kind !== 'unknown';
}

function intRank(t) {
  const c = nonRef(t);
  if (c.kind === 'enum') return intRank(c.underlying || T.int);
  if (c.kind !== 'int') return -1;
  if (c.bitInt) return 3 + c.bits / 1000;
  const info = INT_INFO[c.name];
  return info ? info[0] : 3;
}

function isSigned(t, target) {
  const c = nonRef(t);
  if (c.kind === 'float') return true;
  if (c.kind === 'enum') return isSigned(c.underlying || T.int, target);
  if (c.kind !== 'int') return false;
  if (c.bitInt) return c.signedBitInt;
  const info = INT_INFO[c.name];
  if (!info) return true;
  if (info[1] !== null) return info[1];
  const tg = resolveTarget(target);
  return c.name === 'char' ? tg.charSigned !== false : tg.wcharSigned !== false;
}
function isUnsigned(t, target) { return isInteger(t) && !isSigned(t, target); }

function intBits(t, target) {
  const c = nonRef(t);
  if (c.kind === 'enum') return intBits(c.underlying || T.int, target);
  if (c.kind !== 'int') return 0;
  if (c.bitInt) return c.bits;
  if (c.name === 'bool') return 1;
  const tg = resolveTarget(target);
  const info = INT_INFO[c.name];
  return (tg[info ? info[2] : 'int'] || 4) * 8;
}

// { min, max } as BigInt
function intRange(t, target) {
  const bits = intBits(t, target);
  if (!bits) return null;
  if (isBool(t)) return { min: 0n, max: 1n, bits: 1 };
  if (isSigned(t, target)) return { min: -(1n << BigInt(bits - 1)), max: (1n << BigInt(bits - 1)) - 1n, bits };
  return { min: 0n, max: (1n << BigInt(bits)) - 1n, bits };
}

function fitsIn(v, t, target) {
  const r = intRange(t, target);
  return r ? v >= r.min && v <= r.max : false;
}

// Wrap v to the representation of integer type t (two's complement).
function wrapTo(v, t, target) {
  const bits = intBits(t, target);
  if (!bits) return v;
  if (isBool(t)) return v !== 0n ? 1n : 0n;
  return isSigned(t, target) ? BigInt.asIntN(bits, v) : BigInt.asUintN(bits, v);
}

function sizeOf(t, target) {
  const tg = resolveTarget(target);
  const c = canonical(t);
  switch (c.kind) {
    case 'void': return 1; // GNU arithmetic on void*
    case 'int': {
      if (c.bitInt) return Math.max(1, Math.ceil(c.bits / 8));
      const info = INT_INFO[c.name];
      return tg[info ? info[2] : 'int'];
    }
    case 'float': {
      const n = c.name === 'float' ? tg.float : c.name === 'double' ? tg.double : c.name === 'long double' ? tg.longdouble : c.name === '_Float16' ? 2 : c.name === '_Decimal32' ? 4 : c.name === '_Decimal64' ? 8 : 16;
      return c.complex ? n * 2 : n;
    }
    case 'pointer': case 'nullptr': case 'function': return c.kind === 'function' ? null : tg.pointer;
    case 'memberPointer': return tg.pointer * (isFunction(c.to) ? 2 : 1);
    case 'reference': return sizeOf(c.to, tg);
    case 'enum': return sizeOf(c.underlying || T.int, tg);
    case 'array': {
      if (c.size == null) return null;
      const e = sizeOf(c.of, tg);
      return e == null ? null : e * c.size;
    }
    case 'record': {
      const l = layout(c, tg);
      return l ? l.size : null;
    }
    default: return null;
  }
}

function alignOf(t, target) {
  const tg = resolveTarget(target);
  const c = canonical(t);
  if (c.kind === 'array') return alignOf(c.of, tg);
  if (c.kind === 'record') { const l = layout(c, tg); return l ? l.align : null; }
  if (c.kind === 'float' && c.name === 'long double') return tg.name === 'ilp32' ? 4 : tg.longdouble;
  if (c.kind === 'int' && c.name.endsWith('long long') && tg.name === 'ilp32') return 4;
  if (c.kind === 'float' && c.name === 'double' && tg.name === 'ilp32') return 4;
  const s = sizeOf(c, tg);
  return s == null ? null : Math.min(s, tg.maxAlign || 16);
}

// Record layout (no packing pragmas). Returns { size, align, fields: [{name, offset, size, bitOffset, bitWidth}] }
function layout(rec, target) {
  const tg = resolveTarget(target);
  if (!rec.complete || !rec.fields) return null;
  const key = tg.name + (tg.long || '') + (tg.pointer || '');
  if (rec._layout && rec._layout.key === key) return rec._layout.value;
  let offset = 0, align = 1, size = 0;
  let bitUnit = null; // { start, size, used }
  const out = [];
  const isUnion = rec.tag === 'union';
  const unknown = () => { Object.defineProperty(rec, '_layout', { value: { key, value: null }, writable: true, configurable: true, enumerable: false }); return null; };
  // C++ base subobjects and vtable pointers are not modelled: size unknown
  if (rec.bases && rec.bases.length) return unknown();
  if (rec.scope && rec.scope.names) for (const s of rec.scope.names.values()) if (s && s.isVirtual) return unknown();
  for (let i = 0; i < rec.fields.length; i++) {
    const f = rec.fields[i];
    const fs = sizeOf(f.type, tg);
    const fa = alignOf(f.type, tg) || 1;
    if (fs == null) {
      // flexible array member (last, array of unknown bound); anything else
      // (unknown type from a missing header, incomplete type, VLA) makes the size unknown
      const fc = canonical(f.type);
      if (!(i === rec.fields.length - 1 && fc.kind === 'array' && fc.size == null && !isUnion && sizeOf(fc.of, tg) != null)) return unknown();
      out.push({ name: f.name, offset: alignUp(offset, fa), size: 0 });
      continue;
    }
    if (f.bitWidth != null) {
      const w = f.bitWidth;
      if (w === 0) { bitUnit = null; offset = alignUp(offset, fa); continue; }
      if (isUnion) {
        out.push({ name: f.name, offset: 0, size: fs, bitOffset: 0, bitWidth: w });
        size = Math.max(size, fs);
        align = Math.max(align, fa);
        continue;
      }
      if (!bitUnit || bitUnit.size !== fs || bitUnit.used + w > fs * 8) {
        const start = alignUp(offset, fa);
        bitUnit = { start, size: fs, used: 0 };
        offset = start + fs;
      }
      out.push({ name: f.name, offset: bitUnit.start, size: fs, bitOffset: bitUnit.used, bitWidth: w });
      bitUnit.used += w;
      align = Math.max(align, fa);
      continue;
    }
    bitUnit = null;
    if (isUnion) {
      out.push({ name: f.name, offset: 0, size: fs });
      size = Math.max(size, fs);
    } else {
      offset = alignUp(offset, fa);
      out.push({ name: f.name, offset, size: fs });
      offset += fs;
    }
    align = Math.max(align, fa);
  }
  if (!isUnion) size = offset;
  if (size === 0 && rec.cpp) size = 1;
  size = alignUp(size, align);
  const value = { size, align, fields: out };
  Object.defineProperty(rec, '_layout', { value: { key, value }, writable: true, configurable: true, enumerable: false });
  return value;
}
function alignUp(n, a) { return a > 1 ? Math.ceil(n / a) * a : n; }

// ---------------------------------------------------------------- conversions

function integerPromote(t, target, bitWidth) {
  const c = unqualified(nonRef(t));
  if (c.kind === 'enum') {
    if (c.fixed && c.underlying) return integerPromote(c.underlying, target);
    return integerPromote(c.underlying || T.int, target);
  }
  if (c.kind !== 'int') return c;
  if (c.bitInt) return c;
  if (bitWidth != null) {
    const ib = intBits(T.int, target);
    if (bitWidth < ib || (bitWidth === ib && isSigned(c, target))) return T.int;
    if (bitWidth === ib) return T.uint;
  }
  if (intRank(c) < 3 || c.name === 'wchar_t' || c.name === 'char32_t') {
    const r = intRange(c, target);
    if (r && fitsIn(r.min, T.int, target) && fitsIn(r.max, T.int, target)) return T.int;
    if (intRank(c) < 3) return T.uint;
    return isSigned(c, target) ? (intBits(c, target) > 32 ? c : T.int) : T.uint;
  }
  return c;
}

const UNSIGNED_OF = { int: 'unsigned int', long: 'unsigned long', 'long long': 'unsigned long long', __int128: 'unsigned __int128' };

function usualArithmetic(a, b, target) {
  const A = unqualified(nonRef(a)), B = unqualified(nonRef(b));
  if (A.kind === 'float' || B.kind === 'float') {
    if (A.kind !== 'float') return B;
    if (B.kind !== 'float') return A;
    const ra = FLOAT_INFO[A.name] || 2, rb = FLOAT_INFO[B.name] || 2;
    const r = ra >= rb ? A : B;
    if ((A.complex || B.complex) && !r.complex) return { ...r, complex: true };
    return r;
  }
  if (!isInteger(A) || !isInteger(B)) return isInteger(A) ? B : A;
  const pa = integerPromote(A, target), pb = integerPromote(B, target);
  if (pa.name === pb.name) return pa;
  const sa = isSigned(pa, target), sb = isSigned(pb, target);
  const ra = intRank(pa), rb = intRank(pb);
  if (sa === sb) return ra >= rb ? pa : pb;
  const u = sa ? pb : pa, s = sa ? pa : pb;
  const ru = intRank(u), rs = intRank(s);
  if (ru >= rs) return u;
  if (intBits(s, target) > intBits(u, target)) return s;
  return intType(UNSIGNED_OF[s.name] || 'unsigned ' + s.name);
}

function decay(t) {
  const c = canonical(t);
  if (c.kind === 'array') return pointerTo(c.of);
  if (c.kind === 'function') return pointerTo(c);
  if (c.kind === 'reference') return decay(c.to);
  return t;
}

function pointee(t) {
  const c = canonical(decay(t));
  return c.kind === 'pointer' ? c.to : null;
}

// ---------------------------------------------------------------- printing / comparing

function typeToString(t, name) {
  return print(t, name || '').trim();
}

function quals(t) {
  const q = [];
  if (t.const) q.push('const');
  if (t.volatile) q.push('volatile');
  if (t.restrict) q.push('restrict');
  if (t.atomic) q.push('_Atomic');
  return q.join(' ');
}

function print(t, inner) {
  if (!t) return '? ' + inner;
  const q = quals(t);
  const pre = q ? q + ' ' : '';
  switch (t.kind) {
    case 'void': case 'int': case 'float': case 'nullptr':
      return `${pre}${t.complex ? '_Complex ' : ''}${t.name}${inner ? ' ' + inner : ''}`;
    case 'typedef': case 'unknown': case 'dependent':
      return `${pre}${t.name}${inner ? ' ' + inner : ''}`;
    case 'auto': return `${pre}auto${inner ? ' ' + inner : ''}`;
    case 'record': return `${pre}${t.tag} ${t.name || '<anonymous>'}${inner ? ' ' + inner : ''}`;
    case 'enum': return `${pre}enum ${t.name || '<anonymous>'}${inner ? ' ' + inner : ''}`;
    case 'closure': return `<lambda>${inner ? ' ' + inner : ''}`;
    case 'pointer': {
      const s = '*' + (q ? q + ' ' : '') + inner;
      const to = canonicalShallow(t.to);
      return print(t.to, to.kind === 'array' || to.kind === 'function' ? `(${s.trim()})` : s);
    }
    case 'reference': {
      const s = (t.rvalue ? '&&' : '&') + inner;
      const to = canonicalShallow(t.to);
      return print(t.to, to.kind === 'array' || to.kind === 'function' ? `(${s})` : s);
    }
    case 'memberPointer': return print(t.to, `${t.cls}::*${inner}`);
    case 'array': return print(t.of, `${inner}[${t.size == null ? '' : t.size}]`);
    case 'function': {
      const ps = t.params.map((p) => typeToString(p));
      if (t.variadic) ps.push('...');
      if (!ps.length && t.prototype) ps.push('void');
      return print(t.ret, `${inner}(${ps.join(', ')})`);
    }
    default: return `${t.kind}${inner ? ' ' + inner : ''}`;
  }
}
function canonicalShallow(t) { return t && t.kind === 'typedef' ? canonical(t) : t || T.unknown; }

// Compatible-type test (C 6.2.7 approximation; typedefs transparent).
function sameType(a, b, opts = {}) {
  const A = canonical(a), B = canonical(b);
  if (A === B) return true;
  if (!opts.ignoreQuals && (!!A.const !== !!B.const || !!A.volatile !== !!B.volatile)) return false;
  if (A.kind !== B.kind) return false;
  switch (A.kind) {
    case 'void': case 'int': case 'float': return A.name === B.name && !!A.complex === !!B.complex;
    case 'pointer': return sameType(A.to, B.to);
    case 'reference': return A.rvalue === B.rvalue && sameType(A.to, B.to);
    case 'array': return (A.size == null || B.size == null || A.size === B.size) && sameType(A.of, B.of);
    case 'function': {
      if (!sameType(A.ret, B.ret)) return false;
      if (!A.prototype || !B.prototype) return true;
      if (A.params.length !== B.params.length || A.variadic !== B.variadic) return false;
      for (let i = 0; i < A.params.length; i++) if (!sameType(A.params[i], B.params[i], { ignoreQuals: true })) return false;
      return true;
    }
    case 'record': return A === B || (A.name && A.name === B.name && A.tag === B.tag);
    case 'enum': return A === B || (A.name && A.name === B.name);
    case 'unknown': case 'dependent': return A.name === B.name;
    default: return false;
  }
}

// ---------------------------------------------------------------- constant folding

// Evaluate an integer constant expression over an analysed AST (symbols.js
// annotates Identifier.symbol, TypeName.ctype and expr.ctype).
// Returns { value: BigInt, type } or { value: number, type, float: true } or null.
function constValue(e, opts = {}) {
  const target = resolveTarget(opts.target);
  return evalC(e, target, opts, 0);
}

function evalC(e, tg, opts, depth) {
  if (!e || depth > 200) return null;
  switch (e.type) {
    case 'IntegerLiteral': return e.invalid ? null : { value: e.value, type: e.ctype || T.int };
    case 'CharLiteral': return { value: BigInt(signedChar(e, tg)), type: e.ctype || T.int };
    case 'BoolLiteral': return { value: e.value ? 1n : 0n, type: T.bool };
    case 'NullptrLiteral': return { value: 0n, type: T.nullptr };
    case 'FloatingLiteral': return opts.allowFloat ? { value: e.value, type: e.ctype || T.double, float: true } : null;
    case 'ParenExpr': return evalC(e.expr, tg, opts, depth + 1);
    case 'Identifier': {
      const s = e.symbol;
      if (s && s.kind === 'enumerator' && s.value != null) return { value: s.value, type: e.ctype || T.int };
      if (s && opts.allowConstVars && s.kind === 'variable' && s.constInit) {
        const v = evalC(s.constInit, tg, opts, depth + 1);
        return v ? { value: v.float ? v.value : wrapTo(v.value, s.type, tg), type: s.type, float: v.float } : null;
      }
      return null;
    }
    case 'SizeofExpr': {
      const t = e.typeName ? e.typeName.ctype : e.arg && e.arg.ctype;
      if (!t) return null;
      const n = sizeOf(t, tg);
      return n == null ? null : { value: BigInt(n), type: e.ctype || sizeTType(tg) };
    }
    case 'AlignofExpr': {
      const t = e.typeName ? e.typeName.ctype : e.arg && e.arg.ctype;
      const n = t ? alignOf(t, tg) : null;
      return n == null ? null : { value: BigInt(n), type: e.ctype || sizeTType(tg) };
    }
    case 'OffsetofExpr': return e.offset != null ? { value: BigInt(e.offset), type: sizeTType(tg) } : null;
    case 'CastExpr': {
      const to = e.typeName && e.typeName.ctype;
      const v = evalC(e.arg, tg, opts, depth + 1);
      if (!v || !to) return null;
      if (isFloating(to)) return opts.allowFloat ? { value: v.float ? v.value : Number(v.value), type: to, float: true } : null;
      if (!isInteger(to)) return null;
      if (v.float) {
        if (!Number.isFinite(v.value)) return null;
        return { value: wrapTo(BigInt(Math.trunc(v.value)), to, tg), type: to };
      }
      return { value: wrapTo(v.value, to, tg), type: to };
    }
    case 'UnaryExpr': {
      if (!e.prefix || e.op === '++' || e.op === '--' || e.op === '&' || e.op === '*') return null;
      const v = evalC(e.arg, tg, opts, depth + 1);
      if (!v) return null;
      if (v.float) {
        if (e.op === '-') return { ...v, value: -v.value };
        if (e.op === '+') return v;
        if (e.op === '!') return { value: v.value === 0 ? 1n : 0n, type: T.int };
        return null;
      }
      const rt = e.op === '!' ? (e.ctype || T.int) : integerPromote(v.type, tg);
      switch (e.op) {
        case '+': return { value: wrapTo(v.value, rt, tg), type: rt };
        case '-': return { value: wrapTo(-v.value, rt, tg), type: rt, overflow: !fitsIn(-v.value, rt, tg) };
        case '~': return { value: wrapTo(~v.value, rt, tg), type: rt };
        case '!': return { value: v.value === 0n ? 1n : 0n, type: rt };
        default: return null;
      }
    }
    case 'BinaryExpr': {
      const op = e.op;
      if (op === '&&' || op === '||') {
        const l = evalC(e.left, tg, opts, depth + 1);
        if (!l) return null;
        const lt = l.float ? l.value !== 0 : l.value !== 0n;
        if (op === '&&' && !lt) return { value: 0n, type: e.ctype || T.int };
        if (op === '||' && lt) return { value: 1n, type: e.ctype || T.int };
        const r = evalC(e.right, tg, opts, depth + 1);
        if (!r) return null;
        return { value: (r.float ? r.value !== 0 : r.value !== 0n) ? 1n : 0n, type: e.ctype || T.int };
      }
      if (op === ',') return null;
      const l = evalC(e.left, tg, opts, depth + 1);
      const r = l && evalC(e.right, tg, opts, depth + 1);
      if (!l || !r) return null;
      if (l.float || r.float) {
        if (!opts.allowFloat) return null;
        const a = Number(l.value), b = Number(r.value);
        const ft = usualArithmetic(l.type, r.type, tg);
        switch (op) {
          case '+': return { value: a + b, type: ft, float: true };
          case '-': return { value: a - b, type: ft, float: true };
          case '*': return { value: a * b, type: ft, float: true };
          case '/': return { value: a / b, type: ft, float: true };
          case '<': return { value: a < b ? 1n : 0n, type: T.int };
          case '>': return { value: a > b ? 1n : 0n, type: T.int };
          case '<=': return { value: a <= b ? 1n : 0n, type: T.int };
          case '>=': return { value: a >= b ? 1n : 0n, type: T.int };
          case '==': return { value: a === b ? 1n : 0n, type: T.int };
          case '!=': return { value: a !== b ? 1n : 0n, type: T.int };
          default: return null;
        }
      }
      return binInt(op, l, r, tg, e);
    }
    case 'ConditionalExpr': {
      const c = evalC(e.test, tg, opts, depth + 1);
      if (!c) return null;
      const truth = c.float ? c.value !== 0 : c.value !== 0n;
      const br = truth ? (e.consequent || e.test) : e.alternate;
      const v = evalC(br, tg, opts, depth + 1);
      if (!v) return null;
      const rt = e.ctype && isInteger(e.ctype) ? e.ctype : v.type;
      return v.float ? v : { value: wrapTo(v.value, rt, tg), type: rt };
    }
    default: return null;
  }
}

function binInt(op, l, r, tg, e) {
  const isShift = op === '<<' || op === '>>';
  const isCmp = op === '<' || op === '>' || op === '<=' || op === '>=' || op === '==' || op === '!=';
  const ct = isShift ? integerPromote(l.type, tg) : usualArithmetic(l.type, r.type, tg);
  const a = wrapTo(l.value, ct, tg);
  const b = isShift ? r.value : wrapTo(r.value, ct, tg);
  const boolT = (e && e.ctype && isCmp && isInteger(e.ctype) ? e.ctype : null) || T.int;
  let v, overflow = false;
  switch (op) {
    case '+': v = a + b; break;
    case '-': v = a - b; break;
    case '*': v = a * b; break;
    case '/': if (b === 0n) return { value: 0n, type: ct, divByZero: true, invalid: true }; v = a / b; break;
    case '%': if (b === 0n) return { value: 0n, type: ct, divByZero: true, invalid: true }; v = a % b; break;
    case '<<': {
      const bits = intBits(ct, tg);
      if (b < 0n || b >= BigInt(bits)) return { value: 0n, type: ct, invalid: true, shiftOutOfRange: true };
      v = a << b;
      break;
    }
    case '>>': {
      const bits = intBits(ct, tg);
      if (b < 0n || b >= BigInt(bits)) return { value: 0n, type: ct, invalid: true, shiftOutOfRange: true };
      v = a >> b;
      break;
    }
    case '&': v = a & b; break;
    case '|': v = a | b; break;
    case '^': v = a ^ b; break;
    case '<': return { value: a < b ? 1n : 0n, type: boolT };
    case '>': return { value: a > b ? 1n : 0n, type: boolT };
    case '<=': return { value: a <= b ? 1n : 0n, type: boolT };
    case '>=': return { value: a >= b ? 1n : 0n, type: boolT };
    case '==': return { value: a === b ? 1n : 0n, type: boolT };
    case '!=': return { value: a !== b ? 1n : 0n, type: boolT };
    default: return null;
  }
  if (!fitsIn(v, ct, tg)) overflow = true;
  const res = { value: wrapTo(v, ct, tg), type: ct };
  if (overflow) {
    if (isSigned(ct, tg)) res.overflow = true;
    else res.wrapped = true;
  }
  return res;
}

function signedChar(e, tg) {
  let v = e.value;
  if (!e.prefix && !e.multi && tg.charSigned !== false && v > 127 && v < 256 && !(e.ctype && isUnsigned(e.ctype, tg))) v -= 256;
  if (e.multi) v = Number(BigInt.asIntN(32, BigInt(v)));
  return v;
}

function sizeTType(target) {
  const tg = resolveTarget(target);
  if (tg.sizeT) return intType(tg.sizeT);
  if (tg.pointer === 4) return T.uint;
  return tg.long === 8 ? T.ulong : T.ullong;
}
function ptrdiffTType(target) {
  const tg = resolveTarget(target);
  if (tg.pointer === 4) return T.int;
  return tg.long === 8 ? T.long : T.llong;
}

// C 6.4.4.1 / C++ [lex.icon] type of an integer literal
function integerLiteralType(value, suffix, base, target, lang) {
  const s = (suffix || '').toLowerCase();
  const u = s.includes('u');
  const ll = s.includes('ll');
  const l = !ll && s.includes('l');
  const z = s.includes('z');
  const dec = base === 10;
  let cands;
  if (z) cands = u ? [sizeTType(target)] : [ptrdiffTType(target)];
  else if (s.includes('wb')) return { kind: 'int', name: (u ? 'unsigned ' : '') + '_BitInt', bitInt: true, bits: Math.max(1, value.toString(2).length + (u ? 0 : 1)), signedBitInt: !u };
  else if (u) cands = ll ? [T.ullong] : l ? [T.ulong, T.ullong] : [T.uint, T.ulong, T.ullong];
  else if (ll) cands = dec ? [T.llong] : [T.llong, T.ullong];
  else if (l) cands = dec ? [T.long, T.llong] : [T.long, T.ulong, T.llong, T.ullong];
  else cands = dec ? [T.int, T.long, T.llong] : [T.int, T.uint, T.long, T.ulong, T.llong, T.ullong];
  void lang;
  for (const c of cands) if (fitsIn(value, c, target)) return c;
  return { ...T.ullong, tooLarge: true };
}

// ---------------------------------------------------------------- value categories (C++)

// 'lvalue' | 'xvalue' | 'prvalue'
function valueCategory(e, opts = {}) {
  if (!e) return 'prvalue';
  const cpp = opts.lang ? opts.lang === 'cpp' : true;
  switch (e.type) {
    case 'ParenExpr': return valueCategory(e.expr, opts);
    case 'Identifier': {
      const s = e.symbol;
      if (!s) return 'lvalue';
      if (s.kind === 'enumerator') return 'prvalue';
      if (s.kind === 'function' && s.member && !s.isStatic) return 'prvalue';
      return 'lvalue';
    }
    case 'StringLiteral': return 'lvalue';
    case 'CompoundLiteral': return cpp ? 'prvalue' : 'lvalue';
    case 'UnaryExpr':
      if (e.op === '*') return 'lvalue';
      if ((e.op === '++' || e.op === '--') && e.prefix) return cpp ? 'lvalue' : 'prvalue';
      return 'prvalue';
    case 'IndexExpr': {
      const o = valueCategory(e.object, opts);
      return isArray(e.object && e.object.ctype) && o !== 'lvalue' ? 'xvalue' : 'lvalue';
    }
    case 'MemberExpr': {
      if (e.arrow) return 'lvalue';
      const o = valueCategory(e.object, opts);
      return o === 'lvalue' ? 'lvalue' : 'xvalue';
    }
    case 'AssignExpr': return cpp ? 'lvalue' : 'prvalue';
    case 'BinaryExpr':
      if (e.op === ',') return valueCategory(e.right, opts);
      if (e.op === '.*' || e.op === '->*') return e.op === '->*' ? 'lvalue' : valueCategory(e.left, opts);
      return 'prvalue';
    case 'ConditionalExpr': {
      if (!cpp) return 'prvalue';
      const a = valueCategory(e.consequent || e.test, opts), b = valueCategory(e.alternate, opts);
      return a === b ? a : 'prvalue';
    }
    case 'CastExpr':
    case 'CallExpr': {
      let t = e.type === 'CastExpr' ? (e.typeName && e.typeName.ctype) : e.ctypeDeclared;
      if (e.type === 'CallExpr') {
        const c = e.callee && (e.callee.type === 'Identifier' ? e.callee : null);
        if (c && (c.qname === 'std::move' || c.qname === 'move' && c.symbol == null && opts.assumeStdMove)) return 'xvalue';
        if (c && (c.qname === 'std::forward')) return 'xvalue';
        t = e.refType || null;
      }
      if (t) {
        const ct = canonical(t);
        if (ct.kind === 'reference') return ct.rvalue ? (isFunction(ct.to) ? 'lvalue' : 'xvalue') : 'lvalue';
      }
      return 'prvalue';
    }
    default: return 'prvalue';
  }
}

module.exports = {
  TARGETS, resolveTarget, T, intType, floatType, builtinFromNames,
  withQuals, qualsOf, unqualified, pointerTo, referenceTo, arrayOf, functionType, typedefType, unknownType, unresolvedType,
  canonical, nonRef, isVoid, isBool, isEnum, isInteger, isFloating, isArithmetic, isPointer, isArray, isFunction,
  isRecord, isScalar, isUnknown, isCharType, isPlainChar, isComplete, isSigned, isUnsigned,
  intRank, intBits, intRange, fitsIn, wrapTo, sizeOf, alignOf, layout,
  integerPromote, usualArithmetic, decay, pointee, typeToString, sameType,
  constValue, integerLiteralType, sizeTType, ptrdiffTType, valueCategory, INT_INFO,
};
