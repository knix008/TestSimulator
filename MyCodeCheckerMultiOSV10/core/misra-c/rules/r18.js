'use strict';

// MISRA C:2012 / 2023 chapter 18 — pointers and arrays.

const A = require('../lib/a-util');
const B = require('../lib/b-common');

const { cf, T, rule, msg, nodes, text, skipParens, isPointerType, isArrayType, canon } = B;

// { sym, size, off } for a pointer into an array object of known size.
function pointerOffset(e, unit, depth = 0) {
  const x = skipParens(e);
  if (!x || depth > 8) return null;
  if (x.type === 'Identifier' && x.symbol) {
    const t = canon(x.symbol.type);
    if (t && t.kind === 'array' && t.size != null && x.symbol.kind !== 'parameter') return { sym: x.symbol, size: t.size, off: 0n };
    if (t && t.kind === 'pointer') {
      const d = B.singleDefinition(x.symbol);
      if (d) {
        const r = pointerOffset(d, unit, depth + 1);
        // element types must agree
        if (r && A.sameType(T.pointee(t) || t, T.pointee(T.decay(r.sym.type)) || t, { ignoreQuals: true })) return r;
      }
    }
    return null;
  }
  if (x.type === 'UnaryExpr' && x.op === '&') {
    const a = skipParens(x.arg);
    if (a && a.type === 'IndexExpr') {
      const base = pointerOffset(a.object, unit, depth + 1);
      const k = B.constInt(a.index, unit);
      if (base && k !== null) return { ...base, off: base.off + k };
    }
    return null;
  }
  if (x.type === 'BinaryExpr' && (x.op === '+' || x.op === '-')) {
    let p = x.left, i = x.right;
    if (x.op === '+' && !(isPointerType(x.left.ctype) || isArrayType(x.left.ctype))) { p = x.right; i = x.left; }
    if (!(isPointerType(p.ctype) || isArrayType(p.ctype))) return null;
    const base = pointerOffset(p, unit, depth + 1);
    const k = B.constInt(i, unit);
    if (base && k !== null) return { ...base, off: x.op === '+' ? base.off + k : base.off - k };
  }
  return null;
}

// Address of an object with automatic storage duration in e, or null.
function autoAddress(e, depth = 0) {
  const x = B.stripCasts(e);
  if (!x || depth > 6) return null;
  if (x.type === 'UnaryExpr' && x.op === '&') {
    const s = B.lvalueBase(x.arg);
    return s && s.kind === 'variable' && s.storage === 'automatic' ? s : (s && s.kind === 'parameter' ? s : null);
  }
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind === 'variable' && x.symbol.storage === 'automatic' && isArrayType(x.symbol.type)) return x.symbol;
  if (x.type === 'BinaryExpr' && (x.op === '+' || x.op === '-')) return autoAddress(x.left, depth + 1) || (x.op === '+' ? autoAddress(x.right, depth + 1) : null);
  if (x.type === 'ConditionalExpr') return autoAddress(x.consequent, depth + 1) || autoAddress(x.alternate, depth + 1);
  return null;
}

// The pointer variable an lvalue such as *p, p->f, p[i] goes through.
function rootPointer(e) {
  let x = skipParens(e);
  for (let i = 0; i < 30 && x; i++) {
    if (x.type === 'Identifier') return x.symbol;
    if (x.type === 'MemberExpr') x = skipParens(x.object);
    else if (x.type === 'IndexExpr') x = skipParens(x.object);
    else if (x.type === 'UnaryExpr' && x.op === '*') x = skipParens(x.arg);
    else return null;
  }
  return null;
}

function scopeEncloses(outer, inner) {
  for (let s = inner; s; s = s.parent) if (s === outer) return true;
  return false;
}

function nest(t, seen = 0) {
  const c = canon(t);
  if (!c || seen > 30) return 0;
  if (c.kind === 'pointer') {
    const to = canon(c.to);
    if (to && to.kind === 'function') return Math.max(1, nestFn(to, seen + 1));
    return 1 + nest(c.to, seen + 1);
  }
  if (c.kind === 'array') return nest(c.of, seen + 1);
  if (c.kind === 'function') return nestFn(c, seen + 1);
  return 0;
}
function nestFn(f, seen) {
  let m = nest(f.ret, seen);
  for (const p of f.params || []) m = Math.max(m, nest(p, seen));
  return m;
}

function declChain(d) {
  const out = [];
  for (let x = d; x && out.length < 40; x = x.inner) out.push(x);
  return out;
}

function vlaSize(a, unit) {
  return a.star || (a.size && B.constInt(a.size, unit) === null);
}

function isTemporary(e) {
  const x = skipParens(e);
  if (!x) return false;
  if (x.type === 'CallExpr' || x.type === 'AssignExpr' || x.type === 'ConditionalExpr') return true;
  if (x.type === 'BinaryExpr' && x.op === ',') return true;
  if (x.type === 'MemberExpr' && !x.arrow) return isTemporary(x.object);
  return false;
}

module.exports = [
  rule({
    id: '18.1', cat: 'Required', type: 'BUG', sev: 'CRITICAL', debt: 15, decidable: false, cwe: 'CWE-119', cert: 'ARR30-C',
    name: ['Pointer arithmetic shall stay within the array it points into', '포인터 연산 결과는 가리키는 배열 범위 안에 있어야 합니다'],
    why: ['Forming or using a pointer outside an array (other than one past its end) is undefined behaviour.', '배열 밖(끝 바로 다음 제외)을 가리키는 포인터를 만들거나 사용하면 정의되지 않은 동작입니다.'],
    fix: ['Check the index or offset against the array size before using it.', '인덱스나 오프셋을 사용하기 전에 배열 크기와 비교해 검사하세요.'],
    check(unit, api) {
      for (const ix of nodes(unit, 'IndexExpr')) {
        const base = pointerOffset(ix.object, unit);
        const k = B.constInt(ix.index, unit);
        if (!base || k === null) continue;
        const off = base.off + k;
        const p = cf.parentOf(ix);
        const addrOnly = p && p.type === 'UnaryExpr' && p.op === '&';
        const limit = BigInt(base.size) + (addrOnly ? 1n : 0n);
        if (off < 0n || off >= limit) api.report(ix, msg(`'${text(unit, ix)}' accesses element ${off} of '${base.sym.name}', which has ${base.size} elements.`, `'${text(unit, ix)}'이(가) 요소가 ${base.size}개인 '${base.sym.name}'의 ${off}번 요소에 접근합니다.`));
      }
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (b.op !== '+' && b.op !== '-') continue;
        if (!isPointerType(b.ctype)) continue;
        const r = pointerOffset(b, unit);
        if (!r) continue;
        if (r.off < 0n || r.off > BigInt(r.size)) api.report(b, msg(`'${text(unit, b)}' points outside '${r.sym.name}' (offset ${r.off}, ${r.size} elements).`, `'${text(unit, b)}'이(가) '${r.sym.name}'의 범위 밖을 가리킵니다(오프셋 ${r.off}, 요소 ${r.size}개).`));
        else if (r.off === BigInt(r.size)) {
          const p = cf.parentOf(b);
          const pp = p && p.type === 'ParenExpr' ? cf.parentOf(p) : p;
          if (pp && pp.type === 'UnaryExpr' && pp.op === '*') api.report(pp, msg(`'${text(unit, pp)}' dereferences one past the end of '${r.sym.name}'.`, `'${text(unit, pp)}'이(가) '${r.sym.name}'의 끝 바로 다음을 역참조합니다.`));
        }
      }
    },
  }),
  rule({
    id: '18.2', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-469', cert: 'ARR36-C',
    name: ['Pointers shall only be subtracted when they point into the same array', '포인터 뺄셈은 같은 배열을 가리킬 때만 해야 합니다'],
    why: ['The difference of pointers into different objects is undefined behaviour.', '서로 다른 객체를 가리키는 포인터의 차는 정의되지 않은 동작입니다.'],
    fix: ['Subtract only pointers derived from the same array, or compute with indexes.', '같은 배열에서 얻은 포인터끼리만 빼거나 인덱스로 계산하세요.'],
    check(unit, api) {
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (b.op !== '-') continue;
        const lp = isPointerType(b.left.ctype) || isArrayType(b.left.ctype);
        const rp = isPointerType(b.right.ctype) || isArrayType(b.right.ctype);
        if (!lp || !rp) continue;
        const l = B.pointerBase(b.left), r = B.pointerBase(b.right);
        if (l && r && l !== r) api.report(b, msg(`'${text(unit, b)}' subtracts pointers into different objects '${l.name}' and '${r.name}'.`, `'${text(unit, b)}'이(가) 서로 다른 객체 '${l.name}'와(과) '${r.name}'을(를) 가리키는 포인터를 뺍니다.`));
      }
    },
  }),
  rule({
    id: '18.3', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-469', cert: 'ARR36-C',
    name: ['Relational operators shall only compare pointers into the same object', '관계 연산자는 같은 객체를 가리키는 포인터끼리만 비교해야 합니다'],
    why: ['Ordering pointers to different objects with <, <=, > or >= is undefined behaviour.', '서로 다른 객체를 가리키는 포인터를 <, <=, >, >=로 비교하면 정의되지 않은 동작입니다.'],
    fix: ['Compare only pointers into the same array or structure.', '같은 배열이나 구조체를 가리키는 포인터끼리만 비교하세요.'],
    check(unit, api) {
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (!['<', '<=', '>', '>='].includes(b.op)) continue;
        const lp = isPointerType(b.left.ctype) || isArrayType(b.left.ctype);
        const rp = isPointerType(b.right.ctype) || isArrayType(b.right.ctype);
        if (!lp || !rp) continue;
        const l = B.pointerBase(b.left), r = B.pointerBase(b.right);
        if (l && r && l !== r) api.report(b, msg(`'${text(unit, b)}' compares pointers into different objects '${l.name}' and '${r.name}'.`, `'${text(unit, b)}'이(가) 서로 다른 객체 '${l.name}'와(과) '${r.name}'을(를) 가리키는 포인터를 비교합니다.`));
      }
    },
  }),
  rule({
    id: '18.4', cat: 'Advisory', debt: 5, decidable: true, cwe: 'CWE-468',
    name: ['The +, -, += and -= operators should not be applied to pointers', '+, -, +=, -= 연산자를 포인터에 적용하지 않아야 합니다'],
    why: ['Array indexing states the intent more clearly than explicit pointer arithmetic and is easier to check for bounds.', '배열 인덱싱이 명시적 포인터 연산보다 의도를 더 잘 드러내고 범위 검사도 쉽습니다.'],
    fix: ['Use array subscripts, for example p[i] instead of *(p + i).', '*(p + i) 대신 p[i]처럼 배열 첨자를 사용하세요.'],
    check(unit, api) {
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (b.op !== '+' && b.op !== '-') continue;
        const lp = isPointerType(b.left.ctype) || isArrayType(b.left.ctype);
        const rp = isPointerType(b.right.ctype) || isArrayType(b.right.ctype);
        if (lp === rp) continue; // integer arithmetic or pointer difference
        api.report(b, msg(`Pointer arithmetic '${text(unit, b)}' uses '${b.op}'.`, `포인터 연산 '${text(unit, b)}'에 '${b.op}'를 사용했습니다.`));
      }
      for (const a of nodes(unit, 'AssignExpr')) {
        if ((a.op === '+=' || a.op === '-=') && isPointerType(a.left.ctype)) api.report(a, msg(`Pointer arithmetic '${text(unit, a)}' uses '${a.op}'.`, `포인터 연산 '${text(unit, a)}'에 '${a.op}'를 사용했습니다.`));
      }
    },
  }),
  rule({
    id: '18.5', cat: 'Advisory', debt: 10, decidable: true,
    name: ['Declarations should have at most two levels of pointer nesting', '선언의 포인터 중첩은 두 단계 이하여야 합니다'],
    why: ['Three or more levels of indirection are hard to understand and to use correctly.', '세 단계 이상의 간접 참조는 이해하고 올바르게 쓰기 어렵습니다.'],
    fix: ['Introduce a structure or typedef that gives the intermediate levels a meaning, or simplify the data structure.', '중간 단계에 의미를 주는 구조체를 도입하거나 자료 구조를 단순화하세요.'],
    check(unit, api) {
      const rep = (node, name, t, n) => api.report(node, msg(`'${name}' has ${n} levels of pointer nesting ('${T.typeToString(t)}').`, `'${name}'의 포인터 중첩이 ${n}단계입니다('${T.typeToString(t)}').`));
      for (const d of nodes(unit, ['VarDecl', 'FieldDecl'])) {
        const n = nest(d.ctype);
        if (n > 2) rep(d, d.name, d.ctype, n);
      }
      for (const d of nodes(unit, 'TypedefDecl')) {
        const t = d.ctype && d.ctype.kind === 'typedef' ? d.ctype.target : d.ctype;
        const n = nest(t);
        if (n > 2) rep(d, d.name, t, n);
      }
      for (const f of nodes(unit, 'FunctionDecl')) {
        const ft = canon(f.ctype);
        if (!ft || ft.kind !== 'function') continue;
        const n = nest(ft.ret);
        if (n > 2) rep(f, f.name, ft.ret, n);
        for (const p of f.params || []) {
          const m = nest(p.ctype);
          if (m > 2) rep(p, p.name || '(parameter)', p.ctype, m);
        }
      }
    },
  }),
  rule({
    id: '18.6', cat: 'Required', type: 'BUG', sev: 'CRITICAL', debt: 15, decidable: false, cwe: 'CWE-562', cert: 'DCL30-C',
    name: ['The address of an automatic object shall not outlive the object', '자동 객체의 주소가 객체보다 오래 남으면 안 됩니다'],
    why: ['Once a local object goes out of scope, a pointer to it dangles and using it is undefined behaviour.', '지역 객체가 범위를 벗어나면 그 포인터는 댕글링 포인터가 되며 사용하면 정의되지 않은 동작입니다.'],
    fix: ['Return or store a copy of the value, use static or allocated storage, or let the caller provide the buffer.', '값의 복사본을 반환·저장하거나, 정적 또는 할당된 저장소를 쓰거나, 호출자가 버퍼를 제공하게 하세요.'],
    check(unit, api) {
      for (const r of nodes(unit, 'ReturnStmt')) {
        const s = r.arg && autoAddress(r.arg);
        if (s) api.report(r, msg(`The address of automatic object '${s.name}' is returned.`, `자동 객체 '${s.name}'의 주소를 반환합니다.`));
      }
      for (const a of nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const s = autoAddress(a.right);
        if (!s) continue;
        const lb = B.lvalueBase(a.left);
        let bad = null;
        if (lb && (lb.storage === 'static' || lb.storage === 'thread')) bad = lb;
        else if (lb && lb.storage === 'automatic' && lb.scope && s.scope && lb.scope !== s.scope && scopeEncloses(lb.scope, s.scope) && s.kind !== 'parameter') bad = lb;
        else if (!lb) {
          const rp = rootPointer(a.left);
          if (rp && (rp.kind === 'parameter' || rp.storage === 'static' || rp.storage === 'thread')) bad = rp;
        }
        if (bad) api.report(a, msg(`The address of automatic object '${s.name}' is stored in '${text(unit, a.left)}', which outlives it.`, `자동 객체 '${s.name}'의 주소를 그보다 오래 사는 '${text(unit, a.left)}'에 저장합니다.`));
      }
      for (const d of nodes(unit, 'VarDecl')) {
        if (!d.init || !d.symbol || d.symbol.storage !== 'static') continue;
        const s = autoAddress(d.init);
        if (s) api.report(d, msg(`Static object '${d.name}' is initialised with the address of automatic object '${s.name}'.`, `정적 객체 '${d.name}'을(를) 자동 객체 '${s.name}'의 주소로 초기화합니다.`));
      }
    },
  }),
  rule({
    id: '18.7', cat: 'Required', debt: 15, decidable: true,
    name: ['Flexible array members shall not be declared', '유연한 배열 멤버를 선언하면 안 됩니다'],
    why: ['Flexible array members are tied to dynamic allocation, and copying or assigning such structures silently drops the array.', '유연한 배열 멤버는 동적 할당과 엮여 있으며, 그런 구조체를 복사하거나 대입하면 배열이 조용히 빠집니다.'],
    fix: ['Use an array of fixed size or a separate pointer member.', '고정 크기 배열이나 별도의 포인터 멤버를 사용하세요.'],
    check(unit, api) {
      for (const f of nodes(unit, 'FieldDecl')) {
        const t = canon(f.ctype);
        if (t && t.kind === 'array' && t.size == null && !t.vla) api.report(f, msg(`'${f.name}' is a flexible array member.`, `'${f.name}'은(는) 유연한 배열 멤버입니다.`));
      }
    },
  }),
  rule({
    id: '18.8', cat: 'Required', type: 'BUG', debt: 15, decidable: true, cwe: 'CWE-770', cert: 'ARR32-C',
    name: ['Variable-length array types shall not be used', '가변 길이 배열 형을 사용하면 안 됩니다'],
    why: ['The size of a VLA is only known at run time, so stack overflow cannot be ruled out and a non-positive size is undefined behaviour.', 'VLA의 크기는 실행 시에만 알 수 있어 스택 넘침을 배제할 수 없고, 양수가 아닌 크기는 정의되지 않은 동작입니다.'],
    fix: ['Use an array with a constant maximum size and check the run-time size against it.', '상수 최대 크기의 배열을 쓰고 실행 시 크기를 그 값과 비교해 검사하세요.'],
    check(unit, api) {
      for (const a of nodes(unit, 'ArrayDeclarator')) {
        if (!vlaSize(a, unit)) continue;
        const d = cf.enclosing(a, ['VarDecl', 'ParamDecl', 'FieldDecl', 'TypedefDecl', 'TypeName']);
        const nm = d && d.name ? `'${d.name}'` : 'this declaration';
        const nmk = d && d.name ? `'${d.name}'` : '이 선언';
        api.report(a, msg(`${nm} uses a variable-length array type${a.size ? ` of size '${text(unit, a.size)}'` : ''}.`, `${nmk}이(가) 가변 길이 배열 형${a.size ? `(크기 '${text(unit, a.size)}')` : ''}을 사용합니다.`));
      }
    },
  }),
  rule({
    id: '18.9', cat: 'Required', type: 'BUG', debt: 10, decidable: true, amd: 'AMD3', cert: 'EXP35-C',
    name: ['An array in an object with temporary lifetime shall not decay to a pointer', '임시 수명 객체의 배열을 포인터로 변환하면 안 됩니다'],
    why: ['The temporary returned by a function ends with the full expression; a pointer to its array member dangles and modifying it is undefined behaviour.', '함수가 반환한 임시 객체는 전체 식이 끝나면 사라지므로, 그 배열 멤버에 대한 포인터는 댕글링되고 수정하면 정의되지 않은 동작입니다.'],
    fix: ['Store the returned structure in a variable first and use the array of that variable.', '반환된 구조체를 먼저 변수에 저장하고 그 변수의 배열을 사용하세요.'],
    check(unit, api) {
      for (const m of nodes(unit, 'MemberExpr')) {
        if (m.arrow || !isArrayType(m.ctype) || !isTemporary(m.object)) continue;
        let n = m;
        let p = cf.parentOf(n);
        while (p && p.type === 'ParenExpr') { n = p; p = cf.parentOf(p); }
        if (p && (p.type === 'SizeofExpr' || p.type === 'AlignofExpr' || (p.type === 'MemberExpr' && !p.arrow))) continue;
        api.report(m, msg(`The array member '${m.member}' of the temporary '${text(unit, m.object)}' is converted to a pointer.`, `임시 객체 '${text(unit, m.object)}'의 배열 멤버 '${m.member}'이(가) 포인터로 변환됩니다.`));
      }
    },
  }),
  rule({
    id: '18.10', cat: 'Mandatory', type: 'BUG', debt: 15, decidable: true, amd: 'AMD3',
    name: ['Pointers to variably-modified array types shall not be used', '가변 수정 배열 형에 대한 포인터를 사용하면 안 됩니다'],
    why: ['Pointers to arrays whose size is only known at run time make size mismatches between pointer and object undetectable and undefined.', '실행 시에만 크기를 아는 배열에 대한 포인터는 포인터와 객체의 크기 불일치를 알아낼 수 없게 하고 정의되지 않은 동작을 낳습니다.'],
    fix: ['Use pointers to arrays of constant size, or plain element pointers with an explicit length.', '상수 크기 배열에 대한 포인터나, 길이를 명시한 요소 포인터를 사용하세요.'],
    check(unit, api) {
      const scan = (owner, decl, isParam, name) => {
        const chain = declChain(decl);
        for (let i = 0; i < chain.length; i++) {
          const a = chain[i];
          if (a.type !== 'ArrayDeclarator' || !vlaSize(a, unit)) continue;
          const inner = chain.slice(i + 1);
          if (inner.some((x) => x.type === 'PointerDeclarator') || (isParam && inner.some((x) => x.type === 'ArrayDeclarator'))) {
            api.report(owner, msg(`${name ? `'${name}'` : 'This type'} is a pointer to the variably-modified array type '${text(unit, a.size || a)}'.`, `${name ? `'${name}'` : '이 형'}은(는) 가변 수정 배열 형('${text(unit, a.size || a)}')에 대한 포인터입니다.`));
            return;
          }
        }
      };
      for (const d of nodes(unit, ['VarDecl', 'FieldDecl', 'TypedefDecl'])) scan(d, d.declarator, false, d.name);
      for (const p of nodes(unit, 'ParamDecl')) scan(p, p.declarator, true, p.name);
      for (const t of nodes(unit, 'TypeName')) scan(t, t.declarator, false, null);
    },
  }),
];
