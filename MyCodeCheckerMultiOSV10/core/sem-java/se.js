'use strict';

// Path-sensitive symbolic execution over the CFG of one method, in the
// spirit of Java reference analyzer's engine. Symbolic values (ids) carry constraints:
//   n   'NULL' | 'NN' (not null) | 'MAYBE' (possibly null, from @Nullable)
//   b   true | false (boolean value)
//   z   known integer value          nz  known non-zero
//   opt 'P' | 'E'   (Optional present / empty)
//   res 'OPEN' | 'CLOSED' | 'ESC' | 'WRAPPED' | 'TWR'
//   stm 1 (fresh stream) | 2 (consumed)
// Locks are tracked per receiver text. Program states are deduplicated per
// node by their constraint picture, node visits and total steps are capped;
// when a cap is hit, "always true/false" verdicts of the method are dropped.
//
// Findings use rule ids (without family): null-dereference,
// optional-get-without-check, resource-leak, lock-not-released,
// condition-always-constant, gratuitous-expression, division-by-zero,
// nonnull-param-passed-null, nonnull-return-null, stream-reused,
// null-assertion-on-null (Kotlin).

const A = require('./ast');

const MAX_STEPS = 6000;
const NODE_CAP = 10;
const PAIR_CAP = 8;

const TRUE_SV = 2;
const FALSE_SV = 3;
const EMPTY = Object.freeze({});
const CANON = { [TRUE_SV]: Object.freeze({ b: true, n: 'NN' }), [FALSE_SV]: Object.freeze({ b: false, n: 'NN' }) };

const NULLABLE_ANNOS = ['Nullable', 'CheckForNull', 'NullableDecl', 'NullableType'];
const NONNULL_ANNOS = ['Nonnull', 'NonNull', 'NotNull', 'NonNullDecl'];

const RES_CTORS = new Set(['FileInputStream', 'FileOutputStream', 'FileReader', 'FileWriter', 'RandomAccessFile', 'ZipFile', 'JarFile',
  'Socket', 'ServerSocket', 'DatagramSocket', 'MulticastSocket', 'URLClassLoader', 'FileHandler']);
const PATH_CTORS = new Set(['PrintWriter', 'PrintStream', 'Formatter', 'Scanner']);
const WRAPPERS = new Set(['BufferedReader', 'BufferedWriter', 'InputStreamReader', 'OutputStreamWriter', 'BufferedInputStream',
  'BufferedOutputStream', 'DataInputStream', 'DataOutputStream', 'ObjectInputStream', 'ObjectOutputStream', 'PrintWriter', 'PrintStream',
  'ZipInputStream', 'ZipOutputStream', 'GZIPInputStream', 'GZIPOutputStream', 'Scanner', 'LineNumberReader', 'PushbackInputStream',
  'PushbackReader', 'CipherInputStream', 'CipherOutputStream', 'InflaterInputStream', 'DeflaterOutputStream', 'JarInputStream',
  'JarOutputStream', 'CheckedInputStream', 'CheckedOutputStream', 'Formatter']);
const FILES_RES = new Set(['newInputStream', 'newOutputStream', 'newBufferedReader', 'newBufferedWriter', 'lines', 'list', 'walk', 'find',
  'newByteChannel', 'newDirectoryStream']);
const KT_FILE_RES = new Set(['bufferedReader', 'bufferedWriter', 'inputStream', 'outputStream', 'reader', 'writer', 'printWriter']);
const STREAM_OPS = new Set(['filter', 'map', 'flatMap', 'mapToInt', 'mapToObj', 'mapToLong', 'mapToDouble', 'distinct', 'sorted', 'peek',
  'limit', 'skip', 'forEach', 'forEachOrdered', 'toArray', 'reduce', 'collect', 'min', 'max', 'count', 'anyMatch', 'allMatch', 'noneMatch',
  'findFirst', 'findAny', 'boxed', 'toList', 'takeWhile', 'dropWhile', 'sum', 'average', 'iterator']);
const STREAM_INTERMEDIATE = new Set(['filter', 'map', 'flatMap', 'mapToInt', 'mapToObj', 'mapToLong', 'mapToDouble', 'distinct', 'sorted',
  'peek', 'limit', 'skip', 'boxed', 'takeWhile', 'dropWhile']);
const PURE_RECV_TYPES = new Set(['String', 'Integer', 'Long', 'Double', 'Boolean', 'Character', 'Optional', 'BigDecimal', 'BigInteger',
  'List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet', 'StringBuilder', 'LocalDate', 'LocalDateTime', 'Instant', 'Duration', 'Pattern',
  'Matcher', 'Stream', 'Int']);
const PURE_STATIC = new Set(['Objects', 'Math', 'String', 'Integer', 'Long', 'Double', 'Boolean', 'Arrays', 'Collections', 'Optional',
  'List', 'Map', 'Set', 'Character', 'StrictMath', 'Stream', 'Collectors', 'TimeUnit', 'Duration', 'LocalDate', 'StringUtils']);
const EXIT_CALLS = new Set(['System.exit', 'Runtime.halt', 'exitProcess', 'fail', 'Assert.fail', 'Assertions.fail', 'Assertions.fail',
  'TestCase.fail', 'Fail.fail', 'error', 'TODO']);

class State {
  constructor() {
    this.env = new Map();
    this.cons = new Map();
    this.locks = new Map();
    this.rels = new Map();
    this.flag = 0;
    this.excp = false;
  }
  clone() {
    const s = new State();
    s.env = new Map(this.env);
    s.cons = new Map(this.cons);
    s.locks = new Map(this.locks);
    s.rels = new Map(this.rels);
    s.excp = this.excp;
    s.asrt = this.asrt;
    return s;
  }
}

function descr(c) {
  if (!c || c === EMPTY) return '';
  let s = '';
  if (c.n) s += c.n === 'NULL' ? 'N' : c.n === 'NN' ? 'n' : 'm';
  if (c.b !== undefined) s += c.b ? 'T' : 'F';
  if (c.z !== undefined) s += '#' + c.z;
  else if (c.lo !== undefined || c.hi !== undefined) s += '[' + (c.lo === undefined ? '' : c.lo) + ',' + (c.hi === undefined ? '' : c.hi) + ']';
  if (c.nz) s += '!0';
  if (c.opt) s += 'o' + c.opt;
  if (c.res) s += 'r' + c.res[0];
  if (c.stm) s += 's' + c.stm;
  return s;
}

class Engine {
  constructor(method, cfg, cx) {
    this.method = method;
    this.cfg = cfg;
    this.cx = cx; // { env, proj, clsInfo, lang, report(id, node, args, extra), on(id), untracked:Set, volatile:Set, alwaysThrows(name,argc) }
    this.kt = cx.lang === 'kt';
    this.nextSV = 10;
    this.incomplete = false;
    this.steps = 0;
    this.condStats = new Map();
    this.condKind = new Map();
    this.resInfo = new Map();
    this.reported = new Set();
    this.locals = cx.env.locals;
    this.keyCache = new Map();
    this.noStat = 0;
  }

  fresh() { return this.nextSV++; }

  getC(st, sv) {
    if (sv == null) return EMPTY;
    if (CANON[sv]) return CANON[sv];
    return st.cons.get(sv) || EMPTY;
  }

  // Add constraints; false on contradiction.
  setC(st, sv, patch) {
    if (sv == null) return true;
    const cur = this.getC(st, sv);
    if (CANON[sv]) {
      if (patch.b !== undefined && patch.b !== cur.b) return false;
      if (patch.n === 'NULL') return false;
      return true;
    }
    const next = Object.assign({}, cur);
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (v === undefined) continue;
      if (k === 'n') {
        if ((cur.n === 'NULL' && v === 'NN') || (cur.n === 'NN' && v === 'NULL')) return false;
        if (cur.n === 'NULL' && v === 'MAYBE') continue;
        if (cur.n === 'NN' && v === 'MAYBE') continue;
      } else if (k === 'b') {
        if (cur.b !== undefined && cur.b !== v) return false;
      } else if (k === 'z') {
        if (cur.z !== undefined && cur.z !== v) return false;
        if (cur.nz && v === 0) return false;
      } else if (k === 'nz') {
        if (cur.z === 0) return false;
      } else if (k === 'lo') {
        if (cur.lo !== undefined && cur.lo >= v) continue;
      } else if (k === 'hi') {
        if (cur.hi !== undefined && cur.hi <= v) continue;
      } else if (k === 'opt') {
        if (cur.opt && cur.opt !== v) return false;
      }
      next[k] = v;
    }
    if (next.n === 'NULL' && (next.z !== undefined || next.b !== undefined)) return false;
    if (next.lo !== undefined || next.hi !== undefined) {
      const lo = next.lo === undefined ? -Infinity : next.lo;
      const hi = next.hi === undefined ? Infinity : next.hi;
      if (lo > hi) return false;
      if (next.z !== undefined && (next.z < lo || next.z > hi)) return false;
      if (lo === hi && next.z === undefined) next.z = lo;
      if (lo > 0 || hi < 0) next.nz = true;
      if (next.nz && next.z === 0) return false;
    }
    st.cons.set(sv, next);
    return true;
  }

  stateKey(st) {
    const parts = [];
    const first = new Map();
    const names = [...st.env.keys()].sort();
    for (const k of names) {
      const sv = st.env.get(k);
      const d = descr(this.getC(st, sv));
      const alias = first.get(sv);
      if (alias === undefined) first.set(sv, k);
      if (d || alias !== undefined) parts.push(k + ':' + d + (alias !== undefined ? '=' + alias : ''));
    }
    for (const [rk, v] of st.rels) {
      const [a, op, b] = rk.split(' ');
      const na = first.get(Number(a));
      const nb = first.get(Number(b));
      if (na !== undefined && nb !== undefined) parts.push(na + op + nb + (v ? 'T' : 'F'));
    }
    let res = '';
    for (const [sv, c] of st.cons) if (c.res === 'OPEN') res += sv + ',';
    for (const [k, l] of st.locks) if (l.st === 'L') res += 'L' + k;
    for (const [sv, c] of st.cons) if (c.stm === 2) res += 's' + sv;
    return parts.join('|') + '/' + res;
  }

  // ── variables ──
  keyOf(e) {
    e = A.strip(e);
    if (!e) return null;
    if (e.k === 'Name') {
      if (this.locals.has(e.id)) return this.cx.untracked.has(e.id) ? null : e.id;
      if (this.isField(e.id)) return this.isVolatile(e.id) ? null : 'this.' + e.id;
      return null;
    }
    if (e.k === 'Sel' && e.o && e.o.k === 'This' && !e.o.q) {
      if (this.isVolatile(e.id)) return null;
      return this.isField(e.id) ? 'this.' + e.id : null;
    }
    return null;
  }

  isVolatile(name) {
    if (this.cx.volatile.has(name)) return true;
    const ci = this.cx.clsInfo;
    const f = ci && this.cx.proj.findField(ci, name);
    if (!f) return false;
    const fr = f.field;
    const t = fr.type ? A.typeName(fr.type) : '';
    return !!((fr.mods && fr.mods.has('volatile')) || (fr.field && A.hasAnno(fr.field, 'Volatile')) || /^Atomic/.test(t));
  }

  isField(name) {
    if (this.keyCache.has(name)) return this.keyCache.get(name);
    const ci = this.cx.clsInfo;
    const r = !!(ci && this.cx.proj.findField(ci, name));
    this.keyCache.set(name, r);
    return r;
  }

  read(st, key) {
    let sv = st.env.get(key);
    if (sv == null) {
      sv = this.fresh();
      st.env.set(key, sv);
    }
    return sv;
  }

  invalidateFields(st) {
    for (const k of [...st.env.keys()]) if (k.startsWith('this.')) st.env.delete(k);
  }

  // ── reporting ──
  report(id, node, args, extra) {
    if (!node) return;
    const k = id + ':' + node.line + ':' + node.col;
    if (this.reported.has(k)) return;
    this.reported.add(k);
    this.cx.report(id, node, args, extra);
  }

  // ── run ──
  run() {
    const start = new State();
    this.initParams(start);
    const seen = new Set();
    const visits = new Uint16Array(this.cfg.nodes.length);
    const work = [[this.cfg.entry, start]];
    while (work.length) {
      if (++this.steps > MAX_STEPS) { this.incomplete = true; break; }
      const [node, st] = work.pop();
      const key = node.id + '|' + this.stateKey(st);
      if (seen.has(key)) continue;
      seen.add(key);
      if (++visits[node.id] > NODE_CAP) { this.incomplete = true; continue; }
      this.step(node, st, work);
    }
    this.finish();
  }

  initParams(st) {
    for (const p of this.method.params || []) {
      const sv = this.fresh();
      if (A.hasAnno(p, NULLABLE_ANNOS)) st.cons.set(sv, { n: 'MAYBE', o: p.line, nullable: true });
      else if (A.hasAnno(p, NONNULL_ANNOS)) st.cons.set(sv, { n: 'NN' });
      if (!this.cx.untracked.has(p.name)) st.env.set(p.name, sv);
    }
  }

  push(work, node, st) {
    if (node) work.push([node, st]);
  }

  gc(st) {
    if (st.cons.size < 64 || st.cons.size < st.env.size * 3) return;
    const live = new Set(st.env.values());
    for (const [sv, c] of st.cons) if (!live.has(sv) && c.res !== 'OPEN') st.cons.delete(sv);
    for (const rk of [...st.rels.keys()]) {
      const [a, , b] = rk.split(' ');
      if (!live.has(Number(a)) || !live.has(Number(b))) st.rels.delete(rk);
    }
  }

  step(node, st0, work) {
    this.gc(st0);
    const st = st0.clone();
    switch (node.k) {
      case 'entry':
      case 'nop':
        for (const s of node.succ) this.push(work, s, st);
        return;
      case 'exit':
        this.checkExit(st, false);
        return;
      case 'exc':
        if (st.flag & 1) this.checkExit(st, true);
        return;
      case 'rethrow':
        if (node.esucc) for (const s of node.esucc) this.push(work, s, st);
        return;
      case 'catch': {
        if (node.name && !this.cx.untracked.has(node.name)) {
          const sv = this.fresh();
          st.cons.set(sv, { n: 'NN' });
          st.env.set(node.name, sv);
        }
        st.flag = 0;
        for (const s of node.succ) this.push(work, s, st);
        return;
      }
      case 'case': {
        for (const lab of node.labels || []) this.bindPattern(st, lab);
        for (const s of node.succ) this.push(work, s, st);
        return;
      }
      case 'foreach': {
        for (const v of node.vars) if (!this.cx.untracked.has(v.name)) st.env.set(v.name, this.fresh());
        for (const s of node.succ) this.push(work, s, st.clone());
        return;
      }
      default: break;
    }
    // exceptional successors get the pre-state
    if (node.esucc) {
      for (const s of node.esucc) {
        if (s.k === 'exc') continue;
        const pre = st0.clone();
        pre.flag = 0;
        pre.excp = true;
        this.push(work, s, pre);
      }
    }
    switch (node.k) {
      case 'eval': {
        if (node.assert) {
          // assert learns its condition (paths where it fails stop here)
          this.noStat++;
          const r = this.cond(st, node.e, false, null);
          this.noStat--;
          for (const s of r.t) { s.asrt = true; for (const n of node.succ) this.push(work, n, s); }
          return;
        }
        if (node.sync) this.invalidateFields(st);
        st.flag = 0;
        const pairs = this.ev(st, node.e, node.deref ? 'deref' : null);
        for (const [s, sv] of pairs) {
          if (node.deref) {
            if (!this.deref(s, sv, node.deref, node.deref, node.iterOf ? 'iter' : 'sync')) continue;
          }
          if (node.twr) this.markTwr(s, sv);
          for (const n of node.succ) this.push(work, n, s);
        }
        this.excExit(node, st0, pairs, work);
        return;
      }
      case 'local': {
        let states = [st];
        for (const v of node.vars) {
          const next = [];
          for (const s of states) {
            if (!v.init) {
              if (node.init) { if (!this.cx.untracked.has(v.name)) s.env.set(v.name, this.fresh()); }
              else if (node.delegate) { if (!this.cx.untracked.has(v.name)) s.env.set(v.name, this.fresh()); }
              next.push(s);
              continue;
            }
            for (const [s2, sv] of this.ev(s, v.init)) {
              if (node.twr) this.markTwr(s2, sv);
              if (!this.cx.untracked.has(v.name)) s2.env.set(v.name, sv);
              next.push(s2);
            }
          }
          states = next;
        }
        if (node.init) {
          // Kotlin destructuring: evaluate the initializer once
          const next = [];
          for (const s of states) for (const [s2] of this.ev(s, node.init)) next.push(s2);
          states = next;
        }
        for (const s of states) for (const n of node.succ) this.push(work, n, s);
        this.excExit(node, st0, states.map((s) => [s, null]), work);
        return;
      }
      case 'branch': {
        st.flag = 0;
        const r = this.cond(st, node.e, !node.when);
        if (!node.when) this.condKind.set(A.strip(node.e), node.loop ? 'loop' : 'if');
        for (const s of r.t) this.push(work, node.succ[0], s);
        for (const s of r.f) this.push(work, node.succ[1], s);
        this.excExit(node, st0, r.t.concat(r.f).map((s) => [s, null]), work);
        return;
      }
      case 'return': {
        st.flag = 0;
        const pairs = node.e ? this.ev(st, node.e) : [[st, null]];
        for (const [s, sv] of pairs) {
          if (node.e) {
            this.escape(s, sv);
            if (A.hasAnno(this.method, NONNULL_ANNOS) && this.getC(s, sv).n === 'NULL' && this.cx.on('nonnull-return-null')) {
              this.report('nonnull-return-null', node.e, [this.method.name]);
            }
          }
          for (const n of node.succ) this.push(work, n, s);
        }
        this.excExit(node, st0, pairs, work);
        return;
      }
      case 'throw': {
        const pairs = this.ev(st, node.e);
        for (const [s] of pairs) {
          if (node.esucc) for (const n of node.esucc) { if (n.k !== 'exc') { const x = s.clone(); x.excp = true; this.push(work, n, x); } }
        }
        return;
      }
      case 'switch': {
        const sel = A.strip(node.e);
        const hasNullCase = node.ast && node.ast.cases.some((c) => c.labels.some((l) => A.isNull(l)));
        const pairs = this.ev(st, node.e);
        for (const [s, sv] of pairs) {
          if (!this.kt && !hasNullCase && !this.deref(s, sv, sel, sel, 'switch')) continue;
          for (const n of node.succ) this.push(work, n, s.clone());
        }
        return;
      }
      default:
        for (const s of node.succ) this.push(work, s, st);
    }
  }

  // A call on an open resource may throw and leave the method with it open.
  excExit(node, st0, pairs, work) {
    if (!node.esucc) return;
    const exc = node.esucc.find((s) => s.k === 'exc');
    if (!exc) return;
    if (pairs.some(([s]) => s && (s.flag & 1))) {
      const pre = st0.clone();
      pre.flag = 1;
      this.push(work, exc, pre);
    }
  }

  bindPattern(st, lab) {
    if (!lab) return;
    if (lab.k === 'TypePat' && lab.name && !this.cx.untracked.has(lab.name)) {
      const sv = this.fresh();
      st.cons.set(sv, { n: 'NN' });
      st.env.set(lab.name, sv);
    } else if (lab.k === 'RecPat') {
      for (const s of lab.subs) this.bindPattern(st, s);
      if (lab.name) { const sv = this.fresh(); st.cons.set(sv, { n: 'NN' }); st.env.set(lab.name, sv); }
    }
  }

  markTwr(st, sv) {
    if (sv == null) return;
    const c = this.getC(st, sv);
    if (c.res) this.setRes(st, sv, 'TWR');
  }

  setRes(st, sv, res) {
    if (sv == null || CANON[sv]) return;
    const c = this.getC(st, sv);
    st.cons.set(sv, Object.assign({}, c, { res }));
  }

  escape(st, sv) {
    if (sv == null) return;
    const c = this.getC(st, sv);
    if (c.res === 'OPEN') this.setRes(st, sv, 'ESC');
  }

  checkExit(st, exceptional) {
    if (this.cx.on('resource-leak')) {
      for (const [sv, c] of st.cons) {
        if (c.res !== 'OPEN') continue;
        const info = this.resInfo.get(sv);
        if (!info) continue;
        if (exceptional && !info.flagged) info.excOnly = true;
        info.leak = true;
      }
    }
    if (!exceptional && this.cx.on('lock-not-released')) {
      for (const [k, l] of st.locks) {
        if (l.st === 'L') this.report('lock-not-released', l.node, [k]);
      }
    }
  }

  finish() {
    for (const [, info] of this.resInfo) {
      if (info.leak) this.report('resource-leak', info.node, [info.type]);
    }
    if (this.incomplete) return;
    const top = new Set();
    if (this.cx.on('condition-always-constant')) {
      for (const [e, st] of this.condStats) {
        if (!this.condKind.has(e)) continue;
        if (st.t === st.f || st.tainted) continue;
        if (this.isConstExpr(e)) continue;
        top.add(e);
        this.report('condition-always-constant', e, [st.t ? 'true' : 'false']);
      }
    }
    if (this.cx.on('gratuitous-expression')) {
      for (const [e, st] of this.condStats) {
        if (this.condKind.has(e)) continue;
        if (st.t === st.f || !st.operand || st.tainted) continue;
        if (top.has(st.parentTop)) continue;
        if (this.isConstExpr(e)) continue;
        this.report('gratuitous-expression', e, [st.t ? 'true' : 'false']);
      }
    }
  }

  isConstExpr(e) {
    e = A.strip(e);
    if (!e || e.synthetic) return true;
    if (e.k === 'Lit') return true;
    const lookup = this.cx.proj.constLookup(this.cx.clsInfo);
    if (A.constValue(e, lookup) !== undefined) return true;
    // conditions on constants like DEBUG, BuildConfig.DEBUG
    const d = A.dotted(e);
    if (d && /(^|\.)[A-Z][A-Z0-9_]+$/.test(d)) return true;
    if (e.k === 'Un' && e.op === '!') return this.isConstExpr(e.e);
    return false;
  }

  taint(e) {
    e = A.strip(e);
    if (!e || this.noStat) return;
    let s = this.condStats.get(e);
    if (!s) { s = { t: false, f: false, operand: false }; this.condStats.set(e, s); }
    s.tainted = true;
  }

  stat(e, outcome, operand, parentTop) {
    e = A.strip(e);
    if (!e || this.noStat) return;
    let s = this.condStats.get(e);
    if (!s) { s = { t: false, f: false, operand: !!operand, parentTop }; this.condStats.set(e, s); }
    if (outcome.t.length) s.t = true;
    if (outcome.f.length) s.f = true;
  }

  // ── dereference ──
  deref(st, sv, expr, at, how) {
    const c = this.getC(st, sv);
    if (c.n === 'NULL' || c.n === 'MAYBE') {
      if (!this.kt && !st.excp && this.cx.on('null-dereference')) {
        const name = A.dotted(expr) || A.shortText(this.cx.src, expr, 30) || 'expression';
        const events = [];
        if (c.o) events.push({ line: c.o, tag: 'path', text: { en: c.nullable ? `"${name}" can be null here` : `"${name}" is null here`, ko: `여기서 "${name}"이(가) null일 수 있습니다` } });
        events.push({ line: at.line, tag: 'deref', main: true, text: { en: `"${name}" is dereferenced`, ko: `"${name}"을(를) 역참조합니다` } });
        this.report('null-dereference', at, [name], { events });
      }
      if (c.n === 'NULL') return false;
    }
    if (sv != null && !CANON[sv] && c.n !== 'NN') this.setC(st, sv, { n: 'NN' });
    return true;
  }

  // ── expressions ──
  ev(st, e, ctx) {
    e = A.strip(e);
    if (!e) return [[st, null]];
    switch (e.k) {
      case 'Lit': {
        if (e.t === 'null') { const sv = this.fresh(); st.cons.set(sv, { n: 'NULL', o: e.line }); return [[st, sv]]; }
        if (e.t === 'bool') return [[st, e.v ? TRUE_SV : FALSE_SV]];
        const sv = this.fresh();
        if ((e.t === 'int' || e.t === 'long') && Number.isFinite(e.v)) st.cons.set(sv, { n: 'NN', z: e.v });
        else st.cons.set(sv, { n: 'NN' });
        return [[st, sv]];
      }
      case 'Tmpl': {
        const out = this.evSeq(st, e.parts.filter((p) => typeof p !== 'string'));
        return out.map(([s]) => [s, this.nn(s)]);
      }
      case 'Name': {
        const key = this.keyOf(e);
        if (!key) return [[st, this.fresh()]];
        return [[st, this.read(st, key)]];
      }
      case 'This':
      case 'Super':
      case 'ClassLit':
        return [[st, this.nn(st)]];
      case 'Sel': {
        const key = this.keyOf(e);
        if (key) return [[st, this.read(st, key)]];
        const out = [];
        for (const [s, o] of this.ev(st, e.o)) {
          if (e.safe) {
            const c = this.getC(s, o);
            if (c.n === 'NULL') { out.push([s, this.nullSV(s, e.line)]); continue; }
            out.push([s, this.fresh()]);
            continue;
          }
          if (!this.isStaticRef(e.o) && !this.deref(s, o, e.o, e)) continue;
          // BigInteger.ZERO / BigDecimal.ZERO
          if (e.id === 'ZERO' && /^(BigInteger|BigDecimal)$/.test(A.dotted(e.o) || '')) {
            const sv = this.fresh();
            s.cons.set(sv, { n: 'NN', z: 0, big: true });
            out.push([s, sv]);
            continue;
          }
          out.push([s, this.fresh()]);
        }
        return out;
      }
      case 'Idx': {
        const out = [];
        for (const [s, o] of this.ev(st, e.o)) {
          if (!this.kt && !this.deref(s, o, e.o, e)) continue;
          for (const [s2] of this.ev(s, e.i)) out.push([s2, this.fresh()]);
        }
        return out;
      }
      case 'Assign': return this.evAssign(st, e);
      case 'Un': return this.evUn(st, e);
      case 'Bin': return this.evBin(st, e);
      case 'Cond': {
        const r = this.cond(st, e.c, true);
        this.condKind.set(A.strip(e.c), 'ternary');
        const out = [];
        for (const s of r.t) out.push(...this.ev(s, e.a));
        for (const s of r.f) out.push(...this.ev(s, e.b));
        return this.cap(out);
      }
      case 'Cast': {
        const pairs = this.ev(st, e.e);
        if (e.safe) return pairs.map(([s]) => [s, this.fresh()]);
        return pairs;
      }
      case 'InstOf': {
        const pairs = this.ev(st, e.e);
        return pairs.map(([s, sv]) => {
          if (e.bind && !this.cx.untracked.has(e.bind)) { const b = this.fresh(); s.cons.set(b, { n: 'NN' }); s.env.set(e.bind, b); }
          if (e.pat) this.bindPattern(s, e.pat);
          void sv;
          return [s, this.fresh()];
        });
      }
      case 'New': return this.evNew(st, e);
      case 'Call': return this.evCall(st, e);
      case 'Lambda':
      case 'MRef':
        this.captureEscape(st, e);
        return [[st, this.nn(st)]];
      case 'ArrInit': {
        const out = this.evSeq(st, e.elems);
        return out.map(([s, svs]) => { for (const v of svs) this.escape(s, v); return [s, this.nn(s)]; });
      }
      case 'Return':
      case 'Throw':
        // Kotlin jump expressions: the path ends here
        if (e.e) for (const [s, sv] of this.ev(st, e.e)) if (e.k === 'Return') this.escape(s, sv);
        return [];
      case 'Break':
      case 'Continue':
        return [];
      case 'IfX':
      case 'Switch':
      case 'TryX':
      case 'TypeExpr':
      default:
        return [[this.opaque(st, e), this.fresh()]];
    }
  }

  nn(st) {
    const sv = this.fresh();
    st.cons.set(sv, { n: 'NN' });
    return sv;
  }

  nullSV(st, line) {
    const sv = this.fresh();
    st.cons.set(sv, { n: 'NULL', o: line });
    return sv;
  }

  cap(out) {
    if (out.length > PAIR_CAP) { this.incomplete = true; return out.slice(0, PAIR_CAP); }
    return out;
  }

  isStaticRef(o) {
    o = A.strip(o);
    if (!o) return false;
    if (o.k === 'Name') return !this.locals.has(o.id) && !this.isField(o.id);
    if (o.k === 'Sel') return !!A.dotted(o) && /^[a-z]/.test(A.dotted(o)) && !this.locals.has(A.dotted(o).split('.')[0]) && !this.isField(A.dotted(o).split('.')[0]);
    return false;
  }

  // Havoc everything an opaque expression might change.
  opaque(st, e) {
    A.forEach(e, (x) => {
      if (x.k === 'Assign' || (x.k === 'Un' && (x.op === '++' || x.op === '--'))) {
        const k = this.keyOf(x.k === 'Assign' ? x.t : x.e);
        if (k) st.env.delete(k);
      } else if (x.k === 'Local') {
        for (const v of x.vars) st.env.delete(v.name);
      } else if (x.k === 'Call' && !x.o) {
        this.invalidateFields(st);
      } else if (x.k === 'Call' && x.o) {
        const k = this.keyOf(x.o);
        if (k) {
          const sv = st.env.get(k);
          if (sv != null) {
            const c = this.getC(st, sv);
            if (c.res === 'OPEN' && (x.id === 'close' || x.id === 'use')) this.setRes(st, sv, 'CLOSED');
          }
        }
        if (!x.o || x.o.k === 'This') this.invalidateFields(st);
      } else if (x.k === 'Name') {
        const k = this.keyOf(x);
        if (k) { const sv = st.env.get(k); if (sv != null && this.getC(st, sv).res === 'OPEN' && x !== e) { /* reference inside opaque */ } }
      }
      return true;
    });
    // resources referenced inside the opaque expression escape
    A.forEach(e, (x) => {
      if (x.k === 'Name') {
        const k = this.keyOf(x);
        const sv = k ? st.env.get(k) : null;
        if (sv != null && this.getC(st, sv).res === 'OPEN') this.setRes(st, sv, 'ESC');
      }
      return true;
    });
    return st;
  }

  captureEscape(st, e) {
    A.forEach(e, (x) => {
      if (x.k === 'Name') {
        const k = this.keyOf(x);
        const sv = k ? st.env.get(k) : null;
        if (sv != null && this.getC(st, sv).res === 'OPEN') this.setRes(st, sv, 'ESC');
      }
      return true;
    });
  }

  // Evaluate a list of expressions left to right: [[st, [sv...]]]
  evSeq(st, list) {
    let acc = [[st, []]];
    for (const x of list) {
      const next = [];
      for (const [s, svs] of acc) for (const [s2, sv] of this.ev(s, x)) next.push([s2, svs.concat([sv])]);
      acc = this.cap(next);
    }
    return acc;
  }

  evAssign(st, e) {
    const out = [];
    const key = this.keyOf(e.t);
    const tgt = A.strip(e.t);
    // evaluate target object for field/array writes
    let pre = [[st, null]];
    if (!key && tgt) {
      if (tgt.k === 'Sel' && !(tgt.o.k === 'This')) {
        pre = [];
        for (const [s, o] of this.ev(st, tgt.o)) {
          if (!this.kt && !tgt.safe && !this.isStaticRef(tgt.o) && !this.deref(s, o, tgt.o, tgt)) continue;
          pre.push([s, null]);
        }
      } else if (tgt.k === 'Idx') {
        pre = [];
        for (const [s, o] of this.ev(st, tgt.o)) {
          if (!this.kt && !this.deref(s, o, tgt.o, tgt)) continue;
          for (const [s2] of this.ev(s, tgt.i)) pre.push([s2, null]);
        }
      }
    }
    for (const [s0] of pre) {
      for (const [s, v] of this.ev(s0, e.v)) {
        let val = v;
        if (e.op !== '=') {
          if ((e.op === '/=' || e.op === '%=') && this.isZero(s, v) && this.cx.on('division-by-zero')) {
            this.report('division-by-zero', e.v, [A.shortText(this.cx.src, e.v, 30)]);
            continue;
          }
          val = this.fresh();
          s.cons.set(val, { n: 'NN' });
        }
        if (key) s.env.set(key, val);
        else this.escape(s, val);
        if (key && key.startsWith('this.')) this.escape(s, val);
        out.push([s, val]);
      }
    }
    return out;
  }

  isZero(st, sv) {
    const c = this.getC(st, sv);
    return c.z === 0;
  }

  evUn(st, e) {
    if (e.op === '!') {
      const r = this.cond(st, e.e, false);
      return r.t.map((s) => [s, FALSE_SV]).concat(r.f.map((s) => [s, TRUE_SV]));
    }
    if (e.op === '!!') {
      const out = [];
      for (const [s, sv] of this.ev(st, e.e)) {
        const c = this.getC(s, sv);
        if (c.n === 'NULL') {
          if (this.cx.on('null-assertion-on-null')) this.report('null-assertion-on-null', e, [A.dotted(e.e) || A.shortText(this.cx.src, e.e, 30)]);
          continue;
        }
        if (sv != null && !CANON[sv]) this.setC(s, sv, { n: 'NN' });
        out.push([s, sv]);
      }
      return out;
    }
    if (e.op === '++' || e.op === '--') {
      const key = this.keyOf(e.e);
      const pairs = this.ev(st, e.e);
      return pairs.map(([s, old]) => {
        const nv = this.fresh();
        s.cons.set(nv, { n: 'NN' });
        if (key) s.env.set(key, nv);
        return [s, e.post ? old : nv];
      });
    }
    const pairs = this.ev(st, e.e);
    return pairs.map(([s, sv]) => {
      const c = this.getC(s, sv);
      const nv = this.fresh();
      if (e.op === '-' && c.z !== undefined) s.cons.set(nv, { n: 'NN', z: -c.z });
      else s.cons.set(nv, { n: 'NN' });
      return [s, nv];
    });
  }

  evBin(st, e) {
    const op = e.op;
    if (op === '&&' || op === '||' || op === '==' || op === '!=' || op === '===' || op === '!==' || op === '<' || op === '>' || op === '<=' || op === '>=') {
      if (op === '&&' || op === '||') {
        const r = this.cond(st, e, false);
        return r.t.map((s) => [s, TRUE_SV]).concat(r.f.map((s) => [s, FALSE_SV]));
      }
      // value context: no forking, known results only
      const out = [];
      for (const [s, a] of this.ev(st, e.l)) {
        for (const [s2, b] of this.ev(s, e.r)) {
          const v = this.compare(s2, op, a, b);
          out.push([s2, v === true ? TRUE_SV : v === false ? FALSE_SV : this.fresh()]);
        }
      }
      return this.cap(out);
    }
    if (op === '?:') {
      const out = [];
      for (const [s, a] of this.ev(st, e.l)) {
        const c = this.getC(s, a);
        if (c.n === 'NN') { out.push([s, a]); continue; }
        if (c.n === 'NULL') { out.push(...this.ev(s, e.r)); continue; }
        const s1 = s.clone();
        if (this.setC(s1, a, { n: 'NN' })) out.push([s1, a]);
        if (this.setC(s, a, { n: 'NULL' })) out.push(...this.ev(s, e.r));
      }
      return this.cap(out);
    }
    if (op === 'instanceof') return [[st, this.fresh()]];
    const out = [];
    for (const [s, a] of this.ev(st, e.l)) {
      for (const [s2, b] of this.ev(s, e.r)) {
        if ((op === '/' || op === '%') && this.isZero(s2, b) && !this.getC(s2, b).big) {
          if (this.cx.on('division-by-zero')) this.report('division-by-zero', e.r, [A.shortText(this.cx.src, e.r, 30)]);
          continue;
        }
        const nv = this.fresh();
        const ca = this.getC(s2, a);
        const cb = this.getC(s2, b);
        let z;
        if (ca.z !== undefined && cb.z !== undefined && A.isNumLit(e.l) && A.isNumLit(e.r)) {
          if (op === '+') z = ca.z + cb.z; else if (op === '-') z = ca.z - cb.z; else if (op === '*') z = ca.z * cb.z;
        }
        s2.cons.set(nv, z !== undefined && Number.isSafeInteger(z) ? { n: 'NN', z } : { n: 'NN' });
        out.push([s2, nv]);
      }
    }
    return this.cap(out);
  }

  range(c) {
    if (c.z !== undefined) return [c.z, c.z];
    return [c.lo === undefined ? -Infinity : c.lo, c.hi === undefined ? Infinity : c.hi];
  }

  // canonical relation key: [key, polarity] for a op b
  relKey(op, a, b) {
    switch (op) {
      case '==': case '===': return [Math.min(a, b) + ' == ' + Math.max(a, b), true];
      case '!=': case '!==': return [Math.min(a, b) + ' == ' + Math.max(a, b), false];
      case '<': return [a + ' < ' + b, true];
      case '>=': return [a + ' < ' + b, false];
      case '>': return [b + ' < ' + a, true];
      case '<=': return [b + ' < ' + a, false];
      default: return null;
    }
  }

  learnRel(st, op, a, b, truth) {
    if (a == null || b == null || a === b || CANON[a] || CANON[b]) return true;
    const rk = this.relKey(op, a, b);
    if (!rk) return true;
    const val = rk[1] === truth;
    const cur = st.rels.get(rk[0]);
    if (cur !== undefined && cur !== val) return false;
    st.rels.set(rk[0], val);
    const [x, rop, y] = rk[0].split(' ');
    if (rop === '<' && val) {
      st.rels.set(Math.min(+x, +y) + ' == ' + Math.max(+x, +y), false);
      const inv = y + ' < ' + x;
      if (st.rels.get(inv) === true) return false;
      st.rels.set(inv, false);
    }
    return true;
  }

  compare(st, op, a, b) {
    const ca = this.getC(st, a);
    const cb = this.getC(st, b);
    if (a != null && b != null && a !== b && !CANON[a] && !CANON[b]) {
      const rk = this.relKey(op, a, b);
      if (rk && st.rels.has(rk[0])) return st.rels.get(rk[0]) === rk[1];
      if (rk && (op === '==' || op === '!=' || op === '===' || op === '!==')) {
        const lt1 = st.rels.get(a + ' < ' + b);
        const lt2 = st.rels.get(b + ' < ' + a);
        if (lt1 === true || lt2 === true) return !rk[1];
      }
    }
    const eqOp = op === '==' || op === '===';
    const neOp = op === '!=' || op === '!==';
    if (eqOp || neOp) {
      let r;
      if (ca.n === 'NULL' && cb.n === 'NULL') r = true;
      else if ((ca.n === 'NULL' && cb.n === 'NN') || (ca.n === 'NN' && cb.n === 'NULL')) r = false;
      else if (ca.z !== undefined && cb.z !== undefined && !ca.big && !cb.big) r = ca.z === cb.z;
      else if (ca.b !== undefined && cb.b !== undefined) r = ca.b === cb.b;
      else if ((ca.z === 0 && cb.nz) || (cb.z === 0 && ca.nz)) r = false;
      else if (!ca.big && !cb.big && (ca.z !== undefined || cb.z !== undefined) && ca.n !== 'NULL' && cb.n !== 'NULL') {
        const [al, ah] = this.range(ca);
        const [bl, bh] = this.range(cb);
        if (ah < bl || bh < al) r = false;
      }
      if (r === undefined) return undefined;
      return eqOp ? r : !r;
    }
    if (ca.big || cb.big) return undefined;
    if (ca.z === undefined && cb.z === undefined && ca.lo === undefined && ca.hi === undefined && cb.lo === undefined && cb.hi === undefined) return undefined;
    const [al, ah] = this.range(ca);
    const [bl, bh] = this.range(cb);
    switch (op) {
      case '<': if (ah < bl) return true; if (al >= bh) return false; return undefined;
      case '>': if (al > bh) return true; if (ah <= bl) return false; return undefined;
      case '<=': if (ah <= bl) return true; if (al > bh) return false; return undefined;
      case '>=': if (al >= bh) return true; if (ah < bl) return false; return undefined;
      default: return undefined;
    }
  }

  // ── conditions ──
  // Returns { t: [states where e is true], f: [states where e is false] }.
  cond(st, e, top, parentTop) {
    e = A.strip(e);
    const pt = top ? e : parentTop;
    const r = this.cond0(st, e, pt);
    if (r.t.length + r.f.length > PAIR_CAP) {
      this.incomplete = true;
      r.t = r.t.slice(0, PAIR_CAP / 2);
      r.f = r.f.slice(0, PAIR_CAP / 2);
    }
    if (st.asrt) this.taint(e); else this.stat(e, r, !top, pt);
    return r;
  }

  cond0(st, e, pt) {
    if (!e) return { t: [st], f: [st.clone()] };
    if (e.k === 'Lit' && e.t === 'bool') return e.v ? { t: [st], f: [] } : { t: [], f: [st] };
    if (e.k === 'Un' && e.op === '!') {
      const r = this.cond(st, e.e, false, pt);
      return { t: r.f, f: r.t };
    }
    if (e.k === 'Bin') {
      const op = e.op;
      if (op === '&&') {
        const L = this.cond(st, e.l, false, pt);
        const t = [];
        const f = L.f.slice();
        for (const s of L.t) {
          const R = this.cond(s, e.r, false, pt);
          t.push(...R.t);
          f.push(...R.f);
        }
        return { t, f };
      }
      if (op === '||') {
        const L = this.cond(st, e.l, false, pt);
        const t = L.t.slice();
        const f = [];
        for (const s of L.f) {
          const R = this.cond(s, e.r, false, pt);
          t.push(...R.t);
          f.push(...R.f);
        }
        return { t, f };
      }
      if (op === '==' || op === '!=' || op === '===' || op === '!==') {
        const neg = op === '!=' || op === '!==';
        let r;
        if (A.isNull(e.r) || A.isNull(e.l)) r = this.nullCheck(st, A.isNull(e.r) ? e.l : e.r, e);
        else r = this.eqCheck(st, e);
        return neg ? { t: r.f, f: r.t } : r;
      }
      if (op === '<' || op === '>' || op === '<=' || op === '>=') return this.relCheck(st, e);
    }
    if (e.k === 'InstOf') {
      const t = [];
      const f = [];
      for (const [s, sv] of this.ev(st, e.e)) {
        const c = this.getC(s, sv);
        const st1 = s.clone();
        if (c.n !== 'NULL' && this.setC(st1, sv, { n: 'NN' })) {
          if (e.bind && !this.cx.untracked.has(e.bind)) { const b = this.fresh(); st1.cons.set(b, { n: 'NN' }); st1.env.set(e.bind, b); }
          if (e.pat) this.bindPattern(st1, e.pat);
          (e.neg ? f : t).push(st1);
        }
        (e.neg ? t : f).push(s);
      }
      return { t, f };
    }
    if (e.k === 'Call') {
      const r = this.callCond(st, e);
      if (r) return r;
    }
    // generic boolean
    const t = [];
    const f = [];
    for (const [s, sv] of this.ev(st, e)) {
      const c = this.getC(s, sv);
      if (c.b === true) { t.push(s); continue; }
      if (c.b === false) { f.push(s); continue; }
      const s1 = s.clone();
      if (this.setC(s1, sv, { b: true })) t.push(s1);
      if (this.setC(s, sv, { b: false })) f.push(s);
    }
    return { t, f };
  }

  nullCheck(st, x, at) {
    const t = [];
    const f = [];
    for (const [s, sv] of this.ev(st, x)) {
      const c = this.getC(s, sv);
      if (c.n === 'NULL') { t.push(s); continue; }
      if (c.n === 'NN') { f.push(s); continue; }
      const s1 = s.clone();
      if (this.setC(s1, sv, { n: 'NULL', o: at.line, nullable: false })) {
        const cc = s1.cons.get(sv);
        if (cc) s1.cons.set(sv, Object.assign({}, cc, { o: at.line, nullable: false }));
        t.push(s1);
      }
      if (this.setC(s, sv, { n: 'NN' })) f.push(s);
    }
    return { t, f };
  }

  eqCheck(st, e) {
    const t = [];
    const f = [];
    for (const [s, a] of this.ev(st, e.l)) {
      for (const [s2, b] of this.ev(s, e.r)) {
        const v = this.compare(s2, '==', a, b);
        if (v === true) { t.push(s2); continue; }
        if (v === false) { f.push(s2); continue; }
        const ca = this.getC(s2, a);
        const cb = this.getC(s2, b);
        const s1 = s2.clone();
        let okT = true;
        let okF = true;
        if (cb.z !== undefined && ca.z === undefined && !cb.big) { okT = this.setC(s1, a, { z: cb.z }); okF = this.excludeValue(s2, a, cb.z); }
        else if (ca.z !== undefined && cb.z === undefined && !ca.big) { okT = this.setC(s1, b, { z: ca.z }); okF = this.excludeValue(s2, b, ca.z); }
        else if (ca.z === undefined && cb.z === undefined && ca.b === undefined && cb.b === undefined) {
          okT = this.learnRel(s1, '==', a, b, true);
          okF = this.learnRel(s2, '==', a, b, false);
        }
        else if (cb.b !== undefined && ca.b === undefined) { okT = this.setC(s1, a, { b: cb.b }); okF = this.setC(s2, a, { b: !cb.b }); }
        else if (ca.b !== undefined && cb.b === undefined) { okT = this.setC(s1, b, { b: ca.b }); okF = this.setC(s2, b, { b: !ca.b }); }
        if (okT) t.push(s1);
        if (okF) f.push(s2);
      }
    }
    return { t, f };
  }

  excludeValue(st, sv, z) {
    const c = this.getC(st, sv);
    if (z === 0 && !this.setC(st, sv, { nz: true })) return false;
    if (c.lo !== undefined && c.lo === z) return this.setC(st, sv, { lo: z + 1 });
    if (c.hi !== undefined && c.hi === z) return this.setC(st, sv, { hi: z - 1 });
    return true;
  }

  // a op k (k constant): bounds for the true / false outcome
  bound(st, sv, op, k, truth) {
    let o = op;
    if (!truth) o = { '<': '>=', '>': '<=', '<=': '>', '>=': '<' }[op];
    switch (o) {
      case '<': return this.setC(st, sv, { hi: k - 1 });
      case '<=': return this.setC(st, sv, { hi: k });
      case '>': return this.setC(st, sv, { lo: k + 1 });
      case '>=': return this.setC(st, sv, { lo: k });
      default: return true;
    }
  }

  relCheck(st, e) {
    const t = [];
    const f = [];
    const flip = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
    const integral = (x) => { const ty = this.cx.env.typeOf(x); return !ty || /^(int|long|short|byte|char|Int|Long|Short|Byte|Integer)$/.test(ty); };
    for (const [s, a] of this.ev(st, e.l)) {
      for (const [s2, b] of this.ev(s, e.r)) {
        const v = this.compare(s2, e.op, a, b);
        if (v === true) { t.push(s2); continue; }
        if (v === false) { f.push(s2); continue; }
        const ca = this.getC(s2, a);
        const cb = this.getC(s2, b);
        const s1 = s2.clone();
        let okT = true;
        let okF = true;
        if (cb.z !== undefined && ca.z === undefined && !cb.big && integral(e.l)) {
          okT = this.bound(s1, a, e.op, cb.z, true);
          okF = this.bound(s2, a, e.op, cb.z, false);
        } else if (ca.z !== undefined && cb.z === undefined && !ca.big && integral(e.r)) {
          okT = this.bound(s1, b, flip[e.op], ca.z, true);
          okF = this.bound(s2, b, flip[e.op], ca.z, false);
        } else if (ca.z === undefined && cb.z === undefined) {
          okT = this.learnRel(s1, e.op, a, b, true);
          okF = this.learnRel(s2, e.op, a, b, false);
        }
        if (okT) t.push(s1);
        if (okF) f.push(s2);
      }
    }
    return { t, f };
  }

  callCond(st, e) {
    const id = e.id;
    const recv = A.dotted(e.o);
    const rs = A.simpleName(recv || '');
    // Optional.isPresent / isEmpty
    if ((id === 'isPresent' || id === 'isEmpty') && e.o && e.args.length === 0) {
      const ty = this.cx.env.typeOf(e.o);
      const out = { t: [], f: [] };
      let handled = false;
      for (const [s, sv] of this.ev(st, e.o)) {
        const c = this.getC(s, sv);
        if (ty !== 'Optional' && !c.opt) { out.t.push(s); out.f.push(s.clone()); continue; }
        handled = true;
        if (!this.deref(s, sv, e.o, e)) continue;
        const present = id === 'isPresent';
        if (c.opt === 'P') { (present ? out.t : out.f).push(s); continue; }
        if (c.opt === 'E') { (present ? out.f : out.t).push(s); continue; }
        const s1 = s.clone();
        this.setC(s1, sv, { opt: 'P' });
        this.setC(s, sv, { opt: 'E' });
        (present ? out.t : out.f).push(s1);
        (present ? out.f : out.t).push(s);
      }
      if (handled) return out;
      return null;
    }
    // null-safe string helpers
    const arg0 = e.args[0];
    let nnWhen = null;
    let nullWhen = null;
    let target = null;
    if (!e.o || /^(StringUtils|TextUtils|Strings|ObjectUtils|CollectionUtils|Objects)$/.test(rs)) {
      if (e.args.length >= 1) {
        target = arg0;
        if (/^(isNotEmpty|isNotBlank|hasText|hasLength|nonNull|isNotNull)$/.test(id)) nnWhen = true;
        else if (/^(isEmpty|isBlank|isNullOrEmpty|isNull)$/.test(id)) { nnWhen = false; if (id === 'isNull') nullWhen = true; }
      }
    } else if (this.kt && e.o && e.args.length === 0 && /^(isNullOrEmpty|isNullOrBlank)$/.test(id)) {
      target = e.o;
      nnWhen = false;
    } else if (e.o && id === 'equals' && e.args.length === 1 && (A.isStrLit(e.o) || A.isLit(e.o))) {
      target = arg0;
      nnWhen = true;
    }
    if (target && nnWhen !== null) {
      const pre = this.evSeq(st, e.o && !this.kt ? [] : []);
      void pre;
      const out = { t: [], f: [] };
      for (const [s, sv] of this.ev(st, target)) {
        const c = this.getC(s, sv);
        const nnSide = nnWhen ? out.t : out.f;
        const otherSide = nnWhen ? out.f : out.t;
        if (c.n === 'NULL') {
          if (nullWhen === true) out.t.push(s); else otherSide.push(s);
          continue;
        }
        const s1 = s.clone();
        if (this.setC(s1, sv, { n: 'NN' })) nnSide.push(s1);
        if (nullWhen === true) { const s2 = s.clone(); if (this.setC(s2, sv, { n: 'NULL', o: e.line })) out.t.push(s2); continue; }
        otherSide.push(s);
      }
      return out;
    }
    // Lock.tryLock()
    if (id === 'tryLock' && e.o) {
      const lk = this.lockKey(e);
      if (lk) {
        const out = { t: [], f: [] };
        for (const [s] of this.ev(st, e.o)) {
          const s1 = s.clone();
          s1.locks.set(lk, { st: 'L', node: e });
          out.t.push(s1);
          out.f.push(s);
        }
        return out;
      }
    }
    return null;
  }

  lockKey(e) {
    if (!e.o) return null;
    const o = A.strip(e.o);
    const ty = this.cx.env.typeOf(o);
    const txt = A.dotted(o) || (o.k === 'Call' && (o.id === 'readLock' || o.id === 'writeLock') ? A.shortText(this.cx.src, o, 60) : null);
    if (!txt) return null;
    if (ty && /^(Lock|ReentrantLock|ReadLock|WriteLock|StampedLock)$/.test(ty)) return txt;
    if (o.k === 'Call' && (o.id === 'readLock' || o.id === 'writeLock')) return txt;
    if (!ty && /lock$/i.test(A.simpleName(txt))) return txt;
    return null;
  }

  // ── calls ──
  evNew(st, e) {
    const out = [];
    const tname = A.typeName(e.type);
    for (const [s, args] of this.evSeq(st, e.args || [])) {
      if (e.body) this.captureEscape(s, e.body);
      if (e.init) for (const [s2] of this.ev(s, e.init)) void s2;
      const sv = this.fresh();
      s.cons.set(sv, { n: 'NN' });
      this.resourceCtor(s, sv, tname, e, args);
      this.invalidateFields(s);
      out.push([s, sv]);
    }
    return out;
  }

  resourceCtor(s, sv, tname, e, args) {
    const argNodes = e.args || [];
    let isRes = false;
    if (RES_CTORS.has(tname) && !(tname === 'Socket' && argNodes.length === 0) && !(tname === 'ServerSocket' && argNodes.length === 0)) isRes = true;
    let wrapped = null;
    if (WRAPPERS.has(tname) && args.length) {
      const c0 = this.getC(s, args[0]);
      if (c0.res === 'OPEN') { wrapped = args[0]; isRes = true; }
    }
    if (!isRes && PATH_CTORS.has(tname) && argNodes.length) {
      const a0 = A.strip(argNodes[0]);
      const t0 = this.cx.env.typeOf(a0);
      if (tname === 'Scanner') {
        if (t0 === 'File' || t0 === 'Path' || A.isCtor(a0, 'File')) isRes = true;
      } else if (t0 === 'String' || t0 === 'File' || A.isCtor(a0, 'File')) isRes = true;
    }
    // remaining args escape
    for (let i = 0; i < args.length; i++) {
      if (args[i] === wrapped) this.setRes(s, wrapped, 'WRAPPED');
      else this.escape(s, args[i]);
    }
    if (isRes && this.cx.on('resource-leak')) {
      const c = this.getC(s, sv);
      s.cons.set(sv, Object.assign({}, c, { res: 'OPEN' }));
      if (!this.resInfo.has(sv)) this.resInfo.set(sv, { node: e, type: tname });
      // wrapper creation inherits the leak report site
      if (wrapped != null) {
        const inner = this.resInfo.get(wrapped);
        if (inner) inner.wrappedBy = sv;
      }
    }
  }

  methodDecl(e) {
    const ci = this.cx.clsInfo;
    if (!ci) return null;
    let target = ci;
    if (e.o && !(e.o.k === 'This')) {
      const t = this.cx.env.typeOf(e.o);
      target = t ? this.cx.proj.info(t) : null;
      if (!target) return null;
    }
    const ms = this.cx.proj.findMethods(target, e.id).filter((m) => (m.params || []).length === e.args.length || (m.params.length && m.params[m.params.length - 1].varargs));
    return ms.length === 1 ? ms[0] : (ms.length && ms.every((m) => m === ms[0]) ? ms[0] : (ms[0] || null));
  }

  evCall(st, e) {
    const out = [];
    const recvPairs = e.o ? this.ev(st, e.o) : (e.callee ? this.ev(st, e.callee) : [[st, null]]);
    const recvDotted = A.dotted(e.o);
    const rs = A.simpleName(recvDotted || '');
    const full = (rs ? rs + '.' : '') + (e.id || '');
    for (const [s0, recv] of recvPairs) {
      let s = s0;
      if (e.o) {
        const rc = this.getC(s, recv);
        if (e.safe) {
          if (rc.n === 'NULL') { out.push([s, this.nullSV(s, e.line)]); continue; }
        } else if (!this.kt && !this.isStaticRef(e.o)) {
          if (!this.deref(s, recv, e.o, e)) continue;
        } else if (!this.isStaticRef(e.o) && recv != null && !CANON[recv] && rc.n !== 'NULL') {
          // Kotlin: a non-safe call proves the receiver non-null
          if (!this.kt || !this.ktNullTolerant(e.id)) this.setC(s, recv, { n: 'NN' });
        }
      }
      const lambdas = e.args.filter((a) => a.k === 'Lambda');
      for (const [s1, args] of this.evSeq(s, e.args)) {
        const r = this.callModel(s1, e, recv, args, full, rs, lambdas);
        for (const p of r) out.push(p);
      }
    }
    return this.cap(out);
  }

  ktNullTolerant(id) {
    return /^(isNullOrEmpty|isNullOrBlank|orEmpty|toString|let|also|apply|run|takeIf|takeUnless|equals|hashCode)$/.test(id || '');
  }

  callModel(s, e, recv, args, full, rs, lambdas) {
    const id = e.id;
    const rc = recv != null ? this.getC(s, recv) : EMPTY;
    // ends the path
    if (EXIT_CALLS.has(full) || (!e.o && (id === 'fail' || (this.kt && (id === 'error' || id === 'TODO' || id === 'exitProcess'))))) return [];
    if (!e.o && id && this.cx.alwaysThrows(id, e.args.length)) return [];
    // assertions / preconditions that prove a condition
    if ((/^(checkArgument|checkState|isTrue|assertTrue|require|check|assumeTrue|verify)$/.test(id) && (!e.o || /^(Preconditions|Assert|Assertions|Validate|Verify|Assume|Assumptions|Objects)$/.test(rs))) && e.args.length >= 1) {
      const r = this.condNoEval(s, e.args[0]);
      return r.t.map((x) => [x, this.fresh()]);
    }
    if ((/^(assertFalse|isFalse|assumeFalse)$/.test(id) && (!e.o || /^(Assert|Assertions|Validate|Assume|Assumptions)$/.test(rs))) && e.args.length >= 1) {
      const r = this.condNoEval(s, e.args[0]);
      return r.f.map((x) => [x, this.fresh()]);
    }
    if (/^(requireNonNull|checkNotNull|notNull|assertNotNull|requireNotNull|checkNotNullArgument|isNotNull|nonNull)$/.test(id) && e.args.length >= 1 &&
        (!e.o || /^(Objects|Preconditions|Assert|Assertions|Validate|Verify|Assume)$/.test(rs))) {
      const idx = id === 'assertNotNull' && e.args.length >= 2 && A.isStrLit(e.args[0]) ? 1 : 0;
      const sv = args[idx];
      const c = this.getC(s, sv);
      if (c.n === 'NULL') return [];
      if (sv != null && !CANON[sv]) this.setC(s, sv, { n: 'NN' });
      const ret = sv != null ? sv : this.nn(s);
      return [[s, ret]];
    }
    // null-safe helpers return non-null
    // Optional
    if (rs === 'Optional' && !this.locals.has(rs)) {
      const sv = this.fresh();
      if (id === 'empty') { s.cons.set(sv, { n: 'NN', opt: 'E' }); return [[s, sv]]; }
      if (id === 'of') { s.cons.set(sv, { n: 'NN', opt: 'P' }); return [[s, sv]]; }
      if (id === 'ofNullable') {
        const c = this.getC(s, args[0]);
        s.cons.set(sv, { n: 'NN', opt: c.n === 'NULL' ? 'E' : c.n === 'NN' ? 'P' : undefined });
        if (s.cons.get(sv).opt === undefined) s.cons.set(sv, { n: 'NN' });
        return [[s, sv]];
      }
    }
    if (e.o && (id === 'get' || id === 'getAsInt' || id === 'getAsLong' || id === 'getAsDouble') && e.args.length === 0) {
      const ty = this.cx.env.typeOf(e.o);
      if (rc.opt || ty === 'Optional' || ty === 'OptionalInt' || ty === 'OptionalLong' || ty === 'OptionalDouble' || this.optionalProducer(e.o)) {
        if (rc.opt !== 'P' && this.cx.on('optional-get-without-check')) {
          this.report('optional-get-without-check', e, [A.dotted(e.o) || A.shortText(this.cx.src, e.o, 30)]);
        }
        if (rc.opt === 'E') return [];
        if (recv != null && !CANON[recv]) this.setC(s, recv, { opt: 'P' });
        return [[s, this.nn(s)]];
      }
    }
    // streams
    if (e.o && recv != null && rc.stm && STREAM_OPS.has(id)) {
      if (rc.stm === 2) {
        if (this.cx.on('stream-reused')) this.report('stream-reused', e, [A.dotted(e.o) || 'stream']);
      } else if (!CANON[recv]) s.cons.set(recv, Object.assign({}, rc, { stm: 2 }));
    }
    // resources: close / use
    if (e.o && recv != null && rc.res === 'OPEN') {
      if (id === 'close' || id === 'use' || id === 'useLines' || id === 'closeQuietly') { this.setRes(s, recv, 'CLOSED'); }
      else if (id === 'getChannel' || id === 'getFD') { this.setRes(s, recv, 'ESC'); }
      else s.flag |= 1;
    }
    if (e.o && recv != null && (rc.res === 'TWR' || rc.res === 'ESC') && id !== 'close') s.flag &= ~1;
    // locks
    if (e.o && (id === 'lock' || id === 'lockInterruptibly' || id === 'unlock')) {
      const lk = this.lockKey(e);
      if (lk) {
        if (id === 'unlock') s.locks.set(lk, { st: 'U', node: e });
        else if (!this.lockishMethod()) s.locks.set(lk, { st: 'L', node: e });
      }
    }
    // arguments escape (passed to an unknown method)
    for (let i = 0; i < args.length; i++) {
      const c = this.getC(s, args[i]);
      if (c.res === 'OPEN') this.setRes(s, args[i], (id && /^close/.test(id)) ? 'CLOSED' : 'ESC');
    }
    for (const l of lambdas) this.captureEscape(s, l);
    // nonnull parameters
    if (this.cx.on('nonnull-param-passed-null') && id && !this.kt) {
      const nullArg = args.findIndex((a) => this.getC(s, a).n === 'NULL');
      if (nullArg >= 0) {
        const m = this.methodDecl(e);
        if (m && m.params && m.params[nullArg] && A.hasAnno(m.params[nullArg], NONNULL_ANNOS)) {
          this.report('nonnull-param-passed-null', e.args[nullArg], [m.params[nullArg].name, m.name]);
        }
      }
    }
    // field invalidation
    if (!e.o || A.strip(e.o).k === 'This' || A.strip(e.o).k === 'Super') this.invalidateFields(s);
    else {
      const ty = this.cx.env.typeOf(e.o);
      const statics = A.strip(e.o).k === 'Name' && PURE_STATIC.has(A.strip(e.o).id);
      if (!statics && !(ty && PURE_RECV_TYPES.has(ty))) {
        const ok = A.strip(e.o);
        // calls on locals do not touch our fields unless the local aliases one
        if (!(ok.k === 'Name' && this.locals.has(ok.id))) this.invalidateFields(s);
      }
    }
    // result
    const sv = this.fresh();
    let cons = null;
    if (e.o && (STREAM_INTERMEDIATE.has(id) && rc.stm) || (id === 'stream' || id === 'parallelStream') && e.args.length <= 1 ||
        ((rs === 'Stream' || rs === 'IntStream' || rs === 'LongStream') && /^(of|range|rangeClosed|iterate|generate|concat)$/.test(id))) {
      cons = { n: 'NN', stm: 1 };
    }
    // resource factories
    if (this.isResourceFactory(e, rs)) {
      cons = Object.assign(cons || {}, { n: 'NN', res: 'OPEN' });
      if (this.cx.on('resource-leak') && !this.resInfo.has(sv)) this.resInfo.set(sv, { node: e, type: this.resTypeName(e) });
    }
    // Kotlin constructor-like calls
    if (this.kt && !e.o && id && /^[A-Z]/.test(id)) {
      this.resourceCtor(s, sv, id, e, args);
      const c = this.getC(s, sv);
      cons = Object.assign({}, c, cons || {}, { n: 'NN' });
    }
    // nullable / nonnull in-project methods
    if (!this.kt && id) {
      const m = (e.o == null || A.strip(e.o).k === 'This') ? this.methodDecl(e) : null;
      if (m && A.hasAnno(m, NULLABLE_ANNOS)) cons = Object.assign(cons || {}, { n: 'MAYBE', o: e.line, nullable: true });
      else if (m && A.hasAnno(m, NONNULL_ANNOS)) cons = Object.assign(cons || {}, { n: 'NN' });
    }
    if (e.o && this.returnsNonNull(e, id, rs)) {
      cons = Object.assign(cons || {}, { n: (cons && cons.n) || 'NN' });
    }
    if (cons) s.cons.set(sv, cons);
    return [[s, sv]];
  }

  returnsNonNull(e, id, rs) {
    if (/^(getClass|stream|parallelStream|keySet|entrySet|toArray|chars|codePoints|toCharArray|getBytes|split|lines)$/.test(id)) return true;
    if (rs === 'String' && /^(valueOf|format|join|copyValueOf)$/.test(id)) return true;
    if (/^(Integer|Long|Double|Float|Short|Byte|Boolean|Character|BigInteger|BigDecimal)$/.test(rs) && /^(valueOf|toString|toHexString|toBinaryString)$/.test(id)) return true;
    if (/^(List|Set|Map|Collections|Arrays|Stream|Optional|Objects)$/.test(rs) && /^(of|copyOf|asList|emptyList|emptySet|emptyMap|unmodifiableList|unmodifiableSet|unmodifiableMap|singletonList|singleton|empty|ofNullable|requireNonNull|requireNonNullElse|toString|stream)$/.test(id)) return true;
    const ty = this.cx.env.typeOf(e.o);
    if ((ty === 'String' || A.isStrLit(e.o)) && /^(trim|strip|stripLeading|stripTrailing|substring|toUpperCase|toLowerCase|concat|replace|replaceAll|replaceFirst|repeat|intern|formatted|toString|indent|translateEscapes)$/.test(id)) return true;
    if ((ty === 'StringBuilder' || ty === 'StringBuffer') && /^(append|insert|reverse|toString|delete|deleteCharAt|replace)$/.test(id)) return true;
    return false;
  }

  condNoEval(s, e) {
    this.noStat++;
    try {
      return this.cond(s, e, false, null);
    } finally {
      this.noStat--;
    }
  }

  optionalProducer(o) {
    o = A.strip(o);
    return !!o && o.k === 'Call' && /^(findFirst|findAny|max|min|reduce)$/.test(o.id) && o.o && (o.id !== 'max' && o.id !== 'min' || o.args.length <= 1) && !!A.find(o.o, (x) => x.k === 'Call' && /^(stream|parallelStream|filter|map|of|sorted|flatMap)$/.test(x.id));
  }

  lockishMethod() {
    return /lock|acquire|begin|enter|start/i.test(this.method.name || '');
  }

  isResourceFactory(e, rs) {
    const id = e.id;
    if (!id || !e.o) return false;
    if (rs === 'DriverManager' && id === 'getConnection') return true;
    if (rs === 'Files' && FILES_RES.has(id)) return true;
    if (rs === 'FileChannel' && id === 'open') return true;
    if (this.kt && KT_FILE_RES.has(id) && e.args.length === 0) {
      const ot = A.strip(e.o);
      return A.isCtor(ot, 'File') || this.cx.env.typeOf(ot) === 'File';
    }
    const ty = this.cx.env.typeOf(e.o);
    if (id === 'getConnection' && (ty === 'DataSource' || /dataSource$/i.test(A.dotted(e.o) || ''))) return true;
    if ((id === 'createStatement' || id === 'prepareStatement' || id === 'prepareCall') && (ty === 'Connection' || /^(conn|connection|con|c)$/i.test(A.dotted(e.o) || ''))) return true;
    if (id === 'openStream' && (ty === 'URL' || A.isCtor(e.o, 'URL'))) return true;
    return false;
  }

  resTypeName(e) {
    const id = e.id;
    if (id === 'getConnection') return 'Connection';
    if (id === 'createStatement') return 'Statement';
    if (id === 'prepareStatement') return 'PreparedStatement';
    if (id === 'prepareCall') return 'CallableStatement';
    if (id === 'lines' || id === 'list' || id === 'walk' || id === 'find') return 'Stream';
    if (id === 'newBufferedReader' || id === 'bufferedReader') return 'BufferedReader';
    if (id === 'newBufferedWriter' || id === 'bufferedWriter') return 'BufferedWriter';
    if (/InputStream|inputStream|openStream/.test(id)) return 'InputStream';
    if (/OutputStream|outputStream/.test(id)) return 'OutputStream';
    return id;
  }
}

function runSE(method, cfg, cx) {
  const eng = new Engine(method, cfg, cx);
  eng.run();
  return { incomplete: eng.incomplete, steps: eng.steps };
}

module.exports = { runSE, NULLABLE_ANNOS, NONNULL_ANNOS };
