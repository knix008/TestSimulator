// Binary USD (.usdc, the "crate" format). The file has six tables (tokens, strings, fields, field sets, paths, specs); values sit elsewhere
// and are reached through 8-byte "value reps". LZ4 and an integer delta coding compress the tables. Reading only: USD text is what this
// program writes, and every USD reader takes it. Checked against files written by a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { createMesh } from './mesh.js';

/** One raw LZ4 block. */
function lz4Block(input, size) {
  const out = new Uint8Array(size);
  let [i, o] = [0, 0];
  while (i < input.length) {
    const token = input[i++];
    let literals = token >> 4;
    if (literals === 15) { let b; do { b = input[i++]; literals += b; } while (b === 255); }
    out.set(input.subarray(i, i + literals), o);
    i += literals;
    o += literals;
    if (i >= input.length) break;
    const offset = input[i] | (input[i + 1] << 8);
    i += 2;
    if (!offset) throw new Error('Damaged LZ4 data in this USD file');
    let length = token & 15;
    if (length === 15) { let b; do { b = input[i++]; length += b; } while (b === 255); }
    length += 4;
    for (let k = 0; k < length; k++, o++) out[o] = out[o - offset];
  }
  return out.subarray(0, o);
}

/** USD's wrapping of LZ4: a count of chunks, 0 meaning one block that is all the rest. */
function fastDecompress(input, size) {
  const chunks = input[0];
  if (chunks === 0) return lz4Block(input.subarray(1), size);
  const out = new Uint8Array(size);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let [i, o] = [1, 0];
  for (let c = 0; c < chunks; c++) {
    const length = view.getInt32(i, true);
    i += 4;
    const part = lz4Block(input.subarray(i, i + length), Math.min(size - o, 0x7e000000));
    out.set(part, o);
    o += part.length;
    i += length;
  }
  return out.subarray(0, o);
}

/** Integers as running deltas: a common delta, then 2-bit codes saying how each one is stored. */
function decodeInts(bytes, count, wide = false) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const common = wide ? Number(view.getBigInt64(0, true)) : view.getInt32(0, true);
  let at = wide ? 8 : 4;
  const codes = at;
  at += Math.floor((count * 2 + 7) / 8);
  const out = new Array(count);
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const code = (bytes[codes + (i >> 2)] >> ((i & 3) * 2)) & 3;
    let delta = common;
    if (code === 1) { if (wide) { delta = view.getInt16(at, true); at += 2; } else { delta = view.getInt8(at); at += 1; } }
    else if (code === 2) { if (wide) { delta = view.getInt32(at, true); at += 4; } else { delta = view.getInt16(at, true); at += 2; } }
    else if (code === 3) { if (wide) { delta = Number(view.getBigInt64(at, true)); at += 8; } else { delta = view.getInt32(at, true); at += 4; } }
    previous += delta;
    out[i] = previous;
  }
  return out;
}

const MATRIX_SIZE = { 13: 2, 14: 3, 15: 4 };
const VECTORS = { 16: ['f64', 4], 17: ['f32', 4], 18: ['f16', 4], 19: ['f64', 2], 20: ['f32', 2], 21: ['f16', 2], 22: ['i32', 2], 23: ['f64', 3], 24: ['f32', 3], 25: ['f16', 3], 26: ['i32', 3], 27: ['f64', 4], 28: ['f32', 4], 29: ['f16', 4], 30: ['i32', 4] };
// Quaternions are stored imaginary part first; the text format, and this reader, put the real part first.
const QUATS = new Set([16, 17, 18]);
const realFirst = (q) => [q[3], q[0], q[1], q[2]];
/** A half float. */
export function halfToFloat(h) {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 31;
  const frac = h & 1023;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

export class Crate {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.version = [bytes[8], bytes[9], bytes[10]];
    if (this.version[0] === 0 && this.version[1] < 4) throw new Error('This .usdc is older than USD 0.4 and cannot be read');
    const tocAt = this.u64(16);
    const sections = {};
    const count = this.u64(tocAt);
    for (let i = 0; i < count; i++) {
      const at = tocAt + 8 + i * 32;
      const name = new TextDecoder().decode(bytes.subarray(at, at + 16)).replace(/\0.*$/s, '');
      sections[name] = this.u64(at + 16);
    }
    this.readTokens(sections.TOKENS);
    this.readStrings(sections.STRINGS);
    this.readFields(sections.FIELDS);
    this.readFieldSets(sections.FIELDSETS);
    this.readPaths(sections.PATHS);
    this.readSpecs(sections.SPECS);
  }

  u64(at) { return Number(this.view.getBigUint64(at, true)); }

  /** A size-prefixed compressed run of integers at the cursor. */
  ints(cursor, count, wide = false) {
    const size = this.u64(cursor.at);
    const chunk = this.bytes.subarray(cursor.at + 8, cursor.at + 8 + size);
    cursor.at += 8 + size;
    // The worst case: the common value, the codes, every value at full width.
    const room = (wide ? 8 : 4) + Math.floor((count * 2 + 7) / 8) + count * (wide ? 8 : 4);
    return decodeInts(fastDecompress(chunk, room), count, wide);
  }

  readTokens(at) {
    const count = this.u64(at);
    const size = this.u64(at + 8);
    const compressed = this.u64(at + 16);
    const raw = fastDecompress(this.bytes.subarray(at + 24, at + 24 + compressed), size);
    const decoder = new TextDecoder();
    this.tokens = [];
    let start = 0;
    for (let i = 0; i < raw.length && this.tokens.length < count; i++) if (raw[i] === 0) { this.tokens.push(decoder.decode(raw.subarray(start, i))); start = i + 1; }
  }

  readStrings(at) {
    const count = this.u64(at);
    this.strings = Array.from({ length: count }, (_, i) => this.tokens[this.view.getUint32(at + 8 + i * 4, true)]);
  }

  readFields(at) {
    const count = this.u64(at);
    const cursor = { at: at + 8 };
    const names = this.ints(cursor, count);
    const size = this.u64(cursor.at);
    const raw = fastDecompress(this.bytes.subarray(cursor.at + 8, cursor.at + 8 + size), count * 8);
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    this.fields = names.map((n, i) => ({ name: this.tokens[n], rep: view.getBigUint64(i * 8, true) }));
  }

  readFieldSets(at) {
    const count = this.u64(at);
    this.fieldSets = this.ints({ at: at + 8 }, count);
  }

  readPaths(at) {
    const total = this.u64(at);
    const cursor = { at: at + 16 };
    const count = this.u64(at + 8);
    const [indexes, elements, jumps] = [this.ints(cursor, count), this.ints(cursor, count), this.ints(cursor, count)];
    this.paths = new Array(total).fill('');
    const build = (parent, start) => {
      let index = start;
      let hasChild;
      let hasSibling;
      do {
        const here = index++;
        let path;
        if (parent == null) path = '/';
        else {
          const element = elements[here];
          const name = this.tokens[Math.abs(element)];
          path = element < 0 ? `${parent}.${name}` : parent === '/' ? `/${name}` : `${parent}/${name}`;
        }
        this.paths[indexes[here]] = path;
        hasChild = jumps[here] > 0 || jumps[here] === -1;
        hasSibling = jumps[here] >= 0;
        if (hasChild) {
          if (hasSibling) build(parent, here + jumps[here]);
          parent = path;
        }
      } while (hasChild || hasSibling);
    };
    if (count) build(null, 0);
  }

  readSpecs(at) {
    const count = this.u64(at);
    const cursor = { at: at + 8 };
    const [paths, sets, types] = [this.ints(cursor, count), this.ints(cursor, count), this.ints(cursor, count)];
    this.specs = new Map();
    for (let i = 0; i < count; i++) {
      const fields = {};
      for (let k = sets[i]; k >= 0 && k < this.fieldSets.length && this.fieldSets[k] !== -1; k++) {
        const f = this.fields[this.fieldSets[k]];
        fields[f.name] = f.rep;
      }
      this.specs.set(this.paths[paths[i]], { type: types[i], fields });
    }
  }

  /** A rep turned into a value. Kinds this reader has no use for come back as null. */
  value(rep) {
    if (rep == null) return null;
    const isArray = (rep >> 63n) & 1n;
    const inlined = (rep >> 62n) & 1n;
    const compressed = (rep >> 61n) & 1n;
    const type = Number((rep >> 48n) & 0xffn);
    const payload = Number(rep & 0xffffffffffffn);
    if (isArray) return this.arrayValue(type, payload, !!compressed);
    return inlined ? this.inlineValue(type, payload) : this.outOfLine(type, payload);
  }

  inlineValue(type, payload) {
    const low = payload % 0x100000000;
    const scratch = new DataView(new ArrayBuffer(8));
    scratch.setUint32(0, low, true);
    const small = (n) => Array.from({ length: n }, (_, k) => scratch.getInt8(k));
    switch (type) {
      case 1: return low !== 0;
      case 2: case 4: return low;
      case 3: return scratch.getInt32(0, true);
      case 8: case 9: return scratch.getFloat32(0, true);
      case 10: return this.strings[low];
      case 11: case 12: return this.tokens[low];
      case 15: { const d = small(4); return [d[0], 0, 0, 0, 0, d[1], 0, 0, 0, 0, d[2], 0, 0, 0, 0, d[3]]; }
      case 14: { const d = small(3); return [d[0], 0, 0, 0, d[1], 0, 0, 0, d[2]]; }
      case 19: case 20: case 21: case 22: return small(2);
      case 23: case 24: case 25: case 26: return small(3);
      case 27: case 28: case 29: case 30: return small(4);
      default: return low;
    }
  }

  outOfLine(type, at) {
    const v = this.view;
    if (VECTORS[type]) { const q = this.numbers(VECTORS[type][0], at, VECTORS[type][1]); return QUATS.has(type) ? realFirst(q) : q; }
    if (MATRIX_SIZE[type]) return this.numbers('f64', at, MATRIX_SIZE[type] ** 2);
    switch (type) {
      case 9: return v.getFloat64(at, true);
      case 5: return Number(v.getBigInt64(at, true));
      case 6: return this.u64(at);
      case 41: { const n = this.u64(at); return Array.from({ length: n }, (_, i) => this.tokens[v.getUint32(at + 8 + i * 4, true)]); }
      case 46: return this.timeSamples(at);
      case 48: { const n = this.u64(at); return this.numbers('f64', at + 8, n); }
      case 34: return this.pathListOp(at);
      case 35: return this.listOp(at, (c) => this.reference(c));
      case 47: return this.payload({ at });
      case 55: return this.listOp(at, (c) => this.payload(c));
      default: return null;
    }
  }

  /** A list op of items read by `item` from a cursor: every item it adds, deleted ones aside. */
  listOp(at, item) {
    const header = this.bytes[at];
    const cursor = { at: at + 1 };
    const out = [];
    for (const [bit, keep] of [[2, true], [4, true], [32, true], [64, true], [8, false], [16, false]]) {
      if (!(header & bit)) continue;
      const n = this.u64(cursor.at);
      cursor.at += 8;
      for (let i = 0; i < n; i++) { const x = item(cursor); if (keep) out.push(x); }
    }
    return out;
  }

  /** A dictionary passed over: a count, then keys with values reached by an offset (nested data before the value's rep). */
  skipDictionary(cursor) {
    const n = this.u64(cursor.at);
    cursor.at += 8;
    for (let i = 0; i < n; i++) {
      cursor.at += 4;
      const offset = Number(this.view.getBigInt64(cursor.at, true));
      cursor.at += offset + 8;
    }
  }

  /** A reference: a file (empty for this one), a prim path, a time offset and scale, custom data. */
  reference(cursor) {
    const asset = this.strings[this.view.getUint32(cursor.at, true)];
    const path = this.paths[this.view.getUint32(cursor.at + 4, true)];
    cursor.at += 8 + 16;
    this.skipDictionary(cursor);
    return { ...(asset ? { asset } : {}), ...(path ? { path } : {}) };
  }

  /** A payload: a file, a prim path and a time offset. */
  payload(cursor) {
    const asset = this.strings[this.view.getUint32(cursor.at, true)];
    const path = this.paths[this.view.getUint32(cursor.at + 4, true)];
    cursor.at += 8 + (this.version[0] > 0 || this.version[1] >= 8 ? 16 : 0);
    return { ...(asset ? { asset } : {}), ...(path ? { path } : {}) };
  }

  numbers(kind, at, count) {
    const v = this.view;
    const size = kind === 'f64' ? 8 : kind === 'f16' ? 2 : 4;
    const read = kind === 'f64' ? (o) => v.getFloat64(o, true) : kind === 'f32' ? (o) => v.getFloat32(o, true) : kind === 'f16' ? (o) => halfToFloat(v.getUint16(o, true)) : (o) => v.getInt32(o, true);
    return Array.from({ length: count }, (_, i) => read(at + i * size));
  }

  arrayValue(type, at, compressed) {
    if (!at) return [];
    const v = this.view;
    const wideCount = this.version[0] > 0 || this.version[1] >= 7;
    const count = wideCount ? this.u64(at) : v.getUint32(at, true);
    const start = at + (wideCount ? 8 : 4);
    if (compressed && (type === 3 || type === 4 || type === 5 || type === 6)) return this.ints({ at: start }, count, type === 5 || type === 6);
    if (compressed && (type === 8 || type === 9)) {
      const code = String.fromCharCode(this.bytes[start]);
      if (code === 'i') return this.ints({ at: start + 1 }, count);
      const entries = v.getUint32(start + 1, true);
      const table = this.numbers(type === 9 ? 'f64' : 'f32', start + 5, entries);
      return this.ints({ at: start + 5 + entries * (type === 9 ? 8 : 4) }, count).map((k) => table[k]);
    }
    switch (type) {
      case 3: case 4: return this.numbers('i32', start, count);
      case 8: return this.numbers('f32', start, count);
      case 9: return this.numbers('f64', start, count);
      case 11: return Array.from({ length: count }, (_, i) => this.tokens[v.getUint32(start + i * 4, true)]);
      case 10: return Array.from({ length: count }, (_, i) => this.strings[v.getUint32(start + i * 4, true)]);
      case 7: return this.numbers('f16', start, count);
      default: {
        if (MATRIX_SIZE[type]) { const n = MATRIX_SIZE[type] ** 2; return Array.from({ length: count }, (_, i) => this.numbers('f64', start + i * n * 8, n)); }
        const shape = VECTORS[type];
        if (!shape) return null;
        const size = shape[0] === 'f64' ? 8 : shape[0] === 'f16' ? 2 : 4;
        const list = Array.from({ length: count }, (_, i) => this.numbers(shape[0], start + i * shape[1] * size, shape[1]));
        return QUATS.has(type) ? list.map(realFirst) : list;
      }
    }
  }

  /** A list of paths as edited (explicit, added, prepended, appended): every path it names, deleted ones aside. */
  pathListOp(at) {
    const header = this.bytes[at];
    let cursor = at + 1;
    const out = [];
    // Explicit, added, prepended, appended, deleted, ordered: each a count and that many path indexes.
    for (const [bit, keep] of [[2, true], [4, true], [32, true], [64, true], [8, false], [16, false]]) {
      if (!(header & bit)) continue;
      const n = this.u64(cursor);
      for (let i = 0; i < n; i++) { const p = this.paths[this.view.getUint32(cursor + 8 + i * 4, true)]; if (keep && !out.includes(p)) out.push(p); }
      cursor += 8 + n * 4;
    }
    return out;
  }

  /** Times, then a jump, then a count and that many reps. */
  timeSamples(at) {
    const jump = Number(this.view.getBigInt64(at, true));
    const timesRep = this.view.getBigUint64(at + jump, true);
    const times = this.value(timesRep) ?? [];
    const valueJumpAt = at + jump + 8;
    const second = Number(this.view.getBigInt64(valueJumpAt, true));
    const countAt = valueJumpAt + second;
    const count = this.u64(countAt);
    const values = Array.from({ length: count }, (_, i) => this.value(this.view.getBigUint64(countAt + 8 + i * 8, true)));
    return { times, values };
  }
}

const DEG = Math.PI / 180;
const EULER_ORDER = { rotateXYZ: 'ZYX', rotateXZY: 'YZX', rotateYXZ: 'ZXY', rotateYZX: 'XZY', rotateZXY: 'YXZ', rotateZYX: 'XYZ' };

/** A list of { name, mesh (world space), material }, at the first time sample when anything is animated. */
export function importUSDC(input) {
  let crate;
  try { crate = new Crate(input); } catch (error) { throw new Error(`This binary .usdc file is damaged or of an unknown kind (${error.message})`); }
  const attr = (path, name) => {
    const spec = crate.specs.get(`${path}.${name}`);
    if (!spec) return null;
    if (spec.fields.default != null) return crate.value(spec.fields.default);
    if (spec.fields.timeSamples == null) return null;
    const samples = crate.value(spec.fields.timeSamples);
    return samples?.values?.[0] ?? null;
  };
  const root = crate.specs.get('/');
  const up = crate.value(root?.fields.upAxis) ?? 'Y';
  const meters = crate.value(root?.fields.metersPerUnit) ?? 1;
  const stage = new Matrix4().makeScale(meters, meters, meters);
  if (up === 'Y') stage.premultiply(new Matrix4().makeRotationX(Math.PI / 2));

  const opMatrix = (path, op) => {
    const inverse = op.startsWith('!invert!');
    const name = inverse ? op.slice(8) : op;
    const kind = name.split(':')[1];
    const value = attr(path, name);
    let m = new Matrix4();
    if (value != null) {
      if (kind === 'transform') m.fromArray(value);
      else if (kind === 'translate') m.makeTranslation(value[0], value[1], value[2]);
      else if (kind === 'scale') m.makeScale(value[0], value[1], value[2]);
      else if (kind === 'orient') m.makeRotationFromQuaternion(new Quaternion(value[1], value[2], value[3], value[0]));
      else if (EULER_ORDER[kind]) m.makeRotationFromEuler(new Euler(value[0] * DEG, value[1] * DEG, value[2] * DEG, EULER_ORDER[kind]));
      else if (kind === 'rotateX') m.makeRotationX(value * DEG);
      else if (kind === 'rotateY') m.makeRotationY(value * DEG);
      else if (kind === 'rotateZ') m.makeRotationZ(value * DEG);
    }
    if (inverse) m = m.invert();
    return m;
  };
  const localOf = (path) => {
    const order = attr(path, 'xformOpOrder');
    const m = new Matrix4();
    for (const op of order ?? []) m.multiply(opMatrix(path, op));
    return m;
  };
  const worldOf = (path) => {
    if (path === '/' || !path) return stage.clone();
    return worldOf(path.slice(0, path.lastIndexOf('/')) || '/').multiply(localOf(path));
  };

  const out = [];
  const point = new Vector3();
  for (const [path, spec] of crate.specs) {
    if (path.includes('.') || crate.value(spec.fields.typeName) !== 'Mesh') continue;
    const points = attr(path, 'points');
    const counts = attr(path, 'faceVertexCounts');
    const indices = attr(path, 'faceVertexIndices');
    if (!points?.length || !counts || !indices) continue;
    const world = worldOf(path);
    const verts = points.map((p) => { point.set(p[0], p[1], p[2]).applyMatrix4(world); return [point.x, point.y, point.z]; });
    const flip = (attr(path, 'orientation') === 'leftHanded') !== (world.determinant() < 0);
    const faces = [];
    const ranges = [];
    let at = 0;
    for (const n of counts) {
      const face = indices.slice(at, at + n);
      faces.push(flip ? face.reverse() : face);
      ranges.push(at);
      at += n;
    }
    const mesh = createMesh(verts, faces);
    // Texture coordinates under whichever name, per corner.
    const primvar = ['primvars:st', 'primvars:UVMap', 'primvars:uv', 'primvars:map1'].find((n) => crate.specs.has(`${path}.${n}`));
    const uv = primvar ? attr(path, primvar) : null;
    if (uv?.length) {
      const lookup = attr(path, `${primvar}:indices`);
      const interpolation = crate.value(crate.specs.get(`${path}.${primvar}`)?.fields.interpolation) ?? 'faceVarying';
      const at2 = (corner, vertex) => { const k = interpolation === 'vertex' || interpolation === 'varying' ? vertex : corner; return uv[lookup ? lookup[k] : k] ?? [0, 0]; };
      mesh.uvs = counts.map((n, f) => {
        const list = Array.from({ length: n }, (_, c) => [...at2(ranges[f] + c, indices[ranges[f] + c])].slice(0, 2));
        return flip ? list.reverse() : list;
      });
    }
    mesh.smooth = crate.value(spec.fields.subdivisionScheme) === 'catmullClark';
    const color = attr(path, 'primvars:displayColor');
    const name = path.slice(path.lastIndexOf('/') + 1);
    // Blender nests a mesh in a transform named after the object.
    const parent = path.slice(0, path.lastIndexOf('/'));
    const shown = parent && parent !== '/' && crate.specs.get(parent) && crate.value(crate.specs.get(parent).fields.typeName) === 'Xform' ? parent.slice(parent.lastIndexOf('/') + 1) : name;
    const baseColor = color?.[0] ?? null;
    out.push({ name: shown, mesh, material: baseColor ? { name: `${shown} colour`, baseColor: baseColor.slice(0, 3), metallic: 0, roughness: 0.5 } : null });
  }
  return out;
}
