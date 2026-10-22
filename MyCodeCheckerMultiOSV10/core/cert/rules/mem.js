'use strict';

// SEI CERT C — MEM: memory management.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const { M, T, cf } = U;

const ALLOC = new Set(['malloc', 'calloc', 'realloc', 'strdup', 'strndup', 'aligned_alloc', 'reallocarray', '_strdup', 'wcsdup']);

// The first use of `sym` in the statements after `stmt` (source order), or null.
// Returns { node, kind: 'assign' | 'use' }.
function nextUse(stmts, sym) {
  for (const s of stmts) {
    let found = null;
    cf.walk(s, (n) => {
      if (n.type === 'AssignExpr' && n.op === '=' && U.idSym(n.left) === sym) {
        // right side is evaluated first
        if (U.refersTo(n.right, sym)) { found = { node: n.right, kind: 'use' }; return cf.walk.STOP; }
        found = { node: n, kind: 'assign' };
        return cf.walk.STOP;
      }
      if (n.type === 'Identifier' && n.symbol === sym) { found = { node: n, kind: 'use' }; return cf.walk.STOP; }
      return undefined;
    });
    if (found) return found;
    // a branch that may leave the block ends straight-line reasoning only if it reassigns; returns end it
    if (cf.findFirst(s, (n) => n.type === 'ReturnStmt' || n.type === 'GotoStmt' || n.type === 'BreakStmt' || n.type === 'ContinueStmt')) return null;
  }
  return null;
}

function freedSym(c) {
  const s = U.idSym(c.args[0]);
  return s && (s.kind === 'variable' || s.kind === 'parameter') ? s : null;
}

function isFreeCall(c) {
  return c && c.type === 'CallExpr' && U.isLib(c, 'free');
}

function flexibleRecord(t) {
  const c = U.canon(t);
  if (!c || c.kind !== 'record' || !c.fields || !c.fields.length) return null;
  const last = c.fields[c.fields.length - 1];
  const lt = last && last.type && T.canonical(last.type);
  return lt && lt.kind === 'array' && lt.size == null && !lt.vla ? c : null;
}

function sizeofSize(unit, so) {
  if (!so) return null;
  const t = so.typeName ? so.typeName.ctype : so.arg && so.arg.ctype;
  return t ? T.sizeOf(t, unit.target) : null;
}

function sizeofFactors(e, out = []) {
  e = U.strip(e);
  if (!e) return out;
  if (e.type === 'SizeofExpr') out.push(e);
  else if (e.type === 'BinaryExpr' && e.op === '*') { sizeofFactors(e.left, out); sizeofFactors(e.right, out); }
  return out;
}

// Pointer type the allocation result is stored to.
function targetPointee(call) {
  let n = call;
  let p = U.parent(n);
  while (p && (p.type === 'ParenExpr' || p.type === 'CastExpr')) {
    if (p.type === 'CastExpr' && p.typeName && p.typeName.ctype) {
      const ct = T.canonical(p.typeName.ctype);
      if (ct && ct.kind === 'pointer') return { pointee: ct.to, via: p };
    }
    n = p; p = U.parent(n);
  }
  let t = null;
  if (p && p.type === 'VarDecl' && p.init === n) t = p.ctype;
  else if (p && p.type === 'AssignExpr' && p.right === n) t = p.left.ctype;
  const c = t && T.canonical(t);
  return c && c.kind === 'pointer' ? { pointee: c.to, via: p } : null;
}

module.exports = [
  rule('MEM30-C', {
    langs: ['c'], risk: 'HLM', cwe: ['CWE-416', 'CWE-415'], sec: true, approx: true, deep: 'absint:USE_AFTER_FREE', checker: 'USE_AFTER_FREE',
    name: ['Do not access freed memory', '해제된 메모리에 접근하지 마세요'],
    why: ['After free() the block may be reused by the allocator; reading, writing or freeing it again corrupts the heap and is exploitable.', 'free() 뒤의 블록은 할당자가 다시 쓸 수 있어 읽거나 쓰거나 다시 해제하면 힙이 손상되고 공격에 악용될 수 있습니다.'],
    fix: ['Set the pointer to NULL right after free() and do not use it until it is reassigned.', 'free() 직후 포인터를 NULL 로 만들고 다시 대입하기 전에는 쓰지 마세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['free', 'realloc']))) {
        const sym = freedSym(c);
        if (!sym) continue;
        if (U.callName(c) === 'realloc') {
          // p2 = realloc(p, n): p is dead unless the result is p itself or null-checked away
          const r = U.resultUse(c);
          if (r.kind !== 'var' || r.sym === sym) continue;
        }
        const stmt = U.stmtOf(c);
        if (!stmt || U.loopOf(c) && U.loopOf(c) !== U.loopOf(stmt)) continue;
        const u = nextUse(U.following(stmt), sym);
        if (!u || u.kind !== 'use') continue;
        const call = U.parent(u.node);
        const what = isFreeCall(call) && call.args[0] && U.strip(call.args[0]) === u.node ? 'freed again' : 'used';
        api.report(u.node, M(`'${sym.name}' is ${what} after ${U.callName(c)}() on line ${c.loc.line}.`, `'${sym.name}' 가 ${c.loc.line}행의 ${U.callName(c)}() 뒤에 ${what === 'used' ? '사용됩니다' : '다시 해제됩니다'}.`), {
          events: [{ line: c.loc.line, tag: 'free', text: M(`'${sym.name}' freed`, `'${sym.name}' 해제`) }, { line: u.node.loc.line, tag: 'deref', text: M(`'${sym.name}' ${what}`, `'${sym.name}' 사용`), main: true }],
        });
      }
    },
  }),

  rule('MEM31-C', {
    langs: ['c'], risk: 'MPM', cwe: ['CWE-401', 'CWE-772'], approx: true, deep: 'absint:LEAK', checker: 'RESOURCE_LEAK',
    name: ['Free dynamically allocated memory when no longer needed', '더 이상 필요 없는 동적 메모리는 해제하세요'],
    why: ['Memory whose last pointer goes out of scope can never be released; repeated leaks exhaust memory (denial of service).', '마지막 포인터가 범위를 벗어난 메모리는 다시 해제할 수 없어 반복되면 메모리가 고갈됩니다(서비스 거부).'],
    fix: ['free() the block on every path, or hand ownership to the caller (return it / store it) explicitly.', '모든 경로에서 free() 하거나 소유권을 호출자에게 명시적으로 넘기세요(반환하거나 저장).'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const owners = new Map();
        for (const c of U.libCallsIn(fn.body, ALLOC)) {
          if (U.callName(c) === 'realloc') continue;
          const r = U.resultUse(c);
          let n = c, p = U.parent(c);
          while (p && (p.type === 'CastExpr' || p.type === 'ParenExpr')) { n = p; p = U.parent(p); }
          const use = n === c ? r : U.resultUse(n);
          const sym = use.kind === 'var' ? use.sym : null;
          if (sym && sym.kind === 'variable' && sym.storage === 'automatic' && !owners.has(sym)) owners.set(sym, c);
          else if (!sym && use.kind === 'discarded') api.report(c, M(`The result of ${U.callName(c)}() is discarded; the memory leaks immediately.`, `${U.callName(c)}() 결과를 버려 메모리가 바로 누수됩니다.`));
        }
        for (const [sym, c] of owners) {
          let escapes = false;
          for (const u of sym.uses || []) {
            const p = U.parent(u);
            if (!p) continue;
            if (p.type === 'CallExpr' && p.callee !== u) {
              const name = U.callName(p);
              if (!U.isStdCall(p) || ['free', 'realloc', 'pthread_create', 'thrd_create', 'setvbuf', 'putenv'].includes(name)) { escapes = true; break; }
              continue;
            }
            if (p.type === 'ReturnStmt') { escapes = true; break; }
            if (p.type === 'AssignExpr' && p.right === u) { escapes = true; break; }
            if (p.type === 'VarDecl' && p.init === u) { escapes = true; break; }
            if (p.type === 'UnaryExpr' && p.op === '&') { escapes = true; break; }
            if (p.type === 'InitList' || p.type === 'ConditionalExpr' || p.type === 'CastExpr' || p.type === 'ParenExpr' || p.type === 'BinaryExpr' && p.op === ',') { escapes = true; break; }
            if (cf.enclosing(u, 'ReturnStmt')) { escapes = true; break; }
          }
          if (!escapes) api.report(c, M(`Memory from ${U.callName(c)}() stored in '${sym.name}' is never freed, returned or stored elsewhere in ${U.fnName(fn)}().`, `${U.callName(c)}() 로 할당해 '${sym.name}' 에 저장한 메모리를 ${U.fnName(fn)}() 에서 해제·반환·저장하지 않습니다.`));
        }
      }
    },
  }),

  rule('MEM33-C', {
    risk: 'LUL', cwe: ['CWE-401'],
    name: ['Allocate and copy structures containing a flexible array member dynamically', '유연 배열 멤버를 가진 구조체는 동적으로 할당하고 복사하세요'],
    why: ['An object with a flexible array member declared as a variable has no room for the array, and struct assignment does not copy the array elements.', '유연 배열 멤버를 가진 구조체를 변수로 선언하면 배열 공간이 없고 구조체 대입은 배열 원소를 복사하지 않습니다.'],
    fix: ['Allocate with malloc(sizeof(struct S) + n * sizeof(elem)) and copy with memcpy including the array part; pass pointers, not values.', 'malloc(sizeof(struct S) + n * sizeof(원소)) 로 할당하고 배열 부분까지 memcpy 로 복사하며 값이 아니라 포인터로 넘기세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, ['VarDecl', 'ParamDecl'])) {
        const r = flexibleRecord(d.ctype);
        if (!r || (d.specs && d.specs.storage && d.specs.storage.includes('extern'))) continue;
        api.report(d, M(`'${d.name || '(parameter)'}' is a ${d.type === 'ParamDecl' ? 'by-value parameter' : 'non-dynamic object'} of '${U.tstr(r)}', which has a flexible array member.`, `'${d.name || '(매개변수)'}' 는 유연 배열 멤버가 있는 '${U.tstr(r)}' 형의 ${d.type === 'ParamDecl' ? '값 매개변수' : '비동적 객체'} 입니다.`));
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const r = flexibleRecord(a.left.ctype);
        if (r) api.report(a, M(`Struct assignment of '${U.tstr(r)}' does not copy its flexible array member.`, `'${U.tstr(r)}' 의 구조체 대입은 유연 배열 멤버를 복사하지 않습니다.`));
      }
    },
  }),

  rule('MEM34-C', {
    risk: 'HLM', cwe: ['CWE-590', 'CWE-761'], sec: true, approx: true, checker: 'BAD_FREE',
    name: ['Only free memory allocated dynamically', '동적으로 할당한 메모리만 해제하세요'],
    why: ['Passing free() the address of a stack/static object, a string literal or a pointer into the middle of a block corrupts the heap.', '스택·정적 객체의 주소, 문자열 리터럴, 블록 중간을 가리키는 포인터를 free() 에 넘기면 힙이 손상됩니다.'],
    fix: ['free() only pointers returned by malloc/calloc/realloc (unchanged), and only once.', 'malloc/calloc/realloc 이 반환한 포인터만, 바꾸지 않은 채로, 한 번만 free() 하세요.'],
  }, {
    check(unit, api) {
      const nonHeap = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'StringLiteral') return M('a string literal', '문자열 리터럴');
        if (e.type === 'UnaryExpr' && e.op === '&') return M(`the address of '${U.src(unit, e.arg)}'`, `'${U.src(unit, e.arg)}' 의 주소`);
        const t = e.ctype && T.canonical(e.ctype);
        if ((e.type === 'Identifier' || e.type === 'MemberExpr') && t && t.kind === 'array') return M(`the array '${U.src(unit, e)}'`, `배열 '${U.src(unit, e)}'`);
        if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-') && t && t.kind === 'pointer' && U.constInt(unit, e.right) !== 0n) return M(`'${U.src(unit, e)}', which points into the middle of a block`, `블록 중간을 가리키는 '${U.src(unit, e)}'`);
        return null;
      };
      const origin = new Map();
      for (const d of U.nodes(unit, 'VarDecl')) if (d.init && d.symbol && d.symbol.storage === 'automatic' && nonHeap(d.init)) origin.set(d.symbol, d.init);
      for (const a of U.nodes(unit, 'AssignExpr')) {
        const s = U.idSym(a.left);
        if (s && origin.has(s) && !(a.op === '=' && nonHeap(a.right))) origin.delete(s);
      }
      for (const c of U.libCalls(unit, new Set(['free', 'realloc']))) {
        let why = nonHeap(c.args[0]);
        if (!why) {
          const s = U.idSym(c.args[0]);
          if (s && origin.has(s)) {
            const w = nonHeap(origin.get(s));
            why = M(`'${s.name}', which holds ${w.en}`, `${w.ko} 를 담은 '${s.name}'`);
          }
        }
        if (why) api.report(c, M(`${U.callName(c)}() is passed ${why.en}, which was not allocated dynamically.`, `${U.callName(c)}() 에 동적으로 할당하지 않은 ${why.ko} 를 넘깁니다.`));
      }
    },
  }),

  rule('MEM35-C', {
    risk: 'HPH', cwe: ['CWE-131', 'CWE-680', 'CWE-787'], sec: true, approx: true, deep: 'absint:OVERRUN', checker: 'SIZECHECK',
    name: ['Allocate sufficient memory for an object', '객체에 충분한 메모리를 할당하세요'],
    why: ['Sizing an allocation with the wrong sizeof (a pointer, a smaller type) or forgetting the string terminator gives a buffer smaller than the code assumes.', '잘못된 sizeof(포인터, 더 작은 형)로 크기를 정하거나 문자열 종료 문자를 빠뜨리면 코드가 가정한 것보다 작은 버퍼가 됩니다.'],
    fix: ['Write p = malloc(n * sizeof *p) and add 1 for the terminator of copied strings.', 'p = malloc(n * sizeof *p) 형태로 쓰고 복사할 문자열은 종료 문자를 위해 1 을 더하세요.'],
  }, {
    check(unit, api) {
      const SIZE_ARG = { malloc: 0, calloc: 1, realloc: 1, aligned_alloc: 1 };
      for (const c of U.libCalls(unit, new Set(Object.keys(SIZE_ARG)))) {
        const sizeArg = c.args[SIZE_ARG[U.callName(c)]];
        if (!sizeArg) continue;
        const tp = targetPointee(c);
        const s = U.strip(sizeArg);
        // malloc(strlen(s)) for a string copy
        if (s && s.type === 'CallExpr' && U.isLib(s, new Set(['strlen', 'wcslen']))) {
          api.report(c, M(`${U.callName(c)}(${U.src(unit, sizeArg)}) leaves no room for the null terminator; add 1.`, `${U.callName(c)}(${U.src(unit, sizeArg)}) 는 널 종료 문자 자리가 없습니다. 1 을 더하세요.`));
          continue;
        }
        if (!tp || !tp.pointee) continue;
        const pc = T.canonical(tp.pointee);
        if (!pc || T.isVoid(pc) || T.isCharType(pc)) continue;
        const need = T.sizeOf(pc, unit.target);
        if (need == null) continue;
        const factors = sizeofFactors(sizeArg);
        if (factors.length === 1) {
          const got = sizeofSize(unit, factors[0]);
          if (got != null && got < need) {
            api.report(c, M(`${U.callName(c)}() is sized with ${U.src(unit, factors[0])} (${got} bytes) but the result is used as '${U.tstr(tp.pointee)} *' (${need} bytes per element).`, `${U.callName(c)}() 크기는 ${U.src(unit, factors[0])}(${got} 바이트)인데 결과는 '${U.tstr(tp.pointee)} *'(원소당 ${need} 바이트)로 쓰입니다.`));
          }
          continue;
        }
        const n = U.constInt(unit, sizeArg);
        if (n != null && factors.length === 0 && U.callName(c) !== 'calloc' && n < BigInt(need)) {
          api.report(c, M(`${U.callName(c)}(${n}) is smaller than '${U.tstr(tp.pointee)}' (${need} bytes).`, `${U.callName(c)}(${n}) 는 '${U.tstr(tp.pointee)}'(${need} 바이트)보다 작습니다.`));
        }
      }
    },
  }),

  rule('MEM36-C', {
    risk: 'LPH', cwe: ['CWE-1335'], approx: true,
    name: ['Do not modify the alignment of objects by calling realloc()', 'realloc() 으로 객체의 정렬을 바꾸지 마세요'],
    why: ['realloc() only guarantees fundamental alignment; memory from aligned_alloc() may lose its stricter alignment.', 'realloc() 은 기본 정렬만 보장하므로 aligned_alloc() 으로 얻은 메모리가 더 엄격한 정렬을 잃을 수 있습니다.'],
    fix: ['Allocate a new aligned block with aligned_alloc(), memcpy the data and free the old block.', 'aligned_alloc() 으로 새 정렬 블록을 할당하고 데이터를 memcpy 한 뒤 이전 블록을 해제하세요.'],
  }, {
    check(unit, api) {
      const aligned = new Map();
      for (const c of U.libCalls(unit, new Set(['aligned_alloc', 'memalign', '_aligned_malloc', 'posix_memalign']))) {
        if (U.callName(c) === 'posix_memalign') {
          const a = U.strip(c.args[0]);
          const s = a && a.type === 'UnaryExpr' && a.op === '&' ? U.idSym(a.arg) : null;
          if (s) aligned.set(s, c);
          continue;
        }
        let n = c, p = U.parent(c);
        while (p && (p.type === 'CastExpr' || p.type === 'ParenExpr')) { n = p; p = U.parent(p); }
        const r = U.resultUse(n);
        if (r.kind === 'var') aligned.set(r.sym, c);
      }
      for (const c of U.libCalls(unit, 'realloc')) {
        const s = U.idSym(c.args[0]);
        if (s && aligned.has(s)) api.report(c, M(`realloc() on '${s.name}', which came from ${U.callName(aligned.get(s))}() on line ${aligned.get(s).loc.line}; the new block may not keep that alignment.`, `${aligned.get(s).loc.line}행의 ${U.callName(aligned.get(s))}() 로 얻은 '${s.name}' 를 realloc() 하면 새 블록이 그 정렬을 유지하지 않을 수 있습니다.`));
      }
    },
  }),
];

