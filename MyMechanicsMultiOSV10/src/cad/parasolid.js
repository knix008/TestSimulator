// Parasolid XT transmit files: .x_t (text) and .x_b (neutral binary). This module reads and writes the node stream
// (no kernel): a common header, a schema key, then nodes (type, [variable length], index, fields) up to a
// terminator. What the fields of each node type are, and in which order, is given by a schema:
//
//  - the base schema SCH_13006 (Parasolid V13): the layouts below. Files written here use it (SCH_1300000_13006), as
//    Onshape's exports do; every Parasolid since V14 reads it.
//  - "embedded" schemas (key SCH_<build>_<schema>_13006, what most CAD programs write): before the first node of
//    each type the file carries the edit (copy / delete / insert / append) of that type's base layout, or the whole
//    layout of a type the base does not have; read here.
//  - other plain keys: read with the layouts of the format reference (V34) where they differ from the base.
//
// Sources: the public "Parasolid XT Format Reference" (layout, node types, header, text and binary encodings, the
// V12 example of §2.1.4.5) and the 13006 base layouts reviewed against real V13 files by parasolid-kit (MIT
// licence, see licenses/parasolid-kit.txt).

/** Field list from a compact spec: "name:type" (scalar), "name:type:*" (variable, last), "name:type:N" (array). */
const F = (spec) => spec.trim().split(/\s+/).map((tok) => {
  const [name, type, count] = tok.split(':');
  return { name, type, n: count === '*' ? 1 : count ? Number(count) : 0 };
});
const CURVE = 'node_id:d attributes_features:p owner:p next:p previous:p geometric_owner:p sense:c';
const SURF = CURVE;

/** Base schema SCH_13006 layouts by node type. */
export const BASE_SCHEMA = {
  10: F('highest_node_id:d attributes_features:p attribute_chains:p list:p surface:p curve:p point:p key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p kind:u sub_instance:p'),
  11: F('node_id:d attributes_features:p kind:u part:p transform:p assembly:p next_in_part:p prev_in_part:p next_of_part:p prev_of_part:p'),
  12: F('highest_node_id:d attributes_features:p attribute_chains:p surface:p curve:p point:p key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p body_type:u nom_geom_state:u shell:p boundary_surface:p boundary_curve:p boundary_point:p region:p edge:p vertex:p'),
  13: F('node_id:d attributes_features:p body:p next:p face:p edge:p vertex:p region:p front_face:p'),
  14: F('node_id:d attributes_features:p tolerance:f next:p previous:p loop:p shell:p surface:p sense:c next_on_surface:p previous_on_surface:p next_front:p previous_front:p front_shell:p'),
  15: F('node_id:d attributes_features:p halfedge:p face:p next:p'),
  16: F('node_id:d attributes_features:p tolerance:f halfedge:p previous:p next:p curve:p next_on_curve:p previous_on_curve:p owner:p'),
  17: F('attributes_features:p loop:p forward:p backward:p vertex:p other:p edge:p curve:p next_at_vx:p sense:c'),
  18: F('node_id:d attributes_features:p halfedge:p previous:p next:p point:p tolerance:f owner:p'),
  19: F('node_id:d attributes_features:p body:p next:p previous:p shell:p region_type:c'),
  29: F('node_id:d attributes_features:p owner:p next:p previous:p pvec:v'),
  30: F(`${CURVE} pvec:v direction:v`),
  31: F(`${CURVE} centre:v normal:v x_axis:v radius:f`),
  32: F(`${CURVE} centre:v normal:v x_axis:v major_radius:f minor_radius:f`),
  38: F(`${CURVE} surface:p:2 chart:p start:p end:p`),
  40: F('base_parameter:f base_scale:f chart_count:d chordal_error:f angular_error:f parameter_error:f:2 hvec:h:*'),
  41: F('limit_type:c hvec:h:*'),
  45: F('vertices:f:*'),
  50: F(`${SURF} pvec:v normal:v x_axis:v`),
  51: F(`${SURF} pvec:v axis:v radius:f x_axis:v`),
  52: F(`${SURF} pvec:v axis:v radius:f sin_half_angle:f cos_half_angle:f x_axis:v`),
  53: F(`${SURF} centre:v radius:f axis:v x_axis:v`),
  54: F(`${SURF} centre:v axis:v major_radius:f minor_radius:f x_axis:v`),
  56: F(`${SURF} blend_type:c surface:p:2 spine:p range:f:2 thumb_weight:f:2 boundary:p:2 start:p end:p`),
  59: F(`${SURF} boundary:n blend:p`),
  60: F(`${SURF} check:c true_offset:l surface:p offset:f scale:f`),
  67: F(`${SURF} section:p sweep:v scale:f`),
  68: F(`${SURF} profile:p base:v axis:v start:v end:v start_param:f end_param:f x_axis:v scale:f`),
  70: F('node_id:d owner:p next:p previous:p list_type:d list_length:d block_length:d size_of_entry:d list_block:p finger_block:p finger_index:d notransmit:l'),
  74: F('n_entries:d next_block:p entries:p:*'),
  79: F('string:c:*'),
  80: F('next:p identifier:p type_id:d actions:u:8 field_names:p legal_owners:l:14 fields:u:*'),
  81: F('node_id:d definition:p owner:p next:p previous:p next_of_type:p previous_of_type:p fields:p:*'),
  82: F('values:d:*'),
  83: F('values:f:*'),
  84: F('values:c:*'),
  85: F('values:v:*'),
  86: F('values:v:*'),
  87: F('values:v:*'),
  88: F('values:t:*'),
  89: F('values:v:*'),
  90: F('node_id:d attributes_features:p owner:p next:p previous:p kind:u first_member:p'),
  91: F('dummy_node_id:d owning_feature:p owner:p next:p previous:p next_member:p previous_member:p'),
  98: F('values:w:*'),
  99: F('names:p:*'),
  100: F('node_id:d owner:p next:p previous:p rotation_matrix:f:9 translation_vector:v scale:f flag:d perspective_vector:v'),
  102: F('string:c:*'),
  120: F(`${SURF} pe_type:c data:p tf:p internal_geom:p:*`),
  121: F('geom_type:d real_array:p int_array:p'),
  122: F('key:p real_array:p int_array:p'),
  124: F(`${SURF} nurbs:p data:p`),
  125: F('original_uint:i original_vint:i extended_uint:i extended_vint:i self_int:u original_u_start:c original_u_end:c original_v_start:c original_v_end:c extended_u_start:c extended_u_end:c extended_v_start:c extended_v_end:c analytic_form_type:c swept_form_type:c spun_form_type:c blend_form_type:c analytic_form:p swept_form:p spun_form:p blend_form:p'),
  126: F('u_periodic:l v_periodic:l u_degree:n v_degree:n n_u_vertices:d n_v_vertices:d u_knot_type:u v_knot_type:u n_u_knots:d n_v_knots:d rational:l u_closed:l v_closed:l surface_form:u vertex_dim:n bspline_vertices:p u_knot_mult:p v_knot_mult:p u_knots:p v_knots:p'),
  127: F('mult:n:*'),
  128: F('knots:f:*'),
  130: F(`${CURVE} pe_type:c data:p tf:p internal_geom:p:*`),
  133: F(`${CURVE} basis_curve:p point_1:v point_2:v parm_1:f parm_2:f`),
  134: F(`${CURVE} nurbs:p data:p`),
  135: F('self_int:u analytic_form:p'),
  136: F('degree:n n_vertices:d vertex_dim:n n_knots:d knot_type:u periodic:l closed:l rational:l curve_form:u bspline_vertices:p knot_mult:p knots:p'),
  137: F(`${CURVE} surface:p b_curve:p original:p tolerance_to_original:f`),
  141: F('owner:p next:p previous:p shared_geometry:p'),
};

/**
 * Plain (non-embedded) keys newer than V13 carry no layouts, and the layouts changed between versions. These are the
 * known variants of the node types that changed, each tagged with the schema it was seen in: the format reference
 * (V34), parasolid-kit's V30 tables, and an Autodesk Inventor 2020 file (V31). The reader tries them in order of
 * closeness to the file's schema and keeps the one under which the whole stream parses.
 */
const BODY_HEAD = 'highest_node_id:d attributes_features:p attribute_chains:p';
const BODY_MID = 'key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p body_type:u nom_geom_state:u shell:p boundary_surface:p boundary_curve:p boundary_point:p';
const VARIANTS = {
  10: [
    [34000, F('highest_node_id:d attributes_features:p attribute_chains:p list:p lattice:p surface:p curve:p point:p mesh:p polyline:p key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p kind:u sub_instance:p mesh_offset_data:p')],
    [31000, F('highest_node_id:d attributes_features:p attribute_chains:p list:p surface:p curve:p point:p mesh:p polyline:p key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p kind:u sub_instance:p mesh_offset_data:p')],
    [30000, F('highest_node_id:d attributes_features:p attribute_chains:p list:p surface:p curve:p point:p mesh:p polyline:p key:p res_size:f res_linear:f ref_instance:p next:p previous:p state:u owner:p kind:u sub_instance:p')],
  ],
  12: [
    [34000, F(`${BODY_HEAD} lattice:p surface:p curve:p point:p mesh:p polyline:p ${BODY_MID} boundary_mesh:p boundary_polyline:p region:p edge:p vertex:p index_map_offset:d index_map:p node_id_index_map:p schema_embedding_map:p child:p lowest_node_id:d mesh_offset_data:p`)],
    [31000, F(`${BODY_HEAD} surface:p curve:p point:p mesh:p polyline:p ${BODY_MID} boundary_mesh:p boundary_polyline:p region:p edge:p vertex:p index_map_offset:d index_map:p node_id_index_map:p schema_embedding_map:p child:p lowest_node_id:d mesh_offset_data:p`)],
    [30000, F(`${BODY_HEAD} surface:p curve:p point:p mesh:p polyline:p ${BODY_MID} boundary_mesh:p boundary_polyline:p region:p edge:p vertex:p index_map_offset:d index_map:p node_id_index_map:p schema_embedding_map:p child:p lowest_node_id:d`)],
  ],
  19: [[30000, F('node_id:d attributes_features:p body:p next:p previous:p shell:p region_type:c owner:p')]],
  38: [[30000, F(`${CURVE} surface:p:2 chart:p start:p end:p intersection_data:p`)]],
  41: [[30000, F('limit_type:c term_use:c hvec:h:*')]],
  70: [
    [34000, F('node_id:d list_type:u notransmit:l owner:p next:p previous:p list_length:d block_length:d size_of_entry:d finger_index:d finger_block:p list_block:p')],
    [30000, F('node_id:d list_type:u notransmit:l owner:p next:p previous:p list_length:d block_length:d finger_index:d finger_block:p list_block:p')],
  ],
  74: [[30000, F('n_entries:d index_map_offset:d next_block:p entries:p:*')]],
  100: [[34000, F('node_id:d owner:p next:p previous:p rotation_matrix:f:9 translation_vector:v scale:f flag:d perspective_vector:v precision:p')]],
  176: [[30000, F('n_entries:d index_map_offset:d index_map:p schema_embedding_map:p mesh_offset_data:p entries:p:*')]],
  204: [[30000, F('uv_type:u values:f:*')]],
};

/** The candidate layouts of a node type for a plain key, closest version first; the base layout last. */
function plainCandidates(type, schema) {
  if (schema < 13000) return V12_SCHEMA[type] ? [V12_SCHEMA[type]] : [];
  if (schema <= 13006) return BASE_SCHEMA[type] ? [BASE_SCHEMA[type]] : [];
  const variants = (VARIANTS[type] ?? []).slice().sort((a, b) => {
    const da = a[0] <= schema ? schema - a[0] : 1e6 + a[0] - schema; const db = b[0] <= schema ? schema - b[0] : 1e6 + b[0] - schema;
    return da - db;
  }).map((v) => v[1]);
  return BASE_SCHEMA[type] ? [...variants, BASE_SCHEMA[type]] : variants;
}

/** V12 and older: an attribute definition without field names and with 13 owner flags (format reference §2.1.4.5). */
const V12_SCHEMA = { ...BASE_SCHEMA, 80: F('next:p identifier:p type_id:d actions:u:8 legal_owners:l:13 fields:u:*') };

export const NODE = {
  ASSEMBLY: 10, INSTANCE: 11, BODY: 12, SHELL: 13, FACE: 14, LOOP: 15, EDGE: 16, FIN: 17, VERTEX: 18, REGION: 19,
  POINT: 29, LINE: 30, CIRCLE: 31, ELLIPSE: 32, INTERSECTION: 38, CHART: 40, LIMIT: 41, BSPLINE_VERTICES: 45,
  PLANE: 50, CYLINDER: 51, CONE: 52, SPHERE: 53, TORUS: 54, BLENDED_EDGE: 56, BLEND_BOUND: 59, OFFSET_SURF: 60,
  SWEPT_SURF: 67, SPUN_SURF: 68, LIST: 70, POINTER_LIS_BLOCK: 74, TRANSFORM: 100, PE_SURF: 120, B_SURFACE: 124,
  SURFACE_DATA: 125, NURBS_SURF: 126, KNOT_MULT: 127, KNOT_SET: 128, PE_CURVE: 130, TRIMMED_CURVE: 133, B_CURVE: 134,
  CURVE_DATA: 135, NURBS_CURVE: 136, SP_CURVE: 137, POLYLINE: 200, POLYLINE_DATA: 185, PART_XMT_BLOCK: 176,
};

// The two values Parasolid uses for "unset": -32764 (integers) and -3.14158e13 (reals); `?` in text.
const NULL_INT = -32764;
const NULL_REAL = -3.14158e13;
const isNullReal = (x) => Math.abs(x - NULL_REAL) < 1e3;

const xtError = (message, code = 'xt-read') => Object.assign(new Error(message), { code });

/** The parts of a schema key: SCH_<build>_<schema>[_<base>]. */
export function parseSchemaKey(key) {
  const m = /^SCH_(\d+)_(\d+)(?:_(\d+))?$/.exec(String(key).trim());
  if (!m) throw xtError(`unknown schema key ${key}`, 'xt-schema');
  return { key, build: Number(m[1]), schema: Number(m[2]), base: m[3] ? Number(m[3]) : null };
}

// ———————————————————————————————————————— reading ————————————————————————————————————————

const HEADER_END = '**END_OF_HEADER';
const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };

/** Where the node stream starts: after the human-readable common header, if the file has one. */
function payloadStart(bytes) {
  if (!(bytes[0] === 0x2a && bytes[1] === 0x2a)) return 0; // "**"
  const text = latin1(bytes.subarray(0, Math.min(bytes.length, 1 << 20)));
  const at = text.indexOf(HEADER_END);
  if (at < 0) throw xtError('the header has no **END_OF_HEADER line');
  let i = at + HEADER_END.length;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++;
  return i;
}

/** The common header's keywords (PART1 / PART2 / PART3), e.g. { APPL, FORMAT, SCH }. */
function headerKeywords(bytes, end) {
  const text = latin1(bytes.subarray(0, end)).replace(/\r?\n/g, '');
  const out = {};
  for (const m of text.matchAll(/([A-Z0-9_]{1,80})=((?:\^.|[^;^])*);/g)) out[m[1]] = m[2].replace(/\^n/g, '\n').replace(/\^-/g, ' ').replace(/\^;/g, ';').replace(/\^\^/g, '^');
  return out;
}

/** Text stream: lines joined, carriage returns and trailing spaces of each line dropped (format reference §3.2). */
class TextIn {
  constructor(bytes, start) {
    const parts = [];
    let line = start;
    while (line < bytes.length) {
      let end = line; while (end < bytes.length && bytes[end] !== 10 && bytes[end] !== 13) end++;
      let e = end; while (e > line && bytes[e - 1] === 32) e--;
      parts.push(latin1(bytes.subarray(line, e)));
      line = end; if (bytes[line] === 13) line++; if (bytes[line] === 10) line++;
    }
    this.s = parts.join(''); this.i = 0; this.spaces = 0;
  }
  token(what) {
    const s = this.s; const start = this.i;
    while (this.i < s.length && s[this.i] !== ' ') this.i++;
    if (this.i === start) throw xtError(`empty ${what} at ${start}`);
    const tok = s.slice(start, this.i);
    if (this.i < s.length) this.i++; // the delimiter
    return tok;
  }
  int(what = 'integer') { const t = this.token(what); const v = Number(t); if (!Number.isInteger(v)) throw xtError(`bad ${what} "${t}" at ${this.i}`); return v; }
  nullableInt(what) { if (this.s[this.i] === '?') { this.i++; return null; } return this.int(what); }
  real(what = 'real') { if (this.s[this.i] === '?') { this.i++; return null; } const t = this.token(what); const v = Number(t); if (!Number.isFinite(v)) throw xtError(`bad ${what} "${t}"`); return v; }
  reals(n) { if (this.s[this.i] === '?') { this.i++; return null; } const out = []; for (let k = 0; k < n; k++) { const v = this.real(); if (v === null) throw xtError('a null inside a composite'); out.push(v); } return out; }
  raw() { if (this.i >= this.s.length) throw xtError('unexpected end of the file'); return this.s[this.i++]; }
  /** One character of character data, with the escapes \\ \0 \n \r and \9 (nine spaces). */
  char() {
    if (this.spaces) { this.spaces--; return ' '; }
    const c = this.raw();
    if (c !== '\\') return c;
    const e = this.raw();
    if (e === '\\') return '\\';
    if (e === '0') return '\0';
    if (e === 'n') return '\r';
    if (e === 'r') return '\n';
    if (e === '9') { this.spaces = 8; return ' '; }
    throw xtError(`bad escape \\${e}`);
  }
  logical() { const c = this.raw(); if (c === 'T') return true; if (c === 'F') return false; throw xtError(`bad logical "${c}"`); }
  string(n) { let out = ''; for (let k = 0; k < n; k++) out += this.char(); return out; }
  shortString() { return this.string(this.int('length')); }
  value(type) {
    switch (type) {
      case 'u': case 'n': case 'w': return this.nullableInt(type);
      case 'd': case 't': { const v = this.nullableInt(type); return v === NULL_INT ? null : v; }
      case 'p': return this.int('pointer');
      case 'c': return this.char();
      case 'l': return this.logical();
      case 'f': return this.real();
      case 'v': case 'h': return this.reals(3);
      case 'i': return this.reals(2);
      case 'b': return this.reals(6);
      default: throw xtError(`unknown field type ${type}`, 'xt-schema');
    }
  }
}

/** Neutral binary stream: big-endian, IEEE doubles (format reference §3.3.3). */
class BinIn {
  constructor(bytes, start) { this.b = bytes; this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.i = start; }
  need(n) { if (this.i + n > this.b.length) throw xtError('unexpected end of the file'); }
  u8() { this.need(1); return this.b[this.i++]; }
  i16() { this.need(2); const x = this.v.getInt16(this.i); this.i += 2; return x; }
  u16() { this.need(2); const x = this.v.getUint16(this.i); this.i += 2; return x; }
  i32() { this.need(4); const x = this.v.getInt32(this.i); this.i += 4; return x; }
  f64() { this.need(8); const x = this.v.getFloat64(this.i); this.i += 8; return x; }
  /** A pointer index: small ones as one short (+1), large ones as a negative remainder and a quotient. */
  index() { let r = this.i16(); let q = 0; if (r < 0) { q = this.i16(); r = -r; } return q * 32767 + r - 1; }
  raw() { return String.fromCharCode(this.u8()); }
  char() { return this.raw(); }
  logical() { return this.u8() !== 0; }
  string(n) { this.need(n); const s = latin1(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
  shortString() { return this.string(this.u8()); }
  real() { const x = this.f64(); return isNullReal(x) ? null : x; }
  reals(n) { const out = []; let nul = false; for (let k = 0; k < n; k++) { const x = this.f64(); if (isNullReal(x)) nul = true; out.push(x); } return nul ? null : out; }
  value(type) {
    switch (type) {
      case 'u': return this.u8();
      case 'n': { const x = this.i16(); return x === NULL_INT ? null : x; }
      case 'w': return this.u16();
      case 'd': case 't': { const x = this.i32(); return x === NULL_INT ? null : x; }
      case 'p': return this.index();
      case 'c': return this.raw();
      case 'l': return this.logical();
      case 'f': return this.real();
      case 'v': case 'h': return this.reals(3);
      case 'i': return this.reals(2);
      case 'b': return this.reals(6);
      default: throw xtError(`unknown field type ${type}`, 'xt-schema');
    }
  }
}

/** An embedded field description: name, pointer class, element count, [type], [transmitted]. */
function readSchemaField(r, binary) {
  const name = r.shortString();
  const ptrClass = binary ? r.u16() : r.int('pointer class');
  const n = binary ? r.index() : r.int('element count');
  const type = ptrClass === 0 ? r.shortString() : 'p';
  const transmit = n === 1 ? r.logical() : true;
  // A field must not take the place of the node's own "type" and "index".
  return { name: name === 'type' || name === 'index' ? `${name}_field` : name, type, n, transmit };
}

/**
 * The layout of a node type at its first appearance in an embedded-schema file: 255 = the base layout unchanged,
 * otherwise the field count and an edit of the base (C copy, D delete, I insert, A append, Z end), or — for a type
 * the base does not have — its name, description and fields.
 */
function readEmbeddedLayout(r, type, binary) {
  const base = BASE_SCHEMA[type];
  const marker = binary ? r.u8() : r.int('schema marker');
  if (base && marker === 255) return base;
  if (!base) {
    r.shortString(); r.shortString(); // name, description
    const out = [];
    for (let k = 0; k < marker; k++) out.push(readSchemaField(r, binary));
    return out;
  }
  const out = []; let bi = 0;
  for (;;) {
    const op = r.raw();
    if (op === 'C') { if (bi >= base.length) throw xtError(`schema copy past the base layout of node type ${type}`, 'xt-schema'); out.push(base[bi++]); }
    else if (op === 'D') bi++;
    else if (op === 'I' || op === 'A') out.push(readSchemaField(r, binary));
    else if (op === 'Z') break;
    else throw xtError(`bad schema edit "${op}" for node type ${type}`, 'xt-schema');
  }
  if (out.length !== marker) throw xtError(`node type ${type}: ${out.length} fields after the schema edit, ${marker} declared`, 'xt-schema');
  return out;
}

/**
 * Read an XT file (bytes or text) into its nodes: { version, schema, keywords, binary, root, nodes: Map(index →
 * node) }, a node being { type, index, ...fields }. Throws { code: 'xt-read' | 'xt-schema' }.
 */
export function readXt(data) {
  const bytes = typeof data === 'string' ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 255) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const start = payloadStart(bytes);
  const keywords = start ? headerKeywords(bytes, start) : {};
  const binary = bytes[start] === 0x50 && bytes[start + 1] === 0x53; // "PS"
  let r;
  if (binary) {
    if (!(bytes[start + 2] === 0 && bytes[start + 3] === 0)) throw xtError('only neutral (big-endian) binary XT files are read');
    r = new BinIn(bytes, start + 4);
  } else {
    r = new TextIn(bytes, start);
    if (r.raw() !== 'T') throw xtError('not a Parasolid transmit file');
  }
  const version = binary ? r.string(r.u16()) : r.string(r.int('length'));
  const keyText = binary ? r.string(r.i32()) : r.string(r.int('length'));
  const key = parseSchemaKey(keyText);
  const maxType = key.base !== null ? (binary ? r.i16() : r.int('max node type')) : null;
  const userFields = binary ? r.i32() : r.int('user field size');
  if (!(userFields >= 0 && userFields <= 16)) throw xtError(`bad user field size ${userFields}`);
  const bodyStart = r.i;
  if (key.base !== null) return { version, schema: key, keywords, binary, ...readNodes(r, { key, binary, maxType, userFields }) };
  // A plain key: each node type's layout chosen among its candidates. A wrong choice shows as a parse failure
  // (usually at the very next node); then the latest choice that still has another candidate moves on, and the
  // stream is read again from the start.
  const choice = new Map();
  for (let attempt = 0; attempt < 400; attempt++) {
    r.i = bodyStart; r.spaces = 0;
    const order = [];
    try {
      return { version, schema: key, keywords, binary, ...readNodes(r, { key, binary, maxType, userFields, choose: (type) => {
        const cands = plainCandidates(type, key.schema);
        if (!cands.length) throw xtError(`node type ${type} is not supported by this reader (schema ${key.key})`, 'xt-schema');
        if (!choice.has(type)) choice.set(type, 0);
        order.push(type);
        return cands[choice.get(type)];
      } }) };
    } catch (error) {
      let moved = false;
      for (let k = order.length - 1; k >= 0 && !moved; k--) {
        const t = order[k];
        if (choice.get(t) + 1 < plainCandidates(t, key.schema).length) {
          choice.set(t, choice.get(t) + 1);
          for (const later of order.slice(k + 1)) choice.delete(later);
          moved = true;
        }
      }
      if (!moved) throw error;
    }
  }
  throw xtError(`no layout of schema ${key.key} fits this file`, 'xt-schema');
}

/** Node types the reader knows: what a node type at a node boundary must be (else the layout before it was wrong). */
const knownType = (t) => t === 1 || Boolean(BASE_SCHEMA[t] || VARIANTS[t]);

/** The node stream from the reader's position to the terminator. `choose(type)` picks a plain key's layout. */
function readNodes(r, { key, binary, maxType, userFields, choose }) {
  const layouts = new Map();
  const nodes = new Map();
  let root = null;
  for (;;) {
    const type = binary ? r.i16() : r.int('node type');
    if (type === 1) {
      const end = binary ? r.index() : r.int('terminator');
      if (end !== 0) throw xtError('bad terminator');
      if (!binary && r.i < r.s.length) throw xtError('data after the terminator');
      break;
    }
    if (!(type > 1)) throw xtError(`bad node type ${type}`);
    if (maxType !== null && type > maxType) throw xtError(`node type ${type} above the declared maximum ${maxType}`);
    if (choose && !knownType(type)) throw xtError(`unknown node type ${type}`, 'xt-schema');
    let layout = layouts.get(type);
    if (!layout) {
      layout = key.base !== null ? readEmbeddedLayout(r, type, binary) : choose(type);
      layouts.set(type, layout);
    }
    const variable = layout.length > 0 && layout.at(-1).n === 1;
    const count = variable ? (binary ? r.i32() : r.int('length')) : 0;
    if (!(count >= 0 && count < 1e8)) throw xtError(`bad variable length ${count}`);
    const index = binary ? r.index() : r.int('index');
    if (!(index > 0)) throw xtError(`bad node index ${index}`);
    const node = { type, index };
    for (const f of layout) {
      if (f.transmit === false) continue;
      const k = f.n === 0 ? -1 : f.n === 1 ? count : f.n;
      if (k < 0) { node[f.name] = r.value(f.type); continue; }
      if (f.type === 'c') { node[f.name] = r.string(k); continue; }
      const arr = new Array(k); for (let j = 0; j < k; j++) arr[j] = r.value(f.type); node[f.name] = arr;
    }
    for (let j = 0; j < userFields; j++) r.value('d');
    if (nodes.has(index)) throw xtError(`node index ${index} used twice`);
    nodes.set(index, node);
    root ??= node;
  }
  return { root, nodes };
}

// ———————————————————————————————————————— writing ————————————————————————————————————————

const MODELLER = ': TRANSMIT FILE created by modeller version 1300000';
const WRITE_KEY = 'SCH_1300000_13006';

/** Shortest text of a real that reads back exactly. */
const realText = (x) => (x === 0 ? '0' : String(x).replace('e+', 'e'));
const escapeChar = (c) => (c === '\\' ? '\\\\' : c === '\0' ? '\\0' : c === '\r' ? '\\n' : c === '\n' ? '\\r' : c);

class TextOut {
  constructor() { this.parts = []; }
  int(x) { this.parts.push(`${x} `); }
  nullableInt(x) { this.parts.push(x === null || x === undefined ? '?' : `${x} `); }
  real(x) { this.parts.push(x === null || x === undefined || !Number.isFinite(x) ? '?' : `${realText(x)} `); }
  reals(a, n) { if (!a) { this.parts.push('?'); return; } for (let k = 0; k < n; k++) this.real(a[k]); }
  char(c) { this.parts.push(escapeChar(c)); }
  logical(b) { this.parts.push(b ? 'T' : 'F'); }
  string(s) { for (const c of s) this.char(c); }
  value(type, x) {
    switch (type) {
      case 'u': case 'n': case 'w': case 'd': case 't': return this.nullableInt(x);
      case 'p': return this.int(x ?? 0);
      case 'c': return this.char(x ?? '?');
      case 'l': return this.logical(Boolean(x));
      case 'f': return this.real(x);
      case 'v': case 'h': return this.reals(x, 3);
      case 'i': return this.reals(x, 2);
      case 'b': return this.reals(x, 6);
      default: throw xtError(`unknown field type ${type}`, 'xt-write');
    }
  }
  /** Records of at most 80 characters, each broken before a space so that no line ends in one (a reader drops it). */
  text() {
    const s = this.parts.join(''); const lines = [];
    let i = 0;
    while (s.length - i > 80) {
      let cut = -1;
      for (let k = i + 80; k > i; k--) if (s[k] === ' ') { cut = k; break; }
      if (cut < 0) { cut = i + 80; while (cut > i + 1 && s[cut - 1] === ' ') cut--; }
      lines.push(s.slice(i, cut)); i = cut;
    }
    lines.push(s.slice(i));
    return lines.join('\n');
  }
}

class BinOut {
  constructor() { this.buf = new Uint8Array(1 << 16); this.v = new DataView(this.buf.buffer); this.n = 0; }
  grow(k) { if (this.n + k <= this.buf.length) return; const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k)); b.set(this.buf); this.buf = b; this.v = new DataView(b.buffer); }
  u8(x) { this.grow(1); this.buf[this.n++] = x & 255; }
  i16(x) { this.grow(2); this.v.setInt16(this.n, x); this.n += 2; }
  u16(x) { this.grow(2); this.v.setUint16(this.n, x); this.n += 2; }
  i32(x) { this.grow(4); this.v.setInt32(this.n, x); this.n += 4; }
  f64(x) { this.grow(8); this.v.setFloat64(this.n, x); this.n += 8; }
  index(i) { if (i < 32767) this.i16(i + 1); else { this.i16(-((i % 32767) + 1)); this.i16(Math.floor(i / 32767)); } }
  bytes(s) { for (let k = 0; k < s.length; k++) this.u8(s.charCodeAt(k)); }
  reals(a, n) { for (let k = 0; k < n; k++) this.f64(a ? a[k] : NULL_REAL); }
  value(type, x) {
    switch (type) {
      case 'u': return this.u8(x ?? 0);
      case 'n': return this.i16(x ?? NULL_INT);
      case 'w': return this.u16(x ?? 0);
      case 'd': case 't': return this.i32(x ?? NULL_INT);
      case 'p': return this.index(x ?? 0);
      case 'c': return this.u8((x ?? '?').charCodeAt(0));
      case 'l': return this.u8(x ? 1 : 0);
      case 'f': return this.f64(x === null || x === undefined || !Number.isFinite(x) ? NULL_REAL : x);
      case 'v': case 'h': return this.reals(x, 3);
      case 'i': return this.reals(x, 2);
      case 'b': return this.reals(x, 6);
      default: throw xtError(`unknown field type ${type}`, 'xt-write');
    }
  }
  result() { return this.buf.slice(0, this.n); }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const escapeKeyword = (v) => String(v).replace(/\^/g, '^^').replace(/;/g, '^;').replace(/ /g, '^-').replace(/\n/g, '^n').replace(/[^\x20-\x7e]/g, '_');

/** The human-readable common header (format reference §3.1): records of at most 80 characters. */
function commonHeader({ format, key, application = 'MyMechanics', file = '', date = new Date() }) {
  const lines = [
    '**ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz**************************',
    '**PARASOLID !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~0123456789**************************',
  ];
  const kw = (pairs) => pairs.filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}=${escapeKeyword(v)};`).join('');
  const part1 = `**PART1;${kw([['APPL', application], ['FORMAT', format], ['GUISE', 'transmit'], ['FILE', file], ['DATE', `${date.getDate()}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`]])}`;
  for (let i = 0; i < part1.length;) { let end = Math.min(part1.length, i + 80); if (part1[end - 1] === '^' && end < part1.length) end--; lines.push(part1.slice(i, end)); i = end; }
  // The header names the schema without its embedding base (as Parasolid does).
  lines.push(`**PART2;SCH=${key.replace(/^(SCH_\d+_\d+)_\d+$/, '$1')};USFLD_SIZE=0;`, '**PART3;', '**END_OF_HEADER*****************************************************************');
  return lines.join('\n') + '\n';
}

/** The embedded-schema edit of a layout against the base (format reference §2.1.2.2): ops C, D, I, A, then Z. */
function schemaEdit(base, layout) {
  if (layout === base) return null; // 255: unchanged
  const ops = []; let b = 0; let l = 0;
  while (b < base.length && l < layout.length) {
    if (base[b].name === layout[l].name && base[b].type === layout[l].type && base[b].n === layout[l].n) { ops.push(['C']); b++; l++; }
    else if (!base.slice(b).some((f) => f.name === layout[l].name)) { ops.push(['I', layout[l]]); l++; }
    else { ops.push(['D']); b++; }
  }
  while (b < base.length) { ops.push(['D']); b++; }
  while (l < layout.length) { ops.push(['A', layout[l]]); l++; }
  return ops;
}

/**
 * Write nodes ([{ type, index, ...fields }], the root first) as an XT file: text (string) or neutral binary
 * (Uint8Array). By default with the base schema and its plain key SCH_1300000_13006. `embedded: true` writes the
 * key SCH_<build>_<schema>_13006 with each node type's layout declared against the base at its first node (255
 * when unchanged); `layouts` (type → field list) overrides the base layouts, `key` the schema key. Missing pointers
 * are 0 (null), missing numbers unset.
 */
export function writeXt(nodes, { binary = false, file = '', application, date, key = null, embedded = false, layouts = {}, modeller = null } = {}) {
  const schemaKey = key ?? (embedded ? 'SCH_1300000_13006_13006' : WRITE_KEY);
  const version = modeller ?? MODELLER;
  const layoutOf = (type) => layouts[type] ?? BASE_SCHEMA[type];
  const head = binary ? '' : commonHeader({ format: 'text', key: schemaKey, file, application, date });
  const out = binary ? new BinOut() : new TextOut();
  const maxType = 255;
  if (binary) {
    out.bytes('PS\0\0'); out.u16(version.length); out.bytes(version); out.i32(schemaKey.length); out.bytes(schemaKey);
    if (embedded) out.i16(maxType);
    out.i32(0);
  } else {
    out.parts.push('T'); out.int(version.length); out.string(version); out.int(schemaKey.length); out.string(schemaKey);
    if (embedded) out.int(maxType);
    out.int(0);
  }
  const shortString = (s) => { if (binary) { out.u8(s.length); out.bytes(s); } else { out.int(s.length); out.string(s); } };
  const fieldSpec = (f) => {
    shortString(f.name);
    const ptrClass = f.type === 'p' ? 1 : 0;
    if (binary) { out.u16(ptrClass); out.index(f.n); } else { out.int(ptrClass); out.int(f.n); }
    if (!ptrClass) shortString(f.type);
    if (f.n === 1) { if (binary) out.u8(1); else out.logical(true); }
  };
  const declared = new Set();
  for (const node of nodes) {
    const layout = layoutOf(node.type);
    if (!layout) throw xtError(`cannot write node type ${node.type}`, 'xt-write');
    const varField = layout.at(-1).n === 1 ? layout.at(-1) : null;
    const count = varField ? (varField.type === 'c' ? String(node[varField.name] ?? '').length : (node[varField.name] ?? []).length) : 0;
    if (binary) out.i16(node.type); else out.int(node.type);
    if (embedded && !declared.has(node.type)) {
      declared.add(node.type);
      const base = BASE_SCHEMA[node.type];
      if (!base) {
        if (binary) out.u8(layout.length); else out.int(layout.length);
        shortString(`TYPE_${node.type}`); shortString(`type ${node.type}`);
        for (const f of layout) fieldSpec(f);
      } else {
        const ops = schemaEdit(base, layout);
        if (!ops) { if (binary) out.u8(255); else out.int(255); }
        else {
          if (binary) out.u8(layout.length); else out.int(layout.length);
          for (const [op, f] of ops) { if (binary) out.u8(op.charCodeAt(0)); else out.char(op); if (f) fieldSpec(f); }
          if (binary) out.u8('Z'.charCodeAt(0)); else out.char('Z');
        }
      }
    }
    if (binary) { if (varField) out.i32(count); out.index(node.index); }
    else { if (varField) out.int(count); out.int(node.index); }
    for (const f of layout) {
      const x = node[f.name];
      if (f.n === 0) { out.value(f.type, x); continue; }
      const k = f.n === 1 ? count : f.n;
      if (f.type === 'c') { const s = String(x ?? '').padEnd(k, ' '); for (let j = 0; j < k; j++) out.value('c', s[j]); continue; }
      const blank = f.type === 'p' || f.type === 'u' ? 0 : f.type === 'l' ? false : null;
      for (let j = 0; j < k; j++) out.value(f.type, x?.[j] ?? blank);
    }
  }
  // A binary file starts with its flag sequence (format reference §3.3): no text header.
  if (binary) { out.i16(1); out.index(0); return out.result(); }
  out.int(1); out.parts.push('0');
  return head + out.text() + '\n';
}

/** Field layouts by name, for writing files in another schema's layout (tests, the embedded export). */
export const XT_LAYOUTS = { base: BASE_SCHEMA, variant: (type, schema) => (VARIANTS[type] ?? []).find((v) => v[0] === schema)?.[1] ?? null };
