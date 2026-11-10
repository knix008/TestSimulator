// javascript samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().
// They only use require('fs').readFileSync(0, 'utf8') and console.log, which the
// browser runner (src/runner/web.js) also provides.
const read = `const fs = require('fs');
const text = fs.readFileSync(0, 'utf8');`;

/** Reads "key: value" lines into `keys` and leaves the other lines in `rest`. */
function keyed(body) {
  return `${read}
const keys = {}, rest = [];
for (const raw of text.split(/\\r?\\n/)) {
  const line = raw.split('#')[0].trim();
  if (!line) continue;
  const match = /^([A-Za-z_]+)\\s*:\\s*(.*)$/.exec(line);
  if (match) keys[match[1].toLowerCase()] = match[2].trim(); else rest.push(line);
}
// Integers separated by spaces or commas.
const numbers = (s) => s.split(/[\\s,;]+/).filter(Boolean).map(Number);

${body}
`;
}

/** Reads a grid of S G # . into R, C, start, goal, wall[] and neighbours(u). */
function grid(body) {
  return `${read}
const rows = text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
const R = rows.length, C = rows[0].length;
let start = -1, goal = -1;
const wall = new Array(R * C).fill(false);
for (let r = 0; r < R; r++) {
  for (let c = 0; c < C; c++) {
    const ch = rows[r][c], i = r * C + c;
    if (ch === 'S' || ch === 's') start = i;
    else if (ch === 'G' || ch === 'g') goal = i;
    else if (ch === '#') wall[i] = true;
  }
}

// The cells next to u, in the order up, right, down, left.
function neighbours(u) {
  const r = Math.floor(u / C), c = u % C;
  const result = [];
  for (const [vr, vc] of [[r - 1, c], [r, c + 1], [r + 1, c], [r, c - 1]]) {
    if (vr >= 0 && vr < R && vc >= 0 && vc < C) result.push(vr * C + vc);
  }
  return result;
}

${body}
`;
}

export const javascript = {
  'grid-bfs': grid(`const dist = new Array(R * C).fill(-1); // -1 = not seen yet
dist[start] = 0;
const queue = [start]; // @1
let head = 0;
let answer = 'none';
while (head < queue.length) { // @2
  const u = queue[head++]; // @3
  if (u === goal) { answer = String(dist[u]); break; } // @4
  for (const v of neighbours(u)) { // @5
    if (!wall[v] && dist[v] === -1) { // @6
      dist[v] = dist[u] + 1; // @7
      queue.push(v);
    }
  }
}
console.log(answer);`),

  'greedy-best-first': grid(`// Manhattan distance from cell i to the goal.
const h = (i) => Math.abs(Math.floor(i / C) - Math.floor(goal / C)) + Math.abs(i % C - goal % C);
const parent = new Array(R * C).fill(-1);
const seen = new Array(R * C).fill(false);
const open = [start];
seen[start] = true; // @1
let answer = 'none';
while (open.length > 0) { // @2
  let best = 0;
  for (let k = 1; k < open.length; k++) { // @3
    if (h(open[k]) < h(open[best])) best = k; // strict: the earliest wins ties
  }
  const u = open[best];
  if (u === goal) { // @4
    let length = 0;
    for (let x = goal; x !== start; x = parent[x]) length++; // follow parent back
    answer = String(length);
    break;
  }
  open.splice(best, 1); // @5
  for (const v of neighbours(u)) { // @6
    if (!wall[v] && !seen[v]) { // @7
      seen[v] = true;
      parent[v] = u;
      open.push(v);
    }
  }
}
console.log(answer);`),

  'maze-dfs': grid(`const parent = new Array(R * C).fill(-1);
const visited = new Array(R * C).fill(false);

function dfs(u) {
  if (u === goal) return true; // @1
  visited[u] = true; // @2
  for (const v of neighbours(u)) { // @3
    if (!wall[v] && !visited[v]) { // @4
      parent[v] = u; // @5
      if (dfs(v)) return true; // @6
    }
  }
  return false; // @7
}

if (dfs(start)) { // @0
  let length = 0;
  for (let x = goal; x !== start; x = parent[x]) length++; // follow parent back
  console.log(length);
} else {
  console.log('none');
}`),

  'subset-sum': keyed(`const values = numbers(keys.values);
const target = Number(keys.target);
const n = values.length;
const taken = new Array(n).fill(false);

function solve(i, sum) {
  if (sum === target) return true; // @1
  if (i === n) return false; // @2
  if (sum + values[i] <= target) { // @3
    taken[i] = true;
    if (solve(i + 1, sum + values[i])) return true; // @4
    taken[i] = false; // @5
  }
  return solve(i + 1, sum); // @6
}

if (solve(0, 0)) { // @0
  console.log(values.filter((_, i) => taken[i]).join(' '));
} else {
  console.log('none');
}`),

  permutations: keyed(`const items = numbers(keys.items ?? rest.join(' '));
const n = items.length;
const used = new Array(n).fill(false);
const cur = [];

function permute() {
  if (cur.length === n) { console.log(cur.join(' ')); return; } // @1
  for (let i = 0; i < n; i++) { // @2
    if (used[i]) continue; // @3
    used[i] = true; // @4
    cur.push(items[i]);
    permute(); // @5
    cur.pop(); // @6
    used[i] = false;
  }
}

permute(); // @0`),

  sudoku: `${read}
const lines = text.split(/\\r?\\n/).map((line) => line.replace(/[\\s|+-]/g, '')).filter(Boolean);
const grid = []; // 81 cells, 0 = empty
for (const line of lines) for (const ch of line) grid.push(ch === '.' || ch === '0' ? 0 : Number(ch));

// True when d is not in the row, column or 3x3 box of cell i (ignoring cell i).
function fits(i, d) {
  const r = Math.floor(i / 9), c = i % 9;
  for (let k = 0; k < 9; k++) {
    if (grid[r * 9 + k] === d && r * 9 + k !== i) return false;
    if (grid[k * 9 + c] === d && k * 9 + c !== i) return false;
  }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let y = br; y < br + 3; y++) {
    for (let x = bc; x < bc + 3; x++) {
      if (grid[y * 9 + x] === d && y * 9 + x !== i) return false;
    }
  }
  return true;
}

function solve() {
  const i = grid.indexOf(0); // first empty cell in row-major order
  if (i < 0) return true; // @1
  for (let d = 1; d <= 9; d++) { // @2
    if (fits(i, d)) { // @3
      grid[i] = d; // @4
      if (solve()) return true; // @5
      grid[i] = 0; // @6
    }
  }
  return false; // @7
}

const clash = grid.some((v, i) => v !== 0 && !fits(i, v));
if (!clash && solve()) { // @0
  for (let r = 0; r < 9; r++) console.log(grid.slice(r * 9, r * 9 + 9).join(''));
} else {
  console.log('none');
}
`,

  huffman: keyed(`const word = (keys.text ?? rest.join('')).trim();
const freq = new Map();
for (const ch of word) freq.set(ch, (freq.get(ch) || 0) + 1); // @1

// Each node has a frequency and two children; leaves have no children.
const nodes = [...freq.values()].map((f) => ({ freq: f, left: -1, right: -1 }));
const queue = nodes.map((_, i) => i); // @2

function popMin() {
  let best = 0;
  for (let k = 1; k < queue.length; k++) if (nodes[queue[k]].freq < nodes[queue[best]].freq) best = k;
  return queue.splice(best, 1)[0];
}

while (queue.length > 1) { // @3
  const x = popMin(); // @4
  const y = popMin();
  nodes.push({ freq: nodes[x].freq + nodes[y].freq, left: x, right: y }); // @5
  queue.push(nodes.length - 1); // @6
}

let total = 0;
function walk(i, depth) {
  const node = nodes[i];
  if (node.left < 0) { total += node.freq * Math.max(depth, 1); return; } // @8 (a lone symbol still needs 1 bit)
  walk(node.left, depth + 1); // @7 left edge = 0
  walk(node.right, depth + 1); // right edge = 1
}
walk(queue[0], 0);
console.log(total);`),

  'fractional-knapsack': keyed(`const w = numbers(keys.weights);
const v = numbers(keys.values);
let room = Number(keys.capacity);
// Sort by value / weight, largest first (cross-multiplied, ties by index).
const order = w.map((_, i) => i).sort((a, b) => v[b] * w[a] - v[a] * w[b] || a - b); // @1

let num = 0, den = 1; // the total value is num / den, kept exact
for (const i of order) { // @2
  if (room === 0) break;
  if (w[i] <= room) { // @3
    room -= w[i];
    num += v[i] * den;
  } else { // @4
    num = num * w[i] + v[i] * room * den;
    den *= w[i];
    room = 0;
    break;
  }
}

const cents = Math.floor((2 * 100 * num + den) / (2 * den)); // round half up to 2 decimals
console.log(Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0')); // @5`),

  'job-sequencing': `${read}
const jobs = text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean)
  .map((line) => line.split(/[\\s,]+/).map(Number));
const slots = Math.max(...jobs.map(([deadline]) => deadline));
// Sort by profit, largest first; ties keep the input order.
const order = jobs.map((_, i) => i).sort((a, b) => jobs[b][1] - jobs[a][1] || a - b); // @1
const slot = new Array(slots + 1).fill(-1); // slot[t] = job index, -1 = free
let total = 0;
for (const i of order) { // @2
  const [deadline, profit] = jobs[i];
  for (let t = Math.min(deadline, slots); t >= 1; t--) { // @3
    if (slot[t] === -1) { slot[t] = i; total += profit; break; } // @4
  }
  // @5 (no free slot: the job is dropped)
}
console.log(slot.slice(1).filter((j) => j !== -1).map((j) => 'J' + (j + 1)).join(' ')); // @6
console.log(total);
`,

  'avl-tree': keyed(`const values = numbers(keys.values ?? rest.join(' '));

const height = (node) => (node ? node.height : 0);
const fix = (node) => { node.height = 1 + Math.max(height(node.left), height(node.right)); };

function rotateRight(y) {
  const x = y.left;
  y.left = x.right; x.right = y;
  fix(y); fix(x);
  return x;
}

function rotateLeft(y) {
  const x = y.right;
  y.right = x.left; x.left = y;
  fix(y); fix(x);
  return x;
}

function insert(node, key) {
  if (!node) return { key, left: null, right: null, height: 1 }; // @1
  if (key < node.key) node.left = insert(node.left, key); // @2
  else if (key > node.key) node.right = insert(node.right, key); // @3
  else return node; // @4
  fix(node); // @5
  const b = height(node.left) - height(node.right);
  if (b > 1 && key < node.left.key) return rotateRight(node); // @6
  if (b < -1 && key > node.right.key) return rotateLeft(node); // @7
  if (b > 1) { node.left = rotateLeft(node.left); return rotateRight(node); } // @8
  if (b < -1) { node.right = rotateRight(node.right); return rotateLeft(node); } // @9
  return node; // @10
}

function preorder(node, out) {
  if (!node) return;
  out.push(node.key);
  preorder(node.left, out);
  preorder(node.right, out);
}

let root = null;
for (const key of values) root = insert(root, key); // @0
const result = [];
preorder(root, result);
console.log(result.join(' '));`),

  'binary-heap': keyed(`const values = numbers(keys.values ?? rest.join(' '));
const extract = Number(keys.extract ?? '1');
const a = [];
let n = 0; // heap size

function insert(x) { // @0
  a[n] = x; let i = n; n++; // @1
  while (i > 0 && a[Math.floor((i - 1) / 2)] > a[i]) { // @2
    const p = Math.floor((i - 1) / 2);
    [a[i], a[p]] = [a[p], a[i]]; // @3
    i = p;
  }
}

function extractMin() { // @4
  const min = a[0];
  [a[0], a[n - 1]] = [a[n - 1], a[0]]; n--; // @5
  let i = 0;
  while (2 * i + 1 < n) { // @6
    let c = 2 * i + 1;
    if (c + 1 < n && a[c + 1] < a[c]) c++;
    if (!(a[c] < a[i])) break;
    [a[i], a[c]] = [a[c], a[i]]; // @7
    i = c;
  }
  return min; // @8
}

for (const x of values) insert(x);
console.log(a.join(' '));
const out = [];
for (let k = 0; k < extract; k++) out.push(extractMin());
console.log(out.join(' '));`),

  trie: keyed(`const words = (keys.words ?? '').split(/[\\s,]+/).filter(Boolean);
const prefix = (keys.find ?? '').trim();
const root = { children: {}, end: false };

for (const word of words) {
  let node = root; // @1
  for (const ch of word) { // @2
    if (!node.children[ch]) node.children[ch] = { children: {}, end: false }; // @3
    node = node.children[ch]; // @4
  }
  node.end = true; // @5
}

const found = [];
function collect(node, word) {
  if (node.end) found.push(word);
  for (const ch of Object.keys(node.children).sort()) collect(node.children[ch], word + ch); // children a to z
}

let node = root;
for (const ch of prefix) { // @7
  node = node.children[ch];
  if (!node) break;
}
if (node) collect(node, prefix); // @8
console.log(found.length ? found.join(' ') : 'none');`),
};
