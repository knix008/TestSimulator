// Reading .blend files. A .blend describes its own layout: the "SDNA" block lists every struct with its field names and types,
// so fields are found by name for whichever version wrote the file. This is the reader and the plain list of world-space meshes;
// blendscene.js builds whole scenes on it. Nothing here runs anything from the file (a .blend can hold scripts: they are never touched).
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { isZstd, zstdDecompress } from './zstd.js';
import { createMesh } from './mesh.js';
import { gunzip } from './inflate.js';

const decoder = new TextDecoder('latin1');
const cstr = (bytes, at, max = 4096) => {
  let end = at;
  while (end < bytes.length && end < at + max && bytes[end] !== 0) end++;
  return decoder.decode(bytes.subarray(at, end));
};

/** The block headers and the struct table. */
function parseStructure(bytes) {
  if (cstr(bytes, 0, 7) !== 'BLENDER') throw new Error('Not a .blend file');
  // Old: BLENDER_v249 or BLENDER-v249 (the mark is the pointer size) then the endian mark. Blender 5 begins BLENDER17-01v0500.
  let pointer;
  let little;
  let version;
  let offset;
  let wideLength = false;
  if (bytes[7] === 0x5f || bytes[7] === 0x2d) {
    pointer = bytes[7] === 0x5f ? 4 : 8;
    little = bytes[8] === 0x76;
    version = Number(cstr(bytes, 9, 3));
    offset = 12;
  } else {
    const m = /^BLENDER(\d\d)-(\d\d)([vV])(\d{4})/.exec(cstr(bytes, 0, 20));
    if (!m) throw new Error('This .blend file has a header that cannot be read');
    pointer = 8;
    little = m[3] === 'v';
    version = Number(m[4]);
    offset = Number(m[1]);
    wideLength = Number(m[2]) >= 1;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o) => view.getUint32(o, little);
  const ptr = (o) => (pointer === 8 ? view.getBigUint64(o, little).toString() : String(view.getUint32(o, little)));

  const blocks = [];
  const byPointer = new Map();
  let sdna = null;
  for (let o = offset; o + 16 <= bytes.length;) {
    const code = cstr(bytes, o, 4);
    let size;
    let old;
    let index;
    let count;
    let data;
    if (wideLength) {
      // code, struct index, old pointer, length, count (all 64-bit after the first two).
      index = u32(o + 4);
      old = ptr(o + 8);
      size = Number(view.getBigInt64(o + 16, little));
      count = Number(view.getBigInt64(o + 24, little));
      data = o + 32;
    } else {
      size = u32(o + 4);
      old = ptr(o + 8);
      index = u32(o + 8 + pointer);
      count = u32(o + 12 + pointer);
      data = o + 16 + pointer;
    }
    if (code === 'ENDB') break;
    const block = { code, size, old, index, count, data };
    blocks.push(block);
    byPointer.set(old, block);
    if (code === 'DNA1') sdna = block;
    o = data + size;
  }
  if (!sdna) throw new Error('This .blend file has no struct table');

  // SDNA: NAME, TYPE, TLEN and STRC tables, each 4-byte aligned.
  let o = sdna.data;
  const expect = (tag) => { if (cstr(bytes, o, 4) !== tag) throw new Error(`Damaged struct table (no ${tag})`); o += 4; };
  const align = () => { o = sdna.data + (((o - sdna.data) + 3) & ~3); };
  expect('SDNA');
  expect('NAME');
  const names = [];
  for (let n = u32(o), s = (o += 4, 0); s < n; s++) { const x = cstr(bytes, o, 256); names.push(x); o += x.length + 1; }
  align();
  expect('TYPE');
  const types = [];
  for (let n = u32(o), s = (o += 4, 0); s < n; s++) { const x = cstr(bytes, o, 256); types.push(x); o += x.length + 1; }
  align();
  expect('TLEN');
  const lengths = [];
  for (let s = 0; s < types.length; s++, o += 2) lengths.push(view.getUint16(o, little));
  align();
  expect('STRC');
  const structs = [];
  const structByName = new Map();
  const count = u32(o);
  o += 4;
  for (let s = 0; s < count; s++) {
    const type = view.getInt16(o, little);
    const fieldCount = view.getInt16(o + 2, little);
    o += 4;
    const fields = new Map();
    let at = 0;
    for (let f = 0; f < fieldCount; f++, o += 4) {
      const fieldType = types[view.getInt16(o, little)];
      const raw = names[view.getInt16(o + 2, little)];
      const name = raw.replace(/^[*(]+/, '').replace(/\)?\(.*$/, '').replace(/\[.*$/, '');
      const isPointer = raw.startsWith('*') || raw.startsWith('(*');
      const dims = [...raw.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      const elems = dims.reduce((p, d) => p * d, 1);
      const unit = isPointer ? pointer : lengths[view.getInt16(o, little)];
      fields.set(name, { type: fieldType, isPointer, dims, offset: at, unit });
      at += unit * elems;
    }
    const struct = { name: types[type], size: lengths[type], fields };
    structs.push(struct);
    structByName.set(struct.name, struct);
  }
  const text = (block) => cstr(bytes, block.data, block.size);
  return { bytes, view, little, pointer, version, blocks, byPointer, structs, structByName, ptr, text };
}

/** A view of one struct in the file: `get` finds a field by name and quietly returns null if this version lacks it. */
export function record(file, struct, at) {
  const { view, little, bytes } = file;
  const read = (type, o) => {
    switch (type) {
      case 'float': return view.getFloat32(o, little);
      case 'double': return view.getFloat64(o, little);
      case 'int': case 'int32_t': return view.getInt32(o, little);
      case 'short': case 'int16_t': return view.getInt16(o, little);
      case 'ushort': case 'uint16_t': return view.getUint16(o, little);
      case 'uint': case 'uint32_t': return view.getUint32(o, little);
      case 'char': case 'uchar': case 'uint8_t': return bytes[o];
      case 'int8_t': return view.getInt8(o);
      case 'int64_t': case 'uint64_t': return Number(view.getBigInt64(o, little));
      default: return null;
    }
  };
  return {
    structName: struct.name,
    address: null,
    old: (name) => { const f = struct.fields.get(name); return f ? file.ptr(at + f.offset) : null; },
    has: (name) => struct.fields.has(name),
    get(name) {
      const f = struct.fields.get(name);
      if (!f) return null;
      const o = at + f.offset;
      if (f.isPointer) return file.ptr(o);
      if (f.dims.length) {
        if (f.type === 'char') return cstr(bytes, o, f.dims[0]);
        const n = f.dims.reduce((p, d) => p * d, 1);
        return Array.from({ length: n }, (_, i) => read(f.type, o + i * f.unit));
      }
      return read(f.type, o);
    },
    /** A struct inside this one. */
    sub(name) {
      const f = struct.fields.get(name);
      const inner = f && file.structByName.get(f.type);
      return inner ? record(file, inner, at + f.offset) : null;
    },
  };
}

const NULL_POINTER = '0';

/** The block a pointer leads to, or null. */
export const follow = (file, pointer) => (pointer && pointer !== NULL_POINTER ? file.byPointer.get(pointer) ?? null : null);

/** The records of a linked list (a ListBase field), each as the struct its own block says it is. */
export function listOf(file, list) {
  const out = [];
  if (!list) return out;
  const seen = new Set();
  for (let at = list.get('first'); at && at !== NULL_POINTER && !seen.has(at);) {
    seen.add(at);
    const block = file.byPointer.get(at);
    if (!block) break;
    const item = record(file, file.structs[block.index], block.data);
    item.address = at;
    out.push(item);
    at = item.get('next');
  }
  return out;
}

/** The named layer of a custom-data set: its name, type and the block holding its values. */
function customLayers(file, data) {
  if (!data) return [];
  const layersBlock = follow(file, data.get('layers'));
  const total = data.get('totlayer') ?? 0;
  const struct = file.structByName.get('CustomDataLayer');
  if (!layersBlock || !struct) return [];
  const out = [];
  for (let i = 0; i < total; i++) {
    const layer = record(file, struct, layersBlock.data + i * struct.size);
    out.push({ name: layer.get('name') ?? '', type: layer.get('type'), block: follow(file, layer.get('data')) });
  }
  return out;
}

/**
 * Blender 5's attributes: an array of { name, type, domain, storage, data }, where `data` leads to a { data, size } holder.
 * In the same shape as a custom-data layer list.
 */
function storedAttributes(file, mesh) {
  const storage = mesh.sub('attribute_storage');
  const list = storage && follow(file, storage.get('dna_attributes'));
  const count = storage?.get('dna_attributes_num') ?? 0;
  const struct = file.structByName.get('Attribute');
  const holder = file.structByName.get('AttributeArray');
  if (!list || !struct || !holder) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = record(file, struct, list.data + i * struct.size);
    const nameBlock = follow(file, a.get('name'));
    const box = follow(file, a.get('data'));
    const array = box && record(file, holder, box.data);
    out.push({ name: nameBlock ? cstr(file.bytes, nameBlock.data, nameBlock.size) : '', domain: a.get('domain'), block: array ? follow(file, array.get('data')) : null, size: array?.get('size') ?? 0 });
  }
  return out;
}

/** The current name of a custom-data set, older names being tried too: fields were renamed over the years. */
const dataSet = (mesh, ...names) => { for (const n of names) { const s = mesh.sub(n); if (s) return s; } return null; };

export const readBlendMesh = (file, block, ob = null) => readMesh(file, block, ob);

function readMesh(file, block, ob = null) {
  const { view, little } = file;
  const struct = file.structs[block.index];
  const me = record(file, struct, block.data);
  const totvert = me.get('totvert') ?? me.get('verts_num') ?? 0;
  const faces = me.get('totpoly') ?? me.get('faces_num') ?? 0;
  const loops = me.get('totloop') ?? me.get('corners_num') ?? 0;

  const vdata = dataSet(me, 'vert_data', 'vdata');
  const ldata = dataSet(me, 'corner_data', 'ldata');
  const pdata = dataSet(me, 'face_data', 'pdata');
  const stored = storedAttributes(file, me);
  const POINT = 0;
  const CORNER = 3;
  const vertLayers = [...customLayers(file, vdata), ...stored.filter((a) => a.domain === POINT)];
  const cornerLayers = [...customLayers(file, ldata), ...stored.filter((a) => a.domain === CORNER)];
  const FACE = 2;
  const faceLayers = [...customLayers(file, pdata), ...stored.filter((a) => a.domain === FACE)];

  // Positions: a "position" attribute since 3.5; before that an MVert array, as custom data or a plain pointer.
  const verts = [];
  const position = vertLayers.find((l) => l.name === 'position')?.block;
  const mvertBlock = position ? null : follow(file, me.get('mvert'));
  if (position) {
    for (let i = 0; i < totvert; i++) { const o = position.data + i * 12; verts.push([view.getFloat32(o, little), view.getFloat32(o + 4, little), view.getFloat32(o + 8, little)]); }
  } else if (mvertBlock) {
    const mv = file.structByName.get('MVert');
    const co = mv?.fields.get('co');
    if (!mv || !co) throw new Error('This .blend file has vertices in an unknown layout');
    for (let i = 0; i < totvert; i++) { const o = mvertBlock.data + i * mv.size + co.offset; verts.push([view.getFloat32(o, little), view.getFloat32(o + 4, little), view.getFloat32(o + 8, little)]); }
  } else if (totvert) {
    throw new Error('This .blend file keeps its vertices in a layout that cannot be read yet (very likely a Blender newer than this reader)');
  }
  const mesh = createMesh(verts, []);

  // Faces: offsets plus a corner-vertex attribute since 3.6; MPoly + MLoop from 2.63; MFace before.
  const offsets = follow(file, me.get('face_offset_indices') ?? me.get('poly_offset_indices'));
  const cornerVert = cornerLayers.find((l) => l.name === '.corner_vert')?.block;
  const mpoly = follow(file, me.get('mpoly'));
  const mloop = follow(file, me.get('mloop'));
  const mface = follow(file, me.get('mface'));
  const cornerOfFace = [];
  if (offsets && cornerVert) {
    for (let f = 0; f < faces; f++) {
      const a = view.getInt32(offsets.data + f * 4, little);
      const b = view.getInt32(offsets.data + (f + 1) * 4, little);
      const face = [];
      const at = [];
      for (let c = a; c < b; c++) { face.push(view.getInt32(cornerVert.data + c * 4, little)); at.push(c); }
      mesh.faces.push(face);
      cornerOfFace.push(at);
    }
  } else if (mpoly && mloop) {
    const [P, L] = [file.structByName.get('MPoly'), file.structByName.get('MLoop')];
    const [start, total, v] = [P.fields.get('loopstart'), P.fields.get('totloop'), L.fields.get('v')];
    for (let f = 0; f < faces; f++) {
      const base = mpoly.data + f * P.size;
      const a = view.getInt32(base + start.offset, little);
      const n = view.getInt32(base + total.offset, little);
      const face = [];
      const at = [];
      for (let c = a; c < a + n; c++) { face.push(view.getInt32(mloop.data + c * L.size + v.offset, little)); at.push(c); }
      mesh.faces.push(face);
      cornerOfFace.push(at);
    }
  } else if (mface) {
    const F = file.structByName.get('MFace');
    const [v1, v2, v3, v4] = ['v1', 'v2', 'v3', 'v4'].map((n) => F.fields.get(n));
    const totface = me.get('totface') ?? 0;
    for (let f = 0; f < totface; f++) {
      const base = mface.data + f * F.size;
      const read = (x) => view.getInt32(base + x.offset, little);
      const fourth = read(v4);
      mesh.faces.push(fourth ? [read(v1), read(v2), read(v3), fourth] : [read(v1), read(v2), read(v3)]);
    }
  }

  // UVs: a 2-float corner attribute now; MLoopUV before. An attribute's type number 49 is CD_PROP_FLOAT2.
  const twoFloats = (l) => l.block && loops && l.block.size === loops * 8;
  const uvLayer = cornerLayers.find((l) => l.type === 49 && !l.name.startsWith('.')) ?? cornerLayers.find((l) => l.type === 16) ?? cornerLayers.find((l) => l.domain === CORNER && !l.name.startsWith('.') && twoFloats(l));
  if (uvLayer?.block && cornerOfFace.length && loops) {
    const stride = uvLayer.block.size / loops;
    mesh.uvs = cornerOfFace.map((at) => at.map((c) => { const o = uvLayer.block.data + c * stride; return [view.getFloat32(o, little), view.getFloat32(o + 4, little)]; }));
  }

  // Edges that belong to no face: a wire mesh, as Skin and curves start from.
  const edgeData = dataSet(me, 'edge_data', 'edata');
  const EDGE = 1;
  const edgeLayers = [...customLayers(file, edgeData), ...stored.filter((a) => a.domain === EDGE)];
  const edgeVerts = edgeLayers.find((l) => l.name === '.edge_verts')?.block;
  if (edgeVerts) {
    const inFaces = new Set();
    for (const face of mesh.faces) face.forEach((v, i) => { const w = face[(i + 1) % face.length]; inFaces.add(v < w ? `${v}_${w}` : `${w}_${v}`); });
    const count = Math.floor(edgeVerts.size / 8);
    for (let e = 0; e < count; e++) {
      const [a, b] = [view.getInt32(edgeVerts.data + e * 8, little), view.getInt32(edgeVerts.data + e * 8 + 4, little)];
      if (!inFaces.has(a < b ? `${a}_${b}` : `${b}_${a}`)) mesh.loose.push([a, b]);
    }
    // Seams and sharp edges, each a byte per edge.
    for (const [attribute, mark] of [['.uv_seam', 'seam'], ['uv_seam', 'seam'], ['sharp_edge', 'sharp']]) {
      const layer = edgeLayers.find((l) => l.name === attribute)?.block;
      if (!layer) continue;
      for (let e = 0; e < count; e++) {
        if (!file.bytes[layer.data + e]) continue;
        const [a, b] = [view.getInt32(edgeVerts.data + e * 8, little), view.getInt32(edgeVerts.data + e * 8 + 4, little)];
        ((mesh.marks ??= {})[mark] ??= {})[a < b ? `${a}_${b}` : `${b}_${a}`] = true;
      }
    }
  }
  // The Skin modifier's radii.
  const skinStruct = file.structByName.get('MVertSkin');
  const skinLayer = skinStruct && vertLayers.find((l) => l.block && file.structs[l.block.index]?.name === 'MVertSkin')?.block;
  if (skinLayer) {
    mesh.skin = {};
    for (let v = 0; v < totvert; v++) mesh.skin[v] = record(file, skinStruct, skinLayer.data + v * skinStruct.size).get('radius')[0];
  }

  // Flat or smooth: since 4.1 an attribute that is left out when nothing is sharp.
  const sharp = faceLayers.find((l) => l.name === 'sharp_face')?.block;
  if (faces && !mpoly && !mface) mesh.smooth = !sharp || file.bytes.subarray(sharp.data, sharp.data + faces).includes(0);
  const materialIndex = faceLayers.find((l) => l.name === 'material_index')?.block;
  if (materialIndex && materialIndex.size >= faces * 4) mesh.faceMat = Array.from({ length: faces }, (_, f) => view.getInt32(materialIndex.data + f * 4, little));

  // Vertex groups: the names on the mesh since 3.0, on the object before; the weights per vertex in either case.
  const names = [...listOf(file, me.sub('vertex_group_names')), ...(ob ? listOf(file, ob.sub('defbase')) : [])].map((g) => g.get('name'));
  const deform = vertLayers.find((l) => l.type === 2)?.block ?? follow(file, me.get('dvert'));
  const [DV, DW] = [file.structByName.get('MDeformVert'), file.structByName.get('MDeformWeight')];
  if (names.length && deform && DV && DW) {
    mesh.vgroups = names.map((name) => ({ name, w: {} }));
    for (let v = 0; v < totvert; v++) {
      const dv = record(file, DV, deform.data + v * DV.size);
      const list = follow(file, dv.get('dw'));
      const n = dv.get('totweight') ?? 0;
      for (let k = 0; list && k < n; k++) {
        const w = record(file, DW, list.data + k * DW.size);
        const group = mesh.vgroups[w.get('def_nr')];
        if (group && w.get('weight') > 0) group.w[v] = w.get('weight');
      }
    }
  }

  // Shape keys: the first block is the basis, which is the mesh itself.
  const keyBlock = follow(file, me.get('key'));
  if (keyBlock) {
    const blocks = listOf(file, record(file, file.structs[keyBlock.index], keyBlock.data).sub('block'));
    mesh.shapeKeys = blocks.slice(1).map((k) => {
      const data = follow(file, k.get('data'));
      return data && { name: k.get('name'), value: k.get('curval') ?? 0, verts: Array.from({ length: totvert }, (_, v) => [0, 1, 2].map((c) => view.getFloat32(data.data + v * 12 + c * 4, little))) };
    }).filter(Boolean);
  }

  // Materials: the first slot's viewport colour.
  let material = null;
  const matArray = follow(file, me.get('mat'));
  const totcol = me.get('totcol') ?? 0;
  if (matArray && totcol > 0) {
    const first = follow(file, file.ptr(matArray.data));
    if (first) {
      const mat = record(file, file.structs[first.index], first.data);
      const name = (mat.sub('id')?.get('name') ?? 'MAMaterial').slice(2);
      material = { name, baseColor: [mat.get('r') ?? 0.8, mat.get('g') ?? 0.8, mat.get('b') ?? 0.8], metallic: mat.get('metallic') ?? 0, roughness: mat.get('roughness') ?? 0.5 };
    }
  }
  return { mesh, material };
}

/** Blender's Euler XYZ applies X first, which three.js spells 'ZYX'. */
export const blendObjectMatrix = (ob) => localMatrix(ob);

function localMatrix(ob) {
  const loc = ob.get('loc') ?? [0, 0, 0];
  const size = ob.get('size') ?? ob.get('scale') ?? [1, 1, 1];
  const mode = ob.get('rotmode') ?? 1;
  let q;
  if (mode === 0) { const v = ob.get('quat') ?? [1, 0, 0, 0]; q = new Quaternion(v[1], v[2], v[3], v[0]); }
  else if (mode === -1) { const axis = ob.get('rotAxis') ?? [0, 1, 0]; q = new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), ob.get('rotAngle') ?? 0); }
  else {
    const r = ob.get('rot') ?? [0, 0, 0];
    // The file's order numbers: 1 XYZ, 2 XZY, 3 YXZ, 4 YZX, 5 ZXY, 6 ZYX; three.js names them in the reverse order.
    const order = { 1: 'ZYX', 2: 'YZX', 3: 'ZXY', 4: 'XZY', 5: 'YXZ', 6: 'XYZ' }[mode] ?? 'ZYX';
    q = new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], order));
  }
  return new Matrix4().compose(new Vector3(loc[0], loc[1], loc[2]), q, new Vector3(size[0], size[1], size[2]));
}

/** A .blend's structure, compressed with gzip or Zstandard or not. */
export function openBlend(input) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzip(bytes);
  else if (isZstd(bytes)) bytes = zstdDecompress(bytes);
  return parseStructure(bytes);
}

/** Meshes of a .blend file, as { name, mesh (world space), material }. */
export function importBlend(input) {
  const file = openBlend(input);
  const meshes = new Map();
  const objects = [];
  for (const block of file.blocks) {
    if (block.code === 'ME') { try { meshes.set(block.old, block); } catch { /* a block that doesn't parse is left out */ } }
    if (block.code === 'OB') objects.push(block);
  }
  const records = new Map(objects.map((b) => [b.old, record(file, file.structs[b.index], b.data)]));
  const worldOf = (old, guard = 0) => {
    const ob = records.get(old);
    if (!ob || guard > 256) return new Matrix4();
    const local = localMatrix(ob);
    const parent = ob.get('parent');
    if (parent && parent !== NULL_POINTER && records.has(parent)) {
      const inverse = ob.get('parentinv');
      const pinv = inverse ? new Matrix4().fromArray(inverse) : new Matrix4();
      return worldOf(parent, guard + 1).multiply(pinv).multiply(local);
    }
    return local;
  };
  const out = [];
  const point = new Vector3();
  const OB_MESH = 1;
  for (const block of objects) {
    const ob = records.get(block.old);
    if (ob.get('type') !== OB_MESH) continue;
    const data = meshes.get(ob.get('data'));
    if (!data) continue;
    const { mesh, material } = readMesh(file, data);
    const world = worldOf(block.old);
    mesh.verts = mesh.verts.map((v) => { point.set(v[0], v[1], v[2]).applyMatrix4(world); return [point.x, point.y, point.z]; });
    if (world.determinant() < 0) { mesh.faces = mesh.faces.map((f) => [...f].reverse()); if (mesh.uvs) mesh.uvs = mesh.uvs.map((u) => [...u].reverse()); }
    out.push({ name: (ob.sub('id')?.get('name') ?? 'OBObject').slice(2), mesh, material });
  }
  return out;
}

/** What kind of file this is, for messages: the version that saved it. */
export function blendVersion(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0x1f) return null;
  return parseStructure(isZstd(bytes) ? zstdDecompress(bytes) : bytes).version;
}
