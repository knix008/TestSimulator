"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function readPngRgba(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString("ascii", 1, 4), "PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  assert.equal(colorType, 6, "icon must be RGBA");
  const pieces = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IDAT") pieces.push(data);
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(pieces));
  const stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const out = rgba.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? out[i - 4] : 0;
      const up = prev[i];
      const upLeft = i >= 4 ? prev[i - 4] : 0;
      let v = row[i];
      if (filter === 1) v = (v + left) & 255;
      else if (filter === 2) v = (v + up) & 255;
      else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        v = (v + pr) & 255;
      } else if (filter !== 0) {
        throw new Error(`unsupported png filter ${filter}`);
      }
      out[i] = v;
    }
    prev = Buffer.from(out);
  }
  return { width, height, rgba };
}

describe("app icon", () => {
  const pngPath = path.join(__dirname, "../app/assets/icon.png");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");

  it("has a transparent border around a 3D tile", () => {
    const { width, height, rgba } = readPngRgba(pngPath);
    assert.ok(width >= 256);
    assert.ok(height >= 256);
    const corners = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      ((height - 1) * width + width - 1) * 4
    ];
    for (const i of corners) {
      assert.equal(rgba[i + 3], 0, "corner must be transparent");
    }
  });

  it("draws a resource graph and bars on the tile", () => {
    const src = fs.readFileSync(path.join(__dirname, "../scripts/make-icon.js"), "utf8");
    assert.match(src, /bars\s*=/);
    assert.match(src, /pts\s*=/);
    assert.doesNotMatch(src, /ring\(/);
  });

  it("keeps toolbar buttons flat and the dialog icon outline transparent", () => {
    assert.match(css, /\.tb-btn svg[\s\S]*border:\s*0/);
    assert.match(css, /\.tb-btn\s*\{[^}]*border:\s*1px solid var\(--line\)/s);
    assert.match(css, /\.tb-btn\s*\{[^}]*box-shadow:\s*none/s);
    assert.doesNotMatch(css, /linear-gradient\(160deg/);
    assert.match(css, /\.dlg-icon[\s\S]*border:\s*1px solid transparent/);
  });
});
