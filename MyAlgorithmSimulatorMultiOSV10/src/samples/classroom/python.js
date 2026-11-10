// python samples for the classroom algorithms (src/algorithms/classroom.js).
// Each program reads the input box on stdin and prints exactly expectedOutput().

/** Reads "key: value" lines into `keys` and leaves the other lines in `rest`. */
function keyed(body) {
  return `import re, sys

keys, rest = {}, []
for raw in sys.stdin.read().splitlines():
    line = raw.split('#')[0].strip()
    if not line:
        continue
    head, sep, tail = line.partition(':')
    if sep and head.strip().replace('_', '').isalpha():
        keys[head.strip().lower()] = tail.strip()
    else:
        rest.append(line)


def numbers(text):
    """Integers separated by spaces or commas."""
    return [int(x) for x in re.split(r'[\\s,;]+', text) if x]

${body}
`;
}

/** Reads a grid of S G # . into rows, cols, start, goal, wall[] and neighbours(u). */
function grid(body) {
  return `import sys

rows = [line.strip() for line in sys.stdin.read().splitlines() if line.strip()]
R, C = len(rows), len(rows[0])
start = goal = -1
wall = [False] * (R * C)
for r in range(R):
    for c in range(C):
        ch, i = rows[r][c], r * C + c
        if ch in 'Ss':
            start = i
        elif ch in 'Gg':
            goal = i
        elif ch == '#':
            wall[i] = True


def neighbours(u):
    """The cells next to u, in the order up, right, down, left."""
    r, c = divmod(u, C)
    result = []
    for vr, vc in ((r - 1, c), (r, c + 1), (r + 1, c), (r, c - 1)):
        if 0 <= vr < R and 0 <= vc < C:
            result.append(vr * C + vc)
    return result

${body}
`;
}

export const python = {
  'grid-bfs': grid(`from collections import deque

dist = [-1] * (R * C)  # -1 = not seen yet
dist[start] = 0
queue = deque([start])  # @1
answer = 'none'
while queue:  # @2
    u = queue.popleft()  # @3
    if u == goal:  # @4
        answer = str(dist[u])
        break
    for v in neighbours(u):  # @5
        if not wall[v] and dist[v] == -1:  # @6
            dist[v] = dist[u] + 1  # @7
            queue.append(v)
print(answer)`),

  'greedy-best-first': grid(`def h(i):
    """Manhattan distance from cell i to the goal."""
    return abs(i // C - goal // C) + abs(i % C - goal % C)


parent = [-1] * (R * C)
seen = [False] * (R * C)
open_list = [start]
seen[start] = True  # @1
answer = 'none'
while open_list:  # @2
    best = 0
    for k in range(1, len(open_list)):  # @3
        if h(open_list[k]) < h(open_list[best]):  # strict: the earliest wins ties
            best = k
    u = open_list[best]
    if u == goal:  # @4
        length, x = 0, goal
        while x != start:  # follow parent back to the start
            x = parent[x]
            length += 1
        answer = str(length)
        break
    open_list.pop(best)  # @5
    for v in neighbours(u):  # @6
        if not wall[v] and not seen[v]:  # @7
            seen[v] = True
            parent[v] = u
            open_list.append(v)
print(answer)`),

  'maze-dfs': grid(`sys.setrecursionlimit(10000)
parent = [-1] * (R * C)
visited = [False] * (R * C)


def dfs(u):
    if u == goal:  # @1
        return True
    visited[u] = True  # @2
    for v in neighbours(u):  # @3
        if not wall[v] and not visited[v]:  # @4
            parent[v] = u  # @5
            if dfs(v):  # @6
                return True
    return False  # @7


if dfs(start):  # @0
    length, x = 0, goal
    while x != start:  # follow parent back to the start
        x = parent[x]
        length += 1
    print(length)
else:
    print('none')`),

  'subset-sum': keyed(`values = numbers(keys['values'])
target = int(keys['target'])
n = len(values)
taken = [False] * n


def solve(i, total):
    if total == target:  # @1
        return True
    if i == n:  # @2
        return False
    if total + values[i] <= target:  # @3
        taken[i] = True
        if solve(i + 1, total + values[i]):  # @4
            return True
        taken[i] = False  # @5
    return solve(i + 1, total)  # @6


if solve(0, 0):  # @0
    print(' '.join(str(values[i]) for i in range(n) if taken[i]))
else:
    print('none')`),

  permutations: keyed(`items = numbers(keys.get('items', ' '.join(rest)))
n = len(items)
used = [False] * n
cur = []


def permute():
    if len(cur) == n:  # @1
        print(' '.join(map(str, cur)))
        return
    for i in range(n):  # @2
        if used[i]:  # @3
            continue
        used[i] = True  # @4
        cur.append(items[i])
        permute()  # @5
        cur.pop()  # @6
        used[i] = False


permute()  # @0`),

  sudoku: `import re, sys

lines = [re.sub(r'[\\s|+-]', '', line) for line in sys.stdin.read().splitlines()]
lines = [line for line in lines if line]
grid = [0 if ch in '.0' else int(ch) for line in lines for ch in line]  # 81 cells, 0 = empty


def fits(i, d):
    """True when d is not in the row, column or 3x3 box of cell i (ignoring cell i)."""
    r, c = divmod(i, 9)
    for k in range(9):
        if grid[r * 9 + k] == d and r * 9 + k != i:
            return False
        if grid[k * 9 + c] == d and k * 9 + c != i:
            return False
    br, bc = r - r % 3, c - c % 3
    for y in range(br, br + 3):
        for x in range(bc, bc + 3):
            if grid[y * 9 + x] == d and y * 9 + x != i:
                return False
    return True


def solve():
    if 0 not in grid:  # @1
        return True
    i = grid.index(0)  # first empty cell in row-major order
    for d in range(1, 10):  # @2
        if fits(i, d):  # @3
            grid[i] = d  # @4
            if solve():  # @5
                return True
            grid[i] = 0  # @6
    return False  # @7


clash = any(grid[i] and not fits(i, grid[i]) for i in range(81))
if not clash and solve():  # @0
    for r in range(9):
        print(''.join(map(str, grid[r * 9:r * 9 + 9])))
else:
    print('none')
`,

  huffman: keyed(`text = keys.get('text', ' '.join(rest)).strip()
freq = {}
for ch in text:  # @1
    freq[ch] = freq.get(ch, 0) + 1

# Each node is [frequency, left child, right child, symbol]; leaves have no children.
nodes = [[f, None, None, ch] for ch, f in freq.items()]
queue = list(range(len(nodes)))  # @2


def pop_min():
    best = 0
    for k in range(1, len(queue)):
        if nodes[queue[k]][0] < nodes[queue[best]][0]:
            best = k
    return queue.pop(best)


while len(queue) > 1:  # @3
    x = pop_min()  # @4
    y = pop_min()
    nodes.append([nodes[x][0] + nodes[y][0], x, y, None])  # @5
    queue.append(len(nodes) - 1)  # @6

total = 0


def walk(i, depth):
    global total
    f, left, right, ch = nodes[i]
    if left is None:
        total += f * max(depth, 1)  # @8  (a lone symbol still needs 1 bit)
        return
    walk(left, depth + 1)  # @7  left edge = 0
    walk(right, depth + 1)  # right edge = 1


walk(queue[0], 0)
print(total)`),

  'fractional-knapsack': keyed(`weights = numbers(keys['weights'])
values = numbers(keys['values'])
room = int(keys['capacity'])
n = len(weights)
# Sort by value / weight, largest first (cross-multiplied, ties by index).
order = list(range(n))
for i in range(1, n):  # @1  insertion sort with an exact comparison
    j = i
    while j > 0 and values[order[j]] * weights[order[j - 1]] > values[order[j - 1]] * weights[order[j]]:
        order[j], order[j - 1] = order[j - 1], order[j]
        j -= 1

num, den = 0, 1  # the total value is num / den, kept exact
for i in order:  # @2
    if room == 0:
        break
    if weights[i] <= room:  # @3
        room -= weights[i]
        num += values[i] * den
    else:  # @4
        num = num * weights[i] + values[i] * room * den
        den *= weights[i]
        room = 0
        break

cents = (2 * 100 * num + den) // (2 * den)  # round half up to 2 decimals
print(f'{cents // 100}.{cents % 100:02d}')  # @5`),

  'job-sequencing': `import re, sys

jobs = []
for line in sys.stdin.read().splitlines():
    if line.strip():
        deadline, profit = [int(x) for x in re.split(r'[\\s,]+', line.strip())][:2]
        jobs.append((deadline, profit))

slots = max(d for d, p in jobs)
# Sort by profit, largest first; ties keep the input order.
order = sorted(range(len(jobs)), key=lambda i: (-jobs[i][1], i))  # @1
slot = [-1] * (slots + 1)  # slot[t] = job index, -1 = free
total = 0
for i in order:  # @2
    deadline, profit = jobs[i]
    for t in range(min(deadline, slots), 0, -1):  # @3
        if slot[t] == -1:  # @4
            slot[t] = i
            total += profit
            break
    # @5 (no free slot: the job is dropped)

print(' '.join('J' + str(j + 1) for j in slot[1:] if j != -1))  # @6
print(total)
`,

  'avl-tree': keyed(`values = numbers(keys.get('values', ' '.join(rest)))


class Node:
    def __init__(self, key):
        self.key, self.left, self.right, self.height = key, None, None, 1


def height(node):
    return node.height if node else 0


def fix(node):
    node.height = 1 + max(height(node.left), height(node.right))


def rotate_right(y):
    x = y.left
    y.left, x.right = x.right, y
    fix(y)
    fix(x)
    return x


def rotate_left(y):
    x = y.right
    y.right, x.left = x.left, y
    fix(y)
    fix(x)
    return x


def insert(node, key):
    if node is None:  # @1
        return Node(key)
    if key < node.key:  # @2
        node.left = insert(node.left, key)
    elif key > node.key:  # @3
        node.right = insert(node.right, key)
    else:  # @4
        return node
    fix(node)  # @5
    b = height(node.left) - height(node.right)
    if b > 1 and key < node.left.key:  # @6
        return rotate_right(node)
    if b < -1 and key > node.right.key:  # @7
        return rotate_left(node)
    if b > 1:  # @8
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1:  # @9
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node  # @10


def preorder(node, out):
    if node:
        out.append(str(node.key))
        preorder(node.left, out)
        preorder(node.right, out)


root = None
for key in values:
    root = insert(root, key)  # @0
result = []
preorder(root, result)
print(' '.join(result))`),

  'binary-heap': keyed(`values = numbers(keys.get('values', ' '.join(rest)))
extract = int(keys.get('extract', '1'))
a = []


def insert(x):  # @0
    a.append(x)  # @1
    i = len(a) - 1
    while i > 0 and a[(i - 1) // 2] > a[i]:  # @2
        p = (i - 1) // 2
        a[i], a[p] = a[p], a[i]  # @3
        i = p


def extract_min(n):  # @4
    """Takes the minimum out of the first n cells; the heap shrinks to n - 1."""
    smallest = a[0]  # @5
    a[0], a[n - 1] = a[n - 1], a[0]
    n -= 1
    i = 0
    while 2 * i + 1 < n:  # @6
        c = 2 * i + 1
        if c + 1 < n and a[c + 1] < a[c]:
            c += 1
        if not a[c] < a[i]:
            break
        a[i], a[c] = a[c], a[i]  # @7
        i = c
    return smallest  # @8


for x in values:
    insert(x)
print(' '.join(map(str, a)))
out = []
n = len(a)
for _ in range(extract):
    out.append(extract_min(n))
    n -= 1
print(' '.join(map(str, out)))`),

  trie: keyed(`words = [w for w in re.split(r'[\\s,]+', keys.get('words', '')) if w]
prefix = keys.get('find', '').strip()


class Node:
    def __init__(self):
        self.children = {}  # letter -> Node
        self.end = False


root = Node()
for word in words:
    node = root  # @1
    for ch in word:  # @2
        if ch not in node.children:  # @3
            node.children[ch] = Node()
        node = node.children[ch]  # @4
    node.end = True  # @5

found = []


def collect(node, text):
    if node.end:
        found.append(text)
    for ch in sorted(node.children):  # children a to z
        collect(node.children[ch], text + ch)


node = root
for ch in prefix:  # @7
    node = node.children.get(ch)
    if node is None:
        break
if node is not None:
    collect(node, prefix)  # @8
print(' '.join(found) if found else 'none')`),
};
