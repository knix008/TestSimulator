// TechDraw annotations: balloons, GD&T feature control frames, datum symbols (styled leaders).
import assert from 'node:assert/strict';
import test from 'node:test';
import { datumList, GDT_SYMBOLS, gdtCells, gdtSymbol } from '../../src/domain/annotate.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { exportDxf2000 } from '../../src/domain/dxf2000.js';
import { createEntity, entityBox, primitives } from '../../src/domain/entities.js';
import { parseFile, serialize } from '../../src/domain/format.js';

const leader = (data) => createEntity('leader', { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], size: 3.5, ...data });

test('a leader keeps only the fields of its kind', () => {
  assert.equal(leader({ text: 'Note' }).style, undefined, 'a plain note is unchanged');
  const balloon = leader({ style: 'balloon', text: '7', shape: 'hexagon', symbol: 'flatness' });
  assert.deepEqual([balloon.style, balloon.shape, balloon.symbol], ['balloon', 'hexagon', undefined]);
  const frame = leader({ style: 'gdt', symbol: 'nonsense', modifier: 'X', datums: 'A|B' });
  assert.deepEqual([frame.symbol, frame.modifier, frame.diameter, frame.datums], ['position', 'none', false, 'A|B']);
});

test('a balloon is a circle with its number, touching the leader end, and a dot on the part', () => {
  const prims = primitives(leader({ style: 'balloon', text: '12' }));
  const ring = prims.find((p) => p.kind === 'circle');
  assert.ok(ring);
  // Its edge is at the leader end (20, 20).
  assert.ok(Math.abs(Math.hypot(ring.c.x - 20, ring.c.y - 20) - ring.r) < 1e-9);
  assert.equal(prims.find((p) => p.kind === 'text').text, '12');
  assert.ok(prims.some((p) => p.kind === 'fill' && Math.hypot(p.points[0].x - 0.875, p.points[0].y) < 1e-9), 'dot at the tip');
  for (const shape of ['hexagon', 'square', 'triangle']) assert.ok(primitives(leader({ style: 'balloon', text: '1', shape })).some((p) => p.kind === 'poly' && p.closed), shape);
});

test('a feature control frame has a cell per part and the datum letters', () => {
  const e = leader({ style: 'gdt', symbol: 'position', diameter: true, text: '0.05', modifier: 'M', datums: 'A|B|C' });
  assert.deepEqual(datumList(e.datums), ['A', 'B', 'C']);
  assert.deepEqual(datumList('a, b c d'), ['a', 'b', 'c']);
  const cells = gdtCells(e);
  assert.equal(cells.length, 5);
  const prims = primitives(e);
  const frame = prims.find((p) => p.kind === 'poly' && p.closed);
  const width = frame.points[1].x - frame.points[0].x;
  assert.ok(Math.abs(width - cells.reduce((a, b) => a + b, 0)) < 1e-9);
  assert.equal(frame.points[0].x, 20, 'the frame starts at the leader end');
  assert.deepEqual(prims.filter((p) => p.kind === 'text').map((p) => p.text), ['0.05', 'M', 'A', 'B', 'C']);
  // Every characteristic draws something inside its cell.
  for (const symbol of GDT_SYMBOLS) {
    const parts = gdtSymbol(symbol, { x: 0, y: 0 }, 4);
    assert.ok(parts.length > 0, symbol);
  }
  // A frame to the left of the bend grows to the left.
  const left = primitives(leader({ style: 'gdt', points: [{ x: 0, y: 0 }, { x: -20, y: 20 }], text: '0.1' })).find((p) => p.kind === 'poly' && p.closed);
  assert.ok(Math.abs(Math.max(...left.points.map((p) => p.x)) + 20) < 1e-9);
});

test('a datum symbol stands a filled triangle on the face and boxes its letter', () => {
  const prims = primitives(leader({ style: 'datum', text: 'A', points: [{ x: 0, y: 0 }, { x: 0, y: -15 }] }));
  const triangle = prims.find((p) => p.kind === 'fill');
  assert.equal(triangle.points.length, 3);
  assert.ok(triangle.points.slice(0, 2).every((p) => Math.abs(p.y) < 1e-9), 'its base is on the face');
  assert.ok(prims.some((p) => p.kind === 'poly' && p.closed));
  assert.equal(prims.find((p) => p.kind === 'text').text, 'A');
  assert.ok(entityBox(createEntity('leader', { points: [{ x: 0, y: 0 }, { x: 0, y: -15 }], style: 'datum', text: 'A' })).minY < -15);
});

test('annotations are saved and drawn into DXF', () => {
  const d = createDrawing();
  addEntity(d, 'leader', { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], style: 'balloon', text: '3' });
  addEntity(d, 'leader', { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], style: 'gdt', symbol: 'flatness', text: '0.02', datums: 'A' });
  const back = parseFile(serialize(d));
  const again = (back.drawing ?? back).entities;
  assert.deepEqual(again.map((e) => e.style), ['balloon', 'gdt']);
  assert.equal(again[1].symbol, 'flatness');
  const dxf = exportDxf2000(d);
  assert.match(dxf, /\nCIRCLE\r?\n/);
  assert.ok((dxf.match(/\nLWPOLYLINE\r?\n/g) ?? []).length >= 3);
  assert.match(dxf, /0\.02/);
});
