'use strict';

// Vulnerability reachability: does the project code use a vulnerable
// dependency at all, and does it call the affected functions?
//
//   collectSources(root, options)            -> [{ path, text }]
//   prepareSources(files)                     -> SourceIndex (imports per file)
//   annotateReachability(vulns, ctx)          -> summary; adds fields to each vulnerability:
//     reachability: 'reachable' | 'imported' | 'not-imported' | 'unknown'
//     reachabilityEvidence: [{ file, line, text }]
//     reachabilityReason: short machine-readable reason
//     reachabilitySymbols: the affected symbols that were looked for
//
// The analysis is lexical (imports + identifier patterns, comments removed),
// not a call graph: 'reachable' means an affected symbol is referenced in a
// file of the project, 'imported' that only the package is.

const fs = require('fs');
const path = require('path');
const { normalizeName, tryJson, basename } = require('./util');
const DATA = require('./reachability-data');

const LANG_BY_EXT = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js',
  py: 'py', pyw: 'py',
  java: 'java', kt: 'java', kts: 'java', scala: 'java', groovy: 'java',
  go: 'go', cs: 'cs', fs: 'cs', vb: 'cs', php: 'php', rb: 'rb', rake: 'rb', rs: 'rs',
  c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c', hh: 'c', hxx: 'c', m: 'c', mm: 'c',
};

const ECO_LANG = {
  npm: 'js', PyPI: 'py', Maven: 'java', Go: 'go', NuGet: 'cs', Packagist: 'php', RubyGems: 'rb',
  'crates.io': 'rs', ConanCenter: 'c', vcpkg: 'c',
};

const SOURCE_SKIP = new Set([
  'node_modules', '.git', '.hg', '.svn', 'vendor', 'target', 'dist', 'build', 'out', '.venv', 'venv', 'env', '__pycache__',
  '.gradle', '.idea', '.vscode', 'bin', 'obj', 'Pods', '.dart_tool', '.next', '.nuxt', 'coverage', '.tox', 'bower_components',
  'jspm_packages', '.terraform', '.cargo', '.m2', 'site-packages',
]);

function langOf(file) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(file));
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'd' && /\.d\.ts$/i.test(file)) return null;
  return LANG_BY_EXT[ext] || null;
}

function isSourceFile(file) {
  return !!langOf(file) && !/\.min\.js$/i.test(file);
}

// Walk a folder for source files (bounded). Paths are root-relative with "/".
function collectSources(root, options = {}) {
  const out = [];
  if (!root) return out;
  const max = options.maxSourceFiles || 5000;
  const maxSize = options.maxSourceSize || 1024 * 1024;
  const skip = new Set([...SOURCE_SKIP, ...(options.skipDirs || [])]);
  const walk = (dir, rel, depth) => {
    if (depth > (options.maxDepth || 12) || out.length >= max) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (out.length >= max) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (skip.has(e.name) || e.name.startsWith('.')) continue;
        walk(path.join(dir, e.name), r, depth + 1);
      } else if (e.isFile() && isSourceFile(r)) {
        try {
          const abs = path.join(dir, e.name);
          if (fs.statSync(abs).size > maxSize) continue;
          out.push({ path: r, text: fs.readFileSync(abs, 'utf8') });
        } catch { /* unreadable */ }
      }
    }
  };
  walk(root, '', 0);
  return out;
}

// ------------------------------------------------------------- masking --

// Blank comments (keeping newlines and string contents) so that commented-out
// imports and calls do not count. Python triple-quoted strings are blanked too.
function maskComments(text, lang) {
  const s = String(text);
  const n = s.length;
  const hash = lang === 'py' || lang === 'rb' || lang === 'php';
  const slash = lang !== 'py' && lang !== 'rb';
  const backtick = lang === 'js' || lang === 'go';
  const parts = [];
  let i = 0;
  let start = 0;
  const blank = (from, to) => {
    parts.push(s.slice(start, from));
    parts.push(s.slice(from, to).replace(/[^\n]/g, ' '));
    start = to;
  };
  while (i < n) {
    const c = s[i];
    if (slash && c === '/' && s[i + 1] === '/') {
      let j = i;
      while (j < n && s[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (slash && c === '/' && s[i + 1] === '*') {
      const j = s.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      blank(i, end); i = end; continue;
    }
    if (hash && c === '#') {
      if (lang === 'rb' && (s[i + 1] === '{')) { i++; continue; }
      let j = i;
      while (j < n && s[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (lang === 'py' && (s.startsWith('"""', i) || s.startsWith("'''", i))) {
      const q = s.slice(i, i + 3);
      const j = s.indexOf(q, i + 3);
      const end = j < 0 ? n : j + 3;
      blank(i, end); i = end; continue;
    }
    if (c === '"' || c === "'" || (backtick && c === '`')) {
      let j = i + 1;
      while (j < n) {
        const d = s[j];
        if (d === '\\' && c !== '`') { j += 2; continue; }
        if (d === '\\' && lang === 'js') { j += 2; continue; }
        if (d === c) { j++; break; }
        if (d === '\n' && c !== '`') break;
        j++;
      }
      i = j; continue;
    }
    i++;
  }
  parts.push(s.slice(start));
  return parts.join('');
}

// ------------------------------------------------------------- imports --

function lineStarts(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) starts.push(k + 1);
  return starts;
}

function lineAtIndex(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function jsImports(m, at) {
  const out = [];
  const add = (module, idx, bindings, extra = {}) => out.push({ module, line: at(idx), bindings, ...extra });
  let r;
  const fromRe = /\b(import|export)\s+(type\s+)?([\w$*{}\s,]*?)\s*from\s*['"]([^'"\n]+)['"]/g;
  while ((r = fromRe.exec(m))) {
    if (r[2]) continue;
    const clause = r[3].trim();
    const bindings = [];
    if (r[1] === 'import') {
      const named = /\{([^}]*)\}/.exec(clause);
      const rest = clause.replace(/\{[^}]*\}/, '').split(',').map((x) => x.trim()).filter(Boolean);
      for (const x of rest) {
        const ns = /^\*\s+as\s+([\w$]+)$/.exec(x);
        if (ns) bindings.push({ local: ns[1], member: null });
        else if (/^[\w$]+$/.test(x)) bindings.push({ local: x, member: null });
      }
      if (named) {
        for (const part of named[1].split(',')) {
          const p = part.trim().replace(/^type\s+/, '');
          if (!p) continue;
          const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(p);
          if (mm) bindings.push(mm[1] === 'default' ? { local: mm[2] || mm[1], member: null } : { local: mm[2] || mm[1], member: mm[1] });
        }
      }
    }
    add(r[4], r.index, bindings, { endLine: at(r.index + r[0].length) });
  }
  const sideRe = /\bimport\s*['"]([^'"\n]+)['"]/g;
  while ((r = sideRe.exec(m))) add(r[1], r.index, []);
  const dynRe = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  while ((r = dynRe.exec(m))) add(r[1], r.index, []);
  const reqRe = /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  while ((r = reqRe.exec(m))) {
    const before = m.slice(Math.max(0, r.index - 200), r.index);
    const after = m.slice(r.index + r[0].length, r.index + r[0].length + 200);
    const bindings = [];
    const extra = {};
    const simple = /(?:const|let|var)\s+([\w$]+)\s*=\s*$/.exec(before) || /(?:^|[^\w$.])([\w$]+)\s*=\s*$/.exec(before);
    const destr = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*$/.exec(before);
    if (destr) {
      for (const part of destr[1].split(',')) {
        const mm = /^\s*([\w$]+)\s*(?::\s*([\w$]+))?\s*$/.exec(part);
        if (mm) bindings.push({ local: mm[2] || mm[1], member: mm[1] });
      }
    } else if (simple) bindings.push({ local: simple[1], member: null });
    const inline = /^((?:\s*\.\s*[\w$]+)*)\s*(\()?/.exec(after);
    if (inline && (inline[1] || inline[2])) {
      extra.inline = inline[1].split('.').map((x) => x.trim()).filter(Boolean);
      extra.inlineCall = !!inline[2];
    }
    add(r[1], r.index, bindings, extra);
  }
  return out;
}

function pyImports(m, at) {
  const out = [];
  let r;
  const imp = /^[ \t]*import[ \t]+([^\n;]+)/gm;
  while ((r = imp.exec(m))) {
    for (const part of r[1].split(',')) {
      const mm = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (!mm) continue;
      const mod = mm[1];
      // "import a.b" binds "a"; "import a.b as c" binds c to a.b.
      out.push({ module: mod, line: at(r.index), bindings: mm[2] ? [{ local: mm[2], path: mod }] : [{ local: mod.split('.')[0], path: mod.split('.')[0] }] });
    }
  }
  const from = /^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n;]+)/gm;
  while ((r = from.exec(m))) {
    const mod = r[1];
    if (mod.startsWith('.')) continue;
    const bindings = [];
    for (const part of r[2].replace(/[()\\]/g, ' ').split(',')) {
      const p = part.trim();
      if (!p) continue;
      if (p === '*') { bindings.push({ star: true, path: mod }); continue; }
      const mm = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(p);
      if (mm) bindings.push({ local: mm[2] || mm[1], path: `${mod}.${mm[1]}` });
    }
    out.push({ module: mod, line: at(r.index), endLine: at(r.index + r[0].length), bindings });
  }
  const dyn = /\b(?:importlib\.import_module|__import__)\s*\(\s*['"]([\w.]+)['"]/g;
  while ((r = dyn.exec(m))) out.push({ module: r[1], line: at(r.index), bindings: [] });
  return out;
}

function javaImports(m, at) {
  const out = [];
  let r;
  const re = /^[ \t]*import[ \t]+(static[ \t]+)?([\w.]+)(\.\*|\.\{[^}\n]*\}|\._)?[ \t]*;?/gm;
  while ((r = re.exec(m))) {
    const name = r[2];
    const last = name.split('.').pop();
    out.push({ module: name, line: at(r.index), bindings: r[3] ? [] : [{ local: last, member: null }], wildcard: !!r[3] });
  }
  return out;
}

function goImports(m, at) {
  const out = [];
  let r;
  const guess = (p) => {
    const segs = p.split('/');
    let last = segs.pop();
    if (/^v\d+$/.test(last) && segs.length) last = segs.pop();
    return last.replace(/^go-/, '').replace(/[-.]go$/, '').replace(/[^\w]/g, '');
  };
  const one = (spec, idx) => {
    const mm = /^\s*([\w.]+\s+)?"([^"\n]+)"/.exec(spec);
    if (!mm) return;
    const alias = mm[1] ? mm[1].trim() : null;
    if (alias === '_') { out.push({ module: mm[2], line: at(idx), bindings: [] }); return; }
    out.push({ module: mm[2], line: at(idx), bindings: [{ local: alias && alias !== '.' ? alias : guess(mm[2]), member: null, dot: alias === '.' }] });
  };
  const block = /\bimport\s*\(([^)]*)\)/g;
  while ((r = block.exec(m))) {
    const body = r[1];
    const base = r.index + r[0].indexOf('(') + 1;
    const lineRe = /[^\n]+/g;
    let l;
    while ((l = lineRe.exec(body))) one(l[0], base + l.index);
  }
  const single = /\bimport[ \t]+([\w.]+[ \t]+)?("[^"\n]+")/g;
  while ((r = single.exec(m))) one(`${r[1] || ''}${r[2]}`, r.index);
  return out;
}

function csImports(m, at, ext) {
  const out = [];
  let r;
  const re = ext === 'fs' ? /^[ \t]*open[ \t]+([\w.]+)/gm
    : ext === 'vb' ? /^[ \t]*Imports[ \t]+(?:(\w+)[ \t]*=[ \t]*)?([\w.]+)/gim
      : /^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:(\w+)[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm;
  while ((r = re.exec(m))) {
    const name = ext === 'fs' ? r[1] : r[2];
    const alias = ext === 'fs' ? null : r[1];
    out.push({ module: name, line: at(r.index), bindings: alias ? [{ local: alias, member: null }] : [] });
  }
  return out;
}

function phpImports(m, at) {
  const out = [];
  let r;
  const re = /^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?\\?([\w\\]+)(?:\\\{([^}]*)\})?(?:[ \t]+as[ \t]+(\w+))?[ \t]*[;,]/gm;
  while ((r = re.exec(m))) {
    const base = r[1].replace(/\\$/, '');
    if (r[2]) {
      for (const part of r[2].split(',')) {
        const mm = /^\s*([\w\\]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (mm) out.push({ module: `${base}\\${mm[1]}`, line: at(r.index), bindings: [{ local: mm[2] || mm[1].split('\\').pop(), member: null }] });
      }
    } else out.push({ module: base, line: at(r.index), bindings: [{ local: r[3] || base.split('\\').pop(), member: null }] });
  }
  const qual = /(?:new|extends|implements|instanceof)?\s\\([A-Z]\w*(?:\\\w+)+)/g;
  while ((r = qual.exec(m))) out.push({ module: r[1], line: at(r.index + r[0].indexOf('\\')), bindings: [], qualified: true });
  return out;
}

function rbImports(m, at) {
  const out = [];
  let r;
  const re = /^[ \t]*(?:require|gem|load)[ \t(]+['"]([^'"\n]+)['"]/gm;
  while ((r = re.exec(m))) out.push({ module: r[1], line: at(r.index), bindings: [] });
  const bundler = /\bBundler\.require\b/g;
  while ((r = bundler.exec(m))) out.push({ module: '*bundler*', line: at(r.index), bindings: [] });
  return out;
}

function rsImports(m, at) {
  const out = [];
  let r;
  const re = /^[ \t]*(?:pub(?:\([\w ]+\))?[ \t]+)?(?:use|extern[ \t]+crate)[ \t]+(?:::)?(\w+)([^;]*);/gm;
  while ((r = re.exec(m))) out.push({ module: r[1], line: at(r.index), bindings: [] });
  const qual = /(?:^|[^\w:])(\w+)::\w/g;
  while ((r = qual.exec(m))) {
    if (/^(std|core|alloc|crate|self|super|Self)$/.test(r[1])) continue;
    out.push({ module: r[1], line: at(r.index), bindings: [], qualified: true });
  }
  return out;
}

function cImports(m, at) {
  const out = [];
  let r;
  const re = /^[ \t]*#[ \t]*(?:include|import)[ \t]*[<"]([^>"\n]+)[>"]/gm;
  while ((r = re.exec(m))) out.push({ module: r[1], line: at(r.index), bindings: [] });
  return out;
}

// The C masker blanks "#include" lines as comments for hash languages only;
// for C the preprocessor lines survive because "#" is not a comment there.
function extractImports(masked, lang, ext) {
  const starts = lineStarts(masked);
  const at = (idx) => lineAtIndex(starts, idx);
  switch (lang) {
    case 'js': return jsImports(masked, at);
    case 'py': return pyImports(masked, at);
    case 'java': return javaImports(masked, at);
    case 'go': return goImports(masked, at);
    case 'cs': return csImports(masked, at, ext);
    case 'php': return phpImports(masked, at);
    case 'rb': return rbImports(masked, at);
    case 'rs': return rsImports(masked, at);
    case 'c': return cImports(masked, at);
    default: return [];
  }
}

// SourceIndex: { files: [...], byLang: Map<lang, file[]> }
function prepareSources(files) {
  const list = [];
  const byLang = new Map();
  const seen = new Set();
  for (const f of files || []) {
    if (!f || !f.path || f.text == null || seen.has(f.path)) continue;
    const lang = langOf(f.path);
    if (!lang) continue;
    seen.add(f.path);
    const text = String(f.text);
    const ext = (/\.([A-Za-z0-9]+)$/.exec(f.path) || [])[1].toLowerCase();
    let masked;
    try { masked = maskComments(text, lang); } catch { masked = text; }
    const entry = { path: f.path, lang, ext, text, masked, imports: [], importLines: new Set(), rawLines: null, maskedLines: null };
    try { entry.imports = extractImports(masked, lang, ext); } catch { entry.imports = []; }
    for (const im of entry.imports) {
      if (im.qualified) continue;
      for (let k = im.line; k <= Math.max(im.line, im.endLine || im.line); k++) entry.importLines.add(k);
    }
    list.push(entry);
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang).push(entry);
  }
  return { files: list, byLang };
}

function rawLine(entry, line) {
  if (!entry.rawLines) entry.rawLines = entry.text.split(/\r?\n/);
  return String(entry.rawLines[line - 1] || '').trim().slice(0, 200);
}

function maskedLinesOf(entry) {
  if (!entry.maskedLines) entry.maskedLines = entry.masked.split(/\r?\n/);
  return entry.maskedLines;
}

// --------------------------------------------------------- package names --

function pyModules(dep, ctx) {
  const n = normalizeName('PyPI', dep.name);
  const out = new Set();
  const user = (ctx.options.pythonModules || {})[dep.name] || (ctx.options.pythonModules || {})[n];
  for (const m of [].concat(user || [])) out.add(m);
  for (const m of (ctx.pythonTopLevel && ctx.pythonTopLevel.get(n)) || []) out.add(m);
  for (const m of DATA.PY_MODULES[n] || []) out.add(m);
  if (!out.size) {
    const base = n.replace(/-/g, '_');
    out.add(base);
    if (/^python_/.test(base)) out.add(base.slice(7));
    if (/^py_/.test(base)) out.add(base.slice(3));
    if (/_python$/.test(base)) out.add(base.slice(0, -7));
  }
  return [...out];
}

function javaPrefixes(dep) {
  const [group, artifact] = String(dep.name).split(':');
  const known = DATA.JAVA_PACKAGES[`${group}:${artifact}`];
  if (known) return known;
  if (!artifact) return [group];
  const a = artifact.replace(/^(commons|spring|jakarta)-/, '').replace(/-(core|api|java|jdk\d+\w*)$/, '');
  return [...new Set([`${group}.${artifact.replace(/-/g, '.')}`, `${group}.${a.replace(/-/g, '.')}`, `${group}.${a.split('-').pop()}`, group])];
}

function phpNamespaces(dep, ctx) {
  const out = new Set();
  const lockText = dep.lockFile && ctx.readFile ? ctx.readFile(dep.lockFile) : null;
  const lock = lockText ? (ctx.lockCache.get(dep.lockFile) || (() => { const j = tryJson(lockText); ctx.lockCache.set(dep.lockFile, j); return j; })()) : null;
  if (lock) {
    for (const p of [...(lock.packages || []), ...(lock['packages-dev'] || [])]) {
      if (!p || String(p.name).toLowerCase() !== String(dep.name).toLowerCase() || !p.autoload) continue;
      for (const kind of ['psr-4', 'psr-0']) for (const ns of Object.keys(p.autoload[kind] || {})) if (ns.replace(/\\+$/, '')) out.add(ns.replace(/\\+$/, ''));
    }
  }
  for (const ns of DATA.PHP_NAMESPACES[String(dep.name).toLowerCase()] || []) out.add(ns);
  if (!out.size) out.add(String(dep.name).split('/')[0]);
  return [...out].map((x) => x.toLowerCase());
}

// Returns (module) -> null | { sub: string[] } for one dependency.
function moduleMatcher(dep, ctx) {
  const eco = dep.ecosystem === 'binary' ? dep.binaryEcosystem : dep.ecosystem;
  const name = String(dep.name);
  switch (eco) {
    case 'npm':
      return (mod) => (mod === name ? { sub: [] } : mod.startsWith(`${name}/`) ? { sub: mod.slice(name.length + 1).split('/') } : null);
    case 'PyPI': {
      const tops = pyModules(dep, ctx);
      return (mod) => {
        for (const top of tops) {
          if (mod === top) return { sub: [], top };
          if (mod.startsWith(`${top}.`)) return { sub: mod.slice(top.length + 1).split('.'), top };
        }
        return null;
      };
    }
    case 'Maven': {
      const prefixes = javaPrefixes(dep);
      return (mod) => (prefixes.some((p) => mod === p || mod.startsWith(`${p}.`)) ? { sub: [] } : null);
    }
    case 'Go':
      return (mod) => (mod === name ? { sub: [] } : mod.startsWith(`${name}/`) ? { sub: mod.slice(name.length + 1).split('/') } : null);
    case 'NuGet': {
      const ns = DATA.CS_NAMESPACES[name.toLowerCase()] || [name];
      return (mod) => (ns.some((p) => mod === p || mod.startsWith(`${p}.`)) ? { sub: [] } : null);
    }
    case 'Packagist': {
      const ns = phpNamespaces(dep, ctx);
      return (mod) => { const m = mod.toLowerCase(); return ns.some((p) => m === p || m.startsWith(`${p}\\`)) ? { sub: [] } : null; };
    }
    case 'RubyGems': {
      const req = DATA.RUBY_REQUIRES[name.toLowerCase()] || [name, name.replace(/-/g, '/'), name.replace(/-/g, '_')];
      return (mod) => (mod === '*bundler*' && dep.direct ? { sub: [], bundler: true } : req.some((p) => mod === p || mod.startsWith(`${p}/`)) ? { sub: [] } : null);
    }
    case 'crates.io': {
      const crate = name.replace(/-/g, '_');
      return (mod) => (mod === crate ? { sub: [] } : null);
    }
    case 'ConanCenter': case 'vcpkg': {
      const heads = DATA.C_HEADERS[name.toLowerCase()] || [`${name}.h`, `${name}/`];
      return (mod) => (heads.some((h) => (h.endsWith('/') ? mod.startsWith(h) : mod === h || mod.endsWith(`/${h}`))) ? { sub: [] } : null);
    }
    default: return null;
  }
}

function qualifiedPrefixes(dep) {
  const eco = dep.ecosystem === 'binary' ? dep.binaryEcosystem : dep.ecosystem;
  if (eco === 'Maven') return javaPrefixes(dep).filter((p) => p.split('.').length >= 3);
  if (eco === 'NuGet') return (DATA.CS_NAMESPACES[String(dep.name).toLowerCase()] || [String(dep.name)]).filter((p) => p.includes('.'));
  return [];
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Where the dependency is imported: [{ entry, imp, match }]
function findImports(dep, ctx) {
  const lang = ECO_LANG[dep.ecosystem === 'binary' ? dep.binaryEcosystem : dep.ecosystem];
  const files = (lang && ctx.sources.byLang.get(lang)) || [];
  const match = moduleMatcher(dep, ctx);
  const hits = [];
  if (!match) return { lang, files, hits };
  for (const entry of files) {
    for (const imp of entry.imports) {
      const mm = match(imp.module);
      if (mm) hits.push({ entry, imp, match: mm });
    }
  }
  // Fully qualified use without an import (Java / C#).
  const quals = qualifiedPrefixes(dep);
  if (!hits.length && quals.length) {
    const re = new RegExp(`(?<![\\w.])(?:${quals.map(escapeRe).join('|')})\\.[A-Za-z_]`);
    for (const entry of files) {
      const lines = maskedLinesOf(entry);
      for (let k = 0; k < lines.length; k++) {
        if (entry.importLines.has(k + 1) || /^\s*(package|namespace)\b/.test(lines[k])) continue;
        if (re.test(lines[k])) { hits.push({ entry, imp: { module: '', line: k + 1, bindings: [], qualified: true }, match: { sub: [] } }); break; }
      }
    }
  }
  return { lang, files, hits };
}

// --------------------------------------------------------------- symbols --

function symbolGroups(vuln, dep, record) {
  const groups = [];
  const eco = dep.ecosystem === 'binary' ? dep.binaryEcosystem : dep.ecosystem;
  const n = normalizeName(eco, dep.name);
  const take = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const imp of Array.isArray(obj.imports) ? obj.imports : []) {
      if (imp && Array.isArray(imp.symbols) && imp.symbols.length) groups.push({ path: imp.path || null, symbols: imp.symbols.map(String) });
      else if (imp && imp.path) groups.push({ path: imp.path, symbols: [] });
    }
    const lists = [obj.symbols, obj.affected_functions, obj.functions, obj.vulnerable_functions, obj.affects && obj.affects.functions];
    for (const l of lists) if (Array.isArray(l) && l.length) groups.push({ path: null, symbols: l.map(String) });
  };
  if (record) {
    for (const aff of record.affected || []) {
      if (!aff || !aff.package) continue;
      if (normalizeName(eco, aff.package.name) !== n) continue;
      take(aff.ecosystem_specific);
      take(aff.database_specific);
    }
    take(record.database_specific && record.database_specific.reachability);
  }
  let source = groups.length ? 'advisory' : null;
  if (!groups.length) {
    const ids = new Set([vuln.id, ...(vuln.aliases || [])]);
    for (const entry of DATA.ADVISORY_SYMBOLS) {
      if (!entry.ids.some((x) => ids.has(x))) continue;
      if (entry.groups) groups.push(...entry.groups.map((g) => ({ path: g.path, symbols: [...g.symbols] })));
      if (entry.symbols) groups.push({ path: null, symbols: [...entry.symbols] });
      source = 'builtin';
      break;
    }
  }
  return { groups: groups.filter((g) => g.symbols.length || g.path), source };
}

// Split a symbol into path segments, dropping the package / crate / module root.
function symbolSegments(sym, dep, roots) {
  let s = String(sym).trim().replace(/\(\)$/, '');
  const segs = s.split(/::|\.|#|->|\\/).filter(Boolean);
  const name = String(dep.name);
  const drop = new Set([name, name.replace(/-/g, '_'), ...(roots || [])]);
  if (segs.length > 1 && drop.has(segs[0])) segs.shift();
  else if (roots && roots.length) {
    for (const r of roots) {
      const rs = r.split('.');
      if (rs.length > 1 && segs.slice(0, rs.length).join('.') === r) { segs.splice(0, rs.length); break; }
    }
  }
  return segs;
}

const isType = (s) => /^[A-Z]/.test(s);

function findLine(entry, re, skipImports = true) {
  const lines = maskedLinesOf(entry);
  for (let k = 0; k < lines.length; k++) {
    if (skipImports && entry.importLines.has(k + 1)) continue;
    re.lastIndex = 0;
    if (re.test(lines[k])) return k + 1;
  }
  return 0;
}

// Binding-based search (JS / Python / Go): a local name that refers to a
// module path T reaches symbol G when T is a prefix of G.
// Paths are absolute segment lists: JS [package, ...subpath, member],
// Python the dotted module path split on ".".
function absoluteSymbol(hit, segs, lang) {
  if (lang === 'py') return [...String(hit.match.top || '').split('.').filter(Boolean), ...segs];
  return ['', ...segs];
}

function bindingPath(hit, b, lang) {
  if (lang === 'py') return String(b.path || '').split('.').filter(Boolean);
  return ['', ...(hit.match.sub || []), ...(b.member ? [b.member] : [])];
}

const isPrefix = (p, a) => p.length <= a.length && p.every((x, k) => a[k] === x);
const chain = (rest) => rest.map(escapeRe).join('\\s*\\.\\s*');

function bindingPatterns(hit, segs, lang) {
  const out = [];
  const abs = absoluteSymbol(hit, segs, lang);
  for (const b of hit.imp.bindings || []) {
    const p = bindingPath(hit, b, lang);
    if (b.star) {
      if (p.length < abs.length && isPrefix(p, abs)) out.push(`(?<![\\w$.])${chain(abs.slice(p.length))}\\b`);
      continue;
    }
    if (!b.local || !isPrefix(p, abs)) continue;
    const rest = abs.slice(p.length);
    const head = `(?<![\\w$.])${escapeRe(b.local)}`;
    out.push(rest.length ? `${head}\\s*\\.\\s*${chain(rest)}\\b` : `${head}\\b`);
  }
  return out;
}

// Search for the affected symbols. Returns { found: [{file,line,text}], looked: [] }.
function searchSymbols(groups, dep, imports, ctx) {
  const lang = imports.lang;
  const found = [];
  const looked = [];
  const roots = lang === 'py' ? pyModules(dep, ctx) : null;
  const addFound = (entry, line) => {
    if (!line || found.some((f) => f.file === entry.path && f.line === line)) return;
    found.push({ file: entry.path, line, text: rawLine(entry, line) });
  };
  for (const g of groups) {
    let hits = imports.hits;
    if (g.path) hits = hits.filter((h) => h.imp.module === g.path);
    if (!hits.length) continue;
    for (const sym of g.symbols) {
      looked.push(g.path ? `${g.path}:${sym}` : sym);
      const importingFiles = [...new Set(hits.map((h) => h.entry))];
      if (sym.startsWith('re:')) {
        let re;
        try { re = new RegExp(sym.slice(3)); } catch { continue; }
        for (const e of imports.files) addFound(e, findLine(e, re));
        continue;
      }
      if (sym.startsWith('.')) {
        const re = new RegExp(`(?:\\.|->|::)\\s*${escapeRe(sym.slice(1))}\\s*\\(`);
        for (const e of imports.files) addFound(e, findLine(e, re));
        continue;
      }
      if (sym.startsWith('@')) {
        const re = new RegExp(`(?:@|\\[)${escapeRe(sym.slice(1))}\\b`);
        for (const e of imports.files) addFound(e, findLine(e, re));
        continue;
      }
      const segs = sym === 'default' ? [] : symbolSegments(sym, dep, roots);
      if (lang === 'js' || lang === 'py') {
        for (const h of hits) {
          if (lang === 'js' && h.imp.inline) {
            // require('pkg').member(...) or require('pkg')(...)
            const p = [...(h.match.sub || []), ...h.imp.inline];
            if (segs.length ? isPrefix(segs, p) : (p.length === 0 && h.imp.inlineCall)) addFound(h.entry, h.imp.line);
          }
          for (const p of bindingPatterns(h, segs, lang)) {
            const re = new RegExp(segs.length === 0 ? `${p}\\s*\\(` : p);
            addFound(h.entry, findLine(h.entry, re));
          }
        }
        continue;
      }
      if (lang === 'go') {
        const last = segs[segs.length - 1];
        if (!last) continue;
        for (const h of hits) {
          if (segs.length >= 2) addFound(h.entry, findLine(h.entry, new RegExp(`\\.\\s*${escapeRe(last)}\\s*\\(`)));
          else {
            for (const b of h.imp.bindings) {
              const re = b.dot ? new RegExp(`(?<![\\w.])${escapeRe(last)}\\b`) : new RegExp(`(?<![\\w.])${escapeRe(b.local)}\\.${escapeRe(last)}\\b`);
              addFound(h.entry, findLine(h.entry, re));
            }
          }
        }
        continue;
      }
      // Object-oriented and C-like languages: Type.method, Type, method.
      if (!segs.length) continue;
      const last = segs[segs.length - 1];
      const owner = segs.length >= 2 ? segs[segs.length - 2] : null;
      const callNeeded = !isType(last) && lang !== 'rb';
      const tail = callNeeded ? '\\s*\\(' : '\\b';
      const res = [];
      if (owner) {
        res.push(new RegExp(`\\b${escapeRe(owner)}\\s*(?:\\.|::|->)\\s*${escapeRe(last)}${tail}`));
        res.push(new RegExp(`(?:\\.|->|::)\\s*${escapeRe(last)}${tail}`));
        if (isType(last)) res.push(new RegExp(`(?<![\\w.:])${escapeRe(last)}\\b`));
      } else if (isType(last)) res.push(new RegExp(`(?<![\\w])${escapeRe(last)}\\b`));
      else res.push(new RegExp(`(?<![\\w$])${escapeRe(last)}\\s*\\(`), new RegExp(`(?:\\.|->|::)\\s*${escapeRe(last)}${tail}`));
      const ordered = [...importingFiles, ...imports.files.filter((e) => !importingFiles.includes(e))];
      for (const e of ordered) {
        for (const re of res) {
          const line = findLine(e, re);
          if (line) { addFound(e, line); break; }
        }
      }
    }
  }
  return { found, looked };
}

// --------------------------------------------------------------- public --

const LEVEL_RANK = { reachable: 3, imported: 2, unknown: 1, 'not-imported': 0 };

function importEvidence(hits, max = 5) {
  const out = [];
  for (const h of hits) {
    if (out.some((e) => e.file === h.entry.path && e.line === h.imp.line)) continue;
    out.push({ file: h.entry.path, line: h.imp.line, text: rawLine(h.entry, h.imp.line) });
    if (out.length >= max) break;
  }
  return out;
}

function dependencyUsage(dep, ctx) {
  if (ctx.usage.has(dep.id)) return ctx.usage.get(dep.id);
  const eco = dep.ecosystem === 'binary' ? dep.binaryEcosystem : dep.ecosystem;
  let res;
  if (!ECO_LANG[eco]) res = { status: 'unknown', reason: 'unsupported-ecosystem', imports: { lang: null, files: [], hits: [] } };
  else {
    const imports = findImports(dep, ctx);
    if (!imports.files.length) res = { status: 'unknown', reason: 'no-source', imports };
    else if (imports.hits.length) res = { status: 'imported', reason: imports.hits.some((h) => h.match.bundler) ? 'bundler-require' : 'imported', imports };
    else res = { status: 'not-imported', reason: 'not-imported', imports };
  }
  ctx.usage.set(dep.id, res);
  return res;
}

function createContext({ sources, byId, db, readFile, options, pythonTopLevel }) {
  return {
    sources: sources && sources.byLang ? sources : prepareSources(sources || []),
    byId: byId || new Map(), db: db || null, readFile: readFile || null, options: options || {},
    pythonTopLevel: pythonTopLevel || new Map(), usage: new Map(), lockCache: new Map(),
  };
}

// Decide reachability for one vulnerability (object from matchDependencies).
function reachabilityFor(vuln, ctx) {
  const dep = ctx.byId.get(vuln.dependency);
  if (!dep) return { reachability: 'unknown', reason: 'no-dependency', evidence: [], symbols: [] };
  const record = ctx.db && typeof ctx.db.get === 'function' ? ctx.db.get(vuln.id) : null;
  const usage = dependencyUsage(dep, ctx);
  const { groups, source } = symbolGroups(vuln, dep, record);
  const symbols = groups.flatMap((g) => g.symbols.map((s) => (g.path ? `${g.path}:${s}` : s)));
  if (usage.status === 'unknown') return { reachability: 'unknown', reason: usage.reason, evidence: [], symbols, symbolSource: source };
  if (usage.status === 'not-imported') {
    if (!dep.direct) {
      const anc = dep.directAncestor && ctx.byId.get(dep.directAncestor);
      if (anc && anc !== dep) {
        const au = dependencyUsage(anc, ctx);
        if (au.status === 'imported') {
          return { reachability: 'unknown', reason: 'transitive-ancestor-imported', evidence: importEvidence(au.imports.hits, 3), symbols, symbolSource: source, via: anc.name };
        }
        if (au.status === 'unknown') return { reachability: 'unknown', reason: au.reason, evidence: [], symbols, symbolSource: source };
      }
    }
    return { reachability: 'not-imported', reason: 'not-imported', evidence: [], symbols, symbolSource: source };
  }
  const evidence = importEvidence(usage.imports.hits);
  if (!groups.length) return { reachability: 'imported', reason: 'no-symbol-data', evidence, symbols, symbolSource: source };
  const pathGroups = groups.filter((g) => g.path);
  if (pathGroups.length && !groups.some((g) => !g.path) && !usage.imports.hits.some((h) => pathGroups.some((g) => g.path === h.imp.module))) {
    return { reachability: 'imported', reason: 'affected-package-not-imported', evidence, symbols, symbolSource: source };
  }
  const { found } = searchSymbols(groups, dep, usage.imports, ctx);
  if (found.length) {
    const ev = [...evidence.slice(0, 2), ...found.slice(0, 8)];
    return { reachability: 'reachable', reason: 'symbol-referenced', evidence: ev, symbols, symbolSource: source };
  }
  return { reachability: 'imported', reason: 'symbols-not-referenced', evidence, symbols, symbolSource: source };
}

// Annotate every vulnerability in place; returns { reachable, imported, notImported, unknown }.
function annotateReachability(vulns, ctxIn) {
  const ctx = ctxIn && ctxIn.usage ? ctxIn : createContext(ctxIn || {});
  const summary = { reachable: 0, imported: 0, notImported: 0, unknown: 0 };
  for (const v of vulns || []) {
    let r;
    try { r = reachabilityFor(v, ctx); } catch (err) { r = { reachability: 'unknown', reason: `error: ${err.message}`, evidence: [], symbols: [] }; }
    v.reachability = r.reachability;
    v.reachabilityReason = r.reason;
    v.reachabilityEvidence = r.evidence;
    v.reachabilitySymbols = r.symbols;
    if (r.via) v.reachabilityVia = r.via;
    if (r.reachability === 'reachable') summary.reachable++;
    else if (r.reachability === 'imported') summary.imported++;
    else if (r.reachability === 'not-imported') summary.notImported++;
    else summary.unknown++;
  }
  return summary;
}

// top_level.txt of installed Python distributions (virtualenvs under root).
function pythonTopLevelFromRoot(root) {
  const out = new Map();
  if (!root) return out;
  const candidates = [];
  for (const venv of ['.venv', 'venv', 'env', '.env']) {
    const base = path.join(root, venv);
    candidates.push(path.join(base, 'Lib', 'site-packages'));
    let libs = [];
    try { libs = fs.readdirSync(path.join(base, 'lib')); } catch { libs = []; }
    for (const l of libs) if (/^python\d/.test(l)) candidates.push(path.join(base, 'lib', l, 'site-packages'));
  }
  for (const dir of candidates) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      const m = /^(.+?)-[^-]+\.(dist-info|egg-info)$/.exec(n);
      if (!m) continue;
      try {
        const top = fs.readFileSync(path.join(dir, n, 'top_level.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (top.length) out.set(normalizeName('PyPI', m[1]), top);
      } catch { /* no top_level.txt */ }
    }
  }
  return out;
}

module.exports = {
  LANG_BY_EXT, ECO_LANG, LEVEL_RANK, langOf, isSourceFile, collectSources, maskComments, extractImports, prepareSources,
  createContext, reachabilityFor, annotateReachability, symbolGroups, pythonTopLevelFromRoot, basename,
};
