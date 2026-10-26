'use strict';

// Runs one analysis in a worker thread so the server keeps answering (progress
// polls, cancel) while a large project is analyzed. Messages to the parent:
//   { type: 'progress', phase, done, total, detail }
//   { type: 'done', analysis } | { type: 'error', message }

const { parentPort, workerData } = require('worker_threads');
const { analyzePath } = require('./analyze');

const { root, options, osvSource } = workerData;
const opts = { ...options };
// The advisory database is rebuilt here from its source instead of being copied.
if (osvSource && opts.sca) {
  try { opts.sca = { ...opts.sca, advisoryDb: require('./sca').importOsvDatabase(osvSource, { includeBundled: true }).db }; } catch { /* bundled data only */ }
}

try {
  const analysis = analyzePath(root, { ...opts, onProgress: (p) => parentPort.postMessage({ type: 'progress', ...p }) });
  parentPort.postMessage({ type: 'done', analysis });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: String((err && err.message) || err) });
}
