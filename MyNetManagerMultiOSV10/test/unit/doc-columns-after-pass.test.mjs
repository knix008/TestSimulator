// A frame dissected while the first pass is still running (the first rows, the selected packet) must not keep
// the first-pass columns once the pass ends: a TLS ClientHello's protocol is TLSv1.2 in the first pass and
// TLSv1.3 when its ServerHello is known, and a _ws.col.protocol filter read the stale cached one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';

const build = () => SAMPLES.find((s) => s.id === 'mixed-office-lan').build();
const protocol = (d) => d.fields.get('_ws.col.protocol')?.[0]?.value;

test('cached dissections take the final _ws.col columns when the first pass ends', async () => {
  const reference = new CaptureDoc({ name: 'ref', file: build() });
  await reference.firstPass();
  const index = 11; // frame 12: a ClientHello
  assert.equal(reference.summaries[index].protocol, 'TLSv1.2', 'the first pass calls it TLSv1.2');
  assert.equal(protocol(reference.dissection(index)), 'TLSv1.3', 'with every frame known it is TLSv1.3');

  // The same capture, with the first pass stopped after 20 frames and the frame shown meanwhile.
  const file = build();
  const rest = file.frames.splice(20);
  const doc = new CaptureDoc({ name: 'x', file });
  const total = 20 + rest.length;
  Object.defineProperty(doc, 'count', { get: () => total, configurable: true });
  await doc.firstPass();
  assert.equal(protocol(doc.dissection(index)), 'TLSv1.2', 'mid-pass: the first-pass column');
  delete doc.count;
  file.frames.push(...rest);
  await doc.firstPass();
  assert.equal(protocol(doc.dissection(index)), 'TLSv1.3', 'after the pass: the final column');

  for (const filter of ['_ws.col.protocol == "TLSv1.2"', '_ws.col.protocol == "TLSv1.3"']) {
    const want = await reference.applyFilter(filter);
    const got = await doc.applyFilter(filter);
    assert.equal(got.count, want.count, filter);
  }
});
