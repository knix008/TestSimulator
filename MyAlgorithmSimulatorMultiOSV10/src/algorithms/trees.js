import { L, record, parseKeyed, parseNumbers, parseInteger, randomArray, randInt, InputError, copy } from './core.js';

/** Tree view snapshot: nodes [{ id, key, left, right }] (ids are insertion order). */
function treeView(nodes, root, { colors = {}, lists = [], probe = null, edgeHint = null } = {}) {
  return { kind: 'tree', nodes: nodes.map((x) => ({ ...x })), root, colors: { ...colors }, lists: copy(lists), probe, edgeHint };
}

function bstInput(def, { search = true } = {}) {
  return {
    default: def,
    hint: search
      ? L('첫 줄: 삽입할 키 (1~31개), 둘째 줄: search: 찾을 키', 'Line 1: keys to insert (1–31), line 2: search: key to find')
      : L('삽입할 키 목록 (1~31개)', 'Keys to insert (1–31)'),
    parse(text) {
      const { keys, rest } = parseKeyed(text);
      const values = parseNumbers(rest.join(' '), { min: 1, max: 31, lo: -999, hi: 999 });
      if (!search) return { values };
      if (keys.search === undefined) throw new InputError('search: 찾을 키를 입력하세요.', 'Enter search: key to find.');
      return { values, search: parseInteger(keys.search, 'search', -999, 999) };
    },
    random() {
      const values = [...new Set(randomArray(randInt(8, 13), 1, 99))];
      return search ? `${values.join(', ')}\nsearch: ${Math.random() < 0.7 ? values[randInt(0, values.length - 1)] : randInt(1, 99)}` : values.join(', ');
    },
  };
}

/** Plain BST insertion without frames (used to build the tree for the traversals). */
function buildBst(values) {
  const nodes = [];
  let root = null;
  for (const key of values) {
    if (root === null) { nodes.push({ id: 0, key, left: null, right: null }); root = 0; continue; }
    let cur = root;
    for (;;) {
      const node = nodes[cur];
      if (key === node.key) break;
      const side = key < node.key ? 'left' : 'right';
      if (node[side] === null) { nodes.push({ id: nodes.length, key, left: null, right: null }); node[side] = nodes.length - 1; break; }
      cur = node[side];
    }
  }
  return { nodes, root };
}

export const bst = {
  id: 'bst', category: 'tree', view: 'tree',
  name: L('이진 탐색 트리 (BST)', 'Binary Search Tree'),
  summary: L('왼쪽은 작게, 오른쪽은 크게 — 삽입과 탐색을 봅니다.', 'Smaller to the left, larger to the right: insert and search.'),
  description: L(
    '이진 탐색 트리는 모든 노드에서 **왼쪽 서브트리의 키 < 노드의 키 < 오른쪽 서브트리의 키** 가 성립하는 트리입니다. 루트부터 비교하며 내려가면 삽입·탐색·삭제를 트리 높이만큼의 시간에 할 수 있습니다.\n\n균형이 잘 맞으면 O(log n) 이지만, 정렬된 순서로 넣으면 한쪽으로 치우쳐 O(n) 이 됩니다(AVL, 레드-블랙 트리가 이를 해결합니다). 같은 키는 다시 넣지 않습니다.',
    'In a binary search tree every node satisfies **left subtree keys < node key < right subtree keys**. Walking down from the root and comparing, insert, search and delete take time proportional to the height.\n\nA balanced tree gives O(log n), but inserting sorted keys makes a degenerate O(n) chain (AVL and red–black trees fix that). Duplicate keys are ignored.'),
  complexity: { best: 'O(log n)', average: 'O(log n)', worst: 'O(n)', space: 'O(n)' },
  traits: L('자료구조 · 재귀', 'Data structure · Recursion'),
  input: bstInput('50, 30, 70, 20, 40, 60, 80, 35, 45, 65\nsearch: 45'),
  pseudo: [
    'procedure insert(node, key)',
    '  if node = null: return new Node(key)',
    '  if key < node.key: node.left ← insert(node.left, key)',
    '  else if key > node.key: node.right ← insert(node.right, key)',
    '  return node',
    'procedure search(node, key)',
    '  if node = null: return "not found"',
    '  if key = node.key: return node',
    '  if key < node.key: return search(node.left, key)',
    '  return search(node.right, key)',
  ],
  run({ values, search }) {
    return record((r) => {
      const nodes = [];
      let root = null;
      const inserted = [];
      const lists = () => [{ label: L('삽입한 키', 'Inserted'), items: inserted.map(String) }];
      r.step(0, L('빈 트리에서 시작합니다.', 'Start with an empty tree.'), treeView(nodes, root, { lists: lists() }), {});
      for (const key of values) {
        if (root === null) {
          nodes.push({ id: 0, key, left: null, right: null });
          root = 0;
          inserted.push(key);
          r.step(1, L(`트리가 비어 있으므로 ${key} 가 루트가 됩니다.`, `The tree is empty: ${key} becomes the root.`), treeView(nodes, root, { colors: { 0: 'write' }, lists: lists() }), { key });
          continue;
        }
        let cur = root;
        const path = {};
        for (;;) {
          const node = nodes[cur];
          path[cur] = 'visited';
          if (key === node.key) {
            r.step(3, L(`${key} 는 이미 있으므로 넣지 않습니다.`, `${key} is already there: skip.`), treeView(nodes, root, { colors: { ...path, [cur]: 'error' }, lists: lists() }), { key, node: node.key });
            break;
          }
          const side = key < node.key ? 'left' : 'right';
          r.step(side === 'left' ? 2 : 3, L(`${key} ${side === 'left' ? '<' : '>'} ${node.key} → ${side === 'left' ? '왼쪽' : '오른쪽'}으로`, `${key} ${side === 'left' ? '<' : '>'} ${node.key} → go ${side}`), treeView(nodes, root, { colors: { ...path, [cur]: 'compare' }, lists: lists(), probe: { key, at: cur } }), { key, node: node.key });
          if (node[side] === null) {
            nodes.push({ id: nodes.length, key, left: null, right: null });
            node[side] = nodes.length - 1;
            inserted.push(key);
            r.step(1, L(`빈 자리에 ${key} 삽입`, `Insert ${key} into the empty spot`), treeView(nodes, root, { colors: { ...path, [nodes.length - 1]: 'write' }, lists: lists() }), { key });
            break;
          }
          cur = node[side];
        }
      }
      r.step(4, L(`트리 완성 (노드 ${nodes.length}개). 이제 ${search} 를 찾습니다.`, `Tree built (${nodes.length} nodes). Now search for ${search}.`), treeView(nodes, root, { lists: lists() }), { search });
      let cur = root;
      const path = {};
      let steps = 0;
      while (cur !== null) {
        const node = nodes[cur];
        steps++;
        if (search === node.key) {
          r.step(7, L(`${search} 를 찾았습니다! (비교 ${steps}번)`, `Found ${search}! (${steps} comparisons)`), treeView(nodes, root, { colors: { ...path, [cur]: 'found' }, lists: lists() }), { search, comparisons: steps, result: 'found' });
          return;
        }
        const left = search < node.key;
        r.step(left ? 8 : 9, L(`${search} ${left ? '<' : '>'} ${node.key} → ${left ? '왼쪽' : '오른쪽'} 서브트리`, `${search} ${left ? '<' : '>'} ${node.key} → ${left ? 'left' : 'right'} subtree`), treeView(nodes, root, { colors: { ...path, [cur]: 'compare' }, lists: lists(), probe: { key: search, at: cur } }), { search, node: node.key });
        path[cur] = 'visited';
        cur = left ? node.left : node.right;
      }
      r.step(6, L(`null 에 도달: ${search} 는 트리에 없습니다.`, `Reached null: ${search} is not in the tree.`), treeView(nodes, root, { colors: path, lists: lists() }), { search, comparisons: steps, result: 'not found' });
    });
  },
};

export const treeTraversal = {
  id: 'tree-traversal', category: 'tree', view: 'tree',
  name: L('트리 순회', 'Tree Traversals'),
  summary: L('전위·중위·후위·레벨 순서로 모든 노드를 방문합니다.', 'Pre-order, in-order, post-order and level-order.'),
  description: L(
    '이진 트리의 모든 노드를 한 번씩 방문하는 네 가지 방법입니다.\n\n- **전위(pre-order)**: 노드 → 왼쪽 → 오른쪽 (트리 복사, 직렬화)\n- **중위(in-order)**: 왼쪽 → 노드 → 오른쪽 (BST 에서는 **정렬된 순서**)\n- **후위(post-order)**: 왼쪽 → 오른쪽 → 노드 (트리 삭제, 수식 계산)\n- **레벨 순서(level-order)**: 위에서 아래로, 왼쪽에서 오른쪽으로 (큐 사용, BFS)\n\n입력한 키로 이진 탐색 트리를 만든 뒤 네 순회를 차례로 보여 줍니다.',
    'Four ways to visit every node of a binary tree once.\n\n- **Pre-order**: node → left → right (copying, serialising)\n- **In-order**: left → node → right (**sorted order** in a BST)\n- **Post-order**: left → right → node (deleting, evaluating expressions)\n- **Level-order**: top to bottom, left to right (a queue, i.e. BFS)\n\nThe keys you enter build a binary search tree, then the four traversals run in turn.'),
  complexity: { best: 'O(n)', average: 'O(n)', worst: 'O(n)', space: 'O(h)' },
  traits: L('재귀 · 큐', 'Recursion · Queue'),
  input: bstInput('50, 30, 70, 20, 40, 60, 80', { search: false }),
  pseudo: [
    'procedure preorder(n)',
    '  if n = null: return',
    '  visit(n); preorder(n.left); preorder(n.right)',
    'procedure inorder(n)',
    '  if n = null: return',
    '  inorder(n.left); visit(n); inorder(n.right)',
    'procedure postorder(n)',
    '  if n = null: return',
    '  postorder(n.left); postorder(n.right); visit(n)',
    'procedure levelOrder(root)',
    '  Q ← [root]',
    '  while Q is not empty: n ← Q.dequeue(); visit(n); enqueue n.left, n.right',
  ],
  run({ values }) {
    const { nodes, root } = buildBst(values);
    return record((r) => {
      const results = { pre: [], in: [], post: [], level: [] };
      const names = { pre: L('전위', 'Pre-order'), in: L('중위', 'In-order'), post: L('후위', 'Post-order'), level: L('레벨 순서', 'Level-order') };
      const lists = (extra = []) => [...Object.entries(results).map(([k, items]) => ({ label: names[k], items: items.map(String) })), ...extra];
      r.step(0, L('입력한 키로 이진 탐색 트리를 만들었습니다.', 'A binary search tree built from the keys.'), treeView(nodes, root, { lists: lists() }), {});
      const orders = [['pre', 2], ['in', 5], ['post', 8]];
      for (const [kind, line] of orders) {
        const colors = {};
        const stack = [];
        r.step(line - 2, L(`${names[kind].ko} 순회를 시작합니다.`, `Start the ${names[kind].en} traversal.`), treeView(nodes, root, { lists: lists() }), {});
        const walk = (id) => {
          if (id === null) return;
          const node = nodes[id];
          stack.push(node.key);
          colors[id] = colors[id] === 'done' ? 'done' : 'compare';
          const visit = () => {
            results[kind].push(node.key);
            colors[id] = 'done';
            r.step(line, L(`${names[kind].ko}: ${node.key} 방문`, `${names[kind].en}: visit ${node.key}`), treeView(nodes, root, { colors: { ...colors, [id]: 'current' }, lists: lists([{ label: L('호출 스택', 'Call stack'), items: stack.map(String) }]) }), { node: node.key });
          };
          if (kind === 'pre') visit();
          walk(node.left);
          if (kind === 'in') visit();
          walk(node.right);
          if (kind === 'post') visit();
          stack.pop();
        };
        walk(root);
      }
      const colors = {};
      const q = [root];
      r.step(10, L('레벨 순서 순회: 루트를 큐에 넣습니다.', 'Level-order: enqueue the root.'), treeView(nodes, root, { lists: lists([{ label: L('큐', 'Queue'), items: [String(nodes[root].key)] }]) }), {});
      while (q.length) {
        const id = q.shift();
        const node = nodes[id];
        results.level.push(node.key);
        colors[id] = 'done';
        if (node.left !== null) q.push(node.left);
        if (node.right !== null) q.push(node.right);
        r.step(11, L(`${node.key} 방문, 자식을 큐에 넣습니다.`, `Visit ${node.key}, enqueue its children.`), treeView(nodes, root, { colors: { ...colors, [id]: 'current' }, lists: lists([{ label: L('큐', 'Queue'), items: q.map((x) => String(nodes[x].key)) }]) }), { node: node.key });
      }
      r.step(11, L('네 가지 순회를 모두 마쳤습니다.', 'All four traversals are done.'), treeView(nodes, root, { colors, lists: lists() }), {});
    });
  },
};

export const TREES = [bst, treeTraversal];
