/**
 * A PNG encoder, in plain Node.
 *
 * The browser can display PNG, JPEG, GIF, WEBP, BMP, ICO and AVIF but nothing else,
 * so anything else a picture comparison is handed — a TIFF, say — has to be turned
 * into one of those before it can be shown. PNG is the one to pick: lossless, so the
 * difference map still means something, and alpha-capable, so a transparent original
 * stays transparent.
 *
 * No filtering and no palette: this encodes what it is given as straight RGBA, which
 * is a little larger on disk and a great deal simpler to be sure of. The images
 * being converted are being looked at once, not stored.
 */
import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Encodes `width * height * 4` bytes of RGBA as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const expected = width * height * 4;
  if (rgba.length < expected) {
    throw new Error(`PNG: expected ${expected} bytes of pixels, got ${rgba.length}`);
  }

  // Each scanline is prefixed with its filter byte; zero means "no filter".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const from = y * stride;
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + from, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlacing

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([head, tagged, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
