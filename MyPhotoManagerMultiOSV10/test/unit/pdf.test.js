// The hand-made test PDFs behave as they claim (read by pdf.js itself), and picture
// scaling always ends, whatever the shape (a 1 px wide page used to hang the app).
// features: FMT-PDF FMT-PDF-ERROR
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { scaledCanvas } from '../../src/formats/canvas.js';
import { encryptedPdf, pdfCases, sizedPdf, textPdf } from '../helpers/pdf-build.mjs';

const open = (bytes, options = {}) => {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0, useWorkerFetch: false, ...options });
  return { task, promise: task.promise };
};

test('ordinary test documents open in pdf.js with the right pages', async () => {
  const { ok } = pdfCases();
  for (const [name, bytes] of Object.entries(ok)) {
    const { task, promise } = open(bytes);
    const doc = await promise;
    assert.ok(doc.numPages >= 1, name);
    assert.ok(await doc.getPage(1), name);
    await task.destroy();
  }
  const { task, promise } = open(textPdf(3));
  assert.equal((await promise).numPages, 3);
  await task.destroy();
});

test('page sizes in the test documents are what the name says', async () => {
  const { task, promise } = open(sizedPdf(2, 14400));
  const page = await (await promise).getPage(1);
  assert.deepEqual([page.view[2], page.view[3]], [2, 14400]);
  await task.destroy();
});

test('damaged test documents really are rejected by pdf.js', async () => {
  const { bad } = pdfCases();
  for (const [name, bytes] of Object.entries(bad)) {
    const { task, promise } = open(bytes);
    await assert.rejects(async () => { const doc = await promise; await doc.getPage(1); }, undefined, name);
    await task.destroy();
  }
});

test('the encrypted document opens with its password and only with it', async () => {
  const bytes = encryptedPdf('secret');
  const wrong = open(bytes);
  await assert.rejects(wrong.promise, /password/i);
  await wrong.task.destroy();
  const right = open(bytes, { password: 'secret' });
  assert.equal((await right.promise).numPages, 1);
  await right.task.destroy();
});

// ───────── scaledCanvas

class FakeCanvas {
  static made = 0;
  constructor(width, height) { this.width = width; this.height = height; FakeCanvas.made += 1; if (FakeCanvas.made > 200) throw new Error('scaling does not end'); }
  getContext() { return { drawImage() {} }; }
}

test('scaling down ends for every shape, also strips that are 1 px wide', () => {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = FakeCanvas;
  try {
    for (const [width, height, max, expected] of [
      [1, 2400, 512, [1, 512]],
      [2400, 1, 512, [512, 1]],
      [1, 1, 512, [1, 1]],
      [3, 100000, 16, [1, 16]],
      [100000, 3, 16, [16, 1]],
      [4000, 3000, 400, [400, 300]],
      [2, 2, 1, [1, 1]],
    ]) {
      FakeCanvas.made = 0;
      const out = scaledCanvas(new FakeCanvas(width, height), width, height, max);
      assert.deepEqual([out.width, out.height], expected, `${width}x${height} to ${max}`);
      assert.ok(FakeCanvas.made < 24, `${width}x${height}: ${FakeCanvas.made} canvases`);
    }
  } finally {
    globalThis.OffscreenCanvas = previous;
  }
});
