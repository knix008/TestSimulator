// Alembic (.abc), the Ogawa container: written here from the format as Alembic's own library lays it out, and checked against files
// written by Blender and read by Blender (npm run verify:blender). Polygon meshes with their UVs and transforms, at one sample of time.
// Curves, cameras, subdivision creases and arbitrary attributes are left out; reading skips them.
import { Matrix4, Vector3 } from 'three';

// ─────────────── the container: groups of children, each either a group or a block of data

const DATA_BIT = 0x80000000;

export class OgawaReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 16 || new TextDecoder().decode(bytes.subarray(0, 5)) !== 'Ogawa') {
      if (bytes[0] === 0x89 && bytes[1] === 0x48) throw new Error('This is an old Alembic file in the HDF5 layout. Only the Ogawa layout can be read: save it again with a current program.');
      throw new Error('Not an Alembic file');
    }
  }

  u64(at) { return this.view.getUint32(at, true) + this.view.getUint32(at + 4, true) * 2 ** 32; }

  root() { return this.group(this.u64(8)); }

  group(at) {
    if (!at) return [];
    const count = this.u64(at);
    const children = [];
    for (let i = 0; i < count; i++) {
      const low = this.view.getUint32(at + 8 + i * 8, true);
      const high = this.view.getUint32(at + 12 + i * 8, true);
      children.push({ data: (high & DATA_BIT) !== 0, at: low + (high & 0x7fffffff) * 2 ** 32 });
    }
    return children;
  }

  data(child) {
    if (!child?.at) return new Uint8Array(0);
    const size = this.u64(child.at);
    return this.bytes.subarray(child.at + 8, child.at + 8 + size);
  }
}

class OgawaWriter {
  constructor() {
    this.parts = [];
    this.length = 16;
  }

  put(bytes) {
    const at = this.length;
    this.parts.push(bytes);
    this.length += bytes.length;
    return at;
  }

  data(bytes) {
    if (!bytes.length) return { data: true, at: 0 };
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, bytes.length, true);
    const at = this.put(head);
    this.put(bytes);
    return { data: true, at };
  }

  group(children) {
    const out = new Uint8Array(8 + children.length * 8);
    const view = new DataView(out.buffer);
    view.setUint32(0, children.length, true);
    children.forEach((c, i) => {
      view.setUint32(8 + i * 8, c.at % 2 ** 32, true);
      view.setUint32(12 + i * 8, (Math.floor(c.at / 2 ** 32) | (c.data ? DATA_BIT : 0)) >>> 0, true);
    });
    return { data: false, at: this.put(out) };
  }

  finish(root) {
    const head = new Uint8Array(16);
    head.set(new TextEncoder().encode('Ogawa'));
    head[5] = 0xff; // frozen: complete
    head[6] = 0;
    head[7] = 1;
    new DataView(head.buffer).setUint32(8, root.at, true);
    const out = new Uint8Array(this.length);
    out.set(head);
    let at = 16;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

// ─────────────── properties

const POD = ['bool', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'u64', 'i64', 'f16', 'f32', 'f64', 'string', 'wstring'];
const POD_SIZE = { bool: 1, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, f16: 2, f32: 4, f64: 8 };

const decoder = new TextDecoder();
const parseMeta = (text) => Object.fromEntries(text.split(';').filter(Boolean).map((pair) => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));

export function readIndexedMeta(reader, child) {
  const bytes = reader.data(child);
  const list = [''];
  let at = 0;
  while (at < bytes.length) {
    const size = bytes[at++];
    list.push(decoder.decode(bytes.subarray(at, at + size)));
    at += size;
  }
  return list;
}

/** The properties of a compound: the last child holds the headers; the others are the properties, in the same order. */
export function readProperties(reader, group, meta) {
  const children = reader.group(group.at);
  const out = new Map();
  if (!children.length || !children.at(-1).data) return out;
  const bytes = reader.data(children.at(-1));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  let index = 0;
  while (at < bytes.length) {
    const info = view.getUint32(at, true);
    at += 4;
    const type = info & 3; // 0: compound, 1: scalar, 2: array
    const hint = (info >> 2) & 3;
    const size = [1, 2, 4][hint];
    const uint = () => { const v = size === 1 ? view.getUint8(at) : size === 2 ? view.getUint16(at, true) : view.getUint32(at, true); at += size; return v; };
    const p = { compound: type === 0, array: type === 2, group: children[index] };
    if (type !== 0) {
      p.pod = POD[(info >> 4) & 15];
      p.extent = (info >> 12) & 255;
      p.next = uint();
      if (info & 0x200) { p.first = uint(); p.last = uint(); } else if (info & 0x800) { p.first = 0; p.last = 0; } else { p.first = 1; p.last = p.next - 1; }
      p.ts = info & 0x100 ? uint() : 0;
    }
    const nameSize = uint();
    p.name = decoder.decode(bytes.subarray(at, at + nameSize));
    at += nameSize;
    const metaIndex = (info >> 20) & 255;
    if (metaIndex === 255) {
      const metaSize = uint();
      p.meta = parseMeta(decoder.decode(bytes.subarray(at, at + metaSize)));
      at += metaSize;
    } else p.meta = parseMeta(meta[metaIndex] ?? '');
    out.set(p.name, p);
    index++;
  }
  return out;
}

/** Which stored sample holds sample `i`: samples that did not change are not stored again. */
const storedIndex = (p, i) => {
  if (i < p.first || (p.first === 0 && p.last === 0)) return 0;
  if (i >= p.last) return p.last - p.first + 1;
  return i - p.first + 1;
};

function typed(bytes, pod) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.floor(bytes.length / POD_SIZE[pod]);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    if (pod === 'f32') out[i] = view.getFloat32(i * 4, true);
    else if (pod === 'f64') out[i] = view.getFloat64(i * 8, true);
    else if (pod === 'i32') out[i] = view.getInt32(i * 4, true);
    else if (pod === 'u32') out[i] = view.getUint32(i * 4, true);
    else if (pod === 'u8' || pod === 'bool') out[i] = view.getUint8(i);
    else if (pod === 'i8') out[i] = view.getInt8(i);
    else if (pod === 'i16') out[i] = view.getInt16(i * 2, true);
    else if (pod === 'u16') out[i] = view.getUint16(i * 2, true);
    else out[i] = 0;
  }
  return out;
}

/** The values of a scalar or array property at sample `i`, as a flat list. Every stored sample begins with a 16 byte key. */
export function readSample(reader, p, i) {
  const children = reader.group(p.group.at);
  if (!children.length) return [];
  const stored = storedIndex(p, Math.min(i, Math.max(0, p.next - 1)));
  const child = children[p.array ? stored * 2 : stored];
  const bytes = reader.data(child);
  return bytes.length < 16 ? [] : typed(bytes.subarray(16), p.pod);
}

// ─────────────── reading a scene

/**
 * The archive's time samplings: [{ max, perCycle, times }]. A uniform one has one time and a step; a cyclic one repeats its times
 * every cycle; an acyclic one lists every time.
 */
export function readTimeSamplings(reader, child) {
  const bytes = reader.data(child);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let at = 0;
  while (at + 16 <= bytes.length) {
    const max = view.getUint32(at, true);
    const perCycle = view.getFloat64(at + 4, true);
    const n = view.getUint32(at + 12, true);
    at += 16;
    const times = [];
    for (let i = 0; i < n && at + 8 <= bytes.length; i++, at += 8) times.push(view.getFloat64(at, true));
    out.push({ max, perCycle, times });
  }
  return out;
}

/** The time of sample `i` in a time sampling, in seconds. */
export function sampleTime(sampling, i) {
  const { perCycle, times } = sampling ?? { perCycle: 1, times: [0] };
  if (!times.length) return i;
  if (times.length === 1) return times[0] + i * perCycle;
  // Acyclic: Alembic marks it with a cycle of the largest double over 32.
  if (perCycle > 1e300) return times[Math.min(i, times.length - 1)];
  return times[i % times.length] + Math.floor(i / times.length) * perCycle;
}

/** The headers of an object's children: [{ name, meta }]. */
export function readObjectHeaders(reader, children, meta) {
  const last = children.at(-1);
  if (!last?.data) return [];
  const data = reader.data(last);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = data.length - 32;
  const list = [];
  let at = 0;
  while (at < end) {
    const nameSize = view.getUint32(at, true);
    at += 4;
    const name = decoder.decode(data.subarray(at, at + nameSize));
    at += nameSize;
    const index = data[at++];
    let text;
    if (index === 255) { const size = view.getUint32(at, true); at += 4; text = decoder.decode(data.subarray(at, at + size)); at += size; } else text = meta[index] ?? '';
    list.push({ name, meta: parseMeta(text) });
  }
  return list;
}

export function xformMatrix(reader, schema, sample) {
  const m = new Matrix4();
  const ops = schema.get('.ops');
  const vals = schema.get('.vals');
  if (!ops || !vals) return m;
  const codes = readSample(reader, ops, sample);
  const values = readSample(reader, vals, sample);
  let at = 0;
  const op = new Matrix4();
  const axis = new Vector3();
  for (const code of codes) {
    const kind = code >> 4;
    if (kind === 0) { op.makeScale(values[at], values[at + 1], values[at + 2]); at += 3; } else if (kind === 1) { op.makeTranslation(values[at], values[at + 1], values[at + 2]); at += 3; } else if (kind === 2) {
      axis.set(values[at], values[at + 1], values[at + 2]).normalize();
      op.makeRotationAxis(axis, (values[at + 3] * Math.PI) / 180);
      at += 4;
    } else if (kind === 3) {
      // Alembic's matrices are row-major for row vectors, which is the same list of numbers as column-major for column vectors.
      op.fromArray(values, at);
      at += 16;
    } else {
      const angle = (values[at++] * Math.PI) / 180;
      if (kind === 4) op.makeRotationX(angle); else if (kind === 5) op.makeRotationY(angle); else op.makeRotationZ(angle);
    }
    m.multiply(op);
  }
  return m;
}

function readMesh(reader, geom, meta, sample, world, name) {
  const pProp = geom.get('P');
  const counts = geom.get('.faceCounts');
  const indices = geom.get('.faceIndices');
  if (!pProp || !counts || !indices) return null;
  const flat = readSample(reader, pProp, sample);
  const point = new Vector3();
  const verts = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    point.set(flat[i], flat[i + 1], flat[i + 2]).applyMatrix4(world);
    verts.push([point.x, point.y, point.z]);
  }
  const faceCounts = readSample(reader, counts, sample);
  const faceIndices = readSample(reader, indices, sample);
  // Alembic's faces wind the other way round, and mirrored transforms turn them once more.
  const flip = world.determinant() > 0;
  const faces = [];
  let at = 0;
  const corners = [];
  for (const n of faceCounts) {
    const face = faceIndices.slice(at, at + n);
    const order = face.map((_, k) => at + k);
    faces.push(flip ? face.reverse() : face);
    corners.push(flip ? order.reverse() : order);
    at += n;
  }
  const mesh = { verts, faces };
  // UVs: per face corner, either a list of their own or values with indices into them.
  const uvProp = geom.get('uv') ?? geom.get('.arbGeomParams');
  let uvVals = null;
  let uvIndices = null;
  if (uvProp) {
    const holder = uvProp.name === 'uv' ? uvProp : readProperties(reader, uvProp.group, meta).get('uv');
    if (holder?.compound) {
      const parts = readProperties(reader, holder.group, meta);
      if (parts.get('.vals')) uvVals = readSample(reader, parts.get('.vals'), sample);
      if (parts.get('.indices')) uvIndices = readSample(reader, parts.get('.indices'), sample);
    } else if (holder) uvVals = readSample(reader, holder, sample);
  }
  if (uvVals?.length) {
    const uvAt = (corner) => { const i = uvIndices ? uvIndices[corner] : corner; return [uvVals[i * 2] ?? 0, uvVals[i * 2 + 1] ?? 0]; };
    mesh.uvs = corners.map((face) => face.map(uvAt));
  }
  return { name, mesh, material: null };
}

/** Meshes of an Alembic file in world space, Z up, as { name, mesh }. `sample` picks the moment in time. */
export function importABC(input, { sample = 0 } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = new OgawaReader(bytes);
  const root = reader.root();
  if (root.length < 6) throw new Error('This Alembic file has a layout that cannot be read');
  const meta = readIndexedMeta(reader, root[5]);
  const out = [];
  const objectHeaders = (children) => {
    const last = children.at(-1);
    if (!last?.data) return [];
    const data = reader.data(last);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const end = data.length - 32;
    const list = [];
    let at = 0;
    while (at < end) {
      const nameSize = view.getUint32(at, true);
      at += 4;
      const name = decoder.decode(data.subarray(at, at + nameSize));
      at += nameSize;
      const index = data[at++];
      let text;
      if (index === 255) {
        const size = view.getUint32(at, true);
        at += 4;
        text = decoder.decode(data.subarray(at, at + size));
        at += size;
      } else text = meta[index] ?? '';
      list.push({ name, meta: parseMeta(text) });
    }
    return list;
  };
  // Alembic is Y up: turned into this program's Z up at the top.
  const walk = (group, header, parentWorld, parentName, siblings) => {
    const children = reader.group(group.at);
    if (!children.length) return;
    const props = readProperties(reader, children[0], meta);
    const schema = header?.meta.schema ?? '';
    let world = parentWorld;
    if (schema.startsWith('AbcGeom_Xform')) {
      const compound = props.get('.xform');
      if (compound) world = new Matrix4().multiplyMatrices(parentWorld, xformMatrix(reader, readProperties(reader, compound.group, meta), sample));
    }
    if (schema.startsWith('AbcGeom_PolyMesh') || schema.startsWith('AbcGeom_SubD')) {
      const compound = props.get('.geom');
      if (compound) {
        // The usual layout has an Xform holding a single shape: the Xform's name is what a person gave it.
        const name = siblings === 1 && parentName ? parentName : header.name;
        const item = readMesh(reader, readProperties(reader, compound.group, meta), meta, sample, world, name);
        if (item) out.push(item);
      }
    }
    const headers = objectHeaders(children);
    headers.forEach((h, i) => {
      const child = children[i + 1];
      if (child && !child.data) walk(child, h, world, header?.name ?? '', headers.length);
    });
  };
  const yUpToZUp = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  walk(root[2], null, yUpToZUp, '', 0);
  return out;
}

/**
 * Every transform of an Alembic file in the world, Z up, at every sample: { samples: { '/path/to/xform': [16 numbers per sample…] }, count }.
 * For a transform cache: the matrices are in this program's column order.
 */
const Z_UP_TO_Y_UP = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
export function readABCTransforms(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let count = 1;
  // The number of samples is the longest of any transform's: read it once at sample 0 to find the paths, then every sample.
  const paths = new Map();
  const visit = (sample) => {
    const reader = new OgawaReader(bytes);
    const root = reader.root();
    if (root.length < 6) throw new Error('This Alembic file has a layout that cannot be read');
    const meta = readIndexedMeta(reader, root[5]);
    const headersOf = (children) => {
      const last = children.at(-1);
      if (!last?.data) return [];
      const data = reader.data(last);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const end = data.length - 32;
      const list = [];
      let at = 0;
      while (at < end) {
        const nameSize = view.getUint32(at, true);
        at += 4;
        const name = decoder.decode(data.subarray(at, at + nameSize));
        at += nameSize;
        const index = data[at++];
        let text;
        if (index === 255) { const size = view.getUint32(at, true); at += 4; text = decoder.decode(data.subarray(at, at + size)); at += size; } else text = meta[index] ?? '';
        list.push({ name, meta: parseMeta(text) });
      }
      return list;
    };
    const walk = (group, header, parentWorld, path) => {
      const children = reader.group(group.at);
      if (!children.length) return;
      const props = readProperties(reader, children[0], meta);
      let world = parentWorld;
      if ((header?.meta.schema ?? '').startsWith('AbcGeom_Xform')) {
        const compound = props.get('.xform');
        if (compound) {
          const schema = readProperties(reader, compound.group, meta);
          const vals = schema.get('.vals');
          if (vals) count = Math.max(count, vals.next ?? 1);
          world = new Matrix4().multiplyMatrices(parentWorld, xformMatrix(reader, schema, sample));
          if (!paths.has(path)) paths.set(path, []);
          // The object's own axes are Y up as well: turned on that side too, as Blender does on import.
          paths.get(path)[sample] = [...world.clone().multiply(Z_UP_TO_Y_UP).elements];
        }
      }
      headersOf(children).forEach((h, i) => {
        const child = children[i + 1];
        if (child && !child.data) walk(child, h, world, `${path}/${h.name}`);
      });
    };
    walk(root[2], null, new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1), '');
  };
  visit(0);
  for (let i = 1; i < count; i++) visit(i);
  return { samples: Object.fromEntries(paths), count };
}

// ─────────────── writing

const encoder = new TextEncoder();

/** A 128 bit digest. Alembic uses keys to tell samples apart; only sameness matters, so any good hash does. */
function sampleKey(bytes) {
  const out = new Uint8Array(16);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 + bytes[i], 0x85ebca6b) ^ (h2 >>> 13);
  }
  const view = new DataView(out.buffer);
  view.setUint32(0, h1, true);
  view.setUint32(4, h2, true);
  view.setUint32(8, Math.imul(h1, 0xc2b2ae35) ^ h2, true);
  view.setUint32(12, bytes.length, true);
  return out;
}

const withKey = (bytes) => { const out = new Uint8Array(bytes.length + 16); out.set(sampleKey(bytes)); out.set(bytes, 16); return out; };
const asBytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const metaText = (m) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(';');

/** Writes a list of property headers with 4 byte sizes and metadata in line. */
function propertyHeaders(list) {
  const chunks = [];
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); chunks.push(b); };
  for (const p of list) {
    const text = encoder.encode(metaText(p.meta ?? {}));
    let info = 2 << 2; // 4 byte sizes
    info |= (text.length ? 255 : 0) << 20;
    // A property with many samples stores each of them, on a time sampling of its own.
    const many = !p.compound && p.samples?.length > 1;
    if (p.compound) info |= 0;
    else {
      info |= p.array ? 2 : 1;
      info |= POD.indexOf(p.pod) << 4;
      info |= p.extent << 12;
      if (!many) info |= 0x800; // constant
      info |= 0x400; // homogeneous
      if (many && p.ts) info |= 0x100;
    }
    u32(info >>> 0);
    if (!p.compound) u32(many ? p.samples.length : 1);
    if (many && p.ts) u32(p.ts);
    const name = encoder.encode(p.name);
    u32(name.length);
    chunks.push(name);
    if (text.length) { u32(text.length); chunks.push(text); }
  }
  return concat(chunks);
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function writeCompound(w, list) {
  const children = list.map((p) => {
    if (p.compound) return writeCompound(w, p.children);
    const samples = p.samples?.length > 1 ? p.samples : [p.bytes ?? p.samples[0]];
    if (p.array) return w.group(samples.flatMap((bytes) => [w.data(withKey(bytes)), { data: true, at: 0 }]));
    return w.group(samples.map((bytes) => w.data(withKey(bytes))));
  });
  children.push(w.data(propertyHeaders(list)));
  return w.group(children);
}

function objectHeader(name, meta) {
  const nameBytes = encoder.encode(name);
  const text = encoder.encode(metaText(meta));
  const head = new Uint8Array(4 + nameBytes.length + 1 + 4 + text.length);
  const view = new DataView(head.buffer);
  view.setUint32(0, nameBytes.length, true);
  head.set(nameBytes, 4);
  head[4 + nameBytes.length] = 255;
  view.setUint32(5 + nameBytes.length, text.length, true);
  head.set(text, 9 + nameBytes.length);
  return head;
}

function writeObject(w, properties, kids) {
  const groups = [writeCompound(w, properties), ...kids.map((k) => writeObject(w, k.properties, k.kids))];
  groups.push(w.data(concat([...kids.map((k) => objectHeader(k.name, k.meta)), new Uint8Array(32)])));
  return w.group(groups);
}

const safeName = (name, taken) => {
  const base = String(name).replace(/[/\\]/g, '_') || 'Object';
  let out = base;
  for (let i = 1; taken.has(out); i++) out = `${base}_${i}`;
  taken.add(out);
  return out;
};

/** One Alembic file from [{ name, mesh (world space, Z up) }]: an Xform holding a PolyMesh for each, Y up as Alembic expects. */
export function exportABC(objects) {
  const w = new OgawaWriter();
  const taken = new Set();
  const identity = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const kids = objects.map(({ name, mesh }) => {
    const points = new Float32Array(mesh.verts.length * 3);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    mesh.verts.forEach((v, i) => {
      // Z up to Y up.
      const p = [v[0], v[2], -v[1]];
      points.set(p, i * 3);
      for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
    });
    // Alembic's faces wind the other way round.
    const reversed = mesh.faces.map((f) => [...f].reverse());
    const counts = Int32Array.from(reversed.map((f) => f.length));
    const indices = Int32Array.from(reversed.flat());
    const geom = [
      { name: '.selfBnds', pod: 'f64', extent: 6, meta: { interpretation: 'box' }, bytes: asBytes(new Float64Array(mesh.verts.length ? [...low, ...high] : [0, 0, 0, 0, 0, 0])) },
      { name: 'P', pod: 'f32', extent: 3, array: true, meta: { interpretation: 'point' }, bytes: asBytes(points) },
      { name: '.faceIndices', pod: 'i32', extent: 1, array: true, bytes: asBytes(indices) },
      { name: '.faceCounts', pod: 'i32', extent: 1, array: true, bytes: asBytes(counts) },
    ];
    if (mesh.uvs?.some(Boolean)) {
      const uv = new Float32Array(indices.length * 2);
      let at = 0;
      mesh.faces.forEach((face, f) => {
        for (let k = face.length - 1; k >= 0; k--) { const c = mesh.uvs[f]?.[k] ?? [0, 0]; uv[at++] = c[0]; uv[at++] = c[1]; }
      });
      geom.push({ name: 'uv', pod: 'f32', extent: 2, array: true, meta: { arrayExtent: 1, geoScope: 'fvr', interpretation: 'vector', isGeomParam: 'true', podExtent: 2, podName: 'float32_t' }, bytes: asBytes(uv) });
    }
    const label = safeName(name, taken);
    return {
      name: label,
      meta: { schema: 'AbcGeom_Xform_v3', schemaObjTitle: 'AbcGeom_Xform_v3:.xform' },
      properties: [{
        name: '.xform', compound: true, meta: { schema: 'AbcGeom_Xform_v3' },
        children: [
          { name: '.inherits', pod: 'bool', extent: 1, bytes: Uint8Array.of(1) },
          { name: '.ops', pod: 'u8', extent: 1, bytes: Uint8Array.of(0x30) },
          { name: '.vals', pod: 'f64', extent: 16, bytes: asBytes(identity) },
        ],
      }],
      kids: [{
        name: `${label}Shape`,
        meta: { schema: 'AbcGeom_PolyMesh_v1', schemaBaseType: 'AbcGeom_GeomBase_v1', schemaObjTitle: 'AbcGeom_PolyMesh_v1:.geom' },
        properties: [{ name: '.geom', compound: true, meta: { schema: 'AbcGeom_PolyMesh_v1', schemaBaseType: 'AbcGeom_GeomBase_v1' }, children: geom }],
        kids: [],
      }],
    };
  });
  return writeArchive(kids, [], w);
}

/**
 * A whole archive from a tree of objects ({ name, meta, properties, kids }). `samplings` are the time samplings after the default
 * one (index 0): [{ max, perCycle, start }], uniform.
 */
export function writeArchive(kids, samplings = [], w = new OgawaWriter()) {
  const version = new Uint8Array(4);
  const library = new Uint8Array(4);
  new DataView(library.buffer).setInt32(0, 10800, true);
  const versionChild = w.data(version);
  const libraryChild = w.data(library);
  const top = writeObject(w, [], kids);
  const archive = w.data(encoder.encode(metaText({ _ai_Application: 'My3DBlender', _ai_AlembicVersion: 'Alembic 1.8.0', _ai_DateWritten: new Date().toUTCString().replace(/[;=]/g, ' '), _ai_UserDescription: '' })));
  // The default time sampling first, then the scene's.
  const all = [{ max: 1, perCycle: 1, start: 0 }, ...samplings];
  const times = new Uint8Array(all.length * 24);
  const tv = new DataView(times.buffer);
  all.forEach((s, i) => {
    tv.setUint32(i * 24, s.max, true);
    tv.setFloat64(i * 24 + 4, s.perCycle, true);
    tv.setUint32(i * 24 + 12, 1, true);
    tv.setFloat64(i * 24 + 16, s.start, true);
  });
  const timeChild = w.data(times);
  const metaChild = w.data(new Uint8Array(0));
  return w.finish(w.group([versionChild, libraryChild, top, archive, timeChild, metaChild]));
}

export { asBytes, safeName };
