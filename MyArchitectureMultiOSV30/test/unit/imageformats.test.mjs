// Unit tests for the picture writers (src/io/imageformats.js): BMP, TGA, TIFF
// and the one-page PDF are read back byte by byte; the format list and the
// file-dialog filters. (PNG/JPEG/WebP come from the browser's canvas and are
// checked by the GUI smoke test.)
// Run: node --test test/unit/imageformats.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { imageFormats, formatInfo, formatFilter, encodeBmp, encodeTga, encodeTiff, pdfWithJpeg } from "../../src/io/imageformats.js";

// A 3 × 2 picture: red green blue / white black half-transparent grey.
const W = 3, H = 2;
const PX = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 100]];
const rgba = new Uint8ClampedArray(PX.flat());
const px = (x, y) => PX[y * W + x];

describe("picture formats", () => {
  test("the list: PNG first, AVIF only where the canvas writes it, every id unique", () => {
    const ids = imageFormats({ avif: false }).map((f) => f.id);
    assert.deepEqual(ids, ["png", "jpg", "webp", "bmp", "tiff", "tga", "pdf"]);
    assert.ok(imageFormats({ avif: true }).some((f) => f.id === "avif"));
    assert.equal(formatInfo("nonsense").id, "png");
    assert.equal(formatInfo("tiff").ext, "tif");
    assert.deepEqual(formatFilter("jpg"), { name: "JPEG", extensions: ["jpg", "jpeg"] });
    assert.deepEqual(formatFilter("tiff"), { name: "TIFF", extensions: ["tif", "tiff"] });
    // Lossy formats offer a quality; formats with transparency say so.
    assert.deepEqual(imageFormats({ avif: false }).filter((f) => f.quality).map((f) => f.id), ["jpg", "webp", "pdf"]);
    assert.deepEqual(imageFormats({ avif: false }).filter((f) => f.alpha).map((f) => f.id), ["png", "webp", "tiff", "tga"]);
  });

  test("BMP: 24-bit, rows bottom-up and padded to 4 bytes", () => {
    const b = encodeBmp(rgba, W, H);
    const v = new DataView(b.buffer);
    assert.equal(String.fromCharCode(b[0], b[1]), "BM");
    const row = Math.ceil((W * 3) / 4) * 4;
    assert.equal(v.getUint32(2, true), 54 + row * H);
    assert.equal(b.length, 54 + row * H);
    assert.equal(v.getInt32(18, true), W);
    assert.equal(v.getInt32(22, true), H);
    assert.equal(v.getUint16(28, true), 24);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = 54 + (H - 1 - y) * row + x * 3;
      assert.deepEqual([b[o + 2], b[o + 1], b[o]], px(x, y).slice(0, 3), `pixel ${x},${y}`);
    }
  });

  test("TGA: uncompressed true colour, top-left origin, alpha when asked", () => {
    for (const alpha of [false, true]) {
      const b = encodeTga(rgba, W, H, alpha);
      const bpp = alpha ? 4 : 3;
      assert.equal(b[2], 2);
      assert.equal(b[12] | (b[13] << 8), W);
      assert.equal(b[14] | (b[15] << 8), H);
      assert.equal(b[16], bpp * 8);
      assert.equal(b[17] & 0x20, 0x20);
      assert.equal(b.length, 18 + W * H * bpp);
      for (let i = 0; i < W * H; i++) {
        const o = 18 + i * bpp; const p = PX[i];
        assert.deepEqual([b[o + 2], b[o + 1], b[o]], p.slice(0, 3));
        if (alpha) assert.equal(b[o + 3], p[3]);
      }
    }
  });

  test("TIFF: little-endian baseline file whose tags lead to the pixels", () => {
    for (const alpha of [false, true]) {
      const b = encodeTiff(rgba, W, H, alpha);
      const v = new DataView(b.buffer);
      assert.equal(String.fromCharCode(b[0], b[1]), "II");
      assert.equal(v.getUint16(2, true), 42);
      const ifd = v.getUint32(4, true);
      const n = v.getUint16(ifd, true);
      const tags = new Map();
      for (let i = 0; i < n; i++) {
        const p = ifd + 2 + i * 12;
        const id = v.getUint16(p, true); const type = v.getUint16(p + 2, true); const count = v.getUint32(p + 4, true);
        tags.set(id, type === 3 && count === 1 ? v.getUint16(p + 8, true) : v.getUint32(p + 8, true));
      }
      // Tags must be in ascending order.
      const ids = [...tags.keys()];
      assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
      const spp = alpha ? 4 : 3;
      assert.equal(tags.get(256), W);
      assert.equal(tags.get(257), H);
      assert.equal(tags.get(259), 1);
      assert.equal(tags.get(262), 2);
      assert.equal(tags.get(277), spp);
      assert.equal(tags.get(279), W * H * spp);
      assert.equal(tags.has(338), alpha);
      const data = tags.get(273);
      assert.equal(data + W * H * spp, b.length);
      for (let i = 0; i < W * H; i++) assert.deepEqual([...b.subarray(data + i * spp, data + i * spp + spp)], PX[i].slice(0, spp));
      // 96 dpi.
      const xres = tags.get(282);
      assert.equal(v.getUint32(xres, true) / v.getUint32(xres + 4, true), 96);
    }
  });

  test("PDF: one page the size of the picture, the JPEG stored as it is, a correct cross-reference table", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 0xff, 0xd9]);
    const b = pdfWithJpeg(jpeg, 800, 600);
    const text = Buffer.from(b).toString("latin1");
    assert.ok(text.startsWith("%PDF-1.4\n"));
    assert.ok(text.trimEnd().endsWith("%%EOF"));
    assert.ok(text.includes("/MediaBox [0 0 600 450]"), "800 × 600 px at 96 dpi = 600 × 450 pt");
    assert.ok(text.includes(`/Width 800 /Height 600`) && text.includes("/Filter /DCTDecode") && text.includes(`/Length ${jpeg.length}`));
    // The JPEG bytes are in the file unchanged.
    const at = Buffer.from(b).indexOf(Buffer.from(jpeg));
    assert.ok(at > 0);
    // startxref points at "xref"; each entry points at "n 0 obj".
    const sx = +text.match(/startxref\n(\d+)/)[1];
    assert.equal(text.slice(sx, sx + 4), "xref");
    const entries = [...text.slice(sx).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => +m[1]);
    assert.equal(entries.length, 5);
    entries.forEach((off, i) => assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  });
});
