import test from 'node:test';
import assert from 'node:assert/strict';
import { onProgress, emitProgress, newTaskId, isDesktop } from '../src/lib/platform.js';

test('progress listeners can be removed and task ids stay unique', () => {
  assert.equal(isDesktop, false);
  const seen = [];
  const off = onProgress((event) => seen.push(event));
  emitProgress({ id: 'a', ratio: 0.5 });
  off();
  emitProgress({ id: 'b', ratio: 1 });
  assert.deepEqual(seen, [{ id: 'a', ratio: 0.5 }]);
  const first = newTaskId();
  const second = newTaskId();
  assert.match(first, /^t[0-9a-z]+-\d+$/);
  assert.notEqual(first, second);
});
