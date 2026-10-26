'use strict';

// Test code rules (MSTest, NUnit, xUnit, FluentAssertions, NSubstitute / Moq):
// missing or ineffective assertions, test discovery pitfalls, flaky tests.

const { R } = require('../registry');
const { same, unparen, dotted, callName, callTarget, forEachChild, hasMod, attrNamed, enclosing } = require('../ast');
const U = require('../util');
const T = require('../types');

const MSTEST_ATTRS = ['TestMethod', 'DataTestMethod'];
const NUNIT_ATTRS = ['Test', 'TestCase', 'TestCaseSource'];
const XUNIT_ATTRS = ['Fact', 'Theory'];
const ALL_TEST_ATTRS = [...MSTEST_ATTRS, ...NUNIT_ATTRS, ...XUNIT_ATTRS];
const DATA_ATTRS = ['DataRow', 'DynamicData', 'TestCase', 'TestCaseSource', 'InlineData', 'MemberData', 'ClassData', 'Values', 'ValueSource', 'Range', 'Random', 'Combinatorial'];
const ASSERT_CLASSES = new Set(['Assert', 'ClassicAssert', 'CollectionAssert', 'StringAssert', 'FileAssert', 'DirectoryAssert', 'Assume', 'Warn']);
const ASSERT_CALLS = new Set(['Should', 'Verify', 'VerifyAll', 'VerifyNoOtherCalls', 'VerifySet', 'VerifyGet', 'Received', 'DidNotReceive', 'ReceivedWithAnyArgs',
  'DidNotReceiveWithAnyArgs', 'Expect', 'Throws', 'ThrowsAsync', 'ThrowsException', 'ThrowsExceptionAsync', 'Fail', 'ShouldBe', 'ShouldNotBe', 'ShouldThrow',
  'ShouldBeTrue', 'ShouldBeFalse', 'ShouldBeNull', 'ShouldNotBeNull', 'ShouldContain', 'Snapshot', 'MatchSnapshot']);

function framework(m) {
  if (!m || !m.attrs) return null;
  if (attrNamed(m.attrs, MSTEST_ATTRS)) return 'mstest';
  if (attrNamed(m.attrs, NUNIT_ATTRS)) return 'nunit';
  if (attrNamed(m.attrs, XUNIT_ATTRS)) return 'xunit';
  return null;
}
function isTest(m) { return !!m && m.k === 'Method' && !!framework(m); }
function testMethodOf(node) {
  const m = enclosing(node, ['Method']);
  return isTest(m) ? m : null;
}
function assertClass(inv) {
  const t = callTarget(inv);
  const d = t ? dotted(t) : null;
  if (!d) return null;
  const last = d.split('.').pop();
  return ASSERT_CLASSES.has(last) ? last : null;
}
// Assert.<name>(...) with a known assertion class
function assertNamed(inv, names) {
  if (!assertClass(inv)) return null;
  const n = callName(inv);
  return names.includes(n) ? n : null;
}
function argsOf(inv) { return (inv.args || []).filter((a) => !a.name).map((a) => a.expr); }
function isConstExpr(e) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Literal') return true;
  if (e.k === 'Unary' && e.op === '-' && isConstExpr(e.operand)) return true;
  if (e.k === 'Name' && e.msym && e.msym.every((m) => m.kind === 'const')) return true;
  if (e.k === 'Name' && e.sym && e.sym.isConst) return true;
  if (e.k === 'Member' && e.msym && e.msym.every((m) => m.kind === 'const' || m.kind === 'enum')) return true;
  return false;
}
function isBoolLit(e) { e = unparen(e); return !!e && e.k === 'Literal' && e.kind === 'bool'; }
function isValueTyped(e, project) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Literal') return ['int', 'real', 'bool', 'char'].includes(e.kind);
  const t = T.typeOf(e, project);
  return !!t && !t.nullable && !t.ranks && t.name !== '?' && T.isValueTypeName(t.name, project);
}
function isFloatTyped(e, project) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Literal' && e.kind === 'real') return e.suffix !== 'm';
  const t = T.typeOf(e, project);
  return !!t && !t.ranks && (t.name === 'double' || t.name === 'float');
}
function retName(m) { return m.retType ? m.retType.name : ''; }
function typeHasAttr(td, names) {
  const info = td.typeInfo;
  const decls = info ? info.decls : [td];
  return decls.some((d) => attrNamed(d.attrs, names));
}
function typeTestMethods(td) {
  const info = td.typeInfo;
  const decls = info ? info.decls : [td];
  const out = [];
  for (const d of decls) for (const m of d.members || []) if (isTest(m)) out.push(m);
  return out;
}
function isTestClass(td) {
  return td && td.k === 'TypeDecl' && (typeHasAttr(td, U.TEST_CLASS_ATTRS) || typeTestMethods(td).length > 0);
}
function argText(cx, a) { return cx.src.slice(a.pos, a.end).replace(/\s+/g, ''); }

// project-level helper methods that assert (transitively, by name)
function assertingHelpers(project) {
  if (project._csAssertHelpers) return project._csAssertHelpers;
  const methods = [];
  for (const info of project.allTypeInfos) {
    for (const [name, entries] of info.members) for (const e of entries) if (e.kind === 'method' && (e.node.body || e.node.exprBody)) methods.push({ name, node: e.node });
  }
  const set = new Set();
  let changed = true;
  for (let round = 0; changed && round < 5; round++) {
    changed = false;
    for (const m of methods) {
      if (set.has(m.name)) continue;
      if (hasAssertion(m.node.body || m.node.exprBody, set)) { set.add(m.name); changed = true; }
    }
  }
  project._csAssertHelpers = set;
  return set;
}
function hasAssertion(body, helpers) {
  let found = false;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (n.k === 'Invocation') {
      const name = callName(n);
      if (assertClass(n) || ASSERT_CALLS.has(name) || (name && /^(Assert|Verify|Expect|Check|Ensure|Should|Must)/.test(name)) || (helpers && name && helpers.has(name))) { found = true; return; }
    }
    if (n.k === 'Throw' || n.k === 'ThrowExpr') { found = true; return; }
    forEachChild(n, visit);
  };
  visit(body);
  return found;
}

// ───────────────────────────────────────── missing / ineffective assertions
R('test-no-assertion', 'S2699', 'S', 'BL', 10, ['tests'],
  ['Tests should include assertions', 'A test without any assertion only fails on an unexpected exception, so it passes no matter what the code returns.', 'Add at least one assertion (Assert, Should(), Verify ...) that checks the outcome.'],
  ['테스트에는 단언이 있어야 합니다', '단언이 없는 테스트는 예상치 못한 예외에서만 실패하므로 코드가 무엇을 반환하든 통과합니다.', '결과를 검사하는 단언(Assert, Should(), Verify 등)을 하나 이상 넣으세요.'],
  { kinds: { Method(n, cx) {
    if (!isTest(n)) return;
    const body = n.body || n.exprBody;
    if (!body) return;
    if (body.k === 'Block' && !body.stmts.length) return;
    if (attrNamed(n.attrs, ['ExpectedException', 'ExpectedExceptionBase'])) return;
    if (n.attrs.some((a) => a.args.some((x) => x.name === 'ExpectedResult'))) return;
    if (hasAssertion(body, assertingHelpers(cx.project))) return;
    cx.report(n, `Add at least one assertion to the test '${n.name}'.`, `테스트 '${n.name}'에 단언을 하나 이상 넣으세요.`, { atName: true });
  } } });

R('test-assert-argument-order', 'S3415', 'S', 'MA', 2, ['tests'],
  ['Assertion arguments should be passed in the correct order', 'The expected value comes first; with the arguments swapped the failure message reports the expected and actual values the wrong way round.', 'Pass the expected (constant) value first and the actual value second.'],
  ['단언 인수는 올바른 순서로 넘겨야 합니다', '기대값이 먼저 와야 합니다. 순서가 바뀌면 실패 메시지가 기대값과 실제값을 거꾸로 보여 줍니다.', '기대값(상수)을 먼저, 실제값을 두 번째로 넘기세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['AreEqual', 'AreNotEqual', 'AreSame', 'AreNotSame', 'Equal', 'NotEqual', 'Same', 'NotSame', 'That']);
    if (!name) return;
    const a = argsOf(n);
    if (a.length < 2) return;
    if (name === 'That') {
      // NUnit: Assert.That(actual, Is.EqualTo(expected))
      const c = unparen(a[1]);
      if (!c || c.k !== 'Invocation' || callName(c) !== 'EqualTo' || !c.args.length) return;
      if (isConstExpr(a[0]) && !isConstExpr(c.args[0].expr)) cx.report(n, 'Swap these arguments: Assert.That takes the actual value first.', '인수 순서를 바꾸세요. Assert.That은 실제값을 먼저 받습니다.');
      return;
    }
    if (isBoolLit(a[1])) return;
    if (!isConstExpr(a[0]) && isConstExpr(a[1])) {
      cx.report(n, `Swap the arguments of Assert.${name}: the expected value goes first.`, `Assert.${name}의 인수 순서를 바꾸세요. 기대값이 먼저 와야 합니다.`);
    }
  } } });

R('test-boolean-literal-assertion', 'S2701', 'S', 'CR', 2, ['tests'],
  ['Literal boolean values should not be used in equality assertions', 'Assert.AreEqual(true, x) hides intent and gives a poorer failure message than the dedicated boolean assertion.', 'Use Assert.IsTrue / Assert.IsFalse (Assert.True / Assert.False in xUnit).'],
  ['동등 단언에 불리언 리터럴을 쓰면 안 됩니다', 'Assert.AreEqual(true, x)는 의도를 흐리고 전용 불리언 단언보다 실패 메시지가 부실합니다.', 'Assert.IsTrue / Assert.IsFalse(xUnit은 Assert.True / Assert.False)를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['AreEqual', 'AreNotEqual', 'Equal', 'NotEqual']);
    if (!name) return;
    const a = argsOf(n);
    if (a.length !== 2 || !a.some(isBoolLit)) return;
    cx.report(n, `Replace Assert.${name} with a literal boolean by Assert.IsTrue or Assert.IsFalse.`, `불리언 리터럴을 쓴 Assert.${name}를 Assert.IsTrue나 Assert.IsFalse로 바꾸세요.`);
  } } });

R('test-incomplete-assertion', 'S2970', 'B', 'BL', 5, ['tests'],
  ['Assertions should be complete', 'Calling Should() or Received() without the following check creates an assertion object and verifies nothing.', 'Finish the assertion, for example x.Should().Be(expected) or sub.Received().Call().'],
  ['단언은 완성해야 합니다', 'Should()나 Received()만 호출하고 뒤의 검사를 빠뜨리면 단언 객체만 만들고 아무것도 확인하지 않습니다.', 'x.Should().Be(expected)나 sub.Received().Call()처럼 단언을 끝까지 쓰세요.'],
  { kinds: { ExprStmt(n, cx) {
    const e = unparen(n.expr);
    if (!e || e.k !== 'Invocation') return;
    const name = callName(e);
    if (!['Should', 'Received', 'DidNotReceive', 'ReceivedWithAnyArgs', 'DidNotReceiveWithAnyArgs'].includes(name)) return;
    if (name === 'Should' && e.args.length) return;
    if (!callTarget(e)) return;
    cx.report(e, `Complete the assertion started by '${name}()'.`, `'${name}()'로 시작한 단언을 끝까지 쓰세요.`);
  } } });

R('test-assert-literal-condition', '', 'S', 'MA', 2, ['tests'],
  ['Boolean assertions should not check a literal', 'Assert.IsTrue(true) can never fail and Assert.IsTrue(false) always fails; neither tests the code.', 'Assert a real condition, or call Assert.Fail with a reason.'],
  ['불리언 단언으로 리터럴을 검사하면 안 됩니다', 'Assert.IsTrue(true)는 절대 실패하지 않고 Assert.IsTrue(false)는 항상 실패해서 어느 쪽도 코드를 검사하지 않습니다.', '실제 조건을 단언하거나 이유와 함께 Assert.Fail을 호출하세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['IsTrue', 'IsFalse', 'True', 'False']);
    if (!name) return;
    const a = argsOf(n);
    if (!a.length || !isBoolLit(a[0])) return;
    const passes = (unparen(a[0]).value === true) === (name === 'IsTrue' || name === 'True');
    if (passes) cx.report(n, `Assert.${name}(${unparen(a[0]).raw}) can never fail; assert a real condition.`, `Assert.${name}(${unparen(a[0]).raw})는 절대 실패하지 않습니다. 실제 조건을 단언하세요.`);
    else cx.report(n, `Assert.${name}(${unparen(a[0]).raw}) always fails; use Assert.Fail with a reason.`, `Assert.${name}(${unparen(a[0]).raw})는 항상 실패합니다. 이유와 함께 Assert.Fail을 쓰세요.`);
  } } });

R('test-assert-same-operands', '', 'B', 'MA', 2, ['tests'],
  ['Assertions should not compare a value with itself', 'Comparing an expression with itself always passes (or always fails for AreNotEqual), so nothing is tested.', 'Compare the actual value with an independent expected value.'],
  ['단언에서 값을 자기 자신과 비교하면 안 됩니다', '식을 자기 자신과 비교하면 항상 통과하거나(AreNotEqual은 항상 실패) 아무것도 검사하지 않습니다.', '실제값을 독립적인 기대값과 비교하세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['AreEqual', 'AreNotEqual', 'AreSame', 'AreNotSame', 'Equal', 'NotEqual', 'Same', 'NotSame']);
    if (!name) return;
    const a = argsOf(n);
    if (a.length < 2 || !same(unparen(a[0]), unparen(a[1]))) return;
    cx.report(n, `Assert.${name} compares '${cx.text(a[0])}' with itself.`, `Assert.${name}가 '${cx.text(a[0])}'를 자기 자신과 비교합니다.`);
  } } });

R('test-assert-equals-object', '', 'B', 'CR', 2, ['tests'],
  ['Assert.Equals should not be used', 'Assert.Equals is object.Equals inherited by the assertion class; MSTest, NUnit and xUnit make it throw or it asserts nothing.', 'Use Assert.AreEqual (MSTest / NUnit) or Assert.Equal (xUnit).'],
  ['Assert.Equals를 쓰면 안 됩니다', 'Assert.Equals는 단언 클래스가 물려받은 object.Equals라서 MSTest, NUnit, xUnit에서 예외를 던지거나 아무것도 단언하지 않습니다.', 'Assert.AreEqual(MSTest / NUnit)이나 Assert.Equal(xUnit)을 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    if (!assertNamed(n, ['Equals', 'ReferenceEquals']) || argsOf(n).length !== 2) return;
    cx.report(n, `Replace Assert.${callName(n)} by a real equality assertion.`, `Assert.${callName(n)}를 실제 동등 단언으로 바꾸세요.`);
  } } });

R('test-assert-equality-condition', '', 'S', 'MI', 2, ['tests'],
  ['Equality should be asserted with an equality assertion', 'Assert.IsTrue(a == b) only reports "expected true"; Assert.AreEqual reports both values when it fails.', 'Use Assert.AreEqual / Assert.AreNotEqual (Assert.Equal / Assert.NotEqual in xUnit).'],
  ['동등성은 동등 단언으로 검사해야 합니다', 'Assert.IsTrue(a == b)는 "true를 기대함"만 알려 주지만 Assert.AreEqual은 실패할 때 두 값을 모두 보여 줍니다.', 'Assert.AreEqual / Assert.AreNotEqual(xUnit은 Assert.Equal / Assert.NotEqual)을 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['IsTrue', 'IsFalse', 'True', 'False']);
    if (!name) return;
    const a = argsOf(n);
    const c = unparen(a[0]);
    if (!c || c.k !== 'Binary' || (c.op !== '==' && c.op !== '!=')) return;
    if (U.unparen(c.left).k === 'Literal' && U.unparen(c.left).kind === 'null') return;
    if (U.unparen(c.right).k === 'Literal' && U.unparen(c.right).kind === 'null') return;
    const eq = (c.op === '==') === (name === 'IsTrue' || name === 'True');
    const xunit = name === 'True' || name === 'False';
    const repl = eq ? (xunit ? 'Assert.Equal' : 'Assert.AreEqual') : (xunit ? 'Assert.NotEqual' : 'Assert.AreNotEqual');
    cx.report(n, `Use ${repl} instead of Assert.${name} with '${c.op}'.`, `'${c.op}'를 쓴 Assert.${name} 대신 ${repl}를 쓰세요.`);
  } } });

R('test-float-equality-without-delta', '', 'B', 'MA', 5, ['tests'],
  ['Floating point values should be compared with a tolerance', 'Rounding makes exact equality of double / float results fragile; the test fails on harmless last-digit differences.', 'Pass a delta (precision) argument to the equality assertion.'],
  ['부동소수점 값은 허용 오차로 비교해야 합니다', '반올림 때문에 double / float 결과의 정확한 동등 비교는 불안정해 마지막 자리의 사소한 차이로도 테스트가 실패합니다.', '동등 단언에 허용 오차(delta, precision) 인수를 넘기세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['AreEqual', 'AreNotEqual', 'Equal', 'NotEqual']);
    if (!name || n.args.length !== 2) return;
    const a = argsOf(n);
    if (a.length !== 2 || !a.some((x) => isFloatTyped(x, cx.project))) return;
    cx.report(n, `Add a tolerance to Assert.${name} on floating point values.`, `부동소수점 값을 비교하는 Assert.${name}에 허용 오차를 넣으세요.`);
  } } });

R('test-same-on-value-type', '', 'B', 'MA', 2, ['tests'],
  ['Reference assertions should not be used on value types', 'Assert.AreSame boxes each value type argument separately, so the two references are never the same.', 'Use Assert.AreEqual for value types.'],
  ['값 형식에 참조 단언을 쓰면 안 됩니다', 'Assert.AreSame은 값 형식 인수를 따로 박싱하므로 두 참조가 결코 같지 않습니다.', '값 형식에는 Assert.AreEqual을 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['AreSame', 'AreNotSame', 'Same', 'NotSame']);
    if (!name) return;
    const a = argsOf(n);
    if (a.length < 2 || !a.slice(0, 2).some((x) => isValueTyped(x, cx.project))) return;
    cx.report(n, `Assert.${name} on a value type compares two boxed copies; use an equality assertion.`, `값 형식에 쓴 Assert.${name}는 박싱된 두 복사본을 비교합니다. 동등 단언을 쓰세요.`);
  } } });

R('test-null-check-on-value-type', '', 'B', 'MA', 2, ['tests'],
  ['Null assertions should not be used on value types', 'A non-nullable value type is never null, so Assert.IsNotNull always passes and Assert.IsNull always fails.', 'Assert the value itself, or remove the null assertion.'],
  ['값 형식에 null 단언을 쓰면 안 됩니다', 'nullable이 아닌 값 형식은 null이 될 수 없어 Assert.IsNotNull은 항상 통과하고 Assert.IsNull은 항상 실패합니다.', '값 자체를 단언하거나 null 단언을 지우세요.'],
  { kinds: { Invocation(n, cx) {
    const name = assertNamed(n, ['IsNull', 'IsNotNull', 'Null', 'NotNull']);
    if (!name) return;
    const a = argsOf(n);
    if (!a.length || !isValueTyped(a[0], cx.project)) return;
    cx.report(n, `'${cx.text(a[0])}' is a value type and is never null.`, `'${cx.text(a[0])}'는 값 형식이라 null이 될 수 없습니다.`);
  } } });

R('test-assert-count-empty-single', '', 'S', 'MI', 2, ['tests'],
  ['Collection size assertions should use Assert.Empty or Assert.Single', 'xUnit\'s Assert.Empty / Assert.Single print the collection when they fail, unlike Assert.Equal on a count.', 'Use Assert.Empty(collection) or Assert.Single(collection).'],
  ['컬렉션 크기 단언에는 Assert.Empty나 Assert.Single을 써야 합니다', 'xUnit의 Assert.Empty / Assert.Single은 실패할 때 컬렉션 내용을 보여 주지만 개수에 대한 Assert.Equal은 그렇지 않습니다.', 'Assert.Empty(collection)나 Assert.Single(collection)을 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    if (!assertNamed(n, ['Equal'])) return;
    const m = testMethodOf(n);
    if (!m || framework(m) !== 'xunit') return;
    const a = argsOf(n);
    if (a.length !== 2) return;
    const lit = unparen(a[0]);
    if (!lit || lit.k !== 'Literal' || lit.kind !== 'int' || (lit.value !== 0 && lit.value !== 1)) return;
    const c = unparen(a[1]);
    const isCount = (c.k === 'Member' && (c.name === 'Count' || c.name === 'Length')) || (c.k === 'Invocation' && callName(c) === 'Count' && !c.args.length && callTarget(c));
    if (!isCount) return;
    const repl = lit.value === 0 ? 'Assert.Empty' : 'Assert.Single';
    cx.report(n, `Use ${repl} instead of comparing the count with ${lit.value}.`, `개수를 ${lit.value}과 비교하는 대신 ${repl}을 쓰세요.`);
  } } });

R('test-try-catch-without-fail', '', 'B', 'MA', 5, ['tests'],
  ['Exception tests should fail when no exception is thrown', 'When the assertions live only in the catch block, the test silently passes if the code under test does not throw.', 'Use Assert.Throws / Assert.ThrowsException, or call Assert.Fail at the end of the try block.'],
  ['예외 테스트는 예외가 나지 않으면 실패해야 합니다', '단언이 catch 블록에만 있으면 테스트 대상 코드가 예외를 던지지 않을 때 조용히 통과합니다.', 'Assert.Throws / Assert.ThrowsException을 쓰거나 try 블록 끝에서 Assert.Fail을 호출하세요.'],
  { kinds: { Try(n, cx) {
    const m = testMethodOf(n);
    if (!m || !n.catches.length) return;
    if (!n.catches.some((c) => hasAssertion(c.block))) return;
    if (hasAssertion(n.block)) return;
    const stmts = n.block.stmts || [];
    if (stmts.some((s) => s.k === 'Return')) return;
    if (attrNamed(m.attrs, ['ExpectedException'])) return;
    cx.report(n, `Add Assert.Fail at the end of this try block, or use Assert.Throws in '${m.name}'.`, `'${m.name}'의 이 try 블록 끝에 Assert.Fail을 넣거나 Assert.Throws를 쓰세요.`);
  } } });

R('test-expected-exception', 'S3431', 'S', 'MA', 5, ['tests'],
  ['[ExpectedException] should not be used', 'The attribute passes when any line of the test throws, not only the call under test, and cannot check the exception\'s details.', 'Use Assert.ThrowsException / Assert.Throws around the call that must throw.'],
  ['[ExpectedException]을 쓰면 안 됩니다', '이 특성은 테스트 대상 호출뿐 아니라 테스트의 어느 줄에서 예외가 나도 통과하고 예외 내용을 검사할 수 없습니다.', '예외를 던져야 하는 호출을 Assert.ThrowsException / Assert.Throws로 감싸세요.'],
  { kinds: { Attribute(n, cx) {
    if (n.name !== 'ExpectedException') return;
    const m = n.parent;
    if (!m || m.k !== 'Method') return;
    cx.report(n, `Replace [ExpectedException] on '${m.name}' by Assert.ThrowsException around the throwing call.`, `'${m.name}'의 [ExpectedException]을 예외를 던지는 호출을 감싼 Assert.ThrowsException으로 바꾸세요.`);
  } } });

// ───────────────────────────────────────── discovery / signatures
R('test-class-without-tests', 'S2187', 'S', 'BL', 5, ['tests'],
  ['Test classes should contain at least one test', 'A class marked as a test fixture without test methods runs nothing; the tests were probably forgotten or lost their attribute.', 'Add test methods, mark them with the test attribute, or remove the fixture attribute.'],
  ['테스트 클래스에는 테스트가 하나 이상 있어야 합니다', '테스트 픽스처로 표시했지만 테스트 메서드가 없으면 아무것도 실행하지 않습니다. 테스트를 잊었거나 특성이 빠졌을 수 있습니다.', '테스트 메서드를 넣거나 테스트 특성을 붙이거나 픽스처 특성을 지우세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || !attrNamed(n.attrs, U.TEST_CLASS_ATTRS)) return;
    if (hasMod(n, 'abstract') || hasMod(n, 'static')) return;
    const info = n.typeInfo;
    if (info && info.decls[0] !== n) return;
    if (typeTestMethods(n).length) return;
    if (info && (info.baseInfo || info.externalBases.some((b) => !/^I[A-Z]/.test(b)))) return;
    const nested = (info ? info.decls : [n]).some((d) => d.members.some((m) => m.k === 'TypeDecl' && typeTestMethods(m).length));
    if (nested) return;
    cx.report(n, `Add tests to the test class '${n.name}', or remove its fixture attribute.`, `테스트 클래스 '${n.name}'에 테스트를 넣거나 픽스처 특성을 지우세요.`, { atName: true });
  } } });

R('test-method-signature', 'S3433', 'B', 'BL', 5, ['tests'],
  ['Test method signatures should be valid', 'Test runners skip or fail tests that are not public, are static or generic (MSTest), or are async void.', 'Make the test public, non-static, non-generic, returning void or Task.'],
  ['테스트 메서드 시그니처가 올바라야 합니다', '테스트 실행기는 public이 아니거나 static 또는 제네릭(MSTest)이거나 async void인 테스트를 건너뛰거나 실패시킵니다.', '테스트를 public, non-static, 비제네릭으로 하고 void나 Task를 반환하게 하세요.'],
  { kinds: { Method(n, cx) {
    const fw = framework(n);
    if (!fw || n.iface) return;
    const problems = [];
    if (!hasMod(n, 'public')) problems.push(['not public', 'public이 아님']);
    if (hasMod(n, 'async') && retName(n) === 'void') problems.push(['async void', 'async void']);
    if (fw === 'mstest' && hasMod(n, 'static')) problems.push(['static', 'static']);
    if (fw === 'mstest' && (n.typeParams || []).length) problems.push(['generic', '제네릭']);
    if (!problems.length) return;
    cx.report(n, `Fix the signature of the test '${n.name}': ${problems.map((p) => p[0]).join(', ')}.`, `테스트 '${n.name}'의 시그니처를 고치세요: ${problems.map((p) => p[1]).join(', ')}.`, { atName: true });
  } } });

R('test-class-not-public', '', 'B', 'CR', 2, ['tests'],
  ['Test classes should be public', 'MSTest, NUnit and xUnit only discover tests in public classes, so the tests of a non-public class never run.', 'Make the test class public.'],
  ['테스트 클래스는 public이어야 합니다', 'MSTest, NUnit, xUnit은 public 클래스의 테스트만 찾으므로 public이 아닌 클래스의 테스트는 실행되지 않습니다.', '테스트 클래스를 public으로 하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' && n.kind !== 'record') return;
    if (hasMod(n, 'public')) return;
    if (n.typeInfo && n.typeInfo.decls.some((d) => hasMod(d, 'public'))) return;
    if (n.typeInfo && n.typeInfo.decls[0] !== n) return;
    if (!isTestClass(n)) return;
    if (hasMod(n, 'abstract')) return;
    cx.report(n, `Make the test class '${n.name}' public so its tests are discovered.`, `테스트 클래스 '${n.name}'의 테스트가 발견되도록 public으로 하세요.`, { atName: true });
  } } });

R('test-method-outside-test-class', '', 'B', 'CR', 2, ['tests'],
  ['MSTest test methods should be in a [TestClass]', 'MSTest only runs [TestMethod] methods of classes marked [TestClass]; elsewhere they are silently ignored.', 'Add [TestClass] to the class.'],
  ['MSTest 테스트 메서드는 [TestClass] 안에 있어야 합니다', 'MSTest는 [TestClass]로 표시한 클래스의 [TestMethod]만 실행하고 나머지는 조용히 무시합니다.', '클래스에 [TestClass]를 붙이세요.'],
  { kinds: { Method(n, cx) {
    if (framework(n) !== 'mstest') return;
    const td = enclosing(n, ['TypeDecl']);
    if (!td || td.kind !== 'class' || hasMod(td, 'abstract')) return;
    if (typeHasAttr(td, ['TestClass'])) return;
    cx.report(n, `The test '${n.name}' never runs: mark '${td.name}' with [TestClass].`, `테스트 '${n.name}'는 실행되지 않습니다. '${td.name}'에 [TestClass]를 붙이세요.`, { atName: true });
  } } });

R('test-parameters-without-data', '', 'B', 'CR', 5, ['tests'],
  ['Parameterized tests should have data', 'A [Fact], [Test] or [TestMethod] with parameters has no values to call it with, so it fails or is not run.', 'Add data attributes ([InlineData], [TestCase], [DataRow] ...) or remove the parameters.'],
  ['매개변수가 있는 테스트에는 데이터가 있어야 합니다', '매개변수가 있는 [Fact], [Test], [TestMethod]는 호출할 값이 없어 실패하거나 실행되지 않습니다.', '데이터 특성([InlineData], [TestCase], [DataRow] 등)을 붙이거나 매개변수를 지우세요.'],
  { kinds: { Method(n, cx) {
    const a = attrNamed(n.attrs, ['Fact', 'Test', 'TestMethod']);
    if (!a || !(n.params || []).length) return;
    if (a.name !== 'Fact' && attrNamed(n.attrs, DATA_ATTRS)) return;
    if (a.name !== 'Fact' && n.attrs.some((x) => /Data|Source/.test(x.name))) return;
    if (n.params.some((p) => p.attrs && p.attrs.length)) return;
    if (a.name === 'Fact' && n.params.every((p) => p.def)) return;
    cx.report(n, `The test '${n.name}' takes parameters but has no data to run with.`, `테스트 '${n.name}'는 매개변수를 받지만 실행할 데이터가 없습니다.`, { atName: true });
  } } });

R('test-theory-without-data', '', 'B', 'CR', 5, ['tests'],
  ['Data-driven tests should provide data', 'An xUnit [Theory] or MSTest [DataTestMethod] without data attributes has no case to run and fails or is skipped.', 'Add [InlineData] / [MemberData] ([DataRow] / [DynamicData] in MSTest), or turn it into a plain test.'],
  ['데이터 기반 테스트에는 데이터가 있어야 합니다', '데이터 특성이 없는 xUnit [Theory]나 MSTest [DataTestMethod]는 실행할 경우가 없어 실패하거나 건너뜁니다.', '[InlineData] / [MemberData](MSTest는 [DataRow] / [DynamicData])를 붙이거나 일반 테스트로 바꾸세요.'],
  { kinds: { Method(n, cx) {
    const a = attrNamed(n.attrs, ['Theory', 'DataTestMethod']);
    if (!a) return;
    if (n.attrs.some((x) => x !== a && /Data|Source/.test(x.name))) return;
    cx.report(n, `Add data attributes to the [${a.name}] '${n.name}'.`, `[${a.name}] '${n.name}'에 데이터 특성을 붙이세요.`, { atName: true });
  } } });

R('test-data-argument-count', '', 'B', 'CR', 5, ['tests'],
  ['Test data should match the test parameters', 'When a data row passes more or fewer values than the test method has parameters, the runner fails that case before the test starts.', 'Make every [InlineData] / [TestCase] / [DataRow] pass one value per parameter.'],
  ['테스트 데이터는 테스트 매개변수와 맞아야 합니다', '데이터 행이 테스트 메서드의 매개변수보다 많거나 적은 값을 넘기면 실행기가 테스트를 시작하기 전에 그 경우를 실패시킵니다.', '[InlineData] / [TestCase] / [DataRow]마다 매개변수 하나에 값 하나를 넘기세요.'],
  { kinds: { Attribute(n, cx) {
    if (!['InlineData', 'TestCase', 'DataRow'].includes(n.name)) return;
    const m = n.parent;
    if (!m || m.k !== 'Method') return;
    const ps = m.params || [];
    if (ps.some((p) => p.mods.includes('params'))) return;
    const pos = n.args.filter((a) => !a.name);
    // a single array argument may be spread over the parameters
    if (pos.length === 1 && ['ArrayNew', 'Collection'].includes((unparen(pos[0].expr) || {}).k)) return;
    if (pos.length === 1 && ps.length > 1 && unparen(pos[0].expr).k !== 'Literal') return;
    const required = ps.filter((p) => !p.def).length;
    if (pos.length >= required && pos.length <= ps.length) return;
    cx.report(n, `[${n.name}] passes ${pos.length} value(s) but '${m.name}' takes ${ps.length} parameter(s).`, `[${n.name}]는 값 ${pos.length}개를 넘기지만 '${m.name}'는 매개변수 ${ps.length}개를 받습니다.`);
  } } });

R('test-duplicate-data', '', 'S', 'MA', 2, ['tests'],
  ['Test data rows should not be duplicated', 'A repeated data row runs the same case twice and usually hides a case that was meant to be different.', 'Remove the duplicate row or change it to the intended case.'],
  ['테스트 데이터 행이 중복되면 안 됩니다', '반복된 데이터 행은 같은 경우를 두 번 실행하고 대개 원래 다르게 쓰려던 경우를 숨깁니다.', '중복 행을 지우거나 의도한 경우로 바꾸세요.'],
  { kinds: { Method(n, cx) {
    const seen = new Map();
    for (const a of n.attrs || []) {
      if (!['InlineData', 'TestCase', 'DataRow'].includes(a.name)) continue;
      const key = `${a.name}(${a.args.map((x) => (x.name ? `${x.name}=` : '') + argText(cx, x)).join(',')})`;
      if (seen.has(key)) cx.report(a, `This [${a.name}] repeats the data row on line ${seen.get(key)}.`, `이 [${a.name}]는 ${seen.get(key)}행의 데이터 행을 반복합니다.`);
      else seen.set(key, a.line);
    }
  } } });

R('test-non-void-return', '', 'B', 'MA', 5, ['tests'],
  ['Test methods should return void or Task', 'A test returning a value is either not discovered or its result is ignored, which usually means a forgotten assertion.', 'Return void / Task and assert the value, or use NUnit\'s ExpectedResult.'],
  ['테스트 메서드는 void나 Task를 반환해야 합니다', '값을 반환하는 테스트는 발견되지 않거나 결과가 무시되며, 대개 단언을 빠뜨렸다는 뜻입니다.', 'void / Task를 반환하고 값을 단언하거나 NUnit의 ExpectedResult를 쓰세요.'],
  { kinds: { Method(n, cx) {
    if (!framework(n)) return;
    const r = retName(n);
    if (!r || r === 'void' || ((r === 'Task' || r === 'ValueTask') && !(n.retType.args || []).length)) return;
    if (n.attrs.some((a) => a.args.some((x) => x.name === 'ExpectedResult'))) return;
    cx.report(n, `The test '${n.name}' returns '${cx.text(n.retType)}'; return void or Task and assert the value.`, `테스트 '${n.name}'가 '${cx.text(n.retType)}'를 반환합니다. void나 Task를 반환하고 값을 단언하세요.`, { atName: true });
  } } });

R('test-fixture-method-signature', '', 'B', 'CR', 5, ['tests'],
  ['MSTest initialize and cleanup methods should have the expected signature', 'MSTest refuses to run a class whose [ClassInitialize] / [AssemblyInitialize] is not public static with one TestContext parameter, or whose [TestInitialize] / [TestCleanup] is static or takes parameters.', 'Use public static void M(TestContext context) for class / assembly initializers and public void M() for per-test methods.'],
  ['MSTest 초기화·정리 메서드는 정해진 시그니처를 따라야 합니다', 'MSTest는 [ClassInitialize] / [AssemblyInitialize]가 TestContext 매개변수 하나를 받는 public static이 아니거나 [TestInitialize] / [TestCleanup]이 static이거나 매개변수를 받으면 클래스를 실행하지 않습니다.', '클래스·어셈블리 초기화는 public static void M(TestContext context), 테스트별 메서드는 public void M()으로 쓰세요.'],
  { kinds: { Method(n, cx) {
    const a = attrNamed(n.attrs, ['ClassInitialize', 'AssemblyInitialize', 'ClassCleanup', 'AssemblyCleanup', 'TestInitialize', 'TestCleanup']);
    if (!a) return;
    const ps = n.params || [];
    const bad = [];
    if (!hasMod(n, 'public')) bad.push(['not public', 'public이 아님']);
    const r = retName(n);
    if (r !== 'void' && r !== 'Task' && r !== 'ValueTask') bad.push(['wrong return type', '반환 형식이 틀림']);
    if (hasMod(n, 'async') && r === 'void') bad.push(['async void', 'async void']);
    if (a.name === 'ClassInitialize' || a.name === 'AssemblyInitialize') {
      if (!hasMod(n, 'static')) bad.push(['not static', 'static이 아님']);
      if (ps.length !== 1 || !ps[0].type || ps[0].type.name !== 'TestContext') bad.push(['needs one TestContext parameter', 'TestContext 매개변수 하나가 필요함']);
    } else if (a.name === 'ClassCleanup' || a.name === 'AssemblyCleanup') {
      if (!hasMod(n, 'static')) bad.push(['not static', 'static이 아님']);
      if (ps.length > 1 || (ps.length === 1 && (!ps[0].type || ps[0].type.name !== 'TestContext'))) bad.push(['unexpected parameters', '예상하지 않은 매개변수']);
    } else {
      if (hasMod(n, 'static')) bad.push(['static', 'static']);
      if (ps.length) bad.push(['takes parameters', '매개변수를 받음']);
    }
    if (!bad.length) return;
    cx.report(n, `Fix the [${a.name}] method '${n.name}': ${bad.map((b) => b[0]).join(', ')}.`, `[${a.name}] 메서드 '${n.name}'를 고치세요: ${bad.map((b) => b[1]).join(', ')}.`, { atName: true });
  } } });

R('test-ignored-without-reason', 'S1607', 'S', 'MA', 5, ['tests'],
  ['Ignored tests should explain why', 'A test disabled without a reason is easily forgotten, and nobody knows when it can be enabled again.', 'Give the reason in the attribute ([Ignore("...")], Skip = "...") or re-enable the test.'],
  ['무시한 테스트에는 이유를 적어야 합니다', '이유 없이 끈 테스트는 쉽게 잊히고 언제 다시 켤 수 있는지 아무도 모릅니다.', '특성에 이유를 적거나([Ignore("...")], Skip = "...") 테스트를 다시 켜세요.'],
  { kinds: { Attribute(n, cx) {
    const m = n.parent;
    if (!m || (m.k !== 'Method' && m.k !== 'TypeDecl')) return;
    const blank = (e) => { const v = U.strVal(e); return v != null && !v.trim(); };
    if (n.name === 'Ignore') {
      const pos = n.args.filter((a) => !a.name);
      if (pos.length && !blank(pos[0].expr)) return;
      cx.report(n, `Give the reason why '${m.name}' is ignored.`, `'${m.name}'를 무시하는 이유를 적으세요.`);
      return;
    }
    if (XUNIT_ATTRS.includes(n.name)) {
      const skip = n.args.find((a) => a.name === 'Skip');
      if (skip && blank(skip.expr)) cx.report(n, `Give the reason why '${m.name}' is skipped.`, `'${m.name}'를 건너뛰는 이유를 적으세요.`);
    }
  } } });

R('test-empty-method', '', 'S', 'MA', 5, ['tests'],
  ['Test methods should not be empty', 'An empty test always passes and reports coverage that does not exist.', 'Write the test, or remove it.'],
  ['테스트 메서드가 비어 있으면 안 됩니다', '빈 테스트는 항상 통과하고 존재하지 않는 검증을 있는 것처럼 보이게 합니다.', '테스트를 작성하거나 지우세요.'],
  { kinds: { Method(n, cx) {
    if (!isTest(n) || !n.body || n.body.k !== 'Block' || n.body.stmts.length) return;
    if (U.hasCommentInside(cx.pf, n.body)) return;
    cx.report(n, `The test '${n.name}' is empty.`, `테스트 '${n.name}'가 비어 있습니다.`, { atName: true });
  } } });

// ───────────────────────────────────────── flaky / noisy tests
R('test-thread-sleep', 'S2925', 'S', 'MA', 10, ['tests', 'bad-practice'],
  ['Thread.Sleep should not be used in tests', 'Sleeping makes tests slow and still flaky: the wait is either too short on a busy machine or wasted time.', 'Wait on the actual condition (events, tasks, polling with a timeout) or use a fake clock.'],
  ['테스트에서 Thread.Sleep을 쓰면 안 됩니다', '잠들기는 테스트를 느리게 하면서도 불안정하게 만듭니다. 바쁜 컴퓨터에서는 너무 짧고 아니면 시간 낭비입니다.', '실제 조건(이벤트, 태스크, 시간 제한이 있는 폴링)을 기다리거나 가짜 시계를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'Sleep') return;
    const d = dotted(callTarget(n) || {});
    if (d !== 'Thread' && d !== 'System.Threading.Thread') return;
    const m = testMethodOf(n);
    if (!m) return;
    cx.report(n, `Remove this Thread.Sleep from the test '${m.name}'.`, `테스트 '${m.name}'에서 이 Thread.Sleep을 지우세요.`);
  } } });

R('test-console-output', '', 'S', 'MI', 2, ['tests'],
  ['Tests should write output through the framework', 'Console output from tests is lost or interleaved between parallel tests; the framework\'s output helper attaches it to the right test.', 'Use TestContext.WriteLine (MSTest / NUnit) or ITestOutputHelper (xUnit).'],
  ['테스트 출력은 프레임워크로 써야 합니다', '테스트의 콘솔 출력은 사라지거나 병렬 테스트끼리 섞입니다. 프레임워크의 출력 도구는 출력을 해당 테스트에 붙여 줍니다.', 'TestContext.WriteLine(MSTest / NUnit)이나 ITestOutputHelper(xUnit)를 쓰세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (name !== 'WriteLine' && name !== 'Write') return;
    if (dotted(callTarget(n) || {}) !== 'Console') return;
    const m = testMethodOf(n);
    if (!m) return;
    const repl = framework(m) === 'xunit' ? 'ITestOutputHelper' : 'TestContext';
    cx.report(n, `Write test output through ${repl} instead of Console.${name}.`, `Console.${name} 대신 ${repl}로 테스트 출력을 쓰세요.`);
  } } });

R('test-current-time', '', 'S', 'MA', 10, ['tests'],
  ['Tests should not depend on the current time', 'Results that depend on DateTime.Now change with the clock, the time zone and midnight, so the test is flaky.', 'Inject a clock (TimeProvider, ISystemClock) and use fixed dates in tests.'],
  ['테스트가 현재 시각에 의존하면 안 됩니다', 'DateTime.Now에 의존하는 결과는 시계, 시간대, 자정에 따라 바뀌므로 테스트가 불안정합니다.', '시계(TimeProvider, ISystemClock)를 주입하고 테스트에서는 고정된 날짜를 쓰세요.'],
  { kinds: { Member(n, cx) {
    const d = dotted(n);
    if (!['DateTime.Now', 'DateTime.UtcNow', 'DateTime.Today', 'DateTimeOffset.Now', 'DateTimeOffset.UtcNow'].includes(d)) return;
    const m = testMethodOf(n);
    if (!m) return;
    cx.report(n, `The test '${m.name}' depends on ${d}; use a fixed date or an injected clock.`, `테스트 '${m.name}'가 ${d}에 의존합니다. 고정된 날짜나 주입한 시계를 쓰세요.`);
  } } });

R('test-unseeded-random', '', 'S', 'MA', 5, ['tests'],
  ['Random values in tests should use a fixed seed', 'An unseeded Random gives different data on each run, so a failure cannot be reproduced.', 'Create Random with a fixed seed, or log the seed used.'],
  ['테스트의 난수에는 고정 시드를 써야 합니다', '시드 없는 Random은 실행할 때마다 다른 데이터를 만들어 실패를 재현할 수 없습니다.', 'Random을 고정 시드로 만들거나 사용한 시드를 기록하세요.'],
  { kinds: {
    New(n, cx) {
      if (!n.type || n.type.name !== 'Random' || n.args.length) return;
      const m = testMethodOf(n);
      if (m) cx.report(n, `Pass a fixed seed to this Random in the test '${m.name}'.`, `테스트 '${m.name}'의 이 Random에 고정 시드를 넘기세요.`);
    },
    Member(n, cx) {
      if (dotted(n) !== 'Random.Shared') return;
      const m = testMethodOf(n);
      if (m) cx.report(n, `Random.Shared cannot be seeded; use a seeded Random in the test '${m.name}'.`, `Random.Shared는 시드를 정할 수 없습니다. 테스트 '${m.name}'에서 시드를 준 Random을 쓰세요.`);
    },
  } });

R('test-static-mutable-field', '', 'S', 'MA', 10, ['tests'],
  ['Tests should not share mutable static state', 'A static field written by tests couples them: results depend on the execution order and break under parallel runs.', 'Use instance fields set up per test, or make the field readonly.'],
  ['테스트는 변경 가능한 static 상태를 공유하면 안 됩니다', '테스트가 쓰는 static 필드는 테스트끼리 묶어서 결과가 실행 순서에 따라 달라지고 병렬 실행에서 깨집니다.', '테스트마다 준비하는 인스턴스 필드를 쓰거나 필드를 readonly로 하세요.'],
  { kinds: { Name(n, cx) {
    if (!n.isWrite || !n.msym) return;
    const f = n.msym.find((e) => e.kind === 'field' && e.isStatic && !hasMod(e.node, 'readonly'));
    if (!f) return;
    const m = testMethodOf(n);
    if (!m) return;
    cx.report(n, `The test '${m.name}' writes the static field '${n.name}'; tests then depend on their order.`, `테스트 '${m.name}'가 static 필드 '${n.name}'에 씁니다. 그러면 테스트가 실행 순서에 의존합니다.`);
  } } });

module.exports = { framework, isTest, hasAssertion, ALL_TEST_ATTRS };
