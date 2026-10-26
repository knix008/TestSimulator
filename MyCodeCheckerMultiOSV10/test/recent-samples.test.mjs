// Recent projects (10 kept, remove one, clear) and the sample gallery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('recent keeps the 10 newest, without duplicates, and can be cleared', async () => {
  const api = createApi({ configDir: tmp('mcc-rc-') });
  const folders = [];
  for (let i = 0; i < 12; i++) {
    const d = tmp(`mcc-rc-src${i}-`);
    fs.writeFileSync(path.join(d, 'a.js'), `const v${i} = ${i};\nexport default v${i};\n`);
    folders.push(d);
    await api.call('project.scan', { path: d });
  }
  await api.call('project.scan', { path: folders[3] });
  const list = await api.call('recent.list');
  assert.equal(list.length, 10);
  assert.equal(list[0].path, folders[3], 'a re-opened project moves to the top');
  assert.equal(new Set(list.map((e) => e.path)).size, 10);
  assert.ok(list.every((e) => e.kind === 'folder' && e.exists && e.analyzed));
  const after = await api.call('recent.remove', { path: folders[3] });
  assert.equal(after.length, 9);
  assert.ok(!after.some((e) => e.path === folders[3]));
  fs.rmSync(folders[11], { recursive: true, force: true });
  assert.equal((await api.call('recent.list')).find((e) => e.path === folders[11]).exists, false, 'missing folders are flagged');
  assert.deepEqual(await api.call('recent.clear'), []);
  assert.deepEqual(await api.call('recent.list'), []);
});

test('project files appear in recent as files', async () => {
  const api = createApi({ configDir: tmp('mcc-rc2-') });
  const d = tmp('mcc-rc-proj-');
  fs.writeFileSync(path.join(d, 'a.js'), 'eval(x);\n');
  const made = await api.call('project.create', { name: 'P', source: d });
  const list = await api.call('recent.list');
  assert.equal(list[0].kind, 'file');
  assert.equal(list[0].path, made.file);
});

test('the sample gallery lists the demo and the C++ sample, and opens them', async () => {
  const api = createApi({ configDir: tmp('mcc-sm-') });
  const samples = await api.call('samples.list');
  const cpp = samples.find((s) => s.id === 'cpp-sensor');
  assert.ok(cpp && cpp.projectFile && cpp.languages.cpp >= 4);
  assert.ok(samples.some((s) => s.id === 'demo'));
  const opened = await api.call('samples.open', { id: 'cpp-sensor' });
  const issues = opened.scan.analysis.issues;
  for (const checker of ['DELETE_ARRAY', 'USE_AFTER_FREE', 'OVERFLOW_BEFORE_WIDEN', 'FORWARD_NULL', 'OVERRUN', 'OS_CMD_INJECTION']) {
    assert.ok(issues.some((i) => i.checker === checker), checker);
  }
  assert.ok(!issues.some((i) => i.rule === 'defect:UNREACHABLE' || (i.rule === 'defect:UNINIT' && /g_errors/.test(JSON.stringify(i.message)))), 'no line-pass false positives');
  await assert.rejects(api.call('samples.open', { id: 'nope' }), (e) => e.code === 'NOT_FOUND');
});
