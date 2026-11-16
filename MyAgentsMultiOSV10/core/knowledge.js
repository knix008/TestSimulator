// Knowledge bases for retrieval (RAG): documents are cut into overlapping chunks and searched with BM25
// (ARCHITECTURE.md §7). Everything stays on this machine — no embedding service is needed. Korean text is
// indexed by words and by two-letter pieces, so "환불정책" finds "환불 정책" and the other way round.
import { newId } from './ids.js';
import { AppError, NotFoundError } from './errors.js';

const TEXT_TYPES = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|ya?ml|log|ini|toml|js|mjs|cjs|ts|tsx|jsx|py|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|sh|ps1|bat|sql|css|scss|rst|tex|srt|vtt)$/i;

/** Text from an uploaded file (HTML loses its tags). Binary formats are refused. */
export function extractText(name, text) {
  if (!TEXT_TYPES.test(name) && /[\u0000-\u0008\u000e-\u001f]/.test(String(text).slice(0, 2000))) {
    throw new AppError('UNSUPPORTED_FORMAT', `"${name}" is not a text file. Save it as text (txt, md, html, csv, json …) first.`, 400);
  }
  let s = String(text).replace(/^﻿/, '');
  if (/\.html?$/i.test(name) || /^\s*<!doctype html|^\s*<html/i.test(s)) s = htmlToText(s);
  return s.replace(/\r\n?/g, '\n');
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

/** Chunks of about `size` characters that end at paragraph or sentence breaks, `overlap` characters shared. */
export function chunkText(text, size = 900, overlap = 150) {
  const s = String(text).trim();
  if (!s) return [];
  if (s.length <= size) return [s];
  const out = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(s.length, start + size);
    if (end < s.length) {
      const window = s.slice(start + Math.floor(size * 0.5), end);
      const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('다. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      if (breakAt > 0) end = start + Math.floor(size * 0.5) + breakAt + 1;
    }
    out.push(s.slice(start, end).trim());
    if (end >= s.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}

const HANGUL = /[가-힣]/;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'for', 'on', 'with', 'it', 'this', 'that', 'be', 'as', 'at', 'by', 'what', 'how', '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도']);

/** Search terms: lower-case words (English plural s dropped), Korean words and their two-letter pieces. */
export function tokenize(text) {
  const out = [];
  for (const raw of String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (STOP.has(raw)) continue;
    if (HANGUL.test(raw)) {
      out.push(raw);
      for (let i = 0; i + 1 < raw.length; i += 1) out.push(`§${raw.slice(i, i + 2)}`);
    } else {
      out.push(raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
    }
  }
  return out;
}

class Index {
  constructor(chunks) {
    this.docs = chunks.map((c) => {
      const terms = tokenize(c.text);
      const tf = new Map();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { chunk: c, tf, len: terms.length || 1 };
    });
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avg = this.docs.reduce((n, d) => n + d.len, 0) / (this.docs.length || 1);
  }

  search(query, k = 5) {
    const terms = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const k1 = 1.2;
    const b = 0.75;
    const scored = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avg)));
      }
      if (score > 0) scored.push({ chunk: d.chunk, score });
    }
    return scored.sort((x, y) => y.score - x.score).slice(0, k);
  }
}

export function createKnowledge(store, events) {
  const indexes = new Map();
  const indexOf = (kb) => {
    let entry = indexes.get(kb.id);
    if (!entry || entry.rev !== kb.rev) { entry = { rev: kb.rev, index: new Index(kb.chunks ?? []) }; indexes.set(kb.id, entry); }
    return entry.index;
  };
  const summary = (kb) => ({ id: kb.id, name: kb.name, icon: kb.icon ?? '', description: kb.description ?? '', chunkSize: kb.chunkSize, overlap: kb.overlap, createdAt: kb.createdAt, updatedAt: kb.updatedAt, docs: kb.docs ?? [], chunks: (kb.chunks ?? []).length, chars: (kb.chunks ?? []).reduce((n, c) => n + c.text.length, 0) });
  const load = (id) => { const kb = store.kbs.get(id); if (!kb) throw new NotFoundError('KB_NOT_FOUND', `Knowledge base "${id}" not found`); return kb; };
  const save = (kb) => { kb.rev = (kb.rev ?? 0) + 1; kb.updatedAt = Date.now(); store.kbs.put(kb); events?.emit({ type: 'kb.changed', data: summary(kb) }); return summary(kb); };

  return {
    list: () => store.kbs.all().map(summary).sort((a, b) => a.name.localeCompare(b.name)),
    get: (id) => summary(load(id)),
    create({ name, description = '', icon = '', chunkSize = 900, overlap = 150 } = {}) {
      if (!String(name ?? '').trim()) throw new AppError('NAME_REQUIRED', 'A name is required', 400);
      const now = Date.now();
      return save({ id: newId(), name: String(name).trim(), description, icon, chunkSize: Number(chunkSize) || 900, overlap: Number(overlap) || 0, createdAt: now, docs: [], chunks: [] });
    },
    update(id, patch = {}) {
      const kb = load(id);
      for (const key of ['name', 'description', 'icon']) if (patch[key] !== undefined) kb[key] = String(patch[key]);
      return save(kb);
    },
    remove(id) { load(id); store.kbs.remove(id); indexes.delete(id); events?.emit({ type: 'kb.removed', data: { id } }); },
    /** Adds a document (text, or a file's text). The same name replaces the earlier document. */
    addDocument(id, { name, text }) {
      const kb = load(id);
      const title = String(name || 'document.txt').slice(0, 200);
      const body = extractText(title, text ?? '');
      if (!body.trim()) throw new AppError('EMPTY_DOCUMENT', `"${title}" has no text`, 400);
      const old = kb.docs.find((d) => d.name === title);
      if (old) { kb.docs = kb.docs.filter((d) => d !== old); kb.chunks = kb.chunks.filter((c) => c.docId !== old.id); }
      const docId = newId();
      const pieces = chunkText(body, kb.chunkSize, kb.overlap);
      kb.docs.push({ id: docId, name: title, chars: body.length, chunks: pieces.length, addedAt: Date.now() });
      kb.chunks.push(...pieces.map((t, i) => ({ id: `${docId}:${i}`, docId, doc: title, i, text: t })));
      return { kb: save(kb), doc: kb.docs.at(-1) };
    },
    removeDocument(id, docId) {
      const kb = load(id);
      kb.docs = kb.docs.filter((d) => d.id !== docId);
      kb.chunks = kb.chunks.filter((c) => c.docId !== docId);
      return save(kb);
    },
    documentText(id, docId) {
      const kb = load(id);
      return kb.chunks.filter((c) => c.docId === docId).map((c) => c.text).join('\n\n');
    },
    /** BM25 over one or more knowledge bases → [{ kb, kbName, doc, text, score }]. */
    search(ids, query, k = 5) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      const hits = [];
      for (const id of list) {
        const kb = store.kbs.get(id);
        if (!kb) continue;
        for (const h of indexOf(kb).search(query, k)) hits.push({ kb: kb.id, kbName: kb.name, doc: h.chunk.doc, chunk: h.chunk.i, text: h.chunk.text, score: Math.round(h.score * 1000) / 1000 });
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
}
