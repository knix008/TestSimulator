// Geometry file formats: OBJ, STL (ASCII and binary), PLY (ASCII), glTF 2.0 binary (GLB), and SVG path outlines.
// `objects` for export are { name, mesh (world-space vertices), material? }. Import returns the same shape.
import { Matrix4, Quaternion, Vector3 } from 'three';
import { createMesh, faceNormal, toTriangles, triangulateFace, v3 } from './mesh.js';

// ─────────────── OBJ

export function exportOBJ(objects) {
  const lines = ['# My3DBlender OBJ'];
  let base = 1;
  let uvBase = 1;
  for (const { name, mesh } of objects) {
    lines.push(`o ${name}`);
    for (const v of mesh.verts) lines.push(`v ${v[0]} ${v[1]} ${v[2]}`);
    const hasUv = mesh.uvs?.some(Boolean);
    if (hasUv) for (const face of mesh.uvs) for (const uv of face ?? []) lines.push(`vt ${uv[0]} ${uv[1]}`);
    lines.push(mesh.smooth ? 's 1' : 's off');
    let uvIndex = uvBase;
    mesh.faces.forEach((face, f) => {
      const uv = mesh.uvs?.[f];
      lines.push(`f ${face.map((i, k) => (uv ? `${i + base}/${uvIndex + k}` : `${i + base}`)).join(' ')}`);
      if (uv) uvIndex += uv.length;
    });
    for (const [a, b] of mesh.loose ?? []) lines.push(`l ${a + base} ${b + base}`);
    base += mesh.verts.length;
    uvBase = uvIndex;
  }
  return lines.join('\n') + '\n';
}

export function importOBJ(text) {
  const objects = [];
  const allV = [];
  const allT = [];
  let cur = null;
  let map = null;
  const begin = (name) => {
    cur = { name, mesh: createMesh() };
    cur.mesh.uvs = [];
    map = new Map();
    objects.push(cur);
  };
  const vertexOf = (raw) => {
    const n = Number(raw);
    const i = n < 0 ? allV.length + n : n - 1;
    if (!map.has(i)) {
      map.set(i, cur.mesh.verts.length);
      cur.mesh.verts.push([...(allV[i] ?? [0, 0, 0])]);
    }
    return map.get(i);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [kind, ...rest] = line.split(/\s+/);
    if (kind === 'v') allV.push(rest.slice(0, 3).map(Number));
    else if (kind === 'vt') allT.push(rest.slice(0, 2).map(Number));
    else if (kind === 'o' || kind === 'g') { if (!cur || cur.mesh.verts.length) begin(rest.join(' ') || 'Object'); else cur.name = rest.join(' ') || cur.name; }
    else if (kind === 's') { if (!cur) begin('Object'); cur.mesh.smooth = rest[0] !== 'off' && rest[0] !== '0'; }
    else if (kind === 'f') {
      if (!cur) begin('Object');
      const parts = rest.map((p) => p.split('/'));
      if (parts.length < 3) continue;
      cur.mesh.faces.push(parts.map((p) => vertexOf(p[0])));
      const uv = parts.every((p) => p[1]) ? parts.map((p) => { const n = Number(p[1]); return [...(allT[n < 0 ? allT.length + n : n - 1] ?? [0, 0])]; }) : null;
      cur.mesh.uvs.push(uv);
    } else if (kind === 'l') {
      if (!cur) begin('Object');
      const ids = rest.map((p) => vertexOf(p.split('/')[0]));
      for (let i = 0; i < ids.length - 1; i++) cur.mesh.loose.push([ids[i], ids[i + 1]]);
    }
  }
  for (const o of objects) if (!o.mesh.uvs.some(Boolean)) o.mesh.uvs = null;
  return objects.filter((o) => o.mesh.verts.length);
}

// ─────────────── STL

export function exportSTLBinary(objects) {
  const tris = [];
  for (const { mesh } of objects) for (const face of mesh.faces) {
    const n = faceNormal(mesh, face);
    for (const t of triangulateFace(mesh, face)) tris.push([n, mesh.verts[face[t[0]]], mesh.verts[face[t[1]]], mesh.verts[face[t[2]]]]);
  }
  const buffer = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('My3DBlender STL'), 0);
  view.setUint32(80, tris.length, true);
  let o = 84;
  for (const tri of tris) {
    for (const v of tri) { view.setFloat32(o, v[0], true); view.setFloat32(o + 4, v[1], true); view.setFloat32(o + 8, v[2], true); o += 12; }
    o += 2;
  }
  return new Uint8Array(buffer);
}

export function exportSTLAscii(objects) {
  const out = ['solid My3DBlender'];
  for (const { mesh } of objects) for (const face of mesh.faces) {
    const n = faceNormal(mesh, face);
    for (const t of triangulateFace(mesh, face)) {
      out.push(`facet normal ${n[0]} ${n[1]} ${n[2]}`, 'outer loop');
      for (const c of t) { const v = mesh.verts[face[c]]; out.push(`vertex ${v[0]} ${v[1]} ${v[2]}`); }
      out.push('endloop', 'endfacet');
    }
  }
  out.push('endsolid My3DBlender');
  return out.join('\n') + '\n';
}

/** Reads ASCII or binary STL; identical corner positions are welded. */
export function importSTL(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mesh = createMesh();
  const known = new Map();
  const vert = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (!known.has(key)) { known.set(key, mesh.verts.length); mesh.verts.push([x, y, z]); }
    return known.get(key);
  };
  const count = data.length >= 84 ? view.getUint32(80, true) : 0;
  if (data.length === 84 + count * 50 && count > 0) {
    let o = 84;
    for (let t = 0; t < count; t++) {
      o += 12;
      const face = [];
      for (let k = 0; k < 3; k++) { face.push(vert(view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true))); o += 12; }
      o += 2;
      mesh.faces.push(face);
    }
  } else {
    const text = new TextDecoder().decode(data);
    let face = [];
    for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
      face.push(vert(Number(m[1]), Number(m[2]), Number(m[3])));
      if (face.length === 3) { mesh.faces.push(face); face = []; }
    }
  }
  return [{ name: 'STL', mesh }];
}

// ─────────────── PLY (ASCII)

export function exportPLY(objects) {
  const verts = [];
  const faces = [];
  let colors = true;
  for (const { mesh } of objects) {
    const base = verts.length;
    mesh.verts.forEach((v, i) => verts.push({ v, c: mesh.colors?.[i] }));
    if (!mesh.colors) colors = false;
    for (const f of mesh.faces) faces.push(f.map((i) => i + base));
  }
  const head = ['ply', 'format ascii 1.0', 'comment My3DBlender', `element vertex ${verts.length}`, 'property float x', 'property float y', 'property float z'];
  if (colors) head.push('property uchar red', 'property uchar green', 'property uchar blue');
  head.push(`element face ${faces.length}`, 'property list uchar int vertex_indices', 'end_header');
  const body = verts.map(({ v, c }) => `${v[0]} ${v[1]} ${v[2]}${colors ? ` ${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)}` : ''}`);
  for (const f of faces) body.push(`${f.length} ${f.join(' ')}`);
  return `${head.concat(body).join('\n')}\n`;
}

export function importPLY(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== 'ply') throw new Error('Not a PLY file');
  if (!lines.some((l) => l.startsWith('format ascii'))) throw new Error('Only ASCII PLY files can be read');
  let nv = 0;
  let nf = 0;
  const props = [];
  let current = null;
  let i = 1;
  for (; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts[0] === 'element') { current = parts[1]; if (current === 'vertex') nv = Number(parts[2]); else if (current === 'face') nf = Number(parts[2]); }
    else if (parts[0] === 'property' && current === 'vertex') props.push(parts.at(-1));
    else if (parts[0] === 'end_header') { i++; break; }
  }
  const mesh = createMesh();
  const [ix, iy, iz, ir, ig, ib] = ['x', 'y', 'z', 'red', 'green', 'blue'].map((n) => props.indexOf(n));
  if (ir >= 0) mesh.colors = [];
  for (let k = 0; k < nv; k++, i++) {
    const p = lines[i].trim().split(/\s+/).map(Number);
    mesh.verts.push([p[ix], p[iy], p[iz]]);
    if (mesh.colors) mesh.colors.push([p[ir] / 255, p[ig] / 255, p[ib] / 255]);
  }
  for (let k = 0; k < nf; k++, i++) {
    const p = lines[i].trim().split(/\s+/).map(Number);
    mesh.faces.push(p.slice(1, 1 + p[0]));
  }
  return [{ name: 'PLY', mesh }];
}

// ─────────────── glTF 2.0 binary (GLB). glTF is Y-up: Z-up scenes turn on the way out and back.

const zToY = (v) => [v[0], v[2], -v[1]];
const yToZ = (v) => [v[0], -v[2], v[1]];

export function exportGLB(objects) {
  const json = { asset: { version: '2.0', generator: 'My3DBlender' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], materials: [] };
  const chunks = [];
  let offset = 0;
  const push = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes);
    if (pad) chunks.push(new Uint8Array(pad));
    offset += bytes.length + pad;
    return json.bufferViews.length - 1;
  };
  objects.forEach(({ name, mesh, material }, index) => {
    const tri = toTriangles(mesh);
    const count = tri.positions.length / 3;
    const pos = new Float32Array(tri.positions.length);
    const nor = new Float32Array(tri.normals.length);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const p = zToY([tri.positions[i * 3], tri.positions[i * 3 + 1], tri.positions[i * 3 + 2]]);
      const n = zToY([tri.normals[i * 3], tri.normals[i * 3 + 1], tri.normals[i * 3 + 2]]);
      pos.set(p, i * 3);
      nor.set(n, i * 3);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    }
    const uv = new Float32Array(tri.uvs.length);
    for (let i = 0; i < tri.uvs.length; i += 2) { uv[i] = tri.uvs[i]; uv[i + 1] = 1 - tri.uvs[i + 1]; }
    const accessor = (view, type, extra = {}) => {
      json.accessors.push({ bufferView: view, componentType: 5126, count, type, ...extra });
      return json.accessors.length - 1;
    };
    const attributes = {
      POSITION: accessor(push(pos, 34962), 'VEC3', count ? { min, max } : {}),
      NORMAL: accessor(push(nor, 34962), 'VEC3'),
      TEXCOORD_0: accessor(push(uv, 34962), 'VEC2'),
    };
    const m = material ?? { baseColor: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5, emission: [0, 0, 0], name: 'Default' };
    json.materials.push({ name: m.name ?? `Material${index}`, pbrMetallicRoughness: { baseColorFactor: [...m.baseColor, m.alpha ?? 1], metallicFactor: m.metallic, roughnessFactor: m.roughness }, emissiveFactor: (m.emission ?? [0, 0, 0]).map((c) => Math.min(1, c)), doubleSided: false });
    json.meshes.push({ name, primitives: [{ attributes, material: json.materials.length - 1 }] });
    json.nodes.push({ name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  });
  json.buffers = [{ byteLength: offset }];
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (text.length % 4)) % 4;
  const total = 12 + 8 + text.length + jsonPad + 8 + offset;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + text.length + jsonPad);
  let o = 20 + text.length + jsonPad;
  view.setUint32(o, offset, true);
  view.setUint32(o + 4, 0x004e4942, true);
  o += 8;
  for (const chunk of chunks) { out.set(chunk, o); o += chunk.length; }
  return out;
}

export function importGLB(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = (index) => {
    const a = json.accessors[index];
    const bv = json.bufferViews[a.bufferView];
    const start = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = a.count * comps[a.type];
    const stride = bv.byteStride;
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const out = new Array(n);
    const per = comps[a.type];
    for (let i = 0; i < a.count; i++) {
      const base = start + i * (stride ?? per * size);
      for (let k = 0; k < per; k++) {
        const o = base + k * size;
        out[i * per + k] = a.componentType === 5126 ? view.getFloat32(o, true) : a.componentType === 5125 ? view.getUint32(o, true) : a.componentType === 5123 ? view.getUint16(o, true) : view.getUint8(o);
      }
    }
    return out;
  };
  const objects = [];
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = new Matrix4().multiplyMatrices(parent, local);
    const mirrored = world.determinant() < 0;
    if (node.mesh != null) {
      const source = json.meshes[node.mesh];
      for (const prim of source.primitives) {
        const pos = read(prim.attributes.POSITION);
        const idx = prim.indices != null ? read(prim.indices) : pos.map((_, i) => i).filter((i) => i * 3 < pos.length);
        const mesh = createMesh();
        const p = new Vector3();
        for (let i = 0; i < pos.length; i += 3) { p.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(world); mesh.verts.push(yToZ([p.x, p.y, p.z])); }
        const uv = prim.attributes.TEXCOORD_0 != null ? read(prim.attributes.TEXCOORD_0) : null;
        if (uv) mesh.uvs = [];
        for (let i = 0; i + 2 < idx.length; i += 3) {
          const face = mirrored ? [idx[i], idx[i + 2], idx[i + 1]] : [idx[i], idx[i + 1], idx[i + 2]];
          mesh.faces.push(face);
          if (uv) mesh.uvs.push(face.map((k) => [uv[k * 2], 1 - uv[k * 2 + 1]]));
        }
        const m = prim.material != null ? json.materials?.[prim.material] : null;
        const pbr = m?.pbrMetallicRoughness;
        objects.push({ name: node.name ?? source.name ?? 'glTF', mesh, material: m ? { name: m.name ?? 'Material', baseColor: (pbr?.baseColorFactor ?? [0.8, 0.8, 0.8]).slice(0, 3), metallic: pbr?.metallicFactor ?? 1, roughness: pbr?.roughnessFactor ?? 1 } : null });
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const n of scene?.nodes ?? []) visit(n, new Matrix4());
  return objects;
}

// ─────────────── SVG (outlines as poly curves)

/** Paths with M/L/H/V/Z/C/Q commands, flattened to polylines in the XY plane (SVG's Y runs downward). */
export function importSVG(text, scale = 0.01) {
  const splines = [];
  for (const m of text.matchAll(/<path[^>]*\sd="([^"]+)"/g)) {
    const tokens = m[1].match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let i = 0;
    let [x, y] = [0, 0];
    let points = [];
    let cmd = '';
    const num = () => Number(tokens[i++]);
    const flush = (cyclic) => { if (points.length > 1) splines.push({ kind: 'POLY', cyclic, points: points.map(([px, py]) => [px * scale, -py * scale, 0]) }); points = []; };
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      switch (cmd.toUpperCase()) {
        case 'M': flush(false); x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); points.push([x, y]); cmd = rel ? 'l' : 'L'; break;
        case 'L': x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); points.push([x, y]); break;
        case 'H': x = num() + (rel ? x : 0); points.push([x, y]); break;
        case 'V': y = num() + (rel ? y : 0); points.push([x, y]); break;
        case 'C': {
          const [x1, y1, x2, y2, x3, y3] = [num() + (rel ? x : 0), num() + (rel ? y : 0), num() + (rel ? x : 0), num() + (rel ? y : 0), num() + (rel ? x : 0), num() + (rel ? y : 0)];
          for (let s = 1; s <= 12; s++) {
            const t = s / 12;
            const u = 1 - t;
            points.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
          }
          [x, y] = [x3, y3];
          break;
        }
        case 'Q': {
          const [x1, y1, x2, y2] = [num() + (rel ? x : 0), num() + (rel ? y : 0), num() + (rel ? x : 0), num() + (rel ? y : 0)];
          for (let s = 1; s <= 12; s++) {
            const t = s / 12;
            const u = 1 - t;
            points.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
          }
          [x, y] = [x2, y2];
          break;
        }
        case 'Z': flush(true); i += 0; cmd = ''; break;
        default: i++;
      }
    }
    flush(false);
  }
  return splines;
}

export { v3 };
