// Background jobs: run to completion, cancel, conflict answers, snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JobRegistry, cancelledError } = require('../core/jobs');

async function waitSnap(jobs, id, ms = 2000) {
  const start = Date.now();
  let s = jobs.snapshot(id);
  while (s && s.status === 'running' && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 10));
    s = jobs.snapshot(id);
  }
  return s;
}

test('jobs: run finishes with a result snapshot', async () => {
  const jobs = new JobRegistry();
  const job = jobs.run('demo', { n: 1 }, async (j) => {
    j.setTotal(1, 10);
    j.begin('a.txt');
    j.addBytes(10);
    j.advance();
    j.note({ type: 'file', src: 'a.txt' });
    return { ok: true };
  });
  assert.equal(job.snapshot().status, 'running');
  const s = await waitSnap(jobs, job.id);
  assert.equal(s.status, 'done');
  assert.deepEqual(s.result, { ok: true });
  assert.equal(s.current, 1);
  assert.equal(s.bytes, 10);
  assert.equal(s.notes.length, 1);
  assert.deepEqual(jobs.running(), []);
});

test('jobs: cancel stops a waiting job', async () => {
  const jobs = new JobRegistry();
  let armed;
  const armedP = new Promise((r) => { armed = r; });
  const job = jobs.run('slow', {}, async (j) => {
    await new Promise((resolve, reject) => {
      j.onCancel(() => reject(cancelledError()));
      armed();
    });
  });
  await armedP;
  assert.equal(jobs.cancel(job.id), true);
  const s = await waitSnap(jobs, job.id);
  assert.equal(s.status, 'cancelled');
  assert.equal(cancelledError().code, 'CANCELLED');
});

test('jobs: conflict overwrite / skip via apply-all', async () => {
  const jobs = new JobRegistry();
  const job = jobs.run('dl', {}, async (j) => {
    const first = await j.askConflict({ name: 'a.txt', destPath: '/a.txt', destIsDir: false, kind: 'file' });
    const second = await j.askConflict({ name: 'b.txt', destPath: '/b.txt', destIsDir: false, kind: 'file' });
    return { first, second };
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(jobs.snapshot(job.id).conflict);
  assert.equal(jobs.resolveConflict(job.id, 'overwrite', true), true);
  const s = await waitSnap(jobs, job.id);
  assert.equal(s.status, 'done');
  assert.equal(s.result.first, 'overwrite');
  assert.equal(s.result.second, 'overwrite');
});

test('jobs: missing id is a no-op', () => {
  const jobs = new JobRegistry();
  assert.equal(jobs.snapshot(999), null);
  assert.equal(jobs.cancel(999), false);
  assert.equal(jobs.resolveConflict(999, 'skip', false), false);
});
