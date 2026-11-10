// Java samples. Every program is a class named Main and reads stdin.
const read = `import java.util.*;
public class Main {
    static String text;
    static Map<String, String> keys = new LinkedHashMap<>();
    static List<String> rest = new ArrayList<>();
    static void readAll() throws Exception { text = new String(System.in.readAllBytes()); }
    static void readKeyed() throws Exception {
        readAll();
        for (String raw : text.split("\\\\R")) {
            String line = raw.split("#", 2)[0].trim();
            if (line.isEmpty()) continue;
            int c = line.indexOf(':');
            String head = c < 0 ? "" : line.substring(0, c).trim();
            boolean key = !head.isEmpty() && head.chars().allMatch(ch -> Character.isLetter(ch) || ch == '_');
            if (key) keys.put(head.toLowerCase(), line.substring(c + 1).trim()); else rest.add(line);
        }
    }
    static int[] ints(String s) { return Arrays.stream(s.replace(',', ' ').trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray(); }
`;

const sort = (body) => `${read}
    public static void main(String[] args) throws Exception {
        readAll();
        int[] a = ints(text);
${body}
        System.out.println(Arrays.stream(a).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).orElse(""));
    }
}
`;

function graph(body, directed = false) {
  return `${read}
    public static void main(String[] args) throws Exception {
        readKeyed();
        List<String> names = new ArrayList<>();
        List<int[]> edges = new ArrayList<>();
        java.util.function.Function<String, Integer> index = name -> { int i = names.indexOf(name); if (i < 0) { names.add(name); i = names.size() - 1; } return i; };
        for (String line : rest) {
            String[] p = line.trim().split("\\\\s+");
            if (p.length == 1) { index.apply(p[0]); continue; }
            edges.add(new int[] { index.apply(p[0]), index.apply(p[1]), p.length > 2 ? Integer.parseInt(p[2]) : 1 });
        }
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < names.size(); i++) adj.add(new ArrayList<>());
        for (int[] e : edges) { adj.get(e[0]).add(new int[] { e[1], e[2] }); ${directed ? '' : 'adj.get(e[1]).add(new int[] { e[0], e[2] });'} }
${body}
    }
}
`;
}

export const java = {
  'bubble-sort': sort(`        for (int i = 0; i + 1 < a.length; i++) { // @1
            boolean swapped = false; // @2
            for (int j = 0; j + 1 + i < a.length; j++) { // @3
                if (a[j] > a[j + 1]) { // @4
                    int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; // @5
                    swapped = true; // @6
                }
            }
            if (!swapped) break; // @7
        }`),
  'selection-sort': sort(`        for (int i = 0; i + 1 < a.length; i++) { int m = i; for (int j = i + 1; j < a.length; j++) if (a[j] < a[m]) m = j; int t = a[i]; a[i] = a[m]; a[m] = t; }`),
  'insertion-sort': sort(`        for (int i = 1; i < a.length; i++) { int key = a[i], j = i - 1; while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; } a[j + 1] = key; }`),
  'shell-sort': sort(`        for (int gap = a.length / 2; gap > 0; gap /= 2) for (int i = gap; i < a.length; i++) { int temp = a[i], j = i; while (j >= gap && a[j - gap] > temp) { a[j] = a[j - gap]; j -= gap; } a[j] = temp; }`),
  'merge-sort': sort(`        class Rec { void merge(int lo, int hi) { if (lo >= hi) return; int mid = (lo + hi) / 2; merge(lo, mid); merge(mid + 1, hi);
            int[] m = new int[hi - lo + 1]; int i = lo, j = mid + 1, k = 0;
            while (i <= mid && j <= hi) m[k++] = a[i] <= a[j] ? a[i++] : a[j++];
            while (i <= mid) m[k++] = a[i++]; while (j <= hi) m[k++] = a[j++];
            System.arraycopy(m, 0, a, lo, m.length); } } new Rec().merge(0, a.length - 1);`),
  'quick-sort': sort(`        class Rec { void sort(int lo, int hi) { if (lo >= hi) return; int pivot = a[hi], i = lo;
            for (int j = lo; j < hi; j++) if (a[j] < pivot) { int t = a[i]; a[i] = a[j]; a[j] = t; i++; }
            int t = a[i]; a[i] = a[hi]; a[hi] = t; sort(lo, i - 1); sort(i + 1, hi); } } new Rec().sort(0, a.length - 1);`),
  'heap-sort': sort(`        class Rec { void sift(int i, int size) { for (;;) { int l = 2 * i + 1, r = 2 * i + 2, largest = i;
            if (l < size && a[l] > a[largest]) largest = l; if (r < size && a[r] > a[largest]) largest = r;
            if (largest == i) return; int t = a[i]; a[i] = a[largest]; a[largest] = t; i = largest; } } }
        Rec rec = new Rec(); int n = a.length; for (int i = n / 2 - 1; i >= 0; i--) rec.sift(i, n);
        for (int end = n - 1; end > 0; end--) { int t = a[0]; a[0] = a[end]; a[end] = t; rec.sift(0, end); }`),
  'radix-sort': sort(`        int top = Arrays.stream(a).max().orElse(0);
        for (int exp = 1; top / exp > 0; exp *= 10) { List<Integer>[] buckets = new List[10]; for (int b = 0; b < 10; b++) buckets[b] = new ArrayList<>();
            for (int v : a) buckets[(v / exp) % 10].add(v); int k = 0; for (List<Integer> b : buckets) for (int v : b) a[k++] = v; }`),
  'linear-search': `${read}
    public static void main(String[] args) throws Exception { readAll(); String[] lines = text.trim().split("\\\\R"); int[] a = ints(lines[0]); int target = Integer.parseInt(lines[1].split(":", 2)[1].trim()); int found = -1; for (int i = 0; i < a.length; i++) if (a[i] == target) { found = i; break; } System.out.println(found); }
}
`,
  'binary-search': `${read}
    public static void main(String[] args) throws Exception { readAll(); String[] lines = text.trim().split("\\\\R"); int[] a = ints(lines[0]); Arrays.sort(a); int target = Integer.parseInt(lines[1].split(":", 2)[1].trim());
        int lo = 0, hi = a.length - 1, found = -1; while (lo <= hi) { int mid = (lo + hi) / 2; if (a[mid] == target) { found = mid; break; } if (a[mid] < target) lo = mid + 1; else hi = mid - 1; } System.out.println(found); }
}
`,
  bfs: graph(`        int start = names.indexOf(keys.getOrDefault("start", names.get(0)));
        boolean[] seen = new boolean[names.size()]; ArrayDeque<Integer> q = new ArrayDeque<>(); q.add(start); seen[start] = true; List<String> order = new ArrayList<>();
        while (!q.isEmpty()) { int u = q.poll(); order.add(names.get(u)); for (int[] e : adj.get(u)) if (!seen[e[0]]) { seen[e[0]] = true; q.add(e[0]); } }
        System.out.println(String.join(" ", order));`),
  dfs: graph(`        int start = names.indexOf(keys.getOrDefault("start", names.get(0)));
        boolean[] seen = new boolean[names.size()]; List<String> order = new ArrayList<>();
        class Rec { void visit(int u) { seen[u] = true; order.add(names.get(u)); for (int[] e : adj.get(u)) if (!seen[e[0]]) visit(e[0]); } }
        new Rec().visit(start); System.out.println(String.join(" ", order));`),
  dijkstra: graph(`        final long INF = Long.MAX_VALUE / 4; int start = names.indexOf(keys.getOrDefault("start", names.get(0)));
        long[] dist = new long[names.size()]; Arrays.fill(dist, INF); dist[start] = 0; boolean[] used = new boolean[names.size()];
        for (int round = 0; round < names.size(); round++) { int u = -1; for (int i = 0; i < names.size(); i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
            if (dist[u] == INF) break; used[u] = true; for (int[] e : adj.get(u)) if (!used[e[0]] && dist[u] + e[1] < dist[e[0]]) dist[e[0]] = dist[u] + e[1]; }
        StringBuilder sb = new StringBuilder(); for (int i = 0; i < names.size(); i++) { if (i > 0) sb.append(' '); sb.append(names.get(i)).append('=').append(dist[i] >= INF ? "INF" : dist[i]); } System.out.println(sb);`),
  'bellman-ford': graph(`        final long INF = Long.MAX_VALUE / 4; int start = names.indexOf(keys.getOrDefault("start", names.get(0)));
        long[] dist = new long[names.size()]; Arrays.fill(dist, INF); dist[start] = 0;
        for (int round = 1; round < names.size(); round++) { boolean changed = false; for (int[] e : edges) if (dist[e[0]] < INF && dist[e[0]] + e[2] < dist[e[1]]) { dist[e[1]] = dist[e[0]] + e[2]; changed = true; } if (!changed) break; }
        boolean neg = false; for (int[] e : edges) if (dist[e[0]] < INF && dist[e[0]] + e[2] < dist[e[1]]) neg = true;
        if (neg) System.out.println("negative cycle"); else { StringBuilder sb = new StringBuilder(); for (int i = 0; i < names.size(); i++) { if (i > 0) sb.append(' '); sb.append(names.get(i)).append('=').append(dist[i] >= INF ? "INF" : dist[i]); } System.out.println(sb); }`, true),
  'floyd-warshall': graph(`        final long INF = Long.MAX_VALUE / 4; int n = names.size(); long[][] d = new long[n][n];
        for (int i = 0; i < n; i++) { Arrays.fill(d[i], INF); d[i][i] = 0; } for (int[] e : edges) d[e[0]][e[1]] = Math.min(d[e[0]][e[1]], e[2]);
        for (int k = 0; k < n; k++) for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
        for (int i = 0; i < n; i++) { StringBuilder sb = new StringBuilder(); for (int j = 0; j < n; j++) { if (j > 0) sb.append(' '); sb.append(d[i][j] > INF / 2 ? "INF" : d[i][j]); } System.out.println(sb); }`, true),
  prim: graph(`        final long INF = Long.MAX_VALUE / 4; int start = names.indexOf(keys.getOrDefault("start", names.get(0)));
        long[] key = new long[names.size()]; Arrays.fill(key, INF); key[start] = 0; boolean[] used = new boolean[names.size()]; long total = 0;
        for (int round = 0; round < names.size(); round++) { int u = -1; for (int i = 0; i < names.size(); i++) if (!used[i] && (u < 0 || key[i] < key[u])) u = i;
            if (key[u] == INF) break; used[u] = true; total += key[u]; for (int[] e : adj.get(u)) if (!used[e[0]] && e[1] < key[e[0]]) key[e[0]] = e[1]; }
        System.out.println(total);`),
  kruskal: graph(`        int[] parent = new int[names.size()]; for (int i = 0; i < parent.length; i++) parent[i] = i;
        class Find { int f(int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; } } Find find = new Find();
        edges.sort(Comparator.comparingInt(e -> e[2])); long total = 0;
        for (int[] e : edges) { int ru = find.f(e[0]), rv = find.f(e[1]); if (ru != rv) { parent[ru] = rv; total += e[2]; } }
        System.out.println(total);`),
  'topological-sort': graph(`        int[] indeg = new int[names.size()]; for (int[] e : edges) indeg[e[1]]++;
        ArrayDeque<Integer> q = new ArrayDeque<>(); for (int i = 0; i < names.size(); i++) if (indeg[i] == 0) q.add(i); List<String> order = new ArrayList<>();
        while (!q.isEmpty()) { int u = q.poll(); order.add(names.get(u)); for (int[] e : adj.get(u)) if (--indeg[e[0]] == 0) q.add(e[0]); }
        System.out.println(order.size() == names.size() ? String.join(" ", order) : "cycle");`, true),
  astar: `${read}
    public static void main(String[] args) throws Exception { readAll(); String[] rows = Arrays.stream(text.split("\\\\R")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
        int cols = rows[0].length(), start = -1, goal = -1; Set<Integer> walls = new HashSet<>();
        for (int r = 0; r < rows.length; r++) for (int c = 0; c < cols; c++) { int i = r * cols + c; char ch = rows[r].charAt(c); if (ch == 'S' || ch == 's') start = i; else if (ch == 'G' || ch == 'g') goal = i; else if (ch == '#') walls.add(i); }
        final int S = start, G = goal; java.util.function.IntUnaryOperator h = i -> Math.abs(i / cols - G / cols) + Math.abs(i % cols - G % cols);
        int[] g = new int[rows.length * cols]; Arrays.fill(g, 1_000_000_000); g[S] = 0; List<Integer> open = new ArrayList<>(); open.add(S); Set<Integer> closed = new HashSet<>(); String answer = "none";
        while (!open.isEmpty()) { int best = 0; for (int k = 1; k < open.size(); k++) { int x = open.get(k), y = open.get(best); if (g[x] + h.applyAsInt(x) < g[y] + h.applyAsInt(y) || (g[x] + h.applyAsInt(x) == g[y] + h.applyAsInt(y) && h.applyAsInt(x) < h.applyAsInt(y))) best = k; }
            int u = open.remove(best); if (u == G) { answer = Integer.toString(g[u]); break; } closed.add(u); int r = u / cols, c = u % cols; int[] dr = {-1, 0, 1, 0}, dc = {0, 1, 0, -1};
            for (int k = 0; k < 4; k++) { int vr = r + dr[k], vc = c + dc[k]; if (vr < 0 || vc < 0 || vr >= rows.length || vc >= cols) continue; int v = vr * cols + vc; if (walls.contains(v) || closed.contains(v)) continue; if (g[u] + 1 < g[v]) { g[v] = g[u] + 1; if (!open.contains(v)) open.add(v); } } }
        System.out.println(answer); }
}
`,
  fibonacci: `${read}
    public static void main(String[] args) throws Exception { readAll(); int n = Integer.parseInt(text.split(":", 2)[1].trim());
        java.math.BigInteger[] f = new java.math.BigInteger[n + 1]; f[0] = java.math.BigInteger.ZERO; if (n > 0) f[1] = java.math.BigInteger.ONE;
        for (int i = 2; i <= n; i++) f[i] = f[i - 1].add(f[i - 2]); System.out.println(f[n]); }
}
`,
  knapsack: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int[] w = ints(keys.get("weights")), v = ints(keys.get("values")); int cap = Integer.parseInt(keys.get("capacity"));
        int[][] k = new int[w.length + 1][cap + 1];
        for (int i = 1; i <= w.length; i++) for (int c = 0; c <= cap; c++) { k[i][c] = k[i - 1][c]; if (w[i - 1] <= c) k[i][c] = Math.max(k[i][c], k[i - 1][c - w[i - 1]] + v[i - 1]); }
        System.out.println(k[w.length][cap]); }
}
`,
  lcs: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); String x = keys.get("a"), y = keys.get("b"); int m = x.length(), n = y.length(); int[][] c = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++) c[i][j] = x.charAt(i - 1) == y.charAt(j - 1) ? c[i - 1][j - 1] + 1 : Math.max(c[i - 1][j], c[i][j - 1]);
        StringBuilder s = new StringBuilder(); int i = m, j = n; while (i > 0 && j > 0) { if (x.charAt(i - 1) == y.charAt(j - 1)) { s.insert(0, x.charAt(i - 1)); i--; j--; } else if (c[i - 1][j] >= c[i][j - 1]) i--; else j--; }
        System.out.println(s); }
}
`,
  'edit-distance': `${read}
    public static void main(String[] args) throws Exception { readKeyed(); String a = keys.get("a"), b = keys.get("b"); int m = a.length(), n = b.length(); int[][] d = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) d[i][0] = i; for (int j = 0; j <= n; j++) d[0][j] = j;
        for (int i = 1; i <= m; i++) for (int j = 1; j <= n; j++) d[i][j] = a.charAt(i - 1) == b.charAt(j - 1) ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], Math.min(d[i][j - 1], d[i - 1][j - 1]));
        System.out.println(d[m][n]); }
}
`,
  kmp: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); String t = keys.get("text"), p = keys.get("pattern"); int m = p.length(), n = t.length(); int[] lps = new int[m];
        int length = 0, k = 1; while (k < m) { if (p.charAt(k) == p.charAt(length)) lps[k++] = ++length; else if (length > 0) length = lps[length - 1]; else lps[k++] = 0; }
        List<Integer> found = new ArrayList<>(); int i = 0, j = 0;
        while (i < n) { if (t.charAt(i) == p.charAt(j)) { i++; j++; if (j == m) { found.add(i - m); j = lps[j - 1]; } } else if (j > 0) j = lps[j - 1]; else i++; }
        System.out.println(found.isEmpty() ? "none" : found.stream().map(String::valueOf).reduce((p2, q) -> p2 + " " + q).get()); }
}
`,
  'rabin-karp': `${read}
    public static void main(String[] args) throws Exception { readKeyed(); String t = keys.get("text"), p = keys.get("pattern"); int d = 256, q = 101, m = p.length(), n = t.length(), h = 1;
        for (int k = 0; k < m - 1; k++) h = (h * d) % q; int ph = 0, th = 0;
        for (int k = 0; k < m; k++) { ph = (d * ph + p.charAt(k)) % q; th = (d * th + t.charAt(k)) % q; }
        List<Integer> found = new ArrayList<>();
        for (int s = 0; s <= n - m; s++) { if (ph == th && t.substring(s, s + m).equals(p)) found.add(s); if (s < n - m) { th = (d * (th - t.charAt(s) * h) + t.charAt(s + m)) % q; if (th < 0) th += q; } }
        System.out.println(found.isEmpty() ? "none" : found.stream().map(String::valueOf).reduce((a, b) -> a + " " + b).get()); }
}
`,
  bst: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int[] values = ints(String.join(" ", rest)); int target = Integer.parseInt(keys.get("search"));
        List<int[]> nodes = new ArrayList<>(); int root = -1;
        for (int key : values) { if (root < 0) { nodes.add(new int[] { key, -1, -1 }); root = 0; continue; } int cur = root;
            for (;;) { int[] node = nodes.get(cur); if (key == node[0]) break; int side = key < node[0] ? 1 : 2; if (node[side] < 0) { nodes.add(new int[] { key, -1, -1 }); nodes.get(cur)[side] = nodes.size() - 1; break; } cur = node[side]; } }
        int cur = root; String answer = "not found"; while (cur >= 0) { int[] node = nodes.get(cur); if (target == node[0]) { answer = "found"; break; } cur = target < node[0] ? node[1] : node[2]; } System.out.println(answer); }
}
`,
  'tree-traversal': `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int[] values = ints(String.join(" ", rest)); List<int[]> nodes = new ArrayList<>(); int root = -1;
        for (int key : values) { if (root < 0) { nodes.add(new int[] { key, -1, -1 }); root = 0; continue; } int cur = root;
            for (;;) { int[] node = nodes.get(cur); if (key == node[0]) break; int side = key < node[0] ? 1 : 2; if (node[side] < 0) { nodes.add(new int[] { key, -1, -1 }); nodes.get(cur)[side] = nodes.size() - 1; break; } cur = node[side]; } }
        class Walk { void go(int cur, int order, List<Integer> out) { if (cur < 0) return; int[] node = nodes.get(cur); if (order == 0) out.add(node[0]); go(node[1], order, out); if (order == 1) out.add(node[0]); go(node[2], order, out); if (order == 2) out.add(node[0]); } }
        Walk walk = new Walk(); for (int order = 0; order < 3; order++) { List<Integer> out = new ArrayList<>(); walk.go(root, order, out); System.out.println(out.stream().map(String::valueOf).reduce((p, q) -> p + " " + q).orElse("")); }
        ArrayDeque<Integer> q = new ArrayDeque<>(); q.add(root); List<Integer> level = new ArrayList<>();
        while (!q.isEmpty()) { int[] node = nodes.get(q.poll()); level.add(node[0]); if (node[1] >= 0) q.add(node[1]); if (node[2] >= 0) q.add(node[2]); }
        System.out.println(level.stream().map(String::valueOf).reduce((p, r) -> p + " " + r).orElse("")); }
}
`,
  'n-queens': `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int n = Integer.parseInt(keys.getOrDefault("n", rest.isEmpty() ? "8" : rest.get(0))); String mode = keys.getOrDefault("mode", "first").toLowerCase();
        int[] queens = new int[n]; Arrays.fill(queens, -1); List<int[]> solutions = new ArrayList<>();
        class Solve { boolean safe(int row, int col) { for (int r = 0; r < row; r++) if (queens[r] == col || Math.abs(queens[r] - col) == row - r) return false; return true; }
            boolean go(int row) { if (row == n) { solutions.add(queens.clone()); return !mode.equals("first"); } for (int col = 0; col < n; col++) if (safe(row, col)) { queens[row] = col; if (!go(row + 1)) return false; } return true; } }
        new Solve().go(0); if (mode.equals("all")) System.out.println(solutions.size()); else if (solutions.isEmpty()) System.out.println("none"); else System.out.println(Arrays.stream(solutions.get(0)).mapToObj(String::valueOf).reduce((p, q) -> p + " " + q).get()); }
}
`,
  gcd: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int a = Integer.parseInt(keys.get("a")), b = Integer.parseInt(keys.get("b")); while (b != 0) { int r = a % b; a = b; b = r; } System.out.println(a); }
}
`,
  sieve: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int n = Integer.parseInt(keys.get("n")); boolean[] prime = new boolean[n + 1]; Arrays.fill(prime, true); prime[0] = prime[1] = false;
        for (int p = 2; p * p <= n; p++) if (prime[p]) for (int m = p * p; m <= n; m += p) prime[m] = false;
        StringBuilder sb = new StringBuilder(); for (int p = 2; p <= n; p++) if (prime[p]) { if (sb.length() > 0) sb.append(' '); sb.append(p); } System.out.println(sb); }
}
`,
  hanoi: `${read}
    public static void main(String[] args) throws Exception { readKeyed(); int n = Integer.parseInt(keys.get("n")); System.out.println((1L << n) - 1); }
}
`,
};
