// AI providers, stream parsing, settings and note actions (node:test, no network, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  PROVIDERS, ANTHROPIC_VERSION, buildChatRequest, buildModelsRequest, createStreamParser, parseChatResponse, parseError, parseModels, providerById,
} = await import('../../src/ai/providers.js');
const { defaultAiSettings, normalizeAiSettings, isConfigured, withProvider } = await import('../../src/ai/settings.js');
const { AI_ACTIONS, aiActionById, applyResult, parseTags, stripFence, buildContextBlock, clip } = await import('../../src/ai/actions.js');
const { AI_TEXTS } = await import('../../src/ai/texts.js');

const chat = { system: 'Be brief.', messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: '안녕?' }], temperature: 0.3, maxTokens: 500 };

/** Feeds `text` to a parser in pieces of `size` characters; returns the joined deltas. */
function feed(kind, text, size) {
  const parser = createStreamParser(kind);
  let out = '';
  for (let i = 0; i < text.length; i += size) out += parser.push(text.slice(i, i + size)).join('');
  return out + parser.end().join('');
}

// ───────────────────────── providers

test('every provider is complete and has a unique id', () => {
  const ids = new Set();
  for (const p of PROVIDERS) {
    assert.ok(p.id && !ids.has(p.id), p.id);
    ids.add(p.id);
    assert.ok(['openai', 'anthropic', 'gemini', 'ollama', 'azure'].includes(p.kind), p.id);
    assert.equal(typeof p.name, 'string');
    assert.ok(Array.isArray(p.models));
    assert.equal(typeof p.needsKey, 'boolean');
  }
  for (const id of ['openai', 'anthropic', 'gemini', 'azure', 'mistral', 'groq', 'deepseek', 'xai', 'openrouter', 'perplexity', 'together', 'ollama', 'lmstudio', 'custom']) assert.ok(providerById(id), id);
  assert.equal(providerById('ollama').baseUrl, 'http://localhost:11434');
  assert.equal(providerById('lmstudio').baseUrl, 'http://localhost:1234/v1');
  assert.equal(providerById('ollama').needsKey, false);
});

test('OpenAI-compatible request: bearer key, system first, stream flag', () => {
  const r = buildChatRequest('mistral', { apiKey: 'k1' }, { ...chat, stream: true });
  assert.equal(r.url, 'https://api.mistral.ai/v1/chat/completions');
  assert.equal(r.method, 'POST');
  assert.equal(r.headers.Authorization, 'Bearer k1');
  const body = JSON.parse(r.body);
  assert.equal(body.model, 'mistral-small-latest');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'Be brief.' });
  assert.equal(body.messages.length, 4);
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 500);
  assert.equal(body.stream, true);
  assert.equal(r.stream, true);
});

test('OpenAI reasoning models take max_completion_tokens and no temperature', () => {
  const body = JSON.parse(buildChatRequest('openai', { apiKey: 'k', model: 'gpt-5-mini' }, chat).body);
  assert.equal(body.max_completion_tokens, 500);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.temperature, undefined);
  const old = JSON.parse(buildChatRequest('openai', { apiKey: 'k', model: 'gpt-4o-mini' }, chat).body);
  assert.equal(old.max_tokens, 500);
  assert.equal(old.temperature, 0.3);
});

test('base URL: saved value wins, trailing slashes trimmed; custom without key sends no Authorization', () => {
  const r = buildChatRequest('custom', { baseUrl: 'http://my-proxy:8080/v1///', model: 'm' }, chat);
  assert.equal(r.url, 'http://my-proxy:8080/v1/chat/completions');
  assert.equal(r.headers.Authorization, undefined);
  assert.throws(() => buildChatRequest('custom', { model: 'm' }, chat), /base URL/);
  assert.throws(() => buildChatRequest('lmstudio', {}, chat), /model/);
});

test('Anthropic request: x-api-key, version, browser header, system field, no temperature', () => {
  const r = buildChatRequest('anthropic', { apiKey: 'sk-ant' }, { ...chat, messages: [{ role: 'assistant', content: 'earlier' }, ...chat.messages] });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'sk-ant');
  assert.equal(r.headers['anthropic-version'], ANTHROPIC_VERSION);
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(r.headers.Authorization, undefined);
  const body = JSON.parse(r.body);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.system, 'Be brief.');
  assert.equal(body.max_tokens, 500);
  assert.equal(body.temperature, undefined);
  assert.equal(body.stream, true);
  assert.equal(body.messages[0].role, 'user', 'starts with a user turn');
  for (let i = 1; i < body.messages.length; i += 1) assert.notEqual(body.messages[i].role, body.messages[i - 1].role, 'roles alternate');
});

test('Gemini request: model URL, alt=sse when streaming, contents with model role', () => {
  const r = buildChatRequest('gemini', { apiKey: 'g' }, chat);
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
  assert.equal(r.headers['x-goog-api-key'], 'g');
  const body = JSON.parse(r.body);
  assert.deepEqual(body.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.equal(body.contents[2].parts[0].text, '안녕?');
  assert.equal(body.systemInstruction.parts[0].text, 'Be brief.');
  assert.deepEqual(body.generationConfig, { temperature: 0.3, maxOutputTokens: 500 });
  const plain = buildChatRequest('gemini', { apiKey: 'g', model: 'models/gemini-2.5-pro' }, { ...chat, stream: false });
  assert.match(plain.url, /models\/gemini-2\.5-pro:generateContent$/);
});

test('Azure request: deployment URL, api-version, api-key header, no model in body', () => {
  const r = buildChatRequest('azure', { apiKey: 'az', baseUrl: 'https://res.openai.azure.com/', model: 'my-gpt4o', apiVersion: '2024-10-21' }, chat);
  assert.equal(r.url, 'https://res.openai.azure.com/openai/deployments/my-gpt4o/chat/completions?api-version=2024-10-21');
  assert.equal(r.headers['api-key'], 'az');
  assert.equal(r.headers.Authorization, undefined);
  const body = JSON.parse(r.body);
  assert.equal(body.model, undefined);
  assert.equal(body.max_tokens, 500);
  const full = buildChatRequest('azure', { apiKey: 'az', baseUrl: 'https://res.openai.azure.com/openai/deployments/dep1', model: 'ignored' }, chat);
  assert.match(full.url, /^https:\/\/res\.openai\.azure\.com\/openai\/deployments\/dep1\/chat\/completions\?api-version=/);
});

test('Ollama request: /api/chat, options, no key', () => {
  const r = buildChatRequest('ollama', {}, chat);
  assert.equal(r.url, 'http://localhost:11434/api/chat');
  assert.equal(r.headers.Authorization, undefined);
  const body = JSON.parse(r.body);
  assert.equal(body.model, 'llama3.2');
  assert.equal(body.stream, true);
  assert.deepEqual(body.options, { temperature: 0.3, num_predict: 500 });
  assert.equal(body.messages[0].role, 'system');
});

test('models requests per kind (or null without an endpoint)', () => {
  assert.equal(buildModelsRequest('openai', { apiKey: 'k' }).url, 'https://api.openai.com/v1/models');
  assert.equal(buildModelsRequest('openai', { apiKey: 'k' }).method, 'GET');
  assert.equal(buildModelsRequest('anthropic', { apiKey: 'k' }).headers['x-api-key'], 'k');
  assert.equal(buildModelsRequest('ollama', {}).url, 'http://localhost:11434/api/tags');
  assert.match(buildModelsRequest('gemini', { apiKey: 'g' }).url, /\/v1beta\/models\?/);
  assert.equal(buildModelsRequest('perplexity', { apiKey: 'k' }), null);
  assert.equal(buildModelsRequest('azure', { apiKey: 'k' }), null);
});

test('model list parsing per kind', () => {
  assert.deepEqual(parseModels('openai', { data: [{ id: 'gpt-4o' }, { id: 'gpt-4.1' }, { id: 'gpt-4o' }] }), ['gpt-4.1', 'gpt-4o']);
  assert.deepEqual(parseModels('openai', [{ id: 'b' }, { id: 'a' }]), ['a', 'b'], 'Together answers with a bare array');
  assert.deepEqual(parseModels('anthropic', { data: [{ id: 'claude-opus-5-5', type: 'model' }], has_more: false }), ['claude-opus-5-5']);
  assert.deepEqual(parseModels('gemini', { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] }), ['gemini-2.5-flash']);
  assert.deepEqual(parseModels('ollama', { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:latest' }] }), ['llama3.2:latest', 'qwen2.5:7b']);
  assert.deepEqual(parseModels('openai', null), []);
});

// ───────────────────────── streams

const openAiStream = [
  'data: {"id":"1","choices":[{"delta":{"role":"assistant"}}]}',
  '',
  'data: {"id":"1","choices":[{"delta":{"content":"Hel"}}]}',
  '',
  ': keep-alive',
  '',
  'data: {"id":"1","choices":[{"delta":{"content":"lo, 세계"}}]}',
  '',
  'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
].join('\n');

test('OpenAI SSE: the same text for every chunk size (lines split across chunks)', () => {
  for (const size of [1, 2, 3, 7, 13, 64, 10000]) assert.equal(feed('openai', openAiStream, size), 'Hello, 세계', `size ${size}`);
  assert.equal(feed('openai', openAiStream.replace(/\n/g, '\r\n'), 5), 'Hello, 세계', 'CRLF');
});

test('SSE without a final newline still yields the last event', () => {
  assert.equal(feed('openai', 'data: {"choices":[{"delta":{"content":"end"}}]}', 4), 'end');
});

test('SSE data split over several data: lines in one event', () => {
  const text = 'data: {"choices":[{"delta":\ndata: {"content":"joined"}}]}\n\n';
  assert.equal(feed('openai', text, 3), 'joined');
});

const anthropicStream = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  'event: ping',
  'data: {"type": "ping"}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" Claude"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":0}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

test('Anthropic SSE: only text_delta counts', () => {
  for (const size of [1, 5, 17, 1000]) assert.equal(feed('anthropic', anthropicStream, size), 'Hello Claude', `size ${size}`);
  // A thinking block's deltas are not text.
  const thinking = 'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n';
  assert.equal(feed('anthropic', thinking, 3), '');
});

test('Anthropic SSE error event throws', () => {
  const parser = createStreamParser('anthropic');
  assert.throws(() => parser.push('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n'), /Overloaded/);
});

test('Gemini SSE', () => {
  const text = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Gem"}],"role":"model"}}]}',
    '',
    'data: {"candidates":[{"content":{"parts":[{"text":"ini"},{"text":"!"}],"role":"model"},"finishReason":"STOP"}]}',
    '',
  ].join('\r\n');
  for (const size of [1, 9, 500]) assert.equal(feed('gemini', text, size), 'Gemini!', `size ${size}`);
});

test('Ollama NDJSON split across chunks', () => {
  const text = [
    '{"model":"llama3.2","message":{"role":"assistant","content":"Ol"},"done":false}',
    '{"model":"llama3.2","message":{"role":"assistant","content":"lama 🦙"},"done":false}',
    '{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true,"total_duration":1}',
  ].join('\n');
  for (const size of [1, 4, 33, 999]) assert.equal(feed('ollama', text, size), 'Ollama 🦙', `size ${size}`);
  assert.throws(() => createStreamParser('ollama').push('{"error":"model \\"x\\" not found"}\n'), /not found/);
});

test('OpenAI-compatible stream error object throws', () => {
  assert.throws(() => createStreamParser('openai').push('data: {"error":{"message":"quota exceeded"}}\n\n'), /quota/);
});

test('non-streamed responses', () => {
  assert.equal(parseChatResponse('openai', { choices: [{ message: { role: 'assistant', content: 'A' } }] }), 'A');
  assert.equal(parseChatResponse('azure', { choices: [{ message: { content: 'Az' } }] }), 'Az');
  assert.equal(parseChatResponse('anthropic', { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'B' }, { type: 'text', text: 'C' }] }), 'BC');
  assert.equal(parseChatResponse('gemini', { candidates: [{ content: { parts: [{ text: 'D' }] } }] }), 'D');
  assert.equal(parseChatResponse('ollama', { message: { content: 'E' } }), 'E');
  assert.equal(parseChatResponse('openai', {}), '');
});

test('error messages from each provider shape', () => {
  assert.equal(parseError('openai', 401, '{"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}'), 'HTTP 401 (Unauthorized: check the API key): Incorrect API key provided');
  assert.match(parseError('anthropic', 529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), /^HTTP 529 \(Overloaded\): overloaded_error: Overloaded$/);
  assert.match(parseError('gemini', 400, '{"error":{"code":400,"message":"API key not valid.","status":"INVALID_ARGUMENT"}}'), /INVALID_ARGUMENT: API key not valid\./);
  assert.match(parseError('gemini', 400, '[{"error":{"code":400,"message":"Bad","status":"INVALID_ARGUMENT"}}]'), /Bad/);
  assert.match(parseError('ollama', 404, '{"error":"model \\"nope\\" not found, try pulling it first"}'), /^HTTP 404 .*not found/);
  assert.match(parseError('openai', 422, '{"detail":[{"msg":"field required"}]}'), /field required/);
  assert.match(parseError('openai', 502, '<html><body><h1>502 Bad Gateway</h1></body></html>'), /^HTTP 502 \(Bad gateway\): 502 Bad Gateway$/);
  assert.equal(parseError('openai', 500, ''), 'HTTP 500 (Server error)');
});

// ───────────────────────── settings

test('default AI settings have every provider and the documented shape', () => {
  const ai = defaultAiSettings();
  assert.equal(ai.provider, 'openai');
  assert.deepEqual(Object.keys(ai.providers).sort(), PROVIDERS.map((p) => p.id).sort());
  assert.deepEqual(ai.context, { note: true, selection: true, linked: false, vaultSearch: false });
  assert.equal(ai.providers.azure.apiVersion, '2024-10-21');
  assert.equal(ai.providers.ollama.baseUrl, 'http://localhost:11434');
  assert.deepEqual(normalizeAiSettings(ai), ai);
});

test('normalizeAiSettings repairs bad and partial values', () => {
  const ai = normalizeAiSettings({
    provider: 'nope', temperature: 9, maxTokens: -5, systemPrompt: 42, chatHistoryLimit: '20',
    context: { note: false, linked: 'yes', extra: true }, providers: { anthropic: { apiKey: '  sk-1  ', model: '' }, bogus: { apiKey: 'x' } }, junk: 1,
  });
  assert.equal(ai.provider, 'openai');
  assert.equal(ai.temperature, 2);
  assert.equal(ai.maxTokens, 64);
  assert.equal(ai.systemPrompt, '');
  assert.equal(ai.chatHistoryLimit, 20);
  assert.deepEqual(ai.context, { note: false, selection: true, linked: false, vaultSearch: false });
  assert.equal(ai.providers.anthropic.apiKey, 'sk-1');
  assert.equal(ai.providers.anthropic.model, 'claude-opus-5-5');
  assert.equal(ai.providers.bogus, undefined);
  assert.equal(ai.junk, undefined);
  assert.deepEqual(normalizeAiSettings(null), defaultAiSettings());
  assert.deepEqual(normalizeAiSettings('garbage'), defaultAiSettings());
  assert.equal(normalizeAiSettings({ temperature: 0.33 }).temperature, 0.3);
});

test('isConfigured: key when needed, base URL, model; withProvider patches one provider', () => {
  let ai = defaultAiSettings();
  assert.equal(isConfigured(ai), false);
  assert.equal(isConfigured(ai, 'ollama'), true, 'local Ollama needs no key');
  assert.equal(isConfigured(ai, 'lmstudio'), false, 'LM Studio has no default model');
  assert.equal(isConfigured(ai, 'azure'), false);
  ai = withProvider(ai, 'openai', { apiKey: 'k' });
  assert.equal(isConfigured(ai), true);
  ai = withProvider(ai, 'azure', { apiKey: 'k', model: 'dep' });
  assert.equal(isConfigured(ai, 'azure'), false, 'placeholder endpoint');
  ai = withProvider(ai, 'azure', { baseUrl: 'https://r.openai.azure.com' });
  assert.equal(isConfigured(ai, 'azure'), true);
  assert.equal(isConfigured(ai, 'unknown'), false);
});

// ───────────────────────── actions

test('every action has a label in both languages and builds a prompt', () => {
  const ids = new Set();
  const ctx = { selection: 'Some selected text.', note: '# Title\n\nBody text.', title: 'Title', language: 'ko', question: 'What?' };
  for (const action of AI_ACTIONS) {
    assert.ok(!ids.has(action.id), action.id);
    ids.add(action.id);
    assert.ok(['replace', 'insertBelow', 'append', 'chat', 'properties'].includes(action.apply), action.id);
    assert.ok(AI_TEXTS.ko[action.labelKey] && AI_TEXTS.en[action.labelKey], action.labelKey);
    assert.ok(action.icon.startsWith('ai'), action.id);
    const prompt = action.prompt(ctx);
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 0, action.id);
    if (action.needsSelection) assert.ok(prompt.includes('Some selected text.'), `${action.id} uses the selection`);
  }
  assert.equal(AI_ACTIONS.length, 20);
  assert.ok(aiActionById('translateKo').prompt(ctx).includes('Korean'));
  assert.ok(aiActionById('summarizeNote').prompt(ctx).includes('Body text.'));
  assert.equal(aiActionById('askVault').prompt(ctx), 'What?');
  assert.equal(aiActionById('tags').apply, 'properties');
  assert.equal(aiActionById('nope'), null);
});

test('tags are parsed from lists, hashes and commas', () => {
  assert.deepEqual(parseTags('- #Project Alpha\n- meeting\n2. notes\n#notes'), ['project-alpha', 'meeting', 'notes']);
  assert.deepEqual(parseTags('```\nai, Machine Learning , ai\n```'), ['ai', 'machine-learning']);
  assert.deepEqual(parseTags('Tags:\nkorean'), ['korean']);
});

test('applyResult per apply kind', () => {
  assert.deepEqual(applyResult(aiActionById('improve'), '```markdown\nBetter text.\n```'), { kind: 'replace', text: 'Better text.' });
  assert.deepEqual(applyResult(aiActionById('actionItems'), '- [ ] Call Bob'), { kind: 'append', text: '\n\n- [ ] Call Bob\n' });
  assert.deepEqual(applyResult(aiActionById('continue'), 'More.'), { kind: 'insertBelow', text: '\n\nMore.\n' });
  assert.deepEqual(applyResult(aiActionById('tags'), 'b\na', { existingTags: ['a', 'old'] }), { kind: 'properties', tags: ['a', 'old', 'b'], text: '#a #old #b' });
  assert.equal(applyResult(aiActionById('explain'), '  keep  ').text, '  keep  ');
  assert.equal(stripFence('```\nx\n```'), 'x');
  assert.equal(stripFence('text with ``` inside'), 'text with ``` inside');
});

test('context block contains only what is on, and long text is marked when cut', () => {
  assert.equal(buildContextBlock({}), '');
  const block = buildContextBlock({
    note: { path: 'a.md', title: 'A', text: 'alpha' }, selection: 'sel',
    linked: [{ path: 'b.md', title: 'B', text: 'beta' }], search: [{ path: 'c.md', title: 'C', excerpt: 'gamma' }],
  });
  for (const part of ['alpha', 'sel', 'beta', 'gamma', 'a.md', 'b.md', 'c.md']) assert.ok(block.includes(part), part);
  assert.ok(!buildContextBlock({ selection: '   ' }).includes('selection'));
  const cut = clip('x'.repeat(50), 10);
  assert.ok(cut.startsWith('x'.repeat(10)));
  assert.match(cut, /40 more characters not included/);
});

test('AI texts: Korean and English have the same keys, all prefixed ai.', () => {
  assert.deepEqual(Object.keys(AI_TEXTS.ko).sort(), Object.keys(AI_TEXTS.en).sort());
  for (const key of Object.keys(AI_TEXTS.ko)) assert.ok(key.startsWith('ai.'), key);
});
