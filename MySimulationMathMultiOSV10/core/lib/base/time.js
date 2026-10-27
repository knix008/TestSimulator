// Date and time core (proleptic Gregorian calendar on millisecond counts)
// and the classic date functions: tic toc clock now date datenum datestr
// datevec weekday calendar eomday etime cputime addtodate.
import { tensor, prod, isTensor, isString, isCell, isChar, isObject, toTensor, num, str, charMatrix, cell, MError } from '../../value.js';
import { E, textArg, optArg, textList, dense } from './util.js';
import { formatNumber } from './fmt.js';

export const MS_DAY = 86400000;
export const DATENUM_EPOCH = 719529; // datenum of 1970-01-01
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Days since 1970-01-01 of a civil date (month may overflow, day may be fractional). */
export function daysFromCivil(y, m, d) {
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5);
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468 + (d - 1);
}
export function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}
export function msFromParts(y, mo, d, h = 0, mi = 0, s = 0) {
  return daysFromCivil(y, mo, d) * MS_DAY + h * 3600000 + mi * 60000 + s * 1000;
}
/** Calendar parts of a millisecond count (wall time). */
export function partsOf(ms) {
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor(ms / MS_DAY);
  let rest = ms - days * MS_DAY;
  const [y, mo, d] = civilFromDays(days);
  const h = Math.floor(rest / 3600000); rest -= h * 3600000;
  const mi = Math.floor(rest / 60000); rest -= mi * 60000;
  const s = rest / 1000;
  const wd = (((days + 4) % 7) + 7) % 7 + 1; // 1970-01-01 was a Thursday (5)
  const doy = days - daysFromCivil(y, 1, 1) + 1;
  return { y, mo, d, h, mi, s, wd, doy };
}
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const monthDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const datenumToMs = (dn) => (dn - DATENUM_EPOCH) * MS_DAY;
export const msToDatenum = (ms) => ms / MS_DAY + DATENUM_EPOCH;

/** Current local wall time in ms (as a naive date). */
export function nowLocalMs() { const t = Date.now(); return t - new Date(t).getTimezoneOffset() * 60000; }

// ------------------------------------------------------------- formatting

const pad = (x, n) => String(Math.floor(Math.abs(x))).padStart(n, '0');

/** datestr-style format (yyyy mmm dd HH MM SS FFF PM). */
export function formatDatestr(ms, fmt) {
  const p = partsOf(ms);
  if (!p) return 'NaN';
  const pm = /AM|PM/.test(fmt);
  const sec = Math.floor(p.s + 1e-9), fff = Math.round((p.s - Math.floor(p.s)) * 1000) % 1000;
  let out = '';
  for (let i = 0; i < fmt.length;) {
    const r = fmt.slice(i);
    const tok = (t) => r.startsWith(t);
    if (tok('yyyy')) { out += pad(p.y, 4); i += 4; } else if (tok('yy')) { out += pad(p.y % 100, 2); i += 2; } else if (tok('mmmm')) { out += MONTHS[p.mo - 1]; i += 4; } else if (tok('mmm')) { out += MONTHS[p.mo - 1].slice(0, 3); i += 3; } else if (tok('mm')) { out += pad(p.mo, 2); i += 2; } else if (tok('m')) { out += MONTHS[p.mo - 1][0]; i += 1; } else if (tok('dddd')) { out += DAYS[p.wd - 1]; i += 4; } else if (tok('ddd')) { out += DAYS[p.wd - 1].slice(0, 3); i += 3; } else if (tok('dd')) { out += pad(p.d, 2); i += 2; } else if (tok('d')) { out += DAYS[p.wd - 1][0]; i += 1; } else if (tok('HH')) { out += pad(pm ? ((p.h + 11) % 12) + 1 : p.h, 2); i += 2; } else if (tok('MM')) { out += pad(p.mi, 2); i += 2; } else if (tok('SS')) { out += pad(sec, 2); i += 2; } else if (tok('FFF')) { out += pad(fff, 3); i += 3; } else if (tok('AM') || tok('PM')) { out += p.h < 12 ? 'AM' : 'PM'; i += 2; } else if (tok('QQ')) { out += 'Q' + Math.ceil(p.mo / 3); i += 2; } else if (tok('YYYY')) { out += pad(p.y, 4); i += 4; } else if (tok('YY')) { out += pad(p.y % 100, 2); i += 2; } else { out += fmt[i]; i++; }
  }
  return out;
}

export const DATESTR_FORMATS = {
  0: 'dd-mmm-yyyy HH:MM:SS', 1: 'dd-mmm-yyyy', 2: 'mm/dd/yy', 3: 'mmm', 4: 'm', 5: 'mm', 6: 'mm/dd', 7: 'dd', 8: 'ddd', 9: 'd',
  10: 'yyyy', 11: 'yy', 12: 'mmmyy', 13: 'HH:MM:SS', 14: 'HH:MM:SS PM', 15: 'HH:MM', 16: 'HH:MM PM', 17: 'QQ-YY', 18: 'QQ', 19: 'dd/mm',
  20: 'dd/mm/yy', 21: 'mmm.dd,yyyy HH:MM:SS', 22: 'mmm.dd,yyyy', 23: 'mm/dd/yyyy', 24: 'dd/mm/yyyy', 25: 'yy/mm/dd', 26: 'yyyy/mm/dd',
  27: 'QQ-YYYY', 28: 'mmmyyyy', 29: 'yyyy-mm-dd', 30: 'yyyymmddTHHMMSS', 31: 'yyyy-mm-dd HH:MM:SS',
};

// ------------------------------------------------------------- parsing

const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3).toLowerCase());
function monthFromName(s) {
  const k = MONTH_ABBR.indexOf(s.slice(0, 3).toLowerCase());
  return k >= 0 ? k + 1 : NaN;
}

/**
 * Parses date text with an explicit format. style 'datestr' (yyyy mm dd HH MM SS)
 * or 'cldr' (yyyy MM dd HH mm ss). Returns ms or NaN.
 */
export function parseWithFormat(s, fmt, style) {
  const toks = style === 'cldr'
    ? [['yyyy', 'y4'], ['uuuu', 'y4'], ['yy', 'y2'], ['MMMM', 'monN'], ['MMM', 'monA'], ['MM', 'mo2'], ['M', 'mo'], ['dd', 'd2'], ['d', 'd'], ['eeee', 'wdN'], ['EEEE', 'wdN'], ['eee', 'wdA'], ['EEE', 'wdA'], ['HH', 'h2'], ['H', 'h'], ['hh', 'h12'], ['h', 'h12'], ['mm', 'mi2'], ['m', 'mi'], ['ss', 's2'], ['s', 's'], ['SSSSSSSSS', 'frac'], ['SSSSSS', 'frac'], ['SSS', 'frac'], ['SS', 'frac'], ['S', 'frac'], ['a', 'ampm'], ['XXX', 'tz'], ['xxx', 'tz'], ['Z', 'tz'], ['z', 'tzn']]
    : [['yyyy', 'y4'], ['yy', 'y2'], ['mmmm', 'monN'], ['mmm', 'monA'], ['mm', 'mo2'], ['dddd', 'wdN'], ['ddd', 'wdA'], ['dd', 'd2'], ['HH', 'h2'], ['MM', 'mi2'], ['SS', 's2'], ['FFF', 'frac'], ['PM', 'ampm'], ['AM', 'ampm']];
  const RX = {
    y4: '(\\d{4})', y2: '(\\d{2})', monN: '([A-Za-z]+)', monA: '([A-Za-z]{3})', mo2: '(\\d{1,2})', mo: '(\\d{1,2})', d2: '(\\d{1,2})', d: '(\\d{1,2})',
    wdN: '[A-Za-z]+', wdA: '[A-Za-z]{3}', h2: '(\\d{1,2})', h: '(\\d{1,2})', h12: '(\\d{1,2})', mi2: '(\\d{1,2})', mi: '(\\d{1,2})', s2: '(\\d{1,2}(?:\\.\\d*)?)', s: '(\\d{1,2})',
    frac: '(\\d+)', ampm: '([AaPp][Mm])', tz: '(Z|[+-]\\d{2}:?\\d{2})', tzn: '([A-Za-z_/+-]+)',
  };
  let re = '', kinds = [];
  for (let i = 0; i < fmt.length;) {
    if (style === 'cldr' && fmt[i] === "'") { const j = fmt.indexOf("'", i + 1); re += fmt.slice(i + 1, j < 0 ? fmt.length : j).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i = j < 0 ? fmt.length : j + 1; continue; }
    const t = toks.find(([k]) => fmt.startsWith(k, i));
    if (t) { re += RX[t[1]]; if (RX[t[1]].startsWith('(')) kinds.push(t[1]); i += t[0].length; continue; }
    re += fmt[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i++;
  }
  const m = new RegExp('^\\s*' + re + '\\s*$').exec(s);
  if (!m) return NaN;
  let y = 0, mo = 1, d = 1, h = 0, mi = 0, sec = 0, pm = null, tzOff = null;
  let hasY = false;
  kinds.forEach((k, i) => {
    const v = m[i + 1];
    switch (k) {
      case 'y4': y = +v; hasY = true; break;
      case 'y2': y = 2000 + +v; if (y > new Date().getFullYear() + 50) y -= 100; hasY = true; break;
      case 'monN': case 'monA': mo = monthFromName(v); break;
      case 'mo2': case 'mo': mo = +v; break;
      case 'd2': case 'd': d = +v; break;
      case 'h2': case 'h': case 'h12': h = +v; break;
      case 'mi2': case 'mi': mi = +v; break;
      case 's2': case 's': sec = +v; break;
      case 'frac': sec += +('0.' + v); break;
      case 'ampm': pm = v.toLowerCase() === 'pm'; break;
      case 'tz': tzOff = v === 'Z' ? 0 : (v[0] === '-' ? -1 : 1) * (+v.slice(1, 3) * 60 + +v.slice(-2)); break;
      default: break;
    }
  });
  if (!hasY) y = new Date().getFullYear();
  if (pm !== null) { if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return NaN;
  let ms = msFromParts(y, mo, d, h, mi, sec);
  if (tzOff !== null) ms -= tzOff * 60000;
  return ms;
}

const AUTO_FORMATS = [
  ['yyyy-MM-dd HH:mm:ss.SSS', 'cldr'], ["yyyy-MM-dd'T'HH:mm:ss.SSSXXX", 'cldr'], ["yyyy-MM-dd'T'HH:mm:ssXXX", 'cldr'], ["yyyy-MM-dd'T'HH:mm:ss.SSS", 'cldr'], ["yyyy-MM-dd'T'HH:mm:ss", 'cldr'],
  ['yyyy-MM-dd HH:mm:ss', 'cldr'], ['yyyy-MM-dd HH:mm', 'cldr'], ['yyyy-MM-dd', 'cldr'], ['yyyy/MM/dd HH:mm:ss', 'cldr'], ['yyyy/MM/dd', 'cldr'],
  ['dd-MMM-yyyy HH:mm:ss.SSS', 'cldr'], ['dd-MMM-yyyy HH:mm:ss', 'cldr'], ['dd-MMM-yyyy HH:mm', 'cldr'], ['dd-MMM-yyyy', 'cldr'], ['dd MMM yyyy', 'cldr'], ['MMM dd yyyy', 'cldr'], ['MMM dd, yyyy', 'cldr'],
  ['MMMM dd, yyyy', 'cldr'], ['dd MMMM yyyy', 'cldr'], ['MM/dd/yyyy HH:mm:ss', 'cldr'], ['MM/dd/yyyy', 'cldr'], ['MM/dd/yy', 'cldr'], ['HH:mm:ss', 'cldr'], ['HH:mm', 'cldr'], ['yyyyMMdd', 'cldr'],
  ['dd-MMM-yy', 'cldr'], ['MMM.dd,yyyy HH:mm:ss', 'cldr'], ['MMM.dd,yyyy', 'cldr'], ['h:mm:ss a', 'cldr'], ['h:mm a', 'cldr'],
];
/** Parses date text in common formats; returns {ms, fmt} or null. */
export function parseDateAuto(s) {
  for (const [f, st] of AUTO_FORMATS) {
    const ms = parseWithFormat(s, f, st);
    if (Number.isFinite(ms)) {
      // time-only formats are relative to today
      if (/^HH|^h:/.test(f)) { const p = partsOf(nowLocalMs()); return { ms: msFromParts(p.y, p.mo, p.d) + (ms - msFromParts(new Date().getFullYear(), 1, 1)), fmt: f }; }
      return { ms, fmt: f };
    }
  }
  return null;
}

// ------------------------------------------------------------- builtins

function datevecRows(ms) { const p = partsOf(ms); return p ? [p.y, p.mo, p.d, p.h, p.mi, p.s] : [NaN, NaN, NaN, NaN, NaN, NaN]; }

/** Datenum values (ms array) of the first argument(s) of datenum / datestr / datevec. */
function msListFrom(args, fname, ctx) {
  const a = args[0];
  if (a && a.isObject && a.cls === 'datetime') return { ms: Array.from(a.arr), dims: a.dims };
  if (isChar(a) || isString(a) || isCell(a)) {
    const list = textList(a, fname).list;
    let fmt = args.length > 1 ? textArg(args[1]) : null;
    if (fmt !== null && /^\d+$/.test(fmt)) fmt = DATESTR_FORMATS[+fmt];
    const ms = list.map((s) => {
      if (fmt) { const v = parseWithFormat(s, fmt, 'datestr'); if (Number.isFinite(v)) return v; }
      const r = parseDateAuto(s);
      if (!r) throw E(`base:${fname}:ConvertDateString`, `DATENUM failed. The date text '${s}' could not be parsed.`);
      return r.ms;
    });
    return { ms, dims: [ms.length, 1] };
  }
  const nums = args.filter((x) => isTensor(x)).map((x) => toTensor(x));
  if (nums.length >= 3) {
    const n = Math.max(...nums.map((t) => t.re.length));
    const get = (k, i) => (k < nums.length ? nums[k].re[nums[k].re.length === 1 ? 0 : i] : 0);
    const ms = []; for (let i = 0; i < n; i++) ms.push(msFromParts(get(0, i), get(1, i), get(2, i), get(3, i), get(4, i), get(5, i)));
    const big = nums.find((t) => t.re.length === n);
    return { ms, dims: big.dims };
  }
  const t = nums[0];
  if (!t) throw E(`base:${fname}:invalidInput`, 'Invalid date input.');
  if (t.dims.length === 2 && (t.dims[1] === 6 || t.dims[1] === 3) && !(t.dims[0] === 1 && t.re.every((x) => x > 1e5) && false)) {
    const looksVec = t.dims[1] === 6 ? true : t.re.slice(0, t.dims[0]).every((y) => y > 31 && y < 10000 && Number.isInteger(y));
    if (looksVec) {
      const m = t.dims[0]; const ms = [];
      for (let i = 0; i < m; i++) { const v = (j) => (j < t.dims[1] ? t.re[i + j * m] : 0); ms.push(msFromParts(v(0), v(1), v(2), v(3), v(4), v(5))); }
      return { ms, dims: [m, 1] };
    }
  }
  return { ms: Array.from(t.re, datenumToMs), dims: t.dims, isNum: true };
}

function ticFn(args, nargout, ctx) {
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1000;
  ctx.state.base_tic = t;
  if (nargout >= 1) return tensor('uint64', [1, 1], [Math.round(t)]);
  return undefined;
}
function tocFn(args, nargout, ctx) {
  const nowUs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1000;
  let start;
  if (args.length) start = toTensor(args[0]).re[0];
  else {
    start = ctx.state.base_tic;
    if (start === undefined) throw E('base:toc:callTicFirst', 'You must call TIC without an output argument before calling TOC without an input argument.');
  }
  const el = (nowUs - start) / 1e6;
  if (nargout >= 1) return num(el);
  ctx.out(`Elapsed time is ${formatNumber(el, { flags: '', width: -1, prec: 6, conv: 'f' })} seconds.\n`);
  return undefined;
}

function datestrFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:datestr:notEnoughInputs', 'Not enough input arguments.');
  const { ms, isNum } = msListFrom([args[0]], 'datestr', ctx);
  let fmt = null;
  if (args.length > 1) {
    const f = args[1];
    if (isTensor(f) && !isChar(f)) fmt = DATESTR_FORMATS[f.re[0]];
    else fmt = textArg(f);
    if (fmt === undefined) throw E('base:datestr:invalidFormat', 'Invalid date format number.');
  }
  if (!fmt) {
    const allMidnight = ms.every((x) => Number.isFinite(x) && ((x % MS_DAY) + MS_DAY) % MS_DAY < 0.5);
    fmt = allMidnight && !(isNum === undefined && false) ? DATESTR_FORMATS[1] : DATESTR_FORMATS[0];
  }
  const lines = ms.map((x) => formatDatestr(Math.round(x), fmt));
  return lines.length === 1 ? str(lines[0]) : charMatrix(lines);
}

function datevecFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:datevec:notEnoughInputs', 'Not enough input arguments.');
  const { ms } = msListFrom(args, 'datevec', ctx);
  const rows = ms.map((x) => datevecRows(Math.round(x * 1000) / 1000));
  if (nargout <= 1) {
    const m = rows.length;
    const re = new Float64Array(m * 6);
    rows.forEach((r, i) => r.forEach((v, j) => { re[i + j * m] = v; }));
    return tensor('double', [m, 6], re);
  }
  const outs = [];
  for (let j = 0; j < Math.min(nargout, 6); j++) outs.push(tensor('double', [rows.length, 1], rows.map((r) => r[j])));
  return outs;
}

function weekdayFn(args, nargout, ctx) {
  if (args.length < 1) throw E('base:weekday:notEnoughInputs', 'Not enough input arguments.');
  const { ms, dims } = msListFrom(args.slice(0, 1), 'weekday', ctx);
  const n = ms.map((x) => partsOf(x).wd);
  const N = tensor('double', dims, n);
  if (nargout < 2) return N;
  const long = args.length > 1 && optArg(args[args.length - 1]) === 'long';
  return [N, charMatrix(n.map((k) => (long ? DAYS[k - 1] : DAYS[k - 1].slice(0, 3))))];
}

function calendarFn(args, nargout, ctx) {
  let y, m;
  if (args.length >= 2) { y = toTensor(args[0]).re[0]; m = toTensor(args[1]).re[0]; } else {
    const p = partsOf(args.length === 1 ? msListFrom(args, 'calendar', ctx).ms[0] : nowLocalMs());
    y = p.y; m = p.mo;
  }
  const first = partsOf(msFromParts(y, m, 1)).wd;
  const n = monthDays(y, m);
  const re = new Float64Array(42);
  for (let d = 1; d <= n; d++) { const k = first - 1 + d - 1; const r = Math.floor(k / 7), c = k % 7; re[r + c * 6] = d; }
  const M = tensor('double', [6, 7], re);
  if (nargout >= 1) return M;
  const lines = [];
  lines.push(`${MONTHS[m - 1].slice(0, 3)} ${y}`.padStart(30));
  lines.push('     S     M    Tu     W    Th     F     S');
  for (let r = 0; r < 6; r++) { let s = ''; for (let c = 0; c < 7; c++) s += String(re[r + c * 6]).padStart(6); lines.push(s); }
  ctx.out(lines.join('\n') + '\n');
  return undefined;
}

function addtodateFn(args) {
  if (args.length < 3) throw E('base:addtodate:notEnoughInputs', 'Not enough input arguments.');
  const d = toTensor(args[0]), q = toTensor(args[1]).re[0], f = optArg(args[2]);
  const re = Float64Array.from(d.re, (dn) => {
    const ms = datenumToMs(dn);
    const p = partsOf(ms);
    const frac = ms - msFromParts(p.y, p.mo, p.d);
    switch (f) {
      case 'year': return msToDatenum(msFromParts(p.y + q, p.mo, Math.min(p.d, monthDays(p.y + q, p.mo))) + frac);
      case 'month': { const t = msFromParts(p.y, p.mo + q, 1); const pp = partsOf(t); return msToDatenum(msFromParts(pp.y, pp.mo, Math.min(p.d, monthDays(pp.y, pp.mo))) + frac); }
      case 'week': return dn + 7 * q;
      case 'day': return dn + q;
      case 'hour': return dn + q / 24;
      case 'minute': return dn + q / 1440;
      case 'second': return dn + q / 86400;
      case 'millisecond': return dn + q / 86400000;
      default: throw E('base:addtodate:invalidField', `Invalid date field '${textArg(args[2])}'.`);
    }
  });
  return tensor('double', d.dims, re);
}

export const builtins = {
  tic: ticFn,
  toc: tocFn,
  clock() { const p = partsOf(nowLocalMs()); return tensor('double', [1, 6], [p.y, p.mo, p.d, p.h, p.mi, p.s]); },
  now() { return num(msToDatenum(nowLocalMs())); },
  date() { return str(formatDatestr(nowLocalMs(), 'dd-mmm-yyyy')); },
  datenum(args, nargout, ctx) {
    if (args.length < 1) throw E('base:datenum:notEnoughInputs', 'Not enough input arguments.');
    const r = msListFrom(args, 'datenum', ctx);
    return tensor('double', r.dims, r.ms.map(msToDatenum));
  },
  datestr: datestrFn,
  datevec: datevecFn,
  weekday: weekdayFn,
  calendar: calendarFn,
  eomday(args) {
    if (args.length < 2) throw E('base:eomday:notEnoughInputs', 'Not enough input arguments.');
    const Y = toTensor(args[0]), M = toTensor(args[1]);
    const n = Math.max(Y.re.length, M.re.length);
    const out = []; for (let i = 0; i < n; i++) out.push(monthDays(Y.re[Y.re.length === 1 ? 0 : i], M.re[M.re.length === 1 ? 0 : i]));
    return tensor('double', (Y.re.length >= M.re.length ? Y : M).dims, out);
  },
  etime(args) {
    if (args.length < 2) throw E('base:etime:notEnoughInputs', 'Not enough input arguments.');
    const a = toTensor(args[0]).re, b = toTensor(args[1]).re;
    const ms = (v) => msFromParts(v[0], v[1], v[2], v[3], v[4], v[5]);
    return num((ms(a) - ms(b)) / 1000);
  },
  cputime(args, nargout, ctx) {
    if (ctx.state.base_cpu0 === undefined) ctx.state.base_cpu0 = Date.now();
    return num((Date.now() - ctx.state.base_cpu0) / 1000);
  },
  addtodate: addtodateFn,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  tic: H('Start a stopwatch timer.', '스톱워치 타이머 시작.', ['tic', 'timerVal = tic']),
  toc: H('Read elapsed time from the stopwatch.', '스톱워치 경과 시간 읽기.', ['toc', 'elapsedTime = toc', 'elapsedTime = toc(timerVal)']),
  clock: H('Current date and time as a date vector.', '현재 날짜와 시간 (날짜 벡터).', ['c = clock']),
  now: H('Current date and time as a serial date number.', '현재 날짜와 시간 (일련 날짜 번호).', ['t = now']),
  date: H("Current date as text 'dd-mmm-yyyy'.", "현재 날짜 텍스트 'dd-mmm-yyyy'.", ['c = date']),
  datenum: H('Convert date and time to a serial date number.', '날짜와 시간을 일련 날짜 번호로 변환.', ['DateNumber = datenum(t)', 'DateNumber = datenum(DateString)', 'DateNumber = datenum(DateString, formatIn)', 'DateNumber = datenum(Y, M, D)', 'DateNumber = datenum(Y, M, D, H, MN, S)']),
  datestr: H('Convert date and time to text.', '날짜와 시간을 텍스트로 변환.', ['DateString = datestr(t)', 'DateString = datestr(DateVector)', 'DateString = datestr(t, formatOut)']),
  datevec: H('Convert date and time to vector of components.', '날짜와 시간을 구성요소 벡터로 변환.', ['DateVector = datevec(t)', 'DateVector = datevec(DateString)', '[Y, M, D, H, MN, S] = datevec(...)']),
  weekday: H('Day of the week (Sunday = 1).', '요일 (일요일 = 1).', ['[DayNumber, DayName] = weekday(D)', "[DayNumber, DayName] = weekday(D, 'long')"]),
  calendar: H('Calendar for a month.', '달력.', ['calendar', 'c = calendar(y, m)']),
  eomday: H('Last day of month.', '월의 마지막 날.', ['E = eomday(y, m)']),
  etime: H('Time elapsed between date vectors.', '날짜 벡터 사이의 경과 시간.', ['e = etime(t1, t0)']),
  cputime: H('Elapsed CPU time in seconds.', '경과 CPU 시간(초).', ['t = cputime']),
  addtodate: H('Modify a date number by a field.', '필드 단위로 날짜 번호 변경.', ["R = addtodate(D, q, 'month')"]),
};
void prod; void cell; void isObject; void dense; void MError;
