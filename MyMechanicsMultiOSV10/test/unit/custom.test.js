import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboOf, effectiveBindings, gestureSector, drawingTemplateOf, applyDrawingTemplate, loadTemplates, storeTemplates } from '../../src/app-custom.js';

test('comboOf: modifiers in order, letters and digits by their key, named keys', () => {
  assert.equal(comboOf({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+K');
  assert.equal(comboOf({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+1');
  assert.equal(comboOf({ key: 'F5', code: 'F5', altKey: true }), 'Alt+F5');
  assert.equal(comboOf({ key: ' ', code: 'Space' }), 'Space');
  assert.equal(comboOf({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true }), 'Ctrl+Left');
  assert.equal(comboOf({ key: ',', code: 'Comma', ctrlKey: true }), 'Ctrl+,');
  assert.equal(comboOf({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), null);
  assert.equal(comboOf({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), null);
});

test('effectiveBindings: defaults, a key moved to another command, a default turned off, a new one', () => {
  const defaults = [['Ctrl+S', 'save'], ['Ctrl+B', 'rebuild'], ['Ctrl+Shift+1', 'leftPanel'], ['Ctrl+Shift+1', 'leftPanel']];
  const { byCommand, byCombo } = effectiveBindings(defaults, { 'Ctrl+B': null, 'Ctrl+S': 'saveAs', 'Alt+M': 'measure' });
  assert.equal(byCombo.get('Ctrl+B'), undefined);
  assert.equal(byCombo.get('Ctrl+S'), 'saveAs');
  assert.deepEqual(byCommand.get('measure'), ['Alt+M']);
  assert.equal(byCommand.get('save'), undefined);
  assert.deepEqual(byCommand.get('leftPanel'), ['Ctrl+Shift+1']);
});

test('gestureSector: eight directions counter-clockwise from the right (screen y down)', () => {
  const at = (deg) => gestureSector(Math.cos((deg * Math.PI) / 180) * 100, -Math.sin((deg * Math.PI) / 180) * 100);
  assert.deepEqual([0, 45, 90, 135, 180, 225, 270, 315].map(at), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(at(20), 0); assert.equal(at(25), 1); assert.equal(at(-20), 0); assert.equal(at(340), 0);
});

test('drawing templates keep the sheet, settings, title block and standard views — not the model', () => {
  const d = {
    id: 'd1', name: 'Bracket - Sheet1', source: { kind: 'part', id: 'p1' }, sheet: 'A2', projection: 'first', scale: 0.5, autoScale: false, showHidden: false,
    title: { company: 'ACME', drawnBy: 'Kim', partNo: 'BR-1', date: '2026-01-01', revision: 'C' }, notes: [{ id: 'n', text: 'Deburr' }], layers: [{ id: 'L1', name: 'Dims' }],
    views: [{ id: 'v-front', type: 'front', x: 100, y: 80 }, { id: 'v-sec', type: 'section', of: 'v-front', line: [[0, 0], [1, 1]] }, { id: 'v-iso', type: 'iso', hidden: true }],
    annotations: [{ id: 'a', kind: 'dim', ref: 'edge:5' }],
  };
  const tpl = drawingTemplateOf(d);
  assert.equal(tpl.sheet, 'A2'); assert.equal(tpl.projection, 'first'); assert.equal(tpl.scale, 0.5);
  assert.deepEqual(tpl.title, { company: 'ACME', drawnBy: 'Kim', revision: 'C' });
  assert.deepEqual(tpl.views.map((v) => v.type), ['front', 'iso']);
  assert.equal(tpl.annotations, undefined); assert.equal(tpl.source, undefined);
  const fresh = { id: 'd2', name: 'X', source: { kind: 'part', id: 'p9' }, sheet: 'A3', title: { company: '', partNo: 'X-9', date: '2026-11-25' }, views: [{ id: 'v-top', type: 'top' }], annotations: [] };
  applyDrawingTemplate(fresh, tpl);
  assert.equal(fresh.sheet, 'A2'); assert.equal(fresh.source.id, 'p9');
  assert.deepEqual(fresh.title, { company: 'ACME', partNo: 'X-9', date: '2026-11-25', drawnBy: 'Kim', revision: 'C' });
  assert.deepEqual(fresh.views, [{ id: 'v-front', type: 'front', x: 100, y: 80 }, { id: 'v-iso', type: 'iso', hidden: true }]);
  // A copy: changing the template later does not reach the drawing.
  tpl.notes[0].text = 'changed';
  assert.equal(fresh.notes[0].text, 'Deburr');
});

test('templates in storage: kept, read back, junk ignored', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadTemplates(storage), []);
  storeTemplates([{ id: 't1', name: 'A', kind: 'part', text: '{}' }, { name: 'no id' }], storage);
  assert.deepEqual(loadTemplates(storage).map((x) => x.id), ['t1']);
  mem.set('mymechanics.templates', 'not json');
  assert.deepEqual(loadTemplates(storage), []);
});
