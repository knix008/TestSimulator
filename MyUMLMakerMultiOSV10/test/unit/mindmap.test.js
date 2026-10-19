// Mind maps (src/domain/mindmap.js): adding topics, collapsing branches, laying the map out.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as MM from '../../src/domain/mindmap.js';

/** A project with a mind map diagram showing one central topic. */
function freshMap() {
  const project = M.createProject({ language: 'en' });
  const map = M.addElement(project, project._id, 'MMMindmap', { name: 'Map' });
  const diagram = M.addElement(project, map._id, 'MMMindmapDiagram', { name: 'Map' });
  const central = M.addElement(project, map._id, 'MMNode', { name: 'Central' });
  const view = M.addView(diagram, M.createNodeView('MMNodeView', central._id, { x: 400, y: 300, w: 120, h: 44 }));
  return { project, diagram, central, view };
}
const overlap = (a, b) => a.left < b.left + (b.width || 120) && b.left < a.left + (a.width || 120) && a.top < b.top + (b.height || 34) && b.top < a.top + (a.height || 34);
const index = (project) => M.buildIndex(project);

test('Tab adds a subtopic, Enter a topic after it; on the central topic Enter adds a main topic', () => {
  const { project, diagram, central, view } = freshMap();
  const a = MM.addTopic(project, diagram, view._id, 'child', { name: 'A' });
  assert.equal(index(project).parent(a.element._id)._id, central._id, 'a subtopic of the central topic');
  const b = MM.addTopic(project, diagram, a.view._id, 'sibling', { name: 'B' });
  assert.deepEqual(central.ownedElements.filter(MM.isTopic).map((e) => e.name), ['A', 'B'], 'Enter: after A, same parent');
  const c = MM.addTopic(project, diagram, view._id, 'sibling', { name: 'C' });
  assert.equal(index(project).parent(c.element._id)._id, central._id, 'Enter on the central topic: a main topic');
  const a1 = MM.addTopic(project, diagram, a.view._id, 'child', { name: 'A1' });
  assert.equal(index(project).parent(a1.element._id)._id, a.element._id);
  // Every new topic comes with its view and a branch from its parent's view.
  const branches = diagram.ownedViews.filter((v) => v._type === 'MMEdgeView');
  assert.equal(branches.length, 4);
  assert.ok(branches.some((e) => M.refId(e.tail) === a.view._id && M.refId(e.head) === a1.view._id));
  assert.equal(b.view._type, 'MMNodeView');
});

test('collapsing a topic hides its branch (views and lines); adding under it opens it', () => {
  const { project, diagram, view } = freshMap();
  const a = MM.addTopic(project, diagram, view._id, 'child', { name: 'A' });
  const a1 = MM.addTopic(project, diagram, a.view._id, 'child', { name: 'A1' });
  const a11 = MM.addTopic(project, diagram, a1.view._id, 'child', { name: 'A11' });
  assert.equal(MM.hiddenViews(diagram, index(project)).size, 0);
  assert.equal(MM.toggleCollapsed(project, a.element._id), true);
  const hidden = MM.hiddenViews(diagram, index(project));
  assert.ok(hidden.has(a1.view._id) && hidden.has(a11.view._id) && !hidden.has(a.view._id), 'everything below A, not A');
  assert.equal([...hidden].filter((id) => diagram.ownedViews.find((v) => v._id === id)._type === 'MMEdgeView').length, 2, 'and the two branches below A');
  assert.equal(MM.descendantCount(a.element), 2);
  assert.equal(MM.toggleCollapsed(project, a11.element._id), null, 'a topic without subtopics does not collapse');
  MM.addTopic(project, diagram, a.view._id, 'child', { name: 'A2' });
  assert.equal(a.element.collapsed, undefined, 'adding a subtopic opens the branch');
  assert.equal(MM.collapseToLevel(project, diagram, 1) > 0, true);
  assert.equal(a.element.collapsed, true, 'level 1: main topics collapse');
});

test('map layout: main topics on both sides, nothing overlaps, the central topic stays', () => {
  const { project, diagram, view } = freshMap();
  const mains = ['A', 'B', 'C', 'D', 'E'].map((name) => MM.addTopic(project, diagram, view._id, 'child', { name }));
  for (const m of mains.slice(0, 3)) for (const name of ['1', '2', '3']) MM.addTopic(project, diagram, m.view._id, 'child', { name: m.element.name + name });
  MM.layoutMindmap(project, diagram);
  assert.deepEqual([view.left, view.top], [400, 300], 'the central topic does not move');
  const topics = diagram.ownedViews.filter((v) => v._type === 'MMNodeView');
  for (let i = 0; i < topics.length; i++) for (let j = i + 1; j < topics.length; j++) assert.ok(!overlap(topics[i], topics[j]), `topics ${i} and ${j} overlap`);
  const sides = mains.map((m) => Math.sign(m.view.left - view.left));
  assert.ok(sides.includes(1) && sides.includes(-1), `both sides used: ${sides}`);
  // A main topic's subtopics are on its side, further out.
  const a = mains[0];
  const kids = diagram.ownedViews.filter((v) => v._type === 'MMEdgeView' && M.refId(v.tail) === a.view._id).map((e) => diagram.ownedViews.find((v) => v._id === M.refId(e.head)));
  const out = Math.sign(a.view.left - view.left);
  assert.ok(kids.every((k) => Math.sign(k.left - a.view.left) === out), 'subtopics further out on the same side');
  // A fixed direction wins.
  mains[1].element.direction = 'left';
  MM.layoutMindmap(project, diagram);
  assert.ok(mains[1].view.left < view.left, 'direction: left');
});

test('right, down and free layouts; collapsed branches take no room', () => {
  const { project, diagram, view } = freshMap();
  const mains = ['A', 'B', 'C'].map((name) => MM.addTopic(project, diagram, view._id, 'child', { name }));
  for (const name of ['1', '2', '3', '4']) MM.addTopic(project, diagram, mains[0].view._id, 'child', { name });
  MM.layoutMindmap(project, diagram, new Map(), { layout: 'right' });
  assert.ok(mains.every((m) => m.view.left > view.left), 'right: all main topics right of the centre');
  const tall = mains[2].view.top - mains[0].view.top;
  MM.toggleCollapsed(project, mains[0].element._id, true);
  MM.layoutMindmap(project, diagram, new Map(), { layout: 'right' });
  assert.ok(mains[2].view.top - mains[0].view.top < tall, 'a collapsed branch is shorter');
  MM.layoutMindmap(project, diagram, new Map(), { layout: 'down' });
  assert.ok(mains.every((m) => m.view.top > view.top + 44), 'down: main topics below the centre');
  const tops = new Set(mains.map((m) => m.view.top));
  assert.equal(tops.size, 1, 'one row');
  const before = mains.map((m) => [m.view.left, m.view.top]);
  assert.equal(MM.layoutMindmap(project, diagram, new Map(), { layout: 'free' }), 0);
  assert.deepEqual(mains.map((m) => [m.view.left, m.view.top]), before, 'free: nothing moves');
});
