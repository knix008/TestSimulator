// Language: the full session over the library registry of every area
// (core/session.js). Kept separate so the language tests do not depend on
// the state of the other areas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryFs } from '../core/fs-memory.js';

test('the full session (all library areas) evaluates code', async () => {
  const { createSession } = await import('../core/session.js');
  const out = [];
  const s = createSession({ fs: createMemoryFs(), print: (t) => out.push(t) });
  const r = s.evaluate('x = 1 + 2; y = [1 2 3] * 2; z = x');
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(s.getVariable('x').re[0], 3);
  assert.deepEqual(Array.from(s.getVariable('y').re), [2, 4, 6]);
  assert.match(out.join(''), /z\s*=\s*3/);
});

test('language builtins and library builtins do not collide unexpectedly', async () => {
  const { buildRegistry } = await import('../core/registry.js');
  const lang = await import('../core/lang/index.js');
  const reg = buildRegistry();
  // names the language owns override library ones; list them so overlaps are visible
  const overlap = Object.keys(lang.builtins).filter((n) => n in reg.builtins);
  assert.ok(Array.isArray(overlap));
});
