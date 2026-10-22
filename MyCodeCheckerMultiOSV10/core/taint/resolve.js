'use strict';

// Model compilation and cross-file name resolution for the taint engine.

const pathMod = require('path').posix;

const MODEL_LANGS = {
  js: ['js'], ts: ['js'], py: ['py'], java: ['java'], kt: ['java', 'kt'], cs: ['cs'], php: ['php'], go: ['go'], rb: ['rb'],
};
const REGEX_FIELDS = new Set(['chain', 'root', 'rootType', 'path', 'call', 'method', 'recv', 'notRecv', 'assign', 'argHas', 'argLacks',
  'fileHas', 'fileLacks', 'objKey', 'echoKw', 'ann', 'fnAnn', 'clsBase', 'fnName', 'type', 'notType', 'notName', 'notDef', 'recvType',
  'needsImport', 'arg0Name', 'retPrefix', 'text', 'rhs', 'indexAllow']);

function toRegex(v) {
  if (v == null || v instanceof RegExp) return v;
  try {
    if (typeof v === 'string') return new RegExp(v);
    if (typeof v === 'object' && typeof v.re === 'string') return new RegExp(v.re, v.flags || '');
  } catch { /* invalid user regex */ }
  return null;
}

function compileEntry(raw) {
  if (!raw || typeof raw !== 'object' || !raw.kind) return null;
  const e = {};
  for (const [k, v] of Object.entries(raw)) {
    if (REGEX_FIELDS.has(k)) {
      const re = toRegex(v);
      if (v != null && !re) return null;
      e[k] = re;
    } else e[k] = v;
  }
  if (e.kind === 'sink' && !e.vuln) return null;
  return e;
}

// models: array of raw entries -> { [modelLang]: { source:[], param:[], sink:[], sanitizer:[], guard:[], propagator:[] } }
function compileModels(entries) {
  const out = {};
  for (const raw of entries) {
    const e = compileEntry(raw);
    if (!e) continue;
    const langs = Array.isArray(e.lang) ? e.lang : [e.lang || '*'];
    for (const l of langs) {
      const targets = l === '*' ? ['js', 'py', 'java', 'kt', 'cs', 'php', 'go', 'rb'] : [l === 'ts' ? 'js' : l];
      for (const t of targets) {
        if (!out[t]) out[t] = { source: [], param: [], sink: [], sanitizer: [], guard: [], propagator: [] };
        if (out[t][e.kind]) out[t][e.kind].push(e);
      }
    }
  }
  return out;
}

function modelsFor(compiled, lang) {
  const keys = MODEL_LANGS[lang] || [lang];
  const merged = { source: [], param: [], sink: [], sanitizer: [], guard: [], propagator: [] };
  for (const k of keys) {
    const m = compiled[k];
    if (!m) continue;
    for (const kind of Object.keys(merged)) merged[kind].push(...m[kind]);
  }
  return merged;
}

function normalizeUserModels(opt) {
  if (!opt) return [];
  if (Array.isArray(opt)) return opt;
  if (Array.isArray(opt.models)) return opt.models;
  if (typeof opt === 'object') {
    // { js: [...], py: [...] }
    const out = [];
    for (const [lang, list] of Object.entries(opt)) {
      if (Array.isArray(list)) for (const e of list) out.push(Object.assign({ lang }, e));
    }
    return out;
  }
  return [];
}

// ---------------------------------------------------------------- index

function buildIndex(firs) {
  const files = new Map();
  const byName = new Map();
  const byCls = new Map();
  const classes = new Map();
  const byDir = new Map();
  for (const fir of firs) {
    files.set(fir.path, fir);
    const dir = pathMod.dirname(fir.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(fir);
    for (const c of fir.classes) {
      if (!classes.has(c.name)) classes.set(c.name, []);
      classes.get(c.name).push(c);
    }
    for (const fn of fir.fns) {
      if (fn.isModule || !fn.name) continue;
      if (!byName.has(fn.name)) byName.set(fn.name, []);
      byName.get(fn.name).push(fn);
      if (fn.cls) {
        if (!byCls.has(fn.cls)) byCls.set(fn.cls, new Map());
        const m = byCls.get(fn.cls);
        if (!m.has(fn.name)) m.set(fn.name, []);
        m.get(fn.name).push(fn);
      }
    }
  }
  return { files, byName, byCls, classes, byDir };
}

const JS_EXT = ['', '.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '/index.js', '/index.ts', '/index.mjs'];

function moduleFiles(G, fir, spec) {
  const out = [];
  if (!spec) return out;
  const fam = fir.fam;
  const dir = pathMod.dirname(fir.path);
  const add = (p) => { const f = G.idx.files.get(p.replace(/^\.\//, '')); if (f && !out.includes(f)) out.push(f); };
  if (fam === 'js') {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = pathMod.normalize(pathMod.join(dir, spec));
      for (const ext of JS_EXT) add(base + ext);
      if (!out.length && /\.js$/.test(base)) add(base.replace(/\.js$/, '.ts'));
    } else {
      // path aliases such as '@/lib/db' or 'src/db'
      const tail = spec.replace(/^[@~]\//, '');
      for (const p of G.idx.files.keys()) {
        const noExt = p.replace(/\.(js|ts|mjs|cjs|jsx|tsx)$/, '').replace(/\/index$/, '');
        if (noExt === tail || noExt.endsWith('/' + tail)) out.push(G.idx.files.get(p));
      }
    }
    return out;
  }
  if (fam === 'py') {
    let rel = spec;
    let baseDir = '';
    const dots = /^\.+/.exec(rel);
    if (dots) {
      baseDir = dir;
      for (let k = 1; k < dots[0].length; k++) baseDir = pathMod.dirname(baseDir);
      rel = rel.slice(dots[0].length);
    }
    const sub = rel.replace(/\./g, '/');
    if (dots) {
      const base = sub ? pathMod.join(baseDir, sub) : baseDir;
      add(base + '.py');
      add(base + '/__init__.py');
    } else if (sub) {
      for (const p of G.idx.files.keys()) {
        if (p === sub + '.py' || p.endsWith('/' + sub + '.py') || p === sub + '/__init__.py' || p.endsWith('/' + sub + '/__init__.py')) out.push(G.idx.files.get(p));
      }
    }
    return out;
  }
  if (fam === 'go') {
    const segs = spec.split('/');
    for (let n = segs.length; n >= 1; n--) {
      const tail = segs.slice(segs.length - n).join('/');
      for (const [d, list] of G.idx.byDir) {
        if (d === tail || d.endsWith('/' + tail)) for (const f of list) if (f.fam === 'go' && !out.includes(f)) out.push(f);
      }
      if (out.length) break;
    }
    return out;
  }
  if (fam === 'php' || fam === 'rb') {
    let s = spec.replace(/^\.\//, '');
    if (fam === 'rb' && !/\.rb$/.test(s)) s += '.rb';
    const joined = pathMod.normalize(pathMod.join(dir, s));
    add(joined);
    for (const p of G.idx.files.keys()) if (p === s || p.endsWith('/' + s)) add(p);
    return out;
  }
  return out;
}

function fnsInFiles(files, name) {
  const out = [];
  for (const f of files) for (const fn of f.fns) if (fn.name === name && !fn.isModule) out.push(fn);
  return out;
}

function defaultFns(files) {
  const out = [];
  for (const f of files) {
    for (const fn of f.fns) if (fn.isDefault) out.push(fn);
    if (!out.length && f.defaultExport) out.push(...fnsInFiles([f], f.defaultExport));
  }
  return out;
}

function methodsOf(G, cls, name) {
  if (!cls) return [];
  const clean = String(cls).replace(/<.*$/, '').replace(/[?*&\s]/g, '').replace(/^.*[.\\]/, '');
  const m = G.idx.byCls.get(clean);
  const own = m && m.get(name) ? m.get(name).slice() : [];
  if (own.length) return own;
  // inherited: walk base classes
  for (const c of G.idx.classes.get(clean) || []) {
    const bases = (c.bases || '').split(/[^\w$]+/).filter((b) => b && b !== 'extends' && b !== 'implements' && b !== clean);
    for (const b of bases) {
      const bm = G.idx.byCls.get(b);
      if (bm && bm.get(name)) return bm.get(name).slice();
    }
  }
  return [];
}

const COMMON_METHODS = new Set(['get', 'set', 'put', 'add', 'remove', 'toString', 'equals', 'hashCode', 'run', 'call', 'apply', 'bind', 'then', 'catch',
  'map', 'filter', 'forEach', 'reduce', 'push', 'pop', 'find', 'send', 'write', 'read', 'close', 'open', 'start', 'stop', 'init', 'update',
  'delete', 'execute', 'query', 'save', 'load', 'parse', 'format', 'render', 'handle', 'process', 'log', 'info', 'error', 'debug', 'warn',
  'json', 'end', 'join', 'split', 'replace', 'trim', 'length', 'size', 'keys', 'values', 'items', 'append', 'extend', 'insert', 'next', 'each',
  'new', 'create', 'build', 'main', '__init__', 'constructor', 'invoke', 'exec', 'list', 'value', 'test', 'match', 'search', 'sort', 'copy']);

// Returns { fns, precise } for a call node
function resolveCall(G, st, n) {
  const callee = n.callee;
  const fir = st.fir;
  if (!callee) return { fns: [], precise: false };
  if (callee.k === 'name') {
    const name = callee.name;
    if (n.isNew) {
      const ctor = methodsOf(G, name, st.fam === 'py' ? '__init__' : 'constructor');
      return { fns: [], precise: false, ctor };
    }
    // same class first (unqualified method calls in Java/C#/Kotlin/PHP)
    if (st.fn.cls) {
      const own = methodsOf(G, st.fn.cls, name);
      if (own.length) return { fns: own, precise: true };
    }
    const local = fir.fns.filter((f) => f.name === name && !f.isModule && (!f.cls || f.cls === st.fn.cls || fir.fam === 'go' || fir.fam === 'php' || fir.fam === 'py' && !f.cls));
    if (local.length) return { fns: local, precise: true };
    const imp = fir.imports.find((i) => i.local === name);
    if (imp) {
      const files = moduleFiles(G, fir, imp.module);
      let fns = [];
      if (imp.imported === 'default' || imp.imported === '*') fns = defaultFns(files);
      if (!fns.length && imp.imported !== '*' && imp.imported !== 'default') fns = fnsInFiles(files, imp.imported);
      if (!fns.length && imp.imported === 'default') fns = fnsInFiles(files, name);
      if (fns.length) return { fns, precise: true };
      if (files.length) return { fns: [], precise: false };
    }
    // python class instantiation
    if (st.fam === 'py' || st.fam === 'kt') {
      const ctor = methodsOf(G, name, st.fam === 'py' ? '__init__' : 'constructor');
      if (G.idx.classes.has(name)) return { fns: [], precise: false, ctor };
    }
    const global = (G.idx.byName.get(name) || []).filter((f) => sameFamily(f.lang, st.lang) && (!f.cls || st.fam === 'php' || st.fam === 'rb' && f.cls === st.fn.cls));
    if (global.length && global.length <= 4) return { fns: global, precise: st.fam === 'go' || st.fam === 'php' || st.fam === 'rb' || st.fam === 'py' };
    return { fns: [], precise: false };
  }
  if (callee.k === 'member') {
    const m = callee.prop;
    const recv = callee.obj;
    if (recv.k === 'name') {
      const r = recv.name;
      if (r === 'this' || r === 'self' || r === '$this' || r === 'static' || r === 'super' || r === 'parent' || r === 'base' || r === 'cls') {
        const own = methodsOf(G, st.fn.cls, m);
        if (own.length) return { fns: own, precise: true };
      }
      const imp = fir.imports.find((i) => i.local === r);
      if (imp) {
        let files = moduleFiles(G, fir, imp.module);
        if (imp.maybeModule && fir.fam === 'py') {
          const sub = moduleFiles(G, fir, (imp.module.endsWith('.') ? imp.module : imp.module + '.') + imp.imported);
          if (sub.length) files = sub;
        }
        let fns = fnsInFiles(files, m).filter((f) => !f.cls || f.cls === imp.cls || fir.fam === 'js');
        if (!fns.length && imp.imported && imp.imported !== '*' && imp.imported !== 'default') {
          // imported object/class: `const { db } = require('./x'); db.run()` or `import { Svc } ...; Svc.find()`
          fns = methodsOf(G, imp.imported, m);
          if (!fns.length) fns = fnsInFiles(files, m);
        }
        if (!fns.length && imp.cls) fns = methodsOf(G, imp.cls, m);
        if (fns.length) return { fns, precise: true };
        if (files.length) return { fns: [], precise: true };
      }
      if (G.idx.classes.has(r)) {
        const fns = methodsOf(G, r, m);
        if (fns.length) return { fns, precise: true };
      }
      const t = st.typeOf(r);
      if (t) {
        const fns = methodsOf(G, t, m);
        if (fns.length) return { fns, precise: true };
      }
    }
    if (recv.k === 'member' && recv.obj.k === 'name' && /^(this|self|\$this)$/.test(recv.obj.name)) {
      const t = G.fieldTypes.get(st.fn.cls + '.' + recv.prop);
      if (t) {
        const fns = methodsOf(G, t, m);
        if (fns.length) return { fns, precise: true };
      }
    }
    if (st.fam === 'rb' && recv.k === 'name' && /^@/.test(recv.name)) {
      const t = G.fieldTypes.get(st.fn.cls + '.' + recv.name.slice(1));
      if (t) { const fns = methodsOf(G, t, m); if (fns.length) return { fns, precise: true }; }
    }
    if (COMMON_METHODS.has(m)) return { fns: [], precise: false };
    const global = (G.idx.byName.get(m) || []).filter((f) => sameFamily(f.lang, st.lang) && f.cls);
    if (global.length && global.length <= 3) return { fns: global, precise: false };
  }
  return { fns: [], precise: false };
}

function sameFamily(a, b) {
  const fa = (MODEL_LANGS[a] || [a])[0];
  const fb = (MODEL_LANGS[b] || [b])[0];
  return fa === fb;
}

module.exports = { compileModels, modelsFor, normalizeUserModels, buildIndex, resolveCall, moduleFiles, MODEL_LANGS };
