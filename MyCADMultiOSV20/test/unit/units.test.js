// Display units: conversion, typed lengths with their own unit, coordinates,
// dimension text, grid spacing and the setting.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity, dimText } from '../../src/domain/entities.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { parseCoordinate } from '../../src/domain/snap.js';
import {
  displayUnit, evaluateLength, formatArea, formatLength, formatVolume, fromUnit, gridBaseFor, hasUnitSuffix, LENGTH_UNITS, lengthValue, setDisplayUnit, toUnit, unitLabel,
} from '../../src/domain/units.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('units: conversion both ways for every unit', () => {
  assert.deepEqual(LENGTH_UNITS, ['mm', 'cm', 'm', 'in', 'ft']);
  for (const unit of LENGTH_UNITS) near(fromUnit(toUnit(123.456, unit), unit), 123.456);
  near(toUnit(25.4, 'in'), 1);
  near(toUnit(304.8, 'ft'), 1);
  near(toUnit(1500, 'm'), 1.5);
  near(fromUnit(2.5, 'cm'), 25);
});

test('units: typed lengths convert automatically', () => {
  near(evaluateLength('10', 'mm'), 10);
  near(evaluateLength('10', 'cm'), 100);
  near(evaluateLength('1in', 'mm'), 25.4);
  near(evaluateLength('1in + 5', 'mm'), 30.4); // plain numbers are in the display unit
  near(evaluateLength('25.4mm', 'in'), 25.4);
  near(evaluateLength('2 m', 'mm'), 2000);
  near(evaluateLength('3 inches', 'cm'), 76.2);
  near(evaluateLength('5\'3"', 'mm'), 5 * 304.8 + 3 * 25.4);
  near(evaluateLength('2*3cm', 'mm'), 60);
  near(evaluateLength('1,5', 'cm'), 15); // decimal comma
  assert.ok(Number.isNaN(evaluateLength('abc', 'mm')));
  assert.ok(Number.isNaN(evaluateLength('', 'mm')));
  assert.equal(hasUnitSuffix('3in'), true);
  assert.equal(hasUnitSuffix('3*2'), false);
});

test('units: labels and formatting', () => {
  assert.equal(unitLabel('mm', 2), 'mm²');
  assert.equal(unitLabel('in', 3), 'in³');
  assert.equal(formatLength(25.4, 'in'), '1 in');
  assert.equal(formatLength(12.5, 'mm'), '12.5 mm');
  assert.equal(formatArea(100, 'cm'), '1 cm²');
  assert.equal(formatVolume(1e9, 'm'), '1 m³');
  assert.equal(lengthValue(1 / 3, 'mm'), '0.333');
  assert.equal(lengthValue(-0.00001, 'mm'), '0');
});

test('units: the display unit drives coordinates and dimension text', () => {
  try {
    assert.equal(setDisplayUnit('in'), true);
    assert.equal(displayUnit(), 'in');
    assert.deepEqual(parseCoordinate('1,2'), { x: 25.4, y: 50.8 });
    const p = parseCoordinate('@1in<0', { x: 0, y: 0 }, null, 'mm');
    near(p.x, 25.4);
    const q = parseCoordinate('10mm,1cm', null, null, 'in');
    near(q.x, 10); near(q.y, 10);
    const dim = createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 50.8, y2: 0, ox: 0, oy: 10, precision: 2 });
    assert.equal(dimText(dim), '2"');
    assert.equal(dimText(dim, 'mm'), '50.8');
    assert.equal(dimText(dim, 'cm'), '5.08');
    const angle = createEntity('dim', { kind: 'angle', cx: 0, cy: 0, r: 10, start: 0, end: 45, precision: 0 });
    assert.equal(dimText(angle), '45°'); // angles never convert
  } finally {
    setDisplayUnit('mm');
  }
  assert.equal(setDisplayUnit('nonsense'), false);
  assert.equal(displayUnit(), 'mm');
});

test('units: grid spacing falls on round values of the unit', () => {
  assert.equal(gridBaseFor(10, 'mm'), 10);
  near(gridBaseFor(10, 'cm'), 10);
  near(gridBaseFor(10, 'in'), 12.7); // 0.5 in
  near(gridBaseFor(25, 'in'), 25.4); // 1 in
  near(gridBaseFor(100, 'ft'), 0.5 * 304.8);
  near(gridBaseFor(10, 'm'), 10); // 0.01 m
});

test('units: the setting is validated', () => {
  assert.equal(normalizeSettings({}).units, 'mm');
  assert.equal(normalizeSettings({ units: 'in' }).units, 'in');
  assert.equal(normalizeSettings({ units: 'yard' }).units, 'mm');
});

test('file formats: the About list matches what opening and exporting really handle', async () => {
  const { FILE_FORMATS, MODEL_EXTENSIONS } = await import('../../src/domain/format.js');
  const { IMPORT_FORMATS, MESH_FORMATS } = await import('../../src/domain/exchange3d.js');
  const models = FILE_FORMATS.filter((format) => format.group === 'model');
  const extensions = models.flatMap((format) => format.extensions.map((ext) => ext.toLowerCase()));
  assert.deepEqual([...extensions].sort(), [...MODEL_EXTENSIONS].sort(), 'every 3D extension that opens is listed');
  assert.deepEqual([...extensions].sort(), [...IMPORT_FORMATS].sort(), 'and every one is read by the importer');
  for (const format of models) assert.ok(MESH_FORMATS.includes(format.id), `${format.id} is written by the exporter`);
  assert.equal(new Set(FILE_FORMATS.map((format) => format.id)).size, FILE_FORMATS.length);
  for (const format of FILE_FORMATS) assert.ok(format.read || format.write, format.id);
});

test('file formats: every 2D drawing extension that opens is listed in About', async () => {
  const { FILE_FORMATS } = await import('../../src/domain/format.js');
  const { DRAWING_EXTENSIONS } = await import('../../src/domain/import2d.js');
  const listed = FILE_FORMATS.filter((format) => format.group === 'drawing' && format.read && format.id !== 'mcad').flatMap((format) => format.extensions);
  assert.deepEqual([...listed].sort(), [...DRAWING_EXTENSIONS].sort());
});
