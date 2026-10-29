'use strict';

// Code smells (.NET reference analyzer maintainability family): complexity, unused code,
// redundancy, exceptions, LINQ / string simplifications.

const { R } = require('../registry');
const { same, unparen, dotted, callName, callTarget, forEachChild, hasMod, attrNamed, enclosing } = require('../ast');
const U = require('../util');
const T = require('../types');

const FUNC_MEMBERS = ['Method', 'Ctor', 'Destructor', 'Operator', 'Conversion', 'LocalFunc'];
function opt(cx, name, def) {
  const o = cx.engine.opts || {};
  return o[name] != null ? o[name] : def;
}
function memberLabel(m) {
  switch (m.k) {
    case 'Ctor': return 'constructor';
    case 'Accessor': return 'accessor';
    case 'LocalFunc': return 'local function';
    case 'Property': return 'property';
    default: return 'method';
  }
}
function memberLabelKo(m) {
  switch (m.k) {
    case 'Ctor': return '생성자';
    case 'Accessor': return '접근자';
    case 'LocalFunc': return '지역 함수';
    case 'Property': return '속성';
    default: return '메서드';
  }
}

// ───────────────────────────────────────── complexity
function cognitive(body, fnName) {
  let total = 0;
  const events = [];
  const inc = (n, by, why) => { total += by; if (events.length < 25) events.push({ line: n.line, tag: 'path', text: { en: `+${by}${why ? ` (${why})` : ''}`, ko: `+${by}${why ? ` (${why})` : ''}` }, main: false }); };
  const walk = (n, nesting) => {
    if (!n || typeof n !== 'object') return;
    switch (n.k) {
      case 'If': {
        const isElseIf = n.parent && n.parent.k === 'If' && n.parent.else === n;
        if (isElseIf) inc(n, 1, 'else if'); else inc(n, 1 + nesting, nesting ? `if, nesting ${nesting}` : 'if');
        walk(n.cond, nesting);
        walk(n.then, nesting + 1);
        if (n.else) {
          if (n.else.k === 'If') walk(n.else, nesting);
          else { inc({ line: n.elseLine || n.else.line }, 1, 'else'); walk(n.else, nesting + 1); }
        }
        return;
      }
      case 'Conditional': inc(n, 1 + nesting, '?:'); forEachChild(n, (c) => walk(c, nesting + 1)); return;
      case 'Switch': inc(n, 1 + nesting, 'switch'); walk(n.expr, nesting); for (const s of n.sections) walk(s, nesting + 1); return;
      case 'SwitchExpr': inc(n, 1 + nesting, 'switch'); walk(n.expr, nesting); for (const a of n.arms) walk(a, nesting + 1); return;
      case 'For': case 'Foreach': case 'While': case 'Do':
        inc(n, 1 + nesting, n.k.toLowerCase());
        forEachChild(n, (c, key) => walk(c, key === 'body' ? nesting + 1 : nesting));
        return;
      case 'Catch': inc(n, 1 + nesting, 'catch'); forEachChild(n, (c) => walk(c, nesting + 1)); return;
      case 'Goto': inc(n, 1, 'goto'); return;
      case 'Lambda': case 'LocalFunc': forEachChild(n, (c) => walk(c, nesting + 1)); return;
      case 'TypeDecl': return;
      case 'Binary':
        if ((n.op === '&&' || n.op === '||') && !(n.parent && n.parent.k === 'Binary' && n.parent.op === n.op)) inc(n, 1, n.op);
        forEachChild(n, (c) => walk(c, nesting));
        return;
      case 'Invocation': {
        const c = unparen(n.expr);
        if (fnName && ((c.k === 'Name' && c.name === fnName && !c.sym) || (c.k === 'Member' && c.expr.k === 'This' && c.name === fnName))) inc(n, 1, 'recursion');
        forEachChild(n, (x) => walk(x, nesting));
        return;
      }
      default: forEachChild(n, (c) => walk(c, nesting));
    }
  };
  walk(body, 0);
  return { total, events };
}

function cyclomatic(body) {
  let c = 1;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    switch (n.k) {
      case 'If': case 'Conditional': case 'For': case 'Foreach': case 'While': case 'Do': case 'Catch': c++; break;
      case 'CaseLabel': c++; break;
      case 'SwitchArm': if (n.pattern.k !== 'DiscardPattern') c++; break;
      case 'Binary': if (n.op === '&&' || n.op === '||' || n.op === '??') c++; break;
      case 'Assign': if (n.op === '??=') c++; break;
      case 'Member': if (n.cond) c++; break;
      case 'Lambda': case 'LocalFunc': case 'TypeDecl': return;
      default: break;
    }
    forEachChild(n, walk);
  };
  walk(body);
  return c;
}

function bodyNode(m) { return m.body || m.exprBody || null; }

R('cognitive-complexity', 'S3776', 'S', 'CR', 10, ['brain-overload'],
  ['Cognitive Complexity of methods should not be too high', 'Deeply nested and branching code is hard to read and change; the score adds one per break in linear flow, more when nested.', 'Extract parts into well-named methods and reduce nesting.'],
  ['메서드의 인지 복잡도가 너무 높으면 안 됩니다', '깊게 중첩되고 분기가 많은 코드는 읽고 고치기 어렵습니다. 흐름이 끊길 때마다 1점, 중첩되면 더 더합니다.', '일부를 이름 있는 메서드로 추출하고 중첩을 줄이세요.'],
  { kinds: Object.fromEntries(['Method', 'Ctor', 'Destructor', 'Operator', 'Conversion', 'Accessor', 'LocalFunc'].map((k) => [k, (n, cx) => {
    const b = bodyNode(n);
    if (!b) return;
    if (n.k === 'LocalFunc') return; // counted with the enclosing method
    const max = opt(cx, 'cognitiveThreshold', 15);
    const { total, events } = cognitive(b, n.k === 'Method' ? n.name : null);
    if (total > max) cx.report(n, `Refactor this ${memberLabel(n)} to reduce its Cognitive Complexity from ${total} to the ${max} allowed.`, `이 ${memberLabelKo(n)}의 인지 복잡도를 ${total}에서 허용치 ${max} 이하로 줄이세요.`, { atName: true, events: events.concat([{ line: n.nameLine || n.line, tag: 'path', text: { en: `complexity ${total}`, ko: `복잡도 ${total}` }, main: true }]) });
  }])) });

R('cyclomatic-complexity', 'S1541', 'S', 'CR', 10, ['brain-overload'],
  ['Methods and properties should not be too complex', 'A high number of independent paths makes the member hard to test completely.', 'Split the member into smaller ones.'],
  ['메서드와 속성은 너무 복잡하면 안 됩니다', '독립 경로가 많으면 멤버를 완전히 테스트하기 어렵습니다.', '멤버를 더 작은 멤버로 나누세요.'],
  { kinds: Object.fromEntries(['Method', 'Ctor', 'Operator', 'Accessor'].map((k) => [k, (n, cx) => {
    const b = bodyNode(n);
    if (!b) return;
    const max = opt(cx, 'cyclomaticThreshold', 10);
    const c = cyclomatic(b);
    if (c > max) cx.report(n, `The Cyclomatic Complexity of this ${memberLabel(n)} is ${c} which is greater than ${max} authorized.`, `이 ${memberLabelKo(n)}의 순환 복잡도는 ${c}로 허용치 ${max}보다 큽니다.`, { atName: true });
  }])) });

R('too-many-parameters', 'S107', 'S', 'MA', 20, ['brain-overload'],
  ['Methods should not have too many parameters', 'A long parameter list is hard to call correctly and hints that the method does too much.', 'Group parameters into an object or split the method.'],
  ['메서드의 매개변수가 너무 많으면 안 됩니다', '매개변수 목록이 길면 올바르게 호출하기 어렵고 메서드가 너무 많은 일을 한다는 신호입니다.', '매개변수를 객체로 묶거나 메서드를 나누세요.'],
  { kinds: Object.fromEntries(['Method', 'Ctor', 'LocalFunc', 'Delegate'].map((k) => [k, (n, cx) => {
    const max = opt(cx, 'maxParameters', 7);
    if (!n.params || n.params.length <= max) return;
    if (hasMod(n, 'override') || hasMod(n, 'extern') || n.iface || attrNamed(n.attrs, ['DllImport', 'LibraryImport'])) return;
    if (n.k === 'Ctor' && n.owner && n.owner.typeInfo && n.owner.typeInfo.baseInfo && n.init && n.init.kind === 'base' && n.init.args.length >= max) return;
    cx.report(n, `This ${n.k === 'Ctor' ? 'constructor' : n.k === 'Delegate' ? 'delegate' : 'method'} has ${n.params.length} parameters, which is greater than the ${max} authorized.`, `이 ${n.k === 'Ctor' ? '생성자' : n.k === 'Delegate' ? '대리자' : '메서드'}의 매개변수는 ${n.params.length}개로 허용치 ${max}보다 많습니다.`, { atName: true });
  }])) });

R('method-too-long', 'S138', 'S', 'MA', 20, ['brain-overload'],
  ['Functions should not have too many lines of code', 'Very long methods are hard to understand and usually do several things.', 'Extract cohesive parts into separate methods.'],
  ['함수의 코드 줄이 너무 많으면 안 됩니다', '아주 긴 메서드는 이해하기 어렵고 대개 여러 일을 합니다.', '응집된 부분을 별도 메서드로 추출하세요.'],
  { kinds: Object.fromEntries(['Method', 'Ctor', 'Accessor', 'LocalFunc'].map((k) => [k, (n, cx) => {
    const b = n.body;
    if (!b) return;
    const max = opt(cx, 'maxMethodLines', 80);
    let loc = 0;
    const lines = cx.src.split('\n').slice(b.line, b.endLine - 1);
    for (const l of lines) if (/\S/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)) loc++;
    if (loc > max) cx.report(n, `This ${memberLabel(n)} has ${loc} lines of code, which is greater than the ${max} authorized.`, `이 ${memberLabelKo(n)}는 코드 ${loc}줄로 허용치 ${max}줄보다 깁니다.`, { atName: true });
  }])) });

R('file-too-long', 'S104', 'S', 'MA', 60, ['brain-overload'],
  ['Files should not have too many lines of code', 'A very long file usually holds several responsibilities and is hard to navigate.', 'Split the file into smaller, focused types.'],
  ['파일의 코드 줄이 너무 많으면 안 됩니다', '아주 긴 파일은 대개 여러 책임을 가지고 탐색하기 어렵습니다.', '파일을 작고 집중된 타입으로 나누세요.'],
  { file(pf, cx) {
    const max = opt(cx, 'maxFileLines', 1000);
    let loc = 0;
    for (const l of pf.text.split('\n')) if (/\S/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)) loc++;
    if (loc > max) cx.report({ line: 1, col: 1 }, `This file has ${loc} lines of code, which is greater than ${max} authorized. Split it into smaller files.`, `이 파일은 코드 ${loc}줄로 허용치 ${max}줄보다 깁니다. 더 작은 파일로 나누세요.`);
  } });

const NEST_KINDS = new Set(['If', 'For', 'Foreach', 'While', 'Do', 'Switch', 'Try']);
R('deep-nesting', 'S134', 'S', 'CR', 10, ['brain-overload'],
  ['Control flow statements "if", "switch", "for", "foreach", "while", "do" and "try" should not be nested too deeply', 'Deep nesting makes code hard to follow.', 'Return early, or extract inner blocks into methods.'],
  ['if, switch, for, foreach, while, do, try 제어문을 너무 깊게 중첩하면 안 됩니다', '깊은 중첩은 코드를 따라가기 어렵게 합니다.', '먼저 반환하거나 안쪽 블록을 메서드로 추출하세요.'],
  { kinds: Object.fromEntries([...NEST_KINDS].map((k) => [k, (n, cx) => {
    if (n.k === 'If' && n.parent && n.parent.k === 'If' && n.parent.else === n) return;
    const max = opt(cx, 'maxNesting', 3);
    let depth = 0;
    for (let p = n.parent; p; p = p.parent) {
      if (FUNC_MEMBERS.includes(p.k) || p.k === 'Lambda' || p.k === 'Accessor') break;
      if (NEST_KINDS.has(p.k) && !(p.k === 'If' && p.parent && p.parent.k === 'If' && p.parent.else === p && false)) {
        if (p.k === 'If' && p.parent && p.parent.k === 'If' && p.parent.else === p) continue;
        depth++;
      }
    }
    if (depth === max) cx.report(n, `Refactor this code to not nest more than ${max} control flow statements.`, `제어문이 ${max}단계보다 깊게 중첩되지 않도록 코드를 고치세요.`);
  }])) });

R('expression-too-complex', 'S1067', 'S', 'CR', 5, ['brain-overload'],
  ['Expressions should not be too complex', 'Many && / || / ?: operators in one expression make it hard to understand.', 'Extract parts into well-named boolean variables or methods.'],
  ['식이 너무 복잡하면 안 됩니다', '한 식에 &&, ||, ?: 연산자가 많으면 이해하기 어렵습니다.', '일부를 이름 있는 불리언 변수나 메서드로 추출하세요.'],
  { kinds: { Binary: checkExpr, Conditional: checkExpr } });
function isLogic(n) { return (n.k === 'Binary' && (n.op === '&&' || n.op === '||')) || n.k === 'Conditional'; }
function checkExpr(n, cx) {
  if (!isLogic(n)) return;
  let p = n.parent;
  while (p && p.k === 'Paren') p = p.parent;
  if (p && isLogic(p)) return; // only the root of the logical expression
  let count = 0;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.k === 'Lambda' || x.k === 'Invocation' || x.k === 'New' || x.k === 'SwitchExpr') return;
    if (isLogic(x)) count++;
    forEachChild(x, walk);
  };
  walk(n);
  const max = opt(cx, 'maxExpressionOperators', 3);
  if (count > max) cx.report(n, `Reduce the number of conditional operators (${count}) used in the expression (maximum allowed ${max}).`, `식에 쓰인 조건 연산자 수(${count})를 줄이세요(허용 ${max}개).`);
}

R('too-many-returns', 'S1142', 'S', 'MA', 20, ['brain-overload'],
  ['Functions should not contain too many return statements', 'Many exit points make the control flow hard to follow.', 'Restructure the method to have fewer return statements.'],
  ['함수에 return 문이 너무 많으면 안 됩니다', '나가는 지점이 많으면 제어 흐름을 따라가기 어렵습니다.', 'return 문이 줄도록 메서드 구조를 바꾸세요.'],
  { kinds: { Method(n, cx) {
    if (!n.body) return;
    let count = 0;
    const walk = (x) => { if (x.k === 'Lambda' || x.k === 'LocalFunc') return; if (x.k === 'Return') count++; forEachChild(x, walk); };
    walk(n.body);
    const max = opt(cx, 'maxReturns', 3);
    if (count > max) cx.report(n, `This method has ${count} returns, which is more than the ${max} allowed.`, `이 메서드에는 return이 ${count}개 있어 허용치 ${max}개보다 많습니다.`, { atName: true });
  } } });

R('too-many-switch-cases', 'S1479', 'S', 'MA', 30, ['brain-overload'],
  ['"switch" statements should not have too many "case" clauses', 'Huge switch statements are hard to maintain; a dictionary or polymorphism is usually clearer.', 'Use a lookup table or polymorphism.'],
  ['switch 문에 case가 너무 많으면 안 됩니다', '아주 큰 switch 문은 유지하기 어렵고 사전이나 다형성이 대개 더 명확합니다.', '조회 테이블이나 다형성을 쓰세요.'],
  { kinds: { Switch(n, cx) {
    const count = n.sections.reduce((a, s) => a + s.labels.filter((l) => l.k === 'CaseLabel').length, 0);
    const max = opt(cx, 'maxSwitchCases', 30);
    if (count > max) cx.report(n, `Consider reworking this "switch" to reduce the number of "case" clauses from ${count} to at most ${max}.`, `이 switch의 case 수를 ${count}개에서 ${max}개 이하로 줄이도록 고쳐 보세요.`);
  } } });

R('line-too-long', 'S103', 'S', 'MI', 1, ['convention'],
  ['Lines should not be too long', 'Very long lines force horizontal scrolling and hurt readability.', 'Break the line.'],
  ['줄이 너무 길면 안 됩니다', '아주 긴 줄은 가로 스크롤을 강요해 가독성을 해칩니다.', '줄을 나누세요.'],
  { file(pf, cx) {
    const max = opt(cx, 'maxLineLength', 200);
    const lines = pf.text.split('\n');
    let n = 0;
    for (let i = 0; i < lines.length && n < 50; i++) {
      const l = lines[i].replace(/\r$/, '');
      if (l.length > max && !/^\s*\/\//.test(l) && !/"[^"]{60,}/.test(l) && !/https?:\/\//.test(l)) { n++; cx.report({ line: i + 1, col: 1 }, `Split this ${l.length} characters long line (which is greater than ${max} authorized).`, `${l.length}자 길이의 이 줄을 나누세요(허용 ${max}자).`); }
    }
  } });

R('too-many-generic-params', 'S2436', 'S', 'MA', 10, ['brain-overload'],
  ['Types and methods should not have too many generic parameters', 'Many type parameters make a type or method hard to understand and use.', 'Reduce the number of type parameters.'],
  ['타입과 메서드의 제네릭 매개변수가 너무 많으면 안 됩니다', '타입 매개변수가 많으면 이해하고 쓰기 어렵습니다.', '타입 매개변수 수를 줄이세요.'],
  { kinds: {
    TypeDecl(n, cx) { if ((n.typeParams || []).length > 2) cx.report(n, `Reduce the number of generic parameters in the '${n.name}' type, ${n.typeParams.length} is greater than the 2 authorized.`, `'${n.name}' 타입의 제네릭 매개변수를 줄이세요. ${n.typeParams.length}개는 허용치 2개보다 많습니다.`, { atName: true }); },
    Method(n, cx) { if ((n.typeParams || []).length > 3) cx.report(n, `Reduce the number of generic parameters in the '${n.name}' method, ${n.typeParams.length} is greater than the 3 authorized.`, `'${n.name}' 메서드의 제네릭 매개변수를 줄이세요. ${n.typeParams.length}개는 허용치 3개보다 많습니다.`, { atName: true }); },
  } });

R('inheritance-depth', 'S110', 'S', 'MA', 240, ['design'],
  ['Inheritance tree of classes should not be too deep', 'Deep hierarchies are hard to understand; behavior is spread over many classes.', 'Prefer composition over inheritance.'],
  ['클래스 상속 트리가 너무 깊으면 안 됩니다', '깊은 계층은 동작이 여러 클래스에 흩어져 이해하기 어렵습니다.', '상속보다 구성을 쓰세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || !n.typeInfo || n.typeInfo.decls[0] !== n) return;
    const info = n.typeInfo;
    let d = 0; let t = info; const seen = new Set();
    while (t && t.baseInfo && !seen.has(t)) { seen.add(t); d++; t = t.baseInfo; }
    const max = opt(cx, 'maxInheritanceDepth', 5);
    if (d > max) cx.report(n, `This class has ${d + 1} parents in the project, which is greater than ${max} authorized.`, `이 클래스는 프로젝트 안에 부모가 ${d + 1}개로 허용치 ${max}보다 많습니다.`, { atName: true });
  } } });

// ───────────────────────────────────────── unused code
function outermost(info) { let t = info; while (t.outer) t = t.outer; return t; }
function usedNames(project, info) {
  const top = outermost(info);
  if (top.usedNames) return top.usedNames;
  const names = new Map();
  const add = (n) => names.set(n, (names.get(n) || 0) + 1);
  const visitDecl = (decl) => {
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      switch (x.k) {
        case 'Name': add(x.name); break;
        case 'Member': add(x.name); break;
        case 'Type': for (const p of x.parts || []) add(p.name); break;
        case 'Attribute': add(x.name); add(x.fullName); break;
        case 'Literal': if (x.kind === 'string' && /^[A-Za-z_][\w.]*$/.test(x.value) && x.value.length < 80) for (const p of x.value.split('.')) add(p); break;
        case 'MemberInit': add(x.name); break;
        case 'AnonMember': if (x.name) add(x.name); break;
        case 'PropPattern': for (const p of x.path || []) add(p); break;
        case 'SubPattern': if (x.name) add(x.name); break;
        case 'Arg': if (x.name) add(x.name); break;
        default: break;
      }
      forEachChild(x, walk);
      if (x.k === 'Type') for (const p of x.parts || []) for (const a of p.args || []) if (a) walk(a);
    };
    walk(decl);
    // doc comment crefs and comments in the files
    const pf = decl.file;
    if (pf && pf.lex) for (const c of pf.lex.comments) if (c.line >= decl.line && c.line <= decl.endLine) for (const m of c.text.matchAll(/cref="([^"]+)"/g)) for (const p of m[1].split(/[.({,)}\s]/)) add(p);
    if (pf && pf.lex && pf.lex.inactiveIds) for (const id of pf.lex.inactiveIds) add(id);
  };
  for (const d of top.decls) visitDecl(d);
  top.usedNames = names;
  return names;
}
function declCount(member) {
  // the declaration itself contributes this many occurrences of its own name (none for Name nodes)
  void member; return 0;
}
function hasSerializationAttr(info) {
  return info.decls.some((d) => attrNamed(d.attrs, ['Serializable', 'DataContract', 'StructLayout', 'JsonObject', 'MessagePackObject', 'ProtoContract', 'XmlRoot', 'XmlType', 'ComVisible', 'Table', 'Entity', 'Keyless', 'Owned']));
}
const UNITY_BASES = ['MonoBehaviour', 'ScriptableObject', 'Editor', 'EditorWindow', 'NetworkBehaviour', 'StateMachineBehaviour', 'PropertyDrawer'];
function isUnity(info) { return UNITY_BASES.some((b) => info.inheritsFrom(b)); }
function typeUnsafeForUnused(info) { return info.broken || info.decls.some((d) => d.broken || d.file && d.file.errors && d.file.errors.length); }

R('unused-private-member', 'S1144', 'S', 'MA', 5, ['unused'],
  ['Unused private types or members should be removed', 'A private member that nothing references is dead code that costs reading and maintenance.', 'Remove it, or use it.'],
  ['쓰지 않는 private 타입이나 멤버는 지워야 합니다', '아무것도 참조하지 않는 private 멤버는 읽고 유지하는 비용만 드는 죽은 코드입니다.', '지우거나 사용하세요.'],
  { project(project, cx) {
    for (const info of project.allTypeInfos) {
      if (info.kind === 'interface' || info.kind === 'enum' || info.kind === 'delegate') continue;
      if (typeUnsafeForUnused(info) || typeUnsafeForUnused(outermost(info))) continue;
      const names = usedNames(project, info);
      const unity = isUnity(info);
      const serial = hasSerializationAttr(info);
      const partialExternal = info.decls.some((d) => d.partial) && info.hasExternalBase();
      for (const [name, entries] of info.members) {
        if (names.get(name)) continue;
        for (const e of entries) {
          if (e.access !== 'private') continue;
          const m = e.node;
          if (m.attrs && m.attrs.length) continue;
          if (m.mods && (m.mods.has('extern') || m.mods.has('partial') || m.mods.has('override') || m.mods.has('virtual'))) continue;
          if (m.iface) continue;
          const pf = m.file || (info.decls[0] && info.decls[0].file);
          const declFile = info.decls.find((d) => d.members.includes(m) || (m.parent && d === m.parent));
          const filePf = (declFile && declFile.file) || pf;
          if (!filePf || filePf.skipReport) continue;
          let what = null;
          switch (e.kind) {
            case 'method':
              if (unity || ['Main', 'Dispose', 'Finalize', 'OnDeserialized', 'OnDeserializing', 'OnSerialized', 'OnSerializing', 'ShouldSerialize', 'Reset'].includes(name)) break;
              if (/^ShouldSerialize|^Reset[A-Z]/.test(name)) break;
              if (partialExternal && U.isEventHandler(m)) break;
              if (U.isEventHandler(m) && info.hasExternalBase()) break;
              what = 'method';
              break;
            case 'field': case 'const':
              if (serial || unity || info.kind === 'struct' || info.kind === 'record struct') break;
              if (e.v && e.v.init && /Timer|Watcher|Hook|Handle|Callback|Delegate|Proc|Subscription|Listener/.test(m.type ? m.type.name : '')) break;
              what = e.kind === 'const' ? 'const' : 'field';
              break;
            case 'property': if (!serial && !e.positional) what = 'property'; break;
            case 'event': what = 'event'; break;
            case 'type': what = 'type'; break;
            default: break;
          }
          if (!what) continue;
          const at = e.v || m;
          cx.reportIn(filePf, at, `Remove the unused private ${what} '${name}'.`, `쓰지 않는 private ${what === 'method' ? '메서드' : what === 'type' ? '타입' : what === 'property' ? '속성' : what === 'event' ? '이벤트' : what === 'const' ? '상수' : '필드'} '${name}'를 지우세요.`, { atName: true });
        }
      }
    }
  } });

R('unread-private-field', 'S4487', 'S', 'MA', 5, ['unused'],
  ['Unread "private" fields should be removed', 'The field is assigned but its value is never read, so the assignments are useless.', 'Remove the field and its assignments, or read it.'],
  ['읽지 않는 private 필드는 지워야 합니다', '필드에 값을 대입하지만 읽지 않아 대입이 쓸모없습니다.', '필드와 대입을 지우거나 값을 읽으세요.'],
  { project(project, cx) {
    // collect reads/writes by name across each type
    for (const info of project.allTypeInfos) {
      if (info.kind !== 'class' && info.kind !== 'record') continue;
      if (typeUnsafeForUnused(info) || typeUnsafeForUnused(outermost(info)) || hasSerializationAttr(info) || isUnity(info)) continue;
      const fields = [];
      for (const [name, entries] of info.members) for (const e of entries) if (e.kind === 'field' && e.access === 'private' && !(e.node.attrs && e.node.attrs.length)) fields.push({ name, e });
      if (!fields.length) continue;
      const stats = new Map(fields.map((f) => [f.name, { r: 0, w: 0 }]));
      const top = outermost(info);
      for (const d of top.decls) {
        const walk = (x) => {
          if (!x || typeof x !== 'object') return;
          if ((x.k === 'Name' || x.k === 'Member') && stats.has(x.name)) {
            const st = stats.get(x.name);
            if (x.k === 'Name') { if (x.isWrite) st.w++; if (x.isRead || !x.isWrite) st.r++; } else { if (x.anyWrite || x.isWrite) st.w++; if (x.anyRead || x.isRead || !(x.anyWrite || x.isWrite)) st.r++; }
          }
          if (x.k === 'Invocation' && unparen(x.expr).k === 'Name' && unparen(x.expr).name === 'nameof') for (const a of x.args) { const t = unparen(a.expr); if (t && stats.has(t.name)) stats.get(t.name).r++; }
          forEachChild(x, walk);
        };
        walk(d);
        const pf = d.file;
        if (pf && pf.lex && pf.lex.inactiveIds) for (const id of pf.lex.inactiveIds) if (stats.has(id)) stats.get(id).r++;
      }
      for (const f of fields) {
        const st = stats.get(f.name);
        const hasInit = !!(f.e.v && f.e.v.init);
        if (st.r > 0 || (st.w === 0 && !hasInit) || st.w + (hasInit ? 1 : 0) === 0) continue;
        if (st.w === 0) continue; // never assigned after init: S1144 territory
        const tn = f.e.node.type ? f.e.node.type.name : '';
        if (/Timer|Watcher|Hook|Handle|Callback|Delegate|Proc|Subscription|Listener|Handler|Registration|Token|Lifetime|Mutex|Lock$/.test(tn)) continue;
        const declFile = info.decls.find((d) => d.members.includes(f.e.node));
        if (!declFile || !declFile.file || declFile.file.skipReport) continue;
        cx.reportIn(declFile.file, f.e.v, `Remove the field '${f.name}' and its assignments, or read its value.`, `필드 '${f.name}'와 대입을 지우거나 값을 읽으세요.`, { atName: true });
      }
    }
  } });

R('unused-local', 'S1481', 'S', 'MI', 5, ['unused'],
  ['Unused local variables should be removed', 'A local that is never used is noise and may hide a forgotten use.', 'Remove the variable.'],
  ['쓰지 않는 지역 변수는 지워야 합니다', '쓰지 않는 지역 변수는 잡음이며 잊어버린 사용을 숨길 수 있습니다.', '변수를 지우세요.'],
  { kinds: { VarDecl(n, cx) {
    const d = n.parent;
    if (!d || d.k !== 'LocalDecl' || d.isUsing) return;
    const s = n.sym;
    if (!s || s.refs.length || s.nameofRefs || n.name === '_' || n.name.startsWith('_')) return;
    const ids = cx.pf.lex && cx.pf.lex.inactiveIds;
    if (ids && ids.has(n.name)) return;
    if (d.parent && d.parent.k === 'Fixed') return;
    cx.report(n, `Remove the unused local variable '${n.name}'.`, `쓰지 않는 지역 변수 '${n.name}'를 지우세요.`);
  } } });

R('unused-parameter', 'S1172', 'S', 'MA', 5, ['unused'],
  ['Unused method parameters should be removed', 'A parameter the method never uses misleads callers.', 'Remove the parameter, or use it.'],
  ['쓰지 않는 메서드 매개변수는 지워야 합니다', '메서드가 쓰지 않는 매개변수는 호출자를 오해하게 합니다.', '매개변수를 지우거나 사용하세요.'],
  { kinds: {
    Method(n, cx) { checkParams(n, cx); },
    LocalFunc(n, cx) { checkParams(n, cx); },
  } });
function checkParams(n, cx) {
  if (!n.params.length) return;
  if (n.k === 'Method') {
    const info = n.owner && n.owner.typeInfo;
    if (!info) return;
    const entries = info.members.get(n.name) || [];
    const e = entries.find((x) => x.node === n);
    if (!e || e.access !== 'private') return;
    if (U.isOverrideLike(n) || (n.attrs && n.attrs.length) || U.isEventHandler(n) || n.name === 'Main') return;
    if (isUnity(info)) return;
    if (methodGroupUsed(cx.project, info, n.name)) return;
    if (typeUnsafeForUnused(info)) return;
  }
  const b = n.body || n.exprBody;
  if (!b) return;
  if (b.k === 'Block' && b.stmts.length === 0) return;
  if (b.k === 'Block' && b.stmts.length === 1 && b.stmts[0].k === 'Throw') return;
  if (b.k === 'ThrowExpr') return;
  const ids = cx.pf.lex && cx.pf.lex.inactiveIds;
  for (const p of n.params) {
    const s = p.sym;
    if (!s || s.refs.length || s.nameofRefs || p.name === '_' || /^_+\d*$/.test(p.name) || (p.attrs && p.attrs.length) || p.mods.includes('this')) continue;
    if (ids && ids.has(p.name)) continue;
    cx.report(p, `Remove this unused method parameter '${p.name}'.`, `쓰지 않는 메서드 매개변수 '${p.name}'를 지우세요.`, { atName: true });
  }
}
function methodGroupUsed(project, info, name) {
  const top = outermost(info);
  if (!top._groups) {
    top._groups = new Set();
    for (const d of top.decls) {
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (x.k === 'Name' || (x.k === 'Member' && (x.expr.k === 'This' || x.expr.k === 'Base' || x.expr.k === 'Name'))) {
          const p = x.parent;
          if (!(p && p.k === 'Invocation' && p.expr === x)) top._groups.add(x.name);
        }
        forEachChild(x, walk);
      };
      walk(d);
    }
  }
  return top._groups.has(name);
}

R('unused-type-parameter', 'S2326', 'S', 'MA', 10, ['unused'],
  ['Unused type parameters should be removed', 'A type parameter that is never used adds confusion for callers.', 'Remove the type parameter.'],
  ['쓰지 않는 타입 매개변수는 지워야 합니다', '쓰지 않는 타입 매개변수는 호출자를 헷갈리게 합니다.', '타입 매개변수를 지우세요.'],
  { kinds: {
    Method(n, cx) {
      if (!n.typeParams || !n.typeParams.length || U.isOverrideLike(n) || hasMod(n, 'abstract')) return;
      if (n.owner && n.owner.kind === 'interface') return;
      const used = typeNamesIn(n);
      for (const tp of n.typeParams) if (!used.has(tp.name)) cx.report(tp, `'${tp.name}' is not used in the method.`, `'${tp.name}'를 메서드에서 쓰지 않습니다.`);
    },
    TypeDecl(n, cx) {
      if (!n.typeParams || !n.typeParams.length || n.kind === 'interface' || n.partial) return;
      const used = typeNamesIn(n, true);
      for (const tp of n.typeParams) if (!used.has(tp.name)) cx.report(tp, `'${tp.name}' is not used in the ${n.kind}.`, `'${tp.name}'를 ${n.kind}에서 쓰지 않습니다.`);
    },
  } });
function typeNamesIn(n, isType) {
  const used = new Set();
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.k === 'Type') { for (const p of x.parts || []) { used.add(p.name); for (const a of p.args || []) if (a) walk(a); } for (const t of x.tuple || []) walk(t.type); }
    if (x.k === 'Name') used.add(x.name);
    if (x.k === 'Constraint') for (const it of x.items) if (typeof it === 'object') walk(it);
    forEachChild(x, walk);
  };
  if (isType) { for (const b of n.bases || []) walk(b); for (const m of n.members) walk(m); for (const p of n.params || []) walk(p); }
  else { walk(n.retType); for (const p of n.params) walk(p.type); walk(n.body || n.exprBody || { k: 'Empty' }); }
  return used;
}

R('field-could-be-readonly', 'S2933', 'S', 'MA', 2, ['confusing'],
  ['Fields that are only assigned in the constructor should be "readonly"', 'Marking such fields readonly documents intent and prevents accidental reassignment.', 'Add the readonly modifier.'],
  ['생성자에서만 대입하는 필드는 "readonly"여야 합니다', 'readonly로 표시하면 의도가 드러나고 실수로 다시 대입하는 것을 막습니다.', 'readonly 한정자를 붙이세요.'],
  { project(project, cx) {
    for (const info of project.allTypeInfos) {
      if (info.kind !== 'class' && info.kind !== 'record') continue;
      if (typeUnsafeForUnused(info) || typeUnsafeForUnused(outermost(info)) || isUnity(info) || hasSerializationAttr(info)) continue;
      const cands = new Map();
      for (const [name, entries] of info.members) {
        for (const e of entries) {
          if (e.kind !== 'field' || e.access !== 'private') continue;
          const m = e.node;
          if (m.mods.has('readonly') || m.mods.has('volatile') || m.mods.has('const') || (m.attrs && m.attrs.length) || m.vars.length > 1) continue;
          if (!immutableish(m.type, project)) continue;
          cands.set(name, { e, bad: false, writes: 0 });
        }
      }
      if (!cands.size) continue;
      const top = outermost(info);
      for (const d of top.decls) {
        const walk = (x, ctx) => {
          if (!x || typeof x !== 'object') return;
          let c = ctx;
          if (x.k === 'Ctor') c = { ctor: true, isStatic: hasMod(x, 'static'), owner: x.owner };
          else if (x.k === 'Lambda' || x.k === 'LocalFunc' || x.k === 'Method' || x.k === 'Accessor' || x.k === 'Property' || x.k === 'Operator' || x.k === 'Indexer' || x.k === 'Event') c = { ctor: false };
          if ((x.k === 'Name' || x.k === 'Member') && cands.has(x.name)) {
            const cand = cands.get(x.name);
            const write = x.k === 'Name' ? x.isWrite : (x.anyWrite || x.isWrite);
            if (write) {
              cand.writes++;
              const isStaticField = cand.e.isStatic;
              const okCtor = c.ctor && c.owner === cand.e.node.owner && c.isStatic === isStaticField && (x.k === 'Name' || x.expr.k === 'This' || (isStaticField && x.expr.k === 'Name'));
              if (!okCtor) cand.bad = true;
              const p = x.parent;
              if (p && p.k === 'Arg' && (p.refKind === 'ref' || p.refKind === 'out') && !okCtor) cand.bad = true;
            }
            const p = x.parent;
            if (p && p.k === 'Arg' && p.refKind === 'ref') cand.bad = true;
            if (p && p.k === 'Unary' && (p.op === '++' || p.op === '--') && !c.ctor) cand.bad = true;
          }
          forEachChild(x, (k) => walk(k, c));
        };
        walk(d, { ctor: false });
      }
      for (const [name, cand] of cands) {
        if (cand.bad) continue;
        if (!cand.writes && !(cand.e.v && cand.e.v.init)) continue;
        const declFile = info.decls.find((dd) => dd.members.includes(cand.e.node));
        if (!declFile || !declFile.file || declFile.file.skipReport) continue;
        cx.reportIn(declFile.file, cand.e.v, `Make '${name}' 'readonly'.`, `'${name}'를 'readonly'로 만드세요.`, { atName: true });
      }
    }
  } });
function immutableish(t, project) {
  if (!t || t.nullable && !t.predefined) return !!t && !T.isValueTypeName(t.name, project);
  if (t.ranks) return true;
  if (t.predefined) return true;
  const n = t.name;
  if (['DateTime', 'TimeSpan', 'Guid', 'DateTimeOffset', 'Decimal', 'Int32', 'String', 'Color', 'CancellationToken'].includes(n)) return true;
  const arr = project.typesByName.get(n);
  if (arr && arr.length) return arr.every((i) => i.kind === 'class' || i.kind === 'interface' || i.kind === 'enum' || i.kind === 'record' || i.kind === 'delegate');
  if (T.VALUE_TYPES.has(n)) return false;
  // external types: assume classes (structs are mostly listed above)
  return /^[A-Z]/.test(n) && !/Span$|Memory$|Enumerator$|Builder$|Struct$|Info$|Point|Size|Rect|Vector|Matrix|Quaternion|Bounds/.test(n);
}

// ───────────────────────────────────────── empty / redundant
function isCatchAll(c) { return !c.type || c.type.name === 'Exception' && (c.type.parts.length === 1 || c.type.qual === 'System.Exception'); }
R('empty-catch-generic', 'S2486', 'S', 'MI', 15, ['error-handling', 'cwe-390', 'cwe-391'],
  ['Generic exceptions should not be ignored', 'An empty catch-all swallows every error, including bugs, without a trace.', 'Log or handle the exception, or catch a specific type.'],
  ['일반 예외를 무시하면 안 됩니다', '비어 있는 catch-all은 버그를 포함한 모든 오류를 흔적 없이 삼킵니다.', '예외를 기록하거나 처리하거나 구체적인 타입을 잡으세요.'],
  { kinds: { Catch(n, cx) {
    if (!isCatchAll(n) || n.when || n.block.stmts.length) return;
    if (U.hasCommentInside(cx.pf, n.block)) return;
    cx.report(n, 'Handle the exception or explain in a comment why it can be ignored.', '예외를 처리하거나 무시해도 되는 이유를 주석으로 남기세요.');
  } } });
R('empty-block', 'S108', 'S', 'MA', 5, ['suspicious'],
  ['Nested blocks of code should not be left empty', 'An empty block is either dead code or a forgotten implementation.', 'Add the missing code, remove the block, or explain it in a comment.'],
  ['중첩 코드 블록을 비워 두면 안 됩니다', '빈 블록은 죽은 코드이거나 잊어버린 구현입니다.', '빠진 코드를 넣거나 블록을 지우거나 주석으로 설명하세요.'],
  { kinds: { Block(n, cx) {
    if (n.stmts.length) return;
    const p = n.parent;
    if (!p) return;
    const ok = (p.k === 'If' && (p.then === n || p.else === n)) || ((p.k === 'For' || p.k === 'Foreach' || p.k === 'While' || p.k === 'Do') && p.body === n) ||
      (p.k === 'Try' && (p.block === n || p.fin === n)) || (p.k === 'Catch' && !isCatchAll(p)) || p.k === 'Lock' || p.k === 'Using' || p.k === 'Block' || p.k === 'CheckedStmt' || p.k === 'UnsafeStmt';
    if (!ok) return;
    if ((p.k === 'While' || p.k === 'For') && p.body === n && U.containsKind({ k: 'Wrap', cond: p.cond || null }, ['Invocation', 'Assign', 'Unary', 'Await'])) return;
    if (p.k === 'Catch' && p.when) return;
    if (U.hasCommentInside(cx.pf, n)) return;
    cx.report(n, 'Either remove or fill this block of code.', '이 코드 블록을 지우거나 채우세요.');
  } } });
R('empty-method', 'S1186', 'S', 'CR', 5, ['suspicious'],
  ['Methods should not be empty', 'An empty method without explanation looks like an unfinished implementation.', 'Implement it, throw NotSupportedException, or add a comment explaining why it is empty.'],
  ['메서드는 비어 있으면 안 됩니다', '설명 없는 빈 메서드는 미완성 구현처럼 보입니다.', '구현하거나 NotSupportedException을 던지거나 비어 있는 이유를 주석으로 남기세요.'],
  { kinds: { Method(n, cx) {
    if (!n.body || n.body.stmts.length || U.hasCommentInside(cx.pf, n.body)) return;
    if (hasMod(n, 'virtual') || hasMod(n, 'override') || hasMod(n, 'abstract') || hasMod(n, 'partial') || n.iface) return;
    const info = n.owner && n.owner.typeInfo;
    if (info && (info.kind === 'interface' || isUnity(info))) return;
    if (info && U.mayImplementInterface(info, n.name) && hasMod(n, 'public')) return;
    cx.report(n, `Add a nested comment explaining why this method is empty, throw a 'NotSupportedException' or complete the implementation.`, `이 메서드가 비어 있는 이유를 주석으로 남기거나 'NotSupportedException'을 던지거나 구현을 마치세요.`, { atName: true });
  } } });
R('not-implemented', 'S3717', 'S', 'IN', 0, ['cwe-546'],
  ['Track use of "NotImplementedException"', 'NotImplementedException marks unfinished code that will fail at runtime.', 'Implement the member, or throw NotSupportedException if it is intentionally unsupported.'],
  ['"NotImplementedException" 사용을 추적하세요', 'NotImplementedException은 실행 중 실패할 미완성 코드를 나타냅니다.', '멤버를 구현하거나 일부러 지원하지 않으면 NotSupportedException을 던지세요.'],
  { kinds: { New(n, cx) {
    if (n.type && n.type.name === 'NotImplementedException' && n.parent && (n.parent.k === 'Throw' || n.parent.k === 'ThrowExpr')) cx.report(n, 'Implement this function or throw a different exception to indicate that it is not supported.', '이 함수를 구현하거나 지원하지 않음을 나타내는 다른 예외를 던지세요.');
  } } });
R('todo-comment', 'S1135', 'S', 'IN', 0, ['cwe-546'],
  ['Track uses of "TODO" tags', 'TODO comments mark unfinished work that tends to be forgotten.', 'Do the work, or turn it into a tracked issue.'],
  ['"TODO" 태그 사용을 추적하세요', 'TODO 주석은 잊히기 쉬운 미완성 작업을 나타냅니다.', '작업을 마치거나 추적되는 이슈로 바꾸세요.'],
  { file(pf, cx) { for (const c of pf.lex.comments) if (/(^|[^\w])TODO([^\w]|$)/.test(c.text)) cx.report({ line: c.line, col: c.col }, 'Complete the task associated to this "TODO" comment.', '이 "TODO" 주석의 작업을 마치세요.'); } });
R('fixme-comment', 'S1134', 'S', 'MA', 0, ['cwe-546'],
  ['Track uses of "FIXME" tags', 'FIXME comments mark known defects.', 'Fix the problem the comment describes.'],
  ['"FIXME" 태그 사용을 추적하세요', 'FIXME 주석은 알려진 결함을 나타냅니다.', '주석이 설명하는 문제를 고치세요.'],
  { file(pf, cx) { for (const c of pf.lex.comments) if (/(^|[^\w])FIXME([^\w]|$)/.test(c.text)) cx.report({ line: c.line, col: c.col }, 'Take the required action to fix the issue indicated by this "FIXME" comment.', '이 "FIXME" 주석이 가리키는 문제를 고치세요.'); } });

const CODE_LINE = /(;\s*$|^\s*[{}]\s*$|^\s*(if|for|foreach|while|switch|return|var|using|public|private|protected|internal|class|namespace|else|try|catch|throw|new)\b.*[;{)]\s*$|^\s*\w[\w.<>,\s]*\([^)]*\)\s*;\s*$|^\s*[\w.]+\s*(=|\+=|-=)\s*[^=].*;\s*$)/;
R('commented-out-code', 'S125', 'S', 'MA', 5, ['unused'],
  ['Sections of code should not be commented out', 'Commented-out code is clutter; version control keeps the history.', 'Delete the commented-out code.'],
  ['코드를 주석으로 막아 두면 안 됩니다', '주석으로 막은 코드는 잡동사니입니다. 이력은 버전 관리가 보관합니다.', '주석 처리한 코드를 지우세요.'],
  { file(pf, cx) {
    let run = null;
    const flush = () => { if (run && run.code >= 1 && run.code / run.n >= 0.5) cx.report({ line: run.line, col: run.col }, 'Remove this commented out code.', '주석으로 막은 이 코드를 지우세요.'); run = null; };
    for (const c of pf.lex.comments) {
      if (c.doc) { flush(); continue; }
      const lines = c.block ? c.text.replace(/^\/\*+|\*+\/$/g, '').split('\n') : [c.text.replace(/^\/\/+/, '')];
      for (const l0 of lines) {
        const l = l0.replace(/^\s*\*?\s?/, '');
        if (!l.trim()) continue;
        const isCode = CODE_LINE.test(l) && !/^\s*(TODO|FIXME|NOTE|HACK|see|e\.g\.|i\.e\.|http)/i.test(l) && !/[가-힣]/.test(l) && !/^\s*\w+:\s/.test(l);
        if (!run || c.line > run.last + 1) { flush(); run = { line: c.line, col: c.col, n: 0, code: 0, last: c.line }; }
        run.n++; if (isCode) run.code++;
        run.last = c.endLine || c.line;
      }
    }
    flush();
  } });

R('console-logging', 'S2228', 'S', 'MI', 10, ['owasp-a9'],
  ['Console logging should not be used', 'Console output in GUI or server code is lost or leaks information; use a logging framework.', 'Use ILogger, Trace or another logging framework.'],
  ['콘솔 로깅을 쓰면 안 됩니다', 'GUI나 서버 코드의 콘솔 출력은 사라지거나 정보를 노출합니다. 로깅 프레임워크를 쓰세요.', 'ILogger, Trace 같은 로깅 프레임워크를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (name !== 'WriteLine' && name !== 'Write') return;
    if (dotted(callTarget(n) || {}) !== 'Console') return;
    if (!guiOrServer(cx.pf)) return;
    cx.report(n, 'Remove this logging statement, or use a logging framework.', '이 로깅 문을 지우거나 로깅 프레임워크를 쓰세요.');
  } } });
function guiOrServer(pf) {
  if (pf._gui !== undefined) return pf._gui;
  pf._gui = pf.types.some((t) => t.typeInfo && ['Form', 'UserControl', 'Window', 'Page', 'Controller', 'ControllerBase', 'Control'].some((b) => t.typeInfo.inheritsFrom(b)));
  return pf._gui;
}
R('debugger-break', 'S1215-dbg', 'S', 'MA', 5, ['suspicious'],
  ['"Debugger.Break" and "Debugger.Launch" should not be left in code', 'These calls stop or attach a debugger in production.', 'Remove the call.'],
  ['"Debugger.Break"와 "Debugger.Launch"를 코드에 남기면 안 됩니다', '이 호출은 운영 환경에서 디버거를 멈추거나 붙입니다.', '호출을 지우세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if ((name === 'Break' || name === 'Launch') && /(^|\.)Debugger$/.test(dotted(callTarget(n) || {}) || '')) {
      if (enclosing(n, ['If']) && /IsAttached|DEBUG/.test(cx.src.slice(enclosing(n, ['If']).cond.pos, enclosing(n, ['If']).cond.end))) return;
      cx.report(n, `Remove this call to 'Debugger.${name}'.`, `'Debugger.${name}' 호출을 지우세요.`);
    }
  } } });
R('gc-collect', 'S1215', 'S', 'CR', 10, ['performance', 'unpredictable'],
  ['"GC.Collect" should not be called', 'Forcing a collection stalls the process and rarely helps.', 'Remove the call and release resources with Dispose.'],
  ['"GC.Collect"를 호출하면 안 됩니다', '강제 수집은 프로세스를 멈추게 하고 도움이 되는 경우가 드뭅니다.', '호출을 지우고 Dispose로 자원을 해제하세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) === 'Collect' && /(^|\.)GC$/.test(dotted(callTarget(n) || {}) || '')) cx.report(n, `Refactor the code to remove this use of 'GC.Collect'.`, `'GC.Collect' 사용을 없애도록 코드를 고치세요.`);
    if (callName(n) === 'GetTotalMemory' && n.args.length && unparen(n.args[0].expr).k === 'Literal' && unparen(n.args[0].expr).value === true) cx.report(n, `Refactor the code to remove this use of 'GC.GetTotalMemory(true)'.`, `'GC.GetTotalMemory(true)' 사용을 없애도록 코드를 고치세요.`);
  } } });
R('goto-statement', 'S907', 'S', 'MA', 10, ['brain-overload'],
  ['"goto" statement should not be used', 'goto makes control flow hard to follow.', 'Use structured loops, break or return.'],
  ['"goto" 문을 쓰면 안 됩니다', 'goto는 제어 흐름을 따라가기 어렵게 합니다.', '구조적 반복, break, return을 쓰세요.'],
  { kinds: { Goto(n, cx) { if (n.kind === 'label') cx.report(n, `Remove this use of 'goto'.`, `'goto' 사용을 지우세요.`); } } });

function conditionalChain(e) {
  for (let x = e; x; ) {
    x = unparen(x);
    if (!x) return false;
    if (x.k === 'Member') { if (x.cond) return true; x = x.expr; continue; }
    if (x.k === 'Invocation' || x.k === 'Element') { if (x.cond) return true; x = x.expr; continue; }
    return false;
  }
  return false;
}
R('redundant-boolean-literal', 'S1125', 'S', 'MI', 5, ['clumsy'],
  ['Boolean literals should not be redundant', 'Comparing with true/false or returning true/false from a ternary adds noise.', 'Simplify: use the condition itself or its negation.'],
  ['불리언 리터럴이 불필요하면 안 됩니다', 'true/false와 비교하거나 삼항식에서 true/false를 돌려주는 것은 잡음입니다.', '조건 자체나 부정을 쓰도록 단순하게 고치세요.'],
  { kinds: {
    Binary(n, cx) {
      if (!['==', '!=', '&&', '||'].includes(n.op)) return;
      const l = unparen(n.left); const r = unparen(n.right);
      const lit = (x) => x.k === 'Literal' && x.kind === 'bool';
      if (!lit(l) && !lit(r)) return;
      const other = lit(l) ? r : l;
      if (n.op === '==' || n.op === '!=') {
        const t = T.typeOf(other, cx.project);
        if (!t || t.name !== 'bool' || t.nullable) return;
        if (other.k === 'Member' && other.cond) return;
        // `a?.B().C() == true`: a ?. anywhere in the receiver chain makes the result bool?
        if (conditionalChain(other)) return;
      }
      cx.report(n, 'Remove the unnecessary Boolean literal(s).', '불필요한 불리언 리터럴을 지우세요.');
    },
    Conditional(n, cx) {
      const t = unparen(n.then); const e = unparen(n.else);
      if (t.k === 'Literal' && t.kind === 'bool' && e.k === 'Literal' && e.kind === 'bool') cx.report(n, 'Remove the unnecessary Boolean literals.', '불필요한 불리언 리터럴을 지우세요.');
    },
    Unary(n, cx) { if (n.op === '!' && unparen(n.operand).k === 'Literal' && unparen(n.operand).kind === 'bool') cx.report(n, 'Remove the unnecessary Boolean literal.', '불필요한 불리언 리터럴을 지우세요.'); },
  } });
R('nested-ternary', 'S3358', 'S', 'MA', 5, ['confusing'],
  ['Ternary operators should not be nested', 'Nested ?: expressions are hard to read.', 'Use if/else or a switch expression.'],
  ['삼항 연산자를 중첩하면 안 됩니다', '중첩된 ?: 식은 읽기 어렵습니다.', 'if/else나 switch 식을 쓰세요.'],
  { kinds: { Conditional(n, cx) {
    let p = n.parent;
    while (p && p.k === 'Paren') p = p.parent;
    if (p && p.k === 'Conditional' && p.cond !== n && !U.containsKind(p, ['Lambda'])) cx.report(n, 'Extract this nested ternary operation into an independent statement.', '중첩된 이 삼항 연산을 별도 문장으로 추출하세요.');
  } } });
R('return-boolean-literal', 'S1126', 'S', 'MI', 2, ['clumsy'],
  ['Return of boolean expressions should not be wrapped into an "if-then-else" statement', '`if (c) return true; else return false;` is just `return c;`.', 'Return the condition directly.'],
  ['불리언 식 반환을 if-then-else로 감싸면 안 됩니다', '`if (c) return true; else return false;`는 `return c;`와 같습니다.', '조건을 바로 반환하세요.'],
  { kinds: { If(n, cx) {
    const rb = (s) => { const x = s && s.k === 'Block' && s.stmts.length === 1 ? s.stmts[0] : s; return x && x.k === 'Return' && x.expr && unparen(x.expr).k === 'Literal' && unparen(x.expr).kind === 'bool' ? unparen(x.expr).value : null; };
    const t = rb(n.then);
    if (t === null) return;
    let e = n.else ? rb(n.else) : null;
    if (!n.else && n.parent && n.parent.k === 'Block') { const i = n.parent.stmts.indexOf(n); e = rb(n.parent.stmts[i + 1]); }
    if (e === null || e === t) return;
    if (n.parent && n.parent.k === 'If' && n.parent.else === n) return;
    cx.report(n, 'Replace this if-then-else statement by a single return statement.', '이 if-then-else 문을 return 문 하나로 바꾸세요.');
  } } });
R('collapsible-if', 'S1066', 'S', 'MA', 5, ['clumsy'],
  ['Mergeable "if" statements should be combined', 'Two nested ifs without else can be one if with &&.', 'Merge the conditions with &&.'],
  ['합칠 수 있는 if 문은 합쳐야 합니다', 'else 없는 두 if가 중첩되면 &&로 하나의 if로 만들 수 있습니다.', '조건을 &&로 합치세요.'],
  { kinds: { If(n, cx) {
    if (n.else) return;
    const inner = n.then && n.then.k === 'Block' && n.then.stmts.length === 1 ? n.then.stmts[0] : n.then && n.then.k === 'If' ? n.then : null;
    if (!inner || inner.k !== 'If' || inner.else) return;
    if (U.containsKind(n.cond, ['DeclPattern', 'VarPattern', 'DeclExpr', 'RecursivePattern']) && U.containsKind(inner.cond, ['DeclPattern', 'VarPattern', 'DeclExpr'])) return;
    if (U.hasCommentInside(cx.pf, { line: n.line, col: n.col, endLine: inner.line, endCol: inner.col })) return;
    cx.report(inner, 'Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합치세요.');
  } } });
R('switch-too-few-cases', 'S1301', 'S', 'MI', 5, ['clumsy'],
  ['"switch" statements should have at least 3 "case" clauses', 'A switch with one or two cases reads better as an if.', 'Replace the switch with if/else.'],
  ['switch 문에는 case가 적어도 3개 있어야 합니다', 'case가 한두 개인 switch는 if로 쓰는 편이 읽기 좋습니다.', 'switch를 if/else로 바꾸세요.'],
  { kinds: { Switch(n, cx) {
    const labels = n.sections.reduce((a, s) => a + s.labels.length, 0);
    if (labels < 3 && !n.sections.some((s) => s.labels.some((l) => l.k === 'CaseLabel' && l.pattern && l.pattern.k !== 'ConstPattern'))) cx.report(n, `Replace this 'switch' statement with 'if' statements to increase readability.`, `가독성을 위해 이 'switch' 문을 'if' 문으로 바꾸세요.`);
  } } });
R('default-clause-position', 'S4524', 'S', 'CR', 5, ['convention'],
  ['"default" clauses should be first or last', 'A default in the middle of a switch is easy to miss.', 'Move default to the end (or the start).'],
  ['default 절은 처음이나 마지막에 있어야 합니다', 'switch 중간의 default는 놓치기 쉽습니다.', 'default를 끝(또는 처음)으로 옮기세요.'],
  { kinds: { Switch(n, cx) {
    const idx = n.sections.findIndex((s) => s.labels.some((l) => l.k === 'DefaultLabel'));
    if (idx > 0 && idx < n.sections.length - 1) cx.report(n.sections[idx], 'Move this default clause to the beginning or end of this switch statement.', '이 default 절을 switch 문의 처음이나 끝으로 옮기세요.');
  } } });
R('switch-without-default', 'S131', 'S', 'CR', 5, ['cwe-478'],
  ['"switch/Select" statements should contain a "default/Case Else" clauses', 'Without default, unexpected values are silently ignored.', 'Add a default clause, even if it only throws.'],
  ['switch 문에는 default 절이 있어야 합니다', 'default가 없으면 예상하지 못한 값이 조용히 무시됩니다.', '예외만 던지더라도 default 절을 넣으세요.'],
  { kinds: { Switch(n, cx) {
    if (n.sections.some((s) => s.labels.some((l) => l.k === 'DefaultLabel' || (l.k === 'CaseLabel' && l.pattern && (l.pattern.k === 'DiscardPattern' || l.pattern.k === 'VarPattern'))))) return;
    // switches over enums whose every member is covered are fine
    const enumNames = new Set();
    let enumType = null;
    for (const s of n.sections) for (const l of s.labels) if (l.pattern && l.pattern.k === 'ConstPattern' && unparen(l.pattern.expr).k === 'Member') { const m = unparen(l.pattern.expr); enumType = dotted(m.expr); enumNames.add(m.name); }
    if (enumType) {
      const arr = cx.project.typesByName.get(enumType.split('.').pop());
      if (arr && arr.length === 1 && arr[0].kind === 'enum' && [...arr[0].members.keys()].every((k) => enumNames.has(k))) return;
      if (!arr) return; // external enum: cannot tell
    }
    cx.report(n, `Add a 'default' clause to this 'switch' statement.`, `이 'switch' 문에 'default' 절을 넣으세요.`);
  } } });
R('if-else-if-without-else', 'S126', 'S', 'CR', 5, ['convention'],
  ['"if ... else if" constructs should end with "else" clauses', 'A final else documents that the remaining cases were considered.', 'Add a final else, even if it only throws or comments.'],
  ['if ... else if 구조는 else 절로 끝나야 합니다', '마지막 else는 나머지 경우를 고려했음을 보여 줍니다.', '예외를 던지거나 주석만 있더라도 마지막 else를 넣으세요.'],
  { kinds: { If(n, cx) {
    if (!(n.parent && n.parent.k === 'If' && n.parent.else === n) || n.else) return;
    cx.report(n, `Add the missing 'else' clause with either the appropriate action or a suitable comment as to why no action is taken.`, `적절한 동작이나 아무것도 하지 않는 이유를 담은 빠진 'else' 절을 넣으세요.`);
  } } });
R('redundant-parentheses', 'S1110', 'S', 'MA', 1, ['confusing'],
  ['Redundant pairs of parentheses should be removed', 'Doubled parentheses add noise.', 'Remove the extra pair.'],
  ['불필요한 괄호 쌍은 지워야 합니다', '두 겹 괄호는 잡음입니다.', '남는 괄호 쌍을 지우세요.'],
  { kinds: { Paren(n, cx) { if (n.expr.k === 'Paren') cx.report(n, 'Remove these redundant parentheses.', '이 불필요한 괄호를 지우세요.'); } } });
R('redundant-jump', 'S3626', 'S', 'MI', 1, ['redundant'],
  ['Jump statements should not be redundant', 'A return at the end of a void method or a continue at the end of a loop does nothing.', 'Remove the jump.'],
  ['점프 문이 불필요하면 안 됩니다', 'void 메서드 끝의 return이나 반복 끝의 continue는 아무 일도 하지 않습니다.', '점프 문을 지우세요.'],
  { kinds: {
    Return(n, cx) {
      if (n.expr) return;
      const b = n.parent;
      if (!b || b.k !== 'Block' || b.stmts[b.stmts.length - 1] !== n) return;
      const f = b.parent;
      if (f && (f.k === 'Method' || f.k === 'LocalFunc' || f.k === 'Ctor' || f.k === 'Accessor' || f.k === 'Lambda') && f.body === b && b.stmts.length > 1) cx.report(n, 'Remove this redundant jump.', '이 불필요한 점프를 지우세요.');
    },
    Continue(n, cx) {
      const b = n.parent;
      if (!b || b.k !== 'Block' || b.stmts[b.stmts.length - 1] !== n) return;
      const l = b.parent;
      if (l && ['For', 'Foreach', 'While', 'Do'].includes(l.k) && l.body === b && b.stmts.length > 1) cx.report(n, 'Remove this redundant jump.', '이 불필요한 점프를 지우세요.');
    },
  } });
R('redundant-cast', 'S1905', 'S', 'MI', 5, ['redundant', 'clumsy'],
  ['Redundant casts should not be used', 'Casting an expression to the type it already has adds noise.', 'Remove the cast.'],
  ['불필요한 캐스트를 쓰면 안 됩니다', '이미 그 타입인 식을 캐스팅하면 잡음만 늘어납니다.', '캐스트를 지우세요.'],
  { kinds: {
    Cast(n, cx) {
      const ct = n.type;
      if (!ct || ct.args.length || ct.tuple) return;
      const et = T.typeOf(n.expr, cx.project);
      const ex = unparen(n.expr);
      if (!et || !ex) return;
      if (ex.k === 'Literal' && ex.kind !== 'string') return; // numeric literal casts select a type
      if (ex.k === 'Literal' && ex.kind === 'string' && T.normName(ct.name) === 'string' && !ct.nullable) { cx.report(n, `Remove this unnecessary cast to '${ct.name}'.`, `'${ct.name}'로의 불필요한 캐스트를 지우세요.`); return; }
      if (ex.k !== 'Name' || !ex.sym || !ex.sym.type || ex.sym.type.name === 'var') return;
      const st = ex.sym.type;
      if (T.normName(st.name) === T.normName(ct.name) && !!st.nullable === !!ct.nullable && (st.ranks || 0) === (ct.ranks || 0) && !(st.args || []).length) cx.report(n, `Remove this unnecessary cast to '${ct.name}'.`, `'${ct.name}'로의 불필요한 캐스트를 지우세요.`);
    },
  } });
R('redundant-tostring', 'S1858', 'S', 'MI', 5, ['clumsy'],
  ['"ToString()" calls should not be redundant', 'Calling ToString() on a string returns the same string.', 'Remove the call.'],
  ['"ToString()" 호출이 불필요하면 안 됩니다', '문자열에 ToString()을 부르면 같은 문자열을 돌려줍니다.', '호출을 지우세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'ToString' || n.args.length) return;
    const t = callTarget(n);
    if (!t || unparen(n.expr).cond) return;
    const tt = T.typeOf(t, cx.project);
    if (tt && tt.name === 'string' && !tt.ranks) cx.report(n, `There's no need to call 'ToString()' on a string.`, `문자열에 'ToString()'을 부를 필요가 없습니다.`);
  } } });
R('redundant-modifier', 'S2333', 'S', 'MI', 1, ['clumsy', 'redundant'],
  ['Redundant modifiers should not be used', '`partial` on a type declared once, or `sealed` on a member of a sealed class, has no effect.', 'Remove the modifier.'],
  ['불필요한 한정자를 쓰면 안 됩니다', '한 번만 선언된 타입의 `partial`이나 sealed 클래스 멤버의 `sealed`는 효과가 없습니다.', '한정자를 지우세요.'],
  { kinds: {
    TypeDecl(n, cx) {
      const info = n.typeInfo;
      if (!info) return;
      if (n.partial && info.decls.length === 1 && !info.hasExternalBase() && !(n.attrs && n.attrs.length) && !n.members.some((m) => (m.attrs && m.attrs.length) || hasMod(m, 'partial'))
        && !n.members.some((m) => m.k === 'Field' && m.attrs && m.attrs.length) && !/\.xaml\.cs$|\.razor\.cs$/i.test(cx.pf.path) && !info.externalBases.length && !n.outer) {
        cx.report(n, `'partial' is gratuitous in this context.`, `여기서는 'partial'이 불필요합니다.`, { atName: true });
      }
      if (n.mods.has('sealed')) for (const m of n.members) if (hasMod(m, 'sealed') && hasMod(m, 'override')) cx.report(m, `'sealed' is redundant in this context.`, `여기서는 'sealed'가 불필요합니다.`, { atName: true });
    },
  } });
R('field-default-init', 'S3052', 'S', 'MI', 2, ['convention', 'redundant'],
  ['Members should not be initialized to default values', 'The runtime already initializes fields to their default value.', 'Remove the initializer.'],
  ['멤버를 기본값으로 초기화하면 안 됩니다', '런타임이 이미 필드를 기본값으로 초기화합니다.', '초기화식을 지우세요.'],
  { kinds: { Field(n, cx) {
    if (n.isConst || !n.type) return;
    const td = n.owner;
    if (td && (td.kind === 'struct' || td.kind === 'record struct')) return;
    for (const v of n.vars) {
      if (!v.init) continue;
      // `= null!` / `= default!` silences the nullable warning for a field set later (WinForms
      // controls, DI); removing it brings the warning back, so it is not redundant.
      if (hasSuppressNull(v.init)) continue;
      const e = unparen(v.init);
      const tn = T.normName(n.type.name);
      let def = false;
      if (e.k === 'Literal' && e.kind === 'null' && !(n.type.predefined && tn !== 'string' && tn !== 'object')) def = true;
      if (e.k === 'Literal' && e.kind === 'bool' && e.value === false && tn === 'bool' && !n.type.nullable) def = true;
      if (e.k === 'Literal' && (e.kind === 'int' || e.kind === 'real') && e.value === 0 && T.NUMERIC.has(tn) && !n.type.nullable && !Object.is(e.value, -0)) def = true;
      if (e.k === 'Literal' && e.kind === 'default') def = true;
      if (e.k === 'Default') def = true;
      if (def) cx.report(v, `Remove the member initializer, all members are assigned their default value automatically.`, `멤버 초기화식을 지우세요. 모든 멤버는 자동으로 기본값을 받습니다.`, { atName: true });
    }
  } } });
function hasSuppressNull(e) {
  while (e && e.k === 'Paren') e = e.expr;
  return !!e && e.k === 'SuppressNull';
}
R('redundant-anonymous-property-name', 'S3441', 'S', 'MI', 1, ['clumsy'],
  ['Redundant property names should be omitted in anonymous classes', '`new { Name = x.Name }` can be written `new { x.Name }`.', 'Omit the property name.'],
  ['익명 클래스에서 불필요한 속성 이름은 생략해야 합니다', '`new { Name = x.Name }`은 `new { x.Name }`으로 쓸 수 있습니다.', '속성 이름을 생략하세요.'],
  { kinds: { AnonMember(n, cx) {
    if (!n.name) return;
    const v = unparen(n.value);
    if ((v.k === 'Name' && v.name === n.name) || (v.k === 'Member' && !v.cond && v.name === n.name)) cx.report(n, `Remove the redundant '${n.name} ='.`, `불필요한 '${n.name} ='를 지우세요.`);
  } } });
R('redundant-inheritance', 'S1939', 'S', 'MI', 1, ['clumsy', 'redundant'],
  ['Inheritance list should not be redundant', 'Deriving from object, or declaring an enum as int, is the default.', 'Remove the redundant base.'],
  ['상속 목록이 불필요하면 안 됩니다', 'object 상속이나 enum의 int 지정은 기본값입니다.', '불필요한 기반 형식을 지우세요.'],
  { kinds: { TypeDecl(n, cx) {
    for (const b of n.bases) {
      const bn = T.normName(b.name);
      if ((n.kind === 'class' || n.kind === 'record') && bn === 'object') cx.report(b, `'Object' should not be explicitly extended.`, `'Object'를 명시적으로 상속하지 마세요.`);
      if (n.kind === 'enum' && bn === 'int') cx.report(b, `'int' should not be explicitly used as the underlying type.`, `'int'를 기반 형식으로 명시하지 마세요.`);
    }
  } } });
R('redundant-constructor', 'S3253', 'S', 'MI', 2, ['redundant'],
  ['Constructor and destructor declarations should not be redundant', 'An empty public parameterless constructor that is the only one, or an empty static constructor, is generated anyway.', 'Remove the declaration.'],
  ['생성자와 소멸자 선언이 불필요하면 안 됩니다', '유일한 빈 public 매개변수 없는 생성자나 빈 정적 생성자는 어차피 만들어집니다.', '선언을 지우세요.'],
  { kinds: { Ctor(n, cx) {
    if (!n.body || n.body.stmts.length || n.params.length || U.hasCommentInside(cx.pf, n.body) || (n.attrs && n.attrs.length)) return;
    if (n.init && n.init.args.length) return;
    const td = n.owner;
    if (!td || td.kind === 'struct') return;
    const ctors = td.members.filter((m) => m.k === 'Ctor' && !hasMod(m, 'static'));
    if (hasMod(n, 'static')) { cx.report(n, 'Remove this redundant static constructor.', '이 불필요한 정적 생성자를 지우세요.', { atName: true }); return; }
    if (ctors.length === 1 && (hasMod(n, 'public') || (td.mods.has('abstract') && hasMod(n, 'protected'))) && td.typeInfo && td.typeInfo.decls.length === 1 && !td.params) cx.report(n, 'Remove this redundant constructor.', '이 불필요한 생성자를 지우세요.', { atName: true });
  } } });
R('empty-finalizer', 'S3880', 'S', 'MA', 5, ['performance'],
  ['Finalizers should not be empty', 'An empty finalizer only costs: the object waits for an extra GC cycle.', 'Remove the finalizer.'],
  ['종료자는 비어 있으면 안 됩니다', '빈 종료자는 비용만 듭니다. 객체가 GC 주기를 한 번 더 기다립니다.', '종료자를 지우세요.'],
  { kinds: { Destructor(n, cx) { if (n.body && !n.body.stmts.length) cx.report(n, 'Remove this empty finalizer.', '이 빈 종료자를 지우세요.'); } } });
R('override-calls-only-base', 'S1185', 'S', 'MI', 5, ['redundant'],
  ['Overriding members should do more than simply call the same member in the base class', 'An override that only forwards to base does nothing.', 'Remove the override.'],
  ['재정의 멤버는 기반 클래스의 같은 멤버를 부르는 것 이상을 해야 합니다', '기반만 부르는 재정의는 아무 일도 하지 않습니다.', '재정의를 지우세요.'],
  { kinds: { Method(n, cx) {
    if (!hasMod(n, 'override') || (n.attrs && n.attrs.length) || hasMod(n, 'sealed')) return;
    const s = n.exprBody || (n.body && n.body.stmts.length === 1 ? n.body.stmts[0] : null);
    if (!s) return;
    let e = s.k === 'Return' ? s.expr : s.k === 'ExprStmt' ? s.expr : s.k === 'Block' ? null : s;
    e = unparen(e);
    if (!e || e.k !== 'Invocation') return;
    const c = unparen(e.expr);
    if (c.k !== 'Member' || c.expr.k !== 'Base' || c.name !== n.name || e.args.length !== n.params.length) return;
    for (let i = 0; i < e.args.length; i++) { const a = unparen(e.args[i].expr); if (!(a.k === 'Name' && a.sym && a.sym.decl === n.params[i])) return; }
    if (n.params.some((p) => p.def)) return;
    cx.report(n, `Remove this method '${n.name}' to simply inherit its behavior.`, `동작을 그대로 상속하도록 메서드 '${n.name}'를 지우세요.`, { atName: true });
  } } });
R('redundant-null-check-is', 'S4201', 'S', 'MI', 2, ['redundant'],
  ['Null checks should not be combined with "is" operator checks', '`x is T` is already false for null, so `x != null && x is T` repeats the check.', 'Remove the null check.'],
  ['null 검사를 "is" 연산자 검사와 함께 쓰면 안 됩니다', '`x is T`는 null에 대해 이미 거짓이라 `x != null && x is T`는 검사를 반복합니다.', 'null 검사를 지우세요.'],
  { kinds: { Binary(n, cx) {
    if (n.op !== '&&') return;
    const l = unparen(n.left); const r = unparen(n.right);
    if (l.k !== 'Binary' || l.op !== '!=' || r.k !== 'Is') return;
    const nullSide = unparen(l.right).k === 'Literal' && unparen(l.right).kind === 'null' ? l.left : unparen(l.left).k === 'Literal' && unparen(l.left).kind === 'null' ? l.right : null;
    if (!nullSide || !same(unparen(nullSide), unparen(r.expr))) return;
    if (r.pattern.k === 'NotPattern' || (r.pattern.k === 'ConstPattern' && !r.pattern.maybeType)) return;
    cx.report(l, 'Remove this unnecessary null check; \'is\' returns false for nulls.', '불필요한 null 검사를 지우세요. \'is\'는 null에 대해 거짓을 돌려줍니다.');
  } } });
R('duplicate-cast-after-is', 'S3247', 'S', 'MI', 5, ['performance'],
  ['Duplicate casts should not be made', '`if (x is T) { ((T)x).Foo(); }` checks the type twice.', 'Use pattern matching: if (x is T t).'],
  ['중복 캐스트를 하면 안 됩니다', '`if (x is T) { ((T)x).Foo(); }`는 타입을 두 번 검사합니다.', '패턴 일치를 쓰세요: if (x is T t).'],
  { kinds: { If(n, cx) {
    const c = unparen(n.cond);
    if (c.k !== 'Is' || !c.pattern || !(c.pattern.k === 'TypePattern' || (c.pattern.k === 'ConstPattern' && c.pattern.maybeType))) return;
    const type = c.pattern.type;
    if (!type) return;
    const subj = unparen(c.expr);
    if (subj.k !== 'Name') return;
    let found = null;
    const walk = (x) => {
      if (found || !x || typeof x !== 'object') return;
      if (x.k === 'Cast' && same(unparen(x.expr), subj) && same(x.type, type)) { found = x; return; }
      if (x.k === 'As' && same(unparen(x.expr), subj) && same(x.type, type)) { found = x; return; }
      forEachChild(x, walk);
    };
    walk(n.then);
    if (found) cx.report(found, `Replace this type-check-and-cast sequence with an 'is' pattern.`, `이 타입 검사 후 캐스트를 'is' 패턴으로 바꾸세요.`);
  } } });
R('simplify-type-check', 'S2219', 'S', 'MI', 5, ['clumsy'],
  ['Runtime type checking should be simplified', '`typeof(T).IsInstanceOfType(x)` and `typeof(T).IsAssignableFrom(x.GetType())` are `x is T`.', 'Use the is operator.'],
  ['런타임 타입 검사는 단순하게 해야 합니다', '`typeof(T).IsInstanceOfType(x)`와 `typeof(T).IsAssignableFrom(x.GetType())`는 `x is T`입니다.', 'is 연산자를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n); const t = callTarget(n);
    if (!t || unparen(t).k !== 'Typeof' || n.args.length !== 1) return;
    if (name === 'IsInstanceOfType') cx.report(n, `Use the 'is' operator instead.`, `대신 'is' 연산자를 쓰세요.`);
    if (name === 'IsAssignableFrom' && unparen(n.args[0].expr).k === 'Invocation' && callName(unparen(n.args[0].expr)) === 'GetType') cx.report(n, `Use the 'is' operator instead.`, `대신 'is' 연산자를 쓰세요.`);
  } } });
R('inverted-boolean-check', 'S1940', 'S', 'MI', 2, ['pitfall'],
  ['Boolean checks should not be inverted', '`!(a == b)` is harder to read than `a != b`.', 'Use the opposite operator.'],
  ['불리언 검사를 뒤집으면 안 됩니다', '`!(a == b)`는 `a != b`보다 읽기 어렵습니다.', '반대 연산자를 쓰세요.'],
  { kinds: { Unary(n, cx) {
    if (n.op !== '!') return;
    const o = n.operand;
    if (o.k !== 'Paren') return;
    const b = unparen(o);
    const inv = { '==': '!=', '!=': '==', '<': '>=', '>': '<=', '<=': '>', '>=': '<' };
    if (b.k === 'Binary' && inv[b.op]) {
      if (['<', '>', '<=', '>='].includes(b.op)) { const t = T.typeOf(b.left, cx.project); if (!t || t.name === 'double' || t.name === 'float') return; }
      cx.report(n, `Use the opposite operator ('${inv[b.op]}') instead.`, `대신 반대 연산자('${inv[b.op]}')를 쓰세요.`);
    }
  } } });
R('double-negation', 'S2761', 'S', 'MA', 1, ['pitfall'],
  ['Doubled prefix operators "!!" and "~~" should not be used', 'Applying ! or ~ twice cancels out and is usually a typo.', 'Remove both operators, or fix the expression.'],
  ['"!!"과 "~~" 같은 이중 접두 연산자를 쓰면 안 됩니다', '! 나 ~를 두 번 쓰면 서로 상쇄되며 대개 오타입니다.', '두 연산자를 지우거나 식을 고치세요.'],
  { kinds: { Unary(n, cx) {
    if (n.op !== '!' && n.op !== '~') return;
    const o = n.operand;
    if (o.k === 'Unary' && o.op === n.op && !o.postfix) cx.report(n, `Use the '${n.op}' operator just once or not at all.`, `'${n.op}' 연산자를 한 번만 쓰거나 아예 쓰지 마세요.`);
  } } });
R('string-isnullorempty', 'S3256', 'S', 'MI', 2, ['clumsy'],
  ['"string.IsNullOrEmpty" should be used', 'Comparing with "" or checking Length == 0 is less clear and not null-safe.', 'Use string.IsNullOrEmpty(s).'],
  ['"string.IsNullOrEmpty"를 써야 합니다', '""와 비교하거나 Length == 0을 검사하는 것은 덜 명확하고 null에 안전하지 않습니다.', 'string.IsNullOrEmpty(s)를 쓰세요.'],
  { kinds: {
    Binary(n, cx) {
      if (n.op !== '==' && n.op !== '!=') return;
      const isEmptyLit = (x) => { x = unparen(x); return (x.k === 'Literal' && x.kind === 'string' && x.value === '') || ['string.Empty', 'String.Empty'].includes(dotted(x) || ''); };
      const other = isEmptyLit(n.right) ? n.left : isEmptyLit(n.left) ? n.right : null;
      if (!other) return;
      const t = T.typeOf(other, cx.project);
      if (t && t.name !== 'string') return;
      if (n.parent && n.parent.k === 'Binary' && (n.parent.op === '||' || n.parent.op === '&&')) {
        const sib = n.parent.left === n ? n.parent.right : n.parent.left;
        if (U.containsKind({ k: 'X', a: sib }, ['Literal']) && /null/.test(cx.src.slice(sib.pos, sib.end))) { cx.report(n.parent, `Use 'string.IsNullOrEmpty()' instead of comparing to empty string.`, `빈 문자열과 비교하는 대신 'string.IsNullOrEmpty()'를 쓰세요.`); return; }
      }
      cx.report(n, `Use 'string.IsNullOrEmpty()' or check 'string.Length' instead of comparing to empty string.`, `빈 문자열과 비교하는 대신 'string.IsNullOrEmpty()'나 'string.Length' 검사를 쓰세요.`);
    },
    Invocation(n, cx) {
      if (callName(n) !== 'Equals' || n.args.length !== 1) return;
      const a = unparen(n.args[0].expr);
      if (a.k === 'Literal' && a.kind === 'string' && a.value === '' && callTarget(n)) cx.report(n, `Use 'string.IsNullOrEmpty()' instead of comparing to empty string.`, `빈 문자열과 비교하는 대신 'string.IsNullOrEmpty()'를 쓰세요.`);
    },
  } });
R('count-instead-of-any', 'S1155', 'S', 'MI', 2, ['performance'],
  ['"Any()" should be used to test for emptiness', 'Count() may walk the whole sequence just to compare with zero.', 'Use Any() (or the Count / Length property of a collection).'],
  ['비었는지 검사할 때는 "Any()"를 써야 합니다', 'Count()는 0과 비교하려고 시퀀스 전체를 훑을 수 있습니다.', 'Any()(또는 컬렉션의 Count / Length 속성)를 쓰세요.'],
  { kinds: { Binary(n, cx) {
    const isCount = (x) => { x = unparen(x); return x.k === 'Invocation' && callName(x) === 'Count' && x.args.length === 0 && callTarget(x) && !unparen(x.expr).cond; };
    const num = (x) => U.numVal(x);
    let hit = false;
    if (isCount(n.left)) { const k = num(n.right); hit = (k === 0 && ['==', '!=', '>', '<='].includes(n.op)) || (k === 1 && ['>=', '<'].includes(n.op)); }
    if (isCount(n.right)) { const k = num(n.left); hit = (k === 0 && ['==', '!=', '<', '>='].includes(n.op)) || (k === 1 && ['<=', '>'].includes(n.op)); }
    if (hit) cx.report(n, `Use '.Any()' to test whether this 'IEnumerable' is empty or not.`, `이 'IEnumerable'이 비었는지 검사하려면 '.Any()'를 쓰세요.`);
  } } });
R('linq-simplification', 'S2971', 'S', 'MA', 2, ['clumsy'],
  ['LINQ expressions should be simplified', '`Where(p).Any()`, `Where(p).Count()`, `Select(x => x)` and Count() on a collection can be written more simply.', 'Pass the predicate to the terminal operator, drop identity selects, use the Count property.'],
  ['LINQ 식은 단순하게 써야 합니다', '`Where(p).Any()`, `Where(p).Count()`, `Select(x => x)`, 컬렉션의 Count()는 더 단순하게 쓸 수 있습니다.', '조건을 마지막 연산자에 넘기고, 항등 Select를 지우고, Count 속성을 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n); const t = callTarget(n);
    if (!t) return;
    const inner = unparen(t);
    const TERM = ['Any', 'Count', 'First', 'FirstOrDefault', 'Last', 'LastOrDefault', 'Single', 'SingleOrDefault', 'LongCount'];
    if (TERM.includes(name) && n.args.length === 0 && inner.k === 'Invocation' && callName(inner) === 'Where' && inner.args.length === 1 && inner.args[0].expr.k === 'Lambda' && inner.args[0].expr.params.length === 1) {
      cx.report(n, `Drop 'Where' and move the condition into the '${name}'.`, `'Where'를 지우고 조건을 '${name}'로 옮기세요.`);
      return;
    }
    if (name === 'Select' && n.args.length === 1) {
      const l = unparen(n.args[0].expr);
      if (l.k === 'Lambda' && l.params.length === 1 && unparen(l.body).k === 'Name' && unparen(l.body).name === l.params[0].name) { cx.report(n, `Remove this unnecessary 'Select' call.`, `불필요한 'Select' 호출을 지우세요.`); return; }
    }
    if (name === 'Count' && n.args.length === 0 && !unparen(n.expr).cond) {
      const tt = T.typeOf(t, cx.project);
      if (tt && (tt.ranks || T.CONCRETE_COLLECTIONS.has(tt.name))) cx.report(n, `Use the '${tt.ranks ? 'Length' : 'Count'}' property instead of the 'Count()' method.`, `'Count()' 메서드 대신 '${tt.ranks ? 'Length' : 'Count'}' 속성을 쓰세요.`);
    }
  } } });
R('string-concat-in-loop', 'S1643', 'S', 'MI', 10, ['performance'],
  ['Strings should not be concatenated using "+" in a loop', 'Each concatenation copies the whole string, which is quadratic in a loop.', 'Use a StringBuilder.'],
  ['반복 안에서 "+"로 문자열을 이어 붙이면 안 됩니다', '이어 붙일 때마다 문자열 전체를 복사해 반복 안에서는 제곱 시간이 걸립니다.', 'StringBuilder를 쓰세요.'],
  { kinds: { Assign(n, cx) {
    const l = unparen(n.left);
    if (l.k !== 'Name' || !l.sym || l.sym.kind !== 'local') return;
    const t = T.symType(l.sym, cx.project);
    if (!t || t.name !== 'string' || t.ranks) return;
    let isConcat = n.op === '+=';
    if (n.op === '=') { const r = unparen(n.right); isConcat = r.k === 'Binary' && r.op === '+' && unparen(r.left).k === 'Name' && unparen(r.left).name === l.name; }
    if (!isConcat) return;
    // declared outside the loop that contains the assignment
    const decl = l.sym.decl;
    let p = n.parent;
    while (p && !['For', 'Foreach', 'While', 'Do'].includes(p.k)) { if (p.k === 'Lambda' || p.k === 'LocalFunc' || p.k === 'Method') return; p = p.parent; }
    if (!p || (decl && decl.pos > p.pos && decl.pos < p.end)) return;
    cx.report(n, `Use a StringBuilder instead.`, '대신 StringBuilder를 쓰세요.');
  } } });
R('char-overload', 'S6610', 'S', 'MI', 2, ['performance'],
  ['"StartsWith" and "EndsWith" overloads that take a "char" should be used instead of the ones that take a "string"', 'The char overload is faster and culture-independent.', 'Pass a char literal: s.StartsWith(\'x\').'],
  ['"StartsWith"와 "EndsWith"는 "string" 대신 "char"를 받는 오버로드를 써야 합니다', 'char 오버로드가 더 빠르고 문화권과 무관합니다.', 'char 리터럴을 넘기세요: s.StartsWith(\'x\').'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if ((name !== 'StartsWith' && name !== 'EndsWith') || n.args.length !== 1 || !callTarget(n)) return;
    const v = U.strVal(n.args[0].expr);
    if (v == null || v.length !== 1) return;
    const t = T.typeOf(callTarget(n), cx.project);
    if (t && t.name !== 'string') return;
    cx.report(n.args[0], `"${name}" overloads that take a "char" should be used.`, `"char"를 받는 "${name}" 오버로드를 쓰세요.`);
  } } });
function listLike(e, cx) { const t = T.typeOf(e, cx.project); return t && (t.name === 'List' && !t.ranks); }
function arrayLike(e, cx) { const t = T.typeOf(e, cx.project); return t && t.ranks; }
R('list-find', 'S6602', 'S', 'MI', 2, ['performance'],
  ['"Find" method should be used instead of the "FirstOrDefault" extension', 'List<T>.Find is faster than the LINQ extension.', 'Call Find(predicate).'],
  ['"FirstOrDefault" 확장 대신 "Find" 메서드를 써야 합니다', 'List<T>.Find가 LINQ 확장보다 빠릅니다.', 'Find(predicate)를 호출하세요.'],
  { kinds: { Invocation(n, cx) { if (callName(n) === 'FirstOrDefault' && n.args.length === 1 && callTarget(n) && listLike(callTarget(n), cx)) cx.report(n, `"Find" method should be used instead of the "FirstOrDefault" extension method.`, `"FirstOrDefault" 확장 메서드 대신 "Find" 메서드를 쓰세요.`); } } });
R('list-trueforall', 'S6603', 'S', 'MI', 2, ['performance'],
  ['The collection-specific "TrueForAll" method should be used instead of the "All" extension', 'List<T>.TrueForAll is faster than Enumerable.All.', 'Call TrueForAll(predicate).'],
  ['"All" 확장 대신 컬렉션 전용 "TrueForAll"을 써야 합니다', 'List<T>.TrueForAll이 Enumerable.All보다 빠릅니다.', 'TrueForAll(predicate)를 호출하세요.'],
  { kinds: { Invocation(n, cx) { if (callName(n) === 'All' && n.args.length === 1 && callTarget(n) && listLike(callTarget(n), cx)) cx.report(n, `"TrueForAll" method should be used instead of the "All" extension method.`, `"All" 확장 메서드 대신 "TrueForAll" 메서드를 쓰세요.`); } } });
R('list-exists', 'S6605', 'S', 'MI', 2, ['performance'],
  ['Collection-specific "Exists" method should be used instead of the "Any" extension', 'List<T>.Exists is faster than Enumerable.Any(predicate).', 'Call Exists(predicate).'],
  ['"Any" 확장 대신 컬렉션 전용 "Exists"를 써야 합니다', 'List<T>.Exists가 Enumerable.Any(predicate)보다 빠릅니다.', 'Exists(predicate)를 호출하세요.'],
  { kinds: { Invocation(n, cx) { if (callName(n) === 'Any' && n.args.length === 1 && callTarget(n) && (listLike(callTarget(n), cx))) cx.report(n, `"Exists" method should be used instead of the "Any" extension method.`, `"Any" 확장 메서드 대신 "Exists" 메서드를 쓰세요.`); } } });
R('indexer-instead-of-first', 'S6608', 'S', 'MI', 2, ['performance'],
  ['Prefer indexing instead of "Enumerable" methods on types implementing "IList"', 'list[0] / list[^1] is O(1) without LINQ overhead.', 'Use the indexer.'],
  ['"IList"를 구현한 타입에서는 "Enumerable" 메서드 대신 인덱서를 써야 합니다', 'list[0] / list[^1]은 LINQ 부담 없이 O(1)입니다.', '인덱서를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if ((name !== 'First' && name !== 'Last' && name !== 'ElementAt') || (name === 'ElementAt' ? n.args.length !== 1 : n.args.length !== 0) || !callTarget(n)) return;
    if (listLike(callTarget(n), cx) || arrayLike(callTarget(n), cx)) cx.report(n, `Use the indexer instead of '${name}'.`, `'${name}' 대신 인덱서를 쓰세요.`);
  } } });
R('filter-before-sort', 'S6607', 'S', 'MI', 2, ['performance'],
  ['The collection should be filtered before sorting by using "Where" before "OrderBy"', 'Sorting first sorts elements that are thrown away afterwards.', 'Move Where before OrderBy.'],
  ['정렬하기 전에 "OrderBy" 앞에서 "Where"로 걸러야 합니다', '먼저 정렬하면 나중에 버릴 요소까지 정렬합니다.', 'Where를 OrderBy 앞으로 옮기세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'Where') return;
    const t = unparen(callTarget(n) || {});
    if (t && t.k === 'Invocation' && ['OrderBy', 'OrderByDescending', 'ThenBy', 'ThenByDescending'].includes(callName(t))) cx.report(n, `"Where" should be used before "${callName(t)}".`, `"Where"를 "${callName(t)}" 앞에 쓰세요.`);
  } } });
R('datetime-unix-epoch', 'S6588', 'S', 'MI', 2, ['clumsy'],
  ['Use the "UnixEpoch" field instead of creating "DateTime" instances that point to the beginning of the Unix epoch', 'DateTime.UnixEpoch states the intent and avoids Kind mistakes.', 'Use DateTime.UnixEpoch.'],
  ['유닉스 시작 시점을 가리키는 DateTime을 만들지 말고 "UnixEpoch" 필드를 써야 합니다', 'DateTime.UnixEpoch는 의도를 드러내고 Kind 실수를 막습니다.', 'DateTime.UnixEpoch를 쓰세요.'],
  { kinds: { New(n, cx) {
    if (!n.type || (n.type.name !== 'DateTime' && n.type.name !== 'DateTimeOffset') || n.args.length < 3) return;
    const v = n.args.slice(0, 6).map((a) => U.numVal(a.expr));
    if (v[0] === 1970 && v[1] === 1 && v[2] === 1 && v.slice(3).every((x) => x === 0 || x === null && false)) cx.report(n, `Use "${n.type.name}.UnixEpoch" instead of creating ${n.type.name} instances that point to the beginning of the Unix epoch.`, `유닉스 시작 시점을 가리키는 ${n.type.name}을 만들지 말고 "${n.type.name}.UnixEpoch"를 쓰세요.`);
  } } });
R('datetime-benchmark', 'S6561', 'S', 'MA', 5, ['performance'],
  ['Avoid using "DateTime.Now" for benchmarking or timing operations', 'DateTime.Now is low-resolution and changes with clock adjustments.', 'Use Stopwatch.'],
  ['벤치마크나 시간 측정에 "DateTime.Now"를 쓰지 마세요', 'DateTime.Now는 해상도가 낮고 시계 조정에 따라 바뀝니다.', 'Stopwatch를 쓰세요.'],
  { kinds: { Binary(n, cx) {
    if (n.op !== '-') return;
    const isNow = (x) => ['DateTime.Now', 'DateTime.UtcNow'].includes(dotted(x) || '');
    if (!isNow(n.left)) return;
    const r = unparen(n.right);
    if (r.k === 'Name' && r.sym && r.sym.init && isNow(r.sym.init)) cx.report(n, `Avoid using "DateTime.Now" for benchmarking or timing operations; use a Stopwatch.`, `시간 측정에 "DateTime.Now"를 쓰지 말고 Stopwatch를 쓰세요.`);
  } } });
R('datetime-parse-culture', 'S6580', 'S', 'MA', 5, ['pitfall'],
  ['Use a format provider when parsing date and time', 'Parsing dates with the current culture gives different results on different machines.', 'Pass CultureInfo.InvariantCulture (or a specific culture).'],
  ['날짜와 시간을 파싱할 때는 서식 공급자를 써야 합니다', '현재 문화권으로 날짜를 파싱하면 컴퓨터마다 결과가 달라집니다.', 'CultureInfo.InvariantCulture(또는 특정 문화권)를 넘기세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n); const td = dotted(callTarget(n) || {});
    if (!['DateTime', 'DateTimeOffset', 'TimeSpan', 'DateOnly', 'TimeOnly'].includes(td || '')) return;
    if ((name === 'Parse' && n.args.length === 1) || (name === 'TryParse' && n.args.length === 2) || (name === 'ParseExact' && n.args.length === 2)) cx.report(n, `Use a format provider when parsing date and time.`, `날짜와 시간을 파싱할 때는 서식 공급자를 쓰세요.`);
  } } });

// ───────────────────────────────────────── exceptions
const GENERIC_EX = new Set(['Exception', 'ApplicationException', 'SystemException', 'NullReferenceException', 'IndexOutOfRangeException', 'OutOfMemoryException', 'ExecutionEngineException']);
R('throw-generic-exception', 'S112', 'S', 'MA', 20, ['cwe-397', 'error-handling'],
  ['General or reserved exceptions should never be thrown', 'Throwing Exception (or runtime-reserved types) forces callers to catch everything.', 'Throw a specific exception type, or define your own.'],
  ['일반 예외나 예약된 예외를 던지면 안 됩니다', 'Exception(또는 런타임 예약 타입)을 던지면 호출자가 모든 예외를 잡아야 합니다.', '구체적인 예외 타입을 던지거나 직접 정의하세요.'],
  { kinds: { New(n, cx) {
    if (!n.type || !GENERIC_EX.has(n.type.name) || n.type.parts.length > 2) return;
    if (!(n.parent && (n.parent.k === 'Throw' || n.parent.k === 'ThrowExpr'))) return;
    cx.report(n, `'${n.type.name}' should not be thrown by user code.`, `사용자 코드에서 '${n.type.name}'을 던지면 안 됩니다.`);
  } } });
R('catch-null-reference', 'S1696', 'S', 'MA', 10, ['cwe-395', 'error-handling'],
  ['NullReferenceException should not be caught', 'Catching it hides the bug that produced the null.', 'Check for null instead.'],
  ['NullReferenceException을 잡으면 안 됩니다', '이 예외를 잡으면 null을 만든 버그가 숨겨집니다.', '대신 null을 검사하세요.'],
  { kinds: { Catch(n, cx) { if (n.type && n.type.name === 'NullReferenceException') cx.report(n.type, `Do not catch NullReferenceException; test for null instead.`, `NullReferenceException을 잡지 말고 null을 검사하세요.`); } } });
R('rethrow-caught-exception', 'S3445', 'S', 'MA', 5, ['error-handling'],
  ['Exceptions should not be explicitly rethrown', '`throw ex;` resets the stack trace and loses where the error came from.', 'Use `throw;` to rethrow.'],
  ['예외를 명시적으로 다시 던지면 안 됩니다', '`throw ex;`는 스택 추적을 초기화해 오류가 어디서 났는지 잃어버립니다.', '다시 던질 때는 `throw;`를 쓰세요.'],
  { kinds: { Throw(n, cx) {
    const e = unparen(n.expr);
    if (!e || e.k !== 'Name' || !e.sym || e.sym.kind !== 'catch') return;
    if (e.sym.writes.length > 0) return;
    cx.report(n, `Consider using 'throw;' to preserve the stack trace.`, `스택 추적을 보존하려면 'throw;'를 쓰세요.`);
  } } });
R('useless-catch-rethrow', 'S2737', 'S', 'MI', 5, ['clumsy', 'error-handling'],
  ['"catch" clauses should do more than rethrow', 'A catch that only rethrows does nothing but add noise.', 'Remove the try/catch, or handle the exception.'],
  ['catch 절은 다시 던지는 것 이상을 해야 합니다', '다시 던지기만 하는 catch는 잡음만 더합니다.', 'try/catch를 지우거나 예외를 처리하세요.'],
  { kinds: { Try(n, cx) {
    const last = n.catches[n.catches.length - 1];
    if (!last) return;
    const only = (c) => c.block.stmts.length === 1 && c.block.stmts[0].k === 'Throw' && !c.block.stmts[0].expr && !c.when;
    if (n.catches.every(only) && !n.fin) cx.report(last, 'Add logic to this catch clause or eliminate it and rethrow the exception automatically.', '이 catch 절에 처리 로직을 넣거나 절을 지우고 예외가 자동으로 전파되게 하세요.');
  } } });
R('throw-in-finally', 'S1163', 'S', 'CR', 30, ['error-handling'],
  ['Exceptions should not be thrown in finally blocks', 'An exception thrown in finally replaces the one already propagating, which is lost.', 'Handle the error inside finally without throwing.'],
  ['finally 블록에서 예외를 던지면 안 됩니다', 'finally에서 던진 예외가 이미 전파 중인 예외를 대체해 원래 예외를 잃습니다.', 'finally 안에서 던지지 말고 오류를 처리하세요.'],
  { kinds: { Throw(n, cx) {
    let p = n.parent;
    while (p) {
      if (p.k === 'Lambda' || p.k === 'LocalFunc' || p.k === 'Method' || p.k === 'Catch') return;
      if (p.k === 'Try') {
        if (p.fin && n.pos >= p.fin.pos && n.end <= p.fin.end) {
          // a throw inside a nested try/catch within finally is fine when caught
          const inner = enclosing(n, ['Try']);
          if (inner && inner !== p && inner.catches.length) return;
          cx.report(n, 'Refactor this code to not throw exceptions in finally blocks.', 'finally 블록에서 예외를 던지지 않도록 코드를 고치세요.');
        }
        return;
      }
      p = p.parent;
    }
  } } });
R('exception-unexpected-location', 'S3877', 'S', 'BL', 5, ['error-handling'],
  ['Exceptions should not be thrown from unexpected methods', 'ToString, Equals, GetHashCode, Dispose, finalizers, static constructors, == operators and implicit conversions are not expected to throw.', 'Return a safe value instead of throwing.'],
  ['예상하지 못한 메서드에서 예외를 던지면 안 됩니다', 'ToString, Equals, GetHashCode, Dispose, 종료자, 정적 생성자, == 연산자, 암시적 변환은 예외를 던질 것으로 예상하지 않습니다.', '예외 대신 안전한 값을 반환하세요.'],
  { kinds: { Throw: unexpectedThrow, ThrowExpr: unexpectedThrow } });
function unexpectedThrow(n, cx) {
  const m = enclosing(n, ['Method', 'Ctor', 'Destructor', 'Operator', 'Conversion', 'Lambda', 'LocalFunc', 'Accessor']);
  if (!m || m.k === 'Lambda' || m.k === 'LocalFunc') return;
  if (enclosing(n, ['Catch']) && !n.expr) return;
  const ex = n.expr && unparen(n.expr);
  if (ex && ex.k === 'New' && ex.type && ['NotImplementedException', 'NotSupportedException', 'InvalidOperationException', 'ObjectDisposedException'].includes(ex.type.name) && !(m.k === 'Destructor' || (m.k === 'Method' && ['GetHashCode', 'ToString', 'Equals'].includes(m.name)))) {
    if (!(m.k === 'Method' && m.name === 'ToString')) return;
  }
  let where = null;
  if (m.k === 'Method' && ['ToString', 'GetHashCode'].includes(m.name) && !m.params.length && hasMod(m, 'override')) where = m.name;
  else if (m.k === 'Method' && m.name === 'Equals' && m.params.length === 1) where = 'Equals';
  else if (m.k === 'Method' && m.name === 'Dispose' && m.params.length === 0) where = 'Dispose';
  else if (m.k === 'Destructor') where = 'a finalizer';
  else if (m.k === 'Ctor' && hasMod(m, 'static')) where = 'a static constructor';
  else if (m.k === 'Operator' && (m.op === '==' || m.op === '!=')) where = `operator ${m.op}`;
  else if (m.k === 'Conversion' && m.kind === 'implicit') where = 'an implicit conversion';
  if (where && enclosing(n, ['Try']) && enclosing(n, ['Try']).catches.length && n.pos < enclosing(n, ['Try']).block.end) return;
  if (where) cx.report(n, `Remove this 'throw' ${n.k === 'ThrowExpr' ? 'expression' : 'statement'}; ${where} should not throw.`, `이 'throw'를 지우세요. ${where}은(는) 예외를 던지면 안 됩니다.`);
}
R('exception-standard-constructors', 'S4027', 'S', 'MI', 15, ['convention', 'error-handling'],
  ['Exceptions should provide standard constructors', 'Custom exceptions are expected to offer (), (string message) and (string message, Exception inner) constructors.', 'Add the missing constructors.'],
  ['예외는 표준 생성자를 제공해야 합니다', '사용자 정의 예외는 (), (string message), (string message, Exception inner) 생성자를 제공해야 합니다.', '빠진 생성자를 넣으세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || !/Exception$/.test(n.name) || !n.typeInfo || !n.typeInfo.inheritsFrom('Exception') || n.mods.has('abstract')) return;
    if (!n.mods.has('public') || n.typeInfo.decls.length > 1) return;
    const ctors = n.members.filter((m) => m.k === 'Ctor' && !hasMod(m, 'static'));
    const has = (sig) => ctors.some((c) => c.params.length === sig.length && c.params.every((p, i) => p.type && T.normName(p.type.name) === sig[i]));
    const missing = [];
    if (!has([])) missing.push('()');
    if (!has(['string'])) missing.push('(string)');
    if (!has(['string', 'Exception'])) missing.push('(string, Exception)');
    if (missing.length) cx.report(n, `Implement the missing constructors for this exception: ${missing.join(', ')}.`, `이 예외에 빠진 생성자를 구현하세요: ${missing.join(', ')}.`, { atName: true });
  } } });
R('exception-not-public', 'S3871', 'S', 'CR', 5, ['error-handling'],
  ['Exception types should be "public"', 'Callers outside the assembly cannot catch a non-public exception type specifically.', 'Make the exception public.'],
  ['예외 타입은 public이어야 합니다', '어셈블리 밖의 호출자는 public이 아닌 예외 타입을 구체적으로 잡을 수 없습니다.', '예외를 public으로 만드세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || !/Exception$/.test(n.name) || !n.typeInfo || !n.typeInfo.inheritsFrom('Exception')) return;
    if (n.mods.has('public') || n.outer || n.typeInfo.decls.some((d) => d.mods.has('public'))) return;
    cx.report(n, `Make this exception 'public'.`, `이 예외를 'public'으로 만드세요.`, { atName: true });
  } } });
R('exception-naming', 'S2166', 'S', 'MA', 30, ['convention'],
  ['Classes named like "Exception" should extend "Exception" or a subclass', 'A class whose name ends in Exception but is not an exception misleads readers.', 'Rename the class, or derive it from Exception.'],
  ['이름이 "Exception"으로 끝나는 클래스는 Exception을 상속해야 합니다', '이름은 Exception으로 끝나는데 예외가 아닌 클래스는 읽는 사람을 오해하게 합니다.', '클래스 이름을 바꾸거나 Exception을 상속하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || !/Exception$/.test(n.name) || !n.typeInfo) return;
    if (n.typeInfo.decls[0] !== n || n.typeInfo.inheritsFrom('Exception')) return;
    if (n.typeInfo.externalBases.length || n.typeInfo.baseInfo) return; // external base may be an exception
    cx.report(n, `Rename this class to remove the "Exception" suffix or make it extend "Exception".`, `이 클래스의 "Exception" 접미사를 지우거나 "Exception"을 상속하세요.`, { atName: true });
  } } });
const ARG_EX = { ArgumentNullException: 0, ArgumentOutOfRangeException: 0, ArgumentException: 1 };
R('argument-exception-param-name', 'S3928', 'S', 'MA', 10, ['error-handling'],
  ['Parameter names used into ArgumentException constructors should match an existing one', 'A paramName that is not a parameter of the method points to the wrong argument.', 'Pass nameof(theParameter).'],
  ['ArgumentException 생성자에 쓰는 매개변수 이름은 실제 매개변수와 맞아야 합니다', '메서드의 매개변수가 아닌 paramName은 잘못된 인수를 가리킵니다.', 'nameof(theParameter)를 넘기세요.'],
  { kinds: { New(n, cx) {
    const k = n.type && ARG_EX[n.type.name];
    if (k === undefined || n.args.length <= k) return;
    const a = n.args.find((x) => x.name === 'paramName') || n.args[k];
    const v = U.strVal(a.expr);
    if (v == null || !/^\w+$/.test(v)) return;
    const params = paramNamesAt(n);
    if (!params || params.has(v)) return;
    if (n.type.name === 'ArgumentException' && n.args.length === 1) return;
    cx.report(a, `The parameter name '${v}' is not declared in the argument list.`, `매개변수 이름 '${v}'가 인수 목록에 선언되어 있지 않습니다.`);
  } } });
function paramNamesAt(n) {
  const m = enclosing(n, ['Method', 'Ctor', 'Accessor', 'LocalFunc', 'Lambda', 'Operator', 'Indexer', 'Property']);
  if (!m) return null;
  const out = new Set();
  for (let p = n.parent; p; p = p.parent) {
    if (p.params) for (const x of p.params) out.add(x.name);
    if (p.k === 'Accessor') { out.add('value'); if (p.member && p.member.params) for (const x of p.member.params) out.add(x.name); }
    if (p.k === 'Method' || p.k === 'Ctor' || p.k === 'Operator') break;
  }
  if (m.k === 'Property' || m.k === 'Accessor') out.add('value');
  return out;
}
R('use-nameof', 'S2302', 'S', 'MA', 5, ['convention'],
  ['"nameof" should be used', 'A parameter name written as a string literal is not updated by renames.', 'Use nameof(parameter).'],
  ['"nameof"를 써야 합니다', '문자열 리터럴로 쓴 매개변수 이름은 이름을 바꿀 때 함께 바뀌지 않습니다.', 'nameof(parameter)를 쓰세요.'],
  { kinds: { New(n, cx) {
    const k = n.type && ARG_EX[n.type.name];
    if (k === undefined || n.args.length <= k) return;
    if (n.type.name === 'ArgumentException' && n.args.length === 1) return;
    const a = n.args.find((x) => x.name === 'paramName') || n.args[k];
    const v = U.strVal(a.expr);
    if (v == null || !/^\w+$/.test(v)) return;
    const params = paramNamesAt(n);
    if (params && params.has(v)) cx.report(a, `Replace the string '${v}' with 'nameof(${v})'.`, `문자열 '${v}'를 'nameof(${v})'로 바꾸세요.`);
  } } });

module.exports = { cognitive, cyclomatic, usedNames, isUnity };
