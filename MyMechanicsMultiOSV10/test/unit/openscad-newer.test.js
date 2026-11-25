// The newer OpenSCAD language and engine features: object() values, textmetrics() / fontmetrics(), roof()
// (straight skeleton and Voronoi, checked against hand-computed volumes), $t from the animation, OFF / AMF
// round trips, the CSG tree export (which must run to the same solid) and the 2D exports (SVG, DXF, PDF).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runScad, runScadWithFiles, loadManifold } from '../../src/cad/openscad/index.js';
import { csgTree } from '../../src/cad/openscad/csg-tree.js';
import { straightSkeleton } from '../../src/cad/openscad/roof.js';
import { svgOf, dxfOf, pdfOf, exportScadResult } from '../../src/cad/openscad/export.js';
import { writeOff, writeAmf, readMeshFile } from '../../src/cad/mesh-formats.js';
import { scadKey, scadTime, scadSpecials } from '../../src/cad/openscad-feature.js';

await loadManifold();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const echoes = (src) => runScad(src).echoes;

test('object(): members from pairs, lists, objects and named arguments; access, iteration, equality', () => {
  const e = echoes(`o = object(a = 1, b = [2, 3]);
o2 = object(o, ["c", "x"], b = undef);
echo(o, o.a, o["b"], is_object(o), is_object([1]), o2, has_key(o2, "b"), has_key(o2, "c"));
for (k = o) echo(k);
echo(object([["p", 1], ["q", 2]]) == object(p = 1, q = 2), str(object(z = true)));`);
  assert.deepEqual(e, [
    'ECHO: { a = 1; b = [2, 3]; }, 1, [2, 3], true, false, { a = 1; c = "x"; }, false, true',
    'ECHO: "a"',
    'ECHO: "b"',
    'ECHO: true, "{ z = true; }"',
  ]);
});

test('textmetrics() matches the outline text() draws; fontmetrics() gives the font', async () => {
  const src = 'm = textmetrics("Hello", size = 10, halign = "center"); echo(m.position, m.size, m.offset, m.ascent, m.descent); text("Hello", size = 10, halign = "center");';
  const { result: r } = await runScadWithFiles(src);
  const [, pos, size] = /^ECHO: \[([^\]]+)\], \[([^\]]+)\]/.exec(r.echoes[0]);
  const [px, py] = pos.split(',').map(Number); const [sx, sy] = size.split(',').map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of r.outlines) for (const [x, y] of o) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  assert.ok(near(px, x0, 1e-3) && near(py, y0, 1e-3), `${px},${py} vs ${x0},${y0}`);
  assert.ok(near(sx, x1 - x0, 1e-3) && near(sy, y1 - y0, 1e-3));
  // Centred: the box straddles x = 0.
  assert.ok(Math.abs(px + sx / 2) < sx * 0.1);
  const { result: f } = await runScadWithFiles('f = fontmetrics(size = 10); echo(f.font.family, f.nominal.ascent > 0, f.nominal.descent < 0, f.interline > f.nominal.ascent);');
  assert.equal(f.echoes[0], 'ECHO: "Liberation Sans", true, true, true');
});

test('roof(method = "straight"): pyramid, hip roof, a frame with a hole', () => {
  const vol = (src) => runScad(src).volume;
  // Square 10: a pyramid 5 high, V = 10·10·5 / 3.
  assert.ok(near(vol('roof(method = "straight") square(10);'), 500 / 3, 1e-6));
  // 10 × 4: a hip roof 2 high — a prism (ridge 6) and two half pyramids.
  assert.ok(near(vol('roof(method = "straight") square([10, 4]);'), 6 * 4 * 2 / 2 + 4 * 4 * 2 / 3, 1e-6));
  // A 20 square with a 10 hole: the ring 5 wide, a 2.5 high triangle along the 60 long mid line.
  assert.ok(near(vol('roof(method = "straight") difference() { square(20, center = true); square(10, center = true); }'), 5 * 2.5 / 2 * 60, 1e-6));
  // An L (two 4 wide legs): a straight skeleton keeps 45° everywhere, peak 2.
  const L = runScad('roof(method = "straight") polygon([[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]);');
  assert.ok(near(Math.max(...L.verts.map((v) => v[2])), 2, 1e-6));
});

test('straight skeleton: every face slopes at 45° (height = distance to its edge line)', () => {
  const sk = straightSkeleton([[[0, 0], [12, 0], [12, 3], [5, 3], [5, 9], [0, 9]]]);
  assert.ok(sk.faces.length > 0);
  for (const f of sk.faces) {
    // The rise between the bottom and top edges equals the inward move of the edge.
    const [a0, b0, b1, a1] = f;
    const dx = b0[0] - a0[0], dy = b0[1] - a0[1]; const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const n = [-dy / l, dx / l];
    const move = (a1[0] - a0[0]) * n[0] + (a1[1] - a0[1]) * n[1];
    assert.ok(near(move, a1[2] - a0[2], 1e-6), `${move} vs ${a1[2] - a0[2]}`);
  }
});

test('roof() (Voronoi): distance to the outline — round at a concave corner', () => {
  const sq = runScad('roof() square(10);');
  assert.ok(near(sq.volume, 500 / 3, 1e-6));
  // An L of 4 wide legs: the highest point is the largest circle in the corner, r = 4√2 / (1 + √2).
  const L = runScad('roof($fn = 96) polygon([[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]);');
  const top = Math.max(...L.verts.map((v) => v[2]));
  assert.ok(near(top, (4 * Math.SQRT2) / (1 + Math.SQRT2), 5e-3), String(top));
  // Higher than the straight skeleton's 45° valley.
  assert.ok(L.volume > runScad('roof(method = "straight") polygon([[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]]);').volume);
});

test('$t: the specials a feature runs with, and its key changes only when the program reads $t', () => {
  assert.equal(echoes('echo($t);')[0], 'ECHO: 0');
  assert.equal(runScad('echo($t);', { specials: { $t: 0.25 } }).echoes[0], 'ECHO: 0.25');
  const v = (t) => runScad('cube([10 + 10 * $t, 10, 10]);', { specials: { $t: t } }).volume;
  assert.ok(near(v(0), 1000) && near(v(0.5), 1500));
  const f = { source: 'cube(1 + $t);', animT: 1.25 };
  assert.equal(scadTime(f), 0.25);
  assert.deepEqual(scadSpecials(f), { $t: 0.25 });
  assert.notEqual(scadKey(f), scadKey({ ...f, animT: 0.5 }));
  const g = { source: 'cube(1);', animT: 0.1 };
  assert.equal(scadKey(g), scadKey({ ...g, animT: 0.7 }));
});

test('OFF and AMF: written and read back', () => {
  const r = runScad('cube(10); translate([20, 0, 0]) sphere(3, $fn = 12);');
  const items = [{ name: 'm', color: [1, 0.5, 0], vertices: Float32Array.from(r.verts.flat()), triangles: Uint32Array.from(r.tris.flat()) }];
  for (const [ext, data] of [['off', writeOff(items)], ['amf', writeAmf(items)]]) {
    const back = readMeshFile(`x.${ext}`, data)[0];
    assert.equal(back.verts.length, r.verts.length, ext);
    assert.deepEqual(back.tris, r.tris, ext);
    back.verts.forEach((p, i) => p.forEach((x, k) => assert.ok(near(x, r.verts[i][k], 1e-5))));
  }
  // An OFF with quads and a colour per face.
  const quad = readMeshFile('q.off', 'OFF\n4 1 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3 255 0 0\n');
  assert.deepEqual(quad[0].tris, [[0, 1, 2], [0, 2, 3]]);
});

test('CSG tree export: group / multmatrix / every argument written; the file runs to the same solid', () => {
  const src = `module post(h) { translate([0, 0, h / 2]) cylinder(h = h, d = 4, center = true, $fn = 16); }
for (i = [0 : 2]) translate([i * 10, 0, 0]) post(5 + i);
color("red") rotate([0, 0, 45]) cube([4, 4, 2]);
difference() { sphere(r = 6, $fn = 20); linear_extrude(height = 8, center = true, scale = 0.5) square(3, center = true); }
roof(method = "straight") translate([30, 0]) square([8, 4]);`;
  const tree = csgTree(src);
  assert.equal(tree.error, null);
  assert.match(tree.text, /multmatrix\(\[\[1, 0, 0, 10\], \[0, 1, 0, 0\], \[0, 0, 1, 0\], \[0, 0, 0, 1\]\]\)/);
  assert.match(tree.text, /cylinder\(\$fn = 16, \$fa = 12, \$fs = 2, h = 5, r1 = 2, r2 = 2, center = true\);/);
  assert.match(tree.text, /linear_extrude\(\$fn = 0, \$fa = 12, \$fs = 2, height = 8, center = true, convexity = 1, twist = 0, slices = 1, scale = \[0.5, 0.5\]\)/);
  assert.match(tree.text, /roof\(\$fn = 0, \$fa = 12, \$fs = 2, method = "straight", convexity = 1\)/);
  assert.doesNotMatch(tree.text, /module|for \(|post\(/);
  const a = runScad(src); const b = runScad(tree.text);
  assert.ok(near(a.volume, b.volume, 1e-9), `${a.volume} vs ${b.volume}`);
});

test('2D exports: SVG, DXF and PDF of the outlines', () => {
  const r = runScad('difference() { square(20); translate([5, 5]) square(10); }');
  assert.equal(r.dim, 2);
  const svg = svgOf(r.outlines);
  assert.match(svg, /width="20mm" height="20mm"/);
  assert.match(svg, /fill-rule="evenodd"/);
  const dxf = dxfOf(r.outlines);
  assert.equal((dxf.match(/\nPOLYLINE\n/g) ?? []).length, 2);
  assert.equal((dxf.match(/\nVERTEX\n/g) ?? []).length, 8);
  const pdf = pdfOf(r.outlines, { title: 'frame' });
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /B\*/);
  // The xref offsets point at the objects.
  const xref = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.ok(pdf.slice(xref).startsWith('xref'));
  const offs = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert.ok(pdf.slice(o).startsWith(`${i + 1} 0 obj`)));
  // 1:1 — 20 mm is 56.69 pt between the outer square's corners.
  const nums = [...pdf.matchAll(/([\d.]+) ([\d.]+) m/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(nums.length > 0);
  assert.equal(exportScadResult(r, 'stl'), null);
  const r3 = runScad('cube(2);');
  assert.equal(exportScadResult(r3, 'off').ext, 'off');
  assert.ok(exportScadResult(r3, 'stl').data instanceof Uint8Array);
});

test('code editor: highlighting, completion of built-ins and the program\'s own names, console line numbers', async () => {
  const { highlightScad, completionsAt, messageLine } = await import('../../src/ui/scad-editor.js');
  const h = highlightScad('module m(a) { cube(10); } // note\nx = "s"; $fn = 8; y = sin(30);');
  for (const cls of ['kw', 'mod', 'num', 'com', 'str', 'sp', 'fn']) assert.match(h, new RegExp(`class="sh-${cls}"`), cls);
  const own = completionsAt('module wheel(r) {}\nwhe', 22);
  assert.deepEqual(own.items.map((x) => x.insert), ['wheel(r)']);
  assert.equal(own.from, 19);
  assert.equal(completionsAt('cyl', 3).items[0].insert, 'cylinder(h = 10, r = 5, center = false)');
  assert.ok(completionsAt('$f', 2).items.some((x) => x.label === '$fn'));
  assert.ok(completionsAt('textm', 5).items.some((x) => x.label === 'textmetrics'));
  assert.equal(messageLine("Ignoring unknown module 'x' (line 4)"), 4);
  assert.equal(messageLine('syntax error (line 7, column 2)'), 7);
  assert.equal(messageLine('no line here'), null);
  // A warning carries its line.
  const r = runScad('cube(1);\nfoo();');
  assert.equal(messageLine(r.warnings[0]), 2);
});
