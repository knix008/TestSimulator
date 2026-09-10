import test from 'node:test';
import assert from 'node:assert/strict';

import { maskSource, buildLineStarts } from '../src/core/text.js';
import { extractFunctions } from '../src/core/functions.js';
import { buildCallGraph, computeFanMetrics, findCircularCallChains, expandTree } from '../src/core/callGraph.js';
import { extractTypes, linkTypes } from '../src/core/structure.js';
import { buildFileRelations, buildDirectoryRelations, buildSequence, buildDataFlow } from '../src/core/relations.js';
import { csharpSource, javascriptSource, javaSource } from './fixtures.mjs';

function functionsFor(files) {
  return files.flatMap(([path, languageId, text]) =>
    extractFunctions({ path, languageId, text, masked: maskSource(text, languageId), lineStarts: buildLineStarts(text) }),
  );
}

const jsProject = [
  [
    '/p/a.js',
    'javascript',
    `
function top() {
  middle();
  leaf();
}
function middle() {
  leaf();
}
function leaf() {
  return 1;
}
function orphan() {
  return 2;
}
`,
  ],
];

test('call graph links callers to callees and drops unresolvable names', () => {
  const functions = functionsFor(jsProject);
  const graph = buildCallGraph(functions);

  const idOf = (name) => functions.find((fn) => fn.name === name).id;
  const outOf = (name) => (graph.outgoing.get(idOf(name)) || []).map((id) => graph.nodeMap.get(id).displayName).sort();

  assert.deepEqual(outOf('top'), ['leaf', 'middle']);
  assert.deepEqual(outOf('middle'), ['leaf']);
  assert.deepEqual(outOf('leaf'), []);
});

test('fan-in and fan-out reflect the edges', () => {
  const functions = functionsFor(jsProject);
  const graph = buildCallGraph(functions);
  const fan = computeFanMetrics(graph);
  const of = (name) => fan.get(functions.find((fn) => fn.name === name).id);

  assert.deepEqual(of('top'), { fanIn: 0, fanOut: 2 });
  assert.deepEqual(of('leaf'), { fanIn: 2, fanOut: 0 });
  assert.deepEqual(of('orphan'), { fanIn: 0, fanOut: 0 });
});

test('entry points fall back to unreferenced callers when no conventional main exists', () => {
  const functions = functionsFor(jsProject);
  const graph = buildCallGraph(functions);
  const names = graph.entryPointIds.map((id) => graph.nodeMap.get(id).displayName);

  assert.ok(names.includes('top'), 'top calls others and nothing calls it');
  assert.ok(!names.includes('orphan'), 'a function that calls nothing is not an entry point');
});

test('a conventional main wins over fan-in-zero roots', () => {
  const functions = functionsFor([
    ['/p/main.go', 'go', 'func main() {\n\thelper()\n}\n\nfunc helper() {\n\tother()\n}\n\nfunc other() {}\n'],
  ]);
  const graph = buildCallGraph(functions);
  const names = graph.entryPointIds.map((id) => graph.nodeMap.get(id).displayName);
  assert.deepEqual(names, ['main']);
});

test('circular call chains are found, including self-recursion', () => {
  const functions = functionsFor([
    ['/p/cycle.js', 'javascript', 'function a() { b(); }\nfunction b() { c(); }\nfunction c() { a(); }\nfunction r() { r(); }\n'],
  ]);
  const graph = buildCallGraph(functions);
  const chains = findCircularCallChains(graph);

  const mutual = chains.find((chain) => chain.length === 3);
  assert.ok(mutual, 'the three-function cycle is reported');
  assert.deepEqual(
    mutual.nodeIds.map((id) => graph.nodeMap.get(id).displayName).sort(),
    ['a', 'b', 'c'],
  );
  assert.ok(chains.some((chain) => chain.length === 1), 'self-recursion is reported too');
});

test('cycle detection terminates on a graph with no cycles', () => {
  const graph = buildCallGraph(functionsFor(jsProject));
  assert.deepEqual(findCircularCallChains(graph), []);
});

test('expandTree stops at recursion and marks the revisit', () => {
  const functions = functionsFor([['/p/r.js', 'javascript', 'function a() { b(); }\nfunction b() { a(); }\n']]);
  const graph = buildCallGraph(functions);
  const rootId = functions.find((fn) => fn.name === 'a').id;

  const tree = expandTree(graph, rootId, 10);
  assert.equal(tree.displayName, 'a');
  assert.equal(tree.children[0].displayName, 'b');
  assert.equal(tree.children[0].children[0].displayName, 'a');
  assert.equal(tree.children[0].children[0].recursive, true, 'the revisit is flagged, not expanded');
  assert.deepEqual(tree.children[0].children[0].children, []);
});

test('type extraction records classes, interfaces and inheritance edges', () => {
  const file = {
    path: '/p/UserRepository.cs',
    languageId: 'csharp',
    text: csharpSource,
    masked: maskSource(csharpSource, 'csharp'),
    lineStarts: buildLineStarts(csharpSource),
  };
  const { types, relations } = extractTypes(file);
  const names = types.map((type) => type.name);

  assert.ok(names.includes('UserRepository'));
  assert.ok(names.includes('IRepository'));
  assert.ok(names.includes('BaseRepository'));
  assert.equal(types.find((type) => type.name === 'IRepository').kind, 'interface');

  const fromRepo = relations.filter((rel) => rel.fromName === 'UserRepository');
  assert.ok(fromRepo.some((rel) => rel.toName === 'BaseRepository' && rel.kind === 'inheritance'));
  assert.ok(
    fromRepo.some((rel) => rel.toName === 'IRepository' && rel.kind === 'realization'),
    'the I-prefixed base is treated as an interface',
  );
});

test('linkTypes resolves bases across files and computes DIT / NOC', () => {
  const base = { path: '/p/base.js', languageId: 'javascript', text: 'class Base {}\n' };
  const mid = { path: '/p/mid.js', languageId: 'javascript', text: 'class Mid extends Base {}\n' };
  const leaf = { path: '/p/leaf.js', languageId: 'javascript', text: 'class Leaf extends Mid {}\n' };

  const files = [base, mid, leaf].map((file) => ({
    ...file,
    masked: maskSource(file.text, 'javascript'),
    lineStarts: buildLineStarts(file.text),
  }));

  const types = [];
  const relations = [];
  for (const file of files) {
    const extracted = extractTypes(file);
    types.push(...extracted.types);
    relations.push(...extracted.relations);
  }

  linkTypes(types, relations);
  const byName = new Map(types.map((type) => [type.name, type]));

  assert.equal(byName.get('Base').depthOfInheritance, 0);
  assert.equal(byName.get('Mid').depthOfInheritance, 1);
  assert.equal(byName.get('Leaf').depthOfInheritance, 2);
  assert.equal(byName.get('Base').numberOfChildren, 1);
  assert.equal(byName.get('Leaf').numberOfChildren, 0);
});

test('type members are attached to the type that contains them', () => {
  const file = {
    path: '/p/Order.java',
    languageId: 'java',
    text: javaSource,
    masked: maskSource(javaSource, 'java'),
    lineStarts: buildLineStarts(javaSource),
  };
  const { types } = extractTypes(file);
  const order = types.find((type) => type.name === 'Order');

  assert.ok(order, 'the entity class is found');
  assert.ok(order.attributes.some((attr) => attr.name === 'id' || attr.name === 'totalAmount'), 'fields are attached');
});

test('file and directory relations collapse the call graph correctly', () => {
  const functions = functionsFor([
    ['/p/ui/view.js', 'javascript', 'function render() { fetchData(); }\n'],
    ['/p/data/repo.js', 'javascript', 'function fetchData() { return 1; }\n'],
  ]);
  const graph = buildCallGraph(functions);

  const fileRelations = buildFileRelations(functions, graph);
  assert.equal(fileRelations.nodes.length, 2);
  assert.equal(fileRelations.edges.length, 1);
  assert.equal(fileRelations.edges[0].fromId, '/p/ui/view.js');
  assert.equal(fileRelations.edges[0].toId, '/p/data/repo.js');

  const dirRelations = buildDirectoryRelations(functions, graph);
  assert.deepEqual(dirRelations.edges.map((e) => e.fromId + '→' + e.toId), ['/p/ui→/p/data']);
});

test('buildSequence produces ordered messages with one participant per file', () => {
  const functions = functionsFor([
    ['/p/a.js', 'javascript', 'function start() { step(); }\n'],
    ['/p/b.js', 'javascript', 'function step() { finish(); }\nfunction finish() { return 1; }\n'],
  ]);
  const graph = buildCallGraph(functions);
  const rootId = functions.find((fn) => fn.name === 'start').id;

  const sequence = buildSequence(graph, rootId, functions);
  assert.equal(sequence.participants.length, 2);
  assert.deepEqual(sequence.messages.map((m) => m.label), ['step', 'finish']);
  assert.equal(sequence.messages[0].depth, 0);
  assert.equal(sequence.messages[1].depth, 1);
});

test('buildDataFlow separates callers/reads from callees/writes', () => {
  const functions = functionsFor([['/p/f.js', 'javascript', 'function caller() { focus(); }\nfunction focus() { callee(); }\nfunction callee() {}\n']]);
  const graph = buildCallGraph(functions);
  const focusId = functions.find((fn) => fn.name === 'focus').id;

  const flow = buildDataFlow(graph, focusId, {
    functions,
    globalAccesses: [{ functionId: focusId, globalVariableId: 'g1', variableName: 'STATE', kind: 'write' }],
    tableAccesses: [{ functionId: focusId, tableId: 'table:users', kind: 'read' }],
    tables: [{ id: 'table:users', name: 'users' }],
  });

  assert.equal(flow.focus.label, 'focus');
  assert.ok(flow.inputs.some((item) => item.label === 'caller'));
  assert.ok(flow.inputs.some((item) => item.label === 'users'), 'a table read is an input');
  assert.ok(flow.outputs.some((item) => item.label === 'callee'));
  assert.ok(flow.outputs.some((item) => item.label === 'STATE'), 'a global write is an output');
});

test('call detection ignores library noise and control keywords', () => {
  const functions = functionsFor([
    ['/p/n.js', 'javascript', 'function work() {\n  if (x) { console.log(1); }\n  for (;;) { helper(); }\n}\nfunction helper() {}\n'],
  ]);
  const graph = buildCallGraph(functions);
  const workId = functions.find((fn) => fn.name === 'work').id;
  const callees = (graph.outgoing.get(workId) || []).map((id) => graph.nodeMap.get(id).displayName);

  assert.deepEqual(callees, ['helper']);
});

test('a callee defined in the same file wins over a same-named one elsewhere', () => {
  const functions = functionsFor([
    ['/p/one.js', 'javascript', 'function caller() { shared(); }\nfunction shared() { return 1; }\n'],
    ['/p/two.js', 'javascript', 'function shared() { return 2; }\n'],
  ]);
  const graph = buildCallGraph(functions);
  const callerId = functions.find((fn) => fn.name === 'caller').id;
  const target = graph.nodeMap.get(graph.outgoing.get(callerId)[0]);

  assert.equal(target.filePath, '/p/one.js');
});
