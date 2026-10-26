// AI CodeFix: settings, prompts, providers (faked) and applying a proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ai = require('../core/aifix.js');
const { createApi } = require('../core/api.js');

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-ai-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'function run(input) {\r\n  return eval(input);\r\n}\r\n');
  return dir;
}

const ISSUE = { key: 'k1', rule: 'js:eval', file: 'a.js', line: 2, lang: 'js', message: { en: 'Do not use eval', ko: 'eval 금지' } };

// A stand-in for the SDK client: records the request, returns a canned message.
function fakeAnthropic(replyText, extra = {}) {
  const calls = [];
  const create = async (req) => { calls.push(req); return { model: req.model, stop_reason: 'end_turn', content: [{ type: 'text', text: replyText }], usage: { input_tokens: 10, output_tokens: 5 }, ...extra }; };
  return { calls, client: { messages: { create }, beta: { messages: { create } } } };
}

test('settings: defaults, masked key, validation', () => {
  const ws = { settings: {} };
  assert.equal(ai.settingsOf(ws).provider, 'anthropic');
  ai.saveSettings(ws, { enabled: true, apiKey: 'sk-secret', effort: 'bogus', maxTokens: 999999 });
  const pub = ai.publicSettings(ws);
  assert.equal(pub.apiKey, ai.MASK);
  assert.equal(pub.defaultModel, 'claude-opus-5-5');
  assert.equal(ws.settings.ai.effort, 'medium');
  assert.equal(ws.settings.ai.maxTokens, 128000);
  ai.saveSettings(ws, { ...pub, model: 'claude-sonnet-5-5' });
  assert.equal(ws.settings.ai.apiKey, 'sk-secret', 'the mask keeps the stored key');
  assert.throws(() => ai.saveSettings(ws, { provider: 'nope' }), /provider/);
});

test('reply parsing finds the JSON object around extra text', () => {
  assert.deepEqual(ai.parseReply('Here:\n{"startLine": 2, "endLine": 2, "replacement": "a {b}", "explanation": "x"}\nthanks'), { startLine: 2, endLine: 2, replacement: 'a {b}', explanation: 'x' });
  assert.throws(() => ai.parseReply('no json'), (e) => e.code === 'AI_BAD_REPLY');
});

test('Claude: request shape, proposal, and applying it keeps CRLF', async () => {
  const dir = project();
  const reply = JSON.stringify({ startLine: 2, endLine: 2, replacement: '  return JSON.parse(input);', explanation: 'eval 대신 JSON.parse 를 씁니다.', confidence: 'high' });
  const fake = fakeAnthropic(reply);
  const settings = { ...ai.DEFAULTS, enabled: true };
  const p = await ai.proposeFix(settings, { projectPath: dir, issue: ISSUE, rule: { name: { en: 'eval' }, why: { en: 'code injection' } } }, { anthropicClient: fake.client });
  const req = fake.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.output_config, { effort: 'medium' });
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.fallbacks, 'default');
  assert.match(req.messages[0].content, /2\| {3}return eval\(input\);/);
  assert.equal(p.original, '  return eval(input);');
  assert.equal(p.confidence, 'high');
  const r = ai.applyFix(dir, p);
  assert.equal(r.linesAdded, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'function run(input) {\r\n  return JSON.parse(input);\r\n}\r\n');
  assert.throws(() => ai.applyFix(dir, p), (e) => e.code === 'CONFLICT', 'a stale proposal is refused');
  // Undo puts the original source back, once.
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-ai-undo-'));
  const undoId = ai.saveUndo(store, dir, r);
  ai.revertFix(store, undoId);
  assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'function run(input) {\r\n  return eval(input);\r\n}\r\n');
  assert.throws(() => ai.revertFix(store, undoId), (e) => e.code === 'NOT_FOUND');
  assert.throws(() => ai.revertFix(store, '../x'), (e) => e.code === 'NOT_FOUND');
});

test('an undo is refused when the file changed after the fix', () => {
  const dir = project();
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-ai-undo-'));
  const full = path.join(dir, 'a.js');
  const before = fs.readFileSync(full, 'utf8');
  fs.writeFileSync(full, 'fixed\n');
  const undoId = ai.saveUndo(store, dir, { file: 'a.js', fileHash: require('crypto').createHash('sha256').update('fixed\n').digest('hex').slice(0, 16), previous: before });
  const control = ai.saveUndo(store, dir, { file: 'a.js', fileHash: require('crypto').createHash('sha256').update('fixed\n').digest('hex').slice(0, 16), previous: before });
  ai.revertFix(store, control);
  assert.equal(fs.readFileSync(full, 'utf8'), before, 'an unchanged file is restored');
  fs.writeFileSync(full, 'fixed\n');
  fs.writeFileSync(full, 'edited later\n');
  assert.throws(() => ai.revertFix(store, undoId), (e) => e.code === 'CONFLICT');
});

test('refusals, out-of-window lines, "no fix" and the off switch', async () => {
  const dir = project();
  const settings = { ...ai.DEFAULTS, enabled: true };
  const refused = fakeAnthropic('', { stop_reason: 'refusal', stop_details: { explanation: 'policy' } });
  await assert.rejects(ai.proposeFix(settings, { projectPath: dir, issue: ISSUE }, { anthropicClient: refused.client }), (e) => e.code === 'AI_REFUSED');
  const wild = fakeAnthropic('{"startLine": 500, "endLine": 501, "replacement": ""}');
  await assert.rejects(ai.proposeFix(settings, { projectPath: dir, issue: ISSUE }, { anthropicClient: wild.client }), (e) => e.code === 'AI_BAD_REPLY');
  const none = fakeAnthropic('{"startLine": 0, "explanation": "false positive"}');
  const p = await ai.proposeFix(settings, { projectPath: dir, issue: ISSUE }, { anthropicClient: none.client });
  assert.equal(p.noFix, true);
  assert.throws(() => ai.applyFix(dir, p), /Nothing to apply/);
  await assert.rejects(ai.proposeFix({ ...settings, enabled: false }, { projectPath: dir, issue: ISSUE }), (e) => e.code === 'AI_NOT_CONFIGURED');
  await assert.rejects(ai.proposeFix(settings, { projectPath: dir, issue: { ...ISSUE, file: '../x.js' } }), /Invalid path/);
});

test('OpenAI-compatible and Ollama providers', async () => {
  const dir = project();
  const seen = [];
  const fetchFake = async (url, init) => {
    seen.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    const content = '{"startLine": 2, "endLine": 2, "replacement": "  return input;", "explanation": "ok"}';
    const body = url.endsWith('/api/chat') ? { model: 'qwen', message: { content } } : { model: 'gpt', choices: [{ message: { content } }], usage: { prompt_tokens: 3, completion_tokens: 4 } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const oa = await ai.proposeFix({ ...ai.DEFAULTS, enabled: true, provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1/', model: 'local', apiKey: 'k' }, { projectPath: dir, issue: ISSUE }, { fetch: fetchFake });
  assert.equal(seen[0].url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(seen[0].init.headers.authorization, 'Bearer k');
  assert.equal(seen[0].init.body.messages[0].role, 'system');
  assert.equal(oa.replacement, '  return input;');
  const ol = await ai.proposeFix({ ...ai.DEFAULTS, enabled: true, provider: 'ollama' }, { projectPath: dir, issue: ISSUE }, { fetch: fetchFake });
  assert.equal(seen[1].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(seen[1].init.body.format, 'json');
  assert.equal(ol.model, 'qwen');
  await assert.rejects(ai.proposeFix({ ...ai.DEFAULTS, enabled: true, provider: 'openai-compatible' }, { projectPath: dir, issue: ISSUE }, { fetch: fetchFake }), (e) => e.code === 'AI_NOT_CONFIGURED');
});

test('API: settings round trip, permissions table, and the off state', async () => {
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-ai-api-')) });
  const r = await api.call('project.scan', { path: path.resolve('samples/demo') });
  const saved = await api.call('ai.save', { ai: { enabled: false, provider: 'ollama', model: 'qwen2.5-coder' } });
  assert.equal(saved.provider, 'ollama');
  assert.equal((await api.call('ai.get')).model, 'qwen2.5-coder');
  const key = r.analysis.issues[0].key;
  await assert.rejects(api.call('issue.aiFix', { projectId: r.project.id, key }), (e) => e.code === 'AI_NOT_CONFIGURED');
});
