// Builders for the picture fixtures: a TIFF and a DICOM, written here rather
// than checked in as binaries, so a test can say exactly what it is feeding the
// decoder (8-bit or 16-bit, compressed or not, little- or big-endian).
import zlib from 'node:zlib';

/** PackBits, the run-length scheme TIFF compression 32773 uses. */
export function packBits(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < 128) run++;
    if (run >= 2) {
      out.push(257 - run, bytes[i]);
      i += run;
    } else {
      let literal = 1;
      while (
        i + literal < bytes.length
        && literal < 128
        && !(i + literal + 1 < bytes.length && bytes[i + literal] === bytes[i + literal + 1])
      ) literal++;
      out.push(literal - 1);
      for (let k = 0; k < literal; k++) out.push(bytes[i + k]);
      i += literal;
    }
  }
  return Uint8Array.from(out);
}

/**
 * Writes a baseline TIFF.
 * @param {object} options
 *   - `width`, `height`
 *   - `pixels`      raw sample bytes, row by row
 *   - `samples`     1 (grey) or 3 (RGB)
 *   - `bits`        8 or 16
 *   - `compression` 1 (none), 32773 (PackBits) or 32946 (Deflate)
 *   - `little`      byte order
 *   - `photometric` 0 (white is zero), 1 (black is zero) or 2 (RGB)
 */
export function makeTiff({
  width, height, pixels, samples = 1, bits = 8, compression = 1, little = true, photometric,
}) {
  let body = Buffer.from(pixels);
  if (compression === 32773) body = Buffer.from(packBits(body));
  else if (compression === 32946) body = zlib.deflateSync(body);

  const photo = photometric ?? (samples >= 3 ? 2 : 1);
  const entries = [
    [256, 3, 1, width],                      // ImageWidth
    [257, 3, 1, height],                     // ImageLength
    [258, 3, 1, bits],                       // BitsPerSample (one value: enough for this fixture)
    [259, 3, 1, compression],                // Compression
    [262, 3, 1, photo],                      // PhotometricInterpretation
    [273, 4, 1, 0],                          // StripOffsets — filled in below
    [277, 3, 1, samples],                    // SamplesPerPixel
    [278, 3, 1, height],                     // RowsPerStrip
    [279, 4, 1, body.length],                // StripByteCounts
    [284, 3, 1, 1],                          // PlanarConfiguration
  ];

  const headerSize = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = headerSize + ifdSize;
  entries[5][3] = dataOffset;                // the strip starts after the IFD

  const buffer = Buffer.alloc(dataOffset + body.length);
  const w16 = (at, value) => (little ? buffer.writeUInt16LE(value, at) : buffer.writeUInt16BE(value, at));
  const w32 = (at, value) => (little ? buffer.writeUInt32LE(value, at) : buffer.writeUInt32BE(value, at));

  buffer.write(little ? 'II' : 'MM', 0, 'ascii');
  w16(2, 42);
  w32(4, headerSize);
  w16(headerSize, entries.length);

  entries.forEach(([tag, type, count, value], i) => {
    const at = headerSize + 2 + i * 12;
    w16(at, tag);
    w16(at + 2, type);
    w32(at + 4, count);
    if (type === 3) { w16(at + 8, value); w16(at + 10, 0); }
    else w32(at + 8, value);
  });
  w32(headerSize + 2 + entries.length * 12, 0);   // no next IFD
  body.copy(buffer, dataOffset);

  return new Uint8Array(buffer);
}

/**
 * Writes an explicit-VR little-endian DICOM file.
 * @param {object} options `width`, `height`, `pixels` (8- or 16-bit), `bits`,
 *   `photometric`, `extra` — further [group, element, vr, value] elements.
 */
export function makeDicom({
  width, height, pixels, bits = 8, photometric = 'MONOCHROME2', extra = [], windowCenter, windowWidth,
}) {
  const parts = [];
  const element = (group, elem, vr, payload) => {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'latin1');
    const padded = body.length % 2 ? Buffer.concat([body, Buffer.from([vr === 'UI' ? 0 : 0x20])]) : body;
    if (['OB', 'OW', 'SQ', 'UT', 'UN'].includes(vr)) {
      const head = Buffer.alloc(12);
      head.writeUInt16LE(group, 0);
      head.writeUInt16LE(elem, 2);
      head.write(vr, 4, 'ascii');
      head.writeUInt32LE(padded.length, 8);
      parts.push(head, padded);
      return;
    }
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(elem, 2);
    head.write(vr, 4, 'ascii');
    head.writeUInt16LE(padded.length, 6);
    parts.push(head, padded);
  };

  const us = (value) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(value, 0);
    return b;
  };

  // File meta: the group length first, then the transfer syntax it describes.
  const meta = [];
  const metaElement = (group, elem, vr, payload) => {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'latin1');
    const padded = body.length % 2 ? Buffer.concat([body, Buffer.from([0])]) : body;
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(elem, 2);
    head.write(vr, 4, 'ascii');
    head.writeUInt16LE(padded.length, 6);
    meta.push(head, padded);
  };
  metaElement(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');   // explicit VR little endian
  const metaBody = Buffer.concat(meta);

  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write('UL', 4, 'ascii');
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(metaBody.length, 8);

  element(0x0008, 0x0060, 'CS', 'OT');
  for (const [group, elem, vr, value] of extra) element(group, elem, vr, value);
  element(0x0028, 0x0002, 'US', us(1));                      // samples per pixel
  element(0x0028, 0x0004, 'CS', photometric);
  element(0x0028, 0x0010, 'US', us(height));                 // rows
  element(0x0028, 0x0011, 'US', us(width));                  // columns
  element(0x0028, 0x0100, 'US', us(bits));                   // bits allocated
  element(0x0028, 0x0101, 'US', us(bits));                   // bits stored
  element(0x0028, 0x0103, 'US', us(0));                      // unsigned
  if (windowCenter != null) element(0x0028, 0x1050, 'DS', String(windowCenter));
  if (windowWidth != null) element(0x0028, 0x1051, 'DS', String(windowWidth));
  element(0x7fe0, 0x0010, 'OW', Buffer.from(pixels));

  return new Uint8Array(Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM', 'ascii'),
    groupLength,
    metaBody,
    ...parts,
  ]));
}

/** A 1×1 PNG, for the native-decoder path. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
