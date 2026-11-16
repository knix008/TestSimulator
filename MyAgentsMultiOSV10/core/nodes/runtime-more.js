// What the nodes of defs-more.js do (ARCHITECTURE.md §3): input and output sources in many formats, and the
// added AI, knowledge, flow, transform and developer nodes. Same executor contract as runtime.js.
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../errors.js';
import { compare, getPath, parsePath, toText } from '../expr.js';
import { parseJsonAnswer } from '../providers/index.js';
import * as formats from '../formats.js';
import { lineDiff } from '../diff.js';
import { calculate, runCommand, inputText, workPathOf, listOf } from './runtime.js';

const rows = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.items)) return v.items;
  return listOf(v);
};
const one = (v) => (Array.isArray(v) ? null : v && typeof v === 'object' && !Array.isArray(v.items) ? v : null);

/** A picture for a model from what a node holds (Read node output, data: URL, base64) → { mime, data } or null. */
export function imageFor(v) {
  const pic = formats.imageBytes(v);
  if (!pic) return null;
  if (pic.mime === 'image/svg+xml') return null; // models take raster pictures
  return { mime: pic.mime, data: pic.bytes.toString('base64'), ...(formats.imageInfo(pic.bytes) ?? {}) };
}

/** a.b.c columns from nested objects. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

export { lineDiff };

/** "Found 3 problems" / eslint "✖ 3 problems" / ruff "Found 3 errors" / "N warnings" → a count (null: unknown). */
export function problemCount(text) {
  const s = String(text ?? '');
  const m = /✖\s*(\d+)\s+problems?/.exec(s) ?? /Found\s+(\d+)\s+(?:errors?|problems?)/i.exec(s) ?? /(\d+)\s+(?:errors?|problems?)\b/i.exec(s);
  return m ? Number(m[1]) : null;
}

async function fetchBytes(url, signal) {
  if (!/^https?:\/\//i.test(String(url))) throw new AppError('BAD_URL', `Not a web address: ${url}`, 400);
  let res;
  try { res = await fetch(url, { signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; MyAgents/1.0)' } }); } catch (err) {
    if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled', 499);
    throw new AppError('FETCH_FAILED', `${new URL(url).host}: ${err?.cause?.code ?? err.message}`, 502);
  }
  if (!res.ok) throw new AppError(`HTTP_${res.status}`, `${url} answered ${res.status} ${res.statusText}`, 502);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') ?? '' };
}

const glob = (pattern) => new RegExp(`^${String(pattern || '*').trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');

/** The newest file in a work-folder folder that matches a pattern (Folder watch on a manual run). */
export function newestFile(root, pattern) {
  if (!fs.existsSync(root)) return null;
  const re = glob(pattern);
  const files = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isFile() && re.test(d.name)).map((d) => { const full = path.join(root, d.name); return { full, name: d.name, mtime: fs.statSync(full).mtimeMs }; });
  return files.sort((a, b) => b.mtime - a.mtime)[0] ?? null;
}

/** What a Folder watch trigger hands on for a file. */
export function fileEvent(full, workDir, read = true) {
  const st = fs.statSync(full);
  const rel = path.relative(workDir, full).split(path.sep).join('/');
  const base = { path: full, file: rel, name: path.basename(full), size: st.size, modifiedAt: new Date(st.mtimeMs).toISOString() };
  if (!read) return base;
  try { const parsed = formats.parse(fs.readFileSync(full), 'auto', { name: full, maxChars: 200000 }); return { ...base, ...parsed, name: path.basename(full) }; } catch (err) { return { ...base, readError: err.message }; }
}

export const MORE_EXECUTORS = {
  // ── triggers: the payload is the trigger
  'trigger.form': (ctx) => ({ output: ctx.scope.trigger }),
  'trigger.agent': (ctx) => ({ output: ctx.scope.trigger }),
  'trigger.file'(ctx) {
    const t = ctx.scope.trigger ?? {};
    if (t.file || t.path) return { output: t };
    // a manual run: the newest matching file stands in for "a new file arrived"
    const root = workPathOf(ctx, String(ctx.config.folder ?? 'inbox'));
    const newest = newestFile(root, ctx.config.pattern);
    if (!newest) return { output: { ...t, folder: root, file: null, note: 'no matching file yet' } };
    const event = fileEvent(newest.full, ctx.services.workDir(), ctx.config.read !== false);
    // the file stands in for the trigger, so {{ trigger.name }} works the same as on a real arrival
    if (ctx.scope.trigger && typeof ctx.scope.trigger === 'object') Object.assign(ctx.scope.trigger, event); else ctx.scope.trigger = event;
    return { output: { ...t, ...event } };
  },

  // ── AI
  async 'ai.vision'(ctx) {
    const raw = ctx.value('image');
    const img = imageFor(raw);
    if (!img) throw new AppError('NO_IMAGE', 'No picture to look at (a Read node\'s picture, a data: URL or base64 PNG/JPEG/GIF/WebP)', 400);
    const prompt = toText(ctx.value('prompt')) || 'Describe this image.';
    const res = await ctx.chat({ model: ctx.config.model, system: 'You look at pictures carefully and answer in the language of the request.', messages: [{ role: 'user', content: prompt, images: [img] }], purpose: 'vision' });
    return { output: { text: res.text, image: { mime: img.mime, width: img.width ?? 0, height: img.height ?? 0 }, model: res.model } };
  },
  async 'ai.rewrite'(ctx) {
    const tone = { formal: 'formal and polite, for work', friendly: 'warm and friendly', concise: 'short and clear', persuasive: 'persuasive', plain: 'in plain, simple words' }[ctx.config.tone] ?? 'clear';
    const res = await ctx.chat({ model: ctx.config.model, system: `Rewrite the user's text so it is ${tone}. Keep its language and meaning. Reply with the rewritten text only.`, messages: [{ role: 'user', content: inputText(ctx.value('input')) }], purpose: 'rewrite' });
    return { output: { text: res.text, tone: ctx.config.tone || 'formal' } };
  },
  async 'ai.keywords'(ctx) {
    const n = Math.max(1, Number(ctx.config.count) || 5);
    const text = inputText(ctx.value('input'));
    const res = await ctx.chat({ model: ctx.config.model, system: `List the ${n} most important key terms of the user's text, in its language. Answer with JSON only: {"keywords": ["..."]}`, messages: [{ role: 'user', content: text }], json: true, schema: '{"keywords": []}', purpose: 'keywords', count: n });
    const data = parseJsonAnswer(res.text);
    const list = (Array.isArray(data?.keywords) ? data.keywords : Array.isArray(data) ? data : String(res.text).split(/[,\n]/)).map((k) => String(k).trim()).filter(Boolean).slice(0, n);
    return { output: { keywords: list, text: list.join(', ') } };
  },
  async 'ai.qa'(ctx) {
    const doc = inputText(ctx.value('document'));
    const question = inputText(ctx.value('question'));
    if (!question.trim()) throw new AppError('NO_QUESTION', 'No question to answer', 400);
    const res = await ctx.chat({ model: ctx.config.model, system: 'Answer the question using only the document below. If the document does not say, answer that it does not say. Quote the sentence you used.\n\n<document>\n' + doc.slice(0, 150000) + '\n</document>', messages: [{ role: 'user', content: question }], purpose: 'qa', document: doc });
    return { output: { text: res.text, question } };
  },

  // ── knowledge
  'kb.chunk'(ctx) {
    const text = inputText(ctx.value('text'));
    const size = Math.max(100, Number(ctx.config.size) || 800);
    const overlap = Math.min(size - 1, Math.max(0, Number(ctx.config.overlap) || 0));
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + size);
      // end at a sentence or a line when one is near
      if (end < text.length) { const cut = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf('다. ', end)); if (cut > start + size * 0.6) end = cut + 1; }
      chunks.push({ index: chunks.length, start, text: text.slice(start, end).trim() });
      if (end >= text.length) break;
      start = Math.max(start + 1, end - overlap);
    }
    return { output: { chunks: chunks.filter((c) => c.text), count: chunks.filter((c) => c.text).length, items: chunks.filter((c) => c.text).map((c) => c.text) } };
  },
  async 'kb.answer'(ctx) {
    const kbs = Array.isArray(ctx.config.kbs) ? ctx.config.kbs : [];
    if (!kbs.length) throw new AppError('NO_KB', 'Choose a knowledge base', 400);
    const question = inputText(ctx.value('question'));
    const hits = ctx.services.knowledge.search(kbs, question, Number(ctx.config.topK) || 4);
    const context = hits.map((h, i) => `[${i + 1}] (${h.doc}) ${h.text}`).join('\n\n');
    const res = await ctx.chat({ model: ctx.config.model, system: `Answer the question from the numbered passages only, citing them like [1]. If they do not answer it, say so.\n\n${context}`, messages: [{ role: 'user', content: question }], purpose: 'rag', context });
    return { output: { text: res.text, question, sources: [...new Set(hits.map((h) => h.doc))], passages: hits.length } };
  },

  // ── flow
  'logic.random'(ctx) {
    const p = Math.min(100, Math.max(0, Number(ctx.config.percentA ?? 50)));
    const port = Math.random() * 100 < p ? 'a' : 'b';
    return { output: ctx.input, port };
  },
  'logic.assert'(ctx) {
    const left = ctx.value('left');
    const ok = compare(left, ctx.config.op || 'equals', ctx.value('right'));
    if (!ok) { const message = toText(ctx.value('message')) || 'Quality gate failed'; ctx.log('error', `${message} (value: ${toText(left).slice(0, 80)})`); return { stop: { status: 'failed', message } }; }
    return { output: ctx.input };
  },
  'logic.batch'(ctx) {
    const items = rows(ctx.value('items'));
    const size = Math.max(1, Number(ctx.config.size) || 10);
    const batches = [];
    for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
    return { output: { batches, items: batches, count: batches.length, total: items.length } };
  },

  // ── transform
  'data.convert'(ctx) {
    const value = ctx.value('value');
    const to = ctx.config.to || 'html';
    const out = formats.convert(value && typeof value === 'object' && !Array.isArray(value) && !value.format && typeof value.text === 'string' ? value.text : value, ctx.config.from || 'auto', to);
    return { output: out };
  },
  'data.table'(ctx) {
    const items = rows(ctx.value('items'));
    const fmt = ctx.config.format || 'markdown';
    const md = formats.markdownTable(items);
    if (fmt === 'html') return { output: { text: formats.markdownToHtml(md), count: items.length } };
    if (fmt === 'text') return { output: { text: formats.toCsv(items, '\t'), count: items.length } };
    return { output: { text: md, count: items.length } };
  },
  'data.math'(ctx) {
    const items = rows(ctx.value('items'));
    const name = String(ctx.config.field || 'total').trim() || 'total';
    const formula = String(ctx.config.formula ?? '').trim();
    if (!formula) throw new AppError('NO_FORMULA', 'Write a formula', 400);
    const out = items.map((row, i) => {
      if (!row || typeof row !== 'object') return row;
      const keys = Object.keys(row).sort((a, b) => b.length - a.length);
      let expr = formula;
      for (const k of keys) {
        const v = Number(row[k]);
        expr = expr.replace(new RegExp(`(?<![\\w.])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g'), Number.isFinite(v) ? `(${v})` : 'NaN');
      }
      try { return { ...row, [name]: Math.round(calculate(expr) * 1e9) / 1e9 }; } catch (err) { throw new AppError('BAD_FORMULA', `Row ${i + 1}: ${err.message}`, 400); }
    });
    return { output: { items: out, count: out.length } };
  },
  'data.pick'(ctx) {
    const spec = String(ctx.config.fields ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const m = /^(.+?)\s+as\s+(.+)$/i.exec(s); return m ? [m[1].trim(), m[2].trim()] : [s, s]; });
    const pickOne = (r) => Object.fromEntries(spec.map(([from, to]) => [to, getPath(r, parsePath(from)) ?? null]));
    const v = ctx.value('items');
    const single = one(v);
    if (single) return { output: pickOne(single) };
    const items = rows(v).map(pickOne);
    return { output: { items, count: items.length, columns: spec.map((s) => s[1]) } };
  },
  'data.flatten'(ctx) {
    const v = ctx.value('items');
    const single = one(v);
    if (single) return { output: flatten(single) };
    const items = rows(v).map((r) => (r && typeof r === 'object' ? flatten(r) : r));
    return { output: { items, count: items.length, columns: [...new Set(items.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))] } };
  },

  // ── developer tools
  'dev.diff'(ctx) {
    const r = lineDiff(inputText(ctx.value('before')), inputText(ctx.value('after')), String(ctx.config.name || 'file'));
    ctx.log('info', r.same ? 'No differences' : `+${r.added} −${r.removed}`);
    return { output: { ...r, text: r.diff }, port: r.same ? 'same' : 'changed' };
  },
  async 'dev.lint'(ctx) {
    const r = await runCommand(ctx, toText(ctx.value('command')).trim(), toText(ctx.value('cwd')).trim());
    const all = `${r.stdout}\n${r.stderr}`;
    const counted = problemCount(all);
    const problems = counted ?? (r.code === 0 ? 0 : all.split(/\r?\n/).filter((l) => /\b(error|warning)\b/i.test(l)).length || 1);
    ctx.log(problems ? 'warning' : 'info', `${problems} problem(s), exit ${r.code}`);
    return { output: { problems, code: r.code, clean: problems === 0 && r.code === 0, output: all.slice(-8000) }, port: problems === 0 && r.code === 0 ? 'clean' : 'problems' };
  },
  async 'dev.build'(ctx) {
    const cwdText = toText(ctx.value('cwd')).trim();
    const r = await runCommand(ctx, toText(ctx.value('command')).trim(), cwdText);
    const base = cwdText ? (path.isAbsolute(cwdText) ? cwdText : workPathOf(ctx, cwdText)) : ctx.services.workDir();
    const dir = path.resolve(base, toText(ctx.value('artifacts')).trim() || 'dist');
    const artifacts = [];
    const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const full = path.join(d, e.name); if (e.isDirectory()) walk(full); else if (artifacts.length < 500) artifacts.push({ file: path.relative(dir, full).split(path.sep).join('/'), bytes: fs.statSync(full).size }); } };
    walk(dir);
    const ok = r.code === 0;
    ctx.log(ok ? 'info' : 'error', `exit ${r.code}, ${artifacts.length} file(s) in ${dir}`);
    return { output: { ok, code: r.code, artifacts, count: artifacts.length, dir, output: `${r.stdout}\n${r.stderr}`.slice(-8000) }, port: ok ? 'ok' : 'failed' };
  },

  // ── input and output sources
  async 'io.read'(ctx) {
    const source = ctx.config.source || 'file';
    const format = ctx.config.format || 'auto';
    const maxChars = Number(ctx.config.maxChars) || 200000;
    let bytes;
    let name = '';
    let mime = '';
    let file = null;
    if (source === 'file') {
      const full = workPathOf(ctx, toText(ctx.value('path')).trim());
      if (!fs.existsSync(full)) throw new AppError('FILE_NOT_FOUND', `No file ${full}`, 404);
      bytes = fs.readFileSync(full);
      name = full;
      file = path.relative(ctx.services.workDir(), full).split(path.sep).join('/');
    } else if (source === 'url') {
      const url = toText(ctx.value('url')).trim();
      ({ bytes, mime } = await fetchBytes(url, ctx.signal));
      name = new URL(url).pathname;
    } else if (source === 'text') {
      bytes = Buffer.from(toText(ctx.value('text')), 'utf8');
    } else {
      const v = ctx.value('value');
      const pic = formats.imageBytes(v);
      if (pic && (format === 'auto' || format === 'image')) { bytes = pic.bytes; mime = pic.mime; } else bytes = Buffer.from(v && typeof v === 'object' && !Buffer.isBuffer(v) ? (typeof v.text === 'string' ? v.text : JSON.stringify(v)) : toText(v), 'utf8');
    }
    const out = formats.parse(bytes, format, { name, mime, maxChars });
    ctx.log('info', `${out.format} · ${bytes.length} bytes${out.pages ? ` · ${out.pages} page(s)` : ''}${out.count != null ? ` · ${out.count} row(s)` : ''}`);
    return { output: { ...out, source, ...(file ? { file } : {}), name: name ? path.basename(name) : out.name } };
  },
  'io.write'(ctx) {
    const format = ctx.config.format || 'pdf';
    const value = ctx.value('value');
    const title = toText(ctx.value('title'));
    const out = formats.render(value, format, { title });
    const dataUrl = `data:${out.mime.split(';')[0]};base64,${out.bytes.toString('base64')}`;
    const preview = ['text', 'markdown', 'html', 'csv', 'json'].includes(format) || out.mime === 'image/svg+xml' ? out.bytes.toString('utf8').slice(0, 200000) : '';
    if ((ctx.config.target || 'file') === 'output') return { output: { format, mime: out.mime, ext: out.ext, bytes: out.bytes.length, dataUrl, text: preview } };
    let rel = toText(ctx.value('path')).trim() || `output/result`;
    if (!new RegExp(`\\.${out.ext}$`, 'i').test(rel)) rel = `${rel.replace(/\.[a-z0-9]{1,5}$/i, '')}.${out.ext}`;
    const full = workPathOf(ctx, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, out.bytes);
    const fileRel = path.relative(ctx.services.workDir(), full).split(path.sep).join('/');
    ctx.log('info', `Wrote ${format} · ${out.bytes.length} bytes → ${full}`);
    return { output: { path: full, file: fileRel, op: 'write', format, mime: out.mime, bytes: out.bytes.length, text: preview, ...(out.bytes.length < 2_000_000 && format === 'image' ? { dataUrl } : {}) } };
  },
  async 'tool.rss'(ctx) {
    const url = toText(ctx.value('url')).trim();
    const { bytes } = await fetchBytes(url, ctx.signal);
    const xml = bytes.toString('utf8');
    const strip = (s) => formats.htmlText(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    const tag = (block, name) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block)?.[1] ?? '';
    const blocks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
    const limit = Math.max(1, Number(ctx.config.limit) || 10);
    const items = blocks.slice(0, limit).map((b) => ({
      title: strip(tag(b, 'title')),
      link: strip(tag(b, 'link')) || /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] || '',
      date: strip(tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published')),
      summary: strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 500),
    }));
    return { output: { title: strip(tag(xml, 'title')), items, count: items.length } };
  },
};
