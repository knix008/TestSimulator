'use strict';

// MISRA C:2004 chapter 8 — declarations and definitions; chapter 9 — initialisation.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');

const { cf, T } = U;

function fnType(t) { const c = t && T.canonical(t); return c && c.kind === 'function' ? c : null; }

function prototypes(unit, api) {
  for (const c of U.get(unit, 'CallExpr')) {
    const s = c.calleeSymbol || (U.strip(c.callee) && U.strip(c.callee).symbol);
    if (!s || s.kind !== 'function') continue;
    const ft = fnType(s.type);
    if (s.implicit) { if (!U.B.maybeDeclaredInMissingHeader(unit, api.project, s)) api.report(c, M(`'${s.name}' is called without a visible prototype.`, `'${s.name}'를 보이는 프로토타입 없이 호출했습니다.`)); }
    else if (ft && ft.prototype === false && !s.system) api.report(c, M(`'${s.name}' is called through a declaration that is not a prototype.`, `'${s.name}'를 프로토타입이 아닌 선언으로 호출했습니다.`));
  }
  for (const f of U.funcs(unit)) {
    const s = f.symbol;
    if (!s || f.name === 'main') continue;
    const ft = fnType(f.ctype);
    if (f.oldStyle || (ft && ft.prototype === false)) { api.report(f.nameLoc || f, M(`'${f.name}' is defined without a prototype.`, `'${f.name}'를 프로토타입 없이 정의했습니다.`)); continue; }
    if (s.linkage !== 'external') continue;
    const earlier = (s.decls || []).some((d) => d !== f && d.type === 'FunctionDecl' && d.loc && (d.loc.file !== f.loc.file || d.loc.start < f.loc.start));
    if (!earlier) api.report(f.nameLoc || f, M(`No prototype of '${f.name}' is visible at its definition.`, `'${f.name}'의 정의 지점에서 보이는 프로토타입이 없습니다.`));
  }
}

const tstr = (t) => U.tstr(t);

function identicalTypes(project, api) {
  const seen = new Set();
  for (const unit of project.units || []) {
    for (const s of unit.symbols || []) {
      if (s.kind !== 'function' || s.system || s.implicit) continue;
      const decls = (s.decls || []).filter((d) => d.type === 'FunctionDecl' && U.user(d));
      if (decls.length < 2) continue;
      const ref = decls[0];
      for (const d of decls.slice(1)) {
        const k = `${d.loc.file}:${d.loc.line}:${d.loc.col}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const a = tstr(ref.ctype), b = tstr(d.ctype);
        if (a !== b) api.report(d.nameLoc || d, M(`'${s.name}' is declared as '${b}' here but as '${a}' elsewhere.`, `'${s.name}'를 여기서는 '${b}'로, 다른 곳에서는 '${a}'로 선언했습니다.`));
      }
    }
  }
  for (const g of (project.globalSymbols || new Map()).values()) {
    if (g.kind !== 'function' || g.system || g.typeMismatch) continue;
    const ts = new Set((g.decls || []).map((d) => d.typeString));
    if (ts.size < 2) continue;
    const ref = g.decls[0];
    for (const d of g.decls.slice(1)) {
      const k = `${d.file}:${d.line}:${d.col}`;
      if (d.typeString !== ref.typeString && !seen.has(k)) {
        seen.add(k);
        api.report({ file: d.file, line: d.line, col: d.col }, M(`'${g.name}' is declared as '${d.typeString}' here but as '${ref.typeString}' elsewhere.`, `'${g.name}'를 여기서는 '${d.typeString}'로, 다른 곳에서는 '${ref.typeString}'로 선언했습니다.`));
      }
    }
  }
}

function compatibleTypes(project, api) {
  for (const g of (project.globalSymbols || new Map()).values()) {
    if (!g.typeMismatch || g.system) continue;
    const ref = g.decls[0];
    for (const d of g.decls.slice(1)) {
      if (d.typeString === ref.typeString || U.isBuiltin(d.file)) continue;
      api.report({ file: d.file, line: d.line, col: d.col }, M(`'${g.name}' is declared with the incompatible type '${d.typeString}' (elsewhere '${ref.typeString}').`, `'${g.name}'를 호환되지 않는 형식 '${d.typeString}'로 선언했습니다(다른 곳에서는 '${ref.typeString}').`));
    }
  }
}

function headerDefinitions(unit, api) {
  for (const f of U.get(unit, 'FunctionDecl')) {
    if (!f.body || !cf.isHeader(f.loc.file) || !U.firstScan(api, 'c04-8.5', `${f.loc.file}:${f.loc.line}`)) continue;
    api.report(f.nameLoc || f, M(`Function '${f.name}' is defined in a header file.`, `함수 '${f.name}'를 헤더 파일에서 정의했습니다.`));
  }
  for (const v of U.get(unit, 'VarDecl')) {
    if (!cf.isHeader(v.loc.file) || cf.enclosing(v, ['FunctionDecl', 'RecordDecl'])) continue;
    const st = (v.specs && v.specs.storage) || [];
    if (st.includes('extern') || st.includes('typedef')) continue;
    if (!U.firstScan(api, 'c04-8.5', `${v.loc.file}:${v.loc.line}:${v.loc.col}`)) continue;
    api.report(v.nameLoc || v, M(`Object '${v.name}' is defined in a header file.`, `객체 '${v.name}'를 헤더 파일에서 정의했습니다.`));
  }
}

module.exports = [
  C04({
    id: '8.1', cat: 'R', dec: true, c2012: '8.2', cwe: 'CWE-628',
    name: ['Prototypes shall be visible at function definitions and calls', '함수 정의와 호출 지점에서 프로토타입이 보여야 합니다'],
    why: ['Without a prototype the compiler cannot check argument types and counts.', '프로토타입이 없으면 컴파일러가 인수의 형식과 개수를 검사할 수 없습니다.'],
    fix: ['Declare a prototype in a header and include it where the function is defined and called.', '헤더에 프로토타입을 선언하고 함수를 정의하고 호출하는 곳에서 포함하세요.'],
    check: prototypes,
  }),
  C04({
    id: '8.2', cat: 'R', dec: true, c2012: '8.1',
    name: ['Types shall be explicitly stated in every declaration', '모든 선언에서 형식을 명시해야 합니다'],
    why: ['Implicit int hides the intended type and was removed from later C standards.', '암시적 int는 의도한 형식을 숨기며 이후 C 표준에서 제거되었습니다.'],
    fix: ['Write the type of every object, parameter and function result.', '모든 객체, 매개변수, 함수 결과의 형식을 쓰세요.'],
    reuse: 'misra-c:8.1',
  }),
  C04({
    id: '8.3', cat: 'R', dec: true, c2012: '8.3',
    name: ['Declarations and definition of a function shall use identical types', '함수의 선언과 정의는 동일한 형식을 사용해야 합니다'],
    why: ['Differences in parameter or return types, even through typedefs, hide inconsistencies.', 'typedef를 통한 것이라도 매개변수나 반환 형식이 다르면 불일치가 숨습니다.'],
    fix: ['Spell the return and parameter types the same way in every declaration.', '모든 선언에서 반환 형식과 매개변수 형식을 같은 방식으로 쓰세요.'],
    project: identicalTypes,
  }),
  C04({
    id: '8.4', cat: 'R', dec: true, type: 'BUG', c2012: '8.4', cwe: 'CWE-628',
    name: ['Repeated declarations of an object or function shall be compatible', '객체나 함수를 여러 번 선언하면 형식이 호환되어야 합니다'],
    why: ['Incompatible declarations of one entity cause undefined behaviour.', '한 개체를 호환되지 않게 선언하면 정의되지 않은 동작이 생깁니다.'],
    fix: ['Declare the entity once in a header and include it everywhere.', '개체를 헤더에서 한 번 선언하고 모든 곳에서 포함하세요.'],
    project: compatibleTypes,
  }),
  C04({
    id: '8.5', cat: 'R', dec: true,
    name: ['Objects and functions shall not be defined in header files', '헤더 파일에서 객체나 함수를 정의하지 않아야 합니다'],
    why: ['A definition in a header is duplicated in every file that includes it.', '헤더의 정의는 그 헤더를 포함하는 모든 파일에 중복됩니다.'],
    fix: ['Keep only declarations in the header and move the definition to a .c file.', '헤더에는 선언만 두고 정의는 .c 파일로 옮기세요.'],
    check: headerDefinitions,
  }),
  C04({
    id: '8.6', cat: 'R', dec: true,
    name: ['Functions shall be declared at file scope', '함수는 파일 범위에서 선언해야 합니다'],
    why: ['A block-scope function declaration is easily missed and can conflict with the real one.', '블록 범위 함수 선언은 놓치기 쉽고 실제 선언과 충돌할 수 있습니다.'],
    fix: ['Move the declaration to file scope, ideally to a header.', '선언을 파일 범위, 가능하면 헤더로 옮기세요.'],
    check: S.blockScopeFunctions,
  }),
  C04({
    id: '8.7', cat: 'R', dec: true, c2012: '8.9',
    name: ['Objects used by one function shall be defined at block scope', '한 함수에서만 쓰는 객체는 블록 범위에서 정의해야 합니다'],
    why: ['File-scope objects are visible to more code than needed.', '파일 범위 객체는 필요 이상으로 많은 코드에 보입니다.'],
    fix: ['Move the object into the only function that uses it.', '객체를 그 객체를 쓰는 유일한 함수 안으로 옮기세요.'],
    reuse: 'misra-c:8.9',
  }),
  C04({
    id: '8.8', cat: 'R', dec: true, c2012: '8.5',
    name: ['An external object or function shall be declared in one file only', '외부 객체나 함수는 한 파일에서만 선언해야 합니다'],
    why: ['Several declarations of one entity can drift apart.', '한 개체의 여러 선언은 서로 달라질 수 있습니다.'],
    fix: ['Declare it once in a header file.', '헤더 파일에서 한 번만 선언하세요.'],
    reuse: 'misra-c:8.5',
  }),
  C04({
    id: '8.9', cat: 'R', dec: true, type: 'BUG', c2012: '8.6',
    name: ['An external identifier shall have exactly one definition', '외부 식별자는 정의가 정확히 하나여야 합니다'],
    why: ['No definition or several definitions is undefined behaviour at link time.', '정의가 없거나 여러 개이면 링크 시 정의되지 않은 동작입니다.'],
    fix: ['Provide exactly one definition in one source file.', '한 소스 파일에 정확히 하나의 정의를 두세요.'],
    reuse: 'misra-c:8.6',
  }),
  C04({
    id: '8.10', cat: 'R', dec: true, c2012: '8.7',
    name: ['File-scope entities shall have internal linkage unless needed externally', '파일 범위 개체는 외부에서 필요하지 않으면 내부 연결이어야 합니다'],
    why: ['Unneeded external linkage widens the interface and risks name clashes.', '불필요한 외부 연결은 인터페이스를 넓히고 이름 충돌 위험을 키웁니다.'],
    fix: ['Declare the object or function static.', '객체나 함수를 static으로 선언하세요.'],
    reuse: 'misra-c:8.7',
  }),
  C04({
    id: '8.11', cat: 'R', dec: true, c2012: '8.8',
    name: ['static shall be used on internal-linkage declarations', '내부 연결 선언에는 static을 사용해야 합니다'],
    why: ['A redeclaration without static hides the internal linkage from readers.', 'static 없는 재선언은 읽는 사람에게 내부 연결을 숨깁니다.'],
    fix: ['Repeat static on every declaration of the entity.', '개체의 모든 선언에 static을 반복해서 쓰세요.'],
    reuse: 'misra-c:8.8',
  }),
  C04({
    id: '8.12', cat: 'R', dec: true, c2012: '8.11',
    name: ['External arrays shall have an explicit or initialised size', '외부 배열은 크기를 명시하거나 초기화로 정해야 합니다'],
    why: ['An array declared without size cannot be checked against its definition.', '크기 없이 선언한 배열은 정의와 비교해 검사할 수 없습니다.'],
    fix: ['State the size in the declaration.', '선언에 크기를 쓰세요.'],
    reuse: 'misra-c:8.11',
  }),
  // ---------------------------------------------------------------- chapter 9
  C04({
    id: '9.1', cat: 'R', dec: false, type: 'BUG', sev: 'CRITICAL', c2012: '9.1', cwe: 'CWE-457',
    name: ['Automatic variables shall be set before use', '자동 변수는 사용하기 전에 값을 설정해야 합니다'],
    why: ['Reading an uninitialised automatic variable gives an indeterminate value.', '초기화되지 않은 자동 변수를 읽으면 값이 불확정입니다.'],
    fix: ['Initialise the variable or assign it on every path before reading.', '변수를 초기화하거나 읽기 전에 모든 경로에서 대입하세요.'],
    reuse: 'misra-c:9.1',
  }),
  C04({
    id: '9.2', cat: 'R', dec: true, c2012: '9.2',
    name: ['Braces shall match the structure of aggregate initialisers', '집합체 초기화자의 중괄호는 구조와 맞아야 합니다'],
    why: ['Brace elision makes it unclear which member each value initialises.', '중괄호 생략은 각 값이 어떤 멤버를 초기화하는지 불분명하게 합니다.'],
    fix: ['Add braces for every nested array or structure; { 0 } is allowed.', '중첩된 배열이나 구조체마다 중괄호를 쓰세요. { 0 }은 허용됩니다.'],
    reuse: 'misra-c:9.2',
  }),
  C04({
    id: '9.3', cat: 'R', dec: true, c2012: '8.12',
    name: ['Enumerators shall be initialised all, first only, or none', '열거자는 모두, 첫 번째만, 또는 전혀 초기화하지 않아야 합니다'],
    why: ['Mixing explicit and implicit enumerator values easily creates duplicates.', '명시적 열거자 값과 암시적 값을 섞으면 중복이 쉽게 생깁니다.'],
    fix: ['Initialise only the first enumerator or every enumerator.', '첫 번째 열거자만 또는 모든 열거자를 초기화하세요.'],
    check: S.enumInit,
  }),
];
