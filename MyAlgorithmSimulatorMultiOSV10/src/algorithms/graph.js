import { L, record, parseKeyed, InputError, randInt, copy } from './core.js';

// ───────────────────────── input: one edge per line "A B [weight]", plus "start: A"

/**
 * Parses an edge list. Vertices are numbered in order of first appearance (the
 * sample programs number them the same way). Returns { names, edges: [{u, v, w}], start, directed }.
 */
export function parseGraph(text, { weighted = false, directed = false, needStart = true, allowNegative = false, maxNodes = 16 } = {}) {
  const { keys, rest } = parseKeyed(text);
  const names = [];
  const index = (name) => {
    let i = names.indexOf(name);
    if (i < 0) {
      if (names.length >= maxNodes) throw new InputError(`정점은 최대 ${maxNodes}개입니다.`, `At most ${maxNodes} vertices.`);
      names.push(name);
      i = names.length - 1;
    }
    return i;
  };
  const edges = [];
  for (const line of rest) {
    const parts = line.split(/[\s,]+|->|--|-(?=\D)/).filter(Boolean);
    if (parts.length === 1) { index(parts[0]); continue; }
    if (parts.length < 2 || parts.length > 3) throw new InputError(`이해할 수 없는 줄: "${line}"`, `Cannot read the line "${line}"`);
    const [a, b, wText] = parts;
    if (a.length > 6 || b.length > 6) throw new InputError('정점 이름은 6글자 이하로 쓰세요.', 'Vertex names must be at most 6 characters.');
    let w = 1;
    if (weighted) {
      w = Number(wText);
      if (!Number.isInteger(w)) throw new InputError(`"${line}" 에 정수 가중치가 필요합니다.`, `"${line}" needs an integer weight.`);
      if (!allowNegative && w < 0) throw new InputError('이 알고리즘은 음수 가중치를 쓸 수 없습니다.', 'This algorithm does not allow negative weights.');
      if (Math.abs(w) > 999) throw new InputError('가중치는 −999~999 사이여야 합니다.', 'Weights must be between −999 and 999.');
    }
    edges.push({ u: index(a), v: index(b), w });
  }
  if (edges.length > 40) throw new InputError('간선은 최대 40개입니다.', 'At most 40 edges.');
  if (!names.length) throw new InputError('간선을 한 줄에 하나씩 입력하세요. 예: A B 4', 'Enter one edge per line, e.g. A B 4');
  let start = 0;
  if (needStart) {
    const s = keys.start ?? names[0];
    start = names.indexOf(s);
    if (start < 0) throw new InputError(`시작 정점 "${s}" 이(가) 그래프에 없습니다.`, `The start vertex "${s}" is not in the graph.`);
  }
  return { names, edges, start, directed, weighted };
}

/** Neighbours in edge-list order: [{ v, w, e }] where e is the edge index. */
export function adjacency(g) {
  const adj = g.names.map(() => []);
  g.edges.forEach(({ u, v, w }, e) => {
    adj[u].push({ v, w, e });
    if (!g.directed) adj[v].push({ v: u, w, e });
  });
  return adj;
}

/** Deterministic force-directed layout in the unit square. */
export function layoutGraph(n, edges) {
  if (n === 1) return [{ x: 0.5, y: 0.5 }];
  const pos = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: 0.5 + 0.35 * Math.cos(angle), y: 0.5 + 0.35 * Math.sin(angle) };
  });
  const k = 0.9 / Math.sqrt(n);
  let temperature = 0.08;
  for (let iter = 0; iter < 300; iter++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        const d = Math.max(0.01, Math.hypot(dx, dy));
        const f = (k * k) / d;
        dx /= d; dy /= d;
        disp[i].x += dx * f; disp[i].y += dy * f;
        disp[j].x -= dx * f; disp[j].y -= dy * f;
      }
    }
    for (const { u, v } of edges) {
      if (u === v) continue;
      let dx = pos[u].x - pos[v].x;
      let dy = pos[u].y - pos[v].y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      dx /= d; dy /= d;
      disp[u].x -= dx * f; disp[u].y -= dy * f;
      disp[v].x += dx * f; disp[v].y += dy * f;
    }
    for (let i = 0; i < n; i++) {
      // A light pull to the centre keeps disconnected parts on screen.
      disp[i].x += (0.5 - pos[i].x) * 0.3;
      disp[i].y += (0.5 - pos[i].y) * 0.3;
      const d = Math.max(1e-6, Math.hypot(disp[i].x, disp[i].y));
      const step = Math.min(d, temperature);
      pos[i].x += (disp[i].x / d) * step;
      pos[i].y += (disp[i].y / d) * step;
    }
    temperature *= 0.985;
  }
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  return pos.map((p) => ({
    x: 0.08 + 0.84 * (x1 - x0 < 1e-6 ? 0.5 : (p.x - x0) / span + (1 - (x1 - x0) / span) / 2),
    y: 0.08 + 0.84 * (y1 - y0 < 1e-6 ? 0.5 : (p.y - y0) / span + (1 - (y1 - y0) / span) / 2),
  }));
}

/** The fixed part of a graph view (shared by all frames of a run). */
function graphBase(g) {
  const pos = layoutGraph(g.names.length, g.edges);
  return {
    nodes: g.names.map((label, i) => ({ id: i, label, x: pos[i].x, y: pos[i].y })),
    edges: g.edges.map(({ u, v, w }) => ({ u, v, w })),
    directed: g.directed,
    weighted: g.weighted,
  };
}

/**
 * Graph view snapshot. node: index → current | visited | frontier | done | start | error;
 * edge: index → tree | active | rejected | relaxed; note: index → text under the vertex.
 */
function graphView(base, { node = {}, edge = {}, note = {}, lists = [], result = null } = {}) {
  return { kind: 'graph', graph: base, node: { ...node }, edge: { ...edge }, note: { ...note }, lists: copy(lists), result };
}

const INF = Infinity;
const fmt = (d) => (d === INF ? '∞' : String(d));

function randomGraph({ weighted, directed, dag = false, negative = false }) {
  const n = randInt(5, 8);
  const names = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  const set = new Set();
  const lines = [];
  const add = (a, b) => {
    if (a === b) return;
    const key = directed ? `${a}-${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (set.has(key)) return;
    set.add(key);
    const w = weighted ? (negative && Math.random() < 0.2 ? -randInt(1, 3) : randInt(1, 15)) : null;
    lines.push(`${names[a]} ${names[b]}${w === null ? '' : ` ${w}`}`);
  };
  // A spanning chain keeps the graph connected; extra edges make it interesting.
  const order = names.map((_, i) => i);
  for (let i = 1; i < n; i++) {
    const a = order[randInt(0, i - 1)];
    if (dag) add(a, order[i]); else add(order[i], a);
  }
  for (let t = 0; t < n; t++) {
    const a = randInt(0, n - 1);
    const b = randInt(0, n - 1);
    if (dag) add(Math.min(a, b), Math.max(a, b)); else add(a, b);
  }
  return lines.join('\n');
}

const graphInput = (def, opts, { start = true } = {}) => ({
  default: def,
  hint: L(
    `한 줄에 간선 하나: "A B${opts.weighted ? ' 가중치' : ''}"${start ? ', 시작 정점은 "start: A"' : ''}${opts.directed ? ' (방향: A → B)' : ''}`,
    `One edge per line: "A B${opts.weighted ? ' weight' : ''}"${start ? ', start vertex "start: A"' : ''}${opts.directed ? ' (directed A → B)' : ''}`),
  parse: (text) => parseGraph(text, { ...opts, needStart: start }),
  random: () => randomGraph(opts) + (start ? '\nstart: A' : ''),
});

// ───────────────────────── traversal

export const bfs = {
  id: 'bfs', category: 'graph', view: 'graph',
  name: L('너비 우선 탐색 (BFS)', 'Breadth-First Search (BFS)'),
  summary: L('가까운 정점부터 큐를 이용해 넓게 탐색합니다.', 'Explores level by level with a queue.'),
  description: L(
    'BFS 는 시작 정점에서 **가까운 정점부터** 차례로 방문합니다. 방문할 정점을 **큐(Queue)**에 넣고, 먼저 넣은 것부터 꺼내 그 이웃을 큐에 추가합니다.\n\n가중치가 없는 그래프에서 **최단 경로(간선 수)**를 구할 때 씁니다. 정점 아래 숫자는 시작점에서의 거리(단계)입니다.',
    'BFS visits vertices **closest first**. Vertices waiting to be visited sit in a **queue**: the oldest is taken out and its unvisited neighbours are added.\n\nIt finds **shortest paths (in edges)** in unweighted graphs. The number under each vertex is its distance from the start.'),
  complexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)', space: 'O(V)' },
  traits: L('큐 · 최단 경로(무가중치)', 'Queue · Unweighted shortest paths'),
  input: graphInput('A B\nA C\nB D\nB E\nC F\nC G\nE H\nF H\nstart: A', { weighted: false, directed: false }),
  pseudo: [
    'procedure BFS(G, s)',
    '  visited ← {s}; Q ← [s]',
    '  while Q is not empty',
    '    u ← Q.dequeue(); visit(u)',
    '    for each v adjacent to u',
    '      if v is not visited',
    '        visited.add(v); Q.enqueue(v)',
    '  return visit order',
  ],
  run(g) {
    const base = graphBase(g);
    const adj = adjacency(g);
    const L_ = (x) => g.names[x];
    return record((r) => {
      const node = {};
      const edge = {};
      const note = {};
      const order = [];
      const q = [g.start];
      const visited = new Set([g.start]);
      note[g.start] = '0';
      const dist = { [g.start]: 0 };
      node[g.start] = 'frontier';
      const lists = () => [{ label: L('큐 (Queue)', 'Queue'), items: q.map(L_) }, { label: L('방문 순서', 'Visit order'), items: order.map(L_) }];
      r.step(1, L(`시작 정점 ${L_(g.start)} 을(를) 큐에 넣습니다.`, `Enqueue the start vertex ${L_(g.start)}.`), graphView(base, { node, edge, note, lists: lists() }), { s: L_(g.start) });
      while (q.length) {
        const u = q.shift();
        order.push(u);
        node[u] = 'current';
        r.step(3, L(`큐에서 ${L_(u)} 을(를) 꺼내 방문합니다.`, `Dequeue and visit ${L_(u)}.`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u) });
        for (const { v, e } of adj[u]) {
          const prev = edge[e];
          edge[e] = 'active';
          r.step(5, L(`이웃 ${L_(v)}: ${visited.has(v) ? '이미 방문함' : '아직 방문하지 않음'}`, `Neighbour ${L_(v)}: ${visited.has(v) ? 'already visited' : 'not visited yet'}`), graphView(base, { node: { ...node, [v]: node[v] ?? 'frontier' }, edge, note, lists: lists() }), { u: L_(u), v: L_(v) });
          if (!visited.has(v)) {
            visited.add(v);
            q.push(v);
            dist[v] = dist[u] + 1;
            note[v] = String(dist[v]);
            node[v] = 'frontier';
            edge[e] = 'tree';
            r.step(6, L(`${L_(v)} 을(를) 큐에 넣습니다 (거리 ${dist[v]}).`, `Enqueue ${L_(v)} (distance ${dist[v]}).`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u), v: L_(v) });
          } else {
            edge[e] = prev;
          }
        }
        node[u] = 'visited';
      }
      r.step(7, L(`탐색 완료. 방문 순서: ${order.map(L_).join(' → ')}`, `Done. Visit order: ${order.map(L_).join(' → ')}`), graphView(base, { node, edge, note, lists: lists(), result: order.map(L_).join(' → ') }), {});
    });
  },
};

export const dfs = {
  id: 'dfs', category: 'graph', view: 'graph',
  name: L('깊이 우선 탐색 (DFS)', 'Depth-First Search (DFS)'),
  summary: L('갈 수 있는 데까지 깊이 들어간 뒤 되돌아옵니다.', 'Goes as deep as possible, then backtracks.'),
  description: L(
    'DFS 는 한 이웃을 골라 **갈 수 있는 데까지 깊이** 들어가고, 더 갈 곳이 없으면 되돌아와(백트래킹) 다른 길을 찾습니다. 재귀 호출(또는 스택)로 구현합니다.\n\n사이클 찾기, 연결 요소, 위상 정렬, 미로 탐색 등에 쓰입니다. 오른쪽 아래 목록은 현재 **호출 스택**입니다.',
    'DFS follows one neighbour **as deep as it can**, and when there is nowhere left to go it backtracks and tries another path. It is written with recursion (or a stack).\n\nIt is used for cycle detection, connected components, topological sorting and mazes. The list shows the current **call stack**.'),
  complexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)', space: 'O(V)' },
  traits: L('재귀 · 스택 · 백트래킹', 'Recursion · Stack · Backtracking'),
  input: graphInput('A B\nA C\nB D\nB E\nC F\nC G\nE H\nF H\nstart: A', { weighted: false, directed: false }),
  pseudo: [
    'procedure DFS(G, u)',
    '  visited.add(u); visit(u)',
    '  for each v adjacent to u',
    '    if v is not visited',
    '      DFS(G, v)',
    '  return   // back to the caller',
  ],
  run(g) {
    const base = graphBase(g);
    const adj = adjacency(g);
    const L_ = (x) => g.names[x];
    return record((r) => {
      const node = {};
      const edge = {};
      const note = {};
      const order = [];
      const stack = [];
      const visited = new Set();
      const lists = () => [{ label: L('호출 스택', 'Call stack'), items: stack.map(L_) }, { label: L('방문 순서', 'Visit order'), items: order.map(L_) }];
      const visit = (u) => {
        visited.add(u);
        order.push(u);
        stack.push(u);
        node[u] = 'current';
        note[u] = String(order.length);
        r.step(1, L(`${L_(u)} 방문 (${order.length}번째)`, `Visit ${L_(u)} (#${order.length})`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u) });
        for (const { v, e } of adj[u]) {
          const prev = edge[e];
          edge[e] = 'active';
          r.step(3, L(`${L_(u)} 의 이웃 ${L_(v)}: ${visited.has(v) ? '이미 방문함' : '방문하러 갑니다'}`, `Neighbour ${L_(v)} of ${L_(u)}: ${visited.has(v) ? 'already visited' : 'go there'}`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u), v: L_(v) });
          if (!visited.has(v)) {
            edge[e] = 'tree';
            node[u] = 'frontier';
            visit(v);
            node[u] = 'current';
            r.step(4, L(`${L_(v)} 에서 ${L_(u)} 로 되돌아옴`, `Back from ${L_(v)} to ${L_(u)}`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u) });
          } else {
            edge[e] = prev;
          }
        }
        node[u] = 'visited';
        stack.pop();
        r.step(5, L(`${L_(u)} 의 이웃을 모두 확인했습니다.`, `All neighbours of ${L_(u)} checked.`), graphView(base, { node, edge, note, lists: lists() }), { u: L_(u) });
      };
      visit(g.start);
      r.step(5, L(`탐색 완료. 방문 순서: ${order.map(L_).join(' → ')}`, `Done. Visit order: ${order.map(L_).join(' → ')}`), graphView(base, { node, edge, note, lists: lists(), result: order.map(L_).join(' → ') }), {});
    });
  },
};

// ───────────────────────── shortest paths

export const dijkstra = {
  id: 'dijkstra', category: 'graph', view: 'graph',
  name: L('다익스트라 최단 경로', "Dijkstra's Shortest Path"),
  summary: L('거리가 가장 짧은 정점을 확정해 나갑니다.', 'Settles the closest unvisited vertex each step.'),
  description: L(
    '다익스트라 알고리즘은 시작점에서 각 정점까지의 **최단 거리**를 구합니다. 아직 확정되지 않은 정점 중 거리가 가장 짧은 정점을 골라 확정하고, 그 정점을 거쳐 가는 것이 더 짧은 이웃의 거리를 **갱신(relax)**합니다.\n\n가중치가 **음수가 아닐 때만** 올바릅니다. 여기서는 배열로 최솟값을 찾는 O(V²) 버전을 씁니다(우선순위 큐를 쓰면 O((V+E) log V)).',
    "Dijkstra's algorithm finds the **shortest distance** from the start to every vertex. It repeatedly settles the unsettled vertex with the smallest distance and **relaxes** its neighbours: if going through it is shorter, their distance is updated.\n\nIt is only correct for **non-negative** weights. This is the O(V²) array version (a priority queue gives O((V+E) log V))."),
  complexity: { best: 'O(V²)', average: 'O(V²)', worst: 'O(V²)', space: 'O(V)' },
  traits: L('그리디 · 음수 가중치 불가', 'Greedy · No negative weights'),
  input: graphInput('A B 4\nA C 2\nB C 1\nB D 5\nC D 8\nC E 10\nD E 2\nD F 6\nE F 3\nstart: A', { weighted: true, directed: false }),
  pseudo: [
    'procedure Dijkstra(G, s)',
    '  dist[v] ← ∞ for all v; dist[s] ← 0',
    '  repeat n times',
    '    u ← unvisited vertex with the smallest dist',
    '    if dist[u] = ∞: break',
    '    mark u as visited',
    '    for each edge (u, v, w)',
    '      if dist[u] + w < dist[v]',
    '        dist[v] ← dist[u] + w; prev[v] ← u',
    '  return dist, prev',
  ],
  run(g) {
    const base = graphBase(g);
    const adj = adjacency(g);
    const n = g.names.length;
    const L_ = (x) => g.names[x];
    return record((r) => {
      const dist = Array(n).fill(INF);
      const prevEdge = Array(n).fill(-1);
      const done = Array(n).fill(false);
      dist[g.start] = 0;
      const node = {};
      const edge = {};
      const note = () => Object.fromEntries(dist.map((d, i) => [i, fmt(d)]));
      const treeEdges = () => Object.fromEntries(prevEdge.filter((e) => e >= 0).map((e) => [e, 'tree']));
      const lists = () => [{ label: L('dist', 'dist'), items: dist.map((d, i) => `${L_(i)}:${fmt(d)}`) }];
      r.step(1, L(`dist[${L_(g.start)}] = 0, 나머지는 ∞`, `dist[${L_(g.start)}] = 0, all others ∞`), graphView(base, { node: { [g.start]: 'start' }, note: note(), lists: lists() }), {});
      for (let round = 0; round < n; round++) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] === INF) {
          r.step(4, L('남은 정점에 도달할 수 없습니다.', 'The remaining vertices are unreachable.'), graphView(base, { node, edge: treeEdges(), note: note(), lists: lists() }), {});
          break;
        }
        done[u] = true;
        node[u] = 'current';
        r.step(3, L(`방문하지 않은 정점 중 dist 가 가장 작은 ${L_(u)} (${dist[u]}) 확정`, `Settle ${L_(u)}, the unvisited vertex with the smallest dist (${dist[u]})`), graphView(base, { node, edge: treeEdges(), note: note(), lists: lists() }), { u: L_(u), 'dist[u]': dist[u] });
        for (const { v, w, e } of adj[u]) {
          if (done[v]) continue;
          const better = dist[u] + w < dist[v];
          r.step(7, L(`${L_(u)}→${L_(v)}: ${dist[u]} + ${w} = ${dist[u] + w} ${better ? '<' : '≥'} ${fmt(dist[v])}`, `${L_(u)}→${L_(v)}: ${dist[u]} + ${w} = ${dist[u] + w} ${better ? '<' : '≥'} ${fmt(dist[v])}`), graphView(base, { node: { ...node, [v]: 'frontier' }, edge: { ...treeEdges(), [e]: 'active' }, note: note(), lists: lists() }), { u: L_(u), v: L_(v), w });
          if (better) {
            dist[v] = dist[u] + w;
            prevEdge[v] = e;
            r.step(8, L(`dist[${L_(v)}] ← ${dist[v]} (${L_(u)} 경유)`, `dist[${L_(v)}] ← ${dist[v]} (via ${L_(u)})`), graphView(base, { node: { ...node, [v]: 'frontier' }, edge: { ...treeEdges(), [e]: 'relaxed' }, note: note(), lists: lists() }), { u: L_(u), v: L_(v), [`dist[${L_(v)}]`]: dist[v] });
          }
        }
        node[u] = 'done';
      }
      const summary = dist.map((d, i) => `${L_(i)}=${fmt(d)}`).join(', ');
      r.step(9, L(`완료. 최단 거리: ${summary}`, `Done. Shortest distances: ${summary}`), graphView(base, { node, edge: treeEdges(), note: note(), lists: lists(), result: summary }), {});
    });
  },
};

export const bellmanFord = {
  id: 'bellman-ford', category: 'graph', view: 'graph',
  name: L('벨만-포드 최단 경로', 'Bellman–Ford'),
  summary: L('모든 간선을 n−1번 완화하며, 음수 사이클도 찾습니다.', 'Relaxes every edge n−1 times; detects negative cycles.'),
  description: L(
    '벨만-포드 알고리즘은 **모든 간선을 n − 1번** 반복해서 완화(relax)합니다. 최단 경로는 간선을 최대 n − 1개 쓰기 때문에 그만큼 반복하면 모든 거리가 확정됩니다.\n\n다익스트라와 달리 **음수 가중치**도 처리하며, n번째 반복에서도 거리가 줄어들면 **음수 사이클**이 있다는 뜻입니다. 한 바퀴 동안 변화가 없으면 일찍 끝냅니다.',
    'Bellman–Ford relaxes **every edge n − 1 times**. A shortest path uses at most n − 1 edges, so after that many rounds all distances are final.\n\nUnlike Dijkstra it handles **negative weights**, and if any distance still shrinks in an extra round there is a **negative cycle**. It stops early when a round changes nothing.'),
  complexity: { best: 'O(E)', average: 'O(V·E)', worst: 'O(V·E)', space: 'O(V)' },
  traits: L('동적 계획법 · 음수 가중치 허용 · 방향 그래프', 'Dynamic programming · Negative weights · Directed'),
  input: graphInput('S A 10\nS E 8\nA C 2\nB A 1\nC B -2\nD A -4\nD C -1\nE D 1\nstart: S', { weighted: true, directed: true, allowNegative: true, negative: true }),
  pseudo: [
    'procedure BellmanFord(G, s)',
    '  dist[v] ← ∞ for all v; dist[s] ← 0',
    '  repeat n − 1 times',
    '    for each edge (u, v, w)',
    '      if dist[u] + w < dist[v]',
    '        dist[v] ← dist[u] + w',
    '  for each edge (u, v, w)',
    '    if dist[u] + w < dist[v]: negative cycle!',
    '  return dist',
  ],
  run(g) {
    const base = graphBase(g);
    const n = g.names.length;
    const L_ = (x) => g.names[x];
    return record((r) => {
      const dist = Array(n).fill(INF);
      const prevEdge = Array(n).fill(-1);
      dist[g.start] = 0;
      const note = () => Object.fromEntries(dist.map((d, i) => [i, fmt(d)]));
      const treeEdges = () => Object.fromEntries(prevEdge.filter((e) => e >= 0).map((e) => [e, 'tree']));
      r.step(1, L(`dist[${L_(g.start)}] = 0, 나머지는 ∞`, `dist[${L_(g.start)}] = 0, all others ∞`), graphView(base, { node: { [g.start]: 'start' }, note: note() }), {});
      for (let round = 1; round < n; round++) {
        let changed = false;
        r.step(2, L(`${round}번째 반복`, `Round ${round}`), graphView(base, { node: { [g.start]: 'start' }, edge: treeEdges(), note: note() }), { round });
        for (let e = 0; e < g.edges.length; e++) {
          const { u, v, w } = g.edges[e];
          if (dist[u] === INF) continue;
          const better = dist[u] + w < dist[v];
          r.step(4, L(`${L_(u)}→${L_(v)} (${w}): ${dist[u]} + ${w} = ${dist[u] + w} ${better ? '<' : '≥'} ${fmt(dist[v])}`, `${L_(u)}→${L_(v)} (${w}): ${dist[u]} + ${w} = ${dist[u] + w} ${better ? '<' : '≥'} ${fmt(dist[v])}`), graphView(base, { node: { [u]: 'current', [v]: 'frontier' }, edge: { ...treeEdges(), [e]: 'active' }, note: note() }), { round, u: L_(u), v: L_(v), w });
          if (better) {
            dist[v] = dist[u] + w;
            prevEdge[v] = e;
            changed = true;
            r.step(5, L(`dist[${L_(v)}] ← ${dist[v]}`, `dist[${L_(v)}] ← ${dist[v]}`), graphView(base, { node: { [u]: 'current', [v]: 'frontier' }, edge: { ...treeEdges(), [e]: 'relaxed' }, note: note() }), { round, [`dist[${L_(v)}]`]: dist[v] });
          }
        }
        if (!changed) {
          r.step(2, L('이번 반복에서 바뀐 거리가 없으므로 일찍 끝냅니다.', 'Nothing changed in this round: stop early.'), graphView(base, { edge: treeEdges(), note: note() }), { round });
          break;
        }
      }
      for (let e = 0; e < g.edges.length; e++) {
        const { u, v, w } = g.edges[e];
        if (dist[u] !== INF && dist[u] + w < dist[v]) {
          r.step(7, L(`${L_(u)}→${L_(v)} 가 아직도 줄어듭니다: 음수 사이클이 있습니다!`, `${L_(u)}→${L_(v)} still improves: negative cycle!`), graphView(base, { node: { [u]: 'error', [v]: 'error' }, edge: { [e]: 'rejected' }, note: note(), result: L('음수 사이클', 'Negative cycle') }), {});
          return;
        }
      }
      const summary = dist.map((d, i) => `${L_(i)}=${fmt(d)}`).join(', ');
      r.step(8, L(`음수 사이클 없음. 최단 거리: ${summary}`, `No negative cycle. Shortest distances: ${summary}`), graphView(base, { node: Object.fromEntries(dist.map((_, i) => [i, 'done'])), edge: treeEdges(), note: note(), result: summary }), {});
    });
  },
};

export const floydWarshall = {
  id: 'floyd-warshall', category: 'graph', view: 'table',
  name: L('플로이드-워셜', 'Floyd–Warshall'),
  summary: L('모든 정점 쌍의 최단 거리를 표로 구합니다.', 'All-pairs shortest paths in a table.'),
  description: L(
    '플로이드-워셜 알고리즘은 **모든 정점 쌍** 사이의 최단 거리를 구합니다. 정점 k 를 하나씩 "거쳐 갈 수 있는 정점"으로 추가하면서, i→k→j 가 i→j 보다 짧으면 표를 갱신합니다.\n\n세 겹 반복문으로 O(V³) 이며, 강조된 행 k 와 열 k 의 값이 각 칸의 갱신에 쓰입니다.',
    'Floyd–Warshall computes shortest distances between **all pairs** of vertices. It adds each vertex k in turn as an allowed intermediate and updates the table whenever i→k→j is shorter than i→j.\n\nThree nested loops give O(V³); the highlighted row k and column k feed every update.'),
  complexity: { best: 'O(V³)', average: 'O(V³)', worst: 'O(V³)', space: 'O(V²)' },
  traits: L('동적 계획법 · 방향 그래프', 'Dynamic programming · Directed'),
  input: graphInput('A B 3\nA D 7\nB A 8\nB C 2\nC A 5\nC D 1\nD A 2', { weighted: true, directed: true, allowNegative: true, maxNodes: 8 }, { start: false }),
  pseudo: [
    'procedure FloydWarshall(G)',
    '  dist[i][j] ← w(i, j); dist[i][i] ← 0; otherwise ∞',
    '  for k ← 0 to n − 1',
    '    for i ← 0 to n − 1',
    '      for j ← 0 to n − 1',
    '        if dist[i][k] + dist[k][j] < dist[i][j]',
    '          dist[i][j] ← dist[i][k] + dist[k][j]',
    '  return dist',
  ],
  run(g) {
    const n = g.names.length;
    return record((r) => {
      const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
      for (const { u, v, w } of g.edges) d[u][v] = Math.min(d[u][v], w);
      const view = (colors = {}, title = null) => ({ kind: 'table', title, rowHeaders: [...g.names], colHeaders: [...g.names], cells: d.map((row) => row.map(fmt)), colors: { ...colors } });
      r.step(1, L('간선의 가중치로 표를 채웁니다. 간선이 없으면 ∞', 'Fill the table with the edge weights; ∞ where there is no edge'), view(), {});
      for (let k = 0; k < n; k++) {
        const kColors = {};
        for (let x = 0; x < n; x++) { kColors[`${k},${x}`] = 'source'; kColors[`${x},${k}`] = 'source'; }
        r.step(2, L(`k = ${g.names[k]}: ${g.names[k]} 를 거쳐 가는 경로를 고려합니다.`, `k = ${g.names[k]}: allow paths through ${g.names[k]}`), view(kColors, `k = ${g.names[k]}`), { k: g.names[k] });
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i === k || j === k || i === j || d[i][k] === INF || d[k][j] === INF) continue;
            const via = d[i][k] + d[k][j];
            const better = via < d[i][j];
            const colors = { ...kColors, [`${i},${k}`]: 'compare', [`${k},${j}`]: 'compare', [`${i},${j}`]: 'active' };
            r.step(5, L(`${g.names[i]}→${g.names[k]}→${g.names[j]}: ${d[i][k]} + ${d[k][j]} = ${via} ${better ? '<' : '≥'} ${fmt(d[i][j])}`, `${g.names[i]}→${g.names[k]}→${g.names[j]}: ${d[i][k]} + ${d[k][j]} = ${via} ${better ? '<' : '≥'} ${fmt(d[i][j])}`), view(colors, `k = ${g.names[k]}`), { k: g.names[k], i: g.names[i], j: g.names[j] });
            if (better) {
              d[i][j] = via;
              r.step(6, L(`dist[${g.names[i]}][${g.names[j]}] ← ${via}`, `dist[${g.names[i]}][${g.names[j]}] ← ${via}`), view({ ...kColors, [`${i},${j}`]: 'write' }, `k = ${g.names[k]}`), { k: g.names[k], i: g.names[i], j: g.names[j] });
            }
          }
        }
      }
      const negative = d.some((row, i) => row[i] < 0);
      r.step(7, negative ? L('대각선에 음수가 있습니다: 음수 사이클!', 'A negative value on the diagonal: negative cycle!') : L('완료. 모든 쌍의 최단 거리입니다.', 'Done: shortest distances between all pairs.'), view(Object.fromEntries(d.flatMap((row, i) => row.map((_, j) => [`${i},${j}`, 'done'])))), {});
    });
  },
};

// ───────────────────────── minimum spanning trees

export const prim = {
  id: 'prim', category: 'graph', view: 'graph',
  name: L('프림 최소 신장 트리', "Prim's MST"),
  summary: L('트리에 가장 싸게 붙일 수 있는 정점을 하나씩 추가합니다.', 'Grows the tree by the cheapest vertex to attach.'),
  description: L(
    '프림 알고리즘은 **최소 신장 트리(MST)**, 즉 모든 정점을 잇는 간선 가중치 합이 가장 작은 트리를 만듭니다. 시작 정점 하나에서 출발해, 트리에 **가장 싼 간선으로 연결할 수 있는 정점**을 하나씩 추가합니다.\n\nkey[v] 는 v 를 트리에 붙이는 최소 비용입니다(정점 아래 숫자).',
    "Prim's algorithm builds a **minimum spanning tree (MST)** — the tree connecting all vertices with the smallest total weight. Starting from one vertex it repeatedly adds the **vertex that can be attached with the cheapest edge**.\n\nkey[v] is the cheapest cost to attach v (shown under each vertex)."),
  complexity: { best: 'O(V²)', average: 'O(V²)', worst: 'O(V²)', space: 'O(V)' },
  traits: L('그리디 · 무방향 가중치 그래프', 'Greedy · Undirected weighted'),
  input: graphInput('A B 7\nA D 5\nB C 8\nB D 9\nB E 7\nC E 5\nD E 15\nD F 6\nE F 8\nE G 9\nF G 11\nstart: A', { weighted: true, directed: false }),
  pseudo: [
    'procedure Prim(G, s)',
    '  key[v] ← ∞ for all v; key[s] ← 0',
    '  repeat n times',
    '    u ← vertex not in the tree with the smallest key',
    '    add u to the tree (with edge parent[u]–u)',
    '    for each edge (u, v, w)',
    '      if v is not in the tree and w < key[v]',
    '        key[v] ← w; parent[v] ← u',
    '  return the tree edges',
  ],
  run(g) {
    const base = graphBase(g);
    const adj = adjacency(g);
    const n = g.names.length;
    const L_ = (x) => g.names[x];
    return record((r) => {
      const key = Array(n).fill(INF);
      const parentEdge = Array(n).fill(-1);
      const inTree = Array(n).fill(false);
      key[g.start] = 0;
      const node = {};
      const tree = {};
      let total = 0;
      const mst = [];
      const note = () => Object.fromEntries(key.map((k, i) => [i, inTree[i] ? '✓' : fmt(k)]));
      const lists = () => [{ label: L('MST 간선', 'MST edges'), items: mst }];
      r.step(1, L(`key[${L_(g.start)}] = 0 에서 시작합니다.`, `Start with key[${L_(g.start)}] = 0.`), graphView(base, { node: { [g.start]: 'start' }, note: note(), lists: lists() }), {});
      for (let round = 0; round < n; round++) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || key[i] < key[u])) u = i;
        if (key[u] === INF) {
          r.step(3, L('나머지 정점은 연결되어 있지 않습니다 (신장 숲).', 'The remaining vertices are not connected (spanning forest).'), graphView(base, { node, edge: tree, note: note(), lists: lists() }), {});
          break;
        }
        inTree[u] = true;
        node[u] = 'done';
        if (parentEdge[u] >= 0) {
          tree[parentEdge[u]] = 'tree';
          const { u: a, v: b, w } = g.edges[parentEdge[u]];
          total += w;
          mst.push(`${L_(a)}-${L_(b)} (${w})`);
        }
        r.step(4, L(`key 가 가장 작은 ${L_(u)} (${key[u]}) 을(를) 트리에 추가`, `Add ${L_(u)} (key ${key[u]}) to the tree`), graphView(base, { node: { ...node, [u]: 'current' }, edge: tree, note: note(), lists: lists() }), { u: L_(u), total });
        for (const { v, w, e } of adj[u]) {
          if (inTree[v]) continue;
          const better = w < key[v];
          r.step(6, L(`간선 ${L_(u)}-${L_(v)} (${w}) ${better ? '<' : '≥'} key[${L_(v)}] = ${fmt(key[v])}`, `Edge ${L_(u)}-${L_(v)} (${w}) ${better ? '<' : '≥'} key[${L_(v)}] = ${fmt(key[v])}`), graphView(base, { node: { ...node, [u]: 'current', [v]: 'frontier' }, edge: { ...tree, [e]: 'active' }, note: note(), lists: lists() }), { u: L_(u), v: L_(v), w });
          if (better) {
            key[v] = w;
            parentEdge[v] = e;
            r.step(7, L(`key[${L_(v)}] ← ${w}, parent[${L_(v)}] ← ${L_(u)}`, `key[${L_(v)}] ← ${w}, parent[${L_(v)}] ← ${L_(u)}`), graphView(base, { node: { ...node, [u]: 'current', [v]: 'frontier' }, edge: { ...tree, [e]: 'relaxed' }, note: note(), lists: lists() }), { u: L_(u), v: L_(v), w });
          }
        }
      }
      r.step(8, L(`완료. MST 가중치 합 = ${total}`, `Done. MST total weight = ${total}`), graphView(base, { node, edge: tree, note: note(), lists: lists(), result: `${total}` }), { total });
    });
  },
};

export const kruskal = {
  id: 'kruskal', category: 'graph', view: 'graph',
  name: L('크루스칼 최소 신장 트리', "Kruskal's MST"),
  summary: L('가벼운 간선부터, 사이클이 생기지 않으면 고릅니다.', 'Takes the lightest edges that do not form a cycle.'),
  description: L(
    '크루스칼 알고리즘은 간선을 **가중치 순으로 정렬**한 뒤 가벼운 것부터 하나씩 보면서, 그 간선이 **사이클을 만들지 않으면** 최소 신장 트리에 넣습니다.\n\n두 정점이 이미 연결되어 있는지는 **유니온-파인드(서로소 집합)**로 빠르게 확인합니다. 정점 아래 글자는 그 정점이 속한 집합의 대표입니다.',
    "Kruskal's algorithm **sorts the edges by weight** and takes them from the lightest, adding each one to the MST unless it would **form a cycle**.\n\n**Union–find (disjoint sets)** tells quickly whether two vertices are already connected. The label under each vertex is the representative of its set."),
  complexity: { best: 'O(E log E)', average: 'O(E log E)', worst: 'O(E log E)', space: 'O(V)' },
  traits: L('그리디 · 유니온-파인드', 'Greedy · Union–find'),
  input: graphInput('A B 7\nA D 5\nB C 8\nB D 9\nB E 7\nC E 5\nD E 15\nD F 6\nE F 8\nE G 9\nF G 11', { weighted: true, directed: false }, { start: false }),
  pseudo: [
    'procedure Kruskal(G)',
    '  sort the edges by weight',
    '  make each vertex a set of its own',
    '  for each edge (u, v, w) in sorted order',
    '    if find(u) ≠ find(v)',
    '      union(u, v); add (u, v) to the MST',
    '    else skip (it would form a cycle)',
    '  return the MST',
  ],
  run(g) {
    const base = graphBase(g);
    const n = g.names.length;
    const L_ = (x) => g.names[x];
    return record((r) => {
      const parent = g.names.map((_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const order = g.edges.map((e, i) => ({ ...e, i })).sort((a, b) => a.w - b.w || a.i - b.i);
      const edge = {};
      let total = 0;
      let count = 0;
      const mst = [];
      const note = () => Object.fromEntries(g.names.map((_, i) => [i, L_(find(i))]));
      const lists = (pos) => [
        { label: L('정렬된 간선', 'Sorted edges'), items: order.map((e, k) => `${k === pos ? '▶ ' : ''}${L_(e.u)}-${L_(e.v)} ${e.w}`) },
        { label: L('MST 간선', 'MST edges'), items: mst },
      ];
      r.step(1, L('간선을 가중치 순으로 정렬합니다.', 'Sort the edges by weight.'), graphView(base, { lists: lists(-1) }), {});
      r.step(2, L('각 정점이 자기 혼자인 집합이 됩니다.', 'Every vertex starts as its own set.'), graphView(base, { note: note(), lists: lists(-1) }), {});
      for (let k = 0; k < order.length; k++) {
        const { u, v, w, i } = order[k];
        const ru = find(u);
        const rv = find(v);
        r.step(4, L(`간선 ${L_(u)}-${L_(v)} (${w}): find(${L_(u)}) = ${L_(ru)}, find(${L_(v)}) = ${L_(rv)}`, `Edge ${L_(u)}-${L_(v)} (${w}): find(${L_(u)}) = ${L_(ru)}, find(${L_(v)}) = ${L_(rv)}`), graphView(base, { node: { [u]: 'current', [v]: 'current' }, edge: { ...edge, [i]: 'active' }, note: note(), lists: lists(k) }), { u: L_(u), v: L_(v), w });
        if (ru !== rv) {
          parent[ru] = rv;
          edge[i] = 'tree';
          total += w;
          count++;
          mst.push(`${L_(u)}-${L_(v)} (${w})`);
          r.step(5, L(`서로 다른 집합 → MST 에 추가 (합계 ${total})`, `Different sets → add to the MST (total ${total})`), graphView(base, { node: { [u]: 'done', [v]: 'done' }, edge, note: note(), lists: lists(k) }), { total });
          if (count === n - 1) break;
        } else {
          edge[i] = 'rejected';
          r.step(6, L('같은 집합 → 사이클이 생기므로 건너뜁니다.', 'Same set → it would form a cycle: skip.'), graphView(base, { node: { [u]: 'error', [v]: 'error' }, edge, note: note(), lists: lists(k) }), { total });
        }
      }
      r.step(7, L(`완료. MST 가중치 합 = ${total}`, `Done. MST total weight = ${total}`), graphView(base, { node: Object.fromEntries(g.names.map((_, i) => [i, 'done'])), edge, note: note(), lists: lists(-1), result: `${total}` }), { total });
    });
  },
};

// ───────────────────────── ordering

export const topologicalSort = {
  id: 'topological-sort', category: 'graph', view: 'graph',
  name: L('위상 정렬 (칸 알고리즘)', "Topological Sort (Kahn's)"),
  summary: L('선행 조건이 없는 일부터 차례로 처리합니다.', 'Repeatedly takes vertices with no remaining prerequisites.'),
  description: L(
    '위상 정렬은 방향 비순환 그래프(DAG)의 정점을, 모든 간선 u → v 에 대해 **u 가 v 보다 앞에 오도록** 나열합니다. 과목 선수 관계, 빌드 순서, 작업 일정 등에 쓰입니다.\n\n칸(Kahn) 알고리즘은 **들어오는 간선 수(진입 차수)**가 0 인 정점을 큐에 넣고, 꺼낼 때마다 그 정점에서 나가는 간선을 지웁니다. 정점 아래 숫자는 현재 진입 차수입니다.',
    "A topological order of a directed acyclic graph (DAG) lists the vertices so that **u comes before v for every edge u → v** — course prerequisites, build order, task scheduling.\n\nKahn's algorithm queues the vertices whose **in-degree** is 0 and removes the outgoing edges of each vertex it takes. The number under each vertex is its current in-degree."),
  complexity: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)', space: 'O(V)' },
  traits: L('큐 · 방향 비순환 그래프', 'Queue · DAG'),
  input: graphInput('F C\nF A\nE A\nE B\nC D\nD B', { weighted: false, directed: true, dag: true }, { start: false }),
  pseudo: [
    'procedure topologicalSort(G)',
    '  indeg[v] ← number of edges into v',
    '  Q ← all vertices with indeg = 0',
    '  while Q is not empty',
    '    u ← Q.dequeue(); output u',
    '    for each edge (u, v)',
    '      indeg[v] ← indeg[v] − 1',
    '      if indeg[v] = 0: Q.enqueue(v)',
    '  if fewer than n vertices were output: cycle!',
  ],
  run(g) {
    const base = graphBase(g);
    const adj = adjacency(g);
    const n = g.names.length;
    const L_ = (x) => g.names[x];
    return record((r) => {
      const indeg = Array(n).fill(0);
      for (const { v } of g.edges) indeg[v]++;
      const node = {};
      const edge = {};
      const out = [];
      const note = () => Object.fromEntries(indeg.map((d, i) => [i, node[i] === 'done' ? `#${out.indexOf(i) + 1}` : String(d)]));
      const q = [];
      const lists = () => [{ label: L('큐 (Queue)', 'Queue'), items: q.map(L_) }, { label: L('결과', 'Output'), items: out.map(L_) }];
      r.step(1, L('각 정점의 진입 차수를 셉니다.', 'Count the in-degree of every vertex.'), graphView(base, { note: note(), lists: lists() }), {});
      for (let i = 0; i < n; i++) if (indeg[i] === 0) { q.push(i); node[i] = 'frontier'; }
      r.step(2, L(`진입 차수가 0 인 정점: ${q.map(L_).join(', ') || '없음'}`, `In-degree 0: ${q.map(L_).join(', ') || 'none'}`), graphView(base, { node, note: note(), lists: lists() }), {});
      while (q.length) {
        const u = q.shift();
        out.push(u);
        node[u] = 'current';
        r.step(4, L(`${L_(u)} 을(를) 꺼내 결과에 추가`, `Take ${L_(u)} and output it`), graphView(base, { node, edge, note: note(), lists: lists() }), { u: L_(u) });
        for (const { v, e } of adj[u]) {
          indeg[v]--;
          edge[e] = 'rejected';
          r.step(6, L(`간선 ${L_(u)}→${L_(v)} 제거: indeg[${L_(v)}] = ${indeg[v]}`, `Remove ${L_(u)}→${L_(v)}: indeg[${L_(v)}] = ${indeg[v]}`), graphView(base, { node: { ...node, [v]: indeg[v] === 0 ? 'frontier' : node[v] }, edge: { ...edge, [e]: 'active' }, note: note(), lists: lists() }), { u: L_(u), v: L_(v) });
          if (indeg[v] === 0) {
            q.push(v);
            node[v] = 'frontier';
            r.step(7, L(`indeg[${L_(v)}] = 0 → 큐에 넣습니다.`, `indeg[${L_(v)}] = 0 → enqueue`), graphView(base, { node, edge, note: note(), lists: lists() }), { v: L_(v) });
          }
        }
        node[u] = 'done';
      }
      if (out.length < n) {
        const left = g.names.filter((_, i) => !out.includes(i));
        r.step(8, L(`사이클이 있어 ${left.join(', ')} 은(는) 정렬할 수 없습니다.`, `A cycle: ${left.join(', ')} cannot be ordered.`), graphView(base, { node: { ...node, ...Object.fromEntries(left.map((name) => [g.names.indexOf(name), 'error'])) }, edge, note: note(), lists: lists(), result: L('사이클', 'Cycle') }), {});
      } else {
        r.step(8, L(`위상 정렬: ${out.map(L_).join(' → ')}`, `Topological order: ${out.map(L_).join(' → ')}`), graphView(base, { node, edge, note: note(), lists: lists(), result: out.map(L_).join(' → ') }), {});
      }
    });
  },
};

export const GRAPH = [bfs, dfs, dijkstra, bellmanFord, floydWarshall, prim, kruskal, topologicalSort];
