// More classroom algorithms: grid searches, backtracking, greedy and tree structures.
// Every algorithm follows core.js: frames of { line, msg, view, vars }.
import { L, record, InputError, parseKeyed, parseNumbers, parseInteger, randInt, randomArray, shuffle } from './core.js';
import { parseGrid, randomGrid } from './pathfinding.js';

/**
 * Like record(), but stops showing steps after `cap` frames while the algorithm keeps
 * running, so the last frame is always the real answer. `view` is passed as a function
 * so skipped steps cost nothing.
 */
function recordCapped(body, cap = 4500) {
  return record((r) => {
    let shown = 0;
    let skipped = false;
    const step = (line, msg, view, vars = {}) => {
      if (shown < cap) { shown += 1; r.step(line, msg, view(), vars); return; }
      if (!skipped) {
        skipped = true;
        r.step(line, L('단계가 많아 중간 과정은 건너뛰고 결과로 갑니다.', 'Too many steps: skipping ahead to the result.'), view(), vars);
      }
    };
    const final = (line, msg, view, vars = {}) => r.step(line, msg, view(), vars);
    body(step, final);
  });
}

const cellName = (i, cols) => `(${Math.floor(i / cols)}, ${i % cols})`;
const neighboursOf = (u, rows, cols) => {
  const ur = Math.floor(u / cols);
  const uc = u % cols;
  return [[ur - 1, uc], [ur, uc + 1], [ur + 1, uc], [ur, uc - 1]]
    .filter(([vr, vc]) => vr >= 0 && vc >= 0 && vr < rows && vc < cols)
    .map(([vr, vc]) => vr * cols + vc);
};
const pathTo = (parent, goal) => { const path = []; for (let x = goal; x >= 0; x = parent[x]) path.push(x); return path.reverse(); };

const GRID_DEFAULT = [
  '....#...............',
  '.S..#.....#####.....',
  '....#.........#.....',
  '....#####.....#..G..',
  '..............#.....',
  '.......####...#.....',
  '..........#.........',
  '..........#.........',
].join('\n');
const GRID_HINT = L('S = 시작, G = 목표, # = 벽, . = 빈칸. 격자를 클릭해 벽을 바꿀 수 있습니다.', 'S = start, G = goal, # = wall, . = open. Click the grid to toggle walls.');

// ───────────────────────── BFS on a grid

export const gridBfs = {
  id: 'grid-bfs', category: 'path', view: 'grid',
  name: L('BFS 미로 최단 경로', 'BFS Maze Shortest Path'),
  summary: L('가까운 칸부터 한 겹씩 넓혀 최단 경로를 찾습니다.', 'Expands ring by ring to find the shortest path.'),
  description: L(
    '**너비 우선 탐색(BFS)** 은 큐를 써서 시작 칸에서 **거리 1, 2, 3 … 인 칸을 차례로** 방문합니다. 모든 이동 비용이 같은 격자에서는 목표에 처음 닿는 순간의 거리가 곧 **최단 거리**입니다.\n\n칸 안의 숫자는 시작 칸에서의 거리입니다. A* 와 비교하면 목표 방향을 모르기 때문에 사방으로 고르게 퍼지는 모습을 볼 수 있습니다. 격자를 **클릭**하면 벽을 놓거나 지울 수 있습니다.',
    '**Breadth-first search (BFS)** uses a queue to visit the cells at **distance 1, 2, 3 …** from the start in turn. When every move costs the same, the distance at which it first reaches the goal is the **shortest distance**.\n\nThe number in a cell is its distance from the start. Compared with A*, it has no sense of direction and spreads evenly in every direction. **Click** the grid to add or remove walls.'),
  complexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)', space: 'O(V)' },
  traits: L('큐 · 최단 경로 · 격자', 'Queue · Shortest path · Grid'),
  input: { default: GRID_DEFAULT, hint: GRID_HINT, parse: parseGrid, random: randomGrid },
  pseudo: [
    'procedure BFS(grid, start, goal)',
    '  dist[start] ← 0; queue ← [start]',
    '  while queue is not empty',
    '    u ← dequeue',
    '    if u = goal: return dist[u] and the path',
    '    for each neighbour v of u (up, right, down, left)',
    '      if v is not a wall and not seen yet',
    '        dist[v] ← dist[u] + 1; parent[v] ← u; enqueue v',
    '  return "no path"',
  ],
  run(grid) {
    const { rows, cols, start, goal } = grid;
    const total = rows * cols;
    const wall = new Set(grid.walls);
    return recordCapped((step, final) => {
      const dist = new Array(total).fill(null);
      const parent = new Array(total).fill(-1);
      const cells = new Array(total).fill('');
      for (const i of wall) cells[i] = 'wall';
      const view = (extra = {}) => () => ({ kind: 'grid', rows, cols, start, goal, cells: [...cells], values: [...dist], path: [], ...extra });
      const queue = [start];
      let head = 0;
      dist[start] = 0;
      cells[start] = 'open';
      step(1, L('시작 칸을 큐에 넣습니다. 거리 0.', 'Put the start cell in the queue. Distance 0.'), view(), { queue: 1 });
      while (head < queue.length) {
        const u = queue[head++];
        cells[u] = 'closed';
        step(3, L(`큐에서 ${cellName(u, cols)} 을(를) 꺼냅니다. 거리 ${dist[u]}`, `Dequeue ${cellName(u, cols)}. Distance ${dist[u]}`), view({ current: u }), { u: cellName(u, cols), dist: dist[u], queue: queue.length - head });
        if (u === goal) {
          const path = pathTo(parent, goal);
          for (const x of path) if (x !== start && x !== goal) cells[x] = 'path';
          final(4, L(`목표 도착! 최단 경로 길이 ${dist[u]}`, `Goal reached! Shortest path length ${dist[u]}`), view({ path }), { length: dist[u] });
          return;
        }
        for (const v of neighboursOf(u, rows, cols)) {
          if (wall.has(v) || dist[v] !== null) continue;
          dist[v] = dist[u] + 1;
          parent[v] = u;
          cells[v] = 'open';
          queue.push(v);
          step(7, L(`${cellName(v, cols)} 의 거리 = ${dist[v]}, 큐에 넣습니다.`, `${cellName(v, cols)} gets distance ${dist[v]}; enqueue it.`), view({ current: u, probe: v }), { v: cellName(v, cols), dist: dist[v], queue: queue.length - head });
        }
      }
      final(8, L('큐가 비었습니다. 목표로 가는 경로가 없습니다.', 'The queue is empty: there is no path to the goal.'), view(), {});
    });
  },
};

// ───────────────────────── greedy best-first search

export const greedyBestFirst = {
  id: 'greedy-best-first', category: 'path', view: 'grid',
  name: L('탐욕 최적 우선 탐색', 'Greedy Best-First Search'),
  summary: L('목표까지 남은 거리 h 만 보고 가장 가까워 보이는 칸으로 갑니다.', 'Always moves to the cell that looks closest to the goal (smallest h).'),
  description: L(
    '**탐욕 최적 우선 탐색**은 지금까지 온 거리 g 는 무시하고 목표까지의 추정 거리 **h**(맨해튼 거리)만 봅니다. 그래서 A* 보다 훨씬 적은 칸을 보고 빠르게 목표에 닿지만, **최단 경로를 보장하지 않습니다**.\n\n칸 안의 숫자는 h 값입니다. 벽이 목표 쪽을 막고 있으면 돌아가는 경로가 길어지는 것을 BFS·A* 결과와 비교해 보세요. 격자를 **클릭**하면 벽을 놓거나 지울 수 있습니다.',
    '**Greedy best-first search** ignores the distance travelled g and looks only at the estimated distance to the goal **h** (Manhattan distance). It looks at far fewer cells than A* and gets there quickly, but **does not guarantee the shortest path**.\n\nThe number in a cell is its h value. When a wall blocks the way to the goal, compare its detour with the BFS and A* results. **Click** the grid to add or remove walls.'),
  complexity: { best: 'O(d)', average: 'O(E log V)', worst: 'O(E log V)', space: 'O(V)' },
  traits: L('휴리스틱 · 그리디 · 격자', 'Heuristic · Greedy · Grid'),
  input: { default: GRID_DEFAULT, hint: GRID_HINT, parse: parseGrid, random: randomGrid },
  pseudo: [
    'procedure GreedyBestFirst(grid, start, goal)',
    '  open ← [start]; seen ← {start}',
    '  while open is not empty',
    '    u ← cell in open with the smallest h (the earliest added on ties)',
    '    if u = goal: return the path by following parent',
    '    move u from open to closed',
    '    for each neighbour v of u (up, right, down, left)',
    '      if v is not a wall and not seen: parent[v] ← u; add v to open',
    '  return "no path"',
  ],
  run(grid) {
    const { rows, cols, start, goal } = grid;
    const total = rows * cols;
    const wall = new Set(grid.walls);
    const h = (i) => Math.abs(Math.floor(i / cols) - Math.floor(goal / cols)) + Math.abs((i % cols) - (goal % cols));
    return recordCapped((step, final) => {
      const parent = new Array(total).fill(-1);
      const seen = new Uint8Array(total);
      const cells = new Array(total).fill('');
      const values = new Array(total).fill(null);
      for (const i of wall) cells[i] = 'wall';
      const view = (extra = {}) => () => ({ kind: 'grid', rows, cols, start, goal, cells: [...cells], values: [...values], path: [], ...extra });
      const open = [start];
      seen[start] = 1;
      cells[start] = 'open';
      values[start] = h(start);
      step(1, L(`시작 칸의 h = ${h(start)}`, `Start cell: h = ${h(start)}`), view(), { open: 1 });
      while (open.length) {
        let best = 0;
        for (let k = 1; k < open.length; k++) if (h(open[k]) < h(open[best])) best = k;
        const u = open[best];
        step(3, L(`h 가 가장 작은 칸 ${cellName(u, cols)} 선택: h = ${h(u)}`, `Pick the cell with the smallest h: ${cellName(u, cols)}, h = ${h(u)}`), view({ current: u }), { u: cellName(u, cols), h: h(u), open: open.length });
        if (u === goal) {
          const path = pathTo(parent, goal);
          for (const x of path) if (x !== start && x !== goal) cells[x] = 'path';
          final(4, L(`목표 도착! 찾은 경로 길이 ${path.length - 1} (최단이 아닐 수 있음)`, `Goal reached! Path length ${path.length - 1} (not necessarily the shortest)`), view({ path }), { length: path.length - 1 });
          return;
        }
        open.splice(best, 1);
        cells[u] = 'closed';
        for (const v of neighboursOf(u, rows, cols)) {
          if (wall.has(v) || seen[v]) continue;
          seen[v] = 1;
          parent[v] = u;
          open.push(v);
          cells[v] = 'open';
          values[v] = h(v);
          step(7, L(`이웃 ${cellName(v, cols)} 을(를) open 에 넣습니다. h = ${h(v)}`, `Add neighbour ${cellName(v, cols)} to open. h = ${h(v)}`), view({ current: u, probe: v }), { v: cellName(v, cols), h: h(v), open: open.length });
        }
      }
      final(8, L('open 이 비었습니다. 목표로 가는 경로가 없습니다.', 'Open is empty: there is no path to the goal.'), view(), {});
    });
  },
};

// ───────────────────────── DFS through a maze

export const mazeDfs = {
  id: 'maze-dfs', category: 'path', view: 'grid',
  name: L('DFS 미로 탐색', 'DFS Maze Solving'),
  summary: L('한 길로 끝까지 가 보고 막히면 되돌아옵니다.', 'Follows one corridor to its end and backs up at dead ends.'),
  description: L(
    '**깊이 우선 탐색(DFS)** 은 사람이 미로를 푸는 방식과 비슷합니다. 갈 수 있는 첫 방향(위 → 오른쪽 → 아래 → 왼쪽)으로 계속 가다가 **막다른 길이면 한 칸 되돌아가** 다른 방향을 시도합니다(백트래킹).\n\n초록 칸은 지금 걷고 있는 경로(재귀 스택), 회색 칸은 막다른 길로 판명된 칸입니다. DFS 는 경로를 반드시 찾지만 **최단 경로는 아닐 수 있습니다**. 칸 안의 숫자는 들어간 순서입니다.',
    '**Depth-first search (DFS)** is how people solve a maze. It keeps going in the first open direction (up → right → down → left) and **backs up one cell at a dead end** to try another direction (backtracking).\n\nGreen cells are the corridor being walked (the recursion stack); grey cells turned out to be dead ends. DFS always finds a path if there is one, but **not necessarily the shortest**. The number in a cell is the order in which it was entered.'),
  complexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)', space: 'O(V)' },
  traits: L('재귀 · 스택 · 백트래킹 · 격자', 'Recursion · Stack · Backtracking · Grid'),
  input: {
    default: [
      'S.#.......',
      '.##.####.#',
      '....#....#',
      '#.###.##.#',
      '#...#..#..',
      '###.##.##.',
      '....#...#.',
      '.##...#..G',
    ].join('\n'),
    hint: GRID_HINT,
    parse: parseGrid,
    random: randomGrid,
  },
  pseudo: [
    'procedure DFS(u)',
    '  if u = goal: return true',
    '  mark u as visited',
    '  for each neighbour v of u (up, right, down, left)',
    '    if v is not a wall and not visited',
    '      parent[v] ← u',
    '      if DFS(v): return true',
    '  return false      // dead end: back up',
  ],
  run(grid) {
    const { rows, cols, start, goal } = grid;
    const total = rows * cols;
    const wall = new Set(grid.walls);
    return recordCapped((step, final) => {
      const parent = new Array(total).fill(-1);
      const visited = new Uint8Array(total);
      const cells = new Array(total).fill('');
      const values = new Array(total).fill(null);
      for (const i of wall) cells[i] = 'wall';
      const view = (extra = {}) => () => ({ kind: 'grid', rows, cols, start, goal, cells: [...cells], values: [...values], path: [], ...extra });
      let order = 0;
      let depth = 0;
      const dfs = (u) => {
        values[u] = order++;
        cells[u] = 'open';
        if (u === goal) return true;
        visited[u] = 1;
        step(2, L(`${cellName(u, cols)} 에 들어갑니다. (깊이 ${depth})`, `Enter ${cellName(u, cols)}. (depth ${depth})`), view({ current: u }), { u: cellName(u, cols), depth });
        for (const v of neighboursOf(u, rows, cols)) {
          if (wall.has(v) || visited[v]) continue;
          parent[v] = u;
          step(5, L(`${cellName(v, cols)} 쪽으로 갑니다.`, `Go towards ${cellName(v, cols)}.`), view({ current: u, probe: v }), { u: cellName(u, cols), v: cellName(v, cols), depth });
          depth += 1;
          const found = dfs(v);
          depth -= 1;
          if (found) return true;
        }
        cells[u] = 'closed';
        step(7, L(`${cellName(u, cols)} 은(는) 막다른 길입니다. 되돌아갑니다.`, `${cellName(u, cols)} is a dead end. Back up.`), view({ current: u }), { u: cellName(u, cols), depth });
        return false;
      };
      step(0, L('시작 칸에서 DFS 를 시작합니다.', 'Start DFS at the start cell.'), view(), {});
      if (dfs(start)) {
        const path = pathTo(parent, goal);
        for (const x of path) if (x !== start && x !== goal) cells[x] = 'path';
        final(1, L(`목표 도착! 찾은 경로 길이 ${path.length - 1}`, `Goal reached! Path length ${path.length - 1}`), view({ path }), { length: path.length - 1 });
      } else {
        final(7, L('모든 길이 막혔습니다. 경로가 없습니다.', 'Every corridor is blocked: there is no path.'), view(), {});
      }
    });
  },
};

// ───────────────────────── subset sum

export const subsetSum = {
  id: 'subset-sum', category: 'backtracking', view: 'array',
  name: L('부분집합의 합', 'Subset Sum'),
  summary: L('합이 목표값이 되는 원소들을 넣거나 빼며 찾습니다.', 'Finds elements that add up to the target by taking or skipping each one.'),
  description: L(
    '각 원소를 **넣을지(take) 뺄지(skip)** 차례로 결정하는 백트래킹입니다. 먼저 넣어 보고, 그 선택으로 해를 못 찾으면 **빼고** 다음 원소로 넘어갑니다.\n\n값이 모두 양수이므로 합이 목표를 넘는 선택은 더 볼 필요가 없어 **가지치기**합니다. 주황 막대 = 고른 원소, 노란 막대 = 지금 결정 중인 원소. 해가 없으면 none 을 출력합니다.',
    'A backtracking search that decides for each element in turn whether to **take** or **skip** it. It tries taking first, and when that choice leads nowhere it **puts the element back** and moves on.\n\nAll values are positive, so a choice that pushes the sum past the target is **pruned** straight away. Orange bars are taken, the yellow bar is being decided. Prints none when there is no subset.'),
  complexity: { best: 'O(n)', average: 'O(2ⁿ)', worst: 'O(2ⁿ)', space: 'O(n)' },
  traits: L('백트래킹 · 가지치기 · 재귀', 'Backtracking · Pruning · Recursion'),
  input: {
    default: 'values: 3 34 4 12 5 2\ntarget: 9',
    hint: L('values: 양의 정수 1~12개 (1~99), target: 목표 합 (1~500)', 'values: 1–12 positive integers (1–99), target: the sum to reach (1–500)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      if (keys.values === undefined) throw new InputError('values: 줄이 필요합니다.', 'A values: line is required.');
      const values = parseNumbers(keys.values, { min: 1, max: 12, lo: 1, hi: 99 });
      const target = parseInteger(keys.target, 'target', 1, 500);
      return { values, target };
    },
    random() {
      const values = randomArray(randInt(5, 8), 1, 30);
      const pick = values.filter(() => Math.random() < 0.4);
      const target = Math.max(1, pick.reduce((s, v) => s + v, 0) || values[0]);
      return `values: ${values.join(' ')}\ntarget: ${target}`;
    },
  },
  pseudo: [
    'procedure solve(i, sum)',
    '  if sum = target: return true          // found a subset',
    '  if i = n: return false',
    '  if sum + a[i] ≤ target',
    '    take a[i]; if solve(i + 1, sum + a[i]): return true',
    '    put a[i] back                        // backtrack',
    '  return solve(i + 1, sum)               // skip a[i]',
  ],
  run({ values, target }) {
    const n = values.length;
    return recordCapped((step, final) => {
      const taken = new Array(n).fill(false);
      const view = (focus = -1, found = false) => () => {
        const colors = {};
        taken.forEach((t, i) => { if (t) colors[i] = found ? 'found' : 'write'; });
        if (focus >= 0 && focus < n) colors[focus] = 'compare';
        return { kind: 'array', values: [...values], colors, done: [], pointers: focus >= 0 && focus < n ? { i: focus } : {} };
      };
      const chosen = () => values.filter((_, i) => taken[i]);
      const solve = (i, sum) => {
        if (sum === target) return true;
        if (i === n) {
          step(2, L(`끝까지 왔지만 합 ${sum} ≠ ${target}. 되돌아갑니다.`, `Reached the end with sum ${sum} ≠ ${target}. Back up.`), view(), { i, sum, target });
          return false;
        }
        if (sum + values[i] <= target) {
          taken[i] = true;
          step(4, L(`a[${i}] = ${values[i]} 을(를) 넣습니다. 합 = ${sum + values[i]}`, `Take a[${i}] = ${values[i]}. Sum = ${sum + values[i]}`), view(i), { i, sum: sum + values[i], target });
          if (solve(i + 1, sum + values[i])) return true;
          taken[i] = false;
          step(5, L(`a[${i}] = ${values[i]} 을(를) 다시 뺍니다.`, `Put a[${i}] = ${values[i]} back.`), view(i), { i, sum, target });
        } else {
          step(3, L(`${sum} + ${values[i]} > ${target} 이므로 a[${i}] 는 넣을 수 없습니다.`, `${sum} + ${values[i]} > ${target}, so a[${i}] cannot be taken.`), view(i), { i, sum, target });
        }
        step(6, L(`a[${i}] = ${values[i]} 을(를) 빼고 다음으로 갑니다.`, `Skip a[${i}] = ${values[i]} and move on.`), view(i), { i, sum, target });
        return solve(i + 1, sum);
      };
      step(0, L(`합이 ${target} 이 되는 부분집합을 찾습니다.`, `Look for a subset that adds up to ${target}.`), view(), { target });
      if (solve(0, 0)) {
        const result = chosen().join(' ');
        final(1, L(`찾았습니다: ${chosen().join(' + ')} = ${target}`, `Found: ${chosen().join(' + ')} = ${target}`), view(-1, true), { result, target });
      } else {
        final(2, L('합이 목표가 되는 부분집합이 없습니다.', 'No subset adds up to the target.'), view(), { result: 'none', target });
      }
    });
  },
};

// ───────────────────────── permutations

export const permutations = {
  id: 'permutations', category: 'backtracking', view: 'array',
  name: L('순열 생성', 'Generating Permutations'),
  summary: L('아직 쓰지 않은 원소를 하나씩 골라 모든 순서를 만듭니다.', 'Builds every ordering by picking one unused element at a time.'),
  description: L(
    'n 개의 원소로 만들 수 있는 **n! 가지 순서**를 모두 만듭니다. 빈 순열에서 시작해 **아직 쓰지 않은 원소**를 하나 붙이고 재귀 호출하며, 돌아오면 그 원소를 떼어 내고(**백트래킹**) 다음 원소를 붙입니다.\n\n주황 막대 = 이미 쓴 원소, 아래 줄 = 지금 만들고 있는 순열. 입력 순서가 오름차순이면 결과도 사전 순으로 나옵니다.',
    'Produces all **n! orderings** of n elements. Starting from an empty permutation it appends **an element not used yet** and recurses; on return it removes that element (**backtracking**) and appends the next one.\n\nOrange bars are used elements; the strip below is the permutation being built. When the input is in ascending order the output comes out in lexicographic order.'),
  complexity: { best: 'O(n · n!)', average: 'O(n · n!)', worst: 'O(n · n!)', space: 'O(n)' },
  traits: L('백트래킹 · 재귀 · 완전 탐색', 'Backtracking · Recursion · Exhaustive search'),
  input: {
    default: 'items: 1 2 3',
    hint: L('items: 정수 1~5개', 'items: 1–5 integers'),
    parse(text) {
      const { keys } = parseKeyed(text);
      return { items: parseNumbers(keys.items ?? text, { min: 1, max: 5, lo: -99, hi: 99 }) };
    },
    random: () => `items: ${shuffle(Array.from({ length: randInt(3, 4) }, (_, i) => i + 1)).sort((a, b) => a - b).join(' ')}`,
  },
  pseudo: [
    'procedure permute(cur)',
    '  if |cur| = n: output cur; return',
    '  for i ← 0 to n − 1',
    '    if used[i]: skip',
    '    used[i] ← true; append a[i] to cur',
    '    permute(cur)',
    '    remove a[i] from cur; used[i] ← false     // backtrack',
  ],
  run({ items }) {
    const n = items.length;
    return recordCapped((step, final) => {
      const used = new Array(n).fill(false);
      const cur = [];
      const out = [];
      const view = (focus = -1) => () => {
        const colors = {};
        used.forEach((u, i) => { if (u) colors[i] = 'write'; });
        if (focus >= 0) colors[focus] = 'compare';
        const strip = [...cur, ...Array(n - cur.length).fill(null)];
        return { kind: 'array', values: [...items], colors, done: [], pointers: focus >= 0 ? { i: focus } : {}, aux: { label: 'cur', values: strip } };
      };
      const permute = () => {
        if (cur.length === n) {
          out.push(cur.join(' '));
          step(1, L(`순열 #${out.length}: ${cur.join(' ')}`, `Permutation #${out.length}: ${cur.join(' ')}`), view(), { count: out.length, cur: cur.join(' ') });
          return;
        }
        for (let i = 0; i < n; i++) {
          if (used[i]) continue;
          used[i] = true;
          cur.push(items[i]);
          step(4, L(`a[${i}] = ${items[i]} 을(를) 붙입니다 → [${cur.join(' ')}]`, `Append a[${i}] = ${items[i]} → [${cur.join(' ')}]`), view(i), { i, cur: cur.join(' ') });
          permute();
          cur.pop();
          used[i] = false;
          step(6, L(`a[${i}] = ${items[i]} 을(를) 떼어 냅니다 → [${cur.join(' ')}]`, `Remove a[${i}] = ${items[i]} → [${cur.join(' ')}]`), view(i), { i, cur: cur.join(' ') });
        }
      };
      step(0, L(`${n}개 원소의 순열 ${n}! 개를 만듭니다.`, `Generate the ${n}! permutations of ${n} elements.`), view(), {});
      permute();
      final(1, L(`순열 ${out.length}개를 모두 만들었습니다.`, `Generated all ${out.length} permutations.`), () => ({ ...view()(), output: out.join('\n') }), { count: out.length });
    });
  },
};

// ───────────────────────── sudoku

const SUDOKU_SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function parseSudoku(text) {
  const rows = String(text).split(/\r?\n/).map((line) => line.replace(/[\s|+-]/g, '')).filter(Boolean);
  if (rows.length !== 9 || rows.some((row) => row.length !== 9)) throw new InputError('9칸짜리 줄 9개를 입력하세요 (빈칸은 . 또는 0).', 'Enter 9 rows of 9 cells (. or 0 for blanks).');
  const cells = [];
  for (const row of rows) for (const ch of row) {
    if (ch === '.' || ch === '0') cells.push(0);
    else if (/[1-9]/.test(ch)) cells.push(Number(ch));
    else throw new InputError(`알 수 없는 문자 "${ch}" (1~9, . 또는 0)`, `Unknown character "${ch}" (use 1–9, . or 0)`);
  }
  return { cells };
}

function randomSudoku() {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const order = () => shuffle([0, 1, 2]).flatMap((band) => shuffle([0, 1, 2]).map((k) => band * 3 + k));
  const rows = order();
  const cols = order();
  const grid = rows.map((r) => cols.map((c) => digits[Number(SUDOKU_SOLVED[r * 9 + c]) - 1]));
  const blanks = shuffle(Array.from({ length: 81 }, (_, i) => i)).slice(0, randInt(34, 42));
  for (const i of blanks) grid[Math.floor(i / 9)][i % 9] = 0;
  return grid.map((row) => row.map((v) => v || '.').join('')).join('\n');
}

export const sudoku = {
  id: 'sudoku', category: 'backtracking', view: 'table',
  name: L('스도쿠 풀이', 'Sudoku Solver'),
  summary: L('빈칸에 1~9를 차례로 넣어 보고 막히면 되돌아갑니다.', 'Tries 1–9 in each blank and backs up when stuck.'),
  description: L(
    '첫 번째 빈칸을 찾아 **1부터 9까지** 넣어 봅니다. 같은 행·열·3×3 상자에 이미 있는 숫자는 건너뛰고, 넣을 수 있는 숫자를 넣은 뒤 다음 빈칸으로 재귀합니다. 뒤에서 막히면 그 칸을 **비우고(백트래킹)** 다음 숫자를 시도합니다.\n\n파란 칸 = 처음 주어진 숫자, 주황 = 넣어 본 숫자, 빨강 = 충돌. 9줄에 9칸씩 입력하며 빈칸은 . 또는 0 입니다.',
    'Find the first blank and try **1 to 9**. Skip digits already in the same row, column or 3×3 box; place an allowed digit and recurse to the next blank. When a later cell gets stuck, **clear** this one (backtrack) and try the next digit.\n\nBlue = given digits, orange = tried digits, red = conflict. Enter 9 rows of 9 cells; blanks are . or 0.'),
  complexity: { best: 'O(n²)', average: 'O(9ᵏ)', worst: 'O(9ᵏ)', space: 'O(k)' },
  traits: L('백트래킹 · 제약 충족 · 재귀', 'Backtracking · Constraint satisfaction · Recursion'),
  input: {
    default: [
      '53..7...2',
      '6..195...',
      '.98...56.',
      '8..761..3',
      '4..853..1',
      '7...2...6',
      '.6....28.',
      '..7419..5',
      '3...8..79',
    ].join('\n'),
    hint: L('9칸짜리 줄 9개. 숫자 1~9, 빈칸은 . 또는 0', '9 rows of 9 cells. Digits 1–9, blanks . or 0'),
    parse: parseSudoku,
    random: randomSudoku,
  },
  pseudo: [
    'procedure solve()',
    '  find the first empty cell (r, c); if there is none: return true',
    '  for d ← 1 to 9',
    '    if d is not in row r, column c or the 3×3 box',
    '      grid[r][c] ← d',
    '      if solve(): return true',
    '      grid[r][c] ← empty           // backtrack',
    '  return false',
  ],
  run({ cells: start }) {
    const grid = [...start];
    const given = start.map((v) => v !== 0);
    const conflict = (i, d) => {
      const r = Math.floor(i / 9);
      const c = i % 9;
      for (let k = 0; k < 9; k++) {
        if (grid[r * 9 + k] === d && r * 9 + k !== i) return r * 9 + k;
        if (grid[k * 9 + c] === d && k * 9 + c !== i) return k * 9 + c;
      }
      const br = r - (r % 3);
      const bc = c - (c % 3);
      for (let y = br; y < br + 3; y++) for (let x = bc; x < bc + 3; x++) if (grid[y * 9 + x] === d && y * 9 + x !== i) return y * 9 + x;
      return -1;
    };
    return recordCapped((step, final) => {
      const view = (extra = {}, done = false) => () => {
        const colors = {};
        grid.forEach((v, i) => {
          const key = `${Math.floor(i / 9)},${i % 9}`;
          if (given[i]) colors[key] = 'source';
          else if (v) colors[key] = done ? 'found' : 'write';
        });
        if (extra.current !== undefined) colors[`${Math.floor(extra.current / 9)},${extra.current % 9}`] = 'active';
        if (extra.clash !== undefined) colors[`${Math.floor(extra.clash / 9)},${extra.clash % 9}`] = 'error';
        const cells = Array.from({ length: 9 }, (_, r) => grid.slice(r * 9, r * 9 + 9).map((v) => (v ? v : '')));
        if (extra.current !== undefined && extra.try) cells[Math.floor(extra.current / 9)][extra.current % 9] = extra.try;
        return { kind: 'table', rowHeaders: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], colHeaders: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], cells, colors };
      };
      const solve = () => {
        const i = grid.indexOf(0);
        if (i < 0) return true;
        const at = `(${Math.floor(i / 9) + 1}, ${(i % 9) + 1})`;
        for (let d = 1; d <= 9; d++) {
          const clash = conflict(i, d);
          if (clash >= 0) {
            step(3, L(`${at} 에 ${d} 은(는) 충돌합니다.`, `${d} clashes at ${at}.`), view({ current: i, clash, try: d }), { cell: at, d });
            continue;
          }
          grid[i] = d;
          step(4, L(`${at} 에 ${d} 을(를) 넣습니다.`, `Put ${d} at ${at}.`), view({ current: i }), { cell: at, d });
          if (solve()) return true;
          grid[i] = 0;
          step(6, L(`${at} 을(를) 비우고 다음 숫자를 시도합니다.`, `Clear ${at} and try the next digit.`), view({ current: i }), { cell: at, d });
        }
        step(7, L(`${at} 에 넣을 숫자가 없습니다. 되돌아갑니다.`, `No digit fits at ${at}. Back up.`), view({ current: i }), { cell: at });
        return false;
      };
      const clashes = start.some((v, i) => v && conflict(i, v) >= 0);
      step(0, L(`빈칸 ${start.filter((v) => !v).length}개를 채웁니다.`, `Fill ${start.filter((v) => !v).length} blanks.`), view(), {});
      if (!clashes && solve()) {
        const result = Array.from({ length: 9 }, (_, r) => grid.slice(r * 9, r * 9 + 9).join('')).join('\n');
        final(1, L('스도쿠를 풀었습니다!', 'Sudoku solved!'), view({}, true), { result });
      } else {
        final(7, L('해가 없습니다.', 'There is no solution.'), view(), { result: 'none' });
      }
    });
  },
};

// ───────────────────────── Huffman coding

export const huffman = {
  id: 'huffman', category: 'greedy', view: 'tree',
  name: L('허프만 코딩', 'Huffman Coding'),
  summary: L('가장 드문 두 기호를 계속 합쳐 최적의 접두 부호를 만듭니다.', 'Repeatedly merges the two rarest symbols into an optimal prefix code.'),
  description: L(
    '자주 나오는 기호에는 **짧은 부호**, 드문 기호에는 **긴 부호**를 주는 압축 방법입니다. 빈도가 **가장 작은 두 트리**를 꺼내 하나로 합치는 그리디 선택을 트리가 하나 남을 때까지 반복합니다.\n\n완성된 트리에서 왼쪽 간선은 0, 오른쪽 간선은 1 이고, 뿌리에서 잎까지의 경로가 그 기호의 부호입니다. 결과는 문자열 전체를 부호화한 **총 비트 수**입니다(같은 빈도를 어떻게 고르든 총 비트 수는 같습니다).',
    'A compression method that gives **short codes** to common symbols and **long codes** to rare ones. The greedy step takes out the **two trees with the smallest frequencies** and joins them, until one tree is left.\n\nIn the finished tree a left edge is 0 and a right edge is 1; the path from the root to a leaf is that symbol\'s code. The result is the **total number of bits** for the whole text (it is the same however ties are broken).'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' },
  traits: L('그리디 · 우선순위 큐 · 압축', 'Greedy · Priority queue · Compression'),
  input: {
    default: 'text: ABRACADABRA',
    hint: L('text: 2~40글자 (영문·숫자, 공백 없이)', 'text: 2–40 characters (letters and digits, no spaces)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const value = (keys.text ?? String(text).trim()).trim();
      if (!/^[A-Za-z0-9]{2,40}$/.test(value)) throw new InputError('영문·숫자 2~40글자를 공백 없이 입력하세요.', 'Enter 2–40 letters or digits without spaces.');
      return { text: value };
    },
    random() {
      const pool = 'AAAAABBBCCDE';
      return `text: ${Array.from({ length: randInt(10, 24) }, () => pool[randInt(0, pool.length - 1)]).join('')}`;
    },
  },
  pseudo: [
    'procedure Huffman(text)',
    '  count how often each symbol appears',
    '  put one leaf per symbol into a min-priority queue',
    '  while the queue holds more than one tree',
    '    x ← extract-min; y ← extract-min',
    '    z ← new node(x.freq + y.freq) with children x and y',
    '    insert z into the queue',
    '  read the codes: left edge = 0, right edge = 1',
    '  total bits = Σ freq × code length',
  ],
  run({ text }) {
    const freq = new Map();
    for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
    const symbols = [...freq.keys()].sort((a, b) => freq.get(a) - freq.get(b) || (a < b ? -1 : 1));
    return record((r) => {
      const nodes = [];
      const queue = [];
      for (const ch of symbols) { const id = nodes.length; nodes.push({ id, key: `${ch}:${freq.get(ch)}`, left: null, right: null, freq: freq.get(ch), ch }); queue.push(id); }
      const roots = () => [...queue].sort((a, b) => a - b);
      const qList = () => [{ label: L('큐 (빈도)', 'Queue (freq)'), items: [...queue].sort((a, b) => nodes[a].freq - nodes[b].freq || a - b).map((id) => nodes[id].key) }];
      const view = (colors = {}, lists = qList()) => ({ kind: 'tree', nodes: nodes.map(({ id, key, left, right }) => ({ id, key, left, right })), root: queue.length === 1 ? queue[0] : null, roots: roots(), bits: true, colors, lists, probe: null });
      r.step(1, L(`기호 ${symbols.length}개의 빈도: ${symbols.map((ch) => `${ch}=${freq.get(ch)}`).join(', ')}`, `Frequencies of ${symbols.length} symbols: ${symbols.map((ch) => `${ch}=${freq.get(ch)}`).join(', ')}`), view(), { symbols: symbols.length });
      r.step(2, L('기호마다 잎 노드를 하나씩 큐에 넣었습니다.', 'One leaf per symbol is in the queue.'), view(), { queue: queue.length });
      const popMin = () => {
        let best = 0;
        for (let k = 1; k < queue.length; k++) {
          const a = nodes[queue[k]];
          const b = nodes[queue[best]];
          if (a.freq < b.freq || (a.freq === b.freq && a.id < b.id)) best = k;
        }
        return queue.splice(best, 1)[0];
      };
      while (queue.length > 1) {
        const x = popMin();
        const y = popMin();
        r.step(4, L(`가장 작은 두 트리: ${nodes[x].key}, ${nodes[y].key}`, `The two smallest trees: ${nodes[x].key}, ${nodes[y].key}`), { ...view({ [x]: 'compare', [y]: 'compare' }), roots: [...roots(), x, y].sort((a, b) => a - b) }, { x: nodes[x].freq, y: nodes[y].freq, queue: queue.length });
        const z = nodes.length;
        nodes.push({ id: z, key: String(nodes[x].freq + nodes[y].freq), left: x, right: y, freq: nodes[x].freq + nodes[y].freq });
        queue.push(z);
        r.step(6, L(`두 트리를 합쳐 빈도 ${nodes[z].freq} 인 새 노드를 큐에 넣습니다.`, `Join them into a node of frequency ${nodes[z].freq} and put it back in the queue.`), view({ [z]: 'write' }), { z: nodes[z].freq, queue: queue.length });
      }
      const codes = new Map();
      const walk = (id, code) => {
        const node = nodes[id];
        if (node.left === null) { codes.set(node.ch, code || '0'); return; }
        walk(node.left, `${code}0`);
        walk(node.right, `${code}1`);
      };
      walk(queue[0], '');
      const codeList = () => [{ label: L('부호', 'Codes'), items: symbols.map((ch) => `${ch} = ${codes.get(ch)}`) }];
      const leafColors = Object.fromEntries(nodes.filter((n) => n.left === null).map((n) => [n.id, 'done']));
      r.step(7, L('왼쪽 간선 0, 오른쪽 간선 1 로 부호를 읽습니다.', 'Read the codes: left edge 0, right edge 1.'), view(leafColors, codeList()), {});
      const bits = symbols.reduce((s, ch) => s + freq.get(ch) * codes.get(ch).length, 0);
      r.step(8, L(`총 ${bits}비트 (고정 길이 8비트면 ${text.length * 8}비트)`, `${bits} bits in total (${text.length * 8} bits with fixed 8-bit codes)`), view(leafColors, codeList()), { result: bits, ascii: text.length * 8 });
    });
  },
};

// ───────────────────────── fractional knapsack

export const fractionalKnapsack = {
  id: 'fractional-knapsack', category: 'greedy', view: 'table',
  name: L('분할 가능 배낭', 'Fractional Knapsack'),
  summary: L('무게당 가치가 큰 물건부터 담고, 마지막 물건은 쪼개서 담습니다.', 'Takes items by value per weight and splits the last one.'),
  description: L(
    '물건을 **쪼개서** 담을 수 있는 배낭 문제입니다. 무게당 가치(v/w)가 큰 물건부터 통째로 담고, 남은 용량이 부족해지면 그 물건을 **필요한 만큼만 잘라** 담습니다. 이 그리디 선택이 항상 최적입니다.\n\n물건을 쪼갤 수 없는 0/1 배낭(동적 계획법)과 비교해 보세요. 결과는 소수 둘째 자리까지 반올림한 최대 가치입니다.',
    'A knapsack where items **can be split**. Take whole items in order of value per weight (v/w); when the remaining capacity runs short, **cut** the next item to fit. This greedy choice is always optimal.\n\nCompare it with the 0/1 knapsack (dynamic programming), where items cannot be split. The result is the best value rounded to two decimals.'),
  complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' },
  traits: L('그리디 · 정렬', 'Greedy · Sorting'),
  input: {
    default: 'weights: 10 20 30\nvalues: 60 100 120\ncapacity: 50',
    hint: L('weights·values: 같은 개수(1~10), 1~999 / capacity: 1~9999', 'weights and values: same count (1–10), 1–999 / capacity: 1–9999'),
    parse(text) {
      const { keys } = parseKeyed(text);
      if (keys.weights === undefined || keys.values === undefined) throw new InputError('weights: 와 values: 줄이 필요합니다.', 'weights: and values: lines are required.');
      const weights = parseNumbers(keys.weights, { min: 1, max: 10, lo: 1, hi: 999 });
      const values = parseNumbers(keys.values, { min: 1, max: 10, lo: 1, hi: 999 });
      if (weights.length !== values.length) throw new InputError('weights 와 values 의 개수가 같아야 합니다.', 'weights and values must have the same count.');
      return { weights, values, capacity: parseInteger(keys.capacity, 'capacity', 1, 9999) };
    },
    random() {
      const n = randInt(3, 6);
      const weights = randomArray(n, 5, 40);
      return `weights: ${weights.join(' ')}\nvalues: ${randomArray(n, 10, 150).join(' ')}\ncapacity: ${Math.floor(weights.reduce((s, v) => s + v, 0) * 0.6)}`;
    },
  },
  pseudo: [
    'procedure fractionalKnapsack(items, W)',
    '  sort items by value / weight, largest first',
    '  for each item (w, v)',
    '    if w ≤ W: take all of it; W ← W − w',
    '    else: take the fraction W / w of it; stop',
    '  return the total value',
  ],
  run({ weights, values, capacity }) {
    const order = weights.map((_, i) => i).sort((a, b) => values[b] * weights[a] - values[a] * weights[b] || a - b);
    return record((r) => {
      const taken = new Array(weights.length).fill('');
      let room = capacity;
      let num = 0; // total value = num / den, kept exact
      let den = 1;
      const fmt = () => { const cents = Math.floor((2 * 100 * num + den) / (2 * den)); return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`; };
      const view = (focus = -1, done = false) => {
        const colors = {};
        order.forEach((i, row) => {
          if (taken[i]) colors[`${row},3`] = done ? 'found' : 'write';
          if (row === focus) { colors[`${row},0`] = 'active'; colors[`${row},1`] = 'active'; colors[`${row},2`] = 'compare'; }
        });
        return {
          kind: 'table',
          rowHeaders: order.map((i) => `#${i + 1}`),
          colHeaders: ['w', 'v', 'v/w', 'take'],
          cells: order.map((i) => [weights[i], values[i], (values[i] / weights[i]).toFixed(2), taken[i]]),
          colors,
          footer: L(`남은 용량 ${room} · 가치 ${fmt()}`, `Room left ${room} · value ${fmt()}`),
        };
      };
      r.step(1, L('무게당 가치(v/w)가 큰 순서로 정렬했습니다.', 'Sorted by value per weight (v/w), largest first.'), view(), { capacity });
      for (let row = 0; row < order.length; row++) {
        const i = order[row];
        if (room === 0) break;
        r.step(2, L(`물건 #${i + 1}: 무게 ${weights[i]}, 가치 ${values[i]}`, `Item #${i + 1}: weight ${weights[i]}, value ${values[i]}`), view(row), { room, w: weights[i], v: values[i] });
        if (weights[i] <= room) {
          room -= weights[i];
          num += values[i] * den;
          taken[i] = '1';
          r.step(3, L(`통째로 담습니다. 남은 용량 ${room}`, `Take all of it. Room left ${room}`), view(row), { room, value: fmt() });
        } else {
          num = num * weights[i] + values[i] * room * den;
          den *= weights[i];
          taken[i] = `${room}/${weights[i]}`;
          r.step(4, L(`${room}/${weights[i]} 만큼 잘라 담고 끝냅니다.`, `Take ${room}/${weights[i]} of it and stop.`), view(row), { room: 0, value: fmt() });
          room = 0;
          break;
        }
      }
      r.step(5, L(`최대 가치 = ${fmt()}`, `Best value = ${fmt()}`), view(-1, true), { result: fmt() });
    });
  },
};

// ───────────────────────── job sequencing with deadlines

export const jobSequencing = {
  id: 'job-sequencing', category: 'greedy', view: 'table',
  name: L('마감 기한 작업 스케줄링', 'Job Sequencing with Deadlines'),
  summary: L('이익이 큰 작업부터 마감 직전의 빈 시간에 배치합니다.', 'Places the most profitable jobs in the latest free slot before their deadline.'),
  description: L(
    '작업마다 **마감 시각**과 **이익**이 있고, 한 작업은 한 시간 칸을 차지합니다. 이익이 큰 작업부터 보면서 **마감 이전의 가장 늦은 빈 칸**에 넣습니다. 빈 칸이 없으면 그 작업은 포기합니다.\n\n가장 늦은 칸에 넣어야 앞쪽 칸을 마감이 이른 작업에게 남겨 줄 수 있습니다. 한 줄에 "마감 이익"을 적습니다. 결과 첫 줄은 시간 순서의 작업 번호, 둘째 줄은 총이익입니다.',
    'Each job has a **deadline** and a **profit** and takes one time slot. Go through the jobs from the most profitable and put each into **the latest free slot before its deadline**; if there is none, drop the job.\n\nUsing the latest slot leaves the early slots for jobs with early deadlines. Write one "deadline profit" pair per line. The first output line lists the jobs in time order, the second the total profit.'),
  complexity: { best: 'O(n log n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(n)' },
  traits: L('그리디 · 정렬 · 스케줄링', 'Greedy · Sorting · Scheduling'),
  input: {
    default: '2 100\n1 19\n2 27\n1 25\n3 15',
    hint: L('한 줄에 마감(1~10)과 이익(1~999), 작업 1~10개', 'One deadline (1–10) and profit (1–999) per line, 1–10 jobs'),
    parse(text) {
      const rows = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (rows.length < 1 || rows.length > 10) throw new InputError('작업을 1~10개 입력하세요.', 'Enter 1–10 jobs.');
      return rows.map((line) => {
        const [deadline, profit] = line.split(/[\s,]+/).map(Number);
        if (!Number.isInteger(deadline) || deadline < 1 || deadline > 10 || !Number.isInteger(profit) || profit < 1 || profit > 999) throw new InputError('마감은 1~10, 이익은 1~999 정수입니다.', 'Deadline must be 1–10 and profit 1–999.');
        return { deadline, profit };
      });
    },
    random: () => Array.from({ length: randInt(4, 7) }, () => `${randInt(1, 4)} ${randInt(5, 120)}`).join('\n'),
  },
  pseudo: [
    'procedure jobSequencing(jobs)',
    '  sort jobs by profit, largest first',
    '  for each job j',
    '    for t ← min(deadline(j), number of slots) down to 1',
    '      if slot t is free: slot[t] ← j; break',
    '    (no free slot: drop j)',
    '  return the slots in time order and the total profit',
  ],
  run(jobs) {
    const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].profit - jobs[a].profit || a - b);
    const slots = Math.max(...jobs.map((j) => j.deadline));
    return record((r) => {
      const slot = new Array(slots + 1).fill(-1);
      const placed = new Array(jobs.length).fill('');
      let profit = 0;
      const timeline = () => Array.from({ length: slots }, (_, k) => `${k + 1}:${slot[k + 1] >= 0 ? `J${slot[k + 1] + 1}` : '—'}`).join('  ');
      const view = (focus = -1, done = false) => {
        const colors = {};
        order.forEach((i, row) => {
          if (placed[i] === '✕') colors[`${row},2`] = 'error';
          else if (placed[i]) colors[`${row},2`] = done ? 'found' : 'write';
          if (row === focus) { colors[`${row},0`] = 'active'; colors[`${row},1`] = 'active'; }
        });
        return {
          kind: 'table',
          rowHeaders: order.map((i) => `J${i + 1}`),
          colHeaders: ['deadline', 'profit', 'slot'],
          cells: order.map((i) => [jobs[i].deadline, jobs[i].profit, placed[i]]),
          colors,
          footer: L(`시간표 ${timeline()} · 이익 ${profit}`, `Slots ${timeline()} · profit ${profit}`),
        };
      };
      r.step(1, L('이익이 큰 순서로 정렬했습니다.', 'Sorted by profit, largest first.'), view(), { slots });
      order.forEach((i, row) => {
        const job = jobs[i];
        r.step(2, L(`J${i + 1}: 마감 ${job.deadline}, 이익 ${job.profit}`, `J${i + 1}: deadline ${job.deadline}, profit ${job.profit}`), view(row), { job: `J${i + 1}`, deadline: job.deadline, profit: job.profit });
        for (let t = Math.min(job.deadline, slots); t >= 1; t--) {
          if (slot[t] < 0) {
            slot[t] = i;
            placed[i] = String(t);
            profit += job.profit;
            r.step(4, L(`빈 칸 ${t} 에 J${i + 1} 을(를) 넣습니다.`, `Put J${i + 1} into free slot ${t}.`), view(row), { job: `J${i + 1}`, slot: t, total: profit });
            return;
          }
        }
        placed[i] = '✕';
        r.step(5, L(`마감 ${job.deadline} 이전에 빈 칸이 없어 J${i + 1} 은(는) 포기합니다.`, `No free slot by ${job.deadline}: drop J${i + 1}.`), view(row), { job: `J${i + 1}`, total: profit });
      });
      const sequence = slot.slice(1).filter((j) => j >= 0).map((j) => `J${j + 1}`).join(' ');
      r.step(6, L(`순서 ${sequence}, 총이익 ${profit}`, `Order ${sequence}, total profit ${profit}`), view(-1, true), { result: `${sequence}\n${profit}`, total: profit });
    });
  },
};

// ───────────────────────── AVL tree

export const avlTree = {
  id: 'avl-tree', category: 'tree', view: 'tree',
  name: L('AVL 트리', 'AVL Tree'),
  summary: L('삽입할 때마다 회전으로 높이 균형을 맞추는 이진 탐색 트리입니다.', 'A binary search tree that rotates to stay height-balanced after each insert.'),
  description: L(
    '일반 이진 탐색 트리는 정렬된 순서로 넣으면 한쪽으로 길게 늘어져 탐색이 O(n) 이 됩니다. **AVL 트리**는 모든 노드에서 왼쪽·오른쪽 높이 차이(**균형 인수**)를 −1, 0, 1 로 유지합니다.\n\n삽입 뒤 균형이 깨진 노드를 만나면 모양에 따라 **LL·RR(한 번 회전)** 또는 **LR·RL(두 번 회전)** 으로 바로잡습니다. 결과는 모두 삽입한 뒤의 전위 순회입니다. 같은 값은 한 번만 넣습니다.',
    'A plain binary search tree inserted in sorted order becomes a long chain and searching costs O(n). An **AVL tree** keeps the height difference of every node\'s subtrees (the **balance factor**) at −1, 0 or 1.\n\nWhen an insertion unbalances a node, it is fixed by **one rotation (LL, RR)** or **two rotations (LR, RL)** depending on the shape. The result is the preorder traversal after all insertions. Duplicate values are inserted once.'),
  complexity: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)', space: 'O(n)' },
  traits: L('균형 이진 탐색 트리 · 회전', 'Balanced BST · Rotations'),
  input: {
    default: 'values: 10 20 30 40 50 25',
    hint: L('values: 넣을 정수 1~20개 (−999~999)', 'values: 1–20 integers to insert (−999–999)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      return { values: parseNumbers(keys.values ?? text, { min: 1, max: 20 }) };
    },
    random: () => `values: ${randomArray(randInt(7, 12), 1, 99).join(' ')}`,
  },
  pseudo: [
    'procedure insert(node, key)',
    '  if node is empty: return new node(key)',
    '  if key < node.key: node.left ← insert(node.left, key)',
    '  else if key > node.key: node.right ← insert(node.right, key)',
    '  else: return node                  // duplicate',
    '  update node.height; b ← height(left) − height(right)',
    '  if b > 1 and key < node.left.key: return rotateRight(node)            // LL',
    '  if b < −1 and key > node.right.key: return rotateLeft(node)           // RR',
    '  if b > 1: node.left ← rotateLeft(node.left); return rotateRight(node)  // LR',
    '  if b < −1: node.right ← rotateRight(node.right); return rotateLeft(node) // RL',
    '  return node',
  ],
  run({ values }) {
    return record((r) => {
      const nodes = [];
      let root = null;
      const height = (id) => (id === null ? 0 : nodes[id].height);
      const fix = (id) => { nodes[id].height = 1 + Math.max(height(nodes[id].left), height(nodes[id].right)); };
      const balance = (id) => height(nodes[id].left) - height(nodes[id].right);
      const inserted = [];
      const view = (colors = {}, probe = null) => ({
        kind: 'tree', nodes: nodes.map(({ id, key, left, right }) => ({ id, key, left, right })), root, colors, probe,
        lists: [{ label: L('넣은 값', 'Inserted'), items: inserted.map(String) }],
      });
      const rotateRight = (id) => { const x = nodes[id].left; nodes[id].left = nodes[x].right; nodes[x].right = id; fix(id); fix(x); return x; };
      const rotateLeft = (id) => { const x = nodes[id].right; nodes[id].right = nodes[x].left; nodes[x].left = id; fix(id); fix(x); return x; };
      // `link(newId)` writes the subtree root back into its parent, so every frame shows a whole tree.
      const insert = (id, key, link) => {
        if (id === null) {
          const made = nodes.length;
          nodes.push({ id: made, key, left: null, right: null, height: 1 });
          link(made);
          r.step(1, L(`빈 자리에 ${key} 을(를) 새 노드로 넣습니다.`, `Insert ${key} as a new node in the empty spot.`), view({ [made]: 'write' }), { key });
          return;
        }
        const node = nodes[id];
        if (key === node.key) {
          r.step(4, L(`${key} 은(는) 이미 있습니다.`, `${key} is already in the tree.`), view({ [id]: 'found' }), { key });
          return;
        }
        const left = key < node.key;
        r.step(left ? 2 : 3, L(`${key} ${left ? '<' : '>'} ${node.key} → ${left ? '왼쪽' : '오른쪽'}으로`, `${key} ${left ? '<' : '>'} ${node.key} → go ${left ? 'left' : 'right'}`), view({ [id]: 'compare' }, { at: id, key }), { key, node: node.key });
        if (left) insert(node.left, key, (child) => { node.left = child; });
        else insert(node.right, key, (child) => { node.right = child; });
        fix(id);
        const b = balance(id);
        r.step(5, L(`${node.key} 의 높이 ${node.height}, 균형 인수 ${b}`, `${node.key}: height ${node.height}, balance factor ${b}`), view({ [id]: Math.abs(b) > 1 ? 'current' : 'visited' }), { node: node.key, height: node.height, balance: b });
        let top = id;
        if (b > 1 && key < nodes[node.left].key) {
          top = rotateRight(id); link(top);
          r.step(6, L(`LL 경우: ${node.key} 에서 오른쪽 회전`, `LL case: rotate right at ${node.key}`), view({ [top]: 'write' }), { case: 'LL' });
        } else if (b < -1 && key > nodes[node.right].key) {
          top = rotateLeft(id); link(top);
          r.step(7, L(`RR 경우: ${node.key} 에서 왼쪽 회전`, `RR case: rotate left at ${node.key}`), view({ [top]: 'write' }), { case: 'RR' });
        } else if (b > 1) {
          node.left = rotateLeft(node.left);
          r.step(8, L(`LR 경우: 먼저 ${nodes[nodes[node.left].left].key} 에서 왼쪽 회전`, `LR case: first rotate left at ${nodes[nodes[node.left].left].key}`), view({ [node.left]: 'compare' }), { case: 'LR' });
          top = rotateRight(id); link(top);
          r.step(8, L(`이어서 ${node.key} 에서 오른쪽 회전`, `then rotate right at ${node.key}`), view({ [top]: 'write' }), { case: 'LR' });
        } else if (b < -1) {
          node.right = rotateRight(node.right);
          r.step(9, L(`RL 경우: 먼저 ${nodes[nodes[node.right].right].key} 에서 오른쪽 회전`, `RL case: first rotate right at ${nodes[nodes[node.right].right].key}`), view({ [node.right]: 'compare' }), { case: 'RL' });
          top = rotateLeft(id); link(top);
          r.step(9, L(`이어서 ${node.key} 에서 왼쪽 회전`, `then rotate left at ${node.key}`), view({ [top]: 'write' }), { case: 'RL' });
        }
      };
      r.step(0, L('빈 트리에서 시작합니다.', 'Start with an empty tree.'), view(), {});
      for (const key of values) {
        if (!inserted.includes(key)) inserted.push(key);
        insert(root, key, (id) => { root = id; });
      }
      const pre = [];
      const walk = (id) => { if (id === null) return; pre.push(nodes[id].key); walk(nodes[id].left); walk(nodes[id].right); };
      walk(root);
      const all = Object.fromEntries(nodes.map((n) => [n.id, 'done']));
      r.step(10, L(`완성! 높이 ${height(root)}, 전위 순회: ${pre.join(' ')}`, `Done! Height ${height(root)}, preorder: ${pre.join(' ')}`), { ...view(all), lists: [{ label: L('전위 순회', 'Preorder'), items: pre.map(String) }] }, { result: pre.join(' '), height: height(root) });
    });
  },
};

// ───────────────────────── binary heap

export const binaryHeap = {
  id: 'binary-heap', category: 'tree', view: 'array',
  name: L('이진 힙 (우선순위 큐)', 'Binary Heap (Priority Queue)'),
  summary: L('부모가 자식보다 작은 완전 이진 트리를 배열에 담습니다.', 'A complete binary tree in an array where each parent is smaller than its children.'),
  description: L(
    '**최소 힙**은 모든 부모가 자식보다 작거나 같은 완전 이진 트리이며, 배열 하나에 담습니다. i 번 노드의 자식은 2i+1, 2i+2, 부모는 (i−1)/2 입니다.\n\n**삽입**은 맨 끝에 넣고 부모보다 작으면 위로 올립니다(sift-up). **최솟값 꺼내기**는 뿌리를 마지막 원소와 바꾸고 크기를 줄인 뒤, 더 작은 자식과 바꾸며 아래로 내립니다(sift-down). 둘 다 O(log n) 입니다.\n\n결과 첫 줄은 모두 넣은 뒤의 힙 배열, 둘째 줄은 꺼낸 값들입니다.',
    'A **min-heap** is a complete binary tree where every parent is less than or equal to its children, stored in one array. Node i has children 2i+1 and 2i+2 and parent (i−1)/2.\n\n**Insert** appends at the end and moves the value up while it is smaller than its parent (sift-up). **Extract-min** swaps the root with the last element, shrinks the heap and moves the new root down past its smaller child (sift-down). Both are O(log n).\n\nThe first output line is the heap array after all insertions, the second the extracted values.'),
  complexity: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)', space: 'O(n)' },
  traits: L('완전 이진 트리 · 우선순위 큐 · 배열', 'Complete binary tree · Priority queue · Array'),
  input: {
    default: 'values: 5 3 8 1 9 2 7\nextract: 3',
    hint: L('values: 넣을 정수 1~15개, extract: 꺼낼 개수 (1~값 개수)', 'values: 1–15 integers to insert, extract: how many to take out (1–count)'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const values = parseNumbers(keys.values ?? text, { min: 1, max: 15 });
      const extract = parseInteger(keys.extract ?? '1', 'extract', 1, values.length);
      return { values, extract };
    },
    random() {
      const n = randInt(6, 10);
      return `values: ${randomArray(n, 1, 99).join(' ')}\nextract: ${randInt(2, Math.min(4, n))}`;
    },
  },
  pseudo: [
    'procedure insert(x)',
    '  a[n] ← x; i ← n; n ← n + 1',
    '  while i > 0 and a[parent(i)] > a[i]',
    '    swap a[i] and a[parent(i)]; i ← parent(i)',
    'procedure extractMin()',
    '  min ← a[0]; swap a[0] and a[n − 1]; n ← n − 1',
    '  while a child of i is smaller than a[i]',
    '    swap a[i] with its smaller child c; i ← c',
    '  return min',
  ],
  run({ values, extract }) {
    return record((r) => {
      const a = [];
      let n = 0;
      const out = [];
      const view = (colors = {}, pointers = {}) => ({
        kind: 'array', values: [...a], colors, done: Array.from({ length: a.length - n }, (_, k) => n + k), pointers, heapSize: n,
        aux: out.length ? { label: 'out', values: [...out] } : undefined,
      });
      r.step(0, L('빈 최소 힙에서 시작합니다.', 'Start with an empty min-heap.'), view(), {});
      for (const x of values) {
        a.push(x);
        let i = n;
        n += 1;
        r.step(1, L(`${x} 을(를) 맨 끝 a[${i}] 에 넣습니다.`, `Put ${x} at the end, a[${i}].`), view({ [i]: 'write' }, { i }), { x, i, n });
        while (i > 0) {
          const p = (i - 1) >> 1;
          r.step(2, L(`부모 a[${p}] = ${a[p]} 와 a[${i}] = ${a[i]} 비교`, `Compare parent a[${p}] = ${a[p]} with a[${i}] = ${a[i]}`), view({ [p]: 'compare', [i]: 'compare' }, { i, p }), { i, parent: p });
          if (a[p] <= a[i]) break;
          [a[p], a[i]] = [a[i], a[p]];
          r.step(3, L(`부모가 더 크므로 바꿉니다.`, `The parent is larger: swap.`), view({ [p]: 'swap', [i]: 'swap' }, { i: p }), { i: p });
          i = p;
        }
      }
      const heapLine = a.join(' ');
      r.step(1, L(`모두 넣었습니다: [${heapLine}]`, `All inserted: [${heapLine}]`), view(), { heap: heapLine });
      for (let k = 0; k < extract; k++) {
        const min = a[0];
        [a[0], a[n - 1]] = [a[n - 1], a[0]];
        n -= 1;
        out.push(min);
        r.step(5, L(`최솟값 ${min} 을(를) 꺼내고 마지막 원소를 뿌리로 옮깁니다.`, `Take out the minimum ${min} and move the last element to the root.`), view({ 0: 'pivot' }, { i: 0 }), { min, n });
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const rr = l + 1;
          if (l >= n) break;
          const c = rr < n && a[rr] < a[l] ? rr : l;
          r.step(6, L(`a[${i}] = ${a[i]} 와 더 작은 자식 a[${c}] = ${a[c]} 비교`, `Compare a[${i}] = ${a[i]} with its smaller child a[${c}] = ${a[c]}`), view({ [i]: 'compare', [c]: 'compare' }, { i, c }), { i, child: c });
          if (a[c] >= a[i]) break;
          [a[c], a[i]] = [a[i], a[c]];
          r.step(7, L('자식이 더 작으므로 바꿉니다.', 'The child is smaller: swap.'), view({ [i]: 'swap', [c]: 'swap' }, { i: c }), { i: c });
          i = c;
        }
        r.step(8, L(`${min} 을(를) 꺼냈습니다.`, `Extracted ${min}.`), view(), { min, n });
      }
      const result = `${heapLine}\n${out.join(' ')}`;
      r.step(8, L(`꺼낸 값: ${out.join(' ')}`, `Extracted: ${out.join(' ')}`), view(), { result: out.join(' '), heap: heapLine, output: result });
    });
  },
};

// ───────────────────────── trie

export const trie = {
  id: 'trie', category: 'tree', view: 'tree',
  name: L('트라이 (접두사 트리)', 'Trie (Prefix Tree)'),
  summary: L('단어를 글자 단위로 나눠 공통 접두사를 공유하는 트리에 저장합니다.', 'Stores words letter by letter so that common prefixes are shared.'),
  description: L(
    '**트라이**는 뿌리에서 한 글자씩 내려가며 단어를 저장하는 트리입니다. tea 와 ten 은 t → e 까지 같은 노드를 쓰고 거기서 갈라집니다. 단어가 끝나는 노드에는 표시(초록)를 합니다.\n\n단어 찾기와 **접두사 검색**이 단어 길이 L 에 대해 O(L) 이라 자동 완성·사전에 쓰입니다. find 에 접두사를 적으면 그 접두사로 시작하는 단어를 사전 순으로 출력합니다(없으면 none).',
    'A **trie** stores words by walking down from the root one letter at a time. tea and ten share the nodes t → e and branch there. A node where a word ends is marked (green).\n\nLooking up a word or a **prefix** costs O(L) for a word of length L, which is why tries power autocomplete and dictionaries. find takes a prefix and prints the words that start with it in alphabetical order (none if there are none).'),
  complexity: { best: 'O(L)', average: 'O(L)', worst: 'O(L)', space: 'O(Σ L)' },
  traits: L('트리 · 문자열 · 접두사 검색', 'Tree · Strings · Prefix search'),
  input: {
    default: 'words: tea ten to inn in tent\nfind: te',
    hint: L('words: 영어 소문자 단어 1~12개 (각 1~10글자), find: 찾을 접두사', 'words: 1–12 lower-case words (1–10 letters each), find: the prefix to look up'),
    parse(text) {
      const { keys } = parseKeyed(text);
      const words = String(keys.words ?? '').split(/[\s,]+/).filter(Boolean);
      if (words.length < 1 || words.length > 12 || words.some((w) => !/^[a-z]{1,10}$/.test(w))) throw new InputError('words: 에 영어 소문자 단어 1~12개(각 1~10글자)를 적으세요.', 'words: needs 1–12 lower-case words of 1–10 letters.');
      const find = String(keys.find ?? '').trim();
      if (!/^[a-z]{0,10}$/.test(find)) throw new InputError('find: 는 영어 소문자 0~10글자입니다.', 'find: must be 0–10 lower-case letters.');
      return { words, find };
    },
    random() {
      const pool = ['car', 'card', 'care', 'cart', 'cat', 'do', 'dog', 'dot', 'tea', 'ten', 'to', 'top', 'in', 'inn'];
      const words = shuffle([...pool]).slice(0, randInt(5, 8));
      return `words: ${words.join(' ')}\nfind: ${words[0].slice(0, 2)}`;
    },
  },
  pseudo: [
    'procedure insert(word)',
    '  node ← root',
    '  for each letter ch of word',
    '    if node has no child ch: create it',
    '    node ← node.child[ch]',
    '  mark node as the end of a word',
    'procedure startsWith(prefix)',
    '  walk the letters of prefix from the root (none if a letter is missing)',
    '  collect every word below that node in alphabetical order',
  ],
  run({ words, find }) {
    return record((r) => {
      const nodes = [{ id: 0, key: '•', children: [], end: false }];
      const child = (id, ch) => nodes[id].children.find((c) => nodes[c].key === ch);
      const view = (extra = {}, lists = []) => {
        const colors = {};
        nodes.forEach((n) => { if (n.end) colors[n.id] = 'done'; });
        Object.assign(colors, extra);
        return { kind: 'tree', nodes: nodes.map(({ id, key, children }) => ({ id, key, left: null, right: null, children: [...children] })), root: 0, colors, lists: copyLists(lists), probe: null };
      };
      const copyLists = (lists) => lists.map((list) => ({ label: list.label, items: [...list.items] }));
      const added = [];
      const addedList = () => [{ label: L('넣은 단어', 'Words'), items: [...added] }];
      r.step(1, L('뿌리 노드 하나에서 시작합니다.', 'Start with just the root.'), view(), {});
      for (const word of words) {
        let id = 0;
        const path = { 0: 'visited' };
        for (const ch of word) {
          let next = child(id, ch);
          if (next === undefined) {
            next = nodes.length;
            nodes.push({ id: next, key: ch, children: [], end: false });
            nodes[id].children.push(next);
            nodes[id].children.sort((x, y) => (nodes[x].key < nodes[y].key ? -1 : 1));
            path[next] = 'write';
            r.step(3, L(`"${word}": ${ch} 노드가 없어 새로 만듭니다.`, `"${word}": no ${ch} node, create one.`), view(path, addedList()), { word, ch });
          } else {
            path[next] = 'current';
            r.step(4, L(`"${word}": ${ch} 노드가 이미 있으니 따라 내려갑니다.`, `"${word}": the ${ch} node exists, follow it.`), view(path, addedList()), { word, ch });
            path[next] = 'visited';
          }
          id = next;
        }
        nodes[id].end = true;
        if (!added.includes(word)) added.push(word);
        r.step(5, L(`"${word}" 의 끝을 표시합니다.`, `Mark the end of "${word}".`), view({ ...path, [id]: 'found' }, addedList()), { word });
      }
      let id = 0;
      const path = { 0: 'current' };
      r.step(7, L(`접두사 "${find}" 를 따라 내려갑니다.`, `Walk down the prefix "${find}".`), view(path, addedList()), { prefix: find });
      for (const ch of find) {
        const next = child(id, ch);
        if (next === undefined) {
          r.step(7, L(`${ch} 노드가 없습니다. "${find}" 로 시작하는 단어가 없습니다.`, `There is no ${ch} node: no word starts with "${find}".`), view(path, [{ label: L('결과', 'Result'), items: ['none'] }]), { prefix: find, result: 'none' });
          return;
        }
        path[id] = 'visited';
        path[next] = 'current';
        id = next;
        r.step(7, L(`${ch} 로 내려갑니다.`, `Go down to ${ch}.`), view(path, addedList()), { prefix: find, ch });
      }
      const found = [];
      const marks = { ...path };
      const collect = (at, prefix) => {
        if (nodes[at].end) found.push(prefix);
        for (const c of nodes[at].children) { marks[c] = 'compare'; collect(c, prefix + nodes[c].key); }
      };
      collect(id, find);
      for (const word of found) {
        let at = 0;
        for (const ch of word) at = child(at, ch);
        marks[at] = 'found';
      }
      const result = found.length ? found.join(' ') : 'none';
      r.step(8, L(`"${find}" 로 시작하는 단어: ${result}`, `Words starting with "${find}": ${result}`), view(marks, [{ label: L('결과', 'Result'), items: found.length ? found : ['none'] }]), { prefix: find, result });
    });
  },
};

export const CLASSROOM = [gridBfs, greedyBestFirst, mazeDfs, subsetSum, permutations, sudoku, huffman, fractionalKnapsack, jobSequencing, avlTree, binaryHeap, trie];
