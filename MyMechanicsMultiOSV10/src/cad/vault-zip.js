// A stored (uncompressed) ZIP writer and reader for Pack and Go on the web build and for tests — the same
// layout as the desktop backend's (src-tauri/src/vault.rs): UTF-8 names, CRC-32, no compression.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = (s) => new TextEncoder().encode(s);

/** ZIP bytes of [{ name, content (string | Uint8Array) }]. */
export function makeZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = String(e.name).replace(/\\/g, '/');
    if (!name || name.split('/').some((p) => !p || p === '..')) throw new Error(`bad name: ${e.name}`);
    const data = typeof e.content === 'string' ? enc(e.content) : e.content;
    const n = enc(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true); local.setUint16(28, 0, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, n.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

/** The entries of a stored ZIP: [{ name, content (string), crcOk }] (reads the central directory). */
export function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const crc = v.getUint32(p + 16, true); const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true); const extra = v.getUint16(p + 30, true); const comment = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const localName = v.getUint16(offset + 26, true); const localExtra = v.getUint16(offset + 28, true);
    const data = bytes.subarray(offset + 30 + localName + localExtra, offset + 30 + localName + localExtra + size);
    out.push({ name, content: dec.decode(data), crcOk: crc32(data) === crc });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
