// Cursor's Cloud Agents API and Ollama's "model not installed" answer, against local stand-ins (no internet).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chat, listModels, cursorTarget, PROVIDERS } from '../../core/providers/index.js';

const seen = [];
let polls = 0;
let runEnd = 'FINISHED';
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization === `Basic ${Buffer.from('bad:').toString('base64')}`) return send(401, { error: { code: 'unauthorized', message: 'Invalid API key' } });
    // Cursor Cloud Agents API v1
    if (req.method === 'POST' && req.url === '/v1/agents') { polls = 0; return send(201, { agent: { id: 'bc-1', status: 'ACTIVE', latestRunId: 'run-1' }, run: { id: 'run-1', agentId: 'bc-1', status: 'CREATING' } }); }
    if (req.method === 'GET' && req.url === '/v1/agents/bc-1/runs/run-1') {
      polls += 1;
      if (polls < 3) return send(200, { id: 'run-1', agentId: 'bc-1', status: 'RUNNING' });
      return send(200, { id: 'run-1', agentId: 'bc-1', status: runEnd, result: runEnd === 'FINISHED' ? 'done: README updated' : undefined, git: { branches: [{ repoUrl: 'github.com/o/r', branch: 'cursor/x', prUrl: 'https://github.com/o/r/pull/7' }] } });
    }
    if (req.method === 'POST' && req.url.endsWith('/archive')) return send(200, { id: 'bc-1' });
    if (req.method === 'POST' && req.url.endsWith('/cancel')) return send(200, { id: 'run-1' });
    if (req.url === '/v1/models') return send(200, { items: [{ id: 'composer-2' }, { id: 'claude-4-sonnet-thinking' }] });
    // Ollama
    if (req.url === '/api/chat') return body.model === 'llava3.3' ? send(404, { error: `model '${body.model}' not found` }) : send(200, { model: body.model, message: { role: 'assistant', content: 'seen' }, done_reason: 'stop' });
    if (req.url === '/v1/messages') return send(200, { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'seen' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    if (req.url === '/oa/chat/completions') return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: 'seen' } }], usage: {} });
    if (req.url.startsWith('/gm/models/')) return send(200, { candidates: [{ content: { parts: [{ text: 'seen' }] } }] });
    if (req.url === '/api/tags') return send(200, { models: [{ name: 'llama3.3:latest' }, { name: 'gemma4:e4b' }] });
    return send(404, { error: { message: 'no route' } });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('Cursor is offered as a model provider that needs a key', () => {
  const p = PROVIDERS.find((x) => x.id === 'cursor');
  assert.ok(p?.needsKey);
  assert.equal(p.env, 'CURSOR_API_KEY');
});

test('Cursor: the base URL may carry a repository and branch', () => {
  assert.deepEqual(cursorTarget({ baseUrl: 'https://api.cursor.com/#https://github.com/o/r@dev' }), { base: 'https://api.cursor.com', repo: { url: 'https://github.com/o/r', startingRef: 'dev' } });
  assert.deepEqual(cursorTarget({}), { base: 'https://api.cursor.com', repo: null });
});

test('Cursor: a call starts an agent, waits for its run and returns the result', async () => {
  seen.length = 0;
  const r = await chat({ provider: 'cursor', model: 'composer-2', credential: { apiKey: 'key_1', baseUrl: `${base}#https://github.com/o/r@main` }, system: 'Be brief.', messages: [{ role: 'user', content: 'Update the README' }], pollMs: 5 });
  assert.equal(r.text, 'done: README updated');
  assert.equal(r.git[0].prUrl, 'https://github.com/o/r/pull/7');
  const create = seen.find((s) => s.method === 'POST' && s.url === '/v1/agents');
  assert.equal(create.auth, `Basic ${Buffer.from('key_1:').toString('base64')}`);
  assert.deepEqual(create.body.model, { id: 'composer-2' });
  assert.deepEqual(create.body.repos, [{ url: 'https://github.com/o/r', startingRef: 'main' }]);
  assert.match(create.body.prompt.text, /Be brief\.[\s\S]*Update the README/);
  assert.equal(seen.filter((s) => s.url === '/v1/agents/bc-1/runs/run-1').length, 3, 'polled until finished');
});

test('Cursor: the default model sends no model; JSON asks for JSON; a failed run is an error', async () => {
  seen.length = 0;
  await chat({ provider: 'cursor', model: 'default', credential: { apiKey: 'k', baseUrl: base }, messages: [{ role: 'user', content: 'x' }], json: true, pollMs: 5 });
  const create = seen.find((s) => s.url === '/v1/agents');
  assert.equal(create.body.model, undefined);
  assert.equal(create.body.repos, undefined);
  assert.match(create.body.prompt.text, /JSON/);
  runEnd = 'ERROR';
  await assert.rejects(chat({ provider: 'cursor', model: 'default', credential: { apiKey: 'k', baseUrl: base }, messages: [{ role: 'user', content: 'x' }], pollMs: 5 }), /ended ERROR/);
  runEnd = 'FINISHED';
});

test('Cursor: a bad key and no key are clear errors; cancelling cancels the run', async () => {
  await assert.rejects(chat({ provider: 'cursor', model: 'default', credential: { apiKey: 'bad', baseUrl: base }, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'PROVIDER_AUTH' && /Invalid API key/.test(e.message));
  await assert.rejects(chat({ provider: 'cursor', model: 'default', credential: {}, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'NO_API_KEY');
  seen.length = 0;
  const ac = new AbortController();
  const p = chat({ provider: 'cursor', model: 'default', credential: { apiKey: 'k', baseUrl: base }, messages: [{ role: 'user', content: 'x' }], pollMs: 200, signal: ac.signal });
  setTimeout(() => ac.abort(), 50);
  await assert.rejects(p, (e) => e.code === 'CANCELLED');
  assert.ok(seen.some((s) => s.url.endsWith('/runs/run-1/cancel')), 'the run was cancelled');
});

test('Cursor: model list from /v1/models', async () => {
  assert.deepEqual(await listModels('cursor', { apiKey: 'k', baseUrl: base }), ['default', 'composer-2', 'claude-4-sonnet-thinking']);
});

test('Ollama: a model that is not installed names the installed ones and how to pull it', async () => {
  await assert.rejects(chat({ provider: 'ollama', model: 'llava3.3', credential: { baseUrl: base }, messages: [{ role: 'user', content: 'hi' }] }), (e) => e.code === 'MODEL_NOT_INSTALLED' && /llama3\.3:latest, gemma4:e4b/.test(e.message) && /ollama pull llava3\.3/.test(e.message));
});

test('pictures go to every provider in its own shape (Claude, OpenAI, Gemini, Ollama, Cursor)', async () => {
  const img = { mime: 'image/png', data: 'iVBORw0KGgo=' };
  const messages = [{ role: 'user', content: 'What is this?', images: [img] }];
  seen.length = 0;
  await chat({ provider: 'anthropic', model: 'claude-opus-5-5', credential: { apiKey: 'k', baseUrl: base }, messages });
  const claude = seen.find((x) => x.url === '/v1/messages').body.messages[0].content;
  assert.deepEqual(claude[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: img.data } });
  assert.deepEqual(claude[1], { type: 'text', text: 'What is this?' });
  await chat({ provider: 'compatible', model: 'x', credential: { baseUrl: `${base}/oa` }, messages });
  const oa = seen.find((x) => x.url === '/oa/chat/completions').body.messages[0].content;
  assert.deepEqual(oa[1], { type: 'image_url', image_url: { url: `data:image/png;base64,${img.data}` } });
  await chat({ provider: 'gemini', model: 'g', credential: { apiKey: 'k', baseUrl: `${base}/gm` }, messages });
  const gm = seen.find((x) => x.url.startsWith('/gm/')).body.contents[0].parts;
  assert.deepEqual(gm[0], { inlineData: { mimeType: 'image/png', data: img.data } });
  await chat({ provider: 'ollama', model: 'llava', credential: { baseUrl: base }, messages });
  assert.deepEqual(seen.find((x) => x.url === '/api/chat').body.messages.at(-1).images, [img.data]);
  await chat({ provider: 'cursor', model: 'default', credential: { apiKey: 'k', baseUrl: base }, messages, pollMs: 5 });
  assert.deepEqual(seen.find((x) => x.url === '/v1/agents').body.prompt.images, [{ data: img.data, mimeType: 'image/png' }]);
  // without pictures the user message stays plain text
  seen.length = 0;
  await chat({ provider: 'anthropic', model: 'claude-opus-5-5', credential: { apiKey: 'k', baseUrl: base }, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(seen.find((x) => x.url === '/v1/messages').body.messages[0].content, 'hi');
});
