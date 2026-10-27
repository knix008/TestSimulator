// project.target: what an analysis would read, shown on the Overview before
// and after the first analysis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { survey } = require('../core/target.js');

function tree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-target-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  put('src/a.c', 'int main(void) { return 0; }\n');
  put('src/b.h', '#define X 1\n');
  put('web/app.js', 'console.log(1);\n'.repeat(50));
  put('node_modules/x/index.js', 'module.exports = 1;\n');
  put('third/lib.c', 'int f(void) { return 1; }\n');
  put('notes.txt', 'not source\n');
  put('CMakeLists.txt', 'project(x)\n');
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('survey counts the source files per language, the build files and what is left out', () => {
  const dir = tree();
  try {
    const r = survey(dir, { excludeDirs: ['third'] });
    assert.equal(r.exists, true);
    assert.equal(r.files, 3);
    assert.equal(r.languages.js.files, 1);
    assert.equal(r.languages.c.files, 2, 'a header counts as C');
    assert.equal(r.largest[0].path, 'web/app.js');
    assert.deepEqual(r.build, ['CMake']);
    assert.deepEqual(r.scm, ['Git']);
    const skipped = Object.fromEntries(r.skipped.map((s) => [s.dir, s.reason]));
    assert.equal(skipped.node_modules, 'skip');
    assert.equal(skipped.third, 'excludeDir');
    assert.ok(r.dirs >= 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing folder is reported, not thrown', () => {
  assert.deepEqual(survey(path.join(os.tmpdir(), 'mcc-no-such-folder-xyz')).exists, false);
});

test('project.target answers for a project without an analysis', async () => {
  const dir = tree();
  try {
    const { createApi } = require('../core/api.js');
    const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-target-api-')) });
    const { project } = await api.call('project.create', { source: dir, file: path.join(os.tmpdir(), `mcc-target-${Date.now()}.mccp`) });
    const r = await api.call('project.target', { projectId: project.id });
    assert.equal(r.files, 4, 'third/ is not excluded in this project');
    assert.equal(r.exists, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
