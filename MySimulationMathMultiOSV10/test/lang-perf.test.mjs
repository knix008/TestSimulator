// Language: performance of scalar loops, indexed assignment, growth, function
// calls and struct/cell updates (time budgets are generous for slow machines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session(files = {}) {
  const s = createSessionWith(null, { fs: createMemoryFs(files), print: () => {} });
  return {
    s,
    time(code) { const t0 = performance.now(); const r = s.evaluate(code); const ms = performance.now() - t0; if (!r.ok) throw new Error(r.error.message); return ms; },
    v(name) { const v = s.getVariable(name); return v.re.length === 1 ? v.re[0] : Array.from(v.re); },
  };
}

test('1e6 scalar loop iterations run in a few seconds', () => {
  const h = session();
  const ms = h.time('s = 0; for i = 1:1000000, s = s + i * 2 - 1; end');
  assert.equal(h.v('s'), 1e12);
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});

test('while loop with conditions and scalar indexing', () => {
  const h = session();
  const ms = h.time('v = 1:1000; k = 0; j = 0; t = 0; while k < 500000, k = k + 1; j = j + 1; if j > 1000, j = 1; end; t = t + v(j); end');
  assert.equal(h.v('t'), 250250000);
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});

test('indexed assignment and growth stay linear', () => {
  const h = session();
  const ms1 = h.time('x = []; for i = 1:200000, x(i) = i; end');
  assert.equal(h.v('x').length, 200000);
  const ms2 = h.time('y = []; for i = 1:200000, y(end+1) = i; end');
  const ms3 = h.time('c = {}; for i = 1:100000, c{end+1} = i; end');
  const ms4 = h.time('s.data = []; for i = 1:100000, s.data(i) = i; end');
  assert.ok(ms1 < 2000 && ms2 < 2000 && ms3 < 2000 && ms4 < 2000, `${ms1.toFixed(0)} / ${ms2.toFixed(0)} / ${ms3.toFixed(0)} / ${ms4.toFixed(0)} ms`);
});

test('user function calls in a loop', () => {
  const h = session({ '/home/sq.m': 'function y = sq(x)\ny = x * x;\nend\n' });
  const ms = h.time('t = 0; for i = 1:100000, t = t + sq(i); end');
  assert.equal(h.v('t'), 333338333350000);
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});

test('anonymous function calls in a loop', () => {
  const h = session();
  const ms = h.time('f = @(x) x + 1; t = 0; for i = 1:200000, t = f(t); end');
  assert.equal(h.v('t'), 200000);
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});
