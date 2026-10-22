'use strict';

// SEI CERT C — ARR: arrays.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const { M, T, cf } = U;

function arrayOf(e) {
  e = U.strip(e);
  const t = e && e.ctype && T.canonical(e.ctype);
  return t && t.kind === 'array' ? t : null;
}

// Array object designated by an expression (Identifier / member of array type).
function arrayObject(e) {
  e = U.strip(e);
  if (!e) return null;
  if ((e.type === 'Identifier' || e.type === 'MemberExpr') && arrayOf(e)) return e;
  return null;
}

// The base array object an expression points into: a, &a[i], a + i.
function pointsInto(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  const a = arrayObject(e);
  if (a) return U.key(unit, a);
  if (e.type === 'UnaryExpr' && e.op === '&') {
    const x = U.strip(e.arg);
    if (x && x.type === 'IndexExpr') return pointsInto(unit, x.object);
  }
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) return pointsInto(unit, e.left);
  return null;
}

const isAddrOf = (e) => (e = U.strip(e)) && e.type === 'UnaryExpr' && e.op === '&' ? U.strip(e.arg) : null;

// Byte access through a character pointer (object representation) is allowed.
function charPointer(t) {
  const c = t && T.canonical(T.decay(T.nonRef(t)));
  return !!c && c.kind === 'pointer' && (T.isVoid(T.canonical(c.to)) || T.isCharType(T.canonical(c.to)));
}

function scalarObject(e) {
  // &x where x is a non-array object (scalar or struct), not viewed as bytes
  const s = U.skip(e);
  if (!s || s.type === 'CastExpr' && charPointer(s.typeName && s.typeName.ctype) || charPointer(s.ctype)) return null;
  const x = isAddrOf(e);
  if (!x) return null;
  if (x.type !== 'Identifier' && x.type !== 'MemberExpr') return null;
  const t = x.ctype && T.canonical(x.ctype);
  if (!t || t.kind === 'array' || t.kind === 'function') return null;
  return x;
}

const SIZEOF = (e) => (e = U.strip(e)) && e.type === 'SizeofExpr' ? e : null;

function elemSize(unit, ptrType) {
  const c = U.canon(ptrType);
  if (!c || (c.kind !== 'pointer' && c.kind !== 'array')) return null;
  const el = c.kind === 'pointer' ? c.to : c.of;
  return T.sizeOf(el, unit.target);
}

function objectSize(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  const a = arrayOf(e);
  if (a) return T.sizeOf(a, unit.target);
  const x = isAddrOf(e);
  if (x && x.ctype) return T.sizeOf(x.ctype, unit.target);
  return null;
}

module.exports = [
  rule('ARR30-C', {
    risk: 'HLH', cwe: ['CWE-119', 'CWE-787', 'CWE-125', 'CWE-129'], sec: true, approx: true, deep: 'absint:OVERRUN', checker: 'OVERRUN',
    name: ['Do not form or use out-of-bounds pointers or array subscripts', '범위를 벗어난 포인터나 배열 첨자를 만들거나 사용하지 마세요'],
    why: ['Reading or writing past the end of an array corrupts memory or leaks data and is the root of most buffer-overflow exploits.', '배열 끝을 넘어 읽거나 쓰면 메모리가 손상되거나 정보가 노출되며 대부분의 버퍼 오버플로 공격의 원인입니다.'],
    fix: ['Keep every index in [0, size): test it against the array length and use < (not <=) in loop bounds.', '모든 첨자를 [0, 크기) 안에 두세요. 배열 길이와 비교하고 반복 조건에는 <= 대신 < 를 쓰세요.'],
  }, {
    check(unit, api) {
      for (const ix of U.nodes(unit, 'IndexExpr')) {
        const a = arrayOf(ix.object);
        if (!a || a.size == null) continue;
        const v = U.constInt(unit, ix.index);
        if (v == null) continue;
        const p = U.parent(ix);
        const addrOnly = p && p.type === 'UnaryExpr' && p.op === '&';
        if (v < 0n || v > BigInt(a.size) || (v === BigInt(a.size) && !addrOnly)) {
          api.report(ix, M(`Index ${v} is outside '${U.src(unit, ix.object)}' of ${a.size} elements.`, `첨자 ${v} 가 원소 ${a.size} 개인 '${U.src(unit, ix.object)}' 범위를 벗어납니다.`));
        }
      }
      // for (i = 0; i <= N; i++) a[i] with N == size of a
      for (const f of U.nodes(unit, 'ForStmt')) {
        const c = U.strip(f.cond);
        if (!c || c.type !== 'BinaryExpr' || c.op !== '<=') continue;
        const iv = U.idSym(c.left);
        const bound = U.constInt(unit, c.right);
        const sizeofBound = U.strip(c.right);
        if (!iv) continue;
        for (const ix of cf.findAll(f.body, 'IndexExpr')) {
          if (U.idSym(ix.index) !== iv) continue;
          const a = arrayOf(ix.object);
          if (!a || a.size == null) continue;
          let hit = bound != null && bound >= BigInt(a.size);
          if (!hit && sizeofBound && sizeofBound.type === 'BinaryExpr' && sizeofBound.op === '/') hit = U.constInt(unit, sizeofBound) === BigInt(a.size);
          if (hit) {
            api.report(ix, M(`Loop runs '${iv.name}' up to ${U.src(unit, c.right)} inclusive, one past the end of '${U.src(unit, ix.object)}' (${a.size} elements).`, `반복문이 '${iv.name}' 를 ${U.src(unit, c.right)} 까지 포함해 돌아 '${U.src(unit, ix.object)}'(원소 ${a.size} 개)의 끝을 하나 넘습니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('ARR32-C', {
    risk: 'HPH', cwe: ['CWE-758', 'CWE-129'], sec: true, approx: true,
    name: ['Ensure size arguments for variable length arrays are in a valid range', '가변 길이 배열의 크기 인수가 유효한 범위인지 보장하세요'],
    why: ['A VLA sized by an unchecked value can be zero, negative or huge and overflows the stack.', '검사하지 않은 값으로 크기를 정한 VLA 는 0, 음수 또는 너무 큰 값이 되어 스택을 넘칠 수 있습니다.'],
    fix: ['Validate the size against a sane upper bound (and > 0) before declaring the VLA, or allocate on the heap.', 'VLA 를 선언하기 전에 크기가 0 보다 크고 적절한 상한 이하인지 검사하거나 힙에 할당하세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'VarDecl')) {
        const t = d.ctype && T.canonical(d.ctype);
        if (!t || t.kind !== 'array' || !t.vla) continue;
        const ad = cf.findFirst(d.declarator, 'ArrayDeclarator');
        const sizeExpr = ad && ad.size;
        if (!sizeExpr) continue;
        const syms = new Set(U.idsIn(sizeExpr).map((i) => i.symbol).filter((s) => s && (s.kind === 'variable' || s.kind === 'parameter')));
        if (!syms.size) continue;
        const fn = U.enclosingFn(d);
        let checked = false;
        for (const s of syms) {
          for (const u of s.uses || []) {
            if (!u.loc || u.loc.start >= d.loc.start || (fn && !cf.ancestors(u).includes(fn))) continue;
            if (U.inCondition(u)) { checked = true; break; }
          }
          if (checked) break;
        }
        if (!checked) api.report(d, M(`VLA '${d.name}' is sized by '${U.src(unit, sizeExpr)}', which is not range-checked first.`, `VLA '${d.name}' 의 크기 '${U.src(unit, sizeExpr)}' 를 먼저 범위 검사하지 않습니다.`));
      }
    },
  }),

  rule('ARR36-C', {
    risk: 'MPM', cwe: ['CWE-469'], approx: true,
    name: ['Do not subtract or compare two pointers that do not refer to the same array', '같은 배열을 가리키지 않는 두 포인터를 빼거나 비교하지 마세요'],
    why: ['Pointer subtraction and relational comparison are defined only within one array object; across objects the result is meaningless.', '포인터 뺄셈과 대소 비교는 한 배열 안에서만 정의되며 서로 다른 객체 사이에서는 의미가 없습니다.'],
    fix: ['Only subtract or compare pointers into the same array; compare indexes or use uintptr_t with care otherwise.', '같은 배열을 가리키는 포인터만 빼거나 비교하세요. 그렇지 않으면 첨자를 비교하세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (!['-', '<', '>', '<=', '>='].includes(b.op)) continue;
        const lt = b.left.ctype && T.decay(T.nonRef(b.left.ctype)), rt = b.right.ctype && T.decay(T.nonRef(b.right.ctype));
        if (!lt || !rt || lt.kind !== 'pointer' || rt.kind !== 'pointer') continue;
        const ka = pointsInto(unit, b.left) || (scalarObject(b.left) && U.key(unit, scalarObject(b.left)));
        const kb = pointsInto(unit, b.right) || (scalarObject(b.right) && U.key(unit, scalarObject(b.right)));
        if (ka && kb && ka !== kb) api.report(b, M(`'${U.src(unit, b.left)}' and '${U.src(unit, b.right)}' point into different objects; '${b.op}' on them is undefined.`, `'${U.src(unit, b.left)}' 와 '${U.src(unit, b.right)}' 는 서로 다른 객체를 가리켜 '${b.op}' 결과가 정의되지 않습니다.`));
      }
    },
  }),

  rule('ARR37-C', {
    risk: 'MPM', cwe: ['CWE-469', 'CWE-823'], approx: true,
    name: ['Do not add or subtract an integer to a pointer to a non-array object', '배열이 아닌 객체를 가리키는 포인터에 정수를 더하거나 빼지 마세요'],
    why: ['Pointer arithmetic on the address of a single object (or struct member) walks into unrelated memory.', '단일 객체(또는 구조체 멤버)의 주소에 포인터 연산을 하면 관계없는 메모리로 넘어갑니다.'],
    fix: ['Use an array when you need to index, or access struct members by name.', '첨자가 필요하면 배열을 쓰고 구조체 멤버는 이름으로 접근하세요.'],
  }, {
    check(unit, api) {
      const scalarPtr = new Map();
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (d.init && !charPointer(d.ctype) && scalarObject(d.init) && d.symbol) scalarPtr.set(d.symbol, scalarObject(d.init));
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        const s = U.idSym(a.left);
        if (!s) continue;
        if (a.op === '=' && !charPointer(s.type) && scalarObject(a.right)) scalarPtr.set(s, scalarObject(a.right));
        else if (a.op === '=' && scalarPtr.has(s)) scalarPtr.delete(s);
      }
      const target = (e) => {
        const so = scalarObject(e);
        if (so) return so;
        const s = U.idSym(e);
        return s && scalarPtr.get(s) ? scalarPtr.get(s) : null;
      };
      const reportOn = (node, base, obj) => api.report(node, M(`Pointer arithmetic on '${U.src(unit, base)}', which points to the single object '${U.src(unit, obj)}'.`, `단일 객체 '${U.src(unit, obj)}' 를 가리키는 '${U.src(unit, base)}' 에 포인터 연산을 합니다.`));
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '+' && b.op !== '-') continue;
        const obj = target(b.left);
        if (obj && U.constInt(unit, b.right) !== 0n) reportOn(b, b.left, obj);
      }
      for (const ix of U.nodes(unit, 'IndexExpr')) {
        const obj = target(ix.object);
        if (obj && U.constInt(unit, ix.index) !== 0n) reportOn(ix, ix.object, obj);
      }
      for (const a of U.nodes(unit, ['AssignExpr', 'UnaryExpr'])) {
        const isInc = a.type === 'UnaryExpr' ? (a.op === '++' || a.op === '--') : (a.op === '+=' || a.op === '-=');
        if (!isInc) continue;
        const e = a.type === 'UnaryExpr' ? a.arg : a.left;
        const s = U.idSym(e);
        if (s && scalarPtr.has(s)) reportOn(a, e, scalarPtr.get(s));
      }
    },
  }),

  rule('ARR38-C', {
    risk: 'HLM', cwe: ['CWE-119', 'CWE-121', 'CWE-122', 'CWE-123', 'CWE-125', 'CWE-805'], sec: true, approx: true, deep: 'absint:OVERRUN', checker: 'BUFFER_SIZE',
    name: ['Guarantee that library functions do not form invalid pointers', '라이브러리 함수가 잘못된 포인터를 만들지 않도록 보장하세요'],
    why: ['memcpy, memset, fread, strncpy and similar trust their size argument; a size larger than either buffer reads or writes out of bounds. sizeof applied to a pointer gives the pointer size, not the buffer size.', 'memcpy, memset, fread, strncpy 등은 크기 인수를 그대로 믿습니다. 크기가 버퍼보다 크면 범위 밖을 읽거나 씁니다. 포인터에 sizeof 를 쓰면 버퍼 크기가 아니라 포인터 크기가 나옵니다.'],
    fix: ['Pass a size derived from the destination object (sizeof array, element count * sizeof element) and never larger than the source.', '대상 객체에서 구한 크기(배열의 sizeof, 원소 수 * 원소 크기)를 넘기고 원본보다 크지 않게 하세요.'],
  }, {
    check(unit, api) {
      // fn: [ [buffer arg indexes], size arg index, elementCountArg? ]
      const FN = {
        memcpy: [[0, 1], 2], memmove: [[0, 1], 2], memset: [[0], 2], memcmp: [[0, 1], 2], memchr: [[0], 2],
        strncpy: [[0], 2], strncat: [[0], 2], strncmp: [[], 2], fgets: [[0], 1], snprintf: [[0], 1], vsnprintf: [[0], 1],
        fread: [[0], 1, 2], fwrite: [[0], 1, 2], read: [[1], 2], write: [[1], 2], recv: [[1], 2], send: [[1], 2],
        wmemcpy: [[0, 1], 2], wmemset: [[0], 2], wcsncpy: [[0], 2], bzero: [[0], 1], explicit_bzero: [[0], 1],
      };
      for (const c of U.libCalls(unit, new Set(Object.keys(FN)))) {
        const [bufs, si, ci] = FN[U.callName(c)];
        const sizeArg = c.args[si];
        if (!sizeArg) continue;
        let n = U.constInt(unit, sizeArg);
        if (n != null && ci != null) { const k = U.constInt(unit, c.args[ci]); n = k == null ? null : n * k; }
        const so = SIZEOF(sizeArg);
        // sizeof(pointer) where the buffer is that pointer
        if (so && so.arg) {
          const x = U.strip(so.arg);
          const xt = x && x.ctype && T.canonical(x.ctype);
          if (xt && xt.kind === 'pointer' && bufs.some((i) => U.key(unit, c.args[i]) && U.key(unit, c.args[i]) === U.key(unit, x))) {
            api.report(c, M(`${U.callName(c)}() size is sizeof(${U.src(unit, x)}), the size of a pointer, not of the buffer it points to.`, `${U.callName(c)}() 의 크기가 가리키는 버퍼가 아니라 포인터 크기인 sizeof(${U.src(unit, x)}) 입니다.`));
            continue;
          }
        }
        if (n == null) continue;
        for (const i of bufs) {
          const size = objectSize(unit, c.args[i]);
          if (size != null && n > BigInt(size)) {
            api.report(c, M(`${U.callName(c)}() accesses ${n} bytes but '${U.src(unit, c.args[i])}' has only ${size}.`, `${U.callName(c)}() 가 ${n} 바이트에 접근하지만 '${U.src(unit, c.args[i])}' 는 ${size} 바이트뿐입니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('ARR39-C', {
    risk: 'HPH', cwe: ['CWE-468'], sec: true,
    name: ['Do not add or subtract a scaled integer to a pointer', '포인터에 크기가 곱해진 정수를 더하거나 빼지 마세요'],
    why: ['Pointer arithmetic already scales by the element size; multiplying by sizeof again moves the pointer far beyond the intended element.', '포인터 연산은 이미 원소 크기만큼 곱해지므로 sizeof 를 다시 곱하면 의도한 원소보다 훨씬 멀리 이동합니다.'],
    fix: ['Add the element count, not a byte count; cast to unsigned char * only when you really need byte offsets.', '바이트 수가 아니라 원소 수를 더하세요. 바이트 오프셋이 정말 필요할 때만 unsigned char * 로 캐스트하세요.'],
  }, {
    check(unit, api) {
      const scaled = (e) => {
        e = U.strip(e);
        if (!e) return false;
        if (e.type === 'SizeofExpr' || e.type === 'OffsetofExpr') return true;
        if (e.type === 'BinaryExpr' && e.op === '*') return scaled(e.left) || scaled(e.right);
        return false;
      };
      const check = (node, ptr, amount) => {
        const pt = ptr && ptr.ctype && T.decay(T.nonRef(ptr.ctype));
        if (!pt || pt.kind !== 'pointer') return;
        const es = elemSize(unit, pt);
        if (es == null || es <= 1) return;
        if (scaled(amount)) api.report(node, M(`'${U.src(unit, amount)}' is a byte count but is added to '${U.src(unit, ptr)}' (elements of ${es} bytes); the offset is scaled twice.`, `바이트 수인 '${U.src(unit, amount)}' 를 원소 크기 ${es} 바이트인 '${U.src(unit, ptr)}' 에 더해 오프셋이 두 번 곱해집니다.`));
      };
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op === '+') { check(b, b.left, b.right); check(b, b.right, b.left); } else if (b.op === '-') check(b, b.left, b.right);
      }
      for (const a of U.nodes(unit, 'AssignExpr')) if (a.op === '+=' || a.op === '-=') check(a, a.left, a.right);
    },
  }),

  rule('ARR01-C', {
    risk: 'HPL', cwe: ['CWE-467'],
    name: ['Do not apply the sizeof operator to a pointer when taking the size of an array', '배열 크기를 구할 때 포인터에 sizeof 를 쓰지 마세요'],
    why: ['An array parameter is really a pointer, so sizeof gives the pointer size and loops or copies based on it are wrong.', '배열 매개변수는 실제로 포인터라 sizeof 가 포인터 크기를 주어 이에 기반한 반복이나 복사가 틀립니다.'],
    fix: ['Pass the element count as a separate parameter and use it instead of sizeof.', '원소 수를 별도 매개변수로 넘겨 sizeof 대신 사용하세요.'],
  }, {
    check(unit, api) {
      for (const so of U.nodes(unit, 'SizeofExpr')) {
        const s = U.idSym(so.arg);
        if (!s || s.kind !== 'parameter') continue;
        const d = (s.decls || []).find((x) => x.type === 'ParamDecl');
        const declared = d && d.declaredType && T.canonical(d.declaredType);
        if (declared && declared.kind === 'array') api.report(so, M(`sizeof(${s.name}) is the size of a pointer: parameter '${s.name}' was declared as an array but is adjusted to ${U.tstr(d.ctype)}.`, `sizeof(${s.name}) 는 포인터 크기입니다. 배열로 선언한 매개변수 '${s.name}' 는 ${U.tstr(d.ctype)} 로 조정됩니다.`));
      }
    },
  }),
];
