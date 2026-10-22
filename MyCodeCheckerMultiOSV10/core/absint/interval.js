'use strict';

// Integer interval domain.
//
// An interval is an immutable plain object { lo, hi, nz?, tl?, th? } with
// Number bounds (-Infinity / Infinity for unbounded). Extra flags:
//   nz  0 is excluded (x != 0 refinement); only kept while lo < 0 < hi
//   tl  the lower bound is attained on some feasible path ("tight")
//   th  the upper bound is attained on some feasible path
// Tight bounds come from constants and from refinement against constants
// (i < 10 gives hi = 9 tight). They turn a partial violation into a definite
// one: an access at index [0, 10] with a tight 10 into a 10-element array is
// an overrun on the path where the index is 10.
// Bottom (infeasible) is represented by null.

const INF = Infinity;

function make(lo, hi, flags) {
  if (Number.isNaN(lo) || Number.isNaN(hi)) return { lo: -INF, hi: INF };
  if (lo > hi) return null;
  const r = { lo, hi };
  if (flags) {
    if (flags.nz && lo < 0 && hi > 0) r.nz = true;
    if (flags.tl && lo !== -INF) r.tl = true;
    if (flags.th && hi !== INF) r.th = true;
  }
  if (r.lo === 0 && flags && flags.nz) r.lo = 1;
  if (r.hi === 0 && flags && flags.nz) r.hi = -1;
  if (r.lo > r.hi) return null;
  return r;
}

const TOP = Object.freeze({ lo: -INF, hi: INF });

function konst(n) {
  const v = Number(n);
  return { lo: v, hi: v, tl: true, th: true };
}

function isConst(a) {
  return !!a && a.lo === a.hi && Number.isFinite(a.lo);
}

function isTop(a) {
  return !a || (a.lo === -INF && a.hi === INF);
}

function contains(a, v) {
  if (!a) return false;
  if (v === 0 && a.nz) return false;
  return a.lo <= v && v <= a.hi;
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.lo === b.lo && a.hi === b.hi && !!a.nz === !!b.nz && !!a.tl === !!b.tl && !!a.th === !!b.th;
}

function join(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  const lo = Math.min(a.lo, b.lo);
  const hi = Math.max(a.hi, b.hi);
  const tl = (a.lo === lo && a.tl) || (b.lo === lo && b.tl);
  const th = (a.hi === hi && a.th) || (b.hi === hi && b.th);
  const nz = !contains(a, 0) && !contains(b, 0);
  return make(lo, hi, { nz, tl, th });
}

function meet(a, b) {
  if (!a || !b) return null;
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  if (lo > hi) return null;
  const tl = (lo === a.lo && a.tl) || (lo === b.lo && b.tl);
  const th = (hi === a.hi && a.th) || (hi === b.hi && b.th);
  return make(lo, hi, { nz: a.nz || b.nz, tl, th });
}

// Widening with thresholds: a bound that grows jumps to the next threshold
// (sorted ascending numbers) and then to infinity.
function widen(prev, next, thresholds) {
  if (!prev) return next;
  if (!next) return prev;
  let lo = prev.lo, hi = prev.hi;
  let tl = prev.tl, th = prev.th;
  if (next.lo < prev.lo) {
    lo = -INF;
    tl = false;
    if (thresholds) for (let i = thresholds.length - 1; i >= 0; i--) if (thresholds[i] <= next.lo) { lo = thresholds[i]; break; }
  }
  if (next.hi > prev.hi) {
    hi = INF;
    th = false;
    if (thresholds) for (const t of thresholds) if (t >= next.hi) { hi = t; break; }
  }
  return make(lo, hi, { nz: prev.nz && next.nz, tl, th });
}

function neg(a) {
  if (!a) return null;
  return make(-a.hi, -a.lo, { nz: a.nz, tl: a.th, th: a.tl });
}

function add(a, b) {
  if (!a || !b) return null;
  // Bounds of two independent non-constant operands are not attained together.
  const k = isConst(a) || isConst(b);
  return make(a.lo + b.lo, a.hi + b.hi, { tl: k && a.tl && b.tl, th: k && a.th && b.th });
}

function sub(a, b) {
  if (!a || !b) return null;
  const k = isConst(a) || isConst(b);
  return make(a.lo - b.hi, a.hi - b.lo, { tl: k && a.tl && b.th, th: k && a.th && b.tl });
}

function mulN(x, y) {
  if ((x === 0 && !Number.isFinite(y)) || (y === 0 && !Number.isFinite(x))) return 0;
  return x * y;
}

function mul(a, b) {
  if (!a || !b) return null;
  const c = [mulN(a.lo, b.lo), mulN(a.lo, b.hi), mulN(a.hi, b.lo), mulN(a.hi, b.hi)];
  let tl = false, th = false;
  if (isConst(b)) { tl = b.lo >= 0 ? a.tl : a.th; th = b.lo >= 0 ? a.th : a.tl; }
  else if (isConst(a)) { tl = a.lo >= 0 ? b.tl : b.th; th = a.lo >= 0 ? b.th : b.tl; }
  return make(Math.min(...c), Math.max(...c), { tl, th, nz: a.nz && b.nz });
}

function truncDiv(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (!Number.isFinite(y)) return 0;
    return x / y;
  }
  return Math.trunc(x / y);
}

// C division (truncation). The divisor's zero is excluded (the caller reports
// DIVIDE_BY_ZERO separately).
function div(a, b) {
  if (!a || !b) return null;
  const parts = [];
  if (b.hi >= 1) parts.push([Math.max(1, b.lo), b.hi]);
  if (b.lo <= -1) parts.push([b.lo, Math.min(-1, b.hi)]);
  if (!parts.length) return null;
  let out = null;
  for (const [l, h] of parts) {
    const c = [truncDiv(a.lo, l), truncDiv(a.lo, h), truncDiv(a.hi, l), truncDiv(a.hi, h)].filter((x) => !Number.isNaN(x));
    const r = make(Math.min(...c), Math.max(...c));
    out = out ? join(out, r) : r;
  }
  if (out && isConst(a) && isConst(b) && b.lo !== 0) return konst(Math.trunc(a.lo / b.lo));
  if (out && isConst(b) && b.lo > 0) return make(out.lo, out.hi, { tl: a.tl, th: a.th });
  return out;
}

function mod(a, b) {
  if (!a || !b) return null;
  if (isConst(a) && isConst(b) && b.lo !== 0) return konst(a.lo % b.lo);
  const m = Math.max(Math.abs(b.lo), Math.abs(b.hi));
  if (!Number.isFinite(m)) {
    if (a.lo >= 0) return make(0, a.hi);
    return make(Math.min(a.lo, 0), Math.max(a.hi, 0));
  }
  const lo = a.lo >= 0 ? 0 : Math.max(-(m - 1), a.lo);
  const hi = a.hi <= 0 ? 0 : Math.min(m - 1, a.hi);
  return make(lo, hi);
}

function shl(a, b) {
  if (!a || !b) return null;
  if (b.lo < 0 || b.hi > 1023) return TOP;
  const f = (x, s) => (x === 0 ? 0 : x * Math.pow(2, s));
  const c = [f(a.lo, b.lo), f(a.lo, b.hi), f(a.hi, b.lo), f(a.hi, b.hi)];
  const r = make(Math.min(...c), Math.max(...c), isConst(b) ? { tl: a.tl, th: a.th } : null);
  return r;
}

function shr(a, b) {
  if (!a || !b) return null;
  if (b.lo < 0 || b.hi > 1023) return TOP;
  const f = (x, s) => (Number.isFinite(x) ? Math.floor(x / Math.pow(2, s)) : x);
  // an upper bound beyond 2^53 is rounded (2^64 - 1 is stored as 2^64): shift it as one less
  const g = (x, s) => (Number.isFinite(x) && x > Number.MAX_SAFE_INTEGER && s > 0 ? Math.ceil(x / Math.pow(2, s)) - 1 : f(x, s));
  const c = [f(a.lo, b.lo), f(a.lo, b.hi), g(a.hi, b.lo), g(a.hi, b.hi)];
  return make(Math.min(...c), Math.max(...c), isConst(b) ? { tl: a.tl, th: a.th && a.hi <= Number.MAX_SAFE_INTEGER } : null);
}

function bitAnd(a, b) {
  if (!a || !b) return null;
  if (isConst(a) && isConst(b) && Number.isSafeInteger(a.lo) && Number.isSafeInteger(b.lo) && Math.abs(a.lo) < 2 ** 31 && Math.abs(b.lo) < 2 ** 31) return konst(a.lo & b.lo);
  if (a.lo >= 0 && b.lo >= 0) return make(0, Math.min(a.hi, b.hi));
  if (a.lo >= 0) return make(0, a.hi);
  if (b.lo >= 0) return make(0, b.hi);
  return TOP;
}

function pow2ceil(x) {
  if (!Number.isFinite(x)) return INF;
  let p = 1;
  while (p <= x) p *= 2;
  return p;
}

function bitOr(a, b) {
  if (!a || !b) return null;
  if (isConst(a) && isConst(b) && Number.isSafeInteger(a.lo) && Number.isSafeInteger(b.lo) && Math.abs(a.lo) < 2 ** 31 && Math.abs(b.lo) < 2 ** 31) return konst(a.lo | b.lo);
  if (a.lo >= 0 && b.lo >= 0) return make(Math.max(a.lo, b.lo), pow2ceil(Math.max(a.hi, b.hi)) - 1);
  return TOP;
}

function bitXor(a, b) {
  if (!a || !b) return null;
  if (isConst(a) && isConst(b) && Number.isSafeInteger(a.lo) && Number.isSafeInteger(b.lo) && Math.abs(a.lo) < 2 ** 31 && Math.abs(b.lo) < 2 ** 31) return konst(a.lo ^ b.lo);
  if (a.lo >= 0 && b.lo >= 0) return make(0, pow2ceil(Math.max(a.hi, b.hi)) - 1);
  return TOP;
}

function bitNot(a) {
  if (!a) return null;
  return make(-a.hi - 1, -a.lo - 1, { tl: a.th, th: a.tl });
}

// Fit a mathematical interval into an integer type range { min, max, bits, unsigned }.
// Returns { iv, overflow: 'none' | 'partial' | 'full' }.
function fit(a, range) {
  if (!a || !range) return { iv: a, overflow: 'none' };
  if (a.lo >= range.min && a.hi <= range.max) return { iv: a, overflow: 'none' };
  const full = a.hi < range.min || a.lo > range.max;
  // Doubles cannot represent 64-bit wrap-around exactly.
  if (range.max > 9007199254740991 || range.min < -9007199254740991) return { iv: make(range.min, range.max), overflow: full ? 'full' : 'partial' };
  const span = range.max - range.min + 1;
  if (range.unsigned && Number.isFinite(a.lo) && Number.isFinite(a.hi) && a.hi - a.lo < span && Number.isFinite(span)) {
    // Wrap modulo 2^bits when the whole interval maps into one period.
    const lo = ((a.lo % span) + span) % span;
    const hi = lo + (a.hi - a.lo);
    if (hi <= range.max) {
      return { iv: make(lo, hi, { tl: a.tl, th: a.th }), overflow: full ? 'full' : 'partial' };
    }
  }
  if (!range.unsigned && full && Number.isFinite(a.lo) && Number.isFinite(a.hi) && Number.isFinite(span) && a.hi - a.lo < span) {
    // Two's complement wrap for a fully overflowing constant-ish interval.
    let lo = ((a.lo - range.min) % span + span) % span + range.min;
    const hi = lo + (a.hi - a.lo);
    if (hi <= range.max) return { iv: make(lo, hi, { tl: a.tl, th: a.th }), overflow: 'full' };
  }
  return { iv: make(range.min, range.max), overflow: full ? 'full' : 'partial' };
}

function clampTo(a, range) {
  if (!range) return a;
  if (!a) return null;
  return meet(a, make(range.min, range.max)) || make(range.min, range.max);
}

function finite(a) {
  return !!a && Number.isFinite(a.lo) && Number.isFinite(a.hi);
}

function show(a) {
  if (!a) return '(none)';
  if (isConst(a)) return String(a.lo);
  const f = (x) => (x === INF ? '+inf' : x === -INF ? '-inf' : String(x));
  return `[${f(a.lo)}, ${f(a.hi)}]`;
}

function key(a) {
  if (!a) return '_';
  return `${a.lo},${a.hi}${a.nz ? 'z' : ''}${a.tl ? 'l' : ''}${a.th ? 'h' : ''}`;
}

module.exports = {
  INF, TOP, make, konst, isConst, isTop, contains, equal, join, meet, widen, neg, add, sub, mul, div, mod,
  shl, shr, bitAnd, bitOr, bitXor, bitNot, fit, clampTo, finite, show, key,
};
