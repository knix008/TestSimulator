// Reading DWG files: the R13–R15 layout (section locators, classes, object map; Open Design Specification chapter
// 3) and the R2004+ paged and compressed layout (chapters 4–8, r2004.js), then every object of the object map
// (objects.js). The result is a plain drawing: layers, blocks and their entities, model space.
import { BitReader, VERSIONS, R2000, R2004, R2007, R2010, crc8, dwgError } from './bits.js';
import { readObject } from './objects.js';
import { readHeader } from './header.js';
import { r2004Sections, r2007Sections } from './r2004.js';

const latin1 = (b) => String.fromCharCode(...b);

/** Section locators, classes and object map of an R13–R15 file: { classesBytes, mapBytes, objectBytes }. */
function r2000Sections(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint32(0x15, true);
  if (count < 3 || count > 8) throw dwgError(`bad section count ${count}`);
  const records = {};
  for (let i = 0; i < count; i++) {
    const at = 0x19 + i * 9;
    records[bytes[at]] = { seeker: dv.getUint32(at + 1, true), size: dv.getUint32(at + 5, true) };
  }
  const crcAt = 0x19 + count * 9;
  const xor = { 3: 0xa598, 4: 0x8101, 5: 0x3cc4, 6: 0x8461 }[count] ?? 0;
  const want = dv.getUint16(crcAt, true);
  const got = crc8(0, bytes, 0, crcAt) ^ xor;
  if (want !== got) throw dwgError('the file header is damaged (CRC)');
  return { records, objects: bytes, mapOffset: records[2]?.seeker, mapSize: records[2]?.size, classesOffset: records[1]?.seeker, classesSize: records[1]?.size, headerOffset: records[0]?.seeker };
}

/** The class list: type number → { classnum, dxfname, cppname, appname, itemclassid }. */
function readClasses(bytes, offset, version) {
  const classes = new Map();
  const r = new BitReader(bytes, (offset + 16) * 8, version);
  const size = r.RL();
  // R2010+: the high half of the size; R2007+: the size in bits up to the string stream (from byte 20 or 24).
  if (version >= R2010) r.RL();
  const bitSize = version >= R2007 ? r.RL() : 0;
  const dataStart = r.bit;
  let endBit = version >= R2007 ? (offset + (version >= R2010 ? 24 : 20)) * 8 + bitSize : dataStart + size * 8;
  if (version >= R2004) {
    // R2004+: maximum class number, two zero bytes and a bit, then the classes (strings in a stream for R2007+).
    r.BS(); r.RC(); r.RC(); r.B();
  }
  if (version >= R2007) {
    // The string stream: its size in the bits just before the end, as in an object.
    const sizeBits = endBit - 1;
    const flag = new BitReader(bytes, sizeBits, version).B();
    if (flag) {
      let pos = sizeBits - 16; let ss = new BitReader(bytes, pos, version).RSu();
      if (ss & 0x8000) { pos -= 16; const hi = new BitReader(bytes, pos, version).RSu(); ss = (ss & 0x7fff) | (hi << 15); }
      r.strings = new BitReader(bytes, pos - ss, version);
      endBit = pos - ss;
    }
  }
  for (let guard = 0; r.bit < endBit - 16 && guard < 10000; guard++) {
    const classnum = r.BS(); r.BS();
    const appname = r.TV(); const cppname = r.TV(); const dxfname = r.TV(); r.B(); const itemclassid = r.BS();
    if (version >= R2004) { r.BL(); r.BS(); r.BS(); r.BL(); r.BL(); }
    classes.set(classnum, { classnum, appname, cppname, dxfname, itemclassid });
  }
  return classes;
}

/** The object map (chapter 23): handle → offset of the object. */
function readObjectMap(bytes, offset, size) {
  const map = new Map();
  let at = offset; let handle = 0; let loc = 0;
  for (let guard = 0; guard < 1e6; guard++) {
    const sectionSize = (bytes[at] << 8) | bytes[at + 1];
    if (sectionSize <= 2) break;
    const end = at + sectionSize;
    const r = new BitReader(bytes, (at + 2) * 8);
    while ((r.bit >> 3) < end) {
      handle += r.MC(false);
      loc += r.MC(true);
      map.set(handle, loc);
    }
    at = end + 2;
    if (size && at >= offset + size) break;
  }
  return map;
}

/**
 * A DWG file (Uint8Array or ArrayBuffer) as a drawing:
 *   { version, release, layers: Map(handle → { name, color }), blocks: Map(handle → { name, base, entities }),
 *     modelSpace: [entities], paperSpace: [entities], objects: Map(handle → object), skipped: { name: count } }.
 * Throws { code: 'dwg-read' | 'dwg-version' }.
 */
export function readDwg(data) {
  try { return readDwgFile(data); } catch (error) {
    // Whatever breaks on a truncated or damaged file (a read past its end) is reported as a damaged DWG.
    if (error?.code) throw error;
    throw dwgError(`the DWG file is damaged (${error?.message ?? error})`);
  }
}

function readDwgFile(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const tag = latin1(bytes.subarray(0, 6));
  const version = VERSIONS[tag];
  if (!version) throw dwgError(/^AC\d{4}$/.test(tag) ? `DWG version ${tag} is not read` : 'not a DWG file', /^AC\d{4}$/.test(tag) ? 'dwg-version' : 'dwg-read');
  if (version < R2000) throw dwgError(`DWG ${tag} (R13/R14) is not read: save it as R2000 or later`, 'dwg-version');
  let objectsBytes; let classes; let map; let headerVars = null;
  if (version < R2004) {
    const s = r2000Sections(bytes);
    classes = readClasses(bytes, s.classesOffset, version);
    map = readObjectMap(bytes, s.mapOffset, s.mapSize);
    objectsBytes = bytes;
    try { headerVars = readHeader(bytes, s.headerOffset, version).vars; } catch { headerVars = null; }
  } else {
    const sections = version === R2007 ? r2007Sections(bytes) : r2004Sections(bytes);
    const cls = sections.get('AcDb:Classes'); const handles = sections.get('AcDb:Handles'); const objs = sections.get('AcDb:AcDbObjects');
    if (!cls || !handles || !objs) throw dwgError('a required section is missing');
    classes = readClasses(cls, 0, version);
    map = readObjectMap(handles, 0, handles.length);
    objectsBytes = objs;
    const hdr = sections.get('AcDb:Header');
    if (hdr && version < R2007) { try { headerVars = readHeader(hdr, 0, version).vars; } catch { headerVars = null; } }
  }
  const objects = new Map(); const skipped = {};
  for (const [handle, offset] of map) {
    if (offset < 0 || offset >= objectsBytes.length) continue;
    let o;
    try { o = readObject(objectsBytes, offset, version, classes); } catch (error) { skipped.unreadable = (skipped.unreadable ?? 0) + 1; continue; }
    if (o.handle !== handle) { skipped.mismatch = (skipped.mismatch ?? 0) + 1; }
    if (o.unsupported || o.error) skipped[o.name] = (skipped[o.name] ?? 0) + 1;
    objects.set(o.handle, o);
  }
  const out = assemble({ version, release: tag, objects, classes, skipped });
  // Drawing units (INSUNITS) where the header variables are read (R2000, R2004); 0 = unitless otherwise.
  out.units = headerVars?.INSUNITS ?? 0;
  out.header = headerVars;
  return out;
}

/** Layers, blocks with their entities, and the model and paper spaces, from the objects. */
function assemble({ version, release, objects, classes, skipped }) {
  const layers = new Map(); const blocks = new Map();
  for (const o of objects.values()) {
    if (o.name === 'LAYER') layers.set(o.handle, { name: o.entryName, color: o.color?.index ?? 7, on: o.on, frozen: o.frozen });
    if (o.name === 'BLOCK_HEADER') blocks.set(o.handle, { handle: o.handle, name: o.entryName, base: o.base ?? [0, 0, 0], anonymous: o.anonymous, entities: [] });
  }
  const modelSpace = []; const paperSpace = [];
  // Entities belong to a block by their owner (entity mode 0), or to model space (2) / paper space (1).
  // Vertices and attributes hang off their polyline / insert; SEQENDs, BLOCKs and ENDBLKs are structure.
  const structural = new Set(['VERTEX_2D', 'VERTEX_3D', 'SEQEND', 'BLOCK', 'ENDBLK', 'ATTRIB']);
  const ms = [...blocks.values()].find((b) => /^\*model_space$/i.test(b.name));
  const ps = [...blocks.values()].find((b) => /^\*paper_space$/i.test(b.name));
  for (const o of objects.values()) {
    if (!o.entity || o.unsupported || o.error || structural.has(o.name)) continue;
    o.layerName = layers.get(o.layer)?.name ?? '0';
    if (o.name === 'POLYLINE_2D' || o.name === 'POLYLINE_3D') o.vertexList = polylineVertices(o, objects);
    if (o.entmode === 2) modelSpace.push(o);
    else if (o.entmode === 1) paperSpace.push(o);
    else if (o.owner && blocks.has(o.owner)) {
      const b = blocks.get(o.owner);
      if (b === ms) modelSpace.push(o); else if (b === ps) paperSpace.push(o); else b.entities.push(o);
    }
  }
  const byHandle = (a, b) => a.handle - b.handle;
  modelSpace.sort(byHandle); paperSpace.sort(byHandle);
  for (const b of blocks.values()) b.entities.sort(byHandle);
  return { version, release, layers, blocks, modelSpace, paperSpace, objects, classes, skipped };
}

/** The vertices of an old-style polyline: listed (R2004+), or the vertices it owns in handle order (R2000). */
function polylineVertices(o, objects) {
  if (o.vertices) return o.vertices.map((h) => objects.get(h)).filter((v) => v && v.point);
  const out = [];
  for (const v of objects.values()) if (v.owner === o.handle && (v.name === 'VERTEX_2D' || v.name === 'VERTEX_3D')) out.push(v);
  return out.sort((a, b) => a.handle - b.handle);
}
