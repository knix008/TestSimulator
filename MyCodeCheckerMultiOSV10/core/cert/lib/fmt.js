'use strict';

// printf / scanf format string parsing for FIO30-C, FIO47-C, STR31-C.

// Conversions in a printf-style format: [{ flags, width, precision, length, conv, text }]
function parse(fmt) {
  const out = [];
  if (fmt == null) return out;
  const re = /%([-+ #0']*)(\*|\d+)?(?:\.(\*|\d*))?(hh|h|ll|l|L|z|j|t|I64|I32|q)?([a-zA-Z%\[])/g;
  let m;
  while ((m = re.exec(fmt))) {
    if (m[5] === '%') continue;
    let conv = m[5];
    let text = m[0];
    if (conv === '[') {
      const close = fmt.indexOf(']', re.lastIndex + (fmt[re.lastIndex] === ']' ? 1 : 0) + (fmt[re.lastIndex] === '^' ? 1 : 0));
      if (close > 0) { text = fmt.slice(m.index, close + 1); re.lastIndex = close + 1; }
    }
    out.push({ flags: m[1] || '', width: m[2] || null, precision: m[3] === undefined ? null : m[3], length: m[4] || '', conv, text });
  }
  return out;
}

// Upper bound of the printf output length (Infinity when unbounded).
function maxLen(fmt) {
  if (fmt == null) return Infinity;
  let n = fmt.replace(/%([-+ #0']*)(\*|\d+)?(?:\.(\*|\d*))?(hh|h|ll|l|L|z|j|t)?([a-zA-Z%])/g, (all) => (all === '%%' ? '%' : '')).length;
  for (const c of parse(fmt)) {
    const wide = /l|z|j|t|q|I64/.test(c.length);
    let len;
    switch (c.conv) {
      case 'd': case 'i': len = wide ? 20 : 11; break;
      case 'u': len = wide ? 20 : 10; break;
      case 'x': case 'X': len = wide ? 16 : 8; if (c.flags.includes('#')) len += 2; break;
      case 'o': len = wide ? 22 : 11; break;
      case 'c': len = 1; break;
      case 'p': len = 18; break;
      case 's': len = c.precision != null && c.precision !== '*' ? Number(c.precision || 0) : Infinity; break;
      case 'e': case 'E': case 'g': case 'G': case 'a': case 'A': len = 24 + (c.precision && c.precision !== '*' ? Number(c.precision) : 6); break;
      case 'f': case 'F': len = c.length === 'L' ? Infinity : 317 + (c.precision && c.precision !== '*' ? Number(c.precision) : 6); break;
      default: len = Infinity;
    }
    if (c.width === '*' || c.precision === '*') len = Infinity;
    else if (c.width) len = Math.max(len, Number(c.width));
    n += len;
  }
  return n;
}

// '%s' / '%[' scanf conversions with no field width.
function scanUnbounded(fmt) {
  return parse(fmt).some((c) => (c.conv === 's' || c.conv === '[') && !c.width && !c.flags.includes('*') && !/^%\*/.test(c.text));
}

module.exports = { parse, maxLen, scanUnbounded };
