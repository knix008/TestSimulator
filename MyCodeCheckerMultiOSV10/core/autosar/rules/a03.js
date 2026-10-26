'use strict';

// AUTOSAR C++14 chapter 3 — basic concepts (files, ODR, scope, linkage,
// storage duration, types) and MISRA C++:2008 M3 rules.

const path = require('path');
const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const HEADER_EXT = new Set(['.h', '.hpp', '.hxx']);
const LOOPS = new Set(['ForStmt', 'WhileStmt', 'DoStmt', 'RangeForStmt']);

// Is the static-storage initializer a constant initialization?
function nonConstantInit(init) {
  let bad = null;
  cf.walk(init, (n) => {
    if (bad) return cf.walk.STOP;
    if (n.type === 'LambdaExpr' || n.type === 'SizeofExpr' || n.type === 'AlignofExpr') return cf.walk.SKIP;
    if (n.type === 'CallExpr') {
      const s = n.calleeSymbol || (U.strip(n.callee) && U.strip(n.callee).symbol);
      const cexpr = s && (s.isConstexpr || (s.decls || []).some((d) => U.hasFnSpec(d, 'constexpr') || U.hasFnSpec(d, 'consteval')));
      if (!cexpr) bad = n;
    } else if (n.type === 'NewExpr') bad = n;
    else if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable') && n.symbol.storage !== 'none') {
      const t = U.canon(n.symbol.type);
      const constant = n.symbol.isConstexpr || (t.const && n.symbol.constInit);
      const { p } = U.upParens(n);
      const addressOf = p && p.type === 'UnaryExpr' && p.op === '&';
      if (!constant && !addressOf && t.kind !== 'array' && t.kind !== 'function') bad = n;
    }
    return undefined;
  });
  return bad;
}

// The first-level nested compound statement (below `outer`) containing node.
function nestedBlock(node, outer) {
  let child = null;
  for (const a of cf.ancestors(node)) {
    if (a === outer) return child;
    if (a.type === 'CompoundStmt') child = a;
    if (LOOPS.has(a.type) || a.type === 'LambdaExpr') child = 'loop';
  }
  return null;
}

module.exports = [
  D('A3-1-1', ['6.2.4']),
  A({
    id: 'A3-1-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Project header files shall use the extension .h, .hpp or .hxx', '프로젝트 헤더 파일은 .h, .hpp, .hxx 확장자를 써야 합니다'],
    why: ['A uniform header extension lets tools and readers tell interfaces from implementation files.', '헤더 확장자를 통일해야 도구와 사람이 인터페이스와 구현 파일을 구별할 수 있습니다.'],
    fix: ['Rename the header to use .h, .hpp or .hxx.', '헤더 이름을 .h, .hpp, .hxx 로 바꾸세요.'],
    check(unit, api) {
      for (const inc of unit.includes || []) {
        if (inc.angled || U.isBuiltin(inc.file)) continue;
        const ext = path.extname(inc.name || '').toLowerCase();
        if (!HEADER_EXT.has(ext)) api.report(inc, M(`The project header '${inc.name}' does not use a .h, .hpp or .hxx extension.`, `프로젝트 헤더 '${inc.name}' 의 확장자가 .h, .hpp, .hxx 가 아닙니다.`));
      }
    },
  }),
  A({
    id: 'A3-1-3', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Implementation files that define code should have the extension .cpp', '코드를 정의하는 구현 파일은 .cpp 확장자를 써야 합니다'],
    why: ['A single implementation extension keeps build scripts and tools consistent.', '구현 파일 확장자를 하나로 통일하면 빌드 스크립트와 도구가 일관됩니다.'],
    fix: ['Rename the file to use the .cpp extension.', '파일 이름을 .cpp 확장자로 바꾸세요.'],
    check(unit, api) {
      if (unit.standaloneHeader || cf.isHeader(unit.file) || U.isBuiltin(unit.file)) return;
      if (path.extname(unit.file) !== '.cpp') api.report({ file: unit.file, line: 1, col: 1 }, M(`The implementation file '${path.basename(unit.file)}' does not use the .cpp extension.`, `구현 파일 '${path.basename(unit.file)}' 의 확장자가 .cpp 가 아닙니다.`));
    },
  }),
  D('A3-1-4', ['6.0.2'], { cat: 'Required' }),
  D('A3-3-1', ['6.5.1'], { cat: 'Required' }),
  A({
    id: 'A3-3-2', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 15,
    name: ['Static and thread-local objects shall be constant-initialized', '정적 객체와 스레드 지역 객체는 상수 초기화해야 합니다'],
    why: ['Dynamic initialization of static objects runs in an unspecified order across translation units (the static initialization order fiasco).', '정적 객체의 동적 초기화는 번역 단위 사이에서 순서가 정해지지 않습니다(정적 초기화 순서 문제).'],
    fix: ['Initialize with a constant expression (constexpr), or use a function-local static accessor.', '상수 식(constexpr)으로 초기화하거나 함수 지역 static 접근 함수를 쓰세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        if (!v.init || !v.symbol || (v.symbol.storage !== 'static' && v.symbol.storage !== 'thread')) continue;
        if (cf.enclosing(v, ['FunctionDecl', 'LambdaExpr'])) continue; // function-local statics are initialised on first use
        const bad = nonConstantInit(v.init);
        if (bad) api.report(U.at(v), M(`The static object '${v.name}' is not constant-initialized.`, `정적 객체 '${v.name}' 이(가) 상수 초기화되지 않습니다.`));
      }
    },
  }),
  D('A3-9-1', ['6.9.2']),
  D('M3-1-2', ['6.0.1'], { name: ['Functions shall not be declared at block scope', '함수를 블록 범위에서 선언하면 안 됩니다'] }),
  D('M3-2-1', ['6.2.2']),
  D('M3-2-2', ['6.2.1']),
  D('M3-2-3', ['6.2.3'], { name: ['A type, object or function used in several translation units shall be declared in one file only', '여러 번역 단위에서 쓰는 형식, 객체, 함수는 한 파일에서만 선언해야 합니다'] }),
  A({
    id: 'M3-2-4', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['An identifier with external linkage shall have exactly one definition', '외부 링키지 식별자는 정의가 정확히 하나여야 합니다'],
    why: ['Several definitions of the same external entity violate the one-definition rule; the linker may pick either one.', '같은 외부 개체를 여러 번 정의하면 단일 정의 규칙을 어기며, 링커가 아무 것이나 고를 수 있습니다.'],
    fix: ['Keep one definition and turn the others into declarations.', '정의 하나만 남기고 나머지는 선언으로 바꾸세요.'],
    project(project, api) {
      for (const g of project.globalSymbols.values()) {
        if (!g.multipleDefinitions || g.system) continue;
        const cppUnits = new Set(project.units.filter((u) => u.lang === 'cpp').map((u) => u.file));
        const defs = (g.definitions || []).filter((d) => cppUnits.has(typeof d.unit === 'string' ? d.unit : d.unit && d.unit.file) && !U.isBuiltin(d.file));
        const files = new Set(defs.map((d) => `${d.file}:${d.line}`));
        if (files.size < 2) continue;
        for (const d of defs.slice(1)) api.report({ file: d.file, line: d.line, col: d.col }, M(`'${g.name}' is defined more than once (also at ${defs[0].file}:${defs[0].line}).`, `'${g.name}' 이(가) 두 번 이상 정의되었습니다(${defs[0].file}:${defs[0].line} 에도 있습니다).`));
      }
    },
  }),
  A({
    id: 'M3-3-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['If a function has internal linkage then all its redeclarations shall include the static storage class specifier', '내부 링키지 함수는 모든 재선언에 static 을 붙여야 합니다'],
    why: ['A redeclaration without static still has internal linkage, which readers easily miss.', 'static 이 없는 재선언도 내부 링키지를 가지지만 읽는 사람은 이를 놓치기 쉽습니다.'],
    fix: ['Add static to every declaration of the function.', '함수의 모든 선언에 static 을 붙이세요.'],
    check(unit, api) {
      for (const s of unit.symbols || []) {
        if (s.kind !== 'function' || s.linkage !== 'internal' || s.system) continue;
        const decls = (s.decls || []).filter((d) => d.type === 'FunctionDecl' && U.user(d));
        if (!decls.some((d) => U.hasStorage(d, 'static'))) continue; // internal through an unnamed namespace
        for (const d of decls) if (!U.hasStorage(d, 'static')) api.report(U.at(d), M(`This redeclaration of the internal function '${s.name}' omits static.`, `내부 함수 '${s.name}' 의 이 재선언에 static 이 빠졌습니다.`));
      }
    },
  }),
  A({
    id: 'M3-4-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Objects should be declared in the smallest block that contains all their uses', '객체는 모든 사용처를 포함하는 가장 작은 블록에서 선언해야 합니다'],
    why: ['Declaring an object in a wider scope than needed exposes it to accidental reuse and makes the code harder to follow.', '필요보다 넓은 범위에서 객체를 선언하면 실수로 다시 쓰일 수 있고 코드를 따라가기 어렵습니다.'],
    fix: ['Move the declaration into the block where the object is used.', '객체를 쓰는 블록 안으로 선언을 옮기세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        if (!v.symbol || v.symbol.storage !== 'automatic' || U.hasStorage(v, 'static')) continue;
        const decl = U.parent(v);
        const outer = decl && U.parent(decl);
        if (!outer || outer.type !== 'CompoundStmt') continue;
        const uses = (v.symbol.uses || []).filter((n) => n.type === 'Identifier');
        if (!uses.length) continue;
        const blocks = new Set(uses.map((n) => nestedBlock(n, outer)));
        if (blocks.size !== 1) continue;
        const b = [...blocks][0];
        if (!b || b === 'loop') continue;
        api.report(U.at(v), M(`'${v.name}' is only used inside a nested block and can be declared there.`, `'${v.name}' 은(는) 안쪽 블록에서만 쓰이므로 그곳에서 선언할 수 있습니다.`));
      }
    },
  }),
  D('M3-9-1', ['6.9.1'], { name: ['The types used for an entity shall be token-for-token identical in all declarations', '한 개체의 모든 선언에서 형식은 토큰 단위로 같아야 합니다'] }),
  A({
    id: 'M3-9-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['The underlying bit representations of floating-point values shall not be used', '부동소수점 값의 비트 표현을 직접 쓰면 안 됩니다'],
    why: ['The bit layout of floating-point types is implementation-defined and accessing it through another type breaks aliasing rules.', '부동소수점 형식의 비트 배치는 구현 정의이고, 다른 형식으로 접근하면 별칭 규칙을 어깁니다.'],
    fix: ['Use the standard floating-point functions (frexp, signbit, std::numeric_limits) instead.', '대신 표준 부동소수점 함수(frexp, signbit, std::numeric_limits)를 쓰세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg || !c.ctype) continue;
        const from = U.pointee(c.arg.ctype);
        const to = U.pointee(c.ctype);
        if (!from || !to) continue;
        if (U.canon(from).kind === 'float' && U.canon(to).kind === 'int') api.report(c, M('A pointer to a floating-point object is converted to a pointer to an integer type.', '부동소수점 객체 포인터를 정수 형식 포인터로 변환합니다.'));
      }
    },
  }),
];
