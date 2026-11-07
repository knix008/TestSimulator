// Interchange formats: FBX (binary and ASCII to read, binary to write), Collada (.dae) and USD text (.usda). Like io.js these
// speak { name, mesh (world-space vertices, Z up), material? }, so a file's own node transforms are baked into the vertices.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { createMesh } from './mesh.js';
import { inflateZlib } from './inflate.js';

const DEG = Math.PI / 180;
const bake = (verts, m) => { const p = new Vector3(); return verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(m); return [p.x, p.y, p.z]; }); };
const yUpToZUp = () => new Matrix4().makeRotationX(Math.PI / 2);

/** Faces of flat [count…] / [index…] lists, with per-corner UVs when given. */
function polygons(verts, counts, indices, cornerUvs = null) {
  const mesh = createMesh(verts, []);
  if (cornerUvs) mesh.uvs = [];
  let at = 0;
  for (const count of counts) {
    if (count >= 3) {
      mesh.faces.push(indices.slice(at, at + count));
      if (cornerUvs) mesh.uvs.push(cornerUvs.slice(at, at + count));
    }
    at += count;
  }
  return mesh;
}

// ─────────────── FBX reading

const FBX_MAGIC = 'Kaydara FBX Binary  ';

/** A parsed FBX node: { name, props: [values], children: [nodes] }. */
function readFbxBinary(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(23, true);
  const wide = version >= 7500;
  const decoder = new TextDecoder();
  const readArray = (o, kind) => {
    const length = view.getUint32(o, true);
    const encoding = view.getUint32(o + 4, true);
    const size = view.getUint32(o + 8, true);
    const unit = { f: 4, d: 8, l: 8, i: 4, b: 1, c: 1 }[kind];
    let data = bytes.subarray(o + 12, o + 12 + size);
    if (encoding === 1) data = inflateZlib(data, length * unit);
    const copy = data.slice();
    const v = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const out = new Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = kind === 'f' ? v.getFloat32(i * 4, true) : kind === 'd' ? v.getFloat64(i * 8, true) : kind === 'l' ? Number(v.getBigInt64(i * 8, true)) : kind === 'i' ? v.getInt32(i * 4, true) : v.getUint8(i);
    }
    return { value: out, next: o + 12 + size };
  };
  const readProp = (o) => {
    const type = String.fromCharCode(bytes[o]);
    o++;
    switch (type) {
      case 'Y': return { value: view.getInt16(o, true), next: o + 2 };
      case 'C': return { value: bytes[o] !== 0, next: o + 1 };
      case 'I': return { value: view.getInt32(o, true), next: o + 4 };
      case 'F': return { value: view.getFloat32(o, true), next: o + 4 };
      case 'D': return { value: view.getFloat64(o, true), next: o + 8 };
      case 'L': return { value: Number(view.getBigInt64(o, true)), next: o + 8 };
      case 'S': case 'R': {
        const n = view.getUint32(o, true);
        const data = bytes.subarray(o + 4, o + 4 + n);
        return { value: type === 'S' ? decoder.decode(data) : data, next: o + 4 + n };
      }
      case 'f': case 'd': case 'l': case 'i': case 'b': case 'c': return readArray(o, type);
      default: throw new Error(`Unknown FBX property type "${type}"`);
    }
  };
  const readNode = (start) => {
    const end = wide ? Number(view.getBigUint64(start, true)) : view.getUint32(start, true);
    const count = wide ? Number(view.getBigUint64(start + 8, true)) : view.getUint32(start + 4, true);
    const nameLen = bytes[start + (wide ? 24 : 12)];
    if (end === 0) return null;
    let o = start + (wide ? 25 : 13);
    const name = decoder.decode(bytes.subarray(o, o + nameLen));
    o += nameLen;
    const props = [];
    for (let i = 0; i < count; i++) { const p = readProp(o); props.push(p.value); o = p.next; }
    const children = [];
    while (o < end) {
      const child = readNode(o);
      if (!child) break;
      children.push(child.node);
      o = child.next;
    }
    return { node: { name, props, children }, next: end };
  };
  const root = [];
  let o = 27;
  while (o < bytes.length - 13) {
    const item = readNode(o);
    if (!item) break;
    root.push(item.node);
    o = item.next;
  }
  return root;
}

function readFbxAscii(text) {
  let i = 0;
  const n = text.length;
  const space = () => {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] === ';') { while (i < n && text[i] !== '\n') i++; continue; }
      return;
    }
  };
  const value = () => {
    space();
    if (text[i] === '"') {
      const start = ++i;
      while (i < n && text[i] !== '"') i++;
      return text.slice(start, i++);
    }
    const start = i;
    while (i < n && !/[\s,{}]/.test(text[i])) i++;
    const raw = text.slice(start, i);
    const number = Number(raw);
    return raw !== '' && !Number.isNaN(number) ? number : raw;
  };
  const block = () => {
    const nodes = [];
    for (;;) {
      space();
      if (i >= n) return nodes;
      if (text[i] === '}') { i++; return nodes; }
      const start = i;
      while (i < n && text[i] !== ':' && text[i] !== '{' && text[i] !== '}') i++;
      const name = text.slice(start, i).trim();
      if (text[i] !== ':') return nodes;
      i++;
      const node = { name, props: [], children: [] };
      // Values up to the end of the line (a list may continue after a comma) or an opening brace.
      for (;;) {
        while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r')) i++;
        if (text[i] === '\n' || i >= n || text[i] === '}') break;
        if (text[i] === '{') { i++; node.children = block(); break; }
        if (text[i] === ',') { i++; space(); continue; }
        if (text[i] === '*') { i++; value(); space(); if (text[i] === '{') { i++; const inner = block(); node.props = [inner.find((c) => c.name === 'a')?.props ?? []]; } break; }
        node.props.push(value());
      }
      nodes.push(node);
    }
  };
  return block();
}

const childOf = (node, name) => node?.children.find((c) => c.name === name) ?? null;
const childrenOf = (node, name) => node?.children.filter((c) => c.name === name) ?? [];

/** Reads meshes and base colours from an FBX file (binary 6.x to 7.x, or ASCII). */
export function importFBX(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const binary = new TextDecoder().decode(data.subarray(0, 20)) === FBX_MAGIC;
  const root = binary ? readFbxBinary(data) : readFbxAscii(new TextDecoder().decode(data));
  const objects = root.find((n) => n.name === 'Objects');
  if (!objects) throw new Error('No Objects section in this FBX file');
  const settings = childOf(root.find((n) => n.name === 'GlobalSettings'), 'Properties70') ?? childOf(root.find((n) => n.name === 'GlobalSettings'), 'Properties60');
  const prop = (holder, name) => (holder?.children ?? []).find((p) => p.props[0] === name)?.props.slice(4) ?? null;
  const unit = (prop(settings, 'UnitScaleFactor')?.[0] ?? 1) / 100;
  const upAxis = prop(settings, 'UpAxis')?.[0] ?? 1;

  // Ids are the first property in 7.x. Parents come from the Connections section.
  const byId = new Map();
  for (const node of objects.children) byId.set(node.props[0], node);
  const parents = new Map();
  const childrenByParent = new Map();
  for (const c of childrenOf(root.find((n) => n.name === 'Connections'), 'C')) {
    if (c.props[0] !== 'OO' && c.props[0] !== 'OP') continue;
    const [, child, parent] = c.props;
    if (!parents.has(child)) parents.set(child, []);
    parents.get(child).push(parent);
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(child);
  }
  const cleanName = (raw, fallback) => String(raw ?? fallback).split(/\0|\u0001|::/).filter(Boolean).find((x) => !['Model', 'Geometry', 'Material'].includes(x)) ?? fallback;

  const localMatrix = (model) => {
    const p = childOf(model, 'Properties70');
    const t = prop(p, 'Lcl Translation') ?? [0, 0, 0];
    const r = prop(p, 'Lcl Rotation') ?? [0, 0, 0];
    const s = prop(p, 'Lcl Scaling') ?? [1, 1, 1];
    const pre = prop(p, 'PreRotation') ?? [0, 0, 0];
    const post = prop(p, 'PostRotation') ?? [0, 0, 0];
    // FBX Euler XYZ applies X first: three.js spells that 'ZYX'.
    const q = (a) => new Quaternion().setFromEuler(new Euler(a[0] * DEG, a[1] * DEG, a[2] * DEG, 'ZYX'));
    const rotation = q(pre).multiply(q(r)).multiply(q(post).invert());
    return new Matrix4().compose(new Vector3(t[0], t[1], t[2]), rotation, new Vector3(s[0], s[1], s[2]));
  };
  const worldOf = (id) => {
    const model = byId.get(id);
    const local = model?.name === 'Model' ? localMatrix(model) : new Matrix4();
    const parent = (parents.get(id) ?? []).find((x) => byId.get(x)?.name === 'Model');
    return parent != null ? worldOf(parent).multiply(local) : local;
  };

  const readGeometry = (geo) => {
    const raw = childOf(geo, 'Vertices')?.props[0];
    const index = childOf(geo, 'PolygonVertexIndex')?.props[0];
    if (!raw || !index) return null;
    const verts = [];
    for (let i = 0; i + 2 < raw.length; i += 3) verts.push([raw[i], raw[i + 1], raw[i + 2]]);
    const counts = [];
    const flat = [];
    let run = 0;
    for (const x of index) {
      run++;
      flat.push(x < 0 ? -x - 1 : x);
      if (x < 0) { counts.push(run); run = 0; }
    }
    let cornerUvs = null;
    const layer = childOf(geo, 'LayerElementUV');
    if (layer) {
      const uv = childOf(layer, 'UV')?.props[0] ?? [];
      const uvIndex = childOf(layer, 'UVIndex')?.props[0] ?? null;
      const mapping = childOf(layer, 'MappingInformationType')?.props[0];
      const reference = childOf(layer, 'ReferenceInformationType')?.props[0];
      const at = (k) => { const j = reference === 'Direct' || !uvIndex ? k : uvIndex[k]; return j < 0 ? [0, 0] : [uv[j * 2] ?? 0, uv[j * 2 + 1] ?? 0]; };
      if (mapping === 'ByPolygonVertex') cornerUvs = flat.map((_, k) => at(k));
      else if (mapping === 'ByVertice' || mapping === 'ByVertex') cornerUvs = flat.map((v) => at(v));
    }
    const mesh = polygons(verts, counts, flat, cornerUvs);
    const matLayer = childOf(geo, 'LayerElementMaterial');
    const smoothing = childOf(geo, 'LayerElementSmoothing');
    if (smoothing) mesh.smooth = true;
    const faceMaterials = matLayer && childOf(matLayer, 'MappingInformationType')?.props[0] === 'ByPolygon' ? childOf(matLayer, 'Materials')?.props[0] : null;
    return { mesh, faceMaterials };
  };

  const toZUp = upAxis === 1 ? yUpToZUp() : new Matrix4();
  const units = new Matrix4().makeScale(unit, unit, unit);
  const out = [];
  for (const geo of objects.children) {
    if (geo.name !== 'Geometry' || (geo.props[2] && geo.props[2] !== 'Mesh')) continue;
    const parsed = readGeometry(geo);
    if (!parsed) continue;
    const owners = (parents.get(geo.props[0]) ?? []).filter((id) => byId.get(id)?.name === 'Model');
    for (const owner of owners.length ? owners : [null]) {
      const model = owner != null ? byId.get(owner) : null;
      const m = new Matrix4().copy(toZUp).multiply(units);
      if (owner != null) m.multiply(worldOf(owner));
      const mesh = owners.length > 1 ? structuredClone(parsed.mesh) : parsed.mesh;
      mesh.verts = bake(mesh.verts, m);
      // A mirrored transform turns the faces inside out.
      if (m.determinant() < 0) { mesh.faces = mesh.faces.map((f) => [...f].reverse()); if (mesh.uvs) mesh.uvs = mesh.uvs.map((u) => u && [...u].reverse()); }
      const materialNode = owner != null ? (childrenByParent.get(owner) ?? []).map((id) => byId.get(id)).find((x) => x?.name === 'Material') : null;
      const props = childOf(materialNode, 'Properties70');
      const diffuse = prop(props, 'DiffuseColor') ?? prop(props, 'Diffuse');
      const material = materialNode ? { name: cleanName(materialNode.props[1], 'Material'), baseColor: (diffuse ?? [0.8, 0.8, 0.8]).slice(0, 3), metallic: 0, roughness: 0.5 } : null;
      out.push({ name: cleanName(model?.props[1] ?? geo.props[1], 'FBX'), mesh, material });
    }
  }
  return out;
}

// ─────────────── FBX writing (binary 7.4: what other programs read most reliably; their importers often refuse ASCII)

class FbxWriter {
  constructor() { this.chunks = []; this.size = 0; }

  raw(bytes) { this.chunks.push(bytes); this.size += bytes.length; }

  static encodeProp(p) {
    const enc = new TextEncoder();
    const pack = (type, length, write) => { const out = new Uint8Array(1 + length); out[0] = type.charCodeAt(0); write(new DataView(out.buffer), out); return out; };
    if (typeof p === 'string') { const b = enc.encode(p); return pack('S', 4 + b.length, (v, o) => { v.setUint32(1, b.length, true); o.set(b, 5); }); }
    if (p.kind === 'I') return pack('I', 4, (v) => v.setInt32(1, p.value, true));
    if (p.kind === 'L') return pack('L', 8, (v) => v.setBigInt64(1, BigInt(p.value), true));
    if (p.kind === 'D') return pack('D', 8, (v) => v.setFloat64(1, p.value, true));
    if (p.kind === 'i') return pack('i', 12 + p.value.length * 4, (v) => { v.setUint32(1, p.value.length, true); v.setUint32(5, 0, true); v.setUint32(9, p.value.length * 4, true); p.value.forEach((x, k) => v.setInt32(13 + k * 4, x, true)); });
    if (p.kind === 'd') return pack('d', 12 + p.value.length * 8, (v) => { v.setUint32(1, p.value.length, true); v.setUint32(5, 0, true); v.setUint32(9, p.value.length * 8, true); p.value.forEach((x, k) => v.setFloat64(13 + k * 8, x, true)); });
    throw new Error('Bad FBX property');
  }

  node(name, props = [], children = null) {
    const nameBytes = new TextEncoder().encode(name);
    const parts = props.map(FbxWriter.encodeProp);
    const propLen = parts.reduce((s, x) => s + x.length, 0);
    const head = new Uint8Array(13 + nameBytes.length);
    const view = new DataView(head.buffer);
    this.raw(head);
    view.setUint32(4, props.length, true);
    view.setUint32(8, propLen, true);
    head[12] = nameBytes.length;
    head.set(nameBytes, 13);
    for (const part of parts) this.raw(part);
    if (children) {
      children();
      this.raw(new Uint8Array(13));
    }
    view.setUint32(0, this.size + FbxWriter.START, true);
  }
}
FbxWriter.START = 27;

const I = (value) => ({ kind: 'I', value });
const L = (value) => ({ kind: 'L', value });
const D = (value) => ({ kind: 'D', value });

export function exportFBX(objects) {
  const w = new FbxWriter();
  const p70 = (entries) => w.node('Properties70', [], () => { for (const e of entries) w.node('P', e); });
  w.node('FBXHeaderExtension', [], () => {
    w.node('FBXHeaderVersion', [I(1003)]);
    w.node('FBXVersion', [I(7400)]);
    w.node('Creator', ['My3DBlender']);
  });
  w.node('GlobalSettings', [], () => {
    w.node('Version', [I(1000)]);
    p70([
      ['UpAxis', 'int', 'Integer', '', I(2)], ['UpAxisSign', 'int', 'Integer', '', I(1)],
      ['FrontAxis', 'int', 'Integer', '', I(1)], ['FrontAxisSign', 'int', 'Integer', '', I(-1)],
      ['CoordAxis', 'int', 'Integer', '', I(0)], ['CoordAxisSign', 'int', 'Integer', '', I(1)],
      // One unit here is a metre: 100 FBX centimetres.
      ['UnitScaleFactor', 'double', 'Number', '', D(100)],
    ]);
  });
  let nextId = 100000;
  const links = [];
  const materials = new Map();
  const groups = objects.map(({ name, mesh, material }) => ({ name, mesh, material, geometry: nextId++, model: nextId++ }));
  const materialList = [];
  for (const g of groups) {
    if (!g.material) continue;
    const key = g.material.name ?? 'Material';
    if (!materials.has(key)) { materials.set(key, nextId++); materialList.push({ id: materials.get(key), name: key, color: g.material.baseColor }); }
    links.push([materials.get(key), g.model]);
  }
  w.node('Definitions', [], () => {
    w.node('Version', [I(100)]);
    w.node('Count', [I(groups.length * 2 + materialList.length)]);
    for (const [type, count] of [['Geometry', groups.length], ['Model', groups.length], ['Material', materialList.length]]) w.node('ObjectType', [type], () => { w.node('Count', [I(count)]); });
  });
  w.node('Objects', [], () => {
    for (const g of groups) {
      const { mesh } = g;
      w.node('Geometry', [L(g.geometry), `${g.name}\0\u0001Geometry`, 'Mesh'], () => {
        w.node('GeometryVersion', [I(124)]);
        w.node('Vertices', [{ kind: 'd', value: mesh.verts.flat() }]);
        w.node('PolygonVertexIndex', [{ kind: 'i', value: mesh.faces.flatMap((f) => f.map((v, k) => (k === f.length - 1 ? -v - 1 : v))) }]);
        if (mesh.uvs?.some(Boolean)) {
          w.node('LayerElementUV', [I(0)], () => {
            w.node('Version', [I(101)]);
            w.node('Name', ['UVMap']);
            w.node('MappingInformationType', ['ByPolygonVertex']);
            w.node('ReferenceInformationType', ['Direct']);
            w.node('UV', [{ kind: 'd', value: mesh.faces.flatMap((f, i) => f.flatMap((_, k) => mesh.uvs[i]?.[k] ?? [0, 0])) }]);
          });
        }
        w.node('Layer', [I(0)], () => {
          w.node('Version', [I(100)]);
          if (mesh.uvs?.some(Boolean)) w.node('LayerElement', [], () => { w.node('Type', ['LayerElementUV']); w.node('TypedIndex', [I(0)]); });
        });
      });
      w.node('Model', [L(g.model), `${g.name}\0\u0001Model`, 'Mesh'], () => {
        w.node('Version', [I(232)]);
        p70([['Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)]]);
      });
      links.push([g.geometry, g.model]);
    }
    for (const m of materialList) {
      w.node('Material', [L(m.id), `${m.name}\0\u0001Material`, ''], () => {
        w.node('ShadingModel', ['lambert']);
        p70([['DiffuseColor', 'Color', '', 'A', D(m.color[0]), D(m.color[1]), D(m.color[2])]]);
      });
    }
  });
  w.node('Connections', [], () => {
    for (const g of groups) w.node('C', ['OO', L(g.model), L(0)]);
    for (const [child, parent] of links) w.node('C', ['OO', L(child), L(parent)]);
  });
  w.raw(new Uint8Array(13));
  const head = new Uint8Array(27);
  head.set(new TextEncoder().encode(FBX_MAGIC), 0);
  head[20] = 0; head[21] = 0x1a; head[22] = 0;
  new DataView(head.buffer).setUint32(23, 7400, true);
  const footer = new Uint8Array(16 + 16);
  footer.set([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e], 0);
  const out = new Uint8Array(27 + w.size + footer.length);
  out.set(head, 0);
  let o = 27;
  for (const c of w.chunks) { out.set(c, o); o += c.length; }
  out.set(footer, o);
  return out;
}

// ─────────────── a small XML reader (for Collada: no DOM in the core)

export function parseXML(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const entity = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<', i);
    if (open < 0) break;
    if (open > i) stack.at(-1).text += text.slice(i, open);
    if (text.startsWith('<!--', open)) { i = text.indexOf('-->', open) + 3; if (i < 3) break; continue; }
    if (text.startsWith('<![CDATA[', open)) { const end = text.indexOf(']]>', open); stack.at(-1).text += text.slice(open + 9, end); i = end + 3; continue; }
    if (text[open + 1] === '?' || text[open + 1] === '!') { i = text.indexOf('>', open) + 1; if (!i) break; continue; }
    const close = text.indexOf('>', open);
    if (close < 0) break;
    if (text[open + 1] === '/') {
      if (stack.length > 1) stack.pop();
      i = close + 1;
      continue;
    }
    const selfClosing = text[close - 1] === '/';
    const inner = text.slice(open + 1, selfClosing ? close - 1 : close);
    const name = inner.match(/^[^\s/>]+/)[0];
    const node = { name, attrs: {}, children: [], text: '' };
    for (const m of inner.slice(name.length).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[m[1]] = entity(m[3] ?? m[4] ?? '');
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
    i = close + 1;
  }
  return root;
}
const xmlFind = (node, name) => node?.children.find((c) => c.name === name) ?? null;
const xmlAll = (node, name) => node?.children.filter((c) => c.name === name) ?? [];
const numbers = (text) => (text.trim() ? text.trim().split(/\s+/).map(Number) : []);
const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─────────────── Collada

function daeGeometry(geometry) {
  const mesh = xmlFind(geometry, 'mesh');
  if (!mesh) return null;
  const sources = new Map();
  for (const s of xmlAll(mesh, 'source')) {
    const array = xmlFind(s, 'float_array');
    const accessor = xmlFind(xmlFind(s, 'technique_common'), 'accessor');
    if (array) sources.set(s.attrs.id, { data: numbers(array.text), stride: Number(accessor?.attrs.stride ?? 3) });
  }
  const vertices = xmlFind(mesh, 'vertices');
  const positionsOf = (id) => {
    if (vertices?.attrs.id === id) {
      const input = xmlAll(vertices, 'input').find((x) => x.attrs.semantic === 'POSITION');
      return sources.get(input?.attrs.source?.slice(1));
    }
    return sources.get(id);
  };
  let positions = null;
  const counts = [];
  const flat = [];
  const uv = [];
  let hasUv = false;
  for (const prim of mesh.children) {
    if (!['triangles', 'polylist', 'polygons'].includes(prim.name)) continue;
    const inputs = xmlAll(prim, 'input');
    const stride = Math.max(...inputs.map((x) => Number(x.attrs.offset ?? 0))) + 1;
    const vertex = inputs.find((x) => x.attrs.semantic === 'VERTEX');
    const texcoord = inputs.find((x) => x.attrs.semantic === 'TEXCOORD');
    if (!vertex) continue;
    positions = positionsOf(vertex.attrs.source.slice(1));
    const uvSource = texcoord ? sources.get(texcoord.attrs.source.slice(1)) : null;
    const [vOff, tOff] = [Number(vertex.attrs.offset ?? 0), Number(texcoord?.attrs.offset ?? 0)];
    const emit = (p, n, at) => {
      counts.push(n);
      for (let k = 0; k < n; k++) {
        const base = (at + k) * stride;
        flat.push(p[base + vOff]);
        if (uvSource) { hasUv = true; const j = p[base + tOff]; uv.push([uvSource.data[j * uvSource.stride], uvSource.data[j * uvSource.stride + 1]]); } else uv.push([0, 0]);
      }
    };
    if (prim.name === 'polygons') {
      for (const ptag of xmlAll(prim, 'p')) { const p = numbers(ptag.text); emit(p, p.length / stride, 0); }
    } else {
      const p = numbers(xmlFind(prim, 'p')?.text ?? '');
      const vc = prim.name === 'polylist' ? numbers(xmlFind(prim, 'vcount')?.text ?? '') : Array(Math.floor(p.length / stride / 3)).fill(3);
      let at = 0;
      for (const n of vc) { emit(p, n, at); at += n; }
    }
  }
  if (!positions) return null;
  const verts = [];
  for (let i = 0; i + 2 < positions.data.length; i += positions.stride) verts.push([positions.data[i], positions.data[i + 1], positions.data[i + 2]]);
  return polygons(verts, counts, flat, hasUv ? uv : null);
}

function daeNodeMatrix(node) {
  const m = new Matrix4();
  for (const c of node.children) {
    if (c.name === 'matrix') { const n = numbers(c.text); m.multiply(new Matrix4().set(...n)); }
    else if (c.name === 'translate') { const n = numbers(c.text); m.multiply(new Matrix4().makeTranslation(n[0], n[1], n[2])); }
    else if (c.name === 'scale') { const n = numbers(c.text); m.multiply(new Matrix4().makeScale(n[0], n[1], n[2])); }
    else if (c.name === 'rotate') { const n = numbers(c.text); m.multiply(new Matrix4().makeRotationAxis(new Vector3(n[0], n[1], n[2]).normalize(), n[3] * DEG)); }
  }
  return m;
}

export function importDAE(text) {
  const doc = xmlFind(parseXML(text), 'COLLADA');
  if (!doc) throw new Error('Not a Collada file');
  const asset = xmlFind(doc, 'asset');
  const up = xmlFind(asset, 'up_axis')?.text.trim() ?? 'Y_UP';
  const meter = Number(xmlFind(asset, 'unit')?.attrs.meter ?? 1);
  const root = new Matrix4().makeScale(meter, meter, meter);
  if (up === 'Y_UP') root.premultiply(yUpToZUp());
  else if (up === 'X_UP') root.premultiply(new Matrix4().makeRotationY(-Math.PI / 2));
  const geometries = new Map(xmlAll(xmlFind(doc, 'library_geometries'), 'geometry').map((g) => [g.attrs.id, g]));
  const effects = new Map(xmlAll(xmlFind(doc, 'library_effects'), 'effect').map((e) => [e.attrs.id, e]));
  const materialsById = new Map(xmlAll(xmlFind(doc, 'library_materials'), 'material').map((x) => [x.attrs.id, x]));
  const materialOf = (instance) => {
    const bind = xmlFind(xmlFind(xmlFind(instance, 'bind_material'), 'technique_common'), 'instance_material');
    const mat = bind && materialsById.get(bind.attrs.target?.slice(1));
    if (!mat) return null;
    const effect = effects.get(xmlFind(mat, 'instance_effect')?.attrs.url?.slice(1));
    const find = (node) => { if (node.name === 'diffuse') return node; for (const c of node.children) { const r = find(c); if (r) return r; } return null; };
    const color = effect && find(effect);
    const value = color && xmlFind(color, 'color');
    return { name: mat.attrs.name ?? mat.attrs.id, baseColor: value ? numbers(value.text).slice(0, 3) : [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5 };
  };
  const out = [];
  const visit = (node, parent) => {
    const world = new Matrix4().copy(parent).multiply(daeNodeMatrix(node));
    for (const inst of xmlAll(node, 'instance_geometry')) {
      const source = geometries.get(inst.attrs.url?.slice(1));
      const mesh = source && daeGeometry(source);
      if (!mesh) continue;
      mesh.verts = bake(mesh.verts, world);
      if (world.determinant() < 0) { mesh.faces = mesh.faces.map((f) => [...f].reverse()); if (mesh.uvs) mesh.uvs = mesh.uvs.map((u) => u && [...u].reverse()); }
      out.push({ name: node.attrs.name ?? node.attrs.id ?? source.attrs.name ?? 'Collada', mesh, material: materialOf(inst) });
    }
    for (const c of xmlAll(node, 'node')) visit(c, world);
  };
  const sceneRef = xmlFind(xmlFind(doc, 'scene'), 'instance_visual_scene')?.attrs.url?.slice(1);
  const scenes = xmlAll(xmlFind(doc, 'library_visual_scenes'), 'visual_scene');
  const scene = scenes.find((s) => s.attrs.id === sceneRef) ?? scenes[0];
  for (const node of xmlAll(scene, 'node')) visit(node, root);
  return out;
}

export function exportDAE(objects) {
  const sane = (s) => String(s).replace(/[^\w.-]/g, '_');
  const unique = objects.map((o, i) => ({ ...o, id: `${sane(o.name)}_${i}` }));
  const geometry = unique.map(({ id, name, mesh }) => {
    const hasUv = mesh.uvs?.some(Boolean);
    const uv = hasUv ? mesh.faces.flatMap((f, i) => f.map((_, k) => mesh.uvs[i]?.[k] ?? [0, 0])) : [];
    let corner = 0;
    const p = mesh.faces.flatMap((f) => f.flatMap((v) => (hasUv ? [v, corner++] : [v])));
    return `<geometry id="${id}-mesh" name="${xmlEscape(name)}"><mesh>
<source id="${id}-pos"><float_array id="${id}-pos-a" count="${mesh.verts.length * 3}">${mesh.verts.flat().join(' ')}</float_array><technique_common><accessor source="#${id}-pos-a" count="${mesh.verts.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
${hasUv ? `<source id="${id}-uv"><float_array id="${id}-uv-a" count="${uv.length * 2}">${uv.flat().join(' ')}</float_array><technique_common><accessor source="#${id}-uv-a" count="${uv.length}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>` : ''}
<vertices id="${id}-v"><input semantic="POSITION" source="#${id}-pos"/></vertices>
<polylist count="${mesh.faces.length}" material="m${id}"><input semantic="VERTEX" source="#${id}-v" offset="0"/>${hasUv ? `<input semantic="TEXCOORD" source="#${id}-uv" offset="1" set="0"/>` : ''}<vcount>${mesh.faces.map((f) => f.length).join(' ')}</vcount><p>${p.join(' ')}</p></polylist>
</mesh></geometry>`;
  }).join('\n');
  const withMat = unique.filter((o) => o.material);
  const effects = withMat.map(({ id, material }) => `<effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${[...material.baseColor, 1].join(' ')}</color></diffuse></lambert></technique></profile_COMMON></effect>`).join('\n');
  const mats = withMat.map(({ id, material }) => `<material id="${id}-mat" name="${xmlEscape(material.name ?? 'Material')}"><instance_effect url="#${id}-fx"/></material>`).join('\n');
  const nodes = unique.map(({ id, name, material }) => `<node id="${id}" name="${xmlEscape(name)}"><instance_geometry url="#${id}-mesh">${material ? `<bind_material><technique_common><instance_material symbol="m${id}" target="#${id}-mat"/></technique_common></bind_material>` : ''}</instance_geometry></node>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>My3DBlender</authoring_tool></contributor><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
<library_effects>${effects}</library_effects>
<library_materials>${mats}</library_materials>
<library_geometries>${geometry}</library_geometries>
<library_visual_scenes><visual_scene id="Scene" name="Scene">${nodes}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>
`;
}

// ─────────────── USD text (.usda). Binary .usdc and .usdz archives are told apart and refused with a clear message.

export function exportUSDA(objects) {
  const prim = (s) => { const t = String(s).replace(/\W/g, '_'); return /^[a-zA-Z_]/.test(t) ? t : `_${t}`; };
  const taken = new Set();
  const lines = ['#usda 1.0', '(', '    defaultPrim = "Root"', '    metersPerUnit = 1', '    upAxis = "Z"', ')', '', 'def Xform "Root"', '{'];
  const fmt = (list) => list.map((v) => `(${v.join(', ')})`).join(', ');
  for (const { name, mesh, material } of objects) {
    let id = prim(name);
    for (let i = 1; taken.has(id); i++) id = `${prim(name)}_${i}`;
    taken.add(id);
    lines.push(`    def Mesh "${id}"`, '    {');
    lines.push(`        int[] faceVertexCounts = [${mesh.faces.map((f) => f.length).join(', ')}]`);
    lines.push(`        int[] faceVertexIndices = [${mesh.faces.flat().join(', ')}]`);
    lines.push(`        point3f[] points = [${fmt(mesh.verts)}]`);
    lines.push(`        uniform token subdivisionScheme = "none"`);
    if (mesh.uvs?.some(Boolean)) {
      lines.push(`        texCoord2f[] primvars:st = [${fmt(mesh.faces.flatMap((f, i) => f.map((_, k) => mesh.uvs[i]?.[k] ?? [0, 0])))}] (`, '            interpolation = "faceVarying"', '        )');
    }
    if (material) lines.push(`        color3f[] primvars:displayColor = [(${material.baseColor.join(', ')})] (`, '            interpolation = "constant"', '        )');
    lines.push('    }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** Tuples of a USD array: "(1, 2, 3), (4, 5, 6)" or "1, 2, 3". */
const usdArray = (text) => {
  const list = text.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?|\bnan\b|-?\binf\b/g) ?? [];
  return list.map(Number);
};

export function importUSDA(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  const head = new TextDecoder().decode(data.subarray(0, 8));
  if (head.startsWith('PXR-USDC')) throw new Error('This is a binary .usdc file. Only USD text (.usda) can be read for now: re-save it as .usda.');
  if (head.startsWith('PK')) throw new Error('This is a .usdz archive. Only USD text (.usda) can be read for now: unpack it, or re-save it as .usda.');
  if (!head.startsWith('#usda')) throw new Error('Not a USD text file');
  const text = new TextDecoder().decode(data);
  const headerEnd = text.indexOf('def ') >= 0 ? text.indexOf('def ') : 0;
  const header = text.slice(0, headerEnd);
  const up = /upAxis\s*=\s*"(\w)"/.exec(header)?.[1] ?? 'Y';
  const meters = Number(/metersPerUnit\s*=\s*([\d.eE+-]+)/.exec(header)?.[1] ?? 1);
  const root = new Matrix4().makeScale(meters, meters, meters);
  if (up === 'Y') root.premultiply(yUpToZUp());
  const out = [];

  // Prims nest in braces. Strings and brackets are skipped so that their contents cannot be mistaken for structure.
  let primCount = 0;
  const walk = (start, end, parent, level = 0, parentName = '', parentId = -1) => {
    const defRe = /\b(?:def|over|class)\s+(?:(\w+)\s+)?"([^"]+)"/g;
    defRe.lastIndex = start;
    let m;
    let cursor = start;
    while ((m = defRe.exec(text)) && m.index < end) {
      // A prim's metadata comes in parentheses before its body, and can hold braces of its own.
      let open = defRe.lastIndex;
      while (open < end && /\s/.test(text[open])) open++;
      if (text[open] === '(') {
        let round = 1;
        for (open++; open < end && round > 0; open++) {
          const c = text[open];
          if (c === '"') { open++; while (open < end && text[open] !== '"') open++; } else if (c === '(') round++; else if (c === ')') round--;
        }
        while (open < end && /\s/.test(text[open])) open++;
      }
      if (text[open] !== '{') continue;
      defRe.lastIndex = open + 1;
      let depth = 1;
      let i = defRe.lastIndex;
      for (; i < end && depth > 0; i++) {
        const c = text[i];
        if (c === '"') { i++; while (i < end && text[i] !== '"') i++; } else if (c === '{') depth++; else if (c === '}') depth--;
      }
      const [bodyStart, bodyEnd] = [defRe.lastIndex, i - 1];
      // The prim's own attributes end where its first child starts.
      const firstChild = text.slice(bodyStart, bodyEnd).search(/\b(?:def|over|class)\s+(?:\w+\s+)?"/);
      const own = text.slice(bodyStart, firstChild >= 0 ? bodyStart + firstChild : bodyEnd);
      const world = new Matrix4().copy(parent).multiply(usdLocal(own));
      const id = primCount++;
      if (m[1] === 'Mesh') { const item = usdMesh(own, m[2], world); if (item) { Object.assign(item, { _parent: parentId, _parentName: parentName, _depth: level }); out.push(item); } }
      walk(bodyStart, bodyEnd, world, level + 1, m[2], id);
      defRe.lastIndex = i;
      cursor = i;
    }
    void cursor;
  };
  walk(headerEnd, text.length, root);
  const siblings = new Map();
  for (const o of out) siblings.set(o._parent, (siblings.get(o._parent) ?? 0) + 1);
  for (const o of out) {
    if (o._depth >= 2 && siblings.get(o._parent) === 1) o.name = o._parentName;
    delete o._parent;
    delete o._parentName;
    delete o._depth;
  }
  return out;
}

function usdLocal(own) {
  const m = new Matrix4();
  const order = /xformOpOrder\s*=\s*\[([^\]]*)\]/.exec(own)?.[1];
  const ops = order ? [...order.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [...own.matchAll(/\b(xformOp:\w+(?::\w+)?)\s*=/g)].map((x) => x[1]);
  for (const op of ops) {
    const v = new RegExp(`${op.replace(/:/g, ':')}\\s*=\\s*([^\\n]+)`).exec(own)?.[1];
    if (!v) continue;
    const n = usdArray(v);
    if (op.startsWith('xformOp:translate')) m.multiply(new Matrix4().makeTranslation(n[0], n[1], n[2]));
    else if (op.startsWith('xformOp:scale')) m.multiply(new Matrix4().makeScale(n[0], n[1], n[2]));
    else if (op.startsWith('xformOp:rotateXYZ')) m.multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromEuler(new Euler(n[0] * DEG, n[1] * DEG, n[2] * DEG, 'ZYX'))));
    else if (op.startsWith('xformOp:orient')) m.multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion(n[1], n[2], n[3], n[0])));
    else if (op.startsWith('xformOp:transform')) {
      // USD matrices are row-major with translation in the last row: the transpose of three.js's order of .set().
      m.multiply(new Matrix4().set(n[0], n[4], n[8], n[12], n[1], n[5], n[9], n[13], n[2], n[6], n[10], n[14], n[3], n[7], n[11], n[15]));
    }
  }
  return m;
}

function usdMesh(own, name, world) {
  const attr = (re) => { const m = re.exec(own); return m ? usdArray(m[1]) : null; };
  const points = attr(/point3f\[\]\s+points\s*=\s*\[([^\]]*)\]/);
  const counts = attr(/int\[\]\s+faceVertexCounts\s*=\s*\[([^\]]*)\]/);
  const indices = attr(/int\[\]\s+faceVertexIndices\s*=\s*\[([^\]]*)\]/);
  if (!points || !counts || !indices) return null;
  const verts = [];
  for (let i = 0; i + 2 < points.length; i += 3) verts.push([points[i], points[i + 1], points[i + 2]]);
  let cornerUvs = null;
  const stMatch = /texCoord2f\[\]\s+primvars:(?:st|UVMap)\s*=\s*\[([^\]]*)\]\s*\(([^)]*interpolation\s*=\s*"(\w+)"[^)]*)\)/.exec(own);
  if (stMatch) {
    const st = usdArray(stMatch[1]);
    const stIndices = attr(/int\[\]\s+primvars:(?:st|UVMap):indices\s*=\s*\[([^\]]*)\]/);
    const at = (k) => { const j = stIndices ? stIndices[k] : k; return [st[j * 2] ?? 0, st[j * 2 + 1] ?? 0]; };
    if (stMatch[3] === 'faceVarying') cornerUvs = indices.map((_, k) => at(k));
    else if (stMatch[3] === 'vertex' || stMatch[3] === 'varying') cornerUvs = indices.map((v) => at(v));
  }
  const mesh = polygons(verts, counts, indices, cornerUvs);
  mesh.verts = bake(mesh.verts, world);
  const leftHanded = /orientation\s*=\s*"leftHanded"/.test(own);
  if (leftHanded !== world.determinant() < 0) { mesh.faces = mesh.faces.map((f) => [...f].reverse()); if (mesh.uvs) mesh.uvs = mesh.uvs.map((u) => u && [...u].reverse()); }
  mesh.smooth = /subdivisionScheme\s*=\s*"(?:catmullClark|loop|bilinear)"/.test(own) || !/subdivisionScheme/.test(own);
  const color = /color3f\[\]\s+primvars:displayColor\s*=\s*\[\s*\(([^)]*)\)/.exec(own);
  return { name, mesh, material: color ? { name: `${name}Material`, baseColor: usdArray(color[1]).slice(0, 3), metallic: 0, roughness: 0.5 } : null };
}
