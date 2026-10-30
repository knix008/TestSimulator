/* Photo information (EXIF) from the source file into a saved JPEG or PNG.
 *
 * A canvas encodes pixels only, so every save used to drop the date taken, camera,
 * exposure and GPS. This reads the source's EXIF (JPEG APP1, or a PNG eXIf chunk),
 * corrects what no longer matches — the orientation (the saved pixels are already
 * upright) and the pixel size — optionally empties the GPS block, and writes it into
 * the new file: as APP1 right after SOI for JPEG, as an eXIf chunk after IHDR for PNG.
 * Plain functions over Uint8Array; shared by the page (window.ExifCarry) and the tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExifCarry = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const EXIF_HEAD = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];   // "Exif\0\0"

  const isJpeg = (b) => b && b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
  const isPng = (b) => b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

  /** The TIFF block (starts "II*\0" or "MM\0*") of a JPEG's EXIF, or null. */
  function jpegTiff(b) {
    if (!isJpeg(b)) return null;
    let off = 2;
    while (off + 4 <= b.length && b[off] === 0xff) {
      const marker = b[off + 1];
      if (marker === 0xda || marker === 0xd9) break;          // image data: no more headers
      const len = (b[off + 2] << 8) | b[off + 3];
      if (marker === 0xe1 && EXIF_HEAD.every((v, i) => b[off + 4 + i] === v)) {
        return b.slice(off + 10, off + 2 + len);
      }
      off += 2 + len;
    }
    return null;
  }

  /** The TIFF block of a PNG's eXIf chunk, or null. */
  function pngTiff(b) {
    if (!isPng(b)) return null;
    let off = 8;
    while (off + 8 <= b.length) {
      const len = ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
      const type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
      if (type === 'eXIf') return b.slice(off + 8, off + 8 + len);
      if (type === 'IDAT' || type === 'IEND') break;
      off += 12 + len;
    }
    return null;
  }

  function sourceTiff(bytes) {
    return jpegTiff(bytes) || pngTiff(bytes);
  }

  /**
   * A copy of the TIFF block with Orientation = 1, the pixel size set to w×h, and (when
   * `stripGps`) an empty GPS directory. Null when the block is not readable.
   */
  function fixTiff(tiff, { width, height, stripGps = false } = {}) {
    if (!tiff || tiff.length < 8) return null;
    const t = tiff.slice();
    const le = t[0] === 0x49 && t[1] === 0x49;
    if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
    const u16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
    const u32 = (o) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3])) >>> 0;
    const w16 = (o, v) => { if (le) { t[o] = v & 255; t[o + 1] = (v >> 8) & 255; } else { t[o] = (v >> 8) & 255; t[o + 1] = v & 255; } };
    const w32 = (o, v) => { for (let i = 0; i < 4; i++) t[o + (le ? i : 3 - i)] = (v >>> (8 * i)) & 255; };
    // Tag value in place: SHORT (3) or LONG (4), count 1
    const setNum = (entry, v) => {
      const type = u16(entry + 2);
      if (type === 3) w16(entry + 8, v);
      else if (type === 4) w32(entry + 8, v);
    };
    const walk = (ifd, fn) => {
      if (!ifd || ifd + 2 > t.length) return;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > t.length) return;
        fn(u16(e), e);
      }
    };
    const ifd0 = u32(4);
    let exifIfd = 0, gpsIfd = 0;
    walk(ifd0, (tag, e) => {
      if (tag === 0x0112) setNum(e, 1);                          // Orientation: pixels are upright now
      else if (tag === 0x0100 && width) setNum(e, width);
      else if (tag === 0x0101 && height) setNum(e, height);
      else if (tag === 0x8769) exifIfd = u32(e + 8);
      else if (tag === 0x8825) gpsIfd = u32(e + 8);
    });
    walk(exifIfd, (tag, e) => {
      if (tag === 0xa002 && width) setNum(e, width);               // PixelXDimension
      else if (tag === 0xa003 && height) setNum(e, height);        // PixelYDimension
    });
    if (stripGps && gpsIfd && gpsIfd + 2 <= t.length) {
      // Zero the whole directory: no entries left, and the old values gone from the file
      const n = u16(gpsIfd);
      t.fill(0, gpsIfd, Math.min(t.length, gpsIfd + 2 + n * 12 + 4));
    }
    return t;
  }

  /** New JPEG with the TIFF block as its APP1 (a JFIF APP0 from the canvas is dropped). */
  function jpegWithExif(jpeg, tiff) {
    if (!isJpeg(jpeg) || !tiff || tiff.length + 8 > 0xffff) return jpeg;
    let rest = 2;
    if (jpeg[2] === 0xff && jpeg[3] === 0xe0) rest = 4 + ((jpeg[4] << 8) | jpeg[5]);
    const segLen = 2 + EXIF_HEAD.length + tiff.length;
    const out = new Uint8Array(2 + 2 + segLen + (jpeg.length - rest));
    out.set([0xff, 0xd8, 0xff, 0xe1, segLen >> 8, segLen & 255], 0);
    out.set(EXIF_HEAD, 6);
    out.set(tiff, 12);
    out.set(jpeg.subarray(rest), 12 + tiff.length);
    return out;
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** New PNG with an eXIf chunk right after IHDR. */
  function pngWithExif(png, tiff) {
    if (!isPng(png) || !tiff) return png;
    const ihdrLen = ((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]) >>> 0;
    const at = 8 + 12 + ihdrLen;
    const chunk = new Uint8Array(12 + tiff.length);
    const len = tiff.length;
    chunk.set([len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, 0x65, 0x58, 0x49, 0x66], 0);
    chunk.set(tiff, 8);
    const crc = crc32(chunk.subarray(4, 8 + len));
    chunk.set([crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255], 8 + len);
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, at), 0);
    out.set(chunk, at);
    out.set(png.subarray(at), at + chunk.length);
    return out;
  }

  /**
   * The saved file's bytes with the source's EXIF carried over (unchanged bytes when the
   * source has none, or the output is not JPEG / PNG).
   */
  function carry(outBytes, srcBytes, opts = {}) {
    const tiff = fixTiff(sourceTiff(srcBytes), opts);
    if (!tiff) return outBytes;
    if (isJpeg(outBytes)) return jpegWithExif(outBytes, tiff);
    if (isPng(outBytes)) return pngWithExif(outBytes, tiff);
    return outBytes;
  }

  return { jpegTiff, pngTiff, sourceTiff, fixTiff, jpegWithExif, pngWithExif, crc32, carry };
}));
