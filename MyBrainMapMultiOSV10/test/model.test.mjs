// The map model: edits are path-copying (untouched branches shared), the
// structure operations keep the tree valid, and find / filter / numbering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newMap, makeTopic, addChild, addSibling, addFloating, addCallout, removeTopics, moveTopic, makeFloatingAt, insertParent,
  shiftTopic, indentTopic, outdentTopic, setCollapsed, expandToLevel, findTopic, entryOf, isWithin, setText, setStyle,
  addRelationship, copyFragment, pasteFragment, topicsFromText, textOfTopics, findTopics, replaceInTopics, filterTopics,
  numberingOf, normalizeMap, countTopics, sortChildren, setTask, allTopics, mapTitle,
} from '../src/lib/model.js';

function sample() {
  let map = newMap({ title: 'Root' });
  const a = addChild(map, map.root.id, makeTopic('A')); map = a.map;
  const b = addChild(map, map.root.id, makeTopic('B')); map = b.map;
  const a1 = addChild(map, a.id, makeTopic('A1')); map = a1.map;
  const a2 = addChild(map, a.id, makeTopic('A2')); map = a2.map;
  return { map, a: a.id, b: b.id, a1: a1.id, a2: a2.id };
}

test('edits copy only the path to the changed topic', () => {
  const { map, a1, b } = sample();
  const next = setText(map, a1, 'changed');
  assert.notEqual(next, map);
  assert.equal(findTopic(next, a1).text, 'changed');
  assert.equal(findTopic(map, a1).text, 'A1', 'the old map is untouched');
  assert.equal(findTopic(next, b), findTopic(map, b), 'other branches are shared');
  assert.equal(setText(next, a1, 'changed'), next, 'a no-op returns the same map');
});

test('siblings, floating topics, callouts and parents', () => {
  let { map, a, a1 } = sample();
  const s = addSibling(map, a1, makeTopic('A1.5')); map = s.map;
  assert.deepEqual(findTopic(map, a).children.map((c) => c.text), ['A1', 'A1.5', 'A2']);
  const before = addSibling(map, a1, makeTopic('A0'), { before: true }); map = before.map;
  assert.equal(findTopic(map, a).children[0].text, 'A0');
  const f = addFloating(map, makeTopic('F'), 100, 50); map = f.map;
  assert.equal(entryOf(map, f.id).kind, 'floating');
  const c = addCallout(map, a1, makeTopic('note')); map = c.map;
  assert.equal(entryOf(map, c.id).kind, 'callout');
  const p = insertParent(map, a1, makeTopic('P')); map = p.map;
  assert.equal(entryOf(map, a1).parent, p.id);
  assert.equal(entryOf(map, p.id).parent, a);
});

test('remove drops subtrees and the relationships that touched them', () => {
  let { map, a, a1, b } = sample();
  map = addRelationship(map, a1, b).map;
  assert.equal(map.relationships.length, 1);
  const r = removeTopics(map, [a, a1]);
  assert.equal(findTopic(r.map, a), null);
  assert.equal(findTopic(r.map, a1), null);
  assert.equal(r.map.relationships.length, 0);
  assert.equal(removeTopics(map, [map.root.id]).map, map, 'the root stays');
});

test('move refuses cycles and adjusts indexes among siblings', () => {
  let { map, a, a1, a2, b } = sample();
  assert.equal(moveTopic(map, a, a1, 0), map, 'no move into its own subtree');
  map = moveTopic(map, a1, a, 2);
  assert.deepEqual(findTopic(map, a).children.map((c) => c.text), ['A2', 'A1']);
  map = moveTopic(map, a2, b, 0);
  assert.equal(entryOf(map, a2).parent, b);
  map = makeFloatingAt(map, a2, 10, 20);
  assert.equal(entryOf(map, a2).kind, 'floating');
  assert.equal(findTopic(map, a2).x, 10);
  map = moveTopic(map, a2, a, 0);
  assert.equal(findTopic(map, a2).x, undefined, 'a floating topic loses its position when attached');
});

test('shift / indent / outdent / collapse / expand to level', () => {
  let { map, a, a1, a2 } = sample();
  map = shiftTopic(map, a2, -1);
  assert.deepEqual(findTopic(map, a).children.map((c) => c.text), ['A2', 'A1']);
  map = indentTopic(map, a1);
  assert.equal(entryOf(map, a1).parent, a2);
  map = outdentTopic(map, a1);
  assert.equal(entryOf(map, a1).parent, a);
  map = setCollapsed(map, [a], true);
  assert.equal(findTopic(map, a).collapsed, true);
  map = expandToLevel(map, null);
  assert.equal(findTopic(map, a).collapsed, undefined);
  map = expandToLevel(map, 1);
  assert.equal(findTopic(map, a).collapsed, true);
  assert.ok(isWithin(map, a1, a));
});

test('copy / paste keeps the shape and gives fresh ids', () => {
  let { map, a, b } = sample();
  const frag = copyFragment(map, [a]);
  const r = pasteFragment(map, b, JSON.parse(JSON.stringify(frag)));
  map = r.map;
  const pasted = findTopic(map, r.ids[0]);
  assert.equal(pasted.text, 'A');
  assert.equal(pasted.children.length, 2);
  assert.notEqual(pasted.id, a);
  assert.equal(countTopics(map), 8);
});

test('text outlines become topics', () => {
  const tops = topicsFromText('Fruit\n\tApple\n\tPear\n\t\tWilliams\nVeg\n  - Carrot');
  assert.equal(tops.length, 2);
  assert.equal(tops[0].children[1].children[0].text, 'Williams');
  assert.equal(tops[1].children[0].text, 'Carrot');
  assert.equal(textOfTopics(tops), 'Fruit\n\tApple\n\tPear\n\t\tWilliams\nVeg\n\tCarrot');
});

test('find, replace and filter', () => {
  let { map, a1 } = sample();
  map = setTask(map, [a1], { priority: 1, due: '2000-01-01', progress: 50 });
  assert.deepEqual(findTopics(map, 'a1').length, 1);
  assert.deepEqual(findTopics(map, 'A', { caseSensitive: true }).length, 3);
  assert.equal(findTopics(map, 'A\\d', { regex: true }).length, 2);
  const r = replaceInTopics(map, findTopics(map, 'A'), 'A', 'Z', { caseSensitive: true });
  assert.equal(r.count, 3);
  const f = filterTopics(map, { priority: [1] });
  assert.ok(f.hits.has(a1));
  assert.equal(f.hits.size, 1);
  const overdue = filterTopics(map, { due: 'overdue' });
  assert.ok(overdue.hits.has(a1));
});

test('numbering, sorting, styles and normalization', () => {
  let { map, a, a2 } = sample();
  map = { ...map, numbering: { enabled: true, style: 'decimal', depth: 3 } };
  assert.equal(numberingOf(map, a2), '1.2.');
  map = sortChildren(map, [a], { descending: true });
  assert.equal(findTopic(map, a).children[0].text, 'A2');
  map = setStyle(map, [a], { fill: '#ff0000', bold: true });
  assert.deepEqual(findTopic(map, a).style, { fill: '#ff0000', bold: true });
  map = setStyle(map, [a], { fill: '', bold: null });
  assert.equal(findTopic(map, a).style, undefined);
  const broken = { root: { id: 'x', text: 'R', children: [{ id: 'x', text: 'dup' }, 'plain'] }, relationships: [{ from: 'x', to: 'nope' }] };
  const fixed = normalizeMap(broken);
  const ids = allTopics(fixed).map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(fixed.root.children[1].text, 'plain');
  assert.equal(fixed.relationships.length, 0);
  assert.equal(mapTitle(fixed), 'R');
});
