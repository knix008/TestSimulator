'use strict';

// Project-level defect checkers that need every function first:
//
//   DELETE_ARRAY    a member allocated with new[] in one method and released
//                   with delete in another (or new / delete[])
//   CTOR_DTOR_LEAK  a constructor allocates into a pointer member that the
//                   destructor (or any other method) never releases
//   STACK_USE       local variables of one function, or of the deepest call
//                   chain through the project's functions, beyond
//                   options.absint.stackLimit (recursion is counted once)
//
// Facts per method come from syntax2.classFacts(); findings are attached to
// the analyzer of the function they point into (projectLevel, so they survive
// an interpreter time-out).

const cf = require('../cfamily');
const { reportDeleteArray, missingComma } = require('./syntax2');

const T = cf.types;

function withReport(an, f) {
  const before = an.findings.length;
  const was = an.reporting;
  an.reporting = true;
  try { f(); } finally { an.reporting = was; }
  for (let i = before; i < an.findings.length; i++) an.findings[i].projectLevel = true;
}

function classLevel(engine) {
  const byClass = new Map();
  for (const f of engine.classFactsList) {
    if (!f) continue;
    if (!byClass.has(f.key)) byClass.set(f.key, []);
    byClass.get(f.key).push(f);
  }
  if (!byClass.size) return;
  const ci = engine.classIndex();
  for (const [key, list] of byClass) {
    const allocs = new Map();
    for (const f of list) for (const a of f.allocs) {
      if (!allocs.has(a.field)) allocs.set(a.field, []);
      allocs.get(a.field).push({ ...a, an: f.an });
    }
    // DELETE_ARRAY across methods
    for (const f of list) {
      for (const d of f.deletes) {
        const al = allocs.get(d.field);
        if (!al || !al.length || !al.every((a) => a.kind === 'new' || a.kind === 'new[]')) continue;
        if (!al.every((a) => (a.kind === 'new[]') !== d.array)) continue;
        const src = al[0];
        withReport(f.an, () => reportDeleteArray(f.an, d.node, d.field, src.an === f.an ? src.node : null));
        if (src.an !== f.an) {
          // point at the allocation in the other method
          const last = f.an.findings[f.an.findings.length - 1];
          if (last && last.checker === 'DELETE_ARRAY' && src.node.loc) {
            last.events.splice(last.events.length - 1, 0, { line: src.node.loc.line, file: src.node.loc.file, tag: 'alloc',
              text: { en: `${d.field} is allocated with ${src.kind} in ${src.an.fn.name}.`, ko: `${src.an.fn.name}에서 ${d.field}을(를) ${src.kind}(으)로 할당합니다.` }, main: false });
          }
        }
      }
    }
    // CTOR_DTOR_LEAK
    const ctors = list.filter((f) => f.ctor && f.allocs.length);
    if (!ctors.length) continue;
    const dtors = list.filter((f) => f.dtor);
    const c = ci.get(key) || [...ci.classes.values()].find((x) => x.qname.split('::').pop() === key.split('::').pop());
    let dtorDefault = false;
    if (c && c.dtor) {
      const decls = (c.dtor.sym && c.dtor.sym.decls) || [];
      dtorDefault = decls.some((d) => d.isDefault);
      if (!dtors.length && !dtorDefault) continue; // the destructor is defined elsewhere
    }
    if (dtors.some((d) => d.memberCalls)) continue;
    const released = new Set();
    for (const f of list) for (const r of f.released) released.add(r);
    for (const f of ctors) {
      const seen = new Set();
      for (const a of f.allocs) {
        if (released.has(a.field) || seen.has(a.field)) continue;
        seen.add(a.field);
        const dt = dtors[0];
        const dname = dt ? dt.an.fn.name : `~${key.split('::').pop()}`;
        const evs = [];
        if (dt) evs.push(dt.an.ev(dt.an.fn, 'dtor', `The destructor ${dname} does not release ${a.field}.`, `소멸자 ${dname}이(가) ${a.field}을(를) 해제하지 않습니다.`));
        evs.unshift(f.an.ev(a.node, 'alloc', `${a.field} is allocated with ${a.kind} in the constructor.`, `생성자에서 ${a.field}을(를) ${a.kind}(으)로 할당합니다.`));
        withReport(f.an, () => f.an.report('CTOR_DTOR_LEAK', a.node, dt ? {
          en: `The constructor allocates ${a.field} with ${a.kind}, but the destructor ${dname} does not release it.`,
          ko: `생성자가 ${a.field}을(를) ${a.kind}(으)로 할당하지만 소멸자 ${dname}이(가) 해제하지 않습니다.`,
        } : {
          en: `The constructor allocates ${a.field} with ${a.kind}, but class ${key} has no destructor that releases it.`,
          ko: `생성자가 ${a.field}을(를) ${a.kind}(으)로 할당하지만 클래스 ${key}에 그것을 해제하는 소멸자가 없습니다.`,
        }, evs, { tag: 'ctor_dtor_leak' }));
      }
    }
  }
}

// ---------------------------------------------------------------- STACK_USE

function frameOf(an) {
  if (an.$frame) return an.$frame;
  let size = 0, big = null;
  const add = (node, name, t) => {
    let s = null;
    try { s = T.sizeOf(T.canonical(t), an.target); } catch { s = null; }
    if (s == null || !(Number(s) > 0)) return;
    s = Number(s);
    size += s;
    if (!big || s > big.size) big = { node, name, size: s };
  };
  for (const p of an.fn.params || []) if (p.ctype && p.name) { const c = T.canonical(p.ctype); if (c && c.kind === 'record') add(p, p.name, p.ctype); }
  cf.walk(an.fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'VarDecl' && n.symbol && n.symbol.kind === 'variable' && n.symbol.storage === 'automatic' && n.ctype) {
      const st = (n.specs && n.specs.storage) || [];
      if (!st.includes('static') && !st.includes('extern') && !st.includes('thread_local')) add(n, n.name, n.ctype);
    }
    return undefined;
  });
  an.$frame = { size, big };
  return an.$frame;
}

function stackUse(engine) {
  const limit = Number(engine.opts.stackLimit);
  if (!(limit > 0)) return;
  const byNode = new Map(), byKey = new Map();
  for (const an of engine.analyzers) { byNode.set(an.fn, an); if (an.key) byKey.set(an.key, an); }
  const calleesOf = (an) => {
    if (an.$callees) return an.$callees;
    const out = [];
    const seen = new Set();
    cf.walk(an.fn.body, (n) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      if (n.type !== 'CallExpr') return undefined;
      const s = n.calleeSymbol;
      if (!s || s.kind !== 'function') return undefined;
      const t = (s.definition && byNode.get(s.definition)) || byKey.get(engine.keyForSym(s, an.unit));
      if (t && !seen.has(t)) { seen.add(t); out.push({ an: t, call: n }); }
      return undefined;
    });
    an.$callees = out;
    return out;
  };
  const memo = new Map();
  const onStack = new Set();
  const total = (an, depth) => {
    if (memo.has(an)) return memo.get(an);
    const fr = frameOf(an).size;
    if (onStack.has(an) || depth > 200 || engine.spent()) return { size: fr, chain: [], rec: onStack.has(an) };
    onStack.add(an);
    let best = null, rec = false;
    for (const c of calleesOf(an)) {
      if (onStack.has(c.an)) { rec = true; continue; }
      const r = total(c.an, depth + 1);
      if (r.rec) rec = true;
      if (!best || r.size > best.r.size) best = { c, r };
    }
    onStack.delete(an);
    const res = { size: fr + (best ? best.r.size : 0), chain: best ? [best.c, ...best.r.chain] : [], rec, next: best };
    memo.set(an, res);
    return res;
  };
  for (const an of engine.analyzers) {
    if (!an.fn.loc || !engine.userFiles.has(an.fn.loc.file)) continue;
    const fr = frameOf(an);
    const at = an.fn;
    if (fr.size > limit) {
      const evs = fr.big ? [an.ev(fr.big.node, 'stack_use_local', `${fr.big.name} takes ${fr.big.size} bytes of stack.`, `${fr.big.name}이(가) 스택 ${fr.big.size}바이트를 차지합니다.`)] : [];
      withReport(an, () => an.report('STACK_USE', at, {
        en: `${an.fn.name} uses ${fr.size} bytes of stack for its local variables, more than the limit of ${limit} bytes${fr.big ? `; the largest is ${fr.big.name} (${fr.big.size} bytes)` : ''}.`,
        ko: `${an.fn.name}이(가) 지역 변수에 스택 ${fr.size}바이트를 써서 한도 ${limit}바이트를 넘습니다${fr.big ? `. 가장 큰 것은 ${fr.big.name}(${fr.big.size}바이트)입니다` : ''}.`,
      }, evs, { tag: 'stack_use_local_overflow' }));
      continue;
    }
    const r = total(an, 0);
    if (r.size <= limit || !r.next || r.next.r.size > limit || frameOf(r.next.c.an).size > limit) continue;
    const names = [an.fn.name, ...r.chain.map((c) => c.an.fn.name)];
    const evs = [];
    let cur = an;
    for (const c of r.chain) {
      const need = (memo.get(c.an) || { size: frameOf(c.an).size }).size;
      evs.push(cur.ev(c.call, 'stack_use_callee', `${cur.fn.name} calls ${c.an.fn.name}, whose call chain needs ${need} bytes of stack.`, `${cur.fn.name}이(가) 호출 사슬에 스택 ${need}바이트가 필요한 ${c.an.fn.name}을(를) 부릅니다.`));
      cur = c.an;
    }
    const recNote = r.rec ? { en: ' (recursion counted once)', ko: '(재귀는 한 번만 셈)' } : { en: '', ko: '' };
    withReport(an, () => an.report('STACK_USE', at, {
      en: `The call chain ${names.join(' -> ')} uses ${r.size} bytes of stack${recNote.en}, more than the limit of ${limit} bytes.`,
      ko: `호출 사슬 ${names.join(' -> ')}이(가) 스택 ${r.size}바이트를 써서${recNote.ko} 한도 ${limit}바이트를 넘습니다.`,
    }, evs.slice(0, 6), { tag: 'stack_use_overflow' }));
  }
}

// ---------------------------------------------------------------- file scope (MISSING_COMMA in global initializers)

function fileLevel(engine) {
  const { FnAnalyzer } = require('./interp');
  const P = FnAnalyzer.prototype;
  const seen = engine.directSeen || (engine.directSeen = new Set());
  const done = new Set();
  for (const unit of engine.project.units) {
    for (const d of (unit.ast && unit.ast.decls) || []) {
      if (!d || !d.loc || !engine.userFiles.has(d.loc.file) || d.type !== 'Declaration') continue;
      for (const v of d.declarators || []) {
        if (!v || v.type !== 'VarDecl' || !v.init || v.init.type !== 'InitList' || !v.loc) continue;
        const k = `${v.loc.file}:${v.loc.start}`;
        if (done.has(k)) continue;
        done.add(k);
        const sink = { unit, file: v.loc.file, reporting: true, quiet: 0, seen, findings: [], fn: { loc: v.loc }, name: '' };
        sink.src = (n, m) => P.src.call(sink, n, m);
        sink.ev = (n, tag, en, ko) => P.ev.call(sink, n, tag, en, ko);
        sink.report = (...args) => P.report.apply(sink, args);
        cf.walk(v.init, (n) => { if (n.type === 'InitList') missingComma(sink, n); return undefined; });
        for (const f of sink.findings) { delete f.function; engine.extraFindings.push(f); }
      }
    }
  }
}

module.exports = { classLevel, stackUse, fileLevel };
