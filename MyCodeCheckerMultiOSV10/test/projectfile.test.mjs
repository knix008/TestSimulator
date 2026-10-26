// Project files (*.mccp): create, open, save, relative source paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pf = require('../core/projectfile.js');
const { createApi } = require('../core/api.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function sourceTree() {
  const dir = tmp('mcc-pf-src-');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'gen'));
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'eval(input);\n');
  fs.writeFileSync(path.join(dir, 'gen', 'b.js'), 'eval(other);\n');
  return dir;
}

test('the file keeps the source relative when it sits in the same tree', () => {
  const dir = sourceTree();
  const { file, doc } = pf.writeProjectFile(path.join(dir, 'demo'), { name: 'Demo App', source: dir, settings: { exclusions: ['gen/**'], ignored: 1 } });
  assert.ok(file.endsWith('demo.mccp'));
  assert.equal(doc.source, '.');
  assert.equal(doc.key, 'demo-app');
  assert.deepEqual(doc.settings, { exclusions: ['gen/**'] }, 'only project settings are stored');
  const outside = pf.writeProjectFile(path.join(tmp('mcc-pf-elsewhere-'), 'x.mccp'), { name: 'X', source: dir });
  assert.ok(path.isAbsolute(outside.doc.source));
  assert.throws(() => pf.writeProjectFile(file, { name: 'again', source: dir }), (e) => e.code === 'EXISTS');
});

test('reading rejects other files and newer formats', () => {
  const dir = tmp('mcc-pf-bad-');
  fs.writeFileSync(path.join(dir, 'a.mccp'), '{"hello":1}');
  assert.throws(() => pf.readProjectFile(path.join(dir, 'a.mccp')), (e) => e.code === 'BAD_PROJECT');
  fs.writeFileSync(path.join(dir, 'b.mccp'), JSON.stringify({ format: pf.FORMAT, version: 99 }));
  assert.throws(() => pf.readProjectFile(path.join(dir, 'b.mccp')), /newer/);
  assert.throws(() => pf.readProjectFile(path.join(dir, 'missing.mccp')), (e) => e.code === 'NOT_FOUND');
});

test('API: create with analysis, project exclusions apply, open and save again', async () => {
  const api = createApi({ configDir: tmp('mcc-pf-cfg-') });
  const dir = sourceTree();
  const made = await api.call('project.create', { name: 'Demo', source: dir, settings: { exclusions: ['gen/**'], mainBranch: 'main' }, scan: true });
  assert.ok(fs.existsSync(made.file));
  assert.ok(made.scan.analysis.issues.some((i) => i.file === 'src/a.js'));
  assert.ok(!made.scan.analysis.issues.some((i) => i.file.startsWith('gen/')), 'project exclusions are used');
  const moved = path.join(tmp('mcc-pf-move-'), 'tree');
  fs.cpSync(dir, moved, { recursive: true });
  const opened = await api.call('project.open', { file: path.join(moved, path.basename(made.file)) });
  assert.equal(opened.project.path, moved, 'the relative source follows the moved folder');
  assert.equal(api.store.load().activeProjectId, opened.project.id);
  const ws = api.store.load();
  ws.projects.find((p) => p.id === opened.project.id).includeDirs = ['include'];
  api.store.save(ws);
  const saved = await api.call('project.saveFile', { projectId: opened.project.id });
  assert.deepEqual(JSON.parse(fs.readFileSync(saved.file, 'utf8')).settings.includeDirs, ['include']);
  const recent = await api.call('project.recentFiles');
  assert.equal(recent[0].file, saved.file);
  await assert.rejects(api.call('project.create', { name: 'x', source: path.join(dir, 'nope') }), (e) => e.code === 'NOT_FOUND');
});
