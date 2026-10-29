'use strict';

// The long SQLite jobs of the issue files (core/issuedb.js runJob), on a
// thread of their own so the service keeps answering: making the indexes of
// a new file, copying a list out of an older issues.db, making the text index.
// workerData: { kind, file, ... , stop: Int32Array on a SharedArrayBuffer }
// (stop[0] = 1 asks the job to end between two steps). Posts { ok, out } or
// { ok: false, error }.

const { parentPort, workerData } = require('worker_threads');
const issuedb = require('./issuedb');

const { kind, file, stop } = workerData;
const stopped = () => Atomics.load(stop, 0) === 1;

async function run() {
  if (kind === 'indexes') {
    const db = issuedb.open(file, { bulk: true });
    try { db.finishBulk(); } finally { db.close(); }
    return true;
  }
  if (kind === 'import') {
    const db = issuedb.open(file, { bulk: true });
    try {
      const whole = await db.importListAsync(workerData.from, workerData.name, stopped);
      if (whole && !stopped()) db.finishBulk();
      return whole && !stopped();
    } finally {
      db.close();
    }
  }
  if (kind === 'text') {
    const db = issuedb.open(file);
    try { await db.buildText({ stop: stopped }); } finally { db.close(); }
    return true;
  }
  throw new Error(`Unknown job ${kind}`);
}

run().then((out) => parentPort.postMessage({ ok: true, out }), (err) => parentPort.postMessage({ ok: false, error: err.message }));
