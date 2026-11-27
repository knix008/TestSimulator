// AI settings (stored by the app as `settings.ai`). Pure: no DOM, no storage.
//
// API keys are kept only on this computer, in the app's local settings (localStorage of the app /
// the browser). They are sent only to the provider they belong to (or, on the desktop, through the
// app's own Rust proxy to that provider) and are never written into notes, exports or chat history.
import { PROVIDERS, providerById } from './providers.js';

export const AI_LIMITS = {
  temperature: { min: 0, max: 2, step: 0.1 },
  maxTokens: { min: 64, max: 128000 },
  chatHistoryLimit: { min: 0, max: 500 },
};

export const DEFAULT_CONTEXT = { note: true, selection: true, linked: false, vaultSearch: false };

const providerDefaults = (provider) => ({
  apiKey: '', baseUrl: provider.baseUrl, model: provider.defaultModel,
  ...(provider.kind === 'azure' ? { apiVersion: provider.apiVersion } : {}),
});

export function defaultAiSettings() {
  return {
    provider: 'openai',
    providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, providerDefaults(p)])),
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
    context: { ...DEFAULT_CONTEXT },
    chatHistoryLimit: 50,
  };
}

const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const num = (value, fallback, { min, max }) => {
  const n = Number(value);
  if (value === null || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Any stored value → a complete, valid AI settings object (unknown keys dropped). */
export function normalizeAiSettings(raw) {
  const base = defaultAiSettings();
  const input = raw && typeof raw === 'object' ? raw : {};
  const providers = {};
  for (const p of PROVIDERS) {
    const saved = input.providers?.[p.id] ?? {};
    const entry = {
      apiKey: str(saved.apiKey).trim(),
      baseUrl: str(saved.baseUrl).trim() || p.baseUrl,
      model: str(saved.model).trim() || p.defaultModel,
    };
    if (p.kind === 'azure') entry.apiVersion = str(saved.apiVersion).trim() || p.apiVersion;
    providers[p.id] = entry;
  }
  const context = {};
  for (const key of Object.keys(DEFAULT_CONTEXT)) context[key] = typeof input.context?.[key] === 'boolean' ? input.context[key] : DEFAULT_CONTEXT[key];
  const temperature = Math.round(num(input.temperature, base.temperature, AI_LIMITS.temperature) * 10) / 10;
  return {
    provider: providerById(input.provider) ? input.provider : base.provider,
    providers,
    temperature,
    maxTokens: Math.round(num(input.maxTokens, base.maxTokens, AI_LIMITS.maxTokens)),
    systemPrompt: str(input.systemPrompt),
    context,
    chatHistoryLimit: Math.round(num(input.chatHistoryLimit, base.chatHistoryLimit, AI_LIMITS.chatHistoryLimit)),
  };
}

/** The saved config of one provider (defaults filled in). */
export const providerConfig = (ai, id) => normalizeAiSettings(ai).providers[id];

/** True when the provider can be used: it has a key (if it needs one), a base URL and a model (Azure: a deployment). */
export function isConfigured(ai, id = ai?.provider) {
  const provider = providerById(id);
  if (!provider) return false;
  const c = providerConfig(ai, id);
  if (provider.needsKey && !c.apiKey) return false;
  if (!c.baseUrl || /YOUR-RESOURCE/.test(c.baseUrl)) return false;
  return Boolean(c.model);
}

/** A copy of the settings with one provider's config changed. */
export function withProvider(ai, id, patch) {
  const next = normalizeAiSettings(ai);
  next.providers[id] = { ...next.providers[id], ...patch };
  return normalizeAiSettings(next);
}
