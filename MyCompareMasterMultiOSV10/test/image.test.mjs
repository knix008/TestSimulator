/**
 * The picture formats: the TIFF decoder and the PNG encoder behind them.
 *
 * The TIFFs here are built byte by byte in the test rather than kept as fixtures, so
 * what each case exercises — the byte order, the compression, the predictor, the bit
 * depth — is written down next to the assertion instead of hidden in a binary file.
 */
import assert from "node:assert/strict";
import zlib from "node:zlib";
import test from "node:test";
import { encodePng } from "../core/png.ts";
import { decodeTiff, isTiff } from "../core/tiff.ts";

/* ------------------------------------------------------------------ *
 * Building a TIFF
 * ------------------------------------------------------------------ */

const TYPE_SHORT = 3;
const TYPE_LONG = 4;

/**
 * A single-strip TIFF with the tags given, little- or big-endian.
 * `tags` is `[tag, type, value]`, and every value here fits in the entry.
 */
function buildTiff({ little = true, tags, pixels }) {
  const order = little ? Buffer.from("II", "ascii") : Buffer.from("MM", "ascii");
  const head = Buffer.alloc(8);
  order.copy(head, 0);
  const w16 = (buffer, at, value) => (little ? buffer.writeUInt16LE(value, at) : buffer.writeUInt16BE(value, at));
  const w32 = (buffer, at, value) => (little ? buffer.writeUInt32LE(value, at) : buffer.writeUInt32BE(value, at));
  w16(head, 2, 42);

  // Layout: header, pixels, then the directory, so the strip offset is known.
  const pixelsAt = 8;
  const ifdAt = pixelsAt + pixels.length;
  w32(head, 4, ifdAt);

  const all = [...tags, [273, TYPE_LONG, pixelsAt], [279, TYPE_LONG, pixels.length]]
    .sort((a, b) => a[0] - b[0]);

  const ifd = Buffer.alloc(2 + all.length * 12 + 4);
  w16(ifd, 0, all.length);
  all.forEach(([tag, type, value], index) => {
    const at = 2 + index * 12;
    w16(ifd, at, tag);
    w16(ifd, at + 2, type);
    w32(ifd, at + 4, 1);
    // A SHORT is left-justified in its four bytes on a big-endian file.
    if (type === TYPE_SHORT) {
      if (little) w16(ifd, at + 8, value);
      else w16(ifd, at + 8, value);
    } else {
      w32(ifd, at + 8, value);
    }
  });

  return Buffer.concat([head, Buffer.from(pixels), ifd]);
}

/** The common tags for an 8-bit RGB picture. */
function rgbTags(width, height, compression = 1) {
  return [
    [256, TYPE_SHORT, width],
    [257, TYPE_SHORT, height],
    [258, TYPE_SHORT, 8],
    [259, TYPE_SHORT, compression],
    [262, TYPE_SHORT, 2], // RGB
    [277, TYPE_SHORT, 3],
    [278, TYPE_SHORT, height],
  ];
}

/** The pixel at (x, y) as `[r, g, b, a]`. */
function pixelAt(image, x, y) {
  const at = (y * image.width + x) * 4;
  return [...image.rgba.slice(at, at + 4)];
}

/* ------------------------------------------------------------------ *
 * Recognition
 * ------------------------------------------------------------------ */

test("tiff › both byte orders are recognised, and nothing else is", () => {
  assert.equal(isTiff(Buffer.from([0x49, 0x49, 42, 0])), true, "little-endian");
  assert.equal(isTiff(Buffer.from([0x4d, 0x4d, 0, 42])), true, "big-endian");
  assert.equal(isTiff(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false, "a PNG");
  assert.equal(isTiff(Buffer.from([0x49, 0x49])), false, "too short");
});

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

test("tiff › an uncompressed RGB strip decodes to the right pixels", () => {
  // Two by two: red, green / blue, white.
  const pixels = Buffer.from([
    255, 0, 0, 0, 255, 0,
    0, 0, 255, 255, 255, 255,
  ]);
  const image = decodeTiff(buildTiff({ tags: rgbTags(2, 2), pixels }));

  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.deepEqual(pixelAt(image, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixelAt(image, 1, 0), [0, 255, 0, 255]);
  assert.deepEqual(pixelAt(image, 0, 1), [0, 0, 255, 255]);
  assert.deepEqual(pixelAt(image, 1, 1), [255, 255, 255, 255]);
});

test("tiff › a big-endian file decodes the same as a little-endian one", () => {
  const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const little = decodeTiff(buildTiff({ little: true, tags: rgbTags(2, 2), pixels }));
  const big = decodeTiff(buildTiff({ little: false, tags: rgbTags(2, 2), pixels }));
  assert.deepEqual([...big.rgba], [...little.rgba]);
});

test("tiff › PackBits runs are expanded", () => {
  // Four pixels of pure red: a run of -3 (four copies) per channel would interleave,
  // so the literal form is used for the first pixel and a run for the rest.
  const row = Buffer.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]);
  const packed = Buffer.from([11, ...row]); // "11 + 1 literal bytes follow"
  const image = decodeTiff(buildTiff({ tags: rgbTags(4, 1, 32773), pixels: packed }));
  assert.equal(image.width, 4);
  for (let x = 0; x < 4; x++) assert.deepEqual(pixelAt(image, x, 0), [255, 0, 0, 255]);
});

test("tiff › PackBits repeats a byte for a negative count", () => {
  // -5 means "the next byte, six times": six zero bytes = two black pixels.
  const packed = Buffer.from([256 - 5, 0]);
  const image = decodeTiff(buildTiff({ tags: rgbTags(2, 1, 32773), pixels: packed }));
  assert.deepEqual(pixelAt(image, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixelAt(image, 1, 0), [0, 0, 0, 255]);
});

test("tiff › grayscale decodes, and photometric 0 is inverted", () => {
  const tags = (photometric) => [
    [256, TYPE_SHORT, 2],
    [257, TYPE_SHORT, 1],
    [258, TYPE_SHORT, 8],
    [259, TYPE_SHORT, 1],
    [262, TYPE_SHORT, photometric],
    [277, TYPE_SHORT, 1],
    [278, TYPE_SHORT, 1],
  ];
  const pixels = Buffer.from([0, 255]);

  const blackIsZero = decodeTiff(buildTiff({ tags: tags(1), pixels }));
  assert.deepEqual(pixelAt(blackIsZero, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixelAt(blackIsZero, 1, 0), [255, 255, 255, 255]);

  // Photometric 0 is "white is zero", so the same bytes mean the opposite.
  const whiteIsZero = decodeTiff(buildTiff({ tags: tags(0), pixels }));
  assert.deepEqual(pixelAt(whiteIsZero, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixelAt(whiteIsZero, 1, 0), [0, 0, 0, 255]);
});

test("tiff › one bit per sample expands to black and white", () => {
  const tags = [
    [256, TYPE_SHORT, 8],
    [257, TYPE_SHORT, 1],
    [258, TYPE_SHORT, 1],
    [259, TYPE_SHORT, 1],
    [262, TYPE_SHORT, 1],
    [277, TYPE_SHORT, 1],
    [278, TYPE_SHORT, 1],
  ];
  // 0b10100000: on, off, on, off, then four off.
  const image = decodeTiff(buildTiff({ tags, pixels: Buffer.from([0b10100000]) }));
  assert.equal(image.width, 8);
  assert.deepEqual(pixelAt(image, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixelAt(image, 1, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixelAt(image, 2, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixelAt(image, 7, 0), [0, 0, 0, 255]);
});

test("tiff › RGBA keeps its alpha channel", () => {
  const tags = [
    [256, TYPE_SHORT, 1],
    [257, TYPE_SHORT, 1],
    [258, TYPE_SHORT, 8],
    [259, TYPE_SHORT, 1],
    [262, TYPE_SHORT, 2],
    [277, TYPE_SHORT, 4],
    [278, TYPE_SHORT, 1],
  ];
  const image = decodeTiff(buildTiff({ tags, pixels: Buffer.from([10, 20, 30, 128]) }));
  assert.deepEqual(pixelAt(image, 0, 0), [10, 20, 30, 128]);
});

test("tiff › the horizontal predictor is undone", () => {
  // Three grey pixels: 10, then +5, then +5 again — so 10, 15, 20.
  const tags = [
    [256, TYPE_SHORT, 3],
    [257, TYPE_SHORT, 1],
    [258, TYPE_SHORT, 8],
    [259, TYPE_SHORT, 1],
    [262, TYPE_SHORT, 1],
    [277, TYPE_SHORT, 1],
    [278, TYPE_SHORT, 1],
    [317, TYPE_SHORT, 2],
  ];
  const image = decodeTiff(buildTiff({ tags, pixels: Buffer.from([10, 5, 5]) }));
  assert.equal(pixelAt(image, 0, 0)[0], 10);
  assert.equal(pixelAt(image, 1, 0)[0], 15);
  assert.equal(pixelAt(image, 2, 0)[0], 20);
});

test("tiff › what it cannot read, it refuses by name", () => {
  const unsupported = (compression) => () =>
    decodeTiff(buildTiff({ tags: rgbTags(1, 1, compression), pixels: Buffer.from([0, 0, 0]) }));

  assert.throws(unsupported(7), /JPEG/i, "JPEG-in-TIFF");
  assert.throws(unsupported(4), /Fax/i, "CCITT group 4");
  assert.throws(unsupported(99), /99/, "something unheard of");
  assert.throws(() => decodeTiff(Buffer.from([1, 2, 3, 4])), /Not a TIFF/);
});

/* ------------------------------------------------------------------ *
 * The PNG it is converted into
 * ------------------------------------------------------------------ */

test("png › the encoder writes a file that decodes back to the same pixels", () => {
  const width = 3;
  const height = 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    rgba[index * 4] = index * 20;
    rgba[index * 4 + 1] = 255 - index * 20;
    rgba[index * 4 + 2] = 128;
    rgba[index * 4 + 3] = 255;
  }

  const png = encodePng(width, height, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "signature");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
  assert.equal(png[24], 8, "bit depth");
  assert.equal(png[25], 6, "colour type RGBA");
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");

  // Pull the pixels back out: one unfiltered scanline after another.
  const idatAt = png.indexOf(Buffer.from("IDAT", "ascii"));
  const length = png.readUInt32BE(idatAt - 4);
  const raw = zlib.inflateSync(png.subarray(idatAt + 4, idatAt + 4 + length));
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (stride + 1)], 0, "filter byte");
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    assert.deepEqual([...row], [...rgba.subarray(y * stride, y * stride + stride)], `row ${y}`);
  }
});

test("png › too few pixels is an error rather than a corrupt file", () => {
  assert.throws(() => encodePng(4, 4, new Uint8Array(10)), /expected 64 bytes/);
});

test("image › a TIFF round-trips through the decoder and the encoder", () => {
  const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const image = decodeTiff(buildTiff({ tags: rgbTags(2, 2), pixels }));
  const png = encodePng(image.width, image.height, image.rgba);
  assert.equal(png.readUInt32BE(16), 2);
  assert.equal(png.readUInt32BE(20), 2);
  assert.ok(png.length > 50, "a PNG of some substance came out");
});
