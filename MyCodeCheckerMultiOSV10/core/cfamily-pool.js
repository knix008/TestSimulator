'use strict';

// Runs the batches of a large C/C++ project (core/cfront.js planner) on a pool
// of workers (core/cfamily-worker.js) at the same time, so the shared engines
// use the processor's cores instead of one. The result goes to analyzeSources
// as options.cfamilyFindings: [{ byEngine, warnings }] in batch order, so the
// issues are the same as with one thread. A worker that stops (out of memory)
// has its batch run again in this thread.

const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const cfront = require('./cfront');
const { prepareFiles, sharedEngines, cfamilyInput } = require('./analyze');

// Option values the workers do not need (functions cannot be sent at all).
const LOCAL_OPTIONS = new Set(['onProgress', 'releaseMemory', 'isNewLine', 'issueState', 'previousKeys', 'previousLineHashes', 'previousIssues', 'previousCids', 'coverage', 'cfamilyFindings', 'customRules', 'scmChanged', 'sca']);
const CHILD_MIN_MB = 2560;

function sendableOptions(options) {
  const out = {};
  for (const [k, v] of Object.entries(options || {})) {
    if (LOCAL_OPTIONS.has(k) || typeof v === 'function') continue;
    out[k] = v;
  }
  return out;
}

// How many workers and how much heap each: about 60% of this thread's heap,
// at least CHILD_MIN_MB per worker, at most the cores less two (and 12).
function poolSize(heapMb, cpus = os.cpus().length) {
  const workers = Math.max(0, Math.min(cpus - 2, 12, Math.floor((heapMb * 0.6) / CHILD_MIN_MB)));
  return { workers, childMb: workers ? Math.floor((heapMb * 0.6) / workers) : 0 };
}

// sources and options as analyzeSources takes them. Resolves with the batch
// results, or null when the project is one batch (or a pool would not help).
async function runCfamilyPool(sources, options = {}, { heapMb, workers: wanted, onProgress } = {}) {
  const shared = sharedEngines(options);
  if (!shared.length) return null;
  const input = cfamilyInput(prepareFiles(sources, options), options);
  const plan = cfront.planner(input, { ...(options.cfamilyBatch || {}), lexCache: false });
  if (plan.single) return null;
  const size = poolSize(heapMb || require('v8').getHeapStatistics().heap_size_limit / 1048576);
  const count = Math.min(wanted || size.workers, size.workers || wanted || 0);
  if (count < 2) return null;
  const files = [...plan.headers, ...plan.sources].map((f) => ({ path: f.path, text: f.text, lang: f.lang }));
  const workerData = {
    files,
    engineIds: shared.map((e) => e.id),
    inactive: [...(options.inactive || [])],
    root: options.root || '',
    options: sendableOptions(options),
  };
  const ctx = { inactive: new Set(options.inactive || []), root: options.root || '', options };
  const results = [];
  const lists = new Map(); // index -> list, while out
  let finished = 0;
  let estimate = 1;
  const progress = () => { if (onProgress) onProgress({ phase: 'cfamily', done: finished, total: Math.max(estimate, finished), detail: `${count} workers` }); };

  return new Promise((resolve, reject) => {
    const pool = [];
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      for (const p of pool) p.worker.terminate().catch(() => {});
      if (err) reject(err); else resolve(results);
    };
    const record = (index, list, out) => {
      results[index - 1] = { byEngine: out.byEngine, warnings: out.warnings };
      plan.done(list, out.stats);
      lists.delete(index);
      finished++;
      progress();
    };
    // A batch whose worker stopped runs here, one engine after the other.
    const runHere = (list) => {
      const byEngine = {};
      const warnings = [];
      for (const engine of shared) {
        try { byEngine[engine.id] = engine.analyze(list, ctx) || []; } catch (err) { warnings.push({ engine: engine.id, message: String((err && err.message) || err) }); }
      }
      const stats = cfront.statsOf(cfront.parsedProject(list));
      record(list.batch.index, list, { byEngine, warnings, stats });
    };
    let exhausted = false;
    const pump = () => {
      if (settled) return;
      for (const p of pool) {
        if (p.busy || p.dead || exhausted) continue;
        const list = plan.next();
        if (list === undefined) { exhausted = true; break; }
        if (list === null) break; // the last source batches are still out
        estimate = Math.max(estimate, list.batch.estimate);
        lists.set(list.batch.index, list);
        p.busy = list.batch.index;
        p.worker.postMessage({ index: list.batch.index, units: list.unitFiles });
      }
      if (exhausted && !lists.size) finish();
    };
    const spawn = () => {
      const p = { busy: 0, dead: false };
      p.worker = new Worker(path.join(__dirname, 'cfamily-worker.js'), { workerData, resourceLimits: { maxOldGenerationSizeMb: size.childMb || CHILD_MIN_MB } });
      p.worker.on('message', (out) => {
        const list = lists.get(out.index);
        p.busy = 0;
        if (list) record(out.index, list, out);
        pump();
      });
      const lost = () => {
        if (p.dead || settled) return;
        p.dead = true;
        const list = p.busy ? lists.get(p.busy) : null;
        p.busy = 0;
        try {
          if (list) runHere(list);
        } catch (err) {
          finish(err);
          return;
        }
        if (pool.every((x) => x.dead)) pool.push(spawn());
        pump();
      };
      p.worker.on('error', lost);
      p.worker.on('exit', lost);
      return p;
    };
    for (let i = 0; i < count; i++) pool.push(spawn());
    progress();
    pump();
  });
}

module.exports = { runCfamilyPool, poolSize, sendableOptions };
