// Low-level file access: fopen / fclose / fread / fwrite / ftell / fseek /
// frewind / feof / ferror. Open files live in ctx.state.files:
//   { next: 3, open: Map<fid, OpenFile> }
// An OpenFile keeps the whole file in memory (buf/len) with a position; it is
// written back through ctx.fs on fclose (and right away while it is small,
// so that scripts that forget fclose still leave their output behind).
import {
  E, S, N, str, num, bool, tensor, isText, isTextArg, isChar, toTensor, absPath, fsExists, isDirPath,
  encodeText, decodeText, cellRowOf,
} from './util.js';
import { INT_RANGE, saturate, isTensor, empty } from '../../value.js';

const EAGER_FLUSH = 1 << 16;

// ---------------------------------------------------------------- file table

export function fileTable(ctx) {
  if (!ctx.state.files) ctx.state.files = { next: 3, open: new Map() };
  return ctx.state.files;
}

/** Normalizes a permission text: 'rt' → { base:'r', plus:false, text:true }. */
export function parsePermission(p) {
  const s = String(p || 'r').trim();
  const m = /^([rwaRWA])(\+?)([tb]?)(\+?)$/.exec(s);
  if (!m) throw E('io:fopen:invalidPermission', `Invalid permission '${s}'. Use 'r', 'w', 'a', 'r+', 'w+' or 'a+' (optionally with 't' or 'b').`);
  const base = m[1].toLowerCase();
  const plus = !!(m[2] || m[4]);
  const text = m[3] === 't';
  return { base, plus, text, canon: base + (plus ? '+' : '') + (text ? 't' : '') };
}

/** 'l' or 'b' from a machine format name. */
export function parseMachineFmt(s) {
  const f = String(s || 'n').toLowerCase();
  if (['n', 'native', 'l', 'ieee-le', 'ieee-le.l64', 'a', 's'].includes(f)) return 'l';
  if (['b', 'ieee-be', 'ieee-be.l64', 'c', 'd', 'g'].includes(f)) return 'b';
  throw E('io:fopen:invalidMachineFormat', `Invalid machine format '${s}'.`);
}
const mfmtName = (m) => (m === 'b' ? 'ieee-be' : 'ieee-le');

class OpenFile {
  constructor(fid, name, path, perm, mfmt, encoding) {
    Object.assign(this, { fid, name, path, perm, mfmt, encoding });
    this.canRead = perm.base === 'r' || perm.plus;
    this.canWrite = perm.base !== 'r' || perm.plus;
    this.append = perm.base === 'a';
    this.buf = new Uint8Array(256); this.len = 0; this.pos = 0;
    this.err = ''; this.dirty = false; this.eofHit = false;
  }
  load(bytes) { this.buf = new Uint8Array(Math.max(256, bytes.length)); this.buf.set(bytes); this.len = bytes.length; }
  ensure(n) {
    if (n <= this.buf.length) return;
    let c = this.buf.length * 2; while (c < n) c *= 2;
    const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.len)); this.buf = b;
  }
  /** Writes bytes at the position (or the end in append mode). */
  write(ctx, bytes) {
    if (!this.canWrite) throw E('io:fwrite:readOnly', 'The file was opened for reading only.');
    if (this.append) this.pos = this.len;
    const end = this.pos + bytes.length;
    this.ensure(end);
    if (this.pos > this.len) this.buf.fill(0, this.len, this.pos);
    this.buf.set(bytes, this.pos);
    this.pos = end;
    if (end > this.len) this.len = end;
    this.dirty = true;
    if (this.len <= EAGER_FLUSH) this.flush(ctx);
  }
  flush(ctx) {
    if (!this.dirty) return;
    ctx.fs.writeBytes(this.path, this.buf.slice(0, this.len));
    this.dirty = false;
  }
  checkRead() { if (!this.canRead) throw E('io:fread:writeOnly', 'The file was opened for writing only.'); }
  bytes() { return this.buf.subarray(0, this.len); }
}

/** fopen(path, perm, mfmt, encoding) → fid (or -1 with message). */
export function openFile(ctx, name, permText = 'r', mfmtText = 'n', encoding = 'UTF-8') {
  const perm = parsePermission(permText);
  const mfmt = parseMachineFmt(mfmtText);
  const t = fileTable(ctx);
  let path;
  try { path = absPath(ctx, name); } catch { return { fid: -1, msg: 'Invalid file name.' }; }
  if (isDirPath(ctx, path)) return { fid: -1, msg: 'Is a directory' };
  const exists = fsExists(ctx, path);
  if (perm.base === 'r' && !exists) return { fid: -1, msg: 'No such file or directory' };
  const f = new OpenFile(t.next, name, path, perm, mfmt, encoding || 'UTF-8');
  try {
    if (perm.base === 'w') { f.dirty = true; f.flush(ctx); } else if (exists) f.load(ctx.fs.readBytes(path));
    else { f.dirty = true; f.flush(ctx); }
  } catch (e) { return { fid: -1, msg: e.message || 'Permission denied' }; }
  if (perm.base === 'a') f.pos = f.len;
  t.open.set(t.next, f);
  return { fid: t.next++, msg: '' };
}

/** The OpenFile of a fid value, or an error. */
export function getFile(ctx, fidV, fname = 'fread') {
  let fid;
  try { fid = N(fidV); } catch { fid = NaN; }
  const f = fileTable(ctx).open.get(fid);
  if (!f) throw E(`io:${fname}:invalidFid`, 'Invalid file identifier. Use fopen to generate a valid file identifier.');
  return f;
}
export const tryGetFile = (ctx, fid) => fileTable(ctx).open.get(fid) || null;

export function closeFile(ctx, fid) {
  const t = fileTable(ctx);
  const f = t.open.get(fid);
  if (!f) return false;
  f.flush(ctx);
  t.open.delete(fid);
  return true;
}

/** Writes text to a fid: 1 = stdout, 2 = stderr, others through the open file (encoding, 't' mode). */
export function writeTextFid(ctx, fid, text) {
  if (fid === 1) { ctx.out(text); return text.length; }
  if (fid === 2) { (ctx.errOut || ctx.out).call(ctx, text); return text.length; }
  const f = fileTable(ctx).open.get(fid);
  if (!f) throw E('io:fprintf:invalidFid', 'Invalid file identifier. Use fopen to generate a valid file identifier.');
  if (f.perm.text) text = text.replace(/\r?\n/g, '\r\n');
  const b = encodeText(text, f.encoding);
  f.write(ctx, b);
  return b.length;
}

// ---------------------------------------------------------------- precisions

// name → [class of the stored item, bytes]; 'char' has the special text path.
const PREC = Object.create(null);
const alias = (cls, size, names) => { for (const n of names) PREC[n] = [cls, size]; };
alias('uint8', 1, ['uint8', 'uchar', 'unsigned char', 'uint8_t']);
alias('int8', 1, ['int8', 'schar', 'signed char', 'integer*1', 'int8_t']);
alias('int16', 2, ['int16', 'short', 'integer*2', 'int16_t']);
alias('uint16', 2, ['uint16', 'ushort', 'unsigned short', 'uint16_t']);
alias('int32', 4, ['int32', 'int', 'long', 'integer*4', 'int32_t']);
alias('uint32', 4, ['uint32', 'uint', 'ulong', 'unsigned int', 'unsigned long', 'uint32_t']);
alias('int64', 8, ['int64', 'integer*8', 'int64_t']);
alias('uint64', 8, ['uint64', 'uint64_t']);
alias('single', 4, ['single', 'float32', 'float', 'real*4']);
alias('double', 8, ['double', 'float64', 'real*8']);
alias('char', 1, ['char', 'char*1']);

function precItem(s) {
  const t = s.trim().toLowerCase();
  if (PREC[t]) return { cls: PREC[t][0], size: PREC[t][1], bits: 0, signed: false };
  const m = /^(u?)bit(\d+)$/.exec(t);
  if (m) {
    const bits = +m[2];
    if (bits < 1 || bits > 64) throw E('io:fread:invalidPrecision', `Invalid precision '${s}'.`);
    return { cls: m[1] ? (bits <= 8 ? 'uint8' : bits <= 16 ? 'uint16' : bits <= 32 ? 'uint32' : 'uint64') : (bits <= 8 ? 'int8' : bits <= 16 ? 'int16' : bits <= 32 ? 'int32' : 'int64'), size: 0, bits, signed: !m[1] };
  }
  throw E('io:fread:invalidPrecision', `Invalid precision '${s}'.`);
}

/**
 * Parses 'N*src=>dst', '*src', 'src'. Returns { src, outCls, block }.
 * Default output: double ('char' alone gives double too, '*char' gives char).
 */
export function parsePrecision(text, def = 'uint8') {
  let s = String(text == null ? def : text).trim();
  let block = 1;
  const bm = /^(\d+)\*(.*)$/.exec(s);
  if (bm) { block = +bm[1]; s = bm[2]; }
  let same = false;
  if (s.startsWith('*')) { same = true; s = s.slice(1); }
  let outName = null;
  const i = s.indexOf('=>');
  if (i >= 0) { outName = s.slice(i + 2); s = s.slice(0, i); }
  const src = precItem(s);
  let outCls = 'double';
  if (same) outCls = src.cls;
  else if (outName) outCls = precItem(outName).cls;
  return { src, outCls, block };
}

function readItems(f, src, count, skip, block, mfmt) {
  const le = mfmt === 'l';
  const out = [];
  const bytes = f.bytes();
  if (src.bits) {
    // bit-level reading (bits within a byte from least significant, like the reference on little-endian)
    let bitPos = f.pos * 8;
    const total = f.len * 8;
    let inBlock = 0;
    while (out.length < count && bitPos + src.bits <= total) {
      let v = 0n;
      for (let k = 0; k < src.bits; k++) {
        const bp = bitPos + k;
        const byte = bytes[bp >> 3];
        const bit = le ? (byte >> (bp & 7)) & 1 : (byte >> (7 - (bp & 7))) & 1;
        if (le) v |= BigInt(bit) << BigInt(k); else v = (v << 1n) | BigInt(bit);
      }
      if (src.signed && (v >> BigInt(src.bits - 1)) & 1n) v -= 1n << BigInt(src.bits);
      out.push(Number(v));
      bitPos += src.bits;
      if (skip && ++inBlock === block) { inBlock = 0; bitPos += skip; }
    }
    f.pos = Math.min(f.len, Math.ceil(bitPos / 8));
    return out;
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = f.pos, inBlock = 0;
  while (out.length < count && p + src.size <= f.len) {
    let v;
    switch (src.cls) {
      case 'uint8': case 'char': v = bytes[p]; break;
      case 'int8': v = dv.getInt8(p); break;
      case 'int16': v = dv.getInt16(p, le); break;
      case 'uint16': v = dv.getUint16(p, le); break;
      case 'int32': v = dv.getInt32(p, le); break;
      case 'uint32': v = dv.getUint32(p, le); break;
      case 'int64': v = Number(dv.getBigInt64(p, le)); break;
      case 'uint64': v = Number(dv.getBigUint64(p, le)); break;
      case 'single': v = dv.getFloat32(p, le); break;
      default: v = dv.getFloat64(p, le);
    }
    out.push(v);
    p += src.size;
    if (skip && ++inBlock === block) { inBlock = 0; p += skip; }
  }
  f.pos = Math.min(p, f.len);
  return out;
}

function writeItems(src, values, mfmt, skip, block) {
  const le = mfmt === 'l';
  if (src.bits) {
    const nbits = values.length * src.bits + (skip ? Math.floor(values.length / block) * skip : 0);
    const b = new Uint8Array(Math.ceil(nbits / 8));
    let bp = 0, inBlock = 0;
    for (const x of values) {
      const lim = src.signed ? [-(2 ** (src.bits - 1)), 2 ** (src.bits - 1) - 1] : [0, 2 ** src.bits - 1];
      let v = Math.round(Number.isNaN(x) ? 0 : x); v = Math.min(lim[1], Math.max(lim[0], v));
      let bv = BigInt(v); if (bv < 0n) bv += 1n << BigInt(src.bits);
      for (let k = 0; k < src.bits; k++) {
        const bit = le ? Number((bv >> BigInt(k)) & 1n) : Number((bv >> BigInt(src.bits - 1 - k)) & 1n);
        const q = bp + k;
        if (bit) b[q >> 3] |= le ? 1 << (q & 7) : 1 << (7 - (q & 7));
      }
      bp += src.bits;
      if (skip && ++inBlock === block) { inBlock = 0; bp += skip; }
    }
    return b;
  }
  const per = src.size + 0;
  const total = values.length * per + (skip ? Math.floor(values.length / block) * skip : 0);
  const b = new Uint8Array(total);
  const dv = new DataView(b.buffer);
  let p = 0, inBlock = 0;
  for (const x0 of values) {
    const cls = src.cls === 'char' ? 'uint8' : src.cls;
    const x = cls in INT_RANGE ? saturate(cls, x0) : x0;
    switch (cls) {
      case 'uint8': b[p] = x; break;
      case 'int8': dv.setInt8(p, x); break;
      case 'int16': dv.setInt16(p, x, le); break;
      case 'uint16': dv.setUint16(p, x, le); break;
      case 'int32': dv.setInt32(p, x, le); break;
      case 'uint32': dv.setUint32(p, x, le); break;
      case 'int64': dv.setBigInt64(p, BigInt(Math.trunc(x)), le); break;
      case 'uint64': dv.setBigUint64(p, BigInt(Math.trunc(Math.max(0, x))), le); break;
      case 'single': dv.setFloat32(p, x, le); break;
      default: dv.setFloat64(p, x, le);
    }
    p += per;
    if (skip && ++inBlock === block) { inBlock = 0; p += skip; }
  }
  return b;
}

/** Size argument of fread/fscanf: Inf, n, [m n], [m Inf] → { count, shape: (n) => dims }. */
export function parseSizeArg(v) {
  if (v === undefined) return { count: Infinity, shape: (n) => [n, 1] };
  const a = Array.from(toTensor(v).re);
  if (a.length === 1) {
    const n = a[0];
    if (n === Infinity) return { count: Infinity, shape: (k) => [k, 1] };
    if (!(n >= 0) || !Number.isInteger(n)) throw E('io:invalidSize', 'Size must be a nonnegative integer, Inf, or [m n].');
    return { count: n, shape: (k) => [k, 1] };
  }
  if (a.length === 2) {
    const [m, n] = a;
    if (!(m >= 0 && Number.isInteger(m)) || !(n === Infinity || (n >= 0 && Number.isInteger(n)))) throw E('io:invalidSize', 'Size must be [m n] with m an integer and n an integer or Inf.');
    return { count: n === Infinity ? Infinity : m * n, shape: (k) => [m, m ? Math.ceil(k / m) : 0], pad: true, m };
  }
  throw E('io:invalidSize', 'Size must be a scalar or a two-element vector.');
}
/** Builds an output tensor from read numbers with the shape rules (padding with 0). */
export function shapeOutput(values, sz, cls) {
  const dims = sz.shape(values.length);
  const n = dims[0] * dims[1];
  const re = new Float64Array(n);
  for (let i = 0; i < values.length && i < n; i++) re[i] = values[i];
  if (cls === 'double') return tensor('double', dims, re);
  if (cls === 'char') return tensor('char', dims, re);
  if (cls === 'logical') { for (let i = 0; i < n; i++) re[i] = re[i] ? 1 : 0; return tensor('logical', dims, re); }
  if (cls === 'single') { for (let i = 0; i < n; i++) re[i] = Math.fround(re[i]); return tensor('single', dims, re); }
  for (let i = 0; i < n; i++) re[i] = saturate(cls, re[i]);
  return tensor(cls, dims, re);
}

// ---------------------------------------------------------------- builtins

function fopen(args, nargout, ctx) {
  if (!args.length) throw E('io:fopen:notEnoughInputs', 'Not enough input arguments.');
  const a0 = args[0];
  if (isTextArg(a0) && S(a0).toLowerCase() === 'all' && args.length === 1) {
    const ids = [...fileTable(ctx).open.keys()];
    return tensor('double', [ids.length ? 1 : 0, ids.length], ids);
  }
  if (!isText(a0)) {
    // fopen(fid) → [filename, permission, machinefmt, encodingOut]
    const fid = N(a0);
    if (fid === 0) return [str('"stdin"'), str('r'), str('ieee-le'), str('UTF-8')];
    if (fid === 1) return [str('"stdout"'), str('w'), str('ieee-le'), str('UTF-8')];
    if (fid === 2) return [str('"stderr"'), str('w'), str('ieee-le'), str('UTF-8')];
    const f = tryGetFile(ctx, fid);
    if (!f) return [str(''), str(''), str(''), str('')];
    return [str(f.path), str(f.perm.canon), str(mfmtName(f.mfmt)), str(f.encoding)];
  }
  const name = S(a0);
  const perm = args[1] !== undefined ? S(args[1]) : 'r';
  const mf = args[2] !== undefined ? S(args[2]) : 'n';
  const encoding = args[3] !== undefined ? S(args[3]) : 'UTF-8';
  const r = openFile(ctx, name, perm, mf, encoding);
  return [num(r.fid), str(r.msg)];
}

function fclose(args, nargout, ctx) {
  if (!args.length) throw E('io:fclose:notEnoughInputs', 'Not enough input arguments.');
  if (isTextArg(args[0])) {
    if (S(args[0]).toLowerCase() !== 'all') throw E('io:fclose:invalidInput', "Use a file identifier or 'all'.");
    for (const fid of [...fileTable(ctx).open.keys()]) closeFile(ctx, fid);
    return num(0);
  }
  const ids = Array.from(toTensor(args[0]).re);
  for (const fid of ids) {
    if (fid === 0 || fid === 1 || fid === 2) continue;
    if (!closeFile(ctx, fid)) throw E('io:fclose:invalidFid', 'Invalid file identifier. Use fopen to generate a valid file identifier.');
  }
  return num(0);
}

function fread(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'fread');
  f.checkRead();
  let i = 1;
  let sz = parseSizeArg(undefined);
  if (args[i] !== undefined && !isTextArg(args[i])) sz = parseSizeArg(args[i++]);
  const prec = parsePrecision(args[i] !== undefined ? S(args[i++]) : 'uint8');
  let skip = 0;
  if (args[i] !== undefined && !isTextArg(args[i])) skip = N(args[i++]);
  const mfmt = args[i] !== undefined ? parseMachineFmt(S(args[i])) : f.mfmt;
  let values;
  const avail = f.len - f.pos;
  if (prec.src.cls === 'char' && !skip && /^utf-?8$/i.test(f.encoding)) {
    // characters, decoded as UTF-8: read count characters
    const bytes = f.bytes();
    const text = [];
    let p = f.pos;
    while (text.length < sz.count && p < f.len) {
      const b0 = bytes[p];
      const n = b0 < 0x80 ? 1 : b0 >= 0xf0 ? 4 : b0 >= 0xe0 ? 3 : b0 >= 0xc0 ? 2 : 1;
      const s = decodeText(bytes.subarray(p, Math.min(f.len, p + n)), 'UTF-8');
      for (const ch of s) for (let k = 0; k < ch.length; k++) text.push(ch.charCodeAt(k));
      p += n;
    }
    f.pos = p;
    values = text;
  } else {
    values = readItems(f, prec.src, sz.count, skip, prec.block, mfmt);
  }
  if (values.length < sz.count || avail === 0) f.eofHit = true;
  const A = shapeOutput(values, sz, prec.outCls);
  return [A, num(values.length)];
}

function fwrite(args, nargout, ctx) {
  if (args.length < 2) throw E('io:fwrite:notEnoughInputs', 'Not enough input arguments.');
  const fid = N(args[0]);
  const A = args[1];
  const precText = args[2] !== undefined ? S(args[2]) : 'uint8';
  const prec = parsePrecision(precText);
  const skip = args[3] !== undefined ? N(args[3]) : 0;
  if (fid === 1 || fid === 2) {
    const t = isChar(A) ? decodeText(Uint8Array.from(toTensor(A).re), 'latin1') : String.fromCharCode(...Array.from(toTensor(A).re).map((x) => x & 255));
    writeTextFid(ctx, fid, t);
    return num(toTensor(A).re.length);
  }
  const f = getFile(ctx, args[0], 'fwrite');
  const mfmt = args[4] !== undefined ? parseMachineFmt(S(args[4])) : f.mfmt;
  let bytes, count;
  if (prec.src.cls === 'char' && isChar(A) && !skip) {
    let s = ''; const re = A.re; for (let k = 0; k < re.length; k++) s += String.fromCharCode(re[k]);
    bytes = encodeText(s, f.encoding);
    count = re.length;
  } else {
    const vals = isTensor(A) || A.sparse ? Array.from(toTensor(A).re) : null;
    if (!vals) throw E('io:fwrite:invalidData', 'Data must be numeric, logical or char.');
    bytes = writeItems(prec.src, vals, mfmt, skip, prec.block);
    count = vals.length;
  }
  f.write(ctx, bytes);
  return num(count);
}

function ftell(args, nargout, ctx) {
  const fid = N(args[0]);
  const f = tryGetFile(ctx, fid);
  if (!f) throw E('io:ftell:invalidFid', 'Invalid file identifier. Use fopen to generate a valid file identifier.');
  return num(f.pos);
}

function fseek(args, nargout, ctx) {
  if (args.length < 2) throw E('io:fseek:notEnoughInputs', 'Not enough input arguments.');
  const f = getFile(ctx, args[0], 'fseek');
  const off = N(args[1]);
  let origin = 'bof';
  if (args[2] !== undefined) {
    if (isTextArg(args[2])) origin = S(args[2]).toLowerCase();
    else origin = ({ '-1': 'bof', 0: 'cof', 1: 'eof' })[N(args[2])] || 'bad';
  }
  const base = origin === 'bof' ? 0 : origin === 'cof' ? f.pos : origin === 'eof' ? f.len : NaN;
  if (Number.isNaN(base)) throw E('io:fseek:invalidOrigin', "Origin must be 'bof', 'cof', 'eof', -1, 0 or 1.");
  const p = base + off;
  if (!(p >= 0) || !Number.isInteger(p)) { f.err = 'Offset is bad - before beginning-of-file.'; return num(-1); }
  if (p > f.len && !f.canWrite) { f.err = 'Offset is bad - after end-of-file.'; return num(-1); }
  f.pos = p; f.eofHit = false; f.err = '';
  return num(0);
}

function frewind(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'frewind');
  f.pos = 0; f.eofHit = false;
  return nargout > 0 ? num(0) : undefined;
}

function feof(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'feof');
  return bool(f.eofHit || f.pos >= f.len);
}

function ferror(args, nargout, ctx) {
  const f = getFile(ctx, args[0], 'ferror');
  const msg = f.err;
  if (args[1] !== undefined && S(args[1]).toLowerCase() === 'clear') f.err = '';
  return [str(msg), num(msg ? -1 : 0)];
}

/** Engine helper used by base fprintf / disp to write text into an open file. */
function fwriteText(args, nargout, ctx) {
  const fid = N(args[0]);
  const t = args[1] ? (isChar(args[1]) ? Array.from(args[1].re, (c) => String.fromCharCode(c)).join('') : S(args[1])) : '';
  return num(writeTextFid(ctx, fid, t));
}

/** fclose all files of a session (used by `clear all`/`fclose all`); exported for the app. */
export function closeAll(ctx) { for (const fid of [...fileTable(ctx).open.keys()]) closeFile(ctx, fid); }

// openedFiles listing for the app (`fopen all` + names).
function openedFiles(args, nargout, ctx) {
  const list = [...fileTable(ctx).open.values()];
  return cellRowOf(list.map((f) => str(f.path)));
}

export const builtins = {
  fopen, fclose, fread, fwrite, ftell, fseek, frewind, feof, ferror,
  __fwrite_text__: fwriteText,
  __open_files__: openedFiles,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  fopen: H('Open a file or get information about open files.', '파일을 열거나 열린 파일 정보를 가져옵니다.', ["fileID = fopen(filename)", "fileID = fopen(filename, permission)", "fileID = fopen(filename, permission, machinefmt, encodingIn)", "[fileID, errmsg] = fopen(___)", "fIDs = fopen('all')", "[filename, permission, machinefmt, encodingOut] = fopen(fileID)"]),
  fclose: H('Close one or all open files.', '열린 파일 하나 또는 전체를 닫습니다.', ['fclose(fileID)', "fclose('all')", 'status = fclose(___)']),
  fread: H('Read data from a binary file.', '이진 파일에서 데이터를 읽습니다.', ['A = fread(fileID)', 'A = fread(fileID, sizeA)', 'A = fread(fileID, sizeA, precision)', 'A = fread(fileID, sizeA, precision, skip, machinefmt)', '[A, count] = fread(___)']),
  fwrite: H('Write data to a binary file.', '이진 파일에 데이터를 씁니다.', ['fwrite(fileID, A)', 'fwrite(fileID, A, precision)', 'fwrite(fileID, A, precision, skip, machinefmt)', 'count = fwrite(___)']),
  ftell: H('Current position in an open file.', '열린 파일의 현재 위치.', ['position = ftell(fileID)']),
  fseek: H('Move to a position in a file.', '파일 안의 위치로 이동합니다.', ['status = fseek(fileID, offset, origin)']),
  frewind: H('Move the file position to the beginning.', '파일 위치를 처음으로 되돌립니다.', ['frewind(fileID)']),
  feof: H('Test for end of file.', '파일 끝인지 검사합니다.', ['status = feof(fileID)']),
  ferror: H('File I/O error information.', '파일 입출력 오류 정보.', ['msg = ferror(fileID)', "[msg, errnum] = ferror(fileID, 'clear')"]),
  __fwrite_text__: H('Internal: write text to an open file identifier.', '내부용: 열린 파일 식별자에 텍스트를 씁니다.', ['n = __fwrite_text__(fileID, text)']),
  __open_files__: H('Internal: paths of the open files.', '내부용: 열린 파일 경로 목록.', ['c = __open_files__()']),
};
