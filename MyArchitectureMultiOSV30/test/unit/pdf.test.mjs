// Unit tests for the vector PDF writer (src/io/pdfwrite.js): file
// structure (cross-reference offsets, trailer, page tree, page sizes),
// drawing operators, fonts for Latin and Korean text, and images.
// Run: node --test test/unit/pdf.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { svgToPdf, textWidth, textRuns, PT_PER_MM } from "../../src/io/pdfwrite.js";
import { SvgContext } from "../../src/ui/svgctx.js";
import { drawPlan, PLAN_THEMES } from "../../src/plan/render.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { makeFurniture } from "../../src/lib/furniture.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const latin1 = (bytes) => new TextDecoder("latin1").decode(bytes);

// Parse the file the way a reader does: startxref → xref table → objects.
function parsePdf(bytes) {
  const s = latin1(bytes);
  assert.ok(s.startsWith("%PDF-1."), "header");
  assert.ok(/%%EOF\n?$/.test(s), "trailer end");
  const sx = +/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1];
  assert.equal(s.slice(sx, sx + 4), "xref", "startxref points at the xref table");
  const m = /^xref\n0 (\d+)\n/.exec(s.slice(sx));
  const n = +m[1];
  const rows = s.slice(sx + m[0].length).split("\n").slice(0, n);
  assert.equal(rows[0], "0000000000 65535 f ");
  const objs = {};
  for (let id = 1; id < n; id++) {
    assert.match(rows[id], /^\d{10} 00000 n $/, `xref row ${id}`);
    const off = +rows[id].slice(0, 10);
    assert.equal(s.slice(off, off + `${id} 0 obj`.length), `${id} 0 obj`, `object ${id} starts at its xref offset`);
    const end = s.indexOf("endobj", off);
    objs[id] = { text: s.slice(off, end), off };
  }
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(s)[1];
  assert.equal(+/\/Size (\d+)/.exec(trailer)[1], n);
  const root = +/\/Root (\d+) 0 R/.exec(trailer)[1];
  // Streams: /Length matches the bytes between "stream\n" and "\nendstream".
  const streams = {};
  for (const [id, o] of Object.entries(objs)) {
    const k = o.text.indexOf("stream\n");
    if (k < 0) continue;
    const L = +/\/Length (\d+)/.exec(o.text)[1];
    const start = o.off + k + 7;
    assert.equal(s.slice(start + L, start + L + 10), "\nendstream", `stream ${id} length`);
    let data = bytes.subarray(start, start + L);
    if (/\/FlateDecode/.test(o.text.slice(0, k)) && !/\/Subtype \/Image/.test(o.text.slice(0, k))) data = inflateSync(data);
    streams[id] = data;
  }
  return { s, objs, streams, root, n };
}

function pageInfo(pdf) {
  const pagesId = +/\/Pages (\d+) 0 R/.exec(pdf.objs[pdf.root].text)[1];
  const tree = pdf.objs[pagesId].text;
  const kids = [...tree.matchAll(/(\d+) 0 R/g)].map((x) => +x[1]);
  const count = +/\/Count (\d+)/.exec(tree)[1];
  return { count, pages: kids.map((k) => {
    const t = pdf.objs[k].text;
    const box = /\/MediaBox \[([^\]]+)\]/.exec(t)[1].split(/\s+/).map(Number);
    const content = +/\/Contents (\d+) 0 R/.exec(t)[1];
    return { box, ops: latin1(pdf.streams[content]) };
  }) };
}

const SHAPES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210" height="297">
<rect width="100%" height="100%" fill="#ffffff"/>
<defs><clipPath id="c"><rect x="10" y="10" width="50" height="50"/></clipPath></defs>
<g clip-path="url(#c)"><circle cx="30" cy="30" r="25" fill="#3366cc"/></g>
<path d="M10 100 L100 100 L100 150 Z" fill="none" stroke="#ff0000" stroke-width="0.5" stroke-dasharray="2 1" stroke-linecap="round"/>
<ellipse cx="150" cy="50" rx="30" ry="10" fill="#00ff00" opacity="0.5"/>
<g transform="matrix(1 0 0 1 20 200)"><text x="0" y="0" font-size="5" text-anchor="middle" dominant-baseline="central" fill="#000000">거실 Living</text></g>
<text x="20" y="250" font-size="4" font-weight="bold">Title</text>
</svg>`;

test("PDF structure: header, xref offsets, trailer, page tree and page sizes", async () => {
  const { bytes, pages } = await svgToPdf([{ svg: SHAPES, width: 210, height: 297 }, { svg: SHAPES, width: 420, height: 297 }], { title: "평면도 Sheets", author: "SHKWON" });
  assert.equal(pages, 2);
  const pdf = parsePdf(bytes);
  const info = pageInfo(pdf);
  assert.equal(info.count, 2);
  assert.equal(info.pages.length, 2);
  near(info.pages[0].box[2], 210 * PT_PER_MM, 1e-3); near(info.pages[0].box[3], 297 * PT_PER_MM, 1e-3);
  near(info.pages[1].box[2], 420 * PT_PER_MM, 1e-3); near(info.pages[1].box[3], 297 * PT_PER_MM, 1e-3);
  // The title is UTF-16 in the info dictionary.
  const infoId = +/\/Info (\d+) 0 R/.exec(pdf.s)[1];
  assert.ok(pdf.objs[infoId].text.includes("/Title <FEFFD3C9BA74B3C4"), "평면도 as UTF-16BE");
  assert.ok(pdf.objs[infoId].text.includes("/Author <FEFF"));
});

test("Drawing operators: page CTM, clip, paths, dashes, opacity, fills and strokes", async () => {
  const { bytes } = await svgToPdf([{ svg: SHAPES, width: 210, height: 297 }], { compress: false });
  const pdf = parsePdf(bytes);
  const ops = pageInfo(pdf).pages[0].ops;
  const k = 72 / 25.4;
  assert.ok(ops.startsWith(`${Math.round(k * 10000) / 10000} 0 0 -${Math.round(k * 10000) / 10000} 0 ${Math.round(297 * k * 10000) / 10000} cm`), "viewBox mm → points, y flipped");
  assert.match(ops, /10 10 50 50 re\nW n/, "clip path");
  assert.match(ops, /c\n/, "Bézier circle");
  assert.match(ops, /\[2 1\] 0 d/, "dash pattern");
  assert.match(ops, /1 J/, "round caps");
  assert.match(ops, /1 0 0 RG/, "red stroke");
  assert.match(ops, /\/GS\d+ gs/, "opacity through an ExtGState");
  assert.match(pdf.s, /\/ExtGState << \/GS1 << \/Type \/ExtGState \/ca 0.5 \/CA 1 >>/);
  assert.match(ops, /\nS\n/); assert.match(ops, /\nf\n/);
});

test("Texts: Helvetica for Latin, the Korean CID font for Hangul, anchors and baselines", async () => {
  const { bytes } = await svgToPdf([{ svg: SHAPES, width: 210, height: 297 }], { compress: false });
  const pdf = parsePdf(bytes);
  const ops = pageInfo(pdf).pages[0].ops;
  assert.match(pdf.s, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(pdf.s, /\/BaseFont \/Helvetica-Bold/);
  assert.match(pdf.s, /\/Subtype \/Type0 \/BaseFont \/HYGoThic-Medium \/Encoding \/UniKS-UCS2-H/);
  assert.match(pdf.s, /\/Registry \(Adobe\) \/Ordering \(Korea1\)/);
  assert.match(ops, /\/F3 5 Tf <AC70C2E4> Tj/, "거실 as UCS-2");
  assert.match(ops, /\/F1 5 Tf <204C6976696E67> Tj/, "' Living' in WinAnsi");
  assert.match(ops, /\/F2 4 Tf <5469746C65> Tj/, "bold Title");
  // Centred: the run starts half its width left of x; central baseline: 0.35 em down.
  const w = textWidth("거실 Living", 5);
  const tm = /1 0 0 -1 (\S+) (\S+) Tm/.exec(ops);
  near(+tm[1], -w / 2, 1e-3); near(+tm[2], 0.35 * 5, 1e-3);
  // Font widths: Helvetica AFM; Hangul as wide as the substitute fonts draw it.
  near(textWidth("AB", 10), (667 + 667) / 100);
  near(textWidth("W", 10, true), 9.44);
  near(textWidth("가", 10), 9.2);
  assert.deepEqual(textRuns("m² ⌀5 −1").map((r) => r.font), ["latin"], "² ⌀ − all fit WinAnsi (⌀ → Ø, − → -)");
});

test("A real plan sheet (SvgContext + drawPlan) becomes one compressed vector page", async () => {
  const p = normalizeProject(newProject("Sheet"));
  const L = p.view.level;
  const wall = (id, x1, y1, x2, y2) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, height: null });
  p.walls.push(wall("w1", 0, 0, 6000, 0), wall("w2", 6000, 0, 6000, 4000), wall("w3", 6000, 4000, 0, 4000), wall("w4", 0, 4000, 0, 0));
  p.openings.push({ id: "d1", wall: "w1", kind: "door", at: 1500, width: 900, height: 2100, hinge: "start", side: 1, type: "single" });
  p.rooms.push({ id: "r1", level: L, name: "거실", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] });
  p.furniture.push({ id: "f1", level: L, ...makeFurniture("sofa3", 3000, 2000) });
  const ctx = new SvgContext(420, 297);
  ctx.setTransform(1 / 50, 0, 0, 1 / 50, 60, 60);
  drawPlan(ctx, normalizeProject(p), { ...PLAN_THEMES.light, bg: "#ffffff" }, { level: L, lw: 0.18 * 50, px: 0.06 * 50, print: true, units: "mm", models: new Map(), labels: { up: "UP" }, show: { ghost: false, underlays: false } });
  const svg = ctx.toString("#ffffff");
  const { bytes, warnings } = await svgToPdf([{ svg, width: 420, height: 297 }]);
  assert.deepEqual(warnings, []);
  const pdf = parsePdf(bytes);
  const { pages } = pageInfo(pdf);
  assert.ok(/FlateDecode/.test(pdf.s), "content stream compressed");
  const ops = pages[0].ops;
  const paths = (svg.match(/<path /g) || []).length;
  assert.ok(paths > 10);
  assert.ok((ops.match(/\n(?:S|f|B|f\*|B\*)\n/g) || []).length >= paths * 0.9, "every SVG path is painted");
  assert.ok(ops.includes("<AC70C2E4> Tj"), "the room name");
  assert.ok(bytes.length < svg.length, "smaller than the SVG");
});

test("Images: JPEG as DCTDecode, PNG through the predictor, others left out with a note", async () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DwnwECAP0A/+5m0+0AAAAASUVORK5CYII=";
  const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 2, 0, 3, 3, 0, 0, 0, 0, 0, 0xff, 0xd9));
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><image x="0" y="0" width="40" height="20" href="data:image/png;base64,${png}"/><image x="0" y="50" width="30" height="20" href="data:image/jpeg;base64,${jpeg}"/><image x="50" y="50" width="10" height="10" href="photo.png"/></svg>`;
  const { bytes, warnings } = await svgToPdf([{ svg: s, width: 100, height: 100 }], { compress: false });
  const pdf = parsePdf(bytes);
  assert.match(pdf.s, /\/Subtype \/Image \/Width 2 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode \/DecodeParms << \/Predictor 15 \/Colors 3/);
  assert.match(pdf.s, /\/Width 3 \/Height 2 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
  const ops = pageInfo(pdf).pages[0].ops;
  assert.match(ops, /40 0 0 -20 0 20 cm\n\/Im1 Do/, "image placed y-down");
  assert.ok(warnings.some((w) => /not embedded/.test(w)));
});

test("Empty input is refused", async () => {
  await assert.rejects(() => svgToPdf([]), /No pages/);
  await assert.rejects(() => svgToPdf([{ svg: "<html/>", width: 10, height: 10 }]), /Not an SVG/);
});
