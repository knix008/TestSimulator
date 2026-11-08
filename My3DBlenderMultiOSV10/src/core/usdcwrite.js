// Writing binary USD (.usdc, the "crate" format, version 0.8.0) from a stage read out of USD text: so the scene exporter writes
// text once, and the same scene comes out as either. The tables are packed as USD's own reader expects them: LZ4 blocks (stored
// as literals, which every LZ4 reader takes), integers as running deltas, values out of line and reached by 8-byte reps.
// Checked by reading back here and by a real Blender: npm run verify:blender.

const encoder = new TextEncoder();

/** USD's LZ4 wrapping with one block of literals only: a valid block that any LZ4 reader decodes. */
function fastCompress(bytes) {
  const n = bytes.length;
  const extra = n >= 15 ? Math.floor((n - 15) / 255) + 1 : 0;
  const out = new Uint8Array(2 + extra + n);
  out[0] = 0; // one block, all the rest
  out[1] = Math.min(15, n) << 4;
  let at = 2;
  if (n >= 15) { let left = n - 15; while (left >= 255) { out[at++] = 255; left -= 255; } out[at++] = left; }
  out.set(bytes, at);
  return out;
}

/** Integers as running deltas: the most common delta, 2-bit codes, and the rest at 8, 16 or 32 bits. */
function encodeInts(values) {
  const deltas = values.map((v, i) => v - (i ? values[i - 1] : 0));
  const counts = new Map();
  for (const d of deltas) counts.set(d, (counts.get(d) ?? 0) + 1);
  let common = 0;
  let best = -1;
  for (const [d, c] of counts) if (c > best) { best = c; common = d; }
  const codes = new Uint8Array(Math.floor((values.length * 2 + 7) / 8));
  const rest = [];
  deltas.forEach((d, i) => {
    let code = 3;
    if (d === common) code = 0;
    else if (d >= -128 && d <= 127) { code = 1; rest.push([1, d]); }
    else if (d >= -32768 && d <= 32767) { code = 2; rest.push([2, d]); }
    else rest.push([4, d]);
    codes[i >> 2] |= code << ((i & 3) * 2);
  });
  const size = 4 + codes.length + rest.reduce((s, [w]) => s + w, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setInt32(0, common, true);
  out.set(codes, 4);
  let at = 4 + codes.length;
  for (const [w, d] of rest) {
    if (w === 1) view.setInt8(at, d); else if (w === 2) view.setInt16(at, d, true); else view.setInt32(at, d, true);
    at += w;
  }
  return out;
}

/** A float as a half. */
function floatToHalf(value) {
  const f = new Float32Array([value]);
  const x = new Uint32Array(f.buffer)[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let frac = (x >>> 13) & 0x3ff;
  if (exp <= 0) { if (exp < -10) return sign; frac = ((x & 0x7fffff) | 0x800000) >>> (1 - exp + 13); return sign | frac; }
  if (exp >= 31) return sign | 0x7c00;
  if ((x >>> 12) & 1) { frac++; if (frac === 1024) { frac = 0; exp++; if (exp >= 31) return sign | 0x7c00; } }
  return sign | (exp << 10) | frac;
}

class Bytes {
  constructor(start = 0) { this.parts = []; this.length = start; this.start = start; }
  put(bytes) { const at = this.length; this.parts.push(bytes); this.length += bytes.length; return at; }
  u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return this.put(b); }
  i64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); return this.put(b); }
  u32s(list) { const b = new Uint8Array(list.length * 4); const v = new DataView(b.buffer); list.forEach((x, i) => v.setUint32(i * 4, x, true)); return this.put(b); }
  ints(list) { const packed = fastCompress(encodeInts(list)); this.u64(packed.length); this.put(packed); }
  join() { const out = new Uint8Array(this.length - this.start); let at = 0; for (const p of this.parts) { out.set(p, at); at += p.length; } return out; }
}

// Value types of the crate.
const T = { bool: 1, uchar: 2, int: 3, uint: 4, int64: 5, half: 7, float: 8, double: 9, string: 10, token: 11, asset: 12, matrix2d: 13, matrix3d: 14, matrix4d: 15, quatd: 16, quatf: 17, quath: 18,
  double2: 19, float2: 20, half2: 21, int2: 22, double3: 23, float3: 24, half3: 25, int3: 26, double4: 27, float4: 28, half4: 29, int4: 30,
  dictionary: 31, tokenListOp: 32, pathListOp: 34, tokenVector: 41, specifier: 42, variability: 44, timeSamples: 46, doubleVector: 48 };
// Role types store as their plain kind.
const ROLE = { point3f: 'float3', point3d: 'double3', normal3f: 'float3', normal3d: 'double3', vector3f: 'float3', vector3d: 'double3', color3f: 'float3', color3d: 'double3', color4f: 'float4', texCoord2f: 'float2', texCoord2d: 'double2', texCoord3f: 'float3', frame4d: 'matrix4d', timecode: 'double' };
const WIDTH = { float: ['f32', 1], double: ['f64', 1], half: ['f16', 1], int: ['i32', 1], uint: ['u32', 1], uchar: ['u8', 1], bool: ['u8', 1], int64: ['i64', 1],
  float2: ['f32', 2], float3: ['f32', 3], float4: ['f32', 4], double2: ['f64', 2], double3: ['f64', 3], double4: ['f64', 4], half2: ['f16', 2], half3: ['f16', 3], half4: ['f16', 4],
  int2: ['i32', 2], int3: ['i32', 3], int4: ['i32', 4], quatf: ['f32', 4], quatd: ['f64', 4], quath: ['f16', 4], matrix2d: ['f64', 4], matrix3d: ['f64', 9], matrix4d: ['f64', 16] };
const SIZE = { f32: 4, f64: 8, f16: 2, i32: 4, u32: 4, u8: 1, i64: 8 };
const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);

/** The stage (as readUSDStage gives it for text) as .usdc bytes. */
export function writeUSDC(stage) {
  const tokens = [';-)', ''];
  const tokenIndex = new Map(tokens.map((t, i) => [t, i]));
  const tok = (s) => { s = String(s); if (!tokenIndex.has(s)) { tokenIndex.set(s, tokens.length); tokens.push(s); } return tokenIndex.get(s); };
  const strings = [];
  const stringIndex = new Map();
  const str = (s) => { s = String(s); if (!stringIndex.has(s)) { stringIndex.set(s, strings.length); strings.push(tok(s)); } return stringIndex.get(s); };
  const data = new Bytes(88);
  const rep = (type, payload, { array = false, inline = false } = {}) => (BigInt(array ? 1 : 0) << 63n) | (BigInt(inline ? 1 : 0) << 62n) | (BigInt(type) << 48n) | BigInt(payload);

  // Paths: every spec's, and every path a relationship or connection names, with their ancestors.
  const allPaths = new Set(['/']);
  const addPath = (p) => {
    if (allPaths.has(p)) return;
    allPaths.add(p);
    const dot = p.indexOf('.', p.lastIndexOf('/'));
    if (dot > 0) { addPath(p.slice(0, dot)); return; }
    const parent = p.slice(0, p.lastIndexOf('/')) || '/';
    addPath(parent);
  };
  for (const [path, prim] of stage.prims) {
    if (path === '/') continue;
    addPath(path);
    for (const k of ['references', 'payload', 'inherits']) for (const arc of [prim.meta?.[k]].flat()) if (arc?.path) addPath(arc.path);
    for (const name of prim.attrs.keys()) addPath(`${path}.${name}`);
    for (const [name, targets] of prim.rels) { addPath(`${path}.${name}`); for (const t of targets) addPath(t); }
    for (const a of prim.attrs.values()) for (const t of a.connect ?? []) addPath(t);
  }
  // The tree, children in order: prims as the stage has them, properties after.
  const node = (path) => ({ path, children: [] });
  const nodes = new Map([...allPaths].map((p) => [p, node(p)]));
  for (const p of allPaths) {
    if (p === '/') continue;
    const dot = p.indexOf('.', p.lastIndexOf('/'));
    const parent = dot > 0 ? p.slice(0, dot) : p.slice(0, p.lastIndexOf('/')) || '/';
    nodes.get(parent).children.push(nodes.get(p));
  }
  const order = [];
  const pathIndexOf = new Map();
  const elements = [];
  const jumps = [];
  const encode = (siblings) => siblings.forEach((n, k) => {
    const here = order.length;
    order.push(n.path);
    pathIndexOf.set(n.path, here);
    if (n.path === '/') elements.push(0);
    else {
      const dot = n.path.indexOf('.', n.path.lastIndexOf('/'));
      elements.push(dot > 0 ? -tok(n.path.slice(dot + 1)) : tok(n.path.slice(n.path.lastIndexOf('/') + 1)));
    }
    jumps.push(0);
    const hasChild = n.children.length > 0;
    const hasSibling = k < siblings.length - 1;
    if (hasChild) encode(n.children);
    jumps[here] = hasChild && hasSibling ? order.length - here : hasChild ? -1 : hasSibling ? 0 : -2;
  });
  encode([nodes.get('/')]);
  const pathOf = (p) => pathIndexOf.get(p);

  // ── values
  const numbers = (kind, list) => {
    const b = new Uint8Array(list.length * SIZE[kind]);
    const v = new DataView(b.buffer);
    list.forEach((x, i) => {
      const at = i * SIZE[kind];
      const n = Number(x ?? 0);
      if (kind === 'f32') v.setFloat32(at, n, true); else if (kind === 'f64') v.setFloat64(at, n, true); else if (kind === 'f16') v.setUint16(at, floatToHalf(n), true);
      else if (kind === 'i32') v.setInt32(at, n, true); else if (kind === 'u32') v.setUint32(at, n, true); else if (kind === 'u8') v.setUint8(at, n ? (n === true ? 1 : n) : 0); else v.setBigInt64(at, BigInt(Math.round(n)), true);
    });
    return b;
  };
  // Quaternions are written real part first in text and stored imaginary part first.
  const element = (base, v) => {
    const list = flat(v);
    return base.startsWith('quat') ? [list[1], list[2], list[3], list[0]] : list;
  };
  /** A value of a declared type (role types as their kind) as a rep, its data written out of line where it does not fit. */
  const pack = (typeName, value) => {
    const isArray = typeName.endsWith('[]');
    const base0 = isArray ? typeName.slice(0, -2) : typeName;
    const base = ROLE[base0] ?? base0;
    const type = T[base];
    if (type == null) return null;
    if (isArray) {
      const list = Array.isArray(value) ? value : [];
      const at = data.u64(list.length);
      if (base === 'token' || base === 'asset') data.u32s(list.map((x) => tok(x?.asset ?? x)));
      else if (base === 'string') data.u32s(list.map((x) => str(x)));
      else { const [kind] = WIDTH[base]; data.put(numbers(kind, list.flatMap((x) => element(base, x)))); }
      return rep(type, at, { array: true });
    }
    if (base === 'bool') return rep(type, value ? 1 : 0, { inline: true });
    if (base === 'int' || base === 'uint' || base === 'uchar') return rep(type, Number(value) >>> 0, { inline: true });
    if (base === 'float') { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, Number(value), true); return rep(type, b.getUint32(0, true), { inline: true }); }
    if (base === 'token') return rep(type, tok(value), { inline: true });
    if (base === 'asset') return rep(type, tok(value?.asset ?? value), { inline: true });
    if (base === 'string') return rep(type, str(value), { inline: true });
    const [kind] = WIDTH[base] ?? [];
    if (!kind) return null;
    return rep(type, data.put(numbers(kind, element(base, value))));
  };
  const tokenVector = (list) => { const at = data.u64(list.length); data.u32s(list.map(tok)); return rep(T.tokenVector, at); };
  const doubleRep = (x) => rep(T.double, data.put(numbers('f64', [x])));
  const pathListOp = (paths) => { const at = data.put(Uint8Array.of(3)); data.u64(paths.length); data.u32s(paths.map(pathOf)); return rep(T.pathListOp, at); };
  const tokenListOp = (list) => { const at = data.put(Uint8Array.of(32)); data.u64(list.length); data.u32s(list.map(tok)); return rep(T.tokenListOp, at); };
  // References and payloads, prepended: a file (empty for this one), a prim, a time offset of 0 and scale of 1, no custom data.
  const arcListOp = (type, list, withDictionary) => {
    const at = data.put(Uint8Array.of(32));
    data.u64(list.length);
    for (const arc of list) {
      data.u32s([str(arc.asset ?? ''), arc.path ? pathOf(arc.path) : 0]);
      data.put(numbers('f64', [0, 1]));
      if (withDictionary) data.u64(0);
    }
    return rep(type, at);
  };
  const arcs = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => x && typeof x === 'object' && (x.asset || x.path));
  const timeSamples = (typeName, samples) => {
    const times = data.u64(samples.length);
    data.put(numbers('f64', samples.map(([t]) => t)));
    const timesRep = rep(T.doubleVector, times);
    const reps = samples.map(([, v]) => pack(typeName, v) ?? rep(0, 0));
    const at = data.i64(8);
    data.u64(timesRep);
    data.i64(8);
    data.u64(reps.length);
    for (const r of reps) data.u64(r);
    return rep(T.timeSamples, at);
  };
  const dictionary = (dict) => {
    // Nested dictionaries first, so their reps are known.
    const entries = Object.entries(dict ?? {}).map(([key, { type, value }]) => [key, type === 'dictionary' ? dictionary(value) : pack(type, value)]).filter(([, r]) => r != null);
    const at = data.u64(entries.length);
    for (const [key, r] of entries) { data.u32s([str(key)]); data.i64(8); data.u64(r); }
    return rep(T.dictionary, at);
  };

  // ── fields, field sets and specs
  const fields = [];
  const fieldIndex = new Map();
  const field = (name, r) => { const key = `${name}|${r}`; if (!fieldIndex.has(key)) { fieldIndex.set(key, fields.length); fields.push([tok(name), r]); } return fieldIndex.get(key); };
  const fieldSets = [];
  const setIndex = new Map();
  const fieldSet = (list) => { const key = list.join(','); if (!setIndex.has(key)) { setIndex.set(key, fieldSets.length); fieldSets.push(...list, -1); } return setIndex.get(key); };
  const specs = [];
  const spec = (path, type, list) => specs.push([pathOf(path), fieldSet(list.filter((x) => x != null)), type]);

  const root = stage.prims.get('/');
  const m = stage.meta ?? {};
  const rootFields = [];
  for (const key of ['defaultPrim', 'upAxis']) if (m[key] != null) rootFields.push(field(key, rep(T.token, tok(m[key]), { inline: true })));
  for (const key of ['metersPerUnit', 'timeCodesPerSecond', 'framesPerSecond', 'startTimeCode', 'endTimeCode']) if (typeof m[key] === 'number') rootFields.push(field(key, doubleRep(m[key])));
  if (typeof m.doc === 'string') rootFields.push(field('documentation', rep(T.string, str(m.doc), { inline: true })));
  if (root.children.length) rootFields.push(field('primChildren', tokenVector(root.children.map((c) => c.name))));
  spec('/', 7, rootFields);
  const writePrim = (prim) => {
    const list = [field('specifier', rep(T.specifier, 0, { inline: true }))];
    if (prim.type) list.push(field('typeName', rep(T.token, tok(prim.type), { inline: true })));
    const meta = prim.meta ?? {};
    if (Array.isArray(meta.apiSchemas)) list.push(field('apiSchemas', tokenListOp(meta.apiSchemas)));
    if (meta.customData && typeof meta.customData === 'object') list.push(field('customData', dictionary(meta.customData)));
    if (typeof meta.kind === 'string') list.push(field('kind', rep(T.token, tok(meta.kind), { inline: true })));
    if (typeof meta.active === 'boolean') list.push(field('active', rep(T.bool, meta.active ? 1 : 0, { inline: true })));
    if (arcs(meta.references).length) list.push(field('references', arcListOp(35, arcs(meta.references), true)));
    if (arcs(meta.payload).length) list.push(field('payload', arcListOp(55, arcs(meta.payload), false)));
    if (arcs(meta.inherits).length) list.push(field('inheritPaths', pathListOp(arcs(meta.inherits).map((x) => x.path))));
    const props = [...prim.attrs.keys(), ...prim.rels.keys()];
    if (props.length) list.push(field('properties', tokenVector(props)));
    if (prim.children.length) list.push(field('primChildren', tokenVector(prim.children.map((c) => c.name))));
    spec(prim.path, 6, list);
    for (const [name, a] of prim.attrs) {
      const typeName = a.typeName ?? 'float';
      const own = [field('typeName', rep(T.token, tok(typeName), { inline: true }))];
      if (a.custom) own.push(field('custom', rep(T.bool, 1, { inline: true })));
      if (a.uniform) own.push(field('variability', rep(T.variability, 1, { inline: true })));
      if (a.value != null) { const r = pack(typeName, a.value); if (r != null) own.push(field('default', r)); }
      if (a.samples?.length) own.push(field('timeSamples', timeSamples(typeName, a.samples)));
      if (a.connect?.length) own.push(field('connectionPaths', pathListOp(a.connect)));
      if (a.interpolation) own.push(field('interpolation', rep(T.token, tok(a.interpolation), { inline: true })));
      if (a.elementSize != null) own.push(field('elementSize', rep(T.int, Number(a.elementSize), { inline: true })));
      spec(`${prim.path}.${name}`, 1, own);
    }
    for (const [name, targets] of prim.rels) spec(`${prim.path}.${name}`, 8, [field('variability', rep(T.variability, 1, { inline: true })), field('targetPaths', pathListOp(targets))]);
    for (const c of prim.children) writePrim(c);
  };
  for (const c of root.children) writePrim(c);

  // ── the six tables, then the table of contents
  const sections = [];
  const section = (name, build) => { const start = data.length; build(); sections.push([name, start, data.length - start]); };
  section('TOKENS', () => {
    const raw = encoder.encode(tokens.map((t) => `${t}\0`).join(''));
    const packed = fastCompress(raw);
    data.u64(tokens.length); data.u64(raw.length); data.u64(packed.length); data.put(packed);
  });
  section('STRINGS', () => { data.u64(strings.length); data.u32s(strings); });
  section('FIELDS', () => {
    data.u64(fields.length);
    data.ints(fields.map(([t]) => t));
    const reps = new Uint8Array(fields.length * 8);
    const view = new DataView(reps.buffer);
    fields.forEach(([, r], i) => view.setBigUint64(i * 8, r, true));
    const packed = fastCompress(reps);
    data.u64(packed.length); data.put(packed);
  });
  section('FIELDSETS', () => { data.u64(fieldSets.length); data.ints(fieldSets); });
  section('PATHS', () => { data.u64(order.length); data.u64(order.length); data.ints(order.map((_, i) => i)); data.ints(elements); data.ints(jumps); });
  section('SPECS', () => { data.u64(specs.length); data.ints(specs.map((s) => s[0])); data.ints(specs.map((s) => s[1])); data.ints(specs.map((s) => s[2])); });
  const toc = data.u64(sections.length);
  for (const [name, start, size] of sections) { const b = new Uint8Array(16); b.set(encoder.encode(name)); data.put(b); data.u64(start); data.u64(size); }
  const head = new Uint8Array(88);
  head.set(encoder.encode('PXR-USDC'));
  head.set([0, 8, 0], 8);
  new DataView(head.buffer).setBigUint64(16, BigInt(toc), true);
  const body = data.join();
  const out = new Uint8Array(88 + body.length);
  out.set(head);
  out.set(body, 88);
  return out;
}
