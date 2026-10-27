// A compact sprintf for messages (error, warning, MException, assert) when the
// library's sprintf is not available. Supports escapes and %d %i %u %f %e %g
// %s %c %x %X %o %% with flags, width and precision; the format is recycled
// over the flattened arguments like the full version.
import { isTensor, isString, isCell } from '../value.js';

export function unescape(s) {
  return s.replace(/\\(n|t|r|a|b|f|v|\\|x[0-9a-fA-F]+|[0-7]{1,3})/g, (m, c) => {
    switch (c[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '\\': return '\\';
      case 'x': return String.fromCharCode(parseInt(c.slice(1), 16));
      default: return String.fromCharCode(parseInt(c, 8));
    }
  });
}

function flatten(args) {
  const out = [];
  for (const a of args) {
    if (isTensor(a)) {
      if (a.cls === 'char') out.push(String.fromCharCode(...a.re));
      else for (const x of a.re) out.push(a.cls === 'logical' ? x : x);
    } else if (isString(a)) for (const s of a.data) out.push(s == null ? '<missing>' : s);
    else if (isCell(a)) out.push(...flatten(a.data));
    else out.push(`<${a.cls}>`);
  }
  return out;
}

function numStr(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  return null;
}

function fmtOne(spec, flags, width, prec, v) {
  let s;
  const isNum = typeof v === 'number';
  switch (spec) {
    case 'd': case 'i': case 'u':
      if (!isNum) { s = String(v); break; }
      if (!Number.isInteger(v)) { s = numStr(v) || (v.toExponential(prec !== null ? prec : 6)).replace(/e([+-])(\d)$/, 'e$10$2'); break; }
      s = String(v);
      break;
    case 'f': case 'F':
      s = isNum ? numStr(v) || v.toFixed(prec !== null ? prec : 6) : String(v);
      break;
    case 'e': case 'E':
      s = isNum ? numStr(v) || v.toExponential(prec !== null ? prec : 6).replace(/e([+-])(\d)$/, 'e$10$2') : String(v);
      if (spec === 'E') s = s.toUpperCase();
      break;
    case 'g': case 'G': {
      if (!isNum) { s = String(v); break; }
      s = numStr(v);
      if (s) break;
      const p = prec === null ? 6 : prec === 0 ? 1 : prec;
      const e = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v)));
      if (e < -4 || e >= p) s = v.toExponential(p - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
      else s = String(Number(v.toPrecision(p)));
      if (spec === 'G') s = s.toUpperCase();
      break;
    }
    case 's': s = isNum ? (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(5)))) : String(v); if (prec !== null) s = s.slice(0, prec); break;
    case 'c': s = isNum ? String.fromCharCode(v) : String(v); break;
    case 'x': case 'X': s = isNum ? Math.trunc(v).toString(16) : String(v); if (spec === 'X') s = s.toUpperCase(); break;
    case 'o': s = isNum ? Math.trunc(v).toString(8) : String(v); break;
    default: s = String(v);
  }
  if (isNum && flags.includes('+') && v >= 0 && 'dfeEgGi'.includes(spec)) s = '+' + s;
  if (isNum && flags.includes(' ') && v >= 0 && 'dfeEgGi'.includes(spec) && !flags.includes('+')) s = ' ' + s;
  if (width !== null && s.length < width) {
    if (flags.includes('-')) s = s.padEnd(width);
    else if (flags.includes('0') && isNum && Number.isFinite(v)) { const neg = s[0] === '-' || s[0] === '+'; s = neg ? s[0] + s.slice(1).padStart(width - 1, '0') : s.padStart(width, '0'); }
    else s = s.padStart(width);
  }
  return s;
}

/** sprintf(fmt, args...) → JS string. */
export function sprintfLite(fmt, args) {
  const f = unescape(fmt);
  const vals = flatten(args);
  const re = /%(?:(\d+)\$)?([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([diuoxXfFeEgGcs%])/g;
  let out = '';
  let k = 0;
  do {
    let last = 0;
    let used = 0;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(f))) {
      if (m[5] === '%') { out += f.slice(last, m.index) + '%'; last = re.lastIndex; continue; }
      if (k >= vals.length && k > 0) { out += f.slice(last, m.index); last = -1; break; }
      out += f.slice(last, m.index);
      last = re.lastIndex;
      const width = m[3] === '*' ? vals[k++] : m[3] !== undefined ? Number(m[3]) : null;
      const prec = m[4] === '*' ? vals[k++] : m[4] !== undefined ? Number(m[4]) : null;
      const v = k < vals.length ? vals[k++] : undefined;
      if (v !== undefined) out += fmtOne(m[5], m[2] || '', width, prec, v);
      used++;
    }
    if (last >= 0) out += f.slice(last);
    if (used === 0) break;
  } while (k < vals.length);
  return out;
}
