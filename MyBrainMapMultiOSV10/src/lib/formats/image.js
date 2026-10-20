// Picture files the browser cannot write itself (canvas.toBlob knows PNG, JPEG and,
// in Chromium, WebP): BMP and TIFF, from the RGBA pixels of a canvas
// (ImageData.data: rows top to bottom, 4 bytes a pixel, alpha not premultiplied).
// Pure — no DOM — so the tests check the bytes.

// BMP: 24-bit, no alpha (most programs ignore a BMP's alpha), rows bottom-up, each
// padded to 4 bytes. The pixels are expected on their background already.
export function encodeBmp(rgba, width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;                    // "BM"
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);                       // where the pixels start
  v.setUint32(14, 40, true);                       // BITMAPINFOHEADER
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);                    // positive: bottom-up
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * height, true);
  v.setInt32(38, 2835, true);                      // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    let o = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[o++] = rgba[i + 2]; out[o++] = rgba[i + 1]; out[o++] = rgba[i];
    }
  }
  return out;
}

// TIFF: little-endian, one uncompressed strip, RGB — or RGBA with an unassociated
// alpha channel (ExtraSamples = 2) when `alpha`, which keeps a transparent background.
export function encodeTiff(rgba, width, height, { alpha = false } = {}) {
  const spp = alpha ? 4 : 3;
  const data = width * height * spp;
  const tags = [
    [256, 4, 1, width],                            // ImageWidth
    [257, 4, 1, height],                           // ImageLength
    [258, 3, spp, 'bps'],                          // BitsPerSample (8 each, stored apart)
    [259, 3, 1, 1],                                // Compression: none
    [262, 3, 1, 2],                                // Photometric: RGB
    [273, 4, 1, 'strip'],                          // StripOffsets
    [277, 3, 1, spp],                              // SamplesPerPixel
    [278, 4, 1, height],                           // RowsPerStrip
    [279, 4, 1, data],                             // StripByteCounts
    [282, 5, 1, 'xres'],                           // XResolution
    [283, 5, 1, 'yres'],                           // YResolution
    [284, 3, 1, 1],                                // PlanarConfiguration: chunky
    [296, 3, 1, 2],                                // ResolutionUnit: inch
    ...(alpha ? [[338, 3, 1, 2]] : []),            // ExtraSamples: unassociated alpha
  ];
  const ifd = 8;
  const ifdSize = 2 + tags.length * 12 + 4;
  const bpsAt = ifd + ifdSize;                     // spp shorts
  const resAt = bpsAt + spp * 2;                   // two rationals
  const stripAt = resAt + 16;
  const out = new Uint8Array(stripAt + data);
  const v = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; v.setUint16(2, 42, true); v.setUint32(4, ifd, true);
  v.setUint16(ifd, tags.length, true);
  tags.forEach(([tag, type, count, value], k) => {
    const o = ifd + 2 + k * 12;
    v.setUint16(o, tag, true); v.setUint16(o + 2, type, true); v.setUint32(o + 4, count, true);
    const val = value === 'bps' ? bpsAt : value === 'strip' ? stripAt : value === 'xres' ? resAt : value === 'yres' ? resAt + 8 : value;
    if (type === 3 && count === 1) v.setUint16(o + 8, val, true); else v.setUint32(o + 8, val, true);
  });
  v.setUint32(ifd + 2 + tags.length * 12, 0, true);   // no next IFD
  for (let s = 0; s < spp; s++) v.setUint16(bpsAt + s * 2, 8, true);
  v.setUint32(resAt, 72, true); v.setUint32(resAt + 4, 1, true);
  v.setUint32(resAt + 8, 72, true); v.setUint32(resAt + 12, 1, true);
  let o = stripAt;
  for (let i = 0; i < width * height * 4; i += 4) {
    out[o++] = rgba[i]; out[o++] = rgba[i + 1]; out[o++] = rgba[i + 2];
    if (alpha) out[o++] = rgba[i + 3];
  }
  return out;
}
