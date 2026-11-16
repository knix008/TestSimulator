// Every node type that the engine tests do not already cover, against a local HTTP server (no internet).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { defaultConfig } from '../../core/nodes/defs.js';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-nodes-'));
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
core.settings.update({ workDir: work });
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ method: req.method, q: url.searchParams.get('q'), auth: req.headers.authorization ?? null, h: req.headers['x-test'] ?? null, body: body ? JSON.parse(body) : null })); return; }
    if (url.pathname === '/page') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>Test Page</title></head><body><h1>Hello</h1><p>World &amp; more</p><a href="https://example.com/x">link</a><script>bad()</script></body></html>'); return; }
    if (url.pathname === '/fail') { res.writeHead(503); res.end('down'); return; }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { server.close(); await core.close(); fs.rmSync(work, { recursive: true, force: true }); });

const one = (type, config, payload = {}, extra = []) => core.engine.runAndWait({
  id: 'n', name: 'n',
  nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'x', type, name: 'X', config: { ...defaultConfig(type), ...config } }, ...extra],
  edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'x', toPort: 'in' }],
}, { kind: 'manual', payload });

test('HTTP request: method, query, headers, JSON body, bearer key, error status', async () => {
  const cred = core.credentials.create({ provider: 'http', name: 'svc', apiKey: 'tok123' });
  const r = await one('tool.http', { method: 'POST', url: `${base}/json`, query: [{ key: 'q', value: '{{ input.q }}' }], headers: [{ key: 'X-Test', value: 'yes' }], body: '{"a": {{ input.n }}}', auth: cred.id }, { q: 'find', n: 5 });
  assert.equal(r.status, 'succeeded', r.error?.message);
  assert.deepEqual(r.output.data, { method: 'POST', q: 'find', auth: 'Bearer tok123', h: 'yes', body: { a: 5 } });
  const bad = await one('tool.http', { url: `${base}/fail` });
  assert.equal(bad.status, 'failed');
  assert.equal(bad.error.code, 'HTTP_503');
});

test('Read web page: title, text without scripts, links', async () => {
  const r = await one('tool.web', { url: `${base}/page` });
  assert.equal(r.output.title, 'Test Page');
  assert.match(r.output.text, /Hello\s+World & more/);
  assert.ok(!r.output.text.includes('bad()'));
  assert.equal(r.output.links[0].url, 'https://example.com/x');
});

test('File: write, append, read, list — and never outside the work folder', async () => {
  await one('tool.file', { op: 'write', path: 'notes/a.txt', content: 'one' });
  await one('tool.file', { op: 'append', path: 'notes/a.txt', content: 'two' });
  assert.equal(fs.readFileSync(path.join(work, 'notes', 'a.txt'), 'utf8'), 'onetwo\n');
  assert.equal((await one('tool.file', { op: 'read', path: 'notes/a.txt' })).output.text, 'onetwo\n');
  assert.deepEqual((await one('tool.file', { op: 'list', path: 'notes' })).output.entries, [{ name: 'a.txt', dir: false }]);
  const escape = await one('tool.file', { op: 'read', path: '../../etc/passwd' });
  assert.equal(escape.error.code, 'PATH_OUTSIDE');
});

test('Run command: output and exit code; refused when commands are off', async () => {
  const r = await one('tool.shell', { command: 'node -e "console.log(6*7)"' });
  assert.equal(r.status, 'succeeded', r.error?.message);
  assert.equal(r.output.stdout.trim(), '42');
  assert.equal(r.output.code, 0);
  core.settings.update({ allowShell: false });
  assert.equal((await one('tool.shell', { command: 'echo hi' })).error.code, 'SHELL_DISABLED');
  core.settings.update({ allowShell: true });
});

test('JSON: parse, stringify, pick a path', async () => {
  assert.deepEqual((await one('tool.json', { op: 'parse', value: '{{ input.raw }}' }, { raw: '{"a":[1,2]}' })).output, { a: [1, 2] });
  assert.match((await one('tool.json', { op: 'stringify', value: '{{ input }}' }, { b: 1 })).output.text, /"b": 1/);
  assert.equal((await one('tool.json', { op: 'pick', value: '{{ input }}', path: 'data.items[1]' }, { data: { items: ['x', 'y'] } })).output, 'y');
});

test('Date & time: offset and time zone', async () => {
  const r = await one('tool.datetime', { offsetDays: 1, timeZone: 'Asia/Seoul' });
  assert.equal(r.output.timeZone, 'Asia/Seoul');
  assert.match(r.output.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await one('tool.datetime', { timeZone: 'Nowhere/City' })).error.code, 'BAD_TIMEZONE');
});

test('Set variables, then use them; agent-level variables are there from the start', async () => {
  const r = await core.engine.runAndWait({
    id: 'v', name: 'v', variables: [{ key: 'greeting', value: 'Hi' }],
    nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 's', type: 'logic.set', name: 's', config: { values: [{ key: 'who', value: '{{ input.name }}' }] } }, { id: 'o', type: 'logic.template', name: 'o', config: { template: '{{ vars.greeting }} {{ vars.who }}' } }],
    edges: [{ id: 'a', from: 't', fromPort: 'out', to: 's' }, { id: 'b', from: 's', fromPort: 'out', to: 'o' }],
  }, { kind: 'manual', payload: { name: 'Lee' } });
  assert.equal(r.output.text, 'Hi Lee');
});

test('Knowledge: add a document from a run, then find it', async () => {
  const kb = core.knowledge.create({ name: 'run-kb' });
  await one('kb.add', { kb: kb.id, title: 'memo', text: 'The launch date is 2026-12-01.' });
  const r = await one('kb.search', { kbs: [kb.id], query: 'launch date' });
  assert.equal(r.output.sources[0], 'memo.txt');
  assert.match(r.output.context, /2026-12-01/);
  assert.equal((await one('kb.search', { kbs: [] })).error.code, 'NO_KB');
});

test('Ask a person: the run waits for the form values', async () => {
  const run = core.engine.start({ id: 'h', name: 'h', nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'x', type: 'human.input', name: 'x', config: { message: 'Need data', fields: ['city'] } }], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'x' }] }, { kind: 'manual' });
  for (let i = 0; i < 100 && core.engine.get(run.id).status !== 'waiting'; i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(core.engine.get(run.id).waiting.fields, ['city']);
  core.engine.resume(run.id, { values: { city: 'Seoul' } });
  assert.deepEqual((await core.engine.wait(run.id)).output, { city: 'Seoul' });
});

test('approval times out as rejected; notify emits an event', async () => {
  const seen = [];
  const off = core.events.on('run.notify', (e) => seen.push(e.data.message));
  const r = await core.engine.runAndWait({
    id: 'ap', name: 'ap',
    nodes: [{ id: 't', type: 'trigger.manual', name: 't', config: {} }, { id: 'a', type: 'human.approval', name: 'a', config: { message: 'ok?', timeoutMinutes: 0.0005 } }, { id: 'n', type: 'human.notify', name: 'n', config: { message: 'timed out: {{ input.timeout }}' } }],
    edges: [{ id: 'e1', from: 't', fromPort: 'out', to: 'a' }, { id: 'e2', from: 'a', fromPort: 'rejected', to: 'n' }],
  }, { kind: 'manual' });
  off();
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(seen, ['timed out: true']);
});

test('agent built-in tools: date, HTTP GET, web page, knowledge search, JavaScript', async () => {
  const kb = core.knowledge.create({ name: 'tools-kb' });
  core.knowledge.addDocument(kb.id, { name: 'faq.md', text: 'Our phone number is 02-555-0100.' });
  const agent = (tools, kbs = []) => ({ id: 'tools', name: 'tools', nodes: [{ id: 't', type: 'trigger.chat', name: 't', config: {} }, { id: 'a', type: 'ai.agent', name: 'a', config: { ...defaultConfig('ai.agent'), tools, kbs, memory: false } }], edges: [{ id: 'e', from: 't', fromPort: 'out', to: 'a' }] });
  const ask = async (tools, message, kbs) => (await core.engine.runAndWait(agent(tools, kbs), { kind: 'chat', payload: { message } })).output;
  assert.equal((await ask(['datetime'], 'what time is it now?')).toolCalls[0].name, 'datetime');
  assert.match((await ask(['http_get'], `get ${base}/json`)).toolCalls[0].result, /"method":"GET"/);
  assert.match((await ask(['web_page'], `read ${base}/page`)).toolCalls[0].result, /Test Page/);
  assert.match((await ask(['knowledge'], 'phone number?', [kb.id])).toolCalls[0].result, /02-555-0100/);
  const js = await core.engine.runAndWait(agent(['javascript']), { kind: 'chat', payload: { message: 'x' } });
  assert.equal(js.status, 'succeeded');
});

test('webhook and schedule triggers hand their payload to the flow; a deployed schedule fires', async () => {
  const a = core.agents.create({ name: 'sched', deployed: true, nodes: [{ id: 's', type: 'trigger.schedule', name: 's', config: { mode: 'interval', minutes: 1 } }, { id: 'o', type: 'logic.template', name: 'o', config: { template: 'fired {{ trigger.scheduled }}' } }], edges: [{ id: 'e', from: 's', fromPort: 'out', to: 'o' }] });
  const plan = core.scheduler.upcoming().find((x) => x.agentId === a.id);
  assert.ok(plan.at > Date.now());
  const realNow = Date.now;
  Date.now = () => plan.at + 1000;
  try { core.scheduler.tick(); } finally { Date.now = realNow; }
  await new Promise((r) => setTimeout(r, 50));
  const run = core.store.runs.all().find((r) => r.agentId === a.id);
  assert.ok(run, 'a run was started');
  assert.equal((await core.engine.wait(run.id)).output.text, 'fired true');
});
