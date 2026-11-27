// AI providers: who they are, how to build their HTTP requests and how to read their answers.
// Pure (no DOM, no fetch): src/ai/client.js sends what this builds; test/unit/ai.test.js covers it.
//
// Kinds:
//   openai    — POST {base}/chat/completions, `Authorization: Bearer`, SSE `data: {choices[0].delta.content}`
//   azure     — the same body at {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=…, `api-key`
//   anthropic — POST {base}/messages (Messages API), `x-api-key` + `anthropic-version`, SSE content_block_delta/text_delta
//   gemini    — POST {base}/models/{model}:generateContent | :streamGenerateContent?alt=sse, `x-goog-api-key`
//   ollama    — POST {base}/api/chat, NDJSON `{message:{content}, done}`

/** Anthropic API version sent in `anthropic-version` (this version rejects temperature/top_p/top_k). */
export const ANTHROPIC_VERSION = '2026-10-21';
export const AZURE_API_VERSION = '2024-10-21';

export const PROVIDERS = [
  {
    id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5-mini',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    needsKey: true, keyUrl: 'https://platform.openai.com/api-keys', modelsEndpoint: '/models',
  },
  {
    id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-opus-5', 'claude-sonnet-5'],
    needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys', modelsEndpoint: '/models?limit=100',
  },
  {
    id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', modelsEndpoint: '/models?pageSize=200',
  },
  {
    id: 'azure', name: 'Azure OpenAI', kind: 'azure', baseUrl: 'https://YOUR-RESOURCE.openai.azure.com', defaultModel: '',
    models: [], needsKey: true, keyUrl: 'https://portal.azure.com/', apiVersion: AZURE_API_VERSION,
  },
  {
    id: 'mistral', name: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo'],
    needsKey: true, keyUrl: 'https://console.mistral.ai/api-keys', modelsEndpoint: '/models',
  },
  {
    id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b'],
    needsKey: true, keyUrl: 'https://console.groq.com/keys', modelsEndpoint: '/models',
  },
  {
    id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'], needsKey: true, keyUrl: 'https://platform.deepseek.com/api_keys', modelsEndpoint: '/models',
  },
  {
    id: 'xai', name: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4',
    models: ['grok-4', 'grok-3', 'grok-3-mini'], needsKey: true, keyUrl: 'https://console.x.ai/', modelsEndpoint: '/models',
  },
  {
    id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'openai/gpt-5-mini', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'mistralai/mistral-small'],
    needsKey: true, keyUrl: 'https://openrouter.ai/keys', modelsEndpoint: '/models',
  },
  {
    id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', defaultModel: 'sonar',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'],
    needsKey: true, keyUrl: 'https://www.perplexity.ai/settings/api',
  },
  {
    id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    needsKey: true, keyUrl: 'https://api.together.ai/settings/api-keys', modelsEndpoint: '/models',
  },
  {
    id: 'ollama', name: 'Ollama (local)', kind: 'ollama', baseUrl: 'http://localhost:11434', defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'qwen2.5', 'gemma3', 'mistral', 'phi4', 'deepseek-r1'],
    needsKey: false, keyUrl: 'https://ollama.com/download', modelsEndpoint: '/api/tags', local: true,
  },
  {
    id: 'lmstudio', name: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', defaultModel: '',
    models: [], needsKey: false, keyUrl: 'https://lmstudio.ai/', modelsEndpoint: '/models', local: true,
  },
  {
    id: 'custom', name: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: '', defaultModel: '',
    models: [], needsKey: false, keyUrl: '', modelsEndpoint: '/models',
  },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
export const providerById = (id) => BY_ID.get(id) ?? null;

const trimSlash = (url) => String(url ?? '').trim().replace(/\/+$/, '');

/** The provider merged with its saved config: { provider, apiKey, baseUrl, model, apiVersion }. */
export function resolveConfig(providerId, config = {}) {
  const provider = providerById(providerId);
  if (!provider) throw new Error(`Unknown AI provider: ${providerId}`);
  return {
    provider,
    apiKey: String(config.apiKey ?? '').trim(),
    baseUrl: trimSlash(config.baseUrl || provider.baseUrl),
    model: String(config.model || provider.defaultModel || '').trim(),
    apiVersion: String(config.apiVersion || provider.apiVersion || AZURE_API_VERSION).trim(),
  };
}

// OpenAI reasoning models (gpt-5*, o1/o3/o4…) take max_completion_tokens and only the default temperature.
const isOpenAiReasoning = (model) => /^(gpt-5|o\d)/i.test(String(model).replace(/^openai\//, ''));

function openAiMessages(system, messages) {
  const list = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) list.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') });
  return list;
}

/** Same-role neighbours merged; the first message is a user one (Anthropic and Gemini require it). */
function alternating(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content ?? '');
    if (!content.trim()) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n\n${content}`;
    else out.push({ role, content });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '…' });
  return out;
}

function authHeaders(kind, apiKey) {
  if (!apiKey) return {};
  if (kind === 'anthropic') return { 'x-api-key': apiKey };
  if (kind === 'gemini') return { 'x-goog-api-key': apiKey };
  if (kind === 'azure') return { 'api-key': apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

function extraHeaders(provider) {
  if (provider.kind === 'anthropic') return { 'anthropic-version': ANTHROPIC_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' };
  if (provider.id === 'openrouter') return { 'HTTP-Referer': 'https://github.com/mymarkdown', 'X-Title': 'MyMarkdownMaster' };
  return {};
}

function azureBase(baseUrl, model) {
  if (/\/openai\/deployments\/[^/]+$/i.test(baseUrl)) return baseUrl;
  return `${baseUrl}/openai/deployments/${encodeURIComponent(model)}`;
}

/**
 * The HTTP request for one chat turn.
 * @returns {{ url: string, method: string, headers: Record<string,string>, body: string, stream: boolean, kind: string }}
 */
export function buildChatRequest(providerId, config, { system = '', messages = [], temperature, maxTokens, stream = true } = {}) {
  const c = resolveConfig(providerId, config);
  const { provider } = c;
  const kind = provider.kind;
  if (!c.baseUrl) throw new Error('No base URL');
  if (!c.model && kind !== 'azure') throw new Error('No model');
  const headers = { 'Content-Type': 'application/json', ...authHeaders(kind, c.apiKey), ...extraHeaders(provider) };
  const temp = Number.isFinite(Number(temperature)) && temperature !== null && temperature !== '' ? Number(temperature) : undefined;
  const max = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.round(Number(maxTokens)) : undefined;
  let url;
  let body;

  if (kind === 'anthropic') {
    url = `${c.baseUrl}/messages`;
    body = { model: c.model, max_tokens: max ?? 4096, messages: alternating(messages) };
    if (system) body.system = system;
    if (stream) body.stream = true;
    // temperature is not sent: API version 2026-10-21 rejects sampling parameters.
  } else if (kind === 'gemini') {
    const model = c.model.replace(/^models\//, '');
    url = `${c.baseUrl}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    body = { contents: alternating(messages).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const generationConfig = {};
    if (temp !== undefined) generationConfig.temperature = temp;
    if (max) generationConfig.maxOutputTokens = max;
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  } else if (kind === 'ollama') {
    url = `${c.baseUrl}/api/chat`;
    body = { model: c.model, messages: openAiMessages(system, messages), stream: Boolean(stream) };
    const options = {};
    if (temp !== undefined) options.temperature = temp;
    if (max) options.num_predict = max;
    if (Object.keys(options).length) body.options = options;
  } else {
    // openai + azure (OpenAI chat completions)
    url = kind === 'azure'
      ? `${azureBase(c.baseUrl, c.model)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion)}`
      : `${c.baseUrl}/chat/completions`;
    body = { messages: openAiMessages(system, messages) };
    if (kind !== 'azure') body.model = c.model;
    const reasoning = (provider.id === 'openai' || kind === 'azure') && isOpenAiReasoning(c.model);
    if (temp !== undefined && !reasoning) body.temperature = temp;
    if (max) body[reasoning ? 'max_completion_tokens' : 'max_tokens'] = max;
    if (stream) body.stream = true;
  }
  return { url, method: 'POST', headers, body: JSON.stringify(body), stream: Boolean(stream), kind };
}

/** The request listing the provider's models, or null when it has no such endpoint. */
export function buildModelsRequest(providerId, config) {
  const c = resolveConfig(providerId, config);
  const { provider } = c;
  if (!provider.modelsEndpoint || !c.baseUrl) return null;
  const headers = { ...authHeaders(provider.kind, c.apiKey), ...extraHeaders(provider) };
  return { url: `${c.baseUrl}${provider.modelsEndpoint}`, method: 'GET', headers, body: '', stream: false, kind: provider.kind };
}

/** Model ids from a models response, sorted. */
export function parseModels(kind, json) {
  let ids = [];
  if (kind === 'ollama') ids = (json?.models ?? []).map((m) => m.name ?? m.model);
  else if (kind === 'gemini') {
    ids = (json?.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''));
  } else {
    const list = Array.isArray(json) ? json : (json?.data ?? json?.models ?? []);
    ids = list.map((m) => (typeof m === 'string' ? m : m.id ?? m.name));
  }
  return [...new Set(ids.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
}

const textOf = (value) => (typeof value === 'string' ? value : Array.isArray(value) ? value.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('') : '');

/** Error thrown for an error that a provider sends inside a stream. */
export class StreamError extends Error {}

function streamErrorOf(json) {
  if (json?.type === 'error') return json.error?.message ?? 'error';
  if (json?.error) return typeof json.error === 'string' ? json.error : json.error.message ?? JSON.stringify(json.error);
  return null;
}

/** Text in one streamed event (JSON already parsed). Throws StreamError for an error event. */
export function deltaOf(kind, json) {
  const error = streamErrorOf(json);
  if (error) throw new StreamError(error);
  if (kind === 'anthropic') return json?.type === 'content_block_delta' && json.delta?.type === 'text_delta' ? json.delta.text ?? '' : '';
  if (kind === 'gemini') return (json?.candidates?.[0]?.content?.parts ?? []).map((p) => (p.thought ? '' : p.text ?? '')).join('');
  if (kind === 'ollama') return json?.message?.content ?? json?.response ?? '';
  return textOf(json?.choices?.[0]?.delta?.content);
}

/**
 * A parser for a streamed body: push(textChunk) → [deltaText…], end() → [deltaText…].
 * SSE (`data:` lines; [DONE]; events split across chunks; multi-line data) or, for Ollama, NDJSON.
 */
export function createStreamParser(kind) {
  let buffer = '';
  let pendingData = [];
  const out = [];
  const emit = (payload) => {
    const text = payload.trim();
    if (!text || text === '[DONE]') return true;
    let json;
    try { json = JSON.parse(text); } catch { return false; }
    const delta = deltaOf(kind, json);
    if (delta) out.push(delta);
    return true;
  };
  const line = (raw) => {
    const value = raw.replace(/\r$/, '');
    if (kind === 'ollama') { if (value.trim()) emit(value); return; }
    if (value === '') {
      // End of an SSE event: data lines that did not parse alone are joined.
      if (pendingData.length) emit(pendingData.join('\n'));
      pendingData = [];
      return;
    }
    if (value.startsWith(':')) return; // comment / keep-alive
    if (!value.startsWith('data:')) return; // event:, id:, retry:
    const data = value.slice(5).replace(/^ /, '');
    if (pendingData.length) { pendingData.push(data); if (emit(pendingData.join('\n'))) pendingData = []; return; }
    if (!emit(data)) pendingData.push(data);
  };
  const take = () => out.splice(0, out.length);
  return {
    push(chunk) {
      buffer += String(chunk ?? '');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const l of lines) line(l);
      return take();
    },
    end() {
      if (buffer) line(buffer);
      buffer = '';
      if (pendingData.length) emit(pendingData.join('\n'));
      pendingData = [];
      return take();
    },
  };
}

/** The answer's text from a non-streamed response. */
export function parseChatResponse(kind, json) {
  if (kind === 'anthropic') return (json?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (kind === 'gemini') return (json?.candidates?.[0]?.content?.parts ?? []).map((p) => (p.thought ? '' : p.text ?? '')).join('');
  if (kind === 'ollama') return json?.message?.content ?? json?.response ?? '';
  return textOf(json?.choices?.[0]?.message?.content);
}

/** A readable message for an error response (status + the provider's own message). */
export function parseError(kind, status, bodyText) {
  const raw = String(bodyText ?? '').trim();
  let message = '';
  try {
    const json = JSON.parse(raw);
    const item = Array.isArray(json) ? json[0] : json;
    const error = item?.error;
    if (typeof error === 'string') message = error;
    else if (error?.message) message = error.message;
    else if (item?.message) message = item.message;
    else if (typeof item?.detail === 'string') message = item.detail;
    else if (Array.isArray(item?.detail)) message = item.detail.map((d) => d.msg ?? JSON.stringify(d)).join('; ');
    if (error?.type && kind === 'anthropic' && message) message = `${error.type}: ${message}`;
    else if (error?.status && kind === 'gemini' && message) message = `${error.status}: ${message}`;
  } catch { /* not JSON */ }
  if (!message) message = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  const hint = {
    400: 'Bad request', 401: 'Unauthorized: check the API key', 403: 'Forbidden: the key has no access', 404: 'Not found: check the base URL and model',
    408: 'Timeout', 413: 'Request too large', 429: 'Rate limit or quota exceeded', 500: 'Server error', 502: 'Bad gateway', 503: 'Service unavailable', 529: 'Overloaded',
  }[status];
  const head = `HTTP ${status}${hint ? ` (${hint})` : ''}`;
  return message ? `${head}: ${message}` : head;
}
