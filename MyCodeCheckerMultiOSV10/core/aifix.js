'use strict';

// AI CodeFix: ask an LLM for a fix of one issue, show it as a line-range
// replacement, and apply it only when the user accepts and the file has not
// changed since. Providers (ws.settings.ai.provider):
//   anthropic          Claude through the official SDK (@anthropic-ai/sdk)
//   openai-compatible  any /v1/chat/completions endpoint (OpenAI, Azure OpenAI
//                      with a full URL, LM Studio, vLLM ...)
//   ollama             a local Ollama server (/api/chat)
// Source code leaves the machine only for a remote provider, and only after
// the user turned AI CodeFix on in the settings.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = {
  enabled: false,
  provider: 'anthropic',
  model: '',
  baseUrl: '',
  apiKey: '',
  effort: 'medium',
  maxTokens: 16000,
  contextLines: 40,
  timeoutMs: 120000,
  language: 'ko',
};

const DEFAULT_MODEL = { anthropic: 'claude-opus-5-5', 'openai-compatible': '', ollama: 'qwen2.5-coder' };
const MASK = '••••••••';

function settingsOf(ws) {
  return { ...DEFAULTS, ...((ws.settings && ws.settings.ai) || {}) };
}

function publicSettings(ws) {
  const s = settingsOf(ws);
  return { ...s, apiKey: s.apiKey ? MASK : '', defaultModel: DEFAULT_MODEL[s.provider] || '' };
}

function saveSettings(ws, next) {
  const prev = settingsOf(ws);
  const merged = { ...prev, ...(next || {}) };
  if (merged.apiKey === MASK) merged.apiKey = prev.apiKey;
  if (!['anthropic', 'openai-compatible', 'ollama'].includes(merged.provider)) throw Object.assign(new Error(`Unknown provider: ${merged.provider}`), { code: 'BAD_REQUEST' });
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(merged.effort)) merged.effort = 'medium';
  merged.maxTokens = Math.min(128000, Math.max(1024, Number(merged.maxTokens) || DEFAULTS.maxTokens));
  merged.contextLines = Math.min(400, Math.max(5, Number(merged.contextLines) || DEFAULTS.contextLines));
  ws.settings = { ...(ws.settings || {}), ai: merged };
  return publicSettings(ws);
}

function text(m, lang) {
  if (m && typeof m === 'object') return m[lang] || m.en || m.ko || '';
  return String(m || '');
}

/** The code window sent to the model: numbered lines around the issue. */
function codeWindow(lines, line, radius) {
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const numbered = [];
  for (let n = start; n <= end; n++) numbered.push(`${String(n).padStart(5)}| ${lines[n - 1]}`);
  return { start, end, text: numbered.join('\n') };
}

const SYSTEM = [
  'You fix one static-analysis issue in a source file.',
  'Change as little as possible and keep the surrounding style, names and indentation.',
  'Answer with one JSON object and nothing else:',
  '{"startLine": <first line to replace>, "endLine": <last line to replace>, "replacement": "<new text for exactly those lines, lines joined with \\n>", "explanation": "<why this fixes the issue, 1-3 sentences>", "confidence": "high"|"medium"|"low"}',
  'startLine and endLine refer to the numbered lines you were given and must stay inside that window.',
  'If the issue is a false positive or cannot be fixed safely within the window, return startLine 0 and explain why.',
].join('\n');

function buildPrompt(issue, rule, file, lines, settings) {
  const lang = settings.language === 'en' ? 'en' : 'ko';
  const win = codeWindow(lines, issue.line || 1, settings.contextLines);
  const user = [
    `File: ${file} (language: ${issue.lang || path.extname(file).slice(1)})`,
    `Issue at line ${issue.line}: ${text(issue.message, 'en')}`,
    `Rule: ${issue.rule}${rule ? ` - ${text(rule.name, 'en')}` : ''}`,
    rule && rule.why ? `Why it matters: ${text(rule.why, 'en')}` : '',
    rule && rule.fix ? `Suggested remedy: ${text(rule.fix, 'en')}` : '',
    (issue.events || []).length > 1 ? `Data/control flow:\n${issue.events.map((e) => `  line ${e.line}: ${text(e.text, 'en')}`).join('\n')}` : '',
    `Write the "explanation" in ${lang === 'ko' ? 'Korean (plain 합니다 style)' : 'English'}.`,
    '',
    `Code (lines ${win.start}-${win.end}):`,
    win.text,
  ].filter(Boolean).join('\n');
  return { system: SYSTEM, user, window: win };
}

/** The first balanced JSON object in a model reply. */
function parseReply(raw) {
  const s = String(raw || '');
  const start = s.indexOf('{');
  if (start < 0) throw Object.assign(new Error('The model did not return a fix'), { code: 'AI_BAD_REPLY', raw: s.slice(0, 2000) });
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { break; }
    }
  }
  throw Object.assign(new Error('The model reply was not valid JSON'), { code: 'AI_BAD_REPLY', raw: s.slice(0, 2000) });
}

// ---------------------------------------------------------------------------
// Providers

async function callAnthropic(settings, prompt, opts) {
  let client = opts.anthropicClient;
  if (!client) {
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk').default; } catch {
      throw Object.assign(new Error('The Anthropic SDK (@anthropic-ai/sdk) is not installed'), { code: 'AI_NOT_CONFIGURED' });
    }
    // Without a key in the settings the SDK reads ANTHROPIC_API_KEY / an `ant auth login` profile.
    client = new Anthropic({ ...(settings.apiKey ? { apiKey: settings.apiKey } : {}), ...(settings.baseUrl ? { baseURL: settings.baseUrl } : {}), timeout: settings.timeoutMs, maxRetries: 2 });
  }
  const model = settings.model || DEFAULT_MODEL.anthropic;
  const request = {
    model,
    max_tokens: settings.maxTokens,
    output_config: { effort: settings.effort },
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  };
  // Server-side fallback on a policy decline (Claude API only, not through a custom base URL).
  const useFallback = !settings.baseUrl && /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/.test(model);
  const response = useFallback
    ? await client.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(request);
  if (response.stop_reason === 'refusal') {
    const why = response.stop_details && response.stop_details.explanation;
    throw Object.assign(new Error(`The model declined this request${why ? `: ${why}` : ''}`), { code: 'AI_REFUSED' });
  }
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('The reply was cut off; raise the token limit in the AI settings'), { code: 'AI_BAD_REPLY' });
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text: out, model: response.model || model, usage: response.usage ? { input: response.usage.input_tokens, output: response.usage.output_tokens } : null };
}

async function httpJson(url, body, headers, settings, opts) {
  const fetchFn = opts.fetch || fetch;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) throw Object.assign(new Error(`LLM server answered HTTP ${res.status}: ${raw.slice(0, 300)}`), { code: res.status === 401 || res.status === 403 ? 'AI_AUTH' : 'AI_HTTP' });
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('LLM server reply is not JSON'), { code: 'AI_BAD_REPLY' }); }
}

async function callOpenAiCompatible(settings, prompt, opts) {
  if (!settings.baseUrl) throw Object.assign(new Error('Set the server URL of the OpenAI-compatible endpoint'), { code: 'AI_NOT_CONFIGURED' });
  if (!settings.model) throw Object.assign(new Error('Set the model name'), { code: 'AI_NOT_CONFIGURED' });
  const base = settings.baseUrl.replace(/\/+$/, '');
  const url = /\/chat\/completions(\?|$)/.test(base) ? base : `${base}/chat/completions`;
  const headers = settings.apiKey ? (/azure/i.test(base) ? { 'api-key': settings.apiKey } : { authorization: `Bearer ${settings.apiKey}` }) : {};
  const json = await httpJson(url, {
    model: settings.model,
    max_tokens: settings.maxTokens,
    messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
  }, headers, settings, opts);
  const choice = json.choices && json.choices[0];
  return { text: (choice && choice.message && choice.message.content) || '', model: json.model || settings.model, usage: json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : null };
}

async function callOllama(settings, prompt, opts) {
  const base = (settings.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const json = await httpJson(`${base}/api/chat`, {
    model: settings.model || DEFAULT_MODEL.ollama,
    stream: false,
    format: 'json',
    messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
  }, {}, settings, opts);
  return { text: (json.message && json.message.content) || '', model: json.model || settings.model, usage: json.eval_count ? { input: json.prompt_eval_count, output: json.eval_count } : null };
}

function call(settings, prompt, opts = {}) {
  if (settings.provider === 'openai-compatible') return callOpenAiCompatible(settings, prompt, opts);
  if (settings.provider === 'ollama') return callOllama(settings, prompt, opts);
  return callAnthropic(settings, prompt, opts);
}

// ---------------------------------------------------------------------------

function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function safeFile(projectPath, rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (!r || r.split('/').includes('..')) throw Object.assign(new Error('Invalid path'), { code: 'BAD_REQUEST' });
  const full = path.resolve(projectPath, r);
  if (!full.startsWith(path.resolve(projectPath) + path.sep)) throw Object.assign(new Error('Invalid path'), { code: 'BAD_REQUEST' });
  return full;
}

/**
 * Ask for a fix. Returns a proposal:
 * { file, startLine, endLine, original, replacement, explanation, confidence,
 *   fileHash, model, usage, noFix }
 */
async function proposeFix(settings, { projectPath, issue, rule }, opts = {}) {
  if (!settings.enabled) throw Object.assign(new Error('AI CodeFix is off. Turn it on in Settings › AI CodeFix'), { code: 'AI_NOT_CONFIGURED' });
  const full = safeFile(projectPath, issue.file);
  const source = fs.readFileSync(full, 'utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const prompt = buildPrompt(issue, rule, issue.file, lines, settings);
  const reply = await call(settings, prompt, opts);
  const fix = parseReply(reply.text);
  const base = { file: issue.file, issueKey: issue.key, fileHash: sha(source), model: reply.model, usage: reply.usage, explanation: String(fix.explanation || ''), confidence: ['high', 'medium', 'low'].includes(fix.confidence) ? fix.confidence : 'medium' };
  const start = Number(fix.startLine);
  const end = Number(fix.endLine);
  if (!start) return { ...base, noFix: true };
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < prompt.window.start || end > prompt.window.end || end < start - 1) {
    throw Object.assign(new Error(`The model proposed lines ${fix.startLine}-${fix.endLine}, outside the code it was shown`), { code: 'AI_BAD_REPLY' });
  }
  const original = lines.slice(start - 1, end).join(eol);
  const replacement = String(fix.replacement == null ? '' : fix.replacement).replace(/\r?\n/g, eol);
  return { ...base, noFix: false, startLine: start, endLine: end, original, replacement };
}

/** Write an accepted proposal. Refuses when the file changed since the proposal. */
function applyFix(projectPath, proposal) {
  if (!proposal || proposal.noFix) throw Object.assign(new Error('Nothing to apply'), { code: 'BAD_REQUEST' });
  const full = safeFile(projectPath, proposal.file);
  const source = fs.readFileSync(full, 'utf8');
  if (sha(source) !== proposal.fileHash) throw Object.assign(new Error('The file changed after the fix was proposed; ask again'), { code: 'CONFLICT' });
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const before = lines.slice(0, proposal.startLine - 1);
  const after = lines.slice(proposal.endLine);
  const middle = proposal.replacement === '' ? [] : proposal.replacement.split(/\r?\n/);
  const next = [...before, ...middle, ...after].join(eol);
  fs.writeFileSync(full, next);
  return { file: proposal.file, fileHash: sha(next), linesRemoved: proposal.endLine - proposal.startLine + 1, linesAdded: middle.length, previous: source };
}

/**
 * Undo data for an applied fix, kept in `<dir>/aifix-undo/<id>.json`:
 * the file, its hash after the fix and the source before it.
 */
function saveUndo(dir, projectPath, applied) {
  const id = `fix-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const folder = path.join(dir, 'aifix-undo');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${id}.json`), JSON.stringify({ id, projectPath, file: applied.file, hashAfter: applied.fileHash, source: applied.previous, at: new Date().toISOString() }));
  return id;
}

/** Put the file back as it was before the fix. Refuses when it changed since. */
function revertFix(dir, undoId) {
  if (!/^fix-[a-z0-9-]+$/.test(String(undoId || ''))) throw Object.assign(new Error('Unknown fix'), { code: 'NOT_FOUND' });
  const file = path.join(dir, 'aifix-undo', `${undoId}.json`);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Unknown fix'), { code: 'NOT_FOUND', text: { en: 'This fix can no longer be undone.', ko: '이 수정은 더 이상 되돌릴 수 없습니다.' } });
  const undo = JSON.parse(fs.readFileSync(file, 'utf8'));
  const full = safeFile(undo.projectPath, undo.file);
  const now = fs.readFileSync(full, 'utf8');
  if (sha(now) !== undo.hashAfter) {
    throw Object.assign(new Error('The file changed after the fix was applied'), { code: 'CONFLICT', text: { en: 'The file changed after the fix was applied, so it cannot be undone automatically.', ko: '수정을 적용한 뒤 파일이 바뀌어 자동으로 되돌릴 수 없습니다.' } });
  }
  fs.writeFileSync(full, undo.source);
  fs.unlinkSync(file);
  return { file: undo.file, fileHash: sha(undo.source) };
}

/** A small round trip to check the connection and the model name. */
async function testConnection(settings, opts = {}) {
  const reply = await call({ ...settings, maxTokens: 1024, effort: 'low' }, { system: 'Reply with the JSON object {"ok": true} and nothing else.', user: 'ping' }, opts);
  return { ok: /"ok"\s*:\s*true/.test(reply.text), model: reply.model, usage: reply.usage, reply: reply.text.slice(0, 200) };
}

module.exports = { DEFAULTS, DEFAULT_MODEL, MASK, settingsOf, publicSettings, saveSettings, buildPrompt, parseReply, proposeFix, applyFix, saveUndo, revertFix, testConnection, call };
