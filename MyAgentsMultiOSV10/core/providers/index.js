// Model providers behind one call (ARCHITECTURE.md §5):
//
//   chat({ provider, model, credential, system, messages, tools, json, maxTokens, effort, signal })
//     → { text, toolCalls: [{ id, name, args }], usage: { input, output }, stop, raw, model }
//
// messages: [{ role: 'user' | 'assistant' | 'tool', content, toolCalls?, toolCallId?, name?, raw?, rawProvider? }]
// An assistant message keeps the provider's own content in `raw` so a tool loop sends it back unchanged
// (Claude's thinking blocks, Gemini's thought signatures).
//
// Claude uses the official SDK (@anthropic-ai/sdk); OpenAI, Gemini, Ollama and OpenAI-compatible servers are
// called over their HTTP APIs. 'mock' is an offline model for tests, demos and templates without a key.
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../errors.js';
import { mockChat } from './mock.js';

export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic Claude', icon: 'sparkles', needsKey: true, env: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'], keyUrl: 'https://platform.claude.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', icon: 'circleDot', needsKey: true, env: 'OPENAI_API_KEY', defaultModel: 'gpt-5', baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o-mini'], keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', icon: 'gem', needsKey: true, env: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'], keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'ollama', label: 'Ollama (local)', icon: 'server', needsKey: false, defaultModel: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', models: ['llama3.2', 'qwen2.5', 'gemma3'] },
  { id: 'cursor', label: 'Cursor (Cloud Agents API)', icon: 'code', needsKey: true, env: 'CURSOR_API_KEY', defaultModel: 'default', baseUrl: 'https://api.cursor.com',
    models: ['default', 'composer-2', 'claude-4-sonnet-thinking', 'gpt-5'], keyUrl: 'https://cursor.com/dashboard?tab=integrations',
    hint: 'Runs a Cursor cloud agent for each call (no tool calling from here). Base URL may carry a repository: https://api.cursor.com#https://github.com/org/repo@main' },
  { id: 'compatible', label: 'OpenAI-compatible', icon: 'plug', needsKey: false, defaultModel: '', baseUrl: 'http://127.0.0.1:1234/v1', models: [], hint: 'LM Studio, vLLM, Groq, OpenRouter …' },
  { id: 'mock', label: 'Offline test model', icon: 'flask', needsKey: false, defaultModel: 'mock-1', models: ['mock-1'] },
];
export const providerInfo = (id) => PROVIDERS.find((p) => p.id === id) ?? null;

/** "anthropic:claude-opus-5-5" ↔ { provider, model }. */
export function parseModelRef(ref) {
  const s = String(ref ?? '').trim();
  if (!s) return null;
  const i = s.indexOf(':');
  if (i < 0) return { provider: s, model: providerInfo(s)?.defaultModel ?? '' };
  return { provider: s.slice(0, i), model: s.slice(i + 1) || providerInfo(s.slice(0, i))?.defaultModel || '' };
}

const providerError = (provider, status, message) => {
  const code = status === 401 || status === 403 ? 'PROVIDER_AUTH' : status === 429 ? 'PROVIDER_RATE_LIMIT' : status === 404 ? 'PROVIDER_NOT_FOUND' : status === 400 ? 'PROVIDER_BAD_REQUEST' : 'PROVIDER_ERROR';
  return new AppError(code, `${providerInfo(provider)?.label ?? provider}: ${message}`, 502, { status });
};

async function httpJson(provider, url, { method = 'POST', headers = {}, body, signal } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new AppError('CANCELLED', 'Cancelled', 499);
    throw new AppError('PROVIDER_UNREACHABLE', `${providerInfo(provider)?.label ?? provider}: ${err?.cause?.code ?? err.message} (${new URL(url).host})`, 502);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw providerError(provider, res.status, data?.error?.message ?? data?.error ?? text.slice(0, 300) ?? res.statusText);
  return data;
}

// ───────────────────────── Claude (official SDK)

/** Models where the server-side refusal fallback applies (fallbacks: "default"). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5']);

function anthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content ?? ''), ...(m.isError ? { is_error: true } : {}) };
      const last = out.at(-1);
      // every result of one round in a single user message
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant') {
      if (m.rawProvider === 'anthropic' && Array.isArray(m.raw)) out.push({ role: 'assistant', content: m.raw });
      else {
        const content = [];
        if (m.content) content.push({ type: 'text', text: String(m.content) });
        for (const c of m.toolCalls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} });
        out.push({ role: 'assistant', content: content.length ? content : '…' });
      }
    } else out.push({ role: 'user', content: m.images?.length ? [...m.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })), { type: 'text', text: String(m.content ?? '') }] : String(m.content ?? '') });
  }
  return out;
}

async function anthropicChat(req) {
  const client = new Anthropic({ apiKey: req.credential?.apiKey || undefined, baseURL: req.credential?.baseUrl || undefined, maxRetries: 2 });
  const body = {
    model: req.model,
    max_tokens: req.maxTokens || 16000,
    ...(req.system ? { system: req.system } : {}),
    messages: anthropicMessages(req.messages),
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    ...(req.effort ? { output_config: { effort: req.effort } } : {}),
  };
  const fallback = FALLBACK_MODELS.has(req.model) && !req.credential?.baseUrl;
  let res;
  try {
    res = fallback
      ? await client.beta.messages.create({ ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal: req.signal })
      : await client.messages.create(body, { signal: req.signal });
  } catch (err) {
    if (err?.name === 'AbortError' || req.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
    if (typeof err?.status === 'number') throw providerError('anthropic', err.status, err?.error?.error?.message ?? err.message);
    throw new AppError('PROVIDER_UNREACHABLE', `Anthropic Claude: ${err.message}`, 502);
  }
  if (res.stop_reason === 'refusal') {
    throw new AppError('PROVIDER_REFUSAL', `Anthropic Claude declined the request${res.stop_details?.category ? ` (${res.stop_details.category})` : ''}`, 502, { explanation: res.stop_details?.explanation ?? '' });
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} }));
  return { text, toolCalls, usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 }, stop: res.stop_reason, raw: res.content, rawProvider: 'anthropic', model: res.model };
}

// ───────────────────────── OpenAI and OpenAI-compatible servers

function openaiMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: String(m.content ?? '') });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant', content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })) } : {}),
      });
    } else out.push({ role: 'user', content: m.images?.length ? [{ type: 'text', text: String(m.content ?? '') }, ...m.images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } }))] : String(m.content ?? '') });
  }
  return out;
}

function parseArgs(text) {
  if (text && typeof text === 'object') return text;
  try { return JSON.parse(text || '{}'); } catch { return { input: text }; }
}

async function openaiChat(req, provider) {
  const info = providerInfo(provider);
  const base = String(req.credential?.baseUrl || info.baseUrl).replace(/\/+$/, '');
  const official = provider === 'openai' && !req.credential?.baseUrl;
  const body = {
    model: req.model,
    messages: openaiMessages(req.system, req.messages),
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    ...(req.maxTokens ? (official ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }) : {}),
    ...(req.effort && official ? { reasoning_effort: ['low', 'medium', 'high'].includes(req.effort) ? req.effort : 'high' } : {}),
  };
  const data = await httpJson(provider, `${base}/chat/completions`, { headers: req.credential?.apiKey ? { authorization: `Bearer ${req.credential.apiKey}` } : {}, body, signal: req.signal });
  const msg = data?.choices?.[0]?.message ?? {};
  return {
    text: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}`, name: c.function?.name, args: parseArgs(c.function?.arguments) })),
    usage: { input: data?.usage?.prompt_tokens ?? 0, output: data?.usage?.completion_tokens ?? 0 },
    stop: data?.choices?.[0]?.finish_reason ?? '', model: data?.model ?? req.model,
  };
}

// ───────────────────────── Google Gemini

function geminiContents(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const part = { functionResponse: { name: m.name, response: { result: String(m.content ?? '') } } };
      const last = out.at(-1);
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part); else out.push({ role: 'user', parts: [part] });
    } else if (m.role === 'assistant') {
      if (m.rawProvider === 'gemini' && Array.isArray(m.raw)) out.push({ role: 'model', parts: m.raw });
      else out.push({ role: 'model', parts: [...(m.content ? [{ text: String(m.content) }] : []), ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args ?? {} } }))] });
    } else out.push({ role: 'user', parts: [...(m.images ?? []).map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })), { text: String(m.content ?? '') }] });
  }
  return out;
}

async function geminiChat(req) {
  const base = String(req.credential?.baseUrl || providerInfo('gemini').baseUrl).replace(/\/+$/, '');
  const body = {
    contents: geminiContents(req.messages),
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    ...(req.tools?.length ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
    generationConfig: { ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}), ...(req.json ? { responseMimeType: 'application/json' } : {}) },
  };
  const data = await httpJson('gemini', `${base}/models/${encodeURIComponent(req.model)}:generateContent`, { headers: { 'x-goog-api-key': req.credential?.apiKey ?? '' }, body, signal: req.signal });
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
    toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `gcall_${Date.now().toString(36)}_${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} })),
    usage: { input: data?.usageMetadata?.promptTokenCount ?? 0, output: data?.usageMetadata?.candidatesTokenCount ?? 0 },
    stop: data?.candidates?.[0]?.finishReason ?? '', raw: parts, rawProvider: 'gemini', model: req.model,
  };
}

// ───────────────────────── Ollama

async function ollamaChat(req) {
  const base = String(req.credential?.baseUrl || providerInfo('ollama').baseUrl).replace(/\/+$/, '');
  const messages = [...(req.system ? [{ role: 'system', content: req.system }] : [])];
  for (const m of req.messages) {
    if (m.role === 'tool') messages.push({ role: 'tool', content: String(m.content ?? ''), tool_name: m.name });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.content ?? '', ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args ?? {} } })) } : {}) });
    else messages.push({ role: 'user', content: String(m.content ?? ''), ...(m.images?.length ? { images: m.images.map((img) => img.data) } : {}) });
  }
  const body = {
    model: req.model, messages, stream: false, keep_alive: '30m',
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
    ...(req.json ? { format: 'json' } : {}),
    ...(req.maxTokens ? { options: { num_predict: Math.min(req.maxTokens, 32768) } } : {}),
  };
  let data;
  try { data = await httpJson('ollama', `${base}/api/chat`, { body, signal: req.signal }); } catch (err) {
    // A model that is not pulled: say which ones are there and how to get it.
    if (err.code !== 'PROVIDER_NOT_FOUND') throw err;
    let installed = [];
    try { installed = ((await httpJson('ollama', `${base}/api/tags`, { method: 'GET', signal: req.signal }))?.models ?? []).map((m) => m.name); } catch { /* the first error says enough */ }
    throw new AppError('MODEL_NOT_INSTALLED', `Ollama (local): model "${req.model}" is not installed. ${installed.length ? `Installed: ${installed.join(', ')}.` : 'No models installed.'} Get it with: ollama pull ${req.model}`, 404, { model: req.model, installed });
  }
  const msg = data?.message ?? {};
  return {
    text: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((c, i) => ({ id: `ocall_${i}`, name: c.function?.name, args: parseArgs(c.function?.arguments) })),
    usage: { input: data?.prompt_eval_count ?? 0, output: data?.eval_count ?? 0 }, stop: data?.done_reason ?? '', model: data?.model ?? req.model,
  };
}

// ───────────────────────── Cursor (Cloud Agents API v1)
// Each call starts a cloud agent with the conversation as its prompt, waits for its run to finish and
// returns the run's final text. Basic auth with the key as the user name. An optional repository rides on the
// base URL after '#': https://api.cursor.com#https://github.com/org/repo@branch.

const CURSOR_DONE = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);

export function cursorTarget(credential) {
  const raw = String(credential?.baseUrl || providerInfo('cursor').baseUrl);
  const [base, repoPart = ''] = raw.split('#');
  const [url, ref] = repoPart.trim().split('@');
  return { base: base.trim().replace(/\/+$/, '') || providerInfo('cursor').baseUrl, repo: url ? { url, ...(ref ? { startingRef: ref } : {}) } : null };
}

const cursorAuth = (credential) => ({ authorization: `Basic ${Buffer.from(`${credential?.apiKey ?? ''}:`).toString('base64')}` });

function cursorPrompt(req) {
  const lines = [];
  if (req.system) lines.push(req.system, '');
  for (const m of req.messages) {
    const who = m.role === 'assistant' ? 'Assistant' : m.role === 'tool' ? `Tool ${m.name ?? ''}` : 'User';
    lines.push(req.messages.length > 1 ? `${who}: ${String(m.content ?? '')}` : String(m.content ?? ''));
  }
  if (req.json) lines.push('', 'Answer with one JSON value only.');
  return lines.join('\n');
}

async function cursorChat(req) {
  const { base, repo } = cursorTarget(req.credential);
  const headers = cursorAuth(req.credential);
  const body = {
    prompt: { text: cursorPrompt(req), ...((req.messages ?? []).flatMap((m) => m.images ?? []).slice(0, 5).length ? { images: (req.messages ?? []).flatMap((m) => m.images ?? []).slice(0, 5).map((img) => ({ data: img.data, mimeType: img.mime })) } : {}) }, name: 'MyAgents call',
    ...(req.model && req.model !== 'default' ? { model: { id: req.model } } : {}),
    ...(repo ? { repos: [repo] } : {}),
  };
  const created = await httpJson('cursor', `${base}/v1/agents`, { headers, body, signal: req.signal });
  const agentId = created?.agent?.id;
  let run = created?.run ?? null;
  if (!agentId || !run?.id) throw new AppError('PROVIDER_ERROR', 'Cursor: the agent was not created', 502);
  const pause = (ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    req.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new AppError('CANCELLED', 'Cancelled', 499)); }, { once: true });
  });
  const wait = Number(req.pollMs ?? 2000);
  try {
    while (!CURSOR_DONE.has(run.status)) {
      await pause(wait);
      run = await httpJson('cursor', `${base}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}`, { method: 'GET', headers, signal: req.signal });
    }
  } catch (err) {
    if (err.code === 'CANCELLED') await httpJson('cursor', `${base}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(run.id)}/cancel`, { headers, body: {} }).catch(() => {});
    throw err;
  }
  if (run.status !== 'FINISHED') throw new AppError('PROVIDER_ERROR', `Cursor: the agent run ended ${run.status}`, 502, { agentId, runId: run.id });
  // one-shot agents are archived so the user's Cursor agent list stays tidy
  if (!repo) httpJson('cursor', `${base}/v1/agents/${encodeURIComponent(agentId)}/archive`, { headers, body: {} }).catch(() => {});
  const branches = run.git?.branches ?? [];
  return { text: String(run.result ?? ''), toolCalls: [], usage: { input: 0, output: 0 }, stop: 'end_turn', model: req.model || 'default', agentId, runId: run.id, ...(branches.length ? { git: branches } : {}) };
}

// ───────────────────────── one entry

export async function chat(req) {
  const provider = req.provider;
  if (!providerInfo(provider)) throw new AppError('PROVIDER_UNKNOWN', `Unknown model provider "${provider}"`, 400);
  if (!req.model && provider !== 'mock') throw new AppError('MODEL_REQUIRED', 'No model chosen', 400);
  if (providerInfo(provider).needsKey && !req.credential?.apiKey) {
    throw new AppError('NO_API_KEY', `${providerInfo(provider).label}: no API key — add one under Models & keys, or use the offline test model`, 400, { provider });
  }
  switch (provider) {
    case 'anthropic': return anthropicChat(req);
    case 'openai': case 'compatible': return openaiChat(req, provider);
    case 'gemini': return geminiChat(req);
    case 'ollama': return ollamaChat(req);
    case 'cursor': return cursorChat(req);
    case 'mock': return mockChat(req);
    default: throw new AppError('PROVIDER_UNKNOWN', `Unknown model provider "${provider}"`, 400);
  }
}

/** The models a provider offers now (the editor's model list). Falls back to the built-in suggestions. */
export async function listModels(provider, credential, { signal } = {}) {
  const info = providerInfo(provider);
  if (!info) return [];
  try {
    if (provider === 'anthropic' && credential?.apiKey) {
      const client = new Anthropic({ apiKey: credential.apiKey, baseURL: credential.baseUrl || undefined });
      const out = [];
      for await (const m of client.models.list({ limit: 100 })) out.push(m.id);
      return out.length ? out : info.models;
    }
    if (provider === 'ollama') {
      const base = String(credential?.baseUrl || info.baseUrl).replace(/\/+$/, '');
      const data = await httpJson('ollama', `${base}/api/tags`, { method: 'GET', signal });
      return (data?.models ?? []).map((m) => m.name);
    }
    if (provider === 'cursor' && credential?.apiKey) {
      const { base } = cursorTarget(credential);
      const data = await httpJson('cursor', `${base}/v1/models`, { method: 'GET', headers: cursorAuth(credential), signal });
      const list = data?.items ?? data?.models ?? data?.data ?? (Array.isArray(data) ? data : []);
      const ids = list.map((m) => (typeof m === 'string' ? m : m?.id ?? m?.name)).filter(Boolean);
      return ids.length ? ['default', ...ids] : info.models;
    }
    if ((provider === 'openai' || provider === 'compatible') && (credential?.apiKey || provider === 'compatible')) {
      const base = String(credential?.baseUrl || info.baseUrl).replace(/\/+$/, '');
      const data = await httpJson(provider, `${base}/models`, { method: 'GET', headers: credential?.apiKey ? { authorization: `Bearer ${credential.apiKey}` } : {}, signal });
      return (data?.data ?? []).map((m) => m.id).sort();
    }
    if (provider === 'gemini' && credential?.apiKey) {
      const base = String(credential?.baseUrl || info.baseUrl).replace(/\/+$/, '');
      const data = await httpJson('gemini', `${base}/models?pageSize=200`, { method: 'GET', headers: { 'x-goog-api-key': credential.apiKey }, signal });
      return (data?.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''));
    }
  } catch (err) {
    if (provider === 'ollama' || provider === 'compatible') throw err;
  }
  return info.models;
}

/** Pulls a JSON value out of a model's answer (code fences and text around it are allowed). */
export function parseJsonAnswer(text) {
  const s = String(text ?? '').trim();
  try { return JSON.parse(s); } catch { /* look inside */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* go on */ } }
  const start = s.search(/[[{]/);
  if (start >= 0) {
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    const end = s.lastIndexOf(close);
    if (end > start) { try { return JSON.parse(s.slice(start, end + 1)); } catch { /* none */ } }
  }
  return null;
}
