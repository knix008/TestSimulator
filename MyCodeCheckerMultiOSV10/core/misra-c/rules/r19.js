'use strict';

// MISRA C:2012 / 2023 chapter 19 — overlapping storage.

const B = require('../lib/b-common');

const { cf, rule, msg, nodes, text, skipParens, canon } = B;

// Path of an lvalue through members: { sym, path: ['u', '.a'] , unionAt }
function memberPath(e) {
  const parts = [];
  let x = skipParens(e);
  let unionSeen = false;
  for (let i = 0; i < 30 && x; i++) {
    if (x.type === 'Identifier') return x.symbol ? { sym: x.symbol, parts: parts.reverse(), unionSeen } : null;
    if (x.type === 'MemberExpr' && !x.arrow) {
      const ot = canon(x.object.ctype);
      if (ot && ot.kind === 'record' && ot.tag === 'union') unionSeen = true;
      parts.push({ member: x.member, union: !!(ot && ot.kind === 'record' && ot.tag === 'union') });
      x = skipParens(x.object);
      continue;
    }
    return null;
  }
  return null;
}

// Two lvalues designate different members of the same union object?
function overlapping(a, b) {
  const pa = memberPath(a), pb = memberPath(b);
  if (!pa || !pb || pa.sym !== pb.sym) return false;
  const n = Math.min(pa.parts.length, pb.parts.length);
  for (let i = 0; i < n; i++) {
    if (pa.parts[i].member !== pb.parts[i].member) return pa.parts[i].union;
  }
  return false;
}

// Constant element offset of a pointer argument into an array object.
function offsetInto(e, unit) {
  const x = B.stripCasts(e);
  if (!x) return null;
  const arr = (id) => (id && id.type === 'Identifier' && id.symbol && id.symbol.kind !== 'parameter' && B.isArrayType(id.symbol.type) ? id.symbol : null);
  const es = (sym) => { const t = canon(sym.type); try { return B.T.sizeOf(t.of, unit.target); } catch (err) { return null; } };
  if (arr(x)) return { sym: x.symbol, off: 0n, es: es(x.symbol) };
  if (x.type === 'UnaryExpr' && x.op === '&') {
    const a = skipParens(x.arg);
    if (a && a.type === 'IndexExpr' && arr(skipParens(a.object))) {
      const k = B.constInt(a.index, unit);
      const sym = skipParens(a.object).symbol;
      if (k !== null) return { sym, off: k, es: es(sym) };
    }
    if (a && a.type === 'Identifier' && a.symbol) return { sym: a.symbol, off: 0n, es: null };
  }
  if (x.type === 'BinaryExpr' && x.op === '+' && arr(skipParens(x.left))) {
    const k = B.constInt(x.right, unit);
    const sym = skipParens(x.left).symbol;
    if (k !== null) return { sym, off: k, es: es(sym) };
  }
  return null;
}

const COPY = new Set(['memcpy', 'strcpy', 'strncpy', 'strcat', 'strncat', 'wmemcpy', 'wcscpy', 'wcsncpy']);

module.exports = [
  rule({
    id: '19.1', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 15, decidable: false, cwe: 'CWE-475', cert: 'EXP43-C',
    name: ['An object shall not be assigned or copied to an overlapping object', '객체를 겹치는 객체로 대입하거나 복사하면 안 됩니다'],
    why: ['Assigning between overlapping storage (such as two members of one union) or copying with memcpy into an overlapping region is undefined behaviour.', '겹치는 저장소(한 공용체의 두 멤버 등) 사이의 대입이나, memcpy로 겹치는 영역에 복사하는 것은 정의되지 않은 동작입니다.'],
    fix: ['Copy through a temporary, or use memmove for overlapping memory regions.', '임시 변수를 거쳐 복사하거나, 겹치는 메모리 영역에는 memmove를 사용하세요.'],
    check(unit, api) {
      for (const a of nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        if (overlapping(a.left, a.right)) api.report(a, msg(`'${text(unit, a.left)}' and '${text(unit, a.right)}' overlap in the same union object.`, `'${text(unit, a.left)}'와(과) '${text(unit, a.right)}'이(가) 같은 공용체 객체에서 겹칩니다.`));
      }
      for (const c of B.libCalls(unit, COPY)) {
        if (c.args.length < 2) continue;
        const d = offsetInto(c.args[0], unit), s = offsetInto(c.args[1], unit);
        if (!d || !s || d.sym !== s.sym) continue;
        const n0 = c.args[2] ? B.constInt(c.args[2], unit) : null;
        let overlap = d.off === s.off;
        if (!overlap && n0 !== null && d.es) overlap = (d.off > s.off ? d.off - s.off : s.off - d.off) * BigInt(d.es) < n0;
        if (!overlap && !c.args[2]) overlap = true; // string functions: unbounded
        if (overlap) {
          const d = { name: s.sym.name };
          const n = B.calleeName(c);
          api.report(c, msg(`'${n}' copies between overlapping regions of '${d.name}'.`, `'${n}'이(가) '${d.name}'의 겹치는 영역 사이에서 복사합니다.`));
        }
      }
    },
  }),
  rule({
    id: '19.2', cat: 'Advisory', debt: 10, decidable: true,
    name: ['The union keyword should not be used', 'union 키워드를 사용하지 않아야 합니다'],
    why: ['Reading a union member other than the one last written gives unspecified or implementation-defined values.', '마지막으로 쓴 멤버가 아닌 공용체 멤버를 읽으면 지정되지 않았거나 구현에 따라 다른 값이 나옵니다.'],
    fix: ['Use separate objects or a structure, or document the deviation when the union is needed.', '별도의 객체나 구조체를 사용하거나, 공용체가 꼭 필요하면 편차를 문서화하세요.'],
    check(unit, api) {
      for (const r of nodes(unit, 'RecordDecl')) {
        if (r.tag !== 'union') continue;
        api.report(r, msg(`The union${r.name ? ` '${r.name}'` : ''} is used.`, `공용체${r.name ? ` '${r.name}'` : ''}을(를) 사용했습니다.`));
      }
    },
  }),
];
// silence unused warning for cf in editors
void cf;
