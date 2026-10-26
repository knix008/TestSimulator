'use strict';

// Pointer arithmetic checks (MISRA C:2004 17.1/17.4, C++:2008 5-0-15/5-0-16).

const U = require('./util');

const { cf, T, M } = U;

const isPtr = (e) => { const c = e && e.ctype && U.canon(T.nonRef(e.ctype)); return !!c && c.kind === 'pointer'; };
const isArr = (e) => { const c = e && e.ctype && U.canon(T.nonRef(e.ctype)); return !!c && c.kind === 'array'; };
const ptrLike = (e) => isPtr(e) || isArr(e);

// Every pointer arithmetic operation: [{ node, ptr, op }]
function arithmetic(unit) {
  return U.memo(unit, 'legacy.ptrArith', () => {
    const out = [];
    for (const b of U.get(unit, 'BinaryExpr')) {
      if (b.op !== '+' && b.op !== '-') continue;
      if (ptrLike(b.left) && ptrLike(b.right)) continue; // pointer difference
      if (ptrLike(b.left)) out.push({ node: b, ptr: b.left, op: b.op });
      else if (ptrLike(b.right)) out.push({ node: b, ptr: b.right, op: b.op });
    }
    for (const a of U.get(unit, 'AssignExpr')) if ((a.op === '+=' || a.op === '-=') && isPtr(a.left)) out.push({ node: a, ptr: a.left, op: a.op });
    for (const n of U.get(unit, 'UnaryExpr')) if ((n.op === '++' || n.op === '--') && isPtr(n.arg)) out.push({ node: n, ptr: n.arg, op: n.op });
    return out;
  });
}

// Indexing applied to an object that is not declared as an array.
function nonArrayIndexing(unit) {
  const out = [];
  for (const ix of U.get(unit, 'IndexExpr')) {
    const o = U.strip(ix.object);
    if (!isPtr(o)) continue;
    if (o.type === 'Identifier' && o.symbol && o.symbol.kind === 'parameter') {
      const d = (o.symbol.decls || []).find((x) => x.type === 'ParamDecl');
      const dt = d && d.declaredType && U.canon(d.declaredType);
      if (dt && dt.kind === 'array') continue;
    }
    out.push(ix);
  }
  return out;
}

function ptrArithmetic(unit, api, withIndexing) {
  for (const a of arithmetic(unit)) {
    api.report(a.node, M(`Pointer arithmetic '${a.op}' is applied to '${U.code(unit, a.ptr)}'; use array indexing.`, `'${U.code(unit, a.ptr)}'에 포인터 연산 '${a.op}'를 적용했습니다. 배열 인덱싱을 사용하세요.`));
  }
  if (withIndexing) {
    for (const ix of nonArrayIndexing(unit)) api.report(ix, M(`'${U.code(unit, ix.object)}' is indexed but is not declared as an array.`, `'${U.code(unit, ix.object)}'는 배열로 선언되지 않았는데 인덱싱했습니다.`));
  }
}

// The pointer refers to a single object (not an array element).
function pointsToScalar(unit, e) {
  const x = U.strip(e);
  if (!x) return null;
  const scalarAddr = (v) => {
    const y = U.strip(v);
    if (!y || y.type !== 'UnaryExpr' || y.op !== '&') return null;
    const t = U.strip(y.arg);
    if (!t || t.type === 'IndexExpr') return null;
    return isArr(t) ? null : t;
  };
  const direct = scalarAddr(x);
  if (direct) return direct;
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind === 'variable') {
    const d = x.symbol.definition;
    if (!d || d.type !== 'VarDecl' || !d.init) return null;
    const target = scalarAddr(d.init);
    if (!target) return null;
    // other assignments to the pointer make the target unknown
    const writes = (x.symbol.uses || []).filter((u) => { const w = U.P.writeKind(u); return w === 'assign' || w === 'compound' || w === 'incdec'; });
    const self = writes.filter((w) => !cf.ancestors(w).includes(e) && w !== x);
    return self.length ? null : target;
  }
  return null;
}

function arithmeticOnScalar(unit, api) {
  for (const a of arithmetic(unit)) {
    const t = pointsToScalar(unit, a.ptr);
    if (t) api.report(a.node, M(`Pointer arithmetic on '${U.code(unit, a.ptr)}', which points to the single object '${U.code(unit, t)}' and not to an array.`, `'${U.code(unit, a.ptr)}'는 배열이 아닌 단일 객체 '${U.code(unit, t)}'를 가리키는데 포인터 연산을 했습니다.`));
  }
  for (const ix of U.get(unit, 'IndexExpr')) {
    const t = pointsToScalar(unit, ix.object);
    if (t && U.iceValue(unit, ix.index) !== 0n) api.report(ix, M(`'${U.code(unit, ix.object)}' points to the single object '${U.code(unit, t)}' but is indexed.`, `'${U.code(unit, ix.object)}'는 단일 객체 '${U.code(unit, t)}'를 가리키는데 인덱싱했습니다.`));
  }
}

module.exports = { arithmetic, nonArrayIndexing, ptrArithmetic, pointsToScalar, arithmeticOnScalar, isPtr, isArr };
