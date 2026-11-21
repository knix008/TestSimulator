// Simulation worker: runs one study (cad/fem/run.js) off the UI thread and posts throttled progress, then the
// result (sanitised, typed arrays transferred). The page cancels by terminating the worker.
import { runStudyDirect, sanitize, transferables } from './cad/fem/run.js';

self.onmessage = (e) => {
  const { kind, input } = e.data ?? {};
  let last = 0;
  const onProgress = (f, info) => {
    const now = Date.now();
    if (now - last < 60 && f < 1) return;
    last = now;
    self.postMessage({ type: 'progress', f, info: info && typeof info === 'object' ? sanitize(info) : info });
  };
  try {
    const result = sanitize(runStudyDirect(kind, input, { onProgress }));
    self.postMessage({ type: 'done', result }, [...transferables(result)]);
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error?.stack ?? error?.message ?? error) });
  }
};
