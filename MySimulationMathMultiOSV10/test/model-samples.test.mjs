// The start page's example models (src/lib/modelSamples.js): each builds, opens and simulates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_SAMPLES } from '../src/lib/modelSamples.js';
import { createSession } from '../core/session.js';
import fs from 'node:fs';

test('model examples: unique ids and names in both languages; every one has its diagram image', () => {
  const ids = new Set();
  for (const m of MODEL_SAMPLES) {
    assert.ok(fs.existsSync(new URL(`../public/models/${m.id}.webp`, import.meta.url)), `public/models/${m.id}.webp is missing: npm run generate:models`);
    assert.ok(!ids.has(m.id), m.id);
    ids.add(m.id);
    assert.equal(m.name.length, 2);
    assert.equal(m.desc.length, 2);
    assert.match(m.code, new RegExp(`mdl = '${m.model}';`));
  }
});

for (const m of MODEL_SAMPLES) {
  test(`model example ${m.id}: builds, opens and simulates; opening it again reuses it`, () => {
    const posted = [];
    const s = createSession({ host: { post: (msg) => posted.push(msg), request: () => null } });
    const r = s.evaluate(m.code);
    assert.equal(r.ok, true, `${m.id}: ${r.error && r.error.message}`);
    assert.ok(posted.some((p) => p.type === 'sim.openEditor' && p.name === m.model), 'the model editor is asked to open it');
    const run = s.evaluate(`out = sim('${m.model}'); if numel(out.tout) < 20 || abs(out.tout(end) - str2double(get_param('${m.model}', 'StopTime'))) > 1e-9, error('short run'); end`);
    assert.equal(run.ok, true, `${m.id} sim: ${run.error && run.error.message}`);
    const again = s.evaluate(m.code);
    assert.equal(again.ok, true, 'running the example again shows the loaded model');
    const n = s.evaluate(`nb = numel(find_system('${m.model}', 'Type', 'Block'));`);
    assert.equal(n.ok, true);
  });
}
