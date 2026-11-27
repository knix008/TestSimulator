// The centre's pane tree (src/workspace/layout.js): open, split, close, move, normalise, save/restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLeaf, allTabs, closeTab, deserialize, dropZone, emptyLayout, leaves, moveTab, newTab, openTab, serialize, splitLeaf } from '../../src/workspace/layout.js';

test('open replaces the unpinned tab, newTab adds one', () => {
  const l = emptyLayout();
  openTab(l, newTab({ kind: 'note', path: 'A.md' }));
  assert.equal(allTabs(l).length, 1);
  assert.equal(allTabs(l)[0].path, 'A.md');
  openTab(l, newTab({ kind: 'note', path: 'B.md' }), { newTab: true });
  assert.deepEqual(allTabs(l).map((t) => t.path), ['A.md', 'B.md']);
  allTabs(l)[1].pinned = true;
  openTab(l, newTab({ kind: 'note', path: 'C.md' }));
  assert.deepEqual(allTabs(l).map((t) => t.path), ['A.md', 'B.md', 'C.md']);
});

test('split, move to an edge, close and normalise', () => {
  const l = emptyLayout();
  openTab(l, newTab({ kind: 'note', path: 'A.md' }));
  const first = activeLeaf(l);
  const right = splitLeaf(l, first.id, 'row', newTab({ kind: 'note', path: 'B.md' }));
  splitLeaf(l, right.id, 'row', newTab({ kind: 'note', path: 'C.md' }));
  assert.equal(l.root.type, 'split');
  assert.equal(l.root.children.length, 3, 'same-direction splits merge');
  assert.ok(Math.abs(l.root.sizes.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const down = splitLeaf(l, first.id, 'column', newTab({ kind: 'graph' }));
  assert.equal([...leaves(l.root)].length, 4);
  const tab = down.tabs[0];
  moveTab(l, tab.id, right.id, {});
  assert.equal([...leaves(l.root)].length, 3);
  assert.equal(l.root.children.length, 3);
  const c = allTabs(l).find((t) => t.path === 'C.md');
  closeTab(l, c.id);
  assert.equal([...leaves(l.root)].length, 2);
  const restored = deserialize(serialize(l));
  assert.deepEqual(allTabs(restored).map((t) => t.path ?? t.kind).sort(), allTabs(l).map((t) => t.path ?? t.kind).sort());
  assert.equal(deserialize({ root: { type: 'split', children: [] } }).root.type, 'leaf');
});

test('drop zones', () => {
  const r = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(dropZone(r, 50, 50), 'center');
  assert.equal(dropZone(r, 5, 50), 'left');
  assert.equal(dropZone(r, 95, 50), 'right');
  assert.equal(dropZone(r, 50, 3), 'top');
  assert.equal(dropZone(r, 50, 97), 'bottom');
});
