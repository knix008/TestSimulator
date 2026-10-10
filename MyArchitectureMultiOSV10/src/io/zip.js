// Minimal ZIP writer: STORE (no compression), CRC-32, DOS timestamps, UTF-8
// file names (general purpose flag bit 11). Fab houses only need the archive
// to open; Gerbers compress well but storing keeps this dependency-free.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const enc = new TextEncoder();

export function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return enc.encode(String(data ?? ""));
}

// CRC-32 (IEEE 802.3) of a string or bytes, as an unsigned 32-bit number.
export function crc32(data) {
  const bytes = toBytes(data);
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// DOS date/time words for a local Date (2-second resolution, 1980..2107).
export function dosDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xffff, date: day & 0xffff };
}

// files: [{name, data: string|Uint8Array, date?}] -> Uint8Array of a .zip
export function makeZip(files, opts = {}) {
  const entries = files.map((f) => {
    const name = enc.encode(String(f.name).replace(/\\/g, "/"));
    const data = toBytes(f.data);
    return { name, data, crc: crc32(data), dt: dosDateTime(f.date || opts.date || new Date()) };
  });
  const FLAGS = 0x0800; // UTF-8 names
  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  const u32 = (v) => { dv.setUint32(p, v >>> 0, true); p += 4; };
  const bytes = (b) => { out.set(b, p); p += b.length; };

  for (const e of entries) {
    e.offset = p;
    u32(0x04034b50); // local file header
    u16(10); // version needed: 1.0 (stored)
    u16(FLAGS);
    u16(0); // method: store
    u16(e.dt.time);
    u16(e.dt.date);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra length
    bytes(e.name);
    bytes(e.data);
  }
  const cdStart = p;
  for (const e of entries) {
    u32(0x02014b50); // central directory header
    u16(20); // version made by (MS-DOS, 2.0)
    u16(10);
    u16(FLAGS);
    u16(0);
    u16(e.dt.time);
    u16(e.dt.date);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(e.offset);
    bytes(e.name);
  }
  const cdSize = p - cdStart;
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(cdSize);
  u32(cdStart);
  u16(0); // comment length
  return out;
}

// Read back a STORE-only zip (as written above) — handy for tests and previews.
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad central directory");
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(off + 26, true);
    const lxlen = dv.getUint16(off + 28, true);
    const start = off + 30 + lnlen + lxlen;
    files.push({ name, method, crc, data: bytes.subarray(start, start + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
