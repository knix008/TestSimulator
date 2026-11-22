// Mesh exchange formats (no DOM, no kernel): writing and reading OBJ, PLY, glTF / GLB, VRML 2.0, 3MF and USDZ.
//
// Writers take items [{ name, color: [r, g, b] (0…1), vertices: Float32Array (x, y, z mm, the app's Z-up),
// triangles: Uint32Array }]. Readers return objects [{ name, verts: [[x, y, z] mm, Z up], tris: [[a, b, c]] }].
// Each format's own conventions are kept: glTF and VRML are in metres with Y up, 3MF in millimetres (or its unit
// attribute) with Z up, USD in millimetres (metersPerUnit 0.001) with Z up, OBJ and PLY carry no units (mm).
import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6));
// Metres (glTF, VRML): nine decimals keep the micrometre.
const fmtM = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9));
const hex2 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
const clean = (s, fallback) => String(s ?? fallback).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || fallback;

// Z-up millimetres (the app) ↔ Y-up metres (glTF, VRML): x → x, y → −z, z → y.
const toYUp = (x, y, z) => [x / 1000, z / 1000, -y / 1000];
const fromYUp = (x, y, z) => [x * 1000, -z * 1000, y * 1000];

// ───────────────────────── writers

/** Wavefront OBJ, one object per item, vertex colours after the coordinates (read by most mesh tools). */
export function writeObj(items) {
  const out = ['# MyMechanics OBJ export (mm, Z up)'];
  let base = 1;
  items.forEach((it, k) => {
    out.push(`o ${clean(it.name, `body${k + 1}`)}`);
    const [r, g, b] = it.color ?? [0.7, 0.7, 0.7];
    const V = it.vertices;
    for (let i = 0; i < V.length; i += 3) out.push(`v ${fmt(V[i])} ${fmt(V[i + 1])} ${fmt(V[i + 2])} ${fmt(r)} ${fmt(g)} ${fmt(b)}`);
    const T = it.triangles;
    for (let i = 0; i < T.length; i += 3) out.push(`f ${T[i] + base} ${T[i + 1] + base} ${T[i + 2] + base}`);
    base += V.length / 3;
  });
  return `${out.join('\n')}\n`;
}

/** Binary little-endian PLY with per-vertex colours (all items in one mesh). */
export function writePly(items) {
  const nv = items.reduce((s, it) => s + it.vertices.length / 3, 0);
  const nf = items.reduce((s, it) => s + it.triangles.length / 3, 0);
  const header = enc(['ply', 'format binary_little_endian 1.0', 'comment MyMechanics PLY export (mm, Z up)', `element vertex ${nv}`, 'property float x', 'property float y', 'property float z', 'property uchar red', 'property uchar green', 'property uchar blue', `element face ${nf}`, 'property list uchar int vertex_indices', 'end_header', ''].join('\n'));
  const body = new DataView(new ArrayBuffer(nv * 15 + nf * 13));
  let o = 0;
  for (const it of items) {
    const c = (it.color ?? [0.7, 0.7, 0.7]).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
    for (let i = 0; i < it.vertices.length; i += 3) {
      body.setFloat32(o, it.vertices[i], true); body.setFloat32(o + 4, it.vertices[i + 1], true); body.setFloat32(o + 8, it.vertices[i + 2], true);
      body.setUint8(o + 12, c[0]); body.setUint8(o + 13, c[1]); body.setUint8(o + 14, c[2]); o += 15;
    }
  }
  let base = 0;
  for (const it of items) {
    for (let i = 0; i < it.triangles.length; i += 3) {
      body.setUint8(o, 3); body.setInt32(o + 1, it.triangles[i] + base, true); body.setInt32(o + 5, it.triangles[i + 1] + base, true); body.setInt32(o + 9, it.triangles[i + 2] + base, true); o += 13;
    }
    base += it.vertices.length / 3;
  }
  const out = new Uint8Array(header.length + body.byteLength);
  out.set(header, 0); out.set(new Uint8Array(body.buffer), header.length);
  return out;
}

/** The glTF 2.0 document and its binary buffer: one mesh, node and material per item (metres, Y up). */
function gltfParts(items) {
  const chunks = []; let length = 0;
  const push = (bytes) => { const pad = (4 - (length % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); length += pad; } const at = length; chunks.push(bytes); length += bytes.length; return at; };
  const doc = { asset: { version: '2.0', generator: 'MyMechanics' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  items.forEach((it, k) => {
    const n = it.vertices.length / 3;
    const pos = new Float32Array(n * 3); const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const p = toYUp(it.vertices[3 * i], it.vertices[3 * i + 1], it.vertices[3 * i + 2]);
      for (let a = 0; a < 3; a++) { pos[3 * i + a] = p[a]; lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
    }
    const idx = Uint32Array.from(it.triangles);
    const pv = doc.bufferViews.push({ buffer: 0, byteOffset: push(new Uint8Array(pos.buffer)), byteLength: pos.byteLength, target: 34962 }) - 1;
    const iv = doc.bufferViews.push({ buffer: 0, byteOffset: push(new Uint8Array(idx.buffer)), byteLength: idx.byteLength, target: 34963 }) - 1;
    const pa = doc.accessors.push({ bufferView: pv, componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi }) - 1;
    const ia = doc.accessors.push({ bufferView: iv, componentType: 5125, count: idx.length, type: 'SCALAR' }) - 1;
    const mat = doc.materials.push({ name: `${it.name ?? `body${k + 1}`}`, pbrMetallicRoughness: { baseColorFactor: [...(it.color ?? [0.7, 0.7, 0.7]), 1], metallicFactor: 0.2, roughnessFactor: 0.5 } }) - 1;
    const mesh = doc.meshes.push({ name: it.name ?? `body${k + 1}`, primitives: [{ attributes: { POSITION: pa }, indices: ia, material: mat, mode: 4 }] }) - 1;
    doc.scenes[0].nodes.push(doc.nodes.push({ name: it.name ?? `body${k + 1}`, mesh }) - 1);
  });
  const bin = new Uint8Array(length + ((4 - (length % 4)) % 4));
  let at = 0; for (const c of chunks) { bin.set(c, at); at += c.length; }
  doc.buffers.push({ byteLength: bin.length });
  return { doc, bin };
}

/** glTF 2.0 as one .gltf text file (the buffer embedded as a data URI). */
export function writeGltf(items) {
  const { doc, bin } = gltfParts(items);
  let s = ''; for (let i = 0; i < bin.length; i += 0x8000) s += String.fromCharCode(...bin.subarray(i, i + 0x8000));
  doc.buffers[0].uri = `data:application/octet-stream;base64,${btoa(s)}`;
  return JSON.stringify(doc);
}

/** Binary glTF (.glb): header, JSON chunk, BIN chunk. */
export function writeGlb(items) {
  const { doc, bin } = gltfParts(items);
  let json = enc(JSON.stringify(doc));
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) { const j = new Uint8Array(json.length + pad).fill(0x20); j.set(json); json = j; }
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total); const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, json.length, true); v.setUint32(16, 0x4e4f534a, true); out.set(json, 20);
  v.setUint32(20 + json.length, bin.length, true); v.setUint32(24 + json.length, 0x004e4942, true); out.set(bin, 28 + json.length);
  return out;
}

/** VRML 2.0 (.wrl): a Shape with an IndexedFaceSet per item (metres, Y up), its colour as the material. */
export function writeVrml(items) {
  const out = ['#VRML V2.0 utf8', '# MyMechanics VRML export (metres, Y up)'];
  items.forEach((it, k) => {
    const [r, g, b] = it.color ?? [0.7, 0.7, 0.7];
    const pts = []; for (let i = 0; i < it.vertices.length; i += 3) pts.push(toYUp(it.vertices[i], it.vertices[i + 1], it.vertices[i + 2]).map(fmtM).join(' '));
    const idx = []; for (let i = 0; i < it.triangles.length; i += 3) idx.push(`${it.triangles[i]} ${it.triangles[i + 1]} ${it.triangles[i + 2]} -1`);
    out.push(`DEF ${clean(it.name, `body${k + 1}`)} Shape {`, `  appearance Appearance { material Material { diffuseColor ${fmt(r)} ${fmt(g)} ${fmt(b)} } }`, '  geometry IndexedFaceSet {', '    solid TRUE', `    coord Coordinate { point [ ${pts.join(', ')} ] }`, `    coordIndex [ ${idx.join(', ')} ]`, '  }', '}');
  });
  return `${out.join('\n')}\n`;
}

/** 3MF (.3mf): the core model XML (millimetres, Z up), a base material per item, in a zip with its content types. */
export function write3mf(items) {
  const objects = []; const build = [];
  const mats = items.map((it, k) => { const [r, g, b] = it.color ?? [0.7, 0.7, 0.7]; return `<base name="${clean(it.name, `body${k + 1}`)}" displaycolor="#${hex2(r)}${hex2(g)}${hex2(b)}"/>`; });
  items.forEach((it, k) => {
    const id = k + 2;
    const vs = []; for (let i = 0; i < it.vertices.length; i += 3) vs.push(`<vertex x="${fmt(it.vertices[i])}" y="${fmt(it.vertices[i + 1])}" z="${fmt(it.vertices[i + 2])}"/>`);
    const ts = []; for (let i = 0; i < it.triangles.length; i += 3) ts.push(`<triangle v1="${it.triangles[i]}" v2="${it.triangles[i + 1]}" v3="${it.triangles[i + 2]}"/>`);
    objects.push(`<object id="${id}" name="${clean(it.name, `body${k + 1}`)}" type="model" pid="1" pindex="${k}"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`);
    build.push(`<item objectid="${id}"/>`);
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">MyMechanics</metadata><resources><basematerials id="1">${mats.join('')}</basematerials>${objects.join('')}</resources><build>${build.join('')}</build></model>`;
  const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return zipSync({ '[Content_Types].xml': strToU8(types), '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) }, { level: 6 });
}

/** USDZ: a Z-up USD stage (millimetres) with a Mesh and display colour per item, stored with 64-byte alignment. */
export function writeUsdz(items) {
  const prims = items.map((it, k) => {
    const pts = []; for (let i = 0; i < it.vertices.length; i += 3) pts.push(`(${fmt(it.vertices[i])}, ${fmt(it.vertices[i + 1])}, ${fmt(it.vertices[i + 2])})`);
    const idx = Array.from(it.triangles).join(', ');
    const [r, g, b] = it.color ?? [0.7, 0.7, 0.7];
    return `    def Mesh "${clean(it.name, `body${k + 1}`)}"\n    {\n        int[] faceVertexCounts = [${new Array(it.triangles.length / 3).fill(3).join(', ')}]\n        int[] faceVertexIndices = [${idx}]\n        point3f[] points = [${pts.join(', ')}]\n        color3f[] primvars:displayColor = [(${fmt(r)}, ${fmt(g)}, ${fmt(b)})]\n        uniform token subdivisionScheme = "none"\n    }`;
  });
  const usda = `#usda 1.0\n(\n    defaultPrim = "Root"\n    metersPerUnit = 0.001\n    upAxis = "Z"\n)\n\ndef Xform "Root"\n{\n${prims.join('\n')}\n}\n`;
  const files = { 'model.usda': strToU8(usda) };
  // Every file's data must start on a 64-byte boundary (the USDZ rule): padding in a local header's extra field.
  let offset = 0;
  for (const name of Object.keys(files)) {
    offset += 34 + name.length;
    const m = offset & 63;
    if (m !== 4) { const pad = new Uint8Array(64 - m); files[name] = [files[name], { extra: { 12345: pad } }]; offset += pad.length; }
    offset += (Array.isArray(files[name]) ? files[name][0] : files[name]).length;
  }
  return zipSync(files, { level: 0 });
}

// ───────────────────────── readers

const object = (name) => ({ name, verts: [], tris: [] });
const fan = (o, idx) => { for (let i = 1; i + 1 < idx.length; i++) o.tris.push([idx[0], idx[i], idx[i + 1]]); };

/** OBJ: v / f (polygons fanned, v/vt/vn and negative indices), o and g start objects. */
export function readObj(text) {
  const all = []; let cur = object('obj'); const verts = [];
  const local = new Map();
  const flush = () => { if (cur.tris.length) all.push(cur); };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const [tag, ...rest] = line.split(/\s+/);
    if (tag === 'v') verts.push([Number(rest[0]), Number(rest[1]), Number(rest[2])]);
    else if (tag === 'o' || tag === 'g') { flush(); cur = object(rest.join(' ') || `obj${all.length + 1}`); local.clear(); }
    else if (tag === 'f') {
      const idx = rest.map((r) => { let i = Number(r.split('/')[0]); i = i < 0 ? verts.length + i : i - 1; if (!local.has(i)) { local.set(i, cur.verts.length); cur.verts.push(verts[i]); } return local.get(i); });
      fan(cur, idx);
    }
  }
  flush();
  return all;
}

/** PLY: ascii, binary_little_endian or binary_big_endian; vertex x y z and the face list (fanned). */
export function readPly(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const headEnd = (() => { const s = dec(b.subarray(0, Math.min(b.length, 4096))); const i = s.indexOf('end_header'); if (i < 0) throw Object.assign(new Error('not a PLY file'), { code: 'bad-file' }); return enc(s.slice(0, i)).length + 'end_header'.length + (s[i + 10] === '\r' ? 2 : 1); })();
  const header = dec(b.subarray(0, headEnd)).split(/\r?\n/);
  const format = header.find((l) => l.startsWith('format'))?.split(/\s+/)[1];
  const elements = []; let el = null;
  for (const l of header) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'element') { el = { name: p[1], count: Number(p[2]), props: [] }; elements.push(el); }
    else if (p[0] === 'property' && el) el.props.push(p[1] === 'list' ? { list: true, countType: p[2], type: p[3], name: p[4] } : { type: p[1], name: p[2] });
  }
  const o = object('ply');
  const SIZE = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  if (format === 'ascii') {
    const tokens = dec(b.subarray(headEnd)).trim().split(/\s+/).map(Number); let t = 0;
    for (const e of elements) for (let i = 0; i < e.count; i++) {
      const rec = {};
      for (const p of e.props) { if (p.list) { const n = tokens[t++]; rec[p.name] = tokens.slice(t, t + n); t += n; } else rec[p.name] = tokens[t++]; }
      if (e.name === 'vertex') o.verts.push([rec.x, rec.y, rec.z]); else if (e.name === 'face') fan(o, rec.vertex_indices ?? rec.vertex_index ?? []);
    }
  } else {
    const le = format !== 'binary_big_endian';
    const v = new DataView(b.buffer, b.byteOffset + headEnd, b.byteLength - headEnd); let at = 0;
    const read = (type) => {
      const s = SIZE[type]; let x;
      switch (type) {
        case 'char': case 'int8': x = v.getInt8(at); break;
        case 'uchar': case 'uint8': x = v.getUint8(at); break;
        case 'short': case 'int16': x = v.getInt16(at, le); break;
        case 'ushort': case 'uint16': x = v.getUint16(at, le); break;
        case 'int': case 'int32': x = v.getInt32(at, le); break;
        case 'uint': case 'uint32': x = v.getUint32(at, le); break;
        case 'float': case 'float32': x = v.getFloat32(at, le); break;
        default: x = v.getFloat64(at, le);
      }
      at += s; return x;
    };
    for (const e of elements) for (let i = 0; i < e.count; i++) {
      const rec = {};
      for (const p of e.props) { if (p.list) { const n = read(p.countType); const l = []; for (let k = 0; k < n; k++) l.push(read(p.type)); rec[p.name] = l; } else rec[p.name] = read(p.type); }
      if (e.name === 'vertex') o.verts.push([rec.x, rec.y, rec.z]); else if (e.name === 'face') fan(o, rec.vertex_indices ?? rec.vertex_index ?? []);
    }
  }
  return splitConnected(o);
}

/** One object per connected piece of a mesh (PLY has no objects: a file of several bodies is one mesh). */
function splitConnected(o) {
  const parent = o.verts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // Vertices at the same place are joined too (a mesh exported face by face repeats its corners).
  const at = new Map();
  o.verts.forEach((p, i) => { const k = p.map((v) => Math.round(v * 1e5)).join(","); if (at.has(k)) parent[find(i)] = find(at.get(k)); else at.set(k, i); });
  for (const [a, b, c] of o.tris) { parent[find(a)] = find(b); parent[find(b)] = find(c); }
  const groups = new Map();
  for (const t of o.tris) { const r = find(t[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  if (groups.size <= 1) return [o];
  return [...groups.values()].map((tris, k) => {
    const map = new Map(); const verts = [];
    const at = (i) => { if (!map.has(i)) { map.set(i, verts.length); verts.push(o.verts[i]); } return map.get(i); };
    return { name: `${o.name}${k + 1}`, verts, tris: tris.map(([a, b, c]) => [at(a), at(b), at(c)]) };
  });
}

/** glTF 2.0 (.gltf text with embedded buffers, or .glb): every triangle primitive through its node transforms. */
export function readGltf(input) {
  let doc; let bin = null;
  const b = typeof input === 'string' ? null : (input instanceof Uint8Array ? input : new Uint8Array(input));
  if (b && b.length >= 12 && new DataView(b.buffer, b.byteOffset).getUint32(0, true) === 0x46546c67) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let at = 12;
    while (at < b.length) { const len = v.getUint32(at, true); const type = v.getUint32(at + 4, true); const data = b.subarray(at + 8, at + 8 + len); if (type === 0x4e4f534a) doc = JSON.parse(dec(data)); else if (type === 0x004e4942) bin = data; at += 8 + len; }
  } else doc = JSON.parse(typeof input === 'string' ? input : dec(b));
  const buffers = (doc.buffers ?? []).map((buf) => { if (!buf.uri) return bin; const m = /^data:[^,]*;base64,(.*)$/.exec(buf.uri); if (!m) throw Object.assign(new Error('external glTF buffers are not supported: use .glb or embedded buffers'), { code: 'bad-file' }); const s = atob(m[1]); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; });
  const accessor = (i) => {
    const a = doc.accessors[i]; const bv = doc.bufferViews[a.bufferView]; const buf = buffers[bv.buffer];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const stride = bv.byteStride ?? comps * size; const v = new DataView(buf.buffer, buf.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
    const out = [];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) {
      const o = k * stride + c * size;
      out.push(a.componentType === 5126 ? v.getFloat32(o, true) : a.componentType === 5125 ? v.getUint32(o, true) : a.componentType === 5123 ? v.getUint16(o, true) : a.componentType === 5121 ? v.getUint8(o) : a.componentType === 5122 ? v.getInt16(o, true) : v.getInt8(o));
    }
    return out;
  };
  const mul = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return C; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = n.scale ?? [1, 1, 1]; const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const all = [];
  const visit = (ni, parent) => {
    const n = doc.nodes[ni]; const M = mul(parent, local(n));
    if (n.mesh != null) {
      const mesh = doc.meshes[n.mesh];
      const o = object(n.name ?? mesh.name ?? `mesh${n.mesh}`);
      for (const prim of mesh.primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const P = accessor(prim.attributes.POSITION); const base = o.verts.length;
        for (let i = 0; i < P.length; i += 3) { const x = P[i]; const y = P[i + 1]; const z = P[i + 2]; o.verts.push(fromYUp(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14])); }
        const I = prim.indices != null ? accessor(prim.indices) : Array.from({ length: P.length / 3 }, (_, i) => i);
        for (let i = 0; i + 2 < I.length; i += 3) o.tris.push([I[i] + base, I[i + 1] + base, I[i + 2] + base]);
      }
      if (o.tris.length) all.push(o);
    }
    for (const c of n.children ?? []) visit(c, M);
  };
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? doc.nodes.map((_, i) => i);
  for (const r of roots) visit(r, ident);
  return all;
}

/** VRML 2.0: IndexedFaceSet geometry under nested Transform / Group nodes (translation, rotation, scale, center). */
export function readVrml(text) {
  if (!/^#VRML V2\.0/.test(text)) throw Object.assign(new Error('not a VRML 2.0 file'), { code: 'bad-file' });
  const tokens = text.replace(/#[^\n]*/g, ' ').match(/[[\]{}]|"[^"]*"|[^\s,[\]{}]+/g) ?? [];
  let t = 0;
  const defs = new Map();
  const isName = (x) => typeof x === 'string' && /^[A-Za-z_]/.test(x) && x !== 'TRUE' && x !== 'FALSE' && x !== 'NULL';
  // A node: Type { field value … }, DEF name Node, USE name.
  const parseNode = () => {
    if (tokens[t] === 'DEF') { t++; const name = tokens[t++]; const n = parseNode(); if (n) { n.name = name; defs.set(name, n); } return n; }
    if (tokens[t] === 'USE') { t++; return defs.get(tokens[t++]) ?? null; }
    const type = tokens[t++];
    if (tokens[t] !== '{') return null;
    t++;
    const node = { type, fields: {} };
    while (t < tokens.length && tokens[t] !== '}') {
      const field = tokens[t++];
      if (field === 'ROUTE') { t += 3; continue; }
      node.fields[field] = parseValue();
    }
    t++;
    return node;
  };
  const parseValue = () => {
    const x = tokens[t];
    if (x === '[') {
      t++; const list = [];
      while (t < tokens.length && tokens[t] !== ']') {
        if (tokens[t] === 'DEF' || tokens[t] === 'USE' || (isName(tokens[t]) && tokens[t + 1] === '{')) list.push(parseNode());
        else { const v = tokens[t++]; list.push(Number.isFinite(Number(v)) ? Number(v) : v); }
      }
      t++; return list;
    }
    if (x === 'DEF' || x === 'USE' || (isName(x) && tokens[t + 1] === '{')) return parseNode();
    const out = [];
    while (t < tokens.length && Number.isFinite(Number(tokens[t]))) out.push(Number(tokens[t++]));
    if (out.length) return out.length === 1 ? out[0] : out;
    t++; return x;
  };
  const roots = [];
  while (t < tokens.length) { const start = t; const n = parseNode(); if (n) roots.push(n); if (t === start) t++; }
  // 3×4 matrices: [r00 r01 r02 tx, r10 … ty, r20 … tz].
  const mul = (A, B) => { const C = new Array(12).fill(0); for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 4 + c] += A[r * 4 + k] * B[k * 4 + c]; C[r * 4 + 3] = A[r * 4 + 3] + A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11]; } return C; };
  const apply = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];
  const translate = (v) => [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]];
  const rotate = ([ax, ay, az, an]) => { const l = Math.hypot(ax, ay, az) || 1; const x = ax / l; const y = ay / l; const z = az / l; const c = Math.cos(an); const s = Math.sin(an); const C = 1 - c; return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0, y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0, z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0]; };
  const scale = (v) => [v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0];
  const vec = (v, d) => (Array.isArray(v) && v.length >= 3 ? v : d);
  const all = [];
  const walk = (node, M, name) => {
    if (!node || typeof node !== 'object') return;
    let MM = M;
    if (node.type === 'Transform') {
      const T = vec(node.fields.translation, [0, 0, 0]); const Cn = vec(node.fields.center, [0, 0, 0]);
      const Rr = Array.isArray(node.fields.rotation) && node.fields.rotation.length === 4 ? node.fields.rotation : [0, 0, 1, 0];
      const S = vec(node.fields.scale, [1, 1, 1]);
      // T · C · R · S · −C (the VRML Transform, without scaleOrientation).
      MM = [translate(T), translate(Cn), rotate(Rr), scale(S), translate(Cn.map((v) => -v))].reduce(mul, M);
    }
    if (node.type === 'Shape') {
      const g = node.fields.geometry;
      if (g?.type === 'IndexedFaceSet') {
        const pts = g.fields.coord?.fields?.point ?? []; const idx = g.fields.coordIndex ?? [];
        const o = object(name ?? node.name ?? `shape${all.length + 1}`);
        for (let i = 0; i + 2 < pts.length; i += 3) { const p = apply(MM, [pts[i], pts[i + 1], pts[i + 2]]); o.verts.push(fromYUp(p[0], p[1], p[2])); }
        let face = [];
        for (const i of idx) { if (i < 0) { fan(o, face); face = []; } else face.push(i); }
        if (face.length) fan(o, face);
        if (o.tris.length) all.push(o);
      }
    }
    for (const c of node.fields.children ?? []) walk(c, MM, node.name ?? name);
  };
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  for (const r of roots) walk(r, ident, null);
  return all;
}

/** 3MF: the model's mesh objects (components and build-item transforms applied), in millimetres. */
export function read3mf(bytes) {
  const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const name = Object.keys(files).find((n) => /\.model$/i.test(n) && /^\/?3D\//i.test(n)) ?? Object.keys(files).find((n) => /\.model$/i.test(n));
  if (!name) throw Object.assign(new Error('no 3D model in the 3MF file'), { code: 'bad-file' });
  const xml = strFromU8(files[name]);
  const unit = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }[/<model[^>]*\bunit="([^"]+)"/.exec(xml)?.[1] ?? 'millimeter'] ?? 1;
  const objects = new Map();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = /\bid="(\d+)"/.exec(m[1])[1]; const oname = /\bname="([^"]*)"/.exec(m[1])?.[1] ?? `object${id}`;
    const verts = [...m[2].matchAll(/<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g)].map((v) => [Number(v[1]), Number(v[2]), Number(v[3])]);
    const tris = [...m[2].matchAll(/<triangle\b[^>]*\bv1="(\d+)"[^>]*\bv2="(\d+)"[^>]*\bv3="(\d+)"/g)].map((v) => [Number(v[1]), Number(v[2]), Number(v[3])]);
    const comps = [...m[2].matchAll(/<component\b([^>]*)\/?>/g)].map((c) => ({ id: /objectid="(\d+)"/.exec(c[1])[1], transform: /transform="([^"]+)"/.exec(c[1])?.[1] }));
    objects.set(id, { name: oname, verts, tris, comps });
  }
  const parse = (s) => { if (!s) return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; return s.trim().split(/\s+/).map(Number); };
  // 3MF matrices are row vectors: p' = p · M with M = [m00 m01 m02; m10 m11 m12; m20 m21 m22; m30 m31 m32].
  const ap = (M, p) => [p[0] * M[0] + p[1] * M[3] + p[2] * M[6] + M[9], p[0] * M[1] + p[1] * M[4] + p[2] * M[7] + M[10], p[0] * M[2] + p[1] * M[5] + p[2] * M[8] + M[11]];
  const cat = (A, B) => { const C = new Array(12).fill(0); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]; for (let c = 0; c < 3; c++) { C[9 + c] = B[9 + c]; for (let k = 0; k < 3; k++) C[9 + c] += A[9 + k] * B[k * 3 + c]; } return C; };
  const all = [];
  const emit = (id, M, depth = 0) => {
    const ob = objects.get(id); if (!ob || depth > 16) return;
    if (ob.tris.length) all.push({ name: ob.name, verts: ob.verts.map((p) => ap(M, p).map((v) => v * unit)), tris: ob.tris.map((tr) => tr.slice()) });
    for (const c of ob.comps) emit(c.id, cat(parse(c.transform), M), depth + 1);
  };
  const items = [...xml.matchAll(/<item\b([^>]*)\/?>/g)];
  if (items.length) for (const it of items) emit(/objectid="(\d+)"/.exec(it[1])[1], parse(/transform="([^"]+)"/.exec(it[1])?.[1]));
  else for (const id of objects.keys()) emit(id, parse(null));
  return all;
}

/** The mesh objects of a file by its extension (obj, ply, gltf, glb, wrl, vrml, 3mf). */
export function readMeshFile(name, data) {
  const ext = String(name).toLowerCase().split('.').pop();
  const bytes = typeof data === 'string' ? enc(data) : (data instanceof Uint8Array ? data : new Uint8Array(data));
  switch (ext) {
    case 'obj': return readObj(dec(bytes));
    case 'ply': return readPly(bytes);
    case 'gltf': case 'glb': return readGltf(bytes);
    case 'wrl': case 'vrml': return readVrml(dec(bytes));
    case '3mf': return read3mf(bytes);
    default: throw Object.assign(new Error(`unknown mesh format .${ext}`), { code: 'bad-file' });
  }
}

/** The extensions readMeshFile reads. */
export const MESH_IMPORT_EXTENSIONS = ['obj', 'ply', 'gltf', 'glb', 'wrl', 'vrml', '3mf'];
