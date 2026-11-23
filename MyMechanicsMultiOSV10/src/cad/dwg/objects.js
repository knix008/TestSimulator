// DWG objects (Open Design Specification for .dwg files, chapter 20): the common object / entity frame and the
// entities and tables a 2D drawing is made of. Each object is read from its own bit stream: the data part, then
// (R2007+) the string stream at its end, then the handle stream from the "end bit".
import { BitReader, R2000, R2004, R2007, R2010, R2013, R2018, dwgError } from './bits.js';

export const TYPES = {
  1: 'TEXT', 2: 'ATTRIB', 3: 'ATTDEF', 4: 'BLOCK', 5: 'ENDBLK', 6: 'SEQEND', 7: 'INSERT', 8: 'MINSERT',
  10: 'VERTEX_2D', 11: 'VERTEX_3D', 15: 'POLYLINE_2D', 16: 'POLYLINE_3D', 17: 'ARC', 18: 'CIRCLE', 19: 'LINE',
  20: 'DIMENSION_ORDINATE', 21: 'DIMENSION_LINEAR', 22: 'DIMENSION_ALIGNED', 23: 'DIMENSION_ANG3PT', 24: 'DIMENSION_ANG2LN',
  25: 'DIMENSION_RADIUS', 26: 'DIMENSION_DIAMETER', 27: 'POINT', 28: '3DFACE', 31: 'SOLID', 32: 'TRACE', 34: 'VIEWPORT',
  35: 'ELLIPSE', 36: 'SPLINE', 40: 'RAY', 41: 'XLINE', 42: 'DICTIONARY', 44: 'MTEXT', 45: 'LEADER', 47: 'MLINE',
  48: 'BLOCK_CONTROL', 49: 'BLOCK_HEADER', 50: 'LAYER_CONTROL', 51: 'LAYER', 52: 'STYLE_CONTROL', 53: 'STYLE',
  56: 'LTYPE_CONTROL', 57: 'LTYPE', 60: 'VIEW_CONTROL', 61: 'VIEW', 62: 'UCS_CONTROL', 63: 'UCS', 64: 'VPORT_CONTROL',
  65: 'VPORT', 66: 'APPID_CONTROL', 67: 'APPID', 68: 'DIMSTYLE_CONTROL', 69: 'DIMSTYLE', 70: 'VX_CONTROL', 71: 'VX',
  72: 'GROUP', 73: 'MLINESTYLE', 77: 'LWPOLYLINE', 78: 'HATCH', 79: 'XRECORD', 80: 'PLACEHOLDER', 82: 'LAYOUT',
};
const ENTITY_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 44, 45, 46, 47, 77, 78]);
const VARIABLE_ENTITIES = new Set(['LWPOLYLINE', 'HATCH', 'IMAGE', 'OLE2FRAME', 'WIPEOUT', 'MLEADER', 'ACAD_TABLE', 'ARC_DIMENSION', 'LARGE_RADIAL_DIMENSION']);

/**
 * One object from its bytes at `offset` (where its MS size starts). `classes` maps type numbers ≥ 500 to class
 * records. Returns { type, name, handle, owner, entity?, …data } — or { name: 'UNSUPPORTED' } for types this
 * reader does not interpret (their handle and owner still read).
 */
export function readObject(bytes, offset, version, classes) {
  const head = new BitReader(bytes, offset * 8, version);
  const size = head.MS();
  let handleBits = 0;
  if (version >= R2010) handleBits = head.MC(false);
  const start = head.bit; // the object's data begins here (the size counts from this byte)
  const objBytes = bytes.subarray(start >> 3, (start >> 3) + size);
  const r = new BitReader(objBytes, 0, version);
  const type = version >= R2010 ? objectType(r) : r.BS();
  const cls = type >= 500 ? classes.get(type) : null;
  const name = TYPES[type] ?? cls?.dxfname ?? `TYPE_${type}`;
  const entity = ENTITY_TYPES.has(type) || (cls ? cls.itemclassid === 0x1f2 || VARIABLE_ENTITIES.has(cls.dxfname) : false);
  // The handle stream starts at the "end bit": a stored count before R2010, size − handle bits after.
  let endBit;
  if (version >= R2010) endBit = size * 8 - handleBits;
  else if (version >= R2000) endBit = r.RL();
  const handle = r.H().value;
  readEed(r);
  const o = { type, name, handle, entity };
  if (version >= R2007) setupStrings(r, endBit);
  const hr = new BitReader(objBytes, endBit ?? 0, version);
  if (entity) commonEntity(r, hr, o, version); else commonObject(r, hr, o, version);
  try {
    const parse = PARSERS[name] ?? (/_CONTROL$/.test(name) ? PARSERS.CONTROL : null);
    if (parse) {
      parse(r, hr, o, version);
      // Exactness: the data must end at the end bit (R2000–R2007), the handles within the object's last byte.
      if (endBit !== undefined && version < R2007) o.exact = r.bit === endBit && hr.bit <= size * 8 && hr.bit > size * 8 - 8;
    } else o.unsupported = true;
  } catch (error) { o.error = String(error?.message ?? error); }
  return o;
}

function objectType(r) {
  const pair = r.BB();
  if (pair === 0) return r.RC();
  if (pair === 1) return r.RC() + 0x1f0;
  return r.RSu();
}

/** Extended data: (BS length, H appid, length bytes)* until a zero length; skipped. */
function readEed(r) {
  for (let n = r.BS(), guard = 0; n !== 0 && guard < 10000; n = r.BS(), guard++) {
    r.H(); r.bit += n * 8;
    if (r.bit > r.end) throw dwgError('extended data past the object');
  }
}

/** R2007+: the string stream sits before the end bit, its size in the last bits of the data part. */
function setupStrings(r, endBit) {
  const flagBit = endBit - 1;
  const s = new BitReader(r.b, flagBit, r.version);
  if (!s.B()) { r.strings = null; return; }
  let pos = endBit - 1 - 16;
  const sr = new BitReader(r.b, pos, r.version);
  let size = sr.RSu();
  if (size & 0x8000) {
    pos -= 16; const hr = new BitReader(r.b, pos, r.version);
    const hi = hr.RSu(); size = (size & 0x7fff) | (hi << 15);
  }
  r.strings = new BitReader(r.b, pos - size, r.version);
}

function commonObject(r, hr, o, version) {
  if (version < R2000) r.RL();
  o.numReactors = r.BL();
  o.noXdic = version >= R2004 ? Boolean(r.B()) : false;
  if (version >= R2013) r.B();
  o.owner = hr.Habs(o.handle);
  for (let i = 0; i < o.numReactors; i++) hr.H();
  if (!o.noXdic) hr.H();
}

function commonEntity(r, hr, o, version) {
  if (r.B()) { const n = version >= R2010 ? r.BLL() : r.RL(); r.bit += n * 8; }
  if (version < R2000) r.RL();
  o.entmode = r.BB();
  o.numReactors = r.BL();
  o.noXdic = version >= R2004 ? Boolean(r.B()) : false;
  if (version >= R2013) r.B();
  if (version < R2000) o.bylayerLt = r.B();
  o.noLinks = version >= R2004 ? true : Boolean(r.B());
  o.color = r.ENC();
  o.ltscale = r.BD();
  if (version >= R2000) { o.ltFlags = r.BB(); o.psFlags = r.BB(); }
  if (version >= R2007) { o.matFlags = r.BB(); r.RC(); }
  if (version >= R2010) { o.fullVs = r.B(); o.faceVs = r.B(); o.edgeVs = r.B(); }
  o.invisible = r.BS() & 1;
  if (version >= R2000) o.lineweight = r.RC();
  // Handles: owner, reactors, xdictionary, links, colour book, layer, linetype, material, plot style, styles.
  if (o.entmode === 0) o.owner = hr.Habs(o.handle);
  for (let i = 0; i < o.numReactors; i++) hr.H();
  if (!o.noXdic) hr.H();
  if (version < R2000) { o.layer = hr.Habs(o.handle); if (!o.bylayerLt) hr.H(); }
  if (version < R2004 && !o.noLinks) { o.prev = hr.Habs(o.handle); o.next = hr.Habs(o.handle); }
  if (version >= R2004 && o.color.hasBook) hr.H();
  if (version >= R2000) {
    o.layer = hr.Habs(o.handle);
    if (o.ltFlags === 3) o.ltype = hr.Habs(o.handle);
    if (version >= R2007 && o.matFlags === 3) hr.H();
    if (o.psFlags === 3) hr.H();
  }
  if (version >= R2010) { if (o.fullVs) hr.H(); if (o.faceVs) hr.H(); if (o.edgeVs) hr.H(); }
}

const PARSERS = {
  LINE(r, hr, o, v) {
    if (v < R2000) { o.start = r.BD3(); o.end = r.BD3(); }
    else {
      const flat = r.B();
      const x0 = r.RD(); const x1 = r.DD(x0); const y0 = r.RD(); const y1 = r.DD(y0);
      let z0 = 0; let z1 = 0; if (!flat) { z0 = r.RD(); z1 = r.DD(z0); }
      o.start = [x0, y0, z0]; o.end = [x1, y1, z1];
    }
    o.thickness = r.BT(); o.extrusion = r.BE();
  },
  CIRCLE(r, hr, o) { o.center = r.BD3(); o.radius = r.BD(); o.thickness = r.BT(); o.extrusion = r.BE(); },
  ARC(r, hr, o) { o.center = r.BD3(); o.radius = r.BD(); o.thickness = r.BT(); o.extrusion = r.BE(); o.startAngle = r.BD(); o.endAngle = r.BD(); },
  POINT(r, hr, o) { o.point = r.BD3(); o.thickness = r.BT(); o.extrusion = r.BE(); o.xAngle = r.BD(); },
  ELLIPSE(r, hr, o) { o.center = r.BD3(); o.majorAxis = r.BD3(); o.extrusion = r.BD3(); o.ratio = r.BD(); o.startParam = r.BD(); o.endParam = r.BD(); },
  TEXT(r, hr, o, v) { readText(r, o, v); o.style = hr.Habs(o.handle); },
  ATTRIB(r, hr, o, v) { readText(r, o, v); if (v >= R2010) r.RC(); o.tag = r.TV(); r.BS(); o.flags = r.RC(); if (v >= R2007) r.B(); },
  ATTDEF(r, hr, o, v) { readText(r, o, v); if (v >= R2010) r.RC(); o.tag = r.TV(); r.BS(); o.flags = r.RC(); if (v >= R2007) r.B(); o.prompt = r.TV(); },
  MTEXT(r, hr, o, v) {
    o.insert = r.BD3(); o.extrusion = r.BD3(); o.xAxis = r.BD3(); o.rectWidth = r.BD();
    if (v >= R2007) o.rectHeight = r.BD();
    o.height = r.BD(); o.attachment = r.BS(); o.direction = r.BS(); r.BD(); r.BD(); o.text = r.TV();
    o.style = hr.Habs(o.handle);
    if (v >= R2000) { o.lineSpacingStyle = r.BS(); o.lineSpacing = r.BD(); r.B(); }
    if (v >= R2004) {
      const bg = r.BL();
      if (bg & 1 || (v >= R2018 && bg & 0x10)) { r.BL(); r.CMC(); r.BL(); }
    }
  },
  INSERT(r, hr, o, v) {
    o.insert = r.BD3();
    if (v < R2000) o.scale = r.BD3();
    else {
      const f = r.BB();
      if (f === 3) o.scale = [1, 1, 1];
      else if (f === 1) { o.scale = [1, r.DD(1), r.DD(1)]; }
      else if (f === 2) { const s = r.RD(); o.scale = [s, s, s]; }
      else { const sx = r.RD(); o.scale = [sx, r.DD(sx), r.DD(sx)]; }
    }
    o.rotation = r.BD(); o.extrusion = r.BD3(); o.hasAttribs = r.B();
    if (v >= R2004 && o.hasAttribs) o.ownedCount = r.BL();
    o.block = hr.Habs(o.handle);
    if (o.hasAttribs) {
      if (v < R2004) { hr.H(); hr.H(); } else for (let i = 0; i < o.ownedCount; i++) hr.H();
      o.seqend = hr.Habs(o.handle);
    }
  },
  LWPOLYLINE(r, hr, o, v) {
    const flag = r.BS(); o.flag = flag;
    o.closed = Boolean(flag & 512);
    if (flag & 4) o.constWidth = r.BD();
    o.elevation = flag & 8 ? r.BD() : 0;
    if (flag & 2) o.thickness = r.BD();
    o.extrusion = flag & 1 ? r.BD3() : [0, 0, 1];
    const n = r.BL(); const nb = flag & 16 ? r.BL() : 0;
    const nid = v >= R2010 && flag & 1024 ? r.BL() : 0;
    const nw = flag & 32 ? r.BL() : 0;
    if (n < 0 || n > 1e7) throw dwgError('bad vertex count');
    const pts = [];
    if (v < R2000) for (let i = 0; i < n; i++) pts.push(r.RD2());
    else if (n) { pts.push(r.RD2()); for (let i = 1; i < n; i++) { const p = pts[i - 1]; pts.push([r.DD(p[0]), r.DD(p[1])]); } }
    o.points = pts;
    o.bulges = Array.from({ length: nb }, () => r.BD());
    for (let i = 0; i < nid; i++) r.BL();
    o.widths = Array.from({ length: nw }, () => [r.BD(), r.BD()]);
  },
  POLYLINE_2D(r, hr, o, v) {
    o.flags = r.BS(); o.curveType = r.BS(); o.startWidth = r.BD(); o.endWidth = r.BD(); o.thickness = r.BT(); o.elevation = r.BD(); o.extrusion = r.BE();
    o.closed = Boolean(o.flags & 1);
    if (v >= R2004) { const n = r.BL(); o.vertices = Array.from({ length: n }, () => hr.Habs(o.handle)); }
    else { o.firstVertex = hr.Habs(o.handle); o.lastVertex = hr.Habs(o.handle); }
    o.seqend = hr.Habs(o.handle);
  },
  POLYLINE_3D(r, hr, o, v) {
    o.splineFlags = r.RC(); o.closedFlags = r.RC(); o.closed = Boolean(o.closedFlags & 1);
    if (v >= R2004) { const n = r.BL(); o.vertices = Array.from({ length: n }, () => hr.Habs(o.handle)); }
    else { o.firstVertex = hr.Habs(o.handle); o.lastVertex = hr.Habs(o.handle); }
    o.seqend = hr.Habs(o.handle);
  },
  VERTEX_2D(r, hr, o, v) {
    o.flags = r.RC(); o.point = r.BD3();
    const sw = r.BD(); if (sw < 0) { o.startWidth = o.endWidth = -sw; } else { o.startWidth = sw; o.endWidth = r.BD(); }
    o.bulge = r.BD(); if (v >= R2010) r.BL(); o.tangent = r.BD();
  },
  VERTEX_3D(r, hr, o) { o.flags = r.RC(); o.point = r.BD3(); },
  SPLINE(r, hr, o, v) {
    let scenario = r.BL();
    if (v >= R2013) {
      // R2013+: the scenario follows the flags — fit points (flag 1) or a custom knot parameter (15, control points).
      o.splineFlags = r.BL(); o.knotParam = r.BL();
      if (o.splineFlags & 1) scenario = 2;
      if (o.knotParam === 15) scenario = 1;
    }
    o.degree = r.BL();
    o.knots = []; o.control = []; o.weights = null; o.fit = [];
    if (scenario === 2) { o.fitTol = r.BD(); o.startTangent = r.BD3(); o.endTangent = r.BD3(); o.nfit = r.BL(); }
    else if (scenario === 1) {
      o.rational = r.B(); o.closed = r.B(); o.periodic = r.B(); o.knotTol = r.BD(); o.ctrlTol = r.BD();
      o.nknots = r.BL(); o.nctrl = r.BL(); o.weighted = r.B();
    } else throw dwgError(`spline scenario ${scenario}`);
    for (let i = 0; i < (o.nknots ?? 0); i++) o.knots.push(r.BD());
    if (o.weighted) o.weights = [];
    for (let i = 0; i < (o.nctrl ?? 0); i++) { o.control.push(r.BD3()); if (o.weighted) o.weights.push(r.BD()); }
    for (let i = 0; i < (o.nfit ?? 0); i++) o.fit.push(r.BD3());
  },
  SOLID(r, hr, o) { o.thickness = r.BT(); const z = r.BD(); o.corners = [r.RD2(), r.RD2(), r.RD2(), r.RD2()].map((p) => [p[0], p[1], z]); o.extrusion = r.BE(); },
  TRACE(r, hr, o, v) { PARSERS.SOLID(r, hr, o, v); o.name = 'SOLID'; },
  DIMENSION_ORDINATE(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD3(); r.RC(); }); },
  DIMENSION_LINEAR(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD3(); r.BD(); r.BD(); }); },
  DIMENSION_ALIGNED(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD3(); r.BD(); }); },
  DIMENSION_ANG3PT(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD3(); r.BD3(); }); },
  DIMENSION_ANG2LN(r, hr, o, v) { dimension(r, hr, o, v, () => { r.RD2(); r.BD3(); r.BD3(); r.BD3(); r.BD3(); }); },
  DIMENSION_RADIUS(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD(); }); },
  DIMENSION_DIAMETER(r, hr, o, v) { dimension(r, hr, o, v, () => { r.BD3(); r.BD3(); r.BD(); }); },
  BLOCK(r, hr, o) { o.blockName = r.TV(); },
  BLOCK_HEADER(r, hr, o, v) {
    o.entryName = r.TV(); r.B(); r.BS(); r.B(); o.anonymous = r.B(); o.hasAttribs = r.B(); o.isXref = r.B(); o.overlaid = r.B();
    if (v >= R2000) r.B();
    if (v >= R2004) o.ownedCount = r.BL();
    o.base = r.BD3(); o.xrefPath = r.TV();
    let inserts = 0;
    if (v >= R2000) { while (r.RC()) inserts++; o.description = r.TV(); const n = r.BL(); r.bit += n * 8; }
    if (v >= R2007) { r.BS(); r.B(); r.RC(); }
    hr.H(); // NULL
    o.blockEntity = hr.Habs(o.handle);
    if (v < R2004) { if (!o.isXref && !o.overlaid) { o.firstEntity = hr.Habs(o.handle); o.lastEntity = hr.Habs(o.handle); } }
    else o.entities = Array.from({ length: o.ownedCount ?? 0 }, () => hr.Habs(o.handle));
    o.endblk = hr.Habs(o.handle);
    if (v >= R2000) { o.inserts = Array.from({ length: inserts }, () => hr.Habs(o.handle)); o.layout = hr.Habs(o.handle); }
  },
  LAYER(r, hr, o, v) {
    tableEntry(r, o);
    if (v < R2000) { o.frozen = r.B(); o.on = r.B(); r.B(); o.locked = r.B(); }
    else { const flags = r.BS(); o.flags = flags; o.frozen = Boolean(flags & 1); o.on = !(flags & 2); o.locked = Boolean(flags & 8); o.plot = Boolean(flags & 16); o.lineweight = (flags & 0x3e0) >> 5; }
    o.color = r.CMC();
    o.xrefBlock = hr.Habs(o.handle);
    if (v >= R2000) o.plotstyle = hr.Habs(o.handle);
    if (v >= R2007) o.material = hr.Habs(o.handle);
    o.ltype = hr.Habs(o.handle);
    if (v >= R2013) hr.H();
  },
  STYLE(r, hr, o) {
    tableEntry(r, o);
    o.vertical = r.B(); o.isShape = r.B(); o.fixedHeight = r.BD(); o.widthFactor = r.BD(); o.oblique = r.BD(); o.generation = r.RC();
    o.lastHeight = r.BD(); o.font = r.TV(); o.bigFont = r.TV();
    o.xrefBlock = hr.Habs(o.handle);
  },
  LTYPE(r, hr, o, v) {
    tableEntry(r, o);
    o.description = r.TV(); o.patternLength = r.BD(); o.alignment = r.RC();
    const n = r.RC(); o.dashes = [];
    let hasText = false;
    for (let i = 0; i < n; i++) {
      const d = { length: r.BD(), shape: r.BS(), dx: r.RD(), dy: r.RD(), scale: r.BD(), rotation: r.BD(), flags: r.BS() };
      if (d.flags & 2) hasText = true;
      o.dashes.push(d);
    }
    if (v < R2007) r.bit += 256 * 8; else if (hasText) r.bit += 512 * 8;
    o.xrefBlock = hr.Habs(o.handle);
    for (let i = 0; i < n; i++) hr.H();
  },
  APPID(r, hr, o) { tableEntry(r, o); r.RC(); o.xrefBlock = hr.Habs(o.handle); },
  CONTROL(r, hr, o, v) {
    o.count = r.BL();
    // The R2000+ dimension style table also lists the arrow blocks of its entries (an undocumented count).
    if (o.name === 'DIMSTYLE_CONTROL' && v >= R2000) o.moreCount = r.RC();
    o.entries = Array.from({ length: o.count }, () => hr.Habs(o.handle));
    if (o.name === 'BLOCK_CONTROL') { o.modelSpace = hr.Habs(o.handle); o.paperSpace = hr.Habs(o.handle); }
    if (o.name === 'LTYPE_CONTROL') { o.byLayer = hr.Habs(o.handle); o.byBlock = hr.Habs(o.handle); }
    if (o.moreCount) o.more = Array.from({ length: o.moreCount }, () => hr.Habs(o.handle));
  },
  DICTIONARY(r, hr, o, v) {
    const n = r.BL();
    if (v === 14) r.RC();
    if (v >= R2000) { o.cloning = r.BS(); o.hardOwner = r.RC(); }
    o.names = Array.from({ length: n }, () => r.TV());
    o.items = Array.from({ length: n }, () => hr.Habs(o.handle));
  },
  ACDBDICTIONARYWDFLT(r, hr, o, v) { PARSERS.DICTIONARY(r, hr, o, v); o.defaultEntry = hr.Habs(o.handle); },
  ACDBPLACEHOLDER() {},
  MLINESTYLE(r, hr, o, v) {
    o.entryName = r.TV(); o.description = r.TV(); o.flags = r.BS(); o.fill = r.CMC(); o.startAngle = r.BD(); o.endAngle = r.BD();
    const n = r.RC(); o.lines = [];
    for (let i = 0; i < n; i++) { const l = { offset: r.BD(), color: r.CMC() }; if (v < R2018) l.ltindex = r.BS(); else l.ltype = hr.Habs(o.handle); o.lines.push(l); }
  },
  LAYOUT(r, hr, o, v) {
    o.pageSetup = r.TV(); o.printer = r.TV(); o.plotFlags = r.BS(); o.margins = [r.BD(), r.BD(), r.BD(), r.BD()]; o.paper = [r.BD(), r.BD()];
    o.paperName = r.TV(); o.plotOrigin = r.BD2(); o.paperUnits = r.BS(); o.plotRotation = r.BS(); o.plotType = r.BS();
    o.windowMin = r.BD2(); o.windowMax = r.BD2();
    if (v <= R2000) o.plotView = r.T();
    o.realUnits = r.BD(); o.drawingUnits = r.BD(); o.styleSheet = r.TV(); o.scaleType = r.BS(); o.scaleFactor = r.BD(); o.imageOrigin = r.BD2();
    if (v >= R2004) { r.BS(); r.BS(); r.BS(); }
    o.layoutName = r.TV(); o.tabOrder = r.BL(); o.flags = r.BS(); o.ucsOrigin = r.BD3(); o.limMin = r.RD2(); o.limMax = r.RD2();
    o.insBase = r.BD3(); o.ucsX = r.BD3(); o.ucsY = r.BD3(); o.elevation = r.BD(); o.orthoType = r.BS(); o.extMin = r.BD3(); o.extMax = r.BD3();
    const nvp = v >= R2004 ? r.RL() : 0;
    if (v >= R2004) hr.H();
    if (v >= R2007) hr.H();
    o.block = hr.Habs(o.handle); o.lastViewport = hr.Habs(o.handle); o.baseUcs = hr.Habs(o.handle); o.namedUcs = hr.Habs(o.handle);
    for (let i = 0; i < nvp; i++) hr.H();
  },
  DIMSTYLE(r, hr, o, v) {
    tableEntry(r, o);
    o.vars = {};
    for (const [type, name] of DIMSTYLE_FIELDS(v)) o.vars[name] = type === 'B' ? r.B() : type === 'BS' ? r.BS() : type === 'BD' ? r.BD() : type === 'TV' ? r.TV() : type === 'CMC' ? r.CMC().index : r.T();
    o.unknownBit = r.B();
    o.xrefBlock = hr.Habs(o.handle);
    o.txsty = hr.Habs(o.handle);
    if (v >= R2000) { o.ldrblk = hr.Habs(o.handle); o.blk = hr.Habs(o.handle); o.blk1 = hr.Habs(o.handle); o.blk2 = hr.Habs(o.handle); }
    if (v >= R2007) { hr.H(); hr.H(); hr.H(); }
  },
  VPORT(r, hr, o, v) {
    tableEntry(r, o);
    o.height = r.BD(); o.aspect = r.BD(); o.center = r.RD2(); o.target = r.BD3(); o.direction = r.BD3(); o.twist = r.BD();
    o.lens = r.BD(); o.frontClip = r.BD(); o.backClip = r.BD(); o.viewMode = r.bits(4);
    if (v >= R2000) o.renderMode = r.RC();
    if (v >= R2007) { r.B(); r.RC(); r.BD(); r.BD(); r.CMC(); }
    o.lowerLeft = r.RD2(); o.upperRight = r.RD2(); o.ucsFollow = r.B(); o.circleZoom = r.BS(); o.fastZoom = r.B(); o.ucsIcon = r.bits(2);
    o.gridOn = r.B(); o.gridSpacing = r.RD2(); o.snapOn = r.B(); o.snapStyle = r.B(); o.snapIsopair = r.BS(); o.snapRot = r.BD(); o.snapBase = r.RD2(); o.snapSpacing = r.RD2();
    if (v >= R2000) { r.B(); o.ucsPerViewport = r.B(); o.ucsOrigin = r.BD3(); o.ucsX = r.BD3(); o.ucsY = r.BD3(); o.ucsElevation = r.BD(); o.ucsOrtho = r.BS(); }
    if (v >= R2007) { r.BS(); r.BS(); }
    o.xrefBlock = hr.Habs(o.handle);
    if (v >= R2007) { hr.H(); hr.H(); hr.H(); }
    if (v >= R2000) { o.namedUcs = hr.Habs(o.handle); o.baseUcs = hr.Habs(o.handle); }
  },
  ENDBLK() {},
  SEQEND() {},
};

/** The common start of a table entry: name, the 64 flag, xref index + 1, xref-dependent. */
function tableEntry(r, o) { o.entryName = r.TV(); o.flag64 = r.B(); o.xrefIndex = r.BS() - 1; o.xdep = r.B(); }

/** The dimension variables of a DIMSTYLE entry (R2000+, 20.4.68) in file order: [type, name]. */
function DIMSTYLE_FIELDS(v) {
  const out = [['TV', 'DIMPOST'], ['TV', 'DIMAPOST']];
  for (const n of ['DIMSCALE', 'DIMASZ', 'DIMEXO', 'DIMDLI', 'DIMEXE', 'DIMRND', 'DIMDLE', 'DIMTP', 'DIMTM']) out.push(['BD', n]);
  if (v >= R2007) out.push(['BD', 'DIMFXL'], ['BD', 'DIMJOGANG'], ['BS', 'DIMTFILL'], ['CMC', 'DIMTFILLCLR']);
  for (const n of ['DIMTOL', 'DIMLIM', 'DIMTIH', 'DIMTOH', 'DIMSE1', 'DIMSE2']) out.push(['B', n]);
  out.push(['BS', 'DIMTAD'], ['BS', 'DIMZIN'], ['BS', 'DIMAZIN']);
  if (v >= R2007) out.push(['BS', 'DIMARCSYM']);
  for (const n of ['DIMTXT', 'DIMCEN', 'DIMTSZ', 'DIMALTF', 'DIMLFAC', 'DIMTVP', 'DIMTFAC', 'DIMGAP', 'DIMALTRND']) out.push(['BD', n]);
  out.push(['B', 'DIMALT'], ['BS', 'DIMALTD'], ['B', 'DIMTOFL'], ['B', 'DIMSAH'], ['B', 'DIMTIX'], ['B', 'DIMSOXD']);
  out.push(['BS', 'DIMCLRD'], ['BS', 'DIMCLRE'], ['BS', 'DIMCLRT'], ['BS', 'DIMADEC']);
  for (const n of ['DIMDEC', 'DIMTDEC', 'DIMALTU', 'DIMALTTD', 'DIMAUNIT', 'DIMFRAC', 'DIMLUNIT', 'DIMDSEP', 'DIMTMOVE', 'DIMJUST']) out.push(['BS', n]);
  out.push(['B', 'DIMSD1'], ['B', 'DIMSD2'], ['BS', 'DIMTOLJ'], ['BS', 'DIMTZIN'], ['BS', 'DIMALTZ'], ['BS', 'DIMALTTZ'], ['B', 'DIMUPT'], ['BS', 'DIMFIT']);
  if (v >= R2007) out.push(['B', 'DIMFXLON']);
  if (v >= R2010) out.push(['B', 'DIMTXTDIRECTION'], ['BD', 'DIMALTMZF'], ['T', 'DIMALTMZS'], ['BD', 'DIMMZF'], ['T', 'DIMMZS']);
  out.push(['BS', 'DIMLWD'], ['BS', 'DIMLWE']);
  return out;
}
export { DIMSTYLE_FIELDS, tableEntry };

/**
 * A dimension: its common data (20.4.22), its own points (`specific`), then its style and the anonymous block that
 * holds its picture — which is what a reader shows: the dimension becomes an insert of that block.
 */
function dimension(r, hr, o, v, specific) {
  if (v >= R2010) r.RC();
  o.extrusion = r.BD3(); o.textMid = r.RD2(); o.elevation = r.BD(); r.RC(); o.userText = r.TV();
  o.textRotation = r.BD(); r.BD();
  const scale = r.BD3(); const rotation = r.BD();
  if (v >= R2000) { r.BS(); r.BS(); r.BD(); o.measurement = r.BD(); }
  if (v >= R2007) { r.B(); r.B(); r.B(); }
  r.RD2();
  specific();
  hr.Habs(o.handle); // dimension style
  o.block = hr.Habs(o.handle);
  Object.assign(o, { dimensionType: o.name, name: 'INSERT', dimension: true, insert: [0, 0, 0], scale, rotation });
}

function readText(r, o, v) {
  if (v < R2000) {
    o.elevation = r.BD(); o.insert = r.RD2(); o.align = r.RD2(); o.extrusion = r.BD3(); o.thickness = r.BD();
    o.oblique = r.BD(); o.rotation = r.BD(); o.height = r.BD(); o.widthFactor = r.BD(); o.text = r.TV();
    o.generation = r.BS(); o.halign = r.BS(); o.valign = r.BS();
    return;
  }
  const f = r.RC();
  o.elevation = f & 1 ? 0 : r.RD();
  o.insert = r.RD2();
  o.align = f & 2 ? o.insert.slice() : [r.DD(o.insert[0]), r.DD(o.insert[1])];
  o.extrusion = r.BE(); o.thickness = r.BT();
  o.oblique = f & 4 ? 0 : r.RD(); o.rotation = f & 8 ? 0 : r.RD(); o.height = r.RD(); o.widthFactor = f & 16 ? 1 : r.RD();
  o.text = r.TV();
  o.generation = f & 32 ? 0 : r.BS(); o.halign = f & 64 ? 0 : r.BS(); o.valign = f & 128 ? 0 : r.BS();
}
