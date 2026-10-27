// datetime, duration and calendarDuration value classes. Elements are
// millisecond counts in `arr` (datetime: wall time for unzoned values, UTC
// instants when a TimeZone is set; duration: length in ms;
// calendarDuration: months in arr, days in arr2, ms in arr3).
import {
  tensor, normDims, prod, isTensor, isString, isCell, isChar, isObject, toTensor, num, bool, str, cell,
  stringArray, charMatrix, object, MError,
} from '../../value.js';
import { E, textArg, optArg, textList, dense, gather, resolveIndex, firstNonSingleton, splitDims, dimsWith } from './util.js';
import { arrObj, objIndex, objAssign, objDelete, objCat, dotName, pairIdx, nel } from './objarr.js';
import {
  MS_DAY, MONTHS, DAYS, msFromParts, partsOf, monthDays, datenumToMs, msToDatenum, nowLocalMs, parseWithFormat,
  parseDateAuto, daysFromCivil,
} from './time.js';
import { formatNumber, num2strScalar } from './fmt.js';
import { sizeStr } from './display.js';
import { builtins as DATAFUN } from './datafun.js';
import { builtins as ELMAT } from './elmat.js';
import { builtins as SETS } from './sets.js';

const NUMERIC_FNS = { ...DATAFUN, ...ELMAT, ...SETS };

const DEF_DATE = 'dd-MMM-uuuu', DEF_DATETIME = 'dd-MMM-uuuu HH:mm:ss';

// ------------------------------------------------------------- time zones

function tzOffsetMin(tz, utcMs) {
  if (!tz) return 0;
  const t = tz.toUpperCase();
  if (t === 'UTC' || t === 'GMT' || t === 'Z' || t === 'UTCLEAPSECONDS') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
  if (m) return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  if (t === 'LOCAL') return -new Date(utcMs).getTimezoneOffset();
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const parts = Object.fromEntries(f.formatToParts(new Date(Math.floor(utcMs / 1000) * 1000)).map((p) => [p.type, p.value]));
    const wall = msFromParts(+parts.year, +parts.month, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return Math.round((wall - Math.floor(utcMs / 1000) * 1000) / 60000);
  } catch (e) {
    throw E('base:datetime:UnknownTimeZone', `Unknown time zone '${tz}'.`);
  }
}
function checkTz(tz) { if (tz) tzOffsetMin(tz, Date.now()); return tz; }
/** Wall-clock ms of element i. */
const wallOf = (o, ms) => (o.props.TimeZone ? ms + tzOffsetMin(o.props.TimeZone, ms) * 60000 : ms);
/** UTC instant from wall-clock ms in zone tz. */
function utcFromWall(tz, wall) {
  if (!tz) return wall;
  let u = wall - tzOffsetMin(tz, wall) * 60000;
  u = wall - tzOffsetMin(tz, u) * 60000;
  return u;
}

// ------------------------------------------------------------- CLDR formatting

const pad = (x, n) => String(Math.floor(Math.abs(x))).padStart(n, '0');
function tzText(o, ms, kind) {
  const tz = o.props.TimeZone;
  const off = tz ? tzOffsetMin(tz, ms) : 0;
  const sign = off < 0 ? '-' : '+';
  const hh = pad(Math.floor(Math.abs(off) / 60), 2), mm = pad(Math.abs(off) % 60, 2);
  if (kind === 'z') return tz ? (tz.toUpperCase() === 'UTC' ? 'UTC' : off === 0 ? 'GMT' : `GMT${sign}${+hh}${mm !== '00' ? ':' + mm : ''}`) : '';
  if (kind === 'Z') return `${sign}${hh}${mm}`;
  if (kind === 'X' && off === 0) return 'Z';
  return `${sign}${hh}:${mm}`;
}
export function formatDT(o, ms, fmt) {
  if (!Number.isFinite(ms)) return 'NaT';
  const w = wallOf(o, ms);
  const p = partsOf(w);
  let out = '';
  for (let i = 0; i < fmt.length;) {
    const c = fmt[i];
    if (c === "'") {
      const j = fmt.indexOf("'", i + 1);
      if (j === i + 1) { out += "'"; i += 2; continue; }
      out += fmt.slice(i + 1, j < 0 ? fmt.length : j); i = j < 0 ? fmt.length : j + 1; continue;
    }
    if (!/[A-Za-z]/.test(c)) { out += c; i++; continue; }
    let n = 1; while (fmt[i + n] === c) n++;
    i += n;
    switch (c) {
      case 'y': case 'u': out += n === 2 ? pad(p.y % 100, 2) : pad(p.y, Math.max(n, 1)); break;
      case 'Q': out += n >= 3 ? `Q${Math.ceil(p.mo / 3)}` : String(Math.ceil(p.mo / 3)); break;
      case 'M': case 'L': out += n >= 4 ? MONTHS[p.mo - 1] : n === 3 ? MONTHS[p.mo - 1].slice(0, 3) : n === 2 ? pad(p.mo, 2) : String(p.mo); break;
      case 'd': out += n >= 2 ? pad(p.d, 2) : String(p.d); break;
      case 'D': out += pad(p.doy, n); break;
      case 'e': case 'E': case 'c': out += n >= 4 ? DAYS[p.wd - 1] : n === 3 || c === 'E' ? DAYS[p.wd - 1].slice(0, 3) : String(p.wd); break;
      case 'a': out += p.h < 12 ? 'AM' : 'PM'; break;
      case 'h': { const h = ((p.h + 11) % 12) + 1; out += n >= 2 ? pad(h, 2) : String(h); break; }
      case 'H': out += n >= 2 ? pad(p.h, 2) : String(p.h); break;
      case 'k': out += pad(p.h === 0 ? 24 : p.h, n); break;
      case 'm': out += n >= 2 ? pad(p.mi, 2) : String(p.mi); break;
      case 's': out += n >= 2 ? pad(Math.floor(p.s + 1e-9), 2) : String(Math.floor(p.s + 1e-9)); break;
      case 'S': { const frac = p.s - Math.floor(p.s + 1e-9); out += String(Math.floor(Math.max(0, frac) * 10 ** n + 1e-6)).padStart(n, '0').slice(0, n); break; }
      case 'z': out += tzText(o, ms, 'z'); break;
      case 'Z': out += tzText(o, ms, 'Z'); break;
      case 'x': out += tzText(o, ms, 'x'); break;
      case 'X': out += tzText(o, ms, 'X'); break;
      case 'G': out += p.y > 0 ? 'CE' : 'BCE'; break;
      default: out += c.repeat(n);
    }
  }
  return out;
}
const dtFormat = (o) => o.props.Format || (Array.from(o.arr).every((ms) => !Number.isFinite(ms) || ((wallOf(o, ms) % MS_DAY) + MS_DAY) % MS_DAY === 0) ? DEF_DATE : DEF_DATETIME);

// ------------------------------------------------------------- construction

export function makeDT(dims, arr, fmt = '', tz = '') {
  return arrObj('datetime', dims, arr instanceof Float64Array ? arr : Float64Array.from(arr), { Format: fmt, TimeZone: tz });
}
export function makeDur(dims, arr, fmt = 'hh:mm:ss') {
  return arrObj('duration', dims, arr instanceof Float64Array ? arr : Float64Array.from(arr), { Format: fmt });
}
export function makeCalDur(dims, months, days, ms) {
  const n = prod(normDims(dims));
  const f = (a) => (a instanceof Float64Array ? a : Float64Array.from(a.length === 1 && n !== 1 ? new Array(n).fill(a[0]) : a));
  return arrObj('calendarDuration', dims, f(months), { Format: 'ymdt' }, { arr2: f(days), arr3: f(ms) });
}
const isDT = (v) => v && v.isObject && v.cls === 'datetime';
const isDur = (v) => v && v.isObject && v.cls === 'duration';
const isCal = (v) => v && v.isObject && v.cls === 'calendarDuration';

function nvOpts(args, start, allowed) {
  const m = new Map();
  for (let i = start; i + 1 < args.length; i += 2) {
    const k = optArg(args[i]);
    if (k === null) break;
    const hit = allowed.find((a) => a.toLowerCase() === k);
    if (!hit) throw E('base:datetime:unknownParameter', `Invalid parameter name '${textArg(args[i])}'.`);
    m.set(hit, args[i + 1]);
  }
  return m;
}

function datetimeFn(args, nargout, ctx) {
  const PARAMS = ['Format', 'InputFormat', 'TimeZone', 'ConvertFrom', 'Locale', 'PivotYear', 'Epoch', 'TicksPerSecond'];
  // split positional args from trailing name-value pairs
  let k = args.length;
  for (let i = 0; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s !== null && PARAMS.some((p) => p.toLowerCase() === s) && i + 1 < args.length) { k = i; break; }
  }
  const pos = args.slice(0, k);
  const nv = nvOpts(args, k, PARAMS);
  let fmt = nv.has('Format') ? textArg(nv.get('Format')) : '';
  if (fmt && fmt.toLowerCase() === 'default') fmt = '';
  if (fmt && fmt.toLowerCase() === 'preserveinput') fmt = '';
  const tz = nv.has('TimeZone') ? checkTz(textArg(nv.get('TimeZone')) || '') : '';
  const finish = (dims, wallArr, isUtc = false) => {
    const arr = Float64Array.from(wallArr, (w) => (isUtc ? w : utcFromWall(tz, w)));
    return makeDT(dims, arr, fmt, tz);
  };
  if (pos.length === 0) {
    if (tz) return makeDT([1, 1], [Date.now()], fmt || DEF_DATETIME, tz);
    return makeDT([1, 1], [nowLocalMs()], fmt || DEF_DATETIME);
  }
  if (nv.has('ConvertFrom')) {
    const how = optArg(nv.get('ConvertFrom'));
    const t = toTensor(pos[0]);
    let f;
    switch (how) {
      case 'datenum': f = datenumToMs; break;
      case 'posixtime': f = (x) => x * 1000; break;
      case 'excel': case 'excel1900': f = (x) => datenumToMs(x + 693960); break;
      case 'excel1904': f = (x) => datenumToMs(x + 695422); break;
      case 'juliandate': f = (x) => (x - 2440587.5) * MS_DAY; break;
      case 'modifiedjuliandate': f = (x) => (x - 40587) * MS_DAY; break;
      case 'yyyymmdd': f = (x) => msFromParts(Math.floor(x / 10000), Math.floor((x % 10000) / 100), x % 100); break;
      case 'epochtime': {
        const ep = nv.has('Epoch') ? datetimeFn([nv.get('Epoch')], 1, ctx).arr[0] : 0;
        const tps = nv.has('TicksPerSecond') ? toTensor(nv.get('TicksPerSecond')).re[0] : 1;
        f = (x) => ep + (x / tps) * 1000; break;
      }
      default: throw E('base:datetime:invalidConvertFrom', `Invalid 'ConvertFrom' value '${textArg(nv.get('ConvertFrom'))}'.`);
    }
    const wall = Array.from(t.re, f);
    if (how === 'posixtime' && tz) return makeDT(t.dims, wall, fmt, tz);
    return finish(t.dims, wall);
  }
  const a = pos[0];
  if (isDT(a)) {
    let o = a;
    if (fmt) o = { ...o, props: { ...o.props, Format: fmt } };
    if (nv.has('TimeZone')) o = setTimeZone(o, tz);
    return o;
  }
  if (isChar(a) || isString(a) || isCell(a)) {
    const T = textList(a, 'datetime');
    const infmt = nv.has('InputFormat') ? textArg(nv.get('InputFormat')) : null;
    let usedFmt = null;
    const wall = T.list.map((s) => {
      if (s == null) return NaN;
      const low = s.trim().toLowerCase();
      const today = Math.floor(nowLocalMs() / MS_DAY) * MS_DAY;
      if (low === 'now') { usedFmt = DEF_DATETIME; return tz ? NaN : nowLocalMs(); }
      if (low === 'today') return today;
      if (low === 'tomorrow') return today + MS_DAY;
      if (low === 'yesterday') return today - MS_DAY;
      if (low === '' || low === 'nat') return NaN;
      if (infmt) { const v = parseWithFormat(s, infmt, 'cldr'); if (!Number.isFinite(v)) throw E('base:datetime:ParseErr', `Unable to convert '${s}' to datetime using the format '${infmt}'.`); return v; }
      const r = parseDateAuto(s);
      if (!r) throw E('base:datetime:ParseErr', `Could not recognize the date/time format of '${s}'. You can specify a format using the 'InputFormat' parameter.`);
      if (!usedFmt) usedFmt = /HH|h:/.test(r.fmt) ? DEF_DATETIME : DEF_DATE;
      return r.ms;
    });
    if (T.list.length === 1 && T.list[0] && T.list[0].trim().toLowerCase() === 'now' && tz) return makeDT([1, 1], [Date.now()], fmt || DEF_DATETIME, tz);
    if (!fmt && infmt) fmt = infmt;
    if (!fmt && usedFmt === DEF_DATETIME) fmt = DEF_DATETIME;
    return finish(T.kind === 'char' ? [1, 1] : T.dims, wall);
  }
  const ts = pos.map((x) => toTensor(x));
  if (ts.length === 1) {
    const t = ts[0];
    const m = t.dims[0], c = t.dims[1];
    if (c !== 3 && c !== 6) throw E('base:datetime:InvalidNumericData', 'Numeric input data must be a matrix with three or six columns, or else three, six, or seven separate numeric arrays.');
    const wall = [];
    for (let i = 0; i < m; i++) { const v = (j) => (j < c ? t.re[i + j * m] : 0); wall.push(msFromParts(v(0), v(1), v(2), v(3), v(4), v(5))); }
    return finish([m, 1], wall);
  }
  if (ts.length !== 3 && ts.length !== 6 && ts.length !== 7) throw E('base:datetime:InvalidNumericData', 'Numeric input data must be a matrix with three or six columns, or else three, six, or seven separate numeric arrays.');
  const n = Math.max(...ts.map((t) => t.re.length));
  const big = ts.find((t) => t.re.length === n);
  const g = (j, i) => (j < ts.length ? ts[j].re[ts[j].re.length === 1 ? 0 : i] : 0);
  const wall = [];
  for (let i = 0; i < n; i++) wall.push(msFromParts(g(0, i), g(1, i), g(2, i), g(3, i), g(4, i), g(5, i) + g(6, i) / 1000));
  if (!fmt && ts.length === 7) fmt = 'dd-MMM-uuuu HH:mm:ss.SSS';
  return finish(big.dims, wall);
}

function setTimeZone(o, tz) {
  checkTz(tz);
  const old = o.props.TimeZone;
  if (old === tz) return o;
  let arr;
  if (!old) arr = Float64Array.from(o.arr, (w) => utcFromWall(tz, w));
  else if (!tz) arr = Float64Array.from(o.arr, (u) => wallOf(o, u));
  else arr = Float64Array.from(o.arr);
  return { ...o, arr, props: { ...o.props, TimeZone: tz } };
}

// ------------------------------------------------------------- operand conversion

function dtOperand(v, like, ctx) {
  if (isDT(v)) return v;
  if (isChar(v) || isString(v) || isCell(v)) {
    const d = datetimeFn([v], 1, ctx);
    if (like && like.props.TimeZone) return setTimeZone(d, like.props.TimeZone);
    return d;
  }
  throw E('base:datetime:invalidComparison', `Comparison is not defined between datetime and ${v.cls} arrays.`);
}
function durOperand(v, what = 'duration') {
  if (isDur(v)) return v;
  if (isTensor(v) && !isChar(v)) { const t = toTensor(v); return makeDur(t.dims, Float64Array.from(t.re, (x) => x * MS_DAY)); }
  if (isChar(v) || isString(v)) {
    const s = textArg(v);
    const m = /^\s*(-)?(?:(\d+):)?(\d+):(\d+)(?::(\d+(?:\.\d*)?))?\s*$/.exec(s);
    if (m) {
      const parts = [m[2], m[3], m[4], m[5]].filter((x) => x !== undefined).map(Number);
      let ms;
      if (parts.length === 4) ms = ((parts[0] * 24 + parts[1]) * 60 + parts[2]) * 60000 + parts[3] * 1000;
      else ms = (parts[0] * 60 + parts[1]) * 60000 + (parts[2] || 0) * 1000;
      return makeDur([1, 1], [m[1] ? -ms : ms]);
    }
  }
  throw E('base:duration:invalidOperand', `Operation is not defined between ${what} and ${v.cls} arrays.`);
}

// ------------------------------------------------------------- calendar arithmetic

function addCal(o, cal, sign) {
  const pi = pairIdx(nel(o), nel(cal), o.dims, cal.dims);
  const arr = new Float64Array(pi.n);
  for (let q = 0; q < pi.n; q++) {
    const u = o.arr[pi.ia(q)];
    if (!Number.isFinite(u)) { arr[q] = NaN; continue; }
    const w = wallOf(o, u);
    const p = partsOf(w);
    const tod = w - msFromParts(p.y, p.mo, p.d);
    const mon = sign * cal.arr[pi.ib(q)], days = sign * cal.arr2[pi.ib(q)], ms = sign * cal.arr3[pi.ib(q)];
    const tm = msFromParts(p.y, p.mo + mon, 1);
    const pp = partsOf(tm);
    const d = Math.min(p.d, monthDays(pp.y, pp.mo));
    const wall = msFromParts(pp.y, pp.mo, d) + days * MS_DAY + tod;
    arr[q] = utcFromWall(o.props.TimeZone, wall) + ms;
  }
  return { ...o, dims: normDims(pi.dims), arr };
}

function mapPair(a, b, f) {
  const pi = pairIdx(a.arr.length, b.arr.length, a.dims, b.dims);
  const out = new Float64Array(pi.n);
  for (let q = 0; q < pi.n; q++) out[q] = f(a.arr[pi.ia(q)], b.arr[pi.ib(q)]);
  return { out, dims: normDims(pi.dims) };
}
function compare(name, a, b) {
  const f = { eq: (x, y) => x === y, ne: (x, y) => x !== y, lt: (x, y) => x < y, gt: (x, y) => x > y, le: (x, y) => x <= y, ge: (x, y) => x >= y }[name];
  const r = mapPair(a, b, (x, y) => (f(x, y) ? 1 : 0));
  return { cls: 'logical', dims: r.dims, re: r.out, im: null };
}

/** Wraps a numeric builtin over the ms values of a datetime/duration array. */
function viaNumeric(name, wrapOut) {
  return (args, nargout, ctx) => {
    const o = args.find((a) => a && a.isObject);
    const conv = args.map((a) => (a && a.isObject && a.cls === o.cls ? { cls: 'double', dims: a.dims, re: Float64Array.from(a.arr), im: null } : a));
    const fn = NUMERIC_FNS[name];
    if (!fn) throw E(`base:${o.cls}:${name}`, `Function '${name}' is not available.`);
    const r = fn(conv, nargout, ctx);
    const wrap = (v, k) => (k === 0 && v && isTensor(v) ? wrapOut(o, v) : v);
    return Array.isArray(r) ? r.map(wrap) : wrap(r, 0);
  };
}
const asSame = (o, t) => ({ ...o, dims: t.dims, arr: Float64Array.from(t.re) });

// ------------------------------------------------------------- display

function arrDisplay(o, name, ctx, opts, texts, label) {
  const loose = !(opts && opts.compact);
  const n = texts.length;
  const d = o.dims;
  let body;
  if (n === 0) body = `  ${sizeStr(d)} empty ${label} array`;
  else if (n === 1) body = (opts && opts.disp ? '' : `  ${label}\n${loose ? '\n' : ''}`) + `   ${texts[0]}`;
  else {
    const m = d[0], cols = n / m;
    const w = Math.max(...texts.map((t) => t.length));
    const rows = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < cols; j++) s += '   ' + texts[i + j * m].padStart(w); rows.push(s); }
    body = (opts && opts.disp ? '' : `  ${sizeStr(d)} ${label} array\n${loose ? '\n' : ''}`) + rows.join('\n');
  }
  if (opts && opts.disp) return body + '\n';
  if (!name) return body + '\n';
  return loose ? `${name} = \n\n${body}\n\n` : `${name} = \n${body}\n`;
}

// ------------------------------------------------------------- duration text

function durText(ms, fmt) {
  if (!Number.isFinite(ms)) return ms !== ms ? 'NaN' : ms > 0 ? 'Inf' : '-Inf';
  const unit = { y: [365.2425 * MS_DAY, 'yr', 'yrs'], d: [MS_DAY, 'day', 'days'], h: [3600000, 'hr', 'hr'], m: [60000, 'min', 'min'], s: [1000, 'sec', 'sec'] }[fmt];
  if (unit) { const v = ms / unit[0]; return `${num2strScalar(+v.toPrecision(5))} ${Math.abs(v) === 1 ? unit[1] : unit[2]}`; }
  const neg = ms < 0; let a = Math.abs(ms);
  const fracM = /\.(S+)$/.exec(fmt);
  const fd = fracM ? fracM[1].length : 0;
  const parts = fmt.replace(/\.S+$/, '').split(':');
  const units = { dd: MS_DAY, hh: 3600000, mm: 60000, ss: 1000 };
  const out = [];
  if (fd === 0) a = Math.round(a / 1000) * 1000;
  parts.forEach((p, i) => {
    const u = units[p];
    if (i === parts.length - 1) {
      const v = a / u;
      if (p === 'ss' && fd) { const s = formatNumber(v, { flags: '', width: -1, prec: fd, conv: 'f' }); out.push(s.padStart(3 + fd, '0')); } else out.push(pad(Math.floor(v + 1e-9), 2));
    } else { const v = Math.floor(a / u + 1e-9); out.push(pad(v, 2)); a -= v * u; }
  });
  return (neg ? '-' : '') + out.join(':');
}

function calText(o, i) {
  const mo = o.arr[i], d = o.arr2[i], ms = o.arr3[i];
  if (!Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(ms)) return 'NaN';
  const parts = [];
  const y = Math.trunc(mo / 12), m = mo - y * 12;
  if (y) parts.push(`${y}y`);
  if (m) parts.push(`${m}mo`);
  if (d) parts.push(`${d}d`);
  if (ms) parts.push(durText(ms, 'hh:mm:ss'));
  return parts.length ? parts.join(' ') : '0d';
}

// ------------------------------------------------------------- common class pieces

function makeSubsref(getProp) {
  return (obj, subs, nargout, ctx) => {
    let v = obj;
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      if (!(v && v.isObject && (v.cls === obj.cls))) {
        // continue indexing into a plain value through the interpreter-free helpers
        if (s.type === '()' && isTensor(v)) { const r = resolveIndex(v.dims, s.subs); v = gather(v, r.idx, r.dims); continue; }
        throw E('base:index:unsupported', 'Unsupported indexing.');
      }
      if (s.type === '()') v = objIndex(v, s.subs);
      else if (s.type === '.') v = getProp(v, dotName(s), ctx);
      else throw E(`base:${obj.cls}:braceIndex`, `Brace indexing is not supported for variables of this type.`);
    }
    return [v];
  };
}

// ------------------------------------------------------------- datetime class

function dtComponent(o, name) {
  const vals = Array.from(o.arr, (u) => {
    if (!Number.isFinite(u)) return NaN;
    const p = partsOf(wallOf(o, u));
    switch (name) {
      case 'Year': return p.y; case 'Month': return p.mo; case 'Day': return p.d;
      case 'Hour': return p.h; case 'Minute': return p.mi; case 'Second': return p.s;
      default: return NaN;
    }
  });
  return tensor('double', o.dims, vals);
}
function dtGet(o, name) {
  switch (name) {
    case 'Year': case 'Month': case 'Day': case 'Hour': case 'Minute': case 'Second': return dtComponent(o, name);
    case 'Format': return str(dtFormat(o));
    case 'TimeZone': return str(o.props.TimeZone || '');
    case 'SystemTimeZone': return str(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    default: throw E('base:datetime:noProperty', `Unrecognized method, property, or field '${name}' for class 'datetime'.`);
  }
}
function dtSetComponent(o, name, rhs) {
  const t = toTensor(rhs);
  const arr = Float64Array.from(o.arr, (u, i) => {
    const p = partsOf(wallOf(o, u));
    if (!p) return u;
    const v = t.re[t.re.length === 1 ? 0 : i];
    const q = { y: p.y, mo: p.mo, d: p.d, h: p.h, mi: p.mi, s: p.s };
    q[{ Year: 'y', Month: 'mo', Day: 'd', Hour: 'h', Minute: 'mi', Second: 's' }[name]] = v;
    return utcFromWall(o.props.TimeZone, msFromParts(q.y, q.mo, q.d, q.h, q.mi, q.s));
  });
  return { ...o, arr };
}

function dtConvert(v, like, ctx) {
  if (isDT(v)) return like && like.props.TimeZone !== v.props.TimeZone ? setTimeZone(v, like.props.TimeZone) : v;
  if (isTensor(v) && v.re.length === 0) return makeDT([0, 0], []);
  return dtOperand(v, like, ctx);
}

const dtMethods = {
  plus(args, nargout, ctx) {
    let [a, b] = args;
    if (!isDT(a)) [a, b] = [b, a];
    if (isDT(b)) throw E('base:datetime:DatetimeAddition', 'Addition is not defined between datetime arrays.');
    if (isCal(b)) return addCal(a, b, 1);
    const d = durOperand(b, 'datetime');
    const r = mapPair(a, d, (x, y) => x + y);
    return { ...a, dims: r.dims, arr: r.out };
  },
  minus(args, nargout, ctx) {
    const [a, b] = args;
    if (!isDT(a)) throw E('base:datetime:SubtractionNotDefined', 'Subtraction is not defined for a duration minus a datetime.');
    if (isDT(b) || isChar(b) || isString(b)) {
      const bb = dtOperand(b, a, ctx);
      const r = mapPair(a, bb, (x, y) => x - y);
      return makeDur(r.dims, r.out);
    }
    if (isCal(b)) return addCal(a, b, -1);
    const d = durOperand(b, 'datetime');
    const r = mapPair(a, d, (x, y) => x - y);
    return { ...a, dims: r.dims, arr: r.out };
  },
  colon(args, nargout, ctx) {
    const a = args[0], b = args[args.length - 1];
    const step = args.length === 3 ? args[1] : makeDur([1, 1], [MS_DAY]);
    const out = [];
    if (isCal(step)) {
      let k = 0;
      for (;;) { const c = makeCalDur([1, 1], [step.arr[0] * k], [step.arr2[0] * k], [step.arr3[0] * k]); const v = addCal(a, c, 1).arr[0]; if (v > b.arr[0] + 1e-6 || k > 1e6) break; out.push(v); k++; }
    } else {
      const s = durOperand(step).arr[0];
      if (s === 0) return makeDT([1, 0], [], a.props.Format, a.props.TimeZone);
      const n = Math.floor((b.arr[0] - a.arr[0]) / s + 1e-9) + 1;
      for (let k = 0; k < n; k++) out.push(a.arr[0] + k * s);
    }
    return { ...a, dims: [1, out.length], arr: Float64Array.from(out) };
  },
  eq: (args, n, ctx) => compare('eq', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  ne: (args, n, ctx) => compare('ne', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  lt: (args, n, ctx) => compare('lt', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  gt: (args, n, ctx) => compare('gt', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  le: (args, n, ctx) => compare('le', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  ge: (args, n, ctx) => compare('ge', dtConvert(args[0], null, ctx), dtConvert(args[1], null, ctx)),
  sort: viaNumeric('sort', asSame),
  min: viaNumeric('min', asSame),
  max: viaNumeric('max', asSame),
  bounds: viaNumeric('bounds', asSame),
  cummax: viaNumeric('cummax', asSame),
  cummin: viaNumeric('cummin', asSame),
  mean: viaNumeric('mean', asSame),
  median: viaNumeric('median', asSame),
  mode: viaNumeric('mode', asSame),
  unique: viaNumeric('unique', asSame),
  issorted: viaNumeric('issorted', (o, t) => t),
  diff(args, nargout, ctx) { const o = args[0]; const r = viaNumeric('diff', (oo, t) => t)(args, 1, ctx); return makeDur(r.dims, r.re); },
  range(args, nargout, ctx) { const r = viaNumeric('range', (oo, t) => t)(args, 1, ctx); return makeDur(r.dims, r.re); },
  isnan: (args) => ({ cls: 'logical', dims: args[0].dims, re: Float64Array.from(args[0].arr, (x) => (x !== x ? 1 : 0)), im: null }),
  ismember(args, nargout, ctx) {
    const a = dtConvert(args[0], null, ctx), b = dtConvert(args[1], a, ctx);
    const fn = SETS.ismember;
    return fn([{ cls: 'double', dims: a.dims, re: Float64Array.from(a.arr), im: null }, { cls: 'double', dims: b.dims, re: Float64Array.from(b.arr), im: null }], nargout, ctx);
  },
  string(args) {
    const o = args[0];
    const f = args.length > 1 ? textArg(args[1]) : dtFormat(o);
    return stringArray(o.dims, Array.from(o.arr, (u) => (Number.isFinite(u) ? formatDT(o, u, f) : null)));
  },
  char(args) {
    const o = args[0];
    const f = args.length > 1 ? textArg(args[1]) : dtFormat(o);
    const lines = Array.from(o.arr, (u) => formatDT(o, u, f));
    return lines.length === 1 ? str(lines[0]) : charMatrix(lines);
  },
  cellstr(args) {
    const o = args[0];
    const f = args.length > 1 ? textArg(args[1]) : dtFormat(o);
    return cell(o.dims, Array.from(o.arr, (u) => str(formatDT(o, u, f))));
  },
  double() { throw E('base:datetime:DoubleConversion', 'Converting a datetime to double is not supported. Use datenum or posixtime instead.'); },
};

const datetimeClass = {
  props: ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Second', 'Format', 'TimeZone', 'SystemTimeZone'],
  construct: (args, ctx) => datetimeFn(args, 1, ctx),
  methods: dtMethods,
  subsref: makeSubsref((o, name) => dtGet(o, name)),
  subsasgn(obj, subs, rhs, ctx) {
    const s0 = subs[0];
    if (s0.type === '.') {
      const name = dotName(s0);
      if (subs.length > 1) {
        const comp = dtGet(obj, name);
        const r = resolveIndex(obj.dims, subs[1].subs);
        const re = Float64Array.from(comp.re); const t = toTensor(rhs);
        r.idx.forEach((ix, q) => { re[ix] = t.re[t.re.length === 1 ? 0 : q]; });
        return dtSetComponent(obj, name, tensor('double', obj.dims, re));
      }
      if (name === 'Format') return { ...obj, props: { ...obj.props, Format: textArg(rhs) === 'default' ? '' : textArg(rhs) } };
      if (name === 'TimeZone') return setTimeZone(obj, textArg(rhs) || '');
      if (['Year', 'Month', 'Day', 'Hour', 'Minute', 'Second'].includes(name)) return dtSetComponent(obj, name, rhs);
      throw E('base:datetime:noProperty', `Unrecognized property '${name}' for class 'datetime'.`);
    }
    if (s0.type !== '()') throw E('base:datetime:braceAssign', 'Brace indexing is not supported for datetime arrays.');
    if (isTensor(rhs) && rhs.re.length === 0 && !isChar(rhs)) return objDelete(obj, s0.subs);
    const val = dtConvert(rhs, obj, ctx);
    return objAssign(obj, s0.subs, val, NaN);
  },
  cat(k, items, ctx) {
    const first = items.find(isDT);
    const conv = items.filter((v) => !(isTensor(v) && v.re.length === 0 && !isChar(v))).map((v) => dtConvert(v, first, ctx));
    return objCat(k, conv, first);
  },
  display(o, name, ctx, opts) { const f = dtFormat(o); return arrDisplay(o, name, ctx, opts, Array.from(o.arr, (u) => formatDT(o, u, f)), 'datetime'); },
  inlineText(o) { return nel(o) === 1 ? formatDT(o, o.arr[0], dtFormat(o)) : null; },
};

// ------------------------------------------------------------- duration class

function durGet(o, name) {
  if (name === 'Format') return str(o.props.Format);
  throw E('base:duration:noProperty', `Unrecognized method, property, or field '${name}' for class 'duration'.`);
}
const unitScale = { years: 365.2425 * MS_DAY, days: MS_DAY, hours: 3600000, minutes: 60000, seconds: 1000, milliseconds: 1 };

const durMethods = {
  plus(args, nargout, ctx) {
    let [a, b] = args;
    if (isDT(b)) return dtMethods.plus([b, a], nargout, ctx);
    if (isCal(a) || isCal(b)) return calMethods.plus(args, nargout, ctx);
    const A = durOperand(a), B = durOperand(b);
    const r = mapPair(A, B, (x, y) => x + y);
    return makeDur(r.dims, r.out, (isDur(a) ? a : b).props.Format);
  },
  minus(args, nargout, ctx) {
    const [a, b] = args;
    if (isDT(b)) throw E('base:duration:SubtractionNotDefined', 'Subtraction is not defined for a duration minus a datetime.');
    const A = durOperand(a), B = durOperand(b);
    const r = mapPair(A, B, (x, y) => x - y);
    return makeDur(r.dims, r.out, (isDur(a) ? a : b).props.Format);
  },
  uminus(args) { const o = args[0]; return { ...o, arr: Float64Array.from(o.arr, (x) => -x) }; },
  uplus(args) { return args[0]; },
  times(args) {
    const [a, b] = args;
    if (isDur(a) && isDur(b)) throw E('base:duration:DurationMultiplication', 'Multiplication is not defined between two duration arrays.');
    const o = isDur(a) ? a : b, t = toTensor(isDur(a) ? b : a);
    const pi = pairIdx(o.arr.length, t.re.length, o.dims, t.dims);
    const arr = new Float64Array(pi.n); for (let q = 0; q < pi.n; q++) arr[q] = o.arr[pi.ia(q)] * t.re[pi.ib(q)];
    return makeDur(pi.dims, arr, o.props.Format);
  },
  rdivide(args) {
    const [a, b] = args;
    if (isDur(a) && isDur(b)) { const r = mapPair(a, b, (x, y) => x / y); return tensor('double', r.dims, r.out); }
    if (!isDur(a)) throw E('base:duration:DivisionNotDefined', 'Division of a number by a duration is not defined.');
    const t = toTensor(b);
    const pi = pairIdx(a.arr.length, t.re.length, a.dims, t.dims);
    const arr = new Float64Array(pi.n); for (let q = 0; q < pi.n; q++) arr[q] = a.arr[pi.ia(q)] / t.re[pi.ib(q)];
    return makeDur(pi.dims, arr, a.props.Format);
  },
  eq: (args) => compare('eq', durOperand(args[0]), durOperand(args[1])),
  ne: (args) => compare('ne', durOperand(args[0]), durOperand(args[1])),
  lt: (args) => compare('lt', durOperand(args[0]), durOperand(args[1])),
  gt: (args) => compare('gt', durOperand(args[0]), durOperand(args[1])),
  le: (args) => compare('le', durOperand(args[0]), durOperand(args[1])),
  ge: (args) => compare('ge', durOperand(args[0]), durOperand(args[1])),
  colon(args) {
    const a = durOperand(args[0]).arr[0], b = durOperand(args[args.length - 1]).arr[0];
    const s = args.length === 3 ? durOperand(args[1]).arr[0] : MS_DAY;
    const out = [];
    if (s !== 0) { const n = Math.floor((b - a) / s + 1e-9) + 1; for (let k = 0; k < n; k++) out.push(a + k * s); }
    const o = args.find(isDur);
    return makeDur([1, out.length], out, o.props.Format);
  },
  abs(args) { const o = args[0]; return { ...o, arr: Float64Array.from(o.arr, Math.abs) }; },
  sum: viaNumeric('sum', asSame),
  cumsum: viaNumeric('cumsum', asSame),
  mean: viaNumeric('mean', asSame),
  median: viaNumeric('median', asSame),
  mode: viaNumeric('mode', asSame),
  std: viaNumeric('std', asSame),
  min: viaNumeric('min', asSame),
  max: viaNumeric('max', asSame),
  bounds: viaNumeric('bounds', asSame),
  sort: viaNumeric('sort', asSame),
  unique: viaNumeric('unique', asSame),
  diff: viaNumeric('diff', asSame),
  issorted: viaNumeric('issorted', (o, t) => t),
  floor: (args) => durRound(args, Math.floor),
  ceil: (args) => durRound(args, Math.ceil),
  round: (args) => durRound(args, Math.round),
  isnan: (args) => ({ cls: 'logical', dims: args[0].dims, re: Float64Array.from(args[0].arr, (x) => (x !== x ? 1 : 0)), im: null }),
  isinf: (args) => ({ cls: 'logical', dims: args[0].dims, re: Float64Array.from(args[0].arr, (x) => (x === Infinity || x === -Infinity ? 1 : 0)), im: null }),
  isfinite: (args) => ({ cls: 'logical', dims: args[0].dims, re: Float64Array.from(args[0].arr, (x) => (Number.isFinite(x) ? 1 : 0)), im: null }),
  string(args) { const o = args[0]; const f = args.length > 1 ? textArg(args[1]) : o.props.Format; return stringArray(o.dims, Array.from(o.arr, (x) => durText(x, f))); },
  char(args) { const o = args[0]; const lines = Array.from(o.arr, (x) => durText(x, o.props.Format)); return lines.length === 1 ? str(lines[0]) : charMatrix(lines); },
  cellstr(args) { const o = args[0]; return cell(o.dims, Array.from(o.arr, (x) => str(durText(x, o.props.Format)))); },
  double() { throw E('base:duration:DoubleConversion', 'Use hours, minutes, seconds, days, or years to convert a duration to a number.'); },
};
function durRound(args, f) {
  const o = args[0];
  const unit = args.length > 1 ? optArg(args[1]) : 'seconds';
  const sc = unitScale[unit] || (unit === 'hours' ? 3600000 : 1000);
  return { ...o, arr: Float64Array.from(o.arr, (x) => f(x / sc) * sc) };
}
durMethods.mtimes = durMethods.times;
durMethods.mrdivide = durMethods.rdivide;

const durationClass = {
  props: ['Format'],
  construct: (args, ctx) => builtins.duration(args, 1, ctx),
  methods: durMethods,
  subsref: makeSubsref((o, name) => durGet(o, name)),
  subsasgn(obj, subs, rhs) {
    const s0 = subs[0];
    if (s0.type === '.') { if (dotName(s0) === 'Format') return { ...obj, props: { ...obj.props, Format: textArg(rhs) } }; throw E('base:duration:noProperty', `Unrecognized property '${dotName(s0)}' for class 'duration'.`); }
    if (isTensor(rhs) && rhs.re.length === 0 && !isChar(rhs)) return objDelete(obj, s0.subs);
    return objAssign(obj, s0.subs, durOperand(rhs), NaN);
  },
  cat(k, items) {
    const first = items.find(isDur);
    return objCat(k, items.filter((v) => !(isTensor(v) && v.re.length === 0)).map((v) => durOperand(v)), first);
  },
  display(o, name, ctx, opts) { return arrDisplay(o, name, ctx, opts, Array.from(o.arr, (x) => durText(x, o.props.Format)), 'duration'); },
  inlineText(o) { return nel(o) === 1 ? durText(o.arr[0], o.props.Format) : null; },
};

// ------------------------------------------------------------- calendarDuration class

function calOperand(v) {
  if (isCal(v)) return v;
  if (isDur(v)) return makeCalDur(v.dims, new Float64Array(v.arr.length), new Float64Array(v.arr.length), Float64Array.from(v.arr));
  if (isTensor(v)) { const t = toTensor(v); return makeCalDur(t.dims, new Float64Array(t.re.length), Float64Array.from(t.re), new Float64Array(t.re.length)); }
  throw E('base:calendarDuration:invalidOperand', `Operation is not defined between calendarDuration and ${v.cls} arrays.`);
}
const calMethods = {
  plus(args, nargout, ctx) {
    const [a, b] = args;
    if (isDT(a)) return addCal(a, calOperand(b), 1);
    if (isDT(b)) return addCal(b, calOperand(a), 1);
    const A = calOperand(a), B = calOperand(b);
    const pi = pairIdx(nel(A), nel(B), A.dims, B.dims);
    const f = (k) => Float64Array.from({ length: pi.n }, (_, q) => A[k][pi.ia(q)] + B[k][pi.ib(q)]);
    return makeCalDur(pi.dims, f('arr'), f('arr2'), f('arr3'));
  },
  minus(args, nargout, ctx) {
    const [a, b] = args;
    if (isDT(a)) return addCal(a, calOperand(b), -1);
    const A = calOperand(a), B = calOperand(b);
    const pi = pairIdx(nel(A), nel(B), A.dims, B.dims);
    const f = (k) => Float64Array.from({ length: pi.n }, (_, q) => A[k][pi.ia(q)] - B[k][pi.ib(q)]);
    return makeCalDur(pi.dims, f('arr'), f('arr2'), f('arr3'));
  },
  uminus(args) { const o = args[0]; return makeCalDur(o.dims, o.arr.map((x) => -x), o.arr2.map((x) => -x), o.arr3.map((x) => -x)); },
  times(args) {
    const [a, b] = args;
    const o = isCal(a) ? a : b, t = toTensor(isCal(a) ? b : a);
    const pi = pairIdx(nel(o), t.re.length, o.dims, t.dims);
    const f = (k) => Float64Array.from({ length: pi.n }, (_, q) => o[k][pi.ia(q)] * t.re[pi.ib(q)]);
    return makeCalDur(pi.dims, f('arr'), f('arr2'), f('arr3'));
  },
  eq(args) { const A = calOperand(args[0]), B = calOperand(args[1]); const pi = pairIdx(nel(A), nel(B), A.dims, B.dims); return { cls: 'logical', dims: normDims(pi.dims), re: Float64Array.from({ length: pi.n }, (_, q) => (A.arr[pi.ia(q)] === B.arr[pi.ib(q)] && A.arr2[pi.ia(q)] === B.arr2[pi.ib(q)] && A.arr3[pi.ia(q)] === B.arr3[pi.ib(q)] ? 1 : 0)), im: null }; },
  ne(args) { const r = calMethods.eq(args); return { ...r, re: r.re.map((x) => 1 - x) }; },
  string(args) { const o = args[0]; return stringArray(o.dims, Array.from({ length: nel(o) }, (_, i) => calText(o, i))); },
  char(args) { const o = args[0]; const lines = Array.from({ length: nel(o) }, (_, i) => calText(o, i)); return lines.length === 1 ? str(lines[0]) : charMatrix(lines); },
};
calMethods.mtimes = calMethods.times;
const calendarDurationClass = {
  props: ['Format'],
  construct: (args, ctx) => builtins.calendarDuration(args, 1, ctx),
  methods: calMethods,
  subsref: makeSubsref((o, name) => { if (name === 'Format') return str(o.props.Format); throw E('base:calendarDuration:noProperty', `Unrecognized property '${name}' for class 'calendarDuration'.`); }),
  subsasgn(obj, subs, rhs) {
    const s0 = subs[0];
    if (s0.type === '.') return { ...obj, props: { ...obj.props, Format: textArg(rhs) } };
    if (isTensor(rhs) && rhs.re.length === 0) return objDelete(obj, s0.subs);
    return objAssign(obj, s0.subs, calOperand(rhs), [0, 0, 0]);
  },
  cat(k, items) { const first = items.find(isCal); return objCat(k, items.filter((v) => !(isTensor(v) && v.re.length === 0)).map(calOperand), first); },
  display(o, name, ctx, opts) { return arrDisplay(o, name, ctx, opts, Array.from({ length: nel(o) }, (_, i) => calText(o, i)), 'calendarDuration'); },
  inlineText(o) { return nel(o) === 1 ? calText(o, 0) : null; },
};

// ------------------------------------------------------------- builtins

function unitFn(name) {
  const sc = unitScale[name];
  const fmt = { years: 'y', days: 'd', hours: 'h', minutes: 'm', seconds: 's', milliseconds: 's' }[name];
  return (args) => {
    if (args.length < 1) return makeDur([1, 1], [sc], fmt);
    const v = args[0];
    if (isDur(v)) return tensor('double', v.dims, Float64Array.from(v.arr, (x) => x / sc));
    const t = toTensor(v);
    return makeDur(t.dims, Float64Array.from(t.re, (x) => x * sc), fmt);
  };
}
function calUnit(kind) {
  return (args) => {
    const t = args.length ? toTensor(args[0]) : num(1);
    const n = t.re.length;
    const z = () => new Float64Array(n);
    const mo = z(), d = z(), ms = z();
    for (let i = 0; i < n; i++) {
      const x = t.re[i];
      if (kind === 'y') mo[i] = 12 * x; else if (kind === 'q') mo[i] = 3 * x; else if (kind === 'm') mo[i] = x; else if (kind === 'w') d[i] = 7 * x; else d[i] = x;
    }
    return makeCalDur(t.dims, mo, d, ms);
  };
}
function compFn(name, f) {
  return (args, nargout, ctx) => {
    const o = args[0];
    if (isDT(o)) {
      const kind = args.length > 1 ? optArg(args[1]) : null;
      const vals = Array.from(o.arr, (u) => { if (!Number.isFinite(u)) return NaN; return f(partsOf(wallOf(o, u)), kind); });
      if (vals.length && typeof vals[0] === 'string') return cell(o.dims, vals.map((s) => str(s)));
      return tensor('double', o.dims, vals);
    }
    if (isDur(o) && unitScale[name + 's']) return tensor('double', o.dims, Float64Array.from(o.arr, (x) => x / unitScale[name + 's']));
    if (isTensor(o)) {
      // datenum input (legacy financial functions)
      const t = toTensor(o);
      return tensor('double', t.dims, Array.from(t.re, (dn) => f(partsOf(datenumToMs(dn)), null)));
    }
    throw E(`base:${name}:invalidInput`, `Input must be a datetime array.`);
  };
}

function dateshiftFn(args) {
  const o = args[0];
  if (!isDT(o)) throw E('base:dateshift:notDatetime', 'Input must be a datetime array.');
  const where = optArg(args[1]), unit = optArg(args[2]);
  const k = args.length > 3 ? toTensor(args[3]).re[0] : 0;
  const arr = Float64Array.from(o.arr, (u) => {
    if (!Number.isFinite(u)) return u;
    const p = partsOf(wallOf(o, u));
    let start;
    switch (unit) {
      case 'year': start = msFromParts(p.y + (where === 'start' || where === 'end' ? 0 : k), 1, 1); if (where === 'end') return utcFromWall(o.props.TimeZone, msFromParts(p.y, 12, 31)); break;
      case 'quarter': { const q0 = Math.floor((p.mo - 1) / 3) * 3 + 1; start = msFromParts(p.y, q0, 1); if (where === 'end') return utcFromWall(o.props.TimeZone, msFromParts(p.y, q0 + 3, 1) - MS_DAY); break; }
      case 'month': start = msFromParts(p.y, p.mo, 1); if (where === 'end') return utcFromWall(o.props.TimeZone, msFromParts(p.y, p.mo, monthDays(p.y, p.mo))); break;
      case 'week': start = msFromParts(p.y, p.mo, p.d - (p.wd - 1)); if (where === 'end') return utcFromWall(o.props.TimeZone, start + 6 * MS_DAY); break;
      case 'day': start = msFromParts(p.y, p.mo, p.d); if (where === 'end') return utcFromWall(o.props.TimeZone, start + MS_DAY - 1); break;
      case 'hour': start = msFromParts(p.y, p.mo, p.d, p.h); if (where === 'end') return utcFromWall(o.props.TimeZone, start + 3599999); break;
      case 'minute': start = msFromParts(p.y, p.mo, p.d, p.h, p.mi); if (where === 'end') return utcFromWall(o.props.TimeZone, start + 59999); break;
      case 'second': start = msFromParts(p.y, p.mo, p.d, p.h, p.mi, Math.floor(p.s)); if (where === 'end') return utcFromWall(o.props.TimeZone, start + 999); break;
      default: throw E('base:dateshift:invalidUnit', `Invalid unit '${textArg(args[2])}'.`);
    }
    if (where === 'start') return utcFromWall(o.props.TimeZone, start);
    if (where === 'dayofweek') { const want = typeof k === 'number' ? k : 1; let d = (want - p.wd + 7) % 7; return utcFromWall(o.props.TimeZone, msFromParts(p.y, p.mo, p.d) + d * MS_DAY); }
    if (where === 'next' || where === 'previous') {
      const step = where === 'next' ? 1 : -1;
      const sp = partsOf(start);
      const m = { year: [12, 0], quarter: [3, 0], month: [1, 0], week: [0, 7], day: [0, 1] }[unit];
      if (m) return utcFromWall(o.props.TimeZone, msFromParts(sp.y, sp.mo + step * m[0], sp.d + step * m[1]));
      const ms = { hour: 3600000, minute: 60000, second: 1000 }[unit];
      return utcFromWall(o.props.TimeZone, start + step * ms);
    }
    throw E('base:dateshift:invalidRule', `Invalid rule '${textArg(args[1])}'.`);
  });
  return { ...o, arr };
}

export const builtins = {
  datetime: datetimeFn,
  NaT(args) {
    const dims = args.length ? (args.length === 1 ? (toTensor(args[0]).re.length === 1 ? [toTensor(args[0]).re[0], toTensor(args[0]).re[0]] : Array.from(toTensor(args[0]).re)) : args.filter((a) => isTensor(a) && !isChar(a)).map((a) => toTensor(a).re[0])) : [1, 1];
    const n = prod(normDims(dims));
    return makeDT(dims, new Float64Array(n).fill(NaN));
  },
  duration(args) {
    let k = args.length;
    let fmt = 'hh:mm:ss';
    for (let i = 0; i < args.length; i++) { if (optArg(args[i]) === 'format' && i + 1 < args.length) { fmt = textArg(args[i + 1]); k = i; break; } }
    const pos = args.slice(0, k);
    if (pos.length === 0) return makeDur([1, 1], [0], fmt);
    if (pos.length === 1 && (isChar(pos[0]) || isString(pos[0]) || isCell(pos[0]))) {
      const T = textList(pos[0], 'duration');
      return makeDur(T.kind === 'char' ? [1, 1] : T.dims, T.list.map((s) => durOperand(str(s || '')).arr[0]), fmt);
    }
    if (pos.length === 1 && isDur(pos[0])) return { ...pos[0], props: { Format: fmt } };
    const ts = pos.map((x) => toTensor(x));
    if (ts.length === 1) {
      const t = ts[0]; const m = t.dims[0], c = t.dims[1];
      if (c !== 3 && c !== 4) throw E('base:duration:InvalidNumericData', 'Numeric input must be a matrix with three or four columns, or three or four separate numeric arrays.');
      const out = []; for (let i = 0; i < m; i++) { const v = (j) => (j < c ? t.re[i + j * m] : 0); out.push((v(0) * 3600 + v(1) * 60 + v(2)) * 1000 + v(3)); }
      return makeDur([m, 1], out, fmt);
    }
    if (ts.length !== 3 && ts.length !== 4) throw E('base:duration:InvalidNumericData', 'Numeric input must be three or four separate numeric arrays.');
    const n = Math.max(...ts.map((t) => t.re.length));
    const g = (j, i) => (j < ts.length ? ts[j].re[ts[j].re.length === 1 ? 0 : i] : 0);
    const out = []; for (let i = 0; i < n; i++) out.push((g(0, i) * 3600 + g(1, i) * 60 + g(2, i)) * 1000 + g(3, i));
    if (ts.length === 4 && fmt === 'hh:mm:ss') fmt = 'hh:mm:ss.SSS';
    return makeDur(ts.find((t) => t.re.length === n).dims, out, fmt);
  },
  calendarDuration(args) {
    const ts = args.filter((a) => isTensor(a) && !isChar(a)).map((a) => toTensor(a));
    if (ts.length === 1) { const t = ts[0]; const m = t.dims[0], c = t.dims[1]; const g = (i, j) => (j < c ? t.re[i + j * m] : 0); return makeCalDur([m, 1], Array.from({ length: m }, (_, i) => 12 * g(i, 0) + g(i, 1)), Array.from({ length: m }, (_, i) => g(i, 2)), Array.from({ length: m }, (_, i) => ((g(i, 3) * 60 + g(i, 4)) * 60 + g(i, 5)) * 1000)); }
    const n = Math.max(1, ...ts.map((t) => t.re.length));
    const g = (j, i) => (j < ts.length ? ts[j].re[ts[j].re.length === 1 ? 0 : i] : 0);
    const mo = [], d = [], ms = [];
    for (let i = 0; i < n; i++) {
      mo.push(12 * g(0, i) + g(1, i)); d.push(g(2, i));
      ms.push(ts.length === 4 && isDur(args[3]) ? args[3].arr[0] : ((g(3, i) * 60 + g(4, i)) * 60 + g(5, i)) * 1000);
    }
    const big = ts.find((t) => t.re.length === n);
    return makeCalDur(big ? big.dims : [1, 1], mo, d, ms);
  },
  years: unitFn('years'),
  days: unitFn('days'),
  hours: unitFn('hours'),
  minutes: unitFn('minutes'),
  seconds: unitFn('seconds'),
  milliseconds: unitFn('milliseconds'),
  calyears: calUnit('y'),
  calquarters: calUnit('q'),
  calmonths: calUnit('m'),
  calweeks: calUnit('w'),
  caldays: calUnit('d'),
  year: compFn('year', (p) => p.y),
  quarter: compFn('quarter', (p) => Math.ceil(p.mo / 3)),
  month: compFn('month', (p, kind) => (kind === 'name' || kind === 'longname' ? MONTHS[p.mo - 1] : kind === 'shortname' ? MONTHS[p.mo - 1].slice(0, 3) : p.mo)),
  week: compFn('week', (p) => Math.floor((p.doy - 1 + ((partsOf(msFromParts(p.y, 1, 1)).wd - 1))) / 7) + 1),
  day: compFn('day', (p, kind) => (kind === 'dayofweek' ? p.wd : kind === 'dayofyear' ? p.doy : kind === 'name' || kind === 'longname' ? DAYS[p.wd - 1] : kind === 'shortname' ? DAYS[p.wd - 1].slice(0, 3) : p.d)),
  hour: compFn('hour', (p) => p.h),
  minute: compFn('minute', (p) => p.mi),
  second: compFn('second', (p) => p.s),
  ymd(args, nargout) {
    const o = args[0];
    const comps = ['Year', 'Month', 'Day'].map((n) => dtComponent(o, n));
    return nargout <= 1 ? comps[0] : comps.slice(0, nargout);
  },
  hms(args, nargout) {
    const o = args[0];
    if (isDur(o)) {
      const h = Float64Array.from(o.arr, (x) => Math.trunc(x / 3600000)), m = Float64Array.from(o.arr, (x) => Math.trunc((x % 3600000) / 60000)), s = Float64Array.from(o.arr, (x) => (x % 60000) / 1000);
      const out = [tensor('double', o.dims, h), tensor('double', o.dims, m), tensor('double', o.dims, s)];
      return nargout <= 1 ? out[0] : out.slice(0, nargout);
    }
    const comps = ['Hour', 'Minute', 'Second'].map((n) => dtComponent(o, n));
    return nargout <= 1 ? comps[0] : comps.slice(0, nargout);
  },
  timeofday(args) { const o = args[0]; return makeDur(o.dims, Float64Array.from(o.arr, (u) => { const w = wallOf(o, u); return ((w % MS_DAY) + MS_DAY) % MS_DAY; })); },
  isnat(args) { const o = args[0]; if (!isDT(o)) throw E('base:isnat:notDatetime', 'Input must be a datetime array.'); return { cls: 'logical', dims: o.dims, re: Float64Array.from(o.arr, (x) => (x !== x ? 1 : 0)), im: null }; },
  isdatetime: (args) => bool(isDT(args[0])),
  isduration: (args) => bool(isDur(args[0])),
  iscalendarduration: (args) => bool(isCal(args[0])),
  isweekend(args) { const o = args[0]; return { cls: 'logical', dims: o.dims, re: Float64Array.from(o.arr, (u) => { if (!Number.isFinite(u)) return 0; const wd = partsOf(wallOf(o, u)).wd; return wd === 1 || wd === 7 ? 1 : 0; }), im: null }; },
  isbetween(args, nargout, ctx) {
    const o = args[0], lo = dtConvert(args[1], o, ctx), hi = dtConvert(args[2], o, ctx);
    const inter = args.length > 3 ? optArg(args[3]) : 'closed';
    return { cls: 'logical', dims: o.dims, re: Float64Array.from(o.arr, (u, i) => { const a = lo.arr[lo.arr.length === 1 ? 0 : i], b = hi.arr[hi.arr.length === 1 ? 0 : i]; const okL = inter === 'open' || inter === 'openleft' ? u > a : u >= a; const okR = inter === 'open' || inter === 'openright' ? u < b : u <= b; return okL && okR ? 1 : 0; }), im: null };
  },
  between(args, nargout, ctx) {
    const a = dtConvert(args[0], null, ctx), b = dtConvert(args[1], a, ctx);
    const pi = pairIdx(nel(a), nel(b), a.dims, b.dims);
    const mo = [], d = [], ms = [];
    for (let q = 0; q < pi.n; q++) {
      const p1 = partsOf(wallOf(a, a.arr[pi.ia(q)])), p2 = partsOf(wallOf(b, b.arr[pi.ib(q)]));
      let months = (p2.y - p1.y) * 12 + (p2.mo - p1.mo);
      const t1 = msFromParts(p1.y, p1.mo + months, Math.min(p1.d, 28)) + (wallOf(a, a.arr[pi.ia(q)]) - msFromParts(p1.y, p1.mo, p1.d)) + (p1.d - Math.min(p1.d, 28)) * MS_DAY;
      let rest = wallOf(b, b.arr[pi.ib(q)]) - t1;
      if (months > 0 && rest < 0) { months--; const t2 = addCal({ ...a, arr: Float64Array.of(a.arr[pi.ia(q)]), dims: [1, 1] }, makeCalDur([1, 1], [months], [0], [0]), 1).arr[0]; rest = b.arr[pi.ib(q)] - t2; }
      const dd = Math.trunc(rest / MS_DAY);
      mo.push(months); d.push(dd); ms.push(rest - dd * MS_DAY);
    }
    return makeCalDur(pi.dims, mo, d, ms);
  },
  dateshift: dateshiftFn,
  posixtime(args) { const o = args[0]; return tensor('double', o.dims, Float64Array.from(o.arr, (u) => (o.props.TimeZone ? u : u) / 1000)); },
  juliandate(args) { const o = args[0]; return tensor('double', o.dims, Float64Array.from(o.arr, (u) => u / MS_DAY + 2440587.5)); },
  exceltime(args) { const o = args[0]; return tensor('double', o.dims, Float64Array.from(o.arr, (u) => msToDatenum(wallOf(o, u)) - 693960)); },
  yyyymmdd(args) { const o = args[0]; return tensor('double', o.dims, Float64Array.from(o.arr, (u) => { const p = partsOf(wallOf(o, u)); return p ? p.y * 10000 + p.mo * 100 + p.d : NaN; })); },
  tzoffset(args) { const o = args[0]; return makeDur(o.dims, Float64Array.from(o.arr, (u) => (o.props.TimeZone ? tzOffsetMin(o.props.TimeZone, u) * 60000 : NaN))); },
};

export const classes = { datetime: datetimeClass, duration: durationClass, calendarDuration: calendarDurationClass };

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  datetime: H('Arrays that represent points in time.', '시점을 나타내는 배열.', ['t = datetime', "t = datetime('now')", 't = datetime(Y, M, D)', 't = datetime(Y, M, D, H, MI, S)', "t = datetime(DateStrings, 'InputFormat', infmt)", "t = datetime(X, 'ConvertFrom', 'datenum')", "t = datetime(..., 'TimeZone', tz, 'Format', fmt)"]),
  NaT: H('Not-a-Time (missing datetime).', '시간 아님 (누락된 datetime).', ['t = NaT', 't = NaT(m, n)']),
  duration: H('Lengths of time in fixed-length units.', '고정 길이 단위의 시간 길이.', ['D = duration(H, MI, S)', 'D = duration(H, MI, S, MS)', 'D = duration(X)', "D = duration(..., 'Format', fmt)"]),
  calendarDuration: H('Lengths of time in variable-length calendar units.', '가변 길이 달력 단위의 시간 길이.', ['L = calendarDuration(Y, M, D)', 'L = calendarDuration(Y, M, D, H, MI, S)']),
  years: H('Duration in years (or years of a duration).', '연 단위 기간 (또는 기간의 연 수).', ['Y = years(X)', 'X = years(Y)']),
  days: H('Duration in days (or days of a duration).', '일 단위 기간 (또는 기간의 일 수).', ['D = days(X)', 'X = days(D)']),
  hours: H('Duration in hours (or hours of a duration).', '시간 단위 기간 (또는 기간의 시간 수).', ['H = hours(X)', 'X = hours(H)']),
  minutes: H('Duration in minutes (or minutes of a duration).', '분 단위 기간 (또는 기간의 분 수).', ['M = minutes(X)', 'X = minutes(M)']),
  seconds: H('Duration in seconds (or seconds of a duration).', '초 단위 기간 (또는 기간의 초 수).', ['S = seconds(X)', 'X = seconds(S)']),
  milliseconds: H('Duration in milliseconds (or milliseconds of a duration).', '밀리초 단위 기간 (또는 밀리초 수).', ['MS = milliseconds(X)', 'X = milliseconds(MS)']),
  calyears: H('Calendar duration in years.', '연 단위 달력 기간.', ['L = calyears(X)']),
  calquarters: H('Calendar duration in quarters.', '분기 단위 달력 기간.', ['L = calquarters(X)']),
  calmonths: H('Calendar duration in months.', '월 단위 달력 기간.', ['L = calmonths(X)']),
  calweeks: H('Calendar duration in weeks.', '주 단위 달력 기간.', ['L = calweeks(X)']),
  caldays: H('Calendar duration in days.', '일 단위 달력 기간.', ['L = caldays(X)']),
  year: H('Year number of datetime values.', 'datetime 값의 연도.', ['y = year(t)']),
  quarter: H('Quarter number of datetime values.', 'datetime 값의 분기.', ['q = quarter(t)']),
  month: H('Month number or name of datetime values.', 'datetime 값의 월 번호나 이름.', ['m = month(t)', "m = month(t, 'name')"]),
  week: H('Week number of datetime values.', 'datetime 값의 주 번호.', ['w = week(t)']),
  day: H('Day number or name of datetime values.', 'datetime 값의 일 번호나 이름.', ['d = day(t)', "d = day(t, 'dayofweek')", "d = day(t, 'name')"]),
  hour: H('Hour component of datetime values.', 'datetime 값의 시.', ['h = hour(t)']),
  minute: H('Minute component of datetime values.', 'datetime 값의 분.', ['m = minute(t)']),
  second: H('Seconds component of datetime values.', 'datetime 값의 초.', ['s = second(t)']),
  ymd: H('Year, month and day numbers of datetime.', 'datetime의 연·월·일.', ['[y, m, d] = ymd(t)']),
  hms: H('Hour, minute and second numbers of datetime or duration.', 'datetime 또는 duration의 시·분·초.', ['[h, m, s] = hms(t)']),
  timeofday: H('Elapsed time since midnight.', '자정부터 경과한 시간.', ['T = timeofday(t)']),
  isnat: H('True for Not-a-Time elements.', 'NaT 원소이면 참.', ['TF = isnat(t)']),
  isdatetime: H('True for datetime arrays.', 'datetime 배열이면 참.', ['TF = isdatetime(t)']),
  isduration: H('True for duration arrays.', 'duration 배열이면 참.', ['TF = isduration(d)']),
  iscalendarduration: H('True for calendarDuration arrays.', 'calendarDuration 배열이면 참.', ['TF = iscalendarduration(L)']),
  isweekend: H('True for datetime values on a weekend.', '주말인 datetime 값이면 참.', ['TF = isweekend(t)']),
  isbetween: H('Determine elements within a date and time interval.', '날짜·시간 구간 안의 원소 판별.', ['tf = isbetween(t, tlower, tupper)', "tf = isbetween(..., 'openright')"]),
  between: H('Calendar math differences between datetimes.', 'datetime 사이의 달력 차이.', ['dt = between(t1, t2)']),
  dateshift: H('Shift date or generate sequence according to a calendar rule.', '달력 규칙에 따라 날짜 이동.', ["t2 = dateshift(t, 'start', unit)", "t2 = dateshift(t, 'end', unit)", "t2 = dateshift(t, 'dayofweek', dow)"]),
  posixtime: H('Convert datetime to POSIX time.', 'datetime을 POSIX 시간으로 변환.', ['p = posixtime(t)']),
  juliandate: H('Convert datetime to Julian date.', 'datetime을 율리우스일로 변환.', ['jd = juliandate(t)']),
  exceltime: H('Convert datetime to spreadsheet date number.', 'datetime을 스프레드시트 날짜 번호로 변환.', ['e = exceltime(t)']),
  yyyymmdd: H('Convert datetime to YYYYMMDD numeric values.', 'datetime을 YYYYMMDD 숫자로 변환.', ['d = yyyymmdd(t)']),
  tzoffset: H('Time zone offset of datetime values.', 'datetime 값의 시간대 오프셋.', ['dt = tzoffset(t)']),
};
void dense; void firstNonSingleton; void splitDims; void dimsWith; void object; void MError; void daysFromCivil; void isObject; void prod;
