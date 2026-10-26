'use strict';

// Forward path-sensitive state propagation over the CFG (a light symbolic
// execution: conditions refine facts on their true/false edges, facts are
// joined at merge points). Tracks per function:
//   n:<sym>  nil-ness of local pointers / maps / channels (with origin)
//   r:<sym>  resources that must be closed (files, connections, response bodies)
//   p:<sym>  error variable -> resource opened by the same call
//   l:<key>  mutexes held
// Reports FORWARD_NULL, nil map writes, nil channel operations,
// RESOURCE_LEAK, LOCK (double lock, missing unlock on some path).

const A = require('./ast');
const { qualified, typeOfExpr } = require('./model');
const { RESOURCES, RESPONSE_METHODS, NON_OWNING } = require('./stdlib');
const { isLocal } = require('./flow');

const MAX_VISITS = 40;

function cloneState(s) {
  const o = {};
  for (const k in s) { const v = s[k]; o[k] = v && typeof v === 'object' ? { ...v } : v; }
  return o;
}

function joinInto(dst, src) {
  let changed = false;
  const keys = new Set([...Object.keys(dst), ...Object.keys(src)]);
  for (const k of keys) {
    const a = dst[k];
    const b = src[k];
    const t = k[0];
    if (t === 'p') {
      if (a !== b) { if (a !== undefined) { delete dst[k]; changed = true; } }
      continue;
    }
    const da = a || defaultFact(t, b);
    const db = b || defaultFact(t, a);
    const m = mergeFact(t, da, db);
    if (!a || !sameFact(a, m)) { dst[k] = m; changed = true; }
  }
  return changed;
}
function defaultFact(t, other) {
  if (t === 'n') return { nil: false, nn: true, o: null };
  if (t === 'r') return { open: false, closed: true, line: other ? other.line : 0, col: other ? other.col : 0, kind: other ? other.kind : '', name: other ? other.name : '' };
  if (t === 'l') return { held: false, free: true, line: other ? other.line : 0, col: other ? other.col : 0, deferred: false, name: other ? other.name : '' };
  return {};
}
function mergeFact(t, a, b) {
  if (t === 'n') return { nil: a.nil || b.nil, nn: a.nn || b.nn, o: a.o || b.o };
  if (t === 'r') return { open: a.open || b.open, closed: a.closed || b.closed, line: a.open ? a.line : b.line, col: a.open ? a.col : b.col, kind: a.kind || b.kind, name: a.name || b.name };
  if (t === 'l') return { held: a.held || b.held, free: a.free || b.free, line: a.held ? a.line : b.line, col: a.held ? a.col : b.col, deferred: a.deferred && b.deferred, name: a.name || b.name };
  return a;
}
function sameFact(a, b) {
  for (const k in b) if (a[k] !== b[k] && !(typeof b[k] === 'object' && b[k] && a[k] && b[k].line === a[k].line && b[k].kind === a[k].kind)) return false;
  return true;
}

const nilable = (t) => !t || t.startsWith('*') || t.startsWith('map[') || t.startsWith('chan ') || t.startsWith('[]') || t === 'error' || t.startsWith('interface') || t === 'any' || t === 'func';

class FnSE {
  constructor(g, pf, report) {
    this.g = g;
    this.fn = g.fn;
    this.pf = pf;
    this.src = pf.src;
    this.report = report;
    this.unlockKeys = collectUnlocks(this.fn, this.src);
  }
  tracked(sym) { return isLocal(sym) && !sym.capturedWrite; }
  run() {
    const g = this.g;
    const inState = new Map();
    const visits = new Map();
    inState.set(g.entry.id, this.initialState());
    const work = [g.entry];
    const queued = new Set([g.entry.id]);
    let steps = 0;
    while (work.length && steps++ < 20000) {
      const n = work.shift();
      queued.delete(n.id);
      const v = (visits.get(n.id) || 0) + 1;
      visits.set(n.id, v);
      if (v > MAX_VISITS) continue;
      const st = inState.get(n.id);
      const outs = this.transfer(n, cloneState(st));
      for (const e of n.succ) {
        const out = outs.length === 1 ? outs[0].s : (outs.find((o) => o.cond === e.cond) || outs[0]).s;
        if (e.to === g.exit) this.checkExit(out, n);
        if (e.to === g.abort) continue;
        const cur = inState.get(e.to.id);
        if (!cur) { inState.set(e.to.id, cloneState(out)); if (!queued.has(e.to.id)) { queued.add(e.to.id); work.push(e.to); } continue; }
        if (joinInto(cur, out) && !queued.has(e.to.id)) { queued.add(e.to.id); work.push(e.to); }
      }
    }
  }
  initialState() {
    return {};
  }

  // ── transfer ──
  transfer(node, st) {
    const s = node.ast;
    if (!s || node.kind === 'join' || node.kind === 'entry' || node.kind === 'exit' || node.kind === 'select' || node.kind === 'abort') return [{ s: st }];
    if (node.kind === 'cond') {
      this.checkUses(s, st);
      return this.refine(s, st);
    }
    if (node.kind === 'case') {
      if (s.k === 'Case' && s.list && !(s.parent && s.parent.k === 'TypeSwitch')) for (const e of s.list) this.checkUses(e, st);
      return [{ s: st }];
    }
    if (node.kind === 'range') {
      this.checkUses(s.x, st);
      for (const v of [s.key, s.value]) { const x = A.strip(v); if (x && x.k === 'Ident' && this.tracked(x.sym)) st[`n:${x.sym.id}`] = { nil: false, nn: true, o: null }; }
      return [{ s: st }];
    }
    this.stmt(s, st);
    return [{ s: st }];
  }
  stmt(s, st) {
    switch (s.k) {
      case 'Assign': this.assign(s, st); return;
      case 'DeclStmt':
        for (const sp of s.decl.specs || []) {
          if (sp.k !== 'VarSpec') continue;
          for (const v of sp.values) this.checkUses(v, st);
          sp.names.forEach((nm, i) => {
            const sym = nm.sym;
            if (!this.tracked(sym)) return;
            const val = sp.values.length === sp.names.length ? sp.values[i] : null;
            if (!sp.values.length) {
              const t = sym.tstr || '';
              if (t.startsWith('*') || t.startsWith('map[') || t.startsWith('chan ')) st[`n:${sym.id}`] = { nil: true, nn: false, o: { line: nm.line, col: nm.col, kind: 'decl', name: sym.name } };
            } else if (val && A.isNil(val)) st[`n:${sym.id}`] = { nil: true, nn: false, o: { line: nm.line, col: nm.col, kind: 'assign', name: sym.name } };
            else st[`n:${sym.id}`] = { nil: false, nn: true, o: null };
            if (val && sp.values.length === sp.names.length) this.openResource(sym, null, val, st, nm);
          });
        }
        return;
      case 'Return':
        for (const r of s.results) { this.checkUses(r, st); this.escapes(r, st, 'return'); }
        return;
      case 'Defer': this.deferStmt(s, st); return;
      case 'Go': this.checkUses(s.call, st, true); this.escapes(s.call, st, 'go'); return;
      case 'ExprStmt': {
        const x = A.strip(s.x);
        this.checkUses(x, st);
        if (x && x.k === 'Call') { this.lockCall(x, st, s, false); this.closeCall(x, st); this.escapes(x, st, 'call'); }
        return;
      }
      case 'Send':
        this.checkUses(s.ch, st);
        this.checkUses(s.val, st);
        this.chanOp(s.ch, st, s);
        this.escapes(s.val, st, 'send');
        return;
      case 'IncDec': {
        this.checkUses(s.x, st);
        const x = A.strip(s.x);
        if (x && x.k === 'Index') this.mapWrite(x, st, s);
        return;
      }
      default:
        this.checkUses(s, st);
    }
  }
  assign(s, st) {
    for (const r of s.rhs) this.checkUses(r, st);
    for (const l of s.lhs) { const x = A.strip(l); if (x && x.k !== 'Ident') this.checkUses(x, st); }
    for (const l of s.lhs) { const x = A.strip(l); if (x && x.k === 'Index') this.mapWrite(x, st, s); }
    for (const r of s.rhs) this.escapes(r, st, 'assign');
    const single = s.rhs.length === 1 && s.lhs.length > 1;
    s.lhs.forEach((l, i) => {
      const x = A.strip(l);
      if (!x || x.k !== 'Ident' || !this.tracked(x.sym)) return;
      const sym = x.sym;
      const val = single ? null : s.rhs[i];
      if (val && A.isNil(val)) st[`n:${sym.id}`] = { nil: true, nn: false, o: { line: x.line, col: x.col, kind: 'assign', name: sym.name } };
      else st[`n:${sym.id}`] = { nil: false, nn: true, o: null };
      if (st[`r:${sym.id}`] && s.op !== ':=') delete st[`r:${sym.id}`];
      if (st[`p:${sym.id}`] !== undefined) delete st[`p:${sym.id}`];
    });
    if (s.op === '=' || s.op === ':=') {
      const l0 = A.strip(s.lhs[0]);
      if (l0 && l0.k === 'Ident' && this.tracked(l0.sym) && s.rhs.length === 1) {
        const errL = s.lhs.length > 1 ? A.strip(s.lhs[s.lhs.length - 1]) : null;
        this.openResource(l0.sym, errL && errL.k === 'Ident' ? errL.sym : null, s.rhs[0], st, l0);
      }
    }
    // &x passed anywhere may set x
    for (const r of s.rhs) this.addrTaken(r, st);
  }
  addrTaken(e, st) {
    A.walkNoFunc(e, (n) => {
      if (n.k === 'Unary' && n.op === '&') { const x = A.strip(n.x); if (x && x.k === 'Ident' && x.sym) st[`n:${x.sym.id}`] = { nil: false, nn: true, o: null }; }
      return true;
    });
  }

  // ── nil checks ──
  refine(e, st) {
    const t = cloneState(st);
    const f = st;
    const x = A.strip(e);
    if (x && x.k === 'Binary' && (x.op === '==' || x.op === '!=')) {
      let v = null;
      if (A.isNil(x.y)) v = A.strip(x.x);
      else if (A.isNil(x.x)) v = A.strip(x.y);
      if (v && v.k === 'Ident' && v.sym) {
        const isNilSide = x.op === '==' ? t : f;
        const nnSide = x.op === '==' ? f : t;
        if (this.tracked(v.sym)) {
          isNilSide[`n:${v.sym.id}`] = { nil: true, nn: false, o: { line: x.line, col: x.col, kind: 'check', name: v.sym.name } };
          nnSide[`n:${v.sym.id}`] = { nil: false, nn: true, o: null };
        }
        // err != nil: the resource opened together with err is nil
        const pk = `p:${v.sym.id}`;
        if (isNilSide[pk] !== undefined) {
          const rk = `r:${nnSide[pk]}`;
          if (nnSide[rk]) nnSide[rk] = { ...nnSide[rk], open: false, closed: true };
        }
      }
    }
    for (const s of [t, f]) this.addrTaken(e, s);
    this.addrTakenCalls(e, t);
    this.addrTakenCalls(e, f);
    return [{ cond: true, s: t }, { cond: false, s: f }];
  }
  addrTakenCalls(e, st) { void e; void st; }
  checkUses(e, st, inGo) {
    if (!e) return;
    A.walk(e, (n) => {
      if (n.k === 'FuncLit') return false;
      if (n.k === 'Selector') {
        const x = A.strip(n.x);
        if (x && x.k === 'Ident') { if (!this.nilSafeMethod(n, x)) this.deref(x, st, n); return false; }
        return true;
      }
      if (n.k === 'Star') {
        const x = A.strip(n.x);
        if (x && x.k === 'Ident') { this.deref(x, st, n); return false; }
        return true;
      }
      if (n.k === 'Unary' && n.op === '<-') { this.chanOp(n.x, st, n); return true; }
      return true;
    });
    void inGo;
  }
  // x.M(...) where M has a pointer receiver (or is unknown): calling it on nil is legal Go
  nilSafeMethod(sel, x) {
    const p = sel.parent;
    if (!p || p.k !== 'Call' || A.strip(p.fun) !== sel) return false;
    const t = (x.sym && x.sym.tstr) || '';
    const ms = this.pf.pkg.methods.get(t.replace(/^\*/, '').replace(/\[.*$/, ''));
    const m = ms && ms.get(sel.sel.name);
    if (!m) return true;
    const rt = A.strip(m.recv[0].type);
    return !!rt && rt.k === 'Star';
  }
  deref(x, st, at) {
    const sym = x.sym;
    if (!this.tracked(sym)) return;
    const t = sym.tstr || '';
    if (t && !nilable(t)) return;
    if (t.startsWith('map[') || t.startsWith('[]') || t.startsWith('chan ')) return;
    const k = `n:${sym.id}`;
    const f = st[k];
    if (f && f.nil && f.o) {
      const o = f.o;
      const rule = o.kind === 'check' ? 'nil-deref-after-check' : 'nil-dereference';
      const en = o.kind === 'check'
        ? `'${sym.name}' is dereferenced here but it was compared with nil at line ${o.line}, so it can be nil on this path.`
        : `'${sym.name}' is nil on this path (${o.kind === 'decl' ? 'declared without a value' : 'assigned nil'} at line ${o.line}) and is dereferenced here.`;
      const ko = o.kind === 'check'
        ? `'${sym.name}'은(는) ${o.line}행에서 nil과 비교했으므로 이 경로에서 nil일 수 있는데 여기서 역참조합니다.`
        : `'${sym.name}'은(는) 이 경로에서 nil입니다(${o.line}행에서 ${o.kind === 'decl' ? '값 없이 선언' : 'nil 대입'}). 여기서 역참조합니다.`;
      this.report(rule, at, en, ko, { events: [
        { line: o.line, tag: o.kind === 'check' ? 'path' : 'assign', text: o.kind === 'check' ? { en: `'${sym.name}' compared with nil`, ko: `'${sym.name}'을(를) nil과 비교` } : { en: `'${sym.name}' is nil`, ko: `'${sym.name}'은(는) nil` }, main: false },
        { line: at.line, tag: 'deref', text: { en: `'${sym.name}' dereferenced`, ko: `'${sym.name}' 역참조` }, main: true },
      ] });
      st[k] = { nil: false, nn: true, o: null };
    }
  }
  mapWrite(ix, st, at) {
    const m = A.strip(ix.x);
    if (!m || m.k !== 'Ident' || !this.tracked(m.sym)) return;
    const t = m.sym.tstr || '';
    if (!t.startsWith('map[')) return;
    const f = st[`n:${m.sym.id}`];
    if (f && f.nil && f.o) {
      this.report('nil-map-write', at, `Map '${m.sym.name}' is nil here (line ${f.o.line}); writing to it panics. Initialise it with make().`,
        `맵 '${m.sym.name}'은(는) 여기서 nil입니다(${f.o.line}행). 쓰면 panic이 납니다. make()로 초기화하세요.`,
        { events: [{ line: f.o.line, tag: 'assign', text: { en: `'${m.sym.name}' is nil`, ko: `'${m.sym.name}'은(는) nil` }, main: false }, { line: at.line, tag: 'deref', text: { en: 'write to nil map', ko: 'nil 맵에 쓰기' }, main: true }] });
      st[`n:${m.sym.id}`] = { nil: false, nn: true, o: null };
    }
  }
  chanOp(ch, st, at) {
    const c = A.strip(ch);
    if (!c || c.k !== 'Ident' || !this.tracked(c.sym)) return;
    const t = c.sym.tstr || '';
    if (!t.startsWith('chan ')) return;
    const f = st[`n:${c.sym.id}`];
    if (f && f.nil && !f.nn && f.o && f.o.kind !== 'check') {
      this.report('nil-channel-op', at, `Channel '${c.sym.name}' is nil here (line ${f.o.line}); sending or receiving blocks forever.`,
        `채널 '${c.sym.name}'은(는) 여기서 nil입니다(${f.o.line}행). 보내거나 받으면 영원히 멈춥니다.`);
      st[`n:${c.sym.id}`] = { nil: false, nn: true, o: null };
    }
  }

  // ── resources ──
  resourceKind(call) {
    const c = A.strip(call);
    if (!c || c.k !== 'Call') return null;
    const q = qualified(c);
    if (q && RESOURCES[q]) return RESOURCES[q];
    const f = A.strip(c.fun);
    if (f && f.k === 'Selector' && RESPONSE_METHODS.has(f.sel.name)) {
      const rt = typeOfExpr(f.x, this.pf.resolver);
      const d = A.dotted(f.x) || '';
      if (/http\.Client$/.test(rt) || d === 'http.DefaultClient' || (/client$/i.test(d) && f.sel.name === 'Do')) return 'response';
    }
    return null;
  }
  openResource(sym, errSym, rhs, st, at) {
    const kind = this.resourceKind(rhs);
    if (!kind) return;
    st[`r:${sym.id}`] = { open: true, closed: false, line: at.line, col: at.col, kind, name: sym.name };
    if (errSym && isLocal(errSym)) st[`p:${errSym.id}`] = sym.id;
  }
  closeTarget(call) {
    // x.Close() / x.Body.Close() -> x
    const c = A.strip(call);
    if (!c || c.k !== 'Call') return null;
    const f = A.strip(c.fun);
    if (!f || f.k !== 'Selector' || f.sel.name !== 'Close') return null;
    let x = A.strip(f.x);
    if (x && x.k === 'Selector' && x.sel.name === 'Body') x = A.strip(x.x);
    return x && x.k === 'Ident' && x.sym ? x.sym : null;
  }
  closeCall(call, st) {
    const sym = this.closeTarget(call);
    if (sym && st[`r:${sym.id}`]) st[`r:${sym.id}`] = { ...st[`r:${sym.id}`], open: false, closed: true };
  }
  deferStmt(s, st) {
    const call = A.strip(s.call);
    this.checkUses(call, st);
    if (!call || call.k !== 'Call') return;
    this.closeCall(call, st);
    this.lockCall(call, st, s, true);
    const f = A.strip(call.fun);
    if (f && f.k === 'FuncLit') {
      A.walk(f.body, (n) => {
        if (n.k === 'Call') { this.closeCall(n, st); this.lockCall(n, st, s, true); }
        return true;
      });
      this.escapes(call, st, 'defer');
    }
  }
  // the resource leaves the function's responsibility
  escapes(e, st, how) {
    if (!e) return;
    const visit = (n, parent, inFunc) => {
      if (!n || typeof n !== 'object') return;
      if (n.k === 'Ident') {
        const sym = n.sym;
        if (!sym) return;
        const k = `r:${sym.id}`;
        if (!st[k] || !st[k].open) return;
        let owned = true;
        if (parent && parent.k === 'Selector') owned = false;
        if (parent && parent.k === 'Call' && parent.fun !== n) {
          const q = qualified(parent);
          if (q && NON_OWNING.has(q)) owned = false;
        }
        if (inFunc && how === 'defer') owned = false;
        if (owned) st[k] = { ...st[k], open: false, closed: true };
        return;
      }
      if (n.k === 'FuncLit') { A.eachChild(n, (c) => visit(c, n, true)); return; }
      if (n.k === 'Selector') {
        // x.Body passed somewhere owns the body as well
        visit(n.x, n, inFunc);
        if (parent && (parent.k === 'Call' || parent.k === 'Return' || parent.k === 'KeyValue' || parent.k === 'CompositeLit') && parent.fun !== n && n.sel.name === 'Body') {
          const x = A.strip(n.x);
          if (x && x.k === 'Ident' && x.sym && st[`r:${x.sym.id}`] && !(parent.k === 'Call' && NON_OWNING.has(qualified(parent) || ''))) st[`r:${x.sym.id}`] = { ...st[`r:${x.sym.id}`], open: false, closed: true };
        }
        return;
      }
      A.eachChild(n, (c) => visit(c, n, inFunc));
    };
    visit(e, how === 'return' ? { k: 'Return' } : null, false);
  }

  // ── locks ──
  lockCall(call, st, at, deferred) {
    const f = A.strip(call.fun);
    if (!f || f.k !== 'Selector') return;
    const name = f.sel.name;
    if (!['Lock', 'Unlock', 'RLock', 'RUnlock'].includes(name) || call.args.length) return;
    const recv = A.norm(this.src, f.x);
    const key = `l:${recv}#${name.startsWith('R') ? 'r' : 'w'}`;
    const cur = st[key];
    if (name === 'Lock' || name === 'RLock') {
      if (deferred) return;
      if (cur && cur.held && !cur.free && name === 'Lock') {
        this.report('double-lock', at, `'${recv}' is locked again at this point while it is already held (locked at line ${cur.line}); this deadlocks.`,
          `'${recv}'은(는) 이미 잠긴 상태(${cur.line}행)에서 다시 잠급니다. 교착 상태가 됩니다.`,
          { events: [{ line: cur.line, tag: 'lock', text: { en: 'first lock', ko: '처음 잠금' }, main: false }, { line: at.line, tag: 'lock', text: { en: 'second lock', ko: '두 번째 잠금' }, main: true }] });
      }
      st[key] = { held: true, free: false, line: at.line, col: at.col, deferred: false, name: recv };
      return;
    }
    if (deferred) { if (cur) st[key] = { ...cur, deferred: true }; else st[key] = { held: false, free: true, line: at.line, col: at.col, deferred: true, name: recv }; return; }
    st[key] = { held: false, free: true, line: cur ? cur.line : at.line, col: cur ? cur.col : at.col, deferred: false, name: recv };
  }

  // ── function exit ──
  checkExit(st, node) {
    const exitLine = node.ast && node.ast.k === 'Return' ? node.ast.line : (this.fn.body.endLine || this.fn.line);
    for (const k in st) {
      const v = st[k];
      if (k[0] === 'r' && v.open) {
        const rule = v.kind === 'response' ? 'response-body-leak' : 'resource-leak';
        const what = v.kind === 'response' ? `The body of response '${v.name}'` : `'${v.name}'`;
        const whatKo = v.kind === 'response' ? `응답 '${v.name}'의 Body` : `'${v.name}'`;
        this.report(rule, { line: v.line, col: v.col }, `${what} opened here is not closed when the function returns at line ${exitLine}.`,
          `여기서 연 ${whatKo}을(를) ${exitLine}행에서 함수가 끝날 때 닫지 않습니다.`,
          { events: [{ line: v.line, tag: 'alloc', text: { en: `'${v.name}' opened`, ko: `'${v.name}' 열기` }, main: true }, { line: exitLine, tag: 'leak', text: { en: 'leaked on return', ko: '반환 시 누수' }, main: false }] });
        st[k] = { ...v, open: false };
      }
      if (k[0] === 'l' && v.held && !v.deferred && this.unlockKeys.has(k)) {
        this.report('missing-unlock', { line: v.line, col: v.col }, `'${v.name}' locked here is still held when the function returns at line ${exitLine}.`,
          `여기서 잠근 '${v.name}'이(가) ${exitLine}행에서 함수가 끝날 때도 잠겨 있습니다.`,
          { events: [{ line: v.line, tag: 'lock', text: { en: 'locked', ko: '잠금' }, main: true }, { line: exitLine, tag: 'path', text: { en: 'returns while locked', ko: '잠긴 채 반환' }, main: false }] });
      }
    }
  }
}

function collectUnlocks(fn, src) {
  const out = new Set();
  A.walkNoFunc(fn.body, (n) => {
    if (n.k === 'FuncLit') return false;
    if (n.k === 'Call') {
      const f = A.strip(n.fun);
      if (f && f.k === 'Selector' && (f.sel.name === 'Unlock' || f.sel.name === 'RUnlock') && !n.args.length) {
        const p = n.parent;
        if (p && p.k === 'Defer') return true;
        out.add(`l:${A.norm(src, f.x)}#${f.sel.name === 'RUnlock' ? 'r' : 'w'}`);
      }
    }
    return true;
  });
  return out;
}

module.exports = { FnSE };
