'use strict';

// Analysis worker: runs core/analyze.js analyzeSources() off the protocol
// thread so the server keeps answering hover / code action requests while a
// workspace is analyzed. The worker handles one message at a time.
//
// Job: {
//   id,
//   sources:   [{ path, text }]          // in-memory text (open editors) — wins over disk
//   readPaths: [absPath]                  // read these from disk
//   walk:      { root, exclusions, maxFiles }   // or walk a whole folder
//   options:   analyzeSources options (root, inactive, overrides, exclusions, ...)
// }

const fs = require('fs');
const path = require('path');
const { parentPort } = require('worker_threads');

// stdout belongs to the LSP stream: nothing in the worker may print to it.
if (parentPort) for (const name of ['log', 'info', 'debug', 'warn', 'error', 'trace']) console[name] = () => {};

const { analyzeSources, walk } = require('../analyze');
const { slimIssue } = require('./issues');

const MAX_BYTES = 800000;

function keyOf(p) {
  const n = path.normalize(path.resolve(p));
  return process.platform === 'win32' ? n.toLowerCase() : n;
}

function readText(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    return fs.readFileSync(file, 'utf8');
  } catch { return null; }
}

function run(job) {
  const started = Date.now();
  const given = new Map();
  for (const s of job.sources || []) given.set(keyOf(s.path), s);
  const sources = [...given.values()];
  const seen = new Set(given.keys());
  const add = (file) => {
    const k = keyOf(file);
    if (seen.has(k)) return;
    seen.add(k);
    const text = readText(file);
    if (text != null) sources.push({ path: file, text });
  };
  for (const file of job.readPaths || []) add(file);
  let walked = 0;
  if (job.walk && job.walk.root) {
    const files = walk(job.walk.root, { exclusions: job.walk.exclusions || [], maxFiles: job.walk.maxFiles || 8000 });
    walked = files.length;
    for (const file of files) add(file);
  }
  const result = analyzeSources(sources, job.options || {});
  return {
    issues: (result.issues || []).map(slimIssue),
    files: (result.files || []).map((f) => f.path),
    walked,
    warnings: result.warnings || [],
    durationMs: Date.now() - started,
  };
}

if (parentPort) {
  parentPort.on('message', (job) => {
    try {
      parentPort.postMessage({ id: job.id, ok: true, result: run(job) });
    } catch (err) {
      parentPort.postMessage({ id: job.id, ok: false, error: String((err && err.stack) || err) });
    }
  });
}

module.exports = { run };
