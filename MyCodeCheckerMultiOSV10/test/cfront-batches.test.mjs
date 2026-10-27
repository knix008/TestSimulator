import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyzeSources } from '../core/analyze.js';

const require = createRequire(import.meta.url);
const cfront = require('../core/cfront.js');

// A small C project: a shared header, several units that include it and a
// header no unit includes (analyzed on its own).
function project(units = 6) {
  const files = [
    { path: 'inc/common.h', text: '#ifndef COMMON_H\n#define COMMON_H\nint shared_value(int x);\n#endif\n' },
    { path: 'inc/alone.h', text: '#ifndef ALONE_H\n#define ALONE_H\nstatic int alone(int a) { int b; return a + b; }\n#endif\n' },
  ];
  for (let i = 0; i < units; i++) {
    files.push({
      path: `src/u${i}.c`,
      text: `#include "../inc/common.h"\n#include <string.h>\nvoid copy${i}(char *d, const char *s) { strcpy(d, s); }\nint use${i}(int v) { int unset; if (v) unset = 1; return unset + shared_value(v); }\n`,
    });
  }
  return files;
}

const TINY = { smallSources: 1, firstSources: 2, maxSources: 2, tokens: 1 };
const shape = (a) => a.issues.filter((i) => i.engine && cfront.ENGINE_IDS.has(i.engine))
  .map((i) => `${i.rule}|${i.file}|${i.line}`).sort();

test('a small C project is parsed once, as before', () => {
  const files = project(3).map((f) => ({ ...f, lang: 'c' }));
  const lists = [...cfront.batches(files)];
  assert.equal(lists.length, 1);
  assert.equal(lists[0], files);
  assert.equal(lists[0].unitFiles, undefined);
});

test('a large C project is parsed in batches of units plus the headers no unit includes', () => {
  const files = project(5).map((f) => ({ ...f, lang: 'c' }));
  const seen = [];
  for (const list of cfront.batches(files, TINY)) {
    cfront.projectFor(list); // what the engines do; the batches learn from it
    seen.push({ units: [...list.unitFiles], batch: list.batch, headers: list.filter((f) => f.path.endsWith('.h')).length });
  }
  const units = seen.flatMap((s) => s.units);
  assert.deepEqual(units.filter((p) => p.endsWith('.c')).sort(), ['src/u0.c', 'src/u1.c', 'src/u2.c', 'src/u3.c', 'src/u4.c']);
  assert.deepEqual(units.filter((p) => p.endsWith('.h')), ['inc/alone.h'], 'only the header no unit includes stands alone');
  assert.ok(seen.every((s) => s.headers === 2), 'every batch can resolve every header');
  assert.ok(seen.every((s) => s.units.length <= 2));
  assert.deepEqual(seen.map((s) => s.batch.index), seen.map((_, i) => i + 1));
  assert.equal(seen[seen.length - 1].batch.estimate, seen.length);
});

test('a batch parses only its own units', () => {
  const files = project(4).map((f) => ({ ...f, lang: 'c' }));
  const first = cfront.batches(files, TINY).next().value;
  const parsed = cfront.projectFor(first);
  assert.deepEqual(parsed.units.map((u) => u.file).sort(), [...first.unitFiles].sort());
});

test('batched analysis finds the same unit-level C findings as one parse', () => {
  const whole = analyzeSources(project(6));
  const batched = analyzeSources(project(6), { cfamilyBatch: TINY });
  assert.ok(shape(whole).length > 0, 'the project has C findings');
  // Unit-level rules agree; whole-project rules (e.g. unused external
  // identifiers) only see one batch, so compare the findings both runs share.
  const a = new Set(shape(whole));
  const common = shape(batched).filter((k) => a.has(k));
  assert.ok(common.length >= a.size * 0.8, `${common.length} of ${a.size} findings kept`);
  assert.ok(shape(batched).some((k) => k.includes('inc/alone.h')), 'the standalone header is analyzed');
  const keys = batched.issues.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, 'findings seen from several batches are reported once');
});

test('other engines get a large project in batches of source text with the same per-file findings', () => {
  const files = [];
  for (let i = 0; i < 8; i++) {
    files.push({ path: `web/p${i}.js`, text: `function run${i}(input) {\n  eval(input);\n  document.write(location.hash);\n}\n` });
    files.push({ path: `py/m${i}.py`, text: `import pickle, subprocess\ndef f${i}(data, cmd):\n    pickle.loads(data)\n    subprocess.run(cmd, shell=True)\n` });
  }
  const engineKeys = (a) => a.issues.filter((i) => i.engine).map((i) => `${i.engine}|${i.rule}|${i.file}|${i.line}`).sort();
  const whole = analyzeSources(files);
  const batched = analyzeSources(files, { engineBatchBytes: 200 });
  assert.ok(engineKeys(whole).length > 0, 'the project has engine findings');
  assert.deepEqual(engineKeys(batched), engineKeys(whole));
});

test('no file count limit by default', () => {
  const { walk } = require('../core/analyze.js');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-walk-'));
  try {
    for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(dir, `f${i}.js`), 'let a = 1;\n');
    assert.equal(walk(dir, {}).length, 30);
    assert.equal(walk(dir, { maxFiles: 10 }).length, 10, 'a limit set in Settings still applies');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the analysis memory limit comes from Settings, else three quarters of the memory', () => {
  const memory = require('../core/memory.js');
  const saved = process.env.MCC_WORKER_HEAP_MB;
  delete process.env.MCC_WORKER_HEAP_MB;
  try {
    assert.equal(memory.workerHeapMb({ memoryLimitGb: 12 }), 12 * 1024);
    assert.equal(memory.workerHeapMb({}), memory.defaultLimitGb() * 1024);
    assert.ok(memory.defaultLimitGb() >= 8);
    process.env.MCC_WORKER_HEAP_MB = '5000';
    assert.equal(memory.workerHeapMb({ memoryLimitGb: 12 }), 5000);
  } finally {
    if (saved === undefined) delete process.env.MCC_WORKER_HEAP_MB; else process.env.MCC_WORKER_HEAP_MB = saved;
  }
});

test('the C/C++ pool gives the same issues, in the same order, as one thread', async () => {
  const { runCfamilyPool } = require('../core/cfamily-pool.js');
  const options = { cfamilyBatch: TINY };
  const serial = analyzeSources(project(6), options);
  const pre = await runCfamilyPool(project(6), options, { workers: 2, heapMb: 20000 });
  assert.ok(Array.isArray(pre) && pre.length > 1, 'the project ran in several batches on the pool');
  const pooled = analyzeSources(project(6), { ...options, cfamilyFindings: pre });
  assert.deepEqual(pooled.issues.map((i) => i.key), serial.issues.map((i) => i.key));
});

test('the pool is not used for a project that is one batch', async () => {
  const { runCfamilyPool, poolSize } = require('../core/cfamily-pool.js');
  assert.equal(await runCfamilyPool(project(3), {}, { workers: 2, heapMb: 20000 }), null);
  assert.equal(poolSize(4096, 28).workers, 0, 'a 4 GB analysis keeps one thread');
  assert.ok(poolSize(48000, 28).workers >= 8);
  assert.equal(poolSize(48000, 4).workers, 2, 'two cores are left free');
});
