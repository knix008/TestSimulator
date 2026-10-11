// Unit tests for SVG import extras (src/io/svgimport.js): embedded and
// linked <image>s as tracing underlays, text on a path, <use>/<symbol>
// and the notes for what is ignored.
// Run: node --test test/unit/svgimport.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { importSvg, resolveSvgImages } from "../../src/io/svgimport.js";
import { imageInfo, parseDataUri } from "../../src/io/imageinfo.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
// A 2 × 1 pixel RGB PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DwnwECAP0A/+5m0+0AAAAASUVORK5CYII=";
const pngBytes = () => Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
const svg = (body, attrs = `width="200mm" height="100mm" viewBox="0 0 200 100"`) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

test("Image headers: PNG, GIF, JPEG, BMP, WebP and SVG sizes; data URIs", () => {
  assert.deepEqual(imageInfo(pngBytes()), { mime: "image/png", width: 2, height: 1 });
  const gif = Uint8Array.from([..."GIF89a"].map((c) => c.charCodeAt(0)).concat([10, 0, 5, 0, 0, 0, 0, 0]));
  assert.deepEqual(imageInfo(gif), { mime: "image/gif", width: 10, height: 5 });
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 30, 0, 40, 3, 0, 0, 0, 0, 0);
  const j = imageInfo(jpeg);
  assert.equal(j.mime, "image/jpeg"); assert.equal(j.width, 40); assert.equal(j.height, 30); assert.equal(j.components, 3);
  const bmp = new Uint8Array(30); bmp.set([0x42, 0x4d]); new DataView(bmp.buffer).setInt32(18, 7, true); new DataView(bmp.buffer).setInt32(22, -9, true);
  assert.deepEqual(imageInfo(bmp), { mime: "image/bmp", width: 7, height: 9 });
  assert.deepEqual(imageInfo(new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="60">`)), { mime: "image/svg+xml", width: 60, height: 40 });
  assert.equal(imageInfo(new Uint8Array(20)), null);
  const d = parseDataUri(`data:image/png;base64,${PNG}`);
  assert.equal(d.mime, "image/png"); assert.equal(d.bytes.length, pngBytes().length);
  assert.equal(new TextDecoder().decode(parseDataUri("data:image/svg+xml,%3Csvg%3E").bytes), "<svg>");
});

test("An embedded image becomes a tracing underlay placed by the SVG transforms", () => {
  // 40 × 40 box, 2:1 picture → meet: 40 × 20, centred vertically (y + 10).
  const r = importSvg(svg(`<g transform="translate(10 20) rotate(30)"><image x="0" y="0" width="40" height="40" xlink:href="data:image/png;base64,${PNG}"/></g>`), { level: "L1" });
  assert.equal(r.underlays.length, 1);
  const u = r.underlays[0];
  assert.ok(u.id.startsWith("i") && u.level === "L1");
  assert.ok(u.src.startsWith("data:image/png;base64,"));
  near(u.w, 40); near(u.h, 20); near(u.rot, 30);
  near(u.x, 10 - 10 * Math.sin(Math.PI / 6)); near(u.y, 20 + 10 * Math.cos(Math.PI / 6));
  assert.equal(u.opacity, 0.5);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.bounds && r.bounds.x2 > 39 && r.bounds.y2 > 45, "bounds include the image");
  // Millimetres from the root viewport: 1 user unit = 2 mm here.
  const big = importSvg(svg(`<image x="10" y="10" width="20" height="10" preserveAspectRatio="none" opacity="0.8" href="data:image/png;base64,${PNG}"/>`, `width="400mm" height="200mm" viewBox="0 0 200 100"`));
  const b = big.underlays[0];
  near(b.x, 20); near(b.y, 20); near(b.w, 40); near(b.h, 20); near(b.rot, 0); assert.equal(b.opacity, 0.8);
  // Nothing else in the file: the import still has something to bring in.
  assert.equal(big.drawings.length + big.texts.length, 0);
});

test("Images linked by a relative path are read next to the SVG (desktop)", async () => {
  const r = importSvg(svg(`<image x="100" y="0" width="50" height="20" preserveAspectRatio="none" href="scans/plan%201.png"/><image href="https://example.com/a.png" width="5" height="5"/>`), { level: "L1" });
  assert.equal(r.underlays.length, 1);
  assert.ok(r.underlays[0].pending);
  assert.ok(r.warnings.some((w) => /web images/.test(w)));
  const asked = [];
  await resolveSvgImages(r, { basePath: "C:\\work\\site.svg", level: "L1", readFile: async (p) => { asked.push(p); return { bytes: pngBytes() }; } });
  assert.deepEqual(asked, ["C:\\work\\scans/plan 1.png"]);
  const u = r.underlays[0];
  assert.ok(!u.pending && u.src.startsWith("data:image/png;base64,"));
  assert.equal(u.name, "plan 1.png");
  near(u.x, 100); near(u.w, 50); near(u.h, 20); assert.equal(u.level, "L1");
  // The web build cannot read files: the image is dropped with a note.
  const web = importSvg(svg(`<image href="plan.png" width="10" height="10"/>`));
  await resolveSvgImages(web, { basePath: "", readFile: null });
  assert.equal(web.underlays.length, 0);
  assert.ok(web.warnings.some((w) => /desktop app/.test(w)));
  // A missing file: dropped with a note.
  const gone = importSvg(svg(`<image href="nope.png" width="10" height="10"/>`));
  await resolveSvgImages(gone, { basePath: "/tmp/x.svg", readFile: async () => { throw new Error("ENOENT"); } });
  assert.equal(gone.underlays.length, 0);
  assert.ok(gone.warnings.some((w) => /could not be read/.test(w)));
});

test("Mirrored and unreadable images are noted", () => {
  const r = importSvg(svg(`<image transform="scale(-1 1)" x="-50" width="40" height="20" href="data:image/png;base64,${PNG}"/><image width="9" height="9" href="data:image/png;base64,AAAA"/>`));
  assert.equal(r.underlays.length, 1);
  assert.ok(r.warnings.some((w) => /mirrored/.test(w)));
  assert.ok(r.warnings.some((w) => /could not be read/.test(w)));
});

test("Text on a path comes in straight along the start of the path", () => {
  const r = importSvg(svg(`<defs><path id="p" d="M10 90 L60 40"/></defs><text font-size="10"><textPath href="#p">On path</textPath></text>`), { mmPerUnit: 1 });
  assert.equal(r.texts.length, 1);
  const t = r.texts[0];
  assert.equal(t.text, "On path");
  near(t.rot, -45); near(t.size, 10);
  // The top of the em box sits 0.8 em above the baseline, across the path.
  near(t.x, 10 - 8 * Math.SQRT1_2, 1e-5); near(t.y, 90 - 8 * Math.SQRT1_2, 1e-5);
  assert.ok(r.warnings.some((w) => /Text on a path/.test(w)));
});

test("<use> of a <symbol>, and clip paths ignored with a note", () => {
  const r = importSvg(svg(`<defs><symbol id="s"><rect x="0" y="0" width="10" height="5"/></symbol><clipPath id="c"><rect width="3" height="3"/></clipPath></defs>
    <use href="#s" x="20" y="30"/><use xlink:href="#s" transform="translate(100 0)"/><circle cx="5" cy="5" r="4" clip-path="url(#c)"/>`), { mmPerUnit: 1 });
  const rects = r.drawings.filter((d) => d.kind === "polyline");
  assert.equal(rects.length, 2);
  assert.deepEqual(rects[0].pts[0], [20, 30]);
  assert.deepEqual(rects[1].pts[0], [100, 0]);
  assert.equal(r.drawings.filter((d) => d.kind === "circle").length, 1, "the clipped circle comes in whole");
  assert.ok(r.warnings.some((w) => /Clipping paths/.test(w)));
  assert.ok(!r.warnings.some((w) => /not supported/.test(w)));
});
