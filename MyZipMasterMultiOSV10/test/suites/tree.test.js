import { deepEq, eq, ok } from '../assert.js';
import { buildTree, filterItems, findNode, nextSelection, parentPath, searchAll, sortItems } from '../../src/lib/tree.js';

export const title = 'Archive tree and list';

const entries = [
  { path: 'a/b/c.txt', isDir: false, size: 100, packed: 40, mtime: 5 },
  { path: 'a/d.txt', isDir: false, size: 50, packed: 50, mtime: 9 },
  { path: 'e.bin', isDir: false, size: 7, packed: 7, mtime: 1 },
  { path: 'empty', isDir: true, mtime: 3 },
  { path: 'a', isDir: true, mtime: 2 },
];

export default async function (test) {
  await test('folders not listed are made from paths', () => {
    const root = buildTree(entries);
    ok(findNode(root, 'a/b').isDir, 'a/b is implied');
    eq(findNode(root, 'a/b').implied, true);
    eq(findNode(root, 'a').implied, false);
    eq(findNode(root, 'nope'), null);
    eq(findNode(root, ''), root);
  });
  await test(`a folder's size is the sum of its contents`, () => {
    const root = buildTree(entries);
    eq(findNode(root, 'a').size, 150);
    eq(findNode(root, 'a').packed, 90);
    eq(findNode(root, 'a').files, 2);
    eq(root.files, 3);
    eq(findNode(root, 'empty').size, 0);
  });
  await test('folder before or after its files makes no difference', () => {
    const a = buildTree([{ path: 'x', isDir: true, mtime: 1 }, { path: 'x/y', isDir: false, size: 1 }]);
    const b = buildTree([{ path: 'x/y', isDir: false, size: 1 }, { path: 'x', isDir: true, mtime: 1 }]);
    eq(findNode(a, 'x').children.size, 1);
    eq(findNode(b, 'x').children.size, 1);
    eq(findNode(b, 'x').mtime, 1);
  });
  await test('odd paths do not break the tree', () => {
    const root = buildTree([{ path: '', isDir: false }, { path: '//a//b', isDir: false, size: 1 }]);
    ok(findNode(root, 'a/b'));
  });
  await test('parentPath', () => {
    eq(parentPath('a/b/c'), 'a/b');
    eq(parentPath('a'), '');
    eq(parentPath(''), '');
  });
  const items = [
    { name: 'b10.txt', isDir: false, size: 5, packed: 5, mtime: 1 },
    { name: 'b9.txt', isDir: false, size: 50, packed: 10, mtime: 3 },
    { name: 'folder', isDir: true, size: 999, mtime: 2 },
    { name: 'a.ZIP', isDir: false, size: 1, packed: 1, mtime: 9 },
  ];
  await test('sort: folders first, natural number order', () => {
    deepEq(sortItems(items, 'name', false).map((x) => x.name), ['folder', 'a.ZIP', 'b9.txt', 'b10.txt']);
    deepEq(sortItems(items, 'name', true).map((x) => x.name), ['folder', 'b10.txt', 'b9.txt', 'a.ZIP']);
  });
  await test('sort: size, ratio, date, type', () => {
    deepEq(sortItems(items, 'size', true).map((x) => x.name), ['folder', 'b9.txt', 'b10.txt', 'a.ZIP']);
    deepEq(sortItems(items, 'ratio', false).map((x) => x.name), ['folder', 'b9.txt', 'a.ZIP', 'b10.txt']);
    deepEq(sortItems(items, 'mtime', false).map((x) => x.name), ['folder', 'b10.txt', 'b9.txt', 'a.ZIP']);
    deepEq(sortItems(items, 'type', false).map((x) => x.name), ['folder', 'b9.txt', 'b10.txt', 'a.ZIP']);
  });
  await test('find by name: substring, any case, * and ?', () => {
    const names = (q) => filterItems(items, q).map((x) => x.name);
    eq(names('').length, 4);
    deepEq(names('ZIP'), ['a.ZIP']);
    deepEq(names('*.txt'), ['b10.txt', 'b9.txt']);
    deepEq(names('b?.txt'), ['b9.txt']);
    deepEq(names('nope'), []);
    deepEq(names('a.z*'), ['a.ZIP']);
    deepEq(names('(['), [], 'regex characters are plain');
  });
  await test('search the whole archive', () => {
    const root = buildTree(entries);
    deepEq(searchAll(root, '*.txt').map((x) => x.path).sort(), ['a/b/c.txt', 'a/d.txt']);
    deepEq(searchAll(root, ''), []);
  });
  await test('selection: click, Ctrl, Shift', () => {
    const keys = ['a', 'b', 'c', 'd'];
    let r = nextSelection(new Set(), keys, 'b', {});
    deepEq([...r.selected], ['b']);
    eq(r.anchor, 'b');
    r = nextSelection(r.selected, keys, 'd', { shift: true, anchor: r.anchor });
    deepEq([...r.selected], ['b', 'c', 'd']);
    eq(r.anchor, 'b', 'the anchor stays');
    r = nextSelection(r.selected, keys, 'a', { shift: true, anchor: r.anchor });
    deepEq([...r.selected], ['a', 'b']);
    r = nextSelection(r.selected, keys, 'd', { ctrl: true, anchor: r.anchor });
    deepEq([...r.selected].sort(), ['a', 'b', 'd']);
    r = nextSelection(r.selected, keys, 'a', { ctrl: true, anchor: r.anchor });
    deepEq([...r.selected].sort(), ['b', 'd']);
    r = nextSelection(new Set(['c']), keys, 'a', { shift: true, ctrl: true, anchor: 'b' });
    deepEq([...r.selected].sort(), ['a', 'b', 'c']);
  });
}
