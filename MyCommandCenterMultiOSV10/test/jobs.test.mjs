// Long-running jobs (core/jobs.js): progress, cancel, conflict questions, results and errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Job, JobRegistry } = require('../core/jobs.js');

const settle = (job) => new Promise((resolve) => job.on('update', (s) => { if (s.status !== 'running') resolve(s); }));

test('a new job is running with nothing done and a unique id', () => {
  const a = new Job('copy', { n: 1 }), b = new Job('copy');
  const s = a.snapshot();
  assert.equal(s.status, 'running');
  assert.equal(s.current, 0);
  assert.equal(s.total, 0);
  assert.deepEqual(s.meta, { n: 1 });
  assert.notEqual(a.id, b.id);
});

test('progress counts up and keeps the detail; advance=false only updates the detail', () => {
  const j = new Job('copy');
  j.setTotal(3);
  j.progress('a.txt'); j.progress('b.txt'); j.progress('c.txt (part 2)', false);
  const s = j.snapshot();
  assert.equal(s.current, 2);
  assert.equal(s.total, 3);
  assert.equal(s.detail, 'c.txt (part 2)');
});

test('bursts of progress are coalesced into a few updates', async () => {
  const j = new Job('copy');
  let updates = 0;
  j.on('update', () => updates++);
  for (let i = 0; i < 100; i++) j.progress(`f${i}`);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(updates >= 1 && updates <= 3, `${updates} updates`);
});

test('finish: done with the result, and a finished job cannot change status again', () => {
  const j = new Job('search');
  j.finish({ hits: 3 });
  j.fail(new Error('late'));
  j.cancel();
  const s = j.snapshot();
  assert.equal(s.status, 'done');
  assert.deepEqual(s.result, { hits: 3 });
  assert.equal(s.error, null);
});

test('finish without a value stores null', () => {
  const j = new Job('delete');
  j.finish();
  assert.equal(j.snapshot().result, null);
});

test('a cancelled job finishes as cancelled', () => {
  const j = new Job('copy');
  j.cancel();
  assert.equal(j.isCancelled(), true);
  j.finish('ignored');
  assert.equal(j.snapshot().status, 'cancelled');
});

test('fail: the message for the UI and code / path / stack as details', () => {
  const j = new Job('copy');
  const err = Object.assign(new Error('permission denied'), { code: 'EACCES', path: '/root/x' });
  j.fail(err);
  const s = j.snapshot();
  assert.equal(s.status, 'error');
  assert.equal(s.error, 'permission denied');
  assert.match(s.errorDetail, /code: EACCES/);
  assert.match(s.errorDetail, /path: \/root\/x/);
  assert.match(s.errorDetail, /Error: permission denied/);
});

test('fail with a string or nothing still gives a message', () => {
  const a = new Job('x'); a.fail('disk full');
  assert.equal(a.snapshot().error, 'disk full');
  const b = new Job('x'); b.fail(null);
  assert.equal(b.snapshot().error, 'Unknown error');
});

test('fail with a CANCELLED error counts as a cancel, not an error', () => {
  const j = new Job('archive');
  j.fail(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
  const s = j.snapshot();
  assert.equal(s.status, 'cancelled');
  assert.equal(s.error, null);
});

test('askConflict waits for the answer and shows the conflict meanwhile', async () => {
  const j = new Job('copy');
  const answer = j.askConflict({ name: 'a.txt' });
  assert.deepEqual(j.snapshot().conflict, { name: 'a.txt' });
  assert.equal(j.resolveConflict('skip', false), true);
  assert.equal(await answer, 'skip');
  assert.equal(j.snapshot().conflict, null);
});

test('"apply to all" answers the next conflicts without asking', async () => {
  const j = new Job('copy');
  const first = j.askConflict({ name: 'a' });
  j.resolveConflict('overwrite', true);
  assert.equal(await first, 'overwrite');
  assert.equal(await j.askConflict({ name: 'b' }), 'overwrite');
  assert.equal(j.snapshot().conflict, null, 'no question was shown');
});

test('an unknown answer is taken as cancel, and cancel is never remembered', async () => {
  const j = new Job('copy');
  const p = j.askConflict({ name: 'a' });
  j.resolveConflict('maybe', true);
  assert.equal(await p, 'cancel');
  const q = j.askConflict({ name: 'b' });
  assert.ok(j.snapshot().conflict, 'asked again');
  j.resolveConflict('skip');
  assert.equal(await q, 'skip');
});

test('cancel releases a job waiting on a conflict; a cancelled job is not asked again', async () => {
  const j = new Job('copy');
  const p = j.askConflict({ name: 'a' });
  j.cancel();
  assert.equal(await p, 'cancel');
  assert.equal(await j.askConflict({ name: 'b' }), 'cancel');
});

test('resolveConflict without a question pending does nothing', () => {
  assert.equal(new Job('copy').resolveConflict('skip'), false);
});

test('a running search shows its partial result', () => {
  const j = new Job('search');
  j.partial = { count: 7 };
  assert.deepEqual(j.snapshot().result, { count: 7 });
});

test('registry.run: the function\'s value becomes the result', async () => {
  const reg = new JobRegistry();
  const job = reg.run('sum', {}, async (j) => { j.setTotal(2); j.progress('1'); j.progress('2'); return 3; });
  const s = await settle(job);
  assert.equal(s.status, 'done');
  assert.equal(s.result, 3);
  assert.equal(reg.snapshot(job.id).current, 2);
});

test('registry.run: a throw becomes the job error', async () => {
  const reg = new JobRegistry();
  const job = reg.run('boom', {}, () => { throw new Error('nope'); });
  const s = await settle(job);
  assert.equal(s.status, 'error');
  assert.equal(s.error, 'nope');
});

test('registry: get / cancel / resolveConflict by id (the id may come as a string)', async () => {
  const reg = new JobRegistry();
  const job = reg.create('copy');
  assert.equal(reg.get(String(job.id)), job);
  assert.equal(reg.get(99999), null);
  assert.equal(reg.snapshot(99999), null);
  const p = job.askConflict({ name: 'x' });
  assert.equal(reg.resolveConflict(job.id, 'overwrite'), true);
  assert.equal(await p, 'overwrite');
  assert.equal(reg.resolveConflict(99999, 'skip'), false);
  assert.equal(reg.cancel(job.id), true);
  assert.equal(reg.cancel(99999), false);
  assert.equal(job.isCancelled(), true);
});

test('registry: cancelAll cancels every running job and re-emits their updates', () => {
  const reg = new JobRegistry();
  const a = reg.create('a'), b = reg.create('b');
  const seen = [];
  reg.on('update', (s) => seen.push(s.id));
  a.askConflict({ name: 'x' });   // an immediate update for a
  reg.cancelAll();
  assert.equal(a.isCancelled() && b.isCancelled(), true);
  assert.ok(seen.includes(a.id));
});
