// Unit tests of the IDF 3.0 (ECAD) import (node --test test/unit/idf.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { idfToModel, parseIdfLibrary } from '../../src/core/idf.js';
import { checkModel, bodyBounds } from '../../src/core/model.js';

const board = fs.readFileSync(new URL('../../samples/formats/controller-board.emn', import.meta.url), 'utf8');
const library = fs.readFileSync(new URL('../../samples/formats/controller-board.emp', import.meta.url), 'utf8');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('IDF library: outlines, heights in mm, properties, a full circle', () => {
  const parts = parseIdfLibrary(library);
  assert.equal(parts.size, 4);
  const mcu = parts.get('QFP64|MCU-STM32');
  near(mcu.height, 60 * 0.0254, 1e-12, 'height in mm');
  assert.equal(mcu.outline.length, 4, 'closing point dropped');
  assert.equal(mcu.props.POWER_OPR, 0.8);
  const cap = parts.get('CAP-RADIAL|CAP-470U');
  near(cap.circle.r, 160 * 0.0254, 1e-12, 'circle radius');
});

test('IDF board: board slab, components above and below, powers, convection', () => {
  const { model, warnings } = idfToModel(board, library, { language: 'en' });
  assert.equal(model.domain.dim, 3);
  assert.equal(model.bodies.length, 5);
  const [pcb, ...parts] = model.bodies;
  near(pcb.z1 - pcb.z0, 62 * 0.0254, 1e-9, 'board thickness');
  assert.equal(pcb.shape, 'polygon', 'board with a rounded corner is a polygon');
  const u1 = parts.find((b) => b.name === 'U1');
  assert.equal(u1.shape, 'rect');
  near(u1.w, 800 * 0.0254, 1e-6, 'U1 width');
  near(u1.z0, pcb.z1, 1e-9, 'top part sits on the board');
  const u2 = parts.find((b) => b.name === 'U2');
  near(u2.w, 160 * 0.0254, 1e-6, 'U2 rotated 90°: x size is its y size');
  const q1 = parts.find((b) => b.name === 'Q1');
  near(q1.z1, pcb.z0, 1e-9, 'bottom part hangs under the board');
  // Bottom parts are mirrored in x: the outline -100…200 thou becomes -200…100 around x = 1000 thou.
  const bb = bodyBounds(q1);
  near(bb.x1 - bb.x0, 300 * 0.0254, 1e-6, 'Q1 width');
  near((bb.x0 + bb.x1) / 2 - (bodyBounds(u1).x0 + bodyBounds(u1).x1) / 2, -50 * 0.0254, 1e-6, 'Q1 mirrored about its origin');
  assert.equal(parts.find((b) => b.name === 'C1').shape, 'circle');
  near(model.bodies.reduce((s, b) => s + b.power, 0), 0.8 + 2.5 + 0.05 + 1.2, 1e-9, 'POWER_OPR');
  assert.ok(model.bodies.every((b) => b.z0 >= 0 && b.z1 <= model.domain.depth), 'all bodies inside the domain');
  assert.equal(model.boundaries[0].type, 'convection');
  assert.ok(!checkModel(model).some((i) => i.level === 'error'), 'model check passes');
  assert.deepEqual(warnings, []);
});

test('IDF board without a library: placements left out with a warning', () => {
  const { model, warnings } = idfToModel(board, '', { language: 'en' });
  assert.equal(model.bodies.length, 1);
  assert.ok(warnings.some((w) => /no outline in the library/.test(w)));
});

test('not an IDF file', () => {
  assert.throws(() => idfToModel('hello', ''), /IDF board file/);
});
