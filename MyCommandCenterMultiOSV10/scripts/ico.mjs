// Pure-JS ICO (Windows) and ICNS (macOS) encoders.
// The ICO is uncompressed 32-bit BMP. NSIS uses that file as the installer
// and uninstaller icon, and Windows uses the same file for the program, so a
// PNG-compressed ICO (which NSIS ignores, leaving its own globe) would make
// the setup file look different from the running app and its shortcuts.
// ICNS still packs PNG images, which is what macOS wants.

// entries: Array<{ size: number, rgba: Uint8Array }>
// rgba is top-down, 4 bytes per pixel (R, G, B, A).
export function encodeIcoBmp(entries) {
  const usable = entries.filter((e) => e.size <= 256 && e.rgba.length === e.size * e.size * 4)
    .sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICO requires at least one image of size <= 256.');

  const images = usable.map((e) => dibIcon(e.size, e.rgba));
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const total = images.reduce((sum, img) => sum + img.length, headerSize);
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, count, true);

  let dirPos = 6;
  for (let i = 0; i < count; i += 1) {
    const size = usable[i].size;
    const img = images[i];
    const dim = size >= 256 ? 0 : size;
    buf[dirPos + 0] = dim;
    buf[dirPos + 1] = dim;
    buf[dirPos + 2] = 0;
    buf[dirPos + 3] = 0;
    view.setUint16(dirPos + 4, 1, true);
    view.setUint16(dirPos + 6, 32, true);
    view.setUint32(dirPos + 8, img.length, true);
    view.setUint32(dirPos + 12, offset, true);
    buf.set(img, offset);
    offset += img.length;
    dirPos += 16;
  }
  return buf;
}

function dibIcon(size, rgba) {
  const header = 40;
  const xorSize = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskSize = maskStride * size;
  const buf = Buffer.alloc(header + xorSize + maskSize);
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(0, 16);
  buf.writeUInt32LE(xorSize + maskSize, 20);
  for (let y = 0; y < size; y += 1) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const si = (srcY * size + x) * 4;
      const di = header + (y * size + x) * 4;
      buf[di] = rgba[si + 2];
      buf[di + 1] = rgba[si + 1];
      buf[di + 2] = rgba[si];
      buf[di + 3] = rgba[si + 3];
    }
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
