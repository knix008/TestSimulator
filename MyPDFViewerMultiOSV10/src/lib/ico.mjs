// Pure-JS ICO (Windows) and ICNS (macOS) encoders that pack PNG images.
// Modern Windows and macOS both accept PNG-compressed icon entries, so we
// simply rasterize the SVG at each size, export PNG, and wrap them in the
// containers.

// entries: Array<{ size: number, png: Uint8Array }>
export function encodeIco(entries) {
  // ICO stores width/height in a single byte; 256 is encoded as 0. Max 256.
  const usable = entries.filter((e) => e.size <= 256).sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICO requires at least one image of size <= 256.');

  const count = usable.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const total = usable.reduce((sum, e) => sum + e.png.length, headerSize);

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  // ICONDIR
  view.setUint16(0, 0, true);      // reserved
  view.setUint16(2, 1, true);      // type = icon
  view.setUint16(4, count, true);  // image count

  let dirPos = 6;
  for (const e of usable) {
    const dim = e.size >= 256 ? 0 : e.size;
    buf[dirPos + 0] = dim;         // width
    buf[dirPos + 1] = dim;         // height
    buf[dirPos + 2] = 0;           // palette
    buf[dirPos + 3] = 0;           // reserved
    view.setUint16(dirPos + 4, 1, true);   // color planes
    view.setUint16(dirPos + 6, 32, true);  // bits per pixel
    view.setUint32(dirPos + 8, e.png.length, true);  // size of image data
    view.setUint32(dirPos + 12, offset, true);       // offset of image data
    buf.set(e.png, offset);
    offset += e.png.length;
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
