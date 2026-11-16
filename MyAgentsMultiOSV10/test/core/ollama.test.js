// Local Ollama: not installed → install (a stand-in installer) → started → a model pulled with progress.
// Nothing is downloaded: MYAGENTS_OLLAMA_BIN / MYAGENTS_OLLAMA_INSTALL point at test/helpers/fake-ollama.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore } from '../../core/app.js';

const fake = fileURLToPath(new URL('../helpers/fake-ollama.mjs', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-ollama-'));
const bin = path.join(dir, 'ollama.mjs');
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await freePort();
const env = { MYAGENTS_OLLAMA_BIN: bin, MYAGENTS_OLLAMA_INSTALL: `"${process.execPath}" "${fake}" install "${bin}"` };
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false, env });
core.credentials.create({ provider: 'ollama', baseUrl: `http://127.0.0.1:${port}` });
const progress = [];
core.events.on('ollama.progress', (e) => progress.push(e.data));
const waitJob = async (kind) => { for (let i = 0; i < 400; i += 1) { const j = core.ollama.job(); if (j.kind === kind && j.status !== 'running') return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error(`${kind} did not finish`); };

test.after(async () => {
  try { await fetch(`http://127.0.0.1:${port}/api/shutdown`); } catch { /* not running */ }
  await core.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('not installed: the status says so and how it would be installed', async () => {
  const s = await core.ollama.status();
  assert.deepEqual([s.installed, s.running, s.path, s.via, s.canInstall], [false, false, '', 'command', true]);
  await assert.rejects(core.ollama.start(), (e) => e.code === 'OLLAMA_NOT_INSTALLED');
});

test('install: runs the installer (progress from its output), then starts Ollama and waits for it', async () => {
  const s = await core.ollama.install();
  assert.equal(s.installed, true);
  assert.equal(s.running, true);
  assert.equal(s.version, '0.99.0-test');
  assert.deepEqual(s.models, ['llama3.3:latest']);
  assert.equal(core.ollama.job().status, 'done');
  assert.ok(progress.some((p) => p.kind === 'install' && p.done === 50 && p.total === 100), 'percentages from the installer output');
  assert.ok(progress.some((p) => p.text === 'Successfully installed'));
});

test('pull: a model downloads with byte progress and then is listed; a bad name and a missing model fail clearly', async () => {
  progress.length = 0;
  const s = await core.ollama.pull('llava');
  assert.ok(s.models.includes('llava:latest'));
  const steps = progress.filter((p) => p.kind === 'pull');
  assert.ok(steps.some((p) => p.total === 1000 && p.done > 0), 'bytes done of the total');
  assert.equal(steps.at(-1).status, 'done');
  await assert.rejects(core.ollama.pull('bad name; rm -rf'), (e) => e.code === 'BAD_MODEL_NAME');
  await assert.rejects(core.ollama.pull('no-such-model'), (e) => e.code === 'OLLAMA_PULL_FAILED' && /does not exist/.test(e.message));
  assert.equal(core.ollama.job().status, 'failed');
});

test('a running Ollama starts no second copy; the web server may not install or pull', async () => {
  assert.equal((await core.ollama.start()).running, true);
  const web = createCore({ mode: 'web', dataDir: null, scheduler: false, samples: false, env });
  try {
    assert.throws(() => web.ollama.check(), (e) => e.code === 'OLLAMA_NOT_ALLOWED');
    await assert.rejects(web.ollama.install(), (e) => e.code === 'OLLAMA_NOT_ALLOWED');
  } finally { await web.close(); }
});

test('the HTTP routes: status, install refused while busy, job', async () => {
  const { registerApi } = await import('../../server/api.js');
  const routes = new Map();
  const router = { get: (p, fn) => routes.set(`GET ${p}`, fn), post: (p, fn) => routes.set(`POST ${p}`, fn), put() {}, patch() {}, delete() {}, del() {}, any() {} };
  registerApi(router, core, {});
  const st = await routes.get('GET /api/ollama')({});
  assert.equal(st.running, true);
  const job = await routes.get('POST /api/ollama/pull')({ body: { model: 'qwen3' } });
  assert.equal(job.kind, 'pull');
  assert.throws(() => routes.get('POST /api/ollama/install')({}), (e) => e.code === 'OLLAMA_BUSY');
  const done = await waitJob('pull');
  assert.equal(done.status, 'done');
});
