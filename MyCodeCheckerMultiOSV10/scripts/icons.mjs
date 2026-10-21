// ICO (Windows) and ICNS (macOS) writers. Windows gets a 32-bit BMP frame so
// the taskbar and the installer accept the icon. macOS gets PNG chunks.

function bmpFrame(size, rgba) {
  const xorStride = size * 4;
  const andStride = Math.ceil(size / 32) * 4;
  const xorLen = xorStride * size;
  const andLen = andStride * size;
  const out = new Uint8Array(40 + xorLen + andLen);
  const view = new DataView(out.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true);
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

export function encodeIco(entries) {
  const usable = entries.filter((entry) => entry.size > 0 && entry.size <= 256).sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICO needs at least one image up to 256px.');
  const blobs = usable.map((entry) => (entry.rgba && entry.rgba.length >= entry.size * entry.size * 4
    ? bmpFrame(entry.size, entry.rgba)
    : entry.png));
  const header = 6 + usable.length * 16;
  const total = blobs.reduce((sum, blob) => sum + blob.length, header);
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, usable.length, true);
  let offset = header;
  let dir = 6;
  for (let i = 0; i < usable.length; i++) {
    const dim = usable[i].size >= 256 ? 0 : usable[i].size;
    buf[dir] = dim;
    buf[dir + 1] = dim;
    view.setUint16(dir + 4, 1, true);
    view.setUint16(dir + 6, 32, true);
    view.setUint32(dir + 8, blobs[i].length, true);
    view.setUint32(dir + 12, offset, true);
    buf.set(blobs[i], offset);
    offset += blobs[i].length;
    dir += 16;
  }
  return buf;
}

const ICNS = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };

export function encodeIcns(entries) {
  const usable = entries.filter((entry) => ICNS[entry.size]).sort((a, b) => a.size - b.size);
  if (!usable.length) throw new Error('ICNS needs a 16, 32, 64, 128, 256, 512 or 1024 PNG.');
  const chunks = usable.map((entry) => {
    const type = ICNS[entry.size];
    const chunk = new Uint8Array(8 + entry.png.length);
    const view = new DataView(chunk.buffer);
    chunk.set(Buffer.from(type), 0);
    view.setUint32(4, chunk.length, false);
    chunk.set(entry.png, 8);
    return chunk;
  });
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(Buffer.from('icns'), 0);
  view.setUint32(4, total, false);
  let pos = 8;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
