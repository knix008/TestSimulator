// Shared helpers of the I/O and image areas: argument parsing, paths, text
// encoding, small value builders. Pure ESM, no platform APIs.
import {
  MError, tensor, str, num, bool, isChar, isString, isCell, isText, toStr, toNum, isTensor,
  cell, struct, stringArray, empty, isStruct, isNumeric, isLogical, toTensor, isSparse,
} from '../../value.js';

export const E = (id, msg) => new MError(id, msg);

// ---------------------------------------------------------------- text

const enc = new TextEncoder();
export const utf8Encode = (s) => enc.encode(s);
export function utf8Decode(bytes, fatal = false) {
  return new TextDecoder('utf-8', { fatal }).decode(bytes);
}
/** Decodes bytes in a named encoding (UTF-8, latin1/ISO-8859-1, US-ASCII, UTF-16LE/BE, windows-1252, Shift_JIS, ...). */
export function decodeText(bytes, encoding = 'UTF-8') {
  const e = String(encoding || 'UTF-8').toLowerCase().replace(/_/g, '-');
  if (e === 'latin1' || e === 'iso-8859-1' || e === 'us-ascii' || e === 'ascii') {
    let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s;
  }
  try { return new TextDecoder(e === 'system' || e === 'native' ? 'utf-8' : e).decode(bytes); } catch { return utf8Decode(bytes); }
}
/** Encodes text in a named encoding. Single-byte encodings truncate to 8 bits. */
export function encodeText(s, encoding = 'UTF-8') {
  const e = String(encoding || 'UTF-8').toLowerCase().replace(/_/g, '-');
  if (e === 'latin1' || e === 'iso-8859-1' || e === 'us-ascii' || e === 'ascii' || e === 'windows-1252') {
    const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 256 ? c : 63; } return b;
  }
  if (e === 'utf-16le' || e === 'utf-16') {
    const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 * i] = c & 255; b[2 * i + 1] = c >> 8; } return b;
  }
  if (e === 'utf-16be') {
    const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 * i + 1] = c & 255; b[2 * i] = c >> 8; } return b;
  }
  return utf8Encode(s);
}
/** Text from a file's bytes: strips a UTF-8 BOM. */
export function bytesToText(bytes, encoding) {
  let b = bytes;
  if (!encoding && b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if (!encoding && b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return decodeText(b.subarray(2), 'utf-16le');
  if (!encoding && b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return decodeText(b.subarray(2), 'utf-16be');
  return decodeText(b, encoding || 'UTF-8');
}

// ---------------------------------------------------------------- arguments

export const isTextArg = (v) => v != null && (isChar(v) && v.dims[0] <= 1 || isString(v) && v.data.length === 1);
export const S = (v, what) => toStr(v, what);
export const N = (v, what) => toNum(v, what);
/** Text value or default. */
export const optStr = (v, def) => (v === undefined ? def : toStr(v));

/**
 * Splits trailing name/value pairs. Returns { pos: Value[], opts: {lowername: Value} }.
 * `names` (lowercase) are the accepted option names; the first text argument
 * at an even distance from the end that matches a name starts the pairs.
 */
export function splitNameValue(args, names, start = 0) {
  const set = new Set(names.map((n) => n.toLowerCase()));
  let k = start;
  for (; k < args.length; k++) {
    if (isTextArg(args[k]) && set.has(toStr(args[k]).toLowerCase()) && (args.length - k) % 2 === 0) break;
  }
  const pos = args.slice(0, k);
  const opts = Object.create(null);
  for (let i = k; i < args.length; i += 2) {
    if (!isTextArg(args[i])) throw E('io:badOption', 'Option names must be text.');
    const name = toStr(args[i]).toLowerCase();
    if (!set.has(name)) throw E('io:unknownOption', `Unknown option '${toStr(args[i])}'.`);
    opts[name] = args[i + 1];
  }
  return { pos, opts };
}
/** Name/value pairs starting at `start` with unknown names allowed (returned too). */
export function nameValues(args, start = 0) {
  const opts = Object.create(null);
  for (let i = start; i + 1 < args.length; i += 2) {
    if (!isTextArg(args[i])) throw E('io:badOption', 'Option names must be text.');
    opts[toStr(args[i]).toLowerCase()] = args[i + 1];
  }
  return opts;
}
export function optBool(v, def = false) {
  if (v === undefined) return def;
  if (isTextArg(v)) { const s = toStr(v).toLowerCase(); return s === 'on' || s === 'true' || s === 'yes' || s === '1'; }
  return toNum(v) !== 0;
}
/** JS array of strings from text / cellstr / string array. */
export function strList(v) {
  if (isString(v)) return v.data.map((s) => (s == null ? '' : s));
  if (isCell(v)) return v.data.map((x) => toStr(x));
  if (isChar(v)) { if (v.dims[0] <= 1) return [toStr(v)]; return toStr(v).split('\n'); }
  throw E('io:notText', 'Expected text, a cell array of text or a string array.');
}
export const nums = (v) => Array.from(toTensor(v).re);

// ---------------------------------------------------------------- values

export const cellCol = (items) => cell([items.length, 1], items);
export const cellRowOf = (items) => cell([1, items.length], items);
export const strCell = (list, col = true) => cell(col ? [list.length, 1] : [1, list.length], list.map((s) => str(s)));
export const dbl = (dims, arr) => tensor('double', dims, arr);
export function structScalar(obj) {
  const r = Object.create(null); const f = Object.keys(obj);
  for (const k of f) r[k] = obj[k];
  return struct([1, 1], f, [r]);
}
/** Struct array (column) from a list of JS objects of Values with the same keys. */
export function structArray(list, fields, dims) {
  const data = list.map((o) => { const r = Object.create(null); for (const k of fields) r[k] = o[k] === undefined ? empty() : o[k]; return r; });
  return struct(dims || [list.length, 1], fields, data);
}
export const textOut = (s, asString) => (asString ? stringArray([1, 1], [s]) : str(s));
export { str, num, bool, tensor, cell, struct, empty, isText, isTensor, isCell, isStruct, isString, isChar, isNumeric, isLogical, toTensor, isSparse, stringArray };

// ---------------------------------------------------------------- paths

const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:\//.test(p);
export function normPath(p) {
  let s = String(p).replace(/\\/g, '/');
  let prefix = '';
  const m = /^([A-Za-z]:)(\/|$)/.exec(s);
  if (m) { prefix = m[1]; s = s.slice(2); }
  const abs = s.startsWith('/');
  const parts = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (parts.length && parts[parts.length - 1] !== '..') parts.pop(); else if (!abs) parts.push('..'); } else parts.push(seg);
  }
  return prefix + (abs ? '/' : '') + parts.join('/') || (abs ? '/' : '.');
}
/** Absolute path of `p` relative to the current folder; `~` is the home folder. */
export function absPath(ctx, p) {
  let s = String(p).replace(/\\/g, '/');
  if (s === '~' || s.startsWith('~/')) s = ctx.fs.homeDir() + s.slice(1);
  if (isAbs(s)) return normPath(s);
  const cwd = ctx.fs.cwd();
  return normPath((cwd.endsWith('/') ? cwd : cwd + '/') + s);
}
export const baseName = (p) => { const s = String(p).replace(/\\/g, '/').replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i < 0 ? s : s.slice(i + 1); };
export const dirName = (p) => { const s = String(p).replace(/\\/g, '/').replace(/\/+$/, ''); const i = s.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i); };
export const extName = (p) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i).toLowerCase(); };
export function fsExists(ctx, p) { try { return ctx.fs.exists(p); } catch { return false; } }
export function isDirPath(ctx, p) { try { return ctx.fs.exists(p) && ctx.fs.stat(p).isDir; } catch { return false; } }
/** Reads a file's bytes, with a clear error when it is missing. */
export function readFileBytes(ctx, file, id = 'io:fileNotFound') {
  const p = absPath(ctx, file);
  try { return ctx.fs.readBytes(p); } catch (e) {
    if (e instanceof MError) throw e;
    throw E(id, `Unable to find or open '${file}'. Check the path and filename or file permissions.`);
  }
}
export function writeFileBytes(ctx, file, bytes) {
  const p = absPath(ctx, file);
  try { ctx.fs.writeBytes(p, bytes); } catch (e) { throw E('io:cannotWrite', `Unable to write file '${file}': ${e.message}`); }
}
/** Finds a file trying extra extensions (for imread('x') → x.png etc.). */
export function findFile(ctx, file, exts = []) {
  const p = absPath(ctx, file);
  if (fsExists(ctx, p) && !isDirPath(ctx, p)) return p;
  for (const e of exts) if (fsExists(ctx, p + e)) return p + e;
  return null;
}
/** Wildcard pattern (* ?) → RegExp. */
export function globRegExp(pat, flags = '') {
  let r = '^';
  for (const ch of pat) r += ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(r + '$', flags);
}

// ---------------------------------------------------------------- binary helpers

export function concatBytes(chunks) {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
/** Growable byte buffer with little/big-endian writers. */
export class ByteWriter {
  constructor(cap = 1024) { this.buf = new Uint8Array(cap); this.len = 0; this.dv = new DataView(this.buf.buffer); }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let c = this.buf.length * 2; while (c < this.len + n) c *= 2;
    const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.len)); this.buf = b; this.dv = new DataView(b.buffer);
  }
  u8(x) { this.ensure(1); this.buf[this.len++] = x & 255; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  u16(x, le = true) { this.ensure(2); this.dv.setUint16(this.len, x, le); this.len += 2; }
  i16(x, le = true) { this.ensure(2); this.dv.setInt16(this.len, x, le); this.len += 2; }
  u32(x, le = true) { this.ensure(4); this.dv.setUint32(this.len, x >>> 0, le); this.len += 4; }
  i32(x, le = true) { this.ensure(4); this.dv.setInt32(this.len, x, le); this.len += 4; }
  f32(x, le = true) { this.ensure(4); this.dv.setFloat32(this.len, x, le); this.len += 4; }
  f64(x, le = true) { this.ensure(8); this.dv.setFloat64(this.len, x, le); this.len += 8; }
  ascii(s) { this.ensure(s.length); for (let i = 0; i < s.length; i++) this.buf[this.len++] = s.charCodeAt(i) & 255; }
  pad(align) { while (this.len % align) this.u8(0); }
  result() { return this.buf.slice(0, this.len); }
}
