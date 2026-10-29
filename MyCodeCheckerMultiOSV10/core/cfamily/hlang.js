'use strict';

// The language of each header of a project. A '.c' file is C and a '.cpp'
// file is C++, but a '.h' header is whatever the code that includes it is:
//
//   'cpp'  - it has C++-only syntax outside `#ifdef __cplusplus` (namespace,
//            class with a base list, template, std::, references, operator,
//            access labels ...), or only C++ units include it
//   'c'    - only C units include it (or none does and it has no C++ syntax)
//   'both' - C and C++ units include it
//
// The includes are read from the source text (cheap, no preprocessing): an
// #include inside `#ifdef __cplusplus` only counts for C++ units and one
// inside `#ifndef __cplusplus` only for C units. Includes are resolved as the
// preprocessor does (core/cfamily/preprocess.js resolveInclude).

const posix = require('path').posix;
const { builtinHeaders } = require('./headers');
const { normPath } = require('./preprocess');

const HEADER_EXT = new Set(['.h', '.hh', '.hpp', '.hxx', '.h++', '.inl', '.ipp', '.tpp', '.tcc']);
const CPP_EXT = new Set(['.cpp', '.cc', '.cxx', '.c++', '.cp', '.hpp', '.hh', '.hxx', '.h++', '.ipp', '.tpp', '.tcc', '.inl', '.cppm', '.ixx']);

// C++ standard library headers (no '.h'): including one outside a
// `#ifdef __cplusplus` makes a header C++.
const CPP_STD = new Set(('algorithm any array atomic barrier bit bitset charconv chrono codecvt compare complex concepts '
  + 'condition_variable coroutine deque exception execution expected filesystem format forward_list fstream functional '
  + 'future initializer_list iomanip ios iosfwd iostream istream iterator latch limits list locale map memory '
  + 'memory_resource mutex new numbers numeric optional ostream print queue random ranges ratio regex scoped_allocator '
  + 'semaphore set shared_mutex source_location span spanstream sstream stack stacktrace stdexcept stop_token streambuf '
  + 'string string_view syncstream system_error thread tuple type_traits typeindex typeinfo unordered_map unordered_set '
  + 'utility valarray variant vector version cassert cctype cerrno cfenv cfloat cinttypes climits clocale cmath csetjmp '
  + 'csignal cstdarg cstddef cstdint cstdio cstdlib cstring ctime cuchar cwchar cwctype').split(' '));

// C++-only syntax, matched on code without comments, string contents,
// directives and `[[...]]` attributes.
const CPP_SYNTAX = [
  /\bnamespace\s+[A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*\s*[{=]/,
  /\bnamespace\s*\{/,
  /\busing\s+namespace\b/,
  /\btemplate\s*</,
  /\b(?:class|struct)\s+[A-Za-z_]\w*(?:\s+final)?\s*:\s*(?:public|private|protected|virtual)\b/,
  /\bclass\s+[A-Za-z_]\w*(?:\s+final)?\s*\{/,
  /\benum\s+(?:class|struct)\s+[A-Za-z_]/,
  /(?:^|[;{}])\s*(?:public|private|protected)\s*:(?!:)/m,
  /[A-Za-z_]\w*::~?[A-Za-z_]/,
  /\boperator\s*(?:\(\s*\)|\[\s*\]|new\b|delete\b|->|[-+*/%^&|~!=<>]{1,3})\s*\(/,
  /\bconst\s+[A-Za-z_][\w:]*(?:\s*<[^;{}()]*>)?\s*&{1,2}\s*(?:[A-Za-z_]\w*\s*)?[,)=;]/,
  /\(\s*[A-Za-z_][\w:]*(?:<[^;{}()]*>)?&{1,2}\s*[A-Za-z_]\w*\s*[,)=]/,
  /\bvirtual\s+[~A-Za-z_][\w:<>,\s*&]*\(/,
  /\b(?:static_cast|dynamic_cast|reinterpret_cast|const_cast)\s*</,
  /\b(?:noexcept|decltype)\s*\(/,
  /\btry\s*\{/,
];

function extOf(p) { return posix.extname(String(p || '')).toLowerCase(); }
function isHeader(p) { return HEADER_EXT.has(extOf(p)); }
function langByName(p, given) {
  if (String(p || '').endsWith('.C') || CPP_EXT.has(extOf(p))) return 'cpp';
  if (given === 'cpp') return 'cpp';
  return 'c';
}

// Code with comments removed, string and character contents emptied and
// continued lines joined, as logical lines. A raw string literal (C++ only)
// sets out.raw.
function logicalLines(text) {
  const src = String(text || '');
  const n = src.length;
  let cur = '';
  const lines = [];
  let raw = false;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) { i += src[i + 1] === '\r' ? 3 : 2; continue; }
    if (ch === '\n') { lines.push(cur); cur = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) i += src[i + 1] === '\r' ? 3 : 2;
        else i++;
      }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      // keep the line structure
      for (let k = i; k < end; k++) if (src[k] === '\n') { lines.push(cur); cur = ''; }
      cur += ' ';
      i = end;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      // R"delim( ... )delim"
      if (ch === '"' && /(?:^|[^\w])(?:u8|[uUL])?R$/.test(cur.slice(-3)) ) {
        const open = src.indexOf('(', i + 1);
        const delim = open < 0 ? '' : src.slice(i + 1, open);
        if (open >= 0 && delim.length <= 16 && !/[\s\\)]/.test(delim)) {
          const close = src.indexOf(')' + delim + '"', open + 1);
          const end = close < 0 ? n : close + delim.length + 2;
          for (let k = i; k < end; k++) if (src[k] === '\n') { lines.push(cur); cur = ''; }
          cur += '""';
          raw = true;
          i = end;
          continue;
        }
      }
      // keep the contents of an #include "name"
      const keep = ch === '"' && /^\s*#\s*(?:include|include_next|import)\s*$/.test(cur);
      let k = i + 1;
      while (k < n && src[k] !== ch && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
      cur += keep ? src.slice(i, Math.min(k + 1, n)) : ch + ch;
      i = k + 1;
      continue;
    }
    PLAIN.lastIndex = i;
    const run = PLAIN.exec(src);
    if (run) { cur += run[0]; i += run[0].length; } else { cur += ch; i++; }
  }
  lines.push(cur);
  return { lines, raw };
}
const PLAIN = /[^\\\n\r/"']+/y;

// The meaning of a conditional for C++: 'cpp' (its group is only seen by C++),
// 'c' (only by C) or null. The C++/CLI macros count as __cplusplus.
const CPP_MACRO = '(?:__cplusplus|__cplusplus_cli|_M_CEE|_M_CEE_PURE|_MANAGED)';
const CPP_MACRO_RE = new RegExp(`\\b${CPP_MACRO}\\b`);
const NOT_CPP_RE = new RegExp(`!\\s*(?:defined\\s*\\(?\\s*)?${CPP_MACRO}\\b`);
const ONLY_CPP_RE = new RegExp(`^${CPP_MACRO}$`);
function condMode(kind, expr) {
  const e = String(expr || '').trim();
  if (kind === 'ifdef') return ONLY_CPP_RE.test(e) ? 'cpp' : null;
  if (kind === 'ifndef') return ONLY_CPP_RE.test(e) ? 'c' : null;
  if (!CPP_MACRO_RE.test(e) || /\|\|/.test(e)) return null;
  if (NOT_CPP_RE.test(e)) return /&&/.test(e) ? null : 'c';
  return 'cpp';
}

// Scan one file: its includes (with the language mode they are seen in) and
// whether it has C++-only syntax outside the `#ifdef __cplusplus` groups
// (syntax false: the includes only).
function scanFile(text, syntax = true) {
  const { lines, raw } = logicalLines(text);
  const stack = []; // { mode }
  const includes = [];
  let code = '';
  let cppSyntax = raw;
  const region = () => {
    let r = null;
    for (const f of stack) {
      if (f.mode === 'cpp') return 'cpp';
      if (f.mode === 'c') r = 'c';
    }
    return r;
  };
  for (const line of lines) {
    const m = /^\s*#\s*([A-Za-z_]+)\s*(.*)$/.exec(line);
    if (m) {
      const kind = m[1];
      const rest = m[2];
      if (kind === 'if' || kind === 'ifdef' || kind === 'ifndef') stack.push({ mode: condMode(kind, rest) });
      else if (kind === 'elif' || kind === 'elifdef' || kind === 'elifndef') {
        if (stack.length) stack[stack.length - 1].mode = condMode(kind === 'elif' ? 'if' : kind.slice(2), rest);
      } else if (kind === 'else') {
        const f = stack[stack.length - 1];
        if (f) f.mode = f.mode === 'cpp' ? 'c' : f.mode === 'c' ? 'cpp' : null;
      } else if (kind === 'endif') stack.pop();
      else if (kind === 'include' || kind === 'include_next' || kind === 'import') {
        const q = /^"([^"]+)"|^<([^>]+)>/.exec(rest.trim());
        if (q) {
          const where = region();
          const name = q[1] || q[2];
          includes.push({ name, angled: !q[1], mode: where });
          if (!q[1] && where !== 'c' && where !== 'cpp' && CPP_STD.has(name)) cppSyntax = true;
        }
      }
      continue;
    }
    if (!syntax || region() === 'cpp') continue;
    code += line + '\n';
  }
  let reason = cppSyntax ? (raw ? 'raw string literal' : 'C++ standard header') : null;
  if (!cppSyntax && syntax) {
    const c = code.replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\bextern\s*""/g, ' ');
    for (const re of CPP_SYNTAX) {
      const m = re.exec(c);
      if (m) { cppSyntax = true; reason = m[0].trim(); break; }
    }
  }
  return { includes, cppSyntax, reason };
}

let builtinNames = null;
function builtins() {
  if (!builtinNames) builtinNames = new Set([...Object.keys(builtinHeaders('c', {})), ...Object.keys(builtinHeaders('cpp', {}))]);
  return builtinNames;
}

function resolver(paths, includeDirs) {
  const has = new Set(paths);
  const byBase = new Map();
  for (const p of paths) {
    const b = posix.basename(p);
    const list = byBase.get(b);
    if (list) list.push(p); else byBase.set(b, [p]);
  }
  const dirs = (includeDirs || []).map(normPath);
  return (name, angled, fromFile) => {
    const n = normPath(name);
    if (!angled && fromFile) {
      const dir = posix.dirname(fromFile);
      const c = normPath(dir === '.' ? n : dir + '/' + n);
      if (has.has(c)) return c;
    }
    for (const d of dirs) {
      const c = normPath(d === '.' || d === '' ? n : d + '/' + n);
      if (has.has(c)) return c;
    }
    if (has.has(n)) return n;
    if (angled && builtins().has(name)) return null;
    const suffix = '/' + n;
    let best = null;
    for (const p of byBase.get(posix.basename(n)) || []) {
      if (p.endsWith(suffix) && (best === null || p.length < best.length)) best = p;
    }
    return best;
  };
}

// files: [{ path, text, lang? }]; opts: { includeDirs }.
// -> Map(header path -> { lang: 'c'|'cpp'|'both', cppSyntax, from: Set<'c'|'cpp'> })
// for every header of the list ('.hpp' and the other C++ header extensions
// are always 'cpp'; a '.h' given with lang 'cpp' stays 'cpp').
function headerInfo(files, opts = {}) {
  const list = (files || []).filter((f) => f && f.path != null && (f.lang === 'c' || f.lang === 'cpp' || f.lang == null));
  const paths = list.map((f) => normPath(f.path));
  const resolve = resolver(paths, opts.includeDirs);
  const scans = new Map();
  const info = new Map();
  list.forEach((f, k) => {
    const p = paths[k];
    const s = scanFile(f.text, isHeader(p) && langByName(p, f.lang) === 'c');
    s.lang = langByName(p, f.lang);
    s.edges = [];
    for (const inc of s.includes) {
      const to = resolve(inc.name, inc.angled, p);
      if (to && to !== p) s.edges.push({ to, mode: inc.mode });
    }
    scans.set(p, s);
    if (isHeader(p)) info.set(p, { lang: null, cppSyntax: s.lang === 'cpp' || s.cppSyntax, from: new Set() });
  });
  // Walk the include graph from the translation units: a header gets the
  // language of every unit that reaches it.
  const reach = (start, mode, mark) => {
    const stack = [[start, mode]];
    const seen = new Set();
    while (stack.length) {
      const [p, m] = stack.pop();
      const s = scans.get(p);
      if (!s) continue;
      for (const e of s.edges) {
        if (e.mode && e.mode !== m) continue;
        const key = e.to + '\u0000' + m;
        if (seen.has(key)) continue;
        seen.add(key);
        const h = info.get(e.to);
        if (h) { h.from.add(m); if (mark) mark.add(e.to); }
        stack.push([e.to, m]);
      }
    }
  };
  for (const [p, s] of scans) if (!isHeader(p)) reach(p, s.lang, null);
  // Headers no unit includes are parsed on their own: they start in the
  // language of their content, and pass it to the headers they include.
  const alone = [...info.keys()].filter((p) => !info.get(p).from.size);
  if (alone.length) {
    const aloneSet = new Set(alone);
    const includedByAlone = new Set();
    for (const p of alone) for (const e of scans.get(p).edges) if (aloneSet.has(e.to)) includedByAlone.add(e.to);
    const own = (p) => (info.get(p).cppSyntax ? 'cpp' : 'c');
    const reached = new Set();
    for (const p of alone) if (!includedByAlone.has(p)) reach(p, own(p), reached);
    for (const p of alone) if (!reached.has(p) && includedByAlone.has(p) && !info.get(p).from.size) reach(p, own(p), reached);
  }
  for (const h of info.values()) h.lang = decide(h);
  return info;
}

function decide(h) {
  if (h.cppSyntax) return 'cpp';
  if (h.from.has('c') && h.from.has('cpp')) return 'both';
  if (h.from.has('cpp')) return 'cpp';
  return 'c';
}

// -> Map(header path -> 'c' | 'cpp' | 'both')
function headerLanguages(files, opts = {}) {
  const out = new Map();
  for (const [p, h] of headerInfo(files, opts)) out.set(p, h.lang);
  return out;
}

// Adds what the preprocessor really included (units: parsed units with
// .includes and .lang) to a headerInfo map, and decides again.
function refine(info, units) {
  if (!info) return info;
  let changed = false;
  for (const u of units || []) {
    for (const inc of u.includes || []) {
      const h = inc.resolved && info.get(inc.resolved);
      if (!h || h.from.has(u.lang)) continue;
      h.from.add(u.lang);
      changed = true;
    }
  }
  if (changed) for (const h of info.values()) h.lang = decide(h);
  return info;
}

module.exports = { headerInfo, headerLanguages, refine, scanFile, explain: (text) => { const s = scanFile(text); return { cpp: s.cppSyntax, reason: s.reason }; }, CPP_STD };
