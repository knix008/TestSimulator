/* ZIP reader — DICOM studies are often shared as .zip archives (CD export, cloud download).
 *
 *   ZipReader.list(bytes)            → [{ name, size, csize, method, offset, isDir }]   (central directory)
 *   ZipReader.extract(bytes, entry)  → Promise<Uint8Array>   (stored or deflate; inflate via DicomDecoder)
 *   ZipReader.readAll(bytes)         → Promise<[{ name, data }]>   (files only)
 * ZIP64 sizes and UTF-8 names are understood; encrypted entries are rejected.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dicomDecoder.js'));
  else root.ZipReader = factory(root.DicomDecoder);
})(typeof self !== 'undefined' ? self : this, function (D) {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

  function list(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    // end of central directory: the last 0x06054b50 within 64 KB + 22 bytes of the end
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a ZIP archive (no end of central directory)');
    let count = u16(b, eocd + 10), cdOffset = u32(b, eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && u32(b, loc) === 0x07064b50) {
        const z = u64(b, loc + 8);
        if (u32(b, z) === 0x06064b50) { count = u64(b, z + 32); cdOffset = u64(b, z + 48); }
      }
    }
    const out = [];
    let p = cdOffset;
    for (let i = 0; i < count && p + 46 <= b.length; i++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('Damaged ZIP central directory');
      const flags = u16(b, p + 8), method = u16(b, p + 10);
      let csize = u32(b, p + 20), size = u32(b, p + 24);
      const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
      let offset = u32(b, p + 42);
      const nameBytes = b.subarray(p + 46, p + 46 + nameLen);
      const name = (flags & 0x800 ? new TextDecoder('utf-8') : new TextDecoder('utf-8', { fatal: false })).decode(nameBytes).replace(/\\/g, '/');
      // ZIP64 extra field
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = u16(b, e), len = u16(b, e + 2);
        if (id === 1) {
          let q = e + 4;
          if (size === 0xffffffff) { size = u64(b, q); q += 8; }
          if (csize === 0xffffffff) { csize = u64(b, q); q += 8; }
          if (offset === 0xffffffff) { offset = u64(b, q); q += 8; }
        }
        e += 4 + len;
      }
      out.push({ name, size, csize, method, offset, flags, isDir: name.endsWith('/') });
      p = eEnd + commentLen;
    }
    return out;
  }

  async function extract(input, entry) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (entry.flags & 1) throw new Error(`${entry.name}: encrypted ZIP entries are not supported`);
    const p = entry.offset;
    if (u32(b, p) !== 0x04034b50) throw new Error(`${entry.name}: damaged local header`);
    const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
    const data = b.subarray(start, start + entry.csize);
    if (entry.method === 0) return data.slice();
    if (entry.method === 8) return D.inflateRaw(data);
    throw new Error(`${entry.name}: ZIP method ${entry.method} is not supported`);
  }

  async function readAll(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    const out = [];
    for (const e of list(b)) if (!e.isDir && !/(^|\/)__MACOSX\//.test(e.name)) out.push({ name: e.name, data: await extract(b, e) });
    return out;
  }

  return { list, extract, readAll };
});
