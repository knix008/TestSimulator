// GNU Octave extensions of the base library (system side): Unix-style time
// functions (time / localtime / gmtime / mktime / strftime / strptime ...),
// file name utilities (canonicalize_file_name, glob, stat, readdir, ...),
// environment and system information, user preferences (addpref /
// getpref / setpref ...), display and file settings, terminal questions
// (menu, yes_or_no), temporary files and archives (bzip2 / bunzip2 /
// unpack).
import {
  tensor, isTensor, isSparse, isString, isCell, isStruct, isChar, toTensor, str, cell, num, bool,
  stringArray, struct,
} from '../../value.js';
import { E, textArg, textList, count, boolT } from './util.js';
import { isLeap } from './time.js';
import { bzip2Compress, bzip2Decompress } from './bzip2.js';

const first = (r) => (Array.isArray(r) ? r[0] : r);
const call1 = (ctx, f, args) => first(ctx.call(f, args, 1));
const S = (v, what = 'Argument') => {
  const t = textArg(v);
  if (t === null) throw E('base:text:invalidInput', `${what} must be a character vector or string scalar.`);
  return t;
};
const charOrEmpty = (s) => { const t = str(s); if (!s.length) t.dims = [1, 0]; return t; };
const scalarNum = (v, fname, what = 'Argument') => {
  const t = isTensor(v) || isSparse(v) ? toTensor(v) : null;
  if (!t || t.re.length !== 1) throw E(`base:${fname}:invalidInput`, `${what} must be a numeric scalar.`);
  return t.re[0];
};
const nargs = (name, args, lo, hi) => {
  if (args.length < lo || args.length > hi) throw E(`base:${name}:wrongNumberOfInputs`, `${name}: ${lo === hi ? `exactly ${lo}` : `${lo} to ${hi}`} input argument${hi === 1 ? '' : 's'} ${lo === hi && lo === 1 ? 'is' : 'are'} required.`);
};
const structOf1 = (obj) => struct([1, 1], Object.keys(obj), [obj]);

// ------------------------------------------------------------- platform and paths

function platformOf(ctx) {
  try { if (ctx.fs.platform) return ctx.fs.platform; } catch { /* ignore */ }
  if (ctx.fs.kind === 'memory') return 'linux';
  try { if (/^[A-Za-z]:\//.test(String(ctx.fs.cwd()).replace(/\\/g, '/'))) return 'win'; } catch { /* ignore */ }
  const p = (globalThis.process && globalThis.process.platform) || '';
  const nav = (globalThis.navigator && (globalThis.navigator.userAgentData?.platform || globalThis.navigator.platform)) || '';
  if (p === 'win32' || /win/i.test(nav)) return 'win';
  if (p === 'darwin' || /mac/i.test(nav)) return 'mac';
  return 'linux';
}
const isWin = (ctx) => platformOf(ctx) === 'win';
const slash = (p) => String(p).replace(/\\/g, '/');
const isAbsName = (p) => /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p);
function normalize(p) {
  p = slash(p);
  let root = '';
  const m = /^([A-Za-z]:)?(\/*)/.exec(p);
  if (m[1]) root = m[1] + '/'; else if (m[2]) root = '/';
  const parts = [];
  for (const s of p.slice(m[0].length).split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (parts.length && parts[parts.length - 1] !== '..') parts.pop(); else if (!root) parts.push('..'); continue; }
    parts.push(s);
  }
  return root + parts.join('/') || (root ? root : '.');
}
function homeOf(ctx) {
  const env = envMap(ctx);
  if (env.HOME) return slash(env.HOME);
  try { return slash(ctx.fs.homeDir()); } catch { return '/'; }
}
function tildeExpand(ctx, p) {
  if (p === '~') return homeOf(ctx);
  if (p.startsWith('~/') || p.startsWith('~\\')) return homeOf(ctx).replace(/[\\/]+$/, '') + p.slice(1);
  return p;
}
function absOf(ctx, p) {
  p = tildeExpand(ctx, slash(p));
  if (isAbsName(p)) return normalize(p);
  return normalize(slash(ctx.fs.cwd()).replace(/\/+$/, '') + '/' + p);
}
const outPath = (ctx, p) => (isWin(ctx) ? p.replace(/\//g, '\\') : p);
const exists = (ctx, p) => { try { return ctx.fs.exists(p); } catch { return false; } };
const statOf = (ctx, p) => { try { return ctx.fs.stat(p); } catch { return null; } };

function envMap(ctx) {
  if (!ctx.state.env) { try { ctx.call('getenv', [str('HOME')], 1); } catch { /* ignore */ } }
  return ctx.state.env || {};
}
function getEnv(ctx, name) {
  const env = envMap(ctx);
  if (name in env) return env[name];
  if (isWin(ctx)) { const k = Object.keys(env).find((x) => x.toLowerCase() === name.toLowerCase()); if (k) return env[k]; }
  return null;
}

// ------------------------------------------------------------- time

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TM_FIELDS = ['usec', 'sec', 'min', 'hour', 'mday', 'mon', 'year', 'wday', 'yday', 'isdst', 'gmtoff', 'zone'];

function zoneName(d) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d);
    const z = parts.find((p) => p.type === 'timeZoneName');
    if (z) return z.value;
  } catch { /* ignore */ }
  return '';
}
function isDst(d) {
  const y = d.getFullYear();
  const jan = new Date(y, 0, 1).getTimezoneOffset(), jul = new Date(y, 6, 1).getTimezoneOffset();
  return jan !== jul && d.getTimezoneOffset() === Math.min(jan, jul);
}
function tmFromSeconds(t, utc) {
  const ms = Math.floor(t * 1000);
  const usec = Math.round((t - Math.floor(t)) * 1e6) % 1000000;
  const d = new Date(ms);
  const g = utc ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() }
    : { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wd: d.getDay() };
  const yday = Math.round((Date.UTC(g.y, g.mo, g.d) - Date.UTC(g.y, 0, 1)) / 86400000);
  return {
    usec, sec: g.s, min: g.mi, hour: g.h, mday: g.d, mon: g.mo, year: g.y - 1900, wday: g.wd, yday,
    isdst: utc ? 0 : isDst(d) ? 1 : 0, gmtoff: utc ? 0 : -d.getTimezoneOffset() * 60, zone: utc ? 'GMT' : zoneName(d),
  };
}
function tmToValue(tm) {
  const rec = {};
  for (const f of TM_FIELDS) rec[f] = f === 'zone' ? charOrEmpty(tm.zone || '') : num(tm[f]);
  return struct([1, 1], TM_FIELDS.slice(), [rec]);
}
function tmFromValue(v, fname) {
  if (!isStruct(v) || v.data.length !== 1) throw E(`base:${fname}:invalidInput`, `${fname}: TM_STRUCT argument must be a structure.`);
  const r = v.data[0];
  const get = (f, def = 0) => (r[f] && (isTensor(r[f]) || isSparse(r[f])) && count(r[f]) ? toTensor(r[f]).re[0] : def);
  const tm = {};
  for (const f of TM_FIELDS) tm[f] = f === 'zone' ? (r.zone && textArg(r.zone)) || '' : get(f);
  return tm;
}
function mktimeOf(tm) {
  const d = new Date(tm.year + 1900, tm.mon, tm.mday, tm.hour, tm.min, tm.sec);
  if (tm.year + 1900 < 100) d.setFullYear(tm.year + 1900);
  return d.getTime() / 1000 + (tm.usec || 0) / 1e6;
}
function timeArg(args, fname) {
  nargs(fname, args, 1, 1);
  return scalarNum(args[0], fname, 'T');
}
const pad = (x, n, c = '0') => String(x).padStart(n, c);
function isoWeek(tm) {
  const y = tm.year + 1900;
  const wdMon = (tm.wday + 6) % 7; // Monday = 0
  let wk = Math.floor((tm.yday - wdMon + 10) / 7);
  let wy = y;
  const weeksIn = (yy) => { const jan1 = new Date(Date.UTC(yy, 0, 1)).getUTCDay(); const leap = isLeap(yy); return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52; };
  if (wk < 1) { wy = y - 1; wk = weeksIn(wy); } else if (wk > weeksIn(y)) { wy = y + 1; wk = 1; }
  return { wk, wy };
}
export function strftimeText(fmt, tm) {
  let out = '';
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%' || i === fmt.length - 1) { out += c; continue; }
    let k = fmt[++i];
    let noPad = false;
    if (k === '-' || k === '_') { noPad = true; k = fmt[++i]; }
    if (k === 'E' || k === 'O') k = fmt[++i];
    const P = (x, n) => (noPad ? String(x) : pad(x, n));
    const h12 = tm.hour % 12 === 0 ? 12 : tm.hour % 12;
    const y = tm.year + 1900;
    switch (k) {
      case '%': out += '%'; break;
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'a': out += WD[tm.wday] || ''; break;
      case 'A': out += WDL[tm.wday] || ''; break;
      case 'b': case 'h': out += MO[tm.mon] || ''; break;
      case 'B': out += MOL[tm.mon] || ''; break;
      case 'c': out += strftimeText('%a %b %d %H:%M:%S %Y', tm); break;
      case 'C': out += P(Math.floor(y / 100), 2); break;
      case 'd': out += P(tm.mday, 2); break;
      case 'D': out += strftimeText('%m/%d/%y', tm); break;
      case 'e': out += pad(tm.mday, 2, ' '); break;
      case 'F': out += strftimeText('%Y-%m-%d', tm); break;
      case 'g': out += P(isoWeek(tm).wy % 100, 2); break;
      case 'G': out += String(isoWeek(tm).wy); break;
      case 'H': out += P(tm.hour, 2); break;
      case 'I': out += P(h12, 2); break;
      case 'j': out += P(tm.yday + 1, 3); break;
      case 'k': out += pad(tm.hour, 2, ' '); break;
      case 'l': out += pad(h12, 2, ' '); break;
      case 'm': out += P(tm.mon + 1, 2); break;
      case 'M': out += P(tm.min, 2); break;
      case 'p': out += tm.hour < 12 ? 'AM' : 'PM'; break;
      case 'P': out += tm.hour < 12 ? 'am' : 'pm'; break;
      case 'r': out += strftimeText('%I:%M:%S %p', tm); break;
      case 'R': out += strftimeText('%H:%M', tm); break;
      case 's': out += String(Math.floor(mktimeOf(tm))); break;
      case 'S': out += P(Math.floor(tm.sec), 2); break;
      case 'T': out += strftimeText('%H:%M:%S', tm); break;
      case 'u': out += String(tm.wday === 0 ? 7 : tm.wday); break;
      case 'U': out += P(Math.floor((tm.yday + 7 - tm.wday) / 7), 2); break;
      case 'V': out += P(isoWeek(tm).wk, 2); break;
      case 'w': out += String(tm.wday); break;
      case 'W': out += P(Math.floor((tm.yday + 7 - ((tm.wday + 6) % 7)) / 7), 2); break;
      case 'x': out += strftimeText('%m/%d/%y', tm); break;
      case 'X': out += strftimeText('%H:%M:%S', tm); break;
      case 'y': out += P(y % 100, 2); break;
      case 'Y': out += String(y); break;
      case 'z': { const o = tm.gmtoff || 0; const a = Math.abs(o); out += (o < 0 ? '-' : '+') + pad(Math.floor(a / 3600), 2) + pad(Math.floor((a % 3600) / 60), 2); break; }
      case 'Z': out += tm.zone || ''; break;
      default: out += '%' + k;
    }
  }
  return out;
}
function strptimeParse(s, fmt) {
  const tm = { usec: 0, sec: 0, min: 0, hour: 0, mday: 0, mon: 0, year: 0, wday: 0, yday: 0, isdst: 0, gmtoff: 0, zone: 'GMT' };
  let pos = 0, pm = null, have = { date: false, yday: false };
  const skipWs = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  const readNum = (maxDigits) => {
    skipWs();
    let sign = 1;
    if (s[pos] === '+' || s[pos] === '-') { sign = s[pos] === '-' ? -1 : 1; pos++; }
    let j = pos; while (j < s.length && j - pos < maxDigits && /\d/.test(s[j])) j++;
    if (j === pos) return null;
    const v = sign * Number(s.slice(pos, j)); pos = j; return v;
  };
  const readName = (full, abbr) => {
    skipWs();
    const rest = s.slice(pos).toLowerCase();
    for (let i = 0; i < full.length; i++) if (rest.startsWith(full[i].toLowerCase())) { pos += full[i].length; return i; }
    for (let i = 0; i < abbr.length; i++) if (rest.startsWith(abbr[i].toLowerCase())) { pos += abbr[i].length; return i; }
    return null;
  };
  const run = (f) => {
    for (let i = 0; i < f.length; i++) {
      const c = f[i];
      if (/\s/.test(c)) { skipWs(); continue; }
      if (c !== '%') { if (s[pos] !== c) return false; pos++; continue; }
      let k = f[++i];
      if (k === 'E' || k === 'O') k = f[++i];
      let v;
      switch (k) {
        case '%': if (s[pos] !== '%') return false; pos++; break;
        case 'n': case 't': skipWs(); break;
        case 'a': case 'A': if ((v = readName(WDL, WD)) === null) return false; tm.wday = v; break;
        case 'b': case 'B': case 'h': if ((v = readName(MOL, MO)) === null) return false; tm.mon = v; have.date = true; break;
        case 'c': if (!run('%a %b %d %H:%M:%S %Y')) return false; break;
        case 'C': if ((v = readNum(2)) === null) return false; tm.year = v * 100 - 1900 + (tm.year % 100 + 100) % 100; break;
        case 'd': case 'e': if ((v = readNum(2)) === null || v < 1 || v > 31) return false; tm.mday = v; have.date = true; break;
        case 'D': case 'x': if (!run('%m/%d/%y')) return false; break;
        case 'F': if (!run('%Y-%m-%d')) return false; break;
        case 'H': case 'k': if ((v = readNum(2)) === null || v > 23) return false; tm.hour = v; break;
        case 'I': case 'l': if ((v = readNum(2)) === null || v < 1 || v > 12) return false; tm.hour = v % 12; break;
        case 'j': if ((v = readNum(3)) === null || v < 1 || v > 366) return false; tm.yday = v - 1; have.yday = true; break;
        case 'm': if ((v = readNum(2)) === null || v < 1 || v > 12) return false; tm.mon = v - 1; have.date = true; break;
        case 'M': if ((v = readNum(2)) === null || v > 59) return false; tm.min = v; break;
        case 'p': case 'P': { skipWs(); const w = s.slice(pos, pos + 2).toLowerCase(); if (w !== 'am' && w !== 'pm') return false; pm = w === 'pm'; pos += 2; break; }
        case 'r': if (!run('%I:%M:%S %p')) return false; break;
        case 'R': if (!run('%H:%M')) return false; break;
        case 'S': if ((v = readNum(2)) === null || v > 61) return false; tm.sec = v; break;
        case 'T': case 'X': if (!run('%H:%M:%S')) return false; break;
        case 'y': if ((v = readNum(2)) === null) return false; tm.year = v < 69 ? v + 100 : v; break;
        case 'Y': if ((v = readNum(4)) === null) return false; tm.year = v - 1900; break;
        case 'z': { skipWs(); const m = /^([+-])(\d{2}):?(\d{2})/.exec(s.slice(pos)); if (!m) return false; tm.gmtoff = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60); pos += m[0].length; break; }
        case 'Z': { skipWs(); const m = /^[A-Za-z]+/.exec(s.slice(pos)); if (!m) return false; tm.zone = m[0]; pos += m[0].length; break; }
        case 'w': if ((v = readNum(1)) === null || v > 6) return false; tm.wday = v; break;
        case 'u': if ((v = readNum(1)) === null || v < 1 || v > 7) return false; tm.wday = v % 7; break;
        default: return false;
      }
    }
    return true;
  };
  if (!run(fmt)) return { tm, n: 0 };
  if (pm !== null) tm.hour = (tm.hour % 12) + (pm ? 12 : 0);
  const y = tm.year + 1900;
  if (have.date && tm.mday) {
    tm.yday = Math.round((Date.UTC(y, tm.mon, tm.mday) - Date.UTC(y, 0, 1)) / 86400000);
    const d = new Date(Date.UTC(y, tm.mon, tm.mday)); if (y < 100) d.setUTCFullYear(y);
    tm.wday = d.getUTCDay();
  } else if (have.yday) {
    const d = new Date(Date.UTC(y, 0, 1 + tm.yday)); tm.mon = d.getUTCMonth(); tm.mday = d.getUTCDate(); tm.wday = d.getUTCDay();
  }
  return { tm, n: pos + 1 };
}

function isLeapYearFn(args) {
  nargs('is_leap_year', args, 0, 1);
  if (!args.length) return bool(isLeap(new Date().getFullYear()));
  const t = toTensor(args[0]);
  const re = new Float64Array(t.re.length);
  for (let i = 0; i < re.length; i++) re[i] = isLeap(t.re[i]) ? 1 : 0;
  return boolT(t.dims, re);
}

// ------------------------------------------------------------- file names

function textMap(v, fn, what) {
  if (isCell(v) || (isString(v) && v.data.length !== 1)) {
    const { list, dims } = textList(v, what);
    return { many: true, dims, out: list.map((s) => fn(s || '')) };
  }
  return { many: false, out: [fn(S(v, what))] };
}
function canonicalize(ctx, f) {
  const p = absOf(ctx, f);
  if (!exists(ctx, p)) return null;
  return p;
}
function canonicalizeFn(args, nargout, ctx) {
  nargs('canonicalize_file_name', args, 1, 1);
  const f = S(args[0], 'FNAME');
  const p = f.length ? canonicalize(ctx, f) : null;
  if (p === null) return [charOrEmpty(''), num(-1), str('No such file or directory')];
  return [str(outPath(ctx, p)), num(0), charOrEmpty('')];
}
function makeAbsoluteFn(args, nargout, ctx) {
  nargs('make_absolute_filename', args, 1, 1);
  if (!isChar(args[0]) && !isString(args[0])) throw E('base:make_absolute_filename:invalidInput', 'make_absolute_filename: FILE argument must be a filename.');
  return str(outPath(ctx, absOf(ctx, S(args[0], 'FILE'))));
}
function isAbsoluteFn(args) {
  nargs('is_absolute_filename', args, 1, 1);
  const t = textArg(args[0]);
  return bool(t !== null && isAbsName(t));
}
function isRootedFn(args) {
  nargs('is_rooted_relative_filename', args, 1, 1);
  const t = textArg(args[0]);
  return bool(t !== null && /^\.\.?([\\/]|$)/.test(t));
}
function isSameFileFn(args, nargout, ctx) {
  nargs('is_same_file', args, 2, 2);
  const canon = (s) => { const p = s.length ? canonicalize(ctx, s) : null; return p === null ? null : isWin(ctx) ? p.toLowerCase() : p; };
  const a = args[0], b = args[1];
  const aMany = isCell(a) || (isString(a) && a.data.length !== 1), bMany = isCell(b) || (isString(b) && b.data.length !== 1);
  if (aMany && bMany) throw E('base:is_same_file:invalidInput', 'is_same_file: only one of FILEPATH1 and FILEPATH2 may be a cell array.');
  if (!aMany && !bMany) { const x = canon(S(a, 'FILEPATH1')), y = canon(S(b, 'FILEPATH2')); return bool(x !== null && x === y); }
  const one = canon(S(aMany ? b : a, 'FILEPATH'));
  const { list, dims } = textList(aMany ? a : b, 'FILEPATH');
  const re = Float64Array.from(list.map((s) => { const x = canon(s || ''); return x !== null && x === one ? 1 : 0; }));
  return boolT(dims, re);
}
function tildeExpandFn(args, nargout, ctx) {
  nargs('tilde_expand', args, 1, 1);
  const v = args[0];
  if (isCell(v)) return cell(v.dims, v.data.map((x) => str(tildeExpand(ctx, S(x, 'STRING')))));
  if (isString(v)) return stringArray(v.dims, v.data.map((x) => (x == null ? x : tildeExpand(ctx, x))));
  return charOrEmpty(tildeExpand(ctx, S(v, 'STRING')));
}
const MODE_DIR = 0o040000, MODE_REG = 0o100000;
function modeOf(st) { return st.isDir ? MODE_DIR | 0o755 : MODE_REG | 0o644; }
function modeString(mode) {
  const t = (mode & 0o170000) === MODE_DIR ? 'd' : '-';
  let s = t;
  for (let k = 2; k >= 0; k--) { const b = (mode >> (3 * k)) & 7; s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-'); }
  return s;
}
function statFn(name) {
  return (args, nargout, ctx) => {
    nargs(name, args, 1, 1);
    let f;
    if (isTensor(args[0]) && !isChar(args[0])) {
      const r = ctx.call('fopen', [args[0]], 1);
      f = textArg(first(r)) || '';
    } else f = S(args[0], 'FILE');
    const p = f ? absOf(ctx, f) : '';
    const st = p ? statOf(ctx, p) : null;
    if (!st) return [tensor('double', [0, 0]), num(-1), str('No such file or directory')];
    const secs = (st.mtimeMs || 0) / 1000;
    const mode = modeOf(st);
    const size = st.size || 0;
    const info = {
      dev: num(0), ino: num(0), mode: num(mode), modestr: str(modeString(mode)), nlink: num(1), uid: num(0), gid: num(0), rdev: num(0),
      size: num(size), atime: num(Math.floor(secs)), mtime: num(Math.floor(secs)), ctime: num(Math.floor(secs)), blksize: num(4096), blocks: num(Math.ceil(size / 512)),
    };
    return [structOf1(info), num(0), charOrEmpty('')];
  };
}
function modeTest(name, bits) {
  return (args) => {
    nargs(name, args, 1, 1);
    const t = toTensor(args[0]);
    if (t.re.length !== 1) throw E(`base:${name}:invalidInput`, `${name}: invalid MODE value.`);
    return bool((t.re[0] & 0o170000) === bits);
  };
}
function readdirFn(args, nargout, ctx) {
  nargs('readdir', args, 1, 1);
  const d = S(args[0], 'DIR');
  let list;
  try { list = ctx.fs.list(absOf(ctx, d)); } catch (e) {
    return [cell([0, 1], []), num(-1), str(String(e && e.message || 'No such file or directory'))];
  }
  const names = ['.', '..', ...list.map((x) => x.name)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [cell([names.length, 1], names.map((s) => str(s))), num(0), charOrEmpty('')];
}
function globRegex(part) {
  let re = '';
  for (let i = 0; i < part.length; i++) {
    const c = part[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const j = part.indexOf(']', i + 2);
      if (j < 0) { re += '\\['; continue; }
      let body = part.slice(i + 1, j);
      if (body[0] === '!' || body[0] === '^') body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
const hasWild = (s) => /[*?[]/.test(s);
function globOne(ctx, pattern) {
  const pat = tildeExpand(ctx, slash(pattern));
  const absPat = isAbsName(pat);
  const m = /^([A-Za-z]:)?\/*/.exec(pat);
  const root = absPat ? (m[1] ? m[1] + '/' : '/') : '';
  const parts = pat.slice(absPat ? m[0].length : 0).split('/').filter((x) => x !== '');
  let cur = [root];
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    const next = [];
    for (const base of cur) {
      const dirAbs = absPat ? (base || '/') : absOf(ctx, base || '.');
      if (!hasWild(part)) {
        const cand = base + (base && !base.endsWith('/') ? '/' : '') + part;
        if (exists(ctx, absPat ? cand : absOf(ctx, cand))) next.push(cand);
        continue;
      }
      let list = [];
      try { list = ctx.fs.list(dirAbs); } catch { list = []; }
      const re = globRegex(part);
      for (const e of list) {
        if (e.name.startsWith('.') && !part.startsWith('.')) continue;
        if (!re.test(e.name)) continue;
        if (k < parts.length - 1 && !e.isDir) continue;
        next.push(base + (base && !base.endsWith('/') ? '/' : '') + e.name);
      }
    }
    cur = next;
    if (!cur.length) break;
  }
  if (!parts.length) return exists(ctx, absOf(ctx, pat || '.')) ? [pat] : [];
  return cur.sort();
}
function globFn(args, nargout, ctx) {
  nargs('glob', args, 1, 1);
  const v = args[0];
  let pats;
  if (isChar(v)) pats = v.dims[0] > 1 ? textList(v).list.map((s) => s.replace(/ +$/, '')) : [S(v)];
  else if (isCell(v) || isString(v)) pats = textList(v, 'PATTERN').list.map((s) => s || '');
  else throw E('base:glob:invalidInput', 'glob: PATTERN must be a string or cell array of strings.');
  const out = [];
  for (const p of pats) for (const f of globOne(ctx, p)) out.push(outPath(ctx, f));
  return cell([out.length, 1], out.map((s) => str(s)));
}
function fileOp(name, op) {
  return (args, nargout, ctx) => {
    let err = 0, msg = '';
    try { op(args, ctx); } catch (e) {
      if (e && e.identifier) throw e;
      err = -1; msg = String((e && e.message) || 'operation failed');
    }
    if (err && nargout === 0) throw E(`base:${name}:operationFailed`, `${name}: operation failed: ${msg}`);
    return [num(err), charOrEmpty(msg)];
  };
}
const renameFn = fileOp('rename', (args, ctx) => {
  nargs('rename', args, 2, 2);
  const a = absOf(ctx, S(args[0], 'OLD')), b = absOf(ctx, S(args[1], 'NEW'));
  if (!exists(ctx, a)) throw new Error('No such file or directory');
  ctx.fs.rename(a, b);
});
const unlinkFn = fileOp('unlink', (args, ctx) => {
  nargs('unlink', args, 1, 1);
  const p = absOf(ctx, S(args[0], 'FILE'));
  const st = statOf(ctx, p);
  if (!st) throw new Error('No such file or directory');
  if (st.isDir) throw new Error('Is a directory');
  ctx.fs.remove(p);
});

// ------------------------------------------------------------- system information

function userDir(ctx, kind) {
  const p = platformOf(ctx);
  const home = homeOf(ctx).replace(/\/+$/, '');
  if (p === 'win') {
    const v = getEnv(ctx, kind === 'config' ? 'APPDATA' : 'LOCALAPPDATA');
    return slash(v || `${home}/AppData/${kind === 'config' ? 'Roaming' : 'Local'}`);
  }
  if (p === 'mac') return `${home}/Library/${kind === 'config' ? 'Preferences' : 'Application Support'}`;
  const xdg = getEnv(ctx, kind === 'config' ? 'XDG_CONFIG_HOME' : 'XDG_DATA_HOME');
  return slash(xdg || (kind === 'config' ? `${home}/.config` : `${home}/.local/share`));
}
function hostName(ctx) {
  const h = getEnv(ctx, 'COMPUTERNAME') || getEnv(ctx, 'HOSTNAME');
  if (h) return h;
  try { const r = ctx.fs.system('hostname'); const s = String(r && r.output || '').trim(); if (s) return s; } catch { /* ignore */ }
  return 'localhost';
}
function sessionPid(ctx) {
  const st = (ctx.state.octave ||= {});
  if (!st.pid) st.pid = 1000 + Math.floor(Math.random() * 64000);
  return st.pid;
}
function unameFn(args, nargout, ctx) {
  nargs('uname', args, 0, 0);
  const p = platformOf(ctx);
  const arch = (globalThis.process && globalThis.process.arch) || '';
  const machine = arch === 'arm64' ? (p === 'mac' ? 'arm64' : 'aarch64') : arch === 'ia32' ? 'i686' : 'x86_64';
  const release = '';
  const uts = { sysname: str(p === 'win' ? 'Windows_NT' : p === 'mac' ? 'Darwin' : 'Linux'), nodename: str(hostName(ctx)), release: charOrEmpty(release), version: charOrEmpty(''), machine: str(machine) };
  return [structOf1(uts), num(0), charOrEmpty('')];
}
function getrusageFn(args, nargout, ctx) {
  nargs('getrusage', args, 0, 0);
  const t = toTensor(call1(ctx, 'cputime', [])).re[0];
  const tv = (x) => structOf1({ sec: num(Math.floor(x)), usec: num(Math.round((x - Math.floor(x)) * 1e6)) });
  let rss = 0;
  try { if (globalThis.process && globalThis.process.memoryUsage) rss = Math.round(globalThis.process.memoryUsage().rss / 1024); } catch { /* ignore */ }
  const r = {
    utime: tv(t), stime: tv(0), maxrss: num(rss), ixrss: num(0), idrss: num(0), isrss: num(0), minflt: num(0), majflt: num(0), nswap: num(0),
    inblock: num(0), oublock: num(0), msgsnd: num(0), msgrcv: num(0), nsignals: num(0), nvcsw: num(0), nivcsw: num(0),
  };
  return structOf1(r);
}
function nprocFn(args) {
  nargs('nproc', args, 0, 1);
  if (args.length) {
    const q = S(args[0], 'QUERY').toLowerCase();
    if (!['all', 'current', 'overridable'].includes(q)) throw E('base:nproc:invalidQuery', 'nproc: invalid value for QUERY.');
  }
  const n = (globalThis.navigator && globalThis.navigator.hardwareConcurrency) || 1;
  return num(n);
}
function licenseFn(args, nargout, ctx) {
  nargs('license', args, 0, 3);
  const features = ['mysimulationmath'];
  if (!args.length) return str('MIT');
  const cmd = S(args[0], 'COMMAND').toLowerCase();
  if (cmd === 'inuse') {
    if (nargout > 0) return struct([1, 1], ['feature', 'user'], [{ feature: str(features[0]), user: str(getEnv(ctx, 'USERNAME') || getEnv(ctx, 'USER') || '') }]);
    ctx.out(features.join('\n') + '\n');
    return undefined;
  }
  if (cmd === 'test' || cmd === 'checkout') {
    if (args.length < 2) throw E('base:license:notEnoughInputs', `license: FEATURE name is required for "${cmd}".`);
    const f = S(args[1], 'FEATURE').toLowerCase();
    const ok = features.includes(f);
    if (cmd === 'test') return bool(ok);
    return [bool(ok), charOrEmpty(ok ? '' : `No license for ${f}`)];
  }
  throw E('base:license:invalidCommand', `license: invalid call: '${cmd}'.`);
}

// ------------------------------------------------------------- preferences

const APP_DIR = 'MySimulationMath';
function prefDir(ctx) { return `${userDir(ctx, 'config').replace(/\/+$/, '')}/${APP_DIR}`; }
const prefFile = (ctx) => `${prefDir(ctx)}/prefs.json`;
function encodeValue(v) {
  if (isTensor(v)) {
    const nums = (a) => Array.from(a, (x) => (Number.isFinite(x) ? x : String(x)));
    return { t: 'T', cls: v.cls, dims: v.dims, re: nums(v.re), im: v.im ? nums(v.im) : null };
  }
  if (isSparse(v)) return encodeValue(toTensor(v));
  if (isString(v)) return { t: 'Str', dims: v.dims, data: v.data };
  if (isCell(v)) return { t: 'C', dims: v.dims, data: v.data.map(encodeValue) };
  if (isStruct(v)) return { t: 'S', dims: v.dims, fields: v.fields, data: v.data.map((r) => Object.fromEntries(v.fields.map((f) => [f, encodeValue(r[f])]))) };
  throw E('base:setpref:unsupportedValue', `Preference values of class '${v.cls}' cannot be stored.`);
}
function decodeValue(o) {
  const nums = (a) => Float64Array.from(a, (x) => (typeof x === 'string' ? Number(x) : x));
  if (o.t === 'T') return tensor(o.cls, o.dims, nums(o.re), o.im ? nums(o.im) : null);
  if (o.t === 'Str') return stringArray(o.dims, o.data);
  if (o.t === 'C') return cell(o.dims, o.data.map(decodeValue));
  if (o.t === 'S') return struct(o.dims, o.fields, o.data.map((r) => Object.fromEntries(o.fields.map((f) => [f, decodeValue(r[f])]))));
  return tensor('double', [0, 0]);
}
function loadPrefs(ctx) {
  const f = prefFile(ctx);
  try { if (ctx.fs.exists(f)) return JSON.parse(ctx.fs.readText(f)) || {}; } catch { /* corrupt file: start fresh */ }
  return {};
}
function savePrefs(ctx, prefs) {
  ctx.fs.mkdir(prefDir(ctx));
  ctx.fs.writeText(prefFile(ctx), JSON.stringify(prefs));
}
function prefNames(v, fname) {
  if (isCell(v) || isString(v)) return textList(v, 'PREF').list.map((s) => s || '');
  const t = textArg(v);
  if (t === null) throw E(`base:${fname}:invalidInput`, `${fname}: PREF must be a string or cellstr.`);
  return [t];
}
function prefValues(v, n, fname) {
  if (n === 1 && !(isCell(v) && false)) return [v];
  if (!isCell(v) || v.data.length !== n) throw E(`base:${fname}:sizeMismatch`, `${fname}: size mismatch between PREF and VAL.`);
  return v.data;
}
function groupArg(v, fname) {
  const g = textArg(v);
  if (g === null) throw E(`base:${fname}:invalidInput`, `${fname}: GROUP must be a string.`);
  return g;
}
const groupStruct = (grp) => struct([1, 1], Object.keys(grp), [Object.fromEntries(Object.entries(grp).map(([k, x]) => [k, decodeValue(x)]))]);
function addprefFn(args, nargout, ctx) {
  nargs('addpref', args, 3, 3);
  const g = groupArg(args[0], 'addpref');
  const names = prefNames(args[1], 'addpref');
  const vals = names.length === 1 ? [args[2]] : prefValues(args[2], names.length, 'addpref');
  const prefs = loadPrefs(ctx);
  const grp = prefs[g] || {};
  for (const n of names) if (n in grp) throw E('base:addpref:prefExists', `addpref: preference ${n} already exists in group ${g}.`);
  names.forEach((n, i) => { grp[n] = encodeValue(vals[i]); });
  prefs[g] = grp;
  savePrefs(ctx, prefs);
  return undefined;
}
function setprefFn(args, nargout, ctx) {
  nargs('setpref', args, 3, 3);
  const g = groupArg(args[0], 'setpref');
  const names = prefNames(args[1], 'setpref');
  const vals = names.length === 1 ? [args[2]] : prefValues(args[2], names.length, 'setpref');
  const prefs = loadPrefs(ctx);
  const grp = prefs[g] || {};
  names.forEach((n, i) => { grp[n] = encodeValue(vals[i]); });
  prefs[g] = grp;
  savePrefs(ctx, prefs);
  return undefined;
}
function getprefFn(args, nargout, ctx) {
  nargs('getpref', args, 0, 3);
  const prefs = loadPrefs(ctx);
  if (!args.length) return struct([1, 1], Object.keys(prefs), [Object.fromEntries(Object.entries(prefs).map(([g, grp]) => [g, groupStruct(grp)]))]);
  const g = groupArg(args[0], 'getpref');
  const grp = prefs[g];
  if (args.length === 1) {
    if (!grp) throw E('base:getpref:noGroup', `getpref: preference group "${g}" does not exist.`);
    return groupStruct(grp);
  }
  const names = prefNames(args[1], 'getpref');
  const many = isCell(args[1]) || (isString(args[1]) && args[1].data.length !== 1);
  const defs = args.length > 2 ? (many ? prefValues(args[2], names.length, 'getpref') : [args[2]]) : null;
  const vals = names.map((n, i) => {
    if (grp && n in grp) return decodeValue(grp[n]);
    if (defs) { setprefFn([args[0], str(n), defs[i]], 0, ctx); return defs[i]; }
    throw E('base:getpref:noPref', `getpref: preference "${n}" does not exist in group "${g}".`);
  });
  return many ? cell(isCell(args[1]) ? args[1].dims : [1, names.length], vals) : vals[0];
}
function isprefFn(args, nargout, ctx) {
  nargs('ispref', args, 1, 2);
  const prefs = loadPrefs(ctx);
  const g = groupArg(args[0], 'ispref');
  if (args.length === 1) return bool(g in prefs);
  const grp = prefs[g] || {};
  if (isCell(args[1]) || (isString(args[1]) && args[1].data.length !== 1)) {
    const { list, dims } = textList(args[1], 'PREF');
    return boolT(dims, Float64Array.from(list.map((n) => (n in grp ? 1 : 0))));
  }
  return bool(S(args[1], 'PREF') in grp);
}
function rmprefFn(args, nargout, ctx) {
  nargs('rmpref', args, 1, 2);
  const prefs = loadPrefs(ctx);
  const g = groupArg(args[0], 'rmpref');
  if (!(g in prefs)) throw E('base:rmpref:noGroup', `rmpref: group <${g}> does not exist.`);
  if (args.length === 1) delete prefs[g];
  else {
    const names = prefNames(args[1], 'rmpref');
    for (const n of names) if (!(n in prefs[g])) throw E('base:rmpref:noPref', `rmpref: pref <${n}> does not exist.`);
    for (const n of names) delete prefs[g][n];
  }
  savePrefs(ctx, prefs);
  return undefined;
}
function prefdirFn(args, nargout, ctx) {
  nargs('prefdir', args, 0, 1);
  const d = prefDir(ctx);
  if (args.length && scalarNum(args[0], 'prefdir') === 1 && !exists(ctx, d)) ctx.fs.mkdir(d);
  if (nargout === 0 && !args.length) { ctx.out(outPath(ctx, d) + '\n'); return undefined; }
  return str(outPath(ctx, d));
}

// ------------------------------------------------------------- settings

function settingsOf(ctx) { return (ctx.state.octaveSettings ||= {}); }
/** A query/set internal variable: v = f(), old = f(new), old = f(new, "local"). */
function setting(name, { def, check, apply, read }) {
  return (args, nargout, ctx) => {
    nargs(name, args, 0, 2);
    if (args.length === 2 && (textArg(args[1]) || '').toLowerCase() !== 'local') throw E(`base:${name}:invalidOption`, `${name}: second argument must be "local".`);
    const st = settingsOf(ctx);
    const cur = read ? read(ctx, st) : (name in st ? st[name] : typeof def === 'function' ? def(ctx) : def);
    if (!args.length) return cur;
    const nv = check(args[0], ctx);
    st[name] = nv;
    if (apply) apply(ctx, nv, st);
    return nargout > 0 ? cur : undefined;
  };
}
const logicalSetting = (name) => (v) => {
  if (!(isTensor(v) || isSparse(v)) || count(v) !== 1) throw E(`base:${name}:invalidInput`, `${name}: argument must be a logical value.`);
  return bool(toTensor(v).re[0] !== 0);
};
const intSetting = (name, lo, hi) => (v) => {
  const x = (isTensor(v) || isSparse(v)) && count(v) === 1 ? toTensor(v).re[0] : NaN;
  if (!Number.isInteger(x) || x < lo || x > hi) throw E(`base:${name}:invalidInput`, `${name}: argument must be an integer value between ${lo} and ${hi}.`);
  return num(x);
};
const textSetting = (name, allowEmpty = true) => (v) => {
  const t = textArg(v);
  if (t === null || (!allowEmpty && !t.length)) throw E(`base:${name}:invalidInput`, `${name}: argument must be a string.`);
  return charOrEmpty(t);
};
const fmtNumeric = (ctx) => String((ctx.format && ctx.format.numeric) || 'short').toLowerCase();
const settings = {
  output_precision: setting('output_precision', {
    read(ctx, st) {
      const s = st.__outputPrecision;
      if (s && s.numeric === fmtNumeric(ctx)) return num(s.value);
      delete st.__outputPrecision; // `format` changed it since
      return num(/long/.test(fmtNumeric(ctx)) ? 16 : 5);
    },
    check: intSetting('output_precision', 0, 16),
    apply(ctx, v, st) {
      const n = v.re[0];
      if (!ctx.format) ctx.format = { numeric: 'short', spacing: 'loose' };
      const isG = /g$/.test(fmtNumeric(ctx)), isE = /e$/.test(fmtNumeric(ctx));
      ctx.format.numeric = (n > 5 ? 'long' : 'short') + (isG ? 'G' : isE ? 'E' : '');
      st.__outputPrecision = { value: n, numeric: fmtNumeric(ctx) };
      delete st.output_precision;
    },
  }),
  fixed_point_format: setting('fixed_point_format', { def: bool(false), check: logicalSetting('fixed_point_format') }),
  print_empty_dimensions: setting('print_empty_dimensions', { def: bool(true), check: logicalSetting('print_empty_dimensions') }),
  split_long_rows: setting('split_long_rows', { def: bool(true), check: logicalSetting('split_long_rows') }),
  print_struct_array_contents: setting('print_struct_array_contents', { def: bool(false), check: logicalSetting('print_struct_array_contents') }),
  struct_levels_to_print: setting('struct_levels_to_print', { def: num(2), check: intSetting('struct_levels_to_print', 0, 2 ** 31 - 1) }),
  string_fill_char: setting('string_fill_char', {
    def: str(' '),
    check(v) { const t = textArg(v); if (t === null || t.length !== 1) throw E('base:string_fill_char:invalidInput', 'string_fill_char: argument must be a single character.'); return str(t); },
  }),
  whos_line_format: setting('whos_line_format', { def: str('  %la:5; %ln:6; %cs:16:6:1;  %rb:12;  %lc:-1;\n'), check: textSetting('whos_line_format') }),
  confirm_recursive_rmdir: setting('confirm_recursive_rmdir', { def: bool(true), check: logicalSetting('confirm_recursive_rmdir') }),
  ls_command: setting('ls_command', { def: (ctx) => str(isWin(ctx) ? 'dir /D' : 'ls -C'), check: textSetting('ls_command', false) }),
};
function recycleFn(args, nargout, ctx) {
  nargs('recycle', args, 0, 1);
  if (!args.length) return str('off');
  const s = S(args[0], 'STATE').toLowerCase();
  if (s === 'off') return nargout > 0 ? str('off') : undefined;
  if (s === 'on') throw E('base:recycle:notAvailable', 'recycle: "on" state is not supported (deleted files are removed permanently).');
  throw E('base:recycle:invalidState', 'recycle: invalid value of STATE = "' + s + '".');
}
function terminalSizeFn(args, nargout, ctx) {
  nargs('terminal_size', args, 0, 0);
  const f = ctx.format || {};
  return tensor('double', [1, 2], [f.height || 24, f.width || 80]);
}

// ------------------------------------------------------------- questions

function ask(ctx, prompt) {
  const reply = ctx.host && ctx.host.request ? ctx.host.request({ type: 'input', prompt, text: true }) : null;
  if (reply == null) throw E('base:input:unavailable', 'Input is not available (no interactive Command Window).');
  const text = typeof reply === 'string' ? reply : String(reply.text ?? reply.value ?? '');
  ctx.out(prompt + text + '\n');
  return text;
}
function menuFn(args, nargout, ctx) {
  if (args.length < 2) throw E('base:menu:notEnoughInputs', 'menu: at least one option is required.');
  const title = S(args[0], 'TITLE');
  let opts;
  if (args.length === 2 && (isCell(args[1]) || isString(args[1]))) opts = textList(args[1], 'OPTIONS').list.map((s) => s || '');
  else opts = args.slice(1).map((a) => S(a, 'OPTION'));
  let text = title ? `${title}\n` : '';
  opts.forEach((o, i) => { text += `  [${String(i + 1).padStart(2)}] ${o}\n`; });
  ctx.out(text + '\n');
  for (let tries = 0; tries < 100; tries++) {
    const ans = ask(ctx, 'Select a number: ').trim();
    const k = Number(ans);
    if (Number.isInteger(k) && k >= 1 && k <= opts.length) return num(k);
    if (ans === '') return num(0);
    ctx.out('Error: input invalid or out of range\n');
  }
  return num(0);
}
function yesOrNoFn(args, nargout, ctx) {
  nargs('yes_or_no', args, 0, 1);
  const prompt = (args.length ? S(args[0], 'PROMPT') : '') + '(yes or no) ';
  for (let tries = 0; tries < 100; tries++) {
    const a = ask(ctx, prompt).trim().toLowerCase();
    if (a === 'yes') return bool(true);
    if (a === 'no') return bool(false);
    ctx.out('Please answer yes or no.\n');
  }
  return bool(false);
}

// ------------------------------------------------------------- temporary files

const RAND_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function mkstempFn(args, nargout, ctx) {
  nargs('mkstemp', args, 1, 2);
  const tpl = S(args[0], 'TEMPLATE');
  if (!tpl.endsWith('XXXXXX')) throw E('base:mkstemp:invalidTemplate', 'mkstemp: TEMPLATE argument must end with "XXXXXX".');
  for (let tries = 0; tries < 100; tries++) {
    let name = tpl.slice(0, -6);
    for (let i = 0; i < 6; i++) name += RAND_CHARS[Math.floor(Math.random() * RAND_CHARS.length)];
    const p = absOf(ctx, name);
    if (exists(ctx, p)) continue;
    const r = ctx.call('fopen', [str(outPath(ctx, p)), str('w+')], 2);
    const fid = toTensor(r[0]).re[0];
    if (fid < 0) return [num(-1), charOrEmpty(''), r[1] || str('mkstemp: cannot create file')];
    if (args.length > 1) scalarNum(args[1], 'mkstemp', 'DELETE');
    return [num(fid), str(outPath(ctx, p)), charOrEmpty('')];
  }
  return [num(-1), charOrEmpty(''), str('mkstemp: unable to create a unique file name')];
}
function tmpfileFn(args, nargout, ctx) {
  nargs('tmpfile', args, 0, 0);
  const name = textArg(call1(ctx, 'tempname', []));
  const r = ctx.call('fopen', [str(name), str('w+')], 2);
  const fid = toTensor(r[0]).re[0];
  return [num(fid), fid >= 0 ? charOrEmpty('') : (r[1] || str('tmpfile: cannot create file'))];
}

// ------------------------------------------------------------- archives

function filesFrom(ctx, v, fname) {
  let names;
  if (isCell(v) || isString(v)) names = textList(v, 'FILES').list.map((s) => s || '');
  else names = [S(v, 'FILES')];
  const out = [];
  for (const n of names) {
    const hits = hasWild(n) ? globOne(ctx, n) : [n];
    if (!hits.length) throw E(`base:${fname}:noFiles`, `${fname}: no files match '${n}'.`);
    for (const h of hits) {
      const p = absOf(ctx, h);
      const st = statOf(ctx, p);
      if (!st) throw E(`base:${fname}:fileNotFound`, `${fname}: file '${n}' does not exist.`);
      if (!st.isDir) out.push(p);
    }
  }
  return out;
}
const baseNameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const dirNameOf = (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
function bzip2Fn(args, nargout, ctx) {
  nargs('bzip2', args, 1, 2);
  const files = filesFrom(ctx, args[0], 'bzip2');
  const dir = args.length > 1 ? absOf(ctx, S(args[1], 'DIR')) : null;
  if (dir) ctx.fs.mkdir(dir);
  const out = [];
  for (const f of files) {
    const target = (dir || dirNameOf(f)).replace(/\/+$/, '') + '/' + baseNameOf(f) + '.bz2';
    ctx.fs.writeBytes(target, bzip2Compress(ctx.fs.readBytes(f)));
    if (!dir) ctx.fs.remove(f);
    out.push(outPath(ctx, target));
  }
  return nargout > 0 ? cell([out.length, 1], out.map((s) => str(s))) : undefined;
}
function bunzip2Fn(args, nargout, ctx) {
  nargs('bunzip2', args, 1, 2);
  const files = filesFrom(ctx, args[0], 'bunzip2');
  const dir = args.length > 1 ? absOf(ctx, S(args[1], 'DIR')) : null;
  if (dir) ctx.fs.mkdir(dir);
  const out = [];
  for (const f of files) {
    const base = baseNameOf(f);
    const plain = /\.tbz2?$/i.test(base) ? base.replace(/\.tbz2?$/i, '.tar') : base.replace(/\.bz2$/i, '');
    const target = (dir || dirNameOf(f)).replace(/\/+$/, '') + '/' + (plain === base ? base + '.out' : plain);
    let data;
    try { data = bzip2Decompress(ctx.fs.readBytes(f)); } catch (e) { throw E('base:bunzip2:invalidData', `bunzip2: ${base}: ${e.message}`); }
    ctx.fs.writeBytes(target, data);
    out.push(outPath(ctx, target));
  }
  return nargout > 0 ? cell([out.length, 1], out.map((s) => str(s))) : undefined;
}
function unpackFn(args, nargout, ctx) {
  nargs('unpack', args, 1, 3);
  const file = S(args[0], 'FILE');
  const p = absOf(ctx, file);
  if (!exists(ctx, p)) throw E('base:unpack:fileNotFound', `unpack: file "${file}" not found.`);
  const dir = args.length > 1 && count(args[1]) ? absOf(ctx, S(args[1], 'DIR')) : dirNameOf(p);
  let type = args.length > 2 ? S(args[2], 'FILETYPE').toLowerCase().replace(/^\./, '') : '';
  const low = baseNameOf(p).toLowerCase();
  if (!type) {
    if (/\.(tar\.gz|tgz)$/.test(low)) type = 'tar.gz';
    else if (/\.(tar\.bz2|tbz2?|tar\.bz)$/.test(low)) type = 'tar.bz2';
    else { const m = /\.([^.]+)$/.exec(low); type = m ? m[1] : ''; }
  }
  const pathArg = str(outPath(ctx, p)), dirArg = str(outPath(ctx, dir));
  let names;
  const listOf = (v) => (v && (isCell(v) || isString(v)) ? textList(v).list : []);
  if (type === 'zip') names = listOf(call1(ctx, 'unzip', [pathArg, dirArg]));
  else if (type === 'tar' || type === 'tar.gz' || type === 'tgz') names = listOf(call1(ctx, 'untar', [pathArg, dirArg]));
  else if (type === 'gz' || type === 'gzip') names = listOf(call1(ctx, 'gunzip', [pathArg, dirArg]));
  else if (type === 'bz2' || type === 'bzip2' || type === 'bz') names = listOf(first(bunzip2Fn([pathArg, dirArg], 1, ctx)));
  else if (type === 'tar.bz2' || type === 'tbz' || type === 'tbz2') {
    const tmp = `${slash(ctx.fs.tempDir()).replace(/\/+$/, '')}/unpack_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tar`;
    ctx.fs.writeBytes(tmp, bzip2Decompress(ctx.fs.readBytes(p)));
    try { names = listOf(call1(ctx, 'untar', [str(outPath(ctx, tmp)), dirArg])); } finally { try { ctx.fs.remove(tmp); } catch { /* ignore */ } }
  } else throw E('base:unpack:unknownType', `unpack: unable to unpack files of type "${type || low}".`);
  const cellOut = cell([names.length, 1], names.map((s) => str(outPath(ctx, slash(s)))));
  if (nargout > 0) return cellOut;
  return undefined;
}

// ------------------------------------------------------------- builtins

const H = (en, ko, syntax) => ({ en, ko, syntax });
const settingHelp = (name, en, ko) => H(`${en} Query with v = ${name}(), set with old = ${name}(new_val) or ${name}(new_val, "local").`, `${ko} v = ${name}() 로 조회, old = ${name}(new_val) 또는 ${name}(new_val, "local") 로 설정.`, [`val = ${name}()`, `old_val = ${name}(new_val)`, `${name}(new_val, "local")`]);

export const builtins = {
  time() { return num(Date.now() / 1000); },
  localtime: (args) => tmToValue(tmFromSeconds(timeArg(args, 'localtime'), false)),
  gmtime: (args) => tmToValue(tmFromSeconds(timeArg(args, 'gmtime'), true)),
  mktime(args) { nargs('mktime', args, 1, 1); return num(mktimeOf(tmFromValue(args[0], 'mktime'))); },
  asctime(args) { nargs('asctime', args, 1, 1); return str(strftimeText('%a %b %d %H:%M:%S %Y\n', tmFromValue(args[0], 'asctime'))); },
  ctime(args) { const t = timeArg(args, 'ctime'); return str(strftimeText('%a %b %d %H:%M:%S %Y\n', tmFromSeconds(t, false))); },
  strftime(args) {
    nargs('strftime', args, 2, 2);
    return charOrEmpty(strftimeText(S(args[0], 'FMT'), tmFromValue(args[1], 'strftime')));
  },
  strptime(args) {
    nargs('strptime', args, 2, 2);
    const { tm, n } = strptimeParse(S(args[0], 'STR'), S(args[1], 'FMT'));
    return [tmToValue(tm), num(n)];
  },
  is_leap_year: isLeapYearFn,
  canonicalize_file_name: canonicalizeFn, make_absolute_filename: makeAbsoluteFn,
  is_absolute_filename: isAbsoluteFn, is_rooted_relative_filename: isRootedFn, is_same_file: isSameFileFn,
  tilde_expand: tildeExpandFn, stat: statFn('stat'), lstat: statFn('lstat'),
  S_ISDIR: modeTest('S_ISDIR', MODE_DIR), S_ISREG: modeTest('S_ISREG', MODE_REG),
  readdir: readdirFn, glob: globFn, rename: renameFn, unlink: unlinkFn,
  chdir: (args, nargout, ctx) => ctx.call('cd', args, nargout),
  putenv: (args, nargout, ctx) => ctx.call('setenv', args, nargout),
  isenv(args, nargout, ctx) { nargs('isenv', args, 1, 1); return bool(getEnv(ctx, S(args[0], 'VAR')) !== null); },
  get_home_directory(args, nargout, ctx) { nargs('get_home_directory', args, 0, 0); return str(outPath(ctx, homeOf(ctx))); },
  P_tmpdir(args, nargout, ctx) { nargs('P_tmpdir', args, 0, 0); return str(outPath(ctx, slash(ctx.fs.tempDir()))); },
  user_config_dir(args, nargout, ctx) { nargs('user_config_dir', args, 0, 0); return str(outPath(ctx, userDir(ctx, 'config'))); },
  user_data_dir(args, nargout, ctx) { nargs('user_data_dir', args, 0, 0); return str(outPath(ctx, userDir(ctx, 'data'))); },
  gethostname(args, nargout, ctx) { nargs('gethostname', args, 0, 0); return str(hostName(ctx)); },
  getpid(args, nargout, ctx) { nargs('getpid', args, 0, 0); return num(sessionPid(ctx)); },
  uname: unameFn, getrusage: getrusageFn, nproc: nprocFn, license: licenseFn,
  isieee() { return bool(true); },
  isstudent() { return bool(false); },
  pack() { return undefined; },
  addpref: addprefFn, setpref: setprefFn, getpref: getprefFn, ispref: isprefFn, rmpref: rmprefFn, prefdir: prefdirFn,
  ...settings,
  recycle: recycleFn, terminal_size: terminalSizeFn,
  menu: menuFn, yes_or_no: yesOrNoFn,
  mkstemp: mkstempFn, tmpfile: tmpfileFn,
  bzip2: bzip2Fn, bunzip2: bunzip2Fn, unpack: unpackFn,
};

export const help = {
  time: H('Current time in seconds since the epoch (1970-01-01 00:00:00 UTC).', '에포크(1970-01-01 00:00:00 UTC) 이후 현재 시각(초).', ['t = time()']),
  localtime: H('Time struct (usec, sec, min, hour, mday, mon, year, wday, yday, isdst, gmtoff, zone) in local time.', '지역 시간 기준 시간 구조체 (usec, sec, min, hour, mday, mon, year, wday, yday, isdst, gmtoff, zone).', ['tm_struct = localtime(t)']),
  gmtime: H('Time struct in Coordinated Universal Time (UTC).', '협정 세계시(UTC) 기준 시간 구조체.', ['tm_struct = gmtime(t)']),
  mktime: H('Convert a local time struct to seconds since the epoch.', '지역 시간 구조체를 에포크 이후 초로 변환.', ['seconds = mktime(tm_struct)']),
  asctime: H("Time struct as text in the form 'Sun Jan 02 15:04:05 2022' plus newline.", "시간 구조체를 'Sun Jan 02 15:04:05 2022' 형식의 텍스트(줄바꿈 포함)로.", ['str = asctime(tm_struct)']),
  ctime: H('Seconds since the epoch as local time text (same as asctime(localtime(t))).', '에포크 이후 초를 지역 시간 텍스트로 (asctime(localtime(t)) 와 같음).', ['str = ctime(t)']),
  strftime: H('Format a time struct with % conversions (%Y, %m, %d, %H, %M, %S, %a, %b, %j, %Z, ...).', '% 변환(%Y, %m, %d, %H, %M, %S, %a, %b, %j, %Z, ...)으로 시간 구조체를 서식화.', ['str = strftime(fmt, tm_struct)']),
  strptime: H('Parse text with a % format into a time struct; nchars is the position after the match (0 on failure).', '% 서식으로 텍스트를 시간 구조체로 해석; nchars 는 일치 다음 위치(실패 시 0).', ['[tm_struct, nchars] = strptime(str, fmt)']),
  is_leap_year: H('True for leap years (default: the current year).', '윤년이면 참 (기본: 올해).', ['tf = is_leap_year()', 'tf = is_leap_year(year)']),
  canonicalize_file_name: H('Absolute canonical name of an existing file; status is -1 and msg set if it does not exist.', '존재하는 파일의 절대 정규 이름; 없으면 status -1 과 msg.', ['[cname, status, msg] = canonicalize_file_name(fname)']),
  make_absolute_filename: H('Absolute file name from a relative one (the file need not exist).', '상대 이름에서 절대 파일 이름을 만듦 (파일이 없어도 됨).', ['abs_fname = make_absolute_filename(file)']),
  is_absolute_filename: H('True if the name is an absolute path.', '이름이 절대 경로이면 참.', ['tf = is_absolute_filename(file)']),
  is_rooted_relative_filename: H("True if the name starts with './' or '../'.", "이름이 './' 또는 '../' 로 시작하면 참.", ['tf = is_rooted_relative_filename(file)']),
  is_same_file: H('True if two names refer to the same existing file.', '두 이름이 같은 기존 파일을 가리키면 참.', ['same = is_same_file(filepath1, filepath2)']),
  tilde_expand: H("Expand a leading '~' to the home folder.", "앞의 '~' 를 홈 폴더로 확장.", ['newstr = tilde_expand(string)']),
  stat: H('File status struct (mode, modestr, size, mtime, ...); err is -1 if the file does not exist.', '파일 상태 구조체 (mode, modestr, size, mtime, ...); 파일이 없으면 err = -1.', ['[info, err, msg] = stat(file)', '[info, err, msg] = stat(fid)']),
  lstat: H('Same as stat (symbolic links are not distinguished here).', 'stat 과 같음 (여기서는 심볼릭 링크를 구분하지 않음).', ['[info, err, msg] = lstat(symlink)']),
  S_ISDIR: H('True if a stat mode value describes a folder.', 'stat 의 mode 값이 폴더이면 참.', ['tf = S_ISDIR(mode)']),
  S_ISREG: H('True if a stat mode value describes a regular file.', 'stat 의 mode 값이 일반 파일이면 참.', ['tf = S_ISREG(mode)']),
  readdir: H("Sorted folder entries (including '.' and '..') as a cell column.", "정렬된 폴더 항목('.', '..' 포함)을 셀 열로.", ['[files, err, msg] = readdir(dir)']),
  glob: H('Expand wildcard patterns (*, ?, [...]) into the matching file names.', '와일드카드 패턴(*, ?, [...])을 일치하는 파일 이름으로 확장.', ['cstr = glob(pattern)']),
  rename: H('Rename or move a file; err is nonzero on failure (error when no output is requested).', '파일 이름 바꾸기/이동; 실패 시 err 가 0 이 아님 (출력이 없으면 오류).', ['rename(old, new)', '[err, msg] = rename(old, new)']),
  unlink: H('Delete a file; err is nonzero on failure (error when no output is requested).', '파일 삭제; 실패 시 err 가 0 이 아님 (출력이 없으면 오류).', ['unlink(file)', '[err, msg] = unlink(file)']),
  chdir: H('Change the current folder (same as cd).', '현재 폴더 변경 (cd 와 같음).', ['chdir(dir)', 'old_dir = chdir(dir)']),
  putenv: H('Set an environment variable (same as setenv).', '환경 변수 설정 (setenv 와 같음).', ['putenv(var, value)']),
  isenv: H('True if the environment variable exists.', '환경 변수가 있으면 참.', ['tf = isenv(var)']),
  get_home_directory: H('Home folder of the current user.', '현재 사용자의 홈 폴더.', ['homedir = get_home_directory()']),
  P_tmpdir: H('Default folder for temporary files.', '임시 파일의 기본 폴더.', ['dir = P_tmpdir()']),
  user_config_dir: H('Folder for per-user configuration files.', '사용자별 설정 파일 폴더.', ['cfg_dir = user_config_dir()']),
  user_data_dir: H('Folder for per-user data files.', '사용자별 데이터 파일 폴더.', ['data_dir = user_data_dir()']),
  gethostname: H('Name of the computer.', '컴퓨터 이름.', ['name = gethostname()']),
  getpid: H('Identifier of the current engine session (stable for the session).', '현재 엔진 세션의 식별자 (세션 동안 고정).', ['pid = getpid()']),
  uname: H('System information struct (sysname, nodename, release, version, machine).', '시스템 정보 구조체 (sysname, nodename, release, version, machine).', ['[uts, err, msg] = uname()']),
  getrusage: H('Resource usage struct (utime, stime, maxrss, ...).', '자원 사용량 구조체 (utime, stime, maxrss, ...).', ['procstats = getrusage()']),
  nproc: H('Number of processors available.', '사용 가능한 프로세서 수.', ['n = nproc()', "n = nproc('all')"]),
  license: H("License of this program ('MIT'), features in use, or a feature test.", "이 프로그램의 라이선스('MIT'), 사용 중 기능, 또는 기능 검사.", ['license', "license('inuse')", "tf = license('test', feature)", "[tf, errmsg] = license('checkout', feature)"]),
  isieee: H('True if the computer uses IEEE floating point (always true).', '컴퓨터가 IEEE 부동소수점을 쓰면 참 (항상 참).', ['tf = isieee()']),
  isstudent: H('True for a student edition (always false).', '학생판이면 참 (항상 거짓).', ['tf = isstudent()']),
  pack: H('Consolidate workspace memory (nothing to do here; memory is managed automatically).', '작업 공간 메모리 정리 (자동 관리되므로 할 일 없음).', ['pack']),
  addpref: H('Add a persistent preference value to a group (error if it already exists).', '그룹에 영구 기본 설정 값을 추가 (이미 있으면 오류).', ['addpref(group, pref, val)', 'addpref(group, {pref1, pref2}, {val1, val2})']),
  setpref: H('Set a persistent preference value (created if needed).', '영구 기본 설정 값을 설정 (필요하면 생성).', ['setpref(group, pref, val)', 'setpref(group, {pref1, pref2}, {val1, val2})']),
  getpref: H('Get preference values; with a default the preference is created if missing.', '기본 설정 값 가져오기; 기본값을 주면 없을 때 생성.', ['prefs = getpref()', 'prefs = getpref(group)', 'val = getpref(group, pref)', 'val = getpref(group, pref, default)']),
  ispref: H('True if a preference group or preference exists.', '기본 설정 그룹이나 항목이 있으면 참.', ['tf = ispref(group)', 'tf = ispref(group, pref)']),
  rmpref: H('Remove a preference or a whole preference group.', '기본 설정 항목 또는 그룹 전체를 제거.', ['rmpref(group)', 'rmpref(group, pref)']),
  prefdir: H('Folder where preferences are stored (prefdir(1) creates it).', '기본 설정을 저장하는 폴더 (prefdir(1) 은 폴더를 만듦).', ['dir = prefdir', 'dir = prefdir(1)']),
  output_precision: settingHelp('output_precision', 'Number of significant digits shown by the Command Window (values above 5 select format long).', '명령 창이 표시하는 유효 숫자 수 (5 보다 크면 format long).'),
  fixed_point_format: settingHelp('fixed_point_format', 'Setting: print matrices with a common scale factor.', '설정: 공통 배율로 행렬 출력.'),
  print_empty_dimensions: settingHelp('print_empty_dimensions', 'Setting: show the dimensions of empty matrices.', '설정: 빈 행렬의 차원 표시.'),
  split_long_rows: settingHelp('split_long_rows', 'Setting: split long matrix rows into column chunks.', '설정: 긴 행렬 행을 열 묶음으로 나눔.'),
  print_struct_array_contents: settingHelp('print_struct_array_contents', 'Setting: print the contents of struct arrays.', '설정: 구조체 배열의 내용 출력.'),
  struct_levels_to_print: settingHelp('struct_levels_to_print', 'Setting: number of nested structure levels to print.', '설정: 출력할 중첩 구조체 단계 수.'),
  string_fill_char: settingHelp('string_fill_char', 'Setting: character used to pad rows of char matrices.', '설정: 문자 행렬 행을 채우는 문자.'),
  whos_line_format: settingHelp('whos_line_format', 'Setting: line format used by whos.', '설정: whos 의 줄 서식.'),
  confirm_recursive_rmdir: settingHelp('confirm_recursive_rmdir', 'Setting: ask before removing folders recursively.', '설정: 폴더를 재귀적으로 지우기 전에 확인.'),
  ls_command: settingHelp('ls_command', 'Setting: system command used by ls.', '설정: ls 가 쓰는 시스템 명령.'),
  recycle: H("Query the delete behaviour: files are removed permanently ('off'; 'on' is not supported).", "삭제 동작 조회: 파일은 영구 삭제됨 ('off'; 'on' 은 지원 안 함).", ['val = recycle()', "recycle('off')"]),
  terminal_size: H('Size of the Command Window as [rows, columns].', '명령 창 크기 [행, 열].', ['sz = terminal_size()']),
  menu: H('Print a numbered menu in the Command Window and return the chosen number (0 for none).', '명령 창에 번호 메뉴를 출력하고 선택한 번호 반환 (선택 없으면 0).', ['choice = menu(title, opt1, ...)', 'choice = menu(title, {opt1, ...})']),
  yes_or_no: H('Ask a yes/no question in the Command Window; returns true for yes.', '명령 창에서 예/아니요 질문; yes 이면 참.', ['ans = yes_or_no(prompt)']),
  mkstemp: H("Create and open (w+) a unique file from a template ending in 'XXXXXX'; the file is kept after fclose (remove it with delete or unlink).", "'XXXXXX' 로 끝나는 템플릿에서 고유 파일을 만들고 w+ 로 엶; fclose 뒤에도 파일이 남음 (delete 나 unlink 로 삭제).", ['[fid, name, msg] = mkstemp(template)', '[fid, name, msg] = mkstemp(template, delete)']),
  tmpfile: H('Create and open (w+) a new file in the temporary folder (remove it with delete or unlink after fclose).', '임시 폴더에 새 파일을 만들고 w+ 로 엶 (fclose 뒤 delete 나 unlink 로 삭제).', ['[fid, msg] = tmpfile()']),
  bzip2: H('Compress files with bzip2 (.bz2); without DIR the originals are replaced.', '파일을 bzip2(.bz2)로 압축; DIR 이 없으면 원본을 대체.', ['bzip2(files)', 'bzip2(files, dir)', 'filelist = bzip2(...)']),
  bunzip2: H('Decompress .bz2 files.', '.bz2 파일 압축 풀기.', ['bunzip2(bzfile)', 'bunzip2(bzfile, dir)', 'filelist = bunzip2(...)']),
  unpack: H('Unpack an archive by its type (zip, tar, tar.gz, tgz, gz, bz2, tar.bz2).', '형식에 따라 압축 파일 풀기 (zip, tar, tar.gz, tgz, gz, bz2, tar.bz2).', ['files = unpack(file)', 'files = unpack(file, dir)', 'files = unpack(file, dir, filetype)']),
};
