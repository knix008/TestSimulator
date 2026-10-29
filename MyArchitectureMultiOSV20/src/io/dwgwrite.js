// DWG export: AutoCAD 2000 (AC1015) drawings, written without any external
// library, following the Open Design Alliance "Open Design Specification
// for .dwg files" (R2000 layout) and checked against drawings saved by
// AutoCAD itself.
//
// The writer converts an ASCII DXF (any release R12 … R2018, such as the
// output of exportDxf in dxf.js) into an R2000 DWG with the same content,
// so the plan export is written once (as DXF) and both formats agree.
//
// File layout, in file order:
//
//   0x00  file header: "AC1015", maintenance and code page bytes, six
//         section locator records (number, address, size), CRC-16 of the
//         bytes before it (seed 0xC0C1 — AutoCAD writes it without the XOR
//         the ODA document describes), end sentinel.
//   0x61  AuxHeader (section 5): versions, save counters, dates, handle seed.
//         Thumbnail: begin sentinel, empty image list, end sentinel (its
//         address is in the file header at 0x0D).
//         Header variables (section 0, "AcDb:Header"): sentinel, RL size,
//         every R2000 variable as a bit stream in the fixed order, CRC-16,
//         end sentinel.
//         Classes (section 1): sentinel, RL size, the class records of the
//         non-fixed object types used (DICTIONARYWDFLT, PLACEHOLDER, LAYOUT),
//         CRC-16, end sentinel, RL 0x0DCA.
//         Objects: each one is an MS (modular short) byte size, the object's
//         bit stream — type, RL bit size of the data part, handle, extended
//         data, common data, own data, then the handle stream (owner,
//         reactors, xdictionary, references) — and a CRC-16.
//         Object map (section 2, "AcDb:Handles"): (handle delta, file offset
//         delta) pairs in pages of at most 2032 bytes, each with a big-endian
//         size and CRC; an empty page ends the map.
//         ObjFreeSpace (section 3): object count, date, objects address.
//         Second file header: sentinel, a copy of the locators and the 14
//         handles of the control objects and main dictionaries, CRC, sentinel.
//         Template (section 4): MEASUREMENT.
//
// Objects written: the nine table control objects (+ VX), their entries
// (layers, linetypes BYBLOCK/BYLAYER/CONTINUOUS + the DXF ones, text styles,
// APPID ACAD …, DIMSTYLE Standard, VPORT *ACTIVE zoomed to the extents),
// block headers *MODEL_SPACE / *PAPER_SPACE and the DXF blocks (each with
// BLOCK … entities … ENDBLK), the named object dictionary with ACAD_GROUP,
// ACAD_LAYOUT (layouts Model and Layout1), ACAD_MLINESTYLE (STANDARD),
// ACAD_PLOTSETTINGS and ACAD_PLOTSTYLENAME (Normal placeholder).
//
// Entities: LINE, POINT, CIRCLE, ARC, ELLIPSE, TEXT, ATTRIB, ATTDEF, MTEXT,
// INSERT / MINSERT (with attributes), RAY, XLINE, LWPOLYLINE (DXF POLYLINEs, 2D and 3D,
// become LWPOLYLINEs), SOLID, TRACE, 3DFACE, SPLINE, HATCH; a DIMENSION
// becomes an INSERT of its (anonymous) geometry block. Other entity types
// are skipped and reported through opts.onSkip(type, count).
//
// Text: R2000 strings are 8-bit in the drawing code page, here ANSI_1252.
// Characters outside it are written as \U+XXXX (AutoCAD and dwg.js decode
// that), DXF \U+XXXX escapes of characters inside it become real ones.
//
// Angles in DWG are radians (DXF: degrees) — converted on the way.

import { exportDxf, hexToAci } from "./dxf.js";
import { crc16 } from "./dwg.js";
import { isBinaryDxf, readBinaryDxf } from "./dxfbin.js";

const DEG = Math.PI / 180;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ================================================================ text

// Windows-1252 bytes 0x80 … 0x9F (the rest of 0xA0 … 0xFF is Latin-1).
const CP1252_80 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
const TO_1252 = new Map([...CP1252_80].map((ch, i) => [ch.charCodeAt(0), 0x80 + i]));
const cp1252 = (c) => (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : TO_1252.has(c) ? TO_1252.get(c) : -1);

/** String → bytes in the drawing code page (ANSI_1252), others as \U+XXXX. */
export function encodeDwgText(s) {
  const out = [];
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 0) continue;
    const b = cp1252(c);
    if (b >= 0) out.push(b);
    else for (const ch of `\\U+${c.toString(16).toUpperCase().padStart(4, "0")}`) out.push(ch.charCodeAt(0));
  }
  return out;
}

// A DXF string: \U+XXXX of a character the code page has → that character.
function dxfString(s) {
  return String(s ?? "").replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => {
    const c = parseInt(h, 16);
    return c >= 0x20 && cp1252(c) >= 0 ? String.fromCharCode(c) : m;
  });
}

// ================================================================ bit writer

const F64 = new DataView(new ArrayBuffer(8));

/**
 * Writes DWG bit codes, most significant bit first, into a growing buffer
 * (the mirror image of BitReader in dwg.js).
 */
export class DwgBitWriter {
  constructor(size = 256) { this.buf = new Uint8Array(size); this.pos = 0; }
  get length() { return this.pos; }
  grow(nbits) {
    const need = (this.pos + nbits + 7) >> 3;
    if (need > this.buf.length) { const b = new Uint8Array(Math.max(need, this.buf.length * 2)); b.set(this.buf); this.buf = b; }
  }
  B(v) { this.grow(1); if (v) this.buf[this.pos >> 3] |= 0x80 >> (this.pos & 7); this.pos++; return this; }
  bits(v, k) { for (let i = k - 1; i >= 0; i--) this.B((v >>> i) & 1); return this; }
  BB(v) { return this.bits(v, 2); }
  RC(v) {
    v &= 255;
    this.grow(8);
    const i = this.pos >> 3, s = this.pos & 7;
    if (!s) this.buf[i] = v; else { this.buf[i] |= v >> s; this.buf[i + 1] |= (v << (8 - s)) & 255; }
    this.pos += 8;
    return this;
  }
  RS(v) { return this.RC(v).RC(v >> 8); }
  RL(v) { v >>>= 0; return this.RS(v & 0xffff).RS(v >>> 16); }
  RD(v) { F64.setFloat64(0, fin(+v), true); for (let i = 0; i < 8; i++) this.RC(F64.getUint8(i)); return this; }
  RD2(p) { return this.RD(p[0]).RD(p[1]); }
  /** Bit short: 10 → 0, 11 → 256, 01 + byte, 00 + short. */
  BS(v) {
    v = Math.round(fin(+v));
    if (v === 0) return this.BB(2);
    if (v === 256) return this.BB(3);
    if (v > 0 && v < 256) return this.BB(1).RC(v);
    return this.BB(0).RS(v & 0xffff);
  }
  /** Bit long: 10 → 0, 01 + byte, 00 + long. */
  BL(v) {
    v = Math.round(fin(+v));
    if (v === 0) return this.BB(2);
    if (v > 0 && v < 256) return this.BB(1).RC(v);
    return this.BB(0).RL(v >>> 0);
  }
  /** Bit double: 10 → 0.0, 01 → 1.0, 00 + double. */
  BD(v) {
    v = fin(+v);
    if (v === 0 && !Object.is(v, -0)) return this.BB(2);
    if (v === 1) return this.BB(1);
    return this.BB(0).RD(v);
  }
  BD2(p) { return this.BD(p[0]).BD(p[1]); }
  BD3(p) { return this.BD(p[0]).BD(p[1]).BD(p[2] || 0); }
  /** Bit double with default: 00 = the default, 11 + double. */
  DD(v, def) {
    v = fin(+v);
    F64.setFloat64(0, v, true);
    const a = F64.getBigUint64(0, true);
    F64.setFloat64(0, def, true);
    return a === F64.getBigUint64(0, true) ? this.BB(0) : this.BB(3).RD(v);
  }
  /** Bit thickness (R2000+): 1 → 0.0, else 0 + BD. */
  BT(t) { t = fin(+t); return t === 0 ? this.B(1) : this.B(0).BD(t); }
  /** Bit extrusion (R2000+): 1 → (0, 0, 1), else 0 + 3BD. */
  BE(e) { return !e || (e[0] === 0 && e[1] === 0 && e[2] === 1) ? this.B(1) : this.B(0).BD3(e); }
  /** Handle reference: 4-bit code, 4-bit byte count, big-endian bytes. */
  H(code, v = 0) {
    const b = [];
    for (let x = Math.max(0, Math.floor(v)); x > 0; x = Math.floor(x / 256)) b.unshift(x % 256);
    this.bits(code, 4).bits(b.length, 4);
    for (const x of b) this.RC(x);
    return this;
  }
  /** 8-bit text: bit short length, then the bytes (no terminating zero). */
  T(s) { const b = encodeDwgText(s); this.BS(b.length); for (const x of b) this.RC(x); return this; }
  /** Colour of a table object or an R2000 entity (index only). */
  CMC(i) { return this.BS(i); }
  /** Overwrite k bits at bit position `at` (used to patch sizes). */
  setBits(at, v, k) {
    for (let i = 0; i < k; i++) {
      const p = at + i, m = 0x80 >> (p & 7);
      if ((v >>> (k - 1 - i)) & 1) this.buf[p >> 3] |= m; else this.buf[p >> 3] &= ~m;
    }
  }
  patchRL(at, v) {
    v >>>= 0;
    const bytes = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
    bytes.forEach((b, i) => this.setBits(at + i * 8, b, 8));
  }
  align() { this.pos = (this.pos + 7) & ~7; return this; }
  bytes() { return this.buf.slice(0, (this.pos + 7) >> 3); }
}

// ================================================================ DXF reading

const DECODERS = { 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253", 1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256", 1257: "windows-1257", 1258: "windows-1258" };

// Text (or bytes) → [[code, value]] pairs.
function dxfPairs(input) {
  let text = input;
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (bytes && isBinaryDxf(bytes)) return readBinaryDxf(bytes).map(([c, v]) => [c, String(v)]);
  if (bytes) {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
      const m = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/i.exec(new TextDecoder("latin1").decode(bytes.subarray(0, 65536)));
      try { text = new TextDecoder(DECODERS[m && m[1]] || "windows-1252").decode(bytes); } catch { text = new TextDecoder("windows-1252").decode(bytes); }
    }
  }
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (c === "" && i + 2 >= lines.length) break;
    const code = Number(c);
    if (!Number.isInteger(code)) throw new Error(`Not a DXF file: bad group code "${c.slice(0, 24)}" on line ${i + 1}`);
    pairs.push([code, lines[i + 1]]);
  }
  if (!pairs.some(([c, v]) => c === 0 && v.trim() === "SECTION")) throw new Error("Not a DXF file: no SECTION found");
  return pairs;
}

// Pairs → {HEADER: records…} with each section split into records at code 0.
function dxfSections(pairs) {
  const out = {};
  let cur = null, rec = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, raw] = pairs[i];
    const v = c === 0 ? raw.trim().toUpperCase() : raw;
    if (c === 0 && v === "SECTION") {
      const name = pairs[i + 1] && pairs[i + 1][0] === 2 ? pairs[i + 1][1].trim().toUpperCase() : "";
      cur = out[name] = { pairs: [], recs: [] };
      rec = null;
      i++;
    } else if (c === 0 && v === "ENDSEC") cur = null;
    else if (c === 0 && v === "EOF") break;
    else if (cur) {
      cur.pairs.push([c, raw]);
      if (c === 0) { rec = { type: v, tags: [] }; cur.recs.push(rec); } else if (rec) rec.tags.push([c, raw]);
    }
  }
  return out;
}

// Tag access (first occurrence).
const raw = (r, c) => { for (const t of r.tags) if (t[0] === c) return t[1]; return undefined; };
const num = (r, c, d = 0) => { const v = raw(r, c); const n = v === undefined ? NaN : parseFloat(v); return Number.isFinite(n) ? n : d; };
const int = (r, c, d = 0) => Math.trunc(num(r, c, d));
const str = (r, c, d = "") => { const v = raw(r, c); return v === undefined ? d : v.trim(); };
const has = (r, c) => raw(r, c) !== undefined;
const pt3 = (r, c, d = [0, 0, 0]) => [num(r, c, d[0]), num(r, c + 10, d[1]), num(r, c + 20, d[2])];
const ext3 = (r) => { const e = [num(r, 210, 0), num(r, 220, 0), num(r, 230, 1)]; return Math.hypot(...e) > 0 ? e : [0, 0, 1]; };

// VERTEX records go with their POLYLINE, ATTRIB records with their INSERT.
function nest(recs) {
  const out = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === "POLYLINE") {
      r.vertices = [];
      while (recs[i + 1] && recs[i + 1].type === "VERTEX") r.vertices.push(recs[++i]);
      if (recs[i + 1] && recs[i + 1].type === "SEQEND") i++;
    } else if (r.type === "INSERT") {
      r.attribs = [];
      while (recs[i + 1] && recs[i + 1].type === "ATTRIB") r.attribs.push(recs[++i]);
      if (recs[i + 1] && recs[i + 1].type === "SEQEND" && (r.attribs.length || int(r, 66) === 1)) i++;
    } else if (r.type === "SEQEND" || r.type === "VERTEX" || r.type === "ATTRIB") continue;
    out.push(r);
  }
  return out;
}

// $NAME → {code: value} (first value of each code).
function headerVars(pairs = []) {
  const vars = {};
  let cur = null;
  for (const [c, v] of pairs) {
    if (c === 9) cur = vars[v.trim().toUpperCase()] = {};
    else if (cur && !(c in cur)) cur[c] = v.trim();
  }
  return vars;
}

// ================================================================ constants

// Object types (fixed numbers below 500; classes from 500).
const T = {
  TEXT: 1, ATTRIB: 2, ATTDEF: 3, BLOCK: 4, ENDBLK: 5, SEQEND: 6, INSERT: 7, MINSERT: 8,
  ARC: 17, CIRCLE: 18, LINE: 19, POINT: 27, FACE3D: 28, SOLID: 31, TRACE: 32, ELLIPSE: 35, SPLINE: 36, RAY: 40, XLINE: 41,
  DICTIONARY: 42, MTEXT: 44,
  BLOCK_CONTROL: 48, BLOCK_HEADER: 49, LAYER_CONTROL: 50, LAYER: 51, STYLE_CONTROL: 52, STYLE: 53,
  LTYPE_CONTROL: 56, LTYPE: 57, VIEW_CONTROL: 60, UCS_CONTROL: 62, VPORT_CONTROL: 64, VPORT: 65,
  APPID_CONTROL: 66, APPID: 67, DIMSTYLE_CONTROL: 68, DIMSTYLE: 69, VX_CONTROL: 70, MLINESTYLE: 73,
  LWPOLYLINE: 77, HATCH: 78,
  DICTIONARYWDFLT: 500, PLACEHOLDER: 501, LAYOUT: 502,
};
const CLASSES = [
  [T.DICTIONARYWDFLT, "AcDbDictionaryWithDefault", "ACDBDICTIONARYWDFLT"],
  [T.PLACEHOLDER, "AcDbPlaceHolder", "ACDBPLACEHOLDER"],
  [T.LAYOUT, "AcDbLayout", "LAYOUT"],
];

// Fixed handles of the objects every drawing has (as AutoCAD numbers them).
const H = {
  BLOCK_CONTROL: 0x1, LAYER_CONTROL: 0x2, STYLE_CONTROL: 0x3, LTYPE_CONTROL: 0x5, VIEW_CONTROL: 0x6,
  UCS_CONTROL: 0x7, VPORT_CONTROL: 0x8, APPID_CONTROL: 0x9, DIMSTYLE_CONTROL: 0xa, VX_CONTROL: 0xb,
  NOD: 0xc, GROUP_DICT: 0xd, PLOTSTYLE_DICT: 0xe, NORMAL: 0xf, LAYER0: 0x10, STANDARD: 0x11, ACAD: 0x12,
  BYBLOCK: 0x14, BYLAYER: 0x15, CONTINUOUS: 0x16, MLSTYLE_DICT: 0x17, MLSTYLE: 0x18, PLOTSETTINGS_DICT: 0x19,
  LAYOUT_DICT: 0x1a, PS: 0x1b, PS_BEGIN: 0x1c, PS_END: 0x1d, LAYOUT1: 0x1e, MS: 0x1f, MS_BEGIN: 0x20,
  MS_END: 0x21, LAYOUT_MODEL: 0x22, DIMSTYLE: 0x27, VPORT: 0x29,
};
const FIRST_FREE_HANDLE = 0x30;

// Handle reference codes.
const SOFT_OWN = 2, HARD_OWN = 3, SOFT_PTR = 4, HARD_PTR = 5;

const SENTINEL = {
  HEADER_END: [0x95, 0xa0, 0x4e, 0x28, 0x99, 0x82, 0x1a, 0xe5, 0x5e, 0x41, 0xe0, 0x5f, 0x9d, 0x3a, 0x4d, 0x00],
  THUMB_BEGIN: [0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f, 0x9d, 0x44, 0x10, 0x2b],
  THUMB_END: [0xe0, 0xda, 0x92, 0xf8, 0x2b, 0xc9, 0xd7, 0xd7, 0x62, 0xa8, 0x35, 0xc0, 0x62, 0xbb, 0xef, 0xd4],
  VARS_BEGIN: [0xcf, 0x7b, 0x1f, 0x23, 0xfd, 0xde, 0x38, 0xa9, 0x5f, 0x7c, 0x68, 0xb8, 0x4e, 0x6d, 0x33, 0x5f],
  VARS_END: [0x30, 0x84, 0xe0, 0xdc, 0x02, 0x21, 0xc7, 0x56, 0xa0, 0x83, 0x97, 0x47, 0xb1, 0x92, 0xcc, 0xa0],
  CLASS_BEGIN: [0x8d, 0xa1, 0xc4, 0xb8, 0xc4, 0xa9, 0xf8, 0xc5, 0xc0, 0xdc, 0xf4, 0x5f, 0xe7, 0xcf, 0xb6, 0x8a],
  CLASS_END: [0x72, 0x5e, 0x3b, 0x47, 0x3b, 0x56, 0x07, 0x3a, 0x3f, 0x23, 0x0b, 0xa0, 0x18, 0x30, 0x49, 0x75],
  SECOND_BEGIN: [0xd4, 0x7b, 0x21, 0xce, 0x28, 0x93, 0x9f, 0xbf, 0x53, 0x24, 0x40, 0x09, 0x12, 0x3c, 0xaa, 0x01],
  SECOND_END: [0x2b, 0x84, 0xde, 0x31, 0xd7, 0x6c, 0x60, 0x40, 0xac, 0xdb, 0xbf, 0xf6, 0xed, 0xc3, 0x55, 0xfe],
};

// Writer identification (as AutoCAD 2000 writes it: version 0x17, maintenance 6).
const DWG_VERSION = 0x17, MAINT_VERSION = 0x06, CODEPAGE = 30; // 30 = ANSI_1252

// DXF lineweights (1/100 mm) → DWG lineweight index; −1/−2/−3 = by layer/block/default.
const LWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
function lwIndex(lw, def) {
  if (!Number.isFinite(lw)) return def;
  if (lw === -1) return 29;
  if (lw === -2) return 30;
  if (lw < 0) return 31;
  let best = 0;
  LWEIGHTS.forEach((v, i) => { if (Math.abs(v - lw) < Math.abs(LWEIGHTS[best] - lw)) best = i; });
  return best;
}

// Julian day and milliseconds of a date (AutoCAD TDCREATE / TDUPDATE).
function julian(date) {
  const ms = date.getTime() - date.getTimezoneOffset() * 60000; // local time, as AutoCAD keeps it
  const day = Math.floor(ms / 86400000);
  return [day + 2440588, ms - day * 86400000];
}

function guid() {
  const c = globalThis.crypto;
  const u = c && c.randomUUID ? c.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => ((Math.random() * 16) | (ch === "y" ? 8 : 0)).toString(16));
  return `{${u.toUpperCase()}}`;
}

// ================================================================ the writer

/**
 * Convert an ASCII DXF drawing (text, or its bytes) into an AutoCAD 2000
 * DWG. → Uint8Array.
 * opts.onSkip(type, count) is called for every entity type that could not
 * be written; opts.date sets the creation/update date.
 */
export function dxfToDwg(dxfText, opts = {}) {
  const w = new DwgWriter(dxfSections(dxfPairs(dxfText)), opts);
  const bytes = w.build();
  if (opts.onSkip) for (const [type, n] of w.skipped) opts.onSkip(type, n);
  return bytes;
}

/** Export one level of a project as an AutoCAD 2000 DWG (millimetres). */
// The R2000 DXF (blocks/inserts, LWPOLYLINE, MTEXT …) maps one to one.
export function exportDwg(project, opts = {}) {
  return dxfToDwg(exportDxf(project, { ...opts, version: "2000" }), opts);
}

class DwgWriter {
  constructor(sections, opts) {
    this.sec = sections;
    this.opts = opts;
    this.vars = headerVars(sections.HEADER && sections.HEADER.pairs);
    this.objects = new Map(); // handle → bytes
    this.next = FIRST_FREE_HANDLE;
    this.skipped = new Map();
    this.bbox = null;
  }

  alloc() { return this.next++; }
  skip(type) { this.skipped.set(type, (this.skipped.get(type) || 0) + 1); }
  put(h, bytes) { this.objects.set(h, bytes); }

  // Header variable from the DXF ($NAME, group code) or a default.
  hv(name, code, def) {
    const v = this.vars[name];
    if (!v || v[code] === undefined) return def;
    if (typeof def === "string") return v[code];
    const n = parseFloat(v[code]);
    return Number.isFinite(n) ? n : def;
  }
  hvPt(name, def) { return [this.hv(name, 10, def[0]), this.hv(name, 20, def[1]), this.hv(name, 30, def[2] || 0)]; }

  // ---------------------------------------------------------------- tables
  tables() {
    const recs = (this.sec.TABLES && this.sec.TABLES.recs) || [];
    const of = (type) => recs.filter((r) => r.type === type);

    // Linetypes: BYBLOCK, BYLAYER, CONTINUOUS (fixed) + the DXF ones.
    this.ltypes = new Map();
    const lt = (name, h, desc = "", dashes = []) => this.ltypes.set(name.toUpperCase(), { name, h, desc, dashes });
    lt("ByBlock", H.BYBLOCK); lt("ByLayer", H.BYLAYER); lt("Continuous", H.CONTINUOUS, "Solid line");
    for (const r of of("LTYPE")) {
      const name = dxfString(str(r, 2));
      if (!name) continue;
      const key = name.toUpperCase();
      const dashes = r.tags.filter(([c]) => c === 49).map(([, v]) => fin(parseFloat(v)));
      const desc = dxfString(str(r, 3));
      if (key === "BYBLOCK" || key === "BYLAYER") continue;
      if (key === "CONTINUOUS") { this.ltypes.get(key).desc = desc || "Solid line"; this.ltypes.get(key).name = name; continue; }
      if (!this.ltypes.has(key)) lt(name, this.alloc(), desc, dashes);
    }

    // Text styles: STANDARD (fixed) + the DXF ones.
    this.styles = new Map();
    const styleOf = (r, name, h) => ({
      name, h, flags: r ? int(r, 70) : 0, height: r ? num(r, 40) : 0, width: r ? num(r, 41, 1) || 1 : 1, oblique: r ? num(r, 50) : 0,
      gen: r ? int(r, 71) : 0, last: r ? num(r, 42, 2.5) : 2.5, font: r ? dxfString(str(r, 3, "txt")) : "txt", bigfont: r ? dxfString(str(r, 4)) : "",
    });
    const std = of("STYLE").find((r) => str(r, 2).toUpperCase() === "STANDARD");
    this.styles.set("STANDARD", styleOf(std, std ? dxfString(str(std, 2)) : "Standard", H.STANDARD));
    for (const r of of("STYLE")) {
      const name = dxfString(str(r, 2));
      const key = name.toUpperCase();
      if (key === "STANDARD" || this.styles.has(key) || (!name && !(int(r, 70) & 1))) continue;
      this.styles.set(key || `*SHAPE${this.styles.size}`, styleOf(r, name, this.alloc()));
    }

    // Layers: 0 (fixed) + the DXF ones.
    this.layers = new Map();
    const layerOf = (r, name, h) => {
      const c = r ? int(r, 62, 7) : 7;
      return {
        name, h, color: Math.abs(c) || 7, off: c < 0, flags: r ? int(r, 70) : 0,
        ltype: r ? dxfString(str(r, 6, "CONTINUOUS")) : "CONTINUOUS",
        lw: lwIndex(r && has(r, 370) ? num(r, 370) : -3, 31), plot: r && has(r, 290) ? int(r, 290) !== 0 : true,
      };
    };
    const l0 = of("LAYER").find((r) => str(r, 2) === "0");
    this.layers.set("0", layerOf(l0, "0", H.LAYER0));
    for (const r of of("LAYER")) {
      const name = dxfString(str(r, 2));
      const key = name.toUpperCase();
      if (!name || this.layers.has(key)) continue;
      this.layers.set(key, layerOf(r, name, this.alloc()));
    }

    // Registered applications: ACAD (fixed) + the DXF ones.
    this.appids = new Map([["ACAD", { name: "ACAD", h: H.ACAD }]]);
    for (const r of of("APPID")) {
      const name = dxfString(str(r, 2));
      if (name && !this.appids.has(name.toUpperCase())) this.appids.set(name.toUpperCase(), { name, h: this.alloc() });
    }
  }

  // Layer by name (created on first use when the DXF has no table entry).
  layer(name) {
    const n = dxfString(String(name || "0").trim()) || "0";
    const key = n.toUpperCase();
    if (!this.layers.has(key)) this.layers.set(key, { name: n, h: this.alloc(), color: 7, off: false, flags: 0, ltype: "CONTINUOUS", lw: 31, plot: true });
    return this.layers.get(key).h;
  }
  styleHandle(name) {
    const s = this.styles.get(dxfString(String(name || "")).trim().toUpperCase());
    return s ? s.h : H.STANDARD;
  }

  // ---------------------------------------------------------------- blocks
  blocks() {
    this.blockList = [];
    this.blockByName = new Map();
    const recs = (this.sec.BLOCKS && this.sec.BLOCKS.recs) || [];
    let cur = null;
    for (const r of recs) {
      if (r.type === "BLOCK") {
        const name = dxfString(str(r, 2) || str(r, 3));
        cur = { name, rec: r, recs: [] };
        const key = name.toUpperCase();
        // Layout blocks: model / paper space are written by the writer itself.
        if (/^\*(MODEL|PAPER)_SPACE\d*$/.test(key) || !name || this.blockByName.has(key)) { cur.ignore = true; continue; }
        this.blockByName.set(key, cur);
        this.blockList.push(cur);
      } else if (r.type === "ENDBLK") cur = null;
      else if (cur) cur.recs.push(r);
    }
    // Anonymous dimension blocks become anonymous *U blocks (they are inserted).
    const names = new Set(this.blockList.map((b) => b.name.toUpperCase()));
    let u = 0;
    for (const b of this.blockList) {
      const flags = int(b.rec, 70);
      b.anonymous = (flags & 1) !== 0 || b.name.startsWith("*");
      b.xref = (flags & 4) !== 0;
      b.overlay = (flags & 8) !== 0;
      b.path = dxfString(str(b.rec, 1));
      b.base = pt3(b.rec, 10);
      b.dname = b.name;
      if (/^\*D/i.test(b.name)) {
        let n;
        do n = `*U${++u}`; while (names.has(n.toUpperCase()));
        names.add(n.toUpperCase());
        b.dname = n;
      }
      b.h = this.alloc();
      b.inserts = [];
    }
  }

  // ---------------------------------------------------------------- entities

  // Common entity properties of a DXF record.
  style(r, space) {
    let color = int(r, 62, 256);
    if (!has(r, 62) && has(r, 420)) color = hexToAci(`#${(parseInt(raw(r, 420), 10) & 0xffffff).toString(16).padStart(6, "0")}`);
    color = Math.abs(color);
    if (color > 256) color = 256;
    const ltName = dxfString(str(r, 6)).toUpperCase();
    let ltFlags = 0, ltH = 0;
    if (ltName === "BYBLOCK") ltFlags = 1;
    else if (ltName === "CONTINUOUS") ltFlags = 2;
    else if (ltName && ltName !== "BYLAYER" && this.ltypes.has(ltName)) { ltFlags = 3; ltH = this.ltypes.get(ltName).h; }
    return {
      layer: this.layer(str(r, 8, "0")), color, ltFlags, ltH,
      ltScale: num(r, 48, 1) || 1, lw: lwIndex(has(r, 370) ? num(r, 370) : -1, 29), invisible: int(r, 60) & 1,
      paper: space === "model" && int(r, 67) === 1,
    };
  }

  // DXF entity → {type, st, data(w), handles(w), attribs?} or null (skipped).
  entity(r, space) {
    const st = this.style(r, space);
    const e = { type: 0, st, rec: r, handles: null };
    const th = num(r, 39), ex = ext3(r);
    switch (r.type) {
      case "LINE": {
        const a = pt3(r, 10), b = pt3(r, 11);
        e.type = T.LINE;
        e.data = (w) => {
          const zz = a[2] === 0 && b[2] === 0;
          w.B(zz).RD(a[0]).DD(b[0], a[0]).RD(a[1]).DD(b[1], a[1]);
          if (!zz) w.RD(a[2]).DD(b[2], a[2]);
          w.BT(th).BE(ex);
        };
        this.track(a); this.track(b);
        return e;
      }
      case "POINT": {
        const p = pt3(r, 10);
        e.type = T.POINT;
        e.data = (w) => w.BD3(p).BT(th).BE(ex).BD(num(r, 50) * DEG);
        this.track(p);
        return e;
      }
      case "CIRCLE": case "ARC": {
        const c = pt3(r, 10), rad = num(r, 40);
        e.type = r.type === "ARC" ? T.ARC : T.CIRCLE;
        e.data = (w) => {
          w.BD3(c).BD(rad).BT(th).BE(ex);
          if (e.type === T.ARC) w.BD(num(r, 50) * DEG).BD(num(r, 51) * DEG);
        };
        this.track([c[0] - rad, c[1] - rad]); this.track([c[0] + rad, c[1] + rad]);
        return e;
      }
      case "ELLIPSE": {
        const c = pt3(r, 10), m = pt3(r, 11, [1, 0, 0]);
        e.type = T.ELLIPSE;
        e.data = (w) => w.BD3(c).BD3(m).BD3(ex).BD(num(r, 40, 1)).BD(num(r, 41, 0)).BD(num(r, 42, 2 * Math.PI));
        const L = Math.hypot(m[0], m[1]);
        this.track([c[0] - L, c[1] - L]); this.track([c[0] + L, c[1] + L]);
        return e;
      }
      case "TEXT": case "ATTRIB": case "ATTDEF": {
        e.type = r.type === "TEXT" ? T.TEXT : r.type === "ATTRIB" ? T.ATTRIB : T.ATTDEF;
        e.data = (w) => this.textData(w, r, e.type);
        e.handles = (w) => w.H(HARD_PTR, this.styleHandle(str(r, 7)));
        this.track(pt3(r, 10));
        return e;
      }
      case "MTEXT": return this.mtext(e, r);
      case "INSERT": return this.insert(e, r, space);
      case "DIMENSION": {
        // The rendered geometry of a dimension is its anonymous block: insert
        // it where it was drawn (block base = insertion point → identity).
        const b = this.blockByName.get(dxfString(str(r, 2)).toUpperCase());
        if (!b) { this.skip("DIMENSION"); return null; }
        e.type = T.INSERT;
        e.block = b;
        e.data = (w) => w.BD3(b.base).BB(3).BD(0).BD3([0, 0, 1]).B(0);
        e.handles = (w) => w.H(HARD_PTR, b.h);
        return e;
      }
      case "LWPOLYLINE": {
        const verts = [];
        for (const [c, v] of r.tags) {
          if (c === 10) verts.push({ x: fin(parseFloat(v)), y: 0, b: 0, w0: 0, w1: 0 });
          else if (!verts.length) continue;
          else if (c === 20) verts[verts.length - 1].y = fin(parseFloat(v));
          else if (c === 42) verts[verts.length - 1].b = fin(parseFloat(v));
          else if (c === 40) verts[verts.length - 1].w0 = fin(parseFloat(v));
          else if (c === 41) verts[verts.length - 1].w1 = fin(parseFloat(v));
        }
        const fl = int(r, 70);
        return this.lwpolyline(e, verts, { closed: fl & 1, plinegen: fl & 128, cw: num(r, 43), elev: num(r, 38), th, ex });
      }
      case "POLYLINE": {
        const fl = int(r, 70);
        if (fl & (16 | 64)) { this.skip("POLYLINE (mesh)"); return null; }
        let vs = (r.vertices || []).map((v) => ({ x: num(v, 10), y: num(v, 20), b: num(v, 42), w0: num(v, 40, num(r, 40)), w1: num(v, 41, num(r, 41)), f: int(v, 70) }));
        if (fl & 4) vs = vs.filter((v) => !(v.f & 16)); // spline frame
        if (fl & 8) vs.forEach((v) => { v.b = 0; }); // 3D: flattened, no bulges
        return this.lwpolyline(e, vs, { closed: fl & 1, plinegen: fl & 128, cw: 0, elev: fl & 8 ? 0 : num(r, 30), th, ex: fl & 8 ? [0, 0, 1] : ex });
      }
      case "SOLID": case "TRACE": {
        const q = [10, 11, 12, 13].map((c) => [num(r, c), num(r, c + 10)]);
        if (!has(r, 13)) q[3] = q[2];
        e.type = r.type === "SOLID" ? T.SOLID : T.TRACE;
        e.data = (w) => { w.BT(th).BD(num(r, 30)); for (const p of q) w.RD2(p); w.BE(ex); };
        q.forEach((p) => this.track(p));
        return e;
      }
      case "3DFACE": {
        const q = [10, 11, 12, 13].map((c) => pt3(r, c));
        if (!has(r, 13)) q[3] = q[2];
        const fl = int(r, 70);
        e.type = T.FACE3D;
        e.data = (w) => {
          const zz = q[0][2] === 0;
          w.B(fl === 0).B(zz).RD(q[0][0]).RD(q[0][1]);
          if (!zz) w.RD(q[0][2]);
          for (let i = 1; i < 4; i++) for (let k = 0; k < 3; k++) w.DD(q[i][k], q[i - 1][k]);
          if (fl !== 0) w.BS(fl);
        };
        q.forEach((p) => this.track(p));
        return e;
      }
      case "RAY": case "XLINE": {
        const p = pt3(r, 10), d = pt3(r, 11, [1, 0, 0]);
        e.type = r.type === "RAY" ? T.RAY : T.XLINE;
        e.data = (w) => w.BD3(p).BD3(d);
        this.track(p);
        return e;
      }
      case "SPLINE": return this.spline(e, r);
      case "HATCH": return this.hatch(e, r);
      default:
        this.skip(r.type);
        return null;
    }
  }

  // TEXT / ATTRIB / ATTDEF data (R2000: data flags mark the default values).
  textData(w, r, type) {
    const ins = [num(r, 10), num(r, 20)], el = num(r, 30);
    const hj = int(r, 72), vj = int(r, type === T.TEXT ? 73 : 74);
    const al = has(r, 11) && (hj || vj) ? [num(r, 11), num(r, 21)] : null;
    const obl = num(r, 51) * DEG, rot = num(r, 50) * DEG, wf = num(r, 41, 1) || 1, gen = int(r, 71);
    const df = (el === 0 ? 1 : 0) | (!al ? 2 : 0) | (obl === 0 ? 4 : 0) | (rot === 0 ? 8 : 0) | (wf === 1 ? 16 : 0) | (gen === 0 ? 32 : 0) | (hj === 0 ? 64 : 0) | (vj === 0 ? 128 : 0);
    w.RC(df);
    if (!(df & 1)) w.RD(el);
    w.RD2(ins);
    if (!(df & 2)) w.DD(al[0], ins[0]).DD(al[1], ins[1]);
    w.BE(ext3(r)).BT(num(r, 39));
    if (!(df & 4)) w.RD(obl);
    if (!(df & 8)) w.RD(rot);
    w.RD(num(r, 40, 1));
    if (!(df & 16)) w.RD(wf);
    w.T(dxfString(raw(r, 1) ?? ""));
    if (!(df & 32)) w.BS(gen);
    if (!(df & 64)) w.BS(hj);
    if (!(df & 128)) w.BS(vj);
    if (type !== T.TEXT) {
      w.T(dxfString(str(r, 2))).BS(int(r, 73)).RC(int(r, 70));
      if (type === T.ATTDEF) w.T(dxfString(raw(r, 3) ?? ""));
    }
  }

  mtext(e, r) {
    let s = "";
    for (const [c, v] of r.tags) if (c === 3) s += v;
    s += raw(r, 1) ?? "";
    const ex = ext3(r);
    let xdir = has(r, 11) ? pt3(r, 11) : null;
    if (!xdir || Math.hypot(...xdir) < 1e-12) {
      // Rotation in the object coordinate system → x axis direction (WCS).
      const a = num(r, 50) * DEG;
      xdir = ocsToWcs(ex, [Math.cos(a), Math.sin(a), 0]);
    }
    e.type = T.MTEXT;
    e.data = (w) => {
      w.BD3(pt3(r, 10)).BD3(ex).BD3(xdir).BD(num(r, 41)).BD(num(r, 40, 1)).BS(int(r, 71, 1) || 1).BS(int(r, 72, 1) || 1)
        .BD(num(r, 43)).BD(num(r, 42)).T(dxfString(s)).BS(int(r, 73, 1) || 1).BD(num(r, 44, 1) || 1).B(0);
    };
    e.handles = (w) => w.H(HARD_PTR, this.styleHandle(str(r, 7)));
    this.track(pt3(r, 10));
    return e;
  }

  insert(e, r, space) {
    const b = this.blockByName.get(dxfString(str(r, 2)).toUpperCase());
    if (!b) { this.skip("INSERT (missing block)"); return null; }
    const cols = Math.max(1, int(r, 70, 1)), rows = Math.max(1, int(r, 71, 1));
    const minsert = cols > 1 || rows > 1;
    const sc = [num(r, 41, 1), num(r, 42, 1), num(r, 43, 1)];
    const p = pt3(r, 10);
    e.type = minsert ? T.MINSERT : T.INSERT;
    e.block = b;
    e.attribs = (r.attribs || []).map((a) => this.entity(a, space)).filter(Boolean);
    e.data = (w) => {
      w.BD3(p);
      if (sc[0] === 1 && sc[1] === 1 && sc[2] === 1) w.BB(3);
      else if (sc[0] === sc[1] && sc[0] === sc[2]) w.BB(2).RD(sc[0]);
      else if (sc[0] === 1) w.BB(1).DD(sc[1], 1).DD(sc[2], 1);
      else w.BB(0).RD(sc[0]).DD(sc[1], sc[0]).DD(sc[2], sc[0]);
      w.BD(num(r, 50) * DEG).BD3(ext3(r)).B(e.attribs.length > 0);
      if (minsert) w.BS(cols).BS(rows).BD(num(r, 44)).BD(num(r, 45));
    };
    e.handles = (w) => {
      w.H(HARD_PTR, b.h);
      if (e.attribs.length) w.H(SOFT_PTR, e.attribs[0].h).H(SOFT_PTR, e.attribs[e.attribs.length - 1].h).H(HARD_OWN, e.seqend);
    };
    if (space === "model") {
      const bb = this.blockBox(b);
      if (bb) {
        const a = num(r, 50) * DEG, c = Math.cos(a), s = Math.sin(a);
        for (const [x, y] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]]) {
          const u = (x - b.base[0]) * sc[0], v = (y - b.base[1]) * sc[1];
          this.track([p[0] + c * u - s * v, p[1] + s * u + c * v]);
        }
      } else this.track(p);
    }
    return e;
  }

  lwpolyline(e, verts, o) {
    if (verts.length < 1) { this.skip("POLYLINE (empty)"); return null; }
    const bulges = verts.some((v) => v.b);
    const same = verts.every((v) => v.w0 === verts[0].w0 && v.w1 === verts[0].w0);
    const cw = o.cw || (same ? verts[0].w0 : 0);
    const widths = !same && verts.some((v) => v.w0 || v.w1);
    let fl = (o.closed ? 512 : 0) | (o.plinegen ? 256 : 0) | (bulges ? 16 : 0) | (widths ? 32 : 0);
    if (cw) fl |= 4;
    if (o.elev) fl |= 8;
    if (o.th) fl |= 2;
    if (!(o.ex[0] === 0 && o.ex[1] === 0 && o.ex[2] === 1)) fl |= 1;
    e.type = T.LWPOLYLINE;
    e.data = (w) => {
      w.BS(fl);
      if (fl & 4) w.BD(cw);
      if (fl & 8) w.BD(o.elev);
      if (fl & 2) w.BD(o.th);
      if (fl & 1) w.BD3(o.ex);
      w.BL(verts.length);
      if (fl & 16) w.BL(verts.length);
      if (fl & 32) w.BL(verts.length);
      verts.forEach((v, i) => { if (i) w.DD(v.x, verts[i - 1].x).DD(v.y, verts[i - 1].y); else w.RD(v.x).RD(v.y); });
      if (fl & 16) for (const v of verts) w.BD(v.b);
      if (fl & 32) for (const v of verts) w.BD(v.w0).BD(v.w1);
    };
    for (const v of verts) this.track([v.x, v.y]);
    return e;
  }

  spline(e, r) {
    const fl = int(r, 70);
    const knots = r.tags.filter(([c]) => c === 40).map(([, v]) => fin(parseFloat(v)));
    const weights = r.tags.filter(([c]) => c === 41).map(([, v]) => fin(parseFloat(v), 1));
    const ptsOf = (xc) => {
      const out = [];
      for (const [c, v] of r.tags) {
        if (c === xc) out.push([fin(parseFloat(v)), 0, 0]);
        else if (out.length && c === xc + 10) out[out.length - 1][1] = fin(parseFloat(v));
        else if (out.length && c === xc + 20) out[out.length - 1][2] = fin(parseFloat(v));
      }
      return out;
    };
    const ctrl = ptsOf(10), fit = ptsOf(11);
    if (ctrl.length < 2 && fit.length < 2) { this.skip("SPLINE (empty)"); return null; }
    const weighted = ctrl.length >= 2 && weights.length === ctrl.length && weights.some((x) => x !== 1);
    e.type = T.SPLINE;
    e.data = (w) => {
      if (ctrl.length >= 2) {
        w.BL(1).BL(int(r, 71, 3)).B(fl & 4).B(fl & 1).B(fl & 2).BD(num(r, 42, 1e-10)).BD(num(r, 43, 1e-10)).BL(knots.length).BL(ctrl.length).B(weighted);
        for (const k of knots) w.BD(k);
        ctrl.forEach((p, i) => { w.BD3(p); if (weighted) w.BD(weights[i]); });
      } else {
        w.BL(2).BL(int(r, 71, 3)).BD(num(r, 44, 1e-10)).BD3(pt3(r, 12)).BD3(pt3(r, 13)).BL(fit.length);
        for (const p of fit) w.BD3(p);
      }
    };
    for (const p of ctrl.length ? ctrl : fit) this.track(p);
    return e;
  }

  // HATCH: boundary paths, pattern and seeds read tag by tag (DXF order).
  hatch(e, r) {
    const t = r.tags;
    let i = t.findIndex(([c]) => c === 91);
    if (i < 0) { this.skip("HATCH (no boundary)"); return null; }
    const name = dxfString(str(r, 2, "SOLID")) || "SOLID";
    const solid = int(r, 70) === 1;
    const n = parseInt(t[i][1], 10) || 0;
    i++;
    const peek = (c) => i < t.length && t[i][0] === c;
    const take = (c, d = 0) => (peek(c) ? fin(parseFloat(t[i++][1]), d) : d);
    const paths = [];
    for (let k = 0; k < n; k++) {
      while (i < t.length && t[i][0] !== 92) i++;
      if (i >= t.length) break;
      const p = { flag: take(92), edges: [], verts: [] };
      if (p.flag & 2) {
        p.bulge = take(72); p.closed = take(73, 1);
        const nv = take(93);
        for (let v = 0; v < nv; v++) p.verts.push([take(10), take(20), p.bulge ? take(42) : 0]);
      } else {
        const ne = take(93);
        for (let j = 0; j < ne; j++) {
          const type = take(72);
          if (type === 1) p.edges.push({ type, a: [take(10), take(20)], b: [take(11), take(21)] });
          else if (type === 2) p.edges.push({ type, c: [take(10), take(20)], r: take(40), s: take(50), e: take(51), ccw: take(73, 1) });
          else if (type === 3) p.edges.push({ type, c: [take(10), take(20)], m: [take(11), take(21)], ratio: take(40), s: take(50), e: take(51), ccw: take(73, 1) });
          else if (type === 4) {
            const ed = { type, degree: take(94, 3), rational: take(73), periodic: take(74), knots: [], ctrl: [] };
            const nk = take(95), nc = take(96);
            for (let q = 0; q < nk; q++) ed.knots.push(take(40));
            for (let q = 0; q < nc; q++) ed.ctrl.push([take(10), take(20), peek(42) ? take(42) : 1]);
            if (peek(97) && t[i + 1] && t[i + 1][0] === 11) { const nf = take(97); for (let q = 0; q < nf; q++) { take(11); take(21); } }
            while (peek(12) || peek(22) || peek(13) || peek(23)) i++;
            p.edges.push(ed);
          } else break;
        }
      }
      p.nsrc = 0;
      if (peek(97)) { const ns = take(97); for (let q = 0; q < ns && peek(330); q++) i++; }
      paths.push(p);
    }
    while (i < t.length && t[i][0] !== 75) i++;
    const style = take(75), ptype = take(76, 1);
    let angle = 0, scale = 1, dbl = 0;
    const lines = [];
    if (!solid) {
      angle = take(52); scale = take(41, 1); dbl = take(77);
      const nd = take(78);
      for (let d = 0; d < nd; d++) {
        const ln = { a: take(53), o: [take(43), take(44)], d: [take(45), take(46)], dashes: [] };
        const nn = take(79);
        for (let q = 0; q < nn; q++) ln.dashes.push(take(49));
        lines.push(ln);
      }
      // A pattern without its definition lines: ANSI31 hatching (45°).
      if (!lines.length) lines.push({ a: 45 + angle, o: [0, 0], d: [-2.2450640303 * scale, 2.2450640303 * scale], dashes: [] });
    }
    const pixel = peek(47) ? take(47) : 0;
    const seeds = [];
    if (peek(98)) { const ns = take(98); for (let q = 0; q < ns; q++) seeds.push([take(10), take(20)]); }
    const derived = paths.some((p) => p.flag & 4);
    const elev = num(r, 30), ex = ext3(r);
    e.type = T.HATCH;
    e.data = (w) => {
      w.BD(elev).BD3(ex).T(name).B(solid).B(int(r, 71) & 1).BL(paths.length);
      for (const p of paths) {
        w.BL(p.flag);
        if (p.flag & 2) {
          w.B(p.bulge).B(p.closed).BL(p.verts.length);
          for (const v of p.verts) { w.RD(v[0]).RD(v[1]); if (p.bulge) w.BD(v[2]); }
        } else {
          w.BL(p.edges.length);
          for (const ed of p.edges) {
            w.RC(ed.type);
            if (ed.type === 1) w.RD2(ed.a).RD2(ed.b);
            else if (ed.type === 2) w.RD2(ed.c).BD(ed.r).BD(ed.s * DEG).BD(ed.e * DEG).B(ed.ccw);
            else if (ed.type === 3) w.RD2(ed.c).RD2(ed.m).BD(ed.ratio).BD(ed.s * DEG).BD(ed.e * DEG).B(ed.ccw);
            else {
              w.BL(ed.degree).B(ed.rational).B(ed.periodic).BL(ed.knots.length).BL(ed.ctrl.length);
              for (const k of ed.knots) w.BD(k);
              for (const c of ed.ctrl) { w.RD(c[0]).RD(c[1]); if (ed.rational) w.BD(c[2]); }
            }
          }
        }
        w.BL(0); // no associated boundary objects
      }
      w.BS(style).BS(ptype);
      if (!solid) {
        w.BD(angle * DEG).BD(scale).B(dbl).BS(lines.length);
        for (const ln of lines) {
          w.BD(ln.a * DEG).BD2(ln.o).BD2(ln.d).BS(ln.dashes.length);
          for (const d of ln.dashes) w.BD(d);
        }
      }
      if (derived) w.BD(pixel);
      w.BL(seeds.length);
      for (const s of seeds) w.RD2(s);
    };
    for (const p of paths) {
      for (const v of p.verts) this.track(v);
      for (const ed of p.edges) for (const q of [ed.a, ed.b, ed.c].filter(Boolean)) this.track(q);
    }
    return e;
  }

  // Drawing extents (model space, approximate: WCS points of the entities).
  track(p) {
    if (!this.tracking || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    const b = this.bbox;
    if (!b) this.bbox = [p[0], p[1], p[0], p[1]];
    else { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  }

  // Extent of a block's own entities (block coordinates), cached.
  blockBox(b) {
    if (b.box !== undefined) return b.box;
    b.box = null; // guards against self-references
    const saved = [this.bbox, this.tracking];
    this.bbox = null;
    this.tracking = true;
    for (const r of nest(b.recs)) {
      if (r.type === "INSERT") {
        const c = this.blockByName.get(dxfString(str(r, 2)).toUpperCase());
        const bb = c && this.blockBox(c);
        if (bb) { this.track([bb[0] - c.base[0] + num(r, 10), bb[1] - c.base[1] + num(r, 20)]); this.track([bb[2] - c.base[0] + num(r, 10), bb[3] - c.base[1] + num(r, 20)]); }
      } else {
        const keep = this.skipped;
        this.skipped = new Map();
        this.entity(r, "block");
        this.skipped = keep;
      }
    }
    b.box = this.bbox;
    [this.bbox, this.tracking] = saved;
    return b.box;
  }

  // ---------------------------------------------------------------- object encoding

  // Non-entity object: type, bit size, handle, (no) EED, reactors, data,
  // then owner, reactors and xdictionary handles before its own handles.
  object(type, h, { owner = 0, reactors = [], data, handles }) {
    const w = new DwgBitWriter();
    w.BS(type);
    const at = w.length;
    w.RL(0);
    w.H(0, h).BS(0).BL(reactors.length);
    if (data) data(w);
    const bitsize = w.length;
    w.H(SOFT_PTR, owner);
    for (const r of reactors) w.H(SOFT_PTR, r);
    w.H(HARD_OWN, 0);
    if (handles) handles(w);
    w.patchRL(at, bitsize);
    this.put(h, w.bytes());
  }

  // Table entry: name, the 64-flag, xref index, xref dependency; the xref
  // block handle follows the common handles.
  table(type, h, owner, name, data, handles) {
    this.object(type, h, {
      owner,
      data: (w) => { w.T(name).B(1).BS(0).B(0); if (data) data(w); },
      handles: (w) => { w.H(HARD_PTR, 0); if (handles) handles(w); },
    });
  }

  // Entity: common data (mode, links, colour, linetype, lineweight …).
  ent(type, h, { st = {}, owner = 0, entmode = 2, prev = 0, next = 0, data, handles }) {
    const w = new DwgBitWriter();
    w.BS(type);
    const at = w.length;
    w.RL(0);
    w.H(0, h).BS(0).B(0); // no EED, no preview
    const ltFlags = st.ltFlags || 0;
    w.BB(entmode).BL(0).B(0) // no reactors; links written explicitly
      .CMC(st.color ?? 256).BD(st.ltScale ?? 1).BB(ltFlags).BB(0).BS(st.invisible || 0).RC(st.lw ?? 29);
    if (data) data(w);
    const bitsize = w.length;
    if (entmode === 0) w.H(SOFT_PTR, owner);
    w.H(HARD_OWN, 0).H(SOFT_PTR, prev).H(SOFT_PTR, next).H(HARD_PTR, st.layer ?? H.LAYER0);
    if (ltFlags === 3) w.H(HARD_PTR, st.ltH);
    if (handles) handles(w);
    w.patchRL(at, bitsize);
    this.put(h, w.bytes());
  }

  // A block's entity list (model, paper or user block) with its links.
  writeList(list, owner, entmode) {
    list.forEach((it, i) => {
      const prev = i ? list[i - 1].h : 0, next = i + 1 < list.length ? list[i + 1].h : 0;
      this.ent(it.type, it.h, { st: it.st, owner, entmode, prev, next, data: it.data, handles: it.handles });
      if (it.attribs && it.attribs.length) {
        it.attribs.forEach((a, k) => {
          const ap = k ? it.attribs[k - 1].h : 0, an = k + 1 < it.attribs.length ? it.attribs[k + 1].h : 0;
          this.ent(a.type, a.h, { st: a.st, owner: it.h, entmode: 0, prev: ap, next: an, data: a.data, handles: a.handles });
        });
        this.ent(T.SEQEND, it.seqend, { st: { layer: it.st.layer }, owner: it.h, entmode: 0 });
      }
    });
  }

  // Allocate handles for a converted entity list (entity, attributes, SEQEND).
  number(list) {
    for (const it of list) {
      it.h = this.alloc();
      if (it.attribs && it.attribs.length) { for (const a of it.attribs) a.h = this.alloc(); it.seqend = this.alloc(); }
      if (it.block) it.block.inserts.push(it.h);
    }
  }

  // ---------------------------------------------------------------- build
  build() {
    this.tables();
    this.blocks();

    // Entities: blocks first (handles in file order like AutoCAD), then spaces.
    for (const b of this.blockList) {
      b.begin = this.alloc();
      b.items = b.xref ? [] : nest(b.recs).map((r) => this.entity(r, "block")).filter(Boolean);
      this.number(b.items);
      b.end = this.alloc();
    }
    this.tracking = true;
    const model = [], paper = [];
    for (const r of nest((this.sec.ENTITIES && this.sec.ENTITIES.recs) || [])) {
      const isPaper = int(r, 67) === 1;
      if (isPaper) this.tracking = false;
      const it = this.entity(r, "model");
      this.tracking = true;
      if (it) (isPaper ? paper : model).push(it);
    }
    this.number(model);
    this.number(paper);

    // Extents: the DXF's when it has them, otherwise measured.
    let emin = this.hvPt("$EXTMIN", [NaN, NaN, 0]), emax = this.hvPt("$EXTMAX", [NaN, NaN, 0]);
    if (!(emin[0] <= emax[0] && emin[1] <= emax[1] && Math.abs(emin[0]) < 1e19 && Math.abs(emax[0]) < 1e19)) {
      const b = this.bbox || [0, 0, 0, 0];
      emin = [b[0], b[1], 0];
      emax = [b[2], b[3], 0];
    }
    this.ext = { min: emin, max: emax };

    this.writeTables();
    this.writeDictionaries();

    // Block headers, BLOCK/ENDBLK and the entities.
    this.blockHeader(H.MS, "*Model_Space", { begin: H.MS_BEGIN, end: H.MS_END, items: model, layout: H.LAYOUT_MODEL, entmode: 2 });
    this.blockHeader(H.PS, "*Paper_Space", { begin: H.PS_BEGIN, end: H.PS_END, items: paper, layout: H.LAYOUT1, entmode: 1 });
    for (const b of this.blockList) {
      this.blockHeader(b.h, b.dname, { begin: b.begin, end: b.end, items: b.items, layout: 0, entmode: 0, block: b });
    }
    return this.file();
  }

  blockHeader(h, name, { begin, end, items, layout, entmode, block = null }) {
    const b = block || { base: [0, 0, 0], inserts: [], anonymous: false, xref: false, overlay: false, path: "" };
    const hasAttdef = items.some((it) => it.type === T.ATTDEF);
    const linked = !b.xref && !b.overlay;
    this.table(T.BLOCK_HEADER, h, H.BLOCK_CONTROL, name, (w) => {
      w.B(b.anonymous).B(hasAttdef).B(b.xref).B(b.overlay).B(0).BD3(b.base).T(b.path);
      for (let i = 0; i < b.inserts.length; i++) w.RC(1);
      w.RC(0).T("").BL(0); // insert count terminator, description, no preview
    }, (w) => {
      w.H(HARD_OWN, begin);
      if (linked) w.H(SOFT_PTR, items.length ? items[0].h : 0).H(SOFT_PTR, items.length ? items[items.length - 1].h : 0);
      w.H(HARD_OWN, end);
      for (const ih of b.inserts) w.H(SOFT_PTR, ih);
      w.H(HARD_PTR, layout);
    });
    const owner = h;
    this.ent(T.BLOCK, begin, { st: { layer: H.LAYER0 }, owner, entmode, data: (w) => w.T(block ? b.name : name) });
    this.writeList(items, owner, entmode);
    this.ent(T.ENDBLK, end, { st: { layer: H.LAYER0 }, owner, entmode });
  }

  writeTables() {
    const ctrl = (type, h, entries, extra, bs = false) => this.object(type, h, {
      data: (w) => (bs ? w.BS(entries.length) : w.BL(entries.length)),
      handles: (w) => { for (const e of entries) w.H(SOFT_OWN, e); if (extra) extra(w); },
    });
    const blocks = this.blockList.map((b) => b.h);
    ctrl(T.BLOCK_CONTROL, H.BLOCK_CONTROL, blocks, (w) => w.H(HARD_OWN, H.MS).H(HARD_OWN, H.PS));
    ctrl(T.LAYER_CONTROL, H.LAYER_CONTROL, [...this.layers.values()].map((l) => l.h));
    ctrl(T.STYLE_CONTROL, H.STYLE_CONTROL, [...this.styles.values()].map((s) => s.h));
    const lts = [...this.ltypes.values()].filter((l) => l.h !== H.BYBLOCK && l.h !== H.BYLAYER);
    ctrl(T.LTYPE_CONTROL, H.LTYPE_CONTROL, lts.map((l) => l.h), (w) => w.H(HARD_OWN, H.BYBLOCK).H(HARD_OWN, H.BYLAYER), true);
    ctrl(T.VIEW_CONTROL, H.VIEW_CONTROL, []);
    ctrl(T.UCS_CONTROL, H.UCS_CONTROL, [], null, true);
    ctrl(T.VPORT_CONTROL, H.VPORT_CONTROL, [H.VPORT], null, true);
    ctrl(T.APPID_CONTROL, H.APPID_CONTROL, [...this.appids.values()].map((a) => a.h), null, true);
    this.object(T.DIMSTYLE_CONTROL, H.DIMSTYLE_CONTROL, { data: (w) => w.BS(1).RC(0), handles: (w) => w.H(SOFT_OWN, H.DIMSTYLE) });
    ctrl(T.VX_CONTROL, H.VX_CONTROL, [], null, true);

    for (const l of this.layers.values()) {
      const ltKey = String(l.ltype || "").toUpperCase();
      const lt = this.ltypes.get(ltKey === "BYLAYER" || ltKey === "BYBLOCK" ? "CONTINUOUS" : ltKey) || this.ltypes.get("CONTINUOUS");
      const flags = (l.flags & 1 ? 1 : 0) | (l.off ? 2 : 0) | (l.flags & 2 ? 4 : 0) | (l.flags & 4 ? 8 : 0) | (l.plot ? 16 : 0) | ((l.lw & 31) << 5);
      this.table(T.LAYER, l.h, H.LAYER_CONTROL, l.name, (w) => w.BS(flags).CMC(l.off ? -l.color : l.color),
        (w) => w.H(HARD_PTR, H.NORMAL).H(HARD_PTR, lt.h));
    }
    for (const s of this.styles.values()) {
      this.table(T.STYLE, s.h, H.STYLE_CONTROL, s.name, (w) => {
        w.B(s.flags & 1).B(s.flags & 4).BD(s.height).BD(s.width).BD(s.oblique * DEG).RC(s.gen).BD(s.last).T(s.font).T(s.bigfont);
      });
    }
    for (const l of this.ltypes.values()) {
      const total = l.dashes.reduce((a, d) => a + Math.abs(d), 0);
      this.table(T.LTYPE, l.h, H.LTYPE_CONTROL, l.name, (w) => {
        w.T(l.desc).BD(total).RC(65).RC(l.dashes.length);
        for (const d of l.dashes) w.BD(d).BS(0).RD(0).RD(0).BD(1).BD(0).BS(0);
        for (let i = 0; i < 256; i++) w.RC(0); // text area of complex linetypes
      }, (w) => { for (let i = 0; i < l.dashes.length; i++) w.H(HARD_PTR, 0); });
    }
    for (const a of this.appids.values()) this.table(T.APPID, a.h, H.APPID_CONTROL, a.name, (w) => w.RC(0));
    this.dimstyle();
    this.vport();
  }

  // Dimension settings shared by the header and the STANDARD dimension style.
  dims() {
    const v = (n, c, d) => this.hv(n, c, d);
    return {
      DIMPOST: v("$DIMPOST", 1, ""), DIMAPOST: v("$DIMAPOST", 1, ""),
      DIMSCALE: v("$DIMSCALE", 40, 1), DIMASZ: v("$DIMASZ", 40, 2.5), DIMEXO: v("$DIMEXO", 40, 0.625), DIMDLI: v("$DIMDLI", 40, 3.75),
      DIMEXE: v("$DIMEXE", 40, 1.25), DIMRND: v("$DIMRND", 40, 0), DIMDLE: v("$DIMDLE", 40, 0), DIMTP: v("$DIMTP", 40, 0), DIMTM: v("$DIMTM", 40, 0),
      DIMTOL: v("$DIMTOL", 70, 0), DIMLIM: v("$DIMLIM", 70, 0), DIMTIH: v("$DIMTIH", 70, 0), DIMTOH: v("$DIMTOH", 70, 0),
      DIMSE1: v("$DIMSE1", 70, 0), DIMSE2: v("$DIMSE2", 70, 0), DIMTAD: v("$DIMTAD", 70, 1), DIMZIN: v("$DIMZIN", 70, 8), DIMAZIN: v("$DIMAZIN", 70, 0),
      DIMTXT: v("$DIMTXT", 40, 2.5), DIMCEN: v("$DIMCEN", 40, 2.5), DIMTSZ: v("$DIMTSZ", 40, 0), DIMALTF: v("$DIMALTF", 40, 0.0393700787),
      DIMLFAC: v("$DIMLFAC", 40, 1), DIMTVP: v("$DIMTVP", 40, 0), DIMTFAC: v("$DIMTFAC", 40, 1), DIMGAP: v("$DIMGAP", 40, 0.625), DIMALTRND: v("$DIMALTRND", 40, 0),
      DIMALT: v("$DIMALT", 70, 0), DIMALTD: v("$DIMALTD", 70, 3), DIMTOFL: v("$DIMTOFL", 70, 1), DIMSAH: v("$DIMSAH", 70, 0), DIMTIX: v("$DIMTIX", 70, 0), DIMSOXD: v("$DIMSOXD", 70, 0),
      DIMCLRD: v("$DIMCLRD", 70, 0), DIMCLRE: v("$DIMCLRE", 70, 0), DIMCLRT: v("$DIMCLRT", 70, 0),
      DIMADEC: v("$DIMADEC", 70, 0), DIMDEC: v("$DIMDEC", 70, 2), DIMTDEC: v("$DIMTDEC", 70, 2), DIMALTU: v("$DIMALTU", 70, 2), DIMALTTD: v("$DIMALTTD", 70, 3),
      DIMAUNIT: v("$DIMAUNIT", 70, 0), DIMFRAC: v("$DIMFRAC", 70, 0), DIMLUNIT: v("$DIMLUNIT", 70, 2), DIMDSEP: v("$DIMDSEP", 70, 44), DIMTMOVE: v("$DIMTMOVE", 70, 0),
      DIMJUST: v("$DIMJUST", 70, 0), DIMSD1: v("$DIMSD1", 70, 0), DIMSD2: v("$DIMSD2", 70, 0), DIMTOLJ: v("$DIMTOLJ", 70, 0), DIMTZIN: v("$DIMTZIN", 70, 8),
      DIMALTZ: v("$DIMALTZ", 70, 0), DIMALTTZ: v("$DIMALTTZ", 70, 0), DIMUPT: v("$DIMUPT", 70, 0), DIMATFIT: v("$DIMATFIT", 70, 3),
      DIMLWD: v("$DIMLWD", 70, -2), DIMLWE: v("$DIMLWE", 70, -2),
    };
  }

  // The R2000 dimension variables in their DWG order (header and DIMSTYLE).
  dimVars(w, d, handles) {
    w.BD(d.DIMSCALE).BD(d.DIMASZ).BD(d.DIMEXO).BD(d.DIMDLI).BD(d.DIMEXE).BD(d.DIMRND).BD(d.DIMDLE).BD(d.DIMTP).BD(d.DIMTM);
    w.B(d.DIMTOL).B(d.DIMLIM).B(d.DIMTIH).B(d.DIMTOH).B(d.DIMSE1).B(d.DIMSE2).BS(d.DIMTAD).BS(d.DIMZIN).BS(d.DIMAZIN);
    w.BD(d.DIMTXT).BD(d.DIMCEN).BD(d.DIMTSZ).BD(d.DIMALTF).BD(d.DIMLFAC).BD(d.DIMTVP).BD(d.DIMTFAC).BD(d.DIMGAP).BD(d.DIMALTRND);
    w.B(d.DIMALT).BS(d.DIMALTD).B(d.DIMTOFL).B(d.DIMSAH).B(d.DIMTIX).B(d.DIMSOXD);
    w.CMC(d.DIMCLRD).CMC(d.DIMCLRE).CMC(d.DIMCLRT);
    w.BS(d.DIMADEC).BS(d.DIMDEC).BS(d.DIMTDEC).BS(d.DIMALTU).BS(d.DIMALTTD).BS(d.DIMAUNIT).BS(d.DIMFRAC).BS(d.DIMLUNIT).BS(d.DIMDSEP).BS(d.DIMTMOVE).BS(d.DIMJUST);
    w.B(d.DIMSD1).B(d.DIMSD2).BS(d.DIMTOLJ).BS(d.DIMTZIN).BS(d.DIMALTZ).BS(d.DIMALTTZ).B(d.DIMUPT).BS(d.DIMATFIT);
    if (handles) w.H(HARD_PTR, H.STANDARD).H(HARD_PTR, 0).H(HARD_PTR, 0).H(HARD_PTR, 0).H(HARD_PTR, 0); // DIMTXSTY, DIMLDRBLK, DIMBLK, DIMBLK1, DIMBLK2
  }

  dimstyle() {
    const d = this.dims();
    this.table(T.DIMSTYLE, H.DIMSTYLE, H.DIMSTYLE_CONTROL, "Standard", (w) => {
      w.T(d.DIMPOST).T(d.DIMAPOST);
      this.dimVars(w, d, false);
      w.BS(d.DIMLWD).BS(d.DIMLWE).B(0);
    }, (w) => w.H(HARD_PTR, H.STANDARD).H(HARD_PTR, 0).H(HARD_PTR, 0).H(HARD_PTR, 0).H(HARD_PTR, 0));
  }

  // *ACTIVE viewport: model space zoomed to the drawing extents.
  vport() {
    const { min, max } = this.ext;
    const wd = Math.max(max[0] - min[0], 1e-6), ht = Math.max(max[1] - min[1], 1e-6);
    const aspect = 1.5;
    const size = Math.max(ht, wd / aspect) * 1.05 || 1;
    const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
    this.table(T.VPORT, H.VPORT, H.VPORT_CONTROL, "*Active", (w) => {
      w.BD(size).BD(size * aspect).RD2(ctr).BD3([0, 0, 0]).BD3([0, 0, 1]).BD(0).BD(50).BD(0).BD(0)
        .bits(1, 4).RC(0).RD2([0, 0]).RD2([1, 1]) // VIEWMODE, render mode, lower left, upper right
        .B(0).BS(1000).B(1).BB(3).B(0).RD2([10, 10]).B(0).B(0).BS(0).BD(0).RD2([0, 0]).RD2([10, 10])
        .B(0).B(1).BD3([0, 0, 0]).BD3([1, 0, 0]).BD3([0, 1, 0]).BD(0).BS(0);
    }, (w) => w.H(HARD_PTR, 0).H(HARD_PTR, 0)); // named UCS, base UCS
  }

  writeDictionaries() {
    const dict = (h, owner, items, { reactors = owner ? [owner] : [], hard = 0, type = T.DICTIONARY, extra } = {}) => this.object(type, h, {
      owner, reactors,
      data: (w) => { w.BL(items.length).BS(1).RC(hard); for (const [name] of items) w.T(name); },
      handles: (w) => { for (const [, ih] of items) w.H(SOFT_OWN, ih); if (extra) extra(w); },
    });
    dict(H.NOD, 0, [["ACAD_GROUP", H.GROUP_DICT], ["ACAD_LAYOUT", H.LAYOUT_DICT], ["ACAD_MLINESTYLE", H.MLSTYLE_DICT], ["ACAD_PLOTSETTINGS", H.PLOTSETTINGS_DICT], ["ACAD_PLOTSTYLENAME", H.PLOTSTYLE_DICT]]);
    dict(H.GROUP_DICT, H.NOD, []);
    dict(H.PLOTSETTINGS_DICT, H.NOD, []);
    dict(H.PLOTSTYLE_DICT, H.NOD, [["Normal", H.NORMAL]], { type: T.DICTIONARYWDFLT, extra: (w) => w.H(HARD_PTR, H.NORMAL) });
    this.object(T.PLACEHOLDER, H.NORMAL, { owner: H.PLOTSTYLE_DICT, reactors: [H.PLOTSTYLE_DICT] });
    dict(H.MLSTYLE_DICT, H.NOD, [["Standard", H.MLSTYLE]]);
    this.object(T.MLINESTYLE, H.MLSTYLE, {
      owner: H.MLSTYLE_DICT, reactors: [H.MLSTYLE_DICT],
      data: (w) => {
        w.T("STANDARD").T("").BS(0).CMC(256).BD(Math.PI / 2).BD(Math.PI / 2).RC(2);
        for (const off of [0.5, -0.5]) w.BD(off).CMC(256).BS(32767);
      },
    });
    dict(H.LAYOUT_DICT, H.NOD, [["Layout1", H.LAYOUT1], ["Model", H.LAYOUT_MODEL]]);
    this.layout(H.LAYOUT_MODEL, "Model", 0, H.MS, { flags: 0x6b0, type: 0, scaleType: 0 });
    this.layout(H.LAYOUT1, "Layout1", 1, H.PS, { flags: 0x2b0, type: 5, scaleType: 16 });
  }

  layout(h, name, tab, block, { flags, type, scaleType }) {
    const lim = [this.hvPt("$LIMMIN", [0, 0, 0]), this.hvPt("$LIMMAX", [420, 297, 0])];
    const model = block === H.MS;
    this.object(T.LAYOUT, h, {
      owner: H.LAYOUT_DICT, reactors: [H.LAYOUT_DICT],
      data: (w) => {
        // Plot settings.
        w.T("").T("None").BS(flags).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0).T("").BD2([0, 0]).BS(0).BS(0).BS(type)
          .BD2([0, 0]).BD2([0, 0]).T("").BD(1).BD(1).T("").BS(scaleType).BD(1).BD2([0, 0]);
        // Layout.
        w.T(name).BS(tab).BS(1).BD3([0, 0, 0]).RD2(model ? lim[0] : [0, 0]).RD2(model ? lim[1] : [420, 297])
          .BD3([0, 0, 0]).BD3([1, 0, 0]).BD3([0, 1, 0]).BD(0).BS(0)
          .BD3(model ? this.ext.min : [0, 0, 0]).BD3(model ? this.ext.max : [0, 0, 0]);
      },
      handles: (w) => w.H(SOFT_PTR, block).H(SOFT_PTR, 0).H(HARD_PTR, 0).H(HARD_PTR, 0),
    });
  }

  // ---------------------------------------------------------------- sections

  // Header variables (R2000 order, see header_variables in the ODA document).
  headerVars(handseed, date) {
    const w = new DwgBitWriter(2048);
    const v = (n, c, d) => this.hv(n, c, d);
    const P = (n, d) => this.hvPt(n, d);
    const [days, ms] = julian(date);
    const NUL = (code = HARD_PTR) => w.H(code, 0);
    w.BD(412148564080.0).BD(1).BD(1).BD(1).T("m").T("").T("").T("").BL(0).BL(0);
    NUL(); // VX_TABLE_RECORD
    w.B(1).B(1); // DIMASO, DIMSHO
    w.B(v("$PLINEGEN", 70, 0)).B(v("$ORTHOMODE", 70, 0)).B(v("$REGENMODE", 70, 1)).B(v("$FILLMODE", 70, 1)).B(v("$QTEXTMODE", 70, 0))
      .B(v("$PSLTSCALE", 70, 1)).B(v("$LIMCHECK", 70, 0)).B(1).B(v("$SKPOLY", 70, 0)).B(v("$ANGDIR", 70, 0)).B(v("$SPLFRAME", 70, 0))
      .B(v("$MIRRTEXT", 70, 0)).B(v("$WORLDVIEW", 70, 1)).B(1).B(v("$PLIMCHECK", 70, 0)).B(v("$VISRETAIN", 70, 1)).B(v("$DISPSILH", 70, 0)).B(v("$PELLIPSE", 70, 0));
    w.BS(1).BS(3020).BS(v("$LUNITS", 70, 2)).BS(v("$LUPREC", 70, 4)).BS(v("$AUNITS", 70, 0)).BS(v("$AUPREC", 70, 0)).BS(v("$ATTMODE", 70, 1)).BS(v("$PDMODE", 70, 0));
    w.BS(0).BS(0).BS(0).BS(0).BS(0); // USERI1-5
    w.BS(v("$SPLINESEGS", 70, 8)).BS(6).BS(6).BS(6).BS(6).BS(6).BS(6).BS(3).BS(70).BS(0).BS(64).BS(v("$ISOLINES", 70, 4)).BS(0).BS(50);
    w.BD(v("$LTSCALE", 40, 1)).BD(v("$TEXTSIZE", 40, 2.5)).BD(v("$TRACEWID", 40, 1)).BD(1).BD(0).BD(0).BD(v("$ANGBASE", 50, 0) * DEG)
      .BD(v("$PDSIZE", 40, 0)).BD(v("$PLINEWID", 40, 0)).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0).BD(0.5).BD(20).BD(v("$CELTSCALE", 40, 1));
    w.T(".");
    w.BL(days).BL(ms).BL(days).BL(ms).BL(0).BL(0).BL(0).BL(0); // TDCREATE, TDUPDATE, TDINDWG, TDUSRTIMER
    w.CMC(256);
    w.H(0, handseed);
    w.H(HARD_PTR, H.LAYER0).H(HARD_PTR, H.STANDARD).H(HARD_PTR, H.BYLAYER).H(HARD_PTR, H.DIMSTYLE).H(HARD_PTR, H.MLSTYLE);
    w.BD(0); // PSVPSCALE
    // Paper space.
    w.BD3([0, 0, 0]).BD3([1e20, 1e20, 1e20]).BD3([-1e20, -1e20, -1e20]).RD2([0, 0]).RD2([420, 297]).BD(0).BD3([0, 0, 0]).BD3([1, 0, 0]).BD3([0, 1, 0]);
    NUL(); NUL(); w.BS(0); NUL();
    for (let i = 0; i < 6; i++) w.BD3([0, 0, 0]);
    // Model space.
    const lmin = P("$LIMMIN", [0, 0, 0]), lmax = P("$LIMMAX", [420, 297, 0]);
    w.BD3(P("$INSBASE", [0, 0, 0])).BD3(this.ext.min).BD3(this.ext.max).RD2(lmin).RD2(lmax).BD(v("$ELEVATION", 40, 0))
      .BD3([0, 0, 0]).BD3([1, 0, 0]).BD3([0, 1, 0]);
    NUL(); NUL(); w.BS(0); NUL();
    for (let i = 0; i < 6; i++) w.BD3([0, 0, 0]);
    const d = this.dims();
    w.T(d.DIMPOST).T(d.DIMAPOST);
    this.dimVars(w, d, true);
    w.BS(d.DIMLWD).BS(d.DIMLWE);
    // Table control objects and dictionaries.
    for (const h of [H.BLOCK_CONTROL, H.LAYER_CONTROL, H.STYLE_CONTROL, H.LTYPE_CONTROL, H.VIEW_CONTROL, H.UCS_CONTROL, H.VPORT_CONTROL, H.APPID_CONTROL, H.DIMSTYLE_CONTROL, H.VX_CONTROL]) w.H(HARD_OWN, h);
    w.H(HARD_PTR, H.GROUP_DICT).H(HARD_PTR, H.MLSTYLE_DICT).H(HARD_OWN, H.NOD);
    w.BS(1).BS(70).T("").T(""); // TSTACKALIGN, TSTACKSIZE, HYPERLINKBASE, STYLESHEET
    w.H(HARD_PTR, H.LAYOUT_DICT).H(HARD_PTR, H.PLOTSETTINGS_DICT).H(HARD_PTR, H.PLOTSTYLE_DICT);
    w.BL(0x2a1d); // FLAGS: CELWEIGHT by layer, LWDISPLAY off, XEDIT, EXTNAMES, PSTYLEMODE colour-dependent
    w.BS(v("$INSUNITS", 70, 4)).BS(0).T(guid()).T(guid()); // INSUNITS, CEPSNTYPE, FINGERPRINTGUID, VERSIONGUID
    w.H(HARD_PTR, H.PS).H(HARD_PTR, H.MS).H(HARD_PTR, H.BYLAYER).H(HARD_PTR, H.BYBLOCK).H(HARD_PTR, H.CONTINUOUS);
    w.BS(0).BS(0).BS(0).BS(0);
    return w.bytes();
  }

  classes() {
    const w = new DwgBitWriter();
    for (const [n, cpp, dxf] of CLASSES) w.BS(n).BS(0).T("ObjectDBX Classes").T(cpp).T(dxf).B(0).BS(0x1f3);
    return w.bytes();
  }

  file() {
    const date = this.opts.date instanceof Date ? this.opts.date : new Date();
    const handseed = this.next;
    const out = new ByteOut();
    const LOC = 0x19, NSEC = 6;
    const head = 0x19 + NSEC * 9 + 2 + 16;
    out.zeros(head);

    // AuxHeader (section 5).
    const [days, ms] = julian(date);
    const auxAt = out.pos;
    out.bytes([0xff, 0x77, 0x01]); out.rs(DWG_VERSION); out.rs(MAINT_VERSION); out.rl(1); out.rl(0xffffffff); out.rs(1); out.rs(0); out.rl(0);
    out.rs(DWG_VERSION); out.rs(MAINT_VERSION); out.rs(DWG_VERSION); out.rs(MAINT_VERSION);
    for (const x of [0x206, 0x23f0, 0x206, 0x23f0, 0, 1]) out.rs(x);
    out.zeros(20);
    out.rl(days); out.rl(ms); out.rl(days); out.rl(ms); out.rl(handseed); out.rl(0); out.rs(0); out.rs(1);
    out.zeros(12); out.rl(1); out.zeros(16);
    const auxSize = out.pos - auxAt;

    // Thumbnail (empty).
    const thumbAt = out.pos;
    out.bytes(SENTINEL.THUMB_BEGIN); out.rl(1); out.bytes([0]); out.bytes(SENTINEL.THUMB_END);

    // Header variables and classes: sentinel, RL size, data, CRC, sentinel.
    const section = (begin, data, end) => {
      const at = out.pos;
      out.bytes(begin);
      const s = out.pos;
      out.rl(data.length);
      out.bytes(data);
      out.rs(crc16(out.buf, 0xc0c1, s, out.pos));
      out.bytes(end);
      return [at, out.pos - at];
    };
    const hdr = section(SENTINEL.VARS_BEGIN, this.headerVars(handseed, date), SENTINEL.VARS_END);
    const cls = section(SENTINEL.CLASS_BEGIN, this.classes(), SENTINEL.CLASS_END);
    out.rl(0x0dca);

    // Objects: MS size, data, CRC.
    const objectsAt = out.pos;
    const handles = [...this.objects.keys()].sort((a, b) => a - b);
    const offsets = [];
    for (const h of handles) {
      const data = this.objects.get(h);
      const at = out.pos;
      offsets.push([h, at]);
      let n = data.length;
      do { const more = n >= 0x8000; out.rs((n & 0x7fff) | (more ? 0x8000 : 0)); n = Math.floor(n / 0x8000); if (!more) break; } while (n > 0);
      out.bytes(data);
      out.rs(crc16(out.buf, 0xc0c1, at, out.pos));
    }

    // Object map: pages of (handle delta, offset delta) with big-endian size and CRC.
    const mapAt = out.pos;
    const umc = (v) => { const b = []; do { let x = v % 128; v = Math.floor(v / 128); if (v > 0) x |= 0x80; b.push(x); } while (v > 0); return b; };
    const mc = (v) => {
      const b = [];
      let a = Math.abs(v);
      for (;;) {
        if (a < 0x40) { b.push(a | (v < 0 ? 0x40 : 0)); break; }
        b.push((a & 0x7f) | 0x80);
        a = Math.floor(a / 128);
      }
      return b;
    };
    const page = (body) => {
      const s = out.pos;
      out.bytes([(body.length + 2) >> 8, (body.length + 2) & 255]);
      out.bytes(body);
      const c = crc16(out.buf, 0xc0c1, s, out.pos);
      out.bytes([c >> 8, c & 255]);
    };
    let body = [], ph = 0, pl = 0;
    for (const [h, at] of offsets) {
      let pair = [...umc(h - ph), ...mc(at - pl)];
      // A page holds at most 2032 bytes (size + pairs + CRC); deltas restart per page.
      if (body.length + pair.length > 2028) { page(body); body = []; ph = 0; pl = 0; pair = [...umc(h), ...mc(at)]; }
      body.push(...pair);
      ph = h; pl = at;
    }
    if (body.length) page(body);
    page([]);
    const mapSize = out.pos - mapAt;

    // ObjFreeSpace (section 3).
    const freeAt = out.pos;
    out.rl(0); out.rl(handles.length); out.rl(days); out.rl(ms); out.rl(objectsAt); out.bytes([4]);
    for (const x of [0x32, 0, 0x64, 0, 0x200, 0, 0xffffffff, 0]) out.rl(x);
    const freeSize = out.pos - freeAt;

    // Second file header.
    const locators = [[0, hdr[0], hdr[1]], [1, cls[0], cls[1]], [2, mapAt, mapSize], [3, freeAt, freeSize], [4, 0, 0], [5, auxAt, auxSize]];
    const secondAt = out.pos;
    out.bytes(SENTINEL.SECOND_BEGIN);
    const sizeAt = out.pos;
    const w = new DwgBitWriter();
    w.RL(0).BL(secondAt);
    for (const ch of "AC1015") w.RC(ch.charCodeAt(0));
    for (let i = 0; i < 5; i++) w.RC(0);
    w.RC(MAINT_VERSION).RC(1).BS((MAINT_VERSION << 8) | DWG_VERSION).RS(CODEPAGE).BS(NSEC);
    for (const [nr, at, size] of locators) w.RC(nr).BL(at).BL(size);
    const hs = [handseed, H.BLOCK_CONTROL, H.LAYER_CONTROL, H.STYLE_CONTROL, H.LTYPE_CONTROL, H.VIEW_CONTROL, H.UCS_CONTROL, H.VPORT_CONTROL, H.APPID_CONTROL, H.DIMSTYLE_CONTROL, H.VX_CONTROL, H.NOD, H.MLSTYLE_DICT, H.GROUP_DICT];
    w.BS(hs.length);
    hs.forEach((h, i) => {
      const b = [];
      for (let x = h; x > 0; x = Math.floor(x / 256)) b.unshift(x % 256);
      w.RC(b.length).RC(i);
      for (const x of b) w.RC(x);
    });
    w.align();
    const second = w.bytes();
    const secondSize = second.length + 2 + 8;
    second[0] = secondSize & 255; second[1] = (secondSize >> 8) & 255; second[2] = (secondSize >> 16) & 255; second[3] = secondSize >>> 24;
    out.bytes(second);
    out.rs(crc16(out.buf, 0xc0c1, sizeAt, out.pos));
    out.zeros(8);
    out.bytes(SENTINEL.SECOND_END);

    // Template (section 4): description (none) and MEASUREMENT.
    const tplAt = out.pos;
    out.rs(0); out.rs(this.hv("$MEASUREMENT", 70, 1));
    locators[4] = [4, tplAt, out.pos - tplAt];

    // File header with the locators.
    const b = out.buf;
    b.set([..."AC1015"].map((ch) => ch.charCodeAt(0)), 0);
    b[0x0b] = MAINT_VERSION; b[0x0c] = 1;
    out.put32(0x0d, thumbAt);
    b[0x11] = DWG_VERSION; b[0x12] = MAINT_VERSION;
    out.put16(0x13, CODEPAGE);
    out.put32(0x15, NSEC);
    locators.forEach(([nr, at, size], i) => { b[LOC + i * 9] = nr; out.put32(LOC + i * 9 + 1, at); out.put32(LOC + i * 9 + 5, size); });
    const e = LOC + NSEC * 9;
    out.put16(e, crc16(b, 0xc0c1, 0, e));
    b.set(SENTINEL.HEADER_END, e + 2);
    return b.slice(0, out.pos);
  }
}

// Byte-aligned output buffer.
class ByteOut {
  constructor() { this.buf = new Uint8Array(1 << 16); this.pos = 0; }
  need(n) { if (this.pos + n > this.buf.length) { const b = new Uint8Array(Math.max(this.pos + n, this.buf.length * 2)); b.set(this.buf); this.buf = b; } }
  bytes(a) { this.need(a.length); this.buf.set(a, this.pos); this.pos += a.length; }
  zeros(n) { this.need(n); this.pos += n; }
  rs(v) { this.bytes([v & 255, (v >> 8) & 255]); }
  rl(v) { v >>>= 0; this.bytes([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]); }
  put16(at, v) { this.buf[at] = v & 255; this.buf[at + 1] = (v >> 8) & 255; }
  put32(at, v) { v >>>= 0; this.buf[at] = v & 255; this.buf[at + 1] = (v >>> 8) & 255; this.buf[at + 2] = (v >>> 16) & 255; this.buf[at + 3] = v >>> 24; }
}

// Object coordinate system → world (AutoCAD's arbitrary axis algorithm).
function ocsToWcs(n, v) {
  const len = Math.hypot(...n) || 1;
  const N = n.map((x) => x / len);
  if (Math.abs(N[0]) < 1e-12 && Math.abs(N[1]) < 1e-12 && N[2] > 0) return v.slice();
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let ax = Math.abs(N[0]) < 1 / 64 && Math.abs(N[1]) < 1 / 64 ? cross([0, 1, 0], N) : cross([0, 0, 1], N);
  const l = Math.hypot(...ax);
  ax = ax.map((x) => x / l);
  const ay = cross(N, ax);
  return [0, 1, 2].map((k) => ax[k] * v[0] + ay[k] * v[1] + N[k] * v[2]);
}
