import { L, record, InputError, randInt } from './core.js';

/** Grid text: S start, G goal, # wall, . open. */
export function parseGrid(text) {
  const rows = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2 || rows.length > 24) throw new InputError('격자는 2~24줄이어야 합니다.', 'The grid needs 2–24 rows.');
  const cols = rows[0].length;
  if (cols < 2 || cols > 40) throw new InputError('한 줄은 2~40칸이어야 합니다.', 'Each row needs 2–40 cells.');
  if (rows.some((row) => row.length !== cols)) throw new InputError('모든 줄의 길이가 같아야 합니다.', 'All rows must have the same length.');
  let start = -1;
  let goal = -1;
  const walls = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * cols + c;
    if (ch === 'S' || ch === 's') { if (start >= 0) throw new InputError('S 는 하나만 둘 수 있습니다.', 'Only one S.'); start = i; }
    else if (ch === 'G' || ch === 'g') { if (goal >= 0) throw new InputError('G 는 하나만 둘 수 있습니다.', 'Only one G.'); goal = i; }
    else if (ch === '#') walls.push(i);
    else if (ch !== '.') throw new InputError(`알 수 없는 문자 "${ch}" (S G # . 만 사용)`, `Unknown character "${ch}" (use S G # .)`);
  }));
  if (start < 0 || goal < 0) throw new InputError('S(시작)와 G(목표)가 필요합니다.', 'S (start) and G (goal) are required.');
  return { rows: rows.length, cols, start, goal, walls };
}

export function gridToText({ rows, cols, start, goal, walls }) {
  const wall = new Set(walls);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      line += i === start ? 'S' : i === goal ? 'G' : wall.has(i) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function randomGrid() {
  const rows = 12;
  const cols = 22;
  const walls = [];
  const start = randInt(0, rows - 1) * cols;
  const goal = randInt(0, rows - 1) * cols + cols - 1;
  for (let i = 0; i < rows * cols; i++) if (i !== start && i !== goal && Math.random() < 0.28) walls.push(i);
  return gridToText({ rows, cols, start, goal, walls });
}

export const astar = {
  id: 'astar', category: 'path', view: 'grid',
  name: L('A* 경로 탐색', 'A* Pathfinding'),
  summary: L('f = g + h 가 가장 작은 칸부터 목표를 향해 탐색합니다.', 'Expands the cell with the smallest f = g + h.'),
  description: L(
    'A* 는 게임과 지도에서 널리 쓰는 **최단 경로** 탐색입니다. 각 칸마다 지금까지 온 거리 **g** 와 목표까지 남은 거리의 추정값 **h**(여기서는 맨해튼 거리)를 더한 **f = g + h** 가 가장 작은 칸부터 넓혀 갑니다.\n\nh 가 실제 거리보다 크지 않으면 항상 최단 경로를 찾으며, 목표 방향으로 집중하므로 BFS 보다 훨씬 적은 칸만 봅니다.\n\n격자를 **클릭**하면 벽을 놓거나 지울 수 있습니다. 초록 칸 = open(후보), 회색 = closed(확정), 노란 칸 = 경로. 칸 안의 숫자는 f 값입니다.',
    'A* is the go-to **shortest path** search in games and maps. For each cell it adds the distance travelled so far **g** and an estimate of the distance left **h** (Manhattan distance here), and always expands the cell with the smallest **f = g + h**.\n\nAs long as h never overestimates it finds a shortest path, and because it heads towards the goal it looks at far fewer cells than BFS.\n\n**Click** the grid to add or remove walls. Green = open (candidates), grey = closed (settled), yellow = path. The number in a cell is its f value.'),
  complexity: { best: 'O(E)', average: 'O(E log V)', worst: 'O(E log V)', space: 'O(V)' },
  traits: L('휴리스틱 · 최단 경로 · 격자', 'Heuristic · Shortest path · Grid'),
  input: {
    default: [
      '..........#.........',
      '..........#.........',
      '...S......#.........',
      '..........#.....G...',
      '......#####.........',
      '..........#.........',
      '..........#.........',
      '....................',
    ].join('\n'),
    hint: L('S = 시작, G = 목표, # = 벽, . = 빈칸. 격자를 클릭해 벽을 바꿀 수 있습니다.', 'S = start, G = goal, # = wall, . = open. Click the grid to toggle walls.'),
    parse: parseGrid,
    random: randomGrid,
  },
  pseudo: [
    'procedure AStar(grid, start, goal)',
    '  g[start] ← 0; f[start] ← h(start); open ← {start}',
    '  while open is not empty',
    '    u ← cell in open with the smallest f (then h)',
    '    if u = goal: return the path by following parent',
    '    move u from open to closed',
    '    for each neighbour v of u (up, right, down, left)',
    '      if v is a wall or closed: skip',
    '      if g[u] + 1 < g[v]',
    '        g[v] ← g[u] + 1; f[v] ← g[v] + h(v); parent[v] ← u',
    '        add v to open if it is not there',
    '  return "no path"',
  ],
  run(grid) {
    const { rows, cols, start, goal } = grid;
    const total = rows * cols;
    const wall = new Uint8Array(total);
    for (const i of grid.walls) wall[i] = 1;
    const h = (i) => Math.abs(Math.floor(i / cols) - Math.floor(goal / cols)) + Math.abs((i % cols) - (goal % cols));
    return record((r) => {
      const g = new Array(total).fill(Infinity);
      const f = new Array(total).fill(null);
      const parent = new Array(total).fill(-1);
      const state = new Array(total).fill('');
      for (let i = 0; i < total; i++) if (wall[i]) state[i] = 'wall';
      const open = [];
      g[start] = 0;
      f[start] = h(start);
      open.push(start);
      state[start] = 'open';
      const view = (extra = {}) => ({ kind: 'grid', rows, cols, start, goal, cells: [...state], values: [...f], path: [], ...extra });
      r.step(1, L(`시작 칸의 g = 0, h = ${h(start)}`, `Start cell: g = 0, h = ${h(start)}`), view(), { open: open.length });
      while (open.length) {
        let best = 0;
        for (let k = 1; k < open.length; k++) {
          const a = open[k];
          const b = open[best];
          if (f[a] < f[b] || (f[a] === f[b] && h(a) < h(b))) best = k;
        }
        const u = open[best];
        const ur = Math.floor(u / cols);
        const uc = u % cols;
        r.step(3, L(`open 에서 f 가 가장 작은 칸 (${ur}, ${uc}) 선택: f = ${g[u]} + ${h(u)} = ${f[u]}`, `Pick the open cell with the smallest f: (${ur}, ${uc}), f = ${g[u]} + ${h(u)} = ${f[u]}`), view({ current: u }), { u: `(${ur},${uc})`, g: g[u], h: h(u), f: f[u], open: open.length });
        if (u === goal) {
          const path = [];
          for (let x = u; x >= 0; x = parent[x]) path.push(x);
          path.reverse();
          for (const x of path) if (x !== start && x !== goal) state[x] = 'path';
          r.step(4, L(`목표 도착! 경로 길이 ${path.length - 1}`, `Goal reached! Path length ${path.length - 1}`), view({ path }), { length: path.length - 1 });
          return;
        }
        open.splice(best, 1);
        state[u] = 'closed';
        r.step(5, L(`(${ur}, ${uc}) 을(를) closed 로 옮깁니다.`, `Move (${ur}, ${uc}) to closed.`), view({ current: u }), { u: `(${ur},${uc})`, open: open.length });
        const neighbours = [[ur - 1, uc], [ur, uc + 1], [ur + 1, uc], [ur, uc - 1]];
        for (const [vr, vc] of neighbours) {
          if (vr < 0 || vc < 0 || vr >= rows || vc >= cols) continue;
          const v = vr * cols + vc;
          if (wall[v] || state[v] === 'closed') continue;
          if (g[u] + 1 < g[v]) {
            g[v] = g[u] + 1;
            f[v] = g[v] + h(v);
            parent[v] = u;
            if (state[v] !== 'open') { open.push(v); state[v] = 'open'; }
            r.step(9, L(`이웃 (${vr}, ${vc}): g = ${g[v]}, h = ${h(v)}, f = ${f[v]}`, `Neighbour (${vr}, ${vc}): g = ${g[v]}, h = ${h(v)}, f = ${f[v]}`), view({ current: u, probe: v }), { v: `(${vr},${vc})`, g: g[v], h: h(v), f: f[v] });
          }
        }
      }
      r.step(11, L('open 이 비었습니다. 목표로 가는 경로가 없습니다.', 'Open is empty: there is no path to the goal.'), view(), {});
    });
  },
};

export const PATHFINDING = [astar];
