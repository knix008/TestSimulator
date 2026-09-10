import test from 'node:test';
import assert from 'node:assert/strict';

import { maskSource, buildLineStarts } from '../src/core/text.js';
import { extractFunctions, countParameters } from '../src/core/functions.js';
import { csharpSource, pythonSource, javascriptSource, javaSource, goSource, rubySource } from './fixtures.mjs';

function makeFile(path, languageId, text) {
  return { path, languageId, text, masked: maskSource(text, languageId), lineStarts: buildLineStarts(text) };
}

function namesOf(file) {
  return extractFunctions(file).map((fn) => fn.name);
}

test('C#: finds methods and constructors, not control statements', () => {
  const names = namesOf(makeFile('/p/UserRepository.cs', 'csharp', csharpSource));

  for (const expected of ['UserRepository', 'Save', 'LoadName', 'Query', 'Execute', 'Complicated', 'FireAndForget']) {
    assert.ok(names.includes(expected), 'expected to find ' + expected + ', got: ' + names.join(', '));
  }
  for (const forbidden of ['if', 'for', 'while', 'switch', 'catch', 'using']) {
    assert.ok(!names.includes(forbidden), forbidden + ' must not be treated as a function');
  }
});

test('C#: interface members without a body are not reported as functions', () => {
  const functions = extractFunctions(makeFile('/p/UserRepository.cs', 'csharp', csharpSource));
  const declarations = functions.filter((fn) => fn.name === 'Save');
  assert.equal(declarations.length, 1, 'only the implementation has a body; the interface declaration has none');
});

test('Python: finds module functions and methods with indentation-delimited bodies', () => {
  const functions = extractFunctions(makeFile('/p/service.py', 'python', pythonSource));
  const names = functions.map((fn) => fn.name);

  assert.deepEqual(names.sort(), ['__init__', 'helper', 'main', 'run'].sort());

  const helper = functions.find((fn) => fn.name === 'helper');
  assert.ok(helper.bodyText.includes('return item'), 'the indented block is the body');
  assert.ok(!helper.bodyText.includes('def main'), 'the body stops at the dedent');
});

test('JavaScript: finds function declarations, arrow consts and class methods', () => {
  const functions = extractFunctions(makeFile('/p/app.js', 'javascript', javascriptSource));
  const names = functions.map((fn) => fn.name);

  for (const expected of ['bootstrap', 'render', 'constructor', 'update']) {
    assert.ok(names.includes(expected), 'expected ' + expected + ', got: ' + names.join(', '));
  }

  const update = functions.find((fn) => fn.name === 'update');
  assert.equal(update.parameterCount, 3);
  assert.ok(update.bodyText.includes('innerHTML'), 'the whole method body is captured');
});

test('Java: finds methods and ignores annotations and field declarations', () => {
  const names = namesOf(makeFile('/p/Order.java', 'java', javaSource));
  assert.ok(names.includes('getId'));
  assert.ok(names.includes('recalc'));
  assert.ok(!names.includes('Entity'), 'an annotation is not a method');
});

test('Go: finds both plain functions and methods with receivers', () => {
  const names = namesOf(makeFile('/p/main.go', 'go', goSource));
  assert.deepEqual(names.sort(), ['main', 'process']);
});

test('Ruby: delimits a method body at its matching end', () => {
  const functions = extractFunctions(makeFile('/p/worker.rb', 'ruby', rubySource));
  const names = functions.map((fn) => fn.name);

  assert.ok(names.includes('perform'));
  assert.ok(names.includes('process'));

  const perform = functions.find((fn) => fn.name === 'perform');
  assert.ok(perform.bodyText.includes('process(item)'), 'the nested block stays inside the method');
  assert.ok(!perform.bodyText.includes('def process'), 'the next method is outside it');
});

test('a function body never leaks into the following declaration', () => {
  const functions = extractFunctions(makeFile('/p/app.js', 'javascript', javascriptSource));
  const sorted = [...functions].sort((a, b) => a.startLine - b.startLine);

  for (let i = 0; i + 1 < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    // Nesting is legitimate (a method inside a class); overlap without
    // containment is not.
    const contains = next.startLine >= current.startLine && next.endLine <= current.endLine;
    const disjoint = next.startLine > current.endLine;
    assert.ok(contains || disjoint, current.name + ' and ' + next.name + ' overlap without nesting');
  }
});

test('countParameters handles empty lists, nesting and defaults', () => {
  assert.equal(countParameters('foo()'), 0);
  assert.equal(countParameters('foo(a)'), 1);
  assert.equal(countParameters('foo(a, b, c)'), 3);
  assert.equal(countParameters('foo(a: Map<string, int>, b)'), 2, 'a comma inside generics is not a separator');
  assert.equal(countParameters('foo(a = f(1, 2), b)'), 2, 'a comma inside a default value is not a separator');
  assert.equal(countParameters('no parens at all'), 0);
});

test('declarations inside comments and strings are ignored', () => {
  const text = [
    '// function ghost() {}',
    '/* function phantom() {} */',
    'const s = "function spectre() {}";',
    'function real() { return 1; }',
  ].join('\n');

  const names = namesOf(makeFile('/p/x.js', 'javascript', text));
  assert.deepEqual(names, ['real']);
});
