// DXF floor plans: a small, dependency-free reader (ASCII DXF R12 … R2018) and a
// flattener that walks the model space through block inserts. Pure JS (no DOM,
// no three), so Node tests use it.
//
// readDxf(text | bytes) → { header, layers, blocks, entities }
// flattenDxf(doc, { layers }) → { lines, arcs, texts, inserts } in drawing units, DXF axes (y up)
// dxfUnits(doc, extent, override) → { units, metres, guessed }
// dxfToPlan(flat, metres) → the same in metres and plan axes [x, z] (z = −y, ARCHITECTURE.md §12)
//
// The tokenizer, sections/records split and bulge arcs follow MyArchitecture's
// io/dxf.js; inserts use the same 2D affine matrix [a, b, c, d, e, f]
// (x' = a·x + c·y + e, y' = b·x + d·y + f).

const DEG = Math.PI / 180;

// ───────────────────────── units

/** $INSUNITS code → unit name and metres per unit. */
export const INSUNITS = { 1: ['in', 0.0254], 2: ['ft', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1], 14: ['dm', 0.1] };
export const UNIT_METRES = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048, dm: 0.1 };

/** Unitless drawings: a building is a few to a few hundred metres, so its larger side tells the unit apart. */
export function guessUnits(extent) {
  if (!(extent > 0)) return 'mm';
  if (extent < 300) return 'm';
  if (extent < 3000) return 'cm';
  return 'mm';
}

/** The drawing's unit: `override` ('mm' …), else $INSUNITS, else a guess from the extent. */
export function dxfUnits(doc, extent, override = 'auto') {
  if (override && override !== 'auto' && UNIT_METRES[override]) return { units: override, metres: UNIT_METRES[override], guessed: false };
  const code = doc?.header?.insunits;
  if (INSUNITS[code]) return { units: INSUNITS[code][0], metres: INSUNITS[code][1], guessed: false };
  const units = guessUnits(extent);
  return { units, metres: UNIT_METRES[units], guessed: true };
}

// ───────────────────────── tokens → records

function decodeBytes(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8;
  // Old Korean (and other) drawings: the code page named in the header.
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 20000)))?.[1];
  const label = { 949: 'euc-kr', 932: 'shift_jis', 936: 'gbk', 950: 'big5', 1252: 'windows-1252', 1251: 'windows-1251' }[page] ?? 'euc-kr';
  try { return new TextDecoder(label).decode(bytes); } catch { return utf8; }
}

// ───────────────────────── binary DXF
//
// "AutoCAD Binary DXF\r\n\x1a\0", then group code / value pairs: the code is a 2-byte little-endian
// integer (R13 and later; R12 used 1 byte, 255 = a 2-byte code follows) and the value is typed by its code
// (the DXF reference "group code value types"): strings end with a 0 byte, reals are 8-byte doubles,
// integers 2, 4 or 8 bytes, booleans 1 byte, binary chunks (310–319, 1004) a length byte then the bytes.

export const BINARY_DXF_SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\0';

/** The value type of a group code in a binary DXF: 'str' | 'f64' | 'i16' | 'i32' | 'i64' | 'bool' | 'bin'. */
export function binaryValueType(code) {
  if ((code >= 310 && code <= 319) || code === 1004) return 'bin';
  if ((code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 460 && code <= 469) || (code >= 1010 && code <= 1059)) return 'f64';
  if ((code >= 60 && code <= 79) || (code >= 170 && code <= 179) || (code >= 270 && code <= 289) || (code >= 370 && code <= 389) || (code >= 400 && code <= 409) || (code >= 1060 && code <= 1070)) return 'i16';
  if ((code >= 90 && code <= 99) || (code >= 420 && code <= 429) || (code >= 440 && code <= 459) || code === 1071) return 'i32';
  if (code >= 160 && code <= 169) return 'i64';
  if (code >= 290 && code <= 299) return 'bool';
  return 'str';
}

const bytesOf = (input) => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
};
const startsWithAscii = (bytes, s) => bytes.length >= s.length && [...s].every((ch, i) => bytes[i] === ch.charCodeAt(0));
/** True for the bytes of a binary DXF file. */
export const isBinaryDxf = (input) => { const b = bytesOf(input); return Boolean(b && startsWithAscii(b, 'AutoCAD Binary DXF')); };

/** Binary DXF bytes → [[code, value]] pairs (values as text, like the ASCII reader's). */
function binaryPairs(bytes) {
  const bad = (why) => Object.assign(new Error(`Not a readable binary DXF file: ${why}`), { code: 'dxf-bad' });
  if (bytes.length < 24) throw bad('the file is cut short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = BINARY_DXF_SENTINEL.length;
  // R12 writes 1-byte codes: the first code (0) is followed by "SECTION" at once.
  const twoByte = bytes[i + 1] === 0;
  const raw = []; // [code, value | Uint8Array (strings, decoded below)]
  while (i < bytes.length) {
    let code;
    if (twoByte) { if (i + 2 > bytes.length) break; code = view.getInt16(i, true); i += 2; } else {
      code = bytes[i]; i += 1;
      if (code === 255) { if (i + 2 > bytes.length) break; code = view.getInt16(i, true); i += 2; }
    }
    const type = binaryValueType(code);
    const need = { f64: 8, i16: 2, i32: 4, i64: 8, bool: 1 }[type] ?? 0;
    if (i + need > bytes.length) throw bad(`the value of group ${code} is cut short`);
    if (type === 'str') {
      let end = i;
      while (end < bytes.length && bytes[end] !== 0) end++;
      raw.push([code, bytes.subarray(i, end)]);
      i = end + 1;
    } else if (type === 'bin') {
      const n = bytes[i]; i += 1 + n;
      raw.push([code, '']);
    } else {
      const v = type === 'f64' ? view.getFloat64(i, true) : type === 'i16' ? view.getInt16(i, true) : type === 'i32' ? view.getInt32(i, true) : type === 'i64' ? Number(view.getBigInt64(i, true)) : bytes[i];
      raw.push([code, String(v)]);
      i += need;
    }
    if (code === 0 && raw.at(-1)[1] instanceof Uint8Array && startsWithAscii(raw.at(-1)[1], 'EOF') && raw.at(-1)[1].length === 3) break;
  }
  // Strings: UTF-8 (AutoCAD 2007 and later), else the drawing's code page ($DWGCODEPAGE).
  const latin = new TextDecoder('latin1');
  let label = 'utf-8';
  for (let k = 0; k + 1 < raw.length; k++) {
    if (raw[k][0] === 9 && raw[k][1] instanceof Uint8Array && latin.decode(raw[k][1]) === '$DWGCODEPAGE' && raw[k + 1][1] instanceof Uint8Array) {
      const page = /ANSI_(\d+)/i.exec(latin.decode(raw[k + 1][1]))?.[1];
      label = { 949: 'euc-kr', 932: 'shift_jis', 936: 'gbk', 950: 'big5', 1252: 'windows-1252', 1251: 'windows-1251' }[page] ?? 'utf-8';
      break;
    }
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let fallback = null;
  try { fallback = new TextDecoder(label === 'utf-8' ? 'euc-kr' : label); } catch { fallback = latin; }
  const text = (b) => { try { return utf8.decode(b); } catch { return fallback.decode(b); } };
  const pairs = raw.map(([c, v]) => [c, v instanceof Uint8Array ? text(v) : v]);
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) throw bad('no SECTION found');
  return pairs;
}

/**
 * ASCII DXF text (or [[code, value]] pairs) → binary DXF bytes (2-byte group codes, as AutoCAD R13 and later
 * write them). Used by the sample generator and the tests; the reader above takes the result back.
 */
export function encodeBinaryDxf(input) {
  let pairs = input;
  if (typeof input === 'string') {
    const lines = input.replace(/^﻿/, '').split(/\r\n|\r|\n/);
    pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].trim() !== '') pairs.push([Number(lines[i].trim()), lines[i + 1]]);
  }
  const enc = new TextEncoder();
  const chunks = [enc.encode(BINARY_DXF_SENTINEL)];
  for (const [code, value] of pairs) {
    const type = binaryValueType(code);
    const head = new Uint8Array(2); new DataView(head.buffer).setInt16(0, code, true); chunks.push(head);
    const v = String(value).trim();
    if (type === 'str') { chunks.push(enc.encode(code === 1 || code === 3 ? String(value) : v)); chunks.push(new Uint8Array([0])); continue; }
    if (type === 'bin') { const hex = v.match(/../g) ?? []; chunks.push(new Uint8Array([hex.length, ...hex.map((h) => parseInt(h, 16))])); continue; }
    const size = { f64: 8, i16: 2, i32: 4, i64: 8, bool: 1 }[type];
    const b = new Uint8Array(size); const dv = new DataView(b.buffer);
    const n = Number(v) || 0;
    if (type === 'f64') dv.setFloat64(0, n, true); else if (type === 'i16') dv.setInt16(0, n, true); else if (type === 'i32') dv.setInt32(0, n, true); else if (type === 'i64') dv.setBigInt64(0, BigInt(Math.trunc(n)), true); else b[0] = n ? 1 : 0;
    chunks.push(b);
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Text → [[code, value]] pairs. */
function tokenize(input) {
  const bytes = bytesOf(input);
  if (bytes && startsWithAscii(bytes, 'AutoCAD Binary DXF')) return binaryPairs(bytes);
  let text = bytes ? decodeBytes(bytes) : String(input ?? '');
  // A binary file handed over as a (latin-1) string.
  if (text.startsWith('AutoCAD Binary DXF')) return binaryPairs(Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 255));
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (c === '' && i + 2 >= lines.length) break;
    const code = Number(c);
    if (!Number.isInteger(code)) throw Object.assign(new Error(`Not a DXF file: bad group code "${c.slice(0, 24)}" on line ${i + 1}`), { code: 'dxf-bad' });
    pairs.push([code, lines[i + 1]]);
  }
  if (!pairs.some(([c, v]) => c === 0 && v.trim() === 'SECTION')) throw Object.assign(new Error('Not a DXF file: no SECTION found'), { code: 'dxf-bad' });
  return pairs;
}

function splitSections(pairs) {
  const out = {};
  let cur = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, raw] = pairs[i];
    const v = raw.trim();
    if (c === 0 && v === 'SECTION') {
      const name = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1].trim().toUpperCase() : '';
      cur = out[name] = [];
      i++;
    } else if (c === 0 && v === 'ENDSEC') cur = null;
    else if (c === 0 && v === 'EOF') break;
    else if (cur) cur.push(pairs[i]);
  }
  return out;
}

function toRecords(pairs = []) {
  const recs = [];
  let cur = null;
  for (const [c, v] of pairs) {
    if (c === 0) { cur = { type: v.trim().toUpperCase(), tags: [] }; recs.push(cur); } else if (cur) cur.tags.push([c, v]);
  }
  return recs;
}

const raw = (r, code) => { for (const t of r.tags) if (t[0] === code) return t[1]; return undefined; };
const num = (r, code, d = 0) => { const v = raw(r, code); const n = v === undefined ? NaN : parseFloat(v); return Number.isFinite(n) ? n : d; };
const str = (r, code, d = '') => { const v = raw(r, code); return v === undefined ? d : v.trim(); };

// ───────────────────────── records → entities

/** "\P", "%%c" and formatting codes of TEXT / MTEXT → plain text. */
export function plainText(s) {
  return String(s ?? '')
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[ACFHQTWfhqtw][^;]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*);/g, (m, x) => x.replace(/[#^]/g, '/'))
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, '⌀').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One DXF record → a plain entity object (null for kinds a plan does not need). */
function entityOf(r) {
  const layer = str(r, 8, '0');
  // OCS: 2D entities drawn with the extrusion (0, 0, −1) are mirrored in x.
  const mirrored = num(r, 230, 1) < 0;
  const mx = (x) => (mirrored ? -x : x);
  const base = { type: r.type, layer, color: Number(num(r, 62, 256)) };
  switch (r.type) {
    case 'LINE':
      return { ...base, a: [num(r, 10), num(r, 20)], b: [num(r, 11), num(r, 21)] };
    case 'LWPOLYLINE': {
      const vertices = [];
      for (const [c, v] of r.tags) {
        if (c === 10) vertices.push({ x: mx(parseFloat(v) || 0), y: 0, b: 0 });
        else if (c === 20 && vertices.length) vertices.at(-1).y = parseFloat(v) || 0;
        else if (c === 42 && vertices.length) vertices.at(-1).b = (parseFloat(v) || 0) * (mirrored ? -1 : 1);
      }
      return { ...base, vertices, closed: (num(r, 70) & 1) === 1 };
    }
    case 'POLYLINE': {
      const flags = num(r, 70);
      if (flags & (16 | 64)) return null; // polygon / polyface meshes
      const vertices = (r.vertices ?? []).filter((v) => !(num(v, 70) & 16)).map((v) => ({ x: mx(num(v, 10)), y: num(v, 20), b: num(v, 42) * (mirrored ? -1 : 1) }));
      return { ...base, type: 'LWPOLYLINE', vertices, closed: (flags & 1) === 1 };
    }
    case 'ARC': {
      let a0 = num(r, 50); let a1 = num(r, 51);
      if (mirrored) [a0, a1] = [180 - a1, 180 - a0];
      return { ...base, c: [mx(num(r, 10)), num(r, 20)], r: num(r, 40), a0, a1 };
    }
    case 'CIRCLE':
      return { ...base, c: [mx(num(r, 10)), num(r, 20)], r: num(r, 40) };
    case 'ELLIPSE':
      return { ...base, c: [num(r, 10), num(r, 20)], major: [num(r, 11), num(r, 21)], ratio: num(r, 40, 1), t0: num(r, 41, 0), t1: num(r, 42, Math.PI * 2) };
    case 'SPLINE': {
      const fit = []; const ctrl = [];
      for (const [c, v] of r.tags) {
        if (c === 11) fit.push([parseFloat(v) || 0, 0]); else if (c === 21 && fit.length) fit.at(-1)[1] = parseFloat(v) || 0;
        if (c === 10) ctrl.push([parseFloat(v) || 0, 0]); else if (c === 20 && ctrl.length) ctrl.at(-1)[1] = parseFloat(v) || 0;
      }
      const pts = fit.length >= 2 ? fit : ctrl;
      return pts.length >= 2 ? { ...base, type: 'LWPOLYLINE', vertices: pts.map(([x, y]) => ({ x, y, b: 0 })), closed: (num(r, 70) & 1) === 1 } : null;
    }
    case 'TEXT': case 'MTEXT': case 'ATTRIB': {
      let text = '';
      if (r.type === 'MTEXT') { for (const [c, v] of r.tags) if (c === 3) text += v; text += raw(r, 1) ?? ''; } else text = raw(r, 1) ?? '';
      const p = r.type === 'TEXT' && (num(r, 72) || num(r, 73)) && raw(r, 11) !== undefined ? [num(r, 11), num(r, 21)] : [num(r, 10), num(r, 20)];
      return { ...base, type: 'TEXT', p: [mx(p[0]), p[1]], text: plainText(text), height: num(r, 40, 1), rotation: num(r, 50) };
    }
    case 'INSERT':
      return {
        ...base, name: str(r, 2), p: [mx(num(r, 10)), num(r, 20)], sx: num(r, 41, 1) * (mirrored ? -1 : 1), sy: num(r, 42, 1), rotation: mirrored ? -num(r, 50) : num(r, 50),
        cols: Math.max(1, num(r, 70, 1)), rows: Math.max(1, num(r, 71, 1)), dx: num(r, 44), dy: num(r, 45), attribs: (r.attribs ?? []).map(entityOf).filter(Boolean),
      };
    case 'SOLID': case 'TRACE': {
      const p = [[num(r, 10), num(r, 20)], [num(r, 11), num(r, 21)], [num(r, 13), num(r, 23)], [num(r, 12), num(r, 22)]];
      return { ...base, type: 'LWPOLYLINE', vertices: p.map(([x, y]) => ({ x: mx(x), y, b: 0 })), closed: true, solid: true };
    }
    default:
      return null;
  }
}

/** Attaches VERTEX records to their POLYLINE and ATTRIB records to their INSERT. */
function nest(recs) {
  const out = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === 'POLYLINE') {
      r.vertices = [];
      while (recs[i + 1]?.type === 'VERTEX') r.vertices.push(recs[++i]);
      if (recs[i + 1]?.type === 'SEQEND') i++;
    } else if (r.type === 'INSERT') {
      r.attribs = [];
      while (recs[i + 1]?.type === 'ATTRIB') r.attribs.push(recs[++i]);
      if (recs[i + 1]?.type === 'SEQEND' && (r.attribs.length || num(r, 66) === 1)) i++;
    } else if (r.type === 'SEQEND' || r.type === 'VERTEX') continue;
    out.push(r);
  }
  return out;
}

/** Parses a DXF file (text or bytes). Throws { code: 'dxf-bad' | 'dxf-binary' } for files it cannot read. */
export function readDxf(input) {
  const sections = splitSections(tokenize(input));
  // Header variables: $NAME then its values.
  const header = { insunits: 0, acadver: '', extmin: null, extmax: null };
  let name = null;
  for (const [c, v] of sections.HEADER ?? []) {
    if (c === 9) { name = v.trim(); continue; }
    if (name === '$INSUNITS' && c === 70) header.insunits = parseInt(v, 10) || 0;
    if (name === '$ACADVER' && c === 1) header.acadver = v.trim();
    if (name === '$MEASUREMENT' && c === 70) header.measurement = parseInt(v, 10) || 0;
    if ((name === '$EXTMIN' || name === '$EXTMAX') && (c === 10 || c === 20)) {
      const key = name === '$EXTMIN' ? 'extmin' : 'extmax';
      header[key] ??= [0, 0];
      header[key][c === 10 ? 0 : 1] = parseFloat(v) || 0;
    }
  }
  const layers = new Map();
  for (const r of toRecords(sections.TABLES)) {
    if (r.type !== 'LAYER') continue;
    const layerName = str(r, 2);
    if (!layerName) continue;
    const color = num(r, 62, 7);
    const flags = num(r, 70);
    layers.set(layerName, { name: layerName, color: Math.abs(color), off: color < 0, frozen: (flags & 1) === 1 });
  }
  const blocks = new Map();
  let block = null;
  for (const r of nest(toRecords(sections.BLOCKS))) {
    if (r.type === 'BLOCK') { block = { name: str(r, 2), base: [num(r, 10), num(r, 20)], flags: num(r, 70), entities: [] }; blocks.set(block.name, block); continue; }
    if (r.type === 'ENDBLK') { block = null; continue; }
    const e = block && entityOf(r);
    if (e) block.entities.push(e);
  }
  const entities = [];
  for (const r of nest(toRecords(sections.ENTITIES))) {
    // Paper space entities (code 67 = 1) are title blocks and viewports, not the plan.
    if (num(r, 67) === 1) continue;
    const e = entityOf(r);
    if (e) entities.push(e);
    if (e?.layer && !layers.has(e.layer)) layers.set(e.layer, { name: e.layer, color: 7, off: false, frozen: false });
  }
  return { header, layers, blocks, entities };
}

// ───────────────────────── flattening (blocks → model space)

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const det = (m) => m[0] * m[3] - m[1] * m[2];
const IDENTITY = [1, 0, 0, 1, 0, 0];
const insertMatrix = (e, base) => {
  const a = (e.rotation ?? 0) * DEG;
  const c = Math.cos(a); const s = Math.sin(a);
  // translate(p) · rotate(a) · scale(sx, sy) · translate(−base)
  const m = [c * e.sx, s * e.sx, -s * e.sy, c * e.sy, 0, 0];
  const t = apply(m, [-base[0], -base[1]]);
  return [m[0], m[1], m[2], m[3], t[0] + e.p[0], t[1] + e.p[1]];
};
const isSimilar = (m) => Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-6 * Math.max(1, Math.hypot(m[0], m[1])) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-6 * Math.max(1, Math.hypot(m[0], m[1]) ** 2);

/** Points of an arc (radians, counter-clockwise from a0 by sweep). */
function arcPoints(c, r, a0, sweep, segments = null) {
  const n = segments ?? Math.max(2, Math.ceil(Math.abs(sweep) / (10 * DEG)));
  return Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(a0 + (sweep * i) / n), c[1] + r * Math.sin(a0 + (sweep * i) / n)]);
}

/**
 * Model space → primitives in drawing units: lines [{ a, b, layer }], arcs [{ c, r, p0, p1, sweep, layer, block }]
 * (sweep in radians, counter-clockwise in DXF axes), texts [{ p, text, height, layer }], inserts [{ name, layer, min, max }].
 * `layers` (Set of names or null) keeps only those; layers switched off or frozen in the drawing are skipped.
 * Entities on layer "0" inside a block take the layer of the insert (AutoCAD's rule).
 */
export function flattenDxf(doc, { layers = null, keepHidden = false } = {}) {
  const out = { lines: [], arcs: [], texts: [], inserts: [] };
  const visibleLayer = (name) => {
    const info = doc.layers.get(name);
    if (!keepHidden && info && (info.off || info.frozen)) return false;
    return !layers || layers.has(name);
  };
  const line = (a, b, layer, block) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.lines.push({ a, b, layer, block }); };
  const polyline = (pts, closed, layer, block) => { for (let i = 0; i + 1 < pts.length; i++) line(pts[i], pts[i + 1], layer, block); if (closed && pts.length > 2) line(pts.at(-1), pts[0], layer, block); };
  const arc = (m, c, r, a0, sweep, layer, block) => {
    if (!(r > 0)) return;
    if (!isSimilar(m)) { polyline(arcPoints(c, r, a0, sweep).map((p) => apply(m, p)), false, layer, block); return; }
    const k = Math.hypot(m[0], m[1]);
    let p0 = apply(m, [c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)]);
    let p1 = apply(m, [c[0] + r * Math.cos(a0 + sweep), c[1] + r * Math.sin(a0 + sweep)]);
    // A mirroring insert turns a counter-clockwise arc clockwise: swap the ends to keep the sweep positive.
    if (det(m) < 0) [p0, p1] = [p1, p0];
    out.arcs.push({ c: apply(m, c), r: r * k, p0, p1, sweep, layer, block });
  };
  const walk = (entities, m, depth, parentLayer, block) => {
    if (depth > 16) return;
    for (const e of entities) {
      const layer = parentLayer && e.layer === '0' ? parentLayer : e.layer;
      if (e.type !== 'INSERT' && !visibleLayer(layer)) continue;
      switch (e.type) {
        case 'LINE': line(apply(m, e.a), apply(m, e.b), layer, block); break;
        case 'LWPOLYLINE': {
          const v = e.vertices;
          const count = e.closed ? v.length : v.length - 1;
          for (let i = 0; i < count; i++) {
            const p = v[i]; const q = v[(i + 1) % v.length];
            if (Math.abs(p.b) > 1e-9) {
              // Bulge = tan(θ/4) of the included angle θ, positive counter-clockwise.
              const dx = q.x - p.x; const dy = q.y - p.y;
              const k = (1 - p.b * p.b) / (4 * p.b);
              const c = [(p.x + q.x) / 2 - dy * k, (p.y + q.y) / 2 + dx * k];
              const r = Math.hypot(p.x - c[0], p.y - c[1]);
              const sweep = 4 * Math.atan(p.b);
              const a0 = Math.atan2(p.y - c[1], p.x - c[0]);
              if (sweep > 0) arc(m, c, r, a0, sweep, layer, block);
              else arc(m, c, r, a0 + sweep, -sweep, layer, block);
            } else line(apply(m, [p.x, p.y]), apply(m, [q.x, q.y]), layer, block);
          }
          break;
        }
        case 'ARC': {
          let sweep = (e.a1 - e.a0) * DEG;
          while (sweep <= 0) sweep += Math.PI * 2;
          arc(m, e.c, e.r, e.a0 * DEG, sweep, layer, block);
          break;
        }
        case 'CIRCLE': polyline(arcPoints(e.c, e.r, 0, Math.PI * 2, 24).map((p) => apply(m, p)), false, layer, block); break;
        case 'ELLIPSE': {
          const minor = [-e.major[1] * e.ratio, e.major[0] * e.ratio];
          let sweep = e.t1 - e.t0; while (sweep <= 0) sweep += Math.PI * 2;
          const n = Math.max(4, Math.ceil(sweep / (10 * DEG)));
          const pts = Array.from({ length: n + 1 }, (_, i) => { const t = e.t0 + (sweep * i) / n; return [e.c[0] + e.major[0] * Math.cos(t) + minor[0] * Math.sin(t), e.c[1] + e.major[1] * Math.cos(t) + minor[1] * Math.sin(t)]; });
          polyline(pts.map((p) => apply(m, p)), false, layer, block);
          break;
        }
        case 'TEXT': if (e.text) out.texts.push({ p: apply(m, e.p), text: e.text, height: e.height * Math.hypot(m[0], m[1]), layer }); break;
        case 'INSERT': {
          const def = doc.blocks.get(e.name);
          if (!def || /^\*[DT]/i.test(e.name)) break; // dimension and table blocks are annotations
          for (let col = 0; col < e.cols; col++) {
            for (let row = 0; row < e.rows; row++) {
              const shifted = { ...e, p: [e.p[0] + col * e.dx, e.p[1] + row * e.dy] };
              const mm = mul(m, insertMatrix(shifted, def.base));
              const before = { lines: out.lines.length, arcs: out.arcs.length };
              walk(def.entities, mm, depth + 1, layer, block ?? e.name);
              const pts = [...out.lines.slice(before.lines).flatMap((l) => [l.a, l.b]), ...out.arcs.slice(before.arcs).flatMap((a) => [a.p0, a.p1, a.c])];
              if (pts.length && visibleLayer(layer)) out.inserts.push({ name: e.name, layer, min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] });
            }
          }
          for (const a of e.attribs ?? []) if (a.text && visibleLayer(a.layer)) out.texts.push({ p: apply(m, a.p), text: a.text, height: a.height, layer: a.layer });
          break;
        }
        default: break;
      }
    }
  };
  walk(doc.entities, IDENTITY, 0, null, null);
  return out;
}

/** Extent of flattened primitives: { min, max, size } (drawing units). */
export function extentOf(flat) {
  const pts = [...flat.lines.flatMap((l) => [l.a, l.b]), ...flat.arcs.flatMap((a) => [a.p0, a.p1])];
  if (!pts.length) return { min: [0, 0], max: [0, 0], size: 0 };
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { min: [x0, y0], max: [x1, y1], size: Math.max(x1 - x0, y1 - y0) };
}

/** Drawing units, y up → metres, plan axes [x, z] (z = −y): the plan looks the same seen from above, north up. */
export function dxfToPlan(flat, metres) {
  const p = ([x, y]) => [x * metres, -y * metres];
  return {
    lines: flat.lines.map((l) => ({ ...l, a: p(l.a), b: p(l.b) })),
    arcs: flat.arcs.map((a) => ({ ...a, c: p(a.c), r: a.r * metres, p0: p(a.p0), p1: p(a.p1) })),
    texts: flat.texts.map((t) => ({ ...t, p: p(t.p), height: t.height * metres })),
    inserts: flat.inserts.map((i) => ({ ...i, min: [i.min[0] * metres, -i.max[1] * metres], max: [i.max[0] * metres, -i.min[1] * metres] })),
  };
}

/** Per layer: number of lines / arcs / texts (for the import options). */
export function layerStats(doc) {
  const flat = flattenDxf(doc, { keepHidden: true });
  const stats = new Map();
  const bump = (layer, key) => { const s = stats.get(layer) ?? { name: layer, lines: 0, arcs: 0, texts: 0 }; s[key] += 1; stats.set(layer, s); };
  for (const l of flat.lines) bump(l.layer, 'lines');
  for (const a of flat.arcs) bump(a.layer, 'arcs');
  for (const t of flat.texts) bump(t.layer, 'texts');
  return [...stats.values()].map((s) => ({ ...s, off: Boolean(doc.layers.get(s.name)?.off || doc.layers.get(s.name)?.frozen) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Layers a plan import skips by default: dimensions, annotation, furniture, hatches, grids, title blocks, MEP. */
export const SKIP_LAYER = /dim|치수|anno|note|title|도곽|tblk|hatch|해치|patt|grid|그리드|축선|center|중심선|furn|가구|equip|elec|전기|plumb|설비|mech|위생|tag|symbol|기호|defpoints|viewport|vport|area|면적/i;
