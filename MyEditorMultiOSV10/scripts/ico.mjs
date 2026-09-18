// Pure-JS ICO (Windows) and ICNS (macOS) encoders.
//
// Shortcuts, the EXE resource (rcedit) and the Windows taskbar often ignore
// or reject PNG-compressed ICO frames (blank desktop / Start / taskbar icon).
// Every size is written as a 32-bit BMP (DIB + AND mask) when `rgba` is given.

function bmpIcon(size, rgba) {
  const xorStride = size * 4;
  const andStride = ((size + 31) >> 5) * 4;
  const xorLen = xorStride * size;
  const andLen = andStride * size;
  const out = new Uint8Array(40 + xorLen + andLen);
  const view = new DataView(out.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true);   // XOR + AND
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(20, xorLen, true);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    const dst = 40 + y * xorStride;
    for (let x = 0; x < size; x++) {
      const i = src + x * 4;
      const o = dst + x * 4;
      out[o] = rgba[i + 2];
      out[o + 1] = rgba[i + 1];
      out[o + 2] = rgba[i];
      out[o + 3] = rgba[i + 3];
    }
  }
  return out;
}

// entries: Array<{ size: number, png: Uint8Array, rgba?: Uint8Array }>
export function encodeIco(entries) {
  // ICO stores width/height in a single byte; 256 is encoded as 0. Max 256.
  const usable = entries.filter((e) => e.size <= 256).sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICO requires at least one image of size <= 256.');

  const blobs = usable.map((e) => {
    if (e.rgba && e.rgba.length >= e.size * e.size * 4) return bmpIcon(e.size, e.rgba);
    return e.png;
  });

  const count = usable.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const total = blobs.reduce((sum, b) => sum + b.length, headerSize);

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  // ICONDIR
  view.setUint16(0, 0, true);      // reserved
  view.setUint16(2, 1, true);      // type = icon
  view.setUint16(4, count, true);  // image count

  let dirPos = 6;
  for (let i = 0; i < usable.length; i++) {
    const e = usable[i], data = blobs[i];
    const dim = e.size >= 256 ? 0 : e.size;
    buf[dirPos + 0] = dim;         // width
    buf[dirPos + 1] = dim;         // height
    buf[dirPos + 2] = 0;           // palette
    buf[dirPos + 3] = 0;           // reserved
    view.setUint16(dirPos + 4, 1, true);   // color planes
    view.setUint16(dirPos + 6, 32, true);  // bits per pixel
    view.setUint32(dirPos + 8, data.length, true);
    view.setUint32(dirPos + 12, offset, true);
    buf.set(data, offset);
    offset += data.length;
    dirPos += 16;
  }
  return buf;
}

// OSType code per size for PNG-based ICNS entries.
const ICNS_TYPES = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09',
  1024: 'ic10',
};

export function encodeIcns(entries) {
  const usable = entries.filter((e) => ICNS_TYPES[e.size]).sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICNS requires images of size 16/32/64/128/256/512/1024.');

  const chunks = [];
  let bodyLen = 0;
  for (const e of usable) {
    const type = ICNS_TYPES[e.size];
    const chunkLen = 8 + e.png.length;
    const chunk = new Uint8Array(chunkLen);
    const dv = new DataView(chunk.buffer);
    for (let i = 0; i < 4; i++) chunk[i] = type.charCodeAt(i);
    dv.setUint32(4, chunkLen, false); // big-endian length incl. 8-byte header
    chunk.set(e.png, 8);
    chunks.push(chunk);
    bodyLen += chunkLen;
  }

  const totalLen = 8 + bodyLen;
  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);
  out[0] = 0x69; out[1] = 0x63; out[2] = 0x6e; out[3] = 0x73; // 'icns'
  dv.setUint32(4, totalLen, false);
  let pos = 8;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
