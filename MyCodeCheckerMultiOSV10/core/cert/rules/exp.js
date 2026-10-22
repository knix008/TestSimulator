'use strict';

// SEI CERT C — EXP: expressions.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/expr');
const { M, T, cf } = U;

// ------------------------------------------------------- EXP30-C sequencing
// seq(e) -> { mods: [{k, n}], reads: [{k, n}] }; conflicts are collected in ctx.hits.
function seqAnalysis(unit) {
  const E = () => ({ mods: [], reads: [] });
  const join = (...xs) => ({ mods: xs.flatMap((x) => x.mods), reads: xs.flatMap((x) => x.reads) });
  let hit = null;
  const check = (a, b) => {
    if (hit) return;
    for (const m of a.mods) {
      const o = b.mods.find((x) => x.k === m.k) || b.reads.find((x) => x.k === m.k);
      if (o) { hit = { m, o }; return; }
    }
    for (const m of b.mods) {
      const o = a.reads.find((x) => x.k === m.k);
      if (o) { hit = { m, o }; return; }
    }
  };
  const pairwise = (parts) => {
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) check(parts[i], parts[j]);
  };
  function lval(e) {
    e = U.skip(e);
    if (!e) return E();
    if (e.type === 'Identifier') return E();
    if (e.type === 'MemberExpr') return e.arrow ? seq(e.object) : lval(e.object);
    if (e.type === 'IndexExpr') { const a = seq(e.object), b = seq(e.index); check(a, b); return join(a, b); }
    if (e.type === 'UnaryExpr' && e.op === '*') return seq(e.arg);
    return seq(e);
  }
  function seq(e) {
    if (!e || typeof e !== 'object') return E();
    switch (e.type) {
      case 'ParenExpr': return seq(e.expr);
      case 'Identifier': { const k = U.key(unit, e); return k && e.symbol && (e.symbol.kind === 'variable' || e.symbol.kind === 'parameter') ? { mods: [], reads: [{ k, n: e }] } : E(); }
      case 'MemberExpr': { const r = e.arrow ? seq(e.object) : lval(e.object); const k = U.key(unit, e); if (k) r.reads.push({ k, n: e }); return r; }
      case 'IndexExpr': { const a = seq(e.object), b = seq(e.index); check(a, b); const r = join(a, b); const k = U.key(unit, e); if (k) r.reads.push({ k, n: e }); return r; }
      case 'UnaryExpr': {
        if (e.op === '++' || e.op === '--') {
          const r = lval(e.arg); const k = U.key(unit, e.arg);
          if (k) { r.mods.push({ k, n: e }); r.reads.push({ k, n: e }); }
          return r;
        }
        if (e.op === '&') return lval(e.arg);
        return seq(e.arg);
      }
      case 'AssignExpr': {
        const L = lval(e.left), R = seq(e.right);
        const k = U.key(unit, e.left);
        const tgt = { mods: k ? [{ k, n: e }] : [], reads: [] };
        check(join(L, tgt), { mods: R.mods, reads: [] });
        check(L, R);
        const r = join(L, R, tgt);
        if (e.op !== '=' && k) r.reads.push({ k, n: e });
        return r;
      }
      case 'BinaryExpr': {
        const a = seq(e.left), b = seq(e.right);
        if (e.op !== '&&' && e.op !== '||' && e.op !== ',') check(a, b);
        return join(a, b);
      }
      case 'ConditionalExpr': return join(seq(e.test), seq(e.consequent), seq(e.alternate));
      case 'CallExpr': { const parts = [seq(e.callee), ...(e.args || []).map(seq)]; pairwise(parts); return join(...parts); }
      case 'CastExpr': return e.arg ? seq(e.arg) : E();
      case 'SizeofExpr': case 'AlignofExpr': case 'LambdaExpr': case 'StmtExpr': case 'GenericSelection': case 'TypeName':
      case 'StringLiteral': case 'IntegerLiteral': case 'FloatingLiteral': case 'CharLiteral':
        return E();
      default: return join(...cf.childrenOf(e).filter((c) => c && c.loc && !/Stmt$|Decl$/.test(c.type)).map(seq));
    }
  }
  return (e) => { hit = null; seq(e); return hit; };
}

function fullExprs(unit) {
  const out = [];
  for (const s of U.nodes(unit, 'ExprStmt')) out.push(s.expr);
  for (const d of U.nodes(unit, 'VarDecl')) if (d.init && d.init.type !== 'InitList') out.push(d.init);
  for (const r of U.nodes(unit, 'ReturnStmt')) if (r.arg) out.push(r.arg);
  for (const s of U.nodes(unit, ['IfStmt', 'WhileStmt', 'DoStmt', 'SwitchStmt'])) if (s.cond && s.cond.type !== 'Declaration') out.push(s.cond);
  for (const s of U.nodes(unit, 'ForStmt')) { if (s.cond && s.cond.type !== 'Declaration') out.push(s.cond); if (s.inc) out.push(s.inc); }
  return out.filter(Boolean);
}

// ----------------------------------------------------------- dereferences
const DEREF_LIB = { memset: [0], memcpy: [0, 1], memmove: [0, 1], strcpy: [0, 1], strncpy: [0, 1], strcat: [0, 1], strncat: [0, 1], strlen: [0], strcmp: [0, 1], sprintf: [0], fgets: [0], fread: [0], fwrite: [0], snprintf: [0], strchr: [0], puts: [0], fputs: [0] };

// Is the Identifier use dereferenced right here? Returns a describing string or null.
function derefOf(u) {
  let n = u;
  let p = U.parent(n);
  while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) { n = p; p = U.parent(n); }
  if (!p) return null;
  if (p.type === 'UnaryExpr' && p.op === '*') return '*';
  if (p.type === 'IndexExpr' && U.pkey(n) === 'object') return '[]';
  if (p.type === 'MemberExpr' && p.arrow && U.pkey(n) === 'object') return '->';
  if (p.type === 'CallExpr' && U.pkey(n) !== 'callee') {
    const name = U.callName(p);
    const idx = p.args.indexOf(n);
    if (DEREF_LIB[name] && U.isLib(p, name) && DEREF_LIB[name].includes(idx)) return `${name}()`;
  }
  return null;
}

function isNullCompare(cond, sym) {
  const c = U.strip(cond);
  if (!c) return null;
  if (c.type === 'UnaryExpr' && c.op === '!' && U.idSym(c.arg) === sym) return 'null';
  if (c.type === 'BinaryExpr' && (c.op === '==' || c.op === '!=')) {
    const l = U.idSym(c.left) === sym && U.isNullConst(c.right);
    const r = U.idSym(c.right) === sym && U.isNullConst(c.left);
    if (l || r) return c.op === '==' ? 'null' : 'nonnull';
  }
  if (U.idSym(c) === sym) return 'nonnull';
  return null;
}

const ALLOCS = new Set(['malloc', 'calloc', 'realloc', 'aligned_alloc', 'strdup', 'strndup']);

// Base object key of a pointer argument: p, p + n, &p[n], &p->m.
function baseKey(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return baseKey(unit, e.left);
  if (e.type === 'UnaryExpr' && e.op === '&') {
    let o = U.strip(e.arg);
    while (o && (o.type === 'IndexExpr' || (o.type === 'MemberExpr' && !o.arrow))) o = U.strip(o.object);
    return U.key(unit, o);
  }
  return U.key(unit, e);
}

const smallTypes = (t) => {
  const c = t && T.canonical(t);
  if (!c) return null;
  if (c.kind === 'int' && ['bool', 'char', 'signed char', 'unsigned char', 'short', 'unsigned short', 'char8_t'].includes(c.name)) return c.name;
  if (c.kind === 'float' && c.name === 'float') return 'float';
  return null;
};

// Object designated by &x (or an array x), for casts of addresses.
function addrObject(e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '&') { const s = U.idSym(e.arg); return s && (s.kind === 'variable' || s.kind === 'parameter') ? s : null; }
  return null;
}

function castPtrOfAddr(e) {
  e = U.skip(e);
  if (!e || e.type !== 'CastExpr' || !e.arg) return null;
  const to = e.typeName && T.canonical(e.typeName.ctype);
  if (!to || to.kind !== 'pointer') return null;
  const s = addrObject(e.arg);
  return s ? { sym: s, to: T.canonical(to.to), cast: e } : null;
}

module.exports = [
  rule('EXP30-C', {
    langs: ['c'], risk: 'MPM', cwe: ['CWE-758'], approx: true,
    name: ['Do not depend on the order of evaluation for side effects', '부수 효과의 평가 순서에 의존하지 마세요'],
    why: ['Modifying an object twice, or modifying and reading it, without an intervening sequence point is undefined behavior (i = i++; a[i] = i++; f(i++, i)).', '순서점 없이 한 객체를 두 번 수정하거나 수정하면서 읽으면 정의되지 않은 동작입니다(i = i++; a[i] = i++; f(i++, i)).'],
    fix: ['Split the expression so each object is modified at most once and not read elsewhere in the same expression.', '식을 나누어 각 객체를 한 번만 수정하고 같은 식의 다른 곳에서 읽지 않게 하세요.'],
  }, {
    check(unit, api) {
      const analyze = seqAnalysis(unit);
      for (const e of fullExprs(unit)) {
        if (e.loc && e.loc.macro) continue;
        const hit = analyze(e);
        if (!hit) continue;
        const name = U.src(unit, hit.m.n.type === 'AssignExpr' ? hit.m.n.left : hit.m.n.type === 'UnaryExpr' ? hit.m.n.arg : hit.m.n);
        api.report(e, M(`'${name}' is modified and ${hit.o === hit.m ? 'modified' : 'accessed'} again without a sequence point in '${U.src(unit, e)}'.`, `'${U.src(unit, e)}' 에서 '${name}' 가 순서점 없이 수정되고 다시 사용됩니다.`));
      }
    },
  }),

  rule('EXP32-C', {
    risk: 'LLM', cwe: ['CWE-758'],
    name: ['Do not access a volatile object through a nonvolatile reference', 'volatile 객체를 volatile 이 아닌 참조로 접근하지 마세요'],
    why: ['Accessing a volatile object through a pointer without the volatile qualifier is undefined behavior; the compiler may cache or drop the accesses.', 'volatile 한정자가 없는 포인터로 volatile 객체에 접근하면 정의되지 않은 동작이며 컴파일러가 접근을 캐시하거나 없앨 수 있습니다.'],
    fix: ['Keep the volatile qualifier on every pointer to the object.', '그 객체를 가리키는 모든 포인터에 volatile 을 유지하세요.'],
  }, {
    check(unit, api) {
      const drops = (from, to) => {
        const f = from && T.nonRef(from), t = to && T.nonRef(to);
        if (!f || !t || T.decay(f).kind !== 'pointer' || t.kind !== 'pointer') return false;
        const fp = T.canonical(T.decay(f).to), tp = T.canonical(t.to);
        return !!fp && !!tp && fp.volatile && !tp.volatile;
      };
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (!c.arg || !c.typeName) continue;
        if (drops(c.arg.ctype, c.typeName.ctype)) api.report(c, M(`Cast '${U.src(unit, c)}' removes the volatile qualifier from '${U.src(unit, c.arg)}'.`, `캐스트 '${U.src(unit, c)}' 가 '${U.src(unit, c.arg)}' 의 volatile 한정자를 없앱니다.`));
      }
      for (const cv of X.conversions(unit)) {
        if (U.skip(cv.expr) && U.skip(cv.expr).type === 'CastExpr') continue;
        if (drops(cv.expr.ctype, cv.to)) api.report(cv.node, M(`'${U.src(unit, cv.expr)}' points to volatile data but is converted to non-volatile ${U.tstr(cv.to)} for ${cv.what}.`, `volatile 데이터를 가리키는 '${U.src(unit, cv.expr)}' 가 ${cv.whatKo} 에서 volatile 이 아닌 ${U.tstr(cv.to)} 로 변환됩니다.`));
      }
    },
  }),

  rule('EXP33-C', {
    risk: 'HPM', cwe: ['CWE-457', 'CWE-908'], sec: true, approx: true, deep: 'absint:UNINIT', checker: 'UNINIT',
    name: ['Do not read uninitialized memory', '초기화되지 않은 메모리를 읽지 마세요'],
    why: ['An automatic variable without an initializer holds an indeterminate value; reading it is undefined behavior and may leak stale data.', '초기값 없는 자동 변수는 값이 정해지지 않아 읽으면 정의되지 않은 동작이며 이전 데이터가 새어 나갈 수 있습니다.'],
    fix: ['Initialize the variable at its declaration or assign it on every path before use.', '선언할 때 초기화하거나 사용 전 모든 경로에서 값을 대입하세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'VarDecl')) {
        const s = d.symbol;
        if (d.init || !s || s.kind !== 'variable' || s.storage !== 'automatic') continue;
        const t = d.ctype && T.canonical(d.ctype);
        if (!t || !(T.isArithmetic(t) || t.kind === 'pointer' || t.kind === 'enum')) continue;
        if (/va_list/.test(U.tstr(d.ctype))) continue;
        { const f = U.enclosingFn(d); if (f && U.hasParseError(f.body)) continue; }
        const decl = U.parent(d);
        if (!decl || decl.type !== 'Declaration' || !U.parent(decl) || U.parent(decl).type !== 'CompoundStmt') continue;
        let done = false;
        for (const st of U.following(decl)) {
          if (done) break;
          const uses = X.usesIn(s, st).filter((u) => !X.unevaluated(u, st));
          if (!uses.length) continue;
          if (!X.STRAIGHT.has(st.type)) break;
          for (const u of uses) {
            const k = X.useKind(u);
            if (k === 'address') { done = true; break; }
            if (k === 'write') {
              // x = expr reading x
              let a = U.parent(u); while (a && a.type === 'ParenExpr') a = U.parent(a);
              const rd = a && a.type === 'AssignExpr' ? X.usesIn(s, a.right)[0] : null;
              if (rd) api.report(rd, M(`'${d.name}' is read before it is initialized.`, `'${d.name}' 를 초기화하기 전에 읽습니다.`));
              done = true; break;
            }
            const p = U.parent(u);
            if (p && p.type === 'CallExpr' && U.pkey(u) !== 'callee') {
              const ft = X.paramTypes(p);
              const i = p.args.indexOf(u);
              const pt = ft && ft.params && ft.params[i];
              if (unit.lang === 'cpp' && (!ft || (pt && T.canonical(pt).kind === 'reference'))) { done = true; break; }
            }
            if (p && p.type === 'AsmStmt') { done = true; break; }
            api.report(u, M(`'${d.name}' is used before it is initialized.`, `'${d.name}' 를 초기화하기 전에 사용합니다.`));
            done = true; break;
          }
        }
      }
    },
  }),

  rule('EXP34-C', {
    risk: 'HLM', cwe: ['CWE-476', 'CWE-690'], sec: true, approx: true, deep: 'absint:NULL_DEREF', checker: 'NULL_RETURNS',
    name: ['Do not dereference null pointers', '널 포인터를 역참조하지 마세요'],
    why: ['Allocation functions return NULL on failure; dereferencing the result without a check (or a pointer just found to be NULL) crashes or corrupts memory.', '할당 함수는 실패하면 NULL 을 반환합니다. 확인 없이 결과를 역참조하거나 방금 NULL 로 판정된 포인터를 역참조하면 충돌이나 메모리 손상이 생깁니다.'],
    fix: ['Check the pointer against NULL before every dereference and handle the failure.', '역참조 전에 포인터를 NULL 과 비교하고 실패를 처리하세요.'],
  }, {
    check(unit, api) {
      // (a) allocation result used without a check
      for (const c of U.libCalls(unit, ALLOCS)) {
        const r = U.resultUse(c);
        if (r.kind !== 'var' || !r.sym) continue;
        const s = r.sym;
        const stmt = U.stmtOf(c);
        if (!stmt) continue;
        let stop = false;
        for (const st of U.following(stmt)) {
          if (stop) break;
          const uses = X.usesIn(s, st);
          if (!uses.length) continue;
          for (const u of uses) {
            if (X.unevaluated(u, st)) continue;
            const pc = U.parent(u);
            if (U.inCondition(u) || (pc && pc.type === 'CallExpr' && /assert|check|require|verify/i.test(U.callName(pc) || ''))) { stop = true; break; }
            const k = X.useKind(u);
            if (k === 'write' || k === 'address') { stop = true; break; }
            const how = derefOf(u);
            if (how) {
              api.report(u, M(`'${s.name}' from ${U.callName(c)}() (line ${c.loc.line}) is dereferenced (${how}) without a NULL check.`, `${U.callName(c)}() (${c.loc.line}행) 의 결과 '${s.name}' 를 NULL 확인 없이 역참조(${how})합니다.`), { events: [{ line: c.loc.line, tag: 'alloc', text: M(`${U.callName(c)}() may return NULL`, `${U.callName(c)}() 는 NULL 을 반환할 수 있습니다`), main: false }, { line: u.loc.line, tag: 'deref', text: M(`'${s.name}' dereferenced`, `'${s.name}' 역참조`), main: true }] });
              stop = true; break;
            }
            if (pc && pc.type === 'CallExpr' || pc && pc.type === 'ReturnStmt') { stop = true; break; }
          }
          if (!stop && !X.STRAIGHT.has(st.type) && uses.length) stop = true;
        }
      }
      // (b) dereference inside the branch where the pointer is known to be NULL
      for (const ifs of U.nodes(unit, 'IfStmt')) {
        if (!ifs.cond || ifs.cond.type === 'Declaration') continue;
        const ids = cf.findAll(ifs.cond, 'Identifier');
        for (const id of ids) {
          const s = id.symbol;
          if (!s || (s.kind !== 'variable' && s.kind !== 'parameter')) continue;
          const t = s.type && T.canonical(s.type);
          if (!t || t.kind !== 'pointer') continue;
          const k = isNullCompare(ifs.cond, s);
          if (!k) continue;
          const branch = k === 'null' ? ifs.then : ifs.else;
          if (!branch) continue;
          for (const u of X.usesIn(s, branch)) {
            if (X.unevaluated(u, branch)) continue;
            const uk = X.useKind(u);
            if (uk === 'write' || uk === 'address') break;
            const how = derefOf(u);
            if (how) {
              api.report(u, M(`'${s.name}' is dereferenced (${how}) in the branch where it is NULL (condition '${U.src(unit, ifs.cond)}').`, `'${s.name}' 가 NULL 인 분기(조건 '${U.src(unit, ifs.cond)}')에서 역참조(${how})됩니다.`));
              break;
            }
          }
          break;
        }
      }
    },
  }),

  rule('EXP35-C', {
    langs: ['c'], risk: 'LPL', cwe: ['CWE-758'], approx: true,
    name: ['Do not modify objects with temporary lifetime', '임시 수명을 가진 객체를 수정하지 마세요'],
    why: ['An array member of a structure returned by a function lives only until the end of the full expression; modifying it or keeping a pointer to it is undefined behavior.', '함수가 반환한 구조체의 배열 멤버는 그 전체 식이 끝날 때까지만 살아 있어 수정하거나 포인터를 보관하면 정의되지 않은 동작입니다.'],
    fix: ['Store the returned structure in a local variable first and use that.', '반환된 구조체를 먼저 지역 변수에 저장해 사용하세요.'],
  }, {
    check(unit, api) {
      const tempArray = (e) => {
        let t = U.strip(e), sawArr = false;
        while (t && (t.type === 'IndexExpr' || (t.type === 'MemberExpr' && !t.arrow))) {
          if (t.type === 'IndexExpr') { const ot = X.ctypeOf(t.object); if (ot && ot.kind === 'array') sawArr = true; else return null; }
          t = U.strip(t.object);
        }
        return sawArr && t && t.type === 'CallExpr' && X.recordOf(t.ctype) ? t : null;
      };
      for (const n of U.nodes(unit, ['AssignExpr', 'UnaryExpr'])) {
        const tgt = n.type === 'AssignExpr' ? n.left : (n.op === '++' || n.op === '--') ? n.arg : null;
        const call = tgt && tempArray(tgt);
        if (call) api.report(n, M(`'${U.src(unit, tgt)}' modifies an array in the temporary object returned by ${U.callName(call) || 'a call'}().`, `'${U.src(unit, tgt)}' 가 ${U.callName(call) || '함수'}() 가 반환한 임시 객체의 배열을 수정합니다.`));
      }
      for (const cv of X.conversions(unit)) {
        const e = U.strip(cv.expr);
        if (!e || e.type !== 'MemberExpr' || e.arrow) continue;
        const et = X.ctypeOf(e);
        const o = U.strip(e.object);
        if (et && et.kind === 'array' && o && o.type === 'CallExpr' && X.recordOf(o.ctype) && T.canonical(cv.to).kind === 'pointer') {
          api.report(cv.node, M(`${cv.what} keeps a pointer to array '${e.member}' of the temporary returned by ${U.callName(o) || 'a call'}(), which dies at the end of the expression.`, `${cv.whatKo} 가 ${U.callName(o) || '함수'}() 가 반환한 임시 객체의 배열 '${e.member}' 를 가리켜, 식이 끝나면 무효가 됩니다.`));
        }
      }
    },
  }),

  rule('EXP36-C', {
    risk: 'LPM', cwe: ['CWE-704'], approx: true,
    name: ['Do not cast pointers into more strictly aligned pointer types', '더 엄격하게 정렬된 포인터 형으로 캐스트하지 마세요'],
    why: ['Converting a pointer to a type with stricter alignment than the pointed-to object is undefined behavior and faults on some CPUs.', '가리키는 객체보다 정렬 요구가 엄격한 형으로 포인터를 변환하면 정의되지 않은 동작이며 일부 CPU 에서는 예외가 발생합니다.'],
    fix: ['Copy the bytes with memcpy into a properly typed object, or align the buffer (alignas / malloc).', 'memcpy 로 올바른 형의 객체에 복사하거나 버퍼를 정렬하세요(alignas / malloc).'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (!c.arg || !c.typeName || c.kind === 'static_cast' || c.kind === 'dynamic_cast') continue;
        const to = T.canonical(c.typeName.ctype);
        const fromT = c.arg.ctype && T.decay(T.nonRef(c.arg.ctype));
        if (!to || to.kind !== 'pointer' || !fromT || fromT.kind !== 'pointer') continue;
        const a = T.canonical(fromT.to), b = T.canonical(to.to);
        if (!a || !b || T.isVoid(a) || T.isVoid(b) || T.isUnknown(a) || T.isUnknown(b) || a.kind === 'function' || b.kind === 'function') continue;
        let al, bl;
        try { al = T.alignOf(a, unit.target); bl = T.alignOf(b, unit.target); } catch (_) { continue; }
        if (!al || !bl || bl <= al) continue;
        // the source object itself may be suitably aligned
        const inner = U.strip(c.arg);
        const os = U.idSym(inner && inner.type === 'UnaryExpr' && inner.op === '&' ? inner.arg : inner);
        if (os && os.decls && os.decls.some((d) => d.specs && d.specs.alignas && d.specs.alignas.length)) continue;
        api.report(c, M(`Cast of '${U.src(unit, c.arg)}' from ${U.tstr(fromT)} (alignment ${al}) to ${U.tstr(to)} (alignment ${bl}) increases the required alignment.`, `'${U.src(unit, c.arg)}' 를 ${U.tstr(fromT)}(정렬 ${al})에서 ${U.tstr(to)}(정렬 ${bl})로 캐스트해 정렬 요구가 커집니다.`));
      }
    },
  }),

  rule('EXP37-C', {
    langs: ['c'], risk: 'MPH', cwe: ['CWE-628', 'CWE-685'], approx: true,
    name: ['Call functions with the correct number and type of arguments', '함수를 올바른 개수와 형의 인수로 호출하세요'],
    why: ['Calling a function with the wrong number of arguments, or through a declaration without a prototype, is undefined behavior and is not diagnosed.', '인수 개수가 틀리거나 원형 없는 선언으로 함수를 호출하면 정의되지 않은 동작이며 진단되지 않습니다.'],
    fix: ['Declare a full prototype (use (void) for no parameters) and pass exactly the declared arguments.', '완전한 원형을 선언하고(매개변수가 없으면 (void)) 선언된 인수를 정확히 넘기세요.'],
  }, {
    check(unit, api) {
      for (const c of U.nodes(unit, 'CallExpr')) {
        const s = c.calleeSymbol;
        if (!s || s.kind !== 'function' || X.implicitFn(s) || U.isMemberCall(c)) continue;
        if (c.loc.macro) continue;
        const ft = s.type && T.canonical(s.type);
        if (!ft || ft.kind !== 'function') continue;
        const n = c.args.length;
        const name = s.name;
        if (ft.prototype) {
          const want = ft.params.length;
          if ((!ft.variadic && n !== want) || (ft.variadic && n < want)) {
            api.report(c, M(`${name}() is called with ${n} argument(s) but its prototype declares ${want}${ft.variadic ? ' or more' : ''}.`, `${name}() 를 인수 ${n}개로 호출하지만 원형은 ${want}개${ft.variadic ? ' 이상' : ''}를 선언합니다.`));
          }
          continue;
        }
        const def = U.calleeDef(c, api.project);
        if (def && def.params) {
          const want = def.params.length;
          const varargs = def.variadic;
          if ((!varargs && n !== want) || (varargs && n < want)) {
            api.report(c, M(`${name}() is called with ${n} argument(s) but is defined with ${want} parameter(s) (no prototype in scope).`, `${name}() 를 인수 ${n}개로 호출하지만 정의는 매개변수 ${want}개입니다(원형 없음).`));
          }
          continue;
        }
        if (n > 0) api.report(c, M(`${name}() is called through a declaration without a prototype; argument types are not checked.`, `${name}() 를 원형 없는 선언으로 호출해 인수 형이 검사되지 않습니다.`));
      }
    },
  }),

  rule('EXP39-C', {
    risk: 'MUM', cwe: ['CWE-704', 'CWE-843'], approx: true,
    name: ['Do not access a variable through a pointer of an incompatible type', '호환되지 않는 형의 포인터로 변수에 접근하지 마세요'],
    why: ['Reading or writing an object through an lvalue of an unrelated type breaks the strict aliasing rule; the optimizer may reorder or drop the accesses.', '관련 없는 형의 lvalue 로 객체를 읽거나 쓰면 엄격한 별칭 규칙을 어겨 최적화가 접근 순서를 바꾸거나 없앨 수 있습니다.'],
    fix: ['Copy the representation with memcpy, or use a union in C.', 'memcpy 로 표현을 복사하거나 C 에서는 공용체를 사용하세요.'],
  }, {
    check(unit, api) {
      const incompatible = (objT, ptrT) => {
        const a = objT && T.canonical(objT), b = ptrT && T.canonical(ptrT);
        if (!a || !b || T.isVoid(b) || T.isUnknown(a) || T.isUnknown(b)) return false;
        if (b.kind === 'int' && T.isCharType(b)) return false;
        if (a.kind === 'array' || a.kind === 'record' || b.kind === 'record' || b.kind === 'array' || a.kind === 'function') return false;
        if (T.sameType(a, b, { ignoreQuals: true })) return false;
        if (T.isInteger(a) && T.isInteger(b) && T.sizeOf(a, unit.target) === T.sizeOf(b, unit.target) && a.kind !== 'enum' && b.kind !== 'enum') return false;
        if (a.kind === 'pointer' && b.kind === 'pointer') return false;
        return true;
      };
      const say = (n, sym, to) => api.report(n, M(`'${sym.name}' of type ${U.tstr(sym.type)} is accessed through an incompatible ${U.tstr(to)} lvalue.`, `${U.tstr(sym.type)} 형 '${sym.name}' 를 호환되지 않는 ${U.tstr(to)} lvalue 로 접근합니다.`));
      const derefParent = (n) => {
        let x = n, p = U.parent(x);
        while (p && p.type === 'ParenExpr') { x = p; p = U.parent(x); }
        if (!p) return null;
        if (p.type === 'UnaryExpr' && p.op === '*') return p;
        if (p.type === 'IndexExpr' && U.pkey(x) === 'object') return p;
        return null;
      };
      const viaPtr = new Map();
      for (const c of U.nodes(unit, 'CastExpr')) {
        const h = castPtrOfAddr(c);
        if (!h || !incompatible(h.sym.type, h.to)) continue;
        const dp = derefParent(c);
        if (dp) { say(dp, h.sym, h.to); continue; }
        const r = U.resultUse(c);
        if (r.kind === 'var' && r.sym) viaPtr.set(r.sym, h);
      }
      for (const [ps, h] of viaPtr) {
        for (const u of ps.uses || []) {
          if (u.type !== 'Identifier') continue;
          const dp = derefParent(u);
          if (dp) { say(dp, h.sym, h.to); break; }
        }
      }
    },
  }),

  rule('EXP40-C', {
    risk: 'LPM', cwe: ['CWE-758'], approx: true,
    name: ['Do not modify constant objects', '상수 객체를 수정하지 마세요'],
    why: ['Writing to an object defined const (after casting the qualifier away) is undefined behavior; the object may be in read-only memory.', 'const 로 정의된 객체에 (한정자를 캐스트로 없앤 뒤) 쓰면 정의되지 않은 동작이며 객체가 읽기 전용 메모리에 있을 수 있습니다.'],
    fix: ['Do not declare the object const if it must change, or modify a non-const copy.', '바뀌어야 하는 객체는 const 로 선언하지 말거나 const 가 아닌 사본을 수정하세요.'],
  }, {
    check(unit, api) {
      const isConstObj = (s) => {
        if (!s || (s.kind !== 'variable' && s.kind !== 'parameter')) return false;
        let t = s.type && T.canonical(s.type);
        while (t && t.kind === 'array') t = T.canonical(t.of);
        return !!t && !!t.const;
      };
      const constSrc = (e) => {
        e = U.skip(e);
        if (!e || e.type !== 'CastExpr' || !e.arg) return null;
        const to = e.typeName && T.canonical(e.typeName.ctype);
        if (!to || (to.kind !== 'pointer' && to.kind !== 'reference')) return null;
        const pointee = T.canonical(to.to);
        if (!pointee || pointee.const) return null;
        let a = U.strip(e.arg);
        if (to.kind === 'reference') { const s = U.idSym(a); return isConstObj(s) ? s : null; }
        if (a && a.type === 'UnaryExpr' && a.op === '&') { const s = U.idSym(a.arg); return isConstObj(s) ? s : null; }
        const s = U.idSym(a);
        if (s && T.canonical(s.type).kind === 'array' && isConstObj(s)) return s;
        return null;
      };
      const writeTarget = (n) => {
        let x = n, p = U.parent(x);
        while (p && p.type === 'ParenExpr') { x = p; p = U.parent(x); }
        if (!p) return null;
        let lv = null;
        if (p.type === 'UnaryExpr' && p.op === '*') lv = p;
        else if (p.type === 'IndexExpr' && U.pkey(x) === 'object') lv = p;
        else if (p.type === 'MemberExpr' && p.arrow) lv = p;
        else if (p.type === 'AssignExpr' && U.pkey(x) === 'left') return p; // reference
        if (!lv) return null;
        let y = lv, q = U.parent(y);
        while (q && q.type === 'ParenExpr') { y = q; q = U.parent(y); }
        if (q && q.type === 'AssignExpr' && U.pkey(y) === 'left') return q;
        if (q && q.type === 'UnaryExpr' && (q.op === '++' || q.op === '--')) return q;
        return null;
      };
      const say = (n, s) => api.report(n, M(`Const object '${s.name}' is modified through a pointer or reference that casts away const.`, `const 객체 '${s.name}' 를 const 를 없앤 포인터나 참조로 수정합니다.`));
      const viaPtr = new Map();
      for (const c of U.nodes(unit, 'CastExpr')) {
        const s = constSrc(c);
        if (!s) continue;
        const w = writeTarget(c);
        if (w) { say(w, s); continue; }
        const r = U.resultUse(c);
        if (r.kind === 'var' && r.sym) viaPtr.set(r.sym, s);
      }
      for (const [ps, s] of viaPtr) {
        for (const u of ps.uses || []) {
          if (u.type !== 'Identifier') continue;
          const w = writeTarget(u);
          if (w && !(w.type === 'AssignExpr' && U.skip(w.left) === u)) { say(w, s); break; }
        }
      }
    },
  }),

  rule('EXP42-C', {
    risk: 'MPM', cwe: ['CWE-1023'], approx: true,
    name: ['Do not compare padding data', '패딩 데이터를 비교하지 마세요'],
    why: ['memcmp() compares the padding bytes of a structure, whose values are unspecified, so equal objects can compare unequal.', 'memcmp() 는 값이 정해지지 않은 구조체의 패딩 바이트까지 비교해 같은 객체가 다르다고 나올 수 있습니다.'],
    fix: ['Compare the structure member by member.', '구조체를 멤버별로 비교하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['memcmp', 'bcmp']))) {
        for (const i of [0, 1]) {
          const a = U.strip(c.args[i]);
          const rec = a && X.recordOf(a.ctype);
          if (rec && X.hasPadding(rec, unit.target)) {
            api.report(c, M(`${U.callName(c)}() compares '${U.src(unit, a)}' of ${rec.tag} ${rec.name || rec.typedefName || '<anonymous>'}, which has padding bytes.`, `${U.callName(c)}() 가 패딩 바이트가 있는 ${rec.tag} ${rec.name || rec.typedefName || '<익명>'} 형 '${U.src(unit, a)}' 를 비교합니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('EXP43-C', {
    risk: 'MPH', cwe: ['CWE-628'], approx: true,
    name: ['Avoid undefined behavior when using restrict-qualified pointers', 'restrict 한정 포인터 사용 시 정의되지 않은 동작을 피하세요'],
    why: ['memcpy(), strcpy(), sprintf() and other functions with restrict parameters have undefined behavior when the source and destination overlap.', 'memcpy(), strcpy(), sprintf() 등 restrict 매개변수를 가진 함수는 원본과 대상이 겹치면 정의되지 않은 동작입니다.'],
    fix: ['Use memmove() for overlapping regions, or copy through a separate buffer.', '겹치는 영역에는 memmove() 를 쓰거나 별도 버퍼를 거쳐 복사하세요.'],
  }, {
    check(unit, api) {
      const PAIRS = { memcpy: [0, 1], strcpy: [0, 1], strncpy: [0, 1], strcat: [0, 1], strncat: [0, 1], wcscpy: [0, 1], wmemcpy: [0, 1] };
      const PRINT = { sprintf: 2, snprintf: 3, vsprintf: 2 };
      for (const c of U.libCalls(unit, new Set([...Object.keys(PAIRS), ...Object.keys(PRINT)]))) {
        const name = U.callName(c);
        const dk = baseKey(unit, c.args[0]);
        if (!dk) continue;
        const others = PAIRS[name] ? [c.args[1]] : c.args.slice(PRINT[name]);
        const o = others.find((a) => a && baseKey(unit, a) === dk);
        if (o) api.report(c, M(`${name}() is called with overlapping objects: destination '${U.src(unit, c.args[0])}' and '${U.src(unit, o)}' refer to the same object.`, `${name}() 의 대상 '${U.src(unit, c.args[0])}' 와 '${U.src(unit, o)}' 가 같은 객체를 가리켜 영역이 겹칩니다.`));
      }
      // user functions with restrict parameters
      for (const c of U.nodes(unit, 'CallExpr')) {
        const s = c.calleeSymbol;
        if (!s || s.system || !s.type) continue;
        const ft = T.canonical(s.type);
        if (!ft || ft.kind !== 'function' || !ft.params) continue;
        const idx = ft.params.map((p, i) => (p && p.restrict ? i : -1)).filter((i) => i >= 0 && c.args[i]);
        if (idx.length < 2) continue;
        const keys = idx.map((i) => baseKey(unit, c.args[i]));
        const dup = keys.findIndex((k, i) => k && keys.indexOf(k) !== i);
        if (dup >= 0) api.report(c, M(`${s.name}() receives '${U.src(unit, c.args[idx[dup]])}' for more than one restrict-qualified parameter.`, `${s.name}() 의 restrict 매개변수 여러 개에 '${U.src(unit, c.args[idx[dup]])}' 가 넘어갑니다.`));
      }
    },
  }),

  rule('EXP44-C', {
    risk: 'LUL', cwe: ['CWE-758'],
    name: ['Do not rely on side effects in operands to sizeof, _Alignof, or _Generic', 'sizeof, _Alignof, _Generic 피연산자의 부수 효과에 의존하지 마세요'],
    why: ['The operand of sizeof (except a VLA), _Alignof and the controlling expression of _Generic are not evaluated, so x++ inside them never happens.', 'sizeof(VLA 제외), _Alignof 의 피연산자와 _Generic 의 제어식은 평가되지 않아 그 안의 x++ 는 실행되지 않습니다.'],
    fix: ['Perform the side effect in a separate statement.', '부수 효과는 별도 문장에서 수행하세요.'],
  }, {
    check(unit, api) {
      for (const n of U.nodes(unit, ['SizeofExpr', 'AlignofExpr', 'GenericSelection'])) {
        const op = n.type === 'GenericSelection' ? n.control : n.arg;
        if (!op) continue;
        const t = X.ctypeOf(op);
        if (t && t.kind === 'array' && t.vla) continue;
        const se = X.sideEffect(op, false);
        if (!se) continue;
        const what = n.type === 'GenericSelection' ? '_Generic' : n.type === 'SizeofExpr' ? 'sizeof' : (n.keyword || '_Alignof');
        api.report(se, M(`Side effect '${U.src(unit, se)}' in the operand of ${what} is never evaluated.`, `${what} 피연산자 안의 부수 효과 '${U.src(unit, se)}' 는 평가되지 않습니다.`));
      }
    },
  }),

  rule('EXP45-C', {
    risk: 'LLM', cwe: ['CWE-480', 'CWE-481'],
    name: ['Do not perform assignments in selection statements', '선택문의 조건에서 대입하지 마세요'],
    why: ['if (x = y) is usually a typo for if (x == y); the assignment silently replaces the comparison.', 'if (x = y) 는 대개 if (x == y) 의 오타이며 대입이 비교를 조용히 대신합니다.'],
    fix: ['Compare with ==, or make the intent explicit: if ((x = y) != 0).', '== 로 비교하거나 의도를 드러내세요: if ((x = y) != 0).'],
  }, {
    check(unit, api) {
      const visit = (e, where) => {
        if (!e) return;
        if (e.type === 'AssignExpr') {
          if (e.loc.macro) return;
          api.report(e, M(`Assignment '${U.src(unit, e)}' is used as the condition of ${where}; did you mean '=='?`, `대입 '${U.src(unit, e)}' 가 ${where} 의 조건으로 쓰였습니다. '==' 를 의도했나요?`));
          return;
        }
        if (e.type === 'BinaryExpr' && (e.op === '&&' || e.op === '||')) { visit(e.left, where); visit(e.right, where); }
        else if (e.type === 'UnaryExpr' && e.op === '!') visit(e.arg, where);
      };
      for (const s of U.nodes(unit, ['IfStmt', 'WhileStmt', 'DoStmt', 'ForStmt'])) {
        if (s.cond && s.cond.type !== 'Declaration') visit(s.cond, { IfStmt: 'if', WhileStmt: 'while', DoStmt: 'do-while', ForStmt: 'for' }[s.type]);
      }
      for (const c of U.nodes(unit, 'ConditionalExpr')) visit(c.test, '?:');
    },
  }),

  rule('EXP46-C', {
    risk: 'LLL', cwe: ['CWE-480'],
    name: ['Do not use a bitwise operator with a Boolean-like operand', '불리언 성격의 피연산자에 비트 연산자를 쓰지 마세요'],
    why: ['a == 1 & b == 2 is usually a typo for &&; the bitwise form evaluates both sides and does not short-circuit.', 'a == 1 & b == 2 는 대개 && 의 오타이며 비트 연산은 양쪽을 모두 평가하고 단락 평가하지 않습니다.'],
    fix: ['Use the logical operators && and ||.', '논리 연산자 && 와 || 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '&' && b.op !== '|' && b.op !== '^') continue;
        if (!(X.isRelational(b.left) || X.isRelational(b.right))) continue;
        if (!X.isBoolLike(b.left) || !X.isBoolLike(b.right)) continue;
        if (b.loc.macro) continue;
        const want = b.op === '&' ? '&&' : b.op === '|' ? '||' : '!=';
        api.report(b, M(`Bitwise '${b.op}' is applied to Boolean operands in '${U.src(unit, b)}'; use '${want}'.`, `'${U.src(unit, b)}' 에서 불리언 피연산자에 비트 연산자 '${b.op}' 를 썼습니다. '${want}' 를 사용하세요.`));
      }
    },
  }),

  rule('EXP47-C', {
    risk: 'MLH', cwe: ['CWE-686'],
    name: ['Do not call va_arg with an argument of the incorrect type', 'va_arg 를 잘못된 형으로 호출하지 마세요'],
    why: ['Variadic arguments undergo default argument promotions: char, short and bool become int and float becomes double, so va_arg with those types is undefined behavior.', '가변 인수는 기본 승격을 거쳐 char, short, bool 은 int 가, float 은 double 이 되므로 그 형으로 va_arg 를 호출하면 정의되지 않은 동작입니다.'],
    fix: ['Read the promoted type (int or double) and convert afterwards.', '승격된 형(int 나 double)으로 읽은 뒤 변환하세요.'],
  }, {
    check(unit, api) {
      for (const v of U.nodes(unit, 'VaArgExpr')) {
        const t = v.typeName && v.typeName.ctype;
        const small = smallTypes(t);
        if (!small) continue;
        const prom = small === 'float' ? 'double' : 'int';
        const ap = U.skip(v.arg) && U.skip(v.arg).type === 'Identifier' ? U.skip(v.arg).name : 'ap';
        api.report(v, M(`va_arg() reads type ${U.tstr(t)}, which is promoted to ${prom} when passed; use va_arg(${ap}, ${prom}).`, `va_arg() 가 전달 시 ${prom} 로 승격되는 ${U.tstr(t)} 형을 읽습니다. va_arg(${ap}, ${prom}) 를 쓰세요.`));
      }
    },
  }),
];
