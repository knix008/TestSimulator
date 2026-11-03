/* Writes small pictures in every format extra-formats.js reads into samples/formats/, so each
 * variant can be opened in MyPaint by hand:   node scripts/make-format-samples.js
 * Every file is decoded again before it is written, so a broken sample never lands on disk. */
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("../src/extra-formats");
const Encoders = require("../src/encoders");

const out = path.join(__dirname, "..", "samples", "formats");
fs.mkdirSync(out, { recursive: true });

const W = 96;
const H = 64;

/* A sky gradient, a sun, a hill and a half-transparent band — every format shows something. */
function scene(alpha) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      let r = 40 + Math.round((y * 120) / H);
      let g = 110 + Math.round((y * 90) / H);
      let b = 230 - Math.round((y * 60) / H);
      let a = 255;
      if ((x - 70) ** 2 + (y - 16) ** 2 < 100) { r = 255; g = 210; b = 40; }
      if (y > 44 + 8 * Math.sin(x / 12)) { r = 50; g = 150 - (y - 44) * 2; b = 60; }
      if (alpha && x >= 8 && x < 40 && y >= 8 && y < 30) { r = 220; g = 30; b = 90; a = 40 + Math.round(((x - 8) * 215) / 31); }
      if (alpha && x < 4) a = 0;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return { width: W, height: H, rgba };
}

const grey = (image, x, y) => {
  const o = (y * image.width + x) * 4;
  return Math.round(0.299 * image.rgba[o] + 0.587 * image.rgba[o + 1] + 0.114 * image.rgba[o + 2]);
};
const ascii = (text) => Buffer.from(text, "latin1");
const le16 = (v) => [v & 255, (v >> 8) & 255];

const opaque = scene(false);
const withAlpha = scene(true);
const written = [];

function save(name, bytes, decode, note) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const back = decode(data);
  if (back.width !== W || back.height !== H) throw new Error(name + " decoded as " + back.width + "x" + back.height);
  fs.writeFileSync(path.join(out, name), data);
  written.push([name, data.length, note]);
}

/* ── TGA ── */
save("scene-rle-32bit.tga", X.encodeTga(withAlpha), X.decodeTga, "32-bit RLE, top-left, alpha");
save("scene-raw-32bit.tga", X.encodeTga(withAlpha, { rle: false }), X.decodeTga, "32-bit uncompressed");
{
  // 24-bit, bottom-left origin (the classic default)
  const head = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le16(W), ...le16(H), 24, 0];
  const body = [];
  for (let y = H - 1; y >= 0; y -= 1) for (let x = 0; x < W; x += 1) { const o = (y * W + x) * 4; body.push(opaque.rgba[o + 2], opaque.rgba[o + 1], opaque.rgba[o]); }
  save("scene-24bit-bottom-left.tga", [...head, ...body], X.decodeTga, "24-bit uncompressed, bottom-left");
}
{
  // 16-bit A1R5G5B5 with the alpha bit
  const head = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le16(W), ...le16(H), 16, 0x21];
  const body = [];
  for (let p = 0; p < W * H; p += 1) {
    const o = p * 4;
    const v = (withAlpha.rgba[o + 3] >= 128 ? 0x8000 : 0) | ((withAlpha.rgba[o] >> 3) << 10) | ((withAlpha.rgba[o + 1] >> 3) << 5) | (withAlpha.rgba[o + 2] >> 3);
    body.push(...le16(v));
  }
  save("scene-16bit.tga", [...head, ...body], X.decodeTga, "16-bit A1R5G5B5, top-left");
}
{
  // 8-bit greyscale, RLE
  const head = [0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le16(W), ...le16(H), 8, 0x20];
  const body = [];
  for (let y = 0; y < H; y += 1) {
    let x = 0;
    while (x < W) {
      const v = grey(opaque, x, y);
      let run = 1;
      while (x + run < W && run < 128 && grey(opaque, x + run, y) === v) run += 1;
      body.push(0x80 | (run - 1), v);
      x += run;
    }
  }
  save("scene-grey-rle.tga", [...head, ...body], X.decodeTga, "8-bit greyscale RLE");
}
{
  // colour-mapped 8-bit with a 24-bit palette, via the GIF quantiser
  const q = Encoders.quantize(opaque.rgba, 256);
  const count = q.palette.length / 3;
  const head = [0, 1, 1, 0, 0, ...le16(count), 24, 0, 0, 0, 0, ...le16(W), ...le16(H), 8, 0x20];
  const palette = [];
  for (let i = 0; i < count; i += 1) palette.push(q.palette[i * 3 + 2], q.palette[i * 3 + 1], q.palette[i * 3]);
  save("scene-colour-mapped.tga", [...head, ...palette, ...q.indices], X.decodeTga, "8-bit colour-mapped, " + count + " colours");
}

/* ── Netpbm ── */
{
  const bits = [];
  for (let y = 0; y < H; y += 1) bits.push(Array.from({ length: W }, (_, x) => (grey(opaque, x, y) < 128 ? 1 : 0)));
  save("scene-ascii.pbm", ascii("P1\n# MyPaint sample, ASCII bitmap\n" + W + " " + H + "\n" + bits.map((row) => row.join("")).join("\n") + "\n"), X.decodeNetpbm, "P1 ASCII bitmap");
  const rowBytes = (W + 7) >> 3;
  const packed = Buffer.alloc(rowBytes * H);
  bits.forEach((row, y) => row.forEach((bit, x) => { if (bit) packed[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7); }));
  save("scene-binary.pbm", Buffer.concat([ascii("P4\n" + W + " " + H + "\n"), packed]), X.decodeNetpbm, "P4 binary bitmap");
  const greys = [];
  for (let y = 0; y < H; y += 1) greys.push(Array.from({ length: W }, (_, x) => Math.round((grey(opaque, x, y) * 15) / 255)).join(" "));
  save("scene-ascii.pgm", ascii("P2\n" + W + " " + H + "\n15\n" + greys.join("\n") + "\n"), X.decodeNetpbm, "P2 ASCII greymap, maxval 15");
  const wide = Buffer.alloc(W * H * 2);
  for (let p = 0; p < W * H; p += 1) wide.writeUInt16BE(grey(opaque, p % W, Math.floor(p / W)) * 257, p * 2);
  save("scene-16bit.pgm", Buffer.concat([ascii("P5\n" + W + " " + H + "\n65535\n"), wide]), X.decodeNetpbm, "P5 binary greymap, 16-bit");
  const rows = [];
  for (let y = 0; y < H; y += 1) {
    const row = [];
    for (let x = 0; x < W; x += 1) { const o = (y * W + x) * 4; row.push(opaque.rgba[o], opaque.rgba[o + 1], opaque.rgba[o + 2]); }
    rows.push(row.join(" "));
  }
  save("scene-ascii.ppm", ascii("P3\n" + W + " " + H + "\n255\n" + rows.join("\n") + "\n"), X.decodeNetpbm, "P3 ASCII pixmap");
  save("scene.ppm", X.encodePpm(withAlpha), X.decodeNetpbm, "P6 binary pixmap (alpha on white)");
  save("scene.pnm", X.encodePpm(opaque), X.decodeNetpbm, "P6 under the .pnm extension");
  save("scene-rgba.pam", X.encodePam(withAlpha), X.decodeNetpbm, "P7 RGB_ALPHA");
  const ga = Buffer.alloc(W * H * 2);
  for (let p = 0; p < W * H; p += 1) { ga[p * 2] = grey(withAlpha, p % W, Math.floor(p / W)); ga[p * 2 + 1] = withAlpha.rgba[p * 4 + 3]; }
  save("scene-grey-alpha.pam", Buffer.concat([ascii("P7\nWIDTH " + W + "\nHEIGHT " + H + "\nDEPTH 2\nMAXVAL 255\nTUPLTYPE GRAYSCALE_ALPHA\nENDHDR\n"), ga]), X.decodeNetpbm, "P7 GRAYSCALE_ALPHA");
}

/* ── QOI ── */
save("scene-rgba.qoi", X.encodeQoi(withAlpha), X.decodeQoi, "QOI, 4 channels");
save("scene-rgb.qoi", X.encodeQoi(opaque), X.decodeQoi, "QOI, 3 channels");

/* ── PCX ── */
save("scene-24bit.pcx", X.encodePcx(withAlpha), X.decodePcx, "24-bit, 3 planes, RLE");
{
  const q = Encoders.quantize(opaque.rgba, 256);
  const head = Buffer.alloc(128);
  head[0] = 0x0a; head[1] = 5; head[2] = 1; head[3] = 8;
  head.writeUInt16LE(W - 1, 8); head.writeUInt16LE(H - 1, 10); head.writeUInt16LE(72, 12); head.writeUInt16LE(72, 14);
  head[65] = 1; head.writeUInt16LE(W, 66); head.writeUInt16LE(1, 68);
  const body = [];
  for (let y = 0; y < H; y += 1) {
    let x = 0;
    while (x < W) {
      const v = q.indices[y * W + x];
      let run = 1;
      while (x + run < W && run < 63 && q.indices[y * W + x + run] === v) run += 1;
      if (run > 1 || v >= 0xc0) body.push(0xc0 | run);
      body.push(v);
      x += run;
    }
  }
  const palette = Buffer.alloc(768);
  Buffer.from(q.palette).copy(palette);
  save("scene-8bit.pcx", Buffer.concat([head, Buffer.from(body), Buffer.from([0x0c]), palette]), X.decodePcx, "8-bit, 256-colour palette, RLE");
  const mono = Buffer.alloc(128);
  head.copy(mono);
  mono[3] = 1; mono.writeUInt16LE(W >> 3, 66);
  const lines = [];
  for (let y = 0; y < H; y += 1) {
    for (let bx = 0; bx < W >> 3; bx += 1) {
      let v = 0;
      for (let k = 0; k < 8; k += 1) if (grey(opaque, bx * 8 + k, y) >= 128) v |= 0x80 >> k;
      if (v >= 0xc0) lines.push(0xc1);
      lines.push(v);
    }
  }
  save("scene-mono.pcx", Buffer.concat([mono, Buffer.from(lines)]), X.decodePcx, "1-bit monochrome");
}

/* ── SVG ── */
{
  const svg = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- MyPaint sample drawing -->\n" +
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + W * 2 + "\" height=\"" + H * 2 + "\" viewBox=\"0 0 " + W + " " + H + "\">\n" +
    "  <defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#286ee6\"/><stop offset=\"1\" stop-color=\"#a0c8aa\"/></linearGradient></defs>\n" +
    "  <rect width=\"" + W + "\" height=\"" + H + "\" fill=\"url(#sky)\"/>\n" +
    "  <circle cx=\"70\" cy=\"16\" r=\"10\" fill=\"#ffd228\"/>\n" +
    "  <path d=\"M0 46 Q 24 34 48 46 T 96 46 V 64 H 0 Z\" fill=\"#329640\"/>\n" +
    "  <rect x=\"8\" y=\"8\" width=\"32\" height=\"22\" fill=\"#dc1e5a\" fill-opacity=\"0.5\"/>\n" +
    "  <text x=\"48\" y=\"60\" font-family=\"sans-serif\" font-size=\"8\" text-anchor=\"middle\" fill=\"#fff\">MyPaint SVG</text>\n" +
    "</svg>\n";
  if (!X.isSvg(Buffer.from(svg))) throw new Error("the SVG sample is not recognised");
  fs.writeFileSync(path.join(out, "drawing.svg"), svg);
  written.push(["drawing.svg", Buffer.byteLength(svg), "vector, " + W * 2 + "x" + H * 2]);
  const png = Encoders.png(withAlpha);
  const wrapped = X.svgWrapPng(W, H, png);
  fs.writeFileSync(path.join(out, "scene-embedded-png.svg"), wrapped);
  written.push(["scene-embedded-png.svg", wrapped.length, "picture as a PNG <image>"]);
}

written.forEach(([name, size, note]) => console.log("  " + name.padEnd(28) + String(size).padStart(7) + " B  " + note));
console.log(written.length + " samples in " + out);
