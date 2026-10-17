// EDIT-BG: REMBG 1 and REMBG 2 are downloaded models. The download reports
// progress and keeps every byte; the tensor matches the rembg input layout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asDownloadError, downloadFailedText, fetchModel, maskFromValues, MODEL_SPECS, modelTensor } from '../../src/edit/bgmodels.js';

test('EDIT-BG names REMBG 1 and REMBG 2 after the rembg weights', () => {
  assert.equal(MODEL_SPECS.rembg1.file, 'u2net.onnx');
  assert.equal(MODEL_SPECS.rembg2.file, 'isnet-general-use.onnx');
  assert.match(MODEL_SPECS.rembg1.url, /\/u2net\.onnx$/);
  assert.match(MODEL_SPECS.rembg2.url, /\/isnet-general-use\.onnx$/);
  assert.deepEqual(MODEL_SPECS.rembg1.size, [320, 320]);
  assert.deepEqual(MODEL_SPECS.rembg2.size, [1024, 1024]);
});

test('EDIT-BG builds an NCHW tensor and a 0–255 mask', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const tensor = modelTensor({ width: 2, height: 2, data }, { size: [2, 2], mean: [0.5, 0.5, 0.5], std: [1, 1, 1] });
  assert.equal(tensor.length, 3 * 2 * 2);
  assert.ok(tensor.every((value) => Number.isFinite(value)));
  const mask = maskFromValues(new Float32Array([0, 1, 0, 1]), 2, 2, 2, 2);
  assert.equal(mask[0], 0);
  assert.equal(mask[1], 255);
  assert.equal(mask.length, 4);
});

test('EDIT-BG download reports progress and returns the whole file', async () => {
  const progress = [];
  const bytes = await fetchModel({ id: 'rembg1', url: 'http://model/u2net.onnx', bytes: 5 }, {
    onProgress: (payload) => progress.push({ phase: payload.phase, received: payload.received, total: payload.total }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-length' ? '5' : null) },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5]));
          controller.close();
        },
      }),
    }),
  });
  assert.deepEqual([...bytes], [1, 2, 3, 4, 5]);
  assert.equal(progress.at(-1).phase, 'install');
  assert.equal(progress.at(-1).received, 5);
  assert.ok(progress.some((item) => item.phase === 'download' && item.received === 5 && item.total === 5));
});

test('EDIT-BG a failed download says to try again and keeps the reason', () => {
  const error = asDownloadError(new Error('HTTP 404'));
  assert.equal(error.downloadFailed, true);
  const text = downloadFailedText('rembg1', error);
  assert.match(text, /다시 시도/);
  assert.match(text, /HTTP 404/);
  assert.match(text, /REMBG 1/);
  const cancel = asDownloadError(new Error('cancelled'));
  assert.equal(cancel.message, 'cancelled');
  assert.equal(cancel.downloadFailed, undefined);
});

test('EDIT-BG a cancelled download does not pretend the file arrived', async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(
    () => fetchModel({ id: 'rembg2', url: 'http://model/isnet.onnx', bytes: 4 }, {
      signal,
      fetchImpl: async () => { throw new DOMException('The operation was aborted.', 'AbortError'); },
    }),
    (error) => error.message === 'cancelled',
  );
});
