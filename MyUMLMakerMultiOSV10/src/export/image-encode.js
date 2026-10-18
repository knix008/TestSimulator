// Image file formats for "Export as image". PNG, JPEG and WebP come from the
// browser's canvas encoder; BMP and TIFF are written here (32-bit with alpha,
// uncompressed); SVG is the vector drawing itself.

/** id → file extension, MIME type, transparency support, who encodes it. */
export const IMAGE_FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', alpha: true, encoder: 'canvas' },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', alpha: false, encoder: 'canvas', quality: true },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', alpha: true, encoder: 'canvas', quality: true },
  { id: 'bmp', label: 'BMP', ext: 'bmp', mime: 'image/bmp', alpha: true, encoder: 'bmp' },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', mime: 'image/tiff', alpha: true, encoder: 'tiff' },
  { id: 'svg', label: 'SVG', ext: 'svg', mime: 'image/svg+xml', alpha: true, encoder: 'svg' },
];
export const imageFormat = (id) => IMAGE_FORMATS.find((format) => format.id === id) ?? IMAGE_FORMATS[0];
export const IMAGE_SCALES = [1, 2, 3];

/** Pixel size of the exported raster: the drawing × scale, capped so no side passes 16 000 px. */
export function rasterSize(width, height, scale) {
  const factor = Math.min(scale, 16000 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)), factor };
}

/** Longest side of a diagram background picture: larger pictures are scaled down when they are chosen. */
export const BACKGROUND_IMAGE_MAX = 2560;

/** A picture's size scaled down (never up) so that no side passes `max`: { width, height, scaled }. */
export function fitWithin(width, height, max = BACKGROUND_IMAGE_MAX) {
  const w = Math.max(1, Number(width) || 1); const h = Math.max(1, Number(height) || 1);
  const factor = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * factor)), height: Math.max(1, Math.round(h * factor)), scaled: factor < 1 };
}

/**
 * 32-bit BMP (BITMAPV4HEADER with an alpha mask) from RGBA pixels, top row first.
 * Rows are stored bottom-up as BGRA.
 */
export function encodeBmp(rgba, width, height) {
  const headerSize = 14 + 108;
  const imageSize = width * height * 4;
  const out = new Uint8Array(headerSize + imageSize);
  const view = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; // "BM"
  view.setUint32(2, out.length, true);
  view.setUint32(10, headerSize, true);
  view.setUint32(14, 108, true); // BITMAPV4HEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bits per pixel
  view.setUint32(30, 3, true); // BI_BITFIELDS
  view.setUint32(34, imageSize, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  view.setUint32(54, 0x00ff0000, true); // red mask
  view.setUint32(58, 0x0000ff00, true); // green
  view.setUint32(62, 0x000000ff, true); // blue
  view.setUint32(66, 0xff000000, true); // alpha
  view.setUint32(70, 0x73524742, true); // 'sRGB'
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    let dst = headerSize + y * width * 4;
    for (let x = 0; x < width; x++, dst += 4) {
      const i = src + x * 4;
      out[dst] = rgba[i + 2];
      out[dst + 1] = rgba[i + 1];
      out[dst + 2] = rgba[i];
      out[dst + 3] = rgba[i + 3];
    }
  }
  return out;
}

/** Uncompressed baseline TIFF, RGBA with unassociated alpha (ExtraSamples = 2), one strip. */
export function encodeTiff(rgba, width, height) {
  const entries = [
    [256, 4, 1, width], // ImageWidth
    [257, 4, 1, height], // ImageLength
    [258, 3, 4, 'bits'], // BitsPerSample 8,8,8,8
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 2], // Photometric: RGB
    [273, 4, 1, 'strip'], // StripOffsets
    [277, 3, 1, 4], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip
    [279, 4, 1, width * height * 4], // StripByteCounts
    [282, 5, 1, 'xres'], // XResolution
    [283, 5, 1, 'yres'], // YResolution
    [284, 3, 1, 1], // PlanarConfiguration: chunky
    [296, 3, 1, 2], // ResolutionUnit: inch
    [338, 3, 1, 2], // ExtraSamples: unassociated alpha
  ];
  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const xresOffset = bitsOffset + 8;
  const yresOffset = xresOffset + 8;
  const stripOffset = yresOffset + 8;
  const out = new Uint8Array(stripOffset + width * height * 4);
  const view = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; // "II" little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const at = ifdOffset + 2 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    const resolved = { bits: bitsOffset, strip: stripOffset, xres: xresOffset, yres: yresOffset }[value] ?? value;
    if (type === 3 && count === 1) view.setUint16(at + 8, resolved, true);
    else view.setUint32(at + 8, resolved, true);
  });
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true); // no next IFD
  for (let i = 0; i < 4; i++) view.setUint16(bitsOffset + i * 2, 8, true);
  for (const offset of [xresOffset, yresOffset]) { view.setUint32(offset, 72, true); view.setUint32(offset + 4, 1, true); }
  out.set(rgba.subarray(0, width * height * 4), stripOffset);
  return out;
}
