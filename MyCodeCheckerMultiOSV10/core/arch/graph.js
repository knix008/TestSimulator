'use strict';

// Module dependency graph from source text, for every language with imports.
// Nodes are the units architecture rules talk about:
//   js/ts, py, rb, php without namespace  -> the file
//   java/kt                               -> the package
//   cs                                    -> the namespace
//   php with namespace                    -> the namespace
//   go                                    -> the package directory
//   c/cpp                                 -> the module: path without extension (a.c + a.h)
// Only dependencies that resolve to project files become edges; external
// packages and system headers are ignored. Parsing is line/regex based and
// never throws.

const posix = require('path').posix;

const FAMILY = {
  js: 'js', ts: 'js', py: 'py', java: 'jvm', kt: 'jvm', cs: 'cs', go: 'go', php: 'php', rb: 'rb', c: 'c', cpp: 'c',
};
const COMMENT_STYLE = { js: 'slash', jvm: 'slash', cs: 'slash', go: 'slash', c: 'slash', php: 'php', py: 'py', rb: 'hash' };

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.d.ts'];

function norm(p) {
  let s = String(p || '').replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  return posix.normalize(s || '.');
}

function dirOf(p) {
  const d = posix.dirname(p);
  return d === '.' ? '' : d;
}

function joinRel(dir, spec) {
  return norm(dir ? posix.join(dir, spec) : spec);
}

function stripExt(p) {
  const ext = posix.extname(p);
  return ext ? p.slice(0, -ext.length) : p;
}

// Replace comments (and, for 'py', string contents) by spaces, keeping
// newlines so offsets and line numbers stay valid.
function stripComments(text, style) {
  const s = String(text || '');
  const out = s.split('');
  const blank = (a, b) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  const slash = style === 'slash' || style === 'php';
  const hash = style === 'hash' || style === 'py' || style === 'php';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (slash && c === '/' && d === '/') {
      const e = s.indexOf('\n', i); const end = e < 0 ? n : e;
      blank(i, end); i = end; continue;
    }
    if (slash && c === '/' && d === '*') {
      const e = s.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2;
      blank(i, end); i = end; continue;
    }
    if (hash && c === '#') {
      if (style === 'php' && d === '[') { i++; continue; } // PHP 8 attribute
      const e = s.indexOf('\n', i); const end = e < 0 ? n : e;
      blank(i, end); i = end; continue;
    }
    if (c === '"' || c === "'" || (c === '`' && style !== 'py')) {
      if (style === 'py' && s.startsWith(c.repeat(3), i)) {
        const e = s.indexOf(c.repeat(3), i + 3); const end = e < 0 ? n : e + 3;
        blank(i, end); i = end; continue;
      }
      let j = i + 1;
      while (j < n && s[j] !== c) {
        if (s[j] === '\\') j++;
        else if (s[j] === '\n' && c !== '`') break;
        j++;
      }
      if (style === 'py') blank(i + 1, j);
      i = j + 1; continue;
    }
    i++;
  }
  return out.join('');
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0; let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

function matches(re, text, fn) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    fn(m);
    if (m[0].length === 0) re.lastIndex++;
  }
}

// ---------------------------------------------------------------- extraction

const RE = {
  jsFrom: /(^|[^.\w$])(?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]*?\s*from\s*)?(['"])([^'"\n]+)\2/g,
  jsCall: /(^|[^.\w$])(?:require|import)\s*\(\s*(['"`])([^'"`\n]+)\2\s*\)/g,
  pyImport: /^[ \t]*import[ \t]+([^\n;]+)/gm,
  pyFrom: /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n;]+)/gm,
  jvmPackage: /^[ \t]*package[ \t]+([\w.]+)/m,
  jvmImport: /^[ \t]*import[ \t]+(static[ \t]+)?(\w+(?:\.\w+)*)(\.\*)?/gm,
  csNamespace: /(^|[^\w.])namespace[ \t\r\n]+([\w.]+)/g,
  csUsing: /^[ \t]*(?:global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:(\w+)[ \t]*=[ \t]*)?([\w.]+)[ \t]*;/gm,
  goImportBlock: /^[ \t]*import[ \t]*\(([^)]*)\)/gm,
  goImportOne: /^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"\n]+)"/gm,
  goSpec: /(?:[\w.]+[ \t]+)?"([^"\n]+)"/g,
  phpNamespace: /^[ \t]*namespace[ \t]+([\w\\]+)[ \t]*[;{]/m,
  phpUse: /^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?([^;]+);/gm,
  phpClass: /(^|[^\w$])(?:abstract[ \t]+|final[ \t]+|readonly[ \t]+)*(?:class|interface|trait|enum)[ \t]+(\w+)/g,
  phpRequire: /(^|[^\w$])(?:require|require_once|include|include_once)\b[ \t]*\(?[ \t]*(?:__DIR__[ \t]*\.[ \t]*|dirname\(__FILE__\)[ \t]*\.[ \t]*)?(['"])([^'"\n]+)\2/g,
  rbRequire: /^[ \t]*(require|require_relative|load)[ \t(]+(['"])([^'"\n]+)\2/gm,
  cInclude: /^[ \t]*#[ \t]*(?:include|import)[ \t]*"([^"\n]+)"/gm,
};

// Each extractor returns { refs: [{ spec, line, kind }], decl: {...} }.
function extract(file) {
  const fam = FAMILY[file.lang];
  const raw = String(file.text || '');
  const text = stripComments(raw, COMMENT_STYLE[fam]);
  const starts = lineStarts(text);
  const at = (offset) => lineAt(starts, offset);
  const refs = [];
  const decl = {};
  if (fam === 'js') {
    matches(RE.jsFrom, text, (m) => refs.push({ spec: m[3], line: at(m.index + m[1].length) }));
    matches(RE.jsCall, text, (m) => refs.push({ spec: m[3], line: at(m.index + m[1].length) }));
  } else if (fam === 'py') {
    matches(RE.pyImport, text, (m) => {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (/^[\w.]+$/.test(name)) refs.push({ spec: name, line: at(m.index), kind: 'import' });
      }
    });
    matches(RE.pyFrom, text, (m) => {
      const names = m[3].replace(/[()]/g, ' ').split(',').map((x) => x.trim().split(/\s+/)[0]).filter((x) => /^\w+$/.test(x));
      refs.push({ spec: m[2], level: m[1].length, names, line: at(m.index), kind: 'from' });
    });
  } else if (fam === 'jvm') {
    const pk = RE.jvmPackage.exec(text);
    decl.package = pk ? pk[1] : '';
    matches(RE.jvmImport, text, (m) => refs.push({ spec: m[2], wildcard: !!m[3], isStatic: !!m[1], line: at(m.index) }));
  } else if (fam === 'cs') {
    decl.namespaces = [];
    matches(RE.csNamespace, text, (m) => decl.namespaces.push(m[2]));
    matches(RE.csUsing, text, (m) => refs.push({ spec: m[2], alias: m[1] || null, line: at(m.index) }));
  } else if (fam === 'go') {
    matches(RE.goImportBlock, text, (m) => {
      const base = m.index + m[0].indexOf('(') + 1;
      matches(RE.goSpec, m[1], (s) => refs.push({ spec: s[1], line: at(base + s.index) }));
    });
    matches(RE.goImportOne, text, (m) => refs.push({ spec: m[1], line: at(m.index) }));
  } else if (fam === 'php') {
    const ns = RE.phpNamespace.exec(text);
    decl.namespace = ns ? ns[1].replace(/^\\/, '') : '';
    decl.classes = [];
    matches(RE.phpClass, text, (m) => decl.classes.push(m[2]));
    matches(RE.phpUse, text, (m) => {
      const body = m[1].trim();
      const line = at(m.index);
      const group = /^([\w\\]*)\\\{([^}]*)\}/.exec(body);
      if (group) {
        for (const part of group[2].split(',')) {
          const name = part.trim().split(/\s+/)[0];
          if (name) refs.push({ spec: `${group[1]}\\${name}`.replace(/^\\/, ''), line, kind: 'use' });
        }
        return;
      }
      for (const part of body.split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (/^\\?[\w\\]+$/.test(name)) refs.push({ spec: name.replace(/^\\/, ''), line, kind: 'use' });
      }
    });
    matches(RE.phpRequire, text, (m) => refs.push({ spec: m[3], line: at(m.index + m[1].length), kind: 'require' }));
  } else if (fam === 'rb') {
    matches(RE.rbRequire, text, (m) => refs.push({ spec: m[3], line: at(m.index), kind: m[1] }));
  } else if (fam === 'c') {
    matches(RE.cInclude, text, (m) => refs.push({ spec: m[1], line: at(m.index) }));
  }
  return { refs, decl };
}

// ---------------------------------------------------------------- the graph

function buildGraph(files, options = {}) {
  const opts = options || {};
  const includeDirs = (opts.includeDirs || []).map(norm);
  const list = [];
  for (const f of Array.isArray(files) ? files : []) {
    if (!f || typeof f.path !== 'string' || !FAMILY[f.lang]) continue;
    list.push({ path: norm(f.path), lang: f.lang, fam: FAMILY[f.lang], text: typeof f.text === 'string' ? f.text : '' });
  }
  list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byPath = new Map(list.map((f) => [f.path, f]));
  const byBase = new Map();
  for (const f of list) {
    const b = posix.basename(f.path);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(f);
  }
  const info = new Map();
  for (const f of list) {
    try { info.set(f.path, extract(f)); } catch (_) { info.set(f.path, { refs: [], decl: {} }); }
  }

  // Node identities ---------------------------------------------------------
  const nodeName = new Map(); // file path -> [node names] (C# files may hold several namespaces)
  const jvmPackages = new Set();
  const jvmClasses = new Map(); // FQN -> package
  const csNamespaces = new Set();
  const phpClasses = new Map(); // FQN -> node name
  const phpNamespaces = new Set();
  const goDirs = new Set();
  for (const f of list) {
    const { decl } = info.get(f.path);
    let names;
    if (f.fam === 'jvm') {
      const pkg = decl.package || dirOf(f.path) || '(default)';
      jvmPackages.add(pkg);
      const cls = posix.basename(stripExt(f.path));
      jvmClasses.set(decl.package ? `${decl.package}.${cls}` : cls, pkg);
      names = [pkg];
    } else if (f.fam === 'cs') {
      names = decl.namespaces && decl.namespaces.length ? [...new Set(decl.namespaces)] : [f.path];
      for (const n of decl.namespaces || []) csNamespaces.add(n);
    } else if (f.fam === 'php') {
      const node = decl.namespace || f.path;
      if (decl.namespace) phpNamespaces.add(decl.namespace);
      for (const c of decl.classes || []) phpClasses.set(decl.namespace ? `${decl.namespace}\\${c}` : c, node);
      names = [node];
    } else if (f.fam === 'go') {
      const d = dirOf(f.path) || '.';
      goDirs.add(d);
      names = [d];
    } else if (f.fam === 'c') {
      names = [stripExt(f.path)];
    } else {
      names = [f.path];
    }
    nodeName.set(f.path, names.map((n) => `${f.fam}\u0000${n}`));
  }

  // Suffix lookup for path-like resolution (C includes, Python, Ruby, PHP requires).
  const suffixFind = (rel, fam) => {
    const r = norm(rel);
    if (byPath.has(r) && byPath.get(r).fam === fam) return r;
    let best = null;
    for (const f of byBase.get(posix.basename(r)) || []) {
      if (f.fam !== fam) continue;
      if (f.path === r || f.path.endsWith(`/${r}`)) {
        if (!best || f.path.length < best.length) best = f.path;
      }
    }
    return best;
  };
  const fileIf = (p, fam) => (byPath.has(p) && byPath.get(p).fam === fam ? p : null);

  const resolveJs = (from, spec) => {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
    const base = spec.startsWith('/') ? norm(spec.slice(1)) : joinRel(dirOf(from), spec);
    const cands = [base];
    for (const e of JS_EXTS) cands.push(base + e);
    for (const e of JS_EXTS) cands.push(`${base}/index${e}`);
    const ext = posix.extname(base);
    if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) for (const e of ['.ts', '.tsx', '.mts', '.cts']) cands.push(stripExt(base) + e);
    for (const c of cands) if (fileIf(c, 'js')) return c;
    return null;
  };

  const pyModule = (dotted) => {
    const p = dotted.split('.').filter(Boolean).join('/');
    if (!p) return null;
    return fileIf(`${p}.py`, 'py') || fileIf(`${p}/__init__.py`, 'py') || suffixFind(`${p}.py`, 'py') || suffixFind(`${p}/__init__.py`, 'py');
  };
  const pyRelative = (from, level, dotted) => {
    let dir = dirOf(from).split('/').filter(Boolean);
    for (let k = 1; k < level; k++) dir = dir.slice(0, -1);
    const p = [...dir, ...dotted.split('.').filter(Boolean)].join('/');
    if (!p) return { mod: null, base: dir.join('/') };
    return { mod: fileIf(`${p}.py`, 'py') || fileIf(`${p}/__init__.py`, 'py'), base: p };
  };
  const resolvePy = (from, ref) => {
    const out = [];
    if (ref.kind === 'import') {
      const parts = ref.spec.split('.');
      for (let k = parts.length; k > 0; k--) {
        const hit = pyModule(parts.slice(0, k).join('.'));
        if (hit) { out.push(hit); break; }
      }
      return out;
    }
    if (ref.level > 0) {
      const { mod, base } = pyRelative(from, ref.level, ref.spec);
      let any = false;
      for (const name of ref.names || []) {
        const sub = fileIf(`${base ? `${base}/` : ''}${name}.py`, 'py') || fileIf(`${base ? `${base}/` : ''}${name}/__init__.py`, 'py');
        if (sub) { out.push(sub); any = true; }
      }
      if (!any && mod) out.push(mod);
      return out;
    }
    let any = false;
    for (const name of ref.names || []) {
      const sub = pyModule(`${ref.spec}.${name}`);
      if (sub) { out.push(sub); any = true; }
    }
    if (!any) {
      const parts = ref.spec.split('.');
      for (let k = parts.length; k > 0; k--) {
        const hit = pyModule(parts.slice(0, k).join('.'));
        if (hit) { out.push(hit); break; }
      }
    }
    return out;
  };

  const resolveJvm = (ref) => {
    const parts = ref.spec.split('.');
    if (ref.wildcard) {
      if (jvmPackages.has(ref.spec)) return ref.spec;
      if (jvmClasses.has(ref.spec)) return jvmClasses.get(ref.spec);
    }
    for (let k = parts.length; k > 0; k--) {
      const name = parts.slice(0, k).join('.');
      if (jvmClasses.has(name)) return jvmClasses.get(name);
      if (jvmPackages.has(name) && k < parts.length) return name;
    }
    return null;
  };

  const resolveCs = (ref) => {
    const parts = ref.spec.split('.');
    for (let k = parts.length; k > 0; k--) {
      const name = parts.slice(0, k).join('.');
      if (csNamespaces.has(name)) return name;
    }
    return null;
  };

  const resolveGo = (spec) => {
    // The module path prefix (go.mod) is unknown: match the longest run of
    // trailing directory segments, preferring the shortest directory on ties.
    const mod = opts.goModule ? String(opts.goModule).replace(/\/+$/, '') : '';
    if (mod && spec.startsWith(`${mod}/`)) {
      const rest = spec.slice(mod.length + 1);
      let hit = null;
      for (const d of goDirs) if ((d === rest || d.endsWith(`/${rest}`)) && (!hit || d.length < hit.length)) hit = d;
      if (hit) return hit;
    }
    const sp = spec.split('/');
    // Standard library paths have no dot in the first element ("fmt",
    // "net/http"); for those require at least two matching segments.
    const minLen = sp[0].includes('.') ? 1 : 2;
    let best = null; let bestLen = 0;
    for (const d of goDirs) {
      if (d === '.') continue;
      const dp = d.split('/');
      let k = 0;
      while (k < dp.length && k < sp.length && dp[dp.length - 1 - k] === sp[sp.length - 1 - k]) k++;
      if (k < minLen) continue;
      if (k > bestLen || (k === bestLen && best && d.length < best.length)) { best = d; bestLen = k; }
    }
    return best;
  };

  const resolvePhp = (from, ref) => {
    if (ref.kind === 'require') {
      const spec = ref.spec.replace(/^\//, '');
      const p = fileIf(joinRel(dirOf(from), spec), 'php') || suffixFind(spec, 'php');
      return p ? nodeName.get(p)[0].split('\u0000')[1] : null;
    }
    if (phpClasses.has(ref.spec)) return phpClasses.get(ref.spec);
    const parts = ref.spec.split('\\');
    for (let k = parts.length; k > 0; k--) {
      const name = parts.slice(0, k).join('\\');
      if (phpNamespaces.has(name)) return name;
    }
    return null;
  };

  const resolveRb = (from, ref) => {
    const spec = ref.spec.endsWith('.rb') ? ref.spec : `${ref.spec}.rb`;
    if (ref.kind === 'require_relative') return fileIf(joinRel(dirOf(from), spec), 'rb');
    return fileIf(joinRel(dirOf(from), spec), 'rb') || fileIf(norm(`lib/${spec}`), 'rb') || suffixFind(spec, 'rb');
  };

  const resolveC = (from, spec) => {
    const local = fileIf(joinRel(dirOf(from), spec), 'c');
    if (local) return local;
    for (const d of includeDirs) {
      const hit = fileIf(joinRel(d === '.' ? '' : d, spec), 'c');
      if (hit) return hit;
    }
    return suffixFind(spec, 'c');
  };

  // Edges --------------------------------------------------------------------
  const rawEdges = [];
  const addEdge = (fromKeys, toKey, file, line) => {
    for (const fk of fromKeys) if (toKey && fk !== toKey) rawEdges.push({ fromKey: fk, toKey, file, line });
  };
  const keyOfFile = (p) => (p ? nodeName.get(p)[0] : null);
  for (const f of list) {
    const { refs } = info.get(f.path);
    const from = nodeName.get(f.path);
    for (const ref of refs) {
      try {
        const fam = f.fam;
        if (fam === 'js') addEdge(from, keyOfFile(resolveJs(f.path, ref.spec)), f.path, ref.line);
        else if (fam === 'py') for (const t of resolvePy(f.path, ref)) addEdge(from, keyOfFile(t), f.path, ref.line);
        else if (fam === 'jvm') { const t = resolveJvm(ref); if (t) addEdge(from, `jvm\u0000${t}`, f.path, ref.line); }
        else if (fam === 'cs') { const t = resolveCs(ref); if (t) addEdge(from, `cs\u0000${t}`, f.path, ref.line); }
        else if (fam === 'go') { const t = resolveGo(ref.spec); if (t) addEdge(from, `go\u0000${t}`, f.path, ref.line); }
        else if (fam === 'php') { const t = resolvePhp(f.path, ref); if (t) addEdge(from, `php\u0000${t}`, f.path, ref.line); }
        else if (fam === 'rb') addEdge(from, keyOfFile(resolveRb(f.path, ref)), f.path, ref.line);
        else if (fam === 'c') addEdge(from, keyOfFile(resolveC(f.path, ref.spec)), f.path, ref.line);
      } catch (_) { /* unresolvable reference */ }
    }
  }

  // Public ids: plain names, disambiguated by language when two families clash.
  const nodeFiles = new Map();
  for (const f of list) for (const k of nodeName.get(f.path)) {
    if (!nodeFiles.has(k)) nodeFiles.set(k, []);
    nodeFiles.get(k).push(f);
  }
  const plainCount = new Map();
  for (const k of nodeFiles.keys()) {
    const plain = k.split('\u0000')[1];
    plainCount.set(plain, (plainCount.get(plain) || 0) + 1);
  }
  const idOf = new Map();
  for (const k of nodeFiles.keys()) {
    const [fam, plain] = k.split('\u0000');
    idOf.set(k, plainCount.get(plain) > 1 ? `${plain} [${fam}]` : plain);
  }

  const edgesAll = rawEdges.filter((e) => idOf.has(e.toKey) && idOf.has(e.fromKey))
    .map((e) => ({ from: idOf.get(e.fromKey), to: idOf.get(e.toKey), file: e.file, line: e.line }));
  const pair = new Map();
  for (const e of edgesAll) {
    const k = `${e.from}\u0000${e.to}`;
    const p = pair.get(k);
    if (p) p.count++;
    else pair.set(k, { from: e.from, to: e.to, file: e.file, line: e.line, count: 1 });
  }
  const edges = [...pair.values()];
  const out = new Map(); const inc = new Map();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, new Set());
    if (!inc.has(e.to)) inc.set(e.to, new Set());
    out.get(e.from).add(e.to);
    inc.get(e.to).add(e.from);
  }
  const nodes = [...nodeFiles.entries()].map(([k, fl]) => {
    const id = idOf.get(k);
    const ce = out.has(id) ? out.get(id).size : 0;
    const ca = inc.has(id) ? inc.get(id).size : 0;
    const fam = k.split('\u0000')[0];
    const kind = fam === 'jvm' ? 'package' : fam === 'cs' && !fl[0].path.endsWith(id) ? 'namespace'
      : fam === 'php' && !byPath.has(id) ? 'namespace' : fam === 'go' ? 'directory' : fam === 'c' ? 'module' : 'file';
    return {
      id, file: fl[0].path, lang: fl[0].lang, kind, files: fl.map((f) => f.path),
      ca, ce, instability: ca + ce ? Math.round((ce / (ca + ce)) * 1000) / 1000 : 0,
    };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges, edgesAll };
}

module.exports = { buildGraph, stripComments, extract, FAMILY };
