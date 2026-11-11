/* node --test — the step rule behind the −/+ buttons of number fields and sliders (src/js/spin.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { stepped } = require('../src/js/spin.js');

const field = (o) => ({ type: 'number', min: '', max: '', step: '', value: '', ...o });

test('no step attribute steps by 1, on sliders too (HTML default)', () => {
  assert.equal(stepped(field({ type: 'range', min: '0', max: '9', value: '0' }), 1), 1);
  assert.equal(stepped(field({ value: '10', min: '1', max: '120' }), -1), 9);
});

test('min / max hold, decimals stay clean, empty fields start from min (or 0)', () => {
  assert.equal(stepped(field({ value: '120', max: '120' }), 1), 120);
  assert.equal(stepped(field({ value: '1', min: '1' }), -1), 1);
  assert.equal(stepped(field({ value: '0.3', step: '0.1' }), 1), 0.4);
  assert.equal(stepped(field({ value: '', min: '5' }), 1), 6);
  assert.equal(stepped(field({ value: '' }), -1), -1);
});

test('values off the step grid snap onto it; "any" on a slider is 1/100 of its range', () => {
  assert.equal(stepped(field({ value: '7', step: '5', min: '0' }), 1), 10);
  assert.equal(stepped(field({ type: 'range', step: 'any', min: '0', max: '2', value: '1' }), 1), 1.02);
});
