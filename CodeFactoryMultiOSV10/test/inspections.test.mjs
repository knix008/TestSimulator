// Duplicate code, global variables, bug risk and security rules.

import test from 'node:test';
import assert from 'node:assert/strict';

import { maskSource, buildLineStarts } from '../src/core/text.js';
import { extractFunctions } from '../src/core/functions.js';
import { findDuplicates, normalizeLine, isSignificantLine } from '../src/core/duplicates.js';
import { extractGlobals, analyzeGlobalAccess } from '../src/core/globals.js';
import { scanBugRisk, metricsBugRisk, summarizeBugRisk } from '../src/core/bugRisk.js';
import { scanSecurity, summarizeSecurity } from '../src/core/security.js';
import { csharpSource, pythonSource, javascriptSource, goSource, duplicatedA, duplicatedB } from './fixtures.mjs';

function makeFile(path, languageId, text) {
  return { path, languageId, text, masked: maskSource(text, languageId), lineStarts: buildLineStarts(text) };
}

/* --------------------------------------------------------------- duplicates */

test('normalizeLine erases formatting and literal values', () => {
  assert.equal(normalizeLine('  const  x   =  "hello" ;  '), 'const x = "§" ;');
  assert.equal(normalizeLine('retry(3000)'), 'retry(§n)');
  assert.equal(normalizeLine('x = 1; // note'), 'x = §n;');
});

test('isSignificantLine rejects punctuation-only and trivial lines', () => {
  assert.equal(isSignificantLine(''), false);
  assert.equal(isSignificantLine('}'), false);
  assert.equal(isSignificantLine('});'), false);
  assert.equal(isSignificantLine('end'), false);
  assert.equal(isSignificantLine('const client = createClient(options);'), true);
});

test('a block copied between two files is reported once, with both locations', () => {
  const result = findDuplicates(
    [
      { path: '/p/a.js', languageId: 'javascript', text: duplicatedA },
      { path: '/p/b.js', languageId: 'javascript', text: duplicatedB },
    ],
    5,
  );

  assert.equal(result.groups.length, 1, 'one group, not one per occurrence');
  const group = result.groups[0];
  assert.equal(group.occurrenceCount, 2);
  assert.ok(group.lineCount >= 5);
  assert.deepEqual(group.fragments.map((f) => f.filePath).sort(), ['/p/a.js', '/p/b.js']);
  assert.ok(result.totalDuplicateLines > 0);
});

test('duplicate detection respects the minimum line count', () => {
  const short = 'function f() {\n  const a = compute(1);\n  return a;\n}\n';
  const files = [
    { path: '/p/x.js', languageId: 'javascript', text: short },
    { path: '/p/y.js', languageId: 'javascript', text: short.replace('f()', 'g()') },
  ];

  assert.equal(findDuplicates(files, 2).groups.length, 1, 'a 2-line minimum finds it');
  assert.equal(findDuplicates(files, 40).groups.length, 0, 'a 40-line minimum does not');
});

test('distinct code produces no duplicate groups', () => {
  const result = findDuplicates(
    [
      { path: '/p/a.js', languageId: 'javascript', text: 'function one() { return alpha(); }\n' },
      { path: '/p/b.js', languageId: 'javascript', text: 'const two = 2; console.warn(two);\n' },
    ],
    3,
  );
  assert.deepEqual(result.groups, []);
});

/* ------------------------------------------------------------------ globals */

test('C#: static and const fields are globals, locals are not', () => {
  const file = makeFile('/p/UserRepository.cs', 'csharp', csharpSource);
  const functions = extractFunctions(file);
  const globals = extractGlobals(file, functions);
  const names = globals.map((g) => g.name);

  assert.ok(names.includes('_instanceCount'), 'a static field is global');
  assert.ok(names.includes('TableName'), 'a const field is global');
  assert.ok(!names.includes('cmd'), 'a local inside a method is not global');
  assert.ok(!names.includes('sql'), 'a local inside a method is not global');

  assert.equal(globals.find((g) => g.name === 'TableName').isConst, true);
});

test('Python and Go module-level variables are found', () => {
  const py = makeFile('/p/service.py', 'python', pythonSource);
  const pyGlobals = extractGlobals(py, extractFunctions(py)).map((g) => g.name);
  assert.ok(pyGlobals.includes('CONFIG'));
  assert.ok(pyGlobals.includes('DEBUG'));
  assert.ok(!pyGlobals.includes('service'), 'a variable inside main() is local');

  const go = makeFile('/p/main.go', 'go', goSource);
  const goGlobals = extractGlobals(go, extractFunctions(go)).map((g) => g.name);
  assert.ok(goGlobals.includes('GlobalCounter'));
  assert.ok(goGlobals.includes('MaxItems'));
  assert.ok(!goGlobals.includes('total'), 'a local inside process() is not global');
});

test('global access is classified as read or write', () => {
  const file = makeFile('/p/app.js', 'javascript', javascriptSource);
  const functions = extractFunctions(file);
  const globals = extractGlobals(file, functions);
  const { accesses } = analyzeGlobalAccess(globals, functions);

  const counter = accesses.filter((a) => a.variableName === 'counter');
  assert.ok(counter.length > 0, 'the module counter is accessed');
  assert.ok(counter.some((a) => a.kind === 'write'), 'counter += 1 is a write');

  const cache = accesses.filter((a) => a.variableName === 'CACHE');
  assert.ok(cache.length > 0, 'CACHE is accessed from render()');
});

test('a function does not count as accessing a global declared inside itself', () => {
  const file = makeFile('/p/x.py', 'python', 'TOP = 1\n\ndef f():\n    inner = 2\n    return TOP + inner\n');
  const functions = extractFunctions(file);
  const globals = extractGlobals(file, functions);
  const { accesses } = analyzeGlobalAccess(globals, functions);

  assert.deepEqual(accesses.map((a) => a.variableName), ['TOP']);
});

/* ----------------------------------------------------------------- bug risk */

test('empty catch blocks are reported as exception swallowing', () => {
  const findings = scanBugRisk(makeFile('/p/UserRepository.cs', 'csharp', csharpSource));
  assert.ok(findings.some((f) => f.category === 'exceptionSwallowing'), 'the empty catch in LoadName is found');
});

test('async void is flagged for C# only', () => {
  const csharp = scanBugRisk(makeFile('/p/x.cs', 'csharp', 'public async void Handler() { }\n'));
  assert.ok(csharp.some((f) => f.category === 'asyncVoidMethod'));

  const js = scanBugRisk(makeFile('/p/x.js', 'javascript', 'async function handler() { }\n'));
  assert.ok(!js.some((f) => f.category === 'asyncVoidMethod'), 'JS has no async void');
});

test('constant conditions are found, while(true) excluded', () => {
  const findings = scanBugRisk(
    makeFile('/p/x.js', 'javascript', 'if (true) { a(); }\nif (false) { b(); }\nwhile (true) { c(); }\nif (1 == 1) { d(); }\n'),
  );

  assert.ok(findings.some((f) => f.category === 'alwaysTrue'));
  assert.ok(findings.some((f) => f.category === 'alwaysFalse'));
  assert.ok(findings.some((f) => f.category === 'constantCondition'), '1 == 1 is a constant condition');
  assert.ok(!findings.some((f) => f.snippet.includes('while (true)')), 'the idiomatic infinite loop is not flagged');
});

test('unreachable code after a terminator is reported', () => {
  const findings = scanBugRisk(makeFile('/p/x.js', 'javascript', 'function f() {\n  return 1;\n  cleanup();\n}\n'));
  assert.ok(findings.some((f) => f.category === 'deadCode' && f.line === 3));
});

test('a closing brace after return is not dead code', () => {
  const findings = scanBugRisk(makeFile('/p/x.js', 'javascript', 'function f() {\n  return 1;\n}\nfunction g() { return 2; }\n'));
  assert.ok(!findings.some((f) => f.category === 'deadCode'), 'the block end is a legitimate follower');
});

test('resource leaks are detected for C# disposables outside a using', () => {
  const leaking = scanBugRisk(makeFile('/p/x.cs', 'csharp', 'void M() {\n    var s = new FileStream(path);\n}\n'));
  assert.ok(leaking.some((f) => f.category === 'resourceLeak'));

  const safe = scanBugRisk(makeFile('/p/y.cs', 'csharp', 'void M() {\n    using var s = new FileStream(path);\n}\n'));
  assert.ok(!safe.some((f) => f.category === 'resourceLeak'), 'a using declaration is not a leak');
});

test('metricsBugRisk flags the complexity-plus-nesting combination', () => {
  const settings = { warnCyclomaticComplexity: 10, warnMaxNestingDepth: 3, warnMagicNumbers: 5 };
  const findings = metricsBugRisk(
    [
      {
        id: 'f1', filePath: '/p/a.js', languageId: 'javascript', displayName: 'big', signature: 'big()',
        startLine: 1, cyclomaticComplexity: 20, maxNestingDepth: 5, magicNumberCount: 0,
        isPossiblyUnused: false, emptyCatchCount: 0,
      },
      {
        id: 'f2', filePath: '/p/a.js', languageId: 'javascript', displayName: 'small', signature: 'small()',
        startLine: 20, cyclomaticComplexity: 2, maxNestingDepth: 1, magicNumberCount: 0,
        isPossiblyUnused: false, emptyCatchCount: 0,
      },
    ],
    settings,
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'highComplexityNesting');
});

test('summarizeBugRisk orders by severity and groups by category', () => {
  const summary = summarizeBugRisk([
    { category: 'emptyBlock', severity: 'info', message: 'i', filePath: '/b.js', line: 5 },
    { category: 'exceptionSwallowing', severity: 'critical', message: 'c', filePath: '/a.js', line: 1 },
    { category: 'alwaysTrue', severity: 'warning', message: 'w', filePath: '/a.js', line: 2 },
  ]);

  assert.deepEqual(summary.findings.map((f) => f.severity), ['critical', 'warning', 'info']);
  assert.equal(summary.criticalCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.infoCount, 1);
  assert.equal(summary.categories.length, 3);
  assert.equal(summary.categories[0].severity, 'critical');
});

/* ------------------------------------------------------------------ security */

test('hardcoded secrets are flagged in any language', () => {
  for (const [languageId, text] of [
    ['python', 'API_KEY = "sk-live-abcdef123456"\n'],
    ['csharp', 'var password = "hunter2000";\n'],
    ['javascript', 'const token = "ghp_abcdefghijk";\n'],
  ]) {
    const hits = scanSecurity(makeFile('/p/x', languageId, text));
    assert.ok(hits.some((h) => h.ruleId === 'hardcoded-secret'), languageId + ' secret must be flagged');
  }
});

test('language-specific rules only fire for their language', () => {
  const python = scanSecurity(makeFile('/p/x.py', 'python', 'subprocess.call(cmd, shell=True)\nos.system(cmd)\n'));
  assert.ok(python.some((h) => h.ruleId === 'subprocess-shell'));
  assert.ok(python.some((h) => h.ruleId === 'os-system'));

  const js = scanSecurity(makeFile('/p/x.js', 'javascript', 'subprocess.call(cmd, shell=True)\n'));
  assert.ok(!js.some((h) => h.ruleId === 'subprocess-shell'), 'a Python rule must not fire on JS');
});

test('the JS rules find innerHTML, eval and document.write', () => {
  const hits = scanSecurity(makeFile('/p/x.js', 'javascript', 'el.innerHTML = a;\neval(b);\ndocument.write(c);\n'));
  const ids = hits.map((h) => h.ruleId);

  assert.ok(ids.includes('inner-html'));
  assert.ok(ids.includes('js-eval'));
  assert.ok(ids.includes('document-write'));
});

test('SQL built by string concatenation is flagged', () => {
  const hits = scanSecurity(makeFile('/p/x.cs', 'csharp', 'var sql = "SELECT name FROM users WHERE id = " + id;\n'));
  assert.ok(hits.some((h) => h.ruleId === 'sql-concat'));
});

test('every security finding carries a line, snippet and remediation', () => {
  const hits = scanSecurity(makeFile('/p/x.py', 'python', 'import os\nos.system(user_input)\n'));
  const hit = hits.find((h) => h.ruleId === 'os-system');

  assert.equal(hit.line, 2);
  assert.ok(hit.snippet.includes('os.system'));
  assert.ok(hit.remediation.length > 10, 'a finding without advice is not actionable');
});

test('summarizeSecurity groups by rule and by file, ordered by severity', () => {
  const hits = [
    ...scanSecurity(makeFile('/p/a.py', 'python', 'os.system(x)\n')),
    ...scanSecurity(makeFile('/p/b.py', 'python', 'API_KEY = "abcdef123"\npickle.loads(x)\n')),
  ];
  const summary = summarizeSecurity(hits);

  assert.equal(summary.affectedFileCount, 2);
  assert.ok(summary.criticalCount >= 2);
  assert.equal(summary.rules[0].severity, 'critical', 'critical rules come first');
  assert.equal(summary.total, hits.length);
});

test('a clean file produces no security findings', () => {
  const hits = scanSecurity(makeFile('/p/clean.js', 'javascript', 'export function add(a, b) {\n  return a + b;\n}\n'));
  assert.deepEqual(hits, []);
});
