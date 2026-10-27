// Number formatting core: a C-compatible printf engine (sprintf / fprintf /
// compose / num2str), escape processing and short numeric text used by
// display, strings and string conversion.
import { isTensor, isString, isChar, isCell, isSparse, toTensor, isObject } from '../../value.js';
import { E } from './util.js';

// ------------------------------------------------------------- escapes

/** Processes backslash escapes of a format text (\n \t \\ \xHH \ooo ...). */
export function unescapeFormat(s) {
  if (s.indexOf('\\') < 0) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\' || i === s.length - 1) { out += ch; continue; }
    const n = s[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '\\': out += '\\'; break;
      case 'x': {
        let h = '';
        if (s[i + 1] === '{') { const j = s.indexOf('}', i); h = s.slice(i + 2, j); i = j; } else { while (h.length < 4 && /[0-9a-fA-F]/.test(s[i + 1] || '')) h += s[++i]; }
        out += h ? String.fromCodePoint(parseInt(h, 16)) : 'x';
        break;
      }
      default:
        if (/[0-7]/.test(n)) {
          let o = n;
          while (o.length < 3 && /[0-7]/.test(s[i + 1] || '')) o += s[++i];
          out += String.fromCharCode(parseInt(o, 8));
        } else if (n === 'o' && s[i + 1] === '{') { const j = s.indexOf('}', i); out += String.fromCharCode(parseInt(s.slice(i + 2, j), 8)); i = j; } else out += n;
    }
  }
  return out;
}

// ------------------------------------------------------------- C number formats

function expFix(s) {
  // JS "1.5e+0" → C "1.5e+00"
  const k = s.indexOf('e');
  if (k < 0) return s;
  const sign = s[k + 1];
  let d = s.slice(k + 2);
  if (d.length < 2) d = '0' + d;
  return s.slice(0, k) + 'e' + sign + d;
}
function fixedBig(a, p) {
  if (a < 1e21) return a.toFixed(p);
  let s = BigInt(Math.round(a)).toString();
  if (p > 0) s += '.' + '0'.repeat(p);
  return s;
}
/** Formats |v| (non-negative, finite) for one conversion letter. */
function cnum(a, conv, prec, alt) {
  switch (conv) {
    case 'f': case 'F': {
      const p = prec < 0 ? 6 : prec;
      let s = fixedBig(a, Math.min(p, 100));
      if (p > 100) s += '0'.repeat(p - 100);
      if (alt && p === 0) s += '.';
      return s;
    }
    case 'e': case 'E': {
      const p = prec < 0 ? 6 : Math.min(prec, 100);
      let s = expFix(a.toExponential(p));
      if (alt && p === 0) s = s.replace('e', '.e');
      return conv === 'E' ? s.toUpperCase() : s;
    }
    case 'g': case 'G': {
      let p = prec < 0 ? 6 : prec === 0 ? 1 : Math.min(prec, 100);
      if (a === 0) { let s = alt ? (0).toFixed(p - 1) : '0'; return s; }
      const es = a.toExponential(p - 1);
      const x = parseInt(es.slice(es.indexOf('e') + 1), 10);
      let s;
      if (x < p && x >= -4) {
        s = a.toFixed(Math.max(0, p - 1 - x));
        if (!alt && s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
      } else {
        s = es;
        if (!alt) { const k = s.indexOf('e'); let m = s.slice(0, k); if (m.indexOf('.') >= 0) m = m.replace(/0+$/, '').replace(/\.$/, ''); s = m + s.slice(k); }
        s = expFix(s);
      }
      return conv === 'G' ? s.toUpperCase() : s;
    }
    default: return String(a);
  }
}

/**
 * Formats a JS number like C printf. spec: {flags, width, prec, conv}.
 * Integer conversions of non-integer values switch to %e (like the reference).
 */
export function formatNumber(v, spec) {
  let { flags = '', width = -1, prec = -1, conv } = spec;
  const left = flags.includes('-'), plus = flags.includes('+'), space = flags.includes(' ');
  let zero = flags.includes('0') && !left, alt = flags.includes('#');
  let body, neg = false;
  if (Number.isNaN(v)) { body = 'NaN'; zero = false; } else if (!Number.isFinite(v)) { body = 'Inf'; neg = v < 0; zero = false; } else {
    neg = v < 0 || Object.is(v, -0) && 'feEgG'.includes(conv) && false;
    const a = Math.abs(v);
    switch (conv) {
      case 'd': case 'i': case 'u':
        if (!Number.isInteger(v)) return formatNumber(v, { flags, width, prec: prec, conv: 'e' });
        body = fixedBig(a, 0);
        if (prec >= 0) { body = body.padStart(prec, '0'); zero = false; }
        if (conv === 'u' && v < 0) return formatNumber(v, { flags, width, prec, conv: 'e' });
        break;
      case 'x': case 'X': case 'o':
        if (!Number.isInteger(v) || v < 0) return formatNumber(v, { flags, width, prec, conv: 'e' });
        body = BigInt(v).toString(conv === 'o' ? 8 : 16);
        if (conv === 'X') body = body.toUpperCase();
        if (alt && v !== 0) body = (conv === 'o' ? '0' : conv === 'x' ? '0x' : '0X') + body;
        if (prec >= 0) { body = body.padStart(prec, '0'); zero = false; }
        break;
      case 'c':
        body = String.fromCharCode(v); neg = false;
        break;
      default:
        body = cnum(a, conv, prec, alt);
    }
  }
  let sign = neg ? '-' : plus && conv !== 'c' ? '+' : space && conv !== 'c' ? ' ' : '';
  if (body === 'NaN' && !neg) sign = plus ? '+' : space ? ' ' : '';
  let s = sign + body;
  if (width > s.length) {
    if (left) s = s.padEnd(width, ' ');
    else if (zero) s = sign + body.padStart(width - sign.length, '0');
    else s = s.padStart(width, ' ');
  }
  return s;
}

/** Formats a text item for %s / %c with width / precision / '-' flag. */
function formatText(t, spec) {
  let s = t;
  if (spec.prec >= 0 && spec.conv === 's') s = s.slice(0, spec.prec);
  if (spec.width > s.length) s = spec.flags.includes('-') ? s.padEnd(spec.width) : s.padStart(spec.width);
  return s;
}

// ------------------------------------------------------------- format parsing

/** Parses a printf format (after escape processing) into literal and spec pieces. */
export function parseFormat(fmt) {
  const parts = [];
  let lit = '';
  const re = /%(\d+\$)?([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d*))?([lhLqjzt]*)([diouxXfFeEgGcsbt%])?/y;
  let i = 0;
  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch !== '%') { lit += ch; i++; continue; }
    re.lastIndex = i;
    const m = re.exec(fmt);
    if (!m || !m[6]) { lit += ch; i++; continue; }
    if (m[6] === '%') { lit += '%'; i = re.lastIndex; continue; }
    if (lit) { parts.push({ lit }); lit = ''; }
    let conv = m[6];
    if (conv === 'b' || conv === 't') { const nx = fmt[re.lastIndex]; conv = nx && 'diouxXfeEgG'.includes(nx) ? nx : 'f'; re.lastIndex++; }
    parts.push({
      flags: m[2] || '',
      width: m[3] === '*' ? '*' : m[3] ? parseInt(m[3], 10) : -1,
      prec: m[4] === '*' ? '*' : m[4] !== undefined ? (m[4] === '' ? 0 : parseInt(m[4], 10)) : -1,
      conv,
    });
    i = re.lastIndex;
  }
  if (lit) parts.push({ lit });
  return parts;
}

// ------------------------------------------------------------- argument items

/**
 * Flattens printf arguments into items: {num} or {text}. Char arrays are one
 * text item (expanded to codes when consumed by a numeric conversion).
 */
export function printfItems(args, fname = 'sprintf') {
  const items = [];
  for (const a of args) {
    if (isChar(a)) {
      let s = '';
      for (let i = 0; i < a.re.length; i++) s += String.fromCharCode(a.re[i]);
      items.push({ text: s });
    } else if (isString(a)) {
      for (const s of a.data) items.push({ text: s == null ? '<missing>' : s });
    } else if (isTensor(a) || isSparse(a)) {
      const t = toTensor(a);
      for (let i = 0; i < t.re.length; i++) {
        items.push({ num: t.re[i] }); // complex: real parts only
      }
    } else if (isCell(a)) {
      throw E(`base:${fname}:invalidType`, `Function ${fname} is not defined for 'cell' inputs.`);
    } else if (isObject(a)) {
      throw E(`base:${fname}:invalidType`, `Function ${fname} is not defined for '${a.cls}' inputs.`);
    } else if (a.cls === 'struct') {
      throw E(`base:${fname}:invalidType`, `Function ${fname} is not defined for 'struct' inputs.`);
    } else if (a.cls === 'logical') items.push({ num: a.re[0] });
    else throw E(`base:${fname}:invalidType`, `Function ${fname} is not defined for '${a.cls}' inputs.`);
  }
  return items;
}

/** Runs a parsed format over items (cycling). Returns the text. */
export function runFormat(parts, items) {
  const specs = parts.filter((p) => !('lit' in p));
  let out = '';
  if (specs.length === 0 || items.length === 0) {
    for (const p of parts) if ('lit' in p) out += p.lit;
    return out;
  }
  const q = items.slice();
  let pos = 0;
  const take = () => (pos < q.length ? q[pos++] : null);
  const numOf = (it) => {
    if (it.text !== undefined) return null;
    return it.num;
  };
  for (let guard = 0; pos < q.length && guard < 1e7; guard++) {
    const startPos = pos;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      if ('lit' in p) { out += p.lit; continue; }
      if (pos >= q.length) return out;
      let width = p.width, prec = p.prec;
      if (width === '*') { const it = take(); width = it && it.num !== undefined ? it.num : -1; if (width < 0) width = -1; }
      if (prec === '*') { const it = take(); prec = it && it.num !== undefined ? it.num : -1; }
      if (pos >= q.length) return out;
      let it = q[pos];
      const spec = { flags: p.flags, width, prec, conv: p.conv };
      if (p.conv === 's' || p.conv === 'c') {
        pos++;
        if (it.text !== undefined) {
          if (p.conv === 'c') out += formatText(it.text, spec);
          else out += formatText(it.text, spec);
        } else {
          const v = it.num;
          if (Number.isInteger(v) && v >= 0 && p.conv !== 'x') out += formatText(String.fromCharCode(v), spec);
          else if (p.conv === 'c' && Number.isInteger(v)) out += formatText(String.fromCharCode(v), spec);
          else out += formatNumber(v, { flags: p.flags, width, prec: prec, conv: Number.isInteger(v) ? 'd' : prec >= 0 ? 'f' : 'e' });
        }
      } else {
        if (it.text !== undefined) {
          // numeric conversion of text: expand into char codes
          const codes = Array.from(it.text, (c) => ({ num: c.charCodeAt(0) }));
          if (codes.length === 0) { q.splice(pos, 1); k--; if (pos >= q.length) return out; continue; }
          q.splice(pos, 1, ...codes);
          it = q[pos];
        }
        pos++;
        out += formatNumber(numOf(it), spec);
      }
    }
    if (pos === startPos) break;
  }
  return out;
}

/** sprintf(format, args...) → JS string. */
export function sprintfJS(fmt, args, fname = 'sprintf') {
  const parts = parseFormat(unescapeFormat(fmt));
  return runFormat(parts, printfItems(args, fname));
}

// ------------------------------------------------------------- short number text

/** num2str-style text of one real number (scalar rule: max(log10+5, 5) significant digits). */
export function num2strScalar(x, isSingle = false) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  if (Number.isInteger(x)) return fixedBig(Math.abs(x), 0).replace(/^/, x < 0 ? '-' : '');
  let d = Math.floor(Math.log10(Math.abs(x)));
  if (!Number.isFinite(d)) d = 0;
  d = Math.max(d + 5, 5);
  if (isSingle) d = Math.min(d, 8); else d = Math.min(d, 16);
  return formatNumber(x, { flags: '', width: -1, prec: d, conv: 'g' });
}

/** Text of a complex number a+bi in num2str style. */
export function num2strComplex(re, im) {
  const r = num2strScalar(re);
  const s = im < 0 || Object.is(im, -0) ? '-' : '+';
  const i = num2strScalar(Math.abs(im));
  return `${r}${s}${i}i`;
}

/** Shortest round-trip text with up to `digits` significant digits (string()/mat2str style). */
export function gText(x, digits = 15) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  return formatNumber(x, { flags: '', width: -1, prec: digits, conv: 'g' });
}
