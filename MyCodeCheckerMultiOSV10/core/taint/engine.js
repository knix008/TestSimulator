'use strict';

// Taint propagation over the parser IR.
//
// A taint value is a small array of origins. An origin is either a real
// source ({k:'src'}) or a symbolic parameter ({k:'param', idx}) used to build
// function summaries. Each origin carries the event steps that brought it
// here and the set of vulnerability classes it is already sanitized for.

const { parseFile } = require('./parser');
const { compileModels, modelsFor, buildIndex, resolveCall } = require('./resolve');
const { KEY_OF, NAME_OF } = require('./rules');
const { NUM_TYPES } = require('./models');

const NUM_RE = new RegExp(NUM_TYPES);
const MAX_ORIGINS = 6;
const MAX_STEPS = 40;
const MAX_ROUNDS = 12;

const CLEAN_METHODS = new Set(['length', 'size', 'count', 'isEmpty', 'isBlank', 'equals', 'equalsIgnoreCase', 'hashCode', 'startsWith', 'endsWith',
  'includes', 'contains', 'containsKey', 'has', 'hasOwnProperty', 'test', 'indexOf', 'lastIndexOf', 'compareTo', 'exists', 'isdigit', 'isalnum',
  'isalpha', 'isnumeric', 'startswith', 'endswith', 'len', 'typeof', 'instanceof', 'isArray', 'isInteger', 'isNaN', 'isFinite', 'matches',
  'StartsWith', 'EndsWith', 'Contains', 'Equals', 'IsMatch', 'Count', 'Length', 'Any', 'HasPrefix', 'HasSuffix', 'is_a?', 'nil?', 'empty?',
  'include?', 'start_with?', 'end_with?', 'key?', 'blank?', 'present?', 'isset', 'empty', 'is_null', 'in_array', 'array_key_exists',
  'strlen', 'count', 'is_numeric', 'ctype_digit', 'Exists', 'exists?', 'size?', 'any?', 'all?', 'none?', 'match?', 'getClass',
  'getTime', 'Len', 'strpos', 'str_starts_with', 'preg_match', 'isPresent', 'isDefined', 'isSuccess', 'ok', 'status', 'statusCode']);
const ITER_METHODS = new Set(['forEach', 'map', 'filter', 'flatMap', 'reduce', 'find', 'some', 'every', 'then', 'each', 'each_with_index', 'each_pair',
  'each_value', 'each_key', 'collect', 'select', 'reject', 'map!', 'flat_map', 'each_line', 'let', 'also', 'apply', 'run', 'forEachIndexed',
  'mapNotNull', 'onEach', 'ifPresent', 'peek', 'subscribe', 'Select', 'Where', 'ForEach', 'sortBy', 'groupBy', 'finally', 'tap', 'inject',
  'each_char', 'times', 'filterNot', 'mapIndexed', 'associate', 'use', 'with', 'takeIf', 'also']);
const SELF_NAMES = new Set(['this', 'self', '$this']);
const PY_ROUTE = /@\s*[\w.\s]*\.\s*(route|get|post|put|delete|patch|api_route)\s*\(/;

const LABEL_KO = {
  'HTTP request': 'HTTP 요청', 'HTTP cookie': 'HTTP 쿠키', 'URL/DOM input': 'URL/DOM 입력', 'command-line argument': '명령줄 인자',
  'environment variable': '환경 변수', 'file content': '파일 내용', 'standard input': '표준 입력', 'route parameter': '라우트 매개변수',
  'view argument': '뷰 인자', 'request parameter': '요청 매개변수', 'action parameter': '액션 매개변수',
};
const ko = (label) => LABEL_KO[label] || label;

// ---------------------------------------------------------------- taint values

function originKey(o) {
  return (o.k === 'src' ? 's:' + o.srcFile + ':' + o.srcLine + ':' + o.label : 'p:' + o.idx) + '|' + o.san.join(',');
}
function mk(o) { o.key = originKey(o); return o; }

function union(...lists) {
  let out = null;
  for (const l of lists) {
    if (!l || !l.length) continue;
    if (!out) { out = l.slice(); continue; }
    for (const o of l) {
      if (out.length >= MAX_ORIGINS) break;
      if (!out.some((x) => x.key === o.key)) out.push(o);
    }
  }
  return out || [];
}

function trimSteps(steps) {
  if (steps.length <= MAX_STEPS) return steps;
  return steps.slice(0, 6).concat(steps.slice(steps.length - (MAX_STEPS - 6)));
}

function withStep(T, ev) {
  if (!T.length || !ev) return T;
  return T.map((o) => {
    const last = o.steps[o.steps.length - 1];
    if (last && last.line === ev.line && last.file === ev.file && last.tag === ev.tag && last.text.en === ev.text.en) return o;
    return mk(Object.assign({}, o, { steps: trimSteps(o.steps.concat(ev)) }));
  });
}

function sanitizeT(T, vulns, ev) {
  if (!T.length) return T;
  if (vulns === 'all') return [];
  const list = Array.isArray(vulns) ? vulns : [vulns];
  return T.map((o) => {
    const san = [...new Set(o.san.concat(list))].sort();
    const steps = ev ? trimSteps(o.steps.concat(ev)) : o.steps;
    return mk(Object.assign({}, o, { san, steps }));
  });
}

function ev(file, line, tag, en, koText) {
  return { file, line: line || 1, tag, text: { en, ko: koText } };
}

// ---------------------------------------------------------------- chain helpers

function chainText(n, depth = 0) {
  if (!n || depth > 30) return '';
  switch (n.k) {
    case 'name': return n.name;
    case 'member': return chainText(n.obj, depth + 1) + '.' + n.prop;
    case 'index': return chainText(n.obj, depth + 1) + '[]';
    case 'call': return (n.isNew ? 'new ' : '') + chainText(n.callee, depth + 1) + '()';
    case 'str': return n.regex ? '/' + n.lit + '/' : JSON.stringify(n.lit.length > 40 ? n.lit.slice(0, 40) : n.lit);
    case 'cast': return chainText(n.e, depth + 1);
    case 'arr': return '[]';
    case 'obj': return '{}';
    case 'fn': return 'fn';
    case 'op': return '(' + n.parts.map((p) => chainText(p, depth + 1)).join(' ') + ')';
    default: return 'L';
  }
}

function chainRoot(n) {
  let cur = n;
  for (let k = 0; k < 40 && cur; k++) {
    if (cur.k === 'name') return cur.name;
    if (cur.k === 'member' || cur.k === 'index') cur = cur.obj;
    else if (cur.k === 'call') cur = cur.callee;
    else if (cur.k === 'cast') cur = cur.e;
    else return '';
  }
  return '';
}

function exprText(n, depth = 0) {
  if (!n || depth > 20) return '';
  if (n.k === 'op') {
    const out = [];
    n.parts.forEach((p, i) => { if (i) out.push(n.ops[i - 1] || n.ops[0] || ''); out.push(exprText(p, depth + 1)); });
    return out.join(' ');
  }
  if (n.k === 'call') return chainText(n.callee) + '(' + n.args.map((a) => exprText(a, depth + 1)).join(', ') + ')';
  return chainText(n, depth);
}

function walk(n, visit, depth = 0) {
  if (!n || depth > 60) return;
  visit(n);
  switch (n.k) {
    case 'member': walk(n.obj, visit, depth + 1); break;
    case 'index': walk(n.obj, visit, depth + 1); walk(n.idx, visit, depth + 1); break;
    case 'call': walk(n.callee, visit, depth + 1); for (const a of n.args) walk(a, visit, depth + 1); for (const v of Object.values(n.named || {})) walk(v, visit, depth + 1); break;
    case 'op': for (const p of n.parts) walk(p, visit, depth + 1); break;
    case 'arr': for (const p of n.items) walk(p, visit, depth + 1); break;
    case 'obj': for (const e of n.entries) walk(e.value, visit, depth + 1); break;
    case 'str': for (const p of n.parts) walk(p, visit, depth + 1); break;
    case 'cast': walk(n.e, visit, depth + 1); break;
    default: break;
  }
}

function shortText(s, max = 60) {
  s = String(s || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------------------------------------------------------------- engine state

function createGlobal(files, opts) {
  const firs = [];
  for (const f of files) {
    try { firs.push(parseFile(f.path, f.text, f.lang)); } catch { /* skip unparsable file */ }
  }
  const compiled = compileModels(opts.models);
  const G = {
    firs,
    idx: buildIndex(firs),
    texts: new Map(files.map((f) => [f.path, f.text])),
    compiled,
    modelCache: new Map(),
    summaries: new Map(),
    envs: new Map(),
    typesByFn: new Map(),
    seeds: new Map(),
    fields: new Map(),
    fieldTypes: new Map(),
    findings: new Map(),
    lowTrust: !!opts.lowTrust,
    inactive: opts.inactive || new Set(),
    changed: false,
  };
  G.models = (lang) => {
    if (!G.modelCache.has(lang)) G.modelCache.set(lang, modelsFor(compiled, lang));
    return G.modelCache.get(lang);
  };
  return G;
}

function summarySig(sum) {
  const parts = [];
  for (const [i, r] of sum.ret) parts.push('r' + i + ':' + r.san.join(','));
  for (const o of sum.retSrc) parts.push('s' + o.key);
  for (const s of sum.sinks) parts.push('k' + s.idx + ':' + s.vuln + ':' + s.sink.file + ':' + s.sink.line + ':' + s.san.join(','));
  for (const w of sum.writes) parts.push('w' + w.from + '>' + w.to);
  return parts.sort().join('|');
}

function run(files, opts) {
  const G = createGlobal(files, opts);
  const fns = [];
  for (const fir of G.firs) for (const fn of fir.fns) fns.push(fn);
  let lastSig = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    G.changed = false;
    for (const fn of fns) {
      let sum;
      try { sum = analyzeFn(G, fn); } catch { continue; }
      const old = G.summaries.get(fn.id);
      if (!old || summarySig(old) !== summarySig(sum)) G.changed = true;
      G.summaries.set(fn.id, sum);
    }
    const sig = [...G.seeds.values()].map((m) => [...m.values()].map((t) => t.map((o) => o.key).join(',')).join(';')).join('/') + '#' + [...G.fields.values()].map((t) => t.map((o) => o.key).join(',')).join(';');
    if (sig !== lastSig) { G.changed = true; lastSig = sig; }
    if (!G.changed && round > 0) break;
  }
  return [...G.findings.values()];
}

// ---------------------------------------------------------------- function analysis

function analyzeFn(G, fn) {
  const fir = G.idx.files.get(fn.file);
  const st = {
    G, fn, fir, file: fn.file, lang: fn.lang, fam: fir.fam, models: G.models(fn.lang), text: G.texts.get(fn.file) || '',
    env: new Map(), types: new Map(), ret: [], sinks: [], writes: [],
  };
  st.typeOf = (name) => typeOf(st, name);
  G.typesByFn.set(fn.id, st.types);
  const seeds = G.seeds.get(fn.id);
  fn.params.forEach((p, i) => {
    const typeClean = (p.type || '').replace(/\s+/g, '');
    if (typeClean) st.types.set(p.name, typeClean);
    if (typeClean && NUM_RE.test(typeClean)) { st.env.set(p.name, []); return; }
    let T = [mk({ k: 'param', idx: i, steps: [], san: [] })];
    const src = paramSource(st, fn, p);
    if (src) T = union(T, [src]);
    if (seeds && seeds.get(i)) T = union(T, seeds.get(i));
    st.env.set(p.name, T);
    if (p.destructure) for (const d of p.destructure) st.env.set(d.name, T);
  });
  for (const s of fn.stmts) {
    try { execStmt(st, s); } catch { /* keep going */ }
  }
  G.envs.set(fn.id, st.env);
  // summary
  const ret = new Map();
  let retSrc = [];
  for (const o of st.ret) {
    if (o.k === 'param') {
      const prev = ret.get(o.idx);
      if (!prev || o.san.length < prev.san.length) ret.set(o.idx, { steps: o.steps, san: o.san, line: o.retLine || fn.line });
    } else retSrc = union(retSrc, [o]);
  }
  return { ret, retSrc, sinks: st.sinks, writes: st.writes };
}

function paramSource(st, fn, p) {
  const anns = fn.anns.join(' ');
  for (const m of st.models.param) {
    if (m.ann && !m.ann.test(p.ann || '')) continue;
    if (m.fnAnn && !m.fnAnn.test(anns)) continue;
    if (m.notAnnAny && p.ann) continue;
    if (m.fnName && !m.fnName.test(fn.name)) continue;
    if (m.fnPublic && !/public/.test(fn.mods || '')) continue;
    if (m.clsBase) {
      const cls = (st.G.idx.classes.get(fn.cls) || [])[0];
      if (!cls || !m.clsBase.test(cls.bases + ' ' + cls.anns)) continue;
    }
    const type = (p.type || '').replace(/\s+/g, '');
    if (m.type && !m.type.test(type)) continue;
    if (m.notType && type && m.notType.test(type)) continue;
    if (m.notName && m.notName.test(p.name)) continue;
    if (m.notDef && p.def && m.notDef.test(p.def)) continue;
    if (!m.ann && !m.fnAnn && !m.clsBase && !m.fnName) continue;
    return mk({
      k: 'src', label: m.label, trust: m.trust || 'high', srcFile: st.file, srcLine: fn.line, san: [],
      steps: [ev(st.file, fn.line, 'source', `Source: ${m.label} '${p.name}'`, `소스: ${ko(m.label)} '${p.name}'`)],
    });
  }
  return null;
}

function typeOf(st, name) {
  if (st.types.has(name)) return st.types.get(name);
  let f = st.fn.parent;
  while (f) {
    const t = st.G.typesByFn.get(f.id);
    if (t && t.has(name)) return t.get(name);
    f = f.parent;
  }
  if (st.fn.cls) {
    const ft = st.G.fieldTypes.get(st.fn.cls + '.' + name);
    if (ft) return ft;
  }
  return '';
}

function lookup(st, key) {
  if (st.env.has(key)) return st.env.get(key);
  let f = st.fn.parent;
  while (f) {
    const env = st.G.envs.get(f.id);
    if (env && env.has(key)) return env.get(key);
    f = f.parent;
  }
  return null;
}

function fieldKey(st, prop) { return st.file + '|' + (st.fn.cls || '') + '|' + prop; }

// ---------------------------------------------------------------- statements

function execStmt(st, s) {
  switch (s.k) {
    case 'assign': return execAssign(st, s);
    case 'expr': evalE(st, s.e); return undefined;
    case 'return': {
      let T = evalE(st, s.e);
      routeReturn(st, s, T);
      if (T.length) {
        T = withStep(T, ev(st.file, s.line, 'return', `Returned from ${st.fn.name || 'function'}()`, `${st.fn.name || '함수'}()에서 반환합니다`));
        T = T.map((o) => (o.k === 'param' ? mk(Object.assign({}, o, { retLine: s.line })) : o));
      }
      st.ret = union(st.ret, T);
      return undefined;
    }
    case 'guard': evalE(st, s.e); applyGuards(st, s.e); return undefined;
    case 'foreach': {
      const T = evalE(st, s.e);
      for (const name of s.targets) {
        const T2 = withStep(T, ev(st.file, s.line, 'assign', `Iterated into '${name}'`, `반복으로 '${name}'에 들어갑니다`));
        st.env.set(name, union(lookup(st, name) || [], T2));
      }
      return undefined;
    }
    case 'echo': {
      for (const item of s.e) {
        const T = evalE(st, item);
        for (const m of st.models.sink) {
          if (!m.echoKw || !m.echoKw.test(s.kw)) continue;
          report(st, m.vuln, { line: s.line, col: s.col, callee: s.kw, label: m.label }, T);
        }
      }
      return undefined;
    }
    default: return undefined;
  }
}

function execAssign(st, s) {
  let V = evalE(st, s.value);
  if (s.declType && NUM_RE.test(s.declType.replace(/\s+/g, ''))) V = [];
  if (st.fam === 'go' && s.value && s.value.k === 'index') goIndexGuard(st, s.value);
  const compound = s.op && s.op !== '=' && s.op !== ':=';
  for (const t of s.targets) {
    if (!t) continue;
    if (t.k === 'name') {
      const name = t.name;
      if (s.declType) st.types.set(name, s.declType.replace(/\s+/g, ''));
      else if (s.value && s.value.k === 'call' && (s.value.isNew || /^[A-Z]/.test(chainText(s.value.callee)))) st.types.set(name, chainText(s.value.callee).replace(/^new /, ''));
      if (st.fam === 'rb' && /^@/.test(name)) { writeField(st, name.slice(1), V, s); continue; }
      let T = V.length ? withStep(V, ev(st.file, s.line, 'assign', `Assigned to '${name}'`, `'${name}'에 대입합니다`)) : V;
      if (compound || s.cond) T = union(lookup(st, name) || [], T);
      st.env.set(name, T);
      continue;
    }
    if (t.k === 'destructure') {
      for (const it of t.items) {
        let T = V;
        if (it.key) {
          const synthetic = { k: 'member', obj: s.value, prop: it.key, line: s.line };
          const src = matchSource(st, synthetic);
          if (src) T = [src];
        }
        if (T.length) T = withStep(T, ev(st.file, s.line, 'assign', `Assigned to '${it.name}'`, `'${it.name}'에 대입합니다`));
        st.env.set(it.name, s.cond ? union(lookup(st, it.name) || [], T) : T);
      }
      continue;
    }
    if (t.k === 'member' || t.k === 'index') {
      assignSinks(st, t, V, s);
      const key = chainText(t);
      const T = V.length ? withStep(V, ev(st.file, s.line, 'assign', `Stored in '${shortText(key)}'`, `'${shortText(key)}'에 저장합니다`)) : V;
      if (t.k === 'member' && t.obj.k === 'name' && SELF_NAMES.has(t.obj.name)) {
        writeField(st, t.prop, T, s);
        if (s.value && s.value.k === 'name') {
          const vt = st.typeOf(s.value.name);
          if (vt) st.G.fieldTypes.set(st.fn.cls + '.' + t.prop, vt);
        }
        if (s.value && s.value.k === 'call' && (s.value.isNew || /^[A-Z]/.test(chainText(s.value.callee)))) st.G.fieldTypes.set(st.fn.cls + '.' + t.prop, chainText(s.value.callee).replace(/^new /, ''));
        continue;
      }
      st.env.set(key, compound || s.cond ? union(lookup(st, key) || [], T) : T);
      const root = chainRoot(t);
      if (root && T.length) st.env.set(root, union(lookup(st, root) || [], T));
      continue;
    }
  }
  // fields declared in a class body (Java/C#/Kotlin/TS): record types for resolution
  if (st.fn.isModule && st.fn.cls === null && s.declType && s.targets[0] && s.targets[0].k === 'name') {
    // module-level typed variables; nothing else to do
  }
}

function writeField(st, prop, T, s) {
  const key = fieldKey(st, prop);
  const old = st.G.fields.get(key) || [];
  const next = union(old, T.filter((o) => o.k === 'src'));
  if (next.length !== old.length) st.G.fields.set(key, next);
  for (const o of T) {
    if (o.k === 'param' && !st.writes.some((w) => w.from === o.idx && w.to === prop)) st.writes.push({ from: o.idx, to: prop, steps: o.steps, san: o.san, line: s.line });
  }
  if (st.fn.isModule || s.declType) {
    if (s.declType) st.G.fieldTypes.set((st.fn.cls || '') + '.' + prop, s.declType.replace(/\s+/g, ''));
  }
}

function assignSinks(st, t, V, s) {
  const lhs = chainText(t);
  for (const m of st.models.sink) {
    if (m.assign && m.assign.test(lhs)) {
      if (m.recvType) {
        const rt = st.typeOf(chainRoot(t));
        if (!rt || !m.recvType.test(rt)) continue;
      }
      report(st, m.vuln, { line: s.line, col: s.col, callee: lhs, label: m.label }, V);
    }
    if (m.protoAssign && t.k === 'index') {
      const keyT = evalE(st, t.idx);
      if (!keyT.length) continue;
      const nested = t.obj.k === 'index';
      if (nested) report(st, 'proto', { line: s.line, col: s.col, callee: lhs, label: m.label }, keyT);
      else if (V.length) report(st, 'proto', { line: s.line, col: s.col, callee: lhs, label: m.label }, keyT);
    }
  }
}

function routeReturn(st, s, T) {
  for (const m of st.models.sink) {
    if (!m.routeReturn) continue;
    const anns = st.fn.anns.join(' ');
    if (m.fnAnn ? !m.fnAnn.test(anns) : !(st.fam === 'py' && PY_ROUTE.test(anns))) continue;
    let TT = T;
    if (m.retPrefix) {
      const e = s.e;
      if (!(e && e.k === 'op' && e.parts[0] && e.parts[0].k === 'str' && m.retPrefix.test(e.parts[0].lit))) continue;
      TT = union(...e.parts.slice(1).map((p) => evalE(st, p)));
    } else if (s.e && s.e.k === 'call') {
      continue; // responses built by calls are checked at the call
    }
    report(st, m.vuln, { line: s.line, col: 1, callee: 'return', label: m.label }, TT);
  }
}

// ---------------------------------------------------------------- guards

function applyGuards(st, e) {
  const text = exprText(e);
  const names = new Set();
  walk(e, (n) => { if (n.k === 'name' || n.k === 'member') names.add(chainText(n)); });
  for (const m of st.models.guard) {
    if (m.text && m.text.test(text)) for (const nm of names) markSanitized(st, nm, m.vulns);
  }
  walk(e, (n) => {
    if (n.k === 'op' && n.ops && n.ops.includes('in') && st.fam === 'py') {
      const lhs = n.parts[0];
      const rhs = n.parts[n.parts.length - 1];
      for (const m of st.models.guard) {
        if (m.inOp && lhs && rhs && (!m.rhs || m.rhs.test(chainText(rhs)))) markSanitized(st, chainText(lhs), m.vulns);
      }
    }
    if (n.k !== 'call') return;
    const info = callInfo(n);
    for (const m of st.models.guard) {
      if (m.text || m.inOp || m.indexAllow) continue;
      if (!matchCallModel(st, m, n, info)) continue;
      const checked = [];
      if (m.check === 'recv' && info.recv) checked.push(info.recv);
      else if (m.check === 'all') checked.push(...n.args);
      else if (typeof m.check === 'number' && n.args[m.check]) checked.push(n.args[m.check]);
      for (const c of checked) {
        let node = c;
        while (node && node.k === 'call' && node.callee.k === 'member' && /^(trim|strip|toLowerCase|lower|toString|normalize|resolve)$/.test(node.callee.prop)) node = node.callee.obj;
        if (node && (node.k === 'name' || node.k === 'member' || node.k === 'index')) markSanitized(st, chainText(node), m.vulns);
      }
    }
  });
}

function goIndexGuard(st, n) {
  for (const m of st.models.guard) {
    if (!m.indexAllow) continue;
    if (n.obj.k === 'name' && m.indexAllow.test(n.obj.name) && n.idx && n.idx.k === 'name') markSanitized(st, n.idx.name, m.vulns);
  }
}

function markSanitized(st, key, vulns) {
  const T = lookup(st, key);
  if (!T || !T.length) return;
  st.env.set(key, sanitizeT(T, vulns));
}

// ---------------------------------------------------------------- expressions

function evalE(st, n) {
  if (!n) return [];
  switch (n.k) {
    case 'lit': return [];
    case 'str': {
      const T = union(...n.parts.map((p) => evalE(st, p)));
      if (T.length && (n.regex || n.shell)) {
        for (const m of st.models.sink) {
          if ((m.regexLiteral && n.regex) || (m.shell && n.shell)) report(st, m.vuln, { line: n.line, col: n.col, callee: n.regex ? 'regex literal' : 'shell string', label: m.label }, T);
        }
      }
      return T;
    }
    case 'name': {
      const src = matchSource(st, n);
      if (src) return [src];
      const T = lookup(st, n.name);
      if (T) return T;
      if (st.fam === 'rb' && /^@/.test(n.name)) return st.G.fields.get(fieldKey(st, n.name.slice(1))) || [];
      return [];
    }
    case 'member':
    case 'index': {
      const src = matchSource(st, n);
      if (src) return [src];
      if (n.k === 'member' && st.fam === 'rb' && !(n.obj.k === 'name' && SELF_NAMES.has(n.obj.name))) {
        // Ruby: `obj.meth` is a call without parentheses
        return evalCall(st, { k: 'call', callee: n, args: [], named: {}, line: n.line, col: n.col, src: chainText(n), implicit: true });
      }
      if (n.k === 'index') evalE(st, n.idx);
      const key = chainText(n);
      const direct = st.env.has(key) ? st.env.get(key) : null;
      if (n.k === 'member' && n.obj.k === 'name' && SELF_NAMES.has(n.obj.name)) {
        return union(direct || [], st.G.fields.get(fieldKey(st, n.prop)) || []);
      }
      if (direct) return direct;
      return evalE(st, n.obj);
    }
    case 'call': return evalCall(st, n);
    case 'op': {
      const ex = new Set(n.excluded || []);
      const parts = n.parts.map((p) => evalE(st, p));
      if (n.bool) return [];
      return union(...parts.filter((_, i) => !ex.has(i)));
    }
    case 'arr': return union(...n.items.map((p) => evalE(st, p)));
    case 'obj': {
      let T = [];
      for (const e of n.entries) {
        const V = evalE(st, e.value);
        if (V.length && e.key) {
          for (const m of st.models.sink) {
            if (m.objKey && m.objKey.test(e.key)) report(st, m.vuln, { line: e.value.line || n.line, col: 1, callee: e.key, label: m.label }, V);
          }
        }
        if (e.keyNode) evalE(st, e.keyNode);
        T = union(T, V);
      }
      return T;
    }
    case 'cast': {
      const T = evalE(st, n.e);
      return /^(int|integer|float|double|bool|boolean|long|short|byte|uint|ulong|decimal|Int|Long|Double|Float|Boolean|Integer|unset)$/.test(n.type) ? [] : T;
    }
    case 'fn': return [];
    default: return [];
  }
}

function callInfo(n) {
  const callee = n.callee;
  const calleeText = chainText(callee);
  const method = callee.k === 'member' ? callee.prop : callee.k === 'name' ? callee.name : '';
  const recv = callee.k === 'member' ? callee.obj : null;
  const recvText = recv ? chainText(recv) : '';
  return { calleeText, newText: (n.isNew ? 'new ' : '') + calleeText, method, recv, recvText };
}

function matchCallModel(st, m, n, info) {
  if (m.call) {
    if (!(m.call.test(info.calleeText) || (n.isNew && m.call.test(info.newText)))) return false;
    if (m.newOnly && !n.isNew && (st.fam === 'java' || st.fam === 'cs' || st.fam === 'js' || st.fam === 'php') && !(st.lang === 'kt')) return false;
  } else if (m.method) {
    if (!m.method.test(info.method)) return false;
    if (m.recv) { if (!info.recv || !m.recv.test(info.recvText)) return false; } else if (!info.recv) return false;
  } else return false;
  if (m.notRecv && info.recv && m.notRecv.test(info.recvText)) return false;
  if (m.argHas) {
    const ok = m.argHas.test(n.src || '') || (m.orFile && m.argHas.test(st.text));
    if (!ok) return false;
  }
  if (m.argLacks && m.argLacks.test(n.src || '')) return false;
  if (m.fileHas && !m.fileHas.test(st.text)) return false;
  if (m.fileLacks && m.fileLacks.test(st.text)) return false;
  if (m.arg0Name && !(n.args[0] && n.args[0].k === 'name' && m.arg0Name.test(n.args[0].name))) return false;
  if (m.needsImport) {
    if (n.callee.k !== 'name') return false;
    const imp = st.fir.imports.find((i) => i.local === n.callee.name);
    if (!imp || !m.needsImport.test(imp.module)) return false;
  }
  return true;
}

function argSelect(m, n, argT, namedT, recvT) {
  const out = [];
  const spec = m.args;
  const pick = (i) => {
    const a = n.args[i];
    if (!a) return;
    if ((m.notObject || m.stringOnly) && (a.k === 'obj' || a.k === 'fn' || a.k === 'arr')) return;
    if (m.firstElement && a.k === 'arr') { out.push({ T: argT[i].first || [], i }); return; }
    if (m.objKeyOrWhole && a.k === 'obj') return; // object literals are checked by key
    out.push({ T: argT[i], i });
  };
  if (Array.isArray(spec)) spec.forEach(pick);
  else if (spec === 'all') { n.args.forEach((_, i) => pick(i)); for (const k of Object.keys(namedT)) out.push({ T: namedT[k], i: k }); } else if (spec === 'last') pick(n.args.length - 1);
  else if (spec === 'rest1') for (let i = 1; i < n.args.length; i++) pick(i);
  else if (spec === 'recv') out.push({ T: recvT, i: 'recv' });
  if (m.kw) for (const k of m.kw) if (namedT[k]) out.push({ T: namedT[k], i: k });
  if (m.kw && st_isRb(n)) {
    const h = n.args.find((a) => a.k === 'obj' && a.kw);
    if (h) for (const e of h.entries) if (m.kw.includes(e.key)) out.push({ T: e.T || [], i: e.key });
  }
  return out;
}
function st_isRb(n) { return n.args.some((a) => a.k === 'obj' && a.kw); }

function evalCall(st, n) {
  const info = callInfo(n);
  const G = st.G;
  // arguments
  const argT = n.args.map((a) => {
    if (a.k === 'fn') return [];
    const T = evalE(st, a);
    if (a.k === 'arr' && a.items.length) T.first = evalE(st, a.items[0]);
    if (a.k === 'obj' && a.kw) for (const e of a.entries) e.T = evalE(st, e.value);
    return T;
  });
  const namedT = {};
  for (const [k, v] of Object.entries(n.named || {})) namedT[k] = evalE(st, v);
  let recvT = [];
  if (info.recv) recvT = evalE(st, info.recv);
  const allArgs = () => union(...argT, ...Object.values(namedT));
  // callbacks of iteration-style calls receive the receiver taint
  const seedT = ITER_METHODS.has(info.method) ? recvT : [];
  for (const a of n.args) {
    if (a.k !== 'fn') continue;
    if (!seedT.length) continue;
    if (!G.seeds.has(a.fn.id)) G.seeds.set(a.fn.id, new Map());
    const m = G.seeds.get(a.fn.id);
    a.fn.params.forEach((p, i) => {
      const old = m.get(i) || [];
      const next = union(old, seedT.filter((o) => o.k === 'src'));
      if (next.length !== old.length) m.set(i, next);
    });
  }

  // dynamic calls: obj[tainted]() / $fn()
  if (n.callee.k === 'index' || (st.fam === 'php' && n.callee.k === 'name' && n.callee.name[0] === '$')) {
    const keyT = n.callee.k === 'index' ? evalE(st, n.callee.idx) : evalE(st, n.callee);
    for (const m of st.models.sink) if (m.dynamicCall) report(st, m.vuln, { line: n.line, col: n.col, callee: info.calleeText, label: m.label }, keyT);
  }

  // sanitizers
  let sanList = null;
  for (const m of st.models.sanitizer) {
    if (!matchCallModel(st, m, n, info)) continue;
    if (m.vulns === 'all') return [];
    sanList = [...new Set((sanList || []).concat(Array.isArray(m.vulns) ? m.vulns : [m.vulns]))];
  }
  if (sanList) {
    const T = union(allArgs(), recvT);
    return sanitizeT(T, sanList, ev(st.file, n.line, 'sanitizer', `Sanitized by ${shortText(info.calleeText)}() for ${sanList.join(', ')} only`, `${shortText(info.calleeText)}()는 ${sanList.join(', ')}만 처리합니다`));
  }
  if (!info.recv && n.callee.k !== 'name' && n.callee.k !== 'index') recvT = evalE(st, n.callee);
  // sources returned by calls
  const src = matchSource(st, n);
  if (src) return [src];
  // sources written into an argument (gin ShouldBind, ...)
  for (const m of st.models.source) {
    if (m.intoArg == null || !m.call) continue;
    if (!m.call.test(info.calleeText.slice(chainRoot(n).length))) continue;
    const root = chainRoot(n);
    const t = st.typeOf(root);
    if (m.rootType && t ? !m.rootType.test(t) : (m.root && !m.root.test(root))) continue;
    if (!G.lowTrust && m.trust === 'low') continue;
    const target = stripRef(n.args[m.intoArg]);
    if (target && (target.k === 'name' || target.k === 'member')) {
      const o = mk({ k: 'src', label: m.label, trust: m.trust || 'high', srcFile: st.file, srcLine: n.line, san: [], steps: [ev(st.file, n.line, 'source', `Source: ${m.label} (${shortText(info.calleeText)})`, `소스: ${ko(m.label)} (${shortText(info.calleeText)})`)] });
      st.env.set(chainText(target), union(lookup(st, chainText(target)) || [], [o]));
    }
  }
  // user functions (precise resolution)
  const res = resolveCall(G, st, n);
  if (res.precise && res.fns.length) return applySummaries(st, n, res.fns, argT, namedT, recvT, info);
  if (res.ctor && res.ctor.length) applySummaries(st, n, res.ctor, argT, namedT, recvT, info);
  // sinks
  let sinkHit = false;
  for (const m of st.models.sink) {
    if (m.assign || m.objKey || m.echoKw || m.routeReturn || m.shell || m.regexLiteral || m.dynamicCall || m.protoAssign) continue;
    if (!m.call && !m.method) continue;
    if (!matchCallModel(st, m, n, info)) continue;
    sinkHit = true;
    for (const a of argSelect(m, n, argT, namedT, recvT)) {
      report(st, m.vuln, { line: n.line, col: n.col, callee: info.calleeText, label: m.label, arg: a.i }, a.T || []);
    }
    if (m.objKeyOrWhole) {
      const a = n.args[0];
      if (a && a.k === 'obj') for (const e of a.entries) if (e.key === '$where') report(st, m.vuln, { line: n.line, col: n.col, callee: info.calleeText, label: m.label }, evalE(st, e.value));
    }
  }
  // propagators into receiver / arguments
  for (const m of st.models.propagator) {
    if (!matchCallModel(st, m, n, info)) continue;
    let from = [];
    if (m.from === 'all') from = allArgs();
    else if (m.from === 'recv') from = recvT;
    else if (m.from === 'rest1') from = union(...argT.slice(1));
    else if (typeof m.from === 'number') from = argT[m.from] || [];
    if (!from.length) continue;
    const targets = [];
    if (m.to === 'recv' && info.recv) targets.push(info.recv);
    else if (typeof m.to === 'number' && n.args[m.to]) targets.push(n.args[m.to]);
    else if (m.to === 'last' && n.args.length) targets.push(n.args[n.args.length - 1]);
    else if (m.to === 'rest2') targets.push(...n.args.slice(2));
    for (const t0 of targets) {
      const t = stripRef(t0);
      if (!t || !(t.k === 'name' || t.k === 'member' || t.k === 'index')) continue;
      const key = chainText(t);
      const T = withStep(from, ev(st.file, n.line, 'propagate', `Propagates into '${shortText(key)}'`, `'${shortText(key)}'로 전파됩니다`));
      if (t.k === 'member' && t.obj.k === 'name' && SELF_NAMES.has(t.obj.name)) writeField(st, t.prop, T, { cond: true });
      st.env.set(key, union(lookup(st, key) || [], T));
      const root = chainRoot(t);
      if (root && root !== key) st.env.set(root, union(lookup(st, root) || [], T));
    }
  }
  if (sinkHit) return [];
  if (res.fns.length) return applySummaries(st, n, res.fns, argT, namedT, recvT, info);
  // unknown library call: result depends on its inputs
  if (CLEAN_METHODS.has(info.method)) return [];
  return union(allArgs(), recvT);
}

function stripRef(n) {
  if (!n) return n;
  if (n.k === 'op' && n.parts.length === 1) return n.parts[0];
  return n;
}

function applySummaries(st, n, fns, argT, namedT, recvT, info) {
  let result = [];
  const isMember = n.callee.k === 'member';
  for (const fn of fns) {
    const sum = st.G.summaries.get(fn.id);
    if (!sum) continue;
    const selfFirst = fn.params[0] && /^(self|cls)$/.test(fn.params[0].name);
    const offset = selfFirst && (isMember || fn.name === '__init__') ? 1 : 0;
    const ctorCall = selfFirst && !isMember;
    const argFor = (idx) => {
      if (offset && idx === 0) return ctorCall ? [] : recvT;
      const p = fn.params[idx];
      if (p && namedT[p.name]) return namedT[p.name];
      return argT[idx - offset] || [];
    };
    const pname = (idx) => (fn.params[idx] ? fn.params[idx].name : '#' + idx);
    const callEv = (idx) => ev(st.file, n.line, 'call', `Passed to ${fn.name}() as '${pname(idx)}'` + (fn.file !== st.file ? ` (${fn.file})` : ''), `${fn.name}()의 '${pname(idx)}'로 전달합니다` + (fn.file !== st.file ? ` (${fn.file})` : ''));
    for (const [idx, r] of sum.ret) {
      const T = argFor(idx);
      if (!T.length) continue;
      for (const o of T) {
        const steps = trimSteps(o.steps.concat(callEv(idx), r.steps));
        result = union(result, [mk(Object.assign({}, o, { steps, san: [...new Set(o.san.concat(r.san))].sort() }))]);
      }
    }
    if (sum.retSrc.length) {
      const callE = ev(st.file, n.line, 'call', `Returned by ${fn.name}()` + (fn.file !== st.file ? ` (${fn.file})` : ''), `${fn.name}()가 반환합니다` + (fn.file !== st.file ? ` (${fn.file})` : ''));
      result = union(result, withStep(sum.retSrc, callE));
    }
    for (const w of sum.writes) {
      const T = argFor(w.from).filter((o) => o.k === 'src');
      if (!T.length) continue;
      const key = fn.file + '|' + (fn.cls || '') + '|' + w.to;
      const old = st.G.fields.get(key) || [];
      const add = T.map((o) => mk(Object.assign({}, o, {
        steps: trimSteps(o.steps.concat(callEv(w.from), w.steps, ev(fn.file, w.line, 'assign', `Stored in field '${w.to}'`, `필드 '${w.to}'에 저장합니다`))),
        san: [...new Set(o.san.concat(w.san))].sort(),
      })));
      const next = union(old, add);
      if (next.length !== old.length) st.G.fields.set(key, next);
    }
    for (const s of sum.sinks) {
      const T = argFor(s.idx);
      for (const o of T) {
        if (o.san.includes(s.vuln) || s.san.includes(s.vuln)) continue;
        const steps = trimSteps(o.steps.concat(callEv(s.idx), s.steps));
        const merged = mk(Object.assign({}, o, { steps, san: [...new Set(o.san.concat(s.san))].sort() }));
        deliver(st, s.vuln, s.sink, merged);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------- sources

function matchSource(st, n) {
  const text = chainText(n);
  if (!text || text.length > 300) return null;
  const root = chainRoot(n);
  for (const m of st.models.source) {
    if (m.intoArg != null) continue;
    if (m.trust === 'low' && !st.G.lowTrust) continue;
    if (m.fnName && !m.fnName.test(st.fn.name)) continue;
    let ok = false;
    if (m.chain) {
      ok = m.chain.test(text);
      if (ok && m.rootType) { const t = st.typeOf(root); ok = !!t && m.rootType.test(t); }
    } else if (m.path) {
      const segs = text.split('.');
      for (let k = 1; k <= Math.min(4, segs.length) && !ok; k++) {
        const prefix = segs.slice(0, k).join('.');
        if (prefix.includes('(') || prefix.includes('[')) {
          // `Request[]`-style roots end at the first index or call
          const cut = prefix.search(/[[(]/);
          const p0 = prefix.slice(0, cut);
          const rest0 = text.slice(p0.length);
          if (rootOk(st, m, p0, k === 1) && m.path.test(rest0)) ok = true;
          break;
        }
        const rest = text.slice(prefix.length);
        if (rootOk(st, m, prefix, k === 1) && m.path.test(rest)) ok = true;
      }
    }
    if (ok && m.argHas && !m.argHas.test(n.src || '')) ok = false;
    if (!ok) continue;
    return mk({
      k: 'src', label: m.label, trust: m.trust || 'high', srcFile: st.file, srcLine: n.line || 1, san: [], notFor: m.notFor || null, remap: m.remap || null,
      steps: [ev(st.file, n.line, 'source', `Source: ${m.label} (${shortText(text)})`, `소스: ${ko(m.label)} (${shortText(text)})`)],
    });
  }
  return null;
}

function rootOk(st, m, prefix, single) {
  if (single && m.rootType) {
    const t = st.typeOf(prefix);
    if (t) return m.rootType.test(t);
  }
  return m.root ? m.root.test(prefix) : false;
}

// ---------------------------------------------------------------- reporting

function report(st, vuln, sink, T) {
  if (!T || !T.length) return;
  const loc = Object.assign({ file: st.file, fn: st.fn.name }, sink);
  for (const o of T) {
    if (o.san.includes(vuln)) continue;
    deliver(st, vuln, loc, o);
  }
}

function deliver(st, vuln, sink, o) {
  if (o.k === 'param') {
    if (!st.sinks.some((s) => s.idx === o.idx && s.vuln === vuln && s.sink.file === sink.file && s.sink.line === sink.line)) {
      st.sinks.push({ idx: o.idx, vuln, steps: o.steps, sink, san: o.san });
    }
    return;
  }
  if (o.trust === 'low' && !st.G.lowTrust) return;
  if (o.notFor && o.notFor.includes(vuln)) return;
  if (o.remap && o.remap[vuln]) vuln = o.remap[vuln];
  const rule = KEY_OF[vuln];
  if (!rule || st.G.inactive.has(rule)) return;
  const name = NAME_OF[vuln];
  const callee = shortText(sink.callee || '', 50);
  const first = o.steps[0] || { file: sink.file, line: sink.line };
  const where = first.file === sink.file ? `line ${first.line}` : `${first.file}:${first.line}`;
  const whereKo = first.file === sink.file ? `${first.line}행` : `${first.file}:${first.line}`;
  const events = o.steps.map((s) => ({ line: s.line, tag: s.tag, text: s.text, main: false, file: s.file }));
  const bypass = events.filter((e) => e.tag === 'sanitizer');
  for (const b of bypass) {
    b.tag = 'sanitizer';
    b.text = { en: b.text.en + ` — not a ${vuln} sanitizer`, ko: b.text.ko + ` — ${vuln}에는 효과가 없습니다` };
  }
  events.push({ line: sink.line, tag: 'sink', main: true, file: sink.file,
    text: { en: `Sink: ${callee} (${name.en})`, ko: `싱크: ${callee} (${name.ko})` } });
  const finding = {
    rule, file: sink.file, line: sink.line, column: sink.col || 1,
    message: {
      en: `Tainted ${o.label} from ${where} reaches ${callee}.`,
      ko: `${whereKo}의 외부 입력(${ko(o.label)})이 ${callee}에 들어갑니다.`,
    },
    events,
    function: sink.fn || st.fn.name || undefined,
  };
  const key = rule + '|' + sink.file + '|' + sink.line;
  const prev = st.G.findings.get(key);
  if (!prev || prev.events.length > finding.events.length) st.G.findings.set(key, finding);
}

module.exports = { run, chainText, createGlobal };
