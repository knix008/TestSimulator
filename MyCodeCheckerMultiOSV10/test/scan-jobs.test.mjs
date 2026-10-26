// Analyses with progress: scan.start runs in a worker, scan.job reports
// phase/percent, scan.cancel stops the worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(api, jobId) {
  const phases = new Set();
  let job;
  for (let i = 0; i < 600; i++) {
    job = await api.call('scan.job', { jobId });
    phases.add(job.progress.phase);
    if (job.status !== 'running') break;
    await sleep(50);
  }
  return { job, phases };
}

test('scan.start reports progress and returns the same result as project.scan', async () => {
  const api = createApi({ configDir: tmp('mcc-job-') });
  const src = path.resolve('samples/demo');
  const { jobId } = await api.call('scan.start', { path: src });
  assert.match(jobId, /^job-/);
  const { job } = await waitFor(api, jobId);
  assert.equal(job.status, 'done');
  assert.equal(job.progress.percent, 100);
  assert.equal(job.progress.etaMs, 0);
  assert.ok(job.progress.elapsedMs >= 0);
  assert.ok(!('worker' in job), 'the worker handle is not exposed');
  const direct = await api.call('project.scan', { path: src });
  assert.equal(job.result.analysis.issues.length, direct.analysis.issues.length);
});

test('scan.cancel stops a running analysis', async () => {
  const api = createApi({ configDir: tmp('mcc-job-') });
  const { jobId } = await api.call('scan.start', { path: path.resolve('samples/cpp-sensor') });
  await sleep(50);
  const cancelled = await api.call('scan.cancel', { jobId });
  assert.equal(cancelled.status, 'cancelled');
  await sleep(300);
  const later = await api.call('scan.job', { jobId });
  assert.equal(later.status, 'cancelled');
  assert.ok(!('result' in later));
});

test('unknown jobs are reported as NOT_FOUND', async () => {
  const api = createApi({ configDir: tmp('mcc-job-') });
  await assert.rejects(api.call('scan.job', { jobId: 'job-none' }), (e) => e.code === 'NOT_FOUND');
  await assert.rejects(api.call('scan.cancel', { jobId: 'job-none' }), (e) => e.code === 'NOT_FOUND');
});
