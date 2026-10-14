// Image analysis worker: everything heavy runs here, never on the page's thread.
//   MobileNet v2 (ImageNet, 1000 classes)  → what the picture shows: scene, objects
//   SSDLite MobileNet v2 (COCO, 80 objects) → people and objects with their boxes
//   colour statistics (taxonomy.js)         → night, sunset, sky, snow, documents, B&W
// TensorFlow.js comes from face-api's bundle (one copy for the app). The models
// ship with the app: public/models/mobilenet and public/models/cocossd
// (scripts/vendor-assets.mjs).
//
// Messages in:  { type: 'init', base }  { type: 'analyze', id, url, faces }
// Messages out: { type: 'ready', backend } { type: 'result', id, result } { type: 'error', id, message }
import { classify, colorStats } from './taxonomy.js';
import LABELS from './labels.json';

let tf = null;
let mobilenet = null;
let coco = null;
let ready = null;

async function init(base) {
  ({ tf } = await import('@vladmandic/face-api'));
  // WebGL in the worker (OffscreenCanvas) when the GPU allows, else the CPU.
  let backend = 'cpu';
  for (const name of ['webgl', 'cpu']) {
    try { if (await tf.setBackend(name)) { backend = name; break; } } catch { /* next */ }
  }
  await tf.ready();
  [mobilenet, coco] = await Promise.all([
    tf.loadGraphModel(new URL('mobilenet/model.json', base).href),
    tf.loadGraphModel(new URL('cocossd/model.json', base).href),
  ]);
  // Warm up (the first run compiles the shaders).
  tf.tidy(() => mobilenet.predict(tf.zeros([1, 224, 224, 3])));
  const warm = await coco.executeAsync(tf.zeros([1, 64, 64, 3], 'int32'));
  tf.dispose(warm);
  return backend;
}

/** RGBA pixels of a bitmap drawn at w × h. */
function pixels(bitmap, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}

async function topClasses(bitmap, k = 5) {
  const image = pixels(bitmap, 224, 224);
  const probs = tf.tidy(() => {
    const input = tf.browser.fromPixels(image).toFloat().div(127.5).sub(1).expandDims(0);
    let logits = mobilenet.predict(input);
    if (Array.isArray(logits)) logits = logits[0];
    // 1001 outputs: the first is "background".
    if (logits.shape[1] === 1001) logits = logits.slice([0, 1], [-1, 1000]);
    return logits.softmax().squeeze();
  });
  const values = await probs.data();
  probs.dispose();
  const order = Array.from(values.keys()).sort((a, b) => values[b] - values[a]).slice(0, k);
  return order.map((index) => ({ index, name: LABELS.imagenet[index], p: values[index] }));
}

async function detect(bitmap, maxSide = 384) {
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const image = pixels(bitmap, w, h);
  const input = tf.tidy(() => tf.browser.fromPixels(image).expandDims(0).toInt());
  const result = await coco.executeAsync(input);
  input.dispose();
  const [scoresT, boxesT] = result;
  const scores = await scoresT.data();
  const boxes = await boxesT.data();
  const [, count, classes] = scoresT.shape;
  tf.dispose(result);
  // Best class per box, then non-maximum suppression.
  const best = new Float32Array(count);
  const classOf = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    let max = -1;
    let at = 0;
    for (let c = 0; c < classes; c++) { const s = scores[i * classes + c]; if (s > max) { max = s; at = c; } }
    best[i] = max;
    classOf[i] = at;
  }
  const boxTensor = tf.tensor2d(boxes, [count, 4]);
  const scoreTensor = tf.tensor1d(best);
  const keep = await tf.image.nonMaxSuppressionAsync(boxTensor, scoreTensor, 20, 0.5, 0.4);
  const indexes = await keep.data();
  tf.dispose([boxTensor, scoreTensor, keep]);
  return Array.from(indexes, (i) => {
    const [y0, x0, y1, x1] = boxes.slice(i * 4, i * 4 + 4);
    return { label: LABELS.coco[classOf[i] + 1] ?? 'unknown', score: best[i], box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }).filter((d) => d.label !== 'unknown');
}

async function analyze({ url, faces }) {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const small = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height));
    const sw = Math.max(1, Math.round(bitmap.width * small));
    const sh = Math.max(1, Math.round(bitmap.height * small));
    const stats = colorStats(pixels(bitmap, sw, sh).data, sw, sh);
    const predictions = await topClasses(bitmap);
    const detections = await detect(bitmap);
    const { cats, people, labels } = classify({ predictions, detections, stats, faces });
    return {
      cats, people, labels,
      top: predictions.slice(0, 3).map((p) => ({ name: p.name.split(',')[0], p: Math.round(p.p * 1000) / 1000 })),
      objects: detections.filter((d) => d.score >= 0.5).map((d) => ({ label: d.label, score: Math.round(d.score * 100) / 100, box: d.box })),
    };
  } finally {
    bitmap.close?.();
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'init') {
    ready ??= init(message.base);
    try { self.postMessage({ type: 'ready', backend: await ready }); } catch (error) { ready = null; self.postMessage({ type: 'error', id: null, message: String(error?.message ?? error) }); }
    return;
  }
  if (message.type === 'analyze') {
    try {
      await ready;
      self.postMessage({ type: 'result', id: message.id, result: await analyze(message) });
    } catch (error) {
      self.postMessage({ type: 'error', id: message.id, message: String(error?.message ?? error) });
    }
  }
};
