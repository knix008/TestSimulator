// The model adapters against local stand-ins of each provider's HTTP API: request shape, tool calls and
// tool results going back, JSON mode, errors. No internet and no real keys are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chat, listModels } from '../../core/providers/index.js';

const seen = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ url: req.url, headers: req.headers, body });
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (String(req.headers.authorization ?? '').endsWith(' bad') || req.headers['x-api-key'] === 'bad') return send(401, { error: { type: 'authentication_error', message: 'invalid key' } });
    // Anthropic Messages API
    if (req.url === '/v1/messages') {
      const last = body.messages.at(-1);
      if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') return send(200, { id: 'm2', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: `result was ${last.content[0].content}` }], stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 5 } });
      if (body.tools?.length) return send(200, { id: 'm1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'calculator', input: { expression: '2+2' } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 3 } });
      return send(200, { id: 'm0', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'hello from claude' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    }
    if (req.url === '/v1/models' || req.url.startsWith('/v1/models?')) return send(200, { data: [{ id: 'claude-opus-5-5', type: 'model' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' });
    // OpenAI-style chat completions
    if (req.url === '/oa/chat/completions') {
      const last = body.messages.at(-1);
      if (last.role === 'tool') return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: `tool said ${last.content}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4 } });
      if (body.tools) return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"3*3"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
      return send(200, { model: body.model, choices: [{ message: { role: 'assistant', content: body.response_format ? '{"ok":true}' : 'hi from openai' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }
    if (req.url === '/oa/models') return send(200, { data: [{ id: 'gpt-x' }, { id: 'gpt-a' }] });
    // Gemini generateContent
    if (req.url.startsWith('/gm/models/') && req.url.endsWith(':generateContent')) {
      const last = body.contents.at(-1);
      if (last.parts[0].functionResponse) return send(200, { candidates: [{ content: { role: 'model', parts: [{ text: `gemini got ${last.parts[0].functionResponse.response.result}` }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } });
      if (body.tools) return send(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'calculator', args: { expression: '5+5' } }, thoughtSignature: 'abc' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } });
      return send(200, { candidates: [{ content: { parts: [{ text: 'hi from gemini' }] } }] });
    }
    // Ollama
    if (req.url === '/api/chat') {
      const last = body.messages.at(-1);
      if (last.role === 'tool') return send(200, { model: body.model, message: { role: 'assistant', content: `ollama saw ${last.content}` }, done: true, prompt_eval_count: 3, eval_count: 2 });
      if (body.tools) return send(200, { model: body.model, message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'calculator', arguments: { expression: '1+1' } } }] }, done: true });
      return send(200, { model: body.model, message: { role: 'assistant', content: 'hi from ollama' }, done: true });
    }
    if (req.url === '/api/tags') return send(200, { models: [{ name: 'llama3.2' }, { name: 'qwen2.5' }] });
    return send(404, { error: 'no route' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const tools = [{ name: 'calculator', description: 'math', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } }];

/** One tool round trip: the call, then the result back to the model. */
async function roundTrip(provider, model, credential) {
  const messages = [{ role: 'user', content: 'compute' }];
  const first = await chat({ provider, model, credential, messages, tools });
  assert.equal(first.toolCalls.length, 1, `${provider} asked for a tool`);
  assert.equal(first.toolCalls[0].name, 'calculator');
  messages.push({ role: 'assistant', content: first.text, toolCalls: first.toolCalls, raw: first.raw, rawProvider: first.rawProvider });
  messages.push({ role: 'tool', toolCallId: first.toolCalls[0].id, name: 'calculator', content: '4' });
  return { first, second: await chat({ provider, model, credential, messages, tools }) };
}

test('Anthropic (official SDK): text, tool use and tool_result, thinking blocks sent back unchanged', async () => {
  const cred = { apiKey: 'test-key', baseUrl: base };
  const plain = await chat({ provider: 'anthropic', model: 'claude-opus-5-5', credential: cred, system: 'be brief', messages: [{ role: 'user', content: 'hi' }], effort: 'low' });
  assert.equal(plain.text, 'hello from claude');
  const req = seen.at(-1);
  assert.ok(req.headers['x-api-key'] === 'test-key' || String(req.headers.authorization).includes('test-key'), 'the key is sent');
  assert.equal(req.body.system, 'be brief');
  assert.deepEqual(req.body.output_config, { effort: 'low' });
  assert.ok(!('temperature' in req.body));
  const { first, second } = await roundTrip('anthropic', 'claude-opus-5-5', cred);
  assert.deepEqual(first.toolCalls[0].args, { expression: '2+2' });
  assert.equal(second.text, 'result was 4');
  const sent = seen.at(-1).body.messages;
  assert.equal(sent[1].content[0].type, 'thinking', 'the assistant turn went back as it came');
  assert.equal(sent[2].content[0].tool_use_id, 'tu1');
  await assert.rejects(() => chat({ provider: 'anthropic', model: 'claude-opus-5-5', credential: { apiKey: 'bad', baseUrl: base }, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'PROVIDER_AUTH');
});

test('OpenAI-compatible: tool calls, JSON mode, model list, bad key', async () => {
  const cred = { apiKey: 'k', baseUrl: `${base}/oa` };
  const { second } = await roundTrip('compatible', 'gpt-x', cred);
  assert.equal(second.text, 'tool said 4');
  assert.equal(seen.at(-1).body.messages.at(-2).tool_calls[0].function.name, 'calculator');
  assert.equal((await chat({ provider: 'openai', model: 'gpt-x', credential: cred, messages: [{ role: 'user', content: 'x' }], json: true })).text, '{"ok":true}');
  assert.deepEqual(await listModels('compatible', cred), ['gpt-a', 'gpt-x']);
  await assert.rejects(() => chat({ provider: 'openai', model: 'gpt-x', credential: { apiKey: 'bad', baseUrl: `${base}/oa` }, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'PROVIDER_AUTH');
});

test('Gemini: functionCall / functionResponse, thought signatures kept', async () => {
  const cred = { apiKey: 'g', baseUrl: `${base}/gm` };
  const { second } = await roundTrip('gemini', 'gemini-2.5-flash', cred);
  assert.equal(second.text, 'gemini got 4');
  const contents = seen.at(-1).body.contents;
  assert.equal(contents[1].parts[0].thoughtSignature, 'abc');
  assert.equal(seen.at(-1).headers['x-goog-api-key'], 'g');
});

test('Ollama: tool calls and the local model list', async () => {
  const cred = { baseUrl: base };
  const { second } = await roundTrip('ollama', 'llama3.2', cred);
  assert.equal(second.text, 'ollama saw 4');
  assert.deepEqual(await listModels('ollama', cred), ['llama3.2', 'qwen2.5']);
});

test('keys: a provider that needs one refuses without it; an unreachable server is reported', async () => {
  await assert.rejects(() => chat({ provider: 'openai', model: 'gpt-5', credential: {}, messages: [] }), (e) => e.code === 'NO_API_KEY');
  await assert.rejects(() => chat({ provider: 'ollama', model: 'x', credential: { baseUrl: 'http://127.0.0.1:9' }, messages: [{ role: 'user', content: 'x' }] }), (e) => e.code === 'PROVIDER_UNREACHABLE');
  await assert.rejects(() => chat({ provider: 'nope', model: 'x', messages: [] }), (e) => e.code === 'PROVIDER_UNKNOWN');
});
