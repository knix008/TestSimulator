import test from 'node:test';
import assert from 'node:assert/strict';
import { render, evaluate, compare, references, parsePath } from '../../core/expr.js';

const scope = {
  input: { text: 'Hello World', items: [{ name: 'a', n: 2 }, { name: 'b', n: 5 }], json: '{"x":{"y":7}}' },
  trigger: { message: '안녕', body: { title: 'Bug' } },
  vars: { topic: 'agents' },
  nodes: { 'Search docs': { output: { results: [1, 2, 3] } } },
  item: { name: 'kim' },
  index: 2,
};

test('paths: dots, brackets, quoted names and indexes', () => {
  assert.deepEqual(parsePath('a.b[0]["c d"].e'), ['a', 'b', 0, 'c d', 'e']);
  assert.equal(evaluate('input.items[1].name', scope), 'b');
  assert.equal(evaluate('nodes.Search docs.output.results.length', scope), 3);
  assert.equal(evaluate('input.json.x.y', scope), 7, 'JSON text is read like an object');
});

test('a whole-field expression keeps its type, mixed text becomes text', () => {
  assert.deepEqual(render('{{ input.items }}', scope), scope.input.items);
  assert.equal(render('Topic: {{ vars.topic }} #{{ index }}', scope), 'Topic: agents #2');
  assert.equal(render('{{ trigger.body }}', scope).title, 'Bug');
  assert.equal(render('x {{ trigger.body }}', scope), 'x {\n  "title": "Bug"\n}');
  assert.deepEqual(render({ a: '{{ index }}', b: ['{{ item.name }}'] }, scope), { a: 2, b: ['kim'] });
});

test('filters and alternatives', () => {
  assert.equal(render('{{ input.text | upper }}', scope), 'HELLO WORLD');
  assert.equal(render('{{ input.text | truncate:5 }}', scope), 'Hello…');
  assert.equal(render('{{ input.items | pluck:"name" | join:"+" }}', scope), 'a+b');
  assert.equal(render('{{ missing || trigger.message }}', scope), '안녕');
  assert.equal(render('{{ missing | default:"none" }}', scope), 'none');
  assert.equal(render('{{ input.items | length }}', scope), 2);
  assert.equal(render('{{ input.items | json }}', scope), JSON.stringify(scope.input.items));
  assert.throws(() => render('{{ input | nope }}', scope), /Unknown filter/);
});

test('conditions compare numbers as numbers and text without case for contains', () => {
  assert.ok(compare('10', 'gt', '9'));
  assert.ok(!compare('10', 'lt', '9'));
  assert.ok(compare('Hello World', 'contains', 'world'));
  assert.ok(compare('', 'isEmpty'));
  assert.ok(compare([], 'isEmpty'));
  assert.ok(compare(0, 'isNotEmpty'));
  assert.ok(compare('abc-123', 'matches', '\\d+'));
  assert.ok(compare('true', 'isTrue'));
  assert.ok(compare('false', 'isFalse'));
  assert.ok(compare(['a', 'b'], 'contains', 'b'));
  assert.throws(() => compare(1, 'between', 2), /Unknown operator/);
});

test('references lists the paths an expression uses', () => {
  assert.deepEqual(references('A {{ nodes.X.output | upper }} B {{ "lit" }} {{ a || b }}'), ['nodes.X.output', 'a', 'b']);
});
