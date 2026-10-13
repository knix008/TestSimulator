// Open 2D CAD formats: files written by other programs (FreeCAD's IGES, SVG
// and DXF writers, ezdxf's binary and code-page DXF) or to the format
// specifications (Inkscape-style SVG, HP-GL/2, Gerber X2, Excellon), and
// MyCAD's own exports (DXF 2000, SVG, IGES, HP-GL/2) read back.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { entityBox, measure, primitives } from '../../src/domain/entities.js';
import { decodeText, DRAWING_EXTENSIONS, formatOfName, importDrawingBytes, isCadDrawingFileName } from '../../src/domain/import2d.js';
import { exportIges, importIges } from '../../src/domain/iges.js';
import { exportHpgl, importHpgl } from '../../src/domain/formats2d.js';
import { parseFile } from '../../src/domain/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => importDrawingBytes(parts.at(-1), new Uint8Array(fs.readFileSync(path.join(root, ...parts))));
const near = (a, b, eps, label = '') => assert.ok(Math.abs(a - b) <= eps, `${label} ${a} ≉ ${b}`);
const count = (entities) => entities.reduce((map, e) => ({ ...map, [e.type]: (map[e.type] ?? 0) + 1 }), {});

/** Total drawn length: lines, outlines, circles and arcs. */
function drawnLength(entities) {
  let total = 0;
  const along = (pts) => { for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); };
  for (const entity of entities) {
    for (const prim of primitives(entity)) {
      if (prim.kind === 'line') along([prim.a, prim.b]);
      else if (prim.kind === 'poly') along(prim.closed ? [...prim.points, prim.points[0]] : prim.points);
      else if (prim.kind === 'fill') along([...prim.points, prim.points[0]]);
      else if (prim.kind === 'circle') total += 2 * Math.PI * prim.r;
      else if (prim.kind === 'arc') { let sweep = (prim.end - prim.start) % 360; if (sweep <= 0) sweep += 360; total += ((sweep * Math.PI) / 180) * prim.r; }
    }
  }
  return total;
}
const boxOf = (entities) => entities.map(entityBox).filter(Boolean).reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }));

test('2D formats: extensions and content both pick the reader', () => {
  for (const ext of ['dxf', 'svg', 'plt', 'igs', 'iges', 'gbr', 'gtl', 'drl']) assert.ok(DRAWING_EXTENSIONS.includes(ext), ext);
  assert.equal(formatOfName('board.GTL'), 'gerber');
  assert.equal(isCadDrawingFileName('a.mcad'), false);
  // Content wins over a misleading name.
  const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="black"/></svg>');
  const r = importDrawingBytes('mislabelled.txt', svg);
  assert.equal(r.format, 'svg');
  assert.equal(r.drawing.entities[0].type, 'line');
  assert.throws(() => importDrawingBytes('x.bin', new Uint8Array([1, 2, 3])), /not a drawing format/);
});

test('2D formats: text decoding — UTF-8, UTF-16, and the DXF code page', () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), 'A');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x5c, 0xd5])), '한');
  const cp949 = new Uint8Array([...new TextEncoder().encode('  9\n$DWGCODEPAGE\n  3\nANSI_949\n'), 0xc7, 0xd1]);
  assert.match(decodeText(cp949, { language: 'en' }), /한$/);
});

test('FreeCAD-made IGES, SVG and DXF (samples/drawings): same curves and size as FreeCAD drew', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'samples', 'drawings', 'freecad-drawings.json'), 'utf8'));
  for (const [file, info] of Object.entries(expected)) {
    const r = read('samples', 'drawings', file);
    assert.deepEqual(r.skipped, {}, `${file}: ${JSON.stringify(r.skipped)}`);
    near(drawnLength(r.drawing.entities), info.length, 0.1, `${file} total length`);
    const box = boxOf(r.drawing.entities);
    near(box.maxX - box.minX, info.bbox[2] - info.bbox[0], 0.05, `${file} width`);
    near(box.maxY - box.minY, info.bbox[3] - info.bbox[1], 0.05, `${file} height`);
    if (!file.endsWith('.svg')) { near(box.minX, info.bbox[0], 0.05, `${file} x`); near(box.minY, info.bbox[1], 0.05, `${file} y`); }
    assert.equal(count(r.drawing.entities).circle, 4, `${file}: four holes`);
  }
});

test('SVG as Inkscape writes it: layers, transforms, arcs, rounded rect, fills, dashes, text', () => {
  const r = read('samples', 'drawings', 'inkscape-bracket.svg');
  const c = count(r.drawing.entities);
  assert.equal(c.circle, 4);
  assert.equal(c.ellipse, 1);
  assert.equal(c.hatch, 1, 'the filled leaf (no stroke) is a solid hatch');
  assert.equal(c.text, 2);
  assert.ok(c.spline >= 3, 'arcs and curves become splines');
  const dashed = r.drawing.entities.filter((e) => e.type === 'line' && e.lineType);
  assert.equal(dashed.length, 2, 'the two centre lines keep their dashes');
  assert.ok(r.drawing.entities.some((e) => e.type === 'text' && e.text === 'BRACKET 160 × 100'));
  // The outline: 160 × 100 mm, placed by the layer's translate(10,10).
  const outline = r.drawing.entities.find((e) => e.type === 'spline' && boxOf([e]).maxX - boxOf([e]).minX > 150);
  const b = boxOf([outline]);
  near(b.maxX - b.minX, 160, 0.01, 'outline width'); near(b.maxY - b.minY, 100, 0.01, 'outline height');
  near(b.minX, 10, 0.01, 'outline x');
  const hole = r.drawing.entities.find((e) => e.type === 'circle');
  near(hole.r, 6, 1e-9);
});

test('HP-GL/2 (plotter units 1/40 mm): pens → layers, PA/PR, CI, AA, LT, DT and LB labels', () => {
  const r = read('samples', 'drawings', 'hpgl-plotter-demo.plt');
  const c = count(r.drawing.entities);
  assert.deepEqual(c, { polyline: 3, circle: 2, arc: 1, line: 3, text: 2 });
  assert.deepEqual(r.drawing.entities.filter((e) => e.type === 'text').map((e) => e.text), ['HP-GL/2 PLOTTER DEMO', '6000 x 4000 PLU = 150 x 100 MM']);
  const b = boxOf(r.drawing.entities.filter((e) => e.type !== 'text'));
  near(b.maxX, 150, 1e-9); near(b.maxY, 100, 1e-9);
  assert.equal(r.drawing.entities.filter((e) => e.lineType === 'dashed').length, 2, 'LT2 lines are dashed');
  assert.ok(new Set(r.drawing.entities.map((e) => e.layer)).size >= 4, 'one layer per pen');
  const arc = r.drawing.entities.find((e) => e.type === 'arc');
  near(arc.r, 25, 1e-9);
  const triangle = r.drawing.entities.find((e) => e.type === 'polyline' && e.points.length === 4);
  near(triangle.points[1].x - triangle.points[0].x, 10, 1e-9, 'PR moves are relative');
});

test('Gerber RS-274X: outline arcs, pads by aperture, track widths, the copper-pour region', () => {
  const outline = read('samples', 'drawings', 'pcb-board-outline.gko');
  near(drawnLength(outline.drawing.entities), 2 * (54 + 34) + 2 * Math.PI * 3, 1e-6, 'outline perimeter');
  const top = read('samples', 'drawings', 'pcb-board-top.gtl');
  assert.deepEqual(top.skipped, {});
  const c = count(top.drawing.entities);
  assert.equal(c.circle, 3, 'round pads');
  assert.equal(c.rect, 2, 'square and oval pads');
  assert.equal(c.polygon, 1, 'the hexagon');
  assert.equal(c.arc, 2);
  assert.equal(c.hatch, 1, 'the region');
  const widths = new Set(top.drawing.entities.filter((e) => e.type === 'line').map((e) => e.lineWidth));
  assert.deepEqual([...widths].sort(), [0.25, 0.5], 'tracks keep their aperture widths');
  const region = top.drawing.entities.find((e) => e.type === 'hatch');
  near(measure(region).area, 10 * 10 + (Math.PI * 25) / 2, 0.2, 'region area');
  const oval = top.drawing.entities.find((e) => e.type === 'rect' && e.radius > 0);
  near(oval.width, 1.2, 1e-9); near(oval.height, 2.4, 1e-9);
});

test('Excellon drill file: holes by tool diameter, a G85 slot', () => {
  const r = read('samples', 'drawings', 'pcb-board.drl');
  const holes = r.drawing.entities.filter((e) => e.type === 'circle');
  assert.equal(holes.length, 10);
  assert.deepEqual([...new Set(holes.map((e) => e.r * 2))].sort((a, b) => a - b), [0.8, 1, 3.2]);
  const slot = r.drawing.entities.find((e) => e.type === 'rect');
  near(slot.width, 7, 1e-9); near(slot.height, 1, 1e-9);
  const b = boxOf([slot]);
  near((b.minX + b.maxX) / 2, 23, 1e-9, 'slot centred between its ends');
});

test('IGES: notes with delimiters in them, ellipses (104 + 124), NURBS, colours round trip', () => {
  const d = createDrawing({ title: 'iges' });
  addEntity(d, 'text', { x: 5, y: 5, text: 'Hello, IGES; 3H!', size: 5 });
  addEntity(d, 'ellipse', { cx: 10, cy: 20, rx: 30, ry: 10, angle: 30, start: 20, end: 200 });
  addEntity(d, 'spline', { degree: 3, points: [{ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 40, y: -10 }, { x: 60, y: 20 }], weights: [1, 2, 1, 1] });
  addEntity(d, 'rect', { x: 0, y: 0, width: 30, height: 20, color: '#123456' });
  const back = importIges(exportIges(d)).drawing.entities;
  assert.equal(back.find((e) => e.type === 'text').text, 'Hello, IGES; 3H!');
  const ellipse = back.find((e) => e.type === 'ellipse');
  near(ellipse.rx, 30, 1e-9); near(ellipse.angle, 30, 1e-9); near(ellipse.start, 20, 1e-9); near(ellipse.end, 200, 1e-9);
  const spline = back.find((e) => e.type === 'spline');
  assert.deepEqual(spline.weights, [1, 2, 1, 1]);
  const rect = back.find((e) => e.type === 'polyline');
  assert.equal(rect.closed, true);
  assert.equal(rect.color, '#123456', 'colour through a 314 entity');
});

test("MyCAD's own 2D exports (samples/exports) read back: same entities, same lengths", () => {
  for (const name of ['01-gear-pair', '02-flange', '04-bracket']) {
    const original = parseFile(fs.readFileSync(path.join(root, 'samples', `${name}.mcad`), 'utf8'));
    const reference = drawnLength(original.entities.filter((e) => e.type !== 'text'));
    for (const ext of ['r2000.dxf', 'igs', 'plt']) {
      const r = read('samples', 'exports', `${name}.${ext}`);
      assert.deepEqual(r.skipped, {}, `${name}.${ext}: ${JSON.stringify(r.skipped)}`);
      const length = drawnLength(r.drawing.entities.filter((e) => e.type !== 'text'));
      // HP-GL rounds to plotter units (0.025 mm); hatches are drawn as their pattern lines.
      assert.ok(Math.abs(length - reference) <= reference * 0.02, `${name}.${ext}: ${length.toFixed(2)} vs ${reference.toFixed(2)}`);
    }
    const svg = read('samples', 'exports', `${name}.svg`);
    assert.ok(svg.drawing.entities.length > 5, `${name}.svg`);
  }
});

test('HP-GL round trip keeps circles and arcs as circles and arcs', () => {
  const d = createDrawing({ title: 'plot' });
  addEntity(d, 'circle', { cx: 10, cy: 10, r: 5 });
  addEntity(d, 'arc', { cx: 0, cy: 0, r: 20, start: 10, end: 100 });
  const back = importHpgl(exportHpgl(d)).drawing.entities;
  assert.deepEqual(back.map((e) => e.type), ['circle', 'arc']);
  near(back[1].start, 10, 0.01); near(back[1].end, 100, 0.01);
});
