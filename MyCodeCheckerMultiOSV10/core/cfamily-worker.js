'use strict';

// One worker of the C/C++ pool (core/cfamily-pool.js). It holds the C/C++
// files of the project, parses the batches it is sent and runs the shared
// engines on each. Messages:
//   in:  { index, units }                       (paths of the batch's units)
//   out: { index, byEngine: { id: findings }, warnings, stats }

const { parentPort, workerData } = require('worker_threads');
const cfront = require('./cfront');
const { engines } = require('./engines');

const { files, engineIds, inactive, root, options } = workerData;
const byPath = new Map(files.map((f) => [f.path, f]));
const headers = files.filter((f) => cfront.cf.isHeader(f.path));
const lexCache = new Map();
const list = engines().filter((e) => engineIds.includes(e.id));
const ctx = { inactive: new Set(inactive || []), root, options };

// With a large memory limit V8 collects late; each batch is dropped at its end.
const gc = (() => {
  try {
    require('v8').setFlagsFromString('--expose_gc');
    return require('vm').runInNewContext('gc');
  } catch {
    return null;
  }
})();

parentPort.on('message', ({ index, units }) => {
  const unitFiles = units.map((p) => byPath.get(p)).filter(Boolean);
  const batch = cfront.batchOf(headers, unitFiles, unitFiles.filter((f) => !cfront.cf.isHeader(f.path)), lexCache);
  const byEngine = {};
  const warnings = [];
  for (const engine of list) {
    try {
      byEngine[engine.id] = engine.analyze(batch, ctx) || [];
    } catch (err) {
      warnings.push({ engine: engine.id, message: String((err && err.message) || err) });
    }
  }
  const stats = cfront.statsOf(cfront.parsedProject(batch));
  parentPort.postMessage({ index, byEngine, warnings, stats });
  if (gc) gc();
});
