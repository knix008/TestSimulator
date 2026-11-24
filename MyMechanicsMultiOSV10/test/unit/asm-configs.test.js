// Assembly configurations: each keeps its components' suppression / visibility / part configuration and its
// mates' use and values; switching stores the one being left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureState, switchAssemblyConfig, addAssemblyConfig, removeAssemblyConfig, activeAssemblyConfig } from '../../src/cad/asm-configs.js';

const asmOf = () => ({ id: 'A', components: [{ id: 'a', part: 'p' }, { id: 'b', part: 'p' }, { id: 'c', part: 'q' }], mates: [{ id: 'm1', type: 'distance', value: 10 }, { id: 'm2', type: 'coincident' }] });

test('a new configuration starts as the current state; changes stay in it; the default keeps its own', () => {
  const asm = asmOf();
  const long = addAssemblyConfig(asm, 'Long');
  assert.equal(activeAssemblyConfig(asm).name, 'Long');
  asm.components[1].suppressed = true; asm.components[2].config = 'cfgBig'; asm.mates[0].value = 40; asm.mates[1].suppressed = true;
  switchAssemblyConfig(asm, '');
  assert.equal(asm.config, undefined);
  assert.equal(asm.components[1].suppressed, undefined);
  assert.equal(asm.components[2].config, undefined);
  assert.equal(asm.mates[0].value, 10);
  assert.equal(asm.mates[1].suppressed, undefined);
  switchAssemblyConfig(asm, long.id);
  assert.equal(asm.components[1].suppressed, true);
  assert.equal(asm.components[2].config, 'cfgBig');
  assert.equal(asm.mates[0].value, 40);
  assert.equal(asm.mates[1].suppressed, true);
});

test('removing the active configuration goes back to the default; capture lists every component and mate', () => {
  const asm = asmOf();
  const c = addAssemblyConfig(asm, 'X');
  asm.components[0].hidden = true;
  removeAssemblyConfig(asm, c.id);
  assert.equal(asm.config, undefined);
  assert.equal(asm.components[0].hidden, undefined);
  assert.deepEqual(Object.keys(captureState(asm).comps), ['a', 'b', 'c']);
  assert.deepEqual(Object.keys(captureState(asm).mates), ['m1', 'm2']);
});
