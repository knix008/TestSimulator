// Excel number format codes ("#,##0.00", "0.0%", "#,##0;[Red]-#,##0", "0.00E+00", "yyyy-mm-dd", "\"₩\"#,##0",
// "@", "General") for the data window: formatCode(value, code) → { text, color }. Pure, no DOM.
//
// Supported: up to four sections (positive; negative; zero; text), [Red]/[Blue]/… colours and [>=100] conditions,
// 0 # ? digits, the decimal point, thousands commas (and trailing commas that divide by 1000), %, E+00 / E-00,
// quoted text, \x escapes, _x spaces and *x fills (as one space), @ for the text, fractions "# ?/?", and dates and
// times (yyyy yy mmmm mmm mm m dddd ddd dd d hh h mm ss AM/PM, [h] elapsed hours). Dates are Excel serial days or
// date text ("2024-03-01").
import { parseDate, parseNumber } from './table.js';

/** Excel's built-in number formats by id (what an .xlsx cell style refers to without its own numFmt). */
export const BUILTIN_FORMATS = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};

/** Format codes offered in the data window's "Custom format" dialog. */
export const FORMAT_PRESETS = [
  'General', '0', '0.00', '#,##0', '#,##0.00', '#,##0;[Red]-#,##0', '#,##0.00;[Red]-#,##0.00', '#,##0;(#,##0)', '0%', '0.00%', '0.00E+00',
  '"₩"#,##0', '"$"#,##0.00', '#,##0"원"', '#,##0,"천"', '# ?/?', '000000', 'yyyy-mm-dd', 'yyyy"년" m"월" d"일"', 'mm/dd/yyyy', 'd-mmm-yy',
  'yyyy-mm-dd hh:mm', 'hh:mm:ss', 'h:mm AM/PM', '[h]:mm', '@',
];

const COLORS = { black: '#000000', blue: '#1f4fd8', cyan: '#0aa3b5', green: '#1e8e3e', magenta: '#c026d3', red: '#d92d20', white: '#ffffff', yellow: '#b58900' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Splits a code into sections at ";" outside quotes and brackets. */
function sections(code) {
  const out = [];
  let cur = '';
  let quote = false;
  let bracket = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '\\' && !quote) { cur += ch + (code[i + 1] ?? ''); i++; continue; }
    if (ch === '"') quote = !quote;
    else if (!quote && ch === '[') bracket = true;
    else if (!quote && ch === ']') bracket = false;
    if (ch === ';' && !quote && !bracket) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** A section without its [colour] / [condition] tags: { body, color, cond }. */
function tags(section) {
  let color = null;
  let cond = null;
  const body = section.replace(/\[([^\]]*)\]/g, (m, inner) => {
    const lower = inner.toLowerCase();
    if (COLORS[lower]) { color = COLORS[lower]; return ''; }
    if (/^color\d+$/.test(lower)) return '';
    const c = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(inner);
    if (c) { cond = { op: c[1], n: Number(c[2]) }; return ''; }
    if (/^\$/.test(inner)) return inner.slice(1).split('-')[0];
    return m; // [h] [mm] [ss]: elapsed time, kept for the date formatter
  });
  return { body, color, cond };
}

const test = (cond, x) => ({ '<': x < cond.n, '>': x > cond.n, '<=': x <= cond.n, '>=': x >= cond.n, '=': x === cond.n, '<>': x !== cond.n })[cond.op];

/** Literal pieces and the code's own characters: [{ lit: 'text' } | { ch: '0' }, …]. */
function tokens(body) {
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') { let j = i + 1; let text = ''; while (j < body.length && body[j] !== '"') text += body[j++]; out.push({ lit: text }); i = j; continue; }
    if (ch === '\\') { out.push({ lit: body[i + 1] ?? '' }); i++; continue; }
    if (ch === '_') { out.push({ lit: ' ' }); i++; continue; }
    if (ch === '*') { out.push({ lit: '' }); i++; continue; }
    out.push({ ch });
  }
  return out;
}

const isDateCode = (body) => /(^|[^"\\])[ymdhsYMDHS]/.test(body.replace(/"[^"]*"/g, '').replace(/\\./g, '')) && !/[0#?]/.test(body.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[hms]+\]/gi, '').replace(/[ymdhsYMDHS.]+0+/g, ''));

function formatDate(value, body) {
  let serial = typeof value === 'number' ? value : null;
  if (serial == null) { const ms = parseDate(value); if (ms == null) return null; serial = ms / 86400000 + 25569; }
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const Y = d.getUTCFullYear(); const M = d.getUTCMonth(); const D = d.getUTCDate(); const W = d.getUTCDay();
  const h = d.getUTCHours(); const mi = d.getUTCMinutes(); const s = d.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(body);
  const p2 = (n) => String(n).padStart(2, '0');
  const toks = tokens(body);
  let out = '';
  let lastWasHour = false;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.lit != null) { out += tk.lit; continue; }
    const rest = toks.slice(i).map((x) => x.ch ?? '\u0000').join('');
    const run = (c) => { let n = 0; while (toks[i + n]?.ch?.toLowerCase() === c) n++; return n; };
    const lower = tk.ch.toLowerCase();
    if (/^\[h+\]/i.test(rest)) { const n = rest.indexOf(']') + 1; out += String(Math.floor(serial * 24)); i += n - 1; lastWasHour = true; continue; }
    if (/^\[m+\]/i.test(rest)) { const n = rest.indexOf(']') + 1; out += String(Math.floor(serial * 1440)); i += n - 1; continue; }
    if (/^\[s+\]/i.test(rest)) { const n = rest.indexOf(']') + 1; out += String(Math.round(serial * 86400)); i += n - 1; continue; }
    if (/^AM\/PM/i.test(rest)) { out += h < 12 ? 'AM' : 'PM'; i += 4; continue; }
    if (/^A\/P/i.test(rest)) { out += h < 12 ? 'A' : 'P'; i += 2; continue; }
    if (lower === 'y') { const n = run('y'); out += n <= 2 ? p2(Y % 100) : String(Y); i += n - 1; continue; }
    if (lower === 'd') { const n = run('d'); out += n === 1 ? D : n === 2 ? p2(D) : n === 3 ? DAYS[W].slice(0, 3) : DAYS[W]; i += n - 1; continue; }
    if (lower === 'h') { const n = run('h'); const hh = ampm ? (h % 12 || 12) : h; out += n === 1 ? hh : p2(hh); i += n - 1; lastWasHour = true; continue; }
    if (lower === 's') { const n = run('s'); out += n === 1 ? s : p2(s); i += n - 1; lastWasHour = false; continue; }
    if (lower === 'm') {
      const n = run('m');
      // m after an hour or before seconds is minutes.
      const after = toks.slice(i + n).map((x) => x.ch ?? '').join('').replace(/[^a-zA-Z]/g, '');
      const minutes = lastWasHour || /^s/i.test(after);
      if (minutes) out += n === 1 ? mi : p2(mi);
      else out += n === 1 ? M + 1 : n === 2 ? p2(M + 1) : n === 3 ? MONTHS[M].slice(0, 3) : n === 4 ? MONTHS[M] : MONTHS[M][0];
      i += n - 1;
      lastWasHour = false;
      continue;
    }
    if (tk.ch === '0' && out.endsWith('.')) { // fractions of a second: ss.00
      const n = run('0');
      out += String(Math.round(((serial * 86400) % 1) * 10 ** n)).padStart(n, '0');
      i += n - 1;
      continue;
    }
    out += tk.ch;
  }
  return out;
}

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNumber(x, body) {
  const toks = tokens(body);
  const code = toks.map((t) => (t.ch != null ? t.ch : '\u0000')).join('');
  // Scientific.
  const sci = /[eE][+-]/.exec(code);
  if (sci) {
    const mantissa = code.slice(0, sci.index);
    const expDigits = (code.slice(sci.index + 2).match(/[0#]/g) ?? []).length || 1;
    const decimals = (mantissa.split('.')[1]?.match(/[0#?]/g) ?? []).length;
    const intDigits = (mantissa.split('.')[0].match(/[0#?]/g) ?? []).length || 1;
    // Engineering style (##0.0E+0): exponent a multiple of the integer digits.
    let exp = x === 0 ? 0 : Math.floor(Math.log10(Math.abs(x)));
    if (intDigits > 1 && /#/.test(mantissa)) exp = Math.floor(exp / intDigits) * intDigits;
    const m = x / 10 ** exp;
    const sign = code[sci.index + 1] === '+' || exp < 0 ? (exp < 0 ? '-' : '+') : '';
    const prefix = toks.slice(0, toks.findIndex((t) => t.ch && /[0#?.]/.test(t.ch))).map((t) => t.lit ?? t.ch).join('');
    return `${prefix}${Math.abs(m).toFixed(decimals)}E${sign}${String(Math.abs(exp)).padStart(expDigits, '0')}`;
  }
  // Fractions "# ?/?".
  const frac = /([#0?]+)\s+([?0#]+)\/([?0#\d]+)/.exec(code);
  if (frac) {
    const whole = Math.trunc(Math.abs(x));
    const rest = Math.abs(x) - whole;
    const maxDen = /^\d+$/.test(frac[3]) ? Number(frac[3]) : 10 ** frac[3].length - 1;
    let best = [0, 1];
    for (let d = 1; d <= maxDen; d++) { const n = Math.round(rest * d); if (Math.abs(rest - n / d) < Math.abs(rest - best[0] / best[1])) best = [n, d]; }
    if (/^\d+$/.test(frac[3])) best = [Math.round(rest * maxDen), maxDen];
    const fracText = best[0] ? `${best[0]}/${best[1]}` : '';
    return `${whole || !fracText ? whole : ''}${whole && fracText ? ' ' : ''}${fracText}`;
  }
  let value = x;
  const percent = (code.match(/%/g) ?? []).length;
  value *= 100 ** percent;
  // Commas right after the last digit placeholder divide by 1000 each.
  const lastDigit = Math.max(code.lastIndexOf('0'), code.lastIndexOf('#'), code.lastIndexOf('?'));
  let scale = 0;
  for (let i = lastDigit + 1; i < code.length && code[i] === ','; i++) scale++;
  value /= 1000 ** scale;
  const point = code.indexOf('.');
  const placeholders = (s) => (s.match(/[0#?]/g) ?? []);
  const intCode = point >= 0 ? code.slice(0, point) : code.slice(0, lastDigit + 1);
  const decCode = point >= 0 ? code.slice(point + 1, lastDigit + 1) : '';
  const decs = placeholders(decCode);
  const thousands = /[0#?],[0#?]/.test(intCode);
  let [ints, fracs = ''] = Math.abs(value).toFixed(decs.length).split('.');
  // Optional decimals (#) drop their trailing zeros; ? keeps a space.
  let cut = fracs.length;
  for (let k = decs.length - 1; k >= 0 && decs[k] !== '0' && fracs[k] === '0'; k--) cut = k;
  fracs = fracs.slice(0, cut) + decs.slice(cut).map((p) => (p === '?' ? ' ' : '')).join('');
  const intPh = placeholders(intCode);
  const minInt = intPh.filter((p) => p === '0').length;
  if (ints === '0' && minInt === 0) ints = '';
  ints = ints.padStart(minInt, '0');
  if (thousands) ints = groupThousands(ints);
  const numberText = `${ints}${point >= 0 && (fracs.length || decCode.includes('0') || decs.length) ? '.' : ''}${fracs}`;
  // Put the number where the placeholders are; literal text and symbols around it stay.
  let out = '';
  let placed = false;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.lit != null) { out += tk.lit; continue; }
    if (/[0#?.,]/.test(tk.ch)) { if (!placed) { out += numberText; placed = true; } continue; }
    out += tk.ch === '@' ? '' : tk.ch;
  }
  if (!placed) out += numberText;
  return out;
}

/**
 * A value in an Excel format code: { text, color } (color null when the code has none). Text values use the text
 * section ("@") when there is one; values that are not numbers are shown as they are.
 */
export function formatCode(value, code, { blank = '' } = {}) {
  if (value == null || value === '') return { text: blank, color: null };
  const parts = sections(String(code ?? 'General'));
  const n = typeof value === 'number' ? value : null;
  const asText = (section) => { const { body, color } = tags(section); return { text: tokens(body).map((t) => (t.lit != null ? t.lit : t.ch === '@' ? String(value) : t.ch)).join(''), color }; };
  if (n == null) {
    // Dates written as text still format with a date code.
    const date = parseDate(value);
    const first = tags(parts[0]);
    if (date != null && isDateCode(first.body)) return { text: formatDate(value, first.body) ?? String(value), color: first.color };
    if (parts.length >= 4) return asText(parts[3]);
    if (parts.some((p) => p.includes('@'))) return asText(parts.find((p) => p.includes('@')));
    const num = parseNumber(value);
    if (num == null || typeof value === 'string') return { text: String(value), color: null };
  }
  const x = n ?? parseNumber(value);
  let section = parts[0];
  let negativeSection = false;
  const conds = parts.map((p) => tags(p).cond);
  if (conds[0] || conds[1]) {
    if (conds[0] && test(conds[0], x)) section = parts[0];
    else if (conds[1] && test(conds[1], x)) { section = parts[1]; negativeSection = x < 0; }
    else section = parts[2] ?? parts[1] ?? parts[0];
  } else if (x < 0 && parts.length >= 2) { section = parts[1]; negativeSection = true; }
  else if (x === 0 && parts.length >= 3) section = parts[2];
  const { body, color } = tags(section);
  if (/^general$/i.test(body.trim())) return { text: generalText(x), color };
  if (isDateCode(body)) return { text: formatDate(x, body) ?? String(value), color };
  if (!/[0#?]/.test(body)) return { text: tokens(body).map((t) => t.lit ?? (t.ch === '@' ? generalText(x) : t.ch)).join(''), color };
  const shown = formatNumber(negativeSection ? Math.abs(x) : x, body);
  return { text: !negativeSection && x < 0 && !/^-/.test(shown) ? `-${shown}` : shown, color };
}

/** "General": up to 11 significant characters, like Excel. */
export function generalText(x) {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x) && Math.abs(x) < 1e11) return String(x);
  const abs = Math.abs(x);
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return x.toExponential(5).replace(/\.?0+e/, 'E').replace('E+', 'E+').replace(/E([+-])(\d)$/, 'E$10$2');
  return String(Number(x.toPrecision(10)));
}
