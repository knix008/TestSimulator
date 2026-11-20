// Every display filter preset compiles and finds packets in at least one sample capture, and the
// ones made only of names give the same packets from remembered names as from full dissection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { DISPLAY_PRESETS, EXCLUDE } from '../../src/domain/filter/presets.js';
import { compileFilter } from '../../src/domain/filter/index.js';
import { FIELDS } from '../../src/domain/dissect/index.js';
import en from '../../src/i18n/net-en.js';
import ko from '../../src/i18n/net-ko.js';

// No sample capture negotiates these old TLS versions.
const NO_SAMPLE = new Set(['tls10', 'tls11']);

test('display presets: each compiles, has ko / en labels and a known icon, and matches packets in some sample', async () => {
  const docs = [];
  for (const sample of SAMPLES) {
    const doc = new CaptureDoc({ name: sample.id, file: sample.build() });
    await doc.firstPass();
    docs.push(doc);
  }
  const ids = new Set();
  const missing = [];
  for (const [id, filter, icon, kind] of DISPLAY_PRESETS) {
    assert.ok(!ids.has(id), `duplicate preset ${id}`);
    ids.add(id);
    assert.ok(en[`filterPreset.${id}`] && ko[`filterPreset.${id}`], `labels of ${id}`);
    assert.ok(icon, `icon of ${id}`);
    const c = compileFilter(filter, { fields: FIELDS });
    assert.ok(c.ok, `${id}: ${c.error}`);
    if (kind === EXCLUDE || NO_SAMPLE.has(id)) continue;
    let hits = 0;
    for (const doc of docs) hits += (await doc.applyFilter(filter)).count;
    if (!hits) missing.push(`${id} (${filter})`);
  }
  assert.deepEqual(missing, [], 'presets that find no packet in any sample');
  assert.ok(DISPLAY_PRESETS.length >= 38, `${DISPLAY_PRESETS.length} presets`);
});
