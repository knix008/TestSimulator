// Writing DWG R2000 (AC1015) files (Open Design Specification chapters 3, 9, 10, 14, 20, 22, 23, 25, 26): a file
// header with five section locators, the header variables, the classes, the objects, the object map, the
// "unknown" section, the second file header, an empty preview and the template (MEASUREMENT).
// R2004 (AC1018, `version: 'R2004'`): the same objects in their R2004 form (no extension-dictionary handles, no
// entity links, block owned-entity lists, layout viewports, class counts) in the paged, compressed container of
// chapter 4 (r2004-write.js).
// R2007 (AC1021), R2010 (AC1024), R2013 (AC1027), R2018 (AC1032): text as UTF-16 in each object's string stream,
// the handle stream after it (R2010+: its size before the object type, written as 2 bits + a byte); entities with
// material, shadow (R2007) and visual-style (R2010) flags; table entries without their xref bits; the header with
// the R2007 variables in three streams (header.js) — after LibreDWG's dwg.spec. R2010+ go into the R2004
// container, R2007 into its own Reed–Solomon coded one (r2007-write.js).
//
// The drawing is the minimal set AutoCAD itself writes for a new R2000 file (tables and their control objects,
// the named-object dictionary with groups, layouts, multiline styles, plot settings and plot style names, model and
// paper space with their layouts), with the same handles for those, plus the drawing's own layers, line types and
// model-space entities: LINE, CIRCLE, ARC, ELLIPSE, POINT, TEXT, SOLID, LWPOLYLINE.
import { BitWriter, R2000, R2004, R2007, R2010, R2013, R2018, crc8, encodeMS, encodeMC, dwgError } from './bits.js';
import { r2004File } from './r2004-write.js';
import { r2007File } from './r2007-write.js';
import { writeHeader, section } from './header.js';
import { DIMSTYLE_FIELDS } from './objects.js';

const SENT_CLASSES = [0x8d, 0xa1, 0xc4, 0xb8, 0xc4, 0xa9, 0xf8, 0xc5, 0xc0, 0xdc, 0xf4, 0x5f, 0xe7, 0xcf, 0xb6, 0x8a];
const SENT_CLASSES_END = [0x72, 0x5e, 0x3b, 0x47, 0x3b, 0x56, 0x07, 0x3a, 0x3f, 0x23, 0x0b, 0xa0, 0x18, 0x30, 0x49, 0x75];
const SENT_FILE = [0x95, 0xa0, 0x4e, 0x28, 0x99, 0x82, 0x1a, 0xe5, 0x5e, 0x41, 0xe0, 0x5f, 0x9d, 0x3a, 0x4d, 0x00];
const SENT_IMAGE = [0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f, 0x9d, 0x44, 0x10, 0x2b];
const SENT_IMAGE_END = [0xe0, 0xda, 0x92, 0xf8, 0x2b, 0xc9, 0xd7, 0xd7, 0x62, 0xa8, 0x35, 0xc0, 0x62, 0xbb, 0xef, 0xd4];
const SENT_2ND = [0xd4, 0x7b, 0x21, 0xce, 0x28, 0x93, 0x9f, 0xbf, 0x53, 0x24, 0x40, 0x09, 0x12, 0x3c, 0xaa, 0x01];
const SENT_2ND_END = [0x2b, 0x84, 0xde, 0x31, 0xd7, 0x6c, 0x60, 0x40, 0xac, 0xdb, 0xbf, 0xf6, 0xed, 0xc3, 0x55, 0xfe];
const UNKNOWN_SECTION = [0xa7, 0x62, 0x25, 0x00, 0xf6, 0xaf, 0x25, 0x02, 0x3b, 0x04, 0x00, 0x00, 0x04, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00];

// Handle reference codes (2.13).
const SOFT_OWNER = 2, HARD_OWNER = 3, SOFT_PTR = 4, HARD_PTR = 5;
// Fixed handles of the standard objects (as AutoCAD numbers them in a new drawing).
const H = {
  BLOCK_CONTROL: 0x1, LAYER_CONTROL: 0x2, STYLE_CONTROL: 0x3, LTYPE_CONTROL: 0x5, VIEW_CONTROL: 0x6, UCS_CONTROL: 0x7,
  VPORT_CONTROL: 0x8, APPID_CONTROL: 0x9, DIMSTYLE_CONTROL: 0xa, VX_CONTROL: 0xb, NAMED: 0xc, GROUPS: 0xd, PLOTSTYLES: 0xe,
  NORMAL: 0xf, LAYER0: 0x10, STANDARD: 0x11, ACAD: 0x12, BYBLOCK: 0x14, BYLAYER: 0x15, CONTINUOUS: 0x16, MLSTYLES: 0x17,
  MLSTANDARD: 0x18, PLOTSETTINGS: 0x19, LAYOUTS: 0x1a, PSPACE: 0x1b, PSPACE_BLOCK: 0x1c, PSPACE_END: 0x1d, LAYOUT1: 0x1e,
  MSPACE: 0x1f, MSPACE_BLOCK: 0x20, MSPACE_END: 0x21, MODEL: 0x22, DIMSTANDARD: 0x27, VPORT: 0x28, FIRST_FREE: 0x30,
};
const TYPE = {
  TEXT: 1, BLOCK: 4, ENDBLK: 5, ARC: 17, CIRCLE: 18, LINE: 19, POINT: 27, SOLID: 31, ELLIPSE: 35, DICTIONARY: 42,
  BLOCK_CONTROL: 48, BLOCK_HEADER: 49, LAYER_CONTROL: 50, LAYER: 51, STYLE_CONTROL: 52, STYLE: 53, LTYPE_CONTROL: 56,
  LTYPE: 57, VIEW_CONTROL: 60, UCS_CONTROL: 62, VPORT_CONTROL: 64, VPORT: 65, APPID_CONTROL: 66, APPID: 67,
  DIMSTYLE_CONTROL: 68, DIMSTYLE: 69, VX_CONTROL: 70, MLINESTYLE: 73, LWPOLYLINE: 77,
  DICTIONARYWDFLT: 500, PLACEHOLDER: 501, LAYOUT: 502,
};
const CLASSES = [
  [500, 'AcDbDictionaryWithDefault', 'ACDBDICTIONARYWDFLT'],
  [501, 'AcDbPlaceHolder', 'ACDBPLACEHOLDER'],
  [502, 'AcDbLayout', 'LAYOUT'],
];

/** One object: its data stream (type, end bit, handle, no EED, …) and its handle stream; MS size before, CRC after. */
class ObjBase {
  constructor(type, handle, version = R2000) {
    this.handle = handle; this.type = type; this.v = version;
    this.d = new BitWriter(version); this.h = new BitWriter(version);
    // R2007+: the object's texts go to its string stream.
    if (version >= R2007) { this.s = new BitWriter(version); this.d.strings = this.s; }
    if (version >= R2010) this.d.OT(type); else this.d.BS(type);
    // R2000–R2007: the end bit (where the handles start) follows the type; R2010+ derives it from the size.
    if (version < R2010) { this.endAt = this.d.bit; this.d.RL(0); }
    this.d.H(0, handle); this.d.BS(0);
  }
  /** Common object data (non-entities): reactors (soft pointers), owner, no extension dictionary. */
  object(owner, reactors = []) {
    this.d.BL(reactors.length);
    if (this.v >= R2004) this.d.B(1); // R2004+: no extension dictionary (and no handle for it)
    if (this.v >= R2013) this.d.B(0); // R2013+: no binary data
    this.h.H(SOFT_PTR, owner); for (const r of reactors) this.h.H(SOFT_PTR, r);
    if (this.v < R2004) this.h.H(HARD_OWNER, 0);
    return this;
  }
  /** Common entity data: entity mode (0 owned by a block, 1 paper space, 2 model space), links, layer, look. */
  entity({ mode = 2, owner = 0, layer = H.LAYER0, color = 256, ltype = 0, prev = 0, next = 0, lineweight = 29 }) {
    const d = this.d; const r2004 = this.v >= R2004;
    // R2004+: entities are no longer linked (the block lists them); no extension dictionary.
    const linked = r2004 || (prev === this.handle - 1 && next === this.handle + 1);
    d.B(0); d.BB(mode); d.BL(0);
    if (r2004) d.B(1); else d.B(linked ? 1 : 0); // R2004+: no extension dictionary; before: linked
    if (this.v >= R2013) d.B(0); // R2013+: no binary data
    d.BS(color); d.BD(1); d.BB(ltype ? 3 : 0);
    // R2007+: material by layer, plot style by layer, shadows cast and received; R2010+: no visual styles.
    if (this.v >= R2007) { d.BB(0); d.BB(0); d.RC(0); } else d.BB(0);
    if (this.v >= R2010) { d.B(0); d.B(0); d.B(0); }
    d.BS(0); d.RC(lineweight);
    if (mode === 0) this.h.H(SOFT_PTR, owner);
    if (!r2004) this.h.H(HARD_OWNER, 0);
    if (!linked) { this.h.H(SOFT_PTR, prev); this.h.H(SOFT_PTR, next); }
    this.h.H(HARD_PTR, layer);
    if (ltype) this.h.H(HARD_PTR, ltype);
    return this;
  }
  /** A table entry's name, the 64 flag (referenced), no xref (R2007+: the name and a zero short). */
  entry(name) { this.d.T(name); if (this.v >= R2007) this.d.BS(0); else { this.d.B(1); this.d.BS(0); this.d.B(0); } return this; }
  bytes() {
    // R2007+: the string stream, its size in bits and the has-strings bit close the data.
    if (this.v >= R2007) {
      const n = this.s.bit;
      this.d.append(this.s);
      if (n) { if (n >= 0x8000) { this.d.RS((n >> 15) & 0xffff); this.d.RS((n & 0x7fff) | 0x8000); } else this.d.RS(n); }
      this.d.B(n ? 1 : 0);
    }
    const end = this.d.bit;
    if (this.v < R2010) { const keep = this.d.bit; this.d.bit = this.endAt; this.d.RL(end); this.d.bit = keep; }
    this.d.append(this.h);
    this.d.align();
    const body = this.d.bytes();
    // R2010+: the handle stream's size in bits (from the end bit to the object's last byte) after the size.
    const pre = [...encodeMS(body.length), ...(this.v >= R2010 ? encodeMC(body.length * 8 - end, false) : [])];
    const out = new Uint8Array(pre.length + body.length + 2);
    out.set(pre, 0); out.set(body, pre.length);
    const crc = crc8(0xc0c1, out, 0, pre.length + body.length);
    out[pre.length + body.length] = crc & 255; out[pre.length + body.length + 1] = crc >> 8;
    return out;
  }
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const LTYPES = {
  HIDDEN: { description: 'Hidden __ __ __ __ __ __ __ __ __ __ __ __ __ __ __', pattern: [6.35, -3.175] },
  DASHED: { description: 'Dashed __ __ __ __ __ __ __ __ __ __ __ __ __ __ _', pattern: [12.7, -6.35] },
  CENTER: { description: 'Center ____ _ ____ _ ____ _ ____ _ ____ _ ____ _', pattern: [31.75, -6.35, 6.35, -6.35] },
  PHANTOM: { description: 'Phantom ______  __  __  ______  __  __  ______', pattern: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] },
};

/**
 * DWG R2000 bytes of a drawing: { layers: [{ name, color, ltype }], entities: [{ name, layerName, color, … as the
 * plain model of dxf-read.js }], units (INSUNITS, 4 = mm), extents? }.
 */
export const DWG_WRITE_VERSIONS = { R2000, R2004, R2007, R2010, R2013, R2018 };

export function writeDwg({ layers = [], entities = [], units = 4, date = new Date(), version = 'R2000', extraSections = [] } = {}) {
  const V = DWG_WRITE_VERSIONS[version] ?? R2000;
  const r2004 = V >= R2004;
  const Obj = class extends ObjBase { constructor(type, handle) { super(type, handle, V); } };
  const objects = []; // [handle, bytes]
  const put = (o) => { objects.push([o.handle, o.bytes()]); return o.handle; };
  let next = H.FIRST_FREE;
  const alloc = () => next++;
  // Line types: the standard three, then those the layers name.
  const ltypeNames = [...new Set(layers.map((l) => String(l.ltype ?? 'CONTINUOUS').toUpperCase()).filter((n) => n !== 'CONTINUOUS' && n !== 'BYLAYER' && n !== 'BYBLOCK'))];
  const ltypeHandles = new Map([['CONTINUOUS', H.CONTINUOUS], ['BYLAYER', H.BYLAYER], ['BYBLOCK', H.BYBLOCK]]);
  for (const n of ltypeNames) ltypeHandles.set(n, alloc());
  // Layers: 0 first, then the drawing's (deduplicated, case-insensitively).
  const layerHandles = new Map([['0', H.LAYER0]]);
  const extraLayers = [];
  for (const l of layers) { const key = String(l.name ?? '').toUpperCase(); if (!key || key === '0' || [...layerHandles.keys()].some((k) => k.toUpperCase() === key)) continue; const h = alloc(); layerHandles.set(l.name, h); extraLayers.push({ ...l, handle: h }); }
  for (const e of entities) { if (e.layerName && ![...layerHandles.keys()].some((k) => k.toUpperCase() === String(e.layerName).toUpperCase())) { const h = alloc(); layerHandles.set(e.layerName, h); extraLayers.push({ name: e.layerName, color: 7, handle: h }); } }
  const layerOf = (name) => { for (const [k, h] of layerHandles) if (k.toUpperCase() === String(name ?? '0').toUpperCase()) return h; return H.LAYER0; };
  // Model-space entities: consecutive handles, linked first to last.
  const written = entities.filter((e) => ENTITY_WRITERS[e.name]);
  const entityHandles = written.map(() => alloc());
  const HANDSEED = next;

  // ——— control objects ———
  const control = (type, handle, entries, extra = () => {}) => {
    const o = new Obj(type, handle);
    o.d.BL(0); // reactors
    if (r2004) o.d.B(1);
    if (V >= R2013) o.d.B(0); // R2013+: no binary data
    o.d.BL(entries.length);
    o.h.H(SOFT_PTR, 0); if (!r2004) o.h.H(HARD_OWNER, 0);
    for (const e of entries) o.h.H(SOFT_OWNER, e);
    extra(o);
    return put(o);
  };
  control(TYPE.BLOCK_CONTROL, H.BLOCK_CONTROL, [], (o) => { o.h.H(HARD_OWNER, H.MSPACE); o.h.H(HARD_OWNER, H.PSPACE); });
  control(TYPE.LAYER_CONTROL, H.LAYER_CONTROL, [H.LAYER0, ...extraLayers.map((l) => l.handle)]);
  control(TYPE.STYLE_CONTROL, H.STYLE_CONTROL, [H.STANDARD]);
  control(TYPE.LTYPE_CONTROL, H.LTYPE_CONTROL, [H.CONTINUOUS, ...ltypeNames.map((n) => ltypeHandles.get(n))], (o) => { o.h.H(HARD_OWNER, H.BYLAYER); o.h.H(HARD_OWNER, H.BYBLOCK); });
  control(TYPE.VIEW_CONTROL, H.VIEW_CONTROL, []);
  control(TYPE.UCS_CONTROL, H.UCS_CONTROL, []);
  control(TYPE.VPORT_CONTROL, H.VPORT_CONTROL, [H.VPORT]);
  control(TYPE.APPID_CONTROL, H.APPID_CONTROL, [H.ACAD]);
  // The dimension style table also lists its entries once more after a count (R2000+, 20.4.67).
  {
    const o = new Obj(TYPE.DIMSTYLE_CONTROL, H.DIMSTYLE_CONTROL);
    o.d.BL(0); if (r2004) o.d.B(1); if (V >= R2013) o.d.B(0); o.d.BL(1); o.d.RC(1);
    o.h.H(SOFT_PTR, 0); if (!r2004) o.h.H(HARD_OWNER, 0); o.h.H(SOFT_OWNER, H.DIMSTANDARD); o.h.H(HARD_PTR, H.DIMSTANDARD);
    put(o);
  }
  control(TYPE.VX_CONTROL, H.VX_CONTROL, []);

  // ——— dictionaries ———
  const dictionary = (type, handle, owner, entries, { reactors = [owner], defaultEntry = 0 } = {}) => {
    const o = new Obj(type, handle).object(owner, owner ? reactors : []);
    o.d.BL(entries.length); o.d.BS(1); o.d.RC(0);
    for (const [name] of entries) o.d.T(name);
    for (const [, h] of entries) o.h.H(SOFT_OWNER, h);
    if (type === TYPE.DICTIONARYWDFLT) o.h.H(HARD_PTR, defaultEntry);
    return put(o);
  };
  dictionary(TYPE.DICTIONARY, H.NAMED, 0, [['ACAD_GROUP', H.GROUPS], ['ACAD_LAYOUT', H.LAYOUTS], ['ACAD_MLINESTYLE', H.MLSTYLES], ['ACAD_PLOTSETTINGS', H.PLOTSETTINGS], ['ACAD_PLOTSTYLENAME', H.PLOTSTYLES]]);
  dictionary(TYPE.DICTIONARY, H.GROUPS, H.NAMED, []);
  dictionary(TYPE.DICTIONARYWDFLT, H.PLOTSTYLES, H.NAMED, [['Normal', H.NORMAL]], { defaultEntry: H.NORMAL });
  put(new Obj(TYPE.PLACEHOLDER, H.NORMAL).object(H.PLOTSTYLES, [H.PLOTSTYLES]));
  dictionary(TYPE.DICTIONARY, H.MLSTYLES, H.NAMED, [['Standard', H.MLSTANDARD]]);
  dictionary(TYPE.DICTIONARY, H.PLOTSETTINGS, H.NAMED, []);
  dictionary(TYPE.DICTIONARY, H.LAYOUTS, H.NAMED, [['Layout1', H.LAYOUT1], ['Model', H.MODEL]]);
  {
    const o = new Obj(TYPE.MLINESTYLE, H.MLSTANDARD).object(H.MLSTYLES, [H.MLSTYLES]);
    o.d.T('STANDARD'); o.d.T(''); o.d.BS(0); o.d.CMC(256); o.d.BD(Math.PI / 2); o.d.BD(Math.PI / 2);
    // Each line's line type: an index (32767 = by layer) until R2013, a handle (to ByLayer) since R2018.
    o.d.RC(2); for (const off of [0.5, -0.5]) { o.d.BD(off); o.d.CMC(256); if (V >= R2018) o.h.H(HARD_PTR, H.BYLAYER); else o.d.BS(32767); }
    put(o);
  }

  // ——— tables ———
  const layerEntry = (handle, name, color, ltype) => {
    const o = new Obj(TYPE.LAYER, handle).object(H.LAYER_CONTROL).entry(name);
    o.d.BS(16 | (31 << 5)); o.d.CMC(Math.abs(color) || 7);
    // xref, plot style, (R2007+) material, line type, (R2013+) visual style
    o.h.H(HARD_PTR, 0); o.h.H(HARD_PTR, H.NORMAL); if (V >= R2007) o.h.H(HARD_PTR, 0); o.h.H(HARD_PTR, ltype); if (V >= R2013) o.h.H(HARD_PTR, 0);
    put(o);
  };
  layerEntry(H.LAYER0, '0', 7, H.CONTINUOUS);
  for (const l of extraLayers) layerEntry(l.handle, l.name, l.color ?? 7, ltypeHandles.get(String(l.ltype ?? 'CONTINUOUS').toUpperCase()) ?? H.CONTINUOUS);
  {
    const o = new Obj(TYPE.STYLE, H.STANDARD).object(H.STYLE_CONTROL).entry('Standard');
    o.d.B(0); o.d.B(0); o.d.BD(0); o.d.BD(1); o.d.BD(0); o.d.RC(0); o.d.BD(2.5); o.d.T('txt'); o.d.T('');
    o.h.H(HARD_PTR, 0);
    put(o);
  }
  {
    const o = new Obj(TYPE.APPID, H.ACAD).object(H.APPID_CONTROL).entry('ACAD');
    o.d.RC(0); o.h.H(HARD_PTR, 0);
    put(o);
  }
  const ltypeEntry = (handle, name, description, pattern = []) => {
    const o = new Obj(TYPE.LTYPE, handle).object(H.LTYPE_CONTROL).entry(name);
    o.d.T(description); o.d.BD(pattern.reduce((s, x) => s + Math.abs(x), 0)); o.d.RC(65); o.d.RC(pattern.length);
    for (const len of pattern) { o.d.BD(len); o.d.BS(0); o.d.RD(0); o.d.RD(0); o.d.BD(1); o.d.BD(0); o.d.BS(0); }
    // The dashes' text area: 256 bytes until R2004; R2007+ only when a dash has text (none here).
    if (V < R2007) o.d.rawBytes(new Uint8Array(256));
    o.h.H(HARD_PTR, 0);
    for (let i = 0; i < pattern.length; i++) o.h.H(HARD_PTR, 0);
    put(o);
  };
  ltypeEntry(H.BYBLOCK, 'ByBlock', '');
  ltypeEntry(H.BYLAYER, 'ByLayer', '');
  ltypeEntry(H.CONTINUOUS, 'Continuous', 'Solid line');
  for (const n of ltypeNames) { const def = LTYPES[n] ?? LTYPES.DASHED; ltypeEntry(ltypeHandles.get(n), n, def.description, def.pattern); }
  {
    const o = new Obj(TYPE.DIMSTYLE, H.DIMSTANDARD).object(H.DIMSTYLE_CONTROL).entry('Standard');
    const vals = {
      DIMSCALE: 1, DIMASZ: 2.5, DIMEXO: 0.625, DIMDLI: 3.75, DIMEXE: 1.25, DIMTXT: 2.5, DIMCEN: 2.5, DIMALTF: 25.4, DIMLFAC: 1,
      DIMTFAC: 1, DIMGAP: 0.625, DIMTAD: 1, DIMZIN: 8, DIMALTD: 3, DIMDEC: 2, DIMTDEC: 2, DIMALTU: 2, DIMALTTD: 3, DIMLUNIT: 2,
      DIMDSEP: 44, DIMTOLJ: 1, DIMFIT: 3, DIMLWD: -2, DIMLWE: -2,
    };
    for (const [type, name] of DIMSTYLE_FIELDS(V)) {
      const x = vals[name] ?? (type === 'TV' || type === 'T' ? '' : 0);
      if (type === 'B') o.d.B(x ? 1 : 0); else if (type === 'BS') o.d.BS(x); else if (type === 'BD') o.d.BD(x); else if (type === 'CMC') o.d.CMC(x); else o.d.T(x);
    }
    o.d.B(0);
    // xref, text style, leader / arrow blocks, (R2007+) dimension line types
    o.h.H(HARD_PTR, 0); o.h.H(HARD_PTR, H.STANDARD); for (let i = 0; i < 4; i++) o.h.H(HARD_PTR, 0);
    if (V >= R2007) for (let i = 0; i < 3; i++) o.h.H(HARD_PTR, 0);
    put(o);
  }
  {
    const o = new Obj(TYPE.VPORT, H.VPORT).object(H.VPORT_CONTROL).entry('*Active');
    const d = o.d;
    d.BD(297); d.BD(297 * 1.6); d.RD2([210, 148.5]); d.BD3([0, 0, 0]); d.BD3([0, 0, 1]); d.BD(0); d.BD(50); d.BD(0); d.BD(0); d.bits(0, 4); d.RC(0);
    // R2007+: default lights (one distant light), brightness, contrast, ambient colour 250.
    if (V >= R2007) { d.B(1); d.RC(1); d.BD(0); d.BD(0); d.CMC(250); }
    d.RD2([0, 0]); d.RD2([1, 1]); d.B(0); d.BS(100); d.B(1); d.bits(3, 2); d.B(0); d.RD2([10, 10]); d.B(0); d.B(0); d.BS(0); d.BD(0); d.RD2([0, 0]); d.RD2([10, 10]);
    d.B(0); d.B(1); d.BD3([0, 0, 0]); d.BD3([1, 0, 0]); d.BD3([0, 1, 0]); d.BD(0); d.BS(0);
    if (V >= R2007) { d.BS(3); d.BS(5); } // grid flags, major grid lines
    // xref, (R2007+) background, visual style, sun, then named and base UCS
    o.h.H(HARD_PTR, 0); if (V >= R2007) { o.h.H(SOFT_PTR, 0); o.h.H(HARD_PTR, 0); o.h.H(HARD_OWNER, 0); } o.h.H(HARD_PTR, 0); o.h.H(HARD_PTR, 0);
    put(o);
  }

  // ——— model and paper space ———
  const blockHeader = (handle, name, blockEntity, endblk, owned, layout) => {
    const o = new Obj(TYPE.BLOCK_HEADER, handle).object(H.BLOCK_CONTROL).entry(name);
    const d = o.d;
    d.B(0); d.B(0); d.B(0); d.B(0); d.B(0); // anonymous, attributes, xref, overlaid, loaded
    if (r2004) d.BL(owned.length); // R2004+: the owned entities are listed
    d.BD3([0, 0, 0]); d.T(''); d.RC(0); d.T(''); d.BL(0);
    if (V >= R2007) { d.BS(0); d.B(1); d.RC(0); } // insert units, explodable, any scaling
    o.h.H(HARD_PTR, 0); o.h.H(HARD_OWNER, blockEntity);
    if (r2004) for (const e of owned) o.h.H(HARD_OWNER, e);
    else { o.h.H(SOFT_PTR, owned[0] ?? 0); o.h.H(SOFT_PTR, owned.at(-1) ?? 0); }
    o.h.H(HARD_OWNER, endblk); o.h.H(HARD_PTR, layout);
    put(o);
  };
  const blockEnt = (type, handle, mode, name) => {
    const o = new Obj(type, handle).entity({ mode, layer: H.LAYER0 });
    if (type === TYPE.BLOCK) o.d.T(name);
    put(o);
  };
  blockHeader(H.PSPACE, '*Paper_Space', H.PSPACE_BLOCK, H.PSPACE_END, [], H.LAYOUT1);
  blockEnt(TYPE.BLOCK, H.PSPACE_BLOCK, 1, '*Paper_Space'); blockEnt(TYPE.ENDBLK, H.PSPACE_END, 1);
  blockHeader(H.MSPACE, '*Model_Space', H.MSPACE_BLOCK, H.MSPACE_END, entityHandles, H.MODEL);
  blockEnt(TYPE.BLOCK, H.MSPACE_BLOCK, 2, '*Model_Space'); blockEnt(TYPE.ENDBLK, H.MSPACE_END, 2);
  const layout = (handle, name, tab, block, paper) => {
    const o = new Obj(TYPE.LAYOUT, handle).object(H.LAYOUTS, [H.LAYOUTS]);
    const d = o.d;
    d.T(''); d.T('None'); d.BS(paper ? 688 : 1712); for (let i = 0; i < 4; i++) d.BD(0); d.BD(0); d.BD(0); d.T(''); d.BD2([0, 0]);
    d.BS(1); d.BS(0); d.BS(paper ? 5 : 0); d.BD2([0, 0]); d.BD2([0, 0]);
    if (!r2004) d.T(''); // the plot view by name (R2004+: by handle)
    d.BD(1); d.BD(1); d.T(''); d.BS(paper ? 16 : 0); d.BD(1); d.BD2([0, 0]);
    if (r2004) { d.BS(0); d.BS(2); d.BS(300); } // shade plot mode, resolution level, custom DPI
    d.T(name); d.BL(tab); d.BS(1); d.BD3([0, 0, 0]); d.RD2([0, 0]); d.RD2([420, 297]); d.BD3([0, 0, 0]); d.BD3([1, 0, 0]); d.BD3([0, 1, 0]); d.BD(0); d.BS(0);
    d.BD3(paper ? [1e20, 1e20, 1e20] : [0, 0, 0]); d.BD3(paper ? [-1e20, -1e20, -1e20] : [0, 0, 0]);
    if (r2004) { d.BL(0); o.h.H(HARD_PTR, 0); } // no viewports; the plot view
    if (V >= R2007) o.h.H(SOFT_PTR, 0); // the shade-plot visual style
    o.h.H(SOFT_PTR, block); o.h.H(SOFT_PTR, 0); o.h.H(HARD_PTR, 0); o.h.H(HARD_PTR, 0);
    put(o);
  };
  layout(H.LAYOUT1, 'Layout1', 1, H.PSPACE, true);
  layout(H.MODEL, 'Model', 0, H.MSPACE, false);

  // ——— entities ———
  let lo = [Infinity, Infinity, Infinity]; let hi = [-Infinity, -Infinity, -Infinity];
  const grow = (p) => { for (let k = 0; k < 3; k++) { const x = p[k] ?? 0; if (isNum(x)) { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); } } };
  written.forEach((e, i) => {
    const handle = entityHandles[i];
    const o = new Obj(TYPE[e.name], handle).entity({ mode: 2, layer: layerOf(e.layerName), color: e.color?.index ?? 256, prev: entityHandles[i - 1] ?? 0, next: entityHandles[i + 1] ?? 0 });
    ENTITY_WRITERS[e.name](o.d, o.h, e, grow);
    put(o);
  });
  if (!(lo[0] <= hi[0])) { lo = [0, 0, 0]; hi = [0, 0, 0]; }

  // ——— header variables ———
  const julian = (dt) => dt.getTime() / 86400000 + 2440587.5;
  const jd = julian(date);
  const header = writeHeader({
    HANDSEED, CLAYER: H.LAYER0, TEXTSTYLE: H.STANDARD, CELTYPE: H.BYLAYER, DIMSTYLE: H.DIMSTANDARD, CMLSTYLE: H.MLSTANDARD,
    DIMTXSTY: H.STANDARD, INSUNITS: units, EXTMIN: lo, EXTMAX: hi, LIMMAX: [420, 297], PLIMMAX: [420, 297], TEXTSIZE: 2.5,
    TDCREATE_DAY: Math.floor(jd), TDCREATE_MS: Math.round((jd % 1) * 86400000), TDUPDATE_DAY: Math.floor(jd), TDUPDATE_MS: Math.round((jd % 1) * 86400000),
    BLOCK_CONTROL: H.BLOCK_CONTROL, LAYER_CONTROL: H.LAYER_CONTROL, STYLE_CONTROL: H.STYLE_CONTROL, LTYPE_CONTROL: H.LTYPE_CONTROL,
    VIEW_CONTROL: H.VIEW_CONTROL, UCS_CONTROL: H.UCS_CONTROL, VPORT_CONTROL: H.VPORT_CONTROL, APPID_CONTROL: H.APPID_CONTROL,
    DIMSTYLE_CONTROL: H.DIMSTYLE_CONTROL, VX_CONTROL: H.VX_CONTROL, DICT_ACAD_GROUP: H.GROUPS, DICT_ACAD_MLINESTYLE: H.MLSTYLES,
    DICT_NAMED_OBJECTS: H.NAMED, DICT_LAYOUTS: H.LAYOUTS, DICT_PLOTSETTINGS: H.PLOTSETTINGS, DICT_PLOTSTYLES: H.PLOTSTYLES,
    BLOCK_RECORD_PSPACE: H.PSPACE, BLOCK_RECORD_MSPACE: H.MSPACE, LTYPE_BYLAYER: H.BYLAYER, LTYPE_BYBLOCK: H.BYBLOCK, LTYPE_CONTINUOUS: H.CONTINUOUS,
    DIMASZ: 2.5, DIMEXO: 0.625, DIMDLI: 3.75, DIMEXE: 1.25, DIMTXT: 2.5, DIMCEN: 2.5, DIMGAP: 0.625, MEASUREMENT: 1,
  }, V);

  // ——— classes ———
  const cw = new BitWriter(V);
  // R2004+: the largest class number, two zero bytes and a set bit before the classes; each class then counts its
  // instances and the release that made it. R2007+: the three names of every class in a string stream after them.
  if (r2004) { cw.BS(CLASSES.at(-1)[0]); cw.RC(0); cw.RC(0); cw.B(1); }
  const cs = new BitWriter(V); cw.strings = cs;
  for (const [num, cpp, dxf] of CLASSES) {
    cw.BS(num); cw.BS(0);
    if (V < R2007) { cw.T(r2004 ? 'ObjectDBX Classes' : 'AutoCAD 2000'); cw.T(cpp); cw.T(dxf); } else { cs.TU('ObjectDBX Classes'); cs.TU(cpp); cs.TU(dxf); }
    cw.B(0); cw.BS(0x1f3);
    if (r2004) { cw.BL(num === 502 ? 2 : 1); cw.BL(0); cw.BL(0); cw.BL(0); cw.BL(0); }
  }
  let classBits = null;
  if (V >= R2007) {
    const n = cs.bit; cw.append(cs);
    if (n >= 0x8000) { cw.RS((n >> 15) & 0xffff); cw.RS((n & 0x7fff) | 0x8000); } else cw.RS(n);
    cw.B(1); classBits = 32 + cw.bit;
  }
  const classes = section(cw.bytes(), classBits, V, SENT_CLASSES, SENT_CLASSES_END);

  if (r2004) {
    // The objects section: the 0x0DCA mark, then the objects; the map's offsets count from the section's start.
    objects.sort((a, b) => a[0] - b[0]);
    const offs = new Map(); let p = 4;
    for (const [handle, bytes] of objects) { offs.set(handle, p); p += bytes.length; }
    const objs = new Uint8Array(p); le32(objs, 0, 0x0dca); p = 4;
    for (const [, bytes] of objects) { objs.set(bytes, p); p += bytes.length; }
    const free = new Uint8Array(53);
    le32(free, 0, 0); le32(free, 4, offs.size + 3); free.set(UNKNOWN_SECTION, 8); le32(free, 16, 0);
    const parts = { header, classes, handles: objectMap(offs), objects: objs, objFreeSpace: free, template: Uint8Array.from([0, 0, 1, 0]), handseed: HANDSEED, jd, objectCount: offs.size, version: V, extra: extraSections };
    return V === R2007 ? r2007File(parts) : r2004File(parts);
  }

  // ——— layout: file header (0x61 bytes), preview, header, classes, padding, objects, object map, unknown section,
  // second header, template ———
  const preview = new Uint8Array(16 + 4 + 1 + 16); preview.set(SENT_IMAGE, 0); le32(preview, 16, 1); preview[20] = 0; preview.set(SENT_IMAGE_END, 21);
  const FILE_HEADER = 0x19 + 5 * 9 + 2 + 16;
  const at = { preview: FILE_HEADER };
  at.header = at.preview + preview.length;
  at.classes = at.header + header.length;
  at.padding = at.classes + classes.length;
  at.objects = at.padding + 0x200;
  const chunks = [];
  const offsets = new Map(); let pos = at.objects;
  objects.sort((a, b) => a[0] - b[0]);
  for (const [handle, bytes] of objects) { offsets.set(handle, pos); chunks.push(bytes); pos += bytes.length; }
  at.map = pos;
  const map = objectMap(offsets);
  at.unknown = at.map + map.length;
  const unknown = new Uint8Array(53);
  le32(unknown, 0, 0); le32(unknown, 4, offsets.size + 3); unknown.set(UNKNOWN_SECTION, 8); le32(unknown, 16, at.objects);
  at.second = at.unknown + unknown.length;
  const records = [[0, at.header, header.length], [1, at.classes, classes.length], [2, at.map, map.length], [3, at.unknown, unknown.length]];
  const second = secondHeader(at.second, records, HANDSEED);
  at.template = at.second + second.length;
  const template = Uint8Array.from([0, 0, 1, 0]); // no description, MEASUREMENT = 1 (metric)
  records.push([4, at.template, template.length]);

  const fh = new Uint8Array(FILE_HEADER);
  fh.set([0x41, 0x43, 0x31, 0x30, 0x31, 0x35], 0); // AC1015
  fh[0x0b] = 6; fh[0x0c] = 1; le32(fh, 0x0d, at.preview); fh[0x11] = 0x17; fh[0x12] = 0x06; fh[0x13] = 30; fh[0x14] = 0; // ANSI_1252
  le32(fh, 0x15, records.length);
  records.forEach(([n, seek, size], i) => { const p = 0x19 + i * 9; fh[p] = n; le32(fh, p + 1, seek); le32(fh, p + 5, size); });
  const crcAt = 0x19 + records.length * 9;
  const crc = crc8(0, fh, 0, crcAt) ^ 0x3cc4;
  fh[crcAt] = crc & 255; fh[crcAt + 1] = crc >> 8;
  fh.set(SENT_FILE, crcAt + 2);

  const parts = [fh, preview, header, classes, new Uint8Array(0x200), ...chunks, map, unknown, second, template];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  if (o !== at.template + template.length) throw dwgError('DWG layout mismatch', 'dwg-write');
  return out;
}

function le32(b, at, v) { b[at] = v & 255; b[at + 1] = (v >>> 8) & 255; b[at + 2] = (v >>> 16) & 255; b[at + 3] = (v >>> 24) & 255; }

/** The object map (23.1): sections of at most 2032 bytes, deltas as modular chars, CRCs big-endian, a closing 2. */
function objectMap(offsets) {
  const out = []; let lastHandle = 0; let lastLoc = 0;
  const entries = [...offsets.entries()].sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < entries.length) {
    const body = [];
    while (i < entries.length) {
      const [h, loc] = entries[i];
      const pair = [...encodeMC(h - lastHandle, false), ...encodeMC(loc - lastLoc, true)];
      if (2 + body.length + pair.length > 2032) break;
      body.push(...pair); lastHandle = h; lastLoc = loc; i++;
    }
    const size = 2 + body.length;
    const sec = [size >> 8, size & 255, ...body];
    const c = crc8(0xc0c1, Uint8Array.from(sec));
    out.push(...sec, c >> 8, c & 255);
  }
  const last = [0, 2]; const c = crc8(0xc0c1, Uint8Array.from(last));
  out.push(...last, c >> 8, c & 255);
  return Uint8Array.from(out);
}

/** The second file header (chapter 26, as LibreDWG lays it out): section locators and the main handles again. */
function secondHeader(address, records, handseed) {
  const w = new BitWriter(R2000);
  w.RL(0); // size, patched below
  w.BL(address);
  w.rawBytes([0x41, 0x43, 0x31, 0x30, 0x31, 0x35, 0, 0, 0, 0, 0]);
  w.RC(6); w.RC(1); w.BS(0x617); w.RS(30);
  const secs = [...records.map(([n, a, s]) => [n, a, s]), [4, 0, 0], [5, 0, 0]].slice(0, 6);
  w.BS(secs.length); for (const [n, a, s] of secs) { w.RC(n); w.BL(a); w.BL(s); }
  const hs = [handseed, H.BLOCK_CONTROL, H.LAYER_CONTROL, H.STYLE_CONTROL, H.LTYPE_CONTROL, H.VIEW_CONTROL, H.UCS_CONTROL, H.VPORT_CONTROL, H.APPID_CONTROL, H.DIMSTYLE_CONTROL, H.VX_CONTROL, H.NAMED, H.MLSTYLES, H.GROUPS];
  w.BS(hs.length);
  hs.forEach((h, i) => { const bytes = []; let v = h; while (v > 0) { bytes.unshift(v & 255); v >>>= 8; } w.RC(bytes.length); w.RC(i); for (const b of bytes) w.RC(b); });
  w.align();
  const data = w.bytes();
  const crc = crc8(0xc0c1, data, 0, data.length);
  const body = new Uint8Array(data.length + 2 + 8);
  body.set(data, 0); body[data.length] = crc & 255; body[data.length + 1] = crc >> 8;
  le32(body, 0, body.length);
  // The CRC covers the size, which was 0 when it was computed: recompute with the size in place.
  const crc2 = crc8(0xc0c1, body, 0, data.length); body[data.length] = crc2 & 255; body[data.length + 1] = crc2 >> 8;
  const out = new Uint8Array(16 + body.length + 16);
  out.set(SENT_2ND, 0); out.set(body, 16); out.set(SENT_2ND_END, 16 + body.length);
  return out;
}

/** Entity data writers (R2000 prescriptions of 20.4), after the common entity data. */
const ENTITY_WRITERS = {
  LINE(d, h, e, grow) {
    const a = [e.start[0], e.start[1], e.start[2] ?? 0]; const b = [e.end[0], e.end[1], e.end[2] ?? 0]; grow(a); grow(b);
    const flat = a[2] === 0 && b[2] === 0;
    d.B(flat ? 1 : 0); d.RD(a[0]); d.DD(b[0], a[0]); d.RD(a[1]); d.DD(b[1], a[1]);
    if (!flat) { d.RD(a[2]); d.DD(b[2], a[2]); }
    d.BT(0); d.BE([0, 0, 1]);
  },
  CIRCLE(d, h, e, grow) { const c = [e.center[0], e.center[1], e.center[2] ?? 0]; grow([c[0] - e.radius, c[1] - e.radius, c[2]]); grow([c[0] + e.radius, c[1] + e.radius, c[2]]); d.BD3(c); d.BD(e.radius); d.BT(0); d.BE([0, 0, 1]); },
  ARC(d, h, e, grow) { const c = [e.center[0], e.center[1], e.center[2] ?? 0]; grow([c[0] - e.radius, c[1] - e.radius, c[2]]); grow([c[0] + e.radius, c[1] + e.radius, c[2]]); d.BD3(c); d.BD(e.radius); d.BT(0); d.BE([0, 0, 1]); d.BD(e.startAngle); d.BD(e.endAngle); },
  POINT(d, h, e, grow) { const p = [e.point[0], e.point[1], e.point[2] ?? 0]; grow(p); d.BD3(p); d.BT(0); d.BE([0, 0, 1]); d.BD(0); },
  ELLIPSE(d, h, e, grow) {
    const c = [e.center[0], e.center[1], e.center[2] ?? 0]; const r = Math.hypot(...e.majorAxis); grow([c[0] - r, c[1] - r, c[2]]); grow([c[0] + r, c[1] + r, c[2]]);
    d.BD3(c); d.BD3([e.majorAxis[0], e.majorAxis[1], e.majorAxis[2] ?? 0]); d.BD3([0, 0, 1]); d.BD(e.ratio); d.BD(e.startParam ?? 0); d.BD(e.endParam ?? 2 * Math.PI);
  },
  SOLID(d, h, e, grow) { const z = e.corners[0][2] ?? 0; d.BT(0); d.BD(z); for (const p of e.corners) { grow(p); d.RD2([p[0], p[1]]); } d.BE([0, 0, 1]); },
  LWPOLYLINE(d, h, e, grow) {
    const bulges = (e.bulges ?? []).some((b) => b) ? e.bulges : [];
    const flag = (e.closed ? 512 : 0) | (e.elevation ? 8 : 0) | (bulges.length ? 16 : 0);
    d.BS(flag); if (e.elevation) d.BD(e.elevation);
    d.BL(e.points.length); if (bulges.length) d.BL(bulges.length);
    e.points.forEach((p, i) => { grow([p[0], p[1], e.elevation ?? 0]); if (i === 0) d.RD2(p); else { d.DD(p[0], e.points[i - 1][0]); d.DD(p[1], e.points[i - 1][1]); } });
    for (const b of bulges) d.BD(b);
  },
  TEXT(d, h, e, grow) {
    const ins = e.insert; grow([ins[0], ins[1], 0]);
    const align = e.align ?? null; const rot = e.rotation ?? 0; const wf = e.widthFactor ?? 1;
    const hal = e.halign ?? 0; const val = e.valign ?? 0;
    let flags = 0x01 | 0x04 | 0x20; // no elevation, no oblique, no generation
    if (!align || (hal === 0 && val === 0)) flags |= 0x02;
    if (rot === 0) flags |= 0x08; if (wf === 1) flags |= 0x10; if (hal === 0) flags |= 0x40; if (val === 0) flags |= 0x80;
    d.RC(flags); d.RD2([ins[0], ins[1]]);
    if (!(flags & 0x02)) { d.DD(align[0], ins[0]); d.DD(align[1], ins[1]); }
    d.BE([0, 0, 1]); d.BT(0);
    if (!(flags & 0x08)) d.RD(rot);
    d.RD(e.height ?? 2.5);
    if (!(flags & 0x10)) d.RD(wf);
    d.T(e.text ?? '');
    if (!(flags & 0x40)) d.BS(hal);
    if (!(flags & 0x80)) d.BS(val);
    h.H(HARD_PTR, H.STANDARD);
  },
};
