// DXF import/export, SVG export and the .mcad file format.
import assert from 'node:assert/strict';
import test from 'node:test';
import { entitiesFromClipboard, entitiesToClipboard } from '../../src/domain/clipboard.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import {
  aciToHex, bulgePoints, decodeDxfText, encodeDxfText, exportDxf, hexToAci, importDxf, lineTypeFromDxf, looksLikeDxf, mtextPlain, tokenize,
} from '../../src/domain/dxf.js';
import { createEntity } from '../../src/domain/entities.js';
import { evaluate } from '../../src/domain/expr.js';
import {
  baseName, directoryOf, extensionOf, FormatError, isDrawingFileName, isDxfFileName, isImageFileName, isTextFileName, parseFile, safeFileName, serialize, stripExtension, withExtension,
} from '../../src/domain/format.js';
import { exportSvg, previewSvg } from '../../src/domain/svg.js';
import { generatePart } from '../../src/domain/parts.js';

function sample() {
  const drawing = createDrawing({ title: '샘플 Sample' });
  addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 100, y2: 0 });
  addEntity(drawing, 'circle', { cx: 50, cy: 50, r: 20, color: '#ff0000' });
  addEntity(drawing, 'arc', { cx: 0, cy: 0, r: 30, start: 0, end: 90, layer: 'hidden' });
  addEntity(drawing, 'polyline', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true });
  addEntity(drawing, 'text', { x: 5, y: 5, text: '한글 Ø25 ±0.1 20°', size: 3.5, layer: 'text' });
  addEntity(drawing, 'dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 100, y2: 0, ox: 50, oy: -15, size: 3.5, layer: 'dim' });
  addEntity(drawing, 'part', { kind: 'washer', x: 150, y: 0 });
  return drawing;
}

test('DXF export is R12 with tables and entities, and reads back', () => {
  const drawing = sample();
  const dxf = exportDxf(drawing);
  assert.ok(looksLikeDxf(dxf));
  for (const part of ['AC1009', '$INSUNITS', 'LTYPE', 'CENTER', 'LAYER', 'LINE', 'CIRCLE', 'ARC', 'POLYLINE', 'VERTEX', 'SEQEND', 'TEXT', 'SOLID', 'EOF']) assert.ok(dxf.includes(`\n${part}\n`) || dxf.includes(part), part);
  const back = importDxf(dxf, { title: 'back' });
  assert.deepEqual(back.skipped, {});
  const types = back.drawing.entities.map((entity) => entity.type);
  assert.ok(types.includes('line') && types.includes('circle') && types.includes('arc') && types.includes('polyline') && types.includes('text'));
  const text = back.drawing.entities.find((entity) => entity.type === 'text' && entity.text.startsWith('한글'));
  assert.equal(text.text, '한글 Ø25 ±0.1 20°', 'Unicode, Ø, ± and ° survive');
  const red = back.drawing.entities.find((entity) => entity.type === 'circle' && entity.r === 20);
  assert.equal(red.color, '#ff0000');
  assert.ok(back.drawing.layers.some((layer) => layer.name === drawing.layers[2].name && layer.lineType === 'hidden'));
});

test('DXF import: LWPOLYLINE bulges, MTEXT, ELLIPSE, blocks, units and unknown entities', () => {
  const dxf = [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'Parts', '70', '4', '62', '-3', '6', 'DASHED', '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'HOLE', '10', '0', '20', '0', '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', '1', '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'Parts', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '2', '20', '0',
    '0', 'MTEXT', '8', '0', '10', '0', '20', '10', '40', '0.5', '1', '{\\fArial;첫 줄\\P둘째}',
    '0', 'ELLIPSE', '8', '0', '10', '5', '20', '5', '30', '0', '11', '2', '21', '0', '31', '0', '40', '0.5', '41', '0', '42', '6.283185307',
    '0', 'INSERT', '8', '0', '2', 'HOLE', '10', '10', '20', '0', '41', '2', '42', '2', '50', '0',
    '0', '3DSOLID', '8', '0',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n');
  const { drawing, skipped, units } = importDxf(dxf);
  assert.equal(units, 1, 'inches');
  assert.deepEqual(skipped, { '3DSOLID': 1 });
  const layer = drawing.layers.find((item) => item.name === 'Parts');
  assert.equal(layer.visible, false, 'negative colour = off');
  assert.equal(layer.locked, true);
  assert.equal(layer.lineType, 'dashed');
  const poly = drawing.entities.find((entity) => entity.type === 'polyline');
  assert.ok(poly.points.length > 3, 'the bulge became an arc');
  const lowest = Math.min(...poly.points.map((p) => p.y));
  assert.ok(Math.abs(lowest + 25.4) < 0.5, `semicircle below the chord, inches → mm (${lowest})`);
  const text = drawing.entities.find((entity) => entity.type === 'text');
  assert.equal(text.text, '첫 줄\n둘째');
  const ellipse = drawing.entities.find((entity) => entity.type === 'ellipse');
  assert.ok(Math.abs(ellipse.rx - 50.8) < 1e-6 && Math.abs(ellipse.ry - 25.4) < 1e-6);
  const hole = drawing.entities.find((entity) => entity.type === 'circle');
  assert.ok(Math.abs(hole.r - 50.8) < 1e-6, 'block scaled ×2, inches');
  assert.ok(Math.abs(hole.cx - 254) < 1e-6);
});

test('DXF helpers: colours, line types, text codes, tokens', () => {
  assert.equal(aciToHex(1), '#ff0000');
  assert.equal(aciToHex(7), 'auto');
  assert.match(aciToHex(30), /^#[0-9a-f]{6}$/);
  assert.equal(aciToHex(250).length, 7);
  assert.equal(hexToAci('#ff0000'), 1);
  assert.equal(hexToAci('#0000fe'), 5);
  assert.equal(hexToAci('auto'), 7);
  assert.equal(lineTypeFromDxf('CENTER2'), 'center');
  assert.equal(lineTypeFromDxf('BYLAYER'), null);
  assert.equal(lineTypeFromDxf('ACAD_ISO02W100'), 'continuous');
  assert.equal(decodeDxfText(encodeDxfText('가 Ø ° ±')), '가 Ø ° ±');
  assert.equal(encodeDxfText('가'), '\\U+AC00');
  assert.equal(mtextPlain('\\A1;{\\H2.5;x\\Py}'), 'x\ny');
  assert.throws(() => tokenize('abc\nLINE\n'));
  const square = bulgePoints([{ x: 0, y: 0, bulge: 0 }, { x: 1, y: 0, bulge: 0 }], false);
  assert.equal(square.length, 2);
});

test('SVG export: true size in mm, every entity drawn, texts escaped', () => {
  const drawing = sample();
  addEntity(drawing, 'text', { x: 0, y: -40, text: '<A & B>', size: 3 });
  const svg = exportSvg(drawing, { fonts: { family: 'Malgun Gothic' } });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /width="[\d.]+mm" height="[\d.]+mm"/);
  assert.ok(svg.includes('&lt;A &amp; B&gt;'));
  assert.ok(svg.includes('<circle') && svg.includes('<line') && svg.includes('<path') && svg.includes('<polygon') && svg.includes('<text'));
  assert.ok(svg.includes('stroke-dasharray'), 'hidden lines are dashed');
  assert.ok(svg.includes('font-family="Malgun Gothic"'));
  assert.ok(svg.includes('stroke="#ff0000"'), 'own colour');
  const preview = previewSvg(generatePart('gear', {}), { width: 200, height: 150 });
  assert.match(preview, /<svg[^>]+width="200"/);
});

test('.mcad files: round trip, BOM, errors with codes', () => {
  const drawing = sample();
  const text = serialize(drawing);
  const back = parseFile(text);
  assert.equal(back.title, drawing.title);
  assert.equal(back.entities.length, drawing.entities.length);
  assert.deepEqual(back.entities.map((entity) => entity.id), drawing.entities.map((entity) => entity.id));
  assert.equal(parseFile(`\uFEFF${text}`).title, drawing.title);
  const code = (fn) => { try { fn(); return null; } catch (error) { assert.ok(error instanceof FormatError); return error.code; } };
  assert.equal(code(() => parseFile('{nope')), 'format.invalidJson');
  assert.equal(code(() => parseFile('{"format":"other"}')), 'format.otherFormat');
  assert.equal(code(() => parseFile('{"format":"mycad","version":99,"drawing":{}}')), 'format.newerVersion');
  assert.equal(code(() => parseFile('42')), 'format.notDrawing');
  assert.equal(parseFile(JSON.stringify({ entities: [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }] })).entities.length, 1, 'a bare drawing object is accepted');
});

test('file name helpers', () => {
  assert.equal(baseName('C:\\a\\b\\gear.mcad'), 'gear.mcad');
  assert.equal(directoryOf('/home/u/gear.mcad'), '/home/u');
  assert.equal(stripExtension('gear.mcad'), 'gear');
  assert.equal(extensionOf('X.DXF'), 'dxf');
  assert.equal(withExtension('C:/a/gear'), 'C:/a/gear.mcad');
  assert.equal(withExtension('C:/a/gear.mcad'), 'C:/a/gear.mcad');
  assert.ok(isDrawingFileName('a.MCAD') && isDxfFileName('b.dxf') && isImageFileName('c.png') && isTextFileName('d.txt'));
  assert.ok(!isDrawingFileName('a.dxf'));
  assert.equal(safeFileName('a/b:c*'), 'a_b_c_');
  assert.equal(safeFileName('  '), 'drawing');
});

test('clipboard: MyCAD copies are recognised, other text is not', () => {
  const entities = [createEntity('line', { x1: 0, y1: 0, x2: 1, y2: 0, layer: 'center' }), createEntity('circle', { cx: 0, cy: 0, r: 2 })];
  const drawing = createDrawing();
  const text = entitiesToClipboard(entities, drawing.layers);
  const back = entitiesFromClipboard(text);
  assert.equal(back.entities.length, 2);
  assert.deepEqual(back.layers.map((layer) => layer.id).sort(), ['0', 'center']);
  assert.equal(entitiesFromClipboard('hello'), null);
  assert.equal(entitiesFromClipboard('MyCAD-Clipboard/1\n{broken'), null);
});

test('number fields accept expressions', () => {
  assert.equal(evaluate('25.4*2'), 50.8);
  assert.equal(evaluate('(100 - 12) / 2'), 44);
  assert.equal(evaluate('2^3'), 8);
  assert.equal(evaluate('-3+5'), 2);
  assert.ok(Math.abs(evaluate('sqrt(2)*10') - 14.142135623730951) < 1e-12);
  assert.ok(Math.abs(evaluate('pi*2') - Math.PI * 2) < 1e-12);
  assert.ok(Math.abs(evaluate('sin(30)') - 0.5) < 1e-12, 'trigonometry in degrees');
  assert.equal(evaluate('1,5'), 1.5, 'decimal comma');
  for (const bad of ['', 'abc', '2*', '(1', '1/0', 'alert(1)']) assert.ok(Number.isNaN(evaluate(bad)), bad);
});
