'use strict';

// Snippet (copy-paste) open-source identification by winnowing.
//
//   fingerprint(text, file, { k, w })            -> [{ h, start, end }]
//   buildSnippetIndex(dirOrFile, { name, version, license, purl }, { out?, k?, w? }) -> index
//   loadSnippetIndex(pathOrObject)               -> index
//   bundledSnippetIndex()                        -> index built from ./corpus (our own sample code)
//   matchSnippets(files, indexes, { threshold, minMatches }) -> [match]
//
// Source text is tokenised with comments removed; identifiers, numbers and
// string literals are normalised to one placeholder each (renaming does not
// hide a copy), keywords and punctuation are kept. k-gram hashes (FNV-1a) are
// winnowed with window w: the minimum hash of every window is kept, which
// guarantees that any shared run of at least w + k - 1 tokens is detected.

const fs = require('fs');
const path = require('path');
const { maskComments, langOf } = require('../reachability');

const FORMAT = 'mcc-snippet-index';
const DEFAULT_K = 10;
const DEFAULT_W = 6;

const KEYWORDS = new Set(`
abstract and as assert async await break case catch class const continue def default defer del delete do elif else enum
except export extends extern false final finally fn for foreach from func function go goto if impl implements import in
instanceof interface is lambda let loop match mod module mut namespace new nil none not null or package pass private
protected pub public raise return select self static struct super switch synchronized this throw throws trait true try
type typedef typeof union unsafe use using var void volatile when where while with yield int long short char float double
bool boolean byte unsigned signed sizeof string str len range map chan elseif endif echo end begin unless until then
`.split(/\s+/).filter(Boolean));

const TOKEN_RE = /([A-Za-z_$][\w$]*)|(0[xX][0-9a-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(>>>=|<<=|>>=|===|!==|\*\*=|\.\.\.|=>|->|::|\+\+|--|&&|\|\||<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|[{}()[\];,.<>+\-*/%&|^!~?:=@#\\])/g;

function langForFile(file) {
  const f = String(file || '').replace(/\.snippet$/i, '');
  return langOf(f) || 'js';
}

// [{ t, line }]
function tokenize(text, file) {
  const lang = langForFile(file);
  let src;
  try { src = maskComments(String(text), lang); } catch { src = String(text); }
  const out = [];
  let line = 1;
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    for (let k = last; k < m.index; k++) if (src.charCodeAt(k) === 10) line++;
    let t;
    if (m[1]) t = KEYWORDS.has(m[1]) ? m[1] : 'I';
    else if (m[2]) t = 'N';
    else if (m[3]) t = 'S';
    else t = m[4];
    out.push({ t, line });
    for (let k = m.index; k < m.index + m[0].length; k++) if (src.charCodeAt(k) === 10) line++;
    last = m.index + m[0].length;
  }
  return out;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Winnowing fingerprints of a text: [{ h, start, end }] (line span of the k-gram).
function fingerprint(text, file, opts = {}) {
  const k = opts.k || DEFAULT_K;
  const w = opts.w || DEFAULT_W;
  const toks = tokenize(text, file);
  if (toks.length < k) return [];
  const grams = [];
  for (let i = 0; i + k <= toks.length; i++) {
    let s = '';
    for (let j = i; j < i + k; j++) s += `${toks[j].t}\u0001`;
    grams.push({ h: fnv1a(s), start: toks[i].line, end: toks[i + k - 1].line });
  }
  const out = [];
  let lastPick = -1;
  const win = Math.min(w, grams.length);
  for (let i = 0; i + win <= grams.length; i++) {
    let min = i;
    for (let j = i; j < i + win; j++) if (grams[j].h <= grams[min].h) min = j;
    if (min !== lastPick) { out.push(grams[min]); lastPick = min; }
  }
  return out;
}

// ------------------------------------------------------------ indexes ----

const SNIPPET_SKIP = new Set(['node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'venv', 'dist', 'build', 'target', 'bin', 'obj']);

function sourceFilesUnder(dirOrFile, maxFiles = 5000) {
  const out = [];
  const abs = path.resolve(dirOrFile);
  let st;
  try { st = fs.statSync(abs); } catch (err) { throw new Error(`Snippet source not found: ${abs}`); }
  if (st.isFile()) return [{ abs, rel: path.basename(abs) }];
  const walk = (dir, rel) => {
    if (out.length >= maxFiles) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SNIPPET_SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), r); }
      else if (e.isFile() && (langOf(e.name) || /\.snippet$/i.test(e.name))) out.push({ abs: path.join(dir, e.name), rel: r });
    }
  };
  walk(abs, '');
  return out;
}

function fileEntry(rel, text, opts) {
  const fp = fingerprint(text, rel, opts);
  return { path: rel, lines: String(text).split(/\r?\n/).length, fp: fp.map((f) => [f.h, f.start, f.end]) };
}

// Build an index of one component from a folder (or a single file).
function buildSnippetIndex(dirOrFile, meta = {}, opts = {}) {
  const k = opts.k || DEFAULT_K;
  const w = opts.w || DEFAULT_W;
  const files = [];
  for (const f of sourceFilesUnder(dirOrFile, opts.maxFiles)) {
    let text;
    try { text = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
    if (text.length > (opts.maxFileSize || 2 * 1024 * 1024)) continue;
    const entry = fileEntry(f.rel, text, { k, w });
    if (entry.fp.length) files.push(entry);
  }
  const index = {
    format: FORMAT, version: 1, k, w, normalize: 'identifiers',
    components: [{
      name: meta.name || path.basename(path.resolve(dirOrFile)), version: meta.version || null, license: meta.license || null,
      ...(meta.purl ? { purl: meta.purl } : {}), ...(meta.url ? { url: meta.url } : {}), files,
    }],
  };
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(index));
  return index;
}

// Merge several indexes built with the same k / w into one.
function mergeSnippetIndexes(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return null;
  const k = items[0].k;
  const w = items[0].w;
  const components = [];
  for (const idx of items) {
    if (idx.k !== k || idx.w !== w) throw new Error(`Snippet indexes use different k/w (${idx.k}/${idx.w} vs ${k}/${w})`);
    components.push(...(idx.components || []));
  }
  return { format: FORMAT, version: 1, k, w, normalize: 'identifiers', components };
}

function validateIndex(idx, label) {
  if (!idx || idx.format !== FORMAT || !Array.isArray(idx.components) || !idx.k || !idx.w) {
    throw new Error(`${label || 'snippet index'} is not a ${FORMAT} file`);
  }
  return idx;
}

function loadSnippetIndex(source) {
  if (source && typeof source === 'object') return validateIndex(source, 'snippet index');
  const p = path.resolve(String(source));
  return validateIndex(JSON.parse(fs.readFileSync(p, 'utf8')), p);
}

let bundled = null;
function bundledSnippetIndex() {
  if (bundled) return bundled;
  const dir = path.join(__dirname, 'corpus');
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8')).components || []; } catch { manifest = []; }
  const components = [];
  for (const c of manifest) {
    const files = [];
    for (const f of c.files || []) {
      let text;
      try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      const entry = fileEntry(f, text, { k: DEFAULT_K, w: DEFAULT_W });
      if (entry.fp.length) files.push(entry);
    }
    if (files.length) components.push({ name: c.name, version: c.version || null, license: c.license || null, ...(c.purl ? { purl: c.purl } : {}), origin: c.origin || 'bundled', files });
  }
  bundled = { format: FORMAT, version: 1, k: DEFAULT_K, w: DEFAULT_W, normalize: 'identifiers', components, bundled: true };
  return bundled;
}

// ------------------------------------------------------------ matching ---

const lookupCache = new WeakMap();
function lookupOf(idx) {
  if (lookupCache.has(idx)) return lookupCache.get(idx);
  const map = new Map();
  idx.components.forEach((c, ci) => (c.files || []).forEach((f, fi) => {
    const seen = new Set();
    for (const [h, start, end] of f.fp || []) {
      let list = map.get(h);
      if (!list) { list = []; map.set(h, list); }
      list.push({ ci, fi, start, end, first: !seen.has(h) });
      seen.add(h);
    }
    f.distinct = seen.size;
  }));
  lookupCache.set(idx, map);
  return map;
}

function toRanges(spans, gap = 2) {
  const sorted = spans.map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + gap) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out.map(([start, end]) => ({ start, end }));
}

// files: [{ path, text }]; indexes: [index]. Returns one match per source
// file and component (the best-matching component file).
function matchSnippets(files, indexes, opts = {}) {
  const threshold = opts.threshold != null ? Number(opts.threshold) : 0.5;
  const minMatches = opts.minMatches != null ? Number(opts.minMatches) : 8;
  const out = [];
  const groups = new Map(); // "k|w" -> [idx]
  for (const idx of (indexes || []).filter(Boolean)) {
    const key = `${idx.k}|${idx.w}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(idx);
  }
  for (const f of files || []) {
    if (!f || f.text == null || !langOf(f.path)) continue;
    for (const list of groups.values()) {
      const fps = fingerprint(f.text, f.path, { k: list[0].k, w: list[0].w });
      if (!fps.length) continue;
      const srcDistinct = new Set(fps.map((x) => x.h)).size;
      for (const idx of list) {
        const lookup = lookupOf(idx);
        const hitsBy = new Map(); // "ci|fi" -> { hashes:Set, src:[], idx:[] }
        for (const fp of fps) {
          const cands = lookup.get(fp.h);
          if (!cands) continue;
          for (const c of cands) {
            const key = `${c.ci}|${c.fi}`;
            let g = hitsBy.get(key);
            if (!g) { g = { ci: c.ci, fi: c.fi, hashes: new Set(), src: [], other: [] }; hitsBy.set(key, g); }
            g.hashes.add(fp.h);
            g.src.push([fp.start, fp.end]);
            g.other.push([c.start, c.end]);
          }
        }
        const best = new Map(); // ci -> match
        for (const g of hitsBy.values()) {
          const comp = idx.components[g.ci];
          const cf = comp.files[g.fi];
          const matched = g.hashes.size;
          const similarity = matched / Math.max(1, cf.distinct || 1);
          if (matched < minMatches || similarity < threshold) continue;
          const m = {
            file: f.path, component: comp.name, version: comp.version || null, license: comp.license || null, purl: comp.purl || null,
            origin: comp.origin || (idx.bundled ? 'bundled' : 'index'), componentFile: cf.path,
            similarity: Math.round(Math.min(1, similarity) * 1000) / 10,
            fileCoverage: Math.round(Math.min(1, matched / Math.max(1, srcDistinct)) * 1000) / 10,
            matchedFingerprints: matched,
            ranges: toRanges(g.src), componentRanges: toRanges(g.other),
          };
          const prev = best.get(g.ci);
          if (!prev || m.similarity > prev.similarity || (m.similarity === prev.similarity && m.matchedFingerprints > prev.matchedFingerprints)) best.set(g.ci, m);
        }
        out.push(...best.values());
      }
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : b.similarity - a.similarity));
  return out;
}

module.exports = {
  FORMAT, DEFAULT_K, DEFAULT_W, tokenize, fingerprint, buildSnippetIndex, mergeSnippetIndexes, loadSnippetIndex,
  bundledSnippetIndex, matchSnippets,
};
