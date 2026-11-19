import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { DISPLAY_PRESETS } from '../../src/domain/filter/presets.js';

async function open(id) {
  const doc = new CaptureDoc({ name: id, file: SAMPLES.find((s) => s.id === id).build() });
  await doc.firstPass();
  return doc;
}

test('TLS versions: _ws.col.protocol picks exactly the rows the Protocol column names', async () => {
  const doc = await open('mixed-office-lan');
  const byColumn = {};
  for (let i = 0; i < doc.passed; i++) { const p = doc.summary(i).protocol; byColumn[p] = (byColumn[p] ?? 0) + 1; }
  for (const version of ['TLSv1.2', 'TLSv1.3']) {
    const r = await doc.applyFilter(`_ws.col.protocol == "${version}"`);
    assert.ok(r.ok, r.error);
    assert.ok(r.count > 0, `no ${version} rows`);
    assert.equal(r.count, byColumn[version], `${version}: filter ${r.count}, column ${byColumn[version]}`);
    for (const i of doc.displayed) assert.equal(doc.summary(i).protocol, version);
  }
  const all = await doc.applyFilter('tls');
  assert.equal(all.count, byColumn['TLSv1.2'] + byColumn['TLSv1.3'], 'every TLS row is 1.2 or 1.3 in this sample');
});

test('TLS versions: one preset per version, 1.2 and 1.3 together with OR', async () => {
  const doc = await open('https-tls-handshake');
  const preset = (name) => DISPLAY_PRESETS.find(([n]) => n === name)[1];
  for (const name of ['tls10', 'tls11', 'tls12', 'tls13']) assert.ok(preset(name).includes('_ws.col.protocol'), name);
  const v12 = (await doc.applyFilter(preset('tls12'))).count;
  const v13 = (await doc.applyFilter(preset('tls13'))).count;
  const both = (await doc.applyFilter(`${preset('tls12')} or ${preset('tls13')}`)).count;
  assert.ok(v12 > 0 && v13 > 0, `1.2: ${v12}, 1.3: ${v13}`);
  assert.equal(both, v12 + v13);
  assert.equal((await doc.applyFilter('_ws.col.info contains "Client Hello"')).count > 0, true, '_ws.col.info is a field too');
});
