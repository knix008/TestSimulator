// Test fixtures for the DWG reader: a small DWG bit writer and an R2000
// drawing built with it (plus the same drawing as DXF). Used by
// test/unit/dwg.test.mjs and the GUI smoke test (which writes sampleDwg() to
// a file and imports it through the app).

import { crc16 } from "../../src/io/dwg.js";

// ---------------------------------------------------------------- bit writer

// Writes DWG bit codes (most significant bit first) — the mirror image of
// BitReader, used to build test data.
export class BitWriter {
  constructor() { this.bits = []; }
  B(v) { this.bits.push(v ? 1 : 0); return this; }
  n(v, k) { for (let i = k - 1; i >= 0; i--) this.B((v >> i) & 1); return this; }
  RC(v) { return this.n(v & 255, 8); }
  RS(v) { return this.RC(v & 255).RC((v >> 8) & 255); }
  RL(v) { return this.RS(v & 0xffff).RS((v >>> 16) & 0xffff); }
  RD(v) { const b = new Uint8Array(new Float64Array([v]).buffer); for (const x of b) this.RC(x); return this; }
  BS(v) { if (v === 0) return this.n(2, 2); if (v === 256) return this.n(3, 2); if (v >= 0 && v < 256) return this.n(1, 2).RC(v); return this.n(0, 2).RS(v & 0xffff); }
  BL(v) { if (v === 0) return this.n(2, 2); if (v > 0 && v < 256) return this.n(1, 2).RC(v); return this.n(0, 2).RL(v >>> 0); }
  BD(v) { if (v === 0) return this.n(2, 2); if (v === 1) return this.n(1, 2); return this.n(0, 2).RD(v); }
  DD(v, def) { return v === def ? this.n(0, 2) : this.n(3, 2).RD(v); }
  BD3(p) { return this.BD(p[0]).BD(p[1]).BD(p[2]); }
  H(code, v) { const b = []; while (v > 0) { b.unshift(v & 255); v = Math.floor(v / 256); } this.n(code, 4).n(b.length, 4); for (const x of b) this.RC(x); return this; }
  T(s) { this.BS(s.length); for (const ch of s) this.RC(ch.charCodeAt(0)); return this; }
  get length() { return this.bits.length; }
  bytes() { const out = new Uint8Array(Math.ceil(this.bits.length / 8)); this.bits.forEach((b, i) => { if (b) out[i >> 3] |= 0x80 >> (i & 7); }); return out; }
}

// ---------------------------------------------------------------- R2000 objects

// Entity: data written by `body`, handles by `handles` (after the layer).
export function entityObject(type, handle, { entmode = 2, owner = 0, layer, color = 256, body, handles }) {
  const d = new BitWriter();
  d.BS(type);
  const sizeAt = d.length;
  d.RL(0); // bit size, patched below
  d.H(0, handle);
  d.BS(0); // no extended data
  d.B(0); // no graphics
  d.n(entmode, 2).BL(0).B(1).BS(color).BD(1).n(0, 2).n(0, 2).BS(0).RC(29);
  body(d);
  const bitsize = d.length;
  if (entmode === 0) d.H(4, owner);
  d.H(3, 0); // xdictionary (none)
  d.H(5, layer);
  if (handles) handles(d);
  return patchBitsize(d, sizeAt, bitsize);
}

// Table entry (LAYER, BLOCK_HEADER …): data written by `body`.
export function tableObject(type, handle, body) {
  const d = new BitWriter();
  d.BS(type);
  const sizeAt = d.length;
  d.RL(0);
  d.H(0, handle);
  d.BS(0);
  d.BL(0); // reactors
  body(d);
  const bitsize = d.length;
  d.H(4, 1).H(3, 0);
  return patchBitsize(d, sizeAt, bitsize);
}

function patchBitsize(d, at, bitsize) {
  const w = new BitWriter().RL(bitsize);
  for (let i = 0; i < 32; i++) d.bits[at + i] = w.bits[i];
  return d.bytes();
}

// File = header + locators, header variables, classes, objects, handle map.
// `objects` is a list of [handle, bytes]. The header variables are zeros
// (no units), so imports guess the units unless they are given.
export function buildR2000(objects, { headerBytes = new Uint8Array(4096) } = {}) {
  const parts = [];
  let pos = 0x19 + 3 * 9 + 2 + 16;
  const sentinel = new Uint8Array(16).fill(0xaa);
  const section = (data) => {
    const s = new Uint8Array(16 + 4 + data.length + 2 + 16);
    s.set(sentinel, 0);
    new DataView(s.buffer).setUint32(16, data.length, true);
    s.set(data, 20);
    s.set(sentinel, 22 + data.length);
    const at = pos;
    parts.push(s);
    pos += s.length;
    return { at, size: s.length };
  };
  const hdr = section(headerBytes);
  const cls = section(new Uint8Array(0));
  // Objects: MS size, data, CRC.
  const locs = [];
  for (const [handle, data] of objects) {
    const o = new Uint8Array(2 + data.length + 2);
    new DataView(o.buffer).setUint16(0, data.length, true);
    o.set(data, 2);
    new DataView(o.buffer).setUint16(2 + data.length, crc16(o, 0xc0c1, 0, 2 + data.length), true);
    locs.push([handle, pos]);
    parts.push(o);
    pos += o.length;
  }
  // Handle map: one section of (handle delta, offset delta) pairs.
  const mc = (v, signed) => {
    const out = [];
    let a = Math.abs(v);
    for (;;) {
      const lim = signed ? 0x40 : 0x80;
      if (a < lim) { out.push(a | (signed && v < 0 ? 0x40 : 0)); break; }
      out.push((a & 0x7f) | 0x80);
      a = Math.floor(a / 128);
    }
    return out;
  };
  const body = [];
  let ph = 0, pl = 0;
  for (const [h, l] of locs.sort((a, b) => a[0] - b[0])) { body.push(...mc(h - ph, false), ...mc(l - pl, true)); ph = h; pl = l; }
  const map = new Uint8Array(2 + body.length + 2 + 4);
  map[0] = (body.length + 2) >> 8; map[1] = (body.length + 2) & 255;
  map.set(body, 2);
  const c = crc16(map, 0xc0c1, 0, 2 + body.length);
  map[2 + body.length] = c >> 8; map[3 + body.length] = c & 255;
  map[5 + body.length] = 2; // closing empty section
  const handlesAt = pos;
  parts.push(map);
  pos += map.length;

  const head = new Uint8Array(0x19 + 3 * 9 + 2 + 16);
  head.set([..."AC1015"].map((ch) => ch.charCodeAt(0)), 0);
  const dv = new DataView(head.buffer);
  dv.setUint16(0x13, 30, true);
  dv.setUint32(0x15, 3, true);
  [[0, hdr.at, hdr.size], [1, cls.at, cls.size], [2, handlesAt, map.length]].forEach(([n, at, size], i) => {
    head[0x19 + i * 9] = n;
    dv.setUint32(0x19 + i * 9 + 1, at, true);
    dv.setUint32(0x19 + i * 9 + 5, size, true);
  });
  dv.setUint16(0x19 + 27, crc16(head, 0xc0c1, 0, 0x19 + 27), true);
  const out = new Uint8Array(pos);
  out.set(head, 0);
  let p = head.length;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// ---------------------------------------------------------------- the sample drawing

const L0 = 0x10, LWALL = 0x11, MS = 0x1f, DOOR = 0x20;

// Layers 0 / Walls / Hidden (off), a Door block, and LINE, CIRCLE (in the
// block), INSERT (×2, 90°), closed LWPOLYLINE with a bulge, TEXT and ARC.
export function sampleDwg() {
  const layer = (h, name, color, flags = 0) => [h, tableObject(0x33, h, (d) => d.T(name).B(0).BS(0).B(0).BS(flags).BS(color))];
  const block = (h, name, base) => [h, tableObject(0x31, h, (d) => d.T(name).B(0).BS(0).B(0).B(0).B(0).B(0).B(0).B(1).BD3(base))];
  return buildR2000([
    layer(L0, "0", 7),
    layer(LWALL, "Walls", 1),
    layer(0x12, "Hidden", 3, 2),
    block(MS, "*Model_Space", [0, 0, 0]),
    block(DOOR, "Door", [10, 0, 0]),
    // LINE (0,0) → (5000,0) on Walls.
    [0x30, entityObject(19, 0x30, { layer: LWALL, body: (d) => d.B(1).RD(0).DD(5000, 0).RD(0).DD(0, 0).B(1).B(1) })],
    // CIRCLE in the Door block, radius 400 at (410, 0).
    [0x31, entityObject(18, 0x31, { entmode: 0, owner: DOOR, layer: L0, color: 0, body: (d) => d.BD3([410, 0, 0]).BD(400).B(1).B(1) })],
    // INSERT of Door at (1000, 2000), scale 2, rotated 90°.
    [0x32, entityObject(7, 0x32, { layer: LWALL, body: (d) => d.BD3([1000, 2000, 0]).n(2, 2).RD(2).BD(Math.PI / 2).BD3([0, 0, 1]).B(0), handles: (d) => d.H(5, DOOR) })],
    // Closed LWPOLYLINE, a 1000 square with one bulged side, colour 3.
    [0x33, entityObject(77, 0x33, { layer: LWALL, color: 3, body: (d) => d.BS(512 | 16).BL(4).BL(4).RD(0).RD(0).DD(1000, 0).DD(0, 0).DD(1000, 1000).DD(1000, 0).DD(0, 1000).DD(1000, 1000).BD(0).BD(0.5).BD(0).BD(0) })],
    // TEXT "Hello" at (100, 300), height 250, rotated 30°.
    [0x34, entityObject(1, 0x34, { layer: L0, body: (d) => d.RC(0xff & ~(1 | 8)).RD(0).RD(100).RD(300).B(1).B(1).RD(Math.PI / 6).RD(250).T("Hello"), handles: (d) => d.H(5, 0) })],
    // ARC centre (3000, 3000) r 500 from 0° to 90°.
    [0x35, entityObject(17, 0x35, { layer: 0x12, body: (d) => d.BD3([3000, 3000, 0]).BD(500).B(1).B(1).BD(0).BD(Math.PI / 2) })],
  ]);
}

// The same drawing as DXF.
export function sampleDxf() {
  const rec = (type, tags) => [["0", type], ...tags].map(([c, v]) => `${c}\r\n${v}`).join("\r\n");
  const s = [
    rec("SECTION", [[2, "TABLES"]]),
    rec("LAYER", [[2, "0"], [62, 7], [70, 0]]), rec("LAYER", [[2, "Walls"], [62, 1], [70, 0]]), rec("LAYER", [[2, "Hidden"], [62, -3], [70, 0]]),
    rec("ENDSEC", []),
    rec("SECTION", [[2, "BLOCKS"]]),
    rec("BLOCK", [[2, "Door"], [10, 10], [20, 0], [70, 0]]), rec("CIRCLE", [[8, "0"], [62, 0], [10, 410], [20, 0], [40, 400]]), rec("ENDBLK", []),
    rec("ENDSEC", []),
    rec("SECTION", [[2, "ENTITIES"]]),
    rec("LINE", [[8, "Walls"], [10, 0], [20, 0], [11, 5000], [21, 0]]),
    rec("INSERT", [[8, "Walls"], [2, "Door"], [10, 1000], [20, 2000], [41, 2], [42, 2], [43, 2], [50, 90]]),
    rec("LWPOLYLINE", [[8, "Walls"], [62, 3], [70, 1], [10, 0], [20, 0], [10, 1000], [20, 0], [42, 0.5], [10, 1000], [20, 1000], [10, 0], [20, 1000]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 300], [40, 250], [50, 30], [1, "Hello"]]),
    rec("ARC", [[8, "Hidden"], [10, 3000], [20, 3000], [40, 500], [50, 0], [51, 90]]),
    rec("ENDSEC", []), rec("EOF", []),
  ];
  return s.join("\r\n") + "\r\n";
}
