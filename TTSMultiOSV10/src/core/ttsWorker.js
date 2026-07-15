import { parentPort } from 'node:worker_threads';
import { createModelStore } from './modelStore.js';
import { synthesizeText, warmModel, listModelVoices } from './ttsService.js';

const store = createModelStore();

parentPort.on('message', async (msg) => {
  const { id, type, payload } = msg || {};
  try {
    let result = null;
    if (type === 'speak') {
      result = await synthesizeText({ ...payload, store, onProgress: null });
    } else if (type === 'warm') {
      result = await warmModel(payload?.modelId, store);
    } else if (type === 'voices') {
      result = await listModelVoices(payload?.modelId, store);
    } else {
      throw new Error(`Unknown worker message type: ${type}`);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: error?.message || String(error),
    });
  }
});
