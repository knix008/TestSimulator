// MAT-file version 5 / 7 (Level 5) reader and writer.
//
// The header text written by the reference program starts with a fixed
// product tag, which other readers check, so it is reproduced here; this is
// the only place where that literal appears (see core/CONTRACT.md).
//
//   readMat5(bytes, { only, warn }) → [{ name, value, global }]
//   writeMat5(vars [{ name, value, global }], { compress, warn }) → Uint8Array
//   matHeaderInfo(bytes) → { kind: 'v5' | 'v73' | 'v4?' | null, text }
import {
  MError, tensor, cell, struct, sparseMatrix, isTensor, isSparse, isCell, isStruct, isString,
  isObject, isFuncHandle, prod, normDims, saturate,
} from '../value.js';
import { inflate, deflate } from '../lib/io/zlib.js';

const HEADER_TAG = 'MATLAB 5.0 MAT-file';

const mi = {
  INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9,
  INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15, UTF8: 16, UTF16: 17, UTF32: 18,
};
const MI_SIZE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 4, 9: 8, 12: 8, 13: 8, 16: 1, 17: 2, 18: 4 };
const mx = {
  CELL: 1, STRUCT: 2, OBJECT: 3, CHAR: 4, SPARSE: 5, DOUBLE: 6, SINGLE: 7, INT8: 8, UINT8: 9,
  INT16: 10, UINT16: 11, INT32: 12, UINT32: 13, INT64: 14, UINT64: 15, FUNCTION: 16, OPAQUE: 17,
};
const MX_CLASS = { 6: 'double', 7: 'single', 8: 'int8', 9: 'uint8', 10: 'int16', 11: 'uint16', 12: 'int32', 13: 'uint32', 14: 'int64', 15: 'uint64' };
const CLASS_MX = { double: 6, single: 7, int8: 8, uint8: 9, int16: 10, uint16: 11, int32: 12, uint32: 13, int64: 14, uint64: 15 };
const CLASS_MI = { double: mi.DOUBLE, single: mi.SINGLE, int8: mi.INT8, uint8: mi.UINT8, int16: mi.INT16, uint16: mi.UINT16, int32: mi.INT32, uint32: mi.UINT32, int64: mi.INT64, uint64: mi.UINT64 };

const corrupt = (msg) => new MError('io:load:corruptFile', `The MAT-file is corrupt or not supported: ${msg}`);
const pad8 = (n) => (n + 7) & ~7;

// ---------------------------------------------------------------- header

export function matHeaderInfo(bytes) {
  if (!bytes || bytes.length < 128) return { kind: null, text: '' };
  let text = '';
  for (let i = 0; i < 116; i++) text += String.fromCharCode(bytes[i]);
  const e = String.fromCharCode(bytes[126], bytes[127]);
  if (e !== 'IM' && e !== 'MI') return { kind: null, text };
  const le = e === 'IM';
  const ver = le ? bytes[124] | (bytes[125] << 8) : (bytes[124] << 8) | bytes[125];
  if (ver === 0x0200) return { kind: 'v73', text: text.trim(), le };
  if (ver === 0x0100) return { kind: 'v5', text: text.trim(), le };
  return { kind: null, text };
}

// ---------------------------------------------------------------- reading

function numbersOf(type, view, le) {
  const size = MI_SIZE[type];
  if (!size) throw corrupt(`unknown data type ${type}`);
  const n = Math.floor(view.byteLength / size);
  const out = new Float64Array(n);
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  switch (type) {
    case mi.INT8: for (let i = 0; i < n; i++) out[i] = dv.getInt8(i); break;
    case mi.UINT8: case mi.UTF8: for (let i = 0; i < n; i++) out[i] = view[i]; break;
    case mi.INT16: for (let i = 0; i < n; i++) out[i] = dv.getInt16(2 * i, le); break;
    case mi.UINT16: case mi.UTF16: for (let i = 0; i < n; i++) out[i] = dv.getUint16(2 * i, le); break;
    case mi.INT32: for (let i = 0; i < n; i++) out[i] = dv.getInt32(4 * i, le); break;
    case mi.UINT32: case mi.UTF32: for (let i = 0; i < n; i++) out[i] = dv.getUint32(4 * i, le); break;
    case mi.SINGLE: for (let i = 0; i < n; i++) out[i] = dv.getFloat32(4 * i, le); break;
    case mi.DOUBLE: for (let i = 0; i < n; i++) out[i] = dv.getFloat64(8 * i, le); break;
    case mi.INT64: for (let i = 0; i < n; i++) out[i] = Number(dv.getBigInt64(8 * i, le)); break;
    case mi.UINT64: for (let i = 0; i < n; i++) out[i] = Number(dv.getBigUint64(8 * i, le)); break;
    default: throw corrupt(`unexpected data type ${type}`);
  }
  return out;
}

class Reader {
  constructor(bytes, le, warn) { this.b = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.le = le; this.warn = warn || (() => {}); }
  u32(p) { return this.dv.getUint32(p, this.le); }
  /** Reads a tag at p → { type, n, data (Uint8Array), next }. */
  tag(p, end = this.b.length) {
    if (p + 8 > end) throw corrupt('truncated element');
    const t = this.u32(p);
    if (t >>> 16) {
      const type = t & 0xffff, n = t >>> 16;
      if (n > 4) throw corrupt('bad small element');
      return { type, n, data: this.b.subarray(p + 4, p + 4 + n), next: p + 8 };
    }
    const n = this.u32(p + 4);
    if (p + 8 + n > end) throw corrupt('element larger than the file');
    return { type: t, n, data: this.b.subarray(p + 8, p + 8 + n), next: t === mi.COMPRESSED ? p + 8 + n : p + 8 + pad8(n) };
  }
}

const textOf = (u8) => { let s = ''; for (let i = 0; i < u8.length && u8[i]; i++) s += String.fromCharCode(u8[i]); return s; };

/** Parses one miMATRIX payload (the bytes after its tag). */
function parseMatrix(R, data, ctx) {
  if (data.length === 0) return { name: '', value: tensor('double', [0, 0]), global: false };
  const sub = new Reader(data, R.le, R.warn);
  let p = 0;
  const flagsT = sub.tag(p); p = flagsT.next;
  const fdv = new DataView(flagsT.data.buffer, flagsT.data.byteOffset, flagsT.data.byteLength);
  const f0 = fdv.getUint32(0, R.le);
  const nzmax = flagsT.data.length >= 8 ? fdv.getUint32(4, R.le) : 0;
  const klass = f0 & 0xff;
  const complex = !!(f0 & 0x800), global = !!(f0 & 0x400), logical = !!(f0 & 0x200);
  if (klass === mx.OPAQUE || klass === mx.FUNCTION) {
    // opaque objects (class instances of newer types) and function handles need the subsystem data
    let name = '';
    try { const t = sub.tag(p); name = textOf(t.data); } catch { /* ignore */ }
    R.warn(`Variable '${name}' holds an object type that cannot be read; it was skipped.`);
    return { name, value: null, global };
  }
  const dimsT = sub.tag(p); p = dimsT.next;
  const dims = Array.from(numbersOf(dimsT.type, dimsT.data, R.le));
  const nameT = sub.tag(p); p = nameT.next;
  const name = textOf(nameT.data);
  const n = prod(dims);
  let value;
  if (MX_CLASS[klass]) {
    const prT = sub.tag(p); p = prT.next;
    let re = numbersOf(prT.type, prT.data, R.le);
    let im = null;
    if (complex) { const piT = sub.tag(p); p = piT.next; im = numbersOf(piT.type, piT.data, R.le); }
    if (re.length !== n) { const r2 = new Float64Array(n); r2.set(re.subarray(0, n)); re = r2; }
    let cls = logical ? 'logical' : MX_CLASS[klass];
    if (cls === 'single') for (let i = 0; i < n; i++) re[i] = Math.fround(re[i]);
    value = tensor(cls, normDims(dims), re, im);
  } else if (klass === mx.CHAR) {
    const t = sub.tag(p); p = t.next;
    let codes;
    if (t.type === mi.UTF8) {
      const s = new TextDecoder('utf-8').decode(t.data);
      codes = Float64Array.from(s, (c) => c.charCodeAt(0));
    } else codes = numbersOf(t.type, t.data, R.le);
    if (codes.length !== n) { const c2 = new Float64Array(n); c2.set(codes.subarray(0, n)); codes = c2; }
    value = tensor('char', normDims(dims), codes);
  } else if (klass === mx.SPARSE) {
    const irT = sub.tag(p); p = irT.next;
    const jcT = sub.tag(p); p = jcT.next;
    const prT = sub.tag(p); p = prT.next;
    const ir = numbersOf(irT.type, irT.data, R.le), jc = numbersOf(jcT.type, jcT.data, R.le);
    const [m, nn] = dims;
    const nnz = jc[nn] || 0;
    const re = numbersOf(prT.type, prT.data, R.le).subarray(0, nnz);
    let im = null;
    if (complex) { const piT = sub.tag(p); p = piT.next; im = numbersOf(piT.type, piT.data, R.le).subarray(0, nnz); }
    value = sparseMatrix(m, nn, jc.subarray(0, nn + 1), ir.subarray(0, nnz), logical ? re.map((x) => (x ? 1 : 0)) : re, im, logical ? 'logical' : 'double');
    void nzmax;
  } else if (klass === mx.CELL) {
    const items = [];
    for (let i = 0; i < n; i++) { const t = sub.tag(p); p = t.next; items.push(readElementValue(sub, t)); }
    value = cell(normDims(dims), items.map((x) => x || tensor('double', [0, 0])));
  } else if (klass === mx.STRUCT || klass === mx.OBJECT) {
    let className = '';
    if (klass === mx.OBJECT) { const t = sub.tag(p); p = t.next; className = textOf(t.data); }
    const lenT = sub.tag(p); p = lenT.next;
    const flen = numbersOf(lenT.type, lenT.data, R.le)[0] || 0;
    const namesT = sub.tag(p); p = namesT.next;
    const nf = flen ? Math.floor(namesT.data.length / flen) : 0;
    const fields = [];
    for (let k = 0; k < nf; k++) fields.push(textOf(namesT.data.subarray(k * flen, (k + 1) * flen)));
    const recs = [];
    for (let i = 0; i < n; i++) {
      const r = Object.create(null);
      for (const f of fields) { const t = sub.tag(p); p = t.next; r[f] = readElementValue(sub, t) || tensor('double', [0, 0]); }
      recs.push(r);
    }
    value = struct(normDims(dims), fields, recs);
    if (klass === mx.OBJECT) { value.className = className; R.warn(`Variable '${name}' is an object of class '${className}'; it was loaded as a struct.`); }
  } else throw corrupt(`unknown array class ${klass}`);
  return { name, value, global };
}

function readElementValue(R, t) {
  if (t.type === mi.MATRIX) return parseMatrix(R, t.data).value;
  if (t.type === mi.COMPRESSED) { const raw = inflate(t.data); const r2 = new Reader(raw, R.le, R.warn); return readElementValue(r2, r2.tag(0)); }
  throw corrupt(`unexpected element type ${t.type}`);
}

/** Reads the variables of a Level 5 MAT-file. opts.only: Set of names (or a predicate) to keep. */
export function readMat5(bytes, opts = {}) {
  const info = matHeaderInfo(bytes);
  if (info.kind === 'v73') throw new MError('io:load:v73', 'MAT-file version 7.3 (HDF5 based) is not supported. Save the file with -v7.');
  if (info.kind !== 'v5') throw new MError('io:load:notMatFile', 'The file is not a MAT-file (Level 5).');
  const R = new Reader(bytes, info.le, opts.warn);
  const keep = typeof opts.only === 'function' ? opts.only : opts.only ? (n) => opts.only.has(n) : () => true;
  const out = [];
  let p = 128;
  while (p + 8 <= bytes.length) {
    const t = R.tag(p);
    p = t.next;
    let mat;
    if (t.type === mi.COMPRESSED) {
      const raw = inflate(t.data);
      const r2 = new Reader(raw, info.le, opts.warn);
      const t2 = r2.tag(0);
      if (t2.type !== mi.MATRIX) continue;
      mat = { R: r2, t: t2 };
    } else if (t.type === mi.MATRIX) mat = { R, t };
    else continue;
    // peek at the name before decoding everything
    const v = parseMatrix(mat.R, mat.t.data);
    if (!v.name || v.value === null || !keep(v.name)) continue;
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- writing

class W {
  constructor(cap = 256) { this.buf = new Uint8Array(cap); this.len = 0; }
  ensure(n) { if (this.len + n <= this.buf.length) return; let c = this.buf.length * 2; while (c < this.len + n) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.len)); this.buf = b; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
  u32(x) { this.ensure(4); new DataView(this.buf.buffer).setUint32(this.len, x >>> 0, true); this.len += 4; }
  pad() { const n = pad8(this.len) - this.len; this.ensure(n); this.buf.fill(0, this.len, this.len + n); this.len += n; }
  result() { return this.buf.slice(0, this.len); }
}

function typedBytes(type, values) {
  const size = MI_SIZE[type];
  const b = new Uint8Array(values.length * size);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    switch (type) {
      case mi.INT8: dv.setInt8(i, x); break;
      case mi.UINT8: b[i] = x; break;
      case mi.INT16: dv.setInt16(2 * i, x, true); break;
      case mi.UINT16: dv.setUint16(2 * i, x, true); break;
      case mi.INT32: dv.setInt32(4 * i, x, true); break;
      case mi.UINT32: dv.setUint32(4 * i, x, true); break;
      case mi.SINGLE: dv.setFloat32(4 * i, x, true); break;
      case mi.DOUBLE: dv.setFloat64(8 * i, x, true); break;
      case mi.INT64: dv.setBigInt64(8 * i, BigInt(Math.trunc(x)), true); break;
      case mi.UINT64: dv.setBigUint64(8 * i, BigInt(Math.trunc(Math.max(0, x))), true); break;
      default: throw new Error('bad type');
    }
  }
  return b;
}

function element(w, type, data) {
  if (data.length <= 4 && data.length > 0) {
    w.u32((data.length << 16) | type);
    const four = new Uint8Array(4); four.set(data); w.bytes(four);
    return;
  }
  w.u32(type); w.u32(data.length); w.bytes(data); w.pad();
}

function nameBytes(name) { const b = new Uint8Array(name.length); for (let i = 0; i < name.length; i++) b[i] = name.charCodeAt(i) & 255; return b; }

function header(w, klass, flags, dims, name, nzmax = 0) {
  element(w, mi.UINT32, typedBytes(mi.UINT32, [klass | (flags << 8), nzmax]));
  element(w, mi.INT32, typedBytes(mi.INT32, dims.length >= 2 ? dims : [dims[0] || 0, 1]));
  element(w, mi.INT8, nameBytes(name));
}

/** miMATRIX element bytes of one value (tag included). Returns null for values that cannot be stored. */
function matrixElement(name, v, global, warn) {
  const body = new W(256);
  const gflag = global ? 0x04 : 0;
  if (v == null) return null;
  if (isString(v)) {
    warn(`String array '${name || '(element)'}' was saved as a cell array of character vectors.`);
    v = cell(v.dims, v.data.map((s) => { const t = s ?? ''; return tensor('char', [t.length ? 1 : 0, t.length], Float64Array.from(t, (c) => c.charCodeAt(0))); }));
  }
  if (isSparse(v)) {
    const [m, n] = v.dims;
    const nnz = v.colPtr[n];
    const flags = gflag | (v.im ? 0x08 : 0) | (v.cls === 'logical' ? 0x02 : 0);
    header(body, mx.SPARSE, flags, [m, n], name, Math.max(1, nnz));
    element(body, mi.INT32, typedBytes(mi.INT32, Array.from(v.rowIdx.subarray(0, nnz))));
    element(body, mi.INT32, typedBytes(mi.INT32, Array.from(v.colPtr)));
    element(body, mi.DOUBLE, typedBytes(mi.DOUBLE, Array.from(v.re.subarray(0, nnz))));
    if (v.im) element(body, mi.DOUBLE, typedBytes(mi.DOUBLE, Array.from(v.im.subarray(0, nnz))));
  } else if (isTensor(v)) {
    if (v.cls === 'char') {
      header(body, mx.CHAR, gflag, v.dims, name);
      element(body, mi.UINT16, typedBytes(mi.UINT16, Array.from(v.re)));
    } else if (v.cls === 'logical') {
      header(body, mx.UINT8, gflag | 0x02, v.dims, name);
      element(body, mi.UINT8, typedBytes(mi.UINT8, Array.from(v.re, (x) => (x ? 1 : 0))));
    } else {
      const flags = gflag | (v.im ? 0x08 : 0);
      header(body, CLASS_MX[v.cls], flags, v.dims, name);
      const t = CLASS_MI[v.cls];
      const conv = (arr) => (v.cls in CLASS_MI && !['double', 'single'].includes(v.cls) ? Array.from(arr, (x) => saturate(v.cls, x)) : Array.from(arr));
      element(body, t, typedBytes(t, conv(v.re)));
      if (v.im) element(body, t, typedBytes(t, conv(v.im)));
    }
  } else if (isCell(v)) {
    header(body, mx.CELL, gflag, v.dims, name);
    for (const x of v.data) {
      const e = matrixElement('', x, false, warn) || matrixElement('', tensor('double', [0, 0]), false, warn);
      body.bytes(e);
    }
  } else if (isStruct(v)) {
    const isObj = !!v.className;
    header(body, isObj ? mx.OBJECT : mx.STRUCT, gflag, v.dims, name);
    if (isObj) element(body, mi.INT8, nameBytes(v.className));
    const flen = Math.max(...v.fields.map((f) => f.length), 0) + 1;
    const fl = pad8(Math.max(flen, 8));
    element(body, mi.INT32, typedBytes(mi.INT32, [fl]));
    const nb = new Uint8Array(fl * v.fields.length);
    v.fields.forEach((f, k) => nb.set(nameBytes(f).subarray(0, fl - 1), k * fl));
    element(body, mi.INT8, nb);
    for (const r of v.data) for (const f of v.fields) {
      const e = matrixElement('', r[f], false, warn) || matrixElement('', tensor('double', [0, 0]), false, warn);
      body.bytes(e);
    }
  } else if (isObject(v) || isFuncHandle(v)) {
    warn(`Variable '${name || '(element)'}' of class '${v.cls}' cannot be saved in a MAT-file; it was skipped.`);
    return null;
  } else {
    warn(`Variable '${name || '(element)'}' of class '${v.cls}' cannot be saved; it was skipped.`);
    return null;
  }
  const data = body.result();
  const w = new W(data.length + 8);
  w.u32(mi.MATRIX); w.u32(data.length); w.bytes(data);
  return w.result();
}

function headerText() {
  const d = new Date();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (x) => String(x).padStart(2, '0');
  return `${HEADER_TAG}, Platform: GLNXA64, Created on: ${DAYS[d.getDay()]} ${MON[d.getMonth()]} ${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getFullYear()}`;
}

/** Writes a Level 5 MAT-file. vars: [{ name, value, global }]. */
export function writeMat5(vars, opts = {}) {
  const warn = opts.warn || (() => {});
  const compress = opts.compress !== false;
  const w = new W(1024);
  const head = new Uint8Array(128).fill(32);
  const text = headerText();
  for (let i = 0; i < Math.min(116, text.length); i++) head[i] = text.charCodeAt(i);
  head.fill(0, 116, 124);
  head[124] = 0x00; head[125] = 0x01; head[126] = 0x49; head[127] = 0x4d; // version 0x0100, 'IM'
  w.bytes(head);
  for (const { name, value, global } of vars) {
    const e = matrixElement(name, value, !!global, warn);
    if (!e) continue;
    if (compress) {
      const z = deflate(e, 6);
      w.u32(mi.COMPRESSED); w.u32(z.length); w.bytes(z);
    } else w.bytes(e);
  }
  return w.result();
}

/** Approximate storage size of a value in bytes (for whos -file). */
export function valueBytes(v) {
  if (v == null) return 0;
  if (isSparse(v)) { const nnz = v.colPtr[v.dims[1]]; return nnz * ((v.im ? 16 : 8) + 8) + (v.dims[1] + 1) * 8; }
  if (isTensor(v)) {
    const per = { double: 8, single: 4, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8, logical: 1, char: 2 }[v.cls] || 8;
    return v.re.length * per * (v.im ? 2 : 1);
  }
  if (isCell(v)) return v.data.reduce((s, x) => s + valueBytes(x) + 112, 0);
  if (isStruct(v)) return v.data.reduce((s, r) => s + v.fields.reduce((t, f) => t + valueBytes(r[f]) + 112, 0), 0) + v.fields.length * 64;
  if (isString(v)) return v.data.reduce((s, x) => s + 2 * (x ? x.length : 0) + 16, 150);
  return 0;
}


