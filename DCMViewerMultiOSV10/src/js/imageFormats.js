/* Decoders for image formats the browser does not open natively: TIFF (UTIF.js — all pages, LZW /
 * PackBits / Deflate / JPEG, 8–16 bit), HEIF / HEIC (libheif, wasm), JPEG 2000 files (.jp2 / .j2k, OpenJPEG).
 * Everything else (JPEG, PNG, GIF, WebP, BMP, ICO, SVG, AVIF) goes through createImageBitmap.
 *
 *   ImageFormats.decode(bytes, ext) → Promise<{ width, height, rgba, pages? } | null>   (null → use the browser)
 *   ImageFormats.EXTS  — extensions handled here
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dicomDecoder'));
  else root.ImageFormats = factory(root.DicomDecoder);
})(typeof self !== 'undefined' ? self : this, function (D) {
  const TIFF = new Set(['tif', 'tiff']);
  const HEIF = new Set(['heic', 'heif', 'hif']);
  const J2K = new Set(['jp2', 'j2k', 'jpc', 'jpx', 'j2c']);
  const EXTS = new Set([...TIFF, ...HEIF, ...J2K]);

  async function decodeTiff(bytes, page = 0) {
    await D.vendor('pako');            // UTIF needs the global for Deflate-compressed strips
    const UTIF = await D.vendor('utif');
    const magic = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1]) : '';
    if (!((magic === 'II' && bytes[2] === 42 && bytes[3] === 0) || (magic === 'MM' && bytes[2] === 0 && bytes[3] === 42) || (magic === 'II' && bytes[2] === 43))) throw new Error('Not a TIFF file');
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error('TIFF has no image');
    const pages = ifds.filter((i) => i.t256 && i.t257);   // IFDs that carry an image (skip EXIF sub-IFDs)
    const ifd = pages[Math.max(0, Math.min(pages.length - 1, page))] || ifds[0];
    UTIF.decodeImage(buf, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    return { width: ifd.width, height: ifd.height, rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), pages: pages.length, page };
  }

  async function decodeHeif(bytes) {
    const lib = await D.vendor('libheif');
    const decoder = new lib.HeifDecoder();
    const images = decoder.decode(bytes);
    if (!images || !images.length) throw new Error('HEIF has no image');
    const img = images[0];
    const width = img.get_width(), height = img.get_height();
    const out = new Uint8ClampedArray(width * height * 4);
    await new Promise((resolve, reject) => {
      img.display({ data: out, width, height }, (r) => (r ? resolve(r) : reject(new Error('HEIF decode failed'))));
    });
    for (const im of images) { try { im.free(); } catch { /* ignore */ } }
    return { width, height, rgba: out, pages: images.length, page: 0 };
  }

  // JP2 container: find the contiguous codestream box ('jp2c'); a bare .j2k / .jpc file is the codestream itself.
  function j2kCodestream(bytes) {
    if (bytes.length > 4 && bytes[0] === 0xFF && bytes[1] === 0x4F && bytes[2] === 0xFF && bytes[3] === 0x51) return bytes;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;
    while (pos + 8 <= bytes.length) {
      let len = dv.getUint32(pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      let head = 8;
      if (len === 1) { len = Number(dv.getBigUint64(pos + 8)); head = 16; }
      if (len === 0) len = bytes.length - pos;
      if (type === 'jp2c') return bytes.subarray(pos + head, pos + len);
      if (len < head) break;
      pos += len;
    }
    throw new Error('No JPEG 2000 codestream found');
  }

  async function decodeJ2k(bytes) {
    const m = await D.vendor('j2k');
    const cs = j2kCodestream(bytes);
    const d = new m.J2KDecoder();
    try {
      const eb = d.getEncodedBuffer(cs.length);
      eb.set(cs);
      d.decode();
      const fi = d.getFrameInfo();
      const out = d.getDecodedBuffer();
      const { width, height, componentCount: spp, bitsPerSample } = fi;
      const n = width * height;
      const rgba = new Uint8ClampedArray(n * 4);
      const shift = bitsPerSample > 8 ? bitsPerSample - 8 : 0;
      const samples = bitsPerSample > 8 ? new Uint16Array(out.buffer, out.byteOffset, out.byteLength >> 1) : out;
      for (let p = 0; p < n; p++) {
        const o = p * 4;
        if (spp >= 3) { rgba[o] = samples[p * spp] >> shift; rgba[o + 1] = samples[p * spp + 1] >> shift; rgba[o + 2] = samples[p * spp + 2] >> shift; rgba[o + 3] = spp > 3 ? samples[p * spp + 3] >> shift : 255; }
        else { const g = samples[p * spp] >> shift; rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255; }
      }
      return { width, height, rgba, pages: 1, page: 0 };
    } finally { d.delete(); }
  }

  async function decode(bytes, ext, opts = {}) {
    ext = String(ext || '').toLowerCase();
    if (TIFF.has(ext)) return decodeTiff(bytes, opts.page || 0);
    if (HEIF.has(ext)) return decodeHeif(bytes);
    if (J2K.has(ext)) return decodeJ2k(bytes);
    return null;
  }

  return { decode, decodeTiff, decodeHeif, decodeJ2k, j2kCodestream, EXTS, TIFF, HEIF, J2K };
});
