/* Tests for src/extra-formats.js (TGA, Netpbm, QOI, PCX, SVG helpers) and its hook in formats.js.
 * No dependencies:  node scripts/test-extra-formats.js   — exits 1 when anything fails. */
"use strict";
const X = require("../src/extra-formats");
const Formats = require("../src/formats");

const colour = process.stdout.isTTY || process.env.FORCE_COLOR ? (code, text) => "\x1b[" + code + "m" + text + "\x1b[0m" : (code, text) => text;
const results = [];
let currentGroup = "";

function group(name) { currentGroup = name; console.log("\n" + colour("1;36", name)); }

async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true });
    console.log("  " + colour("32", "PASS") + " " + name + colour("90", " (" + (Date.now() - started) + " ms)"));
  } catch (error) {
    results.push({ group: currentGroup, name, ok: false, error });
    console.log("  " + colour("31", "FAIL") + " " + name);
    console.log("       " + colour("31", String(error && error.stack ? error.stack.split("\n").slice(0, 3).join("\n       ") : error)));
  }
}

function assert(condition, message) { if (!condition) throw new Error(message || "assertion failed"); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message ? message + ": " : "") + "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
function samePixels(a, b, message, tolerance) {
  equal(a.width, b.width, (message || "") + " width");
  equal(a.height, b.height, (message || "") + " height");
  const n = a.width * a.height * 4;
  const tol = tolerance || 0;
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(a.rgba[i] - b.rgba[i]) > tol) {
      const p = i >> 2;
      throw new Error((message || "pixels") + ": pixel " + (p % a.width) + "," + Math.floor(p / a.width) + " channel " + (i & 3) +
        " is " + a.rgba[i] + ", expected " + b.rgba[i]);
    }
  }
}
function pixel(image, x, y) { const o = (y * image.width + x) * 4; return Array.from(image.rgba.slice(o, o + 4)); }
function samePixel(image, x, y, expected, message) {
  const got = pixel(image, x, y);
  equal(got.join(","), expected.join(","), (message || "pixel") + " at " + x + "," + y);
}
function throwsWith(fn, pattern, message) {
  let error = null;
  try { fn(); } catch (caught) { error = caught; }
  assert(error, (message || "call") + " did not throw");
  assert(error instanceof Error, "threw a non-Error");
  assert(pattern.test(error.message), "error message \"" + error.message + "\" does not match " + pattern);
  return error;
}

/* ── test images ── */

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 24; }; }
function randomImage(width, height, seed, opaque) {
  const next = lcg(seed);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 1) rgba[i] = (i & 3) === 3 && opaque ? 255 : next();
  // a few runs so the RLE paths are exercised as well
  for (let i = 0; i < Math.min(rgba.length, 4 * 40); i += 4) { rgba[i] = 7; rgba[i + 1] = 8; rgba[i + 2] = 9; rgba[i + 3] = opaque ? 255 : 77; }
  return { width, height, rgba };
}
function gradientImage(width, height, alpha) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      rgba[o] = Math.round((x * 255) / Math.max(1, width - 1));
      rgba[o + 1] = Math.round((y * 255) / Math.max(1, height - 1));
      rgba[o + 2] = (x + y) & 255;
      rgba[o + 3] = alpha ? Math.round(((x + y) * 255) / Math.max(1, width + height - 2)) : 255;
    }
  }
  return { width, height, rgba };
}
function composited(image) {
  const rgba = new Uint8ClampedArray(image.rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = image.rgba[i + 3];
    for (let c = 0; c < 3; c += 1) rgba[i + c] = Math.round((image.rgba[i + c] * a + 255 * (255 - a)) / 255);
    rgba[i + 3] = 255;
  }
  return { width: image.width, height: image.height, rgba };
}
const bytes = (...parts) => {
  const list = [];
  parts.forEach((part) => {
    if (typeof part === "string") for (let i = 0; i < part.length; i += 1) list.push(part.charCodeAt(i) & 255);
    else if (Array.isArray(part) || part instanceof Uint8Array) list.push(...part);
    else list.push(part);
  });
  return new Uint8Array(list);
};
const le16 = (v) => [v & 255, (v >> 8) & 255];
const be32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
function tgaHeader({ idLength = 0, mapType = 0, type, mapFirst = 0, mapLength = 0, mapDepth = 0, width, height, depth, descriptor = 0 }) {
  return bytes(idLength, mapType, type, le16(mapFirst), le16(mapLength), mapDepth, le16(0), le16(0), le16(width), le16(height), depth, descriptor);
}
function pcxHeader({ version = 5, encoding = 1, bits, width, height, planes, bpl, paletteInfo = 1, ega }) {
  const h = new Uint8Array(128);
  h[0] = 0x0a; h[1] = version; h[2] = encoding; h[3] = bits;
  h.set(le16(width - 1), 8); h.set(le16(height - 1), 10); h.set(le16(72), 12); h.set(le16(72), 14);
  if (ega) h.set(ega, 16);
  h[65] = planes; h.set(le16(bpl), 66); h.set(le16(paletteInfo), 68);
  return h;
}

const sizes = [[1, 1], [3, 2], [17, 5], [64, 33], [130, 3], [255, 4]];

(async function main() {
  const started = Date.now();

  group("TGA");
  await test("round-trips random and gradient images, RLE and uncompressed", () => {
    sizes.forEach(([w, h], n) => {
      [randomImage(w, h, 11 + n), gradientImage(w, h, true), randomImage(w, h, 5 + n, true)].forEach((image, k) => {
        samePixels(X.decodeTga(X.encodeTga(image)), image, "RLE " + w + "x" + h + " #" + k);
        samePixels(X.decodeTga(X.encodeTga(image, { rle: false })), image, "raw " + w + "x" + h + " #" + k);
      });
    });
  });
  await test("the encoder writes a 32-bit top-left header and the TGA 2.0 footer", () => {
    const out = X.encodeTga(gradientImage(4, 3));
    equal(out[2], 10, "image type"); equal(out[16], 32, "depth"); equal(out[17], 0x28, "descriptor");
    equal(Buffer.from(out.subarray(out.length - 18)).toString("latin1"), "TRUEVISION-XFILE.\0", "footer");
    equal(X.encodeTga(gradientImage(4, 3), { rle: false })[2], 2, "uncompressed type");
    equal(X.magic(out), "tga", "the footer identifies the file");
  });
  await test("uncompressed 24-bit, bottom-left origin", () => {
    // 2 × 2, rows stored bottom first, BGR
    const file = bytes(tgaHeader({ type: 2, width: 2, height: 2, depth: 24 }),
      [0, 0, 255, 0, 255, 0], // bottom row: red, green
      [255, 0, 0, 255, 255, 255]); // top row: blue, white
    const img = X.decodeTga(file);
    samePixel(img, 0, 0, [0, 0, 255, 255]); samePixel(img, 1, 0, [255, 255, 255, 255]);
    samePixel(img, 0, 1, [255, 0, 0, 255]); samePixel(img, 1, 1, [0, 255, 0, 255]);
  });
  await test("right-to-left, top origin", () => {
    const file = bytes(tgaHeader({ type: 2, width: 2, height: 1, depth: 24, descriptor: 0x30 }), [0, 0, 255, 0, 255, 0]);
    const img = X.decodeTga(file);
    samePixel(img, 0, 0, [0, 255, 0, 255]); samePixel(img, 1, 0, [255, 0, 0, 255]);
  });
  await test("RLE 32-bit with a packet that crosses a scanline, an image ID and alpha", () => {
    const file = bytes(tgaHeader({ idLength: 3, type: 10, width: 3, height: 2, depth: 32, descriptor: 0x28 }), "abc",
      0x83, [10, 20, 30, 40], // four of the same pixel: the whole first row and one more
      0x01, [1, 2, 3, 4, 5, 6, 7, 8]); // two raw pixels
    const img = X.decodeTga(file);
    for (let x = 0; x < 3; x += 1) samePixel(img, x, 0, [30, 20, 10, 40]);
    samePixel(img, 0, 1, [30, 20, 10, 40]); samePixel(img, 1, 1, [3, 2, 1, 4]); samePixel(img, 2, 1, [7, 6, 5, 8]);
  });
  await test("32-bit with all-zero alpha bytes is shown opaque", () => {
    const img = X.decodeTga(bytes(tgaHeader({ type: 2, width: 1, height: 1, depth: 32, descriptor: 0x20 }), [1, 2, 3, 0]));
    samePixel(img, 0, 0, [3, 2, 1, 255]);
  });
  await test("8-bit greyscale, uncompressed and RLE", () => {
    const raw = X.decodeTga(bytes(tgaHeader({ type: 3, width: 3, height: 1, depth: 8, descriptor: 0x20 }), [0, 128, 255]));
    samePixel(raw, 1, 0, [128, 128, 128, 255]); samePixel(raw, 2, 0, [255, 255, 255, 255]);
    const rle = X.decodeTga(bytes(tgaHeader({ type: 11, width: 4, height: 1, depth: 8, descriptor: 0x20 }), 0x82, 50, 0x00, 9));
    samePixel(rle, 2, 0, [50, 50, 50, 255]); samePixel(rle, 3, 0, [9, 9, 9, 255]);
  });
  await test("16-bit with an alpha bit and 15-bit truecolor", () => {
    // 0x7c00 = red, 0x8000 = alpha bit; 0x03e0 = green
    const img16 = X.decodeTga(bytes(tgaHeader({ type: 2, width: 2, height: 1, depth: 16, descriptor: 0x21 }), le16(0xfc00), le16(0x03e0)));
    samePixel(img16, 0, 0, [255, 0, 0, 255]); samePixel(img16, 1, 0, [0, 255, 0, 0]);
    const img15 = X.decodeTga(bytes(tgaHeader({ type: 2, width: 2, height: 1, depth: 15, descriptor: 0x20 }), le16(0x001f), le16(0x4210)));
    samePixel(img15, 0, 0, [0, 0, 255, 255]); samePixel(img15, 1, 0, [132, 132, 132, 255]);
  });
  await test("colour-mapped 8-bit with a 24-bit palette starting at index 2, raw and RLE", () => {
    const palette = [[0, 0, 255], [0, 255, 0], [255, 0, 0]]; // BGR → red, green, blue
    const head = (type) => tgaHeader({ mapType: 1, type, mapFirst: 2, mapLength: 3, mapDepth: 24, width: 3, height: 1, depth: 8, descriptor: 0x20 });
    const raw = X.decodeTga(bytes(head(1), ...palette, [2, 3, 4]));
    samePixel(raw, 0, 0, [255, 0, 0, 255]); samePixel(raw, 1, 0, [0, 255, 0, 255]); samePixel(raw, 2, 0, [0, 0, 255, 255]);
    const rle = X.decodeTga(bytes(head(9), ...palette, 0x81, 4, 0x00, 3));
    samePixel(rle, 0, 0, [0, 0, 255, 255]); samePixel(rle, 1, 0, [0, 0, 255, 255]); samePixel(rle, 2, 0, [0, 255, 0, 255]);
  });
  await test("broken TGA files throw clear messages", () => {
    throwsWith(() => X.decodeTga(bytes(1, 2, 3)), /too short to hold a header/);
    throwsWith(() => X.decodeTga(tgaHeader({ type: 7, width: 1, height: 1, depth: 24 })), /unknown image type \(7\)/);
    throwsWith(() => X.decodeTga(tgaHeader({ type: 2, width: 0, height: 1, depth: 24 })), /empty image size/);
    throwsWith(() => X.decodeTga(tgaHeader({ type: 2, width: 1, height: 1, depth: 12 })), /unsupported depth \(12-bit\)/);
    throwsWith(() => X.decodeTga(tgaHeader({ type: 1, width: 1, height: 1, depth: 8 })), /no colour map/);
    const full = X.encodeTga(randomImage(20, 10, 3), { rle: false });
    throwsWith(() => X.decodeTga(full.subarray(0, 100)), /truncated/);
    const rle = X.encodeTga(randomImage(20, 10, 3));
    throwsWith(() => X.decodeTga(rle.subarray(0, 60)), /truncated inside its RLE pixel data/);
    throwsWith(() => X.decodeTga(bytes(tgaHeader({ type: 10, width: 2, height: 1, depth: 8 + 16 }), 0x85, [1, 2, 3])), /runs past the end/);
    throwsWith(() => X.decodeTga(bytes(tgaHeader({ mapType: 1, type: 1, mapLength: 1, mapDepth: 24, width: 1, height: 1, depth: 8 }), [1, 2, 3], 5)), /outside the colour map/);
  });

  group("Netpbm");
  await test("PAM round-trips random and gradient images exactly", () => {
    sizes.forEach(([w, h], n) => {
      [randomImage(w, h, 21 + n), gradientImage(w, h, true)].forEach((image) => samePixels(X.decodeNetpbm(X.encodePam(image)), image, "PAM " + w + "x" + h));
    });
  });
  await test("PPM round-trips with alpha composited on white", () => {
    sizes.forEach(([w, h], n) => {
      const image = randomImage(w, h, 31 + n);
      const back = X.decodeNetpbm(X.encodePpm(image));
      samePixels(back, composited(image), "PPM " + w + "x" + h);
    });
    const header = Buffer.from(X.encodePpm(gradientImage(5, 4))).subarray(0, 11).toString("latin1");
    equal(header, "P6\n5 4\n255\n", "P6 header");
  });
  await test("P1 ASCII bitmap with comments and digits run together", () => {
    const img = X.decodeNetpbm(bytes("P1\n# a comment\n3 2\n010\n1 0 1\n"));
    samePixel(img, 0, 0, [255, 255, 255, 255]); samePixel(img, 1, 0, [0, 0, 0, 255]);
    samePixel(img, 0, 1, [0, 0, 0, 255]); samePixel(img, 1, 1, [255, 255, 255, 255]);
  });
  await test("P2 ASCII greymap with maxval 15", () => {
    const img = X.decodeNetpbm(bytes("P2 2 2 15\n0 15\n# middle\n5 10\n"));
    samePixel(img, 0, 0, [0, 0, 0, 255]); samePixel(img, 1, 0, [255, 255, 255, 255]);
    samePixel(img, 0, 1, [85, 85, 85, 255]); samePixel(img, 1, 1, [170, 170, 170, 255]);
  });
  await test("P3 ASCII pixmap", () => {
    const img = X.decodeNetpbm(bytes("P3\n2 1\n255\n255 0 0   0 0 255\n"));
    samePixel(img, 0, 0, [255, 0, 0, 255]); samePixel(img, 1, 0, [0, 0, 255, 255]);
  });
  await test("P4 binary bitmap with row padding", () => {
    // 10 pixels wide → 2 bytes per row: 1010000011 → bytes 0xA0 0xC0
    const img = X.decodeNetpbm(bytes("P4\n10 1\n", 0xa0, 0xc0));
    const row = [];
    for (let x = 0; x < 10; x += 1) row.push(pixel(img, x, 0)[0] === 0 ? 1 : 0);
    equal(row.join(""), "1010000011", "bits");
  });
  await test("P5 binary greymap, 8-bit and 16-bit maxval", () => {
    const img8 = X.decodeNetpbm(bytes("P5\n2 1\n255\n", 7, 200));
    samePixel(img8, 0, 0, [7, 7, 7, 255]); samePixel(img8, 1, 0, [200, 200, 200, 255]);
    const img16 = X.decodeNetpbm(bytes("P5\n3 1\n65535\n", 0xff, 0xff, 0x80, 0x00, 0x00, 0x00));
    samePixel(img16, 0, 0, [255, 255, 255, 255]); samePixel(img16, 1, 0, [128, 128, 128, 255]); samePixel(img16, 2, 0, [0, 0, 0, 255]);
    const img1000 = X.decodeNetpbm(bytes("P5 1 1 1000\n", 0x01, 0xf4));
    samePixel(img1000, 0, 0, [128, 128, 128, 255], "maxval 1000, value 500");
  });
  await test("P6 binary pixmap, 8-bit and 16-bit", () => {
    const img = X.decodeNetpbm(bytes("P6\n1 1\n255\n", 1, 2, 3));
    samePixel(img, 0, 0, [1, 2, 3, 255]);
    const img16 = X.decodeNetpbm(bytes("P6\n1 1\n4095\n", 0x0f, 0xff, 0x08, 0x00, 0x00, 0x00));
    samePixel(img16, 0, 0, [255, 128, 0, 255]);
  });
  await test("P7 PAM in each tuple type", () => {
    const head = (depth, tuple, maxval) => "P7\nWIDTH 2\nHEIGHT 1\nDEPTH " + depth + "\nMAXVAL " + (maxval || 255) + "\n# comment\nTUPLTYPE " + tuple + "\nENDHDR\n";
    const grey = X.decodeNetpbm(bytes(head(1, "GRAYSCALE"), 0, 99));
    samePixel(grey, 1, 0, [99, 99, 99, 255]); equal(grey.tuple, "GRAYSCALE");
    const rgb = X.decodeNetpbm(bytes(head(3, "RGB"), 1, 2, 3, 4, 5, 6));
    samePixel(rgb, 1, 0, [4, 5, 6, 255]);
    const rgba = X.decodeNetpbm(bytes(head(4, "RGB_ALPHA"), 1, 2, 3, 4, 5, 6, 7, 8));
    samePixel(rgba, 0, 0, [1, 2, 3, 4]); samePixel(rgba, 1, 0, [5, 6, 7, 8]);
    const ga = X.decodeNetpbm(bytes(head(2, "GRAYSCALE_ALPHA"), 10, 20, 30, 40));
    samePixel(ga, 0, 0, [10, 10, 10, 20]); samePixel(ga, 1, 0, [30, 30, 30, 40]);
    const bw = X.decodeNetpbm(bytes(head(1, "BLACKANDWHITE", 1), 0, 1));
    samePixel(bw, 0, 0, [0, 0, 0, 255]); samePixel(bw, 1, 0, [255, 255, 255, 255]);
    const wide = X.decodeNetpbm(bytes(head(4, "RGB_ALPHA", 65535), 0xff, 0xff, 0, 0, 0x80, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0));
    samePixel(wide, 0, 0, [255, 0, 128, 255]);
  });
  await test("broken Netpbm files throw clear messages", () => {
    throwsWith(() => X.decodeNetpbm(bytes("Q6 1 1 255 ")), /not a Netpbm file/);
    throwsWith(() => X.decodeNetpbm(bytes("P6\n1")), /PPM file is truncated/);
    throwsWith(() => X.decodeNetpbm(bytes("P6\nx 1 255\n")), /bad width/);
    throwsWith(() => X.decodeNetpbm(bytes("P6\n4 4\n255\n", 1, 2, 3)), /PPM file is truncated/);
    throwsWith(() => X.decodeNetpbm(bytes("P5\n1 1\n0\n", 0)), /maximum value out of range/);
    throwsWith(() => X.decodeNetpbm(bytes("P3\n1 1\n255\n1 2 x\n")), /not a number/);
    throwsWith(() => X.decodeNetpbm(bytes("P1\n2 1\n0 2\n")), /other than 0 or 1/);
    throwsWith(() => X.decodeNetpbm(bytes("P7\nWIDTH 1\nHEIGHT 1\nDEPTH 3\nMAXVAL 255\nTUPLTYPE RGB\n")), /no ENDHDR/);
    throwsWith(() => X.decodeNetpbm(bytes("P7\nWIDTH 1\nDEPTH 3\nMAXVAL 255\nENDHDR\n", 1, 2, 3)), /no HEIGHT line/);
    throwsWith(() => X.decodeNetpbm(bytes("P7\nWIDTH 1\nHEIGHT 1\nDEPTH 3\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n", 1, 2, 3)), /needs depth 4, not 3/);
    const pam = X.encodePam(randomImage(9, 9, 2));
    throwsWith(() => X.decodeNetpbm(pam.subarray(0, pam.length - 1)), /PAM file is truncated/);
  });

  group("QOI");
  const QOI_STREAM = [0xfe, 10, 20, 30, 0x5b, 0xa5, 0x6b, 0xff, 1, 2, 3, 128, 0x09, 0xc1, 0x40];
  const QOI_PIXELS = [[10, 20, 30, 255], [9, 20, 31, 255], [12, 25, 39, 255], [1, 2, 3, 128], [10, 20, 30, 255], [10, 20, 30, 255], [10, 20, 30, 255], [8, 18, 28, 255]];
  const qoiFile = (w, h, channels, body) => bytes("qoif", be32(w), be32(h), channels, 0, body, [0, 0, 0, 0, 0, 0, 0, 1]);
  await test("decodes every chunk type from the specification (RGB, DIFF, LUMA, RGBA, INDEX, RUN)", () => {
    const img = X.decodeQoi(qoiFile(8, 1, 4, QOI_STREAM));
    QOI_PIXELS.forEach((px, x) => samePixel(img, x, 0, px, "chunk " + x));
    equal(img.channels, 4); equal(img.colorspace, 0);
  });
  await test("encodes the same pixels to exactly the same chunks", () => {
    const rgba = new Uint8ClampedArray(QOI_PIXELS.flat());
    const out = X.encodeQoi({ width: 8, height: 1, rgba });
    equal(Array.from(out).join(","), Array.from(qoiFile(8, 1, 4, QOI_STREAM)).join(","), "encoded bytes");
  });
  await test("DIFF and LUMA wrap around 0 and 255", () => {
    // from (0,0,0,255): DIFF -1,-1,-1 → 255,255,255; then LUMA +1 with dr-dg 0, db-dg 0 → 0,0,0
    const img = X.decodeQoi(qoiFile(2, 1, 3, [0x40 | (1 << 4) | (1 << 2) | 1, 0x80 | 33, 0x88]));
    samePixel(img, 0, 0, [255, 255, 255, 255]); samePixel(img, 1, 0, [0, 0, 0, 255]);
    const encoded = X.encodeQoi({ width: 2, height: 1, rgba: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]) });
    equal(Array.from(encoded.subarray(14, encoded.length - 8)).join(","), "85,127", "wrap-around chunks: DIFF -1 then DIFF +1");
  });
  await test("a run longer than 62 pixels is split, the first pixel equal to the start value is a run", () => {
    const rgba = new Uint8ClampedArray(100 * 4);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255; // all (0,0,0,255) — the decoder's start pixel
    const out = X.encodeQoi({ width: 100, height: 1, rgba });
    equal(Array.from(out.subarray(14, out.length - 8)).join(","), [0xc0 | 61, 0xc0 | 37].join(","), "runs");
    samePixels(X.decodeQoi(out), { width: 100, height: 1, rgba }, "run");
  });
  await test("round-trips random and gradient images exactly; channels 3 when opaque", () => {
    sizes.forEach(([w, h], n) => {
      const alpha = randomImage(w, h, 41 + n);
      const opaque = gradientImage(w, h, false);
      const a = X.encodeQoi(alpha);
      const o = X.encodeQoi(opaque);
      samePixels(X.decodeQoi(a), alpha, "QOI " + w + "x" + h);
      samePixels(X.decodeQoi(o), opaque, "QOI opaque " + w + "x" + h);
      if (w * h > 40) equal(a[12], 4, "channels with alpha");
      equal(o[12], 3, "channels when opaque");
    });
  });
  await test("broken QOI files throw clear messages", () => {
    throwsWith(() => X.decodeQoi(bytes("qoif")), /too short/);
    throwsWith(() => X.decodeQoi(bytes("qoix", be32(1), be32(1), 4, 0)), /does not start with "qoif"/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(1), be32(1), 5, 0)), /bad channel count \(5\)/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(1), be32(1), 4, 3)), /bad colour space/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(0), be32(1), 4, 0)), /empty image size/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(4), be32(1), 4, 0, 0xfe, 1, 2, 3)), /truncated: it ends before every pixel/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(1), be32(1), 4, 0, 0xff, 1, 2)), /truncated inside an RGBA chunk/);
    throwsWith(() => X.decodeQoi(bytes("qoif", be32(1), be32(1), 4, 0, 0xa5)), /truncated inside a LUMA chunk/);
  });

  group("PCX");
  await test("round-trips random and gradient images (24-bit, alpha composited on white)", () => {
    sizes.forEach(([w, h], n) => {
      [randomImage(w, h, 51 + n), gradientImage(w, h, true), randomImage(w, h, 61 + n, true)].forEach((image, k) => {
        samePixels(X.decodePcx(X.encodePcx(image)), composited(image), "PCX " + w + "x" + h + " #" + k);
      });
    });
  });
  await test("the encoder writes a version 5, 3-plane, even-width header and escapes bytes ≥ 0xC0", () => {
    const out = X.encodePcx({ width: 3, height: 1, rgba: new Uint8ClampedArray([200, 0, 0, 255, 1, 0, 0, 255, 1, 0, 0, 255]) });
    equal(out[1], 5, "version"); equal(out[3], 8, "bits"); equal(out[65], 3, "planes"); equal(out[66] | (out[67] << 8), 4, "bytes per line");
    // the line is red 200 1 1 0(pad), then 8 zeros of green and blue: C1 C8, C2 01, C9 00
    equal(Array.from(out.subarray(128, 134)).join(","), [0xc1, 200, 0xc2, 1, 0xc9, 0].join(","), "scanline RLE");
  });
  await test("1-bit monochrome", () => {
    // 10 wide → 2 bytes per line: 1100000001 → 0xC0 0x40, written with RLE escapes
    const file = bytes(pcxHeader({ bits: 1, width: 10, height: 1, planes: 1, bpl: 2 }), 0xc1, 0xc0, 0x40);
    const img = X.decodePcx(file);
    const row = [];
    for (let x = 0; x < 10; x += 1) row.push(pixel(img, x, 0)[0] ? 1 : 0);
    equal(row.join(""), "1100000001", "bits");
  });
  await test("8-bit with a 256-colour palette at the end, RLE runs", () => {
    const palette = new Uint8Array(768);
    palette.set([255, 0, 0], 3); palette.set([0, 0, 255], 6);
    const file = bytes(pcxHeader({ bits: 8, width: 4, height: 2, planes: 1, bpl: 4 }),
      0xc3, 1, 2, // 1 1 1 2
      0xc4, 0, // 0 0 0 0
      0x0c, palette);
    const img = X.decodePcx(file);
    samePixel(img, 0, 0, [255, 0, 0, 255]); samePixel(img, 3, 0, [0, 0, 255, 255]); samePixel(img, 2, 1, [0, 0, 0, 255]);
    equal(X.magic(file), "pcx", "magic");
  });
  await test("8-bit greyscale without a palette (palette info 2)", () => {
    const img = X.decodePcx(bytes(pcxHeader({ bits: 8, width: 2, height: 1, planes: 1, bpl: 2, paletteInfo: 2 }), 5, 0xc1, 0xd0));
    samePixel(img, 0, 0, [5, 5, 5, 255]); samePixel(img, 1, 0, [208, 208, 208, 255]);
  });
  await test("24-bit, 3 planes, hand built", () => {
    const file = bytes(pcxHeader({ bits: 8, width: 2, height: 1, planes: 3, bpl: 2 }), 10, 11, 20, 21, 30, 0xc1, 0xff);
    const img = X.decodePcx(file);
    samePixel(img, 0, 0, [10, 20, 30, 255]); samePixel(img, 1, 0, [11, 21, 255, 255]);
  });
  await test("4-bit EGA (1 bit, 4 planes) with the header palette, uncompressed", () => {
    const ega = new Uint8Array(48); ega.set([0, 0, 0], 0); ega.set([9, 8, 7], 15 * 3); ega.set([1, 2, 3], 5 * 3);
    // pixel 0 = index 15 (all planes set), pixel 1 = index 5 (planes 0 and 2)
    const file = bytes(pcxHeader({ encoding: 0, bits: 1, width: 2, height: 1, planes: 4, bpl: 2, ega }), 0xc0, 0, 0x80, 0, 0xc0, 0, 0x80, 0);
    const img = X.decodePcx(file);
    samePixel(img, 0, 0, [9, 8, 7, 255]); samePixel(img, 1, 0, [1, 2, 3, 255]);
  });
  await test("broken PCX files throw clear messages", () => {
    throwsWith(() => X.decodePcx(bytes(0x0a, 5, 1, 8)), /too short to hold a header/);
    const head = pcxHeader({ bits: 8, width: 4, height: 4, planes: 3, bpl: 4 });
    const bad = head.slice(); bad[0] = 0x0b;
    throwsWith(() => X.decodePcx(bad), /first byte is not 0x0A/);
    const version = head.slice(); version[1] = 9;
    throwsWith(() => X.decodePcx(version), /unknown version \(9\)/);
    throwsWith(() => X.decodePcx(pcxHeader({ bits: 4, width: 4, height: 4, planes: 3, bpl: 4 })), /unsupported layout \(4-bit, 3 planes\)/);
    throwsWith(() => X.decodePcx(pcxHeader({ bits: 8, width: 8, height: 1, planes: 3, bpl: 4 })), /too few for 8 pixels/);
    throwsWith(() => X.decodePcx(bytes(pcxHeader({ bits: 8, width: 2, height: 1, planes: 1, bpl: 2, paletteInfo: 1 }), 1, 2)), /no palette at its end/);
    const full = X.encodePcx(randomImage(30, 20, 9));
    throwsWith(() => X.decodePcx(full.subarray(0, 300)), /truncated inside its RLE pixel data/);
    throwsWith(() => X.decodePcx(bytes(pcxHeader({ encoding: 0, bits: 8, width: 4, height: 4, planes: 3, bpl: 4 }), 1, 2, 3)), /truncated: it holds fewer pixels/);
  });

  group("Truncation");
  await test("every cut-short file throws an Error naming the format, never anything else", () => {
    const image = randomImage(9, 5, 99);
    const cases = [
      ["TGA", X.decodeTga, X.encodeTga(image), 26 /* footer */],
      ["TGA", X.decodeTga, X.encodeTga(image, { rle: false }), 26],
      ["PPM|Netpbm", X.decodeNetpbm, X.encodePpm(image), 0],
      ["PAM|Netpbm", X.decodeNetpbm, X.encodePam(image), 0],
      ["QOI", X.decodeQoi, X.encodeQoi(image), 8 /* end marker */],
      ["PCX", X.decodePcx, X.encodePcx(image), 0],
    ];
    cases.forEach(([name, decode, file, tail]) => {
      const pattern = new RegExp(name);
      for (let cut = 0; cut < file.length - tail; cut += 1) {
        let error = null;
        try { decode(file.subarray(0, cut)); } catch (caught) { error = caught; }
        assert(error instanceof Error, name + " cut at " + cut + " of " + file.length + " did not throw an Error");
        assert(pattern.test(error.message), name + " cut at " + cut + ": \"" + error.message + "\"");
      }
    });
  });

  group("SVG helpers");
  await test("recognises SVG text after a BOM, whitespace, prolog, comments and doctype", () => {
    assert(X.isSvg(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>")), "plain");
    assert(X.isSvg(bytes(0xef, 0xbb, 0xbf, "  \n<?xml version=\"1.0\"?>\n<!-- made by hand -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"x.dtd\">\n<svg width=\"10\">")), "prolog");
    assert(X.isSvg(bytes("<!DOCTYPE svg [ <!ENTITY a \"b\"> ]><svg>")), "internal subset");
    assert(!X.isSvg(bytes("<?xml version=\"1.0\"?><html></html>")), "xml but not svg");
    assert(!X.isSvg(bytes("<svgx>")), "svgx");
    assert(!X.isSvg(bytes("hello <svg>")), "text first");
    equal(X.magic(bytes("<?xml version=\"1.0\"?><svg/>")), "svg");
  });
  await test("works out the drawing size", () => {
    const size = (text) => { const s = X.svgSize(text); return s.width + "x" + s.height; };
    equal(size("<svg width=\"120\" height=\"80\" viewBox=\"0 0 10 10\">"), "120x80", "width/height win");
    equal(size("<svg width='2in' height='1cm'>"), "192x38", "units");
    equal(size("<svg viewBox=\"0 0 640 480\">"), "640x480", "viewBox");
    equal(size("<svg viewBox=\"0,0,50,25\" width=\"100\">"), "100x50", "width and viewBox ratio");
    equal(size("<svg width=\"100%\" height=\"100%\">"), "300x150", "percentages fall back");
    equal(size("<svg>"), "300x150", "default");
    equal(size("<svg width=\"20000\" height=\"10000\">"), "8192x4096", "capped at 8192");
    equal(size("<!-- <svg width=\"1\" height=\"1\"> --><svg width=\"7\" height=\"9\">"), "7x9", "commented svg ignored");
  });
  await test("wraps a PNG in an SVG of the same size", () => {
    const text = Buffer.from(X.svgWrapPng(5, 4, new Uint8Array([1, 2, 3]))).toString("utf8");
    assert(/<svg[^>]*width="5" height="4"/.test(text), text);
    assert(text.indexOf("data:image/png;base64,AQID") > 0, text);
    assert(X.isSvg(Buffer.from(text)), "is SVG");
  });

  group("formats.js hook");
  await test("extensions, kinds and the save list", () => {
    ["tga", "icb", "vda", "vst", "pbm", "pgm", "ppm", "pnm", "pam", "qoi", "pcx"].forEach((ext) => {
      equal(Formats.kindOf("a." + ext), "extra", ext);
      assert(Formats.isSupported("a." + ext), ext + " supported");
      assert(Formats.EXTRA.has(ext), ext + " in EXTRA");
      assert(Formats.listExtensions().indexOf(ext) >= 0, ext + " listed");
    });
    equal(Formats.kindOf("a.svg"), "svg"); assert(Formats.SVG.has("svg")); assert(Formats.ALL.has("svg"));
    assert(!Formats.isSupported("a.svgz"), "svgz is not claimed");
    equal(Formats.kindOf("noext", X.encodeQoi(gradientImage(4, 4))), "extra", "QOI magic");
    equal(Formats.kindOf("noext", bytes("P5 1 1 255\n", 0)), "extra", "short Netpbm magic");
    equal(Formats.kindOf("noext", X.encodePcx(gradientImage(4, 4))), "extra", "PCX magic");
    equal(Formats.kindOf("noext", X.encodeTga(gradientImage(4, 4))), "extra", "TGA footer magic");
    equal(Formats.kindOf("noext", bytes("\n<?xml version=\"1.0\"?>\n<svg/>")), "svg", "SVG magic");
    equal(Formats.kindOf("noext", Formats.Extra.svgWrapPng(1, 1, [0])), "svg", "SVG magic");
    const ids = Formats.SAVE_FORMATS.map((item) => item.id).join(",");
    equal(ids, "png,jpeg,webp,bmp,tiff,gif,ico,jp2,j2k,dicom,tga,ppm,pam,qoi,pcx,avif,svg", "SAVE_FORMATS");
    equal(Formats.SAVE_FORMATS.filter((item) => item.lossy).map((item) => item.id).join(","), "jpeg,webp,jp2,j2k,avif", "lossy");
    equal(Formats.SAVE_FORMATS.filter((item) => item.vector).map((item) => item.id).join(","), "svg", "vector");
  });
  await test("Formats.encode and Formats.decode round-trip every pure format", async () => {
    const image = randomImage(23, 7, 77);
    for (const [id, name, expect] of [["tga", "x.tga", image], ["pam", "x.pam", image], ["qoi", "x.qoi", image],
      ["ppm", "x.ppm", composited(image)], ["pcx", "x.pcx", composited(image)]]) {
      const out = await Formats.encode(id, image);
      equal(out.ext, id, id + " ext");
      const back = await Formats.decode(out.bytes, name);
      equal(back.kind, "extra", id + " kind");
      samePixels(back, expect, id + " through Formats");
      const sniffed = await Formats.decode(out.bytes, "no-extension");
      samePixels(sniffed, expect, id + " found by its bytes");
    }
  });
  await test("Formats.encode('svg') keeps svgText or wraps the picture as a PNG", async () => {
    const source = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"><rect width=\"4\" height=\"4\" fill=\"#c00\"/>é</svg>";
    const kept = await Formats.encode("svg", gradientImage(4, 4), { svgText: source });
    equal(Buffer.from(kept.bytes).toString("utf8"), source, "svgText kept as UTF-8");
    equal(kept.mime, "image/svg+xml");
    const wrapped = await Formats.encode("svg", gradientImage(6, 3));
    const text = Buffer.from(wrapped.bytes).toString("utf8");
    assert(/width="6" height="3"/.test(text) && text.indexOf("data:image/png;base64,iVBOR") > 0, text.slice(0, 200));
  });
  await test("Formats.decode passes the reader's error through", async () => {
    let error = null;
    try { await Formats.decode(bytes("qoif", be32(2), be32(2), 4, 0, 0xfe), "broken.qoi"); } catch (caught) { error = caught; }
    assert(error && /QOI file is truncated/.test(error.message), String(error && error.message));
  });

  /* ── summary ── */
  const failed = results.filter((item) => !item.ok);
  const groups = [];
  results.forEach((item) => { if (groups.indexOf(item.group) < 0) groups.push(item.group); });
  console.log("\n" + colour("1", "Summary"));
  groups.forEach((name) => {
    const list = results.filter((item) => item.group === name);
    const bad = list.filter((item) => !item.ok).length;
    console.log("  " + (bad ? colour("31", "FAIL") : colour("32", "PASS")) + " " + name.padEnd(18) + (list.length - bad) + "/" + list.length);
  });
  const line = results.length - failed.length + "/" + results.length + " passed in " + (Date.now() - started) + " ms";
  console.log("\n" + (failed.length ? colour("1;31", "FAILED  " + line) : colour("1;32", "ALL PASSED  " + line)));
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
