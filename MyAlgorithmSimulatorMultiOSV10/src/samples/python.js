// Python samples. Each program reads the input box on stdin and prints the result.
const sort = (body) => `import sys
a = [int(x) for x in sys.stdin.read().replace(',', ' ').split()]
${body}
print(' '.join(map(str, a)))
`;

export const python = {
  'bubble-sort': sort(`n = len(a)  # @0
for i in range(n - 1):  # @1
    swapped = False  # @2
    for j in range(n - 1 - i):  # @3
        if a[j] > a[j + 1]:  # @4
            a[j], a[j + 1] = a[j + 1], a[j]  # @5
            swapped = True  # @6
    if not swapped:  # @7
        break
# @8`),

  'selection-sort': sort(`n = len(a)  # @0
for i in range(n - 1):  # @1
    m = i  # @2
    for j in range(i + 1, n):  # @3
        if a[j] < a[m]:  # @4
            m = j  # @5
    if m != i:  # @6
        a[i], a[m] = a[m], a[i]  # @7
# @8`),

  'insertion-sort': sort(`for i in range(1, len(a)):  # @1
    key = a[i]  # @2
    j = i - 1  # @3
    while j >= 0 and a[j] > key:  # @4
        a[j + 1] = a[j]  # @5
        j -= 1  # @6
    a[j + 1] = key  # @7
# @8`),

  'shell-sort': sort(`n = len(a)  # @0
gap = n // 2  # @1
while gap > 0:  # @2
    for i in range(gap, n):  # @3
        temp, j = a[i], i  # @4
        while j >= gap and a[j - gap] > temp:  # @5
            a[j] = a[j - gap]  # @6
            j -= gap
        a[j] = temp  # @7
    gap //= 2  # @8
# @9`),

  'merge-sort': sort(`def merge_sort(lo, hi):
    if lo >= hi:  # @1
        return
    mid = (lo + hi) // 2  # @2
    merge_sort(lo, mid)
    merge_sort(mid + 1, hi)
    merged, i, j = [], lo, mid + 1  # @7
    while i <= mid and j <= hi:  # @9
        if a[i] <= a[j]:  # @10
            merged.append(a[i]); i += 1
        else:  # @11
            merged.append(a[j]); j += 1
    merged.extend(a[i:mid + 1])
    merged.extend(a[j:hi + 1])
    a[lo:hi + 1] = merged  # @5

merge_sort(0, len(a) - 1)  # @0`),

  'quick-sort': sort(`def quick_sort(lo, hi):
    if lo >= hi:  # @1
        return
    pivot, i = a[hi], lo  # @6
    for j in range(lo, hi):  # @7
        if a[j] < pivot:  # @8
            a[i], a[j] = a[j], a[i]  # @9
            i += 1
    a[i], a[hi] = a[hi], a[i]  # @10
    quick_sort(lo, i - 1)
    quick_sort(i + 1, hi)

quick_sort(0, len(a) - 1)  # @0`),

  'heap-sort': sort(`def sift(i, size):
    while True:  # @7
        l, r, largest = 2 * i + 1, 2 * i + 2, i
        if l < size and a[l] > a[largest]:
            largest = l
        if r < size and a[r] > a[largest]:
            largest = r
        if largest == i:  # @10
            return
        a[i], a[largest] = a[largest], a[i]  # @11
        i = largest

n = len(a)  # @0
for i in range(n // 2 - 1, -1, -1):
    sift(i, n)  # @2
# @3
for end in range(n - 1, 0, -1):
    a[0], a[end] = a[end], a[0]  # @4
    sift(0, end)`),

  'radix-sort': sort(`exp, top = 1, max(a)  # @1
while top // exp > 0:  # @3
    buckets = [[] for _ in range(10)]
    for x in a:  # @5
        buckets[(x // exp) % 10].append(x)
    a[:] = [x for bucket in buckets for x in bucket]  # @6
    exp *= 10
# @8`),

  'linear-search': `import sys
lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
a = [int(x) for x in lines[0].replace(',', ' ').split()]
target = int(lines[1].split(':')[1])  # @0
found = -1  # @1
for i, v in enumerate(a):  # @2
    if v == target:  # @3
        found = i
        break
print(found)  # @4
`,

  'binary-search': `import sys
lines = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
a = sorted(int(x) for x in lines[0].replace(',', ' ').split())
target = int(lines[1].split(':')[1])
lo, hi = 0, len(a) - 1  # @1
found = -1
while lo <= hi:  # @2
    mid = (lo + hi) // 2  # @3
    if a[mid] == target:  # @4
        found = mid
        break
    if a[mid] < target:  # @5
        lo = mid + 1
    else:  # @6
        hi = mid - 1
print(found)  # @7
`,

  bfs: graph(`from collections import deque
start = names.index(keys.get('start', names[0]))
seen, q, order = {start}, deque([start]), []
while q:
    u = q.popleft()
    order.append(names[u])
    for v, _w in adj[u]:
        if v not in seen:
            seen.add(v)
            q.append(v)
print(' '.join(order))`),

  dfs: graph(`start = names.index(keys.get('start', names[0]))
seen, order = set(), []

def visit(u):
    seen.add(u)
    order.append(names[u])
    for v, _w in adj[u]:
        if v not in seen:
            visit(v)

visit(start)
print(' '.join(order))`),

  dijkstra: graph(`INF = 10 ** 18
start = names.index(keys.get('start', names[0]))
dist = [INF] * len(names)
dist[start] = 0
used = [False] * len(names)
for _ in range(len(names)):
    u = min((i for i in range(len(names)) if not used[i]), key=lambda i: dist[i])
    if dist[u] == INF:
        break
    used[u] = True
    for v, w in adj[u]:
        if not used[v] and dist[u] + w < dist[v]:
            dist[v] = dist[u] + w
print(' '.join(f"{names[i]}={'INF' if dist[i] == INF else dist[i]}" for i in range(len(names))))`),

  'bellman-ford': graph(`INF = 10 ** 18
start = names.index(keys.get('start', names[0]))
dist = [INF] * len(names)
dist[start] = 0
for _ in range(len(names) - 1):
    changed = False
    for u, v, w in edges:
        if dist[u] != INF and dist[u] + w < dist[v]:
            dist[v] = dist[u] + w
            changed = True
    if not changed:
        break
if any(dist[u] != INF and dist[u] + w < dist[v] for u, v, w in edges):
    print('negative cycle')
else:
    print(' '.join(f"{names[i]}={'INF' if dist[i] == INF else dist[i]}" for i in range(len(names))))`, true),

  'floyd-warshall': graph(`INF = 10 ** 18
n = len(names)
d = [[0 if i == j else INF for j in range(n)] for i in range(n)]
for u, v, w in edges:
    d[u][v] = min(d[u][v], w)
for k in range(n):
    for i in range(n):
        for j in range(n):
            if d[i][k] + d[k][j] < d[i][j]:
                d[i][j] = d[i][k] + d[k][j]
for row in d:
    print(' '.join('INF' if x >= INF // 2 else str(x) for x in row))`, true),

  prim: graph(`INF = 10 ** 18
start = names.index(keys.get('start', names[0]))
key = [INF] * len(names)
key[start] = 0
used = [False] * len(names)
total = 0
for _ in range(len(names)):
    u = min((i for i in range(len(names)) if not used[i]), key=lambda i: key[i])
    if key[u] == INF:
        break
    used[u] = True
    total += key[u]
    for v, w in adj[u]:
        if not used[v] and w < key[v]:
            key[v] = w
print(total)`),

  kruskal: graph(`parent = list(range(len(names)))

def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x

total = 0
for u, v, w in sorted(edges, key=lambda e: (e[2])):
    ru, rv = find(u), find(v)
    if ru != rv:
        parent[ru] = rv
        total += w
print(total)`),

  'topological-sort': graph(`indeg = [0] * len(names)
for _u, v, _w in edges:
    indeg[v] += 1
q = [i for i in range(len(names)) if indeg[i] == 0]
order = []
while q:
    u = q.pop(0)
    order.append(names[u])
    for v, _w in adj[u]:
        indeg[v] -= 1
        if indeg[v] == 0:
            q.append(v)
print(' '.join(order) if len(order) == len(names) else 'cycle')`, true),

  astar: `rows = [line.strip() for line in open(0, encoding='utf-8').read().splitlines() if line.strip()]
cols = len(rows[0])
start = goal = None
walls = set()
for r, row in enumerate(rows):
    for c, ch in enumerate(row):
        i = r * cols + c
        if ch in 'Ss': start = i
        elif ch in 'Gg': goal = i
        elif ch == '#': walls.add(i)

def h(i):
    return abs(i // cols - goal // cols) + abs(i % cols - goal % cols)

g = {start: 0}
parent = {}
open_set = [start]
closed = set()
answer = 'none'
while open_set:
    u = min(open_set, key=lambda i: (g[i] + h(i), h(i)))
    if u == goal:
        answer = str(g[u])
        break
    open_set.remove(u)
    closed.add(u)
    r, c = divmod(u, cols)
    for vr, vc in ((r - 1, c), (r, c + 1), (r + 1, c), (r, c - 1)):
        if not (0 <= vr < len(rows) and 0 <= vc < cols):
            continue
        v = vr * cols + vc
        if v in walls or v in closed:
            continue
        if g[u] + 1 < g.get(v, 10 ** 9):
            g[v] = g[u] + 1
            parent[v] = u
            if v not in open_set:
                open_set.append(v)
print(answer)
`,

  fibonacci: `n = int(open(0, encoding='utf-8').read().split(':')[1])
f = [0, 1]
for i in range(2, n + 1):
    f.append(f[i - 1] + f[i - 2])
print(f[n])
`,

  knapsack: keyed(`w = [int(x) for x in keys['weights'].replace(',', ' ').split()]
v = [int(x) for x in keys['values'].replace(',', ' ').split()]
cap = int(keys['capacity'])
k = [[0] * (cap + 1) for _ in range(len(w) + 1)]
for i in range(1, len(w) + 1):
    for c in range(cap + 1):
        k[i][c] = k[i - 1][c]
        if w[i - 1] <= c:
            k[i][c] = max(k[i][c], k[i - 1][c - w[i - 1]] + v[i - 1])
print(k[-1][-1])`),

  lcs: keyed(`x, y = keys['a'], keys['b']
c = [[0] * (len(y) + 1) for _ in range(len(x) + 1)]
for i in range(1, len(x) + 1):
    for j in range(1, len(y) + 1):
        if x[i - 1] == y[j - 1]:
            c[i][j] = c[i - 1][j - 1] + 1
        else:
            c[i][j] = max(c[i - 1][j], c[i][j - 1])
i, j, s = len(x), len(y), ''
while i and j:
    if x[i - 1] == y[j - 1]:
        s = x[i - 1] + s
        i -= 1
        j -= 1
    elif c[i - 1][j] >= c[i][j - 1]:
        i -= 1
    else:
        j -= 1
print(s)`),

  'edit-distance': keyed(`a, b = keys['a'], keys['b']
d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
for i in range(len(a) + 1):
    d[i][0] = i
for j in range(len(b) + 1):
    d[0][j] = j
for i in range(1, len(a) + 1):
    for j in range(1, len(b) + 1):
        if a[i - 1] == b[j - 1]:
            d[i][j] = d[i - 1][j - 1]
        else:
            d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
print(d[-1][-1])`),

  kmp: search(`lps = [0] * len(p)
length = 0
k = 1
while k < len(p):
    if p[k] == p[length]:
        length += 1
        lps[k] = length
        k += 1
    elif length:
        length = lps[length - 1]
    else:
        lps[k] = 0
        k += 1
i = j = 0
found = []
while i < len(t):
    if t[i] == p[j]:
        i += 1
        j += 1
        if j == len(p):
            found.append(i - len(p))
            j = lps[j - 1]
    elif j:
        j = lps[j - 1]
    else:
        i += 1
print(' '.join(map(str, found)) if found else 'none')`),

  'rabin-karp': search(`d, q = 256, 101
h = pow(d, len(p) - 1, q)
ph = th = 0
for k in range(len(p)):
    ph = (d * ph + ord(p[k])) % q
    th = (d * th + ord(t[k])) % q
found = []
for s in range(len(t) - len(p) + 1):
    if ph == th and t[s:s + len(p)] == p:
        found.append(s)
    if s < len(t) - len(p):
        th = (d * (th - ord(t[s]) * h) + ord(t[s + len(p)])) % q
        th %= q
print(' '.join(map(str, found)) if found else 'none')`),

  bst: keyed(`values = [int(x) for x in ' '.join(rest).replace(',', ' ').split()]
target = int(keys['search'])
nodes = []
root = None
for key in values:
    if root is None:
        nodes.append([key, None, None])
        root = 0
        continue
    cur = root
    while True:
        node = nodes[cur]
        if key == node[0]:
            break
        side = 1 if key < node[0] else 2
        if node[side] is None:
            nodes.append([key, None, None])
            node[side] = len(nodes) - 1
            break
        cur = node[side]
cur = root
answer = 'not found'
while cur is not None:
    node = nodes[cur]
    if target == node[0]:
        answer = 'found'
        break
    cur = node[1] if target < node[0] else node[2]
print(answer)`),

  'tree-traversal': keyed(`values = [int(x) for x in ' '.join(rest).replace(',', ' ').split()]
nodes, root = [], None
for key in values:
    if root is None:
        nodes.append([key, None, None]); root = 0; continue
    cur = root
    while True:
        node = nodes[cur]
        if key == node[0]:
            break
        side = 1 if key < node[0] else 2
        if node[side] is None:
            nodes.append([key, None, None]); node[side] = len(nodes) - 1; break
        cur = node[side]

def walk(cur, order, out):
    if cur is None:
        return
    node = nodes[cur]
    if order == 'pre': out.append(node[0])
    walk(node[1], order, out)
    if order == 'in': out.append(node[0])
    walk(node[2], order, out)
    if order == 'post': out.append(node[0])

for order in ('pre', 'in', 'post'):
    out = []
    walk(root, order, out)
    print(' '.join(map(str, out)))
from collections import deque
q, out = deque([root]), []
while q:
    cur = q.popleft()
    node = nodes[cur]
    out.append(node[0])
    for child in (node[1], node[2]):
        if child is not None:
            q.append(child)
print(' '.join(map(str, out)))`),

  'n-queens': keyed(`n = int(keys.get('n', rest[0] if rest else 8))
mode = keys.get('mode', 'first').lower()
queens = [-1] * n
solutions = []

def safe(row, col):
    return all(c != col and abs(c - col) != row - r for r, c in enumerate(queens[:row]))

def solve(row):
    if row == n:
        solutions.append(queens[:])
        return mode != 'first'
    for col in range(n):
        if safe(row, col):
            queens[row] = col
            if solve(row + 1) is False:
                return False
    return True

solve(0)
print(len(solutions) if mode == 'all' else (' '.join(map(str, solutions[0])) if solutions else 'none'))`),

  gcd: keyed(`a, b = int(keys['a']), int(keys['b'])
while b:
    a, b = b, a % b
print(a)`),

  sieve: keyed(`n = int(keys['n'])
prime = [False, False] + [True] * (n - 1)
for p in range(2, int(n ** 0.5) + 1):
    if prime[p]:
        for m in range(p * p, n + 1, p):
            prime[m] = False
print(' '.join(str(p) for p in range(2, n + 1) if prime[p]))`),

  hanoi: keyed(`n = int(keys['n'])
print(2 ** n - 1)`),
};

/** Reads "key: value" lines and leaves the other lines in `rest`. */
function keyed(body) {
  return `import sys
keys, rest = {}, []
for raw in sys.stdin.read().splitlines():
    line = raw.split('#')[0].strip()
    if not line:
        continue
    head, sep, tail = line.partition(':')
    if sep and head.replace('_', '').isalpha():
        keys[head.strip().lower()] = tail.strip()
    else:
        rest.append(line)
${body}
`;
}

/** Edge list "A B [weight]" plus optional "start: A". Builds names, edges and adj. */
function graph(body, directed = false) {
  return keyed(`names, edges = [], []

def index(name):
    if name not in names:
        names.append(name)
    return names.index(name)

for line in rest:
    parts = line.split()
    if len(parts) == 1:
        index(parts[0])
        continue
    edges.append((index(parts[0]), index(parts[1]), int(parts[2]) if len(parts) > 2 else 1))
adj = [[] for _ in names]
for u, v, w in edges:
    adj[u].append((v, w))
${directed ? '' : '    adj[v].append((u, w))'}
${body}`);
}

function search(body) {
  return keyed(`t, p = keys['text'], keys['pattern']
${body}`);
}
