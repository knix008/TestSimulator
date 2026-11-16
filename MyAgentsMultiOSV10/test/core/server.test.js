import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDesktop } from '../../server/desktop.js';
import { startWeb } from '../../server/web.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-server-'));
const desk = await startDesktop({ dataDir: path.join(dir, 'desk'), mockDelay: 1, scheduler: false });
const H = { authorization: `Bearer ${desk.token}`, 'content-type': 'application/json' };
const api = async (method, url, body, headers = H) => {
  const res = await fetch(desk.url + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text && /json/.test(res.headers.get('content-type') ?? '') ? JSON.parse(text) : text };
};
test.after(async () => { await desk.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('the desktop core needs its token (webhooks and info excepted)', async () => {
  assert.equal((await api('GET', '/api/agents', null, {})).status, 401);
  assert.equal((await api('GET', '/api/info', null, {})).status, 200);
  assert.equal((await api('GET', '/api/agents')).status, 200);
});

test('agents: create from a template, save with rev, export, import, delete', async () => {
  const tpl = (await api('GET', '/api/templates/translator?lang=en')).body;
  const a = (await api('POST', '/api/agents', tpl)).body;
  assert.ok(a.id && a.hookSecret && a.rev === 1);
  const saved = (await api('PUT', `/api/agents/${a.id}`, { ...a, name: 'T2' })).body;
  assert.equal(saved.rev, 2);
  assert.equal((await api('PUT', `/api/agents/${a.id}`, { ...a, rev: 1 })).status, 409);
  const exported = await api('GET', `/api/agents/${a.id}/export`);
  const imported = (await api('POST', '/api/agents/import', typeof exported.body === 'string' ? JSON.parse(exported.body) : exported.body)).body;
  assert.equal(imported.name, 'T2');
  assert.notEqual(imported.id, a.id);
  assert.equal((await api('DELETE', `/api/agents/${imported.id}`)).status, 204);
});

test('chat runs a draft and answers; runs are listed', async () => {
  const draft = (await api('GET', '/api/templates/assistant?lang=en')).body;
  const out = (await api('POST', '/api/agents/draft/chat', { message: 'what is 6*7?', agent: draft })).body;
  assert.equal(out.status, 'succeeded');
  assert.match(String(out.reply), /42/);
  const runs = (await api('GET', '/api/runs')).body;
  assert.ok(runs.some((r) => r.id === out.runId && r.draft));
  const detail = (await api('GET', `/api/runs/${out.runId}`)).body;
  assert.ok(detail.steps.length >= 3);
});

test('webhooks answer with the run result; a wrong secret is 404', async () => {
  const tpl = (await api('GET', '/api/templates/issue-triage?lang=en')).body;
  const a = (await api('POST', '/api/agents', tpl)).body;
  const res = await fetch(`${desk.url}/api/hooks/${a.id}/${a.hookSecret}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Crash', body: 'error on start' }) });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(await res.text()).category, 'bug');
  assert.ok(res.headers.get('x-run-id'));
  assert.equal((await fetch(`${desk.url}/api/hooks/${a.id}/wrong`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${desk.url}/api/hooks/${a.id}/${a.hookSecret}`, { method: 'GET' })).status, 405);
});

test('the event stream reports a run step by step', async () => {
  const ac = new AbortController();
  const types = [];
  const reading = fetch(`${desk.url}/api/events?token=${desk.token}`, { signal: ac.signal }).then(async (r) => {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; for (const m of dec.decode(value).matchAll(/event: (\S+)/g)) types.push(m[1]); }
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  const draft = (await api('GET', '/api/templates/code-review?lang=en')).body;
  await api('POST', '/api/run-draft', { agent: draft, wait: true });
  await new Promise((r) => setTimeout(r, 100));
  ac.abort();
  await reading;
  for (const t of ['run.started', 'run.step', 'run.edge', 'run.finished']) assert.ok(types.includes(t), t);
});

test('deploy refuses an agent with errors', async () => {
  const a = (await api('POST', '/api/agents', { name: 'broken', nodes: [{ id: 'x', type: 'kb.search', name: 'x' }] })).body;
  const r = await api('POST', `/api/agents/${a.id}/deploy`, { deployed: true });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'HAS_PROBLEMS');
});

test('knowledge and keys over the API', async () => {
  const kb = (await api('POST', '/api/kbs', { name: 'Docs' })).body;
  await api('POST', `/api/kbs/${kb.id}/docs`, { name: 'a.md', text: 'The office opens at nine.' });
  const hits = (await api('POST', `/api/kbs/${kb.id}/search`, { query: 'office opens' })).body;
  assert.equal(hits[0].doc, 'a.md');
  const c = (await api('POST', '/api/credentials', { provider: 'openai', apiKey: 'sk-test-1234567890' })).body;
  assert.equal(c.keyHint, 'sk-t…7890');
  const list = (await api('GET', '/api/credentials')).body;
  assert.ok(!JSON.stringify(list).includes('sk-test-1234567890'), 'keys never leave the core');
  assert.ok(list.providers.find((p) => p.id === 'openai').ready);
});

test('the web server asks for its password', async () => {
  const web = await startWeb({ dataDir: path.join(dir, 'web'), port: 0, host: '127.0.0.1', password: 'pw', staticDir: path.join(dir, 'none'), scheduler: false });
  try {
    assert.equal((await fetch(`${web.url}/api/agents`)).status, 401);
    assert.equal((await (await fetch(`${web.url}/api/info`)).json()).needsLogin, true);
    assert.equal((await fetch(`${web.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"no"}' })).status, 401);
    const login = await fetch(`${web.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"pw"}' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${web.url}/api/agents`, { headers: { cookie } })).status, 200);
  } finally { await web.close(); }
});
