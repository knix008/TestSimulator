// Fractional ordering keys (ARCHITECTURE §3.3).
// Keys use the alphabet 0-9a-z only, so byte order == collation order on every database.
// A valid key is non-empty and never ends with '0' (so there is always room before it).

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
export const MAX_RANK_LENGTH = 64;

const val = (ch) => DIGITS.indexOf(ch);

/** True when `k` is a well-formed rank key. */
export function isValid(k) {
  return typeof k === 'string' && k.length > 0 && /^[0-9a-z]+$/.test(k) && !k.endsWith('0');
}

/**
 * A key strictly between `a` and `b` (either may be null = open end).
 * @param {string|null} a
 * @param {string|null} b
 */
export function between(a, b) {
  a = a || '';
  b = b || null;
  if (b !== null && a >= b) throw new Error(`rank.between: ${a} >= ${b}`);
  return midpoint(a, b);
}

function midpoint(a, b) {
  if (b !== null) {
    // shared prefix (a padded with '0')
    let n = 0;
    while (n < b.length && (a[n] || '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? val(a[0]) : 0;
  const db = b !== null ? val(b[0]) : BASE;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  // consecutive first digits
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

/** Key after `a` (append at the end). */
export const after = (a) => between(a, null);
/** Key before `b` (insert at the start). */
export const before = (b) => between(null, b);

/**
 * `n` evenly spaced keys of equal length.
 * @param {number} n
 * @returns {string[]}
 */
export function initial(n) {
  if (n <= 0) return [];
  let len = 1;
  while (BASE ** len < (n + 1) * 4) len++; // leave room between neighbours
  const span = BASE ** len;
  const out = [];
  for (let i = 1; i <= n; i++) {
    let s = Math.round((i * span) / (n + 1)).toString(36).padStart(len, '0');
    s = s.replace(/0+$/, '');
    out.push(s);
  }
  return out;
}

/** Fresh evenly spaced keys for an ordered list (used when a key grows past MAX_RANK_LENGTH). */
export function rebalance(keys) {
  return initial(keys.length);
}

/** True when `k` is long enough that the list should be rebalanced. */
export const needsRebalance = (k) => typeof k === 'string' && k.length > MAX_RANK_LENGTH;
