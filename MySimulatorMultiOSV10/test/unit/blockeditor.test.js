// The block editor's text ↔ diagram conversion (src/ui/blockeditor.js) keeps the model the engine reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram, writeDiagram, readsOf } from '../../src/ui/blockeditor.js';

test('a diagram survives the round trip through the editor model', () => {
  const text = '# cruise\nr = step(t0 = 1, a = 25)\ne = r - v\nf = pid(e, kp = 800, ki = 40, umin = -4000, umax = 4000)\nv = integrator((f - 0.4*v^2)/1200, x0 = 20)';
  const model = parseDiagram(text);
  assert.deepEqual(model.blocks.map((b) => b.kind), ['step', 'expr', 'pid', 'integrator']);
  assert.equal(model.blocks[2].input, 'e');
  assert.equal(model.blocks[2].params.umax, '4000');
  assert.deepEqual(readsOf(model.blocks[3].input), ['f', 'v']);
  const again = parseDiagram(writeDiagram(model));
  assert.deepEqual(again.blocks.map(({ name, kind, input, params }) => ({ name, kind, input, params })), model.blocks.map(({ name, kind, input, params }) => ({ name, kind, input, params })));
  assert.equal(again.comments[0], '# cruise');
  // Places are kept in the layout comment.
  model.blocks[0].x = 400;
  assert.equal(parseDiagram(writeDiagram(model)).blocks[0].x, 400);
});

test('functions and constants are not ports', () => {
  assert.deepEqual(readsOf('sin(2*pi*t) + k*x - max(a, b)'), ['k', 'x', 'a', 'b']);
});
