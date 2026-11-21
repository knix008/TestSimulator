// AI providers for lyrics and song plans. Three kinds:
//   builtin — the offline writer and composer (music/lyrics.js, music/composer.js): no key, no network.
//   claude  — Anthropic's Claude (official SDK, the user's own API key; structured JSON output).
//   ollama  — a local model served by Ollama (http://localhost:11434), JSON mode.
// Every provider answers with the same plan, which the composer turns into music:
//   { title, language, sections: [{ type, bars, lines: [..], chords: ['Am F', 'C G', …] (per bar) }] }
// Prompts and the plan's checking are pure (tested); only the calls touch the network.
import { GENRES, MOODS, SECTION_DEFAULTS, SECTION_TYPES, genreOf, moodOf, structureOf } from './genres.js';
import { parseChordSymbol } from './theory.js';
import { writeLyrics } from './lyrics.js';

export const PROVIDERS = ['builtin', 'claude', 'ollama'];
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1';
/** Settings › AI › model "other": a model id typed by the user (a newer model, say). */
export const CUSTOM_MODEL = 'custom';
/** How much Claude thinks before answering (output_config.effort). */
export const AI_EFFORTS = ['low', 'medium', 'high'];
/** How freely the AI writes: prompt wording for every provider, and Ollama's temperature. */
export const AI_CREATIVITY = ['focused', 'balanced', 'creative'];
export const OLLAMA_TEMPERATURE = { focused: 0.45, balanced: 0.8, creative: 1.1 };
/** Seconds an AI request may take before it is given up. */
export const AI_TIMEOUTS = [60, 120, 180, 300, 600];
const CREATIVITY_PROMPT = {
  focused: 'Style: keep to the conventions of the genre — clear, simple, familiar images and common progressions.',
  balanced: '',
  creative: 'Style: be bold and surprising — fresh images, unusual rhymes, and a borrowed or unexpected chord where it helps.',
};

/** The Claude model a request uses: the chosen one, or the typed id when "other" is chosen. */
export function claudeModelOf(settings = {}) {
  if (settings.aiModel === CUSTOM_MODEL) return String(settings.aiModelCustom ?? '').trim() || DEFAULT_CLAUDE_MODEL;
  return CLAUDE_MODELS.includes(settings.aiModel) ? settings.aiModel : DEFAULT_CLAUDE_MODEL;
}

/** The model a provider uses, for labels ('' for the built-in writer). */
export function modelOf(settings = {}, provider = settings.aiProvider) {
  if (provider === 'claude') return claudeModelOf(settings);
  if (provider === 'ollama') return settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
  return '';
}

/** The prompt with the creativity wish added. */
export function withCreativity(prompt, settings = {}) {
  const extra = CREATIVITY_PROMPT[settings.aiCreativity] ?? '';
  return extra ? `${prompt}\n${extra}` : prompt;
}

/** The user's cancel and the timeout as one signal. */
function timed(signal, settings) {
  const seconds = AI_TIMEOUTS.includes(Number(settings.aiTimeout)) ? Number(settings.aiTimeout) : 180;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('timeout'), { code: 'aiTimeout' })), seconds * 1000);
  const stop = () => controller.abort(signal?.reason);
  if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
  return { signal: controller.signal, seconds, done: () => { clearTimeout(timer); signal?.removeEventListener?.('abort', stop); }, timedOut: () => controller.signal.reason?.code === 'aiTimeout' };
}

/** The JSON schema of a song plan (Claude structured output; Ollama's `format`). */
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'sections'],
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'bars', 'lines', 'chords'],
        properties: {
          type: { type: 'string', enum: SECTION_TYPES },
          bars: { type: 'integer' },
          lines: { type: 'array', items: { type: 'string' } },
          chords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SYSTEM = `You are a professional songwriter and arranger. You write singable, original lyrics and chord progressions.
Rules:
- Write original words only. Never quote or imitate the lyrics of existing songs or artists.
- Keep each sung line short: about 6 to 12 syllables (Korean: 6 to 12 Hangul characters), one line per two bars.
- Choruses carry the hook and repeat it; verses tell the story with concrete images; the bridge turns the story.
- Sections without singing (intro, interlude, drop) have an empty "lines" list. An outro may have one line.
- "chords" gives one entry per bar, using chord symbols such as "C", "Am7", "F#m", "Bbmaj7", "G/B"; two chords in one bar are written "Am G".
- Use chords that belong to the requested key unless a borrowed chord makes the song better.
- Answer with the JSON object only.`;

/** The user prompt for a full song plan. */
export function planPrompt(spec) {
  const genre = genreOf(spec.genre);
  const mood = moodOf(spec.mood);
  const form = (Array.isArray(spec.sections) && spec.sections.length ? spec.sections : structureOf(spec.structure).sections).map((s) => (typeof s === 'string' ? s : s.type));
  const language = spec.language === 'en' ? 'English' : 'Korean (한국어)';
  const lines = [
    `Write a song plan.`,
    `Topic / idea: ${spec.topic || '(free choice)'}`,
    `Genre: ${genre.en}. Mood: ${mood.en}.`,
    `Lyrics language: ${language}.`,
    spec.keyName ? `Key: ${spec.keyName}.` : '',
    `Form, in this order: ${form.map((t) => `${t} (${SECTION_DEFAULTS[t]?.bars ?? 8} bars, ${SECTION_DEFAULTS[t]?.lines ?? 0} lines)`).join(', ')}.`,
    spec.notes ? `More wishes: ${spec.notes}` : '',
    spec.lyricsOnly ? 'Only the lyrics matter here; still give simple chords.' : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** The user prompt for lyrics only (sections already exist). */
export function lyricsPrompt(spec, sections) {
  const language = spec.language === 'en' ? 'English' : 'Korean (한국어)';
  return [
    `Write new lyrics for an existing song.`,
    `Topic / idea: ${spec.topic || '(free choice)'}`,
    `Genre: ${genreOf(spec.genre).en}. Mood: ${moodOf(spec.mood).en}. Lyrics language: ${language}.`,
    `Sections, in order (keep this exact list, the same bars, and write exactly the number of lines asked; keep the given chords):`,
    ...sections.map((s, i) => `${i + 1}. ${s.type}: ${s.bars} bars, ${s.lines} lines, chords per bar: ${(s.chords ?? []).join(' | ') || '-'}`),
    spec.notes ? `More wishes: ${spec.notes}` : '',
  ].filter(Boolean).join('\n');
}

/** A plan from any provider made safe: known section types, bars 1–32, chords that parse, lines as strings. */
export function cleanPlan(raw, fallbackForm = null) {
  const plan = raw && typeof raw === 'object' ? raw : {};
  const sections = (Array.isArray(plan.sections) ? plan.sections : []).map((s) => {
    const type = SECTION_TYPES.includes(s?.type) ? s.type : 'verse';
    const bars = Math.max(1, Math.min(32, Math.round(Number(s?.bars) || SECTION_DEFAULTS[type].bars)));
    const lines = (Array.isArray(s?.lines) ? s.lines : []).map((l) => String(l ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 16);
    const chords = (Array.isArray(s?.chords) ? s.chords : []).map((c) => String(c ?? '').split(/\s+/).filter((tok) => parseChordSymbol(tok)).join(' ')).filter(Boolean);
    return { type, bars, lines, chords };
  }).filter((s) => s.bars > 0);
  if (!sections.length && fallbackForm) return { title: String(plan.title ?? ''), sections: fallbackForm.map((type) => ({ type, bars: SECTION_DEFAULTS[type].bars, lines: [], chords: [] })) };
  return { title: String(plan.title ?? '').slice(0, 120), sections };
}

/** The first JSON object in a model's text (some local models wrap it in prose or code fences). */
export function extractJson(text) {
  const s = String(text ?? '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in the answer');
  return JSON.parse(body.slice(start, end + 1));
}

// ───────────────────────── providers

/** The built-in plan: the offline lyric writer on the chosen form (chords come from the composer). */
function builtinPlan(spec) {
  const form = (Array.isArray(spec.sections) && spec.sections.length ? spec.sections : structureOf(spec.structure).sections).map((s) => (typeof s === 'string' ? { type: s } : s));
  const ids = form.map((_, i) => `s${i}`);
  const firstOf = {};
  const sections = form.map((s, i) => { const repeatOf = ['chorus', 'prechorus'].includes(s.type) && firstOf[s.type] ? firstOf[s.type] : null; firstOf[s.type] ??= ids[i]; return { id: ids[i], type: s.type, lines: s.lines ?? SECTION_DEFAULTS[s.type]?.lines ?? 0, repeatOf }; });
  const written = writeLyrics({ topic: spec.topic, mood: spec.mood, language: spec.language, seed: spec.seed, theme: spec.theme, sections });
  return { title: written.title, sections: form.map((s, i) => ({ type: s.type, bars: s.bars ?? SECTION_DEFAULTS[s.type]?.bars ?? 8, lines: written.sections[ids[i]] ?? [], chords: [] })), provider: 'builtin' };
}

let anthropicModule = null;
async function anthropic() {
  anthropicModule ??= await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/json-schema')]).then(([sdk, helpers]) => ({ default: sdk.default, jsonSchemaOutputFormat: helpers.jsonSchemaOutputFormat }));
  return anthropicModule;
}

/**
 * Asks Claude for a plan (structured output: the answer must match PLAN_SCHEMA). The key stays on this
 * computer and goes only to api.anthropic.com. Errors come back with a `code` the app explains.
 */
async function claudePlan(prompt, settings, userSignal) {
  if (!settings.aiApiKey) throw Object.assign(new Error('no API key'), { code: 'aiNoKey' });
  const { default: Anthropic, jsonSchemaOutputFormat } = await anthropic();
  const time = timed(userSignal, settings);
  const signal = time.signal;
  // The user's own key, kept on this computer: the request goes from this window straight to Anthropic.
  const client = new Anthropic({ apiKey: settings.aiApiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: time.seconds * 1000 });
  const model = claudeModelOf(settings);
  const effort = AI_EFFORTS.includes(settings.aiEffort) ? settings.aiEffort : 'medium';
  try {
    const message = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort, format: jsonSchemaOutputFormat(PLAN_SCHEMA) },
      messages: [{ role: 'user', content: withCreativity(prompt, settings) }],
    }, { signal });
    if (message.stop_reason === 'refusal') throw Object.assign(new Error(message.stop_details?.explanation ?? 'refused'), { code: 'aiRefused' });
    if (message.stop_reason === 'max_tokens') throw Object.assign(new Error('the answer was cut off'), { code: 'aiCutOff' });
    const parsed = message.parsed_output ?? extractJson(message.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    return { ...parsed, provider: 'claude', model };
  } catch (error) {
    if (time.timedOut()) throw Object.assign(new Error(`${time.seconds} s`), { code: 'aiTimeout' });
    if (error?.code) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw Object.assign(new Error(error.message), { code: 'aiBadKey' });
    if (error instanceof Anthropic.NotFoundError) throw Object.assign(new Error(`${model}: ${error.message}`), { code: 'aiModel' });
    if (error instanceof Anthropic.RateLimitError) throw Object.assign(new Error(error.message), { code: 'aiRateLimit' });
    if (error instanceof Anthropic.APIConnectionError) throw Object.assign(new Error(error.message), { code: 'aiOffline' });
    if (error instanceof Anthropic.APIError) throw Object.assign(new Error(`${error.status ?? ''} ${error.message}`), { code: 'aiApi' });
    if (error?.name === 'AbortError' || signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    throw error;
  } finally { time.done(); }
}

/** Asks a local Ollama model for a plan (JSON mode with the schema). */
async function ollamaPlan(prompt, settings, userSignal) {
  const base = String(settings.ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const time = timed(userSignal, settings);
  try {
    let response;
    try {
      response = await fetch(`${base}/api/chat`, {
        method: 'POST', signal: time.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, format: PLAN_SCHEMA, options: { temperature: OLLAMA_TEMPERATURE[settings.aiCreativity] ?? OLLAMA_TEMPERATURE.balanced }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: withCreativity(prompt, settings) }] }),
      });
    } catch (error) {
      if (time.timedOut()) throw Object.assign(new Error(`${time.seconds} s`), { code: 'aiTimeout' });
      if (error?.name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      throw Object.assign(new Error(`${base}: ${error.message}`), { code: 'aiOllamaOffline' });
    }
    if (!response.ok) throw Object.assign(new Error(`${response.status} ${await response.text().catch(() => '')}`.trim()), { code: response.status === 404 ? 'aiOllamaModel' : 'aiApi' });
    const data = await response.json();
    return { ...extractJson(data.message?.content ?? ''), provider: 'ollama', model };
  } finally { time.done(); }
}

/** The models Ollama has on this computer (names, sorted); throws with code aiOllamaOffline. */
export async function listOllamaModels(settings) {
  const base = String(settings.ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    return [...new Set((data.models ?? []).map((m) => String(m.name ?? m.model ?? '')).filter(Boolean))].sort();
  } catch (error) { throw Object.assign(new Error(`${base}: ${error.message}`), { code: 'aiOllamaOffline' }); }
}

/** Whether an error should fall back to the built-in writer (anything but the user's cancel). */
export const canFallBack = (error, settings, provider) => provider !== 'builtin' && settings?.aiFallback !== false && error?.code !== 'cancelled';

/** Which provider a request uses: the one chosen, falling back to the built-in one when it is not ready. */
export function providerFor(settings) {
  const p = PROVIDERS.includes(settings?.aiProvider) ? settings.aiProvider : 'builtin';
  if (p === 'claude' && !settings.aiApiKey) return 'builtin';
  return p;
}

/**
 * A song plan. spec: the composer's spec (topic, genre, mood, language, structure | sections, seed …).
 * settings: { aiProvider, aiApiKey, aiModel, ollamaUrl, ollamaModel }. signal: AbortSignal.
 */
export async function requestPlan(spec, settings, { signal = null, provider = providerFor(settings) } = {}) {
  const form = (Array.isArray(spec.sections) && spec.sections.length ? spec.sections : structureOf(spec.structure).sections).map((s) => (typeof s === 'string' ? s : s.type));
  if (provider === 'builtin') return { ...cleanPlan(builtinPlan(spec), form), provider: 'builtin', model: '' };
  const prompt = planPrompt(spec);
  const raw = provider === 'claude' ? await claudePlan(prompt, settings, signal) : await ollamaPlan(prompt, settings, signal);
  const plan = cleanPlan(raw, form);
  plan.provider = raw.provider;
  plan.model = raw.model;
  return plan;
}

/** New lyrics for the song's existing sections (lines per section, same order). */
export async function requestLyrics(spec, sections, settings, { signal = null, provider = providerFor(settings) } = {}) {
  if (provider === 'builtin') {
    const written = writeLyrics({ topic: spec.topic, mood: spec.mood, language: spec.language, seed: spec.seed, theme: spec.theme, sections: sections.map((s) => ({ id: s.id, type: s.type, lines: s.lines, repeatOf: s.repeatOf })) });
    return { title: written.title, lines: sections.map((s) => written.sections[s.id] ?? []), provider: 'builtin' };
  }
  const prompt = lyricsPrompt(spec, sections);
  const raw = provider === 'claude' ? await claudePlan(prompt, settings, signal) : await ollamaPlan(prompt, settings, signal);
  const plan = cleanPlan(raw);
  return { title: plan.title, lines: sections.map((s, i) => (plan.sections[i]?.lines ?? []).slice(0, Math.max(s.lines, 1) + 2)), provider: raw.provider, model: raw.model };
}

/** Checks that a provider answers (Settings › AI › Test). Returns { ok, detail }. */
export async function testProvider(settings) {
  const provider = settings.aiProvider;
  if (provider === 'builtin') return { ok: true, detail: 'builtin' };
  if (provider === 'ollama') {
    try {
      const names = await listOllamaModels(settings);
      const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
      const has = names.some((n) => n === model || n === `${model}:latest` || n.split(':')[0] === model);
      if (!has) return { ok: false, detail: `${model} — ${names.join(', ') || '-'}`, code: 'aiOllamaModel', models: names };
      return { ok: true, detail: names.join(', '), models: names };
    } catch (error) { return { ok: false, detail: error.message, code: 'aiOllamaOffline' }; }
  }
  try {
    const plan = await claudePlan('Write a song plan with one verse of 4 bars and 2 lines about the sea, in English, key C major.', settings, null);
    return { ok: true, detail: plan.title ?? '' };
  } catch (error) { return { ok: false, detail: error.message, code: error.code }; }
}

/** Genre and mood lists for prompts and menus. */
export const GENRE_IDS = GENRES.map((g) => g.id);
export const MOOD_IDS = MOODS.map((m) => m.id);
