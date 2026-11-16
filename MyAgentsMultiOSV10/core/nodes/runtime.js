// What each node type does (ARCHITECTURE.md §3). An executor gets a context (ctx) from the engine:
//
//   ctx.node, ctx.config (raw settings), ctx.value(key) (a setting with its {{ }} put in), ctx.input, ctx.scope,
//   ctx.log(level, text), ctx.signal, ctx.chat(request), ctx.callTool(nodeId, args), ctx.graphTools(),
//   ctx.waitHuman(request), ctx.respond(value, status), ctx.services (knowledge, memory, engine, settings …)
//
// and returns { output, port? } (port: one name, or an array; default = the node's first output port), or
// { stop: { status: 'succeeded' | 'failed', message } }.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { AppError } from '../errors.js';
import { compare, getPath, parsePath, toText, truthy } from '../expr.js';
import { parseJsonAnswer } from '../providers/index.js';
import { htmlToText } from '../knowledge.js';
import { BUILTIN_TOOLS } from './defs.js';
import { MORE_EXECUTORS } from './runtime-more.js';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new AppError('CANCELLED', 'Cancelled', 499)); return; }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); reject(new AppError('CANCELLED', 'Cancelled', 499)); }, { once: true });
});

const inputText = (v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.text === 'string' ? v.text : toText(v));
const toolName = (s) => String(s ?? 'tool').normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'tool';
const URL_RE = /https?:\/\/[^\s"'<>)]+/i;

// ───────────────────────── safe helpers

/** Arithmetic only: numbers, + - * / % ^ ( ) and Math functions. */
export function calculate(expression) {
  const src = String(expression ?? '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').trim();
  const allowed = /^(?:[\d\s.+\-*/%(),]|\*\*|sqrt|sin|cos|tan|asin|acos|atan|log10|log2|log|ln|exp|abs|round|floor|ceil|pow|min|max|pi|PI|e|E)*$/;
  if (!src || !allowed.test(src)) throw new AppError('BAD_EXPRESSION', `Not an arithmetic expression: ${expression}`, 400);
  const code = src.replace(/\bln\b/g, 'log').replace(/\bpi\b/g, 'PI').replace(/(?<![\w.])e(?![\w(])/g, 'E');
  const value = vm.runInNewContext(`with (Math) { (${code}) }`, { Math }, { timeout: 200 });
  if (typeof value !== 'number' || Number.isNaN(value)) throw new AppError('BAD_EXPRESSION', `No number from: ${expression}`, 400);
  return value;
}

/** Runs a JavaScript function body (the Code node, the javascript tool) in a separate context. Not a security
 * boundary: it is the user's own code on the user's own machine. */
export async function runCode(code, globals, { timeout = 5000, allowFetch = true, log = () => {} } = {}) {
  const lines = [];
  const consoleLike = { log: (...a) => { const s = a.map(toText).join(' '); lines.push(s); log('info', s); }, warn: (...a) => log('warning', a.map(toText).join(' ')), error: (...a) => log('error', a.map(toText).join(' ')) };
  const sandbox = { ...structuredClone(globals ?? {}), console: consoleLike, JSON, Math, Date, URL, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout, ...(allowFetch ? { fetch } : {}) };
  const script = new vm.Script(`(async () => {\n${code}\n})()`, { filename: 'code.js' });
  const promise = script.runInNewContext(sandbox, { timeout });
  let timer;
  try {
    const value = await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new AppError('CODE_TIMEOUT', `The code ran longer than ${timeout / 1000} s`, 408)), timeout * 6); })]);
    // values made in the sandbox belong to its realm: hand back plain data of this one
    if (value === undefined || value === null || typeof value !== 'object') return value;
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('CODE_ERROR', `${err?.name ?? 'Error'}: ${err?.message ?? err}`, 400, { stack: String(err?.stack ?? '').split('\n').slice(0, 4).join('\n') });
  } finally { clearTimeout(timer); }
}

async function fetchText(url, { signal, maxChars = 20000 } = {}) {
  if (!/^https?:\/\//i.test(String(url))) throw new AppError('BAD_URL', `Not a web address: ${url}`, 400);
  let res;
  try { res = await fetch(url, { signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MyAgents/1.0)', accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5' } }); } catch (err) {
    if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
    throw new AppError('FETCH_FAILED', `${new URL(url).host}: ${err?.cause?.code ?? err.message}`, 502);
  }
  const type = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (!res.ok) throw new AppError(`HTTP_${res.status}`, `${url} answered ${res.status} ${res.statusText}`, 502, { body: body.slice(0, 500) });
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim() ?? '';
  const links = [...body.matchAll(/<a\s[^>]*href="(https?:[^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 50).map((m) => ({ url: m[1], text: htmlToText(m[2]).slice(0, 120) }));
  const text = /html/i.test(type) || /^\s*</.test(body) ? htmlToText(body) : body;
  return { url, status: res.status, title: htmlToText(title), text: text.slice(0, maxChars), truncated: text.length > maxChars, links };
}

/** Resolves a path inside the work folder (never outside it). */
function workPath(ctx, rel) {
  const root = path.resolve(ctx.services.workDir());
  const full = path.resolve(root, String(rel ?? '').replace(/^[\\/]+/, ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new AppError('PATH_OUTSIDE', `"${rel}" is outside the work folder`, 400);
  return full;
}

// ───────────────────────── commands (Run command, Run tests, git)

/** Runs a shell command in the work folder (or cwd inside / outside it) → { command, cwd, code, stdout, stderr }. */
export function runCommand(ctx, command, cwdText = '') {
  if (!ctx.services.allowShell()) throw new AppError('SHELL_DISABLED', 'Running commands is turned off (Settings › Agents › Allow commands)', 403);
  const base = ctx.services.workDir();
  const cwd = cwdText ? path.resolve(base, cwdText) : base;
  fs.mkdirSync(cwd, { recursive: true });
  ctx.log('info', `$ ${command}`);
  return new Promise((resolve, reject) => {
    // The command gets this process's environment minus what belongs to it alone (a test runner's context).
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = exec(command, { cwd, env, timeout: 300000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err && typeof err.code !== 'number') { reject(new AppError('COMMAND_FAILED', err.message, 500)); return; }
      resolve({ command, cwd, code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
    });
    ctx.signal?.addEventListener?.('abort', () => child.kill(), { once: true });
  });
}

/** Pass / fail / skip counts from the output of common test runners (node --test, jest, vitest, pytest, mocha …). */
export function parseTestSummary(text) {
  const t = String(text ?? '');
  const num = (re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
  let passed = num(/^[#ℹ]\s*pass (\d+)/m);
  let failed = num(/^[#ℹ]\s*fail (\d+)/m);
  let skipped = num(/^[#ℹ]\s*skipped (\d+)/m);
  if (passed == null) {
    const jest = /Tests:\s+(.*)total/.exec(t);
    if (jest) { passed = Number(/(\d+) passed/.exec(jest[1])?.[1] ?? 0); failed = Number(/(\d+) failed/.exec(jest[1])?.[1] ?? 0); skipped = Number(/(\d+) skipped/.exec(jest[1])?.[1] ?? 0); }
  }
  if (passed == null) { passed = num(/(\d+) passed/i); failed = num(/(\d+) failed/i) ?? failed; skipped = num(/(\d+) skipped/i) ?? skipped; }
  if (passed == null) { passed = num(/(\d+) passing/i); failed = num(/(\d+) failing/i) ?? failed; }
  return { passed: passed ?? 0, failed: failed ?? 0, skipped: skipped ?? 0, found: passed != null || failed != null };
}

const PROJECT_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.venv', '__pycache__']);
/** Source files of a folder → [{ path (relative, /), content }]. */
function readProject(root, extensions, max) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= max) return;
      if (e.isDirectory()) { if (!PROJECT_SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name)); continue; }
      const ext = e.name.split('.').pop().toLowerCase();
      if (extensions.size && !extensions.has(ext)) continue;
      const full = path.join(dir, e.name);
      const st = fs.statSync(full);
      if (st.size > 512 * 1024) continue;
      out.push({ path: path.relative(root, full).split(path.sep).join('/'), content: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return out;
}

const field = (item, p) => (p ? getPath(item, parsePath(p)) : item);
const listOf = (v) => { if (Array.isArray(v)) return v; if (typeof v === 'string') { const j = parseJsonAnswer(v); if (Array.isArray(j)) return j; } return v == null ? [] : [v]; };

function parseCsv(text, d = ',') {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === d) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head = [], ...rest] = rows.filter((r) => r.some((c) => c !== ''));
  return rest.map((r) => Object.fromEntries(head.map((h, i) => { const v = r[i] ?? ''; return [h.trim(), v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v]; })));
}
const toCsv = (rows, d = ',') => {
  const list = listOf(rows);
  const head = [...new Set(list.flatMap((r) => Object.keys(r ?? {})))];
  const esc = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) || t.includes(d) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return [head.join(d), ...list.map((r) => head.map((h) => esc(r?.[h])).join(d))].join('\n');
};

// ───────────────────────── the agent's tools

function builtinToolSpecs(selected, kbs) {
  const specs = {
    calculator: { name: 'calculator', description: 'Evaluates an arithmetic expression such as "(12.5 * 4) / 3" or "sqrt(2)". Returns the number.', parameters: { type: 'object', properties: { expression: { type: 'string', description: 'The expression' } }, required: ['expression'] } },
    datetime: { name: 'datetime', description: 'Returns the current date, time, weekday and time zone of this computer.', parameters: { type: 'object', properties: {}, required: [] } },
    http_get: { name: 'http_get', description: 'HTTP GET a URL and return the response body (JSON or text, shortened).', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Absolute http(s) URL' } }, required: ['url'] } },
    web_page: { name: 'web_page', description: 'Reads a web page and returns its title, readable text and links.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'Absolute http(s) URL' } }, required: ['url'] } },
    knowledge: { name: 'knowledge_search', description: 'Searches the knowledge bases (company documents, notes) and returns the most relevant passages with their source names.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to look for' } }, required: ['query'] } },
    javascript: { name: 'javascript', description: 'Runs a short JavaScript function body and returns its return value. Use for data transformation or exact calculation. No network.', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Function body; use return' } }, required: ['code'] } },
  };
  return (selected ?? []).filter((id) => specs[id] && BUILTIN_TOOLS.some((t) => t.id === id) && (id !== 'knowledge' || (kbs ?? []).length)).map((id) => specs[id]);
}

async function runBuiltinTool(ctx, name, args, kbs) {
  switch (name) {
    case 'calculator': return String(calculate(args.expression));
    case 'datetime': { const d = new Date(); return JSON.stringify({ iso: d.toISOString(), local: d.toLocaleString(), weekday: d.toLocaleDateString('en-US', { weekday: 'long' }), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }
    case 'http_get': { const r = await fetchText(args.url, { signal: ctx.signal, maxChars: 12000 }); return r.text; }
    case 'web_page': { const r = await fetchText(args.url, { signal: ctx.signal, maxChars: 12000 }); return JSON.stringify({ title: r.title, text: r.text, links: r.links.slice(0, 15) }); }
    case 'knowledge_search': {
      const hits = ctx.services.knowledge.search(kbs, args.query ?? '', 5);
      return hits.length ? hits.map((h, i) => `[${i + 1}] (${h.kbName} › ${h.doc}) ${h.text}`).join('\n\n') : 'No matching passages.';
    }
    case 'javascript': return toText(await runCode(args.code ?? '', {}, { timeout: 2000, allowFetch: false, log: ctx.log }));
    default: return null;
  }
}

// ───────────────────────── executors

const passthrough = (ctx) => ({ output: ctx.input });

export const EXECUTORS = {
  'trigger.manual': (ctx) => ({ output: ctx.scope.trigger }),
  'trigger.chat': (ctx) => ({ output: ctx.scope.trigger }),
  'trigger.webhook': (ctx) => ({ output: ctx.scope.trigger }),
  'trigger.schedule': (ctx) => ({ output: ctx.scope.trigger }),

  async 'ai.llm'(ctx) {
    const json = Boolean(ctx.config.json);
    const shape = String(ctx.config.schema ?? '').trim();
    let system = toText(ctx.value('system'));
    if (json) system = `${system}\n\nAnswer with one JSON value only, no text around it.${shape ? `\nUse this shape:\n${shape}` : ''}`.trim();
    const prompt = toText(ctx.value('prompt'));
    const res = await ctx.chat({ model: ctx.config.model, system, messages: [{ role: 'user', content: prompt }], json, schema: shape, maxTokens: ctx.config.maxTokens, effort: ctx.config.effort, purpose: 'llm' });
    if (!json) return { output: { text: res.text, model: res.model, usage: res.usage } };
    const data = parseJsonAnswer(res.text);
    if (data == null) throw new AppError('BAD_JSON_ANSWER', 'The model did not answer with JSON', 502, { answer: res.text.slice(0, 500) });
    return { output: { text: res.text, data, model: res.model, usage: res.usage } };
  },

  async 'ai.agent'(ctx) {
    const cfg = ctx.config;
    const kbs = Array.isArray(cfg.kbs) ? cfg.kbs : [];
    const builtins = builtinToolSpecs(cfg.tools, kbs);
    const graph = ctx.graphTools();
    const used = new Set(builtins.map((t) => t.name));
    const graphTools = graph.map((g) => {
      let name = toolName(g.node.name || g.node.type);
      while (used.has(name)) name = `${name}_2`;
      used.add(name);
      return { name, nodeId: g.node.id, description: String(g.node.config?.toolDescription || g.node.description || g.def.desc?.en || g.node.name), parameters: { type: 'object', properties: { input: { type: 'string', description: 'What to pass to this tool (text, a URL, a query …)' } }, required: ['input'] } };
    });
    const tools = [...builtins, ...graphTools.map(({ nodeId, ...spec }) => spec)];
    const system = toText(ctx.value('system'));
    const prompt = inputText(ctx.value('prompt'));
    const session = ctx.run.sessionId || 'default';
    const history = cfg.memory ? ctx.services.memory.get(ctx.run.agentId, session, Number(cfg.memoryWindow) || 20).map((m) => ({ role: m.role, content: m.content })) : [];
    const messages = [...history, { role: 'user', content: prompt }];
    const calls = [];
    const maxSteps = Math.max(1, Number(cfg.maxSteps) || 8);
    let answer = '';
    let stopped = true;
    for (let round = 1; round <= maxSteps; round += 1) {
      const res = await ctx.chat({ model: cfg.model, system, messages, tools, maxTokens: cfg.maxTokens, effort: cfg.effort, purpose: 'agent' });
      messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls, raw: res.raw, rawProvider: res.rawProvider });
      answer = res.text || answer;
      if (!res.toolCalls?.length) { stopped = false; break; }
      for (const call of res.toolCalls) {
        const started = Date.now();
        ctx.tool('start', { name: call.name, args: call.args, round });
        let result;
        let isError = false;
        try {
          const graphTool = graphTools.find((t) => t.name === call.name);
          if (graphTool) {
            const text = String(call.args?.input ?? '');
            const out = await ctx.callTool(graphTool.nodeId, { input: text, text, query: text, url: URL_RE.exec(text)?.[0] ?? text, args: call.args });
            result = toText(out);
          } else {
            result = await runBuiltinTool(ctx, call.name, call.args ?? {}, kbs);
            if (result == null) { result = `Unknown tool "${call.name}"`; isError = true; }
          }
        } catch (err) {
          if (err?.code === 'CANCELLED') throw err;
          result = `Error: ${err.message}`;
          isError = true;
        }
        const shown = result.length > 12000 ? `${result.slice(0, 12000)}\n… (shortened)` : result;
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: shown, isError });
        calls.push({ name: call.name, args: call.args, result: shown.slice(0, 2000), error: isError, ms: Date.now() - started });
        ctx.tool('end', { name: call.name, error: isError, ms: Date.now() - started, result: shown.slice(0, 300) });
      }
    }
    if (stopped) { ctx.log('warning', `Stopped after ${maxSteps} model calls (Max steps)`); if (!answer) answer = `(stopped after ${maxSteps} steps)`; }
    if (cfg.memory) ctx.services.memory.append(ctx.run.agentId, session, { role: 'user', content: prompt }, { role: 'assistant', content: answer });
    return { output: { text: answer, toolCalls: calls, rounds: messages.filter((m) => m.role === 'assistant').length } };
  },

  async 'ai.classify'(ctx) {
    const categories = (Array.isArray(ctx.config.categories) ? ctx.config.categories : []).map((c) => String(c).trim()).filter(Boolean);
    const text = inputText(ctx.value('input'));
    const system = `Classify the user's text into exactly one of these categories: ${categories.map((c) => `"${c}"`).join(', ')}, or "other" when none fits.${ctx.config.instructions ? `\nGuidance: ${ctx.config.instructions}` : ''}\nAnswer with JSON only: {"category": "<one of them>", "reason": "<a few words>"}`;
    const res = await ctx.chat({ model: ctx.config.model, system, messages: [{ role: 'user', content: text }], json: true, maxTokens: 300, purpose: 'classify', categories });
    const data = parseJsonAnswer(res.text) ?? {};
    const said = String(data.category ?? res.text ?? '').trim().toLowerCase();
    const category = categories.find((c) => c.toLowerCase() === said) ?? categories.find((c) => said.includes(c.toLowerCase())) ?? 'other';
    return { output: { category, reason: data.reason ?? '', text }, port: category };
  },

  async 'ai.extract'(ctx) {
    const fields = (Array.isArray(ctx.config.fields) ? ctx.config.fields : []).filter((f) => f?.key);
    const text = inputText(ctx.value('input'));
    const system = `Extract these fields from the user's text. Use "" when a field is not there; do not invent values.\n${fields.map((f) => `- ${f.key}: ${f.value ?? ''}`).join('\n')}\nAnswer with one JSON object with exactly these keys.`;
    const res = await ctx.chat({ model: ctx.config.model, system, messages: [{ role: 'user', content: text }], json: true, maxTokens: 2000, purpose: 'extract', fields });
    const data = parseJsonAnswer(res.text);
    if (!data || typeof data !== 'object') throw new AppError('BAD_JSON_ANSWER', 'The model did not answer with a JSON object', 502, { answer: res.text.slice(0, 500) });
    return { output: Object.fromEntries(fields.map((f) => [f.key, data[f.key] ?? ''])) };
  },

  'kb.search'(ctx) {
    const kbs = Array.isArray(ctx.config.kbs) ? ctx.config.kbs : [];
    if (!kbs.length) throw new AppError('NO_KB', 'Choose a knowledge base', 400);
    const query = inputText(ctx.value('query'));
    const results = ctx.services.knowledge.search(kbs, query, Number(ctx.config.topK) || 5);
    ctx.log('info', `${results.length} passages for "${query.slice(0, 60)}"`);
    return { output: { query, results, context: results.map((h, i) => `[${i + 1}] (${h.doc}) ${h.text}`).join('\n\n'), sources: [...new Set(results.map((h) => h.doc))] } };
  },
  'kb.add'(ctx) {
    if (!ctx.config.kb) throw new AppError('NO_KB', 'Choose a knowledge base', 400);
    const { doc } = ctx.services.knowledge.addDocument(ctx.config.kb, { name: `${toText(ctx.value('title')) || 'note'}.txt`, text: inputText(ctx.value('text')) });
    return { output: { doc } };
  },

  'logic.if'(ctx) {
    const rows = Array.isArray(ctx.config.conditions) ? ctx.config.conditions : [];
    const results = rows.map((r) => compare(ctx.render(r.left), r.op || 'equals', ctx.render(r.right)));
    const ok = rows.length === 0 ? false : ctx.config.combine === 'or' ? results.some(Boolean) : results.every(Boolean);
    return { output: ctx.input, port: ok ? 'true' : 'false' };
  },
  'logic.switch'(ctx) {
    const value = toText(ctx.value('value')).trim();
    const cases = (Array.isArray(ctx.config.cases) ? ctx.config.cases : []).map(String);
    const hit = cases.find((c) => c === value) ?? cases.find((c) => c.toLowerCase() === value.toLowerCase());
    return { output: ctx.input, port: hit ?? 'default' };
  },
  'logic.loop'(ctx) {
    // The engine runs the item branch; this only works out the list.
    let items = ctx.value('items');
    if (typeof items === 'string') { const parsed = parseJsonAnswer(items); items = Array.isArray(parsed) ? parsed : items.split(/\r?\n/).filter((x) => x.trim()); }
    if (items && !Array.isArray(items) && typeof items === 'object') items = Object.entries(items).map(([key, value]) => ({ key, value }));
    if (!Array.isArray(items)) items = items == null ? [] : [items];
    return { items: items.slice(0, Math.max(1, Number(ctx.config.max) || 100)) };
  },
  'logic.merge': passthrough,
  'logic.set'(ctx) {
    for (const row of Array.isArray(ctx.config.values) ? ctx.config.values : []) if (row?.key) ctx.scope.vars[row.key] = ctx.render(row.value);
    return { output: ctx.input };
  },
  'logic.template'(ctx) { return { output: { text: toText(ctx.value('template')) } }; },
  async 'logic.code'(ctx) {
    const s = ctx.scope;
    const value = await runCode(String(ctx.config.code ?? ''), { input: ctx.input, trigger: s.trigger, vars: s.vars, nodes: s.nodes, item: s.item, index: s.index, run: s.run }, { timeout: (Number(ctx.config.timeout) || 5) * 1000, log: ctx.log });
    return { output: value === undefined ? null : value };
  },
  async 'logic.wait'(ctx) { await sleep(Math.max(0, Number(ctx.config.seconds) || 0) * 1000, ctx.signal); return { output: ctx.input }; },
  'logic.stop'(ctx) {
    const message = toText(ctx.value('message'));
    return { stop: { status: ctx.config.mode === 'error' ? 'failed' : 'succeeded', message } };
  },

  async 'tool.http'(ctx) {
    const method = String(ctx.config.method || 'GET').toUpperCase();
    const url = new URL(toText(ctx.value('url')).trim());
    for (const row of ctx.render(ctx.config.query ?? []) ?? []) if (row?.key) url.searchParams.set(row.key, toText(row.value));
    const headers = {};
    for (const row of ctx.render(ctx.config.headers ?? []) ?? []) if (row?.key) headers[row.key] = toText(row.value);
    if (ctx.config.auth) { const cred = ctx.services.credentials.byId(ctx.config.auth); if (cred?.apiKey) headers.authorization ??= `Bearer ${cred.apiKey}`; }
    let body;
    if (!['GET', 'HEAD'].includes(method) && ctx.config.body !== '' && ctx.config.body != null) {
      const v = ctx.value('body');
      if (typeof v === 'string') { const parsed = parseJsonAnswer(v); body = parsed != null && /^\s*[[{]/.test(v) ? JSON.stringify(parsed) : v; headers['content-type'] ??= parsed != null && /^\s*[[{]/.test(v) ? 'application/json' : 'text/plain; charset=utf-8'; }
      else { body = JSON.stringify(v); headers['content-type'] ??= 'application/json'; }
    }
    ctx.log('info', `${method} ${url.href}`);
    let res;
    try { res = await fetch(url, { method, headers, body, signal: ctx.signal }); } catch (err) {
      if (ctx.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
      throw new AppError('FETCH_FAILED', `${url.host}: ${err?.cause?.code ?? err.message}`, 502);
    }
    const text = await res.text();
    let data = text;
    if (/json/i.test(res.headers.get('content-type') ?? '') || /^\s*[[{]/.test(text)) { try { data = JSON.parse(text); } catch { data = text; } }
    const output = { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers), data };
    if (!res.ok) throw new AppError(`HTTP_${res.status}`, `${method} ${url.host}${url.pathname} answered ${res.status} ${res.statusText}`, 502, { body: text.slice(0, 500) });
    return { output };
  },
  async 'tool.web'(ctx) { return { output: await fetchText(toText(ctx.value('url')).trim(), { signal: ctx.signal, maxChars: Number(ctx.config.maxChars) || 20000 }) }; },
  async 'tool.subagent'(ctx) {
    if (!ctx.config.agent) throw new AppError('NO_AGENT', 'Choose the agent to call', 400);
    const value = ctx.value('input');
    const payload = value && typeof value === 'object' ? value : { text: toText(value), message: toText(value) };
    const run = await ctx.services.engine.runAndWait(ctx.config.agent, { kind: 'manual', payload }, { parentRunId: ctx.run.id, depth: (ctx.run.depth ?? 0) + 1, sessionId: ctx.run.sessionId, signal: ctx.signal });
    ctx.log('info', `Sub-run ${run.id}: ${run.status}`);
    if (run.status !== 'succeeded') throw new AppError('SUBAGENT_FAILED', `The agent "${run.agentName}" ${run.status}: ${run.error?.message ?? ''}`, 502, { runId: run.id });
    return { output: run.output };
  },
  async 'tool.file'(ctx) {
    const op = ctx.config.op || 'read';
    const file = workPath(ctx, toText(ctx.value('path')));
    if (op === 'list') {
      if (!fs.existsSync(file)) return { output: { path: file, entries: [] } };
      return { output: { path: file, entries: fs.readdirSync(file, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } };
    }
    if (op === 'read') {
      if (!fs.existsSync(file)) throw new AppError('FILE_NOT_FOUND', `No file ${file}`, 404);
      return { output: { path: file, text: fs.readFileSync(file, 'utf8') } };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const content = inputText(ctx.value('content'));
    if (op === 'append') fs.appendFileSync(file, content.endsWith('\n') ? content : `${content}\n`); else fs.writeFileSync(file, content);
    ctx.log('info', `${op === 'append' ? 'Appended to' : 'Wrote'} ${file}`);
    const rel = path.relative(ctx.services.workDir(), file).split(path.sep).join('/');
    return { output: { path: file, file: rel, op, bytes: Buffer.byteLength(content), text: op === 'write' ? content.slice(0, 200000) : fs.readFileSync(file, 'utf8').slice(-200000) } };
  },
  async 'tool.shell'(ctx) {
    const cwdText = toText(ctx.value('cwd')).trim();
    return { output: await runCommand(ctx, toText(ctx.value('command')).trim(), cwdText) };
  },
  'tool.json'(ctx) {
    const value = ctx.value('value');
    if (ctx.config.op === 'stringify') return { output: { text: JSON.stringify(value, null, 2) } };
    if (ctx.config.op === 'pick') return { output: getPath(value, parsePath(String(ctx.config.path ?? ''))) ?? null };
    if (typeof value !== 'string') return { output: value };
    const data = parseJsonAnswer(value);
    if (data == null) throw new AppError('BAD_JSON', 'The text is not JSON', 400);
    return { output: data };
  },
  'tool.datetime'(ctx) {
    const d = new Date(Date.now() + (Number(ctx.config.offsetDays) || 0) * 86400000);
    const timeZone = String(ctx.config.timeZone || '').trim() || undefined;
    let local;
    try { local = d.toLocaleString('sv-SE', { timeZone }); } catch { throw new AppError('BAD_TIMEZONE', `Unknown time zone "${timeZone}"`, 400); }
    return { output: { iso: d.toISOString(), date: local.slice(0, 10), time: local.slice(11, 19), weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone }), timestamp: d.getTime(), timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone } };
  },

  async 'human.approval'(ctx) {
    const minutes = Number(ctx.config.timeoutMinutes) || 0;
    const answer = await ctx.waitHuman({ kind: 'approval', message: toText(ctx.value('message')), timeoutMs: minutes * 60000 });
    const approved = Boolean(answer?.approved) && !answer?.timeout;
    return { output: { approved, comment: answer?.comment ?? '', timeout: Boolean(answer?.timeout), input: ctx.input }, port: approved ? 'approved' : 'rejected' };
  },
  async 'human.input'(ctx) {
    const fields = (Array.isArray(ctx.config.fields) ? ctx.config.fields : []).map(String).filter(Boolean);
    const answer = await ctx.waitHuman({ kind: 'input', message: toText(ctx.value('message')), fields });
    return { output: { ...(answer?.values ?? {}) } };
  },
  'human.notify'(ctx) {
    const message = inputText(ctx.value('message'));
    ctx.notify(ctx.config.level || 'info', message);
    return { output: { message, level: ctx.config.level || 'info' } };
  },

  async 'ai.summarize'(ctx) {
    const len = { short: 'in at most three lines', medium: 'in one paragraph', long: 'in detail, keeping every key point' }[ctx.config.length] ?? 'briefly';
    const style = ctx.config.style === 'paragraph' ? 'as prose' : 'as bullet points';
    const res = await ctx.chat({ model: ctx.config.model, system: `Summarize the user's text ${len}, ${style}, in the text's own language.`, messages: [{ role: 'user', content: inputText(ctx.value('input')) }], purpose: 'llm' });
    return { output: { text: res.text } };
  },
  async 'ai.translate'(ctx) {
    const to = toText(ctx.value('to')) || 'English';
    const res = await ctx.chat({ model: ctx.config.model, system: `Translate the user's text into ${to}. Reply with the translation only.`, messages: [{ role: 'user', content: inputText(ctx.value('input')) }], purpose: 'llm' });
    return { output: { text: res.text, to } };
  },
  async 'ai.sentiment'(ctx) {
    const text = inputText(ctx.value('input'));
    const cats = ['positive', 'negative', 'neutral'];
    const res = await ctx.chat({ model: ctx.config.model, system: 'Classify the sentiment of the user\'s text as positive, negative or neutral. Answer with JSON only: {"category": "...", "reason": "..."}', messages: [{ role: 'user', content: text }], json: true, maxTokens: 200, purpose: 'classify', categories: cats });
    const said = String((parseJsonAnswer(res.text) ?? {}).category ?? res.text).toLowerCase();
    const category = cats.find((c) => said.includes(c)) ?? 'neutral';
    return { output: { category, text }, port: category };
  },
  'data.csv'(ctx) {
    const d = String(ctx.config.delimiter || ',');
    const v = ctx.value('value');
    if (ctx.config.op === 'stringify') return { output: { text: toCsv(v, d) } };
    const items = parseCsv(inputText(v), d);
    return { output: { items, count: items.length, columns: Object.keys(items[0] ?? {}) } };
  },
  'data.filter'(ctx) {
    const items = listOf(ctx.value('items'));
    const want = ctx.value('value');
    const kept = items.filter((it) => compare(field(it, ctx.config.field), ctx.config.op || 'equals', want));
    return { output: { items: kept, count: kept.length, removed: items.length - kept.length } };
  },
  'data.sort'(ctx) {
    const items = [...listOf(ctx.value('items'))];
    const key = (x) => field(x, ctx.config.field);
    items.sort((a, b) => { const x = key(a); const y = key(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? '')); return ctx.config.order === 'desc' ? -r : r; });
    const n = Number(ctx.config.limit) || 0;
    return { output: { items: n ? items.slice(0, n) : items, count: n ? Math.min(n, items.length) : items.length } };
  },
  'data.aggregate'(ctx) {
    const items = listOf(ctx.value('items'));
    const fn = ctx.config.fn || 'sum';
    const calc = (list) => {
      const nums = list.map((x) => Number(field(x, ctx.config.valueField))).filter((n) => !Number.isNaN(n));
      if (fn === 'count') return list.length;
      if (!nums.length) return 0;
      if (fn === 'avg') return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      if (fn === 'min') return Math.min(...nums);
      if (fn === 'max') return Math.max(...nums);
      return nums.reduce((a, b) => a + b, 0);
    };
    if (!ctx.config.groupBy) return { output: { value: calc(items), count: items.length } };
    const groups = {};
    for (const it of items) { const k = String(field(it, ctx.config.groupBy) ?? ''); (groups[k] = groups[k] || []).push(it); }
    const result = Object.fromEntries(Object.entries(groups).map(([k, list]) => [k, calc(list)]));
    return { output: { groups: result, rows: Object.entries(result).map(([key, value]) => ({ key, value })), count: items.length } };
  },
  'data.split'(ctx) {
    const text = inputText(ctx.value('value'));
    const mode = ctx.config.mode || 'lines';
    let items;
    if (mode === 'paragraphs') items = text.split(/\n\s*\n/);
    else if (mode === 'sentences') items = text.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/);
    else if (mode === 'delimiter') items = text.split(String(ctx.config.delimiter ?? ','));
    else if (mode === 'regex') { try { items = text.split(new RegExp(String(ctx.config.delimiter || '\\s+'))); } catch (err) { throw new AppError('BAD_REGEX', err.message, 400); } }
    else items = text.split(/\r?\n/);
    items = items.map((x) => x.trim()).filter(Boolean);
    return { output: { items, count: items.length } };
  },
  'data.regex'(ctx) {
    const text = inputText(ctx.value('value'));
    let re;
    try { re = new RegExp(String(ctx.config.pattern ?? ''), String(ctx.config.flags ?? '')); } catch (err) { throw new AppError('BAD_REGEX', err.message, 400); }
    const op = ctx.config.op || 'extract';
    if (op === 'test') return { output: { match: re.test(text) }, port: undefined };
    if (op === 'replace') return { output: { text: text.replace(re, String(ctx.config.replacement ?? '')) } };
    if (op === 'match') { const m = re.exec(text); return { output: { match: m ? m[0] : null, groups: m ? m.slice(1) : [] } }; }
    const all = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].map((m) => m[0]);
    return { output: { items: all, count: all.length } };
  },
  'data.dedupe'(ctx) {
    const items = listOf(ctx.value('items'));
    const seen = new Set();
    const kept = items.filter((x) => { const k = JSON.stringify(field(x, ctx.config.field)); if (seen.has(k)) return false; seen.add(k); return true; });
    return { output: { items: kept, count: kept.length, removed: items.length - kept.length } };
  },
  'logic.counter'(ctx) {
    const name = String(ctx.config.name || 'count');
    const now = Number(ctx.scope.vars[name]) || 0;
    const next = ctx.config.op === 'reset' ? 0 : ctx.config.op === 'get' ? now : now + 1;
    ctx.scope.vars[name] = next;
    return { output: { ...(ctx.input && typeof ctx.input === 'object' && !Array.isArray(ctx.input) ? ctx.input : { input: ctx.input }), [name]: next, count: next } };
  },
  async 'tool.test'(ctx) {
    const r = await runCommand(ctx, toText(ctx.value('command')).trim(), toText(ctx.value('cwd')).trim());
    const all = `${r.stdout}\n${r.stderr}`;
    const sum = parseTestSummary(all);
    const ok = r.code === 0 && sum.failed === 0;
    const failures = all.split(/\r?\n/).filter((l) => /^\s*(not ok|✖|FAIL|AssertionError|Error:)/.test(l)).slice(0, 30);
    ctx.log(ok ? 'info' : 'warning', `${ctx.config.kind || 'tests'}: ${sum.passed} passed, ${sum.failed} failed, ${sum.skipped} skipped (exit ${r.code})`);
    return { output: { kind: ctx.config.kind || 'unit', ok, passed: sum.passed, failed: ok ? 0 : Math.max(sum.failed, 1), skipped: sum.skipped, total: sum.passed + sum.failed + sum.skipped, code: r.code, failures, output: all.slice(-8000) }, port: ok ? 'passed' : 'failed' };
  },
  'tool.project'(ctx) {
    const p = toText(ctx.value('path')).trim();
    const root = path.isAbsolute(p) ? p : workPath(ctx, p);
    if (!fs.existsSync(root)) return { output: { root, files: [], count: 0, exists: false } };
    const exts = new Set(String(ctx.config.include || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
    const files = readProject(root, exts, Number(ctx.config.maxFiles) || 200);
    ctx.log('info', `${files.length} file(s) from ${root}`);
    return { output: { root, files, count: files.length, exists: true, tree: files.map((x) => x.path) } };
  },
  async 'tool.git'(ctx) {
    const op = ctx.config.op || 'status';
    const q = (v) => JSON.stringify(String(v));
    const commands = { status: 'git status --short --branch', diff: 'git diff', log: 'git log --oneline -20', init: 'git init', commit: `git add -A && git commit -m ${q(toText(ctx.value('message')) || 'update')}`, clone: `git clone ${q(toText(ctx.value('url')))} .` };
    return { output: { op, ...(await runCommand(ctx, commands[op] ?? commands.status, toText(ctx.value('cwd')).trim())) } };
  },
  async 'tool.sqlite'(ctx) {
    let sqlite;
    try { sqlite = await import('node:sqlite'); } catch { throw new AppError('NO_SQLITE', 'This Node.js has no node:sqlite (22.13 or newer is needed)', 500); }
    const file = workPath(ctx, toText(ctx.value('database')).trim() || 'data/app.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new sqlite.DatabaseSync(file);
    try {
      const statements = toText(ctx.value('sql')).split(';').map((x) => x.trim()).filter(Boolean);
      const results = [];
      let rows = [];
      for (const sql of statements) {
        if (/^(select|pragma|with|explain)\b/i.test(sql)) { rows = db.prepare(sql).all(); results.push({ sql, rows: rows.length }); }
        else { const r = db.prepare(sql).run(); results.push({ sql, changes: Number(r.changes) }); }
      }
      return { output: { database: file, rows: JSON.parse(JSON.stringify(rows, (k, v) => (typeof v === 'bigint' ? Number(v) : v))), results } };
    } catch (err) {
      throw new AppError('SQL_ERROR', err.message, 400);
    } finally { db.close(); }
  },
  async 'tool.chatops'(ctx) {
    const url = toText(ctx.value('url')).trim();
    if (!/^https?:\/\//.test(url)) throw new AppError('BAD_URL', 'Enter the incoming webhook URL', 400);
    const text = inputText(ctx.value('text'));
    const body = ctx.config.service === 'discord' ? { content: text } : { text };
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctx.signal }); } catch (err) { throw new AppError('FETCH_FAILED', err.message, 502); }
    if (!res.ok) throw new AppError(`HTTP_${res.status}`, `The webhook answered ${res.status}`, 502);
    return { output: { sent: true, service: ctx.config.service, text } };
  },

  'out.respond'(ctx) {
    const value = ctx.value('value');
    ctx.respond(value, Number(ctx.config.status) || 200);
    return { output: value };
  },
};

export { truthy, inputText, fetchText, listOf, workPath as workPathOf };

// the nodes of defs-more.js
Object.assign(EXECUTORS, MORE_EXECUTORS);
