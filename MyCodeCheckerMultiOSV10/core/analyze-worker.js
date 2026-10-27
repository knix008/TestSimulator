'use strict';

// Runs one analysis in a worker thread so the server keeps answering (progress
// polls, cancel) while a large project is analyzed. Messages to the parent:
//   { type: 'progress', phase, done, total, detail }
//   { type: 'issues', items }  (repeated; the issues of the analysis in order)
//   { type: 'done', analysis } (without issues) | { type: 'error', message }

const { parentPort, workerData } = require('worker_threads');
const { analyzePath } = require('./analyze');

const ISSUE_CHUNK = 50000;
const { root, options, osvSource } = workerData;
const opts = { ...options };
// The advisory database is rebuilt here from its source instead of being copied.
if (osvSource && opts.sca) {
  try { opts.sca = { ...opts.sca, advisoryDb: require('./sca').importOsvDatabase(osvSource, { includeBundled: true }).db }; } catch { /* bundled data only */ }
}

// With a large memory limit V8 collects late, so the parse data of finished
// C/C++ batches would pile up as garbage; the engines release it per batch.
opts.releaseMemory = (() => {
  try {
    require('v8').setFlagsFromString('--expose_gc');
    return require('vm').runInNewContext('gc');
  } catch {
    return undefined;
  }
})();

try {
  const analysis = analyzePath(root, { ...opts, onProgress: (p) => parentPort.postMessage({ type: 'progress', ...p }) });
  // Millions of issues do not fit one message: they go in chunks first.
  const { issues, ...rest } = analysis;
  for (let i = 0; i < issues.length; i += ISSUE_CHUNK) parentPort.postMessage({ type: 'issues', items: issues.slice(i, i + ISSUE_CHUNK) });
  parentPort.postMessage({ type: 'done', analysis: rest });
} catch (err) {
  parentPort.postMessage({ type: 'error', message: String((err && err.message) || err) });
}
