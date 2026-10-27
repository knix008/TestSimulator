'use strict';

// Runs one analysis in a worker thread so the server keeps answering (progress
// polls, cancel) while a large project is analyzed. Messages to the parent:
//   { type: 'progress', phase, done, total, detail }  (phase 'cfamily': the C/C++ pool)
//   { type: 'issues', items }  (repeated; the issues of the analysis in order)
//   { type: 'done', analysis } (without issues) | { type: 'error', message }

const { parentPort, workerData } = require('worker_threads');
const { collectSources, analyzeSources } = require('./analyze');
const { runCfamilyPool } = require('./cfamily-pool');

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

(async () => {
  const onProgress = (p) => parentPort.postMessage({ type: 'progress', ...p });
  const { sources, options: collected } = collectSources(root, { ...opts, onProgress });
  // A large C/C++ project runs its shared engines on a pool of workers first.
  let cfamilyFindings = null;
  try {
    cfamilyFindings = await runCfamilyPool(sources, collected, { onProgress });
  } catch {
    cfamilyFindings = null; // one thread, as before
  }
  const analysis = analyzeSources(sources, { ...collected, cfamilyFindings });
  // Millions of issues do not fit one message: they go in chunks first.
  const { issues, ...rest } = analysis;
  for (let i = 0; i < issues.length; i += ISSUE_CHUNK) parentPort.postMessage({ type: 'issues', items: issues.slice(i, i + ISSUE_CHUNK) });
  parentPort.postMessage({ type: 'done', analysis: rest });
})().catch((err) => {
  parentPort.postMessage({ type: 'error', message: String((err && err.message) || err) });
});
