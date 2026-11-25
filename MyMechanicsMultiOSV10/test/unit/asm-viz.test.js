// Assembly visualization: components ranked by a value, coloured on a blue (low) … red (high) scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRows, scaleColour } from '../../src/app-asmviz.js';

test('the scale runs from blue to red through green', () => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r0, , b0] = rgb(scaleColour(0)); const [r1, , b1] = rgb(scaleColour(1)); const [, g5] = rgb(scaleColour(0.5));
  assert.ok(b0 > r0 && r1 > b1, `${scaleColour(0)} ${scaleColour(1)}`);
  assert.ok(g5 > 150, scaleColour(0.5));
});

test('rows sorted highest first (or lowest), the highest red, the lowest blue', () => {
  const rows = rankRows([{ id: 'a', value: 2 }, { id: 'b', value: 10 }, { id: 'c', value: 6 }]);
  assert.deepEqual(rows.map((r) => r.id), ['b', 'c', 'a']);
  assert.equal(rows[0].colour, scaleColour(1));
  assert.equal(rows[2].colour, scaleColour(0));
  assert.equal(rows[1].colour, scaleColour(0.5));
  assert.deepEqual(rankRows([{ id: 'a', value: 2 }, { id: 'b', value: 10 }], true).map((r) => r.id), ['a', 'b']);
  // All equal: every one at the top of the scale.
  assert.equal(rankRows([{ id: 'a', value: 3 }, { id: 'b', value: 3 }])[1].colour, scaleColour(1));
});
