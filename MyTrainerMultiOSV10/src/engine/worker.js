// TensorFlow.js training in a Web Worker, so the window stays responsive while
// a model trains. Backend: WebGPU when the browser has it, then WebGL, then CPU.
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import { Trainer } from './trainer-core.js';

const trainer = new Trainer(tf, (message, transfer) => self.postMessage(message, transfer));
let ready = null;
let queue = Promise.resolve();
const CONTROLS = new Set(['pause', 'resume', 'step', 'stop', 'setProbe']);

async function chooseBackend(preferred) {
  const order = preferred && preferred !== 'auto' ? [preferred, 'webgl', 'cpu'] : ['webgpu', 'webgl', 'cpu'];
  for (const name of order) {
    if (name === 'webgpu' && !globalThis.navigator?.gpu) continue;
    try {
      if (await tf.setBackend(name)) {
        await tf.ready();
        // A WebGL context that cannot be created shows up only on first use.
        tf.tidy(() => tf.add(tf.scalar(1), tf.scalar(1)).dataSync());
        return name;
      }
    } catch { /* try the next one */ }
  }
  return tf.getBackend();
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'init') {
    ready = chooseBackend(message.backend);
    const backend = await ready;
    self.postMessage({ type: 'ready', backend, version: tf.version.tfjs });
    return;
  }
  await ready;
  // Controls act at once (they steer a running training); everything else runs one at a time, so a
  // rebuild never disposes a model that a snapshot or prediction is still reading.
  if (CONTROLS.has(message.type)) { trainer.handle(message); return; }
  queue = queue.then(() => trainer.handle(message)).catch(() => {});
};
