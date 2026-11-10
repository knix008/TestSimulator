// JavaScript samples (Node). `fs.readFileSync(0, 'utf8')` reads the input box;
// the browser runs them with the same call shimmed inside a worker.
const read = `const fs = require('fs');
const text = fs.readFileSync(0, 'utf8');`;

const sort = (body) => `${read}
let a = text.replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
${body}
console.log(a.join(' '));
`;

function keyed(body) {
  return `${read}
const keys = {}, rest = [];
for (const raw of text.split(/\\r?\\n/)) {
  const line = raw.split('#')[0].trim();
  if (!line) continue;
  const match = /^([A-Za-z_]+)\\s*:\\s*(.*)$/.exec(line);
  if (match) keys[match[1].toLowerCase()] = match[2]; else rest.push(line);
}
${body}`;
}

function graph(body, directed = false) {
  return keyed(`const names = [], edges = [];
const index = (name) => { let i = names.indexOf(name); if (i < 0) { names.push(name); i = names.length - 1; } return i; };
for (const line of rest) {
  const parts = line.split(/\\s+/);
  if (parts.length === 1) { index(parts[0]); continue; }
  edges.push([index(parts[0]), index(parts[1]), parts.length > 2 ? Number(parts[2]) : 1]);
}
const adj = names.map(() => []);
for (const [u, v, w] of edges) { adj[u].push([v, w]); ${directed ? '' : 'adj[v].push([u, w]);'} }
${body}`);
}

export const javascript = {
  'bubble-sort': sort(`for (let i = 0; i < a.length - 1; i++) { // @1
  let swapped = false; // @2
  for (let j = 0; j < a.length - 1 - i; j++) { // @3
    if (a[j] > a[j + 1]) { // @4
      [a[j], a[j + 1]] = [a[j + 1], a[j]]; // @5
      swapped = true; // @6
    }
  }
  if (!swapped) break; // @7
}
// @8`),
  'selection-sort': sort(`for (let i = 0; i < a.length - 1; i++) { // @1
  let m = i; // @2
  for (let j = i + 1; j < a.length; j++) { // @3
    if (a[j] < a[m]) m = j; // @4
  }
  if (m !== i) [a[i], a[m]] = [a[m], a[i]]; // @7
}
// @8`),
  'insertion-sort': sort(`for (let i = 1; i < a.length; i++) { // @1
  const key = a[i]; // @2
  let j = i - 1; // @3
  while (j >= 0 && a[j] > key) { // @4
    a[j + 1] = a[j]; // @5
    j--; // @6
  }
  a[j + 1] = key; // @7
}
// @8`),
  'shell-sort': sort(`for (let gap = Math.floor(a.length / 2); gap > 0; gap = Math.floor(gap / 2)) {
  for (let i = gap; i < a.length; i++) {
    const temp = a[i]; let j = i;
    while (j >= gap && a[j - gap] > temp) { a[j] = a[j - gap]; j -= gap; }
    a[j] = temp;
  }
}`),
  'merge-sort': sort(`function mergeSort(lo, hi) {
  if (lo >= hi) return;
  const mid = Math.floor((lo + hi) / 2);
  mergeSort(lo, mid); mergeSort(mid + 1, hi);
  const merged = []; let i = lo, j = mid + 1;
  while (i <= mid && j <= hi) merged.push(a[i] <= a[j] ? a[i++] : a[j++]);
  while (i <= mid) merged.push(a[i++]); while (j <= hi) merged.push(a[j++]);
  for (let k = 0; k < merged.length; k++) a[lo + k] = merged[k];
}
mergeSort(0, a.length - 1);`),
  'quick-sort': sort(`function quickSort(lo, hi) {
  if (lo >= hi) return;
  const pivot = a[hi]; let i = lo;
  for (let j = lo; j < hi; j++) if (a[j] < pivot) { [a[i], a[j]] = [a[j], a[i]]; i++; }
  [a[i], a[hi]] = [a[hi], a[i]];
  quickSort(lo, i - 1); quickSort(i + 1, hi);
}
quickSort(0, a.length - 1);`),
  'heap-sort': sort(`function sift(i, size) {
  for (;;) {
    const l = 2 * i + 1, r = 2 * i + 2; let largest = i;
    if (l < size && a[l] > a[largest]) largest = l;
    if (r < size && a[r] > a[largest]) largest = r;
    if (largest === i) return;
    [a[i], a[largest]] = [a[largest], a[i]]; i = largest;
  }
}
for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) sift(i, a.length);
for (let end = a.length - 1; end > 0; end--) { [a[0], a[end]] = [a[end], a[0]]; sift(0, end); }`),
  'radix-sort': sort(`for (let exp = 1; Math.floor(Math.max(...a) / exp) > 0; exp *= 10) {
  const buckets = Array.from({ length: 10 }, () => []);
  for (const x of a) buckets[Math.floor(x / exp) % 10].push(x);
  a = buckets.flat();
}`),
  'linear-search': `${read}
const [row, targetLine] = text.trim().split(/\\r?\\n/);
const a = row.replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
const target = Number(targetLine.split(':')[1]); // @0
let found = -1; // @1
for (let i = 0; i < a.length; i++) { // @2
  if (a[i] === target) { found = i; break; } // @3
}
console.log(found); // @4
`,
  'binary-search': `${read}
const [row, targetLine] = text.trim().split(/\\r?\\n/);
const a = row.replace(/,/g, ' ').trim().split(/\\s+/).map(Number).sort((x, y) => x - y);
const target = Number(targetLine.split(':')[1]);
let lo = 0, hi = a.length - 1, found = -1; // @1
while (lo <= hi) { // @2
  const mid = Math.floor((lo + hi) / 2); // @3
  if (a[mid] === target) { found = mid; break; } // @4
  if (a[mid] < target) lo = mid + 1; // @5
  else hi = mid - 1; // @6
}
console.log(found); // @7
`,
  bfs: graph(`const start = names.indexOf(keys.start ?? names[0]);
const seen = new Set([start]); const q = [start]; const order = [];
while (q.length) {
  const u = q.shift(); order.push(names[u]);
  for (const [v] of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); }
}
console.log(order.join(' '));`),
  dfs: graph(`const start = names.indexOf(keys.start ?? names[0]);
const seen = new Set(); const order = [];
const visit = (u) => { seen.add(u); order.push(names[u]); for (const [v] of adj[u]) if (!seen.has(v)) visit(v); };
visit(start);
console.log(order.join(' '));`),
  dijkstra: graph(`const INF = Infinity; const start = names.indexOf(keys.start ?? names[0]);
const dist = names.map(() => INF); dist[start] = 0; const used = names.map(() => false);
for (let round = 0; round < names.length; round++) {
  let u = -1; for (let i = 0; i < names.length; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
  if (dist[u] === INF) break; used[u] = true;
  for (const [v, w] of adj[u]) if (!used[v] && dist[u] + w < dist[v]) dist[v] = dist[u] + w;
}
console.log(dist.map((d, i) => names[i] + '=' + (d === INF ? 'INF' : d)).join(' '));`),
  'bellman-ford': graph(`const INF = Infinity; const start = names.indexOf(keys.start ?? names[0]);
const dist = names.map(() => INF); dist[start] = 0;
for (let round = 1; round < names.length; round++) {
  let changed = false;
  for (const [u, v, w] of edges) if (dist[u] !== INF && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
  if (!changed) break;
}
if (edges.some(([u, v, w]) => dist[u] !== INF && dist[u] + w < dist[v])) console.log('negative cycle');
else console.log(dist.map((d, i) => names[i] + '=' + (d === INF ? 'INF' : d)).join(' '));`, true),
  'floyd-warshall': graph(`const INF = Infinity; const n = names.length;
const d = names.map((_, i) => names.map((_, j) => (i === j ? 0 : INF)));
for (const [u, v, w] of edges) d[u][v] = Math.min(d[u][v], w);
for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
console.log(d.map((row) => row.map((x) => (x === INF ? 'INF' : x)).join(' ')).join('\\n'));`, true),
  prim: graph(`const INF = Infinity; const start = names.indexOf(keys.start ?? names[0]);
const key = names.map(() => INF); key[start] = 0; const used = names.map(() => false); let total = 0;
for (let round = 0; round < names.length; round++) {
  let u = -1; for (let i = 0; i < names.length; i++) if (!used[i] && (u < 0 || key[i] < key[u])) u = i;
  if (key[u] === INF) break; used[u] = true; total += key[u];
  for (const [v, w] of adj[u]) if (!used[v] && w < key[v]) key[v] = w;
}
console.log(total);`),
  kruskal: graph(`const parent = names.map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
let total = 0;
for (const [u, v, w] of [...edges].sort((p, q) => p[2] - q[2])) { const ru = find(u), rv = find(v); if (ru !== rv) { parent[ru] = rv; total += w; } }
console.log(total);`),
  'topological-sort': graph(`const indeg = names.map(() => 0);
for (const [, v] of edges) indeg[v]++;
const q = names.map((_, i) => i).filter((i) => indeg[i] === 0); const order = [];
while (q.length) { const u = q.shift(); order.push(names[u]); for (const [v] of adj[u]) { indeg[v]--; if (indeg[v] === 0) q.push(v); } }
console.log(order.length === names.length ? order.join(' ') : 'cycle');`, true),
  astar: `${read}
const rows = text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean); const cols = rows[0].length;
let start = -1, goal = -1; const walls = new Set();
rows.forEach((row, r) => [...row].forEach((ch, c) => { const i = r * cols + c; if (ch === 'S' || ch === 's') start = i; else if (ch === 'G' || ch === 'g') goal = i; else if (ch === '#') walls.add(i); }));
const h = (i) => Math.abs(Math.floor(i / cols) - Math.floor(goal / cols)) + Math.abs(i % cols - goal % cols);
const g = new Map([[start, 0]]); const open = [start]; const closed = new Set(); let answer = 'none';
while (open.length) {
  let best = 0; for (let k = 1; k < open.length; k++) { const x = open[k], y = open[best]; if (g.get(x) + h(x) < g.get(y) + h(y) || (g.get(x) + h(x) === g.get(y) + h(y) && h(x) < h(y))) best = k; }
  const u = open[best]; if (u === goal) { answer = String(g.get(u)); break; }
  open.splice(best, 1); closed.add(u);
  const r = Math.floor(u / cols), c = u % cols;
  for (const [vr, vc] of [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]]) {
    if (vr < 0 || vc < 0 || vr >= rows.length || vc >= cols) continue;
    const v = vr * cols + vc; if (walls.has(v) || closed.has(v)) continue;
    if (g.get(u) + 1 < (g.get(v) ?? Infinity)) { g.set(v, g.get(u) + 1); if (!open.includes(v)) open.push(v); }
  }
}
console.log(answer);
`,
  fibonacci: `${read}
const n = Number(text.split(':')[1]); const f = [0, 1];
for (let i = 2; i <= n; i++) f.push(f[i - 1] + f[i - 2]);
console.log(f[n]);
`,
  knapsack: keyed(`const w = keys.weights.replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
const v = keys.values.replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
const cap = Number(keys.capacity);
const k = Array.from({ length: w.length + 1 }, () => Array(cap + 1).fill(0));
for (let i = 1; i <= w.length; i++) for (let c = 0; c <= cap; c++) { k[i][c] = k[i - 1][c]; if (w[i - 1] <= c) k[i][c] = Math.max(k[i][c], k[i - 1][c - w[i - 1]] + v[i - 1]); }
console.log(k[w.length][cap]);`),
  lcs: keyed(`const x = keys.a, y = keys.b;
const c = Array.from({ length: x.length + 1 }, () => Array(y.length + 1).fill(0));
for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) c[i][j] = x[i - 1] === y[j - 1] ? c[i - 1][j - 1] + 1 : Math.max(c[i - 1][j], c[i][j - 1]);
let i = x.length, j = y.length, s = '';
while (i && j) { if (x[i - 1] === y[j - 1]) { s = x[i - 1] + s; i--; j--; } else if (c[i - 1][j] >= c[i][j - 1]) i--; else j--; }
console.log(s);`),
  'edit-distance': keyed(`const a = keys.a, b = keys.b;
const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
for (let i = 0; i <= a.length; i++) d[i][0] = i; for (let j = 0; j <= b.length; j++) d[0][j] = j;
for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
console.log(d[a.length][b.length]);`),
  kmp: keyed(`const t = keys.text, p = keys.pattern; const lps = Array(p.length).fill(0);
let length = 0, k = 1;
while (k < p.length) { if (p[k] === p[length]) lps[k++] = ++length; else if (length) length = lps[length - 1]; else lps[k++] = 0; }
const found = []; let i = 0, j = 0;
while (i < t.length) { if (t[i] === p[j]) { i++; j++; if (j === p.length) { found.push(i - p.length); j = lps[j - 1]; } } else if (j) j = lps[j - 1]; else i++; }
console.log(found.length ? found.join(' ') : 'none');`),
  'rabin-karp': keyed(`const t = keys.text, p = keys.pattern; const d = 256, q = 101;
let h = 1; for (let k = 0; k < p.length - 1; k++) h = (h * d) % q;
let ph = 0, th = 0; for (let k = 0; k < p.length; k++) { ph = (d * ph + p.charCodeAt(k)) % q; th = (d * th + t.charCodeAt(k)) % q; }
const found = [];
for (let s = 0; s <= t.length - p.length; s++) {
  if (ph === th && t.slice(s, s + p.length) === p) found.push(s);
  if (s < t.length - p.length) { th = (d * (th - t.charCodeAt(s) * h) + t.charCodeAt(s + p.length)) % q; if (th < 0) th += q; }
}
console.log(found.length ? found.join(' ') : 'none');`),
  bst: keyed(`const values = rest.join(' ').replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
const target = Number(keys.search); const nodes = []; let root = null;
for (const key of values) {
  if (root === null) { nodes.push([key, null, null]); root = 0; continue; }
  let cur = root;
  for (;;) { const node = nodes[cur]; if (key === node[0]) break; const side = key < node[0] ? 1 : 2; if (node[side] === null) { nodes.push([key, null, null]); node[side] = nodes.length - 1; break; } cur = node[side]; }
}
let cur = root, answer = 'not found';
while (cur !== null) { const node = nodes[cur]; if (target === node[0]) { answer = 'found'; break; } cur = target < node[0] ? node[1] : node[2]; }
console.log(answer);`),
  'tree-traversal': keyed(`const values = rest.join(' ').replace(/,/g, ' ').trim().split(/\\s+/).map(Number);
const nodes = []; let root = null;
for (const key of values) {
  if (root === null) { nodes.push([key, null, null]); root = 0; continue; }
  let cur = root;
  for (;;) { const node = nodes[cur]; if (key === node[0]) break; const side = key < node[0] ? 1 : 2; if (node[side] === null) { nodes.push([key, null, null]); node[side] = nodes.length - 1; break; } cur = node[side]; }
}
const walk = (cur, order, out) => { if (cur === null) return; const node = nodes[cur]; if (order === 'pre') out.push(node[0]); walk(node[1], order, out); if (order === 'in') out.push(node[0]); walk(node[2], order, out); if (order === 'post') out.push(node[0]); };
for (const order of ['pre', 'in', 'post']) { const out = []; walk(root, order, out); console.log(out.join(' ')); }
const q = [root]; const out = [];
while (q.length) { const node = nodes[q.shift()]; out.push(node[0]); for (const child of [node[1], node[2]]) if (child !== null) q.push(child); }
console.log(out.join(' '));`),
  'n-queens': keyed(`const n = Number(keys.n ?? rest[0]); const mode = (keys.mode ?? 'first').toLowerCase();
const queens = Array(n).fill(-1); const solutions = [];
const safe = (row, col) => queens.slice(0, row).every((c, r) => c !== col && Math.abs(c - col) !== row - r);
const solve = (row) => {
  if (row === n) { solutions.push(queens.slice()); return mode !== 'first'; }
  for (let col = 0; col < n; col++) if (safe(row, col)) { queens[row] = col; if (solve(row + 1) === false) return false; }
  return true;
};
solve(0);
console.log(mode === 'all' ? solutions.length : (solutions[0] ? solutions[0].join(' ') : 'none'));`),
  gcd: keyed(`let a = Number(keys.a), b = Number(keys.b); while (b) { const r = a % b; a = b; b = r; } console.log(a);`),
  sieve: keyed(`const n = Number(keys.n); const prime = Array(n + 1).fill(true); prime[0] = prime[1] = false;
for (let p = 2; p * p <= n; p++) if (prime[p]) for (let m = p * p; m <= n; m += p) prime[m] = false;
console.log(prime.flatMap((ok, i) => (ok ? [i] : [])).join(' '));`),
  hanoi: keyed(`console.log(2 ** Number(keys.n) - 1);`),
};
