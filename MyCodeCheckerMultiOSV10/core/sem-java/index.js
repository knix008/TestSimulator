'use strict';

// Java / Kotlin semantic analyzer (SonarJava / sonar-kotlin scope).
// Contract: core/ENGINE_CONTRACT.md. Keys 'sem-java:<id>' (Java) and
// 'sem-java:kt-<id>' (Kotlin).
//
// Pipeline per analysis: parse every .java/.kt file (jparser / kparser,
// tolerant) -> project class index (types.Project) -> per file: one AST walk
// dispatching to rule handlers (rules/*), then per method CFG (cfg.js) +
// symbolic execution (se.js) + liveness (flow.js).

const A = require('./ast');
const { parseJava } = require('./jparser');
const { parseKotlin } = require('./kparser');
const { Project, Env } = require('./types');
const { buildCFG } = require('./cfg');
const { runSE } = require('./se');
const flow = require('./flow');
const R = require('./rules/core');

require('./rules/se-rules');
require('./rules/bugs');
require('./rules/smells');
require('./rules/security');
require('./rules/frameworks');
require('./rules/kotlin');

const LANGS = new Set(['java', 'kt']);
const MAX_FILE_BYTES = 1500000;

let catalogCache = null;
function catalog() {
  if (!catalogCache) catalogCache = R.catalogEntries();
  return catalogCache.map((e) => Object.assign({}, e));
}

function langOf(f) {
  if (f.lang === 'java' || f.lang === 'kt') return f.lang;
  if (f.lang === 'kotlin') return 'kt';
  const p = String(f.path || '');
  if (p.endsWith('.java')) return 'java';
  if (p.endsWith('.kt') || p.endsWith('.kts')) return 'kt';
  return null;
}

function isTestPath(p) {
  return /(^|\/)(test|tests|androidTest|testFixtures|it)\//.test(p) || /(Test|Tests|IT|Spec)\.(java|kt)$/.test(p);
}

// Compile handler tables once.
let tables = null;
function handlerTables() {
  if (tables) return tables;
  tables = { java: new Map(), kt: new Map() };
  for (const def of R.RULES) {
    if (!def.on) continue;
    for (const lang of def.langs) {
      const t = tables[lang];
      for (const [kind, fn] of Object.entries(def.on)) {
        if (!t.has(kind)) t.set(kind, []);
        t.get(kind).push({ def, fn });
      }
    }
  }
  return tables;
}

class Ctx {
  constructor(file, unit, lang, proj, active, findings) {
    this.file = file.path;
    this.src = String(file.text || '');
    this.unit = unit;
    this.lang = lang;
    this.kt = lang === 'kt';
    this.proj = proj;
    this.active = active;
    this.findings = findings;
    this.stack = [];
    this.clsStack = [];
    this.methodStack = [];
    this.envCache = new Map();
    this.isTestFile = isTestPath(this.file) || /\bimport\s+(org\.junit|org\.testng|io\.kotest|kotlin\.test)/.test(this.src);
    this.def = null;
    this.lines = null;
    this.seen = new Set();
  }

  get cls() { return this.clsStack.length ? this.clsStack[this.clsStack.length - 1] : null; }
  get clsInfo() { const c = this.cls; return c ? this.proj.infoOf(c) : null; }
  get method() { return this.methodStack.length ? this.methodStack[this.methodStack.length - 1] : null; }

  get env() {
    const m = this.method;
    const key = m || this.cls || this.unit;
    let e = this.envCache.get(key);
    if (!e) {
      e = new Env(this.proj, this.clsInfo, m, this.lang);
      this.envCache.set(key, e);
    }
    return e;
  }

  typeOf(e) { return this.env.typeOf(e); }

  parent(n = 1) { return this.stack[this.stack.length - 1 - n] || null; }

  ancestors() { return this.stack; }

  inLoop(stopAtMethod = true) {
    for (let i = this.stack.length - 2; i >= 0; i--) {
      const x = this.stack[i];
      if (stopAtMethod && (x.k === 'Method' || x.k === 'Lambda' || x.k === 'Class')) return false;
      if (x.k === 'While' || x.k === 'For' || x.k === 'ForEach' || x.k === 'Do') return true;
    }
    return false;
  }

  enclosing(kinds) {
    for (let i = this.stack.length - 2; i >= 0; i--) if (kinds.includes(this.stack[i].k)) return this.stack[i];
    return null;
  }

  text(n) { return A.text(this.src, n); }
  short(n, max) { return A.shortText(this.src, n, max); }

  constValue(e) {
    return A.constValue(e, this.proj.constLookup(this.clsInfo));
  }

  // Comments inside [startLine, endLine].
  hasComment(startLine, endLine) {
    for (const c of this.unit.comments) if (c.line <= endLine && c.endLine >= startLine) return true;
    return false;
  }

  isTestClass() {
    if (this.isTestFile) return true;
    const c = this.cls;
    return !!c && /Test(s|Case)?$/.test(c.name);
  }

  on(id) {
    const def = R.BY_ID.get(id);
    return !!def && def.langs.includes(this.lang) && this.active(R.keyFor(def, this.lang));
  }

  report(node, args, extra) {
    this.reportAs(this.def, node, args, extra);
  }

  reportAs(def, node, args, extra) {
    if (!def || !node) return;
    const key = R.keyFor(def, this.lang);
    if (!this.active(key)) return;
    const line = typeof node === 'number' ? node : (extra && extra.line) || node.idLine || node.line;
    const col = typeof node === 'number' ? 1 : (extra && extra.col) || node.idCol || node.col || 1;
    const dk = key + ':' + line + ':' + col;
    if (this.seen.has(dk)) return;
    this.seen.add(dk);
    const f = { rule: key, file: this.file, line, column: col, message: R.message(def, args) };
    if (typeof node === 'object' && node.el && node.el !== line && !(extra && extra.line)) f.endLine = node.el;
    if (extra && extra.events) f.events = extra.events;
    const m = this.method;
    if (m && m.name) f.function = m.name;
    this.findings.push(f);
  }
}

function walkUnit(cx, unit, table) {
  const visit = (n) => {
    cx.stack.push(n);
    const isCls = n.k === 'Class';
    const isMeth = n.k === 'Method' || n.k === 'Init';
    if (isCls) cx.clsStack.push(n);
    if (isMeth) cx.methodStack.push(n);
    const hs = table.get(n.k);
    if (hs) {
      for (const h of hs) {
        cx.def = h.def;
        try { h.fn(n, cx); } catch (err) { if (process.env.SEMJAVA_DEBUG) throw err; }
      }
    }
    A.eachChild(n, visit);
    const hx = table.get(n.k + ':exit');
    if (hx) {
      for (const h of hx) {
        cx.def = h.def;
        try { h.fn(n, cx); } catch (err) { if (process.env.SEMJAVA_DEBUG) throw err; }
      }
    }
    if (isMeth) cx.methodStack.pop();
    if (isCls) cx.clsStack.pop();
    cx.stack.pop();
  };
  visit(unit);
}

// Methods (incl. Kotlin top-level functions, accessors, init blocks) with bodies.
function methodsOf(unit) {
  const out = [];
  const addClass = (c, outerCls) => {
    for (const m of c.members) {
      if (m.k === 'Method' && m.body) out.push({ m, cls: c });
      else if (m.k === 'Init' && m.body) out.push({ m: { k: 'Method', name: m.static ? '<clinit>' : '<init>', params: [], body: m.body, line: m.line, mods: new Set(), annos: [] }, cls: c });
      else if (m.k === 'Field') {
        if (m.getter && m.getter.body) out.push({ m: m.getter, cls: c });
        if (m.setter && m.setter.body) out.push({ m: m.setter, cls: c });
      } else if (m.k === 'Class') addClass(m, c);
    }
    for (const ec of c.enumConsts || []) if (ec.body) addClass(ec.body, c);
    void outerCls;
  };
  for (const t of unit.types) addClass(t, null);
  for (const f of unit.funcs) if (f.body) out.push({ m: f, cls: null });
  for (const p of unit.props) {
    if (p.getter && p.getter.body) out.push({ m: p.getter, cls: null });
    if (p.setter && p.setter.body) out.push({ m: p.setter, cls: null });
  }
  // anonymous / local classes inside method bodies
  const nested = [];
  for (const { m } of out) {
    if (!m.body) continue;
    A.forEach(m.body, (x) => {
      if (x.k === 'New' && x.body) nested.push(x.body);
      if (x.k === 'LocalClass') nested.push(x.cls);
      if (x.k === 'LocalFun' && x.fn.body) out.push({ m: x.fn, cls: null, local: true });
      return true;
    });
  }
  for (const c of nested) addClass(c, null);
  return out;
}

const SE_IDS = ['null-dereference', 'optional-get-without-check', 'resource-leak', 'lock-not-released', 'condition-always-constant',
  'gratuitous-expression', 'division-by-zero', 'nonnull-param-passed-null', 'nonnull-return-null', 'stream-reused', 'null-assertion-on-null'];

function alwaysThrowsFn(proj, clsDecl) {
  const info = clsDecl ? proj.infoOf(clsDecl) : null;
  const cache = new Map();
  return (name, argc) => {
    if (!info) return false;
    const k = name + '/' + argc;
    if (cache.has(k)) return cache.get(k);
    const ms = proj.findMethods(info, name).filter((m) => (m.params || []).length === argc);
    const r = ms.length > 0 && ms.every((m) => m.body && !m.exprBody && m.body.stmts.length > 0 &&
      !A.canComplete(m.body) && !A.find(m.body, (x) => x.k === 'Return', { noLambda: true, noClass: true }));
    cache.set(k, r);
    return r;
  };
}

function volatileFields(proj, clsDecl) {
  const out = new Set();
  const info = clsDecl ? proj.infoOf(clsDecl) : null;
  if (!info) return out;
  for (const [name, f] of info.fields) {
    const t = f.type ? A.typeName(f.type) : '';
    if ((f.mods && f.mods.has('volatile')) || (f.field && A.hasAnno(f.field, 'Volatile')) || /^Atomic/.test(t)) out.add(name);
  }
  return out;
}

function runMethodEngines(cx, unit) {
  const seOn = SE_IDS.some((id) => cx.on(id));
  const deadOn = cx.on('dead-store');
  if (!seOn && !deadOn) return;
  const deadDef = R.BY_ID.get('dead-store');
  for (const { m, cls } of methodsOf(unit)) {
    if (!m.body || m.bodyError) continue;
    let cfg;
    try {
      cfg = buildCFG(m);
    } catch (err) {
      if (process.env.SEMJAVA_DEBUG) throw err;
      continue;
    }
    cx.clsStack = cls ? [cls] : [];
    cx.methodStack = [m];
    const env = cx.env;
    if (seOn) {
      const untracked = flow.assignedInClosures(m);
      const scx = {
        env, proj: cx.proj, clsInfo: cx.clsInfo, lang: cx.lang, src: cx.src,
        untracked, volatile: volatileFields(cx.proj, cls), alwaysThrows: alwaysThrowsFn(cx.proj, cls),
        on: (id) => cx.on(id),
        report: (id, node, args, extra) => cx.reportAs(R.BY_ID.get(id), node, args, extra),
      };
      try {
        runSE(m, cfg, scx);
      } catch (err) {
        if (process.env.SEMJAVA_DEBUG) throw err;
      }
    }
    if (deadOn) {
      try {
        flow.deadStores(m, cfg, env, (node, name) => cx.reportAs(deadDef, node, [name]));
      } catch (err) {
        if (process.env.SEMJAVA_DEBUG) throw err;
      }
    }
  }
  cx.clsStack = [];
  cx.methodStack = [];
}

function parseFile(f, lang) {
  const text = String(f.text || '');
  if (text.length > MAX_FILE_BYTES) return null;
  try {
    return lang === 'kt' ? parseKotlin(text) : parseJava(text);
  } catch (err) {
    if (process.env.SEMJAVA_DEBUG) throw err;
    return null;
  }
}

function analyze(files, ctx) {
  const c = ctx || {};
  const inactive = c.inactive instanceof Set ? c.inactive : new Set(c.inactive || []);
  const active = (key) => !inactive.has(key);
  const findings = [];
  const parsed = [];
  const proj = new Project();
  for (const f of files || []) {
    const lang = langOf(f);
    if (!LANGS.has(lang)) continue;
    const unit = parseFile(f, lang);
    if (!unit || unit.module) continue;
    parsed.push({ f, unit, lang });
    try { proj.add(unit, f.path); } catch (err) { if (process.env.SEMJAVA_DEBUG) throw err; }
  }
  const t = handlerTables();
  const t0 = Date.now();
  for (const { f, unit, lang } of parsed) {
    const cx = new Ctx(f, unit, lang, proj, active, findings);
    try {
      walkUnit(cx, unit, t[lang]);
    } catch (err) {
      if (process.env.SEMJAVA_DEBUG) throw err;
    }
    cx.stack = [];
    cx.clsStack = [];
    cx.methodStack = [];
    try {
      runMethodEngines(cx, unit);
    } catch (err) {
      if (process.env.SEMJAVA_DEBUG) throw err;
    }
  }
  if (c.stats) {
    c.stats.semJava = { files: parsed.length, parseErrors: parsed.reduce((n, p) => n + (p.unit.errors || 0), 0), ms: Date.now() - t0 };
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column));
  return findings;
}

module.exports = { catalog, analyze, parseJava, parseKotlin };
