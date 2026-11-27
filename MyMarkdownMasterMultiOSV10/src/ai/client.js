// Sends AI requests. Desktop: through the Rust proxy (src-tauri/src/ai.rs: `ai_request`, `ai_cancel`,
// `ai-chunk` events), so no CORS limits. Web: fetch with a streamed body reader; some providers do not
// allow browsers (CORS) — the error then suggests the desktop app or a CORS-enabled base URL.
import { invoke, isDesktop, listen } from '../platform/native.js';
import { t } from '../i18n.js';
import './texts.js';
import {
  buildChatRequest, buildModelsRequest, createStreamParser, parseChatResponse, parseError, parseModels, providerById, resolveConfig,
} from './providers.js';
import { isConfigured, normalizeAiSettings } from './settings.js';

const abortError = () => {
  const error = new Error(t('ai.error.cancelled'));
  error.name = 'AbortError';
  return error;
};

let opCounter = 0;
const newOp = () => `ai-${Date.now().toString(36)}-${(opCounter += 1)}`;

/** The default system prompt when the settings leave it empty. */
export const defaultSystemPrompt = () => t('ai.systemDefault');

function friendlyNetworkError(provider, url, error) {
  const message = error?.message ?? String(error);
  if (provider.local) return t('ai.error.local', { provider: provider.name, url, message });
  if (!isDesktop() && (error instanceof TypeError || /fetch|network|cors/i.test(message))) return t('ai.error.cors', { provider: provider.name });
  return t('ai.error.network', { message });
}

// ───────────────────────── transports

/** Web: fetch. Returns { status, body } or streams deltas through onText. */
async function sendWeb(request, { onText, signal }) {
  const headers = { ...request.headers };
  if (request.method === 'GET') delete headers['Content-Type'];
  const response = await fetch(request.url, { method: request.method, headers, body: request.method === 'GET' ? undefined : request.body, signal });
  if (!response.ok || !request.stream || !response.body) return { status: response.status, body: await response.text() };
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const onAbort = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onText(text);
    }
    const rest = decoder.decode();
    if (rest) onText(rest);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) throw abortError();
  return { status: response.status, body: '' };
}

/** Desktop: the Rust proxy. Chunks arrive as `ai-chunk` events, possibly after the command resolved. */
async function sendDesktop(request, { onText, signal }) {
  const op = newOp();
  const waiting = new Map();
  let next = 0;
  let expected = -1;
  let finish = null;
  const drain = () => {
    while (waiting.has(next)) {
      const text = waiting.get(next);
      waiting.delete(next);
      next += 1;
      onText(text);
    }
    if (expected >= 0 && next >= expected) finish?.();
  };
  const unlisten = await listen('ai-chunk', (payload) => {
    if (payload?.op !== op) return;
    waiting.set(Number(payload.seq) || 0, String(payload.text ?? ''));
    drain();
  });
  const onAbort = () => { invoke('ai_cancel', { op }).catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) throw abortError();
    const headers = Object.entries(request.headers).filter(([name]) => !(request.method === 'GET' && name === 'Content-Type'));
    let response;
    try {
      response = await invoke('ai_request', { request: { url: request.url, method: request.method, headers, body: request.body, stream: request.stream }, op });
    } catch (error) {
      if (signal?.aborted || error === 'cancelled') throw abortError();
      throw error;
    }
    if (response.chunks > 0 && next < response.chunks) {
      expected = response.chunks;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000); // never hang on a lost event
        finish = () => { clearTimeout(timer); resolve(); };
        drain();
      });
    }
    return { status: response.status, body: response.body ?? '' };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    unlisten?.();
  }
}

async function send(provider, request, options = {}) {
  if (options.signal?.aborted) throw abortError();
  try {
    return await (isDesktop() ? sendDesktop(request, options) : sendWeb(request, options));
  } catch (error) {
    if (error?.name === 'AbortError' || options.signal?.aborted) throw abortError();
    const wrapped = new Error(friendlyNetworkError(provider, request.url, typeof error === 'string' ? new Error(error) : error));
    wrapped.cause = error;
    throw wrapped;
  }
}

const httpError = (kind, status, body) => {
  const error = new Error(parseError(kind, status, body));
  error.status = status;
  return error;
};

// ───────────────────────── public API

/**
 * One chat turn with the chosen provider. Streams text through onDelta(text) and resolves with the whole answer.
 * @param {{ settings: object, system?: string, messages: {role:'user'|'assistant', content:string}[], onDelta?: (text:string)=>void, signal?: AbortSignal, providerId?: string, stream?: boolean, maxTokens?: number }} options
 */
export async function aiChat({ settings, system, messages, onDelta, signal, providerId, stream = true, maxTokens }) {
  const ai = normalizeAiSettings(settings);
  const id = providerId ?? ai.provider;
  const provider = providerById(id);
  if (!isConfigured(ai, id)) throw new Error(provider?.needsKey && !ai.providers[id]?.apiKey ? t('ai.error.noKey', { provider: provider?.name ?? id }) : t('ai.error.noModel'));
  const request = buildChatRequest(id, ai.providers[id], {
    system: system ?? (ai.systemPrompt.trim() || defaultSystemPrompt()),
    messages, temperature: ai.temperature, maxTokens: maxTokens ?? ai.maxTokens, stream,
  });
  const kind = provider.kind;
  let full = '';
  const parser = createStreamParser(kind);
  const take = (deltas) => {
    for (const delta of deltas) {
      full += delta;
      onDelta?.(delta, full);
    }
  };
  let streamError = null;
  const onText = (chunk) => {
    if (streamError) return;
    try { take(parser.push(chunk)); } catch (error) { streamError = error; }
  };
  const response = await send(provider, request, { onText, signal });
  if (response.status < 200 || response.status >= 300) throw httpError(kind, response.status, response.body);
  if (request.stream) {
    if (!streamError) {
      try { take(parser.end()); } catch (error) { streamError = error; }
    }
    if (streamError) throw new Error(t('ai.error.stream', { message: streamError.message }));
    // A server that ignored `stream` answers with plain JSON.
    if (!full && response.body) full = safeParse(kind, response.body);
  } else {
    full = safeParse(kind, response.body);
    if (full) onDelta?.(full, full);
  }
  if (signal?.aborted) throw abortError();
  return full;
}

function safeParse(kind, body) {
  try { return parseChatResponse(kind, JSON.parse(body)); } catch { return ''; }
}

/** The provider's model ids (throws when it has no models endpoint). */
export async function aiModels(settings, providerId) {
  const ai = normalizeAiSettings(settings);
  const id = providerId ?? ai.provider;
  const provider = providerById(id);
  const request = buildModelsRequest(id, ai.providers[id]);
  if (!request) throw new Error(t('ai.error.noModelsEndpoint'));
  if (provider.needsKey && !ai.providers[id].apiKey) throw new Error(t('ai.error.noKey', { provider: provider.name }));
  const response = await send(provider, request);
  if (response.status < 200 || response.status >= 300) throw httpError(provider.kind, response.status, response.body);
  let json;
  try { json = JSON.parse(response.body); } catch { throw new Error(t('ai.error.badJson')); }
  return parseModels(provider.kind, json);
}

/** Checks the provider: its models list when it has one, otherwise a tiny chat. → { ok, message } */
export async function aiTest(settings, providerId) {
  const ai = normalizeAiSettings(settings);
  const id = providerId ?? ai.provider;
  const provider = providerById(id);
  if (!provider) return { ok: false, message: `Unknown provider: ${id}` };
  try {
    if (provider.needsKey && !ai.providers[id].apiKey) throw new Error(t('ai.error.noKey', { provider: provider.name }));
    const { model } = resolveConfig(id, ai.providers[id]);
    if (buildModelsRequest(id, ai.providers[id])) {
      const models = await aiModels(ai, id);
      const has = model && models.length && !models.includes(model) && !models.includes(`models/${model}`);
      return { ok: true, message: t(has ? 'ai.test.modelsMissing' : 'ai.test.models', { count: models.length, model }) };
    }
    const reply = await aiChat({ settings: ai, providerId: id, system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }], stream: false, maxTokens: 256 });
    return { ok: true, message: t('ai.test.reply', { text: reply.trim().slice(0, 60) || '…' }) };
  } catch (error) {
    return { ok: false, message: error?.message ?? String(error) };
  }
}
