import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cyclomaticComplexity,
  cognitiveComplexity,
  maxNestingDepth,
  countReturns,
  countMagicNumbers,
  halsteadVolume,
  maintenanceIndex,
  qualitySignals,
  measureFunction,
} from '../src/core/complexity.js';

test('cyclomatic complexity is 1 for straight-line code', () => {
  assert.equal(cyclomaticComplexity('const a = 1; const b = 2; return a + b;'), 1);
});

test('cyclomatic complexity counts each branch and each boolean operator', () => {
  assert.equal(cyclomaticComplexity('if (a) { }'), 2);
  assert.equal(cyclomaticComplexity('if (a && b) { }'), 3, 'the && is its own path');
  assert.equal(cyclomaticComplexity('if (a || b) { } for (;;) { }'), 4);
  assert.equal(cyclomaticComplexity('while (x) { try { } catch (e) { } }'), 3);
});

test('cyclomatic complexity counts a ternary but not an optional-chain or TS optional', () => {
  assert.equal(cyclomaticComplexity('const x = a ? b : c;'), 2);
  assert.equal(cyclomaticComplexity('const x = a?.b;'), 1, 'optional chaining is not a branch');
  assert.equal(cyclomaticComplexity('function f(a?: string) {}'), 1, 'an optional parameter is not a branch');
});

test('cognitive complexity grows faster than cyclomatic when branches nest', () => {
  const flat = 'if (a) {} if (b) {} if (c) {}';
  const nested = 'if (a) { if (b) { if (c) { } } }';

  assert.equal(cyclomaticComplexity(flat), cyclomaticComplexity(nested), 'same number of decisions');
  assert.ok(
    cognitiveComplexity(nested, 'brace') > cognitiveComplexity(flat, 'brace'),
    'nesting must cost more than a flat sequence',
  );
});

test('maxNestingDepth measures braces, indentation and keyword blocks', () => {
  assert.equal(maxNestingDepth('if (a) { if (b) { } }', 'brace'), 2);
  assert.equal(maxNestingDepth('x = 1;', 'brace'), 0);
  assert.equal(maxNestingDepth('def f():\n    if a:\n        if b:\n            return 1\n', 'indent'), 3);
  assert.equal(maxNestingDepth('if a\n  while b\n  end\nend\n', 'keyword'), 2);
});

test('countReturns counts return and yield', () => {
  assert.equal(countReturns('return 1; if (x) return 2; yield 3;'), 3);
  assert.equal(countReturns('const returned = 1;'), 0, 'a substring is not a keyword');
});

test('countMagicNumbers ignores 0, 1 and -1', () => {
  assert.equal(countMagicNumbers('a = 0; b = 1; c = -1;'), 0);
  assert.equal(countMagicNumbers('timeout = 3000; retries = 5;'), 2);
  assert.equal(countMagicNumbers('obj.prop2 = x;'), 0, 'digits inside an identifier are not literals');
});

test('halsteadVolume grows with vocabulary and is zero for trivial input', () => {
  assert.equal(halsteadVolume(''), 0);
  const small = halsteadVolume('a = b + c;');
  const large = halsteadVolume('alpha = beta + gamma * delta - epsilon / zeta + eta % theta;');
  assert.ok(large > small, 'more distinct tokens must yield a larger volume');
});

test('maintenanceIndex falls as a function gets longer and more complex', () => {
  const easy = maintenanceIndex(5, 1, 1, 1);
  const hard = maintenanceIndex(400, 40, 60, 9);

  assert.ok(easy > hard, 'a short simple function must score higher');
  assert.ok(easy <= 171 && easy >= 0);
  assert.ok(hard <= 171 && hard >= 0);
  assert.equal(maintenanceIndex(0, 1, 1, 0), 100, 'an empty body is reported as neutral');
});

test('qualitySignals detects empty catch, broad catch, cases and async void', () => {
  const signals = qualitySignals(
    'try { a(); } catch (Exception e) { } switch (x) { case 1: break; case 2: break; default: break; }',
    'brace',
    'public async void Handler()',
  );

  assert.ok(signals.emptyCatchCount >= 1, 'the empty catch is found');
  assert.ok(signals.broadCatchCount >= 1, 'catching Exception is flagged as broad');
  assert.equal(signals.switchCaseCount, 3);
  assert.equal(signals.isAsyncVoid, true);
  assert.ok(signals.statementCount > 0);
});

test('measureFunction returns a complete metric set', () => {
  const fn = {
    maskedBody: 'if (a) { for (i) { if (b && c) { return 42; } } } return 0;',
    lineCount: 6,
    parameterCount: 2,
    signature: 'int demo(int a, int b)',
  };
  const metrics = measureFunction(fn, 'brace');

  assert.ok(metrics.cyclomaticComplexity >= 5);
  assert.ok(metrics.cognitiveComplexity >= metrics.cyclomaticComplexity);
  assert.equal(metrics.maxNestingDepth, 3);
  assert.equal(metrics.returnCount, 2);
  assert.equal(metrics.magicNumberCount, 1);
  assert.equal(metrics.weightedMethodComplexity, metrics.cyclomaticComplexity);
  assert.ok(Number.isFinite(metrics.maintenanceIndex));
});

test('no counter loops forever on a body of only separators', () => {
  const body = ';;;;;;;;;;';
  assert.equal(cyclomaticComplexity(body), 1);
  assert.equal(countReturns(body), 0);
  assert.equal(qualitySignals(body, 'brace', '').statementCount, 10);
});
