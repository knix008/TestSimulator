// samples/ holds every start page sample as a file (npm run generate:sample-files):
// the files match src/lib, the models open, and the scripts and models run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleFiles } from '../scripts/generate-sample-files.mjs';
import { parseModel } from '../core/sim/model.js';
import { createSession } from '../core/session.js';
import { simState } from '../core/sim/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
const files = sampleFiles();

test('samples/: every start page sample is there and up to date (run npm run generate:sample-files)', () => {
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(root, rel);
    assert.ok(fs.existsSync(p), `samples/${rel} is missing`);
    assert.equal(fs.readFileSync(p, 'utf8'), text, `samples/${rel} is out of date`);
  }
  assert.equal(Object.keys(files).filter((f) => f.startsWith('scripts/')).length, 49);
  assert.equal(Object.keys(files).filter((f) => f.endsWith('.smdl')).length, 55);
});

test('samples/: the model files open with their blocks and simulate', () => {
  const s = createSession();
  for (const [rel, text] of Object.entries(files)) {
    if (!rel.endsWith('.smdl')) continue;
    const name = path.basename(rel, '.smdl');
    const m = parseModel(text, name);
    assert.ok(m.root.blocks.length >= 2, rel);
    // the same model as built by its build_ script
    const r = s.evaluate(files[rel.replace(/[^/]+\.smdl$/, `build_${name}.m`)]);
    assert.equal(r.ok, true, rel);
    const built = simState(s.ctx).models.get(name).model;
    assert.deepEqual(m.root.blocks.map((b) => b.name).sort(), built.root.blocks.map((b) => b.name).sort(), rel);
  }
});
