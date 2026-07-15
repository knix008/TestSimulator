import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', 'src', 'core', 'ttsWorker.js');

let worker = null;
let nextId = 1;
const pending = new Map();

function rejectAll(error) {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker(workerPath, {
    type: 'module',
    // Keep Electron from treating the worker as a renderer
    env: { ...process.env },
  });

  worker.on('message', (msg) => {
    const entry = pending.get(msg?.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new Error(msg.error || 'TTS worker failed'));
  });

  worker.on('error', (error) => {
    rejectAll(error instanceof Error ? error : new Error(String(error)));
    worker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      rejectAll(new Error(`TTS worker exited with code ${code}`));
    }
    worker = null;
  });

  return worker;
}

export function callTtsWorker(type, payload = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      ensureWorker().postMessage({ id, type, payload });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function terminateTtsWorker() {
  if (!worker) return;
  const current = worker;
  worker = null;
  rejectAll(new Error('TTS worker terminated'));
  await current.terminate().catch(() => {});
}
