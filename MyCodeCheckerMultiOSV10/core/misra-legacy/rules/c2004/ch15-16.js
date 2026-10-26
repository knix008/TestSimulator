'use strict';

// MISRA C:2004 chapter 15 — switch statements; chapter 16 — functions.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');

const { cf, T } = U;

function unnamedPrototypeParams(unit, api) {
  for (const f of U.get(unit, 'FunctionDecl')) {
    if (f.body) continue;
    const fd = cf.directFunction(f.declarator);
    if (!fd || fd.voidParams) continue;
    (f.params || []).forEach((p, i) => {
      if (!p.name) api.report(p.loc ? p : f, M(`Parameter ${i + 1} of '${f.name}' has no identifier in the prototype.`, `'${f.name}'의 프로토타입에서 매개변수 ${i + 1}에 식별자가 없습니다.`));
    });
  }
}

function emptyParamList(unit, api) {
  for (const fd of U.get(unit, 'FunctionDeclarator')) {
    if (!fd.noPrototype || (fd.params && fd.params.length) || (fd.krIdentifiers && fd.krIdentifiers.length)) continue;
    const owner = cf.enclosing(fd, ['FunctionDecl', 'VarDecl', 'TypedefDecl', 'ParamDecl', 'FieldDecl', 'TypeName']);
    const name = owner && owner.name ? owner.name : '<function>';
    api.report(fd, M(`'${name}' has an empty parameter list; write (void).`, `'${name}'의 매개변수 목록이 비어 있습니다. (void)로 쓰세요.`));
  }
}

function argumentCount(unit, api) {
  for (const c of U.get(unit, 'CallExpr')) {
    const s = c.calleeSymbol;
    if (!s || s.kind !== 'function' || s.system) continue;
    const def = s.definition && s.definition.type === 'FunctionDecl' ? s.definition : (s.decls || []).find((d) => d.type === 'FunctionDecl' && d.params && d.params.length);
    let want = null;
    let variadic = false;
    const ft = s.type && T.canonical(s.type);
    if (ft && ft.kind === 'function' && ft.prototype !== false) { want = ft.params.length; variadic = ft.variadic; }
    else if (def && def.params) { want = def.params.filter((p) => !(p.ctype && T.isVoid(p.ctype))).length; variadic = !!def.variadic; }
    if (want == null) continue;
    const got = c.args.length;
    if (got < want || (got > want && !variadic)) api.report(c, M(`'${s.name}' is called with ${got} argument(s) but has ${want} parameter(s).`, `'${s.name}'는 매개변수가 ${want}개인데 인수 ${got}개로 호출했습니다.`));
  }
}

module.exports = [
  C04({
    id: '15.0', cat: 'R', dec: true, c2012: '16.1',
    name: ['Switch statements shall follow the MISRA switch syntax', 'switch 문은 MISRA switch 구문을 따라야 합니다'],
    why: ['C allows switch bodies that are very hard to read, such as labels inside nested blocks.', 'C는 중첩 블록 안의 레이블처럼 읽기 매우 어려운 switch 본문을 허용합니다.'],
    fix: ['Use a body made only of case clauses, each ending with break.', '각각 break로 끝나는 case 절만으로 본문을 구성하세요.'],
    reuse: 'misra-c:16.1',
  }),
  C04({
    id: '15.1', cat: 'R', dec: true, c2012: '16.2',
    name: ['A switch label shall only appear directly in the switch body', 'switch 레이블은 switch 본문에 직접만 있어야 합니다'],
    why: ['Labels inside nested blocks create jumps into the middle of statements.', '중첩 블록 안의 레이블은 문 중간으로 점프하게 만듭니다.'],
    fix: ['Move the label to the outermost block of the switch.', '레이블을 switch의 가장 바깥 블록으로 옮기세요.'],
    reuse: 'misra-c:16.2',
  }),
  C04({
    id: '15.2', cat: 'R', dec: true, c2012: '16.3', cwe: 'CWE-484',
    name: ['Every non-empty switch clause shall end with an unconditional break', '비어 있지 않은 모든 switch 절은 무조건 break로 끝나야 합니다'],
    why: ['Falling through to the next clause is usually a forgotten break.', '다음 절로 넘어가는 것은 대개 break를 잊은 것입니다.'],
    fix: ['End the clause with break.', '절을 break로 끝내세요.'],
    reuse: 'misra-c:16.3',
  }),
  C04({
    id: '15.3', cat: 'R', dec: true, c2012: '16.4',
    name: ['The final clause of a switch shall be the default clause', 'switch의 마지막 절은 default 절이어야 합니다'],
    why: ['A final default shows that unexpected values were considered.', '마지막 default는 예상하지 못한 값을 고려했음을 보여 줍니다.'],
    fix: ['Add a default clause at the end of the switch.', 'switch 끝에 default 절을 추가하세요.'],
    check: S.defaultLast,
  }),
  C04({
    id: '15.4', cat: 'R', dec: true, c2012: '16.7',
    name: ['A switch expression shall not be effectively Boolean', 'switch 식은 실질적으로 부울이면 안 됩니다'],
    why: ['A two-way choice is clearer as an if statement.', '두 갈래 선택은 if 문이 더 분명합니다.'],
    fix: ['Use if ... else instead.', '대신 if ... else를 사용하세요.'],
    reuse: 'misra-c:16.7',
  }),
  C04({
    id: '15.5', cat: 'R', dec: true, c2012: '16.6',
    name: ['Every switch statement shall have at least one case clause', '모든 switch 문에는 case 절이 하나 이상 있어야 합니다'],
    why: ['A switch without case labels does not select anything.', 'case 레이블이 없는 switch는 아무것도 선택하지 않습니다.'],
    fix: ['Add case clauses or remove the switch.', 'case 절을 추가하거나 switch를 없애세요.'],
    check: S.switchHasCase,
  }),
  // ---------------------------------------------------------------- chapter 16
  C04({
    id: '16.1', cat: 'R', dec: true, c2012: '17.1',
    name: ['Functions shall not have a variable number of arguments', '함수는 가변 개수의 인수를 갖지 않아야 합니다'],
    why: ['Variadic arguments are not type-checked.', '가변 인수는 형식 검사가 되지 않습니다.'],
    fix: ['Use a fixed parameter list.', '고정된 매개변수 목록을 사용하세요.'],
    check: S.variadicFunctions,
  }),
  C04({
    id: '16.2', cat: 'R', dec: false, c2012: '17.2', cwe: 'CWE-674',
    name: ['Functions shall not call themselves directly or indirectly', '함수는 직접 또는 간접으로 자신을 호출하지 않아야 합니다'],
    why: ['Recursion can exhaust the stack in ways that are hard to bound.', '재귀는 한계를 정하기 어려운 방식으로 스택을 고갈시킬 수 있습니다.'],
    fix: ['Rewrite the algorithm iteratively.', '알고리즘을 반복 방식으로 다시 작성하세요.'],
    reuse: 'misra-c:17.2',
  }),
  C04({
    id: '16.3', cat: 'R', dec: true, c2012: '8.2',
    name: ['Every parameter in a prototype shall have an identifier', '프로토타입의 모든 매개변수에 식별자가 있어야 합니다'],
    why: ['Parameter names document the meaning of each argument.', '매개변수 이름은 각 인수의 의미를 알려 줍니다.'],
    fix: ['Name every parameter in the declaration.', '선언에서 모든 매개변수에 이름을 주세요.'],
    check: unnamedPrototypeParams,
  }),
  C04({
    id: '16.4', cat: 'R', dec: true, c2012: '8.3',
    name: ['Parameter names shall match in declaration and definition', '선언과 정의의 매개변수 이름이 같아야 합니다'],
    why: ['Different names for the same parameter mislead the reader.', '같은 매개변수에 다른 이름을 쓰면 읽는 사람을 오도합니다.'],
    fix: ['Use the same identifiers in every declaration.', '모든 선언에서 같은 식별자를 사용하세요.'],
    check: S.paramNamesMatch,
  }),
  C04({
    id: '16.5', cat: 'R', dec: true, c2012: '8.2',
    name: ['A function without parameters shall use (void)', '매개변수가 없는 함수는 (void)를 사용해야 합니다'],
    why: ['An empty list in C means "unknown parameters", not "no parameters".', 'C에서 빈 목록은 "매개변수 없음"이 아니라 "알 수 없는 매개변수"를 뜻합니다.'],
    fix: ['Write (void) in the declaration and the definition.', '선언과 정의에 (void)를 쓰세요.'],
    check: emptyParamList,
  }),
  C04({
    id: '16.6', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-685',
    name: ['The number of arguments shall match the number of parameters', '인수 개수는 매개변수 개수와 같아야 합니다'],
    why: ['A call with the wrong number of arguments has undefined behaviour.', '인수 개수가 틀린 호출은 정의되지 않은 동작입니다.'],
    fix: ['Pass exactly the declared parameters.', '선언된 매개변수만큼 정확히 전달하세요.'],
    check: argumentCount,
  }),
  C04({
    id: '16.7', cat: 'A', dec: true, c2012: '8.13',
    name: ['Pointer parameters should point to const when not used to modify', '수정에 쓰지 않는 포인터 매개변수는 const를 가리켜야 합니다'],
    why: ['const in the parameter documents and enforces that the object is only read.', '매개변수의 const는 객체를 읽기만 한다는 것을 알리고 강제합니다.'],
    fix: ['Add const to the pointed-to type.', '가리키는 형식에 const를 추가하세요.'],
    reuse: 'misra-c:8.13',
  }),
  C04({
    id: '16.8', cat: 'R', dec: true, type: 'BUG', c2012: '17.4', cwe: 'CWE-394',
    name: ['Every exit of a non-void function shall return a value', 'void가 아닌 함수의 모든 출구는 값을 반환해야 합니다'],
    why: ['Using the result of a function that fell off its end is undefined behaviour.', '끝까지 실행되어 반환한 함수의 결과를 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Add a return statement with an expression on every path.', '모든 경로에 식이 있는 return 문을 추가하세요.'],
    reuse: 'misra-c:17.4',
  }),
  C04({
    id: '16.9', cat: 'R', dec: true, c2012: '17.12',
    name: ['A function identifier shall only be called or used with &', '함수 식별자는 호출하거나 &와 함께만 사용해야 합니다'],
    why: ['A bare function name in a condition is always true and usually a missing ().', '조건 안의 함수 이름만 쓰면 항상 참이며 대개 ()를 빠뜨린 것입니다.'],
    fix: ['Call the function or take its address with &.', '함수를 호출하거나 &로 주소를 얻으세요.'],
    reuse: 'misra-c:17.12',
  }),
  C04({
    id: '16.10', cat: 'R', dec: false, c2012: 'dir-4.7', cwe: 'CWE-252',
    name: ['Error information returned by a function shall be tested', '함수가 반환한 오류 정보를 검사해야 합니다'],
    why: ['Ignoring an error result lets the program continue in a bad state.', '오류 결과를 무시하면 프로그램이 잘못된 상태로 계속됩니다.'],
    fix: ['Check the returned value before going on.', '진행하기 전에 반환 값을 검사하세요.'],
    reuse: 'misra-c:dir-4.7',
  }),
];
